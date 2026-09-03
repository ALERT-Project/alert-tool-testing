import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRisks, calculateWardTime } from '../src/js/rules.js';
import { timeHHMM } from '../src/js/utils.js';

// Synthetic patients only. Every number here is invented - these fixtures exist to pin the
// rules down, not to describe anyone, and nothing patient-identifiable belongs in this file.
//
// Each fixture states the state it is testing and the category it should produce. When a rule
// changes deliberately, the expected value changes with it in the same commit; when a rule
// changes by accident, this is what says so.

// Fixed clock so anything time-dependent - ADDS 3 within 24h, the after-hours window - is
// deterministic rather than passing on a Tuesday and failing on a Sunday.
const NOW = new Date('2026-08-05T10:00:00');           // a Wednesday
const YESTERDAY_0800 = { stepdownDate: '2026-08-04', stepdownTime: '08:00' };  // 26h ago, in hours
const TODAY_1100 = { stepdownDate: '2026-08-05', stepdownTime: '11:00' };      // in hours, same day
const FRIDAY_2000 = { stepdownDate: '2026-07-31', stepdownTime: '20:00' };     // after-hours, >24h

// A patient with nothing wrong. Fixtures override only what they are testing, so a change to
// this baseline is a change to every fixture - which is the point.
const wellPatient = () => ({
    reviewType: 'post',
    ptAge: '60',
    icuLos: '2',
    ...TODAY_1100,
    adds: '0',
    chk_use_mods: false,
    bloods_status: 'reviewed'
});

const evaluate = (overrides = {}, ctx = {}) =>
    evaluateRisks({ ...wellPatient(), ...overrides }, { now: NOW, ...ctx });

const catOf = (overrides, ctx) => evaluate(overrides, ctx).cat.text;
const flagsOf = (overrides, ctx) => {
    const r = evaluate(overrides, ctx);
    return [...r.red, ...r.amber];
};
const hasFlag = (overrides, substring, ctx) =>
    flagsOf(overrides, ctx).some(f => f.includes(substring));
const hasCheck = (overrides, substring, ctx) =>
    evaluate(overrides, ctx).issues.some(i => i.severity === 'info' && i.text.includes(substring));

// --- Baseline ------------------------------------------------------------------------------

test('a well patient is CAT 3 with no flags', () => {
    const r = evaluate();
    assert.equal(r.cat.text, 'CAT 3');
    assert.deepEqual(r.red, []);
    assert.deepEqual(r.amber, []);
});

// --- Red rules -----------------------------------------------------------------------------

test('ADDS 4 or above is red', () => {
    assert.equal(catOf({ adds: '4' }), 'CAT 1');
    assert.equal(catOf({ adds: '9' }), 'CAT 1');
    assert.ok(hasFlag({ adds: '4' }, 'Elevated ADDS 4'));
});

test('MODS is named as MODS, not ADDS', () => {
    assert.ok(hasFlag({ adds: '5', chk_use_mods: true }, 'Elevated MODS 5'));
});

test('extreme vitals are red', () => {
    assert.equal(catOf({ c_hr: '140' }), 'CAT 1');
    assert.equal(catOf({ c_hr: '35' }), 'CAT 1');
    assert.equal(catOf({ c_nibp: '85/50' }), 'CAT 1');
    assert.equal(catOf({ b_rr: '28' }), 'CAT 1');
    assert.equal(catOf({ b_rr: '6' }), 'CAT 1');
    assert.equal(catOf({ b_spo2: '86%' }), 'CAT 1');
    assert.equal(catOf({ e_temp: '38.9' }), 'CAT 1');
    assert.equal(catOf({ e_temp: '35.1' }), 'CAT 1');
    assert.equal(catOf({ e_bsl: '3.2' }), 'CAT 1');
    assert.equal(catOf({ e_bsl: '22' }), 'CAT 1');
});

test('dangerous electrolytes are red', () => {
    // Sodium used to be described inside this gate but never opened it, so a Na of 122 alone
    // produced nothing at all.
    assert.equal(catOf({ bl_k: '6.4' }), 'CAT 1');
    assert.equal(catOf({ bl_k: '2.8' }), 'CAT 1');
    assert.equal(catOf({ bl_na: '122' }), 'CAT 1');
    assert.equal(catOf({ bl_na: '158' }), 'CAT 1');
});

test('PO4 below 0.32 is amber, 0.32-0.5 is only a check', () => {
    assert.equal(catOf({ bl_phos: '0.28' }), 'CAT 2');
    assert.equal(catOf({ bl_phos: '0.40' }), 'CAT 3');
    assert.ok(hasCheck({ bl_phos: '0.40' }, 'PO4 0.4 - replacement indicated'));
});

test('lactate above 4 is red, 2 to 4 is amber', () => {
    assert.equal(catOf({ bl_lac_review: '4.6' }), 'CAT 1');
    assert.equal(catOf({ bl_lac_review: '2.5' }), 'CAT 2');
});

// --- Amber rules ---------------------------------------------------------------------------

test('ADDS 3 is amber within 24h and says why', () => {
    assert.equal(catOf({ adds: '3' }), 'CAT 2');
    assert.ok(hasFlag({ adds: '3' }, 'ADDS 3, not baseline, monitor trend'));
});

test('ADDS 3 stops flagging once the patient is past 24h', () => {
    assert.equal(catOf({ adds: '3', ...YESTERDAY_0800 }), 'CAT 3');
});

test('soft vitals bands are amber', () => {
    assert.equal(catOf({ c_hr: '118' }), 'CAT 2');
    assert.equal(catOf({ c_hr: '45' }), 'CAT 2');
    assert.equal(catOf({ b_rr: '22' }), 'CAT 2');
});

test('recorded rhythm rides along in the wording', () => {
    assert.ok(hasFlag({ c_hr: '118', c_hr_rhythm: 'AF' }, 'Tachycardia HR 118 (AF)'));
});

test('magnesium flags below 0.7 and prompts replacement between 0.7 and 1.0', () => {
    assert.equal(catOf({ bl_mg: '0.62' }), 'CAT 2');
    assert.equal(catOf({ bl_mg: '0.85' }), 'CAT 3');
    assert.ok(hasCheck({ bl_mg: '0.85' }, 'Mg 0.85 - consider replacement'));
});

test('platelets flag under 20, not under 100', () => {
    assert.equal(catOf({ bl_plts: '55' }), 'CAT 3');
    assert.equal(catOf({ bl_plts: '15' }), 'CAT 2');
});

test('age 75+ is amber unless mitigated', () => {
    assert.equal(catOf({ ptAge: '82' }), 'CAT 2');
    assert.equal(catOf({ ptAge: '82', age_mitigated: true, age_mitigate_reason: 'runs marathons' }), 'CAT 3');
    assert.ok(evaluate({ ptAge: '82', age_mitigated: true }).suppressed
        .some(t => t.startsWith('Age 82, frailty risk (mitigated:')));
});

test('three or more comorbidities is red, one or two is amber', () => {
    assert.equal(catOf({ comorb_copd: true, comorb_diabetes: true }), 'CAT 2');
    assert.equal(catOf({ comorb_copd: true, comorb_diabetes: true, comorb_hf: true }), 'CAT 1');
});

// --- Rules that were deliberately removed ---------------------------------------------------

test('removed rules produce nothing', () => {
    assert.equal(catOf({ bl_alb: '17' }), 'CAT 3', 'albumin');
    assert.equal(catOf({ e_bsl: '17' }), 'CAT 3', 'BSL 15-20');
    assert.equal(catOf({ d_pain: '8' }), 'CAT 3', 'pain score');
    assert.equal(catOf({ bl_hb: '65' }), 'CAT 3', 'low Hb absolute');
    assert.equal(catOf({ bl_cr_review: '180' }), 'CAT 3', 'Cr no longer opens the renal gate');
    assert.equal(catOf({ bl_inr: '3.2' }), 'CAT 3', 'INR is a check, not a risk');
});

test('a raised creatinine still surfaces as a check', () => {
    assert.ok(hasCheck({ bl_cr_review: '180' }, 'Cr 180 - confirm against baseline'));
});

// --- Infection ------------------------------------------------------------------------------

test('any single infection marker opens the gate at amber, never red', () => {
    assert.equal(catOf({ bl_wcc: '18' }), 'CAT 2');
    assert.equal(catOf({ bl_crp: '150' }), 'CAT 2');
    assert.equal(catOf({ bl_neut: '12', bl_lymph: '0.8' }), 'CAT 2');   // NLR 15
});

test('fever is the only thing that makes infection red, and says it once', () => {
    const r = evaluate({ e_temp: '38.9', bl_wcc: '18' });
    assert.equal(r.cat.text, 'CAT 1');
    assert.equal(r.red.filter(f => f.includes('38.9')).length, 1, 'fever stated once, not twice');
    assert.ok(r.amber.some(f => f.startsWith('Infection risk')));
});

test('downtrend suppression applies only when the score checks out', () => {
    const low = evaluate({ bl_wcc: '18', infection_downtrend: true, adds: '1' });
    assert.equal(low.cat.text, 'CAT 3');
    assert.ok(low.suppressed.some(t => t.includes('ADDS 1')));

    const high = evaluate({ bl_wcc: '18', infection_downtrend: true, adds: '5' });
    assert.equal(high.cat.text, 'CAT 1', 'the ADDS itself still stands');
    assert.ok(high.amber.some(f => f.startsWith('Infection risk')), 'infection is not discounted');
    assert.ok(high.issues.some(i => i.text.includes('not discounted')));
});

test('the antibiotic clause is gone from the suppression wording', () => {
    const r = evaluate({ bl_wcc: '18', infection_downtrend: true, adds: '1' });
    assert.ok(!r.suppressed.join(' ').toLowerCase().includes('antibiotic'));
});

test('downtrending markers are suggested, never applied', () => {
    const r = evaluate({ infection: true, bl_crp: '80', adds: '1' }, { prevBloods: { crp: '160' } });
    assert.match(r.downtrendSuggestion, /CRP 160 to 80/);
    assert.ok(r.amber.some(f => f.startsWith('Infection risk')), 'still counted until the clinician clicks');
});

// --- MODS -----------------------------------------------------------------------------------

test('a modification relaxes only the parameter it names', () => {
    const s = { chk_use_mods: true, mods_details: 'mods RR<45', b_rr: '28', e_bsl: '3.2' };
    const r = evaluate(s);
    assert.ok(!r.red.some(f => f.includes('Tachypnea')), 'RR is modified');
    assert.ok(r.issues.some(i => i.text.includes('Tachypnea RR 28 - MODS in use')), 'but still visible');
    assert.ok(r.red.some(f => f.includes('Low BSL')), 'BSL is untouched by an RR modification');
});

// --- Trends ---------------------------------------------------------------------------------

test('worsening creatinine flags, and is suppressed by known CKD', () => {
    const ctx = { prevBloods: { cr_review: '120' } };
    assert.ok(hasFlag({ bl_cr_review: '180', renal: true }, 'Worsening Cr 120 to 180', ctx));
    assert.ok(!hasFlag({ bl_cr_review: '180', renal: true, renal_chronic: true }, 'Worsening Cr', ctx));
});

test('rising CRP flags; a small drift does not', () => {
    assert.ok(hasFlag({ bl_crp: '140' }, 'Rising CRP 60 to 140', { prevBloods: { crp: '60' } }));
    assert.ok(!hasFlag({ bl_crp: '68' }, 'Rising CRP', { prevBloods: { crp: '60' } }));
});

test('falling Hb adds context to a tachycardia without naming a cause', () => {
    const r = evaluate({ c_hr: '118', bl_hb: '94' }, { prevBloods: { hb: '118' } });
    assert.ok(r.amber.some(f => f === 'Tachycardia HR 118 with falling Hb 118 to 94'));
    assert.ok(!r.amber.join(' ').toLowerCase().includes('bleed'), 'describes, does not diagnose');
});

test('interpretive blood rules stand down when bloods were not checked', () => {
    assert.equal(catOf({ bl_wcc: '18', bloods_status: 'not_checked' }), 'CAT 3');
    assert.equal(catOf({ bl_wcc: '18', chk_bloods_nil_sig: true }), 'CAT 3');
    assert.ok(!hasCheck({ bl_mg: '0.85', bloods_status: 'not_checked' }, 'consider replacement'));
});

test('life-threatening electrolytes fire regardless of the bloods status', () => {
    // Deliberate asymmetry, and worth stating out loud: a potassium of 6.4 on screen is worth
    // acting on even if someone ticked "not checked this review". Flagged for review - see
    // ALERT_Risk_Rule_Decisions.md - because the split is currently by accident, not design.
    assert.equal(catOf({ bl_k: '6.4', bloods_status: 'not_checked' }), 'CAT 1');
    assert.equal(catOf({ bl_lac_review: '5.0', bloods_status: 'not_checked' }), 'CAT 1');
});

// --- Deconditioning -------------------------------------------------------------------------

test('a long stay alone is not counted', () => {
    const r = evaluate({ icuLos: '6' });
    assert.equal(r.cat.text, 'CAT 3');
    assert.ok(r.suppressed.some(t => t.includes('6-day ICU stay')));
});

test('a long stay plus anything else is red', () => {
    const r = evaluate({ icuLos: '6', bl_wcc: '18' });
    assert.equal(r.cat.text, 'CAT 1');
    assert.ok(r.red.some(f => f === 'Deconditioning risk - 6-day ICU stay'));
});

test('the LOS mitigator stops the escalation', () => {
    assert.equal(catOf({ icuLos: '6', bl_wcc: '18' }), 'CAT 1');
    assert.equal(catOf({ icuLos: '6', bl_wcc: '18', los_mitigated: true }), 'CAT 2');
});

test('the LOS mitigator does not apply to an immobile patient', () => {
    // "Trajectory to recovery established" is not something anyone can say about a patient who
    // isn't mobile, so the claim is ignored rather than half-applied. The control is hidden in
    // the interface at the same time.
    const r = evaluate({ icuLos: '6', bl_wcc: '18', los_mitigated: true, immobility: true });
    assert.equal(r.cat.text, 'CAT 1');
    assert.ok(r.red.some(f => f === 'Deconditioning risk - 6-day ICU stay, immobile'));
});

test('immobility and long stay produce one line, not two', () => {
    const r = evaluate({ icuLos: '6', immobility: true });
    const decon = [...r.red, ...r.amber, ...r.suppressed].filter(t => t.includes('Deconditioning'));
    assert.equal(decon.length, 1);
});

test('a flag containing the letters "age" still counts as another risk', () => {
    // The old test excluded anything matching /age/, which caught "haemorrhage".
    const r = evaluate({ icuLos: '6', ptAge: '82' });
    assert.equal(r.cat.text, 'CAT 2', 'age alone does not escalate a long stay');
});

// --- Renal ----------------------------------------------------------------------------------

test('known CKD suppresses the renal gate unless something acute overrides it', () => {
    const base = { renal: true, bl_cr_review: '260', renal_oliguria: true };
    assert.equal(catOf(base), 'CAT 1');
    assert.equal(catOf({ ...base, renal_chronic: true }), 'CAT 3');
    assert.equal(catOf({ ...base, renal_chronic: true, renal_dysfunction: true }), 'CAT 2',
        'an AKI on top of CKD still counts');
});

test('dialysis type reaches the rules', () => {
    const r = evaluate({ renal: true, renal_dialysis: true, dialysis_type: 'new' });
    assert.ok(r.amber.concat(r.red).some(f => f.includes('acute dialysis')));
});

// --- Time since stepdown --------------------------------------------------------------------

test('time since stepdown is singular at exactly one', () => {
    const at = (date, time) => calculateWardTime(date, time, false, NOW).text;
    assert.equal(at('2026-08-05', '09:00'), '1 hour');
    assert.equal(at('2026-08-05', '05:00'), '5 hours');
    assert.equal(at('2026-08-04', '10:00'), '1 day');
    assert.equal(at('2026-08-02', '10:00'), '3 days');
});

test('half days keep their plural', () => {
    const at = (date, time) => calculateWardTime(date, time, false, NOW).text;
    assert.equal(at('2026-08-04', '22:00'), '0.5 days');
    assert.equal(at('2026-08-03', '22:00'), '1.5 days');
});

// --- After hours ----------------------------------------------------------------------------

test('after-hours is derived from the stepdown time and drops off after 24h', () => {
    assert.equal(evaluate({ stepdownDate: '2026-08-05', stepdownTime: '20:00' }).afterHoursDerived, true);
    assert.equal(evaluate({ stepdownDate: '2026-08-05', stepdownTime: '11:00' }).afterHoursDerived, false);
    assert.equal(evaluate(FRIDAY_2000).afterHoursDerived, false, 'past 24h, the home team has seen them');
});

test('a manual after-hours answer is left alone', () => {
    const r = evaluate({ after_hours: true, ...FRIDAY_2000 }, { afterHoursManual: true });
    assert.equal(r.afterHoursDerived, null);
    assert.ok(r.amber.includes('Discharged after-hours'));
});

// --- Category and override --------------------------------------------------------------------

test('any red makes CAT 1; any amber with no red makes CAT 2', () => {
    assert.equal(catOf({ adds: '4', bl_mg: '0.6' }), 'CAT 1');
    assert.equal(catOf({ bl_mg: '0.6' }), 'CAT 2');
});

test('a manual category applies in either direction and records what it overruled', () => {
    const r = evaluate({ adds: '4', override: 'green', overrideNote: 'known chronic, at baseline' });
    assert.equal(r.cat.text, 'CAT 3');
    assert.equal(r.cat.downgradedFrom, 'CAT 1');
    assert.equal(r.red.length, 1, 'the evidence is still listed');

    // The reported bug: CAT 2 selected on a patient scoring CAT 1 stayed CAT 1.
    assert.equal(catOf({ adds: '4', override: 'amber' }), 'CAT 2');
    assert.equal(evaluate({ adds: '4', override: 'amber' }).autoCat.text, 'CAT 1');

    // A reason is asked for on screen but never gates the selection.
    assert.equal(catOf({ adds: '4', override: 'green' }), 'CAT 3', 'no reason, still applies');
});

test('an upgrade override is itself a flag', () => {
    assert.equal(catOf({ override: 'red', overrideNote: 'gut feeling' }), 'CAT 1');
    assert.ok(hasFlag({ override: 'red', overrideNote: 'gut feeling' }, 'gut feeling'));
});

// --- Whole patients ---------------------------------------------------------------------------
// Shapes drawn from real reviews, with every number replaced.

test('post-op day 2, long stay, resolving infection markers', () => {
    const r = evaluate({
        ptAge: '63', icuLos: '6', ...YESTERDAY_0800,
        adds: '0', bl_wcc: '21.5', bl_cr_review: '195', renal: true,
        bl_k: '3.8', bl_na: '141', bl_mg: '0.9'
    });
    assert.equal(r.cat.text, 'CAT 1');
    assert.ok(r.red.some(f => f.includes('Deconditioning risk - 6-day ICU stay')));
});

test('haematology patient: pancytopenia is expected, low platelets are not', () => {
    const r = evaluate({
        ptAge: '71', icuLos: '5', adds: '0',
        bl_hb: '74', bl_wcc: '0.2', bl_plts: '11', bl_neut: '0.05'
    });
    assert.ok(!r.red.concat(r.amber).some(f => f.includes('Low Hb')), 'Hb is expected and not flagged');
    assert.ok(r.amber.some(f => f === 'Low platelets Plts 11'));
});

test('stable pre-stepdown patient with a modification is not escalated by it', () => {
    const r = evaluate({
        reviewType: 'pre', ptAge: '58', icuLos: '2',
        chk_use_mods: true, mods_details: 'MODS for HR<120', adds: '1', c_hr: '112'
    });
    assert.equal(r.cat.text, 'CAT 3');
});


// --- The clock the ward reads ------------------------------------------------------------
//
// timeHHMM exists because toLocaleTimeString could not be trusted with either half of the job.
// Both failures were live: an en-US default returned "12:05 AM", and hour12:false selected the
// h24 cycle, which writes midnight as "24:00" - a value <input type="time"> rejects outright,
// so the Time of Review box silently emptied itself and the note fell back to the 12-hour
// string. Between 23:53 and 00:07 that is the whole night shift's clock.

test('the review clock is 24-hour, zero-padded, and never writes 24:00', () => {
    const at = (h, m) => timeHHMM(new Date(2026, 8, 4, h, m));

    assert.equal(at(0, 0), '00:00', 'midnight is 00:00 - "24:00" is out of range for a time input');
    assert.equal(at(0, 5), '00:05');
    assert.equal(at(9, 5), '09:05', 'padded, so HH:MM can be relied on');
    assert.equal(at(14, 30), '14:30', 'and never 2:30 PM');
    assert.equal(at(23, 59), '23:59');

    // The box rounds to the nearest quarter hour before formatting, and 23:53 rounds up past
    // midnight - which is exactly where the old formatter produced its out-of-range value.
    const d = new Date(2026, 8, 3, 23, 53);
    d.setMinutes(Math.round(d.getMinutes() / 15) * 15);
    assert.equal(timeHHMM(d), '00:00', 'rolling over the day still yields a time that will stick');

    for (let h = 0; h < 24; h++) {
        assert.match(at(h, 0), /^([01]\d|2[0-3]):[0-5]\d$/, `hour ${h} is in range`);
    }
});

// --- A-E findings that are not numbers ----------------------------------------------------
//
// The panel has always held these answers and never scored them, so a patient could be recorded
// as thready and cool with a perfect ADDS and come out CAT 3.

test('perfusion, cap refill and airway findings are amber in their own right', () => {
    const at = (extra) => evaluate(extra);

    assert.equal(at({}).cat.id, 'green', 'a blank A-E panel flags nothing');

    const thready = at({ c_perf: 'Warm, well perfused, Thready pulses' });
    assert.equal(thready.cat.id, 'amber');
    assert.ok(thready.amber.includes('Thready pulses'),
        'the buttons stack, so the finding has to be found inside whatever else is in the field');

    assert.ok(at({ c_perf: 'Cool, poorly perfused' }).amber.includes('Cool, poorly perfused'));

    // The buttons offer "<3 sec", "4 sec", "5 sec", "6 sec" - the leading "<" is the whole
    // difference between a normal refill and a delayed one.
    assert.equal(at({ c_cr: '<3 sec' }).cat.id, 'green', 'under three seconds is normal');
    assert.ok(at({ c_cr: '4 sec' }).amber.includes('Delayed capillary refill 4s'));
    assert.ok(at({ c_cr: '6 sec' }).amber.includes('Delayed capillary refill 6s'));
    assert.ok(at({ c_cr: 'delayed' }).amber.includes('Delayed capillary refill'),
        'and the word on its own counts, since this is a free-text field');

    for (const [text, expected] of [['Stridor', 'Stridor'], ['noisy breathing', 'Noisy breathing'],
                                    ['partial obstruction', 'Partial airway obstruction']]) {
        assert.ok(at({ airway_a: `Patent, ${text}` }).amber.includes(expected), expected);
    }
});

test('an irregular rhythm scores only once it is confirmed as new', () => {
    const at = (extra) => evaluate(extra);

    // A ward of post-cardiac patients is a ward of chronic AF. Flagging every one of them is
    // how a flag stops being read, so the bare finding says nothing.
    assert.equal(at({ c_hr_rhythm: 'Irregular' }).cat.id, 'green', 'irregular alone is not a finding');
    assert.equal(at({ c_hr_rhythm: 'Irregular', c_hr_rhythm_new: false }).cat.id, 'green',
        'and a known chronic AF stays quiet');

    const isNew = at({ c_hr_rhythm: 'Irregular', c_hr_rhythm_new: true });
    assert.equal(isNew.cat.id, 'amber');
    assert.ok(isNew.amber.includes('New irregular rhythm'));

    // The answer cannot outlive the finding it belongs to - a Yes recorded and then corrected
    // to regular must stop scoring, not go on from a control that is no longer on screen.
    assert.equal(at({ c_hr_rhythm: 'Regular', c_hr_rhythm_new: true }).cat.id, 'green');
});

test('increased work of breathing is named inside the respiratory concern, not left bare', () => {
    // The gate on its own says "Respiratory concern" and nothing else. Reading the reason back
    // out of the WOB field is what makes the note worth reading.
    const r = evaluate({ resp_concern: true, b_wob: 'Increased' });
    assert.equal(r.cat.id, 'amber');
    assert.ok(r.amber.some(t => /Respiratory concern - increased work of breathing/.test(t)),
        `expected the reason in the risk, got: ${r.amber.join(' | ')}`);

    // Without the gate open the field alone does nothing - main.js opens it when the clinician
    // types, and this is the rule half of that pair.
    assert.equal(evaluate({ b_wob: 'Increased' }).cat.id, 'green');
});
