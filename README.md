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

## Chạy thử trên máy
Định vị chỉ hoạt động trên `https://` hoặc `localhost`:
```bash
npx serve .
# rồi mở http://localhost:3000
```

## Giới hạn cần biết

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
