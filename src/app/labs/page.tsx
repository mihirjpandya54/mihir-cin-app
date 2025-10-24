"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type LabRow = {
  id?: string;
  patient_id: string;
  lab_date: string;
  hb: number | null;
  wbc: number | null;
  platelet: number | null;
  scr: number | null;
  urea: number | null;
  uric_acid: number | null;
  na: number | null;
  k: number | null;
  cl: number | null;
  ca: number | null;
  phosphate: number | null;
  tbil: number | null;
  dbil: number | null;
  alp: number | null;
  sgpt: number | null;
  tprotein: number | null;
  albumin: number | null;
  pt: number | null;
  inr: number | null;
  aptt: number | null;
  fibrinogen: number | null;
  ddimer: number | null;
  abg_ph: number | null;
  pco2: number | null;
  po2: number | null;
  hco3: number | null;
  lactate: number | null;
  crp: number | null;
  troponin: number | null;
  cpk: number | null;
  cpkmb: number | null;
  rbs: number | null;
  urine_pus_cells: string | null;
  urine_rbc: string | null;
  urine_protein: string | null;
  urine_sugar: string | null;
  urine_specific_gravity: number | null;
  urine_ph: number | null;
};

type NormalRange = {
  male?: [number, number];
  female?: [number, number];
  both?: [number, number];
};

export default function LabsPage() {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientInfo, setPatientInfo] = useState<{ name: string; ipd: string; sex?: string } | null>(null);
  const [labDate, setLabDate] = useState<string>("");
  const [lab, setLab] = useState<LabRow>({
    patient_id: "",
    lab_date: "",
    hb: null, wbc: null, platelet: null,
    scr: null, urea: null, uric_acid: null,
    na: null, k: null, cl: null, ca: null, phosphate: null,
    tbil: null, dbil: null, alp: null, sgpt: null, tprotein: null, albumin: null,
    pt: null, inr: null, aptt: null, fibrinogen: null, ddimer: null,
    abg_ph: null, pco2: null, po2: null, hco3: null, lactate: null,
    crp: null, troponin: null, cpk: null, cpkmb: null, rbs: null,
    urine_pus_cells: null, urine_rbc: null, urine_protein: null, urine_sugar: null,
    urine_specific_gravity: null, urine_ph: null
  });
  const [cagTiming, setCagTiming] = useState<string | null>(null);
  const [ptcaTiming, setPtcaTiming] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // ✅ Normal Ranges
  const ranges: Record<keyof LabRow, NormalRange> = {
    hb: { male: [13, 17], female: [12, 15] },
    wbc: { both: [4, 11] },
    platelet: { both: [150, 400] },
    scr: { male: [0.7, 1.3], female: [0.6, 1.1] },
    urea: { both: [15, 45] },
    uric_acid: { male: [3.4, 7.0], female: [2.4, 6.0] },
    na: { both: [135, 145] },
    k: { both: [3.5, 5.0] },
    cl: { both: [98, 106] },
    ca: { both: [8.5, 10.5] },
    phosphate: { both: [2.5, 4.5] },
    tbil: { both: [0.2, 1.2] },
    dbil: { both: [0, 0.3] },
    alp: { both: [44, 147] },
    sgpt: { both: [0, 40] },
    tprotein: { both: [6.0, 8.0] },
    albumin: { both: [3.5, 5.0] },
    pt: { both: [11, 13.5] },
    inr: { both: [0.8, 1.2] },
    aptt: { both: [25, 35] },
    fibrinogen: { both: [200, 400] },
    ddimer: { both: [0, 500] },
    abg_ph: { both: [7.35, 7.45] },
    pco2: { both: [35, 45] },
    po2: { both: [75, 100] },
    hco3: { both: [22, 26] },
    lactate: { both: [0.5, 2.0] },
    crp: { both: [0, 6] },
    troponin: { both: [0, 0.04] },
    cpk: { male: [55, 170], female: [30, 135] },
    cpkmb: { both: [0, 25] },
    rbs: { both: [70, 140] },
    urine_specific_gravity: { both: [1.005, 1.030] },
    urine_ph: { both: [4.5, 8.0] },

    // text fields: no range needed
    id: {}, patient_id: {}, lab_date: {},
    urine_pus_cells: {}, urine_rbc: {}, urine_protein: {}, urine_sugar: {}
  };

  // 🧭 Load active patient and gender (for normal ranges)
  useEffect(() => {
    (async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const { data: active } = await supabase
        .from("active_patient")
        .select("patient_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (active?.patient_id) {
        setPatientId(active.patient_id);
        setLab((l) => ({ ...l, patient_id: active.patient_id }));

        const { data: p } = await supabase
          .from("patient_details")
          .select("patient_name, ipd_number, sex")
          .eq("id", active.patient_id)
          .single();

        if (p) setPatientInfo({ name: p.patient_name, ipd: p.ipd_number, sex: p.sex });
      } else {
        setMessage("⚠️ No active patient selected. Go to Patient Page first.");
      }
    })();
  }, []);

  // 🧪 Fetch labs + timing
  useEffect(() => {
    if (!patientId || !labDate) return;
    (async () => {
      const { data } = await supabase
        .from("lab_results")
        .select("*")
        .eq("patient_id", patientId)
        .eq("lab_date", labDate)
        .maybeSingle();

      if (data) setLab(data);
      else setLab((prev) => ({ ...prev, lab_date: labDate }));

      const { data: classified } = await supabase
        .from("lab_results_classified")
        .select("cag_timing, ptca_timing")
        .eq("patient_id", patientId)
        .eq("lab_date", labDate)
        .maybeSingle();

      setCagTiming(classified?.cag_timing || null);
      setPtcaTiming(classified?.ptca_timing || null);
    })();
  }, [patientId, labDate]);

  // 🧮 Function to check abnormal
  const isAbnormal = (field: keyof LabRow, value: number | null) => {
    if (value === null) return false;
    const r = ranges[field];
    if (!r) return false;

    if (r.both) return value < r.both[0] || value > r.both[1];

    if (patientInfo?.sex === "M" && r.male) return value < r.male[0] || value > r.male[1];
    if (patientInfo?.sex === "F" && r.female) return value < r.female[0] || value > r.female[1];

    return false;
  };
    // 🧰 helpers
  const setNum = (field: keyof LabRow) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLab((prev) => ({ ...prev, [field]: v === "" ? null : Number(v) }));
  };
  const setTxt = (field: keyof LabRow) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLab((prev) => ({ ...prev, [field]: v }));
  };

  const normalText = (field: keyof LabRow, unit: string) => {
    const r = ranges[field];
    if (!r) return "";
    if (r.both) return `Normal: ${r.both[0]}–${r.both[1]} ${unit}`;
    if (r.male || r.female) {
      const maleTxt = r.male ? `${r.male[0]}–${r.male[1]} ${unit}` : "—";
      const femTxt = r.female ? `${r.female[0]}–${r.female[1]} ${unit}` : "—";
      return `Normal (M): ${maleTxt} | (F): ${femTxt}`;
    }
    return "";
  };

  const NumInput = ({
    field,
    label,
    unit,
    step = "0.1",
  }: {
    field: keyof LabRow;
    label: string;
    unit: string;
    step?: string;
  }) => {
    const val = lab[field] as number | null;
    const abnormal = isAbnormal(field, val);
    return (
      <div>
        <label className="block font-semibold text-gray-800 mb-1">{label} <span className="text-gray-600 text-sm">({unit})</span></label>
        <input
          type="number"
          step={step}
          value={val ?? ""}
          onChange={setNum(field)}
          className={`border rounded p-2 w-full text-gray-800 ${abnormal ? "border-red-500 bg-red-50" : "border-gray-400"}`}
        />
        <div className="text-gray-800 text-xs mt-1">{normalText(field, unit)}</div>
      </div>
    );
  };

  const TxtInput = ({
    field,
    label,
  }: {
    field: keyof LabRow;
    label: string;
  }) => {
    const val = (lab[field] as string | null) ?? "";
    return (
      <div>
        <label className="block font-semibold text-gray-800 mb-1">{label}</label>
        <input
          type="text"
          value={val}
          onChange={setTxt(field)}
          className="border border-gray-400 rounded p-2 w-full text-gray-800"
        />
      </div>
    );
  };

  // 💾 Save or update
  const saveLabs = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    if (!patientId) {
      setMessage("❌ No active patient selected.");
      return;
    }
    if (!labDate) {
      setMessage("❌ Please select Lab Date.");
      return;
    }

    setSaving(true);
    const payload: LabRow = { ...lab, patient_id: patientId, lab_date: labDate };

    if (lab.id) {
      const { error } = await supabase.from("lab_results").update(payload).eq("id", lab.id);
      setSaving(false);
      setMessage(error ? `❌ Update failed: ${error.message}` : "✅ Updated successfully.");
    } else {
      const { data, error } = await supabase
        .from("lab_results")
        .insert([payload])
        .select("id")
        .single();
      setSaving(false);
      if (error) setMessage(`❌ Save failed: ${error.message}`);
      else {
        setLab((prev) => ({ ...prev, id: data?.id }));
        setMessage("✅ Saved successfully.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">🧪 Laboratory Reports</h1>

      {/* Patient banner */}
      {patientInfo && (
        <div className="mb-4 text-lg font-semibold text-gray-800 bg-blue-50 border border-blue-300 rounded p-3 w-full max-w-5xl text-center">
          Patient: <span className="font-bold">{patientInfo.name}</span> — IPD:{" "}
          <span className="font-mono">{patientInfo.ipd}</span> — Sex:{" "}
          <span className="font-bold">{patientInfo.sex || "—"}</span>
        </div>
      )}

      {!patientId && (
        <div className="mb-3 text-center font-semibold text-red-600">
          ⚠️ No active patient selected. Please go to Patient Page first.
        </div>
      )}

      {/* Date + timing */}
      <div className="w-full max-w-5xl bg-white p-4 rounded-lg shadow mb-4">
        <label className="block font-semibold text-gray-800 mb-1">Lab Date</label>
        <input
          type="date"
          value={labDate}
          onChange={(e) => setLabDate(e.target.value)}
          className="border border-gray-400 rounded p-2 text-gray-800"
        />

        {/* Timing badges */}
        {(cagTiming || ptcaTiming) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {cagTiming && (
              <span className="px-2 py-1 rounded text-sm bg-purple-100 text-purple-800 border border-purple-300">
                {cagTiming}
              </span>
            )}
            {ptcaTiming && (
              <span className="px-2 py-1 rounded text-sm bg-amber-100 text-amber-800 border border-amber-300">
                {ptcaTiming}
              </span>
            )}
          </div>
        )}
        {!cagTiming && !ptcaTiming && labDate && (
          <div className="mt-2 text-gray-700 text-sm">
            No CAG/PTCA timing classification for this date.
          </div>
        )}
      </div>

      {/* FORM */}
      {patientId && (
        <form onSubmit={saveLabs} className="w-full max-w-5xl space-y-6">
          {/* Hematology */}
          <section className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3 text-gray-800">🩸 Hematology</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <NumInput field="hb" label="Hemoglobin" unit="g/dL" step="0.1" />
              <NumInput field="wbc" label="WBC" unit="×10³/µL" step="0.1" />
              <NumInput field="platelet" label="Platelets" unit="×10³/µL" step="1" />
            </div>
          </section>

          {/* Renal */}
          <section className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3 text-gray-800">🧪 Renal Function</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <NumInput field="scr" label="Serum Creatinine" unit="mg/dL" step="0.01" />
              <NumInput field="urea" label="Urea" unit="mg/dL" step="1" />
              <NumInput field="uric_acid" label="Uric Acid" unit="mg/dL" step="0.1" />
            </div>
          </section>

          {/* Electrolytes */}
          <section className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3 text-gray-800">💧 Electrolytes</h2>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              <NumInput field="na" label="Sodium (Na⁺)" unit="mmol/L" step="1" />
              <NumInput field="k" label="Potassium (K⁺)" unit="mmol/L" step="0.1" />
              <NumInput field="cl" label="Chloride (Cl⁻)" unit="mmol/L" step="1" />
              <NumInput field="ca" label="Calcium (Ca²⁺)" unit="mg/dL" step="0.1" />
              <NumInput field="phosphate" label="Phosphate (PO₄³⁻)" unit="mg/dL" step="0.1" />
            </div>
          </section>

          {/* Liver */}
          <section className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3 text-gray-800">🫁 Liver Function</h2>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
              <NumInput field="tbil" label="Total Bilirubin" unit="mg/dL" step="0.1" />
              <NumInput field="dbil" label="Direct Bilirubin" unit="mg/dL" step="0.1" />
              <NumInput field="alp" label="ALP" unit="U/L" step="1" />
              <NumInput field="sgpt" label="ALT (SGPT)" unit="U/L" step="1" />
              <NumInput field="tprotein" label="Total Protein" unit="g/dL" step="0.1" />
              <NumInput field="albumin" label="Albumin" unit="g/dL" step="0.1" />
            </div>
          </section>

          {/* Coagulation */}
          <section className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3 text-gray-800">🧬 Coagulation</h2>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              <NumInput field="pt" label="PT" unit="sec" step="0.1" />
              <NumInput field="inr" label="INR" unit="ratio" step="0.01" />
              <NumInput field="aptt" label="aPTT" unit="sec" step="0.1" />
              <NumInput field="fibrinogen" label="Fibrinogen" unit="mg/dL" step="1" />
              <NumInput field="ddimer" label="D-dimer" unit="ng/mL FEU" step="1" />
            </div>
          </section>
                    {/* ABG */}
          <section className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3 text-gray-800">🌡 ABG</h2>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              <NumInput field="abg_ph" label="pH" unit="" step="0.01" />
              <NumInput field="pco2" label="pCO₂" unit="mmHg" step="1" />
              <NumInput field="po2" label="pO₂" unit="mmHg" step="1" />
              <NumInput field="hco3" label="HCO₃⁻" unit="mEq/L" step="0.1" />
              <NumInput field="lactate" label="Lactate" unit="mmol/L" step="0.1" />
            </div>
          </section>

          {/* Cardiac / Inflammatory */}
          <section className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3 text-gray-800">❤️ Cardiac / Inflammatory</h2>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              <NumInput field="crp" label="CRP" unit="mg/L" step="0.1" />
              <NumInput field="troponin" label="Troponin" unit="ng/mL" step="0.01" />
              <NumInput field="cpk" label="CPK (CK)" unit="U/L" step="1" />
              <NumInput field="cpkmb" label="CK-MB" unit="U/L" step="1" />
              <NumInput field="rbs" label="RBS" unit="mg/dL" step="1" />
            </div>
          </section>

          {/* Urine Analysis */}
          <section className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3 text-gray-800">🧫 Urine Analysis</h2>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <TxtInput field="urine_pus_cells" label="Pus Cells (/HPF)" />
              <TxtInput field="urine_rbc" label="RBC (/HPF)" />
              <TxtInput field="urine_protein" label="Protein (trace/+/++/...)" />
              <TxtInput field="urine_sugar" label="Sugar (trace/+/++/...)" />
              <NumInput field="urine_specific_gravity" label="Specific Gravity" unit="" step="0.001" />
              <NumInput field="urine_ph" label="Urine pH" unit="" step="0.1" />
            </div>
            <div className="text-gray-800 text-xs mt-2">
              Normal SG: 1.005–1.030 | Normal pH: 4.5–8.0
            </div>
          </section>

          <div className="bg-white p-4 rounded-lg shadow">
            <button
              type="submit"
              disabled={saving || !labDate}
              className="bg-blue-600 text-white px-4 py-2 rounded w-full hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : lab.id ? "Update Labs" : "Save Labs"}
            </button>
            {message && <p className="text-center text-sm mt-2 text-gray-800">{message}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
