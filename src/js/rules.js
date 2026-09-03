/* =========================================
   ALERT Nursing Risk Assessment Tool
   Clinical rule engine (pure — no DOM, no clock, no side effects)
   Copyright © 2025-2026 Casey Bond
   MIT License - https://opensource.org/licenses/MIT
   ========================================= */

import { num, sentenceCase, joinGrammatically } from './utils.js';
import { comorbMap, toggleInputs, normalRanges, GATE_LINKED_BLOODS, BLOOD_LABELS, QUICK_REVIEW_SCORING_IDS} from './config.js';
import { computeTrend } from './trends.js';

// The clinical rules, with no interface attached.
//
// Everything here is a pure function of the state object and the context passed in: no DOM
// reads, no DOM writes, no module-level mutable state, no clock except the one handed to it.
// That means the whole risk model can be exercised in a test with a plain object and no
// browser, which is what test/rules.test.js does - and it is the only part of the tool that
// would survive a move to another platform intact.
//
// computeAll() in logic.js owns everything this deliberately does not do: reading the form,
// painting flags, filling fields, and staging issues into the Review List.

// "1 days" and "1 hours" appeared in the note whenever the rounding landed on exactly one.
// 0.5 keeps its plural, which is correct - only one is singular.
const unit = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`;

export function calculateWardTime(dateStr, timeStr, isPre, now = new Date()) {
    if (isPre) return { hours: 0, text: '(Pre-Stepdown)' };
    if (!dateStr) return { hours: 0, text: '' };

    let h = 16;
    let min = 0;
    if (timeStr && timeStr.includes(':')) {
        const parts = timeStr.split(':');
        h = parseInt(parts[0], 10);
        min = parseInt(parts[1], 10);
    } else if (timeStr) {
        h = { 'Morning': 9, 'Afternoon': 15, 'Evening': 18, 'Night': 21 }[timeStr] || 18;
    }

    const [y, m, d] = dateStr.split('-');
    const stepObj = new Date(y, m - 1, d, h, min);
    const diffHours = (now - stepObj) / 3600000;

    if (diffHours < 0) return { hours: diffHours, text: "(Planned Stepdown)" };

    if (diffHours < 12) return { hours: diffHours, text: unit(Math.round(diffHours), 'hour') };
    if (diffHours <= 48) {
        const halfDays = Math.round((diffHours / 24) * 2) / 2;
        return { hours: diffHours, text: unit(halfDays, 'day') };
    }
    return { hours: diffHours, text: unit(Math.round(diffHours / 24), 'day') };
}

// An after-hours stepdown is derived from the dates rather than asked about, unless the
// clinician has overridden it. Returns null when there is nothing to derive, so the caller
// knows to leave the control alone.
export function deriveAfterHours(s, timeData, isPre) {
    if (isPre || !s.stepdownDate) return null;
    const [y, m, d] = s.stepdownDate.split('-');
    let stepH = 16;
    if (s.stepdownTime && s.stepdownTime.includes(':')) stepH = parseInt(s.stepdownTime.split(':')[0], 10);

    const stepObj = new Date(y, m - 1, d, stepH, 0);
    const stepDay = stepObj.getDay();
    const isWeekend = stepDay === 0 || stepDay === 6;
    const isAfterHoursStepdown = stepH >= 16 || stepH < 9;

    // Deliberately drops off after 24 hours: the home team sees the patient on the next day
    // shift, so it stops being the reason this patient needs watching.
    if (timeData.hours > 24) return false;
    return isAfterHoursStepdown || isWeekend;
}

const MOD_PATTERNS = {
    rr: /\brr\b|respiratory rate/,
    hr: /\bhr\b|heart rate|\bpulse\b/,
    spo2: /\bspo2\b|\bsats?\b|saturation/,
    bp: /\bs?bp\b|blood pressure/,
    temp: /\btemp\b|temperature/
};

const parseTarget = (t) => {
    const m = (t || '').match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/);
    return m ? { low: parseFloat(m[1]), high: parseFloat(m[2]) } : null;
};

/**
 * @param {object} s      state, as produced by getState()
 * @param {object} ctx    { prevBloods, now, afterHoursManual }
 * @returns {object}      everything the interface needs in order to render
 */
export function evaluateRisks(s, ctx = {}) {
    const prevBloods = ctx.prevBloods || {};
    const now = ctx.now || new Date();

    const red = [], amber = [], suppressedRisks = [];
    const flagged = { red: [], amber: [] };
    const riskEntries = [];
    // Ordered exactly as produced, so the caller can replay them into the Review List and get
    // the same sequence the old interleaved code produced.
    const issues = [];

    // In Quick Review only what the tool read off a measured number counts toward the category.
    // A rule outside the allowlist still stages its issue - the clinician should see it on the
    // list - but it does not push the patient up a category on its own, because in Quick Review
    // choosing the category is the clinician's job rather than a correction of the tool's.
    const countsTowardCategory = (id) =>
        !ctx.quickReview || !id || QUICK_REVIEW_SCORING_IDS.includes(id);

    // A computed risk the clinician struck off the list. The row said delete, so it has to
    // leave the note and the category the way every other row on that list does - struck
    // through it doesn't count. It was leaving neither: the rule kept firing, so the entry sat
    // crossed out on screen and printed in the DMR anyway, which made the control a lie.
    //
    // The issue is still staged, so the row stays visible and the delete stays undoable, and
    // the value behind it still prints wherever it belongs - a deleted "Hypoxia SpO2 84%" does
    // not remove SpO2 84 from the observations.
    const deletedByClinician = (id) => !!id && !!ctx.deletedRiskKeys?.has(id);

    const add = (list, txt, id, type, noteValue = null) => {
        let finalTxt = txt;
        if (noteValue && noteValue.trim()) finalTxt = `${txt} (${noteValue.trim()})`;
        const scores = countsTowardCategory(id) && !deletedByClinician(id);
        if (scores) list.push(finalTxt);
        if (id) {
            if (scores) flagged[type].push(id);
            riskEntries.push({ text: finalTxt, id, type });
            issues.push({ text: finalTxt, source: 'auto', severity: type, key: id });
        }
    };

    // Things that need looking at but are not readmission risks. They never touch the category.
    const checkKeys = [];
    const addCheck = (txt, key) => {
        checkKeys.push(key);
        issues.push({ text: txt, source: 'bloods', severity: 'info', key, list: 'checks' });
    };

    // A sanctioned score modification means the treating team has accepted a parameter that
    // would otherwise flag. Only the parameters actually named are relaxed - a modification for
    // RR<45 says nothing about a BSL of 3 - and the value still surfaces as a check.
    const modsText = (s.chk_use_mods && s.mods_details) ? s.mods_details.toLowerCase() : '';
    const isModified = param => modsText !== '' && MOD_PATTERNS[param].test(modsText);
    const addVital = (list, txt, id, type, param) => {
        if (isModified(param)) addCheck(`${txt} - MODS in use (${s.mods_details.trim()}); confirm within modification`, `mod_${id}`);
        else add(list, txt, id, type);
    };

    // Nothing derived from bloods fires when the clinician has said they weren't checked.
    const bloodsReviewed = !s.chk_bloods_nil_sig && s.bloods_status !== 'nil_sig' && s.bloods_status !== 'not_checked';

    const crTrend = computeTrend('cr_review', s.bl_cr_review, prevBloods.cr_review);
    const crpTrend = computeTrend('crp', s.bl_crp, prevBloods.crp);
    const wccTrend = computeTrend('wcc', s.bl_wcc, prevBloods.wcc);

    // Out-of-range bloods are informational only, so they never force a category on their own.
    const bloodIssueKeys = [];
    if (bloodsReviewed) {
        GATE_LINKED_BLOODS.forEach(key => {
            const range = normalRanges[key];
            if (!range) return;
            const bid = `bl_${key}`;
            const val = num(s[bid]);
            if (val === null) return;
            if (val < range.low || val > range.high) {
                const label = BLOOD_LABELS[key] || key.replace(/_review$/, '').toUpperCase();
                bloodIssueKeys.push(bid);
                // list 'bloods' renders nowhere. These exist for the Excel handover line, which
                // builds its "Bloods: K 6.4, Mg 0.68" summary from them. As list rows they were
                // noise: the value is already in the grid, highlighted, and on the note's bloods
                // line, and out-of-range is not the same as worth flagging - only the severe
                // ones become readmission risks, and they do that through the rules below.
                issues.push({ text: `Abnormal ${label} ${val}`, source: 'bloods', severity: 'info', key: bid, list: 'bloods' });
            }
        });
    }

    const neut = num(s.bl_neut) ?? num(s.neut);
    const lymph = num(s.bl_lymph) ?? num(s.lymph);
    const nlrVal = (neut > 0 && lymph > 0) ? (neut / lymph) : 0;

    const isPre = s.reviewType === 'pre';
    const timeData = calculateWardTime(s.stepdownDate, s.stepdownTime, isPre, now);
    const isRecent = isPre || (timeData.hours < 24);

    // Derived unless the clinician has taken the control over.
    const afterHoursDerived = ctx.afterHoursManual ? null : deriveAfterHours(s, timeData, isPre);
    const afterHours = afterHoursDerived === null ? (s.after_hours === true) : afterHoursDerived;

    // --- Vasoactive support ---
    const recentKeys = ['pressor_recent_norad', 'pressor_recent_met', 'pressor_recent_gtn', 'pressor_recent_dob', 'pressor_recent_mid', 'pressor_recent_other'];
    const currentKeys = ['pressor_current_mid', 'pressor_current_other'];
    const hasRecent = recentKeys.some(k => s[k]);
    const hasCurrent = currentKeys.some(k => s[k]);

    if (hasCurrent || hasRecent) {
        const details = [];
        const currentList = [];
        currentKeys.forEach(k => {
            if (!s[k]) return;
            let label = k.replace('pressor_current_', '').replace('mid', 'Midodrine');
            if (k === 'pressor_current_other') label = `Other (${s.pressor_current_other_note || ''})`;
            currentList.push(label);
        });
        if (currentList.length) details.push(`Current vasoactive support - ${joinGrammatically(currentList)}`);
        if (hasRecent) {
            const recentsList = [];
            recentKeys.forEach(k => {
                if (!s[k]) return;
                let label = k.replace('pressor_recent_', '').replace('norad', 'Noradrenaline').replace('met', 'Metaraminol').replace('gtn', 'GTN').replace('dob', 'Dobutamine').replace('mid', 'Midodrine');
                if (k === 'pressor_recent_other') label = `Other (${s.pressor_recent_other_note || ''})`;
                recentsList.push(label);
            });
            let recentPart = `Recent vasoactive support, ${joinGrammatically(recentsList)}`;
            if (s.pressor_ceased_time) recentPart += ` - ceased at approximately ${s.pressor_ceased_time}`;
            details.push(recentPart);
        }
        add(amber, details.join('. '), 'seg_pressors', 'amber', s.pressors_note);
    }

    // --- Score ---
    const adds = num(s.adds);
    const scoreName = s.chk_use_mods ? 'MODS' : 'ADDS';
    if (adds !== null) {
        // 4 is the escalation threshold; there is no separate tier above it.
        if (adds >= 4) add(red, `Elevated ${scoreName} ${adds}`, 'adds', 'red');
        // A 3 is not a concern, it is a reason not to discharge today.
        else if (adds === 3 && isRecent) add(amber, `${scoreName} 3, not baseline, monitor trend`, 'adds', 'amber');
    }

    // --- Vitals ---
    // A falling haemoglobin is not a flag on its own, but next to a tachycardia or a low
    // pressure it changes what the sentence means. Two facts side by side; naming a cause is
    // the clinician's call, not the tool's.
    const hbNow = num(s.bl_hb);
    const hbPrev = num(prevBloods.hb);
    const hbFalling = hbNow !== null && hbPrev !== null && hbPrev > hbNow &&
        (hbPrev - hbNow) >= 10 && ((hbPrev - hbNow) / hbPrev) >= 0.08;
    const hbContext = hbFalling ? ` with falling Hb ${hbPrev} to ${hbNow}` : '';

    const rhythm = (s.c_hr_rhythm || '').trim();
    const rhythmTxt = rhythm ? ` (${rhythm})` : '';

    const hr = num(s.c_hr);
    if (hr) {
        if (hr > 130) addVital(red, `Tachycardia HR ${hr}${rhythmTxt}${hbContext}`, 'c_hr', 'red', 'hr');
        else if (hr > 110) addVital(amber, `Tachycardia HR ${hr}${rhythmTxt}${hbContext}`, 'c_hr', 'amber', 'hr');
        else if (hr < 40) addVital(red, `Bradycardia HR ${hr}${rhythmTxt}`, 'c_hr', 'red', 'hr');
        else if (hr < 50) addVital(amber, `Bradycardia HR ${hr}${rhythmTxt}`, 'c_hr', 'amber', 'hr');
    }

    if (s.c_nibp) {
        const sbp = parseFloat(String(s.c_nibp).split('/')[0]);
        if (!isNaN(sbp) && sbp < 90) addVital(red, `Hypotension SBP ${sbp}${hbContext}`, 'c_nibp', 'red', 'bp');
    }

    const rr = num(s.b_rr);
    if (rr) {
        if (rr > 25) addVital(red, `Tachypnea RR ${rr}`, 'b_rr', 'red', 'rr');
        else if (rr > 20) addVital(amber, `Mild tachypnea RR ${rr}`, 'b_rr', 'amber', 'rr');
        else if (rr < 8) addVital(red, `Bradypnea RR ${rr}`, 'b_rr', 'red', 'rr');
    }

    const spo2 = num(s.b_spo2 ? String(s.b_spo2).replace('%', '') : '');
    // Saturation is read against the target the patient is actually being managed to. Below 88
    // is red for everyone, COPD included: at 87 there is very little window left before the
    // dissociation curve steepens and small further falls in saturation mean large falls in
    // PaO2. What the target changes is the band above that.
    //
    //   target 94% (or unset)   92-93 is a check, 88-91 is amber, under 88 is red
    //   target 88-92%           88-92 is where they are meant to be, so neither fires; above
    //                           92 is a check, because a COPD patient sitting at 96 on oxygen
    //                           is being given the exact harm the lower target exists to avoid
    //
    // Unset behaves as 94%. Not flagging at all is the failure this is here to fix, and a
    // wrongly-flagged COPD patient is visible and self-correcting - the reviewer sees it, sets
    // the target, and it goes away. Silence corrects nothing.
    const spo2Target = s.spo2_target === '88_92' ? '88_92' : '94';
    if (spo2) {
        if (spo2 < 88) addVital(red, `Hypoxia SpO2 ${spo2}%`, 'b_spo2', 'red', 'spo2');
        else if (spo2Target === '94') {
            if (spo2 < 92) addVital(amber, `SpO2 ${spo2}% below target 94%`, 'b_spo2', 'amber', 'spo2');
            else if (spo2 < 94) addCheck(`SpO2 ${spo2}% - below target 94%`, 'chk_spo2');
        } else if (spo2 > 92) {
            addCheck(`SpO2 ${spo2}% - above target 88-92%, review oxygen`, 'chk_spo2');
        }
    }

    // --- A-E findings that are not numbers ---
    //
    // The panel has always held these answers and never scored them, so a patient could be
    // recorded as thready and cool with a perfect ADDS and come out CAT 3. They are amber in
    // their own right rather than through a gate: there is no clinical judgement left to make
    // about a clinician who has written "thready pulses" - they have already made it, and
    // routing it through a gate would only ask them the same question twice.
    //
    // Substring matching, because every one of these fields is free text with buttons that
    // stack into it: c_perf legitimately holds "Warm, well perfused, Thready pulses" after two
    // clicks. That means text typed to say the opposite ("no stridor") will fire, which is
    // visible and correctable on screen; the alternative, silence, is neither.
    const perf = (s.c_perf || '').toLowerCase();
    if (perf.includes('thready')) add(amber, 'Thready pulses', 'c_perf_thready', 'amber');
    if (perf.includes('poorly perfused')) add(amber, 'Cool, poorly perfused', 'c_perf_poor', 'amber');

    // The buttons offer "<3 sec", "4 sec", "5 sec" and "6 sec", so a leading "<" is the whole
    // difference between normal and delayed and has to survive the parse.
    const crRaw = (s.c_cr || '').toLowerCase();
    const crMatch = crRaw.match(/(<\s*)?(\d+)\s*s(?:ec)?/);
    if (crRaw.includes('delayed') || crRaw.includes('prolonged') ||
        (crMatch && !crMatch[1] && Number(crMatch[2]) >= 4)) {
        const secs = crMatch && !crMatch[1] ? ` ${crMatch[2]}s` : '';
        add(amber, `Delayed capillary refill${secs}`, 'c_cr_delayed', 'amber');
    }

    // A: the only quick-select offered is "Patent", so anything worth flagging arrives as
    // typed text. Each is named separately - "airway compromise" would be the tool putting a
    // word in the reviewer's mouth that they did not use.
    const airway = (s.airway_a || '').toLowerCase();
    if (airway.includes('stridor')) add(amber, 'Stridor', 'airway_stridor', 'amber');
    if (airway.includes('noisy')) add(amber, 'Noisy breathing', 'airway_noisy', 'amber');
    if (airway.includes('partial')) add(amber, 'Partial airway obstruction', 'airway_partial', 'amber');

    // Irregular on its own says nothing: a ward full of post-cardiac patients is a ward full of
    // chronic AF, and flagging every one of them is how a flag stops being read. So the tool
    // asks whether it is new, and only a Yes scores.
    if (/irregular/i.test(rhythm) && s.c_hr_rhythm_new === true) {
        add(amber, 'New irregular rhythm', 'c_hr_rhythm_new', 'amber');
    }

    // Temperature was being judged by two rules with two different thresholds, and neither
    // said so. 38.5 exactly fell through the febrile rule (it tested >) and came out amber via
    // the infection gate instead, which triggers above 38 - so the reader saw "Infection risk"
    // with no reason attached and no temperature mentioned anywhere.
    //
    // One ladder now, with the boundaries inclusive and the fever named at every rung:
    //   38.0 - 38.4  amber, through the infection gate, with the temperature stated
    //   38.5 and up  red, febrile
    //   35.5 and below  red
    // The infection gate keeps ownership of the low-grade range because a fever there is an
    // infection marker rather than an unstable vital sign, and it belongs beside the WCC and
    // the CRP that are read with it.
    const temp = num(s.e_temp);
    if (temp) {
        if (temp >= 38.5) addVital(red, `Febrile ${temp}`, 'e_temp', 'red', 'temp');
        else if (temp <= 35.5) addVital(red, `Temp low ${temp}`, 'e_temp', 'red', 'temp');
    }

    // --- Respiratory ---
    // What the patient is actually on. Worked out before the gate and independently of it: a
    // flow rate is a measurement, and 4L of oxygen is 4L whether or not anybody ticked
    // "Respiratory Concern? Yes". This whole block used to sit inside that gate, so a patient
    // recorded on 4LNP with the gate left unanswered scored nothing at all.
    const oxygen = { parts: [], red: false, id: null };
    if (s.oxMod === 'NP') {
        const flow = num(s.npFlow);
        // Nasal prong flow is the whole scale: 4L+ is CAT 1, 3L is CAT 2, up to 2L is
        // ward-normal and scores nothing.
        if (flow >= 4) { oxygen.parts.push(`Oxygen requirement - ${flow}LNP`); oxygen.red = true; oxygen.id = 'npFlow'; }
        else if (flow >= 3) { oxygen.parts.push(`Oxygen requirement - ${flow}LNP`); oxygen.id = 'npFlow'; }
    } else if (s.oxMod === 'HFNP') {
        const fio2Val = num(s.hfnpFio2);
        oxygen.parts.push(fio2Val >= 60 ? `HFNP - high FiO2 ${s.hfnpFio2 || ''}%` : `HFNP - FiO2 ${s.hfnpFio2 || ''}%`);
        oxygen.red = true; oxygen.id = 'oxMod';
    } else if (s.oxMod === 'NIV') {
        const fio2Val = num(s.nivFio2);
        oxygen.parts.push(fio2Val >= 60 ? `NIV - high FiO2 ${s.nivFio2 || ''}%` : `NIV - FiO2 ${s.nivFio2 || ''}%`);
        oxygen.red = true; oxygen.id = 'oxMod';
    }

    // Quick Review does not consult gates - it releases them on the way in - so the subjective
    // half of this section has nothing to read. What is left is the oxygen, which is measured,
    // and it is raised on its own below.
    const useRespGate = s.resp_concern === true && !ctx.quickReview;

    if (useRespGate) {
        const parts = [...oxygen.parts];
        let hasRed = oxygen.red;
        if (oxygen.id) flagged[oxygen.red ? 'red' : 'amber'].push(oxygen.id);
        if (s.resp_dyspnea === true) {
            const dysp = s.dyspneaConcern;
            if (dysp === 'severe' || dysp === 'moderate') { parts.push(`Dyspnea ${dysp}`); flagged.red.push('dyspneaConcern'); hasRed = true; }
            else if (dysp === 'mild') { parts.push('Dyspnea mild'); flagged.amber.push('dyspneaConcern'); }
            else if (!dysp) { parts.push('Dyspnea'); flagged.amber.push('seg_resp_dyspnea'); }
        }
        // Increased work of breathing has no toggle of its own - it is read off the WOB field,
        // which is where the clinician already wrote it. main.js opens this gate when they do,
        // so the gate and the reason arrive together rather than the gate firing bare.
        if (/increas|labour|labor/i.test(s.b_wob || '')) { parts.push('increased work of breathing'); flagged.amber.push('b_wob'); }
        if (s.resp_tachypnea === true) { parts.push('tachypnea >20bpm'); flagged.amber.push('seg_resp_tachypnea'); }
        if (s.resp_rapid_wean === true) { parts.push('rapid O2 wean within last 12h'); flagged.red.push('seg_resp_rapid_wean'); hasRed = true; }
        if (s.resp_poor_cough === true) { parts.push('poor cough effort'); flagged.amber.push('seg_resp_poor_cough'); }
        if (s.resp_poor_swallow === true) { parts.push('poor swallow'); flagged.amber.push('seg_resp_poor_swallow'); }
        if (s.hist_o2 === true) { parts.push('recent high O2/NIV requirement <12hrs'); flagged.red.push('seg_hist_o2'); hasRed = true; }

        if (s.intubated === true) {
            if (s.intubatedReason === 'concern') { parts.push('intubated <24hrs ago'); flagged.red.push('seg_intubated'); hasRed = true; }
            else { parts.push('intubated <24hrs ago (elective)'); flagged.amber.push('seg_intubated'); }
        }

        if (s.dyspneaConcern_note && parts.length > 0) {
            parts[parts.length - 1] += `. Note: ${s.dyspneaConcern_note}`;
        }

        if (parts.length > 0) {
            add(hasRed ? red : amber, `Respiratory concern - ${joinGrammatically(parts)}`, 'seg_resp_concern', hasRed ? 'red' : 'amber');
        } else {
            const isLowFlowNP = (s.oxMod === 'NP' && (num(s.npFlow) || 0) < 3);
            if (!isLowFlowNP) add(amber, 'Respiratory concern', 'seg_resp_concern', 'amber', s.dyspneaConcern_note);
        }
    }

    // No gate in play, but a requirement recorded. It is stated on its own rather than as a
    // "Respiratory concern", because nobody has said there is one - the oxygen is simply a
    // fact about the patient, and it counts.
    if (!useRespGate && oxygen.parts.length) {
        add(oxygen.red ? red : amber, joinGrammatically(oxygen.parts), oxygen.id, oxygen.red ? 'red' : 'amber');
    }

    if (s.oxMod === 'Trache') {
        const isLary = s.tracheType === 'Laryngectomy';
        const label = isLary ? 'Laryngectomy patient' : 'Tracheostomy patient';
        if (s.tracheStatus === 'New') add(red, `New ${label.toLowerCase()}`, 'tracheStatus', 'red');
        else add(amber, label, 'oxMod', 'amber');
    }

    if (afterHours === true) add(amber, 'Discharged after-hours', 'seg_after_hours', 'amber', s.after_hours_note);
    if (s.hac === true) add(amber, 'Hospital acquired complication', 'seg_hac', 'amber', s.hac_note);

    // --- Neurological ---
    if (s.neuro_gate === true) {
        let txt = 'Neurological concern';
        const details = [];
        if (s.d_alert && s.d_alert.toLowerCase().includes('gcs')) details.push(s.d_alert);
        if (s.neuroType) details.push(s.neuroType.toLowerCase());
        if (details.length) txt += ` - ${joinGrammatically(details)}`;
        const isRed = (s.neuroConcern === 'severe');
        add(isRed ? red : amber, sentenceCase(txt), 'neuroConcern', isRed ? 'red' : 'amber', s.neuroType_note);
    }

    // --- Electrolytes ---
    // Both magnesium and phosphate trigger where the number means something rather than
    // wherever it leaves the reference range. A magnesium of 0.68 is out of range and
    // ubiquitous; arrhythmia risk belongs to the low 0.6s and below. Phosphate matters lower
    // still - below 0.32 is where respiratory muscle weakness appears. The gentler end of each
    // becomes a replacement prompt instead. High ends are dropped: outside renal failure they
    // rarely change management, and the renal gate owns that picture.
    const k = num(s.bl_k);
    const na = num(s.bl_na);
    const mg = num(s.bl_mg);
    const phos = num(s.bl_phos);
    const mgAbnormal = mg !== null && mg < normalRanges.mg.low;
    const phosAbnormal = phos !== null && phos < 0.32;
    // Sodium was described inside this gate but never opened it, so a Na of 122 produced
    // nothing at all unless a potassium or magnesium happened to open the gate first.
    const naAbnormal = na !== null && (na < 125 || na > 155);

    if (bloodsReviewed) {
        // The gentle end of each: low enough to act on, not low enough to be a readmission
        // risk. Potassium joins magnesium and phosphate here - between the risk threshold of
        // 3.0 and the bottom of the reference range there was previously nothing at all, so a
        // K of 3.2 produced no prompt of any kind.
        if (k !== null && k >= 3.0 && k < normalRanges.k.low) addCheck(`K+ ${k} - consider replacement`, 'chk_k');
        if (mg !== null && mg >= normalRanges.mg.low && mg < 1.0) addCheck(`Mg ${mg} - consider replacement`, 'chk_mg');
        if (phos !== null && phos >= 0.32 && phos < 0.5) addCheck(`PO4 ${phos} - replacement indicated`, 'chk_phos');
        // Sodium is worth naming and not worth prompting on. Between the risk thresholds and
        // the reference range there was nothing at all, yet a sodium in that band is often a
        // diagnosis in its own right rather than a number to top up - and correcting it is the
        // treating team's call, not ALERT's. So it is stated, with who owns it, and no action
        // is suggested. The other three say "consider replacement"; this one deliberately
        // does not.
        if (na !== null && na >= 125 && na < normalRanges.na.low) {
            addCheck(`Na ${na} - hyponatraemia; correction directed by the treating team`, 'chk_na');
        } else if (na !== null && na > normalRanges.na.high && na <= 155) {
            addCheck(`Na ${na} - hypernatraemia; correction directed by the treating team`, 'chk_na');
        }
    }

    if (s.electrolyte_gate === true || (k && (k < 3.0 || k > 6.0)) || naAbnormal || mgAbnormal || phosAbnormal) {
        let msg = 'Electrolyte concern';
        let isRed = false;
        const parts = [];
        if (k) {
            if (k > 6.0) { parts.push(`high K+ ${k}`); isRed = true; }
            else if (k < 3.0) { parts.push(`low K+ ${k}`); isRed = true; }
        }
        if (naAbnormal) {
            parts.push(na < 125 ? `low Na ${na}` : `high Na ${na}`);
            isRed = true;
        }
        if (mgAbnormal) parts.push(`low Mg ${mg}`);
        if (phosAbnormal) parts.push(`low PO4 ${phos}`);
        const sev = s.electrolyteConcern;
        if (sev === 'severe') {
            if (parts.length === 0) parts.push('severe derangement');
            isRed = true;
        } else if (sev === 'mild' && parts.length === 0) {
            parts.push('mild/moderate derangement');
        }
        // Plain join: joinGrammatically lower-cases trailing items, which turns the analyte
        // names into "low mg" / "low po4".
        if (parts.length) msg += ` - ${parts.join(', ')}`;
        add(isRed ? red : amber, msg, 'electrolyteConcern', isRed ? 'red' : 'amber', s.electrolyteConcern_note);
    }

    // --- Renal ---
    // A creatinine is meaningless without the patient's own baseline, so it no longer opens the
    // gate by itself. It becomes a check, which cannot be missed but asserts nothing.
    const cr = num(s.bl_cr_review);
    if (bloodsReviewed && cr !== null && cr > 150 && s.renal !== true) {
        addCheck(`Cr ${cr} - confirm against baseline`, 'chk_cr');
    }

    const isMitigated = (s.renal_chronic === true);
    if (s.renal === true) {
        const fluidFlags = [];
        const renalFlags = [];
        if (s.renal_fluid) fluidFlags.push('fluid overload');
        if (s.renal_oedema) fluidFlags.push('oedema');
        if (s.renal_dehydrated) fluidFlags.push('dehydrated');

        if (s.renal_oliguria) renalFlags.push('oliguria <0.5ml/kg/hr');
        if (s.renal_anuria) renalFlags.push('anuria');
        if (s.renal_dysfunction) renalFlags.push('AKI');
        if (cr > 150 && !isMitigated) renalFlags.push(`Cr ${cr}`);

        if (s.renal_dialysis) {
            if (s.dialysis_type === 'new') renalFlags.push('acute dialysis');
            else if (!isMitigated) renalFlags.push('chronic dialysis');
        }

        const hasFluid = fluidFlags.length > 0;
        const hasRenal = renalFlags.length > 0;

        let label = 'Renal concern';
        if (hasFluid && hasRenal) label = 'Renal and fluid concern';
        else if (hasFluid && !hasRenal) label = 'Fluid concern';

        const allFlags = [...renalFlags, ...fluidFlags];
        if (allFlags.length) label += ` - ${joinGrammatically(allFlags)}`;

        const overrideChips = [
            // When CKD is known, oliguria and anuria are expected and don't override.
            ...(isMitigated ? [] : [s.renal_oliguria, s.renal_anuria]),
            s.renal_dysfunction, s.renal_fluid, s.renal_oedema, s.renal_dehydrated
        ];
        if (s.renal_dialysis && s.dialysis_type === 'new') overrideChips.push(true);
        const isForceAmber = overrideChips.some(x => x === true);

        if (isMitigated && !isForceAmber) {
            suppressedRisks.push(`${label} (mitigated: known CKD and Cr/urine output around baseline)`);
        } else {
            const critical = isMitigated
                ? (hasFluid && hasRenal && s.renal_dysfunction)
                : (s.renal_anuria || cr > 200 || (hasFluid && hasRenal && s.renal_dysfunction));
            if (critical) add(red, label, 'seg_renal', 'red', s.renal_note);
            else add(amber, label, 'seg_renal', 'amber', s.renal_note);
        }
    }

    // --- Infection ---
    const wcc = num(s.bl_wcc) ?? num(s.wcc);
    const crp = num(s.bl_crp) ?? num(s.crp);

    // Any one marker can open the gate, because a clinician who records only a WCC, or only a
    // CRP, still needs the gate to respond to what they wrote.
    const autoTrigger = (bloodsReviewed && ((wcc && (wcc > 15 || wcc < 2)) || (crp && crp > 100) || (nlrVal > 10))) ||
        (temp && temp >= 38);

    let downtrendSuggestion = null;
    if (autoTrigger || s.infection === true) {
        const markers = [];
        // No blood marker makes this red on its own. A CRP of 150 on post-op day two is
        // expected physiology and an NLR above 10 is routine after surgery or steroids. The one
        // unambiguous sign is a fever, which has its own red flag, so it isn't repeated here.
        if (wcc !== null && (wcc < 2 || wcc > 15)) markers.push(`WCC ${wcc}`);
        else if (wcc !== null && wcc > 11) markers.push(`WCC ${wcc}`);
        if (crp > 100) markers.push(`CRP ${crp}`);
        else if (crp > 50) markers.push(`CRP ${crp}`);
        if (nlrVal > 10) markers.push(`NLR ${nlrVal.toFixed(1)}`);
        // The temperature that opened this gate, named. Without it a low-grade fever produced
        // a bare "Infection risk" and the reader had no way to see what raised it.
        if (temp && temp >= 38 && temp < 38.5) markers.push(`Temp ${temp}`);

        let msg = 'Infection risk';
        if (markers.length) msg += ` - ${joinGrammatically(markers)}`;

        // The clinician judges the markers; the tool checks the score, and prints the number it
        // actually saw rather than repeating an unverified "ADDS low".
        const addsVerified = adds !== null && adds < 4;
        const claimsDowntrend = (s.infection_downtrend === true);

        if (claimsDowntrend && addsVerified) {
            suppressedRisks.push(`Infection risk (mitigated: infection markers downtrending, ${scoreName} ${adds})`);
        } else {
            if (claimsDowntrend) {
                addCheck(adds === null
                    ? 'Infection marked downtrending but no score recorded - not discounted'
                    : `Infection marked downtrending but ${scoreName} is ${adds} - not discounted`, 'chk_downtrend_unverified');
            }
            add(amber, msg, 'seg_infection', 'amber', s.infection_note);
        }

        // Suggest, never set: getting a flag wrong adds noise, getting a suppressor wrong
        // silently removes a concern.
        const falling = [];
        if (crpTrend && !crpTrend.rising) falling.push(`CRP ${crpTrend.previous} to ${crpTrend.current}`);
        if (wccTrend && wcc !== null && wcc > 11 && !wccTrend.rising) falling.push(`WCC ${wccTrend.previous} to ${wccTrend.current}`);
        if (falling.length && !claimsDowntrend && addsVerified) downtrendSuggestion = falling.join(', ');
    }

    // --- Haematology and clotting ---
    // Haemoglobin no longer flags on an absolute value - the baseline is far too
    // patient-specific. Albumin under 20 is close to universal after ICU. Platelets kept the
    // marker but moved the threshold: under 100 is common and usually recovering, under 20 is
    // a transfusion threshold and a real bleeding risk.
    const plts = num(s.bl_plts);
    if (bloodsReviewed && plts !== null && plts < 20) add(amber, `Low platelets Plts ${plts}`, 'bl_plts', 'amber');

    // INR and APTT are checks, not risks. A warfarinised patient at their target INR of 3.0 was
    // flagging every review; what matters is whether the value is where the team wants it.
    const checkAgainstTarget = (val, targetTxt, label, key, range) => {
        if (val === null) return;
        const t = parseTarget(targetTxt);
        if (t) {
            if (val < t.low) addCheck(`${label} ${val}, below target ${targetTxt.trim()}`, key);
            else if (val > t.high) addCheck(`${label} ${val}, above target ${targetTxt.trim()}`, key);
        } else if (val < range.low || val > range.high) {
            addCheck(`${label} ${val} - target not documented`, key);
        }
    };
    if (bloodsReviewed) {
        checkAgainstTarget(num(s.bl_inr), s.inr_target, 'INR', 'chk_inr', normalRanges.inr);
        checkAgainstTarget(num(s.bl_aptt), s.aptt_target, 'APTT', 'chk_aptt', normalRanges.aptt);
    }

    // BSL 15 and above is removed: plenty of diabetics run there at baseline.
    const bsl = num(s.e_bsl);
    if (bsl) {
        if (bsl < 4.0) add(red, `Low BSL ${bsl}`, 'e_bsl', 'red');
        else if (bsl > 20) add(red, `High BSL ${bsl}`, 'e_bsl', 'red');
    }

    // Pain is not a flag: it is fixable at the bedside, rarely the reason anyone returns to
    // ICU, and it still prints under D in the note.

    // --- Trend flags ---
    // Higher thresholds than the arrows: an arrow says the marker moved, these say it moved
    // enough to matter. Suppressed where the movement is expected - a dialysis patient's
    // creatinine climbing between sessions is the dialysis rhythm, not a deterioration.
    if (bloodsReviewed && crTrend && crTrend.rising && !isMitigated &&
        (crTrend.pctDelta > 30 || crTrend.absDelta > 30)) {
        add(amber, `Worsening Cr ${crTrend.previous} to ${crTrend.current}`, 'bl_cr_review', 'amber');
    }
    if (bloodsReviewed && crpTrend && crpTrend.rising &&
        (crpTrend.pctDelta > 50 || crpTrend.absDelta > 50)) {
        add(amber, `Rising CRP ${crpTrend.previous} to ${crpTrend.current}`, 'bl_crp', 'amber');
    }

    if (s.neuro_psych) add(amber, 'Psychological concern', 'neuro_section', 'amber', s.neuro_psych_note);

    // PICS is one question because that is how it is actually used: new hallucinations or
    // delirium on the ward, positive, refer to OT, pastoral care and psychology. A scored
    // eleven-item version was built and removed in August 2026 - delirium is the predictor the
    // literature supports, this control already captures it, and the other ten items only
    // added ticks in front of the same referral.
    if (s.pics === 'positive') add(amber, 'Post ICU Syndrome Positive', 'seg_pics', 'amber', s.pics_note);

    // --- Comorbidities ---
    const activeComorbsKeys = toggleInputs.filter(key => key.startsWith('comorb_') && s[key]);
    const countComorbs = activeComorbsKeys.length;
    if (countComorbs >= 3) {
        add(red, sentenceCase('Multiple comorbidities'), null, 'red', null);
        flagged.red.push('comorbs_wrapper');
    } else if (countComorbs > 0) {
        const cList = [];
        activeComorbsKeys.forEach(key => {
            if (key === 'comorb_other' && s.comorb_other_note) {
                s.comorb_other_note.split(/[\n,]+/).forEach(v => {
                    const trimmed = v.trim();
                    if (trimmed) cList.push(trimmed);
                });
            } else if (key !== 'comorb_other') {
                cList.push(comorbMap[key]);
            }
        });
        add(amber, sentenceCase(`Comorbidities - ${joinGrammatically(cList)}`), null, 'amber', null);
        flagged.amber.push('comorbs_wrapper');
    }

    const lact = num(s.bl_lac_review);
    if (lact > 4.0) add(red, `Lactate ${lact}`, 'bl_lac_review', 'red');
    else if (lact >= 2.0) add(amber, `Lactate ${lact}`, 'bl_lac_review', 'amber');

    // An override with a reason contributes the clinician's own words, which read as a clinical
    // finding because that is what they are. An override without one contributes nothing.
    //
    // It used to fall back to "Clinician override: CAT 1", which announced to every reader of
    // the DMR that the category came out of a piece of software and had been argued with. The
    // selection still stands - the category is taken from s.override further down, not from
    // this list - it just no longer narrates itself into the record.
    const overrideNote = (s.overrideNote || '').trim();
    if (s.override === 'red' && overrideNote) add(red, overrideNote, 'override_red', 'red');
    else if (s.override === 'red') flagged.red.push('override_red');
    if (s.override === 'amber' && overrideNote) add(amber, overrideNote, 'override_amber', 'amber');
    else if (s.override === 'amber') flagged.amber.push('override_amber');

    const age = num(s.ptAge);
    if (age >= 75) {
        if (s.age_mitigated === true) {
            suppressedRisks.push(`Age ${age}, frailty risk (mitigated: ${s.age_mitigate_reason || 'baseline function active'})`);
        } else {
            add(amber, `Age ${age}, increased risk of complications`, 'ptAge', 'amber');
        }
    }

    if (s.frailty_known === true) add(amber, 'Known frailty at baseline', 'seg_frailty_known', 'amber', s.frailty_note);

    // --- Deconditioning ---
    // Immobility and a prolonged ICU stay describe one clinical picture, so they are decided
    // together and reported as one line, after every other flag. Two blocks running at
    // different points meant each saw a different set of "other risks" and the same patient
    // could come out with immobility amber and prolonged stay red.
    //
    // A long stay only escalates to red when something else is also wrong. Age is excluded from
    // "something else" - it is a standing characteristic, not a new problem - and the old test
    // matched any flag containing the letters "age", which caught words like haemorrhage.
    const icuLos = num(s.icuLos) || 0;
    const isProlongedStay = icuLos > 4;
    const isImmobile = s.immobility === true;

    if (isProlongedStay || isImmobile) {
        const AGE_FLAG = /^Age \d/;
        const hasOtherRisk = [...new Set([...red, ...amber])].filter(t => !AGE_FLAG.test(t)).length > 0;

        const parts = [];
        if (isProlongedStay) parts.push(`${icuLos}-day ICU stay`);
        if (isImmobile) parts.push('immobile');
        const label = `Deconditioning risk - ${joinGrammatically(parts)}`;
        const flagId = isImmobile ? 'seg_immobility' : 'icuLos';

        // The mitigator is not available to an immobile patient. "Recovering appropriately,
        // trajectory to recovery established" is not a statement anyone can make about someone
        // who isn't mobile, so the claim is ignored rather than half-applied - the control is
        // hidden at the same time, in updateLosMitigationUI.
        const losMitigated = (s.los_mitigated === true) && !isImmobile;
        const losReason = (s.los_mitigate_reason || '').trim();

        if (isProlongedStay && hasOtherRisk && !losMitigated) {
            add(red, label, flagId, 'red', s.immobility_note);
        } else if (isImmobile || (isProlongedStay && age >= 75 && !losMitigated)) {
            add(amber, label, flagId, 'amber', s.immobility_note);
        } else if (losMitigated) {
            suppressedRisks.push(`${label} (mitigated: recovering appropriately, trajectory to recovery established${losReason ? ` - ${losReason}` : ''})`);
        } else {
            suppressedRisks.push(`${label} (mitigated: no other risk factors identified)`);
        }
    }

    // --- Category ---
    // Risks released from a gate and left standing on the list. They bypass add() deliberately:
    // the entry already exists on the list and in the note, so this contributes its weight to
    // the category and nothing else. Quick Review's scoring allowlist does not apply to them
    // either - the clinician confirming a carried risk is a stronger signal than any rule.
    (ctx.listRisks || []).forEach(entry => {
        // Today's data supersedes yesterday's concern. If the rules have already raised this
        // same gate's risk from what was measured today, that finding stands on its own and the
        // carried copy would only say it twice - in last review's words.
        const alreadyRaised = entry.gateId &&
            (flagged.red.includes(entry.gateId) || flagged.amber.includes(entry.gateId));
        if (alreadyRaised) return;
        const isRed = entry.severity === 'red';
        (isRed ? red : amber).push(entry.text);
        if (entry.gateId) flagged[isRed ? 'red' : 'amber'].push(entry.gateId);
    });

    const uniqueRed = [...new Set(red)];
    const uniqueAmber = [...new Set(amber)];
    const redCount = uniqueRed.length;
    const amberCount = uniqueAmber.length;

    let autoCat = { id: 'green', text: 'CAT 3' };
    if (redCount > 0) autoCat = { id: 'red', text: 'CAT 1' };
    else if (amberCount > 0) autoCat = { id: 'amber', text: 'CAT 2' };

    // A manual selection is clinician-directed and wins over the computed category in either
    // direction - selecting CAT 2 on a patient scoring CAT 1 makes them CAT 2. The flags are
    // still counted, listed and carried into the summary: the clinician overrules the
    // conclusion, not the evidence. A reason is asked for on a downgrade but never gates it -
    // an override that silently didn't apply is worse than an unexplained one.
    const OVERRIDE_CATS = {
        red: { id: 'red', text: 'CAT 1' },
        amber: { id: 'amber', text: 'CAT 2' },
        green: { id: 'green', text: 'CAT 3' }
    };
    let cat = autoCat;
    const downgradeReason = (s.overrideNote || '').trim();
    const chosenCat = OVERRIDE_CATS[s.override];
    if (chosenCat) {
        cat = chosenCat.id === autoCat.id
            ? autoCat
            : { ...chosenCat, downgradedFrom: autoCat.text, downgradeReason };
    }

    return {
        red: uniqueRed,
        amber: uniqueAmber,
        suppressed: suppressedRisks,
        redCount,
        amberCount,
        cat,
        autoCat,
        downgradeReason,
        flagged,
        riskEntries,
        issues,
        issueKeys: [...riskEntries.map(e => e.id), ...bloodIssueKeys, ...checkKeys],
        timeData,
        isPre,
        isRecent,
        afterHoursDerived,
        nlrVal,
        activeComorbsKeys,
        countComorbs,
        downtrendSuggestion,
        bloodsReviewed
    };
}
