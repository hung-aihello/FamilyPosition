import { firebaseConfig, appCheckSiteKey, shortcutUrl } from "./config.js";
import { sound } from "./sound.js";
import * as native from "./native.js";

// Tăng mỗi lần phát hành (xem "Lịch sử phiên bản" trong README).
const APP_VERSION = "1.12.2";
const APP_RELEASED = "24/11/2026";
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

// Địa điểm quen thuộc
const PLACE_PRESETS = [
  ["🏠", "Nhà", 100], ["🏫", "Trường", 200], ["🏢", "Công ty", 200], ["👵", "Nhà ông bà", 100],
  ["🏥", "Bệnh viện", 200], ["🛒", "Chợ", 150], ["⚽", "Sân chơi", 150], ["☕", "Quán quen", 100],
  ["⛪", "Nhà thờ", 150], ["🏋️", "Phòng tập", 100], ["🏖️", "Đi chơi", 400], ["⭐", "Chỗ quen", 150],
];
const PLACE_RADII = [[100, "Nhỏ · 100 m"], [200, "Vừa · 200 m"], [400, "Lớn · 400 m"]];
const PLACE_EXIT_MARGIN = 50;   // phải ra xa thêm 50 m mới tính là "đã rời" — tránh nhấp nháy vào/ra
const PLACE_MAX_ACC = 150;      // chỉ xét vào/ra khi sai số GPS ≤ 150 m
const PLACE_QUIET = 5 * 60e3;   // địa điểm vừa tạo/sửa: không ghi "đã đến" cho những người đang sẵn ở đó
const EVENT_KEEP = 3 * 864e5;   // dòng thời gian giữ 3 ngày
const MOVING_SPEED = 1.5;       // m/s (~5 km/h) trở lên coi là đang di chuyển
const WALK_SPEED = 2.5;         // m/s (~9 km/h) trở xuống coi là đi bộ
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

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
  if (s.bgGps === undefined) s.bgGps = true;         // app native: chia sẻ cả khi chạy nền — cấp MÁY
  if (s.sfx === undefined) s.sfx = true;             // âm thanh hiệu ứng — cấp MÁY
  if (s.music === undefined) s.music = true;         // nhạc nền — cấp MÁY
  // Hàng đợi rời nhóm lưu cặp {f: mã nhóm, m: id}; bản trước chỉ lưu mã nhóm.
  s.leaveQueue = (s.leaveQueue || []).map((x) => (typeof x === "string" ? { f: x, m: s.memberId } : x));
  return s;
}
// Máy này có đang cung cấp vị trí không: người đó bật chia sẻ VÀ máy này bật GPS.
const gpsOn = () => !!state.sharing && state.deviceGps !== false;
// App native đang gửi vị trí cả khi chạy nền / tắt màn hình.
const bgTracking = () => native.isNative && gpsOn() && state.bgGps !== false;
// App có đang hiện trên màn hình không. Trong app native dùng sự kiện của hệ điều hành
// (WebView Android không phải lúc nào cũng đổi document.visibilityState khi về nền).
let appActive = true;
const appVisible = () => (native.isNative ? appActive : document.visibilityState === "visible");
// Trường "online" = vị trí đang được cập nhật trực tiếp: đang mở app, hoặc app native đang chạy nền
// (chạy nền vẫn gửi ít nhất mỗi PUSH_MAX_SECONDS nên vẫn hiện "đang chia sẻ").
const liveOnline = () => appVisible() || bgTracking();
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
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// Rung nhẹ khi chạm (Android). iOS không hỗ trợ → bỏ qua.
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* bỏ qua */ } };
// Giờ:phút cho hôm nay, "hôm qua 17:40", hoặc ngày/tháng.
function clockTime(ts) {
  const d = new Date(ts), today = new Date();
  const hm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const days = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (days === 0) return hm;
  if (days === 1) return `hôm qua ${hm}`;
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
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
  // Hộp thoại mở/đóng (bằng bất cứ cách nào) → tiếng "vút" lên/xuống
  const swoosh = new MutationObserver((list) => {
    for (const r of list) (r.target.open ? sound.open : sound.close)();
  });
  for (const d of $$("dialog")) {
    d.addEventListener("click", (e) => {
      if (e.target === d || e.target.closest("[data-close]")) d.close();
    });
    bindSwipeToClose(d);
    swoosh.observe(d, { attributes: true, attributeFilter: ["open"] });
  }
}

/* ---- Âm thanh ---- */
// Chạm vào bất cứ thứ gì bấm được → tiếng "pụp" nhẹ (nút nào có âm riêng thì âm riêng thay thế).
const TAPPABLE = "button, a.btn, .choice, [role=radio], input[type=checkbox], .leaflet-marker-icon";
function bindTapSound() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest?.(TAPPABLE);
    if (el && !el.disabled) sound.tap();
  }, true);
}
function setSfx(on) {
  state.sfx = !!on;
  saveState();
  sound.setSfx(state.sfx);
  if (on) sound.success();
}
function setMusic(on) {
  state.music = !!on;
  saveState();
  sound.setMusic(state.music);
  renderMusicBtn();
  const t = $("#musicToggle");
  if (t) t.checked = state.music;
}
function renderMusicBtn() {
  const b = $("#musicBtn");
  const on = !!state.music, live = sound.playing;
  b.setAttribute("aria-pressed", String(on && live));
  b.classList.toggle("waiting", on && !live); // bật nhưng trình duyệt chưa cho phát → mời chạm
  b.setAttribute("aria-label", !on ? "Bật nhạc nền" : live ? "Tắt nhạc nền" : "Chạm để phát nhạc nền");
}

// Trên điện thoại hộp thoại là "bảng" trượt từ dưới lên → vuốt xuống để đóng.
// Hộp đi theo ngón tay; kéo quá 1/4 chiều cao hoặc hất nhanh thì đóng, không thì bật về.
// Chỉ bắt đầu khi nội dung đang ở trên cùng (đang cuộn dở thì vuốt xuống = cuộn lên như thường).
// Dùng `transform` cho việc kéo — tách với animation trượt lên (dùng `translate`) để không đè nhau.
const isSheetModal = () => matchMedia("(max-width: 719px)").matches;
function bindSwipeToClose(d) {
  let y0 = 0, x0 = 0, t0 = 0, dy = 0, armed = false, dragging = false;
  const reset = () => { d.style.transform = ""; d.style.transition = ""; d.style.removeProperty("--drag"); d.classList.remove("dragging"); };

  d.addEventListener("touchstart", (e) => {
    armed = dragging = false;
    if (!isSheetModal() || e.touches.length !== 1) return;
    // Vùng tự xử lý kéo: khung căn ảnh, thanh trượt, ô nhập chữ
    if (e.target.closest(".crop-box, input[type=range], input[type=text], textarea")) return;
    if (d.scrollTop > 0) return;
    const t = e.touches[0];
    y0 = t.clientY; x0 = t.clientX; t0 = performance.now(); dy = 0; armed = true;
  }, { passive: true });

  d.addEventListener("touchmove", (e) => {
    if (!armed) return;
    const t = e.touches[0];
    const raw = t.clientY - y0;
    if (!dragging) {
      if (raw < -4 || Math.abs(t.clientX - x0) > Math.abs(raw)) { armed = false; return; } // vuốt lên / ngang: để trình duyệt cuộn
      if (raw < 8) return;
      dragging = true;
      d.classList.add("dragging");
    }
    e.preventDefault(); // đang kéo hộp thoại: không cuộn trang
    dy = Math.max(0, raw - 8);
    d.style.transition = "none";
    d.style.transform = `translateY(${dy}px)`;
    d.style.setProperty("--drag", String(Math.min(1, dy / d.offsetHeight)));
  }, { passive: false });

  const end = () => {
    if (!dragging) { armed = false; return; }
    armed = dragging = false;
    const speed = dy / Math.max(1, performance.now() - t0); // px/ms
    if (dy > d.offsetHeight * 0.25 || (speed > 0.6 && dy > 40)) {
      buzz();
      d.style.transition = "transform .22s cubic-bezier(.4,0,1,1)";
      d.style.transform = "translateY(105%)";
      d.style.setProperty("--drag", "1");
      setTimeout(() => { d.close(); reset(); }, 220);
    } else {
      d.style.transition = "transform .35s cubic-bezier(.3,1.5,.5,1)"; // bật về
      d.style.transform = "";
      d.style.removeProperty("--drag");
      setTimeout(reset, 360);
    }
  };
  d.addEventListener("touchend", end);
  d.addEventListener("touchcancel", end);
  d.addEventListener("close", reset);
}

/* ------------------------------------------------------------------ */
/* Firebase                                                            */
/* ------------------------------------------------------------------ */
let fb; // { db, ref, ... }
let appCheck = null; // { instance, getToken } khi đã bật App Check — dùng cho các lần ghi qua REST
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
    const { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } = await import(`${FIREBASE_SDK}firebase-app-check.js`);
    const instance = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
    appCheck = { instance, getToken };
  } catch (e) {
    console.warn("Không khởi tạo được App Check:", e);
  }
}
const famRef = (path = "") => fb.ref(fb.db, `families/${state.familyId}${path ? "/" + path : ""}`);
const meRef = () => famRef(`members/${state.memberId}`);

// Ghi vào nhánh của nhóm (giống update()). App native đang chạy nền thì ghi qua REST bằng HTTP native:
// WebView ở nền bị hệ điều hành bóp mạng, kết nối realtime của Firebase có thể đứt/chậm.
// serverTimestamp() của SDK chính là {".sv": "timestamp"} — REST hiểu y như vậy.
async function famWrite(path, data) {
  if (!native.isNative || appVisible()) return fb.update(famRef(path), data);
  const headers = {};
  if (appCheck) {
    try { headers["X-Firebase-AppCheck"] = (await appCheck.getToken(appCheck.instance)).token; } catch { /* chưa Enforce thì vẫn ghi được */ }
  }
  const url = `${firebaseConfig.databaseURL}/families/${state.familyId}/${path}.json`;
  try {
    await native.httpPatch(url, data, headers);
  } catch (e) {
    if (/HTTP 40[13]/.test(e.message)) throw new Error(`PERMISSION_DENIED ${e.message}`);
    throw e;
  }
}
const meWrite = (data) => famWrite(`members/${state.memberId}`, data);

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

  if (native.isNative) {
    $("#permTipUpdate").innerHTML = native.platform === "ios"
      ? "Nên chọn <strong>“Luôn cho phép”</strong> để người nhà thấy bạn cả khi tắt màn hình."
      : "Vị trí vẫn được gửi khi tắt màn hình — sẽ có một thông báo nhỏ của Nhà Mình.";
  }

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
      .then(() => fb.remove(fb.ref(fb.db, `families/${slot.f}/photos/${slot.m}`)).catch(() => {}))
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
let claimPhotos = {};
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
        <span class="avatar" style="--c:${escapeHtml(m.color || "#ccfbf1")}">${avatarInner(m, id, validPhoto(claimPhotos[id]?.data) ? claimPhotos[id].data : null)}</span>
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
  sound.error();
}

async function joinFamily(code, btn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Đang kiểm tra…";
  try {
    const [snap, photoSnap] = await Promise.all([
      fb.get(fb.ref(fb.db, `families/${code}/members`)),
      fb.get(fb.ref(fb.db, `families/${code}/photos`)).catch(() => null),
    ]);
    claimPhotos = photoSnap?.val() || {};
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
let places = {};           // placeId -> { name, emoji, lat, lng, radius, by, at }
let placesLoaded = false;
let events = [];           // dòng thời gian: [{ id, m, type: "arrive"|"leave", place, at }]
const placeLayers = new Map(); // placeId -> { circle, marker, key }
let selectedId = null;     // đang xem thẻ chi tiết của ai
let placing = null;        // đang đặt địa điểm: { id, emoji, name, radius, nameEdited }
let previewCircle = null;
let prevFix = null;        // lần định vị trước, để tự tính tốc độ khi máy không báo

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
// Tắt chia sẻ vị trí → xoá mọi thứ lộ ra vị trí trên server.
const HIDDEN_POS = { lat: null, lng: null, acc: null, speed: null, place: null, placeSince: null };

async function enterMain(opts = {}) {
  const welcome = state.member === false; // vừa tạo / vào nhóm lần đầu
  showScreen("main");
  if (welcome) {
    setTimeout(() => {
      burst(innerWidth / 2, innerHeight * 0.35, ["🎉", "🏡", "💛", "✨", "🥳"], 34);
      sound.welcome();
      toast("Chào mừng về Nhà Mình! 🏡", 3500);
    }, 900);
  }
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
    if (!state.sharing) Object.assign(initial, { ...HIDDEN_POS });
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
      if (liveOnline()) fb.update(meRef(), { online: true }).catch(() => {});
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
      prunePhotos();
      syncFromServer(mine);
    } else if (state.member) {
      return onKicked();
    }
    render();
    if (firstLoad && myPos) pushPosition(false); // GPS có trước dữ liệu nhóm → giờ mới gửi
    if (firstLoad) trackMyPlace();
  });
  fb.onValue(famRef("places"), (s) => {
    places = {};
    for (const [id, p] of Object.entries(s.val() || {})) {
      if (p && typeof p.lat === "number" && typeof p.lng === "number" && p.radius > 0) places[id] = p;
    }
    placesLoaded = true;
    renderPlaces();
    trackMyPlace();
    render();
  });
  // Dòng thời gian: chỉ tải 2 ngày gần nhất (hiển thị "Hôm nay").
  fb.onValue(fb.query(famRef("events"), fb.orderByChild("at"), fb.startAt(Date.now() - 2 * 864e5)), (s) => {
    events = [];
    s.forEach((c) => { const v = c.val(); if (v) events.push({ id: c.key, ...v }); });
    announceEvents();
    renderFeed();
  });
  // Dọn sự kiện cũ (ai mở app cũng dọn giúp) — giữ database gọn.
  fb.get(fb.query(famRef("events"), fb.orderByChild("at"), fb.endAt(Date.now() - EVENT_KEEP))).then((s) => {
    const old = {};
    s.forEach((c) => { old[c.key] = null; });
    if (Object.keys(old).length) fb.update(famRef("events"), old).catch(() => {});
  }).catch(() => {});

  if (native.isNative) {
    refreshBattery();
  } else if (navigator.getBattery) {
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
    if (myPos && gpsOn() && appVisible()) pushPosition(true);
    render();
  }, 30e3);

  const onVisibility = () => {
    if (!fb || !state.familyId || kicked) return;
    const visible = appVisible();
    meWrite({ online: liveOnline() }).catch(() => {});
    if (visible) {
      if (myPos && gpsOn()) pushPosition(true);
      if (state.wake) requestWakeLock();
      render();
    }
  };
  if (native.isNative) {
    native.onAppStateChange((active) => {
      if (active === appActive) return;
      appActive = active;
      onVisibility();
    });
    native.onBackButton(onBackButton);
  } else {
    document.addEventListener("visibilitychange", onVisibility);
  }
}

// Nút Back (Android): đóng hộp thoại / thẻ chi tiết trước; hết thì đưa app xuống nền
// (không đóng hẳn — đóng hẳn thì không còn chia sẻ vị trí khi chạy nền).
function onBackButton() {
  const open = $$("dialog[open]");
  if (open.length) return open[open.length - 1].close();
  if (placing) return stopPlacing();
  if (selectedId) return closeDetail();
  native.minimizeApp();
}

let batteryAt = 0;
function refreshBattery() {
  if (Date.now() - batteryAt < 60e3) return;
  batteryAt = Date.now();
  native.batteryInfo().then((b) => { if (b) battery = b; }).catch(() => {});
}

function initMap() {
  map = L.map("map", { zoomControl: false, attributionControl: true }).setView([16.05, 106.5], 5);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  map.attributionControl.setPrefix(false);
  // Lớp dây nối ghim ↔ vị trí thật: ngay dưới lớp ghim (600) để dây không đè lên ghim/nhãn tên.
  const tetherPane = map.createPane("tethers");
  tetherPane.style.zIndex = 590;
  tetherPane.style.pointerEvents = "none";
  map.on("dragstart", () => { userMovedMap = true; });
  map.on("zoomanim", (e) => relayoutPinsFor(e.zoom)); // ghim dàn lại cùng lúc với hiệu ứng zoom
  map.on("zoomend", () => renderMarkers()); // tách các ghim chồng lên nhau theo mức zoom
  map.on("click", () => { if (selectedId && !placing) closeDetail(); });
  map.on("move", () => { if (placing) updatePreview(); });
}

function observeSheet() {
  const sheet = $("#sheet");
  const apply = () => {
    const h = isDesktop() ? 0 : sheet.getBoundingClientRect().height;
    $("#main").style.setProperty("--sheet-h", `${h}px`);
    // Bảng kéo lên gần hết màn hình → không còn chỗ cho 2 nút nổi: ẩn đi thay vì để đè lên thanh trên cùng
    const room = innerHeight - h - $(".topbar").getBoundingClientRect().bottom;
    $("#main").classList.toggle("fabs-hidden", !isDesktop() && room < 140);
  };
  new ResizeObserver(apply).observe(sheet);
  addEventListener("resize", apply);
  apply();
}

function mapPadding() {
  const sheet = $("#sheet").getBoundingClientRect();
  return isDesktop()
    ? { paddingTopLeft: [sheet.width + 48, 150], paddingBottomRight: [104, 48] }
    : { paddingTopLeft: [48, 150], paddingBottomRight: [104, sheet.height + 36] }; // 104 = cột nút nổi + nửa bong bóng ghim
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
  $("#greeting").textContent = greetingText();
  renderMarkers();
  renderList();
  renderFeed();
  renderPlaceHint();
  renderDetail();
  // Tự zoom để thấy cả nhà mỗi khi có thêm người xuất hiện (cho đến khi người dùng tự kéo bản đồ).
  if (!userMovedMap && !selectedId && !placing) {
    const pts = locatedMembers();
    if (pts.length > autoFitCount) {
      focusOn(pts, autoFitCount > 0);
      autoFitCount = pts.length;
    }
  }
}

/* ---- Hiệu ứng ---- */
let dropIndex = 0;

// Gắn class để chạy animation CSS một lần, rồi gỡ ra (để lần sau còn chạy lại được).
function playOnce(el, cls, delay = 0, ms = 1200) {
  if (!el || reducedMotion()) return;
  el.style.animationDelay = delay ? `${delay}ms` : "";
  el.classList.remove(cls);
  void el.offsetWidth; // ép trình duyệt vẽ lại để animation chạy từ đầu
  el.classList.add(cls);
  setTimeout(() => { el.classList.remove(cls); el.style.animationDelay = ""; }, ms + delay);
}

// Pháo hoa emoji bung ra từ một điểm rồi rơi xuống.
function burst(x, y, emojis = ["🎉", "✨", "💛"], n = 22, down = false) {
  if (reducedMotion()) return;
  const fx = $("#fx");
  for (let i = 0; i < n; i++) {
    const el = document.createElement("span");
    el.textContent = emojis[i % emojis.length];
    const size = 16 + Math.random() * 18;
    el.style.fontSize = `${size}px`;
    fx.appendChild(el);
    const angle = (down ? 1 : -1) * Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3; // chủ yếu bắn lên (hoặc xuống)
    const dist = 90 + Math.random() * 150;
    const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist;
    const spin = (Math.random() - 0.5) * 720;
    const x0 = x - size / 2, y0 = y - size / 2;
    el.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.3) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${x0 + dx}px, ${y0 + dy}px) scale(1) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${x0 + dx * 1.2}px, ${y0 + dy + 260}px) scale(.8) rotate(${spin}deg)`, opacity: 0 },
    ], { duration: 1400 + Math.random() * 700, easing: "cubic-bezier(.2,.7,.4,1)" }).finished.then(() => el.remove(), () => el.remove());
  }
}

function greetingText() {
  const h = new Date().getHours();
  const [icon, part] = h < 5 ? ["🌙", "Khuya rồi"] : h < 11 ? ["☀️", "Chào buổi sáng"] : h < 14 ? ["🌤️", "Chào buổi trưa"]
    : h < 18 ? ["⛅", "Chào buổi chiều"] : h < 22 ? ["🌆", "Chào buổi tối"] : ["🌙", "Khuya rồi"];
  return `${icon} ${part}, ${state.name || "bạn"}`;
}

// Có người vừa đến / rời một địa điểm trong lúc mình đang mở app → thông báo + pháo hoa + ghim nảy lên.
const seenEvents = new Set();
const freshEvents = new Set();
let eventsPrimed = false;
function announceEvents() {
  const fresh = events.filter((e) => !seenEvents.has(e.id));
  for (const e of events) seenEvents.add(e.id);
  if (!eventsPrimed) { eventsPrimed = true; return; } // lần tải đầu: chỉ là lịch sử
  for (const e of fresh) {
    freshEvents.add(e.id);
    setTimeout(() => freshEvents.delete(e.id), 3000);
    if (e.m !== state.memberId && now() - (e.at || 0) < 5 * 60e3) showLive(e);
  }
}

let liveTimer;
function showLive(e) {
  const m = members[e.m], pl = places[e.place];
  if (!m?.name || !pl) return;
  const home = pl.emoji === "🏠";
  const verb = e.type === "leave" ? "vừa rời" : home ? "đã về đến" : "vừa đến";
  const box = $("#liveToast");
  box.innerHTML = `${avatarHtml(m, e.m)}
    <span class="lt-text"><strong>${escapeHtml(m.name)}</strong> ${verb} <strong>${escapeHtml(`${pl.emoji || "📍"} ${pl.name}`)}</strong>
      <small>${escapeHtml(clockTime(e.at || Date.now()))}</small></span>
    <span class="lt-emoji" aria-hidden="true">${e.type === "leave" ? "👋" : home ? "🏡" : "🎉"}</span>`;
  box.classList.remove("out");
  box.hidden = false;
  buzz([30, 60, 30]);
  if (e.type === "arrive") sound.arrive(home); else sound.leave();
  if (e.type === "arrive") {
    requestAnimationFrame(() => {
      const r = box.getBoundingClientRect();
      burst(r.left + r.width / 2, r.bottom, [pl.emoji || "📍", "🎉", "💛", "✨"], 28, true);
    });
  }
  playOnce(markers.get(e.m)?.marker.getElement()?.firstElementChild, "hop", 0, 700);
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    box.classList.add("out");
    setTimeout(() => { box.hidden = true; }, 380);
  }, 5000);
}

/* ---- Trạng thái hiển thị của một người ---- */

// Người này đang ở địa điểm quen nào? Ưu tiên điều máy của họ đã báo (có giờ đến),
// nếu không thì tự tính theo toạ độ (máy họ chạy bản cũ / chưa kịp báo).
function memberPlace(m) {
  if (m.sharing === false || typeof m.lat !== "number") return null;
  const told = m.place && places[m.place];
  if (told && distanceMeters(m, told) <= told.radius + PLACE_EXIT_MARGIN + Math.min(m.acc || 0, 200)) {
    return { id: m.place, ...told, since: m.placeSince || null };
  }
  const id = placeAt(m, null);
  return id ? { id, ...places[id], since: null } : null;
}

function movingText(m, id) {
  const speed = id === state.memberId && gpsOn() && myPos ? myPos.speed : m.speed;
  const fresh = id === state.memberId || now() - (m.updatedAt || 0) < 3 * 60e3;
  if (!(speed >= MOVING_SPEED) || !fresh) return null;
  return speed <= WALK_SPEED ? "🚶 Đang đi bộ" : `🛵 Đang di chuyển · ${Math.round(speed * 3.6)} km/h`;
}

const placeLabel = (pl) => `${pl.emoji || "📍"} Ở ${pl.name}${pl.since ? ` từ ${clockTime(pl.since)}` : ""}`;
const avatarHtml = (m, id, cls = "") =>
  `<span class="avatar ${cls}" style="--c:${escapeHtml(m.color || "#ccfbf1")}">${avatarInner(m, id)}</span>`;

/* ---- Ghim trên bản đồ ---- */

function renderMarkers() {
  const located = locatedMembers().sort((a, b) => a.id.localeCompare(b.id));

  const offsets = layoutPins(located);

  const seen = new Set();
  for (const m of located) {
    seen.add(m.id);
    const isMe = m.id === state.memberId;
    const stale = !isMe && now() - (m.updatedAt || 0) > IDLE_WINDOW;
    const live = !isMe && memberStatus(m, m.id) === "on";
    const cls = `pin${isMe ? " me" : ""}${live ? " live" : ""}${stale ? " stale" : ""}${selectedId === m.id ? " selected" : ""}`;
    const html = `<div class="${cls}" style="--c:${escapeHtml(m.color || "#ccfbf1")}">
      <div class="pin-bubble">${avatarInner(m, m.id)}</div>
      <div class="pin-label">${escapeHtml(isMe ? "Tôi" : m.name)}</div></div>`;
    // Dây nối nằm ở lớp riêng dưới mọi ghim, để không vắt ngang nhãn tên của người khác.
    const tetherHtml = `<div class="pin-tether" style="--c:${escapeHtml(m.color || "#ccfbf1")}"></div>`;
    const tetherIcon = () => L.divIcon({ html: tetherHtml, className: "", iconSize: [0, 0], iconAnchor: [0, 0] });
    let entry = markers.get(m.id);
    if (!entry) {
      const marker = L.marker([m.lat, m.lng], {
        icon: L.divIcon({ html, className: "", iconSize: [56, 66], iconAnchor: [28, 66] }),
        keyboard: true, title: m.name, zIndexOffset: isMe ? 1000 : 0,
      }).addTo(map);
      marker.on("click", (e) => { L.DomEvent.stopPropagation(e); openDetail(m.id); });
      const tether = L.marker([m.lat, m.lng], { icon: tetherIcon(), pane: "tethers", interactive: false, keyboard: false }).addTo(map);
      entry = { marker, tether, html, tetherHtml, target: [m.lat, m.lng] };
      markers.set(m.id, entry);
      applyPinOffset(entry, offsets.get(m.id)); // đặt trước animation "drop" để ghim không trượt từ 0
      playOnce(marker.getElement()?.firstElementChild, "drop", (dropIndex++ % 8) * 90);
    } else {
      slideMarker(entry, [m.lat, m.lng]);
      entry.marker.getElement()?.setAttribute("title", m.name);
      if (entry.html !== html) {
        entry.marker.setIcon(L.divIcon({ html, className: "", iconSize: [56, 66], iconAnchor: [28, 66] }));
        entry.html = html;
      }
      if (entry.tetherHtml !== tetherHtml) { entry.tether.setIcon(tetherIcon()); entry.tetherHtml = tetherHtml; }
    }
    applyPinOffset(entry, offsets.get(m.id));
  }
  for (const [id, entry] of markers) {
    if (!seen.has(id)) { cancelAnimationFrame(entry.raf); entry.marker.remove(); entry.tether.remove(); markers.delete(id); }
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
  layoutPlaceLabels();
}

/* ---- Chống chồng chữ/ghim trên bản đồ ---- */
const PIN_W = 56, PIN_H = 66, PIN_LABEL_H = 26, PIN_GAP = 6;
const labelWidth = (text) => Math.min(110, Math.round(String(text).length * 7.6) + 20);
const boxesHit = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
let pinBoxes = []; // khung chiếm chỗ của từng ghim (toạ độ màn hình), dùng để đặt nhãn địa điểm

// Ghim nào đụng nhau (tính cả bong bóng lẫn nhãn tên) thì đẩy nhau ra vừa đủ, theo đúng hướng
// của vị trí thật: ai ở phía bắc vẫn nằm trên, ai ở phía tây vẫn nằm trái — nên khi zoom,
// thứ tự tương đối giữa mọi người không bị đảo. Ghim bị đẩy có chấm + dây nối về chỗ thật.
// `zoom` (tuỳ chọn): tính trước bố cục cho mức zoom sắp tới (lúc bản đồ đang chạy hiệu ứng zoom).
// Trả về độ lệch {x, y} (px) của từng ghim.
function layoutPins(located, zoom) {
  const H = PIN_H + PIN_LABEL_H;
  const items = located.map((m) => {
    const p = zoom == null ? map.latLngToContainerPoint([m.lat, m.lng]) : map.project([m.lat, m.lng], zoom);
    return { id: m.id, p, x: p.x, y: p.y, w: Math.max(PIN_W, labelWidth(m.id === state.memberId ? "Tôi" : m.name)) };
  }).sort((a, b) => a.id.localeCompare(b.id));

  // Gỡ chồng lấn từng cặp, lặp tới khi hết (cả nhà chỉ vài người nên rất nhẹ).
  for (let iter = 0; iter < 80; iter++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const ox = (a.w + b.w) / 2 + PIN_GAP - Math.abs(b.x - a.x);
        const oy = H + PIN_GAP - Math.abs(b.y - a.y);
        if (ox <= 0.5 || oy <= 0.5) continue;
        moved = true;
        // Tách theo trục chồng ít hơn; chiều đẩy theo vị trí thật (cùng chỗ thì xếp theo id, hàng ngang).
        if (ox <= oy) {
          const s = Math.sign(b.p.x - a.p.x) || Math.sign(b.x - a.x) || 1;
          a.x -= (s * ox) / 2; b.x += (s * ox) / 2;
        } else {
          const s = Math.sign(b.p.y - a.p.y) || Math.sign(b.y - a.y) || 1;
          a.y -= (s * oy) / 2; b.y += (s * oy) / 2;
        }
      }
    }
    if (!moved) break;
  }

  const off = new Map();
  if (zoom == null) pinBoxes = [];
  for (const it of items) {
    const d = { x: Math.round(it.x - it.p.x), y: Math.round(it.y - it.p.y) };
    off.set(it.id, d);
    if (zoom == null) pinBoxes.push({ x1: it.x - it.w / 2, x2: it.x + it.w / 2, y1: it.y - PIN_H, y2: it.y + PIN_LABEL_H });
  }
  return off;
}

// Đặt độ lệch lên ghim bằng biến CSS (không dựng lại HTML → ảnh không chớp, ghim trượt mượt).
function applyPinOffset(entry, d) {
  const pin = entry.marker.getElement()?.querySelector(".pin");
  const tether = entry.tether.getElement()?.querySelector(".pin-tether");
  if (!pin || !tether) return;
  d = d || { x: 0, y: 0 };
  entry.off = d;
  pin.style.setProperty("--dx", `${d.x}px`);
  pin.style.setProperty("--dy", `${d.y}px`);
  const len = Math.hypot(d.x, d.y);
  tether.classList.toggle("on", len > 2);
  tether.style.setProperty("--len", `${len}px`);
  tether.style.setProperty("--ang", `${Math.atan2(d.y, d.x)}rad`);
}

// Trong lúc bản đồ đang zoom: tính sẵn bố cục cho mức zoom đích để ghim trượt cùng lúc.
function relayoutPinsFor(zoom) {
  const off = layoutPins(locatedMembers().filter((m) => markers.has(m.id)), zoom);
  for (const [id, entry] of markers) applyPinOffset(entry, off.get(id));
}

// Nhãn địa điểm: thử đặt ở mép trên → dưới → phải → trái vòng tròn, chỗ nào không bị ghim che.
// Chỗ nào cũng bị che (thường là khi thu nhỏ bản đồ) thì ẩn nhãn — vòng tròn vẫn còn,
// và danh sách vẫn ghi "🏠 Ở Nhà".
function layoutPlaceLabels() {
  if (!map) return;
  const taken = [...pinBoxes];
  for (const [id, layer] of placeLayers) {
    const pl = places[id];
    const el = layer.marker.getElement()?.firstElementChild;
    if (!pl || !el) continue;
    const c = map.latLngToContainerPoint([pl.lat, pl.lng]);
    const r = c.y - map.latLngToContainerPoint([pl.lat + pl.radius / 111320, pl.lng]).y;
    const w = labelWidth(pl.name) + 30, h = 30;
    const spots = [[0, -r - h / 2 - 2], [0, r + h / 2 + 2], [r + w / 2 + 2, 0], [-r - w / 2 - 2, 0]];
    const box = ([ox, oy]) => ({ x1: c.x + ox - w / 2, x2: c.x + ox + w / 2, y1: c.y + oy - h / 2, y2: c.y + oy + h / 2 });
    const pick = spots.find((s) => !taken.some((b) => boxesHit(box(s), b)));
    el.style.visibility = pick ? "" : "hidden";
    if (pick) {
      el.style.transform = `translate(calc(-50% + ${Math.round(pick[0])}px), calc(-50% + ${Math.round(pick[1])}px))`;
      taken.push(box(pick)); // nhãn địa điểm cũng không đè lên nhau
    }
  }
}

// Ghim trượt mượt tới vị trí mới thay vì nhảy cóc.
function slideMarker(entry, to) {
  if (entry.target && entry.target[0] === to[0] && entry.target[1] === to[1]) return;
  entry.target = to;
  cancelAnimationFrame(entry.raf);
  const from = entry.marker.getLatLng();
  const far = from.distanceTo(to) > 5000 || !map.getBounds().pad(0.5).contains(from);
  const place = (ll) => { entry.marker.setLatLng(ll); entry.tether.setLatLng(ll); }; // dây nối đi cùng ghim
  if (reducedMotion() || far || document.visibilityState !== "visible") { place(to); return; }
  const t0 = performance.now(), D = 1000;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / D), e = 1 - (1 - k) ** 3;
    place([from.lat + (to[0] - from.lat) * e, from.lng + (to[1] - from.lng) * e]);
    if (k < 1) entry.raf = requestAnimationFrame(step);
  };
  entry.raf = requestAnimationFrame(step);
}

/* ---- Danh sách cả nhà ---- */

function renderList() {
  const list = $("#memberList");
  if (!membersLoaded) {
    // Khung chờ thay vì báo "Chưa có ai" khi dữ liệu còn đang tải.
    if (!list.querySelector(".skeleton")) {
      list.innerHTML = `<li class="member skeleton" aria-hidden="true"><span class="member-main"><span class="avatar"></span>
        <span class="member-info sk-info"><span class="sk-line"></span><span class="sk-line"></span></span></span></li>`.repeat(3);
    }
    $("#emptyState").hidden = true;
    return;
  }
  list.removeAttribute("aria-busy");

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
  const herePlace = here && memberPlace(here);
  for (const [id, m] of entries) {
    const isMe = id === state.memberId;
    const status = memberStatus(m, id);
    const hasPos = m.sharing !== false && typeof m.lat === "number";
    const pl = hasPos ? memberPlace(m) : null;
    const moving = hasPos && !pl ? movingText(m, id) : null;

    const meta = []; // dòng phụ: các đoạn HTML đã escape
    const text = (s) => meta.push(escapeHtml(s));
    const tag = pl ? placeLabel(pl) : moving; // dòng chính: đang ở đâu / đang đi
    if (isMe) {
      if (!state.sharing) text("Đã tắt chia sẻ vị trí");
      else if (!gpsOn()) text(hasPos ? `Máy này chỉ xem · vị trí từ máy khác, ${relTime(now() - (m.updatedAt || 0))}` : "Máy này chỉ xem");
      else if (geoError) text(geoError);
      else if (!myPos) text("Đang tìm vị trí…");
      else if (!pl) text("Đang chia sẻ vị trí");
    } else if (m.sharing === false) {
      text("Đã tắt chia sẻ vị trí");
    } else if (!hasPos) {
      text("Chưa có vị trí");
    } else {
      text(status === "on" ? "Đang mở app" : relTime(now() - (m.updatedAt || 0)));
      if (here && !(pl && herePlace && pl.id === herePlace.id)) text(`cách ${formatDistance(distanceMeters(here, m))}`);
    }
    if (!isMe && typeof m.battery === "number" && m.battery <= 20 && !m.charging) {
      meta.unshift(`<span class="batt low">🪫 ${m.battery}%</span>`); // sắp hết pin: đưa lên đầu cho dễ thấy
    }

    const li = document.createElement("li");
    li.className = listAnimated ? "member" : "member enter";
    li.style.setProperty("--i", String(list.children.length));
    li.innerHTML = `
      <button class="member-main" type="button" aria-label="${escapeHtml(isMe ? "Xem chi tiết của tôi" : `Xem chi tiết của ${m.name}`)}">
        <span class="avatar" style="--c:${escapeHtml(m.color || "#ccfbf1")}">
          ${avatarInner(m, id)}<span class="status ${status === "on" ? "on" : status === "idle" ? "idle" : ""}"></span>
        </span>
        <span class="member-info">
          <span class="member-name">${escapeHtml(m.name)}${isMe ? ' <span class="me">(bạn)</span>' : ""}</span>
          <span class="member-meta">${tag ? `<span class="member-tag">${escapeHtml(tag)}</span>` : ""}<span class="member-sub">${meta.join(" · ")}</span></span>
        </span>
      </button>`;
    li.querySelector(".member-main").addEventListener("click", () => openDetail(id));

    if (!isMe && hasPos) {
      const go = document.createElement("a");
      go.className = "go-btn";
      go.href = directionsUrl(m);
      go.target = "_blank";
      go.rel = "noopener";
      go.setAttribute("aria-label", `Chỉ đường tới ${m.name}`);
      go.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 21 3l-8 18-2-8-8-2Z"/></svg>';
      li.appendChild(go);
    }
    list.appendChild(li);
  }
  listAnimated = true;
}

// (listAnimated được bật ở cuối renderList khi đã có dữ liệu)
const directionsUrl = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;

/* ---- Dòng thời gian "Hôm nay" ---- */

let listAnimated = false; // chỉ lần đầu có dữ liệu mới cho các dòng bật lên lần lượt
function renderFeed() {
  const hasPlaces = Object.keys(places).length > 0;
  $("#feed").hidden = !membersLoaded || !hasPlaces;
  if ($("#feed").hidden) return;

  const startOfDay = new Date(new Date().toDateString()).getTime();
  const rows = [];
  const sorted = events
    .filter((e) => e.at >= startOfDay && members[e.m]?.name && places[e.place])
    .sort((a, b) => b.at - a.at);
  for (const e of sorted) {
    // Cùng một người dùng 2 máy có thể ghi trùng → bỏ bản trùng trong vòng 10 phút.
    if (rows.some((r) => r.m === e.m && r.type === e.type && r.place === e.place && Math.abs(r.at - e.at) < 10 * 60e3)) continue;
    rows.push(e);
    if (rows.length >= 12) break;
  }

  $("#feedEmpty").hidden = rows.length > 0;
  $("#feedList").innerHTML = rows.map((e) => {
    const m = members[e.m], pl = places[e.place];
    const who = e.m === state.memberId ? "Bạn" : m.name;
    const verb = e.type === "leave" ? "đã rời" : pl.emoji === "🏠" ? "đã về" : "đã đến";
    return `<li class="feed-item${freshEvents.has(e.id) ? " new" : ""}">${avatarHtml(m, e.m, "avatar-sm")}
      <span class="feed-text"><strong>${escapeHtml(who)}</strong> ${verb} <strong>${escapeHtml(`${pl.emoji || "📍"} ${pl.name}`)}</strong></span>
      <time class="feed-time" datetime="${new Date(e.at).toISOString()}">${escapeHtml(clockTime(e.at))}</time></li>`;
  }).join("");
}

function renderPlaceHint() {
  $("#placeHint").hidden = !membersLoaded || !placesLoaded || Object.keys(places).length > 0 || !!state.placeHintDismissed;
}

/* ---- Thẻ chi tiết một người ---- */

function openDetail(id) {
  buzz();
  sound.select();
  selectedId = id;
  renderDetail();
  if (sheetMode === "peek") setSheetMode("half");
  renderMarkers();
  const m = allMembers()[id];
  if (m && m.sharing !== false && typeof m.lat === "number") {
    // Chờ sheet đổi chiều cao xong rồi mới căn giữa.
    requestAnimationFrame(() => focusOn([m]));
  }
  $("#memberDetail").scrollIntoView?.({ block: "start" });
  $("#detailName").focus({ preventScroll: true }); // cho trình đọc màn hình, không hiện viền
  playOnce($("#memberDetail"), "enter", 0, 900);
}

function closeDetail() {
  if (!selectedId) return;
  selectedId = null;
  $("#memberDetail").hidden = true;
  $("#sheetHome").hidden = false;
  renderMarkers();
}

const addrCache = new Map(); // "lat,lng" làm tròn ~10 m -> Promise<string|null>
let addrLast = { id: null, key: null, text: null, at: 0 };

function renderDetail() {
  if (!selectedId) return;
  const id = selectedId;
  const m = allMembers()[id];
  if (!m?.name) return closeDetail();
  $("#sheetHome").hidden = true;
  $("#memberDetail").hidden = false;

  const isMe = id === state.memberId;
  const hasPos = m.sharing !== false && typeof m.lat === "number";
  const status = memberStatus(m, id);
  const pl = hasPos ? memberPlace(m) : null;
  const moving = hasPos && !pl ? movingText(m, id) : null;

  const av = $("#detailAvatar");
  av.style.setProperty("--c", m.color || "#ccfbf1");
  av.innerHTML = avatarInner(m, id);
  av.classList.toggle("live", status === "on" && !isMe);
  $("#detailName").textContent = isMe ? `${m.name} (bạn)` : m.name;

  const st = $("#detailStatus");
  st.classList.toggle("off", !pl && !moving);
  st.textContent = pl ? placeLabel(pl)
    : moving || (m.sharing === false ? "Đã tắt chia sẻ vị trí" : !hasPos ? "Chưa có vị trí" : status === "on" ? "Đang mở app" : "Không ở địa điểm quen");

  const facts = [];
  const fact = (icon, html, extra = "") => facts.push(`<li><span class="fi" aria-hidden="true">${icon}</span><span class="fv ${extra}">${html}</span></li>`);
  let addrKey = null;
  if (hasPos) {
    addrKey = `${m.lat.toFixed(4)},${m.lng.toFixed(4)}`;
    const known = addrLast.id === id ? addrLast.text : null;
    fact("📍", escapeHtml(known || "Đang tìm địa chỉ…"), known ? "addr" : "addr loading");
    const age = now() - (m.updatedAt || 0);
    fact("🕒", escapeHtml(isMe && gpsOn() && myPos ? "Đang chia sẻ từ máy này"
      : status === "on" ? "Đang mở app" : `Cập nhật ${relTime(age)}${m.updatedAt ? ` (${clockTime(m.updatedAt)})` : ""}`));
    const here = myLocation();
    if (!isMe && here) fact("📏", escapeHtml(`Cách bạn ${formatDistance(distanceMeters(here, m))}`));
    if (m.acc) fact("🎯", escapeHtml(`Sai số khoảng ±${formatDistance(m.acc)}`));
  }
  if (!isMe && typeof m.battery === "number") {
    const low = m.battery <= 20 && !m.charging;
    fact(m.charging ? "⚡" : "🔋", `<span class="${low ? "low" : ""}">${escapeHtml(m.charging ? `Đang sạc · ${m.battery}%` : `Pin ${m.battery}%${low ? " — sắp hết" : ""}`)}</span>`);
  }
  $("#detailFacts").innerHTML = facts.join("");
  $("#detailFacts").hidden = !facts.length;

  $("#detailGo").hidden = isMe || !hasPos;
  if (hasPos) $("#detailGo").href = directionsUrl(m);
  $("#detailShare").hidden = !hasPos;
  $("#detailSavePlace").hidden = !hasPos || !!pl;

  if (hasPos) showAddress(id, m, addrKey);
}

// Địa chỉ gần đúng từ OpenStreetMap (Nominatim). Chỉ tra khi mở thẻ chi tiết, có bộ nhớ đệm,
// và không tra lại quá 1 lần / 15 giây khi người đó đang di chuyển (theo chính sách sử dụng).
function showAddress(id, m, key) {
  const paint = (text) => {
    if (selectedId !== id) return;
    const el = $("#detailFacts .addr");
    if (!el) return;
    el.classList.remove("loading");
    el.textContent = text || "Không rõ địa chỉ";
  };
  if (addrLast.id === id && addrLast.key === key) return;
  if (addrLast.id === id && Date.now() - addrLast.at < 15e3 && !addrCache.has(key)) return;
  addrLast = { id, key, text: addrLast.id === id ? addrLast.text : null, at: Date.now() };
  if (!addrCache.has(key)) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=vi&lat=${m.lat.toFixed(5)}&lon=${m.lng.toFixed(5)}`;
    addrCache.set(key, fetch(url).then((r) => (r.ok ? r.json() : null)).then(shortAddress).catch(() => null));
  }
  addrCache.get(key).then((text) => {
    if (addrLast.id === id && addrLast.key === key) addrLast.text = text;
    paint(text);
  });
}

function shortAddress(j) {
  const a = j?.address;
  if (!a) return j?.display_name?.split(", ").slice(0, 3).join(", ") || null;
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const parts = [
    a.amenity || a.shop || a.tourism || a.leisure || a.office,
    street,
    a.quarter || a.suburb || a.neighbourhood || a.village || a.hamlet,
    a.city_district || a.district || a.county || a.town,
    a.city || a.state,
  ];
  return [...new Set(parts.filter(Boolean))].slice(0, 3).join(", ") || null;
}

async function shareLocationOf(id) {
  const m = allMembers()[id];
  if (!m || typeof m.lat !== "number") return;
  const url = `https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`;
  const who = id === state.memberId ? "Mình" : m.name;
  if (navigator.share) {
    try { await navigator.share({ title: "Vị trí", text: `${who} đang ở đây 📍`, url }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(url); toast("Đã sao chép vị trí ✓"); }
  catch { prompt("Sao chép đường dẫn vị trí:", url); }
}

/* ------------------------------------------------------------------ */
/* Địa điểm quen thuộc                                                 */
/* ------------------------------------------------------------------ */

// Điểm p đang ở địa điểm nào. `current` = địa điểm đang ở (được nới thêm biên để không nhấp nháy).
function placeAt(p, current) {
  const cur = current && places[current];
  if (cur && distanceMeters(p, cur) <= cur.radius + PLACE_EXIT_MARGIN) return current;
  let best = null, bestD = Infinity;
  for (const [id, pl] of Object.entries(places)) {
    const d = distanceMeters(p, pl);
    if (d <= pl.radius && d - pl.radius < bestD) { best = id; bestD = d - pl.radius; }
  }
  return best;
}

// Máy đang lấy GPS của tôi tự phát hiện mình đến/rời địa điểm → ghi lên hồ sơ + dòng thời gian.
function trackMyPlace() {
  if (!membersLoaded || !placesLoaded || !gpsOn() || !myPos || myPos.acc > PLACE_MAX_ACC || kicked) return;
  const stored = members[state.memberId];
  if (!stored) return;
  const was = stored.place && places[stored.place] ? stored.place : null;
  const next = placeAt(myPos, was);
  if (next === was && (stored.place || null) === was) return;

  meWrite({ place: next, placeSince: next ? fb.serverTimestamp() : null }).catch(onWriteError);
  if (was && next !== was) logEvent("leave", was);
  if (next && next !== was) logEvent("arrive", next);
  // Cập nhật ngay trên máy để lần định vị kế tiếp không ghi trùng trước khi server phản hồi.
  members[state.memberId] = { ...stored, place: next, placeSince: next ? now() : null };
}

function logEvent(type, placeId) {
  const pl = places[placeId];
  if (!pl || now() - (pl.at || 0) < PLACE_QUIET) return; // vừa tạo địa điểm: người đang ở đó không tính là "vừa đến"
  const key = fb.push(famRef("events")).key; // chỉ sinh khoá, chưa ghi gì
  famWrite(`events/${key}`, { m: state.memberId, type, place: placeId, at: fb.serverTimestamp() }).catch(onWriteError);
}

function renderPlaces() {
  if (!map) return;
  const seen = new Set();
  for (const [id, pl] of Object.entries(places)) {
    if (placing?.id === id) continue; // đang sửa thì ẩn bản cũ
    seen.add(id);
    const key = `${pl.lat},${pl.lng},${pl.radius},${pl.emoji},${pl.name}`;
    const old = placeLayers.get(id);
    if (old?.key === key) continue;
    old?.circle.remove(); old?.marker.remove();
    const circle = L.circle([pl.lat, pl.lng], {
      radius: pl.radius, className: "place-circle", weight: 1.5, dashArray: "4 6", fillOpacity: 0.07, interactive: false,
    }).addTo(map);
    // Đặt ở tâm; layoutPlaceLabels() dời nhãn ra mép vòng tròn, chỗ không bị ghim che.
    const marker = L.marker([pl.lat, pl.lng], {
      icon: L.divIcon({
        className: "", iconSize: [0, 0], iconAnchor: [0, 0],
        html: `<div class="place-pin"><span>${escapeHtml(pl.emoji || "📍")}</span>${escapeHtml(pl.name)}</div>`,
      }),
      zIndexOffset: -1000, keyboard: false, title: pl.name,
    }).addTo(map);
    marker.on("click", (e) => { L.DomEvent.stopPropagation(e); startPlacing({ id }); });
    placeLayers.set(id, { circle, marker, key });
  }
  for (const [id, layer] of placeLayers) {
    if (!seen.has(id)) { layer.circle.remove(); layer.marker.remove(); placeLayers.delete(id); }
  }
  layoutPlaceLabels();
}

function openPlaces() {
  buzz();
  const ul = $("#placeList");
  const all = allMembers();
  const items = Object.entries(places).sort(([, a], [, b]) => (a.at || 0) - (b.at || 0));
  ul.innerHTML = items.length ? "" : `<li class="muted">Chưa có địa điểm nào.</li>`;
  for (const [id, pl] of items) {
    const here = Object.entries(all).filter(([, m]) => m?.name && memberPlace(m)?.id === id);
    const li = document.createElement("li");
    li.innerHTML = `<button class="place-item" type="button" aria-label="${escapeHtml(`Sửa ${pl.name}`)}">
      <span class="hint-icon" aria-hidden="true">${escapeHtml(pl.emoji || "📍")}</span>
      <span class="member-info">
        <span class="member-name">${escapeHtml(pl.name)}</span>
        <span class="member-meta">${here.length ? `${here.length} người đang ở đây` : `Phạm vi ${formatDistance(pl.radius)}`}</span>
        ${here.length ? `<span class="place-who">${here.map(([mid, m]) => `<span style="--c:${escapeHtml(m.color || "#ccfbf1")}">${avatarInner(m, mid)}</span>`).join("")}</span>` : ""}
      </span>
      <span class="chev" aria-hidden="true">›</span></button>`;
    li.querySelector("button").addEventListener("click", () => { $("#placesDialog").close(); startPlacing({ id }); });
    ul.appendChild(li);
  }
  $("#placesDialog").showModal();
}

// Mở chế độ đặt địa điểm. { id } = sửa địa điểm có sẵn; { at } = bắt đầu tại toạ độ này.
function startPlacing({ id = null, at = null } = {}) {
  buzz();
  const pl = id ? places[id] : null;
  const used = new Set(Object.values(places).map((p) => p.name));
  const preset = PLACE_PRESETS.find(([, n]) => !used.has(n)) || PLACE_PRESETS[PLACE_PRESETS.length - 1];
  placing = {
    id,
    emoji: pl?.emoji || preset[0],
    name: pl?.name ?? preset[1],
    radius: pl?.radius || preset[2],
    nameEdited: !!pl,
  };
  closeDetail();
  $("#main").classList.add("placing");
  $("#placeEditor").hidden = false;
  $("#placeEditorTitle").textContent = pl ? "Sửa địa điểm" : "Thêm địa điểm";
  $("#placeDelete").hidden = !pl;
  $("#placeDelete").textContent = "Xoá địa điểm này";
  delete $("#placeDelete").dataset.armed;
  $("#placeName").value = placing.name;
  renderPlaceEmojis();
  renderPlaceRadius();
  renderPlaces();

  const start = pl || at || myLocation() || map.getCenter();
  requestAnimationFrame(() => {
    centerOnTarget(start, Math.max(map.getZoom(), pl ? 16 : 17));
    updatePreview();
    $("#placeEditorTitle").focus({ preventScroll: true });
  });
}

function stopPlacing() {
  placing = null;
  previewCircle?.remove();
  previewCircle = null;
  $("#placeEditor").hidden = true;
  $("#main").classList.remove("placing");
  renderPlaces();
  render();
}

function renderPlaceEmojis() {
  const grid = $("#placeEmojiGrid");
  grid.innerHTML = "";
  for (const [emoji, name, radius] of PLACE_PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = emoji;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", name);
    b.setAttribute("aria-checked", String(emoji === placing.emoji));
    b.addEventListener("click", () => {
      buzz();
      placing.emoji = emoji;
      // Chưa tự đặt tên → gợi ý tên + phạm vi hợp với biểu tượng.
      if (!placing.nameEdited) { $("#placeName").value = name; placing.radius = radius; renderPlaceRadius(); }
      for (const o of grid.children) o.setAttribute("aria-checked", String(o === b));
      updatePreview();
    });
    grid.appendChild(b);
  }
}

function renderPlaceRadius() {
  const seg = $("#placeRadius");
  seg.innerHTML = "";
  const opts = PLACE_RADII.some(([r]) => r === placing.radius) ? PLACE_RADII : [...PLACE_RADII, [placing.radius, `${placing.radius} m`]];
  for (const [r, label] of opts) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(r === placing.radius));
    b.addEventListener("click", () => {
      buzz();
      placing.radius = r;
      for (const o of seg.children) o.setAttribute("aria-checked", String(o === b));
      updatePreview(true);
    });
    seg.appendChild(b);
  }
}

// Điểm trên màn hình mà ghim đang chỉ vào: giữa phần bản đồ còn nhìn thấy (trên tấm bảng).
function targetPoint() {
  const size = map.getSize();
  if (isDesktop()) return L.point(size.x / 2, size.y / 2);
  const panelH = $("#placePanel").getBoundingClientRect().height;
  return L.point(size.x / 2, Math.max(120, (size.y - panelH) / 2 + 10));
}

function centerOnTarget(latlng, zoom) {
  const size = map.getSize(), pt = targetPoint();
  const offset = L.point(size.x / 2 - pt.x, size.y / 2 - pt.y);
  const ll = L.latLng(latlng.lat, latlng.lng);
  map.setView(map.unproject(map.project(ll, zoom).add(offset), zoom), zoom, { animate: !reducedMotion() });
}

function updatePreview(fitRadius = false) {
  if (!placing) return;
  const pt = targetPoint();
  const ch = $("#crosshair");
  ch.style.left = `${pt.x}px`;
  ch.style.top = `${pt.y}px`;
  $("#crosshairEmoji").innerHTML = `<span class="crosshair-emoji">${escapeHtml(placing.emoji)}</span>`;
  const c = map.containerPointToLatLng(pt);
  if (!previewCircle) {
    previewCircle = L.circle(c, { radius: placing.radius, className: "place-circle preview", weight: 2, fillOpacity: 0.12, interactive: false }).addTo(map);
  } else {
    previewCircle.setLatLng(c).setRadius(placing.radius);
  }
  // Phạm vi lớn hơn khung nhìn → lùi zoom để thấy hết vòng tròn.
  if (fitRadius) {
    const edge = map.latLngToContainerPoint(L.latLng(c.lat, c.lng).toBounds(placing.radius * 2).getNorthEast());
    if (edge.y < 60 || edge.x > map.getSize().x - 10) centerOnTarget(c, map.getZoom() - 1);
  }
}

function savePlace() {
  const name = $("#placeName").value.trim().slice(0, 24);
  if (!name) { $("#placeName").focus(); return toast("Đặt tên cho địa điểm nhé (ví dụ: Nhà)."); }
  const c = map.containerPointToLatLng(targetPoint());
  const id = placing.id || randomString(10, ID_ALPHABET);
  const old = places[id];
  const data = {
    name, emoji: placing.emoji, radius: placing.radius,
    lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6),
    by: old?.by || state.memberId,
    at: fb.serverTimestamp(),
  };
  fb.set(famRef(`places/${id}`), data).catch(onWriteError);
  buzz(15);
  sound.success(true);
  toast(`Đã lưu ${placing.emoji} ${name} ✓`);
  const ch = $("#crosshair").getBoundingClientRect();
  burst(ch.left + ch.width / 2, ch.top, [placing.emoji, "✨", "💛", "🎉"]);
  state.placeHintDismissed = true;
  saveState();
  stopPlacing();
}

function deletePlace() {
  const btn = $("#placeDelete");
  if (!btn.dataset.armed) { // chạm 2 lần để xoá — không cần hộp thoại xác nhận
    btn.dataset.armed = "1";
    btn.textContent = "Chạm lần nữa để xoá";
    buzz(20);
    sound.warn();
    return;
  }
  const pl = places[placing.id];
  fb.remove(famRef(`places/${placing.id}`)).catch(onWriteError);
  sound.remove();
  toast(`Đã xoá ${pl?.emoji || ""} ${pl?.name || "địa điểm"}`);
  stopPlacing();
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
  if (native.isNative) {
    if (watchId !== null) return;
    geoError = null;
    watchId = native.watchPosition({ background: state.bgGps !== false }, onPosition, onGeoError);
    return;
  }
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
  if (watchId !== null) {
    if (typeof watchId === "function") watchId(); // app native: hàm dừng theo dõi
    else navigator.geolocation.clearWatch(watchId);
  }
  watchId = null;
  myPos = null;
}

function onPosition(p) {
  geoError = null;
  const fix = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0), t: p.timestamp || Date.now() };
  // Tốc độ: máy báo thì dùng, không thì tự tính từ 2 lần định vị (chỉ khi cả hai đủ chính xác).
  let speed = Number.isFinite(p.coords.speed) ? p.coords.speed : null;
  if (speed === null && prevFix && fix.acc <= 50 && prevFix.acc <= 50) {
    const dt = (fix.t - prevFix.t) / 1000;
    if (dt >= 3 && dt <= 120) speed = distanceMeters(prevFix, fix) / dt;
  }
  if (speed !== null && speed > 70) speed = null; // > 250 km/h: GPS nhảy, không phải đang đi thật
  prevFix = fix;
  myPos = { lat: fix.lat, lng: fix.lng, acc: fix.acc, speed: speed === null ? null : Math.round(speed * 10) / 10 };
  pushPosition(false);
  trackMyPlace();
  updateStatus();
  render();
}

function onGeoError(err) {
  if (err.code === err.PERMISSION_DENIED) {
    geoError = "Chưa được cấp quyền vị trí";
    toast(native.isNative
      ? "Nhà Mình chưa được phép dùng vị trí. Vào ⚙️ Cài đặt → Mở quyền vị trí."
      : "Bạn chưa cho phép vị trí. Hãy bật lại trong cài đặt trình duyệt.", 5000);
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
    online: liveOnline(),
  };
  if (native.isNative) refreshBattery(); // kết quả dùng cho lần gửi sau
  if (battery) { data.battery = battery.level; data.charging = battery.charging; }
  data.speed = typeof myPos.speed === "number" && myPos.speed >= 0 ? Math.min(myPos.speed, 400) : null;
  meWrite(data).catch(onWriteError);
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
/* ---- Bảng danh sách kéo được (điện thoại) ----
 * 3 nấc: "peek" (chỉ tiêu đề) · "half" (mặc định, tối đa 48% màn hình) · "full" (gần hết màn hình,
 * chỉ có khi danh sách dài hơn nấc half). Bảng đi theo ngón tay; thả ra thì trượt (có nảy nhẹ) tới
 * nấc gần nhất theo hướng + tốc độ vuốt. Kéo quá hai đầu thì có lực cản kiểu dây thun.
 * Kéo từ trong danh sách: đang ở đầu danh sách mà vuốt xuống → thu bảng; vuốt lên khi chưa full → mở rộng;
 * còn lại là cuộn danh sách như thường. Trên máy tính bảng là cột bên trái → chỉ bấm để thu/mở. */
let sheetMode = "half";
const SHEET_ORDER = ["peek", "half", "full"];

function sheetMetrics() {
  const sheet = $("#sheet"), body = $("#sheetBody");
  const headH = sheet.querySelector(".sheet-head").offsetHeight;
  const pad = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
  const natural = headH + body.scrollHeight + pad;
  const topLimit = $(".topbar").getBoundingClientRect().bottom + 10; // chừa thanh trên cùng
  const peek = headH + pad + 4;
  const half = Math.max(peek, Math.min(natural, innerHeight * 0.48));
  const full = Math.min(natural, innerHeight - topLimit);
  return { peek, half, full: full > half + 40 ? full : null };
}

function setSheetMode(mode, animate = true) {
  const sheet = $("#sheet"), main = $("#main");
  if (isDesktop()) {
    sheetMode = mode === "peek" ? "peek" : "half";
    sheet.style.height = "";
    sheet.classList.toggle("collapsed", sheetMode === "peek");
    $("#sheetHandle").setAttribute("aria-expanded", String(sheetMode !== "peek"));
    return;
  }
  const m = sheetMetrics();
  if (mode === "full" && !m.full) mode = "half";
  const target = m[mode];
  const from = sheet.getBoundingClientRect().height;
  sheetMode = mode;
  sheet.classList.toggle("collapsed", mode === "peek");
  sheet.classList.toggle("full", mode === "full");
  $("#sheetHandle").setAttribute("aria-expanded", String(mode !== "peek"));
  $("#sheetBody").inert = mode === "peek"; // thu gọn: không cho tab vào các dòng bị che

  clearTimeout(sheet._settle);
  sheet.classList.add("moving");
  main.classList.add("sheet-moving");
  sheet.style.transition = "none";
  sheet.style.height = `${from}px`;
  void sheet.offsetHeight; // ghi nhận điểm xuất phát trước khi bật transition
  const ms = animate && !reducedMotion() ? 420 : 0;
  sheet.style.transition = ms ? `height ${ms}ms cubic-bezier(.25, 1.2, .5, 1)` : "none";
  sheet.style.height = `${target}px`;
  sheet._settle = setTimeout(() => {
    sheet.style.transition = "";
    // Nấc half để chiều cao tự co giãn theo nội dung (thêm/bớt người) — khớp đúng giá trị vừa trượt tới.
    if (mode === "half") sheet.style.height = "";
    sheet.classList.remove("moving");
    main.classList.remove("sheet-moving");
  }, ms + 30);
}

// Giữ tên cũ cho các chỗ gọi trước đây
const setSheetCollapsed = (collapsed) => setSheetMode(collapsed ? "peek" : "half");

function bindSheetGestures() {
  const sheet = $("#sheet"), body = $("#sheetBody"), handle = $("#sheetHandle"), main = $("#main");
  let g = null; // cử chỉ đang diễn ra
  let suppressClick = false;

  // t = thời điểm của chính sự kiện chạm (e.timeStamp) — chính xác hơn giờ lúc code chạy,
  // vì trên điện thoại các sự kiện hay đến trễ / dồn cục, làm tính sai tốc độ hất.
  const begin = (x, y, target, t) => {
    if (isDesktop() || placing) return;
    g = { x0: x, y0: y, h0: sheet.getBoundingClientRect().height, inBody: !!target.closest("#sheetBody"),
          dragging: false, lastY: y, lastT: t, v: 0, m: null };
  };
  // Trả về true nếu cử chỉ này kéo bảng (khi đó chặn cuộn trang).
  const move = (x, y, t) => {
    if (!g) return false;
    const dy = y - g.y0;
    if (!g.dragging) {
      if (Math.abs(dy) < 8) return false;
      if (Math.abs(x - g.x0) > Math.abs(dy)) { g = null; return false; } // vuốt ngang: bỏ qua
      if (g.inBody) {
        if (dy > 0 && body.scrollTop > 0) { g = null; return false; }    // đang cuộn dở → cuộn lên
        if (dy < 0 && sheetMode === "full") { g = null; return false; }  // đã full → cuộn danh sách
        if (dy < 0 && sheetMode === "half" && !sheetMetrics().full) { g = null; return false; } // không còn gì để mở rộng
      }
      g.dragging = true;
      g.m = sheetMetrics();
      g.y0 = y; // bắt đầu tính từ đây để bảng không giật 8 px
      g.h0 = sheet.getBoundingClientRect().height;
      clearTimeout(sheet._settle);
      sheet.classList.add("dragging", "moving");
      main.classList.add("sheet-moving");
      sheet.style.transition = "none";
    }
    g.v = 0.8 * ((y - g.lastY) / Math.max(1, t - g.lastT)) + 0.2 * g.v; // px/ms, làm mượt
    g.lastY = y; g.lastT = t;
    const min = g.m.peek, max = g.m.full || g.m.half;
    let h = g.h0 - (y - g.y0);
    if (h < min) h = min - (min - h) / 3;   // lực cản dây thun
    if (h > max) h = max + (h - max) / 3;
    sheet.style.height = `${h}px`;
    return true;
  };
  const end = () => {
    if (!g) return;
    const { dragging, m, v, h0: g0h } = g;
    g = null;
    if (!dragging) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 50);
    sheet.classList.remove("dragging");
    const h = sheet.getBoundingClientRect().height;
    const snaps = [["peek", m.peek], ["half", m.half]];
    if (m.full) snaps.push(["full", m.full]);
    const nearest = (list, to) => list.reduce((best, s) => (Math.abs(s[1] - to) < Math.abs(best[1] - to) ? s : best));
    let mode;
    if (Math.abs(v) > 0.35) {
      // Hất (≥ 350 px/s): sang nấc kế tiếp theo hướng tay, kể cả khi mới kéo được một đoạn ngắn
      const ahead = snaps.filter(([, sh]) => (v > 0 ? sh < g0h - 4 : sh > g0h + 4));
      [mode] = ahead.length ? nearest(ahead, g0h) : nearest(snaps, h);
    } else {
      [mode] = nearest(snaps, h - v * 220); // kéo chậm: nấc gần chỗ thả nhất (có tính quán tính)
    }
    if (mode !== sheetMode) { buzz(); sound.snap(SHEET_ORDER.indexOf(mode) > SHEET_ORDER.indexOf(sheetMode)); }
    setSheetMode(mode);
  };

  // Cảm ứng (điện thoại): touch events để còn nhường cuộn danh sách khi cần
  const ts = (e) => e.timeStamp || performance.now();
  sheet.addEventListener("touchstart", (e) => { if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY, e.target, ts(e)); else g = null; }, { passive: true });
  sheet.addEventListener("touchmove", (e) => { if (move(e.touches[0].clientX, e.touches[0].clientY, ts(e))) e.preventDefault(); }, { passive: false });
  sheet.addEventListener("touchend", end);
  sheet.addEventListener("touchcancel", end);

  // Chuột (cửa sổ hẹp trên máy tính): kéo ở phần tiêu đề
  handle.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    begin(e.clientX, e.clientY, e.target, ts(e));
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") move(e.clientX, e.clientY, ts(e)); });
  handle.addEventListener("pointerup", (e) => { if (e.pointerType === "mouse") end(); });

  // Chạm vào tiêu đề: thu gọn ⇄ mở
  handle.addEventListener("click", () => {
    if (suppressClick) return;
    buzz();
    sound.snap(sheetMode === "peek");
    setSheetMode(sheetMode === "peek" ? "half" : "peek");
  });

  // Đổi kích thước màn hình / xoay máy: đặt lại đúng nấc hiện tại
  addEventListener("resize", () => setSheetMode(sheetMode, false));
}

function bindMainUi() {
  bindSheetGestures();

  // Địa điểm quen thuộc + thẻ chi tiết
  $("#openPlaces").addEventListener("click", openPlaces);
  $("#addPlace").addEventListener("click", () => { $("#placesDialog").close(); startPlacing(); });
  $("#placeHintGo").addEventListener("click", () => startPlacing());
  $("#placeHintClose").addEventListener("click", () => {
    state.placeHintDismissed = true; saveState(); renderPlaceHint();
    toast("Thêm địa điểm bất cứ lúc nào ở nút 📍 Địa điểm.");
  });
  $("#placeCancel").addEventListener("click", stopPlacing);
  $("#placeSave").addEventListener("click", savePlace);
  $("#placeDelete").addEventListener("click", deletePlace);
  $("#placeHere").addEventListener("click", () => {
    const here = myLocation();
    if (!here) return toast("Chưa có vị trí của bạn.");
    centerOnTarget(here, Math.max(map.getZoom(), 17));
  });
  $("#placeName").addEventListener("input", () => { if (placing) placing.nameEdited = true; });
  $("#placeName").addEventListener("keydown", (e) => { if (e.key === "Enter") e.currentTarget.blur(); });
  map.on("movestart", () => $("#crosshair").classList.add("lift"));
  map.on("moveend", () => $("#crosshair").classList.remove("lift"));
  new ResizeObserver(() => { if (placing) updatePreview(); }).observe($("#placePanel"));

  $("#detailBack").addEventListener("click", () => { buzz(); sound.back(); closeDetail(); });
  $("#detailShare").addEventListener("click", () => selectedId && shareLocationOf(selectedId));
  $("#detailSavePlace").addEventListener("click", () => {
    const m = selectedId && allMembers()[selectedId];
    if (m && typeof m.lat === "number") startPlacing({ at: { lat: m.lat, lng: m.lng } });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
    if (placing) stopPlacing(); else closeDetail();
  });

  $("#locateMe").addEventListener("click", () => {
    buzz();
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
    buzz();
    closeDetail();
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
  $("#openShortcut").hidden = native.isNative; // app native đã tự gửi khi chạy nền
  $("#openShortcut").addEventListener("click", () => { $("#settingsDialog").close(); openShortcut(); });
  $("#copyShortcutCode").addEventListener("click", copyShortcutCode);

  $("#saveSettings").addEventListener("click", saveSettings);
  // Âm thanh: áp dụng ngay khi gạt (cài đặt riêng của máy này, không cần bấm Lưu)
  $("#sfxToggle").addEventListener("change", (e) => setSfx(e.currentTarget.checked));
  $("#musicToggle").addEventListener("change", (e) => setMusic(e.currentTarget.checked));
  $("#musicBtn").addEventListener("click", () => {
    buzz();
    // Nhạc đang bật nhưng trình duyệt chưa cho phát (chưa chạm lần nào) → chạm này là để PHÁT, không phải tắt.
    // Lúc này lần chạm vừa mở khoá âm thanh nhưng nhạc chưa kịp bắt đầu, nên sound.playing vẫn là false.
    if (state.music && !sound.playing) return setMusic(true);
    setMusic(!state.music);
    toast(state.music ? "🎵 Đã bật nhạc nền" : "🔇 Đã tắt nhạc nền");
  });
  renderMusicBtn();
  // Ảnh đại diện
  const pick = () => $("#photoInput").click();
  $("#pickPhoto").addEventListener("click", pick);
  $("#settingsAvatarBtn").addEventListener("click", pick);
  $("#photoInput").addEventListener("change", (e) => { onPhotoPicked(e.target.files?.[0]); e.target.value = ""; });
  $("#removePhoto").addEventListener("click", () => { draftPhoto = null; renderSettingsAvatar(); toast("Bấm Lưu để dùng lại hình emoji."); });
  $("#cropOk").addEventListener("click", confirmCrop);
  bindCropGestures();
  $("#leaveFamily").addEventListener("click", () => { $("#settingsDialog").close(); $("#confirmLeave").showModal(); });
  $("#confirmLeaveYes").addEventListener("click", (e) => { e.currentTarget.disabled = true; leaveFamily(); });
  $("#rekeyFamily").addEventListener("click", () => { $("#settingsDialog").close(); $("#confirmRekey").showModal(); });
  $("#confirmRekeyYes").addEventListener("click", (e) => {
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = "Đang tạo mã mới…";
    rekeyFamily();
  });

  // App native có chế độ chạy nền nên không cần giữ màn hình sáng.
  if (!("wakeLock" in navigator) || native.isNative) $("#wakeRow").hidden = true;
  if (native.isNative) {
    $("#nativeRows").hidden = false;
    $("#bgHint").textContent = native.platform === "ios"
      ? "Cần quyền vị trí “Luôn cho phép”. Đừng vuốt tắt app khỏi đa nhiệm."
      : "Có một thông báo nhỏ khi đang chia sẻ. Đừng vuốt tắt app; nếu hay bị ngắt: Cài đặt điện thoại → Pin → Nhà Mình → Không hạn chế.";
    $("#openAppSettings").addEventListener("click", () => native.openAppSettings());
  }
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

/* ---- Phím tắt iPhone: gửi vị trí khi không mở app ----
 * Bản web không chạy nền được trên iPhone. App Phím tắt (có sẵn) thì chạy được theo tự động hoá
 * (mở Zalo, cắm sạc, đến/rời nhà, giờ cố định). Phím tắt gồm 4 tác vụ: Lấy vị trí hiện tại → Lấy mức pin
 * → Văn bản (mã kết nối) → Lấy nội dung của URL (tự nhận Văn bản làm URL), PATCH JSON:
 *   { lat, lng, battery, speed: 0, updatedAt: {".sv": "timestamp"} }
 * speed = 0 để thẻ chi tiết không báo "đang di chuyển" theo tốc độ cũ còn sót từ lần mở app.
 * "online" do onDisconnect tự đặt false; Safari không có Battery API nên "charging" không bị sót.
 * Mã kết nối = URL REST hồ sơ của mình (có ".json"). Hồ sơ phải tồn tại sẵn (rules đòi có "name"),
 * nên rời nhóm / đổi mã nhóm / bị xoá thì phím tắt cũ tự bị từ chối.
 * Địa điểm (Ở Nhà…) được các máy xem tự tính từ toạ độ (memberPlace); đến/rời chỉ ghi khi mở app. */
const shortcutCode = () => `${firebaseConfig.databaseURL}/families/${state.familyId}/members/${state.memberId}.json`;

function openShortcut() {
  $("#shortcutCode").value = shortcutCode();
  $("#shortcutEasy").hidden = !shortcutUrl;
  $("#shortcutManual").hidden = !!shortcutUrl;
  if (shortcutUrl) $("#shortcutLink").href = shortcutUrl;
  const mine = members[state.memberId];
  $("#shortcutStatus").textContent = !state.sharing
    ? "⚠️ Bạn đang tắt “Chia sẻ vị trí của tôi” — bật lại trong Cài đặt thì người nhà mới thấy."
    : mine?.updatedAt ? `Vị trí của bạn cập nhật lần cuối: ${clockTime(mine.updatedAt)} (${relTime(now() - mine.updatedAt)})` : "";
  $("#shortcutDialog").showModal();
}

async function copyShortcutCode() {
  try {
    await navigator.clipboard.writeText(shortcutCode());
    sound.success();
    toast("Đã sao chép mã ✓ Giờ mở app Phím tắt và làm phần 2.");
  } catch {
    $("#shortcutCode").select();
    prompt("Sao chép mã này:", shortcutCode());
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(inviteUrl());
    sound.success();
    toast("Đã sao chép đường dẫn mời ✓");
  } catch {
    prompt("Sao chép đường dẫn này:", inviteUrl());
  }
}

/* ------------------------------------------------------------------ */
/* Ảnh đại diện                                                        */
/* ------------------------------------------------------------------ */
// Ảnh nằm riêng ở families/{f}/photos/{id} = { data: "data:image/webp;base64,…", v }.
// Hồ sơ thành viên chỉ giữ số phiên bản `photo: v` → các lần cập nhật vị trí (rất thường xuyên)
// không kéo theo ảnh. Mỗi máy tải ảnh MỘT lần rồi lưu trong localStorage, chỉ tải lại khi v đổi.
const PHOTO_SIZE = 256;          // px — đủ nét cho avatar 92 px trên màn hình 3x
const PHOTO_MAX_CHARS = 40000;   // ~30 KB ảnh; rules cho phép tối đa 60.000 ký tự
const PHOTO_STORE = "nhaminh.photos";
const PHOTO_RE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;
const validPhoto = (d) => typeof d === "string" && d.length <= 60000 && PHOTO_RE.test(d);

const photoCache = new Map();    // memberId -> { v, data }
const photoTried = new Map();    // memberId -> phiên bản đã thử tải (tránh tải lặp)
try {
  for (const [id, p] of Object.entries(JSON.parse(localStorage.getItem(PHOTO_STORE)) || {})) {
    if (p && validPhoto(p.data)) photoCache.set(id, p);
  }
} catch { /* bỏ qua */ }
function persistPhotos() {
  try { localStorage.setItem(PHOTO_STORE, JSON.stringify(Object.fromEntries(photoCache))); } catch { /* đầy bộ nhớ: bỏ qua */ }
}
// Bỏ ảnh của những người không còn trong nhóm.
function prunePhotos() {
  let changed = false;
  for (const id of photoCache.keys()) if (!members[id]) { photoCache.delete(id); changed = true; }
  if (changed) persistPhotos();
}

// Ảnh hiện tại của một người (data URL) hoặc null. Chưa có trong máy thì tải ngầm rồi vẽ lại.
function photoOf(id, m) {
  if (!m?.photo) return null;
  const c = photoCache.get(id);
  if (c?.v !== m.photo && photoTried.get(id) !== m.photo && fb && state.familyId) {
    photoTried.set(id, m.photo);
    fb.get(famRef(`photos/${id}`)).then((s) => {
      const p = s.val();
      if (p && validPhoto(p.data)) { photoCache.set(id, { v: p.v, data: p.data }); persistPhotos(); render(); }
    }).catch(() => photoTried.delete(id));
  }
  return c?.data || null; // ảnh cũ vẫn hiện trong lúc chờ ảnh mới
}

// Phần bên trong một avatar: ảnh nếu có, không thì emoji.
function avatarInner(m, id, photo = photoOf(id, m)) {
  return photo ? `<img class="avatar-img" src="${escapeHtml(photo)}" alt="">` : escapeHtml(m?.emoji || "🙂");
}

/* ---- Chọn + căn chỉnh + nén ảnh ---- */
let draftPhoto; // undefined = không đổi, null = bỏ ảnh, string = ảnh mới (chờ bấm Lưu)
const crop = { img: null, url: null, box: 0, s0: 1, z: 1, x: 0, y: 0, pointers: new Map(), pinch: null };

function renderSettingsAvatar() {
  const photo = draftPhoto === undefined ? photoOf(state.memberId, members[state.memberId]) : draftPhoto;
  const av = $("#settingsAvatar");
  av.style.setProperty("--c", (draftAvatar || [])[1] || state.color || "#ccfbf1");
  av.innerHTML = avatarInner({ emoji: (draftAvatar || [])[0] || state.emoji }, state.memberId, photo);
  $("#removePhoto").hidden = !photo;
  $("#pickPhoto").textContent = photo ? "📷 Đổi ảnh" : "📷 Chọn ảnh";
}

async function onPhotoPicked(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) return toast("Hãy chọn một tấm ảnh nhé.");
  if (file.size > 30e6) return toast("Ảnh lớn quá (trên 30 MB). Chọn ảnh khác nhé.");
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    return toast("Không đọc được ảnh này. Thử ảnh JPG hoặc PNG nhé.", 4000);
  }
  if (crop.url) URL.revokeObjectURL(crop.url);
  Object.assign(crop, { img, url, z: 1 });
  const el = $("#cropImg");
  el.src = url;
  $("#cropZoom").value = "1";
  $("#cropDialog").showModal();
  requestAnimationFrame(() => {
    crop.box = $("#cropBox").clientWidth;
    crop.s0 = Math.max(crop.box / img.naturalWidth, crop.box / img.naturalHeight); // phủ kín khung
    const w = img.naturalWidth * crop.s0, h = img.naturalHeight * crop.s0;
    crop.x = (crop.box - w) / 2;
    crop.y = (crop.box - h) / 2;
    paintCrop();
  });
}

function clampCrop() {
  const w = crop.img.naturalWidth * crop.s0 * crop.z, h = crop.img.naturalHeight * crop.s0 * crop.z;
  crop.x = Math.min(0, Math.max(crop.box - w, crop.x));
  crop.y = Math.min(0, Math.max(crop.box - h, crop.y));
}
function paintCrop() {
  clampCrop();
  $("#cropImg").style.transform = `translate(${crop.x}px, ${crop.y}px) scale(${crop.s0 * crop.z})`;
}
// Phóng to/thu nhỏ quanh một điểm (giữa khung, hoặc giữa 2 ngón tay).
function zoomCrop(z, cx = crop.box / 2, cy = crop.box / 2) {
  z = Math.min(4, Math.max(1, z));
  const k = z / crop.z;
  crop.x = cx - (cx - crop.x) * k;
  crop.y = cy - (cy - crop.y) * k;
  crop.z = z;
  $("#cropZoom").value = String(z);
  paintCrop();
}

function bindCropGestures() {
  const box = $("#cropBox");
  const local = (e) => { const r = box.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  box.addEventListener("pointerdown", (e) => {
    box.setPointerCapture(e.pointerId);
    crop.pointers.set(e.pointerId, local(e));
    if (crop.pointers.size === 2) {
      const [a, b] = [...crop.pointers.values()];
      crop.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: crop.z };
    }
  });
  box.addEventListener("pointermove", (e) => {
    const prev = crop.pointers.get(e.pointerId);
    if (!prev) return;
    const cur = local(e);
    crop.pointers.set(e.pointerId, cur);
    if (crop.pointers.size === 2 && crop.pinch) {
      const [a, b] = [...crop.pointers.values()];
      zoomCrop(crop.pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / crop.pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (crop.pointers.size === 1) {
      crop.x += cur.x - prev.x;
      crop.y += cur.y - prev.y;
      paintCrop();
    }
  });
  const up = (e) => { crop.pointers.delete(e.pointerId); if (crop.pointers.size < 2) crop.pinch = null; };
  box.addEventListener("pointerup", up);
  box.addEventListener("pointercancel", up);
  box.addEventListener("wheel", (e) => { e.preventDefault(); const p = local(e); zoomCrop(crop.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1), p.x, p.y); }, { passive: false });
  $("#cropZoom").addEventListener("input", (e) => zoomCrop(+e.target.value));
}

// Cắt đúng phần trong khung → ảnh vuông 256 px → WebP (máy không hỗ trợ thì JPEG),
// giảm chất lượng dần cho tới khi dưới ~30 KB.
function exportCrop() {
  const scale = crop.s0 * crop.z;
  const sx = -crop.x / scale, sy = -crop.y / scale, size = crop.box / scale;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; // ảnh PNG trong suốt → nền trắng thay vì đen khi ra JPEG
  ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(crop.img, sx, sy, size, size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  const webp = canvas.toDataURL("image/webp", 0.5).startsWith("data:image/webp");
  const type = webp ? "image/webp" : "image/jpeg";
  let q = 0.85, data = canvas.toDataURL(type, q);
  while (data.length > PHOTO_MAX_CHARS && q > 0.35) { q -= 0.1; data = canvas.toDataURL(type, q); }
  return validPhoto(data) ? data : null;
}

function confirmCrop() {
  const data = exportCrop();
  if (!data) return toast("Không nén được ảnh này. Thử ảnh khác nhé.");
  draftPhoto = data;
  buzz(15);
  $("#cropDialog").close();
  renderSettingsAvatar();
  toast("Bấm Lưu để cập nhật ảnh ✓");
}

// Gửi ảnh lên trước, rồi mới ghi số phiên bản vào hồ sơ (Firebase giữ đúng thứ tự ghi của một máy,
// kể cả khi mất mạng) → máy khác thấy phiên bản mới là đã tải được ảnh mới.
function applyDraftPhoto(patch) {
  if (draftPhoto === undefined) return;
  if (draftPhoto) {
    const v = Date.now();
    fb.set(famRef(`photos/${state.memberId}`), { data: draftPhoto, v }).catch(onWriteError);
    photoCache.set(state.memberId, { v, data: draftPhoto });
    photoTried.set(state.memberId, v);
    patch.photo = v;
  } else {
    fb.remove(famRef(`photos/${state.memberId}`)).catch(onWriteError);
    photoCache.delete(state.memberId);
    patch.photo = null;
  }
  persistPhotos();
  draftPhoto = undefined;
}

let draftAvatar = null;
function openSettings() {
  $("#settingsName").value = state.name;
  draftAvatar = [state.emoji, state.color];
  draftPhoto = undefined;
  renderAvatarGrid($("#settingsAvatarGrid"), state.emoji, (e, c) => { draftAvatar = [e, c]; renderSettingsAvatar(); });
  renderSettingsAvatar();
  $("#shareToggle").checked = !!state.sharing;
  $("#gpsToggle").checked = state.deviceGps !== false;
  $("#bgToggle").checked = state.bgGps !== false;
  $("#wakeToggle").checked = !!state.wake;
  $("#sfxToggle").checked = state.sfx !== false;
  $("#musicToggle").checked = state.music !== false;
  $("#settingsDialog").showModal();
}

async function saveSettings() {
  const name = $("#settingsName").value.trim().slice(0, 24);
  if (!name) return toast("Tên không được để trống.");
  const wasGps = gpsOn();
  const wasBg = state.bgGps !== false;
  state.name = name;
  [state.emoji, state.color] = draftAvatar;
  state.sharing = $("#shareToggle").checked;   // cấp người: áp dụng cho mọi máy của tôi
  state.deviceGps = $("#gpsToggle").checked;   // cấp máy: chỉ máy này
  state.wake = $("#wakeToggle").checked;
  if (native.isNative) state.bgGps = $("#bgToggle").checked;
  saveState();

  const patch = profilePayload();
  if (!state.sharing) Object.assign(patch, { ...HIDDEN_POS });
  const photoChanged = !!draftPhoto;
  applyDraftPhoto(patch);
  fb.update(meRef(), patch).catch(onWriteError);

  if (gpsOn() && !wasGps) { lastPush = { at: 0, lat: null, lng: null }; startWatching(); }
  if (!gpsOn() && wasGps) stopWatching();
  // Đổi chế độ chạy nền: khởi động lại theo dõi với tuỳ chọn mới (giữ vị trí đang có trên màn hình).
  if (gpsOn() && wasGps && wasBg !== (state.bgGps !== false)) {
    const keep = myPos;
    stopWatching();
    myPos = keep;
    startWatching();
  }
  if (state.wake) requestWakeLock(); else releaseWakeLock();

  $("#settingsDialog").close();
  updateStatus();
  render();
  toast("Đã lưu ✓");
  sound.success(photoChanged);
  if (photoChanged) burst(innerWidth / 2, innerHeight * 0.45, ["📸", "✨", "💖", "🌟"]);
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
  sound.setSfx(state.sfx);
  sound.setMusic(state.music);
  sound.onMusicChange(renderMusicBtn);
  renderMusicBtn();
  bindTapSound();

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

  sound.hello(); // trình duyệt chưa cho phát thì đợi tới lần chạm đầu tiên
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

  $("#appVersion").textContent = `Phiên bản ${APP_VERSION} (${APP_RELEASED})`;
  $("#reloadApp").addEventListener("click", () => location.reload());
  console.info(`Nhà Mình ${APP_VERSION}`);

  // App native luôn tải trang mới từ mạng, không cần service worker (WebView iOS cũng không hỗ trợ).
  if ("serviceWorker" in navigator && !native.isNative) navigator.serviceWorker.register("sw.js").catch(() => {});
}

boot();
