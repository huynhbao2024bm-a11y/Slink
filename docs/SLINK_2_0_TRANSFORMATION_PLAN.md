# Kế hoạch Đại Phẫu & Khác Biệt Hóa Thực Sự: Slink 2.0 ("Quầy Thu Ngân 0đ Phần Cứng")

> **Ngày lập:** 2026-11-20  
> **Nền hiện tại:** `origin/main` (`67618de`) · `android-v0.5.0` (`versionCode: 3013`)  
> **Mục tiêu cốt lõi:** Không sửa lắt nhắt hay xếp lại vài nút — tạo ra **sự thay đổi thực chất về trải nghiệm, kiến trúc đồng bộ và tính năng ngách độc bản** để chủ shop nhỏ & vừa Việt Nam **sẵn sàng trả tiền (99k–149k/tháng)** thay vì phải mua phần mềm nặng và 5–8 triệu phần cứng của KiotViet/Sapo.

---

## 1. Định vị mới của Slink 2.0 (Vì sao khách trả tiền?)

| Điểm đau của KiotViet / Sapo | Cách Slink 2.0 giải quyết triệt để |
| :--- | :--- |
| Tốn 5–8 triệu phần cứng ban đầu (máy quét, màn QR03, loa KV66, máy tính bàn). | **1 chiếc điện thoại = Trọn bộ quầy thu ngân 0đ phần cứng:** Camera quét liên tục như súng bắn mã + Màn QR phóng to tự tăng sáng + **Loa điện thoại tự đọc "Ting ting" giọng Việt** + Chia sẻ ảnh biên nhận Zalo 1 chạm. |
| Quá rối (30+ cài đặt ngầm, 50 menu), nhân viên mới bấm nhầm lệch kho/quỹ. | **60 giây bán ngay:** Giao diện tối giản tuyệt đối, tự đồng bộ dữ liệu theo thời gian thực qua Sync Bus trung tâm, màn hình chính chỉ hiện đúng **3 con số thật** (*Doanh thu · Tiền thực trong quỹ · Lãi ròng thật*). |
| Quản lý Serial/IMEI & bảo hành cứng nhắc, khó dùng cho hàng mã lẻ/QR. | **Vua quản lý mã riêng & Bảo hành tự động:** Quét 1 mã là biết ngay lịch sử bán & thời hạn bảo hành còn lại; hỗ trợ mọi mã 1D/2D/QR không số. |
| Phân quyền 4 vai trò cứng chưa sát thực tế từng nhân viên. | **Phân quyền chi tiết từng công tắc** (xem giá vốn, giới hạn % giảm giá, hủy/trả đơn, xem lãi lỗ, lập phiếu chi) có hiệu lực tức thì trên cả API và giao diện. |
| Khách nợ khó nhắc khéo, tốn công nhắn số tài khoản thủ công. | **Nhắc nợ 1 chạm kèm ảnh thẻ VietQR** đúng số tiền nợ còn lại, gửi thẳng qua Zalo/Messenger. |

---

## 2. Chi tiết 5 Trụ cột Thay đổi Thực chất (Chia làm 3 Đợt triển khai)

### Đợt 1 — Trải nghiệm "Quầy Thu Ngân 0đ Phần Cứng" & Chấm dứt Lỗi Đồng Bộ *(Triển khai ngay — không cần chờ đối tác)*

1. **Loa "Ting Ting" Native & Màn hình VietQR Phóng To (`MainActivity.java` + `pos-hardware.js` + `app.js`):**
   - **Android Native TTS (`TextToSpeech` `vi-VN`):** Thêm `type: "speak"` và `type: "screenBrightness"` trong `MainActivity.java`.
   - Khi thu ngân chọn **Chuyển khoản / VietQR** trên POS:
     - Mở chế độ **Màn hình QR Khách Quét Toàn Màn Hình** (tự tăng độ sáng màn hình 100% trên Android để khách dễ quét dưới đèn shop, hiển thị to rõ: Tên shop · Số tiền VND · Nội dung đơn · Mã QR sắc nét).
     - Khi xác nhận đã nhận tiền (hoặc sau này nhận webhook SePay): điện thoại tự phát tiếng **"Ting ting"** + đọc rõ giọng Việt *"Đã nhận hai trăm năm mươi nghìn đồng"* — thay thế hoàn toàn Loa KV66 & màn QR03.
   - Trên trình duyệt Web/iOS: tự fallback sang `window.speechSynthesis` (`vi-VN`) + Web Audio chime.

2. **Ảnh Biên Nhận Đẹp 1 Chạm & Chia Sẻ Thẳng Zalo/Messenger (`receipt-image.js` + `MainActivity.java`):**
   - Vẽ hóa đơn PNG độ nét cao bằng HTML5 `<canvas>` (không cần thư viện ngoài, chạy 100% offline): Logo/Tên shop, danh sách món, giảm giá, tổng thanh toán, ngày giờ, mã đơn, lời chào.
   - Thêm cầu nối Android `type: "shareImage"` (lưu PNG vào `cacheDir` → `FileProvider` → `Intent.ACTION_SEND` `image/png`) và `navigator.share({ files })` trên Web/iOS.
   - Shop không cần mua máy in nhiệt ngay vẫn gửi được hóa đơn ảnh chuyên nghiệp qua Zalo cho khách chỉ với 1 chạm.

3. **Camera Quét Liên Tục Không Chạm (Continuous Rapid Scanner):**
   - Nâng cấp camera POS, Nhập hàng và Kiểm kho: quét trúng mã → phát tiếng bíp ngắn + rung nhẹ (`vibrate`) + hiện thông báo nổi `+1 Tên hàng` → **giữ nguyên camera mở** để quét tiếp món thứ 2, thứ 3 liên tiếp không phải mở lại camera (nhanh ngang súng bắn mã USB).

4. **Kiến trúc Đồng Bộ Trung Tâm (`sync-bus.js`) & Màn Hình Chủ "3 Con Số Thật":**
   - Xây dựng `SlinkSyncBus` thống nhất: mọi thao tác ghi dữ liệu (bán hàng, trả/hủy đơn, nhập/kiểm/chuyển kho, thêm mã serial, thu/chi, chuyển quỹ, chốt ca, thu nợ, đổi quyền NV) đều phát sự kiện theo domain (`sales`, `inventory`, `finance`, `customers`, `staff`) để **tự động làm mới đúng toàn bộ các màn hình liên quan**, chấm dứt tình trạng dữ liệu cũ khi chuyển tab.
   - Đại phẫu **Màn hình Chủ (`renderDashboard`)**: hiển thị nổi bật ngay đầu trang đúng **3 thẻ chỉ số thật hôm nay**:
     1. **Doanh thu thuần hôm nay** (kèm số đơn)
     2. **Tiền thực trong quỹ** (tách rõ *Tiền mặt két* + *Ngân hàng*)
     3. **Lãi ròng thật hôm nay** (= Doanh thu − Giá vốn − Chi phí vận hành)
     - Ngay dưới là **Danh sách việc cần xử lý ngay** (*Ca chưa mở / đang mở*, *Hàng dưới định mức*, *Khách quá hạn nợ*, *Đơn chờ đồng bộ*), bỏ hết các khối trang trí thừa.

5. **Nhắc Nợ Thông Minh Kèm Ảnh Thẻ VietQR 1 Chạm:**
   - Trong `Thu chi → Khách nợ` và `Khách hàng`: bấm **`Gửi nhắc nợ QR`** → tự sinh ảnh thẻ VietQR ghi rõ Tên shop, Tên khách, Số tiền còn nợ chính xác và nội dung chuyển khoản → chia sẻ thẳng sang Zalo chỉ bằng 1 chạm.

---

### Đợt 2 — Nghiệp vụ Ngách Độc Bản & Phân Quyền Chi Tiết Thực Thụ *(1 migration DB sạch)*

1. **Bảo Hành Tự Động Theo Serial/IMEI (1 lần quét tra cứu trọn đời):**
   - Migration bổ sung `products.warranty_months integer DEFAULT 0` và `product_serial_codes.warranty_expires_at timestamptz`.
   - Khi bán sản phẩm có `warranty_months > 0`, server tự tính và đóng dấu `warranty_expires_at` ngay trong giao dịch `POST /sales`.
   - Khách quay lại bảo hành → quét mã Serial/QR → hiện ngay thẻ **Trạng thái bảo hành** (*Ngày mua, Mã đơn, Tên khách, Còn bảo hành / Đã hết hạn*).

2. **Phân Quyền Chi Tiết Từng Nhân Viên (Granular RBAC):**
   - Migration bổ sung `store_memberships.permissions jsonb NOT NULL DEFAULT '{}'::jsonb` (tương thích ngược 100% với 4 vai trò hiện có).
   - Chủ shop bật/tắt từng quyền cụ thể cho từng nhân viên:
     - `view_cost_price` (Xem giá vốn)
     - `pos_max_discount_pct` (Giới hạn % giảm giá tối đa trên POS, ví dụ Thu ngân tối đa 5%)
     - `void_or_return_order` (Hủy đơn / Trả hàng)
     - `record_cashbook` (Lập phiếu thu chi)
     - `view_reports` (Xem báo cáo doanh thu & lãi lỗ)
     - `edit_products` (Thêm/sửa hàng & tồn kho)
   - Kiểm tra chặt trên **cả backend middleware (`server/`) lẫn giao diện (`app.js`)**.

3. **Kiểm Kho & Nhập Hàng Quét Liên Tục Bằng Camera:**
   - Dùng chung bộ quét liên tục của Đợt 1 để quét nhập hàng & kiểm kê kho nhanh, tự cộng dồn số đếm thực tế và báo ngay lệch thừa/thiếu theo thời gian thực.

---

### Đợt 3 — Mở Khóa Thu Tiền Thương Mại *(Khi có tài khoản đối tác & hạ tầng)*

1. **Email Production (Resend):** Bật xác minh email, quên mật khẩu, mời nhân viên bằng domain thật (chờ bạn mua gói Resend).
2. **SePay Webhook → Loa Ting Ting Tự Động:** Tiền khách chuyển khoản về tài khoản → SePay báo webhook về Slink → đơn POS tự nhảy trạng thái **Đã thanh toán** + điện thoại tự đọc *"Đã nhận XXX nghìn đồng"*.
3. **Hóa đơn điện tử (HĐĐT) từ máy tính tiền:** Kết nối 1 nhà cung cấp chuẩn trước (**MISA meInvoice** hoặc **Viettel S-Invoice**).
4. **Phát hành Google Play & Gói cước thương mại:** Tạo Release Upload Keystore chính thức, đóng gói thuê bao gọn **99k–149k/tháng** (không phí ẩn, không thu thêm theo chi nhánh nhỏ).

---

## 3. Tiêu chí Nghiệm thu Bắt buộc cho từng Đợt

- **Mọi tính năng mới phải chạy thật end-to-end** (không dữ liệu mẫu, không nút giả, bảo toàn số nguyên VND, transaction nguyên tử, RLS cô lập `store_id`).
- **Kiểm thử tự động:** 100% server tests pass + Playwright E2E trên `390×844` (di động) và `1440×900` (desktop) không tràn ngang / không lỗi console.
- **APK Android thật:** Biên dịch sạch với Gradle, ký APK và kiểm chứng trên điện thoại thật của chủ dự án (camera quét liên tục, loa đọc tiếng Việt, độ sáng màn hình QR, chia sẻ ảnh hóa đơn sang Zalo).
