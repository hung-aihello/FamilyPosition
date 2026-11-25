# 🏡 Nhà Mình

Webapp xem vị trí người thân trong gia đình theo thời gian thực. Chạy mượt trên điện thoại, cài được như app (PWA), **miễn phí hoàn toàn**, **không cần đăng nhập**.

- Frontend tĩnh: GitHub Pages
- Dữ liệu realtime: Firebase Realtime Database (gói Spark miễn phí)
- Bản đồ: Leaflet + OpenStreetMap (không cần API key); không tải được OSM thì tự đổi sang Esri World Street Map

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
**Nên dùng app native** — vẫn gửi vị trí khi tắt màn hình. Xem [`mobile/README.md`](mobile/README.md):
- **Android:** tải [NhaMinh.apk](https://github.com/hung-aihello/FamilyPosition/releases/download/app/NhaMinh.apk) trên điện thoại rồi cài.
- **iPhone (khuyên dùng — miễn phí, không cài app):** dùng bản web như bên dưới, rồi **⚙️ Cài đặt → 📲 Gửi vị trí khi không mở app** để thiết lập app *Phím tắt* có sẵn của iPhone tự gửi vị trí mỗi khi mở Zalo, cắm sạc, đến/rời nhà, theo giờ. Xem [Phím tắt iPhone](#phím-tắt-iphone).
- iPhone (cách khác): tự ký file `.ipa` của app native bằng Apple ID miễn phí (Sideloadly/AltStore) — phải ký lại mỗi 7 ngày.

Hoặc dùng bản web (chỉ gửi vị trí khi đang mở app):
- **Android (Chrome):** mở link → menu ⋮ → **Thêm vào màn hình chính**.
- **iPhone (Safari):** mở link → nút Chia sẻ → **Thêm vào MH chính**.

### 5. (Khuyên dùng) Bật App Check chống bot
App Check bắt mọi request tới database phải đến từ chính trang web này, nên script dùng API key bị lộ sẽ bị chặn. Dùng **reCAPTCHA Enterprise** dạng score-based: chạy ngầm, người dùng không phải bấm gì. Miễn phí 10.000 lượt kiểm tra/tháng — dư cho một gia đình. (reCAPTCHA v3 “classic” đã bị Firebase ngừng nhận đăng ký mới.)

1. Google Cloud Console (project `nha-minh-7ef58`) → **Security → reCAPTCHA** → bật API nếu được hỏi → **Create key**: loại **Website**, domain `hung-aihello.github.io`, **không** bật checkbox challenge → copy **Key ID**.
2. Firebase Console → **App Check → Apps** → mở web app → **reCAPTCHA Enterprise** → dán Key ID → đặt **Token TTL = 1 ngày** (giảm số lượt kiểm tra) → Save.
3. Dán Key ID vào `appCheckSiteKey` trong `config.js` → push.
4. Đợi 1–2 ngày, xem **App Check → APIs → Realtime Database**: khi gần như 100% request là *Verified* thì bấm **Enforce**.

> ⚠️ **Đang dùng Phím tắt iPhone thì đừng Enforce**: phím tắt ghi thẳng qua REST, không có token App Check, sẽ bị chặn.
> Khi đó tỷ lệ *Verified* sẽ luôn thấp (mỗi lần phím tắt chạy là một request không xác minh) — đó là bình thường, không phải lỗi App Check; cứ để App Check ở chế độ theo dõi.

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

## Phím tắt iPhone
Trình duyệt trên iPhone không cho web lấy vị trí khi không mở app. App **Phím tắt** (có sẵn) thì được: tự động hoá chạy phím tắt “Nhà Mình” khi **mở Zalo/Facebook**, **cắm sạc**, **đến/rời nhà**, hoặc **theo giờ** — mỗi lần chạy gửi vị trí + mức pin lên nhóm. Không cài app, không hết hạn, miễn phí.

**Người tạo nhóm (một lần, ~10 phút):** trên iPhone mở Nhà Mình → ⚙️ Cài đặt → 📲 Gửi vị trí khi không mở app → làm theo phần 1–3 trên màn hình (tạo phím tắt 5 tác vụ, có hướng dẫn từng lần chạm) → thay mã của mình trong phím tắt bằng `DÁN MÃ VÀO ĐÂY` (link nằm trong repo công khai, không được chứa mã nhóm) → chia sẻ phím tắt → **Sao chép liên kết iCloud** → dán lại mã của mình → dán vào `shortcutUrl` trong [`config.js`](config.js) → push. Từ đó cả nhà chỉ cần bấm **➕ Thêm phím tắt**.

**Mỗi người (~5 phút):** Cài đặt → 📲 Gửi vị trí khi không mở app → **Sao chép mã** → **Thêm phím tắt** → dán mã vào khung *Văn bản* (thay chữ DÁN MÃ VÀO ĐÂY) → chạy thử 1 lần (cho phép vị trí + kết nối) → tạo các tự động hoá theo hướng dẫn trên màn hình, chọn **Chạy ngay lập tức**.

> Apple chỉ cho mở file phím tắt đã được ký bằng tài khoản iCloud (lệnh `shortcuts sign` báo *must be signed into iCloud* trên máy Mac của GitHub), nên không tạo sẵn file được — phải tạo tay một lần rồi chia sẻ link iCloud.

Giới hạn:
- Vị trí cập nhật **theo sự kiện**, không liên tục — người nhà thấy “x phút trước”. Mở Zalo càng thường thì càng mới.
- Không có tốc độ / sai số GPS. *Đã về / đã rời* (dòng thời gian, chuông, “Ở Nhà từ …”) do **máy người khác đang mở app** ghi giúp, giờ = lúc phím tắt gửi. Không ai mở app thì người mở app sau sẽ ghi bù, đúng giờ.
- **⚡ Đang sạc** hiện khi phím tắt báo đang cắm sạc (tự động hoá *Bộ sạc → Được kết nối / Được ngắt kết nối*), tự tắt nếu quá 2 giờ không ai báo lại.
- **Mã kết nối gắn với nhóm hiện tại**: Đổi mã nhóm / rời nhóm thì phải dán lại mã mới vào phím tắt.
- **Tắt “Chia sẻ vị trí của tôi” thì phím tắt báo *Permission denied*** — đúng ý đồ: Security Rules không nhận `lat`/`lng`/`place` khi `sharing = false`, nên toạ độ không lên server. Bật chia sẻ lại là phím tắt chạy bình thường.
- Không dùng được nếu bật Enforce App Check (xem trên).

Kỹ thuật: phím tắt gồm *Lấy vị trí hiện tại* → *Lấy mức pin* → *Lấy mức pin* (chọn mục bộ sạc) → *Văn bản* (mẫu `{"lat":LAT,"lng":LNG,"acc":null,"battery":PIN,"charging":"SAC","chargingAt":{".sv":"timestamp"},"speed":0,"updatedAt":{".sv":"timestamp"}}`, LAT/LNG/PIN/SAC thay bằng biến) → *Văn bản* (mã kết nối = `{databaseURL}/families/{mã}/members/{id}.json`) → *Lấy nội dung của URL* `PATCH`, nội dung = **Tệp** (khung mẫu). Không dùng kiểu JSON của Phím tắt: iPhone cài tiếng Việt gửi số thập phân thành chuỗi `"16,09"` → rules từ chối. `speed:0` để không báo “đang di chuyển” theo tốc độ cũ; `acc:null` xoá sai số cũ và là dấu hiệu “vị trí từ phím tắt” để máy khác ghi đến/rời giúp (`trackOthersPlaces`, khoá sự kiện cố định theo `updatedAt` nên nhiều máy ghi vẫn chỉ ra một); `charging` là chữ tuỳ ngôn ngữ máy (“Đúng”, “Có”…), rules nhận cả boolean lẫn chuỗi ≤ 12 ký tự, `chargingAt` để tự tắt sau 2 giờ; `online` đã do onDisconnect đặt false. Rules chỉ nhận khi hồ sơ đã tồn tại.

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

## Bong bóng “đang làm gì”
Chạm **ghim của mình** trên bản đồ (hoặc nút **💭** cạnh tên mình) → chạm một hình. Hai chạm là xong, cả nhà thấy bong bóng trên ghim và trong danh sách. Chạm lại hình đang bật để tắt.

| Hình | Cả nhà thấy | Tự tắt |
|---|---|---|
| 🛵 | Đang về · còn 3,2 km (đường chim bay tới 🏠 gần nhất) | Khi về tới Nhà, hoặc sau 3 giờ |
| 📞 | Rảnh, gọi đi | 1 giờ |
| 😋 | Đói rồi | 2 giờ |
| 🥰 | Nhớ cả nhà | 3 giờ |
| 😴 | Đang ngủ | 8 giờ |
| 🤫 | Bận, đừng gọi | 2 giờ |

- Hình hợp hoàn cảnh nhất được viền vàng (đang đi đường → 🛵, sau 22 giờ → 😴, giờ cơm → 😋…).
- **Thả tim:** chạm bong bóng của người khác (hoặc nút 🤍 trong thẻ chi tiết) → ❤️ bay sang. Người đó đang mở app thì thấy ngay; chưa mở thì lần mở sau được báo “Mẹ và Bi thả tim cho bạn” (trong 2 ngày).
- Người tắt chia sẻ vị trí vẫn đặt được, chỉ hiện trong danh sách. Không có thông báo đẩy: bong bóng và tim chỉ thấy khi mở app.
- Người dùng Phím tắt iPhone: số km theo lần gửi vị trí gần nhất; về tới Nhà thì máy người khác đang mở app tắt 🛵 giúp.

## Ảnh đại diện
**⚙️ Cài đặt → 📷 Chọn ảnh** → kéo/chụm 2 ngón để căn khuôn mặt vào vòng tròn → **Dùng ảnh này** → **Lưu**. Muốn quay lại hình emoji: **Dùng hình emoji** → **Lưu**.

- Ảnh được cắt vuông và nén ngay trên điện thoại: **256×256 px, WebP** (máy cũ không hỗ trợ thì JPEG), thường **~15–25 KB** dù ảnh gốc vài MB.
- Lưu dạng base64 ở nhánh riêng `photos/{id}`, **không** nằm trong hồ sơ thành viên. Hồ sơ chỉ giữ số phiên bản `photo`, nên các lần cập nhật vị trí không phải gửi kèm ảnh.
- Mỗi máy chỉ tải ảnh **một lần** rồi nhớ trong máy; chỉ tải lại khi người đó đổi ảnh. Rời nhóm thì ảnh bị xoá theo.
- Rules chỉ nhận `data:image/webp|jpeg|png;base64,…` tối đa 60.000 ký tự (chặn SVG/chữ/ảnh quá lớn).
- Không dùng Firebase Storage vì cần đăng nhập, và rules Storage đang dùng chung với app khác.

## Đổi mã nhóm
**⚙️ Cài đặt → 🔄 Đổi mã nhóm**: bạn chuyển sang nhóm mới với mã mới, app tự mở hộp mời để gửi lại cho những người muốn giữ. Ai chỉ có mã cũ sẽ không thấy bạn nữa. Ảnh đại diện và các địa điểm đã lưu được mang sang nhóm mới (dòng thời gian thì không). Dùng khi mã bị lộ hoặc muốn loại ai đó ra — đây là cách **thu hồi quyền truy cập thật sự** (xem giới hạn bên dưới).

## Giới hạn cần biết

- **Không đăng nhập = ai có mã nhóm là người trong nhóm.** Người có mã có thể xem vị trí cả nhóm, và về kỹ thuật có thể xoá bản ghi của người khác. Lệnh cấm theo ID (`banned`) chặn được máy cũ cứ tự tạo lại bản ghi, nhưng người cố tình có thể lách bằng cách xoá dữ liệu trình duyệt. Muốn loại ai đó ra hẳn: **Đổi mã nhóm** rồi mời lại những người còn lại. (Sửa tận gốc cần Firebase Auth — không dùng được vì project này đã tắt sign-up để bảo vệ app khác dùng chung.)

- **Bản web chỉ cập nhật vị trí khi app đang mở trên màn hình** — trình duyệt không cho lấy vị trí khi chạy nền. App hiển thị “x phút trước” để mọi người biết vị trí đã cũ bao lâu. Muốn gửi cả khi tắt màn hình: dùng **app native** trong [`mobile/`](mobile/README.md) (Capacitor + plugin background geolocation). App native vẫn dừng nếu bị vuốt tắt khỏi đa nhiệm.
- Hạn mức Firebase miễn phí: 100 kết nối đồng thời, 1 GB lưu trữ, 10 GB tải xuống/tháng — dư sức cho vài gia đình.
- Tile bản đồ dùng máy chủ OpenStreetMap theo [chính sách sử dụng](https://operations.osmfoundation.org/policies/tiles/) — phù hợp cho dùng cá nhân/gia đình.

## Lịch sử phiên bản
Phiên bản đang chạy xem ở **⚙️ Cài đặt** (dòng cuối). Bấm **Tải lại để cập nhật** để lấy bản mới nhất — hữu ích khi cài như app trên điện thoại (không có nút tải lại).

Khi phát hành: tăng `APP_VERSION` + `APP_RELEASED` ở đầu `app.js` và thêm một dòng vào bảng dưới.

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.15.0 | 25/11/2026 | **Bong bóng “đang làm gì”**: chạm ghim của mình (hoặc nút 💭) → chọn 🛵 📞 😋 🥰 😴 🤫, tự tắt theo giờ, 🛵 hiện còn bao xa và tắt khi về tới Nhà. **Thả tim**: chạm bong bóng người khác, ❤️ bay sang; lúc vắng thì mở app được báo lại. Có tiếng riêng cho từng hình. “Xem cả nhà” không còn để ghim ở mép văng khỏi màn hình khi nhiều người cùng chỗ. **Cần deploy Rules mới** |
| 1.14.2 | 25/11/2026 | Chạm vào một người: bảng mở cao vừa đúng để thấy hết nội dung, không kéo cao thêm được nữa (trước đây kéo lên lòi khoảng trắng). Vuốt xuống thì thu gọn còn ảnh + tên, chạm để mở lại. Hai nút Chỉ đường / Gửi vị trí nằm cùng hàng |
| 1.14.1 | 25/11/2026 | Sửa: thông báo bị hộp thoại che (“Tên không được để trống”, “Đã sao chép ✓”…); tải lại trang giữa chừng mất lời mời; mấy người về cùng lúc chỉ báo một người; mạng hỏng thì kẹt ở màn hình chờ (giờ có nút **Thử lại**); chạm vào một người lúc bảng kéo lên hết thì không thấy người đó; thẻ chi tiết / dòng thời gian chớp mỗi lần GPS báo; điện thoại xoay ngang không đặt được địa điểm, bản đồ trống; màn hình hẹp mất nút ⚙️; dòng pin thấp bị cắt khoảng cách; vừa phát hành dễ bị lẫn file cũ. Cải thiện: nút **Lưu** trong Cài đặt luôn ở mép dưới, đóng mà quên Lưu thì nhắc; chạm cả dòng để gạt công tắc; đóng thẻ về đúng chỗ đang cuộn; báo “Mất mạng”; xem một người không bị thu nhỏ bản đồ |
| 1.14.0 | 25/11/2026 | **Tắt chia sẻ là server từ chối luôn vị trí**, kể cả từ Phím tắt iPhone (cần deploy Rules mới); vị trí còn sót của người đã tắt chia sẻ được xoá giúp. **Đổi mã nhóm mang theo ảnh đại diện + địa điểm.** “Đang mở app” đổi thành “Đang chia sẻ trực tiếp”, trong danh sách là “Trực tiếp” (đúng cả khi app native chạy nền) |
| 1.13.5 | 25/11/2026 | Hình viên pin vẽ đúng mức (trước đây pin sắp hết vẫn hiện 🔋 đầy); pin cũ hơn vị trí trên 30 phút thì ghi giờ báo và không báo động; tắt chia sẻ thì ẩn pin. Sửa: mở lại app gửi nhầm vị trí cũ thành “vừa xong”; mất GPS / đã dừng vẫn báo đang đi; laptop lệch hàng km đè vị trí Phím tắt; máy sai giờ xoá mất dòng thời gian; chạm vào danh sách hay bị trượt; ghim bị bảng che; đặt địa điểm bị lệch khi bàn phím bật; địa chỉ kẹt “Đang tìm…”; cấp lại quyền vị trí phải mở lại app; không nhả “giữ màn hình sáng”; xoay ngang danh sách không bấm được; từ chối lời mời bị kẹt ở màn chào |
| 1.13.4 | 24/11/2026 | Máy không tải được OSM (đã xác nhận trên iPhone 14 Pro Max iOS 18.7 và iPhone iOS 16.7: 0 ô, toàn lỗi) thì đổi sang Esri ngay khi lỗi 6 ô, và nhớ 1 ngày để lần mở sau không phải chờ bản đồ trắng |
| 1.13.3 | 24/11/2026 | Bản đồ tự đổi sang máy chủ dự phòng (Esri) nếu 10 giây không tải được ô OSM nào. Cuối Cài đặt có dòng chẩn đoán bản đồ (nguồn, số ô tải được/lỗi, cỡ khung, iOS/Android, mở bằng gì, lỗi JS gần nhất) để chụp gửi khi báo lỗi |
| 1.13.2 | 24/11/2026 | Sửa bản đồ trắng trên iPhone đời cũ / Android (lọc màu từng ô thay vì cả lớp, dự phòng Leaflet từ jsDelivr, bỏ `inset`). Bảng danh sách dễ vuốt xuống hơn |
| 1.13.1 | 24/11/2026 | Link phím tắt chung mới (có trạng thái bộ sạc, mẫu mới). iPhone ghi trạng thái sạc là “Có”/“Không” |
| 1.13.0 | 24/11/2026 | Phím tắt iPhone: **đã về / đã rời** cho người dùng phím tắt (máy đang mở app ghi giúp, giờ = lúc phím tắt gửi, không ghi trùng); **⚡ Đang sạc** trong thẻ chi tiết từ lúc cắm đến lúc rút sạc, tự tắt sau 2 giờ không ai báo lại (app cũng gửi `chargingAt`); mẫu phím tắt mới xoá sai số GPS cũ. Rules: `charging` nhận chuỗi, thêm `chargingAt` |
| 1.12.5 | 24/11/2026 | Web trên Android: Cài đặt hiện nút **🤖 Cài app Android** thay cho nút Phím tắt iPhone. Hộp thoại Phím tắt: khi đã có link chung thì chỉ hiện mã (ẩn mẫu chỉ dùng khi tự tạo) |
| 1.12.4 | 24/11/2026 | Gắn link iCloud phím tắt “Nhà Mình” (không chứa mã của ai): người nhà bấm **➕ Thêm phím tắt**, dán mã của mình, tạo tự động hoá |
| 1.12.3 | 24/11/2026 | Sửa phím tắt iPhone bị *Permission denied* khi gửi vị trí: iPhone cài tiếng Việt gửi số thập phân có dấu phẩy ở kiểu JSON → đổi sang khung Văn bản (mẫu có nút **📋 Sao chép mẫu**) gửi dạng Tệp. Đã chạy được trên iPhone thật |
| 1.12.2 | 24/11/2026 | Hướng dẫn Phím tắt: đổi tên nhãn cho khớp iOS mới (“Yêu cầu nội dung”), cảnh báo 2 lỗi gây *Permission denied* (chọn nhầm loại Văn bản, gõ sai tên trường) — đã chạy thử thành công trên iPhone thật |
| 1.12.1 | 24/11/2026 | Viết lại hướng dẫn Phím tắt iPhone thành từng lần chạm (4 phần: sao chép mã → tạo phím tắt → chạy thử → tự động hoá); phím tắt gọn còn 4 tác vụ, 1 request; mã kết nối có sẵn đuôi `.json` |
| 1.12.0 | 24/11/2026 | iPhone gửi vị trí khi không mở app bằng app **Phím tắt** có sẵn (miễn phí, không cài app): Cài đặt → “📲 Gửi vị trí khi không mở app” có mã kết nối riêng, nút sao chép, hướng dẫn tạo phím tắt + tự động hoá (mở Zalo, cắm sạc, đến/rời nhà, theo giờ); link phím tắt chung đặt ở `shortcutUrl` trong `config.js` |
| 1.11.1 | 24/11/2026 | Thêm trang [Quyền riêng tư](privacy.html) (link trong Cài đặt). Hướng dẫn cài app iPhone trực tiếp không qua App Store (Sideloadly / AltStore tự ký lại qua Wi-Fi) |
| 1.11.0 | 24/11/2026 | App native Android & iPhone (thư mục `mobile/`, Capacitor): **vẫn chia sẻ vị trí khi tắt màn hình / dùng app khác**. App mở chính trang web nên sửa web là app tự cập nhật. Khi chạy nền, vị trí và sự kiện đến/rời gửi qua HTTP native (Firebase REST) vì WebView ở nền bị bóp mạng; người đang chạy nền vẫn hiện "đang chia sẻ". Cài đặt có thêm công tắc "Chia sẻ cả khi tắt màn hình" và nút mở quyền vị trí; pin đọc từ hệ điều hành; chia sẻ dùng bảng chia sẻ của máy; nút Back Android đóng hộp thoại rồi đưa app xuống nền. GitHub Actions build `.apk` và `.ipa`. Sửa `viewport-fit` (ghi nhầm `cut`) thành `cover` để nội dung không bị tai thỏ che |
| 1.10.1 | 23/11/2026 | Sửa nút 🎵: trình duyệt không cho tự phát nhạc trước lần chạm đầu, nhưng nút vẫn hiện "đang phát" nên chạm vào lại thành tắt nhạc. Giờ lúc chưa được phát, nút toả sóng mời chạm, và chạm vào thì phát nhạc; chạm bất kỳ chỗ nào trên màn hình cũng bật nhạc |
| 1.10.0 | 23/11/2026 | Âm thanh: lời chào khi mở app (và khi quay lại sau hơn 1 phút), tiếng "pụp" khi chạm, "vút" khi mở/đóng hộp thoại, chuông "kính coong" khi người thân về Nhà, chuông khi đến/rời địa điểm, lấp lánh khi lưu; nhạc nền hộp nhạc tự sáng tác (không lặp lại), tự tắt khi rời app. Nút 🎵 trên bản đồ để bật/tắt nhạc nhanh; Cài đặt có công tắc riêng cho âm thanh và nhạc nền (riêng từng máy). Tự tổng hợp bằng Web Audio, không cần tải file. Trên iPhone âm thanh theo nút gạt im lặng và không cắt nhạc đang nghe |
| 1.9.4 | 23/11/2026 | Dây nối ghim ↔ vị trí thật dễ nhận ra hơn: dây dày, màu xanh đậm có viền sáng; chấm vị trí thật to hơn với vòng đậm bao ngoài; dây nằm ở lớp riêng dưới mọi ghim nên không vắt ngang nhãn tên người khác |
| 1.9.3 | 23/11/2026 | Sửa lỗi zoom bản đồ làm sai vị trí tương đối giữa mọi người: ghim chồng nhau giờ được đẩy ra vừa đủ theo đúng hướng thật (ai ở bắc vẫn nằm trên, ai ở tây vẫn nằm trái) thay vì bị dàn thành một hàng ngang; ghim bị đẩy có chấm + dây nối về vị trí thật; ghim dàn lại mượt cùng lúc với hiệu ứng zoom |
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
| `native.js` | Cầu nối plugin native khi trang chạy trong app Android/iOS |
| `mobile/` | Vỏ app native (Capacitor): project Android + iOS, xem [`mobile/README.md`](mobile/README.md) |
| `.github/workflows/mobile-app.yml` | Build `.apk` + `.ipa` trên GitHub Actions |

Dữ liệu trên Firebase:
```
families/{mã-nhóm}/members/{id-thiết-bị} = {
  name, emoji, color, sharing, online,
  lat, lng, acc, speed, battery, charging, updatedAt, joinedAt,
  place, placeSince,           // đang ở địa điểm nào, từ lúc nào
  mood, moodAt,                // bong bóng “đang làm gì” (go, call, hungry, love, sleep, busy) và lúc đặt
  photo                        // số phiên bản ảnh đại diện (nếu có)
}
families/{mã-nhóm}/photos/{id-thiết-bị} = { data: "data:image/webp;base64,…", v }
families/{mã-nhóm}/hearts/{người-nhận}/{người-thả} = lúc thả tim gần nhất
families/{mã-nhóm}/places/{id} = { name, emoji, lat, lng, radius, by, at }
families/{mã-nhóm}/events/{id} = { m, type: "arrive" | "leave", place, at }
families/{mã-nhóm}/banned/{id-thiết-bị} = true   // chỉ admin ghi
```
