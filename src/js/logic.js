/* =========================================
   ALERT Nursing Risk Assessment Tool
   Interface layer: reads the form, runs the rules, paints the result
   Copyright © 2025-2026 Casey Bond
   MIT License - https://opensource.org/licenses/MIT
   ========================================= */

import { $, num, wardLabel } from './utils.js';
import { normalRanges } from './config.js';
import {
    getState, isQuickReviewMode, initialQuickReviewRisks, quickReviewBaselineCaptured,
    setQuickReviewBaselineCaptured,
    addActiveIssue, maybeToastNewRisk, reconcileAutoIssues, renderScrapedIssuesList, getUnreviewedScrapedCount, getScoringListRisks, getDeletedRiskKeys} from './state.js';
import {
    updateSidebarRiskBadges, maybeOfferQuickReview, refreshCategorySelect, showNewRiskAlert,
    updateAgeMitigationUI, updateLosMitigationUI, renderQuickChips
} from './ui.js';
import { setNotice, clearNotice, NOTICE_PRIORITY } from './notices.js';
import { applyTrendArrows } from './trends.js';
import { evaluateRisks, calculateWardTime } from './rules.js';

// Re-exported: the rules moved to rules.js, but callers still import this from here.
export { calculateWardTime };

// Everything the risk model decides now lives in rules.js as a pure function. What remains
// here is the interface half: read the form, hand the state to the rules, then paint the
// answer back onto the page. The split is what makes the rules testable without a browser,
// and it is the only piece of this tool that would move to another platform intact.
export function computeAll() {
    try {
        const s = getState();

        // Fields the tool fills in on the clinician's behalf. Done before evaluation because
        // they are derived from state rather than from the assessment, and skipped entirely
        // once the clinician has typed over them.
        autofillDerivedFields(s);

        const ahGroup = document.querySelector('#seg_after_hours');
        const result = evaluateRisks(s, {
            prevBloods: window.prevBloods || {},
            afterHoursManual: ahGroup ? ahGroup.dataset.manual === 'true' : false,
            quickReview: isQuickReviewMode,
            listRisks: getScoringListRisks(),
            deletedRiskKeys: getDeletedRiskKeys()
        });

        // The rules report what after-hours should be; applying it to the control and to the
        // state object is the interface's job.
        if (result.afterHoursDerived !== null) {
            s.after_hours = result.afterHoursDerived;
            const yes = document.querySelector('#seg_after_hours .seg-btn[data-value="true"]');
            const no = document.querySelector('#seg_after_hours .seg-btn[data-value="false"]');
            if (result.afterHoursDerived) { yes?.classList.add('active'); no?.classList.remove('active'); }
            else { no?.classList.add('active'); yes?.classList.remove('active'); }
        }

        // Issues are staged in the order the rules produced them, so the Review List reads the
        // same way it did when this was all one interleaved function.
        result.issues.forEach(issue => {
            const { isNew } = addActiveIssue(issue);
            if (isNew && issue.source === 'auto') maybeToastNewRisk(issue.key, issue.text);
        });

        if (s.bloods_status !== 'nil_sig' && s.bloods_status !== 'not_checked' && !s.chk_bloods_nil_sig) {
            applyTrendArrows(s, window.prevBloods);
        }
        updatePrevBloodsHint();
        renderDerivedDisplays(s, result);

        // Names the render half of this function still expects.
        const { red: uniqueRed, amber: uniqueAmber, suppressed: suppressedRisks,
            redCount, amberCount, cat, autoCat, downgradeReason, flagged, riskEntries,
            timeData, countComorbs, activeComorbsKeys } = result;

                refreshCategorySelect(autoCat, s.override, downgradeReason, redCount, amberCount);

        const catText = $('catText'); if (catText) { catText.className = `status ${cat.id}`; catText.textContent = cat.text; }
        const catBox = $('categoryBox'); if (catBox) catBox.style.borderColor = `var(--${cat.id})`;
        const rc = $('redCount'); if (rc) { rc.textContent = redCount; rc.style.color = redCount ? 'var(--red)' : ''; }
        const ac = $('amberCount'); if (ac) { ac.textContent = amberCount; ac.style.color = amberCount ? 'var(--amber)' : ''; }
        const stickyScore = $('footerScore');
        if (stickyScore) { stickyScore.className = `footer-score tag ${cat.id}`; stickyScore.textContent = cat.text; }

        updateSidebarRiskBadges(redCount, amberCount);

        reconcileAutoIssues(new Set(result.issueKeys));
        renderScrapedIssuesList();
        maybeOfferQuickReview(timeData, s);

        if (isQuickReviewMode) {
            if (!quickReviewBaselineCaptured) {
                initialQuickReviewRisks.red = [...uniqueRed];
                initialQuickReviewRisks.amber = [...uniqueAmber];
                setQuickReviewBaselineCaptured(true);
            } else {
                // ADDS/bloods are handled silently in the background - they must not kick the
                // clinician out of Quick Review, only genuinely new clinical risks do that.
                // A manual category choice is the clinician's own deliberate act, so it isn't
                // "detected" and shouldn't alert them about themselves.
                const silentTexts = new Set(
                    riskEntries
                        .filter(e => e.id === 'adds' || e.id.startsWith('bl_') || e.id.startsWith('override_'))
                        .map(e => e.text)
                );
                const newRed = uniqueRed.filter(r => !initialQuickReviewRisks.red.includes(r) && !silentTexts.has(r));
                const newAmber = uniqueAmber.filter(r => !initialQuickReviewRisks.amber.includes(r) && !silentTexts.has(r));

                if (newRed.length > 0 || newAmber.length > 0) {
                    // A new risk no longer ejects the clinician: it's flagged loudly, staged in
                    // the issues list, and they decide whether the full form is needed. Folding
                    // it into the baseline stops the same risk re-alerting on every keystroke.
                    showNewRiskAlert(newRed, newAmber);
                    initialQuickReviewRisks.red.push(...newRed);
                    initialQuickReviewRisks.amber.push(...newAmber);
                }
            }
        }

        // Counted flags sit inside their own category box; only the discounted ones are
        // listed separately, so nothing that shaped the category is out of sight.
        const redListEl = $('redFlagList');
        if (redListEl) redListEl.innerHTML = uniqueRed.map(t => `<li>${t}</li>`).join('');
        const amberListEl = $('amberFlagList');
        if (amberListEl) amberListEl.innerHTML = uniqueAmber.map(t => `<li>${t}</li>`).join('');

        const listEl = $('flagList');
        if (listEl) {
            listEl.innerHTML = suppressedRisks.length
                ? `<div class="suppressed-title">Not counted toward category</div>` +
                  suppressedRisks.map(t => `<div>${t}</div>`).join('')
                : '';
        }

        document.querySelectorAll('.flag-red, .flag-amber').forEach(e => e.classList.remove('flag-red', 'flag-amber'));
        flagged.red.forEach(id => {
            const el = $(id);
            if (el) {
                if (id.endsWith('_wrapper')) {
                    el.classList.add('flag-red');
                } else {
                    el.closest('.toggle-label, .input-box, .question-row')?.classList.add('flag-red');
                }
            }
        });
        flagged.amber.forEach(id => {
            const el = $(id);
            if (el) {
                if (id.endsWith('_wrapper')) {
                    el.classList.add('flag-amber');
                } else {
                    el.closest('.toggle-label, .input-box, .question-row')?.classList.add('flag-amber');
                }
            }
        });

        let planHtml = '';
        const hoursSinceStep = timeData.hours;

        const disPrompt = $('discharge_prompt');
        const disMsg = $('discharge_msg');
        const chkDischarge = $('chk_discharge_alert');
        const disWrap = $('chk_discharge_wrapper');

        if (disPrompt) {
            const alreadyChecked = chkDischarge && chkDischarge.checked;
            const dismissed = window.dismissedDischarge === true;
            const isPost = s.reviewType === 'post';

            let showPrompt = false;

            if (isPost && !alreadyChecked && !dismissed) {
                // A CAT 3 needs a full 24h on the list before discharge is even offered. The
                // rest of the criteria - two reviews, at least one of them physical - are
                // things the spreadsheet already records, so they're confirmed by the
                // clinician in the modal behind this prompt rather than re-asked here.
                if (cat.id === 'green' && hoursSinceStep >= 24) showPrompt = true;
                else if (cat.id === 'amber' && hoursSinceStep >= 48) showPrompt = true;
                else if (cat.id === 'red' && hoursSinceStep >= 72) showPrompt = true;
            }

            if (showPrompt) {
                disPrompt.style.display = 'block';
                disPrompt.style.borderColor = `var(--${cat.id})`;
                if (cat.id === 'green') disPrompt.style.borderColor = `var(--green)`;

                // The colour name used to be printed beside the category - "CAT 3 Green" - which
                // says the same thing twice, since CAT 3 is green.
                let hoursTxt = Math.round(hoursSinceStep) + " hours";

                // Styling lives in style.css now - the category colour is the only part that
                // varies, so it is the only thing set from here. No pulse: it competed with
                // every other thing on the page asking to be looked at.
                disMsg.innerHTML = `
                    <div class="discharge-prompt-title status ${cat.id}">${cat.text} - ${hoursTxt} on list</div>
                    <div class="discharge-prompt-question">Can the patient be discharged?</div>
                `;
            } else {
                disPrompt.style.display = 'none';

                const continueChk = $('chk_continue_alert');
                if (continueChk && !s.chk_discharge_alert && !s.chk_discharge_pending_bloods && s.reviewType === 'post') {
                    continueChk.checked = true;
                }
            }
        }

        const hoursMap = { 'red': '72h', 'amber': '48h', 'green': '24h' };
        const h = hoursMap[cat.id] || '24h';
        const cssClass = cat.id === 'green' ? 'green' : cat.id === 'amber' ? 'amber' : 'red';

        if (s.stepdown_suitable === false) {
            planHtml = `<div class="status red">Not suitable for stepdown.</div>`;
        } else if (s.chk_discharge_alert) {
            planHtml = `<div class="status" style="color:var(--blue-hint)">Discharge from ALERT nursing list.</div>`;
        } else if (s.chk_discharge_pending_bloods) {
            planHtml = `<div class="status" style="color:#ea580c; font-weight: 700;">Discharge pending next bloods</div>`;
        } else {
            planHtml = `<div class="status ${cssClass}">At least daily ALERT nursing reviews for up to ${h} post-ICU stepdown.</div>`;
            planHtml += `<div style="margin-top:2px; font-weight:500; font-size: 0.9em; color:var(--text-light);">- Please contact ALERT if further support required between reviews.</div>`;
        }

        if (s.chk_medical_rounding) planHtml += `<div style="margin-top:2px; font-weight:600; color:var(--accent);">+ Added to ALERT Medical Rounding List</div>`;
        const fu = $('followUpInstructions'); if (fu) fu.innerHTML = planHtml;

        checkCompleteness(s, countComorbs);
        // What each gate was scoring, so that releasing one into the list can carry its
        // weight across rather than guessing at it.
        window._lastRiskEntries = riskEntries;
        window._lastRed = uniqueRed;
        window._lastAmber = uniqueAmber;
        window._lastSuppressed = suppressedRisks;
        window._lastState = s;
        window._lastCat = cat;
        window._lastWardTime = timeData.text;
        window._lastActiveComorbsKeys = activeComorbsKeys;
    } catch (err) {
        console.error("Compute Error:", err);
    }
}

// Fields the tool writes into the form rather than reads from it. Each one steps aside the
// moment the clinician types over it - dataset.manual is set by the input handler.
function autofillDerivedFields(s) {
    const oxDevInput = $('b_device');
    if (oxDevInput && oxDevInput.dataset.manual !== 'true') {
        const mode = s.oxMod;
        let devStr = '';
        if (mode === 'RA') devStr = 'RA';
        else if (mode === 'NP') devStr = `NP ${s.npFlow || ''}L`;
        else if (mode === 'HFNP') devStr = `HFNP ${s.hfnpFio2 || ''}%/${s.hfnpFlow || ''}L`;
        else if (mode === 'NIV') devStr = `NIV ${s.nivFio2 || ''}%`;
        oxDevInput.value = devStr;
    }

    const airwayInput = $('airway_a');
    if (airwayInput && airwayInput.dataset.manual !== 'true') {
        if (s.oxMod === 'Trache') {
            airwayInput.value = `${s.tracheType || 'Tracheostomy'}${s.tracheStatus === 'New' ? ' (New)' : ''}`;
        } else if (airwayInput.value.startsWith('Tracheostomy') || airwayInput.value.startsWith('Laryngectomy')) {
            airwayInput.value = '';
        }
    }
}

// Read-outs that describe the assessment without being part of it.
// The Quick Review decision strip and the discharge question under it. Both are prompts and
// neither ticks anything: the discharge checkboxes stay where they are, in the plan, and the
// clinician is the one who reaches for them.
function renderQuickReviewDecision(s, result) {
    const discharge = $('qr_discharge_prompt');
    if (!discharge) return;

    const chosen = (s.override && s.override !== 'none') ? s.override : null;
    // Nothing to ask until the category has been chosen - the question's answer depends on it,
    // and asking early invites the reflex "yes" this tool exists to slow down.
    if (!isQuickReviewMode || !chosen) { discharge.hidden = true; discharge.innerHTML = ''; return; }

    // Time on the list is time since stepdown: patients join at stepdown, so the tool already
    // knows it and can put the number in the question.
    const onList = result.timeData?.text || '';
    const already = s.chk_discharge_alert || s.chk_discharge_pending_bloods;

    // CAT 2 is deliberately silent. Asking "continue reviews, or discharge pending bloods?" at
    // a day and a half puts the second half of that sentence in the clinician's head, which is
    // leading - and discharge pending bloods is a decision that should arrive on its own.
    let question = null;
    if (already) {
        question = 'Discharge from the ALERT list is recorded in the plan below.';
    } else if (chosen === 'green') {
        question = `${onList} on the list - CAT 3 - can this patient be discharged from ALERT?`;
    } else if (chosen === 'red') {
        question = `${onList} on the list - CAT 1 - cannot be discharged today.`;
    }

    if (!question) { discharge.hidden = true; discharge.innerHTML = ''; return; }

    discharge.hidden = false;
    discharge.className = `qr-discharge-prompt${already ? ' answered' : ''}`;
    discharge.innerHTML = `<span class="qr-discharge-text">${question}</span>` +
        (already || chosen === 'red' ? '' : '<span class="qr-discharge-hint">Set it in the plan below</span>');
}

function renderDerivedDisplays(s, result) {
    renderQuickReviewDecision(s, result);
    renderQuickChips(s);

    // Driven from here rather than only from the debounced compute() in main.js: the segmented
    // buttons call computeAll() directly, so a mitigator whose visibility depends on a gate -
    // the LOS one hides once immobility is recorded - was never refreshed when that gate was
    // the thing that changed.
    updateAgeMitigationUI();
    updateLosMitigationUI();

    const pmhSubtitle = $('pmh_subtitle');
    if (pmhSubtitle) {
        const hasComorbidities = result.countComorbs > 0;
        const hasPmhNote = s.pmh_note && s.pmh_note.trim().length > 0;
        pmhSubtitle.style.display = (hasComorbidities || hasPmhNote) ? 'block' : 'none';
    }

    const nlrEl = $('nlrCalc');
    if (nlrEl) {
        if (result.nlrVal > 0) {
            nlrEl.textContent = `NLR: ${result.nlrVal.toFixed(2)}`;
            nlrEl.style.borderColor = (result.nlrVal > 10) ? 'var(--red)' : 'var(--line)';
        } else {
            nlrEl.textContent = 'NLR: --';
            nlrEl.style.borderColor = 'var(--line)';
        }
    }

    const fn = $('footerName'); if (fn) fn.textContent = s.ptName || '--';
    const fl = $('footerLocation'); if (fl) fl.textContent = `${wardLabel(s) || '--'} ${s.ptBed || ''}`;
    const fa = $('footerAdmission'); if (fa) fa.textContent = s.ptAdmissionReason || '--';

    const timeOffEl = $('pressor_time_off_display');
    if (timeOffEl) {
        const recentKeys = ['pressor_recent_norad', 'pressor_recent_met', 'pressor_recent_gtn', 'pressor_recent_dob', 'pressor_recent_mid', 'pressor_recent_other'];
        if (recentKeys.some(k => s[k]) && s.pressor_ceased_time) {
            const now = new Date();
            const [cH, cM] = s.pressor_ceased_time.split(':');
            const ceasedDate = new Date();
            ceasedDate.setHours(cH, cM);
            if (ceasedDate > now) ceasedDate.setDate(ceasedDate.getDate() - 1);
            timeOffEl.textContent = `~${Math.floor((now - ceasedDate) / 3600000)} hrs ago`;
        } else {
            timeOffEl.textContent = '';
        }
    }

    // Offered suppression - the rules decide whether the evidence supports it, the interface
    // asks the question, and only the clinician's click discounts the risk.
    const suggestion = $('infection_downtrend_suggestion');
    if (suggestion) {
        if (result.downtrendSuggestion) {
            suggestion.innerHTML = `<span>${result.downtrendSuggestion} - mark markers as downtrending?</span>
                <button type="button" id="btnAcceptDowntrend" class="btn small">Yes, downtrending</button>`;
            suggestion.hidden = false;
        } else {
            suggestion.hidden = true;
            suggestion.innerHTML = '';
        }
    }
}

// Absence of previous results is easy to miss, because the tool simply shows no arrows and
// fires no trend flags. Only shown once the clinician has started entering results - before
// that there is nothing to compare and the hint would just be noise.
function updatePrevBloodsHint() {
    const hint = $('prev_bloods_hint');
    if (!hint) return;
    const hasPrev = window.prevBloods && Object.keys(window.prevBloods).length > 0;
    const hasCurrent = Object.keys(normalRanges).some(k => num($(`bl_${k}`)?.value) !== null);
    hint.hidden = hasPrev || !hasCurrent;
}

export function checkCompleteness(s, comorbCount) {
    const missing = [];
    if (!s.ptName) missing.push('Patient initials');
    if (!s.ptMrn) missing.push('URN');
    if (!s.ptWard) missing.push('Ward');
    if (!s.reviewerInitials) missing.push('Reviewer');

    // The completeness notice is easy to scroll past, so the reviewer field also marks itself.
    $('reviewerInitials')?.closest('.rs-field-reviewer')
        ?.classList.toggle('reviewer-missing', !s.reviewerInitials);

    // Carried lines nobody has looked at yet. Below the discharge prompt and well below a new
    // red flag: it is a housekeeping reminder, not a finding, and it disappears the moment the
    // last carried line has been edited or deleted. Deliberately no action button - the work is
    // on the lists themselves, and a button here would only take the clinician somewhere they
    // are already looking.
    const unreviewed = getUnreviewedScrapedCount();
    if (unreviewed) {
        setNotice('scraped-review', {
            priority: NOTICE_PRIORITY.SCRAPED_REVIEW,
            tone: 'info',
            html: `<div class="notice-title">${unreviewed} ${unreviewed === 1 ? 'line' : 'lines'} carried from the last note - edit or delete as appropriate for today's review</div>`
        });
    } else {
        clearNotice('scraped-review');
    }

    // Lowest priority of any notice: worth saying, never worth saying over a new red flag.
    if (missing.length) {
        setNotice('completeness', {
            priority: NOTICE_PRIORITY.COMPLETENESS,
            tone: 'info',
            html: `<div class="notice-title">Not yet recorded: ${missing.join(', ')}</div>`
        });
    } else {
        clearNotice('completeness');
    }
}
