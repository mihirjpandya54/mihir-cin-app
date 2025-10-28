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
  procedure_datetime_cag: string | null;
  procedure_datetime_ptca: string | null;
};

type LabRow = {
  id: string;
  lab_date: string | null;
  scr?: number | null;
  created_at?: string | null;
};

type FluidRow = {
  id: string;
  fluid_date: string | null;
  output_ml?: number | null;
  inserted_at?: string | null;
};

type CinRow = {
  id?: string | null;
  patient_id: string;
  procedure_type: string; // 'CAG' | 'PTCA' | 'FINAL' etc.
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
const HOURS = 1000 * 60 * 60;

function clamp(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Number(n);
}

function formatLocal(ts?: number | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

/** prefer lab_date (sample date) over created_at; use mid-day to avoid midnight timezone pitfalls */
function rowTimestampLab(l: LabRow) {
  if (l.lab_date) {
    return new Date(l.lab_date + 'T12:00:00').getTime();
  }
  if (l.created_at) return new Date(l.created_at).getTime();
  return null;
}
function rowTimestampFluid(f: FluidRow) {
  if (f.fluid_date) {
    return new Date(f.fluid_date + 'T12:00:00').getTime();
  }
  if (f.inserted_at) return new Date(f.inserted_at).getTime();
  return null;
}

/** map status to badge */
function statusBadge(status: 'positive' | 'negative' | 'not_assessable') {
  if (status === 'positive') return <span className="px-2 py-0.5 rounded bg-green-600 text-white text-sm font-semibold">POSITIVE</span>;
  if (status === 'negative') return <span className="px-2 py-0.5 rounded bg-red-600 text-white text-sm font-semibold">NEGATIVE</span>;
  return <span className="px-2 py-0.5 rounded bg-gray-400 text-white text-sm font-semibold">N/A</span>;
}

/** Present small indicator */
function Present({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="text-gray-700">—</span>;
  return ok ? <span className="text-green-700 font-semibold">✅ Present</span> : <span className="text-red-700 font-semibold">❌ Absent</span>;
}

// ---------- Component ----------
export default function DefinitionsPage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [labs, setLabs] = useState<LabRow[]>([]);
  const [fluids, setFluids] = useState<FluidRow[]>([]);
  const [cinRows, setCinRows] = useState<CinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // local UI state
  const [localDialysis, setLocalDialysis] = useState<Record<string, boolean>>({});
  const [localUrineOverride, setLocalUrineOverride] = useState<Record<string, boolean | null>>({});

  // load patient + labs + fluids + cin rows
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

        const { data: p } = await supabase
          .from('patient_details')
          .select('id, patient_name, ipd_number, procedure_datetime_cag, procedure_datetime_ptca')
          .eq('id', patientId)
          .single();
        if (p) setPatient(p);

        const { data: labData } = await supabase
          .from('lab_results')
          .select('id, lab_date, scr, created_at')
          .eq('patient_id', patientId)
          .order('lab_date', { ascending: true });
        setLabs((labData || []).map((l: any) => ({ id: l.id, lab_date: l.lab_date, scr: clamp(l.scr), created_at: l.created_at })));

        const { data: fluidData } = await supabase
          .from('fluid_chart')
          .select('id, fluid_date, output_ml, inserted_at')
          .eq('patient_id', patientId)
          .order('fluid_date', { ascending: true });
        setFluids((fluidData || []).map((f: any) => ({ id: f.id, fluid_date: f.fluid_date, output_ml: clamp(f.output_ml), inserted_at: f.inserted_at })));

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

  // Build exposures timeline from available procedure timestamps
  const exposures = useMemo(() => {
    if (!patient) return [];
    const arr: { type: 'CAG' | 'PTCA'; datetime: string }[] = [];
    if (patient.procedure_datetime_cag) arr.push({ type: 'CAG', datetime: patient.procedure_datetime_cag });
    if (patient.procedure_datetime_ptca) arr.push({ type: 'PTCA', datetime: patient.procedure_datetime_ptca });
    // sort ascending
    arr.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
    return arr;
  }, [patient]);

  // pick a single baseline: latest lab at or before the first exposure (inclusive)
  const baseline = useMemo(() => {
    if (!exposures.length || !labs.length) return null;
    const firstTs = new Date(exposures[0].datetime).getTime();
    // find labs with ts <= firstTs
    const candidates = labs
      .map(l => ({ ...l, ts: rowTimestampLab(l) }))
      .filter(l => l.ts !== null && (l.ts as number) <= firstTs && l.scr != null)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (!candidates.length) return null;
    const chosen = candidates[0];
    return { value: chosen.scr as number, date: chosen.lab_date ?? chosen.created_at ?? null, ts: chosen.ts as number };
  }, [exposures, labs]);

  // compute CIN for any exposure anchor (exposure.datetime)
  function computeForAnchor(anchorISO: string, anchorType: string, useBaseline: { value: number; date: string | null; ts: number } | null) {
    const procTs = new Date(anchorISO).getTime();

    // if no baseline -> many definitions not assessable
    if (!useBaseline) {
      // still compute urine/dialysis possibility
      // urine 0-24h
      const startUrine = procTs;
      const endUrine = procTs + 24 * HOURS;
      const urineEntries = fluids
        .map(f => ({ ...f, ts: rowTimestampFluid(f) }))
        .filter(f => f.ts !== null && f.output_ml != null && (f.ts as number) >= startUrine && (f.ts as number) <= endUrine);
      const urineTotal = urineEntries.reduce((s, x) => s + (x.output_ml ?? 0), 0);
      const urineThreshold = 0.5 * 70 * 24;
      const urineLow = urineTotal < urineThreshold;

      return {
        anchorISO,
        anchorType,
        baselinePresent: false,
        baselineValue: null,
        baselineDate: null,
        peaks: { peak48: null, peak72: null, peak7d: null },
        diffs: { abs48: null, rel48: null, abs72: null, rel72: null, abs7: null, rel7: null },
        urineTotal,
        urineThreshold,
        urineDataPresent: urineEntries.length > 0,
        urineLowAuto: urineLow,
        kdigo: { status: 'not_assessable' as const, via: null, stage: null },
        esur: { status: 'not_assessable' as const },
        acr: { status: 'not_assessable' as const },
        ncdr: { status: 'not_assessable' as const },
      };
    }

    // helper: peak SCr in inclusive [startHours, endHours] after proc
    function peakInWindow(startHours: number, endHours: number) {
      const start = procTs + startHours * HOURS;
      const end = procTs + endHours * HOURS;
      const arr = labs
        .map(l => ({ ...l, ts: rowTimestampLab(l) }))
        .filter(l => l.ts !== null && l.scr != null && (l.ts as number) >= start && (l.ts as number) <= end)
        .map(l => ({ value: Number(l.scr), date: l.lab_date ?? l.created_at }));
      if (!arr.length) return null;
      arr.sort((a, b) => b.value - a.value);
      return arr[0]; // return object with value & date (peak)
    }

    const peak48 = peakInWindow(0, 48);
    const peak72 = peakInWindow(0, 72);
    const peak7d = (() => {
      const start = procTs;
      const end = procTs + 7 * 24 * HOURS;
      const arr = labs
        .map(l => ({ ...l, ts: rowTimestampLab(l) }))
        .filter(l => l.ts !== null && l.scr != null && (l.ts as number) >= start && (l.ts as number) <= end)
        .map(l => ({ value: Number(l.scr), date: l.lab_date ?? l.created_at }));
      if (!arr.length) return null;
      arr.sort((a, b) => b.value - a.value);
      return arr[0];
    })();

    // diffs
    const baselineVal = useBaseline.value;
    const abs48 = peak48 ? Number((peak48.value - baselineVal).toFixed(3)) : null;
    const rel48 = peak48 ? Number(((peak48.value / baselineVal)).toFixed(3)) : null; // ratio
    const abs72 = peak72 ? Number((peak72.value - baselineVal).toFixed(3)) : null;
    const rel72 = peak72 ? Number(((peak72.value / baselineVal)).toFixed(3)) : null;
    const abs7 = peak7d ? Number((peak7d.value - baselineVal).toFixed(3)) : null;
    const rel7 = peak7d ? Number(((peak7d.value / baselineVal)).toFixed(3)) : null;

    // urine
    const startUrine = procTs;
    const endUrine = procTs + 24 * HOURS;
    const urineEntries = fluids
      .map(f => ({ ...f, ts: rowTimestampFluid(f) }))
      .filter(f => f.ts !== null && f.output_ml != null && (f.ts as number) >= startUrine && (f.ts as number) <= endUrine);
    const urineTotal = urineEntries.reduce((s, x) => s + (x.output_ml ?? 0), 0);
    const urineThreshold = 0.5 * 70 * 24; // 840 mL / 24h
    const urineLowAuto = urineEntries.length > 0 ? urineTotal < urineThreshold : null; // null => no urine data in window

    // KDIGO rules (we'll return status as 'positive'|'negative'|'not_assessable')
    // KDIGO positive if any:
    // - absRise >= 0.3 mg/dL within 48h (we require peak48 present)
    // - relRise >= 1.5 within 7d (peak7d present)
    // - urine output low (urine data present and low)
    // - dialysis manual (external - to be combined when presenting)
    const cond_abs48 = abs48 !== null && abs48 >= 0.3;
    const cond_rel7 = rel7 !== null && rel7 >= 1.5; // ratio >=1.5
    const urineCond = urineLowAuto === null ? null : urineLowAuto; // true/false/null
    // determine assessability:
    const kdigoAssessable = cond_abs48 || cond_rel7 || urineCond !== null || true; // KDIGO can be assessed if baseline present and any of windows have labs OR urine/dialysis could be used. We'll set not_assessable only if no labs and no urine.
    // but to be strict: if no SCr in any required windows AND no urine -> not_assessable
    const hasScrInAny = Boolean(peak48 || peak72 || peak7d);
    let kdigoStatus: 'positive' | 'negative' | 'not_assessable' = 'not_assessable';
    let kdigoVia: 'scr' | 'urine' | 'dialysis' | null = null;
    let kdigoStage: 1 | 2 | 3 | null = null;

    if (!hasScrInAny && urineCond === null) {
      kdigoStatus = 'not_assessable';
    } else {
      // if any criteria is true -> positive
      if (cond_abs48 || cond_rel7 || urineCond === true) {
        kdigoStatus = 'positive';
        kdigoVia = cond_abs48 || cond_rel7 ? 'scr' : 'urine';
      } else {
        // if at least one SCr exists in relevant windows we can call negative
        if (hasScrInAny || urineCond !== null) kdigoStatus = 'negative';
        else kdigoStatus = 'not_assessable';
      }

      // KDIGO staging (if dialysis manual flagged later we'll override to Stage 3)
      // Use the peak across 7d if present; else peak72; else peak48
      const peakForStageVal = peak7d?.value ?? peak72?.value ?? peak48?.value ?? null;
      if (peakForStageVal !== null) {
        const ratio = peakForStageVal / baselineVal;
        if (peakForStageVal >= 4.0 || ratio >= 3.0) kdigoStage = 3;
        else if (ratio >= 2.0) kdigoStage = 2;
        else if (cond_abs48 || ratio >= 1.5) kdigoStage = 1;
        else kdigoStage = null;
      } else {
        kdigoStage = null;
      }
    }

    // ESUR/ACR: window 0-72h: positive if abs >= 0.5 OR relative >= 1.25
    let esurStatus: 'positive' | 'negative' | 'not_assessable' = 'not_assessable';
    if (peak72) {
      const abs = abs72;
      const rel = rel72; // ratio
      const condA = abs !== null && abs >= 0.5;
      const condB = rel !== null && rel >= 1.25;
      esurStatus = (condA || condB) ? 'positive' : 'negative';
    } else {
      esurStatus = 'not_assessable';
    }
    // ACR same as ESUR
    const acrStatus = esurStatus;

    // NCDR: window 0-48h: abs >= 0.3 OR rel >= 1.5 OR dialysis; only valid if PTCA present in episode (we'll handle at usage)
    let ncdrStatus: 'positive' | 'negative' | 'not_assessable' = 'not_assessable';
    if (peak48) {
      const condA = abs48 !== null && abs48 >= 0.3;
      const condB = rel48 !== null && rel48 >= 1.5;
      ncdrStatus = (condA || condB) ? 'positive' : 'negative';
    } else {
      ncdrStatus = 'not_assessable';
    }

    return {
      anchorISO,
      anchorType,
      baselinePresent: true,
      baselineValue: baselineVal,
      baselineDate: useBaseline.date,
      peaks: { peak48: peak48 ? { value: peak48.value, date: peak48.date } : null, peak72: peak72 ? { value: peak72.value, date: peak72.date } : null, peak7d: peak7d ? { value: peak7d.value, date: peak7d.date } : null },
      diffs: { abs48, rel48, abs72, rel72, abs7, rel7 },
      urineTotal,
      urineThreshold,
      urineDataPresent: urineEntries.length > 0,
      urineLowAuto,
      kdigo: { status: kdigoStatus, via: kdigoVia, stage: kdigoStage },
      esur: { status: esurStatus },
      acr: { status: acrStatus },
      ncdr: { status: ncdrStatus },
    };
  }

  // Build per-exposure results (for each procedure) and a FINAL episode anchored to last exposure
  const results = useMemo(() => {
    if (!exposures.length) return [];
    const base = baseline;
    const list: any[] = [];
    // per exposure
    exposures.forEach((ex, idx) => {
      list.push({ label: `Exposure ${idx + 1} (${ex.type})`, type: ex.type, datetime: ex.datetime, result: computeForAnchor(ex.datetime, ex.type, base) });
    });
    // final episode anchored to last exposure
    const last = exposures[exposures.length - 1];
    list.push({ label: `FINAL (episode)`, type: 'FINAL', datetime: last.datetime, result: computeForAnchor(last.datetime, 'FINAL', base) });
    return { base, list, hasPTCA: exposures.some(e => e.type === 'PTCA') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exposures, labs, fluids, baseline]);

  // sync localDialysis and localUrineOverride from cinRows when they load
  useEffect(() => {
    const nd: Record<string, boolean> = {};
    const nu: Record<string, boolean | null> = {};
    for (const row of cinRows) {
      nd[row.procedure_type] = !!row.dialysis_initiated;
      nu[row.procedure_type] = row.urine_output_low ?? null;
    }
    setLocalDialysis(prev => ({ ...nd, ...prev }));
    setLocalUrineOverride(prev => ({ ...nu, ...prev }));
  }, [cinRows]);

  // Upsert/save: update per-exposure (CAG/PTCA) and FINAL
  async function saveAll() {
    if (!patient || !results) return;
    setSaving(true);
    try {
      const toUpsert: CinRow[] = [];
      // loop results.list (contains exposures and FINAL)
      for (const item of results.list) {
        const procType = item.type === 'FINAL' ? 'FINAL' : item.type; // string
        // we only upsert for types we want to store: CAG, PTCA, FINAL
        if (!['CAG', 'PTCA', 'FINAL'].includes(procType)) continue;
        const existing = cinRows.find(c => c.procedure_type === procType);

        // determine dialysis & urine flags from local UI override or existing data
        const dialysisFlag = !!localDialysis[procType];
        const urineOverride = localUrineOverride[procType];
        const urineFlag = urineOverride === null || urineOverride === undefined ? !!item.result.urineLowAuto : !!urineOverride;

        // KDIGO final combines SCr/urine and dialysis
        const kdigoPositive = item.result.kdigo.status === 'positive' || dialysisFlag;

        // NCDR should only be flagged if PTCA present in episode and this row is either PTCA or FINAL (and PTCA exists) — user asked "ncdr only when ptca present"
        let ncdrFlag = false;
        if (results.hasPTCA) {
          // if item.type is 'PTCA' or 'FINAL' -> allow NCDR
          if (procType === 'PTCA' || procType === 'FINAL') {
            // item.result.ncdr.status might be 'not_assessable' etc.
            ncdrFlag = item.result.ncdr.status === 'positive' || dialysisFlag;
          }
        } else {
          ncdrFlag = false;
        }

        const row: CinRow = {
          patient_id: patient.id,
          procedure_type: procType,
          cin_kdigo: kdigoPositive,
          kdigo_stage: item.result.kdigo.stage ? `Stage ${item.result.kdigo.stage}` : null,
          cin_esur: item.result.esur.status === 'positive',
          cin_ncdr: ncdrFlag,
          cin_acr: item.result.acr.status === 'positive',
          dialysis_initiated: dialysisFlag,
          urine_output_low: urineFlag,
          calculated_at: new Date().toISOString()
        };

        if (existing?.id) row.id = existing.id;
        toUpsert.push(row);
      }

      if (toUpsert.length) {
        const { error } = await supabase
          .from('cin_definitions')
          .upsert(toUpsert, { onConflict: 'patient_id,procedure_type' });
        if (error) {
          console.error('upsert error', error);
          alert('Save failed — check console');
        } else {
          // reload
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-6 flex items-center justify-center">
        <div className="text-gray-800">Loading…</div>
      </div>
    );
  }

  // render summary table mapping statuses to icons
  function statusCellFor(x: { status: 'positive' | 'negative' | 'not_assessable' }) {
    if (!x) return <td className="border px-2 py-1 text-center text-sm text-gray-700">—</td>;
    if (x.status === 'positive') return <td className="border px-2 py-1 text-center text-sm bg-green-50 text-green-800 font-semibold">YES</td>;
    if (x.status === 'negative') return <td className="border px-2 py-1 text-center text-sm bg-red-50 text-red-800 font-semibold">NO</td>;
    return <td className="border px-2 py-1 text-center text-sm bg-gray-100 text-gray-700 font-semibold">N/A</td>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-5 flex flex-col items-center">
      <h1 className="text-3xl font-extrabold mb-4 text-gray-900">🧾 CIN / AKI Definitions</h1>

      {patient && (
        <div className="bg-blue-50 border border-blue-200 rounded w-full max-w-6xl p-3 mb-4 text-gray-900">
          <strong>Patient:</strong> {patient.patient_name} — <strong>IPD:</strong> {patient.ipd_number}
        </div>
      )}

      {!exposures.length && (
        <div className="bg-white w-full max-w-6xl rounded shadow p-4 text-gray-900">
          No procedures found (CAG / PTCA). Please set procedure_datetime_cag or procedure_datetime_ptca on patient details.
        </div>
      )}

      {/* TOP: Episode & baseline summary + quick CIN summary table */}
      {results && exposures.length > 0 && (
        <div className="w-full max-w-6xl bg-white rounded shadow p-4 mb-6">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Episode summary</h2>
              <div className="text-sm text-gray-800 mt-1">
                <div><strong>Exposures:</strong> {exposures.map((e, i) => `${i + 1}. ${e.type} (${new Date(e.datetime).toLocaleString()})`).join(' — ')}</div>
                <div className="mt-1"><strong>Baseline used:</strong> {results.base ? `${results.base.value} mg/dL on ${results.base.date}` : <span className="text-red-700">No baseline found — definitions not assessable</span>}</div>
                <div className="mt-1 text-xs text-gray-600">Baseline = latest SCr measured on or before the <strong>first</strong> exposure.</div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm text-gray-700">Episode last exposure: <strong>{new Date(exposures[exposures.length - 1].datetime).toLocaleString()}</strong></div>
              <div className="text-sm text-gray-600 mt-2">NCDR will only be evaluated if PTCA present in episode.</div>
            </div>
          </div>

          {/* small summary table */}
          <div className="mt-4 overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border px-2 py-2 text-left">Exposure</th>
                  <th className="border px-2 py-2 text-center">KDIGO</th>
                  <th className="border px-2 py-2 text-center">ESUR</th>
                  <th className="border px-2 py-2 text-center">ACR</th>
                  <th className="border px-2 py-2 text-center">NCDR</th>
                </tr>
              </thead>
              <tbody>
                {results.list.map((it: any) => {
                  // hide NCDR if no PTCA in episode
                  const showNCDR = results.hasPTCA && (it.type === 'PTCA' || it.type === 'FINAL' || it.type === 'CAG');
                  // actual cell content
                  const kdigoStatus = it.result.kdigo.status;
                  const esurStatus = it.result.esur.status;
                  const acrStatus = it.result.acr.status;
                  const ncdrStatus = it.result.ncdr.status;

                  return (
                    <tr key={it.label}>
                      <td className="border px-2 py-2 text-gray-800">{it.label} — {it.type} — <span className="text-gray-600">{new Date(it.datetime).toLocaleString()}</span></td>
                      <td className="border px-2 py-2 text-center">{kdigoStatus === 'positive' ? <span className="text-green-700 font-semibold">YES</span> : kdigoStatus === 'negative' ? <span className="text-red-700 font-semibold">NO</span> : <span className="text-gray-700 font-semibold">N/A</span>}</td>
                      <td className="border px-2 py-2 text-center">{esurStatus === 'positive' ? <span className="text-green-700 font-semibold">YES</span> : esurStatus === 'negative' ? <span className="text-red-700 font-semibold">NO</span> : <span className="text-gray-700 font-semibold">N/A</span>}</td>
                      <td className="border px-2 py-2 text-center">{acrStatus === 'positive' ? <span className="text-green-700 font-semibold">YES</span> : acrStatus === 'negative' ? <span className="text-red-700 font-semibold">NO</span> : <span className="text-gray-700 font-semibold">N/A</span>}</td>
                      <td className="border px-2 py-2 text-center">{showNCDR ? (ncdrStatus === 'positive' ? <span className="text-green-700 font-semibold">YES</span> : ncdrStatus === 'negative' ? <span className="text-red-700 font-semibold">NO</span> : <span className="text-gray-700 font-semibold">N/A</span>) : <span className="text-gray-400">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-exposure detail cards */}
      <div className="w-full max-w-6xl space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {results?.list.map((it: any) => {
            const r = it.result;
            const procKey = it.type;
            const dialysisVal = localDialysis[procKey] ?? !!cinRows.find(c => c.procedure_type === procKey)?.dialysis_initiated;
            const urineOverride = localUrineOverride[procKey];
            const urineAuto = r.urineLowAuto === null ? null : !!r.urineLowAuto;
            const urineFinal = urineOverride === null || urineOverride === undefined ? urineAuto : urineOverride;

            // final flags (consider dialysis manual)
            const kdigoFinal = (r.kdigo.status === 'positive') || dialysisVal;
            const esurFinal = r.esur.status === 'positive';
            const acrFinal = r.acr.status === 'positive';
            const ncdrFinal = (r.ncdr.status === 'positive') || dialysisVal;

            // KDIGO stage string
            const kdigoStageStr = r.kdigo.stage ? `Stage ${r.kdigo.stage}` : null;
            // if dialysis manual -> override to Stage 3
            const kdigoStageShown = dialysisVal ? 'Stage 3' : kdigoStageStr;

            return (
              <div key={it.label} className="bg-white rounded shadow p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-900">{it.label}</h3>
                  <div className="text-sm text-gray-700">{new Date(it.datetime).toLocaleString()}</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* left: data summary */}
                  <div className="p-3 border rounded">
                    <h4 className="font-semibold text-gray-900 mb-2">Data summary</h4>
                    <div className="text-sm text-gray-800 space-y-1">
                      <div><strong>Baseline SCr:</strong> {results.base ? `${results.base.value} mg/dL` : <span className="text-red-700">No baseline</span>} {results.base?.date ? `(on ${results.base.date})` : ''}</div>

                      <div><strong>Peak (0–48 h):</strong> {r.peaks.peak48 ? `${r.peaks.peak48.value} mg/dL` : '—'}</div>
                      <div><strong>Peak (0–72 h):</strong> {r.peaks.peak72 ? `${r.peaks.peak72.value} mg/dL` : '—'}</div>
                      <div><strong>Peak (0–7 d):</strong> {r.peaks.peak7d ? `${r.peaks.peak7d.value} mg/dL` : '—'}</div>

                      <div><strong>Δ (0–48 h):</strong> {r.diffs.abs48 !== null ? `${r.diffs.abs48} mg/dL (${r.diffs.rel48 !== null ? `${r.diffs.rel48}×` : '—'})` : '—'}</div>
                      <div><strong>Δ (0–72 h):</strong> {r.diffs.abs72 !== null ? `${r.diffs.abs72} mg/dL (${r.diffs.rel72 !== null ? `${r.diffs.rel72}×` : '—'})` : '—'}</div>
                      <div><strong>Δ (0–7 d):</strong> {r.diffs.abs7 !== null ? `${r.diffs.abs7} mg/dL (${r.diffs.rel7 !== null ? `${r.diffs.rel7}×` : '—'})` : '—'}</div>

                      <div><strong>Urine (0–24 h):</strong> {r.urineTotal ?? 0} mL (threshold {r.urineThreshold} mL)</div>
                    </div>

                    <div className="mt-3">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={dialysisVal} onChange={(e) => setLocalDialysis(prev => ({ ...prev, [procKey]: e.target.checked }))} />
                        <span className="text-sm text-gray-900">Dialysis initiated (manual)</span>
                      </label>
                    </div>

                    <div className="mt-2">
                      <label className="flex items-center gap-2">
                        <input type="checkbox"
                          checked={urineOverride !== null && urineOverride !== undefined ? !!urineOverride : false}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setLocalUrineOverride(prev => ({ ...prev, [procKey]: checked }));
                          }}
                        />
                        <span className="text-sm text-gray-900">Manually mark urine_output_low = true</span>
                      </label>
                      <div className="text-xs text-gray-700 mt-1">Auto: {urineAuto === null ? 'No data' : urineAuto ? 'LOW' : 'OK'}. Toggle to override.</div>
                    </div>
                  </div>

                  {/* right: definitions */}
                  <div className="p-3 border rounded space-y-3">
                    <div className="text-sm text-gray-800 mb-1"><strong>Baseline used:</strong> {results.base ? `${results.base.value} mg/dL on ${results.base.date}` : 'No baseline found'}</div>

                    {/* KDIGO */}
                    <div className="p-2 border rounded bg-gray-50">
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="font-semibold text-gray-900">KDIGO (2012)</h4>
                          <div className="text-sm text-gray-800">AKI if any: ↑SCr ≥0.3 mg/dL (48h) OR ≥1.5× baseline (7d) OR urine output low OR dialysis</div>
                        </div>
                        <div className="text-sm">{kdigoStageShown ? <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800 font-semibold">{kdigoStageShown}</span> : <span className="text-gray-700">Stage: —</span>}</div>
                      </div>

                      <div className="mt-2 text-sm text-gray-800 space-y-1">
                        <div className="flex justify-between"><div>Absolute Δ (0–48h)</div><div><strong>{r.diffs.abs48 ?? '—'} mg/dL</strong> — <Present ok={r.diffs.abs48 !== null ? (r.diffs.abs48 >= 0.3) : null} /></div></div>

                        <div className="flex justify-between"><div>Relative (0–7d)</div><div><strong>{r.diffs.rel7 ?? '—'} ×</strong> — <Present ok={r.diffs.rel7 !== null ? (r.diffs.rel7 >= 1.5) : null} /></div></div>

                        <div className="flex justify-between"><div>Urine low (0–24h)</div><div><strong>{r.urineTotal ?? 0} mL</strong> — <Present ok={urineFinal === null ? null : !!urineFinal} /></div></div>

                        <div className="flex justify-between"><div>Dialysis (manual)</div><div><strong>{dialysisVal ? 'Yes' : 'No'}</strong></div></div>

                        <div className="mt-2 flex justify-between font-semibold">
                          <div>Final KDIGO</div>
                          <div>{kdigoFinal ? <span className="text-green-700">✅ POSITIVE</span> : <span className="text-red-700">❌ NEGATIVE</span>}</div>
                        </div>
                      </div>
                    </div>

                    {/* ESUR */}
                    <div className="p-2 border rounded bg-gray-50">
                      <div className="flex justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900">ESUR (1999)</h4>
                          <div className="text-sm text-gray-800">Increase ≥0.5 mg/dL OR ≥25% within 48–72h</div>
                        </div>
                        <div className="text-sm">{esurFinal ? <span className="text-green-700 font-semibold">✅</span> : <span className="text-red-700 font-semibold">❌</span>}</div>
                      </div>

                      <div className="mt-2 text-sm text-gray-800">
                        <div className="flex justify-between"><div>Absolute Δ (0–72h)</div><div><strong>{r.diffs.abs72 ?? '—'} mg/dL</strong> — <Present ok={r.diffs.abs72 !== null ? (r.diffs.abs72 >= 0.5) : null} /></div></div>
                        <div className="flex justify-between mt-1"><div>Relative (0–72h)</div><div><strong>{r.diffs.rel72 ?? '—'} ×</strong> — <Present ok={r.diffs.rel72 !== null ? (r.diffs.rel72 >= 1.25) : null} /></div></div>
                      </div>
                    </div>

                    {/* NCDR */}
                    <div className="p-2 border rounded bg-gray-50">
                      <div className="flex justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900">NCDR (CathPCI)</h4>
                          <div className="text-sm text-gray-800">Increase ≥0.3 mg/dL OR ≥50% within 48h OR dialysis (only if PTCA present)</div>
                        </div>
                        <div className="text-sm">{results.hasPTCA ? (ncdrFinal ? <span className="text-green-700 font-semibold">✅</span> : <span className="text-red-700 font-semibold">❌</span>) : <span className="text-gray-400">—</span>}</div>
                      </div>

                      <div className="mt-2 text-sm text-gray-800">
                        <div className="flex justify-between"><div>Absolute Δ (0–48h)</div><div><strong>{r.diffs.abs48 ?? '—'} mg/dL</strong> — <Present ok={r.diffs.abs48 !== null ? (r.diffs.abs48 >= 0.3) : null} /></div></div>
                        <div className="flex justify-between mt-1"><div>Relative (0–48h)</div><div><strong>{r.diffs.rel48 ?? '—'} ×</strong> — <Present ok={r.diffs.rel48 !== null ? (r.diffs.rel48 >= 1.5) : null} /></div></div>
                      </div>
                    </div>

                    {/* ACR */}
                    <div className="p-2 border rounded bg-gray-50">
                      <div className="flex justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900">ACR</h4>
                          <div className="text-sm text-gray-800">Increase ≥0.5 mg/dL OR ≥25% within 48–72h</div>
                        </div>
                        <div className="text-sm">{acrFinal ? <span className="text-green-700 font-semibold">✅</span> : <span className="text-red-700 font-semibold">❌</span>}</div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {results && exposures.length > 0 && (
        <div className="w-full max-w-6xl mt-4 mb-8">
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
