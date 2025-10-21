"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Patient {
  id: string;
  patient_name: string;
  ipd_number: string;
}

export default function PatientDetailsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    patient_name: "",
    ipd_number: "",
    age: "",
    sex: "",
    admission_date: "",
    admission_time: "",
    discharge_date: "",
    discharge_time: "",
    procedure_type: "",
    procedure_date_cag: "",
    procedure_time_cag: "",
    procedure_date_ptca: "",
    procedure_time_ptca: "",
    study_type: "",
    hospital_stay_days: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Load patient list
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("patient_details")
        .select("id, patient_name, ipd_number")
        .order("patient_name");
      if (data) setPatients(data);
    })();
  }, []);

  const filteredPatients = patients.filter(
    (p) =>
      p.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.ipd_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 🧮 Auto calculate study type + stay days
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let updated = { ...formData, [name]: value };

    if (name === "admission_date") {
      const admissionDate = new Date(value);
      const cutoff = new Date("2025-10-06");
      updated.study_type = admissionDate >= cutoff ? "Prospective" : "Retrospective";
    }

    // calculate hospital stay
    if (updated.admission_date && updated.discharge_date) {
      const a = new Date(`${updated.admission_date}T${updated.admission_time || "00:00"}`);
      const d = new Date(`${updated.discharge_date}T${updated.discharge_time || "00:00"}`);
      const days = Math.ceil((d.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
      updated.hospital_stay_days = isNaN(days) ? "" : days.toString();
    }

    setFormData(updated);
  };

  // 🕒 Combine date + time to ISO
  const toDateTime = (d: string, t: string) => {
    if (!d) return null;
    return t ? `${d}T${t}` : `${d}T00:00`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (selectedPatientId) {
      setMessage("✅ Existing patient selected. No new row created.");
      setLoading(false);
      return;
    }

    const admission_datetime = toDateTime(formData.admission_date, formData.admission_time);
    const discharge_datetime = toDateTime(formData.discharge_date, formData.discharge_time);
    const procedure_datetime_cag = toDateTime(formData.procedure_date_cag, formData.procedure_time_cag);
    const procedure_datetime_ptca = toDateTime(formData.procedure_date_ptca, formData.procedure_time_ptca);

    const payload = {
      ipd_number: formData.ipd_number,
      patient_name: formData.patient_name,
      age: formData.age ? Number(formData.age) : null,
      sex: formData.sex,
      admission_datetime,
      discharge_datetime,
      hospital_stay_days: formData.hospital_stay_days
        ? Number(formData.hospital_stay_days)
        : null,
      study_type: formData.study_type,
      procedure_type: formData.procedure_type,
      procedure_datetime_cag,
      procedure_datetime_ptca,
    };

    const { error } = await supabase.from("patient_details").insert([payload]);

    setLoading(false);
    if (error) {
      console.error(error);
      setMessage(`❌ Failed to save patient: ${error.message}`);
    } else {
      setMessage("✅ Patient saved successfully!");
      setFormData({
        patient_name: "",
        ipd_number: "",
        age: "",
        sex: "",
        admission_date: "",
        admission_time: "",
        discharge_date: "",
        discharge_time: "",
        procedure_type: "",
        procedure_date_cag: "",
        procedure_time_cag: "",
        procedure_date_ptca: "",
        procedure_time_ptca: "",
        study_type: "",
        hospital_stay_days: "",
      });
    }
  };

  const handleSelectPatient = async (id: string) => {
    setSelectedPatientId(id);
    setShowSuggestions(false);
    const { data } = await supabase.from("patient_details").select("*").eq("id", id).single();
    if (data) {
      setFormData({
        patient_name: data.patient_name || "",
        ipd_number: data.ipd_number || "",
        age: data.age?.toString() || "",
        sex: data.sex || "",
        admission_date: data.admission_datetime?.split("T")[0] || "",
        admission_time: data.admission_datetime?.split("T")[1]?.slice(0, 5) || "",
        discharge_date: data.discharge_datetime?.split("T")[0] || "",
        discharge_time: data.discharge_datetime?.split("T")[1]?.slice(0, 5) || "",
        procedure_type: data.procedure_type || "",
        procedure_date_cag: data.procedure_datetime_cag?.split("T")[0] || "",
        procedure_time_cag: data.procedure_datetime_cag?.split("T")[1]?.slice(0, 5) || "",
        procedure_date_ptca: data.procedure_datetime_ptca?.split("T")[0] || "",
        procedure_time_ptca: data.procedure_datetime_ptca?.split("T")[1]?.slice(0, 5) || "",
        study_type: data.study_type || "",
        hospital_stay_days: data.hospital_stay_days?.toString() || "",
      });
      setSearchTerm(`${data.patient_name} — ${data.ipd_number}`);
    }
  };

  const resetForm = () => {
    setSelectedPatientId(null);
    setSearchTerm("");
    setFormData({
      patient_name: "",
      ipd_number: "",
      age: "",
      sex: "",
      admission_date: "",
      admission_time: "",
      discharge_date: "",
      discharge_time: "",
      procedure_type: "",
      procedure_date_cag: "",
      procedure_time_cag: "",
      procedure_date_ptca: "",
      procedure_time_ptca: "",
      study_type: "",
      hospital_stay_days: "",
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">🧑‍⚕️ Patient Details</h1>

      <div className="mb-3 text-center font-semibold text-gray-700">
        {selectedPatientId ? "✅ Existing Patient Selected" : "🆕 New Patient Entry"}
      </div>

      {/* Search box */}
      <div className="relative mb-4 w-full max-w-xl">
        <input
          type="text"
          placeholder="Search patient by name or IPD..."
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

        {showSuggestions && searchTerm && (
          <ul className="absolute z-10 bg-white border rounded w-full mt-1 max-h-48 overflow-y-auto shadow-lg">
            {filteredPatients.length ? (
              filteredPatients.map((p) => (
                <li
                  key={p.id}
                  className="p-2 cursor-pointer hover:bg-gray-100 text-gray-800"
                  onClick={() => handleSelectPatient(p.id)}
                >
                  {p.patient_name} — {p.ipd_number}
                </li>
              ))
            ) : (
              <li className="p-2 text-gray-500">No results</li>
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
          name="ipd_number"
          placeholder="IPD Number"
          value={formData.ipd_number}
          onChange={handleChange}
          required
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
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>

        <label className="font-semibold text-gray-800">Admission Date & Time</label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            name="admission_date"
            value={formData.admission_date}
            onChange={handleChange}
            className="border border-gray-400 text-gray-800 rounded p-2 w-full"
          />
          <input
            type="time"
            name="admission_time"
            value={formData.admission_time}
            onChange={handleChange}
            className="border border-gray-400 text-gray-800 rounded p-2 w-full"
          />
        </div>

        <label className="font-semibold text-gray-800">Discharge Date & Time</label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            name="discharge_date"
            value={formData.discharge_date}
            onChange={handleChange}
            className="border border-gray-400 text-gray-800 rounded p-2 w-full"
          />
          <input
            type="time"
            name="discharge_time"
            value={formData.discharge_time}
            onChange={handleChange}
            className="border border-gray-400 text-gray-800 rounded p-2 w-full"
          />
        </div>

        <input
          type="text"
          name="study_type"
          placeholder="Study Type"
          value={formData.study_type}
          readOnly
          className="border border-gray-300 bg-gray-100 text-gray-800 rounded p-2 w-full"
        />
        <input
          type="text"
          name="hospital_stay_days"
          placeholder="Hospital Stay (days)"
          value={formData.hospital_stay_days}
          readOnly
          className="border border-gray-300 bg-gray-100 text-gray-800 rounded p-2 w-full"
        />

        <select
          name="procedure_type"
          value={formData.procedure_type}
          onChange={handleChange}
          required
          className="border border-gray-400 text-gray-800 rounded p-2 w-full"
        >
          <option value="">Select Procedure</option>
          <option value="CAG">CAG</option>
          <option value="PTCA">PTCA</option>
          <option value="CAG + PTCA">CAG + PTCA</option>
        </select>

        <label className="font-semibold text-gray-800">CAG Date & Time</label>
        <div className="grid grid-cols-2 gap-2">
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
        </div>

        <label className="font-semibold text-gray-800">PTCA Date & Time</label>
        <div className="grid grid-cols-2 gap-2">
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
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded w-full hover:bg-blue-700"
        >
          {loading ? "Saving..." : selectedPatientId ? "Existing Patient Selected" : "Save Patient"}
        </button>

        {message && <p className="text-center text-sm mt-2 text-gray-800">{message}</p>}
      </form>
    </div>
  );
}
