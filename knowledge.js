/* =================================================================
   Bell Diagnostic Coach — knowledge.js
   THE DIAGNOSTIC DOCTRINE. This file is data, not code.
   -----------------------------------------------------------------
   Everything the app "knows" about diagnosing a no-cool call lives
   here. You can edit this file without touching app.js.

   HOW A CONDITION IS SCORED
   1. PATTERN: the five pillars (suction, head, superheat, subcool,
      delta T). Each is "low" | "normal" | "high" | "any", or an
      array like ["normal","high"] meaning either is acceptable.
   2. EVIDENCE: extra field observations (drier temp drop, frost
      location, swinging superheat, amps vs RLA, recent service).
      These add or subtract points and explain themselves to the tech.
   3. WEIGHTS: how much each pillar counts, which differs by metering
      device (see WEIGHTS in app.js).

   The output is always framed as a DIRECTION TO CONFIRM. Nothing in
   here should ever tell a tech a part is definitively bad.
   ================================================================= */

/* -----------------------------------------------------------------
   EVIDENCE VOCABULARY (values the app collects)
   drierDrop    : "Yes" | "No" | "Not checked"   (>3°F drop across drier)
   frostLoc     : "None" | "Filter drier" | "Liquid line / kink"
                  | "Metering device" | "Suction line / evap coil" | "Not checked"
   shSwinging   : "Yes" | "No" | "Not checked"
   ampStatus    : "low" | "normal" | "high" | "unknown"  (vs nameplate RLA)
   recentService: "Yes" | "No" | "Not checked"  (opened/evacuated/recharged)
   condClean    : true when condenser coil is clean AND fan confirmed running
   airflowOK    : true when filter, evap coil, and blower all verified good
   ----------------------------------------------------------------- */

const KNOWLEDGE = {

  // ============ UNDERCHARGE ============
  undercharge: {
  tier: 3,
  firstStep: "Leak search first, then weigh in to the data-plate charge and re-check subcooling.",
    name: "Undercharge / low refrigerant",
    metering: ["txv", "fixed"],
    pattern: { sp: "low", hp: "low", sh: "high", sc: "low", dt: "low" },
    key: "LOW subcooling with low head. A restriction or clogged piston holds subcool normal or high.",
    text: "Points to low refrigerant charge or a leak. The evaporator is starved because there isn't enough refrigerant in the system.",
    warning: "Possible undercharge. Verify indoor airflow, filter condition, blower operation, evaporator coil condition, outdoor airflow, metering device type, and that the coil is not frozen before adding refrigerant. Confirm with proper superheat/subcooling readings and a leak evaluation.",
    evidence: [
      { when: (e) => e.drierDrop === "No", delta: +1.5, why: "No temperature drop across the drier — argues against a restriction" },
      { when: (e) => e.drierDrop === "Yes", delta: -2.5, why: "Temperature drop across the drier points to a restriction instead" },
      { when: (e) => e.frostLoc === "Filter drier" || e.frostLoc === "Liquid line / kink", delta: -2, why: "Frost at the liquid line points to a restriction instead" },
      { when: (e) => e.ampStatus === "low", delta: +1, why: "Low amp draw fits a compressor moving less refrigerant" },
      { when: (e) => e.airflowOK, delta: +1, why: "Airflow verified, so these readings can be trusted" }
    ],
    mistakenFor: ["Liquid line restriction", "Clogged piston", "TXV underfeeding", "Dirty filter or evaporator coil", "Blower not moving enough air", "Frozen evaporator coil", "System not stabilized long enough"]
  },

  // ============ OVERCHARGE ============
  overcharge: {
  tier: 3,
  firstStep: "Recover refrigerant to the data-plate subcooling, then re-check.",
    name: "Overcharge",
    metering: ["txv", "fixed"],
    // Superheat may read NORMAL on a TXV — the valve holds it, hiding the overcharge.
    // Confirmed by a real job: 8.5°F SH, 67.5°F SC, 610 psig, 2.5 lb removed.
    pattern: { sp: ["normal", "high"], hp: "high", sh: ["low", "normal"], sc: "high", dt: ["low", "normal"] },
    key: "HIGH subcooling with high head. On a TXV the superheat can look perfectly normal — judge charge by subcooling.",
    text: "Points to too much refrigerant. Excess refrigerant takes up condenser volume, so the system rejects heat poorly.",
    warning: "Possible overcharge. Verify outdoor airflow, condenser coil cleanliness, condenser fan operation, metering device type, indoor airflow, and manufacturer charging method before removing refrigerant. Do not diagnose overcharge based on pressure alone.",
    evidence: [
      { when: (e) => e.condClean, delta: +2, why: "Condenser confirmed clean with the fan running — rules out the common look-alike" },
      { when: (e) => !e.condClean && e.condDirty, delta: -2, why: "A dirty condenser causes the same high head — clean it first" },
      { when: (e) => e.ampStatus === "high", delta: +1, why: "High amp draw fits elevated head pressure" },
      { when: (e) => e.recentService === "No", delta: +1.5, why: "No recent system opening makes noncondensables unlikely — charge is the better suspect" },
      { when: (e) => e.recentService === "Yes", delta: -1.5, why: "Recent service raises the chance of noncondensables instead" },
      { when: (e) => e.scValue != null && e.scValue > 25, delta: +4, why: "Subcooling far above any normal range — the condenser is flooded with liquid" }
    ],
    mistakenFor: ["Noncondensables", "Dirty condenser coil", "Weak condenser fan motor", "Recirculating condenser air", "High outdoor ambient", "Gauge error"]
  },

  // ============ LIQUID LINE RESTRICTION ============
  liquid_line_restriction: {
  tier: 4,
  firstStep: "Measure the temperature drop across the filter drier and inspect the liquid line for kinks. Replace the drier and evacuate properly.",
    name: "Liquid line restriction",
    metering: ["txv", "fixed"],
    pattern: { sp: "low", hp: ["normal", "high"], sh: "high", sc: ["normal", "high"], dt: "low" },
    key: "Low suction + high superheat, but subcooling stays NORMAL or HIGH — refrigerant is backing up before the restriction.",
    text: "Refrigerant is restricted before it reaches the metering device. Common points: filter drier, kinked liquid line, service valve, liquid line screen, or debris/moisture.",
    warning: "Possible liquid line restriction. Verify indoor airflow, filter condition, blower operation, evaporator coil condition, refrigerant charge, metering device type, service valve position, and temperature drop across the filter drier/liquid line before condemning the restriction point. Do not add refrigerant just because suction pressure is low.",
    evidence: [
      { when: (e) => e.drierDrop === "Yes", delta: +3, why: "Over 3°F drop across the filter drier — a strong restriction signal" },
      { when: (e) => e.drierDrop === "No", delta: -2, why: "No drop across the drier argues against a restriction there" },
      { when: (e) => e.frostLoc === "Filter drier", delta: +2.5, why: "Frost/sweating at the drier marks the restriction point" },
      { when: (e) => e.frostLoc === "Liquid line / kink", delta: +2.5, why: "Frost/sweating at a liquid line kink marks the restriction point" },
      { when: (e) => e.frostLoc === "Metering device", delta: -1.5, why: "Frost at the metering device points to the piston/TXV instead" },
      { when: (e) => e.ampStatus === "low", delta: +1, why: "Reduced refrigerant flow lowers amp draw" }
    ],
    mistakenFor: ["Low refrigerant charge", "Clogged piston", "TXV underfeeding", "Dirty filter or evaporator coil", "Frozen evaporator coil", "Service valve not fully open", "System not stabilized long enough"]
  },

  // ============ CLOGGED PISTON (fixed orifice only) ============
  clogged_piston: {
  tier: 4, condemnLast: true,
  firstStep: "Rule out low charge and an upstream liquid line restriction first. Then verify the correct piston size for this equipment.",
    name: "Clogged piston / metering device restriction",
    metering: ["fixed"],
    pattern: { sp: "low", hp: ["normal", "high"], sh: "high", sc: ["normal", "high"], dt: "low" },
    key: "Same starved pattern as a liquid line restriction, but the temperature drop and frost are AT the metering device, not upstream at the drier.",
    text: "The piston is restricting flow, so the evaporator is starved even though the system may hold enough refrigerant. Unlike an undercharge, subcooling is normal to high.",
    warning: "Possible clogged piston or fixed-metering-device restriction. Verify indoor airflow, filter condition, blower operation, evaporator coil condition, refrigerant charge, liquid-line temperature drop, filter drier restriction, and correct piston size before condemning the metering device.",
    evidence: [
      { when: (e) => e.frostLoc === "Metering device", delta: +3, why: "Frost/temperature drop at the metering device marks the restriction there" },
      { when: (e) => e.drierDrop === "Yes", delta: -2, why: "The drop is across the drier — the restriction is upstream, not the piston" },
      { when: (e) => e.drierDrop === "No", delta: +1.5, why: "No drop across the drier moves suspicion downstream to the piston" },
      { when: (e) => e.frostLoc === "Filter drier" || e.frostLoc === "Liquid line / kink", delta: -2.5, why: "Frost upstream points to a liquid line restriction instead" },
      { when: (e) => e.ampStatus === "low", delta: +1, why: "Reduced refrigerant flow lowers amp draw" }
    ],
    mistakenFor: ["Low refrigerant charge", "Liquid line restriction", "Restricted filter drier", "Dirty filter or evaporator coil", "Frozen evaporator coil", "Wrong piston size", "System not stabilized long enough"]
  },

  // ============ TXV UNDERFEEDING ============
  txv_underfeed: {
  tier: 5, condemnLast: true,
  firstStep: "Confirm proper charge, airflow, and no liquid line restriction FIRST. Then check bulb mounting, insulation, and the external equalizer. Condemn the valve last.",
    name: "TXV underfeeding (starving the evaporator)",
    metering: ["txv"],
    pattern: { sp: "low", hp: ["normal", "high"], sh: "high", sc: ["normal", "high"], dt: "low" },
    key: "Starved evaporator with subcooling normal or high, and no restriction found upstream at the drier or liquid line.",
    text: "The valve isn't feeding enough refrigerant into the evaporator. The compressor can run hot from the lack of cool suction gas.",
    warning: "Possible TXV underfeeding. Verify proper refrigerant charge, indoor airflow, coil condition, liquid line temperature drop, filter drier restriction, sensing bulb location, bulb insulation, and external equalizer before condemning the TXV.",
    evidence: [
      { when: (e) => e.drierDrop === "No", delta: +2, why: "No drop across the drier — the restriction isn't upstream, so suspicion moves to the valve" },
      { when: (e) => e.drierDrop === "Yes", delta: -3, why: "Drop across the drier points to a liquid line restriction, not the valve" },
      { when: (e) => e.frostLoc === "Filter drier" || e.frostLoc === "Liquid line / kink", delta: -2.5, why: "Frost upstream points to a liquid line restriction instead" },
      { when: (e) => e.frostLoc === "Metering device", delta: +2, why: "Frost at the valve fits a valve that's restricting" },
      { when: (e) => e.airflowOK, delta: +1.5, why: "Airflow verified, so a starved coil isn't an airflow problem" }
    ],
    mistakenFor: ["Low refrigerant charge", "Liquid line restriction", "Restricted filter drier", "Dirty filter or evaporator coil", "Blower not moving enough air", "Frozen evaporator coil", "System not stabilized long enough"]
  },

  // ============ TXV OVERFEEDING ============
  txv_overfeed: {
  tier: 5, condemnLast: true,
  firstStep: "Confirm proper charge and airflow FIRST. Then check bulb mounting, contact, insulation, and the external equalizer. Condemn the valve last.",
    name: "TXV overfeeding (floodback risk)",
    metering: ["txv"],
    pattern: { sp: "high", hp: ["normal", "high"], sh: "low", sc: ["normal", "high"], dt: "low" },
    key: "High suction with LOW superheat — the valve is letting too much liquid into the evaporator.",
    text: "The valve is overfeeding the evaporator. Low superheat means liquid can return to the compressor.",
    warning: "Possible TXV overfeeding. Verify indoor airflow, refrigerant charge, bulb mounting, bulb insulation, external equalizer, and manufacturer charging data before condemning the TXV. Low superheat can create compressor floodback risk.",
    danger: "Low superheat risks liquid floodback to the compressor. Don't leave the system running this way.",
    evidence: [
      { when: (e) => e.bulbIssue === "Yes", delta: +3, why: "A loose, warm, or uninsulated sensing bulb makes the valve overfeed" },
      { when: (e) => e.airflowOK, delta: +1.5, why: "Airflow verified, so low superheat isn't an airflow problem" },
      { when: (e) => e.sc === "high" && e.hp === "high", delta: -1.5, why: "High subcool with high head also fits a plain overcharge" }
    ],
    mistakenFor: ["Overcharge", "Low indoor airflow", "Dirty filter or evaporator coil", "Oversized TXV", "Bulb mounted in a warm location"]
  },

  // ============ TXV HUNTING ============
  txv_hunting: {
  tier: 5, condemnLast: true,
  firstStep: "Let the system stabilize 10-15 minutes. Confirm airflow, load, charge, and no flash gas from a liquid line restriction. Then check bulb mounting and insulation. Condemn the valve last.",
    name: "TXV hunting (unstable valve)",
    metering: ["txv"],
    pattern: { sp: "any", hp: "any", sh: "any", sc: "any", dt: "any" },
    key: "Superheat and suction pressure swing repeatedly instead of settling, after the system has had time to stabilize.",
    text: "The valve is constantly opening and closing rather than holding a steady superheat. Readings won't settle even after several minutes of run time.",
    warning: "Possible TXV hunting. Allow the system to stabilize, verify indoor airflow and load, confirm proper bulb mounting and insulation, check for flash gas or liquid line restrictions, and compare readings against manufacturer charging data before condemning the valve.",
    requires: (e) => e.shSwinging === "Yes", // never fires unless swing is observed
    evidence: [
      { when: (e) => e.shSwinging === "Yes", delta: +4, why: "Superheat is swinging rather than settling — the defining symptom" },
      { when: (e) => e.bulbIssue === "Yes", delta: +2, why: "A loose or uninsulated bulb makes the valve hunt" },
      { when: (e) => e.drierDrop === "Yes", delta: -1, why: "A restriction upstream can cause flash gas that mimics hunting" },
      { when: (e) => e.airflowOK, delta: +1, why: "Airflow and load verified stable" }
    ],
    mistakenFor: ["Liquid line restriction causing flash gas", "Incorrect refrigerant charge", "Airflow or load instability", "System not stabilized long enough", "Oversized TXV"]
  },

  // ============ NONCONDENSABLES ============
  noncondensables: {
  tier: 3,
  firstStep: "Recover, evacuate to 500 microns and hold, then weigh in a fresh charge.",
    name: "Noncondensables (air in the system)",
    metering: ["txv", "fixed"],
    pattern: { sp: "any", hp: "high", sh: "any", sc: ["normal", "high"], dt: "low" },
    key: "High head and high condensing temperature that persist on a CLEAN condenser with the fan confirmed running.",
    text: "Gases that don't condense (usually air) are raising head pressure. Often traced to poor evacuation, a recent system opening, or contaminated refrigerant.",
    warning: "Possible noncondensables. Verify condenser coil cleanliness, condenser fan operation, outdoor airflow, refrigerant type, charge accuracy, gauge accuracy, and system stabilization. Commonly caused by poor evacuation or contamination. Do not diagnose noncondensables from high head pressure alone.",
    evidence: [
      { when: (e) => e.recentService === "Yes", delta: +3, why: "System was recently opened, evacuated, or recharged — the usual source of air" },
      { when: (e) => e.condClean, delta: +2.5, why: "Head stays high on a clean condenser with a working fan" },
      { when: (e) => e.condDirty, delta: -3, why: "A dirty condenser explains the high head — clean it and recheck" },
      { when: (e) => e.ampStatus === "high", delta: +1.5, why: "High amp draw fits the elevated compression ratio" },
      { when: (e) => e.recentService === "No", delta: -1.5, why: "No recent system opening makes air less likely" },
      { when: (e) => e.scValue != null && e.scValue > 25, delta: -3, why: "Noncondensables don't flood a condenser badly enough to make subcooling this high" }
    ],
    mistakenFor: ["Overcharge", "Dirty condenser coil", "Weak condenser fan motor", "Recirculating condenser air", "Wrong or mixed refrigerant", "High outdoor ambient", "Gauge error"]
  },

  // ============ DIRTY CONDENSER ============
  dirty_condenser: {
  tier: 2,
  firstStep: "Confirm the condenser coil is clean and dry and the fan is moving air. Wash the coil, then re-read head pressure and subcooling.",
    name: "Dirty condenser / poor heat rejection",
    metering: ["txv", "fixed"],
    pattern: { sp: ["normal", "high"], hp: "high", sh: ["normal", "high"], sc: ["normal", "high"], dt: "low" },
    key: "High head with a visibly dirty coil or a fan that isn't moving air.",
    text: "The condenser can't reject heat. Wash the coil, confirm the fan and airflow, then recheck before touching the charge.",
    warning: "Verify condenser coil cleanliness, fan operation, blade condition, and that outdoor air isn't recirculating. Clean and recheck before adjusting charge.",
    evidence: [
      { when: (e) => e.condDirty, delta: +3, why: "Condenser coil condition was logged as dirty" },
      { when: (e) => e.condFanOff, delta: +3, why: "Condenser fan is not running" },
      { when: (e) => e.condClean, delta: -3, why: "Condenser is clean and the fan runs — look at overcharge or noncondensables" },
      { when: (e) => e.ampStatus === "high", delta: +1, why: "High amp draw fits high head pressure" },
      { when: (e) => e.scValue != null && e.scValue > 25, delta: -3, why: "A dirty coil alone doesn't drive subcooling this high — suspect overcharge on top of it" }
    ],
    mistakenFor: ["Overcharge", "Noncondensables", "High outdoor ambient", "Recirculating condenser air"]
  },

  // ============ LOW INDOOR AIRFLOW ============
  low_airflow: {
  tier: 1,
  firstStep: "Check the filter, evaporator coil, blower speed and wheel, and ducts. Correct airflow, then re-read everything.",
    name: "Low indoor airflow",
    metering: ["txv", "fixed"],
    pattern: { sp: "low", hp: ["low", "normal"], sh: "low", sc: "normal", dt: "high" },
    key: "Low superheat with a HIGH temperature split — the air side is starved, not the refrigerant side.",
    text: "Reads like an airflow problem, not a charge problem. Check filter, evaporator coil, blower speed and wheel, and ducts before touching the charge.",
    warning: "Correct airflow first. A dirty filter or coil causes low suction, freezing, poor split, and misleading refrigerant readings.",
    evidence: [
      { when: (e) => e.dirtyFilter, delta: +2.5, why: "Filter logged as dirty" },
      { when: (e) => e.dirtyEvap, delta: +2.5, why: "Evaporator coil logged as dirty or iced" },
      { when: (e) => e.blowerOff, delta: +3, why: "Blower is not running" },
      { when: (e) => e.airflowOK, delta: -3, why: "Airflow was verified good" }
    ],
    mistakenFor: ["Low refrigerant charge", "Metering device restriction", "Frozen evaporator coil"]
  },

  // ============ WRONG / LOOSE PISTON (overfeeding) ============
  piston_overfeed: {
  tier: 4, condemnLast: true,
  firstStep: "Rule out overcharge and low airflow first. Then verify piston size against the manufacturer spec.",
    name: "Wrong or loose piston (overfeeding)",
    metering: ["fixed"],
    pattern: { sp: "high", hp: ["normal", "high"], sh: "low", sc: ["low", "normal"], dt: "low" },
    key: "High suction with low superheat on a fixed orifice — the evaporator is being overfed.",
    text: "Suspect the wrong or a loose piston, or a bypass. Confirm the correct orifice size for this equipment.",
    warning: "Verify piston size against the manufacturer's specification, confirm the piston is seated correctly, and check indoor airflow before condemning the metering device. Low superheat can create compressor floodback risk.",
    danger: "Low superheat risks liquid floodback to the compressor.",
    evidence: [
      { when: (e) => e.airflowOK, delta: +1.5, why: "Airflow verified, so low superheat isn't an airflow problem" }
    ],
    mistakenFor: ["Overcharge", "Low indoor airflow", "Incorrect metering device installed"]
  }
};
