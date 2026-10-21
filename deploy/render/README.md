# Chuẩn bị hosting Slink trên Render

## Trạng thái

Đã chuẩn bị Blueprint cho một dịch vụ Node.js ở `render.yaml`. Chưa kết nối repo với Render, tạo dịch vụ/cơ sở dữ liệu, nhập secret hoặc deploy. Blueprint dùng nhánh `main`, vùng Singapore, tắt tự triển khai theo mỗi lần push và chọn cấu hình máy chủ trả phí nhỏ nhất hiện được Render liệt kê; hãy kiểm tra giá hiện hành trước khi tạo dịch vụ.

## Frontend và backend

Slink đã chạy chung trong một tiến trình Node.js: Fastify phục vụ các tệp giao diện và API từ cùng một origin. Vì vậy Render chỉ cần một Web Service Node, không cần tách static site, cấu hình CORS hoặc URL API riêng. Render cung cấp `PORT`; ứng dụng nhận biết biến môi trường `RENDER=true` và bind `0.0.0.0` ngay cả khi `HOST` trong Dashboard còn đặt thành `127.0.0.1`. Blueprint cũng đặt `HOST=0.0.0.0`, tin cậy đúng một hop proxy của Render để Fastify nhận IP client cho rate limit, ghim Node.js 24.22.0 theo yêu cầu dự án và dùng `/api/ready` để xác nhận API kết nối được cơ sở dữ liệu.

## Chặn trước khi tạo cơ sở dữ liệu Render

Chưa khai báo Render Postgres trong Blueprint vì mô hình quyền hiện tại không tương thích với Render Postgres được quản lý:

- Slink yêu cầu `slink_migrator` không phải superuser nhưng có `BYPASSRLS` để backfill các bảng tenant đang bật `FORCE ROW LEVEL SECURITY` (đặc biệt migration `0011_warehouses_transfers.sql`).
- Công cụ backup hiện yêu cầu vai trò backup có `BYPASSRLS` để không âm thầm bỏ sót bản ghi tenant.
- Render xác nhận Render Postgres không cấp superuser; PostgreSQL chỉ cho superuser tạo hoặc cấp thuộc tính `BYPASSRLS`. Dùng tài khoản mặc định của Render làm tài khoản ứng dụng/migration sẽ phá vỡ ranh giới quyền của Slink.

Trước khi nối cơ sở dữ liệu, cần chọn và hoàn tất một trong hai hướng:

1. **Tiếp tục dùng Render Postgres:** thiết kế lại backfill, kiểm tra quyền migration, backup và restore để chạy an toàn khi không có `BYPASSRLS`; sau đó mới thêm Postgres vào Blueprint và nghiệm thu trên database tạm.
2. **Giữ hợp đồng quyền hiện tại:** dùng một PostgreSQL riêng được vận hành với superuser do chủ dự án kiểm soát, cấu hình endpoint TLS và tường lửa phù hợp để dịch vụ Render kết nối. Đây là kiến trúc nhiều nhà cung cấp và cần kiểm tra mạng/bảo mật trước khi dùng.

Không để `APP_DATABASE_URL` trỏ tới tài khoản quản trị. Nó phải xác thực bằng `slink_app` không có quyền quản trị hay `BYPASSRLS`. `MIGRATION_DATABASE_URL` không được đưa vào tiến trình Web Service; workflow migration sản xuất hiện có dùng GitHub Environment secret riêng và yêu cầu người vận hành cung cấp tham chiếu backup đã xác minh.

## Biến cần nhập khi triển khai được duyệt

Render sẽ hỏi các biến `sync: false` lúc khởi tạo Blueprint. Chỉ nhập chúng trong Render Dashboard hoặc secret manager, không commit vào Git hay gửi trong chat:

- `PUBLIC_ORIGIN`: HTTPS origin của URL `*.onrender.com` thực tế hoặc domain sau khi đã cấu hình.
- `APP_DATABASE_URL`: URL PostgreSQL của vai trò `slink_app`; cần TLS được xác minh (`PG_SSL=true`).
- `EMAIL_DELIVERY_URL` và `EMAIL_DELIVERY_TOKEN`: endpoint HTTPS tương thích với hợp đồng gửi email xác minh/khôi phục của Slink.

Render cấp HTTPS cho Web Service. Không đặt `PORT` trong Blueprint vì Render tự cấp cổng chạy. Không thêm `MIGRATION_DATABASE_URL` vào service đang phục vụ request.

## Trình tự sau khi database tương thích

1. Đưa `render.yaml` cùng mã nguồn cần thiết lên `main` (không đưa `docs/` nếu tiếp tục áp dụng yêu cầu trước).
2. Trong Render tạo Blueprint từ repo Slink; xem lại region, cấu hình máy và chi phí trước khi xác nhận tạo tài nguyên.
3. Cấu hình database theo một trong hai hướng ở trên, TLS, tài khoản `slink_app`, backup và restore.
4. Nhập các biến bắt buộc trong Dashboard. Tạo riêng GitHub Environment `production` và secret migration theo workflow hiện có; không để credential migration vào runtime API.
5. Tạo và xác minh backup trước khi chạy migration có kiểm soát; sau đó mới deploy service và xác nhận health check, email xác minh, đăng nhập, HTTPS và phục hồi dữ liệu.

Blueprint chỉ là cấu hình chờ triển khai. Việc tạo Blueprint trên Render sẽ tạo tài nguyên và có thể phát sinh chi phí; chưa thực hiện thao tác đó.

## Nguồn nhà cung cấp

- [Render Web Services](https://render.com/docs/web-services)
- [Render authentication and trusted proxy](https://render.com/articles/how-to-implement-authentication-and-authorization)
- [Render Node.js version](https://render.com/docs/node-version)
- [Render Blueprint YAML](https://render.com/docs/blueprint-spec)
- [Render Postgres credentials](https://render.com/docs/postgresql-credentials)
- [Render Postgres connections and TLS](https://render.com/docs/postgresql-creating-connecting)
- [PostgreSQL role attributes](https://www.postgresql.org/docs/18/role-attributes.html)
