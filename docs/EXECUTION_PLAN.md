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

### 0. Ổn định và xuất bản trạng thái mã nguồn — **Hoàn tất 2026-10-20**

**Mục đích:** Đưa mã nguồn hiện có lên repo mới một cách xem lại được trước khi tiếp tục mở rộng.

**Phạm vi:** Rà soát thay đổi tracked và untracked; loại file chẩn đoán/editor cá nhân và bí mật khỏi commit; commit trên nhánh làm việc và push lên `origin`; không ghi đè `main`.

**Phụ thuộc:** Quyền GitHub của tài khoản mới đã đăng nhập.

**Bằng chứng:** Commit `14e3cb2` đã được rebase trên 13 commit mới từ GitHub và đẩy fast-forward lên `origin/codex/production-container-ci`; GitHub trả `[up to date]`. File cấu hình cá nhân/diagnostic vẫn ở ngoài commit. Không dùng force push. CI nếu chạy tự động là tín hiệu cho thay đổi mã/dữ liệu, không thay cho thử nghiệm của người bán.

### 1. Hoàn thiện luồng bán lẻ cơ bản — **Đang làm**

**Mục đích:** Giúp cửa hàng nhỏ nhập dữ liệu, bán, trả hàng, kiểm kho, theo dõi công nợ/tiền và tra cứu lịch sử bằng quy trình nhất quán.

**Phạm vi:** Tiếp tục hoàn thiện sản phẩm, nhập CSV, POS, thanh toán/giảm giá, hoàn trả, mua hàng, nhiều kho, ca tiền mặt, công nợ, báo cáo, CRM và các trạng thái lỗi/empty state. Ưu tiên thao tác còn có màn hình nhưng chưa thuận tiện hoặc chưa nối đủ vào lịch sử.

**Phụ thuộc:** Không cần dịch vụ ngoài cho phần lõi; thiết bị thật cần người dùng thử.

**Bằng chứng để qua chặng:** Khi đụng dữ liệu hoặc quyền, kiểm tra có trọng tâm các invariant giao dịch, VND nguyên, chống gửi trùng, RLS và rollback. Thao tác điện thoại và mức dễ dùng chờ người thật xác nhận.

### 2. Hoàn thiện PIM, OMS, WMS và công cụ cửa hàng — **Đang làm**

**Mục đích:** Mở rộng các luồng nội bộ mà cửa hàng có thể dùng trước khi phụ thuộc sàn hoặc hãng vận chuyển.

**Phạm vi:** Biến thể/thuộc tính và quy tắc giá; lô/hạn sử dụng khi phù hợp; khuyến mãi/voucher/điểm khách hàng; tác vụ và phê duyệt nhân viên; tìm kiếm/bộ lọc/lịch sử; báo cáo theo kho và nhân viên; xuất dữ liệu cần thiết. Lát cắt đang có: mã giảm cố định hoặc phần trăm tại POS, ngày bắt đầu/kết thúc, ngưỡng đơn, giới hạn tổng lượt và mỗi khách; chỉ dùng một mã/đơn. Chưa có flash sale tự động, combo, loyalty points, giá theo kênh hoặc chiến dịch nhắn tin.

**Phụ thuộc:** Quy tắc cửa hàng rõ ràng cho giá, khuyến mãi, hoàn/đổi và quyền nhân viên. Không giả định nhà cung cấp ngoài.

**Bằng chứng để qua chặng:** Ghi nhận thay đổi có lịch sử và quyền phù hợp; kiểm tra các rủi ro dữ liệu/bảo mật. Nhân viên thật xác nhận quy trình và ngôn ngữ sau khi tính năng có thể dùng.

### 3. Hoàn thiện bán hàng đa kênh và giao vận — **Chờ chọn đối tác, làm phần độc lập trước**

**Mục đích:** Kết nối Slink với các kênh và đối tác bằng luồng có trạng thái, có thể đối soát.

**Phạm vi:** Chuẩn hóa hồ sơ kênh và mapping SKU; tiếp nhận thủ công đơn đã thấy trên sàn, giữ tồn, cập nhật đóng gói/gửi/giao/hủy và lưu lịch sử; sau đó thêm nhật ký đồng bộ, retry/lỗi và từng connector được chọn. Tình trạng thanh toán nhập tay chưa phải đối soát/COD ledger.

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

### 6. Hồ sơ dự thi khởi nghiệp — **Người dùng đã có tài liệu riêng; dừng tạo Canva**

**Mục đích:** Có video ngắn hoặc pitch deck với hình ảnh/chứng cứ thật để trình bày sản phẩm.

**Phạm vi:** Người dùng cho biết đã có tài liệu giới thiệu và yêu cầu dừng làm phần này. Không tạo thêm thiết kế/video Canva, không ghi đè hay sửa tài liệu hiện có. Chỉ quay lại nếu người dùng yêu cầu review hoặc cập nhật.

**Phụ thuộc:** Tài liệu hiện có do người dùng quản lý; bản thân nó chưa được cung cấp để review.

**Bằng chứng:** Bản v2 [`pitch/Slink_Pitch_Vietnamese_2026-10-20-v2.pptx`](../pitch/Slink_Pitch_Vietnamese_2026-10-20-v2.pptx) là bản nháp nội bộ. Người dùng báo có tài liệu riêng; chưa thấy hoặc xác minh nội dung đó. Không tuyên bố tài liệu đã được nghiệm thu.

## Việc kế tiếp

1. **Đã triển khai trong source:** tạo nhóm biến thể, thêm SKU, sửa thuộc tính, CSV có xem trước/nhập nguyên tử và CSV cũ vẫn đọc được. Full Node/PGlite suite đạt 32/32 theo lần chạy đã ghi nhận. PostgreSQL native, trình duyệt sau migration và điện thoại còn mở.
2. **Migration và role gate PostgreSQL thật đã qua theo xác nhận người dùng:** các bước trước đó 0018–0020 đã được áp dụng; người dùng báo toàn bộ các bước gần nhất PASS. Ghi nhận là bằng chứng do người dùng xác nhận vì chưa có đầu ra chi tiết/manifest của lượt mới để đối chiếu. Migration 0021–0022 hiện là phần mới; chưa khẳng định đã áp vào cơ sở dữ liệu cửa hàng. `start-native-local.ps1` cũng tự kiểm tra role trước khi khởi chạy API.
3. **Đã triển khai trong source:** hồ sơ gian hàng/SKU mapping và ghi nhận thủ công đơn ngoài. Đơn khóa tồn khả dụng khi tạo; đóng gói chỉ đổi trạng thái; đánh dấu gửi trừ tồn và ghi thẻ kho; hủy trước khi gửi giải phóng tồn. Chống mã đơn trùng và gửi lặp, dùng khóa phiên bản, lưu lịch sử chỉ ghi thêm và lọc đầu vào. Trạng thái thanh toán chỉ là ảnh chụp nhân viên nhập, không tạo doanh thu/thanh toán/công nợ/sổ quỹ. Giao diện nói rõ chưa kết nối API sàn. Bộ Node/PGlite API hiện tại đạt 23/23, gồm luồng OMS; bộ nghiệm thu PostgreSQL cô lập đã được cập nhật nhưng chưa chạy lại. Trước khi dùng UI trên DB thật, cần backup-gated migration 0021–0022, chạy nghiệm thu PostgreSQL cô lập và khởi động API mới. Connector chỉ làm sau khi có ứng dụng đối tác, sandbox và quyền API.
4. Trước pilot, hoàn tất hosting/HTTPS, diễn tập phục hồi, kiểm tra bảo mật cần thiết, rồi để người bán thử giao diện và thiết bị thật.
5. Không tạo thêm pitch/video vì người dùng cho biết đã có tài liệu riêng; quay lại chỉ khi được yêu cầu review hoặc chỉnh sửa.
