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

type LocalAdminRow = {
  _clientId: string;
  id?: string | null;
  drug_name: string;
  drug_class: string;
  route?: string | null;
  is_nephrotoxic: boolean;
  is_preventive: boolean;
  dose: string;
  frequency: string;
  dayChecks: boolean[]; // 7-day window mapping (index 0..6)
  saved?: boolean;
};

// ---------- DRUG LIST (no IDs — all drugs included) ----------
const DRUG_LIST = [
  {
    class: "NSAIDs",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      { name: "Diclofenac" },
      { name: "Ibuprofen" },
      { name: "Naproxen" },
      { name: "Indomethacin" },
      { name: "Ketorolac" },
      { name: "Piroxicam" },
      { name: "Etoricoxib" },
      { name: "Celecoxib" },
      { name: "Aceclofenac" },
      { name: "Meloxicam" },
      { name: "Lornoxicam" },
      { name: "Nabumetone" },
      { name: "Parecoxib" }
    ]
  },
  {
    class: "ACEI / ARB / RAAS",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      { name: "Captopril" },
      { name: "Enalapril" },
      { name: "Lisinopril" },
      { name: "Ramipril" },
      { name: "Perindopril" },
      { name: "Losartan" },
      { name: "Valsartan" },
      { name: "Telmisartan" },
      { name: "Olmesartan" },
      { name: "Candesartan" },
      { name: "Irbesartan" },
      { name: "Sacubitril/Valsartan" },
      { name: "Aliskiren" }
    ]
  },
  {
    class: "Diuretics",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      { name: "Furosemide" },
      { name: "Torsemide" },
      { name: "Bumetanide" },
      { name: "Hydrochlorothiazide" },
      { name: "Chlorthalidone" },
      { name: "Indapamide" },
      { name: "Metolazone" }
    ]
  },
  {
    class: "Aminoglycosides",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      { name: "Gentamicin" },
      { name: "Amikacin" },
      { name: "Tobramycin" },
      { name: "Netilmicin" },
      { name: "Neomycin" }
    ]
  },
  {
    class: "Nephrotoxic Antibiotics/Others",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      { name: "Vancomycin" },
      { name: "Piperacillin-Tazobactam" },
      { name: "Acyclovir" },
      { name: "Ganciclovir" },
      { name: "Foscarnet" },
      { name: "Cidofovir" },
      { name: "Tenofovir" },
      { name: "Adefovir" },
      { name: "Trimethoprim-Sulfamethoxazole" },
      { name: "Methicillin" },
      { name: "Nafcillin" },
      { name: "Oxacillin" },
      { name: "Cefazolin" },
      { name: "Amphotericin B" }
    ]
  },
  {
    class: "Antineoplastics / Immunosuppressants",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      { name: "Cisplatin" },
      { name: "Carboplatin" },
      { name: "Oxaliplatin" },
      { name: "Ifosfamide" },
      { name: "Methotrexate" },
      { name: "Cyclophosphamide" },
      { name: "Mitomycin C" },
      { name: "Cyclosporine" },
      { name: "Tacrolimus" }
    ]
  },
  {
    class: "Others (Nephrotoxic)",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      { name: "Lithium" },
      { name: "Daptomycin" }
    ]
  },
  {
    class: "Vasopressors / Inotropes",
    is_nephrotoxic: false,
    is_preventive: false,
    drugs: [
      { name: "Noradrenaline" },
      { name: "Adrenaline" },
      { name: "Phenylephrine" },
      { name: "Vasopressin" },
      { name: "Metaraminol" },
      { name: "Dopamine" },
      { name: "Dobutamine" },
      { name: "Milrinone" },
      { name: "Levosimendan" },
      { name: "Ephedrine" },
      { name: "Isoproterenol" }
    ]
  },
  {
    class: "Preventive Measures",
    is_nephrotoxic: false,
    is_preventive: true,
    drugs: [
      { name: "0.9% Normal Saline" },
      { name: "Sodium Bicarbonate" },
      { name: "N-Acetylcysteine" },
      { name: "Ascorbic Acid" },
      { name: "Atorvastatin" },
      { name: "Rosuvastatin" },
      { name: "Hold NSAIDs" },
      { name: "Hold ACEI/ARB" },
      { name: "Hold Diuretics" },
      { name: "Hold Metformin" },
      { name: "Iso-osmolar contrast use" },
      { name: "Minimize contrast volume" },
      { name: "Avoid repeat contrast within 48-72h" },
      { name: "Radial access" }
    ]
  }
];

// ---------- Helpers ----------
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

function classifyTimingLabelSingle(dateISO: string, procISO: string | null, tag: 'CAG' | 'PTCA') {
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

const chipClass = (label: string | null) => {
  if (!label) return 'bg-gray-200 text-gray-900 border-gray-400';
  if (label.startsWith('Pre')) return 'bg-green-200 text-green-900 border-green-600';
  if (label.startsWith('0–24')) return 'bg-yellow-200 text-yellow-900 border-yellow-600';
  if (label.startsWith('48')) return 'bg-orange-200 text-orange-900 border-orange-600';
  if (label.startsWith('72')) return 'bg-red-200 text-red-900 border-red-600';
  return 'bg-gray-200 text-gray-900 border-gray-400';
};

// find drug metadata by name from DRUG_LIST
function findDrugByName(name?: string | null) {
  if (!name) return undefined;
  for (const g of DRUG_LIST) {
    for (const d of g.drugs) {
      if (d.name === name || d.name.toLowerCase() === String(name).toLowerCase()) {
        return {
          name: d.name,
          drug_class: g.class,
          route: (d as any).route ?? null,
          is_nephrotoxic: g.is_nephrotoxic,
          is_preventive: g.is_preventive
        };
      }
    }
  }
  return undefined;
}

// ---------- Page Component ----------
export default function MedicationsPage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [localRows, setLocalRows] = useState<LocalAdminRow[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // load active patient (user id hardcoded like your previous code)
  useEffect(() => {
    (async () => {
      try {
        const userId = '00000000-0000-0000-0000-000000000001';
        const { data: active } = await supabase
          .from('active_patient')
          .select('patient_id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!active?.patient_id) return;

        const { data: p, error } = await supabase
          .from('patient_details')
          .select('id, patient_name, ipd_number, procedure_datetime_cag, procedure_datetime_ptca')
          .eq('id', active.patient_id)
          .single();

        if (error) {
          console.error('patient fetch error', error);
          return;
        }
        if (p) setPatient(p);
      } catch (err) {
        console.error('load active patient err', err);
      }
    })();
  }, []);

  // date window used by UI (7 columns relative to earliest procedure date or today)
  const dateOptions = useMemo(() => {
    if (!patient) return [];
    const cag = patient.procedure_datetime_cag ? new Date(patient.procedure_datetime_cag) : null;
    const ptca = patient.procedure_datetime_ptca ? new Date(patient.procedure_datetime_ptca) : null;
    const earliest = cag && ptca ? (cag < ptca ? cag : ptca) : cag || ptca || new Date();
    const arr: string[] = [];
    for (let i = -1; i <= 5; i++) {
      const d = new Date(earliest);
      d.setDate(earliest.getDate() + i);
      arr.push(fmtDate(d));
    }
    return arr;
  }, [patient]);

  // fetch meds when patient is available (and dateOptions ready)
  useEffect(() => {
    (async () => {
      if (!patient) return;
      try {
        const { data: meds } = await supabase
          .from('medications')
          .select('*')
          .eq('patient_id', patient.id)
          .order('med_date', { ascending: true });

        const parsed: LocalAdminRow[] = (meds || []).map((a: any) => {
          const medDateStr = a.med_date ? String(a.med_date).slice(0, 10) : null;
          const dayChecks = dateOptions.length
            ? dateOptions.map(d => !!medDateStr && medDateStr === d)
            : [false,false,false,false,false,false,false];

          const found = findDrugByName(a.drug_name);
          return {
            _clientId: `db-${a.id}`,
            id: a.id,
            drug_name: found?.name ?? (a.drug_name ?? 'Unknown'),
            drug_class: a.drug_class ?? found?.drug_class ?? '',
            route: found?.route ?? a.route ?? null,
            is_nephrotoxic: a.is_nephrotoxic ?? found?.is_nephrotoxic ?? false,
            is_preventive: a.is_preventive ?? found?.is_preventive ?? false,
            dose: a.dose ?? '',
            frequency: a.frequency ?? '',
            dayChecks,
            saved: true,
          } as LocalAdminRow;
        });
        setLocalRows(parsed);
      } catch (err) {
        console.error('fetch meds err', err);
      }
    })();
  }, [patient, dateOptions]);

  // Filtered groups for search
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return DRUG_LIST;
    const q = search.trim().toLowerCase();
    return DRUG_LIST.map(g => ({
      ...g,
      drugs: g.drugs.filter(drug => drug.name.toLowerCase().includes(q) || g.class.toLowerCase().includes(q))
    })).filter(g => g.drugs.length > 0);
  }, [search]);

  // helpers to find rows
  const findRowIndex = (drugName: string, idxInstance = 0) => {
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
      drug_name: drugName,
      drug_class: drugClass,
      route: findDrugByName(drugName)?.route ?? null,
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

  // Delete a row (DB if saved)
  async function deleteRow(clientId: string) {
    const row = localRows.find(r => r._clientId === clientId);
    if (!row) return;
    try {
      if (row.saved && row.id) {
        await supabase.from('medications').delete().eq('id', row.id);
      }
      setLocalRows(prev => prev.filter(r => r._clientId !== clientId));
    } catch (err) {
      console.error('delete err', err);
      alert('Delete failed — check console');
    }
  }

  // When user toggles quick checkbox on master row: add a new local row or toggle first existing one
  function handleMasterRowToggle(drugName: string, drugClass: string, isNeph: boolean, isPrev: boolean, colIndex: number) {
    const idx = findRowIndex(drugName, 0);
    if (idx === -1) {
      const newRow: LocalAdminRow = {
        _clientId: `c-${crypto.randomUUID()}`,
        id: null,
        drug_name: drugName,
        drug_class: drugClass,
        route: findDrugByName(drugName)?.route ?? null,
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

  // Save all localRows -> medications table (one DB row per checked date)
  async function saveAll() {
    if (!patient) return;
    setSaving(true);

    try {
      for (const r of localRows) {
        const checkedIndexes = r.dayChecks.map((v,i) => v ? i : -1).filter(i => i !== -1);

        if (r.id) {
          // existing DB row: if no checked indexes => delete
          if (checkedIndexes.length === 0) {
            await supabase.from('medications').delete().eq('id', r.id);
            continue;
          } else {
            // update existing to first checked date, insert extras
            const firstIdx = checkedIndexes[0];
            const medDate = dateOptions[firstIdx];
            const cLab = classifyTimingLabelSingle(medDate, patient?.procedure_datetime_cag ?? null, 'CAG');
            const pLab = classifyTimingLabelSingle(medDate, patient?.procedure_datetime_ptca ?? null, 'PTCA');
            const timing_label = [cLab, pLab].filter(Boolean).join('|') || null;

            const updatePayload: any = {
              patient_id: patient.id,
              drug_name: r.drug_name,
              drug_class: r.drug_class,
              route: r.route ?? null,
              is_nephrotoxic: r.is_nephrotoxic,
              is_preventive: r.is_preventive,
              dose: r.dose || null,
              frequency: r.frequency || null,
              med_date: medDate,
              timing_label,
            };
            await supabase.from('medications').update(updatePayload).eq('id', r.id);

            // insert additional checked dates (if any)
            const extra = checkedIndexes.slice(1).map(idx => {
              const d = dateOptions[idx];
              const cL = classifyTimingLabelSingle(d, patient?.procedure_datetime_cag ?? null, 'CAG');
              const pL = classifyTimingLabelSingle(d, patient?.procedure_datetime_ptca ?? null, 'PTCA');
              return {
                patient_id: patient.id,
                drug_name: r.drug_name,
                drug_class: r.drug_class,
                route: r.route ?? null,
                is_nephrotoxic: r.is_nephrotoxic,
                is_preventive: r.is_preventive,
                dose: r.dose || null,
                frequency: r.frequency || null,
                med_date: d,
                timing_label: [cL, pL].filter(Boolean).join('|') || null,
              };
            });
            if (extra.length > 0) {
              await supabase.from('medications').insert(extra);
            }
          }
        } else {
          // new row(s): insert one DB row per checked date
          const inserts = checkedIndexes.map(idx => {
            const d = dateOptions[idx];
            const cL = classifyTimingLabelSingle(d, patient?.procedure_datetime_cag ?? null, 'CAG');
            const pL = classifyTimingLabelSingle(d, patient?.procedure_datetime_ptca ?? null, 'PTCA');
            return {
              patient_id: patient.id,
              drug_name: r.drug_name,
              drug_class: r.drug_class,
              route: r.route ?? null,
              is_nephrotoxic: r.is_nephrotoxic,
              is_preventive: r.is_preventive,
              dose: r.dose || null,
              frequency: r.frequency || null,
              med_date: d,
              timing_label: [cL, pL].filter(Boolean).join('|') || null,
            };
          });
          if (inserts.length > 0) {
            await supabase.from('medications').insert(inserts);
          }
        }
      }

      // reload local rows from DB to sync ids & saved flags
      const { data: admins } = await supabase.from('medications').select('*').eq('patient_id', patient.id).order('med_date', { ascending: true });
      const newLocal = (admins || []).map((a: any) => {
        const medDateStr = a.med_date ? String(a.med_date).slice(0, 10) : null;
        const dayChecks = dateOptions.length ? dateOptions.map(d => !!medDateStr && medDateStr === d) : [false,false,false,false,false,false,false];
        const found = findDrugByName(a.drug_name);
        return {
          _clientId: `db-${a.id}`,
          id: a.id,
          drug_name: found?.name ?? (a.drug_name ?? 'Unknown'),
          drug_class: a.drug_class ?? found?.drug_class ?? '',
          route: found?.route ?? a.route ?? null,
          is_nephrotoxic: a.is_nephrotoxic ?? found?.is_nephrotoxic ?? false,
          is_preventive: a.is_preventive ?? found?.is_preventive ?? false,
          dose: a.dose ?? '',
          frequency: a.frequency ?? '',
          dayChecks,
          saved: true
        } as LocalAdminRow;
      }) as LocalAdminRow[];
      setLocalRows(newLocal);
    } catch (err) {
      console.error('SaveAll err', err);
      alert('Save failed — check console');
    } finally {
      setSaving(false);
    }
  }

  // Local summary computed from localRows (live)
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
        const cLab = classifyTimingLabelSingle(date, patient?.procedure_datetime_cag ?? null, 'CAG');
        const pLab = classifyTimingLabelSingle(date, patient?.procedure_datetime_ptca ?? null, 'PTCA');
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
              <th className="p-2 text-gray-900">Route</th>
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
                  <td colSpan={5 + dateOptions.length} className="p-2">{group.class}</td>
                </tr>

                {group.drugs.map(drug => {
                  const rowsForDrug = localRows.filter(r => r.drug_name === drug.name);
                  if (rowsForDrug.length === 0) {
                    const isNeph = group.is_nephrotoxic;
                    const isPrev = group.is_preventive;
                    return (
                      <tr key={drug.name} className={`${isNeph ? 'bg-red-50' : isPrev ? 'bg-green-50' : ''}`}>
                        <td className="p-2 text-gray-900 font-medium">
                          {drug.name}
                        </td>
                        <td className="p-1 text-gray-900">{'-'}</td>
                        <td className="p-1 text-gray-900">-</td>
                        <td className="p-1 text-gray-900">-</td>
                        {dateOptions.map((d, i) => {
                          const cagLabel = classifyTimingLabelSingle(d, patient?.procedure_datetime_cag ?? null, 'CAG');
                          const ptcaLabel = classifyTimingLabelSingle(d, patient?.procedure_datetime_ptca ?? null, 'PTCA');
                          return (
                            <td key={d} className="p-1 text-center">
                              <input type="checkbox" onChange={() => handleMasterRowToggle(drug.name, group.class, isNeph, isPrev, i)} />
                              <div className="mt-1 text-xs flex flex-col gap-1 items-center">
                                {cagLabel && <span className={`px-1 rounded text-xs font-semibold ${chipClass(cagLabel)}`}>{cagLabel}</span>}
                                {ptcaLabel && <span className={`px-1 rounded text-xs font-semibold ${chipClass(ptcaLabel)}`}>{ptcaLabel}</span>}
                              </div>
                            </td>
                          );
                        })}
                        <td className="p-1">
                          <button className="btn btn-xs btn-outline" onClick={() => duplicateRow(drug.name, group.class, isNeph, isPrev)}>➕</button>
                        </td>
                      </tr>
                    );
                  }

                  return rowsForDrug.map(r => (
                    <tr key={r._clientId} className={`${r.is_nephrotoxic ? 'bg-red-50' : r.is_preventive ? 'bg-green-50' : ''}`}>
                      <td className="p-2 text-gray-900 font-medium">
                        {r.drug_name}
                      </td>
                      <td className="p-1 text-gray-900">{r.route ?? '-'}</td>
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
                        const cagLabel = classifyTimingLabelSingle(d, patient?.procedure_datetime_cag ?? null, 'CAG');
                        const ptcaLabel = classifyTimingLabelSingle(d, patient?.procedure_datetime_ptca ?? null, 'PTCA');
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

      {/* Summary */}
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
      </div>
    </div>
  );
}
