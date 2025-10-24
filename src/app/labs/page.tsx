"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---------- NORMAL RANGES ----------
const NORMALS = {
  hb: { M: [13, 17], F: [11, 15] },
  wbc: [4, 11],
  platelet: [150, 450],
  scr: { M: [0.7, 1.3], F: [0.5, 1.1] },
  urea: [15, 45],
  uric_acid: { M: [3.5, 7.2], F: [2.6, 6.0] },
  na: [135, 145],
  k: [3.5, 5.0],
  cl: [98, 107],
  ca: [8.5, 10.5],
  phosphate: [2.5, 4.5],
  tbil: [0.3, 1.2],
  dbil: [0.0, 0.3],
  alp: [44, 147],
  sgpt: [7, 56],
  tprotein: [6, 8.3],
  albumin: [3.5, 5],
  pt: [11, 13.5],
  inr: [0.8, 1.2],
  aptt: [25, 35],
  fibrinogen: [200, 400],
  ddimer: [0, 0.5],
  abg_ph: [7.35, 7.45],
  pco2: [35, 45],
  po2: [80, 100],
  hco3: [22, 26],
  lactate: [0.5, 2.2],
  crp: [0, 5],
  troponin: null,
  cpk: [30, 200],
  cpkmb: [0, 6],
  rbs: [70, 140],
  urine_pus_cells: null,
  urine_rbc: null,
  urine_protein: null,
  urine_sugar: null,
  urine_specific_gravity: [1.005, 1.03],
  urine_ph: [4.5, 8],
  hct: { M: [40, 50], F: [36, 44] },
  egfr: [90, 200]
};

type PatientInfo = {
  id: string;
  patient_name: string;
  ipd_number: string;
  sex: "Male" | "Female";
  age: number | null;
};

type LabRow = {
  [key: string]: any;
  id?: string;
  patient_id: string;
  lab_date: string;
};

type ClassifiedRow = LabRow & {
  cag_timing: string | null;
  ptca_timing: string | null;
};

export default function LabsPage() {
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [labDate, setLabDate] = useState<string>("");
  const [form, setForm] = useState<LabRow | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [history, setHistory] = useState<ClassifiedRow[]>([]);

  // 1️⃣ Load active patient
  useEffect(() => {
    (async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const { data: ap } = await supabase
        .from("active_patient")
        .select("patient_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!ap?.patient_id) {
        setMessage("⚠️ No active patient selected.");
        return;
      }

      const { data: p } = await supabase
        .from("patient_details")
        .select("id, patient_name, ipd_number, sex, age")
        .eq("id", ap.patient_id)
        .single();

      if (p) {
        setPatient(p as PatientInfo);
        await loadHistory(ap.patient_id);
      }
    })();
  }, []);

  const loadHistory = async (pid: string) => {
    const { data } = await supabase
      .from("lab_results_classified")
      .select("*")
      .eq("patient_id", pid)
      .order("lab_date", { ascending: false });
    if (data) setHistory(data as ClassifiedRow[]);
  };

  // 2️⃣ Load lab data for selected date
  useEffect(() => {
    if (!patient?.id || !labDate) return;
    (async () => {
      const { data } = await supabase
        .from("lab_results")
        .select("*")
        .eq("patient_id", patient.id)
        .eq("lab_date", labDate)
        .maybeSingle();

      if (data) {
        setExistingId(data.id);
        setForm(data);
      } else {
        setExistingId(null);
        setForm({ patient_id: patient.id, lab_date: labDate });
      }
    })();
  }, [patient?.id, labDate]);

  const sexKey = patient?.sex === "Female" ? "F" : "M";

  const handleNum = (name: string) => (e: any) => {
    const v = e.target.value.trim();
    setForm((f) => (f ? { ...f, [name]: v === "" ? null : Number(v) } : f));
  };
  const handleText = (name: string) => (e: any) => {
    const v = e.target.value;
    setForm((f) => (f ? { ...f, [name]: v } : f));
  };

  // 3️⃣ Derived Hct & eGFR
  const derived = useMemo(() => {
    const hb = form?.hb ?? null;
    const scr = form?.scr ?? null;
    const age = patient?.age ?? null;
    const sex = patient?.sex ?? "Male";
    const hct = hb != null ? Math.round(hb * 3 * 10) / 10 : null;

    let egfr: number | null = null;
    if (scr != null && age != null) {
      const k = sex === "Female" ? 0.7 : 0.9;
      const a = sex === "Female" ? -0.329 : -0.411;
      const ratio = scr / k;
      const egfrVal =
        141 *
        Math.pow(Math.min(ratio, 1), a) *
        Math.pow(Math.max(ratio, 1), -1.209) *
        Math.pow(0.993, age) *
        (sex === "Female" ? 1.018 : 1);
      egfr = Math.round(egfrVal * 100) / 100;
    }
    return { hct, egfr };
  }, [form?.hb, form?.scr, patient?.age, patient?.sex]);

  // 4️⃣ Timing classification
  const [currentTiming, setCurrentTiming] = useState<{ cag: string | null; ptca: string | null }>({
    cag: null,
    ptca: null
  });

  useEffect(() => {
    (async () => {
      if (!patient?.id || !labDate) return;
      const { data } = await supabase
        .from("lab_results_classified")
        .select("cag_timing, ptca_timing")
        .eq("patient_id", patient.id)
        .eq("lab_date", labDate)
        .maybeSingle();
      if (data) setCurrentTiming({ cag: data.cag_timing, ptca: data.ptca_timing });
    })();
  }, [patient?.id, labDate]);

  // 5️⃣ Save Labs
  const saveLabs = async (e: any) => {
    e.preventDefault();
    if (!patient?.id || !form) return;
    setSaving(true);
    setMessage("");

    let error;
    if (existingId) {
      ({ error } = await supabase.from("lab_results").update(form).eq("id", existingId));
    } else {
      ({ error } = await supabase.from("lab_results").insert([form]));
    }

    setSaving(false);
    if (error) setMessage("❌ Failed to save.");
    else {
      setMessage("✅ Saved successfully.");
      await loadHistory(patient.id);
    }
  };

  const removeRow = async (id: string) => {
    await supabase.from("lab_results").delete().eq("id", id);
    if (patient?.id) await loadHistory(patient.id);
    if (existingId === id) {
      setExistingId(null);
      setForm((f) => (f ? { ...f, id: undefined } : f));
    }
  };

  // 6️⃣ Field component with abnormal highlight
  const Field = ({
    label,
    name,
    unit = "",
    type = "number"
  }: {
    label: string;
    name: string;
    unit?: string;
    type?: "number" | "text";
  }) => {
    const normalVal = NORMALS[name as keyof typeof NORMALS];
    let normalRange = "";

    if (Array.isArray(normalVal)) normalRange = `${normalVal[0]}–${normalVal[1]}`;
    else if (typeof normalVal === "object" && normalVal !== null) {
      const val = normalVal as { M: number[]; F: number[] };
      normalRange = `${val[sexKey][0]}–${val[sexKey][1]}`;
    }

    const val = form?.[name] ?? "";
    const outOfRange = (() => {
      if (!val || !normalVal) return false;
      const numVal = Number(val);
      if (Array.isArray(normalVal))
        return numVal < normalVal[0] || numVal > normalVal[1];
      if (typeof normalVal === "object" && normalVal !== null) {
        const range = normalVal[sexKey];
        return numVal < range[0] || numVal > range[1];
      }
      return false;
    })();

    return (
      <div>
        <label className="block font-semibold text-gray-800 mb-1">
          {label}{" "}
          {unit && <span className="font-normal text-gray-700">({unit})</span>}{" "}
          {normalRange && (
            <span className="ml-2 text-gray-900 text-sm">Normal: {normalRange}</span>
          )}
        </label>
        <input
          type={type}
          value={val ?? ""}
          onChange={type === "number" ? handleNum(name) : handleText(name)}
          className={`border rounded p-2 w-full text-gray-800 ${
            outOfRange ? "bg-red-100 border-red-500" : "border-gray-400"
          }`}
        />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">🧪 Lab Reports</h1>

      {patient ? (
        <div className="mb-4 text-lg font-semibold text-gray-800 bg-blue-50 border border-blue-300 rounded p-3 w-full max-w-5xl text-center">
          👤 {patient.patient_name} — IPD: {patient.ipd_number} — Sex: {patient.sex}
          {patient.age && <> — Age: {patient.age}</>}
        </div>
      ) : (
        <div className="text-red-600 font-semibold mb-4">
          ⚠️ No active patient selected.
        </div>
      )}

      {/* Date Picker */}
      <div className="bg-white p-4 rounded-lg shadow-md w-full max-w-5xl mb-6">
        <label className="block font-semibold text-gray-800 mb-2">Select Lab Date</label>
        <input
          type="date"
          value={labDate}
          onChange={(e) => setLabDate(e.target.value)}
          className="border border-gray-400 rounded p-2"
        />
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span className="font-semibold">CAG timing:</span>{" "}
            <span className="font-bold">{currentTiming.cag || "—"}</span>
          </div>
          <div>
            <span className="font-semibold">PTCA timing:</span>{" "}
            <span className="font-bold">{currentTiming.ptca || "—"}</span>
          </div>
        </div>
      </div>

      {/* LAB FORM */}
      {patient && form && (
        <form
          onSubmit={saveLabs}
          className="bg-white p-6 rounded-lg shadow-lg w-full max-w-5xl space-y-6"
        >
          {/* 🩸 Hematology */}
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-2">🩸 Hematology</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Hemoglobin" name="hb" unit="g/dL" />
              <Field label="WBC" name="wbc" />
              <Field label="Platelets" name="platelet" />
            </div>
          </section>

          {/* 🧪 Renal */}
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-2">🧪 Renal Function</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Serum Creatinine" name="scr" unit="mg/dL" />
              <Field label="Urea" name="urea" unit="mg/dL" />
              <Field label="Uric Acid" name="uric_acid" unit="mg/dL" />
            </div>
          </section>

          {/* 💧 Electrolytes */}
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-2">💧 Electrolytes</h2>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              <Field label="Na⁺" name="na" />
              <Field label="K⁺" name="k" />
              <Field label="Cl⁻" name="cl" />
              <Field label="Ca²⁺" name="ca" />
              <Field label="Phosphate" name="phosphate" />
            </div>
          </section>

          {/* 🫁 LFT */}
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-2">🫁 Liver Function</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Total Bilirubin" name="tbil" />
              <Field label="Direct Bilirubin" name="dbil" />
              <Field label="ALP" name="alp" />
              <Field label="ALT/SGPT" name="sgpt" />
              <Field label="Total Protein" name="tprotein" />
              <Field label="Albumin" name="albumin" />
            </div>
          </section>

          {/* 🧬 Coagulation */}
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-2">🧬 Coagulation</h2>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              <Field label="PT" name="pt" />
              <Field label="INR" name="inr" />
              <Field label="aPTT" name="aptt" />
              <Field label="Fibrinogen" name="fibrinogen" />
              <Field label="D-dimer" name="ddimer" />
            </div>
          </section>

          {/* 🌡 ABG */}
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-2">🌡 ABG</h2>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              <Field label="pH" name="abg_ph" />
              <Field label="pCO₂" name="pco2" />
              <Field label="pO₂" name="po2" />
              <Field label="HCO₃⁻" name="hco3" />
              <Field label="Lactate" name="lactate" />
            </div>
          </section>

          {/* ❤️ Markers */}
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-2">❤️ Markers</h2>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              <Field label="CRP" name="crp" />
              <Field label="Troponin" name="troponin" />
              <Field label="CPK" name="cpk" />
              <Field label="CPK-MB" name="cpkmb" />
              <Field label="RBS" name="rbs" />
            </div>
          </section>
                    {/* 🧫 Urine */}
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-2">🧫 Urine Analysis</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Pus Cells" name="urine_pus_cells" type="text" />
              <Field label="RBC" name="urine_rbc" type="text" />
              <Field label="Protein" name="urine_protein" type="text" />
              <Field label="Sugar" name="urine_sugar" type="text" />
              <Field label="Specific Gravity" name="urine_specific_gravity" />
              <Field label="Urine pH" name="urine_ph" />
            </div>
          </section>

          {/* 🧮 Derived values */}
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-2">🧮 Derived (Auto)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 rounded border bg-gray-50">
                <div className="font-semibold text-gray-800">
                  Hematocrit (Hb × 3) — Normal: {NORMALS.hct[sexKey].join("–")} %
                </div>
                <div className="mt-1 text-gray-800">
                  {derived.hct != null ? `${derived.hct} %` : "—"}
                </div>
              </div>
              <div className="p-3 rounded border bg-gray-50">
                <div className="font-semibold text-gray-800">
                  eGFR (CKD-EPI) — Normal: ≥ {NORMALS.egfr[0]} mL/min/1.73m²
                </div>
                <div className="mt-1 text-gray-800">
                  {derived.egfr != null ? `${derived.egfr}` : "—"}
                </div>
              </div>
            </div>
          </section>

          {/* 💾 Save Button */}
          <button
            type="submit"
            disabled={saving || !labDate}
            className="bg-blue-600 text-white px-4 py-2 rounded w-full hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : existingId ? "Update Labs" : "Save Labs"}
          </button>

          {message && <p className="text-center text-sm mt-2 text-gray-800">{message}</p>}
        </form>
      )}

      {/* 📜 Lab History Table */}
      {patient && (
        <div className="bg-white p-4 rounded-lg shadow-md w-full max-w-6xl mt-8 overflow-x-auto">
          <h2 className="text-xl font-bold text-gray-800 mb-3">📜 Lab History</h2>
          {history.length === 0 ? (
            <div className="text-gray-700">No lab entries yet.</div>
          ) : (
            <table className="min-w-full border">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-800">
                  <th className="p-2 border">Date</th>
                  <th className="p-2 border">CAG timing</th>
                  <th className="p-2 border">PTCA timing</th>
                  <th className="p-2 border">Hb</th>
                  <th className="p-2 border">Hct</th>
                  <th className="p-2 border">Scr</th>
                  <th className="p-2 border">eGFR</th>
                  <th className="p-2 border">Na</th>
                  <th className="p-2 border">K</th>
                  <th className="p-2 border">Urea</th>
                  <th className="p-2 border">CRP</th>
                  <th className="p-2 border">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => {
                  const hct = r.hb != null ? Math.round(r.hb * 3 * 10) / 10 : null;
                  const sex = patient.sex;
                  const age = patient.age ?? null;
                  let egfr: number | null = null;
                  if (r.scr != null && age != null) {
                    const k = sex === "Female" ? 0.7 : 0.9;
                    const a = sex === "Female" ? -0.329 : -0.411;
                    const ratio = r.scr / k;
                    const val =
                      141 *
                      Math.pow(Math.min(ratio, 1), a) *
                      Math.pow(Math.max(ratio, 1), -1.209) *
                      Math.pow(0.993, age) *
                      (sex === "Female" ? 1.018 : 1);
                    egfr = Math.round(val * 100) / 100;
                  }
                  return (
                    <tr key={r.id} className="border-b">
                      <td className="p-2 border">{r.lab_date}</td>
                      <td className="p-2 border">{r.cag_timing || "—"}</td>
                      <td className="p-2 border">{r.ptca_timing || "—"}</td>
                      <td className="p-2 border">{r.hb ?? "—"}</td>
                      <td className="p-2 border">{hct ?? "—"}</td>
                      <td className="p-2 border">{r.scr ?? "—"}</td>
                      <td className="p-2 border">{egfr ?? "—"}</td>
                      <td className="p-2 border">{r.na ?? "—"}</td>
                      <td className="p-2 border">{r.k ?? "—"}</td>
                      <td className="p-2 border">{r.urea ?? "—"}</td>
                      <td className="p-2 border">{r.crp ?? "—"}</td>
                      <td className="p-2 border">
                        <div className="flex gap-2">
                          <button
                            className="text-blue-700"
                            onClick={() => {
                              setLabDate(r.lab_date);
                              setExistingId(r.id!);
                              setForm({
                                ...r,
                                patient_id: r.patient_id,
                                lab_date: r.lab_date
                              });
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="text-red-600"
                            onClick={() => removeRow(r.id!)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={12} className="p-2 text-gray-600 text-sm">
                    * Hct and eGFR are auto-calculated.
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
