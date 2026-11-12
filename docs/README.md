# Slink — bản đồ tài liệu dự án

Mục đích của thư mục này là giữ hướng sản phẩm, quyết định, bằng chứng và việc tiếp theo qua mọi phiên làm việc. Đọc [`PROJECT_MANDATE.md`](PROJECT_MANDATE.md) trước; đọc tài liệu chuyên môn tương ứng trước khi đổi mã.

## Thứ tự đọc bắt buộc

1. [`PROJECT_MANDATE.md`](PROJECT_MANDATE.md) — mục tiêu không được thu nhỏ, cách chọn việc, quy tắc làm và tiêu chuẩn bằng chứng.
2. [`BUILD_CHARTER.md`](BUILD_CHARTER.md) — định nghĩa sản phẩm hoàn chỉnh và các cổng bắt buộc trước khi giao khách.
3. [`DELIVERY_ROADMAP.md`](DELIVERY_ROADMAP.md) — hiện trạng đã kiểm chứng, thiếu sót, ưu tiên kế tiếp và phụ thuộc bên ngoài.
4. [`EXECUTION_PLAN.md`](EXECUTION_PLAN.md) — hàng việc triển khai hiện tại; không phải nhật ký lịch sử.
5. [`PROJECT_PLAN.md`](PROJECT_PLAN.md) — định hướng khách hàng, cách chọn phân khúc mở màn, các chặng sản phẩm và cổng hoàn tất.
6. [`PRODUCT.md`](PRODUCT.md) — luồng nghiệp vụ, hành vi giao diện và nghiên cứu sản phẩm; bắt buộc trước khi đổi nghiệp vụ.
7. [`ONBOARDING_AND_ACCESS_PROFILES.md`](ONBOARDING_AND_ACCESS_PROFILES.md) — phạm vi hồ sơ vận hành, trải nghiệm dễ bắt đầu và ranh giới với vai trò/thiết bị POS; ghi rõ phần mã đã có và phần chưa nghiệm thu.
8. [`BACKEND_SETUP.md`](BACKEND_SETUP.md) — cách chạy API, cơ sở dữ liệu và giới hạn triển khai.
9. [`DEPLOYMENT.md`](DEPLOYMENT.md) — đóng gói container, chạy migration và các cổng vận hành production.
10. [`COMMERCIAL_READINESS.md`](COMMERCIAL_READINESS.md) — trạng thái, tiêu chí chọn và phụ thuộc của tích hợp thương mại.
11. [`decisions/`](decisions/) — lý do của các quyết định kiến trúc đã ghi nhận.
12. [`USER_FEATURE_INVENTORY.md`](USER_FEATURE_INVENTORY.md) và [`MULTICHANNEL_SCOPE.md`](MULTICHANNEL_SCOPE.md) — nguyên văn danh sách tính năng người dùng cung cấp và bảng so sánh/phạm vi mở rộng đã sắp thứ tự.
13. [`OPERATIONAL_REVIEW_KIOTVIET.md`](OPERATIONAL_REVIEW_KIOTVIET.md) — đánh giá quy trình vận hành Slink so với hướng dẫn công khai của KiotViet; tách rõ mã nguồn và bằng chứng chạy thật.
14. [`TARGET_CUSTOMER_WORKFLOWS.md`](TARGET_CUSTOMER_WORKFLOWS.md) — hướng khách hàng đã điều chỉnh, quy trình theo ngành/vai trò, đối chiếu KiotViet/Sapo và giả thuyết chọn phân khúc mở màn.
15. [`OPERATIONS_SIMPLIFICATION_RESEARCH.md`](OPERATIONS_SIMPLIFICATION_RESEARCH.md) — nghiên cứu tiệm nhỏ trước khi người dùng làm rõ lại khách hàng mục tiêu; chỉ giữ làm lịch sử.

## Mỗi tài liệu tồn tại để làm gì

| Tài liệu | Mục đích | Khi nào cập nhật |
| --- | --- | --- |
| `PROJECT_MANDATE.md` | Giữ nguyên mục tiêu khách hàng thật, cách làm và hàng rào chống gọi nhầm demo là sản phẩm | Khi người dùng đổi mục tiêu hoặc thay đổi quy tắc làm việc đã được họ xác nhận |
| `BUILD_CHARTER.md` | Định nghĩa “hoàn thành” và mọi năng lực/cổng giao khách | Chỉ khi người dùng đổi phạm vi hoặc có bằng chứng làm thay đổi yêu cầu |
| `PRODUCT.md` | Mô tả cách từng luồng phải hoạt động và nguyên tắc giao diện | Khi thêm/đổi luồng nghiệp vụ hoặc có nghiên cứu đáng tin làm đổi quyết định |
| `PROJECT_PLAN.md` | Kế hoạch tổng thể theo phân khúc, chặng, phụ thuộc và điều kiện hoàn tất | Khi có nghiên cứu pilot, đổi thứ tự chiến lược hoặc bằng chứng làm đổi phạm vi |
| `ONBOARDING_AND_ACCESS_PROFILES.md` | Phạm vi hồ sơ vận hành, chế độ dễ bắt đầu và phân biệt vai trò với thiết bị quầy | Khi chốt yêu cầu và khi triển khai/kiểm nghiệm lát cắt onboarding |
| `DELIVERY_ROADMAP.md` | Nhật ký bằng chứng, trạng thái, rủi ro, ưu tiên và phụ thuộc | Sau mỗi thay đổi làm đổi hiện trạng; không nâng trạng thái nếu thiếu bằng chứng |
| `EXECUTION_PLAN.md` | Hàng việc sống, ưu tiên triển khai, phụ thuộc và đầu ra trình bày | Sau mỗi chặng hoặc khi người dùng đổi thứ tự/cách nghiệm thu |
| `BACKEND_SETUP.md` | Hướng dẫn thiết lập và ranh giới triển khai | Khi đổi runtime, cấu hình, migration, dịch vụ email hoặc cách triển khai |
| `DEPLOYMENT.md` | Quy trình tạo ảnh, migration, health check, secret, backup và rollback | Khi chốt nhà cung cấp hoặc thay đổi release/operations |
| `COMMERCIAL_READINESS.md` | Hiện trạng và phụ thuộc của nhà cung cấp thương mại | Khi lựa chọn hoặc nghiệm thu tích hợp, giá, hợp đồng hoặc cách hỗ trợ |
| `decisions/*.md` | Lưu lựa chọn kiến trúc, căn cứ, đánh đổi và điều kiện xem xét lại | Khi một quyết định quan trọng được chốt hoặc cần thay thế |
| `USER_FEATURE_INVENTORY.md` | Lưu nguyên văn danh sách chức năng do người dùng gửi | Không viết lại nội dung nguồn; thêm yêu cầu mới thành tài liệu riêng |
| `MULTICHANNEL_SCOPE.md` | Đối chiếu năng lực hiện có, khoảng trống, nguồn tham khảo và thứ tự mở rộng đa kênh | Khi có bằng chứng thực hiện, thay đổi ưu tiên hoặc phụ thuộc đối tác |
| `OPERATIONAL_REVIEW_KIOTVIET.md` | So sánh các quy trình vận hành hằng ngày, nêu mức nền hiện tại và khoảng trống cần nghiệm thu | Khi có bằng chứng mới về quy trình thực tế hoặc khi cập nhật đối chiếu đối thủ |
| `OPERATIONS_SIMPLIFICATION_RESEARCH.md` | Chuyển quan sát và thay đổi tiêu chí khách hàng thành luồng gọn, thứ tự ưu tiên và tiêu chí nghiệm thu | Khi người dùng đổi ưu tiên hoặc khi có thử nghiệm với cửa hàng đại diện |
| `TARGET_CUSTOMER_WORKFLOWS.md` | Định hướng khách hàng hiện hành, nghiệp vụ theo mô hình/vai trò, phân tích đối thủ và kế hoạch kiểm chứng | Khi có phỏng vấn/thử nghiệm mới hoặc khi người dùng chốt phân khúc mở màn |

Tài liệu trong thư mục này hỗ trợ công việc; bằng chứng thực tế trong mã nguồn, môi trường chạy, thiết bị và hồ sơ nghiệm thu mới quyết định trạng thái. `DELIVERY_ROADMAP.md` giữ bằng chứng theo ngày; các mục lịch sử không thay cho phần `Current snapshot` ở đầu. `EXECUTION_PLAN.md` chỉ giữ thứ tự công việc đang mở. Không xóa nhật ký lịch sử chỉ để làm trạng thái trông gọn hơn.

[OFFLINE_OPERATIONS.md](OFFLINE_OPERATIONS.md) mô tả cách dùng, phạm vi offline và bằng chứng cục bộ ngày04/11/2026. [OFFLINE_IMPLEMENTATION_NOTES.md](OFFLINE_IMPLEMENTATION_NOTES.md) giữ chi tiết bàn giao, môi trường thử và điều kiện phát hành; không thay lộ trình chính.


Đánh giá mới nhất: [OPERATIONAL_REVIEW_20261104.md](OPERATIONAL_REVIEW_20261104.md). Trạng thái phát hành và ưu tiên xem mục mới nhất trong DELIVERY_ROADMAP.
