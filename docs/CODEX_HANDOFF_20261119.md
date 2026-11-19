# Slink — Bàn giao cho Codex & Phân tích toàn diện lộ trình Production thương mại (2026-11-19)

> **Điểm đồng bộ `origin/main`:** `e75c136` (sau PR #54 `android-v0.4.0`, PR #55 `android-v0.4.1`, PR #56 handoff và **PR #57 `android-v0.4.2`**).
> **Bản APK chính thức mới nhất:** [`android-v0.4.2`](https://github.com/huynhbao2024bm-a11y/Slink/releases/tag/android-v0.4.2) (`versionCode: 3012`, SHA-256 `4bb9fd0a750defbe552bfdcf3e21f1dd96d1adbeaffb2fd05463bde4a1b78645`, `4.77 MB`, `Slink.apk` + `android-update.json`).
> **Migration production:** `20261119140000_product_serial_codes.sql` đã chạy thành công trên production DB qua `production-migrate.yml` (run `44510673776`). **PR #57 không thêm migration DB mới.**

---

## 1. Tóm tắt bàn giao để Codex tiếp nối ngay trên `main`

Codex chỉ cần `git fetch origin main && git checkout -b <nhánh-mới> origin/main` — **không** cần kéo nhánh cũ hay xử lý xung đột. Các thay đổi đã gộp sạch vào `main`:

1. **Quản lý từng mã riêng (Serial / IMEI — 1 mã = 1 đơn vị) — PR #54 (`27eba99`):**
   - Migration: `server/migrations/20261119140000_product_serial_codes.sql` (`products.serial_tracked`, bảng `product_serial_codes` có forced RLS `app.store_id`, `GRANT SELECT, INSERT, UPDATE TO slink_app`).
   - Backend: `server/serials.js` (`GET /serials/lookup`, `GET /products/:id/serials`, `POST /products/:id/serials` bắt buộc `idempotency-key` + khóa kho + chống trùng mã/barcode/SKU), `server/sales.js` (khóa `FOR UPDATE`, trả `409 serial_already_sold` khi quét lại mã đã bán, chặn bán ngoại tuyến trên hàng mã riêng), `server/returns.js` & `server/records.js` (khôi phục mã về `in_stock` khi trả hàng có nhập lại kho hoặc hủy đơn), chặn các thao tác lệch tồn theo số lượng thuần trên hàng `serial_tracked` (`server/stock.js`, `server/purchases.js`, `server/warehouses.js`, `server/exchanges.js`, `server/offline-conflicts.js`).
   - Quét & in mã không số / QR: camera `BarcodeDetector` bật toàn bộ chuẩn 1D + 2D (`qr_code`, `code_128`, `code_39`, `code_93`, `codabar`, `ean_13`, `ean_8`, `upc_a`, `upc_e`, `itf`, `data_matrix`, `pdf417`, `aztec`, 1–120 ký tự); `barcode-tools.js` tự chuyển sang QR SVG cho mã tiếng Việt / >80 ký tự.
   - Hàng hóa & nhập file: Form Thêm hàng 2 chế độ rõ ràng (`Hàng thường` / `Từng mã riêng Serial-IMEI`), nút `＋ Thêm tồn / Quét mã` & `Danh sách mã riêng` trên từng sản phẩm, nhập CSV hỗ trợ `,`/`;`, tự sinh SKU khi trống, nhận giá định dạng `150.000` và cột `Danh sách mã riêng (Serial/IMEI)`.
2. **Tinh gọn POS tại chỗ chuẩn Sapo & kiểm thử thao tác trực tiếp — PR #55 (`d08cb9d`):**
   - POS thống nhất còn 2 tab rõ ràng: **`Tại quầy`** (nhiều đơn chờ `Đơn 1 / Đơn 2`, mệnh giá gợi ý 1 chạm, tính tiền thối tức thì, `Hiện mã VietQR` tĩnh 1 chạm không cần API) và **`Giao hàng`** (1 cột rộng rãi cho tự ship / COD thủ công).
   - Ẩn `Kênh bán / Bán online` khỏi menu, cài đặt và `Quản lý`; mở sẵn 2 nhóm `Bán hàng & Kho` và `Quản trị cửa hàng`.
   - Ẩn các nút/cấu hình bên thứ ba chưa kết nối (`Xuất HĐĐT`, `Tạo vận đơn GHN`, `MoMo`, webhook SePay/MISA) cho đến khi cửa hàng thực sự bật cấu hình; lược bỏ các dòng giải thích lặp lại.
   - Đã sửa 6 lỗi thực tế phát hiện qua phiên QA thao tác trực tiếp trên trình duyệt thật (`Enter` trong `#serial-rapid-input`, dòng `Còn khoản phải thu` chi tiết đơn, tiêu đề `Đơn 1` đè tab, toast che nút thanh toán, form Giao hàng 1 cột, tự xóa `#pos-search` khi chặn mã đã bán).
3. **Hoàn thiện Sẵn sàng thương mại Production (Tracks B, C, D, E) — PR #57 (`e75c136` · `android-v0.4.2`, `versionCode: 3012`):**
   - **Track B (Hạ tầng sao lưu, Diễn tập khôi phục & Uptime Monitor):**
     - `.github/workflows/production-backup.yml`: lịch 02:00 VN hằng ngày (`0 19 * * *`) + `workflow_dispatch`, chạy `scripts/postgres-backup.js create` + `verify` (AES-256-GCM, `BACKUP_DATABASE_URL`, `SLINK_BACKUP_ENCRYPTION_KEY`, `SLINK_BACKUP_KEY_ID`, `SLINK_BACKUP_DIR`), ghim SHA bất biến cho `actions/upload-artifact` (`ea165f8d65b6e75b540449e92b4886f43607fa02`), không nội suy trực tiếp input trong bash `run:`.
     - `.github/workflows/uptime-monitor.yml`: kiểm tra `/api/ready` mỗi 15 phút, mở/cập nhật GitHub Issue deduped khi lỗi + hỗ trợ `ALERT_WEBHOOK_URL` (build JSON bằng `node -e JSON.stringify`).
     - `scripts/restore-drill.js`: export `runLogicalRestoreDrill()` diễn tập mã hóa AES-256-GCM → kiểm SHA-256 → giải mã → phục hồi vào PGlite mới và đo RTO.
   - **Track C (Pháp lý & Chính sách bảo mật Nghị định 13/2023/NĐ-CP):**
     - `legal-content.js` (đã thêm vào `Dockerfile`, `server/index.js` `ASSETS`, `index.html`, `scripts/android-assets.js`, `MainActivity.java` `WEB_FILES`): phục vụ công khai `GET /legal/terms`, `GET /legal/privacy` và modal xem trong app (chân trang Đăng nhập + `Cài đặt → Dữ liệu & sao lưu`).
   - **Track D (Cầu nối máy in nhiệt Bluetooth ESC/POS 58mm/80mm trên Android APK):**
     - `android/app/src/main/java/com/slink/retail/BluetoothEscPosPrinter.java`: RFCOMM SPP (`00001101-0000-1000-8000-00805F9B34FB`), xác thực `BluetoothAdapter.checkBluetoothAddress` + bắt buộc thiết bị nằm trong `getBondedDevices()`, lưu máy in qua `SharedPreferences`.
     - `android/app/src/main/java/com/slink/retail/MainActivity.java` & `AndroidManifest.xml`: xin quyền `BLUETOOTH_CONNECT` (Android 12+) / `BLUETOOTH` (`maxSdkVersion=30`), thực thi in trên `ExecutorService` đơn tuần tự (`btExecutor`, `shutdownNow()` trong `onDestroy`), chặn trùng `pendingBtRequest`, phản hồi `{ id, status: "ok", printer, devices }` (và `app.js` `SlinkAndroid.onmessage` đã xử lý `status === 'ok'`).
     - `escpos-printer.js`, `integrations-ui.js`, `app.js`: tự nhận diện Android APK (`caps.btSupported`) hiển thị **Máy in nhiệt Bluetooth (58mm / 80mm)** + hộp thoại chọn máy in đã ghép đôi; Desktop Chrome giữ Web Serial USB/COM.
   - **Track E (Trả hàng chọn đúng từng mã Serial, Chuyển kho mã Serial nguyên tử & Kiểm thử tải tranh chấp):**
     - `server/records.js` (`GET /orders/:orderId`): trả thêm `sold_serial_codes` trên từng dòng `order_lines`.
     - `server/returns.js` (`POST /orders/:orderId/returns`): hỗ trợ `serialCodes[]` (chống trùng mã giữa các dòng trả trong cùng yêu cầu), hoàn kho đúng các mã được tích chọn; nếu `restockPolicy` là `damaged`/`discarded` tự chuyển mã sang `status = 'archived'`.
     - `server/serials.js`: thêm `POST /api/stores/:storeId/serials/transfer` (CSRF + mandatory `idempotency-key` + `EDIT_ROLES` + `canAccessWarehouse` cả 2 kho, kiểm tra `on_hand - reserved`, khóa đúng thứ tự chuẩn `warehouses → products → inventory_balances → product_serial_codes` khớp `sales.js` để tránh deadlock `40P01`, ghi đủ `transfer_out`/`transfer_in` + `audit_events`), kèm modal `Chuyển kho` ngay trong danh sách mã riêng (`app.js`).
     - `server/test/production-readiness.test.js`: 5 bài test mới bao phủ restore drill, `/legal/terms` & `/legal/privacy`, trả hàng chọn đúng mã `RET-S1` (chặn bán lại `RET-S2`), chuyển kho mã riêng A→B, và **đua 10 luồng `POST /sales` đồng thời trên cùng 1 mã riêng** (`1 × 201` + `9 × 409`).
4. **Bằng chứng kiểm thử & Rà soát kép mới nhất (sau PR #57):**
   - `97/97` bài kiểm tra máy chủ (`node --test server/test/*.test.js`) đạt (0 lỗi / 0 bỏ qua).
   - Playwright E2E `e2e/commercial-responsive.js` đạt trên cả `390×844` và `1440×900` (0 tràn ngang, 0 lỗi console/5xx).
   - Dual review (`code-reviewer` + `security-reviewer`) đã xử lý toàn bộ CRITICAL/HIGH/MEDIUM.
   - GitHub CI PR #57 xanh 2/2 (`API and schema acceptance` + `Production container build`), APK `0.4.2` (`3012`) biên dịch & phát hành thành công.
5. **Những đầu mục còn chờ bên ngoài (Codex lưu ý không tự chế/không đụng khi chưa có thông tin user):**
   - **Email thật (Resend):** User sẽ mua gói Resend sớm và cấp key/domain; hiện chưa đổi `EMAIL_DELIVERY_URL`.
   - **GitHub Secret sao lưu:** Cần user thêm `SLINK_BACKUP_ENCRYPTION_KEY` (32-byte base64) vào Environment `production-migrations` để lịch 02:00 sáng chạy thật.
   - **Google Play Keystore (Track A):** User đang test trên điện thoại thật qua APK ký nội bộ; sẽ mua tài khoản Play Console sau.
   - **Máy in Bluetooth thật (Track D):** Cầu nối native + UI đã sẵn sàng trong `v0.4.2`, chờ user có máy in thật để test vật lý.
   - **Tracks F (Gói cước/thuê bao) & G (SePay/MoMo/HĐĐT):** User yêu cầu **tạm hoãn**, bổ sung sau — không tự ý triển khai trước.

---

## 2. Phân tích toàn diện: Từ hiện tại đến Production thương mại thực tế còn cần làm gì?

Đối chiếu 7 cổng nghiệm thu trong [`docs/BUILD_CHARTER.md`](./BUILD_CHARTER.md) trên 7 góc độ:

| Góc độ | Đã đạt tới đâu | Khoảng trống cần chốt trước khi thu tiền khách hàng thật | Mức ưu tiên |
| --- | --- | --- | --- |
| **1. Nghiệp vụ bán lẻ tại chỗ (Core POS & Kho)** | Bán tại quầy, nhiều đơn, mã riêng Serial/IMEI, VietQR tĩnh, giao hàng COD thủ công, trả/đổi hàng, thu chi/sổ quỹ/ca tiền mặt, công nợ KH/NCC, nhập CSV đều đã chạy thật với transaction nguyên tử. | - Trả hàng 1 phần cho đơn có nhiều mã Serial nên cho chọn đích danh mã khách trả lại (hiện khôi phục theo thứ tự LIFO).<br>- Chuyển kho cho sản phẩm Serial/IMEI (chọn mã chuyển giữa 2 kho).<br>- Bổ sung kiểm thử chịu tải đồng thời (nhiều thu ngân quét cùng lúc) trên PostgreSQL thật. | **Cao** |
| **2. Trải nghiệm thiết bị thật (iOS & Android 10+)** | Đã có APK ký số `v0.4.1`, E2E Playwright `390×844` & `1440×900`, và QA trực tiếp trên Chrome desktop. | - **Chưa nghiệm thu trên điện thoại thật** (Android 10–15 + iPhone Safari/PWA): kiểm tra camera quét thực tế (điều kiện ánh sáng yếu, mã nhỏ/mã mờ), bàn phím ảo che nút lưu, độ trễ mạng 4G yếu, và chế độ mất mạng -> có mạng đồng bộ lại.<br>- **Cảnh báo khóa ký Android:** APK hiện ký bằng `debug.keystore` nội bộ (tốt cho test nội bộ, **không thể đưa lên Google Play**). Cần tạo Upload Keystore chính thức (lưu mật trong vault/GitHub Secrets) trước khi phát hành rộng rãi. | **Rất cao** |
| **3. Hạ tầng Cloud, Dữ liệu & Phục hồi sự cố (DR)** | Đã có Dockerfile non-root, PostgreSQL phân quyền `slink_app` + forced RLS, workflow `production-migrate.yml`, công cụ backup mã hóa AES-256-GCM. | - **Chưa diễn tập khôi phục (Restore Drill)** từ file backup mã hóa sang một DB trống để đo thời gian phục hồi (RTO) và chứng minh không mất dữ liệu (RPO).<br>- Chưa có **giám sát & cảnh báo tự động** (uptime monitor `/api/ready`, cảnh báo lỗi 5xx, chậm truy vấn, đầy dung lượng DB, Sentry/log tập trung).<br>- Cần bật lịch **backup tự động hằng ngày** (offsite encrypted) và kiểm tra tên miền riêng + TLS ổn định. | **Rất cao** |
| **4. Bảo mật, Email thật & Chống lạm dụng** | Đã có CSRF, RBAC, forced RLS, idempotency key, rate-limit cơ bản, lịch sử phiên đăng nhập, rà soát kép code/security. | - **Dịch vụ Email production (Resend / Postmark / SES):** xác thực domain SPF/DKIM/DMARC để thư xác nhận đăng ký, quên mật khẩu và mời nhân viên vào Inbox thay vì Spam.<br>- Rà soát chính sách quyền riêng tư, điều khoản sử dụng, quy trình xóa tài khoản / xuất dữ liệu khách hàng theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.<br>- Kiểm thử thâm nhập (pentest) nhẹ luồng auth, đổi mật khẩu, mời nhân viên và cô lập đa cửa hàng trên môi trường production thật. | **Cao** |
| **5. Phần cứng quầy thu ngân (Máy in & Máy quét)** | Đã có ESC/POS Web Serial (máy tính USB/COM), in tem mã vạch/QR qua trình duyệt, máy quét USB HID (giả lập bàn phím). | - Kiểm thử thực tế trên ít nhất 1 máy in nhiệt 58mm/80mm phổ thông (Xprinter/Zywell) và 1 máy quét mã vạch cầm tay USB/Bluetooth tại quầy.<br>- Trên Android APK: nếu chủ shop dùng máy in nhiệt **Bluetooth** (rất phổ biến ở Việt Nam), cần bridge in Bluetooth trong `android/` (Web Serial hiện chỉ chạy trên Chrome máy tính). | **Trung bình – Cao** |
| **6. Thương mại hóa, Thu phí & Hỗ trợ khách hàng** | Chưa có gói cước, giới hạn dùng thử, cổng thu phí thuê bao của chính Slink. | - Thiết kế mô hình gói (ví dụ: Miễn phí giới hạn / Pro theo tháng-năm) và cơ chế gia hạn / nhắc hết hạn (ban đầu có thể dùng VietQR thu phí chuyển khoản + kích hoạt thủ công trước khi tự động hóa cổng thanh toán).<br>- Kênh hỗ trợ chính thức (Zalo OA / Hotline / hướng dẫn nhanh 3 phút bằng video/ảnh) và quy trình xử lý sự cố khi khách đang bán hàng. | **Cao (trước khi bán đại trà)** |
| **7. Tích hợp bên thứ ba (Chỉ bật khi đối tác duyệt xong)** | Đã tách sạch khỏi giao diện bán tại chỗ để không gây rối; mã nguồn nền cho SePay/MoMo/GHN/HĐĐT đã chuẩn bị sẵn. | - Khi nào có nhu cầu thực tế & hồ sơ pháp nhân: duyệt SePay/Casso (đối soát chuyển khoản tự động), tích hợp HĐĐT (MISA/Viettel/VNPT theo quy định thuế từng hộ/doanh nghiệp), và bật lại giao vận GHN/GHTK khi mở rộng bán online. | **Tùy chọn giai đoạn 2** |

---

## 3. Lộ trình đề xuất 3 chặng ngắn để ra mắt thương mại an toàn

1. **Chặng 1 — Thử nghiệm thực tế 1–3 cửa hàng thí điểm (Pilot 1–2 tuần):**
   - Cài APK `v0.4.1` lên điện thoại Android thật + mở web trên iPhone/máy tính tại 1 cửa hàng thật.
   - Chạy thử 1 tuần bán thật (tạo hàng, quét mã bằng camera & máy quét, mở/chốt ca tiền mặt, trả hàng, thu nợ) để bắt hết các điểm vướng đời thực.
   - Đồng thời chốt: Email domain thật (Resend), lịch backup tự động + 1 lần diễn tập restore DB, và uptime alert `/api/ready`.
2. **Chặng 2 — Chốt độ bền & phần cứng quầy (1–2 tuần):**
   - Tạo Release Keystore chính thức cho Android (sẵn sàng lên Google Play / cài đặt ổn định lâu dài).
   - Bổ sung in bill Bluetooth trong Android APK (nếu cửa hàng pilot dùng máy in Bluetooth), cho chọn đích danh mã Serial khi trả hàng 1 phần, và kiểm tra hiệu năng truy vấn trên PostgreSQL thật.
3. **Chặng 3 — Mở bán thương mại (Launch):**
   - Hoàn thiện Điều khoản / Chính sách bảo mật, gói giá + quy trình kích hoạt thuê bao, kênh hỗ trợ Zalo OA, rồi mới mở rộng dần các kết nối tự động (SePay tự động báo nhận tiền, HĐĐT) theo nhu cầu khách trả phí.
