# 🏡 Nhà Mình

Webapp xem vị trí người thân trong gia đình theo thời gian thực. Chạy mượt trên điện thoại, cài được như app (PWA), **miễn phí hoàn toàn**, **không cần đăng nhập**.

- Frontend tĩnh: GitHub Pages
- Dữ liệu realtime: Firebase Realtime Database (gói Spark miễn phí)
- Bản đồ: Leaflet + OpenStreetMap (không cần API key)

## Cách hoạt động

1. Người đầu tiên mở app → nhập tên, chọn hình → **Tạo nhóm gia đình** → app sinh ra một mã ngẫu nhiên 10 ký tự (vd `abcde-fghjk`).
2. Bấm **Mời người thân** → gửi đường dẫn qua Zalo/Messenger hoặc cho quét mã QR.
3. Người thân mở link → nhập tên → **Vào nhóm** → cho phép vị trí. Xong.

Không có tài khoản, không mật khẩu. **Mã nhóm chính là chìa khoá**: ai có mã thì xem được vị trí của nhóm, nên chỉ gửi cho người trong nhà. Có ~8×10¹⁴ tổ hợp nên không thể đoán mò, và Security Rules không cho liệt kê danh sách các nhóm.

## Cài đặt (khoảng 10 phút)

### 1. Tạo Firebase project
1. Vào <https://console.firebase.google.com> → **Add project** (có thể tắt Google Analytics).
2. Menu trái → **Build → Realtime Database → Create Database** → chọn location **Singapore (asia-southeast1)** → chọn *Start in locked mode*.
3. Tab **Rules** → xoá hết, dán nội dung file [`database.rules.json`](database.rules.json) → **Publish**.
4. ⚙️ **Project settings → General → Your apps** → bấm biểu tượng **Web `</>`** → đặt tên → **Register app** → copy đoạn `firebaseConfig`.

### 2. Dán cấu hình
Mở [`config.js`](config.js), thay các giá trị `YOUR_...` bằng cấu hình vừa copy. Nhớ có dòng `databaseURL`.

> Các giá trị này không phải bí mật — Firebase thiết kế để chúng nằm công khai trong code frontend. Dữ liệu được bảo vệ bởi Security Rules.

### 3. Đưa lên GitHub Pages
```bash
git add .
git commit -m "Nhà Mình"
git branch -M main
git remote add origin https://github.com/<tên-bạn>/<tên-repo>.git
git push -u origin main
```
Trên GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`** → Save. Sau 1–2 phút app chạy ở `https://<tên-bạn>.github.io/<tên-repo>/`.

### 4. Cài lên điện thoại
- **Android (Chrome):** mở link → menu ⋮ → **Thêm vào màn hình chính**.
- **iPhone (Safari):** mở link → nút Chia sẻ → **Thêm vào MH chính**.

### 5. (Khuyên dùng) Bật App Check chống bot
App Check bắt mọi request tới database phải đến từ chính trang web này, nên script dùng API key bị lộ sẽ bị chặn. Dùng **reCAPTCHA Enterprise** dạng score-based: chạy ngầm, người dùng không phải bấm gì. Miễn phí 10.000 lượt kiểm tra/tháng — dư cho một gia đình. (reCAPTCHA v3 “classic” đã bị Firebase ngừng nhận đăng ký mới.)

1. Google Cloud Console (project `nha-minh-7ef58`) → **Security → reCAPTCHA** → bật API nếu được hỏi → **Create key**: loại **Website**, domain `hung-aihello.github.io`, **không** bật checkbox challenge → copy **Key ID**.
2. Firebase Console → **App Check → Apps** → mở web app → **reCAPTCHA Enterprise** → dán Key ID → đặt **Token TTL = 1 ngày** (giảm số lượt kiểm tra) → Save.
3. Dán Key ID vào `appCheckSiteKey` trong `config.js` → push.
4. Đợi 1–2 ngày, xem **App Check → APIs → Realtime Database**: khi gần như 100% request là *Verified* thì bấm **Enforce**.

> ⚠️ Chỉ Enforce **Realtime Database**. Đừng Enforce Firestore/Storage nếu app khác dùng chung project mà chưa tích hợp App Check — app đó sẽ bị chặn.

Chạy trên `localhost`: App Check mặc định bị bỏ qua. Sau khi đã Enforce mà cần chạy local: mở console gõ `localStorage.appCheckDebug = 1` → tải lại → console in ra *App Check debug token* → thêm vào **App Check → Apps → ⋮ → Manage debug tokens**.

## Xoá một thành viên
Xoá bản ghi `families/{mã-nhóm}/members/{id}` trong Firebase Console (tab **Data**) hoặc bằng CLI:
```bash
firebase database:remove /families/<mã-nhóm>/members/<id> --project nha-minh-7ef58
```
Máy của người đó sẽ tự thoát về màn hình chào với thông báo “Bạn đã được xoá khỏi nhóm”. Họ có thể vào lại bằng mã mời.

Nếu bản ghi cứ bị tạo lại (máy đó đang chạy bản app cũ, hoặc không biết máy nào), **cấm hẳn ID đó** — Security Rules sẽ từ chối mọi lần ghi của nó:
```bash
firebase database:set /families/<mã-nhóm>/banned/<id> --data true --project nha-minh-7ef58
firebase database:remove /families/<mã-nhóm>/members/<id> --project nha-minh-7ef58
```
Chỉ admin (Console/CLI) mới ghi được vào `banned`; người dùng app không tự gỡ được.
> Trên Git Bash (Windows) thêm `MSYS_NO_PATHCONV=1` trước lệnh để đường dẫn `/families/...` không bị đổi.

## Chạy thử trên máy
Định vị chỉ hoạt động trên `https://` hoặc `localhost`:
```bash
npx serve .
# rồi mở http://localhost:3000
```

## Đổi mã nhóm
**⚙️ Cài đặt → 🔄 Đổi mã nhóm**: bạn chuyển sang nhóm mới với mã mới, app tự mở hộp mời để gửi lại cho những người muốn giữ. Ai chỉ có mã cũ sẽ không thấy bạn nữa. Dùng khi mã bị lộ hoặc muốn loại ai đó ra — đây là cách **thu hồi quyền truy cập thật sự** (xem giới hạn bên dưới).

## Giới hạn cần biết

- **Không đăng nhập = ai có mã nhóm là người trong nhóm.** Người có mã có thể xem vị trí cả nhóm, và về kỹ thuật có thể xoá bản ghi của người khác. Lệnh cấm theo ID (`banned`) chặn được máy cũ cứ tự tạo lại bản ghi, nhưng người cố tình có thể lách bằng cách xoá dữ liệu trình duyệt. Muốn loại ai đó ra hẳn: **Đổi mã nhóm** rồi mời lại những người còn lại. (Sửa tận gốc cần Firebase Auth — không dùng được vì project này đã tắt sign-up để bảo vệ app khác dùng chung.)

- **Chỉ cập nhật vị trí khi app đang mở trên màn hình.** Đây là giới hạn của mọi webapp trên iOS/Android — trình duyệt không cho lấy vị trí khi chạy nền. App hiển thị “x phút trước” để mọi người biết vị trí đã cũ bao lâu. Bật **Giữ màn hình sáng** trong Cài đặt nếu cần theo dõi liên tục khi đang đi đường.
- Muốn theo dõi cả khi tắt màn hình thì cần bọc thành app native (ví dụ Capacitor + plugin background geolocation).
- Hạn mức Firebase miễn phí: 100 kết nối đồng thời, 1 GB lưu trữ, 10 GB tải xuống/tháng — dư sức cho vài gia đình.
- Tile bản đồ dùng máy chủ OpenStreetMap theo [chính sách sử dụng](https://operations.osmfoundation.org/policies/tiles/) — phù hợp cho dùng cá nhân/gia đình.

## Cấu trúc

| File | Nội dung |
|---|---|
| `index.html` | Giao diện: onboarding, bản đồ, danh sách, hộp thoại |
| `style.css` | Giao diện mobile-first, tự đổi sáng/tối theo máy |
| `app.js` | Logic: định vị, đồng bộ Firebase, vẽ bản đồ |
| `config.js` | Cấu hình Firebase (bạn tự điền) |
| `database.rules.json` | Security Rules cho Realtime Database |
| `sw.js`, `manifest.webmanifest`, `icon*` | PWA: cài như app, chạy khi mạng yếu |

Dữ liệu trên Firebase:
```
families/{mã-nhóm}/members/{id-thiết-bị} = {
  name, emoji, color, sharing, online,
  lat, lng, acc, battery, charging, updatedAt, joinedAt
}
```
