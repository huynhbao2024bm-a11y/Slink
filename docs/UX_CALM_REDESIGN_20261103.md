# Slink — làm việc nhẹ hơn (2026-11-03)

## Yêu cầu hiện hành

Thay đổi toàn diện giao diện và cách tìm việc, dùng Taste/GSAP/Playwright. Mục tiêu cuối cùng là cực kỳ dễ dùng; người dùng vẫn thấy bản trước ngột ngạt, chật và rối. Không chỉ bỏ viền: giảm lựa chọn cùng lúc, bỏ điều hướng lặp, chia cài đặt theo việc. Chưa được yêu cầu đẩy đợt này.

## Phạm vi và nguồn dữ liệu

- Chủ/quản lý bán, nhập hàng, xem tiền và chia việc; cashier chỉ bán và xem đơn theo quyền.
- Hàng hóa có tên, ảnh tùy chọn, giá VND nguyên, tồn và đơn vị; không dựng hàng mẫu trong tài khoản thật.
- POS trả lời: bán mặt hàng nào và thu bao nhiêu? Luồng thường ngày: chọn hàng → thanh toán → xác nhận đã nhận tiền.
- Hàng hóa trả lời: đang có gì và cần nhập gì? Chi tiết giá vốn/biến thể/lịch sử chỉ mở đúng chỗ.
- Chủ online mở đơn cần xử lý; trạng thái sàn chưa kết nối vẫn phải nói đúng. Không tự tạo vận đơn hoặc xác nhận tiền sàn.
- Affiliate chỉ có link cá nhân do sàn cấp và tài khoản; không dựng kho/cửa hàng hoặc hoa hồng giả.
- Quản lý trả lời: cần làm việc gì ngoài bán? Các nhóm ít dùng được thu gọn.
- Cài đặt trả lời một việc tại một thời điểm; đổi phần không bỏ dữ liệu đang nhập trong biểu mẫu.
- Thử với ít hàng, nhiều hàng, không có hàng; dữ liệu thử và phiên đăng nhập thử ở `.local-data`, tách production.
- Điện thoại: hai/ba mục chính, tên rõ, vùng chạm 44px trở lên; bàn phím và giảm chuyển động phải dùng được.

## Hướng thiết kế

Taste app-screen run; chọn `achromatic-ledger`, seed `1352374627` vì bán hàng và quản lý tiền cần đọc nhanh, nền mở, điều hướng lùi xuống. Giữ chữ/mark Slink và xanh hiện có trên tiền/hành động chính theo chỉ đạo người dùng; đây là điều chỉnh có chủ đích so với chrome hoàn toàn đen trắng của style. Dấu riêng: danh sách hàng và tổng tiền đang bán là trọng tâm, không thêm các khối KPI mẫu.

Chuyển CSS khu làm việc sang `workspace.css`, giữ `styles.css` cho các thành phần nghiệp vụ cũ. GSAP 3.15.0 được phục vụ tại ứng dụng, giữ copyright/license header, chỉ phản hồi mở hộp thoại 120ms; không diễn hoạt toàn trang hoặc hàng loạt bản ghi, tắt với reduced-motion. Không tuyên bố hiệu năng tốt hơn khi chưa đo cùng kịch bản.

## Cổng kiểm tra

1. Đo cùng kịch bản trước/sau: số mục điều hướng, vị trí hàng đầu tiên, số lựa chọn trước khi bán; ảnh 390/768/1440px.
2. Thêm/bỏ/đổi ảnh, tạo hàng và reload; bán và nhập vẫn khớp tồn/tiền, tăng giảm giữ giỏ, không gửi trùng.
3. Cashier qua lời mời, quản lý bị chặn đúng quyền; affiliate và chủ online vào đúng khu.
4. Cài đặt chỉ một phần hiển thị, các tab dùng bàn phím và giữ nội dung chưa lưu khi đổi phần.
5. Lỗi API/offline có đường thử lại; CSS/GSAP thuộc app shell, server whitelist và container; không lộ thư mục mã nguồn.
6. Chưa coi iOS/Android thật hoặc production được nghiệm thu từ kiểm tra trình duyệt máy tính.

## Sự cố đăng nhập production đã xử lý

User xác nhận lỗi trên `slink-xny3.onrender.com`. PR #35 đã được người dùng gộp thành main `3994e39`, Render live bản đó; schema vẫn ở 0024. Log login báo `42703 column workspace_mode does not exist`. Đã chạy workflow production-migrate từ đúng main, run `41609650950`: apply 0025/0026 và kiểm tra quyền đều đạt. Dùng tham chiếu backup người dùng đã verify ngày 2026-10-26; checksum archive còn khớp, không tạo hoặc gọi đó là backup mới hôm nay. Query xác nhận cột/bảng và quyền app, readiness 200; người dùng xác nhận đăng nhập lại được. Chưa có backup/restore rehearsal mới. Không reset mật khẩu hay dùng tài khoản thật để sinh giao dịch thử.

## Kết quả triển khai local

Nhánh `codex/calm-workspace-20261103` bắt đầu từ main `3994e3921c7580cae5c82d8b7f8a6cc1a25db337`. Bản trước để so sánh nằm riêng ở `.local-data/calm-before`; không lấy nguyên nhánh cũ hoặc thay đổi nguồn ở thư mục gốc. Đợt mới chưa commit/push/merge/deploy.

- Chủ shop có ba mục chính: Bán hàng, Hàng hóa, Quản lý. Thu ngân chỉ có Bán hàng, Đơn hàng, Tài khoản; người làm affiliate có Link của tôi và Tài khoản. Các công việc quản lý ít dùng nằm trong nhóm có thể mở ra.
- Bỏ điều hướng trùng, bớt hành động trên tiêu đề, bỏ panel bao ngoài; chữ và ô nhập lớn hơn. Khối doanh thu xanh được giữ. Giỏ trên điện thoại vẫn mở khi tăng/giảm số lượng.
- Cài đặt chia từng phần, dùng được phím mũi tên/Home/End. Nội dung chưa lưu và vị trí nhập được giữ khi dữ liệu hồ sơ/bảo mật về chậm; bản nháp chỉ nằm trong bộ nhớ đang mở.
- Biểu đồ bỏ cột phụ không có dữ liệu thật. Số 0 có chiều cao 0; số âm nằm dưới mốc 0. Biểu đồ 30 ngày thu gọn nhãn trên điện thoại. Bốn số liệu báo cáo chia đều, tránh ô lẻ do CSS cũ.
- Máy chủ kiểm tra cấu trúc bắt buộc trước khi nhận lưu lượng. Nếu code chạy trước migration, báo rõ bước còn thiếu thay vì cho đăng nhập rồi lỗi; không tự migration bằng quyền ứng dụng.

## Bằng chứng và giới hạn

- Toàn bộ `pnpm test`: **49/49 đạt**, gồm kiểm tra từ schema trước 0025 sang schema mới và phục vụ CSS/GSAP trong whitelist. Kiểm tra cú pháp/diff đạt. Chưa build container mới trong đợt này.
- Playwright/Edge cục bộ: **44 tổ hợp trang/kích thước** 320/360/390/768/1024/1440px, không tràn ngang, mỗi trang có một H1 nhìn thấy, không có chữ dưới 12px trong các trang được đo. Thanh/giỏ phù hợp breakpoint; menu thao tác nằm trong màn hình. Lỗi tải danh mục có nút thử lại và phục hồi được.
- Cùng sáu mặt hàng ở bản trước/sau: điều hướng chính **5 → 3**; mặt hàng đầu tiên ở điện thoại 390px chuyển từ **341,5px → 301px** tính từ mép trên; desktop 1440px **310px → 241px**. Đây là đo bố cục, không phải đo tốc độ. Bộ đếm nút cũ chưa lọc phần tử bị che nên không dùng để kết luận.
- Luồng bán thường: chọn hàng → Thanh toán → Đã nhận tiền, trả 201, tồn đúng mặt hàng **12 → 11** và ở lại POS. Lời mời thu ngân, đăng ký/xác nhận, bán, tải lại và từ chối API ghi hàng/xem tài chính đều đạt trên dữ liệu thử riêng.
- Ảnh: chọn/hiện/lưu/đổi/bỏ, đọc từ phiên trình duyệt thứ hai đạt. Chủ online mở đúng màn đơn; affiliate không cần cửa hàng, lưu hai link Shopee/TikTok rồi tải lại được. Không có kết nối API sàn hoặc attribution/hoa hồng tự động.
- Danh mục trống có hành động thêm/nhập hàng và không cho thanh toán. Danh mục 130 mặt hàng tìm được hàng thứ 130; trang thứ hai có đúng 30 mặt hàng. Phản hồi hồ sơ được giữ chậm có chủ đích trong kiểm thử vẫn không xóa tên đang nhập.
- Số âm/0 và biểu đồ 30 ngày được kiểm tra bằng **fixture trình bày**; không coi fixture đó là nghiệm thu nghiệp vụ hoàn hàng hay đối soát báo cáo.
- Taste lint: 0 FAIL/0 WARN với `workspace.css` và `index.html`. Inspector trang đăng nhập ở 1440/768/390px không có finding sau chỉnh; cho phép khoảng trống quanh form vì form đăng nhập cần chiều rộng vừa phải. Inspector này không kiểm tra các trang cần đăng nhập; những trang đó dùng ma trận Playwright và xem ảnh. GSAP không chạy khi bật reduced-motion.
- Chứng cứ ở `.local-data/calm-redesign/evidence`, `media-evidence`, `taste/after-auth-round2`. Dữ liệu thử tách production, phiên thử không dùng mật khẩu thật.

Chưa nghiệm thu điện thoại iOS/Android thật, công cụ đọc màn hình, kết nối sàn, hiệu năng tải trước/sau hoặc toàn bộ cổng giao khách. Chưa phát hành giao diện mới. Khi phát hành: kiểm tra diff cụ thể, chạy CI/container, giữ migration đi trước bản ứng dụng cần schema mới, rồi kiểm tra phiên bản Render và thử lại đăng nhập.
