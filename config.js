// Cấu hình Firebase (dùng chung project "nha-minh-7ef58" với D:\DuAnTamHuyet).
// Các giá trị này KHÔNG phải bí mật — chúng được thiết kế để nằm trong code frontend.
// Dữ liệu được bảo vệ bằng mã gia đình ngẫu nhiên + Security Rules (xem database.rules.json).
export const firebaseConfig = {
  apiKey: "AIzaSyDtcn1yq-xi7WvulnD1EmbsZ2SEQ9Oz3uc",
  authDomain: "nha-minh-7ef58.firebaseapp.com",
  // ⚠️ Kiểm tra lại URL này trong Firebase Console → Realtime Database sau khi tạo database
  databaseURL: "https://nha-minh-7ef58-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "nha-minh-7ef58",
  appId: "1:308295627015:web:73402381b3015e93df55a2",
};

// Site key reCAPTCHA Enterprise (score-based) cho Firebase App Check (công khai, không phải bí mật).
// Để trống "" thì app chạy không có App Check.
export const appCheckSiteKey = "6LdFvi0uAAAAADOawbwEZC7gyiJa1jNY8pitxluF";
