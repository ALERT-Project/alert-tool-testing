/* ===========================
   1. Utilities & Configuration
   =========================== */
const $ = id => document.getElementById(id);
const debounce = (fn, wait=350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn.apply(this,a), wait); }; };
const computeAllAndSave = ()=>{ computeAll(); saveState(true); };
const num = v => { const x = parseFloat(v); return isNaN(x) ? null : x; };
const STORAGE_KEY = 'alertNursingToolData_v4.3'; 
const ACCORDION_KEY = 'alertNursingToolAccordions_v4.3';
const UNDO_KEY = 'alertNursingToolUndo_v4.3';

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
   2. DOM & Logic Helpers
   =========================== */
function createDeviceEntry(type, value = '', isGhostCandidate = false) {
    const container = $('devices-container');
    const div = document.createElement('div');
    div.className = 'device-entry';
    div.dataset.type = type;
    
    // Standard Entry
    if (!isGhostCandidate) {
        div.innerHTML = `
            <label>${type}</label>
            <div style="display: flex; gap: 8px; align-items: center;">
                <textarea style="flex: 1;" placeholder="Enter details for ${type}...">${value}</textarea>
                <div class="remove-entry" role="button" tabindex="0">Remove</div>
            </div>
        `;
        container.appendChild(div);
        const ta = div.querySelector('textarea');
        ta.addEventListener('input', debounce(() => { computeAll(); saveState(); }, 300));
        div.querySelector('.remove-entry').addEventListener('click', () => { div.remove(); computeAll(); saveState(); });
    } 
    // Ghost Candidate (Confirm/Remove)
    else {
        div.style.border = "1px dashed var(--accent)";
        div.style.background = "rgba(0, 122, 122, 0.05)";
        div.innerHTML = `
            <label style="color:var(--accent);">❓ Confirm Previous Device: ${type}</label>
            <div style="display: flex; gap: 8px; align-items: center;">
                <textarea style="flex: 1;" readonly>${value}</textarea>
            </div>
            <div style="display:flex; gap:8px; margin-top:8px;">
                <button class="btn small primary confirm-dev">Confirm (Keep)</button>
                <button class="btn small danger remove-dev">Remove</button>
            </div>
        `;
        container.appendChild(div);
        
        div.querySelector('.confirm-dev').addEventListener('click', () => {
             // Convert to standard entry
             div.remove();
             createDeviceEntry(type, value, false);
             computeAllAndSave();
        });
        div.querySelector('.remove-dev').addEventListener('click', () => {
             div.remove();
             computeAllAndSave();
        });
    }
    div.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function getOxyDeviceText(s) {
    let oxyDeviceText = '';
    switch (s.oxMod) {
        case 'RA': oxyDeviceText = 'RA'; break;
        case 'NP': oxyDeviceText = s.npFlow ? `${s.npFlow}L NP` : 'NP'; break;
        case 'HFNP':
            let hfnpParts = [];
            if (s.hfnpFlow) hfnpParts.push(`${s.hfnpFlow}L`);
            if (s.hfnpFio2) hfnpParts.push(`${s.hfnpFio2}%`);
            oxyDeviceText = `HFNP ${hfnpParts.join(' / ')}`;
            break;
        case 'NIV':
            let nivParts = [];
            if (s.nivFio2) nivParts.push(`${s.nivFio2}% FiO2`);
            if (s.nivPeep) nivParts.push(`${s.nivPeep} PEEP`);
            if (s.nivPs) nivParts.push(`${s.nivPs} PS`);
            oxyDeviceText = `NIV ${nivParts.join(', ')}`;
            break;
    }
    return oxyDeviceText.trim();
}

function getAirwayDeviceText(s) {
    let airwayDeviceText = '';
    if (s.oxMod === 'Trache') {
        const tracheType = s.tracheType;
        airwayDeviceText = !tracheType ? 'Altered Airway' : tracheType;
        const details = s.trache_details_note ? s.trache_details_note.trim() : '';
        if (details) airwayDeviceText += ` (${details})`;
    }
    return airwayDeviceText.trim();
}

function stackText(id, text) {
    const el = $(id);
    let val = el.value;
    if (val.includes(text)) return; 
    if (val.length > 0) val += ', ';
    el.value = val + text;
    el.dispatchEvent(new Event('input'));
}

/* ===========================
   3. Ghost Value & DMR Parsing
   =========================== */
function initGhostSpans() {
    document.querySelectorAll('.blood-item').forEach(item => {
        if(!item.querySelector('.ghost-val')) {
            const span = document.createElement('span');
            span.className = 'ghost-val';
            item.appendChild(span);
            item.style.marginBottom = "20px"; 
        }
    });
}

// === THE DMR PARSER ===
function processDmrNote() {
    const text = $('dmrPasteInput').value;
    if(!text || text.length < 10) return;

    // 1. Sanity Check: Is this an ALERT note?
    if(!text.includes("Patient:") && !text.includes("ALERT Nursing")) {
        $('pasteError').style.display = 'block';
        return;
    }
    $('pasteError').style.display = 'none';

    // 2. Prepare Tool (Clear Vitals/Bloods but keep user session info if any)
    const volatileInputs = [
        'adds','lactate','hb','wcc','crp','neut','lymph', 
        'airway_a','b_rr','b_spo2','b_wob',
        'c_hr','c_nibp','c_cr','c_perf',
        'd_alert','d_pain','e_temp','e_bsl','e_uop',
        'atoe_adds', 'mods_score'
    ];
    volatileInputs.forEach(id => { if($(id)) $(id).value = ''; });
    
    // 3. Extract & Pre-fill Static Data
    // Helper Regex
    const extract = (regex) => { const m = text.match(regex); return m ? m[1].trim() : null; };
    
    const name = extract(/Patient:\s*(.*?)\s*\|/);
    const mrn = extract(/URN:.*?(\d{3,})/); // Grab last digits
    const wardMatch = extract(/Location:\s*(.*?)\s*\|?/); 
    const admReason = extract(/Reason for ICU Admission:\s*(.*?)\n/);
    const stepdownDate = extract(/ICU Discharge Date:\s*(\d{2}\/\d{2}\/\d{4})/);
    const icuLos = extract(/ICU LOS:\s*(\d+)/);
    const pmh = extract(/PMH:\s*([\s\S]*?)(?=\n\n|\n[A-Z])/); // Multiline until double newline or new header
    const allergies = extract(/Allergies:\s*(.*?)\n/);
    const goc = extract(/GOC:\s*(.*?)\n/);

    if(name) $('ptName').value = name;
    if(mrn) $('ptMrn').value = mrn.slice(-3); // Ensure only 3 digits
    if(wardMatch) {
         // Attempt to parse ward/bed. Very rough guess.
         const parts = wardMatch.split(' ');
         if(parts.length > 0) $('ptWard').value = parts[0]; 
         if(parts.length > 1) $('ptBed').value = parts[1];
         // Trigger update for 'Other' ward logic
         $('ptWard').dispatchEvent(new Event('change'));
    }
    if(admReason) $('ptAdmissionReason').value = admReason;
    if(icuLos) $('icuLos').value = icuLos;
    if(stepdownDate) {
        // Convert DD/MM/YYYY to YYYY-MM-DD
        const [d,m,y] = stepdownDate.split('/');
        $('stepdownDate').value = `${y}-${m}-${d}`;
    }
    if(pmh) $('pmh_note').value = pmh.replace(/\n/g, ', ');
    if(allergies) $('allergies_note').value = allergies;
    if(goc) $('goc_note').value = goc;

    // 4. Extract Ghost Vitals
    // Note: This relies on the Summary format "B: RR 20, SpO2 98..."
    const ghostVitals = {};
    const rr = extract(/RR\s*(\d+)/); if(rr) ghostVitals['Prev RR'] = rr;
    const spo2 = extract(/SpO2\s*(\d+)/); if(spo2) ghostVitals['Prev SpO2'] = spo2;
    const hr = extract(/HR\s*(\d+)/); if(hr) ghostVitals['Prev HR'] = hr;
    const bp = extract(/NIBP\s*(\d+\/\d+)/); if(bp) ghostVitals['Prev BP'] = bp;
    
    // Apply Vitals Ghosts (Custom location? For now we only have ghosts on Bloods/Inputs. 
    // We can add simple placeholders or just let the user see them in the paste box? 
    // Actually, let's create simple hints in the placeholders if they are empty)
    if(rr) $('b_rr').placeholder = `Prev: ${rr}`;
    if(spo2) $('b_spo2').placeholder = `Prev: ${spo2}`;
    if(hr) $('c_hr').placeholder = `Prev: ${hr}`;
    if(bp) $('c_nibp').placeholder = `Prev: ${bp}`;

    // 5. Extract & Ghost Bloods
    // Format: "Bloods: Lac 1.2, Hb 90, WCC 14..."
    const bloodsBlock = extract(/Bloods:\s*(.*?)\n/);
    if(bloodsBlock) {
        const map = { 'Lac': 'bl_lac_review', 'Hb': 'bl_hb', 'WCC': 'bl_wcc', 'CRP': 'bl_crp', 'Cr': 'bl_cr_review', 'K': 'bl_k', 'Na': 'bl_na', 'Mg': 'bl_mg', 'Plts': 'bl_plts', 'Alb': 'bl_alb', 'Neut': 'bl_neut', 'Lymph': 'bl_lymph', 'PO4': 'bl_phos', 'Urea': 'bl_urea', 'eGFR': 'bl_egfr' };
        
        // Remove text like (uptrending)
        const cleanBloods = bloodsBlock.replace(/\(.*?\)/g, ''); 
        const items = cleanBloods.split(',');
        
        items.forEach(item => {
            const parts = item.trim().split(' ');
            if(parts.length >= 2) {
                const label = parts[0];
                const val = parts[1];
                const inputId = map[label];
                if(inputId && $(inputId)) {
                    // Populate Ghost Span
                    const wrapper = $(inputId).parentElement;
                    const ghost = wrapper.querySelector('.ghost-val');
                    if(ghost) ghost.textContent = `Prev: ${val}`;
                }
            }
        });
    }

    // 6. Devices (Confirm/Reject)
    // Find "DEVICES:" then read lines starting with "-"
    $('devices-container').innerHTML = ''; // Clear existing
    const deviceSection = text.match(/DEVICES:\n([\s\S]*?)(?=\n\n|\n[A-Z]|$)/);
    if(deviceSection) {
        const lines = deviceSection[1].split('\n');
        lines.forEach(line => {
            line = line.trim();
            if(line.startsWith('-')) {
                // Format: "- Type (Details)"
                const raw = line.substring(1).trim();
                let type = raw; 
                let details = '';
                
                // Try to split type and details
                const parenIndex = raw.indexOf('(');
                if(parenIndex > -1) {
                    type = raw.substring(0, parenIndex).trim();
                    details = raw.substring(parenIndex+1, raw.lastIndexOf(')')).trim();
                }
                
                // Clean up type if it matches known types
                const knownType = deviceTypes.find(t => type.toLowerCase().includes(t.toLowerCase()));
                if(knownType) {
                    createDeviceEntry(knownType, details, true); // True = Ghost Candidate
                } else {
                    createDeviceEntry('Other Device', raw, true);
                }
            }
        });
    }

    // 7. Finish
    $('dmrPasteCard').style.display = 'none';
    showToast("Note processed! Please confirm devices and enter today's vitals.");
    computeAllAndSave();
}


/* ===========================
   4. State Management
   =========================== */
function getState() {
  const state = {};
  for (const id of staticInputs) {
    const el = $(id);
    if (!el) continue;
    state[id] = el.value;
  }
  
  for (const id of segmentedInputs) {
    const group = $(`seg_${id}`);
    if(!group) continue;
    const active = group.querySelector('.seg-btn.active');
    state[id] = active ? (active.dataset.value === "true") : null;
  }
  
  for (const id of toggleInputs) {
    const el = $(`toggle_${id}`);
    state[id] = el ? el.dataset.value === 'true' : false;
  }

  for (const groupId of selectInputs) {
    const el = $(groupId);
    if (!el) continue;
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
  // Only save REAL devices, not ghost candidates
  document.querySelectorAll('.device-entry').forEach(div => {
      if(div.querySelector('.confirm-dev')) return; // Skip candidates
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
    const el = $(id);
    if (!el) continue;
    if (state[id] !== undefined) el.value = state[id];
  }

  for (const id of segmentedInputs) {
    const group = $(`seg_${id}`);
    if(!group) continue;
    group.querySelectorAll('.seg-btn').forEach(btn => btn.classList.remove('active'));
    
    if (state[id] === true) {
        const btn = group.querySelector('.seg-btn[data-value="true"]');
        if(btn) btn.classList.add('active');
        handleSegmentClick(id, "true");
    } else if (state[id] === false) {
        const btn = group.querySelector('.seg-btn[data-value="false"]');
        if(btn) btn.classList.add('active');
        handleSegmentClick(id, "false");
    } else {
        handleSegmentClick(id, null);
    }
  }
  
  for (const id of toggleInputs) {
    const el = $(`toggle_${id}`);
    if (!el) continue;
    const val = state[id];
    el.dataset.value = val ? 'true' : 'false';
    el.classList.toggle('active', !!val);
    if (id === 'comorb_other') {
        const noteWrapper = $('comorb_other_note_wrapper');
        if(noteWrapper) noteWrapper.style.display = val ? 'block' : 'none';
    }
  }

  for (const groupId of selectInputs) {
    const value = state[groupId];
    if (!value) continue;
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
          if (state.devices[type]) {
              state.devices[type].forEach(value => createDeviceEntry(type, value));
          }
      });
  }
  
  document.querySelectorAll('.trend-buttons').forEach(group => {
    const value = state[group.id] || '';
    group.querySelectorAll('.trend-btn').forEach(btn => btn.classList.remove('active'));
    const btnToActivate = group.querySelector(`.trend-btn[data-value="${value}"]`);
    if(btnToActivate) btnToActivate.classList.add('active');
  });
  
  const expectedOxyText = getOxyDeviceText(state);
  const bDeviceEl = $('b_device');
  bDeviceEl.dataset.manual = (state.b_device === expectedOxyText || state.b_device === "") ? "false" : "true";

  const aDeviceEl = $('airway_a');
  const expectedAirwayText = getAirwayDeviceText(state);
  if (state.airway_a === expectedAirwayText) {
      aDeviceEl.dataset.manual = "false";
  } else {
      aDeviceEl.dataset.manual = "true";
  }

  updateWardOtherVisibility();
  toggleInfusionsBox();
}

/* ===========================
   5. Interactivity & Init
   =========================== */
function initialize() {
  updateLastSaved();
  initGhostSpans();
  const debouncedComputeAndSave = debounce(()=>{ computeAll(); saveState(true); }, 600);
  
  // Paste Handling
  $('processPasteBtn').addEventListener('click', processDmrNote);
  $('cancelPasteBtn').addEventListener('click', () => {
      $('dmrPasteCard').style.display = 'none';
      $('pasteError').style.display = 'none';
      $('dmrPasteInput').value = '';
  });
  
  // Trend Buttons
  const trends = ['↑', '↓', '→'];
  document.querySelectorAll('.trend-buttons').forEach(group => {
      trends.forEach(trend => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'trend-btn';
          btn.dataset.value = trend;
          btn.textContent = trend;
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
         btn.addEventListener('click', () => {
             const val = btn.dataset.value;
             const id = group.id.replace('seg_', '');
             if(btn.classList.contains('active')) {
                 btn.classList.remove('active');
                 handleSegmentClick(id, null);
             } else {
                 group.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
                 btn.classList.add('active');
                 handleSegmentClick(id, val);
             }
             debouncedComputeAndSave();
         });
      });
  });
  
  document.querySelectorAll('.toggle-label').forEach(el => {
    el.addEventListener('click', ()=> {
      el.dataset.value = el.dataset.value === 'true' ? 'false' : 'true';
      el.classList.toggle('active', el.dataset.value === 'true');
      if(el.id === 'toggle_comorb_other') {
          const noteWrapper = $('comorb_other_note_wrapper');
          if(noteWrapper) noteWrapper.style.display = el.dataset.value === 'true' ? 'block' : 'none';
      }
      debouncedComputeAndSave();
    });
  });

  document.querySelectorAll('.button-group').forEach(group => {
    group.querySelectorAll('.select-btn').forEach(btn => {
      btn.addEventListener('click', ()=> {
        if (group.id === 'oxMod' || group.id === 'tracheType' || group.id === 'tracheStatus') {
            $('b_device').dataset.manual = "false";
            $('airway_a').dataset.manual = "false"; 
        }
        group.querySelectorAll('.select-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (group.id === 'oxMod') toggleOxyFields();
        if (group.id === 'neuroConcern') toggleNeuroFields(); 
        const noteWrapperId = group.id + '_note_wrapper';
        const noteWrapper = $(noteWrapperId);
        if(noteWrapper && group.id !== 'neuroConcern') { 
             noteWrapper.style.display = (btn.dataset.value !== 'none' && btn.dataset.value !== '') ? 'block' : 'none';
        }
        const fn = (group.id === 'stepdownTime') ? computeAllAndSave : debouncedComputeAndSave;
        fn();
      });
    });
  });

  staticInputs.forEach(id => {
    const el = $(id); if (!el) return;
    const evt = (el.tagName==='SELECT' || el.type==='date') ? 'change' : 'input';
    const fn = (id === 'stepdownDate') ? computeAllAndSave : debouncedComputeAndSave;
    el.addEventListener(evt, fn);
  });
  
  $('b_device').addEventListener('input', () => { $('b_device').dataset.manual = "true"; });
  $('airway_a').addEventListener('input', () => { $('airway_a').dataset.manual = "true"; });
  
  $('chk_medical_rounding').addEventListener('change', debouncedComputeAndSave);
  $('chk_discharge_alert').addEventListener('change', debouncedComputeAndSave);
  $('chk_use_mods').addEventListener('change', () => {
      $('mods_inputs').style.display = $('chk_use_mods').checked ? 'block' : 'none';
      debouncedComputeAndSave();
  });
  $('chk_aperients').addEventListener('change', debouncedComputeAndSave);
  
  ['btn_bno', 'btn_bo'].forEach(id => {
      $(id).addEventListener('click', (e) => {
          e.preventDefault();
          const btn = $(id);
          const other = id === 'btn_bno' ? $('btn_bo') : $('btn_bno');
          const isActive = btn.classList.contains('active');
          if (isActive) {
              btn.classList.remove('active');
              toggleBowelDate(null);
          } else {
              btn.classList.add('active');
              other.classList.remove('active');
              toggleBowelDate(id);
          }
          debouncedComputeAndSave();
      });
  });

  $('comorb_other_note').addEventListener('input', () => {
       $('pmh_note').value = $('comorb_other_note').value;
       debouncedComputeAndSave();
  });
  
  document.querySelectorAll('input[name="reviewType"]').forEach(r => r.addEventListener('change', () => {
      updateWardOptions();
      toggleInfusionsBox();
      
      // DMR Paste Toggle
      if(r.value === 'followup') {
          $('dmrPasteCard').style.display = 'block';
          $('dmrPasteInput').focus();
      } else {
          $('dmrPasteCard').style.display = 'none';
      }
      
      debouncedComputeAndSave();
  }));

  $('ptWard').addEventListener('change', () => {
    updateWardOtherVisibility();
    debouncedComputeAndSave();
  });

  ['neut','lymph'].forEach(id => { $(id).addEventListener('input', ()=>{ updateNLR(); debouncedComputeAndSave(); }); });
  const sync = (a,b) => { if (!$(a) || !$(b)) return; $(a).addEventListener('input', ()=>{ $(b).value = $(a).value; debouncedComputeAndSave(); }); $(b).addEventListener('input', ()=>{ $(a).value = $(b).value; debouncedComputeAndSave(); }); };
  sync('adds','atoe_adds'); sync('lactate','bl_lac_review'); sync('hb','bl_hb'); sync('wcc','bl_wcc'); sync('crp','bl_crp'); sync('neut','bl_neut'); sync('lymph','bl_lymph');
  
  const ovA = $('override_amber'), ovR = $('override_red'), ovC = $('override_clear');
  const setOverride = (level) => {
    $('override').value = level;
    $('override_reason_box').style.display = level==='none' ? 'none' : 'block';
    ovA.classList.toggle('active', level==='amber');
    ovR.classList.toggle('active', level==='red');
    debouncedComputeAndSave();
  };
  ovA.addEventListener('click', ()=> setOverride('amber'));
  ovR.addEventListener('click', ()=> setOverride('red'));
  ovC.addEventListener('click', ()=> setOverride('none'));

  document.querySelectorAll('.accordion-wrapper').forEach(wrapper => {
    const btn = wrapper.querySelector('.accordion');
    const panel = wrapper.querySelector('.panel');
    const id = wrapper.dataset.accordionId || Math.random().toString(36).slice(2,8);
    wrapper.dataset.accordionId = id;
    btn.addEventListener('click', ()=>{
      const open = panel.style.display !== 'block';
      panel.style.display = open ? 'block' : 'none';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.querySelector('.icon').textContent = open ? '[-]' : '[+]';
      const maps = JSON.parse(localStorage.getItem(ACCORDION_KEY) || '{}');
      maps[id] = open;
      localStorage.setItem(ACCORDION_KEY, JSON.stringify(maps));
    });
  });
  
  document.querySelectorAll('.quick-select').forEach(btn => {
      if(btn.onclick || btn.id.includes('btn_b')) return; 
      btn.addEventListener('click', (e) => {
          e.preventDefault();
          const targetEl = $(btn.dataset.target);
          if (targetEl) {
              targetEl.value = btn.dataset.value;
              targetEl.dispatchEvent(new Event('input'));
          }
      });
  });

  document.querySelectorAll('#panel_devices .btn[data-device-type]').forEach(button => {
        button.addEventListener('click', () => {
            createDeviceEntry(button.dataset.deviceType);
            computeAll();
            saveState();
        });
    });

  $('copyBtn').addEventListener('click', ()=> {
    navigator.clipboard.writeText($('summary').value).then(()=> showToast('Summary copied',1400)).catch(()=> showToast('Copy failed',2000));
  });
  $('footerSave').addEventListener('click', ()=> { saveState(true); showToast('Saved',900); });
  $('footerCopy').addEventListener('click', ()=> $('copyBtn').click() );

  const clearDataAction = () => {
    if (!confirm('Are you sure you want to clear all data for this patient?')) return;
    pushUndo(getState());
    
    staticInputs.forEach(id=>{ const el=$(id); if(el) el.value=''; });
    document.querySelectorAll('.segmented-group').forEach(group => {
        group.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    });
    document.querySelectorAll('.toggle-label').forEach(el => {
        el.dataset.value = 'false';
        el.classList.remove('active');
    });

    document.querySelectorAll('.concern-note').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.sub-question-wrapper').forEach(el => {
        el.style.display = 'none'; el.classList.remove('show');
    });
    $('infectionMarkers').style.display = 'none';
    $('mods_inputs').style.display = 'none';

    selectInputs.forEach(g=>{ const el=$(g); if(el) el.querySelectorAll('.select-btn').forEach(b=>b.classList.remove('active')); });
    
    toggleOxyFields();
    document.querySelectorAll('.trend-buttons .trend-btn').forEach(btn => btn.classList.remove('active'));
    $('devices-container').innerHTML = '';
    
    document.querySelector('input[name="reviewType"][value="post"]').checked = true;
    $('dmrPasteCard').style.display = 'none';
    updateWardOptions();
    
    $('chk_medical_rounding').checked = false;
    $('chk_discharge_alert').checked = false;
    $('chk_use_mods').checked = false;
    $('chk_aperients').checked = false;
    $('b_device').dataset.manual = "false";
    $('airway_a').dataset.manual = "false";
    $('dischargeNudge').style.display = 'none';
    
    $('btn_bno').classList.remove('active');
    $('btn_bo').classList.remove('active');
    toggleBowelDate(null);
    
    $('override').value = 'none';
    $('override_reason_box').style.display = 'none';
    $('override_red').classList.remove('active');
    $('override_amber').classList.remove('active');
    
    document.querySelectorAll('.ghost-val').forEach(s => s.textContent='');
    document.querySelectorAll('.input-with-trend input').forEach(i => i.placeholder='');
    const prList = $('prevRiskList'); if(prList) prList.innerHTML='';
    const prCont = $('prevRiskContainer'); if(prCont) prCont.style.display='none';
    
    computeAll();
    saveState(true);
    showToast('Cleared — Undo?', 10000, 'Undo', ()=> {
      const snap = popUndo();
      if (snap) { restoreState(snap); computeAll(); saveState(true); showToast('Restored',1400); }
    });
  };

  $('clearDataBtnTop').addEventListener('click', clearDataAction);
  $('clearDataBtnBottom').addEventListener('click', clearDataAction);

  const darkBtn = $('darkToggle');
  const applyDark = (on) => {
    document.body.classList.toggle('dark', !!on);
    darkBtn.setAttribute('aria-pressed', !!on);
    darkBtn.textContent = (!!on) ? 'Light mode' : 'Dark mode';
    localStorage.setItem('alertToolDark', !!on ? '1' : '0');
  };
  darkBtn.addEventListener('click', ()=> { const on = !document.body.classList.contains('dark'); applyDark(on); });
  if (localStorage.getItem('alertToolDark') === '1') applyDark(true);

  const saved = loadState();
  updateWardOptions(); 
  if (saved) { restoreState(saved); }
  
  toggleOxyFields();
  toggleInfusionsBox();
  toggleNeuroFields();

  const maps = JSON.parse(localStorage.getItem(ACCORDION_KEY) || '{}');
  document.querySelectorAll('.accordion-wrapper').forEach(wrapper => {
      const id = wrapper.dataset.accordionId;
      if (maps[id]) {
          const btn = wrapper.querySelector('.accordion');
          const panel = wrapper.querySelector('.panel');
          panel.style.display = 'block';
          btn.setAttribute('aria-expanded','true');
          btn.querySelector('.icon').textContent='[-]';
      }
  });

  computeAll();
  window.addEventListener('beforeunload', ()=> saveState(true));
}

/* ===========================
   6. UX Logic & Event Handlers
   =========================== */
function handleSegmentClick(id, value) {
    const noteWrapper = $(id + '_note_wrapper');
    if(noteWrapper) {
        noteWrapper.style.display = (value === "true") ? 'block' : 'none';
    }
    
    if (id === 'infection') {
        $('infectionMarkers').style.display = (value === "true") ? 'block' : 'none';
    }
    if (id === 'pressors') {
        const sub = $('sub_pressors_reason');
        if(value === "true") {
            sub.style.display = 'block';
            sub.classList.add('show');
        } else {
            sub.style.display = 'none';
            sub.classList.remove('show');
        }
    }
    if (id === 'intubated') {
        const sub = $('sub_intubated_reason');
        if(value === "true") {
            sub.style.display = 'block';
            sub.classList.add('show');
        } else {
            sub.style.display = 'none';
            sub.classList.remove('show');
        }
    }
}

function updateWardOptions() {
    const type = document.querySelector('input[name="reviewType"]:checked')?.value || 'post';
    const wardSelect = $('ptWard');
    const currentVal = wardSelect.value;
    
    wardSelect.innerHTML = '<option value="" selected disabled>Select Ward...</option>';
    
    let options = [];
    if (type === 'pre') {
        options = ['ICU Pod 1', 'ICU Pod 2', 'ICU Pod 3', 'ICU Pod 4'];
    } else {
        options = [
            '3A','3B','3C','3D',
            '4A','4B','4C','4D',
            '5A','5B','5C','5D',
            '6A','6B','6C','6D',
            '7A','7B','7C','7D',
            'SRS2A','SRS1A','SRSA','SRSB',
            'Medihotel 8','Medihotel 7','Medihotel 6','Medihotel 5',
            'Short Stay','Transit Lounge',
            'Mental Health Adult','Mental Health Youth'
        ];
    }
    options.push('Other');
    
    options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        wardSelect.appendChild(o);
    });
    
    if (options.includes(currentVal)) {
        wardSelect.value = currentVal;
    } else if (currentVal === 'Other') {
        wardSelect.value = 'Other';
    }
    updateWardOtherVisibility();
}

function toggleNeuroFields() {
    const group = $('neuroConcern');
    const active = group.querySelector('.select-btn.active');
    const typeGroup = $('neuroType');
    const noteWrapper = $('neuroConcern_note_wrapper');
    
    if (active && active.dataset.value !== 'none') {
        typeGroup.style.display = 'flex';
        noteWrapper.style.display = 'block';
    } else {
        typeGroup.style.display = 'none';
        noteWrapper.style.display = 'none';
    }
}

function getRoundedTime() {
    const now = new Date();
    const minutes = now.getMinutes();
    const roundedMinutes = Math.round(minutes / 15) * 15;
    if (roundedMinutes === 60) {
        now.setHours(now.getHours() + 1);
        now.setMinutes(0);
    } else {
        now.setMinutes(roundedMinutes);
    }
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateAUS(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function toggleOxyFields() {
  const mod = $('oxMod').querySelector('.select-btn.active')?.dataset.value || 'RA';
  document.querySelectorAll('.npOnly').forEach(el => el.style.display = (mod === 'NP') ? '' : 'none');
  document.querySelectorAll('.hfnpOnly').forEach(el => el.style.display = (mod === 'HFNP') ? '' : 'none');
  document.querySelectorAll('.nivOnly').forEach(el => el.style.display = (mod === 'NIV') ? '' : 'none');
  document.querySelectorAll('.tracheOnly').forEach(el => el.style.display = (mod === 'Trache') ? '' : 'none');
}

function toggleInfusionsBox() {
    const reviewType = document.querySelector('input[name="reviewType"]:checked')?.value || 'post';
    $('infusions_wrapper').style.display = (reviewType === 'pre') ? 'grid' : 'none';
}

function toggleBowelDate(mode) {
    const wrapper = $('bowel_date_wrapper');
    const label = $('bowel_date_label');
    const aperients = $('aperients_wrapper');
    if (!mode) {
        wrapper.style.display = 'none';
        return;
    }
    wrapper.style.display = 'block';
    label.textContent = (mode === 'btn_bno') ? 'Date Last Opened' : 'Date BO';
    if(mode === 'btn_bno') {
        aperients.style.display = 'block';
    } else {
        aperients.style.display = 'none';
        $('chk_aperients').checked = false; // reset check if switching
    }
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

function updateSingleBloodFlag(key, value) {
    const range = normalRanges[key];
    if(!range) return;
    const inputEl = $(`bl_${key}`);
    const rangeEl = $(`bl_${key}_range`);
    if (inputEl) {
        let isAbnormal = false;
        // eGFR FIX
        if (key === 'egfr') {
            isAbnormal = (value !== null && value < range.low);
        } else {
            isAbnormal = value !== null && (value < range.low || value > range.high);
        }
        
        inputEl.classList.toggle('blood-abnormal', isAbnormal);
        if (rangeEl) {
            if(isAbnormal){
              rangeEl.textContent = key === 'egfr' ? `(Target: >${range.low})` : `(Normal: ${range.low}-${range.high})`;
              rangeEl.style.display = 'block';
            } else {
              rangeEl.style.display = 'none';
            }
        }
    }
}

function updateBloodFlags(s) {
  for (const key of Object.keys(normalRanges)) {
    updateSingleBloodFlag(key, num(s[`bl_${key}`]));
  }
}

function updateWardOtherVisibility() {
    const wardSelect = $('ptWard');
    const otherWrapper = $('ptWardOtherWrapper');
    if (wardSelect && otherWrapper) {
        otherWrapper.style.display = (wardSelect.value === 'Other') ? 'block' : 'none';
    }
}

function calculateTimeOnWard(dateStr, timeOfDay) {
  if (!dateStr) return { text: null, hours: null };
  const timeMap = { 'Morning': 9, 'Afternoon': 15, 'Evening': 18, 'Night': 21 };
  const stepdownHour = timeMap[timeOfDay] || 12;
  const [year, month, day] = dateStr.split('-').map(Number);
  const stepdownDate = new Date(year, month - 1, day, stepdownHour, 0, 0);
  if (isNaN(stepdownDate.getTime())) return { text: null, hours: null };
  
  const diffMs = new Date().getTime() - stepdownDate.getTime();
  const diffHours = diffMs / 3600000;
  if (diffHours < 0) return { text: '(future date)', hours: diffHours };

  let text;
  if (diffHours < 24) {
      text = `${Math.round(diffHours)} hours`;
  } else if (diffHours < 72) {
      const days = (Math.round((diffHours / 24) * 2) / 2);
      text = `${days} day${days === 1 ? '' : 's'}`;
  } else {
      const days = Math.round(diffHours / 24);
      text = `${days} day${days === 1 ? '' : 's'}`;
  }
  return { text: text, hours: diffHours };
}

/* ===========================
   7. Scoring & Summary Logic
   =========================== */
function computeAll() {
  const s = getState();
  
  // Auto-populate A-E
  const airwayText = getAirwayDeviceText(s);
  const airwayEl = $('airway_a');
  if (airwayEl.dataset.manual !== "true" && airwayText) {
      airwayEl.value = airwayText; s.airway_a = airwayText;
  }
  
  const oxyDeviceText = getOxyDeviceText(s);
  const bDeviceEl = $('b_device');
  if (bDeviceEl.dataset.manual !== "true") {
      bDeviceEl.value = oxyDeviceText; s.b_device = oxyDeviceText;
  }
  
  const red = [], amber = [];
  const flaggedElements = { red: [], amber: [] };
  const addRisk = (list, text, note, elementId, flagType) => {
    if (note && note.trim()) list.push(`${text} (${note.trim()})`);
    else list.push(text);
    if (elementId && flagType) flaggedElements[flagType].push(elementId);
  }

  const ward = s.ptWard === 'Other' ? s.ptWardOther : s.ptWard;
  const location = [ward, s.ptBed].filter(Boolean).join(' ').trim();
  
  /* --- SCORING LOGIC --- */
  
  // 1. ADDS Score
  const adds = num(s.adds);
  if (adds !== null) {
      const timeData = calculateTimeOnWard(s.stepdownDate, s.stepdownTime);
      const hours = timeData.hours || 0;
      const addsTrend = s['adds_trend'] || '';
      
      if (adds >= 4) {
          red.push(`ADDS ${adds}`); 
          flaggedElements.red.push('adds');
      } 
      else if (adds === 3) {
          if (hours < 24) {
              amber.push(`ADDS 3 (<24h stepdown)`);
              flaggedElements.amber.push('adds');
          } else {
              if (addsTrend === '→' || addsTrend === '↓') {
              } else {
                  amber.push(`ADDS 3 (Trend: ${addsTrend || 'Unspecified'})`);
                  flaggedElements.amber.push('adds');
              }
          }
      }
  }

  // 2. Flags
  const icuLos = num(s.icuLos);
  const immobility = s.immobility === true;
  const pressorReason = $('pressorReason').querySelector('.active')?.dataset.value;
  const pressorsRed = (s.pressors === true && pressorReason === 'shock');
  const pressorsAmber = (s.pressors === true && pressorReason === 'routine');
  const lactateVal = num(s.lactate);
  
  if (immobility) addRisk(amber, 'Immobility >48h', s.immobility_note, 'seg_immobility', 'amber');

  // Oxygen
  const oxModGroup = $('oxMod');
  if (s.oxMod === 'NP') {
    const flow = num(s.npFlow);
    if (flow !== null && flow >= 3) { red.push(`NP flow ${flow} L/min`); flaggedElements.red.push(oxModGroup.id); flaggedElements.red.push('npFlow'); }
    else if (flow !== null && flow >= 2) { amber.push(`NP flow ${flow} L/min`); flaggedElements.amber.push(oxModGroup.id); flaggedElements.amber.push('npFlow');}
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

  // Historical O2
  if (s.hist_o2 === true) addRisk(red, 'Historical high O2/NIV', s.hist_o2_note, 'seg_hist_o2', 'red');
  
  if (s.intubated === true) {
      const reason = $('intubatedReason').querySelector('.active')?.dataset.value;
      let label = 'Intubated in last 24h';
      if (reason === 'concern') addRisk(red, `${label} (Concerns)`, s.intubation_details, 'seg_intubated', 'red');
      else addRisk(amber, `${label} (Routine/Elective)`, s.intubation_details, 'seg_intubated', 'amber');
  }

  if (s.rapid_wean === true) addRisk(red, 'Rapid oxygen wean in last 12h', s.rapid_wean_note, 'seg_rapid_wean', 'red');
  
  if (s.after_hours === true) addRisk(amber, 'Discharged after-hours', s.after_hours_note, 'seg_after_hours', 'amber');
  
  if (pressorsRed) addRisk(red, 'Vasopressors required (Shock/Complicated)', s.pressors_note, 'seg_pressors', 'red');
  else if (pressorsAmber) addRisk(amber, 'Vasopressors (Routine/Short term)', s.pressors_note, 'seg_pressors', 'amber');

  if (lactateVal > 2.5) { red.push(`Lactate ${lactateVal}`); flaggedElements.red.push('lactate');}
  else if (lactateVal >= 2.0) { amber.push(`Lactate ${lactateVal}`); flaggedElements.amber.push('lactate');}
  
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
  else if (hb !== null && hb <= 100 && s.hb_dropping === true) { 
      amber.push(`Anemia concern (Hb ${hb}, dropping)`); 
      flaggedElements.amber.push('hb'); flaggedElements.amber.push('seg_hb_dropping');
  }

  const comorbIds = ['comorb_copd','comorb_hf','comorb_esrd','comorb_diabetes','comorb_cirrhosis', 'comorb_other'];
  const comorbCount = comorbIds.filter(id => s[id] === true).length;
  if (comorbCount >= 3) { 
      red.push('Multiple comorbidities'); 
      comorbIds.forEach(id => {if(s[id]) flaggedElements.red.push('toggle_'+id) });
  }
  else if (comorbCount > 0) { 
      amber.push(`Comorbidity burden`); 
      comorbIds.forEach(id => {if(s[id]) flaggedElements.amber.push('toggle_'+id) });
  }

  if (s.infection === true) {
     const wcc = num(s.wcc), crp = num(s.crp), nlr = updateNLR();
     let markerParts = [];
     let hasRedMarker = false, hasAmberMarker = false;
     if (wcc !== null && (wcc < 4 || wcc > 11)) { markerParts.push(`WCC ${wcc}`); hasRedMarker = true; }
     if (crp > 100) { markerParts.push(`CRP ${crp}`); hasRedMarker = true; }
     else if (crp > 50) { markerParts.push(`CRP ${crp}`); hasAmberMarker = true; }
     if (nlr > 10) { markerParts.push(`NLR ${nlr}`); hasRedMarker = true; }
     else if (nlr >= 5) { markerParts.push(`NLR ${nlr}`); hasAmberMarker = true; }
     
     let baseText = 'Infection Concern';
     if(markerParts.length) baseText += `: High markers (${markerParts.join(', ')})`;
     
     let cat = hasRedMarker ? 'red' : (hasAmberMarker ? 'amber' : 'red'); 
     addRisk(cat === 'red' ? red : amber, baseText, s.infection_note, 'seg_infection', cat);
  }

  const overrideNote = $('overrideNote')?.value ? ` (${$('overrideNote').value})` : '';
  if ($('override').value === 'red') red.push(`Override: CAT 1 concern${overrideNote}`);
  else if ($('override').value === 'amber') amber.push(`Override: CAT 2 concern${overrideNote}`);

  updateBloodFlags(s);
  
  if (icuLos > 5 && (red.length > 0 || amber.length > 0)) {
      red.push(`ICU LOS ${icuLos} days (Escalated due to presence of other risks)`);
  }

  const redCount = red.length;
  const amberCount = amber.length;
  const cat = (redCount > 0) ? {id: 'red', text: 'CAT 1', catNum: 1} : (amberCount > 0) ? {id: 'amber', text: 'CAT 2', catNum: 2} : {id: 'green', text: 'CAT 3', catNum: 3};
  
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
  } else {
      flagListEl.innerHTML = `<div style="color:var(--muted)">No risk factors identified</div>`;
  }
  
  document.querySelectorAll('.flag-red, .flag-amber').forEach(el => el.classList.remove('flag-red', 'flag-amber'));
  flaggedElements.red.forEach(id => { const el=$(id); if(el) el.classList.add('flag-red'); });
  flaggedElements.amber.forEach(id => { const el=$(id); if(el) el.classList.add('flag-amber'); });

  const followUpEl = $('followUpInstructions');
  let followUpHTML = '';
  if (s.chk_discharge_alert === true) {
      followUpHTML = `<div class="status" style="color:var(--blue-hint);">Discharge from ALERT nursing post ICU review list.</div>`;
  } else if (cat.id === 'red') {
      followUpHTML = `<div class="status red">${redCount >= 3 ? 'Twice-daily' : 'At least daily'} ALERT review for up to 72h post-ICU stepdown.</div>`;
  } else if (cat.id === 'amber') {
      followUpHTML = `<div class="status amber">Once-daily ALERT review for up to 48h post-ICU stepdown.</div>`;
  } else {
      followUpHTML = `<div class="status green">Single ALERT review on ward to ensure continued stability.</div>`;
  }
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
  $('footerLocation').textContent = location || '--';
  $('footerAdmission').textContent = s.ptAdmissionReason || '--';
  const scoreEl = $('footerScore');
  scoreEl.className = `footer-score tag ${cat.id}`;
  const flagCount = redCount > 0 ? redCount : amberCount;
  scoreEl.textContent = `${cat.text}${flagCount>0 ? ` (${flagCount} Flag${flagCount>1?'s':''})` : ''}`;

  generateSummary(s, cat, location, wardTime.text, red, amber);
}

function generateSummary(s, cat, location, timeOnWardText, red, amber) {
  const clean = (str) => str ? str.trim().replace(/\.$/, '').trim() : null;
  const trendWord = val => ({ '↑': ' (uptrending)', '↓':' (downtrending)', '→':' (stable)'}[val] || '');
  
  const role = s.clinicianRole || 'ALERT CNS';
  const reviewTitle = (s.reviewType === 'post' || s.reviewType === 'followup') ? `${role} post ICU review` : `${role} pre ICU stepdown review`;
  
  const headerLines = [];
  const ptDetails = [];
  if (s.ptName) ptDetails.push(`Patient: ${s.ptName}`);
  if (s.ptMrn) ptDetails.push(`URN: ...${s.ptMrn}`);
  if (location) ptDetails.push(`Location: ${location}`);
  if (ptDetails.length) headerLines.push(ptDetails.join(' | '));
  
  headerLines.push(reviewTitle, `Time of review: ${getRoundedTime()}`);
  
  if (s.stepdownDate) headerLines.push(`ICU Discharge Date: ${formatDateAUS(s.stepdownDate)}`);

  const stepdownParts = [];
  if (s.reviewType !== 'pre' && timeOnWardText) stepdownParts.push(`Time since stepdown: ${timeOnWardText}.`);
  if (s.icuLos) stepdownParts.push(`ICU LOS: ${s.icuLos} days.`);
  if (stepdownParts.length) headerLines.push('', ...stepdownParts);
  
  if(s.ptAdmissionReason) headerLines.push(`Reason for ICU Admission: ${s.ptAdmissionReason}`);
  
  const lines = [...headerLines, '', `ALERT Nursing Review Category - ${cat.text}`];
  if (s.pmh_note && s.pmh_note.trim()) lines.push('', 'PMH:', s.pmh_note.trim());
  
  const atoe = [];
  if (s.chk_use_mods === true) {
      const modsParts = [];
      if(s.mods_score) modsParts.push(`MODS Score: ${s.mods_score}`);
      if(s.mods_details) modsParts.push(`Details: ${s.mods_details}`);
      if(modsParts.length > 0) atoe.push(modsParts.join(' | '));
  } else if(s.adds) {
      let addsStr = `ADDS: ${s.adds}`;
      if(s.adds_trend) addsStr += ` (Trend: ${s.adds_trend})`;
      atoe.push(addsStr);
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
  if (s.bowel_mode === 'btn_bno' && s.bowel_date) {
      const date = formatDateAUS(s.bowel_date);
      bowelStr = bowelStr ? `BNO (Last opened: ${date}), ${bowelStr}` : `BNO (Last opened: ${date})`;
      if (s.chk_aperients) bowelStr += ' (Aperients charted)';
  } else if (s.bowel_mode === 'btn_bo' && s.bowel_date) {
      const date = formatDateAUS(s.bowel_date);
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

  const bloodLines = [];
  const bloodLabelMap = { 'lac_review': 'Lac', 'hb': 'Hb', 'wcc': 'WCC', 'crp': 'CRP', 'cr_review': 'Cr', 'k': 'K', 'na': 'Na', 'mg': 'Mg', 'plts': 'Plts', 'alb': 'Alb', 'neut': 'Neut', 'lymph': 'Lymph', 'phos': 'PO4', 'urea': 'Urea', 'egfr': 'eGFR' };
  const bloodParts = ['lac_review','hb','wcc','crp','cr_review','k','na','mg','phos','urea','egfr','plts','alb','neut','lymph'];
  
  const bloods = bloodParts.map(k => {
    const v = s[`bl_${k}`]; if (!v) return null;
    const trend = s[`bl_${k}_trend`] || '';
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
  if (s.hb_dropping_note && s.hb_dropping === true) {
      contextLines.push(`Hb Plan: ${s.hb_dropping_note.trim()}`);
  }
  if (s.goc_note) {
    const gocText = s.goc_note.trim();
    contextLines.push(gocText.toLowerCase().startsWith('goc') ? gocText : `GOC: ${gocText}`);
  }
  if (s.allergies_note) contextLines.push(`Allergies: ${s.allergies_note.trim()}`);
  if (s.pics_note) contextLines.push(`Post ICU Syndrome: ${s.pics_note.trim()}`);
  if (s.context_other_note) contextLines.push(`Other: ${s.context_other_note.trim()}`);
  if (contextLines.length) lines.push('', ...contextLines);
  
  const prevRiskList = document.getElementById('prevRiskList');
  if (prevRiskList && prevRiskList.children.length > 0) {
      const unresolved = [];
      const resolved = [];
      prevRiskList.querySelectorAll('.prev-risk-item').forEach(item => {
          const text = item.querySelector('span').textContent;
          const isChecked = item.querySelector('input').checked;
          if(isChecked) resolved.push(text);
          else unresolved.push(text);
      });
      if(resolved.length) lines.push('', 'RESOLVED ISSUES:', ...resolved.map(r => `- ${r} (Resolved)`));
      if(unresolved.length) lines.push('', 'PERSISTENT PREVIOUS CONCERNS:', ...unresolved.map(u => `- ${u}`));
  }
  
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

document.addEventListener('DOMContentLoaded', ()=> {
  initialize();
});
