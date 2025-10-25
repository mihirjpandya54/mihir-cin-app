"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function MedicationsPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const [meds, setMeds] = useState<any[]>([]);
  const [patient, setPatient] = useState<any>(null);
  const [adminRows, setAdminRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

  // fetch meds, patient, admin rows, summary
  useEffect(() => {
    if (!patientId) return;
    const fetchAll = async () => {
      const [medsData, patientData, adminData, summaryData] = await Promise.all([
        supabase.from("medications_master").select("*").order("drug_class").order("drug_name"),
        supabase.from("patient_details").select("*").eq("id", patientId).single(),
        supabase.from("medication_administration").select("*").eq("patient_id", patientId),
        supabase.from("medication_summary_per_patient").select("*").eq("patient_id", patientId).single(),
      ]);
      setMeds(medsData.data || []);
      setPatient(patientData.data || null);
      setAdminRows(adminData.data || []);
      setSummary(summaryData.data || null);
    };
    fetchAll();
  }, [patientId]);

  // group meds by class
  const medsGrouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    meds.forEach((m) => {
      if (!groups[m.drug_class]) groups[m.drug_class] = [];
      groups[m.drug_class].push(m);
    });
    return groups;
  }, [meds]);

  // build date list (7 days from admission)
  const dateList = useMemo(() => {
    if (!patient?.admission_datetime) return [];
    const base = new Date(patient.admission_datetime);
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [patient]);

  // helper: calculate flag text for a given date
  const getFlags = (date: Date) => {
    if (!patient) return "";
    const flags: string[] = [];
    const cag = patient.cag_datetime ? new Date(patient.cag_datetime) : null;
    const ptca = patient.ptca_datetime ? new Date(patient.ptca_datetime) : null;

    const diffDays = (d1: Date, d2: Date) =>
      Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));

    if (cag) {
      const diff = diffDays(date, cag);
      if (diff < 0) flags.push("Pre CAG");
      else if (diff === 0) flags.push("0–24h CAG");
      else if (diff === 1) flags.push("48h CAG");
      else if (diff === 2) flags.push("72h CAG");
    }
    if (ptca) {
      const diff = diffDays(date, ptca);
      if (diff < 0) flags.push("Pre PTCA");
      else if (diff === 0) flags.push("0–24h PTCA");
      else if (diff === 1) flags.push("48h PTCA");
      else if (diff === 2) flags.push("72h PTCA");
    }
    return flags.join(", ");
  };

  // check if med already selected for a date
  const isSelected = (medId: string, index: number, dose: string, freq: string) => {
    return adminRows.some(
      (row) =>
        row.medication_id === medId &&
        row[`day${index + 1}`] === true &&
        (row.dose ?? "") === (dose ?? "") &&
        (row.frequency ?? "") === (freq ?? "")
    );
  };

  const handleTick = async (med: any, dateIndex: number, dose: string, freq: string, checked: boolean) => {
    if (checked) {
      const flags = { [`day${dateIndex + 1}`]: true };
      await supabase.from("medication_administration").insert({
        patient_id: patient.id,
        medication_id: med.id,
        dose: dose || null,
        frequency: freq || null,
        ...flags,
      });
    } else {
      const rows = adminRows.filter(
        (r) =>
          r.medication_id === med.id &&
          r[`day${dateIndex + 1}`] === true &&
          (r.dose ?? "") === (dose ?? "") &&
          (r.frequency ?? "") === (freq ?? "")
      );
      for (const r of rows) {
        await supabase.from("medication_administration").delete().eq("id", r.id);
      }
    }
    const { data: adminData } = await supabase
      .from("medication_administration")
      .select("*")
      .eq("patient_id", patient.id);
    setAdminRows(adminData || []);

    const { data: summaryData } = await supabase
      .from("medication_summary_per_patient")
      .select("*")
      .eq("patient_id", patient.id)
      .single();
    setSummary(summaryData || null);
  };

  // simple duplicate logic: we allow multiple rows per drug
  const [rowKeys, setRowKeys] = useState<string[]>([]);
  const addDuplicate = (medId: string) => {
    setRowKeys([...rowKeys, `${medId}-${Date.now()}`]);
  };

  // Summary check
  const hasFlag = (key: string) => (summary && summary[key] && summary[key] > 0 ? "✅" : "❌");

  return (
    <div className="min-h-screen p-6 bg-base-200">
      <h1 className="text-2xl font-bold mb-4">Medications — Patient {patientId}</h1>

      {/* Procedure Dates */}
      {patient && (
        <div className="card bg-base-100 p-4 mb-6">
          <div className="flex gap-4 text-sm">
            <div><strong>Admission:</strong> {new Date(patient.admission_datetime).toLocaleDateString()}</div>
            <div><strong>CAG:</strong> {patient.cag_datetime ? new Date(patient.cag_datetime).toLocaleDateString() : "—"}</div>
            <div><strong>PTCA:</strong> {patient.ptca_datetime ? new Date(patient.ptca_datetime).toLocaleDateString() : "—"}</div>
          </div>
        </div>
      )}

      {/* Medications Table */}
      {Object.entries(medsGrouped).map(([cls, group]) => (
        <details key={cls} open className="mb-6">
          <summary className="font-semibold cursor-pointer">{cls} ({group.length})</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="table table-compact w-full">
              <thead>
                <tr>
                  <th>Drug</th>
                  <th>Dose</th>
                  <th>Freq</th>
                  <th colSpan={7}>Dates (7 days)</th>
                  <th>Flags</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {group.map((med) => {
                  const rows = [med.id, ...rowKeys.filter((k) => k.startsWith(med.id))];
                  return rows.map((key) => {
                    const [dose, setDose] = useState(med.reference_dose || "");
                    const [freq, setFreq] = useState("");
                    return (
                      <tr key={key}>
                        <td>{med.drug_name}</td>
                        <td>
                          <input
                            className="input input-bordered input-xs"
                            value={dose}
                            onChange={(e) => setDose(e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="input input-bordered input-xs"
                            value={freq}
                            onChange={(e) => setFreq(e.target.value)}
                          />
                        </td>
                        {dateList.map((date, idx) => {
                          const checked = isSelected(med.id, idx, dose, freq);
                          return (
                            <td key={idx}>
                              <input
                                type="checkbox"
                                className="checkbox checkbox-xs"
                                checked={checked}
                                onChange={(e) => handleTick(med, idx, dose, freq, e.target.checked)}
                              />
                            </td>
                          );
                        })}
                        <td className="text-xs">{/* show flags for first checked date */}
                          {dateList.map((d, i) =>
                            isSelected(med.id, i, dose, freq) ? getFlags(d) : null
                          )}
                        </td>
                        <td>
                          <button
                            className="btn btn-xs btn-outline"
                            onClick={() => addDuplicate(med.id)}
                          >
                            ➕
                          </button>
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </details>
      ))}

      {/* ✅❌ Summary Table */}
      {summary && (
        <div className="mt-8 overflow-x-auto">
          <table className="table table-zebra w-full text-center">
            <thead>
              <tr>
                <th>Time Frame</th>
                <th>Nephrotoxic</th>
                <th>Preventive</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Pre CAG</td><td>{hasFlag("nephrotoxic_pre_cag_count")}</td><td>{hasFlag("preventive_pre_cag_count")}</td></tr>
              <tr><td>0–24 h CAG</td><td>{hasFlag("nephrotoxic_post_cag_count")}</td><td>{hasFlag("preventive_post_cag_count")}</td></tr>
              <tr><td>48 h CAG</td><td>{hasFlag("nephrotoxic_post_cag_count")}</td><td>{hasFlag("preventive_post_cag_count")}</td></tr>
              <tr><td>72 h CAG</td><td>{hasFlag("nephrotoxic_post_cag_count")}</td><td>{hasFlag("preventive_post_cag_count")}</td></tr>
              <tr><td>Pre PTCA</td><td>{hasFlag("nephrotoxic_pre_ptca_count")}</td><td>{hasFlag("preventive_pre_ptca_count")}</td></tr>
              <tr><td>0–24 h PTCA</td><td>{hasFlag("nephrotoxic_post_ptca_count")}</td><td>{hasFlag("preventive_post_ptca_count")}</td></tr>
              <tr><td>48 h PTCA</td><td>{hasFlag("nephrotoxic_post_ptca_count")}</td><td>{hasFlag("preventive_post_ptca_count")}</td></tr>
              <tr><td>72 h PTCA</td><td>{hasFlag("nephrotoxic_post_ptca_count")}</td><td>{hasFlag("preventive_post_ptca_count")}</td></tr>
            </tbody>
          </table>
          <div className="text-xs text-gray-400 mt-2">Auto-calculated just now ⏳</div>
        </div>
      )}
    </div>
  );
}
