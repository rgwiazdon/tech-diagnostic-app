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

/* ---- 2. Build the photo checklist ------------------------------ */
const PHOTOS = [
  ["photo_dataplate", "Equipment data plate"],
  ["photo_tstat", "Thermostat"],
  ["photo_filter", "Filter"],
  ["photo_evap", "Evaporator coil (if accessible)"],
  ["photo_cond", "Condenser coil"],
  ["photo_electrical", "Electrical readings"],
  ["photo_cap", "Capacitor reading (if applicable)"],
  ["photo_failed", "Failed part (if applicable)"],
  ["photo_refrig", "Refrigerant readings"],
  ["photo_final", "Final operating condition"],
  ["photo_estimate", "Estimate options"],
];
$("#photoList").innerHTML = PHOTOS.map(
  ([key, text]) => `
  <label class="photo-item">
    <input type="checkbox" data-field="${key}" />
    <span>${text}</span>
  </label>`
).join("");
// Tint a photo row green once its box is checked.
$("#photoList").addEventListener("change", (e) => {
  const item = e.target.closest(".photo-item");
  if (item) item.classList.toggle("is-checked", e.target.checked);
});

/* ---- 3. Save / restore progress (localStorage) ----------------- */
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
  $$(".photo-item").forEach((item) =>
    item.classList.toggle("is-checked", $("input", item).checked)
  );
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
  const within = actual >= min && actual <= max;
  rangeEl.textContent = `Range ${round1(min)} – ${round1(max)} MFD  (actual ${round1(actual)})`;
  chipEl.textContent = within ? "In tolerance" : "Out of tolerance";
  chipEl.className = "readout-chip " + (within ? "is-pass" : "is-fail");
  return { min, max, actual, within };
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

// Auto-fill a saturation field from the PT chart.
// which = "suction" (uses dew) or "liquid" (uses bubble).
// Respects manual entries: only fills when the field is empty or was
// itself auto-filled (tracked with data-auto). Clears its own auto value
// if the pressure is removed or goes off-chart.
function ptAutoFill(which) {
  const refrig = valOf("refrigerant");
  const isSuction = which === "suction";
  const satEl = field(isSuction ? "suctionSat" : "liquidSat");
  const pressure = numOf(isSuction ? "suctionPressure" : "liquidPressure");
  if (!satEl) return;

  const temp = ptLookupTemp(refrig, pressure, isSuction ? "dew" : "bubble");
  const wasAuto = satEl.dataset.auto === "1";

  if (temp === null) {
    // No valid lookup: clear only if we had auto-filled it.
    if (wasAuto) { satEl.value = ""; satEl.dataset.auto = ""; satEl.classList.remove("is-auto"); }
    return;
  }
  // Fill only when safe (empty or previously auto), so we never stomp a manual value.
  if (satEl.value === "" || wasAuto) {
    satEl.value = round1(temp);
    satEl.dataset.auto = "1";
    satEl.classList.add("is-auto");
  }
}

// Update the PT readout tile + the two field hints (display only — never
// writes into the saturation fields, so it's safe to call on every change).
function ptRefreshDisplay() {
  const refrig = valOf("refrigerant");
  const table = (typeof PT_DATA !== "undefined") ? PT_DATA[refrig] : null;
  const chip = $("#ptChip");
  const text = $("#ptText");

  if (!table) {
    chip.textContent = "—";
    chip.className = "readout-chip";
    text.textContent = refrig === "Other"
      ? 'PT lookup isn\'t available for "Other". Enter saturation temps manually.'
      : "Select a refrigerant in Job Information, then enter a pressure below to auto-fill its saturation temp.";
    setHint("suctionSatHint", "");
    setHint("liquidSatHint", "");
    return;
  }

  chip.textContent = table.glide ? `Glide ~${table.glideF}°F` : "No glide";
  chip.className = "readout-chip " + (table.glide ? "is-warn" : "is-pass");
  text.textContent = `${refrig} — ${table.note}`;

  // Live derived values shown as hints (whether or not the field auto-filled).
  const sp = numOf("suctionPressure");
  const lp = numOf("liquidPressure");
  const sDew = ptLookupTemp(refrig, sp, "dew");
  const lBub = ptLookupTemp(refrig, lp, "bubble");

  setHint("suctionSatHint", isNaN(sp) ? "" :
    (sDew !== null ? `PT: ${round1(sDew)}°F (${refrig} dew)` : "Suction pressure is off the chart range"));
  setHint("liquidSatHint", isNaN(lp) ? "" :
    (lBub !== null ? `PT: ${round1(lBub)}°F (${refrig} bubble)` : "Liquid pressure is off the chart range"));
}

/* ---- 6. Estimate / manager warning ----------------------------- */
function checkManagerWarning() {
  const leaving = valOf("leavingNoEstimate");
  const called = valOf("calledManager");
  // Show the red banner only when leaving without estimates AND
  // the manager was not confirmed as called.
  const needWarning = leaving === "Yes" && called !== "Yes";
  $("#managerWarning").classList.toggle("is-hidden", !needWarning);
  return needWarning;
}

/* ---- 7. Diagnostic guidance ------------------------------------ */
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

  // Rule 3 — capacitor out of tolerance (either side).
  const capOut = (caps.herm && !caps.herm.within) || (caps.fan && !caps.fan.within);
  if (capOut) {
    add("alert", "Capacitor out of tolerance",
      "Confirm proper voltage to the unit, then replace the capacitor before continuing your diagnosis. A weak cap can mimic other failures.");
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
  if (split !== null && split < 14) {
    add("caution", "Poor temperature split",
      "Don't jump straight to low charge. Check airflow, coil condition, blower operation, duct issues, and your refrigerant readings first.");
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
  const head = row(["Tech", g("techName")], ["Job #", g("jobNumber")], ["Date", g("jobDate")]);
  if (head) parts.push(head);
  if (g("customerName")) parts.push(`Customer: ${g("customerName")}`);

  const section = (title, lines) => {
    const body = lines.filter(Boolean);
    if (body.length) { parts.push("", title); body.forEach((l) => parts.push(l)); }
  };

  // Complaint / system --------------------------------------------
  section("COMPLAINT", [g("complaint")]);
  section("SYSTEM", [row(["Equipment", g("equipType")], ["Refrigerant", g("refrigerant")])]);

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
  if (herm) capLines.push(`HERM (compressor): rated ${g("hermRated")} / actual ${g("hermActual")} MFD — ${herm.within ? "in tolerance" : "OUT of tolerance"} (range ${round1(herm.min)}–${round1(herm.max)})`);
  if (fan) capLines.push(`FAN: rated ${g("fanRated")} / actual ${g("fanActual")} MFD — ${fan.within ? "in tolerance" : "OUT of tolerance"} (range ${round1(fan.min)}–${round1(fan.max)})`);
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
    // Flag when saturation temps were derived from the PT chart.
    const satAuto = (field("suctionSat") && field("suctionSat").dataset.auto === "1") ||
                    (field("liquidSat") && field("liquidSat").dataset.auto === "1");
    if (satAuto && valOf("refrigerant")) {
      refrigLines.push(`Saturation temps derived from ${valOf("refrigerant")} PT chart (dew for suction, bubble for liquid) — reference values.`);
    }
    refrigLines.push("Note: readings not used to charge until airflow, coil, blower, and basic electrical verified.");
  }
  section("REFRIGERANT READINGS", refrigLines);

  // Findings / status ----------------------------------------------
  section("FINDINGS", [
    g("suspectedIssue") ? `Suspected issue: ${g("suspectedIssue")}` : "",
    g("repairAction") ? `Performed / recommended: ${g("repairAction")}` : "",
    g("systemStatus") ? `System status: ${g("systemStatus")}` : "",
  ]);

  // Estimates ------------------------------------------------------
  const estLines = [
    row(["Estimates built", g("estimatesBuilt")], ["All estimates sent", g("estimatesSent")]),
    row(["Leaving without sent estimates", g("leavingNoEstimate")], ["Manager contacted", g("calledManager")]),
  ].filter(Boolean);
  if (checkManagerWarning()) {
    estLines.push("** ACTION REQUIRED: Manager call required before leaving this job without sent estimates. **");
  }
  section("ESTIMATES & MANAGER", estLines);

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
  $$(".photo-item").forEach((i) => i.classList.remove("is-checked"));
  // reset the tolerance default
  if (field("capTolerance")) field("capTolerance").value = "6";
  onChange();
  showStep(0);
});

/* ---- 10. Central change handler -------------------------------- */
// Runs after any input: recalculates, saves, and refreshes live views.
function onChange() {
  calcSplit();
  calcCapacitors();
  calcRefrigerant();
  ptRefreshDisplay();
  checkManagerWarning();
  renderGuidance();
  buildSummary();
  saveState();
}

/* ---- 10a. PT auto-fill wiring ---------------------------------- */
// When a pressure or the refrigerant changes, fill the matching saturation
// field from the PT chart. These fire before the document-level onChange,
// so superheat/subcooling recompute with the freshly filled value.
if (field("suctionPressure"))
  field("suctionPressure").addEventListener("input", () => ptAutoFill("suction"));
if (field("liquidPressure"))
  field("liquidPressure").addEventListener("input", () => ptAutoFill("liquid"));
if (field("refrigerant"))
  field("refrigerant").addEventListener("change", () => { ptAutoFill("suction"); ptAutoFill("liquid"); });
// If a tech types a saturation temp by hand, stop treating it as auto-filled.
["suctionSat", "liquidSat"].forEach((k) => {
  const el = field(k);
  if (el) el.addEventListener("input", () => { el.dataset.auto = ""; el.classList.remove("is-auto"); });
});
// Listen for typing and selecting across the whole app.
document.addEventListener("input", onChange);
document.addEventListener("change", onChange);

/* ---- 11. Start up ---------------------------------------------- */
restoreState();   // bring back any saved progress
onChange();       // compute everything once
showStep(0);      // open on the first step

// Register the service worker so the app works offline in the field.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* offline support just won't be available; the app still runs */
    });
  });
}
