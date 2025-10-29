"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type MedRow = {
  id?: string;
  patient_id: string;
  medication_name: string;
  dose: string | null;
  frequency: string | null;
  last_dose_taken: string | null;
  continue_flag: boolean | null;
  discontinue_flag: boolean | null;
  time_diff_hours?: number | null;
  nephro_flag?: boolean | null;
};

export default function PastMedicationsPage() {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientInfo, setPatientInfo] = useState<{ name: string; ipd: string } | null>(null);
  const [procedureTime, setProcedureTime] = useState<Date | null>(null);
  const [medications, setMedications] = useState<MedRow[]>([]);
  const [newMed, setNewMed] = useState<MedRow>({
    patient_id: "",
    medication_name: "",
    dose: "",
    frequency: "",
    last_dose_taken: "",
    continue_flag: false,
    discontinue_flag: false,
  });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // 🧭 Load active patient + procedure time
  useEffect(() => {
    (async () => {
      const userId = "00000000-0000-0000-0000-000000000001";

      // Get active patient ID
      const { data: active } = await supabase
        .from("active_patient")
        .select("patient_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!active?.patient_id) {
        setMessage("⚠️ No active patient selected. Go to Patient Page first.");
        return;
      }

      setPatientId(active.patient_id);
      setNewMed((m) => ({ ...m, patient_id: active.patient_id }));

      // Patient info
      const { data: p } = await supabase
        .from("patient_details")
        .select("patient_name, ipd_number, procedure_datetime_cag, procedure_datetime_ptca, procedure_type")
        .eq("id", active.patient_id)
        .single();

      if (p) {
        setPatientInfo({ name: p.patient_name, ipd: p.ipd_number });
        // Use procedure time based on procedure_type
        const proc =
          p.procedure_type === "PTCA"
            ? p.procedure_datetime_ptca
            : p.procedure_datetime_cag;
        if (proc) setProcedureTime(new Date(proc));
      }

      // Medications
      const { data: meds } = await supabase
        .from("past_medication_history")
        .select("*")
        .eq("patient_id", active.patient_id);

      if (meds) setMedications(meds);
    })();
  }, []);

  // 🧮 Calculate nephro flag + time difference
  const calculateNephroData = async (medName: string, lastDose: string, cont: boolean, disc: boolean) => {
    if (!procedureTime || !lastDose) return { timeDiff: null, nephro: false };

    const lastDoseTime = new Date(lastDose);
    const diffMs = procedureTime.getTime() - lastDoseTime.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    // Check if medication is nephrotoxic
    const { data: med } = await supabase
      .from("medications_master")
      .select("is_nephrotoxic")
      .ilike("drug_name", medName)
      .maybeSingle();

    const isNephrotoxic = med?.is_nephrotoxic ?? false;

    let nephroFlag = false;
    if (isNephrotoxic) {
      if (diffHours <= 72) {
        nephroFlag = true;
      } else if (cont) {
        nephroFlag = true;
      } else {
        nephroFlag = false;
      }
    }

    return { timeDiff: Math.round(diffHours * 10) / 10, nephro: nephroFlag };
  };

  // 📝 Add new medication
  const addMedication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) return;
    if (!newMed.medication_name.trim()) {
      setMessage("❌ Medication name is required.");
      return;
    }

    setSaving(true);

    const { timeDiff, nephro } = await calculateNephroData(
      newMed.medication_name,
      newMed.last_dose_taken || "",
      !!newMed.continue_flag,
      !!newMed.discontinue_flag
    );

    const payload = {
      ...newMed,
      patient_id: patientId,
      last_dose_taken: newMed.last_dose_taken || null,
      time_diff_hours: timeDiff,
      nephro_flag: nephro,
    };

    const { data, error } = await supabase
      .from("past_medication_history")
      .insert([payload])
      .select()
      .single();

    setSaving(false);

    if (error) {
      setMessage("❌ Failed to save.");
    } else {
      setMedications((prev) => [...prev, data]);
      setNewMed({
        patient_id: patientId,
        medication_name: "",
        dose: "",
        frequency: "",
        last_dose_taken: "",
        continue_flag: false,
        discontinue_flag: false,
      });
      setMessage("✅ Medication added.");
    }
  };

  // ✍️ Update medication row
  const updateMedication = async (id: string, field: keyof MedRow, value: any) => {
    const updatedList = medications.map((m) => (m.id === id ? { ...m, [field]: value } : m));
    setMedications(updatedList);

    const med = updatedList.find((m) => m.id === id);
    if (!med) return;

    // Recalculate nephro flag and time diff on update
    const { timeDiff, nephro } = await calculateNephroData(
      med.medication_name,
      med.last_dose_taken || "",
      !!med.continue_flag,
      !!med.discontinue_flag
    );

    await supabase
      .from("past_medication_history")
      .update({ ...med, [field]: value, time_diff_hours: timeDiff, nephro_flag: nephro })
      .eq("id", id);
  };

  // 🗑 Delete
  const deleteMedication = async (id: string) => {
    await supabase.from("past_medication_history").delete().eq("id", id);
    setMedications((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-4 text-gray-900">💊 Past Medication History</h1>

      {patientInfo && (
        <div className="mb-4 text-lg font-semibold text-gray-900 bg-blue-50 border border-blue-300 rounded p-3 w-full max-w-xl text-center">
          🧑 Patient: <span className="font-bold text-gray-900">{patientInfo.name}</span> — IPD:{" "}
          <span className="font-mono text-gray-900">{patientInfo.ipd}</span>
        </div>
      )}

      {!patientId && (
        <div className="mb-3 text-center font-semibold text-red-600">
          ⚠️ No active patient selected. Please go to Patient Page first.
        </div>
      )}

      {patientId && (
        <form
          onSubmit={addMedication}
          className="bg-white p-4 rounded-lg shadow-md w-full max-w-2xl space-y-3 mb-6"
        >
          <input
            type="text"
            placeholder="Medication Name"
            value={newMed.medication_name}
            onChange={(e) => setNewMed({ ...newMed, medication_name: e.target.value })}
            className="border border-gray-400 text-gray-900 rounded p-2 w-full"
          />
          <input
            type="text"
            placeholder="Dose"
            value={newMed.dose || ""}
            onChange={(e) => setNewMed({ ...newMed, dose: e.target.value })}
            className="border border-gray-400 text-gray-900 rounded p-2 w-full"
          />
          <input
            type="text"
            placeholder="Frequency"
            value={newMed.frequency || ""}
            onChange={(e) => setNewMed({ ...newMed, frequency: e.target.value })}
            className="border border-gray-400 text-gray-900 rounded p-2 w-full"
          />
          <label className="block text-gray-900 font-semibold">Last Dose Taken</label>
          <input
            type="datetime-local"
            value={newMed.last_dose_taken || ""}
            onChange={(e) => setNewMed({ ...newMed, last_dose_taken: e.target.value })}
            className="border border-gray-400 text-gray-900 rounded p-2 w-full"
          />

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-gray-900">
              <input
                type="checkbox"
                checked={Boolean(newMed.continue_flag)}
                onChange={(e) => setNewMed({ ...newMed, continue_flag: e.target.checked })}
              />
              Continue
            </label>
            <label className="flex items-center gap-2 text-gray-900">
              <input
                type="checkbox"
                checked={Boolean(newMed.discontinue_flag)}
                onChange={(e) => setNewMed({ ...newMed, discontinue_flag: e.target.checked })}
              />
              Discontinue
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60 w-full"
          >
            {saving ? "Saving..." : "Add Medication"}
          </button>

          {message && <p className="text-center text-sm mt-2 text-gray-900">{message}</p>}
        </form>
      )}

      {medications.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow-md w-full max-w-2xl">
          <h2 className="text-xl font-semibold mb-3 text-gray-900">📝 Existing Medications</h2>
          <ul className="space-y-3">
            {medications.map((m) => (
              <li key={m.id} className="border-b pb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-gray-900">{m.medication_name}</span>
                  <button
                    type="button"
                    onClick={() => deleteMedication(m.id!)}
                    className="text-red-600 font-semibold"
                  >
                    ✕
                  </button>
                </div>

                <input
                  type="text"
                  value={m.dose || ""}
                  onChange={(e) => updateMedication(m.id!, "dose", e.target.value)}
                  className="border border-gray-300 rounded p-1 w-full mb-1 text-gray-900"
                  placeholder="Dose"
                />
                <input
                  type="text"
                  value={m.frequency || ""}
                  onChange={(e) => updateMedication(m.id!, "frequency", e.target.value)}
                  className="border border-gray-300 rounded p-1 w-full mb-1 text-gray-900"
                  placeholder="Frequency"
                />
                <input
                  type="datetime-local"
                  value={m.last_dose_taken || ""}
                  onChange={(e) => updateMedication(m.id!, "last_dose_taken", e.target.value)}
                  className="border border-gray-300 rounded p-1 w-full mb-2 text-gray-900"
                />

                <div className="flex justify-between items-center">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-gray-900">
                      <input
                        type="checkbox"
                        checked={Boolean(m.continue_flag)}
                        onChange={(e) => updateMedication(m.id!, "continue_flag", e.target.checked)}
                      />
                      Continue
                    </label>
                    <label className="flex items-center gap-2 text-gray-900">
                      <input
                        type="checkbox"
                        checked={Boolean(m.discontinue_flag)}
                        onChange={(e) => updateMedication(m.id!, "discontinue_flag", e.target.checked)}
                      />
                      Discontinue
                    </label>
                  </div>

                  {m.nephro_flag && (
                    <span className="text-red-600 font-semibold">⚠️ Nephrotoxic (within 72h)</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
