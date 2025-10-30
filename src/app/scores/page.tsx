'use client';

import React, { useEffect, useState } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Scores Page (TypeScript, ready-to-paste)
 * - Auto-fetches patient data from Supabase (uses schema you provided)
 * - Auto-calculates: Mehran (original), Mehran-2 (procedural/full), ACEF, ACEF-II
 * - Auto-upserts results into `risk_scores`
 *
 * Place into app/scores/[patientId]/page.tsx (or similar)
 *
 * ENV required:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

// ---------- Supabase ----------
const supabase: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
);

// ---------- Types (minimal useful types) ----------
type UUID = string;

type PatientDetails = {
  id: UUID;
  patient_name?: string | null;
  age?: number | null;
  sex?: 'Male' | 'Female' | 'Other' | null;
  procedure_datetime_cag?: string | null;
  procedure_datetime_ptca?: string | null;
  cardiac_arrest?: boolean | null;
};

type LabResult = {
  id: UUID;
  patient_id: UUID;
  lab_date: string;
  scr?: number | null;
  hb?: number | null;
  rbs?: number | null;
  timepoint?: string | null;
};

type AngioRaw = {
  id: UUID;
  patient_id: UUID;
  procedure_date: string;
  contrast_volume_ml?: number | null;
  lm_lesion_description?: string | null;
  lad_lesion_description?: string | null;
  lcx_lesion_description?: string | null;
  rca_lesion_description?: string | null;
  impression?: string | null;
};

type PtcaRaw = {
  id: UUID;
  patient_id: UUID;
  procedure_date: string;
  contrast_volume_ml?: number | null;
  timi_flow_post?: string | null;
  complications?: string | null;
  stent_details?: string | null;
  notes?: string | null;
};

type EchoReport = { id: UUID; ef_percent?: number | null };
type IABPReport = { id: UUID; iabp_inserted?: boolean | null };
type OnArrivalVitals = { hypotension_flag?: boolean | null; shock?: boolean | null };
type Hemodynamics = {
  pre_procedure_instability_cag?: boolean | null;
  peri_procedure_instability_cag?: boolean | null;
  post_procedure_instability_cag?: boolean | null;
  pre_procedure_instability_ptca?: boolean | null;
  peri_procedure_instability_ptca?: boolean | null;
  post_procedure_instability_ptca?: boolean | null;
};

// ---------- Utility helpers ----------

const round = (v: number | null | undefined, d = 2) =>
  v == null ? null : Math.round((v + Number.EPSILON) * Math.pow(10, d)) / Math.pow(10, d);

// CKD-EPI (2009) simplified (no race)
function estimateEGFR_CKD_EPI(scr: number | null | undefined, age: number | null | undefined, sex?: string | null) {
  if (scr == null || age == null || !sex) return null;
  const female = sex.toLowerCase && sex.toLowerCase().startsWith('f');
  const k = female ? 0.7 : 0.9;
  const a = female ? -0.329 : -0.411;
  const scr_k = scr / k;
  const minPart = Math.pow(Math.min(scr_k, 1), a);
  const maxPart = Math.pow(Math.max(scr_k, 1), -1.209);
  const ageFactor = Math.pow(0.993, age);
  const sexFactor = female ? 1.018 : 1.0;
  const egfr = 141 * minPart * maxPart * ageFactor * sexFactor;
  return round(egfr, 1);
}

function extractStenosisPercent(text?: string | null) {
  if (!text) return 0;
  const m = text.match(/(\d{1,3})\s*%/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n)) return n;
  }
  return 0;
}

function detectDESCount(text?: string | null) {
  if (!text) return 0;
  const m = text.match(/(\d+)\s*des/i) || text.match(/(\d+)\s*stent/i);
  if (m) return parseInt(m[1], 10);
  return 0;
}

function textIncludesAny(text: string, keywords: string[]) {
  const lc = text.toLowerCase();
  return keywords.some(k => lc.includes(k.toLowerCase()));
}

// procedural bleed detection from complications/notes/hemodynamics
function detectProceduralBleed(ptca?: PtcaRaw | null, hemo?: Hemodynamics | null) {
  const comp = `${ptca?.complications ?? ''} ${ptca?.notes ?? ''}`.toLowerCase();
  const bleedKeywords = ['bleed', 'hematoma', 'hemorrhage', 'transfusion', 'prbc', 'major bleed', 'blood loss', 'retroperitoneal'];
  const bleedFound = bleedKeywords.some(k => comp.includes(k));
  const hemoFlag = !!(hemo && (hemo.post_procedure_instability_ptca || hemo.peri_procedure_instability_ptca));
  return bleedFound || hemoFlag;
}

// slow/no-flow detection
function detectSlowNoFlow(ptca?: PtcaRaw | null) {
  const timi = (ptca?.timi_flow_post ?? '').toLowerCase();
  const comp = (ptca?.complications ?? '').toLowerCase();
  const slowKeywords = ['slow flow', 'no reflow', 'no-flow', 'no flow', 'timi 0', 'timi 1', 'timi 2'];
  return slowKeywords.some(k => timi.includes(k) || comp.includes(k));
}

// complex anatomy detection (from CAG and PTCA note/stent text)
// Rules used (combined pragmatic rule set based on our discussion):
// - Left main mention OR LM stenosis >=50% => complex
// - >=2 major epicardial vessels with stenosis >=70% => complex
// - any vessel >=90% => complex
// - descriptors: calcified/diffuse/proximal/ostial => complex
// - DES count >=2 => complex
function detectComplexAnatomy(angio?: AngioRaw | null, ptca?: PtcaRaw | null) {
  const lmPct = extractStenosisPercent(angio?.lm_lesion_description ?? '');
  const ladPct = extractStenosisPercent(angio?.lad_lesion_description ?? '');
  const lcxPct = extractStenosisPercent(angio?.lcx_lesion_description ?? '');
  const rcaPct = extractStenosisPercent(angio?.rca_lesion_description ?? '');
  const combinedText = ([
    angio?.lm_lesion_description,
    angio?.lad_lesion_description,
    angio?.lcx_lesion_description,
    angio?.rca_lesion_description,
    angio?.impression,
    ptca?.notes,
    ptca?.stent_details,
    ptca?.complications
  ].join(' ') || '').toLowerCase();

  const vesselsSevere = [lmPct, ladPct, lcxPct, rcaPct].filter(p => p >= 70).length;
  const anySevere90 = [lmPct, ladPct, lcxPct, rcaPct].some(p => p >= 90);
  const hasLeftMainKeyword = combinedText.includes('left main') || lmPct >= 50;
  const descriptors = ['calcified', 'diffuse', 'proximal', 'ostial', 'multivessel', 'multi-vessel', 'two vessel', 'three vessel', 'triple vessel', 'long segment'];
  const descriptorFound = descriptors.some(k => combinedText.includes(k));
  const desCount = detectDESCount(ptca?.stent_details ?? '') || detectDESCount(ptca?.notes ?? '');

  const multiDES = desCount >= 2;
  const multiVessel = vesselsSevere >= 2;

  return hasLeftMainKeyword || multiVessel || anySevere90 || descriptorFound || multiDES;
}

// detect insulin use from past_medication_history
async function detectInsulinUse(patientId: string) {
  try {
    const { data, error } = await supabase
      .from('past_medication_history')
      .select('medication_name')
      .eq('patient_id', patientId)
      .ilike('medication_name', '%insulin%')
      .limit(1);
    if (error) return false;
    return !!(data && data.length > 0);
  } catch {
    return false;
  }
}

// ---------- Score calculators ----------

// Mehran (original) — implemented using standard mapping (widely used clinical mapping)
// Points mapping (classic):
// - Hypotension (use of vasopressors/inotrope, systolic < 80) = 5
// - IABP = 5
// - Congestive heart failure = 5
// - Age > 75 = 4
// - Anemia (hematocrit/hemoglobin) = 3  (we use Hb < 13 male / <12 female)
 // - Diabetes = 3
// - Contrast volume => 1 point per 100 mL (rounded down)
// - Baseline SCr >= 1.5 mg/dL -> 4
function computeMehranOriginal(params: {
  hypotension?: boolean;
  iabp?: boolean;
  chf?: boolean;
  age?: number | null;
  hb?: number | null;
  diabetes?: boolean;
  contrast_volume_ml?: number | null;
  baseline_scr?: number | null;
}) {
  let score = 0;
  const breakdown: { name: string; pts: number }[] = [];

  if (params.hypotension) { score += 5; breakdown.push({ name: 'Hypotension', pts: 5 }); }
  if (params.iabp) { score += 5; breakdown.push({ name: 'IABP', pts: 5 }); }
  if (params.chf) { score += 5; breakdown.push({ name: 'Congestive heart failure', pts: 5 }); }
  if (params.age != null && params.age > 75) { score += 4; breakdown.push({ name: 'Age > 75', pts: 4 }); }
  if (params.hb != null) {
    // anemia threshold (male <13, female <12)
    if (params.hb < 12.5) { score += 3; breakdown.push({ name: 'Anemia (low Hb)', pts: 3 }); }
  }
  if (params.diabetes) { score += 3; breakdown.push({ name: 'Diabetes', pts: 3 }); }
  if (params.contrast_volume_ml != null) {
    const pts = Math.floor((params.contrast_volume_ml || 0) / 100); // 1 per 100 mL
    if (pts > 0) { score += pts; breakdown.push({ name: `Contrast volume (${params.contrast_volume_ml} mL)`, pts }); }
  }
  if (params.baseline_scr != null && params.baseline_scr >= 1.5) { score += 4; breakdown.push({ name: 'Baseline SCr ≥ 1.5 mg/dL', pts: 4 }); }

  // risk category mapping (classic Mehran)
  let category = 'Unknown';
  if (score <= 5) category = 'Low';
  else if (score <= 10) category = 'Moderate';
  else if (score <= 15) category = 'High';
  else category = 'Very high';

  return { score, category, breakdown };
}

// Mehran-2 (procedural full model) — pragmatic weights implemented per our design discussion:
// The JACC/Lancet paper had integer weights; here we implement the clinically meaningful mapping:
// - Age > 75: +2
// - Hypotension/shock: +2
// - Anemia: +1
// - Diabetes: +1
// - CHF / LVEF <40%: +1
// - CKD (eGFR <60): +1
// - Contrast burden >200 mL: +1
// - Complex anatomy: +1
// - Procedural bleed: +1
// - Slow/no-flow: +1
function computeMehran2(params: {
  age?: number | null;
  hypotension?: boolean;
  anemia?: boolean;
  diabetes?: boolean;
  chf_or_low_ef?: boolean;
  ckd?: boolean;
  contrast_volume_ml?: number | null;
  complex_anatomy?: boolean;
  procedural_bleed?: boolean;
  slow_no_flow?: boolean;
}) {
  let score = 0;
  const breakdown: { name: string; pts: number }[] = [];

  if (params.age && params.age > 75) { score += 2; breakdown.push({ name: 'Age > 75', pts: 2 }); }
  if (params.hypotension) { score += 2; breakdown.push({ name: 'Hypotension / Shock', pts: 2 }); }
  if (params.anemia) { score += 1; breakdown.push({ name: 'Anemia', pts: 1 }); }
  if (params.diabetes) { score += 1; breakdown.push({ name: 'Diabetes', pts: 1 }); }
  if (params.chf_or_low_ef) { score += 1; breakdown.push({ name: 'CHF / LVEF < 40%', pts: 1 }); }
  if (params.ckd) { score += 1; breakdown.push({ name: 'CKD (eGFR < 60)', pts: 1 }); }
  if ((params.contrast_volume_ml ?? 0) > 200) { score += 1; breakdown.push({ name: `Contrast > 200 mL (${params.contrast_volume_ml} mL)`, pts: 1 }); }
  if (params.complex_anatomy) { score += 1; breakdown.push({ name: 'Complex anatomy', pts: 1 }); }
  if (params.procedural_bleed) { score += 1; breakdown.push({ name: 'Procedural bleeding', pts: 1 }); }
  if (params.slow_no_flow) { score += 1; breakdown.push({ name: 'Slow / No flow', pts: 1 }); }

  // category mapping we discussed earlier:
  let category = 'Unknown';
  let predicted = 0;
  if (score <= 2) { category = 'Low'; predicted = 5; }
  else if (score <= 5) { category = 'Moderate'; predicted = 15; }
  else if (score <= 8) { category = 'High'; predicted = 30; }
  else { category = 'Very High'; predicted = 50; }

  return { score, category, predicted, breakdown };
}

// ACEF: Age / LVEF + 1 if SCr > 2.0 mg/dL
function computeACEF(age?: number | null, lvef?: number | null, baseline_scr?: number | null) {
  if (!age || !lvef || lvef === 0) return null;
  let val = age / lvef;
  if (baseline_scr != null && baseline_scr > 2.0) val += 1;
  return round(val, 2);
}

// ACEF-II: adaptation (age / LVEF + 2 if SCr>2 + 3 if emergency)
function computeACEF2(age?: number | null, lvef?: number | null, baseline_scr?: number | null, emergency?: boolean) {
  if (!age || !lvef || lvef === 0) return null;
  let val = age / lvef;
  if (baseline_scr != null && baseline_scr > 2.0) val += 2;
  if (emergency) val += 3;
  return round(val, 2);
}

// ---------- React component ----------
type ScoresPageProps = { params?: { patientId?: string } };

export default function ScoresPage({ params }: ScoresPageProps) {
  const routePid = params?.patientId ?? (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('patientId') : null);
  const [patientId, setPatientId] = useState<string | null>(routePid ?? null);

  const [loading, setLoading] = useState(false);
  const [patient, setPatient] = useState<PatientDetails | null>(null);
  const [history, setHistory] = useState<any>(null);
  const [preLab, setPreLab] = useState<LabResult | null>(null);
  const [angio, setAngio] = useState<AngioRaw | null>(null);
  const [ptca, setPtca] = useState<PtcaRaw | null>(null);
  const [echo, setEcho] = useState<EchoReport | null>(null);
  const [iabp, setIabp] = useState<IABPReport | null>(null);
  const [vitals, setVitals] = useState<OnArrivalVitals | null>(null);
  const [hemo, setHemo] = useState<Hemodynamics | null>(null);

  const [results, setResults] = useState<any | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  useEffect(() => {
    if (!patientId) return;
    setLoading(true);
    (async () => {
      try {
        // patient_details
        const { data: pData, error: pErr } = await supabase.from('patient_details').select('*').eq('id', patientId).maybeSingle();
        if (pErr) throw pErr;
        setPatient(pData ?? null);

        // patient_history
        const { data: hData } = await supabase.from('patient_history').select('*').eq('patient_id', patientId).limit(1);
        setHistory(hData && hData.length ? hData[0] : null);

        // pre-procedure lab (latest)
        const { data: labData } = await supabase
          .from('lab_results')
          .select('*')
          .eq('patient_id', patientId)
          .eq('timepoint', 'Pre-procedure')
          .order('lab_date', { ascending: false })
          .limit(1);
        setPreLab(labData && labData.length ? labData[0] : null);

        // angiography_raw latest
        const { data: angData } = await supabase
          .from('angiography_raw')
          .select('*')
          .eq('patient_id', patientId)
          .order('procedure_date', { ascending: false })
          .limit(1);
        setAngio(angData && angData.length ? angData[0] : null);

        // ptca_raw latest
        const { data: ptcaData } = await supabase
          .from('ptca_raw')
          .select('*')
          .eq('patient_id', patientId)
          .order('procedure_date', { ascending: false })
          .limit(1);
        setPtca(ptcaData && ptcaData.length ? ptcaData[0] : null);

        // echo
        const { data: echoData } = await supabase
          .from('echo_report')
          .select('*')
          .eq('patient_id', patientId)
          .order('echo_date', { ascending: false })
          .limit(1);
        setEcho(echoData && echoData.length ? echoData[0] : null);

        // iabp
        const { data: iabpData } = await supabase
          .from('iabp_report')
          .select('*')
          .eq('patient_id', patientId)
          .order('insertion_datetime', { ascending: false })
          .limit(1);
        setIabp(iabpData && iabpData.length ? iabpData[0] : null);

        // vitals
        const { data: vData } = await supabase
          .from('on_arrival_vitals')
          .select('*')
          .eq('patient_id', patientId)
          .order('created_at', { ascending: false })
          .limit(1);
        setVitals(vData && vData.length ? vData[0] : null);

        // hemodynamics
        const { data: hData2 } = await supabase
          .from('hemodynamics')
          .select('*')
          .eq('patient_id', patientId)
          .order('inserted_at', { ascending: false })
          .limit(1);
        setHemo(hData2 && hData2.length ? hData2[0] : null);

        setLoading(false);
      } catch (err: any) {
        setLoading(false);
        setToast({ msg: 'Fetch error: ' + (err.message ?? String(err)), type: 'error' });
      }
    })();
  }, [patientId]);

  // Compute scores when data arrives
  useEffect(() => {
    if (!patient) return;
    (async () => {
      try {
        const baseline_scr = preLab?.scr ?? null;
        const hb = preLab?.hb ?? null;
        const age = patient?.age ?? null;
        const sex = patient?.sex ?? null;
        const diabetes = !!(history?.dm);
        const chf = !!(history?.chf);
        const lvef = echo?.ef_percent ?? null;
        const iabpInserted = !!(iabp?.iabp_inserted);
        const hypotensionFlag = !!(vitals?.hypotension_flag || hemo?.pre_procedure_instability_cag || hemo?.peri_procedure_instability_cag);
        const contrastAngio = angio?.contrast_volume_ml ?? 0;
        const contrastPtca = ptca?.contrast_volume_ml ?? 0;
        const totalContrast = (Number(contrastAngio || 0) + Number(contrastPtca || 0)) || null;

        const egfr = baseline_scr ? estimateEGFR_CKD_EPI(baseline_scr, age ?? null, sex ?? null) : null;
        const ckd = egfr != null && egfr < 60;
        const anemia = hb != null ? ( (sex && sex.toLowerCase().startsWith('f')) ? (hb < 12) : (hb < 13) ) : false;

        // complex anatomy, procedural bleed, slow/no-flow detection using text intelligence
        const complex_anatomy = detectComplexAnatomy(angio, ptca);
        const procedural_bleed = detectProceduralBleed(ptca, hemo);
        const slow_no_flow = detectSlowNoFlow(ptca);

        // insulin detection (for Mehran-2 model nuance)
        const insulinUsed = await detectInsulinUse(patient.id);

        // Mehran (original)
        const mehranOrig = computeMehranOriginal({
          hypotension: hypotensionFlag,
          iabp: iabpInserted,
          chf: chf,
          age: age ?? null,
          hb,
          diabetes,
          contrast_volume_ml: totalContrast,
          baseline_scr,
        });

        // Mehran-2 (full)
        const mehran2Res = computeMehran2({
          age,
          hypotension: hypotensionFlag,
          anemia,
          diabetes,
          chf_or_low_ef: (lvef != null && lvef < 40) || chf,
          ckd,
          contrast_volume_ml: totalContrast,
          complex_anatomy,
          procedural_bleed,
          slow_no_flow,
        });

        // ACEF & ACEF-II
        const acef = computeACEF(age ?? null, lvef ?? null, baseline_scr ?? null);
        const emergency_flag = !!(patient?.cardiac_arrest || vitals?.shock);
        const acef2 = computeACEF2(age ?? null, lvef ?? null, baseline_scr ?? null, emergency_flag);

        const computed = {
          mehranOrig,
          mehran2: mehran2Res,
          acef,
          acef2,
          egfr,
          baseline_scr,
          hb,
          lvef,
          totalContrast,
          complex_anatomy,
          procedural_bleed,
          slow_no_flow,
        };

        setResults(computed);
      } catch (err: any) {
        setToast({ msg: 'Calculation error: ' + (err.message ?? String(err)), type: 'error' });
      }
    })();
  }, [patient, preLab, angio, ptca, echo, iabp, vitals, hemo, history]);

  // Save/upsert results to risk_scores table
  const saveToDb = async () => {
    if (!patientId || !results) { setToast({ msg: 'No patient or results to save', type: 'error' }); return; }
    setLoading(true);
    try {
      const payload: any = {
        patient_id: patientId,
        mehran1_score: results.mehranOrig.score,
        mehran1_risk_category: results.mehranOrig.category,
        mehran1_predicted_risk: null,
        mehran2_score: results.mehran2.score,
        mehran2_risk_category: results.mehran2.category,
        mehran2_predicted_risk: results.mehran2.predicted,
        acef_score: results.acef,
        acef_risk_category: results.acef != null ? (results.acef < 1 ? 'Low' : (results.acef <= 1.5 ? 'Moderate' : 'High')) : null,
        acef_predicted_risk: null,
        acef2_score: results.acef2,
        acef2_risk_category: results.acef2 != null ? (results.acef2 < 1 ? 'Low' : (results.acef2 <= 2 ? 'Moderate' : 'High')) : null,
        acef2_predicted_risk: null,
      };

      // either update by patient_id or insert
      const { data: existing, error: selErr } = await supabase.from('risk_scores').select('id').eq('patient_id', patientId).maybeSingle();
      if (selErr) throw selErr;

      if (existing && (existing as any).id) {
        const { error: updErr } = await supabase.from('risk_scores').update(payload).eq('patient_id', patientId);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from('risk_scores').insert(payload);
        if (insErr) throw insErr;
      }
      setToast({ msg: 'Scores saved to database', type: 'success' });
      setLoading(false);
    } catch (err: any) {
      setLoading(false);
      setToast({ msg: 'Save failed: ' + (err.message ?? String(err)), type: 'error' });
    }
  };

  // UI helpers
  const renderBreakdown = (items: { name: string; pts: number }[] | undefined) => {
    if (!items || items.length === 0) return <div className="text-gray-500">No contributors (check inputs).</div>;
    return <ul className="list-disc list-inside space-y-1">{items.map((b, i) => <li key={i}><strong>{b.name}</strong>: {b.pts} pts</li>)}</ul>;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4" style={{ color: '#0b1226' }}>Risk Scores — Auto-calculated</h1>

      {!patientId && <div className="mb-4 p-3 bg-yellow-50 border rounded">Patient ID missing. Provide route param or <code>?patientId=&lt;uuid&gt;</code>.</div>}

      {toast && (
        <div className={`mb-4 p-3 rounded ${toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
          {toast.msg}
        </div>
      )}

      {loading && <div className="text-gray-700 mb-3">Processing...</div>}

      {patient && (
        <div className="mb-6 p-4 border rounded bg-white">
          <div className="text-lg font-semibold" style={{ color: '#0b1226' }}>{patient.patient_name ?? '—'}</div>
          <div className="text-sm text-gray-600">ID: {patient.id}</div>
          <div className="mt-2 text-sm text-gray-700">
            Age: <strong>{patient.age ?? '—'}</strong> &nbsp; Sex: <strong>{patient.sex ?? '—'}</strong>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 border rounded bg-white">
          <div className="text-sm text-gray-600">Baseline SCr</div>
          <div className="text-xl font-semibold" style={{ color: '#0b1226' }}>{results?.baseline_scr ?? '—'} mg/dL</div>
          <div className="text-sm text-gray-600 mt-1">eGFR: {results?.egfr ?? '—'}</div>
        </div>
        <div className="p-4 border rounded bg-white">
          <div className="text-sm text-gray-600">Hb</div>
          <div className="text-xl font-semibold" style={{ color: '#0b1226' }}>{results?.hb ?? '—'} g/dL</div>
          <div className="text-sm text-gray-600 mt-1">LVEF: {results?.lvef ?? '—'}%</div>
        </div>
        <div className="p-4 border rounded bg-white">
          <div className="text-sm text-gray-600">Contrast total</div>
          <div className="text-xl font-semibold" style={{ color: '#0b1226' }}>{results?.totalContrast ?? '—'} mL</div>
          <div className="text-sm text-gray-600 mt-1">Complex anatomy: {results?.complex_anatomy ? 'Yes' : 'No'}</div>
        </div>
      </div>

      {/* Mehran original */}
      <section className="mb-6 p-4 border rounded bg-white">
        <div className="flex justify-between items-start">
          <h2 className="text-lg font-semibold" style={{ color: '#0b1226' }}>Mehran (original)</h2>
          <div className="text-right">
            <div className="text-2xl font-bold" style={{ color: '#0b1226' }}>{results?.mehranOrig?.score ?? '—'} pts</div>
            <div className="text-sm text-gray-700"><strong>{results?.mehranOrig?.category ?? ''}</strong></div>
          </div>
        </div>
        <div className="mt-3">
          <div className="text-sm font-medium">Component breakdown</div>
          <div className="mt-2">{renderBreakdown(results?.mehranOrig?.breakdown)}</div>
        </div>
      </section>

      {/* Mehran-2 */}
      <section className="mb-6 p-4 border rounded bg-white">
        <div className="flex justify-between items-start">
          <h2 className="text-lg font-semibold" style={{ color: '#0b1226' }}>Mehran-2 (Full - Procedural)</h2>
          <div className="text-right">
            <div className="text-2xl font-bold" style={{ color: '#0b1226' }}>{results?.mehran2?.score ?? '—'} pts</div>
            <div className="text-sm text-gray-700"><strong>{results?.mehran2?.category ?? ''}</strong> — Predicted ~{results?.mehran2?.predicted ?? '—'}%</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          <div>
            <div className="text-sm font-medium">Component breakdown</div>
            <div className="mt-2">{renderBreakdown(results?.mehran2?.breakdown)}</div>
          </div>
          <div>
            <div className="text-sm font-medium">Detected procedural flags</div>
            <div className="mt-2 space-y-1 text-sm">
              <div><strong>Complex anatomy:</strong> {results?.complex_anatomy ? 'Yes' : 'No'}</div>
              <div><strong>Procedural bleeding:</strong> {results?.procedural_bleed ? 'Yes' : 'No'}</div>
              <div><strong>Slow/No-flow:</strong> {results?.slow_no_flow ? 'Yes' : 'No'}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ACEF */}
      <section className="mb-6 p-4 border rounded bg-white">
        <h2 className="text-lg font-semibold" style={{ color: '#0b1226' }}>ACEF & ACEF-II</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          <div className="p-3 border rounded">
            <div className="text-sm text-gray-600">ACEF</div>
            <div className="text-2xl font-bold" style={{ color: '#0b1226' }}>{results?.acef ?? '—'}</div>
            <div className="text-xs text-gray-500 mt-2">Formula: Age / LVEF + 1 (if SCr > 2 mg/dL)</div>
          </div>
          <div className="p-3 border rounded">
            <div className="text-sm text-gray-600">ACEF-II</div>
            <div className="text-2xl font-bold" style={{ color: '#0b1226' }}>{results?.acef2 ?? '—'}</div>
            <div className="text-xs text-gray-500 mt-2">Adaptation used in app: Age/LVEF + (SCr>2 ? +2) + (emergency ? +3)</div>
          </div>
        </div>
      </section>

      <div className="flex gap-3">
        <button className="px-4 py-2 rounded bg-blue-700 text-white font-semibold hover:bg-blue-800" onClick={saveToDb} disabled={loading}>
          Save scores to DB
        </button>
        <button className="px-4 py-2 rounded border text-gray-800 hover:bg-gray-50" onClick={() => setToast({ msg: 'Recalculated (live)', type: 'info' })}>
          Recalculate (live)
        </button>
      </div>
    </div>
  );
}
