"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ChiefComplaintsDiagnosisPage() {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientInfo, setPatientInfo] = useState<{ name: string; ipd: string } | null>(null);
  const [chiefComplaints, setChiefComplaints] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [existingRowId, setExistingRowId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // 🧭 1. Load active patient and previous data
  useEffect(() => {
    (async () => {
      const userId = "00000000-0000-0000-0000-000000000001";

      // Active patient
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

      // Patient info
      const { data: p } = await supabase
        .from("patient_details")
        .select("patient_name, ipd_number")
        .eq("id", active.patient_id)
        .single();

      if (p) setPatientInfo({ name: p.patient_name, ipd: p.ipd_number });

      // Previous complaints/diagnosis
      const { data: existing } = await supabase
        .from("chief_complaints_diagnosis")
        .select("*")
        .eq("patient_id", active.patient_id)
        .maybeSingle();

      if (existing) {
        setExistingRowId(existing.id);
        setChiefComplaints(existing.chief_complaints || "");
        setDiagnosis(existing.diagnosis || "");
      }
    })();
  }, []);

  // 💾 Save or update
  const saveData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) return;

    setSaving(true);
    let error;

    const payload = {
      patient_id: patientId,
      chief_complaints: chiefComplaints,
      diagnosis: diagnosis,
    };

    if (existingRowId) {
      ({ error } = await supabase
        .from("chief_complaints_diagnosis")
        .update(payload)
        .eq("id", existingRowId));
    } else {
      const res = await supabase
        .from("chief_complaints_diagnosis")
        .insert([payload])
        .select("id")
        .single();
      error = res.error;
      if (!error && res.data?.id) setExistingRowId(res.data.id);
    }

    setSaving(false);
    setMessage(error ? "❌ Failed to save." : "✅ Saved successfully.");
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">🩺 Chief Complaints & Diagnosis</h1>

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

      {patientId && (
        <form
          onSubmit={saveData}
          className="bg-white p-6 rounded-lg shadow-lg w-full max-w-xl space-y-4"
        >
          <div>
            <label className="block font-semibold text-gray-800 mb-1">
              Chief Complaints
            </label>
            <textarea
              value={chiefComplaints}
              onChange={(e) => setChiefComplaints(e.target.value)}
              rows={3}
              className="border border-gray-400 text-gray-800 rounded p-2 w-full"
              placeholder="Enter chief complaints..."
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-800 mb-1">Diagnosis</label>
            <textarea
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              rows={3}
              className="border border-gray-400 text-gray-800 rounded p-2 w-full"
              placeholder="Enter diagnosis..."
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded w-full hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : existingRowId ? "Update" : "Save"}
          </button>

          {message && <p className="text-center text-sm mt-2 text-gray-800">{message}</p>}
        </form>
      )}
    </div>
  );
}
