/* ===========================
   1. Utilities & Configuration
   =========================== */
const $ = id => document.getElementById(id);
const debounce = (fn, wait=350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn.apply(this,a), wait); }; };
const computeAllAndSave = ()=>{ computeAll(); saveState(true); };
const num = v => { const x = parseFloat(v); return isNaN(x) ? null : x; };

const STORAGE_KEY = 'alertNursingToolData_v4.8'; 
const ACCORDION_KEY = 'alertNursingToolAccordions_v4.8';

const normalRanges = {
  wcc: { low: 4, high: 11 }, crp: { low: 0, high: 50 },
  neut: { low: 1.5, high: 7.5 }, lymph: { low: 1.0, high: 4.0 },
  hb: { low: 115, high: 165 }, plts: { low: 150, high: 400 },
  k: { low: 3.5, high: 5.2 }, na: { low: 135, high: 145 },
  cr_review: { low: 50, high: 98 },
  mg: { low: 0.7, high: 1.1 }, alb: { low: 35, high: 50 },
  lac_review: { low: 0.5, high: 2.0 },
  phos: { low: 0.8, high: 1.5 },
  urea: { low: 2.5, high: 7.8 }, 
  egfr: { low: 60, high: 999 } 
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

// Stack text for quick select
window.stackText = function(id, text) {
    const el = $(id);
    if (!el) return;
    if (el.value.trim() === "") el.value = text;
    else if (!el.value.includes(text)) el.value = el.value + ", " + text;
    el.dispatchEvent(new Event('input')); 
};

// Ghost Value Helper (The Blue Text under label)
function setGhostValue(inputId, value) {
    const el = $(inputId);
    if (!el || !value) return;

    // Check if hint exists
    const hintId = `hint_for_${inputId}`;
    let hint = $(hintId);
    if (!hint) {
        hint = document.createElement('div');
        hint.id = hintId;
        hint.className = 'scraped-hint-text'; // Blue class from CSS
        el.parentNode.insertBefore(hint, el);
    }
    hint.textContent = value;
    hint.style.display = 'block';
}

function clearGhostValues() {
    document.querySelectorAll('.scraped-hint-text').forEach(el => el.remove());
    document.querySelectorAll('.scraped-filled').forEach(el => el.classList.remove('scraped-filled'));
    document.querySelectorAll('.device-entry[style*="dashed"]').forEach(el => el.remove()); 
}

/* --- COMPACT MODE LOGIC --- */
function enableCompactMode() {
    const cols = document.querySelectorAll('.grid > div[class*="col-"]');
    
    cols.forEach(col => {
        let hasData = false;

        // Check Inputs/Selects
        const inputs = col.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (input.type === 'checkbox' || input.type === 'radio') {
                if (input.checked) hasData = true;
            } else if (input.value && input.value.trim() !== '') {
                hasData = true;
            }
        });

        // Check active buttons
        if (col.querySelector('.active')) hasData = true;
        
        // Check Ghost Hints (So A-E fields with only hints show up)
        if (col.querySelector('.scraped-hint-text')) hasData = true;
        
        // Check Devices
        if (col.id === 'devices-container' && col.children.length > 0) hasData = true;
        if (col.querySelector('#devices-container') && col.querySelector('#devices-container').children.length > 0) hasData = true;

        if (hasData) col.classList.remove('compact-hidden');
        else col.classList.add('compact-hidden');
    });

    const expandBtn = $('expandFormBtn');
    if(expandBtn) expandBtn.style.display = 'flex';
}

function disableCompactMode() {
    document.querySelectorAll('.compact-hidden').forEach(el => el.classList.remove('compact-hidden'));
    const expandBtn = $('expandFormBtn');
    if(expandBtn) expandBtn.style.display = 'none';
}

/* --- DEVICE ENTRY LOGIC --- */
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
        // Scraped Device (Blue Dashed)
        div.style.border = "2px dashed var(--blue-hint)";
        div.style.padding = "8px";
        div.style.marginBottom = "8px";
        div.style.borderRadius = "6px";
        div.style.backgroundColor = "rgba(0, 86, 179, 0.05)";
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

function getOxyDeviceText(s) {
    let t = '';
    switch (s.oxMod) {
        case 'RA': t = 'RA'; break;
        case 'NP': t = s.npFlow ? `${s.npFlow}L NP` : 'NP'; break;
        case 'HFNP': t = `HFNP ${s.hfnpFlow||''}${s.hfnpFlow?'L':''} ${s.hfnpFio2||''}${s.hfnpFio2?'%':''}`; break;
        case 'NIV': t = `NIV ${s.nivFio2||''}% ${s.nivPeep||''}PEEP ${s.nivPs||''}PS`; break;
    }
    return t.trim();
}

/* ===========================
   3. The DMR Scraper (Fixed)
   =========================== */
function processDmrNote() {
    const text = $('dmrPasteInput').value;
    if(!text) return;

    $('pasteError').style.display = 'none';
    clearGhostValues(); 

    // Helper: Fill value, Add Blue Class
    const setScraped = (id, val, forceGhost = false) => {
        const el = $(id);
        if(!el || !val) return;

        // Visual Preference: Blue text under label for clarity
        setGhostValue(id, val);

        // Functional Requirement: Fill input so Summary Works
        if (!forceGhost) {
            el.value = val;
            el.classList.add('scraped-filled'); // Make input text blue/bold
            el.dispatchEvent(new Event('input'));
        }
    };

    const extract = (regex) => { const m = text.match(regex); return m ? m[1].trim() : null; };

    // --- 1. Demographics ---
    const los = extract(/LOS\s*(\d+)/i);
    if(los) setScraped('icuLos', los);

    const admission = extract(/Admitted post\s*(.*?)(?:\n|$|Not for)/i);
    if(admission) setScraped('ptAdmissionReason', admission);

    const dateMatch = extract(/Discharged.*?on\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
    if(dateMatch) {
         // Convert DD/MM/YY to YYYY-MM-DD for input[type=date]
         const parts = dateMatch.split(/[\/\-\.]/);
         if(parts.length === 3) {
             let d = parts[0], m = parts[1], y = parts[2];
             if(y.length === 2) y = "20" + y;
             setScraped('stepdownDate', `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
         }
    }

    const timeMatch = extract(/Seen\s*(\d{4})/i);
    if(timeMatch) {
        // Map HHMM to Time of Day button
        const hour = parseInt(timeMatch.substring(0,2));
        let timeVal = 'Morning';
        if(hour >= 12 && hour < 17) timeVal = 'Afternoon';
        else if(hour >= 17 && hour < 21) timeVal = 'Evening';
        else if(hour >= 21 || hour < 6) timeVal = 'Night';
        
        const btn = $(`stepdownTime`).querySelector(`[data-value="${timeVal}"]`);
        if(btn) btn.click();
    }

    const gocMatch = text.match(/(Not for CPR.*?(?:METS\.|For METS|for METS)|NFR.*?|For METS.*?)/i);
    if (gocMatch) setScraped('goc_note', gocMatch[0].trim());
    
    const pmh = extract(/PMH:\s*([\s\S]*?)(?=\n\n|O\/E:|Social:|ADDS:)/i);
    if(pmh) setScraped('pmh_note', pmh.trim());

    // --- 2. Vitals ---
    const adds = extract(/ADDS[:\s]+(\d+)/i);
    if(adds) { setScraped('adds', adds); setScraped('atoe_adds', adds); }

    const hr = extract(/(?:HR|Pulse)\s*[:]?\s*(\d+)/i);
    if(hr) setScraped('c_hr', hr);

    const bp = extract(/(?:BP|NIBP)\s*[:]?\s*(\d{2,3}\/\d{2,3})/i);
    if(bp) setScraped('c_nibp', bp);

    const rr = extract(/(?:RR|Resps)\s*[:]?\s*(\d+(?:-\d+)?)/i);
    if(rr) setScraped('b_rr', rr);

    const spo2 = extract(/(?:SpO2|Sats)\s*[:]?\s*(\d+%?)/i);
    if(spo2) {
        setScraped('b_spo2', spo2.replace('%',''));
        if(/SpO2.*?RA|RA.*?SpO2|Room Air/i.test(text)) {
            const btn = document.querySelector('#oxMod [data-value="RA"]');
            if(btn) btn.click();
        }
    }

    const temp = extract(/(?:Temp|T)\s*[:]?\s*(\d+\.?\d*)/i);
    if(temp) setScraped('e_temp', temp);

    // --- 3. A-E ---
    const airway = extract(/A:\s*(.*?)(?:,|$|\n|B:)/i);
    if(airway) setScraped('airway_a', airway);

    const wob = extract(/(?:WOB|Work of breathing)[\s\S]{0,20}?(nil increased|increased|moderate|severe|normal)/i);
    if(wob) setScraped('b_wob', wob);

    const pain = extract(/D:\s*(.*?)(?:-|,|$|\n|E:)/i);
    if(pain) setScraped('d_pain', pain); 

    const bsl = extract(/BSL\s*[:]?\s*(\d+\.?\d*)/i);
    if(bsl) setScraped('e_bsl', bsl);
    
    const diet = extract(/GIT:\s*(.*?)(?:SKIN|$|\n)/i);
    if(diet) setScraped('ae_diet', diet);

    const skin = extract(/SKIN:\s*(.*?)(?:Devices|$|\n)/i);
    if(skin) setScraped('ae_mobility', skin); 

    // --- 4. Bloods ---
    const bloodMap = { 
        'Lac': /Lac(?:t)?(?:ate)?\s*[:]?\s*(\d+\.?\d*)/i, 'Hb': /Hb\s*[:]?\s*(\d+)/i, 
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
        if(m && m[1]) setScraped(inputMap[label], m[1]);
    }

    // --- 5. Devices ---
    $('devices-container').innerHTML = '';
    const parseAndAddDevice = (rawLine) => {
        if(!rawLine || rawLine.length < 3) return;
        const lower = rawLine.toLowerCase();
        let type = 'Other Device';
        let details = rawLine;

        if(lower.includes('pivc')) { type = 'PIVC'; }
        else if(lower.includes('cvl') || lower.includes('cvc')) { type = 'CVC'; }
        else if(lower.includes('idc')) { type = 'IDC'; }
        else if(lower.includes('picc')) { type = 'PICC Line'; }
        else if(lower.includes('drain') || lower.includes('icc')) { type = 'Drain'; } 
        else if(lower.includes('ng') || lower.includes('nj')) { type = 'Enteral Tube'; }

        details = details.replace(/^[x\-\:\*]+\s*/, '').trim(); 
        createDeviceEntry(type, details, true); 
    };

    const deviceBlock = text.match(/Devices:\s*\n([\s\S]*?)(?=\n\n|\n[A-Z][a-z]+:|$)/i);
    if (deviceBlock) {
        const lines = deviceBlock[1].split('\n');
        lines.forEach(line => { const clean = line.trim(); if(clean) parseAndAddDevice(clean); });
    } else {
        if(/PIVC/i.test(text)) parseAndAddDevice("PIVC (found in text)");
        if(/IDC/i.test(text)) parseAndAddDevice("IDC (found in text)");
        if(/CVL|CVC/i.test(text)) parseAndAddDevice("CVC (found in text)");
        if(/ICC|Drain/i.test(text)) parseAndAddDevice("Drain (found in text)");
    }

    // --- 6. Misc ---
    if (/Modifications for/i.test(text)) {
        $('chk_use_mods').checked = true;
        const modsMatch = text.match(/Modifications for (.*?)(?:\.|$)/i);
        if(modsMatch) $('mods_details').value = modsMatch[1];
    }
    
    // Open Bloods Accordion if data found
    if(document.querySelector('details[data-accordion-id="bloods"]')) {
        document.querySelector('details[data-accordion-id="bloods"]').setAttribute('open', 'true');
    }

    $('dmrPasteWrapper').style.display = 'none'; 
    showToast("Data Scraped - Blue Fields");
    computeAllAndSave();
    enableCompactMode();
}

/* ===========================
   4. Persistence, State & Logic
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
  for (const id of staticInputs) {
    const el = $(id); if (!el) continue; state[id] = el.value;
  }
  for (const id of segmentedInputs) {
    const group = $(`seg_${id}`); if(!group) continue;
    const active = group.querySelector('.seg-btn.active');
    state[id] = active ? (active.dataset.value === "true") : null;
  }
  for (const id of toggleInputs) {
    const el = $(`toggle_${id}`);
    state[id] = el ? el.dataset.value === 'true' : false;
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
      if(div.querySelector('.confirm-dev')) return; 
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
    const el = $(id); if (!el) continue; if (state[id] !== undefined) el.value = state[id];
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
    if (radioEl) { radioEl.checked = true; updateWardOptions(); updateLayoutMode(state['reviewType']); }
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

/* ===========================
   5. Initialization
   =========================== */
function clearAllDataSafe() {
    if (!confirm('Are you sure you want to clear all data?')) return;
    if(typeof staticInputs !== 'undefined') staticInputs.forEach(id => { const el = $(id); if(el) el.value = ''; });
    clearGhostValues();
    $('devices-container').innerHTML = '';
    document.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
    document.querySelectorAll('.seg-btn.active, .select-btn.active, .trend-btn.active, .toggle-label.active').forEach(btn => {
        btn.classList.remove('active');
        if(btn.classList.contains('toggle-label')) btn.dataset.value = 'false';
    });
    if($('dmrPasteInput')) $('dmrPasteInput').value = '';
    disableCompactMode();
    $('mods_inputs').style.display = 'none';
    $('infectionMarkers').style.display = 'none';
    computeAllAndSave();
}

function initialize() {
  if($('clearDataBtnTop')) $('clearDataBtnTop').onclick = clearAllDataSafe;
  if($('clearDataBtnBottom')) $('clearDataBtnBottom').onclick = clearAllDataSafe;
  $('processPasteBtn').addEventListener('click', processDmrNote);
  if($('expandFormBtn')) $('expandFormBtn').addEventListener('click', disableCompactMode);

  updateLastSaved();
  const debouncedComputeAndSave = debounce(()=>{ computeAll(); saveState(true); }, 600);
  
  // Handlers for interactive elements
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

  document.querySelectorAll('input[name="reviewType"]').forEach(r => r.addEventListener('change', () => { updateWardOptions(); toggleInfusionsBox(); updateLayoutMode(r.value); debouncedComputeAndSave(); }));
  $('ptWard').addEventListener('change', () => { updateWardOtherVisibility(); debouncedComputeAndSave(); });
  ['neut','lymph'].forEach(id => { $(id).addEventListener('input', ()=>{ updateNLR(); debouncedComputeAndSave(); }); });
  
  const sync = (a,b) => { if (!$(a) || !$(b)) return; $(a).addEventListener('input', ()=>{ $(b).value = $(a).value; }); $(b).addEventListener('input', ()=>{ $(a).value = $(b).value; }); };
  sync('adds','atoe_adds'); sync('lactate','bl_lac_review'); sync('hb','bl_hb'); sync('wcc','bl_wcc'); sync('crp','bl_crp');

  // Override buttons
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

  // Accordions
  document.querySelectorAll('.accordion-wrapper').forEach(wrapper => {
    const btn = wrapper.querySelector('.accordion');
    const panel = wrapper.querySelector('.panel');
    const id = wrapper.dataset.accordionId;
    btn.addEventListener('click', ()=>{
      const open = panel.style.display !== 'block';
      panel.style.display = open ? 'block' : 'none';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.querySelector('.icon').textContent = open ? '[-]' : '[+]';
      const maps = JSON.parse(localStorage.getItem(ACCORDION_KEY) || '{}');
      maps[id] = open; localStorage.setItem(ACCORDION_KEY, JSON.stringify(maps));
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

  // Load state
  const saved = loadState();
  updateWardOptions(); 
  if (saved) restoreState(saved);
  
  toggleOxyFields(); toggleInfusionsBox(); toggleNeuroFields();
  const maps = JSON.parse(localStorage.getItem(ACCORDION_KEY) || '{}');
  document.querySelectorAll('.accordion-wrapper').forEach(wrapper => {
      if (maps[wrapper.dataset.accordionId]) {
          wrapper.querySelector('.panel').style.display = 'block';
          wrapper.querySelector('.accordion').setAttribute('aria-expanded','true');
      }
  });

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

/* ===========================
   6. Logic Helpers
   =========================== */
function updateLayoutMode(mode) {
    const isFollowUp = (mode === 'followup');
    $('dmrPasteWrapper').style.display = isFollowUp ? 'block' : 'none';
    document.querySelectorAll('details.risk-section').forEach(d => {
        if(!isFollowUp) d.setAttribute('open', 'true');
    });
    if(!isFollowUp) disableCompactMode();
}

function updateWardOptions() {
    let type = document.querySelector('input[name="reviewType"]:checked')?.value || 'post';
    const wardSelect = $('ptWard');
    const currentVal = wardSelect.value;
    wardSelect.innerHTML = '<option value="" selected disabled>Select...</option>';
    let options = (type === 'pre') ? ['ICU Pod 1', 'ICU Pod 2', 'ICU Pod 3', 'ICU Pod 4'] :
        ['3A','3B','3C','3D','4A','4B','4C','4D','5A','5B','5C','5D','6A','6B','6C','6D','7A','7B','7C','7D','SRS2A','SRS1A','SRSA','SRSB','Medihotel 8','Medihotel 7','Medihotel 6','Medihotel 5','Short Stay','Transit Lounge','Mental Health Adult','Mental Health Youth'];
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
  } else { nlrCalc.textContent = `NLR: --`; return null; }
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
   7. Compute & Summary (RESTORED)
   =========================== */
function generateSummary(s, cat, location, wardTimeText, red, amber) {
    const role = s.clinicianRole || "ALERT CNS";
    const title = (s.reviewType === 'pre') ? "ALERT Pre-Stepdown Review" : "ALERT Post-Stepdown Review";
    const date = new Date().toLocaleDateString('en-AU', {day:'2-digit', month:'2-digit', year:'2-digit'});
    const time = new Date().toLocaleTimeString('en-AU', {hour:'2-digit', minute:'2-digit', hour12:false});
    
    let text = `*** ${title} ***\n`;
    text += `Date: ${date} ${time}\n`;
    text += `Clinician: ${role}\n`;
    text += `Patient: ${s.ptName||'--'} (${s.ptMrn||'--'})\n`;
    text += `Location: ${location}\n`;
    if(wardTimeText) text += `Time on Ward: ${wardTimeText}\n`;
    if(s.ptAdmissionReason) text += `Adm Reason: ${s.ptAdmissionReason}\n`;
    if(s.icuLos) text += `ICU LOS: ${s.icuLos} days\n`;
    if(s.goc_note) text += `GOC: ${s.goc_note}\n`;
    
    text += `\n--- RISK ASSESSMENT: ${cat.text} ---\n`;
    if(red.length > 0) red.forEach(f => text += `[CAT 1] ${f}\n`);
    if(amber.length > 0) amber.forEach(f => text += `[CAT 2] ${f}\n`);
    if(red.length === 0 && amber.length === 0) text += "No specific risk factors identified.\n";
    
    text += `\n--- OBSERVATIONS ---\n`;
    if(s.adds) text += `ADDS: ${s.adds}\n`;
    if(s.airway_a) text += `A: ${s.airway_a}\n`;
    
    let b = [];
    if(s.b_rr) b.push(`RR ${s.b_rr}`);
    if(s.b_spo2) b.push(`SpO2 ${s.b_spo2}%`);
    if(s.b_device) b.push(s.b_device);
    if(s.b_wob) b.push(s.b_wob);
    if(b.length) text += `B: ${b.join(', ')}\n`;
    
    let c = [];
    if(s.c_hr) c.push(`HR ${s.c_hr} (${s.c_hr_rhythm||'unspecified'})`);
    if(s.c_nibp) c.push(`BP ${s.c_nibp}`);
    if(s.c_cr) c.push(`CR ${s.c_cr}`);
    if(c.length) text += `C: ${c.join(', ')}\n`;
    
    let d = [];
    if(s.d_alert) d.push(s.d_alert);
    if(s.d_pain) d.push(`Pain: ${s.d_pain}`);
    if(d.length) text += `D: ${d.join(', ')}\n`;
    
    let e = [];
    if(s.e_temp) e.push(`T ${s.e_temp}`);
    if(s.e_bsl) e.push(`BSL ${s.e_bsl}`);
    if(s.e_uop) e.push(`UOP ${s.e_uop}`);
    if(e.length) text += `E: ${e.join(', ')}\n`;
    
    if(s.ae_diet) text += `Diet: ${s.ae_diet}\n`;
    if(s.ae_mobility) text += `Mobility/Skin: ${s.ae_mobility}\n`;
    
    let devs = [];
    if(s.devices) Object.entries(s.devices).forEach(([k, vals]) => vals.forEach(v => devs.push(`${k}: ${v}`)));
    if(devs.length) text += `Devices: ${devs.join(', ')}\n`;
    
    // Bloods
    let bl = [];
    if(s.bl_hb) bl.push(`Hb ${s.bl_hb}`);
    if(s.bl_wcc) bl.push(`WCC ${s.bl_wcc}`);
    if(s.bl_crp) bl.push(`CRP ${s.bl_crp}`);
    if(s.bl_cr_review) bl.push(`Cr ${s.bl_cr_review}`);
    if(s.bl_k) bl.push(`K ${s.bl_k}`);
    if(s.bl_mg) bl.push(`Mg ${s.bl_mg}`);
    if(s.bl_lac_review) bl.push(`Lac ${s.bl_lac_review}`);
    if(bl.length) text += `\nBloods: ${bl.join(', ')}\n`;

    text += `\n--- PLAN ---\n`;
    const plan = $('followUpInstructions').textContent;
    text += `${plan}\n`;
    
    if(s.chk_medical_rounding) text += "- Added to ALERT Medical Rounding List\n";
    if(s.chk_discharge_alert) text += "- Discharged from ALERT List\n";
    
    $('summary').value = text;
}

function computeAll() {
  const s = getState();
  const red = [], amber = [];
  
  // Logic
  if (num(s.adds) >= 4) red.push(`ADDS ${s.adds}`);
  else if (num(s.adds) === 3) amber.push(`ADDS 3`);
  
  if (s.immobility) amber.push(`Immobility >48h`);
  if (num(s.npFlow) >= 3) red.push(`NP Flow ${s.npFlow}L`);
  if (s.intubated) {
      if($('intubatedReason').querySelector('.active')?.dataset.value === 'concern') red.push("Recent Intubation (Concern)");
      else amber.push("Recent Intubation (Routine)");
  }
  if (num(s.lactate) > 2.5) red.push(`Lactate ${s.lactate}`);
  if (s.neuroConcern === 'severe') red.push('Severe Neuro Concern');
  if (s.dyspneaConcern === 'severe') red.push('Severe Resp Concern');
  if (s.infection) red.push("Infection Concern");
  if (s.override === 'red') red.push("Clinical Override: CAT 1");
  if (s.override === 'amber') amber.push("Clinical Override: CAT 2");

  const cat = (red.length > 0) ? {id: 'red', text: 'CAT 1'} : (amber.length > 0) ? {id: 'amber', text: 'CAT 2'} : {id: 'green', text: 'CAT 3'};
  
  // Update UI
  $('redCount').textContent = red.length; $('redCount').style.color = red.length?'var(--red)':'inherit';
  $('amberCount').textContent = amber.length; $('amberCount').style.color = amber.length?'var(--amber)':'inherit';
  $('catText').className = 'status ' + cat.id; $('catText').textContent = cat.text;
  $('categoryBox').style.borderColor = `var(--${cat.id})`;
  $('footerScore').className = `footer-score tag ${cat.id}`; $('footerScore').textContent = cat.text;
  
  const flagHTML = [...red.map(r=>`<div style="color:var(--red)">[CAT 1] ${r}</div>`), ...amber.map(a=>`<div style="color:var(--amber)">[CAT 2] ${a}</div>`)].join('');
  $('flagList').innerHTML = flagHTML || `<div style="color:var(--muted)">No specific risks</div>`;
  
  let fu = "";
  if(s.chk_discharge_alert) fu = "Discharge from ALERT list.";
  else if(cat.id === 'red') fu = "Twice-daily ALERT review (up to 72h).";
  else if(cat.id === 'amber') fu = "Daily ALERT review (up to 48h).";
  else fu = "Single review. Discharge if stable.";
  $('followUpInstructions').textContent = fu;

  const wt = calculateTimeOnWard(s.stepdownDate, s.stepdownTime);
  $('footerName').textContent = s.ptName || '--';
  $('footerLocation').textContent = `${s.ptWard||''} ${s.ptBed||''}`;
  $('footerAdmission').textContent = s.ptAdmissionReason || '--';
  
  generateSummary(s, cat, `${s.ptWard||''} ${s.ptBed||''}`, wt.text, red, amber);
}

/* ===========================
   8. REDCap Integration
   =========================== */
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
