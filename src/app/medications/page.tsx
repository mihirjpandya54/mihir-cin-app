'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// ---------------- SUPABASE ----------------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---------------- TYPES ----------------
type Patient = {
  id: string;
  patient_name: string;
  ipd_number: string;
  procedure_datetime_cag: string | null;
  procedure_datetime_ptca: string | null;
};

type MedicationMaster = {
  id: string;
  drug_name: string;
  drug_class: string;
  reference_dose: string | null;
  route: string | null;
  is_nephrotoxic: boolean;
  is_preventive: boolean;
};

type MedAdmin = {
  id?: string;
  patient_id: string;
  medication_id: string;
  dose: string | null;
  frequency: string | null;
  selected_dates: string[]; // we'll store dates as array of YYYY-MM-DD
};

type MedSummary = {
  patient_id: string;
  nephrotoxic_pre_cag_count: number;
  nephrotoxic_pre_ptca_count: number;
  nephrotoxic_pre_earliest_count: number;
  preventive_pre_cag_count: number;
  preventive_pre_ptca_count: number;
  preventive_pre_earliest_count: number;
  preventive_post_cag_count: number;
  preventive_post_ptca_count: number;
  preventive_post_earliest_count: number;
};

// ---------------- HELPERS ----------------
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

function classifyTiming(date: string, procISO: string | null, tag: 'CAG' | 'PTCA') {
  if (!procISO) return null;
  const selected = new Date(date + 'T00:00:00');
  const proc = new Date(procISO);
  const procDate = new Date(proc.getFullYear(), proc.getMonth(), proc.getDate());
  const diff = Math.round((selected.getTime() - procDate.getTime()) / (24 * 60 * 60 * 1000));

  if (diff < 0) return `Pre ${tag}`;
  if (diff === 0) return `0–24h ${tag}`;
  if (diff === 1) return `48h ${tag}`;
  if (diff === 2) return `72h ${tag}`;
  return null;
}

const chipClass = (label: string) => {
  if (label.startsWith('Pre')) return 'bg-green-100 text-green-800 border-green-300';
  if (label.startsWith('0–24')) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  if (label.startsWith('48')) return 'bg-orange-100 text-orange-800 border-orange-300';
  if (label.startsWith('72')) return 'bg-red-100 text-red-800 border-red-300';
  return 'bg-gray-100 text-gray-800 border-gray-300';
};

// ---------------- COMPONENT ----------------
export default function MedicationsPage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [medications, setMedications] = useState<MedicationMaster[]>([]);
  const [adminRecords, setAdminRecords] = useState<MedAdmin[]>([]);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<MedSummary | null>(null);

  // Load active patient
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

      if (p) {
        setPatient({
          id: p.id,
          patient_name: p.patient_name,
          ipd_number: p.ipd_number,
          procedure_datetime_cag: p.procedure_datetime_cag,
          procedure_datetime_ptca: p.procedure_datetime_ptca,
        });
      }
    })();
  }, []);

  // Load master list + patient meds
  useEffect(() => {
    (async () => {
      const { data: meds } = await supabase
        .from('medications_master')
        .select('*')
        .order('drug_class')
        .order('drug_name');
      setMedications(meds || []);
    })();
  }, []);

  useEffect(() => {
    if (!patient) return;
    (async () => {
      const { data } = await supabase
        .from('medication_administration')
        .select('*')
        .eq('patient_id', patient.id);
      const parsed = (data || []).map((r: any) => ({
        ...r,
        selected_dates: r.selected_dates || [],
      }));
      setAdminRecords(parsed);
      loadSummary(patient.id);
    })();
  }, [patient]);

  async function loadSummary(pid: string) {
    const { data } = await supabase
      .from('medication_summary_per_patient')
      .select('*')
      .eq('patient_id', pid)
      .maybeSingle();
    if (data) setSummary(data);
  }

  function toggleDate(medId: string, date: string) {
    setAdminRecords((prev) => {
      const existing = prev.find((r) => r.medication_id === medId);
      if (!existing) {
        return [...prev, { medication_id: medId, patient_id: patient!.id, dose: null, frequency: null, selected_dates: [date] }];
      }
      const dates = existing.selected_dates.includes(date)
        ? existing.selected_dates.filter((d) => d !== date)
        : [...existing.selected_dates, date];
      return prev.map((r) => (r.medication_id === medId ? { ...r, selected_dates: dates } : r));
    });
  }

  function setDose(medId: string, value: string) {
    setAdminRecords((prev) =>
      prev.map((r) => (r.medication_id === medId ? { ...r, dose: value } : r))
    );
  }

  function setFreq(medId: string, value: string) {
    setAdminRecords((prev) =>
      prev.map((r) => (r.medication_id === medId ? { ...r, frequency: value } : r))
    );
  }

  async function saveAll() {
    if (!patient) return;
    setSaving(true);
    const upserts = adminRecords.map((r) => ({
      id: r.id || uuidv4(),
      patient_id: patient.id,
      medication_id: r.medication_id,
      dose: r.dose,
      frequency: r.frequency,
      selected_dates: r.selected_dates,
    }));

    const { error } = await supabase.from('medication_administration').upsert(upserts, { onConflict: 'id' });
    if (!error) await loadSummary(patient.id);
    setSaving(false);
  }

  // Dates
  const today = new Date();
  const dateOptions = Array.from({ length: 7 }).map((_, i) => fmtDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)));

  return (
    <div className="min-h-screen bg-gray-100 p-5 flex flex-col items-center">
      <h1 className="text-3xl font-extrabold mb-4 text-gray-900">💊 Medications</h1>

      {patient && (
        <div className="bg-blue-50 border border-blue-200 rounded w-full max-w-4xl p-3 mb-4 text-gray-900">
          <strong>Patient:</strong> {patient.patient_name} — <strong>IPD:</strong> {patient.ipd_number}
        </div>
      )}

      <div className="bg-white w-full max-w-4xl rounded shadow p-4 space-y-6">
        {medications.map((med) => {
          const record = adminRecords.find((r) => r.medication_id === med.id);
          return (
            <div key={med.id} className="border rounded p-3">
              <div className="font-semibold text-gray-900 mb-2 flex justify-between">
                <span>{med.drug_name} <span className="text-sm text-gray-500">({med.drug_class})</span></span>
                {med.is_nephrotoxic && <span className="text-red-600 text-sm font-bold">NEPHROTOXIC</span>}
                {med.is_preventive && <span className="text-green-600 text-sm font-bold">PREVENTIVE</span>}
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Dose"
                  className="border p-2 rounded"
                  value={record?.dose || ''}
                  onChange={(e) => setDose(med.id, e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Frequency"
                  className="border p-2 rounded"
                  value={record?.frequency || ''}
                  onChange={(e) => setFreq(med.id, e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {dateOptions.map((d) => {
                  const checked = record?.selected_dates.includes(d);
                  const cagLabel = classifyTiming(d, patient?.procedure_datetime_cag ?? null, 'CAG');
                  const ptcaLabel = classifyTiming(d, patient?.procedure_datetime_ptca ?? null, 'PTCA');
                  return (
                    <div key={d} className="border p-2 rounded bg-gray-50">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDate(med.id, d)}
                        />
                        <span>{d}</span>
                      </label>
                      <div className="mt-1 flex flex-col gap-1 text-xs">
                        {cagLabel && <span className={`px-2 py-0.5 rounded border ${chipClass(cagLabel)}`}>{cagLabel}</span>}
                        {ptcaLabel && <span className={`px-2 py-0.5 rounded border ${chipClass(ptcaLabel)}`}>{ptcaLabel}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <button
          onClick={saveAll}
          disabled={saving || !patient}
          className="bg-blue-600 text-white px-4 py-2 rounded w-full hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save All'}
        </button>
      </div>

      {/* SUMMARY TABLE */}
      {summary && (
        <div className="bg-white w-full max-w-4xl mt-6 rounded shadow p-4">
          <h2 className="text-2xl font-bold mb-4 text-gray-900">📊 Summary</h2>
          <table className="w-full border text-center">
            <thead>
              <tr className="bg-gray-200">
                <th className="border p-2"></th>
                <th className="border p-2">Nephrotoxic</th>
                <th className="border p-2">Preventive</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border p-2">Pre CAG</td>
                <td className="border p-2">{summary.nephrotoxic_pre_cag_count > 0 ? '✅' : '❌'}</td>
                <td className="border p-2">{summary.preventive_pre_cag_count > 0 ? '✅' : '❌'}</td>
              </tr>
              <tr>
                <td className="border p-2">Pre PTCA</td>
                <td className="border p-2">{summary.nephrotoxic_pre_ptca_count > 0 ? '✅' : '❌'}</td>
                <td className="border p-2">{summary.preventive_pre_ptca_count > 0 ? '✅' : '❌'}</td>
              </tr>
              <tr>
                <td className="border p-2">Pre Earliest</td>
                <td className="border p-2">{summary.nephrotoxic_pre_earliest_count > 0 ? '✅' : '❌'}</td>
                <td className="border p-2">{summary.preventive_pre_earliest_count > 0 ? '✅' : '❌'}</td>
              </tr>
              <tr>
                <td className="border p-2">Post CAG</td>
                <td className="border p-2">{summary.preventive_post_cag_count > 0 ? '✅' : '❌'}</td>
                <td className="border p-2">{summary.preventive_post_cag_count > 0 ? '✅' : '❌'}</td>
              </tr>
              <tr>
                <td className="border p-2">Post PTCA</td>
                <td className="border p-2">{summary.preventive_post_ptca_count > 0 ? '✅' : '❌'}</td>
                <td className="border p-2">{summary.preventive_post_ptca_count > 0 ? '✅' : '❌'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
