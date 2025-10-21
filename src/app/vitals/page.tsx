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
  temperature_f: number | null;
  pulse_per_min: number | null;
  sbp_mmhg: number | null;
  dbp_mmhg: number | null;
  resp_rate_cpm: number | null;
  spo2_percent: number | null;
  rbs_mg_dl: number | null;
  map_mmhg: number | null;
  hypotension_flag: boolean | null;
};

export default function OnArrivalVitalsPage() {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [vitals, setVitals] = useState<VitalsRow>({
    patient_id: "",
    temperature_f: null,
    pulse_per_min: null,
    sbp_mmhg: null,
    dbp_mmhg: null,
    resp_rate_cpm: null,
    spo2_percent: null,
    rbs_mg_dl: null,
    map_mmhg: null,
    hypotension_flag: null,
  });
  const [existingRowId, setExistingRowId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // 🧭 Step 1: Fetch active patient
  useEffect(() => {
    (async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const { data, error } = await supabase
        .from("active_patient")
        .select("patient_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (data && data.patient_id) {
        setPatientId(data.patient_id);
      } else {
        setMessage("⚠️ No active patient selected. Go to Patient Page first.");
      }
    })();
  }, []);

  // 🩺 Step 2: Fetch existing vitals for active patient
  useEffect(() => {
    if (!patientId) return;
    (async () => {
      const { data, error } = await supabase
        .from("on_arrival_vitals")
        .select("*")
        .eq("patient_id", patientId)
        .maybeSingle();

      if (data) {
        setExistingRowId(data.id);
        setVitals({
          patient_id: patientId,
          temperature_f: data.temperature_f,
          pulse_per_min: data.pulse_per_min,
          sbp_mmhg: data.sbp_mmhg,
          dbp_mmhg: data.dbp_mmhg,
          resp_rate_cpm: data.resp_rate_cpm,
          spo2_percent: data.spo2_percent,
          rbs_mg_dl: data.rbs_mg_dl,
          map_mmhg: data.map_mmhg,
          hypotension_flag: data.hypotension_flag,
        });
      } else {
        setExistingRowId(null);
        setVitals((v) => ({ ...v, patient_id: patientId }));
      }
    })();
  }, [patientId]);

  // 🧮 Auto-calc MAP and hypotension
  const derivedMap = useMemo(() => {
    if (vitals.sbp_mmhg == null || vitals.dbp_mmhg == null) return null;
    const map = (Number(vitals.sbp_mmhg) + 2 * Number(vitals.dbp_mmhg)) / 3;
    return Math.round(map * 10) / 10;
  }, [vitals.sbp_mmhg, vitals.dbp_mmhg]);

  const derivedHypotension = useMemo(() => {
    const sbp = vitals.sbp_mmhg == null ? null : Number(vitals.sbp_mmhg);
    const map = derivedMap;
    if (sbp == null && map == null) return null;
    return (sbp != null && sbp < 90) || (map != null && map < 65);
  }, [vitals.sbp_mmhg, derivedMap]);

  useEffect(() => {
    setVitals((prev) => ({
      ...prev,
      map_mmhg: derivedMap,
      hypotension_flag: derivedHypotension,
    }));
  }, [derivedMap, derivedHypotension]);

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
      temperature_f: vitals.temperature_f,
      pulse_per_min: vitals.pulse_per_min,
      sbp_mmhg: vitals.sbp_mmhg,
      dbp_mmhg: vitals.dbp_mmhg,
      resp_rate_cpm: vitals.resp_rate_cpm,
      spo2_percent: vitals.spo2_percent,
      rbs_mg_dl: vitals.rbs_mg_dl,
      map_mmhg: vitals.map_mmhg,
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
                value={vitals.temperature_f ?? ""}
                onChange={handleNum("temperature_f")}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-800 mb-1">Pulse (/min)</label>
              <input
                type="number"
                className="border border-gray-400 text-gray-800 rounded p-2 w-full"
                value={vitals.pulse_per_min ?? ""}
                onChange={handleNum("pulse_per_min")}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-800 mb-1">SBP (mmHg)</label>
              <input
                type="number"
                className="border border-gray-400 text-gray-800 rounded p-2 w-full"
                value={vitals.sbp_mmhg ?? ""}
                onChange={handleNum("sbp_mmhg")}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-800 mb-1">DBP (mmHg)</label>
              <input
                type="number"
                className="border border-gray-400 text-gray-800 rounded p-2 w-full"
                value={vitals.dbp_mmhg ?? ""}
                onChange={handleNum("dbp_mmhg")}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-800 mb-1">Resp Rate (cpm)</label>
              <input
                type="number"
                className="border border-gray-400 text-gray-800 rounded p-2 w-full"
                value={vitals.resp_rate_cpm ?? ""}
                onChange={handleNum("resp_rate_cpm")}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-800 mb-1">SpO₂ (%)</label>
              <input
                type="number"
                step="0.1"
                className="border border-gray-400 text-gray-800 rounded p-2 w-full"
                value={vitals.spo2_percent ?? ""}
                onChange={handleNum("spo2_percent")}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-800 mb-1">RBS (mg/dL)</label>
              <input
                type="number"
                className="border border-gray-400 text-gray-800 rounded p-2 w-full"
                value={vitals.rbs_mg_dl ?? ""}
                onChange={handleNum("rbs_mg_dl")}
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
