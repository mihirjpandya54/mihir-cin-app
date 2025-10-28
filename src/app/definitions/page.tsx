'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

/**
 * CIN / AKI definitions page (ready-to-paste)
 * - Uses procedures_view (SQL view) for procedures (datetime & type)
 * - Pulls labs from lab_results, fluids from fluid_chart
 * - Upserts to cin_definitions
 * - Handles CAG / PTCA / POBA / TPI / THROMBUS_ASPIRATION etc.
 */

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
};

type ProcedureRow = {
  id: string;
  patient_id: string;
  type: string; // 'CAG' | 'PTCA' | 'POBA' | 'TPI' | ...
  procedure_datetime: string | null;
};

type LabRow = {
  id: string;
  patient_id?: string;
  lab_date: string | null;
  scr?: number | null;
  created_at?: string | null;
};

type FluidRow = {
  id: string;
  patient_id?: string;
  fluid_date: string | null;
  output_ml?: number | null;
  inserted_at?: string | null;
};

type CinRow = {
  id?: string | null;
  patient_id: string;
  procedure_type: string;
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
const clamp = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? null : Number(n));

function rowTimestampLab(l: LabRow): number | null {
  if (l.lab_date) {
    // accept iso datetime or date-only; use midday for date-only to avoid timezone midnight issues
    return new Date(l.lab_date.includes('T') ? l.lab_date : l.lab_date + 'T12:00:00').getTime();
  }
  if (l.created_at) return new Date(l.created_at).getTime();
  return null;
}

function rowTimestampFluid(f: FluidRow): number | null {
  if (f.fluid_date) {
    return new Date(f.fluid_date.includes('T') ? f.fluid_date : f.fluid_date + 'T12:00:00').getTime();
  }
  if (f.inserted_at) return new Date(f.inserted_at).getTime();
  return null;
}

function Present({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="text-gray-700">—</span>;
  return ok ? <span className="text-green-700 font-semibold">✅</span> : <span className="text-red-700 font-semibold">❌</span>;
}

// ---------- Component ----------
export default function DefinitionsPage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [procedures, setProcedures] = useState<ProcedureRow[]>([]);
  const [labs, setLabs] = useState<LabRow[]>([]);
  const [fluids, setFluids] = useState<FluidRow[]>([]);
  const [cinRows, setCinRows] = useState<CinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // UI overrides
  const [localDialysis, setLocalDialysis] = useState<Record<string, boolean>>({});
  const [localUrineOverride, setLocalUrineOverride] = useState<Record<string, boolean | null>>({});

  // Load data: active_patient -> patient_details -> procedures_view -> labs -> fluids -> cin_definitions
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: active } = await supabase
          .from('active_patient')
          .select('patient_id')
          .eq('user_id', '00000000-0000-0000-0000-000000000001')
          .maybeSingle();

        if (!active?.patient_id) {
          setLoading(false);
          return;
        }
        const patientId = active.patient_id;

        // patient
        const { data: p } = await supabase
          .from('patient_details')
          .select('id, patient_name, ipd_number')
          .eq('id', patientId)
          .single();
        if (p) setPatient(p);

        // procedures -> NOTE: uses procedures_view (SQL view you created)
        const { data: procData } = await supabase
          .from('procedures_view')
          .select('id, patient_id, type, procedure_datetime')
          .eq('patient_id', patientId)
          .order('procedure_datetime', { ascending: true });
        setProcedures((procData || []).map((r: any) => ({
          id: r.id,
          patient_id: r.patient_id,
          type: r.type,
          procedure_datetime: r.procedure_datetime
        })));

        // labs
        const { data: labData } = await supabase
          .from('lab_results')
          .select('id, patient_id, lab_date, scr, created_at')
          .eq('patient_id', patientId)
          .order('lab_date', { ascending: true });
        setLabs((labData || []).map((l: any) => ({ id: l.id, patient_id: l.patient_id, lab_date: l.lab_date, scr: clamp(l.scr), created_at: l.created_at })));

        // fluids
        const { data: fluidData } = await supabase
          .from('fluid_chart')
          .select('id, patient_id, fluid_date, output_ml, inserted_at')
          .eq('patient_id', patientId)
          .order('fluid_date', { ascending: true });
        setFluids((fluidData || []).map((f: any) => ({ id: f.id, patient_id: f.patient_id, fluid_date: f.fluid_date, output_ml: clamp(f.output_ml), inserted_at: f.inserted_at })));

        // existing cin rows
        const { data: cinData } = await supabase
          .from('cin_definitions')
          .select('*')
          .eq('patient_id', patientId);
        setCinRows((cinData || []) as CinRow[]);
      } catch (err) {
        console.error('load error', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // sync UI override values from saved cin rows
  useEffect(() => {
    const nd: Record<string, boolean> = {};
    const nu: Record<string, boolean | null> = {};
    for (const row of cinRows) {
      if (row.procedure_type) nd[row.procedure_type] = !!row.dialysis_initiated;
      if (row.procedure_type) nu[row.procedure_type] = row.urine_output_low ?? null;
    }
    setLocalDialysis(prev => ({ ...nd, ...prev }));
    setLocalUrineOverride(prev => ({ ...nu, ...prev }));
  }, [cinRows]);

  // exposures timeline (sorted, filtering out null datetimes)
  const exposures = useMemo(() => {
    return procedures
      .filter(p => p.procedure_datetime)
      .map(p => ({ id: p.id, type: p.type, datetime: p.procedure_datetime as string }))
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
  }, [procedures]);

  // baseline: latest lab at or before first exposure (inclusive) + stability check
  const baseline = useMemo(() => {
    if (!exposures.length || !labs.length) return null;
    const firstTs = new Date(exposures[0].datetime).getTime();
    const candidates = labs
      .map(l => ({ ...l, ts: rowTimestampLab(l) }))
      .filter(l => l.ts !== null && (l.ts as number) <= firstTs && l.scr != null)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (!candidates.length) return null;
    const chosen = candidates[0];
    const chosenScr = Number(chosen.scr);
    const chosenTs = chosen.ts as number;

    // stability: check earlier labs in prior 7 days (if any). If earlierScr is zero -> ignore (avoid div-by-zero)
    const sevenDaysBefore = chosenTs - 7 * 24 * HOURS;
    const earlier = labs
      .map(l => ({ ...l, ts: rowTimestampLab(l) }))
      .filter(l => l.ts !== null && (l.ts as number) >= sevenDaysBefore && (l.ts as number) < chosenTs && l.scr != null)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
    let stable = true;
    for (const e of earlier) {
      if (e.scr == null) continue;
      const earlierScr = Number(e.scr);
      if (earlierScr === 0) continue; // can't compute percent change, skip
      const diff = chosenScr - earlierScr;
      const pct = earlierScr > 0 ? chosenScr / earlierScr : 1;
      if (diff >= 0.3 || pct >= 1.5) {
        stable = false;
        break;
      }
    }
    return {
      value: chosenScr,
      date: chosen.lab_date ?? chosen.created_at ?? null,
      ts: chosenTs,
      stable
    };
  }, [exposures, labs]);

  // AnchorResult type for computeForAnchor
  type AnchorResult = {
    anchorISO: string;
    anchorType: string;
    baselinePresent: boolean;
    baselineValue: number | null;
    baselineDate: string | null;
    baselineStable: boolean | null;
    peaks: {
      peak_48?: { value: number; date: string | null } | null;
      peak_72?: { value: number; date: string | null } | null;
      peak_7d?: { value: number; date: string | null } | null;
    };
    diffs: {
      abs48: number | null;
      rel48: number | null; // ratio (e.g., 1.444)
      abs72: number | null;
      rel72: number | null;
      abs7: number | null;
      rel7: number | null;
    };
    urineTotal: number | null;
    urineThreshold: number;
    urineDataPresent: boolean;
    urineLowAuto: boolean | null;
    kdigo: { status: 'positive' | 'negative' | 'not_assessable'; via?: 'scr' | 'urine' | 'dialysis' | null; stage?: 1 | 2 | 3 | null };
    esur: { status: 'positive' | 'negative' | 'not_assessable' };
    acr: { status: 'positive' | 'negative' | 'not_assessable' };
    ncdr: { status: 'positive' | 'negative' | 'not_assessable' };
  };

  // compute for a given anchor datetime (anchor = exposure datetime or final episode anchor)
  function computeForAnchor(anchorISO: string, anchorType: string): AnchorResult {
    const procTs = new Date(anchorISO).getTime();
    const weightKg = 70;
    const urineThreshold = 0.5 * weightKg * 24; // 840 mL / 24h

    // baseline missing: many definitions not assessable; still compute urine if available
    if (!baseline) {
      const startU = procTs;
      const endU = procTs + 24 * HOURS;
      const urineEntries = fluids
        .map(f => ({ ...f, ts: rowTimestampFluid(f) }))
        .filter(f => f.ts !== null && f.output_ml != null && (f.ts as number) >= startU && (f.ts as number) <= endU);
      const urineTotal = urineEntries.reduce((s, x) => s + (x.output_ml ?? 0), 0);
      const urineDataPresent = urineEntries.length > 0;
      const urineLowAuto = urineDataPresent ? urineTotal < urineThreshold : null;

      return {
        anchorISO,
        anchorType,
        baselinePresent: false,
        baselineValue: null,
        baselineDate: null,
        baselineStable: null,
        peaks: { peak_48: null, peak_72: null, peak_7d: null },
        diffs: { abs48: null, rel48: null, abs72: null, rel72: null, abs7: null, rel7: null },
        urineTotal: urineTotal || 0,
        urineThreshold,
        urineDataPresent,
        urineLowAuto,
        kdigo: { status: 'not_assessable', via: null, stage: null },
        esur: { status: 'not_assessable' },
        acr: { status: 'not_assessable' },
        ncdr: { status: 'not_assessable' }
      };
    }

    // helper to get labs in inclusive [startHours, endHours]
    function labsInWindow(startHours: number, endHours: number) {
      const start = procTs + startHours * HOURS;
      const end = procTs + endHours * HOURS;
      return labs
        .map(l => ({ ...l, ts: rowTimestampLab(l) }))
        .filter(l => l.ts !== null && l.scr != null && (l.ts as number) >= start && (l.ts as number) <= end)
        .map(l => ({ value: Number(l.scr), date: l.lab_date ?? l.created_at }));
    }

    const arr48 = labsInWindow(0, 48);
    const arr72 = labsInWindow(0, 72);
    const arr7d = labsInWindow(0, 7 * 24);

    const peak48 = arr48.length ? arr48.reduce((a, b) => (b.value > a.value ? b : a)) : null;
    const peak72 = arr72.length ? arr72.reduce((a, b) => (b.value > a.value ? b : a)) : null;
    const peak7d = arr7d.length ? arr7d.reduce((a, b) => (b.value > a.value ? b : a)) : null;

    const baseVal = baseline.value;

    const abs48 = peak48 ? Number((peak48.value - baseVal).toFixed(3)) : null;
    const rel48 = peak48 ? Number((peak48.value / baseVal).toFixed(3)) : null;
    const abs72 = peak72 ? Number((peak72.value - baseVal).toFixed(3)) : null;
    const rel72 = peak72 ? Number((peak72.value / baseVal).toFixed(3)) : null;
    const abs7 = peak7d ? Number((peak7d.value - baseVal).toFixed(3)) : null;
    const rel7 = peak7d ? Number((peak7d.value / baseVal).toFixed(3)) : null;

    // urine 0-24h
    const startUrine = procTs;
    const endUrine = procTs + 24 * HOURS;
    const urineEntries = fluids
      .map(f => ({ ...f, ts: rowTimestampFluid(f) }))
      .filter(f => f.ts !== null && f.output_ml != null && (f.ts as number) >= startUrine && (f.ts as number) <= endUrine);
    const urineTotal = urineEntries.reduce((s, x) => s + (x.output_ml ?? 0), 0);
    const urineDataPresent = urineEntries.length > 0;
    const urineLowAuto = urineDataPresent ? urineTotal < urineThreshold : null;

    // KDIGO logic
    const cond_abs48 = abs48 !== null && abs48 >= 0.3;
    const cond_rel7 = rel7 !== null && rel7 >= 1.5; // ratio >=1.5
    const kdigoHasScr = Boolean(peak48 || peak72 || peak7d);

    let kdigoStatus: AnchorResult['kdigo']['status'] = 'not_assessable';
    let kdigoVia: 'scr' | 'urine' | 'dialysis' | null = null;
    let kdigoStage: 1 | 2 | 3 | null = null;

    if (!kdigoHasScr && !urineDataPresent) {
      kdigoStatus = 'not_assessable';
    } else {
      if (cond_abs48 || cond_rel7 || urineLowAuto === true) {
        kdigoStatus = 'positive';
        kdigoVia = cond_abs48 || cond_rel7 ? 'scr' : 'urine';
      } else {
        // if any SCr exists in relevant windows or urine present -> negative (otherwise not_assessable)
        if (kdigoHasScr || urineDataPresent) kdigoStatus = 'negative';
        else kdigoStatus = 'not_assessable';
      }

      // Stage: prefer 7d peak then 72h then 48h
      const peakForStage = peak7d?.value ?? peak72?.value ?? peak48?.value ?? null;
      if (peakForStage !== null) {
        const ratio = peakForStage / baseVal;
        if (peakForStage >= 4.0 || ratio >= 3.0) kdigoStage = 3;
        else if (ratio >= 2.0) kdigoStage = 2;
        else if (cond_abs48 || ratio >= 1.5) kdigoStage = 1;
        else kdigoStage = null;
      }
    }

    // ESUR / ACR (0-72h): abs >=0.5 or rel >=1.25
    let esurStatus: AnchorResult['esur']['status'] = 'not_assessable';
    if (peak72) {
      const condA = abs72 !== null && abs72 >= 0.5;
      const condB = rel72 !== null && rel72 >= 1.25;
      esurStatus = (condA || condB) ? 'positive' : 'negative';
    } else {
      esurStatus = 'not_assessable';
    }
    const acrStatus = esurStatus;

    // NCDR (0-48h): abs >=0.3 or rel >=1.5 (dialysis handled when combining UI overrides)
    let ncdrStatus: AnchorResult['ncdr']['status'] = 'not_assessable';
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
      baselineValue: baseline.value,
      baselineDate: baseline.date,
      baselineStable: baseline.stable,
      peaks: {
        peak_48: peak48 ? { value: peak48.value, date: peak48.date } : null,
        peak_72: peak72 ? { value: peak72.value, date: peak72.date } : null,
        peak_7d: peak7d ? { value: peak7d.value, date: peak7d.date } : null
      },
      diffs: { abs48, rel48, abs72, rel72, abs7, rel7 },
      urineTotal: urineTotal || 0,
      urineThreshold,
      urineDataPresent,
      urineLowAuto,
      kdigo: { status: kdigoStatus, via: kdigoVia, stage: kdigoStage },
      esur: { status: esurStatus },
      acr: { status: acrStatus },
      ncdr: { status: ncdrStatus }
    };
  }

  // Build per-exposure results + FINAL
  const results = useMemo(() => {
    if (!exposures.length) return null;
    const list: { label: string; type: string; datetime: string; result: AnchorResult }[] = [];
    exposures.forEach((ex, idx) => {
      const res = computeForAnchor(ex.datetime, ex.type);
      list.push({ label: `Exposure ${idx + 1} (${ex.type})`, type: ex.type, datetime: ex.datetime, result: res });
    });
    const last = exposures[exposures.length - 1];
    const finalRes = computeForAnchor(last.datetime, 'FINAL');
    list.push({ label: 'FINAL (episode)', type: 'FINAL', datetime: last.datetime, result: finalRes });
    return {
      base: baseline,
      list,
      hasPTCA: exposures.some(e => e.type === 'PTCA')
    };
  }, [exposures, labs, fluids, baseline]);

  // Save / upsert per user request
  async function saveAll() {
    if (!patient || !results) return;
    setSaving(true);
    try {
      const toUpsert: CinRow[] = [];
      for (const item of results.list) {
        // store common types: CAG, PTCA, POBA, FINAL
        if (!['CAG', 'PTCA', 'POBA', 'FINAL'].includes(item.type)) continue;
        const storedType = item.type;

        const existing = cinRows.find(c => c.procedure_type === storedType);

        // overrides & flags
        const dialysisFlag = !!localDialysis[storedType];
        const urineOverride = localUrineOverride[storedType];
        const urineAuto = item.result.urineLowAuto === null ? null : !!item.result.urineLowAuto;
        const urineFlag = urineOverride === null || urineOverride === undefined ? !!urineAuto : !!urineOverride;

        const kdigoPos = item.result.kdigo.status === 'positive' || dialysisFlag;

        // NCDR only if any PTCA in episode and storing PTCA or FINAL (user requirement)
        let ncdrFlag = false;
        if (results.hasPTCA) {
          if (storedType === 'PTCA' || storedType === 'FINAL') {
            ncdrFlag = item.result.ncdr.status === 'positive' || dialysisFlag;
          } else ncdrFlag = false;
        } else {
          ncdrFlag = false;
        }

        const row: CinRow = {
          patient_id: patient.id,
          procedure_type: storedType,
          cin_kdigo: kdigoPos,
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

      if (!toUpsert.length) {
        alert('Nothing to save');
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from('cin_definitions')
        .upsert(toUpsert, { onConflict: 'patient_id,procedure_type' });

      if (error) {
        console.error('upsert error', error);
        alert('Save failed — check console');
      } else {
        const { data: fresh } = await supabase
          .from('cin_definitions')
          .select('*')
          .eq('patient_id', patient.id);
        setCinRows((fresh || []) as CinRow[]);
        alert('Saved ✅');
      }
    } catch (err) {
      console.error('saveAll error', err);
      alert('Save failed — check console');
    } finally {
      setSaving(false);
    }
  }

  // ---------- RENDER ----------
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-6 flex items-center justify-center">
        <div className="text-gray-900">Loading…</div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="bg-white p-4 rounded shadow text-gray-900">No active patient selected.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center">
      <h1 className="text-3xl font-extrabold mb-4 text-gray-900">🧾 CIN / AKI Definitions</h1>

      <div className="w-full max-w-6xl bg-white rounded shadow p-3 mb-4 text-gray-900">
        <strong>Patient:</strong> {patient.patient_name} — <strong>IPD:</strong> {patient.ipd_number}
      </div>

      {!exposures.length && (
        <div className="w-full max-w-6xl bg-white rounded shadow p-4 text-gray-900">No procedures found for this patient. Add procedures on the procedures page (view: procedures_view).</div>
      )}

      {results && exposures.length > 0 && (
        <div className="w-full max-w-6xl bg-white rounded shadow p-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Episode summary</h2>
              <div className="text-sm text-gray-900 mt-1">
                <div><strong>Exposures:</strong> {exposures.map((e, i) => `${i + 1}. ${e.type} (${new Date(e.datetime).toLocaleString()})`).join(' — ')}</div>
                <div className="mt-1"><strong>Baseline used:</strong> {results.base ? `${results.base.value} mg/dL on ${results.base.date}${results.base.stable ? '' : ' (UNSTABLE)'}` : <span className="text-red-700">No baseline — definitions not assessable</span>}</div>
                <div className="mt-1 text-xs text-gray-600">Baseline = latest serum creatinine measured on or before the <strong>first</strong> exposure. If rising in prior 7d, baseline is marked unstable.</div>
              </div>
            </div>

            <div className="text-right text-sm text-gray-700">
              <div>Last exposure: <strong>{new Date(exposures[exposures.length - 1].datetime).toLocaleString()}</strong></div>
              <div className="mt-1 text-xs text-gray-600">NCDR evaluated only if PTCA present in episode.</div>
            </div>
          </div>

          {/* quick summary table */}
          <div className="mt-4 overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border px-2 py-2 text-left bg-gray-100">Exposure</th>
                  <th className="border px-2 py-2 text-center bg-gray-50">KDIGO</th>
                  <th className="border px-2 py-2 text-center bg-gray-50">ESUR</th>
                  <th className="border px-2 py-2 text-center bg-gray-50">ACR</th>
                  <th className="border px-2 py-2 text-center bg-gray-50">NCDR</th>
                </tr>
              </thead>
              <tbody>
                {results.list.map(it => {
                  const kd = it.result.kdigo.status;
                  const es = it.result.esur.status;
                  const ac = it.result.acr.status;
                  const nc = it.result.ncdr.status;
                  const showNCDR = results.hasPTCA && (it.type === 'PTCA' || it.type === 'FINAL');
                  return (
                    <tr key={it.label}>
                      <td className="border px-2 py-2 text-gray-900">{it.label} — <span className="text-gray-700">{new Date(it.datetime).toLocaleString()}</span></td>
                      <td className="border px-2 py-2 text-center">{kd === 'positive' ? <span className="text-green-700 font-semibold">YES</span> : kd === 'negative' ? <span className="text-red-700 font-semibold">NO</span> : <span className="text-gray-700 font-semibold">N/A</span>}</td>
                      <td className="border px-2 py-2 text-center">{es === 'positive' ? <span className="text-green-700 font-semibold">YES</span> : es === 'negative' ? <span className="text-red-700 font-semibold">NO</span> : <span className="text-gray-700 font-semibold">N/A</span>}</td>
                      <td className="border px-2 py-2 text-center">{ac === 'positive' ? <span className="text-green-700 font-semibold">YES</span> : ac === 'negative' ? <span className="text-red-700 font-semibold">NO</span> : <span className="text-gray-700 font-semibold">N/A</span>}</td>
                      <td className="border px-2 py-2 text-center">{showNCDR ? (nc === 'positive' ? <span className="text-green-700 font-semibold">YES</span> : nc === 'negative' ? <span className="text-red-700 font-semibold">NO</span> : <span className="text-gray-700 font-semibold">N/A</span>) : <span className="text-gray-400">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-exposure cards (grid: side-by-side on large screens) */}
      <div className="w-full max-w-6xl space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {results?.list.map(it => {
            const r = it.result;
            const procKey = it.type;
            const dialysisVal = localDialysis[procKey] ?? !!cinRows.find(c => c.procedure_type === procKey)?.dialysis_initiated;
            const urineOverride = localUrineOverride[procKey];
            const urineAuto = r.urineLowAuto === null ? null : !!r.urineLowAuto;
            const urineFinal = urineOverride === null || urineOverride === undefined ? urineAuto : urineOverride;

            const kdigoFinal = r.kdigo.status === 'positive' || dialysisVal;
            const esurFinal = r.esur.status === 'positive';
            const acrFinal = r.acr.status === 'positive';
            const ncdrFinal = (r.ncdr.status === 'positive') || dialysisVal;

            const kdigoStageShown = dialysisVal ? 'Stage 3' : (r.kdigo.stage ? `Stage ${r.kdigo.stage}` : null);

            return (
              <div key={it.label} className="bg-white rounded shadow p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-900">{it.label}</h3>
                  <div className="text-sm text-gray-700">{new Date(it.datetime).toLocaleString()}</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 border rounded">
                    <h4 className="font-semibold text-gray-900 mb-2">Data summary</h4>
                    <div className="text-sm text-gray-900 space-y-1">
                      <div>
                        <strong>Baseline SCr:</strong> {results.base ? `${results.base.value} mg/dL${results.base.stable ? '' : ' (UNSTABLE)'}` : <span className="text-red-700">No baseline</span>}
                        {results.base?.date ? ` (on ${results.base.date})` : ''}
                      </div>

                      <div><strong>Peak (0–48 h):</strong> {r.peaks.peak_48 ? `${r.peaks.peak_48.value} mg/dL` : '—'}</div>
                      <div><strong>Peak (0–72 h):</strong> {r.peaks.peak_72 ? `${r.peaks.peak_72.value} mg/dL` : '—'}</div>
                      <div><strong>Peak (0–7 d):</strong> {r.peaks.peak_7d ? `${r.peaks.peak_7d.value} mg/dL` : '—'}</div>

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

                  <div className="p-3 border rounded space-y-3">
                    <div className="text-sm text-gray-900 mb-1"><strong>Baseline used:</strong> {results.base ? `${results.base.value} mg/dL on ${results.base.date}` : 'No baseline found'}</div>

                    {/* KDIGO */}
                    <div className="p-2 border rounded bg-gray-50">
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="font-semibold text-gray-900">KDIGO (2012)</h4>
                          <div className="text-sm text-gray-900">AKI if any: ↑SCr ≥0.3 mg/dL (48h) OR ≥1.5× baseline (7d) OR urine output low OR dialysis</div>
                        </div>
                        <div className="text-sm">{kdigoStageShown ? <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800 font-semibold">{kdigoStageShown}</span> : <span className="text-gray-700">Stage: —</span>}</div>
                      </div>

                      <div className="mt-2 text-sm text-gray-900 space-y-1">
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
                          <div className="text-sm text-gray-900">Increase ≥0.5 mg/dL OR ≥25% within 48–72h</div>
                        </div>
                        <div className="text-sm">{esurFinal ? <span className="text-green-700 font-semibold">✅</span> : <span className="text-red-700 font-semibold">❌</span>}</div>
                      </div>

                      <div className="mt-2 text-sm text-gray-900">
                        <div className="flex justify-between"><div>Absolute Δ (0–72h)</div><div><strong>{r.diffs.abs72 ?? '—'} mg/dL</strong> — <Present ok={r.diffs.abs72 !== null ? (r.diffs.abs72 >= 0.5) : null} /></div></div>
                        <div className="flex justify-between mt-1"><div>Relative (0–72h)</div><div><strong>{r.diffs.rel72 ?? '—'} ×</strong> — <Present ok={r.diffs.rel72 !== null ? (r.diffs.rel72 >= 1.25) : null} /></div></div>
                      </div>
                    </div>

                    {/* NCDR */}
                    <div className="p-2 border rounded bg-gray-50">
                      <div className="flex justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900">NCDR (CathPCI)</h4>
                          <div className="text-sm text-gray-900">Increase ≥0.3 mg/dL OR ≥50% within 48h OR dialysis (only if PTCA present)</div>
                        </div>
                        <div className="text-sm">{results.hasPTCA ? (ncdrFinal ? <span className="text-green-700 font-semibold">✅</span> : <span className="text-red-700 font-semibold">❌</span>) : <span className="text-gray-400">—</span>}</div>
                      </div>

                      <div className="mt-2 text-sm text-gray-900">
                        <div className="flex justify-between"><div>Absolute Δ (0–48h)</div><div><strong>{r.diffs.abs48 ?? '—'} mg/dL</strong> — <Present ok={r.diffs.abs48 !== null ? (r.diffs.abs48 >= 0.3) : null} /></div></div>
                        <div className="flex justify-between mt-1"><div>Relative (0–48h)</div><div><strong>{r.diffs.rel48 ?? '—'} ×</strong> — <Present ok={r.diffs.rel48 !== null ? (r.diffs.rel48 >= 1.5) : null} /></div></div>
                      </div>
                    </div>

                    {/* ACR */}
                    <div className="p-2 border rounded bg-gray-50">
                      <div className="flex justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900">ACR</h4>
                          <div className="text-sm text-gray-900">Increase ≥0.5 mg/dL OR ≥25% within 48–72h</div>
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
            className="bg-blue-700 text-white px-4 py-2 rounded hover:bg-blue-800 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save Definitions'}
          </button>
        </div>
      )}
    </div>
  );
}
