/* =========================================
   ALERT Nursing Risk Assessment Tool
   Output: DMR note and Excel handover line
   Copyright © 2025-2026 Casey Bond
   MIT License - https://opensource.org/licenses/MIT
   ========================================= */

import { $, nowTimeStr, todayDateStr, formatDateDDMMYYYY, num, toDmrSafeText, wardLabel } from './utils.js';
import { comorbMap, NOTE_BLOOD_LABELS } from './config.js';

export function generateSummary(s, cat, wardTimeTxt, red, amber, suppressed, activeComorbsKeys, lists = {}) {

    const sum = $('summary');

    // Clear device modified flag when summary is generated
    window.devicesModifiedSinceLastSummary = false;

    const lines = [];
    const addLine = (txt) => { if (txt) lines.push(txt); };
    // Collapses accidental double blank lines so sections are separated by exactly one break.
    const pushBlank = () => { if (lines.length && lines[lines.length - 1] !== '') lines.push(''); };
    const role = s.clinicianRole;
    const reviewName = (s.reviewType === 'pre') ? 'Pre-Stepdown' : 'post ICU review';

    // Whether the patient was seen or only their chart was read changes how the note should
    // be read, so it sits in the heading rather than buried further down.
    const methodName = (s.reviewModeType === 'chart') ? 'Chart review' : 'Physical review';

    if (s.reviewType === 'pre') {
        lines.push(`${role} Pre-Stepdown Review - ${methodName}`);
    } else {
        lines.push(`${role} ${reviewName} - ${methodName}`);
    }

    // Only what's actually known. This line used to print "Patient: -- | URN: ... | Location:
    // --, Room: --" on a half-filled form, which reads as a sloppy note rather than an
    // incomplete one - the dashes said nothing the absence of the field wouldn't have.
    const idParts = [];
    if (s.ptName) idParts.push(`Patient: ${s.ptName}`);
    if (s.ptMrn) idParts.push(`URN: ...${s.ptMrn}`);
    // Ward and room stay in the "Location: <ward>, Room: <bed>" shape the importer reads back.
    // With no ward there is nothing for "Location:" to name, so the room stands alone.
    const ward = wardLabel(s);
    if (ward) idParts.push(`Location: ${ward}${s.ptBed ? `, Room: ${s.ptBed}` : ''}`);
    else if (s.ptBed) idParts.push(`Room: ${s.ptBed}`);
    if (idParts.length) lines.push(idParts.join(' | '));

    let demo = [];
    if (s.ptAge) demo.push(`Age: ${s.ptAge}`);
    if (s.ptWeight) demo.push(`Weight: ${s.ptWeight}kg`);
    // Only the lower target is written down. The tool reads anything else as 94%, and printing
    // that would put a target in the record that nobody set - on a COPD patient the next
    // reviewer would import it and inherit a wrong one as though it had been documented.
    // 88-92% is the exception worth carrying: it is the one that changes how the saturation
    // should be read, and the one that is easy to lose between notes.
    if (s.spo2_target === '88_92') demo.push('SpO2 target: 88-92%');
    if (demo.length) lines.push(demo.join(', '));

    lines.push(`Time of review: ${s.reviewTime || nowTimeStr()}`);

    if (s.reviewType === 'pre') {
        lines.push(`Stepdown Date: Today (${todayDateStr()})`);
    } else if (s.stepdownDate) {
        lines.push(`ICU Discharge Date: ${formatDateDDMMYYYY(s.stepdownDate)}`);
    }
    pushBlank();

    if (wardTimeTxt && s.reviewType !== 'pre') lines.push(`Time since stepdown: ${wardTimeTxt}`);
    if (s.icuLos) lines.push(`ICU LOS: ${s.icuLos} days`);
    if (s.ptAdmissionReason) lines.push(`Reason for ICU Admission: ${s.ptAdmissionReason}`);

    if (s.reviewType === 'pre' && s.icuSummary) {
        pushBlank();
        lines.push(`ICU Course Summary: ${s.icuSummary}`);
    }
    pushBlank();

    if (s.stepdown_suitable === false) {
        lines.push(`ALERT Nursing Review Category - Not suitable for stepdown`);
        pushBlank();
        lines.push('Assessed as not presently suitable for ward stepdown.');
        lines.push(`Reason: ${s.unsuitable_note || 'Clinical concerns (see notes)'}`);
        pushBlank();
        lines.push('--- FULL ASSESSMENT BELOW ---');
        pushBlank();
    } else {
        lines.push(`ALERT Nursing Review Category - ${cat.text}`);
        // The category line stands on its own. A manual selection is not annotated in the note:
        // it reads as second-guessing the clinician who made it, and the flags that produced the
        // auto-calculated category are listed below regardless.
        if (s.stepdown_suitable === true && s.reviewType === 'pre') {
            lines.push('Patient is suitable for ward stepdown.');
        }
        pushBlank();
    }

    // PMH: read chips directly AND pmh_note, deduplicate
    const pmhItems = [];
    const pmhSeen = new Set();
    // First: add active chip names
    activeComorbsKeys.forEach(k => {
        if (k === 'comorb_other') {
            if (!s.comorb_other_note) return; // skip "Other" with no text
            // Split by comma or newline — each sub-item is a separate PMH entry
            s.comorb_other_note.trim().split(/[\n,]+/).forEach(part => {
                const name = part.trim();
                if (name && !pmhSeen.has(name.toLowerCase())) {
                    pmhSeen.add(name.toLowerCase());
                    pmhItems.push(name);
                }
            });
        } else {
            const name = comorbMap[k];
            if (name && !pmhSeen.has(name.toLowerCase())) {
                pmhSeen.add(name.toLowerCase());
                pmhItems.push(name);
            }
        }
    });
    // Second: add any extra lines from pmh_note that aren't already listed
    if (s.pmh_note) {
        s.pmh_note.split('\n').forEach(p => {
            const trimmed = p.trim().replace(/^-/, '').trim();
            if (trimmed && !pmhSeen.has(trimmed.toLowerCase())) {
                pmhSeen.add(trimmed.toLowerCase());
                pmhItems.push(trimmed);
            }
        });
    }
    if (pmhItems.length > 0) {
        lines.push('PMH:');
        pmhItems.forEach(item => lines.push(`-${item}`));
        pushBlank();
    }

    if (s.allergies_note) {
        lines.push(`Allergies: ${s.allergies_note}`);
        pushBlank();
    }

    if (s.goc_note) {
        lines.push(`GOC: ${s.goc_note}`);
        pushBlank();
    }

    // The header is provisional until something lands beneath it - see the truncate below.
    // addLine() only skips an empty string, and `ADDS: ${undefined}` is not one, so a form with
    // no score still emitted a bare "ADDS: ".
    const aeHeaderAt = lines.length;
    lines.push('A-E ASSESSMENT:');
    if (s.chk_use_mods) { if (s.mods_score) addLine(`MODS: ${s.mods_score}${s.mods_details ? ` (${s.mods_details})` : ''}`); }
    else if (s.adds) addLine(`ADDS: ${s.adds}`);
    // Where the A-E lines start, so a note carrying only a score can drop the heading below.
    const aeDetailAt = lines.length;

    if (s.airway_a) addLine(`A: ${s.airway_a}`);
    else if (s.a_comment) addLine(`A:`);
    if (s.a_comment) addLine(`  - ${s.a_comment}`);

    let b = [];
    if (s.b_rr) b.push(`RR ${s.b_rr}`);
    if (s.b_spo2) b.push(`SpO2 ${s.b_spo2}`);
    if (s.b_device) b.push(s.b_device);
    if (s.b_wob) b.push(`WOB: ${s.b_wob}`);
    if (s.b_cough) b.push(`Cough: ${s.b_cough}`);
    if (b.length) addLine(`B: ${b.join(', ')}`);
    else if (s.b_comment) addLine(`B:`);
    if (s.b_comment) addLine(`  - ${s.b_comment}`);

    let c = [];
    if (s.c_hr) c.push(`HR ${s.c_hr}${s.c_hr_rhythm ? ` (${s.c_hr_rhythm})` : ''}`);
    if (s.c_nibp) c.push(`NIBP ${s.c_nibp}`);
    if (s.c_cr) c.push(`CR ${s.c_cr}`);
    if (s.c_perf) c.push(`Perf ${s.c_perf}`);
    if (c.length) addLine(`C: ${c.join(', ')}`);
    else if (s.c_comment) addLine(`C:`);
    if (s.c_comment) addLine(`  - ${s.c_comment}`);

    let d = [];
    if (s.d_alert) d.push(s.d_alert);
    if (s.d_pain) {
        if (s.d_pain.toLowerCase() === 'no pain') {
            d.push('No pain');
        } else {
            d.push(`Pain: ${s.d_pain}`);
        }
    }
    if (d.length) addLine(`D: ${d.join(', ')}`);
    else if (s.d_comment) addLine(`D:`);
    if (s.d_comment) addLine(`  - ${s.d_comment}`);

    let e = [];
    if (s.e_temp) e.push(`Temp ${s.e_temp}`);
    if (s.e_uop) e.push(`UOP ${s.e_uop}`);
    if (s.e_bsl) e.push(`BSL ${s.e_bsl}`);
    if (e.length) addLine(`E: ${e.join(', ')}`);
    else if (s.e_comment) addLine(`E:`);
    if (s.e_comment) addLine(`  - ${s.e_comment}`);

    // Nothing was recorded under A-E, so take the header back off.
    if (lines.length === aeHeaderAt + 1) lines.length = aeHeaderAt;
    // A score on its own - the usual shape of a Quick Review - needs no heading announcing an
    // assessment that isn't there. The score line stands by itself.
    else if (lines.length === aeDetailAt) lines.splice(aeHeaderAt, 1);

    pushBlank();

    // Mobility, diet and the psychosocial answers used to print here, scattered through the
    // assessment. They are now gathered under PATIENT FACTORS - see buildPatientFactors() -
    // because that is what they are, and because one headed section is something the next
    // import can read back whole.

    let bowelTxt = '';
    if (s.bowel_mode === 'btn_bo') bowelTxt = 'BO';
    else if (s.bowel_mode === 'btn_bno') bowelTxt = 'BNO';

    if (s.chk_unknown_blo_date && s.bowel_mode === 'btn_bno') {
        bowelTxt += ', unknown when BLO';
    } else if (s.bowel_date) {
        const bd = new Date(s.bowel_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        bd.setHours(0, 0, 0, 0);
        const daysDiff = Math.floor((today - bd) / (1000 * 60 * 60 * 24));

        if (s.bowel_mode === 'btn_bo') {
            if (daysDiff === 0) {
                bowelTxt += `, today (${bd.getDate()}/${bd.getMonth() + 1})`;
            } else if (daysDiff === 1) {
                bowelTxt += `, yesterday (${bd.getDate()}/${bd.getMonth() + 1})`;
            } else {
                bowelTxt += `, ${daysDiff} days ago (${bd.getDate()}/${bd.getMonth() + 1})`;
            }
        } else if (s.bowel_mode === 'btn_bno') {
            if (daysDiff === 0) {
                bowelTxt += `. Last opened today (${bd.getDate()}/${bd.getMonth() + 1})`;
            } else if (daysDiff === 1) {
                bowelTxt += `. Last opened yesterday on ${bd.getDate()}/${bd.getMonth() + 1}`;
            } else {
                bowelTxt += `. Last opened ${daysDiff} days ago on ${bd.getDate()}/${bd.getMonth() + 1}`;
            }
        }
    }
    if (s.chk_aperients && s.bowel_mode === 'btn_bno') bowelTxt += '. On aperients';
    if (s.ae_bowels) {
        if (s.bowel_mode === 'btn_bo') {
            bowelTxt += `, type ${s.ae_bowels}`;
        } else {
            bowelTxt += `. ${s.ae_bowels}`;
        }
    }

    if (bowelTxt) addLine(`Bowels: ${bowelTxt}`);

    if (s.nutrition_adequate === false) addLine(`Nutrition: Inadequate${s.nutrition_context_note ? ` - ${s.nutrition_context_note}` : ''}`);
    else if (s.nutrition_adequate === true) addLine(`Nutrition: Adequate`);


    // One line where there were two. The heading keeps both words so a reader who is looking
    // for the prophylaxis still finds it, and so the importer has a name to match on.
    if (s.anticoag_note) addLine(`Anticoagulation / VTE: ${s.anticoag_note}`);
    if (s.infusions_note) addLine(`Infusions: ${s.infusions_note}`);

    pushBlank();

    // CRP was missing from this map entirely, so however high it was it never reached the note -
    // it could open the infection gate and be quoted inside "Infection risk - CRP 250", but the
    // value itself was never written down. It sits beside WCC, where it is read.
    const blMap = NOTE_BLOOD_LABELS;
    if (s.chk_bloods_nil_sig || s.bloods_status === 'nil_sig') {
        addLine('Bloods: Checked, nil significant');
    } else if (s.bloods_status === 'improving') {
        addLine('Bloods: Improving trend');
    } else if (s.bloods_status === 'not_checked') {
        addLine('Bloods: Not checked this review');
    } else {
        const blLines = [];
        Object.keys(blMap).forEach(key => {
            const currentVal = s[`bl_${key}`];
            const prevVal = window.prevBloods ? window.prevBloods[key] : null;
            if (currentVal) {
                let str = `${blMap[key]} ${currentVal}`;
                if (prevVal && prevVal !== currentVal) str += ` (${prevVal})`;
                // A clotting result is uninterpretable without knowing what it was aimed at,
                // so the target travels with the value into the note.
                const target = (key === 'inr' ? s.inr_target : key === 'aptt' ? s.aptt_target : '') || '';
                if (target.trim()) str += ` target ${target.trim()}`;
                blLines.push(str);
            }
        });
        if (blLines.length) {
            // The collection time travels with the values. Without it, the next reviewer
            // comparing against these numbers cannot tell whether a change happened overnight
            // or over four days.
            let taken = '';
            if (s.bloods_date) {
                taken = formatDateDDMMYYYY(s.bloods_date);
                if (s.bloods_time) taken += ` ${s.bloods_time}`;
            }
            addLine(`Bloods${taken ? ` (taken ${taken})` : ''}: ${blLines.join(', ')}`);
        }
    }
    if (s.new_bloods_ordered === 'ordered') addLine('New bloods ordered for next round');
    if (s.new_bloods_ordered === 'requested') addLine('New bloods requested (not yet ordered)');
    if (s.new_bloods_ordered === 'not_required') addLine('New bloods not required');
    if (s.elec_replace_note) addLine(`Electrolyte Plan: ${s.elec_replace_note}`);
    pushBlank();

    // The tool's own reading of today's numbers. Not risks - a clotting result sitting where
    // the team wants it, an electrolyte low enough to replace - so they get their own line
    // rather than a place among the readmission risks.
    const checks = lists.checks || [];
    if (checks.length) {
        addLine(`Checks: ${checks.join('; ')}`);
        pushBlank();
    }

    const hasAnyDevices = Object.values(s.devices || {}).some(arr => arr.length);
    if (hasAnyDevices) {
        lines.push('LINES, DRAINS, DEVICES & WOUNDS:');
        const trackedDevices = ['CVC', 'PICC', 'PIVC', 'Other CVAD', 'IDC', 'Vascath'];
        Object.entries(s.devices).forEach(([k, v]) => {
            v.forEach(item => {
                let deviceLine = `- ${k}`;

                if (item.insertionDate && trackedDevices.includes(k)) {
                    const deviceDate = new Date(item.insertionDate + 'T00:00:00');
                    const dwellDays = Math.floor((new Date() - deviceDate) / (1000 * 60 * 60 * 24));

                    if (item.details) deviceLine += ` - ${item.details}`;

                    // The day count is the clinical fact and speaks for itself; "long dwell"
                    // only editorialised it. The device card on-screen still colours the
                    // ones past their review threshold.
                    deviceLine += ` - ${dwellDays}d dwell`;

                    const bd = new Date(item.insertionDate);
                    deviceLine += `, inserted ${bd.getDate()}/${bd.getMonth() + 1}/${bd.getFullYear().toString().slice(-2)}`;
                } else {
                    if (item.details) deviceLine += ` - ${item.details}`;
                    if (item.insertionDate) {
                        const bd = new Date(item.insertionDate);
                        deviceLine += ` - inserted ${bd.getDate()}/${bd.getMonth() + 1}/${bd.getFullYear().toString().slice(-2)}`;
                    }
                }
                lines.push(deviceLine);
            });
        });
    }
    pushBlank();

    if (s.context_other_note) lines.push(`Other: ${s.context_other_note}`);
    pushBlank();

    // Two headed sections, both written so the importer can read them straight back next
    // review. That round trip is the point: a risk confirmed today has to still be here
    // tomorrow, whether it came from a gate, from the previous note, or from the clinician.
    //
    // Deduplication is by text within each section, and the Quick Notes box empties into
    // patient factors - it is where clinicians write the things that describe the patient.
    const sectionLines = (items) => {
        const out = [];
        const seen = new Set();
        items.forEach(t => {
            const txt = (t || '').trim().replace(/^[-•]\s*/, '');
            if (txt && !seen.has(txt.toLowerCase())) { seen.add(txt.toLowerCase()); out.push(txt); }
        });
        return out;
    };

    // The assessment answers that describe the patient rather than the review, in a fixed
    // order so the section reads the same way every day. Written as "Field: value" because
    // that is the shape the importer already reads them back into their own fields from.
    const buildPatientFactors = () => {
        const out = [];
        if (s.ae_mobility) out.push(`Mobility: ${s.ae_mobility}`);
        if (s.ae_diet) out.push(`Diet: ${s.ae_diet}`);
        if (s.nutrition_adequate === false) out.push(`Nutrition: Inadequate${s.nutrition_context_note ? ` - ${s.nutrition_context_note}` : ''}`);
        else if (s.nutrition_adequate === true) out.push('Nutrition: Adequate');
        if (s.pics) out.push(`Post ICU Syndrome: ${s.pics === 'positive' ? 'Positive' : 'Negative'}${s.pics_note ? ` - ${s.pics_note}` : ''}`);
        if (s.sleep_quality === true) out.push(`Sleep: Poor${s.sleep_quality_note ? ` - ${s.sleep_quality_note}` : ''}`);
        else if (s.sleep_quality === false) out.push('Sleep: No sleep issues identified');
        if (s.neuro_psych === true) out.push(`Psychological issues: ${s.neuro_psych_note || 'Concerns identified'}`);
        else if (s.neuro_psych === false) out.push('Psychological issues: Nil identified');
        return out;
    };

    const factorLines = sectionLines([
        ...buildPatientFactors(),
        ...(lists.factors || []),
        ...(s.quickNotes || '').split('\n')
    ]);
    if (factorLines.length) {
        lines.push('PATIENT FACTORS:');
        factorLines.forEach(t => lines.push(`- ${t}`));
        pushBlank();
    }

    lines.push('IDENTIFIED ICU READMISSION RISK FACTORS:');
    // One list, not two. Risks that were considered and discounted stay in it and carry their
    // reason inline - "(mitigated: ...)" - so the note says what didn't count and why without
    // splitting the reader's attention across two sections, and so the importer can bring
    // them back next review still marked as mitigated rather than as live again.
    //
    // Computed risks come first, in the rules' own wording, because they are what drove the
    // category. Carried and typed risks follow: they belong under this heading so they survive
    // into the next note, which they did not when they were loose bullets further up.
    const riskLines = sectionLines([...red, ...amber, ...suppressed, ...(lists.risks || [])]);
    if (riskLines.length) { riskLines.forEach(r => lines.push(`- ${r}`)); }
    else { lines.push('- None identified'); }
    pushBlank();

    lines.push('PLAN:');

    if (s.stepdown_suitable === false) {
        lines.push(`- ICU senior review requested - patient not currently suitable for ward stepdown.`);
        lines.push(`- Please contact ALERT for review when appropriate.`);
    } else if (s.chk_discharge_alert) {
        lines.push(`- Discharged from the ALERT nursing list. Please contact ALERT if further support is required.`);
    } else if (s.chk_discharge_pending_bloods) {
        let text = `- Discharge from the ALERT post ICU list is pending the next blood results. ALERT will review them; if no action is required the patient will be discharged and no further note added.`;
        if (s.discharge_pending_bloods_note && s.discharge_pending_bloods_note.trim()) {
            text += `\n- Specific bloods being followed: ${s.discharge_pending_bloods_note.trim()}`;
        }
        lines.push(text);
    } else {
        // No hours in the record. The 24/48/72h ladder is ALERT's internal scheduling and
        // depends on staffing, so stating it in the DMR reads as a commitment the service may
        // not be able to keep - and it can say 48h on a patient the next review will discharge.
        // The ladder stays on screen for the clinician's own planning.
        lines.push('- ALERT nursing post ICU reviews continue.');
    }

    if (s.chk_medical_rounding) {
        // "Added" is only true of a reviewer who can add them. An ALERT nurse holds the medical
        // POC list in the DMR and puts the patient on it themselves; an ICU CNS or CNC has no
        // access to it, so at the moment their note is written nothing has been added - a call
        // to the ALERT CN is still outstanding. The note says which of the two happened, so
        // that a reader who finds the patient absent from the list knows whether that is an
        // error or simply the next step.
        lines.push(String(s.clinicianRole || '').startsWith('ICU')
            ? '- Referred for ALERT medical rounding - ALERT CN to be contacted.'
            : '- Patient added to ALERT medical rounding list for further review.');
    }

    if (!s.chk_discharge_alert && !s.chk_discharge_pending_bloods && s.stepdown_suitable !== false) {
        lines.push('- Please contact ALERT if further support is required between reviews.');
    }

    if (sum) {
        sum.classList.add('script-updating');
        // Flattened to ASCII on the way out - see toDmrSafeText. The \b escapes in the NLR
        // replacement used to be doubled, so the pattern looked for a literal backslash-b and
        // never matched anything.
        sum.value = toDmrSafeText(lines.join('\n')).replace(/\bnlr\b/g, 'NLR');
        sum.classList.remove('script-updating');
        const badge = $('manual_edit_badge');
        if (badge) badge.style.display = 'none';
    }
}

// --- Excel handover line -----------------------------------------------------
// One terse line for the handover spreadsheet, identical in full and Quick Review since both
// modes feed the same computed risks:
//   "30/7 05:30 CB. Physical r/v. ADDS 4. Bloods: Cr 180, Mg 0.4. CAT 1 - Renal concern,
//    Infection risk (improving)."
// Time and initials lead, then the score, then what was actually found.

// Risk wording is written for the DMR note, which is wordier than a spreadsheet cell needs.
const HANDOVER_RISK_TRIMS = [
    [/^Elevated (ADDS|MODS) /, '$1 '],
    [/, increased risk of complications$/, ''],
    [/ concern - /, ' - '],
    [/^Comorbidities - /, 'PMH: ']
];

function trimRiskForHandover(text) {
    return HANDOVER_RISK_TRIMS.reduce((acc, [re, rep]) => acc.replace(re, rep), text).trim();
}

export function generateHandoverLine(s, activeIssuesList = [], cat = null, red = [], amber = []) {
    const now = new Date();
    const dateStr = `${now.getDate()}/${now.getMonth() + 1}`;
    // Upper-cased on read: the field only *displays* uppercase, via CSS, so the stored value
    // is whatever was typed and this column is scanned by eye.
    // The one place the reviewer's initials go. Omitted rather than stubbed when they were not
    // entered: this line is pasted into a shared sheet, and a column of '--' reads as a
    // reviewer nobody can trace rather than as a field left blank.
    const initials = (s.reviewerInitials || '').toUpperCase();
    const time = s.reviewTime || nowTimeStr();
    const parts = [initials ? `${dateStr} ${time} ${initials}.` : `${dateStr} ${time}.`];

    // Upper case because this is the column people scan when deciding whether a patient has
    // actually been laid eyes on - a CAT 3 discharge shouldn't rest on chart reviews alone,
    // and the spreadsheet is where that history lives.
    parts.push(s.reviewModeType === 'chart' ? 'CHART R/V.' : 'PHYSICAL R/V.');
    parts.push(s.chk_use_mods ? `MODS ${s.mods_score || '--'}.` : `ADDS ${s.adds || '--'}.`);

    if (s.chk_bloods_nil_sig || s.bloods_status === 'nil_sig') parts.push('Bloods nil sig.');
    else if (s.bloods_status === 'improving') parts.push('Bloods improving.');
    else if (s.bloods_status === 'not_checked') parts.push('Bloods not checked.');
    else {
        const abnormal = activeIssuesList
            .filter(i => (i.key || '').startsWith('bl_'))
            .map(i => i.text.replace(/^Abnormal /, ''));
        if (abnormal.length) parts.push(`Bloods: ${abnormal.join(', ')}.`);
        else if (Object.keys(s).some(k => k.startsWith('bl_') && s[k])) parts.push('Bloods reviewed.');
    }

    // The computed flags are the risks; manual and scraped list entries are added after them
    // so anything typed during the review is handed over too. Notes are context, not risks.
    // The score is already stated up front, so its own flag would just repeat it.
    const risks = [...red, ...amber]
        .filter(r => !/^(Elevated )?(ADDS|MODS) \d/.test(r))
        .map(trimRiskForHandover);
    const seen = new Set(risks.map(r => r.toLowerCase()));
    activeIssuesList.forEach(issue => {
        if (issue.severity === 'info' || issue.source === 'auto' || issue.source === 'bloods') return;
        const txt = trimRiskForHandover(issue.text);
        if (seen.has(txt.toLowerCase())) return;
        seen.add(txt.toLowerCase());
        risks.push(txt);
    });

    const catText = cat?.text || $('catText')?.textContent || '';
    // Semicolons between risks: a typed entry can contain commas of its own.
    if (catText) parts.push(risks.length ? `${catText} - ${risks.join('; ')}.` : `${catText} - nil risks.`);

    if (s.stepdown_suitable === false) parts.push('Not suitable for stepdown.');
    else if (s.chk_discharge_alert) parts.push('D/C from ALERT.');
    else if (s.chk_discharge_pending_bloods) parts.push('D/C pending bloods.');
    // Continuing ALERT is not stated: a patient still on this sheet is still being reviewed,
    // because discharging them moves them to a different sheet. Only the exceptions are worth
    // a cell. The checkbox itself stays - it still drives the REDCap outcome.
    if (s.chk_medical_rounding) parts.push('+ Medical rounding.');

    // Same ASCII flattening as the note: this line is pasted into the handover spreadsheet and
    // inherits its wording from the same risk text.
    return toDmrSafeText(parts.join(' ')).replace(/\s{2,}/g, ' ');
}
