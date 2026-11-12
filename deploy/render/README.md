# Chuẩn bị hosting Slink trên Render

## Trạng thái

Web Service Slink đã được tạo trên Render và trang gốc đã trả HTTP 200. Kết nối cơ sở dữ liệu Supabase vẫn lỗi TLS trong log đăng ký. Không coi đăng nhập, đăng ký hay dữ liệu production là đã hoạt động.

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
- `APP_DATABASE_URL`: URI **Session pooler** lấy từ Supabase Connect cho vai trò runtime giới hạn quyền; TLS dùng CA Supabase đóng gói trong repo (`PG_SSL=ca-file`).
- `EMAIL_DELIVERY_URL` và `EMAIL_DELIVERY_TOKEN`: endpoint HTTPS tương thích với hợp đồng gửi email xác minh/khôi phục của Slink.

Render cấp HTTPS cho Web Service. Không đặt `PORT` trong Blueprint vì Render tự cấp cổng chạy. Không thêm `MIGRATION_DATABASE_URL` vào service đang phục vụ request.

## Supabase Session Pooler và xác minh TLS

Chứng chỉ CA công khai của Supabase được đóng gói tại `deploy/render/supabase-ca.crt`. Trên Render, đặt:

```text
PG_SSL=ca-file
PG_SSL_CA_FILE=/opt/render/project/src/deploy/render/supabase-ca.crt
```

`APP_DATABASE_URL` phải là URI **Session pooler** lấy từ Supabase Connect, với username/host/port nguyên trạng do Dashboard cung cấp. Không dùng Direct connection khi dịch vụ Render chỉ có IPv4. Nếu URI có query `sslmode` hoặc `sslrootcert`, bỏ các tham số đó; Slink lấy CA từ tệp trên và vẫn xác minh máy chủ (`rejectUnauthorized=true`). Không đặt `NODE_TLS_REJECT_UNAUTHORIZED=0`, không tắt xác minh TLS, và không đưa mật khẩu vào repo. Khi xoay mật khẩu DB, chỉ cập nhật `APP_DATABASE_URL` trong Render Environment.

CA này là chứng chỉ gốc công khai, không phải bí mật. Nó có hạn đến năm 2031; cần thay tệp nếu Supabase đổi CA hoặc trước ngày hết hạn. Sau khi lưu biến và redeploy, xác minh `/api/ready` và log kết nối trước khi thử đăng nhập/đăng ký. Lỗi TLS được khắc phục chưa đồng nghĩa schema, quyền `slink_app`, hay migrations production đã sẵn sàng.

## Cấu hình Render hiện tại

Sau khi commit chứa `deploy/render/supabase-ca.crt` có mặt trên nhánh chạy dịch vụ, vào **Render → Slink → Environment** và đặt:

```text
PG_SSL=ca-file
PG_SSL_CA_FILE=/opt/render/project/src/deploy/render/supabase-ca.crt
```

Đặt `APP_DATABASE_URL` bằng chuỗi Session pooler mới lấy nguyên văn từ Supabase Connect; không đưa chuỗi đó vào GitHub hoặc chat. Lưu biến rồi chạy **Manual Deploy → Deploy latest commit** nếu Render chưa tự triển khai commit mới. Sau đó mở `/api/ready` và log. Nếu TLS đã hết lỗi nhưng readiness/đăng ký còn lỗi, cần xử lý tiếp role `slink_app`, schema/migrations và quyền migration/backup tương thích với Supabase. Chưa chạy migrations trên database production.


## Nguồn nhà cung cấp

- [Render Web Services](https://render.com/docs/web-services)
- [Render authentication and trusted proxy](https://render.com/articles/how-to-implement-authentication-and-authorization)
- [Render Node.js version](https://render.com/docs/node-version)
- [Render Blueprint YAML](https://render.com/docs/blueprint-spec)
- [Render Postgres credentials](https://render.com/docs/postgresql-credentials)
- [Render Postgres connections and TLS](https://render.com/docs/postgresql-creating-connecting)
- [PostgreSQL role attributes](https://www.postgresql.org/docs/18/role-attributes.html)

## Chế độ demo tạm bỏ xác minh email

Để cho chủ cửa hàng tạo tài khoản và vào Slink ngay trong bản thi, thêm/đổi biến này tại **Render → Slink → Environment**:

```text
DEMO_DISABLE_EMAIL_VERIFICATION=true
```

Nhấn **Save Changes**; nếu Render chưa tự triển khai, vào **Manual Deploy → Deploy latest commit**. Mã nguồn vẫn cần có thay đổi demo này trước khi biến có tác dụng. `PUBLIC_ORIGIN` và kết nối database vẫn bắt buộc; email endpoint/token không bắt buộc khi chế độ này bật.

Đây chỉ là chế độ trình diễn: người đăng ký có thể nhập email không thuộc về họ. Chỉ dùng dữ liệu demo. Chủ cửa hàng tạo trước đó nhưng bị pending có thể đăng nhập bằng đúng email và mật khẩu cũ. Lời mời nhân viên vẫn cần xác minh email. Sau khi có sender domain, gửi lại email xác minh cho tài khoản demo chưa xác minh, rồi đổi biến về `false` và deploy lại.
