# Hướng dẫn Kích hoạt & Kết nối Đối tác Thương mại cho Slink

Tài liệu này giúp bạn biết rõ **những gì đã chạy sẵn ngay lập tức không cần tài khoản đối tác**, và **những biến `.env` nào cần điền thêm** khi bạn có tài khoản/chìa khóa thật từ ngân hàng, thuế, vận chuyển và sàn TMĐT.

---

## 1. Đã tích hợp sẵn & Chạy ngay (Không cần khóa đối tác)

| Tính năng | Cách hoạt động trong Slink | Thao tác sử dụng |
|---|---|---|
| **VietQR động chuẩn NAPAS EMVCo (41 ngân hàng VN)** | Danh bạ 41 ngân hàng (`banks-vn.js`, đồng bộ từ `api.vietqr.io`) + bộ sinh EMVCo TLV & CRC-16 + bộ vẽ QR SVG 100% offline (`vietqr-tools.js`). | Vào **Cài đặt → Tích hợp thương mại & Thiết bị POS** → chọn Ngân hàng + nhập STK & Tên chủ TK → **Lưu cấu hình tích hợp**. Mã QR tự hiện ngay khi thu tiền chuyển khoản tại POS và trong chi tiết đơn hàng còn nợ. |
| **Máy in bill nhiệt 58mm/80mm ESC/POS & Bật két tiền** | Giao tiếp trực tiếp cổng USB/COM qua WebSerial (`escpos-printer.js`, tự bỏ dấu tiếng Việt chuẩn ASCII cho đầu in nhiệt). | Mở Slink bằng Chrome/Edge máy tính → **Cài đặt → Kết nối máy in USB/COM** → bấm **In thử bill** / **Mở két tiền** hoặc in trực tiếp từ chi tiết đơn. |

---

## 2. Các cổng chỉ cần điền `.env` là chạy (Plug-and-Play)

Hệ thống đã dựng sẵn adapter xác thực chữ ký, route Webhook an toàn tenant RLS, idempotency chống gạch nợ 2 lần, và UI cấu hình. Khi chưa có khóa thật, API chủ động trả lỗi `503 integration_not_configured` (không bao giờ giả lập).

### A. Tự động gạch nợ Chuyển khoản (SePay / Casso / PayOS)
1. **Lấy khóa ở đâu:**
   - **SePay:** `https://my.sepay.vn` → Liên kết ngân hàng → Tạo Webhook → copy `Authorization: Apikey <token>`.
   - **Casso:** `https://casso.vn` → Tích hợp Webhook v2 → copy `Secure-Token`.
   - **PayOS:** `https://my.payos.vn` → Kênh thanh toán → lấy `Client ID`, `API Key`, `Checksum Key`.
2. **Dán vào `.env`:**
   ```env
   SEPAY_WEBHOOK_TOKEN=...
   # hoặc CASSO_SECURE_TOKEN=...
   # hoặc PAYOS_CLIENT_ID=... + PAYOS_API_KEY=... + PAYOS_CHECKSUM_KEY=...
   ```
3. **Cấu hình Webhook URL tại cổng đối tác:**
   Mở **Cài đặt → Tích hợp thương mại** → chọn **Cổng gạch nợ Webhook tự động** → copy đúng đường dẫn `Webhook URL` của cửa hàng (dạng `https://ten-mien-cua-ban/api/webhooks/bank-transfer/sepay/<storeId>`) dán vào trang quản trị SePay/Casso/PayOS.
4. Khi khách chuyển khoản kèm mã đơn (ví dụ `SLINK ORD-00012` hoặc `ORD00012`), Slink tự ghi nhận `payments`, ghi sổ quỹ `cash_movements` và gạch công nợ khách hàng nguyên tử trong 1 transaction.

### B. Ví điện tử MoMo / VNPAY (Đã nối sẵn API Tạo phiên & IPN tự động gạch nợ)
- **MoMo Business (`https://business.momo.vn`):** khi tài khoản MoMo duyệt xong, dán 3 khóa vào `.env`:
  ```env
  MOMO_PARTNER_CODE=...
  MOMO_ACCESS_KEY=...
  MOMO_SECRET_KEY=...
  ```
- **IPN Webhook URL (copy sẵn trong `Cài đặt → Tích hợp thương mại`):** `https://ten-mien-cua-ban/api/webhooks/momo/<storeId>`.
- Khi khách thanh toán qua nút **Thanh toán MoMo** trong chi tiết đơn hàng, MoMo gọi IPN về Slink → tự động xác thực HMAC-SHA256, ghi `payments` (`bank_qr`), ghi sổ quỹ Ngân hàng (`PT-xxxx`) và trừ công nợ khách hàng nguyên tử.
- **VNPAY Merchant (`https://merchant.vnpay.vn`):** điền `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`.

### C. Hóa đơn điện tử NĐ 123/2020 & NĐ 70/2025 (MISA / Viettel)
- **MISA meInvoice:** điền `MISA_EINVOICE_URL`, `MISA_APP_ID`, `MISA_SECRET`.
- **Viettel S-Invoice:** điền `VIETTEL_EINVOICE_URL`, `VIETTEL_EINVOICE_USER`, `VIETTEL_EINVOICE_PASS`.
- Nhập thêm **Mã số thuế**, **Mẫu số**, **Ký hiệu** trong **Cài đặt → Tích hợp thương mại**, sau đó bấm **Xuất hóa đơn điện tử** ngay trong chi tiết đơn hàng.

### D. Vận chuyển (GHN đã kích hoạt · GHTK / Viettel Post sẵn sàng)
- **GHN (`https://khachhang.ghn.vn`):**
  - Đã tích hợp `GHN_TOKEN` vào `.env` cục bộ và tự động nhận diện **`GHN_SHOP_ID=6790898`** qua API `/shiip/public-api/v2/shop/all` (kể cả khi chỉ khai báo `GHN_TOKEN`).
  - Trong **Cài đặt → Tích hợp thương mại**, bấm **Kiểm tra kết nối GHN** để xác minh trạng thái Shop GHN trực tiếp.
  - Trong **Chi tiết đơn hàng → Tạo vận đơn (GHN/GHTK)**, bấm **Tính thử phí GHN** để xem trước cước phí (`total_fee`) và thời gian giao dự kiến trước khi bấm **Đẩy vận đơn**.
  - **Callback Webhook cập nhật trạng thái giao hàng GHN:** copy đường dẫn `https://ten-mien-cua-ban/api/webhooks/shipping/ghn/<storeId>` trong **Cài đặt → Tích hợp thương mại** dán vào cấu hình Webhook của GHN để tự động đồng bộ trạng thái vận đơn (`ready_to_pick`, `delivering`, `delivered`...).
- **GHTK (`https://khachhang.giaohangtietkiem.vn`):** điền `GHTK_TOKEN`.
- **Viettel Post:** điền `VTP_TOKEN`.

### E. Email xác nhận & Thông báo (Resend) / Zalo ZNS / Giám sát Sentry
- **Resend Email (`https://resend.com`):** điền `RESEND_API_KEY` (hoặc `EMAIL_DELIVERY_URL` + `EMAIL_DELIVERY_TOKEN`) và `EMAIL_FROM`.
- **Zalo OA / ZNS:** điền `ZALO_OA_ACCESS_TOKEN`, `ZALO_ZNS_TEMPLATE_ID`.
- **Sàn TMĐT Shopee / TikTok Shop:** điền `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY` / `TIKTOK_APP_KEY`, `TIKTOK_APP_SECRET`.
- **Sentry Runtime Monitoring:** điền `SENTRY_DSN`.
