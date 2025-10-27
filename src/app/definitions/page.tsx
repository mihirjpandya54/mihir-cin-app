'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// ---------- Supabase client ----------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---------- Types ----------
type Patient = {
  id: string;
  patient_name: string;
  ipd_number: string;
  procedure_datetime_cag: string | null;   // timestamp or null
  procedure_datetime_ptca: string | null;  // timestamp or null
};

type LabRow = {
  id: string;
  lab_date: string | null;      // date string (YYYY-MM-DD) possibly
  scr?: number | null;
  created_at?: string | null;   // timestamp if available
};

type FluidRow = {
  id: string;
  fluid_date: string | null;    // date string
  output_ml?: number | null;
  inserted_at?: string | null;
};

type CinRow = {
  id?: string | null;
  patient_id: string;
  procedure_type: 'CAG' | 'PTCA';
  cin_kdigo?: boolean | null;
  kdigo_stage?: string | null;
  cin_esur?: boolean | null;
  cin_ncdr?: boolean | null;
  cin_acr?: boolean | null;
  dialysis_initiated?: boolean | null;
  urine_output_low?: boolean | null;
  calculated_at?: string | null;
};

// ---------- Helpers ----------
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const HOURS = 1000 * 60 * 60;
const MS = 1000;

function toTimestamp(rowDate?: string | null, fallbackTime = 'T00:00:00') {
  if (!rowDate) return null;
  // if rowDate looks like an ISO timestamp -> use as is
  if (rowDate.includes('T')) return new Date(rowDate).getTime();
  // otherwise treat as date-only
  return new Date(rowDate + fallbackTime).getTime();
}

function clamp(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Number(n);
}

// classify timing label used elsewhere if needed (kept for consistent UI)
function classifyTimingLabel(dateISO: string, procISO: string | null, tag: 'CAG' | 'PTCA') {
  if (!procISO) return null;
  const sel = new Date(dateISO + 'T00:00:00');
  const proc = new Date(procISO);
  const procDate = new Date(proc.getFullYear(), proc.getMonth(), proc.getDate());
  const diff = Math.round((sel.getTime() - procDate.getTime()) / (24 * 60 * 60 * 1000));
  if (diff < 0) return `Pre ${tag}`;
  if (diff === 0) return `0–24 ${tag}`;
  if (diff === 1) return `48 ${tag}`;
  if (diff === 2) return `72 ${tag}`;
  return null;
}

const chipClass = (label: string | null) => {
  if (!label) return 'bg-gray-200 text-gray-900 border-gray-400';
  if (label.startsWith('Pre')) return 'bg-green-200 text-green-900 border-green-600';
  if (label.startsWith('0–24')) return 'bg-yellow-200 text-yellow-900 border-yellow-600';
  if (label.startsWith('48')) return 'bg-orange-200 text-orange-900 border-orange-600';
  if (label.startsWith('72')) return 'bg-red-200 text-red-900 border-red-600';
  return 'bg-gray-200 text-gray-900 border-gray-400';
};

// ---------- Component ----------
export default function DefinitionsPage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [labs, setLabs] = useState<LabRow[]>([]);
  const [fluids, setFluids] = useState<FluidRow[]>([]);
  const [cinRows, setCinRows] = useState<CinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // load active patient, patient details, labs, fluids, existing cin rows
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const userId = '00000000-0000-0000-0000-000000000001';
        const { data: active } = await supabase
          .from('active_patient')
          .select('patient_id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!active?.patient_id) {
          setLoading(false);
          return;
        }

        const patientId = active.patient_id;

        // patient details
        const { data: p } = await supabase
          .from('patient_details')
          .select('id, patient_name, ipd_number, procedure_datetime_cag, procedure_datetime_ptca')
          .eq('id', patientId)
          .single();
        if (p) setPatient(p);

        // labs (we'll fetch all SCr labs for this patient)
        const { data: labData } = await supabase
          .from('lab_results')
          .select('id, lab_date, scr, created_at')
          .eq('patient_id', patientId)
          .order('lab_date', { ascending: true });

        setLabs((labData || []).map((l: any) => ({
          id: l.id,
          lab_date: l.lab_date,
          scr: clamp(l.scr),
          created_at: l.created_at
        })));

        // fluids
        const { data: fluidData } = await supabase
          .from('fluid_chart')
          .select('id, fluid_date, output_ml, inserted_at')
          .eq('patient_id', patientId)
          .order('fluid_date', { ascending: true });

        setFluids((fluidData || []).map((f: any) => ({
          id: f.id,
          fluid_date: f.fluid_date,
          output_ml: clamp(f.output_ml),
          inserted_at: f.inserted_at
        })));

        // existing cin_definitions rows for this patient (CAG & PTCA)
        const { data: cinData } = await supabase
          .from('cin_definitions')
          .select('*')
          .eq('patient_id', patientId);

        setCinRows((cinData || []) as CinRow[]);
      } catch (err) {
        console.error('load data err', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Utilities to convert lab/fluid row -> timestamp (ms)
  function rowTimestampLab(l: LabRow) {
    // prefer created_at if present
    if (l.created_at) return new Date(l.created_at).getTime();
    if (l.lab_date) return new Date(l.lab_date + 'T00:00:00').getTime();
    return null;
  }
  function rowTimestampFluid(f: FluidRow) {
    if (f.inserted_at) return new Date(f.inserted_at).getTime();
    if (f.fluid_date) return new Date(f.fluid_date + 'T00:00:00').getTime();
    return null;
  }

  // Given procedure time (ISO timestamp string), compute all calc values for that procedure
  function computeForProcedure(procISO: string, procTag: 'CAG' | 'PTCA', otherProcISO?: string | null) {
    const procTs = new Date(procISO).getTime();

    // baseline selection:
    // For CAG: baseline = latest lab strictly before procTs
    // For PTCA: if another procedure exists (CAG) and PTCA within 24h of CAG -> use pre-CAG baseline
    // else baseline = latest lab strictly before PTCA time
    let baselineLab: LabRow | null = null;

    if (procTag === 'PTCA' && otherProcISO) {
      // if PTCA and there's CAG -> check gap
      const otherTs = new Date(otherProcISO).getTime();
      const deltaHours = Math.abs(procTs - otherTs) / HOURS;
      if (deltaHours <= 24) {
        // treat baseline as latest lab before earliest procedure (i.e., pre-CAG)
        const earliestTs = Math.min(procTs, otherTs);
        const beforeLab = labs.filter(l => {
          const t = rowTimestampLab(l);
          return t !== null && t < earliestTs && l.scr != null;
        }).sort((a,b) => (rowTimestampLab(b) || 0) - (rowTimestampLab(a) || 0))[0];
        baselineLab = beforeLab || null;
      } else {
        // staged >24h -> baseline before PTCA specifically
        const beforeLab = labs.filter(l => {
          const t = rowTimestampLab(l);
          return t !== null && t < procTs && l.scr != null;
        }).sort((a,b) => (rowTimestampLab(b) || 0) - (rowTimestampLab(a) || 0))[0];
        baselineLab = beforeLab || null;
      }
    } else {
      // default: baseline = latest lab before procTs
      const beforeLab = labs.filter(l => {
        const t = rowTimestampLab(l);
        return t !== null && t < procTs && l.scr != null;
      }).sort((a,b) => (rowTimestampLab(b) || 0) - (rowTimestampLab(a) || 0))[0];
      baselineLab = beforeLab || null;
    }

    const baselineScr = baselineLab?.scr ?? null;

    // helper to get peak SCr inside [startHours, endHours) after procTs
    function peakScrInWindow(startHours: number, endHours: number) {
      const start = procTs + startHours * HOURS;
      const end = procTs + endHours * HOURS;
      const scrs = labs
        .map(l => ({ ...l, ts: rowTimestampLab(l) }))
        .filter(l => l.ts !== null && l.scr != null && l.ts > start && l.ts <= end)
        .map(l => Number(l.scr));
      if (scrs.length === 0) return null;
      return Math.max(...scrs);
    }

    // peaks
    const peak0_24 = peakScrInWindow(0, 24);
    const peak24_48 = peakScrInWindow(24, 48);
    const peak48_72 = peakScrInWindow(48, 72);
    // peak within 0-48 and 0-72 and 0-7d
    const peak0_48 = [peak0_24, peak24_48].filter(x=>x!=null) as number[];
    const peak0_48_val = peak0_48.length ? Math.max(...peak0_48) : null;
    const peak0_72 = [peak0_24, peak24_48, peak48_72].filter(x=>x!=null) as number[];
    const peak0_72_val = peak0_72.length ? Math.max(...peak0_72) : null;

    // 7-day peak (use labs within 7*24h)
    const start7 = procTs;
    const end7 = procTs + 7 * 24 * HOURS;
    const scrs7 = labs
      .map(l => ({ ...l, ts: rowTimestampLab(l) }))
      .filter(l => l.ts !== null && l.scr != null && l.ts > start7 && l.ts <= end7)
      .map(l => Number(l.scr));
    const peak0_7_val = scrs7.length ? Math.max(...scrs7) : peak0_72_val; // fallback if none

    // absolute and relative diffs (48h uses peak within 0-48h, 72h uses 0-72h)
    const absDiff48 = baselineScr != null && peak0_48_val != null ? Number((peak0_48_val - baselineScr).toFixed(3)) : null;
    const relDiff48Pct = baselineScr != null && peak0_48_val != null && baselineScr !== 0 ? Number(((peak0_48_val - baselineScr) / baselineScr * 100).toFixed(2)) : null;

    const absDiff72 = baselineScr != null && peak0_72_val != null ? Number((peak0_72_val - baselineScr).toFixed(3)) : null;
    const relDiff72Pct = baselineScr != null && peak0_72_val != null && baselineScr !== 0 ? Number(((peak0_72_val - baselineScr) / baselineScr * 100).toFixed(2)) : null;

    const absDiff7 = baselineScr != null && peak0_7_val != null ? Number((peak0_7_val - baselineScr).toFixed(3)) : null;
    const relDiff7Pct = baselineScr != null && peak0_7_val != null && baselineScr !== 0 ? Number(((peak0_7_val - baselineScr) / baselineScr * 100).toFixed(2)) : null;

    // URINE: sum fluid output within (0,24] hours after proc
    const startUrine = procTs;
    const endUrine = procTs + 24 * HOURS;
    const urineEntries = fluids
      .map(f => ({ ...f, ts: rowTimestampFluid(f) }))
      .filter(f => f.ts !== null && f.output_ml != null && f.ts > startUrine && f.ts <= endUrine);
    const urineTotal = urineEntries.reduce((s, x) => s + (x.output_ml ?? 0), 0);
    // assume 70 kg -> threshold = 0.5 * 70 * 24 = 840 mL / 24h
    const urineThreshold = 0.5 * 70 * 24; // 840
    const urineOutputLowAuto = urineTotal < urineThreshold;

    // KDIGO criteria
    const kdigo_abs48 = absDiff48 !== null && absDiff48 >= 0.3;
    // KDIGO relative: prefer 7-day relative, else use 72h (we'll use relDiff7Pct)
    const kdigo_rel = relDiff7Pct !== null && relDiff7Pct >= 50; // 1.5x -> 50% increase in percent terms -> careful: 1.5x = 50% increase? Actually 1.5x means 50% increase. So this is correct.
    // But KDIGO's "≥1.5× baseline within 7 days" -> rel >= 50% exactly (1.5x)
    // For clarity we use relDiff7Pct >= 50
    const kdigo_urine = urineTotal > -1 && urineOutputLowAuto; // boolean
    // dialysis flag stored separately (manual)
    // compute KDIGO result (dialysis not included here; will be added using provided dialysis value)
    // KDIGO stage (if dialysis flag true -> stage 3)
    // Determine peak for staging decisions: use peak0_7_val
    const peakForStage = peak0_7_val ?? null;

    // ESUR: abs >= 0.5 or rel >= 25% in 48-72h (we will use peak0_72_val and relDiff72Pct)
    const esur_abs = absDiff72 !== null && absDiff72 >= 0.5;
    const esur_rel = relDiff72Pct !== null && relDiff72Pct >= 25;
    const esur_result = esur_abs || esur_rel;

    // NCDR: abs >= 0.3 OR rel >= 50 within 48h OR dialysis (dialysis manual)
    const ncdr_abs = absDiff48 !== null && absDiff48 >= 0.3;
    const ncdr_rel = relDiff48Pct !== null && relDiff48Pct >= 50;
    // ACR: same as ESUR
    const acr_abs = absDiff72 !== null && absDiff72 >= 0.5;
    const acr_rel = relDiff72Pct !== null && relDiff72Pct >= 25;
    const acr_result = acr_abs || acr_rel;

    return {
      procTag,
      procISO,
      baselineLab,
      baselineScr,
      peak0_24,
      peak24_48,
      peak48_72,
      peak0_48_val,
      peak0_72_val,
      peak0_7_val,
      absDiff48,
      relDiff48Pct,
      absDiff72,
      relDiff72Pct,
      absDiff7,
      relDiff7Pct,
      urineTotal,
      urineThreshold,
      urineOutputLowAuto,
      kdigo_abs48,
      kdigo_rel,
      kdigo_urine,
      esur_abs,
      esur_rel,
      esur_result,
      ncdr_abs,
      ncdr_rel,
      acr_abs,
      acr_rel,
      acr_result,
      peakForStage,
    };
  }

  // compute blocks for available procedures
  const procBlocks = useMemo(() => {
    if (!patient) return [];
    const blocks: any[] = [];
    if (patient.procedure_datetime_cag) {
      blocks.push(computeForProcedure(patient.procedure_datetime_cag, 'CAG', patient.procedure_datetime_ptca));
    }
    if (patient.procedure_datetime_ptca) {
      blocks.push(computeForProcedure(patient.procedure_datetime_ptca, 'PTCA', patient.procedure_datetime_cag));
    }
    return blocks;
  }, [patient, labs, fluids]);

  // helper to get existing cin row for proc
  function existingCinFor(procTag: 'CAG' | 'PTCA') {
    return cinRows.find(c => c.procedure_type === procTag) || null;
  }

  // local UI state for manual dialysis toggles (initialized from DB if present)
  const [localDialysis, setLocalDialysis] = useState<Record<string, boolean>>({});
  // local override for urine flag (optional)
  const [localUrineOverride, setLocalUrineOverride] = useState<Record<string, boolean | null>>({}); // null = use auto

  // sync local states when cinRows or procBlocks load
  useEffect(() => {
    const newDial: Record<string, boolean> = {};
    const newUrine: Record<string, boolean | null> = {};
    for (const b of procBlocks) {
      const found = cinRows.find(c => c.procedure_type === b.procTag);
      newDial[b.procTag] = !!found?.dialysis_initiated;
      // if saved urine flag exists, set override to that value (so clinician can change)
      newUrine[b.procTag] = (found?.urine_output_low ?? null);
    }
    setLocalDialysis(prev => ({ ...newDial, ...prev }));
    setLocalUrineOverride(prev => ({ ...newUrine, ...prev }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cinRows, procBlocks.length]);

  // Save (upsert) function
  async function saveAll() {
    if (!patient) return;
    setSaving(true);
    try {
      const toUpsert: CinRow[] = [];

      for (const b of procBlocks) {
        const procTag = b.procTag as 'CAG' | 'PTCA';
        const existing = existingCinFor(procTag);

        const dialysisFlag = !!localDialysis[procTag];
        // choose urine flag: if override set (true/false) use it; else use auto
        const urineOverride = localUrineOverride[procTag];
        const urineFlag = urineOverride === null || urineOverride === undefined ? !!b.urineOutputLowAuto : !!urineOverride;

        // KDIGO final result uses dialysis manual flag as well
        const kdigoFinal = !!b.kdigo_abs48 || !!b.kdigo_rel || !!b.kdigo_urine || dialysisFlag;

        // compute KDIGO stage:
        let kdigoStage: string | null = null;
        if (dialysisFlag) {
          kdigoStage = 'Stage 3';
        } else if (b.peakForStage != null && b.baselineScr != null && b.baselineScr !== 0) {
          const ratio = b.peakForStage / b.baselineScr;
          if (ratio >= 3 || (b.peakForStage >= 4.0)) kdigoStage = 'Stage 3';
          else if (ratio >= 2) kdigoStage = 'Stage 2';
          else if (b.kdigo_abs48 || ratio >= 1.5) kdigoStage = 'Stage 1';
          else kdigoStage = null;
        }

        const row: CinRow = {
          patient_id: patient.id,
          procedure_type: procTag,
          cin_kdigo: kdigoFinal,
          kdigo_stage: kdigoStage,
          cin_esur: !!b.esur_result,
          cin_ncdr: !!(b.ncdr_abs || b.ncdr_rel || dialysisFlag),
          cin_acr: !!b.acr_result,
          dialysis_initiated: dialysisFlag,
          urine_output_low: urineFlag,
          calculated_at: new Date().toISOString()
        };
        if (existing?.id) row.id = existing.id;
        toUpsert.push(row);
      }

      if (toUpsert.length > 0) {
        // upsert by patient_id and procedure_type (your DB has unique constraint on these)
        const { error, data } = await supabase
          .from('cin_definitions')
          .upsert(toUpsert, { onConflict: 'patient_id,procedure_type' })
          .select('*');

        if (error) {
          console.error('upsert error', error);
          alert('Save failed — check console');
        } else {
          // reload cinRows
          const { data: fresh } = await supabase
            .from('cin_definitions')
            .select('*')
            .eq('patient_id', patient.id);

          setCinRows((fresh || []) as CinRow[]);
          alert('Saved ✅');
        }
      } else {
        alert('Nothing to save');
      }
    } catch (err) {
      console.error('save err', err);
      alert('Save failed — check console');
    } finally {
      setSaving(false);
    }
  }

  // Render small status item
  function Present({ ok }: { ok: boolean | null }) {
    if (ok === null) return <span className="text-gray-500">—</span>;
    return ok ? <span className="text-green-600 font-semibold">✅ Present</span> : <span className="text-red-600 font-semibold">❌ Absent</span>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-6 flex items-center justify-center">
        <div className="text-gray-700">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-5 flex flex-col items-center">
      <h1 className="text-3xl font-extrabold mb-4 text-gray-900">🧾 CIN / AKI Definitions</h1>

      {patient && (
        <div className="bg-blue-50 border border-blue-200 rounded w-full max-w-6xl p-3 mb-4 text-gray-900">
          <strong>Patient:</strong> {patient.patient_name} — <strong>IPD:</strong> {patient.ipd_number}
        </div>
      )}

      {procBlocks.length === 0 && (
        <div className="bg-white w-full max-w-6xl rounded shadow p-4 text-gray-900">
          No procedure timestamps found for this patient (CAG / PTCA). Please set procedure_datetime_cag or procedure_datetime_ptca on the patient details.
        </div>
      )}

      {/* For each procedure: */}
      {procBlocks.map((b: any) => {
        const procTag: 'CAG' | 'PTCA' = b.procTag;
        const existing = existingCinFor(procTag);
        const dialysisVal = localDialysis[procTag] ?? !!existing?.dialysis_initiated;
        const urineOverride = localUrineOverride[procTag];
        const urineAuto = !!b.urineOutputLowAuto;
        const urineFinal = (urineOverride === null || urineOverride === undefined) ? urineAuto : urineOverride;

        // final results (reflect manual dialysis)
        const kdigoFinal = !!b.kdigo_abs48 || !!b.kdigo_rel || !!b.kdigo_urine || !!dialysisVal;
        const esurFinal = !!b.esur_result;
        const ncdrFinal = !!(b.ncdr_abs || b.ncdr_rel) || !!dialysisVal;
        const acrFinal = !!b.acr_result;

        // KDIGO stage
        let kdigoStage: string | null = existing?.kdigo_stage ?? null;
        // if not set derive
        if (!kdigoStage) {
          if (dialysisVal) kdigoStage = 'Stage 3';
          else if (b.peakForStage != null && b.baselineScr != null && b.baselineScr !== 0) {
            const ratio = b.peakForStage / b.baselineScr;
            if (ratio >= 3 || (b.peakForStage >= 4.0)) kdigoStage = 'Stage 3';
            else if (ratio >= 2) kdigoStage = 'Stage 2';
            else if (b.kdigo_abs48 || ratio >= 1.5) kdigoStage = 'Stage 1';
            else kdigoStage = null;
          }
        }

        return (
          <div key={procTag} className="w-full max-w-6xl bg-white rounded shadow p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-gray-900">📌 {procTag} — Definitions (anchored at {new Date(b.procISO).toLocaleString()})</h2>
              <div className="text-sm text-gray-600">Calculated at: {existing?.calculated_at ? new Date(existing.calculated_at).toLocaleString() : '—'}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left: Data summary */}
              <div className="p-3 border rounded">
                <h3 className="font-semibold text-gray-900 mb-2">🔎 Data summary</h3>
                <div className="text-sm text-gray-700 space-y-1">
                  <div><strong>Baseline SCr:</strong> {b.baselineScr ?? '—' } mg/dL {b.baselineLab ? `(on ${b.baselineLab.lab_date ?? b.baselineLab.created_at})` : ''}</div>
                  <div><strong>Peak 0–24 h:</strong> {b.peak0_24 ?? '—'} mg/dL</div>
                  <div><strong>Peak 24–48 h:</strong> {b.peak24_48 ?? '—'} mg/dL</div>
                  <div><strong>Peak 48–72 h:</strong> {b.peak48_72 ?? '—'} mg/dL</div>
                  <div><strong>Peak (0–72 h):</strong> {b.peak0_72_val ?? '—'} mg/dL</div>
                  <div><strong>Peak (0–7 d):</strong> {b.peak0_7_val ?? '—'} mg/dL</div>
                  <div><strong>Urine output (0–24 h):</strong> {b.urineTotal ?? 0} mL (threshold {b.urineThreshold} mL)</div>
                </div>
                <div className="mt-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={dialysisVal} onChange={(e) => setLocalDialysis(prev => ({ ...prev, [procTag]: e.target.checked }))} />
                    <span className="text-sm text-gray-800">Dialysis initiated (manual)</span>
                  </label>
                </div>

                <div className="mt-2 text-xs text-gray-500">
                  <em>Urine threshold assumes weight = 70 kg, 0.5 mL/kg/hr = 840 mL / 24 h</em>
                </div>

                <div className="mt-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox"
                      checked={urineOverride !== null && urineOverride !== undefined ? !!urineOverride : false}
                      onChange={(e) => {
                        // if user toggles this, set override to opposite of auto OR null -> set explicit
                        const checked = e.target.checked;
                        setLocalUrineOverride(prev => ({ ...prev, [procTag]: checked }));
                      }}
                    />
                    <span className="text-sm text-gray-800">Manually mark urine_output_low = true (override auto)</span>
                  </label>
                  <div className="text-xs text-gray-600 mt-1">Auto: {urineAuto ? 'LOW (< threshold)' : 'OK (≥ threshold)'}. Toggle above to override.</div>
                </div>
              </div>

              {/* Right: Definitions */}
              <div className="p-3 border rounded space-y-3">
                {/* KDIGO */}
                <div className="p-2 border rounded bg-gray-50">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-semibold text-gray-900">KDIGO (2012)</h4>
                      <div className="text-xs text-gray-600">AKI if any: ↑SCr ≥0.3 mg/dL (48h) OR ≥1.5× baseline (7d) OR urine output <0.5 mL/kg/hr OR dialysis</div>
                    </div>
                    <div className="text-sm">{kdigoStage ? <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800 font-semibold">{kdigoStage}</span> : <span className="text-gray-500">Stage: —</span>}</div>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-1 text-sm">
                    <div className="flex justify-between items-center">
                      <div>Absolute SCr rise ≥ 0.3 mg/dL (48h)</div>
                      <div className="text-right"><strong>{b.absDiff48 ?? '—'} mg/dL</strong> — <Present ok={b.kdigo_abs48 ?? false} /></div>
                    </div>

                    <div className="flex justify-between items-center">
                      <div>Relative SCr rise ≥ 1.5× baseline (7d)</div>
                      <div className="text-right"><strong>{b.relDiff7Pct ?? '—'} %</strong> — <Present ok={b.kdigo_rel ?? false} /></div>
                    </div>

                    <div className="flex justify-between items-center">
                      <div>Urine output low (0–24h) &lt; 840 mL</div>
                      <div className="text-right"><strong>{b.urineTotal ?? 0} mL</strong> — <Present ok={urineFinal} /></div>
                    </div>

                    <div className="flex justify-between items-center">
                      <div>Dialysis initiated (manual)</div>
                      <div className="text-right"><strong>{dialysisVal ? 'Yes' : 'No'}</strong></div>
                    </div>

                    <div className="mt-2 flex justify-between items-center">
                      <div className="font-semibold">Final KDIGO</div>
                      <div className="font-semibold">{kdigoFinal ? <span className="text-green-700">✅ POSITIVE</span> : <span className="text-red-700">❌ NEGATIVE</span>}</div>
                    </div>
                  </div>
                </div>

                {/* ESUR */}
                <div className="p-2 border rounded bg-gray-50">
                  <div className="flex justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-900">ESUR (1999)</h4>
                      <div className="text-xs text-gray-600">Increase in SCr ≥0.5 mg/dL OR ≥25% within 48–72h</div>
                    </div>
                    <div className="text-sm">{esurFinal ? <span className="text-green-700 font-semibold">✅</span> : <span className="text-red-700 font-semibold">❌</span>}</div>
                  </div>

                  <div className="mt-2 text-sm">
                    <div className="flex justify-between"><div>Absolute Δ (0–72h)</div><div><strong>{b.absDiff72 ?? '—'} mg/dL</strong> — <Present ok={b.esur_abs ?? false} /></div></div>
                    <div className="flex justify-between mt-1"><div>Relative Δ % (0–72h)</div><div><strong>{b.relDiff72Pct ?? '—'} %</strong> — <Present ok={b.esur_rel ?? false} /></div></div>
                    <div className="mt-2 flex justify-between"><div className="font-semibold">Final ESUR</div><div className="font-semibold">{esurFinal ? <span className="text-green-700">✅ POSITIVE</span> : <span className="text-red-700">❌ NEGATIVE</span>}</div></div>
                  </div>
                </div>

                {/* NCDR */}
                <div className="p-2 border rounded bg-gray-50">
                  <div className="flex justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-900">NCDR (CathPCI)</h4>
                      <div className="text-xs text-gray-600">Increase in SCr ≥0.3 mg/dL OR ≥50% within 48h OR dialysis</div>
                    </div>
                    <div className="text-sm">{ncdrFinal ? <span className="text-green-700 font-semibold">✅</span> : <span className="text-red-700 font-semibold">❌</span>}</div>
                  </div>

                  <div className="mt-2 text-sm">
                    <div className="flex justify-between"><div>Absolute Δ (0–48h)</div><div><strong>{b.absDiff48 ?? '—'} mg/dL</strong> — <Present ok={b.ncdr_abs ?? false} /></div></div>
                    <div className="flex justify-between mt-1"><div>Relative Δ % (0–48h)</div><div><strong>{b.relDiff48Pct ?? '—'} %</strong> — <Present ok={b.ncdr_rel ?? false} /></div></div>
                    <div className="mt-2 flex justify-between"><div className="font-semibold">Final NCDR</div><div className="font-semibold">{ncdrFinal ? <span className="text-green-700">✅ POSITIVE</span> : <span className="text-red-700">❌ NEGATIVE</span>}</div></div>
                  </div>
                </div>

                {/* ACR */}
                <div className="p-2 border rounded bg-gray-50">
                  <div className="flex justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-900">ACR</h4>
                      <div className="text-xs text-gray-600">Increase in SCr ≥0.5 mg/dL OR ≥25% within 48–72h</div>
                    </div>
                    <div className="text-sm">{acrFinal ? <span className="text-green-700 font-semibold">✅</span> : <span className="text-red-700 font-semibold">❌</span>}</div>
                  </div>

                  <div className="mt-2 text-sm">
                    <div className="flex justify-between"><div>Absolute Δ (0–72h)</div><div><strong>{b.absDiff72 ?? '—'} mg/dL</strong> — <Present ok={b.acr_abs ?? false} /></div></div>
                    <div className="flex justify-between mt-1"><div>Relative Δ % (0–72h)</div><div><strong>{b.relDiff72Pct ?? '—'} %</strong> — <Present ok={b.acr_rel ?? false} /></div></div>
                    <div className="mt-2 flex justify-between"><div className="font-semibold">Final ACR</div><div className="font-semibold">{acrFinal ? <span className="text-green-700">✅ POSITIVE</span> : <span className="text-red-700">❌ NEGATIVE</span>}</div></div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        );
      })}

      {procBlocks.length > 0 && (
        <div className="w-full max-w-6xl mt-2 mb-8">
          <button
            onClick={saveAll}
            disabled={!patient || saving}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save Definitions'}
          </button>
        </div>
      )}
    </div>
  );
}
