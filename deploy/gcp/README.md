# Slink trên Google Cloud — hồ sơ thử nghiệm có kiểm soát

## Trạng thái

Đây là cấu hình chuẩn bị cho một bản thử Slink có thể truy cập qua HTTPS. Terraform, Docker Compose, image xuất bản, IAM hạn chế, Secret Manager, backup và quy trình migration đã được mô tả trong mã nguồn. Chưa có project GCP, billing account, domain, secret version, VM hay image đã tạo. Không deploy trước khi người dùng cung cấp domain và thông tin GCP.

Hồ sơ này dành cho demo/pilot có giám sát, không phải kiến trúc đa vùng hoặc cam kết SLA thương mại. Một VM chạy cả API và PostgreSQL tạo điểm lỗi đơn; cần theo dõi, cập nhật hệ điều hành, diễn tập phục hồi và đánh giá tải trước khi nhận dữ liệu kinh doanh thật.

## Vì sao hồ sơ dùng Compute Engine thay cho Cloud SQL

Các migration Slink hiện cần `slink_migrator` có `BYPASSRLS` để backfill các bảng đang bật forced tenant RLS. Cloud SQL không cấp superuser cho khách hàng; tài khoản built-in quản trị có `CREATEROLE`, `CREATEDB`, `LOGIN`. PostgreSQL yêu cầu superuser để tạo role `BYPASSRLS`, và role không thể tự cấp quyền đó nếu nó chưa có thuộc tính này. Vì vậy migration-role contract hiện tại không tương thích với Cloud SQL nếu chưa thiết kế lại các backfill/RLS. Xem [Cloud SQL PostgreSQL users](https://docs.cloud.google.com/sql/docs/postgres/users) và [PostgreSQL role attributes](https://www.postgresql.org/docs/18/role-attributes.html).

Để giữ các kiểm tra quyền hiện có, hồ sơ này chạy PostgreSQL 18 trên một đĩa bền vững của VM. Database chỉ nằm trên Docker network nội bộ, không mở cổng 5432 trên IP VM; kết nối API, migration và backup dùng TLS với CA riêng của database. Việc tự vận hành PostgreSQL làm tăng trách nhiệm vá lỗi, giám sát, backup và phục hồi.

## Thành phần đã chuẩn bị

- VM Debian 12 tại Singapore, mặc định `e2-medium`; persistent data disk riêng và snapshot hàng ngày giữ 14 ngày.
- Docker Compose: Slink API, PostgreSQL 18.6, Caddy cấp HTTPS khi DNS trỏ đúng, và image tác vụ vận hành.
- Artifact Registry cho API/operations image với immutable tags; GitHub OIDC Workload Identity Federation giới hạn đúng repo, workflow, nhánh `main` và thao tác dispatch để publish image không dùng service-account key dài hạn.
- Secret Manager chỉ cấp quyền đọc cho service account của VM. Mật khẩu PostgreSQL được tạo tại máy người vận hành và upload trực tiếp; không ghi vào Git hay chat.
- Google Cloud Storage private bucket cho backup PostgreSQL AES-256-GCM, manifest có xác thực, xác minh lại sau khi upload; backup hết hạn theo vòng đời 35 ngày. Bucket có versioning để giữ bản cũ trong tình huống object bị thay/xóa; chỉ Slink VM có quyền tạo và đọc backup, không có quyền xóa. Timer tạo backup hàng ngày. Snapshot của data disk là lớp phục hồi bổ sung.
- Firewall chỉ mở TCP 80/443 công khai và SSH qua IAP. Không có cổng database công khai.
- Budget alert mặc định 100 USD mỗi tháng; đây chỉ là cảnh báo, không khóa chi tiêu.
- Workflow GitHub thủ công chỉ xuất bản image có tag bất biến `vMAJOR.MINOR.PATCH` từ `main`. VM chỉ được cập nhật sau backup, kiểm tra manifest, migration và role check.

## Điều kiện cần khi người dùng sẵn sàng triển khai

1. Project ID GCP mới hoặc project đã chọn, billing account đang hoạt động, quyền tạo Compute Engine, Artifact Registry, Secret Manager, Storage, Workload Identity Federation và budget.
2. Domain đã mua và quyền sửa DNS; sau khi tạo VM, tạo A record của hostname trỏ đến `public_ip` từ Terraform.
3. Dịch vụ gửi email có HTTPS endpoint và bearer token để xác minh tài khoản/khôi phục mật khẩu. Endpoint nhận `POST application/json` gồm `from`, `to`, `subject` và `text`, xác thực Bearer token và trả HTTP 2xx khi đã nhận thư. Địa chỉ gửi `no-reply@<domain>` được tạo từ domain triển khai; xác minh domain gửi trong dịch vụ email trước khi bật đăng ký production.
4. Google account email của người vận hành. Terraform chỉ cấp OS Admin Login và IAP Tunnel cho địa chỉ này.
5. Quyết định chấp nhận VM đơn, chi phí vượt free-trial nếu có, và lịch bảo trì.

Google Cloud mô tả free trial cho khách hàng đủ điều kiện là 300 USD trong 90 ngày; điều kiện tài khoản và cách áp dụng credit do Google quyết định. Chi phí vẫn phát sinh theo tài nguyên/region; credit hết hạn không phải spending cap. Budget alert không tự dừng VM. Tham khảo [Google Cloud Free Trial](https://docs.cloud.google.com/free/docs/free-cloud-features?gclsrc=aw.ds) và [Compute Engine pricing](https://cloud.google.com/compute/pricing).

## Trình tự triển khai sau khi có domain và thông tin project

1. Cài Google Cloud CLI trên máy vận hành, đăng nhập, chọn project và xác nhận billing account. Đăng nhập Application Default Credentials để Terraform trong Docker dùng được quyền của bạn. Không gửi thông tin đăng nhập cho Slink. Terraform đã được ghim ở bản 1.9.8 và chạy qua `terraform/Invoke-Terraform.ps1`, vì vậy không cần cài Terraform trực tiếp trên Windows.
2. Sao chép `terraform/terraform.tfvars.example` thành `terraform/terraform.tfvars`; điền project ID, billing account ID, Google email người vận hành và domain thật. Không điền secret vào file này.
3. Trong PowerShell chạy `Invoke-Terraform.ps1 init -backend=false`, `Invoke-Terraform.ps1 fmt -check -recursive`, `Invoke-Terraform.ps1 validate`, rồi `Invoke-Terraform.ps1 plan -var-file=terraform.tfvars`. Xác nhận dự án đủ điều kiện dùng trial credit và xem ước tính giá của GCP cho đúng khu vực. Chỉ apply sau khi xem tài nguyên và chi phí dự kiến. Hạ tầng có tính phí từ thời điểm được tạo; budget alert là thông báo, không phải spending cap. Terraform state và tfvars chứa thông tin hạ tầng nên giữ riêng trên máy hoặc backend riêng, không commit.
4. Sau khi Terraform tạo các secret trống, chạy `Set-GcpTrialSecrets.ps1 -ProjectId <PROJECT_ID>` trong PowerShell. Script tạo ngẫu nhiên mật khẩu database/backup key, hỏi endpoint email và token ở chế độ không hiển thị, upload vào Secret Manager, rồi xóa file tạm có ACL giới hạn.
5. Đưa các Terraform output sau vào GitHub repository variables: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_RELEASE_SERVICE_ACCOUNT`. Không tạo service-account JSON key.
6. Từ GitHub Actions, chạy workflow **Publish Slink images to Google Artifact Registry** trên `main` với version chưa dùng, ví dụ `v0.2.1`. Workflow chạy `pnpm test`, build hai image và chỉ push version tag.
7. Thêm A record của domain về `public_ip` từ Terraform; chờ DNS trả đúng IP.
8. Qua IAP, chạy `/opt/slink/activate-host.sh v0.2.1`. Script lấy secret từ Secret Manager, khởi tạo PostgreSQL/role, chạy migration và role check, khởi động Slink/Caddy, bật backup timer và tạo backup đầu tiên.
9. Mở `https://<domain>`, tạo tài khoản chủ cửa hàng, nhận email xác minh và nhập danh mục thử do người kiểm soát. Không nạp dữ liệu demo vào cửa hàng khách thật.
10. Các bản phát hành sau: publish image version mới, rồi chạy `/opt/slink/deploy-release.sh v0.2.2`. Tag trong Artifact Registry không thể bị ghi đè. Script backup và kiểm tra bản backup trước khi dừng API; nếu migration hoặc kiểm tra sau migration lỗi, API được giữ dừng để tránh chạy code trên schema không rõ trạng thái.

## Các kiểm tra còn phải thực hiện sau khi có hạ tầng

- Xác nhận lần đầu boot VM, database TLS, HTTPS certificate, email thật và tài khoản owner.
- Kiểm tra firewall/IAP từ bên ngoài và không thể kết nối trực tiếp cổng PostgreSQL.
- Chạy luồng onboarding, bán, trả hàng, đối soát và quyền trên môi trường GCP; dữ liệu trước đó chỉ kiểm tra trên PostgreSQL local/isolated.
- Chạy backup hàng ngày, xác minh tải lại từ GCS; thực hiện một restore drill có kiểm soát trước pilot. Restore trên VM GCP chưa được diễn tập.
- Cấu hình nhận cảnh báo billing và kiểm tra chi phí thực tế. Budget 100 USD/tháng không phải giới hạn chi tiêu.
- Cấu hình cập nhật bảo mật hệ điều hành, giám sát và quy trình sự cố; hiện chưa có giám sát ngoài healthcheck/container logs.
- Đánh giá lại nếu có cửa hàng thật, tăng tải hoặc cần uptime cao. VM đơn và snapshot hàng ngày chưa đáp ứng HA hoặc RPO/RTO đã cam kết.
