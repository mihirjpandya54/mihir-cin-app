"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Patient {
  id: string;
  patient_name: string;
  patient_id_hospital: string;
}

export default function PatientDetailsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

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

  // 🔸 Load patient list
  useEffect(() => {
    const fetchPatients = async () => {
      const { data, error } = await supabase
        .from("patient_details")
        .select("id, patient_name, patient_id_hospital")
        .order("patient_name", { ascending: true });
      if (!error && data) setPatients(data);
    };
    fetchPatients();
  }, []);

  const filteredPatients = patients.filter(
    (p) =>
      p.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.patient_id_hospital.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 🧮 Auto calculations
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let updatedData = { ...formData, [name]: value };

    if (name === "admission_date") {
      const admissionDate = new Date(value);
      const cutoffDate = new Date("2025-10-06");
      updatedData.study_type = admissionDate >= cutoffDate ? "Prospective" : "Retrospective";

      if (formData.discharge_date) {
        const dischargeDate = new Date(formData.discharge_date);
        const diff = dischargeDate.getTime() - admissionDate.getTime();
        updatedData.hospital_stay = `${Math.ceil(diff / (1000 * 60 * 60 * 24))} day(s)`;
      }
    }

    if (name === "discharge_date" && formData.admission_date) {
      const admissionDate = new Date(formData.admission_date);
      const dischargeDate = new Date(value);
      const diff = dischargeDate.getTime() - admissionDate.getTime();
      updatedData.hospital_stay = `${Math.ceil(diff / (1000 * 60 * 60 * 24))} day(s)`;
    }

    setFormData(updatedData);
  };

  // 🧭 Set active patient after selection or creation
  const setActivePatient = async (patientId: string) => {
    const userId = "00000000-0000-0000-0000-000000000001"; // placeholder
    await supabase
      .from("active_patient")
      .upsert({ user_id: userId, patient_id: patientId }, { onConflict: "user_id" });
  };

  // 💾 Save patient
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (selectedPatientId) {
      // just set active if existing patient selected
      await setActivePatient(selectedPatientId);
      setLoading(false);
      setMessage("✅ Existing patient selected and set active!");
      return;
    }

    // Insert new patient
    const { data, error } = await supabase
      .from("patient_details")
      .insert([
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
      ])
      .select("id")
      .single();

    setLoading(false);
    if (error || !data) {
      setMessage("❌ Failed to save patient.");
    } else {
      await setActivePatient(data.id);
      setMessage("✅ New patient saved and set active!");
      resetForm();
    }
  };

  const resetForm = () => {
    setSelectedPatientId(null);
    setSearchTerm("");
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
  };

  // 🧑‍⚕️ Load patient details on selection
  const handleSelectPatient = async (id: string) => {
    setSelectedPatientId(id);
    setShowSuggestions(false);
    const { data } = await supabase.from("patient_details").select("*").eq("id", id).single();
    if (data) {
      setFormData(data);
      setSearchTerm(`${data.patient_name} — ${data.patient_id_hospital}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">🧑‍⚕️ Patient Details</h1>

      <div className="mb-4 text-center font-semibold text-gray-700">
        {selectedPatientId ? "✅ Existing Patient Selected" : "🆕 New Patient Entry"}
      </div>

      {/* Search */}
      <div className="relative mb-4 w-full max-w-xl">
        <input
          type="text"
          placeholder="Search patient by name or Hospital ID..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          className="border border-gray-400 text-gray-800 rounded p-2 w-full"
        />
        <button
          type="button"
          onClick={resetForm}
          className="absolute right-2 top-2 bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
        >
          + Add New
        </button>

        {showSuggestions && searchTerm.length > 0 && (
          <ul className="absolute z-10 bg-white border rounded w-full mt-1 max-h-48 overflow-y-auto shadow-lg">
            {filteredPatients.length > 0 ? (
              filteredPatients.map((p) => (
                <li
                  key={p.id}
                  onClick={() => handleSelectPatient(p.id)}
                  className="p-2 cursor-pointer hover:bg-gray-100 text-gray-800"
                >
                  {p.patient_name} — {p.patient_id_hospital}
                </li>
              ))
            ) : (
              <li className="p-2 text-gray-500">No results found</li>
            )}
          </ul>
        )}
      </div>

      {/* Form */}
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
          className="border border-gray-400 text-gray-800 rounded p-2 w-full"
        />
        <input
          type="text"
          name="patient_id_hospital"
          placeholder="Hospital ID"
          value={formData.patient_id_hospital}
          onChange={handleChange}
          className="border border-gray-400 text-gray-800 rounded p-2 w-full"
        />
        <input
          type="number"
          name="age"
          placeholder="Age"
          value={formData.age}
          onChange={handleChange}
          className="border border-gray-400 text-gray-800 rounded p-2 w-full"
        />
        <select
          name="sex"
          value={formData.sex}
          onChange={handleChange}
          className="border border-gray-400 text-gray-800 rounded p-2 w-full"
        >
          <option value="">Select Sex</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>

        <label className="font-semibold text-gray-800">Date of Admission</label>
        <input
          type="date"
          name="admission_date"
          value={formData.admission_date}
          onChange={handleChange}
          className="border border-gray-400 text-gray-800 rounded p-2 w-full"
        />
        <label className="font-semibold text-gray-800">Date of Discharge</label>
        <input
          type="date"
          name="discharge_date"
          value={formData.discharge_date}
          onChange={handleChange}
          className="border border-gray-400 text-gray-800 rounded p-2 w-full"
        />

        <input
          type="text"
          name="study_type"
          placeholder="Study Type"
          value={formData.study_type}
          readOnly
          className="border border-gray-400 text-gray-800 rounded p-2 w-full bg-gray-100"
        />
        <input
          type="text"
          name="hospital_stay"
          placeholder="Hospital Stay"
          value={formData.hospital_stay}
          readOnly
          className="border border-gray-400 text-gray-800 rounded p-2 w-full bg-gray-100"
        />

        <select
          name="procedure_type"
          value={formData.procedure_type}
          onChange={handleChange}
          className="border border-gray-400 text-gray-800 rounded p-2 w-full"
        >
          <option value="">Select Procedure</option>
          <option value="CAG">CAG</option>
          <option value="PTCA">PTCA</option>
          <option value="CAG + PTCA">CAG + PTCA</option>
        </select>

        <label className="font-semibold text-gray-800">CAG Date & Time</label>
        <input
          type="date"
          name="procedure_date_cag"
          value={formData.procedure_date_cag}
          onChange={handleChange}
          className="border border-gray-400 text-gray-800 rounded p-2 w-full"
        />
        <input
          type="time"
          name="procedure_time_cag"
          value={formData.procedure_time_cag}
          onChange={handleChange}
          className="border border-gray-400 text-gray-800 rounded p-2 w-full"
        />

        <label className="font-semibold text-gray-800">PTCA Date & Time</label>
        <input
          type="date"
          name="procedure_date_ptca"
          value={formData.procedure_date_ptca}
          onChange={handleChange}
          className="border border-gray-400 text-gray-800 rounded p-2 w-full"
        />
        <input
          type="time"
          name="procedure_time_ptca"
          value={formData.procedure_time_ptca}
          onChange={handleChange}
          className="border border-gray-400 text-gray-800 rounded p-2 w-full"
        />

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded w-full hover:bg-blue-700"
        >
          {loading
            ? "Saving..."
            : selectedPatientId
            ? "Select Existing Patient"
            : "Save New Patient"}
        </button>

        {message && <p className="text-center text-sm mt-2 text-gray-800">{message}</p>}
      </form>
    </div>
  );
}
