// Cầu nối khi trang chạy bên trong app Nhà Mình (Android/iOS, vỏ Capacitor ở thư mục mobile/).
// App native mở chính trang web này, rồi chèn sẵn window.Capacitor để gọi các plugin native.
// Trên trình duyệt thường isNative = false và không hàm nào ở đây được gọi.
//
// Không dùng bundler nên gọi plugin trực tiếp qua bridge: nativePromise / nativeCallback / addListener.
const cap = window.Capacitor;
export const isNative = !!cap?.isNativePlatform?.();
export const platform = isNative ? cap.getPlatform() : "web"; // "android" | "ios" | "web"

const call = (plugin, method, options = {}) => cap.nativePromise(plugin, method, options);

/* ---- Định vị (plugin @capacitor-community/background-geolocation) ---- */
// background = true: vẫn nhận vị trí khi app chạy nền / tắt màn hình.
//   Android: chạy foreground service kèm thông báo cố định (bắt buộc), tắt app khỏi đa nhiệm thì dừng.
//   iOS: hiện viên xanh trên thanh trạng thái; vuốt tắt app thì dừng.
// onFix nhận object giống GeolocationPosition của trình duyệt để dùng chung code xử lý.
// Trả về hàm dừng theo dõi.
export function watchPosition({ background }, onFix, onError) {
  const options = { requestPermissions: true, stale: false, distanceFilter: 0 };
  if (background) {
    options.backgroundTitle = "Nhà Mình đang chia sẻ vị trí";
    options.backgroundMessage = "Người nhà thấy bạn đang ở đâu. Chạm để mở app.";
  }
  let stopped = false;
  const id = cap.nativeCallback("BackgroundGeolocation", "addWatcher", options, (loc, err) => {
    if (stopped) return;
    if (err) {
      const denied = err.code === "NOT_AUTHORIZED";
      onError({ code: denied ? 1 : 2, PERMISSION_DENIED: 1, message: err.message || String(err) });
      return;
    }
    if (!loc || typeof loc.latitude !== "number") return;
    onFix({
      coords: {
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy ?? 0,
        speed: typeof loc.speed === "number" && loc.speed >= 0 ? loc.speed : null,
      },
      timestamp: loc.time || Date.now(),
    });
  });
  return () => {
    if (stopped) return;
    stopped = true;
    call("BackgroundGeolocation", "removeWatcher", { id }).catch(() => {});
  };
}

// Mở trang cài đặt của app (để cấp lại quyền vị trí / chọn "Luôn cho phép").
export const openAppSettings = () => call("BackgroundGeolocation", "openSettings").catch(() => {});

/* ---- Mạng ---- */
// Ghi bằng HTTP native: không bị WebView bóp băng thông khi app chạy nền
// (Android hạn chế request từ WebView sau ~5 phút ở nền).
// Firebase REST nhận PATCH qua POST + X-HTTP-Method-Override (HttpURLConnection trên Android không có PATCH).
export async function httpPatch(url, data, headers = {}) {
  const res = await call("CapacitorHttp", "request", {
    url,
    method: "POST",
    headers: { "Content-Type": "application/json", "X-HTTP-Method-Override": "PATCH", ...headers },
    data,
    connectTimeout: 20e3,
    readTimeout: 20e3,
  });
  if (res.status >= 400) {
    const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.data;
}

/* ---- Thiết bị ---- */
// Pin: iOS WebView không có navigator.getBattery nên hỏi thẳng hệ điều hành.
export async function batteryInfo() {
  const b = await call("Device", "getBatteryInfo");
  if (typeof b?.batteryLevel !== "number" || b.batteryLevel < 0) return null;
  return { level: Math.round(b.batteryLevel * 100), charging: !!b.isCharging };
}

/* ---- Vòng đời app (plugin @capacitor/app) ---- */
// isActive = false khi người dùng về màn hình chính / tắt màn hình.
export const onAppStateChange = (fn) => cap.addListener("App", "appStateChange", (s) => fn(!!s?.isActive));
// Nút Back của Android. Đăng ký rồi thì hệ điều hành không tự đóng app nữa.
export const onBackButton = (fn) => cap.addListener("App", "backButton", () => fn());
// Đưa app xuống nền thay vì đóng hẳn — đóng hẳn (finish) thì mất luôn chia sẻ vị trí khi chạy nền.
export const minimizeApp = () => call("App", "minimizeApp").catch(() => {});

/* ---- Chia sẻ (plugin @capacitor/share) ---- */
// WebView Android không có navigator.share → dùng bảng chia sẻ của hệ điều hành (Zalo, Messenger…).
// Ghi đè navigator.share để code hiện có dùng được luôn; huỷ chia sẻ → AbortError như trình duyệt.
if (isNative) {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: async ({ title, text, url } = {}) => {
      try {
        await call("Share", "share", { title, text, url, dialogTitle: title });
      } catch (e) {
        if (/cancel/i.test(String(e?.message || e))) throw new DOMException("Đã huỷ", "AbortError");
        throw e;
      }
    },
  });
}
