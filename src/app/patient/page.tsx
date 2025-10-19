"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PatientDetailsPage() {
  const [formData, setFormData] = useState({
    patient_name: "",
    patient_id_hospital: "",
    age: "",
    sex: "",
    admission_date: "",
    discharge_date: "",
    procedure_type: "",
    procedure_date_cag: "",
    procedure_time_cag: "",
    procedure_date_ptca: "",
    procedure_time_ptca: "",
    study_type: "",
    hospital_stay: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let updatedData = { ...formData, [name]: value };

    // Auto calculate study type
    if (name === "admission_date") {
      const admissionDate = new Date(value);
      const cutoffDate = new Date("2025-10-06");
      if (admissionDate >= cutoffDate) {
        updatedData.study_type = "Prospective";
      } else {
        updatedData.study_type = "Retrospective";
      }

      // Auto calculate hospital stay if discharge date already entered
      if (formData.discharge_date) {
        const dischargeDate = new Date(formData.discharge_date);
        const diff = dischargeDate.getTime() - admissionDate.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        updatedData.hospital_stay = `${days} day(s)`;
      }
    }

    // Auto calculate hospital stay when discharge date is entered
    if (name === "discharge_date" && formData.admission_date) {
      const admissionDate = new Date(formData.admission_date);
      const dischargeDate = new Date(value);
      const diff = dischargeDate.getTime() - admissionDate.getTime();
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      updatedData.hospital_stay = `${days} day(s)`;
    }

    setFormData(updatedData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.from("patient_details").insert([
      {
        patient_name: formData.patient_name,
        patient_id_hospital: formData.patient_id_hospital,
        age: formData.age,
        sex: formData.sex,
        admission_date: formData.admission_date,
        discharge_date: formData.discharge_date,
        procedure_type: formData.procedure_type,
        procedure_date_cag: formData.procedure_date_cag,
        procedure_time_cag: formData.procedure_time_cag,
        procedure_date_ptca: formData.procedure_date_ptca,
        procedure_time_ptca: formData.procedure_time_ptca,
        study_type: formData.study_type,
        hospital_stay: formData.hospital_stay,
      },
    ]);

    setLoading(false);

    if (error) {
      console.error(error);
      setMessage("❌ Failed to save. Check console.");
    } else {
      setMessage("✅ Patient data saved successfully!");
      setFormData({
        patient_name: "",
        patient_id_hospital: "",
        age: "",
        sex: "",
        admission_date: "",
        discharge_date: "",
        procedure_type: "",
        procedure_date_cag: "",
        procedure_time_cag: "",
        procedure_date_ptca: "",
        procedure_time_ptca: "",
        study_type: "",
        hospital_stay: "",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">
        🧑‍⚕️ Patient Details Entry
      </h1>

      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-lg shadow-lg w-full max-w-xl space-y-4"
      >
        <input
          type="text"
          name="patient_name"
          placeholder="Patient Name"
          value={formData.patient_name}
          onChange={handleChange}
          required
          className="border rounded p-2 w-full"
        />
        <input
          type="text"
          name="patient_id_hospital"
          placeholder="Hospital ID"
          value={formData.patient_id_hospital}
          onChange={handleChange}
          className="border rounded p-2 w-full"
        />
        <input
          type="number"
          name="age"
          placeholder="Age"
          value={formData.age}
          onChange={handleChange}
          className="border rounded p-2 w-full"
        />
        <select
          name="sex"
          value={formData.sex}
          onChange={handleChange}
          className="border rounded p-2 w-full"
        >
          <option value="">Select Sex</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
        <input
          type="date"
          name="admission_date"
          placeholder="Admission Date"
          value={formData.admission_date}
          onChange={handleChange}
          className="border rounded p-2 w-full"
        />
        <input
          type="date"
          name="discharge_date"
          placeholder="Discharge Date"
          value={formData.discharge_date}
          onChange={handleChange}
          className="border rounded p-2 w-full"
        />
        <input
          type="text"
          name="study_type"
          placeholder="Study Type"
          value={formData.study_type}
          readOnly
          className="border rounded p-2 w-full bg-gray-100 cursor-not-allowed"
        />
        <input
          type="text"
          name="hospital_stay"
          placeholder="Hospital Stay (days)"
          value={formData.hospital_stay}
          readOnly
          className="border rounded p-2 w-full bg-gray-100 cursor-not-allowed"
        />
        <select
          name="procedure_type"
          value={formData.procedure_type}
          onChange={handleChange}
          className="border rounded p-2 w-full"
        >
          <option value="">Select Procedure</option>
          <option value="CAG">CAG</option>
          <option value="PTCA">PTCA</option>
          <option value="CAG + PTCA">CAG + PTCA</option>
        </select>
        <label className="block font-semibold text-gray-700">CAG Date & Time</label>
        <input
          type="date"
          name="procedure_date_cag"
          value={formData.procedure_date_cag}
          onChange={handleChange}
          className="border rounded p-2 w-full"
        />
        <input
          type="time"
          name="procedure_time_cag"
          value={formData.procedure_time_cag}
          onChange={handleChange}
          className="border rounded p-2 w-full"
        />
        <label className="block font-semibold text-gray-700">PTCA Date & Time</label>
        <input
          type="date"
          name="procedure_date_ptca"
          value={formData.procedure_date_ptca}
          onChange={handleChange}
          className="border rounded p-2 w-full"
        />
        <input
          type="time"
          name="procedure_time_ptca"
          value={formData.procedure_time_ptca}
          onChange={handleChange}
          className="border rounded p-2 w-full"
        />

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded w-full hover:bg-blue-700"
        >
          {loading ? "Saving..." : "Save Patient"}
        </button>

        {message && (
          <p className="text-center text-sm mt-2">
            {message}
          </p>
        )}
      </form>
    </div>
  );
}
