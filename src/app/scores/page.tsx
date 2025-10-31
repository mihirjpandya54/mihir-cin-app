'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// ---------- Supabase client ----------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---------- constants ----------
const USER_ID = '00000000-0000-0000-0000-000000000001'; // same pattern used elsewhere

// ---------- types ----------
type RiskScoresRow = {
  id?: string | null;
  patient_id?: string | null;
  mehran1_score?: number | null;
  mehran1_risk_category?: string | null;
  mehran2_score?: number | null;
  mehran2_risk_category?: string | null;
  acef_score?: number | null;
  acef_risk_category?: string | null;
  acef2_score?: number | null;
  acef2_risk_category?: string | null;
};

export default function ScoresPage(): JSX.Element {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedRow, setSavedRow] = useState<RiskScoresRow | null>(null);

  // ----------------- Form inputs (manual only) -----------------
  // Shared / Mehran
  const [age, setAge] = useState<number | ''>('');
  const [sex, setSex] = useState<'Male' | 'Female' | 'Other' | ''>('');
  const [scr, setScr] = useState<number | ''>(''); // mg/dL
  const [egfr, setEgfr] = useState<number | ''>(''); // mL/min/1.73m2
  const [hb, setHb] = useState<number | ''>(''); // g/dL (for anemia)
  const [diabetesType, setDiabetesType] = useState<'none' | 'non-insulin' | 'insulin' | ''>('');
  const [chf, setChf] = useState<boolean>(false);
  const [hypotension, setHypotension] = useState<boolean>(false); // periprocedural low
  const [iabp, setIabp] = useState<boolean>(false);
  const [contrastVolumeMl, setContrastVolumeMl] = useState<number | ''>('');
  const [lvef, setLvef] = useState<number | ''>(''); // %
  const [presentation, setPresentation] = useState<'stable' | 'unstable-angina' | 'nstemi' | 'stemi' | ''>('');
  const [basalGlucose, setBasalGlucose] = useState<number | ''>(''); // mg/dL
  const [proceduralBleed, setProceduralBleed] = useState<boolean>(false); // Hb drop >3g/dL
  const [slowFlow, setSlowFlow] = useState<boolean>(false); // TIMI 0–1
  const [complexAnatomy, setComplexAnatomy] = useState<boolean>(false);
  const [isEmergency, setIsEmergency] = useState<boolean>(false);
  const [hematocrit, setHematocrit] = useState<number | ''>(''); // %

  // ----------------- load active patient -----------------
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: active } = await supabase
          .from('active_patient')
          .select('patient_id')
          .eq('user_id', USER_ID)
          .maybeSingle();

        setPatientId(active?.patient_id ?? null);

        if (active?.patient_id) {
          const { data: rs } = await supabase
            .from('risk_scores')
            .select('*')
            .eq('patient_id', active.patient_id)
            .limit(1)
            .maybeSingle();

          if (rs) {
            setSavedRow(rs as RiskScoresRow);
          }
        }
      } catch (err) {
        // Keep console error for debugging
        // eslint-disable-next-line no-console
        console.error('load error', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ----------------- Calculation helpers -----------------

  // Mehran original (Model A: uses baseline creatinine >=1.5 mg/dL)
  function calcMehran(): { score: number; category: string } {
    let score = 0;

    if (hypotension) score += 5;
    if (iabp) score += 5;
    if (chf) score += 5;
    if (typeof scr === 'number' && scr >= 1.5) score += 4;
    if (typeof age === 'number' && age >= 75) score += 4;

    if (typeof hb === 'number') {
      const maleCut = 13;
      const femaleCut = 12;
      if (sex === 'Male' && hb <= maleCut) score += 3;
      if (sex === 'Female' && hb <= femaleCut) score += 3;
      if (!sex && hb <= 12.5) score += 3;
    }

    if (diabetesType && diabetesType !== 'none') score += 3;

    if (typeof contrastVolumeMl === 'number' && contrastVolumeMl > 0) {
      score += Math.floor(contrastVolumeMl / 100);
    }

    let cat = 'Low';
    if (score <= 5) cat = 'Low';
    else if (score <= 10) cat = 'Moderate';
    else if (score <= 15) cat = 'High';
    else cat = 'Very high';

    return { score, category: cat };
  }

  // Mehran-2 Model 1 (pre-procedural)
  function calcMehran2Model1(): { score: number; category: string } {
    let score = 0;

    if (presentation === 'unstable-angina') score += 2;
    if (presentation === 'nstemi') score += 4;
    if (presentation === 'stemi') score += 8;

    if (typeof egfr === 'number') {
      if (egfr >= 60) score += 0;
      else if (egfr >= 30) score += 1;
      else score += 4;
    }

    if (typeof lvef === 'number' && lvef < 40) score += 2;

    if (diabetesType === 'non-insulin') score += 1;
    else if (diabetesType === 'insulin') score += 2;

    if (typeof hb === 'number' && hb < 11) score += 1;

    if (typeof basalGlucose === 'number' && basalGlucose >= 150) score += 1;

    if (chf) score += 1;

    if (typeof age === 'number' && age > 75) score += 1;

    let cat = 'Low';
    if (score <= 2) cat = 'Low';
    else if (score <= 7) cat = 'Moderate';
    else if (score <= 11) cat = 'High';
    else cat = 'Very high';

    return { score, category: cat };
  }

  // Mehran-2 Model 2 (adds procedural items)
  function calcMehran2Model2(model1Score: number): { score: number; category: string } {
    let score = model1Score;

    if (typeof contrastVolumeMl === 'number') {
      if (contrastVolumeMl < 100) score += 0;
      else if (contrastVolumeMl < 200) score += 1;
      else if (contrastVolumeMl < 300) score += 2;
      else score += 4;
    }

    if (proceduralBleed) score += 4;
    if (slowFlow) score += 2;
    if (complexAnatomy) score += 1;

    let cat = 'Low';
    if (score <= 4) cat = 'Low';
    else if (score <= 9) cat = 'Moderate';
    else if (score <= 13) cat = 'High';
    else cat = 'Very high';

    return { score, category: cat };
  }

  // ACEF
  function calcACEF(): { score: number | null; category: string } {
    if (typeof age !== 'number' || typeof lvef !== 'number' || lvef === 0) return { score: null, category: '—' };
    let acef = age / lvef;
    if (typeof scr === 'number' && scr > 2.0) acef += 1;
    const cat = acef < 0.8 ? 'Low' : acef < 1.2 ? 'Moderate' : 'High';
    return { score: Number(acef.toFixed(3)), category: cat };
  }

  // ACEF-II
  function calcACEF2(): { score: number | null; category: string } {
    if (typeof age !== 'number' || typeof lvef !== 'number' || lvef === 0) return { score: null, category: '—' };
    let acef2 = age / lvef;
    if (typeof scr === 'number' && scr > 2.0) acef2 += 2;
    if (isEmergency) acef2 += 3;
    if (typeof hematocrit === 'number' && hematocrit < 36) {
      acef2 += 0.2 * (36 - hematocrit);
    }
    const cat = acef2 < 1 ? 'Low' : acef2 < 2 ? 'Moderate' : 'High';
    return { score: Number(acef2.toFixed(3)), category: cat };
  }

  // ----------------- memoized results -----------------
  const mehran = useMemo(() => calcMehran(), [hypotension, iabp, chf, scr, age, hb, diabetesType, contrastVolumeMl, sex]);
  const mehran2_model1 = useMemo(() => calcMehran2Model1(), [presentation, egfr, lvef, diabetesType, hb, basalGlucose, chf, age]);
  const mehran2_model2 = useMemo(
    () => calcMehran2Model2(mehran2_model1.score),
    [mehran2_model1.score, contrastVolumeMl, proceduralBleed, slowFlow, complexAnatomy]
  );
  const acef = useMemo(() => calcACEF(), [age, lvef, scr]);
  const acef2 = useMemo(() => calcACEF2(), [age, lvef, scr, isEmergency, hematocrit]);

  // ----------------- Save (upsert risk_scores) -----------------
  async function saveAll(): Promise<void> {
    if (!patientId) {
      alert('No active patient selected.');
      return;
    }
    setSaving(true);
    try {
      const payload: RiskScoresRow = {
        patient_id: patientId,
        mehran1_score: Number(mehran.score),
        mehran1_risk_category: mehran.category,
        mehran2_score: Number(mehran2_model2.score),
        mehran2_risk_category: mehran2_model2.category,
        acef_score: acef.score ?? null,
        acef_risk_category: acef.category,
        acef2_score: acef2.score ?? null,
        acef2_risk_category: acef2.category
      };

      const { error } = await supabase.from('risk_scores').upsert(payload, { onConflict: 'patient_id' });

      if (error) {
        // eslint-disable-next-line no-console
        console.error('save error', error);
        alert('Save failed — check console.');
      } else {
        alert('Scores saved ✅');
        const { data: fresh } = await supabase.from('risk_scores').select('*').eq('patient_id', patientId).maybeSingle();
        setSavedRow(fresh as RiskScoresRow);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('saveAll error', err);
      alert('Save failed — check console.');
    } finally {
      setSaving(false);
    }
  }

  // ----------------- UI helpers -----------------
  function numberInput(value: number | '' | undefined, onChange: (v: number | '') => void, placeholder = ''): JSX.Element {
    return (
      <input
        className="w-full rounded border px-2 py-1 text-sm text-gray-900"
        value={value === '' || value === undefined || value === null ? '' : String(value)}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') onChange('');
          else {
            const n = Number(v);
            onChange(Number.isNaN(n) ? '' : n);
          }
        }}
      />
    );
  }

  if (loading) return <div className="p-6 text-gray-900">Loading…</div>;

  // ----------------- Render -----------------
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Top summary */}
      <div className="w-full max-w-6xl mx-auto mb-4">
        <div className="bg-white rounded shadow p-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">🧮 Risk Scores — Summary</h1>
            <div className="text-sm text-gray-700 mt-1">Enter parameters manually in cards below. Summary updates live.</div>
          </div>

          <div className="flex gap-6 items-center text-gray-900">
            <div className="text-sm">
              <div>
                <strong className="text-gray-900">Mehran:</strong>{' '}
                <span className="font-semibold">{mehran.score} ({mehran.category})</span>
              </div>
              <div className="mt-1">
                <strong className="text-gray-900">Mehran-2 (M2):</strong>{' '}
                <span className="font-semibold">{mehran2_model2.score} ({mehran2_model2.category})</span>
              </div>
            </div>

            <div className="text-sm">
              <div>
                <strong className="text-gray-900">ACEF:</strong>{' '}
                <span className="font-semibold">{acef.score ?? '—'} ({acef.category})</span>
              </div>
              <div className="mt-1">
                <strong className="text-gray-900">ACEF-II:</strong>{' '}
                <span className="font-semibold">{acef2.score ?? '—'} ({acef2.category})</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="w-full max-w-6xl mx-auto space-y-6">
        {/* Mehran */}
        <div className="bg-white rounded shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-gray-900">Mehran (2004)</h2>
            <div className="text-sm text-gray-600">
              Score: <span className="font-semibold text-gray-900">{mehran.score}</span> — <span className="text-gray-900">{mehran.category}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-900">Age</label>
              {numberInput(age, setAge, 'years')}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-900">Sex</label>
              <select
                className="w-full rounded border px-2 py-1 text-sm text-gray-900"
                value={sex}
                onChange={(e) => setSex(e.target.value as any)}
              >
                <option value="">—</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-900">Baseline SCr (mg/dL)</label>
              {numberInput(scr, setScr, 'mg/dL')}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-900">Hb (g/dL)</label>
              {numberInput(hb, (v) => setHb(v), 'g/dL')}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-900">Diabetes</label>
              <select
                className="w-full rounded border px-2 py-1 text-sm text-gray-900"
                value={diabetesType}
                onChange={(e) => setDiabetesType(e.target.value as any)}
              >
                <option value="">—</option>
                <option value="none">No</option>
                <option value="non-insulin">Non-insulin treated</option>
                <option value="insulin">Insulin treated</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-900">Contrast volume (mL)</label>
              {numberInput(contrastVolumeMl, setContrastVolumeMl, 'mL')}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-900">CHF (NYHA III/IV or pulmonary edema)</label>
              <div>
                <input type="checkbox" checked={chf} onChange={(e) => setChf(e.target.checked)} />{' '}
                <span className="ml-2 text-sm text-gray-900">Yes</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-900">Hypotension (periprocedural)</label>
              <div>
                <input type="checkbox" checked={hypotension} onChange={(e) => setHypotension(e.target.checked)} />{' '}
                <span className="ml-2 text-sm text-gray-900">Yes</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-900">IABP</label>
              <div>
                <input type="checkbox" checked={iabp} onChange={(e) => setIabp(e.target.checked)} />{' '}
                <span className="ml-2 text-sm text-gray-900">Yes</span>
              </div>
            </div>
          </div>
        </div>

        {/* Mehran-2 */}
        <div className="bg-white rounded shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-gray-900">Mehran-2 (Lancet 2021)</h2>
            <div className="text-sm text-gray-600">
              Model1: <span className="font-semibold text-gray-900">{mehran2_model1.score}</span> — <span className="text-gray-900">{mehran2_model1.category}</span>
              <span className="mx-2">|</span>
              Model2: <span className="font-semibold text-gray-900">{mehran2_model2.score}</span> — <span className="text-gray-900">{mehran2_model2.category}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-900">Clinical presentation</label>
              <select
                className="w-full rounded border px-2 py-1 text-sm text-gray-900"
                value={presentation}
                onChange={(e) => setPresentation(e.target.value as any)}
              >
                <option value="">Stable / Asymptomatic</option>
                <option value="unstable-angina">Unstable angina</option>
                <option value="nstemi">NSTEMI</option>
                <option value="stemi">STEMI</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-900">eGFR (mL/min/1.73m²)</label>
              {numberInput(egfr, setEgfr, 'mL/min/1.73m²')}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-900">LVEF (%)</label>
              {numberInput(lvef, setLvef, '%')}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-900">Diabetes (type)</label>
              <select
                className="w-full rounded border px-2 py-1 text-sm text-gray-900"
                value={diabetesType}
                onChange={(e) => setDiabetesType(e.target.value as any)}
              >
                <option value="">—</option>
                <option value="none">No</option>
                <option value="non-insulin">Non-insulin</option>
                <option value="insulin">Insulin</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-900">Hb (g/dL)</label>
              {numberInput(hb, setHb, 'g/dL')}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-900">Basal glucose (mg/dL)</label>
              {numberInput(basalGlucose, setBasalGlucose, 'mg/dL')}
            </div>

            <div className="col-span-1 md:col-span-3">
              <label className="text-xs font-medium text-gray-900">Procedural items (Model 2)</label>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-2">
                <div>{numberInput(contrastVolumeMl, setContrastVolumeMl, 'Contrast mL')}</div>
                <div>
                  <label className="text-xs text-gray-900">Procedural bleeding (Hb drop &gt;3 g/dL)</label>
                  <div>
                    <input type="checkbox" checked={proceduralBleed} onChange={(e) => setProceduralBleed(e.target.checked)} />{' '}
                    <span className="ml-2 text-sm text-gray-900">Yes</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-900">Slow flow / no flow (TIMI 0–1)</label>
                  <div>
                    <input type="checkbox" checked={slowFlow} onChange={(e) => setSlowFlow(e.target.checked)} />{' '}
                    <span className="ml-2 text-sm text-gray-900">Yes</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-900">Complex anatomy</label>
                  <div>
                    <input type="checkbox" checked={complexAnatomy} onChange={(e) => setComplexAnatomy(e.target.checked)} />{' '}
                    <span className="ml-2 text-sm text-gray-900">Yes</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ACEF */}
        <div className="bg-white rounded shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-gray-900">ACEF</h2>
            <div className="text-sm text-gray-600">
              ACEF: <span className="font-semibold text-gray-900">{acef.score ?? '—'}</span> — <span className="text-gray-900">{acef.category}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>{numberInput(age, setAge, 'years')}</div>
            <div>{numberInput(lvef, setLvef, '%')}</div>
            <div>{numberInput(scr, setScr, 'mg/dL')}</div>
          </div>
        </div>

        {/* ACEF-II */}
        <div className="bg-white rounded shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-gray-900">ACEF-II</h2>
            <div className="text-sm text-gray-600">
              ACEF-II: <span className="font-semibold text-gray-900">{acef2.score ?? '—'}</span> — <span className="text-gray-900">{acef2.category}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>{numberInput(age, setAge, 'years')}</div>
            <div>{numberInput(lvef, setLvef, '%')}</div>
            <div>{numberInput(scr, setScr, 'mg/dL')}</div>
            <div>
              <label className="text-xs font-medium text-gray-900">Emergency</label>
              <div>
                <input type="checkbox" checked={isEmergency} onChange={(e) => setIsEmergency(e.target.checked)} />{' '}
                <span className="ml-2 text-sm text-gray-900">Yes</span>
              </div>

              <div className="mt-2 text-xs text-gray-900">Hematocrit (%)</div>
              {numberInput(hematocrit, setHematocrit, '%')}
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            onClick={saveAll}
            disabled={!patientId || saving}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save All Scores'}
          </button>
        </div>

        {/* existing saved row (if any) */}
        {savedRow && (
          <div className="bg-white rounded shadow p-3 text-sm text-gray-700">
            <div>
              <strong className="text-gray-900">Saved (last):</strong>
            </div>
            <div className="mt-1 text-gray-900">Mehran: {savedRow.mehran1_score} ({savedRow.mehran1_risk_category})</div>
            <div className="text-gray-900">Mehran-2: {savedRow.mehran2_score} ({savedRow.mehran2_risk_category})</div>
            <div className="text-gray-900">ACEF: {savedRow.acef_score} ({savedRow.acef_risk_category})</div>
            <div className="text-gray-900">ACEF-II: {savedRow.acef2_score} ({savedRow.acef2_risk_category})</div>
          </div>
        )}
      </div>
    </div>
  );
}
