'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// ---------- Supabase ----------
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

type BPRow = {
  _clientId: string;
  id?: string | null;
  sbp_max?: number | null;
  sbp_min?: number | null;
  sbp_avg?: number | null;
  dbp_max?: number | null;
  dbp_min?: number | null;
  dbp_avg?: number | null;
  map_max?: number | null;
  map_min?: number | null;
  map_avg?: number | null;
  date: string;
  timing_label: string | null;
  saved?: boolean;
};

type FluidRow = {
  _clientId: string;
  id?: string | null;
  intake_ml?: number | null;
  output_ml?: number | null;
  balance_ml?: number | null;
  date: string;
  timing_label: string | null;
  saved?: boolean;
};

// ---------- Helpers ----------
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

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

const chipClass = (label: string) => {
  if (!label) return 'bg-gray-200 text-gray-900 border-gray-400';
  if (label.startsWith('Pre')) return 'bg-green-200 text-green-900 border-green-600';
  if (label.startsWith('0–24')) return 'bg-yellow-200 text-yellow-900 border-yellow-600';
  if (label.startsWith('48')) return 'bg-orange-200 text-orange-900 border-orange-600';
  if (label.startsWith('72')) return 'bg-red-200 text-red-900 border-red-600';
  return 'bg-gray-200 text-gray-900 border-gray-400';
};

// ---------- Page ----------
export default function BPFluidsPage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [bpRows, setBpRows] = useState<BPRow[]>([]);
  const [fluidRows, setFluidRows] = useState<FluidRow[]>([]);
  const [saving, setSaving] = useState(false);

  // ---------- Load patient and data ----------
  useEffect(() => {
    (async () => {
      const userId = '00000000-0000-0000-0000-000000000001';
      const { data: active } = await supabase
        .from('active_patient')
        .select('patient_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (!active?.patient_id) return;

      const { data: p } = await supabase
        .from('patient_details')
        .select('id, patient_name, ipd_number, procedure_datetime_cag, procedure_datetime_ptca')
        .eq('id', active.patient_id)
        .single();
      if (p) setPatient(p);

      const { data: bp } = await supabase
        .from('bp_chart')
        .select('*')
        .eq('patient_id', active.patient_id);

      const { data: fluids } = await supabase
        .from('fluid_chart')
        .select('*')
        .eq('patient_id', active.patient_id);

      if (bp) {
        setBpRows(
          bp.map((b: any) => ({
            _clientId: `db-${b.id}`,
            ...b,
            date: b.bp_date,
            saved: true,
          }))
        );
      }

      if (fluids) {
        setFluidRows(
          fluids.map((f: any) => ({
            _clientId: `db-${f.id}`,
            ...f,
            date: f.fluid_date,
            saved: true,
          }))
        );
      }
    })();
  }, []);

  // ---------- Date Options ----------
  const dateOptions = useMemo(() => {
    if (!patient) return [];
    const cag = patient.procedure_datetime_cag ? new Date(patient.procedure_datetime_cag) : null;
    const ptca = patient.procedure_datetime_ptca ? new Date(patient.procedure_datetime_ptca) : null;
    const earliest = cag && ptca ? (cag < ptca ? cag : ptca) : cag || ptca || new Date();
    const arr: string[] = [];
    for (let i = -1; i <= 5; i++) {
      const d = new Date(earliest);
      d.setDate(earliest.getDate() + i);
      arr.push(fmtDate(d));
    }
    return arr;
  }, [patient]);

  // ---------- MAP Calculation ----------
  function calcMap(sbp: number | null, dbp: number | null) {
    if (sbp == null || dbp == null) return null;
    return Math.round(((sbp + 2 * dbp) / 3) * 10) / 10;
  }

  // ---------- Update BP field ----------
  function updateBPField(date: string, field: string, value: any) {
    setBpRows(prev => {
      const idx = prev.findIndex(r => r.date === date);
      if (idx === -1) {
        const newRow: BPRow = {
          _clientId: `c-${crypto.randomUUID()}`,
          date,
          timing_label: '',
          saved: false,
          [field]: value
        } as Record<string, any> as BPRow;
        return [...prev, newRow];
      } else {
        const copy = [...prev];
        const updated = { ...(copy[idx] as Record<string, any>) };
        updated[field] = value;

        // Auto calculate MAP values
        updated.map_max = calcMap(updated.sbp_max, updated.dbp_max);
        updated.map_min = calcMap(updated.sbp_min, updated.dbp_min);
        updated.map_avg = calcMap(updated.sbp_avg, updated.dbp_avg);

        copy[idx] = updated as unknown as BPRow;
        return copy;
      }
    });
  }

  // ---------- Update Fluid field ----------
  function updateFluidField(date: string, field: string, value: any) {
    setFluidRows(prev => {
      const idx = prev.findIndex(r => r.date === date);
      if (idx === -1) {
        const newRow: FluidRow = {
          _clientId: `c-${crypto.randomUUID()}`,
          date,
          timing_label: '',
          saved: false,
          [field]: value
        } as Record<string, any> as FluidRow;
        return [...prev, newRow];
      } else {
        const copy = [...prev];
        const updated = { ...(copy[idx] as Record<string, any>) };
        updated[field] = value;
        // auto balance
        if (updated.intake_ml != null && updated.output_ml != null) {
          updated.balance_ml = updated.intake_ml - updated.output_ml;
        }
        copy[idx] = updated copy[idx] = updated as unknown as FluidRow;
        return copy;
      }
    });
  }

  // ---------- Save All ----------
  async function saveAll() {
    if (!patient) return;
    setSaving(true);
    try {
      // Save BP
      for (const r of bpRows) {
        const payload = {
          patient_id: patient.id,
          sbp_max: r.sbp_max,
          sbp_min: r.sbp_min,
          sbp_avg: r.sbp_avg,
          dbp_max: r.dbp_max,
          dbp_min: r.dbp_min,
          dbp_avg: r.dbp_avg,
          map_max: r.map_max,
          map_min: r.map_min,
          map_avg: r.map_avg,
          bp_date: r.date,
          timing_label: classifyTimingLabel(r.date, patient.procedure_datetime_cag, 'CAG')
            || classifyTimingLabel(r.date, patient.procedure_datetime_ptca, 'PTCA'),
        };
        if (r.saved && r.id) {
          await supabase.from('bp_chart').update(payload).eq('id', r.id);
        } else {
          await supabase.from('bp_chart').insert(payload);
        }
      }

      // Save Fluids
      for (const r of fluidRows) {
        const payload = {
          patient_id: patient.id,
          intake_ml: r.intake_ml,
          output_ml: r.output_ml,
          balance_ml: r.balance_ml,
          fluid_date: r.date,
          timing_label: classifyTimingLabel(r.date, patient.procedure_datetime_cag, 'CAG')
            || classifyTimingLabel(r.date, patient.procedure_datetime_ptca, 'PTCA'),
        };
        if (r.saved && r.id) {
          await supabase.from('fluid_chart').update(payload).eq('id', r.id);
        } else {
          await supabase.from('fluid_chart').insert(payload);
        }
      }

      alert('Saved successfully ✅');
    } catch (err) {
      console.error(err);
      alert('Save failed ❌ — Check console');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-5 flex flex-col items-center">
      <h1 className="text-3xl font-extrabold mb-4 text-gray-900">🩺 BP & 💧 Fluids</h1>

      {patient && (
        <div className="bg-blue-50 border border-blue-200 rounded w-full max-w-6xl p-3 mb-4 text-gray-900">
          <strong>Patient:</strong> {patient.patient_name} — <strong>IPD:</strong> {patient.ipd_number}
        </div>
      )}

      {/* BP Table */}
      <div className="overflow-auto w-full max-w-6xl bg-white rounded shadow mb-6">
        <table className="w-full text-sm text-gray-900">
          <thead className="bg-gray-300 sticky top-0">
            <tr>
              <th className="p-2">Date</th>
              <th className="p-2">SBP Max</th>
              <th className="p-2">SBP Min</th>
              <th className="p-2">SBP Avg</th>
              <th className="p-2">DBP Max</th>
              <th className="p-2">DBP Min</th>
              <th className="p-2">DBP Avg</th>
              <th className="p-2">MAP Max</th>
              <th className="p-2">MAP Min</th>
              <th className="p-2">MAP Avg</th>
              <th className="p-2">Timing</th>
            </tr>
          </thead>
          <tbody>
            {dateOptions.map(date => {
              const row = bpRows.find(r => r.date === date);
              const timing =
                classifyTimingLabel(date, patient?.procedure_datetime_cag ?? null, 'CAG') ||
                classifyTimingLabel(date, patient?.procedure_datetime_ptca ?? null, 'PTCA');
              return (
                <tr key={date} className="border-b">
                  <td className="p-2">{date}</td>
                  {['sbp_max', 'sbp_min', 'sbp_avg', 'dbp_max', 'dbp_min', 'dbp_avg'].map(field => (
                    <td key={field} className="p-1">
                      <input
                        type="number"
                        className="border rounded w-full p-1"
                        value={(row as any)?.[field] ?? ''}
                        onChange={e => updateBPField(date, field, e.target.value ? Number(e.target.value) : null)}
                      />
                    </td>
                  ))}
                  <td className="p-1">{row?.map_max ?? ''}</td>
                  <td className="p-1">{row?.map_min ?? ''}</td>
                  <td className="p-1">{row?.map_avg ?? ''}</td>
                  <td className="p-1 text-xs">
                    {timing && <span className={`px-1 rounded font-semibold ${chipClass(timing)}`}>{timing}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Fluids Table */}
      <div className="overflow-auto w-full max-w-6xl bg-white rounded shadow mb-6">
        <table className="w-full text-sm text-gray-900">
          <thead className="bg-gray-300 sticky top-0">
            <tr>
              <th className="p-2">Date</th>
              <th className="p-2">Intake (ml)</th>
              <th className="p-2">Output (ml)</th>
              <th className="p-2">Balance (ml)</th>
              <th className="p-2">Timing</th>
            </tr>
          </thead>
          <tbody>
            {dateOptions.map(date => {
              const row = fluidRows.find(r => r.date === date);
              const timing =
                classifyTimingLabel(date, patient?.procedure_datetime_cag ?? null, 'CAG') ||
                classifyTimingLabel(date, patient?.procedure_datetime_ptca ?? null, 'PTCA');
              return (
                <tr key={date} className="border-b">
                  <td className="p-2">{date}</td>
                  {['intake_ml', 'output_ml'].map(field => (
                    <td key={field} className="p-1">
                      <input
                        type="number"
                        className="border rounded w-full p-1"
                        value={(row as any)?.[field] ?? ''}
                        onChange={e => updateFluidField(date, field, e.target.value ? Number(e.target.value) : null)}
                      />
                    </td>
                  ))}
                  <td className="p-1">{row?.balance_ml ?? ''}</td>
                  <td className="p-1 text-xs">
                    {timing && <span className={`px-1 rounded font-semibold ${chipClass(timing)}`}>{timing}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        onClick={saveAll}
        disabled={!patient || saving}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save All'}
      </button>
    </div>
  );
}
