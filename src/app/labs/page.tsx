// 📁 pages/Labs.tsx
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import dayjs from "dayjs";

interface PatientInfo {
  id: string;
  name: string;
  ipd: string;
  sex: string;
  age: number;
}

interface LabRow {
  id?: string;
  patient_id: string;
  lab_date: string;

  hb?: number;
  wbc?: number;
  platelet?: number;

  scr?: number;
  urea?: number;
  uric_acid?: number;

  na?: number;
  k?: number;
  cl?: number;
  ca?: number;
  phosphate?: number;

  tbil?: number;
  dbil?: number;
  alp?: number;
  sgpt?: number;
  tprotein?: number;
  albumin?: number;

  pt?: number;
  inr?: number;
  aptt?: number;
  fibrinogen?: number;
  ddimer?: number;

  abg_ph?: number;
  pco2?: number;
  po2?: number;
  hco3?: number;
  lactate?: number;

  crp?: number;
  troponin?: number;
  cpk?: number;
  cpkmb?: number;

  rbs?: number;

  urine_pus_cells?: string;
  urine_rbc?: string;
  urine_protein?: string;
  urine_sugar?: string;
  urine_specific_gravity?: number;
  urine_ph?: number;

  cag_timing?: string;
  ptca_timing?: string;
}

// 🔸 Normal Ranges
const ranges: Record<
  keyof LabRow,
  | { male?: [number, number]; female?: [number, number]; both?: [number, number] }
> = {
  hb: { male: [13, 17], female: [12, 15] },
  wbc: { both: [4, 11] },
  platelet: { both: [150, 400] },

  scr: { male: [0.7, 1.3], female: [0.6, 1.1] },
  urea: { both: [15, 45] },
  uric_acid: { male: [3.5, 7.2], female: [2.6, 6] },

  na: { both: [135, 145] },
  k: { both: [3.5, 5] },
  cl: { both: [98, 107] },
  ca: { both: [8.5, 10.5] },
  phosphate: { both: [2.5, 4.5] },

  tbil: { both: [0.3, 1.2] },
  dbil: { both: [0, 0.3] },
  alp: { both: [44, 147] },
  sgpt: { both: [7, 56] },
  tprotein: { both: [6, 8.3] },
  albumin: { both: [3.5, 5] },

  pt: { both: [11, 13.5] },
  inr: { both: [0.8, 1.2] },
  aptt: { both: [25, 35] },
  fibrinogen: { both: [200, 400] },
  ddimer: { both: [0, 0.5] },

  abg_ph: { both: [7.35, 7.45] },
  pco2: { both: [35, 45] },
  po2: { both: [80, 100] },
  hco3: { both: [22, 26] },
  lactate: { both: [0.5, 2.2] },

  crp: { both: [0, 5] },
  cpk: { both: [30, 200] },
  cpkmb: { both: [0, 6] },
  rbs: { both: [70, 140] },

  urine_specific_gravity: { both: [1.005, 1.03] },
  urine_ph: { both: [4.5, 8] },
};

export default function Labs() {
  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);
  const [lab, setLab] = useState<LabRow | null>(null);
  const [labDate, setLabDate] = useState<string>("");

  useEffect(() => {
    fetchActivePatient();
  }, []);

  const fetchActivePatient = async () => {
    const { data, error } = await supabase
      .from("patient_details")
      .select("*")
      .eq("active", true)
      .single();
    if (error) console.error(error);
    else setPatientInfo(data);
  };

  const fetchLabForDate = async (date: string) => {
    if (!patientInfo) return;
    const { data, error } = await supabase
      .from("lab_results_classified")
      .select("*")
      .eq("patient_id", patientInfo.id)
      .eq("lab_date", date)
      .single();
    if (error) {
      setLab(null);
    } else {
      setLab(data);
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    setLabDate(date);
    fetchLabForDate(date);
  };

  const timingColor = (t: string) => {
    if (!t) return "bg-gray-100 text-gray-700 border-gray-300";
    if (t.includes("Pre")) return "bg-green-100 text-green-800 border-green-300";
    if (t.includes("0–24")) return "bg-yellow-100 text-yellow-800 border-yellow-300";
    if (t.includes("24–48")) return "bg-orange-100 text-orange-800 border-orange-300";
    if (t.includes("48–72")) return "bg-red-100 text-red-800 border-red-300";
    return "bg-gray-100 text-gray-800 border-gray-300";
  };

  const isAbnormal = (field: keyof LabRow, value: number | null) => {
    if (value === null || value === undefined) return false;
    const r = ranges[field];
    if (!r) return false;
    const sex = patientInfo?.sex?.toLowerCase();
    if (r.both) return value < r.both[0] || value > r.both[1];
    if (sex === "male" && r.male) return value < r.male[0] || value > r.male[1];
    if (sex === "female" && r.female) return value < r.female[0] || value > r.female[1];
    return false;
  };

  const renderInput = (label: string, field: keyof LabRow, unit = "") => {
    const value = lab ? lab[field] as number | null : null;
    const abnormal = isAbnormal(field, value);
    const r = ranges[field];
    let normalRange = "";
    if (r) {
      if (r.both) normalRange = `${r.both[0]}–${r.both[1]} ${unit}`;
      else if (r.male && r.female)
        normalRange = `M: ${r.male[0]}–${r.male[1]} ${unit} | F: ${r.female[0]}–${r.female[1]} ${unit}`;
    }
    return (
      <div className="mb-2">
        <label className="block font-semibold">
          {label} {unit && `(${unit})`}
        </label>
        <input
          type="number"
          value={value ?? ""}
          readOnly
          className={`w-full p-2 border rounded ${abnormal ? "border-red-500 bg-red-50" : "border-gray-300"}`}
        />
        {normalRange && <p className="text-sm font-medium">Normal: {normalRange}</p>}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      {patientInfo && (
        <div className="bg-gray-50 p-3 rounded border">
          <p><strong>Patient:</strong> {patientInfo.name} — <strong>IPD:</strong> {patientInfo.ipd} — <strong>Sex:</strong> {patientInfo.sex} — <strong>Age:</strong> {patientInfo.age}</p>
        </div>
      )}

      <div>
        <label className="block font-semibold">Lab Date</label>
        <input
          type="date"
          value={labDate}
          onChange={handleDateChange}
          className="p-2 border rounded w-full"
        />
      </div>

      {lab?.cag_timing && (
        <span className={`px-2 py-1 rounded text-sm border ${timingColor(lab.cag_timing)}`}>
          {lab.cag_timing}
        </span>
      )}
      {lab?.ptca_timing && (
        <span className={`px-2 py-1 rounded text-sm border ml-2 ${timingColor(lab.ptca_timing)}`}>
          {lab.ptca_timing}
        </span>
      )}

      <h2 className="text-xl font-bold mt-4">🩸 Hematology</h2>
      {renderInput("Hemoglobin", "hb", "g/dL")}
      {renderInput("WBC", "wbc", "×10³/µL")}
      {renderInput("Platelets", "platelet", "×10³/µL")}

      <h2 className="text-xl font-bold mt-4">🧪 Renal Function</h2>
      {renderInput("Serum Creatinine", "scr", "mg/dL")}
      {renderInput("Urea", "urea", "mg/dL")}
      {renderInput("Uric Acid", "uric_acid", "mg/dL")}

      <h2 className="text-xl font-bold mt-4">💧 Electrolytes</h2>
      {renderInput("Sodium (Na⁺)", "na", "mmol/L")}
      {renderInput("Potassium (K⁺)", "k", "mmol/L")}
      {renderInput("Chloride (Cl⁻)", "cl", "mmol/L")}
      {renderInput("Calcium (Ca²⁺)", "ca", "mg/dL")}
      {renderInput("Phosphate", "phosphate", "mg/dL")}
            <h2 className="text-xl font-bold mt-4">🫁 Liver Function</h2>
      {renderInput("Total Bilirubin", "tbil", "mg/dL")}
      {renderInput("Direct Bilirubin", "dbil", "mg/dL")}
      {renderInput("ALP", "alp", "U/L")}
      {renderInput("ALT/SGPT", "sgpt", "U/L")}
      {renderInput("Total Protein", "tprotein", "g/dL")}
      {renderInput("Albumin", "albumin", "g/dL")}

      <h2 className="text-xl font-bold mt-4">🧬 Coagulation</h2>
      {renderInput("PT", "pt", "sec")}
      {renderInput("INR", "inr")}
      {renderInput("aPTT", "aptt", "sec")}
      {renderInput("Fibrinogen", "fibrinogen", "mg/dL")}
      {renderInput("D-dimer", "ddimer", "mg/L")}

      <h2 className="text-xl font-bold mt-4">🌡 ABG</h2>
      {renderInput("pH", "abg_ph")}
      {renderInput("pCO₂", "pco2", "mmHg")}
      {renderInput("pO₂", "po2", "mmHg")}
      {renderInput("HCO₃⁻", "hco3", "mmol/L")}
      {renderInput("Lactate", "lactate", "mmol/L")}

      <h2 className="text-xl font-bold mt-4">❤️ Cardiac & Inflammatory Markers</h2>
      {renderInput("CRP", "crp", "mg/L")}
      {renderInput("Troponin", "troponin", "ng/mL")}
      {renderInput("CPK", "cpk", "U/L")}
      {renderInput("CPK-MB", "cpkmb", "U/L")}
      {renderInput("RBS", "rbs", "mg/dL")}

      <h2 className="text-xl font-bold mt-4">🧫 Urine Analysis</h2>
      <div className="mb-2">
        <label className="block font-semibold">Pus Cells</label>
        <input type="text" value={lab?.urine_pus_cells ?? ""} readOnly className="w-full p-2 border rounded border-gray-300" />
      </div>
      <div className="mb-2">
        <label className="block font-semibold">RBC</label>
        <input type="text" value={lab?.urine_rbc ?? ""} readOnly className="w-full p-2 border rounded border-gray-300" />
      </div>
      <div className="mb-2">
        <label className="block font-semibold">Protein</label>
        <input type="text" value={lab?.urine_protein ?? ""} readOnly className="w-full p-2 border rounded border-gray-300" />
      </div>
      <div className="mb-2">
        <label className="block font-semibold">Sugar</label>
        <input type="text" value={lab?.urine_sugar ?? ""} readOnly className="w-full p-2 border rounded border-gray-300" />
      </div>
      {renderInput("Specific Gravity", "urine_specific_gravity")}
      {renderInput("Urine pH", "urine_ph")}

      <h2 className="text-xl font-bold mt-4">🧮 Derived (Auto)</h2>
      <div className="mb-2">
        <label className="block font-semibold">Hematocrit (Hb × 3)</label>
        <input
          type="text"
          value={lab?.hb ? (lab.hb * 3).toFixed(1) : ""}
          readOnly
          className={`w-full p-2 border rounded ${isAbnormal("hb", lab?.hb) ? "border-red-500 bg-red-50" : "border-gray-300"}`}
        />
        <p className="text-sm font-medium">Normal: 40–50 %</p>
      </div>

      <div className="mb-2">
        <label className="block font-semibold">eGFR (CKD-EPI)</label>
        <input
          type="text"
          value={lab?.scr && patientInfo
            ? calculateEGFR(lab.scr, patientInfo.age, patientInfo.sex).toFixed(2)
            : ""}
          readOnly
          className="w-full p-2 border rounded border-gray-300"
        />
        <p className="text-sm font-medium">Normal: ≥ 90 mL/min/1.73m²</p>
      </div>
    </div>
  );
}

// 🧠 eGFR Calculation Function
function calculateEGFR(scr: number, age: number, sex: string) {
  const isFemale = sex.toLowerCase() === "female";
  const k = isFemale ? 0.7 : 0.9;
  const a = isFemale ? -0.329 : -0.411;
  const minRatio = Math.min(scr / k, 1);
  const maxRatio = Math.max(scr / k, 1);
  const sexFactor = isFemale ? 1.018 : 1;
  const egfr = 141 * Math.pow(minRatio, a) * Math.pow(maxRatio, -1.209) * Math.pow(0.993, age) * sexFactor;
  return egfr;
}
