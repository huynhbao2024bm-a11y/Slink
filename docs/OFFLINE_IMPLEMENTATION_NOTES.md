# Handoff — offline và responsive, 04/11/2026

## Kết quả phát hành 05/11/2026

Đã xác minh bản sao lưu Supabase mới, chạy migration 0027 qua GitHub Actions 42024846890, gộp PR #38 tại `427ed78` và kiểm tra Render live. Production trả readiness 200. Trang chính, service worker và ba tệp offline trả 200, đúng bản mới. Bằng chứng và việc còn mở ghi ở mục 05/11 trong DELIVERY_ROADMAP.md. Các dòng “chưa phát hành” bên dưới là lịch sử trước lần triển khai này.

## Cập nhật phát hành 04/11/2026

User đã yêu cầu đưa lên GitHub và tự đánh giá vận hành. Đã fast-forward từ main99d6573 (cùng tree với2d6be6e), commit7cdb820 đúng25tệp, push codex/offline-operations-20261103 và mở PR38. CI41844000885 đạt API/schema và container. Không publish docs hoặc dữ liệu thử. Chưa merge: Supabase projectgiuraqrlmqdocrvwaqna còn0026, chưa có offline_operation_receipts. Đã yêu cầu backup mới bằng helper gốc D:/Slink/scripts/postgres-backup-supabase.ps1; cửa sổ mở không thấy nên đã gửi lệnh để user tự mở/nhập mật khẩu riêng. Backup mới nhất nhìn thấy vẫn26/10. Sau backup verify: dispatch production-migrate.yml từ nhánh phát hành với reference thật, xác minh0027/role/checksum, merge khi đúng headCIđạt, kiểm Rendermain/deploy/readiness/assets. Không chạy runtime trước schema.

Đánh giá mới OPERATIONAL_REVIEW_20261104.md nêu P1 còn thiếu luồng chủ giải quyết conflictoffline thật (giá/tồn/ca thay đổi), online/affiliate chưa đủ đầu-cuối, đổi hàng/trả nhà cung cấp và kiểm thiết bị/restore. Những đoạn “chưa commit/push” bên dưới là snapshot trước cập nhật này. Không gọi toàn bộ sản phẩm đã đủ giao khách.

## Nguồn hiện tại

- D:/Slink/.local-data/first-sale-release, nhánh codex/offline-operations-20261103 từ main2d6be6e. Root D:/Slink có việc cũ: không reset/đẩy nguyên root. Docs chỉ lưu local.
- Đã hoàn thành triển khai sáu nhóm write/cache/sync và các sửa bố cục, kiểm cục bộ theo OFFLINE_OPERATIONS.md. Chưa commit/push/merge/migrate production/deploy. Chỉ phát hành khi người dùng yêu cầu; không tự đẩy liên tục.
- User muốn sửa nhiều chỗ lệch giao diện trong cùng đợt. Đã sửa tablet danh sách hàng, phone tên dài/giá lớn, đồng nhất card khi tìm/clear, giữ giỏ/focus/scroll khi async render và height fallback cho trình duyệt chưa có dvh.

## Cấu trúc cần giữ

- offline-store.js: IndexedDB, snapshot cache/outbox/epoch nguyên tử, domain validation trong enqueue, lease, immutable delivery, confirmed + atomic cache/ack, warm replace nguyên tử.
- offline-ledger.js: integer VND/milli quantity, per-warehouse balances và global product version/cost, projection hàng/đơn/nợ/quỹ/ca, nhật ký cần kiểm tra. Không bỏ frozen metadata để “chữa” conflict.
- offline-sync.js: authenticate thật, tuần tự, ánh xạ logical cash session sang ID thật, backoff/lease/heartbeats. Server commit mất response vẫn replay cùng key. Không ack khi cache refresh chưa xong.
- app.js: sáu write mới vào outbox trước network, marker phân biệt pending legacy; response provisional có offlineQueued. Pending legacy không tự enrich. Tiền chuyển khoản/QR/thẻ vẫn nhân viên xác nhận thủ công. Mã ưu đãi online. Unsupported shared writes chờ queue xong.
- Cache GET không được làm mới base khi còn pending; read dùng snapshot+projection. Dữ liệu thiếu phải báo tải/đồng bộ, không đọc canonical mới rồi cộng lại phần đã confirmed. Warm bị epoch/queue guard, cache ảnh đúng user/version.
- Signup demo phải nhớ identity ngay từ response register, không chờ login lần2. Lựa chọn business profile đã được server nhận phải cập nhật stores trong metadata cache, không đổi verifiedAt chỉ vì đọc cache.
- Server helper/migration0027: time GUC local transaction, actor/cash/price/version checks, append-only receipts. migrate.js và pglite-runtime.js giữ revoke sau broad table grants.
- SW hash được server tính từ toàn bộ tài nguyên shell; worker cache-first shell trọn bộ, ảnh network-first có fallback. Dev chỉnh tệp cần restart server để hash mới; production image/files bất biến.

## Bằng chứng và cách lặp lại

- offline-evidence/full-test-final.log:56/56. postgres-test.log:3/3 PostgreSQL18.6 thật, role riêng và concurrent sale.
- Scripts ngoài repo: offline-evidence-setup.cjs → offline-flow-check.cjs → offline-lost-response-check.cjs → offline-conflict-check.cjs. Chạy theo thứ tự để identity/storage fixture khớp; setup mới sẽ thay identity file của lần thử.
- offline-integrity-check.cjs dùng IDB thật ở2tab, quota và cache fence. offline-layout-setup.cjs tạo fixture130hàng/ảnh/tên dài, offline-layout-check.cjs có115checks. offline-persistent-check.cjs dùng persistent profile và đóng hẳn browser. offline-cart-regression.cjs thử delayed response và giỏ30dòng. offline-registration-check.cjs dùng demo server3015 riêng.
- Kết quả JSON cùng ảnh trong D:/Slink/.local-data/offline-evidence và offline-layout-evidence. Cookie/profile test không công khai. Không dùng storageState cookie-only để chứng minh IDB: dùng persistent profile hoặc indexedDB:true.
- Harness cần chờ IDB/preparation bằng poll await page.evaluate. Dữ liệu UI có bản desktop ẩn và mobile hiện; chọn đúng locator visible. Focus được khôi phục ở RAF, phải chờ điều kiện focus trước assertion.
- offline-postgres-check.cjs tạo container PG18.6 loopback riêng, hai test parity và một concurrency test, rồi dừng/xóa container. Không dùng APP_DATABASE_URL/Supabase production.

## Môi trường để xem tiếp

- Preview http://127.0.0.1:3011, NODE_ENV=development, data D:/Slink/.local-data/easy-ui-dev; giữ dữ liệu cũ. Log calm-redesign/preview.log. Khi restart cuối dùng đúng source ở trên.
- Test3014 data offline-acceptance-db, log calm-polish/offline-test-server.log. Demo3015 data offline-demo-acceptance-db với DEMO_DISABLE_EMAIL_VERIFICATION=true. Hai test server chỉ cần mở khi lặp test; không áp dụng demo flag vào môi trường khác.
- Playwright D:/Slink/.local-data/ui-check-tools/node_modules/playwright; Edge C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe.
- Docker image local slink:offline-local-20261104; runtime target đã build. Không có deploy thật từ đợt này.

## Còn lại khi được yêu cầu

- Kiểm điện thoại thật, bàn phím/OS lifecycle và khối lượng lịch sử lớn. Edge emulation không thay thiết bị thật.
- Rà diff lần cuối trước khi publish, không đưa docs, fixture, token, profile hoặc dữ liệu test. Migration0027 production phải chạy bằng workflow có backup trước runtime mới; đừng chỉ push khiến startup thiếu schema.
- Sau phát hành phải xác minh Render đúng commit, readiness và một ca dùng được phép. Đánh giá sản phẩm chung/online/affiliate/backup và cổng giao khách vẫn theo DELIVERY_ROADMAP, không đánh dấu hoàn tất toàn bộ.

## Trạng thái cuối lượt

Preview3011 đã restart với mã cuối; /api/ready trả200 và /sw.js có hash bundle thật. Test servers3014/3015 đã dừng. Docker image cuối đã đối chiếu SHA256 của8tệp quan trọng với source, đều khớp; evidence container-files.json. Lint giao diện0FAIL/1WARN đã giải thích, diff check không có lỗi whitespace. Chưa commit/push/deploy. Hai bài học tổng quát đã lưu vào AGENTS.md toàn cục, không chứa tên hay ý tưởng dự án.
