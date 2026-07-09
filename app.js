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

  // Superheat. TXV/EEV holds 10°F +/-5 (5–15). Fixed orifice depends on indoor
  // wet bulb + outdoor dry bulb — a superheat chart is required for a real target.
  const txvLike = metering === "TXV" || metering === "EEV";
  let sh = U;
  if (!isNaN(superheat)) {
    const loT = txvLike ? 5 : 8, hiT = txvLike ? 15 : 18;
    sh = { status: superheat > hiT ? "high" : superheat < loT ? "low" : "normal",
      valueText: `${round1(superheat)}°F`,
      expText: txvLike ? "TXV target ~10°F ±5" : "piston: use a superheat chart (WB + ODB)" };
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

  return { head, suction, sh, sc, dt, metering, refrig, txvLike, freezeRisk, evapSat, ctoa: ct };
}

// The chart, encoded. Each column is "high" | "low" | "normal" | "any".
// Columns: sp = suction, hp = head, sh = superheat, sc = subcool, dt = split.
const CONDITIONS = {
  fixed: [
    { name: "Low charge", sp: "low", hp: "low", sh: "high", sc: "low", dt: "low",
      text: "Points to undercharge or a leak. Confirm there's no leak, then weigh in refrigerant to target superheat using a piston superheat chart (indoor wet bulb + outdoor dry bulb).",
      key: "Low subcool + low head. A restriction holds subcool normal or high." },
    { name: "Overcharge", sp: "high", hp: "high", sh: "low", sc: "high", dt: "normal",
      text: "Points to overcharge. Verify the condenser is clean and the fan is moving air first, then recover to target.",
      key: "High subcool + high head with low superheat." },
    { name: "Low indoor airflow / low return temp", sp: "low", hp: "normal", sh: "low", sc: "normal", dt: "high",
      text: "Reads like an airflow problem, not a charge problem. Check filter, evaporator coil, blower speed, and ducts before touching the charge.",
      key: "Low superheat with a HIGH temperature split." },
    { name: "Dirty condenser / high head", sp: "high", hp: "high", sh: "normal", sc: "normal", dt: "low",
      text: "High head with normal superheat and subcool points to heat-rejection trouble. Wash the condenser coil, confirm the fan and airflow, then recheck.",
      key: "High head while superheat and subcool stay normal." },
    { name: "Liquid line restriction", sp: "low", hp: "normal", sh: "high", sc: "high", dt: "low",
      text: "Suspect a restriction (filter-drier or liquid line). Liquid backs up in the condenser, so subcooling holds normal or high. Feel for a temperature drop across the drier — low suction with high superheat and backed-up subcool is the tell.",
      key: "Subcool normal/high with normal head — that's what separates it from low charge." },
    { name: "Wrong / loose piston", sp: "high", hp: "normal", sh: "low", sc: "low", dt: "low",
      text: "Suspect the wrong or a loose piston (or bypass). Confirm the correct orifice size for this equipment.",
      key: "High suction with low superheat and low subcool." },
    { name: "High return-air temp / high load", sp: "high", hp: "high", sh: "high", sc: "low", dt: "low",
      text: "Looks like high indoor load or a hot pull-down. Let the system run and stabilize, verify indoor conditions, then re-measure.",
      key: "Everything reads high because the box is hot." }
  ],
  txv: [
    { name: "Low charge / undercharge", sp: "low", hp: "low", sh: "high", sc: "low", dt: "low",
      text: "Low subcool with low head points to undercharge. At a hard undercharge the TXV can't hold superheat, so superheat climbs too. Leak search first, then weigh in and set to the data-plate subcool.",
      key: "Low subcool + low head. A restriction holds subcool normal or high." },
    { name: "Low charge (slight)", sp: "normal", hp: "low", sh: "normal", sc: "low", dt: "normal",
      text: "A TXV holds superheat, so a small undercharge shows up in subcooling. Low subcool with normal superheat points to undercharge/leak — confirm the subcool target on the data plate.",
      key: "Subcool low while superheat stays normal." },
    { name: "Liquid line restriction", sp: "low", hp: "normal", sh: "high", sc: "high", dt: "low",
      text: "Suspect a restriction (drier or liquid line). Liquid backs up in the condenser, so subcooling holds normal or high while suction and superheat starve. Feel for a temperature drop across the drier.",
      key: "Subcool normal/high with normal head — that's what separates it from low charge." },
    { name: "Overfeeding TXV / loose or insulated bulb", sp: "high", hp: "normal", sh: "low", sc: "low", dt: "low",
      text: "High suction with low superheat means the valve is overfeeding. Check the sensing bulb: mounting, contact, and insulation.",
      key: "High suction with low superheat." },
    { name: "Overcharge (slight)", sp: "normal", hp: "high", sh: "normal", sc: "high", dt: "normal",
      text: "High subcool and head point to overcharge (or a dirty condenser / airflow). Verify the condenser first, then recover to the data-plate subcool.",
      key: "High subcool + high head." },
    { name: "Low indoor airflow / low return temp", sp: "low", hp: "normal", sh: "low", sc: "normal", dt: "high",
      text: "Reads like an airflow problem, not a charge problem. Check filter, coil, blower, and ducts first.",
      key: "Low superheat with a HIGH temperature split." }
  ]
};

// Match observed statuses to the chart rows for the chosen metering type.
// Subcooling and head pressure carry extra weight: they're what actually
// separate a low charge from a restriction. Temperature split is the weakest
// signal (airflow and load both move it), so it counts least.
const WEIGHTS = {
  txv:   { sc: 2,    hp: 2, sh: 1.5, sp: 1,   dt: 0.5 },
  fixed: { sc: 0.75, hp: 2, sh: 2,   sp: 1.5, dt: 0.5 }
};

function matchConditions(st) {
  const set = st.metering === "Fixed orifice / piston" ? "fixed"
            : (st.metering === "TXV" || st.metering === "EEV") ? "txv" : null;
  const obs = { sp: st.suction.status, hp: st.head.status, sh: st.sh.status, sc: st.sc.status, dt: st.dt.status };
  const knownCount = Object.values(obs).filter((v) => v && v !== "unknown").length;
  if (!set) return { need: "metering", knownCount };
  if (knownCount < 3) return { need: "data", knownCount };

  const wt = WEIGHTS[set];
  const ranked = CONDITIONS[set].map((c) => {
    let score = 0, matched = 0, considered = 0;
    ["sp", "hp", "sh", "sc", "dt"].forEach((k) => {
      const rule = c[k], o = obs[k];
      if (rule === "any" || !o || o === "unknown") return;
      considered++;
      const w = wt[k] || 1;
      if (rule === o) { score += w; matched++; } else { score -= w; }
    });
    return { name: c.name, text: c.text, key: c.key, score, matched, considered };
  }).sort((a, b) => b.score - a.score || b.matched - a.matched);
  return { set, ranked, knownCount };
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

  if (m.need === "metering") {
    el.innerHTML = `<div class="conclusion"><p class="conclusion-text">Pick a <strong>metering device</strong> in Job Information (TXV, fixed orifice, or EEV) to match a condition.</p></div>`;
    return;
  }
  if (m.need === "data") {
    el.innerHTML = `<div class="conclusion"><p class="conclusion-text">Enter a few more readings to get a suspected condition — aim for suction &amp; liquid pressures plus line temps (at least 3 of the five readings above).</p></div>`;
    return;
  }
  const top = m.ranked[0];
  if (!top || top.score <= 0) {
    el.innerHTML = `<div class="conclusion"><p class="conclusion-text">These readings don't clearly match one pattern yet. Re-verify your gauge connection and line-temp clamp placement, then recheck.</p></div>`;
    return;
  }
  const alt = m.ranked[1];
  const showAlt = alt && alt.score > 0 && (top.score - alt.score) < 2;

  // Which of the five readings the app could NOT see. Naming these matters:
  // head + subcool are what separate a restriction from a low charge.
  const unseen = [
    ["Head pressure", st.head.status],
    ["Subcooling", st.sc.status],
    ["Superheat", st.sh.status],
    ["Suction pressure", st.suction.status],
    ["Temperature split", st.dt.status]
  ].filter(([, s]) => !s || s === "unknown").map(([n]) => n);

  const airflowBad = valOf("blowerRunning") === "No" ||
    ["Dirty", "Very dirty / restricted"].includes(valOf("filterCondition")) ||
    ["Dirty", "Frozen / iced"].includes(valOf("evapCoil"));

  let html = `<div class="conclusion ${airflowBad ? "tone-alert" : ""}">`;
  if (airflowBad) {
    html += `<p class="conclusion-text conclusion-airflow">Airflow looks compromised — correct filter, coil, and blower first. Airflow problems mimic charge problems on this chart, so trust the charge readings only after airflow is right.</p>`;
  }
  html += `<p class="conclusion-suspect">${top.name}</p>`;
  html += `<p class="conclusion-score">matched ${top.matched} of ${top.considered} readings entered (5 total) · ${st.metering}</p>`;
  html += `<p class="conclusion-text">${top.text}</p>`;
  if (top.key) html += `<p class="conclusion-key"><strong>What points here:</strong> ${top.key}</p>`;
  if (showAlt) html += `<p class="conclusion-alt">Could also be <strong>${alt.name}</strong> — ${alt.text}</p>`;
  if (unseen.length) {
    html += `<p class="conclusion-missing"><strong>Partial match — ${unseen.length} reading${unseen.length > 1 ? "s" : ""} missing:</strong> ${unseen.join(", ")}. Several conditions look alike without these. Enter them before acting on this.</p>`;
  }
  html += `<p class="conclusion-caveat">A direction to confirm, not a final call. Check the reading status above, verify against the data-plate targets, and recheck after any correction.</p>`;
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

  // Rule 8 — fixed orifice: superheat needs a real chart, not a rule of thumb.
  if (st7.metering === "Fixed orifice / piston" && !isNaN(superheat)) {
    add("info", "Piston superheat needs a chart",
      "Target superheat on a fixed orifice depends on indoor wet bulb and outdoor dry bulb. Use the manufacturer's superheat chart with a psychrometer — a fixed number will mislead you.");
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
        ["Temp split °F", split !== null ? round1(split) : ""]),
    g("staticPressure") ? `Static pressure: ${g("staticPressure")}` : "",
    g("airflowNotes") ? `Notes: ${g("airflowNotes")}` : "",
  ]);

  // Outdoor electrical --------------------------------------------
  section("OUTDOOR ELECTRICAL", [
    row(["Unit running", g("outdoorRunning")], ["Disconnect", g("disconnectOn")], ["Breaker", g("breakerOn")], ["Contactor", g("contactorPulled")]),
    row(["Line voltage", g("lineVoltage")], ["24V signal", g("lowVoltage")], ["Cap tested", g("capTested")], ["Cond fan", g("condFanRunning")], ["Compressor", g("compRunning")]),
    row(["Compressor amps", g("compAmps") ? g("compAmps") + "A" : ""], ["Condenser coil", g("condCoil")]),
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
    g("refrigNotes") ? `Notes: ${g("refrigNotes")}` : "",
  ].filter(Boolean);
  if (refrigLines.length) {
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
