import { firebaseConfig, appCheckSiteKey, shortcutUrl } from "./config.js";
import { sound } from "./sound.js";
import * as native from "./native.js";

// Tăng mỗi lần phát hành (xem "Lịch sử phiên bản" trong README).
const APP_VERSION = "1.15.0";
const APP_RELEASED = "25/11/2026";
const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
// Lỗi JS gần nhất: hiện ở dòng chẩn đoán cuối Cài đặt
let lastJsError = "";
addEventListener("error", (e) => { if (e.target?.classList?.contains("leaflet-tile") || /ResizeObserver loop/.test(e.message)) return; lastJsError = String(e.message || e.target?.src || e.target?.href || "?").slice(0, 120); }, true);
addEventListener("unhandledrejection", (e) => { lastJsError = String(e.reason?.message || e.reason).slice(0, 120); });
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
const CHARGE_STALE = 2 * 3600e3; // "Đang sạc" báo quá 2 giờ mà không ai báo lại → coi như đã rút sạc
const LOW_BATTERY = 20;         // % — từ mức này trở xuống là sắp hết pin
const BATTERY_LAG = 30 * 60e3;  // vị trí mới hơn lần báo pin quá 30 phút → mức pin đã cũ, không báo động
const FIX_STALE = 60e3;         // vừa quay lại app mà lần định vị trước đã quá 1 phút → chờ lần định vị mới
const MOVING_SPEED = 1.5;       // m/s (~5 km/h) trở lên coi là đang di chuyển
const WALK_SPEED = 2.5;         // m/s (~9 km/h) trở xuống coi là đi bộ
// Bong bóng "đang làm gì". Khoá lưu trên server (rules: 2–10 chữ thường); thứ tự = theo chiều kim đồng hồ trong bảng chọn.
// pick: chữ trong bảng chọn · text: chữ cả nhà thấy · ttl: tự tắt sau · bits: hạt bay quanh trên bản đồ
const MOODS = {
  go:     { emoji: "🛵", pick: "Đang về",  text: "Đang về",       ttl: 3 * 3600e3, bits: ["💨", "💨"] },
  call:   { emoji: "📞", pick: "Gọi đi",   text: "Rảnh, gọi đi",  ttl: 1 * 3600e3, bits: ["🎵", "🎵"] },
  hungry: { emoji: "😋", pick: "Đói rồi",  text: "Đói rồi",       ttl: 2 * 3600e3, bits: ["🍜", "🍗"] },
  love:   { emoji: "🥰", pick: "Nhớ nhà",  text: "Nhớ cả nhà",    ttl: 3 * 3600e3, bits: ["❤️", "💛"] },
  sleep:  { emoji: "😴", pick: "Đi ngủ",   text: "Đang ngủ",      ttl: 8 * 3600e3, bits: ["z", "z"] },
  busy:   { emoji: "🤫", pick: "Đang bận", text: "Bận, đừng gọi", ttl: 2 * 3600e3, bits: [] },
};
const HEART_KEEP = 2 * 864e5;   // tim thả lúc mình vắng: quá 2 ngày thì thôi không báo
const HEART_EVERY = 700;        // ms — chạm liên tục thì tim vẫn bay, nhưng chỉ ghi lên server thưa thôi
const LIVE_TEXT = "Đang chia sẻ trực tiếp"; // đang mở app, hoặc app native đang chạy nền (trong danh sách hẹp chỗ: "Trực tiếp")
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
// Hộp thoại (showModal) nằm ở "lớp trên cùng" của trình duyệt, che mọi z-index → thông báo phải vào trong hộp thoại đó
// (để trình đọc màn hình cũng đọc được) và lên cùng lớp bằng popover. Máy chưa có popover (iOS 16): position: fixed là đủ.
function bringToFront(el) {
  const host = $$("dialog[open]").pop() || document.body;
  if (el.parentNode !== host) host.appendChild(el);
  if (!el.showPopover) return;
  try {
    el.popover = "manual";
    if (el.matches(":popover-open")) el.hidePopover();
    el.showPopover();
  } catch { /* bỏ qua */ }
}
let toastTimer;
function toast(msg, ms = 2800) {
  const t = $("#toast");
  bringToFront(t);
  void t.offsetWidth; // vừa hiện ra: ghi nhận điểm xuất phát để còn trượt vào
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// Chỉ dựng lại khi thật sự đổi: GPS báo mỗi giây, dựng lại hoài làm ảnh chớp, hiệu ứng chạy lại từ đầu, mất chỗ đang bôi đen.
function setHtml(el, html) {
  if (el._html === html) return;
  el._html = html;
  el.innerHTML = html;
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
  if (m < 10) return `${Math.max(1, Math.round(m))} m`; // đừng làm tròn thành "0 m"
  if (m < 995) return `${Math.round(m / 10) * 10} m`;
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
    if (!d.matches(".mood-dialog")) bindSwipeToClose(d);
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
  $("#onboarding").scrollTop = 0;
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
  nameInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault(); // không thì phím Enter bấm luôn nút đang được chọn ở bước sau
    if ($("#profileNext").disabled) nameInput.blur(); else $("#profileNext").click();
  });
  validate();
  $("#codeInput").addEventListener("input", () => { $("#codeError").hidden = true; });

  $("#profileNext").addEventListener("click", () => {
    state.name = nameInput.value.trim().slice(0, 24);
    saveState();
    showFamilyStep();
  });
  for (const b of $$("[data-goto]")) b.addEventListener("click", () => gotoStep(b.dataset.goto));

  $("#joinInvited").addEventListener("click", () => joinFamily(pendingInvite, $("#joinInvited")));
  $("#ignoreInvite").addEventListener("click", () => {
    pendingInvite = null;
    clearInviteUrl();
    if (inFamily()) enterMain(); else showFamilyStep(); // đang có nhóm: từ chối lời mời là về lại nhóm mình
  });

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

const inFamily = () => !!(state.familyId && state.name && state.emoji);
// Mã mời được giữ trên thanh địa chỉ tới khi vào nhóm / từ chối, để tải lại trang giữa chừng không mất lời mời.
function clearInviteUrl() {
  if (new URLSearchParams(location.search).has("f")) history.replaceState(null, "", location.pathname);
}
function showFamilyStep() {
  $("#inviteBox").hidden = !pendingInvite;
  $("#chooseBox").hidden = !!pendingInvite;
  if (pendingInvite) {
    $("#inviteCode").textContent = formatCode(pendingInvite);
    $("#ignoreInvite").textContent = inFamily() ? "Không, ở lại nhóm hiện tại" : "Không, tôi muốn tạo nhóm khác";
  }
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
      .then(() => Promise.all(["photos", "hearts"].map((k) => fb.remove(fb.ref(fb.db, `families/${slot.f}/${k}/${slot.m}`)).catch(() => {}))))
      .then(() => done(slot))
      .catch((e) => { if (isDenied(e)) done(slot); }) // bị cấm thì cũng không xoá được nữa → bỏ khỏi hàng đợi
  ));
}

const isDenied = (err) => /PERMISSION_DENIED|permission.denied/i.test(String(err?.code || err?.message || err));

// Vào nhóm với tư cách NGƯỜI MỚI; đang ở nhóm khác thì rời nhóm cũ.
function switchFamily(code) {
  if (state.familyId && state.familyId !== code) queueLeave(state.familyId);
  unqueue({ f: code, m: state.memberId });
  delete state.carry;
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
  delete state.carry;
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
let hearts = {};           // người nhận -> { người thả: lúc thả }
let heartsLoaded = false;
let selectedId = null;     // đang xem thẻ chi tiết của ai
let placing = null;        // đang đặt địa điểm: { id, emoji, name, radius, nameEdited }
let previewCircle = null;
let prevFix = null;        // lần định vị trước, để tự tính tốc độ khi máy không báo
let fixAt = 0;             // lúc nhận lần định vị gần nhất
let fixLost = false;       // máy vừa báo mất tín hiệu định vị
let hiddenAt = 0;          // lần gần nhất app bị ẩn / xuống nền
let deniedShown = false;   // đã báo "chưa cho phép vị trí" rồi thì không nhắc lại mỗi lần mở app

// Vị trí trên máy còn dùng được không. Không dùng khi GPS vừa báo mất, hoặc khi app vừa quay lại sau lúc bị ẩn
// mà chưa có lần định vị mới (myPos là chỗ của hàng giờ trước — gửi lên sẽ đè vị trí mới hơn từ Phím tắt / máy khác).
const fixUsable = () => !!myPos && !fixLost && !(hiddenAt > fixAt && Date.now() - fixAt > FIX_STALE);
// Tốc độ chỉ có nghĩa ngay sau lần định vị; máy nằm yên có thể rất lâu không báo lần mới.
const mySpeed = () => (fixUsable() && Date.now() - fixAt <= FIX_STALE ? myPos.speed : null);

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
  clearInviteUrl();
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

  applyCarry();

  fb.onValue(fb.ref(fb.db, ".info/serverTimeOffset"), (s) => { serverOffset = s.val() || 0; });
  fb.onValue(fb.ref(fb.db, ".info/connected"), (s) => {
    connected = !!s.val();
    if (connected && !kicked) {
      fb.onDisconnect(meRef()).update({ online: false }).catch(() => {});
      if (liveOnline()) fb.update(meRef(), { online: true }).catch(() => {});
      cleanOldEvents();
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
      hideLeftovers();
    } else if (state.member) {
      return onKicked();
    }
    render();
    announceMoods();
    if (firstLoad) { dropOldMood(); setTimeout(greetHearts, 1500); } // chờ ghim rơi xuống xong
    if (firstLoad && myPos) pushPosition(false); // GPS có trước dữ liệu nhóm → giờ mới gửi
    if (firstLoad) trackMyPlace();
    trackOthersPlaces();
  });
  fb.onValue(famRef("places"), (s) => {
    places = {};
    for (const [id, p] of Object.entries(s.val() || {})) {
      if (p && typeof p.lat === "number" && typeof p.lng === "number" && p.radius > 0) places[id] = p;
    }
    placesLoaded = true;
    renderPlaces();
    trackMyPlace();
    trackOthersPlaces();
    render();
  });
  fb.onValue(famRef("hearts"), (s) => { hearts = s.val() || {}; onHearts(); render(); });
  // Dòng thời gian: chỉ tải 2 ngày gần nhất (hiển thị "Hôm nay").
  fb.onValue(fb.query(famRef("events"), fb.orderByChild("at"), fb.startAt(Date.now() - 2 * 864e5)), (s) => {
    events = [];
    s.forEach((c) => { const v = c.val(); if (v) events.push({ id: c.key, ...v }); });
    announceEvents();
    renderFeed();
  });

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
  addEventListener("online", updateStatus);
  addEventListener("offline", updateStatus);

  setInterval(() => {
    if (myPos && gpsOn() && appVisible()) pushPosition(true);
    render();
  }, 30e3);

  const onVisibility = () => {
    if (!fb || !state.familyId || kicked) return;
    const visible = appVisible();
    meWrite({ online: liveOnline() }).catch(() => {});
    if (!visible) hiddenAt = Date.now();
    else {
      if (gpsOn() && watchId === null) startWatching(); // vừa cấp lại quyền vị trí trong cài đặt máy
      else if (myPos && gpsOn()) { if (fixUsable()) pushPosition(true); else refreshFix(); }
      if (state.wake) requestWakeLock();
      updateStatus();
      render();
      greetHearts();
    }
  };
  if (!welcome && !state.moodUsed && !state.moodHint) {
    state.moodHint = true;
    saveState();
    setTimeout(() => toast("Mới: chạm nút 💭 cạnh tên bạn để khoe đang làm gì!", 5000), 2500);
  }
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

// Sau khi đổi mã nhóm: ghi ảnh đại diện + địa điểm mang theo lên nhóm mới. Server nhận đủ mới xoá bản cất trong máy
// (mất mạng giữa chừng thì lần mở app sau ghi tiếp). `at` = bây giờ để ai đang ở sẵn đó không bị tính là "vừa đến".
function applyCarry() {
  const c = state.carry;
  if (!c) return;
  const jobs = [];
  if (c.f === state.familyId) {
    if (c.photo) {
      photoCache.set(state.memberId, c.photo);
      photoTried.set(state.memberId, c.photo.v);
      persistPhotos();
      jobs.push(fb.set(famRef(`photos/${state.memberId}`), c.photo), fb.update(meRef(), { photo: c.photo.v }));
    }
    for (const [id, p] of Object.entries(c.places || {})) jobs.push(fb.set(famRef(`places/${id}`), { ...p, at: fb.serverTimestamp() }));
  }
  Promise.allSettled(jobs).then((list) => {
    if (list.some((r) => r.status === "rejected" && !isDenied(r.reason))) return;
    delete state.carry;
    saveState();
  });
}

// Dọn sự kiện cũ (ai mở app cũng dọn giúp) — giữ database gọn. Chỉ chạy sau khi đã kết nối, lúc đã biết giờ server:
// máy nào để đồng hồ chạy nhanh vài ngày mà dọn theo giờ máy thì xoá mất dòng thời gian của cả nhà.
let eventsCleaned = false;
function cleanOldEvents() {
  if (eventsCleaned) return;
  eventsCleaned = true;
  fb.get(fb.query(famRef("events"), fb.orderByChild("at"), fb.endAt(now() - EVENT_KEEP))).then((s) => {
    const old = {};
    s.forEach((c) => { old[c.key] = null; });
    if (Object.keys(old).length) fb.update(famRef("events"), old).catch(() => {});
  }).catch(() => { eventsCleaned = false; });
}

// Rules không nhận vị trí của người đang tắt chia sẻ (kể cả từ Phím tắt iPhone). Vị trí còn sót từ trước khi có
// luật đó: máy nào đang mở app cũng xoá giúp, vì máy của người ấy có thể không mở app.
const hiddenDone = new Set();
function hideLeftovers() {
  for (const [id, m] of Object.entries(members)) {
    if (m?.sharing !== false || (m.lat == null && m.lng == null && m.place == null) || hiddenDone.has(id)) continue;
    hiddenDone.add(id); // mỗi lần mở app chỉ thử một lần cho mỗi người
    fb.update(famRef(`members/${id}`), { ...HIDDEN_POS }).catch(() => {});
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

// Nguồn ô bản đồ: OSM trước; mạng nào chặn/không tải được OSM thì tự đổi sang Esri (không cần key).
const TILE_SOURCES = [
  { name: "OSM", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
  { name: "Esri", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 19, maxNativeZoom: 18, attribution: "Tiles &copy; Esri" },
];
// Số liệu chẩn đoán (hiện ở cuối Cài đặt): người nhà báo lỗi bản đồ thì chụp màn hình dòng này.
const tileStats = { src: 0, ok: 0, err: 0, lastErr: "" };
let tileLayer = null, tileWatch = 0;

// Máy nào không tải được OSM (mạng/nhà mạng chặn, OSM chặn IP…) thì nhớ lại 1 ngày: lần mở sau dùng
// thẳng nguồn dự phòng, khỏi chờ bản đồ trắng. Quá 1 ngày thì thử lại OSM.
const TILE_REMEMBER = 24 * 3600e3;
const startTileSource = () =>
  state.tileSrc > 0 && state.tileSrc < TILE_SOURCES.length && Date.now() - (state.tileSrcAt || 0) < TILE_REMEMBER ? state.tileSrc : 0;

function addTiles(i) {
  const s = TILE_SOURCES[i];
  if (tileLayer) tileLayer.remove();
  Object.assign(tileStats, { src: i, ok: 0, err: 0, lastErr: "" });
  const next = () => {
    clearTimeout(tileWatch);
    if (tileStats.ok || i + 1 >= TILE_SOURCES.length || tileStats.src !== i) return;
    state.tileSrc = i + 1; state.tileSrcAt = Date.now(); saveState();
    addTiles(i + 1);
    toast("Đổi sang máy chủ bản đồ dự phòng");
  };
  tileLayer = L.tileLayer(s.url, { maxZoom: s.maxZoom, maxNativeZoom: s.maxNativeZoom, attribution: s.attribution })
    .on("tileload", () => {
      tileStats.ok++;
      if (i === 0 && state.tileSrc) { state.tileSrc = 0; saveState(); } // OSM lại tải được → thôi dự phòng
    })
    .on("tileerror", (e) => {
      tileStats.err++;
      tileStats.lastErr = `${s.name} ${e.coords ? `${e.coords.z}/${e.coords.x}/${e.coords.y}` : ""}`;
      if (tileStats.err >= 6 && !tileStats.ok) next(); // lỗi liền 6 ô, chưa ô nào được → đổi ngay
    })
    .addTo(map);
  // Hoặc 8 giây mà vẫn chưa tải được ô nào (mạng treo, không báo lỗi) → thử nguồn kế tiếp
  clearTimeout(tileWatch);
  tileWatch = setTimeout(next, 8e3);
}

function mapDiag() {
  if (!window.L) return "Bản đồ: không tải được Leaflet";
  if (!map) return "Bản đồ: chưa mở";
  const sz = map.getSize(), el = $("#map");
  const dark = matchMedia("(prefers-color-scheme: dark)").matches ? " · tối" : "";
  return `Bản đồ: ${TILE_SOURCES[tileStats.src].name} · ${tileStats.ok} ô ✓ · ${tileStats.err} lỗi` +
    `${tileStats.lastErr ? ` (${tileStats.lastErr})` : ""} · khung ${sz.x}×${sz.y}/${el.clientWidth}×${el.clientHeight}` +
    ` · zoom ${Math.round(map.getZoom() * 10) / 10}${dark} · ${navigator.onLine ? "có mạng" : "mất mạng"}`;
}

function initMap() {
  // trackResize: false — ResizeObserver bên dưới lo việc báo đổi cỡ, kèm giữ đúng chỗ ghim đang đặt.
  map = L.map("map", { zoomControl: false, attributionControl: true, trackResize: false }).setView([16.05, 106.5], 5);
  addTiles(startTileSource());
  map.attributionControl.setPrefix(false);
  // Lớp dây nối ghim ↔ vị trí thật: ngay dưới lớp ghim (600) để dây không đè lên ghim/nhãn tên.
  const tetherPane = map.createPane("tethers");
  tetherPane.style.zIndex = 590;
  tetherPane.style.pointerEvents = "none";
  map.on("dragstart", () => { userMovedMap = true; });
  map.on("zoomanim", (e) => relayoutPinsFor(e.zoom)); // ghim dàn lại cùng lúc với hiệu ứng zoom
  map.on("zoomend", () => renderMarkers()); // tách các ghim chồng lên nhau theo mức zoom
  map.on("click", () => { if (selectedId && !placing) closeDetail(); });
  map.on("move", () => {
    if (!placing) return;
    if (!placing.auto) placing.center = map.containerPointToLatLng(targetPoint()); // người dùng kéo / phóng bản đồ
    updatePreview();
  });
  map.on("moveend", () => { if (placing) placing.auto = false; });
  // Khung bản đồ đổi cỡ (thanh địa chỉ co/giãn, xoay máy, mở từ màn hình chính) mà Leaflet không biết
  // → nó vẫn tưởng khung cũ (có khi 0×0) và không tải ô nào. Báo lại mỗi khi khung đổi cỡ.
  new ResizeObserver(() => {
    const was = placing?.auto;
    if (placing) placing.auto = true; // đổi cỡ khung không phải là người dùng dời chỗ
    map.invalidateSize({ pan: false });
    if (placing) { placing.auto = was; keepTarget(); }
  }).observe($("#map"));
}

function observeSheet() {
  const sheet = $("#sheet");
  const apply = () => {
    const h = isDesktop() ? 0 : sheet.getBoundingClientRect().height;
    $("#main").style.setProperty("--sheet-h", `${h}px`);
    // Bảng kéo lên gần hết màn hình → không còn chỗ cho 2 nút nổi: ẩn đi thay vì để đè lên thanh trên cùng
    const room = innerHeight - h - $(".topbar").getBoundingClientRect().bottom;
    $("#main").classList.toggle("fabs-hidden", !isDesktop() && room < 224);
  };
  new ResizeObserver(apply).observe(sheet);
  addEventListener("resize", apply);
  apply();
}

function mapPadding() {
  const el = $("#sheet"), sheet = el.getBoundingClientRect();
  // Bảng đang trượt sang nấc khác: tính theo chiều cao SẼ tới, không thì ghim nằm khuất dưới bảng.
  const sliding = el.classList.contains("moving") && !el.classList.contains("dragging");
  if (isDesktop()) return { paddingTopLeft: [sheet.width + 48, 150], paddingBottomRight: [104, 48] };
  let h = sheet.height;
  if (sheetMode === "full") h = sheetMetrics().half; // bảng che gần hết bản đồ: căn sẵn cho lúc bảng hạ xuống
  else if (sliding) h = sheetMetrics()[sheetMode] || h;
  // Màn hình thấp (điện thoại xoay ngang): bớt lề trên để vùng căn luôn còn ít nhất 40 px, không thì Leaflet tính ra zoom sai.
  const top = Math.min(150, Math.max(70, map.getSize().y - h - 36 - 40));
  return { paddingTopLeft: [48, top], paddingBottomRight: [104, h + 36] }; // 104 = cột nút nổi + nửa bong bóng ghim
}

function focusOn(points, animate = true) {
  if (!points.length) return;
  const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
  if (reducedMotion()) animate = false;
  // Xem một người mà đang phóng to hơn mức 16 thì giữ nguyên, đừng thu nhỏ lại.
  const opts = { ...mapPadding(), maxZoom: points.length === 1 ? Math.max(16, map.getZoom()) : 16, animate };
  if (points.length > 1) makeRoomForPins(bounds, opts);
  if (animate) map.flyToBounds(bounds, { ...opts, duration: 0.8 });
  else map.fitBounds(bounds, opts);
}

// Mấy người ở cùng chỗ thì ghim bị đẩy dạt ra hai bên: nới lề đúng phần bị đẩy, không thì ghim ở mép văng khỏi màn hình.
function makeRoomForPins(bounds, opts) {
  const { paddingTopLeft: tl, paddingBottomRight: br } = opts, size = map.getSize();
  const zoom = Math.min(opts.maxZoom, map.getBoundsZoom(bounds, false, L.point(tl).add(br)));
  if (!Number.isFinite(zoom)) return;
  const located = locatedMembers(), off = layoutPins(located, zoom);
  const xs = located.map((m) => map.project([m.lat, m.lng], zoom).x);
  const pushed = located.map((m, i) => xs[i] + off.get(m.id).x);
  const left = Math.max(0, Math.min(...xs) - Math.min(...pushed)), right = Math.max(0, Math.max(...pushed) - Math.max(...xs));
  const k = Math.min(1, Math.max(0, size.x - tl[0] - br[0] - 40) / (left + right || 1)); // luôn chừa ít nhất 40 px
  opts.paddingTopLeft = [tl[0] + left * k, tl[1]];
  opts.paddingBottomRight = [br[0] + right * k, br[1]];
}

// Dữ liệu từ server + bản ghi của chính mình lấy từ máy (để vẫn hiện "Tôi" khi mạng chậm/mất).
function allMembers() {
  const me = { ...(members[state.memberId] || {}), ...profilePayload() };
  // Máy này đang lấy GPS → dùng vị trí trên máy. Máy chỉ xem → giữ vị trí từ máy khác (trên server).
  if (gpsOn() && fixUsable()) Object.assign(me, { lat: myPos.lat, lng: myPos.lng, acc: myPos.acc });
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
  if (m.sharing === false) return "off";
  if (id === state.memberId && gpsOn()) return fixUsable() ? "on" : "off";
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
  const told = events.filter((e) => seenEvents.has(e.id));
  for (const e of events) seenEvents.add(e.id);
  if (!eventsPrimed) { eventsPrimed = true; return; } // lần tải đầu: chỉ là lịch sử
  for (const e of fresh) {
    // Một người dùng 2 máy, máy nào cũng ghi → chỉ báo một lần.
    if (told.some((x) => x.m === e.m && x.type === e.type && x.place === e.place && Math.abs(x.at - e.at) < 2 * 60e3)) continue;
    told.push(e);
    freshEvents.add(e.id);
    setTimeout(() => freshEvents.delete(e.id), 3000);
    if (e.m !== state.memberId && now() - (e.at || 0) < 5 * 60e3) showLive(e);
  }
}

const liveQueue = []; // mấy người về cùng lúc: báo lần lượt, không đè nhau
let liveBusy = false;
// Trả về true nếu đã hiện.
function showLive(e) {
  const m = members[e.m], pl = places[e.place];
  const mood = e.type === "mood" ? moodOf(m) : null;
  if (!m?.name || (e.type === "mood" ? mood?.at !== e.at : !pl)) return false;
  if (liveBusy) { if (liveQueue.length < 5) liveQueue.push(e); return false; }
  liveBusy = true;
  const home = pl?.emoji === "🏠";
  const verb = e.type === "leave" ? "vừa rời" : home ? "đã về đến" : "vừa đến";
  const box = $("#liveToast");
  box.innerHTML = `${avatarHtml(m, e.m)}
    <span class="lt-text"><strong>${escapeHtml(m.name)}</strong>${mood ? `: ${escapeHtml(moodText(mood, m))}` : ` ${verb} <strong>${escapeHtml(`${pl.emoji || "📍"} ${pl.name}`)}</strong>`}
      <small>${escapeHtml(clockTime(e.at || Date.now()))}</small></span>
    <span class="lt-emoji" aria-hidden="true">${mood ? mood.emoji : e.type === "leave" ? "👋" : home ? "🏡" : "🎉"}</span>`;
  box.classList.remove("out");
  box.hidden = false;
  bringToFront(box);
  buzz([30, 60, 30]);
  if (mood) sound.mood(mood.key); else if (e.type === "arrive") sound.arrive(home); else sound.leave();
  const at = mood && pinPoint(e.m);
  if (at) burst(at.x, at.y, moodSparks(mood), 10);
  if (e.type === "arrive") {
    requestAnimationFrame(() => {
      const r = box.getBoundingClientRect();
      burst(r.left + r.width / 2, r.bottom, [pl.emoji || "📍", "🎉", "💛", "✨"], 28, true);
    });
  }
  playOnce(markers.get(e.m)?.marker.getElement()?.firstElementChild, "hop", 0, 700);
  setTimeout(() => {
    box.classList.add("out");
    setTimeout(() => {
      box.hidden = true;
      liveBusy = false;
      while (liveQueue.length && !showLive(liveQueue.shift())); // người đã rời / địa điểm đã xoá thì bỏ qua
    }, 380);
  }, 5000);
  return true;
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

// Đang cắm sạc? Phím tắt iPhone gửi chữ ("Đúng"/"Có"/"Yes"/"1"… tuỳ ngôn ngữ máy) thay vì true/false.
// Chỉ tin khi được báo trong 2 giờ gần đây: rút sạc mà không có gì báo lại thì tự tắt.
const CHARGING_WORDS = /^(true|1|yes|có|co|đúng|dung|on|bật)$/i;
function isCharging(m) {
  const c = m.charging;
  const on = c === true || (typeof c === "string" && CHARGING_WORDS.test(c.trim()));
  return on && typeof m.chargingAt === "number" && now() - m.chargingAt <= CHARGE_STALE;
}

// Pin để hiển thị, hoặc null. Vị trí và pin không phải lúc nào cũng được báo cùng nhau (web trên iPhone không đọc được
// pin, chỉ Phím tắt báo) → mức pin cũ hơn vị trí nhiều thì ghi rõ giờ báo và không báo động.
function batteryOf(m) {
  if (typeof m.battery !== "number" || m.sharing === false) return null;
  const level = Math.min(100, Math.max(0, Math.round(m.battery)));
  const at = typeof m.chargingAt === "number" ? m.chargingAt : m.updatedAt || 0; // luôn ghi cùng lúc với battery
  const old = (m.updatedAt || 0) - at > BATTERY_LAG;
  const charging = isCharging(m);
  return { level, at, old, charging, low: level <= LOW_BATTERY && !charging && !old };
}
// Hình viên pin vẽ theo đúng mức (emoji 🔋 lúc nào cũng đầy; 🪫 thì máy đời cũ không có).
const batteryIcon = (level) => `<svg class="batt-icon" viewBox="0 0 26 14" aria-hidden="true">
  <rect x="1" y="1" width="21" height="12" rx="3.5"/><path d="M24.5 5v4"/>
  <rect class="fill" x="3.5" y="3.5" width="${Math.max(1.5, 16 * level / 100).toFixed(1)}" height="7" rx="1.5"/></svg>`;

function movingText(m, id) {
  const own = id === state.memberId && gpsOn() && fixUsable();
  const speed = own ? mySpeed() : m.speed;
  const fresh = own || now() - (m.updatedAt || 0) < 3 * 60e3;
  if (!(speed >= MOVING_SPEED) || !fresh) return null;
  return speed <= WALK_SPEED ? "🚶 Đang đi bộ" : `🛵 Đang di chuyển · ${Math.round(speed * 3.6)} km/h`;
}

const placeLabel = (pl) => `${pl.emoji || "📍"} Ở ${pl.name}${pl.since ? ` từ ${clockTime(pl.since)}` : ""}`;
const avatarHtml = (m, id, cls = "") =>
  `<span class="avatar ${cls}" style="--c:${escapeHtml(m.color || "#ccfbf1")}">${avatarInner(m, id)}</span>`;

/* ---- Bong bóng "đang làm gì" + thả tim ---- */
// members/{id}/mood + moodAt: tự hết hạn khi hiển thị, không cần ai dọn. hearts/{người nhận}/{người thả} = lúc thả.

// Bong bóng đang hiện của một người, hoặc null (không có / hết hạn / "Đang về" mà đã ở Nhà).
function moodOf(m) {
  const d = m && Object.hasOwn(MOODS, m.mood) && typeof m.moodAt === "number" ? MOODS[m.mood] : null;
  if (!d || now() - m.moodAt > d.ttl) return null;
  if (m.mood === "go" && memberPlace(m)?.emoji === "🏠") return null;
  return { key: m.mood, at: m.moodAt, ...d };
}

// Về tới Nhà thì tắt hẳn "Đang về" (không thì lát nữa ra khỏi nhà nó lại hiện).
const homeClears = (m, placeId) => (m.mood === "go" && places[placeId]?.emoji === "🏠" ? { mood: null, moodAt: null } : {});

// "Đang về": còn bao xa tới Nhà gần nhất (đường chim bay), hoặc null nếu không biết.
function homeDistance(mood, m) {
  if (mood.key !== "go" || m.sharing === false || typeof m.lat !== "number") return null;
  const ds = Object.values(places).filter((p) => p.emoji === "🏠").map((p) => distanceMeters(m, p));
  return ds.length ? formatDistance(Math.min(...ds)) : null;
}
function moodText(mood, m) {
  const km = homeDistance(mood, m);
  return km ? `${mood.text} · còn ${km}` : mood.text;
}

// Ai đã thả tim cho bong bóng đang hiện (tim của bong bóng trước không tính).
const heartsOn = (id, mood) => Object.entries(hearts[id] || {})
  .filter(([from, at]) => from !== id && at >= mood.at && members[from]?.name).map(([from]) => from);

function moodBubble(mood, m, withKm) {
  const n = heartsOn(m.id, mood).length;
  return `<div class="pin-mood mood-${mood.key}"><span class="mood-e">${mood.emoji}</span>${withKm ? '<span class="mood-km"></span>' : ""}${
    mood.bits.map((b, i) => `<i class="bit b${i}">${b}</i>`).join("")}${n ? `<b class="mood-hearts">❤️${n > 1 ? n : ""}</b>` : ""}</div>`;
}

const joinNames = (list) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} và ${list[list.length - 1]}`);
function renderDetailMood(id, m, isMe) {
  const box = $("#detailMood"), mood = moodOf(m);
  box.hidden = !mood && !isMe;
  if (box.hidden) return;
  const from = mood ? heartsOn(id, mood) : [];
  const who = from.map((f) => (f === state.memberId ? "Bạn" : members[f].name));
  const liked = from.includes(state.memberId);
  box.classList.toggle("on", !!mood);
  const line = mood ? `<span class="dm-emoji" aria-hidden="true">${mood.emoji}</span><span class="dm-text"><strong>${escapeHtml(moodText(mood, m))}</strong>
    <small>${escapeHtml(who.length ? `❤️ ${joinNames(who)}` : `từ ${clockTime(mood.at)}`)}</small></span>` : "";
  setHtml(box, line + (isMe
    ? `<button class="btn btn-secondary${mood ? " btn-sm" : ""}" type="button" aria-haspopup="dialog">${mood ? "Đổi" : "💭 Bạn đang làm gì?"}</button>`
    : `<button class="heart-btn" type="button" aria-label="${escapeHtml(`Thả tim cho ${m.name}`)}">${liked ? "❤️" : "🤍"}</button>`));
}

const centerOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
// Chỗ của một người trên màn hình (bong bóng, không có thì ảnh); null nếu bị bảng che / nằm ngoài màn hình.
function pinPoint(id, part = ".pin-mood") {
  const el = markers.get(id)?.marker.getElement();
  const at = el && (el.querySelector(part) || el.querySelector(".pin-bubble"));
  if (!at) return null;
  const p = centerOf(at), s = $("#sheet").getBoundingClientRect();
  const covered = p.x > s.left && p.x < s.right && p.y > s.top && p.y < s.bottom;
  return !covered && p.x > 0 && p.x < innerWidth && p.y > 0 && p.y < innerHeight ? p : null;
}

/* Bảng chọn: 6 hình nảy ra quanh ghim (hoặc quanh nút 💭). Chạm một hình là xong, chạm lại hình đang bật là tắt. */
let moodAnchor = null;
function openMoodPicker(at) {
  const d = $("#moodDialog");
  if (d.open || kicked || placing || !membersLoaded) return;
  buzz();
  const me = allMembers()[state.memberId], mood = moodOf(me), hint = suggestMood(me);
  moodAnchor = at || { x: innerWidth / 2, y: innerHeight / 2 };
  const n = Object.keys(MOODS).length;
  $("#moodRing").innerHTML = `<div class="mood-center">${avatarHtml(me, state.memberId)}<span id="moodTitle">Bạn đang…</span></div>`
    + Object.entries(MOODS).map(([key, o], i) => {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2, on = mood?.key === key;
      return `<button class="mood-opt${on ? " on" : !mood && key === hint ? " hint" : ""}" type="button" data-mood="${key}" aria-pressed="${on}"
        style="--cx:${Math.cos(a).toFixed(3)};--cy:${Math.sin(a).toFixed(3)};--i:${i}"><span class="mood-e" aria-hidden="true">${o.emoji}</span><span>${on ? "Tắt" : escapeHtml(o.pick)}</span></button>`;
    }).join("");
  $("#toast").classList.remove("show"); // thông báo cũ khỏi che bảng chọn
  d.showModal();
  placeMoodPicker();
}
// Vòng tròn mở ngay tại chỗ chạm, nhích vào trong cho đủ chỗ 6 nút.
function placeMoodPicker() {
  const fit = (v, half, size) => (size < half * 2 ? size / 2 : Math.max(half, Math.min(size - half, v)));
  const ring = $("#moodRing");
  ring.style.left = `${fit(moodAnchor.x, 146, innerWidth)}px`;
  ring.style.top = `${fit(moodAnchor.y, 164, innerHeight)}px`;
}

// Hình hợp hoàn cảnh nhất lúc này → phóng to cho dễ chạm.
function suggestMood(me) {
  const pl = memberPlace(me), home = pl?.emoji === "🏠", h = new Date().getHours();
  const canGo = !home && me.sharing !== false && Object.values(places).some((p) => p.emoji === "🏠");
  if (canGo && !pl && movingText(me, state.memberId)) return "go";
  if (h >= 22 || h < 5) return "sleep";
  if (canGo && h >= 16 && h < 21) return "go";
  if (h === 11 || h === 12 || h === 17 || h === 18) return "hungry";
  if (pl && ["🏫", "🏢"].includes(pl.emoji)) return "busy";
  return "love";
}

function pickMood(key, btn) {
  const me = allMembers()[state.memberId], cur = moodOf(me), o = MOODS[key];
  if (key === "go" && memberPlace(me)?.emoji === "🏠") {
    playOnce(btn.firstElementChild, "shake", 0, 500);
    sound.warn();
    return toast("Bạn đang ở Nhà rồi mà 😄");
  }
  const at = pinPoint(state.memberId) || centerOf(btn);
  $("#moodDialog").close();
  state.moodUsed = true;
  saveState();
  buzz([15, 40, 25]);
  if (cur?.key === key) {
    sound.back();
    meWrite({ mood: null, moodAt: null }).catch(onWriteError);
    return toast("Đã tắt bong bóng");
  }
  meWrite({ mood: key, moodAt: fb.serverTimestamp() }).catch(onWriteError);
  sound.mood(key);
  burst(at.x, at.y, moodSparks(o), 14);
  toast(`${o.emoji} Cả nhà sẽ thấy: ${o.text}`);
}
const moodSparks = (o) => [o.emoji, ...o.bits.filter((b) => b !== "z"), "✨"];

// Bong bóng đã hết hạn thì xoá khỏi server luôn (lúc mở app).
function dropOldMood() {
  const me = members[state.memberId];
  if (me?.mood && typeof me.moodAt === "number" && now() - me.moodAt > 24 * 3600e3) meWrite({ mood: null, moodAt: null }).catch(() => {});
}

// Người khác vừa đổi bong bóng trong lúc mình đang mở app → báo + ghim toé ra.
const seenMoods = new Map();
let moodsPrimed = false;
function announceMoods() {
  for (const [id, m] of Object.entries(members)) {
    const was = seenMoods.get(id) || 0, mood = moodOf(m);
    if (!mood || mood.at <= was) continue;
    seenMoods.set(id, mood.at);
    if (moodsPrimed && id !== state.memberId && m.name && now() - mood.at < 5 * 60e3 && appVisible()) showLive({ type: "mood", m: id, at: mood.at });
  }
  moodsPrimed = true;
}

/* ---- Thả tim ---- */
const heartSent = new Map(); // người nhận -> lần ghi gần nhất
function sendHeart(to, from) {
  const m = members[to];
  if (!m || !moodOf(m) || kicked) return;
  buzz(12);
  sound.heart();
  flyHeart(from || pinPoint(state.memberId), pinPoint(to));
  if (Date.now() - (heartSent.get(to) || 0) < HEART_EVERY) return;
  heartSent.set(to, Date.now());
  famWrite(`hearts/${to}`, { [state.memberId]: fb.serverTimestamp() }).catch(onWriteError);
}

// ❤️ bay theo đường cong từ a tới b, tới nơi thì toé ra. Không thấy chỗ xuất phát thì toé luôn tại b.
function flyHeart(a, b) {
  if (reducedMotion() || !(a || b)) return;
  const end = b || a;
  const land = () => burst(end.x, end.y, ["❤️", "💛", "💕"], 8);
  const dist = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  if (dist < 30) return land();
  const el = document.createElement("span");
  el.textContent = "❤️";
  el.style.fontSize = "30px";
  $("#fx").appendChild(el);
  const lift = Math.min(160, 50 + dist / 3), frames = [];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12, x = a.x + (b.x - a.x) * k - 15, y = a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * lift - 18;
    frames.push({ transform: `translate(${x}px, ${y}px) scale(${(0.7 + Math.sin(k * Math.PI) * 0.8).toFixed(2)}) rotate(${Math.round(Math.sin(k * 9) * 14)}deg)` });
  }
  el.animate(frames, { duration: 850, easing: "cubic-bezier(.4,0,.5,1)" }).finished.then(() => { el.remove(); land(); }, () => el.remove());
}

// Người trong nhà thả tim cho nhau lúc mình đang xem: tim bay trên bản đồ. Tim cho mình: greetHearts().
const seenHearts = new Map();
function onHearts() {
  for (const [to, list] of Object.entries(hearts)) {
    for (const [from, at] of Object.entries(list || {})) {
      const key = `${to}/${from}`, was = seenHearts.get(key) || 0;
      seenHearts.set(key, at);
      if (heartsLoaded && at > was && to !== state.memberId && from !== state.memberId && now() - at < 60e3 && appVisible()) {
        const a = pinPoint(from), b = pinPoint(to);
        if (b) flyHeart(a, b);
      }
    }
  }
  const first = !heartsLoaded;
  heartsLoaded = true;
  if (!first) greetHearts(); // lần tải đầu: enterMain gọi sau khi ghim đã rơi xuống
}

// Tim cho mình mà mình chưa thấy — vừa thả, hoặc thả lúc mình không mở app.
function greetHearts() {
  if (!membersLoaded || !heartsLoaded || !appVisible() || kicked) return;
  const since = Math.max(state.heartSeen || 0, now() - HEART_KEEP);
  const mine = Object.entries(hearts[state.memberId] || {})
    .filter(([f, at]) => f !== state.memberId && at > since && members[f]?.name).sort((a, b) => b[1] - a[1]);
  if (!mine.length) return;
  state.heartSeen = mine[0][1];
  saveState();
  if (mine.length === 1 && now() - mine[0][1] < 15e3) flyHeart(pinPoint(mine[0][0]), pinPoint(state.memberId));
  else burst(innerWidth / 2, 60, ["❤️", "💕", "💛"], 30, true);
  buzz([20, 50, 20]);
  sound.heart(true);
  toast(`❤️ ${joinNames(mine.map(([f]) => members[f].name))} thả tim cho bạn`, 4000);
}

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
    const mood = moodOf(m), km = mood && homeDistance(mood, m);
    const cls = `pin${isMe ? " me" : ""}${live ? " live" : ""}${stale ? " stale" : ""}${selectedId === m.id ? " selected" : ""}`;
    const html = `<div class="${cls}" style="--c:${escapeHtml(m.color || "#ccfbf1")}">
      <div class="pin-bubble">${avatarInner(m, m.id)}</div>
      <div class="pin-label">${escapeHtml(isMe ? "Tôi" : m.name)}</div>${mood ? moodBubble(mood, m, !!km) : ""}</div>`;
    // Dây nối nằm ở lớp riêng dưới mọi ghim, để không vắt ngang nhãn tên của người khác.
    const tetherHtml = `<div class="pin-tether" style="--c:${escapeHtml(m.color || "#ccfbf1")}"></div>`;
    const tetherIcon = () => L.divIcon({ html: tetherHtml, className: "", iconSize: [0, 0], iconAnchor: [0, 0] });
    let entry = markers.get(m.id);
    if (!entry) {
      const marker = L.marker([m.lat, m.lng], {
        icon: L.divIcon({ html, className: "", iconSize: [56, 66], iconAnchor: [28, 66] }),
        keyboard: true, title: m.name, zIndexOffset: isMe ? 1000 : 0,
      }).addTo(map);
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        if (m.id === state.memberId) openMoodPicker(pinPoint(m.id, ".pin-bubble"));
        else if (e.originalEvent?.target?.closest?.(".pin-mood")) sendHeart(m.id);
        else openDetail(m.id);
      });
      marker.on("dblclick", () => {}); // thả tim liên tục: đừng để bản đồ hiểu là chạm đúp để phóng to
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
    // Số km đổi liên tục: chỉ thay chữ, không dựng lại ghim (hiệu ứng khỏi chạy lại từ đầu)
    const kmEl = km && entry.marker.getElement()?.querySelector(".mood-km");
    if (kmEl && kmEl.textContent !== km) kmEl.textContent = km;
  }
  for (const [id, entry] of markers) {
    if (!seen.has(id)) { cancelAnimationFrame(entry.raf); entry.marker.remove(); entry.tether.remove(); markers.delete(id); }
  }

  if (fixUsable() && gpsOn()) {
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
const PIN_W = 56, PIN_H = 66, PIN_LABEL_H = 26, PIN_GAP = 6, PIN_MOOD_H = 40, PIN_KM_W = 104;
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
    const mood = moodOf(m);
    return { id: m.id, p, x: p.x, y: p.y, top: mood ? PIN_MOOD_H : 0, // bong bóng nhô lên trên ghim
      w: Math.max(PIN_W, labelWidth(m.id === state.memberId ? "Tôi" : m.name), mood && homeDistance(mood, m) ? PIN_KM_W : 0) };
  }).sort((a, b) => a.id.localeCompare(b.id));

  // Gỡ chồng lấn từng cặp, lặp tới khi hết (cả nhà chỉ vài người nên rất nhẹ).
  for (let iter = 0; iter < 80; iter++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const ox = (a.w + b.w) / 2 + PIN_GAP - Math.abs(b.x - a.x);
        const oy = H + PIN_GAP + (b.y > a.y ? b.top : a.top) - Math.abs(b.y - a.y); // top: phần nhô lên của ghim nằm dưới
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
    if (zoom == null) pinBoxes.push({ x1: it.x - it.w / 2, x2: it.x + it.w / 2, y1: it.y - PIN_H - it.top, y2: it.y + PIN_LABEL_H });
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

  // Chỉ dựng lại dòng nào thật sự đổi: GPS báo mỗi giây, thay cả danh sách đúng lúc đang chạm thì cú chạm bị mất.
  const old = new Map([...list.children].filter((el) => el.dataset.id).map((el) => [el.dataset.id, el]));
  const rows = [];
  const here = myLocation();
  const herePlace = here && memberPlace(here);
  for (const [id, m] of entries) {
    const isMe = id === state.memberId;
    const status = memberStatus(m, id);
    const hasPos = m.sharing !== false && typeof m.lat === "number";
    const pl = hasPos ? memberPlace(m) : null;
    const moving = hasPos && !pl ? movingText(m, id) : null;
    const mood = moodOf(m);

    const meta = []; // dòng phụ: các đoạn HTML đã escape
    const text = (s) => meta.push(escapeHtml(s));
    const tag = pl ? placeLabel(pl) : moving; // dòng chính: đang ở đâu / đang đi
    if (isMe) {
      if (!state.sharing) text("Đã tắt chia sẻ vị trí");
      else if (!gpsOn()) text(hasPos ? `Máy này chỉ xem · vị trí từ máy khác, ${relTime(now() - (m.updatedAt || 0))}` : "Máy này chỉ xem");
      else if (geoError) text(geoError);
      else if (!fixUsable()) text("Đang tìm vị trí…");
      else if (!pl) text("Đang chia sẻ vị trí");
    } else if (m.sharing === false) {
      text("Đã tắt chia sẻ vị trí");
    } else if (!hasPos) {
      text("Chưa có vị trí");
    } else {
      text(status === "on" ? "Trực tiếp" : relTime(now() - (m.updatedAt || 0)));
      if (here && !(pl && herePlace && pl.id === herePlace.id)) text(`cách ${formatDistance(distanceMeters(here, m))}`.replace(/ /g, "\u00a0")); // xuống dòng thì xuống cả cụm
    }
    const batt = isMe ? null : batteryOf(m);
    // Sắp hết pin: đặt cạnh tên cho dễ thấy, dòng phụ vẫn đủ chỗ cho khoảng cách
    const low = batt?.low ? `<span class="batt low">${batteryIcon(batt.level)} ${batt.level}%</span>` : "";

    const html = `
      <button class="member-main" type="button">
        <span class="avatar" aria-hidden="true" style="--c:${escapeHtml(m.color || "#ccfbf1")}">
          ${avatarInner(m, id)}<span class="status ${status === "on" ? "on" : status === "idle" ? "idle" : ""}"></span>
        </span>
        <span class="member-info">
          <span class="member-name${low ? " with-batt" : ""}"><span class="nm">${escapeHtml(m.name)}</span>${isMe ? ' <span class="me">(bạn)</span>' : low}</span>
          <span class="member-meta">${mood ? `<span class="member-tag mood">${escapeHtml(`${mood.emoji} ${moodText(mood, m)}`)}</span>` : ""}${tag ? `<span class="member-tag">${escapeHtml(tag)}</span>` : ""}<span class="member-sub">${meta.join(" · ")}</span></span>
        </span>
      </button>${isMe ? `<button class="mood-btn${mood ? " on" : ""}${state.moodUsed ? "" : " call"}" type="button" aria-haspopup="dialog" aria-label="${escapeHtml(mood ? `Bạn đang: ${mood.text}. Chạm để đổi` : "Bạn đang làm gì?")}">${mood ? mood.emoji : "💭"}</button>` : !hasPos ? "" : `<a class="go-btn" href="${escapeHtml(directionsUrl(m))}" target="_blank" rel="noopener" aria-label="${escapeHtml(`Chỉ đường tới ${m.name}`)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 21 3l-8 18-2-8-8-2Z"/></svg></a>`}`;
    let li = old.get(id);
    if (!li) {
      li = document.createElement("li");
      li.dataset.id = id;
      li.className = listAnimated ? "member" : "member enter";
      li.style.setProperty("--i", String(rows.length));
      li.addEventListener("animationend", (e) => { if (e.target === li) li.classList.remove("enter"); });
      li.addEventListener("click", (e) => {
        const btn = e.target.closest(".mood-btn");
        if (btn) openMoodPicker(centerOf(btn));
        else if (e.target.closest(".member-main")) openDetail(id);
      });
    }
    if (li._html !== html) { li.innerHTML = html; li._html = html; }
    rows.push(li);
  }
  // Xoá khung chờ + người đã rời trước, rồi chỉ dời những dòng đổi chỗ.
  for (const el of [...list.children]) if (!rows.includes(el)) el.remove();
  rows.forEach((li, i) => { if (list.children[i] !== li) list.insertBefore(li, list.children[i] || null); });
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
  setHtml($("#feedList"), rows.map((e) => {
    const m = members[e.m], pl = places[e.place];
    const who = e.m === state.memberId ? "Bạn" : m.name;
    const verb = e.type === "leave" ? "đã rời" : pl.emoji === "🏠" ? "đã về" : "đã đến";
    return `<li class="feed-item${freshEvents.has(e.id) ? " new" : ""}">${avatarHtml(m, e.m, "avatar-sm")}
      <span class="feed-text"><strong>${escapeHtml(who)}</strong> ${verb} <strong>${escapeHtml(`${pl.emoji || "📍"} ${pl.name}`)}</strong></span>
      <time class="feed-time" datetime="${new Date(e.at).toISOString()}">${escapeHtml(clockTime(e.at))}</time></li>`;
  }).join(""));
}

function renderPlaceHint() {
  $("#placeHint").hidden = !membersLoaded || !placesLoaded || Object.keys(places).length > 0 || !!state.placeHintDismissed;
}

/* ---- Thẻ chi tiết một người ---- */

let homeScroll = 0; // chỗ đang cuộn tới trong danh sách, để đóng thẻ thì về lại đúng chỗ
function openDetail(id) {
  buzz();
  sound.select();
  if (!selectedId) homeScroll = $("#sheetBody").scrollTop;
  const from = $("#sheet").getBoundingClientRect().height;
  selectedId = id;
  $("#sheet").classList.add("detail-open");
  renderDetail();
  if (!selectedId) return; // người này vừa rời nhóm
  setSheetMode("half", true, from); // bảng cao vừa đúng nội dung thẻ
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
  const id = selectedId, focused = $("#memberDetail").contains(document.activeElement);
  const from = $("#sheet").getBoundingClientRect().height;
  selectedId = null;
  $("#memberDetail").hidden = true;
  $("#sheetHome").hidden = false;
  $("#sheet").classList.remove("detail-open");
  setSheetMode(sheetMode, true, from);
  $("#sheetBody").scrollTop = homeScroll;
  if (focused) $(`#memberList li[data-id="${id}"] .member-main`)?.focus({ preventScroll: true }); // bàn phím / trình đọc màn hình
  renderMarkers();
}

const addrCache = new Map(); // "lat,lng" làm tròn ~10 m -> Promise<string|null>
let addrLast = { id: null, key: null, text: null, at: 0, failed: false };
const ADDR_RETRY = 30e3; // tra địa chỉ lỗi (mất mạng…) thì sau 30 giây mới thử lại

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
  setHtml(av, avatarInner(m, id));
  av.classList.toggle("live", status === "on" && !isMe);
  $("#detailName").textContent = isMe ? `${m.name} (bạn)` : m.name;

  const st = $("#detailStatus");
  st.classList.toggle("off", !pl && !moving);
  st.textContent = pl ? placeLabel(pl)
    : moving || (m.sharing === false ? "Đã tắt chia sẻ vị trí" : !hasPos ? "Chưa có vị trí" : status === "on" ? LIVE_TEXT : "Không ở địa điểm quen");

  renderDetailMood(id, m, isMe);

  const facts = [];
  const fact = (icon, html, extra = "") => facts.push(`<li><span class="fi" aria-hidden="true">${icon}</span><span class="fv ${extra}">${html}</span></li>`);
  let addrKey = null;
  if (hasPos) {
    addrKey = `${m.lat.toFixed(4)},${m.lng.toFixed(4)}`;
    const known = addrLast.id === id ? addrLast.text || (addrLast.failed ? "Không rõ địa chỉ" : null) : null;
    fact("📍", escapeHtml(known || "Đang tìm địa chỉ…"), known ? "addr" : "addr loading");
    const age = now() - (m.updatedAt || 0);
    fact("🕒", escapeHtml(isMe && gpsOn() && fixUsable() ? "Đang chia sẻ từ máy này"
      : status === "on" ? LIVE_TEXT : `Cập nhật ${relTime(age)}${m.updatedAt ? ` (${clockTime(m.updatedAt)})` : ""}`));
    const here = myLocation();
    if (!isMe && here) fact("📏", escapeHtml(`Cách bạn ${formatDistance(distanceMeters(here, m))}`));
    if (m.acc) fact("🎯", escapeHtml(`Sai số khoảng ±${formatDistance(m.acc)}`));
  }
  const batt = isMe ? null : batteryOf(m);
  if (batt) {
    const { level, charging, low } = batt;
    fact(charging ? "⚡" : `<span class="${low ? "low" : ""}">${batteryIcon(level)}</span>`, `<span class="${low ? "low" : ""}">${escapeHtml(charging
      ? `Đang sạc · ${level}% (báo lúc ${clockTime(batt.at)})`
      : `Pin ${level}%${low ? " — sắp hết" : batt.old ? ` (báo lúc ${clockTime(batt.at)})` : ""}`)}</span>`);
  }
  setHtml($("#detailFacts"), facts.join(""));
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
  if (addrLast.id === id && addrLast.key === key && !(addrLast.failed && Date.now() - addrLast.at > ADDR_RETRY)) return;
  if (addrLast.id === id && Date.now() - addrLast.at < 15e3 && !addrCache.has(key)) return;
  addrLast = { id, key, text: addrLast.id === id ? addrLast.text : null, at: Date.now(), failed: false };
  if (!addrCache.has(key)) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=vi&lat=${m.lat.toFixed(5)}&lon=${m.lng.toFixed(5)}`;
    addrCache.set(key, fetch(url).then((r) => (r.ok ? r.json() : null)).then(shortAddress).catch(() => null));
  }
  addrCache.get(key).then((text) => {
    if (!text) addrCache.delete(key); // đừng nhớ kết quả lỗi, lần sau còn tra lại được
    if (addrLast.id === id && addrLast.key === key) { addrLast.text = text; addrLast.failed = !text; }
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
  if (!membersLoaded || !placesLoaded || !gpsOn() || !fixUsable() || myPos.acc > PLACE_MAX_ACC || kicked) return;
  const stored = members[state.memberId];
  if (!stored) return;
  const was = stored.place && places[stored.place] ? stored.place : null;
  const next = placeAt(myPos, was);
  if (next === was && (stored.place || null) === was) return;

  const cleared = homeClears(stored, next);
  meWrite({ place: next, placeSince: next ? fb.serverTimestamp() : null, ...cleared }).catch(onPosDenied);
  if (was && next !== was) logEvent("leave", was);
  if (next && next !== was) logEvent("arrive", next);
  // Cập nhật ngay trên máy để lần định vị kế tiếp không ghi trùng trước khi server phản hồi.
  members[state.memberId] = { ...stored, place: next, placeSince: next ? now() : null, ...cleared };
}

function logEvent(type, placeId, who = state.memberId, at = null) {
  const pl = places[placeId];
  if (!pl || now() - (pl.at || 0) < PLACE_QUIET) return; // vừa tạo địa điểm: người đang ở đó không tính là "vừa đến"
  // Ghi giúp người khác: khoá cố định theo (giờ cập nhật, loại, người) → nhiều máy cùng ghi vẫn chỉ ra một sự kiện.
  const key = at ? eventKey(who, at, type) : fb.push(famRef("events")).key; // push() chỉ sinh khoá, chưa ghi gì
  famWrite(`events/${key}`, { m: who, type, place: placeId, at: at ?? fb.serverTimestamp() }).catch(at ? () => {} : onWriteError);
}
// 9 + 1 + 10 = 20 ký tự [0-9a-z], đúng mẫu khoá sự kiện trong rules.
const eventKey = (who, at, type) => `${at.toString(36).padStart(9, "0")}${type[0]}${who.slice(0, 10)}`;

// Vị trí do Phím tắt iPhone gửi (không mở app, không có sai số GPS): máy họ không tự ghi đến/rời được,
// nên máy nào đang mở app sẽ ghi giúp — cùng cách tính như trackMyPlace. Giờ đến/rời = lúc phím tắt gửi.
// Mọi máy tính ra cùng kết quả và ghi cùng giá trị/khoá nên ghi trùng không sao.
const fromShortcut = (m) => m.sharing !== false && !m.online && typeof m.lat === "number"
  && typeof m.lng === "number" && m.acc == null && typeof m.updatedAt === "number";
function trackOthersPlaces() {
  if (!membersLoaded || !placesLoaded || kicked) return;
  for (const [id, m] of Object.entries(members)) {
    if (id === state.memberId || !m?.name || !fromShortcut(m)) continue;
    const was = m.place && places[m.place] ? m.place : null;
    const next = placeAt(m, was);
    if (next === was && (m.place || null) === was) continue;
    const at = m.updatedAt; // giờ server lúc phím tắt gửi: máy nào tính cũng ra cùng khoá sự kiện
    famWrite(`members/${id}`, { place: next, placeSince: next ? at : null, ...homeClears(m, next) }).catch(() => {});
    if (was && next !== was) logEvent("leave", was, id, at);
    if (next && next !== was) logEvent("arrive", next, id, at);
    members[id] = { ...m, place: next, placeSince: next ? at : null, ...homeClears(m, next) };
  }
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
  disarmDelete();
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
  setSheetMode(sheetMode, false); // màn hình có thể đã đổi cỡ trong lúc bảng bị ẩn
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
    if (emoji === placing.emoji) grid.scrollLeft = b.offsetLeft - grid.offsetLeft - (grid.clientWidth - b.offsetWidth) / 2; // biểu tượng đang chọn ở cuối hàng cũng thấy
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
  const size = map.getSize(), panel = $("#placePanel").getBoundingClientRect();
  if (size.x - panel.right > 160) return L.point((panel.right + size.x) / 2, size.y / 2); // tấm bảng nằm bên trái (máy tính, xoay ngang)
  return L.point(size.x / 2, Math.max(120, (size.y - panel.height) / 2 + 10));
}

function centerOnTarget(latlng, zoom, animate = !reducedMotion()) {
  const size = map.getSize(), pt = targetPoint();
  const offset = L.point(size.x / 2 - pt.x, size.y / 2 - pt.y);
  const ll = L.latLng(latlng.lat, latlng.lng);
  map._stop(); // dừng hiệu ứng đang chạy trước, để "moveend" của nó không tắt nhầm cờ auto bên dưới
  if (placing) Object.assign(placing, { center: ll, auto: true, frame: targetFrame() });
  map.setView(map.unproject(map.project(ll, zoom).add(offset), zoom), zoom, { animate });
}

// Bàn phím bật/tắt, xoay máy, tấm bảng đổi chiều cao → điểm ghim chỉ vào dời trên màn hình.
// Dời bản đồ theo để ghim vẫn chỉ đúng chỗ đã chọn (không thì lưu lệch hàng chục mét).
const targetFrame = () => { const s = map.getSize(), pt = targetPoint(); return `${s.x},${s.y},${Math.round(pt.x)},${Math.round(pt.y)}`; };
function keepTarget() {
  if (!placing) return;
  if (placing.center && placing.frame !== targetFrame()) centerOnTarget(placing.center, map.getZoom(), false);
  updatePreview();
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
  const c = placing.center || map.containerPointToLatLng(targetPoint());
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

let disarmTimer;
function disarmDelete() {
  clearTimeout(disarmTimer);
  $("#placeDelete").textContent = "Xoá địa điểm này";
  delete $("#placeDelete").dataset.armed;
}
function deletePlace() {
  const btn = $("#placeDelete");
  if (!btn.dataset.armed) { // chạm 2 lần để xoá — không cần hộp thoại xác nhận
    btn.dataset.armed = "1";
    btn.textContent = "Chạm lần nữa để xoá";
    buzz(20);
    sound.warn();
    clearTimeout(disarmTimer);
    disarmTimer = setTimeout(disarmDelete, 5000); // đổi ý: lần chạm nhầm sau đó không xoá mất
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
  if (!connected) { dot.classList.add("warn"); text.textContent = navigator.onLine === false ? "Mất mạng" : "Đang kết nối…"; return; }
  if (!state.sharing) { text.textContent = "Không chia sẻ vị trí"; return; }
  if (!gpsOn()) { text.textContent = "Máy này chỉ xem"; return; }
  if (geoError) { dot.classList.add("warn"); text.textContent = "Chưa lấy được vị trí"; return; }
  if (!fixUsable()) { dot.classList.add("warn"); text.textContent = "Đang tìm vị trí…"; return; }
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

// Xin ngay một lần định vị mới khi quay lại app (web; app native thì plugin tự báo lại ngay).
function refreshFix() {
  if (native.isNative || !("geolocation" in navigator)) return;
  navigator.geolocation.getCurrentPosition((p) => { if (gpsOn() && watchId !== null) onPosition(p); }, () => {}, {
    enableHighAccuracy: true, maximumAge: 10e3, timeout: 30e3,
  });
}

function onPosition(p) {
  geoError = null;
  deniedShown = false;
  fixAt = Date.now();
  fixLost = false;
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
    if (!deniedShown) {
      toast(native.isNative
        ? "Nhà Mình chưa được phép dùng vị trí. Vào ⚙️ Cài đặt → Mở quyền vị trí."
        : "Bạn chưa cho phép vị trí. Hãy bật lại trong cài đặt trình duyệt.", 5000);
    }
    deniedShown = true;
    stopWatching();
  } else {
    if (err.code === 2) fixLost = true; // POSITION_UNAVAILABLE (tắt định vị, mất sóng) — khác với chỉ hết giờ chờ
    if (!fixUsable()) geoError = "Chưa bắt được GPS";
  }
  updateStatus();
  render();
}

function pushPosition(force) {
  // Chờ có dữ liệu nhóm: cần biết vị trí đang lưu để không ghi đè vị trí tốt hơn từ máy khác.
  if (!fixUsable() || !gpsOn() || !state.familyId || !membersLoaded) return;
  const t = Date.now();
  const moved = lastPush.lat === null ? Infinity : distanceMeters(lastPush, myPos);
  if (!force && moved < PUSH_MIN_METERS && t - lastPush.at < PUSH_MAX_SECONDS * 1000) return;

  // Dùng nhiều máy: máy định vị kém (laptop đoán theo IP/wifi, lệch hàng km) không được
  // ghi đè vị trí tốt mà điện thoại vừa gửi lên gần đây.
  const stored = members[state.memberId];
  // (Vị trí từ Phím tắt iPhone không kèm sai số nhưng là GPS điện thoại → coi là tốt.)
  if (myPos.acc > POOR_ACCURACY && typeof stored?.lat === "number" && (stored.acc ?? 0) <= POOR_ACCURACY
      && now() - (stored.updatedAt || 0) < GOOD_FIX_PROTECT) return;

  lastPush = { at: t, lat: myPos.lat, lng: myPos.lng };
  const data = {
    lat: +myPos.lat.toFixed(6), lng: +myPos.lng.toFixed(6), acc: myPos.acc,
    updatedAt: fb.serverTimestamp(),
    online: liveOnline(),
  };
  if (native.isNative) refreshBattery(); // kết quả dùng cho lần gửi sau
  if (battery) { data.battery = battery.level; data.charging = battery.charging; data.chargingAt = fb.serverTimestamp(); }
  const speed = mySpeed();
  data.speed = typeof speed === "number" && speed >= 0 ? Math.min(speed, 400) : null;
  meWrite(data).catch(onPosDenied);
}

// Vừa tắt chia sẻ ở máy khác mà máy này chưa kịp biết → server từ chối vị trí là đúng, đừng báo lỗi.
function onPosDenied(err) {
  if (!isDenied(err)) return onWriteError(err);
  setTimeout(() => { if (state.sharing) onWriteError(err); }, 3000);
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
let wakeAsking = false;
async function requestWakeLock() {
  if (!("wakeLock" in navigator) || wakeLock || wakeAsking) return; // đang giữ rồi: xin thêm thì không nhả hết được
  wakeAsking = true;
  try {
    const lock = await navigator.wakeLock.request("screen");
    wakeLock = lock;
    lock.addEventListener("release", () => { if (wakeLock === lock) wakeLock = null; });
    if (!state.wake || kicked) releaseWakeLock(); // vừa tắt trong lúc chờ
  } catch { /* người dùng/hệ thống từ chối */ }
  wakeAsking = false;
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
 * còn lại là cuộn danh sách như thường. Thẻ chi tiết: chỉ 2 nấc, "half" = vừa đúng nội dung thẻ (không kéo cao thêm),
 * "peek" = còn ảnh + tên. Trên máy tính bảng là cột bên trái → chỉ bấm để thu/mở. */
let sheetMode = "half";
const SHEET_ORDER = ["peek", "half", "full"];

function sheetMetrics() {
  const sheet = $("#sheet"), body = $("#sheetBody");
  const headH = sheet.querySelector(".sheet-head").offsetHeight;
  const pad = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
  // Đo chính nội dung, không dùng body.scrollHeight: bảng đang cao hơn nội dung thì scrollHeight = chiều cao bảng.
  const content = $(selectedId ? "#memberDetail" : "#sheetHome").getBoundingClientRect().height + (parseFloat(getComputedStyle(body).paddingBottom) || 0);
  const natural = Math.ceil(headH + content + pad);
  const topLimit = $(".topbar").getBoundingClientRect().bottom + 10; // chừa thanh trên cùng
  if (selectedId) {
    const half = Math.min(natural, innerHeight - topLimit);
    const person = $(".detail-head").getBoundingClientRect().bottom - $("#memberDetail").getBoundingClientRect().top; // nút quay lại + ảnh + tên
    return { peek: Math.min(half, Math.ceil(headH + person + pad + 14)), half, full: null };
  }
  const peek = headH + pad + 4;
  const half = Math.max(peek, Math.min(natural, innerHeight * 0.48));
  const full = Math.min(natural, innerHeight - topLimit);
  return { peek, half, full: full > half + 40 ? full : null };
}

// from: chiều cao xuất phát, khi nội dung vừa bị thay (mở / đóng thẻ) nên chiều cao hiện tại không còn đúng.
function setSheetMode(mode, animate = true, from = null) {
  const sheet = $("#sheet"), main = $("#main");
  if (placing) { sheetMode = mode; return; } // bảng đang ẩn, không đo được; stopPlacing() đặt lại sau
  if (isDesktop()) {
    sheetMode = mode === "peek" ? "peek" : "half";
    sheet.style.height = "";
    sheet.classList.remove("full");
    sheet.classList.toggle("collapsed", sheetMode === "peek");
    $("#sheetBody").inert = sheetMode === "peek"; // thu gọn lúc màn hình dọc rồi xoay ngang: mở ra phải bấm được
    $("#sheetHandle").setAttribute("aria-expanded", String(sheetMode !== "peek"));
    return;
  }
  const m = sheetMetrics();
  if (mode === "full" && !m.full) mode = "half";
  const target = m[mode];
  from ??= sheet.getBoundingClientRect().height;
  sheetMode = mode;
  sheet.style.setProperty("--sheet-max", `${innerHeight - $(".topbar").getBoundingClientRect().bottom - 10}px`); // trần của thẻ chi tiết
  sheet.classList.toggle("collapsed", mode === "peek");
  sheet.classList.toggle("full", mode === "full");
  $("#sheetHandle").setAttribute("aria-expanded", String(mode !== "peek"));
  $("#sheetBody").inert = mode === "peek" && !selectedId; // thu gọn: không cho tab vào các dòng bị che

  clearTimeout(sheet._settle);
  sheet.classList.add("moving");
  main.classList.add("sheet-moving");
  sheet.style.transition = "none";
  sheet.style.height = `${from}px`;
  void sheet.offsetHeight; // ghi nhận điểm xuất phát trước khi bật transition
  const ms = animate && !reducedMotion() ? 420 : 0;
  sheet.style.transition = ms ? `height ${ms}ms cubic-bezier(${selectedId ? ".2, .8, .2, 1" : ".25, 1.2, .5, 1"})` : "none"; // thẻ chi tiết: không nảy quá đà (lòi khoảng trắng)
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
      // Chưa đủ 8 px để quyết định, nhưng đã thấy vuốt xuống khi danh sách đang ở đầu: giữ lấy cử chỉ ngay.
      // Nhường vài px đầu cho trình duyệt thì iPhone bắt đầu nảy/cuộn danh sách, sau đó không giành lại được nữa
      // (lý do bảng trước đây rất khó vuốt xuống).
      if (Math.abs(dy) < 8) return dy > 0 && Math.abs(x - g.x0) <= dy && (!g.inBody || body.scrollTop <= 0);
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
    if (h > max) h = selectedId ? max : max + (h - max) / 3; // thẻ chi tiết đã hiện hết: không giãn thêm
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
    // Hướng: hất (≥ 200 px/s) thì theo hướng hất; kéo chậm thì chỉ cần kéo được ~30 px là đủ sang nấc kế tiếp
    // (trước đây phải kéo quá nửa đường giữa hai nấc, nên vuốt xuống nhẹ tay hay bị bật về chỗ cũ).
    const moved = h - g0h; // > 0: kéo lên
    const dir = Math.abs(v) > 0.2 ? -Math.sign(v) : Math.abs(moved) > 24 ? Math.sign(moved) : 0;
    const ahead = snaps.filter(([, sh]) => (dir < 0 ? sh < g0h - 4 : sh > g0h + 4));
    let mode;
    if (dir && ahead.length) {
      // Kéo chậm: nấc gần chỗ thả nhất trong các nấc phía trước. Hất: nấc đầu tiên còn ở phía trước chỗ thả.
      const beyond = ahead.filter(([, sh]) => (dir < 0 ? sh <= h + 4 : sh >= h - 4));
      [mode] = nearest(Math.abs(v) > 0.2 && beyond.length ? beyond : ahead, h);
    } else {
      [mode] = nearest(snaps, h);
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

  // Thẻ chi tiết đang thu gọn: chạm vào đâu cũng mở lại
  body.addEventListener("click", (e) => {
    if (suppressClick || isDesktop() || !selectedId || sheetMode !== "peek" || e.target.closest("button, a")) return;
    buzz();
    sound.snap(true);
    setSheetMode("half");
  });

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
  new ResizeObserver(keepTarget).observe($("#placePanel"));

  $("#detailBack").addEventListener("click", () => { buzz(); sound.back(); closeDetail(); if (sheetMode === "peek") setSheetMode("half"); });
  $("#moodDialog").addEventListener("click", (e) => {
    const b = e.target.closest(".mood-opt");
    if (b) pickMood(b.dataset.mood, b);
  });
  addEventListener("resize", () => { if ($("#moodDialog").open) placeMoodPicker(); });
  $("#detailMood").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !selectedId) return;
    if (selectedId === state.memberId) openMoodPicker(centerOf(b)); else sendHeart(selectedId, centerOf(b));
  });
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
      deniedShown = false;
      startWatching();
      return toast(geoError || "Đang tìm vị trí của bạn…");
    }
    focusOn([myLocation() || myPos]);
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
  // App native đã tự gửi khi chạy nền. Web trên Android: mời cài APK (Phím tắt chỉ có trên iPhone).
  const androidWeb = !native.isNative && /Android/i.test(navigator.userAgent);
  $("#openShortcut").hidden = native.isNative || androidWeb;
  $("#androidApk").hidden = !androidWeb;
  $("#openShortcut").addEventListener("click", () => { $("#settingsDialog").close(); openShortcut(); });
  $("#copyShortcutCode").addEventListener("click", copyShortcutCode);
  $("#copyShortcutBody").addEventListener("click", copyShortcutBody);

  $("#saveSettings").addEventListener("click", saveSettings);
  $("#settingsName").addEventListener("keydown", (e) => { if (e.key === "Enter") e.currentTarget.blur(); });
  $("#settingsDialog").addEventListener("close", onSettingsClosed);
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
  $("#rekeyFamily").addEventListener("click", () => {
    if (!membersLoaded || !placesLoaded) return toast("Đang tải dữ liệu nhóm, thử lại sau giây lát nhé."); // để không bỏ sót địa điểm, ảnh
    $("#settingsDialog").close(); $("#confirmRekey").showModal();
  });
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
  qr.hidden = !window.QRCode; // không tải được thư viện QR: ẩn khung trắng trống
  if (window.QRCode) {
    new QRCode(qr, { text: url, width: 200, height: 200, colorDark: "#1c1917", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
  }
  $("#familyCodeDisplay").textContent = formatCode(state.familyId);
  $("#inviteDialog").showModal();
}

/* ---- Phím tắt iPhone: gửi vị trí khi không mở app ----
 * Bản web không chạy nền được trên iPhone. App Phím tắt (có sẵn) thì chạy được theo tự động hoá
 * (mở Zalo, cắm/rút sạc, đến/rời nhà, giờ cố định). Phím tắt gồm 6 tác vụ: Lấy vị trí hiện tại → Lấy mức pin
 * → Lấy mức pin (bộ sạc) → Văn bản (SHORTCUT_BODY, thay LAT/LNG/PIN/SAC bằng biến) → Văn bản (mã kết nối) → Lấy nội dung của URL
 * (tự nhận Văn bản ngay trên làm URL), PATCH, Yêu cầu nội dung = Tệp (khung mẫu).
 * KHÔNG dùng kiểu JSON của Phím tắt: iPhone cài tiếng Việt gửi số thập phân thành chuỗi "16,09"
 * → rules từ chối (Permission denied). Chèn biến vào Văn bản thì số dùng dấu chấm (đã thử trên máy thật).
 * speed = 0 để thẻ chi tiết không báo "đang di chuyển" theo tốc độ cũ còn sót từ lần mở app.
 * "online" do onDisconnect tự đặt false. "acc": null xoá sai số cũ — cũng là dấu hiệu để máy khác ghi đến/rời
 * giúp (trackOthersPlaces). "charging" là chữ ("Đúng"/"Có"…, tuỳ ngôn ngữ) → isCharging(); hết hạn sau 2 giờ.
 * Mã kết nối = URL REST hồ sơ của mình (có ".json"). Hồ sơ phải tồn tại sẵn (rules đòi có "name"),
 * nên rời nhóm / đổi mã nhóm / bị xoá thì phím tắt cũ tự bị từ chối.
 * Địa điểm (Ở Nhà…) được các máy xem tự tính từ toạ độ (memberPlace); đến/rời chỉ ghi khi mở app. */
const SHORTCUT_BODY = '{"lat":LAT,"lng":LNG,"acc":null,"battery":PIN,"charging":"SAC","chargingAt":{".sv":"timestamp"},"speed":0,"updatedAt":{".sv":"timestamp"}}';
const shortcutCode = () => `${firebaseConfig.databaseURL}/families/${state.familyId}/members/${state.memberId}.json`;

function openShortcut() {
  $("#shortcutCode").value = shortcutCode();
  $("#shortcutBody").value = SHORTCUT_BODY;
  $("#shortcutEasy").hidden = !shortcutUrl;
  // Có link chung: phần tự tạo thu gọn ở dưới, dành cho người quản lý nhóm (sửa / chia sẻ lại phím tắt).
  $("#shortcutManual").open = !shortcutUrl;
  $("#shortcutManualNum").hidden = !!shortcutUrl;
  $("#shortcutManualTitle").textContent = shortcutUrl ? "🛠 Tự tạo phím tắt (người quản lý nhóm)" : "Tạo phím tắt “Nhà Mình”";
  if (shortcutUrl) $("#shortcutLink").href = shortcutUrl;
  const mine = members[state.memberId];
  $("#shortcutStatus").textContent = !state.sharing
    ? "⚠️ Bạn đang tắt “Chia sẻ vị trí của tôi” nên phím tắt bị từ chối (Permission denied). Bật lại trong Cài đặt là chạy được."
    : mine?.updatedAt ? `Vị trí của bạn cập nhật lần cuối: ${clockTime(mine.updatedAt)} (${relTime(now() - mine.updatedAt)})` : "";
  $("#shortcutDialog").showModal();
}

async function copyShortcutText(input, text, done) {
  try {
    await navigator.clipboard.writeText(text);
    sound.success();
    toast(done);
  } catch {
    input.select();
    prompt("Sao chép đoạn này:", text);
  }
}
const copyShortcutCode = () => copyShortcutText($("#shortcutCode"), shortcutCode(), "Đã sao chép mã ✓ Giờ mở app Phím tắt và dán.");
const copyShortcutBody = () => copyShortcutText($("#shortcutBody"), SHORTCUT_BODY, "Đã sao chép mẫu ✓ Giờ mở app Phím tắt và dán.");

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
// Công tắc trong Cài đặt chỉ áp dụng khi bấm Lưu. Đóng mà quên Lưu (vd tưởng đã tắt chia sẻ) thì nhắc.
const settingsDirty = () => $("#settingsName").value.trim() !== state.name || draftAvatar?.[0] !== state.emoji || draftPhoto !== undefined
  || $("#shareToggle").checked !== !!state.sharing || $("#gpsToggle").checked !== (state.deviceGps !== false)
  || $("#wakeToggle").checked !== !!state.wake || (native.isNative && $("#bgToggle").checked !== (state.bgGps !== false));
function onSettingsClosed() {
  if (kicked || document.querySelector("dialog[open]") || !settingsDirty()) return;
  toast("Chưa bấm Lưu nên thay đổi trong Cài đặt chưa được áp dụng.", 4500);
}
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
  const ua = navigator.userAgent;
  const os = ua.match(/(iPhone OS|CPU OS|Android) [\d._]+/)?.[0] || navigator.platform;
  const how = native.isNative ? "app" : /Zalo/i.test(ua) ? "Zalo" : /FBAN|FBAV|Messenger/i.test(ua) ? "Messenger"
    : matchMedia("(display-mode: standalone)").matches || navigator.standalone ? "màn hình chính" : "trình duyệt";
  $("#mapDiag").textContent = `${mapDiag()} · ${os} · ${how}${lastJsError ? ` · lỗi: ${lastJsError}` : ""}`;
  $("#settingsDialog").showModal();
}

async function saveSettings() {
  const name = $("#settingsName").value.trim().slice(0, 24);
  if (!name) { $("#settingsName").focus(); sound.error(); return toast("Tên không được để trống."); }
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
  delete state.carry;
  delete state.familyId;
  state.member = false;
  saveState();
  // Không chờ server vô hạn: mất mạng thì hàng đợi sẽ xoá tiếp ở lần mở app sau.
  await Promise.race([processLeaveQueue(), sleep(2500)]);
  location.replace(location.pathname);
}

// Đổi mã nhóm: chuyển mình sang nhóm mới với mã mới, rồi mời lại những người cần.
// Ảnh đại diện và các địa điểm đi theo: cất vào máy (state.carry), tải lại xong thì applyCarry() ghi lên nhóm mới.
// Ai chỉ có mã cũ sẽ không thấy mình nữa (mã cũ bị lộ / muốn loại ai đó ra).
async function rekeyFamily() {
  kicked = true; // rời nhóm cũ có chủ đích, đừng báo "bị xoá"
  stopWatching();
  const photo = members[state.memberId]?.photo ? photoCache.get(state.memberId) : null;
  const keep = { places, photo: photo && validPhoto(photo.data) ? photo : null };
  switchFamily(newFamilyCode());
  state.carry = { f: state.familyId, ...keep };
  saveState();
  try { sessionStorage.setItem("nhaminh.openInvite", "1"); } catch { /* bỏ qua */ }
  await Promise.race([processLeaveQueue(), sleep(2500)]);
  location.replace(location.pathname);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
// Mạng hỏng / chậm lúc mở app: báo ngay trên màn hình chờ + nút thử lại, thay vì ba chấm nhảy mãi.
function splashProblem(msg, failed) {
  $("#splashMsg").textContent = msg;
  $("#splashError").hidden = false;
  $("#splash .dots").hidden = failed;
}

async function boot() {
  setupDialogs();
  $("#splashRetry").addEventListener("click", () => location.reload());
  sound.setSfx(state.sfx);
  sound.setMusic(state.music);
  sound.onMusicChange(renderMusicBtn);
  renderMusicBtn();
  bindTapSound();

  const configured = firebaseConfig?.databaseURL && !/YOUR_/.test(firebaseConfig.databaseURL + firebaseConfig.apiKey);
  if (!configured) { showScreen("setupNeeded"); return; }

  const params = new URLSearchParams(location.search);
  const invited = parseCode(params.get("f") || "");
  if (params.has("f") && (!invited || invited === state.familyId)) clearInviteUrl();

  const slow = setTimeout(() => splashProblem("Mạng hơi chậm, vẫn đang tải…", false), 10e3);
  try {
    await loadFirebase();
    if (!window.L) throw new Error("Không tải được Leaflet");
  } catch (e) {
    console.error(e);
    splashProblem("Không tải được. Kiểm tra kết nối mạng rồi thử lại nhé.", true);
    addEventListener("online", () => location.reload(), { once: true });
    return;
  } finally {
    clearTimeout(slow);
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

  if (params.has("f") && !invited) setTimeout(() => toast("Đường dẫn mời không đúng. Nhờ người nhà gửi lại nhé.", 5000), 300);

  sound.hello(); // trình duyệt chưa cho phát thì đợi tới lần chạm đầu tiên
  if (invited && invited !== state.familyId) {
    pendingInvite = invited;
    startOnboarding();
  } else if (inFamily()) {
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
