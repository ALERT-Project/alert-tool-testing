/* =========================================
   ALERT Tool Plugin: REDCap Accelerator
   Copyright © 2025-2026 Casey Bond
   Part of ALERT Nursing Risk Assessment Tool
   MIT License - https://opensource.org/licenses/MIT
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnRedcap');
    
    // If the button exists, attach the listener
    if (btn) {
        btn.addEventListener('click', openRedcapAccelerator);
        console.log('Plugin loaded: REDCap Accelerator');
    }
});

function openRedcapAccelerator() {
    // --- 1. GATHER DATA ---
    
    // A. Role (CNS vs CN)
    // ALERT only. An ICU reviewer has no honest alert_team code, so the button that gets here
    // is hidden while the team is ICU - this is the same rule stated where it is acted on, in
    // case the button is ever reached another way.
    var teamName = document.querySelector('input[name="reviewTeam"]:checked')?.value || "ALERT";
    if (teamName === "ICU") return;
    var gradeVal = document.querySelector('input[name="clinicianGrade"]:checked')?.value || "CNS";
    var teamCode = (gradeVal === "CN") ? "2" : "1"; // 1=CNS, 2=CN

    // B. Score
    var score = document.getElementById('adds').value || "0";

    // C. Discharge Status
    var isDischarge = document.getElementById('chk_discharge_alert').checked;
    
    // D. Review Type
    var reviewType = document.querySelector('input[name="reviewType"]:checked')?.value || "post";
    var isPreStepdown = (reviewType === 'pre');

    // E. Ward Mapping
    var wardMap = {
        "3A": "1",  "3B": "2",  "3C": "5",  "3D": "3",
        "4A": "6",  "4B": "7",  "4C": "8",  "4D": "9",
        "5A": "10", "5B": "11", "5C": "12", "5D": "13",
        "6A": "14", "6B": "15", "6C": "16", "6D": "17",
        "7A": "18", "7B": "19", "7C": "20", "7D": "21",
        "SRS2A": "59", "SRS1A": "58", "SRSA": "60", "SRSB": "61",
        "ICU Pod 1": "43", "ICU Pod 2": "43", "ICU Pod 3": "43", "ICU Pod 4": "43", 
        "CCU": "30", "HDU": "41", "ED": "36", 
        "Short Stay": "57", "Transit Lounge": "64",
        "Medihotel": "55", 
        "Mental Health": "65" 
    };
    
    var currentWardName = document.getElementById('ptWard').value; 
    var locationCode = wardMap[currentWardName] || ""; 

    // --- 2. CALCULATE DATE & SHIFT ---
    var now = new Date();
    
    var day = ("0" + now.getDate()).slice(-2);
    var month = ("0" + (now.getMonth() + 1)).slice(-2);
    var year = now.getFullYear();
    var dateString = year + "-" + month + "-" + day; 

    // Shift: Time Band Logic
    var currentHour = now.getHours();
    var currentMin = now.getMinutes();
    var decimalTime = currentHour + (currentMin / 60);

    var shiftCode = "3"; // Default Night
    if (decimalTime >= 7.5 && decimalTime < 14.5) {
        shiftCode = "1"; // Day
    } else if (decimalTime >= 14.5 && decimalTime < 20.0) {
        shiftCode = "2"; // Evening
    }

    // --- 3. CATEGORY LOGIC ---
    var catText = document.getElementById('footerScore').innerText || "CAT 3";
    var catCode = "3"; // Default
    if (catText.includes("CAT 1")) { catCode = "1"; }
    else if (catText.includes("CAT 2")) { catCode = "2"; }
    
    // --- 4. BUILD URL PARAMETERS ---
    var params = [];

    // Standard Admin
    params.push("site=1");              // Fiona Stanley
    
    // CONDITIONAL LOGIC FOR CONTACT REASON
    if (isPreStepdown) {
        params.push("contactreason=4"); // Review as Patient of Concern
    } else {
        params.push("contactreason=6"); // ICU Follow Up Post Discharge
    }
    
    params.push("shifttype=" + shiftCode);
    params.push("shift_date=" + dateString);
    params.push("icu_category=" + catCode); 
    
    // Dynamic Admin
    params.push("alert_team=" + teamCode);
    if(locationCode) {
        params.push("location_fs=" + locationCode);
    }
    params.push("adds_score=" + score);

    // CONDITIONAL LOGIC FOR MAIN INTERVENTION
    if (isPreStepdown) {
        params.push("int_group_a___4=1"); // 04 - Review as Patient of Concern
    } else {
        params.push("int_group_a___1=1"); // 01 - ICU follow up post discharge
    }

    // "Always Done" Interventions
    params.push("int_group_a___8=1");  // 08 - Perform A-E
    params.push("int_group_b___19=1"); // 19 - Cognitive assess
    params.push("int_group_c___25=1"); // 25 - Electrolytes
    
    // NEW: Recommend nursing intervention i.e.: Weight
    params.push("int_group_c___28=1"); 

    // Outcome Logic (Discharge vs Continue)
    if (isDischarge) {
        params.push("outcome=1");          // Discharge from ALERT
        params.push("int_group_e___42=1"); // Meets Discharge Criteria
    } else {
        params.push("outcome=3");          // Continue ALERT review
        params.push("int_group_e___41=1"); // ALERT to continue follow up
    }

    // --- 5. LAUNCH ---
    var baseUrl = "https://datalibrary-rc.health.wa.gov.au/surveys/?s=K3WAPC4KKXWNTF3F";
    var finalUrl = baseUrl + "&" + params.join("&");
    window.open(finalUrl, '_blank');
}
