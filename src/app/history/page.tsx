"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type HistoryRow = {
  id?: string;
  patient_id: string;
  htn: boolean | null;
  htn_since: string | null;
  dm: boolean | null;
  dm_since: string | null;
  ckd: boolean | null;
  ckd_since: string | null;
  chf: boolean | null;
  chf_since: string | null;
  pvd: boolean | null;
  pvd_since: string | null;
  prior_mi: boolean | null;
  prior_mi_since: string | null;
  cad: boolean | null;
  cad_since: string | null;
  copd_asthma: boolean | null;
  copd_asthma_since: string | null;
  stroke_tia: boolean | null;
  stroke_tia_since: string | null;
  other_past_medical: string | null;
  surgical_history: string | null;
  allergy_history: string | null;
  social_smoking: boolean | null;
  social_alcohol: boolean | null;
  social_other: string | null;
};

export default function HistoryPage() {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientInfo, setPatientInfo] = useState<{ name: string; ipd: string } | null>(null);
  const [history, setHistory] = useState<HistoryRow>({
    patient_id: "",
    htn: null, htn_since: null,
    dm: null, dm_since: null,
    ckd: null, ckd_since: null,
    chf: null, chf_since: null,
    pvd: null, pvd_since: null,
    prior_mi: null, prior_mi_since: null,
    cad: null, cad_since: null,
    copd_asthma: null, copd_asthma_since: null,
    stroke_tia: null, stroke_tia_since: null,
    other_past_medical: null,
    surgical_history: null,
    allergy_history: null,
    social_smoking: null,
    social_alcohol: null,
    social_other: null,
  });

  const [existingRowId, setExistingRowId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // 🧭 Step 1: Fetch active patient info
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

        const { data: p } = await supabase
          .from("patient_details")
          .select("patient_name, ipd_number")
          .eq("id", active.patient_id)
          .single();

        if (p) setPatientInfo({ name: p.patient_name, ipd: p.ipd_number });
      } else {
        setMessage("⚠️ No active patient selected. Go to Patient Page first.");
      }
    })();
  }, []);

  // 🩺 Step 2: Fetch existing history if present
  useEffect(() => {
    if (!patientId) return;
    (async () => {
      const { data } = await supabase
        .from("patient_history")
        .select("*")
        .eq("patient_id", patientId)
        .maybeSingle();

      if (data) {
        setExistingRowId(data.id);
        setHistory({ ...data });
      } else {
        setExistingRowId(null);
        setHistory((h) => ({ ...h, patient_id: patientId }));
      }
    })();
  }, [patientId]);

  // 📝 handle inputs
  const handleCheck = (name: keyof HistoryRow) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setHistory((h) => ({ ...h, [name]: e.target.checked }));
  };
  const handleText = (name: keyof HistoryRow) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setHistory((h) => ({ ...h, [name]: e.target.value }));
  };

  const saveHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) {
      setMessage("❌ No patient selected. Go to Patient Page.");
      return;
    }
    setSaving(true);

    let error;
    if (existingRowId) {
      ({ error } = await supabase
        .from("patient_history")
        .update(history)
        .eq("id", existingRowId));
    } else {
      const res = await supabase.from("patient_history").insert([history]).select("id").single();
      error = res.error;
      if (!error && res.data?.id) setExistingRowId(res.data.id);
    }

    setSaving(false);
    setMessage(error ? "❌ Failed to save." : "✅ Saved successfully.");
  };

  const conditions = [
    { key: "htn", label: "Hypertension", since: "htn_since" },
    { key: "dm", label: "Diabetes Mellitus", since: "dm_since" },
    { key: "ckd", label: "Chronic Kidney Disease", since: "ckd_since" },
    { key: "chf", label: "CHF", since: "chf_since" },
    { key: "pvd", label: "PVD", since: "pvd_since" },
    { key: "prior_mi", label: "Prior MI", since: "prior_mi_since" },
    { key: "cad", label: "CAD", since: "cad_since" },
    { key: "copd_asthma", label: "COPD / Asthma", since: "copd_asthma_since" },
    { key: "stroke_tia", label: "Stroke / TIA", since: "stroke_tia_since" },
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">🩺 Patient History</h1>

      {/* ✅ Active patient info */}
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
          onSubmit={saveHistory}
          className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl space-y-6"
        >
          {/* ✅ Conditions */}
          <div className="space-y-3">
            {conditions.map((c) => (
              <div key={c.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={history[c.key as keyof HistoryRow] || false}
                  onChange={handleCheck(c.key as keyof HistoryRow)}
                  className="h-5 w-5"
                />
                <label className="font-semibold text-gray-800 w-48">{c.label}</label>
                <input
                  type="text"
                  placeholder="Since (year/duration)"
                  value={(history[c.since as keyof HistoryRow] as string) || ""}
                  onChange={handleText(c.since as keyof HistoryRow)}
                  className="border border-gray-400 text-gray-800 rounded p-2 flex-1"
                />
              </div>
            ))}
          </div>

          {/* Other histories */}
          <div>
            <label className="block font-semibold text-gray-800 mb-1">Other Past Medical History</label>
            <textarea
              value={history.other_past_medical || ""}
              onChange={handleText("other_past_medical")}
              className="border border-gray-400 text-gray-800 rounded p-2 w-full"
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-800 mb-1">Surgical History</label>
            <textarea
              value={history.surgical_history || ""}
              onChange={handleText("surgical_history")}
              className="border border-gray-400 text-gray-800 rounded p-2 w-full"
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-800 mb-1">Allergy History</label>
            <textarea
              value={history.allergy_history || ""}
              onChange={handleText("allergy_history")}
              className="border border-gray-400 text-gray-800 rounded p-2 w-full"
            />
          </div>

          {/* Social history */}
          <div>
            <label className="block font-semibold text-gray-800 mb-2">Social History</label>
            <div className="flex items-center gap-4 mb-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={history.social_smoking || false}
                  onChange={handleCheck("social_smoking")}
                  className="h-5 w-5"
                />
                Smoking
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={history.social_alcohol || false}
                  onChange={handleCheck("social_alcohol")}
                  className="h-5 w-5"
                />
                Alcohol
              </label>
            </div>
            <textarea
              placeholder="Other (if any)"
              value={history.social_other || ""}
              onChange={handleText("social_other")}
              className="border border-gray-400 text-gray-800 rounded p-2 w-full"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded w-full hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : existingRowId ? "Update History" : "Save History"}
          </button>

          {message && <p className="text-center text-sm mt-2 text-gray-800">{message}</p>}
        </form>
      )}
    </div>
  );
}
