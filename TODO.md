# Việc để làm sau

Ghi ngày 24/11/2026, sau bản 1.12.5.

## Phím tắt iPhone

- [ ] **Thẻ chi tiết hiện sai “⚡ Đang sạc” và sai số GPS cũ.**
  Phím tắt gửi mức pin nhưng không gửi `charging` và `acc`. Hai giá trị cũ do app Nhà Mình ghi lần trước còn nằm lại,
  nên thẻ có thể ghi “Đang sạc · 37%” khi máy không cắm sạc. Việc này cũng tắt luôn cảnh báo pin yếu (≤ 20%).
  Dòng “Sai số khoảng ±11 m” cũng là số cũ.
  - Cách sửa: thêm `"acc":null,"charging":null` vào mẫu gửi.
    Mẫu giờ gửi dạng Văn bản nên viết được `null`, và Firebase xoá trường khi nhận `null`.
    ```
    {"lat":LAT,"lng":LNG,"acc":null,"battery":PIN,"charging":null,"speed":0,"updatedAt":{".sv":"timestamp"}}
    ```
  - Cần làm:
    1. Đổi `SHORTCUT_BODY` trong `app.js`.
    2. Sửa khung mẫu trong phím tắt trên iPhone.
    3. Thay mã bằng `DÁN MÃ VÀO ĐÂY`, chia sẻ lại để lấy link iCloud mới, rồi dán lại mã của mình.
    4. Thay `shortcutUrl` trong `config.js` bằng link mới.
    5. Người đã cài phím tắt cũ thì sửa tay khung mẫu, hoặc cài lại từ link mới.
  - Trước khi gắn link mới, kiểm tra link không chứa mã nhóm: tải file từ
    `https://www.icloud.com/shortcuts/api/records/<id>`, rồi tìm chuỗi `families/`.

- [ ] **Dòng thời gian đến/rời và chuông chỉ chạy khi mở app.**
  Vị trí từ phím tắt không tạo sự kiện “đã về / đã rời”.
  Có thể cho máy đang mở app suy ra sự kiện từ toạ độ của người khác.
  Cần tránh ghi trùng khi nhiều máy cùng mở app.

## App Android

- [ ] **Chưa thử trên máy Android thật.** Cài APK
  (<https://github.com/hung-aihello/FamilyPosition/releases/download/app/NhaMinh.apk>), tắt màn hình vài phút,
  rồi xem vị trí có cập nhật không (`updatedAt` trên Firebase).
  Thử thêm trên Xiaomi, Oppo, Samsung với chế độ pin “Không hạn chế”.
- [ ] Kiểm tra nút **🤖 Cài app Android** có hiện khi mở bản web bằng Chrome trên Android.
