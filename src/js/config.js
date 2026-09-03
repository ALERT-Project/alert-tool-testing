/* =========================================
   ALERT Nursing Risk Assessment Tool
   Configuration: field registries, reference ranges, display labels
   Copyright © 2025-2026 Casey Bond
   MIT License - https://opensource.org/licenses/MIT
   ========================================= */

export const STORAGE_KEY = 'alertToolData_v7_7';
export const ACCORDION_KEY = 'alertToolAccordions_v7_7';
export const UNDO_KEY = 'alertToolUndo_v7_7';

// Bloods that actually feed a risk gate: Cr -> renal, WCC/CRP/Neut/Lymph -> infection,
// K/Na/Mg/PO4 -> electrolytes, lactate -> its own rule. Everything else still highlights in
// the grid when out of range, but staging it as an issue was noise rather than signal.
// (Mg and PO4 are listed for visibility; the electrolyte rule itself still tests only K and Na.)
// aptt is listed so a deranged clotting time on a heparin infusion appears at all - it
// previously had no rule anywhere in the tool, so an APTT of 110 produced nothing.
export const GATE_LINKED_BLOODS = ['cr_review', 'wcc', 'crp', 'neut', 'lymph', 'k', 'na', 'mg', 'phos', 'lac_review', 'aptt'];

// Display names for blood keys - "Abnormal CR 180" reads as shouting, and the handover line
// inherits the same text.
export const BLOOD_LABELS = {
    wcc: 'WCC', crp: 'CRP', neut: 'Neut', lymph: 'Lymph', hb: 'Hb', plts: 'Plts',
    k: 'K+', na: 'Na', cr_review: 'Cr', egfr: 'eGFR', mg: 'Mg', alb: 'Alb',
    lac_review: 'Lactate', phos: 'PO4', bili: 'Bili', alt: 'ALT', inr: 'INR',
    aptt: 'APTT', bsl: 'BSL'
};

// The bloods the DMR note actually writes down, in the order it writes them. Not the same set
// as BLOOD_LABELS, which names every result the rules can read and includes BSL - a value the
// note has never printed. Lifted out of summary.js so the Quick Review chip counts from the
// note's own list: a chip that says "6 results entered" beside a note that prints five is
// worse than no chip, and one shared map is the only way the two cannot drift.
export const NOTE_BLOOD_LABELS = {
    lac_review: 'Lac', hb: 'Hb', wcc: 'WCC', crp: 'CRP', cr_review: 'Cr', egfr: 'eGFR',
    k: 'K', na: 'Na', mg: 'Mg', phos: 'PO4', plts: 'Plts', alb: 'Alb', neut: 'Neut',
    lymph: 'Lymph', bili: 'Bili', alt: 'ALT', inr: 'INR', aptt: 'APTT'
};

export const normalRanges = {
    wcc: { low: 4, high: 11 },
    crp: { low: 0, high: 5 },
    neut: { low: 1.5, high: 7.5 },
    lymph: { low: 1.0, high: 4.0 },
    hb: { low: 115, high: 165 },
    plts: { low: 150, high: 400 },
    k: { low: 3.5, high: 5.2 },
    na: { low: 135, high: 145 },
    cr_review: { low: 50, high: 98 },
    egfr: { low: 60, high: 120 },
    mg: { low: 0.7, high: 1.1 },
    alb: { low: 35, high: 50 },
    lac_review: { low: 0.5, high: 2.0 },
    phos: { low: 0.8, high: 1.5 },
    bili: { low: 0, high: 20 },
    alt: { low: 0, high: 40 },
    inr: { low: 0.9, high: 1.2 },
    aptt: { low: 25, high: 38 },
    bsl: { low: 4.0, high: 15.0 }
};

export const comorbMap = {
    'comorb_copd': 'COPD',
    'comorb_asthma': 'Asthma',
    'comorb_hf': 'Active Heart Failure',
    'comorb_esrd': 'ESRD',
    'comorb_dialysis': 'Dialysis',
    'comorb_diabetes': 'Diabetes',
    'comorb_cirrhosis': 'Cirrhosis',
    'comorb_malignancy': 'Active malignancy',
    'comorb_immuno': 'Immunosuppression',
    'comorb_other': 'Other'
};

export const staticInputs = [
    'reviewTime', 'reviewerInitials', 'quickNotes', 'ptName', 'ptMrn', 'ptAge', 'ptWeight', 'ptWard', 'ptBed', 'spo2_target', 'ptWardOther', 'ptAdmissionReason', 'icuSummary', 'icuLos', 'stepdownDate', 'stepdownTime',
    'npFlow', 'hfnpFio2', 'hfnpFlow', 'nivFio2', 'nivPeep', 'nivPs', 'override', 'overrideNote', 'addsManual', 'addsOverrideNote',
    'trache_details_note', 'mods_score', 'mods_details', 'airway_a', 'a_comment', 'b_rr', 'b_spo2', 'b_device', 'b_wob', 'b_cough', 'b_comment',
    'c_hr', 'c_hr_rhythm', 'c_nibp', 'c_cr', 'c_perf', 'c_comment', 'd_alert', 'd_pain', 'd_comment', 'e_temp', 'e_bsl', 'e_fluid', 'e_uop', 'e_comment', 'atoe_adds',
    'ae_mobility', 'ae_diet', 'ae_bowels', 'bowel_date',
    'bl_wcc', 'bl_crp', 'bl_neut', 'bl_lymph', 'bl_hb', 'bl_plts', 'bl_k', 'bl_na',
    'bl_cr_review', 'bl_mg', 'bl_alb', 'bl_lac_review', 'bl_phos',
    'bl_bili', 'bl_alt', 'bl_inr', 'bl_aptt', 'bl_egfr', 'inr_target', 'aptt_target',
    'bloods_date', 'bloods_time', 'anticoag_note',
    'elec_replace_note', 'goc_note', 'allergies_note', 'pics_note', 'context_other_note', 'pmh_note',
    'adds', 'wcc', 'crp', 'neut', 'lymph', 'infusions_note',
    'dyspneaConcern', 'dyspneaConcern_note', 'renal_note', 'infection_note',
    'electrolyteConcern_note', 'neuroType_note', 'nutrition_context_note', 'pain_context_note', 'neuro_psych_note', 'sleep_quality_note', 'fluid_restriction_amount',
    'after_hours_note', 'pressors_note', 'immobility_note', 'comorb_other_note',
    'unsuitable_note', 'pressor_ceased_time', 'pressor_recent_other_note', 'pressor_current_other_note', 'hac_note', 'discharge_pending_bloods_note',
    'age_mitigate_reason', 'los_mitigate_reason', 'frailty_note'
];

export const segmentedInputs = [
    'bloods_status',
    'after_hours', 'hist_o2', 'intubated',
    'resp_concern', 'renal', 'immobility', 'infection', 'new_bloods_ordered',
    'neuro_gate', 'nutrition_adequate', 'electrolyte_gate', 'pressors', 'hac',
    'stepdown_suitable', 'comorbs_gate',
    'renal_chronic', 'renal_chronic_bloods',
    'infection_downtrend', 'infection_downtrend_bloods',
    'sleep_quality', 'pain_control', 'neuro_psych', 'pics',
    'resp_dyspnea', 'resp_tachypnea', 'resp_rapid_wean', 'resp_poor_cough', 'resp_poor_swallow',
    'age_mitigated', 'los_mitigated', 'frailty_known',
    // Only asked when the rhythm reads irregular - see updateRhythmNewVisibility in ui.js.
    'c_hr_rhythm_new'
];

export const toggleInputs = [
    'comorb_copd', 'comorb_asthma', 'comorb_hf', 'comorb_esrd', 'comorb_dialysis',
    'comorb_diabetes', 'comorb_cirrhosis', 'comorb_malignancy', 'comorb_immuno', 'comorb_other',
    'renal_oliguria', 'renal_anuria', 'renal_fluid', 'renal_oedema', 'renal_dysfunction', 'renal_dialysis', 'renal_dehydrated', 'renal_worsening_cr',
    'chk_aperients', 'chk_unknown_blo_date',
    'pressor_recent_norad', 'pressor_recent_met', 'pressor_recent_gtn', 'pressor_recent_dob', 'pressor_recent_mid', 'pressor_recent_other',
    'pressor_current_mid', 'pressor_current_other'
];

// dialysis_type and intubatedReason are .select-btn button-groups, not segmented groups.
// dialysis_type was listed under segmentedInputs, where getState looked for a #seg_dialysis_type
// that does not exist - so it never saved and was lost on every refresh.
export const selectInputs = [
    'oxMod', 'dyspneaConcern', 'neuroConcern', 'neuroType', 'electrolyteConcern',
    'tracheType', 'tracheStatus', 'intubatedReason', 'dialysis_type'
];

export const deviceTypes = ['CVC', 'PICC', 'Other CVAD', 'PIVC', 'Arterial Line', 'Enteral Tube', 'IDC', 'Pacing Wire', 'Drain', 'Wound', 'Vascath', 'Tracheostomy', 'Other Device'];

// What still counts toward the category in Quick Review.
//
// Quick Review has no gates, so most rules have nothing to fire on: the clinician has not been
// asked whether there is a respiratory concern, and yesterday's answer is not today's finding.
// What remains is what the tool can read for itself off numbers that were measured - the
// score, the bloods, and the two demographic facts.
//
// Age and ICU length of stay are in here deliberately. They are as concrete as any blood
// result, they are already on the form, and they carry the same weight in a Quick Review as
// they do in a Full one - an 82-year-old with a twelve-day stay must not compute CAT 3 in one
// mode and CAT 2 in the other.
//
// Everything else waits for a Full Review, or for the clinician to select the category
// themselves, which in Quick Review is the point rather than an override.
export const QUICK_REVIEW_SCORING_IDS = [
    'adds',                 // ADDS / MODS total
    // The parameters the score is calculated from. Each carries its own threshold, and those
    // thresholds are the safety net for exactly the cases the total misses - a single
    // catastrophic parameter inside an otherwise unremarkable score, or a MODS in use. Leaving
    // them out meant SpO2 84%, SBP 82 and HR 135 each computed CAT 3 in Quick Review and CAT 1
    // in Full, which is the worst possible way for two modes to disagree.
    'b_rr', 'b_spo2', 'c_hr', 'c_nibp', 'e_temp',
    // Oxygen delivery: a flow rate and an FiO2 are measured numbers like any other, and a new
    // tracheostomy is a recorded fact rather than a judgement.
    'npFlow', 'oxMod', 'tracheStatus',
    'ptAge', 'icuLos',      // demographics
    'bl_plts', 'bl_lac_review', 'bl_cr_review', 'bl_crp', 'e_bsl',
    'electrolyteConcern',   // fires from K/Na/Mg/PO4 numbers when no gate is set
    'seg_infection',        // fires from WCC/CRP/NLR/temperature when no gate is set
    'override_red', 'override_amber'
];


// Risk lines the tool works out for itself every review, from data that is also carried
// forward. They must never become text entries on a list: the rules are about to produce
// their own copy from today's numbers, and the pair compounds at every subsequent review.
//
// Two groups. The first is derived from the patient's own dates and numbers - age, ICU length
// of stay, the stepdown time. The second is derived from the bloods and the score, which are
// re-evaluated on the spot against today's values; carrying "Infection risk - WCC 16, CRP 180"
// across would state yesterday's markers as today's finding, which is worse than losing it -
// the numbers have usually moved, and often that is the whole story of the review.
//
// Gate-shaped concerns are deliberately absent. In Full Review the gate carries them; in Quick
// Review nothing else would raise them at all, so they do need to travel as text.
export const SELF_DERIVED_RISK = new RegExp([
    'prolonged icu stay', 'deconditioning risk', 'after-hours', '^age \\d',
    '^(elevated )?(adds|mods) \\d', '^lactate \\d', '^(low|high) bsl',
    '^low platelets', '^electrolyte concern', '^infection risk',
    '^worsening cr', '^rising crp'
].join('|'), 'i');


// Patient-factor lines the note writes from an assessment field every review. The importer
// reads them back into those fields, so staging them as list text too would print today's
// answer beside yesterday's - "Mobility: assist x2" under "Mobility: assist x1 with frame" -
// the moment the clinician updated one. Same principle as SELF_DERIVED_RISK, one section over.
export const FIELD_BACKED_FACTOR = /^(mobility|diet|nutrition|post icu syndrome|sleep|psychological issues)\s*:/i;


// The gate control a carried risk was folded into -> the id the rules use for the risk that
// gate produces. They are not the same string for every gate, and releasing a gate needs both:
// the rule id to look up what the gate was scoring, and to recognise when today's data has
// re-derived the same concern and should supersede the carried one.
export const GATE_RISK_ID = {
    seg_resp_concern: 'seg_resp_concern',
    seg_neuro_gate: 'neuroConcern',
    seg_renal: 'seg_renal',
    seg_infection: 'seg_infection',
    seg_electrolyte_gate: 'electrolyteConcern',
    seg_pressors: 'seg_pressors',
    seg_immobility: 'seg_immobility'
};
