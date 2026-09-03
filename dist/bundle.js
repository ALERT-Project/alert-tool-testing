(() => {
  // src/js/utils.js
  var $ = (id) => document.getElementById(id);
  var debounce = (fn, wait = 350) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(void 0, a), wait);
    };
  };
  var num = (v) => {
    const x = parseFloat(v);
    return isNaN(x) ? null : x;
  };
  function iconSetForPath(pathname = location.pathname) {
    return /alert-tool-testing/i.test(pathname) ? "test" : "alert";
  }
  function timeHHMM(d = /* @__PURE__ */ new Date()) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  function nowTimeStr() {
    return timeHHMM();
  }
  function todayDateStr() {
    const d = /* @__PURE__ */ new Date();
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }
  function formatDateDDMMYYYY(isoStr) {
    if (!isoStr) return "";
    const [y, m, d] = isoStr.split("-");
    return `${d}/${m}/${y}`;
  }
  function wardLabel(s) {
    const ward = (s.ptWard || "").trim();
    if (ward === "Other") return (s.ptWardOther || "").trim();
    return ward;
  }
  function sentenceCase(str) {
    if (!str) return "";
    str = str.trim();
    if (/^[0-9]/.test(str) || /^[A-Z]{2}/.test(str) || /^[A-Z][0-9]/.test(str)) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  function joinGrammatically(parts) {
    if (!parts || parts.length === 0) return "";
    if (parts.length === 1) return parts[0];
    const [first, ...rest] = parts;
    const procRest = rest.map((s) => {
      if (/^[0-9]/.test(s) || /^[A-Z]{2}/.test(s) || /^[A-Z][0-9]/.test(s) || /\b[A-Z]{2,}\b/.test(s)) return s;
      return s.toLowerCase();
    });
    return [first, ...procRest].join(", ");
  }
  function disableAutofill(root = document) {
    applyAutofillOff(root);
    if (root === document && !document.__autofillObserver) {
      const observer = new MutationObserver((records) => {
        records.forEach((r) => r.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches?.("input, textarea")) applyAutofillOff({ querySelectorAll: () => [node] });
          applyAutofillOff(node);
        }));
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      document.__autofillObserver = observer;
    }
  }
  function applyAutofillOff(root) {
    root.querySelectorAll("input, textarea").forEach((el) => {
      el.setAttribute("autocomplete", "off");
      el.setAttribute("autocorrect", "off");
      el.setAttribute("spellcheck", "false");
    });
  }
  var DMR_SUBSTITUTIONS = [
    [/→/g, " to "],
    // →
    [/←/g, " from "],
    // ←
    [/↑/g, " up"],
    // ↑
    [/↓/g, " down"],
    // ↓
    [/[–—]/g, "-"],
    // – —
    [/[‘’]/g, "'"],
    // ' '
    [/[“”]/g, '"'],
    // " "
    [/…/g, "..."],
    // …
    [/≥/g, ">="],
    // ≥
    [/≤/g, "<="],
    // ≤
    [/°/g, " deg"],
    // °
    [/µ/g, "u"],
    // µ
    [/×/g, "x"],
    // ×
    [/[₂²]/g, "2"],
    // SpO₂ / m² - the tool writes plain digits, but pasted text may not
    [/ /g, " "]
    // non-breaking space
  ];
  function toDmrSafeText(text) {
    let out = String(text ?? "");
    DMR_SUBSTITUTIONS.forEach(([re, rep]) => {
      out = out.replace(re, rep);
    });
    return out.replace(/[ \t]{2,}/g, " ");
  }
  function showToast(msg, timeout = 2500) {
    const t = $("toast");
    if (t) {
      t.textContent = msg;
      t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), timeout);
    }
  }

  // src/js/notices.js
  var notices = /* @__PURE__ */ new Map();
  var TONE_CLASS = { red: "notice-red", amber: "notice-amber", info: "notice-info" };
  var NOTICE_PRIORITY = {
    NEW_RISK: 10,
    HANDOVER: 20,
    DISCHARGE: 30,
    SCRAPED_REVIEW: 40,
    COMPLETENESS: 90
  };
  function setNotice(id, { priority = 50, tone = "info", html = "", actions = [] }) {
    const existing = notices.get(id);
    if (existing && existing.html === html && existing.tone === tone && existing.actions.length === actions.length) {
      existing.actions = actions;
      return;
    }
    notices.set(id, { id, priority, tone, html, actions });
    renderNotices();
  }
  function clearNotice(id) {
    if (notices.delete(id)) renderNotices();
  }
  function renderNotices() {
    const region = $("noticeRegion");
    if (!region) return;
    const ordered = [...notices.values()].sort((a, b) => a.priority - b.priority);
    const active = ordered[0];
    if (!active) {
      region.hidden = true;
      region.innerHTML = "";
      region.className = "notice";
      return;
    }
    const waiting = ordered.length - 1;
    region.className = `notice ${TONE_CLASS[active.tone] || TONE_CLASS.info}`;
    region.innerHTML = `
        <div class="notice-body">${active.html}</div>
        ${active.actions.length ? `<div class="notice-actions">${active.actions.map((a) => `<button type="button" class="btn small" data-notice-action="${a.id}">${a.label}</button>`).join("")}</div>` : ""}
        ${waiting > 0 ? `<div class="notice-more" title="${ordered.slice(1).map((n) => n.id).join(", ")}">+${waiting} more</div>` : ""}`;
    region.hidden = false;
    active.actions.forEach((a) => {
      region.querySelector(`[data-notice-action="${a.id}"]`)?.addEventListener("click", (e) => {
        e.preventDefault();
        a.onClick();
      });
    });
  }

  // src/js/config.js
  var STORAGE_KEY = "alertToolData_v7_7";
  var ACCORDION_KEY = "alertToolAccordions_v7_7";
  var UNDO_KEY = "alertToolUndo_v7_7";
  var GATE_LINKED_BLOODS = ["cr_review", "wcc", "crp", "neut", "lymph", "k", "na", "mg", "phos", "lac_review", "aptt"];
  var BLOOD_LABELS = {
    wcc: "WCC",
    crp: "CRP",
    neut: "Neut",
    lymph: "Lymph",
    hb: "Hb",
    plts: "Plts",
    k: "K+",
    na: "Na",
    cr_review: "Cr",
    egfr: "eGFR",
    mg: "Mg",
    alb: "Alb",
    lac_review: "Lactate",
    phos: "PO4",
    bili: "Bili",
    alt: "ALT",
    inr: "INR",
    aptt: "APTT",
    bsl: "BSL"
  };
  var NOTE_BLOOD_LABELS = {
    lac_review: "Lac",
    hb: "Hb",
    wcc: "WCC",
    crp: "CRP",
    cr_review: "Cr",
    egfr: "eGFR",
    k: "K",
    na: "Na",
    mg: "Mg",
    phos: "PO4",
    plts: "Plts",
    alb: "Alb",
    neut: "Neut",
    lymph: "Lymph",
    bili: "Bili",
    alt: "ALT",
    inr: "INR",
    aptt: "APTT"
  };
  var normalRanges = {
    wcc: { low: 4, high: 11 },
    crp: { low: 0, high: 5 },
    neut: { low: 1.5, high: 7.5 },
    lymph: { low: 1, high: 4 },
    hb: { low: 115, high: 165 },
    plts: { low: 150, high: 400 },
    k: { low: 3.5, high: 5.2 },
    na: { low: 135, high: 145 },
    cr_review: { low: 50, high: 98 },
    egfr: { low: 60, high: 120 },
    mg: { low: 0.7, high: 1.1 },
    alb: { low: 35, high: 50 },
    lac_review: { low: 0.5, high: 2 },
    phos: { low: 0.8, high: 1.5 },
    bili: { low: 0, high: 20 },
    alt: { low: 0, high: 40 },
    inr: { low: 0.9, high: 1.2 },
    aptt: { low: 25, high: 38 },
    bsl: { low: 4, high: 15 }
  };
  var comorbMap = {
    "comorb_copd": "COPD",
    "comorb_asthma": "Asthma",
    "comorb_hf": "Active Heart Failure",
    "comorb_esrd": "ESRD",
    "comorb_dialysis": "Dialysis",
    "comorb_diabetes": "Diabetes",
    "comorb_cirrhosis": "Cirrhosis",
    "comorb_malignancy": "Active malignancy",
    "comorb_immuno": "Immunosuppression",
    "comorb_other": "Other"
  };
  var staticInputs = [
    "reviewTime",
    "reviewerInitials",
    "quickNotes",
    "ptName",
    "ptMrn",
    "ptAge",
    "ptWeight",
    "ptWard",
    "ptBed",
    "spo2_target",
    "ptWardOther",
    "ptAdmissionReason",
    "icuSummary",
    "icuLos",
    "stepdownDate",
    "stepdownTime",
    "npFlow",
    "hfnpFio2",
    "hfnpFlow",
    "nivFio2",
    "nivPeep",
    "nivPs",
    "override",
    "overrideNote",
    "addsManual",
    "addsOverrideNote",
    "trache_details_note",
    "mods_score",
    "mods_details",
    "airway_a",
    "a_comment",
    "b_rr",
    "b_spo2",
    "b_device",
    "b_wob",
    "b_cough",
    "b_comment",
    "c_hr",
    "c_hr_rhythm",
    "c_nibp",
    "c_cr",
    "c_perf",
    "c_comment",
    "d_alert",
    "d_pain",
    "d_comment",
    "e_temp",
    "e_bsl",
    "e_fluid",
    "e_uop",
    "e_comment",
    "atoe_adds",
    "ae_mobility",
    "ae_diet",
    "ae_bowels",
    "bowel_date",
    "bl_wcc",
    "bl_crp",
    "bl_neut",
    "bl_lymph",
    "bl_hb",
    "bl_plts",
    "bl_k",
    "bl_na",
    "bl_cr_review",
    "bl_mg",
    "bl_alb",
    "bl_lac_review",
    "bl_phos",
    "bl_bili",
    "bl_alt",
    "bl_inr",
    "bl_aptt",
    "bl_egfr",
    "inr_target",
    "aptt_target",
    "bloods_date",
    "bloods_time",
    "anticoag_note",
    "vte_prophylaxis_note",
    "elec_replace_note",
    "goc_note",
    "allergies_note",
    "pics_note",
    "context_other_note",
    "pmh_note",
    "adds",
    "wcc",
    "crp",
    "neut",
    "lymph",
    "infusions_note",
    "dyspneaConcern",
    "dyspneaConcern_note",
    "renal_note",
    "infection_note",
    "electrolyteConcern_note",
    "neuroType_note",
    "nutrition_context_note",
    "pain_context_note",
    "neuro_psych_note",
    "sleep_quality_note",
    "fluid_restriction_amount",
    "after_hours_note",
    "pressors_note",
    "immobility_note",
    "comorb_other_note",
    "unsuitable_note",
    "pressor_ceased_time",
    "pressor_recent_other_note",
    "pressor_current_other_note",
    "hac_note",
    "discharge_pending_bloods_note",
    "age_mitigate_reason",
    "los_mitigate_reason",
    "frailty_note"
  ];
  var segmentedInputs = [
    "bloods_status",
    "after_hours",
    "hist_o2",
    "intubated",
    "resp_concern",
    "renal",
    "immobility",
    "infection",
    "new_bloods_ordered",
    "neuro_gate",
    "nutrition_adequate",
    "electrolyte_gate",
    "pressors",
    "hac",
    "stepdown_suitable",
    "comorbs_gate",
    "renal_chronic",
    "renal_chronic_bloods",
    "infection_downtrend",
    "infection_downtrend_bloods",
    "sleep_quality",
    "pain_control",
    "neuro_psych",
    "pics",
    "resp_dyspnea",
    "resp_tachypnea",
    "resp_rapid_wean",
    "resp_poor_cough",
    "resp_poor_swallow",
    "age_mitigated",
    "los_mitigated",
    "frailty_known",
    // Only asked when the rhythm reads irregular - see updateRhythmNewVisibility in ui.js.
    "c_hr_rhythm_new"
  ];
  var toggleInputs = [
    "comorb_copd",
    "comorb_asthma",
    "comorb_hf",
    "comorb_esrd",
    "comorb_dialysis",
    "comorb_diabetes",
    "comorb_cirrhosis",
    "comorb_malignancy",
    "comorb_immuno",
    "comorb_other",
    "renal_oliguria",
    "renal_anuria",
    "renal_fluid",
    "renal_oedema",
    "renal_dysfunction",
    "renal_dialysis",
    "renal_dehydrated",
    "renal_worsening_cr",
    "chk_aperients",
    "chk_unknown_blo_date",
    "pressor_recent_norad",
    "pressor_recent_met",
    "pressor_recent_gtn",
    "pressor_recent_dob",
    "pressor_recent_mid",
    "pressor_recent_other",
    "pressor_current_mid",
    "pressor_current_other"
  ];
  var selectInputs = [
    "oxMod",
    "dyspneaConcern",
    "neuroConcern",
    "neuroType",
    "electrolyteConcern",
    "tracheType",
    "tracheStatus",
    "intubatedReason",
    "dialysis_type"
  ];
  var deviceTypes = ["CVC", "PICC", "Other CVAD", "PIVC", "Arterial Line", "Enteral Tube", "IDC", "Pacing Wire", "Drain", "Wound", "Vascath", "Tracheostomy", "Other Device"];
  var QUICK_REVIEW_SCORING_IDS = [
    "adds",
    // ADDS / MODS total
    // The parameters the score is calculated from. Each carries its own threshold, and those
    // thresholds are the safety net for exactly the cases the total misses - a single
    // catastrophic parameter inside an otherwise unremarkable score, or a MODS in use. Leaving
    // them out meant SpO2 84%, SBP 82 and HR 135 each computed CAT 3 in Quick Review and CAT 1
    // in Full, which is the worst possible way for two modes to disagree.
    "b_rr",
    "b_spo2",
    "c_hr",
    "c_nibp",
    "e_temp",
    // Oxygen delivery: a flow rate and an FiO2 are measured numbers like any other, and a new
    // tracheostomy is a recorded fact rather than a judgement.
    "npFlow",
    "oxMod",
    "tracheStatus",
    "ptAge",
    "icuLos",
    // demographics
    "bl_plts",
    "bl_lac_review",
    "bl_cr_review",
    "bl_crp",
    "e_bsl",
    "electrolyteConcern",
    // fires from K/Na/Mg/PO4 numbers when no gate is set
    "seg_infection",
    // fires from WCC/CRP/NLR/temperature when no gate is set
    "override_red",
    "override_amber"
  ];
  var SELF_DERIVED_RISK = new RegExp([
    "prolonged icu stay",
    "deconditioning risk",
    "after-hours",
    "^age \\d",
    "^(elevated )?(adds|mods) \\d",
    "^lactate \\d",
    "^(low|high) bsl",
    "^low platelets",
    "^electrolyte concern",
    "^infection risk",
    "^worsening cr",
    "^rising crp"
  ].join("|"), "i");
  var FIELD_BACKED_FACTOR = /^(mobility|diet|nutrition|post icu syndrome|sleep|psychological issues)\s*:/i;
  var GATE_RISK_ID = {
    seg_resp_concern: "seg_resp_concern",
    seg_neuro_gate: "neuroConcern",
    seg_renal: "seg_renal",
    seg_infection: "seg_infection",
    seg_electrolyte_gate: "electrolyteConcern",
    seg_pressors: "seg_pressors",
    seg_immobility: "seg_immobility"
  };

  // src/js/trends.js
  var TREND_RULES = {
    cr_review: { minAbs: 15, minPct: 15, floor: 40 },
    crp: { minAbs: 20, minPct: 25, floor: 20 },
    hb: { minAbs: 10, minPct: 8, floor: 0 },
    wcc: { minAbs: 2, minPct: 20, floor: 0 },
    neut: { minAbs: 1, minPct: 20, floor: 0 },
    lymph: { minAbs: 1, minPct: 20, floor: 0 },
    plts: { minAbs: 30, minPct: 20, floor: 0 },
    k: { minAbs: 0.4, minPct: 8, floor: 0 },
    na: { minAbs: 3, minPct: 2, floor: 0 },
    mg: { minAbs: 0.2, minPct: 15, floor: 0 },
    phos: { minAbs: 0.2, minPct: 15, floor: 0 },
    inr: { minAbs: 0.3, minPct: 15, floor: 0 },
    aptt: { minAbs: 5, minPct: 15, floor: 0 },
    alb: { minAbs: 5, minPct: 12, floor: 0 },
    alt: { minAbs: 0, minPct: 50, floor: 0 },
    bili: { minAbs: 0, minPct: 50, floor: 0 },
    lac_review: { minAbs: 0.5, minPct: 25, floor: 0 }
    // egfr is deliberately absent: it is calculated from creatinine, so its arrow would only
    // ever repeat the creatinine one.
  };
  function computeTrend(key, current, previous) {
    const rule = TREND_RULES[key];
    const cur = num(current);
    const prev = num(previous);
    if (!rule || cur === null || prev === null || cur === prev) return null;
    if (Math.max(Math.abs(cur), Math.abs(prev)) < rule.floor) return null;
    const absDelta = Math.abs(cur - prev);
    const pctDelta = prev === 0 ? Infinity : absDelta / Math.abs(prev) * 100;
    if (pctDelta < rule.minPct) return null;
    const range = normalRanges[key];
    const inRange = (v) => !range || v >= range.low && v <= range.high;
    if (inRange(cur) && inRange(prev) && absDelta < rule.minAbs) return null;
    return {
      key,
      current: cur,
      previous: prev,
      delta: cur - prev,
      absDelta,
      pctDelta,
      rising: cur > prev,
      direction: cur > prev ? "\u2191" : "\u2193"
    };
  }
  function applyTrendArrows(state, prevBloods) {
    if (!prevBloods) return;
    Object.keys(TREND_RULES).forEach((key) => {
      const group = document.getElementById(`bl_${key}_trend`);
      if (!group || group.dataset.manual === "true") return;
      const trend = computeTrend(key, state[`bl_${key}`], prevBloods[key]);
      group.querySelectorAll(".trend-btn").forEach((b) => b.classList.remove("active"));
      if (!trend) return;
      group.querySelector(`.trend-btn[data-value="${trend.direction}"]`)?.classList.add("active");
    });
  }

  // src/js/rules.js
  var unit = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`;
  function calculateWardTime(dateStr, timeStr, isPre, now = /* @__PURE__ */ new Date()) {
    if (isPre) return { hours: 0, text: "(Pre-Stepdown)" };
    if (!dateStr) return { hours: 0, text: "" };
    let h = 16;
    let min = 0;
    if (timeStr && timeStr.includes(":")) {
      const parts = timeStr.split(":");
      h = parseInt(parts[0], 10);
      min = parseInt(parts[1], 10);
    } else if (timeStr) {
      h = { "Morning": 9, "Afternoon": 15, "Evening": 18, "Night": 21 }[timeStr] || 18;
    }
    const [y, m, d] = dateStr.split("-");
    const stepObj = new Date(y, m - 1, d, h, min);
    const diffHours = (now - stepObj) / 36e5;
    if (diffHours < 0) return { hours: diffHours, text: "(Planned Stepdown)" };
    if (diffHours < 12) return { hours: diffHours, text: unit(Math.round(diffHours), "hour") };
    if (diffHours <= 48) {
      const halfDays = Math.round(diffHours / 24 * 2) / 2;
      return { hours: diffHours, text: unit(halfDays, "day") };
    }
    return { hours: diffHours, text: unit(Math.round(diffHours / 24), "day") };
  }
  function deriveAfterHours(s, timeData, isPre) {
    if (isPre || !s.stepdownDate) return null;
    const [y, m, d] = s.stepdownDate.split("-");
    let stepH = 16;
    if (s.stepdownTime && s.stepdownTime.includes(":")) stepH = parseInt(s.stepdownTime.split(":")[0], 10);
    const stepObj = new Date(y, m - 1, d, stepH, 0);
    const stepDay = stepObj.getDay();
    const isWeekend = stepDay === 0 || stepDay === 6;
    const isAfterHoursStepdown = stepH >= 16 || stepH < 9;
    if (timeData.hours > 24) return false;
    return isAfterHoursStepdown || isWeekend;
  }
  var MOD_PATTERNS = {
    rr: /\brr\b|respiratory rate/,
    hr: /\bhr\b|heart rate|\bpulse\b/,
    spo2: /\bspo2\b|\bsats?\b|saturation/,
    bp: /\bs?bp\b|blood pressure/,
    temp: /\btemp\b|temperature/
  };
  var parseTarget = (t) => {
    const m = (t || "").match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/);
    return m ? { low: parseFloat(m[1]), high: parseFloat(m[2]) } : null;
  };
  function evaluateRisks(s, ctx = {}) {
    const prevBloods = ctx.prevBloods || {};
    const now = ctx.now || /* @__PURE__ */ new Date();
    const red = [], amber = [], suppressedRisks = [];
    const flagged = { red: [], amber: [] };
    const riskEntries = [];
    const issues = [];
    const countsTowardCategory = (id) => !ctx.quickReview || !id || QUICK_REVIEW_SCORING_IDS.includes(id);
    const deletedByClinician = (id) => !!id && !!ctx.deletedRiskKeys?.has(id);
    const add = (list, txt, id, type, noteValue = null) => {
      let finalTxt = txt;
      if (noteValue && noteValue.trim()) finalTxt = `${txt} (${noteValue.trim()})`;
      const scores = countsTowardCategory(id) && !deletedByClinician(id);
      if (scores) list.push(finalTxt);
      if (id) {
        if (scores) flagged[type].push(id);
        riskEntries.push({ text: finalTxt, id, type });
        issues.push({ text: finalTxt, source: "auto", severity: type, key: id });
      }
    };
    const checkKeys = [];
    const addCheck = (txt, key) => {
      checkKeys.push(key);
      issues.push({ text: txt, source: "bloods", severity: "info", key, list: "checks" });
    };
    const modsText = s.chk_use_mods && s.mods_details ? s.mods_details.toLowerCase() : "";
    const isModified = (param) => modsText !== "" && MOD_PATTERNS[param].test(modsText);
    const addVital = (list, txt, id, type, param) => {
      if (isModified(param)) addCheck(`${txt} - MODS in use (${s.mods_details.trim()}); confirm within modification`, `mod_${id}`);
      else add(list, txt, id, type);
    };
    const bloodsReviewed = !s.chk_bloods_nil_sig && s.bloods_status !== "nil_sig" && s.bloods_status !== "not_checked";
    const crTrend = computeTrend("cr_review", s.bl_cr_review, prevBloods.cr_review);
    const crpTrend = computeTrend("crp", s.bl_crp, prevBloods.crp);
    const wccTrend = computeTrend("wcc", s.bl_wcc, prevBloods.wcc);
    const bloodIssueKeys = [];
    if (bloodsReviewed) {
      GATE_LINKED_BLOODS.forEach((key) => {
        const range = normalRanges[key];
        if (!range) return;
        const bid = `bl_${key}`;
        const val = num(s[bid]);
        if (val === null) return;
        if (val < range.low || val > range.high) {
          const label = BLOOD_LABELS[key] || key.replace(/_review$/, "").toUpperCase();
          bloodIssueKeys.push(bid);
          issues.push({ text: `Abnormal ${label} ${val}`, source: "bloods", severity: "info", key: bid, list: "bloods" });
        }
      });
    }
    const neut = num(s.bl_neut) ?? num(s.neut);
    const lymph = num(s.bl_lymph) ?? num(s.lymph);
    const nlrVal = neut > 0 && lymph > 0 ? neut / lymph : 0;
    const isPre = s.reviewType === "pre";
    const timeData = calculateWardTime(s.stepdownDate, s.stepdownTime, isPre, now);
    const isRecent = isPre || timeData.hours < 24;
    const afterHoursDerived = ctx.afterHoursManual ? null : deriveAfterHours(s, timeData, isPre);
    const afterHours = afterHoursDerived === null ? s.after_hours === true : afterHoursDerived;
    const recentKeys = ["pressor_recent_norad", "pressor_recent_met", "pressor_recent_gtn", "pressor_recent_dob", "pressor_recent_mid", "pressor_recent_other"];
    const currentKeys = ["pressor_current_mid", "pressor_current_other"];
    const hasRecent = recentKeys.some((k2) => s[k2]);
    const hasCurrent = currentKeys.some((k2) => s[k2]);
    if (hasCurrent || hasRecent) {
      const details = [];
      const currentList = [];
      currentKeys.forEach((k2) => {
        if (!s[k2]) return;
        let label = k2.replace("pressor_current_", "").replace("mid", "Midodrine");
        if (k2 === "pressor_current_other") label = `Other (${s.pressor_current_other_note || ""})`;
        currentList.push(label);
      });
      if (currentList.length) details.push(`Current vasoactive support - ${joinGrammatically(currentList)}`);
      if (hasRecent) {
        const recentsList = [];
        recentKeys.forEach((k2) => {
          if (!s[k2]) return;
          let label = k2.replace("pressor_recent_", "").replace("norad", "Noradrenaline").replace("met", "Metaraminol").replace("gtn", "GTN").replace("dob", "Dobutamine").replace("mid", "Midodrine");
          if (k2 === "pressor_recent_other") label = `Other (${s.pressor_recent_other_note || ""})`;
          recentsList.push(label);
        });
        let recentPart = `Recent vasoactive support, ${joinGrammatically(recentsList)}`;
        if (s.pressor_ceased_time) recentPart += ` - ceased at approximately ${s.pressor_ceased_time}`;
        details.push(recentPart);
      }
      add(amber, details.join(". "), "seg_pressors", "amber", s.pressors_note);
    }
    const adds = num(s.adds);
    const scoreName = s.chk_use_mods ? "MODS" : "ADDS";
    if (adds !== null) {
      if (adds >= 4) add(red, `Elevated ${scoreName} ${adds}`, "adds", "red");
      else if (adds === 3 && isRecent) add(amber, `${scoreName} 3, not baseline, monitor trend`, "adds", "amber");
    }
    const hbNow = num(s.bl_hb);
    const hbPrev = num(prevBloods.hb);
    const hbFalling = hbNow !== null && hbPrev !== null && hbPrev > hbNow && hbPrev - hbNow >= 10 && (hbPrev - hbNow) / hbPrev >= 0.08;
    const hbContext = hbFalling ? ` with falling Hb ${hbPrev} to ${hbNow}` : "";
    const rhythm = (s.c_hr_rhythm || "").trim();
    const rhythmTxt = rhythm ? ` (${rhythm})` : "";
    const hr = num(s.c_hr);
    if (hr) {
      if (hr > 130) addVital(red, `Tachycardia HR ${hr}${rhythmTxt}${hbContext}`, "c_hr", "red", "hr");
      else if (hr > 110) addVital(amber, `Tachycardia HR ${hr}${rhythmTxt}${hbContext}`, "c_hr", "amber", "hr");
      else if (hr < 40) addVital(red, `Bradycardia HR ${hr}${rhythmTxt}`, "c_hr", "red", "hr");
      else if (hr < 50) addVital(amber, `Bradycardia HR ${hr}${rhythmTxt}`, "c_hr", "amber", "hr");
    }
    if (s.c_nibp) {
      const sbp = parseFloat(String(s.c_nibp).split("/")[0]);
      if (!isNaN(sbp) && sbp < 90) addVital(red, `Hypotension SBP ${sbp}${hbContext}`, "c_nibp", "red", "bp");
    }
    const rr = num(s.b_rr);
    if (rr) {
      if (rr > 25) addVital(red, `Tachypnea RR ${rr}`, "b_rr", "red", "rr");
      else if (rr > 20) addVital(amber, `Mild tachypnea RR ${rr}`, "b_rr", "amber", "rr");
      else if (rr < 8) addVital(red, `Bradypnea RR ${rr}`, "b_rr", "red", "rr");
    }
    const spo2 = num(s.b_spo2 ? String(s.b_spo2).replace("%", "") : "");
    const spo2Target = s.spo2_target === "88_92" ? "88_92" : "94";
    if (spo2) {
      if (spo2 < 88) addVital(red, `Hypoxia SpO2 ${spo2}%`, "b_spo2", "red", "spo2");
      else if (spo2Target === "94") {
        if (spo2 < 92) addVital(amber, `SpO2 ${spo2}% below target 94%`, "b_spo2", "amber", "spo2");
        else if (spo2 < 94) addCheck(`SpO2 ${spo2}% - below target 94%`, "chk_spo2");
      } else if (spo2 > 92) {
        addCheck(`SpO2 ${spo2}% - above target 88-92%, review oxygen`, "chk_spo2");
      }
    }
    const perf = (s.c_perf || "").toLowerCase();
    if (perf.includes("thready")) add(amber, "Thready pulses", "c_perf_thready", "amber");
    if (perf.includes("poorly perfused")) add(amber, "Cool, poorly perfused", "c_perf_poor", "amber");
    const crRaw = (s.c_cr || "").toLowerCase();
    const crMatch = crRaw.match(/(<\s*)?(\d+)\s*s(?:ec)?/);
    if (crRaw.includes("delayed") || crRaw.includes("prolonged") || crMatch && !crMatch[1] && Number(crMatch[2]) >= 4) {
      const secs = crMatch && !crMatch[1] ? ` ${crMatch[2]}s` : "";
      add(amber, `Delayed capillary refill${secs}`, "c_cr_delayed", "amber");
    }
    const airway = (s.airway_a || "").toLowerCase();
    if (airway.includes("stridor")) add(amber, "Stridor", "airway_stridor", "amber");
    if (airway.includes("noisy")) add(amber, "Noisy breathing", "airway_noisy", "amber");
    if (airway.includes("partial")) add(amber, "Partial airway obstruction", "airway_partial", "amber");
    if (/irregular/i.test(rhythm) && s.c_hr_rhythm_new === true) {
      add(amber, "New irregular rhythm", "c_hr_rhythm_new", "amber");
    }
    const temp = num(s.e_temp);
    if (temp) {
      if (temp >= 38.5) addVital(red, `Febrile ${temp}`, "e_temp", "red", "temp");
      else if (temp <= 35.5) addVital(red, `Temp low ${temp}`, "e_temp", "red", "temp");
    }
    const oxygen = { parts: [], red: false, id: null };
    if (s.oxMod === "NP") {
      const flow = num(s.npFlow);
      if (flow >= 4) {
        oxygen.parts.push(`Oxygen requirement - ${flow}LNP`);
        oxygen.red = true;
        oxygen.id = "npFlow";
      } else if (flow >= 3) {
        oxygen.parts.push(`Oxygen requirement - ${flow}LNP`);
        oxygen.id = "npFlow";
      }
    } else if (s.oxMod === "HFNP") {
      const fio2Val = num(s.hfnpFio2);
      oxygen.parts.push(fio2Val >= 60 ? `HFNP - high FiO2 ${s.hfnpFio2 || ""}%` : `HFNP - FiO2 ${s.hfnpFio2 || ""}%`);
      oxygen.red = true;
      oxygen.id = "oxMod";
    } else if (s.oxMod === "NIV") {
      const fio2Val = num(s.nivFio2);
      oxygen.parts.push(fio2Val >= 60 ? `NIV - high FiO2 ${s.nivFio2 || ""}%` : `NIV - FiO2 ${s.nivFio2 || ""}%`);
      oxygen.red = true;
      oxygen.id = "oxMod";
    }
    const useRespGate = s.resp_concern === true && !ctx.quickReview;
    if (useRespGate) {
      const parts = [...oxygen.parts];
      let hasRed = oxygen.red;
      if (oxygen.id) flagged[oxygen.red ? "red" : "amber"].push(oxygen.id);
      if (s.resp_dyspnea === true) {
        const dysp = s.dyspneaConcern;
        if (dysp === "severe" || dysp === "moderate") {
          parts.push(`Dyspnea ${dysp}`);
          flagged.red.push("dyspneaConcern");
          hasRed = true;
        } else if (dysp === "mild") {
          parts.push("Dyspnea mild");
          flagged.amber.push("dyspneaConcern");
        } else if (!dysp) {
          parts.push("Dyspnea");
          flagged.amber.push("seg_resp_dyspnea");
        }
      }
      if (/increas|labour|labor/i.test(s.b_wob || "")) {
        parts.push("increased work of breathing");
        flagged.amber.push("b_wob");
      }
      if (s.resp_tachypnea === true) {
        parts.push("tachypnea >20bpm");
        flagged.amber.push("seg_resp_tachypnea");
      }
      if (s.resp_rapid_wean === true) {
        parts.push("rapid O2 wean within last 12h");
        flagged.red.push("seg_resp_rapid_wean");
        hasRed = true;
      }
      if (s.resp_poor_cough === true) {
        parts.push("poor cough effort");
        flagged.amber.push("seg_resp_poor_cough");
      }
      if (s.resp_poor_swallow === true) {
        parts.push("poor swallow");
        flagged.amber.push("seg_resp_poor_swallow");
      }
      if (s.hist_o2 === true) {
        parts.push("recent high O2/NIV requirement <12hrs");
        flagged.red.push("seg_hist_o2");
        hasRed = true;
      }
      if (s.intubated === true) {
        if (s.intubatedReason === "concern") {
          parts.push("intubated <24hrs ago");
          flagged.red.push("seg_intubated");
          hasRed = true;
        } else {
          parts.push("intubated <24hrs ago (elective)");
          flagged.amber.push("seg_intubated");
        }
      }
      if (s.dyspneaConcern_note && parts.length > 0) {
        parts[parts.length - 1] += `. Note: ${s.dyspneaConcern_note}`;
      }
      if (parts.length > 0) {
        add(hasRed ? red : amber, `Respiratory concern - ${joinGrammatically(parts)}`, "seg_resp_concern", hasRed ? "red" : "amber");
      } else {
        const isLowFlowNP = s.oxMod === "NP" && (num(s.npFlow) || 0) < 3;
        if (!isLowFlowNP) add(amber, "Respiratory concern", "seg_resp_concern", "amber", s.dyspneaConcern_note);
      }
    }
    if (!useRespGate && oxygen.parts.length) {
      add(oxygen.red ? red : amber, joinGrammatically(oxygen.parts), oxygen.id, oxygen.red ? "red" : "amber");
    }
    if (s.oxMod === "Trache") {
      const isLary = s.tracheType === "Laryngectomy";
      const label = isLary ? "Laryngectomy patient" : "Tracheostomy patient";
      if (s.tracheStatus === "New") add(red, `New ${label.toLowerCase()}`, "tracheStatus", "red");
      else add(amber, label, "oxMod", "amber");
    }
    if (afterHours === true) add(amber, "Discharged after-hours", "seg_after_hours", "amber", s.after_hours_note);
    if (s.hac === true) add(amber, "Hospital acquired complication", "seg_hac", "amber", s.hac_note);
    if (s.neuro_gate === true) {
      let txt = "Neurological concern";
      const details = [];
      if (s.d_alert && s.d_alert.toLowerCase().includes("gcs")) details.push(s.d_alert);
      if (s.neuroType) details.push(s.neuroType.toLowerCase());
      if (details.length) txt += ` - ${joinGrammatically(details)}`;
      const isRed = s.neuroConcern === "severe";
      add(isRed ? red : amber, sentenceCase(txt), "neuroConcern", isRed ? "red" : "amber", s.neuroType_note);
    }
    const k = num(s.bl_k);
    const na = num(s.bl_na);
    const mg = num(s.bl_mg);
    const phos = num(s.bl_phos);
    const mgAbnormal = mg !== null && mg < normalRanges.mg.low;
    const phosAbnormal = phos !== null && phos < 0.32;
    const naAbnormal = na !== null && (na < 125 || na > 155);
    if (bloodsReviewed) {
      if (k !== null && k >= 3 && k < normalRanges.k.low) addCheck(`K+ ${k} - consider replacement`, "chk_k");
      if (mg !== null && mg >= normalRanges.mg.low && mg < 1) addCheck(`Mg ${mg} - consider replacement`, "chk_mg");
      if (phos !== null && phos >= 0.32 && phos < 0.5) addCheck(`PO4 ${phos} - replacement indicated`, "chk_phos");
      if (na !== null && na >= 125 && na < normalRanges.na.low) {
        addCheck(`Na ${na} - hyponatraemia; correction directed by the treating team`, "chk_na");
      } else if (na !== null && na > normalRanges.na.high && na <= 155) {
        addCheck(`Na ${na} - hypernatraemia; correction directed by the treating team`, "chk_na");
      }
    }
    if (s.electrolyte_gate === true || k && (k < 3 || k > 6) || naAbnormal || mgAbnormal || phosAbnormal) {
      let msg = "Electrolyte concern";
      let isRed = false;
      const parts = [];
      if (k) {
        if (k > 6) {
          parts.push(`high K+ ${k}`);
          isRed = true;
        } else if (k < 3) {
          parts.push(`low K+ ${k}`);
          isRed = true;
        }
      }
      if (naAbnormal) {
        parts.push(na < 125 ? `low Na ${na}` : `high Na ${na}`);
        isRed = true;
      }
      if (mgAbnormal) parts.push(`low Mg ${mg}`);
      if (phosAbnormal) parts.push(`low PO4 ${phos}`);
      const sev = s.electrolyteConcern;
      if (sev === "severe") {
        if (parts.length === 0) parts.push("severe derangement");
        isRed = true;
      } else if (sev === "mild" && parts.length === 0) {
        parts.push("mild/moderate derangement");
      }
      if (parts.length) msg += ` - ${parts.join(", ")}`;
      add(isRed ? red : amber, msg, "electrolyteConcern", isRed ? "red" : "amber", s.electrolyteConcern_note);
    }
    const cr = num(s.bl_cr_review);
    if (bloodsReviewed && cr !== null && cr > 150 && s.renal !== true) {
      addCheck(`Cr ${cr} - confirm against baseline`, "chk_cr");
    }
    const isMitigated = s.renal_chronic === true;
    if (s.renal === true) {
      const fluidFlags = [];
      const renalFlags = [];
      if (s.renal_fluid) fluidFlags.push("fluid overload");
      if (s.renal_oedema) fluidFlags.push("oedema");
      if (s.renal_dehydrated) fluidFlags.push("dehydrated");
      if (s.renal_oliguria) renalFlags.push("oliguria <0.5ml/kg/hr");
      if (s.renal_anuria) renalFlags.push("anuria");
      if (s.renal_dysfunction) renalFlags.push("AKI");
      if (cr > 150 && !isMitigated) renalFlags.push(`Cr ${cr}`);
      if (s.renal_dialysis) {
        if (s.dialysis_type === "new") renalFlags.push("acute dialysis");
        else if (!isMitigated) renalFlags.push("chronic dialysis");
      }
      const hasFluid = fluidFlags.length > 0;
      const hasRenal = renalFlags.length > 0;
      let label = "Renal concern";
      if (hasFluid && hasRenal) label = "Renal and fluid concern";
      else if (hasFluid && !hasRenal) label = "Fluid concern";
      const allFlags = [...renalFlags, ...fluidFlags];
      if (allFlags.length) label += ` - ${joinGrammatically(allFlags)}`;
      const overrideChips = [
        // When CKD is known, oliguria and anuria are expected and don't override.
        ...isMitigated ? [] : [s.renal_oliguria, s.renal_anuria],
        s.renal_dysfunction,
        s.renal_fluid,
        s.renal_oedema,
        s.renal_dehydrated
      ];
      if (s.renal_dialysis && s.dialysis_type === "new") overrideChips.push(true);
      const isForceAmber = overrideChips.some((x) => x === true);
      if (isMitigated && !isForceAmber) {
        suppressedRisks.push(`${label} (mitigated: known CKD and Cr/urine output around baseline)`);
      } else {
        const critical = isMitigated ? hasFluid && hasRenal && s.renal_dysfunction : s.renal_anuria || cr > 200 || hasFluid && hasRenal && s.renal_dysfunction;
        if (critical) add(red, label, "seg_renal", "red", s.renal_note);
        else add(amber, label, "seg_renal", "amber", s.renal_note);
      }
    }
    const wcc = num(s.bl_wcc) ?? num(s.wcc);
    const crp = num(s.bl_crp) ?? num(s.crp);
    const autoTrigger = bloodsReviewed && (wcc && (wcc > 15 || wcc < 2) || crp && crp > 100 || nlrVal > 10) || temp && temp >= 38;
    let downtrendSuggestion = null;
    if (autoTrigger || s.infection === true) {
      const markers = [];
      if (wcc !== null && (wcc < 2 || wcc > 15)) markers.push(`WCC ${wcc}`);
      else if (wcc !== null && wcc > 11) markers.push(`WCC ${wcc}`);
      if (crp > 100) markers.push(`CRP ${crp}`);
      else if (crp > 50) markers.push(`CRP ${crp}`);
      if (nlrVal > 10) markers.push(`NLR ${nlrVal.toFixed(1)}`);
      if (temp && temp >= 38 && temp < 38.5) markers.push(`Temp ${temp}`);
      let msg = "Infection risk";
      if (markers.length) msg += ` - ${joinGrammatically(markers)}`;
      const addsVerified = adds !== null && adds < 4;
      const claimsDowntrend = s.infection_downtrend === true;
      if (claimsDowntrend && addsVerified) {
        suppressedRisks.push(`Infection risk (mitigated: infection markers downtrending, ${scoreName} ${adds})`);
      } else {
        if (claimsDowntrend) {
          addCheck(adds === null ? "Infection marked downtrending but no score recorded - not discounted" : `Infection marked downtrending but ${scoreName} is ${adds} - not discounted`, "chk_downtrend_unverified");
        }
        add(amber, msg, "seg_infection", "amber", s.infection_note);
      }
      const falling = [];
      if (crpTrend && !crpTrend.rising) falling.push(`CRP ${crpTrend.previous} to ${crpTrend.current}`);
      if (wccTrend && wcc !== null && wcc > 11 && !wccTrend.rising) falling.push(`WCC ${wccTrend.previous} to ${wccTrend.current}`);
      if (falling.length && !claimsDowntrend && addsVerified) downtrendSuggestion = falling.join(", ");
    }
    const plts = num(s.bl_plts);
    if (bloodsReviewed && plts !== null && plts < 20) add(amber, `Low platelets Plts ${plts}`, "bl_plts", "amber");
    const checkAgainstTarget = (val, targetTxt, label, key, range) => {
      if (val === null) return;
      const t = parseTarget(targetTxt);
      if (t) {
        if (val < t.low) addCheck(`${label} ${val}, below target ${targetTxt.trim()}`, key);
        else if (val > t.high) addCheck(`${label} ${val}, above target ${targetTxt.trim()}`, key);
      } else if (val < range.low || val > range.high) {
        addCheck(`${label} ${val} - target not documented`, key);
      }
    };
    if (bloodsReviewed) {
      checkAgainstTarget(num(s.bl_inr), s.inr_target, "INR", "chk_inr", normalRanges.inr);
      checkAgainstTarget(num(s.bl_aptt), s.aptt_target, "APTT", "chk_aptt", normalRanges.aptt);
    }
    const bsl = num(s.e_bsl);
    if (bsl) {
      if (bsl < 4) add(red, `Low BSL ${bsl}`, "e_bsl", "red");
      else if (bsl > 20) add(red, `High BSL ${bsl}`, "e_bsl", "red");
    }
    if (bloodsReviewed && crTrend && crTrend.rising && !isMitigated && (crTrend.pctDelta > 30 || crTrend.absDelta > 30)) {
      add(amber, `Worsening Cr ${crTrend.previous} to ${crTrend.current}`, "bl_cr_review", "amber");
    }
    if (bloodsReviewed && crpTrend && crpTrend.rising && (crpTrend.pctDelta > 50 || crpTrend.absDelta > 50)) {
      add(amber, `Rising CRP ${crpTrend.previous} to ${crpTrend.current}`, "bl_crp", "amber");
    }
    if (s.neuro_psych) add(amber, "Psychological concern", "neuro_section", "amber", s.neuro_psych_note);
    if (s.pics === "positive") add(amber, "Post ICU Syndrome Positive", "seg_pics", "amber", s.pics_note);
    const activeComorbsKeys = toggleInputs.filter((key) => key.startsWith("comorb_") && s[key]);
    const countComorbs = activeComorbsKeys.length;
    if (countComorbs >= 3) {
      add(red, sentenceCase("Multiple comorbidities"), null, "red", null);
      flagged.red.push("comorbs_wrapper");
    } else if (countComorbs > 0) {
      const cList = [];
      activeComorbsKeys.forEach((key) => {
        if (key === "comorb_other" && s.comorb_other_note) {
          s.comorb_other_note.split(/[\n,]+/).forEach((v) => {
            const trimmed = v.trim();
            if (trimmed) cList.push(trimmed);
          });
        } else if (key !== "comorb_other") {
          cList.push(comorbMap[key]);
        }
      });
      add(amber, sentenceCase(`Comorbidities - ${joinGrammatically(cList)}`), null, "amber", null);
      flagged.amber.push("comorbs_wrapper");
    }
    const lact = num(s.bl_lac_review);
    if (lact > 4) add(red, `Lactate ${lact}`, "bl_lac_review", "red");
    else if (lact >= 2) add(amber, `Lactate ${lact}`, "bl_lac_review", "amber");
    const overrideNote = (s.overrideNote || "").trim();
    if (s.override === "red" && overrideNote) add(red, overrideNote, "override_red", "red");
    else if (s.override === "red") flagged.red.push("override_red");
    if (s.override === "amber" && overrideNote) add(amber, overrideNote, "override_amber", "amber");
    else if (s.override === "amber") flagged.amber.push("override_amber");
    const age = num(s.ptAge);
    if (age >= 75) {
      if (s.age_mitigated === true) {
        suppressedRisks.push(`Age ${age}, frailty risk (mitigated: ${s.age_mitigate_reason || "baseline function active"})`);
      } else {
        add(amber, `Age ${age}, increased risk of complications`, "ptAge", "amber");
      }
    }
    if (s.frailty_known === true) add(amber, "Known frailty at baseline", "seg_frailty_known", "amber", s.frailty_note);
    const icuLos = num(s.icuLos) || 0;
    const isProlongedStay = icuLos > 4;
    const isImmobile = s.immobility === true;
    if (isProlongedStay || isImmobile) {
      const AGE_FLAG = /^Age \d/;
      const hasOtherRisk = [.../* @__PURE__ */ new Set([...red, ...amber])].filter((t) => !AGE_FLAG.test(t)).length > 0;
      const parts = [];
      if (isProlongedStay) parts.push(`${icuLos}-day ICU stay`);
      if (isImmobile) parts.push("immobile");
      const label = `Deconditioning risk - ${joinGrammatically(parts)}`;
      const flagId = isImmobile ? "seg_immobility" : "icuLos";
      const losMitigated = s.los_mitigated === true && !isImmobile;
      const losReason = (s.los_mitigate_reason || "").trim();
      if (isProlongedStay && hasOtherRisk && !losMitigated) {
        add(red, label, flagId, "red", s.immobility_note);
      } else if (isImmobile || isProlongedStay && age >= 75 && !losMitigated) {
        add(amber, label, flagId, "amber", s.immobility_note);
      } else if (losMitigated) {
        suppressedRisks.push(`${label} (mitigated: recovering appropriately, trajectory to recovery established${losReason ? ` - ${losReason}` : ""})`);
      } else {
        suppressedRisks.push(`${label} (mitigated: no other risk factors identified)`);
      }
    }
    (ctx.listRisks || []).forEach((entry) => {
      const alreadyRaised = entry.gateId && (flagged.red.includes(entry.gateId) || flagged.amber.includes(entry.gateId));
      if (alreadyRaised) return;
      const isRed = entry.severity === "red";
      (isRed ? red : amber).push(entry.text);
      if (entry.gateId) flagged[isRed ? "red" : "amber"].push(entry.gateId);
    });
    const uniqueRed = [...new Set(red)];
    const uniqueAmber = [...new Set(amber)];
    const redCount = uniqueRed.length;
    const amberCount = uniqueAmber.length;
    let autoCat = { id: "green", text: "CAT 3" };
    if (redCount > 0) autoCat = { id: "red", text: "CAT 1" };
    else if (amberCount > 0) autoCat = { id: "amber", text: "CAT 2" };
    const OVERRIDE_CATS = {
      red: { id: "red", text: "CAT 1" },
      amber: { id: "amber", text: "CAT 2" },
      green: { id: "green", text: "CAT 3" }
    };
    let cat = autoCat;
    const downgradeReason = (s.overrideNote || "").trim();
    const chosenCat = OVERRIDE_CATS[s.override];
    if (chosenCat) {
      cat = chosenCat.id === autoCat.id ? autoCat : { ...chosenCat, downgradedFrom: autoCat.text, downgradeReason };
    }
    return {
      red: uniqueRed,
      amber: uniqueAmber,
      suppressed: suppressedRisks,
      redCount,
      amberCount,
      cat,
      autoCat,
      downgradeReason,
      flagged,
      riskEntries,
      issues,
      issueKeys: [...riskEntries.map((e) => e.id), ...bloodIssueKeys, ...checkKeys],
      timeData,
      isPre,
      isRecent,
      afterHoursDerived,
      nlrVal,
      activeComorbsKeys,
      countComorbs,
      downtrendSuggestion,
      bloodsReviewed
    };
  }

  // src/js/logic.js
  function computeAll() {
    try {
      const s = getState();
      autofillDerivedFields(s);
      const ahGroup = document.querySelector("#seg_after_hours");
      const result = evaluateRisks(s, {
        prevBloods: window.prevBloods || {},
        afterHoursManual: ahGroup ? ahGroup.dataset.manual === "true" : false,
        quickReview: isQuickReviewMode,
        listRisks: getScoringListRisks(),
        deletedRiskKeys: getDeletedRiskKeys()
      });
      if (result.afterHoursDerived !== null) {
        s.after_hours = result.afterHoursDerived;
        const yes = document.querySelector('#seg_after_hours .seg-btn[data-value="true"]');
        const no = document.querySelector('#seg_after_hours .seg-btn[data-value="false"]');
        if (result.afterHoursDerived) {
          yes?.classList.add("active");
          no?.classList.remove("active");
        } else {
          no?.classList.add("active");
          yes?.classList.remove("active");
        }
      }
      result.issues.forEach((issue) => {
        const { isNew } = addActiveIssue(issue);
        if (isNew && issue.source === "auto") maybeToastNewRisk(issue.key, issue.text);
      });
      if (s.bloods_status !== "nil_sig" && s.bloods_status !== "not_checked" && !s.chk_bloods_nil_sig) {
        applyTrendArrows(s, window.prevBloods);
      }
      updatePrevBloodsHint();
      renderDerivedDisplays(s, result);
      const {
        red: uniqueRed,
        amber: uniqueAmber,
        suppressed: suppressedRisks,
        redCount,
        amberCount,
        cat,
        autoCat,
        downgradeReason,
        flagged,
        riskEntries,
        timeData,
        countComorbs,
        activeComorbsKeys
      } = result;
      refreshCategorySelect(autoCat, s.override, downgradeReason, redCount, amberCount);
      const catText = $("catText");
      if (catText) {
        catText.className = `status ${cat.id}`;
        catText.textContent = cat.text;
      }
      const catBox = $("categoryBox");
      if (catBox) catBox.style.borderColor = `var(--${cat.id})`;
      const rc = $("redCount");
      if (rc) {
        rc.textContent = redCount;
        rc.style.color = redCount ? "var(--red)" : "";
      }
      const ac = $("amberCount");
      if (ac) {
        ac.textContent = amberCount;
        ac.style.color = amberCount ? "var(--amber)" : "";
      }
      const stickyScore = $("footerScore");
      if (stickyScore) {
        stickyScore.className = `footer-score tag ${cat.id}`;
        stickyScore.textContent = cat.text;
      }
      updateSidebarRiskBadges(redCount, amberCount);
      reconcileAutoIssues(new Set(result.issueKeys));
      renderScrapedIssuesList();
      maybeOfferQuickReview(timeData, s);
      if (isQuickReviewMode) {
        if (!quickReviewBaselineCaptured) {
          initialQuickReviewRisks.red = [...uniqueRed];
          initialQuickReviewRisks.amber = [...uniqueAmber];
          setQuickReviewBaselineCaptured(true);
        } else {
          const silentTexts = new Set(
            riskEntries.filter((e) => e.id === "adds" || e.id.startsWith("bl_") || e.id.startsWith("override_")).map((e) => e.text)
          );
          const newRed = uniqueRed.filter((r) => !initialQuickReviewRisks.red.includes(r) && !silentTexts.has(r));
          const newAmber = uniqueAmber.filter((r) => !initialQuickReviewRisks.amber.includes(r) && !silentTexts.has(r));
          if (newRed.length > 0 || newAmber.length > 0) {
            showNewRiskAlert(newRed, newAmber);
            initialQuickReviewRisks.red.push(...newRed);
            initialQuickReviewRisks.amber.push(...newAmber);
          }
        }
      }
      const redListEl = $("redFlagList");
      if (redListEl) redListEl.innerHTML = uniqueRed.map((t) => `<li>${t}</li>`).join("");
      const amberListEl = $("amberFlagList");
      if (amberListEl) amberListEl.innerHTML = uniqueAmber.map((t) => `<li>${t}</li>`).join("");
      const listEl = $("flagList");
      if (listEl) {
        listEl.innerHTML = suppressedRisks.length ? `<div class="suppressed-title">Not counted toward category</div>` + suppressedRisks.map((t) => `<div>${t}</div>`).join("") : "";
      }
      document.querySelectorAll(".flag-red, .flag-amber").forEach((e) => e.classList.remove("flag-red", "flag-amber"));
      flagged.red.forEach((id) => {
        const el = $(id);
        if (el) {
          if (id.endsWith("_wrapper")) {
            el.classList.add("flag-red");
          } else {
            el.closest(".toggle-label, .input-box, .question-row")?.classList.add("flag-red");
          }
        }
      });
      flagged.amber.forEach((id) => {
        const el = $(id);
        if (el) {
          if (id.endsWith("_wrapper")) {
            el.classList.add("flag-amber");
          } else {
            el.closest(".toggle-label, .input-box, .question-row")?.classList.add("flag-amber");
          }
        }
      });
      let planHtml = "";
      const hoursSinceStep = timeData.hours;
      const disPrompt = $("discharge_prompt");
      const disMsg = $("discharge_msg");
      const chkDischarge = $("chk_discharge_alert");
      const disWrap = $("chk_discharge_wrapper");
      if (disPrompt) {
        const alreadyChecked = chkDischarge && chkDischarge.checked;
        const dismissed = window.dismissedDischarge === true;
        const isPost = s.reviewType === "post";
        let showPrompt = false;
        if (isPost && !alreadyChecked && !dismissed) {
          if (cat.id === "green" && hoursSinceStep >= 24) showPrompt = true;
          else if (cat.id === "amber" && hoursSinceStep >= 48) showPrompt = true;
          else if (cat.id === "red" && hoursSinceStep >= 72) showPrompt = true;
        }
        if (showPrompt) {
          disPrompt.style.display = "block";
          disPrompt.style.borderColor = `var(--${cat.id})`;
          if (cat.id === "green") disPrompt.style.borderColor = `var(--green)`;
          let hoursTxt = Math.round(hoursSinceStep) + " hours";
          disMsg.innerHTML = `
                    <div class="discharge-prompt-title status ${cat.id}">${cat.text} - ${hoursTxt} on list</div>
                    <div class="discharge-prompt-question">Can the patient be discharged?</div>
                `;
        } else {
          disPrompt.style.display = "none";
          const continueChk = $("chk_continue_alert");
          if (continueChk && !s.chk_discharge_alert && !s.chk_discharge_pending_bloods && s.reviewType === "post") {
            continueChk.checked = true;
          }
        }
      }
      const hoursMap = { "red": "72h", "amber": "48h", "green": "24h" };
      const h = hoursMap[cat.id] || "24h";
      const cssClass = cat.id === "green" ? "green" : cat.id === "amber" ? "amber" : "red";
      if (s.stepdown_suitable === false) {
        planHtml = `<div class="status red">Not suitable for stepdown.</div>`;
      } else if (s.chk_discharge_alert) {
        planHtml = `<div class="status" style="color:var(--blue-hint)">Discharge from ALERT nursing list.</div>`;
      } else if (s.chk_discharge_pending_bloods) {
        planHtml = `<div class="status" style="color:#ea580c; font-weight: 700;">Discharge pending next bloods</div>`;
      } else {
        planHtml = `<div class="status ${cssClass}">At least daily ALERT nursing reviews for up to ${h} post-ICU stepdown.</div>`;
      }
      if (s.chk_medical_rounding) {
        const referralOnly = String(s.clinicianRole || "").startsWith("ICU");
        planHtml += `<div style="margin-top:2px; font-weight:600; color:var(--accent);">${referralOnly ? "+ Referred for ALERT Medical Rounding - ALERT CN to be contacted" : "+ Added to ALERT Medical Rounding List"}</div>`;
      }
      const fu = $("followUpInstructions");
      if (fu) fu.innerHTML = planHtml;
      checkCompleteness(s, countComorbs);
      window._lastRiskEntries = riskEntries;
      window._lastRed = uniqueRed;
      window._lastAmber = uniqueAmber;
      window._lastSuppressed = suppressedRisks;
      window._lastState = s;
      window._lastCat = cat;
      window._lastWardTime = timeData.text;
      window._lastActiveComorbsKeys = activeComorbsKeys;
    } catch (err) {
      console.error("Compute Error:", err);
    }
  }
  function autofillDerivedFields(s) {
    const oxDevInput = $("b_device");
    if (oxDevInput && oxDevInput.dataset.manual !== "true") {
      const mode = s.oxMod;
      let devStr = "";
      if (mode === "RA") devStr = "RA";
      else if (mode === "NP") devStr = `NP ${s.npFlow || ""}L`;
      else if (mode === "HFNP") devStr = `HFNP ${s.hfnpFio2 || ""}%/${s.hfnpFlow || ""}L`;
      else if (mode === "NIV") devStr = `NIV ${s.nivFio2 || ""}%`;
      oxDevInput.value = devStr;
    }
    const airwayInput = $("airway_a");
    if (airwayInput && airwayInput.dataset.manual !== "true") {
      if (s.oxMod === "Trache") {
        airwayInput.value = `${s.tracheType || "Tracheostomy"}${s.tracheStatus === "New" ? " (New)" : ""}`;
      } else if (airwayInput.value.startsWith("Tracheostomy") || airwayInput.value.startsWith("Laryngectomy")) {
        airwayInput.value = "";
      }
    }
  }
  function renderQuickReviewDecision(s, result) {
    const discharge = $("qr_discharge_prompt");
    if (!discharge) return;
    const chosen = s.override && s.override !== "none" ? s.override : null;
    if (!isQuickReviewMode || !chosen) {
      discharge.hidden = true;
      discharge.innerHTML = "";
      return;
    }
    const onList = result.timeData?.text || "";
    const already = s.chk_discharge_alert || s.chk_discharge_pending_bloods;
    let question = null;
    if (s.reviewType === "pre") {
      const preHours = { red: "72h", amber: "48h", green: "24h" }[chosen];
      const preCat = { red: "CAT 1", amber: "CAT 2", green: "CAT 3" }[chosen];
      if (preHours) question = `${preCat} - up to ${preHours} on the ALERT list after stepdown.`;
      if (question) {
        discharge.hidden = false;
        discharge.className = "qr-discharge-prompt";
        discharge.innerHTML = `<span class="qr-discharge-text">${question}</span>`;
        return;
      }
      discharge.hidden = true;
      discharge.innerHTML = "";
      return;
    }
    if (already) {
      question = "Discharge from the ALERT list is recorded in the plan below.";
    } else if (chosen === "green") {
      question = `${onList} on the list - CAT 3 - can this patient be discharged from ALERT?`;
    } else if (chosen === "red") {
      question = `${onList} on the list - CAT 1 - cannot be discharged today.`;
    }
    if (!question) {
      discharge.hidden = true;
      discharge.innerHTML = "";
      return;
    }
    discharge.hidden = false;
    discharge.className = `qr-discharge-prompt${already ? " answered" : ""}`;
    discharge.innerHTML = `<span class="qr-discharge-text">${question}</span>` + (already || chosen === "red" ? "" : '<span class="qr-discharge-hint">Set it in the plan below</span>');
  }
  function renderDerivedDisplays(s, result) {
    updateRhythmNewVisibility();
    renderQuickReviewDecision(s, result);
    renderQuickChips(s);
    updateAgeMitigationUI();
    updateLosMitigationUI();
    const pmhSubtitle = $("pmh_subtitle");
    if (pmhSubtitle) {
      const hasComorbidities = result.countComorbs > 0;
      const hasPmhNote = s.pmh_note && s.pmh_note.trim().length > 0;
      pmhSubtitle.style.display = hasComorbidities || hasPmhNote ? "block" : "none";
    }
    const nlrEl = $("nlrCalc");
    if (nlrEl) {
      if (result.nlrVal > 0) {
        nlrEl.textContent = `NLR: ${result.nlrVal.toFixed(2)}`;
        nlrEl.style.borderColor = result.nlrVal > 10 ? "var(--red)" : "var(--line)";
      } else {
        nlrEl.textContent = "NLR: --";
        nlrEl.style.borderColor = "var(--line)";
      }
    }
    const fn = $("footerName");
    if (fn) fn.textContent = s.ptName || "--";
    const fl = $("footerLocation");
    if (fl) fl.textContent = `${wardLabel(s) || "--"} ${s.ptBed || ""}`;
    const fa = $("footerAdmission");
    if (fa) fa.textContent = s.ptAdmissionReason || "--";
    const timeOffEl = $("pressor_time_off_display");
    if (timeOffEl) {
      const recentKeys = ["pressor_recent_norad", "pressor_recent_met", "pressor_recent_gtn", "pressor_recent_dob", "pressor_recent_mid", "pressor_recent_other"];
      if (recentKeys.some((k) => s[k]) && s.pressor_ceased_time) {
        const now = /* @__PURE__ */ new Date();
        const [cH, cM] = s.pressor_ceased_time.split(":");
        const ceasedDate = /* @__PURE__ */ new Date();
        ceasedDate.setHours(cH, cM);
        if (ceasedDate > now) ceasedDate.setDate(ceasedDate.getDate() - 1);
        timeOffEl.textContent = `~${Math.floor((now - ceasedDate) / 36e5)} hrs ago`;
      } else {
        timeOffEl.textContent = "";
      }
    }
    const suggestion = $("infection_downtrend_suggestion");
    if (suggestion) {
      if (result.downtrendSuggestion) {
        suggestion.innerHTML = `<span>${result.downtrendSuggestion} - mark markers as downtrending?</span>
                <button type="button" id="btnAcceptDowntrend" class="btn small">Yes, downtrending</button>`;
        suggestion.hidden = false;
      } else {
        suggestion.hidden = true;
        suggestion.innerHTML = "";
      }
    }
  }
  function updatePrevBloodsHint() {
    const hint = $("prev_bloods_hint");
    if (!hint) return;
    const hasPrev = window.prevBloods && Object.keys(window.prevBloods).length > 0;
    const hasCurrent = Object.keys(normalRanges).some((k) => num($(`bl_${k}`)?.value) !== null);
    hint.hidden = hasPrev || !hasCurrent;
  }
  function checkCompleteness(s, comorbCount) {
    const missing = [];
    if (!s.ptName) missing.push("Patient initials");
    if (!s.ptMrn) missing.push("URN");
    if (!s.ptWard) missing.push("Ward");
    if (!s.reviewerInitials) missing.push("Reviewer");
    $("reviewerInitials")?.closest(".rs-field-reviewer")?.classList.toggle("reviewer-missing", !s.reviewerInitials);
    const unreviewed = getUnreviewedScrapedCount();
    if (unreviewed) {
      setNotice("scraped-review", {
        priority: NOTICE_PRIORITY.SCRAPED_REVIEW,
        tone: "info",
        html: `<div class="notice-title">${unreviewed} ${unreviewed === 1 ? "line" : "lines"} carried from the last note - edit or delete as appropriate for today's review</div>`
      });
    } else {
      clearNotice("scraped-review");
    }
    if (missing.length) {
      setNotice("completeness", {
        priority: NOTICE_PRIORITY.COMPLETENESS,
        tone: "info",
        html: `<div class="notice-title">Not yet recorded: ${missing.join(", ")}</div>`
      });
    } else {
      clearNotice("completeness");
    }
  }

  // src/js/ui.js
  function applyAppIcons() {
    if (iconSetForPath() !== "test") return;
    $("linkFavicon")?.setAttribute("href", "assets/icons/test.svg");
    $("linkAppleIcon")?.setAttribute("href", "assets/icons/test-180.png");
    $("linkManifest")?.setAttribute("href", "manifest-test.json");
    $("metaThemeColor")?.setAttribute("content", "#f59e0b");
    $("metaAppTitle")?.setAttribute("content", "A! Test");
    document.title = "ALERT Tool - PILOT";
  }
  function checkBloodRanges() {
    for (const [key, range] of Object.entries(normalRanges)) {
      const id = `bl_${key}`;
      const input = $(id);
      if (input) {
        const val = parseFloat(input.value);
        const parent = input.closest(".blood-item, .input-box");
        if (!isNaN(val) && (val < range.low || val > range.high)) {
          parent?.classList.add("blood-abnormal");
        } else {
          parent?.classList.remove("blood-abnormal");
        }
      }
    }
  }
  function handleSegmentClick(id, value) {
    const map = {
      "resp_concern": "resp_gate_content",
      "renal": "renal_gate_content",
      "infection": "infection_gate_content",
      "neuro_gate": "neuro_gate_content",
      "nutrition_adequate": "nutrition_context_wrapper",
      "electrolyte_gate": "electrolyte_gate_content",
      "pressors": "pressor_gate_content",
      "immobility": "immobility_note_wrapper",
      "after_hours": "after_hours_note_wrapper",
      "hac": "hac_content",
      "stepdown_suitable": "unsuitable_note_wrapper",
      "comorbs_gate": "comorbs_gate_content",
      "sleep_quality": "sleep_quality_wrapper",
      "pain_control": "pain_context_wrapper",
      "neuro_psych": "neuro_psych_wrapper",
      "pics": "pics_wrapper",
      "resp_dyspnea": "sub_dyspnea_severity",
      "intubated": "sub_intubated_reason",
      "age_mitigated": "age_mitigate_reason_wrapper",
      "frailty_known": "frailty_note_wrapper"
    };
    if (map[id]) {
      const el = $(map[id]);
      if (el) {
        let isShown = false;
        if (id === "stepdown_suitable" || id === "nutrition_adequate") {
          isShown = value === "false";
        } else if (id === "pics") {
          isShown = value === "positive" || value === "negative";
        } else {
          isShown = value === "true";
        }
        el.style.display = isShown ? "block" : "none";
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
    if (id === "medical_rounding_prestepdown") {
      const on = value === "true";
      const main = $("chk_medical_rounding");
      if (main) main.checked = on;
      const pre = $("chk_medical_rounding_pre");
      if (pre) pre.checked = on;
      updateIcuRoundingPrompt();
    }
    if (id === "resp_dyspnea" && value !== "true") {
      const dyspInput = $("dyspneaConcern");
      if (dyspInput) dyspInput.value = "";
      document.querySelectorAll('.quick-select[data-target="dyspneaConcern"]').forEach((b) => b.classList.remove("active"));
    }
  }
  function updateIcuRoundingPrompt() {
    const el = $("icu_rounding_call_prompt");
    if (!el) return;
    const team = document.querySelector('input[name="reviewTeam"]:checked')?.value || "ALERT";
    const type = document.querySelector('input[name="reviewType"]:checked')?.value || "post";
    const on = !!$("chk_medical_rounding")?.checked;
    el.style.display = team === "ICU" && type === "pre" && on ? "block" : "none";
  }
  function updateRhythmNewVisibility() {
    const wrapper = $("hr_rhythm_new_wrapper");
    if (!wrapper) return;
    const irregular = /irregular/i.test($("c_hr_rhythm")?.value || "");
    wrapper.style.display = irregular ? "block" : "none";
    if (!irregular) {
      $("seg_c_hr_rhythm_new")?.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
    }
  }
  function updateWardOptions() {
    const type = document.querySelector('input[name="reviewType"]:checked')?.value || "post";
    const sel = $("ptWard");
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="" selected disabled>Select Ward...</option>';
    const opts = type === "pre" ? ["ICU Pod 1", "ICU Pod 2", "ICU Pod 3", "ICU Pod 4"] : ["3A", "3B", "3C", "3D", "4A", "4B", "4C", "4D", "5A", "5B", "5C", "5D", "6A", "6B", "6C", "6D", "7A", "7B", "7C", "7D", "SRS2A", "SRS1A", "SRSA", "SRSB", "Medihotel 5", "Medihotel 6", "Medihotel 7", "Medihotel 8", "Short Stay", "Transit Lounge", "Mental Health", "CCU"];
    [...opts, "Other"].forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o;
      if (currentVal === o) opt.selected = true;
      sel.appendChild(opt);
    });
    updateWardOtherVisibility();
  }
  function updateReviewTypeVisibility() {
    const type = document.querySelector('input[name="reviewType"]:checked')?.value || "post";
    const dis = $("chk_discharge_wrapper");
    if (dis) dis.style.display = type === "post" ? "block" : "none";
    const uns = $("chk_unsuitable_wrapper");
    if (uns) uns.style.display = type === "pre" ? "block" : "none";
    const icu = $("icu_summary_wrapper");
    if (icu) icu.style.display = type === "pre" ? "block" : "none";
    const dateWrapper = $("stepdown_date_wrapper");
    if (dateWrapper) dateWrapper.style.display = type === "post" ? "contents" : "none";
    const medRoundingWrapper = $("chk_medical_rounding_wrapper");
    const medRoundingPre = $("chk_medical_rounding_prestepdown");
    const continueAlertWrapper = $("chk_continue_alert_wrapper");
    if (medRoundingWrapper) medRoundingWrapper.style.display = type === "post" ? "block" : "none";
    if (medRoundingPre) medRoundingPre.style.display = type === "pre" ? "block" : "none";
    if (continueAlertWrapper) continueAlertWrapper.style.display = type === "post" ? "flex" : "none";
    const alertActionsSection = $("alert_actions_section");
    if (alertActionsSection) alertActionsSection.style.display = type === "post" ? "block" : "none";
    if (type === "pre") {
      const c = $("chk_discharge_alert");
      if (c) c.checked = false;
    }
    updateReviewerRoleVisibility();
  }
  function updateReviewerRoleVisibility() {
    const type = document.querySelector('input[name="reviewType"]:checked')?.value || "post";
    const isPre = type === "pre";
    const teamWrapper = $("reviewTeamWrapper");
    if (teamWrapper) teamWrapper.style.display = isPre ? "" : "none";
    if (!isPre) {
      const alertTeam = document.querySelector('input[name="reviewTeam"][value="ALERT"]');
      if (alertTeam) alertTeam.checked = true;
    }
    const team = document.querySelector('input[name="reviewTeam"]:checked')?.value || "ALERT";
    const grades = document.querySelectorAll("#clinicianGradeToggle label[data-team]");
    let lastVisible = null;
    grades.forEach((label) => {
      const available = label.dataset.team.split(" ").includes(team);
      label.hidden = !available;
      label.classList.remove("rsg-edge");
      if (available) lastVisible = label;
      const radio = label.querySelector('input[type="radio"]');
      if (!available && radio?.checked) radio.checked = false;
    });
    if (lastVisible) lastVisible.classList.add("rsg-edge");
    if (!document.querySelector('input[name="clinicianGrade"]:checked')) {
      const cns = document.querySelector('input[name="clinicianGrade"][value="CNS"]');
      if (cns) cns.checked = true;
    }
    const redcap = $("btnRedcap");
    if (redcap) redcap.style.display = team === "ICU" ? "none" : "";
    updateIcuRoundingPrompt();
  }
  function updateWardOtherVisibility() {
    const w = $("ptWardOtherWrapper");
    const v = $("ptWard")?.value;
    if (w) w.style.display = v === "Other" ? "block" : "none";
  }
  function updateDevicesSectionVisibility() {
  }
  function createDeviceEntry(type, val = "", insertionDate = "") {
    const c = $("devices-container");
    if (!c) return;
    const div = document.createElement("div");
    div.className = "device-entry";
    div.dataset.type = type;
    const trackedDevices = ["CVC", "PICC", "PIVC", "Other CVAD", "IDC", "Vascath"];
    const hasDateField = trackedDevices.includes(type);
    let dwellDays = 0;
    let borderColor = "var(--line)";
    let infoText = "";
    let infoColor = "";
    if (hasDateField && insertionDate) {
      const now = /* @__PURE__ */ new Date();
      const deviceDate = /* @__PURE__ */ new Date(insertionDate + "T00:00:00");
      dwellDays = Math.floor((now - deviceDate) / (1e3 * 60 * 60 * 24));
      infoText = `${dwellDays}d dwell`;
      infoColor = "var(--text)";
      if (type === "PIVC") {
        if (dwellDays >= 7) {
          infoColor = "var(--red)";
          borderColor = "var(--red)";
        } else if (dwellDays >= 5) {
          infoColor = "var(--amber)";
          borderColor = "var(--amber)";
        } else if (dwellDays >= 3) {
          infoColor = "#9333ea";
          borderColor = "#9333ea";
        }
      } else {
        if (dwellDays >= 14) {
          infoColor = "var(--red)";
          borderColor = "var(--red)";
        } else if (dwellDays >= 10) {
          infoColor = "var(--amber)";
          borderColor = "var(--amber)";
        } else if (dwellDays >= 7) {
          infoColor = "#9333ea";
          borderColor = "#9333ea";
        }
      }
    }
    let html = `<div class="device-row" style="border-color:${borderColor};">`;
    html += `<div class="device-type">${type}</div>`;
    if (hasDateField) {
      html += `<input class="device-date" type="date" value="${insertionDate}" placeholder="Date"/>`;
    }
    html += `<input class="device-textarea" type="text" placeholder="details..." value="${val}"/>`;
    if (infoText && infoColor) {
      html += `<div class="device-info-text" style="color:${infoColor};">${infoText}</div>`;
    }
    html += `<div class="remove-entry" title="Remove">\u2715</div>`;
    html += `</div>`;
    div.innerHTML = html;
    disableAutofill(div);
    if (type === "Tracheostomy") {
      const tracheBtn = document.querySelector('#oxMod .select-btn[data-value="Trache"]');
      if (tracheBtn && !tracheBtn.classList.contains("active")) {
        tracheBtn.click();
      }
      const tracheTypeBtn = document.querySelector('#tracheType .select-btn[data-value="Tracheostomy"]');
      if (tracheTypeBtn && !tracheTypeBtn.classList.contains("active")) {
        tracheTypeBtn.click();
      }
    }
    div.querySelector(".remove-entry").addEventListener("click", () => {
      const textarea2 = div.querySelector(".device-textarea");
      div.remove();
      if (type === "Tracheostomy") {
        const raBtn = document.querySelector('#oxMod .select-btn[data-value="RA"]');
        if (raBtn) {
          raBtn.click();
        }
        const airwayInput = $("airway_a");
        if (airwayInput && airwayInput.dataset.manual !== "true") {
          if (airwayInput.value.startsWith("Tracheostomy")) {
            airwayInput.value = "";
          }
        }
      } else if (type === "Other Device" && textarea2 && textarea2.value.toLowerCase().includes("lary")) {
        const raBtn = document.querySelector('#oxMod .select-btn[data-value="RA"]');
        if (raBtn) {
          raBtn.click();
        }
        const airwayInput = $("airway_a");
        if (airwayInput && airwayInput.dataset.manual !== "true") {
          if (airwayInput.value.startsWith("Laryngectomy")) {
            airwayInput.value = "";
          }
        }
      }
      window.devicesModifiedSinceLastSummary = true;
      updateDevicesSectionVisibility();
      saveState(true);
      computeAll();
    });
    const textarea = div.querySelector(".device-textarea");
    if (textarea) {
      textarea.addEventListener("input", () => {
        if (type === "Other Device") {
          const val2 = textarea.value.toLowerCase().trim();
          if (val2.includes("lary")) {
            const tracheBtn = document.querySelector('#oxMod .select-btn[data-value="Trache"]');
            if (tracheBtn && !tracheBtn.classList.contains("active")) {
              tracheBtn.click();
            }
            const laryBtn = document.querySelector('#tracheType .select-btn[data-value="Laryngectomy"]');
            if (laryBtn && !laryBtn.classList.contains("active")) {
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
      div.querySelector(".device-date").addEventListener("change", () => {
        const newDate = div.querySelector(".device-date").value;
        if (newDate) {
          const deviceDate = /* @__PURE__ */ new Date(newDate + "T00:00:00");
          const dwellDays2 = Math.floor((/* @__PURE__ */ new Date() - deviceDate) / (1e3 * 60 * 60 * 24));
          let newBorderColor = "var(--line)";
          const infoText2 = `${dwellDays2}d dwell`;
          let infoColor2 = "var(--text)";
          if (type === "PIVC") {
            if (dwellDays2 >= 7) {
              newBorderColor = "var(--red)";
              infoColor2 = "var(--red)";
            } else if (dwellDays2 >= 5) {
              newBorderColor = "var(--amber)";
              infoColor2 = "var(--amber)";
            } else if (dwellDays2 >= 3) {
              newBorderColor = "#9333ea";
              infoColor2 = "#9333ea";
            }
          } else {
            if (dwellDays2 >= 14) {
              newBorderColor = "var(--red)";
              infoColor2 = "var(--red)";
            } else if (dwellDays2 >= 10) {
              newBorderColor = "var(--amber)";
              infoColor2 = "var(--amber)";
            } else if (dwellDays2 >= 7) {
              newBorderColor = "#9333ea";
              infoColor2 = "#9333ea";
            }
          }
          const row = div.querySelector(".device-row");
          if (row) row.style.borderColor = newBorderColor;
          let infoTextEl = div.querySelector(".device-info-text");
          if (!infoTextEl && row) {
            infoTextEl = document.createElement("div");
            infoTextEl.className = "device-info-text";
            row.insertBefore(infoTextEl, row.querySelector(".remove-entry"));
          }
          if (infoTextEl) {
            infoTextEl.textContent = infoText2;
            infoTextEl.style.color = infoColor2;
          }
        }
        window.devicesModifiedSinceLastSummary = true;
        saveState(true);
        computeAll();
      });
    }
    c.appendChild(div);
  }
  function toggleOxyFields() {
    const mod = $("oxMod")?.querySelector(".select-btn.active")?.dataset.value || "RA";
    const show = (cls) => document.querySelectorAll(cls).forEach((e) => e.style.display = "block");
    const hide = (cls) => document.querySelectorAll(cls).forEach((e) => e.style.display = "none");
    hide(".npOnly");
    hide(".hfnpOnly");
    hide(".nivOnly");
    hide(".tracheOnly");
    if (mod === "NP") show(".npOnly");
    if (mod === "HFNP") show(".hfnpOnly");
    if (mod === "NIV") show(".nivOnly");
    if (mod === "Trache") show(".tracheOnly");
  }
  function toggleInfusionsBox() {
    const w = $("infusions_wrapper");
    if (w) w.style.display = "grid";
  }
  function toggleBowelDate(mode) {
    const w = $("bowel_date_wrapper");
    if (w) w.style.display = mode ? "block" : "none";
    if (mode) {
      const l = $("bowel_date_label");
      if (l) l.textContent = mode === "btn_bno" ? "Date Last Opened" : "Date BO";
      const ap = $("aperients_wrapper");
      if (ap) ap.style.display = mode === "btn_bno" ? "block" : "none";
      handleUnknownBLODate();
    }
  }
  function handleUnknownBLODate() {
    const unknownChk = $("chk_unknown_blo_date");
    const dateInput = $("bowel_date");
    const todayBtn = $("btn_bowel_today");
    const yesterdayBtn = $("btn_bowel_yesterday");
    if (unknownChk && dateInput) {
      const isUnknown = unknownChk.checked;
      dateInput.disabled = isUnknown;
      dateInput.style.opacity = isUnknown ? "0.5" : "1";
      if (todayBtn) {
        todayBtn.disabled = isUnknown;
        todayBtn.style.opacity = isUnknown ? "0.5" : "1";
      }
      if (yesterdayBtn) {
        yesterdayBtn.disabled = isUnknown;
        yesterdayBtn.style.opacity = isUnknown ? "0.5" : "1";
      }
      if (isUnknown) {
        dateInput.value = "";
      }
    }
  }
  var copiedOnExit = false;
  function markCopiedOnExit() {
    copiedOnExit = true;
  }
  function clearClipboard() {
    navigator.clipboard?.writeText("")?.catch(() => {
    });
  }
  function showClearDataModal() {
    copiedOnExit = false;
    const modal = $("clearDataModal");
    if (modal) modal.style.display = "flex";
  }
  function hideClearDataModal() {
    const modal = $("clearDataModal");
    if (modal) modal.style.display = "none";
  }
  var _syncingPMH = false;
  function syncComorbsToPMH() {
    if (_syncingPMH) return;
    _syncingPMH = true;
    const noteEl = $("pmh_note");
    if (!noteEl) {
      _syncingPMH = false;
      return;
    }
    const activeKeys = toggleInputs.filter((k) => k.startsWith("comorb_") && $(`toggle_${k}`)?.dataset.value === "true");
    const chipLines = [];
    activeKeys.forEach((k) => {
      if (k === "comorb_other") {
        const specVal = $("comorb_other_note")?.value.trim();
        if (specVal) {
          specVal.split(/[\n,]+/).forEach((v) => {
            const trimmed = v.trim();
            if (trimmed) chipLines.push(trimmed);
          });
        }
      } else {
        chipLines.push(comorbMap[k]);
      }
    });
    const filterLower = Object.values(comorbMap).map((n) => n.toLowerCase());
    const otherVal = $("comorb_other_note")?.value.trim();
    if (otherVal) {
      otherVal.split(/[\n,]+/).forEach((v) => {
        const trimmed = v.trim();
        if (trimmed) filterLower.push(trimmed.toLowerCase());
      });
    }
    const userLines = noteEl.value.split("\n").filter((line) => {
      const trimmed = line.trim();
      return trimmed && !filterLower.includes(trimmed.toLowerCase());
    });
    noteEl.value = [...chipLines, ...userLines].join("\n");
    _syncingPMH = false;
  }
  function clearData() {
    hideClearDataModal();
    if (!copiedOnExit) clearClipboard();
    if (isQuickReviewMode) {
      exitQuickReviewMode();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelectorAll(".panel").forEach((p2) => p2.classList.remove("open"));
    document.querySelectorAll(".accordion").forEach((btn) => {
      btn.setAttribute("aria-expanded", "false");
    });
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(UNDO_KEY);
    sessionStorage.removeItem("alertToolLastSaved_v7_7");
    localStorage.removeItem(ACCORDION_KEY);
    sessionStorage.removeItem(ACCORDION_KEY);
    localStorage.removeItem("alert_audit_log_v1");
    updateLastSaved();
    staticInputs.forEach((id) => {
      if ($(id)) {
        $(id).value = "";
        $(id).classList.remove("scraped-data");
        const el = $(id);
        if (["b_device", "airway_a"].includes(id)) {
          el.dataset.manual = "false";
        }
      }
    });
    const impTxt = $("importText");
    if (impTxt) impTxt.value = "";
    document.querySelectorAll(".active").forEach((e) => e.classList.remove("active"));
    document.querySelectorAll('input[type="checkbox"]').forEach((e) => e.checked = false);
    document.querySelectorAll(".toggle-label").forEach((e) => e.dataset.value = "false");
    document.querySelectorAll(".blood-abnormal").forEach((e) => e.classList.remove("blood-abnormal"));
    const dc = $("devices-container");
    if (dc) dc.innerHTML = "";
    const sc = $("selected_comorbs_display");
    if (sc) {
      sc.innerHTML = "";
      sc.style.display = "none";
    }
    document.querySelectorAll(".prev-datum").forEach((el) => el.textContent = "");
    document.querySelectorAll(".input-box.carried-forward").forEach((w) => {
      w.classList.remove("carried-forward");
      delete w.dataset.carriedFrom;
      delete w.dataset.carriedRaw;
      delete w.dataset.carriedNote;
    });
    document.querySelectorAll(".trend-buttons").forEach((g) => delete g.dataset.manual);
    window.prevBloods = {};
    const pb = $("prevRisksBox");
    if (pb) pb.style.display = "none";
    setQuickReviewDismissed(false);
    setQuickReviewOffered(false);
    const qrPrompt = $("quickReviewPrompt");
    if (qrPrompt) qrPrompt.style.display = "none";
    clearActiveIssues();
    clearNewRiskAlert();
    const bloodsGrid = document.querySelector(".bloods-grid");
    if (bloodsGrid) bloodsGrid.style.display = "";
    const gatesToHide = [
      "#resp_gate_content",
      "#renal_gate_content",
      "#neuro_gate_content",
      "#electrolyte_gate_content",
      "#infection_gate_content",
      "#pressor_gate_content",
      "#hac_content",
      "#immobility_note_wrapper",
      "#after_hours_note_wrapper",
      "#comorb_other_note_wrapper",
      "#unsuitable_note_wrapper",
      "#override_reason_box",
      "#sub_intubated_reason",
      "#sub_dyspnea_severity",
      "#pressor_recent_other_note_wrapper",
      "#dialysis_type_wrapper",
      "#anticoag_note_wrapper",
      "#vte_prophylaxis_note_wrapper",
      "#pics_wrapper",
      "#sleep_quality_wrapper",
      "#neuro_psych_wrapper",
      "#pain_context_wrapper",
      "#nutrition_context_wrapper",
      "#frailty_note_wrapper"
    ];
    gatesToHide.forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.style.display = "none";
    });
    document.querySelectorAll(".concern-note").forEach((e) => {
      if (!["immobility_note_wrapper", "after_hours_note_wrapper", "comorb_other_note_wrapper", "unsuitable_note_wrapper", "pressor_recent_other_note_wrapper"].includes(e.id)) {
        e.style.display = "block";
      }
    });
    const summaryActions = $("summary_actions");
    if (summaryActions) summaryActions.style.display = "none";
    const badge = $("manual_edit_badge");
    if (badge) badge.style.display = "none";
    const btnGen = $("btn_generate_summary");
    if (btnGen) btnGen.innerHTML = "\u2728 Generate DMR summary";
    const summaryEl = $("summary");
    if (summaryEl) {
      summaryEl.value = "";
      summaryEl.style.height = "";
    }
    const handoverEl = $("handoverLine");
    if (handoverEl) handoverEl.value = "";
    const handoverActions = $("handover_actions");
    if (handoverActions) handoverActions.style.display = "none";
    window.dismissedDischarge = false;
    const now = /* @__PURE__ */ new Date();
    now.setMinutes(Math.round(now.getMinutes() / 15) * 15);
    const tb = $("reviewTime");
    if (tb) tb.value = timeHHMM(now);
    const p = document.querySelector('input[value="post"]');
    if (p) p.checked = true;
    document.querySelectorAll('input[name="reviewModeType"]').forEach((r) => r.checked = false);
    updateWardOptions();
    updateReviewTypeVisibility();
    const listEl = $("flagList");
    if (listEl) listEl.innerHTML = "";
    const sum = $("summary");
    if (sum) sum.value = "";
    const orReason = $("override_reason_box");
    if (orReason) orReason.style.display = "none";
    $("override_amber")?.classList.remove("active");
    $("override_red")?.classList.remove("active");
    $("override_green")?.classList.remove("active");
    const orClear = $("override_clear");
    if (orClear) orClear.style.display = "none";
    const resetEv = new CustomEvent("resetAddsCalc");
    document.dispatchEvent(resetEv);
    updateAgeMitigationUI();
    updateLosMitigationUI();
    computeAll();
    showToast("Data cleared", 2e3);
  }
  function refreshCategorySelect(autoCat, override, reason, redCount, amberCount) {
    const hint = $("override_auto_hint");
    const chosen = override && override !== "none" ? override : null;
    ["red", "amber", "green"].forEach((c) => $(`override_${c}`)?.classList.toggle("active", c === chosen));
    const clearBtn = $("override_clear");
    if (clearBtn) clearBtn.style.display = chosen ? "" : "none";
    if (isQuickReviewMode) {
      if (hint) {
        const differs = chosen && chosen !== autoCat.id;
        hint.textContent = differs ? `Tool has: ${autoCat.text} from the score and bloods` : "";
      }
      const box2 = $("override_reason_box");
      if (box2) {
        box2.style.display = "none";
        box2.classList.remove("reason-missing");
      }
      const warn2 = $("override_downgrade_warn");
      if (warn2) warn2.style.display = "none";
      const required2 = $("override_reason_required");
      if (required2) required2.style.display = "none";
      return;
    }
    if (hint) hint.textContent = `Auto-calculated: ${autoCat.text}`;
    const box = $("override_reason_box");
    if (box) box.style.display = chosen ? "block" : "none";
    const warn = $("override_downgrade_warn");
    const label = $("override_reason_label");
    const required = $("override_reason_required");
    const CAT_RANK = { green: 0, amber: 1, red: 2 };
    const chosenText = { red: "CAT 1", amber: "CAT 2", green: "CAT 3" }[chosen];
    const isDowngrade = !!chosen && CAT_RANK[chosen] < CAT_RANK[autoCat.id];
    if (label) label.textContent = isDowngrade ? `Reason for downgrade to ${chosenText}` : "Reason for override";
    if (required) required.style.display = isDowngrade && !reason ? "block" : "none";
    if (box) box.classList.toggle("reason-missing", isDowngrade && !reason);
    if (warn) {
      if (isDowngrade && (redCount > 0 || amberCount > 0)) {
        const parts = [];
        if (redCount) parts.push(`${redCount} red flag${redCount > 1 ? "s" : ""}`);
        if (amberCount) parts.push(`${amberCount} amber flag${amberCount > 1 ? "s" : ""}`);
        warn.textContent = `\u26A0 Set to ${chosenText} with ${parts.join(" and ")} present (auto-calculated ${autoCat.text}). The flags stay in the summary.`;
        warn.style.display = "block";
      } else {
        warn.style.display = "none";
      }
    }
  }
  function refreshAddsOverrideUI() {
    const manual = $("addsManual")?.value === "true";
    const btn = $("btnAddsOverride");
    const box = $("adds_override_box");
    const hint = $("adds_calc_hint");
    const addsInput = $("adds");
    if (btn) {
      btn.textContent = manual ? "MODS score - calculator not applied" : "Enter MODS";
      btn.classList.toggle("active", manual);
      btn.setAttribute("aria-pressed", String(manual));
    }
    if (box) box.style.display = manual ? "block" : "none";
    const modsChk = $("chk_use_mods");
    if (modsChk) {
      modsChk.checked = manual;
      const modsInputs = $("mods_inputs");
      if (modsInputs) modsInputs.style.display = manual ? "block" : "none";
    }
    if (manual) {
      const score = $("mods_score");
      if (score) score.value = addsInput?.value || "";
      const details = $("mods_details");
      if (details) details.value = $("addsOverrideNote")?.value || "";
    }
    const calcTotal = $("calc_total_display")?.textContent?.trim();
    const recorded = addsInput?.value?.trim();
    if (hint) {
      if (manual && calcTotal && recorded && calcTotal !== recorded) {
        hint.textContent = `ADDS calculator ${calcTotal} \xB7 MODS recorded ${recorded}`;
        hint.style.display = "inline";
      } else {
        hint.style.display = "none";
      }
    }
  }
  function setAddsOverride(manual, { focus = false } = {}) {
    const field = $("addsManual");
    if (!field) return;
    field.value = String(manual);
    if (manual) {
      if (focus) {
        $("adds")?.focus();
        $("adds")?.select();
      }
    } else {
      const calcTotal = $("calc_total_display")?.textContent?.trim();
      const addsInput = $("adds");
      if (addsInput && calcTotal && calcTotal !== "0") {
        addsInput.value = calcTotal;
        addsInput.dispatchEvent(new Event("input"));
      }
      const note = $("addsOverrideNote");
      if (note) note.value = "";
      const score = $("mods_score");
      if (score) score.value = "";
      const details = $("mods_details");
      if (details) details.value = "";
    }
    refreshAddsOverrideUI();
  }
  function toggleAddsOverride() {
    setAddsOverride($("addsManual")?.value !== "true", { focus: true });
  }
  var newRiskLog = [];
  function showNewRiskAlert(newRed = [], newAmber = []) {
    const seen = new Set(newRiskLog.map((r) => r.text));
    [...newRed.map((text) => ({ text, severity: "red" })), ...newAmber.map((text) => ({ text, severity: "amber" }))].forEach((entry) => {
      if (seen.has(entry.text)) return;
      seen.add(entry.text);
      newRiskLog.push(entry);
    });
    newRiskLog = newRiskLog.filter((r) => !newRiskLog.some((other) => other !== r && other.text.startsWith(r.text)));
    if (!newRiskLog.length) return;
    const redCount = newRiskLog.filter((r) => r.severity === "red").length;
    setNotice("new-risk", {
      priority: NOTICE_PRIORITY.NEW_RISK,
      tone: redCount ? "red" : "amber",
      html: `<div class="notice-title">\u26A0\uFE0F New risk flagged</div>
               <ul class="notice-list">${newRiskLog.map((r) => `<li class="${r.severity}">${r.text}</li>`).join("")}</ul>`,
      actions: [{ id: "dismiss-new-risk", label: "Dismiss", onClick: clearNewRiskAlert }]
    });
  }
  function clearNewRiskAlert() {
    newRiskLog = [];
    clearNotice("new-risk");
  }
  function setBloodsOverlay(open) {
    const section = $("section-bloods");
    if (!section) return;
    section.classList.toggle("qr-expanded", !!open && isQuickReviewMode);
    syncQuickOverlayBackdrop();
  }
  function syncQuickOverlayBackdrop() {
    const backdrop = $("qrBackdrop");
    if (!backdrop) return;
    const anyOpen = !!document.querySelector(".qr-expanded");
    backdrop.hidden = !anyOpen;
  }
  var addsCalcObserver = null;
  function watchAddsCalculator() {
    const container = $("addsCalculatorContainer");
    const wrapper = $("adds_wrapper");
    if (!container || !wrapper || addsCalcObserver) return;
    const sync = () => {
      const open = container.style.display === "block";
      wrapper.classList.toggle("qr-expanded", open && isQuickReviewMode);
      syncQuickOverlayBackdrop();
    };
    addsCalcObserver = new MutationObserver(sync);
    addsCalcObserver.observe(container, { attributes: true, attributeFilter: ["style"] });
    sync();
  }
  function setChip(id, text) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || "";
    if (text) el.setAttribute("data-filled", "true");
    else el.removeAttribute("data-filled");
  }
  function renderQuickChips(s) {
    if (!isQuickReviewMode) {
      ["qrChipAdds", "qrChipBloods", "qrChipDevices"].forEach((id) => setChip(id, ""));
      return;
    }
    const adds = (s.adds ?? "").toString().trim();
    const isMods = $("addsManual")?.value === "true";
    setChip("qrChipAdds", adds ? `\u2713 ${isMods ? "MODS" : "ADDS"} ${adds}` : "");
    if (s.chk_bloods_nil_sig || s.bloods_status === "nil_sig") {
      setChip("qrChipBloods", "\u2713 Nil significant");
    } else if (s.bloods_status === "improving") {
      setChip("qrChipBloods", "\u2713 Improving");
    } else if (s.bloods_status === "not_checked") {
      setChip("qrChipBloods", "\u2713 Not checked");
    } else {
      const n = Object.keys(NOTE_BLOOD_LABELS).filter((k) => s[`bl_${k}`]).length;
      setChip("qrChipBloods", n ? `\u2713 ${n} result${n === 1 ? "" : "s"} entered` : "");
    }
    const lines = document.querySelectorAll("#devices-container .device-entry").length;
    setChip("qrChipDevices", lines ? `\u2713 ${lines} recorded` : "");
  }
  function closeQuickOverlays() {
    const wrapper = $("adds_wrapper");
    if (wrapper?.classList.contains("qr-expanded")) $("btnToggleCalc")?.click();
    if ($("section-bloods")?.classList.contains("qr-expanded")) $("btnBloodsDetailsToggle")?.click();
    syncQuickOverlayBackdrop();
  }
  function setPanelOpen(panel, btn, open) {
    if (panel) panel.classList.toggle("open", open);
    if (btn) btn.setAttribute("aria-expanded", String(open));
  }
  function openAccordion(panelId, btnSelector) {
    setPanelOpen($(panelId), document.querySelector(btnSelector), true);
  }
  function closeAccordion(panelId, btnSelector) {
    setPanelOpen($(panelId), document.querySelector(btnSelector), false);
  }
  var QUICK_REVIEW_SECTIONS_TO_HIDE = ["section-risk", "section-ae", "section-context"];
  var QUICK_GRID_LAYOUT = {
    qgTop: ["section-patient"],
    // Left rail is what you measured; the right column is what you concluded. The category
    // buttons no longer appear here - they moved inside #section-category, which is the whole
    // bottom band, so the call is made next to the flags that produced it.
    qgLeft: ["adds_wrapper", "section-bloods", "section-devices"],
    qgRight: ["patient_factors_wrapper", "scraped_risks_wrapper", "quick_notes_wrapper"],
    qgBottom: ["section-category"]
  };
  function moveIntoQuickGrid() {
    Object.entries(QUICK_GRID_LAYOUT).forEach(([cellId, ids]) => {
      const cell = $(cellId);
      if (!cell) return;
      ids.forEach((id) => {
        const el = $(id);
        if (!el || el.dataset.qrMoved === "true" || !el.parentNode) return;
        const anchor = document.createElement("span");
        anchor.setAttribute("data-qr-anchor", id);
        anchor.style.display = "none";
        el.parentNode.insertBefore(anchor, el);
        cell.appendChild(el);
        el.dataset.qrMoved = "true";
      });
    });
  }
  function restoreFromQuickGrid() {
    document.querySelectorAll('[data-qr-moved="true"]').forEach((el) => {
      const anchor = document.querySelector(`[data-qr-anchor="${el.id}"]`);
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(el, anchor);
        anchor.remove();
      }
      delete el.dataset.qrMoved;
    });
  }
  function releaseCarriedGatesToList() {
    document.querySelectorAll(".input-box.carried-forward").forEach((wrapper, idx) => {
      const raw = wrapper.dataset.carriedRaw || wrapper.dataset.carriedFrom;
      const group = wrapper.querySelector(".segmented-group");
      group?.querySelectorAll(".seg-btn.active").forEach((btn) => btn.classList.remove("active"));
      if (group) delete group.dataset.value;
      wrapper.classList.remove("carried-forward");
      delete wrapper.dataset.carriedFrom;
      delete wrapper.dataset.carriedRaw;
      delete wrapper.dataset.carriedNote;
      if (raw && window.addActiveIssue) {
        const riskId = GATE_RISK_ID[group?.id] || group?.id || null;
        const wasScoring = (window._lastRiskEntries || []).find((e) => e.id === riskId);
        const text = SELF_DERIVED_RISK.test(raw) ? raw.split(/\s+-\s+/)[0].trim() : raw;
        window.addActiveIssue({
          text,
          source: "scraped",
          list: "risks",
          severity: wasScoring?.type || "amber",
          scoresAs: wasScoring?.type || "amber",
          gateId: riskId,
          key: `released_gate_${idx}_${text.slice(0, 20)}`
        });
      }
    });
  }
  function enableQuickReviewMode() {
    setQuickReviewMode(true);
    setInitialQuickReviewRisks({ red: [], amber: [] });
    setQuickReviewBaselineCaptured(false);
    clearNewRiskAlert();
    releaseCarriedGatesToList();
    computeAll();
    document.body.classList.add("quick-review-active");
    const banner = $("quickReviewBanner");
    if (banner) banner.style.display = "block";
    const prompt = $("quickReviewPrompt");
    if (prompt) prompt.style.display = "none";
    QUICK_REVIEW_SECTIONS_TO_HIDE.forEach((id) => {
      const section = $(id);
      if (section) {
        section.style.display = "none";
        section.setAttribute("data-hidden-by-quick-review", "true");
      }
    });
    moveIntoQuickGrid();
    watchAddsCalculator();
    closeAccordion("panel_bloods", '[aria-controls="panel_bloods"]');
    openAccordion("panel_devices", '[aria-controls="panel_devices"]');
    const bloodsQuick = $("bloods_quick_controls");
    if (bloodsQuick) bloodsQuick.style.display = "block";
    document.querySelectorAll(".nav-item").forEach((item) => {
      const href = item.getAttribute("href")?.substring(1);
      if (href && QUICK_REVIEW_SECTIONS_TO_HIDE.includes(href)) {
        item.style.opacity = "0.3";
        item.style.pointerEvents = "none";
      }
    });
    const depthQuick = document.querySelector('input[name="reviewDepth"][value="quick"]');
    if (depthQuick) depthQuick.checked = true;
    renderScrapedIssuesList();
    setTimeout(() => {
      const target = $("quickGrid");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
    showToast("Quick Review mode", 2e3);
  }
  function maybeOfferQuickReview(timeData, s) {
    if (!s.stepdownDate) return;
    if (s.reviewType === "pre") return;
    if (isQuickReviewMode) return;
    if (quickReviewDismissedBySession) return;
    if (document.activeElement === $("stepdownDate")) return;
    const stepdownYear = parseInt(s.stepdownDate.slice(0, 4), 10);
    if (!(stepdownYear >= 2020)) return;
    if (timeData.hours < 0) return;
    if (timeData.hours > 24) {
      showQuickReviewPrompt($("catText")?.textContent || "", timeData.hours);
    }
  }
  function exitQuickReviewMode() {
    setQuickReviewMode(false);
    setInitialQuickReviewRisks({ red: [], amber: [] });
    setQuickReviewBaselineCaptured(false);
    setQuickReviewDismissed(true);
    document.body.classList.remove("quick-review-active");
    const banner = $("quickReviewBanner");
    if (banner) banner.style.display = "none";
    clearNewRiskAlert();
    $("adds_wrapper")?.classList.remove("qr-expanded");
    setBloodsOverlay(false);
    renderQuickChips({});
    restoreFromQuickGrid();
    document.querySelector(".device-add-group")?.classList.remove("show-all");
    $("btnDeviceMore")?.setAttribute("aria-expanded", "false");
    document.querySelectorAll("[data-hidden-by-quick-review]").forEach((section) => {
      section.style.display = "";
      section.removeAttribute("data-hidden-by-quick-review");
    });
    const bloodsQuick = $("bloods_quick_controls");
    if (bloodsQuick) bloodsQuick.style.display = "none";
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.style.opacity = "";
      item.style.pointerEvents = "";
    });
    const depthFull = document.querySelector('input[name="reviewDepth"][value="full"]');
    if (depthFull) depthFull.checked = true;
    renderScrapedIssuesList();
    showToast("Full review mode restored", 2e3);
  }
  function showQuickReviewPrompt(categoryText, hoursOnWard, previousRisks = []) {
    const prompt = $("quickReviewPrompt");
    if (!prompt) return;
    if (quickReviewOffered) return;
    setQuickReviewOffered(true);
    const prevCatText = $("prevCategoryText");
    const timeText = $("timeOnWardText");
    if (prevCatText) prevCatText.textContent = categoryText ? `Previous: ${categoryText}` : "";
    if (timeText) timeText.textContent = `${Math.round(hoursOnWard)}h since stepdown`;
    const risksBox = $("qrPromptRisks");
    if (risksBox) {
      if (previousRisks.length) {
        risksBox.innerHTML = `<strong>Previously flagged</strong><ul>${previousRisks.map((r) => `<li>${r}</li>`).join("")}</ul>`;
        risksBox.style.display = "block";
      } else {
        risksBox.style.display = "none";
      }
    }
    prompt.style.display = "flex";
    setTimeout(() => $("btnQuickReview")?.focus(), 100);
  }
  function updateSidebarRiskBadges(redCount, amberCount) {
    const badgeContainer = document.getElementById("sidebar-risk-badges");
    const mobileBadgeContainer = document.getElementById("mobile-risk-badges");
    let html = "";
    if (redCount > 0) html += `<span class="badge" style="color:var(--red);">\u{1F534}${redCount}</span>`;
    if (amberCount > 0) html += `<span class="badge" style="color:var(--amber);">\u{1F7E1}${amberCount}</span>`;
    if (badgeContainer) badgeContainer.innerHTML = html;
    if (mobileBadgeContainer) mobileBadgeContainer.innerHTML = html;
  }
  function openMobileNav() {
    const overlay = $("mobileNavOverlay");
    if (overlay) overlay.classList.add("active");
  }
  function closeMobileNav() {
    const overlay = $("mobileNavOverlay");
    if (overlay) overlay.classList.remove("active");
  }
  function updateLosMitigationUI() {
    const losInput = $("icuLos");
    const wrapper = $("los_risk_wrapper");
    const reasonWrapper = $("los_mitigate_reason_wrapper");
    const reasonInput = $("los_mitigate_reason");
    const seg = $("seg_los_mitigated");
    const clickBox = $("btn_los_mitigated");
    if (!losInput || !wrapper) return;
    const immobileBtn = $("seg_immobility")?.querySelector(".seg-btn.active");
    const isImmobile = immobileBtn?.dataset.value === "true";
    const los = parseFloat(losInput.value);
    if (isNaN(los) || los <= 4 || isImmobile) {
      wrapper.style.display = "none";
      if (reasonWrapper) reasonWrapper.style.display = "none";
      if (reasonInput) reasonInput.value = "";
      seg?.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.value === "false"));
      return;
    }
    wrapper.style.display = "block";
    const activeBtn = seg?.querySelector(".seg-btn.active");
    const isMitigated = activeBtn ? activeBtn.dataset.value === "true" : false;
    if (reasonWrapper) reasonWrapper.style.display = isMitigated ? "block" : "none";
    if (clickBox) {
      clickBox.className = isMitigated ? "age-mitigate-btn mitigated" : "age-mitigate-btn";
      clickBox.innerHTML = isMitigated ? "\u2713 Deconditioning flag removed - still in note" : "Long stay but recovering well?";
    }
  }
  function updateAgeMitigationUI() {
    const ageInput = $("ptAge");
    const wrapper = $("age_risk_wrapper");
    const reasonWrapper = $("age_mitigate_reason_wrapper");
    const reasonInput = $("age_mitigate_reason");
    const seg = $("seg_age_mitigated");
    const ageLabel = $("lbl_ptAge");
    const clickBox = $("btn_age_mitigated");
    const colWrapper = $("wrapper_ptAge");
    if (!ageInput || !wrapper) return;
    const age = parseFloat(ageInput.value);
    if (!isNaN(age) && age >= 75) {
      wrapper.style.display = "block";
      if (colWrapper) colWrapper.classList.add("input-box");
      const activeBtn = seg?.querySelector(".seg-btn.active");
      const isMitigated = activeBtn ? activeBtn.dataset.value === "true" : false;
      if (reasonWrapper) {
        reasonWrapper.style.display = isMitigated ? "block" : "none";
      }
      if (isMitigated) {
        if (colWrapper) {
          colWrapper.style.borderColor = "var(--line)";
          colWrapper.style.background = "";
          colWrapper.style.boxShadow = "";
        }
        if (ageLabel) {
          ageLabel.innerHTML = "Age";
          ageLabel.style.color = "";
        }
        ageInput.style.borderColor = "";
        ageInput.style.boxShadow = "";
        if (clickBox) {
          clickBox.removeAttribute("style");
          clickBox.className = "age-mitigate-btn mitigated";
          clickBox.innerHTML = "\u2713 Age flag removed - still in note";
        }
      } else {
        if (colWrapper) {
          colWrapper.style.borderColor = "var(--amber)";
          colWrapper.style.background = "rgba(245,158,11,0.03)";
          colWrapper.style.boxShadow = "0 0 0 1px var(--amber)";
        }
        if (ageLabel) {
          ageLabel.innerHTML = 'Age <span style="color: var(--amber); font-weight: bold; font-size: 0.72rem;">- Frailty risk identified</span>';
          ageLabel.style.color = "var(--amber)";
        }
        ageInput.style.borderColor = "";
        ageInput.style.boxShadow = "";
        if (clickBox) {
          clickBox.removeAttribute("style");
          clickBox.className = "age-mitigate-btn";
          clickBox.innerHTML = "Older but good baseline?";
        }
      }
    } else {
      wrapper.style.display = "none";
      if (reasonInput) reasonInput.value = "";
      if (reasonWrapper) reasonWrapper.style.display = "none";
      if (seg) {
        seg.querySelectorAll(".seg-btn").forEach((b) => {
          b.classList.toggle("active", b.dataset.value === "false");
        });
      }
      if (colWrapper) {
        colWrapper.classList.remove("input-box");
        colWrapper.style.borderColor = "transparent";
        colWrapper.style.background = "transparent";
        colWrapper.style.boxShadow = "none";
      }
      if (ageLabel) {
        ageLabel.innerHTML = "Age";
        ageLabel.style.color = "";
      }
      ageInput.style.borderColor = "";
      ageInput.style.boxShadow = "";
      if (clickBox) {
        clickBox.removeAttribute("style");
        clickBox.className = "age-mitigate-btn";
        clickBox.innerHTML = "Older but good baseline?";
      }
    }
  }

  // src/js/state.js
  window.prevBloods = {};
  var isQuickReviewMode = false;
  function setQuickReviewMode(v) {
    isQuickReviewMode = v;
  }
  var previousCategoryData = null;
  var initialQuickReviewRisks = { red: [], amber: [] };
  function setInitialQuickReviewRisks(v) {
    initialQuickReviewRisks = v;
  }
  var quickReviewBaselineCaptured = false;
  function setQuickReviewBaselineCaptured(v) {
    quickReviewBaselineCaptured = v;
  }
  var quickReviewDismissedBySession = false;
  function setQuickReviewDismissed(v) {
    quickReviewDismissedBySession = v;
  }
  var quickReviewOffered = false;
  function setQuickReviewOffered(v) {
    quickReviewOffered = v;
  }
  var activeIssues = [];
  var toastedRiskKeys = /* @__PURE__ */ new Set();
  var _activeIssueCounter = 0;
  function defaultListFor(source, severity) {
    return severity === "info" ? "factors" : "risks";
  }
  function addActiveIssue({ text, source, severity, key, list, carried, mitigated, scoresAs, gateId }) {
    const existing = activeIssues.find((i) => i.key === key && (!i.resolved || i.resolvedByUser));
    if (existing) {
      existing.text = text;
      existing.severity = severity;
      if (list) existing.list = list;
      return { issue: existing, isNew: false };
    }
    const issue = {
      id: `ai_${++_activeIssueCounter}`,
      text,
      source,
      severity,
      key,
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
      resolved: false,
      createdAt: _activeIssueCounter
    };
    activeIssues.push(issue);
    return { issue, isNew: true };
  }
  function addManualIssue(text, list = "risks") {
    return addActiveIssue({
      text,
      source: "manual",
      list,
      severity: list === "factors" ? "info" : "amber",
      key: `manual_${_activeIssueCounter + 1}`
    });
  }
  function getIssuesForList(list) {
    return activeIssues.filter((i) => i.list === list && (!i.resolved || i.resolvedByUser));
  }
  function getActiveChecks() {
    return activeIssues.filter((i) => i.list === "checks" && !i.resolved);
  }
  function toggleActiveIssueResolved(id) {
    const issue = activeIssues.find((i) => i.id === id);
    if (!issue) return;
    issue.touched = true;
    issue.resolved = !issue.resolved;
    window.compute?.();
    issue.resolvedByUser = issue.resolved;
    renderScrapedIssuesList();
  }
  function editActiveIssueText(id, newText) {
    const issue = activeIssues.find((i) => i.id === id);
    if (issue) {
      issue.text = newText;
      issue.touched = true;
    }
    renderScrapedIssuesList();
    window.compute?.();
  }
  function getUnreviewedScrapedCount() {
    return activeIssues.filter((i) => i.source === "scraped" && !i.touched && !i.resolved).length;
  }
  function getUnresolvedActiveIssues() {
    return activeIssues.filter((i) => !i.resolved);
  }
  var MIRRORS_AN_ASSESSMENT_FIELD = /* @__PURE__ */ new Set(["ae_mobility", "ae_diet"]);
  function withCarry(issue) {
    return issue.carried > 1 ? `${issue.text} (carried ${issue.carried})` : issue.text;
  }
  function getFactorsForNote() {
    return activeIssues.filter((i) => i.list === "factors" && !i.resolved).filter((i) => !MIRRORS_AN_ASSESSMENT_FIELD.has(i.key)).map(withCarry);
  }
  function getRisksForNote() {
    return activeIssues.filter((i) => i.list === "risks" && !i.resolved).filter((i) => i.source !== "auto").filter((i) => !i.scoresAs).map(withCarry);
  }
  function getDeletedRiskKeys() {
    return new Set(activeIssues.filter((i) => i.source === "auto" && i.resolvedByUser).map((i) => i.key));
  }
  function getScoringListRisks() {
    return activeIssues.filter((i) => i.scoresAs && !i.resolved).map((i) => ({ text: withCarry(i), severity: i.scoresAs, gateId: i.gateId }));
  }
  function getChecksForNote() {
    return getActiveChecks().map((i) => i.text);
  }
  function clearActiveIssues() {
    activeIssues = [];
    toastedRiskKeys.clear();
    renderScrapedIssuesList();
  }
  function reconcileAutoIssues(currentKeys) {
    activeIssues.forEach((issue) => {
      const isAutoSourced = issue.source === "auto" || issue.source === "bloods";
      if (isAutoSourced && !issue.resolved && !currentKeys.has(issue.key)) {
        issue.resolved = true;
        toastedRiskKeys.delete(issue.key);
      }
    });
  }
  function maybeToastNewRisk(key, text) {
    toastedRiskKeys.add(key);
  }
  var LIST_UI = {
    factors: { container: "patient_factors_list", count: "factors_count", input: "manualFactorInput" },
    risks: { container: "scraped_issues_list", count: "issues_count", input: "manualIssueInput" }
  };
  function renderOneList(listName) {
    const ui = LIST_UI[listName];
    const list = $(ui.container);
    if (!list) return;
    if (list.querySelector(".scraped-issue-edit")) return;
    const issues = getIssuesForList(listName);
    if (listName === "factors") {
      const card = $("patient_factors_wrapper");
      if (card) card.hidden = !isQuickReviewMode && issues.length === 0;
    }
    const count = $(ui.count);
    const openCount = issues.filter((i) => !i.resolved).length;
    const goneCount = issues.length - openCount;
    if (count) {
      const parts = [];
      if (openCount) parts.push(`${openCount} open`);
      if (goneCount) parts.push(`${goneCount} deleted`);
      count.textContent = parts.length ? `(${parts.join(" \xB7 ")})` : "";
    }
    if (issues.length === 0) {
      list.innerHTML = "";
      return;
    }
    list.innerHTML = issues.map((issue) => `
        <div class="scraped-issue-row${issue.resolved ? " resolved" : ""}" data-id="${issue.id}">
            <span class="scraped-issue-text" data-id="${issue.id}" title="Click to edit">${issue.text}</span>
            ${issue.mitigated ? '<span class="scraped-issue-note-tag" title="Considered and discounted last review">mitigated</span>' : ""}
            ${issue.carried > 1 ? `<span class="scraped-issue-carried" title="On this list for ${issue.carried} reviews">carried ${issue.carried}</span>` : ""}
            <button type="button" class="scraped-issue-edit-btn" data-id="${issue.id}"
                title="Edit" aria-label="Edit">&#9998;</button>
            <button type="button" class="scraped-issue-resolve" data-id="${issue.id}"
                title="${issue.resolved ? "Put it back on the list" : "Doesn't apply today - keeps it here but leaves it out of the note and the handover line"}">${issue.resolved ? "undo" : "delete"}</button>
        </div>
    `).join("");
    list.querySelectorAll(".scraped-issue-resolve").forEach((btn) => {
      btn.addEventListener("click", (e) => toggleActiveIssueResolved(e.currentTarget.dataset.id));
    });
    const startEdit = (span) => {
      const id = span.dataset.id;
      const issue = activeIssues.find((i) => i.id === id);
      if (!issue) return;
      const input = document.createElement("input");
      input.type = "text";
      input.className = "scraped-issue-edit";
      input.value = issue.text;
      span.replaceWith(input);
      input.focus();
      input.select();
      let committed = false;
      const finish = (save) => {
        if (committed) return;
        committed = true;
        const newText = input.value.trim() || issue.text;
        input.remove();
        if (save) editActiveIssueText(id, newText);
        else renderScrapedIssuesList();
      };
      input.addEventListener("blur", () => finish(true));
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          finish(true);
          $(ui.input)?.focus();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          finish(false);
        }
      });
    };
    list.querySelectorAll(".scraped-issue-text").forEach((span) => {
      span.addEventListener("click", () => startEdit(span));
    });
    list.querySelectorAll(".scraped-issue-edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const span = list.querySelector(`.scraped-issue-text[data-id="${e.currentTarget.dataset.id}"]`);
        if (span) startEdit(span);
      });
    });
  }
  function renderChecksStrip() {
    const strip = $("bloods_checks_strip");
    if (!strip) return;
    const checks = getActiveChecks();
    if (!checks.length) {
      strip.hidden = true;
      strip.innerHTML = "";
      return;
    }
    strip.hidden = false;
    strip.innerHTML = `<span class="checks-strip-label">Check</span>` + checks.map((c) => `<span class="checks-strip-item">${c.text}</span>`).join("");
  }
  function renderScrapedIssuesList() {
    renderOneList("factors");
    renderOneList("risks");
    renderChecksStrip();
  }
  function saveState(instantly = false) {
    const state = getState();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    sessionStorage.setItem("alertToolLastSaved_v7_7", (/* @__PURE__ */ new Date()).toISOString());
    updateLastSaved();
  }
  function loadState() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    } catch (e) {
      return null;
    }
  }
  function updateLastSaved() {
    const iso = sessionStorage.getItem("alertToolLastSaved_v7_7");
    const el = $("lastSaved");
    if (el) el.textContent = iso ? "Last saved: " + timeHHMM(new Date(iso)) : "Last saved: --:--";
  }
  function getState() {
    const state = {};
    staticInputs.forEach((id) => {
      const el = $(id);
      if (el) state[id] = el.value;
    });
    segmentedInputs.forEach((id) => {
      const group = $(`seg_${id}`);
      const active = group?.querySelector(".seg-btn.active");
      if (!active) {
        state[id] = null;
      } else if (active.dataset.value === "true" || active.dataset.value === "false") {
        state[id] = active.dataset.value === "true";
      } else {
        state[id] = active.dataset.value;
      }
    });
    toggleInputs.forEach((id) => {
      if ([
        "resp_tachypnea",
        "resp_rapid_wean",
        "resp_poor_cough",
        "resp_poor_swallow",
        "lactate_trend"
      ].includes(id)) return;
      const el = $(`toggle_${id}`);
      if (!el && id === "chk_aperients") {
        const chk = $("chk_aperients");
        if (chk) state[id] = chk.checked;
        return;
      }
      if (!el && id === "chk_unknown_blo_date") {
        const chk = $("chk_unknown_blo_date");
        if (chk) state[id] = chk.checked;
        return;
      }
      state[id] = el ? el.dataset.value === "true" : false;
    });
    selectInputs.forEach((id) => {
      const group = $(id);
      state[id] = group?.querySelector(".select-btn.active")?.dataset.value || "";
    });
    state["reviewType"] = document.querySelector('input[name="reviewType"]:checked')?.value || "post";
    const reviewTeam = document.querySelector('input[name="reviewTeam"]:checked')?.value || "ALERT";
    const clinicianGrade = document.querySelector('input[name="clinicianGrade"]:checked')?.value || "CNS";
    state["clinicianRole"] = `${reviewTeam} ${clinicianGrade}`;
    state["reviewModeType"] = document.querySelector('input[name="reviewModeType"]:checked')?.value || "";
    state.activeIssues = activeIssues;
    ["chk_medical_rounding", "chk_discharge_alert", "chk_continue_alert", "chk_use_mods", "chk_bloods_nil_sig", "chk_discharge_pending_bloods"].forEach((id) => {
      const el = $(id);
      if (el) state[id] = el.checked;
    });
    state["bowel_mode"] = document.querySelector("#panel_ae .quick-select.active")?.id || null;
    state.devices = {};
    deviceTypes.forEach((type) => {
      state.devices[type] = Array.from(document.querySelectorAll(`.device-entry[data-type="${type}"]`)).map((entry) => {
        const detailsInput = entry.querySelector(".device-textarea");
        const dateInput = entry.querySelector(".device-date");
        return {
          details: detailsInput ? detailsInput.value : "",
          insertionDate: dateInput ? dateInput.value : ""
        };
      });
    });
    document.querySelectorAll(".trend-buttons").forEach((group) => {
      state[group.id] = group.querySelector(".trend-btn.active")?.dataset.value || "";
      if (group.dataset.manual === "true") state[`${group.id}__manual`] = true;
    });
    return state;
  }
  function restoreState(state) {
    if (!state) return;
    if (state.initials && !state.ptName) state.ptName = state.initials;
    if (state.ptName && !state.initials) state.initials = state.ptName;
    staticInputs.forEach((id) => {
      const el = $(id);
      if (el && state[id] !== void 0) el.value = state[id];
    });
    segmentedInputs.forEach((id) => {
      const group = $(`seg_${id}`);
      if (!group) return;
      group.querySelectorAll(".seg-btn").forEach((btn) => btn.classList.remove("active"));
      let valStr = String(state[id]);
      if (state[id] === true) valStr = "true";
      if (state[id] === false) valStr = "false";
      const target = group.querySelector(`.seg-btn[data-value="${valStr}"]`);
      if (target) target.classList.add("active");
      handleSegmentClick(id, valStr);
    });
    toggleInputs.forEach((id) => {
      if (id === "chk_aperients") {
        const chk = $("chk_aperients");
        if (chk) chk.checked = state[id];
        return;
      }
      if (id === "chk_unknown_blo_date") {
        const chk = $("chk_unknown_blo_date");
        if (chk) chk.checked = state[id];
        return;
      }
      const el = $(`toggle_${id}`);
      if (el) {
        el.dataset.value = state[id] ? "true" : "false";
        el.classList.toggle("active", !!state[id]);
        if (id === "comorb_other") $("comorb_other_note_wrapper").style.display = state[id] ? "block" : "none";
        if (id === "pressor_recent_other") $("pressor_recent_other_note_wrapper").style.display = state[id] ? "block" : "none";
        if (id === "pressor_current_other") $("pressor_current_other_note_wrapper").style.display = state[id] ? "block" : "none";
        if (id === "anticoag_active") $("anticoag_note_wrapper").style.display = state[id] ? "block" : "none";
        if (id === "vte_prophylaxis_active") $("vte_prophylaxis_note_wrapper").style.display = state[id] ? "block" : "none";
        if (id === "renal_dialysis") $("dialysis_type_wrapper").style.display = state[id] ? "block" : "none";
      }
    });
    if (state["comorbs_gate"] === void 0) {
      const anyComorb = toggleInputs.filter((k) => k.startsWith("comorb_") && state[k]).length > 0;
      if (anyComorb) {
        const group = $("seg_comorbs_gate");
        group?.querySelectorAll(".seg-btn").forEach((btn) => btn.classList.remove("active"));
        const yesBtn = group?.querySelector('.seg-btn[data-value="true"]');
        if (yesBtn) yesBtn.classList.add("active");
        handleSegmentClick("comorbs_gate", "true");
      }
    }
    selectInputs.forEach((id) => {
      const group = $(id);
      if (group) {
        group.querySelectorAll(".select-btn").forEach((b) => b.classList.remove("active"));
        if (state[id]) {
          group.querySelector(`.select-btn[data-value="${state[id]}"]`)?.classList.add("active");
          if (id === "neuroType") $("neuro_gate_content").style.display = "block";
        }
      }
    });
    if (state["reviewType"]) {
      const r = document.querySelector(`input[name="reviewType"][value="${state["reviewType"]}"]`);
      if (r) r.checked = true;
      updateWardOptions();
      updateReviewTypeVisibility();
    }
    if (state["clinicianRole"]) {
      const [team, grade] = state["clinicianRole"].split(" ");
      const t = document.querySelector(`input[name="reviewTeam"][value="${team}"]`);
      if (t) t.checked = true;
      const g = document.querySelector(`input[name="clinicianGrade"][value="${grade}"]`);
      if (g) g.checked = true;
      updateReviewerRoleVisibility();
    }
    if (state["reviewModeType"]) {
      const r = document.querySelector(`input[name="reviewModeType"][value="${state["reviewModeType"]}"]`);
      if (r) r.checked = true;
    }
    if (Array.isArray(state.activeIssues)) {
      activeIssues = state.activeIssues;
      _activeIssueCounter = activeIssues.reduce((max, i) => Math.max(max, i.createdAt || 0), 0);
      renderScrapedIssuesList();
    }
    ["chk_medical_rounding", "chk_discharge_alert", "chk_continue_alert", "chk_use_mods", "chk_bloods_nil_sig", "chk_discharge_pending_bloods"].forEach((id) => {
      const el = $(id);
      if (el && state[id] !== void 0) el.checked = state[id];
    });
    const roundingSeg = $("seg_medical_rounding_prestepdown");
    if (roundingSeg) {
      const on = !!state["chk_medical_rounding"];
      const pre = $("chk_medical_rounding_pre");
      if (pre) pre.checked = on;
      roundingSeg.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.value === String(on)));
    }
    updateIcuRoundingPrompt();
    if (state["chk_use_mods"]) $("mods_inputs").style.display = "block";
    if (state["chk_discharge_pending_bloods"]) {
      const wrapper = $("discharge_pending_bloods_note_wrapper");
      if (wrapper) wrapper.style.display = "block";
    }
    if (state["bowel_mode"]) {
      $(state["bowel_mode"])?.classList.add("active");
      toggleBowelDate(state["bowel_mode"]);
    }
    if (state.ptWard) {
      updateWardOptions();
      const sel = $("ptWard");
      if (sel) sel.value = state.ptWard;
    }
    updateWardOtherVisibility();
    const devCont = $("devices-container");
    if (devCont) {
      devCont.innerHTML = "";
      if (state.devices) {
        deviceTypes.forEach((type) => {
          state.devices[type]?.forEach((item) => {
            if (typeof item === "string") {
              createDeviceEntry(type, item, "");
            } else {
              createDeviceEntry(type, item.details || "", item.insertionDate || "");
            }
          });
        });
      }
    }
    updateDevicesSectionVisibility();
    document.querySelectorAll(".trend-buttons").forEach((group) => {
      if (state[`${group.id}__manual`]) group.dataset.manual = "true";
      if (state[group.id]) group.querySelector(`.trend-btn[data-value="${state[group.id]}"]`)?.classList.add("active");
    });
    toggleOxyFields();
    toggleInfusionsBox();
  }

  // src/js/summary.js
  function generateSummary(s, cat, wardTimeTxt, red, amber, suppressed, activeComorbsKeys, lists = {}) {
    const sum = $("summary");
    window.devicesModifiedSinceLastSummary = false;
    const lines = [];
    const addLine = (txt) => {
      if (txt) lines.push(txt);
    };
    const pushBlank = () => {
      if (lines.length && lines[lines.length - 1] !== "") lines.push("");
    };
    const role = s.clinicianRole;
    const reviewName = s.reviewType === "pre" ? "Pre-Stepdown" : "post ICU review";
    const methodName = s.reviewModeType === "chart" ? "Chart review" : "Physical review";
    if (s.reviewType === "pre") {
      lines.push(`${role} Pre-Stepdown Review - ${methodName}`);
    } else {
      lines.push(`${role} ${reviewName} - ${methodName}`);
    }
    const idParts = [];
    if (s.ptName) idParts.push(`Patient: ${s.ptName}`);
    if (s.ptMrn) idParts.push(`URN: ...${s.ptMrn}`);
    const ward = wardLabel(s);
    if (ward) idParts.push(`Location: ${ward}${s.ptBed ? `, Room: ${s.ptBed}` : ""}`);
    else if (s.ptBed) idParts.push(`Room: ${s.ptBed}`);
    if (idParts.length) lines.push(idParts.join(" | "));
    let demo = [];
    if (s.ptAge) demo.push(`Age: ${s.ptAge}`);
    if (s.ptWeight) demo.push(`Weight: ${s.ptWeight}kg`);
    if (s.spo2_target === "88_92") demo.push("SpO2 target: 88-92%");
    if (demo.length) lines.push(demo.join(", "));
    lines.push(`Time of review: ${s.reviewTime || nowTimeStr()}`);
    if (s.reviewType === "pre") {
      lines.push(`Stepdown Date: Today (${todayDateStr()})`);
    } else if (s.stepdownDate) {
      lines.push(`ICU Discharge Date: ${formatDateDDMMYYYY(s.stepdownDate)}`);
    }
    pushBlank();
    if (wardTimeTxt && s.reviewType !== "pre") lines.push(`Time since stepdown: ${wardTimeTxt}`);
    if (s.icuLos) lines.push(`ICU LOS: ${s.icuLos} days`);
    if (s.ptAdmissionReason) lines.push(`Reason for ICU Admission: ${s.ptAdmissionReason}`);
    if (s.reviewType === "pre" && s.icuSummary) {
      pushBlank();
      lines.push(`ICU Course Summary: ${s.icuSummary}`);
    }
    pushBlank();
    if (s.stepdown_suitable === false) {
      lines.push(`ALERT Nursing Review Category - Not suitable for stepdown`);
      pushBlank();
      lines.push("Assessed as not presently suitable for ward stepdown.");
      lines.push(`Reason: ${s.unsuitable_note || "Clinical concerns (see notes)"}`);
      pushBlank();
      lines.push("--- FULL ASSESSMENT BELOW ---");
      pushBlank();
    } else {
      lines.push(`ALERT Nursing Review Category - ${cat.text}`);
      if (s.stepdown_suitable === true && s.reviewType === "pre") {
        lines.push("Patient is suitable for ward stepdown.");
      }
      pushBlank();
    }
    const pmhItems = [];
    const pmhSeen = /* @__PURE__ */ new Set();
    activeComorbsKeys.forEach((k) => {
      if (k === "comorb_other") {
        if (!s.comorb_other_note) return;
        s.comorb_other_note.trim().split(/[\n,]+/).forEach((part) => {
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
    if (s.pmh_note) {
      s.pmh_note.split("\n").forEach((p) => {
        const trimmed = p.trim().replace(/^-/, "").trim();
        if (trimmed && !pmhSeen.has(trimmed.toLowerCase())) {
          pmhSeen.add(trimmed.toLowerCase());
          pmhItems.push(trimmed);
        }
      });
    }
    if (pmhItems.length > 0) {
      lines.push("PMH:");
      pmhItems.forEach((item) => lines.push(`-${item}`));
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
    const aeHeaderAt = lines.length;
    lines.push("A-E ASSESSMENT:");
    if (s.chk_use_mods) {
      if (s.mods_score) addLine(`MODS: ${s.mods_score}${s.mods_details ? ` (${s.mods_details})` : ""}`);
    } else if (s.adds) addLine(`ADDS: ${s.adds}`);
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
    if (b.length) addLine(`B: ${b.join(", ")}`);
    else if (s.b_comment) addLine(`B:`);
    if (s.b_comment) addLine(`  - ${s.b_comment}`);
    let c = [];
    if (s.c_hr) c.push(`HR ${s.c_hr}${s.c_hr_rhythm ? ` (${s.c_hr_rhythm})` : ""}`);
    if (s.c_nibp) c.push(`NIBP ${s.c_nibp}`);
    if (s.c_cr) c.push(`CR ${s.c_cr}`);
    if (s.c_perf) c.push(`Perf ${s.c_perf}`);
    if (c.length) addLine(`C: ${c.join(", ")}`);
    else if (s.c_comment) addLine(`C:`);
    if (s.c_comment) addLine(`  - ${s.c_comment}`);
    let d = [];
    if (s.d_alert) d.push(s.d_alert);
    if (s.d_pain) {
      if (s.d_pain.toLowerCase() === "no pain") {
        d.push("No pain");
      } else {
        d.push(`Pain: ${s.d_pain}`);
      }
    }
    if (d.length) addLine(`D: ${d.join(", ")}`);
    else if (s.d_comment) addLine(`D:`);
    if (s.d_comment) addLine(`  - ${s.d_comment}`);
    let e = [];
    if (s.e_temp) e.push(`Temp ${s.e_temp}`);
    if (s.e_uop) e.push(`UOP ${s.e_uop}`);
    if (s.e_bsl) e.push(`BSL ${s.e_bsl}`);
    if (e.length) addLine(`E: ${e.join(", ")}`);
    else if (s.e_comment) addLine(`E:`);
    if (s.e_comment) addLine(`  - ${s.e_comment}`);
    if (lines.length === aeHeaderAt + 1) lines.length = aeHeaderAt;
    else if (lines.length === aeDetailAt) lines.splice(aeHeaderAt, 1);
    pushBlank();
    let bowelTxt = "";
    if (s.bowel_mode === "btn_bo") bowelTxt = "BO";
    else if (s.bowel_mode === "btn_bno") bowelTxt = "BNO";
    if (s.chk_unknown_blo_date && s.bowel_mode === "btn_bno") {
      bowelTxt += ", unknown when BLO";
    } else if (s.bowel_date) {
      const bd = new Date(s.bowel_date);
      const today = /* @__PURE__ */ new Date();
      today.setHours(0, 0, 0, 0);
      bd.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((today - bd) / (1e3 * 60 * 60 * 24));
      if (s.bowel_mode === "btn_bo") {
        if (daysDiff === 0) {
          bowelTxt += `, today (${bd.getDate()}/${bd.getMonth() + 1})`;
        } else if (daysDiff === 1) {
          bowelTxt += `, yesterday (${bd.getDate()}/${bd.getMonth() + 1})`;
        } else {
          bowelTxt += `, ${daysDiff} days ago (${bd.getDate()}/${bd.getMonth() + 1})`;
        }
      } else if (s.bowel_mode === "btn_bno") {
        if (daysDiff === 0) {
          bowelTxt += `. Last opened today (${bd.getDate()}/${bd.getMonth() + 1})`;
        } else if (daysDiff === 1) {
          bowelTxt += `. Last opened yesterday on ${bd.getDate()}/${bd.getMonth() + 1}`;
        } else {
          bowelTxt += `. Last opened ${daysDiff} days ago on ${bd.getDate()}/${bd.getMonth() + 1}`;
        }
      }
    }
    if (s.chk_aperients && s.bowel_mode === "btn_bno") bowelTxt += ". On aperients";
    if (s.ae_bowels) {
      if (s.bowel_mode === "btn_bo") {
        bowelTxt += `, type ${s.ae_bowels}`;
      } else {
        bowelTxt += `. ${s.ae_bowels}`;
      }
    }
    if (bowelTxt) addLine(`Bowels: ${bowelTxt}`);
    if (s.nutrition_adequate === false) addLine(`Nutrition: Inadequate${s.nutrition_context_note ? ` - ${s.nutrition_context_note}` : ""}`);
    else if (s.nutrition_adequate === true) addLine(`Nutrition: Adequate`);
    if (s.anticoag_note) addLine(`Anticoagulation: ${s.anticoag_note}`);
    if (s.vte_prophylaxis_note) addLine(`VTE Prophylaxis: ${s.vte_prophylaxis_note}`);
    if (s.infusions_note) addLine(`Infusions: ${s.infusions_note}`);
    pushBlank();
    const blMap = NOTE_BLOOD_LABELS;
    if (s.chk_bloods_nil_sig || s.bloods_status === "nil_sig") {
      addLine("Bloods: Checked, nil significant");
    } else if (s.bloods_status === "improving") {
      addLine("Bloods: Improving trend");
    } else if (s.bloods_status === "not_checked") {
      addLine("Bloods: Not checked this review");
    } else {
      const blLines = [];
      Object.keys(blMap).forEach((key) => {
        const currentVal = s[`bl_${key}`];
        const prevVal = window.prevBloods ? window.prevBloods[key] : null;
        if (currentVal) {
          let str = `${blMap[key]} ${currentVal}`;
          if (prevVal && prevVal !== currentVal) str += ` (${prevVal})`;
          const target = (key === "inr" ? s.inr_target : key === "aptt" ? s.aptt_target : "") || "";
          if (target.trim()) str += ` target ${target.trim()}`;
          blLines.push(str);
        }
      });
      if (blLines.length) {
        let taken = "";
        if (s.bloods_date) {
          taken = formatDateDDMMYYYY(s.bloods_date);
          if (s.bloods_time) taken += ` ${s.bloods_time}`;
        }
        addLine(`Bloods${taken ? ` (taken ${taken})` : ""}: ${blLines.join(", ")}`);
      }
    }
    if (s.new_bloods_ordered === "ordered") addLine("New bloods ordered for next round");
    if (s.new_bloods_ordered === "requested") addLine("New bloods requested (not yet ordered)");
    if (s.new_bloods_ordered === "not_required") addLine("New bloods not required");
    if (s.elec_replace_note) addLine(`Electrolyte Plan: ${s.elec_replace_note}`);
    pushBlank();
    const checks = lists.checks || [];
    if (checks.length) {
      addLine(`Checks: ${checks.join("; ")}`);
      pushBlank();
    }
    const hasAnyDevices = Object.values(s.devices || {}).some((arr) => arr.length);
    if (hasAnyDevices) {
      lines.push("LINES, DRAINS, DEVICES & WOUNDS:");
      const trackedDevices = ["CVC", "PICC", "PIVC", "Other CVAD", "IDC", "Vascath"];
      Object.entries(s.devices).forEach(([k, v]) => {
        v.forEach((item) => {
          let deviceLine = `- ${k}`;
          if (item.insertionDate && trackedDevices.includes(k)) {
            const deviceDate = /* @__PURE__ */ new Date(item.insertionDate + "T00:00:00");
            const dwellDays = Math.floor((/* @__PURE__ */ new Date() - deviceDate) / (1e3 * 60 * 60 * 24));
            if (item.details) deviceLine += ` - ${item.details}`;
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
    const sectionLines = (items) => {
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      items.forEach((t) => {
        const txt = (t || "").trim().replace(/^[-•]\s*/, "");
        if (txt && !seen.has(txt.toLowerCase())) {
          seen.add(txt.toLowerCase());
          out.push(txt);
        }
      });
      return out;
    };
    const buildPatientFactors = () => {
      const out = [];
      if (s.ae_mobility) out.push(`Mobility: ${s.ae_mobility}`);
      if (s.ae_diet) out.push(`Diet: ${s.ae_diet}`);
      if (s.nutrition_adequate === false) out.push(`Nutrition: Inadequate${s.nutrition_context_note ? ` - ${s.nutrition_context_note}` : ""}`);
      else if (s.nutrition_adequate === true) out.push("Nutrition: Adequate");
      if (s.pics) out.push(`Post ICU Syndrome: ${s.pics === "positive" ? "Positive" : "Negative"}${s.pics_note ? ` - ${s.pics_note}` : ""}`);
      if (s.sleep_quality === true) out.push(`Sleep: Poor${s.sleep_quality_note ? ` - ${s.sleep_quality_note}` : ""}`);
      else if (s.sleep_quality === false) out.push("Sleep: No sleep issues identified");
      if (s.neuro_psych === true) out.push(`Psychological issues: ${s.neuro_psych_note || "Concerns identified"}`);
      else if (s.neuro_psych === false) out.push("Psychological issues: Nil identified");
      return out;
    };
    const factorLines = sectionLines([
      ...buildPatientFactors(),
      ...lists.factors || [],
      ...(s.quickNotes || "").split("\n")
    ]);
    if (factorLines.length) {
      lines.push("PATIENT FACTORS:");
      factorLines.forEach((t) => lines.push(`- ${t}`));
      pushBlank();
    }
    lines.push("IDENTIFIED ICU READMISSION RISK FACTORS:");
    const riskLines = sectionLines([...red, ...amber, ...suppressed, ...lists.risks || []]);
    if (riskLines.length) {
      riskLines.forEach((r) => lines.push(`- ${r}`));
    } else {
      lines.push("- None identified");
    }
    pushBlank();
    lines.push("PLAN:");
    if (s.stepdown_suitable === false) {
      lines.push(`- ICU senior review requested - patient not currently suitable for ward stepdown.`);
      lines.push(`- Please contact ALERT for review when appropriate.`);
    } else if (s.chk_discharge_alert) {
      lines.push(`- Discharged from the ALERT nursing list. Please contact ALERT if further support is required.`);
    } else if (s.chk_discharge_pending_bloods) {
      let text = `- Discharge from the ALERT post ICU list is pending the next blood results. ALERT will review them; if no action is required the patient will be discharged and no further note added.`;
      if (s.discharge_pending_bloods_note && s.discharge_pending_bloods_note.trim()) {
        text += `
- Specific bloods being followed: ${s.discharge_pending_bloods_note.trim()}`;
      }
      lines.push(text);
    } else {
      lines.push("- ALERT nursing post ICU reviews continue.");
    }
    if (s.chk_medical_rounding) {
      lines.push(String(s.clinicianRole || "").startsWith("ICU") ? "- Referred for ALERT medical rounding - ALERT CN to be contacted." : "- Patient added to ALERT medical rounding list for further review.");
    }
    if (!s.chk_discharge_alert && !s.chk_discharge_pending_bloods && s.stepdown_suitable !== false) {
      lines.push("- Please contact ALERT if further support is required between reviews.");
    }
    if (sum) {
      sum.classList.add("script-updating");
      sum.value = toDmrSafeText(lines.join("\n")).replace(/\bnlr\b/g, "NLR");
      sum.classList.remove("script-updating");
      const badge = $("manual_edit_badge");
      if (badge) badge.style.display = "none";
    }
  }
  var HANDOVER_RISK_TRIMS = [
    [/^Elevated (ADDS|MODS) /, "$1 "],
    [/, increased risk of complications$/, ""],
    [/ concern - /, " - "],
    [/^Comorbidities - /, "PMH: "]
  ];
  function trimRiskForHandover(text) {
    return HANDOVER_RISK_TRIMS.reduce((acc, [re, rep]) => acc.replace(re, rep), text).trim();
  }
  function generateHandoverLine(s, activeIssuesList = [], cat = null, red = [], amber = []) {
    const now = /* @__PURE__ */ new Date();
    const dateStr = `${now.getDate()}/${now.getMonth() + 1}`;
    const initials = (s.reviewerInitials || "").toUpperCase();
    const time = s.reviewTime || nowTimeStr();
    const parts = [initials ? `${dateStr} ${time} ${initials}.` : `${dateStr} ${time}.`];
    parts.push(s.reviewModeType === "chart" ? "CHART R/V." : "PHYSICAL R/V.");
    parts.push(s.chk_use_mods ? `MODS ${s.mods_score || "--"}.` : `ADDS ${s.adds || "--"}.`);
    if (s.chk_bloods_nil_sig || s.bloods_status === "nil_sig") parts.push("Bloods nil sig.");
    else if (s.bloods_status === "improving") parts.push("Bloods improving.");
    else if (s.bloods_status === "not_checked") parts.push("Bloods not checked.");
    else {
      const abnormal = activeIssuesList.filter((i) => (i.key || "").startsWith("bl_")).map((i) => i.text.replace(/^Abnormal /, ""));
      if (abnormal.length) parts.push(`Bloods: ${abnormal.join(", ")}.`);
      else if (Object.keys(s).some((k) => k.startsWith("bl_") && s[k])) parts.push("Bloods reviewed.");
    }
    const risks = [...red, ...amber].filter((r) => !/^(Elevated )?(ADDS|MODS) \d/.test(r)).map(trimRiskForHandover);
    const seen = new Set(risks.map((r) => r.toLowerCase()));
    activeIssuesList.forEach((issue) => {
      if (issue.severity === "info" || issue.source === "auto" || issue.source === "bloods") return;
      const txt = trimRiskForHandover(issue.text);
      if (seen.has(txt.toLowerCase())) return;
      seen.add(txt.toLowerCase());
      risks.push(txt);
    });
    const catText = cat?.text || $("catText")?.textContent || "";
    if (catText) parts.push(risks.length ? `${catText} - ${risks.join("; ")}.` : `${catText} - nil risks.`);
    if (s.stepdown_suitable === false) parts.push("Not suitable for stepdown.");
    else if (s.chk_discharge_alert) parts.push("D/C from ALERT.");
    else if (s.chk_discharge_pending_bloods) parts.push("D/C pending bloods.");
    if (s.chk_medical_rounding) parts.push("+ Medical rounding.");
    return toDmrSafeText(parts.join(" ")).replace(/\s{2,}/g, " ");
  }

  // src/js/main.js
  function initialize() {
    applyAppIcons();
    updateLastSaved();
    disableAutofill();
    document.querySelectorAll(".quick-select, .select-btn, .detail-toggle, .accordion, .trend-btn").forEach((btn) => {
      btn.setAttribute("tabindex", "-1");
    });
    document.addEventListener("focusin", (e) => {
      if (e.target && e.target.tagName && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
        const footer = document.querySelector("footer");
        if (footer) {
          const rect = e.target.getBoundingClientRect();
          const footerRect = footer.getBoundingClientRect();
          if (rect.bottom > footerRect.top - 20) {
            window.scrollBy({
              top: rect.bottom - footerRect.top + 40,
              behavior: "smooth"
            });
          }
        }
      }
    });
    const compute = debounce(() => {
      computeAll();
      checkBloodRanges();
      updateAgeMitigationUI();
      updateLosMitigationUI();
      saveState(true);
    }, 350);
    window.addDevice = (type, val, insertionDate = "") => {
      createDeviceEntry(type, val, insertionDate);
      compute();
    };
    window.compute = compute;
    window.showQuickReviewPrompt = showQuickReviewPrompt;
    window.previousCategoryData = previousCategoryData;
    window.addActiveIssue = addActiveIssue;
    window.SELF_DERIVED_RISK = SELF_DERIVED_RISK;
    window.FIELD_BACKED_FACTOR = FIELD_BACKED_FACTOR;
    window.renderScrapedIssuesList = renderScrapedIssuesList;
    window.flagPreviousRecommendation = (detail) => {
      setNotice("handover", {
        priority: NOTICE_PRIORITY.HANDOVER,
        tone: "info",
        html: `<div class="notice-title">\u{1F4CB} Previous review recommended discharge pending next bloods</div>
                   ${detail ? `<div class="notice-foot">Bloods being followed: ${detail}</div>` : ""}`,
        actions: [{ id: "dismiss-handover", label: "Dismiss", onClick: () => clearNotice("handover") }]
      });
    };
    window.refreshAddsOverrideUI = refreshAddsOverrideUI;
    window.clearFormForImport = clearData;
    const getReviewMethod = () => document.querySelector('input[name="reviewModeType"]:checked')?.value || "";
    const setReviewMethod = (value) => {
      const radio = document.querySelector(`input[name="reviewModeType"][value="${value}"]`);
      if (!radio) return;
      radio.checked = true;
      radio.dispatchEvent(new Event("change"));
    };
    const hideReviewMethodPrompt = () => {
      const modal = $("reviewMethodPrompt");
      if (modal) modal.style.display = "none";
    };
    let pendingAfterReviewMethod = null;
    const commitPromptInitials = () => {
      const typed = ($("promptReviewerInitials")?.value || "").trim();
      const field = $("reviewerInitials");
      if (typed && field) {
        field.value = typed;
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    const needsInitials = () => !($("reviewerInitials")?.value || "").trim();
    const openReviewPrompt = (askMethod, askInitials) => {
      const modal = $("reviewMethodPrompt");
      if (!modal) return;
      const initialsBox = $("review_prompt_initials");
      const methodActions = $("review_prompt_method_actions");
      const continueActions = $("review_prompt_continue_actions");
      const title = $("review_prompt_title");
      if (initialsBox) initialsBox.style.display = askInitials ? "block" : "none";
      if (methodActions) methodActions.style.display = askMethod ? "flex" : "none";
      if (continueActions) continueActions.style.display = askMethod ? "none" : "flex";
      const bothAsked = askMethod && askInitials;
      const methodLabel = $("review_prompt_method_label");
      const initialsLabel = $("review_prompt_initials_label");
      if (methodLabel) methodLabel.style.display = bothAsked ? "block" : "none";
      if (initialsLabel) initialsLabel.style.display = bothAsked ? "block" : "none";
      if (title) {
        if (bothAsked) title.textContent = "Helpful hints";
        else if (askMethod) title.textContent = "How did you review this patient?";
        else title.textContent = "Initials for Excel handover";
      }
      const box = $("promptReviewerInitials");
      if (box) box.value = $("reviewerInitials")?.value || "";
      modal.style.display = "flex";
      if (askInitials) box?.focus();
    };
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
    $("btn_method_physical")?.addEventListener("click", () => chooseReviewMethod("physical"));
    $("btn_method_chart")?.addEventListener("click", () => chooseReviewMethod("chart"));
    $("btn_prompt_continue")?.addEventListener("click", () => {
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
      const summaryEl = $("summary");
      const actions = $("summary_actions");
      syncComorbsToPMH();
      computeAll();
      summaryEl.value = "";
      generateSummary(
        window._lastState || getState(),
        window._lastCat || { id: "green", text: "CAT 3" },
        window._lastWardTime || "",
        window._lastRed || [],
        window._lastAmber || [],
        window._lastSuppressed || [],
        window._lastActiveComorbsKeys || [],
        { factors: getFactorsForNote(), risks: getRisksForNote(), checks: getChecksForNote() }
      );
      summaryEl.style.height = "auto";
      summaryEl.style.height = summaryEl.scrollHeight + "px";
      if (actions) actions.style.display = "block";
      const btn = $("btn_generate_summary");
      if (btn) btn.innerHTML = '\u{1F504} Regenerate DMR summary <span style="font-size:0.9em; font-weight:normal; opacity:0.9;">(overwrites manual edits)</span>';
      const handoverEl = $("handoverLine");
      if (handoverEl) handoverEl.value = generateHandoverLine(
        window._lastState || getState(),
        getUnresolvedActiveIssues(),
        window._lastCat,
        window._lastRed || [],
        window._lastAmber || []
      );
      const handoverActions = $("handover_actions");
      if (handoverActions) handoverActions.style.display = "block";
      saveState(true);
    }
    $("btn_generate_summary")?.addEventListener("click", () => triggerGenerate());
    $("btnCopyHandoverLine")?.addEventListener("click", () => {
      const text = $("handoverLine")?.value;
      if (!text) {
        showToast("Nothing to copy", 1500);
        return;
      }
      navigator.clipboard.writeText(text).then(() => showToast("Handover line copied", 1500));
    });
    const wireAddRow = (inputId, buttonId, list) => {
      const commit = () => {
        const input = $(inputId);
        const val = input?.value.trim();
        if (!val) return;
        addManualIssue(val, list);
        input.value = "";
        renderScrapedIssuesList();
        input.focus();
      };
      $(inputId)?.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        commit();
      });
      $(buttonId)?.addEventListener("click", commit);
    };
    wireAddRow("manualIssueInput", "btnAddIssue", "risks");
    wireAddRow("manualFactorInput", "btnAddFactor", "factors");
    const summaryInputEl = $("summary");
    if (summaryInputEl) {
      summaryInputEl.addEventListener("input", () => {
        if (!summaryInputEl.classList.contains("script-updating")) {
          const badge = $("manual_edit_badge");
          if (badge) badge.style.display = "block";
        }
      });
    }
    window.openDischargeConfirm = (intent) => {
      window.dischargeIntent = intent;
      const body = $("discharge_confirm_body");
      if (body) {
        const isChartReview = document.querySelector('input[name="reviewModeType"]:checked')?.value === "chart";
        body.innerHTML = isChartReview ? "Has this patient had at least <strong>2 completed ALERT reviews</strong>, including at least <strong>one physical review</strong>?" : "Has this patient had at least <strong>2 completed ALERT reviews</strong>?";
      }
      const modal = $("dischargeConfirmModal");
      if (modal) modal.style.display = "flex";
    };
    const applyDischarge = (intent, msg) => {
      const chk = $(intent === "pending" ? "chk_discharge_pending_bloods" : "chk_discharge_alert");
      if (!chk) return;
      chk.checked = true;
      chk.dispatchEvent(new Event("change"));
      compute();
      showToast(msg, 1500);
    };
    $("btn_discharge_yes")?.addEventListener("click", (e) => {
      e.preventDefault();
      window.openDischargeConfirm("full");
    });
    $("btn_discharge_pending")?.addEventListener("click", (e) => {
      e.preventDefault();
      window.openDischargeConfirm("pending");
    });
    $("btn_discharge_confirm_yes")?.addEventListener("click", (e) => {
      e.preventDefault();
      const modal = $("dischargeConfirmModal");
      if (modal) modal.style.display = "none";
      window.dischargeConfirmed = true;
      const intent = window.dischargeIntent;
      applyDischarge(intent, intent === "pending" ? "Marked for discharge pending bloods (criteria confirmed)" : "Marked for discharge (criteria confirmed)");
      window.dischargeIntent = null;
      window.dischargeConfirmed = false;
    });
    $("btn_discharge_confirm_no")?.addEventListener("click", (e) => {
      e.preventDefault();
      const modal = $("dischargeConfirmModal");
      if (modal) modal.style.display = "none";
      window.dischargeIntent = null;
    });
    const btnNo = $("btn_discharge_no");
    if (btnNo) {
      btnNo.addEventListener("click", (e) => {
        e.preventDefault();
        window.dismissedDischarge = true;
        const continueChk = $("chk_continue_alert");
        if (continueChk) continueChk.checked = true;
        compute();
      });
    }
    function syncSegments(id1, id2, type) {
      const g1 = $(id1);
      const g2 = $(id2);
      if (!g1 || !g2) return;
      [g1, g2].forEach((group) => {
        group.querySelectorAll(".seg-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            setTimeout(() => {
              const val = btn.dataset.value;
              const otherGroup = group === g1 ? g2 : g1;
              otherGroup.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
              otherGroup.querySelector(`.seg-btn[data-value="${val}"]`)?.classList.add("active");
              if (val === "true") {
                if (type === "renal") showToast("Mitigation applied", 1500);
                if (type === "infection") showToast("Mitigation applied", 1500);
              }
              compute();
            }, 50);
          });
        });
      });
    }
    document.addEventListener("click", (e) => {
      const btn = e.target?.closest?.(".seg-btn");
      if (!btn) return;
      const box = btn.closest(".input-box.carried-forward");
      if (!box) return;
      box.classList.remove("carried-forward");
      delete box.dataset.carriedFrom;
      delete box.dataset.carriedRaw;
    });
    syncSegments("seg_renal_chronic", "seg_renal_chronic_bloods", "renal");
    syncSegments("seg_infection_downtrend", "seg_infection_downtrend_bloods", "infection");
    function setDetailToggleState(targetEl, show) {
      if (!targetEl) return;
      targetEl.style.display = show ? "block" : "none";
      const btn = document.querySelector(`.detail-toggle[data-target="${targetEl.id}"]`);
      if (btn) btn.textContent = show ? "Hide details" : "Add details";
    }
    function refreshDetailToggleState() {
      document.querySelectorAll(".detail-toggle").forEach((btn) => {
        const targetId = btn.dataset.target;
        const targetEl = $(targetId);
        if (!targetEl) return;
        const inputEl = targetEl.querySelector("textarea, input");
        const hasVal = !!(inputEl && inputEl.value && inputEl.value.trim());
        setDetailToggleState(targetEl, hasVal);
      });
    }
    document.querySelectorAll(".detail-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetEl = $(btn.dataset.target);
        if (!targetEl) return;
        const isHidden = targetEl.style.display === "none" || !targetEl.style.display;
        setDetailToggleState(targetEl, isHidden);
      });
    });
    document.addEventListener("input", (e) => {
      if (e.target && e.target.classList.contains("scraped-data")) {
        e.target.classList.remove("scraped-data");
      }
      const wrapper = e.target?.closest?.(".detail-wrapper");
      if (wrapper && wrapper.id) {
        setDetailToggleState(wrapper, true);
      }
    });
    const timeBox = $("reviewTime");
    if (timeBox && !timeBox.value) {
      const now = /* @__PURE__ */ new Date();
      now.setMinutes(Math.round(now.getMinutes() / 15) * 15);
      timeBox.value = timeHHMM(now);
    }
    function syncInputs(id1, id2) {
      const el1 = $(id1), el2 = $(id2);
      if (!el1 || !el2) return;
      el1.addEventListener("input", () => {
        el2.value = el1.value;
        compute();
      });
      el2.addEventListener("input", () => {
        el1.value = el2.value;
        compute();
      });
    }
    syncInputs("adds", "atoe_adds");
    syncInputs("wcc", "bl_wcc");
    syncInputs("crp", "bl_crp");
    syncInputs("neut", "bl_neut");
    syncInputs("lymph", "bl_lymph");
    const rrInput = $("b_rr");
    if (rrInput) {
      rrInput.addEventListener("input", debounce(() => {
        const val = parseFloat(rrInput.value);
        if (!isNaN(val) && val > 20) {
          const respSeg = $("seg_resp_concern");
          const respYes = respSeg?.querySelector('.seg-btn[data-value="true"]');
          if (respYes && !respYes.classList.contains("active")) respYes.click();
          const tachSeg = $("seg_resp_tachypnea");
          const yesBtn = tachSeg?.querySelector('.seg-btn[data-value="true"]');
          if (yesBtn && !yesBtn.classList.contains("active")) {
            yesBtn.click();
            showToast("Auto-selected Resp Concern + Tachypnea (>20)", 1500);
          }
        }
      }, 500));
    }
    const airwayInput = $("airway_a");
    if (airwayInput) {
      airwayInput.addEventListener("input", () => {
        airwayInput.dataset.manual = "true";
        const val = airwayInput.value;
        if (!val) return;
        const lowerVal = val.toLowerCase().trim();
        if (lowerVal.includes("trache")) {
          const oxModBtn = document.querySelector(`#oxMod .select-btn[data-value="Trache"]`);
          if (oxModBtn && !oxModBtn.classList.contains("active")) {
            oxModBtn.click();
          }
        }
      });
    }
    const devInput = $("b_device");
    if (devInput) {
      devInput.addEventListener("input", () => {
        devInput.dataset.manual = "true";
        const val = devInput.value;
        if (!val) return;
        const lowerVal = val.toLowerCase().trim();
        let selectedMode = null;
        let selectedFlow = null;
        let selectedFiO2 = null;
        if (lowerVal === "ra" || lowerVal === "room air") {
          selectedMode = "RA";
        } else if (lowerVal.includes("hfnp") || lowerVal.includes("high flow") || lowerVal.includes("l/") || lowerVal.includes("%")) {
          selectedMode = "HFNP";
          const parts = lowerVal.split("/");
          parts.forEach((p) => {
            if (p.includes("l")) selectedFlow = p.replace("l", "").trim();
            if (p.includes("%")) selectedFiO2 = p.replace("%", "").trim();
          });
        } else if (lowerVal.includes("np") || lowerVal.includes("nasal") || lowerVal.includes("prong")) {
          selectedMode = "NP";
          const flowMatch = val.match(/(\d+)/);
          if (flowMatch) selectedFlow = flowMatch[1];
        } else if (lowerVal.includes("niv")) {
          selectedMode = "NIV";
        } else if (lowerVal.includes("trache")) {
          selectedMode = "Trache";
        }
        if (selectedMode) {
          const oxModBtn = document.querySelector(`#oxMod .select-btn[data-value="${selectedMode}"]`);
          if (oxModBtn && !oxModBtn.classList.contains("active")) {
            oxModBtn.click();
          }
        }
        if (selectedFlow && selectedMode === "NP") {
          const npFlowInput = document.getElementById("npFlow");
          if (npFlowInput) {
            npFlowInput.value = selectedFlow;
            npFlowInput.dispatchEvent(new Event("input"));
          }
        }
        if (selectedMode === "HFNP") {
          if (selectedFlow) {
            const hfnpFlowInput = $("hfnpFlow");
            if (hfnpFlowInput) {
              hfnpFlowInput.value = selectedFlow;
              hfnpFlowInput.dispatchEvent(new Event("input"));
            }
          }
          if (selectedFiO2) {
            const hfnpFio2Input = $("hfnpFio2");
            if (hfnpFio2Input) {
              hfnpFio2Input.value = selectedFiO2;
              hfnpFio2Input.dispatchEvent(new Event("input"));
            }
          }
        }
        const isLowFlowNP = selectedMode === "NP" && selectedFlow && parseFloat(selectedFlow) < 3;
        if (selectedMode && selectedMode !== "RA" && !isLowFlowNP) {
          const respSeg = $("seg_resp_concern");
          const respYes = respSeg?.querySelector('.seg-btn[data-value="true"]');
          if (respYes && !respYes.classList.contains("active")) {
            respYes.click();
            showToast(`Auto-selected Resp Concern (${val})`, 1500);
          }
        }
      });
    }
    document.querySelectorAll('.risk-trigger[data-risk="renal"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const renalSeg = $("seg_renal");
        const yesBtn = renalSeg.querySelector('.seg-btn[data-value="true"]');
        if (yesBtn && !yesBtn.classList.contains("active")) yesBtn.click();
        const btnVal = btn.dataset.value;
        if ((btnVal === "Oliguric" || btnVal.includes("<0.5")) && $("toggle_renal_oliguria").dataset.value === "false") $("toggle_renal_oliguria").click();
        if (btnVal === "Anuric" && $("toggle_renal_anuria").dataset.value === "false") $("toggle_renal_anuria").click();
        if (btnVal === "Dialysis" && $("toggle_renal_dialysis").dataset.value === "false") $("toggle_renal_dialysis").click();
      });
    });
    const tempInput = $("e_temp");
    if (tempInput) {
      tempInput.addEventListener("input", debounce(() => {
        const t = parseFloat(tempInput.value);
        if (!isNaN(t) && t > 38) {
          const infSeg = $("seg_infection");
          const yesBtn = infSeg.querySelector('.seg-btn[data-value="true"]');
          if (yesBtn && !yesBtn.classList.contains("active")) yesBtn.click();
        }
      }, 600));
    }
    const neuroInput = $("d_alert");
    if (neuroInput) {
      neuroInput.addEventListener("input", debounce((e) => {
        const val = e.target.value.toLowerCase();
        const keywords = ["confus", "drows", "agitat", "delirium", "somnolent", "gcs 14", "gcs 13", "gcs 12", "gcs 11", "gcs 10", "gcs 9", "gcs 8"];
        const isGcsLow = (val.match(/gcs\\s*(\\d+)/i)?.[1] || 15) < 15;
        if (keywords.some((k) => val.includes(k)) || isGcsLow) {
          const neuroSeg = $("seg_neuro_gate");
          const yesBtn = neuroSeg.querySelector('.seg-btn[data-value="true"]');
          if (yesBtn && !yesBtn.classList.contains("active")) yesBtn.click();
        }
      }, 800));
    }
    const wobInput = $("b_wob");
    if (wobInput) {
      wobInput.addEventListener("input", debounce(() => {
        const val = wobInput.value.toLowerCase();
        if (/increas|labour|labor/.test(val)) {
          const respSeg = $("seg_resp_concern");
          const respYes = respSeg?.querySelector('.seg-btn[data-value="true"]');
          if (respYes && !respYes.classList.contains("active")) {
            respYes.click();
            showToast("Auto-selected Resp Concern - increased WOB (B)", 1500);
          }
        }
      }, 600));
    }
    const coughInput = $("b_cough");
    if (coughInput) {
      coughInput.addEventListener("input", debounce(() => {
        const val = coughInput.value.toLowerCase();
        if (val.includes("weak") || val.includes("poor") || val.includes("ineffective")) {
          const respSeg = $("seg_resp_concern");
          const respYes = respSeg?.querySelector('.seg-btn[data-value="true"]');
          if (respYes && !respYes.classList.contains("active")) respYes.click();
          const seg = $("seg_resp_poor_cough");
          const yesBtn = seg?.querySelector('.seg-btn[data-value="true"]');
          if (yesBtn && !yesBtn.classList.contains("active")) {
            yesBtn.click();
            showToast("Auto-selected Resp Concern + Poor Cough (B)", 1500);
          }
        }
      }, 600));
    }
    const poorCoughSeg = $("seg_resp_poor_cough");
    if (poorCoughSeg) {
      poorCoughSeg.querySelectorAll(".seg-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const coughEl = $("b_cough");
          if (coughEl && !coughEl.value && btn.dataset.value === "true") {
            coughEl.value = "Weak";
            coughEl.dispatchEvent(new Event("input"));
          }
        });
      });
    }
    const uopInput = $("e_uop");
    if (uopInput) {
      uopInput.addEventListener("input", debounce(() => {
        const val = uopInput.value.toLowerCase();
        if (val.includes("oligur") || val.includes("<0.5") || val.includes("low") || val.includes("decreas")) {
          const renalSeg = $("seg_renal");
          const yesBtn = renalSeg?.querySelector('.seg-btn[data-value="true"]');
          if (yesBtn && !yesBtn.classList.contains("active")) {
            yesBtn.click();
            showToast("Auto-selected Renal Concern (UOP)", 1500);
          }
          const oliguToggle = $("toggle_renal_oliguria");
          if (oliguToggle && oliguToggle.dataset.value === "false") oliguToggle.click();
        }
      }, 600));
    }
    const oliguToggleEl = $("toggle_renal_oliguria");
    if (oliguToggleEl) {
      oliguToggleEl.addEventListener("click", () => {
        setTimeout(() => {
          const uopEl = $("e_uop");
          if (uopEl && !uopEl.value.trim() && oliguToggleEl.dataset.value === "true") {
            uopEl.value = "Oliguric (<0.5ml/kg)";
            uopEl.dispatchEvent(new Event("input"));
          }
        }, 50);
      });
    }
    const anuriaToggleEl = $("toggle_renal_anuria");
    if (anuriaToggleEl) {
      anuriaToggleEl.addEventListener("click", () => {
        setTimeout(() => {
          const uopEl = $("e_uop");
          if (uopEl && !uopEl.value.trim() && anuriaToggleEl.dataset.value === "true") {
            uopEl.value = "Anuric";
            uopEl.dispatchEvent(new Event("input"));
          }
        }, 50);
      });
    }
    document.querySelectorAll(".nav-item").forEach((link) => {
      link.addEventListener("click", (e) => {
        const href = link.getAttribute("href");
        if (href && href.startsWith("#")) {
          const targetId = href.substring(1);
          const targetEl = document.getElementById(targetId);
          if (targetEl && targetEl.classList.contains("accordion-wrapper")) {
            const panel = targetEl.querySelector(".panel");
            if (panel && !panel.classList.contains("open")) {
              setPanelOpen(panel, targetEl.querySelector(".accordion"), true);
            }
          }
        }
      });
    });
    const weightInput = $("ptWeight");
    if (weightInput) {
      weightInput.addEventListener("input", () => {
        const w = parseFloat(weightInput.value);
        const targetEl = $("target_uop_display");
        if (w && !isNaN(w)) {
          const target = (w * 0.5).toFixed(1);
          targetEl.textContent = `Target: >${target} ml/hr`;
          targetEl.style.display = "block";
        } else {
          targetEl.style.display = "none";
        }
      });
    }
    document.querySelectorAll(".time-set-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const time = btn.dataset.time;
        const input = $("pressor_ceased_time");
        if (input) {
          input.value = time;
          input.dispatchEvent(new Event("input"));
        }
      });
    });
    $("pressor_ceased_time")?.addEventListener("input", compute);
    $("pressor_recent_other_note")?.addEventListener("input", compute);
    $("pressor_current_other_note")?.addEventListener("input", compute);
    const fluidInput = $("e_fluid");
    const oedemaToggle = $("toggle_renal_oedema");
    const dehydratedToggle = $("toggle_renal_dehydrated");
    if (fluidInput && oedemaToggle && dehydratedToggle) {
      fluidInput.addEventListener("input", () => {
        const val = fluidInput.value.toLowerCase();
        if (val.includes("oedema") && oedemaToggle.dataset.value === "false") {
          oedemaToggle.click();
        } else if (!val.includes("oedema") && oedemaToggle.dataset.value === "true") {
          oedemaToggle.click();
        }
        if (val.includes("dehydrated") && dehydratedToggle.dataset.value === "false") {
          dehydratedToggle.click();
        } else if (!val.includes("dehydrated") && dehydratedToggle.dataset.value === "true") {
          dehydratedToggle.click();
        }
      });
      [oedemaToggle, dehydratedToggle].forEach((toggle) => {
        toggle.addEventListener("click", () => {
          setTimeout(() => {
            const oedema = oedemaToggle.dataset.value === "true";
            const dehydrated = dehydratedToggle.dataset.value === "true";
            if (oedema && dehydrated) {
              fluidInput.value = "Oedema + Dehydrated";
            } else if (oedema) {
              fluidInput.value = "Oedema";
            } else if (dehydrated) {
              fluidInput.value = "Dehydrated";
            } else {
              fluidInput.value = "Euvolaemic";
            }
            fluidInput.dispatchEvent(new Event("input"));
          }, 50);
        });
      });
    }
    const alreadyStacked = (current, val) => current.toLowerCase().includes(val.toLowerCase());
    document.querySelectorAll(".quick-select").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (btn.classList.contains("risk-trigger") || btn.classList.contains("safe-trigger")) {
          const targetId2 = btn.dataset.target;
          const target = $(targetId2);
          if (target) {
            if (btn.dataset.stack === "true") {
              const current = target.value;
              if (!alreadyStacked(current, btn.dataset.value)) target.value = current ? `${current}, ${btn.dataset.value}` : btn.dataset.value;
            } else {
              target.value = btn.dataset.value;
            }
            target.dispatchEvent(new Event("input"));
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
            } else {
              target.value = val;
            }
            target.dispatchEvent(new Event("input"));
            if (targetId === "lactate_trend") {
              document.querySelectorAll('.quick-select[data-target="lactate_trend"]').forEach((b) => b.classList.remove("active"));
              btn.classList.add("active");
            }
            if (targetId === "dyspneaConcern") {
              document.querySelectorAll('.quick-select[data-target="dyspneaConcern"]').forEach((b) => b.classList.remove("active"));
              btn.classList.add("active");
            }
            if (btn.id === "btn_fluid_restrict") {
              const frWrapper = $("fluid_restriction_wrapper");
              if (frWrapper) {
                frWrapper.style.display = target.value.includes("Fluid Restriction") ? "block" : "none";
              }
            }
            compute();
          }
        } else if (btn.id === "btn_bo" || btn.id === "btn_bno") {
          const other = btn.id === "btn_bno" ? $("btn_bo") : $("btn_bno");
          const isActive = btn.classList.contains("active");
          if (isActive) {
            btn.classList.remove("active");
            toggleBowelDate(null);
          } else {
            btn.classList.add("active");
            other.classList.remove("active");
            toggleBowelDate(btn.id);
          }
          compute();
        }
      });
    });
    function setDateInput(id, offsetDays) {
      const d = /* @__PURE__ */ new Date();
      d.setDate(d.getDate() + offsetDays);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const val = `${year}-${month}-${day}`;
      const el = $(id);
      if (el) {
        el.value = val;
        el.dispatchEvent(new Event("input"));
        compute();
      }
    }
    $("btn_stepdown_today")?.addEventListener("click", () => setDateInput("stepdownDate", 0));
    $("btn_stepdown_yesterday")?.addEventListener("click", () => setDateInput("stepdownDate", -1));
    $("btn_bowel_today")?.addEventListener("click", () => setDateInput("bowel_date", 0));
    $("btn_bowel_yesterday")?.addEventListener("click", () => setDateInput("bowel_date", -1));
    document.querySelectorAll(".segmented-group").forEach((group) => {
      group.querySelectorAll(".seg-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          group.dataset.manual = "true";
          const val = btn.dataset.value;
          const id = group.id.replace("seg_", "");
          const wasActive = btn.classList.contains("active");
          group.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
          if (wasActive) {
            handleSegmentClick(id, null);
          } else {
            btn.classList.add("active");
            handleSegmentClick(id, val);
          }
          saveState(true);
          computeAll();
          checkBloodRanges();
        });
      });
    });
    document.querySelectorAll(".toggle-label").forEach((el) => {
      if ([
        "toggle_resp_tachypnea",
        "toggle_resp_rapid_wean",
        "toggle_resp_poor_cough",
        "toggle_resp_poor_swallow"
      ].includes(el.id)) return;
      el.addEventListener("click", () => {
        const isOn = el.dataset.value === "true";
        el.dataset.value = isOn ? "false" : "true";
        el.classList.toggle("active", !isOn);
        if (el.id === "toggle_comorb_other") $("comorb_other_note_wrapper").style.display = !isOn ? "block" : "none";
        if (el.id === "toggle_pressor_recent_other") $("pressor_recent_other_note_wrapper").style.display = !isOn ? "block" : "none";
        if (el.id === "toggle_pressor_current_other") $("pressor_current_other_note_wrapper").style.display = !isOn ? "block" : "none";
        if (el.id === "toggle_renal_dialysis") {
          $("dialysis_type_wrapper").style.display = !isOn ? "block" : "none";
        }
        if (el.id === "toggle_renal_dialysis") {
          const comorb = $("toggle_comorb_dialysis");
          if (comorb && comorb.dataset.value !== el.dataset.value) {
            comorb.click();
          }
        }
        if (el.id === "toggle_comorb_dialysis") {
          const renal = $("toggle_renal_dialysis");
          if (renal && renal.dataset.value !== el.dataset.value) {
            renal.click();
          }
        }
        if (el.id.startsWith("toggle_comorb_")) {
          syncComorbsToPMH();
        }
        saveState(true);
        computeAll();
        checkBloodRanges();
      });
    });
    document.querySelectorAll(".button-group").forEach((group) => {
      group.querySelectorAll(".select-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          group.querySelectorAll(".select-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          if (["oxMod", "tracheType", "tracheStatus"].includes(group.id)) {
            const devEl = $("b_device");
            if (devEl) devEl.dataset.manual = "false";
            const airwayEl = $("airway_a");
            if (airwayEl) airwayEl.dataset.manual = "false";
            const oxModActive = document.querySelector("#oxMod .select-btn.active")?.dataset.value;
            if (oxModActive === "Trache") {
              const container = $("devices-container");
              if (container) {
                const type = document.querySelector("#tracheType .select-btn.active")?.dataset.value || "Tracheostomy";
                const status = document.querySelector("#tracheStatus .select-btn.active")?.dataset.value || "Stable";
                const details = status === "New" ? `${type} (New)` : type;
                if (type === "Laryngectomy") {
                  const existingLary = Array.from(container.querySelectorAll('.device-entry[data-type="Other Device"]')).find((el) => el.querySelector(".device-textarea")?.value.toLowerCase().includes("lary"));
                  if (!existingLary) {
                    createDeviceEntry("Other Device", details);
                  } else {
                    const area = existingLary.querySelector(".device-textarea");
                    if (area && !area.value.includes("-")) {
                      area.value = details;
                    }
                  }
                  const tracheEntry = container.querySelector('.device-entry[data-type="Tracheostomy"]');
                  if (tracheEntry) tracheEntry.remove();
                } else {
                  const existingTrache = container.querySelector('.device-entry[data-type="Tracheostomy"]');
                  if (!existingTrache) {
                    createDeviceEntry("Tracheostomy", details);
                  } else {
                    const area = existingTrache.querySelector(".device-textarea");
                    if (area && !area.value.includes("-")) {
                      area.value = details;
                    }
                  }
                  const existingLary = Array.from(container.querySelectorAll('.device-entry[data-type="Other Device"]')).find((el) => el.querySelector(".device-textarea")?.value.toLowerCase().includes("lary"));
                  if (existingLary) existingLary.remove();
                }
              }
            } else {
              const container = $("devices-container");
              if (container) {
                const tracheEntry = container.querySelector('.device-entry[data-type="Tracheostomy"]');
                if (tracheEntry) tracheEntry.remove();
                const existingLary = Array.from(container.querySelectorAll('.device-entry[data-type="Other Device"]')).find((el) => el.querySelector(".device-textarea")?.value.toLowerCase().includes("lary"));
                if (existingLary) existingLary.remove();
              }
            }
            toggleOxyFields();
          }
          if (group.id === "neuroType") $("neuro_gate_content").style.display = "block";
          saveState(true);
          computeAll();
          checkBloodRanges();
        });
      });
    });
    staticInputs.forEach((id) => {
      const el = $(id);
      if (el) {
        el.addEventListener("input", () => {
          if (["stepdownTime", "stepdownDate", "reviewTime"].includes(id)) {
            const ah = $("seg_after_hours");
            if (ah) ah.dataset.manual = "false";
          }
          compute();
        });
      }
    });
    $("bowel_date")?.addEventListener("change", compute);
    $("stepdownDate")?.addEventListener("change", compute);
    $("btn_age_mitigated")?.addEventListener("click", () => {
      const seg = $("seg_age_mitigated");
      if (seg) {
        const activeBtn = seg.querySelector(".seg-btn.active");
        const isMitigated = activeBtn ? activeBtn.dataset.value === "true" : false;
        const newValStr = !isMitigated ? "true" : "false";
        seg.querySelectorAll(".seg-btn").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.value === newValStr);
        });
        handleSegmentClick("age_mitigated", newValStr);
      }
      compute();
    });
    $("age_mitigate_reason")?.addEventListener("input", compute);
    $("btn_los_mitigated")?.addEventListener("click", () => {
      const seg = $("seg_los_mitigated");
      if (seg) {
        const activeBtn = seg.querySelector(".seg-btn.active");
        const isMitigated = activeBtn ? activeBtn.dataset.value === "true" : false;
        const newValStr = !isMitigated ? "true" : "false";
        seg.querySelectorAll(".seg-btn").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.value === newValStr);
        });
        handleSegmentClick("los_mitigated", newValStr);
      }
      compute();
    });
    $("los_mitigate_reason")?.addEventListener("input", compute);
    document.addEventListener("click", (e) => {
      if (e.target?.id !== "btnAcceptDowntrend") return;
      e.preventDefault();
      const yes = document.querySelector('#seg_infection_downtrend .seg-btn[data-value="true"]');
      if (yes && !yes.classList.contains("active")) yes.click();
    });
    $("chk_use_mods")?.addEventListener("change", () => {
      const manual = $("addsManual")?.value === "true";
      if ($("chk_use_mods").checked !== manual) setAddsOverride(!manual);
      compute();
    });
    $("chk_aperients")?.addEventListener("change", compute);
    $("chk_bloods_nil_sig")?.addEventListener("change", (e) => {
      const bloodsGrid = document.querySelector(".bloods-grid");
      if (bloodsGrid) bloodsGrid.style.display = e.target.checked ? "none" : "";
      compute();
    });
    $("chk_unknown_blo_date")?.addEventListener("change", () => {
      handleUnknownBLODate();
      compute();
    });
    $("comorb_other_note")?.addEventListener("input", compute);
    $("comorb_other_note")?.addEventListener("blur", () => {
      const toggle = $("toggle_comorb_other");
      if (toggle && toggle.dataset.value === "true") syncComorbsToPMH();
    });
    $("chk_discharge_alert")?.addEventListener("change", () => {
      const dischargeChk = $("chk_discharge_alert");
      const continueChk = $("chk_continue_alert");
      const pendingChk = $("chk_discharge_pending_bloods");
      const wrapper = $("discharge_pending_bloods_note_wrapper");
      if (dischargeChk && dischargeChk.checked) {
        if (!window.dischargeConfirmed) {
          dischargeChk.checked = false;
          window.openDischargeConfirm("full");
          return;
        }
        if (continueChk) {
          continueChk.checked = false;
        }
        if (pendingChk) {
          pendingChk.checked = false;
        }
        if (wrapper) {
          wrapper.style.display = "none";
        }
      }
      compute();
    });
    $("chk_discharge_pending_bloods")?.addEventListener("change", () => {
      const pendingChk = $("chk_discharge_pending_bloods");
      const dischargeChk = $("chk_discharge_alert");
      const continueChk = $("chk_continue_alert");
      const wrapper = $("discharge_pending_bloods_note_wrapper");
      if (pendingChk && pendingChk.checked) {
        if (!window.dischargeConfirmed) {
          pendingChk.checked = false;
          window.openDischargeConfirm("pending");
          return;
        }
        if (dischargeChk) dischargeChk.checked = false;
        if (continueChk) continueChk.checked = false;
        if (wrapper) wrapper.style.display = "block";
      } else {
        if (wrapper) wrapper.style.display = "none";
      }
      compute();
    });
    $("chk_continue_alert")?.addEventListener("change", () => {
      const continueChk = $("chk_continue_alert");
      const dischargeChk = $("chk_discharge_alert");
      const pendingChk = $("chk_discharge_pending_bloods");
      const wrapper = $("discharge_pending_bloods_note_wrapper");
      const disPrompt = $("discharge_prompt");
      if (continueChk && continueChk.checked) {
        if (dischargeChk) dischargeChk.checked = false;
        if (pendingChk) pendingChk.checked = false;
        if (wrapper) wrapper.style.display = "none";
        if (disPrompt && disPrompt.style.display !== "none") {
          window.dismissedDischarge = true;
        }
      }
      compute();
    });
    $("chk_medical_rounding")?.addEventListener("change", () => {
      const preCheckbox = $("chk_medical_rounding_pre");
      if (preCheckbox) preCheckbox.checked = $("chk_medical_rounding").checked;
      compute();
    });
    $("chk_medical_rounding_pre")?.addEventListener("change", () => {
      const mainCheckbox = $("chk_medical_rounding");
      if (mainCheckbox) mainCheckbox.checked = $("chk_medical_rounding_pre").checked;
      compute();
    });
    document.querySelectorAll('input[name="reviewModeType"]').forEach((r) => r.addEventListener("change", compute));
    document.querySelectorAll('input[name="clinicianGrade"]').forEach((r) => r.addEventListener("change", compute));
    document.querySelectorAll('input[name="reviewTeam"]').forEach((r) => r.addEventListener("change", () => {
      updateReviewerRoleVisibility();
      compute();
    }));
    document.querySelectorAll('input[name="reviewType"]').forEach((r) => r.addEventListener("change", () => {
      updateWardOptions();
      toggleInfusionsBox();
      updateReviewTypeVisibility();
      compute();
    }));
    $("ptWard")?.addEventListener("change", () => {
      updateWardOtherVisibility();
      compute();
    });
    $("clearDataBtnTop")?.addEventListener("click", () => showClearDataModal());
    $("footerClear")?.addEventListener("click", () => showClearDataModal());
    $("closeClearModal")?.addEventListener("click", hideClearDataModal);
    $("confirmClearData")?.addEventListener("click", () => {
      hideClearDataModal();
      clearData();
    });
    $("btnQuickCopySummary")?.addEventListener("click", () => {
      const text = $("summary").value;
      if (!text) {
        showToast("Summary is empty", 1500);
        return;
      }
      markCopiedOnExit();
      navigator.clipboard.writeText(text).then(() => showToast("\u2713 Copied to clipboard", 1500));
    });
    $("btnQuickReview")?.addEventListener("click", enableQuickReviewMode);
    $("btnFullReview")?.addEventListener("click", () => {
      setQuickReviewDismissed(true);
      const prompt = $("quickReviewPrompt");
      if (prompt) prompt.style.display = "none";
    });
    $("btnExitQuickReview")?.addEventListener("click", exitQuickReviewMode);
    document.querySelectorAll('input[name="reviewDepth"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        if (radio.value === "quick" && !isQuickReviewMode) {
          setQuickReviewDismissed(false);
          enableQuickReviewMode();
        } else if (radio.value === "full" && isQuickReviewMode) exitQuickReviewMode();
      });
    });
    const toggleBloodsDetails = () => {
      const panel = $("panel_bloods");
      const isOpen = panel?.classList.contains("open");
      if (isOpen) closeAccordion("panel_bloods", '[aria-controls="panel_bloods"]');
      else openAccordion("panel_bloods", '[aria-controls="panel_bloods"]');
      setBloodsOverlay(!isOpen);
    };
    $("btnBloodsDetailsToggle")?.addEventListener("click", toggleBloodsDetails);
    $("qrBackdrop")?.addEventListener("click", closeQuickOverlays);
    document.querySelectorAll("[data-qr-close]").forEach((btn) => {
      btn.addEventListener("click", closeQuickOverlays);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.querySelector(".qr-expanded")) closeQuickOverlays();
    });
    $("floatingNavBtn")?.addEventListener("click", openMobileNav);
    $("closeMobileNav")?.addEventListener("click", closeMobileNav);
    $("mobileNavOverlay")?.addEventListener("click", (e) => {
      if (e.target.id === "mobileNavOverlay") closeMobileNav();
    });
    document.querySelectorAll(".mobile-nav-link").forEach((link) => {
      link.addEventListener("click", closeMobileNav);
    });
    $("footerCopy")?.addEventListener("click", () => {
      const text = $("summary").value;
      if (!text) {
        showToast("Nothing to copy", 1500);
        return;
      }
      navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard", 1500));
    });
    $("btnCopySummaryMain")?.addEventListener("click", () => {
      const text = $("summary").value;
      if (!text) {
        showToast("Nothing to copy", 1500);
        return;
      }
      navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard", 1500));
    });
    $("btnUseSameBloods")?.addEventListener("click", () => {
      const blMap = {
        "lac_review": "bl_lac_review",
        "hb": "bl_hb",
        "wcc": "bl_wcc",
        "cr_review": "bl_cr_review",
        "k": "bl_k",
        "na": "bl_na",
        "mg": "bl_mg",
        "phos": "bl_phos",
        "plts": "bl_plts",
        "alb": "bl_alb",
        "neut": "bl_neut",
        "lymph": "bl_lymph",
        "crp": "bl_crp",
        "bili": "bl_bili",
        "alt": "bl_alt",
        "inr": "bl_inr",
        "aptt": "bl_aptt"
      };
      if (window.prevBloods) {
        let count = 0;
        Object.keys(window.prevBloods).forEach((key) => {
          const targetId = blMap[key];
          const val = window.prevBloods[key];
          if (targetId && val && $(targetId)) {
            $(targetId).value = val;
            $(targetId).classList.add("scraped-data");
            count++;
          }
        });
        if (count > 0) {
          const ev = new Event("input");
          Object.values(blMap).forEach((id) => $(id)?.dispatchEvent(ev));
          showToast(`Filled ${count} fields`, 1500);
        } else {
          showToast("No previous bloods found", 1500);
        }
      }
    });
    $("btnClearCurrentBloods")?.addEventListener("click", () => {
      const bloodFields = [
        "bl_lac_review",
        "bl_hb",
        "bl_wcc",
        "bl_crp",
        "bl_cr_review",
        "bl_egfr",
        "bl_k",
        "bl_na",
        "bl_mg",
        "bl_phos",
        "bl_plts",
        "bl_alb",
        "bl_neut",
        "bl_lymph",
        "bl_bili",
        "bl_alt",
        "bl_inr",
        "bl_aptt"
      ];
      let count = 0;
      bloodFields.forEach((id) => {
        const field = $(id);
        if (field && field.value) {
          field.value = "";
          field.classList.remove("scraped-data");
          count++;
        }
      });
      document.querySelectorAll(".trend-buttons .trend-btn.active").forEach((btn) => {
        btn.classList.remove("active");
      });
      if (count > 0) {
        compute();
        showToast(`Cleared ${count} blood result${count > 1 ? "s" : ""}`, 1500);
      } else {
        showToast("No blood results to clear", 1500);
      }
    });
    $("btnClearPreviousBloods")?.addEventListener("click", () => {
      const prevLabels = [
        "prev_bl_lac_review",
        "prev_bl_hb",
        "prev_bl_wcc",
        "prev_bl_crp",
        "prev_bl_cr_review",
        "prev_bl_egfr",
        "prev_bl_k",
        "prev_bl_na",
        "prev_bl_mg",
        "prev_bl_phos",
        "prev_bl_plts",
        "prev_bl_alb",
        "prev_bl_neut",
        "prev_bl_lymph",
        "prev_bl_bili",
        "prev_bl_alt",
        "prev_bl_inr",
        "prev_bl_aptt"
      ];
      let count = 0;
      prevLabels.forEach((id) => {
        const label = $(id);
        if (label && label.textContent.trim()) {
          label.textContent = "";
          count++;
        }
      });
      window.prevBloods = {};
      if (count > 0) {
        compute();
        showToast(`Cleared ${count} previous blood result${count > 1 ? "s" : ""}`, 1500);
      } else {
        showToast("No previous blood results to clear", 1500);
      }
    });
    document.querySelectorAll(".trend-buttons").forEach((group) => {
      ["\u2191", "\u2193", "\u2192"].forEach((t) => {
        const btn = document.createElement("button");
        btn.className = "trend-btn";
        btn.textContent = t;
        btn.dataset.value = t;
        btn.setAttribute("tabindex", "-1");
        btn.addEventListener("click", () => {
          const was = btn.classList.contains("active");
          group.querySelectorAll(".trend-btn").forEach((b) => b.classList.remove("active"));
          if (!was) btn.classList.add("active");
          group.dataset.manual = "true";
          compute();
        });
        group.appendChild(btn);
      });
    });
    document.querySelectorAll(".accordion-wrapper").forEach((w) => {
      w.querySelector(".accordion").addEventListener("click", () => {
        const panel = w.querySelector(".panel");
        const isOpen = panel.classList.contains("open");
        setPanelOpen(panel, w.querySelector(".accordion"), !isOpen);
        const map = JSON.parse(sessionStorage.getItem(ACCORDION_KEY) || "{}");
        map[w.dataset.accordionId] = !isOpen;
        sessionStorage.setItem(ACCORDION_KEY, JSON.stringify(map));
        if (w.id === "section-bloods") setBloodsOverlay(!isOpen);
      });
    });
    document.querySelectorAll(".btn[data-device-type]").forEach((btn) => {
      btn.addEventListener("click", () => {
        createDeviceEntry(btn.dataset.deviceType);
        updateDevicesSectionVisibility();
        computeAll();
      });
    });
    const CATEGORY_CHOICES = ["red", "amber", "green"];
    const setCategoryChoice = (choice) => {
      $("override").value = choice;
      compute();
      if (choice !== "none") $("overrideNote")?.focus();
    };
    CATEGORY_CHOICES.forEach((t) => {
      $(`override_${t}`)?.addEventListener("click", () => {
        const isActive = $(`override_${t}`).classList.contains("active");
        setCategoryChoice(isActive ? "none" : t);
      });
    });
    $("override_clear")?.addEventListener("click", () => setCategoryChoice("none"));
    $("btnAddsOverride")?.addEventListener("click", () => {
      toggleAddsOverride();
      compute();
    });
    $("adds")?.addEventListener("input", refreshAddsOverrideUI);
    $("addsOverrideNote")?.addEventListener("input", refreshAddsOverrideUI);
    $("mods_score")?.addEventListener("input", () => {
      if ($("addsManual")?.value !== "true") return;
      const adds = $("adds");
      if (adds && adds.value !== $("mods_score").value) {
        adds.value = $("mods_score").value;
        adds.dispatchEvent(new Event("input"));
      }
    });
    $("mods_details")?.addEventListener("input", () => {
      if ($("addsManual")?.value !== "true") return;
      const note = $("addsOverrideNote");
      if (note) note.value = $("mods_details").value;
      compute();
    });
    $("btnDeviceMore")?.addEventListener("click", (e) => {
      const group = document.querySelector(".device-add-group");
      if (!group) return;
      const showAll = group.classList.toggle("show-all");
      e.currentTarget.textContent = showAll ? "Fewer \u25B4" : "More \u25BE";
      e.currentTarget.setAttribute("aria-expanded", String(showAll));
    });
    updateWardOptions();
    const saved = loadState();
    if (saved) restoreState(saved);
    updateAgeMitigationUI();
    updateLosMitigationUI();
    refreshAddsOverrideUI();
    refreshDetailToggleState();
    updateReviewTypeVisibility();
    const accMap = JSON.parse(sessionStorage.getItem(ACCORDION_KEY) || "{}");
    document.querySelectorAll(".accordion-wrapper").forEach((w) => {
      if (accMap[w.dataset.accordionId]) setPanelOpen(w.querySelector(".panel"), w.querySelector(".accordion"), true);
    });
    compute();
    checkBloodRanges();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
//# sourceMappingURL=bundle.js.map
