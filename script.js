/* ===========================
   1. Utilities & Configuration (Stable V4.9)
   =========================== */
const $ = id => document.getElementById(id);
const debounce = (fn, wait=350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn.apply(this,a), wait); }; };
const computeAllAndSave = ()=>{ computeAll(); saveState(true); };
const num = v => { const x = parseFloat(v); return isNaN(x) ? null : x; };

const STORAGE_KEY = 'alertNursingToolData_v4.9_Stable';
const ACCORDION_KEY = 'alertNursingToolAccordions_v4.9';

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

function stackText(id, text) {
    const el = $(id);
    if (!el) return;
    if (el.value.trim() === "") el.value = text;
    else if (!el.value.includes(text)) el.value = el.value + ", " + text;
    el.dispatchEvent(new Event('input'));
}

function createDeviceEntry(type, value = '') {
    const container = $('devices-container');
    const div = document.createElement('div');
    div.className = 'device-entry';
    div.dataset.type = type;
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
   3. The DMR Scraper (Safe Version)
   =========================== */
function processDmrNote() {
    const text = $('dmrPasteInput').value;
    if(!text) return;

    $('pasteError').style.display = 'none';

    // Helper: Fill value, Add Blue Class (Safe, no ghost elements)
    const setScraped = (id, val) => {
        const el = $(id);
        if(!el || !val) return;
        el.value = val;
        el.classList.add('scraped-filled'); // Visual indicator only
        el.dispatchEvent(new Event('input'));
    };

    const extract = (regex) => { const m = text.match(regex); return m ? m[1].trim() : null; };

    // --- Demographics ---
    const los = extract(/LOS\s*(\d+)/i);
    if(los) setScraped('icuLos', los);

    const admission = extract(/Admitted post\s*(.*?)(?:\n|$|Not for)/i);
    if(admission) setScraped('ptAdmissionReason', admission);

    const dateMatch = extract(/Discharged.*?on\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
    if(dateMatch) {
         const parts = dateMatch.split(/[\/\-\.]/);
         if(parts.length === 3) {
             let d = parts[0], m = parts[1], y = parts[2];
             if(y.length === 2) y = "20" + y;
             setScraped('stepdownDate', `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
         }
    }

    const gocMatch = text.match(/(Not for CPR.*?(?:METS\.|For METS|for METS)|NFR.*?|For METS.*?)/i);
    if (gocMatch) setScraped('goc_note', gocMatch[0].trim());

    const pmh = extract(/PMH:\s*([\s\S]*?)(?=\n\n|O\/E:|Social:|ADDS:)/i);
    if(pmh) setScraped('pmh_note', pmh.trim());

    // --- Vitals ---
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

    // --- A-E ---
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

    // --- Bloods ---
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

    // --- Devices (Simplified) ---
    $('devices-container').innerHTML = ''; // Clear existing
    const parseAndAddDevice = (rawLine) => {
        if(!rawLine || rawLine.length < 3) return;
        const lower = rawLine.toLowerCase();
        let type = 'Other Device';
        if(lower.includes('pivc')) { type = 'PIVC'; }
        else if(lower.includes('cvl') || lower.includes('cvc')) { type = 'CVC'; }
        else if(lower.includes('idc')) { type = 'IDC'; }
        else if(lower.includes('picc')) { type = 'PICC Line'; }
        else if(lower.includes('drain') || lower.includes('icc')) { type = 'Drain'; }
        else if(lower.includes('ng') || lower.includes('nj')) { type = 'Enteral Tube'; }
        // Add directly
        createDeviceEntry(type, rawLine.replace(/^[x\-\:\*]+\s*/, '').trim());
    };

    const deviceBlock = text.match(/Devices:\s*\n([\s\S]*?)(?=\n\n|\n[A-Z][a-z]+:|$)/i);
    if (deviceBlock) {
        const lines = deviceBlock[1].split('\n');
        lines.forEach(line => { const clean = line.trim(); if(clean) parseAndAddDevice(clean); });
    }

    if(document.querySelector('details[data-accordion-id="bloods"]')) {
        document.querySelector('details[data-accordion-id="bloods"]').setAttribute('open', 'true');
    }

    $('dmrPasteWrapper').style.display = 'none';
    showToast("Data Imported");
    computeAllAndSave();
    enableCompactMode(); // Trigger compact mode after import
}

/* ===========================
   4. Compact Mode Logic
   =========================== */
function enableCompactMode() {
    const cols = document.querySelectorAll('.grid > div[class*="col-"]');
    cols.forEach(col => {
        let hasData = false;
        // Check Inputs
        const inputs = col.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (input.type === 'checkbox' || input.type === 'radio') {
                if (input.checked) hasData = true;
            } else if (input.value && input.value.trim() !== '') {
                hasData = true;
            }
        });
        // Check Buttons
        if (col.querySelector('.active')) hasData = true;
        // Check Devices
        if (col.id === 'devices-container' && col.children.length > 0) hasData = true;
        // Check Accordions content
        if(col.querySelector('.accordion-wrapper')) hasData = true; // Keep accordions visible

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

/* ===========================
   5. State & Persistence
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

function clearAllDataSafe() {
    if (!confirm('Are you sure you want to clear all data?')) return;
    staticInputs.forEach(id => { const el = $(id); if(el) el.value = ''; });
    document.querySelectorAll('.scraped-filled').forEach(el => el.classList.remove('scraped-filled'));
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

  document.querySelectorAll('input[name="reviewType"]').forEach(r => r.addEventListener('change', () => { updateWardOptions(); toggleInfusionsBox(); updateLayoutMode(r.value); debouncedComputeAndSave(); }));
  $('ptWard').addEventListener('change', () => { updateWardOtherVisibility(); debouncedComputeAndSave(); });
  ['neut','lymph'].forEach(id => { $(id).addEventListener('input', ()=>{ updateNLR(); debouncedComputeAndSave(); }); });

  const sync = (a,b) => { if (!$(a) || !$(b)) return; $(a).addEventListener('input', ()=>{ $(b).value = $(a).value; }); $(b).addEventListener('input', ()=>{ $(a).value = $(b).value; }); };
  sync('adds','atoe_adds'); sync('lactate','bl_lac_review'); sync('hb','bl_hb'); sync('wcc','bl_wcc'); sync('crp','bl_crp');

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

function updateLayoutMode(mode) {
    const isFollowUp = (mode === 'followup');
    $('dmrPasteWrapper').style.display = isFollowUp ? 'block' : 'none';
    // If followup selected, open main sections to allow copy/paste
    if(isFollowUp) {
         document.querySelectorAll('details.risk-section').forEach(d => d.setAttribute('open', 'true'));
    }
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
   6. Compute Logic (Stable Version 4.1 Logic)
   =========================== */
function computeAll() {
  const s = getState();
  const red = [], amber = [];
  const flaggedElements = { red: [], amber: [] };
  const addRisk = (list, text, note, elementId, flagType) => {
    if (note && note.trim()) list.push(`${text} (${note.trim()})`);
    else list.push(text);
    if (elementId && flagType) flaggedElements[flagType].push(elementId);
  }

  // Scoring Logic from Stable v4.1
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

document.addEventListener('DOMContentLoaded', ()=> initialize());
