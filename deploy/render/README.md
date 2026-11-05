# Chuẩn bị hosting Slink trên Render

## Trạng thái

Ngày 04/11/2026, bản đang chạy trên Render là `99d6573` (PR #37), với schema production tới `0026`. Bản ngoại tuyến cần chạy migration `0027` trước khi đưa runtime mới vào main để Render triển khai. Kiểm tra mục phát hành bên dưới; trạng thái triển khai phải được xác nhận lại trên Render.

## Kiến trúc

Một tiến trình Node.js phục vụ cả frontend và API trên cùng origin. Render cần một Web Service; server bind 0.0.0.0 và cổng PORT Render cấp. Blueprint dùng Node.js 24.22.0 và health check /api/ready.

Supabase Direct connection của dự án trả IPv6 trong khi Render Web Service hiện cần IPv4. APP_DATABASE_URL cần dùng nguyên URI Session pooler từ mục Connect của Supabase, không tự ghép hostname, username hay port.

## CA và TLS cho Supabase

CA gốc công khai Supabase được lưu ở deploy/render/supabase-ca.crt. Trên dịch vụ Render, cấu hình:

```text
PG_SSL=ca-file
PG_SSL_CA_FILE=/opt/render/project/src/deploy/render/supabase-ca.crt
```

APP_DATABASE_URL phải là URI Session pooler được cấp từ Supabase. Nếu URI có tham số query sslmode hoặc sslrootcert, bỏ các tham số đó khi dùng chế độ CA-file. Slink vẫn xác minh chứng chỉ máy chủ (rejectUnauthorized=true). Không đặt NODE_TLS_REJECT_UNAUTHORIZED=0 và không tắt xác minh TLS.

Tệp CA là chứng chỉ công khai, không chứa khóa riêng; chứng chỉ hiện tại hết hạn ngày 26-04-2031. Thay tệp khi Supabase đổi CA hoặc trước hạn này. Mật khẩu chỉ lưu trong Render Environment và tuyệt đối không commit vào repo hay gửi trong chat.

## Thiết lập trên Render

Sau khi commit chứa CA có trên nhánh dịch vụ:

1. Trong Render → Slink → Environment, đặt PG_SSL=ca-file và PG_SSL_CA_FILE=/opt/render/project/src/deploy/render/supabase-ca.crt.
2. Đặt APP_DATABASE_URL bằng URI Session pooler mới lấy từ Supabase Connect. Nếu mật khẩu database từng xuất hiện trong ảnh/chia sẻ, hãy đổi mật khẩu ở Supabase trước rồi chỉ cập nhật giá trị mới trong Render.
3. Lưu biến và deploy commit mới nhất (nếu Render chưa tự deploy).
4. Mở /api/ready và xem log. Hết SELF_SIGNED_CERT_IN_CHAIN chỉ xác nhận TLS; nếu báo lỗi role, bảng hoặc migration thì phải xử lý riêng trước khi dùng dữ liệu thật.

Migrations tới0026 đã có bằng chứng chạy production ở đợt trước;0027 chưa chạy trên production trong đợt này. APP_DATABASE_URL phải thuộc role ứng dụng giới hạn quyền; không dùng role quản trị. Migrations cần backup đã xác minh và role riêng có đúng quyền. Trên Supabase, kiểm tra role/preflight trước khi chạy bất kỳ migration nào vì một vài migration yêu cầu BYPASSRLS.

## Biến production

Giữ PUBLIC_ORIGIN là HTTPS origin thực của Slink. Email xác minh/khôi phục cần EMAIL_DELIVERY_URL, EMAIL_DELIVERY_TOKEN và EMAIL_FROM trong Render Environment. Với Resend, EMAIL_FROM phải là địa chỉ thuộc domain đã xác minh, ví dụ `Slink <no-reply@your-domain>`. MIGRATION_DATABASE_URL chỉ dùng trong quy trình migration được kiểm soát, không đặt vào tiến trình web service.

## Còn thiếu trước pilot

Sau khi readiness kết nối thành công, vẫn cần xác nhận schema/migrations và quyền database, backup/restore, gửi email, tạo tài khoản thử, đăng nhập, rồi thử luồng nghiệp vụ trên dữ liệu được phép. Chưa có bằng chứng dùng được trên iOS/Android 10+ hay nghiệm thu bởi cửa hàng thật.

## Tài liệu nhà cung cấp

- [Render Web Services](https://render.com/docs/web-services)
- [Render Blueprint YAML](https://render.com/docs/blueprint-spec)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase IPv4 support](https://supabase.com/docs/guides/platform/ipv4-address)
- [Supabase SSL configuration](https://supabase.com/docs/guides/platform/ssl-enforcement)

## Chế độ demo bỏ qua xác minh email

Để trình diễn khi chưa có dịch vụ gửi thư, đặt `DEMO_DISABLE_EMAIL_VERIFICATION=true` trong Render rồi deploy lại mã mới. Giá trị mặc định là `false`. Khi bật, chủ cửa hàng có thể đăng ký và đăng nhập ngay; tài khoản chủ đang chờ xác minh cũng có thể đăng nhập bằng đúng email và mật khẩu đã đăng ký.

Chế độ này chỉ bỏ xác minh email cho đăng ký chủ cửa hàng. Email vẫn không được ghi nhận là đã xác minh; lời mời nhân viên và đặt lại mật khẩu vẫn cần email. Tài khoản và cửa hàng vẫn được lưu trong Supabase, nên chỉ dùng email/dữ liệu demo. Tắt cờ này khi không còn trình diễn; tài khoản chưa xác minh cần xác minh email trước khi đăng nhập lại.

## Phát hành bản ngoại tuyến (0027)

Bản runtime offline cần `0027_offline_operations.sql`, gồm receipt chỉ thêm mới và thời gian giao dịch theo transaction. Chạy workflow `Prepare production database` từ đúng nhánh phát hành, bằng role migrator và với tham chiếu bản sao lưu đã xác minh, trước khi gộp main. Runtime mới sẽ từ chối schema còn thiếu `0027`. Đợt 04/11 đã thử trên PostgreSQL 18.6 local bằng hai role riêng; kiểm tra lịch sử workflow và schema production để xác nhận bước chạy trên Supabase.

Thứ tự phát hành: kiểm tra CI, sao lưu, áp dụng migration, gộp main, theo dõi deploy và xác minh `/api/ready`. Không cần biến môi trường mới để bật offline. Thiết bị phải đăng nhập và tải dữ liệu khi có mạng trước; chứng từ được giữ trên máy và gửi khi ứng dụng đang mở/có kết nối. Đổi trả, chuyển kho, sửa danh mục, quản lý tài khoản và kết nối bên ngoài vẫn cần mạng. Khi có chứng từ xung đột, hệ thống giữ nguyên để kiểm tra và dừng các chứng từ tiếp theo; không tự đổi giá hoặc bỏ chứng từ. Build Docker và kiểm thử local không thay thế bằng chứng Render hoặc thử trên điện thoại thật.
