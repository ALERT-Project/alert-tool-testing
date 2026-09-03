/* =========================================
   ALERT Nursing Risk Assessment Tool
   Entry point: initialisation and event wiring
   Copyright © 2025-2026 Casey Bond
   MIT License - https://opensource.org/licenses/MIT
   ========================================= */

import { $, debounce, showToast, disableAutofill, timeHHMM } from './utils.js';
import { setNotice, clearNotice, NOTICE_PRIORITY } from './notices.js';
import { ACCORDION_KEY, staticInputs, segmentedInputs, toggleInputs, SELF_DERIVED_RISK, FIELD_BACKED_FACTOR} from './config.js';
import {
    getState, saveState, loadState, restoreState, previousCategoryData, updateLastSaved,
    isQuickReviewMode, setQuickReviewDismissed, addActiveIssue, addManualIssue,
    getUnresolvedActiveIssues, getFactorsForNote, getRisksForNote, getChecksForNote,
    renderScrapedIssuesList
} from './state.js';
import { computeAll } from './logic.js';
import { generateSummary, generateHandoverLine } from './summary.js';
import {
    checkBloodRanges, updateWardOptions, updateReviewTypeVisibility, updateReviewerRoleVisibility, updateWardOtherVisibility,
    createDeviceEntry, updateDevicesSectionVisibility, toggleOxyFields, toggleInfusionsBox,
    handleUnknownBLODate, showClearDataModal, hideClearDataModal, syncComorbsToPMH, clearData,
    enableQuickReviewMode, exitQuickReviewMode, showQuickReviewPrompt, openMobileNav, closeMobileNav,
    handleSegmentClick, toggleBowelDate, updateAgeMitigationUI, updateLosMitigationUI, openAccordion, closeAccordion,
    setBloodsOverlay, closeQuickOverlays, toggleAddsOverride, setAddsOverride, refreshAddsOverrideUI, setPanelOpen,
    markCopiedOnExit, applyAppIcons
} from './ui.js';

function initialize() {
    // Before anything else: on the pilot this repaints the tab and the install icons, and
    // the sooner it runs the shorter the flash of the live tool's teal favicon.
    applyAppIcons();
    updateLastSaved();
    disableAutofill();

    document.querySelectorAll('.quick-select, .select-btn, .detail-toggle, .accordion, .trend-btn').forEach(btn => {
        btn.setAttribute('tabindex', '-1');
    });

    document.addEventListener('focusin', (e) => {
        if (e.target && e.target.tagName && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
            const footer = document.querySelector('footer');
            if (footer) {
                const rect = e.target.getBoundingClientRect();
                const footerRect = footer.getBoundingClientRect();
                if (rect.bottom > footerRect.top - 20) {
                    window.scrollBy({
                        top: rect.bottom - footerRect.top + 40,
                        behavior: 'smooth'
                    });
                }
            }
        }
    });

    const compute = debounce(() => { computeAll(); checkBloodRanges(); updateAgeMitigationUI(); updateLosMitigationUI(); saveState(true); }, 350);

    window.addDevice = (type, val, insertionDate = '') => { createDeviceEntry(type, val, insertionDate); compute(); };
    window.compute = compute;
    window.showQuickReviewPrompt = showQuickReviewPrompt;
    window.previousCategoryData = previousCategoryData;
    // Used by plugins/importer.js to stage scraped issues.
    window.addActiveIssue = addActiveIssue;
    // The importer is a plain script rather than a module, so the pattern it shares with the
    // Quick Review gate release reaches it this way.
    window.SELF_DERIVED_RISK = SELF_DERIVED_RISK;
    window.FIELD_BACKED_FACTOR = FIELD_BACKED_FACTOR;
    window.renderScrapedIssuesList = renderScrapedIssuesList;

    // Deliberately narrow: the importer can raise a prompt about what the previous review
    // recommended, but it cannot act on it. The one-click "approve handover discharge" button
    // this replaces bypassed the discharge criteria check entirely.
    window.flagPreviousRecommendation = (detail) => {
        setNotice('handover', {
            priority: NOTICE_PRIORITY.HANDOVER,
            tone: 'info',
            html: `<div class="notice-title">📋 Previous review recommended discharge pending next bloods</div>
                   ${detail ? `<div class="notice-foot">Bloods being followed: ${detail}</div>` : ''}`,
            actions: [{ id: 'dismiss-handover', label: 'Dismiss', onClick: () => clearNotice('handover') }]
        });
    };
    // plugins/adds_calc.js pings this after each recalculation.
    window.refreshAddsOverrideUI = refreshAddsOverrideUI;

    // plugins/importer.js resets the form before it applies a note. The importer only ever
    // wrote the fields its note mentioned, so importing a second patient over the first left
    // everything the new note was silent about - weight, allergies, PMH, every device, the
    // previous bloods, the carried gates - on screen under the new patient's name.
    window.clearFormForImport = clearData;

    // The review method shapes what the note claims was done, and a wrong one is only
    // discoverable after it has been pasted into DMR. Rather than pre-tick a default, the
    // note refuses to generate until the question has been answered - once per patient,
    // and not at all if it was answered on the strip up front.
    const getReviewMethod = () => document.querySelector('input[name="reviewModeType"]:checked')?.value || '';

    const setReviewMethod = (value) => {
        const radio = document.querySelector(`input[name="reviewModeType"][value="${value}"]`);
        if (!radio) return;
        radio.checked = true;
        radio.dispatchEvent(new Event('change'));
    };

    const hideReviewMethodPrompt = () => {
        const modal = $('reviewMethodPrompt');
        if (modal) modal.style.display = 'none';
    };

    // Set while the prompt is open so answering it resumes the click that raised it.
    let pendingAfterReviewMethod = null;
    // Whatever was typed into the prompt is written back to the strip field, so there is one
    // reviewer value and not two. Blank is honoured: it clears nothing and sets nothing.
    const commitPromptInitials = () => {
        const typed = ($('promptReviewerInitials')?.value || '').trim();
        const field = $('reviewerInitials');
        if (typed && field) {
            field.value = typed;
            field.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };

    // An empty box is the whole test. This was once suppressed after the first time it was
    // waved away, which made the prompt depend on state nothing on screen showed: skip it on
    // one patient and the next patient got no prompt at all, unless Clear Data happened to
    // have been pressed in between. Asking every time costs one press of Continue, and typing
    // two letters ends it for good.
    const needsInitials = () => !($('reviewerInitials')?.value || '').trim();

    // Shows only the halves still unanswered, and titles itself after whichever they are.
    const openReviewPrompt = (askMethod, askInitials) => {
        const modal = $('reviewMethodPrompt');
        if (!modal) return;
        const initialsBox = $('review_prompt_initials');
        const methodActions = $('review_prompt_method_actions');
        const continueActions = $('review_prompt_continue_actions');
        const title = $('review_prompt_title');
        if (initialsBox) initialsBox.style.display = askInitials ? 'block' : 'none';
        if (methodActions) methodActions.style.display = askMethod ? 'flex' : 'none';
        if (continueActions) continueActions.style.display = askMethod ? 'none' : 'flex';

        // With one question to ask, the title asks it and the label for that half is hidden
        // rather than repeating it directly underneath. With two, the title stops being a
        // question - a heading asking about the review method with an initials box under it
        // reads as though the box were the answer - and both halves carry their own label.
        //
        // Never phrased as signing: nothing in this tool is recorded anywhere, and initials
        // that read as a signature imply a stored record that does not exist. They reach the
        // Excel handover line and nothing else, so that is what the wording says.
        const bothAsked = askMethod && askInitials;
        const methodLabel = $('review_prompt_method_label');
        const initialsLabel = $('review_prompt_initials_label');
        if (methodLabel) methodLabel.style.display = bothAsked ? 'block' : 'none';
        if (initialsLabel) initialsLabel.style.display = bothAsked ? 'block' : 'none';
        if (title) {
            if (bothAsked) title.textContent = 'Helpful hints';
            else if (askMethod) title.textContent = 'How did you review this patient?';
            else title.textContent = 'Initials for Excel handover';
        }
        const box = $('promptReviewerInitials');
        if (box) box.value = ($('reviewerInitials')?.value || '');
        modal.style.display = 'flex';
        if (askInitials) box?.focus();
    };

    // Resumes the generate that raised the dialog, and tells it not to ask again: the questions
    // have just been answered, and one of the answers is allowed to be "nothing", which is not
    // something the fields themselves can record.
    const resumeAfterPrompt = () => {
        hideReviewMethodPrompt();
        const resume = pendingAfterReviewMethod;
        pendingAfterReviewMethod = null;
        if (resume) resume();
    };

    const chooseReviewMethod = (value) => {
        setReviewMethod(value);
        commitPromptInitials();
        resumeAfterPrompt();
    };

    $('btn_method_physical')?.addEventListener('click', () => chooseReviewMethod('physical'));
    $('btn_method_chart')?.addEventListener('click', () => chooseReviewMethod('chart'));
    $('btn_prompt_continue')?.addEventListener('click', () => {
        commitPromptInitials();
        resumeAfterPrompt();
    });

    function triggerGenerate({ justAsked = false } = {}) {
        const askMethod = !getReviewMethod();
        const askInitials = !justAsked && needsInitials();
        if (askMethod || askInitials) {
            pendingAfterReviewMethod = () => triggerGenerate({ justAsked: true });
            openReviewPrompt(askMethod, askInitials);
            return;
        }

        const summaryEl = $('summary');
        const actions = $('summary_actions');

        syncComorbsToPMH();
        computeAll();

        summaryEl.value = '';

        generateSummary(
            window._lastState || getState(),
            window._lastCat || { id: 'green', text: 'CAT 3' },
            window._lastWardTime || '',
            window._lastRed || [],
            window._lastAmber || [],
            window._lastSuppressed || [],
            window._lastActiveComorbsKeys || [],
            { factors: getFactorsForNote(), risks: getRisksForNote(), checks: getChecksForNote() }
        );

        summaryEl.style.height = 'auto';
        summaryEl.style.height = summaryEl.scrollHeight + 'px';

        if (actions) actions.style.display = 'block';
        const btn = $('btn_generate_summary');
        if (btn) btn.innerHTML = '🔄 Regenerate DMR summary <span style="font-size:0.9em; font-weight:normal; opacity:0.9;">(overwrites manual edits)</span>';

        const handoverEl = $('handoverLine');
        // Same computed risks the DMR note uses, so the line reads identically in either mode.
        if (handoverEl) handoverEl.value = generateHandoverLine(
            window._lastState || getState(),
            getUnresolvedActiveIssues(),
            window._lastCat,
            window._lastRed || [],
            window._lastAmber || []
        );
        const handoverActions = $('handover_actions');
        if (handoverActions) handoverActions.style.display = 'block';

        saveState(true);
    }

    // Wrapped rather than passed directly: triggerGenerate takes an options object, and handing
    // it the click event would put the listener one stray property away from silently skipping
    // the prompt.
    $('btn_generate_summary')?.addEventListener('click', () => triggerGenerate());

    $('btnCopyHandoverLine')?.addEventListener('click', () => {
        const text = $('handoverLine')?.value;
        if (!text) { showToast('Nothing to copy', 1500); return; }
        navigator.clipboard.writeText(text).then(() => showToast('Handover line copied', 1500));
    });

    // One add row per list, each committing into its own. Enter commits and keeps focus, so
    // several entries can be typed in a row without reaching for the mouse.
    const wireAddRow = (inputId, buttonId, list) => {
        const commit = () => {
            const input = $(inputId);
            const val = input?.value.trim();
            if (!val) return;
            addManualIssue(val, list);
            input.value = '';
            renderScrapedIssuesList();
            input.focus();
        };
        $(inputId)?.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            commit();
        });
        $(buttonId)?.addEventListener('click', commit);
    };
    wireAddRow('manualIssueInput', 'btnAddIssue', 'risks');
    wireAddRow('manualFactorInput', 'btnAddFactor', 'factors');

    const summaryInputEl = $('summary');
    if (summaryInputEl) {
        summaryInputEl.addEventListener('input', () => {
            if (!summaryInputEl.classList.contains('script-updating')) {
                const badge = $('manual_edit_badge');
                if (badge) badge.style.display = 'block';
            }
        });
    }

    // Discharge confirmation. The 24/48/72h wait is already enforced before the prompt can
    // appear, so the modal no longer re-asks about it - what it confirms is the review history,
    // which the tool has no way of knowing. Shown for every category: a CAT 1 reaching 72 hours
    // deserves at least the scrutiny a CAT 3 gets at 24.
    window.openDischargeConfirm = (intent) => {
        window.dischargeIntent = intent;
        const body = $('discharge_confirm_body');
        if (body) {
            // If this review is itself physical, that criterion is met by definition and asking
            // about it is noise. It only needs raising when today's review is a chart review.
            const isChartReview = document.querySelector('input[name="reviewModeType"]:checked')?.value === 'chart';
            body.innerHTML = isChartReview
                ? 'Has this patient had at least <strong>2 completed ALERT reviews</strong>, including at least <strong>one physical review</strong>?'
                : 'Has this patient had at least <strong>2 completed ALERT reviews</strong>?';
        }
        const modal = $('dischargeConfirmModal');
        if (modal) modal.style.display = 'flex';
    };

    const applyDischarge = (intent, msg) => {
        const chk = $(intent === 'pending' ? 'chk_discharge_pending_bloods' : 'chk_discharge_alert');
        if (!chk) return;
        chk.checked = true;
        chk.dispatchEvent(new Event('change'));
        compute();
        showToast(msg, 1500);
    };

    $('btn_discharge_yes')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.openDischargeConfirm('full');
    });

    $('btn_discharge_pending')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.openDischargeConfirm('pending');
    });

    $('btn_discharge_confirm_yes')?.addEventListener('click', (e) => {
        e.preventDefault();
        const modal = $('dischargeConfirmModal');
        if (modal) modal.style.display = 'none';

        // Set while the checkbox change handler runs, so it doesn't re-open this same modal.
        window.dischargeConfirmed = true;
        const intent = window.dischargeIntent;
        applyDischarge(intent, intent === 'pending'
            ? 'Marked for discharge pending bloods (criteria confirmed)'
            : 'Marked for discharge (criteria confirmed)');
        window.dischargeIntent = null;
        window.dischargeConfirmed = false;
    });

    $('btn_discharge_confirm_no')?.addEventListener('click', (e) => {
        e.preventDefault();
        const modal = $('dischargeConfirmModal');
        if (modal) modal.style.display = 'none';
        window.dischargeIntent = null;
    });

    const btnNo = $('btn_discharge_no');
    if (btnNo) {
        btnNo.addEventListener('click', (e) => {
            e.preventDefault();
            window.dismissedDischarge = true;
            const continueChk = $('chk_continue_alert');
            if (continueChk) continueChk.checked = true;
            compute();
        });
    }


    function syncSegments(id1, id2, type) {
        const g1 = $(id1);
        const g2 = $(id2);
        if (!g1 || !g2) return;

        [g1, g2].forEach(group => {
            group.querySelectorAll('.seg-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    setTimeout(() => {
                        const val = btn.dataset.value;
                        const otherGroup = (group === g1) ? g2 : g1;
                        otherGroup.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
                        otherGroup.querySelector(`.seg-btn[data-value="${val}"]`)?.classList.add('active');

                        if (val === "true") {
                            if (type === 'renal') showToast("Mitigation applied", 1500);
                            if (type === 'infection') showToast("Mitigation applied", 1500);
                        }
                        compute();
                    }, 50);
                });
            });
        });
    }

    // Answering a carried-forward gate - either way - makes it this review's own finding.
    document.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('.seg-btn');
        if (!btn) return;
        const box = btn.closest('.input-box.carried-forward');
        if (!box) return;
        box.classList.remove('carried-forward');
        delete box.dataset.carriedFrom;
        delete box.dataset.carriedRaw;
    });

    syncSegments('seg_renal_chronic', 'seg_renal_chronic_bloods', 'renal');
    syncSegments('seg_infection_downtrend', 'seg_infection_downtrend_bloods', 'infection');

    function setDetailToggleState(targetEl, show) {
        if (!targetEl) return;
        targetEl.style.display = show ? 'block' : 'none';
        const btn = document.querySelector(`.detail-toggle[data-target="${targetEl.id}"]`);
        if (btn) btn.textContent = show ? 'Hide details' : 'Add details';
    }

    function refreshDetailToggleState() {
        document.querySelectorAll('.detail-toggle').forEach(btn => {
            const targetId = btn.dataset.target;
            const targetEl = $(targetId);
            if (!targetEl) return;
            const inputEl = targetEl.querySelector('textarea, input');
            const hasVal = !!(inputEl && inputEl.value && inputEl.value.trim());
            setDetailToggleState(targetEl, hasVal);
        });
    }

    document.querySelectorAll('.detail-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetEl = $(btn.dataset.target);
            if (!targetEl) return;
            const isHidden = targetEl.style.display === 'none' || !targetEl.style.display;
            setDetailToggleState(targetEl, isHidden);
        });
    });

    document.addEventListener('input', (e) => {
        if (e.target && e.target.classList.contains('scraped-data')) {
            e.target.classList.remove('scraped-data');
        }
        const wrapper = e.target?.closest?.('.detail-wrapper');
        if (wrapper && wrapper.id) {
            setDetailToggleState(wrapper, true);
        }
    });

    const timeBox = $('reviewTime');
    if (timeBox && !timeBox.value) {
        const now = new Date();
        now.setMinutes(Math.round(now.getMinutes() / 15) * 15);
        timeBox.value = timeHHMM(now);
    }

    function syncInputs(id1, id2) {
        const el1 = $(id1), el2 = $(id2);
        if (!el1 || !el2) return;
        el1.addEventListener('input', () => { el2.value = el1.value; compute(); });
        el2.addEventListener('input', () => { el1.value = el2.value; compute(); });
    }

    syncInputs('adds', 'atoe_adds');
    syncInputs('wcc', 'bl_wcc');
    syncInputs('crp', 'bl_crp');
    syncInputs('neut', 'bl_neut');
    syncInputs('lymph', 'bl_lymph');

    const rrInput = $('b_rr');
    if (rrInput) {
        rrInput.addEventListener('input', debounce(() => {
            const val = parseFloat(rrInput.value);
            if (!isNaN(val) && val > 20) {
                const respSeg = $('seg_resp_concern');
                const respYes = respSeg?.querySelector('.seg-btn[data-value="true"]');
                if (respYes && !respYes.classList.contains('active')) respYes.click();
                const tachSeg = $('seg_resp_tachypnea');
                const yesBtn = tachSeg?.querySelector('.seg-btn[data-value="true"]');
                if (yesBtn && !yesBtn.classList.contains('active')) {
                    yesBtn.click();
                    showToast('Auto-selected Resp Concern + Tachypnea (>20)', 1500);
                }
            }
        }, 500));
    }

    const airwayInput = $('airway_a');
    if (airwayInput) {
        airwayInput.addEventListener('input', () => {
            airwayInput.dataset.manual = 'true';
            const val = airwayInput.value;
            if (!val) return;

            const lowerVal = val.toLowerCase().trim();
            if (lowerVal.includes('trache')) {
                const oxModBtn = document.querySelector(`#oxMod .select-btn[data-value="Trache"]`);
                if (oxModBtn && !oxModBtn.classList.contains('active')) {
                    oxModBtn.click();
                }
            }
        });
    }

    const devInput = $('b_device');
    if (devInput) {
        devInput.addEventListener('input', () => {
            // Mark as manually edited in A-E so computeAll doesn't overwrite it
            devInput.dataset.manual = 'true';

            const val = devInput.value;
            if (!val) return;

            const lowerVal = val.toLowerCase().trim();
            let selectedMode = null;
            let selectedFlow = null;
            let selectedFiO2 = null;

            if (lowerVal === 'ra' || lowerVal === 'room air') {
                selectedMode = 'RA';
            } else if (lowerVal.includes('hfnp') || lowerVal.includes('high flow') || lowerVal.includes('l/') || lowerVal.includes('%')) {
                selectedMode = 'HFNP';
                const parts = lowerVal.split('/');
                parts.forEach(p => {
                    if (p.includes('l')) selectedFlow = p.replace('l', '').trim();
                    if (p.includes('%')) selectedFiO2 = p.replace('%', '').trim();
                });
            } else if (lowerVal.includes('np') || lowerVal.includes('nasal') || lowerVal.includes('prong')) {
                selectedMode = 'NP';
                const flowMatch = val.match(/(\d+)/);
                if (flowMatch) selectedFlow = flowMatch[1];
            } else if (lowerVal.includes('niv')) {
                selectedMode = 'NIV';
            } else if (lowerVal.includes('trache')) {
                selectedMode = 'Trache';
            }

            // Click the appropriate oxygen mode button in the Respiratory Gate
            if (selectedMode) {
                const oxModBtn = document.querySelector(`#oxMod .select-btn[data-value="${selectedMode}"]`);
                if (oxModBtn && !oxModBtn.classList.contains('active')) {
                    oxModBtn.click();
                }
            }

            // Set NP flow if applicable
            if (selectedFlow && selectedMode === 'NP') {
                const npFlowInput = document.getElementById('npFlow');
                if (npFlowInput) {
                    npFlowInput.value = selectedFlow;
                    npFlowInput.dispatchEvent(new Event('input'));
                }
            }

            // Set HFNP flow/fio2 if applicable
            if (selectedMode === 'HFNP') {
                if (selectedFlow) {
                    const hfnpFlowInput = $('hfnpFlow');
                    if (hfnpFlowInput) {
                        hfnpFlowInput.value = selectedFlow;
                        hfnpFlowInput.dispatchEvent(new Event('input'));
                    }
                }
                if (selectedFiO2) {
                    const hfnpFio2Input = $('hfnpFio2');
                    if (hfnpFio2Input) {
                        hfnpFio2Input.value = selectedFiO2;
                        hfnpFio2Input.dispatchEvent(new Event('input'));
                    }
                }
            }

            // Auto-flag the respiratory concern gate if NOT room air and NOT low-flow NP (<3L)
            const isLowFlowNP = (selectedMode === 'NP' && selectedFlow && parseFloat(selectedFlow) < 3);
            if (selectedMode && selectedMode !== 'RA' && !isLowFlowNP) {
                const respSeg = $('seg_resp_concern');
                const respYes = respSeg?.querySelector('.seg-btn[data-value="true"]');
                if (respYes && !respYes.classList.contains('active')) {
                    respYes.click();
                    showToast(`Auto-selected Resp Concern (${val})`, 1500);
                }
            }
        });
    }


    document.querySelectorAll('.risk-trigger[data-risk="renal"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const renalSeg = $('seg_renal');
            const yesBtn = renalSeg.querySelector('.seg-btn[data-value="true"]');
            if (yesBtn && !yesBtn.classList.contains('active')) yesBtn.click();
            const btnVal = btn.dataset.value;
            if ((btnVal === "Oliguric" || btnVal.includes("<0.5")) && $('toggle_renal_oliguria').dataset.value === "false") $('toggle_renal_oliguria').click();
            if (btnVal === "Anuric" && $('toggle_renal_anuria').dataset.value === "false") $('toggle_renal_anuria').click();
            if (btnVal === "Dialysis" && $('toggle_renal_dialysis').dataset.value === "false") $('toggle_renal_dialysis').click();
        });
    });

    const tempInput = $('e_temp');
    if (tempInput) {
        tempInput.addEventListener('input', debounce(() => {
            const t = parseFloat(tempInput.value);
            if (!isNaN(t) && t > 38.0) {
                const infSeg = $('seg_infection');
                const yesBtn = infSeg.querySelector('.seg-btn[data-value="true"]');
                if (yesBtn && !yesBtn.classList.contains('active')) yesBtn.click();
            }
        }, 600));
    }

    const neuroInput = $('d_alert');
    if (neuroInput) {
        neuroInput.addEventListener('input', debounce((e) => {
            const val = e.target.value.toLowerCase();
            const keywords = ['confus', 'drows', 'agitat', 'delirium', 'somnolent', 'gcs 14', 'gcs 13', 'gcs 12', 'gcs 11', 'gcs 10', 'gcs 9', 'gcs 8'];
            const isGcsLow = (val.match(/gcs\\s*(\\d+)/i)?.[1] || 15) < 15;

            if (keywords.some(k => val.includes(k)) || isGcsLow) {
                const neuroSeg = $('seg_neuro_gate');
                const yesBtn = neuroSeg.querySelector('.seg-btn[data-value="true"]');
                if (yesBtn && !yesBtn.classList.contains('active')) yesBtn.click();
            }
        }, 800));
    }

    const coughInput = $('b_cough');
    if (coughInput) {
        coughInput.addEventListener('input', debounce(() => {
            const val = coughInput.value.toLowerCase();
            if (val.includes('weak') || val.includes('poor') || val.includes('ineffective')) {
                const respSeg = $('seg_resp_concern');
                const respYes = respSeg?.querySelector('.seg-btn[data-value="true"]');
                if (respYes && !respYes.classList.contains('active')) respYes.click();
                const seg = $('seg_resp_poor_cough');
                const yesBtn = seg?.querySelector('.seg-btn[data-value="true"]');
                if (yesBtn && !yesBtn.classList.contains('active')) {
                    yesBtn.click();
                    showToast('Auto-selected Resp Concern + Poor Cough (B)', 1500);
                }
            }
        }, 600));
    }

    const poorCoughSeg = $('seg_resp_poor_cough');
    if (poorCoughSeg) {
        poorCoughSeg.querySelectorAll('.seg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const coughEl = $('b_cough');
                if (coughEl && !coughEl.value && btn.dataset.value === 'true') {
                    coughEl.value = 'Weak';
                    coughEl.dispatchEvent(new Event('input'));
                }
            });
        });
    }

    const uopInput = $('e_uop');
    if (uopInput) {
        uopInput.addEventListener('input', debounce(() => {
            const val = uopInput.value.toLowerCase();
            if (val.includes('oligur') || val.includes('<0.5') || val.includes('low') || val.includes('decreas')) {
                const renalSeg = $('seg_renal');
                const yesBtn = renalSeg?.querySelector('.seg-btn[data-value="true"]');
                if (yesBtn && !yesBtn.classList.contains('active')) {
                    yesBtn.click();
                    showToast('Auto-selected Renal Concern (UOP)', 1500);
                }
                const oliguToggle = $('toggle_renal_oliguria');
                if (oliguToggle && oliguToggle.dataset.value === 'false') oliguToggle.click();
            }
        }, 600));
    }

    const oliguToggleEl = $('toggle_renal_oliguria');
    if (oliguToggleEl) {
        oliguToggleEl.addEventListener('click', () => {
            setTimeout(() => {
                const uopEl = $('e_uop');
                if (uopEl && !uopEl.value.trim() && oliguToggleEl.dataset.value === 'true') {
                    uopEl.value = 'Oliguric (<0.5ml/kg)';
                    uopEl.dispatchEvent(new Event('input'));
                }
            }, 50);
        });
    }
    const anuriaToggleEl = $('toggle_renal_anuria');
    if (anuriaToggleEl) {
        anuriaToggleEl.addEventListener('click', () => {
            setTimeout(() => {
                const uopEl = $('e_uop');
                if (uopEl && !uopEl.value.trim() && anuriaToggleEl.dataset.value === 'true') {
                    uopEl.value = 'Anuric';
                    uopEl.dispatchEvent(new Event('input'));
                }
            }, 50);
        });
    }

    document.querySelectorAll('.nav-item').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href && href.startsWith('#')) {
                const targetId = href.substring(1);
                const targetEl = document.getElementById(targetId);
                if (targetEl && targetEl.classList.contains('accordion-wrapper')) {
                    const panel = targetEl.querySelector('.panel');
                    if (panel && !panel.classList.contains('open')) {
                        setPanelOpen(panel, targetEl.querySelector('.accordion'), true);
                    }
                }
            }
        });
    });

    const weightInput = $('ptWeight');
    if (weightInput) {
        weightInput.addEventListener('input', () => {
            const w = parseFloat(weightInput.value);
            const targetEl = $('target_uop_display');
            if (w && !isNaN(w)) {
                const target = (w * 0.5).toFixed(1);
                targetEl.textContent = `Target: >${target} ml/hr`;
                targetEl.style.display = 'block';
            } else {
                targetEl.style.display = 'none';
            }
        });
    }

    document.querySelectorAll('.time-set-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const time = btn.dataset.time;
            const input = $('pressor_ceased_time');
            if (input) {
                input.value = time;
                input.dispatchEvent(new Event('input'));
            }
        });
    });

    $('pressor_ceased_time')?.addEventListener('input', compute);
    $('pressor_recent_other_note')?.addEventListener('input', compute);
    $('pressor_current_other_note')?.addEventListener('input', compute);

    const fluidInput = $('e_fluid');
    const oedemaToggle = $('toggle_renal_oedema');
    const dehydratedToggle = $('toggle_renal_dehydrated');

    if (fluidInput && oedemaToggle && dehydratedToggle) {
        fluidInput.addEventListener('input', () => {
            const val = fluidInput.value.toLowerCase();
            if (val.includes('oedema') && oedemaToggle.dataset.value === 'false') {
                oedemaToggle.click();
            } else if (!val.includes('oedema') && oedemaToggle.dataset.value === 'true') {
                oedemaToggle.click();
            }
            if (val.includes('dehydrated') && dehydratedToggle.dataset.value === 'false') {
                dehydratedToggle.click();
            } else if (!val.includes('dehydrated') && dehydratedToggle.dataset.value === 'true') {
                dehydratedToggle.click();
            }
        });

        [oedemaToggle, dehydratedToggle].forEach(toggle => {
            toggle.addEventListener('click', () => {
                setTimeout(() => {
                    const oedema = oedemaToggle.dataset.value === 'true';
                    const dehydrated = dehydratedToggle.dataset.value === 'true';
                    if (oedema && dehydrated) {
                        fluidInput.value = 'Oedema + Dehydrated';
                    } else if (oedema) {
                        fluidInput.value = 'Oedema';
                    } else if (dehydrated) {
                        fluidInput.value = 'Dehydrated';
                    } else {
                        fluidInput.value = 'Euvolaemic';
                    }
                    fluidInput.dispatchEvent(new Event('input'));
                }, 50);
            });
        });
    }

    // Case-insensitive, because a value scraped out of a previous note carries that note's
    // capitalisation. "1x Assist" imported from an older note is the same entry as today's
    // "1x assist" button, and stacking it again would read as two mobility levels.
    const alreadyStacked = (current, val) => current.toLowerCase().includes(val.toLowerCase());

    document.querySelectorAll('.quick-select').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (btn.classList.contains('risk-trigger') || btn.classList.contains('safe-trigger')) {
                const targetId = btn.dataset.target;
                const target = $(targetId);
                if (target) {
                    if (btn.dataset.stack === "true") {
                        const current = target.value;
                        if (!alreadyStacked(current, btn.dataset.value)) target.value = current ? `${current}, ${btn.dataset.value}` : btn.dataset.value;
                    } else { target.value = btn.dataset.value; }
                    target.dispatchEvent(new Event('input'));
                }
                return;
            }
            const targetId = btn.dataset.target;
            if (targetId) {
                const target = $(targetId);
                if (target) {
                    const val = btn.dataset.value;
                    if (btn.dataset.stack === "true") {
                        if (!alreadyStacked(target.value, val)) target.value = target.value ? `${target.value}, ${val}` : val;
                    } else { target.value = val; }
                    target.dispatchEvent(new Event('input'));
                    if (targetId === 'lactate_trend') {
                        document.querySelectorAll('.quick-select[data-target="lactate_trend"]').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                    }
                    if (targetId === 'dyspneaConcern') {
                        document.querySelectorAll('.quick-select[data-target="dyspneaConcern"]').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                    }
                    if (btn.id === 'btn_fluid_restrict') {
                        const frWrapper = $('fluid_restriction_wrapper');
                        if (frWrapper) {
                            frWrapper.style.display = target.value.includes('Fluid Restriction') ? 'block' : 'none';
                        }
                    }
                    compute();
                }
            } else if (btn.id === 'btn_bo' || btn.id === 'btn_bno') {
                const other = btn.id === 'btn_bno' ? $('btn_bo') : $('btn_bno');
                const isActive = btn.classList.contains('active');
                if (isActive) {
                    btn.classList.remove('active');
                    toggleBowelDate(null);
                } else {
                    btn.classList.add('active');
                    other.classList.remove('active');
                    toggleBowelDate(btn.id);
                }
                compute();
            }
        });
    });

    function setDateInput(id, offsetDays) {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const val = `${year}-${month}-${day}`;
        const el = $(id);
        if (el) {
            el.value = val;
            el.dispatchEvent(new Event('input'));
            compute();
        }
    }

    $('btn_stepdown_today')?.addEventListener('click', () => setDateInput('stepdownDate', 0));
    $('btn_stepdown_yesterday')?.addEventListener('click', () => setDateInput('stepdownDate', -1));
    $('btn_bowel_today')?.addEventListener('click', () => setDateInput('bowel_date', 0));
    $('btn_bowel_yesterday')?.addEventListener('click', () => setDateInput('bowel_date', -1));

    document.querySelectorAll('.segmented-group').forEach(group => {
        group.querySelectorAll('.seg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                group.dataset.manual = 'true';
                const val = btn.dataset.value;
                const id = group.id.replace('seg_', '');
                const wasActive = btn.classList.contains('active');
                group.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
                if (wasActive) {
                    handleSegmentClick(id, null);
                } else {
                    btn.classList.add('active');
                    handleSegmentClick(id, val);
                }
                saveState(true);
                computeAll();
                checkBloodRanges();
            });
        });
    });

    document.querySelectorAll('.toggle-label').forEach(el => {
        if ([
            'toggle_resp_tachypnea', 'toggle_resp_rapid_wean', 'toggle_resp_poor_cough', 'toggle_resp_poor_swallow'
        ].includes(el.id)) return;
        el.addEventListener('click', () => {
            const isOn = el.dataset.value === 'true';
            el.dataset.value = isOn ? 'false' : 'true';
            el.classList.toggle('active', !isOn);
            if (el.id === 'toggle_comorb_other') $('comorb_other_note_wrapper').style.display = !isOn ? 'block' : 'none';
            if (el.id === 'toggle_pressor_recent_other') $('pressor_recent_other_note_wrapper').style.display = !isOn ? 'block' : 'none';
            if (el.id === 'toggle_pressor_current_other') $('pressor_current_other_note_wrapper').style.display = !isOn ? 'block' : 'none';
            if (el.id === 'toggle_renal_dialysis') {
                $('dialysis_type_wrapper').style.display = !isOn ? 'block' : 'none';
            }
            if (el.id === 'toggle_renal_dialysis') {
                const comorb = $('toggle_comorb_dialysis');
                if (comorb && comorb.dataset.value !== el.dataset.value) {
                    comorb.click();
                }
            }
            if (el.id === 'toggle_comorb_dialysis') {
                const renal = $('toggle_renal_dialysis');
                if (renal && renal.dataset.value !== el.dataset.value) {
                    renal.click();
                }
            }
            if (el.id.startsWith('toggle_comorb_')) {
                syncComorbsToPMH();
            }
            saveState(true);
            computeAll();
            checkBloodRanges();
        });
    });

    document.querySelectorAll('.button-group').forEach(group => {
        group.querySelectorAll('.select-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                group.querySelectorAll('.select-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (['oxMod', 'tracheType', 'tracheStatus'].includes(group.id)) {
                    const devEl = $('b_device');
                    if (devEl) devEl.dataset.manual = 'false';
                    const airwayEl = $('airway_a');
                    if (airwayEl) airwayEl.dataset.manual = 'false';

                    const oxModActive = document.querySelector('#oxMod .select-btn.active')?.dataset.value;
                    if (oxModActive === 'Trache') {
                        const container = $('devices-container');
                        if (container) {
                            const type = document.querySelector('#tracheType .select-btn.active')?.dataset.value || 'Tracheostomy';
                            const status = document.querySelector('#tracheStatus .select-btn.active')?.dataset.value || 'Stable';
                            const details = status === 'New' ? `${type} (New)` : type;

                            if (type === 'Laryngectomy') {
                                const existingLary = Array.from(container.querySelectorAll('.device-entry[data-type="Other Device"]'))
                                    .find(el => el.querySelector('.device-textarea')?.value.toLowerCase().includes('lary'));
                                if (!existingLary) {
                                    createDeviceEntry('Other Device', details);
                                } else {
                                    const area = existingLary.querySelector('.device-textarea');
                                    if (area && !area.value.includes('-')) {
                                        area.value = details;
                                    }
                                }
                                const tracheEntry = container.querySelector('.device-entry[data-type="Tracheostomy"]');
                                if (tracheEntry) tracheEntry.remove();
                            } else {
                                const existingTrache = container.querySelector('.device-entry[data-type="Tracheostomy"]');
                                if (!existingTrache) {
                                    createDeviceEntry('Tracheostomy', details);
                                } else {
                                    const area = existingTrache.querySelector('.device-textarea');
                                    if (area && !area.value.includes('-')) {
                                        area.value = details;
                                    }
                                }
                                const existingLary = Array.from(container.querySelectorAll('.device-entry[data-type="Other Device"]'))
                                    .find(el => el.querySelector('.device-textarea')?.value.toLowerCase().includes('lary'));
                                if (existingLary) existingLary.remove();
                            }
                        }
                    } else {
                        const container = $('devices-container');
                        if (container) {
                            const tracheEntry = container.querySelector('.device-entry[data-type="Tracheostomy"]');
                            if (tracheEntry) tracheEntry.remove();
                            const existingLary = Array.from(container.querySelectorAll('.device-entry[data-type="Other Device"]'))
                                    .find(el => el.querySelector('.device-textarea')?.value.toLowerCase().includes('lary'));
                            if (existingLary) existingLary.remove();
                        }
                    }
                    toggleOxyFields();
                }

                if (group.id === 'neuroType') $('neuro_gate_content').style.display = 'block';
                saveState(true);
                computeAll();
                checkBloodRanges();
            });
        });
    });

    staticInputs.forEach(id => {
        const el = $(id);
        if (el) {
            el.addEventListener('input', () => {
                if (['stepdownTime', 'stepdownDate', 'reviewTime'].includes(id)) {
                    const ah = $('seg_after_hours');
                    if (ah) ah.dataset.manual = 'false';
                }
                compute();
            });
        }
    });

    $('bowel_date')?.addEventListener('change', compute);
    $('stepdownDate')?.addEventListener('change', compute);

    $('btn_age_mitigated')?.addEventListener('click', () => {
        const seg = $('seg_age_mitigated');
        if (seg) {
            const activeBtn = seg.querySelector('.seg-btn.active');
            const isMitigated = activeBtn ? (activeBtn.dataset.value === 'true') : false;
            const newValStr = !isMitigated ? 'true' : 'false';
            
            seg.querySelectorAll('.seg-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.value === newValStr);
            });
            handleSegmentClick('age_mitigated', newValStr);
        }
        compute();
    });

    $('age_mitigate_reason')?.addEventListener('input', compute);

    $('btn_los_mitigated')?.addEventListener('click', () => {
        const seg = $('seg_los_mitigated');
        if (seg) {
            const activeBtn = seg.querySelector('.seg-btn.active');
            const isMitigated = activeBtn ? (activeBtn.dataset.value === 'true') : false;
            const newValStr = !isMitigated ? 'true' : 'false';
            seg.querySelectorAll('.seg-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.value === newValStr);
            });
            handleSegmentClick('los_mitigated', newValStr);
        }
        compute();
    });

    $('los_mitigate_reason')?.addEventListener('input', compute);

    // Delegated: the suggestion is re-rendered by computeAll, so its button is a new element
    // each time and cannot hold a listener of its own.
    document.addEventListener('click', (e) => {
        if (e.target?.id !== 'btnAcceptDowntrend') return;
        e.preventDefault();
        const yes = document.querySelector('#seg_infection_downtrend .seg-btn[data-value="true"]');
        if (yes && !yes.classList.contains('active')) yes.click();
    });

    // The checkbox is the same switch as the "Enter MODS" button on the risk card, so it moves
    // the same state rather than only its own tick - which used to be undone the moment the
    // ADDS calculator wrote to #adds, leaving MODS out of the note entirely.
    $('chk_use_mods')?.addEventListener('change', () => {
        const manual = $('addsManual')?.value === 'true';
        if ($('chk_use_mods').checked !== manual) setAddsOverride(!manual);
        compute();
    });
    $('chk_aperients')?.addEventListener('change', compute);
    $('chk_bloods_nil_sig')?.addEventListener('change', (e) => {
        const bloodsGrid = document.querySelector('.bloods-grid');
        if (bloodsGrid) bloodsGrid.style.display = e.target.checked ? 'none' : '';
        compute();
    });
    $('chk_unknown_blo_date')?.addEventListener('change', () => { handleUnknownBLODate(); compute(); });
    $('comorb_other_note')?.addEventListener('input', compute);
    $('comorb_other_note')?.addEventListener('blur', () => {
        const toggle = $('toggle_comorb_other');
        if (toggle && toggle.dataset.value === 'true') syncComorbsToPMH();
    });

    $('chk_discharge_alert')?.addEventListener('change', () => {
        const dischargeChk = $('chk_discharge_alert');
        const continueChk = $('chk_continue_alert');
        const pendingChk = $('chk_discharge_pending_bloods');
        const wrapper = $('discharge_pending_bloods_note_wrapper');

        if (dischargeChk && dischargeChk.checked) {
            if (!window.dischargeConfirmed) {
                dischargeChk.checked = false;
                window.openDischargeConfirm('full');
                return;
            }

            if (continueChk) {
                continueChk.checked = false;
            }
            if (pendingChk) {
                pendingChk.checked = false;
            }
            if (wrapper) {
                wrapper.style.display = 'none';
            }
        }
        compute();
    });
    
    $('chk_discharge_pending_bloods')?.addEventListener('change', () => {
        const pendingChk = $('chk_discharge_pending_bloods');
        const dischargeChk = $('chk_discharge_alert');
        const continueChk = $('chk_continue_alert');
        const wrapper = $('discharge_pending_bloods_note_wrapper');

        if (pendingChk && pendingChk.checked) {
            if (!window.dischargeConfirmed) {
                pendingChk.checked = false;
                window.openDischargeConfirm('pending');
                return;
            }

            if (dischargeChk) dischargeChk.checked = false;
            if (continueChk) continueChk.checked = false;
            if (wrapper) wrapper.style.display = 'block';
        } else {
            if (wrapper) wrapper.style.display = 'none';
        }
        compute();
    });

    $('chk_continue_alert')?.addEventListener('change', () => {
        const continueChk = $('chk_continue_alert');
        const dischargeChk = $('chk_discharge_alert');
        const pendingChk = $('chk_discharge_pending_bloods');
        const wrapper = $('discharge_pending_bloods_note_wrapper');
        const disPrompt = $('discharge_prompt');

        if (continueChk && continueChk.checked) {
            if (dischargeChk) dischargeChk.checked = false;
            if (pendingChk) pendingChk.checked = false;
            if (wrapper) wrapper.style.display = 'none';
            if (disPrompt && disPrompt.style.display !== 'none') {
                window.dismissedDischarge = true;
            }
        }
        compute();
    });
    $('chk_medical_rounding')?.addEventListener('change', () => {
        const preCheckbox = $('chk_medical_rounding_pre');
        if (preCheckbox) preCheckbox.checked = $('chk_medical_rounding').checked;
        compute();
    });
    $('chk_medical_rounding_pre')?.addEventListener('change', () => {
        const mainCheckbox = $('chk_medical_rounding');
        if (mainCheckbox) mainCheckbox.checked = $('chk_medical_rounding_pre').checked;
        compute();
    });

    // Chart vs physical decides both the DMR heading and the CAT 3 discharge criteria.
    document.querySelectorAll('input[name="reviewModeType"]').forEach(r => r.addEventListener('change', compute));
    document.querySelectorAll('input[name="clinicianGrade"]').forEach(r => r.addEventListener('change', compute));
    // The team decides which grades exist and whether REDCap applies, so it re-runs the role
    // rules before computing rather than only recording a value.
    document.querySelectorAll('input[name="reviewTeam"]').forEach(r => r.addEventListener('change', () => {
        updateReviewerRoleVisibility();
        compute();
    }));

    document.querySelectorAll('input[name="reviewType"]').forEach(r => r.addEventListener('change', () => {
        updateWardOptions();
        toggleInfusionsBox();
        updateReviewTypeVisibility();
        compute();
    }));
    $('ptWard')?.addEventListener('change', () => { updateWardOtherVisibility(); compute(); });

    $('clearDataBtnTop')?.addEventListener('click', () => showClearDataModal());
    $('footerClear')?.addEventListener('click', () => showClearDataModal());

    $('closeClearModal')?.addEventListener('click', hideClearDataModal);
    $('confirmClearData')?.addEventListener('click', () => {
        hideClearDataModal();
        clearData();
    });
    $('btnQuickCopySummary')?.addEventListener('click', () => {
        const text = $('summary').value;
        if (!text) { showToast('Summary is empty', 1500); return; }
        // Copying on the way out: the reset that follows must not wipe what was just copied.
        markCopiedOnExit();
        navigator.clipboard.writeText(text).then(() => showToast('✓ Copied to clipboard', 1500));
    });

    $('btnQuickReview')?.addEventListener('click', enableQuickReviewMode);
    $('btnFullReview')?.addEventListener('click', () => {
        setQuickReviewDismissed(true);
        const prompt = $('quickReviewPrompt');
        if (prompt) prompt.style.display = 'none';
    });
    $('btnExitQuickReview')?.addEventListener('click', exitQuickReviewMode);

    document.querySelectorAll('input[name="reviewDepth"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'quick' && !isQuickReviewMode) { setQuickReviewDismissed(false); enableQuickReviewMode(); }
            else if (radio.value === 'full' && isQuickReviewMode) exitQuickReviewMode();
        });
    });

    // "Details" reveals the full bloods grid without leaving Quick Review. In Quick Review
    // the card floats over the page, since the grid needs more room than the left rail has.
    const toggleBloodsDetails = () => {
        const panel = $('panel_bloods');
        const isOpen = panel?.classList.contains('open');
        if (isOpen) closeAccordion('panel_bloods', '[aria-controls="panel_bloods"]');
        else openAccordion('panel_bloods', '[aria-controls="panel_bloods"]');
        setBloodsOverlay(!isOpen);
    };
    $('btnBloodsDetailsToggle')?.addEventListener('click', toggleBloodsDetails);
    $('qrBackdrop')?.addEventListener('click', closeQuickOverlays);
    // One handler for every floating card's ✕ - they all close the same way.
    document.querySelectorAll('[data-qr-close]').forEach(btn => {
        btn.addEventListener('click', closeQuickOverlays);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.querySelector('.qr-expanded')) closeQuickOverlays();
    });

    $('floatingNavBtn')?.addEventListener('click', openMobileNav);
    $('closeMobileNav')?.addEventListener('click', closeMobileNav);
    $('mobileNavOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'mobileNavOverlay') closeMobileNav();
    });
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.addEventListener('click', closeMobileNav);
    });

    $('footerCopy')?.addEventListener('click', () => {
        const text = $('summary').value;
        if (!text) { showToast('Nothing to copy', 1500); return; }
        navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard', 1500));
    });
    $('btnCopySummaryMain')?.addEventListener('click', () => {
        const text = $('summary').value;
        if (!text) { showToast('Nothing to copy', 1500); return; }
        navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard', 1500));
    });

    $('btnUseSameBloods')?.addEventListener('click', () => {
        const blMap = {
            'lac_review': 'bl_lac_review', 'hb': 'bl_hb', 'wcc': 'bl_wcc', 'cr_review': 'bl_cr_review',
            'k': 'bl_k', 'na': 'bl_na', 'mg': 'bl_mg', 'phos': 'bl_phos', 'plts': 'bl_plts',
            'alb': 'bl_alb', 'neut': 'bl_neut', 'lymph': 'bl_lymph', 'crp': 'bl_crp',
            'bili': 'bl_bili', 'alt': 'bl_alt', 'inr': 'bl_inr', 'aptt': 'bl_aptt'
        };
        if (window.prevBloods) {
            let count = 0;
            Object.keys(window.prevBloods).forEach(key => {
                const targetId = blMap[key];
                const val = window.prevBloods[key];
                if (targetId && val && $(targetId)) {
                    $(targetId).value = val;
                    $(targetId).classList.add('scraped-data');
                    count++;
                }
            });
            if (count > 0) {
                const ev = new Event('input');
                Object.values(blMap).forEach(id => $(id)?.dispatchEvent(ev));
                showToast(`Filled ${count} fields`, 1500);
            } else {
                showToast("No previous bloods found", 1500);
            }
        }
    });

    $('btnClearCurrentBloods')?.addEventListener('click', () => {
        const bloodFields = [
            'bl_lac_review', 'bl_hb', 'bl_wcc', 'bl_crp', 'bl_cr_review', 'bl_egfr',
            'bl_k', 'bl_na', 'bl_mg', 'bl_phos', 'bl_plts', 'bl_alb',
            'bl_neut', 'bl_lymph', 'bl_bili', 'bl_alt', 'bl_inr', 'bl_aptt'
        ];

        let count = 0;
        bloodFields.forEach(id => {
            const field = $(id);
            if (field && field.value) {
                field.value = '';
                field.classList.remove('scraped-data');
                count++;
            }
        });

        document.querySelectorAll('.trend-buttons .trend-btn.active').forEach(btn => {
            btn.classList.remove('active');
        });

        if (count > 0) {
            compute();
            showToast(`Cleared ${count} blood result${count > 1 ? 's' : ''}`, 1500);
        } else {
            showToast("No blood results to clear", 1500);
        }
    });

    $('btnClearPreviousBloods')?.addEventListener('click', () => {
        const prevLabels = [
            'prev_bl_lac_review', 'prev_bl_hb', 'prev_bl_wcc', 'prev_bl_crp',
            'prev_bl_cr_review', 'prev_bl_egfr', 'prev_bl_k', 'prev_bl_na',
            'prev_bl_mg', 'prev_bl_phos', 'prev_bl_plts', 'prev_bl_alb',
            'prev_bl_neut', 'prev_bl_lymph', 'prev_bl_bili', 'prev_bl_alt',
            'prev_bl_inr', 'prev_bl_aptt'
        ];

        let count = 0;
        prevLabels.forEach(id => {
            const label = $(id);
            if (label && label.textContent.trim()) {
                label.textContent = '';
                count++;
            }
        });

        window.prevBloods = {};

        if (count > 0) {
            compute();
            showToast(`Cleared ${count} previous blood result${count > 1 ? 's' : ''}`, 1500);
        } else {
            showToast("No previous blood results to clear", 1500);
        }
    });

    document.querySelectorAll('.trend-buttons').forEach(group => {
        ['↑', '↓', '→'].forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'trend-btn'; btn.textContent = t; btn.dataset.value = t;
            btn.setAttribute('tabindex', '-1');
            btn.addEventListener('click', () => {
                const was = btn.classList.contains('active');
                group.querySelectorAll('.trend-btn').forEach(b => b.classList.remove('active'));
                if (!was) btn.classList.add('active');
                // Once a clinician sets an arrow themselves it stops being recalculated.
                group.dataset.manual = 'true';
                compute();
            });
            group.appendChild(btn);
        });
    });

    document.querySelectorAll('.accordion-wrapper').forEach(w => {
        w.querySelector('.accordion').addEventListener('click', () => {
            const panel = w.querySelector('.panel');
            const isOpen = panel.classList.contains('open');
            setPanelOpen(panel, w.querySelector('.accordion'), !isOpen);
            // sessionStorage, matching where it is read back below - the map used to be
            // written to localStorage and read from sessionStorage, so it never restored.
            const map = JSON.parse(sessionStorage.getItem(ACCORDION_KEY) || '{}');
            map[w.dataset.accordionId] = !isOpen;
            sessionStorage.setItem(ACCORDION_KEY, JSON.stringify(map));
            // Bloods opened from its own header still gets the Quick Review overlay treatment.
            if (w.id === 'section-bloods') setBloodsOverlay(!isOpen);
        });
    });

    document.querySelectorAll('.btn[data-device-type]').forEach(btn => {
        btn.addEventListener('click', () => { createDeviceEntry(btn.dataset.deviceType); updateDevicesSectionVisibility(); computeAll(); });
    });

    // Select Category: red/amber upgrade the computed category, green downgrades it.
    // Clicking the active button, or Clear, hands the category back to the calculation.
    const CATEGORY_CHOICES = ['red', 'amber', 'green'];
    // compute() -> refreshCategorySelect() owns the button/reason-box visuals, so restoring a
    // saved state lands in the same place as a click.
    const setCategoryChoice = (choice) => {
        $('override').value = choice;
        compute();
        if (choice !== 'none') $('overrideNote')?.focus();
    };

    CATEGORY_CHOICES.forEach(t => {
        $(`override_${t}`)?.addEventListener('click', () => {
            const isActive = $(`override_${t}`).classList.contains('active');
            setCategoryChoice(isActive ? 'none' : t);
        });
    });
    $('override_clear')?.addEventListener('click', () => setCategoryChoice('none'));

    $('btnAddsOverride')?.addEventListener('click', () => { toggleAddsOverride(); compute(); });
    $('adds')?.addEventListener('input', refreshAddsOverrideUI);
    $('addsOverrideNote')?.addEventListener('input', refreshAddsOverrideUI);
    // The A-E MODS boxes mirror back to #adds, which is what the rules score and what
    // refreshAddsOverrideUI copies forward. Without this a MODS typed in A-E never reached the
    // category, and was overwritten by the empty #adds on the next refresh.
    $('mods_score')?.addEventListener('input', () => {
        if ($('addsManual')?.value !== 'true') return;
        const adds = $('adds');
        if (adds && adds.value !== $('mods_score').value) {
            adds.value = $('mods_score').value;
            adds.dispatchEvent(new Event('input'));
        }
    });
    $('mods_details')?.addEventListener('input', () => {
        if ($('addsManual')?.value !== 'true') return;
        const note = $('addsOverrideNote');
        if (note) note.value = $('mods_details').value;
        compute();
    });

    $('btnDeviceMore')?.addEventListener('click', (e) => {
        const group = document.querySelector('.device-add-group');
        if (!group) return;
        const showAll = group.classList.toggle('show-all');
        e.currentTarget.textContent = showAll ? 'Fewer ▴' : 'More ▾';
        e.currentTarget.setAttribute('aria-expanded', String(showAll));
    });

    updateWardOptions();
    const saved = loadState();
    if (saved) restoreState(saved);
    updateAgeMitigationUI();
    updateLosMitigationUI();
    refreshAddsOverrideUI();
    refreshDetailToggleState();
    updateReviewTypeVisibility();

    const accMap = JSON.parse(sessionStorage.getItem(ACCORDION_KEY) || '{}');
    document.querySelectorAll('.accordion-wrapper').forEach(w => {
        if (accMap[w.dataset.accordionId]) setPanelOpen(w.querySelector('.panel'), w.querySelector('.accordion'), true);
    });

    compute();
    checkBloodRanges();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
