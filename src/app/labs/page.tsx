'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// ===============================
// 1. SUPABASE CLIENT
// ===============================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
);

// ===============================
// 2. LAB PARAMETERS, UNITS & RANGES
// ===============================
type Range = { unit: string; lo?: number; hi?: number; text?: string };

const LAB_RANGES: Record<string, Range> = {
  // Hematology
  hb: { unit: 'g/dL', lo: 12, hi: 17 },
  wbc: { unit: '/mm³', lo: 4000, hi: 11000 },
  platelet: { unit: '/mm³', lo: 150000, hi: 450000 },

  // Renal
  scr: { unit: 'mg/dL', lo: 0.6, hi: 1.2 },
  urea: { unit: 'mg/dL', lo: 15, hi: 45 },
  uric_acid: { unit: 'mg/dL', lo: 3.5, hi: 7.2 },

  // Electrolytes
  na: { unit: 'mEq/L', lo: 135, hi: 145 },
  k: { unit: 'mEq/L', lo: 3.5, hi: 5.0 },
  cl: { unit: 'mEq/L', lo: 98, hi: 106 },
  ca: { unit: 'mg/dL', lo: 8.5, hi: 10.5 },
  phosphate: { unit: 'mg/dL', lo: 2.5, hi: 4.5 },

  // Liver
  tbil: { unit: 'mg/dL', lo: 0.3, hi: 1.2 },
  dbil: { unit: 'mg/dL', lo: 0.0, hi: 0.3 },
  alp: { unit: 'IU/L', lo: 44, hi: 147 },
  sgpt: { unit: 'IU/L', lo: 7, hi: 56 },
  tprotein: { unit: 'g/dL', lo: 6.0, hi: 8.3 },
  albumin: { unit: 'g/dL', lo: 3.5, hi: 5.0 },

  // Coagulation
  pt: { unit: 'sec', lo: 11, hi: 13.5 },
  inr: { unit: 'ratio', lo: 0.8, hi: 1.2 },
  aptt: { unit: 'sec', lo: 25, hi: 35 },
  fibrinogen: { unit: 'mg/dL', lo: 200, hi: 400 },
  ddimer: { unit: 'µg/mL FEU', hi: 0.5 },

  // ABG
  abg_ph: { unit: '', lo: 7.35, hi: 7.45 },
  pco2: { unit: 'mmHg', lo: 35, hi: 45 },
  po2: { unit: 'mmHg', lo: 80, hi: 100 },
  hco3: { unit: 'mEq/L', lo: 22, hi: 26 },
  lactate: { unit: 'mmol/L', lo: 0.5, hi: 1.6 },

  // Inflammatory / Cardiac
  crp: { unit: 'mg/L', hi: 6 },
  troponin: { unit: 'ng/mL', hi: 0.04 },
  cpk: { unit: 'IU/L', lo: 10, hi: 120 },
  cpkmb: { unit: 'IU/L', hi: 25 },

  // Others
  rbs: { unit: 'mg/dL', lo: 70, hi: 140 },

  // Urine
  urine_pus_cells: { unit: '/HPF', text: '0-5' },
  urine_rbc: { unit: '/HPF', text: '0-3' },
  urine_protein: { unit: '', text: 'Negative' },
  urine_sugar: { unit: '', text: 'Negative' },
  urine_specific_gravity: { unit: '', lo: 1.005, hi: 1.030 },
  urine_ph: { unit: '', lo: 4.5, hi: 8 },
};

const LAB_FIELD_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Hematology', keys: ['hb','wbc','platelet'] },
  { title: 'Renal', keys: ['scr','urea','uric_acid'] },
  { title: 'Electrolytes', keys: ['na','k','cl','ca','phosphate'] },
  { title: 'Liver', keys: ['tbil','dbil','alp','sgpt','tprotein','albumin'] },
  { title: 'Coagulation', keys: ['pt','inr','aptt','fibrinogen','ddimer'] },
  { title: 'ABG', keys: ['abg_ph','pco2','po2','hco3','lactate'] },
  { title: 'Inflammatory & Cardiac', keys: ['crp','troponin','cpk','cpkmb'] },
  { title: 'Others', keys: ['rbs'] },
  { title: 'Urine', keys: ['urine_pus_cells','urine_rbc','urine_protein','urine_sugar','urine_specific_gravity','urine_ph'] },
];

// ===============================
// 3. TIMEPOINT CALCULATION
// ===============================
function calcFlag(labDateISO: string, procISO: string | null) {
  if (!procISO) return '—';
  const labDate = new Date(labDateISO);
  const proc = new Date(procISO);
  const diffHrs = (labDate.getTime() - proc.getTime()) / 36e5;
  if (labDate < proc) return 'Pre';
  if (diffHrs <= 24) return '0–24 h';
  if (diffHrs <= 48) return '24–48 h';
  if (diffHrs <= 72) return '48–72 h';
  return '—';
}

// ===============================
// 4. ABNORMAL VALUE CHECK
// ===============================
function isAbnormal(key: string, value: any): boolean {
  const meta = LAB_RANGES[key];
  if (!meta || value === '' || value === null || value === undefined) return false;

  if (typeof value === 'number') {
    if (meta.lo !== undefined && value < meta.lo) return true;
    if (meta.hi !== undefined && value > meta.hi) return true;
  } else if (typeof value === 'string' && meta.text) {
    const norm = meta.text.toLowerCase();
    const val = value.toLowerCase();
    if (norm.includes('-')) {
      const m = norm.match(/(\d+)\s*-\s*(\d+)/);
      if (m) {
        const lo = Number(m[1]), hi = Number(m[2]);
        const num = Number(val.replace(/[^0-9.]/g,''));
        if (!isNaN(num)) return num < lo || num > hi;
      }
    } else if (val !== norm) return true;
  }
  return false;
}

// ===============================
// 5. MAIN COMPONENT
// ===============================
export default function LabsPage({ params }: { params: { id: string } }) {
  const patientId = params.id;
  const [labs, setLabs] = useState<any[]>([]);
  const [patient, setPatient] = useState<any>(null);
  const [labDate, setLabDate] = useState('');
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: patientData } = await supabase
        .from('patient_details')
        .select('id, procedure_datetime_cag, procedure_datetime_ptca')
        .eq('id', patientId)
        .maybeSingle();
      setPatient(patientData);

      const { data: labData } = await supabase
        .from('lab_results')
        .select('*')
        .eq('patient_id', patientId)
        .order('lab_date', { ascending: true });
      setLabs(labData || []);
    })();
  }, [patientId]);

  async function handleSave() {
    if (!labDate) {
      alert('Please select Lab Date');
      return;
    }

    const payload: any = { patient_id: patientId, lab_date: labDate };
    for (const grp of LAB_FIELD_GROUPS) {
      for (const key of grp.keys) {
        const val = formValues[key];
        if (val !== '' && val !== undefined && val !== null) payload[key] = val;
      }
    }

    setLoading(true);
    const { data, error } = await supabase.from('lab_results').insert([payload]).select('*');
    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    setLabs(prev => [...prev, ...(data || [])]);
    setLabDate('');
    setFormValues({});
  }

  function handleChange(key: string, raw: string) {
    const meta = LAB_RANGES[key];
    let val: any = raw;
    if (meta && meta.text) {
      val = raw;
    } else {
      const n = Number(raw);
      val = isNaN(n) ? '' : n;
    }
    setFormValues(prev => ({ ...prev, [key]: val }));
  }

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: 20 }}>
      <h1>🧪 Labs</h1>
      <p style={{ color: '#6b7280' }}>
        Enter lab values once. CAG and PTCA flags are auto-calculated dynamically from procedure datetimes.
      </p>

      {/* ===== FORM ===== */}
      <div style={{ border: '2px dashed #e5e7eb', padding: 16, borderRadius: 8, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ fontWeight: 600 }}>Lab Date</div>
          <input
            type="date"
            value={labDate}
            onChange={(e) => setLabDate(e.target.value)}
            style={{ padding: 8, border: '1px solid #d1d5db', borderRadius: 8 }}
          />
        </div>

        {LAB_FIELD_GROUPS.map((grp) => (
          <div key={grp.title} style={{ marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
            <h3 style={{ margin: '4px 0 12px', fontSize: '1rem' }}>{grp.title}</h3>
            {grp.keys.map((key) => {
              const meta = LAB_RANGES[key];
              const val = formValues[key] ?? '';
              const abnormal = val !== '' && isAbnormal(key, val);
              return (
                <div
                  key={key}
                  style={{ display: 'grid', gridTemplateColumns: '150px 1fr 100px 200px', gap: 12, marginBottom: 6 }}
                >
                  <div style={{ fontWeight: 600 }}>{key.toUpperCase()}</div>
                  <input
                    value={val}
                    onChange={(e) => handleChange(key, e.target.value)}
                    style={{
                      padding: 8,
                      borderRadius: 6,
                      border: '1px solid',
                      borderColor: abnormal ? '#ef4444' : '#d1d5db',
                    }}
                  />
                  <div style={{ color: '#6b7280' }}>{meta?.unit || ''}</div>
                  <div style={{ fontSize: 13, color: abnormal ? '#ef4444' : '#6b7280' }}>
                    {meta?.text ? `Normal: ${meta.text}` : `Normal: ${meta?.lo ?? ''} - ${meta?.hi ?? ''}`}
                    {abnormal && <span style={{ marginLeft: 6 }}>⚠️</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <button
          onClick={handleSave}
          disabled={loading}
          style={{
            padding: '10px 16px',
            background: '#111827',
            color: 'white',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {loading ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* ===== TABLE ===== */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: 8, textAlign: 'left' }}>Date</th>
              <th style={{ padding: 8, textAlign: 'left' }}>CAG Flag</th>
              <th style={{ padding: 8, textAlign: 'left' }}>PTCA Flag</th>
              {LAB_FIELD_GROUPS.flatMap((g) => g.keys).map((key) => (
                <th key={key} style={{ padding: 8, textAlign: 'left' }}>{key.toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labs.map((row) => {
              const cagFlag = calcFlag(row.lab_date, patient?.procedure_datetime_cag || null);
              const ptcaFlag = calcFlag(row.lab_date, patient?.procedure_datetime_ptca || null);
              return (
                <tr key={row.id || row.lab_date}>
                  <td style={{ padding: 8, borderTop: '1px solid #e5e7eb' }}>{row.lab_date}</td>
                  <td style={{ padding: 8, borderTop: '1px solid #e5e7eb' }}>{cagFlag}</td>
                  <td style={{ padding: 8, borderTop: '1px solid #e5e7eb' }}>{ptcaFlag}</td>
                  {LAB_FIELD_GROUPS.flatMap((g) => g.keys).map((key) => {
                    const val = row[key];
                    const abnormal = val !== null && val !== undefined && val !== '' && isAbnormal(key, val);
                    const unit = LAB_RANGES[key]?.unit || '';
                    return (
                      <td
                        key={key}
                        style={{
                          padding: 8,
                          borderTop: '1px solid #e5e7eb',
                          color: abnormal ? '#ef4444' : undefined,
                        }}
                      >
                        {val !== null && val !== undefined ? `${val}${unit ? ' ' + unit : ''}` : '—'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
