/* =========================================
   ALERT Nursing Risk Assessment Tool
   Session state: save, restore, and the Review List model
   Copyright © 2025-2026 Casey Bond
   MIT License - https://opensource.org/licenses/MIT
   ========================================= */

import { STORAGE_KEY, UNDO_KEY, ACCORDION_KEY, staticInputs, segmentedInputs, toggleInputs, selectInputs, deviceTypes } from './config.js';
import { $, showToast, timeHHMM } from './utils.js';
import { handleSegmentClick, updateWardOptions, updateReviewTypeVisibility, updateReviewerRoleVisibility, updateIcuRoundingPrompt, updateWardOtherVisibility, createDeviceEntry, updateDevicesSectionVisibility, toggleOxyFields, toggleInfusionsBox, toggleBowelDate } from './ui.js';

window.prevBloods = {};

export let isQuickReviewMode = false;
export function setQuickReviewMode(v) { isQuickReviewMode = v; }

export let previousCategoryData = null;
export function setPreviousCategoryData(v) { previousCategoryData = v; }

export let initialQuickReviewRisks = { red: [], amber: [] };
export function setInitialQuickReviewRisks(v) { initialQuickReviewRisks = v; }

export let quickReviewBaselineCaptured = false;
export function setQuickReviewBaselineCaptured(v) { quickReviewBaselineCaptured = v; }

export let quickReviewDismissedBySession = false;
export function setQuickReviewDismissed(v) { quickReviewDismissedBySession = v; }

// Set once the offer banner has been shown, so computeAll doesn't re-show/re-scroll it.
export let quickReviewOffered = false;
export function setQuickReviewOffered(v) { quickReviewOffered = v; }

// --- Active Issues model: backs the Scraped Risks staging list + Excel handover line ---
export let activeIssues = [];
const toastedRiskKeys = new Set();
let _activeIssueCounter = 0;

// Which list an entry belongs on. Three values, two of them visible:
//
//   'risks'   - what could send this patient back to ICU. The computed flags, the risks
//               carried over from the previous note, and anything the clinician adds as one.
//   'factors' - how the patient is rather than what might return them: mobility, diet,
//               psych, the context that travels between reviews without ever being a risk.
//   'checks'  - things to look at that are neither. Clotting against a documented target,
//               a MODS parameter to confirm, an electrolyte low enough to replace. These
//               never sit in either list; they get their own compact strip.
//
// The risks/factors seam is not new. The Excel handover line has always excluded severity
// 'info' entries and included the rest, so this makes an existing distinction visible rather
// than inventing one.
// A fourth value, 'bloods', is assigned explicitly by the rules for out-of-range results.
// Those render nowhere - they exist only so the Excel handover line can name which bloods
// were abnormal - so nothing defaults into it.
function defaultListFor(source, severity) {
    return severity === 'info' ? 'factors' : 'risks';
}

export function addActiveIssue({ text, source, severity, key, list, carried, mitigated, scoresAs, gateId }) {
    // A tick the clinician made still counts as a match, so a risk that is still firing
    // updates that entry instead of reappearing as a second, unticked copy. Entries retired
    // by reconcileAutoIssues() are not matched, so a genuine recurrence still arrives as new.
    const existing = activeIssues.find(i => i.key === key && (!i.resolved || i.resolvedByUser));
    if (existing) {
        existing.text = text;
        existing.severity = severity;
        // Only an explicit assignment moves an entry between lists. A clinician who dragged a
        // scraped line into the other list should not have it moved back by a re-import.
        if (list) existing.list = list;
        return { issue: existing, isNew: false };
    }
    const issue = {
        id: `ai_${++_activeIssueCounter}`, text, source, severity, key,
        list: list || defaultListFor(source, severity),
        // 1 means raised this review. The importer passes a higher number when it reads a
        // "(carried N)" back off the previous note.
        carried: carried || 1,
        // A risk the previous note recorded as considered and discounted. It comes back
        // carrying its reason rather than as a live risk, so the mitigation isn't silently
        // lost the moment the note is re-imported.
        mitigated: !!mitigated,
        // Set when this entry was released from a gate. It then scores what that gate was
        // scoring, for as long as it is left standing. See getScoringListRisks().
        scoresAs: scoresAs || null,
        gateId: gateId || null,
        resolved: false, createdAt: _activeIssueCounter
    };
    activeIssues.push(issue);
    return { issue, isNew: true };
}

// The add row under each list passes its own list, so what the clinician types lands where
// they typed it rather than being guessed at from the wording.
export function addManualIssue(text, list = 'risks') {
    return addActiveIssue({
        text, source: 'manual', list,
        severity: list === 'factors' ? 'info' : 'amber',
        key: `manual_${_activeIssueCounter + 1}`
    });
}

export function getIssuesForList(list) {
    return activeIssues.filter(i => i.list === list && (!i.resolved || i.resolvedByUser));
}

// Checks never carry a resolved state worth showing - they either apply to today's numbers or
// they don't - so this is the live set only.
export function getActiveChecks() {
    return activeIssues.filter(i => i.list === 'checks' && !i.resolved);
}

// Deleting an entry marks it gone without removing it: it stays visible (struck through),
// drops out of the note and the handover line, and can be undone. This is the only control on
// a row that changes what the outputs say.
//
// The control says "delete", the flag is still called `resolved`. The word on screen changed
// because most of what sits on these lists now arrived from the previous note, and "resolved"
// asserts a clinical claim - that something was dealt with - which is not what a clinician
// means when they clear a line that simply doesn't apply to this patient today. The flag kept
// its name because it is what a restored session is holding; renaming it would silently drop
// the state of every list a clinician had already pruned.
export function toggleActiveIssueResolved(id) {
    const issue = activeIssues.find(i => i.id === id);
    if (!issue) return;
    // Acting on a line is what counts as having reviewed it. See getUnreviewedScrapedCount().
    issue.touched = true;
    issue.resolved = !issue.resolved;
    // The nudge counting untouched lines is raised from computeAll, and deleting a row is one
    // of the few things that changes the outputs without touching a form field - so without
    // this the last line could be dealt with and the nudge would sit there until the next
    // keystroke happened to clear it.
    window.compute?.();
    // Distinguishes a clinician's tick from reconcileAutoIssues() retiring a stale auto risk,
    // which should still disappear silently.
    issue.resolvedByUser = issue.resolved;
    renderScrapedIssuesList();
}

// No longer wired to a control on the row - resolve covers taking an entry out of the note
// and the handover line, and does it reversibly. Kept because clearActiveIssues and any
// future tidy-up path need a way to actually remove one.
export function deleteActiveIssue(id) {
    activeIssues = activeIssues.filter(i => i.id !== id);
    renderScrapedIssuesList();
}

export function editActiveIssueText(id, newText) {
    const issue = activeIssues.find(i => i.id === id);
    if (issue) { issue.text = newText; issue.touched = true; }
    renderScrapedIssuesList();
    window.compute?.();
}

// Lines carried in from the previous note that the clinician has not yet edited or deleted.
//
// A scraped line reaching today's note unlooked-at is the tool asserting a risk nobody
// re-assessed, which is the failure this whole round trip could quietly become. It is not
// blocked - blocking would be worse, and plenty of carried lines are still true - but it is
// worth one quiet line saying the list wants a pass.
export function getUnreviewedScrapedCount() {
    return activeIssues.filter(i => i.source === 'scraped' && !i.touched && !i.resolved).length;
}

export function getUnresolvedActiveIssues() { return activeIssues.filter(i => !i.resolved); }

// What the two lists are still holding when the note is generated, each feeding its own
// section. If a clinician left an entry standing rather than deleting it, they meant it to be
// recorded.
//
// One exclusion, in both: entries that mirror an assessment field the note already prints in
// its own words. The importer fills ae_mobility/ae_diet *and* stages a list row carrying the
// same text, so without this "Mobility: assist x1" arrives under the assessment and again
// below it.
const MIRRORS_AN_ASSESSMENT_FIELD = new Set(['ae_mobility', 'ae_diet']);

// How long a line has been riding along, written into the note so the next import can read it
// back and keep counting. A list that only grows stops being read; by day five a line nobody
// has pruned looks exactly like one raised this morning, and this is what tells them apart.
function withCarry(issue) {
    return issue.carried > 1 ? `${issue.text} (carried ${issue.carried})` : issue.text;
}

export function getFactorsForNote() {
    return activeIssues
        .filter(i => i.list === 'factors' && !i.resolved)
        .filter(i => !MIRRORS_AN_ASSESSMENT_FIELD.has(i.key))
        .map(withCarry);
}

// Computed risks are excluded here and supplied by the caller from the rules' own red/amber/
// suppressed lists instead, so a risk that is still firing is stated in today's wording rather
// than in whatever wording it was carried over with.
export function getRisksForNote() {
    return activeIssues
        .filter(i => i.list === 'risks' && !i.resolved)
        .filter(i => i.source !== 'auto')
        // Entries released from a gate reach the note through the computed risk list instead,
        // because they score - see getScoringListRisks(). Letting them through here as well
        // would print each of them twice.
        .filter(i => !i.scoresAs)
        .map(withCarry);
}

// Risks that were released from a gate and have been left standing on the list.
//
// Leaving one there is an affirmative act: the clinician read it and did not delete it. So it
// has to carry the weight the gate it came from was carrying, or the list becomes a place
// where a real risk can sit in plain sight scoring nothing - which is precisely how a category
// gets missed by someone working from the list rather than the gates.
//
// Deleting the entry is what withdraws it, and that is the whole contract: on the list, it
// counts; struck through, it doesn't.
// Computed risks the clinician struck off the list. Only their own deletions count here -
// reconcileAutoIssues() retires stale auto entries on its own, and those must not be read as
// a decision to suppress the risk if it fires again.
export function getDeletedRiskKeys() {
    return new Set(activeIssues.filter(i => i.source === 'auto' && i.resolvedByUser).map(i => i.key));
}

export function getScoringListRisks() {
    return activeIssues
        .filter(i => i.scoresAs && !i.resolved)
        .map(i => ({ text: withCarry(i), severity: i.scoresAs, gateId: i.gateId }));
}

export function getChecksForNote() {
    return getActiveChecks().map(i => i.text);
}

// What the list shows: everything live, plus anything the clinician ticked off themselves.
function getVisibleActiveIssues() { return activeIssues.filter(i => !i.resolved || i.resolvedByUser); }

export function clearActiveIssues() {
    activeIssues = [];
    toastedRiskKeys.clear();
    renderScrapedIssuesList();
}

// Resolve auto-sourced issues whose risk no longer fires, so a recurrence toasts again as new.
export function reconcileAutoIssues(currentKeys) {
    activeIssues.forEach(issue => {
        const isAutoSourced = issue.source === 'auto' || issue.source === 'bloods';
        if (isAutoSourced && !issue.resolved && !currentKeys.has(issue.key)) {
            issue.resolved = true;
            toastedRiskKeys.delete(issue.key);
        }
    });
}

// Per-risk toasts are retired. A busy patient could fire half a dozen of them in a row while
// the clinician was still typing, each one covering the footer for three seconds. The Review
// List already holds every risk, and genuinely new ones raise a notice. Kept as a no-op that
// still records the key, because that set is what stops a risk being treated as new twice.
export function maybeToastNewRisk(key, text) {
    toastedRiskKeys.add(key);
}

// The two lists and the checks strip, repainted together. computeAll() calls this constantly,
// so it bails out of any list that has an inline edit open rather than destroying it.
const LIST_UI = {
    factors: { container: 'patient_factors_list', count: 'factors_count', input: 'manualFactorInput' },
    risks: { container: 'scraped_issues_list', count: 'issues_count', input: 'manualIssueInput' }
};

function renderOneList(listName) {
    const ui = LIST_UI[listName];
    const list = $(ui.container);
    if (!list) return;
    if (list.querySelector('.scraped-issue-edit')) return;

    const issues = getIssuesForList(listName);

    // Full Review asks every patient-factor question in the A-E panel, so the card has no job
    // there except to show what the last note carried in - and an empty card with an add row
    // in it is an invitation to record the same thing twice. It appears only when the importer
    // actually put something on the list, and stays for the rest of the session once it has,
    // so a line deleted by mistake can still be undone from the struck-through row.
    //
    // Quick Review keeps it unconditionally: there is no A-E panel there, which is the whole
    // reason the list exists.
    if (listName === 'factors') {
        const card = $('patient_factors_wrapper');
        if (card) card.hidden = !isQuickReviewMode && issues.length === 0;
    }

    const count = $(ui.count);
    const openCount = issues.filter(i => !i.resolved).length;
    const goneCount = issues.length - openCount;
    // Says what the two states are, so a struck-through line isn't a mystery.
    if (count) {
        const parts = [];
        if (openCount) parts.push(`${openCount} open`);
        if (goneCount) parts.push(`${goneCount} deleted`);
        count.textContent = parts.length ? `(${parts.join(' · ')})` : '';
    }

    if (issues.length === 0) {
        // An empty list stays empty, in both modes. It used to explain itself in Quick Review,
        // on the reasoning that a blank card reads as broken - but the card title and the add
        // row beneath it already say what the list is for, so the sentence was a third thing
        // saying the same thing in a mode built to have less on the page.
        list.innerHTML = '';
        return;
    }

    // Two controls, each saying what it does. "Delete" rather than "resolve": most of what
    // sits here arrived from the previous note, and resolved asserts a clinical claim - that
    // something was dealt with - which is not what clearing an inapplicable line means. It is
    // still reversible, which is why the row stays struck through and the button says undo.
    // Correcting a wrong entry is what edit is for, and the pencil is what says so.
    list.innerHTML = issues.map(issue => `
        <div class="scraped-issue-row${issue.resolved ? ' resolved' : ''}" data-id="${issue.id}">
            <span class="scraped-issue-text" data-id="${issue.id}" title="Click to edit">${issue.text}</span>
            ${issue.mitigated ? '<span class="scraped-issue-note-tag" title="Considered and discounted last review">mitigated</span>' : ''}
            ${issue.carried > 1 ? `<span class="scraped-issue-carried" title="On this list for ${issue.carried} reviews">carried ${issue.carried}</span>` : ''}
            <button type="button" class="scraped-issue-edit-btn" data-id="${issue.id}"
                title="Edit" aria-label="Edit">&#9998;</button>
            <button type="button" class="scraped-issue-resolve" data-id="${issue.id}"
                title="${issue.resolved ? 'Put it back on the list' : "Doesn't apply today - keeps it here but leaves it out of the note and the handover line"}">${issue.resolved ? 'undo' : 'delete'}</button>
        </div>
    `).join('');

    list.querySelectorAll('.scraped-issue-resolve').forEach(btn => {
        btn.addEventListener('click', e => toggleActiveIssueResolved(e.currentTarget.dataset.id));
    });
    const startEdit = (span) => {
        const id = span.dataset.id;
        const issue = activeIssues.find(i => i.id === id);
        if (!issue) return;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'scraped-issue-edit';
        input.value = issue.text;
        span.replaceWith(input);
        input.focus();
        input.select();
        let committed = false;
        const finish = (save) => {
            if (committed) return;
            committed = true;
            const newText = input.value.trim() || issue.text;
            // Drop the input first: the render bails out while an edit field is still in the
            // list, which would otherwise leave the row stuck in edit state.
            input.remove();
            // Re-render either way - cancelling has to put the span back too.
            if (save) editActiveIssueText(id, newText);
            else renderScrapedIssuesList();
        };
        input.addEventListener('blur', () => finish(true));
        input.addEventListener('keydown', ev => {
            if (ev.key === 'Enter') { finish(true); $(ui.input)?.focus(); }
            else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
        });
    };

    list.querySelectorAll('.scraped-issue-text').forEach(span => {
        span.addEventListener('click', () => startEdit(span));
    });
    list.querySelectorAll('.scraped-issue-edit-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const span = list.querySelector(`.scraped-issue-text[data-id="${e.currentTarget.dataset.id}"]`);
            if (span) startEdit(span);
        });
    });
}

// Checks are the tool's own reading of today's numbers, not a list the clinician curates, so
// they get no controls and no delete - they apply or they don't, and they change the moment
// the value does.
function renderChecksStrip() {
    const strip = $('bloods_checks_strip');
    if (!strip) return;
    const checks = getActiveChecks();
    if (!checks.length) { strip.hidden = true; strip.innerHTML = ''; return; }
    strip.hidden = false;
    strip.innerHTML = `<span class="checks-strip-label">Check</span>` +
        checks.map(c => `<span class="checks-strip-item">${c.text}</span>`).join('');
}

export function renderScrapedIssuesList() {
    renderOneList('factors');
    renderOneList('risks');
    renderChecksStrip();

    // The Readmission Risks card was hidden outside Quick Review by a blanket CSS rule, while
    // the importer went on staging carried risk lines into it and the note went on printing
    // them - marked "(carried 2)", which asserts they were looked at today. The nudge told the
    // reviewer to edit or delete them, and the rows it meant were not on the page.
    //
    // It appears now whenever it is holding something: carried risks, or the checks strip,
    // which lives inside this card and had been invisible in Full Review for the same reason.
    // Empty, it stays away - Full Review raises its risks through the gates, and a blank card
    // beside them is the second place to record the same thing that Patient Factors was.
    const risksCard = $('scraped_risks_wrapper');
    if (risksCard) {
        const holding = getIssuesForList('risks').length > 0 || getActiveChecks().length > 0;
        risksCard.hidden = !isQuickReviewMode && !holding;
    }
}

export function saveState(instantly = false) {
    const state = getState();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    sessionStorage.setItem('alertToolLastSaved_v7_7', new Date().toISOString());
    updateLastSaved();
}

export function loadState() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
}

export function updateLastSaved() {
    const iso = sessionStorage.getItem('alertToolLastSaved_v7_7');
    const el = $('lastSaved');
    if (el) el.textContent = iso ? 'Last saved: ' + timeHHMM(new Date(iso)) : 'Last saved: --:--';
}

export function pushUndo(snapshot) { sessionStorage.setItem(UNDO_KEY, JSON.stringify({ snapshot, created: Date.now() })); }

export function getState() {
    const state = {};
    staticInputs.forEach(id => { const el = $(id); if (el) state[id] = el.value; });

    segmentedInputs.forEach(id => {
        const group = $(`seg_${id}`);
        const active = group?.querySelector('.seg-btn.active');
        if (!active) {
            state[id] = null;
        } else if (active.dataset.value === "true" || active.dataset.value === "false") {
            state[id] = (active.dataset.value === "true");
        } else {
            state[id] = active.dataset.value;
        }
    });

    toggleInputs.forEach(id => {
        if ([
            'resp_tachypnea', 'resp_rapid_wean', 'resp_poor_cough', 'resp_poor_swallow',
            'lactate_trend'
        ].includes(id)) return;
        const el = $(`toggle_${id}`);
        if (!el && id === 'chk_aperients') { const chk = $('chk_aperients'); if (chk) state[id] = chk.checked; return; }
        if (!el && id === 'chk_unknown_blo_date') { const chk = $('chk_unknown_blo_date'); if (chk) state[id] = chk.checked; return; }
        state[id] = el ? (el.dataset.value === 'true') : false;
    });

    selectInputs.forEach(id => {
        const group = $(id);
        state[id] = group?.querySelector('.select-btn.active')?.dataset.value || '';
    });

    state['reviewType'] = document.querySelector('input[name="reviewType"]:checked')?.value || 'post';
    // One role string out of two toggles. Everything downstream - the note heading, the
    // handover, REDCap - still reads a single 'ALERT CNS' / 'ICU CNC' value; only the two
    // controls that produce it are new.
    const reviewTeam = document.querySelector('input[name="reviewTeam"]:checked')?.value || 'ALERT';
    const clinicianGrade = document.querySelector('input[name="clinicianGrade"]:checked')?.value || 'CNS';
    state['clinicianRole'] = `${reviewTeam} ${clinicianGrade}`;
    // Empty, not 'physical', when nothing is ticked: defaulting here would restore as a real
    // answer and satisfy the prompt on the generate button without anyone having chosen.
    state['reviewModeType'] = document.querySelector('input[name="reviewModeType"]:checked')?.value || '';
    state.activeIssues = activeIssues;

    ['chk_medical_rounding', 'chk_discharge_alert', 'chk_continue_alert', 'chk_use_mods', 'chk_bloods_nil_sig', 'chk_discharge_pending_bloods'].forEach(id => {
        const el = $(id);
        if (el) state[id] = el.checked;
    });

    state['bowel_mode'] = document.querySelector('#panel_ae .quick-select.active')?.id || null;

    state.devices = {};
    deviceTypes.forEach(type => {
        state.devices[type] = Array.from(document.querySelectorAll(`.device-entry[data-type="${type}"]`)).map(entry => {
            const detailsInput = entry.querySelector('.device-textarea');
            const dateInput = entry.querySelector('.device-date');
            return {
                details: detailsInput ? detailsInput.value : '',
                insertionDate: dateInput ? dateInput.value : ''
            };
        });
    });

    document.querySelectorAll('.trend-buttons').forEach(group => {
        state[group.id] = group.querySelector('.trend-btn.active')?.dataset.value || '';
        // Whether the clinician set this arrow themselves has to survive a refresh, or the
        // auto-calculation would overwrite their choice the moment the page reloaded.
        if (group.dataset.manual === 'true') state[`${group.id}__manual`] = true;
    });

    return state;
}

export function restoreState(state) {
    if (!state) return;

    // Handle name/initials fallback
    if (state.initials && !state.ptName) state.ptName = state.initials;
    if (state.ptName && !state.initials) state.initials = state.ptName;

    staticInputs.forEach(id => { const el = $(id); if (el && state[id] !== undefined) el.value = state[id]; });

    // A session saved before Anticoagulation and VTE Prophylaxis became one field still holds
    // the second value under its old key, and vte_prophylaxis_note is no longer a form input,
    // so nothing above would put it back. A reviewer part-way through a patient when this
    // shipped should not lose what they typed to a refresh.
    if (state['vte_prophylaxis_note']) {
        const el = $('anticoag_note');
        if (el && !el.value.includes(state['vte_prophylaxis_note'])) {
            el.value = [el.value, state['vte_prophylaxis_note']].filter(Boolean).join('; ');
        }
    }

    segmentedInputs.forEach(id => {
        const group = $(`seg_${id}`);
        if (!group) return;
        group.querySelectorAll('.seg-btn').forEach(btn => btn.classList.remove('active'));

        let valStr = String(state[id]);
        if (state[id] === true) valStr = "true";
        if (state[id] === false) valStr = "false";

        const target = group.querySelector(`.seg-btn[data-value="${valStr}"]`);
        if (target) target.classList.add('active');

        handleSegmentClick(id, valStr);
    });

    toggleInputs.forEach(id => {
        if (id === 'chk_aperients') { const chk = $('chk_aperients'); if (chk) chk.checked = state[id]; return; }
        if (id === 'chk_unknown_blo_date') { const chk = $('chk_unknown_blo_date'); if (chk) chk.checked = state[id]; return; }
        const el = $(`toggle_${id}`);
        if (el) {
            el.dataset.value = state[id] ? 'true' : 'false';
            el.classList.toggle('active', !!state[id]);
            if (id === 'comorb_other') $('comorb_other_note_wrapper').style.display = state[id] ? 'block' : 'none';
            if (id === 'pressor_recent_other') $('pressor_recent_other_note_wrapper').style.display = state[id] ? 'block' : 'none';
            if (id === 'pressor_current_other') $('pressor_current_other_note_wrapper').style.display = state[id] ? 'block' : 'none';
            if (id === 'anticoag_active') $('anticoag_note_wrapper').style.display = state[id] ? 'block' : 'none';
            if (id === 'renal_dialysis') $('dialysis_type_wrapper').style.display = state[id] ? 'block' : 'none';
        }
    });

    if (state['comorbs_gate'] === undefined) {
        const anyComorb = toggleInputs.filter(k => k.startsWith('comorb_') && state[k]).length > 0;
        if (anyComorb) {
            const group = $('seg_comorbs_gate');
            group?.querySelectorAll('.seg-btn').forEach(btn => btn.classList.remove('active'));
            const yesBtn = group?.querySelector('.seg-btn[data-value="true"]');
            if (yesBtn) yesBtn.classList.add('active');
            handleSegmentClick('comorbs_gate', 'true');
        }
    }

    selectInputs.forEach(id => {
        const group = $(id);
        if (group) {
            group.querySelectorAll('.select-btn').forEach(b => b.classList.remove('active'));
            if (state[id]) {
                group.querySelector(`.select-btn[data-value="${state[id]}"]`)?.classList.add('active');
                // Only reveal the neuro drawer when a type was actually recorded. Unguarded,
                // this re-opened the gate on every restore, undoing handleSegmentClick above.
                if (id === 'neuroType') $('neuro_gate_content').style.display = 'block';
            }
        }
    });

    if (state['reviewType']) {
        const r = document.querySelector(`input[name="reviewType"][value="${state['reviewType']}"]`);
        if (r) r.checked = true;
        updateWardOptions();
        updateReviewTypeVisibility();
    }
    if (state['clinicianRole']) {
        // Split back into the two toggles it was composed from. updateReviewerRoleVisibility()
        // then re-applies the team's own rules, so a restored ICU CNC on a post review lands
        // back on ALERT rather than being restored into a state the form cannot offer.
        const [team, grade] = state['clinicianRole'].split(' ');
        const t = document.querySelector(`input[name="reviewTeam"][value="${team}"]`);
        if (t) t.checked = true;
        const g = document.querySelector(`input[name="clinicianGrade"][value="${grade}"]`);
        if (g) g.checked = true;
        updateReviewerRoleVisibility();
    }
    if (state['reviewModeType']) {
        const r = document.querySelector(`input[name="reviewModeType"][value="${state['reviewModeType']}"]`);
        if (r) r.checked = true;
    }
    if (Array.isArray(state.activeIssues)) {
        activeIssues = state.activeIssues;
        _activeIssueCounter = activeIssues.reduce((max, i) => Math.max(max, i.createdAt || 0), 0);
        renderScrapedIssuesList();
    }

    ['chk_medical_rounding', 'chk_discharge_alert', 'chk_continue_alert', 'chk_use_mods', 'chk_bloods_nil_sig', 'chk_discharge_pending_bloods'].forEach(id => {
        const el = $(id);
        if (el && state[id] !== undefined) el.checked = state[id];
    });

    // The Pre-Stepdown rounding buttons are driven from the same checkbox rather than saved
    // separately, so they have to be put back to match it - otherwise a restored Yes shows an
    // unpressed pair of buttons over a note that says the patient was referred.
    const roundingSeg = $('seg_medical_rounding_prestepdown');
    if (roundingSeg) {
        const on = !!state['chk_medical_rounding'];
        const pre = $('chk_medical_rounding_pre'); if (pre) pre.checked = on;
        roundingSeg.querySelectorAll('.seg-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.value === String(on)));
    }
    updateIcuRoundingPrompt();

    if (state['chk_use_mods']) $('mods_inputs').style.display = 'block';
    
    if (state['chk_discharge_pending_bloods']) {
        const wrapper = $('discharge_pending_bloods_note_wrapper');
        if (wrapper) wrapper.style.display = 'block';
    }

    if (state['bowel_mode']) {
        $(state['bowel_mode'])?.classList.add('active');
        toggleBowelDate(state['bowel_mode']);
    }

    if (state.ptWard) {
        updateWardOptions();
        const sel = $('ptWard');
        if (sel) sel.value = state.ptWard;
    }
    updateWardOtherVisibility();

    const devCont = $('devices-container');
    if (devCont) {
        devCont.innerHTML = '';
        if (state.devices) {
            deviceTypes.forEach(type => {
                state.devices[type]?.forEach(item => {
                    if (typeof item === 'string') {
                        createDeviceEntry(type, item, '');
                    } else {
                        createDeviceEntry(type, item.details || '', item.insertionDate || '');
                    }
                });
            });
        }
    }
    updateDevicesSectionVisibility();

    document.querySelectorAll('.trend-buttons').forEach(group => {
        if (state[`${group.id}__manual`]) group.dataset.manual = 'true';
        if (state[group.id]) group.querySelector(`.trend-btn[data-value="${state[group.id]}"]`)?.classList.add('active');
    });

    toggleOxyFields();
    toggleInfusionsBox();
}
