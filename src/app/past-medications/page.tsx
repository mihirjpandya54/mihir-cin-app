"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

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
};

export default function PastMedicationsPage() {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientInfo, setPatientInfo] = useState<{ name: string; ipd: string } | null>(null);
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

  // 🧭 1. Load active patient
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
        setNewMed((m) => ({ ...m, patient_id: active.patient_id }));

        const { data: p } = await supabase
          .from("patient_details")
          .select("patient_name, ipd_number")
          .eq("id", active.patient_id)
          .single();

        if (p) setPatientInfo({ name: p.patient_name, ipd: p.ipd_number });

        const { data: meds } = await supabase
          .from("past_medication_history")
          .select("*")
          .eq("patient_id", active.patient_id);

        if (meds) setMedications(meds);
      } else {
        setMessage("⚠️ No active patient selected. Go to Patient Page first.");
      }
    })();
  }, []);

  // 📝 Add new medication
  const addMedication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) return;

    if (!newMed.medication_name.trim()) {
      setMessage("❌ Medication name is required.");
      return;
    }

    setSaving(true);

    const payload = {
      ...newMed,
      patient_id: patientId,
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

  // ✍️ Update medication row (checkbox or text)
  const updateMedication = async (id: string, field: keyof MedRow, value: any) => {
    const updated = medications.map((m) => (m.id === id ? { ...m, [field]: value } : m));
    setMedications(updated);

    await supabase
      .from("past_medication_history")
      .update({ [field]: value })
      .eq("id", id);
  };

  // 🗑 Delete
  const deleteMedication = async (id: string) => {
    await supabase.from("past_medication_history").delete().eq("id", id);
    setMedications((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">💊 Past Medication History</h1>

      {patientInfo && (
        <div className="mb-4 text-lg font-semibold text-gray-800 bg-blue-50 border border-blue-300 rounded p-3 w-full max-w-xl text-center">
          🧑 Patient: <span className="font-bold">{patientInfo.name}</span> — IPD:{" "}
          <span className="font-mono">{patientInfo.ipd}</span>
        </div>
      )}

      {!patientId && (
        <div className="mb-3 text-center font-semibold text-red-600">
          ⚠️ No active patient selected. Please go to Patient Page first.
        </div>
      )}

      {/* Add new medication */}
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
            className="border border-gray-400 text-gray-800 rounded p-2 w-full"
          />
          <input
            type="text"
            placeholder="Dose"
            value={newMed.dose || ""}
            onChange={(e) => setNewMed({ ...newMed, dose: e.target.value })}
            className="border border-gray-400 text-gray-800 rounded p-2 w-full"
          />
          <input
            type="text"
            placeholder="Frequency"
            value={newMed.frequency || ""}
            onChange={(e) => setNewMed({ ...newMed, frequency: e.target.value })}
            className="border border-gray-400 text-gray-800 rounded p-2 w-full"
          />
          <input
            type="text"
            placeholder="Last Dose Taken"
            value={newMed.last_dose_taken || ""}
            onChange={(e) => setNewMed({ ...newMed, last_dose_taken: e.target.value })}
            className="border border-gray-400 text-gray-800 rounded p-2 w-full"
          />

          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(newMed.continue_flag)}
                onChange={(e) => setNewMed({ ...newMed, continue_flag: e.target.checked })}
              />
              Continue
            </label>
            <label className="flex items-center gap-2">
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

          {message && <p className="text-center text-sm mt-2 text-gray-800">{message}</p>}
        </form>
      )}

      {/* Medication list */}
      {medications.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow-md w-full max-w-2xl">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">📝 Existing Medications</h2>
          <ul className="space-y-3">
            {medications.map((m) => (
              <li key={m.id} className="border-b pb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-gray-800">{m.medication_name}</span>
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
                  className="border border-gray-300 rounded p-1 w-full mb-1"
                  placeholder="Dose"
                />
                <input
                  type="text"
                  value={m.frequency || ""}
                  onChange={(e) => updateMedication(m.id!, "frequency", e.target.value)}
                  className="border border-gray-300 rounded p-1 w-full mb-1"
                  placeholder="Frequency"
                />
                <input
                  type="text"
                  value={m.last_dose_taken || ""}
                  onChange={(e) => updateMedication(m.id!, "last_dose_taken", e.target.value)}
                  className="border border-gray-300 rounded p-1 w-full mb-2"
                  placeholder="Last Dose"
                />
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(m.continue_flag)}
                      onChange={(e) => updateMedication(m.id!, "continue_flag", e.target.checked)}
                    />
                    Continue
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(m.discontinue_flag)}
                      onChange={(e) => updateMedication(m.id!, "discontinue_flag", e.target.checked)}
                    />
                    Discontinue
                  </label>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
