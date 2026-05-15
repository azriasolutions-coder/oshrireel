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
const durationHint = document.getElementById("duration-hint");
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

// item = {id, file, url, isVideo, transitionOverride, motionOverride, pinnedPosition}
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
    li.innerHTML = `
      ${media}
      <span class="idx${pinned ? " idx-pinned" : ""}">${idx + 1}</span>
      <div class="pin-chip${pinned ? " pinned" : ""}">${pinMarkup}</div>
      ${badge}
      <button class="remove" title="הסר" data-id="${item.id}">×</button>
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

// Prevent the per-thumb selects from initiating a drag.
thumbList.addEventListener("mousedown", (e) => {
  if (e.target.closest(".trans-select") || e.target.closest(".pin-select") || e.target.closest(".motion-select")) {
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
  statusEl.textContent = "מייצר סרטון... זה לוקח כמה שניות.";
  resultCard.hidden = true;

  const fd = new FormData();
  for (const it of items) fd.append("images", it.file, it.file.name);
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
    fd.append("background", backgroundFile, backgroundFile.name);
  }

  try {
    const r = await fetch("/api/generate", { method: "POST", body: fd });
    let data = null;
    const raw = await r.text();
    try { data = JSON.parse(raw); } catch (_) {
      throw new Error(
        r.status === 502 || r.status === 504
          ? `השרת קרס באמצע הייצור (HTTP ${r.status}). סיבה סבירה: התמונות גדולות מדי או יותר מדי תמונות בבת אחת. נסה עם פחות תמונות או תמונות קטנות יותר.`
          : r.status === 413
          ? "הקבצים גדולים מדי בסך הכל (הגבול 300MB). הקטן או חלק לכמה ריצות."
          : `שגיאה ${r.status} מהשרת — ${raw.slice(0, 200)}`
      );
    }
    if (!r.ok || !data.ok) throw new Error(data.error || `שגיאה ${r.status}`);
    const tsummary = (data.transitions && data.transitions.length)
      ? " · מעברים: " + data.transitions.map(transitionLabel).join(" → ")
      : "";
    statusEl.textContent = `הסתיים: ${data.images} תמונות${tsummary}`;
    videoEl.src = data.url + "?t=" + Date.now();
    downloadLink.href = data.url;
    downloadLink.setAttribute("download", data.video);
    resultCard.hidden = false;
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
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
