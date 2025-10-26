"use client";
import Link from "next/link";

export default function Home() {
  const sections = [
    { name: "🧑‍⚕️ Patient Details", path: "/patient" },
    { name: "🩺 On Arrival Vitals", path: "/vitals" },
    { name: "🩺 Chief Complaints & Diagnosis", path: "/chief-complaints-diagnosis" },
    { name: "📜 History", path: "/history" },
    { name: "💊 Past Medication History", path: "/past-medications" },
    { name: "🧪 Lab Reports", path: "/labs" },
    { name: "💊 Medications", path: "/medications" },
    { name: "🩺 BP & 💧 Fluids", path: "/bp-fluids" },
    { name: "🫀 Procedures", path: "/procedures" },
    { name: "🧠 Hemodynamics", path: "/hemodynamics" },
    { name: "📈 Scores", path: "/scores" },
    { name: "📌 CIN Definitions", path: "/definitions" },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center p-6">
      <h1 className="text-3xl font-extrabold mb-8 text-gray-800 text-center">
        📊 CIN Risk Score Data Collection App
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full">
        {sections.map((section, idx) => (
          <Link
            key={idx}
            href={section.path}
            className="bg-white rounded-xl shadow-lg p-6 text-center hover:bg-blue-50 transition border border-gray-300"
          >
            <span className="text-xl font-semibold text-gray-800">{section.name}</span>
          </Link>
        ))}
      </div>

      <footer className="mt-10 text-sm text-gray-500">
        Made with ❤️ by MIMA
      </footer>
    </div>
  );
}
