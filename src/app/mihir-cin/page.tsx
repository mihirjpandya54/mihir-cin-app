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

function dateOnlyToMiddayTs(dateOnly: string | null): number | null {
  if (!dateOnly) return null;
  try {
    const dt = new Date(dateOnly + 'T12:00:00');
    const t = dt.getTime();
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

function rowTimestampLabMeta(l: any): { ts: number | null; isDateOnly: boolean; dateOnlyStr?: string } {
  try {
    if (!l) return { ts: null, isDateOnly: false };
    if (l.lab_date) {
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

// CKD-EPI approximate (fallback)
function computeEgfrCkdEpi(creatinineMgDl: number | null, ageYears: number | null, sex: 'Male' | 'Female' | 'Other' | null) {
  if (creatinineMgDl == null || ageYears == null || !sex) return null;
  const k = sex === 'Female' ? 0.7 : 0.9;
  const alpha = sex === 'Female' ? -0.329 : -0.411;
  const minVal = Math.min(creatinineMgDl / k, 1);
  const maxVal = Math.max(creatinineMgDl / k, 1);
  const sexFactor = sex === 'Female' ? 1.018 : 1.0;
  const ageFactor = Math.pow(0.993, ageYears);
  const egfr = 142 * Math.pow(minVal, alpha) * Math.pow(maxVal, -1.209) * sexFactor * ageFactor;
  return Number.isFinite(egfr) ? Math.round(egfr * 100) / 100 : null;
}

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

  // load
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: active, error: e1 } = await supabase
          .from('active_patient')
          .select('patient_id')
          .eq('user_id', '00000000-0000-0000-0000-000000000001')
          .maybeSingle();
        if (e1) console.error('active_patient error', e1);
        const patientId = active?.patient_id;
        if (!patientId) {
          setLoading(false);
          return;
        }

        const { data: p, error: e2 } = await supabase
          .from('patient_details')
          .select('id, patient_name, ipd_number, age, sex, admission_datetime, procedure_datetime_cag, procedure_datetime_ptca')
          .eq('id', patientId)
          .maybeSingle();
        if (e2) console.error('patient fetch error', e2);
        setPatient(p ?? null);

        // procedures: try view, fallback to raw tables
        let procRows: any[] = [];
        const { data: pv, error: pvErr } = await supabase
          .from('procedures_view')
          .select('id, patient_id, type, procedure_datetime, contrast_volume_ml')
          .eq('patient_id', patientId);
        if (!pvErr && pv && pv.length) {
          procRows = pv;
        } else {
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

        procRows = (procRows || [])
          .filter((x: any) => x?.procedure_datetime)
          .map((r: any) => ({ ...r, procedure_datetime: new Date(r.procedure_datetime).toISOString() }))
          .sort((a: any, b: any) => new Date(a.procedure_datetime).getTime() - new Date(b.procedure_datetime).getTime());
        setProcedures(procRows);

        const { data: labData, error: labErr } = await supabase
          .from('lab_results')
          .select('*')
          .eq('patient_id', patientId)
          .order('lab_date', { ascending: true });
        if (labErr) console.error('lab fetch error', labErr);
        setLabs((labData || []).map((r: any) => ({ ...r })));

        const { data: fData, error: fErr } = await supabase
          .from('fluid_chart')
          .select('*')
          .eq('patient_id', patientId)
          .order('fluid_date', { ascending: true });
        if (fErr) console.error('fluid fetch error', fErr);
        setFluids((fData || []).map((r: any) => ({ ...r })));

        const { data: bpData, error: bpErr } = await supabase
          .from('bp_chart')
          .select('*')
          .eq('patient_id', patientId)
          .order('bp_date', { ascending: true });
        if (bpErr) console.error('bp fetch error', bpErr);
        setBpRows((bpData || []).map((r: any) => ({ ...r })));

        const { data: medData, error: medErr } = await supabase
          .from('medications')
          .select('*')
          .eq('patient_id', patientId)
          .order('med_date', { ascending: true });
        if (medErr) console.error('medications fetch error', medErr);
        setMeds((medData || []).map((r: any) => ({ ...r })));

        const { data: exist, error: existErr } = await supabase
          .from('mihir_cin_definition')
          .select('*')
          .eq('patient_id', patientId)
          .maybeSingle();
        if (existErr) console.error('existing mihir fetch error', existErr);
        setExisting(exist ?? null);
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

  const firstProcedure = useMemo(() => {
    return procedures && procedures.length ? procedures[0] : null;
  }, [procedures]);

  const localDateYMD = (ts: number) => new Date(ts).toLocaleDateString('en-CA');

  // ---------- Baseline ----------
  const baselineMeta: any = useMemo(() => {
    if (!firstProcedure || !labs?.length) return null;
    const firstProcTs = new Date(firstProcedure.procedure_datetime).getTime();
    if (!Number.isFinite(firstProcTs)) return null;

    const labMeta = labs
      .map(l => {
        const meta = rowTimestampLabMeta(l);
        return { ...l, ts: meta.ts, isDateOnly: meta.isDateOnly, dateOnlyStr: meta.dateOnlyStr ?? null };
      })
      .filter((l: any) => l.scr != null && l.ts !== null);

    // strict pre-procedure labs
    const strictCandidates = labMeta
      .filter((l: any) => l.ts !== null && l.ts < firstProcTs)
      .filter((l: any) => {
        if (l.isDateOnly) {
          const labLocal = localDateYMD(l.ts);
          const procLocal = localDateYMD(firstProcTs);
          if (labLocal === procLocal) return false;
        }
        return true;
      })
      .sort((a: any, b: any) => b.ts - a.ts); // latest first

    if (strictCandidates.length) {
      const chosen = strictCandidates[0];
      const chosenScr = clampNum(chosen.scr);
      const chosenTs = chosen.ts as number;
      const sevenBefore = chosenTs - 7 * 24 * HOURS;
      const earlier = labMeta.filter((l: any) => l.ts !== null && l.ts >= sevenBefore && l.ts < chosenTs).sort((a: any, b: any) => b.ts - a.ts);
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
    const fallbackCandidates = labMeta.filter((l: any) => l.ts !== null && l.isDateOnly && localDateYMD(l.ts) === procLocalDate).sort((a: any, b: any) => b.ts - a.ts);
    if (fallbackCandidates.length) {
      const chosen = fallbackCandidates[0];
      return { value: clampNum(chosen.scr), ts: chosen.ts, dateLabel: chosen.lab_date ?? chosen.created_at ?? null, stable: false, fallback: true };
    }

    return null;
  }, [firstProcedure, labs]);

  // ---------- scr 0-24h (PICK LATEST WITHIN WINDOW) ----------
  const scr24Meta: any = useMemo(() => {
    if (!firstProcedure || !labs?.length) return null;
    const procTs = new Date(firstProcedure.procedure_datetime).getTime();
    const endTs = procTs + 24 * HOURS;
    const labMeta = labs.map(l => ({ ...l, meta: rowTimestampLabMeta(l) }));
    // pick latest lab with ts within [procTs, endTs]
    const candidates = labMeta
      .filter((l: any) => l.meta.ts !== null && l.scr != null && l.meta.ts >= procTs && l.meta.ts <= endTs)
      .sort((a: any, b: any) => b.meta.ts - a.meta.ts); // latest first
    if (candidates.length) {
      const chosen = candidates[0];
      return { value: clampNum(chosen.scr), ts: chosen.meta.ts, dateLabel: chosen.lab_date ?? chosen.created_at ?? null };
    }
    // fallback: date-only labs where lab_date equals procedure date (pick latest)
    const procLocal = new Date(procTs).toLocaleDateString('en-CA');
    const fallback = labMeta
      .filter((l: any) => l.meta.ts !== null && l.scr != null && l.meta.isDateOnly && localDateYMD(l.meta.ts) === procLocal)
      .sort((a: any, b: any) => b.meta.ts - a.meta.ts);
    if (fallback.length) {
      const chosen = fallback[0];
      return { value: clampNum(chosen.scr), ts: chosen.meta.ts, dateLabel: chosen.lab_date ?? chosen.created_at ?? null, fallback: true };
    }
    return null;
  }, [firstProcedure, labs]);

  // ---------- urine 0-24h (prefer timing_label or fluid_date same day) ----------
  const urine24: any = useMemo(() => {
    if (!firstProcedure || !fluids?.length) return { totalMl: null, dataPresent: false };
    const procTs = new Date(firstProcedure.procedure_datetime).getTime();
    const endTs = procTs + 24 * HOURS;
    const fluidMeta = fluids.map((f: any) => ({ ...f, meta: rowTimestampFluidMeta(f) }));

    // prefer explicit 0-24 labeled rows
    const labeled = fluidMeta.filter((f: any) => {
      try {
        const lbl = (f.timing_label ?? '').toString().toLowerCase();
        if (lbl.includes('0-24') || lbl.includes('0–24') || lbl.includes('0 - 24')) return true;
        return false;
      } catch { return false; }
    });

    if (labeled.length) {
      const total = labeled.reduce((s: number, x: any) => s + (clampNum(x.output_ml) || 0), 0);
      return { totalMl: total, dataPresent: true, source: 'timing_label' };
    }

    // else prefer fluid_date = procedure local date (date-only rows)
    const procLocal = new Date(procTs).toLocaleDateString('en-CA');
    const dateRows = fluidMeta.filter((f: any) => f.meta.ts !== null && f.meta.isDateOnly && localDateYMD(f.meta.ts) === procLocal);
    if (dateRows.length) {
      const total = dateRows.reduce((s: number, x: any) => s + (clampNum(x.output_ml) || 0), 0);
      return { totalMl: total, dataPresent: true, source: 'fluid_date' };
    }

    // last resort: sum any entries with timestamps within procTs..endTs (non-date-only)
    const tsRows = fluidMeta.filter((f: any) => f.meta.ts !== null && !f.meta.isDateOnly && f.meta.ts >= procTs && f.meta.ts <= endTs);
    if (tsRows.length) {
      const total = tsRows.reduce((s: number, x: any) => s + (clampNum(x.output_ml) || 0), 0);
      return { totalMl: total, dataPresent: true, source: 'timestamp' };
    }

    return { totalMl: null, dataPresent: false };
  }, [firstProcedure, fluids]);

  // ---------- contrast volume (earliest procedure) ----------
  const contrastVolume = useMemo(() => {
    if (!firstProcedure) return null;
    const v = (firstProcedure.contrast_volume_ml ?? firstProcedure.contrast_volume ?? null);
    return clampNum(v);
  }, [firstProcedure]);

  // ---------- egfr baseline ----------
  const egfrBaseline: any = useMemo(() => {
    if (!baselineMeta) return null;
    // try to find lab row used as baseline by matching ts or dateLabel
    const candidate = labs.find(l => {
      const meta = rowTimestampLabMeta(l);
      if (meta.ts === null) return false;
      const scrVal = clampNum(l.scr);
      if (scrVal != null && baselineMeta.value != null && Math.abs(scrVal - baselineMeta.value) < 0.0001) return true;
      if (baselineMeta.dateLabel && l.lab_date && String(l.lab_date) === String(baselineMeta.dateLabel)) return true;
      // match by timestamp closeness (within 1 second)
      if (baselineMeta.ts && meta.ts && Math.abs(baselineMeta.ts - meta.ts) < 2000) return true;
      return false;
    });
    if (candidate && candidate.egfr) return clampNum(candidate.egfr);
    const creat = baselineMeta.value ?? null;
    const age = patient?.age ?? null;
    const sex = patient?.sex ?? null;
    if (creat == null) return null;
    return computeEgfrCkdEpi(creat, age ?? null, sex ?? null);
  }, [baselineMeta, labs, patient]);

  // ---------- hemodynamic insult ----------
  const hemodynamicInsult: any = useMemo(() => {
    if (!firstProcedure) return { flag: null, reason: null, mapMin: null, vasopressorFound: null };
    const procTs = new Date(firstProcedure.procedure_datetime).getTime();

    const candidates = bpRows.filter((b: any) => {
      try {
        if (!b) return false;
        const label = (b.timing_label ?? '').toString().toLowerCase();
        if (label.includes('0-24') || label.includes('0–24') || label.includes('0 - 24')) return true;
        if (b.bp_date) {
          const bpTs = dateOnlyToMiddayTs(String(b.bp_date));
          if (bpTs) return localDateYMD(bpTs) === localDateYMD(procTs);
        }
        return false;
      } catch { return false; }
    });

    const mins = candidates
      .map((c: any) => clampNum((c as any).map_min ?? (c as any).mapMin ?? (c as any).map_minimum ?? null))
      .filter((v: number | null): v is number => v !== null);

    let mapMin: number | null = null;
    if (mins.length > 0) mapMin = Math.min(...mins);

    const mapInsult = mapMin !== null ? mapMin < 65 : false;

    const procLocal = new Date(procTs).toLocaleDateString('en-CA');
    const procNextLocal = new Date(procTs + 24 * HOURS).toLocaleDateString('en-CA');
    const vasopressFound = meds.some((m: any) => {
      try {
        const d = m.med_date ? String(m.med_date) : null;
        if (!d) return false;
        if ((d === procLocal) || (d === procNextLocal)) {
          return Boolean(m.is_vasopressor_inotrope);
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
  const bleedingCheck: any = useMemo(() => {
    if (!firstProcedure) return { major: null, baselineHb: null, hb24: null, drop: null };
    // baseline Hb: try to get from the baseline lab row chosen earlier
    let baselineHb: number | null = null;
    if (baselineMeta?.ts) {
      const matched = labs.map(l => ({ ...l, meta: rowTimestampLabMeta(l) }))
        .find((l: any) => l.meta.ts !== null && Math.abs((l.meta.ts ?? 0) - (baselineMeta.ts ?? 0)) < 2000 && l.hb != null);
      if (matched) baselineHb = clampNum(matched.hb);
    }
    if (baselineHb == null) {
      // fallback: most recent hb before baselineMeta.ts
      const candidate = labs.map(l => ({ ...l, meta: rowTimestampLabMeta(l) }))
        .filter((l: any) => l.meta.ts !== null && l.hb != null && (baselineMeta?.ts ? l.meta.ts < baselineMeta.ts : true))
        .sort((a: any, b: any) => b.meta.ts - a.meta.ts)[0];
      if (candidate) baselineHb = clampNum(candidate.hb);
    }

    const procTs = new Date(firstProcedure.procedure_datetime).getTime();
    const endTs = procTs + 24 * HOURS;
    // pick latest hb within window
    const within = labs.map(l => ({ ...l, meta: rowTimestampLabMeta(l) }))
      .filter((l: any) => l.meta.ts !== null && l.hb != null && l.meta.ts >= procTs && l.meta.ts <= endTs)
      .sort((a: any, b: any) => b.meta.ts - a.meta.ts);
    let hb24: number | null = null;
    if (within.length) hb24 = clampNum(within[0].hb);
    // fallback: date-only equal to proc date
    if (hb24 == null) {
      const procLocal = new Date(procTs).toLocaleDateString('en-CA');
      const fallback = labs.map(l => ({ ...l, meta: rowTimestampLabMeta(l) }))
        .filter((l: any) => l.meta.ts !== null && l.meta.isDateOnly && localDateYMD(l.meta.ts) === procLocal && l.hb != null)
        .sort((a: any, b: any) => b.meta.ts - a.meta.ts)[0];
      if (fallback) hb24 = clampNum(fallback.hb);
    }

    const drop = (baselineHb != null && hb24 != null) ? Number(((baselineHb ?? 0) - (hb24 ?? 0)).toFixed(2)) : null;
    const major = drop !== null ? (drop >= 2.0) : null;
    return { major, baselineHb, hb24, drop };
  }, [baselineMeta, labs, firstProcedure]);

  // ---------- oliguria check ----------
  const oliguriaCheck: any = useMemo(() => {
    const weightKg = 70;
    const threshold = 0.5 * weightKg * 24; // 840 mL
    const total = urine24?.totalMl ?? null;
    if (total === null) return { oliguria: null, totalMl: null, threshold };
    const olig = total < threshold;
    return { oliguria: olig, totalMl: total, threshold };
  }, [/* depends on urine24 - declared below, so we'll reference urine24 via closure */]);

  // Because oliguriaCheck used urine24, we recalc via wrapping variable:
  const oliguriaCheckFinal = useMemo(() => {
    const weightKg = 70;
    const threshold = 0.5 * weightKg * 24;
    const total = urine24?.totalMl ?? null;
    if (total === null) return { oliguria: null, totalMl: null, threshold };
    return { oliguria: total < threshold, totalMl: total, threshold };
  }, [/* urine24 included next */]);

  // ---------- contrast/egfr ----------
  const contrastEgfr: any = useMemo(() => {
    if (contrastVolume == null || egfrBaseline == null) return { ratio: null, high: null };
    if (egfrBaseline === 0) return { ratio: null, high: null };
    const r = Number((contrastVolume / egfrBaseline).toFixed(3));
    const high = r > 3.7;
    return { ratio: r, high };
  }, [contrastVolume, egfrBaseline]);

  // ---------- confoundersAuto ----------
  const confoundersAuto: any = useMemo(() => {
    if (!firstProcedure) return { nephrotoxins: null, repeatContrast: null, any: null };
    const procTs = new Date(firstProcedure.procedure_datetime).getTime();
    const procLocal = new Date(procTs).toLocaleDateString('en-CA');
    const procNextLocal = new Date(procTs + 24 * HOURS).toLocaleDateString('en-CA');
    const nephroFound = meds.some((m: any) => {
      const d = m.med_date ? String(m.med_date) : null;
      if (!d) return false;
      if ((d === procLocal) || (d === procNextLocal)) return Boolean(m.is_nephrotoxic);
      return false;
    });
    const repeat = procedures.some((pr: any, idx: number) => {
      if (idx === 0) return false;
      const ts = new Date(pr.procedure_datetime).getTime();
      return ts <= (procTs + 72 * HOURS);
    });
    const any = nephroFound || repeat;
    return { nephrotoxins: nephroFound, repeatContrast: repeat, any };
  }, [firstProcedure, meds, procedures]);

  // ---------- Final logic ----------
  const finalResult: any = useMemo(() => {
    const base = baselineMeta?.value ?? null;
    const scr24 = scr24Meta?.value ?? null;
    if (!firstProcedure) return { canAssess: false, reason: 'no procedure' };
    const within24h = true;
    let absoluteDelta: number | null = null;
    let relativeDelta: number | null = null;
    if (base != null && scr24 != null) {
      absoluteDelta = Number((scr24 - base).toFixed(3));
      if (base !== 0) relativeDelta = Number((scr24 / base).toFixed(3));
    }

    const olig = oliguriaCheckFinal.oliguria === true;
    const highContrast = contrastEgfr.high === true;
    const hemo = hemodynamicInsult.flag === true;
    const bleed = bleedingCheck.major === true;

    let mihir_flag = false;
    let category: 'Definite' | 'Possible' | 'Negative' | 'Indeterminate' = 'Indeterminate';

    if (absoluteDelta !== null && absoluteDelta >= 0.30) {
      mihir_flag = true;
    } else if (absoluteDelta !== null && absoluteDelta >= 0.10) {
      const supportingCount = [olig, highContrast, hemo, bleed].filter(Boolean).length;
      if (supportingCount >= 1) mihir_flag = true;
    } else {
      mihir_flag = false;
    }

    if (mihir_flag) {
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
  }, [baselineMeta, scr24Meta, urine24, contrastVolume, egfrBaseline, contrastEgfr, hemodynamicInsult, bleedingCheck, confoundersAuto, manualConfounder, firstProcedure, oliguriaCheckFinal]);

  // safe wrapper for JSX
  const safeFinal: any = {
    ...(finalResult ?? {}),
    details: (finalResult?.details ?? {}),
    supporting: (finalResult?.supporting ?? {})
  };

  // ---------- Save function ----------
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
        sepsis_or_other_major_cause: manualConfounder || (finalResult.details?.confoundersAuto?.any ?? false),
        within_24h: true,
        adjudicated_by: adjudicatedBy ?? null,
        calculated_at: new Date().toISOString(),
        baseline_scr: baselineMeta?.value ?? null,
        scr_24h: scr24Meta?.value ?? null
      };

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
      alert(`Save failed — ${err?.message ?? 'check console'}`);
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
              <div><strong>ΔSCr (abs):</strong> {fmt(safeFinal.absoluteDelta)} mg/dL</div>
              <div><strong>ΔSCr (rel):</strong> {fmt(safeFinal.relativeDelta)} ×</div>

              <div className="mt-2">
                <strong>Urine (0–24 h):</strong>
                <div className="text-sm ml-2">Total: {urine24.totalMl ?? 'No data'} mL — Threshold: {oliguriaCheckFinal.threshold} mL — <span className={oliguriaCheckFinal.oliguria ? 'text-green-800 font-semibold' : 'text-gray-900'}>{oliguriaCheckFinal.oliguria ? 'OLIGURIA' : (urine24.totalMl === null ? 'No data' : 'OK')}</span></div>
              </div>

              <div className="mt-2">
                <strong>Contrast:</strong>
                <div className="text-sm ml-2">
                  Volume (earliest proc): {contrastVolume ?? '—'} mL — eGFR (baseline): {egfrBaseline ?? '—'} — ratio: {safeFinal.details?.contrastEgfr?.ratio ?? '—'} {safeFinal.supporting?.highContrast ? <span className="text-green-800 font-semibold"> (HIGH)</span> : ''}
                </div>
              </div>

              <div className="mt-2">
                <strong>Hemodynamics:</strong>
                <div className="text-sm ml-2">MAP min (0–24): {safeFinal.details?.hemodynamicInsult?.mapMin ?? '—'} — Vasopressor in 0–24h: {safeFinal.details?.hemodynamicInsult?.vasopressorFound ? 'Yes' : 'No'} — <span className={safeFinal.supporting?.hemo ? 'text-green-800 font-semibold' : 'text-gray-900'}>{safeFinal.supporting?.hemo ? 'INSULT' : 'OK'}</span></div>
              </div>

              <div className="mt-2">
                <strong>Bleeding:</strong>
                <div className="text-sm ml-2">Baseline Hb: {safeFinal.details?.bleedingCheck?.baselineHb ?? '—'} — 0–24 Hb: {safeFinal.details?.bleedingCheck?.hb24 ?? '—'} — Drop: {safeFinal.details?.bleedingCheck?.drop ?? '—'} {safeFinal.supporting?.bleed ? <span className="text-green-800 font-semibold"> (MAJOR)</span> : ''}</div>
              </div>

              <div className="mt-2">
                <strong>Auto confounders:</strong>
                <div className="text-sm ml-2">Nephrotoxins in 0–24h: {safeFinal.details?.confoundersAuto?.nephrotoxins ? 'Yes' : 'No'} — Repeat contrast in 72h: {safeFinal.details?.confoundersAuto?.repeatContrast ? 'Yes' : 'No'}</div>
              </div>
            </div>
          </div>

          {/* Right: Result & controls */}
          <div className="bg-white rounded shadow p-4">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Mihir CIN result</h2>

            <div className="text-sm space-y-2">
              <div className="flex items-center gap-2">
                <div><strong>Auto CIN flag:</strong></div>
                <div className={safeFinal.mihir_flag ? 'text-green-800 font-semibold' : 'text-red-800 font-semibold'}>{safeFinal.mihir_flag ? 'POSITIVE' : 'NEGATIVE'}</div>
              </div>

              <div><strong>Category:</strong> <span className="font-semibold">{safeFinal.category}</span></div>

              <div className="mt-2">
                <strong>Supporting flags:</strong>
                <div className="mt-1 space-y-1 text-sm">
                  <div>Oliguria: <span className={safeFinal.supporting?.olig ? 'text-green-800 font-semibold' : 'text-gray-900'}>{safeFinal.supporting?.olig ? 'YES' : 'NO'}</span></div>
                  <div>High contrast burden: <span className={safeFinal.supporting?.highContrast ? 'text-green-800 font-semibold' : 'text-gray-900'}>{safeFinal.supporting?.highContrast ? 'YES' : 'NO'}</span></div>
                  <div>Hemodynamic insult: <span className={safeFinal.supporting?.hemo ? 'text-green-800 font-semibold' : 'text-gray-900'}>{safeFinal.supporting?.hemo ? 'YES' : 'NO'}</span></div>
                  <div>Major bleeding: <span className={safeFinal.supporting?.bleed ? 'text-green-800 font-semibold' : 'text-gray-900'}>{safeFinal.supporting?.bleed ? 'YES' : 'NO'}</span></div>
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

        {/* Debug collapsed by default — remove or hide in production */}
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
            <div><strong>Final result (safe):</strong> {JSON.stringify(safeFinal)}</div>
          </div>
        </details>
      </div>
    </div>
  );
}
