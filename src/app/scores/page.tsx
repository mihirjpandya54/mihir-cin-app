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
  mehran1_predicted_risk?: number | null;
  mehran2_score?: number | null;
  mehran2_risk_category?: string | null;
  mehran2_predicted_risk?: number | null;
  acef_score?: number | null;
  acef_risk_category?: string | null;
  acef_predicted_risk?: number | null;
  acef2_score?: number | null;
  acef2_risk_category?: string | null;
  acef2_predicted_risk?: number | null;
  created_at?: string | null;
};

// small alias to avoid repeating React.createElement
const el = React.createElement;

export default function ScoresPage(): React.ReactElement {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [ipdNumber, setIpdNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedRow, setSavedRow] = useState<RiskScoresRow | null>(null);

  // ----------------- Form inputs (manual only) -----------------
  const [age, setAge] = useState<number | ''>('');
  const [sex, setSex] = useState<'Male' | 'Female' | 'Other' | ''>('');
  const [scr, setScr] = useState<number | ''>(''); // mg/dL (decimals allowed)
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

  // ----------------- load active patient & last saved scores -----------------
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: active } = await supabase
          .from('active_patient')
          .select('patient_id')
          .eq('user_id', USER_ID)
          .maybeSingle();

        const pid = (active as any)?.patient_id ?? null;
        setPatientId(pid);

        if (pid) {
          // fetch patient details
          const { data: pd } = await supabase
            .from('patient_details')
            .select('patient_name, ipd_number')
            .eq('id', pid)
            .maybeSingle();

          setPatientName((pd as any)?.patient_name ?? null);
          setIpdNumber((pd as any)?.ipd_number ?? null);

          // load last saved risk_scores if any
          const { data: rs } = await supabase
            .from('risk_scores')
            .select('*')
            .eq('patient_id', pid)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (rs) {
            setSavedRow(rs as RiskScoresRow);
          }
        }
      } catch (err) {
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
    if (typeof scr === 'number' && scr >= 1.5) score += 4; // baseline SCr >=1.5 mg/dL -> 4 pts
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
      // 1 point per 100 mL (rounded down)
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
    if (typeof scr === 'number' && scr > 2.0) acef += 1; // add 1 if serum creatinine > 2.0 mg/dL
    const cat = acef < 0.8 ? 'Low' : acef < 1.2 ? 'Moderate' : 'High';
    return { score: Number(acef.toFixed(3)), category: cat };
  }

  // ACEF-II
  function calcACEF2(): { score: number | null; category: string } {
    if (typeof age !== 'number' || typeof lvef !== 'number' || lvef === 0) return { score: null, category: '—' };
    let acef2 = age / lvef;
    if (typeof scr === 'number' && scr > 2.0) acef2 += 2; // ACEF-II uses +2 for creatinine >2.0
    if (isEmergency) acef2 += 3;
    if (typeof hematocrit === 'number' && hematocrit < 36) {
      acef2 += 0.2 * (36 - hematocrit); // 0.2 × (36 − Hct) if Hct < 36%
    }
    const cat = acef2 < 1 ? 'Low' : acef2 < 2 ? 'Moderate' : 'High';
    return { score: Number(acef2.toFixed(3)), category: cat };
  }

  // ----------------- Predicted risk mapping functions -----------------
  function mehranPredictedRiskPct(score: number): number {
    // mapping derived for display/storage (approx)
    if (score <= 5) return 7.5;
    if (score <= 10) return 14;
    if (score <= 15) return 26;
    return 57;
  }

  function mehran2PredictedRiskPct(score: number): number {
    if (score <= 4) return 2;
    if (score <= 9) return 7;
    if (score <= 13) return 15;
    return 25;
  }

  function acefPredictedRiskPct(value: number | null): number | null {
    if (value === null) return null;
    if (value < 0.8) return 2;
    if (value < 1.2) return 5;
    return 8;
  }

  function acef2PredictedRiskPct(value: number | null): number | null {
    if (value === null) return null;
    if (value < 1) return 2;
    if (value < 2) return 5;
    return 8;
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

  // predicted risk values
  const mehranPredPct = useMemo(() => mehranPredictedRiskPct(mehran.score), [mehran.score]);
  const mehran2PredPct = useMemo(() => mehran2PredictedRiskPct(mehran2_model2.score), [mehran2_model2.score]);
  const acefPredPct = useMemo(() => acefPredictedRiskPct(acef.score ?? null), [acef.score]);
  const acef2PredPct = useMemo(() => acef2PredictedRiskPct(acef2.score ?? null), [acef2.score]);

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
        mehran1_predicted_risk: Number(mehranPredPct),
        mehran2_score: Number(mehran2_model2.score),
        mehran2_risk_category: mehran2_model2.category,
        mehran2_predicted_risk: Number(mehran2PredPct),
        acef_score: acef.score ?? null,
        acef_risk_category: acef.category,
        acef_predicted_risk: acefPredPct ?? null,
        acef2_score: acef2.score ?? null,
        acef2_risk_category: acef2.category,
        acef2_predicted_risk: acef2PredPct ?? null
      };

      const { error } = await supabase.from('risk_scores').upsert(payload, { onConflict: 'patient_id' });

      if (error) {
        // eslint-disable-next-line no-console
        console.error('save error', error);
        alert('Save failed — check console.');
      } else {
        alert('Scores saved ✅');
        const { data: fresh } = await supabase
          .from('risk_scores')
          .select('*')
          .eq('patient_id', patientId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fresh) setSavedRow(fresh as RiskScoresRow);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('saveAll error', err);
      alert('Save failed — check console.');
    } finally {
      setSaving(false);
    }
  }

  // ----------------- UI helpers (non-JSX) -----------------
  function numberInput(
    value: number | '' | undefined,
    onChange: (v: number | '') => void,
    placeholder = ''
  ): React.ReactElement {
    // use type=number and step to allow decimals (including values < 1)
    return el('input', {
      type: 'number',
      step: '0.01',
      inputMode: 'decimal',
      className: 'w-full rounded border px-2 py-1 text-sm text-gray-900',
      value: value === '' || value === undefined || value === null ? '' : String(value),
      placeholder,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        if (v === '') onChange('');
        else {
          const n = Number(v);
          onChange(Number.isNaN(n) ? '' : n);
        }
      }
    });
  }

  // boolean select (No / Yes) returns select element and updates boolean state
  function booleanSelect(value: boolean, onChange: (b: boolean) => void): React.ReactElement {
    return el('select', {
      className: 'w-full rounded border px-2 py-1 text-sm text-gray-900',
      value: value ? 'yes' : 'no',
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value === 'yes')
    },
      el('option', { value: 'no' }, 'No'),
      el('option', { value: 'yes' }, 'Yes')
    );
  }

  // labeled block that shows label with a short hint in brackets (per your request)
  function labeledBlock(labelText: string, hint: string, child: React.ReactElement): React.ReactElement {
    return el(
      'div',
      { className: 'space-y-2' },
      el('label', { className: 'text-xs font-medium text-gray-900' },
        `${labelText} `,
        el('span', { className: 'text-xs text-gray-600' }, `— ${hint}`)
      ),
      child
    );
  }

  if (loading) return el('div', { className: 'p-6 text-gray-900' }, 'Loading…');

  // ----------------- Build UI programmatically -----------------

  // Active patient header
  const patientHeader = el('div', { className: 'text-sm text-gray-700' },
    el('div', null, el('strong', null, 'Active patient: '), patientName ? `${patientName} (IPD: ${ipdNumber ?? '—'})` : '—')
  );

  // summary block (top)
  const summaryBlock = el(
    'div',
    { className: 'w-full max-w-6xl mx-auto mb-4' },
    el(
      'div',
      { className: 'bg-white rounded shadow p-4 flex items-center justify-between gap-4' },
      el('div', null,
        el('h1', { className: 'text-xl font-bold text-gray-900' }, '🧮 Risk Scores — Summary'),
        el('div', { className: 'text-sm text-gray-700 mt-1' }, 'Enter parameters manually in cards below. Summary updates live.'),
        el('div', { className: 'mt-2' }, patientHeader)
      ),
      el('div', { className: 'flex gap-6 items-center text-gray-900' },
        el('div', { className: 'text-sm' },
          el('div', null,
            el('strong', { className: 'text-gray-900' }, 'Mehran:'),
            ' ',
            el('span', { className: 'font-semibold' }, `${mehran.score} (${mehran.category})`),
            ' ',
            el('span', { className: 'text-xs text-gray-600 ml-2' }, `${mehranPredPct}% est`)
          ),
          el('div', { className: 'mt-1' },
            el('strong', { className: 'text-gray-900' }, 'Mehran-2 (M2):'),
            ' ',
            el('span', { className: 'font-semibold' }, `${mehran2_model2.score} (${mehran2_model2.category})`),
            ' ',
            el('span', { className: 'text-xs text-gray-600 ml-2' }, `${mehran2PredPct}% est`)
          )
        ),
        el('div', { className: 'text-sm' },
          el('div', null,
            el('strong', { className: 'text-gray-900' }, 'ACEF:'),
            ' ',
            el('span', { className: 'font-semibold' }, `${acef.score ?? '—'} (${acef.category})`),
            ' ',
            el('span', { className: 'text-xs text-gray-600 ml-2' }, acefPredPct !== null ? `${acefPredPct}% est` : '')
          ),
          el('div', { className: 'mt-1' },
            el('strong', { className: 'text-gray-900' }, 'ACEF-II:'),
            ' ',
            el('span', { className: 'font-semibold' }, `${acef2.score ?? '—'} (${acef2.category})`),
            ' ',
            el('span', { className: 'text-xs text-gray-600 ml-2' }, acef2PredPct !== null ? `${acef2PredPct}% est` : '')
          )
        )
      )
    )
  );

  // Mehran card (blueish background)
  const mehranCard = el(
    'div',
    { className: 'bg-blue-50 rounded shadow p-4' },
    el('div', { className: 'flex justify-between items-center mb-3' },
      el('h2', { className: 'text-lg font-bold text-gray-900' }, 'Mehran (2004)'),
      el('div', { className: 'text-sm text-gray-600' },
        'Score: ',
        el('span', { className: 'font-semibold text-gray-900' }, String(mehran.score)),
        ' — ',
        el('span', { className: 'text-gray-900' }, mehran.category),
        ' ',
        el('span', { className: 'text-xs text-gray-600 ml-2' }, `${mehranPredPct}% estimated CIN`)
      )
    ),
    el('div', { className: 'grid grid-cols-1 md:grid-cols-3 gap-4' },
      labeledBlock('Age', 'years — patient age in years', numberInput(age, setAge, 'years')),
      labeledBlock('Sex', 'Male / Female / Other', el('select', {
        className: 'w-full rounded border px-2 py-1 text-sm text-gray-900',
        value: sex,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setSex(e.target.value as any)
      },
        el('option', { value: '' }, '—'),
        el('option', { value: 'Male' }, 'Male'),
        el('option', { value: 'Female' }, 'Female'),
        el('option', { value: 'Other' }, 'Other')
      )),
      labeledBlock('Baseline SCr', 'mg/dL — baseline serum creatinine (e.g., 0.7). decimals allowed', numberInput(scr, setScr, 'mg/dL')),
      labeledBlock('Hb', 'g/dL — baseline hemoglobin; used to detect anemia', numberInput(hb, setHb, 'g/dL')),
      labeledBlock('Diabetes', 'No / Non-insulin / Insulin — diabetes treatment status', el('select', {
        className: 'w-full rounded border px-2 py-1 text-sm text-gray-900',
        value: diabetesType,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setDiabetesType(e.target.value as any)
      },
        el('option', { value: '' }, '—'),
        el('option', { value: 'none' }, 'No'),
        el('option', { value: 'non-insulin' }, 'Non-insulin treated'),
        el('option', { value: 'insulin' }, 'Insulin treated')
      )),
      labeledBlock('Contrast volume (mL)', 'Total contrast used — 1 point per 100 mL', numberInput(contrastVolumeMl, setContrastVolumeMl, 'mL')),
      labeledBlock('CHF', 'Congestive HF (NYHA III/IV or pulmonary oedema) — check if present', booleanSelect(chf, setChf)),
      labeledBlock('Hypotension (periprocedural)', 'SBP ≤80 mmHg ≥1 h or requires inotrope/IABP', booleanSelect(hypotension, setHypotension)),
      labeledBlock('IABP', 'Intra-aortic balloon pump use during procedure', booleanSelect(iabp, setIabp))
    )
  );

  // Mehran-2 card (blueish background)
  const mehran2Card = el(
    'div',
    { className: 'bg-blue-50 rounded shadow p-4' },
    el('div', { className: 'flex justify-between items-center mb-3' },
      el('h2', { className: 'text-lg font-bold text-gray-900' }, 'Mehran-2 (Lancet 2021)'),
      el('div', { className: 'text-sm text-gray-600' },
        'Model1: ',
        el('span', { className: 'font-semibold text-gray-900' }, String(mehran2_model1.score)),
        ' — ',
        el('span', { className: 'text-gray-900' }, mehran2_model1.category),
        el('span', { className: 'mx-2' }, '|'),
        'Model2: ',
        el('span', { className: 'font-semibold text-gray-900' }, String(mehran2_model2.score)),
        ' — ',
        el('span', { className: 'text-gray-900' }, mehran2_model2.category),
        ' ',
        el('span', { className: 'text-xs text-gray-600 ml-2' }, `${mehran2PredPct}% estimated CA-AKI`)
      )
    ),
    el('div', { className: 'grid grid-cols-1 md:grid-cols-3 gap-4' },
      labeledBlock('Clinical presentation', 'Stable / Unstable angina / NSTEMI / STEMI — choose presentation', el('select', {
        className: 'w-full rounded border px-2 py-1 text-sm text-gray-900',
        value: presentation,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setPresentation(e.target.value as any)
      },
        el('option', { value: '' }, 'Stable / Asymptomatic'),
        el('option', { value: 'unstable-angina' }, 'Unstable angina'),
        el('option', { value: 'nstemi' }, 'NSTEMI'),
        el('option', { value: 'stemi' }, 'STEMI')
      )),
      labeledBlock('eGFR', 'mL/min/1.73m² — kidney function; optional Mehran variant uses eGFR categories', numberInput(egfr, setEgfr, 'mL/min/1.73m²')),
      labeledBlock('LVEF', '% — left ventricular ejection fraction (e.g., 55)', numberInput(lvef, setLvef, '%')),
      labeledBlock('Diabetes (type)', 'No / Non-insulin / Insulin (affects Mehran-2 points)', el('select', {
        className: 'w-full rounded border px-2 py-1 text-sm text-gray-900',
        value: diabetesType,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setDiabetesType(e.target.value as any)
      },
        el('option', { value: '' }, '—'),
        el('option', { value: 'none' }, 'No'),
        el('option', { value: 'non-insulin' }, 'Non-insulin'),
        el('option', { value: 'insulin' }, 'Insulin')
      )),
      labeledBlock('Hb', 'g/dL — haemoglobin (Mehran-2 gives 1 point if <11 g/dL)', numberInput(hb, setHb, 'g/dL')),
      labeledBlock('Basal glucose', 'mg/dL — fasting / baseline glucose (>=150 adds 1 point)', numberInput(basalGlucose, setBasalGlucose, 'mg/dL')),
      el('div', { className: 'col-span-1 md:col-span-3' },
        labeledBlock('Procedural items (Model 2)', 'Contrast volume / bleeding / slow flow / complexity', el('div', { className: 'grid grid-cols-1 md:grid-cols-4 gap-3 mt-2' },
          numberInput(contrastVolumeMl, setContrastVolumeMl, 'Contrast mL (Model2 thresholds: <100=0,100-199=1,200-299=2,>=300=4)'),
          el('div', null,
            el('label', { className: 'text-xs text-gray-900' }, 'Procedural bleeding (Hb drop >3 g/dL)'),
            booleanSelect(proceduralBleed, setProceduralBleed)
          ),
          el('div', null,
            el('label', { className: 'text-xs text-gray-900' }, 'Slow flow / no flow (TIMI 0–1)'),
            booleanSelect(slowFlow, setSlowFlow)
          ),
          el('div', null,
            el('label', { className: 'text-xs text-gray-900' }, 'Complex anatomy'),
            booleanSelect(complexAnatomy, setComplexAnatomy)
          )
        ))
      )
    )
  );

  // ACEF card (blueish background)
  const acefCard = el(
    'div',
    { className: 'bg-blue-50 rounded shadow p-4' },
    el('div', { className: 'flex justify-between items-center mb-3' },
      el('h2', { className: 'text-lg font-bold text-gray-900' }, 'ACEF'),
      el('div', { className: 'text-sm text-gray-600' },
        'ACEF: ',
        el('span', { className: 'font-semibold text-gray-900' }, `${acef.score ?? '—'}`),
        ' — ',
        el('span', { className: 'text-gray-900' }, acef.category),
        ' ',
        el('span', { className: 'text-xs text-gray-600 ml-2' }, acefPredPct !== null ? `${acefPredPct}% est` : '')
      )
    ),
    el('div', { className: 'grid grid-cols-1 md:grid-cols-3 gap-4' },
      labeledBlock('Age', 'years — Age in years (for ACEF: Age / LVEF)', numberInput(age, setAge, 'years')),
      labeledBlock('LVEF', '% — Left ventricular ejection fraction in percent (e.g., 55)', numberInput(lvef, setLvef, '%')),
      labeledBlock('Baseline SCr', 'mg/dL — Serum creatinine in mg/dL (ACEF adds +1 if >2.0 mg/dL)', numberInput(scr, setScr, 'mg/dL'))
    )
  );

  // ACEF-II card (blueish background)
  const acef2Card = el(
    'div',
    { className: 'bg-blue-50 rounded shadow p-4' },
    el('div', { className: 'flex justify-between items-center mb-3' },
      el('h2', { className: 'text-lg font-bold text-gray-900' }, 'ACEF-II'),
      el('div', { className: 'text-sm text-gray-600' },
        'ACEF-II: ',
        el('span', { className: 'font-semibold text-gray-900' }, `${acef2.score ?? '—'}`),
        ' — ',
        el('span', { className: 'text-gray-900' }, acef2.category),
        ' ',
        el('span', { className: 'text-xs text-gray-600 ml-2' }, acef2PredPct !== null ? `${acef2PredPct}% est` : '')
      )
    ),
    el('div', { className: 'grid grid-cols-1 md:grid-cols-4 gap-4' },
      labeledBlock('Age', 'years — Age in years', numberInput(age, setAge, 'years')),
      labeledBlock('LVEF', '% — Left ventricular ejection fraction in percent (e.g., 55)', numberInput(lvef, setLvef, '%')),
      labeledBlock('Baseline SCr', 'mg/dL — Serum creatinine (ACEF-II adds +2 if >2.0 mg/dL)', numberInput(scr, setScr, 'mg/dL')),
      el('div', null,
        labeledBlock('Emergency', 'check if emergency procedure (ACEF-II adds +3)', booleanSelect(isEmergency, setIsEmergency)),
        labeledBlock('Hematocrit', '% — If Hct < 36% then ACEF-II adds 0.2 × (36 − Hct)', numberInput(hematocrit, setHematocrit, '%'))
      )
    )
  );

  // Save button element
  const saveButton = el('div', { className: 'flex justify-end' },
    el('button', {
      onClick: () => { void saveAll(); },
      disabled: !patientId || saving,
      className: 'bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60'
    }, saving ? 'Saving…' : 'Save All Scores')
  );

  // savedRow block
  const savedRowBlock = savedRow ? el('div', { className: 'bg-white rounded shadow p-3 text-sm text-gray-700' },
    el('div', null, el('strong', { className: 'text-gray-900' }, 'Saved (last):')),
    el('div', { className: 'mt-1 text-gray-900' }, `Mehran: ${savedRow.mehran1_score ?? '—'} (${savedRow.mehran1_risk_category ?? '—'}) — ${savedRow.mehran1_predicted_risk ?? '—'}%`),
    el('div', { className: 'text-gray-900' }, `Mehran-2: ${savedRow.mehran2_score ?? '—'} (${savedRow.mehran2_risk_category ?? '—'}) — ${savedRow.mehran2_predicted_risk ?? '—'}%`),
    el('div', { className: 'text-gray-900' }, `ACEF: ${savedRow.acef_score ?? '—'} (${savedRow.acef_risk_category ?? '—'}) — ${savedRow.acef_predicted_risk ?? '—'}%`),
    el('div', { className: 'text-gray-900' }, `ACEF-II: ${savedRow.acef2_score ?? '—'} (${savedRow.acef2_risk_category ?? '—'}) — ${savedRow.acef2_predicted_risk ?? '—'}%`)
  ) : null;

  // final container
  return el('div', { className: 'min-h-screen bg-gray-50 p-6' },
    summaryBlock,
    el('div', { className: 'w-full max-w-6xl mx-auto space-y-6' },
      mehranCard,
      mehran2Card,
      acefCard,
      acef2Card,
      saveButton,
      savedRowBlock
    )
  );
}
