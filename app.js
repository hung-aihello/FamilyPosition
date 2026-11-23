import { firebaseConfig, appCheckSiteKey } from "./config.js";

const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const STORE_KEY = "nhaminh.v1";
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // bỏ các ký tự dễ nhầm: i l o 0 1
const CODE_LEN = 10;
const PUSH_MIN_METERS = 15;     // di chuyển hơn 15 m thì gửi ngay
const PUSH_MAX_SECONDS = 45;    // đứng yên thì vẫn gửi lại mỗi 45 giây
const ONLINE_WINDOW = 2 * 60e3;
const IDLE_WINDOW = 15 * 60e3;

const AVATARS = [
  ["👩", "#fecdd3"], ["👨", "#bfdbfe"], ["👵", "#e9d5ff"], ["👴", "#fde68a"],
  ["👧", "#fbcfe8"], ["👦", "#bae6fd"], ["👶", "#fed7aa"], ["🧑", "#bbf7d0"],
  ["🐶", "#fef3c7"], ["🐱", "#e0e7ff"], ["🦊", "#ffedd5"], ["🐼", "#e7e5e4"],
];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* ------------------------------------------------------------------ */
/* Local state                                                         */
/* ------------------------------------------------------------------ */
const state = loadState();
function loadState() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { /* trình duyệt chặn storage */ }
  if (!s.memberId) s.memberId = randomString(16, "abcdefghijklmnopqrstuvwxyz0123456789");
  if (s.sharing === undefined) s.sharing = true;
  return s;
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* bỏ qua */ }
}

function randomString(len, alphabet) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
const newFamilyCode = () => randomString(CODE_LEN, CODE_ALPHABET);
const formatCode = (c) => `${c.slice(0, 5)}-${c.slice(5)}`;
function parseCode(raw) {
  if (!raw) return null;
  raw = raw.trim();
  const fromUrl = raw.match(/[?&]f=([^&#\s]+)/);
  if (fromUrl) raw = fromUrl[1];
  const code = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (code.length !== CODE_LEN) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}
const inviteUrl = () => `${location.origin}${location.pathname}?f=${state.familyId}`;

/* ------------------------------------------------------------------ */
/* UI helpers                                                          */
/* ------------------------------------------------------------------ */
function showScreen(id) {
  for (const s of $$(".screen")) s.hidden = s.id !== id;
}
let toastTimer;
function toast(msg, ms = 2800) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function relTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return "vừa xong";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}
function distanceMeters(a, b) {
  const R = 6371e3, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function formatDistance(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toLocaleString("vi-VN", { maximumFractionDigits: m < 10000 ? 1 : 0 })} km`;
}

function renderAvatarGrid(container, selected, onPick) {
  container.innerHTML = "";
  for (const [emoji, color] of AVATARS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "avatar-opt";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(emoji === selected));
    b.setAttribute("aria-label", `Hình ${emoji}`);
    b.textContent = emoji;
    b.style.setProperty("--c", color);
    b.addEventListener("click", () => {
      for (const o of container.children) o.setAttribute("aria-checked", "false");
      b.setAttribute("aria-checked", "true");
      onPick(emoji, color);
    });
    container.appendChild(b);
  }
}

function setupDialogs() {
  for (const d of $$("dialog")) {
    d.addEventListener("click", (e) => {
      if (e.target === d || e.target.closest("[data-close]")) d.close();
    });
  }
}

/* ------------------------------------------------------------------ */
/* Firebase                                                            */
/* ------------------------------------------------------------------ */
let fb; // { db, ref, ... }
async function loadFirebase() {
  const [{ initializeApp }, rtdb] = await Promise.all([
    import(`${FIREBASE_SDK}firebase-app.js`),
    import(`${FIREBASE_SDK}firebase-database.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  await initAppCheck(app); // phải chạy trước khi dùng database
  fb = { ...rtdb, db: rtdb.getDatabase(app) };
}

// App Check: chứng minh request đến từ chính trang web này (không phải script/bot dùng key bị lộ).
// reCAPTCHA Enterprise (score-based) chạy ngầm, người dùng không phải bấm gì. Chưa có site key thì bỏ qua.
// (reCAPTCHA v3 "classic" đã bị Firebase ngừng nhận đăng ký mới.)
async function initAppCheck(app) {
  if (!appCheckSiteKey) return;
  try {
    // Trên máy dev, Firebase in ra "debug token" trong console để đăng ký ở Firebase Console.
    if (["localhost", "127.0.0.1"].includes(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import(`${FIREBASE_SDK}firebase-app-check.js`);
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  } catch (e) {
    console.warn("Không khởi tạo được App Check:", e);
  }
}
const famRef = (path = "") => fb.ref(fb.db, `families/${state.familyId}${path ? "/" + path : ""}`);
const meRef = () => famRef(`members/${state.memberId}`);

function profilePayload() {
  return { name: state.name, emoji: state.emoji, color: state.color, sharing: !!state.sharing };
}

/* ------------------------------------------------------------------ */
/* Onboarding                                                          */
/* ------------------------------------------------------------------ */
let pendingInvite = null;

function gotoStep(step) {
  for (const s of $$(".ob-step")) s.hidden = s.dataset.step !== step;
  const first = $(`.ob-step[data-step="${step}"] input, .ob-step[data-step="${step}"] .btn-primary`);
  if (step === "profile") setTimeout(() => $("#nameInput").focus(), 50);
  else first?.focus({ preventScroll: true });
}

function startOnboarding() {
  showScreen("onboarding");
  const nameInput = $("#nameInput");
  nameInput.value = state.name || "";
  const validate = () => { $("#profileNext").disabled = !(nameInput.value.trim() && state.emoji); };
  renderAvatarGrid($("#avatarGrid"), state.emoji, (emoji, color) => {
    state.emoji = emoji; state.color = color; validate();
  });
  nameInput.addEventListener("input", validate);
  nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") nameInput.blur(); });
  validate();

  $("#profileNext").addEventListener("click", () => {
    state.name = nameInput.value.trim().slice(0, 24);
    saveState();
    showFamilyStep();
  });
  for (const b of $$("[data-goto]")) b.addEventListener("click", () => gotoStep(b.dataset.goto));

  $("#joinInvited").addEventListener("click", () => joinFamily(pendingInvite, $("#joinInvited")));
  $("#ignoreInvite").addEventListener("click", () => { pendingInvite = null; showFamilyStep(); });

  $("#createFamily").addEventListener("click", () => {
    state.familyId = newFamilyCode();
    saveState();
    gotoStep("permission");
  });
  $("#showJoin").addEventListener("click", () => {
    $("#joinForm").hidden = false;
    $("#codeInput").focus();
  });
  $("#joinForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = parseCode($("#codeInput").value);
    if (!code) return showCodeError("Mã chưa đúng. Mã gồm 10 ký tự, ví dụ: abcde-fghjk");
    joinFamily(code, $("#joinForm .btn"));
  });

  $("#grantLocation").addEventListener("click", () => { state.sharing = true; saveState(); enterMain(true); });
  $("#skipLocation").addEventListener("click", () => { state.sharing = false; saveState(); enterMain(false); });

  if (state.name && state.emoji) showFamilyStep(); else gotoStep("profile");
}

function showFamilyStep() {
  $("#inviteBox").hidden = !pendingInvite;
  $("#chooseBox").hidden = !!pendingInvite;
  if (pendingInvite) $("#inviteCode").textContent = formatCode(pendingInvite);
  gotoStep("family");
}

function showCodeError(msg) {
  const el = $("#codeError");
  el.textContent = msg;
  el.hidden = false;
}

async function joinFamily(code, btn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Đang kiểm tra…";
  try {
    const snap = await fb.get(fb.ref(fb.db, `families/${code}/members`));
    if (!snap.exists()) {
      if (pendingInvite) toast("Không tìm thấy nhóm này. Hãy nhờ người nhà gửi lại lời mời.");
      else showCodeError("Không tìm thấy nhóm với mã này.");
      return;
    }
    state.familyId = code;
    saveState();
    gotoStep("permission");
  } catch (err) {
    console.error(err);
    toast("Không kết nối được. Kiểm tra mạng rồi thử lại nhé.");
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

/* ------------------------------------------------------------------ */
/* Main screen                                                         */
/* ------------------------------------------------------------------ */
let map, myAccuracyCircle;
const markers = new Map(); // memberId -> { marker, html }
let members = {};
let serverOffset = 0;
let connected = false;
let watchId = null;
let myPos = null;
let lastPush = { at: 0, lat: null, lng: null };
let battery = null;
let geoError = null;
let userMovedMap = false;  // người dùng đã tự kéo bản đồ thì không tự zoom nữa
let autoFitCount = 0;      // số người có vị trí ở lần tự zoom gần nhất
let wakeLock = null;

const now = () => Date.now() + serverOffset;
const isDesktop = () => matchMedia("(min-width: 720px)").matches;

async function enterMain(requestLocation) {
  showScreen("main");
  initMap();
  observeSheet();
  bindMainUi();

  // Không await: Firebase tự xếp hàng khi mất mạng, UI không phải chờ.
  const initial = { ...profilePayload(), joinedAt: fb.serverTimestamp() };
  if (!state.sharing) Object.assign(initial, { lat: null, lng: null, acc: null });
  fb.update(meRef(), initial).catch(onWriteError);

  fb.onValue(fb.ref(fb.db, ".info/serverTimeOffset"), (s) => { serverOffset = s.val() || 0; });
  fb.onValue(fb.ref(fb.db, ".info/connected"), (s) => {
    connected = !!s.val();
    if (connected) {
      fb.onDisconnect(meRef()).update({ online: false });
      if (document.visibilityState === "visible") fb.update(meRef(), { online: true }).catch(onWriteError);
    }
    updateStatus();
  });
  fb.onValue(famRef("members"), (s) => {
    members = s.val() || {};
    if (!members[state.memberId] && state.familyId) {
      // Bản ghi của mình bị xoá (ví dụ dữ liệu bị dọn) — ghi lại.
      fb.update(meRef(), profilePayload()).catch(onWriteError);
    }
    render();
  });

  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      const read = () => { battery = { level: Math.round(b.level * 100), charging: b.charging }; };
      read();
      b.addEventListener("levelchange", read);
      b.addEventListener("chargingchange", read);
    }).catch(() => {});
  }

  if (state.sharing && requestLocation !== false) startWatching();
  updateStatus();

  setInterval(() => {
    if (myPos && state.sharing && document.visibilityState === "visible") pushPosition(true);
    render();
  }, 30e3);

  document.addEventListener("visibilitychange", () => {
    if (!fb || !state.familyId) return;
    const visible = document.visibilityState === "visible";
    fb.update(meRef(), { online: visible }).catch(() => {});
    if (visible) {
      if (myPos && state.sharing) pushPosition(true);
      if (state.wake) requestWakeLock();
      render();
    }
  });
}

function initMap() {
  map = L.map("map", { zoomControl: false, attributionControl: true }).setView([16.05, 106.5], 5);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  map.attributionControl.setPrefix(false);
  map.on("dragstart", () => { userMovedMap = true; });
}

function observeSheet() {
  const sheet = $("#sheet");
  const apply = () => {
    const h = isDesktop() ? 0 : sheet.getBoundingClientRect().height;
    $("#main").style.setProperty("--sheet-h", `${h}px`);
  };
  new ResizeObserver(apply).observe(sheet);
  addEventListener("resize", apply);
  apply();
}

function mapPadding() {
  const sheet = $("#sheet").getBoundingClientRect();
  return isDesktop()
    ? { paddingTopLeft: [sheet.width + 40, 90], paddingBottomRight: [40, 40] }
    : { paddingTopLeft: [40, 100], paddingBottomRight: [40, sheet.height + 40] };
}

function focusOn(points, animate = true) {
  if (!points.length) return;
  const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
  const opts = { ...mapPadding(), maxZoom: 16, animate };
  if (animate) map.flyToBounds(bounds, { ...opts, duration: 0.8 });
  else map.fitBounds(bounds, opts);
}

// Dữ liệu từ server + bản ghi của chính mình lấy từ máy (để vẫn hiện "Tôi" khi mạng chậm/mất).
function allMembers() {
  const me = { ...(members[state.memberId] || {}), ...profilePayload() };
  if (state.sharing && myPos) Object.assign(me, { lat: myPos.lat, lng: myPos.lng, acc: myPos.acc });
  if (!state.sharing) { delete me.lat; delete me.lng; }
  return { ...members, [state.memberId]: me };
}

function locatedMembers() {
  return Object.entries(allMembers())
    .filter(([, m]) => m && m.sharing !== false && typeof m.lat === "number" && typeof m.lng === "number")
    .map(([id, m]) => ({ id, ...m }));
}

function memberStatus(m, id) {
  if (id === state.memberId) return state.sharing && myPos ? "on" : "off";
  const age = now() - (m.updatedAt || 0);
  if (m.online && age < ONLINE_WINDOW) return "on";
  if (age < IDLE_WINDOW) return "idle";
  return "off";
}

function render() {
  if (!map) return;
  renderMarkers();
  renderList();
  // Tự zoom để thấy cả nhà mỗi khi có thêm người xuất hiện (cho đến khi người dùng tự kéo bản đồ).
  if (!userMovedMap) {
    const pts = locatedMembers();
    if (pts.length > autoFitCount) {
      focusOn(pts, autoFitCount > 0);
      autoFitCount = pts.length;
    }
  }
}

function renderMarkers() {
  const located = locatedMembers();
  const seen = new Set();
  for (const m of located) {
    seen.add(m.id);
    const isMe = m.id === state.memberId;
    const stale = !isMe && now() - (m.updatedAt || 0) > IDLE_WINDOW;
    const html = `<div class="pin${isMe ? " me" : ""}${stale ? " stale" : ""}" style="--c:${escapeHtml(m.color || "#ccfbf1")}">
      <div class="pin-bubble">${escapeHtml(m.emoji || "🙂")}</div>
      <div class="pin-label">${escapeHtml(isMe ? "Tôi" : m.name)}</div></div>`;
    let entry = markers.get(m.id);
    if (!entry) {
      const marker = L.marker([m.lat, m.lng], {
        icon: L.divIcon({ html, className: "", iconSize: [56, 66], iconAnchor: [28, 66] }),
        keyboard: true, title: m.name, zIndexOffset: isMe ? 1000 : 0,
      }).addTo(map);
      marker.on("click", () => focusOn([m]));
      entry = { marker, html };
      markers.set(m.id, entry);
    } else {
      entry.marker.setLatLng([m.lat, m.lng]);
      if (entry.html !== html) {
        entry.marker.setIcon(L.divIcon({ html, className: "", iconSize: [56, 66], iconAnchor: [28, 66] }));
        entry.html = html;
      }
    }
  }
  for (const [id, entry] of markers) {
    if (!seen.has(id)) { entry.marker.remove(); markers.delete(id); }
  }

  if (myPos && state.sharing) {
    if (!myAccuracyCircle) {
      myAccuracyCircle = L.circle([myPos.lat, myPos.lng], {
        radius: myPos.acc, stroke: false, fillColor: "#0f766e", fillOpacity: 0.12, interactive: false,
      }).addTo(map);
    } else {
      myAccuracyCircle.setLatLng([myPos.lat, myPos.lng]).setRadius(myPos.acc);
    }
  } else if (myAccuracyCircle) {
    myAccuracyCircle.remove();
    myAccuracyCircle = null;
  }
}

function renderList() {
  const list = $("#memberList");
  const entries = Object.entries(allMembers()).filter(([, m]) => m && m.name);
  entries.sort(([a, ma], [b, mb]) => {
    if (a === state.memberId) return -1;
    if (b === state.memberId) return 1;
    return (mb.updatedAt || 0) - (ma.updatedAt || 0);
  });

  $("#memberCount").textContent = entries.length ? `· ${entries.length} người` : "";
  $("#emptyState").hidden = entries.length > 1;

  list.innerHTML = "";
  for (const [id, m] of entries) {
    const isMe = id === state.memberId;
    const status = memberStatus(m, id);
    const hasPos = m.sharing !== false && typeof m.lat === "number";

    const meta = [];
    if (isMe) {
      if (!state.sharing) meta.push("Đã tắt chia sẻ vị trí");
      else if (geoError) meta.push(geoError);
      else if (!myPos) meta.push("Đang tìm vị trí…");
      else meta.push("Đang chia sẻ vị trí");
    } else if (m.sharing === false) {
      meta.push("Đã tắt chia sẻ vị trí");
    } else if (!hasPos) {
      meta.push("Chưa có vị trí");
    } else {
      meta.push(status === "on" ? "Đang mở app" : relTime(now() - (m.updatedAt || 0)));
      if (myPos && state.sharing) meta.push(`cách ${formatDistance(distanceMeters(myPos, m))}`);
    }
    if (!isMe && typeof m.battery === "number") {
      const low = m.battery <= 20 && !m.charging;
      meta.push(`<span class="batt${low ? " low" : ""}">${m.charging ? "⚡" : "🔋"} ${m.battery}%</span>`);
    }

    const li = document.createElement("li");
    li.className = "member";
    li.innerHTML = `
      <button class="member-main" type="button" ${hasPos ? "" : "disabled"}
              aria-label="${escapeHtml(isMe ? "Vị trí của tôi" : `Xem vị trí của ${m.name}`)}">
        <span class="avatar" style="--c:${escapeHtml(m.color || "#ccfbf1")}">
          ${escapeHtml(m.emoji || "🙂")}<span class="status ${status === "on" ? "on" : status === "idle" ? "idle" : ""}"></span>
        </span>
        <span class="member-info">
          <span class="member-name">${escapeHtml(m.name)}${isMe ? ' <span class="me">(bạn)</span>' : ""}</span>
          <span class="member-meta">${meta.map((x) => (x.startsWith("<span") ? x : escapeHtml(x))).join(" · ")}</span>
        </span>
      </button>`;
    li.querySelector(".member-main").addEventListener("click", () => {
      if (hasPos) focusOn([m]);
    });

    if (!isMe && hasPos) {
      const go = document.createElement("a");
      go.className = "go-btn";
      go.href = `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}`;
      go.target = "_blank";
      go.rel = "noopener";
      go.setAttribute("aria-label", `Chỉ đường tới ${m.name}`);
      go.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 21 3l-8 18-2-8-8-2Z"/></svg>';
      li.appendChild(go);
    }
    list.appendChild(li);
  }
}

function updateStatus() {
  const dot = $("#statusDot"), text = $("#statusText");
  dot.className = "dot";
  if (!connected) { dot.classList.add("warn"); text.textContent = "Đang kết nối…"; return; }
  if (!state.sharing) { text.textContent = "Không chia sẻ vị trí"; return; }
  if (geoError) { dot.classList.add("warn"); text.textContent = "Chưa lấy được vị trí"; return; }
  if (!myPos) { dot.classList.add("warn"); text.textContent = "Đang tìm vị trí…"; return; }
  dot.classList.add("on");
  text.textContent = "Đang chia sẻ vị trí";
}

/* ------------------------------------------------------------------ */
/* Geolocation                                                         */
/* ------------------------------------------------------------------ */
function startWatching() {
  if (!("geolocation" in navigator)) {
    geoError = "Thiết bị không hỗ trợ định vị";
    updateStatus();
    return;
  }
  if (watchId !== null) return;
  geoError = null;
  watchId = navigator.geolocation.watchPosition(onPosition, onGeoError, {
    enableHighAccuracy: true, maximumAge: 10e3, timeout: 30e3,
  });
}

function stopWatching() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  myPos = null;
}

function onPosition(p) {
  geoError = null;
  myPos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0) };
  pushPosition(false);
  updateStatus();
  render();
}

function onGeoError(err) {
  if (err.code === err.PERMISSION_DENIED) {
    geoError = "Chưa được cấp quyền vị trí";
    toast("Bạn chưa cho phép vị trí. Hãy bật lại trong cài đặt trình duyệt.", 5000);
    stopWatching();
  } else if (!myPos) {
    geoError = "Chưa bắt được GPS";
  }
  updateStatus();
  render();
}

function pushPosition(force) {
  if (!myPos || !state.sharing || !state.familyId) return;
  const t = Date.now();
  const moved = lastPush.lat === null ? Infinity : distanceMeters(lastPush, myPos);
  if (!force && moved < PUSH_MIN_METERS && t - lastPush.at < PUSH_MAX_SECONDS * 1000) return;
  lastPush = { at: t, lat: myPos.lat, lng: myPos.lng };
  const data = {
    lat: +myPos.lat.toFixed(6), lng: +myPos.lng.toFixed(6), acc: myPos.acc,
    updatedAt: fb.serverTimestamp(), sharing: true,
    online: document.visibilityState === "visible",
  };
  if (battery) { data.battery = battery.level; data.charging = battery.charging; }
  fb.update(meRef(), data).catch(onWriteError);
}

function onWriteError(err) {
  console.error(err);
  if (String(err?.code || err).includes("PERMISSION_DENIED")) {
    toast("Máy chủ từ chối dữ liệu. Kiểm tra lại Security Rules của Firebase.", 5000);
  }
}

/* ------------------------------------------------------------------ */
/* Wake lock                                                           */
/* ------------------------------------------------------------------ */
async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; });
  } catch { /* người dùng/hệ thống từ chối */ }
}
function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

/* ------------------------------------------------------------------ */
/* Main UI bindings                                                    */
/* ------------------------------------------------------------------ */
function bindMainUi() {
  $("#sheetHandle").addEventListener("click", () => {
    const sheet = $("#sheet");
    const collapsed = sheet.classList.toggle("collapsed");
    $("#sheetHandle").setAttribute("aria-expanded", String(!collapsed));
  });

  $("#locateMe").addEventListener("click", () => {
    if (!state.sharing) return toast("Bạn đang tắt chia sẻ vị trí. Bật lại trong Cài đặt.");
    if (!myPos) {
      startWatching();
      return toast(geoError || "Đang tìm vị trí của bạn…");
    }
    focusOn([myPos]);
  });
  $("#fitAll").addEventListener("click", () => {
    const pts = locatedMembers();
    if (!pts.length) return toast("Chưa có ai chia sẻ vị trí.");
    focusOn(pts);
  });

  $("#openInvite").addEventListener("click", openInvite);
  $("#emptyInvite").addEventListener("click", openInvite);
  $("#openSettings").addEventListener("click", openSettings);
  $("#statusPill").addEventListener("click", openSettings);

  $("#shareLink").addEventListener("click", async () => {
    const url = inviteUrl();
    if (navigator.share) {
      try {
        await navigator.share({ title: "Nhà Mình", text: "Vào nhóm gia đình mình trên Nhà Mình nhé 🏡", url });
        return;
      } catch (e) { if (e.name === "AbortError") return; }
    }
    copyLink();
  });
  $("#copyLink").addEventListener("click", copyLink);

  $("#saveSettings").addEventListener("click", saveSettings);
  $("#leaveFamily").addEventListener("click", () => { $("#settingsDialog").close(); $("#confirmLeave").showModal(); });
  $("#confirmLeaveYes").addEventListener("click", leaveFamily);

  if (!("wakeLock" in navigator)) $("#wakeRow").hidden = true;
  if (state.wake) requestWakeLock();
}

function openInvite() {
  const url = inviteUrl();
  const qr = $("#qr");
  qr.innerHTML = "";
  if (window.QRCode) {
    new QRCode(qr, { text: url, width: 200, height: 200, colorDark: "#1c1917", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
  }
  $("#familyCodeDisplay").textContent = formatCode(state.familyId);
  $("#inviteDialog").showModal();
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(inviteUrl());
    toast("Đã sao chép đường dẫn mời ✓");
  } catch {
    prompt("Sao chép đường dẫn này:", inviteUrl());
  }
}

let draftAvatar = null;
function openSettings() {
  $("#settingsName").value = state.name;
  draftAvatar = [state.emoji, state.color];
  renderAvatarGrid($("#settingsAvatarGrid"), state.emoji, (e, c) => { draftAvatar = [e, c]; });
  $("#shareToggle").checked = !!state.sharing;
  $("#wakeToggle").checked = !!state.wake;
  $("#settingsDialog").showModal();
}

async function saveSettings() {
  const name = $("#settingsName").value.trim().slice(0, 24);
  if (!name) return toast("Tên không được để trống.");
  const wasSharing = state.sharing;
  state.name = name;
  [state.emoji, state.color] = draftAvatar;
  state.sharing = $("#shareToggle").checked;
  state.wake = $("#wakeToggle").checked;
  saveState();

  const patch = profilePayload();
  if (!state.sharing) Object.assign(patch, { lat: null, lng: null, acc: null });
  fb.update(meRef(), patch).catch(onWriteError);

  if (state.sharing && !wasSharing) { lastPush = { at: 0, lat: null, lng: null }; startWatching(); }
  if (!state.sharing && wasSharing) stopWatching();
  if (state.wake) requestWakeLock(); else releaseWakeLock();

  $("#settingsDialog").close();
  updateStatus();
  render();
  toast("Đã lưu ✓");
}

async function leaveFamily() {
  const ref = meRef();
  delete state.familyId; // đặt trước để listener không ghi lại bản ghi vừa xoá
  saveState();
  stopWatching();
  releaseWakeLock();
  try {
    await fb.onDisconnect(ref).cancel();
    await fb.remove(ref);
  } catch (e) { console.error(e); }
  location.replace(location.pathname);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
async function boot() {
  setupDialogs();

  const configured = firebaseConfig?.databaseURL && !/YOUR_/.test(firebaseConfig.databaseURL + firebaseConfig.apiKey);
  if (!configured) { showScreen("setupNeeded"); return; }

  const params = new URLSearchParams(location.search);
  const invited = parseCode(params.get("f") || "");
  if (params.has("f")) history.replaceState(null, "", location.pathname);

  try {
    await loadFirebase();
  } catch (e) {
    console.error(e);
    toast("Không tải được dữ liệu. Kiểm tra kết nối mạng.", 6000);
    return;
  }

  if (invited && invited !== state.familyId) {
    pendingInvite = invited;
    startOnboarding();
  } else if (state.familyId && state.name && state.emoji) {
    enterMain(state.sharing);
  } else {
    startOnboarding();
  }

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

boot();
