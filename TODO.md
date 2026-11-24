# Việc để làm sau

Cập nhật 24/11/2026, bản 1.13.0.

## Phím tắt iPhone

- [x] **Thẻ chi tiết hiện “⚡ Đang sạc” từ lúc cắm đến lúc rút**, tự tắt nếu quá 2 giờ không có gì báo lại (`isCharging`, `chargingAt`).
  Mẫu phím tắt mới có thêm `acc:null`, `charging`, `chargingAt`. Rules đã nhận `charging` dạng chuỗi và có thêm `chargingAt`.
- [x] **Đã về / đã rời cho người dùng phím tắt**: máy nào đang mở app ghi giúp (`trackOthersPlaces`).
  Giờ ghi là lúc phím tắt gửi. Khoá sự kiện cố định theo `updatedAt`, nên nhiều máy cùng ghi vẫn chỉ ra một sự kiện.
- [x] **Người quản lý nhóm cập nhật phím tắt rồi chia sẻ lại link** (xong 24/11: link `9ed88747…`; người nhà đã cài bản cũ thì cài lại từ link mới) (hướng dẫn trong app: phần “🛠 Tự tạo phím tắt”):
  1. Thêm tác vụ *Lấy mức pin* thứ hai, chọn mục về bộ sạc.
  2. Sao chép mẫu mới, thay khung mẫu, rồi chèn lại các biến LAT/LNG/PIN/SAC.
  3. Thay mã bằng `DÁN MÃ VÀO ĐÂY` → chia sẻ → lấy link iCloud mới → dán lại mã của mình.
  4. Thay `shortcutUrl` trong `config.js`. Kiểm tra link không chứa mã nhóm: tải file từ
     `https://www.icloud.com/shortcuts/api/records/<id>`, tìm chuỗi `families/`.
  5. Thêm tự động hoá *Bộ sạc → Được ngắt kết nối*.
  6. Người đã cài phím tắt cũ thì cài lại từ link mới.

  Phím tắt cũ vẫn gửi vị trí bình thường, nhưng không có ⚡ và không được ghi đến/rời giúp.
- [x] iPhone tiếng Việt ghi trạng thái bộ sạc là “Không” / “Có” (đã có trong `CHARGING_WORDS`). Còn chờ xác nhận lúc cắm sạc thật.

## App Android

- [ ] **Chưa thử trên máy Android thật.** Cài APK
  (<https://github.com/hung-aihello/FamilyPosition/releases/download/app/NhaMinh.apk>), tắt màn hình vài phút,
  rồi xem vị trí có cập nhật không (`updatedAt` trên Firebase).
  Thử thêm trên Xiaomi, Oppo, Samsung với chế độ pin “Không hạn chế”.
- [ ] Kiểm tra nút **🤖 Cài app Android** có hiện khi mở bản web bằng Chrome trên Android.
