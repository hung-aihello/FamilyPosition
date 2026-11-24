# 📱 App Nhà Mình cho Android & iPhone

Vỏ app native (Capacitor 8) cho webapp Nhà Mình. Điểm khác bản web: **vẫn gửi vị trí khi tắt màn hình hoặc dùng app khác**.

## Cách hoạt động

- App mở thẳng trang `https://hung-aihello.github.io/FamilyPosition/` → **sửa web (app.js, style.css…) rồi push là app tự có bản mới**, không phải cài lại. Chỉ build lại app khi sửa thư mục `mobile/`.
- Trang web tự nhận ra mình đang chạy trong app (`native.js`) và dùng các plugin native:
  | Plugin | Dùng để |
  |---|---|
  | `@capacitor-community/background-geolocation` | Định vị liên tục, kể cả khi chạy nền |
  | `CapacitorHttp` (có sẵn) | Gửi vị trí lên Firebase REST khi app chạy nền (WebView ở nền bị bóp mạng) |
  | `@capacitor/app` | Biết app đang mở hay chạy nền; nút Back Android đưa app xuống nền thay vì tắt |
  | `@capacitor/device` | Mức pin (iPhone không có trong web) |
  | `@capacitor/share` | Bảng chia sẻ của máy (Zalo, Messenger…) cho lời mời / gửi vị trí |
- Dữ liệu trong app tách biệt với Safari/Chrome → lần đầu mở app phải nhập tên và vào nhóm lại. Chọn đúng tên mình ở bước **“Có phải bạn?”** để giữ nguyên chấm cũ trên bản đồ, không tạo thêm thành viên.

## Tải app

GitHub Actions (`.github/workflows/mobile-app.yml`) tự build mỗi khi push thay đổi trong `mobile/`, hoặc bấm **Actions → App Android & iOS → Run workflow**. Kết quả nằm ở Release **app**:

- Android: <https://github.com/hung-aihello/FamilyPosition/releases/download/app/NhaMinh.apk>
- iPhone (chưa ký): <https://github.com/hung-aihello/FamilyPosition/releases/download/app/NhaMinh-unsigned.ipa>

### Android
1. Mở link `.apk` trên điện thoại → tải về → mở file → cho phép **“Cài ứng dụng không rõ nguồn gốc”** cho Chrome/Zalo khi được hỏi → **Cài đặt**.
2. Mở app → cho phép vị trí (**“Trong khi dùng ứng dụng”** là đủ).
3. Để không bị hệ thống tắt ngầm (nhất là Xiaomi, Oppo, Vivo, Samsung): **Cài đặt → Ứng dụng → Nhà Mình → Pin → Không hạn chế**. Trên Xiaomi bật thêm **Tự khởi chạy**.
4. Khi đang chia sẻ sẽ có thông báo “Nhà Mình đang chia sẻ vị trí” — đó là bắt buộc của Android để chạy nền.

Bản mới: tải lại `.apk` và cài đè, dữ liệu được giữ nguyên.

### iPhone
Apple không cho cài app ngoài App Store nếu chưa được ký bằng tài khoản Apple. Có 2 cách:

**Cách 1 — Miễn phí, dùng máy tính Windows (Sideloadly):**
1. Cài **iTunes** (bản tải từ apple.com, không phải Microsoft Store) và **Sideloadly** (sideloadly.io) trên máy tính.
2. Cắm iPhone bằng cáp → chọn *Tin cậy máy tính này*.
3. Mở Sideloadly → kéo file `NhaMinh-unsigned.ipa` vào → nhập Apple ID (nên dùng Apple ID phụ) → **Start**.
4. Trên iPhone: **Cài đặt → Cài đặt chung → VPN & Quản lý thiết bị** → tin cậy Apple ID vừa dùng. Bật **Chế độ nhà phát triển** nếu iOS yêu cầu (Cài đặt → Quyền riêng tư & Bảo mật).
5. ⚠️ Apple ID miễn phí: app **hết hạn sau 7 ngày**, phải ký lại bằng Sideloadly (cắm cáp, bấm Start lần nữa — dữ liệu giữ nguyên). Tối đa 3 app/máy.

**Cách 2 — Apple Developer (99 USD/năm):** ký 1 năm/lần, hoặc phát hành qua **TestFlight** để người nhà cài bằng link, không cần cáp. Cần thêm bước ký trong workflow (chưa làm).

Sau khi cài: mở app → cho phép vị trí → khi iPhone hỏi lại, chọn **“Luôn cho phép”** (hoặc vào Cài đặt → Nhà Mình → Vị trí → Luôn luôn).

## Giới hạn

- **Vuốt tắt app khỏi đa nhiệm = dừng chia sẻ** (cả Android lẫn iPhone). Cứ để app chạy nền.
- Điện thoại tắt hẳn, hết pin, mất mạng thì người nhà thấy vị trí cuối cùng kèm “x phút trước”.
- Định vị liên tục tốn pin hơn (cỡ như bật bản đồ dẫn đường nhẹ). Không cần thì tắt **⚙️ Cài đặt → Chia sẻ cả khi tắt màn hình**: app chỉ gửi vị trí khi đang mở, như bản web.
- App cần mạng lúc mở (tải trang web). Không có mạng sẽ hiện màn hình “Chưa kết nối được”.

## Phát triển

```bash
cd mobile
npm install
npx cap sync            # sau khi đổi plugin / capacitor.config.json
npx cap open android    # cần Android Studio
npx cap open ios        # cần Mac + Xcode
```

- Đổi icon: sửa `../icon.svg` + `make-icons.mjs` → `node make-icons.mjs` → `npx capacitor-assets generate --iconBackgroundColor "#0f766e" --splashBackgroundColor "#f6f4ef" --splashBackgroundColorDark "#1c1917"` (xoá thư mục `icons/` và `www/manifest.json` nó tạo thêm).
- Thử trang web trong app khi đang sửa: đổi tạm `server.url` trong `capacitor.config.json` sang địa chỉ máy tính trong mạng LAN.

### Khoá ký Android
APK được ký bằng một khoá cố định để bản mới cài đè được bản cũ. Khoá nằm ở `mobile/keys/` (không đưa lên git) và trong GitHub Secrets:

| Secret | Giá trị |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 keys/nhaminh-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | xem `keys/KEYSTORE-INFO.txt` |
| `ANDROID_KEY_ALIAS` | `nhaminh` |
| `ANDROID_KEY_PASSWORD` | như mật khẩu keystore |

**Sao lưu thư mục `keys/`** — mất khoá thì mọi người phải gỡ app cũ rồi cài lại.
