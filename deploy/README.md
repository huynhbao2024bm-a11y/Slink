# Chuẩn bị hosting Slink

Đích hosting hiện tại theo yêu cầu mới nhất là Render.com. Blueprint Node.js và các điều kiện còn thiếu được ghi ở [`render/README.md`](render/README.md). Chưa kết nối GitHub với Render, tạo tài nguyên, nhập secret hoặc deploy.

Hồ sơ Google Compute Engine cũ vẫn được giữ riêng ở [`gcp/README.md`](gcp/README.md); hồ sơ đó chưa được triển khai và không tự động áp dụng cho Render.

Slink đã phục vụ frontend và API từ cùng một tiến trình Node.js. Cần giải quyết tương thích vai trò migration/backup với cơ sở dữ liệu được chọn trước khi tạo dịch vụ công khai.

Không gửi secret, mật khẩu, private key hoặc token trong chat. Việc tạo dịch vụ Render cần xem lại chi phí và chỉ thực hiện khi người dùng yêu cầu triển khai.
