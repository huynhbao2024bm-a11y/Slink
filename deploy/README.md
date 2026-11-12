# Chuẩn bị hosting Slink

Đích hosting hiện tại theo yêu cầu mới nhất là Render.com. Blueprint Node.js và các điều kiện còn thiếu được ghi ở [`render/README.md`](render/README.md). Web Service đã chạy trên Render; kết nối PostgreSQL production vẫn đang được xử lý. Chứng chỉ CA công khai của Supabase nằm ở `render/supabase-ca.crt`; cách cấu hình TLS được ghi trong hướng dẫn Render.

Hồ sơ Google Compute Engine cũ vẫn được giữ riêng ở [`gcp/README.md`](gcp/README.md); hồ sơ đó chưa được triển khai và không tự động áp dụng cho Render.

Slink phục vụ frontend và API từ cùng một tiến trình Node.js. Dịch vụ Render đã chạy và trang gốc phản hồi HTTP 200; kết nối Supabase bằng TLS vẫn cần cấu hình CA, sau đó còn phải xử lý/xác minh role, schema, migrations, backup và restore trước khi dùng dữ liệu thật.

Không gửi secret, mật khẩu, private key hoặc token trong chat. Việc tạo dịch vụ Render cần xem lại chi phí và chỉ thực hiện khi người dùng yêu cầu triển khai.

## Chế độ demo bỏ qua xác minh email

Để trình diễn có kiểm soát khi chưa có domain gửi thư, thêm biến môi trường `DEMO_DISABLE_EMAIL_VERIFICATION=true` trong Render rồi lưu và deploy lại dịch vụ. Giá trị mặc định là `false`; không cần cấu hình dịch vụ email để API khởi động khi chế độ demo này bật. Đăng ký chủ cửa hàng sẽ tạo phiên đăng nhập ngay. Tài khoản chủ đang chờ xác minh cũng có thể đăng nhập bằng đúng email và mật khẩu đã đăng ký.

Chế độ này chỉ bỏ bước xác minh cho đăng ký chủ cửa hàng tự tạo; lời mời nhân viên và đặt lại mật khẩu vẫn cần email. Mọi người có thể khai báo email bất kỳ khi tạo tài khoản, vì vậy chỉ bật để trình bày với dữ liệu demo, không dùng cho cửa hàng/khách hàng thật. Khi tắt chế độ này, tài khoản demo chưa xác minh cần dùng “Gửi lại email xác nhận” sau khi dịch vụ email hoạt động để tiếp tục đăng nhập.
