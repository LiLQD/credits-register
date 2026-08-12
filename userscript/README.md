# HaUI Credit Registration Assistant - Userscript

Userscript / tiện ích chạy trong DevTools Console để xem học phần, xem lớp, quét lớp còn chỗ, đăng ký/hủy lớp và theo dõi một lớp cụ thể trên cổng sinh viên HaUI:

https://sv.haui.edu.vn

## Ghi nhận tác giả gốc

Phiên bản userscript này được phát triển dựa trên script console/repository gốc:

- Dự án gốc: `credits-register`
- Tác giả gốc: Nguyễn Trung Hiếu (Seotow)
- File gốc: `creditsRegister.js`

Phiên bản này chỉ chuyển hướng sử dụng từ console script sang userscript/trình duyệt, đồng thời giữ nguyên mục đích chính: hỗ trợ xem dữ liệu đăng ký tín chỉ từ các API sẵn có của hệ thống HaUI. (Do tác giả gốc không update hơn 1 năm btw)

Nần ná na na anh sờ eo tơ

## Phiên bản này có gì

- Panel nổi trong trình duyệt để tải danh sách học phần, xem lớp, quét lớp và theo dõi lớp.
- Vẫn hỗ trợ các lệnh console để dùng nhanh.
- Kết quả quét lớp hiển thị cả `FID` / `ModulesID` và `Class ID` / `IndependentClassID`.
- Có lệnh `showModules()` để quay lại danh sách học phần.
- Cải thiện thông báo lỗi API và xử lý JSON an toàn hơn.
- Theo dõi lớp có thể dừng bằng `monitor.stop()` và hủy request đang chạy nếu có thể.

## Cài đặt

1. Cài trình quản lý userscript như Tampermonkey hoặc Violentmonkey.
2. Tạo userscript mới.
3. Dán toàn bộ nội dung file:

```text
userscript/creditsRegisterUserScript.js
```

4. Lưu userscript.
5. Mở https://sv.haui.edu.vn và đăng nhập tài khoản sinh viên.

Userscript chạy trên các trang:

```text
https://sv.haui.edu.vn/register/*
https://sv.haui.edu.vn/*
```

## Lưu ý

- Cần đăng nhập vào `sv.haui.edu.vn` trước khi dùng.
- Nếu báo thiếu hoặc hết hạn `window.kverify`, hãy refresh trang và đăng nhập lại nếu cần.
- Script sử dụng các AJAX endpoint và session đăng nhập sẵn có của trình duyệt.
- Không đặt interval quá thấp để tránh gửi request quá dày.
- Không sử dụng tự động đăng ký theo cách vi phạm quy định của trường hoặc ảnh hưởng người khác.

## File

```text
userscript/creditsRegisterUserScript.js
userscript/README.md
```
