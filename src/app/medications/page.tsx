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
  route?: string | null;
  is_nephrotoxic: boolean;
  is_preventive: boolean;
};

type LocalAdminRow = {
  _clientId: string;
  id?: string | null;
  medication_id?: string | null;
  drug_name: string;
  drug_class: string;
  route?: string | null;
  is_nephrotoxic: boolean;
  is_preventive: boolean;
  dose: string;
  frequency: string;
  dayChecks: boolean[];
  saved?: boolean;
};

// ---------- DRUG LIST (with IDs) ----------
const DRUG_LIST = [
  {
    class: "NSAIDs",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      { id: "655ab1e2-7e18-44cc-8737-3b45b40a7761", name: "Diclofenac" },
      { id: "712de446-e683-48ad-9413-052fa5dbf981", name: "Ibuprofen" },
      { id: "e22ec8b8-433d-46f4-92eb-b3b8fff5a42d", name: "Naproxen" },
      { id: "c6d22bc3-9f19-4ccd-bf51-391b8deed093", name: "Indomethacin" },
      { id: "cdc26381-c0b2-4e6c-bc00-b9a5a488090c", name: "Ketorolac" },
      { id: "941d0ebb-b2ec-4d56-b061-713b3abd756c", name: "Piroxicam" },
      { id: "53c5a314-58b4-44ba-8ee5-97aa1978ef48", name: "Etoricoxib" },
      { id: "1fe021bc-42d4-46c1-9d2d-cc6c07e38a20", name: "Celecoxib" },
      { id: "2398bf60-ee58-44c0-b9c2-73cab007a3d5", name: "Aceclofenac" },
      { id: "deea8845-d923-4839-9eae-22730ec36439", name: "Meloxicam" },
      { id: "2029d14f-e229-4c6b-add8-3f8a90ee7d1a", name: "Lornoxicam" },
      { id: "1934b378-2ed4-4eec-a256-0b1ab8c39b11", name: "Nabumetone" },
      { id: "70f2bf2d-bdb0-46d3-9946-3be1f95fe3ff", name: "Parecoxib" }
    ]
  },
  {
    class: "ACEI / ARB / RAAS",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      { id: "bd299ccc-1ff5-464c-97bc-a29ba5a2e9ff", name: "Captopril" },
      { id: "ed19204a-96cc-49f1-ad1a-260e142c8b03", name: "Enalapril" },
      { id: "a418f0b0-42aa-4abf-9d09-9d0348a5e53d", name: "Lisinopril" },
      { id: "94f2f3a8-f4d3-47e9-a9de-f58851532d56", name: "Ramipril" },
      { id: "3cc9197a-a177-4577-a218-f8017d1517d4", name: "Perindopril" },
      { id: "7663a013-0fca-427a-ba96-6c8befe42395", name: "Losartan" },
      { id: "0d69a66d-a3cd-4e04-b6c5-eb98c8c2544a", name: "Valsartan" },
      { id: "cead2283-3d6f-4c04-9d0c-a0a7b9a6655a", name: "Telmisartan" },
      { id: "b53d62a3-9440-4620-b673-46ab10017c5d", name: "Olmesartan" },
      { id: "4bb1af0d-8b8a-4444-9aef-95d29a373c76", name: "Candesartan" },
      { id: "b580acea-d869-453b-a565-9f5c2d01fa08", name: "Irbesartan" },
      { id: "b9250cde-8da0-422b-95b2-ab375d483edb", name: "Sacubitril/Valsartan" },
      { id: "99b1ea57-49b0-4b00-86c3-ea6cdeeac224", name: "Aliskiren" }
    ]
  },
  {
    class: "Diuretics",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      { id: "1684289a-190d-47e2-882e-fd8dd2e0a7f0", name: "Furosemide" },
      { id: "25d3353b-161d-4956-9a03-bc1b5b1a251f", name: "Torsemide" },
      { id: "e6ca859c-54c0-4162-a7ca-af47b8d19200", name: "Bumetanide" },
      { id: "62def3f5-130a-4074-8552-a05500651964", name: "Hydrochlorothiazide" },
      { id: "8507cc90-79ae-4703-b7e7-f7f841a72c8a", name: "Chlorthalidone" },
      { id: "971d4e06-f3ce-4b64-a652-c3e2ab7d71ff", name: "Indapamide" },
      { id: "16b1f0c8-50ba-45ba-93fe-1d632395e25c", name: "Metolazone" }
    ]
  },
  {
    class: "Aminoglycosides",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      { id: "b86c43ef-e62a-431c-a728-6d7770578f08", name: "Gentamicin" },
      { id: "f25de259-223f-4202-bcdb-930e05fad3d2", name: "Amikacin" },
      { id: "6f386301-4b47-41e1-ac18-33d6e414cc13", name: "Tobramycin" },
      { id: "4a78062a-255f-45dd-a6fe-1566c01067ea", name: "Netilmicin" },
      { id: "13340930-03f6-47dc-b447-ff19a9ac1f49", name: "Neomycin" }
    ]
  },
  {
    class: "Nephrotoxic Antibiotics/Others",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      { id: "6b8ed311-cc38-4b0e-9717-00fb2b26525b", name: "Vancomycin" },
      { id: "97133eda-5c71-450e-9282-fb97f34f7ef9", name: "Piperacillin-Tazobactam" },
      { id: "376f2bdf-9e55-4fe0-b88f-7bca9003a73a", name: "Acyclovir" },
      { id: "ff87ebba-5bdf-42bf-84ba-63dc34e40794", name: "Ganciclovir" },
      { id: "b10210a2-bafd-4369-b11b-5e61effe35ef", name: "Foscarnet" },
      { id: "4fb80206-a684-467f-9269-5505b95a4947", name: "Cidofovir" },
      { id: "04736a29-8b59-439e-91f7-0a7cca405849", name: "Tenofovir" },
      { id: "c0d8f279-51f9-4160-9648-880912fc9f60", name: "Adefovir" },
      { id: "5b186597-407c-4e46-ac8f-9bbd337b6f20", name: "Trimethoprim-Sulfamethoxazole" },
      { id: "749f7c46-f8e5-4645-ab94-3c03dc5ff26d", name: "Methicillin" },
      { id: "3d22deab-0af7-42d1-baeb-062b727b6fb6", name: "Nafcillin" },
      { id: "7e33221b-a594-4e36-a8cc-d366b4f1e72c", name: "Oxacillin" },
      { id: "f9e58507-814f-4f84-95ec-e99481e198a7", name: "Cefazolin" },
      { id: "3575095f-129c-4b20-88e0-0af765b61f2e", name: "Amphotericin B" }
    ]
  },
  {
    class: "Antineoplastics / Immunosuppressants",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      { id: "22a6685f-d24d-437f-8531-dc5da9d3bb01", name: "Cisplatin" },
      { id: "19e339d2-eee8-4b57-bb94-1937296d4648", name: "Carboplatin" },
      { id: "db8f85c8-cf95-4608-821c-7fca9f73e5db", name: "Oxaliplatin" },
      { id: "8577f0de-43c3-42a9-a03e-770a41d3de35", name: "Ifosfamide" },
      { id: "a4a585f6-0afd-4325-8c5a-46b691267fef", name: "Methotrexate" },
      { id: "fc0bcc10-9323-421b-95af-e7cef6204d25", name: "Cyclophosphamide" },
      { id: "ad82e432-996b-49bf-9256-89d80b648a53", name: "Mitomycin C" },
      { id: "df9a2649-4eab-4161-9cf8-d60549242136", name: "Cyclosporine" },
      { id: "8496fed4-f82b-41c9-9058-0d9ac57f76a9", name: "Tacrolimus" }
    ]
  },
  {
    class: "Others (Nephrotoxic)",
    is_nephrotoxic: true,
    is_preventive: false,
    drugs: [
      { id: "bac0f7ec-1074-4b44-8f12-e149699efe4f", name: "Lithium" },
      { id: "3a0e23ea-ec31-4b3d-a6ed-eeb0b9a8c8c2", name: "Daptomycin" }
    ]
  },
  {
    class: "Preventive Measures",
    is_nephrotoxic: false,
    is_preventive: true,
    drugs: [
      { id: "3d36e3a8-7c1b-4505-b212-cb3664f11665", name: "0.9% Normal Saline" },
      { id: "fc0623f9-7257-46f2-b70b-e9578a6d3dc8", name: "Sodium Bicarbonate" },
      { id: "203002e1-a189-44eb-8558-3ed37befc7d3", name: "N-Acetylcysteine" },
      { id: "e50323e4-fac4-47d3-a960-aa0f306ca1b7", name: "Ascorbic Acid" },
      { id: "f95608b0-13da-455e-aae0-44133195e4bb", name: "Atorvastatin" },
      { id: "cdd3e282-9bd0-41e7-9294-20068eb64f15", name: "Rosuvastatin" },
      { id: "314b77fa-c025-467b-937b-6f78ea175924", name: "Hold NSAIDs" },
      { id: "77febc9e-17b7-4fe8-a374-7285e2634633", name: "Hold ACEI/ARB" },
      { id: "5c0b1449-a791-4d31-b856-45e125a5ebac", name: "Hold Diuretics" },
      { id: "ad2d050b-c6f0-4b95-b393-1caca2b4350f", name: "Hold Metformin" },
      { id: "c5dc1e6d-dac8-4c27-80c1-6d16d2ea9f65", name: "Iso-osmolar contrast use" },
      { id: "61e31a21-bae6-4f9d-9dba-e2c63310c33a", name: "Minimize contrast volume" },
      { id: "3bdb9291-3a26-43f3-a6ad-726d72b352f8", name: "Avoid repeat contrast within 48-72h" },
      { id: "3843b352-66eb-4927-a203-85d59d12568f", name: "Radial access" }
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

const dayFieldName = (i: number) => `day${i + 1}`;

// ---------- Page Component ----------
export default function MedicationsPage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [masterMap, setMasterMap] = useState<Record<string, MedicationMasterRow | undefined>>({});
  const [localRows, setLocalRows] = useState<LocalAdminRow[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [remoteSummary, setRemoteSummary] = useState<any | null>(null);

  // Load active patient + master mapping
  useEffect(() => {
    (async () => {
      const userId = '00000000-0000-0000-0000-000000000001';
      const { data: active } = await supabase.from('active_patient').select('patient_id').eq('user_id', userId).maybeSingle();
      if (!active?.patient_id) return;

      const { data: p } = await supabase
        .from('patient_details')
        .select('id, patient_name, ipd_number, procedure_datetime_cag, procedure_datetime_ptca')
        .eq('id', active.patient_id)
        .single();
      if (p) setPatient(p);

      const { data: masters } = await supabase
        .from('medications_master')
        .select('id, drug_name, drug_class, route, is_nephrotoxic, is_preventive');
      const map: Record<string, MedicationMasterRow | undefined> = {};
      (masters || []).forEach((m: any) => {
        map[m.drug_name.trim()] = {
          id: m.id,
          drug_name: m.drug_name,
          drug_class: m.drug_class,
          route: m.route ?? null,
          is_nephrotoxic: m.is_nephrotoxic,
          is_preventive: m.is_preventive
        };
      });
      setMasterMap(map);

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
            route: foundMaster?.route ?? a.route ?? null,
            is_nephrotoxic: a.is_nephrotoxic ?? foundMaster?.is_nephrotoxic ?? false,
            is_preventive: a.is_preventive ?? foundMaster?.is_preventive ?? false,
            dose: a.dose ?? '',
            frequency: a.frequency ?? '',
            dayChecks,
            saved: true,
          };
        });
        setLocalRows(parsed);

        const { data: s } = await supabase
          .from('medication_summary_per_patient')
          .select('*')
          .eq('patient_id', active.patient_id)
          .maybeSingle();
        setRemoteSummary(s || null);
      }
    })();
  }, []);

  // Date window
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

  // Filtered group view
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return DRUG_LIST;
    const q = search.trim().toLowerCase();
    return DRUG_LIST.map(g => ({
      ...g,
      drugs: g.drugs.filter(drug => drug.name.toLowerCase().includes(q) || g.class.toLowerCase().includes(q))
    })).filter(g => g.drugs.length > 0);
  }, [search]);

  // Helpers
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

  function addEmptyRowForDrug(drugId: string, drugName: string, drugClass: string, isNeph: boolean, isPrev: boolean) {
    const newRow: LocalAdminRow = {
      _clientId: `c-${crypto.randomUUID()}`,
      id: null,
      medication_id: drugId,
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
    setLocalRows(prev => [...prev, newRow]);
  }

  function duplicateRow(drugId: string, drugName: string, drugClass: string, isNeph: boolean, isPrev: boolean) {
    addEmptyRowForDrug(drugId, drugName, drugClass, isNeph, isPrev);
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

  async function deleteRow(clientId: string) {
    const row = localRows.find(r => r._clientId === clientId);
    if (!row) return;
    if (row.saved && row.id) {
      await supabase.from('medication_administration').delete().eq('id', row.id);
    }
    setLocalRows(prev => prev.filter(r => r._clientId !== clientId));
    if (patient) {
      const { data } = await supabase.from('medication_summary_per_patient').select('*').eq('patient_id', patient.id).maybeSingle();
      setRemoteSummary(data || null);
    }
  }

  function handleMasterRowToggle(drug: { id: string; name: string }, drugClass: string, isNeph: boolean, isPrev: boolean, colIndex: number) {
    const idx = findRowIndex(drug.name, 0);
    if (idx === -1) {
      const newRow: LocalAdminRow = {
        _clientId: `c-${crypto.randomUUID()}`,
        id: null,
        medication_id: drug.id,
        drug_name: drug.name,
        drug_class: drugClass,
        route: masterMap[drug.name]?.route ?? null,
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

  async function saveAll() {
    if (!patient) return;
    setSaving(true);

    const missingMasters: string[] = [];
    for (const r of localRows) {
      const mappedId = r.medication_id ?? masterMap[r.drug_name]?.id ?? null;
      if (!mappedId) {
        if (!missingMasters.includes(r.drug_name)) missingMasters.push(r.drug_name);
      }
    }
    if (missingMasters.length > 0) {
      setSaving(false);
      alert(`Cannot save — master IDs missing for: ${missingMasters.join(', ')}`);
      console.error('Missing masterMap entries for:', missingMasters);
      return;
    }

    const payload = localRows.map(r => {
      const medication_id = r.medication_id ?? masterMap[r.drug_name]?.id ?? null;
      const rowPayload: any = {
        patient_id: patient.id,
        medication_id,
        dose: r.dose || null,
        frequency: r.frequency || null,
        drug_class: r.drug_class,
        is_nephrotoxic: r.is_nephrotoxic,
        is_preventive: r.is_preventive,
      };
      for (let i = 0; i < 7; i++) rowPayload[`day${i+1}`] = !!r.dayChecks[i];
      if (r.id) rowPayload.id = r.id;
      return rowPayload;
    });

    try {
      for (const r of payload.filter(p => p.id)) {
        await supabase.from('medication_administration').update(r).eq('id', r.id);
      }
      const inserts = payload.filter(p => !p.id);
      if (inserts.length > 0) {
        await supabase.from('medication_administration').insert(inserts);
      }
      const { data: admins } = await supabase.from('medication_administration').select('*').eq('patient_id', patient.id);
      const newLocal = (admins || []).map((a: any) => {
        const found = Object.values(masterMap).find(x => x?.id === a.medication_id);
        return {
          _clientId: `db-${a.id}`,
          id: a.id,
          medication_id: a.medication_id,
          drug_name: found?.drug_name ?? (a.drug_name ?? 'Unknown'),
          drug_class: a.drug_class ?? found?.drug_class ?? '',
          route: found?.route ?? a.route ?? null,
          is_nephrotoxic: a.is_nephrotoxic ?? found?.is_nephrotoxic ?? false,
          is_preventive: a.is_preventive ?? found?.is_preventive ?? false,
          dose: a.dose ?? '',
          frequency: a.frequency ?? '',
          dayChecks: [1,2,3,4,5,6,7].map(i => !!a[`day${i}`]),
          saved: true
        } as LocalAdminRow;
      }) as LocalAdminRow[];
      setLocalRows(newLocal);
      const { data: summary } = await supabase.from('medication_summary_per_patient').select('*').eq('patient_id', patient.id).maybeSingle();
      setRemoteSummary(summary || null);
    } catch (err) {
      console.error('SaveAll err', err);
      alert('Save failed — check console');
    } finally {
      setSaving(false);
    }
  }

  // ✅ Summary unchanged
  const localSummary = useMemo(() => {
    const b: Record<string, number> = {
      pre_cag: 0, cag_0_24: 0, cag_48: 0, cag_72: 0,
      pre_ptca: 0, ptca_0_24: 0, ptca_48: 0, ptca_72: 0,
      prev_pre_cag: 0, prev_cag_0_24: 0, prev_cag_48: 0, prev_cag_72: 0,
      prev_pre_ptca: 0, prev_ptca_0_24: 0, prev_ptca_48: 0, prev_ptca_72: 0
    };
    for (const r of localRows) {
      for (let i = 0; i < dateOptions.length; i++) {
        if (!r.dayChecks[i]) continue;
        const date = dateOptions[i];
        const cLab = classifyTimingLabel(date, patient?.procedure_datetime_cag ?? null, 'CAG');
        const pLab = classifyTimingLabel(date, patient?.procedure_datetime_ptca ?? null, 'PTCA');
        if (r.is_nephrotoxic) {
          if (cLab === 'Pre CAG') b.pre_cag++;
          if (cLab === '0–24 CAG') b.cag_0_24++;
          if (cLab === '48 CAG') b.cag_48++;
          if (cLab === '72 CAG') b.cag_72++;
          if (pLab === 'Pre PTCA') b.pre_ptca++;
          if (pLab === '0–24 PTCA') b.ptca_0_24++;
          if (pLab === '48 PTCA') b.ptca_48++;
          if (pLab === '72 PTCA') b.ptca_72++;
        }
        if (r.is_preventive) {
          if (cLab === 'Pre CAG') b.prev_pre_cag++;
          if (cLab === '0–24 CAG') b.prev_cag_0_24++;
          if (cLab === '48 CAG') b.prev_cag_48++;
          if (cLab === '72 CAG') b.prev_cag_72++;
          if (pLab === 'Pre PTCA') b.prev_pre_ptca++;
          if (pLab === '0–24 PTCA') b.prev_ptca_0_24++;
          if (pLab === '48 PTCA') b.prev_ptca_48++;
          if (pLab === '72 PTCA') b.prev_ptca_72++;
        }
      }
    }
    return b;
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
              {dateOptions.map(d => (
                <th key={d} className="p-2 whitespace-nowrap text-gray-900 font-semibold">{d}</th>
              ))}
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
                    const sampleMaster = masterMap[drug.name.trim()];
                    const isNeph = sampleMaster?.is_nephrotoxic ?? group.is_nephrotoxic;
                    const isPrev = sampleMaster?.is_preventive ?? group.is_preventive;
                    return (
                      <tr key={drug.id} className={`${isNeph ? 'bg-red-50' : isPrev ? 'bg-green-50' : ''}`}>
                        <td className="p-2 text-gray-900 font-medium">
                          {drug.name}
                          {!sampleMaster && <span className="ml-2 text-xs text-red-700"> (master not found)</span>}
                        </td>
                        <td className="p-1 text-gray-900">{sampleMaster?.route ?? '-'}</td>
                        <td className="p-1 text-gray-900">-</td>
                        <td className="p-1 text-gray-900">-</td>
                        {dateOptions.map((d, i) => {
                          const cagLabel = classifyTimingLabel(d, patient?.procedure_datetime_cag ?? null, 'CAG');
                          const ptcaLabel = classifyTimingLabel(d, patient?.procedure_datetime_ptca ?? null, 'PTCA');
                          return (
                            <td key={d} className="p-1 text-center">
                              <input type="checkbox" onChange={() => handleMasterRowToggle(drug, group.class, isNeph, isPrev, i)} />
                              <div className="mt-1 text-xs flex flex-col gap-1 items-center">
                                {cagLabel && <span className={`px-1 rounded text-xs font-semibold ${chipClass(cagLabel)}`}>{cagLabel}</span>}
                                {ptcaLabel && <span className={`px-1 rounded text-xs font-semibold ${chipClass(ptcaLabel)}`}>{ptcaLabel}</span>}
                              </div>
                            </td>
                          );
                        })}
                        <td className="p-1">
                          <button className="btn btn-xs btn-outline" onClick={() => duplicateRow(drug.id, drug.name, group.class, isNeph, isPrev)}>➕</button>
                        </td>
                      </tr>
                    );
                  }

                  return rowsForDrug.map(r => (
                    <tr key={r._clientId} className={`${r.is_nephrotoxic ? 'bg-red-50' : r.is_preventive ? 'bg-green-50' : ''}`}>
                      <td className="p-2 text-gray-900 font-medium">
                        {r.drug_name}
                        {!r.medication_id && <span className="ml-2 text-xs text-red-700">(no master id)</span>}
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
                          <button className="btn btn-xs btn-outline" onClick={() => duplicateRow(r.medication_id!, r.drug_name, r.drug_class, r.is_nephrotoxic, r.is_preventive)}>➕</button>
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
          <thead>
            <tr className="bg-gray-200">
              <th className="border p-2"></th>
              <th className="border p-2">Nephrotoxic</th>
              <th className="border p-2">Preventive</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="border p-2">Pre CAG</td><td className="border p-2">{localSummary.pre_cag ? '✅' : '❌'}</td><td className="border p-2">{localSummary.prev_pre_cag ? '✅' : '❌'}</td></tr>
            <tr><td className="border p-2">0–24 CAG</td><td className="border p-2">{localSummary.cag_0_24 ? '✅' : '❌'}</td><td className="border p-2">{localSummary.prev_cag_0_24 ? '✅' : '❌'}</td></tr>
            <tr><td className="border p-2">48 CAG</td><td className="border p-2">{localSummary.cag_48 ? '✅' : '❌'}</td><td className="border p-2">{localSummary.prev_cag_48 ? '✅' : '❌'}</td></tr>
            <tr><td className="border p-2">72 CAG</td><td className="border p-2">{localSummary.cag_72 ? '✅' : '❌'}</td><td className="border p-2">{localSummary.prev_cag_72 ? '✅' : '❌'}</td></tr>
            <tr><td className="border p-2">Pre PTCA</td><td className="border p-2">{localSummary.pre_ptca ? '✅' : '❌'}</td><td className="border p-2">{localSummary.prev_pre_ptca ? '✅' : '❌'}</td></tr>
            <tr><td className="border p-2">0–24 PTCA</td><td className="border p-2">{localSummary.ptca_0_24 ? '✅' : '❌'}</td><td className="border p-2">{localSummary.prev_ptca_0_24 ? '✅' : '❌'}</td></tr>
            <tr><td className="border p-2">48 PTCA</td><td className="border p-2">{localSummary.ptca_48 ? '✅' : '❌'}</td><td className="border p-2">{localSummary.prev_ptca_48 ? '✅' : '❌'}</td></tr>
            <tr><td className="border p-2">72 PTCA</td><td className="border p-2">{localSummary.ptca_72 ? '✅' : '❌'}</td><td className="border p-2">{localSummary.prev_ptca_72 ? '✅' : '❌'}</td></tr>
          </tbody>
        </table>
        {remoteSummary && (
          <div className="text-xs text-gray-600 mt-2">
            DB summary (latest): Nephrotoxic pre-CAG count = {remoteSummary.nephrotoxic_pre_cag_count ?? 0}
          </div>
        )}
      </div>
    </div>
  );
}
