# Kế hoạch triển khai Slink

**Mục đích:** Đây là hàng việc sống để giữ công việc tập trung qua các phiên. Mỗi lần tiếp tục dự án, đọc kế hoạch này và `DELIVERY_ROADMAP.md`, làm việc kế tiếp có thể hoàn tất trong workspace, cập nhật trạng thái rồi chuyển tiếp. Mục tiêu sản phẩm và cổng giao khách vẫn theo `PROJECT_MANDATE.md` và `BUILD_CHARTER.md`.

**Mục tiêu:** Hoàn thiện Slink thành sản phẩm vận hành bán lẻ có thể đem thử với cửa hàng thật và trình bày trung thực tại cuộc thi khởi nghiệp. Không tuyên bố các tích hợp, thiết bị, doanh thu, người dùng hoặc năng lực chưa có bằng chứng.

## Cách làm theo chỉ đạo mới nhất

- Ưu tiên triển khai và hoàn thiện chức năng; không để nghiệm thu giao diện tự động làm dừng công việc.
- Chạy kiểm tra tự động có mục đích khi thay đổi dữ liệu giao dịch, quyền truy cập, cô lập cửa hàng, bảo mật, sao lưu hoặc khôi phục. Không coi các kiểm tra đó là nghiệm thu trải nghiệm.
- Giao diện, khả năng hiểu, tốc độ thao tác, in/chia sẻ và trải nghiệm điện thoại cần người thật thử; ghi rõ là chờ người dùng/nhân viên cửa hàng thay vì đánh dấu đạt từ mã nguồn.
- Khi thiếu tài khoản hoặc quyền nhà cung cấp, hoàn thành phần độc lập và đánh dấu chính xác phần kết nối đang chờ; không dựng trạng thái đồng bộ giả.
- Giữ Git cập nhật theo từng phần thay đổi có ý nghĩa. Không đưa bí mật, cấu hình cá nhân hoặc dữ liệu chẩn đoán máy phát triển lên repo.
- Sau mỗi phần việc, cập nhật `DELIVERY_ROADMAP.md` với thay đổi, bằng chứng phù hợp, giới hạn còn lại và việc kế tiếp.

## Các chặng

### 0. Ổn định và xuất bản trạng thái mã nguồn — **Đang làm**

**Mục đích:** Đưa mã nguồn hiện có lên repo mới một cách xem lại được trước khi tiếp tục mở rộng.

**Phạm vi:** Rà soát thay đổi tracked và untracked; loại file chẩn đoán/editor cá nhân và bí mật khỏi commit; commit trên nhánh làm việc và push lên `origin`; không ghi đè `main`.

**Phụ thuộc:** Quyền GitHub của tài khoản mới đã đăng nhập.

**Bằng chứng để qua chặng:** Commit rõ phạm vi, nhánh remote được cập nhật và trạng thái Git sau push được xác nhận. CI nếu chạy tự động là tín hiệu cho thay đổi mã/dữ liệu, không thay cho thử nghiệm của người bán.

### 1. Hoàn thiện luồng bán lẻ cơ bản — **Đang làm**

**Mục đích:** Giúp cửa hàng nhỏ nhập dữ liệu, bán, trả hàng, kiểm kho, theo dõi công nợ/tiền và tra cứu lịch sử bằng quy trình nhất quán.

**Phạm vi:** Tiếp tục hoàn thiện sản phẩm, nhập CSV, POS, thanh toán/giảm giá, hoàn trả, mua hàng, nhiều kho, ca tiền mặt, công nợ, báo cáo, CRM và các trạng thái lỗi/empty state. Ưu tiên thao tác còn có màn hình nhưng chưa thuận tiện hoặc chưa nối đủ vào lịch sử.

**Phụ thuộc:** Không cần dịch vụ ngoài cho phần lõi; thiết bị thật cần người dùng thử.

**Bằng chứng để qua chặng:** Khi đụng dữ liệu hoặc quyền, kiểm tra có trọng tâm các invariant giao dịch, VND nguyên, chống gửi trùng, RLS và rollback. Thao tác điện thoại và mức dễ dùng chờ người thật xác nhận.

### 2. Hoàn thiện PIM, OMS, WMS và công cụ cửa hàng — **Chưa làm xong**

**Mục đích:** Mở rộng các luồng nội bộ mà cửa hàng có thể dùng trước khi phụ thuộc sàn hoặc hãng vận chuyển.

**Phạm vi:** Biến thể/thuộc tính và quy tắc giá; lô/hạn sử dụng khi phù hợp; khuyến mãi/voucher/điểm khách hàng; tác vụ và phê duyệt nhân viên; tìm kiếm/bộ lọc/lịch sử; báo cáo theo kho và nhân viên; xuất dữ liệu cần thiết. Chia từng phần nhỏ theo dữ liệu nguồn hiện có.

**Phụ thuộc:** Quy tắc cửa hàng rõ ràng cho giá, khuyến mãi, hoàn/đổi và quyền nhân viên. Không giả định nhà cung cấp ngoài.

**Bằng chứng để qua chặng:** Ghi nhận thay đổi có lịch sử và quyền phù hợp; kiểm tra các rủi ro dữ liệu/bảo mật. Nhân viên thật xác nhận quy trình và ngôn ngữ sau khi tính năng có thể dùng.

### 3. Hoàn thiện bán hàng đa kênh và giao vận — **Chờ chọn đối tác, làm phần độc lập trước**

**Mục đích:** Kết nối Slink với các kênh và đối tác bằng luồng có trạng thái, có thể đối soát.

**Phạm vi:** Chuẩn hóa mô hình kênh/đơn ngoài, nhật ký đồng bộ, retry, lỗi, mapping SKU, mức tồn dự phòng và COD; sau đó triển khai từng connector được chọn.

**Phụ thuộc:** Tài khoản developer/merchant, quyền API, sandbox/credentials, điều khoản và người chịu trách nhiệm vận hành từng nhà cung cấp.

**Bằng chứng để qua chặng:** Một connector chạy đầu-cuối trong sandbox hoặc môi trường được duyệt, có xác nhận từ nhà cung cấp và kiểm tra đối soát/lỗi. Không quảng bá connector chưa cấu hình.

### 4. Cứng hóa dữ liệu, bảo mật và dịch vụ — **Còn mở; không chặn phần độc lập**

**Mục đích:** Bảo vệ giao dịch và dữ liệu khách khi chuyển từ máy phát triển sang môi trường được phục vụ thật.

**Phạm vi:** Phân quyền và tenant; bảo vệ bí mật; backup/restore; triển khai HTTPS/PostgreSQL quản lý; giám sát, giới hạn lạm dụng, retention/xóa dữ liệu, xử lý sự cố và rollback.

**Phụ thuộc:** Hosting, miền, secret manager, ngân sách, chính sách lưu trữ và quyền nhà cung cấp. Rà soát pháp lý/kế toán cần người có thẩm quyền.

**Bằng chứng để qua chặng:** Kiểm tra có trọng tâm cho rủi ro dữ liệu/bảo mật; triển khai và phục hồi có bằng chứng thật. Không thay thế thử nghiệm UX bằng test mã.

### 5. Thử với người bán và xác định phạm vi ra mắt — **Chưa bắt đầu**

**Mục đích:** Xác nhận cửa hàng thật có thể dùng Slink cho một ngày vận hành mà không cần người phát triển xử lý thay.

**Phạm vi:** Chọn cửa hàng nhỏ, dữ liệu thử có đồng ý, kịch bản onboarding/bán/hoàn/kiểm kho/đối soát và ghi lại điểm vướng. Chốt tính năng nằm ngoài phiên bản đầu.

**Phụ thuộc:** Cửa hàng thử nghiệm, thiết bị iOS và Android 10+, cùng môi trường được phép dùng.

**Bằng chứng để qua chặng:** Người bán tự hoàn thành kịch bản; phản hồi và lỗi được ghi lại; vấn đề được chuyển thành mục triển khai cụ thể.

### 6. Hồ sơ dự thi khởi nghiệp — **Cần tạo sau khi chốt lát cắt demo**

**Mục đích:** Có video ngắn hoặc pitch deck với hình ảnh/chứng cứ thật để trình bày sản phẩm.

**Phạm vi:** Kịch bản giới thiệu vấn đề, khách hàng mục tiêu, luồng sản phẩm đang chạy, khác biệt dưới dạng giả thuyết, mô hình kinh doanh dự kiến và lộ trình. Dùng ảnh/video từ giao diện thật nếu chạy được; ghi rõ tính năng đang có, đang phát triển và phụ thuộc nhà cung cấp.

**Phụ thuộc:** Môi trường demo ổn định và danh sách tuyên bố đã đối chiếu với roadmap. Không cần chờ toàn bộ sản phẩm hoàn tất.

**Bằng chứng để qua chặng:** File video hoặc deck mở được, nội dung không nhầm kế hoạch với năng lực đã phát hành và có kịch bản demo trực tiếp.

## Việc kế tiếp

1. Hoàn tất chặng 0: kiểm tra các thay đổi hiện có, loại file máy cá nhân, commit và push nhánh làm việc lên GitHub.
2. Bắt đầu chặng 1/2 bằng một chức năng nội bộ có thể làm trọn trong repo, không chờ tài khoản sàn.
3. Cập nhật kế hoạch này và `DELIVERY_ROADMAP.md` khi có thay đổi; khi có lát cắt demo ổn định, bắt đầu chặng 6 song song với phần còn lại.
