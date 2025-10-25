'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// ---------- Supabase client ----------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---------- Types ----------
type Patient = {
  id: string;
  patient_name: string;
  ipd_number: string;
  procedure_datetime_cag: string | null;
  procedure_datetime_ptca: string | null;
};

type MedicationMasterRow = {
  id: string;
  drug_name: string;
  drug_class: string;
  route?: string | null;               // <-- ADDED route
  is_nephrotoxic: boolean;
  is_preventive: boolean;
};

type LocalAdminRow = {
  // client-side only id (for duplicates/unsaved rows)
  _clientId: string;
  // db id if exists (medication_administration.id)
  id?: string | null;
  medication_id?: string | null; // will be filled by mapping from master
  drug_name: string;
  drug_class: string;
  route?: string | null;         // <-- ADDED route
  is_nephrotoxic: boolean;
  is_preventive: boolean;
  dose: string;
  frequency: string;
  // booleans for 7 day columns
  dayChecks: boolean[]; // length 7
  saved?: boolean; // indicates row already persisted
};

// ---------- DRUG LIST (hardcoded UI order & grouping) exactly as your SQL seed ----------
const DRUG_LIST = [
  {
    class: "NSAIDs",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      "Diclofenac","Ibuprofen","Naproxen","Indomethacin","Ketorolac","Piroxicam",
      "Etoricoxib","Celecoxib","Aceclofenac","Meloxicam","Lornoxicam","Nabumetone","Parecoxib"
    ]
  },
  {
    class: "ACEI / ARB / RAAS",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      "Captopril","Enalapril","Lisinopril","Ramipril","Perindopril","Losartan",
      "Valsartan","Telmisartan","Olmesartan","Candesartan","Irbesartan",
      "Sacubitril/Valsartan","Aliskiren"
    ]
  },
  {
    class: "Diuretics",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      "Furosemide","Torsemide","Bumetanide","Hydrochlorothiazide",
      "Chlorthalidone","Indapamide","Metolazone"
    ]
  },
  {
    class: "Aminoglycosides",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: ["Gentamicin","Amikacin","Tobramycin","Netilmicin","Neomycin"]
  },
  {
    class: "Nephrotoxic Antibiotics/Others",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      "Vancomycin","Piperacillin-Tazobactam","Acyclovir","Ganciclovir","Foscarnet","Cidofovir",
      "Tenofovir","Adefovir","Trimethoprim-Sulfamethoxazole","Methicillin","Nafcillin","Oxacillin",
      "Cefazolin","Amphotericin B"
    ]
  },
  {
    class: "Antineoplastics / Immunosuppressants",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      "Cisplatin","Carboplatin","Oxaliplatin","Ifosfamide","Methotrexate",
      "Cyclophosphamide","Mitomycin C","Cyclosporine","Tacrolimus"
    ]
  },
  {
    class: "Others (Nephrotoxic)",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: ["Lithium","Daptomycin"]
  },
  {
    class: "Preventive Measures",
    is_nephrotoxic: false,
    is_preventive: true,
    drugs: [
      "0.9% Normal Saline","Sodium Bicarbonate","N-Acetylcysteine","Ascorbic Acid",
      "Atorvastatin","Rosuvastatin","Hold NSAIDs","Hold ACEI/ARB","Hold Diuretics",
      "Hold Metformin","Iso-osmolar contrast use","Minimize contrast volume",
      "Avoid repeat contrast within 48-72h","Radial access"
    ]
  }
];

// ---------- Helpers ----------
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

function classifyTimingLabel(dateISO: string, procISO: string | null, tag: 'CAG' | 'PTCA') {
  if (!procISO) return null;
  const sel = new Date(dateISO + 'T00:00:00');
  const proc = new Date(procISO);
  const procDate = new Date(proc.getFullYear(), proc.getMonth(), proc.getDate());
  const diff = Math.round((sel.getTime() - procDate.getTime()) / (24 * 60 * 60 * 1000));
  if (diff < 0) return `Pre ${tag}`;
  if (diff === 0) return `0–24 ${tag}`;
  if (diff === 1) return `48 ${tag}`;
  if (diff === 2) return `72 ${tag}`;
  return null;
}
const chipClass = (label: string) => {
  if (!label) return 'bg-gray-200 text-gray-900 border-gray-400';
  if (label.startsWith('Pre')) return 'bg-green-200 text-green-900 border-green-600';
  if (label.startsWith('0–24')) return 'bg-yellow-200 text-yellow-900 border-yellow-600';
  if (label.startsWith('48')) return 'bg-orange-200 text-orange-900 border-orange-600';
  if (label.startsWith('72')) return 'bg-red-200 text-red-900 border-red-600';
  return 'bg-gray-200 text-gray-900 border-gray-400';
};

// map day index (0..6) to db field name
const dayFieldName = (i: number) => `day${i + 1}`;

// ---------- Page Component ----------
export default function MedicationsPage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [masterMap, setMasterMap] = useState<Record<string, MedicationMasterRow | undefined>>({});
  const [localRows, setLocalRows] = useState<LocalAdminRow[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [remoteSummary, setRemoteSummary] = useState<any | null>(null);

  // Load active patient and master meds mapping
  useEffect(() => {
    (async () => {
      // active patient pattern from your labs file
      const userId = '00000000-0000-0000-0000-000000000001';
      const { data: active } = await supabase
        .from('active_patient')
        .select('patient_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (!active?.patient_id) return;

      const { data: p } = await supabase
        .from('patient_details')
        .select('id, patient_name, ipd_number, procedure_datetime_cag, procedure_datetime_ptca')
        .eq('id', active.patient_id)
        .single();
      if (p) setPatient(p);

      // fetch medications_master to map names -> ids (INCLUDE route)
      const { data: masters } = await supabase
        .from('medications_master')
        .select('id, drug_name, drug_class, route, is_nephrotoxic, is_preventive');
      const map: Record<string, MedicationMasterRow | undefined> = {};
      (masters || []).forEach((m: any) => {
        map[m.drug_name.trim()] = {
          id: m.id,
          drug_name: m.drug_name,
          drug_class: m.drug_class,
          route: m.route ?? null, // <-- map route
          is_nephrotoxic: m.is_nephrotoxic,
          is_preventive: m.is_preventive
        };
      });
      setMasterMap(map);

      // load existing administration rows for this patient (map them to localRows)
      if (active?.patient_id) {
        const { data: admins } = await supabase
          .from('medication_administration')
          .select('*')
          .eq('patient_id', active.patient_id);
        const parsed: LocalAdminRow[] = (admins || []).map((a: any) => {
          const dayChecks = [1,2,3,4,5,6,7].map(i => !!a[`day${i}`]);
          const foundMaster = Object.values(map).find(mm => mm?.id === a.medication_id);
          return {
            _clientId: `db-${a.id}`,
            id: a.id,
            medication_id: a.medication_id,
            drug_name: foundMaster?.drug_name || (a.drug_name ?? 'Unknown'),
            drug_class: a.drug_class ?? foundMaster?.drug_class ?? '',
            route: foundMaster?.route ?? a.route ?? null, // <-- include route mapping
            is_nephrotoxic: a.is_nephrotoxic ?? foundMaster?.is_nephrotoxic ?? false,
            is_preventive: a.is_preventive ?? foundMaster?.is_preventive ?? false,
            dose: a.dose ?? '',
            frequency: a.frequency ?? '',
            dayChecks,
            saved: true,
          };
        });
        setLocalRows(parsed);
        // load remote summary for this patient
        const { data: s } = await supabase
          .from('medication_summary_per_patient')
          .select('*')
          .eq('patient_id', active.patient_id)
          .maybeSingle();
        setRemoteSummary(s || null);
      }
    })();
  }, []);

  // Date window: 7 columns relative to earliest procedure date (or admission fallback)
  const dateOptions = useMemo(() => {
    if (!patient) return [];
    const cag = patient.procedure_datetime_cag ? new Date(patient.procedure_datetime_cag) : null;
    const ptca = patient.procedure_datetime_ptca ? new Date(patient.procedure_datetime_ptca) : null;
    const earliest = cag && ptca ? (cag < ptca ? cag : ptca) : cag || ptca || new Date();
    const arr: string[] = [];
    // include one day before (index 0) then next 6 days -> total 7
    for (let i = -1; i <= 5; i++) {
      const d = new Date(earliest);
      d.setDate(earliest.getDate() + i);
      arr.push(fmtDate(d));
    }
    return arr;
  }, [patient]);

  // Filtered group view for UI according to search
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return DRUG_LIST;
    const q = search.trim().toLowerCase();
    return DRUG_LIST.map(g => ({
      ...g,
      drugs: g.drugs.filter(d => d.toLowerCase().includes(q) || g.class.toLowerCase().includes(q))
    })).filter(g => g.drugs.length > 0);
  }, [search]);

  // Helpers to read/write localRows
  const findRowIndex = (drugName: string, idxInstance = 0) => {
    // idxInstance helps target nth existing row for same drug; default first
    let count = 0;
    for (let i = 0; i < localRows.length; i++) {
      if (localRows[i].drug_name === drugName) {
        if (count === idxInstance) return i;
        count++;
      }
    }
    return -1;
  };

  function addEmptyRowForDrug(drugName: string, drugClass: string, isNeph: boolean, isPrev: boolean) {
    const newRow: LocalAdminRow = {
      _clientId: `c-${crypto.randomUUID()}`,
      id: null,
      medication_id: masterMap[drugName]?.id ?? null,    // ensure medication_id attached
      drug_name: drugName,
      drug_class: drugClass,
      route: masterMap[drugName]?.route ?? null,         // ensure route attached
      is_nephrotoxic: isNeph,
      is_preventive: isPrev,
      dose: '',
      frequency: '',
      dayChecks: [false,false,false,false,false,false,false],
      saved: false,
    };
    setLocalRows(prev => [...prev, newRow]);
  }

  function duplicateRow(drugName: string, drugClass: string, isNeph: boolean, isPrev: boolean) {
    // duplication: simply add a new empty row for that drug (as user requested)
    addEmptyRowForDrug(drugName, drugClass, isNeph, isPrev);
  }

  function toggleCheckboxForRow(clientId: string, colIndex: number) {
    setLocalRows(prev => prev.map(r => r._clientId === clientId ? { ...r, dayChecks: r.dayChecks.map((v,i)=> i===colIndex ? !v : v) } : r));
  }

  function setDoseForRow(clientId: string, val: string) {
    setLocalRows(prev => prev.map(r => r._clientId === clientId ? { ...r, dose: val } : r));
  }
  function setFreqForRow(clientId: string, val: string) {
    setLocalRows(prev => prev.map(r => r._clientId === clientId ? { ...r, frequency: val } : r));
  }

  // Delete a local row (if saved -> delete in DB)
  async function deleteRow(clientId: string) {
    const row = localRows.find(r => r._clientId === clientId);
    if (!row) return;
    if (row.saved && row.id) {
      // delete in DB
      await supabase.from('medication_administration').delete().eq('id', row.id);
    }
    setLocalRows(prev => prev.filter(r => r._clientId !== clientId));
    // refresh remote summary
    if (patient) {
      const { data } = await supabase.from('medication_summary_per_patient').select('*').eq('patient_id', patient.id).maybeSingle();
      setRemoteSummary(data || null);
    }
  }

  // When user clicks a quick checkbox on a master row (no duplicate selected row exists),
  // create/modify the first local row for that drug (makes UI behave like ticking on CRF).
  function handleMasterRowToggle(drugName: string, drugClass: string, isNeph: boolean, isPrev: boolean, colIndex: number) {
    // find first local row for this drug; if none, create one then toggle
    const idx = findRowIndex(drugName, 0);
    if (idx === -1) {
      const newRow: LocalAdminRow = {
        _clientId: `c-${crypto.randomUUID()}`,
        id: null,
        medication_id: masterMap[drugName]?.id ?? null,
        drug_name: drugName,
        drug_class: drugClass,
        route: masterMap[drugName]?.route ?? null,
        is_nephrotoxic: isNeph,
        is_preventive: isPrev,
        dose: '',
        frequency: '',
        dayChecks: [false,false,false,false,false,false,false],
        saved: false,
      };
      newRow.dayChecks[colIndex] = true;
      setLocalRows(prev => [...prev, newRow]);
      return;
    }
    const clientId = localRows[idx]._clientId;
    toggleCheckboxForRow(clientId, colIndex);
  }

  // Save all localRows -> medication_administration in DB
  async function saveAll() {
    if (!patient) return;
    setSaving(true);

    // VALIDATION: ensure every row has a medication_id (either stored or available in masterMap)
    const missingMasters: string[] = [];
    for (const r of localRows) {
      const mappedId = r.medication_id ?? masterMap[r.drug_name]?.id ?? null;
      if (!mappedId) {
        if (!missingMasters.includes(r.drug_name)) missingMasters.push(r.drug_name);
      }
    }
    if (missingMasters.length > 0) {
      setSaving(false);
      alert(`Cannot save — master IDs missing for: ${missingMasters.join(', ')}\n\nFix medications_master entries or correct spelling in DRUG_LIST.`);
      console.error('Missing masterMap entries for:', missingMasters);
      return;
    }

    // Build upsert payload: map each local row to medication_administration fields
    // day1..day7 booleans come from dayChecks array
    const payload = localRows.map(r => {
      // map drug_name -> medication_id if possible
      const medication_id = r.medication_id ?? masterMap[r.drug_name]?.id ?? null;
      const rowPayload: any = {
        patient_id: patient.id,
        medication_id,
        dose: r.dose || null,
        frequency: r.frequency || null,
        drug_class: r.drug_class,
        is_nephrotoxic: r.is_nephrotoxic,
        is_preventive: r.is_preventive,
        // NOTE: route is kept in frontend rows but not sent to DB to avoid schema mismatch;
        // if you want to persist route, ensure a route column exists and add it here.
      };
      for (let i = 0; i < 7; i++) {
        rowPayload[`day${i+1}`] = !!r.dayChecks[i];
      }
      // include id to update if exists
      if (r.id) rowPayload.id = r.id;
      return rowPayload;
    });

    // Upsert. Note: medication_administration has id primary key (uuid) and medication_id fk.
    try {
      // Use insert for new rows and update for existing rows to avoid primary key conflict complexity:
      // 1) Update existing rows
      for (const r of payload.filter(p => p.id)) {
        const id = r.id;
        const { error } = await supabase.from('medication_administration').update(r).eq('id', id);
        if (error) console.error('update err', error);
      }
      // 2) Insert new rows (those without id)
      const inserts = payload.filter(p => !p.id);
      if (inserts.length > 0) {
        const { error } = await supabase.from('medication_administration').insert(inserts);
        if (error) console.error('insert err', error);
      }
      // After save, reload local rows from DB to sync ids & saved flags
      const { data: admins } = await supabase.from('medication_administration').select('*').eq('patient_id', patient.id);
      const newLocal = (admins || []).map((a: any) => {
        const found = Object.values(masterMap).find(x => x?.id === a.medication_id);
        return {
          _clientId: `db-${a.id}`,
          id: a.id,
          medication_id: a.medication_id,
          drug_name: found?.drug_name ?? (a.drug_name ?? 'Unknown'),
          drug_class: a.drug_class ?? found?.drug_class ?? '',
          route: found?.route ?? a.route ?? null, // keep route in synced rows
          is_nephrotoxic: a.is_nephrotoxic ?? found?.is_nephrotoxic ?? false,
          is_preventive: a.is_preventive ?? found?.is_preventive ?? false,
          dose: a.dose ?? '',
          frequency: a.frequency ?? '',
          dayChecks: [1,2,3,4,5,6,7].map(i => !!a[`day${i}`]),
          saved: true
        } as LocalAdminRow;
      }) as LocalAdminRow[];
      setLocalRows(newLocal);
      // reload remote summary
      const { data: summary } = await supabase.from('medication_summary_per_patient').select('*').eq('patient_id', patient.id).maybeSingle();
      setRemoteSummary(summary || null);
    } catch (err) {
      console.error('SaveAll err', err);
      alert('Save failed — check console');
    } finally {
      setSaving(false);
    }
  }

  // Local summary computed from localRows (so UI reacts before server save)
  const localSummary = useMemo(() => {
    const buckets: Record<string, number> = {
      pre_cag: 0, cag_0_24: 0, cag_48: 0, cag_72: 0,
      pre_ptca: 0, ptca_0_24: 0, ptca_48: 0, ptca_72: 0,
      prev_pre_cag: 0, prev_cag_0_24: 0, prev_cag_48: 0, prev_cag_72: 0,
      prev_pre_ptca: 0, prev_ptca_0_24: 0, prev_ptca_48: 0, prev_ptca_72: 0
    };

    for (const r of localRows) {
      for (let i = 0; i < (dateOptions.length || 0); i++) {
        if (!r.dayChecks[i]) continue;
        const date = dateOptions[i];
        const cLab = classifyTimingLabel(date, patient?.procedure_datetime_cag ?? null, 'CAG');
        const pLab = classifyTimingLabel(date, patient?.procedure_datetime_ptca ?? null, 'PTCA');
        if (r.is_nephrotoxic) {
          if (cLab === 'Pre CAG') buckets.pre_cag++;
          if (cLab === '0–24 CAG') buckets.cag_0_24++;
          if (cLab === '48 CAG') buckets.cag_48++;
          if (cLab === '72 CAG') buckets.cag_72++;
          if (pLab === 'Pre PTCA') buckets.pre_ptca++;
          if (pLab === '0–24 PTCA') buckets.ptca_0_24++;
          if (pLab === '48 PTCA') buckets.ptca_48++;
          if (pLab === '72 PTCA') buckets.ptca_72++;
        }
        if (r.is_preventive) {
          if (cLab === 'Pre CAG') buckets.prev_pre_cag++;
          if (cLab === '0–24 CAG') buckets.prev_cag_0_24++;
          if (cLab === '48 CAG') buckets.prev_cag_48++;
          if (cLab === '72 CAG') buckets.prev_cag_72++;
          if (pLab === 'Pre PTCA') buckets.prev_pre_ptca++;
          if (pLab === '0–24 PTCA') buckets.prev_ptca_0_24++;
          if (pLab === '48 PTCA') buckets.prev_ptca_48++;
          if (pLab === '72 PTCA') buckets.prev_ptca_72++;
        }
      }
    }
    return buckets;
  }, [localRows, dateOptions, patient]);

  return (
    <div className="min-h-screen bg-gray-100 p-5 flex flex-col items-center">
      <h1 className="text-3xl font-extrabold mb-4 text-gray-900">💊 Medications</h1>

      {patient && (
        <div className="bg-blue-50 border border-blue-200 rounded w-full max-w-6xl p-3 mb-4 text-gray-900">
          <strong>Patient:</strong> {patient.patient_name} — <strong>IPD:</strong> {patient.ipd_number}
        </div>
      )}

      <div className="w-full max-w-6xl mb-3">
        <input
          type="text"
          placeholder="🔍 Search drug or class..."
          className="w-full p-2 border rounded text-gray-900 border-gray-400"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-auto w-full max-w-6xl bg-white rounded shadow">
        <table className="w-full text-sm text-gray-900">
          <thead className="bg-gray-300 sticky top-0">
            <tr>
              <th className="p-2 text-left text-gray-900">Drug</th>
              <th className="p-2 text-gray-900">Route</th> {/* <-- ADDED Route header */}
              <th className="p-2 text-gray-900">Dose</th>
              <th className="p-2 text-gray-900">Freq</th>
              {dateOptions.map(d => <th key={d} className="p-2 whitespace-nowrap text-gray-900 font-semibold">{d}</th>)}
              <th className="p-2 text-gray-900">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredGroups.map(group => (
              <React.Fragment key={group.class}>
                <tr className="bg-gray-200 font-bold text-gray-900">
                  {/* UPDATED colSpan to account for Route column (now 5 fixed cols + date columns) */}
                  <td colSpan={5 + dateOptions.length} className="p-2">{group.class}</td>
                </tr>

                {group.drugs.map(drugName => {
                  // show all saved rows for this drug (duplicates), then a blank quick row if none saved
                  const rowsForDrug = localRows.filter(r => r.drug_name === drugName);
                  // if none exist, show one blank "virtual" row that uses quick toggles
                  if (rowsForDrug.length === 0) {
                    // quick UI row (client-only until saved)
                    const sampleMaster = masterMap[drugName.trim()];
                    const isNeph = sampleMaster?.is_nephrotoxic ?? group.is_nephrotoxic;
                    const isPrev = sampleMaster?.is_preventive ?? group.is_preventive;
                    return (
                      <tr key={drugName} className={`${isNeph ? 'bg-red-50' : isPrev ? 'bg-green-50' : ''}`}>
                        <td className="p-2 text-gray-900 font-medium">
                          {drugName}
                          {!sampleMaster && <span className="ml-2 text-xs text-red-700"> (master not found)</span>}
                        </td>
                        <td className="p-1 text-gray-900">{sampleMaster?.route ?? '-'}</td> {/* <-- show route */}
                        <td className="p-1 text-gray-900">-</td>
                        <td className="p-1 text-gray-900">-</td>
                        {dateOptions.map((d, i) => {
                          const cagLabel = classifyTimingLabel(d, patient?.procedure_datetime_cag ?? null, 'CAG');
                          const ptcaLabel = classifyTimingLabel(d, patient?.procedure_datetime_ptca ?? null, 'PTCA');
                          return (
                            <td key={d} className="p-1 text-center">
                              <input type="checkbox" onChange={() => handleMasterRowToggle(drugName, group.class, isNeph, isPrev, i)} />
                              <div className="mt-1 text-xs flex flex-col gap-1 items-center">
                                {cagLabel && <span className={`px-1 rounded text-xs font-semibold ${chipClass(cagLabel)}`}>{cagLabel}</span>}
                                {ptcaLabel && <span className={`px-1 rounded text-xs font-semibold ${chipClass(ptcaLabel)}`}>{ptcaLabel}</span>}
                              </div>
                            </td>
                          );
                        })}
                        <td className="p-1">
                          <button className="btn btn-xs btn-outline" onClick={() => duplicateRow(drugName, group.class, isNeph, isPrev)}>➕</button>
                        </td>
                      </tr>
                    );
                  }

                  // render each saved or unsaved row for this drug
                  return rowsForDrug.map(r => (
                    <tr key={r._clientId} className={`${r.is_nephrotoxic ? 'bg-red-50' : r.is_preventive ? 'bg-green-50' : ''}`}>
                      <td className="p-2 text-gray-900 font-medium">
                        {r.drug_name}
                        {!r.medication_id && <span className="ml-2 text-xs text-red-700">(no master id)</span>}
                      </td>
                      <td className="p-1 text-gray-900">{r.route ?? '-'}</td> {/* <-- show route */}
                      <td className="p-1">
                        <input
                          className="border p-1 rounded w-full text-sm text-gray-900 border-gray-400"
                          value={r.dose}
                          onChange={(e) => setDoseForRow(r._clientId, e.target.value)}
                        />
                      </td>
                      <td className="p-1">
                        <input
                          className="border p-1 rounded w-full text-sm text-gray-900 border-gray-400"
                          value={r.frequency}
                          onChange={(e) => setFreqForRow(r._clientId, e.target.value)}
                        />
                      </td>

                      {dateOptions.map((d, i) => {
                        const cagLabel = classifyTimingLabel(d, patient?.procedure_datetime_cag ?? null, 'CAG');
                        const ptcaLabel = classifyTimingLabel(d, patient?.procedure_datetime_ptca ?? null, 'PTCA');
                        return (
                          <td key={d} className="p-1 text-center align-top">
                            <input type="checkbox" checked={!!r.dayChecks[i]} onChange={() => toggleCheckboxForRow(r._clientId, i)} />
                            <div className="mt-1 text-xs flex flex-col gap-1 items-center">
                              {cagLabel && <span className={`px-1 rounded text-xs font-semibold ${chipClass(cagLabel)}`}>{cagLabel}</span>}
                              {ptcaLabel && <span className={`px-1 rounded text-xs font-semibold ${chipClass(ptcaLabel)}`}>{ptcaLabel}</span>}
                            </div>
                          </td>
                        );
                      })}

                      <td className="p-1">
                        <div className="flex gap-2">
                          <button className="btn btn-xs btn-outline" onClick={() => duplicateRow(r.drug_name, r.drug_class, r.is_nephrotoxic, r.is_preventive)}>➕</button>
                          <button className="btn btn-xs btn-error" onClick={() => deleteRow(r._clientId)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ));
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="w-full max-w-6xl mt-4">
        <button onClick={saveAll} disabled={!patient || saving} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60">
          {saving ? 'Saving…' : 'Save All'}
        </button>
      </div>

      {/* Summary: show localSummary first (live), then remoteSummary if present */}
      <div className="bg-white w-full max-w-6xl mt-6 rounded shadow p-4">
        <h2 className="text-2xl font-bold mb-4 text-gray-900">📊 Summary (Nephrotoxic / Preventive)</h2>
        <table className="w-full border text-center text-gray-900">
          <thead><tr className="bg-gray-200"><th className="border p-2"></th><th className="border p-2">Nephrotoxic</th><th className="border p-2">Preventive</th></tr></thead>
          <tbody>
            <tr><td className="border p-2">Pre CAG</td><td className="border p-2">{(localSummary.pre_cag || 0) > 0 ? '✅' : '❌'}</td><td className="border p-2">{(localSummary.prev_pre_cag || 0) > 0 ? '✅' : '❌'}</td></tr>
            <tr><td className="border p-2">0–24 CAG</td><td className="border p-2">{(localSummary.cag_0_24 || 0) > 0 ? '✅' : '❌'}</td><td className="border p-2">{(localSummary.prev_cag_0_24 || 0) > 0 ? '✅' : '❌'}</td></tr>
            <tr><td className="border p-2">48 CAG</td><td className="border p-2">{(localSummary.cag_48 || 0) > 0 ? '✅' : '❌'}</td><td className="border p-2">{(localSummary.prev_cag_48 || 0) > 0 ? '✅' : '❌'}</td></tr>
            <tr><td className="border p-2">72 CAG</td><td className="border p-2">{(localSummary.cag_72 || 0) > 0 ? '✅' : '❌'}</td><td className="border p-2">{(localSummary.prev_cag_72 || 0) > 0 ? '✅' : '❌'}</td></tr>
            <tr><td className="border p-2">Pre PTCA</td><td className="border p-2">{(localSummary.pre_ptca || 0) > 0 ? '✅' : '❌'}</td><td className="border p-2">{(localSummary.prev_pre_ptca || 0) > 0 ? '✅' : '❌'}</td></tr>
            <tr><td className="border p-2">0–24 PTCA</td><td className="border p-2">{(localSummary.ptca_0_24 || 0) > 0 ? '✅' : '❌'}</td><td className="border p-2">{(localSummary.prev_ptca_0_24 || 0) > 0 ? '✅' : '❌'}</td></tr>
            <tr><td className="border p-2">48 PTCA</td><td className="border p-2">{(localSummary.ptca_48 || 0) > 0 ? '✅' : '❌'}</td><td className="border p-2">{(localSummary.prev_ptca_48 || 0) > 0 ? '✅' : '❌'}</td></tr>
            <tr><td className="border p-2">72 PTCA</td><td className="border p-2">{(localSummary.ptca_72 || 0) > 0 ? '✅' : '❌'}</td><td className="border p-2">{(localSummary.prev_ptca_72 || 0) > 0 ? '✅' : '❌'}</td></tr>
          </tbody>
        </table>
        {remoteSummary && (
          <div className="text-xs text-gray-600 mt-2">DB summary (latest): Nephrotoxic pre-CAG count = {remoteSummary.nephrotoxic_pre_cag_count ?? 0}</div>
        )}
      </div>
    </div>
  );
}
