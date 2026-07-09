/* =================================================================
   Bell Diagnostic Coach — app.js
   Plain JavaScript, no frameworks. Read top to bottom; each block
   has a comment describing what it does so you can edit safely.
   ================================================================= */

/* ---- 0. Small helpers ------------------------------------------ */
// Grab one element / all elements.
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
// Get a form value by its data-field name.
const field = (key) => document.querySelector(`[data-field="${key}"]`);
// Read a numeric field; returns NaN if empty/not a number.
const numOf = (key) => {
  const el = field(key);
  if (!el || el.value === "" || el.value == null) return NaN;
  return parseFloat(el.value);
};
// Read a text/choice value (empty string if missing).
const valOf = (key) => (field(key) ? field(key).value : "");
// Round to one decimal place, as a clean string.
const round1 = (n) => (Math.round(n * 10) / 10).toString();

const STORAGE_KEY = "bdc_v1"; // where progress is saved in the browser

/* ---- 1. Build the Yes / No / N/A choice controls --------------- */
// Every <div class="check" data-choice="x" data-label="..."> becomes a
// labelled 3-button segmented control backed by a hidden input so it
// saves and restores like any other field.
const CHOICES = ["Yes", "No", "N/A"];
$$(".check").forEach((box) => {
  const key = box.dataset.choice;
  const label = box.dataset.label;
  box.innerHTML = `
    <span class="check-label">${label}</span>
    <div class="segmented" role="group" aria-label="${label}">
      ${CHOICES.map(
        (opt) => `<button type="button" class="seg-btn" data-val="${opt}">${opt}</button>`
      ).join("")}
    </div>
    <input type="hidden" data-field="${key}" />`;
});

// One click handler for all segmented buttons (event delegation).
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".seg-btn");
  if (!btn) return;
  const group = btn.closest(".check");
  const hidden = $("input[data-field]", group);
  // Tapping the active choice again clears it (lets techs undo a mistap).
  if (btn.classList.contains("is-active")) {
    btn.classList.remove("is-active");
    hidden.value = "";
  } else {
    $$(".seg-btn", group).forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    hidden.value = btn.dataset.val;
  }
  onChange();
});

/* ---- 2. Save / restore progress (localStorage) ----------------- */
// Collect every field into a plain object.
function collectState() {
  const state = {};
  $$("[data-field]").forEach((el) => {
    state[el.dataset.field] = el.type === "checkbox" ? el.checked : el.value;
  });
  return state;
}
// Write current progress to the browser.
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collectState()));
  } catch (err) {
    /* storage full or blocked — fail quietly, the app still works */
  }
}
// Load saved progress back into the fields.
function restoreState() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (err) {
    saved = {};
  }
  $$("[data-field]").forEach((el) => {
    const key = el.dataset.field;
    if (!(key in saved)) return;
    if (el.type === "checkbox") el.checked = !!saved[key];
    else el.value = saved[key] ?? "";
  });
  // Reflect restored choices onto the segmented buttons + photo tints.
  $$(".check").forEach((box) => {
    const v = $("input[data-field]", box).value;
    $$(".seg-btn", box).forEach((b) =>
      b.classList.toggle("is-active", b.dataset.val === v && v !== "")
    );
  });
}

/* ---- 4. Step navigation ---------------------------------------- */
const steps = $$(".step");
const stepTitles = steps.map((s) => s.dataset.title);
let current = 0;

// Fill the "Jump to" dropdown from the step titles.
$("#jumpSelect").innerHTML = stepTitles
  .map((t, i) => `<option value="${i}">${i + 1}. ${t}</option>`)
  .join("");

function showStep(i) {
  current = Math.max(0, Math.min(steps.length - 1, i));
  steps.forEach((s, idx) => s.classList.toggle("is-active", idx === current));

  // Progress bar + label + dropdown.
  $("#progressFill").style.width = ((current + 1) / steps.length) * 100 + "%";
  $("#stepLabel").textContent = `Step ${current + 1} of ${steps.length} · ${stepTitles[current]}`;
  $("#jumpSelect").value = String(current);

  // Back button disabled on the first step; Next becomes a hint on the last.
  $("#btnPrev").disabled = current === 0;
  $("#btnNext").textContent = current === steps.length - 1 ? "Done" : "Next";

  // Refresh live content when landing on guidance / summary steps.
  renderConclusion(renderReadingStatus());
  renderGuidance();
  buildSummary();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("#btnPrev").addEventListener("click", () => showStep(current - 1));
$("#btnNext").addEventListener("click", () => {
  if (current < steps.length - 1) showStep(current + 1);
});
$("#jumpSelect").addEventListener("change", (e) => showStep(parseInt(e.target.value, 10)));

/* ---- 5. Calculators (run live on every change) ----------------- */

// 5a. Temperature split = return air − supply air (cooling).
function calcSplit() {
  const r = numOf("returnTemp");
  const s = numOf("supplyTemp");
  const valueEl = $("#splitValue");
  const chip = $("#splitChip");
  const note = $("#splitNote");

  if (isNaN(r) || isNaN(s)) {
    valueEl.textContent = "--";
    chip.textContent = "—";
    chip.className = "readout-chip";
    note.textContent = "Enter return and supply temps to calculate.";
    return null;
  }
  const split = r - s;
  valueEl.textContent = round1(split);

  // Rough field expectation for a healthy cooling split is ~14–23°F.
  let cls, txt, msg;
  if (split >= 14 && split <= 23) {
    cls = "is-pass"; txt = "In range";
    msg = "Split looks healthy. Still confirm the rest of the system.";
  } else if ((split >= 10 && split < 14) || (split > 23 && split <= 26)) {
    cls = "is-warn"; txt = "Check";
    msg = "Borderline. Check airflow, coil, and blower before drawing conclusions.";
  } else {
    cls = "is-fail"; txt = "Out of range";
    msg = "Unusual split. Do not jump to charge — verify airflow and readings first.";
  }
  chip.textContent = txt;
  chip.className = "readout-chip " + cls;
  note.textContent = msg;
  return split;
}

// 5b. Capacitor tolerance for one side (compressor or fan).
function calcCap(ratedKey, actualKey, tol, rangeEl, chipEl) {
  const rated = numOf(ratedKey);
  const actual = numOf(actualKey);
  if (isNaN(rated) || rated <= 0 || isNaN(actual)) {
    rangeEl.textContent = "Acceptable range appears here.";
    chipEl.textContent = "—";
    chipEl.className = "readout-chip";
    return null;
  }
  const min = rated * (1 - tol / 100);
  const max = rated * (1 + tol / 100);
  // Tolerance is +/- : a cap can fail by reading HIGH just as it can by reading LOW.
  const within = actual >= min && actual <= max;
  const over = actual > max;
  rangeEl.textContent = `Range ${round1(min)} – ${round1(max)} MFD  (actual ${round1(actual)})`;
  chipEl.textContent = within
    ? "In tolerance"
    : over ? "Out of spec — HIGH" : "Out of spec — LOW";
  chipEl.className = "readout-chip " + (within ? "is-pass" : "is-fail");
  return { min, max, actual, within, over };
}

function calcCapacitors() {
  let tol = numOf("capTolerance");
  if (isNaN(tol) || tol <= 0) tol = 6; // fall back to the 6% default
  const herm = calcCap("hermRated", "hermActual", tol, $("#hermRange"), $("#hermChip"));
  const fan = calcCap("fanRated", "fanActual", tol, $("#fanRange"), $("#fanChip"));
  return { herm, fan };
}

// 5c. Superheat and subcooling.
function calcRefrigerant() {
  const shEl = $("#superheatValue");
  const scEl = $("#subcoolValue");
  let superheat = null, subcool = null;

  const sl = numOf("suctionLine"), ss = numOf("suctionSat");
  if (!isNaN(sl) && !isNaN(ss)) { superheat = sl - ss; shEl.textContent = round1(superheat); }
  else shEl.textContent = "--";

  const ls = numOf("liquidSat"), ll = numOf("liquidLine");
  if (!isNaN(ls) && !isNaN(ll)) { subcool = ls - ll; scEl.textContent = round1(subcool); }
  else scEl.textContent = "--";

  return { superheat, subcool };
}

// 5d. PT chart lookup — derive saturation temp from pressure + refrigerant.
// Linear interpolation between table points. column is "dew" or "bubble".
// Returns a number, or null if there's no data / the pressure is off the chart.
function ptLookupTemp(refrig, pressure, column) {
  const table = (typeof PT_DATA !== "undefined") ? PT_DATA[refrig] : null;
  if (!table || isNaN(pressure)) return null;
  const pts = table.points;                 // sorted by psig ascending
  const lo = pts[0][0], hi = pts[pts.length - 1][0];
  if (pressure < lo || pressure > hi) return null; // don't extrapolate past the chart
  const col = column === "dew" ? 2 : 1;     // [psig, bubble(1), dew(2)]
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i][0], p2 = pts[i + 1][0];
    if (pressure >= p1 && pressure <= p2) {
      const t1 = pts[i][col], t2 = pts[i + 1][col];
      const frac = p2 === p1 ? 0 : (pressure - p1) / (p2 - p1);
      return t1 + frac * (t2 - t1);
    }
  }
  return null;
}

// Write a small hint line under a saturation field.
function setHint(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt || "";
}

// Is a given side ("suction"/"liquid") in manual-entry mode?
function isSatManual(side) {
  return valOf(side + "SatMode") === "manual";
}

// Show/hide the manual input vs. the derived display for one side, and set
// the toggle link text. Called on toggle and after restoring saved progress.
function syncSatModeUI(side) {
  const manual = isSatManual(side);
  const input = document.getElementById(side + "SatInput");
  const display = document.getElementById(side + "SatDisplay");
  const btn = document.querySelector(`[data-satmode="${side}"]`);
  if (input) input.classList.toggle("is-hidden", !manual);
  if (display) display.classList.toggle("is-hidden", manual);
  if (btn) btn.textContent = manual ? "Use PT chart" : "Enter manually";
}

// Toggle a side between chart-derived and manual entry.
function toggleSatMode(side) {
  const modeEl = field(side + "SatMode");
  const goingManual = !isSatManual(side);
  modeEl.value = goingManual ? "manual" : "";
  if (!goingManual) {
    // Back to derived: clear the manual value so the chart repopulates it.
    const input = field(side + "Sat");
    if (input) input.value = "";
  }
  syncSatModeUI(side);
  onChange();
  if (goingManual) {
    const input = document.getElementById(side + "SatInput");
    if (input) input.focus();
  }
}

// Compute + display saturation temps. In derived mode this WRITES the
// chart value into the (hidden) sat field so superheat/subcooling still
// work; in manual mode it leaves the tech's number alone. Also refreshes
// the PT readout tile. Safe to call on every change (no event loops).
function ptComputeAndDisplay() {
  const refrig = valOf("refrigerant");
  const table = (typeof PT_DATA !== "undefined") ? PT_DATA[refrig] : null;
  const chip = $("#ptChip");
  const text = $("#ptText");

  // Top PT readout tile.
  if (!table) {
    chip.textContent = "—";
    chip.className = "readout-chip";
    text.textContent = refrig === "Other"
      ? 'No PT data for "Other" — use "Enter manually" on the saturation temps.'
      : "Select a refrigerant in Job Information, then enter a pressure to read its saturation temp.";
  } else {
    chip.textContent = table.glide ? `Glide ~${table.glideF}°F` : "No glide";
    chip.className = "readout-chip " + (table.glide ? "is-warn" : "is-pass");
    text.textContent = `${refrig} — ${table.note}`;
  }

  // Each side: suction uses dew point, liquid uses bubble point.
  [["suction", "dew", "suctionPressure"], ["liquid", "bubble", "liquidPressure"]].forEach(
    ([side, column, pressureKey]) => {
      const input = field(side + "Sat");
      const display = document.getElementById(side + "SatDisplay");
      const pressure = numOf(pressureKey);

      if (isSatManual(side)) {
        // Manual mode: don't touch the value; just note it.
        setHint(side + "SatHint", "Manual entry — not from the PT chart.");
        return;
      }

      // Derived mode: look up the value and mirror it into field + display.
      const temp = ptLookupTemp(refrig, pressure, column);
      if (temp === null) {
        input.value = "";
        display.textContent = "—";
        display.classList.add("is-empty");
        setHint(side + "SatHint",
          !table ? (refrig === "Other" ? 'Tap "Enter manually" to type a value.' : "Select a refrigerant to derive this.")
          : isNaN(pressure) ? `Enter ${side} pressure to read saturation.`
          : "Pressure is off the chart — tap \"Enter manually\".");
      } else {
        input.value = round1(temp);
        display.textContent = round1(temp) + " °F";
        display.classList.remove("is-empty");
        setHint(side + "SatHint",
          `From ${refrig} PT chart (${column} point).`);
      }
    }
  );
}

/* ---- 5e. Diagnostic engine (reading status + condition match) --
   Grounded in the "5 Pillars" framework (Bryan Orr / HVAC School):
   suction pressure, head pressure, superheat, subcooling, delta T.
   Everything here is a DIRECTION TO CONFIRM — not a final diagnosis.
   Manufacturer data always beats these rules of thumb.
   ---------------------------------------------------------------- */

// Target Condensing Temp Over Ambient varies with equipment efficiency.
// (Bergmann/HVAC School.) We derive it from year of manufacture, which
// the tech already enters, unless they pick a SEER directly.
function targetCTOA() {
  const seer = valOf("seerClass");
  if (seer === "6–10 SEER") return { ctoa: 30, why: "6–10 SEER" };
  if (seer === "10–12 SEER") return { ctoa: 25, why: "10–12 SEER" };
  if (seer === "13–15 SEER") return { ctoa: 20, why: "13–15 SEER" };
  if (seer === "16+ SEER") return { ctoa: 15, why: "16+ SEER" };

  const yr = numOf("yearMfg");
  if (!isNaN(yr) && yr > 1900) {
    if (yr < 1992) return { ctoa: 30, why: `${yr} · likely 6–10 SEER` };
    if (yr <= 2005) return { ctoa: 25, why: `${yr} · likely 10–12 SEER` };
    return { ctoa: 20, why: `${yr} · likely 13–15 SEER` };
  }
  return { ctoa: 20, why: "default — set year or SEER" };
}

// Inverse of the PT lookup: given a temperature, return the pressure.
function ptPressureFromTemp(refrig, tempF, column) {
  const table = (typeof PT_DATA !== "undefined") ? PT_DATA[refrig] : null;
  if (!table || isNaN(tempF)) return null;
  const pts = table.points, col = column === "dew" ? 2 : 1;
  if (tempF < pts[0][col] || tempF > pts[pts.length - 1][col]) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    const t1 = pts[i][col], t2 = pts[i + 1][col];
    if (tempF >= t1 && tempF <= t2) {
      const frac = t2 === t1 ? 0 : (tempF - t1) / (t2 - t1);
      return pts[i][0] + frac * (pts[i + 1][0] - pts[i][0]);
    }
  }
  return null;
}

// Classify all five readings. Returns an object of {status, valueText, expText}.
function computeStatuses() {
  const refrig = valOf("refrigerant");
  const metering = valOf("meteringDevice");
  const ambient = numOf("outdoorTemp");
  const returnDB = numOf("returnTemp");
  const evapSat = numOf("suctionSat");   // evaporator saturation (dew)
  const condTemp = numOf("liquidSat");   // condensing saturation (bubble)
  const suctionLine = numOf("suctionLine");
  const liquidLine = numOf("liquidLine");
  const superheat = (!isNaN(suctionLine) && !isNaN(evapSat)) ? suctionLine - evapSat : NaN;
  const subcool = (!isNaN(condTemp) && !isNaN(liquidLine)) ? condTemp - liquidLine : NaN;
  const r = numOf("returnTemp"), s = numOf("supplyTemp");
  const split = (!isNaN(r) && !isNaN(s)) ? r - s : NaN;
  const U = { status: "unknown" };
  const psig = (v) => (v == null ? null : Math.round(v));

  // Head / condensing vs ambient. Target CTOA depends on equipment efficiency:
  // older/lower-SEER units run a bigger split. Derived from year of manufacture.
  let head = U;
  const ct = targetCTOA();
  if (!isNaN(condTemp) && !isNaN(ambient)) {
    const target = ambient + ct.ctoa;
    const lo = target - 5, hi = target + 5;
    const status = condTemp > hi ? "high" : condTemp < lo ? "low" : "normal";
    const pTgt = ptPressureFromTemp(refrig, target, "bubble");
    const exp = pTgt
      ? `target ~${psig(pTgt)} psig (${Math.round(target)}°F) · CTOA +${ct.ctoa} (${ct.why})`
      : `target cond ${Math.round(target)}°F · CTOA +${ct.ctoa}`;
    head = { status, valueText: `condensing ${round1(condTemp)}°F`, expText: exp };
  }

  // Suction / evaporator vs return air. DTD rule: evap sat ~35°F below the
  // air entering the coil, +/-5°F (at 400 CFM/ton). Lower CFM/ton -> bigger DTD.
  let suction = U;
  if (!isNaN(evapSat)) {
    let lo, hi;
    if (!isNaN(returnDB)) { lo = returnDB - 40; hi = returnDB - 30; } else { lo = 35; hi = 46; }
    const status = evapSat > hi ? "high" : evapSat < lo ? "low" : "normal";
    const pLo = ptPressureFromTemp(refrig, lo, "dew");
    const pHi = ptPressureFromTemp(refrig, hi, "dew");
    suction = { status, valueText: `evap ${round1(evapSat)}°F`,
      expText: (pLo && pHi) ? `expect ~${psig(pLo)}–${psig(pHi)} psig (DTD ~35°F)` : `expect evap ${Math.round(lo)}–${Math.round(hi)}°F` };
  }

  // Superheat. TXV/EEV holds 10°F +/-5 (5–15). Fixed orifice has NO single
  // target — it's read off the charging chart using return-air wet bulb and
  // outdoor dry bulb. If we have both, use the real target; otherwise say so.
  const txvLike = metering === "TXV" || metering === "EEV";
  const isFixed = metering === "Fixed orifice / piston";
  let sh = U, pistonTarget = null;

  if (isFixed) {
    pistonTarget = pistonTargetSuperheat(numOf("returnWB"), ambient);
  }

  if (!isNaN(superheat)) {
    if (isFixed) {
      if (pistonTarget && pistonTarget.target != null) {
        const t = pistonTarget.target;
        // Within +/-5°F of the chart target is acceptable in the field.
        const status = superheat > t + 5 ? "high" : superheat < t - 5 ? "low" : "normal";
        sh = { status, valueText: `${round1(superheat)}°F`,
          expText: `chart target ${t}°F (WB ${round1(numOf("returnWB"))} / ODB ${round1(ambient)})` };
      } else {
        // No usable target: report the value but don't pretend to judge it.
        sh = { status: "unknown", valueText: `${round1(superheat)}°F`,
          expText: "need return-air wet bulb + outdoor temp for a piston target" };
      }
    } else {
      const loT = txvLike ? 5 : 8, hiT = txvLike ? 15 : 18;
      sh = { status: superheat > hiT ? "high" : superheat < loT ? "low" : "normal",
        valueText: `${round1(superheat)}°F`,
        expText: txvLike ? "TXV target ~10°F ±5" : "target 8–18°F" };
    }
  }

  // Subcooling. TXV: 8–14°F (10 ±3). Fixed orifice: swings 5–23°F with load,
  // so it's a much weaker signal there — bands and weighting reflect that.
  let sc = U;
  if (!isNaN(subcool)) {
    const loS = txvLike ? 8 : 5, hiS = txvLike ? 14 : 23;
    sc = { status: subcool > hiS ? "high" : subcool < loS ? "low" : "normal",
      valueText: `${round1(subcool)}°F`,
      expText: txvLike ? "TXV target ~10°F ±3 (data plate)" : "piston: 5–23°F, weak indicator" };
  }

  // Temperature split (delta T). Typical 16–22°F. High humidity lowers it.
  let dt = U;
  if (!isNaN(split)) {
    dt = { status: split > 22 ? "high" : split < 16 ? "low" : "normal",
      valueText: `${round1(split)}°F`, expText: "typical 16–22°F (humidity lowers it)" };
  }

  // Freeze risk: below 32°F saturation the evaporator will eventually ice up.
  const freezeRisk = !isNaN(evapSat) && evapSat < 32;

  // Negative CTOA: an air-cooled condenser cannot condense at or below ambient.
  // Seen on a real job: 89°F condensing at 91°F ambient = no liquid at all.
  const negCTOA = !isNaN(condTemp) && !isNaN(ambient) && condTemp <= ambient;

  // High-pressure alarm: near the compressor's high-pressure cutout.
  // Confirmed on a real job: 610 psig / 149.5°F condensing, tripping the high limit.
  const HP_LIMIT = { "R-410A": 600, "R-454B": 600, "R-32": 600, "R-22": 400 };
  const lp = numOf("liquidPressure");
  const limit = HP_LIMIT[refrig];
  const hpAlarm = (limit && !isNaN(lp) && lp >= limit) || (!isNaN(condTemp) && condTemp >= 145);

  const scValue = !isNaN(subcool) ? subcool : null;

  return { head, suction, sh, sc, dt, metering, refrig, txvLike, isFixed, pistonTarget,
           freezeRisk, negCTOA, hpAlarm, hpLimit: limit, liquidPressure: lp,
           condTemp, ambient, scValue, evapSat, ctoa: ct };
}


// Weighting reflects how much each pillar actually tells you:
//  - TXV: the valve holds superheat, so SUBCOOL is the charge indicator.
//  - Fixed orifice: subcool swings 5–23°F with load, so SUPERHEAT rules.
const WEIGHTS = {
  txv:   { sc: 2,    hp: 2, sh: 1.5, sp: 1,   dt: 0.5 },
  fixed: { sc: 0.75, hp: 2, sh: 2,   sp: 1.5, dt: 0.5 }
};

// Compressor amp draw compared to nameplate RLA.
// Rough field bands: well under RLA suggests a starved system moving less
// refrigerant; at or over RLA suggests high head / high compression ratio.
function ampStatusOf() {
  const a = numOf("compAmps"), rla = numOf("compRLA");
  if (isNaN(a) || isNaN(rla) || rla <= 0) return "unknown";
  const pct = (a / rla) * 100;
  if (pct < 75) return "low";
  if (pct > 100) return "high";
  return "normal";
}

// Gather the extra field observations the knowledge base reasons over.
function collectEvidence(st) {
  const filter = valOf("filterCondition"), evap = valOf("evapCoil");
  const dirtyFilter = filter === "Dirty" || filter === "Very dirty / restricted";
  const dirtyEvap = evap === "Dirty" || evap === "Frozen / iced";
  const blowerOff = valOf("blowerRunning") === "No";
  const cond = valOf("condCoil");
  return {
    drierDrop: valOf("drierDrop") || "Not checked",
    frostLoc: valOf("frostLoc") || "Not checked",
    shSwinging: valOf("shSwinging") || "Not checked",
    bulbIssue: valOf("bulbIssue") || "Not checked",
    recentService: valOf("recentService") || "Not checked",
    chargeVerified: valOf("chargeVerified") || "Not checked",
    ampStatus: ampStatusOf(),
    scValue: st.scValue,
    dirtyFilter, dirtyEvap, blowerOff,
    airflowOK: !dirtyFilter && !dirtyEvap && valOf("blowerRunning") === "Yes",
    // Airflow must be VERIFIED (not merely "not obviously bad") before charge
    // readings can be trusted. Unknown counts as not verified.
    airflowVerified: valOf("blowerRunning") === "Yes" &&
      ["Clean", "Replaced on site"].includes(valOf("filterCondition")) &&
      ["Clean", "Not accessible"].includes(valOf("evapCoil")),
    restrictionRuledOut: valOf("drierDrop") === "No",
    condDirty: cond === "Dirty" || cond === "Very dirty / restricted",
    condFanOff: valOf("condFanRunning") === "No",
    condClean: cond === "Clean" && valOf("condFanRunning") === "Yes",
    sp: st.suction.status, hp: st.head.status, sh: st.sh.status,
    sc: st.sc.status, dt: st.dt.status
  };
}

// Does an observed status satisfy a pattern cell? Cells may be a string,
// an array of acceptable values, or "any".
function cellMatches(rule, obs) {
  if (rule === "any") return true;
  return Array.isArray(rule) ? rule.includes(obs) : rule === obs;
}

function matchConditions(st) {
  const set = st.metering === "Fixed orifice / piston" ? "fixed"
            : (st.metering === "TXV" || st.metering === "EEV") ? "txv" : null;
  const obs = { sp: st.suction.status, hp: st.head.status, sh: st.sh.status, sc: st.sc.status, dt: st.dt.status };
  const knownCount = Object.values(obs).filter((v) => v && v !== "unknown").length;
  if (!set) return { need: "metering", knownCount };
  if (knownCount < 3) return { need: "data", knownCount };

  const wt = WEIGHTS[set];
  const ev = collectEvidence(st);

  const ranked = Object.values(KNOWLEDGE)
    .filter((c) => c.metering.includes(set))
    // Some conditions only exist when a defining symptom was observed
    // (TXV hunting can't be seen in a single static snapshot).
    .filter((c) => !c.requires || c.requires(ev))
    .map((c) => {
      let score = 0, matched = 0, considered = 0;
      ["sp", "hp", "sh", "sc", "dt"].forEach((k) => {
        const rule = c.pattern[k], o = obs[k];
        if (rule === "any" || !o || o === "unknown") return;
        considered++;
        const w = wt[k] || 1;
        if (cellMatches(rule, o)) { score += w; matched++; } else { score -= w; }
      });

      // Apply evidence: each hit adjusts the score and explains itself.
      const reasons = [];
      (c.evidence || []).forEach((rule) => {
        let hit = false;
        try { hit = !!rule.when(ev); } catch (err) { hit = false; }
        if (hit) { score += rule.delta; reasons.push({ delta: rule.delta, why: rule.why }); }
      });

      // CONDEMN LAST. A bad metering device / TXV should be what's left after
      // everything else is eliminated — not a first guess. Techs condemn these
      // far too quickly, so they carry a penalty until charge is verified and
      // an upstream restriction has been ruled out.
      let condemnPenalty = 0;
      if (c.condemnLast) {
        const chargeOK = ev.chargeVerified === "Yes";
        const restrictionOK = ev.restrictionRuledOut;
        if (!chargeOK) condemnPenalty -= 2.5;
        if (!restrictionOK) condemnPenalty -= 2;
        if (condemnPenalty < 0) {
          const need = [];
          if (!chargeOK) need.push("verify the charge");
          if (!restrictionOK) need.push("rule out a liquid line restriction");
          reasons.push({ delta: condemnPenalty, why: `Held back until you ${need.join(" and ")} — don't condemn a metering device first` });
        }
        score += condemnPenalty;
      }

      return { id: c, name: c.name, text: c.text, key: c.key, warning: c.warning,
               danger: c.danger, mistakenFor: c.mistakenFor,
               tier: c.tier || 3, firstStep: c.firstStep, condemnLast: !!c.condemnLast,
               score, matched, considered, reasons };
    })
    .sort((a, b) => b.score - a.score || b.matched - a.matched);

  return { set, ranked, knownCount, ev };
}

// Render the reading-status panel; returns the statuses for reuse.
// Work out exactly which input a given status row is waiting on, so the
// app can say "Enter liquid pressure" instead of a vague "enter readings".
function missingFor(key) {
  const have = (k) => !isNaN(numOf(k));
  const need = [];
  const push = (cond, label) => { if (cond) need.push(label); };

  if (key === "suction") {
    push(!have("suctionPressure") && !have("suctionSat"), "suction pressure");
    push(!valOf("refrigerant"), "refrigerant type");
  } else if (key === "head") {
    push(!have("liquidPressure") && !have("liquidSat"), "liquid pressure");
    push(!have("outdoorTemp"), "outdoor temp");
    push(!valOf("refrigerant"), "refrigerant type");
  } else if (key === "sh") {
    push(!have("suctionPressure") && !have("suctionSat"), "suction pressure");
    push(!have("suctionLine"), "suction line temp");
  } else if (key === "sc") {
    push(!have("liquidPressure") && !have("liquidSat"), "liquid pressure");
    push(!have("liquidLine"), "liquid line temp");
  } else if (key === "dt") {
    push(!have("returnTemp"), "return air temp");
    push(!have("supplyTemp"), "supply air temp");
  }
  if (!need.length) return "waiting on readings";
  return "Enter " + need.join(" + ");
}

function renderReadingStatus() {
  const st = computeStatuses();
  const rows = [
    ["Suction pressure (evaporator)", st.suction, "suction"],
    ["Head pressure (condensing)", st.head, "head"],
    ["Superheat", st.sh, "sh"],
    ["Subcooling", st.sc, "sc"],
    ["Temperature split", st.dt, "dt"]
  ];

  // Freeze alarm: below 32°F saturation the evaporator will eventually ice up.
  let html = "";
  if (st.freezeRisk) {
    html += `<div class="banner banner-danger">Evaporator saturation is ${round1(st.evapSat)}°F — below 32°F. This coil will freeze. Find the cause (airflow or charge) before running the system.</div>`;
  }

  html += rows.map(([name, d, key]) => {
    const s = d.status || "unknown";
    const label = s === "unknown" ? "—" : s.toUpperCase();
    const cls = s === "normal" ? "is-pass" : (s === "high" || s === "low") ? "is-warn" : "";
    const meta = s === "unknown" ? missingFor(key) :
      [d.valueText, d.expText].filter(Boolean).join(" · ");
    const metaCls = s === "unknown" ? "status-meta status-missing" : "status-meta";

    // For an abnormal reading, offer the list of possible causes to rule out.
    let causesHtml = "";
    const list = (CAUSES[key] || {})[s];
    if (list && list.length) {
      causesHtml = `<details class="causes">
          <summary>Possible causes of ${s} ${name.split(" (")[0].toLowerCase()}</summary>
          <ul>${list.map((c) => `<li>${c}</li>`).join("")}</ul>
        </details>`;
    }

    return `<div class="status-row">
        <span class="status-name">${name}</span>
        <span class="status-chip ${cls}">${label}</span>
        <span class="${metaCls}">${meta}</span>
        ${causesHtml}
      </div>`;
  }).join("");

  document.getElementById("statusPanel").innerHTML = html;
  return st;
}

// Render the suspected-condition conclusion.
function renderConclusion(st) {
  const el = document.getElementById("conclusionPanel");
  const m = matchConditions(st);

  // ---- Safety alarms come before any diagnosis. -------------------
  let alarms = "";
  if (st.hpAlarm) {
    alarms += `<div class="banner banner-danger">High-side pressure is at or near the compressor's high-pressure cutout` +
      (st.liquidPressure ? ` (${round1(st.liquidPressure)} psig` + (st.condTemp ? `, ${round1(st.condTemp)}\u00B0F condensing` : "") + `)` : "") +
      `. Stop running the system. Find the cause before the compressor trips or is damaged.</div>`;
  }
  if (st.negCTOA) {
    alarms += `<div class="banner banner-danger">Condensing temperature (${round1(st.condTemp)}\u00B0F) is at or below outdoor ambient (${round1(st.ambient)}\u00B0F). An air-cooled condenser cannot reject heat that way \u2014 it isn't condensing. Expect a severe undercharge, or verify your gauges and probe placement before adding refrigerant.</div>`;
  }

  if (m.need === "metering") {
    el.innerHTML = alarms + `<div class="conclusion"><p class="conclusion-text">Pick a <strong>metering device</strong> in Job Information (TXV, fixed orifice, or EEV) to match a condition.</p></div>`;
    return;
  }
  if (m.need === "data") {
    el.innerHTML = alarms + `<div class="conclusion"><p class="conclusion-text">Enter a few more readings to get a suspected condition \u2014 aim for suction &amp; liquid pressures plus line temps (at least 3 of the five readings above).</p></div>`;
    return;
  }

  const ev = m.ev;
  const top = m.ranked[0];
  if (!top || top.score <= 0) {
    el.innerHTML = alarms + `<div class="conclusion"><p class="conclusion-text">These readings don't clearly match one pattern yet. Re-verify your gauge connection and line-temp clamp placement, let the system stabilize 10\u201315 minutes, then recheck.</p></div>`;
    return;
  }

  // ---- AIRFLOW GATE ----------------------------------------------
  // We always check airflow before refrigerant. If the air side isn't
  // verified, no charge/metering call is trustworthy, so we don't lead
  // with one. The candidates are shown, but demoted and labelled.
  if (!ev.airflowVerified) {
    const missing = [];
    if (valOf("blowerRunning") !== "Yes") missing.push("blower operation");
    if (!["Clean", "Replaced on site"].includes(valOf("filterCondition"))) missing.push("filter condition");
    if (!["Clean", "Not accessible"].includes(valOf("evapCoil"))) missing.push("evaporator coil condition");

    let h = alarms;
    h += `<div class="conclusion tone-alert">`;
    h += `<p class="conclusion-suspect">Verify airflow first</p>`;
    h += `<p class="conclusion-text conclusion-airflow">Airflow hasn't been verified` +
         (missing.length ? ` (${missing.join(", ")})` : "") +
         `. Airflow problems mimic charge problems on every gauge you own. Correct the air side, let the system run, then re-read.</p>`;
    h += `<p class="conclusion-key"><strong>Do this first:</strong> confirm the filter, evaporator coil, and blower. Then re-measure pressures and line temps.</p>`;
    h += `<p class="conclusion-missing"><strong>Provisional only \u2014 not yet trustworthy:</strong> these readings currently look most like <strong>${top.name}</strong>. Do not act on that until airflow is verified.</p>`;
    h += `<p class="conclusion-caveat">A direction to confirm, not a final call.</p></div>`;
    el.innerHTML = h;
    return;
  }

  // ---- DIFFERENTIAL ----------------------------------------------
  // Some conditions genuinely cannot be separated from readings alone
  // (a dirty condenser and an overcharge both raise head pressure).
  // When they're close, present BOTH and order the work by tier, since
  // an upstream fault corrupts every downstream reading.
  const alt = m.ranked[1];
  const differential = alt && alt.score > 0 && (top.score - alt.score) <= 3;

  let html = alarms + `<div class="conclusion">`;

  if (differential) {
    // Lower tier gets verified first — that's the physical dependency order.
    const first = top.tier <= alt.tier ? top : alt;
    const second = first === top ? alt : top;

    html += `<p class="conclusion-suspect">Suspected ${first.name.toLowerCase()} and/or ${second.name.toLowerCase()}</p>`;
    html += `<p class="conclusion-score">These readings fit both \u00B7 ${st.metering}</p>`;
    if (top.danger || alt.danger) html += `<p class="conclusion-danger">${top.danger || alt.danger}</p>`;
    html += `<p class="conclusion-text">These two can't be separated from the gauges alone. Work them in order \u2014 the first will change the readings for the second.</p>`;
    html += `<div class="steps">`;
    html += `<div class="step-row"><span class="step-num">1</span><div><strong>${first.name}</strong><p>${first.firstStep || first.text}</p></div></div>`;
    html += `<div class="step-row"><span class="step-num">2</span><div><strong>Then re-read</strong><p>If the readings don't correct after step 1, treat as ${second.name.toLowerCase()}. ${second.firstStep || second.text}</p></div></div>`;
    html += `</div>`;
  } else {
    html += `<p class="conclusion-suspect">${top.name}</p>`;
    html += `<p class="conclusion-score">matched ${top.matched} of ${top.considered} readings entered (5 total) \u00B7 ${st.metering}</p>`;
    if (top.danger) html += `<p class="conclusion-danger">${top.danger}</p>`;
    html += `<p class="conclusion-text">${top.text}</p>`;
    if (top.firstStep) html += `<p class="conclusion-key"><strong>Do this first:</strong> ${top.firstStep}</p>`;
  }

  if (top.key) html += `<p class="conclusion-key"><strong>What points here:</strong> ${top.key}</p>`;

  // On a TXV the valve holds superheat, so a normal superheat says little.
  if (st.txvLike && st.sh.status === "normal") {
    html += `<p class="conclusion-note">Superheat reads normal, but on a TXV the valve holds superheat \u2014 that tells you little about charge. Judge charge by <strong>subcooling</strong>.</p>`;
  }

  // Evidence that moved this diagnosis, so the tech sees the reasoning.
  if (top.reasons && top.reasons.length) {
    const pos = top.reasons.filter((r) => r.delta > 0);
    const neg = top.reasons.filter((r) => r.delta < 0);
    if (pos.length) html += `<div class="evidence-block"><p class="evidence-head">Supporting evidence</p><ul>` + pos.map((r) => `<li>${r.why}</li>`).join("") + `</ul></div>`;
    if (neg.length) html += `<div class="evidence-block evidence-against"><p class="evidence-head">Evidence against</p><ul>` + neg.map((r) => `<li>${r.why}</li>`).join("") + `</ul></div>`;
  }

  // Which of the five pillars the app could NOT see.
  const unseen = [
    ["Head pressure", st.head.status], ["Subcooling", st.sc.status], ["Superheat", st.sh.status],
    ["Suction pressure", st.suction.status], ["Temperature split", st.dt.status]
  ].filter(([, s]) => !s || s === "unknown").map(([n]) => n);

  const uncollected = [];
  if (ev.drierDrop === "Not checked") uncollected.push("temp drop across the filter drier");
  if (ev.frostLoc === "Not checked") uncollected.push("frost/sweating location");
  if (ev.ampStatus === "unknown") uncollected.push("amp draw vs nameplate RLA");

  if (unseen.length) {
    html += `<p class="conclusion-missing"><strong>Partial match \u2014 ${unseen.length} reading${unseen.length > 1 ? "s" : ""} missing:</strong> ${unseen.join(", ")}. Several conditions look alike without these.</p>`;
  }
  if (uncollected.length) {
    html += `<p class="conclusion-missing"><strong>Would sharpen this call:</strong> ${uncollected.join(", ")}.</p>`;
  }

  if (top.warning) html += `<p class="conclusion-warning">${top.warning}</p>`;

  if (top.mistakenFor && top.mistakenFor.length) {
    html += `<details class="causes"><summary>Commonly mistaken for this</summary><ul>` +
      top.mistakenFor.map((c) => `<li>${c}</li>`).join("") + `</ul></details>`;
  }

  html += `<p class="conclusion-caveat">A direction to confirm, not a final call. A lot of faults present as each other \u2014 especially TXVs. Verify against the data-plate targets, let the system stabilize, and recheck after any correction.</p>`;
  html += `</div>`;
  el.innerHTML = html;
}

/* Possible causes for each reading being high or low.
   Adapted from the "5 Pillars" reference list (HVAC School). Deliberately
   a checklist of possibilities to rule out — not a ranked diagnosis. */
const CAUSES = {
  suction: {
    low: ["Low on charge", "Low airflow/load: dirty filter or evap, kinked/undersized return, dirty blower wheel, wrong blower speed", "Metering device restricting: piston too small, piston or TXV restricted, TXV failing closed", "Liquid line restriction: clogged drier or screen, kinked copper", "Low ambient / low evaporator load", "Kinked suction line", "Internal evaporator restriction"],
    high: ["Overcharge", "High return-air temperature (high evaporator load)", "Metering device overfeeding: piston too large, TXV failing open, piston seated wrong", "Too much airflow over the evaporator (blower speed too high)", "Compressor not pumping properly (leaking valves, compression issues)", "Reversing valve bypassing (heat pump)", "Discharge line restriction"]
  },
  head: {
    low: ["Low on charge", "Low ambient temperature / low load", "Metering device overfeeding: piston too large, TXV failing open", "Wet condenser coil", "Compressor not pumping properly (leaking valves)", "Reversing valve bypassing (heat pump)", "Kinked suction line or restricted discharge line", "Severe liquid line restriction"],
    high: ["Overcharge", "Low condenser airflow: fan not running, dirty coil, bent fins, bushes too close, wrong blade/motor", "High outdoor ambient", "Mixed or incorrect refrigerant / unmarked retrofit", "Non-condensables in the system", "Liquid line restriction PLUS overcharge (someone added charge after seeing low suction)"]
  },
  sh: {
    low: ["Overcharge", "Low airflow/load: dirty filter or evap, kinked return, dirty blower wheel, wrong blower speed", "Metering device overfeeding: piston too large, TXV failing open", "Low return-air temperature", "Abnormally low humidity", "Internal evaporator restriction", "Very poor compression — but that comes with VERY HIGH suction"],
    high: ["Low on charge", "Metering device underfeeding: piston too small, piston or TXV restricted, TXV failing closed", "High return-air temperature", "Liquid line restriction: clogged drier or screen, kinked copper"]
  },
  sc: {
    low: ["Low on charge", "Metering device overfeeding: piston too large, TXV failing open", "Compressor not pumping properly (leaking valves, broken crank)", "Reversing valve bypassing", "Discharge line restriction"],
    high: ["Overcharge", "Metering device restricting: piston too small, piston or TXV restricted, TXV failing closed", "Liquid line restriction: clogged drier or screen, kinked copper", "Dirty condenser coil on newer high-efficiency units", "Internal evaporator restriction"]
  },
  dt: {
    high: ["Low airflow: dirty filter or evap, kinked/undersized return, dirty blower wheel, wrong blower speed", "Abnormally low humidity (wet bulb)", "Blower running the wrong speed or backwards"],
    low: ["Undercharge", "Severe overcharge on a fixed orifice", "Metering device restricting or overfeeding", "Too much airflow through the evaporator", "Heat strips running with the air", "Abnormally high humidity", "Liquid line restriction", "Compressor not pumping properly", "Reversing valve bypassing", "Discharge line restriction"]
  }
};

// Compressor amp draw compared to nameplate RLA (readout on the electrical step).
function renderAmpReadout() {
  const chip = document.getElementById("ampChip");
  const range = document.getElementById("ampRange");
  if (!chip || !range) return;
  const a = numOf("compAmps"), rla = numOf("compRLA");
  if (isNaN(a) || isNaN(rla) || rla <= 0) {
    chip.textContent = "—"; chip.className = "readout-chip";
    range.textContent = "Enter amp draw and nameplate RLA.";
    return;
  }
  const pct = (a / rla) * 100;
  const s = ampStatusOf();
  chip.textContent = s === "low" ? "LOW" : s === "high" ? "HIGH" : "NORMAL";
  chip.className = "readout-chip " + (s === "normal" ? "is-pass" : "is-warn");
  const note = s === "low" ? "well under RLA — fits a starved system moving less refrigerant"
             : s === "high" ? "at or over RLA — fits high head / high compression ratio"
             : "within the expected range";
  range.textContent = `${round1(a)}A of ${round1(rla)}A RLA (${Math.round(pct)}%) · ${note}`;
}

// Fixed-orifice target superheat, read off the charging chart.
function renderPistonReadout() {
  const chip = document.getElementById("pistonChip");
  const text = document.getElementById("pistonText");
  if (!chip || !text) return;

  const metering = valOf("meteringDevice");
  if (metering !== "Fixed orifice / piston") {
    chip.textContent = "N/A";
    chip.className = "readout-chip";
    text.textContent = metering
      ? `Not used on ${metering} systems — the valve holds superheat, so charge by subcooling.`
      : "For fixed-orifice systems: enter return air wet bulb and outdoor temp.";
    return;
  }

  const wb = numOf("returnWB"), odb = numOf("outdoorTemp");
  const res = pistonTargetSuperheat(wb, odb);

  if (res.error === "input") {
    chip.textContent = "—"; chip.className = "readout-chip";
    text.textContent = isNaN(wb)
      ? "Enter return air wet bulb (Indoor Airflow step) to get a target."
      : "Enter outdoor temp (Thermostat step) to get a target.";
    return;
  }
  if (res.error === "range") {
    chip.textContent = "OFF CHART"; chip.className = "readout-chip is-warn";
    text.textContent = `WB ${round1(wb)}°F / ODB ${round1(odb)}°F falls outside the chart (WB 50–76, ODB 55–115). Use the manufacturer's chart.`;
    return;
  }
  if (res.error === "nocharge") {
    chip.textContent = "DO NOT CHARGE"; chip.className = "readout-chip is-fail";
    text.textContent = `At WB ${round1(wb)}°F / ODB ${round1(odb)}°F the chart has no target (red zone). Target superheat is too low to charge safely by superheat under these conditions. Weigh in the charge or return when conditions allow.`;
    return;
  }

  const t = res.target;
  const actual = numOf("suctionLine") - numOf("suctionSat");
  chip.textContent = `TARGET ${t}°F`;
  chip.className = "readout-chip is-pass";
  let msg = `WB ${round1(wb)}°F / ODB ${round1(odb)}°F → target superheat ${t}°F (±5°F acceptable).`;
  if (!isNaN(actual)) {
    const diff = actual - t;
    msg += ` Actual ${round1(actual)}°F — ${Math.abs(diff) <= 5 ? "within range" : diff > 0 ? `${round1(diff)}°F HIGH (starved / low charge?)` : `${round1(-diff)}°F LOW (overfed / overcharge?)`}.`;
  }
  text.textContent = msg;
}

/* ---- 6. Diagnostic guidance ------------------------------------ */
// Reads current entries + calculated values and returns a list of
// practical reminders. These prompt the tech to VERIFY — not a verdict.
function computeGuidance() {
  const tips = [];
  const add = (tone, title, text) => tips.push({ tone, title, text });

  const split = calcSplit();
  const caps = calcCapacitors();
  const { superheat } = calcRefrigerant();

  const filter = valOf("filterCondition");
  const evap = valOf("evapCoil");
  const dirtyFilter = filter === "Dirty" || filter === "Very dirty / restricted";
  const dirtyEvap = evap === "Dirty" || evap === "Frozen / iced";

  // Rule 1 — blower not running.
  if (valOf("blowerRunning") === "No") {
    add("alert", "Blower not running",
      "Diagnose indoor airflow before you evaluate refrigerant charge. No airflow throws off every pressure and temperature reading.");
  }

  // Rule 2 — dirty filter or coil.
  if (dirtyFilter || dirtyEvap) {
    add("caution", "Airflow restriction present",
      "A dirty filter or coil can cause low suction, freezing, a poor temperature split, and misleading refrigerant readings. Correct airflow first, then re-check.");
  }

  // Rule 3 — capacitor out of spec on either side, high OR low (+/- tolerance).
  const capOut = (caps.herm && !caps.herm.within) || (caps.fan && !caps.fan.within);
  if (capOut) {
    const highSide = (caps.herm && caps.herm.over) || (caps.fan && caps.fan.over);
    add("alert", "Capacitor out of spec",
      highSide
        ? "A cap reading above its rated MFD is out of spec just like a weak one. Confirm proper voltage to the unit, verify your meter and that the cap is fully discharged, then replace the capacitor before continuing."
        : "Confirm proper voltage to the unit, then replace the capacitor before continuing your diagnosis. A weak cap can mimic other failures.");
  }

  // Rule 4 — amp draw but compressor not confirmed pumping.
  const amps = numOf("compAmps");
  if (!isNaN(amps) && amps > 0 && valOf("compRunning") !== "Yes") {
    add("caution", "Amp draw without confirmed pumping",
      "Compressor is drawing amps but operation isn't confirmed. Verify compressor operation, voltage under load, a possible internal bypass, reversing-valve issues on heat pumps, and your gauge connection.");
  }

  // Rule 5 — suction line / evaporator freezing.
  if (evap === "Frozen / iced" || (superheat !== null && superheat <= 3)) {
    add("caution", "Freezing / very low superheat",
      "If the suction line or coil is freezing, check airflow, filter, blower speed, evaporator coil, low charge, and metering-device issues before condemning a part.");
  }

  // Rule 6 — poor temperature split.
  if (split !== null && split < 16) {
    add("caution", "Poor temperature split",
      "Don't jump straight to low charge. Check airflow, coil condition, blower operation, duct issues, and your refrigerant readings first. High indoor humidity also lowers the split.");
  }

  // Rule 7 — TXV loses control of superheat when it isn't fed a full liquid line.
  const st7 = computeStatuses();
  if (st7.txvLike && !isNaN(numOf("liquidSat")) && !isNaN(numOf("liquidLine"))) {
    const scVal = numOf("liquidSat") - numOf("liquidLine");
    if (scVal <= 2) {
      add("alert", "Near-zero subcooling on a TXV system",
        "A TXV normally holds a steady superheat. At 0° subcool it isn't getting a full line of liquid, so it can no longer control superheat — don't read superheat as a charge indicator here. Look for undercharge or a liquid line restriction first.");
    }
  }

  // Rule 8 — fixed orifice: the chart needs a wet bulb, and has a red zone.
  if (st7.isFixed) {
    const pt = st7.pistonTarget;
    if (pt && pt.error === "input" && isNaN(numOf("returnWB"))) {
      add("info", "Wet bulb needed for a piston superheat target",
        "Target superheat on a fixed orifice depends on return-air wet bulb and outdoor dry bulb. Take a wet bulb reading with a psychrometer — a fixed number will mislead you.");
    } else if (pt && pt.error === "nocharge") {
      add("alert", "Do not charge by superheat in these conditions",
        "The charging chart has no target for this wet bulb and outdoor temperature. Superheat charging isn't reliable here. Weigh in the charge to the nameplate, or return when indoor and outdoor conditions allow a valid reading.");
    } else if (pt && pt.error === "range") {
      add("caution", "Conditions are off the charging chart",
        "This wet bulb / outdoor temp combination falls outside the generic chart. Use the manufacturer's charging chart for this equipment.");
    }
  }

  // Standing reminder when refrigerant data is present.
  const refrigEntered = ["suctionPressure", "liquidPressure", "suctionLine", "liquidLine"]
    .some((k) => !isNaN(numOf(k)));
  if (refrigEntered && (valOf("blowerRunning") !== "Yes" || dirtyFilter || dirtyEvap)) {
    add("info", "Verify airflow before trusting charge",
      "Confirm airflow, coil condition, blower operation, and basic electrical before using these readings to charge the system.");
  }

  return tips;
}

function renderGuidance() {
  const tips = computeGuidance();
  const list = $("#guidanceList");
  if (tips.length === 0) {
    list.innerHTML = `<p class="guidance-empty">No prompts yet. As you fill in checks and readings, reminders will appear here to help you verify before condemning a part.</p>`;
    return;
  }
  list.innerHTML = tips
    .map(
      (t) => `
    <div class="guidance-item tone-${t.tone}">
      <p class="guidance-title">${t.title}</p>
      <p class="guidance-text">${t.text}</p>
    </div>`
    )
    .join("");
}

/* ---- 8. ServiceTitan summary generator ------------------------- */
// Builds a clean, paste-ready summary. Only lines that have data show up.
function buildSummary() {
  const g = valOf; // shorthand for reading choice/text values
  const parts = [];

  // Helper: keep only non-empty pieces, joined with " | ".
  const row = (...pairs) =>
    pairs
      .filter(([, v]) => v !== "" && v != null && !(typeof v === "number" && isNaN(v)))
      .map(([label, v]) => `${label}: ${v}`)
      .join(" | ");

  // Header ---------------------------------------------------------
  parts.push("BELL BROTHERS — RESIDENTIAL NO-COOL DIAGNOSTIC");
  // Year of manufacture leads the summary — first thing a reader sees.
  if (g("yearMfg")) parts.push(`Year of manufacture: ${g("yearMfg")}`);
  const head = row(["Tech", g("techName")], ["Job #", g("jobNumber")], ["Date", g("jobDate")]);
  if (head) parts.push(head);
  if (g("customerName")) parts.push(`Customer: ${g("customerName")}`);

  const section = (title, lines) => {
    const body = lines.filter(Boolean);
    if (body.length) { parts.push("", title); body.forEach((l) => parts.push(l)); }
  };

  // Complaint / system --------------------------------------------
  section("COMPLAINT", [g("complaint")]);
  section("SYSTEM", [
    row(["Year", g("yearMfg")], ["Equipment", g("equipType")],
        ["Metering", g("meteringDevice")], ["Refrigerant", g("refrigerant")])
  ]);

  // Thermostat -----------------------------------------------------
  section("THERMOSTAT / CALL CONFIRMATION", [
    row(["Calling for cool", g("tstatCalling")], ["Mode correct", g("tstatMode")], ["Setpoint below indoor", g("setpointBelow")]),
    row(["Indoor °F", g("indoorTemp")], ["Outdoor °F", g("outdoorTemp")]),
    g("tstatErrors") ? `Error codes: ${g("tstatErrors")}` : "",
    g("tstatNotes") ? `Notes: ${g("tstatNotes")}` : "",
  ]);

  // Indoor airflow -------------------------------------------------
  const split = calcSplit();
  section("INDOOR AIRFLOW", [
    row(["Filter", g("filterCondition")], ["Blower", g("blowerRunning")], ["Speed/tap checked", g("blowerSpeed")], ["Evap coil", g("evapCoil")]),
    row(["Return restrictions", g("returnRestrict")], ["Supply restrictions", g("supplyRestrict")]),
    row(["Return °F", g("returnTemp")], ["Supply °F", g("supplyTemp")],
        ["Return WB °F", g("returnWB")],
        ["Temp split °F", split !== null ? round1(split) : ""]),
    g("staticPressure") ? `Static pressure: ${g("staticPressure")}` : "",
    g("airflowNotes") ? `Notes: ${g("airflowNotes")}` : "",
  ]);

  // Outdoor electrical --------------------------------------------
  section("OUTDOOR ELECTRICAL", [
    row(["Unit running", g("outdoorRunning")], ["Disconnect", g("disconnectOn")], ["Breaker", g("breakerOn")], ["Contactor", g("contactorPulled")]),
    row(["Line voltage", g("lineVoltage")], ["24V signal", g("lowVoltage")], ["Cap tested", g("capTested")], ["Cond fan", g("condFanRunning")], ["Compressor", g("compRunning")]),
    row(["Compressor amps", g("compAmps") ? g("compAmps") + "A" : ""], ["Nameplate RLA", g("compRLA") ? g("compRLA") + "A" : ""], ["Condenser coil", g("condCoil")]),
    g("electricalNotes") ? `Notes: ${g("electricalNotes")}` : "",
  ]);

  // Capacitor ------------------------------------------------------
  const { herm, fan } = calcCapacitors();
  const capLines = [];
  const capState = (c) => c.within ? "in tolerance" : (c.over ? "OUT of spec (reads high)" : "OUT of spec (reads low)");
  if (herm) capLines.push(`HERM (compressor): rated ${g("hermRated")} / actual ${g("hermActual")} MFD — ${capState(herm)} (range ${round1(herm.min)}–${round1(herm.max)})`);
  if (fan) capLines.push(`FAN: rated ${g("fanRated")} / actual ${g("fanActual")} MFD — ${capState(fan)} (range ${round1(fan.min)}–${round1(fan.max)})`);
  section("CAPACITOR", capLines);

  // Refrigerant ----------------------------------------------------
  const { superheat, subcool } = calcRefrigerant();
  const refrigLines = [
    row(["Suction psig", g("suctionPressure")], ["Suction sat °F", g("suctionSat")], ["Suction line °F", g("suctionLine")]),
    row(["Liquid psig", g("liquidPressure")], ["Liquid sat °F", g("liquidSat")], ["Liquid line °F", g("liquidLine")]),
    row(["Superheat °F", superheat !== null ? round1(superheat) : ""], ["Subcooling °F", subcool !== null ? round1(subcool) : ""]),
    row([">3°F drop across drier", g("drierDrop")], ["Frost location", g("frostLoc")]),
    row(["Superheat swinging", g("shSwinging")], ["Bulb issue found", g("bulbIssue")], ["Recently opened/evacuated", g("recentService")], ["Charge verified", g("chargeVerified")]),
    g("refrigNotes") ? `Notes: ${g("refrigNotes")}` : "",
  ].filter(Boolean);
  if (refrigLines.length) {
    // Record the fixed-orifice chart target when one applies.
    if (valOf("meteringDevice") === "Fixed orifice / piston") {
      const pr = pistonTargetSuperheat(numOf("returnWB"), numOf("outdoorTemp"));
      if (pr.target != null) {
        refrigLines.push(`Piston chart target superheat: ${pr.target}°F (WB ${g("returnWB")} / ODB ${g("outdoorTemp")}), ±5°F acceptable.`);
      } else if (pr.error === "nocharge") {
        refrigLines.push("Piston chart: conditions fall in the do-not-charge zone; superheat charging not valid at this wet bulb / outdoor temp.");
      }
    }
    // Flag when saturation temps were derived from the PT chart (not manual).
    const satAuto = (valOf("suctionSatMode") !== "manual" && valOf("suctionSat") !== "") ||
                    (valOf("liquidSatMode") !== "manual" && valOf("liquidSat") !== "");
    if (satAuto && valOf("refrigerant")) {
      refrigLines.push(`Saturation temps derived from ${valOf("refrigerant")} PT chart (dew for suction, bubble for liquid) — reference values.`);
    }
    refrigLines.push("Note: readings not used to charge until airflow, coil, blower, and basic electrical verified.");
  }
  section("REFRIGERANT READINGS", refrigLines);

  // Findings / status ----------------------------------------------
  // Include the app's suspected condition, clearly framed as a direction.
  const stx = computeStatuses();
  const mx = matchConditions(stx);
  let suggested = "";
  if (mx.ranked && mx.ranked[0] && mx.ranked[0].score > 0) {
    suggested = `Readings most closely match: ${mx.ranked[0].name} (${stx.metering}) — to be confirmed.`;
  }
  section("FINDINGS", [
    suggested,
    g("suspectedIssue") ? `Suspected issue: ${g("suspectedIssue")}` : "",
    g("repairAction") ? `Performed / recommended: ${g("repairAction")}` : "",
    g("systemStatus") ? `System status: ${g("systemStatus")}` : "",
  ]);

  const text = parts.join("\n").trim();
  $("#summaryOutput").value = text;
  return text;
}

/* ---- 9. Copy + Clear buttons ----------------------------------- */
$("#btnRegenerate").addEventListener("click", buildSummary);

$("#btnCopy").addEventListener("click", async () => {
  const text = buildSummary();
  const status = $("#copyStatus");
  try {
    await navigator.clipboard.writeText(text); // modern clipboard API
    status.textContent = "Copied to clipboard ✓";
  } catch (err) {
    // Fallback for older Safari: select the textarea and copy.
    const out = $("#summaryOutput");
    out.removeAttribute("readonly");
    out.select();
    document.execCommand("copy");
    out.setAttribute("readonly", "");
    status.textContent = "Copied ✓";
  }
  setTimeout(() => (status.textContent = ""), 2500);
});

$("#btnClear").addEventListener("click", () => {
  if (!confirm("Clear all fields on this job? This cannot be undone.")) return;
  localStorage.removeItem(STORAGE_KEY);
  $$("[data-field]").forEach((el) => {
    if (el.type === "checkbox") el.checked = false;
    else el.value = "";
  });
  $$(".seg-btn").forEach((b) => b.classList.remove("is-active"));
  // reset the tolerance default
  if (field("capTolerance")) field("capTolerance").value = "6";
  syncSatModeUI("suction");   // back to derived-display mode
  syncSatModeUI("liquid");
  onChange();
  showStep(0);
});

/* ---- 10. Central change handler -------------------------------- */
// Runs after any input: recalculates, saves, and refreshes live views.
function onChange() {
  calcSplit();
  calcCapacitors();
  ptComputeAndDisplay(); // writes derived saturation temps BEFORE superheat/subcool
  calcRefrigerant();
  renderPistonReadout();
  renderAmpReadout();
  const st = renderReadingStatus(); // High/Low/Normal per reading
  renderConclusion(st);             // best-match condition from the chart
  renderGuidance();
  buildSummary();
  saveState();
}

/* ---- 10a. Saturation temp mode toggle -------------------------- */
// "Enter manually" / "Use PT chart" links next to each saturation temp.
$$("[data-satmode]").forEach((btn) => {
  btn.addEventListener("click", () => toggleSatMode(btn.dataset.satmode));
});
document.addEventListener("input", onChange);
document.addEventListener("change", onChange);

/* ---- 11. Start up ---------------------------------------------- */
restoreState();               // bring back any saved progress
syncSatModeUI("suction");     // apply saved derived/manual mode to the UI
syncSatModeUI("liquid");
onChange();                   // compute everything once
showStep(0);                  // open on the first step

// Register the service worker so the app works offline in the field.
// It's network-first, so fresh files always win when there's signal.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
      .then((reg) => {
        reg.update(); // check for a newer version on every load
        // When a new service worker takes over, reload once to get fresh files.
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      })
      .catch(() => {
        /* offline support just won't be available; the app still runs */
      });
  });
}
