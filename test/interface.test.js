import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTool, tick, type, click, generateNote } from './harness.js';
import { iconSetForPath } from '../src/js/utils.js';
import { readFileSync } from 'node:fs';

// Interface tests, against the real index.html and the real built bundle.
//
// jsdom has no layout engine, so nothing here can tell you whether the page *looks* right -
// that still needs a human and a browser. What it can prove is that the wiring is connected:
// that a control exists, that clicking it does what it claims, and that the things removed
// over the last few batches are genuinely gone rather than merely hidden.
//
// Run against dist/bundle.js, so `npm run build` has to have happened first.

test('page loads and the tool initialises', async () => {
    const { document, close } = await loadTool();
    assert.ok(document.getElementById('catText'), 'category display exists');
    assert.equal(document.getElementById('catText').textContent, 'CAT 3', 'starts at CAT 3');
    close();
});

test('every input and textarea opts out of browser autofill', async () => {
    const { document, close } = await loadTool();
    const fields = [...document.querySelectorAll('input, textarea')];
    const missing = fields.filter(el => el.getAttribute('autocomplete') !== 'off');
    assert.ok(fields.length > 100, `sanity: found ${fields.length} fields`);
    assert.deepEqual(missing.map(el => el.id || '(no id)'), [],
        'includes fields injected by plugins after startup');
    close();
});

test('spellcheck is disabled, so browsers cannot send free text to a remote checker', async () => {
    const { document, close } = await loadTool();
    const checked = [...document.querySelectorAll('textarea')].filter(el => el.getAttribute('spellcheck') !== 'false');
    assert.deepEqual(checked.map(el => el.id), []);
    close();
});

test('typing a risk factor moves the category', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptAge', '82');
    await tick(window);
    assert.equal(document.getElementById('catText').textContent, 'CAT 2');
    type(window, 'c_hr', '140');
    await tick(window);
    assert.equal(document.getElementById('catText').textContent, 'CAT 1');
    close();
});

test('the notice region shows one notice at a time and counts the rest', async () => {
    const { window, document, close } = await loadTool();
    const region = document.getElementById('noticeRegion');

    // Completeness is the only notice on a blank form.
    await tick(window);
    assert.ok(!region.hidden, 'completeness nudge is showing');
    assert.match(region.textContent, /Not yet recorded/);
    assert.equal(region.querySelectorAll('.notice-title').length, 1, 'exactly one notice rendered');

    // Fill the identifiers and it stands down.
    type(window, 'ptName', 'ABC');
    type(window, 'ptMrn', '123');
    type(window, 'reviewerInitials', 'XY');
    document.getElementById('ptWard').value = '6B';
    document.getElementById('ptWard').dispatchEvent(new window.Event('change', { bubbles: true }));
    await tick(window);
    assert.ok(region.hidden, 'nothing left to say');
    close();
});

test('the completeness notice asks for initials, not a patient name', async () => {
    const { window, document, close } = await loadTool();
    await tick(window);
    const text = document.getElementById('noticeRegion').textContent;
    assert.match(text, /Patient initials/);
    assert.ok(!/Patient Name/.test(text), 'the tool only ever collects initials');
    close();
});

test('the discharge confirmation is shown for CAT 1, not only CAT 3', async () => {
    const { window, document, close } = await loadTool();
    const modal = document.getElementById('dischargeConfirmModal');
    assert.ok(modal, 'modal exists under its new, category-neutral id');
    assert.notEqual(modal.style.display, 'flex', 'starts closed');

    // A CAT 1 patient, ticked for discharge, must still be asked.
    type(window, 'c_hr', '140');
    await tick(window);
    assert.equal(document.getElementById('catText').textContent, 'CAT 1');

    const chk = document.getElementById('chk_discharge_alert');
    chk.checked = true;
    chk.dispatchEvent(new window.Event('change', { bubbles: true }));
    await tick(window);

    assert.equal(modal.style.display, 'flex', 'confirmation opened');
    assert.equal(chk.checked, false, 'discharge is not applied until confirmed');
    close();
});

test('the discharge question changes with the review mode', async () => {
    const { window, document, close } = await loadTool();
    const body = document.getElementById('discharge_confirm_body');

    window.openDischargeConfirm('full');
    assert.match(body.textContent, /2 completed ALERT reviews/);
    assert.ok(!/physical/i.test(body.textContent), 'does not ask about something already true');

    const chart = document.querySelector('input[name="reviewModeType"][value="chart"]');
    chart.checked = true;
    chart.dispatchEvent(new window.Event('change', { bubbles: true }));
    window.openDischargeConfirm('full');
    assert.match(body.textContent, /one physical review/, 'asks only when today is a chart review');
    close();
});

test('confirming discharge applies it; declining does not', async () => {
    const { window, document, close } = await loadTool();
    window.openDischargeConfirm('full');
    click(window, '#btn_discharge_confirm_no');
    await tick(window);
    assert.equal(document.getElementById('chk_discharge_alert').checked, false);

    window.openDischargeConfirm('full');
    click(window, '#btn_discharge_confirm_yes');
    await tick(window);
    assert.equal(document.getElementById('chk_discharge_alert').checked, true);
    close();
});

test('the LOS mitigator appears only past 4 days, and suppresses the escalation', async () => {
    const { window, document, close } = await loadTool();
    const wrapper = document.getElementById('los_risk_wrapper');
    assert.equal(wrapper.style.display, 'none', 'hidden for a short stay');

    type(window, 'icuLos', '6');
    type(window, 'bl_wcc', '18');
    await tick(window);
    assert.equal(wrapper.style.display, 'block', 'offered for a long stay');
    assert.equal(document.getElementById('catText').textContent, 'CAT 1');

    click(window, '#btn_los_mitigated');
    await tick(window);
    assert.equal(document.getElementById('catText').textContent, 'CAT 2', 'no longer escalates');
    close();
});

test('the LOS mitigator is not offered once immobility is recorded', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'icuLos', '6');
    await tick(window);
    assert.equal(document.getElementById('los_risk_wrapper').style.display, 'block');

    click(window, '#seg_immobility .seg-btn[data-value="true"]');
    await tick(window);
    assert.equal(document.getElementById('los_risk_wrapper').style.display, 'none');
    close();
});

test('both mitigator boxes collapse when the form is cleared', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptAge', '82');
    type(window, 'icuLos', '6');
    await tick(window);
    assert.equal(document.getElementById('age_risk_wrapper').style.display, 'block');
    assert.equal(document.getElementById('los_risk_wrapper').style.display, 'block');

    click(window, '#confirmClearData');
    await tick(window);
    assert.equal(document.getElementById('age_risk_wrapper').style.display, 'none');
    assert.equal(document.getElementById('los_risk_wrapper').style.display, 'none');
    assert.equal(document.getElementById('los_mitigate_reason').value, '');
    close();
});

test('the infection downtrend question no longer mentions antibiotics', async () => {
    const { document, close } = await loadTool();
    const labels = [...document.querySelectorAll('label')].map(l => l.textContent).join(' ');
    assert.ok(!/antibiotic/i.test(labels), 'the three-part question is gone from every label');
    assert.match(labels, /infection markers\s+downtrending/i);
    close();
});

test('the orphaned handover banner is gone', async () => {
    const { document, close } = await loadTool();
    assert.equal(document.getElementById('handoverBanner'), null);
    assert.equal(document.getElementById('btnApproveHandoverDischarge'), null);
    close();
});

test('new fields are present and registered', async () => {
    const { document, close } = await loadTool();
    ['bloods_date', 'bloods_time', 'inr_target', 'aptt_target', 'los_mitigate_reason']
        .forEach(id => assert.ok(document.getElementById(id), `#${id} exists`));
    close();
});

test('the generated note carries no characters the DMR cannot render', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'icuLos', '6');
    type(window, 'c_hr', '118');
    type(window, 'bl_hb', '94');
    window.prevBloods = { hb: '118', cr_review: '120' };
    type(window, 'bl_cr_review', '180');
    await tick(window);

    generateNote(window);
    await tick(window);

    const note = document.getElementById('summary').value;
    assert.ok(note.length > 0, 'a note was produced');
    const nonAscii = note.match(/[^\x00-\x7F]/g);
    assert.deepEqual(nonAscii, null, `note contains ${nonAscii} which the DMR cannot render`);
    close();
});

test('the note states no review-hours commitment and keeps one risk list', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'icuLos', '6');
    await tick(window);
    generateNote(window);
    await tick(window);

    const note = document.getElementById('summary').value;
    assert.match(note, /ALERT nursing post ICU reviews continue/);
    assert.ok(!/up to \d+h post-ICU stepdown/.test(note), 'no hours promised in the record');
    assert.ok(!/Considered, not counted/.test(note), 'one list, not two');
    assert.match(note, /mitigated: no other risk factors identified/, 'discounted risks say so inline');
    close();
});

test('the on-screen plan still shows the review schedule', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptAge', '82');
    await tick(window);
    assert.match(document.getElementById('followUpInstructions').textContent, /48h/,
        'the ladder stays on screen for the clinician');
    close();
});


// --- Data minimisation --------------------------------------------------------------------

test('an imported note cannot put a full name or URN into the tool', async () => {
    const { window, document, close } = await loadTool();
    // maxlength stops a clinician typing a full name; it does not stop the importer assigning
    // one, which is how a DMR note's real identifiers would have got in.
    type(window, 'importText', [
        'ALERT CNS post ICU review - Physical review',
        'Patient: Casey Bond | URN: ...9876543 | Location: 4B, Room: 12',
        'Age: 61'
    ].join('\n'));
    click(window, '#runImport');
    await tick(window);

    assert.equal(document.getElementById('ptName').value, 'CB', 'reduced to initials');
    assert.equal(document.getElementById('ptMrn').value, '543', 'last three digits only');
    close();
});

test('initials already in the tool\'s own format survive a round trip', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'importText', 'Patient: ABC | URN: ...123 | Location: 4B, Room: 12');
    click(window, '#runImport');
    await tick(window);
    assert.equal(document.getElementById('ptName').value, 'ABC', 'not collapsed to one letter');
    close();
});

test('the identifier fields cannot be typed past three characters', async () => {
    const { document, close } = await loadTool();
    assert.equal(document.getElementById('ptName').getAttribute('maxlength'), '3');
    assert.equal(document.getElementById('ptMrn').getAttribute('maxlength'), '3');
    close();
});

test('a room label with a letter in it imports and stays editable', async () => {
    const { window, document, close } = await loadTool();
    // #ptBed used to be type=number, which discards "24B" on assignment: the scraped room
    // vanished and could not be typed back in either.
    type(window, 'importText', 'Patient: ABC | URN: ...123 | Location: 4B, Room: 24B');
    click(window, '#runImport');
    await tick(window);

    assert.equal(document.getElementById('ptBed').value, '24B');
    type(window, 'ptBed', 'A4');
    assert.equal(document.getElementById('ptBed').value, 'A4');
    close();
});

test('a note written with blank identifiers does not import its own dashes', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'importText', 'Patient: -- | URN: ... | Location: --, Room: --');
    click(window, '#runImport');
    await tick(window);

    assert.equal(document.getElementById('ptName').value, '');
    assert.equal(document.getElementById('ptBed').value, '');
    close();
});

test('2L nasal prongs scores on the ADDS calculator', async () => {
    const { window, document, close } = await loadTool();
    click(window, '#btnAddsOverride');   // no-op if absent; the calculator lives in the page
    click(window, '.o2-chip[data-val="RA"]');
    await tick(window);
    assert.equal(String(document.getElementById('score_o2').innerText), '0', 'room air scores nothing');

    click(window, '.o2-chip[data-val="1LNP"]');
    await tick(window);
    assert.equal(String(document.getElementById('score_o2').innerText), '0', '1L stays at nothing');

    click(window, '.o2-chip[data-val="2LNP"]');
    await tick(window);
    assert.equal(String(document.getElementById('score_o2').innerText), '1', '2L scores 1');

    click(window, '.o2-chip[data-val="3LNP"]');
    await tick(window);
    assert.equal(String(document.getElementById('score_o2').innerText), '1', 'and so does 3L');
    close();
});

test('a manual category selection is not annotated in the DMR note', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'adds', '4');
    await tick(window);
    click(window, '#override_amber');
    await tick(window);

    generateNote(window);
    await tick(window);
    const note = document.getElementById('summary').value;
    assert.ok(note.includes('ALERT Nursing Review Category - CAT 2'), 'the clinician\'s choice is the category');
    assert.ok(!/manually set/i.test(note), 'and it is not editorialised');
    close();
});

test('the device dwell line reports days without calling them long', async () => {
    const { window, document, close } = await loadTool();
    // Built from local parts, not toISOString: the app counts dwell in local days, so a UTC
    // date string made this test read 13d for anyone running it west of Greenwich in the
    // morning.
    const d = new Date(Date.now() - 12 * 86400000);
    const old = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    click(window, '.device-add-group .btn[data-device-type="PIVC"]');
    await tick(window);
    const dateEl = document.querySelector('#devices-container .device-date');
    assert.ok(dateEl, 'the PIVC row was added');
    dateEl.value = old;
    dateEl.dispatchEvent(new window.Event('change', { bubbles: true }));
    await tick(window);

    const shown = document.getElementById('devices-container').textContent;
    assert.match(shown, /12d dwell/, 'the day count is still reported');
    assert.ok(!/long dwell/i.test(shown), 'no "long"/"very long" wording on screen');

    type(window, 'ptName', 'ABC');
    generateNote(window);
    await tick(window);
    const note = document.getElementById('summary').value;
    assert.match(note, /12d dwell/);
    assert.ok(!/long dwell/i.test(note), 'nor in the note');
    close();
});

test('the reviewer field marks itself until a reviewer is named', async () => {
    const { window, document, close } = await loadTool();
    const field = document.querySelector('.rs-field-reviewer');
    assert.ok(field, 'the reviewer field is its own marked block');

    type(window, 'ptName', 'ABC');
    await tick(window);
    assert.ok(field.classList.contains('reviewer-missing'), 'an empty box says so');

    type(window, 'reviewerInitials', 'CB');
    await tick(window);
    assert.ok(!field.classList.contains('reviewer-missing'), 'and stops once filled');
    close();
});

// --- Note hygiene: only fields with data reach the DMR -----------------------------------

test('a note with no ward or bed prints no location and no dashes', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'icuLos', '6');
    await tick(window);
    generateNote(window);
    await tick(window);

    const note = document.getElementById('summary').value;
    assert.match(note, /Patient: ABC/);
    assert.ok(!/Location:/.test(note), 'no empty Location');
    assert.ok(!/Room:/.test(note), 'no empty Room');
    assert.ok(!/--/.test(note), 'no placeholder dashes anywhere in the note');
    assert.ok(!/Reason for ICU Admission/.test(note), 'no empty admission reason');
    close();
});

test('the note names the ward the clinician typed, not the word "Other"', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'ptWard', 'Other');
    type(window, 'ptWardOther', 'Short Stay Unit');
    type(window, 'ptBed', '4A');
    await tick(window);
    generateNote(window);
    await tick(window);

    const note = document.getElementById('summary').value;
    assert.match(note, /Location: Short Stay Unit, Room: 4A/);
    assert.ok(!/Location: Other/.test(note));
    close();
});

test('the reviewer field holds initials, not a name', async () => {
    const { document, close } = await loadTool();
    assert.equal(document.getElementById('reviewerInitials').getAttribute('maxlength'), '3');
    close();
});

// --- Quick Review layout ------------------------------------------------------------------

test('the category buttons live inside the category card and still work', async () => {
    const { window, document, close } = await loadTool();
    // They used to be a separate card 800 lines up the page. The move must not break the
    // listeners bound to them by id.
    assert.ok(document.getElementById('section-category').contains(document.getElementById('override_red')),
        'the decision sits with the evidence for it');

    type(window, 'ptName', 'ABC');
    await tick(window);
    click(window, '#override_red');
    await tick(window);
    assert.equal(document.getElementById('catText').textContent, 'CAT 1');
    close();
});

test('deleting a computed risk takes it out of the note and the category', async () => {
    for (const quick of [true, false]) {
        const { window, document, close } = await loadTool();
        type(window, 'ptName', 'ABC');
        type(window, 'stepdownDate', '2026-08-20');
        type(window, 'adds', '1');
        await tick(window);
        if (quick) { click(window, 'input[name="reviewDepth"][value="quick"]'); await tick(window, 700); }
        type(window, 'b_spo2', '84');
        await tick(window);
        assert.equal(document.getElementById('catText').textContent, 'CAT 1', 'the risk fires');

        // The row says delete, so it has to leave the way every other row on that list does.
        // The rule kept firing regardless, so a struck-through entry printed in the DMR
        // anyway - which made the control a lie.
        const row = () => document.querySelector('#scraped_issues_list .scraped-issue-row');
        click(window, row().querySelector('.scraped-issue-resolve'));
        await tick(window);
        generateNote(window);
        await tick(window);
        let note = document.getElementById('summary').value;
        assert.ok(!/Hypoxia/.test(note), `deleted risk leaves the note (${quick ? 'quick' : 'full'})`);
        assert.equal(document.getElementById('catText').textContent, 'CAT 3',
            'and stops driving the category - a note omitting a risk that set the category would be worse');

        // The measurement behind it is untouched: this deletes a finding, not the data.
        assert.match(note, /SpO2 84/, 'the observation still prints');

        // And it is still a delete, not a deletion.
        click(window, row().querySelector('.scraped-issue-resolve'));
        await tick(window);
        generateNote(window);
        await tick(window);
        assert.match(document.getElementById('summary').value, /Hypoxia/, 'undo brings it back');
        assert.equal(document.getElementById('catText').textContent, 'CAT 1');
        close();
    }
});

test('an empty list stays empty, in both modes', async () => {
    const { window, document, close } = await loadTool();
    const risks = document.getElementById('scraped_issues_list');
    const factors = document.getElementById('patient_factors_list');
    assert.equal(risks.innerHTML, '', 'Full Review leaves them blank');
    assert.equal(factors.innerHTML, '');

    // Quick Review used to write a line into each empty card explaining what belonged in it.
    // The card title and the add row beneath already say that, so it was a third voice saying
    // the same thing in the mode built to have less on the page.
    click(window, 'input[name="reviewDepth"][value="quick"]');
    await tick(window);
    assert.equal(risks.innerHTML, '', 'and so does Quick Review');
    assert.equal(factors.innerHTML, '');

    click(window, 'input[name="reviewDepth"][value="full"]');
    await tick(window);
    assert.equal(risks.innerHTML, '');
    close();
});

test('Quick Review puts lines in the rail and the write-up in the wide column', async () => {
    const { window, document, close } = await loadTool();
    click(window, 'input[name="reviewDepth"][value="quick"]');
    await tick(window);

    const inCell = (cell, id) => document.getElementById(cell).contains(document.getElementById(id));
    assert.ok(inCell('qgLeft', 'section-devices'), 'lines moved to the rail');
    assert.ok(inCell('qgRight', 'scraped_risks_wrapper'));
    assert.ok(inCell('qgRight', 'quick_notes_wrapper'), 'notes joined to the review list');
    assert.ok(inCell('qgBottom', 'override_card'), 'category buttons ride with the bottom band');
    close();
});

test('the Quick Review-only cards carry no inline display of their own', async () => {
    const { window, document, close } = await loadTool();
    // Their visibility moved from an inline style to body.quick-review-active in style.css:
    // the inline display outranked the stylesheet, so the write-up panel could never be the
    // flex column it needs to be to stretch, and it kept a dead band at its foot. jsdom does
    // not load the stylesheet (see harness.js), so what is asserted here is that nothing
    // writes an inline display any more - the CSS itself is verified in a real browser.
    const notes = document.getElementById('quick_notes_wrapper');
    const list = document.getElementById('scraped_risks_wrapper');
    assert.equal(notes.style.display, '');
    assert.equal(list.style.display, '');

    click(window, 'input[name="reviewDepth"][value="quick"]');
    await tick(window);
    assert.equal(notes.style.display, '', 'entering Quick Review must not set one');
    assert.equal(list.style.display, '');

    click(window, 'input[name="reviewDepth"][value="full"]');
    await tick(window);
    assert.equal(notes.style.display, '', 'nor must leaving it');
    assert.equal(list.style.display, '');
    close();
});

test('a floating Quick Review card can be closed from its own corner', async () => {
    const { window, document, close } = await loadTool();
    click(window, 'input[name="reviewDepth"][value="quick"]');
    await tick(window);

    click(window, '#btnBloodsDetailsToggle');
    await tick(window);
    const bloods = document.getElementById('section-bloods');
    assert.ok(bloods.classList.contains('qr-expanded'), 'the card floats over the page');

    // Closing used to mean finding the Details toggle again, which scrolls out of sight.
    click(window, '#section-bloods .qr-overlay-close');
    await tick(window);
    assert.ok(!bloods.classList.contains('qr-expanded'), 'the corner button closes it');
    assert.ok(document.getElementById('qrBackdrop').hidden, 'and takes the backdrop with it');
    close();
});

test('the floating bloods card can also be closed from the bottom', async () => {
    const { window, document, close } = await loadTool();
    click(window, 'input[name="reviewDepth"][value="quick"]');
    await tick(window);

    click(window, '#btnBloodsDetailsToggle');
    await tick(window);
    const bloods = document.getElementById('section-bloods');
    assert.ok(bloods.classList.contains('qr-expanded'), 'the card floats over the page');

    // The corner ✕ is sticky, so it never scrolls off - but it is still at the top of a card
    // longer than the overlay. Having scrolled to the end of the bloods grid, the way out
    // should be right there, the way the ADDS calculator has offered it since May.
    const bottom = document.querySelector('#section-bloods .qr-overlay-close-bottom');
    assert.ok(bottom, 'there is a close at the bottom too');
    assert.equal(bloods.lastElementChild, bottom, 'and it is the last thing in the card');

    click(window, bottom);
    await tick(window);
    assert.ok(!bloods.classList.contains('qr-expanded'), 'it closes the card');
    assert.ok(document.getElementById('qrBackdrop').hidden, 'and takes the backdrop with it');
    close();
});

test('a clotting target box suggests no target of its own', async () => {
    const { window, document, close } = await loadTool();
    // "target 2-3" and "target 60-90" read as this patient's target rather than as an example
    // of what to type, which is a clinical claim the tool has no basis for making.
    for (const id of ['inr_target', 'aptt_target']) {
        const el = document.getElementById(id);
        assert.equal(el.placeholder, 'target', `${id} names the field without naming a range`);
        assert.ok(/target/i.test(el.getAttribute('aria-label') || ''), `${id} still says what it is`);
    }
    close();
});

test('what the clinician writes down reaches the DMR note as plain bullets', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'adds', '2');
    type(window, 'quickNotes', 'Reviewed with bedside nurse\nPlan discussed with team');
    await tick(window);

    type(window, 'manualIssueInput', 'Mobilising with 1 assist');
    click(window, '#btnAddIssue');
    type(window, 'manualIssueInput', 'Family updated re GOC');
    click(window, '#btnAddIssue');
    await tick(window);

    generateNote(window);
    await tick(window);
    let note = document.getElementById('summary').value;

    // Both lists reach the note, each under its own heading, and both headings are ones the
    // importer can read straight back next review.
    assert.match(note, /- Mobilising with 1 assist/);
    assert.match(note, /- Family updated re GOC/);
    assert.match(note, /- Reviewed with bedside nurse/, 'Quick Notes reaches the note');
    assert.match(note, /- Plan discussed with team/, 'one bullet per line');

    // A typed risk belongs under the risk heading so it survives into tomorrow's note. Quick
    // Notes describe the patient, so they land under patient factors.
    const factorsAt = note.indexOf('PATIENT FACTORS:');
    const risksAt = note.indexOf('IDENTIFIED ICU READMISSION RISK FACTORS');
    assert.ok(factorsAt > -1 && factorsAt < risksAt, 'patient factors come first');
    assert.ok(note.indexOf('- Reviewed with bedside nurse') > factorsAt, 'Quick Notes are patient factors');
    assert.ok(note.indexOf('- Reviewed with bedside nurse') < risksAt);
    assert.ok(note.indexOf('- Mobilising with 1 assist') > risksAt, 'a typed risk sits under the risk heading');
    assert.ok(factorsAt > note.indexOf('ADDS: 2'), 'and both sit below the score');

    // Resolving an entry takes it out, the same way it leaves the handover line.
    click(window, '#scraped_issues_list .scraped-issue-row .scraped-issue-resolve');
    await tick(window);
    generateNote(window);
    await tick(window);
    note = document.getElementById('summary').value;
    assert.ok(!/Mobilising with 1 assist/.test(note), 'resolved entries drop out');
    assert.match(note, /Family updated re GOC/, 'the rest stay');
    close();
});

test('everything left standing on the Review List reaches the note, not just typed entries', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'adds', '2');
    await tick(window);

    // Exactly what the importer stages from a previous note: a risk that didn't land on a
    // gate, and the mobility line. Both sat on the list looking like a manual entry and went
    // nowhere - in Quick Review that list is most of the review.
    window.addActiveIssue({ text: 'Awaiting dietitian review', source: 'scraped', severity: 'amber', key: 'scraped_risk_0' });
    window.addActiveIssue({ text: 'Family requesting GOC discussion', source: 'scraped', severity: 'amber', key: 'scraped_risk_1' });
    window.renderScrapedIssuesList();
    await tick(window);

    generateNote(window);
    await tick(window);
    let note = document.getElementById('summary').value;
    assert.match(note, /- Awaiting dietitian review/, 'a carried-over risk reaches the note');
    assert.match(note, /- Family requesting GOC discussion/, 'so does a carried-over observation');

    // Resolve means the same thing for a carried-over entry as for a typed one.
    click(window, '#scraped_issues_list .scraped-issue-row .scraped-issue-resolve');
    await tick(window);
    generateNote(window);
    await tick(window);
    note = document.getElementById('summary').value;
    assert.ok(!/dietitian/.test(note), 'resolving takes it back out');
    assert.match(note, /Family requesting GOC discussion/, 'the rest stay');
    close();
});

test('an updated assessment answer replaces the carried one rather than joining it', async () => {
    const { window, document, close } = await loadTool();
    click(window, '#btnOpenImport');
    document.getElementById('importText').value = [
        'ALERT CNS post ICU review - Physical review',
        'Patient: ABC | URN: ...123',
        'ICU Discharge Date: 18/08/2026',
        '',
        'PATIENT FACTORS:',
        '- Mobility: assist x1 with frame',
        '- Son visiting daily',
        '',
        'IDENTIFIED ICU READMISSION RISK FACTORS:',
        '- None identified',
        '',
        'PLAN:',
        '- ALERT nursing post ICU reviews continue.'
    ].join('\n');
    click(window, '#runImport');
    await tick(window, 900);

    // The patient has improved. The note writes mobility from its own field, so yesterday's
    // wording must not survive as a text entry and print underneath today's answer.
    type(window, 'ae_mobility', 'independent with frame');
    await tick(window);
    generateNote(window);
    await tick(window);
    const note = document.getElementById('summary').value;

    assert.match(note, /- Mobility: independent with frame/, "today's answer is the one stated");
    assert.ok(!/assist x1 with frame/.test(note), 'and yesterday\'s is not stated beside it');
    assert.match(note, /- Son visiting daily \(carried 2\)/,
        'a factor with no field of its own still carries across');
    close();
});

test('a carried line nobody has looked at raises one quiet nudge', async () => {
    const { window, document, close } = await loadTool();
    click(window, '#btnOpenImport');
    document.getElementById('importText').value = [
        'ALERT CNS post ICU review - Physical review',
        'Patient: ABC | URN: ...123',
        'ICU Discharge Date: 18/08/2026',
        '',
        'IDENTIFIED ICU READMISSION RISK FACTORS:',
        '- Awaiting dietitian review',
        '',
        'PLAN:',
        '- ALERT nursing post ICU reviews continue.'
    ].join('\n');
    click(window, '#runImport');
    await tick(window, 900);

    // A carried line reaching today's note unlooked-at is the tool asserting a risk nobody
    // re-assessed. Not blocked - plenty of carried lines are still true - but said once, in
    // the single notice region rather than as a banner of its own.
    const region = document.getElementById('noticeRegion');
    assert.ok(!region.hidden, 'the nudge is raised');
    assert.match(region.textContent, /carried from the last note/);
    assert.match(region.textContent, /edit or delete/);

    // Acting on the line is what counts as having reviewed it.
    click(window, '#scraped_issues_list .scraped-issue-resolve');
    await tick(window);
    assert.ok(!/carried from the last note/.test(region.textContent),
        'and it goes as soon as the last one has been dealt with');
    close();
});

test('Psychosocial is formatted like the A-E sections it sits among', async () => {
    const { window, document, close } = await loadTool();
    // It used to wear a bordered box of its own with a larger accent heading - the only
    // section in the panel not built like the others, which made it read as bolted on.
    const headings = [...document.querySelectorAll('.ae-section-heading')].map(h => h.textContent.trim());
    assert.deepEqual(headings, ['A: Airway', 'B: Breathing', 'C: Circulation', 'D: Disability',
        'E: Exposure', 'Psychosocial & Recovery'], 'one heading style for all six');

    const psych = [...document.querySelectorAll('.ae-section-heading')]
        .find(h => /Psychosocial/.test(h.textContent));
    assert.ok(psych.closest('.ae-section-card'), 'in the same card the others use');

    // The controls inside it are untouched.
    click(window, '#seg_pics .seg-btn[data-value="positive"]');
    await tick(window);
    assert.equal(document.querySelector('#seg_pics .seg-btn.active').dataset.value, 'positive');
    assert.equal(document.getElementById('pics_wrapper').style.display, 'block');
    close();
});

// --- Quick Review: a list, not a questionnaire ---------------------------------------------

const gatedNote = [
    'ALERT CNS post ICU review - Physical review',
    'Patient: ABC | URN: ...123',
    'ICU Discharge Date: 18/08/2026',
    '',
    'IDENTIFIED ICU READMISSION RISK FACTORS:',
    '- Respiratory concern - on oxygen, weaning slowly',
    '- Delirium / neuro concern - intermittently confused',
    '- Awaiting dietitian review',
    '',
    'PLAN:',
    '- ALERT nursing post ICU reviews continue.'
].join('\n');

test('Quick Review hands the carried gates back and puts their risks on the list', async () => {
    const { window, document, close } = await loadTool();
    click(window, '#btnOpenImport');
    document.getElementById('importText').value = gatedNote;
    click(window, '#runImport');
    await tick(window, 900);
    assert.ok(document.querySelectorAll('.input-box.carried-forward').length >= 2,
        'Full Review keeps the gates, which is how a Full Review is completed');

    click(window, 'input[name="reviewDepth"][value="quick"]');
    await tick(window, 700);

    // A gate silently set to Yes on the strength of yesterday's note is a finding nobody made
    // today. Quick Review has no gates, so the risk goes on the list instead - in the previous
    // reviewer's own wording, where it can be edited or deleted like anything else.
    assert.equal(document.querySelectorAll('.input-box.carried-forward').length, 0,
        'no gate is left answered on yesterday\'s evidence');
    assert.equal(document.querySelector('#seg_resp_concern .seg-btn.active'), null);
    const risks = document.getElementById('scraped_issues_list').textContent;
    assert.match(risks, /Respiratory concern - on oxygen, weaning slowly/, 'nothing is lost by it');
    assert.match(risks, /Delirium \/ neuro concern - intermittently confused/);
    close();
});

test('releasing a gate does not carry yesterday\'s numbers into today\'s note', async () => {
    const { window, document, close } = await loadTool();
    click(window, '#btnOpenImport');
    document.getElementById('importText').value = [
        'ALERT CNS post ICU review - Physical review',
        'Patient: ABC | URN: ...123',
        'ICU Discharge Date: 18/08/2026',
        '',
        'Bloods (taken 20/08/2026 06:00): WCC 16, CRP 180',
        '',
        'IDENTIFIED ICU READMISSION RISK FACTORS:',
        '- Infection risk - WCC 16, CRP 180',
        '- Awaiting dietitian review',
        '',
        'PLAN:',
        '- ALERT nursing post ICU reviews continue.'
    ].join('\n');
    click(window, '#runImport');
    await tick(window, 900);

    click(window, 'input[name="reviewDepth"][value="quick"]');
    await tick(window, 700);
    // Today's markers have halved - which is usually the whole story of the review.
    type(window, 'bl_wcc', '9');
    type(window, 'bl_crp', '60');
    await tick(window);

    // "Infection risk" matched the infection gate on the way in, so the importer's own filter
    // never saw it - the gate was carrying it. Releasing that gate must not smuggle it onto
    // the list in yesterday's numbers.
    const risks = document.getElementById('scraped_issues_list').textContent;
    assert.ok(!/WCC 16/.test(risks), "yesterday's markers do not become today's risk");
    assert.match(risks, /Awaiting dietitian review/, 'a genuine carried risk still travels');

    generateNote(window);
    await tick(window);
    const note = document.getElementById('summary').value;
    assert.ok(!/Infection risk - WCC 16/.test(note), 'and the note does not assert it');
    assert.match(note, /WCC 9 \(16\)/, 'it states the trend instead');
    close();
});

test('Quick Review scores what was measured, and what was left standing', async () => {
    const { window, document, close } = await loadTool();
    click(window, '#btnOpenImport');
    document.getElementById('importText').value = gatedNote;
    click(window, '#runImport');
    await tick(window, 900);
    type(window, 'ptAge', '82');
    type(window, 'icuLos', '9');
    await tick(window);
    const fullCat = document.getElementById('catText').textContent;

    click(window, 'input[name="reviewDepth"][value="quick"]');
    await tick(window, 700);

    // The gate-driven concerns stop counting - the clinician was never asked about them - but
    // age and ICU stay must not. They are as concrete as any blood result, and an 82-year-old
    // with a nine-day stay cannot score one way in Quick Review and another in Full.
    assert.match(document.getElementById('redFlagList').textContent + document.getElementById('amberFlagList').textContent,
        /Age 82/, 'age still counts');
    assert.match(document.getElementById('amberFlagList').textContent, /9-day ICU stay/, 'so does ICU stay');

    // A risk released from a gate and left standing scores what that gate was scoring. Leaving
    // it there is an affirmative act - the clinician read it and did not delete it - and a real
    // risk sitting in plain sight scoring nothing is how a category gets missed by someone
    // working from the list rather than the gates.
    const flags = document.getElementById('redFlagList').textContent +
                  document.getElementById('amberFlagList').textContent;
    assert.match(flags, /Respiratory concern - on oxygen, weaning slowly/,
        'a carried risk left on the list carries its weight');

    // Deleting it is what withdraws it.
    const rows = [...document.querySelectorAll('#scraped_issues_list .scraped-issue-row')];
    for (const row of rows) {
        if (/Respiratory|Delirium/.test(row.textContent)) click(window, row.querySelector('.scraped-issue-resolve'));
    }
    await tick(window);
    assert.ok(!/Respiratory concern/.test(
        document.getElementById('redFlagList').textContent +
        document.getElementById('amberFlagList').textContent),
        'and deleting it takes the weight away again');
    close();
});

test('a carried blood concern keeps its concern and loses its numbers', async () => {
    const carried = [
        'ALERT CNS post ICU review - Physical review',
        'Patient: ABC | URN: ...123',
        'ICU Discharge Date: 18/08/2026',
        '',
        'Bloods (taken 20/08/2026 06:00): K 2.9',
        '',
        'IDENTIFIED ICU READMISSION RISK FACTORS:',
        '- Electrolyte concern - low K+ 2.9',
        '',
        'PLAN:',
        '- ALERT nursing post ICU reviews continue.'
    ].join('\n');

    // Today's bloods not entered yet. The concern has to survive: dropping it outright meant a
    // carried electrolyte concern simply disappeared - off the list, out of the note and out of
    // the category - which is the way a category gets missed.
    {
        const { window, document, close } = await loadTool();
        click(window, '#btnOpenImport');
        document.getElementById('importText').value = carried;
        click(window, '#runImport');
        await tick(window, 900);
        click(window, 'input[name="reviewDepth"][value="quick"]');
        await tick(window, 700);

        const risks = document.getElementById('scraped_issues_list').textContent;
        assert.match(risks, /Electrolyte concern/, 'the concern carries');
        assert.ok(!/2\.9/.test(risks), "yesterday's number does not");
        assert.equal(document.getElementById('catText').textContent, 'CAT 2', 'and it still scores');
        close();
    }

    // Today's bloods entered and still low: today's finding stands on its own, in today's
    // numbers, and the carried copy must not say it again in last review's words.
    {
        const { window, document, close } = await loadTool();
        click(window, '#btnOpenImport');
        document.getElementById('importText').value = carried;
        click(window, '#runImport');
        await tick(window, 900);
        click(window, 'input[name="reviewDepth"][value="quick"]');
        await tick(window, 700);
        type(window, 'bl_k', '2.8');
        await tick(window);

        generateNote(window);
        await tick(window);
        const note = document.getElementById('summary').value;
        assert.match(note, /Electrolyte concern - low K\+ 2\.8/, "today's finding is stated");
        assert.equal((note.match(/Electrolyte concern/g) || []).length, 1, 'and only once');
        close();
    }
});

test('saturation is read against the target the patient is managed to', async () => {
    const read = async (target, v) => {
        const { window, document, close } = await loadTool();
        type(window, 'ptName', 'ABC');
        type(window, 'stepdownDate', '2026-08-20');
        type(window, 'adds', '1');
        await tick(window);
        if (target) { type(window, 'spo2_target', target); await tick(window); }
        type(window, 'b_spo2', String(v));
        await tick(window);
        const out = {
            cat: document.getElementById('catText').textContent,
            said: (document.getElementById('redFlagList').textContent + ' ' +
                   document.getElementById('amberFlagList').textContent + ' ' +
                   document.getElementById('bloods_checks_strip').textContent).replace(/\s+/g, ' ').trim()
        };
        close();
        return out;
    };

    // Unset reads against 94%. Not flagging at all is the failure being fixed, and a wrongly
    // flagged COPD patient is visible and self-correcting where silence corrects nothing.
    assert.equal((await read(null, 95)).cat, 'CAT 3');
    assert.match((await read(null, 93)).said, /below target 94%/, '93 is the early sign, named');
    assert.equal((await read(null, 93)).cat, 'CAT 3', 'but not yet a category');
    assert.equal((await read(null, 91)).cat, 'CAT 2', 'further down it is');

    // Under 88 is red for everyone, COPD included: at 87 there is very little window before
    // the dissociation curve steepens and small further falls mean large falls in PaO2.
    assert.equal((await read(null, 87)).cat, 'CAT 1');
    assert.equal((await read('88_92', 87)).cat, 'CAT 1', 'a lower target does not make 87 safe');

    // Inside the COPD target is where they are meant to be.
    for (const v of [88, 90, 92]) {
        assert.equal((await read('88_92', v)).cat, 'CAT 3', `${v} is at target`);
        assert.equal((await read('88_92', v)).said, '', 'and says nothing');
    }

    // Above it is the harm the lower target exists to avoid.
    const over = await read('88_92', 96);
    assert.match(over.said, /above target 88-92%, review oxygen/);
});

test('an SpO2 target is only written down when it was actually chosen', async () => {
    // Printing the assumed 94% would put a target in the record nobody set - and the next
    // reviewer would import it and inherit a wrong one on a COPD patient as though it had
    // been documented.
    {
        const { window, document, close } = await loadTool();
        type(window, 'ptName', 'ABC');
        type(window, 'b_spo2', '92');
        await tick(window);
        generateNote(window);
        await tick(window);
        assert.ok(!/SpO2 target/.test(document.getElementById('summary').value),
            'unset writes nothing');
        close();
    }

    let note;
    {
        const { window, document, close } = await loadTool();
        type(window, 'ptName', 'ABC');
        type(window, 'ptAge', '74');
        await tick(window);
        type(window, 'spo2_target', '88_92');
        await tick(window);
        generateNote(window);
        await tick(window);
        note = document.getElementById('summary').value;
        assert.match(note, /SpO2 target: 88-92%/, 'a chosen target is written down');
        close();
    }

    {
        const { window, document, close } = await loadTool();
        click(window, '#btnOpenImport');
        document.getElementById('importText').value = note;
        click(window, '#runImport');
        await tick(window, 900);
        assert.equal(document.getElementById('spo2_target').value, '88_92',
            'and comes back, or a COPD patient is silently re-assessed against 94% from day two');
        close();
    }
});

test('temperature is one ladder, and says what raised it', async () => {
    const read = async (t) => {
        const { window, document, close } = await loadTool();
        type(window, 'ptName', 'ABC');
        type(window, 'stepdownDate', '2026-08-20');
        type(window, 'adds', '1');
        await tick(window);
        type(window, 'e_temp', String(t));
        await tick(window);
        const out = {
            cat: document.getElementById('catText').textContent,
            flags: (document.getElementById('redFlagList').textContent + ' ' +
                    document.getElementById('amberFlagList').textContent).replace(/\s+/g, ' ').trim()
        };
        close();
        return out;
    };

    // 38.5 exactly used to fall through the febrile rule, which tested >, and came out amber
    // through the infection gate instead - as a bare "Infection risk" with no reason attached
    // and the temperature mentioned nowhere at all.
    assert.equal((await read(37.9)).cat, 'CAT 3', 'below 38 is nothing');
    const low = await read(38.2);
    assert.equal(low.cat, 'CAT 2', 'a low-grade fever is amber');
    assert.match(low.flags, /Temp 38\.2/, 'and says so rather than raising a bare infection risk');
    assert.equal((await read(38.5)).cat, 'CAT 1', '38.5 is febrile, not a gap');
    assert.match((await read(38.5)).flags, /Febrile 38\.5/);
    assert.equal((await read(35.5)).cat, 'CAT 1', 'and the bottom rung is inclusive too');
    assert.equal((await read(35.6)).cat, 'CAT 3');
});

test('a released gate keeps its own weight, not a guessed one', async () => {
    const { window, document, close } = await loadTool();
    click(window, '#btnOpenImport');
    document.getElementById('importText').value = [
        'ALERT CNS post ICU review - Physical review',
        'Patient: ABC | URN: ...123',
        'ICU Discharge Date: 18/08/2026',
        '',
        'IDENTIFIED ICU READMISSION RISK FACTORS:',
        '- Renal concern - anuria',
        '',
        'PLAN:',
        '- ALERT nursing post ICU reviews continue.'
    ].join('\n');
    click(window, '#runImport');
    await tick(window, 900);
    click(window, '#toggle_renal_anuria');
    await tick(window);
    assert.equal(document.getElementById('catText').textContent, 'CAT 1',
        'anuria makes this gate red, not amber');

    click(window, 'input[name="reviewDepth"][value="quick"]');
    await tick(window, 700);

    // A gate's weight depends on its details - a renal concern with anuria is red where the
    // same gate is otherwise amber - so assuming amber on release would quietly undercall
    // exactly the patients who can least afford it.
    assert.equal(document.getElementById('catText').textContent, 'CAT 1',
        'the released risk carries red across, not amber');
    assert.match(document.getElementById('redFlagList').textContent, /Renal concern - anuria/);
    close();
});

test('choosing the category in Quick Review is a decision, not an override', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'stepdownDate', '2026-08-18');
    type(window, 'adds', '5');   // computes CAT 1
    await tick(window);
    click(window, 'input[name="reviewDepth"][value="quick"]');
    await tick(window, 700);

    assert.ok(document.getElementById('qr_discharge_prompt').hidden,
        'nothing is asked about discharge until the category is chosen');

    click(window, '#override_green');
    await tick(window);

    // Selecting CAT 3 over a computed CAT 1 is the steepest downgrade there is. In Full Review
    // that demands a typed reason; in Quick Review the tool has only seen the score and the
    // bloods, so there is nothing for the clinician to be overriding.
    assert.equal(document.getElementById('catText').textContent, 'CAT 3');
    assert.equal(document.getElementById('override_reason_box').style.display, 'none',
        'no reason is demanded');
    assert.equal(document.getElementById('override_downgrade_warn').style.display, 'none',
        'and no downgrade warning is raised');
    assert.match(document.getElementById('override_auto_hint').textContent, /score and bloods/,
        'the hint says what the tool actually looked at');

    // Time on the list is time since stepdown - patients join the list at stepdown - so the
    // question can carry the number rather than leaving it to be worked out.
    const discharge = document.getElementById('qr_discharge_prompt');
    assert.ok(!discharge.hidden, 'now the discharge question is asked');
    assert.match(discharge.textContent, /on the list - CAT 3/);
    assert.match(discharge.textContent, /can this patient be discharged/);
    assert.equal(document.getElementById('chk_discharge_alert').checked, false,
        'it asks and ticks nothing');
    close();
});

test('CAT 2 is not asked about discharge at all', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'stepdownDate', '2026-08-21');
    await tick(window);
    click(window, 'input[name="reviewDepth"][value="quick"]');
    await tick(window, 700);

    // "Continue reviews, or discharge pending bloods?" at a day and a half puts the second
    // half of the sentence in the clinician's head. Discharge pending bloods should arrive as
    // a decision, not as the answer to a leading question.
    click(window, '#override_amber');
    await tick(window);
    assert.ok(document.getElementById('qr_discharge_prompt').hidden, 'CAT 2 says nothing');

    // CAT 1 says what it says plainly.
    click(window, '#override_red');
    await tick(window);
    const d = document.getElementById('qr_discharge_prompt');
    assert.ok(!d.hidden);
    assert.match(d.textContent, /CAT 1 - cannot be discharged today/);
    close();
});

test('an override sets the category without saying so in the note', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'adds', '1');
    await tick(window);

    // Upgrading with no reason typed used to write "Clinician override: CAT 1" into the risk
    // factors, announcing to every reader of the DMR that the category came out of a piece of
    // software and had been argued with. The selection still has to stand.
    click(window, '#override_red');
    await tick(window);
    assert.equal(document.getElementById('catText').textContent, 'CAT 1', 'the override stands');
    generateNote(window);
    await tick(window);
    let note = document.getElementById('summary').value;
    assert.match(note, /ALERT Nursing Review Category - CAT 1/);
    assert.ok(!/Clinician override/i.test(note), 'and the note does not narrate itself');

    // A typed reason is the clinician's own words and does belong in the record.
    type(window, 'overrideNote', 'Deteriorating overnight per bedside nurse');
    await tick(window);
    generateNote(window);
    await tick(window);
    note = document.getElementById('summary').value;
    assert.match(note, /- Deteriorating overnight per bedside nurse/);
    assert.ok(!/Clinician override/i.test(note));
    close();
});

test('an override to CAT 2 is equally silent', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'adds', '1');
    await tick(window);
    click(window, '#override_amber');
    await tick(window);
    assert.equal(document.getElementById('catText').textContent, 'CAT 2');
    generateNote(window);
    await tick(window);
    assert.ok(!/Clinician override/i.test(document.getElementById('summary').value));
    close();
});

test('Full Review still demands a reason for a downgrade', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'adds', '5');
    await tick(window);
    click(window, '#override_green');
    await tick(window);
    assert.equal(document.getElementById('override_reason_box').style.display, 'block',
        'the override framing is intact where the tool considered every gate');
    close();
});

// --- Round trip: what one note says, the next one has to be able to read back -------------

const noteWith = (opts = {}) => [
    'ALERT CNS post ICU review - Physical review',
    'Patient: ABC | URN: ...123',
    'ICU Discharge Date: 18/08/2026',
    '',
    opts.bloods || 'Bloods (taken 20/08/2026 06:00): Hb 98, WCC 14.2, Cr 145, Mg 0.65',
    '',
    'PATIENT FACTORS:',
    ...(opts.factors || ['- Son visiting daily']),
    '',
    'IDENTIFIED ICU READMISSION RISK FACTORS:',
    ...(opts.risks || ['- Awaiting dietitian review']),
    '',
    'PLAN:',
    '- ALERT nursing post ICU reviews continue.'
].join('\n');

const importNote = async (window, document, text) => {
    click(window, '#btnOpenImport');
    document.getElementById('importText').value = text;
    click(window, '#runImport');
    await tick(window, 900);
};

test('both list sections survive the trip out to the note and back', async () => {
    const { window, document, close } = await loadTool();
    await importNote(window, document, noteWith());

    const factors = document.getElementById('patient_factors_list').textContent;
    const risks = document.getElementById('scraped_issues_list').textContent;
    assert.match(factors, /Son visiting daily/, 'patient factors come back into their own list');
    assert.match(risks, /Awaiting dietitian review/, 'and risks into theirs');
    assert.ok(!/Son visiting daily/.test(risks), 'neither lands in the other');

    // A line that has been riding along says so, so a list that only grows can still be pruned.
    generateNote(window);
    await tick(window);
    const note = document.getElementById('summary').value;
    assert.match(note, /- Son visiting daily \(carried 2\)/, 'the count continues in the note');
    assert.match(note, /- Awaiting dietitian review \(carried 2\)/);
    close();
});

test('a mitigated risk comes back mitigated, not live', async () => {
    const { window, document, close } = await loadTool();
    await importNote(window, document, noteWith({
        risks: ['- Renal concern (mitigated: known CKD and Cr/urine output around baseline)']
    }));

    // Carrying it to a gate would set that gate to Yes and turn a risk the previous reviewer
    // discounted into a live one - the mitigation destroyed by the act of reading the note.
    assert.equal(document.querySelector('#seg_renal .seg-btn.active'), null,
        'a mitigated line must not answer its gate');
    const row = document.querySelector('#scraped_issues_list .scraped-issue-row');
    assert.match(row.textContent, /mitigated: known CKD/, 'it keeps its reason');
    assert.match(row.textContent, /mitigated/, 'and is marked as discounted');

    generateNote(window);
    await tick(window);
    assert.match(document.getElementById('summary').value, /mitigated: known CKD/,
        'and it is still mitigated in the next note');
    close();
});

test('bloods import whether or not the note recorded when they were taken', async () => {
    // The note writes "Bloods (taken 20/08/2026 06:00):" whenever a collection time was
    // recorded, and the importer only ever matched a bare "Bloods:". Every note carrying a
    // time therefore lost its bloods in silence - previous values, trend arrows and every
    // trend-based rule with them.
    for (const bloods of ['Bloods (taken 20/08/2026 06:00): Hb 98, WCC 14.2, Cr 145',
                          'Bloods: Hb 98, WCC 14.2, Cr 145']) {
        const { window, document, close } = await loadTool();
        await importNote(window, document, noteWith({ bloods }));
        assert.equal(window.prevBloods.hb, '98', `previous Hb read from "${bloods.slice(0, 24)}..."`);
        assert.equal(window.prevBloods.cr_review, '145');
        assert.match(document.getElementById('prev_bl_hb').textContent, /98/, 'and shown on the field');
        close();
    }
});

test('a risk the tool works out for itself does not also arrive as text', async () => {
    const { window, document, close } = await loadTool();
    await importNote(window, document, noteWith({
        risks: [
            '- Low platelets Plts 12',
            '- Lactate 4.5',
            '- Age 82, increased risk of complications',
            '- Awaiting dietitian review'
        ]
    }));
    // These are re-evaluated every review from fields this same import fills, so scraping them
    // as text would put a second copy beside the one the rules are about to produce - and that
    // pair compounds at every subsequent review.
    type(window, 'ptAge', '82');
    type(window, 'bl_plts', '12');
    type(window, 'bl_lac_review', '4.5');
    await tick(window);

    generateNote(window);
    await tick(window);
    const note = document.getElementById('summary').value;
    assert.equal((note.match(/Low platelets/g) || []).length, 1, 'platelets stated once');
    assert.equal((note.match(/Lactate 4\.5/g) || []).length, 1, 'lactate stated once');
    assert.equal((note.match(/Age 82/g) || []).length, 1, 'age stated once');
    assert.match(note, /Awaiting dietitian review/, 'a genuine carried risk still comes across');
    close();
});

test('clearing for the next patient takes the carried-forward marks with it', async () => {
    const { window, document, close } = await loadTool();
    click(window, '#btnOpenImport');
    document.getElementById('importText').value = [
        'ALERT CNS post ICU review - Physical review',
        'Patient: ABC | URN: ...123',
        'ICU Discharge Date: 18/08/2026',
        '',
        'IDENTIFIED ICU READMISSION RISK FACTORS:',
        '- Respiratory concern - on oxygen, weaning slowly',
        '- Electrolyte concern - low K+ 2.9',
        '',
        'PLAN:',
        '- ALERT nursing post ICU reviews continue.'
    ].join('\n');
    click(window, '#runImport');
    await tick(window, 900);
    assert.ok(document.querySelectorAll('.input-box.carried-forward').length >= 2,
        'the import marks the gates it answered');

    click(window, '#clearDataBtnTop');
    await tick(window);
    click(window, '#confirmClearData');
    await tick(window, 900);

    // The gate answers and the (Prev: ...) text were already cleared; the carried-forward
    // marks were not. That left the "Carried forward" badge and outline on a new patient's
    // form with the previous patient's own wording still stashed behind it.
    assert.equal(document.querySelectorAll('.input-box.carried-forward').length, 0,
        'no gate still wears the last patient\'s badge');
    assert.equal(document.querySelectorAll('[data-carried-from]').length, 0,
        'and none is still holding their clinical detail');
    assert.equal(document.querySelectorAll('[data-carried-raw]').length, 0);
    assert.equal(document.getElementById('ptName').value, '', 'the rest of the reset still works');
    close();
});

test('a list entry mirroring an assessment field is stated once, not twice', async () => {
    const { window, document, close } = await loadTool();
    // The importer fills ae_mobility/ae_diet *and* stages a list row carrying the same text.
    // Once the list started reaching the note, both arrived - the assessment line and a
    // bullet repeating it a few lines below.
    click(window, '#btnOpenImport');
    document.getElementById('importText').value = [
        'ALERT CNS post ICU review - Physical review',
        'Patient: ABC | URN: ...123',
        'ICU Discharge Date: 18/08/2026',
        'Mobility: assist x1 with frame',
        'Diet: full ward diet',
        '',
        'IDENTIFIED ICU READMISSION RISK FACTORS:',
        '- Awaiting dietitian review',
        '',
        'PLAN:',
        '- ALERT nursing post ICU reviews continue.'
    ].join('\n');
    click(window, '#runImport');
    await tick(window, 900);

    generateNote(window);
    await tick(window);
    const note = document.getElementById('summary').value;

    assert.equal((note.match(/assist x1 with frame/g) || []).length, 1, 'mobility stated once');
    assert.equal((note.match(/full ward diet/g) || []).length, 1, 'diet stated once');
    // Both now live under PATIENT FACTORS rather than scattered through the assessment, and
    // the note writes them from their own fields - so a carried copy must not print beside
    // today's answer when the clinician updates one.
    const factorsAt = note.indexOf('PATIENT FACTORS:');
    assert.ok(factorsAt > -1 && note.indexOf('- Mobility: assist x1 with frame') > factorsAt,
        'mobility sits in the patient factors section');
    assert.ok(note.indexOf('- Diet: full ward diet') > factorsAt);
    assert.match(note, /- Awaiting dietitian review/, 'a genuine carried risk still comes through');
    close();
});

test('the note states each finding once, in the place that belongs to it', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'adds', '2');
    type(window, 'bl_k', '6.4');    // out of range: a check, and it drives a computed risk
    type(window, 'bl_plts', '12');  // a computed amber risk
    type(window, 'bl_inr', '3.2');  // a check with no target documented
    await tick(window);

    generateNote(window);
    await tick(window);
    const note = document.getElementById('summary').value;

    // The value is already on the Bloods line; "Abnormal K+ 6.4" bulleted under it says
    // nothing the reader doesn't have.
    assert.match(note, /Bloods.*K 6\.4/, 'the value is on the bloods line');
    assert.ok(!/Abnormal K/.test(note), 'and not repeated as a bullet');

    // A computed risk belongs in the risk section, stated once.
    assert.equal((note.match(/Low platelets Plts 12/g) || []).length, 1, 'stated once');
    const risksAt = note.indexOf('IDENTIFIED ICU READMISSION RISK FACTORS');
    assert.ok(note.indexOf('Low platelets Plts 12') > risksAt, 'in the risk section');

    // A clotting check is not a readmission risk and not a patient factor, so it gets its own
    // line rather than a place among the risks.
    assert.match(note, /^Checks: .*INR 3\.2 - target not documented/m, 'checks get their own line');
    assert.ok(note.indexOf('Checks:') < risksAt, 'above the risk section');
    assert.ok(!/- INR 3\.2 - target not documented/.test(note), 'and not bulleted as a risk');
    close();
});

test('an issue row explains its own controls', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'manualIssueInput', 'Awaiting speech path review');
    click(window, '#btnAddIssue');
    await tick(window);

    const row = document.querySelector('#scraped_issues_list .scraped-issue-row');
    // "Delete" rather than "resolve": most of what sits here arrived from the previous note,
    // and resolved asserts a clinical claim - that something was dealt with - which is not
    // what clearing an inapplicable line means. Still reversible, hence the strikethrough.
    assert.equal(row.querySelector('.scraped-issue-resolve').textContent, 'delete', 'a word, not a bare checkbox');
    assert.ok(row.querySelector('.scraped-issue-edit-btn'), 'a pencil says the row can be edited');
    assert.match(document.getElementById('issues_count').textContent, /1 open/);

    // The pencil opens the same inline editor the text does.
    click(window, '#scraped_issues_list .scraped-issue-edit-btn');
    await tick(window);
    const editor = document.querySelector('#scraped_issues_list .scraped-issue-edit');
    assert.ok(editor, 'the pencil opens the editor');
    editor.value = 'Awaiting SLT review';
    editor.dispatchEvent(new window.Event('blur'));
    await tick(window);
    assert.match(document.querySelector('.scraped-issue-text').textContent, /Awaiting SLT review/);

    click(window, '#scraped_issues_list .scraped-issue-resolve');
    await tick(window);
    assert.equal(document.querySelector('.scraped-issue-resolve').textContent, 'undo');
    assert.ok(document.querySelector('.scraped-issue-row').classList.contains('resolved'),
        'deleting strikes the row through rather than removing it');
    assert.match(document.getElementById('issues_count').textContent, /1 deleted/);
    close();
});

test('the note cannot be generated until the review method is answered', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    await tick(window);

    // Nothing is pre-ticked, so the strip starts genuinely unanswered.
    assert.equal(document.querySelector('input[name="reviewModeType"]:checked'), null,
        'no review method is assumed on the clinician\'s behalf');

    click(window, '#btn_generate_summary');
    await tick(window);
    assert.equal(document.getElementById('summary').value, '', 'no note until the question is answered');
    assert.equal(document.getElementById('reviewMethodPrompt').style.display, 'flex', 'the question is asked instead');

    // Answering it resumes the click that raised it - the button does not need pressing twice.
    click(window, '#btn_method_chart');
    await tick(window);
    assert.equal(document.getElementById('reviewMethodPrompt').style.display, 'none');
    const note = document.getElementById('summary').value;
    assert.ok(note.length > 0, 'the note generates once the method is known');
    assert.match(note, /Chart review/, 'and it records the method that was chosen');
    close();
});

test('a review method already chosen on the strip is not asked about again', async () => {
    // The prompt asks for the reviewer's initials too, so with both answered up front there
    // is nothing left to interrupt for.
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'reviewerInitials', 'CB');
    click(window, 'input[name="reviewModeType"][value="physical"]');
    await tick(window);

    click(window, '#btn_generate_summary');
    await tick(window);
    assert.notEqual(document.getElementById('reviewMethodPrompt').style.display, 'flex', 'no interruption');
    assert.match(document.getElementById('summary').value, /Physical review/);
    close();
});

test('the review method does not carry over to the next patient', async () => {
    const { window, document, close } = await loadTool();
    click(window, 'input[name="reviewModeType"][value="chart"]');
    type(window, 'ptName', 'ABC');
    await tick(window);
    assert.equal(document.querySelector('input[name="reviewModeType"]:checked').value, 'chart');

    click(window, '#clearDataBtnTop');
    click(window, '#confirmClearData');
    await tick(window);

    assert.equal(document.querySelector('input[name="reviewModeType"]:checked'), null,
        'the next patient starts with the question open, not the last answer');
    close();
});

test('the heart rate reads as a sentence with and without a rhythm', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'c_hr', '88');
    type(window, 'c_nibp', '120/70');
    await tick(window);
    generateNote(window);
    await tick(window);

    assert.match(document.getElementById('summary').value, /C: HR 88, NIBP 120\/70/, 'no gap before the comma');

    type(window, 'c_hr_rhythm', 'AF');
    await tick(window);
    generateNote(window);
    await tick(window);
    assert.match(document.getElementById('summary').value, /C: HR 88 \(AF\), NIBP 120\/70/, 'the rhythm keeps its space');
    close();
});

test('a half-typed stepdown date does not raise the quick review prompt', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    // What a date input reports part-way through typing the year "2026".
    type(window, 'stepdownDate', '0202-01-01');
    await tick(window);
    assert.notEqual(document.getElementById('quickReviewPrompt').style.display, 'flex',
        'a year that cannot be real is a typo in progress, not a long-stay patient');

    // A real stepdown two days ago still offers it.
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    type(window, 'stepdownDate', twoDaysAgo);
    await tick(window);
    assert.equal(document.getElementById('quickReviewPrompt').style.display, 'flex', 'the real offer still works');
    close();
});

test('mobility levels read as prose, and a scraped one is not stacked twice', async () => {
    const { window, document, close } = await loadTool();
    click(window, '.quick-select[data-target="ae_mobility"][data-value="1x assist"]');
    await tick(window);
    assert.equal(document.getElementById('ae_mobility').value, '1x assist', 'lower case mid-sentence');

    // A note imported from before this change carries the old capitalisation. Clicking the
    // button for what is already recorded must not record it a second time.
    type(window, 'ae_mobility', '1x Assist');
    click(window, '.quick-select[data-target="ae_mobility"][data-value="1x assist"]');
    await tick(window);
    assert.equal(document.getElementById('ae_mobility').value, '1x Assist', 'the scraped entry stands alone');
    close();
});

test('a score with no A-E findings prints as a bare score, not under a heading', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'adds', '2');
    await tick(window);
    generateNote(window);
    await tick(window);

    let note = document.getElementById('summary').value;
    assert.match(note, /ADDS: 2/, 'the score is there');
    assert.ok(!/A-E ASSESSMENT:/.test(note), 'with no heading announcing an assessment that was not done');

    // Record something under A-E and the heading comes back.
    type(window, 'b_rr', '18');
    await tick(window);
    generateNote(window);
    await tick(window);
    note = document.getElementById('summary').value;
    assert.match(note, /A-E ASSESSMENT:/, 'the heading returns once there is an assessment');
    assert.match(note, /ADDS: 2/);
    assert.match(note, /B: RR 18/);
    close();
});

// --- Home screen icons ------------------------------------------------------
//
// The live tool and the pilot are the same origin serving the same commit, so the icon a
// saved shortcut gets is decided at runtime from the path. These tests hold that apart:
// the static tags in index.html must be the live tool's, and only the pilot path may
// change them.

test('the path picks the icon set, and anything unrecognised gets the live tool', () => {
    assert.equal(iconSetForPath('/alert-tool-testing/'), 'test');
    assert.equal(iconSetForPath('/alert-tool-testing/index.html'), 'test');
    assert.equal(iconSetForPath('/ALERT-Tool/'), 'alert');
    assert.equal(iconSetForPath('/'), 'alert', 'a local file or preview server is not the pilot');
});

test('the page ships installable as a web app', async () => {
    const { document, close } = await loadTool();
    assert.ok(document.querySelector('link[rel="manifest"]'), 'has a manifest');
    assert.ok(document.querySelector('link[rel="apple-touch-icon"]'), 'iOS ignores manifest icons');
    assert.ok(document.querySelector('meta[name="theme-color"]'), 'has a theme colour');
    // iOS will not take an SVG or a data: URI here, which is why the PNGs are committed.
    const apple = document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href');
    assert.match(apple, /\.png$/, 'apple-touch-icon must be a real PNG file');
    close();
});

test('the live tool keeps the teal icon', async () => {
    const { document, close } = await loadTool({ url: 'https://alert-project.github.io/ALERT-Tool/' });
    assert.equal(document.getElementById('linkManifest').getAttribute('href'), 'manifest.json');
    assert.match(document.getElementById('linkAppleIcon').getAttribute('href'), /alert-180\.png$/);
    assert.equal(document.getElementById('metaThemeColor').getAttribute('content'), '#0f766e');
    assert.equal(document.getElementById('metaAppTitle').getAttribute('content'), 'A! Tool',
        'the label sitting under the icon on a home screen');
    assert.ok(!/PILOT/.test(document.title), 'the live tool does not call itself a pilot');
    close();
});

test('the pilot swaps to the amber TEST icon and says so in the title', async () => {
    const { document, close } = await loadTool({ url: 'https://alert-project.github.io/alert-tool-testing/' });
    assert.equal(document.getElementById('linkManifest').getAttribute('href'), 'manifest-test.json');
    assert.match(document.getElementById('linkAppleIcon').getAttribute('href'), /test-180\.png$/);
    assert.match(document.getElementById('linkFavicon').getAttribute('href'), /test\.svg$/);
    assert.equal(document.getElementById('metaThemeColor').getAttribute('content'), '#f59e0b');
    assert.equal(document.getElementById('metaAppTitle').getAttribute('content'), 'A! Test',
        'the label sitting under the icon on a home screen');
    assert.match(document.title, /PILOT/, 'standalone mode hides the URL bar, so the title has to say it');
    close();
});

test('the version in the footer matches the one in the file banner', () => {
    // Two hand-maintained strings that mean the same thing. They went out of step once and
    // stayed that way through several releases, because only one of them is on screen.
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const stamps = [...html.matchAll(/ALERT (?:Nursing Risk Assessment )?Tool\s+(A[\d.]+)\s+\(([^)]+)\)/g)]
        .map(m => `${m[1]} (${m[2]})`);
    assert.equal(stamps.length, 2, 'banner comment and page footer');
    assert.equal(stamps[0], stamps[1], 'version and date must agree');
});

test('the DMR prompt asks for initials without demanding them', async () => {
    // A reminder, not a gate. A reviewer who would rather not name themselves has to be able
    // to write the note anyway, or the tool stops being usable at the one moment it matters -
    // and the handover line then carries no initials rather than a stub.
    {
        const { window, document, close } = await loadTool();
        type(window, 'ptName', 'ABC');
        await tick(window);
        click(window, '#btn_generate_summary');
        const prompt = document.getElementById('reviewMethodPrompt');
        assert.equal(prompt.style.display, 'flex', 'the prompt is raised');
        assert.notEqual(document.getElementById('review_prompt_initials').style.display, 'none',
            'and asks for initials, because none were entered');

        // Straight past it, naming nobody.
        click(window, '#btn_method_physical');
        await tick(window);
        assert.ok(document.getElementById('summary').value.length > 0, 'the note still generates');
        const handover = document.getElementById('handoverLine').value;
        assert.ok(!/--/.test(handover.split('.')[0]), `no stub initials: ${handover}`);
        assert.match(handover, /^\d+\/\d+ \d{2}:\d{2}\. PHYSICAL R\/V\./, 'date, time, then straight on');
        close();
    }

    // Answered, it signs the note and fills the strip field, so there is one reviewer value.
    {
        const { window, document, close } = await loadTool();
        type(window, 'ptName', 'ABC');
        await tick(window);
        generateNote(window, 'physical', 'cb');
        await tick(window);
        assert.equal(document.getElementById('reviewerInitials').value, 'cb',
            'written back to the strip, not held only in the dialog');
        assert.match(document.getElementById('handoverLine').value, /^\d+\/\d+ \d{2}:\d{2} CB\./,
            'and upper-cased into the handover line');
        close();
    }
});

test('an empty reviewer box is asked about every time, and Continue waves it past', async () => {
    // This was once suppressed after the first refusal, which made the prompt depend on state
    // nothing on screen showed: skipping the initials on one patient silenced it for the next
    // one too, unless Clear Data happened to have been pressed in between.
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    await tick(window);

    generateNote(window);              // answers method, declines to give initials
    await tick(window);
    assert.ok(document.getElementById('summary').value.length > 0, 'the note is written');

    // A second patient in the same tab, without Clear Data in between.
    type(window, 'ptName', 'DEF');
    await tick(window);
    click(window, '#btn_generate_summary');
    assert.equal(document.getElementById('reviewMethodPrompt').style.display, 'flex',
        'still asked, because the box is still empty');
    assert.equal(document.getElementById('review_prompt_title').textContent, 'Initials for Excel handover',
        'and only about the initials, the method having been answered already');

    click(window, '#btn_prompt_continue');
    await tick(window);
    assert.ok(document.getElementById('summary').value.length > 0, 'Continue writes the note');
    assert.equal(document.getElementById('reviewerInitials').value, '', 'and names nobody');

    // Two letters end it for good.
    type(window, 'reviewerInitials', 'CB');
    await tick(window);
    click(window, '#btn_generate_summary');
    assert.notEqual(document.getElementById('reviewMethodPrompt').style.display, 'flex',
        'nothing left to ask');
    close();
});

test('with the method already chosen, the prompt asks only for the initials', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    click(window, 'input[name="reviewModeType"][value="chart"]');
    await tick(window);

    click(window, '#btn_generate_summary');
    assert.equal(document.getElementById('reviewMethodPrompt').style.display, 'flex');
    assert.equal(document.getElementById('review_prompt_method_actions').style.display, 'none',
        'the answered half is not asked again');
    assert.equal(document.getElementById('review_prompt_continue_actions').style.display, 'flex');

    document.getElementById('promptReviewerInitials').value = 'jd';
    click(window, '#btn_prompt_continue');
    await tick(window);
    assert.match(document.getElementById('handoverLine').value, /JD\. CHART R\/V\./,
        'the method already chosen is kept, not overwritten by the dialog');
    close();
});

test('the SpO2 target offers the default and the exception, and nothing in between', async () => {
    // An explicitly-chosen 94% and the default read identically and print identically, so a
    // third option only asked the reviewer to tell two identical states apart.
    const { window, document, close } = await loadTool();
    const opts = [...document.querySelectorAll('#spo2_target option')].map(o => o.value);
    assert.deepEqual(opts, ['', '88_92']);

    type(window, 'ptName', 'ABC');
    await tick(window);
    generateNote(window);
    await tick(window);
    assert.ok(!/SpO2 target/.test(document.getElementById('summary').value),
        'the default is never written down');
    close();
});

test('a note carrying the old 94% target imports as the default, not as nothing', async () => {
    // Notes written before the target became a two-way choice are still being scraped, and
    // 94% now means the same thing the default does.
    const { window, document, close } = await loadTool();
    click(window, '#btnOpenImport');
    document.getElementById('importText').value =
        'Age: 70\nSpO2 target: 94%\nTime of review: 09:00\n';
    click(window, '#runImport');
    await tick(window, 900);
    assert.equal(document.getElementById('spo2_target').value, '',
        'no option to select, and the default is the right landing place');
    close();
});

test('a COPD patient at target still scores, and the calculator says so', async () => {
    // The total has to match the ward's observation chart, so the scale never changes - but a
    // patient sitting mid-target and scoring 2 at every set of obs is exactly the situation a
    // MODS exists for, and most of these patients have not got one.
    const { window, document, close } = await loadTool();
    const hint = () => document.getElementById('calc_spo2_target_hint').textContent;
    const setCalc = (v) => {
        const el = document.getElementById('calc_spo2');
        el.value = v;
        el.dispatchEvent(new window.Event('input', { bubbles: true }));
    };

    setCalc('90');
    await tick(window);
    assert.equal(document.getElementById('adds').value, '2',
        'the standard scale, whatever the target - the obs chart says 2 and so must this');
    assert.equal(hint(), '', 'nothing to suggest until a lower target is set');

    type(window, 'spo2_target', '88_92');
    await tick(window);
    assert.equal(document.getElementById('adds').value, '2', 'the score is unchanged by the target');
    assert.match(hint(), /within the 88-92% target but still scores 2/);
    assert.match(hint(), /MODS/, 'and names the paperwork that would stop it');

    // Below the target it is scoring for the right reason, so there is nothing to suggest.
    setCalc('86');
    await tick(window);
    assert.equal(hint(), '');

    // Nor once the modification actually exists.
    setCalc('90');
    await tick(window);
    assert.match(hint(), /MODS/);
    click(window, '#chk_use_mods');
    await tick(window);
    assert.equal(hint(), '', 'no point suggesting what is already in place');
    close();
});

test('the DMR prompt stops being a question when it has two to ask', async () => {
    // A heading reading "How did you review this patient?" with an initials box directly under
    // it reads as though the box were the answer to it. The initials cannot move below the
    // buttons either - those dismiss the dialog - so the title gives way instead.
    const shape = (document) => ({
        title: document.getElementById('review_prompt_title').textContent,
        initials: document.getElementById('review_prompt_initials').style.display !== 'none',
        methodQ: document.getElementById('review_prompt_method_label').style.display !== 'none',
        initialsQ: document.getElementById('review_prompt_initials_label').style.display !== 'none',
        buttons: document.getElementById('review_prompt_method_actions').style.display !== 'none'
    });

    {
        const { window, document, close } = await loadTool();
        type(window, 'ptName', 'ABC');
        await tick(window);
        click(window, '#btn_generate_summary');
        const s = shape(document);
        assert.equal(s.title, 'Helpful hints', 'the title stops asking');
        assert.ok(s.initials && s.methodQ && s.buttons, 'and both questions are labelled');
        close();
    }

    // One question left, and the title asks it - no second heading repeating it underneath.
    {
        const { window, document, close } = await loadTool();
        type(window, 'ptName', 'ABC');
        type(window, 'reviewerInitials', 'CB');
        await tick(window);
        click(window, '#btn_generate_summary');
        const s = shape(document);
        assert.equal(s.title, 'How did you review this patient?');
        assert.ok(!s.initials, 'nothing to ask about the initials');
        assert.ok(!s.methodQ, 'and the title is not echoed above the buttons');
        close();
    }

    {
        const { window, document, close } = await loadTool();
        type(window, 'ptName', 'ABC');
        click(window, 'input[name="reviewModeType"][value="chart"]');
        await tick(window);
        click(window, '#btn_generate_summary');
        const s = shape(document);
        assert.equal(s.title, 'Initials for Excel handover',
            'the wording never implies a stored, signed record - it is one spreadsheet cell');
        assert.ok(s.initials && !s.buttons);
        assert.ok(!s.initialsQ, 'the title carries it, so the label does not repeat it');
        close();
    }
});

// --- The score the note reports ------------------------------------------------------------

test('the MODS checkbox records MODS, and the note reports it', async () => {
    // "MODS in place?" set only its own .checked. refreshAddsOverrideUI drives that box from
    // the hidden addsManual field, and the calculator's own change listener wrote to #adds the
    // instant the box moved - so the tick was undone on the same gesture that made it, and
    // every MODS patient's note went on printing an ADDS of 0.
    const { window, document, close } = await loadTool();
    const chk = document.getElementById('chk_use_mods');
    chk.checked = true;
    chk.dispatchEvent(new window.Event('change', { bubbles: true }));
    await tick(window);
    assert.equal(chk.checked, true, 'the box stays ticked');
    assert.equal(document.getElementById('addsManual').value, 'true', 'and moves the state behind it');

    type(window, 'mods_score', '4');
    type(window, 'mods_details', 'parameters modified');
    await tick(window);
    assert.equal(document.getElementById('adds').value, '4', 'the score reaches what the rules read');

    generateNote(window);
    await tick(window);
    const note = document.getElementById('summary').value;
    assert.match(note, /MODS: 4 \(parameters modified\)/, 'the note reports MODS');
    assert.doesNotMatch(note, /^ADDS:/m, 'and not ADDS');
    assert.match(document.getElementById('handoverLine').value, /MODS 4\./);
    close();
});

test('an untouched calculator does not wipe a score that was entered', async () => {
    // runCalc fires for things outside the calculator - the MODS box, the SpO2 target - and
    // wrote its total through unconditionally. An empty calculator totals 0, so those wrote a
    // 0 over whatever the clinician had typed.
    const { window, document, close } = await loadTool();
    type(window, 'adds', '5');
    await tick(window);
    const target = document.getElementById('spo2_target');
    target.value = '88_92';
    target.dispatchEvent(new window.Event('change', { bubbles: true }));
    await tick(window);
    assert.equal(document.getElementById('adds').value, '5', 'the typed score survives');

    // A calculator that has actually been filled in still owns the score.
    type(window, 'calc_rr', '30');
    await tick(window);
    assert.equal(document.getElementById('adds').value, '3');
    close();
});

// --- Importing over a form that is not empty -----------------------------------------------

const twoPatientNote = (name, extras) => [
    'ALERT CNS post ICU review - Physical review',
    `Patient: ${name} | URN: ...123 | Location: 3A, Room: 24B`,
    ...(extras || []),
    '',
    'LINES, DRAINS, DEVICES & WOUNDS:',
    ...(extras ? ['- CVC - RIJ'] : ['- PIVC - left ACF']),
    '',
    'PATIENT FACTORS:',
    '- Mobility: 2x assist with sara steady',
    '- Diet: Sips water',
    '- Sleep: Poor',
    '- Psychological issues: Delirium',
    '',
    'IDENTIFIED ICU READMISSION RISK FACTORS:',
    '- None identified',
    '',
    'PLAN:',
    '- ALERT nursing post ICU reviews continue.'
].join('\n');

test('the sections after the device list do not arrive as devices', async () => {
    // PATIENT FACTORS was missing from the device block's terminators, and it is the section
    // that follows the devices in every note the tool writes - so mobility, diet, sleep and the
    // psych answer were all read back as "Other Device".
    const { window, document, close } = await loadTool();
    await importNote(window, document, twoPatientNote('ABC', ['Age: 71']));
    const devices = [...document.querySelectorAll('.device-entry')]
        .map(e => `${e.dataset.type}: ${e.querySelector('.device-textarea')?.value || ''}`);
    assert.deepEqual(devices, ['CVC: RIJ'], 'only the device is a device');
    assert.equal(document.getElementById('ae_mobility').value, '2x assist with sara steady',
        'mobility still lands in its own field');
    assert.equal(document.getElementById('ae_diet').value, 'Sips water');
    close();
});

test('importing a second patient does not inherit the first', async () => {
    // The importer wrote only the fields its note mentioned, so everything the new note was
    // silent about - weight, allergies, PMH, the whole device list, the previous bloods, the
    // carried gates - stayed on screen under the second patient's name.
    const { window, document, close } = await loadTool();
    await importNote(window, document, twoPatientNote('ABC', [
        'Age: 71, Weight: 80kg', 'Allergies: Penicillin', 'GOC: For full active treatment'
    ]));
    assert.equal(document.getElementById('ptWeight').value, '80', 'first patient is loaded');

    click(window, '#btnOpenImport');
    document.getElementById('importText').value = twoPatientNote('XYZ');
    click(window, '#runImport');
    await tick(window, 300);
    assert.equal(document.getElementById('importOverwriteModal').style.display, 'flex',
        'a second import over a live form asks first');
    assert.equal(document.getElementById('ptName').value, 'ABC', 'and changes nothing until answered');

    click(window, '#confirmImportOverwrite');
    await tick(window, 900);
    assert.equal(document.getElementById('ptName').value, 'XYZ');
    assert.equal(document.getElementById('ptWeight').value, '', 'the first patient\'s weight is gone');
    assert.equal(document.getElementById('allergies_note').value, '');
    assert.equal(document.getElementById('goc_note').value, '');
    assert.deepEqual([...document.querySelectorAll('.device-entry')].map(e => e.dataset.type), ['PIVC'],
        'and their devices with them');
    close();
});

test('cancelling the overwrite keeps both the form and the pasted note', async () => {
    const { window, document, close } = await loadTool();
    await importNote(window, document, twoPatientNote('ABC', ['Age: 71']));

    click(window, '#btnOpenImport');
    document.getElementById('importText').value = twoPatientNote('XYZ');
    click(window, '#runImport');
    await tick(window, 300);
    click(window, '#cancelImportOverwrite');
    await tick(window, 300);

    assert.equal(document.getElementById('ptName').value, 'ABC', 'nothing was cleared');
    assert.equal(document.getElementById('importModal').style.display, 'flex', 'back at the import box');
    assert.match(document.getElementById('importText').value, /XYZ/, 'with the note still in it');
    close();
});

// --- Who did the review: team and grade -------------------------------------------------
//
// The team is Pre-Stepdown only, and hiding it is not enough on its own: a concealed ICU
// still prints "ICU CNS" at the head of a post-stepdown note, so these check the value is
// pushed back to ALERT rather than merely put out of sight.

const shown = (window, selector) => {
    const el = window.document.querySelector(selector);
    return !!el && !el.hidden && el.style.display !== 'none';
};

test('the reviewing team is offered Pre-Stepdown only, and forced back to ALERT on the way out', async () => {
    const { window, close } = await loadTool();
    assert.equal(shown(window, '#reviewTeamWrapper'), false, 'no team toggle on a post review');
    assert.equal(shown(window, '#btnRedcap'), true, 'REDCap is an ALERT activity, and this is ALERT');

    click(window, 'input[name="reviewType"][value="pre"]');
    await tick(window);
    assert.equal(shown(window, '#reviewTeamWrapper'), true, 'offered pre-stepdown');

    click(window, 'input[name="reviewTeam"][value="ICU"]');
    await tick(window);
    assert.equal(shown(window, '#clinicianGradeToggle label[data-team="ALERT"]'), false, 'no CN in ICU');
    assert.equal(shown(window, '#clinicianGradeToggle label[data-team="ICU"]'), true, 'CNC is an ICU grade');
    assert.equal(shown(window, '#btnRedcap'), false,
        'alert_team has no code that would be true of an ICU reviewer, so the button goes');

    click(window, 'input[name="clinicianGrade"][value="CNC"]');
    click(window, 'input[name="reviewType"][value="post"]');
    await tick(window);
    assert.equal(window.document.querySelector('input[name="reviewTeam"]:checked').value, 'ALERT',
        'the team is reset, not just hidden');
    assert.equal(window.document.querySelector('input[name="clinicianGrade"]:checked').value, 'CNS',
        'a grade the new team does not hold falls back to the one they share');
    assert.equal(shown(window, '#btnRedcap'), true, 'and REDCap comes back');
    close();
});

test('an ICU CNC pre-stepdown review says so at the head of the note', async () => {
    const { window, close } = await loadTool();
    click(window, 'input[name="reviewType"][value="pre"]');
    await tick(window);
    click(window, 'input[name="reviewTeam"][value="ICU"]');
    await tick(window);
    click(window, 'input[name="clinicianGrade"][value="CNC"]');
    type(window, 'ptName', 'ABC');
    type(window, 'adds', '2');
    await tick(window, 600);
    generateNote(window, 'physical', 'CB');
    await tick(window, 600);
    const note = window.document.getElementById('summary').value;
    assert.match(note.split('\n')[0], /^ICU CNC Pre-Stepdown Review - Physical review$/);
    close();
});

// --- Quick Review section chips ----------------------------------------------------------
//
// Quick Review shuts the bloods panel and floats the calculator, so a card that holds six
// results looks exactly like one that holds none. The chips say what is on each card. What
// they must never do is promise more than the note goes on to print.

const chipText = (window, id) => window.document.getElementById(id).textContent;

test('the Quick Review chips report what each card is holding', async () => {
    const { window, close } = await loadTool();
    type(window, 'adds', '4');
    type(window, 'bl_k', '3.1');
    type(window, 'bl_cr_review', '180');
    await tick(window, 600);
    assert.equal(chipText(window, 'qrChipBloods'), '', 'silent in full review - nothing is hidden there');

    click(window, 'input[name="reviewDepth"][value="quick"]');
    await tick(window, 700);
    assert.equal(chipText(window, 'qrChipAdds'), '✓ ADDS 4');
    assert.equal(chipText(window, 'qrChipBloods'), '✓ 2 results entered');
    assert.equal(chipText(window, 'qrChipDevices'), '', 'no lines, nothing to report');

    // The three quick buttons are an answer in themselves, not a count of zero.
    click(window, '#seg_bloods_status .seg-btn[data-value="nil_sig"]');
    await tick(window, 600);
    assert.equal(chipText(window, 'qrChipBloods'), '✓ Nil significant');

    click(window, '[data-device-type="PIVC"]');
    await tick(window, 600);
    assert.equal(chipText(window, 'qrChipDevices'), '✓ 1 recorded');

    click(window, 'input[name="reviewDepth"][value="full"]');
    await tick(window, 700);
    assert.equal(chipText(window, 'qrChipAdds'), '', 'taken off on the way out');
    close();
});

test('the bloods chip never counts a result the note leaves out', async () => {
    const { window, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'bl_wcc', '14');
    type(window, 'bl_mg', '0.6');
    await tick(window, 600);
    click(window, 'input[name="reviewDepth"][value="quick"]');
    await tick(window, 700);
    const claimed = Number(chipText(window, 'qrChipBloods').match(/(\d+)/)[1]);

    generateNote(window, 'physical', 'CB');
    await tick(window, 600);
    const line = window.document.getElementById('summary').value.split('\n').find(l => l.startsWith('Bloods'));
    const printed = line.split(': ')[1].split(', ').length;
    assert.equal(claimed, printed, `the chip claimed ${claimed}; the note printed ${printed} — "${line}"`);
    close();
});

// --- Pre-Stepdown: the category settles a duration, not a discharge -----------------------
//
// The Quick Review prompt used to run its Post-Stepdown wording whatever the review type, and
// calculateWardTime returns the literal string "(Pre-Stepdown)" as its time - so it asked
// "(Pre-Stepdown) on the list - CAT 3 - can this patient be discharged from ALERT?" about a
// patient who had not yet left the unit and was on no list to be discharged from.

test('a Pre-Stepdown category states how long ALERT will carry the patient, not whether to discharge', async () => {
    const { window, document, close } = await loadTool();
    click(window, 'input[name="reviewType"][value="pre"]');
    type(window, 'ptName', 'ABC');
    type(window, 'adds', '2');
    await tick(window);
    click(window, 'input[name="reviewDepth"][value="quick"]');
    await tick(window, 700);

    const prompt = document.getElementById('qr_discharge_prompt');
    assert.ok(prompt.hidden, 'still nothing said until the category is chosen');

    const ladder = [['#override_green', 'CAT 3 - up to 24h on the ALERT list after stepdown.'],
                    ['#override_amber', 'CAT 2 - up to 48h on the ALERT list after stepdown.'],
                    ['#override_red', 'CAT 1 - up to 72h on the ALERT list after stepdown.']];
    for (const [btn, expected] of ladder) {
        click(window, btn);
        await tick(window);
        assert.ok(!prompt.hidden, `${btn} says something`);
        assert.equal(prompt.textContent.trim(), expected);
    }

    // CAT 2's silence Post-Stepdown exists to avoid leading a discharge decision. There is no
    // discharge decision here to lead, so all three categories speak.
    assert.ok(!/discharge/i.test(prompt.textContent), 'discharge is not a Pre-Stepdown question');
    assert.ok(!/Pre-Stepdown\) on the list/.test(prompt.textContent),
        'and the time-on-list placeholder never reaches the sentence');
    close();
});

test('the Quick Review hint is silent while it would only repeat the category above it', async () => {
    const { window, document, close } = await loadTool();
    type(window, 'ptName', 'ABC');
    type(window, 'adds', '5');   // computes CAT 1
    await tick(window);
    click(window, 'input[name="reviewDepth"][value="quick"]');
    await tick(window, 700);

    const hint = document.getElementById('override_auto_hint');
    assert.equal(hint.textContent, '', 'nothing chosen yet - the category shown above IS the calculated one');

    click(window, '#override_red');
    await tick(window);
    assert.equal(hint.textContent, '', 'agreeing with the tool leaves nothing between them');

    // Once they part company the hint is the only surviving record of what the tool made of
    // the score and the bloods, so that is when it speaks.
    click(window, '#override_green');
    await tick(window);
    assert.match(hint.textContent, /CAT 1.*score and bloods/);
    close();
});

// --- ICU medical rounding: a referral is not an entry on a list --------------------------

test('an ICU reviewer is told to ring the ALERT CN, and the note says the referral is outstanding', async () => {
    const { window, document, close } = await loadTool();
    click(window, 'input[name="reviewType"][value="pre"]');
    await tick(window);
    click(window, 'input[name="reviewTeam"][value="ICU"]');
    await tick(window);
    click(window, 'input[name="clinicianGrade"][value="CNC"]');
    type(window, 'ptName', 'ABC');
    await tick(window);

    assert.equal(shown(window, '#icu_rounding_call_prompt'), false, 'nothing asked for until rounding is wanted');

    click(window, '#seg_medical_rounding_prestepdown .seg-btn[data-value="true"]');
    await tick(window, 600);
    assert.equal(shown(window, '#icu_rounding_call_prompt'), true);
    assert.match(document.getElementById('icu_rounding_call_prompt').textContent, /29461/);

    generateNote(window, 'physical', 'CB');
    await tick(window, 600);
    let note = document.getElementById('summary').value;
    assert.match(note, /- Referred for ALERT medical rounding - ALERT CN to be contacted\./);
    assert.ok(!/added to ALERT medical rounding list/.test(note),
        'an ICU CNC cannot add anyone to the POC list, so the note does not say they did');

    // The same answer from an ALERT reviewer, who holds the list themselves.
    click(window, 'input[name="reviewTeam"][value="ALERT"]');
    await tick(window, 600);
    assert.equal(shown(window, '#icu_rounding_call_prompt'), false, 'ALERT staff have the list in front of them');
    click(window, '#btn_generate_summary');
    await tick(window, 600);
    note = document.getElementById('summary').value;
    assert.match(note, /- Patient added to ALERT medical rounding list for further review\./);
    close();
});

test('the Pre-Stepdown rounding toggle reaches the note at all', async () => {
    // seg_medical_rounding_prestepdown was not in segmentedInputs and never touched
    // chk_medical_rounding, so pressing Yes highlighted a button and changed nothing:
    // the answer reached neither the plan nor the note.
    const { window, document, close } = await loadTool();
    click(window, 'input[name="reviewType"][value="pre"]');
    type(window, 'ptName', 'ABC');
    await tick(window);
    click(window, '#seg_medical_rounding_prestepdown .seg-btn[data-value="true"]');
    await tick(window, 600);
    assert.equal(document.getElementById('chk_medical_rounding').checked, true,
        'the buttons write through to the checkbox every other reader looks at');
    assert.match(document.getElementById('followUpInstructions').textContent, /Medical Rounding/i);

    generateNote(window, 'physical', 'CB');
    await tick(window, 600);
    assert.match(document.getElementById('summary').value, /medical rounding/i);
    close();
});

test('the two Quick Review lists say what belongs on them', async () => {
    // "Patient Factors" and "Readmission Risks" is the whole of the distinction on screen, and
    // which list a line belongs on is not self-evident from those two words. jsdom has no
    // layout engine, so what is testable here is that the hint exists, says the right thing,
    // and can be reached without a mouse - the appearance is style.css's business.
    const { window, document, close } = await loadTool();
    const factors = document.querySelector('#patient_factors_wrapper .card-title');
    const risks = document.querySelector('#scraped_risks_wrapper .card-title');

    assert.match(factors.dataset.hint, /[Mm]obility.*bowels.*diet.*PICS/,
        'names the kinds of thing that go on it');
    assert.ok(!/risk/i.test(factors.dataset.hint.split(' - ')[0]),
        'and leads with what it is, not with what it is not');
    assert.match(risks.dataset.hint, /back to ICU/);

    assert.equal(factors.getAttribute('tabindex'), '0', 'reachable by keyboard and by tap');
    assert.equal(risks.getAttribute('tabindex'), '0');
    close();
});
