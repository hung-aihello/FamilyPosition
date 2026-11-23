import { firebaseConfig, appCheckSiteKey } from "./config.js";

const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const STORE_KEY = "nhaminh.v1";
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // bỏ các ký tự dễ nhầm: i l o 0 1
const CODE_LEN = 10;
const PUSH_MIN_METERS = 15;     // di chuyển hơn 15 m thì gửi ngay
const PUSH_MAX_SECONDS = 45;    // đứng yên thì vẫn gửi lại mỗi 45 giây
const ONLINE_WINDOW = 2 * 60e3;
const IDLE_WINDOW = 15 * 60e3;
const POOR_ACCURACY = 1000;        // m — sai số lớn hơn mức này coi là định vị kém (thường là laptop)
const GOOD_FIX_PROTECT = 10 * 60e3; // vị trí tốt trong 10 phút gần đây không bị định vị kém ghi đè

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
  if (s.sharing === undefined) s.sharing = true;     // chia sẻ vị trí — cấp NGƯỜI (đồng bộ giữa các máy)
  if (s.deviceGps === undefined) s.deviceGps = true; // lấy GPS từ máy này — cấp MÁY
  // Hàng đợi rời nhóm lưu cặp {f: mã nhóm, m: id}; bản trước chỉ lưu mã nhóm.
  s.leaveQueue = (s.leaveQueue || []).map((x) => (typeof x === "string" ? { f: x, m: s.memberId } : x));
  return s;
}
// Máy này có đang cung cấp vị trí không: người đó bật chia sẻ VÀ máy này bật GPS.
const gpsOn = () => !!state.sharing && state.deviceGps !== false;
// So khớp tên không phân biệt hoa/thường và dấu: "Hưng" ~ "hung".
const foldName = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
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
  // Trên máy dev: bỏ qua App Check (debug token chưa đăng ký sẽ làm kết nối bị treo).
  // Sau khi Enforce mà cần chạy local: mở console gõ localStorage.appCheckDebug = 1, tải lại,
  // rồi đăng ký debug token in ra trong Firebase Console → App Check → Manage debug tokens.
  if (["localhost", "127.0.0.1"].includes(location.hostname)) {
    let debug = null;
    try { debug = localStorage.getItem("appCheckDebug"); } catch { /* bỏ qua */ }
    if (!debug) return;
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
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
    switchFamily(newFamilyCode());
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

  $("#grantLocation").addEventListener("click", () => {
    state.sharing = true; state.deviceGps = true; saveState(); enterMain({ grant: true });
  });
  // "Để sau" = máy này không lấy GPS (chỉ xem). Không tắt chia sẻ cấp người, vì người đó
  // có thể đang chia sẻ từ điện thoại khác.
  $("#skipLocation").addEventListener("click", () => { state.deviceGps = false; saveState(); enterMain(); });

  $("#claimNew").addEventListener("click", () => { switchFamily(claimCode); gotoStep("permission"); });

  if (state.name && state.emoji) showFamilyStep(); else gotoStep("profile");
}

function showFamilyStep() {
  $("#inviteBox").hidden = !pendingInvite;
  $("#chooseBox").hidden = !!pendingInvite;
  if (pendingInvite) $("#inviteCode").textContent = formatCode(pendingInvite);
  gotoStep("family");
}

// Hàng đợi "rời nhóm": lưu trong localStorage để nếu đang mất mạng (hoặc trang tải lại trước khi
// server xác nhận) thì lần mở app sau vẫn xoá tiếp — không để lại "bóng ma" trong nhóm cũ.
const sameSlot = (a, b) => a.f === b.f && a.m === b.m;
const memberPath = ({ f, m }) => `families/${f}/members/${m}`;

function queueLeave(f, m = state.memberId) {
  if (!f) return;
  const slot = { f, m };
  if (!(state.leaveQueue || []).some((x) => sameSlot(x, slot))) state.leaveQueue = [...(state.leaveQueue || []), slot];
  saveState();
  try { fb.onDisconnect(fb.ref(fb.db, memberPath(slot))).cancel().catch(() => {}); } catch { /* bỏ qua */ }
}

// Đừng xoá chỗ mà mình đang (vào lại) dùng.
function unqueue(slot) {
  state.leaveQueue = (state.leaveQueue || []).filter((x) => !sameSlot(x, slot));
}

function processLeaveQueue() {
  const done = (slot) => { unqueue(slot); saveState(); };
  return Promise.all((state.leaveQueue || []).map((slot) =>
    fb.remove(fb.ref(fb.db, memberPath(slot)))
      .then(() => done(slot))
      .catch((e) => { if (isDenied(e)) done(slot); }) // bị cấm thì cũng không xoá được nữa → bỏ khỏi hàng đợi
  ));
}

const isDenied = (err) => /PERMISSION_DENIED|permission.denied/i.test(String(err?.code || err?.message || err));

// Vào nhóm với tư cách NGƯỜI MỚI; đang ở nhóm khác thì rời nhóm cũ.
function switchFamily(code) {
  if (state.familyId && state.familyId !== code) queueLeave(state.familyId);
  unqueue({ f: code, m: state.memberId });
  state.familyId = code;
  state.member = false; // false = vừa vào nhóm (khác undefined = cài từ bản cũ)
  saveState();
  processLeaveQueue();
}

// Nhận lại danh tính đã có trong nhóm (cùng một người, máy khác) → không tạo thành viên mới.
function claimMember(code, mid, rec) {
  const cur = { f: state.familyId, m: state.memberId };
  if (cur.f && !sameSlot(cur, { f: code, m: mid })) queueLeave(cur.f, cur.m); // bỏ bản ghi rác của máy này (nếu có)
  unqueue({ f: code, m: mid });
  Object.assign(state, {
    familyId: code, memberId: mid, member: true,
    name: rec.name, emoji: rec.emoji || state.emoji, color: rec.color || state.color,
    sharing: rec.sharing !== false,
  });
  saveState();
  processLeaveQueue();
}

/* ---- Bước "Bạn đã có trong nhóm chưa?" ---- */
let claimCode = null;
function showClaimStep(code, list) {
  claimCode = code;
  const mine = foldName(state.name);
  const entries = Object.entries(list || {})
    .filter(([, m]) => m && m.name)
    .map(([id, m]) => ({ id, m, match: !!mine && foldName(m.name) === mine }))
    .sort((a, b) => (b.match - a.match) || ((b.m.updatedAt || 0) - (a.m.updatedAt || 0)));

  const ul = $("#claimList");
  ul.innerHTML = "";
  for (const { id, m, match } of entries) {
    const li = document.createElement("li");
    const meta = m.updatedAt ? `cập nhật ${relTime(Date.now() - m.updatedAt)}` : "chưa có vị trí";
    li.innerHTML = `
      <button class="claim-item${match ? " match" : ""}" type="button" aria-label="${escapeHtml(`Tôi là ${m.name}`)}">
        <span class="avatar" style="--c:${escapeHtml(m.color || "#ccfbf1")}">${escapeHtml(m.emoji || "🙂")}</span>
        <span class="member-info">
          <span class="member-name">${escapeHtml(m.name)}</span>
          <span class="member-meta">${escapeHtml(meta)}</span>
        </span>
        <span class="claim-tag">${match ? "Có phải bạn?" : "Đây là tôi"}</span>
      </button>`;
    li.querySelector("button").addEventListener("click", () => {
      claimMember(code, id, m);
      toast(`Chào ${m.name}! Máy này sẽ dùng chung với máy cũ của bạn.`, 4000);
      gotoStep("permission");
    });
    ul.appendChild(li);
  }
  gotoStep("claim");
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
    showClaimStep(code, snap.val());
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
let membersLoaded = false;
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
let kicked = false;

// Bản ghi của mình bị xoá từ phía quản trị (reason "removed") hoặc server từ chối cho vào
// nhóm vì ID bị cấm (reason "banned") → thoát về màn hình chào.
function onKicked(reason = "removed") {
  if (kicked) return;
  kicked = true;
  stopWatching();
  releaseWakeLock();
  fb.onDisconnect(meRef()).cancel().catch(() => {});
  delete state.familyId;
  state.member = false;
  saveState();
  try { sessionStorage.setItem("nhaminh.kicked", reason); } catch { /* bỏ qua */ }
  location.replace(location.pathname);
}

// Cùng một người dùng nhiều máy: tên/hình/chia sẻ đổi ở máy kia thì máy này theo.
function syncFromServer(mine) {
  let changed = false;
  for (const k of ["name", "emoji", "color"]) {
    if (mine[k] && mine[k] !== state[k]) { state[k] = mine[k]; changed = true; }
  }
  if (typeof mine.sharing === "boolean" && mine.sharing !== state.sharing) {
    state.sharing = mine.sharing;
    changed = true;
    if (gpsOn()) { lastPush = { at: 0, lat: null, lng: null }; startWatching(); } else stopWatching();
  }
  if (changed) { saveState(); updateStatus(); }
}

const now = () => Date.now() + serverOffset;
const isDesktop = () => matchMedia("(min-width: 720px)").matches;

async function enterMain(opts = {}) {
  showScreen("main");
  initMap();
  observeSheet();
  bindMainUi();

  // Chỉ tạo hồ sơ khi mới vào nhóm. Đã là thành viên thì KHÔNG ghi lại hồ sơ,
  // để nếu bị xoá khỏi nhóm thì máy này nhận ra và thoát, thay vì tự tạo lại.
  // (Rules bắt buộc có "name", nên các lần ghi vị trí/online sau đó cũng không tạo lại được.)
  // Không await: Firebase tự xếp hàng khi mất mạng, UI không phải chờ.
  if (state.member !== true) {
    const initial = profilePayload();
    // Chỉ đặt joinedAt khi thật sự mới vào nhóm (member === false). Bản cài từ phiên bản cũ
    // (member === undefined) đã có joinedAt từ trước — đừng ghi đè.
    if (state.member === false) initial.joinedAt = fb.serverTimestamp();
    if (!state.sharing) Object.assign(initial, { lat: null, lng: null, acc: null });
    // Server từ chối (ID bị cấm) → không cho ở lại màn hình bản đồ.
    fb.update(meRef(), initial).catch((e) => (isDenied(e) ? onKicked("banned") : onWriteError(e)));
  } else if (opts.grant) {
    // Nhận lại danh tính cũ rồi bấm "Cho phép" → bật chia sẻ cho người này.
    fb.update(meRef(), { sharing: true }).catch(onWriteError);
  }

  fb.onValue(fb.ref(fb.db, ".info/serverTimeOffset"), (s) => { serverOffset = s.val() || 0; });
  fb.onValue(fb.ref(fb.db, ".info/connected"), (s) => {
    connected = !!s.val();
    if (connected && !kicked) {
      fb.onDisconnect(meRef()).update({ online: false }).catch(() => {});
      if (document.visibilityState === "visible") fb.update(meRef(), { online: true }).catch(() => {});
    }
    updateStatus();
  });
  fb.onValue(famRef("members"), (s) => {
    members = s.val() || {};
    const firstLoad = !membersLoaded;
    membersLoaded = true;
    const mine = members[state.memberId];
    if (mine) {
      if (!state.member) { state.member = true; saveState(); }
      syncFromServer(mine);
    } else if (state.member) {
      return onKicked();
    }
    render();
    if (firstLoad && myPos) pushPosition(false); // GPS có trước dữ liệu nhóm → giờ mới gửi
  });

  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      const read = () => { battery = { level: Math.round(b.level * 100), charging: b.charging }; };
      read();
      b.addEventListener("levelchange", read);
      b.addEventListener("chargingchange", read);
    }).catch(() => {});
  }

  if (gpsOn()) startWatching();
  updateStatus();

  setInterval(() => {
    if (myPos && gpsOn() && document.visibilityState === "visible") pushPosition(true);
    render();
  }, 30e3);

  document.addEventListener("visibilitychange", () => {
    if (!fb || !state.familyId) return;
    const visible = document.visibilityState === "visible";
    fb.update(meRef(), { online: visible }).catch(() => {});
    if (visible) {
      if (myPos && gpsOn()) pushPosition(true);
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
  // Máy này đang lấy GPS → dùng vị trí trên máy. Máy chỉ xem → giữ vị trí từ máy khác (trên server).
  if (gpsOn() && myPos) Object.assign(me, { lat: myPos.lat, lng: myPos.lng, acc: myPos.acc });
  if (!state.sharing) { delete me.lat; delete me.lng; }
  return { ...members, [state.memberId]: me };
}

// Vị trí "của tôi" để tính khoảng cách: GPS máy này, hoặc vị trí từ máy khác của tôi.
function myLocation() {
  const me = allMembers()[state.memberId];
  return state.sharing && typeof me?.lat === "number" ? me : null;
}

function locatedMembers() {
  return Object.entries(allMembers())
    .filter(([, m]) => m && m.sharing !== false && typeof m.lat === "number" && typeof m.lng === "number")
    .map(([id, m]) => ({ id, ...m }));
}

function memberStatus(m, id) {
  if (id === state.memberId && gpsOn()) return myPos ? "on" : "off";
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
      marker.on("click", () => focusOn([marker.getLatLng()])); // vị trí hiện tại, không phải lúc tạo marker
      entry = { marker, html };
      markers.set(m.id, entry);
    } else {
      entry.marker.setLatLng([m.lat, m.lng]);
      entry.marker.getElement()?.setAttribute("title", m.name);
      if (entry.html !== html) {
        entry.marker.setIcon(L.divIcon({ html, className: "", iconSize: [56, 66], iconAnchor: [28, 66] }));
        entry.html = html;
      }
    }
  }
  for (const [id, entry] of markers) {
    if (!seen.has(id)) { entry.marker.remove(); markers.delete(id); }
  }

  if (myPos && gpsOn()) {
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
  const here = myLocation();
  for (const [id, m] of entries) {
    const isMe = id === state.memberId;
    const status = memberStatus(m, id);
    const hasPos = m.sharing !== false && typeof m.lat === "number";

    const meta = [];
    if (isMe) {
      if (!state.sharing) meta.push("Đã tắt chia sẻ vị trí");
      else if (!gpsOn()) meta.push(hasPos ? `Máy này chỉ xem · vị trí từ máy khác, ${relTime(now() - (m.updatedAt || 0))}` : "Máy này chỉ xem");
      else if (geoError) meta.push(geoError);
      else if (!myPos) meta.push("Đang tìm vị trí…");
      else meta.push("Đang chia sẻ vị trí");
    } else if (m.sharing === false) {
      meta.push("Đã tắt chia sẻ vị trí");
    } else if (!hasPos) {
      meta.push("Chưa có vị trí");
    } else {
      meta.push(status === "on" ? "Đang mở app" : relTime(now() - (m.updatedAt || 0)));
      if (here) meta.push(`cách ${formatDistance(distanceMeters(here, m))}`);
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
  if (!gpsOn()) { text.textContent = "Máy này chỉ xem"; return; }
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
  // Chờ có dữ liệu nhóm: cần biết vị trí đang lưu để không ghi đè vị trí tốt hơn từ máy khác.
  if (!myPos || !gpsOn() || !state.familyId || !membersLoaded) return;
  const t = Date.now();
  const moved = lastPush.lat === null ? Infinity : distanceMeters(lastPush, myPos);
  if (!force && moved < PUSH_MIN_METERS && t - lastPush.at < PUSH_MAX_SECONDS * 1000) return;

  // Dùng nhiều máy: máy định vị kém (laptop đoán theo IP/wifi, lệch hàng km) không được
  // ghi đè vị trí tốt mà điện thoại vừa gửi lên gần đây.
  const stored = members[state.memberId];
  if (myPos.acc > POOR_ACCURACY && typeof stored?.acc === "number" && stored.acc <= POOR_ACCURACY
      && now() - (stored.updatedAt || 0) < GOOD_FIX_PROTECT) return;

  lastPush = { at: t, lat: myPos.lat, lng: myPos.lng };
  const data = {
    lat: +myPos.lat.toFixed(6), lng: +myPos.lng.toFixed(6), acc: myPos.acc,
    updatedAt: fb.serverTimestamp(),
    online: document.visibilityState === "visible",
  };
  if (battery) { data.battery = battery.level; data.charging = battery.charging; }
  fb.update(meRef(), data).catch(onWriteError);
}

function onWriteError(err) {
  if (kicked) return; // bị xoá khỏi nhóm thì các lần ghi bị từ chối là đương nhiên
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
    if (!gpsOn()) {
      const here = myLocation();
      return here ? focusOn([here]) : toast("Máy này đang chỉ xem. Bật “Lấy vị trí từ máy này” trong Cài đặt.");
    }
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
  $("#confirmLeaveYes").addEventListener("click", (e) => { e.currentTarget.disabled = true; leaveFamily(); });
  $("#rekeyFamily").addEventListener("click", () => { $("#settingsDialog").close(); $("#confirmRekey").showModal(); });
  $("#confirmRekeyYes").addEventListener("click", (e) => {
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = "Đang tạo mã mới…";
    rekeyFamily();
  });

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
  $("#gpsToggle").checked = state.deviceGps !== false;
  $("#wakeToggle").checked = !!state.wake;
  $("#settingsDialog").showModal();
}

async function saveSettings() {
  const name = $("#settingsName").value.trim().slice(0, 24);
  if (!name) return toast("Tên không được để trống.");
  const wasGps = gpsOn();
  state.name = name;
  [state.emoji, state.color] = draftAvatar;
  state.sharing = $("#shareToggle").checked;   // cấp người: áp dụng cho mọi máy của tôi
  state.deviceGps = $("#gpsToggle").checked;   // cấp máy: chỉ máy này
  state.wake = $("#wakeToggle").checked;
  saveState();

  const patch = profilePayload();
  if (!state.sharing) Object.assign(patch, { lat: null, lng: null, acc: null });
  fb.update(meRef(), patch).catch(onWriteError);

  if (gpsOn() && !wasGps) { lastPush = { at: 0, lat: null, lng: null }; startWatching(); }
  if (!gpsOn() && wasGps) stopWatching();
  if (state.wake) requestWakeLock(); else releaseWakeLock();

  $("#settingsDialog").close();
  updateStatus();
  render();
  toast("Đã lưu ✓");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function leaveFamily() {
  kicked = true; // đặt trước để listener không hiểu nhầm là bị xoá khỏi nhóm
  stopWatching();
  releaseWakeLock();
  queueLeave(state.familyId);
  delete state.familyId;
  state.member = false;
  saveState();
  // Không chờ server vô hạn: mất mạng thì hàng đợi sẽ xoá tiếp ở lần mở app sau.
  await Promise.race([processLeaveQueue(), sleep(2500)]);
  location.replace(location.pathname);
}

// Đổi mã nhóm: chuyển mình sang nhóm mới với mã mới, rồi mời lại những người cần.
// Ai chỉ có mã cũ sẽ không thấy mình nữa (mã cũ bị lộ / muốn loại ai đó ra).
async function rekeyFamily() {
  kicked = true; // rời nhóm cũ có chủ đích, đừng báo "bị xoá"
  stopWatching();
  switchFamily(newFamilyCode());
  try { sessionStorage.setItem("nhaminh.openInvite", "1"); } catch { /* bỏ qua */ }
  await Promise.race([processLeaveQueue(), sleep(2500)]);
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

  processLeaveQueue(); // xoá nốt các lần rời nhóm chưa kịp gửi lên server

  let kickedReason = null, openInviteAfter = false;
  try {
    kickedReason = sessionStorage.getItem("nhaminh.kicked");
    openInviteAfter = sessionStorage.getItem("nhaminh.openInvite") === "1";
    sessionStorage.removeItem("nhaminh.kicked");
    sessionStorage.removeItem("nhaminh.openInvite");
  } catch { /* bỏ qua */ }
  if (kickedReason) {
    const msg = kickedReason === "banned"
      ? "Bạn không thể vào nhóm này nữa. Hãy liên hệ người trong nhà."
      : "Bạn không còn ở trong nhóm này (đã rời nhóm trên máy khác hoặc bị xoá). Có thể vào lại bằng mã mời.";
    setTimeout(() => toast(msg, 6000), 300);
  }

  if (invited && invited !== state.familyId) {
    pendingInvite = invited;
    startOnboarding();
  } else if (state.familyId && state.name && state.emoji) {
    enterMain();
    if (openInviteAfter) {
      setTimeout(() => { openInvite(); toast("Đã tạo mã nhóm mới ✓ Gửi lời mời cho người nhà nhé."); }, 600);
    }
  } else {
    startOnboarding();
  }

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

boot();
