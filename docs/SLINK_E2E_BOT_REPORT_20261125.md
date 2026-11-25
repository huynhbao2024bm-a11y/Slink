# Báo cáo kiểm thử E2E toàn diện Slink (25/11/2026)

Báo cáo ghi nhận nguyên trạng mọi luồng, màn hình, nút bấm, biểu mẫu, phản hồi máy chủ, thông báo toast và lỗi phát hiện được trong 4 lượt chạy bot Playwright độc lập trên `http://127.0.0.1:3010` (không tự ý sửa code sản phẩm trong lúc kiểm thử).

## Thông tin phiên kiểm thử

- **Thời điểm thực hiện**: `2026-11-25` (UTC `04:53:50Z` → `05:02:07Z`)
- **Môi trường kiểm thử**: Máy chủ cục bộ `node server/dev.js` (`PGlite`), URL `http://127.0.0.1:3010`, trình duyệt Chrome headless (`1440×900` và `360×800`)
- **Nhánh làm việc hiện tại**: `antigravity/slink-0915-concise-copy` tại `d:\Slink\.local-data\antigravity-slink-commercial` (chưa merge vào `main`)
- **Tài khoản chính thử nghiệm**: `huynhbao2024.bm@gmail.com` / `huynhbao2024` (Cửa hàng: `Slink Test Shop 2026`, vai trò chủ cửa hàng: `Huynh Bao Test`)
- **Tài khoản phụ thử phân quyền RBAC**: `Thu Ngân Bot` (`cashier`) và ngữ cảnh `?platform=android&appVersion=3031` tại `360×800`

---

## Phần A: Các chỉnh sửa giảm mật độ chữ đã áp dụng trước khi chạy bot

Đã rút gọn câu giải thích dài, bỏ chữ thừa nhưng giữ nguyên toàn bộ thông số thực tế trên 6 tệp:

1. `client/landing.js`: Rút gọn khung bên phải form auth (`renderAuthPortalAside`), 4 bộ ngành hàng (`landingIndustryBlueprints`), `lp-hero-lead`, thanh 4 thẻ cốt lõi, 7 thẻ Bento, 3 bước bắt đầu, khối tải Android APK, banner CTA và 3 thẻ tin cậy ở footer.
2. `client/shell.js`: Rút gọn phụ đề màn Đăng ký/Đăng nhập/Quên mật khẩu/Gửi lại xác nhận, thu gọn `auth-footnote` và 4 mục mô tả trong modal `Hướng dẫn sử dụng`.
3. `client/staff.js`: Đổi tiêu đề modal thành `Tạo nhanh nhân viên`, bỏ phụ đề dài và rút gọn `modal-note`.
4. `client/actions.js`: Rút gọn mô tả phần `Đơn kênh bán`, modal `Ghi nhận đơn từ kênh` và bỏ phụ đề lặp ở modal chuyển trạng thái đơn kênh.
5. `client/inventory.js`: Bỏ các đoạn `<p>` giải thích thừa dưới tiêu đề của `Phiếu nhập hàng`, `Trả hàng nhà cung cấp`, `Điều chuyển giữa các kho`, `Đơn đặt hàng`.
6. `client/products.js`: Rút ngắn ghi chú trong tab Serial/IMEI của chi tiết sản phẩm.
- Kiểm tra cú pháp `node --check` trên 6 tệp đều đạt (`SYNTAX_OK`) và đã khởi động lại `node server/dev.js` (`http://127.0.0.1:3010`).

---

## Phần B: Chi tiết toàn bộ 13 nhóm luồng & mọi điểm bấm đã kiểm tra

### 1. Trang giới thiệu công khai & Xác thực (Web `1440×900` + Android `360×800`)
- **Trang Landing Web (`1440×900`)**: 32 phần tử tương tác (`button` và `a`). 5 nút `.lp-nav` cuộn đúng; 2 tab Hero (`Màn hình Bán hàng POS` ↔ `Tổng quan & Doanh thu`) đổi ảnh và cập nhật glider theo `%`; 4 tab Ngành hàng đổi đúng mô tả rút gọn; `/download/android`, `/legal/privacy`, `/legal/terms` trả HTTP `200`; `overflowPx: 0`.
- **Cổng Auth Web**: Quickstart chuyển sang Đăng ký; nút `Hiện mật khẩu` đổi `password` ↔ `text`; chuyển đủ các màn `Đăng nhập`, `Quên mật khẩu?`, `Gửi lại xác nhận`, `← Trang giới thiệu`.
- **Chế độ Android (`?platform=android&appVersion=3031` tại `360×800`)**: Không hiện Landing, mở thẳng `.android-auth-card`; modal `Điều khoản sử dụng` và `Chính sách bảo mật` mở/đóng sạch; `overflowPx: 0`.
- **Đăng nhập bằng `huynhbao2024.bm@gmail.com` / `huynhbao2024`**: Đăng nhập trực tiếp vào `Slink Test Shop 2026`.

### 2. Tổng quan (`dashboard`), Danh bạ (`workspace`), Trợ giúp, Tài khoản & Guided Tour
- **`Tổng quan`**: 15 nút bấm trong `#view`. Trước giao dịch `0 ₫`; sau giao dịch: `Doanh thu thuần hôm nay: 495.000 ₫ (2 đơn)`, `Tiền thực trong quỹ: 480.000 ₫ (Tiền mặt 380.000 ₫ · Ngân hàng 100.000 ₫)`, `Lãi ròng thật hôm nay: 355.000 ₫`, `Đơn chờ thu / giữ hàng: 1`, `Ca tiền mặt đang mở: 1`, `Khách còn công nợ: 0`.
- **`Tất cả chức năng` (`workspace`)**: 16 nút điều hướng đủ toàn bộ phân hệ.
- **`Hướng dẫn sử dụng` (`help`)**, `Tài khoản` (`account-menu`) và `Xem lại hướng dẫn` (`replay-guided-tour`): 6 phím tắt (`F1, F2, F4, F6, F8, F9`), 3 bước Guided Tour hoạt động đầy đủ.

### 3. Cài đặt (`settings`) — 18 nút bấm, 4 tab (`overflowPx: 0`)
- Lưu thông tin cửa hàng, POS prefs (`Thử loa` + `Lưu thiết lập`), cấu hình ngân hàng VietQR MBBank (`970422` · `0909888777` · `HUYNH BAO TEST`), modal đối tác `"Chưa kết nối"`, bảo mật tài khoản (3 phiên + `Đăng xuất thiết bị`) và `Chứng từ trên thiết bị`.

### 4. Sản phẩm (`products`) — 5 nút ngoài + menu `Khác` (`overflowPx: 0`)
- Mở `Nhập hàng từ file`, tạo hàng thường `Áo Thun Cotton Basic` (`quick-product`, 21 trường, 3 nút submit), tạo hàng Serial `Tai Nghe Bluetooth S1` (`14` trường hiển thị), sửa giá `150000` → `165000`, xem `Lịch sử giá bán`, tạo nhóm biến thể (`17` trường + `fill-variant-barcodes`), mở modal `In tem mã vạch`.

### 5. Nhà cung cấp (`suppliers`) — 2 nút chính
- Form `supplier` chỉ có 2 trường (`name`, `openingPayableVnd`, không có SĐT/địa chỉ). Tạo `NCC Minh Phát` nợ đầu kỳ `500000`, mở `Sổ công nợ`.

### 6. Kho hàng (`inventory`) — 15 controls + 5 sub-tab
- Tạo kho `KHO2` (`Kho Chi Nhánh 2`): thành công nhưng phát sinh lỗi Console Regex trên Chrome.
- Nhập hàng (`receive-stock`, 15 trường), tạo & nhận đơn đặt hàng `PO-1002`, kiểm kê kho (`adjust-stock`), điều chuyển Serial trả `409 Conflict`, điều chuyển hàng thường `TR-1001` qua đủ 3 bước (nháp → xuất chuyển → nhận hàng), lập phiếu trả NCC (`8` trường).

### 7. Khách hàng (`customers`) & Khuyến mãi (`promotions`)
- Tạo khách `Trần Minh Tuấn` (`0901234567`, form 15 trường), gắn tag `VIP`, thử 5 bộ lọc nhanh; tạo mã khuyến mãi `GIAM10K` (form 11 trường).

### 8. Bán hàng POS (`pos`) — 26 nút bấm trong `#view`
- Render 2 giỏ song song (desktop + `#drawer-cart`). Hoàn tất: `Đơn 2` (đa hóa đơn), chặn `+` khi Serial tồn = `1`, giảm giá món, `In tạm tính (F8)`, thanh toán nhanh tiền mặt, thanh toán tách/một phần chuyển khoản (hiện đúng VietQR MBBank `0909888777`), chế độ `Giao hàng` (`data-delivery-field`), bán Serial và đơn `Ghi nợ` 0đ.

### 9. Đơn hàng (`orders`) & Đổi trả / Hủy / Bảo hành
- Lọc 5 trạng thái; gắn nhãn `BotTag` (`order-tag`) và thêm ghi chú (`order-note`) trong `<details class='order-more-actions'>` (ghi nhận modal tự gập lại `<details>` sau khi gắn nhãn); thu nợ `165.000 ₫`; mở modal `Đổi hàng · SL-1007`; trả hàng `RT-1001 · 165.000 ₫`; tra cứu bảo hành (`open-warranty-lookup` nằm trong `Khác`).

### 10. Thu chi (`finance`) & Báo cáo (`reports`)
- Thu chi 5 tab: lập phiếu thu `100.000 ₫`, chuyển quỹ nội bộ `CQ-1001 · 50.000 ₫`, mở ca `500.000 ₫` & chốt ca `550.000 ₫` khớp dự kiến.
- Báo cáo 4 tab + 5 preset thời gian khớp số nguyên VND sau giao dịch.

### 11. Kênh bán (`channels`)
- 11 controls; tạo trùng gian hàng `Shopee Test Shop` trả HTTP `409` (`channel_profile_exists`); `Thêm ánh xạ` tự mở khóa theo trạng thái gian hàng.

### 12. Nhân viên (`staff`), RBAC & Nhật ký (`audit`)
- Tạo `Thu Ngân Bot` (`NV-002`) và liên kết `Mời Email`; đăng nhập `cashier` chỉ hiện 6 mục menu và chặn truy cập `staff`; Nhật ký hiện đủ 21 dòng.

### 13. Tổng hợp lỗi & vấn đề phát hiện (CHƯA SỬA)
1. **Va chạm vùng bấm POS di động `360×800`**: `[data-pos-primary-pay]` trong `<main>` có thể chặn sự kiện click tới `#mobile-nav [data-action="more-menu"]`.
2. **Lỗi Console Regex ở form tạo kho**: `pattern="[A-Za-z0-9_-]{3,32}"` lỗi trên Chrome `/v` flag (`Invalid character in character class`).
3. **`Thao tác khác` (`order-more-actions`) tự đóng sau khi gắn nhãn đơn hàng**.
4. **Nhãn Nhật ký (`audit`) chưa Việt hóa hết**: còn `staff · direct_created` và `warehouse · created`.
5. **Khác biệt UX/Hệ thống khác**: Form NCC thiếu SĐT/địa chỉ; Dashboard `Khách còn công nợ` hiện `0` khi đơn nợ mới chưa quá hạn; Global rate-limit `120 req/phút` trả HTTP `429`; `GET /api/auth/me` trước khi đăng nhập log `401` trên console; `enhanceWorkspace()` gộp nhiều nút quan trọng vào dropdown `Khác`.
