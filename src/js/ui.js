/* =========================================
   ALERT Nursing Risk Assessment Tool
   Interface helpers: panels, gates, modes, reset
   Copyright © 2025-2026 Casey Bond
   MIT License - https://opensource.org/licenses/MIT
   ========================================= */

import { $, debounce, showToast, disableAutofill, iconSetForPath, timeHHMM } from './utils.js';
import { setNotice, clearNotice, NOTICE_PRIORITY } from './notices.js';
import { normalRanges, comorbMap, toggleInputs, staticInputs, ACCORDION_KEY, STORAGE_KEY, UNDO_KEY, SELF_DERIVED_RISK, GATE_RISK_ID, NOTE_BLOOD_LABELS} from './config.js';
import {
    getState, saveState, pushUndo, isQuickReviewMode, setQuickReviewMode, initialQuickReviewRisks,
    setInitialQuickReviewRisks, quickReviewBaselineCaptured, setQuickReviewBaselineCaptured,
    previousCategoryData, updateLastSaved,
    quickReviewDismissedBySession, setQuickReviewDismissed, quickReviewOffered, setQuickReviewOffered,
    clearActiveIssues, renderScrapedIssuesList
} from './state.js';
import { computeAll } from './logic.js';

// index.html carries the live tool's icons statically; this only has to undo them on the
// pilot. Chrome and Edge fetch the manifest when the user asks to install, long after
// this has run, so the swap is in place by then. iOS reads the apple-touch-icon link from
// the live DOM at the moment Add to Home Screen is tapped, which is also after this - but
// that is convention rather than anything specified, so it needs checking on a real iPad.
export function applyAppIcons() {
    if (iconSetForPath() !== 'test') return;

    $('linkFavicon')?.setAttribute('href', 'assets/icons/test.svg');
    $('linkAppleIcon')?.setAttribute('href', 'assets/icons/test-180.png');
    $('linkManifest')?.setAttribute('href', 'manifest-test.json');
    $('metaThemeColor')?.setAttribute('content', '#f59e0b');
    $('metaAppTitle')?.setAttribute('content', 'A! Test');

    // Standalone mode hides the URL bar, so the tab title is one of the few remaining
    // places the pilot can say what it is.
    document.title = 'ALERT Tool - PILOT';
}

export function checkBloodRanges() {
    for (const [key, range] of Object.entries(normalRanges)) {
        const id = `bl_${key}`;
        const input = $(id);
        if (input) {
            const val = parseFloat(input.value);
            const parent = input.closest('.blood-item, .input-box');
            if (!isNaN(val) && (val < range.low || val > range.high)) {
                parent?.classList.add('blood-abnormal');
            } else {
                parent?.classList.remove('blood-abnormal');
            }
        }
    }
}

export function handleSegmentClick(id, value) {
    const map = {
        'resp_concern': 'resp_gate_content',
        'renal': 'renal_gate_content',
        'infection': 'infection_gate_content',
        'neuro_gate': 'neuro_gate_content',
        'nutrition_adequate': 'nutrition_context_wrapper',
        'electrolyte_gate': 'electrolyte_gate_content',
        'pressors': 'pressor_gate_content',
        'immobility': 'immobility_note_wrapper',
        'after_hours': 'after_hours_note_wrapper',
        'hac': 'hac_content',
        'stepdown_suitable': 'unsuitable_note_wrapper',
        'comorbs_gate': 'comorbs_gate_content',
        'sleep_quality': 'sleep_quality_wrapper',
        'pain_control': 'pain_context_wrapper',
        'neuro_psych': 'neuro_psych_wrapper',
        'pics': 'pics_wrapper',
        'resp_dyspnea': 'sub_dyspnea_severity',
        'intubated': 'sub_intubated_reason',
        'age_mitigated': 'age_mitigate_reason_wrapper',
        'frailty_known': 'frailty_note_wrapper'
    };

    if (map[id]) {
        const el = $(map[id]);
        if (el) {
            let isShown = false;
            if (id === 'stepdown_suitable' || id === 'nutrition_adequate') {
                isShown = (value === "false");
            } else if (id === 'pics') {
                isShown = (value === "positive" || value === "negative");
            } else {
                isShown = (value === "true");
            }
            el.style.display = isShown ? 'block' : 'none';

            if (isShown) {
                setTimeout(() => {
                    const firstFocusable = el.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
                    if (firstFocusable) {
                        firstFocusable.focus({ preventScroll: true });
                    }
                }, 50);
            }
        }
    }

    // The Pre-Stepdown rounding Yes/No is a segmented group standing in for the Post-Stepdown
    // checkbox, but nothing joined the two: 'medical_rounding_prestepdown' is not in
    // segmentedInputs, so getState never read the buttons, and the buttons never touched
    // chk_medical_rounding either - pressing Yes highlighted a button and changed nothing else.
    // Writing through to the checkbox puts the answer where every reader already looks for it,
    // the note and the plan included, and lets it save and restore with the rest.
    if (id === 'medical_rounding_prestepdown') {
        const on = (value === 'true');
        const main = $('chk_medical_rounding'); if (main) main.checked = on;
        const pre = $('chk_medical_rounding_pre'); if (pre) pre.checked = on;
        updateIcuRoundingPrompt();
    }

    if (id === 'resp_dyspnea' && value !== 'true') {
        const dyspInput = $('dyspneaConcern');
        if (dyspInput) dyspInput.value = '';
        document.querySelectorAll('.quick-select[data-target="dyspneaConcern"]').forEach(b => b.classList.remove('active'));
    }
}

// An ALERT nurse adds the patient to the medical POC list themselves, in the DMR. An ICU CNS
// or CNC has no access to it, so their "Yes" is a referral that stays a referral until someone
// rings the ALERT CN - and this tool stores nothing, so nobody downstream finds out on its
// behalf. The prompt is the only thing standing between a request made and a request assumed.
export function updateIcuRoundingPrompt() {
    const el = $('icu_rounding_call_prompt');
    if (!el) return;
    const team = document.querySelector('input[name="reviewTeam"]:checked')?.value || 'ALERT';
    const type = document.querySelector('input[name="reviewType"]:checked')?.value || 'post';
    const on = !!$('chk_medical_rounding')?.checked;
    el.style.display = (team === 'ICU' && type === 'pre' && on) ? 'block' : 'none';
}

// The rhythm follow-up. Only asked while the rhythm actually reads irregular, and cleared when
// it stops - otherwise a Yes recorded on an irregular rhythm would go on scoring after the
// clinician corrected the field to regular, from a control no longer on screen to correct it in.
export function updateRhythmNewVisibility() {
    const wrapper = $('hr_rhythm_new_wrapper');
    if (!wrapper) return;
    const irregular = /irregular/i.test($('c_hr_rhythm')?.value || '');
    wrapper.style.display = irregular ? 'block' : 'none';
    if (!irregular) {
        $('seg_c_hr_rhythm_new')?.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    }
}

export function updateWardOptions() {
    const type = document.querySelector('input[name="reviewType"]:checked')?.value || 'post';
    const sel = $('ptWard');
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="" selected disabled>Select Ward...</option>';
    const opts = (type === 'pre')
        ? ['ICU Pod 1', 'ICU Pod 2', 'ICU Pod 3', 'ICU Pod 4']
        : ['3A', '3B', '3C', '3D', '4A', '4B', '4C', '4D', '5A', '5B', '5C', '5D', '6A', '6B', '6C', '6D', '7A', '7B', '7C', '7D', 'SRS2A', 'SRS1A', 'SRSA', 'SRSB', 'Medihotel 5', 'Medihotel 6', 'Medihotel 7', 'Medihotel 8', 'Short Stay', 'Transit Lounge', 'Mental Health', 'CCU'];
    [...opts, 'Other'].forEach(o => {
        const opt = document.createElement('option');
        opt.value = o;
        opt.textContent = o;
        if (currentVal === o) opt.selected = true;
        sel.appendChild(opt);
    });
    updateWardOtherVisibility();
}

export function updateReviewTypeVisibility() {
    const type = document.querySelector('input[name="reviewType"]:checked')?.value || 'post';
    const dis = $('chk_discharge_wrapper'); if (dis) dis.style.display = (type === 'post') ? 'block' : 'none';
    const uns = $('chk_unsuitable_wrapper'); if (uns) uns.style.display = (type === 'pre') ? 'block' : 'none';
    const icu = $('icu_summary_wrapper'); if (icu) icu.style.display = (type === 'pre') ? 'block' : 'none';
    const dateWrapper = $('stepdown_date_wrapper'); if (dateWrapper) dateWrapper.style.display = (type === 'post') ? 'contents' : 'none';

    const medRoundingWrapper = $('chk_medical_rounding_wrapper');
    const medRoundingPre = $('chk_medical_rounding_prestepdown');
    const continueAlertWrapper = $('chk_continue_alert_wrapper');
    if (medRoundingWrapper) medRoundingWrapper.style.display = (type === 'post') ? 'block' : 'none';
    if (medRoundingPre) medRoundingPre.style.display = (type === 'pre') ? 'block' : 'none';
    if (continueAlertWrapper) continueAlertWrapper.style.display = (type === 'post') ? 'flex' : 'none';

    const alertActionsSection = $('alert_actions_section');
    if (alertActionsSection) alertActionsSection.style.display = (type === 'post') ? 'block' : 'none';

    if (type === 'pre') { const c = $('chk_discharge_alert'); if (c) c.checked = false; }

    updateReviewerRoleVisibility();
}

// Who did the review, in two parts. The team is offered only Pre-Stepdown, where an ICU CNS or
// CNC sometimes reviews a patient of concern before they leave the unit; every Post-Stepdown
// review is ALERT by definition, so the toggle is hidden there and its value pushed back to
// ALERT rather than merely concealed - a hidden ICU still prints "ICU CNS" at the head of a
// post-stepdown note.
//
// Grades follow the team: ALERT is CNS or CN, ICU is CNS or CNC. Each grade's label carries
// the teams it exists in, so the pairing lives beside the button rather than in a table here.
// A grade that doesn't survive the switch falls back to CNS, the one grade both teams hold.
export function updateReviewerRoleVisibility() {
    const type = document.querySelector('input[name="reviewType"]:checked')?.value || 'post';
    const isPre = (type === 'pre');

    const teamWrapper = $('reviewTeamWrapper');
    if (teamWrapper) teamWrapper.style.display = isPre ? '' : 'none';
    if (!isPre) {
        const alertTeam = document.querySelector('input[name="reviewTeam"][value="ALERT"]');
        if (alertTeam) alertTeam.checked = true;
    }

    const team = document.querySelector('input[name="reviewTeam"]:checked')?.value || 'ALERT';

    const grades = document.querySelectorAll('#clinicianGradeToggle label[data-team]');
    let lastVisible = null;
    grades.forEach(label => {
        const available = label.dataset.team.split(' ').includes(team);
        label.hidden = !available;
        // The group's rounded edge is drawn by :last-child dropping its divider, which is
        // structural: hiding the real last button leaves the visible one with a divider
        // doubling the group's own border. So the visible end is marked here instead.
        label.classList.remove('rsg-edge');
        if (available) lastVisible = label;
        const radio = label.querySelector('input[type="radio"]');
        if (!available && radio?.checked) radio.checked = false;
    });
    if (lastVisible) lastVisible.classList.add('rsg-edge');

    if (!document.querySelector('input[name="clinicianGrade"]:checked')) {
        const cns = document.querySelector('input[name="clinicianGrade"][value="CNS"]');
        if (cns) cns.checked = true;
    }

    // An ICU review is not ALERT activity, and REDCap's alert_team has no code that would be
    // true of an ICU reviewer. Rather than post a team the reviewer isn't on, the accelerator
    // is taken off the page for the duration.
    const redcap = $('btnRedcap');
    if (redcap) redcap.style.display = (team === 'ICU') ? 'none' : '';

    updateIcuRoundingPrompt();
}

export function updateWardOtherVisibility() {
    const w = $('ptWardOtherWrapper');
    const v = $('ptWard')?.value;
    if (w) w.style.display = (v === 'Other') ? 'block' : 'none';
}

export function updateDevicesSectionVisibility() { }

export function createDeviceEntry(type, val = '', insertionDate = '') {
    const c = $('devices-container');
    if (!c) return;
    const div = document.createElement('div');
    div.className = 'device-entry';
    div.dataset.type = type;

    const trackedDevices = ['CVC', 'PICC', 'PIVC', 'Other CVAD', 'IDC', 'Vascath'];
    const hasDateField = trackedDevices.includes(type);

    let dwellDays = 0;
    let borderColor = 'var(--line)';
    let infoText = '';
    let infoColor = '';

    if (hasDateField && insertionDate) {
        const now = new Date();
        const deviceDate = new Date(insertionDate + 'T00:00:00');
        dwellDays = Math.floor((now - deviceDate) / (1000 * 60 * 60 * 24));

        infoText = `${dwellDays}d dwell`;
        infoColor = 'var(--text)';

        // Colour carries the urgency; the label is always just the day count. "Long" and
        // "very long" read as alarm on a number the clinician can already interpret.
        if (type === 'PIVC') {
            if (dwellDays >= 7) { infoColor = 'var(--red)'; borderColor = 'var(--red)'; }
            else if (dwellDays >= 5) { infoColor = 'var(--amber)'; borderColor = 'var(--amber)'; }
            else if (dwellDays >= 3) { infoColor = '#9333ea'; borderColor = '#9333ea'; }
        } else {
            if (dwellDays >= 14) { infoColor = 'var(--red)'; borderColor = 'var(--red)'; }
            else if (dwellDays >= 10) { infoColor = 'var(--amber)'; borderColor = 'var(--amber)'; }
            else if (dwellDays >= 7) { infoColor = '#9333ea'; borderColor = '#9333ea'; }
        }
    }

    // One row per device: type, insertion date, details, dwell warning, remove. The dwell
    // text sits inline rather than on its own line so a long line list stays scannable.
    let html = `<div class="device-row" style="border-color:${borderColor};">`;
    html += `<div class="device-type">${type}</div>`;

    if (hasDateField) {
        html += `<input class="device-date" type="date" value="${insertionDate}" placeholder="Date"/>`;
    }

    html += `<input class="device-textarea" type="text" placeholder="details..." value="${val}"/>`;
    if (infoText && infoColor) {
        html += `<div class="device-info-text" style="color:${infoColor};">${infoText}</div>`;
    }
    html += `<div class="remove-entry" title="Remove">✕</div>`;
    html += `</div>`;

    div.innerHTML = html;
    // Device rows are built after load, so they miss the pass initialize() makes.
    disableAutofill(div);

    if (type === 'Tracheostomy') {
        const tracheBtn = document.querySelector('#oxMod .select-btn[data-value="Trache"]');
        if (tracheBtn && !tracheBtn.classList.contains('active')) {
            tracheBtn.click();
        }
        const tracheTypeBtn = document.querySelector('#tracheType .select-btn[data-value="Tracheostomy"]');
        if (tracheTypeBtn && !tracheTypeBtn.classList.contains('active')) {
            tracheTypeBtn.click();
        }
    }

    div.querySelector('.remove-entry').addEventListener('click', () => {
        const textarea = div.querySelector('.device-textarea');
        div.remove();
        if (type === 'Tracheostomy') {
            const raBtn = document.querySelector('#oxMod .select-btn[data-value="RA"]');
            if (raBtn) {
                raBtn.click();
            }
            const airwayInput = $('airway_a');
            if (airwayInput && airwayInput.dataset.manual !== 'true') {
                if (airwayInput.value.startsWith('Tracheostomy')) {
                    airwayInput.value = '';
                }
            }
        } else if (type === 'Other Device' && textarea && textarea.value.toLowerCase().includes('lary')) {
            const raBtn = document.querySelector('#oxMod .select-btn[data-value="RA"]');
            if (raBtn) {
                raBtn.click();
            }
            const airwayInput = $('airway_a');
            if (airwayInput && airwayInput.dataset.manual !== 'true') {
                if (airwayInput.value.startsWith('Laryngectomy')) {
                    airwayInput.value = '';
                }
            }
        }
        window.devicesModifiedSinceLastSummary = true;
        updateDevicesSectionVisibility();
        saveState(true);
        computeAll();
    });
    const textarea = div.querySelector('.device-textarea');
    if (textarea) {
        textarea.addEventListener('input', () => {
            if (type === 'Other Device') {
                const val = textarea.value.toLowerCase().trim();
                if (val.includes('lary')) {
                    const tracheBtn = document.querySelector('#oxMod .select-btn[data-value="Trache"]');
                    if (tracheBtn && !tracheBtn.classList.contains('active')) {
                        tracheBtn.click();
                    }
                    const laryBtn = document.querySelector('#tracheType .select-btn[data-value="Laryngectomy"]');
                    if (laryBtn && !laryBtn.classList.contains('active')) {
                        laryBtn.click();
                    }
                }
            }
            window.devicesModifiedSinceLastSummary = true;
            saveState(true);
            computeAll();
        });
    }
    if (hasDateField) {
        div.querySelector('.device-date').addEventListener('change', () => {
            const newDate = div.querySelector('.device-date').value;
            if (newDate) {
                const deviceDate = new Date(newDate + 'T00:00:00');
                const dwellDays = Math.floor((new Date() - deviceDate) / (1000 * 60 * 60 * 24));

                let newBorderColor = 'var(--line)';
                const infoText = `${dwellDays}d dwell`;
                let infoColor = 'var(--text)';

                if (type === 'PIVC') {
                    if (dwellDays >= 7) { newBorderColor = 'var(--red)'; infoColor = 'var(--red)'; }
                    else if (dwellDays >= 5) { newBorderColor = 'var(--amber)'; infoColor = 'var(--amber)'; }
                    else if (dwellDays >= 3) { newBorderColor = '#9333ea'; infoColor = '#9333ea'; }
                } else {
                    if (dwellDays >= 14) { newBorderColor = 'var(--red)'; infoColor = 'var(--red)'; }
                    else if (dwellDays >= 10) { newBorderColor = 'var(--amber)'; infoColor = 'var(--amber)'; }
                    else if (dwellDays >= 7) { newBorderColor = '#9333ea'; infoColor = '#9333ea'; }
                }

                // These used to look the row up by its inline styles, from before the row was
                // given classes - so a date typed onto an existing device updated neither the
                // border nor the dwell text.
                const row = div.querySelector('.device-row');
                if (row) row.style.borderColor = newBorderColor;

                let infoTextEl = div.querySelector('.device-info-text');
                if (!infoTextEl && row) {
                    infoTextEl = document.createElement('div');
                    infoTextEl.className = 'device-info-text';
                    row.insertBefore(infoTextEl, row.querySelector('.remove-entry'));
                }
                if (infoTextEl) {
                    infoTextEl.textContent = infoText;
                    infoTextEl.style.color = infoColor;
                }
            }
            window.devicesModifiedSinceLastSummary = true;
            saveState(true);
            computeAll();
        });
    }
    c.appendChild(div);
}

export function toggleOxyFields() {
    const mod = $('oxMod')?.querySelector('.select-btn.active')?.dataset.value || 'RA';
    const show = (cls) => document.querySelectorAll(cls).forEach(e => e.style.display = 'block');
    const hide = (cls) => document.querySelectorAll(cls).forEach(e => e.style.display = 'none');
    hide('.npOnly'); hide('.hfnpOnly'); hide('.nivOnly'); hide('.tracheOnly');
    if (mod === 'NP') show('.npOnly');
    if (mod === 'HFNP') show('.hfnpOnly');
    if (mod === 'NIV') show('.nivOnly');
    if (mod === 'Trache') show('.tracheOnly');
}

export function toggleInfusionsBox() {
    const w = $('infusions_wrapper');
    if (w) w.style.display = 'grid';
}

export function toggleBowelDate(mode) {
    const w = $('bowel_date_wrapper');
    if (w) w.style.display = mode ? 'block' : 'none';
    if (mode) {
        const l = $('bowel_date_label');
        if (l) l.textContent = (mode === 'btn_bno') ? 'Date Last Opened' : 'Date BO';
        const ap = $('aperients_wrapper');
        if (ap) ap.style.display = (mode === 'btn_bno') ? 'block' : 'none';
        handleUnknownBLODate();
    }
}

export function handleUnknownBLODate() {
    const unknownChk = $('chk_unknown_blo_date');
    const dateInput = $('bowel_date');
    const todayBtn = $('btn_bowel_today');
    const yesterdayBtn = $('btn_bowel_yesterday');

    if (unknownChk && dateInput) {
        const isUnknown = unknownChk.checked;
        dateInput.disabled = isUnknown;
        dateInput.style.opacity = isUnknown ? '0.5' : '1';
        if (todayBtn) {
            todayBtn.disabled = isUnknown;
            todayBtn.style.opacity = isUnknown ? '0.5' : '1';
        }
        if (yesterdayBtn) {
            yesterdayBtn.disabled = isUnknown;
            yesterdayBtn.style.opacity = isUnknown ? '0.5' : '1';
        }
        if (isUnknown) {
            dateInput.value = '';
        }
    }
}

// Set when the clinician copies the note from inside the reset dialog, so clearData() knows
// they are mid-way between copying and pasting and leaves the clipboard alone. Reset each time
// the dialog opens: it describes this exit, not the last one.
let copiedOnExit = false;
export function markCopiedOnExit() { copiedOnExit = true; }

// Overwrites rather than reads: reading the clipboard needs a permission prompt, and the tool
// has no business knowing what else is on there. A browser that refuses the write - no focus,
// no permission - leaves it as it was, which is the behaviour before this existed.
export function clearClipboard() {
    navigator.clipboard?.writeText('')?.catch(() => {});
}

export function showClearDataModal() {
    copiedOnExit = false;
    const modal = $('clearDataModal');
    if (modal) modal.style.display = 'flex';
}

export function hideClearDataModal() {
    const modal = $('clearDataModal');
    if (modal) modal.style.display = 'none';
}

let _syncingPMH = false;
export function syncComorbsToPMH() {
    if (_syncingPMH) return;
    _syncingPMH = true;

    const noteEl = $('pmh_note');
    if (!noteEl) { _syncingPMH = false; return; }

    const activeKeys = toggleInputs.filter(k => k.startsWith('comorb_') && $(`toggle_${k}`)?.dataset.value === 'true');
    const chipLines = [];
    activeKeys.forEach(k => {
        if (k === 'comorb_other') {
            const specVal = $('comorb_other_note')?.value.trim();
            if (specVal) {
                specVal.split(/[\n,]+/).forEach(v => {
                    const trimmed = v.trim();
                    if (trimmed) chipLines.push(trimmed);
                });
            }
        } else {
            chipLines.push(comorbMap[k]);
        }
    });

    const filterLower = Object.values(comorbMap).map(n => n.toLowerCase());
    const otherVal = $('comorb_other_note')?.value.trim();
    if (otherVal) {
        otherVal.split(/[\n,]+/).forEach(v => {
            const trimmed = v.trim();
            if (trimmed) filterLower.push(trimmed.toLowerCase());
        });
    }

    const userLines = noteEl.value.split('\n').filter(line => {
        const trimmed = line.trim();
        return trimmed && !filterLower.includes(trimmed.toLowerCase());
    });

    noteEl.value = [...chipLines, ...userLines].join('\n');
    _syncingPMH = false;
}

export function clearData() {
    hideClearDataModal();

    // The clipboard is the one place this tool's data outlives the tab: everything else dies
    // with the session, but a copied note stays available to every other application, and on
    // some configurations to the user's other devices.
    //
    // Not cleared when the clinician copied from the reset dialog itself. That button exists so
    // they can copy on their way out and paste afterwards, so wiping it here would delete the
    // note between copying and pasting - the one thing worse than leaving it there.
    if (!copiedOnExit) clearClipboard();

    if (isQuickReviewMode) {
        exitQuickReviewMode();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
    document.querySelectorAll('.accordion').forEach(btn => {
        btn.setAttribute('aria-expanded', 'false');

    });
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(UNDO_KEY);
    sessionStorage.removeItem('alertToolLastSaved_v7_7');
    localStorage.removeItem(ACCORDION_KEY);
    sessionStorage.removeItem(ACCORDION_KEY);
    localStorage.removeItem('alert_audit_log_v1');
    updateLastSaved();

    staticInputs.forEach(id => {
        if ($(id)) {
            $(id).value = '';
            $(id).classList.remove('scraped-data');
            const el = $(id);
            if (['b_device', 'airway_a'].includes(id)) {
                el.dataset.manual = 'false';
            }
        }
    });

    const impTxt = $('importText'); if (impTxt) impTxt.value = '';

    document.querySelectorAll('.active').forEach(e => e.classList.remove('active'));
    document.querySelectorAll('input[type="checkbox"]').forEach(e => e.checked = false);
    document.querySelectorAll('.toggle-label').forEach(e => e.dataset.value = 'false');
    document.querySelectorAll('.blood-abnormal').forEach(e => e.classList.remove('blood-abnormal'));

    const dc = $('devices-container'); if (dc) dc.innerHTML = '';
    const sc = $('selected_comorbs_display');
    if (sc) { sc.innerHTML = ''; sc.style.display = 'none'; }
    document.querySelectorAll('.prev-datum').forEach(el => el.textContent = '');
    // The same act, one layer deeper. The "(Prev: ...)" text cleared above is only half of what
    // the importer leaves on a gate: it also flags the wrapper carried-forward, which paints
    // the "↻ Carried forward - confirm or clear" badge and the outline, and stashes the
    // previous note's own wording in dataset.carriedFrom. None of it was cleared, so a new
    // patient's form opened still wearing the last patient's badges, with the previous
    // patient's concerns replayed verbatim beside them. The gate answers and the names went;
    // the clinical detail behind them stayed on screen.
    document.querySelectorAll('.input-box.carried-forward').forEach(w => {
        w.classList.remove('carried-forward');
        delete w.dataset.carriedFrom;
        delete w.dataset.carriedRaw;
        delete w.dataset.carriedNote;
    });
    // New patient, so any arrow the last clinician set by hand is no longer theirs to keep.
    document.querySelectorAll('.trend-buttons').forEach(g => delete g.dataset.manual);
    window.prevBloods = {};
    const pb = $('prevRisksBox'); if (pb) pb.style.display = 'none';

    // Fresh patient: drop staged issues and let the >24h offer re-evaluate from scratch.
    setQuickReviewDismissed(false);
    setQuickReviewOffered(false);
    const qrPrompt = $('quickReviewPrompt');
    if (qrPrompt) qrPrompt.style.display = 'none';
    clearActiveIssues();
    clearNewRiskAlert();
    // Bloods must come back as a true null state, not 'nil significant' with the grid hidden.
    const bloodsGrid = document.querySelector('.bloods-grid');
    if (bloodsGrid) bloodsGrid.style.display = '';

    const gatesToHide = [
        '#resp_gate_content', '#renal_gate_content', '#neuro_gate_content', '#electrolyte_gate_content', '#infection_gate_content', '#pressor_gate_content', '#hac_content',
        '#immobility_note_wrapper', '#after_hours_note_wrapper', '#comorb_other_note_wrapper', '#unsuitable_note_wrapper', '#override_reason_box', '#sub_intubated_reason', '#sub_dyspnea_severity',
        '#pressor_recent_other_note_wrapper', '#dialysis_type_wrapper', '#anticoag_note_wrapper',
        '#pics_wrapper', '#sleep_quality_wrapper', '#neuro_psych_wrapper', '#pain_context_wrapper', '#nutrition_context_wrapper',
        '#frailty_note_wrapper'
    ];
    gatesToHide.forEach(sel => { const el = document.querySelector(sel); if (el) el.style.display = 'none'; });

    document.querySelectorAll('.concern-note').forEach(e => {
        if (!['immobility_note_wrapper', 'after_hours_note_wrapper', 'comorb_other_note_wrapper', 'unsuitable_note_wrapper', 'pressor_recent_other_note_wrapper'].includes(e.id)) {
            e.style.display = 'block';
        }
    });

    const summaryActions = $('summary_actions');
    if (summaryActions) summaryActions.style.display = 'none';
    const badge = $('manual_edit_badge');
    if (badge) badge.style.display = 'none';
    const btnGen = $('btn_generate_summary');
    if (btnGen) btnGen.innerHTML = '✨ Generate DMR summary';
    const summaryEl = $('summary');
    if (summaryEl) { summaryEl.value = ''; summaryEl.style.height = ''; }
    const handoverEl = $('handoverLine');
    if (handoverEl) handoverEl.value = '';
    const handoverActions = $('handover_actions');
    if (handoverActions) handoverActions.style.display = 'none';
    window.dismissedDischarge = false;

    const now = new Date();
    now.setMinutes(Math.round(now.getMinutes() / 15) * 15);
    const tb = $('reviewTime'); if (tb) tb.value = timeHHMM(now);

    const p = document.querySelector('input[value="post"]'); if (p) p.checked = true;
    // Radios survive the checkbox sweep above, so the last patient's review method used to
    // carry silently into the next one. New patient, unanswered question.
    document.querySelectorAll('input[name="reviewModeType"]').forEach(r => r.checked = false);
    updateWardOptions();
    updateReviewTypeVisibility();
    const listEl = $('flagList'); if (listEl) listEl.innerHTML = '';
    const sum = $('summary'); if (sum) sum.value = '';

    const orReason = $('override_reason_box'); if (orReason) orReason.style.display = 'none';
    $('override_amber')?.classList.remove('active');
    $('override_red')?.classList.remove('active');
    $('override_green')?.classList.remove('active');
    const orClear = $('override_clear'); if (orClear) orClear.style.display = 'none';

    const resetEv = new CustomEvent('resetAddsCalc');
    document.dispatchEvent(resetEv);

    // These are driven by the debounced compute() in main.js, not by computeAll, so clearing
    // the form left both mitigator boxes open on the next patient with the previous patient's
    // reason still in them.
    updateAgeMitigationUI();
    updateLosMitigationUI();

    computeAll();
    showToast("Data cleared", 2000);
}

// Keeps the Select Category card honest about what the tool calculated versus what the
// clinician chose, and shows the CAT 3 downgrade as pending until a reason is typed.
//
// In Quick Review none of that applies. The tool has only read the score, the bloods and the
// two demographic facts; it has not been told whether there is a respiratory concern or how
// the patient is mobilising, so it is in no position to treat the clinician's decision as a
// correction of its own. There is nothing being overridden, so there is no downgrade, no
// warning and no reason to demand - the buttons simply record the call.
export function refreshCategorySelect(autoCat, override, reason, redCount, amberCount) {
    const hint = $('override_auto_hint');
    const chosen = (override && override !== 'none') ? override : null;
    ['red', 'amber', 'green'].forEach(c => $(`override_${c}`)?.classList.toggle('active', c === chosen));

    const clearBtn = $('override_clear');
    if (clearBtn) clearBtn.style.display = chosen ? '' : 'none';

    if (isQuickReviewMode) {
        // Silent while it would only repeat itself. Until a button is pressed the category
        // shown two lines above IS the calculated one, so naming it again says nothing; and
        // once the clinician picks the same category the tool did, there is still nothing
        // between them. The moment the two part company the hint is the only surviving record
        // of what the score and the bloods came to, so that is when it speaks.
        if (hint) {
            const differs = chosen && chosen !== autoCat.id;
            hint.textContent = differs ? `Tool has: ${autoCat.text} from the score and bloods` : '';
        }
        const box = $('override_reason_box');
        if (box) { box.style.display = 'none'; box.classList.remove('reason-missing'); }
        const warn = $('override_downgrade_warn');
        if (warn) warn.style.display = 'none';
        const required = $('override_reason_required');
        if (required) required.style.display = 'none';
        return;
    }

    if (hint) hint.textContent = `Auto-calculated: ${autoCat.text}`;

    const box = $('override_reason_box');
    if (box) box.style.display = chosen ? 'block' : 'none';
    const warn = $('override_downgrade_warn');
    const label = $('override_reason_label');
    const required = $('override_reason_required');

    // A downgrade is now anything below what was calculated, not just CAT 3 - selecting CAT 2
    // on a CAT 1 patient is the same act. The reason is asked for, and its absence is shown,
    // but the selection applies either way: an override that quietly didn't take is worse.
    const CAT_RANK = { green: 0, amber: 1, red: 2 };
    const chosenText = { red: 'CAT 1', amber: 'CAT 2', green: 'CAT 3' }[chosen];
    const isDowngrade = !!chosen && CAT_RANK[chosen] < CAT_RANK[autoCat.id];

    if (label) label.textContent = isDowngrade ? `Reason for downgrade to ${chosenText}` : 'Reason for override';
    if (required) required.style.display = (isDowngrade && !reason) ? 'block' : 'none';
    if (box) box.classList.toggle('reason-missing', isDowngrade && !reason);

    if (warn) {
        if (isDowngrade && (redCount > 0 || amberCount > 0)) {
            const parts = [];
            if (redCount) parts.push(`${redCount} red flag${redCount > 1 ? 's' : ''}`);
            if (amberCount) parts.push(`${amberCount} amber flag${amberCount > 1 ? 's' : ''}`);
            warn.textContent = `⚠ Set to ${chosenText} with ${parts.join(' and ')} present (auto-calculated ${autoCat.text}). The flags stay in the summary.`;
            warn.style.display = 'block';
        } else {
            warn.style.display = 'none';
        }
    }
}

// MODS patients are scored on MODS, not ADDS, and consultants sometimes modify the
// observation parameters - either way the recorded score must not be overwritten by the ADDS
// calculator. Entering MODS suppresses that write and mirrors the score and details into the
// existing MODS fields, so the DMR note and handover line report MODS rather than ADDS.
export function refreshAddsOverrideUI() {
    const manual = $('addsManual')?.value === 'true';
    const btn = $('btnAddsOverride');
    const box = $('adds_override_box');
    const hint = $('adds_calc_hint');
    const addsInput = $('adds');

    if (btn) {
        btn.textContent = manual ? 'MODS score - calculator not applied' : 'Enter MODS';
        btn.classList.toggle('active', manual);
        btn.setAttribute('aria-pressed', String(manual));
    }
    if (box) box.style.display = manual ? 'block' : 'none';

    // Keep the A-E MODS fields as the single record of the score; this control is just a
    // faster way in from the risk card.
    const modsChk = $('chk_use_mods');
    if (modsChk) {
        modsChk.checked = manual;
        const modsInputs = $('mods_inputs');
        if (modsInputs) modsInputs.style.display = manual ? 'block' : 'none';
    }
    if (manual) {
        const score = $('mods_score'); if (score) score.value = addsInput?.value || '';
        const details = $('mods_details'); if (details) details.value = $('addsOverrideNote')?.value || '';
    }

    const calcTotal = $('calc_total_display')?.textContent?.trim();
    const recorded = addsInput?.value?.trim();
    if (hint) {
        if (manual && calcTotal && recorded && calcTotal !== recorded) {
            hint.textContent = `ADDS calculator ${calcTotal} · MODS recorded ${recorded}`;
            hint.style.display = 'inline';
        } else {
            hint.style.display = 'none';
        }
    }
}

// The MODS state has one home - the hidden addsManual field - and two ways in: the "Enter
// MODS" button on the risk card and the "MODS in place?" checkbox down in A-E. The checkbox
// used to set only its own .checked, which refreshAddsOverrideUI then overwrote from
// addsManual on the very next keystroke, so ticking it silently untucked itself and the note
// went on printing ADDS. Both controls now go through here.
export function setAddsOverride(manual, { focus = false } = {}) {
    const field = $('addsManual');
    if (!field) return;
    field.value = String(manual);

    if (manual) {
        if (focus) {
            $('adds')?.focus();
            $('adds')?.select();
        }
    } else {
        // Switching back to ADDS hands the field to the calculator again and clears the MODS
        // record, so a stale MODS score can't linger in the summary.
        const calcTotal = $('calc_total_display')?.textContent?.trim();
        const addsInput = $('adds');
        if (addsInput && calcTotal && calcTotal !== '0') {
            addsInput.value = calcTotal;
            addsInput.dispatchEvent(new Event('input'));
        }
        const note = $('addsOverrideNote'); if (note) note.value = '';
        const score = $('mods_score'); if (score) score.value = '';
        const details = $('mods_details'); if (details) details.value = '';
    }
    refreshAddsOverrideUI();
}

export function toggleAddsOverride() {
    setAddsOverride($('addsManual')?.value !== 'true', { focus: true });
}

// "From the last review" used to be rendered here: a card that listed the same carried gates
// already outlined and badged in place further down the page. Every carried concern therefore
// appeared twice, in two different shapes, and nothing on either copy said which was which.
//
// The badge on the gate is the prompt now, and it sits where the question actually gets
// answered. Quick Review doesn't use gates at all - it releases them onto the risks list on
// the way in - so there is nothing left for a summary card to summarise.
//
// answerCarriedForward() went with it. Its "Improving" chip appended ", improving" to the
// gate's note field, which is the one thing here worth not losing: it is still what a
// clinician types, just typed rather than chipped.

// Risks flagged since Quick Review started. Shown in place, not as a mode switch: the
// clinician stays in Quick Review and decides whether the full assessment is warranted.
let newRiskLog = [];

export function showNewRiskAlert(newRed = [], newAmber = []) {
    // The same wording can arrive from two sources (e.g. a gate and its detail field);
    // list it once so the count matches what's on screen.
    const seen = new Set(newRiskLog.map(r => r.text));
    [...newRed.map(text => ({ text, severity: 'red' })), ...newAmber.map(text => ({ text, severity: 'amber' }))]
        .forEach(entry => {
            if (seen.has(entry.text)) return;
            seen.add(entry.text);
            newRiskLog.push(entry);
        });
    // The risk model sometimes emits a headline and a more specific variant of the same
    // concern ("Respiratory concern" / "Respiratory concern - tachypnea >20bpm"); keep the
    // one that says more.
    newRiskLog = newRiskLog.filter(r =>
        !newRiskLog.some(other => other !== r && other.text.startsWith(r.text)));
    if (!newRiskLog.length) return;

    const redCount = newRiskLog.filter(r => r.severity === 'red').length;

    // No toast alongside this. The notice says it, the Review List holds the detail, and a
    // toast for every risk on top of a banner about the same risks was the loudest part of the
    // interface for the least information.
    //
    // The title used to carry a count - "(1 red and 1 amber)" - and the notice used to close
    // with three lines on where the risks had been staged and what to do about them. Both went
    // for the same reason: the list is directly underneath, colour-coded, and short enough to
    // read at a glance, so the count restated what the eye already had; and the closing lines
    // were standing instruction, true of every risk this tool has ever raised, reprinted in
    // full every time one fired.
    setNotice('new-risk', {
        priority: NOTICE_PRIORITY.NEW_RISK,
        tone: redCount ? 'red' : 'amber',
        html: `<div class="notice-title">⚠️ New risk flagged</div>
               <ul class="notice-list">${newRiskLog.map(r => `<li class="${r.severity}">${r.text}</li>`).join('')}</ul>`,
        actions: [{ id: 'dismiss-new-risk', label: 'Dismiss', onClick: clearNewRiskAlert }]
    });
}

export function clearNewRiskAlert() {
    newRiskLog = [];
    clearNotice('new-risk');
}

// Quick Review only: float the bloods card over the page while its details are open.
export function setBloodsOverlay(open) {
    const section = $('section-bloods');
    if (!section) return;
    section.classList.toggle('qr-expanded', !!open && isQuickReviewMode);
    syncQuickOverlayBackdrop();
}

function syncQuickOverlayBackdrop() {
    const backdrop = $('qrBackdrop');
    if (!backdrop) return;
    const anyOpen = !!document.querySelector('.qr-expanded');
    backdrop.hidden = !anyOpen;
}

// The ADDS calculator is opened by plugins/adds_calc.js, which only knows how to show and
// hide its container. Watching that container keeps the overlay in step without the plugin
// needing to know Quick Review exists.
let addsCalcObserver = null;
function watchAddsCalculator() {
    const container = $('addsCalculatorContainer');
    const wrapper = $('adds_wrapper');
    if (!container || !wrapper || addsCalcObserver) return;
    const sync = () => {
        const open = container.style.display === 'block';
        wrapper.classList.toggle('qr-expanded', open && isQuickReviewMode);
        syncQuickOverlayBackdrop();
    };
    addsCalcObserver = new MutationObserver(sync);
    addsCalcObserver.observe(container, { attributes: true, attributeFilter: ['style'] });
    sync();
}

// What a Quick Review card is holding, said on the card itself.
//
// Quick Review closes the bloods panel behind three buttons and floats the ADDS calculator
// over the page, so entering six results and shutting the panel leaves a card identical to
// the one you started with. There was nothing on screen that said the numbers had been taken,
// and clinicians reasonably read that absence as "it didn't keep them" - then entered them
// again, or opened the panel to check.
//
// The wording is deliberately about the form, not about storage: "6 results entered" says
// what is on the page and destined for the note. Nothing here is saved anywhere, and a chip
// reading "logged" or "saved" would be reassuring about the one thing this tool does not do.
//
// Derived from state on every compute pass rather than tracked: there is no flag to leave
// stale, and clearing a field takes its chip away with it. The spans live in the markup
// beside what they describe, so they travel with their cards into #quickGrid and back.
function setChip(id, text) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || '';
    if (text) el.setAttribute('data-filled', 'true');
    else el.removeAttribute('data-filled');
}

export function renderQuickChips(s) {
    if (!isQuickReviewMode) {
        ['qrChipAdds', 'qrChipBloods', 'qrChipDevices'].forEach(id => setChip(id, ''));
        return;
    }

    // The score, and which scale it is on. No claim about where it came from: the calculator
    // and a typed number produce the same figure, and #adds_calc_hint already speaks up in
    // the one case where the two disagree.
    const adds = (s.adds ?? '').toString().trim();
    const isMods = $('addsManual')?.value === 'true';
    setChip('qrChipAdds', adds ? `✓ ${isMods ? 'MODS' : 'ADDS'} ${adds}` : '');

    // The three quick buttons are an answer in their own right, so they get reported as the
    // answer they are rather than as a count of zero results.
    if (s.chk_bloods_nil_sig || s.bloods_status === 'nil_sig') {
        setChip('qrChipBloods', '✓ Nil significant');
    } else if (s.bloods_status === 'improving') {
        setChip('qrChipBloods', '✓ Improving');
    } else if (s.bloods_status === 'not_checked') {
        setChip('qrChipBloods', '✓ Not checked');
    } else {
        // Counted off the note's own map, so the chip can never promise a result the note
        // then leaves out.
        const n = Object.keys(NOTE_BLOOD_LABELS).filter(k => s[`bl_${k}`]).length;
        setChip('qrChipBloods', n ? `✓ ${n} result${n === 1 ? '' : 's'} entered` : '');
    }

    const lines = document.querySelectorAll('#devices-container .device-entry').length;
    setChip('qrChipDevices', lines ? `✓ ${lines} recorded` : '');
}

export function closeQuickOverlays() {
    const wrapper = $('adds_wrapper');
    if (wrapper?.classList.contains('qr-expanded')) $('btnToggleCalc')?.click();
    if ($('section-bloods')?.classList.contains('qr-expanded')) $('btnBloodsDetailsToggle')?.click();
    syncQuickOverlayBackdrop();
}

// Single source of truth for accordion state: the panel's .open class and the button's
// aria-expanded, which the chevron is drawn from.
export function setPanelOpen(panel, btn, open) {
    if (panel) panel.classList.toggle('open', open);
    if (btn) btn.setAttribute('aria-expanded', String(open));
}

export function openAccordion(panelId, btnSelector) {
    setPanelOpen($(panelId), document.querySelector(btnSelector), true);
}

export function closeAccordion(panelId, btnSelector) {
    setPanelOpen($(panelId), document.querySelector(btnSelector), false);
}

// Quick Review keeps only what a Day 2+ follow-up needs: Patient Details, ADDS
// (+calculator), Bloods, Lines, category selection, Issues and Quick Notes - laid out as one
// page so the review can be done in ~5 minutes. Everything else is hidden. Patient Details
// stays because the note's identifiers and the stepdown clock come from it, and a Quick
// Review is often the first time they're typed.
const QUICK_REVIEW_SECTIONS_TO_HIDE = ['section-risk', 'section-ae', 'section-context'];
// The two Quick-Review-only cards used to be shown and hidden from here with an inline
// display, which then beat the stylesheet: the write-up panel could never be display:flex,
// so its list could not stretch and the card kept a dead band at its foot. They are now
// driven purely by body.quick-review-active in style.css, which owns their layout anyway.

// Which live nodes get moved into which cell of #quickGrid, in the order they should appear.
// Nothing is cloned: IDs must stay unique and every listener already bound to these elements
// has to keep working, so the elements themselves move and are put back on exit.
//
// The two columns are now near-equal width rather than 1:2. The old split gave two thirds of
// the page to cards that collapse to nothing when little was scraped - Review List, Lines,
// carried-forward - so a quiet patient left a wide void down the middle. Lines moved to the
// rail (it still gets ~500px, well past the ~356px a device row needs for one line) and the
// right column now holds only the write-up, which is styled to stretch and absorb the slack.
const QUICK_GRID_LAYOUT = {
    qgTop: ['section-patient'],
    // Left rail is what you measured; the right column is what you concluded. The category
    // buttons no longer appear here - they moved inside #section-category, which is the whole
    // bottom band, so the call is made next to the flags that produced it.
    qgLeft: ['adds_wrapper', 'section-bloods', 'section-devices'],
    qgRight: ['patient_factors_wrapper', 'scraped_risks_wrapper', 'quick_notes_wrapper'],
    qgBottom: ['section-category']
};

function moveIntoQuickGrid() {
    Object.entries(QUICK_GRID_LAYOUT).forEach(([cellId, ids]) => {
        const cell = $(cellId);
        if (!cell) return;
        ids.forEach(id => {
            const el = $(id);
            if (!el || el.dataset.qrMoved === 'true' || !el.parentNode) return;
            // A hidden marker left behind at the original position, so exit restores the
            // exact document order rather than appending everything to the end.
            const anchor = document.createElement('span');
            anchor.setAttribute('data-qr-anchor', id);
            anchor.style.display = 'none';
            el.parentNode.insertBefore(anchor, el);
            cell.appendChild(el);
            el.dataset.qrMoved = 'true';
        });
    });
}

function restoreFromQuickGrid() {
    document.querySelectorAll('[data-qr-moved="true"]').forEach(el => {
        const anchor = document.querySelector(`[data-qr-anchor="${el.id}"]`);
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(el, anchor);
            anchor.remove();
        }
        delete el.dataset.qrMoved;
    });
}

// Quick Review does not use the gates. The importer answers them on the way in, because a Full
// Review is completed by considering each one - but a Quick Review is a list, not a
// questionnaire, and a gate silently set to Yes on the strength of yesterday's note is a
// finding nobody made today. So on the way in, every gate the import answered is handed back:
// the answer is cleared, the carried marks come off, and the risk it was carrying goes onto
// the readmission risks list in the previous reviewer's own wording, where it can be edited or
// deleted like anything else on that list.
//
// Nothing is lost by this. The line is on the list, the list is in the note, and the note is
// what the next review reads.
function releaseCarriedGatesToList() {
    document.querySelectorAll('.input-box.carried-forward').forEach((wrapper, idx) => {
        const raw = wrapper.dataset.carriedRaw || wrapper.dataset.carriedFrom;
        const group = wrapper.querySelector('.segmented-group');

        group?.querySelectorAll('.seg-btn.active').forEach(btn => btn.classList.remove('active'));
        if (group) delete group.dataset.value;

        wrapper.classList.remove('carried-forward');
        delete wrapper.dataset.carriedFrom;
        delete wrapper.dataset.carriedRaw;
        delete wrapper.dataset.carriedNote;

        // The same filter the importer applies when it stages a risk as text. Without it this
        // route smuggles the excluded ones through: a risk that matched a gate was never
        // filtered on the way in, because the gate was carrying it, and releasing the gate
        // would put "Infection risk - WCC 16, CRP 180" on the list in yesterday's numbers
        // while today's bloods say the markers have halved.
        if (raw && window.addActiveIssue) {
            const riskId = GATE_RISK_ID[group?.id] || group?.id || null;
            // What this gate was scoring a moment ago, before it was cleared. Taken from the
            // last evaluation rather than assumed, because a gate's weight depends on its
            // details - a renal concern with anuria is red where the same gate is otherwise
            // amber - and guessing amber would quietly undercall exactly those patients.
            const wasScoring = (window._lastRiskEntries || []).find(e => e.id === riskId);

            // A risk the tool re-derives from bloods keeps its concern and loses its numbers.
            // "Infection risk - WCC 16, CRP 180" must not state yesterday's markers as today's
            // finding; "Infection risk" carried forward is true and is the thing that matters.
            // Dropping the line outright, which is what this used to do, was worse than either:
            // a carried electrolyte concern simply disappeared - off the list, out of the note
            // and out of the category - whenever today's bloods had not been entered yet.
            const text = SELF_DERIVED_RISK.test(raw) ? raw.split(/\s+-\s+/)[0].trim() : raw;

            window.addActiveIssue({
                text, source: 'scraped', list: 'risks',
                severity: wasScoring?.type || 'amber',
                scoresAs: wasScoring?.type || 'amber',
                gateId: riskId,
                key: `released_gate_${idx}_${text.slice(0, 20)}`
            });
        }
    });
}

export function enableQuickReviewMode() {
    setQuickReviewMode(true);
    setInitialQuickReviewRisks({ red: [], amber: [] });
    setQuickReviewBaselineCaptured(false);
    clearNewRiskAlert();

    releaseCarriedGatesToList();
    computeAll();

    document.body.classList.add('quick-review-active');

    const banner = $('quickReviewBanner');
    if (banner) banner.style.display = 'block';
    const prompt = $('quickReviewPrompt');
    if (prompt) prompt.style.display = 'none';

    QUICK_REVIEW_SECTIONS_TO_HIDE.forEach(id => {
        const section = $(id);
        if (section) {
            section.style.display = 'none';
            section.setAttribute('data-hidden-by-quick-review', 'true');
        }
    });

    moveIntoQuickGrid();
    watchAddsCalculator();

    // Bloods stay behind the three quick buttons; lines open, since the add-chips are the
    // whole point of having the section on the page.
    closeAccordion('panel_bloods', '[aria-controls="panel_bloods"]');
    openAccordion('panel_devices', '[aria-controls="panel_devices"]');

    const bloodsQuick = $('bloods_quick_controls');
    if (bloodsQuick) bloodsQuick.style.display = 'block';

    document.querySelectorAll('.nav-item').forEach(item => {
        const href = item.getAttribute('href')?.substring(1);
        if (href && QUICK_REVIEW_SECTIONS_TO_HIDE.includes(href)) {
            item.style.opacity = '0.3';
            item.style.pointerEvents = 'none';
        }
    });

    // Keep the Review Depth toggle in step however Quick Review was entered (modal, >24h
    // offer, or the toggle itself).
    const depthQuick = document.querySelector('input[name="reviewDepth"][value="quick"]');
    if (depthQuick) depthQuick.checked = true;

    renderScrapedIssuesList();

    setTimeout(() => {
        const target = $('quickGrid');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);

    showToast('Quick Review mode', 2000);
}

// >24h since stepdown (stepdown time defaults to 16:00 upstream) *offers* Quick Review.
// The clinician decides - never switch modes out from under them.
export function maybeOfferQuickReview(timeData, s) {
    if (!s.stepdownDate) return;
    if (s.reviewType === 'pre') return;
    if (isQuickReviewMode) return;
    if (quickReviewDismissedBySession) return;
    // Never interrupt the field being typed into. A date input emits a valid value for every
    // keystroke of the year - 0002, 0020, 0202 on the way to 2026 - and each of those reads as
    // long past stepdown, so the modal used to appear mid-entry and take the focus with it.
    if (document.activeElement === $('stepdownDate')) return;
    // Same artefact, arriving another way (paste, a stale import): a stepdown in the future or
    // before this tool existed is a typo, not a long-stay patient.
    const stepdownYear = parseInt(s.stepdownDate.slice(0, 4), 10);
    if (!(stepdownYear >= 2020)) return;
    if (timeData.hours < 0) return;
    if (timeData.hours > 24) {
        showQuickReviewPrompt($('catText')?.textContent || '', timeData.hours);
    }
}

export function exitQuickReviewMode() {
    setQuickReviewMode(false);
    setInitialQuickReviewRisks({ red: [], amber: [] });
    setQuickReviewBaselineCaptured(false);
    // Without this the >24h auto-trigger would immediately re-enter on the next compute.
    setQuickReviewDismissed(true);

    document.body.classList.remove('quick-review-active');

    const banner = $('quickReviewBanner');
    if (banner) banner.style.display = 'none';

    clearNewRiskAlert();
    $('adds_wrapper')?.classList.remove('qr-expanded');
    setBloodsOverlay(false);
    // Nothing recomputes on the way out, and the chips belong to Quick Review, so they are
    // taken off here rather than left for the next compute pass to notice.
    renderQuickChips({});
    restoreFromQuickGrid();
    document.querySelector('.device-add-group')?.classList.remove('show-all');
    $('btnDeviceMore')?.setAttribute('aria-expanded', 'false');

    document.querySelectorAll('[data-hidden-by-quick-review]').forEach(section => {
        section.style.display = '';
        section.removeAttribute('data-hidden-by-quick-review');
    });

    const bloodsQuick = $('bloods_quick_controls');
    if (bloodsQuick) bloodsQuick.style.display = 'none';

    document.querySelectorAll('.nav-item').forEach(item => {
        item.style.opacity = '';
        item.style.pointerEvents = '';
    });

    const depthFull = document.querySelector('input[name="reviewDepth"][value="full"]');
    if (depthFull) depthFull.checked = true;

    // The issues list renders a Quick-Review-only empty state; re-render so it doesn't linger.
    renderScrapedIssuesList();

    showToast("Full review mode restored", 2000);
}

export function checkStablePatientStatus() {
    const state = getState();
    if (!previousCategoryData) return false;

    const { category, hoursOnWard } = previousCategoryData;

    if (category === 'green' && state.reviewType === 'post' && hoursOnWard >= 24) {
        return true;
    }

    if (category === 'amber' && state.reviewType === 'post' && hoursOnWard >= 48) {
        return true;
    }

    return false;
}

export function showQuickReviewPrompt(categoryText, hoursOnWard, previousRisks = []) {
    const prompt = $('quickReviewPrompt');
    if (!prompt) return;
    // computeAll runs on every debounced input; offer once or we re-scroll on every keystroke.
    // This also de-duplicates the two trigger paths (DMR import and the >24h check).
    if (quickReviewOffered) return;
    setQuickReviewOffered(true);

    const prevCatText = $('prevCategoryText');
    const timeText = $('timeOnWardText');

    // The >24h path has no previous category; only show that clause when it's known.
    if (prevCatText) prevCatText.textContent = categoryText ? `Previous: ${categoryText}` : '';
    if (timeText) timeText.textContent = `${Math.round(hoursOnWard)}h since stepdown`;

    // Risks carried over from the scraped note get their own list - they're what the
    // follow-up is actually about.
    const risksBox = $('qrPromptRisks');
    if (risksBox) {
        if (previousRisks.length) {
            risksBox.innerHTML = `<strong>Previously flagged</strong><ul>${previousRisks.map(r => `<li>${r}</li>`).join('')}</ul>`;
            risksBox.style.display = 'block';
        } else {
            risksBox.style.display = 'none';
        }
    }

    prompt.style.display = 'flex';
    setTimeout(() => $('btnQuickReview')?.focus(), 100);
}

export function checkForExistingRisks(state) {
    if (state.resp_rr_concern || state.resp_o2_concern || state.resp_new_therapy) return true;
    if (state.neuro_severity === 'confusion' || state.neuro_severity === 'delirium') return true;
    if (state.renal_acute || state.renal_aki_stage) return true;
    if (state.infection_present) return true;
    if (state.pressor_recent_norad || state.pressor_recent_met || state.pressor_recent_gtn ||
        state.pressor_recent_dob || state.pressor_recent_mid) return true;
    if (state.immobility) return true;
    if (state.nutrition_concern) return true;
    return false;
}

export function updateSidebarRiskBadges(redCount, amberCount) {
    const badgeContainer = document.getElementById('sidebar-risk-badges');
    const mobileBadgeContainer = document.getElementById('mobile-risk-badges');

    let html = '';
    if (redCount > 0) html += `<span class="badge" style="color:var(--red);">🔴${redCount}</span>`;
    if (amberCount > 0) html += `<span class="badge" style="color:var(--amber);">🟡${amberCount}</span>`;

    if (badgeContainer) badgeContainer.innerHTML = html;
    if (mobileBadgeContainer) mobileBadgeContainer.innerHTML = html;
}

export function openMobileNav() {
    const overlay = $('mobileNavOverlay');
    if (overlay) overlay.classList.add('active');
}

export function closeMobileNav() {
    const overlay = $('mobileNavOverlay');
    if (overlay) overlay.classList.remove('active');
}

// Prolonged-stay mitigator. Deliberately plainer than the age one: a long ICU stay is a fact
// rather than a warning, so the control appears without turning the field amber first.
export function updateLosMitigationUI() {
    const losInput = $('icuLos');
    const wrapper = $('los_risk_wrapper');
    const reasonWrapper = $('los_mitigate_reason_wrapper');
    const reasonInput = $('los_mitigate_reason');
    const seg = $('seg_los_mitigated');
    const clickBox = $('btn_los_mitigated');
    if (!losInput || !wrapper) return;

    // Not offered for an immobile patient. Saying the trajectory to recovery is established
    // sits badly with a patient who isn't mobile, and the rules ignore the mitigation in that
    // case anyway - so the control would be asking a question its answer wouldn't be used for.
    const immobileBtn = $('seg_immobility')?.querySelector('.seg-btn.active');
    const isImmobile = immobileBtn?.dataset.value === 'true';

    const los = parseFloat(losInput.value);
    if (isNaN(los) || los <= 4 || isImmobile) {
        wrapper.style.display = 'none';
        if (reasonWrapper) reasonWrapper.style.display = 'none';
        if (reasonInput) reasonInput.value = '';
        seg?.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.value === 'false'));
        return;
    }

    wrapper.style.display = 'block';
    const activeBtn = seg?.querySelector('.seg-btn.active');
    const isMitigated = activeBtn ? (activeBtn.dataset.value === 'true') : false;

    if (reasonWrapper) reasonWrapper.style.display = isMitigated ? 'block' : 'none';
    if (clickBox) {
        clickBox.className = isMitigated ? 'age-mitigate-btn mitigated' : 'age-mitigate-btn';
        // The confirmation names the effect, not just the judgement: this control drops a
        // scored flag, and the moment anyone wonders what it did is straight after clicking it.
        // "Still in note" because mitigating is not the same as deleting - the risk prints
        // either way, marked as mitigated, with whatever reason was given.
        clickBox.innerHTML = isMitigated
            ? '✓ Deconditioning flag removed - still in note'
            : 'Long stay but recovering well?';
    }
}

export function updateAgeMitigationUI() {
    const ageInput = $('ptAge');
    const wrapper = $('age_risk_wrapper');
    const reasonWrapper = $('age_mitigate_reason_wrapper');
    const reasonInput = $('age_mitigate_reason');
    const seg = $('seg_age_mitigated');
    const ageLabel = $('lbl_ptAge');
    const clickBox = $('btn_age_mitigated');
    const colWrapper = $('wrapper_ptAge');
    
    if (!ageInput || !wrapper) return;
    
    const age = parseFloat(ageInput.value);
    if (!isNaN(age) && age >= 75) {
        wrapper.style.display = 'block';
        
        // Add the card wrapper dynamically
        if (colWrapper) colWrapper.classList.add('input-box');
        
        // Find if mitigated
        const activeBtn = seg?.querySelector('.seg-btn.active');
        const isMitigated = activeBtn ? (activeBtn.dataset.value === 'true') : false;
        
        if (reasonWrapper) {
            reasonWrapper.style.display = isMitigated ? 'block' : 'none';
        }
        
        if (isMitigated) {
            // Mitigated — subtle clean border
            if (colWrapper) {
                colWrapper.style.borderColor = 'var(--line)';
                colWrapper.style.background = '';
                colWrapper.style.boxShadow = '';
            }
            
            if (ageLabel) {
                ageLabel.innerHTML = 'Age';
                ageLabel.style.color = '';
            }
            ageInput.style.borderColor = '';
            ageInput.style.boxShadow = '';
            
            if (clickBox) {
                clickBox.removeAttribute('style');
                clickBox.className = 'age-mitigate-btn mitigated';
                clickBox.innerHTML = '✓ Age flag removed - still in note';
            }
        } else {
            // Unmitigated — amber highlight on the card
            if (colWrapper) {
                colWrapper.style.borderColor = 'var(--amber)';
                colWrapper.style.background = 'rgba(245,158,11,0.03)';
                colWrapper.style.boxShadow = '0 0 0 1px var(--amber)';
            }
            
            if (ageLabel) {
                ageLabel.innerHTML = 'Age <span style="color: var(--amber); font-weight: bold; font-size: 0.72rem;">- Frailty risk identified</span>';
                ageLabel.style.color = 'var(--amber)';
            }
            ageInput.style.borderColor = '';
            ageInput.style.boxShadow = '';
            
            if (clickBox) {
                clickBox.removeAttribute('style');
                clickBox.className = 'age-mitigate-btn';
                clickBox.innerHTML = 'Older but good baseline?';
            }
        }
    } else {
        wrapper.style.display = 'none';
        if (reasonInput) reasonInput.value = '';
        if (reasonWrapper) reasonWrapper.style.display = 'none';
        if (seg) {
            seg.querySelectorAll('.seg-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.value === 'false');
            });
        }
        // Remove the card wrapper and restore bare style
        if (colWrapper) {
            colWrapper.classList.remove('input-box');
            colWrapper.style.borderColor = 'transparent';
            colWrapper.style.background = 'transparent';
            colWrapper.style.boxShadow = 'none';
        }
        if (ageLabel) {
            ageLabel.innerHTML = 'Age';
            ageLabel.style.color = '';
        }
        ageInput.style.borderColor = '';
        ageInput.style.boxShadow = '';
        if (clickBox) {
            clickBox.removeAttribute('style');
            clickBox.className = 'age-mitigate-btn';
            clickBox.innerHTML = 'Older but good baseline?';
        }
    }
}

