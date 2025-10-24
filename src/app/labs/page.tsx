'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// ---- Supabase client (no aliases, no extra files) ----
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---------------- Types ----------------
type Sex = 'Male' | 'Female' | '' ;

type Patient = {
  id: string;
  patient_name: string;
  ipd_number: string;
  sex: Sex;
  age: number | null;
  procedure_datetime_cag: string | null;   // ISO or null
  procedure_datetime_ptca: string | null;  // ISO or null
};

type LabRow = {
  id?: string;
  patient_id: string;
  lab_date: string; // YYYY-MM-DD

  // Hematology
  hb?: number | null;
  wbc?: number | null;
  platelet?: number | null;

  // Renal
  scr?: number | null;
  urea?: number | null;
  uric_acid?: number | null;

  // Electrolytes
  na?: number | null;
  k?: number | null;
  cl?: number | null;
  ca?: number | null;
  phosphate?: number | null;

  // LFT
  tbil?: number | null;
  dbil?: number | null;
  alp?: number | null;
  sgpt?: number | null;
  tprotein?: number | null;
  albumin?: number | null;

  // Coag
  pt?: number | null;
  inr?: number | null;
  aptt?: number | null;
  fibrinogen?: number | null;
  ddimer?: number | null;

  // ABG
  abg_ph?: number | null;
  pco2?: number | null;
  po2?: number | null;
  hco3?: number | null;
  lactate?: number | null;

  // Markers
  crp?: number | null;
  troponin?: number | null;
  cpk?: number | null;
  cpkmb?: number | null;
  rbs?: number | null;

  // Urine
  urine_pus_cells?: string | null;
  urine_rbc?: string | null;
  urine_protein?: string | null;
  urine_sugar?: string | null;
  urine_specific_gravity?: number | null;
  urine_ph?: number | null;
};

// ---------------- Normal ranges + Units ----------------
type RangeSpec =
  | { both: [number, number]; unit?: string }
  | { male: [number, number]; female: [number, number]; unit?: string };

const ranges: Partial<Record<keyof LabRow, RangeSpec>> = {
  hb: { male: [13, 17], female: [12, 15], unit: 'g/dL' },
  wbc: { both: [4, 11], unit: '×10³/µL' },
  platelet: { both: [150, 400], unit: '×10³/µL' },

  scr: { male: [0.7, 1.3], female: [0.6, 1.1], unit: 'mg/dL' },
  urea: { both: [15, 45], unit: 'mg/dL' },
  uric_acid: { male: [3.5, 7.2], female: [2.6, 6.0], unit: 'mg/dL' },

  na: { both: [135, 145], unit: 'mmol/L' },
  k: { both: [3.5, 5.0], unit: 'mmol/L' },
  cl: { both: [98, 107], unit: 'mmol/L' },
  ca: { both: [8.5, 10.5], unit: 'mg/dL' },
  phosphate: { both: [2.5, 4.5], unit: 'mg/dL' },

  tbil: { both: [0.3, 1.2], unit: 'mg/dL' },
  dbil: { both: [0.0, 0.3], unit: 'mg/dL' },
  alp: { both: [44, 147], unit: 'U/L' },
  sgpt: { both: [7, 56], unit: 'U/L' },
  tprotein: { both: [6.0, 8.3], unit: 'g/dL' },
  albumin: { both: [3.5, 5.0], unit: 'g/dL' },

  pt: { both: [11, 13.5], unit: 'sec' },
  inr: { both: [0.8, 1.2] },
  aptt: { both: [25, 35], unit: 'sec' },
  fibrinogen: { both: [200, 400], unit: 'mg/dL' },
  ddimer: { both: [0.0, 0.5], unit: 'mg/L FEU' },

  abg_ph: { both: [7.35, 7.45] },
  pco2: { both: [35, 45], unit: 'mmHg' },
  po2: { both: [80, 100], unit: 'mmHg' },
  hco3: { both: [22, 26], unit: 'mmol/L' },
  lactate: { both: [0.5, 2.2], unit: 'mmol/L' },

  crp: { both: [0, 5], unit: 'mg/L' },
  cpk: { both: [30, 200], unit: 'U/L' },
  cpkmb: { both: [0, 6], unit: 'U/L' },
  rbs: { both: [70, 140], unit: 'mg/dL' },

  urine_specific_gravity: { both: [1.005, 1.03] },
  urine_ph: { both: [4.5, 8.0] },
};

// For labels/sections (includes ALL fields)
const sections: { title: string; fields: (keyof LabRow)[] }[] = [
  { title: 'Hematology', fields: ['hb', 'wbc', 'platelet'] },
  { title: 'Renal Function', fields: ['scr', 'urea', 'uric_acid'] },
  { title: 'Electrolytes', fields: ['na', 'k', 'cl', 'ca', 'phosphate'] },
  { title: 'Liver Function', fields: ['tbil', 'dbil', 'alp', 'sgpt', 'tprotein', 'albumin'] },
  { title: 'Coagulation', fields: ['pt', 'inr', 'aptt', 'fibrinogen', 'ddimer'] },
  { title: 'ABG', fields: ['abg_ph', 'pco2', 'po2', 'hco3', 'lactate'] },
  { title: 'Markers', fields: ['crp', 'troponin', 'cpk', 'cpkmb', 'rbs'] },
];

const urineFields: (keyof LabRow)[] = [
  'urine_pus_cells',
  'urine_rbc',
  'urine_protein',
  'urine_sugar',
  'urine_specific_gravity',
  'urine_ph',
];

// ---------------- Helpers ----------------
const fmtDate = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD

function dayDiffCalendar(labDate: string, procISO: string | null): number | null {
  if (!procISO) return null;
  // Compare on calendar dates (not hours) per your rule
  const lab = new Date(labDate + 'T00:00:00');
  const proc = new Date(procISO);
  const procDate = new Date(proc.getFullYear(), proc.getMonth(), proc.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((lab.getTime() - procDate.getTime()) / msPerDay); // 0, 1, 2, -1, etc.
}

function classifyForProc(labDate: string, procISO: string | null, tag: 'CAG' | 'PTCA'): string | null {
  const diff = dayDiffCalendar(labDate, procISO);
  if (diff === null) return null;
  if (diff < 0) return `Pre (${tag})`;
  if (diff === 0) return `0–24h post (${tag})`;
  if (diff === 1) return `24–48h post (${tag})`;
  if (diff === 2) return `48–72h post (${tag})`;
  return null;
}

function calculateEGFR(scr: number, age: number | null, sex: Sex) {
  if (scr == null || age == null || !sex) return null;
  const isFemale = sex === 'Female';
  const k = isFemale ? 0.7 : 0.9;
  const a = isFemale ? -0.329 : -0.411;
  const minRatio = Math.min(scr / k, 1);
  const maxRatio = Math.max(scr / k, 1);
  const sexFactor = isFemale ? 1.018 : 1;
  return 141 * Math.pow(minRatio, a) * Math.pow(maxRatio, -1.209) * Math.pow(0.993, age) * sexFactor;
}

function isAbnormal(field: keyof LabRow, value: number | null | undefined, sex: Sex): boolean {
  if (value == null) return false;
  const spec = ranges[field];
  if (!spec) return false;
  if ('both' in spec) return value < spec.both[0] || value > spec.both[1];
  if (sex === 'Male' && spec.male) return value < spec.male[0] || value > spec.male[1];
  if (sex === 'Female' && spec.female) return value < spec.female[0] || value > spec.female[1];
  return false;
}

function normalText(field: keyof LabRow): string {
  const spec = ranges[field];
  if (!spec) return '';
  const unit = (spec as any).unit ? ` ${(spec as any).unit}` : '';
  if ('both' in spec) return `${spec.both[0]}–${spec.both[1]}${unit}`;
  return `M: ${spec.male[0]}–${spec.male[1]}${unit} | F: ${spec.female[0]}–${spec.female[1]}${unit}`;
}

function unitOf(field: keyof LabRow): string {
  const spec = ranges[field];
  if (!spec) return '';
  return ((spec as any).unit as string) || '';
}

const chipClass = (label: string) => {
  if (label.startsWith('Pre')) return 'bg-green-100 text-green-800 border-green-300';
  if (label.startsWith('0–24')) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  if (label.startsWith('24–48')) return 'bg-orange-100 text-orange-800 border-orange-300';
  if (label.startsWith('48–72')) return 'bg-red-100 text-red-800 border-red-300';
  return 'bg-gray-100 text-gray-800 border-gray-300';
};

// ---------------- Page ----------------
export default function LabsPage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [labDate, setLabDate] = useState<string>(fmtDate(new Date()));
  const [lab, setLab] = useState<LabRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>('');

  // Load active patient, then load labs for today's date by default
  useEffect(() => {
    (async () => {
      // get active patient id (you already use this user id elsewhere)
      const userId = '00000000-0000-0000-0000-000000000001';
      const { data: active } = await supabase
        .from('active_patient')
        .select('patient_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!active?.patient_id) {
        setMessage('⚠️ No active patient selected. Go to Patient Page first.');
        return;
      }

      const { data: p } = await supabase
        .from('patient_details')
        .select('id, patient_name, ipd_number, sex, age, procedure_datetime_cag, procedure_datetime_ptca')
        .eq('id', active.patient_id)
        .single();

      if (p) {
        setPatient({
          id: p.id,
          patient_name: p.patient_name,
          ipd_number: p.ipd_number,
          sex: (p.sex as Sex) || '',
          age: p.age ?? null,
          procedure_datetime_cag: p.procedure_datetime_cag,
          procedure_datetime_ptca: p.procedure_datetime_ptca,
        });
      }
    })();
  }, []);

  // Load lab row when patient or date changes
  useEffect(() => {
    if (!patient) return;
    (async () => {
      const { data } = await supabase
        .from('lab_results')
        .select('*')
        .eq('patient_id', patient.id)
        .eq('lab_date', labDate)
        .maybeSingle();

      if (data) setLab(data as LabRow);
      else {
        // prepare empty row in state (not saved yet)
        setLab({ patient_id: patient.id, lab_date: labDate });
      }
    })();
  }, [patient, labDate]);

  const cagLabel = useMemo(
    () => classifyForProc(labDate, patient?.procedure_datetime_cag ?? null, 'CAG'),
    [labDate, patient?.procedure_datetime_cag]
  );
  const ptcaLabel = useMemo(
    () => classifyForProc(labDate, patient?.procedure_datetime_ptca ?? null, 'PTCA'),
    [labDate, patient?.procedure_datetime_ptca]
  );

  // Handle inputs (all numeric except urine text fields)
  const setField = (field: keyof LabRow, value: string) => {
    setLab((prev) => {
      if (!prev) return prev;
      const isNumeric =
        !['urine_pus_cells', 'urine_rbc', 'urine_protein', 'urine_sugar'].includes(field as string);
      return {
        ...prev,
        [field]:
          value === ''
            ? (isNumeric ? null : '')
            : (isNumeric ? Number(value) : value),
      };
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient || !lab) return;
    setSaving(true);
    setMessage('');

    let error;
    if (lab.id) {
      ({ error } = await supabase.from('lab_results').update(lab).eq('id', lab.id));
    } else {
      const res = await supabase
        .from('lab_results')
        .insert([{ ...lab, patient_id: patient.id, lab_date: labDate }])
        .select()
        .single();
      error = res.error;
      if (!res.error) setLab(res.data as LabRow);
    }

    setSaving(false);
    setMessage(error ? '❌ Failed to save.' : '✅ Saved.');
  };

  return (
    <div className="min-h-screen bg-gray-100 p-5 flex flex-col items-center">
      <h1 className="text-3xl font-extrabold mb-4 text-gray-900">🧪 Laboratory Reports</h1>

      {patient && (
        <div className="bg-blue-50 border border-blue-200 rounded w-full max-w-3xl p-3 mb-4 text-gray-900">
          <strong>Patient:</strong> {patient.patient_name} — <strong>IPD:</strong> {patient.ipd_number} —{' '}
          <strong>Sex:</strong> {patient.sex || '—'} {patient.age ? `— Age: ${patient.age}` : ''}
        </div>
      )}

      <form onSubmit={save} className="bg-white w-full max-w-3xl rounded shadow p-4 space-y-6">
        {/* Date + timing chips */}
        <div className="border rounded p-3">
          <label className="block font-semibold mb-1 text-gray-900">Lab Date</label>
          <input
            type="date"
            className="p-2 border rounded w-full"
            value={labDate}
            onChange={(e) => setLabDate(e.target.value)}
          />
          <div className="mt-3 flex gap-2 flex-wrap">
            {cagLabel && <span className={`px-2 py-1 rounded text-sm border ${chipClass(cagLabel)}`}>{cagLabel}</span>}
            {ptcaLabel && (
              <span className={`px-2 py-1 rounded text-sm border ${chipClass(ptcaLabel)}`}>{ptcaLabel}</span>
            )}
            {!cagLabel && !ptcaLabel && (
              <span className="px-2 py-1 rounded text-sm border bg-gray-100 text-gray-700 border-gray-300">
                No CAG/PTCA timing classification for this date.
              </span>
            )}
          </div>
        </div>

        {/* Sections */}
        {sections.map((sec) => (
          <div key={sec.title} className="border rounded p-3">
            <h2 className="text-2xl font-bold mb-2 text-gray-900">
              {sec.title === 'Hematology' && '🩸 '}
              {sec.title === 'Renal Function' && '🧪 '}
              {sec.title === 'Electrolytes' && '💧 '}
              {sec.title === 'Liver Function' && '🫁 '}
              {sec.title === 'Coagulation' && '🧬 '}
              {sec.title === 'ABG' && '🌡 '}
              {sec.title === 'Markers' && '❤️ '}
              {sec.title}
            </h2>

            {sec.fields.map((f) => {
              const v = (lab?.[f] as number | null | undefined) ?? null;
              const unit = unitOf(f);
              const abnormal = isAbnormal(f, v, patient?.sex || '');
              return (
                <div key={String(f)} className="mb-3">
                  <label className="block font-semibold text-gray-900 mb-1">
                    {labelFromField(f)} {unit ? <span className="font-normal text-gray-700">({unit})</span> : null}
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={v ?? ''}
                    onChange={(e) => setField(f, e.target.value)}
                    className={`w-full p-2 rounded border ${abnormal ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                  />
                  <div className="text-sm font-medium text-gray-800">
                    Normal: {normalText(f)}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Urine */}
        <div className="border rounded p-3">
          <h2 className="text-2xl font-bold mb-2 text-gray-900">🧫 Urine Analysis</h2>

          {urineFields.map((f) => {
            const isNumeric = f === 'urine_specific_gravity' || f === 'urine_ph';
            const v = lab?.[f] as any;
            const abnormal = isNumeric ? isAbnormal(f, v, patient?.sex || '') : false;
            return (
              <div key={String(f)} className="mb-3">
                <label className="block font-semibold text-gray-900 mb-1">
                  {labelFromField(f)}{' '}
                  {ranges[f] && (ranges[f] as any).unit ? (
                    <span className="font-normal text-gray-700">({(ranges[f] as any).unit})</span>
                  ) : null}
                </label>
                <input
                  type={isNumeric ? 'number' : 'text'}
                  inputMode={isNumeric ? 'decimal' : 'text'}
                  step={isNumeric ? 'any' : undefined}
                  value={v ?? ''}
                  onChange={(e) => setField(f, e.target.value)}
                  className={`w-full p-2 rounded border ${abnormal ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                />
                {ranges[f] ? (
                  <div className="text-sm font-medium text-gray-800">Normal: {normalText(f)}</div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Derived */}
        <div className="border rounded p-3">
          <h2 className="text-2xl font-bold mb-2 text-gray-900">🧮 Derived (Auto)</h2>

          {/* Hematocrit from Hb */}
          <div className="mb-3">
            <label className="block font-semibold text-gray-900 mb-1">Hematocrit (Hb × 3) — %</label>
            <input
              readOnly
              value={lab?.hb ? (lab.hb * 3).toFixed(1) : ''}
              className="w-full p-2 rounded border border-gray-300 bg-gray-50"
            />
            <div className="text-sm font-medium text-gray-800">Normal: 40–50 %</div>
          </div>

          {/* eGFR */}
          <div className="mb-3">
            <label className="block font-semibold text-gray-900 mb-1">eGFR (CKD-EPI) — mL/min/1.73m²</label>
            <input
              readOnly
              value={
                lab?.scr && patient ? (calculateEGFR(lab.scr!, patient.age ?? null, patient.sex!) ?? '').toFixed(2) : ''
              }
              className="w-full p-2 rounded border border-gray-300 bg-gray-50"
            />
            <div className="text-sm font-medium text-gray-800">Normal: ≥ 90 mL/min/1.73m²</div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving || !patient || !lab}
          className="bg-blue-600 text-white px-4 py-2 rounded w-full hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : lab?.id ? 'Update Labs' : 'Save Labs'}
        </button>
        {message && <p className="text-center text-sm mt-2 text-gray-900">{message}</p>}
      </form>
    </div>
  );
}

// Pretty labels
function labelFromField(f: keyof LabRow) {
  const map: Record<string, string> = {
    hb: 'Hemoglobin',
    wbc: 'WBC',
    platelet: 'Platelets',
    scr: 'Serum Creatinine',
    urea: 'Urea',
    uric_acid: 'Uric Acid',
    na: 'Sodium (Na⁺)',
    k: 'Potassium (K⁺)',
    cl: 'Chloride (Cl⁻)',
    ca: 'Calcium (Ca²⁺)',
    phosphate: 'Phosphate',
    tbil: 'Total Bilirubin',
    dbil: 'Direct Bilirubin',
    alp: 'ALP',
    sgpt: 'ALT/SGPT',
    tprotein: 'Total Protein',
    albumin: 'Albumin',
    pt: 'PT',
    inr: 'INR',
    aptt: 'aPTT',
    fibrinogen: 'Fibrinogen',
    ddimer: 'D-dimer',
    abg_ph: 'pH',
    pco2: 'pCO₂',
    po2: 'pO₂',
    hco3: 'HCO₃⁻',
    lactate: 'Lactate',
    crp: 'CRP',
    troponin: 'Troponin',
    cpk: 'CPK',
    cpkmb: 'CPK-MB',
    rbs: 'RBS',
    urine_pus_cells: 'Pus Cells',
    urine_rbc: 'RBC',
    urine_protein: 'Protein',
    urine_sugar: 'Sugar',
    urine_specific_gravity: 'Specific Gravity',
    urine_ph: 'Urine pH',
  };
  return map[f as string] ?? String(f);
}
