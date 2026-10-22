# Chuẩn bị hosting Slink

Đích hosting hiện tại theo yêu cầu mới nhất là Render.com. Blueprint Node.js và các điều kiện còn thiếu được ghi ở [`render/README.md`](render/README.md). Chưa kết nối GitHub với Render, tạo tài nguyên, nhập secret hoặc deploy.

Hồ sơ Google Compute Engine cũ vẫn được giữ riêng ở [`gcp/README.md`](gcp/README.md); hồ sơ đó chưa được triển khai và không tự động áp dụng cho Render.

Slink đã phục vụ frontend và API từ cùng một tiến trình Node.js. Cần giải quyết tương thích vai trò migration/backup với cơ sở dữ liệu được chọn trước khi tạo dịch vụ công khai.

Không gửi secret, mật khẩu, private key hoặc token trong chat. Việc tạo dịch vụ Render cần xem lại chi phí và chỉ thực hiện khi người dùng yêu cầu triển khai.

## Chế độ demo bỏ qua xác minh email

Để trình diễn khi chưa có dịch vụ gửi thư, đặt `DEMO_DISABLE_EMAIL_VERIFICATION=true` trong Render rồi deploy lại mã mới. Giá trị mặc định là `false`. Khi bật, chủ cửa hàng có thể đăng ký và đăng nhập ngay; tài khoản chủ đang chờ xác minh cũng có thể đăng nhập bằng đúng email và mật khẩu đã đăng ký.

Chế độ này chỉ bỏ xác minh email cho đăng ký chủ cửa hàng. Email vẫn không được ghi nhận là đã xác minh; lời mời nhân viên và đặt lại mật khẩu vẫn cần email. Tài khoản và cửa hàng vẫn được lưu trong Supabase, nên chỉ dùng email/dữ liệu demo. Tắt cờ này khi không còn trình diễn; tài khoản chưa xác minh cần xác minh email trước khi đăng nhập lại.
