'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  sbp_max: string;
  sbp_min: string;
  sbp_avg: string;
  dbp_max: string;
  dbp_min: string;
  dbp_avg: string;
  map_max: string;
  map_min: string;
  map_avg: string;
  date: string;
  saved?: boolean;
};

type FluidRow = {
  _clientId: string;
  id?: string | null;
  intake_ml: string;
  output_ml: string;
  balance_ml: string;
  date: string;
  saved?: boolean;
};

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

// MAP formula
function calcMAP(sbp: string, dbp: string): string {
  const s = parseFloat(sbp);
  const d = parseFloat(dbp);
  if (isNaN(s) || isNaN(d)) return '';
  const map = (s + 2 * d) / 3;
  return map.toFixed(1);
}

export default function BPAndFluidsPage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [bpRows, setBpRows] = useState<BPRow[]>([]);
  const [fluidRows, setFluidRows] = useState<FluidRow[]>([]);
  const [saving, setSaving] = useState(false);

  // Load active patient & data
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

      const { data: bpData } = await supabase
        .from('bp_chart')
        .select('*')
        .eq('patient_id', active.patient_id);

      const { data: fluidData } = await supabase
        .from('fluid_chart')
        .select('*')
        .eq('patient_id', active.patient_id);

      setBpRows((bpData || []).map((r: any) => ({
        _clientId: `db-${r.id}`,
        id: r.id,
        sbp_max: r.sbp_max ?? '',
        sbp_min: r.sbp_min ?? '',
        sbp_avg: r.sbp_avg ?? '',
        dbp_max: r.dbp_max ?? '',
        dbp_min: r.dbp_min ?? '',
        dbp_avg: r.dbp_avg ?? '',
        map_max: r.map_max ?? '',
        map_min: r.map_min ?? '',
        map_avg: r.map_avg ?? '',
        date: r.bp_date,
        saved: true
      })));

      setFluidRows((fluidData || []).map((r: any) => ({
        _clientId: `db-${r.id}`,
        id: r.id,
        intake_ml: r.intake_ml ?? '',
        output_ml: r.output_ml ?? '',
        balance_ml: r.balance_ml ?? '',
        date: r.fluid_date,
        saved: true
      })));
    })();
  }, []);

  // 7 date columns
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

  // 🩺 BP field update with MAP auto calc
  const updateBPField = (date: string, field: keyof BPRow, value: string) => {
    setBpRows(prev => {
      const idx = prev.findIndex(r => r.date === date);
      let newRow: BPRow;
      if (idx === -1) {
        newRow = {
          _clientId: `c-${crypto.randomUUID()}`,
          date,
          sbp_max: '',
          sbp_min: '',
          sbp_avg: '',
          dbp_max: '',
          dbp_min: '',
          dbp_avg: '',
          map_max: '',
          map_min: '',
          map_avg: ''
        };
      } else {
        newRow = { ...prev[idx] };
      }

      (newRow as any)[field] = value;

      // Auto MAP calc
      newRow.map_max = calcMAP(newRow.sbp_max, newRow.dbp_max);
      newRow.map_min = calcMAP(newRow.sbp_min, newRow.dbp_min);
      newRow.map_avg = calcMAP(newRow.sbp_avg, newRow.dbp_avg);

      if (idx === -1) return [...prev, newRow];
      const copy = [...prev];
      copy[idx] = newRow;
      return copy;
    });
  };

  const updateFluidField = (date: string, field: keyof FluidRow, value: string) => {
    setFluidRows(prev => {
      const idx = prev.findIndex(r => r.date === date);
      if (idx === -1) {
        return [...prev, { _clientId: `c-${crypto.randomUUID()}`, date, [field]: value } as FluidRow];
      } else {
        const copy = [...prev];
const updated: any = { ...(copy[idx] as any) };
updated[field] = value;
copy[idx] = updated;
return copy;
        
      }
    });
  };

  const deleteRow = async (type: 'bp' | 'fluid', clientId: string, id?: string | null) => {
    if (id) {
      await supabase.from(type === 'bp' ? 'bp_chart' : 'fluid_chart').delete().eq('id', id);
    }
    if (type === 'bp') setBpRows(prev => prev.filter(r => r._clientId !== clientId));
    else setFluidRows(prev => prev.filter(r => r._clientId !== clientId));
  };

  const saveAll = async () => {
    if (!patient) return;
    setSaving(true);
    try {
      // Save BP
      for (const r of bpRows) {
        const cagLabel = classifyTimingLabel(r.date, patient.procedure_datetime_cag, 'CAG');
        const ptcaLabel = classifyTimingLabel(r.date, patient.procedure_datetime_ptca, 'PTCA');
        const timingLabel = cagLabel || ptcaLabel;
        const payload = {
          patient_id: patient.id,
          sbp_max: r.sbp_max || null,
          sbp_min: r.sbp_min || null,
          sbp_avg: r.sbp_avg || null,
          dbp_max: r.dbp_max || null,
          dbp_min: r.dbp_min || null,
          dbp_avg: r.dbp_avg || null,
          map_max: r.map_max || null,
          map_min: r.map_min || null,
          map_avg: r.map_avg || null,
          bp_date: r.date,
          timing_label: timingLabel
        };
        if (r.id) {
          await supabase.from('bp_chart').update(payload).eq('id', r.id);
        } else {
          await supabase.from('bp_chart').insert(payload);
        }
      }

      // Save Fluids
      for (const r of fluidRows) {
        const cagLabel = classifyTimingLabel(r.date, patient.procedure_datetime_cag, 'CAG');
        const ptcaLabel = classifyTimingLabel(r.date, patient.procedure_datetime_ptca, 'PTCA');
        const timingLabel = cagLabel || ptcaLabel;
        const payload = {
          patient_id: patient.id,
          intake_ml: r.intake_ml || null,
          output_ml: r.output_ml || null,
          balance_ml: r.balance_ml || null,
          fluid_date: r.date,
          timing_label: timingLabel
        };
        if (r.id) {
          await supabase.from('fluid_chart').update(payload).eq('id', r.id);
        } else {
          await supabase.from('fluid_chart').insert(payload);
        }
      }

      alert('✅ All data saved');
    } catch (e) {
      console.error(e);
      alert('❌ Save failed');
    } finally {
      setSaving(false);
    }
  };

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
              <th className="p-2 text-left">Date</th>
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
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {dateOptions.map(d => {
              const row = bpRows.find(r => r.date === d);
              const cagLabel = classifyTimingLabel(d, patient?.procedure_datetime_cag ?? null, 'CAG');
              const ptcaLabel = classifyTimingLabel(d, patient?.procedure_datetime_ptca ?? null, 'PTCA');
              const timingLabel = cagLabel || ptcaLabel;
              return (
                <tr key={d}>
                  <td className="p-2">{d}</td>
                  {['sbp_max','sbp_min','sbp_avg','dbp_max','dbp_min','dbp_avg'].map(f=>(
                    <td key={f} className="p-1">
                      <input
                        className="border p-1 rounded w-full text-sm text-gray-900 border-gray-400"
                        value={row ? (row as any)[f] : ''}
                        onChange={e => updateBPField(d, f as keyof BPRow, e.target.value)}
                      />
                    </td>
                  ))}
                  {['map_max','map_min','map_avg'].map(f=>(
                    <td key={f} className="p-1 text-center text-gray-900">
                      {row ? (row as any)[f] : ''}
                    </td>
                  ))}
                  <td className="p-2">
                    {timingLabel && <span className={`px-2 py-1 rounded text-xs font-semibold ${chipClass(timingLabel)}`}>{timingLabel}</span>}
                  </td>
                  <td className="p-1">
                    {row && (
                      <button className="btn btn-xs btn-error" onClick={() => deleteRow('bp', row._clientId, row.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Fluid Table */}
      <div className="overflow-auto w-full max-w-6xl bg-white rounded shadow">
        <table className="w-full text-sm text-gray-900">
          <thead className="bg-gray-300 sticky top-0">
            <tr>
              <th className="p-2 text-left">Date</th>
              <th className="p-2">Intake (ml)</th>
              <th className="p-2">Output (ml)</th>
              <th className="p-2">Balance (ml)</th>
              <th className="p-2">Timing</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {dateOptions.map(d => {
              const row = fluidRows.find(r => r.date === d);
              const cagLabel = classifyTimingLabel(d, patient?.procedure_datetime_cag ?? null, 'CAG');
              const ptcaLabel = classifyTimingLabel(d, patient?.procedure_datetime_ptca ?? null, 'PTCA');
              const timingLabel = cagLabel || ptcaLabel;
              return (
                <tr key={d}>
                  <td className="p-2">{d}</td>
                  {['intake_ml','output_ml','balance_ml'].map(f=>(
                    <td key={f} className="p-1">
                      <input
                        className="border p-1 rounded w-full text-sm text-gray-900 border-gray-400"
                        value={row ? (row as any)[f] : ''}
                        onChange={e => updateFluidField(d, f as keyof FluidRow, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="p-2">
                    {timingLabel && <span className={`px-2 py-1 rounded text-xs font-semibold ${chipClass(timingLabel)}`}>{timingLabel}</span>}
                  </td>
                  <td className="p-1">
                    {row && (
                      <button className="btn btn-xs btn-error" onClick={() => deleteRow('fluid', row._clientId, row.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Save Button */}
      <div className="w-full max-w-6xl mt-4">
        <button
          onClick={saveAll}
          disabled={!patient || saving}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save All'}
        </button>
      </div>
    </div>
  );
}
