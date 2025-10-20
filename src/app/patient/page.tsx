"use client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

export default function PatientPage() {
  const [patientName, setPatientName] = useState("");
  const [sex, setSex] = useState("");
  const [admissionDate, setAdmissionDate] = useState("");
  const [procedureDate, setProcedureDate] = useState("");
  const [studyType, setStudyType] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 🧮 Auto-calculate Study Type
    const cutoff = new Date("2025-10-06");
    const entered = new Date(admissionDate);
    const studyTypeCalc = entered > cutoff ? "Prospective" : "Retrospective";
    setStudyType(studyTypeCalc);

    const { data, error } = await supabase.from("patient_details").insert([
      {
        patient_name: patientName,
        sex,
        admission_date: admissionDate,
        procedure_date: procedureDate,
        study_type: studyTypeCalc,
      },
    ]);

    if (error) {
      alert(`❌ Error saving: ${error.message}`);
    } else {
      alert("✅ Patient details saved successfully!");
      setPatientName("");
      setSex("");
      setAdmissionDate("");
      setProcedureDate("");
      setStudyType("");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-lg w-full">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 text-center">
          🧑‍⚕️ Patient Details Entry
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="block text-gray-800 font-medium mb-1">Patient Name</label>
            <input
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Enter patient name"
              className="border rounded p-2 w-full text-black bg-white placeholder-gray-500"
              required
            />
          </div>

          <div>
            <label className="block text-gray-800 font-medium mb-1">Sex</label>
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value)}
              className="border rounded p-2 w-full text-black bg-white placeholder-gray-500"
              required
            >
              <option value="">Select Sex</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-gray-800 font-medium mb-1">Admission Date</label>
            <input
              type="date"
              value={admissionDate}
              onChange={(e) => setAdmissionDate(e.target.value)}
              className="border rounded p-2 w-full text-black bg-white placeholder-gray-500"
              required
            />
          </div>

          <div>
            <label className="block text-gray-800 font-medium mb-1">Procedure Date</label>
            <input
              type="date"
              value={procedureDate}
              onChange={(e) => setProcedureDate(e.target.value)}
              className="border rounded p-2 w-full text-black bg-white placeholder-gray-500"
              required
            />
          </div>

          <div>
            <label className="block text-gray-800 font-medium mb-1">Study Type (Auto)</label>
            <input
              type="text"
              value={studyType}
              readOnly
              placeholder="Will auto calculate"
              className="border rounded p-2 w-full text-black bg-gray-100 placeholder-gray-500 cursor-not-allowed"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors"
          >
            💾 Save Patient Details
          </button>
        </form>
      </div>
    </div>
  );
}
