"use client";
import Link from "next/link";

export default function Home() {
  const sections = [
    { name: "🧑‍⚕️ Patient Details", path: "/patient" },
    { name: "📜 History", path: "/history" },
    { name: "🩺 Vitals & Monitoring", path: "/vitals" },
    { name: "🧪 Lab Reports", path: "/labs" },
    { name: "💊 Medications", path: "/medications" },
    { name: "🫀 Procedures", path: "/procedures" },
    { name: "🧠 Hemodynamics", path: "/hemodynamics" },
    { name: "📈 Scores", path: "/scores" },
    { name: "📌 CIN Definitions", path: "/definitions" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">
        📊 CIN Risk Score Data Collection App
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full">
        {sections.map((section, idx) => (
          <Link
            key={idx}
            href={section.path}
            className="bg-white rounded-xl shadow-md p-6 text-center hover:bg-blue-100 transition border border-gray-200"
          >
            <span className="text-lg font-semibold">{section.name}</span>
          </Link>
        ))}
      </div>

      <footer className="mt-10 text-sm text-gray-500">
        Made with ❤️ for CIN Study Project
      </footer>
    </div>
  );
}
