"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type VitalsRow = {
  id?: string;
  patient_id: string;
  temperature: number | null;
  pulse_rate: number | null;
  sbp: number | null;
  dbp: number | null;
  resp_rate: number | null;
  spo2: number | null;
  rbs: number | null;
  map: number | null;
  hypotension_flag: boolean | null;
};

export default function OnArrivalVitalsPage() {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientInfo, setPatientInfo] = useState<{ name: string; ipd: string } | null>(null);

  const [vitals, setVitals] = useState<VitalsRow>({
    patient_id: "",
    temperature: null,
    pulse_rate: null,
    sbp: null,
    dbp: null,
    resp_rate: null,
    spo2: null,
    rbs: null,
    map: null,
    hypotension_flag: null,
  });
  const [existingRowId, setExistingRowId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // 🧭 Step 1: Fetch active patient + info
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

        // Fetch patient name & IPD number
        const { data: patient } = await supabase
          .from("patient_details")
          .select("patient_name, ipd_number")
          .eq("id", active.patient_id)
          .single();

        if (patient) {
          setPatientInfo({
            name: patient.patient_name,
            ipd: patient.ipd_number,
          });
        }
      } else {
        setMessage("⚠️ No active patient selected. Go to Patient Page first.");
      }
    })();
  }, []);

  // 🩺 Step 2: Fetch existing vitals if present
  useEffect(() => {
    if (!patientId) return;
    (async () => {
      const { data } = await supabase
        .from("on_arrival_vitals")
        .select("*")
        .eq("patient_id", patientId)
        .maybeSingle();

      if (data) {
        setExistingRowId(data.id);
        setVitals({
          patient_id: patientId,
          temperature: data.temperature,
          pulse_rate: data.pulse_rate,
          sbp: data.sbp,
          dbp: data.dbp,
          resp_rate: data.resp_rate,
          spo2: data.spo2,
          rbs: data.rbs,
          map: data.map,
          hypotension_flag: data.hypotension_flag,
        });
      } else {
        setExistingRowId(null);
        setVitals((v) => ({ ...v, patient_id: patientId }));
      }
    })();
  }, [patientId]);

  // 🧮 Auto-calc MAP & hypotension
  const derivedMap = useMemo(() => {
    if (vitals.sbp == null || vitals.dbp == null) return null;
    const mapVal = (Number(vitals.sbp) + 2 * Number(vitals.dbp)) / 3;
    return Math.round(mapVal * 10) / 10;
  }, [vitals.sbp, vitals.dbp]);

  const derivedHypotension = useMemo(() => {
    const sbpVal = vitals.sbp == null ? null : Number(vitals.sbp);
    const mapVal = derivedMap;
    if (sbpVal == null && mapVal == null) return null;
    return (sbpVal != null && sbpVal < 90) || (mapVal != null && mapVal < 65);
  }, [vitals.sbp, derivedMap]);

  useEffect(() => {
    setVitals((prev) => ({
      ...prev,
      map: derivedMap,
      hypotension_flag: derivedHypotension,
    }));
  }, [derivedMap, derivedHypotension]);

  // handle input
  const handleNum = (name: keyof VitalsRow) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value === "" ? null : Number(e.target.value);
    setVitals((v) => ({ ...v, [name]: val }));
  };

  const saveVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) {
      setMessage("❌ No patient selected. Go to Patient Page.");
      return;
    }
    setSaving(true);

    const payload = {
      patient_id: patientId,
      temperature: vitals.temperature,
      pulse_rate: vitals.pulse_rate,
      sbp: vitals.sbp,
      dbp: vitals.dbp,
      resp_rate: vitals.resp_rate,
      spo2: vitals.spo2,
      rbs: vitals.rbs,
      map: vitals.map,
      hypotension_flag: vitals.hypotension_flag,
    };

    let error;
    if (existingRowId) {
      ({ error } = await supabase
        .from("on_arrival_vitals")
        .update(payload)
        .eq("id", existingRowId));
    } else {
      const res = await supabase.from("on_arrival_vitals").insert([payload]).select("id").single();
      error = res.error;
      if (!error && res.data?.id) setExistingRowId(res.data.id);
    }

    setSaving(false);
    setMessage(error ? "❌ Failed to save." : "✅ Saved successfully.");
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">🩺 On-Arrival Vitals</h1>

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
          onSubmit={saveVitals}
          className="bg-white p-6 rounded-lg shadow-lg w-full max-w-xl space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-gray-800 mb-1">Temperature (°F)</label>
              <input
                type="number"
                step="0.1"
                className="border border-gray-400 text-gray-800 rounded p-2 w-full"
                value={vitals.temperature ?? ""}
                onChange={handleNum("temperature")}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-800 mb-1">Pulse (/min)</label>
              <input
                type="number"
                className="border border-gray-400 text-gray-800 rounded p-2 w-full"
                value={vitals.pulse_rate ?? ""}
                onChange={handleNum("pulse_rate")}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-800 mb-1">SBP (mmHg)</label>
              <input
                type="number"
                className="border border-gray-400 text-gray-800 rounded p-2 w-full"
                value={vitals.sbp ?? ""}
                onChange={handleNum("sbp")}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-800 mb-1">DBP (mmHg)</label>
              <input
                type="number"
                className="border border-gray-400 text-gray-800 rounded p-2 w-full"
                value={vitals.dbp ?? ""}
                onChange={handleNum("dbp")}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-800 mb-1">Resp Rate (cpm)</label>
              <input
                type="number"
                className="border border-gray-400 text-gray-800 rounded p-2 w-full"
                value={vitals.resp_rate ?? ""}
                onChange={handleNum("resp_rate")}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-800 mb-1">SpO₂ (%)</label>
              <input
                type="number"
                step="0.1"
                className="border border-gray-400 text-gray-800 rounded p-2 w-full"
                value={vitals.spo2 ?? ""}
                onChange={handleNum("spo2")}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-800 mb-1">RBS (mg/dL)</label>
              <input
                type="number"
                className="border border-gray-400 text-gray-800 rounded p-2 w-full"
                value={vitals.rbs ?? ""}
                onChange={handleNum("rbs")}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-800 mb-1">MAP (auto)</label>
              <input
                readOnly
                className="border border-gray-300 bg-gray-100 text-gray-800 rounded p-2 w-full"
                value={derivedMap ?? ""}
                placeholder="—"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-800 mb-1">Hypotension (auto)</label>
              <input
                readOnly
                className="border border-gray-300 bg-gray-100 text-gray-800 rounded p-2 w-full"
                value={
                  derivedHypotension == null
                    ? ""
                    : derivedHypotension
                    ? "Yes (SBP<90 or MAP<65)"
                    : "No"
                }
                placeholder="—"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded w-full hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : existingRowId ? "Update Vitals" : "Save Vitals"}
          </button>

          {message && <p className="text-center text-sm mt-2 text-gray-800">{message}</p>}
        </form>
      )}
    </div>
  );
}
