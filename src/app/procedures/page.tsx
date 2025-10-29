'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// ---------- Supabase ----------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---------- Types ----------
type Patient = {
  id: string;
  patient_name: string | null;
  ipd_number: string;
  procedure_datetime_cag: string | null;
  procedure_datetime_ptca: string | null;
};

type Angio = {
  id?: string | null;
  procedure_date: string | null; // yyyy-mm-dd
  procedure_time: string | null; // HH:mm (no seconds)
  access_site: string | null;
  catheter_type: string | null;
  contrast_agent: string | null;
  contrast_volume_ml: number | null;
  lm_lesion_description: string | null;
  lad_lesion_description: string | null;
  lcx_lesion_description: string | null;
  rca_lesion_description: string | null;
  impression: string | null;
  advice: string | null;
  notes: string | null;
};

type PTCA = {
  id?: string | null;
  procedure_date: string | null;
  procedure_time: string | null;
  access_site: string | null;
  guiding_catheter: string | null;
  contrast_agent: string | null;
  contrast_volume_ml: number | null;
  predilatation_details: string | null;
  stent_details: string | null;
  post_dilatation_details: string | null;
  timi_flow_post: string | null;
  complications: string | null;
  procedure_success: boolean | null;
  notes: string | null;
};

type Echo = {
  id?: string | null;
  echo_date: string | null; // yyyy-mm-dd
  ef_percent: number | null;
  lv_function: string | null;
  rwma: string | null;
  valve_findings: string | null;
};

type POBA = {
  id?: string | null;
  procedure_datetime: string | null; // datetime-local -> to ISO on save
  contrast_volume_ml: number | null;
  access_site: string | null;
};

type ThrombusAsp = {
  id?: string | null;
  procedure_datetime: string | null;
  contrast_volume_ml: number | null;
  access_site: string | null;
};

type IABP = {
  id?: string | null;
  iabp_inserted: boolean; // NOT NULL in schema
  insertion_datetime: string | null;
  indication: string | null;
  removal_datetime: string | null;
};

type TPI = {
  id?: string | null;
  insertion_datetime: string | null;
  device_type: string | null;
  indication: string | null;
};

type DeviceInsertion = {
  id?: string | null;
  insertion_datetime: string | null;
  device_type: string | null;
  indication: string | null;
  remarks: string | null;
};

// ---------- Small helpers ----------
const dtLocalFromISO = (iso?: string | null) => {
  if (!iso) return '';
  // ensure we return "YYYY-MM-DDTHH:MM" (no seconds) for <input type="datetime-local">
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

const isoFromDtLocal = (dt: string | null) => {
  if (!dt) return null;
  // browser gives local time; keep as local ISO for Postgres timestamptz (Supabase will treat it correctly)
  const d = new Date(dt);
  return d.toISOString();
};

const toNumOrNull = (v: any) => (v === '' || v === null || v === undefined ? null : Number(v));

// ---------- Collapsible Card ----------
function Card({
  title,
  children,
  defaultOpen = true,
  saved,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  saved?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded shadow p-4 mb-4 w-full max-w-6xl">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setOpen(o => !o)}>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <div className="flex items-center gap-3">
          {saved ? <span className="text-green-700 text-sm font-semibold">✅ Saved</span> : <span className="text-gray-500 text-sm">Unsaved</span>}
          <button className="border rounded px-2 py-1 text-sm text-gray-800 bg-gray-100 hover:bg-gray-200">
            {open ? 'Collapse ▲' : 'Expand ▼'}
          </button>
        </div>
      </div>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

// ---------- Page ----------
export default function ProceduresPage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [saving, setSaving] = useState(false);

  // Major
  const [angio, setAngio] = useState<Angio>({
    procedure_date: null,
    procedure_time: null,
    access_site: null,
    catheter_type: null,
    contrast_agent: null,
    contrast_volume_ml: null,
    lm_lesion_description: null,
    lad_lesion_description: null,
    lcx_lesion_description: null,
    rca_lesion_description: null,
    impression: null,
    advice: null,
    notes: null,
  });
  const [ptca, setPtca] = useState<PTCA>({
    procedure_date: null,
    procedure_time: null,
    access_site: null,
    guiding_catheter: null,
    contrast_agent: null,
    contrast_volume_ml: null,
    predilatation_details: null,
    stent_details: null,
    post_dilatation_details: null,
    timi_flow_post: null,
    complications: null,
    procedure_success: null,
    notes: null,
  });
  const [echo, setEcho] = useState<Echo>({
    echo_date: null,
    ef_percent: null,
    lv_function: null,
    rwma: null,
    valve_findings: null,
  });

  // Others
  const [poba, setPoba] = useState<POBA>({ procedure_datetime: null, contrast_volume_ml: null, access_site: null });
  const [thrombus, setThrombus] = useState<ThrombusAsp>({ procedure_datetime: null, contrast_volume_ml: null, access_site: null });
  const [iabp, setIabp] = useState<IABP>({ iabp_inserted: false, insertion_datetime: null, indication: null, removal_datetime: null });
  const [tpi, setTpi] = useState<TPI>({ insertion_datetime: null, device_type: null, indication: null });
  const [device, setDevice] = useState<DeviceInsertion>({ insertion_datetime: null, device_type: null, indication: null, remarks: null });

  // Saved badges
  const [savedAngio, setSavedAngio] = useState(false);
  const [savedPtca, setSavedPtca] = useState(false);
  const [savedEcho, setSavedEcho] = useState(false);
  const [savedPoba, setSavedPoba] = useState(false);
  const [savedThrombus, setSavedThrombus] = useState(false);
  const [savedIabp, setSavedIabp] = useState(false);
  const [savedTpi, setSavedTpi] = useState(false);
  const [savedDevice, setSavedDevice] = useState(false);

  // ---------- Load patient + data ----------
  useEffect(() => {
    (async () => {
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
      if (!p) return;
      setPatient(p);

      // Load each procedure (assume at most one row per patient in each table)
      const [{ data: a }, { data: pr }, { data: er }, { data: po }, { data: tr }, { data: ib }, { data: tp }, { data: di }] =
        await Promise.all([
          supabase.from('angiography_raw').select('*').eq('patient_id', p.id).limit(1),
          supabase.from('ptca_raw').select('*').eq('patient_id', p.id).limit(1),
          supabase.from('echo_report').select('*').eq('patient_id', p.id).limit(1),
          supabase.from('poba_report').select('*').eq('patient_id', p.id).limit(1),
          supabase.from('thrombus_aspiration_report').select('*').eq('patient_id', p.id).limit(1),
          supabase.from('iabp_report').select('*').eq('patient_id', p.id).limit(1),
          supabase.from('tpi_report').select('*').eq('patient_id', p.id).limit(1),
          supabase.from('device_insertion_report').select('*').eq('patient_id', p.id).limit(1),
        ]);

      if (a && a[0]) {
        const x = a[0];
        setAngio({
          id: x.id,
          procedure_date: x.procedure_date ?? null,
          procedure_time: x.procedure_time ?? null,
          access_site: x.access_site ?? null,
          catheter_type: x.catheter_type ?? null,
          contrast_agent: x.contrast_agent ?? null,
          contrast_volume_ml: x.contrast_volume_ml ?? null,
          lm_lesion_description: x.lm_lesion_description ?? null,
          lad_lesion_description: x.lad_lesion_description ?? null,
          lcx_lesion_description: x.lcx_lesion_description ?? null,
          rca_lesion_description: x.rca_lesion_description ?? null,
          impression: x.impression ?? null,
          advice: x.advice ?? null,
          notes: x.notes ?? null,
        });
        setSavedAngio(true);
      }

      if (pr && pr[0]) {
        const x = pr[0];
        setPtca({
          id: x.id,
          procedure_date: x.procedure_date ?? null,
          procedure_time: x.procedure_time ?? null,
          access_site: x.access_site ?? null,
          guiding_catheter: x.guiding_catheter ?? null,
          contrast_agent: x.contrast_agent ?? null,
          contrast_volume_ml: x.contrast_volume_ml ?? null,
          predilatation_details: x.predilatation_details ?? null,
          stent_details: x.stent_details ?? null,
          post_dilatation_details: x.post_dilatation_details ?? null,
          timi_flow_post: x.timi_flow_post ?? null,
          complications: x.complications ?? null,
          procedure_success: x.procedure_success ?? null,
          notes: x.notes ?? null,
        });
        setSavedPtca(true);
      }

      if (er && er[0]) {
        const x = er[0];
        setEcho({
          id: x.id,
          echo_date: x.echo_date ?? null,
          ef_percent: x.ef_percent ?? null,
          lv_function: x.lv_function ?? null,
          rwma: x.rwma ?? null,
          valve_findings: x.valve_findings ?? null,
        });
        setSavedEcho(true);
      }

      if (po && po[0]) {
        const x = po[0];
        setPoba({
          id: x.id,
          procedure_datetime: dtLocalFromISO(x.procedure_datetime),
          contrast_volume_ml: x.contrast_volume_ml ?? null,
          access_site: x.access_site ?? null,
        });
        setSavedPoba(true);
      }

      if (tr && tr[0]) {
        const x = tr[0];
        setThrombus({
          id: x.id,
          procedure_datetime: dtLocalFromISO(x.procedure_datetime),
          contrast_volume_ml: x.contrast_volume_ml ?? null,
          access_site: x.access_site ?? null,
        });
        setSavedThrombus(true);
      }

      if (ib && ib[0]) {
        const x = ib[0];
        setIabp({
          id: x.id,
          iabp_inserted: !!x.iabp_inserted,
          insertion_datetime: x.insertion_datetime ? dtLocalFromISO(x.insertion_datetime) : null,
          indication: x.indication ?? null,
          removal_datetime: x.removal_datetime ? dtLocalFromISO(x.removal_datetime) : null,
        });
        setSavedIabp(true);
      }

      if (tp && tp[0]) {
        const x = tp[0];
        setTpi({
          id: x.id,
          insertion_datetime: x.insertion_datetime ? dtLocalFromISO(x.insertion_datetime) : null,
          device_type: x.device_type ?? null,
          indication: x.indication ?? null,
        });
        setSavedTpi(true);
      }

      if (di && di[0]) {
        const x = di[0];
        setDevice({
          id: x.id,
          insertion_datetime: x.insertion_datetime ? dtLocalFromISO(x.insertion_datetime) : null,
          device_type: x.device_type ?? null,
          indication: x.indication ?? null,
          remarks: x.remarks ?? null,
        });
        setSavedDevice(true);
      }
    })();
  }, []);

  const canSave = useMemo(() => !!patient && !saving, [patient, saving]);

  // ---------- Save All ----------
  async function saveAll() {
    if (!patient) return;
    setSaving(true);
    try {
      // CAG
      if (angio.procedure_date || angio.procedure_time || angio.access_site || angio.contrast_volume_ml !== null) {
        const payload = {
          patient_id: patient.id,
          procedure_date: angio.procedure_date,
          procedure_time: angio.procedure_time,
          access_site: angio.access_site,
          catheter_type: angio.catheter_type,
          contrast_agent: angio.contrast_agent,
          contrast_volume_ml: angio.contrast_volume_ml,
          lm_lesion_description: angio.lm_lesion_description,
          lad_lesion_description: angio.lad_lesion_description,
          lcx_lesion_description: angio.lcx_lesion_description,
          rca_lesion_description: angio.rca_lesion_description,
          impression: angio.impression,
          advice: angio.advice,
          notes: angio.notes,
        };
        if (angio.id) {
          await supabase.from('angiography_raw').update(payload).eq('id', angio.id);
        } else {
          const { data, error } = await supabase.from('angiography_raw').insert(payload).select('id').single();
          if (error) throw error;
          setAngio(prev => ({ ...prev, id: data.id }));
        }
        setSavedAngio(true);
      }

      // PTCA
      if (ptca.procedure_date || ptca.procedure_time || ptca.access_site || ptca.contrast_volume_ml !== null) {
        const payload = {
          patient_id: patient.id,
          procedure_date: ptca.procedure_date,
          procedure_time: ptca.procedure_time,
          access_site: ptca.access_site,
          guiding_catheter: ptca.guiding_catheter,
          contrast_agent: ptca.contrast_agent,
          contrast_volume_ml: ptca.contrast_volume_ml,
          predilatation_details: ptca.predilatation_details,
          stent_details: ptca.stent_details,
          post_dilatation_details: ptca.post_dilatation_details,
          timi_flow_post: ptca.timi_flow_post,
          complications: ptca.complications,
          procedure_success: ptca.procedure_success,
          notes: ptca.notes,
        };
        if (ptca.id) {
          await supabase.from('ptca_raw').update(payload).eq('id', ptca.id);
        } else {
          const { data, error } = await supabase.from('ptca_raw').insert(payload).select('id').single();
          if (error) throw error;
          setPtca(prev => ({ ...prev, id: data.id }));
        }
        setSavedPtca(true);
      }

      // Echo
      if (echo.echo_date || echo.ef_percent !== null || echo.lv_function || echo.rwma || echo.valve_findings) {
        const payload = {
          patient_id: patient.id,
          echo_date: echo.echo_date,
          ef_percent: echo.ef_percent,
          lv_function: echo.lv_function,
          rwma: echo.rwma,
          valve_findings: echo.valve_findings,
        };
        if (echo.id) {
          await supabase.from('echo_report').update(payload).eq('id', echo.id);
        } else {
          const { data, error } = await supabase.from('echo_report').insert(payload).select('id').single();
          if (error) throw error;
          setEcho(prev => ({ ...prev, id: data.id }));
        }
        setSavedEcho(true);
      }

      // POBA
      if (poba.procedure_datetime || poba.contrast_volume_ml !== null || poba.access_site) {
        const payload = {
          patient_id: patient.id,
          procedure_datetime: isoFromDtLocal(poba.procedure_datetime),
          contrast_volume_ml: poba.contrast_volume_ml,
          access_site: poba.access_site,
        };
        if (poba.id) {
          await supabase.from('poba_report').update(payload).eq('id', poba.id);
        } else {
          const { data, error } = await supabase.from('poba_report').insert(payload).select('id').single();
          if (error) throw error;
          setPoba(prev => ({ ...prev, id: data.id }));
        }
        setSavedPoba(true);
      }

      // Thrombus Aspiration
      if (thrombus.procedure_datetime || thrombus.contrast_volume_ml !== null || thrombus.access_site) {
        const payload = {
          patient_id: patient.id,
          procedure_datetime: isoFromDtLocal(thrombus.procedure_datetime),
          contrast_volume_ml: thrombus.contrast_volume_ml,
          access_site: thrombus.access_site,
        };
        if (thrombus.id) {
          await supabase.from('thrombus_aspiration_report').update(payload).eq('id', thrombus.id);
        } else {
          const { data, error } = await supabase.from('thrombus_aspiration_report').insert(payload).select('id').single();
          if (error) throw error;
          setThrombus(prev => ({ ...prev, id: data.id }));
        }
        setSavedThrombus(true);
      }

      // IABP
      if (
        iabp.iabp_inserted !== false ||
        iabp.insertion_datetime ||
        iabp.removal_datetime ||
        iabp.indication
      ) {
        const payload = {
          patient_id: patient.id,
          iabp_inserted: iabp.iabp_inserted,
          insertion_datetime: isoFromDtLocal(iabp.insertion_datetime),
          indication: iabp.indication,
          removal_datetime: isoFromDtLocal(iabp.removal_datetime),
        };
        if (iabp.id) {
          await supabase.from('iabp_report').update(payload).eq('id', iabp.id);
        } else {
          const { data, error } = await supabase.from('iabp_report').insert(payload).select('id').single();
          if (error) throw error;
          setIabp(prev => ({ ...prev, id: data.id }));
        }
        setSavedIabp(true);
      }

      // TPI
      if (tpi.insertion_datetime || tpi.device_type || tpi.indication) {
        const payload = {
          patient_id: patient.id,
          insertion_datetime: isoFromDtLocal(tpi.insertion_datetime),
          device_type: tpi.device_type,
          indication: tpi.indication,
        };
        if (tpi.id) {
          await supabase.from('tpi_report').update(payload).eq('id', tpi.id);
        } else {
          const { data, error } = await supabase.from('tpi_report').insert(payload).select('id').single();
          if (error) throw error;
          setTpi(prev => ({ ...prev, id: data.id }));
        }
        setSavedTpi(true);
      }

      // Device Insertion
      if (device.insertion_datetime || device.device_type || device.indication || device.remarks) {
        const payload = {
          patient_id: patient.id,
          insertion_datetime: isoFromDtLocal(device.insertion_datetime),
          device_type: device.device_type,
          indication: device.indication,
          remarks: device.remarks,
        };
        if (device.id) {
          await supabase.from('device_insertion_report').update(payload).eq('id', device.id);
        } else {
          const { data, error } = await supabase.from('device_insertion_report').insert(payload).select('id').single();
          if (error) throw error;
          setDevice(prev => ({ ...prev, id: data.id }));
        }
        setSavedDevice(true);
      }

      alert('✅ Saved successfully');
    } catch (err) {
      console.error(err);
      alert('❌ Save failed — check console');
    } finally {
      setSaving(false);
    }
  }

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-gray-100 p-5 flex flex-col items-center">
      <h1 className="text-3xl font-extrabold mb-4 text-gray-900">📋 Procedures</h1>

      {patient && (
        <div className="bg-blue-50 border border-blue-200 rounded w-full max-w-6xl p-3 mb-4 text-gray-900">
          <strong>Patient:</strong> {patient.patient_name ?? '-'} — <strong>IPD:</strong> {patient.ipd_number}
        </div>
      )}

      {/* ===================== MAJOR PROCEDURES ===================== */}
      <Card title={<span>🩻 Coronary Angiography (CAG)</span>} saved={savedAngio}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-gray-800">Date</label>
            <input
              type="date"
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={angio.procedure_date ?? ''}
              onChange={e => setAngio(prev => ({ ...prev, procedure_date: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Time</label>
            <input
              type="time"
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={angio.procedure_time ?? ''}
              onChange={e => setAngio(prev => ({ ...prev, procedure_time: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Access Site</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={angio.access_site ?? ''}
              onChange={e => setAngio(prev => ({ ...prev, access_site: e.target.value || null }))}
            />
          </div>

          <div>
            <label className="text-sm text-gray-800">Catheter Type</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={angio.catheter_type ?? ''}
              onChange={e => setAngio(prev => ({ ...prev, catheter_type: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Contrast Agent</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={angio.contrast_agent ?? ''}
              onChange={e => setAngio(prev => ({ ...prev, contrast_agent: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Contrast Volume (ml)</label>
            <input
              type="number"
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={angio.contrast_volume_ml ?? ''}
              onChange={e => setAngio(prev => ({ ...prev, contrast_volume_ml: toNumOrNull(e.target.value) }))}
            />
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-sm text-gray-800">LM Lesion</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={angio.lm_lesion_description ?? ''}
              onChange={e => setAngio(prev => ({ ...prev, lm_lesion_description: e.target.value || null }))}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-sm text-gray-800">LAD Lesion</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={angio.lad_lesion_description ?? ''}
              onChange={e => setAngio(prev => ({ ...prev, lad_lesion_description: e.target.value || null }))}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-sm text-gray-800">LCx Lesion</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={angio.lcx_lesion_description ?? ''}
              onChange={e => setAngio(prev => ({ ...prev, lcx_lesion_description: e.target.value || null }))}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-sm text-gray-800">RCA Lesion</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={angio.rca_lesion_description ?? ''}
              onChange={e => setAngio(prev => ({ ...prev, rca_lesion_description: e.target.value || null }))}
            />
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-sm text-gray-800">Impression</label>
            <textarea
              className="border border-gray-300 rounded p-2 text-sm w-full min-h-[80px] text-gray-900"
              value={angio.impression ?? ''}
              onChange={e => setAngio(prev => ({ ...prev, impression: e.target.value || null }))}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-sm text-gray-800">Advice / Notes</label>
            <textarea
              className="border border-gray-300 rounded p-2 text-sm w-full min-h-[80px] text-gray-900"
              value={angio.advice ?? angio.notes ?? ''}
              onChange={e => setAngio(prev => ({ ...prev, advice: e.target.value || null, notes: e.target.value || null }))}
            />
          </div>
        </div>
      </Card>

      <Card title={<span>🫀 PTCA</span>} saved={savedPtca}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-gray-800">Date</label>
            <input
              type="date"
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={ptca.procedure_date ?? ''}
              onChange={e => setPtca(prev => ({ ...prev, procedure_date: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Time</label>
            <input
              type="time"
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={ptca.procedure_time ?? ''}
              onChange={e => setPtca(prev => ({ ...prev, procedure_time: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Access Site</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={ptca.access_site ?? ''}
              onChange={e => setPtca(prev => ({ ...prev, access_site: e.target.value || null }))}
            />
          </div>

          <div>
            <label className="text-sm text-gray-800">Guiding Catheter</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={ptca.guiding_catheter ?? ''}
              onChange={e => setPtca(prev => ({ ...prev, guiding_catheter: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Contrast Agent</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={ptca.contrast_agent ?? ''}
              onChange={e => setPtca(prev => ({ ...prev, contrast_agent: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Contrast Volume (ml)</label>
            <input
              type="number"
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={ptca.contrast_volume_ml ?? ''}
              onChange={e => setPtca(prev => ({ ...prev, contrast_volume_ml: toNumOrNull(e.target.value) }))}
            />
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-sm text-gray-800">Predilatation Details</label>
            <textarea
              className="border border-gray-300 rounded p-2 text-sm w-full min-h-[60px] text-gray-900"
              value={ptca.predilatation_details ?? ''}
              onChange={e => setPtca(prev => ({ ...prev, predilatation_details: e.target.value || null }))}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-sm text-gray-800">Stent Details</label>
            <textarea
              className="border border-gray-300 rounded p-2 text-sm w-full min-h-[60px] text-gray-900"
              value={ptca.stent_details ?? ''}
              onChange={e => setPtca(prev => ({ ...prev, stent_details: e.target.value || null }))}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-sm text-gray-800">Post-dilatation Details</label>
            <textarea
              className="border border-gray-300 rounded p-2 text-sm w-full min-h-[60px] text-gray-900"
              value={ptca.post_dilatation_details ?? ''}
              onChange={e => setPtca(prev => ({ ...prev, post_dilatation_details: e.target.value || null }))}
            />
          </div>

          <div>
            <label className="text-sm text-gray-800">TIMI Flow (post)</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={ptca.timi_flow_post ?? ''}
              onChange={e => setPtca(prev => ({ ...prev, timi_flow_post: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Complications</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={ptca.complications ?? ''}
              onChange={e => setPtca(prev => ({ ...prev, complications: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Procedure Success</label>
            <select
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={ptca.procedure_success === null ? '' : ptca.procedure_success ? 'yes' : 'no'}
              onChange={e =>
                setPtca(prev => ({
                  ...prev,
                  procedure_success: e.target.value === '' ? null : e.target.value === 'yes',
                }))
              }
            >
              <option value="">—</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-sm text-gray-800">Notes</label>
            <textarea
              className="border border-gray-300 rounded p-2 text-sm w-full min-h-[80px] text-gray-900"
              value={ptca.notes ?? ''}
              onChange={e => setPtca(prev => ({ ...prev, notes: e.target.value || null }))}
            />
          </div>
        </div>
      </Card>

      <Card title={<span>🫀 2D Echo</span>} saved={savedEcho}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-gray-800">Echo Date</label>
            <input
              type="date"
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={echo.echo_date ?? ''}
              onChange={e => setEcho(prev => ({ ...prev, echo_date: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">EF (%)</label>
            <input
              type="number"
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={echo.ef_percent ?? ''}
              onChange={e => setEcho(prev => ({ ...prev, ef_percent: toNumOrNull(e.target.value) }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">LV Function</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={echo.lv_function ?? ''}
              onChange={e => setEcho(prev => ({ ...prev, lv_function: e.target.value || null }))}
            />
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-sm text-gray-800">RWMA</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={echo.rwma ?? ''}
              onChange={e => setEcho(prev => ({ ...prev, rwma: e.target.value || null }))}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-sm text-gray-800">Valve Findings</label>
            <textarea
              className="border border-gray-300 rounded p-2 text-sm w-full min-h-[80px] text-gray-900"
              value={echo.valve_findings ?? ''}
              onChange={e => setEcho(prev => ({ ...prev, valve_findings: e.target.value || null }))}
            />
          </div>
        </div>
      </Card>

      {/* ===================== OTHER PROCEDURES ===================== */}
      <h3 className="w-full max-w-6xl text-lg font-bold text-gray-800 mt-2 mb-2">🧰 Other Procedures</h3>

      <Card title={<span>🩹 POBA</span>} saved={savedPoba} defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-gray-800">Procedure Date & Time</label>
            <input
              type="datetime-local"
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={poba.procedure_datetime ?? ''}
              onChange={e => setPoba(prev => ({ ...prev, procedure_datetime: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Contrast Volume (ml)</label>
            <input
              type="number"
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={poba.contrast_volume_ml ?? ''}
              onChange={e => setPoba(prev => ({ ...prev, contrast_volume_ml: toNumOrNull(e.target.value) }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Access Site</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={poba.access_site ?? ''}
              onChange={e => setPoba(prev => ({ ...prev, access_site: e.target.value || null }))}
            />
          </div>
        </div>
      </Card>

      <Card title={<span>🧲 Thrombus Aspiration</span>} saved={savedThrombus} defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-gray-800">Procedure Date & Time</label>
            <input
              type="datetime-local"
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={thrombus.procedure_datetime ?? ''}
              onChange={e => setThrombus(prev => ({ ...prev, procedure_datetime: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Contrast Volume (ml)</label>
            <input
              type="number"
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={thrombus.contrast_volume_ml ?? ''}
              onChange={e => setThrombus(prev => ({ ...prev, contrast_volume_ml: toNumOrNull(e.target.value) }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Access Site</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={thrombus.access_site ?? ''}
              onChange={e => setThrombus(prev => ({ ...prev, access_site: e.target.value || null }))}
            />
          </div>
        </div>
      </Card>

      <Card title={<span>🫁 IABP</span>} saved={savedIabp} defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-gray-800">IABP Inserted</label>
            <select
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={iabp.iabp_inserted ? 'yes' : 'no'}
              onChange={e => setIabp(prev => ({ ...prev, iabp_inserted: e.target.value === 'yes' }))}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-800">Insertion Date & Time</label>
            <input
              type="datetime-local"
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={iabp.insertion_datetime ?? ''}
              onChange={e => setIabp(prev => ({ ...prev, insertion_datetime: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Removal Date & Time</label>
            <input
              type="datetime-local"
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={iabp.removal_datetime ?? ''}
              onChange={e => setIabp(prev => ({ ...prev, removal_datetime: e.target.value || null }))}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-sm text-gray-800">Indication</label>
            <textarea
              className="border border-gray-300 rounded p-2 text-sm w-full min-h-[60px] text-gray-900"
              value={iabp.indication ?? ''}
              onChange={e => setIabp(prev => ({ ...prev, indication: e.target.value || null }))}
            />
          </div>
        </div>
      </Card>

      <Card title={<span>⚡ Temporary Pacemaker (TPI)</span>} saved={savedTpi} defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-gray-800">Insertion Date & Time</label>
            <input
              type="datetime-local"
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={tpi.insertion_datetime ?? ''}
              onChange={e => setTpi(prev => ({ ...prev, insertion_datetime: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Device Type</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={tpi.device_type ?? ''}
              onChange={e => setTpi(prev => ({ ...prev, device_type: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Indication</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={tpi.indication ?? ''}
              onChange={e => setTpi(prev => ({ ...prev, indication: e.target.value || null }))}
            />
          </div>
        </div>
      </Card>

      <Card title={<span>🛠️ Device Insertion</span>} saved={savedDevice} defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-gray-800">Insertion Date & Time</label>
            <input
              type="datetime-local"
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={device.insertion_datetime ?? ''}
              onChange={e => setDevice(prev => ({ ...prev, insertion_datetime: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Device Type</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={device.device_type ?? ''}
              onChange={e => setDevice(prev => ({ ...prev, device_type: e.target.value || null }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-800">Indication</label>
            <input
              className="border border-gray-300 rounded p-2 text-sm w-full text-gray-900"
              value={device.indication ?? ''}
              onChange={e => setDevice(prev => ({ ...prev, indication: e.target.value || null }))}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-sm text-gray-800">Remarks</label>
            <textarea
              className="border border-gray-300 rounded p-2 text-sm w-full min-h-[60px] text-gray-900"
              value={device.remarks ?? ''}
              onChange={e => setDevice(prev => ({ ...prev, remarks: e.target.value || null }))}
            />
          </div>
        </div>
      </Card>

      <div className="w-full max-w-6xl mt-2 mb-8">
        <button
          onClick={saveAll}
          disabled={!canSave}
          className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save All'}
        </button>
      </div>
    </div>
  );
}
