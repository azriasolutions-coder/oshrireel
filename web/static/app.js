const dropZone = document.getElementById("drop");
const fileInput = document.getElementById("file-input");
const thumbsCard = document.getElementById("thumbs");
const thumbList = document.getElementById("thumb-list");
const clearBtn = document.getElementById("clear");
const musicSelect = document.getElementById("music");
const musicUpload = document.getElementById("music-upload");
const holdInput = document.getElementById("hold");
const xfadeInput = document.getElementById("xfade");
const transitionSelect = document.getElementById("transition");
const lookSelect = document.getElementById("look");
const aspectSelect = document.getElementById("aspect");
const motionSelect = document.getElementById("motion");
const templateSelect = document.getElementById("template");
const speedSelect = document.getElementById("speed");
const watermarkPosSelect = document.getElementById("watermark-pos");
const wmUpload = document.getElementById("wm-upload");
const wmName = document.getElementById("wm-name");
const wmClearBtn = document.getElementById("wm-clear");
const durationHint = document.getElementById("duration-hint");

let watermarkFile = null;

// 1-click presets — set every control to a tasteful combination.
// `reference` is calibrated to recreate the rabbi's source Shabbat video:
//   ~50% hard cuts, 25% short fade, 25% slide-left; warm look; zoom-heavy motion.
const TEMPLATES = {
  reference: { aspect: "9:16",    hold: 2.4, xfade: 0.35,
               transition: "cut,cut,cut,fade,slideleft,cut,fade,cut,slideleft,cut",
               look: "warm",      motion: "kenburns", speed: 1 },
  shabbat:   { aspect: "9:16",    hold: 2.8, xfade: 0.5, transition: "auto",   look: "warm",      motion: "kenburns", speed: 1 },
  festive:   { aspect: "9:16",    hold: 2.3, xfade: 0.4, transition: "auto",   look: "vivid",     motion: "random",   speed: 1 },
  lesson:    { aspect: "9:16",    hold: 3.2, xfade: 0.6, transition: "fade",   look: "warm",      motion: "kenburns", speed: 1 },
  news:      { aspect: "9:16",    hold: 2.0, xfade: 0.3, transition: "auto",   look: "cinematic", motion: "zoomin",   speed: 1 },
  promo:     { aspect: "9:16",    hold: 1.8, xfade: 0.3, transition: "auto",   look: "vivid",     motion: "random",   speed: 1 },
  dramatic:  { aspect: "9:16-hd", hold: 1.6, xfade: 0.25, transition: "cycle", look: "noir",      motion: "random",   speed: 1 },
};

function applyTemplate(name) {
  const t = TEMPLATES[name];
  if (!t) return;
  if (aspectSelect)     aspectSelect.value     = t.aspect;
  if (holdInput)        holdInput.value        = t.hold;
  if (xfadeInput)       xfadeInput.value       = t.xfade;
  if (transitionSelect) transitionSelect.value = t.transition;
  if (lookSelect)       lookSelect.value       = t.look;
  if (motionSelect)     motionSelect.value     = t.motion;
  if (speedSelect)      speedSelect.value      = String(t.speed);
  refreshDurationHint();
}
const generateBtn = document.getElementById("generate");
const shuffleBtn = document.getElementById("shuffle");
const bgUpload = document.getElementById("bg-upload");
const bgName = document.getElementById("bg-name");
const bgClearBtn = document.getElementById("bg-clear");
const statusEl = document.getElementById("status");
const resultCard = document.getElementById("result");
const videoEl = document.getElementById("video");
const downloadLink = document.getElementById("download");

let backgroundFile = null;

// item = {id, file, url, isVideo, transitionOverride, motionOverride,
//         textOverlay, pinnedPosition}
//   pinnedPosition: null | number (1-based) | "last"
let items = [];

// Motion options shown in the per-thumb motion selector.
const MOTION_OPTIONS = [
  ["",          "🎥 ברירת מחדל"],
  ["none",      "ללא תנועה"],
  ["zoomin",    "🔍 זום-אין"],
  ["zoomout",   "🔭 זום-אאוט"],
  ["kenburns",  "🎬 קן-ברנס"],
  ["panleft",   "⬅️ פאן שמאלה"],
  ["panright",  "➡️ פאן ימינה"],
  ["panup",     "⬆️ פאן למעלה"],
  ["pandown",   "⬇️ פאן למטה"],
  ["flash",     "⚡ פלאש כפול"],
  ["shake",     "📳 רעידה"],
  ["pulse",     "💓 פעימת בהירות"],
  ["punch",     "💥 זום-פאנץ'"],
  ["random",    "🎲 אקראי"],
];

function buildMotionOptions(selected) {
  return MOTION_OPTIONS.map(([val, label]) => {
    const sel = val === (selected || "") ? " selected" : "";
    return `<option value="${val}"${sel}>${label}</option>`;
  }).join("");
}
let dragId = null;
let allTransitions = [];

const TRANSITION_LABELS_HE = {
  fade: "מעבר חלק (Crossfade)",
  fadeblack: "החשכה ופתיחה",
  fadewhite: "הבהוב לבן",
  slideleft: "החלקה שמאלה",
  slideright: "החלקה ימינה",
  slideup: "החלקה למעלה",
  slidedown: "החלקה למטה",
  smoothleft: "החלקה רכה שמאלה",
  smoothright: "החלקה רכה ימינה",
  smoothup: "החלקה רכה למעלה",
  smoothdown: "החלקה רכה למטה",
  wipeleft: "ניגוב שמאלה",
  wiperight: "ניגוב ימינה",
  wipeup: "ניגוב למעלה",
  wipedown: "ניגוב למטה",
  circleopen: "פתיחת מעגל",
  circleclose: "סגירת מעגל",
  vertopen: "פתיחה אנכית",
  vertclose: "סגירה אנכית",
  horzopen: "פתיחה אופקית",
  horzclose: "סגירה אופקית",
  dissolve: "התמוססות",
  pixelize: "פיקסליזציה",
  diagtl: "אלכסון ↖ (פינה עליונה-שמאל)",
  diagtr: "אלכסון ↗ (פינה עליונה-ימין)",
  diagbl: "אלכסון ↙ (פינה תחתונה-שמאל)",
  diagbr: "אלכסון ↘ (פינה תחתונה-ימין)",
  hblur: "טשטוש דרמטי",
  radial: "סיבוב רדיאלי",
  zoomin: "זום אל הפנים",
  coverleft: "כיסוי שמאלה",
  coverright: "כיסוי ימינה",
  coverup: "כיסוי למעלה",
  coverdown: "כיסוי למטה",
  revealleft: "חשיפה שמאלה",
  revealright: "חשיפה ימינה",
  revealup: "חשיפה למעלה",
  revealdown: "חשיפה למטה",
  cut: "חיתוך חד (Cut)",
};

function transitionLabel(name) {
  return TRANSITION_LABELS_HE[name] || name;
}

function uid() { return Math.random().toString(36).slice(2, 9); }

// Shrink an image File via <canvas> to keep uploads small on cellular.
// Returns the resized File or the original (videos / already-small / errors).
async function resizeForUpload(file, maxDim = 1600, quality = 0.85) {
  if (!file || !file.type || !file.type.startsWith("image/")) return file;
  if (file.size && file.size < 400 * 1024) return file;  // already <400KB
  let img;
  const url = URL.createObjectURL(file);
  try {
    img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("image load failed"));
      i.src = url;
    });
  } catch (_) {
    URL.revokeObjectURL(url);
    return file;
  }
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  const longest = Math.max(w0, h0);
  if (longest <= maxDim) {
    URL.revokeObjectURL(url);
    return file;
  }
  const scale = maxDim / longest;
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(url);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) return file;
  const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], newName, {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

function refreshDurationHint() {
  const n = items.length;
  const hold = parseFloat(holdInput.value) || 2.5;
  const xfade = Math.min(parseFloat(xfadeInput.value) || 0.4, hold - 0.1);
  if (!n) { durationHint.textContent = ""; return; }
  const d = n === 1 ? hold : hold + (n - 1) * (hold - xfade);
  durationHint.textContent = `${n} תמונות · משך משוער: ${d.toFixed(1)} שניות`;
}

function buildTransitionOptions(selectedValue) {
  let html = '<option value="">— מעבר ברירת מחדל —</option>';
  for (const t of allTransitions) {
    const sel = t === selectedValue ? " selected" : "";
    html += `<option value="${t}"${sel}>${transitionLabel(t)}</option>`;
  }
  return html;
}

function buildPinOptions(item, n) {
  const pin = item.pinnedPosition;
  let html = `<option value=""${pin == null ? " selected" : ""}>🎲 אקראי</option>`;
  for (let i = 1; i <= n; i++) {
    const sel = pin === i ? " selected" : "";
    html += `<option value="${i}"${sel}>📌 ${i}</option>`;
  }
  const selLast = pin === "last" ? " selected" : "";
  html += `<option value="last"${selLast}>📌 אחרון</option>`;
  return html;
}

function isPinned(item) {
  return item.pinnedPosition != null && item.pinnedPosition !== "";
}

// Set a pin value on one item, clearing the same pin on any other item
// (so each slot is held by at most one image). Then move it to its target
// slot immediately, preserving the order of the unpinned items.
function setPin(itemId, rawValue) {
  const target = items.find((i) => i.id === itemId);
  if (!target) return;
  let newPin = null;
  if (rawValue === "last") {
    newPin = "last";
  } else if (rawValue !== "" && rawValue != null) {
    const v = parseInt(rawValue, 10);
    if (!Number.isNaN(v)) newPin = v;
  }
  if (newPin !== null) {
    for (const it of items) {
      if (it.id !== itemId && it.pinnedPosition === newPin) it.pinnedPosition = null;
    }
  }
  target.pinnedPosition = newPin;
  applyPinsKeepOrder();
}

// Place pinned items at their slots; the remaining items keep their current
// relative order. No randomness — use arrangeByPins() for that.
function applyPinsKeepOrder() {
  const n = items.length;
  if (n === 0) { render(); return; }
  const slots = new Array(n).fill(null);
  const remaining = [];

  for (const item of items) {
    let slotIdx = null;
    if (item.pinnedPosition === "last") {
      slotIdx = n - 1;
    } else if (typeof item.pinnedPosition === "number") {
      slotIdx = Math.max(1, Math.min(n, item.pinnedPosition)) - 1;
    }
    if (slotIdx !== null && slots[slotIdx] === null) {
      slots[slotIdx] = item;
    } else {
      remaining.push(item);
    }
  }
  let r = 0;
  for (let i = 0; i < n; i++) {
    if (slots[i] === null) slots[i] = remaining[r++];
  }
  items = slots;
  render();
}

// Reorder `items` so pinned ones go to their requested slots and the rest
// are shuffled into the remaining slots. Pinned positions are clamped to [1..n].
// If two pinned items resolve to the same slot, the earlier-in-current-order wins.
function arrangeByPins() {
  const n = items.length;
  if (n === 0) return;

  const slots = new Array(n).fill(null);
  const unpinned = [];

  for (const item of items) {
    let slotIdx = null;
    if (item.pinnedPosition === "last") {
      slotIdx = n - 1;
    } else if (typeof item.pinnedPosition === "number") {
      const v = Math.max(1, Math.min(n, item.pinnedPosition));
      slotIdx = v - 1;
    }
    if (slotIdx !== null && slots[slotIdx] === null) {
      slots[slotIdx] = item;
    } else {
      unpinned.push(item);
    }
  }

  // Fisher–Yates shuffle on the unpinned tail.
  for (let i = unpinned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unpinned[i], unpinned[j]] = [unpinned[j], unpinned[i]];
  }

  let u = 0;
  for (let i = 0; i < n; i++) {
    if (slots[i] === null) slots[i] = unpinned[u++];
  }
  items = slots;
  render();
}

function render() {
  thumbList.innerHTML = "";
  items.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "thumb";
    li.draggable = true;
    li.dataset.id = item.id;
    const isLast = idx === items.length - 1;
    const selectMarkup = isLast
      ? ""
      : `<select class="trans-select" data-id="${item.id}">${buildTransitionOptions(item.transitionOverride || "")}</select>`;
    const badge = item.transitionOverride && !isLast
      ? `<span class="trans-badge" title="אפקט אחרי תמונה זו">${transitionLabel(item.transitionOverride)}</span>`
      : "";
    const media = item.isVideo
      ? `<video src="${item.url}" muted playsinline preload="metadata"></video><span class="vbadge">▶ וידאו</span>`
      : `<img src="${item.url}" alt="" />`;
    const pinned = isPinned(item);
    const pinMarkup = `<select class="pin-select" data-id="${item.id}" title="הצמד למיקום קבוע">${buildPinOptions(item, items.length)}</select>`;
    const motionMarkup = `<select class="motion-select" data-id="${item.id}" title="תנועה ספציפית לתמונה זו">${buildMotionOptions(item.motionOverride || "")}</select>`;
    const textValue = (item.textOverlay || "").replace(/"/g, "&quot;");
    const textMarkup = `<input class="text-overlay" type="text" data-id="${item.id}" value="${textValue}" placeholder="כתובית (אופציונלי)" maxlength="80" />`;
    li.innerHTML = `
      ${media}
      <span class="idx${pinned ? " idx-pinned" : ""}">${idx + 1}</span>
      <div class="pin-chip${pinned ? " pinned" : ""}">${pinMarkup}</div>
      ${badge}
      <button class="remove" title="הסר" data-id="${item.id}">×</button>
      ${textMarkup}
      ${motionMarkup}
      ${selectMarkup}
    `;
    thumbList.appendChild(li);
  });
  thumbsCard.hidden = items.length === 0;
  generateBtn.disabled = items.length === 0;
  refreshDurationHint();
}

function addFiles(fileList) {
  const arr = Array.from(fileList).filter(
    (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
  );
  if (!arr.length) return;
  arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const file of arr) {
    items.push({
      id: uid(),
      file,
      url: URL.createObjectURL(file),
      isVideo: file.type.startsWith("video/"),
      transitionOverride: "",
      motionOverride: "",
      textOverlay: "",
      pinnedPosition: null,
    });
  }
  render();
}

function removeItem(id) {
  const idx = items.findIndex((i) => i.id === id);
  if (idx >= 0) {
    URL.revokeObjectURL(items[idx].url);
    items.splice(idx, 1);
    render();
  }
}

dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("over"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("over");
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
});
fileInput.addEventListener("change", (e) => addFiles(e.target.files));

clearBtn.addEventListener("click", () => {
  items.forEach((i) => URL.revokeObjectURL(i.url));
  items = [];
  render();
});

if (shuffleBtn) {
  shuffleBtn.addEventListener("click", () => {
    if (items.length === 0) return;
    arrangeByPins();
  });
}

if (bgUpload) {
  bgUpload.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    backgroundFile = f;
    bgName.textContent = f.name;
    bgClearBtn.hidden = false;
    e.target.value = "";
  });
}
if (bgClearBtn) {
  bgClearBtn.addEventListener("click", () => {
    backgroundFile = null;
    bgName.textContent = "";
    bgClearBtn.hidden = true;
  });
}

if (wmUpload) {
  wmUpload.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    watermarkFile = f;
    wmName.textContent = f.name;
    wmClearBtn.hidden = false;
    e.target.value = "";
  });
}
if (wmClearBtn) {
  wmClearBtn.addEventListener("click", () => {
    watermarkFile = null;
    wmName.textContent = "";
    wmClearBtn.hidden = true;
  });
}

if (templateSelect) {
  templateSelect.addEventListener("change", (e) => {
    if (e.target.value !== "custom") applyTemplate(e.target.value);
  });
  // Apply the default-selected template on first load (shabbat).
  if (templateSelect.value && templateSelect.value !== "custom") {
    applyTemplate(templateSelect.value);
  }
}

thumbList.addEventListener("click", (e) => {
  const btn = e.target.closest(".remove");
  if (btn) removeItem(btn.dataset.id);
});

thumbList.addEventListener("change", (e) => {
  const pinSel = e.target.closest(".pin-select");
  if (pinSel) {
    setPin(pinSel.dataset.id, pinSel.value);
    return;
  }
  const motionSel = e.target.closest(".motion-select");
  if (motionSel) {
    const item = items.find((i) => i.id === motionSel.dataset.id);
    if (item) { item.motionOverride = motionSel.value; render(); }
    return;
  }
  const sel = e.target.closest(".trans-select");
  if (!sel) return;
  const item = items.find((i) => i.id === sel.dataset.id);
  if (!item) return;
  item.transitionOverride = sel.value;
  render();
});

// Text overlay: update on input (don't re-render — keeps focus on the field).
thumbList.addEventListener("input", (e) => {
  const txt = e.target.closest(".text-overlay");
  if (!txt) return;
  const item = items.find((i) => i.id === txt.dataset.id);
  if (item) item.textOverlay = txt.value;
});

// Prevent the per-thumb controls from initiating a drag.
thumbList.addEventListener("mousedown", (e) => {
  if (e.target.closest(".trans-select")
   || e.target.closest(".pin-select")
   || e.target.closest(".motion-select")
   || e.target.closest(".text-overlay")) {
    const t = e.target.closest(".thumb");
    if (t) t.draggable = false;
  }
});
thumbList.addEventListener("mouseup", (e) => {
  const t = e.target.closest(".thumb");
  if (t) t.draggable = true;
});

thumbList.addEventListener("dragstart", (e) => {
  const thumb = e.target.closest(".thumb");
  if (!thumb) return;
  dragId = thumb.dataset.id;
  thumb.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
});
thumbList.addEventListener("dragend", (e) => {
  const thumb = e.target.closest(".thumb");
  if (thumb) thumb.classList.remove("dragging");
  dragId = null;
});
thumbList.addEventListener("dragover", (e) => {
  e.preventDefault();
  const target = e.target.closest(".thumb");
  if (!target || !dragId || target.dataset.id === dragId) return;
  const fromIdx = items.findIndex((i) => i.id === dragId);
  const toIdx = items.findIndex((i) => i.id === target.dataset.id);
  if (fromIdx < 0 || toIdx < 0) return;
  const [moved] = items.splice(fromIdx, 1);
  items.splice(toIdx, 0, moved);
  render();
});

holdInput.addEventListener("input", refreshDurationHint);
xfadeInput.addEventListener("input", refreshDurationHint);

async function loadTransitionList() {
  const r = await fetch("/api/transitions");
  const data = await r.json();
  allTransitions = data.all || [];
  // Build the global selector: special "auto" + "cycle" first, then each transition.
  let html = "";
  html += '<option value="auto">🎲 ערבוב חכם (מומלץ)</option>';
  html += '<option value="cycle">🔄 רוטציה — כל אפקט פעם אחת</option>';
  html += '<optgroup label="אפקט יחיד לכל המעברים">';
  for (const t of allTransitions) {
    html += `<option value="${t}">${transitionLabel(t)}</option>`;
  }
  html += "</optgroup>";
  transitionSelect.innerHTML = html;
  transitionSelect.value = "auto";
  // Once we have the catalogue, re-render thumbs so per-thumb selects show options.
  render();
}

async function loadMusicList() {
  const r = await fetch("/api/music");
  const tracks = await r.json();
  const current = musicSelect.value;
  musicSelect.innerHTML = '<option value="">— בלי שיר —</option>';
  for (const t of tracks) {
    const opt = document.createElement("option");
    opt.value = t.name;
    opt.textContent = t.name;
    musicSelect.appendChild(opt);
  }
  if (current && [...musicSelect.options].some(o => o.value === current)) {
    musicSelect.value = current;
  } else if (tracks.length) {
    musicSelect.value = tracks[0].name;
  }
}

musicUpload.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("file", file);
  statusEl.textContent = `מעלה ${file.name}...`;
  const r = await fetch("/api/music", { method: "POST", body: fd });
  if (r.ok) {
    await loadMusicList();
    const data = await r.json();
    musicSelect.value = data.name;
    statusEl.textContent = `הועלה: ${data.name}`;
  } else {
    statusEl.textContent = "ההעלאה נכשלה";
    statusEl.classList.add("error");
  }
  e.target.value = "";
});

generateBtn.addEventListener("click", async () => {
  if (!items.length) return;
  // Enforce pins one last time before sending — covers the case where the
  // user pinned, then dragged things around without re-shuffling.
  if (items.some(isPinned)) applyPinsKeepOrder();
  generateBtn.disabled = true;
  statusEl.classList.remove("error");
  resultCard.hidden = true;

  const fd = new FormData();
  // Resize each image client-side so uploads finish fast even on cellular.
  // Videos pass through unchanged.
  for (let i = 0; i < items.length; i++) {
    statusEl.textContent = `מכין תמונה ${i + 1}/${items.length}…`;
    const resized = await resizeForUpload(items[i].file);
    fd.append("images", resized, resized.name);
  }
  fd.append("music", musicSelect.value || "");
  fd.append("hold", holdInput.value || "2.5");
  fd.append("xfade", xfadeInput.value || "0.4");
  fd.append("transition", transitionSelect.value || "auto");
  fd.append("look", (lookSelect && lookSelect.value) || "none");
  fd.append("aspect", (aspectSelect && aspectSelect.value) || "9:16");
  fd.append("motion", (motionSelect && motionSelect.value) || "none");
  // Per-scene motion overrides (one entry per scene).
  const motionOverrides = items.map((it) => it.motionOverride || "");
  if (motionOverrides.some((v) => v)) {
    fd.append("per_image_motions", motionOverrides.join(","));
  }
  // Per-image overrides — one entry per gap (items.length - 1).
  const overrides = items.slice(0, -1).map((it) => it.transitionOverride || "");
  if (overrides.some((v) => v)) {
    fd.append("per_image_transitions", overrides.join(","));
  }
  if (backgroundFile) {
    statusEl.textContent = "מכין רקע…";
    const bgResized = await resizeForUpload(backgroundFile);
    fd.append("background", bgResized, bgResized.name);
  }
  if (watermarkFile && watermarkPosSelect && watermarkPosSelect.value !== "none") {
    const wmResized = await resizeForUpload(watermarkFile, 800, 0.9);
    fd.append("watermark", wmResized, wmResized.name);
  }
  fd.append("watermark_pos", (watermarkPosSelect && watermarkPosSelect.value) || "none");
  fd.append("speed", (speedSelect && speedSelect.value) || "1");
  // Per-scene texts: use "||" separator since text may contain commas/quotes.
  const texts = items.map((it) => (it.textOverlay || "").trim());
  if (texts.some((t) => t)) {
    fd.append("per_image_texts", texts.join("||"));
  }

  try {
    statusEl.textContent = "מעלה לשרת…";
    const r = await fetch("/api/generate", { method: "POST", body: fd });
    let submit = null;
    const raw = await r.text();
    try { submit = JSON.parse(raw); } catch (_) {
      throw new Error(
        r.status === 413
          ? "הקבצים גדולים מדי (הגבול 300MB). הקטן או חלק לכמה ריצות."
          : `שגיאה ${r.status} מהשרת — ${raw.slice(0, 200)}`
      );
    }
    if (!r.ok || !submit.ok || !submit.job_id) {
      throw new Error(submit.error || `שגיאה ${r.status}`);
    }
    const jobId = submit.job_id;
    statusEl.textContent = `ההזמנה נשלחה (${jobId.slice(0, 6)})…`;

    // Poll every 3 seconds for status updates.
    let consecutiveErrors = 0;
    while (true) {
      await new Promise((res) => setTimeout(res, 3000));
      let sr, s;
      try {
        sr = await fetch(`/api/job/${encodeURIComponent(jobId)}`);
        s = await sr.json();
      } catch (_) {
        consecutiveErrors++;
        if (consecutiveErrors >= 6) {
          throw new Error("אין תקשורת עם השרת. נסה לרענן ולבדוק את הסטטוס.");
        }
        statusEl.textContent = "בדיקת סטטוס נכשלה — מנסה שוב…";
        continue;
      }
      consecutiveErrors = 0;
      if (!s.ok) throw new Error(s.error || "סטטוס לא ידוע");

      if (s.status === "queued") {
        statusEl.textContent = `בתור — מקום ${s.queue_position || "?"} · ${s.images || 0} תמונות`;
      } else if (s.status === "rendering") {
        const sec = s.started_at ? Math.round((Date.now() / 1000) - s.started_at) : 0;
        statusEl.textContent = `מייצר… ${sec} שניות עברו`;
      } else if (s.status === "done") {
        const tsummary = (s.transitions && s.transitions.length)
          ? " · " + s.transitions.map(transitionLabel).join(" → ")
          : "";
        const took = (s.finished_at && s.started_at)
          ? ` (${Math.round(s.finished_at - s.started_at)}s)` : "";
        statusEl.textContent = `הסתיים ✓${took}${tsummary}`;
        videoEl.src = s.video_url + "?t=" + Date.now();
        downloadLink.href = s.video_url;
        downloadLink.setAttribute("download", s.video_filename || "video.mp4");
        resultCard.hidden = false;
        resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      } else if (s.status === "failed") {
        throw new Error("הייצור נכשל: " + (s.error || "סיבה לא ידועה"));
      } else {
        statusEl.textContent = "סטטוס: " + s.status;
      }
    }
  } catch (err) {
    statusEl.textContent = "נכשל: " + err.message;
    statusEl.classList.add("error");
  } finally {
    generateBtn.disabled = false;
  }
});

loadTransitionList();
loadMusicList();
render();
