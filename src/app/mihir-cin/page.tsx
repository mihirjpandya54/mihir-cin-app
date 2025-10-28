'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ---------- Supabase client ----------
const supabase: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---------- Helpers ----------
const HOURS = 1000 * 60 * 60;
const clampNum = (n: any) => (n === null || n === undefined || Number.isNaN(Number(n)) ? null : Number(n));

// Convert date-only "YYYY-MM-DD" => midday ISO local string
function dateOnlyToMiddayTs(dateOnly: string | null): number | null {
  if (!dateOnly) return null;
  try {
    // treat as local
    const dt = new Date(dateOnly + 'T12:00:00');
    const t = dt.getTime();
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

/**
 * Return metadata for a lab (scr/hb).
 * - lab.lab_date may be 'YYYY-MM-DD' (date-only) or 'YYYY-MM-DDTHH:MM:SSZ' (if stored that way)
 * - fallback to created_at timestamp if lab_date missing or invalid
 */
function rowTimestampLabMeta(l: any): { ts: number | null; isDateOnly: boolean; dateOnlyStr?: string } {
  try {
    if (!l) return { ts: null, isDateOnly: false };
    if (l.lab_date) {
      // lab_date in schema is "date" (no time) usually; but be robust if it contains 'T'
      if (String(l.lab_date).includes('T')) {
        const ts = new Date(l.lab_date).getTime();
        return { ts: Number.isFinite(ts) ? ts : null, isDateOnly: false };
      } else {
        const ts = dateOnlyToMiddayTs(String(l.lab_date));
        return { ts, isDateOnly: true, dateOnlyStr: String(l.lab_date) };
      }
    }
    if (l.created_at) {
      const ts = new Date(l.created_at).getTime();
      return { ts: Number.isFinite(ts) ? ts : null, isDateOnly: false };
    }
    return { ts: null, isDateOnly: false };
  } catch {
    return { ts: null, isDateOnly: false };
  }
}

function rowTimestampFluidMeta(f: any): { ts: number | null; isDateOnly: boolean } {
  try {
    if (!f) return { ts: null, isDateOnly: false };
    if (f.fluid_date) {
      if (String(f.fluid_date).includes('T')) {
        const ts = new Date(f.fluid_date).getTime();
        return { ts: Number.isFinite(ts) ? ts : null, isDateOnly: false };
      } else {
        const ts = dateOnlyToMiddayTs(String(f.fluid_date));
        return { ts, isDateOnly: true };
      }
    }
    if (f.inserted_at) {
      const ts = new Date(f.inserted_at).getTime();
      return { ts: Number.isFinite(ts) ? ts : null, isDateOnly: false };
    }
    return { ts: null, isDateOnly: false };
  } catch {
    return { ts: null, isDateOnly: false };
  }
}

// CKD-EPI 2009 approximate eGFR (assuming non-black race). Works with creatinine in mg/dL.
// This is a reasonable fallback if egfr not present in lab row and you have age + sex.
function computeEgfrCkdEpi(creatinineMgDl: number | null, ageYears: number | null, sex: 'Male' | 'Female' | 'Other' | null) {
  if (creatinineMgDl == null || ageYears == null || !sex) return null;
  const k = sex === 'Female' ? 0.7 : 0.9;
  const alpha = sex === 'Female' ? -0.329 : -0.411;
  const minVal = Math.min(creatinineMgDl / k, 1);
  const maxVal = Math.max(creatinineMgDl / k, 1);
  // no race adjustment here (assume non-black)
  const sexFactor = sex === 'Female' ? 1.018 : 1.0;
  const ageFactor = Math.pow(0.993, ageYears);
  const egfr = 142 * Math.pow(minVal, alpha) * Math.pow(maxVal, -1.209) * sexFactor * ageFactor; // CKD-EPI 2021-ish variant constant tuned for non-black (approx)
  return Number.isFinite(egfr) ? Math.round(egfr * 100) / 100 : null;
}

// format helper
function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return typeof n === 'number' ? String(n) : String(n);
}

// ---------- Component ----------
export default function MihirCinDefinition() {
  // data
  const [patient, setPatient] = useState<any | null>(null);
  const [procedures, setProcedures] = useState<any[]>([]);
  const [labs, setLabs] = useState<any[]>([]);
  const [fluids, setFluids] = useState<any[]>([]);
  const [bpRows, setBpRows] = useState<any[]>([]);
  const [meds, setMeds] = useState<any[]>([]);
  const [existing, setExisting] = useState<any | null>(null);

  // UI
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [manualConfounder, setManualConfounder] = useState(false);
  const [adjudicatedBy, setAdjudicatedBy] = useState<string | null>(null);

  // effect: load data for active patient
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // active_patient - fixed user id we use in your project
        const { data: active, error: e1 } = await supabase
          .from('active_patient')
          .select('patient_id')
          .eq('user_id', '00000000-0000-0000-0000-000000000001')
          .maybeSingle();
        if (e1) console.error('active_patient error', e1);
        const patientId = active?.patient_id;
        if (!patientId) {
          console.warn('No active patient selected');
          setLoading(false);
          return;
        }

        // patient_details
        const { data: p, error: e2 } = await supabase
          .from('patient_details')
          .select('id, patient_name, ipd_number, age, sex, admission_datetime, procedure_datetime_cag, procedure_datetime_ptca')
          .eq('id', patientId)
          .maybeSingle();
        if (e2) console.error('patient fetch error', e2);
        setPatient(p ?? null);

        // try to fetch a procedures_view if exists (convenience)
        let procRows: any[] = [];
        const { data: pv, error: pvErr } = await supabase
          .from('procedures_view')
          .select('id, patient_id, type, procedure_datetime')
          .eq('patient_id', patientId);
        if (!pvErr && pv) procRows = pv;

        // fallback: angiography_raw, ptca_raw, poba_report, thrombus_aspiration_report
        if (!procRows.length) {
          // angiography_raw
          const { data: ag } = await supabase
            .from('angiography_raw')
            .select('id, patient_id, procedure_date, procedure_time, contrast_volume_ml, created_at')
            .eq('patient_id', patientId);
          if (ag && ag.length) {
            procRows = procRows.concat(
              ag.map((r: any) => ({
                id: r.id,
                patient_id: r.patient_id,
                type: 'CAG',
                procedure_datetime: r.procedure_date ? (String(r.procedure_date).includes('T') ? r.procedure_date : String(r.procedure_date) + 'T12:00:00') : r.created_at,
                contrast_volume_ml: r.contrast_volume_ml ?? null
              }))
            );
          }

          // ptca_raw
          const { data: pr } = await supabase
            .from('ptca_raw')
            .select('id, patient_id, procedure_date, procedure_time, contrast_volume_ml, created_at')
            .eq('patient_id', patientId);
          if (pr && pr.length) {
            procRows = procRows.concat(
              pr.map((r: any) => ({
                id: r.id,
                patient_id: r.patient_id,
                type: 'PTCA',
                procedure_datetime: r.procedure_date ? (String(r.procedure_date).includes('T') ? r.procedure_date : String(r.procedure_date) + 'T12:00:00') : r.created_at,
                contrast_volume_ml: r.contrast_volume_ml ?? null
              }))
            );
          }

          // poba_report
          const { data: pob } = await supabase
            .from('poba_report')
            .select('id, patient_id, procedure_datetime, contrast_volume_ml, created_at')
            .eq('patient_id', patientId);
          if (pob && pob.length) {
            procRows = procRows.concat(
              pob.map((r: any) => ({
                id: r.id,
                patient_id: r.patient_id,
                type: 'POBA',
                procedure_datetime: r.procedure_datetime ?? r.created_at,
                contrast_volume_ml: r.contrast_volume_ml ?? null
              }))
            );
          }

          // thrombus_aspiration_report
          const { data: th } = await supabase
            .from('thrombus_aspiration_report')
            .select('id, patient_id, procedure_datetime, contrast_volume_ml, created_at')
            .eq('patient_id', patientId);
          if (th && th.length) {
            procRows = procRows.concat(
              th.map((r: any) => ({
                id: r.id,
                patient_id: r.patient_id,
                type: 'Thrombus aspiration',
                procedure_datetime: r.procedure_datetime ?? r.created_at,
                contrast_volume_ml: r.contrast_volume_ml ?? null
              }))
            );
          }
        }

        // normalize and sort by datetime ascending
        procRows = (procRows || [])
          .filter((x: any) => x?.procedure_datetime)
          .map((r: any) => ({ ...r, procedure_datetime: new Date(r.procedure_datetime).toISOString() }))
          .sort((a: any, b: any) => new Date(a.procedure_datetime).getTime() - new Date(b.procedure_datetime).getTime());
        setProcedures(procRows);

        // labs
        const { data: labData, error: labErr } = await supabase
          .from('lab_results')
          .select('*')
          .eq('patient_id', patientId)
          .order('lab_date', { ascending: true });
        if (labErr) console.error('lab fetch error', labErr);
        setLabs((labData || []).map((r: any) => ({ ...r })));

        // fluids
        const { data: fData, error: fErr } = await supabase
          .from('fluid_chart')
          .select('*')
          .eq('patient_id', patientId)
          .order('fluid_date', { ascending: true });
        if (fErr) console.error('fluid fetch error', fErr);
        setFluids((fData || []).map((r: any) => ({ ...r })));

        // bp (bp_chart)
        const { data: bpData, error: bpErr } = await supabase
          .from('bp_chart')
          .select('*')
          .eq('patient_id', patientId)
          .order('bp_date', { ascending: true });
        if (bpErr) console.error('bp fetch error', bpErr);
        setBpRows((bpData || []).map((r: any) => ({ ...r })));

        // medications
        const { data: medData, error: medErr } = await supabase
          .from('medications')
          .select('*')
          .eq('patient_id', patientId)
          .order('med_date', { ascending: true });
        if (medErr) console.error('medications fetch error', medErr);
        setMeds((medData || []).map((r: any) => ({ ...r })));

        // existing mihir row (if any)
        const { data: exist, error: existErr } = await supabase
          .from('mihir_cin_definition')
          .select('*')
          .eq('patient_id', patientId)
          .maybeSingle();
        if (existErr) console.error('existing mihir fetch error', existErr);
        setExisting(exist ?? null);

        // initialize manual confounder & adjudicator if existing row
        if (exist) {
          setManualConfounder(Boolean(exist.sepsis_or_other_major_cause));
          setAdjudicatedBy(exist.adjudicated_by ?? null);
        }
      } catch (err) {
        console.error('load error', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // earliest procedure (anchor)
  const firstProcedure = useMemo(() => {
    return procedures && procedures.length ? procedures[0] : null;
  }, [procedures]);

  // helper local date Y-M-D
  const localDateYMD = (ts: number) => new Date(ts).toLocaleDateString('en-CA');

  // ---------- Baseline selection ----------
  const baselineMeta = useMemo(() => {
    if (!firstProcedure || !labs?.length) return null;
    const firstProcTs = new Date(firstProcedure.procedure_datetime).getTime();
    if (!Number.isFinite(firstProcTs)) return null;

    // prepare lab meta with timestamps
    const labMeta = labs.map(l => {
      const meta = rowTimestampLabMeta(l);
      return { ...l, ts: meta.ts, isDateOnly: meta.isDateOnly, dateOnlyStr: meta.dateOnlyStr ?? null };
    }).filter((l:any) => l.scr != null);

    // strict pre-procedure labs: ts < firstProcTs; exclude date-only labs that have same local date (ambiguous)
    const strictCandidates = labMeta
      .filter((l: any) => l.ts !== null && l.ts < firstProcTs)
      .filter((l: any) => {
        if (l.isDateOnly) {
          const labLocal = localDateYMD(l.ts);
          const procLocal = localDateYMD(firstProcTs);
          if (labLocal === procLocal) return false; // ambiguous -> exclude
        }
        return true;
      })
      .sort((a: any, b: any) => b.ts - a.ts); // latest first

    if (strictCandidates.length) {
      const chosen = strictCandidates[0];
      const chosenScr = clampNum(chosen.scr);
      const chosenTs = chosen.ts as number;
      // compute stability (7d)
      const sevenBefore = chosenTs - 7 * 24 * HOURS;
      const earlier = labMeta.filter((l: any) => l.ts !== null && l.ts >= sevenBefore && l.ts < chosenTs).sort((a:any,b:any)=>b.ts - a.ts);
      let stable = true;
      for (const e of earlier) {
        const earlierScr = clampNum(e.scr);
        if (earlierScr == null || earlierScr <= 0) continue;
        const absDiff = Math.abs((chosenScr ?? 0) - earlierScr);
        const ratio = (chosenScr ?? 0) / earlierScr;
        if (absDiff >= 0.3 || ratio >= 1.5) { stable = false; break; }
      }
      return { value: chosenScr, ts: chosenTs, dateLabel: chosen.lab_date ?? chosen.created_at ?? null, stable, fallback: false };
    }

    // fallback: same-day date-only if none strict
    const procLocalDate = localDateYMD(firstProcTs);
    const fallbackCandidates = labMeta.filter((l:any) => l.ts !== null && l.isDateOnly && localDateYMD(l.ts) === procLocalDate).sort((a:any,b:any)=>b.ts - a.ts);
    if (fallbackCandidates.length) {
      const chosen = fallbackCandidates[0];
      return { value: clampNum(chosen.scr), ts: chosen.ts, dateLabel: chosen.lab_date ?? chosen.created_at ?? null, stable: false, fallback: true };
    }

    return null;
  }, [firstProcedure, labs]);

  // ---------- 0-24h SCr ----------
  const scr24Meta = useMemo(() => {
    if (!firstProcedure || !labs?.length) return null;
    const procTs = new Date(firstProcedure.procedure_datetime).getTime();
    const endTs = procTs + 24 * HOURS;
    const labMeta = labs.map(l => ({ ...l, meta: rowTimestampLabMeta(l) }));
    // pick earliest lab with ts within [procTs, endTs]
    const candidates = labMeta.filter((l:any) => l.meta.ts !== null && l.scr != null && l.meta.ts >= procTs && l.meta.ts <= endTs)
      .sort((a:any,b:any) => a.meta.ts - b.meta.ts);
    if (candidates.length) {
      const chosen = candidates[0];
      return { value: clampNum(chosen.scr), ts: chosen.meta.ts, dateLabel: chosen.lab_date ?? chosen.created_at ?? null };
    }
    // if none found, try date-only labs where lab_date equals procedure date (ambiguous; accept as fallback)
    const procLocal = new Date(procTs).toLocaleDateString('en-CA');
    const fallback = labMeta.filter((l:any) => l.meta.ts !== null && l.scr != null && l.meta.isDateOnly && localDateYMD(l.meta.ts) === procLocal)
      .sort((a:any,b:any)=>a.meta.ts - b.meta.ts);
    if (fallback.length) {
      const chosen = fallback[0];
      return { value: clampNum(chosen.scr), ts: chosen.meta.ts, dateLabel: chosen.lab_date ?? chosen.created_at ?? null, fallback: true };
    }
    return null;
  }, [firstProcedure, labs]);

  // ---------- urine 0-24h ----------
  const urine24 = useMemo(() => {
    if (!firstProcedure || !fluids?.length) return { totalMl: null, dataPresent: false };
    const procTs = new Date(firstProcedure.procedure_datetime).getTime();
    const endTs = procTs + 24 * HOURS;
    const fluidMeta = fluids.map((f:any) => ({ ...f, meta: rowTimestampFluidMeta(f) }));
    const entries = fluidMeta.filter((f:any) => f.meta.ts !== null && f.output_ml != null && f.meta.ts >= procTs && f.meta.ts <= endTs);
    const total = entries.reduce((s:number, x:any) => s + (clampNum(x.output_ml) || 0), 0);
    return { totalMl: total, dataPresent: entries.length > 0 };
  }, [firstProcedure, fluids]);

  // ---------- contrast volume (use earliest procedure) ----------
  const contrastVolume = useMemo(() => {
    if (!firstProcedure) return null;
    // try contrast_volume_ml from procedure object if present
    const v = firstProcedure.contrast_volume_ml ?? firstProcedure.contrast_volume ?? firstProcedure.contrast_volume_ml ?? null;
    return clampNum(v);
  }, [firstProcedure]);

  // ---------- eGFR (baseline) ----------
  const egfrBaseline = useMemo(() => {
    // try to get egfr from baseline lab row itself (if column existed)
    if (!baselineMeta) return null;
    // find the lab row that gave baseline
    const candidate = labs.find(l => {
      const meta = rowTimestampLabMeta(l);
      if (meta.ts === null) return false;
      // approximate match by value and date
      const scrVal = clampNum(l.scr);
      if (scrVal == null) return false;
      if (Math.abs(scrVal - (baselineMeta.value ?? 0)) < 0.0001) return true;
      // fallback: match by date string if provided
      if (baselineMeta.dateLabel && l.lab_date && String(l.lab_date) === String(baselineMeta.dateLabel)) return true;
      return false;
    });
    // if candidate has egfr column, use it (some systems may have egfr)
    if (candidate && candidate.egfr) return clampNum(candidate.egfr);
    // else compute using CKD-EPI with patient age/sex if available
    const creat = baselineMeta.value ?? null;
    const age = patient?.age ?? null;
    const sex = patient?.sex ?? null;
    if (creat == null) return null;
    const computed = computeEgfrCkdEpi(creat, age ?? null, sex ?? null);
    return computed;
  }, [baselineMeta, labs, patient]);

  // ---------- hemodynamic insult ----------
  const hemodynamicInsult = useMemo(() => {
    if (!firstProcedure) return { flag: null, reason: null, mapMin: null, vasopressorFound: null };
    const procTs = new Date(firstProcedure.procedure_datetime).getTime();
    // find bp rows with timing_label containing '0-24' or '0–24' OR bp_date equal to procedure local date
    const candidates = bpRows.filter((b:any) => {
      try {
        if (!b) return false;
        const label = (b.timing_label ?? '').toString().toLowerCase();
        if (label.includes('0-24') || label.includes('0–24') || label.includes('0 - 24')) return true;
        // fallback: match bp_date to procedure date
        const bpDate = b.bp_date;
        if (bpDate) {
          const bpTs = dateOnlyToMiddayTs(String(bpDate));
          if (bpTs) {
            const sameDay = localDateYMD(bpTs) === localDateYMD(procTs);
            if (sameDay) return true;
          }
        }
        return false;
      } catch {
        return false;
      }
    });
    let mapMin: number | null = null;
    if (candidates.length) {
  const mins = candidates
    .map((c: any) => clampNum(c.map_min))
    .filter((v: number | null): v is number => v !== null);

  if (mins.length > 0) {
    mapMin = Math.min(...mins);
  }
}

    const mapInsult = mapMin !== null ? mapMin < 65 : false;

    // vasopressor check: medications with is_vasopressor_inotrope = true and med_date within [procDate, procDate OR next day]
    const procLocal = new Date(procTs).toLocaleDateString('en-CA');
    const procNextLocal = new Date(procTs + 24*HOURS).toLocaleDateString('en-CA');
    const vasopressFound = meds.some((m:any) => {
      try {
        const d = m.med_date ? String(m.med_date) : null;
        if (!d) return false;
        if ((d === procLocal) || (d === procNextLocal)) {
          if (m.is_vasopressor_inotrope) return true;
        }
        return false;
      } catch {
        return false;
      }
    });

    const finalFlag = mapInsult || vasopressFound;
    return { flag: finalFlag, reason: mapInsult ? `MAP_min ${mapMin}` : vasopressFound ? 'vasopressor' : null, mapMin, vasopressorFound: vasopressFound };
  }, [firstProcedure, bpRows, meds]);

  // ---------- bleeding check ----------
  const bleedingCheck = useMemo(() => {
    if (!baselineMeta) return { major: null, baselineHb: null, hb24: null, drop: null };
    // find baseline hb row (similar matching approach)
    const baseLab = labs.map(l => ({ ...l, meta: rowTimestampLabMeta(l) }))
      .filter((l:any) => l.meta.ts !== null)
      .sort((a:any,b:any) => b.meta.ts - a.meta.ts)
      .find((l:any) => l.meta.ts < (baselineMeta.ts ?? Infinity) && l.hb != null);
    // fallback: same-day date only
    const baselineHb = baseLab ? clampNum(baseLab.hb) : null;

    // 0-24h hb
    const scr24 = scr24Meta;
    const procTs = firstProcedure ? new Date(firstProcedure.procedure_datetime).getTime() : null;
    let hb24: number | null = null;
    if (procTs) {
      const endTs = procTs + 24 * HOURS;
      const candidate = labs.map(l => ({ ...l, meta: rowTimestampLabMeta(l) }))
        .filter((l:any) => l.meta.ts !== null && l.meta.ts >= procTs && l.meta.ts <= endTs && l.hb != null)
        .sort((a:any,b:any)=>a.meta.ts - b.meta.ts)[0];
      if (candidate) hb24 = clampNum(candidate.hb);
      // fallback: date-only lab matching same procedure local date
      if (hb24 == null) {
        const procLocal = new Date(procTs).toLocaleDateString('en-CA');
        const fallback = labs.map(l => ({ ...l, meta: rowTimestampLabMeta(l) }))
          .filter((l:any) => l.meta.ts !== null && l.meta.isDateOnly && localDateYMD(l.meta.ts) === procLocal && l.hb != null)
          .sort((a:any,b:any)=>a.meta.ts - b.meta.ts)[0];
        if (fallback) hb24 = clampNum(fallback.hb);
      }
    }

    const drop = (baselineHb != null && hb24 != null) ? Number(((baselineHb ?? 0) - (hb24 ?? 0)).toFixed(2)) : null;
    const major = drop !== null ? (drop >= 2.0) : null;

    return { major, baselineHb, hb24, drop };
  }, [baselineMeta, labs, scr24Meta, firstProcedure]);

  // ---------- oliguria check ----------
  const oliguriaCheck = useMemo(() => {
    // assume weight default 70 kg (user agreed)
    const weightKg = 70;
    const threshold = 0.5 * weightKg * 24; // 840 mL / 24h
    const total = urine24.totalMl;
    if (total === null) return { oliguria: null, totalMl: null, threshold };
    const olig = total < threshold;
    return { oliguria: olig, totalMl: total, threshold };
  }, [urine24]);

  // ---------- contrast/eGFR ratio ----------
  const contrastEgfr = useMemo(() => {
    if (contrastVolume == null || egfrBaseline == null) return { ratio: null, high: null };
    if (egfrBaseline === 0) return { ratio: null, high: null };
    const r = Number((contrastVolume / egfrBaseline).toFixed(3));
    const high = r > 3.7;
    return { ratio: r, high };
  }, [contrastVolume, egfrBaseline]);

  // ---------- confounders (auto) ----------
  const confoundersAuto = useMemo(() => {
    if (!firstProcedure) return { nephrotoxins: null, repeatContrast: null, any: null };
    const procTs = new Date(firstProcedure.procedure_datetime).getTime();
    // nephrotoxins: any medication with is_nephrotoxic true within 0-24h
    const procLocal = new Date(procTs).toLocaleDateString('en-CA');
    const procNextLocal = new Date(procTs + 24*HOURS).toLocaleDateString('en-CA');
    const nephroFound = meds.some((m:any) => {
      const d = m.med_date ? String(m.med_date) : null;
      if (!d) return false;
      if ((d === procLocal) || (d === procNextLocal)) {
        return Boolean(m.is_nephrotoxic);
      }
      return false;
    });
    // repeat contrast: another procedure within 72h after first
    const repeat = procedures.some((pr:any, idx:number) => {
      if (idx === 0) return false;
      const ts = new Date(pr.procedure_datetime).getTime();
      return ts <= (procTs + 72 * HOURS);
    });
    const any = nephroFound || repeat;
    return { nephrotoxins: nephroFound, repeatContrast: repeat, any };
  }, [firstProcedure, meds, procedures]);

  // ---------- Final Mihir CIN logic ----------
  const finalResult = useMemo(() => {
    // need baseline and scr24 to calculate deltas; but we also support composite (scr>=0.10 + supporting param)
    const base = baselineMeta?.value ?? null;
    const scr24 = scr24Meta?.value ?? null;
    if (!firstProcedure) return { canAssess: false, reason: 'no procedure' };

    // within_24h true if we have at least one source (baseline + scr24) computed in that window
    const within24h = true;

    let absoluteDelta = null;
    let relativeDelta = null;
    if (base != null && scr24 != null) {
      absoluteDelta = Number((scr24 - base).toFixed(3));
      if (base !== 0) relativeDelta = Number((scr24 / base).toFixed(3));
    }

    // supporting flags
    const olig = oliguriaCheck.oliguria === true;
    const highContrast = contrastEgfr.high === true;
    const hemo = hemodynamicInsult.flag === true;
    const bleed = bleedingCheck.major === true;

    // main rules
    let mihir_flag = false;
    let category: 'Definite' | 'Possible' | 'Negative' | 'Indeterminate' = 'Indeterminate';

    // Major criterion
    if (absoluteDelta !== null && absoluteDelta >= 0.30) {
      mihir_flag = true;
    } else if (absoluteDelta !== null && absoluteDelta >= 0.10) {
      // need >=1 supporting
      const supportingCount = [olig, highContrast, hemo, bleed].filter(Boolean).length;
      if (supportingCount >= 1) mihir_flag = true;
    } else {
      // Δ < 0.10 -> check maybe composite can't be applied
      mihir_flag = false;
    }

    if (mihir_flag) {
      // confounders: either manual OR auto
      const confAuto = confoundersAuto.any === true;
      const conf = manualConfounder || confAuto;
      category = conf ? 'Possible' : 'Definite';
    } else {
      category = 'Negative';
    }

    return {
      canAssess: true,
      within24h,
      absoluteDelta,
      relativeDelta,
      supporting: { olig, highContrast, hemo, bleed },
      details: {
        baseline: baselineMeta,
        scr24: scr24Meta,
        urine24,
        contrastVolume,
        egfrBaseline,
        contrastEgfr,
        hemodynamicInsult,
        bleedingCheck,
        confoundersAuto
      },
      mihir_flag,
      category
    };
  }, [baselineMeta, scr24Meta, oliguriaCheck, contrastEgfr, hemodynamicInsult, bleedingCheck, confoundersAuto, manualConfounder, firstProcedure, urine24, egfrBaseline, contrastVolume]);

  // ---------- Save function (insert or update) ----------
 // ---------- Save function (insert or update) ----------
async function saveToSupabase() {
  if (!patient || !firstProcedure) {
    alert('No patient or procedure found.');
    return;
  }
  if (!finalResult?.canAssess) {
    alert('Not assessable yet — missing data.');
    return;
  }

  setSaving(true);
  try {
    const row: any = {
      patient_id: patient.id,
      mihir_cin_flag: finalResult.mihir_flag ?? null,
      mihir_cin_category: finalResult.category ?? null,
      absolute_scr_increase_24h: finalResult.absoluteDelta ?? null,
      relative_scr_increase_24h: finalResult.relativeDelta ?? null,
      oliguria_24h: finalResult.supporting?.olig ?? null,
      contrast_egfr_ratio: finalResult.details?.contrastEgfr?.ratio ?? null,
      high_contrast_burden: finalResult.supporting?.highContrast ?? null,
      hemodynamic_instability_24h: finalResult.supporting?.hemo ?? null,
      major_bleeding_24h: finalResult.supporting?.bleed ?? null,
      sepsis_or_other_major_cause:
        manualConfounder || (finalResult.details?.confoundersAuto?.any ?? false),
      within_24h: true,
      adjudicated_by: adjudicatedBy ?? null,
      calculated_at: new Date().toISOString(),
      baseline_scr: baselineMeta?.value ?? null,
      scr_24h: scr24Meta?.value ?? null
    };

    // check existing
    const { data: existingRows, error: selErr } = await supabase
      .from('mihir_cin_definition')
      .select('*')
      .eq('patient_id', patient.id);

    if (selErr) {
      console.error('select existing error', selErr);
      alert('Save failed (select). See console.');
      setSaving(false);
      return;
    }

    if (existingRows && existingRows.length > 0) {
      // update first existing row
      const idToUpdate = existingRows[0].id;
      const { error: upErr } = await supabase
        .from('mihir_cin_definition')
        .update(row)
        .eq('id', idToUpdate);

      if (upErr) {
        console.error('update error', upErr);
        alert('Save failed (update). See console.');
      } else {
        const { data: fresh } = await supabase
          .from('mihir_cin_definition')
          .select('*')
          .eq('patient_id', patient.id);
        setExisting((fresh && fresh[0]) ?? null);
        alert('Saved (updated) ✅');
      }
    } else {
      // insert new row
      const { error: insErr, data: insData } = await supabase
        .from('mihir_cin_definition')
        .insert(row)
        .select()
        .single();

      if (insErr) {
        console.error('insert error', insErr);
        alert('Save failed (insert). See console.');
      } else {
        setExisting(insData);
        alert('Saved (inserted) ✅');
      }
    }
  } catch (err: any) {
    console.error('save error', err);
    alert(`Save failed — ${err.message ?? 'check console'}`);
  } finally {
    setSaving(false);
  }
}


  // ---------- Render ----------
  if (loading) {
    return <div className="min-h-screen p-6 flex items-center justify-center text-gray-900">Loading…</div>;
  }

  if (!patient) {
    return (
      <div className="min-h-screen p-6">
        <div className="bg-white rounded shadow p-4 text-gray-900">No active patient selected.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center text-gray-900">
      <div className="w-full max-w-5xl">
        <h1 className="text-3xl font-extrabold mb-4 text-gray-900">🧾 Mihir CIN — 0–24 h (Auto calculation)</h1>

        <div className="bg-white rounded shadow p-4 mb-4">
          <div className="text-sm text-gray-900"><strong>Patient:</strong> {patient.patient_name} — <strong>IPD:</strong> {patient.ipd_number}</div>
          <div className="text-xs text-gray-700 mt-1">This page auto-calculates Mihir CIN using labs, fluids, BP and medications. Values are auditable and saved to <code>mihir_cin_definition</code>.</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Data summary */}
          <div className="bg-white rounded shadow p-4">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Data summary</h2>

            <div className="text-sm space-y-2">
              <div><strong>First procedure:</strong> {firstProcedure ? `${firstProcedure.type} — ${new Date(firstProcedure.procedure_datetime).toLocaleString()}` : '—'}</div>

              <div><strong>Baseline SCr:</strong> {baselineMeta ? `${baselineMeta.value} mg/dL` + (baselineMeta.fallback ? ' (fallback date-only)' : '') : '—'}</div>
              <div><strong>0–24 h SCr:</strong> {scr24Meta ? `${scr24Meta.value} mg/dL` + (scr24Meta.fallback ? ' (fallback date-only)' : '') : '—'}</div>
              <div><strong>ΔSCr (abs):</strong> {fmt(finalResult.absoluteDelta)} mg/dL</div>
              <div><strong>ΔSCr (rel):</strong> {fmt(finalResult.relativeDelta)} ×</div>

              <div className="mt-2">
                <strong>Urine (0–24 h):</strong>
                <div className="text-sm ml-2">Total: {urine24.totalMl ?? 'No data'} mL — Threshold: {oliguriaCheck.threshold} mL — <span className={oliguriaCheck.oliguria ? 'text-green-800 font-semibold' : 'text-gray-900'}>{oliguriaCheck.oliguria ? 'OLIGURIA' : (urine24.totalMl === null ? 'No data' : 'OK')}</span></div>
              </div>

              <div className="mt-2">
                <strong>Contrast:</strong>
               <div className="text-sm ml-2">
  Volume (earliest proc): {contrastVolume ?? '—'} mL — eGFR (baseline): {egfrBaseline ?? '—'} — ratio: {finalResult.details?.contrastEgfr?.ratio ?? '—'} {finalResult.supporting?.highContrast ? <span className="text-green-800 font-semibold"> (HIGH)</span> : ''}
</div>


              <div className="mt-2">
                <strong>Hemodynamics:</strong>
                <div className="text-sm ml-2">MAP min (0–24): {finalResult.details.hemodynamicInsult.mapMin ?? '—'} — Vasopressor in 0–24h: {finalResult.details.hemodynamicInsult.vasopressorFound ? 'Yes' : 'No'} — <span className={finalResult.supporting.hemo ? 'text-green-800 font-semibold' : 'text-gray-900'}>{finalResult.supporting.hemo ? 'INSULT' : 'OK'}</span></div>
              </div>

              <div className="mt-2">
                <strong>Bleeding:</strong>
                <div className="text-sm ml-2">Baseline Hb: {finalResult.details.bleedingCheck.baselineHb ?? '—'} — 0–24 Hb: {finalResult.details.bleedingCheck.hb24 ?? '—'} — Drop: {finalResult.details.bleedingCheck.drop ?? '—'} {finalResult.supporting.bleed ? <span className="text-green-800 font-semibold"> (MAJOR)</span> : ''}</div>
              </div>

              <div className="mt-2">
                <strong>Auto confounders:</strong>
                <div className="text-sm ml-2">Nephrotoxins in 0–24h: {finalResult.details.confoundersAuto.nephrotoxins ? 'Yes' : 'No'} — Repeat contrast in 72h: {finalResult.details.confoundersAuto.repeatContrast ? 'Yes' : 'No'}</div>
              </div>

            </div>
          </div>

          {/* Right: Result & controls */}
          <div className="bg-white rounded shadow p-4">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Mihir CIN result</h2>

            <div className="text-sm space-y-2">
              <div className="flex items-center gap-2">
                <div><strong>Auto CIN flag:</strong></div>
                <div className={finalResult.mihir_flag ? 'text-green-800 font-semibold' : 'text-red-800 font-semibold'}>{finalResult.mihir_flag ? 'POSITIVE' : 'NEGATIVE'}</div>
              </div>

              <div><strong>Category:</strong> <span className="font-semibold">{finalResult.category}</span></div>

              <div className="mt-2">
                <strong>Supporting flags:</strong>
                <div className="mt-1 space-y-1 text-sm">
                  <div>Oliguria: <span className={finalResult.supporting.olig ? 'text-green-800 font-semibold' : 'text-gray-900'}>{finalResult.supporting.olig ? 'YES' : 'NO'}</span></div>
                  <div>High contrast burden: <span className={finalResult.supporting.highContrast ? 'text-green-800 font-semibold' : 'text-gray-900'}>{finalResult.supporting.highContrast ? 'YES' : 'NO'}</span></div>
                  <div>Hemodynamic insult: <span className={finalResult.supporting.hemo ? 'text-green-800 font-semibold' : 'text-gray-900'}>{finalResult.supporting.hemo ? 'YES' : 'NO'}</span></div>
                  <div>Major bleeding: <span className={finalResult.supporting.bleed ? 'text-green-800 font-semibold' : 'text-gray-900'}>{finalResult.supporting.bleed ? 'YES' : 'NO'}</span></div>
                </div>
              </div>

              <div className="mt-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={manualConfounder} onChange={(e) => setManualConfounder(e.target.checked)} />
                  <span className="text-sm">Manually mark sepsis/other major confounder (will set classification to Possible)</span>
                </label>
              </div>

              <div className="mt-2">
                <label className="block text-sm">Adjudicated by (optional)</label>
                <input value={adjudicatedBy ?? ''} onChange={(e) => setAdjudicatedBy(e.target.value)} placeholder="Reviewer name" className="mt-1 block w-full border rounded px-2 py-1 text-gray-900" />
              </div>

              <div className="mt-4">
                <button onClick={saveToSupabase} disabled={saving} className="bg-blue-800 text-white px-4 py-2 rounded hover:bg-blue-900 disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save Mihir CIN'}
                </button>
              </div>

              {existing && (
                <div className="mt-4 text-xs text-gray-700">
                  Last saved: {existing.calculated_at ? new Date(existing.calculated_at).toLocaleString() : '—'} — Category saved: <strong>{existing.mihir_cin_category}</strong>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Debug / details (collapsible) */}
        <details className="bg-white rounded shadow p-4 mb-8">
          <summary className="cursor-pointer text-sm font-medium">Show calculation debug (timestamps, matched rows)</summary>
          <div className="mt-3 text-xs text-gray-800 space-y-2">
            <div><strong>Procedures loaded:</strong> {procedures.length}</div>
            <div><strong>Baseline meta:</strong> {baselineMeta ? JSON.stringify(baselineMeta) : '—'}</div>
            <div><strong>scr24 meta:</strong> {scr24Meta ? JSON.stringify(scr24Meta) : '—'}</div>
            <div><strong>urine24:</strong> {JSON.stringify(urine24)}</div>
            <div><strong>contrastEgfr:</strong> {JSON.stringify(contrastEgfr)}</div>
            <div><strong>hemodynamicInsult:</strong> {JSON.stringify(hemodynamicInsult)}</div>
            <div><strong>bleedingCheck:</strong> {JSON.stringify(bleedingCheck)}</div>
            <div><strong>confoundersAuto:</strong> {JSON.stringify(confoundersAuto)}</div>
          </div>
        </details>
      </div>
    </div>
  );
}
