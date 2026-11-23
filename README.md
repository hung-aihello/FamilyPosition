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

## Một người dùng nhiều máy
Mở link mời trên máy thứ hai → sau khi nhập tên, app hỏi **“Bạn đã có trong nhóm chưa?”** và đưa người trùng tên lên đầu (“Có phải bạn?”). Chọn tên mình → máy mới **dùng chung danh tính** với máy cũ: cùng một chấm trên bản đồ, không tạo thêm thành viên.

- **Chia sẻ vị trí của tôi** (Cài đặt) áp dụng cho **cả người** — tắt ở máy nào cũng là tắt ở mọi máy.
- **Lấy vị trí từ máy này** chỉ áp dụng cho máy đang dùng — tắt trên laptop/máy tính bảng để chỉ xem.
- Máy định vị kém (sai số > 1 km, thường là laptop) không ghi đè vị trí tốt mà điện thoại gửi trong 10 phút gần đây.
- Đổi tên/hình ở một máy thì các máy khác tự cập nhật. Rời nhóm ở một máy thì mọi máy của người đó cùng thoát.
- Lỡ tạo tài khoản rác trên máy mới: trên máy đó **Rời nhóm** → mở lại link mời → chọn đúng tên mình.

## Địa điểm quen thuộc
Bấm **📍 Địa điểm** (góc phải danh sách) → **Thêm địa điểm** → kéo bản đồ cho ghim vào đúng chỗ → chọn biểu tượng, tên, phạm vi (100 / 200 / 400 m) → **Lưu**. Lần đầu app gợi ý sẵn “🏠 Đánh dấu Nhà mình”. Trong thẻ chi tiết của một người còn có nút **⭐ Lưu chỗ này thành địa điểm**.

- Danh sách hiện **“🏠 Ở Nhà từ 17:40”** thay vì khoảng cách.
- Mục **Hôm nay** ghi lại ai đã về/đến/rời địa điểm nào, lúc mấy giờ (giữ 3 ngày rồi tự dọn).
- Địa điểm dùng chung cho cả nhóm: ai cũng thêm/sửa/xoá được (chạm vào nhãn địa điểm trên bản đồ để sửa).
- Chỉ ghi nhận đến/rời khi **máy của người đó đang mở app** (cùng giới hạn chạy nền như vị trí). Mở app sau khi đã về nhà thì giờ “đã về” là lúc mở app.
- Vừa tạo địa điểm thì những người đang ở sẵn đó không bị tính là “vừa đến”.

## Thẻ chi tiết
Chạm vào một người (trong danh sách hoặc trên bản đồ) để xem: đang ở đâu, **địa chỉ gần đúng**, cập nhật lúc nào, cách bạn bao xa, sai số GPS, pin, **🛵 đang di chuyển · 30 km/h**. Có nút **🧭 Chỉ đường** (Google Maps) và **📤 Gửi vị trí** (Zalo/Messenger…).

> Địa chỉ được tra từ OpenStreetMap (Nominatim) **chỉ khi mở thẻ chi tiết**, với toạ độ của người đang xem, có bộ nhớ đệm và giới hạn 1 lần / 15 giây.

## Ảnh đại diện
**⚙️ Cài đặt → 📷 Chọn ảnh** → kéo/chụm 2 ngón để căn khuôn mặt vào vòng tròn → **Dùng ảnh này** → **Lưu**. Muốn quay lại hình emoji: **Dùng hình emoji** → **Lưu**.

- Ảnh được cắt vuông và nén ngay trên điện thoại: **256×256 px, WebP** (máy cũ không hỗ trợ thì JPEG), thường **~15–25 KB** dù ảnh gốc vài MB.
- Lưu dạng base64 ở nhánh riêng `photos/{id}`, **không** nằm trong hồ sơ thành viên. Hồ sơ chỉ giữ số phiên bản `photo`, nên các lần cập nhật vị trí không phải gửi kèm ảnh.
- Mỗi máy chỉ tải ảnh **một lần** rồi nhớ trong máy; chỉ tải lại khi người đó đổi ảnh. Rời nhóm thì ảnh bị xoá theo.
- Rules chỉ nhận `data:image/webp|jpeg|png;base64,…` tối đa 60.000 ký tự (chặn SVG/chữ/ảnh quá lớn).
- Không dùng Firebase Storage vì cần đăng nhập, và rules Storage đang dùng chung với app khác.

## Đổi mã nhóm
**⚙️ Cài đặt → 🔄 Đổi mã nhóm**: bạn chuyển sang nhóm mới với mã mới, app tự mở hộp mời để gửi lại cho những người muốn giữ. Ai chỉ có mã cũ sẽ không thấy bạn nữa. Dùng khi mã bị lộ hoặc muốn loại ai đó ra — đây là cách **thu hồi quyền truy cập thật sự** (xem giới hạn bên dưới).

## Giới hạn cần biết

- **Không đăng nhập = ai có mã nhóm là người trong nhóm.** Người có mã có thể xem vị trí cả nhóm, và về kỹ thuật có thể xoá bản ghi của người khác. Lệnh cấm theo ID (`banned`) chặn được máy cũ cứ tự tạo lại bản ghi, nhưng người cố tình có thể lách bằng cách xoá dữ liệu trình duyệt. Muốn loại ai đó ra hẳn: **Đổi mã nhóm** rồi mời lại những người còn lại. (Sửa tận gốc cần Firebase Auth — không dùng được vì project này đã tắt sign-up để bảo vệ app khác dùng chung.)

- **Chỉ cập nhật vị trí khi app đang mở trên màn hình.** Đây là giới hạn của mọi webapp trên iOS/Android — trình duyệt không cho lấy vị trí khi chạy nền. App hiển thị “x phút trước” để mọi người biết vị trí đã cũ bao lâu. Bật **Giữ màn hình sáng** trong Cài đặt nếu cần theo dõi liên tục khi đang đi đường.
- Muốn theo dõi cả khi tắt màn hình thì cần bọc thành app native (ví dụ Capacitor + plugin background geolocation).
- Hạn mức Firebase miễn phí: 100 kết nối đồng thời, 1 GB lưu trữ, 10 GB tải xuống/tháng — dư sức cho vài gia đình.
- Tile bản đồ dùng máy chủ OpenStreetMap theo [chính sách sử dụng](https://operations.osmfoundation.org/policies/tiles/) — phù hợp cho dùng cá nhân/gia đình.

## Lịch sử phiên bản
Phiên bản đang chạy xem ở **⚙️ Cài đặt** (dòng cuối). Bấm **Tải lại để cập nhật** để lấy bản mới nhất — hữu ích khi cài như app trên điện thoại (không có nút tải lại).

Khi phát hành: tăng `APP_VERSION` + `APP_RELEASED` ở đầu `app.js` và thêm một dòng vào bảng dưới.

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.9.2 | 23/11/2026 | Bảng danh sách trên bản đồ kéo mượt như app: đi theo ngón tay, 3 nấc (thu gọn / nửa / toàn màn hình), hất nhanh để chuyển nấc, lực cản dây thun, nhường cuộn danh sách; nút nổi đi theo và tự ẩn khi bảng full; dòng ghi công OSM không còn đè lên danh sách |
| 1.9.1 | 23/11/2026 | Vuốt xuống để đóng hộp thoại (trên điện thoại): hộp đi theo ngón tay, kéo đủ xa hoặc hất nhanh thì đóng, không thì bật về; không ảnh hưởng cuộn nội dung và khung căn ảnh |
| 1.9.0 | 23/11/2026 | Giao diện vui hơn: màn hình chờ, emoji bay ở màn chào, lời chào theo giờ, danh sách bật lên lần lượt, ghim rơi xuống + sóng khi đang mở app, vòng cầu vồng ở thẻ chi tiết, hộp thoại trượt lên kiểu bảng, thông báo trực tiếp "Bố đã về đến Nhà" + pháo hoa emoji, pháo hoa khi lưu địa điểm/ảnh/vào nhóm. Sửa: màn hình trắng lúc tải, ghim bị nút nổi che, viền focus thô, dòng thông tin bị cắt |
| 1.8.1 | 23/11/2026 | Sửa ảnh đại diện trên ghim bản đồ bị phóng to, chỉ thấy một góc (CSS của Leaflet ghi đè kích thước ảnh) |
| 1.8.0 | 23/11/2026 | Ảnh đại diện: chọn ảnh, căn chỉnh (kéo/chụm/thanh trượt), nén WebP 256 px, lưu riêng + nhớ trong máy; ảnh hiện ở danh sách, ghim, thẻ chi tiết, dòng thời gian, bước nhận lại danh tính |
| 1.7.1 | 23/11/2026 | Sửa chữ/ghim đè nhau trên bản đồ: dàn ghim theo khung thật (bong bóng + tên), nhãn địa điểm tự né sang chỗ trống |
| 1.7.0 | 23/11/2026 | Địa điểm quen thuộc (🏠 Ở Nhà, dòng thời gian Hôm nay), thẻ chi tiết từng người (địa chỉ, đang di chuyển, gửi vị trí), ghim trượt mượt + không chồng nhau, vuốt danh sách, khung chờ khi tải |
| 1.6.0 | 23/11/2026 | Hiện số phiên bản trong Cài đặt, nút tải lại để cập nhật |
| 1.5.0 | 23/11/2026 | Một người dùng nhiều máy: nhận lại danh tính, công tắc “Lấy vị trí từ máy này” |
| 1.4.0 | 23/11/2026 | Sửa 6 lỗi từ code review, thêm nút Đổi mã nhóm |
| 1.3.0 | 23/11/2026 | Danh sách cấm thành viên theo ID |
| 1.2.0 | 23/11/2026 | Xoá thành viên từ phía quản trị = mời ra khỏi nhóm |
| 1.1.0 | 23/11/2026 | App Check (reCAPTCHA Enterprise) chống bot |
| 1.0.0 | 23/11/2026 | Bản đầu tiên |

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
  lat, lng, acc, speed, battery, charging, updatedAt, joinedAt,
  place, placeSince,           // đang ở địa điểm nào, từ lúc nào
  photo                        // số phiên bản ảnh đại diện (nếu có)
}
families/{mã-nhóm}/photos/{id-thiết-bị} = { data: "data:image/webp;base64,…", v }
families/{mã-nhóm}/places/{id} = { name, emoji, lat, lng, radius, by, at }
families/{mã-nhóm}/events/{id} = { m, type: "arrive" | "leave", place, at }
families/{mã-nhóm}/banned/{id-thiết-bị} = true   // chỉ admin ghi
```
