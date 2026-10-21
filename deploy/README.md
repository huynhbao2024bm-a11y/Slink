# Chuẩn bị hosting Slink

Hồ sơ đích hiện tại là Google Compute Engine cho bản thử tại cuộc thi. Cấu hình hạ tầng, image và quy trình phát hành được ghi ở [`gcp/README.md`](gcp/README.md). Không có cloud resource hay image nào được tạo trong lần chuẩn bị này.

Mẫu biến production trước đây vẫn dùng cho máy chủ PostgreSQL độc lập có TLS trực tiếp; hồ sơ GCP dùng Docker Compose, PostgreSQL nội bộ, Secret Manager và các file secret được tạo trên VM. Không dùng workflow migration trên GitHub runner cho VM GCP vì database không mở ra Internet.

Trước khi khởi tạo hosting thật, cần có project GCP đang bật billing, domain/DNS, tài khoản email gửi xác minh, và người vận hành có quyền quản trị project. Không gửi secret, mật khẩu, private key hoặc token trong chat.
