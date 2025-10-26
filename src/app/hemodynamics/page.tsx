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

type HemodynamicsRow = {
  id?: string;
  pre_procedure_instability_cag: boolean;
  peri_procedure_instability_cag: boolean;
  post_procedure_instability_cag: boolean;
  pre_procedure_instability_ptca: boolean;
  peri_procedure_instability_ptca: boolean;
  post_procedure_instability_ptca: boolean;
};

type BP = {
  bp_date: string; // YYYY-MM-DD
  sbp_max: number | null;
  sbp_min: number | null;
  sbp_avg: number | null;
};

type Med = {
  med_date: string; // YYYY-MM-DD
  drug_class: string | null;
};

// ---------- Helpers ----------
const fmtYmd = (d: Date) => d.toISOString().slice(0, 10);

function dayDatesAround(procISO: string | null) {
  if (!procISO) return null;
  const proc = new Date(procISO);
  const base = new Date(proc.getFullYear(), proc.getMonth(), proc.getDate());
  const pre = new Date(base); pre.setDate(base.getDate() - 1);     // day -1
  const peri = new Date(base);                                     // day 0
  const post1 = new Date(base); post1.setDate(base.getDate() + 1); // day +1
  const post2 = new Date(base); post2.setDate(base.getDate() + 2); // day +2
  return {
    pre: fmtYmd(pre),
    peri: fmtYmd(peri),
    postCandidates: [fmtYmd(post1), fmtYmd(post2)],
  };
}

function sbpLowOnDate(bpByDate: Record<string, BP[]>, date: string): boolean {
  const rows = bpByDate[date];
  if (!rows || rows.length === 0) return false;
  // Consider any entry with SBP_MIN < 90 or SBP_AVG < 90 as hypotension
  for (const r of rows) {
    const minLow = (r.sbp_min ?? Infinity) < 90;
    const avgLow = (r.sbp_avg ?? Infinity) < 90;
    if (minLow || avgLow) return true;
  }
  return false;
}

function pressorUsedOnDate(medsByDate: Record<string, Med[]>, date: string): boolean {
  const rows = medsByDate[date];
  if (!rows || rows.length === 0) return false;
  return rows.some(m => (m.drug_class ?? '').toLowerCase() === 'vasopressors / inotropes'.toLowerCase());
}

const chip = (present: boolean) =>
  present
    ? 'bg-red-200 text-red-900 border-red-600'
    : 'bg-green-200 text-green-900 border-green-600';

const sectionCard = 'bg-white rounded shadow border border-gray-200';

// ---------- Page ----------
export default function HemodynamicsPage() {
  const [patient, setPatient] = useState<Patient | null>(null);

  // Raw sources for auto-calc
  const [bpRows, setBpRows] = useState<BP[]>([]);
  const [medRows, setMedRows] = useState<Med[]>([]);

  // Manual inputs per procedure (applies as OR to all three windows; you can still override each cell)
  const [shockCAG, setShockCAG] = useState(false);
  const [arrestCAG, setArrestCAG] = useState(false);
  const [shockPTCA, setShockPTCA] = useState(false);
  const [arrestPTCA, setArrestPTCA] = useState(false);

  // Final six booleans (editable / saved)
  const [values, setValues] = useState<HemodynamicsRow>({
    pre_procedure_instability_cag: false,
    peri_procedure_instability_cag: false,
    post_procedure_instability_cag: false,
    pre_procedure_instability_ptca: false,
    peri_procedure_instability_ptca: false,
    post_procedure_instability_ptca: false,
  });

  const [rowId, setRowId] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  // ---------- Load active patient + sources ----------
  useEffect(() => {
    (async () => {
      // 1) Active patient
      const userId = '00000000-0000-0000-0000-000000000001';
      const { data: active } = await supabase
        .from('active_patient')
        .select('patient_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (!active?.patient_id) return;

      // 2) Patient details
      const { data: p } = await supabase
        .from('patient_details')
        .select('id, patient_name, ipd_number, procedure_datetime_cag, procedure_datetime_ptca')
        .eq('id', active.patient_id)
        .single();
      if (!p) return;
      setPatient(p);

      // 3) Existing hemodynamics (single row per patient)
      const { data: hd } = await supabase
        .from('hemodynamics')
        .select('*')
        .eq('patient_id', p.id)
        .maybeSingle();

      if (hd) {
        setRowId(hd.id);
        setValues({
          pre_procedure_instability_cag: !!hd.pre_procedure_instability_cag,
          peri_procedure_instability_cag: !!hd.peri_procedure_instability_cag,
          post_procedure_instability_cag: !!hd.post_procedure_instability_cag,
          pre_procedure_instability_ptca: !!hd.pre_procedure_instability_ptca,
          peri_procedure_instability_ptca: !!hd.peri_procedure_instability_ptca,
          post_procedure_instability_ptca: !!hd.post_procedure_instability_ptca,
        });
      }

      // 4) BP
      const { data: bp } = await supabase
        .from('bp_chart')
        .select('bp_date, sbp_max, sbp_min, sbp_avg')
        .eq('patient_id', p.id);
      setBpRows((bp ?? []) as BP[]);

      // 5) Medications (only need date + class)
      const { data: meds } = await supabase
        .from('medications')
        .select('med_date, drug_class')
        .eq('patient_id', p.id);
      setMedRows((meds ?? []) as Med[]);
    })();
  }, []);

  // Index by date for fast lookups
  const bpByDate = useMemo(() => {
    const map: Record<string, BP[]> = {};
    for (const r of bpRows) {
      const key = (r.bp_date ?? '').slice(0, 10);
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    return map;
  }, [bpRows]);

  const medsByDate = useMemo(() => {
    const map: Record<string, Med[]> = {};
    for (const r of medRows) {
      const key = (r.med_date ?? '').slice(0, 10);
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    return map;
  }, [medRows]);

  // ---------- Auto-calc whenever sources or toggles change ----------
  useEffect(() => {
    if (!patient) return;

    const cagDates = dayDatesAround(patient.procedure_datetime_cag);
    const ptcaDates = dayDatesAround(patient.procedure_datetime_ptca);

    // Helper to compute 3 flags for a given procedure
    const computeTriplet = (
      dates: ReturnType<typeof dayDatesAround> | null,
      shock: boolean,
      arrest: boolean
    ) => {
      if (!dates) return { pre: false, peri: false, post: false };

      // SBP < 90 or pressor use for each window
      const preAuto =
        sbpLowOnDate(bpByDate, dates.pre) ||
        pressorUsedOnDate(medsByDate, dates.pre) ||
        shock ||
        arrest;

      const periAuto =
        sbpLowOnDate(bpByDate, dates.peri) ||
        pressorUsedOnDate(medsByDate, dates.peri) ||
        shock ||
        arrest;

      const postAuto =
        dates.postCandidates.some(d => sbpLowOnDate(bpByDate, d) || pressorUsedOnDate(medsByDate, d)) ||
        shock ||
        arrest;

      return { pre: preAuto, peri: periAuto, post: postAuto };
    };

    const cag = computeTriplet(cagDates, shockCAG, arrestCAG);
    const ptca = computeTriplet(ptcaDates, shockPTCA, arrestPTCA);

    setValues(prev => ({
      ...prev,
      pre_procedure_instability_cag: cag.pre,
      peri_procedure_instability_cag: cag.peri,
      post_procedure_instability_cag: cag.post,
      pre_procedure_instability_ptca: ptca.pre,
      peri_procedure_instability_ptca: ptca.peri,
      post_procedure_instability_ptca: ptca.post,
    }));
  }, [patient, bpByDate, medsByDate, shockCAG, arrestCAG, shockPTCA, arrestPTCA]);

  // ---------- Save ----------
  async function saveAll() {
    if (!patient) return;
    setSaving(true);
    try {
      const payload = {
        patient_id: patient.id,
        pre_procedure_instability_cag: values.pre_procedure_instability_cag,
        peri_procedure_instability_cag: values.peri_procedure_instability_cag,
        post_procedure_instability_cag: values.post_procedure_instability_cag,
        pre_procedure_instability_ptca: values.pre_procedure_instability_ptca,
        peri_procedure_instability_ptca: values.peri_procedure_instability_ptca,
        post_procedure_instability_ptca: values.post_procedure_instability_ptca,
      };

      if (rowId) {
        const { error } = await supabase.from('hemodynamics').update(payload).eq('id', rowId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('hemodynamics').insert(payload).select('id').single();
        if (error) throw error;
        setRowId(data.id);
      }
      alert('Saved successfully ✅');
    } catch (err) {
      console.error(err);
      alert('Save failed ❌ — check console');
    } finally {
      setSaving(false);
    }
  }

  // ---------- UI helpers ----------
  function Row({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: boolean;
    onChange: (v: boolean) => void;
  }) {
    return (
      <tr className="border-b">
        <td className="p-2 text-left">{label}</td>
        <td className="p-2 text-center">
          <span className={`px-2 py-1 border rounded text-xs font-semibold ${chip(value)}`}>
            {value ? 'Instability Present' : 'Instability Absent'}
          </span>
        </td>
        <td className="p-2 text-center">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
            <span>Override</span>
          </label>
        </td>
      </tr>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-5 flex flex-col items-center">
      <h1 className="text-3xl font-extrabold mb-4 text-gray-900">🫀 Hemodynamics</h1>

      {patient && (
        <div className="bg-blue-50 border border-blue-200 rounded w-full max-w-6xl p-3 mb-4 text-gray-900">
          <strong>Patient:</strong> {patient.patient_name} — <strong>IPD:</strong> {patient.ipd_number}
        </div>
      )}

      {/* CAG Section */}
      <div className={`${sectionCard} w-full max-w-6xl mb-6`}>
        <div className="p-3 border-b bg-gray-50 rounded-t">
          <h2 className="text-xl font-bold text-gray-900">🫀 CAG Hemodynamics</h2>
        </div>

        <div className="p-3 flex flex-wrap gap-6 text-gray-900">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={shockCAG} onChange={e => setShockCAG(e.target.checked)} />
            <span>Shock (Yes/No)</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={arrestCAG} onChange={e => setArrestCAG(e.target.checked)} />
            <span>Cardiac Arrest (Yes/No)</span>
          </label>
        </div>

        <div className="p-3 overflow-auto">
          <table className="w-full text-sm text-gray-900">
            <thead className="bg-gray-300">
              <tr>
                <th className="p-2 text-left">Window</th>
                <th className="p-2 text-center">Auto Status</th>
                <th className="p-2 text-center">Manual Override</th>
              </tr>
            </thead>
            <tbody>
              <Row
                label="Pre-procedure"
                value={values.pre_procedure_instability_cag}
                onChange={v => setValues(prev => ({ ...prev, pre_procedure_instability_cag: v }))}
              />
              <Row
                label="Peri-procedure"
                value={values.peri_procedure_instability_cag}
                onChange={v => setValues(prev => ({ ...prev, peri_procedure_instability_cag: v }))}
              />
              <Row
                label="Post-procedure (≤72h)"
                value={values.post_procedure_instability_cag}
                onChange={v => setValues(prev => ({ ...prev, post_procedure_instability_cag: v }))}
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* PTCA Section */}
      <div className={`${sectionCard} w-full max-w-6xl mb-6`}>
        <div className="p-3 border-b bg-gray-50 rounded-t">
          <h2 className="text-xl font-bold text-gray-900">💉 PTCA Hemodynamics</h2>
        </div>

        <div className="p-3 flex flex-wrap gap-6 text-gray-900">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={shockPTCA} onChange={e => setShockPTCA(e.target.checked)} />
            <span>Shock (Yes/No)</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={arrestPTCA} onChange={e => setArrestPTCA(e.target.checked)} />
            <span>Cardiac Arrest (Yes/No)</span>
          </label>
        </div>

        <div className="p-3 overflow-auto">
          <table className="w-full text-sm text-gray-900">
            <thead className="bg-gray-300">
              <tr>
                <th className="p-2 text-left">Window</th>
                <th className="p-2 text-center">Auto Status</th>
                <th className="p-2 text-center">Manual Override</th>
              </tr>
            </thead>
            <tbody>
              <Row
                label="Pre-procedure"
                value={values.pre_procedure_instability_ptca}
                onChange={v => setValues(prev => ({ ...prev, pre_procedure_instability_ptca: v }))}
              />
              <Row
                label="Peri-procedure"
                value={values.peri_procedure_instability_ptca}
                onChange={v => setValues(prev => ({ ...prev, peri_procedure_instability_ptca: v }))}
              />
              <Row
                label="Post-procedure (≤72h)"
                value={values.post_procedure_instability_ptca}
                onChange={v => setValues(prev => ({ ...prev, post_procedure_instability_ptca: v }))}
              />
            </tbody>
          </table>
        </div>
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
