# Chuẩn bị hosting Slink trên Render

## Trạng thái

Web Service Slink đã được tạo trên Render; trang gốc đã trả HTTP 200. Các request đăng nhập/đăng ký hiện lỗi xác minh TLS khi nối tới Supabase. Vì vậy chưa xác nhận database, đăng nhập hay giao dịch production hoạt động.

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

Chưa chạy migrations trên database production. APP_DATABASE_URL phải thuộc role ứng dụng giới hạn quyền; không dùng role quản trị. Migrations cần backup đã xác minh và role riêng có đúng quyền. Trên Supabase, kiểm tra role/preflight trước khi chạy bất kỳ migration nào vì một vài migration yêu cầu BYPASSRLS.

## Biến production

Giữ PUBLIC_ORIGIN là HTTPS origin thực của Slink. Email xác minh/khôi phục cần EMAIL_DELIVERY_URL và EMAIL_DELIVERY_TOKEN trong Render Environment. MIGRATION_DATABASE_URL chỉ dùng trong quy trình migration được kiểm soát, không đặt vào tiến trình web service.

## Còn thiếu trước pilot

Sau khi readiness kết nối thành công, vẫn cần xác nhận schema/migrations và quyền database, backup/restore, gửi email, tạo tài khoản thử, đăng nhập, rồi thử luồng nghiệp vụ trên dữ liệu được phép. Chưa có bằng chứng dùng được trên iOS/Android 10+ hay nghiệm thu bởi cửa hàng thật.

## Tài liệu nhà cung cấp

- [Render Web Services](https://render.com/docs/web-services)
- [Render Blueprint YAML](https://render.com/docs/blueprint-spec)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase IPv4 support](https://supabase.com/docs/guides/platform/ipv4-address)
- [Supabase SSL configuration](https://supabase.com/docs/guides/platform/ssl-enforcement)
