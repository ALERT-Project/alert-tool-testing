/* ===========================
   1. Utilities & Configuration (v5.8)
   =========================== */
const $ = id => document.getElementById(id);
const debounce = (fn, wait=300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn.apply(this,a), wait); }; };
const computeAllAndSave = ()=>{ computeAll(); saveState(true); };
const num = v => { const x = parseFloat(v); return isNaN(x) ? null : x; };

const STORAGE_KEY = 'alertNursingToolData_v5.8';

// Ranges
const normalRanges = {
  wcc: { low: 4.0, high: 11.0 },
  hb: { low: 115, high: 165 },
  plts: { low: 150, high: 400 },
  k: { low: 3.5, high: 5.2 },
  na: { low: 135, high: 145 },
  cr_review: { low: 50, high: 100 },
  mg: { low: 0.70, high: 1.10 },
  phos: { low: 0.80, high: 1.50 },
  alb: { low: 32, high: 50 },
  lactate: { low: 0.5, high: 2.0 },
  neut: { low: 1.5, high: 7.5 },
  lymph: { low: 1.0, high: 4.0 },
  urea: { low: 2.5, high: 7.5 },
  egfr: { low: 60, high: 999 },
  crp: { low: 0, high: 10 }
};

// Map input IDs to Range Keys
const rangeMap = {
    'lactate': 'lactate', 'bl_lac_review': 'lactate',
    'hb': 'hb', 'bl_hb': 'hb',
    'wcc': 'wcc', 'bl_wcc': 'wcc',
    'crp': 'crp', 'bl_crp': 'crp',
    'neut': 'neut', 'bl_neut': 'neut',
    'lymph': 'lymph', 'bl_lymph': 'lymph',
    'bl_cr_review': 'cr_review',
    'bl_k': 'k', 'bl_na': 'na',
    'bl_mg': 'mg', 'bl_phos': 'phos',
    'bl_plts': 'plts', 'bl_alb': 'alb',
    'bl_urea': 'urea', 'bl_egfr': 'egfr'
};

const staticInputs = [
  'ptName','ptMrn','ptAge','ptWard','ptBed','ptWardOther','ptAdmissionReason','icuLos','stepdownDate',
  'npFlow','hfnpFio2','hfnpFlow','nivFio2', 'nivPeep', 'nivPs','override','overrideNote',
  'trache_details_note',
  'mods_score','mods_details','airway_a','b_rr','b_spo2','b_device','b_wob',
  'c_hr','c_hr_rhythm','c_nibp','c_cr','c_perf','d_alert','d_pain','e_temp','e_bsl','e_uop','atoe_adds',
  'ae_mobility','ae_diet','ae_bowels','bowel_date',
  'bl_wcc','bl_crp','bl_neut','bl_lymph',
  'bl_hb','bl_plts','bl_k','bl_na',
  'bl_cr_review','bl_mg','bl_alb','bl_lac_review','bl_phos',
  'bl_urea', 'bl_egfr',
  'elec_replace_note', 'goc_note', 'allergies_note', 'pics_note', 'context_other_note', 'pmh_note',
  'adds','lactate','hb','wcc','crp','neut','lymph', 'infusions_note',
  'dyspneaConcern_note', 'renalConcern_note', 'uopLow_note', 'neuroConcern_note', 'infectionConcern_note',
  'electrolyteConcern_note',
  'after_hours_note', 'pressors_note', 'hist_o2_note', 'rapid_wean_note', 'immobility_note', 'comorb_other_note',
  'intubation_details', 'hb_dropping_note'
];

const segmentedInputs = [
  'hb_dropping', 'after_hours', 'pressors', 'hist_o2', 'intubated', 'rapid_wean',
  'renal', 'uop', 'immobility', 'infection', 'new_bloods_ordered'
];

const toggleInputs = [
  'comorb_copd','comorb_hf','comorb_esrd','comorb_diabetes','comorb_cirrhosis', 'comorb_other'
];

const selectInputs = [
    'oxMod','dyspneaConcern','neuroConcern','neuroType','electrolyteConcern','stepdownTime',
    'tracheType', 'tracheStatus', 'pressorReason', 'intubatedReason'
];
const deviceTypes = ['CVC', 'Other CVAD', 'PIVC', 'PICC Line', 'Enteral Tube', 'IDC', 'Pacing Wire', 'Drain', 'Wound', 'Other Device'];

/* ===========================
   2. DOM & UI Helpers
   =========================== */

function stackText(id, text) {
    const el = $(id);
    if (!el) return;
    if (el.value.trim() === "") el.value = text;
    else if (!el.value.includes(text)) el.value = el.value + ", " + text;
    el.dispatchEvent(new Event('input'));
}

function openAccordion(id) {
    const wrapper = document.querySelector(`.accordion-wrapper[data-accordion-id="${id}"]`);
    if(wrapper) {
        const panel = wrapper.querySelector('.panel');
        const btn = wrapper.querySelector('.accordion');
        if (panel.style.display !== 'block') {
            panel.style.display = 'block';
            btn.setAttribute('aria-expanded', 'true');
            btn.querySelector('.icon').textContent = '[-]';
        }
    }
}

function createDeviceEntry(type, value = '', isGhostCandidate = false) {
    const container = $('devices-container');
    const div = document.createElement('div');
    div.className = 'device-entry';
    div.dataset.type = type;

    if (!isGhostCandidate) {
        div.innerHTML = `
            <label>${type}</label>
            <div style="display: flex; gap: 8px; align-items: center;">
                <textarea style="flex: 1;" placeholder="Enter details...">${value}</textarea>
                <div class="remove-entry" role="button" tabindex="0" style="cursor:pointer; color:var(--red); font-weight:700;">Remove</div>
            </div>
        `;
        container.appendChild(div);
        div.querySelector('textarea').addEventListener('input', debounce(() => { computeAll(); saveState(); }, 300));
        div.querySelector('.remove-entry').addEventListener('click', () => { div.remove(); computeAll(); saveState(); });
    } else {
        // Ghost Device (Confirm Box)
        div.style.border = "2px dashed var(--blue-hint)";
        div.style.padding = "8px";
        div.style.marginBottom = "8px";
        div.style.borderRadius = "6px";
        div.style.backgroundColor = "rgba(37, 99, 235, 0.05)";
        div.innerHTML = `
            <div style="font-weight:bold; color:var(--blue-hint); margin-bottom:4px;">
                ❓ Confirm Device: ${type}
            </div>
            <div style="margin-bottom:8px; font-size:0.9em;">${value}</div>
            <div style="display:flex; gap:8px;">
                <button class="btn small primary confirm-dev">Confirm</button>
                <button class="btn small danger remove-dev">Ignore</button>
            </div>
        `;
        container.appendChild(div);
        div.querySelector('.confirm-dev').addEventListener('click', (e) => {
             e.preventDefault();
             div.remove();
             createDeviceEntry(type, value, false);
             computeAllAndSave();
        });
        div.querySelector('.remove-dev').addEventListener('click', (e) => {
             e.preventDefault();
             div.remove();
        });
    }
}

function checkBloodRanges() {
    for (const [inputId, rangeKey] of Object.entries(rangeMap)) {
        const input = $(inputId);
        const rangeSpan = $(inputId + '_range');
        if (!input || !rangeSpan) continue;

        const range = normalRanges[rangeKey];
        if (!range) continue;
        rangeSpan.textContent = `${range.low} - ${range.high}`;

        const val = parseFloat(input.value);
        if (!isNaN(val)) {
            if (val < range.low || val > range.high) {
                input.classList.add('blood-abnormal');
            } else {
                input.classList.remove('blood-abnormal');
            }
        } else {
            input.classList.remove('blood-abnormal');
        }
    }
}

/* ===========================
   3. The DMR Scraper (Import)
   =========================== */
function processDmrNote() {
    const text = $('dmrPasteInput').value;
    if(!text) return;

    $('pasteError').style.display = 'none';

    // 1. Clear previous ghosts and data
    document.querySelectorAll('.ghost-val').forEach(el => el.textContent = '');
    document.querySelectorAll('.ghost-risk').forEach(el => el.textContent = '');
    document.querySelectorAll('.scraped-fixed').forEach(el => el.classList.remove('scraped-fixed'));
    $('prevRiskList').innerHTML = ''; 
    $('prevRiskContainer').style.display = 'none';

    let foundBloods = false;
    let foundAE = false;

    // Helpers
    const setFixed = (id, val) => {
        const el = $(id);
        if(!el || !val) return;
        el.value = val.trim();
        el.classList.add('scraped-fixed');
        el.dispatchEvent(new Event('input'));
    };

    const setGhost = (id, val, isAE = false) => {
        const ghostEl = document.getElementById('ghost_' + id);
        if(ghostEl && val) {
            ghostEl.textContent = `(${val.trim()})`; 
            if (isAE) foundAE = true;
        }
    };
    
    // Set text on the new ghost-risk spans (e.g. "Prev: Renal Concern")
    const setGhostRisk = (id, val) => {
        const el = document.getElementById(id);
        if (el && val) {
            let displayVal = val.replace(/^[-*•]\s*/, '').trim();
            el.textContent = `(Prev: ${displayVal})`;
        }
    };

    const extract = (regex) => { const m = text.match(regex); return m ? m[1].trim() : null; };

    // --- A. Headers ---
    const headerMatch = text.match(/Patient:\s*([^|]+?)\s*\|\s*URN:\s*([^|]+?)\s*\|\s*Location:\s*(.*?)(\n|$)/i);
    if (headerMatch) {
        setFixed('ptName', headerMatch[1]);
        setFixed('ptMrn', headerMatch[2].replace(/\./g, '').trim());
        
        const locString = headerMatch[3].trim();
        const wardSelect = $('ptWard');
        let foundWard = false;

        for (let i = 0; i < wardSelect.options.length; i++) {
            const optVal = wardSelect.options[i].value;
            if (optVal && locString.includes(optVal)) {
                wardSelect.selectedIndex = i;
                wardSelect.dispatchEvent(new Event('change'));
                foundWard = true;
                const bedPart = locString.replace(optVal, '').trim();
                const bedMatch = bedPart.match(/(\d+)$/);
                if(bedMatch) setFixed('ptBed', bedMatch[1]);
                break;
            }
        }
        if (!foundWard) {
            wardSelect.value = "Other";
            wardSelect.dispatchEvent(new Event('change'));
            setFixed('ptWardOther', locString);
            const bedMatchFallback = locString.match(/(\d+)$/);
            if(bedMatchFallback) setFixed('ptBed', bedMatchFallback[1]);
        }
    }

    // --- B. ICU Data ---
    const los = extract(/ICU LOS\s*[:]?\s*(\d+)/i);
    if(los) setFixed('icuLos', los);

    const admission = extract(/Reason for ICU Admission\s*[:]?\s*(.*?)(?=\n|$|ALERT)/i);
    if(admission) setFixed('ptAdmissionReason', admission);

    const dateMatch = extract(/(?:Discharged.*?|ICU Discharge Date)\s*[:]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
    if(dateMatch) {
         const parts = dateMatch.split(/[\/\-\.]/);
         if(parts.length === 3) {
             let d = parts[0], m = parts[1], y = parts[2];
             if(y.length === 2) y = "20" + y;
             setFixed('stepdownDate', `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
         }
    }

    const timeMatch = extract(/Time of review\s*[:]?\s*(\d{1,2}:\d{2})/i);
    if(timeMatch) {
        const hour = parseInt(timeMatch.split(':')[0]);
        let timeVal = 'Morning';
        if(hour >= 12 && hour < 17) timeVal = 'Afternoon';
        else if(hour >= 17 && hour < 21) timeVal = 'Evening';
        else if(hour >= 21 || hour < 6) timeVal = 'Night';
        const btn = $(`stepdownTime`).querySelector(`[data-value="${timeVal}"]`);
        if(btn) btn.click();
    }

    // --- C. Previous Risk Factors (Fixed: Multiline) ---
    // Captures from Header until the next capitalized section or double newline.
    // Includes specific lookaheads for PLAN, IMP, SUMMARY, GOC, DEVICES etc.
    const riskBlockMatch = text.match(/IDENTIFIED RISK FACTORS:?\s*\n([\s\S]*?)(?=\n\s*(?:PLAN|IMP|SUMMARY|Alert|Patient|[A-Z][A-Za-z\s]+:)|$)/i);
    
    if (riskBlockMatch && riskBlockMatch[1]) {
         const rawLines = riskBlockMatch[1].split('\n').map(l => l.trim()).filter(l => l.length > 0);
         const container = $('prevRiskList');
         
         if (rawLines.length > 0) {
             $('prevRiskContainer').style.display = 'block';
             
             rawLines.forEach(line => {
                 // 1. Add to blue list at top
                 let displayTxt = line.replace(/^[-*•]\s*/, '');
                 const d = document.createElement('div');
                 d.className = 'prev-risk-item';
                 d.textContent = "• " + displayTxt;
                 container.appendChild(d);

                 // 2. Map to Ghost Risks on specific questions
                 const lower = line.toLowerCase();
                 if (lower.match(/infection|sepsis|wcc|crp|neut/)) setGhostRisk('ghost_risk_infection', displayTxt);
                 else if (lower.match(/renal|creatinine|cr\b/)) setGhostRisk('ghost_risk_renal', displayTxt);
                 else if (lower.match(/urine|uop|oliguria/)) setGhostRisk('ghost_risk_uop', displayTxt);
                 else if (lower.match(/neuro|gcs|delirium|confusion|sedation/)) setGhostRisk('ghost_risk_neuro', displayTxt);
                 else if (lower.match(/respiratory|wob|rr|tachypnea|airway/)) setGhostRisk('ghost_risk_resp', displayTxt);
                 else if (lower.match(/vasopressor|norad|metaraminol|bp|hypotension/)) setGhostRisk('ghost_risk_pressors', displayTxt);
                 else if (lower.match(/electrolyte|potassium|magnesium|sodium/)) setGhostRisk('ghost_risk_electrolytes', displayTxt);
                 else if (lower.match(/immobility|immobile/)) setGhostRisk('ghost_risk_immobility', displayTxt);
                 else if (lower.match(/after-hours|discharge/)) setGhostRisk('ghost_risk_after_hours', displayTxt);
                 else if (lower.match(/hb|anemia|bleeding/)) setGhostRisk('ghost_risk_hb', displayTxt);
                 else if (lower.match(/intubat/)) setGhostRisk('ghost_risk_intubated', displayTxt);
                 else if (lower.match(/wean/)) setGhostRisk('ghost_risk_rapid_wean', displayTxt);
                 else if (lower.match(/historical/)) setGhostRisk('ghost_risk_hist_o2', displayTxt);
                 else if (lower.match(/oxygen|o2|np|hfnp|niv/)) setGhostRisk('ghost_risk_oxy', displayTxt);
             });
         }
    }

    // --- D. PMH (Fixed: Formatting) ---
    // Captures block, then cleans excessive newlines
    const pmhMatch = text.match(/(?:PMH|Past Medical History)\s*[:]?\s*([\s\S]*?)(?=\n(?:O\/E|A-E|Social|ADDS|Medications|Allocated|IDENTIFIED|ALERT)|$)/i);
    if(pmhMatch && pmhMatch[1]) {
        // Clean up lines: split, trim, filter empty, join with single newline
        const cleanPmh = pmhMatch[1].split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n');
        setFixed('pmh_note', cleanPmh);
    }
    
    // --- E. Vitals & A-E ---
    const adds = extract(/ADDS[:\s]+(\d+)/i);
    if(adds) setGhost('adds', adds);

    if(extract(/(?:HR|Pulse)\s*[:]?\s*(\d+)/i)) setGhost('c_hr', extract(/(?:HR|Pulse)\s*[:]?\s*(\d+)/i), true);
    if(extract(/(?:BP|NIBP)\s*[:]?\s*(\d{2,3}\/\d{2,3})/i)) setGhost('c_nibp', extract(/(?:BP|NIBP)\s*[:]?\s*(\d{2,3}\/\d{2,3})/i), true);
    if(extract(/(?:RR|Resps)\s*[:]?\s*(\d+(?:-\d+)?)/i)) setGhost('b_rr', extract(/(?:RR|Resps)\s*[:]?\s*(\d+(?:-\d+)?)/i), true);
    if(extract(/(?:SpO2|Sats)\s*[:]?\s*(>94|\d+%?)/i)) setGhost('b_spo2', extract(/(?:SpO2|Sats)\s*[:]?\s*(>94|\d+%?)/i).replace('%',''), true);
    
    // Fix: Temp matches "Afebrile" OR strictly 2+ digits (e.g. 36). 
    // Prevents matching "1" from dates.
    const temp = extract(/(?:Temp|T)[\s:]+(Afebrile|\d{2}\.?\d{0,2})/i);
    if(temp) setGhost('e_temp', temp, true);

    const airway = extract(/A:\s*(.*?)(?:,|$|\n|B:)/i);
    if(airway) setGhost('airway_a', airway, true);

    const wob = extract(/(?:WOB|Work of breathing)[\s\S]{0,20}?(nil increased|increased|moderate|severe|normal)/i);
    if(wob) setGhost('b_wob', wob, true);

    const dLine = extract(/D:\s*(.*?)(?=\n|E:|$)/i);
    if (dLine) {
        const alertMatch = dLine.match(/(Alert|GCS\s*\d+|AMT\s*\d+\/\d+|Confusion|Delirium)/i);
        if (alertMatch) setGhost('d_alert', alertMatch[0], true);
        const painMatch = dLine.match(/Pain\s*([^,]+)/i);
        if (painMatch) setGhost('d_pain', painMatch[1].trim(), true);
        else if (dLine.includes('Pain')) {
             const pParts = dLine.split(/Pain/i);
             if (pParts[1]) setGhost('d_pain', pParts[1].split(',')[0].trim(), true);
        }
    }

    const bowelsLine = extract(/Bowels:\s*(.*?)(?=\n|$)/i);
    if(bowelsLine) setGhost('ae_bowels', bowelsLine, true); 

    const diet = extract(/Diet:\s*(.*?)(?=\n|$)/i);
    if(diet) setGhost('ae_diet', diet, true);

    const msk = extract(/(?:Mobility\/MSK|Mobility):\s*(.*?)(?=\n|$)/i);
    if(msk) setGhost('ae_mobility', msk, true);

    // --- F. Bloods Loop ---
    const bloodMap = {
        'Lac': /Lac(?:t)?(?:ate)?\s*[:]?\s*(\d+\.?\d*)/i,
        'Hb': /Hb\s*[:]?\s*(\d+)/i,
        'WCC': /WCC\s*[:]?\s*(\d+\.?\d*)/i, 'CRP': /CRP\s*[:]?\s*(\d+)/i,
        'Cr': /Cr\s*[:]?\s*(\d+)/i, 'K': /K\s*[:]?\s*(\d+\.?\d*)/i,
        'Na': /Na\s*[:]?\s*(\d+)/i, 'Mg': /Mg\s*[:]?\s*(\d+\.?\d*)/i,
        'Plts': /Plts\s*[:]?\s*(\d+)/i, 'Alb': /Alb\s*[:]?\s*(\d+)/i,
        'Neut': /Neut\s*[:]?\s*(\d+\.?\d*)/i, 'Lymph': /Lymph\s*[:]?\s*(\d+\.?\d*)/i,
        'PO4': /PO4\s*[:]?\s*(\d+\.?\d*)/i, 'Urea': /Urea\s*[:]?\s*(\d+\.?\d*)/i,
        'eGFR': /eGFR\s*[:]?\s*(\d+)/i
    };
    const inputMap = { 'Lac': 'bl_lac_review', 'Hb': 'bl_hb', 'WCC': 'bl_wcc', 'CRP': 'bl_crp', 'Cr': 'bl_cr_review', 'K': 'bl_k', 'Na': 'bl_na', 'Mg': 'bl_mg', 'Plts': 'bl_plts', 'Alb': 'bl_alb', 'Neut': 'bl_neut', 'Lymph': 'bl_lymph', 'PO4': 'bl_phos', 'Urea': 'bl_urea', 'eGFR': 'bl_egfr' };

    for(const [label, regex] of Object.entries(bloodMap)) {
        const m = text.match(regex);
        if(m && m[1]) {
            setGhost(inputMap[label], m[1]);
            foundBloods = true;
            if(label === 'Hb') setGhost('hb', m[1]);
            if(label === 'WCC') setGhost('wcc', m[1]);
            if(label === 'CRP') setGhost('crp', m[1]);
            if(label === 'Lac') setGhost('lactate', m[1]);
        }
    }

    // --- G. Devices (Fixed: Multiline) ---
    // Captures full block until next header.
    $('devices-container').innerHTML = ''; 
    const deviceBlockMatch = text.match(/DEVICES:?\s*\n([\s\S]*?)(?=\n\s*(?:GOC|IDENTIFIED|PLAN|IMP|ALERT|[A-Z][A-Z\s]+:)|$)/i);
    
    if (deviceBlockMatch && deviceBlockMatch[1]) {
        const lines = deviceBlockMatch[1].split('\n');
        lines.forEach(line => {
            let clean = line.replace(/^[\-\*]\s*/, '').trim(); 
            if(!clean) return;
            let type = 'Other Device';
            let details = clean;
            const upper = clean.toUpperCase();
            if(upper.includes('PIVC')) { type = 'PIVC'; details = clean.replace(/PIVC/i, '').trim().replace(/^\(/, '').replace(/\)$/, ''); }
            else if(upper.includes('CVC') || upper.includes('IJ') || upper.includes('SUBCLAVIAN')) { type = 'CVC'; details = clean.replace(/CVC/i, '').trim(); }
            else if(upper.includes('IDC')) { type = 'IDC'; details = clean.replace(/IDC/i, '').trim(); }
            else if(upper.includes('PICC')) { type = 'PICC Line'; details = clean.replace(/PICC/i, '').trim(); }
            else if(upper.includes('DRAIN') || upper.includes('ICC')) { type = 'Drain'; }
            else if(upper.includes('NG') || upper.includes('NJ') || upper.includes('PEG')) { type = 'Enteral Tube'; }
            else if(upper.includes('PACING')) { type = 'Pacing Wire'; }
            else if(upper.includes('WOUND')) { type = 'Wound'; }
            
            if(details.startsWith('(') && details.endsWith(')')) details = details.slice(1, -1);
            createDeviceEntry(type, details, true); 
        });
    }

    if(foundBloods) openAccordion('bloods');
    if(foundAE) openAccordion('ae');

    showToast("Data Imported");
    computeAllAndSave();
}

/* ===========================
   4. State & Persistence
   =========================== */
function showToast(msg, timeout=2500) {
  const t = $('toast');
  t.innerHTML = msg;
  t.classList.add('show');
  setTimeout(()=> t.classList.remove('show'), timeout);
}

function saveState(instantly=false) {
  const state = getState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem('alertNursingToolLastSaved', new Date().toISOString());
  updateLastSaved();
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(e){ return null; }
}

function updateLastSaved() {
  const iso = localStorage.getItem('alertNursingToolLastSaved');
  if (!iso) { $('lastSaved').textContent = 'Last saved: --:--'; return; }
  const t = new Date(iso);
  $('lastSaved').textContent = 'Last saved: ' + t.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}

function getState() {
  const state = {};
  for (const id of staticInputs) { const el = $(id); if (el) state[id] = el.value; }
  for (const id of segmentedInputs) {
    const group = $(`seg_${id}`); if(!group) continue;
    const active = group.querySelector('.seg-btn.active');
    state[id] = active ? (active.dataset.value === "true") : null;
  }
  for (const id of toggleInputs) {
    const el = $(`toggle_${id}`); state[id] = el ? el.dataset.value === 'true' : false;
  }
  for (const groupId of selectInputs) {
    const el = $(groupId); if (!el) continue;
    const active = el.querySelector('.select-btn.active');
    state[groupId] = active ? active.dataset.value : '';
  }
  let checked = document.querySelector('input[name="reviewType"]:checked');
  state['reviewType'] = checked ? checked.value : 'post';
  checked = document.querySelector('input[name="clinicianRole"]:checked');
  state['clinicianRole'] = checked ? checked.value : 'ALERT CNS';

  state['chk_medical_rounding'] = $('chk_medical_rounding').checked;
  state['chk_discharge_alert'] = $('chk_discharge_alert').checked;
  state['chk_use_mods'] = $('chk_use_mods').checked;
  state['chk_aperients'] = $('chk_aperients').checked;

  const bowelBtn = document.querySelector('#panel_ae .quick-select.active');
  state['bowel_mode'] = bowelBtn ? bowelBtn.id : null;

  state.devices = {};
  document.querySelectorAll('.device-entry').forEach(div => {
      if(div.querySelector('.confirm-dev')) return; // Ignore unconfirmed
      const type = div.dataset.type;
      const val = div.querySelector('textarea').value;
      if(!state.devices[type]) state.devices[type] = [];
      state.devices[type].push(val);
  });

  document.querySelectorAll('.trend-buttons').forEach(group => {
    const activeBtn = group.querySelector('.trend-btn.active');
    state[group.id] = activeBtn ? activeBtn.dataset.value : '';
  });
  return state;
}

function restoreState(state) {
  if (!state) return;
  for (const id of staticInputs) {
    const el = $(id); if (el && state[id] !== undefined) el.value = state[id];
  }
  for (const id of segmentedInputs) {
    const group = $(`seg_${id}`); if(!group) continue;
    group.querySelectorAll('.seg-btn').forEach(btn => btn.classList.remove('active'));
    if (state[id] === true) handleSegmentClick(id, "true", group.querySelector('[data-value="true"]'));
    else if (state[id] === false) handleSegmentClick(id, "false", group.querySelector('[data-value="false"]'));
  }
  for (const id of toggleInputs) {
    const el = $(`toggle_${id}`); if (!el) continue;
    el.dataset.value = state[id] ? 'true' : 'false';
    el.classList.toggle('active', !!state[id]);
    if (id === 'comorb_other' && state[id]) $('comorb_other_note_wrapper').style.display = 'block';
  }
  for (const groupId of selectInputs) {
    const value = state[groupId]; if (!value) continue;
    const btn = $(groupId).querySelector(`.select-btn[data-value="${value}"]`);
    if (btn) btn.classList.add('active');
  }

  if (state['reviewType']) {
    const radioEl = document.querySelector(`input[name="reviewType"][value="${state['reviewType']}"]`);
    if (radioEl) { radioEl.checked = true; updateWardOptions(); }
  }
  if (state['clinicianRole']) {
    const radioEl = document.querySelector(`input[name="clinicianRole"][value="${state['clinicianRole']}"]`);
    if (radioEl) radioEl.checked = true;
  }

  if(state['chk_medical_rounding'] !== undefined) $('chk_medical_rounding').checked = state['chk_medical_rounding'];
  if(state['chk_discharge_alert'] !== undefined) $('chk_discharge_alert').checked = state['chk_discharge_alert'];
  if(state['chk_aperients'] !== undefined) $('chk_aperients').checked = state['chk_aperients'];
  if(state['chk_use_mods'] !== undefined) {
      $('chk_use_mods').checked = state['chk_use_mods'];
      $('mods_inputs').style.display = state['chk_use_mods'] ? 'block' : 'none';
  }

  if (state['bowel_mode']) {
      const btn = $(state['bowel_mode']);
      if(btn) { btn.classList.add('active'); toggleBowelDate(state['bowel_mode']); }
  }

  if(state.ptWard) $('ptWard').value = state.ptWard;

  $('devices-container').innerHTML = '';
  if (state.devices) {
      deviceTypes.forEach(type => {
          if (state.devices[type]) state.devices[type].forEach(value => createDeviceEntry(type, value));
      });
  }

  document.querySelectorAll('.trend-buttons').forEach(group => {
    const value = state[group.id] || '';
    group.querySelectorAll('.trend-btn').forEach(btn => btn.classList.remove('active'));
    const btnToActivate = group.querySelector(`.trend-btn[data-value="${value}"]`);
    if(btnToActivate) btnToActivate.classList.add('active');
  });

  updateWardOtherVisibility();
  toggleInfusionsBox();
}

function clearAllDataSafe() {
    if (!confirm('Are you sure you want to clear all data?')) return;
    staticInputs.forEach(id => { const el = $(id); if(el) el.value = ''; });
    document.querySelectorAll('.ghost-val').forEach(el => el.textContent = '');
    document.querySelectorAll('.ghost-risk').forEach(el => el.textContent = '');
    document.querySelectorAll('.scraped-fixed').forEach(el => el.classList.remove('scraped-fixed'));
    document.querySelectorAll('.blood-abnormal').forEach(el => el.classList.remove('blood-abnormal'));
    
    // Clear prev risk list
    $('prevRiskList').innerHTML = '';
    $('prevRiskContainer').style.display = 'none';

    $('devices-container').innerHTML = '';
    document.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
    document.querySelectorAll('.seg-btn.active, .select-btn.active, .trend-btn.active, .toggle-label.active').forEach(btn => {
        btn.classList.remove('active');
        if(btn.classList.contains('toggle-label')) btn.dataset.value = 'false';
    });
    if($('dmrPasteInput')) $('dmrPasteInput').value = '';
    $('mods_inputs').style.display = 'none';
    $('infectionMarkers').style.display = 'none';

    // Reset to Post-Stepdown default
    document.querySelector('input[name="reviewType"][value="post"]').checked = true;
    updateWardOptions();
    
    computeAllAndSave();
}

function initialize() {
  if($('clearDataBtnTop')) $('clearDataBtnTop').onclick = clearAllDataSafe;
  if($('clearDataBtnBottom')) $('clearDataBtnBottom').onclick = clearAllDataSafe;
  $('processPasteBtn').addEventListener('click', processDmrNote);

  updateLastSaved();
  const debouncedComputeAndSave = debounce(()=>{ computeAll(); saveState(true); }, 600);

  // Handlers
  document.querySelectorAll('.trend-buttons').forEach(group => {
      ['↑', '↓', '→'].forEach(trend => {
          const btn = document.createElement('button');
          btn.type = 'button'; btn.className = 'trend-btn'; btn.dataset.value = trend; btn.textContent = trend;
          btn.addEventListener('click', () => {
              const wasActive = btn.classList.contains('active');
              group.querySelectorAll('.trend-btn').forEach(b => b.classList.remove('active'));
              if (!wasActive) btn.classList.add('active');
              debouncedComputeAndSave();
          });
          group.appendChild(btn);
      });
  });

  document.querySelectorAll('.segmented-group').forEach(group => {
      group.querySelectorAll('.seg-btn').forEach(btn => {
         if(btn.style.pointerEvents === 'none') return;
         btn.addEventListener('click', () => handleSegmentClick(group.id.replace('seg_', ''), btn.dataset.value, btn));
      });
  });

  document.querySelectorAll('.toggle-label').forEach(el => {
    el.addEventListener('click', ()=> {
      el.dataset.value = el.dataset.value === 'true' ? 'false' : 'true';
      el.classList.toggle('active', el.dataset.value === 'true');
      if(el.id === 'toggle_comorb_other') $('comorb_other_note_wrapper').style.display = el.dataset.value === 'true' ? 'block' : 'none';
      debouncedComputeAndSave();
    });
  });

  document.querySelectorAll('.button-group').forEach(group => {
    group.querySelectorAll('.select-btn').forEach(btn => {
      btn.addEventListener('click', ()=> {
        group.querySelectorAll('.select-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (group.id === 'oxMod') toggleOxyFields();
        if (group.id === 'neuroConcern') toggleNeuroFields();
        const noteWrapper = $(group.id + '_note_wrapper');
        if(noteWrapper && group.id !== 'neuroConcern') noteWrapper.style.display = (btn.dataset.value !== 'none' && btn.dataset.value !== '') ? 'block' : 'none';
        debouncedComputeAndSave();
      });
    });
  });

  staticInputs.forEach(id => {
    const el = $(id); if (!el) return;
    el.addEventListener((el.tagName==='SELECT' || el.type==='date') ? 'change' : 'input', debouncedComputeAndSave);
  });

  $('chk_medical_rounding').addEventListener('change', debouncedComputeAndSave);
  $('chk_discharge_alert').addEventListener('change', debouncedComputeAndSave);
  $('chk_use_mods').addEventListener('change', () => { $('mods_inputs').style.display = $('chk_use_mods').checked ? 'block' : 'none'; debouncedComputeAndSave(); });
  $('chk_aperients').addEventListener('change', debouncedComputeAndSave);

  ['btn_bno', 'btn_bo'].forEach(id => {
      $(id).addEventListener('click', (e) => {
          e.preventDefault();
          const btn = $(id); const other = id === 'btn_bno' ? $('btn_bo') : $('btn_bno');
          const isActive = btn.classList.contains('active');
          if (isActive) { btn.classList.remove('active'); toggleBowelDate(null); }
          else { btn.classList.add('active'); other.classList.remove('active'); toggleBowelDate(id); }
          debouncedComputeAndSave();
      });
  });

  document.querySelectorAll('input[name="reviewType"]').forEach(r => r.addEventListener('change', () => { updateWardOptions(); toggleInfusionsBox(); debouncedComputeAndSave(); }));
  $('ptWard').addEventListener('change', () => { updateWardOtherVisibility(); debouncedComputeAndSave(); });
  ['neut','lymph'].forEach(id => { $(id).addEventListener('input', ()=>{ updateNLR(); debouncedComputeAndSave(); }); });

  // Sync infection card inputs with bloods card inputs
  const sync = (a,b) => { if (!$(a) || !$(b)) return; $(a).addEventListener('input', ()=>{ $(b).value = $(a).value; }); $(b).addEventListener('input', ()=>{ $(a).value = $(b).value; }); };
  sync('adds','atoe_adds'); sync('lactate','bl_lac_review'); sync('hb','bl_hb'); sync('wcc','bl_wcc'); sync('crp','bl_crp');
  sync('neut','bl_neut'); sync('lymph','bl_lymph'); 

  const setOverride = (level) => {
    $('override').value = level;
    $('override_reason_box').style.display = level==='none' ? 'none' : 'block';
    $('override_amber').classList.toggle('active', level==='amber');
    $('override_red').classList.toggle('active', level==='red');
    debouncedComputeAndSave();
  };
  $('override_amber').addEventListener('click', ()=> setOverride('amber'));
  $('override_red').addEventListener('click', ()=> setOverride('red'));
  $('override_clear').addEventListener('click', ()=> setOverride('none'));

  document.querySelectorAll('.accordion-wrapper').forEach(wrapper => {
    const btn = wrapper.querySelector('.accordion');
    const panel = wrapper.querySelector('.panel');
    const id = wrapper.dataset.accordionId;
    btn.addEventListener('click', ()=>{
      const open = panel.style.display !== 'block';
      panel.style.display = open ? 'block' : 'none';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.querySelector('.icon').textContent = open ? '[-]' : '[+]';
    });
  });

  document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('.quick-select');
      if (!btn || btn.id.includes('btn_b') || btn.onclick) return;
      e.preventDefault(); e.stopPropagation();
      const targetEl = $(btn.dataset.target);
      if (targetEl) { targetEl.value = btn.dataset.value; targetEl.dispatchEvent(new Event('input')); }
  });

  document.querySelectorAll('#panel_devices .btn[data-device-type]').forEach(button => {
        button.addEventListener('click', () => { createDeviceEntry(button.dataset.deviceType); computeAll(); saveState(); });
  });

  $('copyBtn').addEventListener('click', ()=> { navigator.clipboard.writeText($('summary').value).then(()=> showToast('Copied')).catch(()=> showToast('Failed')); });
  $('footerSave').addEventListener('click', ()=> { saveState(true); showToast('Saved'); });
  $('footerCopy').addEventListener('click', ()=> $('copyBtn').click() );
  $('darkToggle').addEventListener('click', ()=> { document.body.classList.toggle('dark'); localStorage.setItem('alertToolDark', document.body.classList.contains('dark') ? '1' : '0'); });
  if (localStorage.getItem('alertToolDark') === '1') document.body.classList.add('dark');

  const saved = loadState();
  updateWardOptions();
  if (saved) {
      restoreState(saved);
  }

  toggleOxyFields(); toggleInfusionsBox(); toggleNeuroFields();
  
  computeAll();
}

function handleSegmentClick(id, value, btnClicked) {
    const group = $(`seg_${id}`);
    if(btnClicked && btnClicked.classList.contains('active')) {
        btnClicked.classList.remove('active'); value = null;
    } else {
        group.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        if(btnClicked) btnClicked.classList.add('active');
    }
    const noteWrapper = $(id + '_note_wrapper');
    if(noteWrapper) noteWrapper.style.display = (value === "true") ? 'block' : 'none';
    if (id === 'infection') $('infectionMarkers').style.display = (value === "true") ? 'block' : 'none';
    if (id === 'pressors') {
        const sub = $('sub_pressors_reason');
        sub.style.display = (value === "true") ? 'block' : 'none';
        if(value === "true") sub.classList.add('show');
    }
    if (id === 'intubated') {
        const sub = $('sub_intubated_reason');
        sub.style.display = (value === "true") ? 'block' : 'none';
        if(value === "true") sub.classList.add('show');
    }
    computeAllAndSave();
}

function updateWardOptions() {
    let type = document.querySelector('input[name="reviewType"]:checked')?.value || 'post';
    const wardSelect = $('ptWard');
    const currentVal = wardSelect.value;
    wardSelect.innerHTML = '<option value="" selected disabled>Select...</option>';
    let options = (type === 'pre') ? ['ICU Pod 1', 'ICU Pod 2', 'ICU Pod 3', 'ICU Pod 4'] :
        ['3A','3B','3C','3D','4A','4B','4C','4D','5A','5B','5C','5D','6A','6B','6C','6D','7A','7B','7C','7D','SRS2A','SRS1A','SRSA','SRSB','Medihotel 8','Medihotel 7','Medihotel 6','Medihotel 5','Short Stay','Transit Lounge','CCU','Mental Health Adult','Mental Health Youth'];
    options.push('Other');
    options.forEach(opt => { const o = document.createElement('option'); o.value = opt; o.textContent = opt; wardSelect.appendChild(o); });
    if (options.includes(currentVal)) wardSelect.value = currentVal;
    updateWardOtherVisibility();
}

function toggleNeuroFields() {
    const val = $('neuroConcern').querySelector('.active')?.dataset.value;
    $('neuroType').style.display = (val && val !== 'none') ? 'flex' : 'none';
    $('neuroConcern_note_wrapper').style.display = (val && val !== 'none') ? 'block' : 'none';
}

function toggleOxyFields() {
  const mod = $('oxMod').querySelector('.select-btn.active')?.dataset.value || 'RA';
  document.querySelectorAll('.npOnly').forEach(el => el.style.display = (mod === 'NP') ? '' : 'none');
  document.querySelectorAll('.hfnpOnly').forEach(el => el.style.display = (mod === 'HFNP') ? '' : 'none');
  document.querySelectorAll('.nivOnly').forEach(el => el.style.display = (mod === 'NIV') ? '' : 'none');
  document.querySelectorAll('.tracheOnly').forEach(el => el.style.display = (mod === 'Trache') ? '' : 'none');
}

function toggleInfusionsBox() {
    const type = document.querySelector('input[name="reviewType"]:checked')?.value;
    $('infusions_wrapper').style.display = (type === 'pre') ? 'grid' : 'none';
}

function toggleBowelDate(mode) {
    $('bowel_date_wrapper').style.display = mode ? 'block' : 'none';
    if(mode) $('bowel_date_label').textContent = (mode === 'btn_bno') ? 'Date Last Opened' : 'Date BO';
    $('aperients_wrapper').style.display = (mode === 'btn_bno') ? 'block' : 'none';
}

function updateNLR() {
  const neut = num($('neut').value), lymph = num($('lymph').value);
  const nlrCalc = $('nlrCalc');
  if(neut !== null && lymph > 0){
    const nlr = (neut / lymph).toFixed(1);
    nlrCalc.textContent = `NLR: ${nlr}`;
    nlrCalc.className = '';
    if (nlr > 10) nlrCalc.classList.add('status', 'red');
    else if (nlr >=5) nlrCalc.classList.add('status', 'amber');
    return num(nlr);
  } else { 
      nlrCalc.textContent = `NLR: --`; 
      nlrCalc.className = '';
      return null; 
  }
}

function updateWardOtherVisibility() {
    $('ptWardOtherWrapper').style.display = ($('ptWard').value === 'Other') ? 'block' : 'none';
}

function calculateTimeOnWard(dateStr, timeOfDay) {
  if (!dateStr) return { text: null, hours: null };
  const timeMap = { 'Morning': 9, 'Afternoon': 15, 'Evening': 18, 'Night': 21 };
  const stepdownDate = new Date(`${dateStr}T${(timeMap[timeOfDay]||12).toString().padStart(2,'0')}:00:00`);
  if (isNaN(stepdownDate.getTime())) return { text: null, hours: null };
  const diffHours = (new Date().getTime() - stepdownDate.getTime()) / 3600000;
  if (diffHours < 0) return { text: '(future)', hours: diffHours };
  const days = Math.round(diffHours / 24);
  const text = (diffHours < 24) ? `${Math.round(diffHours)} hrs` : `${days} day${days===1?'':'s'}`;
  return { text, hours: diffHours };
}

/* ===========================
   6. Compute Logic
   =========================== */
function computeAll() {
  const s = getState();
  
  // Auto-populate A-E inputs from ghost values if manual entry hasn't occurred
  const airwayEl = $('airway_a');
  if (airwayEl.dataset.manual !== "true" && airwayEl.value === "") {
      const ghost = $('ghost_airway_a')?.textContent;
      if(ghost) airwayEl.value = ghost.replace('(','').replace(')','');
  }
  
  // Run Range Checks
  checkBloodRanges();

  const red = [], amber = [];
  const flaggedElements = { red: [], amber: [] };
  
  const addRisk = (list, text, note, elementId, flagType) => {
    if (note && note.trim()) list.push(`${text} (${note.trim()})`);
    else list.push(text);
    if (elementId && flagType) flaggedElements[flagType].push(elementId);
  }

  // Scoring Logic
  const icuLos = num(s.icuLos);
  const immobility = s.immobility === true;
  const pressorReason = $('pressorReason').querySelector('.active')?.dataset.value;
  const pressorsRed = (s.pressors === true && pressorReason === 'shock');
  const pressorsAmber = (s.pressors === true && pressorReason === 'routine');
  const lactateVal = num(s.lactate);
  const hasSignificantFlags = pressorsRed || (lactateVal !== null && lactateVal > 2.0);
  let hasCombinedRedFlag = false;

  if ((immobility && icuLos >= 4) || (icuLos >= 4 && hasSignificantFlags)) {
      let reason = (immobility && icuLos >= 4)
          ? `Immobility >48h + ICU LOS ${icuLos} days`
          : `ICU LOS ${icuLos} days + Significant flag (${pressorsRed ? 'vasopressors required' : 'lactate >2'})`;
      red.push(reason);
      if (immobility) flaggedElements.red.push('seg_immobility');
      flaggedElements.red.push('icuLos');
      if (pressorsRed) flaggedElements.red.push('seg_pressors');
      if (lactateVal > 2.0) flaggedElements.red.push('lactate');
      hasCombinedRedFlag = true;
  }

  if (immobility && !hasCombinedRedFlag) addRisk(amber, 'Immobility >48h', s.immobility_note, 'seg_immobility', 'amber');
  if (icuLos > 7 && !hasCombinedRedFlag) { amber.push(`ICU LOS ${icuLos} days`); flaggedElements.amber.push('icuLos'); }

  const oxModGroup = $('oxMod');
  if (s.oxMod === 'NP') {
    const flow = num(s.npFlow);
    if (flow !== null && flow >= 3) { red.push(`NP flow ${flow} L/min`); flaggedElements.red.push('npFlow'); }
    else if (flow !== null && flow >= 2) { amber.push(`NP flow ${flow} L/min`); flaggedElements.amber.push('npFlow');}
  } else if (s.oxMod === 'HFNP') {
    const fio2 = num(s.hfnpFio2), flow = num(s.hfnpFlow);
    if (fio2 > 30 || flow > 30) { red.push(`HFNP concern`); flaggedElements.red.push(oxModGroup.id); }
    else if ((fio2 > 21) || (flow > 0)) { amber.push('On HFNP (low settings)'); flaggedElements.amber.push(oxModGroup.id); }
  } else if (s.oxMod === 'NIV') {
    red.push('On NIV'); flaggedElements.red.push(oxModGroup.id);
  } else if (s.oxMod === 'Trache') {
      const ts = s.tracheStatus;
      if (ts === 'New') addRisk(red, s.tracheType||'Trache', null, 'oxMod', 'red');
      else addRisk(amber, s.tracheType||'Trache', null, 'oxMod', 'amber');
  }

  if (s.hist_o2 === true) addRisk(red, 'Historical high O2/NIV', s.hist_o2_note, 'seg_hist_o2', 'red');
  if (s.intubated === true) {
      const reason = $('intubatedReason').querySelector('.active')?.dataset.value;
      let label = 'Intubated in last 24h';
      if (reason === 'concern') addRisk(red, `${label} (Concerns)`, s.intubation_details, 'seg_intubated', 'red');
      else addRisk(amber, `${label} (Routine/Elective)`, s.intubation_details, 'seg_intubated', 'amber');
  }

  if (s.rapid_wean === true) addRisk(red, 'Rapid oxygen wean in last 12h', s.rapid_wean_note, 'seg_rapid_wean', 'red');
  if (s.after_hours === true) addRisk(red, 'Discharged after-hours', s.after_hours_note, 'seg_after_hours', 'red');

  if (pressorsRed && !hasCombinedRedFlag) addRisk(red, 'Vasopressors required (Shock/Complicated)', s.pressors_note, 'seg_pressors', 'red');
  else if (pressorsAmber) addRisk(amber, 'Vasopressors (Routine/Short term)', s.pressors_note, 'seg_pressors', 'amber');

  if (num(s.adds) >= 3) { red.push(`ADDS ${s.adds}`); flaggedElements.red.push('adds');}
  if (lactateVal > 2.5) { red.push(`Lactate ${lactateVal}`); flaggedElements.red.push('lactate');}
  else if (lactateVal >= 2.0 && !hasCombinedRedFlag) { amber.push(`Lactate ${lactateVal}`); flaggedElements.amber.push('lactate');}

  if (s.uop === true) addRisk(red, 'UOP concerning / downtrending', s.uop_note, 'seg_uop', 'red');
  if (s.renal === true) addRisk(red, 'Renal Concern', s.renal_note, 'seg_renal', 'red');

  if (s.neuroConcern === 'severe') addRisk(red, 'Severe Neuro Concern', s.neuroConcern_note, 'neuroConcern', 'red');
  else if (s.neuroConcern === 'mod') addRisk(red, 'Moderate Neuro Concern', s.neuroConcern_note, 'neuroConcern', 'red');
  else if (s.neuroConcern === 'mild') addRisk(amber, 'Mild Neuro Concern', s.neuroConcern_note, 'neuroConcern', 'amber');

  if (s.electrolyteConcern === 'severe') addRisk(red, 'Severe electrolyte concern', s.electrolyteConcern_note, 'electrolyteConcern', 'red');
  else if (s.electrolyteConcern === 'mild') addRisk(amber, 'Electrolyte concern', s.electrolyteConcern_note, 'electrolyteConcern', 'amber');

  if (s.dyspneaConcern === 'severe') addRisk(red, 'Severe respiratory concern', s.dyspneaConcern_note, 'dyspneaConcern', 'red');
  else if (s.dyspneaConcern === 'mod') addRisk(red, 'Moderate respiratory concern', s.dyspneaConcern_note, 'dyspneaConcern', 'red');
  else if (s.dyspneaConcern === 'mild') addRisk(amber, 'Mild respiratory concern', s.dyspneaConcern_note, 'dyspneaConcern', 'amber');

  const hb = num(s.hb);
  if (hb !== null && hb <= 70) { red.push(`Anemia concern (Hb ${hb})`); flaggedElements.red.push('hb'); }
  else if (hb !== null && hb <= 100 && s.hb_dropping === true) { amber.push(`Anemia concern (Hb ${hb}, dropping)`); flaggedElements.amber.push('hb'); flaggedElements.amber.push('seg_hb_dropping'); }

  const comorbIds = ['comorb_copd','comorb_hf','comorb_esrd','comorb_diabetes','comorb_cirrhosis', 'comorb_other'];
  const comorbCount = comorbIds.filter(id => s[id] === true).length;
  if (comorbCount >= 3) { red.push('Multiple comorbidities'); comorbIds.forEach(id => {if(s[id]) flaggedElements.red.push('toggle_'+id) }); }
  else if (comorbCount > 0) { amber.push(`Comorbidity burden`); comorbIds.forEach(id => {if(s[id]) flaggedElements.amber.push('toggle_'+id) }); }

  if (s.infection === true) {
     let cat = 'red'; addRisk(red, 'Infection Concern', s.infection_note, 'seg_infection', cat);
  }

  const overrideNote = $('overrideNote')?.value ? ` (${$('overrideNote').value})` : '';
  if ($('override').value === 'red') red.push(`Override: CAT 1 concern${overrideNote}`);
  else if ($('override').value === 'amber') amber.push(`Override: CAT 2 concern${overrideNote}`);

  const redCount = red.length;
  const amberCount = amber.length;
  const cat = (redCount > 0) ? {id: 'red', text: 'CAT 1'} : (amberCount > 0) ? {id: 'amber', text: 'CAT 2'} : {id: 'green', text: 'CAT 3'};

  $('redCount').textContent = redCount;
  $('amberCount').textContent = amberCount;
  $('redCount').style.color = redCount > 0 ? 'var(--red)' : 'var(--ink)';
  $('amberCount').style.color = amberCount > 0 ? 'var(--amber)' : 'var(--ink)';

  const catTextEl = $('catText');
  catTextEl.className = 'status ' + cat.id;
  catTextEl.textContent = cat.text;
  $('categoryBox').style.borderColor = `var(--${cat.id})`;

  const flagListEl = $('flagList');
  if (redCount > 0 || amberCount > 0) {
      const redFlagsHTML = red.map(f => `<div style="color:var(--red); font-weight:600; margin:6px 0;">[CAT 1] ${f}</div>`);
      const amberFlagsHTML = amber.map(f => `<div style="color:var(--amber); font-weight:600; margin:6px 0;">[CAT 2] ${f}</div>`);
      flagListEl.innerHTML = [...redFlagsHTML, ...amberFlagsHTML].join('');
  } else { flagListEl.innerHTML = `<div style="color:var(--muted)">No risk factors identified</div>`; }

  document.querySelectorAll('.flag-red, .flag-amber').forEach(el => el.classList.remove('flag-red', 'flag-amber'));
  flaggedElements.red.forEach(id => { const el=$(id); if(el) el.classList.add('flag-red'); });
  flaggedElements.amber.forEach(id => { const el=$(id); if(el) el.classList.add('flag-amber'); });

  const followUpEl = $('followUpInstructions');
  let followUpHTML = '';
  if (s.chk_discharge_alert === true) followUpHTML = `<div class="status" style="color:var(--blue-hint);">Discharge from ALERT nursing post ICU review list.</div>`;
  else if (cat.id === 'red') followUpHTML = `<div class="status red">${redCount >= 3 ? 'Twice-daily' : 'At least daily'} ALERT review for up to 72h post-ICU stepdown.</div>`;
  else if (cat.id === 'amber') followUpHTML = `<div class="status amber">Once-daily ALERT review for up to 48h post-ICU stepdown.</div>`;
  else followUpHTML = `<div class="status green">Single ALERT review on ward to ensure continued stability.</div>`;
  followUpEl.innerHTML = followUpHTML;

  const wardTime = calculateTimeOnWard(s.stepdownDate, s.stepdownTime);
  const nudgeEl = $('dischargeNudge');
  nudgeEl.style.display = 'none';
  if (wardTime.hours !== null && wardTime.hours > 0 && s.chk_discharge_alert !== true) {
      let nudgeText = '';
      if (cat.id === 'red' && wardTime.hours >= 72) nudgeText = `Patient stepped down ${wardTime.text} ago (CAT 1 ≥ 72h). Consider discharge.`;
      else if (cat.id === 'amber' && wardTime.hours >= 48) nudgeText = `Patient stepped down ${wardTime.text} ago (CAT 2 ≥ 48h). Consider discharge.`;
      else if (cat.id === 'green' && wardTime.hours >= 24) nudgeText = `Patient stepped down ${wardTime.text} ago (CAT 3 ≥ 24h). Consider discharge.`;
      if(nudgeText) { nudgeEl.textContent = nudgeText; nudgeEl.style.display = 'block'; }
  }

  $('footerName').textContent = s.ptName || '--';
  $('footerLocation').textContent = `${s.ptWard||''} ${s.ptBed||''}`;
  $('footerAdmission').textContent = s.ptAdmissionReason || '--';
  $('footerScore').className = `footer-score tag ${cat.id}`;
  $('footerScore').textContent = cat.text;

  generateSummary(s, cat, `${s.ptWard||''} ${s.ptBed||''}`, wardTime.text, red, amber);
}

function generateSummary(s, cat, location, wardTimeText, red, amber) {
    const clean = (str) => str ? str.trim().replace(/\.$/, '').trim() : null;
    const trendWord = val => ({ '↑': ' (uptrending)', '↓':' (downtrending)', '→':' (stable)'}[val] || '');

    const role = s.clinicianRole || 'ALERT CNS';
    const reviewTitle = (s.reviewType === 'pre') 
        ? `${role} pre ICU stepdown review` 
        : `${role} post ICU review`;

    const headerLines = [];
    const ptDetails = [];
    if (s.ptName) ptDetails.push(`Patient: ${s.ptName}`);
    if (s.ptMrn) ptDetails.push(`URN: ...${s.ptMrn}`);
    if (location) ptDetails.push(`Location: ${location}`);
    if (ptDetails.length) headerLines.push(ptDetails.join(' | '));

    const now = new Date();
    const minutes = now.getMinutes();
    const roundedMinutes = Math.round(minutes / 15) * 15;
    if (roundedMinutes === 60) { now.setHours(now.getHours() + 1); now.setMinutes(0); } else { now.setMinutes(roundedMinutes); }
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    headerLines.push(reviewTitle, `Time of review: ${timeStr}`);

    if (s.stepdownDate) {
        const [y, m, d] = s.stepdownDate.split('-');
        headerLines.push(`ICU Discharge Date: ${d}/${m}/${y}`);
    }

    const stepdownParts = [];
    if (s.reviewType !== 'pre' && wardTimeText) stepdownParts.push(`Time since stepdown: ${wardTimeText}.`);
    if (s.icuLos) stepdownParts.push(`ICU LOS: ${s.icuLos} days.`);
    if (stepdownParts.length) headerLines.push('', ...stepdownParts);

    if(s.ptAdmissionReason) headerLines.push(`Reason for ICU Admission: ${s.ptAdmissionReason}`);

    const lines = [...headerLines, '', `ALERT Nursing Review Category - ${cat.text}`];
    if (s.pmh_note && s.pmh_note.trim()) lines.push('', 'PMH:', s.pmh_note.trim());

    // A-E
    const atoe = [];
    if (s.chk_use_mods === true) {
        const modsParts = [];
        if(s.mods_score) modsParts.push(`MODS Score: ${s.mods_score}`);
        if(s.mods_details) modsParts.push(`Details: ${s.mods_details}`);
        if(modsParts.length > 0) atoe.push(modsParts.join(' | '));
    } else if(s.adds) {
        atoe.push(`ADDS: ${s.adds}`);
    }

    if (s.airway_a) atoe.push(`A: ${s.airway_a.trim()}`);

    const b_parts = [
      clean(s.b_rr) ? `RR ${clean(s.b_rr)}${trendWord(s.b_rr_trend)}`:null,
      clean(s.b_spo2) ? `SpO2 ${clean(s.b_spo2)}${clean(s.b_spo2).includes('%') ? '' : '%'}`:null,
      clean(s.b_device),
      clean(s.b_wob) ? `WOB ${clean(s.b_wob)}`:null
    ];
    if(b_parts.filter(Boolean).length) atoe.push(`B: ${b_parts.filter(Boolean).join(', ')}`);

    let hrString = clean(s.c_hr) ? `HR ${clean(s.c_hr)}${trendWord(s.c_hr_trend)}`:null;
    if (hrString && s.c_hr_rhythm) hrString += ` (${s.c_hr_rhythm})`;

    const c_parts = [
      hrString,
      clean(s.c_nibp) ? `NIBP ${clean(s.c_nibp)}${trendWord(s.c_nibp_trend)}`:null,
      clean(s.c_cr) ? `Cap Refill ${clean(s.c_cr)}`:null,
      clean(s.c_perf)
    ];
    if(c_parts.filter(Boolean).length) atoe.push(`C: ${c_parts.filter(Boolean).join(', ')}`);

    const d_parts = [];
    if(s.d_alert && s.d_alert.trim()) d_parts.push(s.d_alert.trim());
    if(s.d_pain && s.d_pain.trim()) d_parts.push(`Pain ${s.d_pain.trim()}`);
    if(d_parts.length) atoe.push(`D: ${d_parts.join(', ')}`);

    const e_parts = [
      clean(s.e_temp) ? `Temp ${clean(s.e_temp)}${String(clean(s.e_temp)).toLowerCase().match(/febrile|afebrile|C/) ? '' : 'C'}`:null,
      clean(s.e_bsl) ? `BSL ${clean(s.e_bsl)}`:null,
      clean(s.e_uop) ? `UOP ${clean(s.e_uop)}`:null
    ];
    if(e_parts.filter(Boolean).length) atoe.push(`E: ${e_parts.filter(Boolean).join(', ')}`);

    const otherSys = [];
    if (s.ae_mobility) otherSys.push(`Mobility/MSK: ${s.ae_mobility.trim()}`);
    if (s.ae_diet) otherSys.push(`Diet: ${s.ae_diet.trim()}`);

    let bowelStr = s.ae_bowels ? s.ae_bowels.trim() : '';
    const dateFunc = (str) => { if(!str) return ''; const [y,m,d] = str.split('-'); return `${d}/${m}/${y}`; };

    if (s.bowel_mode === 'btn_bno' && s.bowel_date) {
        const date = dateFunc(s.bowel_date);
        bowelStr = bowelStr ? `BNO (Last opened: ${date}), ${bowelStr}` : `BNO (Last opened: ${date})`;
        if (s.chk_aperients) bowelStr += ' (Aperients charted)';
    } else if (s.bowel_mode === 'btn_bo' && s.bowel_date) {
        const date = dateFunc(s.bowel_date);
        bowelStr = bowelStr ? `BO (Date: ${date}), ${bowelStr}` : `BO (Date: ${date})`;
    } else if (s.bowel_mode === 'btn_bno') {
        bowelStr = bowelStr ? `BNO, ${bowelStr}` : `BNO`;
        if (s.chk_aperients) bowelStr += ' (Aperients charted)';
    } else if (s.bowel_mode === 'btn_bo') {
        bowelStr = bowelStr ? `BO, ${bowelStr}` : `BO`;
    }

    if (bowelStr) otherSys.push(`Bowels: ${bowelStr}`);

    if (atoe.length || otherSys.length) {
        lines.push('', 'A-E ASSESSMENT', ...atoe);
        if(atoe.length && otherSys.length) lines.push('---');
        lines.push(...otherSys);
    }

    // Bloods
    const bloodLines = [];
    const bloodLabelMap = { 'lac_review': 'Lac', 'hb': 'Hb', 'wcc': 'WCC', 'crp': 'CRP', 'cr_review': 'Cr', 'k': 'K', 'na': 'Na', 'mg': 'Mg', 'plts': 'Plts', 'alb': 'Alb', 'neut': 'Neut', 'lymph': 'Lymph', 'phos': 'PO4', 'urea': 'Urea', 'egfr': 'eGFR' };
    const bloodParts = ['lac_review','hb','wcc','crp','cr_review','k','na','mg','phos','plts','alb','neut','lymph','urea','egfr'];

    const bloods = bloodParts.map(k => {
      let v = s[`bl_${k}`]; if (!v) return null;
      const trend = s[`bl_${k}_trend`] || '';
      
      const ghostEl = document.getElementById('ghost_bl_' + k);
      if (ghostEl && ghostEl.textContent && ghostEl.textContent.trim().length > 0) {
          v += " " + ghostEl.textContent.trim(); 
      }
      return `${bloodLabelMap[k]} ${v}${trendWord(trend)}`;
    }).filter(Boolean).join(', ');

    let fullBloodLine = bloods;
    if (s.new_bloods_ordered === true) fullBloodLine += `${bloods ? ' ' : ''}(new bloods ordered for next round.)`;

    if (fullBloodLine) bloodLines.push(`Bloods: ${fullBloodLine}`);
    if (s.elec_replace_note) bloodLines.push(`Electrolyte Plan: ${s.elec_replace_note.trim()}`);
    if (bloodLines.length) lines.push('', ...bloodLines);

    if (s.reviewType === 'pre' && s.infusions_note && s.infusions_note.trim()) {
        lines.push(`Infusions: ${s.infusions_note.trim()}`);
    }

    if(s.devices) {
        const devLines = [];
        deviceTypes.forEach(type => {
          if(s.devices[type] && s.devices[type].length) {
              s.devices[type].forEach(d => {
                  const det = d ? d.trim() : '';
                  if(type === 'Other CVAD' || type === 'Other Device') {
                      devLines.push(det || type);
                  } else {
                      devLines.push(det ? `${type} (${det})` : type);
                  }
              });
          }
        });
        if(devLines.length) lines.push('', 'DEVICES:', ...devLines.map(d=>'- '+d));
    }

    const contextLines = [];
    if (s.goc_note) {
      const gocText = s.goc_note.trim();
      contextLines.push(gocText.toLowerCase().startsWith('goc') ? gocText : `GOC: ${gocText}`);
    }
    if (s.allergies_note) contextLines.push(`Allergies: ${s.allergies_note.trim()}`);
    if (s.pics_note) contextLines.push(`Post ICU Syndrome: ${s.pics_note.trim()}`);
    if (s.context_other_note) contextLines.push(`Other: ${s.context_other_note.trim()}`);
    if (contextLines.length) lines.push('', ...contextLines);

    const allFlags = [...red, ...amber];
    if (allFlags.length) lines.push('', 'IDENTIFIED RISK FACTORS:', ...allFlags.map(f=>'- '+f));

    lines.push('', 'PLAN:');
    if (s.chk_discharge_alert === true) {
        lines.push('- Follow-up: Discharge from ALERT nursing post ICU review list.');
    } else if (cat.id === 'red') {
        lines.push(`- Follow-up: ${red.length >= 3 ? 'Twice-daily' : 'At least daily'} ALERT review for up to 72h post-ICU stepdown.`);
    } else if (cat.id === 'amber') {
        lines.push('- Follow-up: Once-daily ALERT review for up to 48h post-ICU stepdown.');
    } else {
        lines.push('- Follow-up: Single ALERT review on ward to ensure continued stability.');
    }

    if (s.chk_medical_rounding) {
        lines.push('- Added to ALERT Medical Rounding List.');
    }

    $('summary').value = lines.join('\n');
}

function openRedcapAccelerator() {
    var roleVal = document.querySelector('input[name="clinicianRole"]:checked')?.value || "ALERT CNS";
    var teamCode = (roleVal === "ALERT CN") ? "2" : "1";
    var score = document.getElementById('adds').value || "0";
    var isDischarge = document.getElementById('chk_discharge_alert').checked;

    var wardMap = {
        "3A": "1",  "3B": "2",  "3C": "5",  "3D": "3",
        "4A": "6",  "4B": "7",  "4C": "8",  "4D": "9",
        "5A": "10", "5B": "11", "5C": "12", "5D": "13",
        "6A": "14", "6B": "15", "6C": "16", "6D": "17",
        "7A": "18", "7B": "19", "7C": "20", "7D": "21",
        "SRS2A": "59", "SRS1A": "58", "SRSA": "60", "SRSB": "61",
        "ICU Pod 1": "43", "ICU Pod 2": "43", "ICU Pod 3": "43", "ICU Pod 4": "43",
        "CCU": "30", "HDU": "41", "ED": "36",
        "Short Stay": "57", "Transit Lounge": "64"
    };
    var currentWardName = document.getElementById('ptWard').value;
    var locationCode = wardMap[currentWardName] || "";

    var now = new Date();
    var day = ("0" + now.getDate()).slice(-2);
    var month = ("0" + (now.getMonth() + 1)).slice(-2);
    var year = now.getFullYear();
    var dateString = year + "-" + month + "-" + day;

    var currentHour = now.getHours();
    var currentMin = now.getMinutes();
    var decimalTime = currentHour + (currentMin / 60);

    var shiftCode = "3";
    if (decimalTime >= 7.5 && decimalTime < 14.5) { shiftCode = "1"; }
    else if (decimalTime >= 14.5 && decimalTime < 20.0) { shiftCode = "2"; }

    var catText = document.getElementById('footerScore').innerText || "CAT 3";
    var catCode = "3";
    if (catText.includes("CAT 1")) { catCode = "1"; }
    else if (catText.includes("CAT 2")) { catCode = "2"; }

    var params = [];
    params.push("site=1");
    params.push("contactreason=6");
    params.push("shifttype=" + shiftCode);
    params.push("shift_date=" + dateString);
    params.push("icu_category=" + catCode);
    params.push("alert_team=" + teamCode);
    if(locationCode) { params.push("location_fs=" + locationCode); }
    params.push("adds_score=" + score);
    params.push("int_group_a___1=1");
    params.push("int_group_a___8=1");
    params.push("int_group_b___19=1");
    params.push("int_group_c___25=1");

    if (isDischarge) {
        params.push("outcome=1");
        params.push("int_group_e___42=1");
    } else {
        params.push("outcome=3");
        params.push("int_group_e___41=1");
    }

    var baseUrl = "https://datalibrary-rc.health.wa.gov.au/surveys/?s=K3WAPC4KKXWNTF3F";
    var finalUrl = baseUrl + "&" + params.join("&");
    window.open(finalUrl, '_blank');
}

document.addEventListener('DOMContentLoaded', ()=> initialize());
