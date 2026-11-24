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

**Cách 2 — TestFlight (cần Apple Developer, 99 USD/năm):** người nhà cài app **TestFlight** từ App Store rồi bấm link mời — không cáp, không máy tính, tự cập nhật. Mỗi bản build dùng được 90 ngày; workflow tự build lại ngày 1 hằng tháng. Cài đặt một lần theo mục [TestFlight](#testflight) bên dưới.

Sau khi cài: mở app → cho phép vị trí → khi iPhone hỏi lại, chọn **“Luôn cho phép”** (hoặc vào Cài đặt → Nhà Mình → Vị trí → Luôn luôn).

## TestFlight

Workflow có job `testflight`: archive → ký tự động → tải lên App Store Connect. Chưa có đủ 4 secret dưới đây thì job tự bỏ qua (không báo lỗi). Những bước sau **chỉ chủ tài khoản Apple làm được**, làm một lần:

1. **Đăng ký Apple Developer Program** tại <https://developer.apple.com/programs/enroll/> (cá nhân, 99 USD/năm, Apple ID phải bật xác thực 2 lớp). Apple duyệt từ vài giờ đến 1–2 ngày.
2. **Team ID:** <https://developer.apple.com/account> → *Membership details* → *Team ID* (10 ký tự).
3. **Đăng ký Bundle ID:** <https://developer.apple.com/account/resources/identifiers/list> → **+** → *App IDs* → *App* → Description `Nha Minh`, Bundle ID *Explicit* = `io.github.hungaihello.nhaminh` → Continue → Register. (Không cần bật capability nào.)
4. **Tạo app trên App Store Connect:** <https://appstoreconnect.apple.com/apps> → **+** → *New App* → Platform **iOS**, Name `Nhà Mình` (nếu trùng tên thì thêm chữ, vd `Nhà Mình – Vị trí gia đình`), Primary language **Vietnamese**, Bundle ID chọn `io.github.hungaihello.nhaminh`, SKU `nhaminh`, User Access *Full Access* → Create.
5. **Tạo API key:** App Store Connect → *Users and Access* → *Integrations* → *App Store Connect API* → *Team Keys* → **+** → tên `GitHub Actions`, Access **Admin** (cần quyền Admin để Xcode tự tạo chứng chỉ ký) → Generate. Ghi lại **Issuer ID** (đầu trang) và **Key ID**, bấm **Download** file `AuthKey_XXXX.p8` — **chỉ tải được một lần**, cất cẩn thận.
6. **Lưu vào GitHub Secrets** — gõ trong Claude Code (dấu `!` để tự chạy trên máy bạn, khoá không đi qua chat):
   ```
   ! gh secret set APPLE_TEAM_ID -R hung-aihello/FamilyPosition --body "TEAMID"
   ! gh secret set ASC_ISSUER_ID -R hung-aihello/FamilyPosition --body "ISSUER-ID"
   ! gh secret set ASC_KEY_ID -R hung-aihello/FamilyPosition --body "KEYID"
   ! gh secret set ASC_KEY_P8 -R hung-aihello/FamilyPosition < "C:\Users\...\Downloads\AuthKey_KEYID.p8"
   ```
7. **Chạy build:** GitHub → *Actions* → *App Android & iOS* → *Run workflow* (hoặc `gh workflow run mobile-app.yml`). Job `testflight` xanh → 5–30 phút sau bản build hiện trong App Store Connect → *TestFlight*.

### Mời người nhà
- **Nhóm nội bộ (không cần Apple duyệt, tối đa 100 người):** mỗi người phải là thành viên App Store Connect của bạn: *Users and Access* → **+** → nhập Apple ID email, vai trò *Customer Support* → họ nhận email, chấp nhận. Rồi *TestFlight* → *Internal Testing* → **+** tạo nhóm `Gia đình` → thêm họ (bật *Automatic Distribution* để bản mới tự đến).
- **Link công khai (không cần thêm vào tài khoản):** *TestFlight* → *External Testing* → **+** nhóm `Gia đình` → thêm build → điền *Test Information*: mô tả ngắn, email nhận góp ý, Privacy Policy URL `https://hung-aihello.github.io/FamilyPosition/privacy.html` → *Submit for Review*. Apple duyệt bản đầu (Beta App Review, thường < 1 ngày; các build sau cùng phiên bản 1.0 thường được duyệt tự động) → bật **Public Link** → gửi link qua Zalo.
  - Khi điền thông tin duyệt, ghi rõ: app cần vị trí “Luôn cho phép” để thành viên gia đình thấy nhau khi tắt màn hình; người duyệt có thể tạo nhóm mới ngay trong app (không cần tài khoản).
  - Apple có thể từ chối ở bước duyệt (vd cho rằng app chỉ là trang web bọc lại). Khi đó dùng nhóm nội bộ ở trên — không qua duyệt.
- Người nhà: cài **TestFlight** từ App Store → mở email mời / link công khai → *Cài đặt*. Bản mới tự cập nhật trong TestFlight.

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
