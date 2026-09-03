/* =========================================
   ALERT Tool Plugin: DMR Importer
   Copyright © 2025-2026 Casey Bond
   Part of ALERT Nursing Risk Assessment Tool
   MIT License - https://opensource.org/licenses/MIT
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {

    const modal = document.getElementById('importModal');
    const openBtn = document.getElementById('btnOpenImport');
    const closeBtn = document.getElementById('closeImport');
    const runBtn = document.getElementById('runImport');
    const txt = document.getElementById('importText');

    if (openBtn && modal) {
        openBtn.addEventListener('click', () => { modal.style.display = 'flex'; });
        closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    }

    const overwriteModal = document.getElementById('importOverwriteModal');
    let pendingImport = null;

    // Whether this form is already holding a review. Identifiers first, then the things a
    // second import would silently inherit: the device list, and any staged issue or gate the
    // previous note put there.
    function formHoldsPatient() {
        const filled = ['ptName', 'ptMrn', 'ptAge', 'ptWeight', 'ptBed', 'ptAdmissionReason', 'icuLos',
            'allergies_note', 'goc_note', 'pmh_note', 'ae_mobility', 'ae_diet', 'adds', 'mods_score']
            .some(id => (document.getElementById(id)?.value || '').trim() !== '');
        if (filled) return true;
        if (document.querySelector('.device-entry')) return true;
        if (document.querySelector('.input-box.carried-forward')) return true;
        const ward = document.getElementById('ptWard');
        if (ward && ward.value && ward.value !== '') return true;
        return false;
    }

    // Every import starts from a clean form. The importer writes only what its note mentions,
    // so anything the note is silent about would otherwise stay on screen and be read - and
    // written into the next DMR - as the imported patient's own.
    function runImport(data) {
        if (window.clearFormForImport) window.clearFormForImport();
        processDMR(data);
        modal.style.display = 'none';
        if (overwriteModal) overwriteModal.style.display = 'none';
        // Trigger generic input event to update calculations
        const ptName = document.getElementById('ptName');
        if (ptName) ptName.dispatchEvent(new Event('input'));
    }

    if (runBtn) {
        runBtn.addEventListener('click', () => {
            const data = txt.value;
            if (!data) return;
            // The clear is not silent when there is something to lose.
            if (formHoldsPatient() && overwriteModal) {
                pendingImport = data;
                modal.style.display = 'none';
                overwriteModal.style.display = 'flex';
                return;
            }
            runImport(data);
        });
    }

    document.getElementById('confirmImportOverwrite')?.addEventListener('click', () => {
        const data = pendingImport;
        pendingImport = null;
        if (overwriteModal) overwriteModal.style.display = 'none';
        if (data) runImport(data);
    });

    document.getElementById('cancelImportOverwrite')?.addEventListener('click', () => {
        pendingImport = null;
        if (overwriteModal) overwriteModal.style.display = 'none';
        // Back to the import box with the pasted note still in it, rather than losing it.
        if (modal) modal.style.display = 'flex';
    });

    // The note prints '--' wherever a field was blank when it was written. Importing that back
    // puts a literal '--' in Initials or Bed, which then reads as data - so it's dropped.
    const isPlaceholder = (v) => /^-+$/.test((v || '').trim());

    function setVal(id, val) {
        const el = document.getElementById(id);
        if (el && val && !isPlaceholder(val)) {
            el.value = val.trim();
            el.classList.add('scraped-data');
            el.dispatchEvent(new Event('input'));
        }
    }

    // "Casey Bond" -> "CB", "Bond, Casey" -> "BC", "ABC" -> "ABC". A single short token is
    // already initials, which is what this tool's own notes carry, so it passes through
    // untouched rather than collapsing to one letter.
    function toInitials(raw) {
        const cleaned = (raw || '').replace(/[^A-Za-z\s,'-]/g, ' ').trim();
        if (!cleaned) return '';
        const parts = cleaned.split(/[\s,]+/).filter(Boolean);
        if (parts.length === 1 && parts[0].length <= 3) return parts[0].toUpperCase();
        return parts.map(p => p[0]).join('').toUpperCase().slice(0, 3);
    }

    function setPrev(id, val) {
        const el = document.getElementById(id);
        if (el && val) {
            let text = val.trim();
            text = text.replace(/%/, '');
            
            const noTruncateIds = ['prev_nutrition', 'prev_pics_status', 'prev_sleep', 'prev_psych', 'prev_other_context'];
            if (!id.includes('risk') && !noTruncateIds.includes(id) && text.length > 25) {
                text = text.substring(0, 23) + '..';
            }
            el.textContent = `(Prev: ${text})`;
        }
    }

    function setRiskText(id, val) {
        const el = document.getElementById(id);
        if (el && val) {
            el.textContent = ` (Prev: ${val.trim()})`;
        }
    }

    // Risk wording in the previous note -> the gate it belongs to. After-hours and prolonged
    // ICU stay are deliberately absent: the tool derives both from the dates it already
    // scraped, so setting them here would fight its own logic.
    const RISK_GATE_MAP = [
        { test: /oxygen|wean|tachypnea|tachypnoea|respiratory|dyspnoea|dyspnea/, gate: 'seg_resp_concern' },
        { test: /neuro|gcs|delirium|confusion|agitat/, gate: 'seg_neuro_gate' },
        { test: /renal|aki|creatinine|\bcr\b|oliguria|anuria|dialysis/, gate: 'seg_renal', note: 'renal_note' },
        { test: /infection|sepsis|\bwcc\b|\bcrp\b|febrile|antibiotic/, gate: 'seg_infection', note: 'infection_note' },
        { test: /electrolyte|potassium|sodium|magnesium|phosphate/, gate: 'seg_electrolyte_gate', note: 'electrolyteConcern_note' },
        { test: /vaso|pressor|noradrenaline|metaraminol/, gate: 'seg_pressors', note: 'pressors_note' },
        // Matches "immobility" and "immobile", so both the old wording and the immobile half of
        // the combined deconditioning line carry. Deliberately does NOT match "deconditioning"
        // on its own: that line is also produced for a long stay in a fully mobile patient, and
        // setting the immobility gate from it would assert something the previous note didn't.
        { test: /immobil/, gate: 'seg_immobility', note: 'immobility_note' }
    ];

    // Risks the tool re-derives from data it has already scraped. Staging the previous note's
    // wording as well would show the same risk twice.
    // "deconditioning risk" covers the combined line's long-stay half, which the tool recomputes
    // from the ICU LOS it has already scraped. When that line also names immobility it is folded
    // into the gate above and never reaches this test.
    // Defined in config.js and shared with the Quick Review gate release, which stages
    // carried risks by another route and has to apply exactly the same rule.
    const SELF_DERIVED_RISK = window.SELF_DERIVED_RISK;

    // "- Awaiting dietitian review (carried 3)" -> text plus the count to continue from, and
    // "(mitigated: known CKD...)" -> a risk that was considered and discounted, which has to
    // come back saying so rather than as a live risk.
    function readCarriedLine(rawTxt) {
        let text = rawTxt;
        let carried = 1;
        const m = text.match(/\s*\(carried (\d+)\)\s*$/i);
        if (m) {
            carried = parseInt(m[1], 10) || 1;
            text = text.slice(0, m.index).trim();
        }
        return { text, carried: carried + 1, mitigated: /\(mitigated:/i.test(text) };
    }

    // Returns true when the line was folded into a gate, so the caller can skip staging it as
    // a separate issue - the gate produces its own issue with the tool's own wording.
    function carryRiskToGate(lowerTxt, rawTxt) {
        let carried = false;
        RISK_GATE_MAP.forEach(({ test, gate, note }) => {
            if (!test.test(lowerTxt)) return;
            const group = document.getElementById(gate);
            if (!group) return;
            // Never overwrite an answer the clinician has already given.
            if (group.querySelector('.seg-btn.active')) return;
            const yes = group.querySelector('.seg-btn[data-value="true"]');
            if (!yes) return;
            // Click rather than set classes: the app's own handler opens the drawer and recomputes.
            yes.click();

            carried = true;

            // Yesterday's numbers are not today's findings, so the detail never touches the
            // gate's note field - it is kept only where it stays labelled as previous: the
            // (Prev: ...) hint and the re-assessment card. The concern carries, the value doesn't.
            const wrapper = group.closest('.input-box');
            if (wrapper) {
                wrapper.classList.add('carried-forward');
                wrapper.dataset.carriedFrom = rawTxt.replace(/^[^-]*-\s*/, '').trim() || rawTxt;
                // The previous note's whole line, kept intact. Quick Review hands the gates
                // back and puts their risks on the list instead, and it has to do that in the
                // wording the last reviewer used - carriedFrom is only the detail after the
                // dash, which reads as a fragment on its own.
                wrapper.dataset.carriedRaw = rawTxt;
                if (note) wrapper.dataset.carriedNote = note;
            }
        });
        return carried;
    }

    function clickToggle(id) {
        const el = document.getElementById(id);
        if (el && el.dataset.value === 'false') {
            el.click();
        }
    }

    function clickSegment(groupId, value) {
        const group = document.getElementById(groupId);
        if (group) {
            const btn = group.querySelector(`.seg-btn[data-value="${value}"]`);
            if (btn && !btn.classList.contains('active')) btn.click();
        }
    }

    function openAccordion(panelId, iconBtnSelector) {
        const panel = document.getElementById(panelId);
        const btn = document.querySelector(iconBtnSelector);
        if (panel) {
            panel.classList.add('open');
            if (btn) btn.setAttribute('aria-expanded', 'true');
        }
    }

    // The previous shift's plan, when it was "discharge pending next bloods". Raised as a
    // prompt for whoever picks the patient up, never as an action: the recommendation was made
    // on yesterday's results by someone who cannot see today's, so the discharge decision still
    // goes through the normal path and its criteria check.
    //
    // Matches the tool's own plan wording first, then looser phrasing for notes typed by hand.
    const PENDING_BLOODS_PLAN = /pending discharge from alert|discharge[^.\n]{0,40}pending[^.\n]{0,20}blood/i;
    const FOLLOWED_BLOODS = /specific bloods being followed:\s*([^\n]+)/i;

    function flagPreviousPlan(text) {
        if (!PENDING_BLOODS_PLAN.test(text)) return;
        const detail = text.match(FOLLOWED_BLOODS);
        if (window.flagPreviousRecommendation) {
            window.flagPreviousRecommendation(detail ? detail[1].trim().replace(/[.\s]+$/, '') : '');
        }
    }

    // Lines that are assessment answers, not devices. Each is read into its own field by the
    // passes above, so it must never also become a device entry.
    const NON_DEVICE_LINE = /^(Mobility|Diet|Nutrition|Sleep|Psychological issues|Post ICU Syndrome|Bowels|Anticoagulation(?:\s*\/\s*VTE)?|VTE Prophylaxis|Infusions|Allergies|GOC|PICS Assessment|Weight|Age|SpO2 target|ADDS|MODS)\s*:/i;

    function processDMR(text) {
        // --- 0. RESET ---
        window.prevBloods = {};
        const carryForward = true; // Always carry forward stable sections

        flagPreviousPlan(text);

        // --- 1. DEMOGRAPHICS ---
        // The name field holds three initials and is capped at three characters in the markup -
        // but maxlength only constrains typing, not assignment, so a scraped note would put a
        // full name straight through it. A DMR note naturally carries the patient's full name,
        // which is exactly the one identifier this tool is built not to hold.
        const ptMatch = text.match(/Patient:\s*([A-Za-z\s,'-]+?)\s*\|/i);
        if (ptMatch) setVal('ptName', toInitials(ptMatch[1]));

        const urnMatch = text.match(/URN:.*?(\d+)/i);
        if (urnMatch) setVal('ptMrn', urnMatch[1].slice(-3));

        const ageMatch = text.match(/Age:\s*(\d+)/i);
        if (ageMatch) setVal('ptAge', ageMatch[1]);

        const weightMatch = text.match(/Weight:\s*(\d+)/i);
        if (weightMatch) setVal('ptWeight', weightMatch[1]);

        // Format: 'Location: 3A, Room: 24B' (from summary.js line 22)
        const locMatch = text.match(/Location:\s*([^,|\n]+?)(?:,\s*(?:Room|Bed):\s*([^|\n]+))?(?:\||\n|$)/i);
        if (locMatch) {
            const ward = locMatch[1].trim();
            const wardSelect = document.getElementById('ptWard');
            let found = false;
            if (wardSelect && !isPlaceholder(ward)) {
                for (let i = 0; i < wardSelect.options.length; i++) {
                    if (wardSelect.options[i].value === ward) {
                        wardSelect.selectedIndex = i;
                        wardSelect.classList.add('scraped-data');
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    wardSelect.value = 'Other';
                    const otherWrapper = document.getElementById('ptWardOtherWrapper');
                    if (otherWrapper) otherWrapper.style.display = 'block';
                    setVal('ptWardOther', ward);
                }
            }
            if (locMatch[2]) setVal('ptBed', locMatch[2].trim());
        } else {
            // A note written with no ward carries the room on its own, with no "Location:" for
            // the pattern above to anchor on.
            const roomOnly = text.match(/(?:^|\|)\s*(?:Room|Bed):\s*([^|\n]+)/i);
            if (roomOnly) setVal('ptBed', roomOnly[1].trim());
        }

        const losMatch = text.match(/ICU LOS:\s*([\d.]+)/i);
        if (losMatch) setVal('icuLos', losMatch[1]);

        const reasonMatch = text.match(/Reason for ICU Admission:\s*(.*)/i);
        if (reasonMatch) setVal('ptAdmissionReason', reasonMatch[1]);

        // Fix: Date parsing handles DD/MM/YYYY and converts to YYYY-MM-DD for input
        const dateMatch = text.match(/(?:Discharge|Stepdown) Date:\s*(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/i);
        if (dateMatch) {
            const day = dateMatch[1].padStart(2, '0');
            const month = dateMatch[2].padStart(2, '0');
            let year = dateMatch[3];
            if (year.length === 2) year = "20" + year;
            const isoDate = `${year}-${month}-${day}`;
            setVal('stepdownDate', isoDate);
        }

        // Parse stepdown time (HH:MM format)
        const timeMatch = text.match(/Stepdown Time:\s*(\d{1,2}:\d{2})/i)
            || text.match(/(?:Discharge|Stepdown) Time:\s*(\d{1,2}:\d{2})/i);
        if (timeMatch) {
            const [h, m] = timeMatch[1].split(':');
            const formatted = `${h.padStart(2, '0')}:${m}`;
            setVal('stepdownTime', formatted);
        }

        // --- 2. CONTEXT ---
        if (carryForward) {
            let contextFound = false;
            const gocMatch = text.match(/GOC:\s*[\(]?(.*?)[\)]?$/m) || text.match(/GOC:\s*(.*)/i);
            if (gocMatch) { setVal('goc_note', gocMatch[1].replace(/^\(|\)$/g, '')); contextFound = true; }

            const allergiesMatch = text.match(/Allergies:\s*(.*)/i);
            if (allergiesMatch) { setVal('allergies_note', allergiesMatch[1]); contextFound = true; }

            const picsMatch = text.match(/PICS Assessment:\s*[\(]?(.*?)[\)]?$/m) || text.match(/PICS Assessment:\s*(.*)/i);
            if (picsMatch) { setVal('pics_note', picsMatch[1].replace(/^\(|\)$/g, '')); contextFound = true; }

            // Regex Improvement: PMH (captures lines starting with - until next section)
            const pmhSection = text.match(/(?:PMH|Significant Past Medical History):([\s\S]*?)(?:A-E ASSESSMENT|PICS|GOC)/i);
            if (pmhSection && pmhSection[1]) {
                const rawPmh = pmhSection[1].split('\n')
                    .map(l => l.trim())
                    .filter(l => l.startsWith('-'))
                    .map(l => l.substring(1).trim())
                    .join('\n');
                if (rawPmh) { setVal('pmh_note', rawPmh); contextFound = true; }
            }

            const otherMatch = text.match(/^Other:\s*([\s\S]*?)(?=\nIDENTIFIED|\nPLAN:|$)/im) || text.match(/Other:\s*(.*)/i);
            if (otherMatch) { setPrev('prev_other_context', otherMatch[1]); }

            if (contextFound) openAccordion('panel_context', '[aria-controls="panel_context"]');
        }

        // --- 3. PREVIOUS DATA (A-E) ---
        const aeBlock = text.match(/A-E ASSESSMENT([\s\S]*?)(?:Bloods:|LINES, DRAINS|DEVICES:)/im) || [null, text];
        const aeText = aeBlock[1];
        if (aeBlock[1]) openAccordion('panel_ae', '[aria-controls="panel_ae"]');

        if (aeText) {
            const addsMatch = aeText.match(/ADDS\s*[:]?\s*(\d+)/i);
            if (addsMatch) setPrev('prev_adds', addsMatch[1]);

            // Use 'A:' (colon only) to avoid matching 'a ' inside words like 'Afebrile', 'ADDS:', etc.
            const airwayMatch = aeText.match(/^A:\s*(.+?)$/m);
            if (airwayMatch) setPrev('prev_airway', airwayMatch[1].trim());

            const rrMatch = aeText.match(/RR\s*(\d+(?:\s*to\s*\d+|\s*-\s*\d+)?)/i);
            if (rrMatch) setPrev('prev_rr', rrMatch[1]);

            const spo2Match = aeText.match(/SpO2\s*(?:above\s*|>)?\s*(\d+%?)/i) || aeText.match(/(\d+%?)\s*SpO2/i);
            if (spo2Match) setPrev('prev_spo2', spo2Match[1]);

            const o2Match = aeText.match(/(RA|(?:\d+L)?NP|HFNP|NIV|Trache)/i);
            if (o2Match) setPrev('prev_o2_dev', o2Match[1]);

            const hrMatch = aeText.match(/HR\s*(\d+s?)/i);
            if (hrMatch) setPrev('prev_hr', hrMatch[1]);

            const bpMatch = aeText.match(/NIBP\s*(\d+\/\d+)/i);
            if (bpMatch) setPrev('prev_bp', bpMatch[1]);

            const tempMatch = aeText.match(/E[:\s]\s*(Afebrile|[\d\.]+)/i);
            if (tempMatch) setPrev('prev_temp', tempMatch[1]);

            const alertMatch = aeText.match(/D[:\s]\s*(.*?)(?=\n|E[:\s])/i);
            if (alertMatch) setPrev('prev_alert', alertMatch[1]);
        }

        if (carryForward) {
            const mobMatch = text.match(/Mobility:\s*(.*)/i);
            if (mobMatch) {
                setVal('ae_mobility', mobMatch[1]);
                // Context worth carrying into the note, but not a risk: 'Mobility: Independent'
                // is good news, and as an amber issue it used to read as a concern.
                if (mobMatch[1].trim() && window.addActiveIssue) {
                    window.addActiveIssue({ text: `Mobility: ${mobMatch[1].trim()}`, source: 'scraped', severity: 'info', key: 'ae_mobility', list: 'factors' });
                }
            }

            const dietMatch = text.match(/Diet:\s*(.*)/i);
            if (dietMatch) {
                setVal('ae_diet', dietMatch[1]);
                if (dietMatch[1].trim() && window.addActiveIssue) {
                    window.addActiveIssue({ text: `Diet: ${dietMatch[1].trim()}`, source: 'scraped', severity: 'info', key: 'ae_diet', list: 'factors' });
                }
            }

            const bowelMatch = text.match(/Bowels:\s*(.*)/i);
            if (bowelMatch) setPrev('prev_bowels', bowelMatch[1]);

            // --- Medication / treatment fields (prev datum, not carry-forward) ---
            // One field now, but three possible headings in the wild: notes written since the
            // merge say "Anticoagulation / VTE:", and every note written before it says
            // "Anticoagulation:" or "VTE Prophylaxis:" or both. All of them land in the one
            // field - a patient reviewed the day before this shipped must not lose the line at
            // changeover, and a note holding both gets both, joined rather than one overwriting
            // the other.
            const anticoagParts = [];
            const mergedMatch = text.match(/Anticoagulation\s*\/\s*VTE:\s*(.*)/i);
            if (mergedMatch) anticoagParts.push(mergedMatch[1].trim());
            else {
                const anticoagMatch = text.match(/Anticoagulation:\s*(.*)/i);
                if (anticoagMatch) anticoagParts.push(anticoagMatch[1].trim());
                const vteMatch = text.match(/VTE Prophylaxis:\s*(.*)/i);
                if (vteMatch) anticoagParts.push(vteMatch[1].trim());
            }
            if (anticoagParts.filter(Boolean).length) {
                setPrev('prev_anticoag', anticoagParts.filter(Boolean).join('; '));
            }

            const infusionsMatch = text.match(/Infusions:\s*(.*)/i);
            if (infusionsMatch) setPrev('prev_infusions', infusionsMatch[1]);

            // --- Psychosocial ghost text (FYI prev datum only, not auto-selected) ---
            const nutritionMatch = text.match(/Nutrition:\s*(.*)/i);
            if (nutritionMatch) setPrev('prev_nutrition', nutritionMatch[1]);

            const picsStatusMatch = text.match(/Post ICU Syndrome:\s*(.*)/i);
            if (picsStatusMatch) setPrev('prev_pics_status', picsStatusMatch[1]);

            const sleepMatch = text.match(/Sleep:\s*(.*)/i);
            if (sleepMatch) setPrev('prev_sleep', sleepMatch[1]);

            const psychMatch = text.match(/Psychological issues:\s*(.*)/i);
            if (psychMatch) setPrev('prev_psych', psychMatch[1]);
        }

        // The patient's own target, carried forward. Without this it resets to unset every
        // review and a COPD patient is silently re-assessed against 94% from day two on.
        // 94% is still matched because notes written before the target became a two-way
        // choice carry it, and it maps to the default rather than being ignored - the two
        // now mean the same thing.
        const spo2TargetMatch = text.match(/SpO2 target:\s*(88\s*-\s*92|94)/i);
        if (spo2TargetMatch) {
            setVal('spo2_target', /94/.test(spo2TargetMatch[1]) ? '' : '88_92');
        }

        // --- 4. BLOODS ---
        // The heading is "Bloods (taken 20/08/2026 06:00):" whenever a collection time was
        // recorded, and this pattern only ever matched a bare "Bloods:". So every note that
        // carried a collection time - which is the ones written since it was added - had its
        // bloods dropped on import in silence, taking the previous values, the trend arrows
        // and every trend-based rule with them. The bracket is optional and non-capturing so
        // both shapes land in the same group.
        const bloodsBlock = text.match(/Bloods\s*(?:\([^)]*\))?:\s*([\s\S]*?)(?:LINES, DRAINS|DEVICES:|IDENTIFIED ICU READMISSION|IDENTIFIED RISK FACTORS|PATIENT FACTORS|Checks:|Other:|PLAN:|A-E ASSESSMENT|Psychosocial|PICS|$)/i);
        if (bloodsBlock) {
            openAccordion('panel_bloods', '[aria-controls="panel_bloods"]');
            const bText = bloodsBlock[1];

            const getB = (regex, id, key) => {
                const m = bText.match(regex);
                if (m) {
                    setPrev(id, m[1]);
                    if (window.prevBloods) window.prevBloods[key] = m[1];
                }
            };

            getB(/Hb\s*(\d+)/i, 'prev_bl_hb', 'hb');
            getB(/WCC\s*([\d\.]+)/i, 'prev_bl_wcc', 'wcc');
            getB(/CRP\s*(\d+)/i, 'prev_bl_crp', 'crp');
            getB(/Cr\s*(\d+)/i, 'prev_bl_cr_review', 'cr_review');
            getB(/eGFR\s*(\d+)/i, 'prev_bl_egfr', 'egfr');
            getB(/Lac\s*([\d\.]+)/i, 'prev_bl_lac_review', 'lac_review');
            getB(/K\s*([\d\.]+)/i, 'prev_bl_k', 'k');
            getB(/Na\s*(\d+)/i, 'prev_bl_na', 'na');
            getB(/Mg\s*([\d\.]+)/i, 'prev_bl_mg', 'mg');
            getB(/PO4\s*([\d\.]+)/i, 'prev_bl_phos', 'phos');
            getB(/Plts\s*(\d+)/i, 'prev_bl_plts', 'plts');
            getB(/Alb\s*(\d+)/i, 'prev_bl_alb', 'alb');
            getB(/Neut\s*([\d\.]+)/i, 'prev_bl_neut', 'neut');
            getB(/Lymph\s*([\d\.]+)/i, 'prev_bl_lymph', 'lymph');
            getB(/Bili\s*(\d+)/i, 'prev_bl_bili', 'bili');
            getB(/ALT\s*(\d+)/i, 'prev_bl_alt', 'alt');
            getB(/INR\s*([\d\.]+)/i, 'prev_bl_inr', 'inr');
            getB(/APTT\s*(\d+)/i, 'prev_bl_aptt', 'aptt');

            // When the previous note recorded when its results were taken, keep it: the gap
            // between two results is what makes a trend mean anything, and the clinician
            // otherwise has to remember it. Stored on prevBloods rather than filled into the
            // date field, which describes today's results, not yesterday's.
            const takenMatch = bText.match(/taken\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i) ||
                text.match(/Bloods taken:\s*([^\n]+)/i);
            if (takenMatch && window.prevBloods) window.prevBloods._takenAt = takenMatch[1].trim();

            // --- Auto-detect worsening Cr ---
            const crMatch = text.match(/Cr\s*(\d+)/i);
            if (crMatch && window.prevBloods && window.prevBloods.cr_review) {
                const prevCr = parseFloat(window.prevBloods.cr_review);
                // Don't auto-click, just set the chip to ready for manual selection
                // Clinician will see prev Cr in the summary and can decide
            }
        }

        // --- 5. RISKS ---
        const risksSection = text.match(/(?:IDENTIFIED ICU READMISSION RISK FACTORS|IDENTIFIED RISK FACTORS):([\s\S]*?)PLAN:/i);

        ['resp', 'neuro', 'renal', 'elec', 'ah', 'pressors', 'immob', 'inf'].forEach(k => {
            const el = document.getElementById(`prev_risk_${k}`);
            if (el) el.textContent = '';
        });

        if (risksSection && risksSection[1]) {
            const riskLines = risksSection[1].split('\n').map(l => l.trim()).filter(l => l.startsWith('-'));
            if (riskLines.length > 0 && !riskLines[0].toLowerCase().includes('none identified')) {
                riskLines.forEach((line, idx) => {
                    const rawTxt = line.substring(1).trim();
                    const lower = rawTxt.toLowerCase();

                    // --- PREV TEXT UPDATES ---
                    if (lower.includes('oxygen') || lower.includes('wean') || lower.includes('tachypnea') || lower.includes('respiratory')) setRiskText('prev_risk_resp', rawTxt);
                    if (lower.includes('neuro') || lower.includes('gcs') || lower.includes('delirium')) setRiskText('prev_risk_neuro', rawTxt);
                    if (lower.includes('renal') || lower.includes('aki') || lower.includes('creatinine')) setRiskText('prev_risk_renal', rawTxt);
                    if (lower.includes('infection') || lower.includes('sepsis') || lower.includes('wcc')) setRiskText('prev_risk_inf', rawTxt);
                    if (lower.includes('electrolyte') || lower.includes('potassium')) setRiskText('prev_risk_elec', rawTxt);
                    if (lower.includes('after-hours')) setRiskText('prev_risk_ah', rawTxt);
                    if (lower.includes('vaso') || lower.includes('pressor')) setRiskText('prev_risk_pressors', rawTxt);
                    if (lower.includes('immobility')) setRiskText('prev_risk_immob', rawTxt);

                    // A risk the previous reviewer considered and discounted comes back saying
                    // so, and nothing else. Carrying it to a gate would set that gate to Yes and
                    // turn a discounted risk into a live one - the mitigation destroyed by the
                    // act of reading it - and the self-derived filter below would swallow the
                    // ones whose wording it recognises. Neither applies to a mitigated line.
                    const mitigatedLine = readCarriedLine(rawTxt);
                    if (mitigatedLine.mitigated) {
                        if (window.addActiveIssue) {
                            window.addActiveIssue({
                                text: mitigatedLine.text, source: 'scraped', severity: 'amber',
                                key: `scraped_risk_${idx}_${mitigatedLine.text.slice(0, 20)}`,
                                list: 'risks', carried: mitigatedLine.carried, mitigated: true
                            });
                        }
                        return;
                    }

                    // --- CARRY THE RISK INTO TODAY'S ASSESSMENT ---
                    // Staging the text alone left the gates unanswered, so a note full of risks
                    // still computed CAT 3. The gate is set to Yes and marked carried-forward:
                    // it counts from the outset, and the clinician clears what has resolved.
                    const carried = carryRiskToGate(lower, rawTxt);

                    // Anything that didn't land on a gate still needs to be seen, so it stays
                    // in the issues list under the previous note's own wording.
                    if (!carried && !SELF_DERIVED_RISK.test(lower) && window.addActiveIssue) {
                        const line = readCarriedLine(rawTxt);
                        window.addActiveIssue({
                            text: line.text, source: 'scraped', severity: 'amber',
                            key: `scraped_risk_${idx}_${line.text.slice(0, 20)}`, list: 'risks',
                            carried: line.carried, mitigated: line.mitigated
                        });
                    }
                });
                if (window.renderScrapedIssuesList) window.renderScrapedIssuesList();
            }
        }

        // --- 5b. PATIENT FACTORS ---
        // The other half of the round trip. Everything the previous reviewer put in the patient
        // factors list comes back into it, so a note that has been through several reviews
        // still carries the context that has been travelling with the patient rather than
        // starting again from whatever this import happens to recognise.
        const factorsSection = text.match(/PATIENT FACTORS:([\s\S]*?)(?:IDENTIFIED|PLAN:)/i);
        if (factorsSection && factorsSection[1] && window.addActiveIssue) {
            factorsSection[1].split('\n')
                .map(l => l.trim())
                .filter(l => l.startsWith('-'))
                .forEach((l, idx) => {
                    const line = readCarriedLine(l.substring(1).trim());
                    if (!line.text) return;
                    // Regenerated from its own field every review - the setPrev/setVal passes
                    // above have already read it into one - so it must not also become text.
                    if (window.FIELD_BACKED_FACTOR?.test(line.text)) return;
                    window.addActiveIssue({
                        text: line.text, source: 'scraped', severity: 'info',
                        key: `scraped_factor_${idx}_${line.text.slice(0, 20)}`, list: 'factors',
                        carried: line.carried
                    });
                });
            if (window.renderScrapedIssuesList) window.renderScrapedIssuesList();
        }

        // --- 6. DEVICES ---
        if (carryForward) {
            // Device header: handle both 'LINES, DRAINS, DEVICES & WOUNDS:' and 'Lines Drains Devices and Wounds:'
            // PATIENT FACTORS was missing from the terminators, and it is the section that
            // immediately follows the devices in every note this tool writes - so mobility,
            // diet, sleep and the psych answer were swallowed by the device block and each
            // came back as an "Other Device". They are read into their own fields elsewhere.
            const devSection = text.match(/(?:^LINES[,\s]+DRAINS.*?DEVICES.*?:|^DEVICES:)([\s\S]*?)(?:^PATIENT FACTORS:|IDENTIFIED|GOC:|PICS:|PLAN:|^Checks:|^Other:)/im);
            if (devSection && devSection[1]) {
                openAccordion('panel_devices', '[aria-controls="panel_devices"]');
                // Split on newlines, then also split any remaining lines that contain ' -' (inline entries)
                const rawLines = devSection[1].split('\n');
                const devLines = [];
                rawLines.forEach(raw => {
                    const trimmed = raw.trim();
                    if (!trimmed || trimmed.endsWith(':') || trimmed.toLowerCase() === 'wounds:') return;
                    // skip date-prefixed journal lines (e.g. "01/04: Day 1")
                    if (/^\d{1,2}[\/\-]\d{1,2}/.test(trimmed)) return;
                    // If line contains multiple devices separated by ' and -' or ' -', split them
                    const subEntries = trimmed.split(/\s+and\s+-|(?<=\w)\s+-(?=[A-Z])/i);
                    subEntries.forEach(e => { if (e.trim()) devLines.push(e.trim()); });
                });
                devLines.forEach(line => {
                    // Remove leading dash if present
                    let txt = line.startsWith('-') ? line.substring(1).trim() : line;
                    if (txt.toLowerCase().includes('nil')) return;
                    // Second guard, for notes typed by hand or written by an older version,
                    // where these lines can sit inside the device block with no PATIENT
                    // FACTORS heading to stop at. A device is not a labelled assessment
                    // answer, and every one of these already has a field of its own.
                    if (NON_DEVICE_LINE.test(txt)) return;

                    let type = "Other Device";
                    let det = txt;
                    let insertionDate = '';

                    const insertedMatch = txt.match(/inserted\s*[:]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
                    if (insertedMatch) {
                        const rawDate = insertedMatch[1];
                        if (rawDate.includes('-') && rawDate.split('-')[0].length === 4) {
                            insertionDate = rawDate;
                        } else {
                            const parts = rawDate.split(/[\/\-]/);
                            const day = parts[0].padStart(2, '0');
                            const month = parts[1].padStart(2, '0');
                            let year = parts[2];
                            if (year.length === 2) year = '20' + year;
                            insertionDate = `${year}-${month}-${day}`;
                        }
                    }

                    const dwellMatch = txt.match(/dwell\s*(\d+)\s*days?/i) || txt.match(/(\d+)\s*days?\s*dwell/i);
                    if (!insertionDate && dwellMatch) {
                        const dwellDays = parseInt(dwellMatch[1], 10);
                        if (!isNaN(dwellDays)) {
                            const now = new Date();
                            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dwellDays);
                            const yyyy = d.getFullYear();
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            const dd = String(d.getDate()).padStart(2, '0');
                            insertionDate = `${yyyy}-${mm}-${dd}`;
                        }
                    }

                    const known = ['CVC', 'PICC', 'Other CVAD', 'PIVC', 'Arterial Line', 'Enteral Tube', 'IDC', 'Drain', 'Wound', 'Pacing Wire', 'Vascath', 'SPC', 'NG Tube'];
                    for (let k of known) {
                        if (txt.startsWith(k)) {
                            // Map aliases to official types
                            if (k === 'SPC') type = 'IDC';
                            else if (k === 'NG Tube') type = 'Enteral Tube';
                            else type = k;

                            // Remove the device type prefix, any trailing colons/dashes, and trim
                            det = txt.substring(k.length).replace(/^[\s:-]+/, '').replace(/^\(|\)$/g, '').trim();
                            break;
                        }
                    }
                    if (det) {
                        det = det
                            .replace(/\(.*?inserted\s*[:]?.*?\)/gi, '')
                            .replace(/inserted\s*[:]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi, '')
                            .replace(/,?\s*dwell\s*\d+\s*days?/gi, '')
                            .replace(/,?\s*\d+\s*days?\s*dwell/gi, '')
                            .replace(/,?\s*\d+d\s*long\s*dwell/gi, '')
                            .replace(/,?\s*\d+d\s*dwell/gi, '')
                            .replace(/\s*-\s*$/g, '')
                            .replace(/,\s*,/g, ',')
                            .replace(/^,\s*|,\s*$/g, '')
                            .trim();
                    }

                    if (window.addDevice) window.addDevice(type, det, insertionDate);
                });
            }
        }

        // --- QUICK REVIEW DETECTION ---
        // Extract category from imported note
        const catMatch = text.match(/ALERT Nursing Review Category - (CAT \d+)/i);

        // Check if imported DMR is from a pre-stepdown review
        const isPreStepdownImport = text.match(/Pre-Stepdown Review/i);

        if (catMatch) {
            const categoryText = catMatch[1]; // e.g., "CAT 2"

            let category = 'green';
            if (categoryText.includes('CAT 1')) category = 'red';
            else if (categoryText.includes('CAT 2')) category = 'amber';

            // Parse which specific risks were flagged in the imported note
            const identifiedRisks = text.match(/IDENTIFIED ICU READMISSION RISK FACTORS:([\s\S]*?)(?=PLAN:|$)/i);
            const previousRisks = [];
            if (identifiedRisks && identifiedRisks[1]) {
                const riskText = identifiedRisks[1].toLowerCase();
                if (riskText.includes('respiratory') || riskText.includes('oxygen') || riskText.includes('o2')) previousRisks.push('respiratory');
                if (riskText.includes('confusion') || riskText.includes('delirium') || riskText.includes('neuro')) previousRisks.push('neuro');
                if (riskText.includes('renal') || riskText.includes('aki') || riskText.includes('kidney')) previousRisks.push('renal');
                if (riskText.includes('infection') || riskText.includes('sepsis')) previousRisks.push('infection');
                if (riskText.includes('vasoactive') || riskText.includes('pressor') || riskText.includes('inotrope')) previousRisks.push('vasoactive');
                if (riskText.includes('immobility') || riskText.includes('mobility')) previousRisks.push('immobility');
                if (riskText.includes('nutrition') || riskText.includes('feeding')) previousRisks.push('nutrition');
                if (riskText.includes('electrolyte')) previousRisks.push('electrolyte');
            }

            // Calculate CURRENT hours on ward based on stepdown date/time
            // Use the imported stepdownDate (already set above) and get stepdownTime from form
            setTimeout(() => {
                // Get stepdown time from the new time input
                const stepdownTimeEl = document.getElementById('stepdownTime');
                let stepdownTime = stepdownTimeEl?.value || null;

                // Default to 16:00 if no time specified
                let hour = 16;
                let minute = 0;
                if (stepdownTime && stepdownTime.includes(':')) {
                    const parts = stepdownTime.split(':');
                    hour = parseInt(parts[0], 10);
                    minute = parseInt(parts[1], 10);
                }

                let currentHoursOnWard = 0;
                const stepdownDate = document.getElementById('stepdownDate')?.value;
                if (stepdownDate) {
                    const [y, m, d] = stepdownDate.split('-');
                    const stepdownDateTime = new Date(y, m - 1, d, hour, minute);
                    const now = new Date();
                    const diffMs = now - stepdownDateTime;
                    currentHoursOnWard = diffMs / (1000 * 60 * 60);
                }

                // Store for later use
                if (window.previousCategoryData !== undefined) {
                    window.previousCategoryData = { category, hoursOnWard: currentHoursOnWard, categoryText, previousRisks };
                }

                // Determine if quick review should be offered:
                // - Pre-stepdown DMR import: Only offer for CAT 3 (patient hasn't been on ward yet)
                // - Post-stepdown DMR import: Offer for CAT 2 or CAT 3 (indicates follow-up review)
                // - CAT 1 (red): Never offer quick review (always needs full assessment)
                let shouldOfferQuickReview = false;
                if (category === 'red') {
                    shouldOfferQuickReview = false; // CAT 1 always needs full review
                } else if (isPreStepdownImport) {
                    // Pre-stepdown import: only CAT 3 gets quick review
                    shouldOfferQuickReview = (category === 'green' && currentHoursOnWard > 0 && previousRisks.length > 0);
                } else {
                    // Post-stepdown import: CAT 2 or CAT 3 get quick review (confirms it's a follow-up)
                    shouldOfferQuickReview = (currentHoursOnWard > 0 && previousRisks.length > 0);
                }

                if (shouldOfferQuickReview && window.showQuickReviewPrompt) {
                    window.showQuickReviewPrompt(categoryText, currentHoursOnWard, previousRisks);
                }
            }, 1000);
        }

        const t = document.getElementById('toast');
        if (t) { t.textContent = "Data Imported Successfully"; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); }
    }
});