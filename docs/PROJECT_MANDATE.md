# Slink — chỉ dẫn liên tục cho người làm sản phẩm

## Kết quả offline cục bộ (2026-11-04)

Đã tiếp tục theo yêu cầu. Sáu nhóm công việc offline và sửa responsive đã có bằng chứng local56test, PostgreSQL thật3test, UI115trang/cỡ cùng mất phản hồi/xung đột/khôi phục. Chưa phát hành; đọc OFFLINE_OPERATIONS.md và DELIVERY_ROADMAP.md. Chưa được suy ra điện thoại thật, production0027 hoặc toàn bộ cổng giao khách đã đạt. Giữ yêu cầu không tự đẩy liên tục.


## Yêu cầu mới: làm việc khi mất mạng (2026-11-03)

Người dùng yêu cầu ứng dụng vẫn làm được việc khi mất kết nối, chỉ tác vụ thật sự phụ thuộc server/provider cần mạng. Bắt đầu nhánh codex/offline-operations-20261103 từ main2d6be6e, giữ docs cũ. Đọc OFFLINE_OPERATIONS.md: cần lưu bền, sổ chờ, phục hồi, đồng bộ có chống trùng/xung đột và bằng chứng nghiệp vụ. Đợt offline chưa phát hành; không gọi cache shell hiện có là offline operations.


## Phản hồi và đánh giá mới nhất (2026-11-03)

Người dùng muốn giao diện vừa dễ nhìn vừa giữ vẻ đẹp cũ, tham khảo Sapo/KiotViet, và yêu cầu đánh giá nghiêm túc khả năng vận hành chứ không chỉ UI. PR #36 đã gộp và Render live. Đọc OPERATIONAL_REVIEW_20261103.md: các luồng bán lẻ cơ bản có bằng chứng local, nhưng offline, online/affiliate, khôi phục và nghiệm thu thiết bị/production còn mở. Không tuyên bố giao khách được chỉ vì CI hoặc giao diện đạt.

## Thay đổi toàn diện theo công việc (2026-11-03)

Người dùng yêu cầu áp dụng Taste, GSAP và Playwright; bản trước vẫn ngột ngạt và khó sử dụng. Giảm lựa chọn cùng lúc, tách quản lý khỏi việc bán, chia từng phần cài đặt, dùng ngôn ngữ thường ngày và kiểm tra thao tác thật. Đọc UX_CALM_REDESIGN_20261103.md trong nhánh đang làm. Chưa tự đẩy đợt mới. Production đã chạy main3994e39; lỗi đăng nhập do thiếu 0025/0026 được xử lý bằng workflow41609650950 và người dùng xác nhận đăng nhập lại được.

## Giao diện thoáng, ít khung (2026-11-02)

Người dùng muốn bỏ các khung bao gây chật: ưu tiên nền liền, khoảng cách và đường phân cách nhẹ. Áp dụng cho các khu bán hàng, hàng hóa, thu chi, cài đặt và affiliate. Giữ trạng thái chọn, tiêu điểm bàn phím, ô nhập và nút hành động rõ ràng; ô doanh thu xanh tiếp tục được giữ. Không thay quy tắc nghiệp vụ chỉ để bỏ khung.


## Ưu tiên mới nhất — online và affiliate (2026-11-02)

Người dùng muốn giảm tối đa thao tác tay, chuyển trọng tâm tới affiliate và chủ shop online. Chọn làm nền chung cho TikTok Shop và Shopee trước, affiliate có khu riêng và không phải tạo cửa hàng. Ảnh sản phẩm là tùy chọn. Đọc ONLINE_AFFILIATE_FOUNDATION.md cho nguồn nghiên cứu, phần đã làm và các chặng tự động hóa; không coi khai báo gian hàng/lưu link là kết nối API sàn.


## Chỉ đạo mới nhất — 2026-11-02

Người dùng cho phép thay đổi toàn bộ giao diện và cách dùng. Tiêu chí hàng đầu là dễ sử dụng, làm việc thường ngày trong vài thao tác. Tách màn hình theo công việc: chủ quản lý, nhân viên bán bằng POS gọn, người làm kho xử lý hàng. Trà sữa chỉ là ví dụ; không cố định vào một ngành. Tham khảo KiotViet và Sapo rồi chọn phần phù hợp. Đọc UX_REDESIGN_20261102.md trước khi tiếp tục đợt nâng cấp; yêu cầu mới này thay thế ràng buộc giữ nguyên giao diện cũ. Chưa tự phát hành khi chưa được yêu cầu.


> Đọc trang này trước mỗi phiên làm việc. Mục đích của nó là giữ nguyên mục tiêu của người dùng qua nhiều phiên, tránh biến một giao diện đẹp hoặc MVP thành lời tuyên bố sản phẩm đã xong.

## Mục tiêu không được thu nhỏ

Xây **Slink** thành sản phẩm bán hàng và vận hành có thể giao cho khách hàng và dùng trong kinh doanh thật, trên các thiết bị iOS/Android được hỗ trợ; giữ giao diện và hướng thiết kế người dùng đã duyệt. “Hoàn thành” nghĩa là doanh nghiệp thật có thể bắt đầu, bán/nhận hàng, quản lý tồn và tiền chính xác, tìm lại chứng từ, dùng trên thiết bị của họ, phục hồi dữ liệu và nhận hỗ trợ đáng tin cậy.

**Hướng khách hàng hiện tại (2026-10-31):** cửa hàng độc lập và nhóm bán hàng hiện đại như shop thời trang, mỹ phẩm/chăm sóc cá nhân, quán cà phê/ăn uống, người bán online và mô hình kết hợp. Tiệm tạp hóa truyền thống không còn là khách hàng mặc định; siêu thị/chuỗi lớn chưa phải đích ban đầu. Chưa chốt ngành hàng mở màn. Ưu tiên dễ bắt đầu, đúng quy trình và minh bạch tiền/tồn; không chạy đua số lượng chức năng. Chọn phân khúc sau quan sát người bán thật, theo [`PROJECT_PLAN.md`](PROJECT_PLAN.md), không suy ra từ tài liệu đối thủ hoặc mã nguồn đơn thuần.

Giao diện demo, dữ liệu mẫu, mã nguồn có sẵn, API có mặt, cú pháp đúng hay một MVP hoạt động được một phần **không** chứng minh mục tiêu này đã đạt. Không gọi Slink là hoàn thiện hoặc sẵn sàng bán cho tới khi toàn bộ cổng trong [`BUILD_CHARTER.md`](BUILD_CHARTER.md) có bằng chứng phù hợp.

## Cách bắt đầu mỗi phiên

1. Đọc trang này, [`BUILD_CHARTER.md`](BUILD_CHARTER.md), [`DELIVERY_ROADMAP.md`](DELIVERY_ROADMAP.md), [`EXECUTION_PLAN.md`](EXECUTION_PLAN.md), rồi [`PRODUCT.md`](PRODUCT.md) nếu sửa luồng nghiệp vụ. Xem [`README.md`](README.md) để hiểu vai trò các tài liệu.
2. Kiểm tra trạng thái workspace, mã nguồn, dịch vụ đang chạy và cấu hình hiện tại. Dùng bằng chứng hiện tại làm chuẩn; không dựa vào trí nhớ hoặc lời khẳng định trước đây.
3. Chọn việc kế tiếp từ [`PROJECT_PLAN.md`](PROJECT_PLAN.md) và [`EXECUTION_PLAN.md`](EXECUTION_PLAN.md), ưu tiên rủi ro dữ liệu/quyền, độ đúng của giao dịch, khả năng dùng trên thiết bị hoặc vận hành. Không chọn việc chỉ dễ làm nếu nó giữ sản phẩm ở trạng thái demo.
4. Làm hết phần có thể hoàn thành trong workspace; nếu một phụ thuộc bên ngoài chặn một phần, tiếp tục các phần độc lập và ghi rõ chính xác điều gì đang thiếu.
5. Sau thay đổi, cập nhật lộ trình/tài liệu liên quan và kiểm tra bằng chứng đúng tầm với yêu cầu. Nếu chỉ kiểm tra tĩnh, phải ghi là kiểm tra tĩnh; không suy ra giao dịch hoặc nền tảng đã được nghiệm thu.

## Chỉ đạo triển khai mới nhất của người dùng (2026-10-31)

- Hành trình ưu tiên mới: đăng ký cửa hàng → chọn loại hình kinh doanh → thêm vài mặt hàng hoặc nhập danh sách có sẵn → bán ngay → bổ sung dữ liệu khi phát sinh nhu cầu. Thay đổi cả giao diện và hành vi; không chỉ đổi chữ hoặc ẩn nút. Thông tin bổ sung không được làm sai tiền/tồn hay biến luồng chưa có thành chức năng giả.
- Tiếp tục triển khai trong workspace. Chỉ đưa lên GitHub/main hoặc triển khai khi người dùng yêu cầu lại; không tự đẩy sau mỗi lát cắt. Người dùng tự thử thực tế, gửi log để sửa; ghi rõ những gì chưa được kiểm chứng.
- Tập trung vào quy trình và nghiệp vụ của shop/quán hiện đại, không mặc định tiệm tạp hóa; chọn nhóm đầu tiên sau khi nghiên cứu người bán thật.
- Đơn giản hóa đường đi, chữ và số lựa chọn; giữ đầy đủ tính đúng đắn của tiền, tồn, quyền và lịch sử. Hồ sơ kinh doanh, công việc nhân viên và quyền tài khoản là các khái niệm riêng.
- Ưu tiên rủi ro dữ liệu/quyền production trước khi thêm người dùng hoặc dữ liệu thật; phân biệt trạng thái Render/Supabase quan sát được với thay đổi workspace chưa phát hành.
- Sau khi có bằng chứng của pilot, triển khai lần lượt các nghiệp vụ còn thiếu; không làm tất cả ngành cùng lúc.
- Chỉ dùng kiểm tra tự động có trọng tâm cho dữ liệu, giao dịch, quyền, bảo mật, sao lưu hoặc khôi phục. Giao diện và trải nghiệm sử dụng thực tế cần người thật thử.
- Luôn dùng [`EXECUTION_PLAN.md`](EXECUTION_PLAN.md) để chọn việc kế tiếp; cập nhật kế hoạch và [`DELIVERY_ROADMAP.md`](DELIVERY_ROADMAP.md) sau mỗi lát cắt.
- Chuẩn bị video demo hoặc pitch deck trung thực cho cuộc thi khởi nghiệp khi có lát cắt sản phẩm trình bày được; không cần chờ toàn bộ sản phẩm hoàn tất.

## Cách đánh giá một luồng kinh doanh

Một luồng chỉ được xem là hoạt động khi cùng có bằng chứng rằng:

- đúng thành viên, vai trò, cửa hàng và quyền được kiểm tra ở máy chủ;
- dữ liệu nhập được xác thực và quy tắc tiền VND, làm tròn, tồn, công nợ, thanh toán và trả hàng được xác định;
- mọi thay đổi liên quan được ghi nguyên tử vào chứng từ và sổ phù hợp; không bán âm kho, hoàn quá số lượng, thu/chi lặp hoặc sửa mất lịch sử;
- có mã chống gửi trùng, khóa/kiểm soát xung đột, người thực hiện, thời điểm và lý do cần thiết;
- lỗi, mất kết nối, gửi lại, tải lại trang và đổi thiết bị có trạng thái dễ hiểu, không báo thành công giả;
- số liệu báo cáo khớp với đơn, thanh toán, hoàn tiền, tồn kho và sổ quỹ;
- kiểm thử chấp nhận bao phủ luồng thuận lợi, biên, quyền bị từ chối, thử lại, đồng thời và sự cố;
- giao diện và thao tác được kiểm tra ở kích thước/thiết bị mục tiêu.

Mọi chức năng thanh toán, hóa đơn, vận chuyển, đồng bộ offline, backup/restore hoặc email chỉ được coi là đã tích hợp sau khi nhà cung cấp thật hoặc sandbox được cấu hình và luồng đầu-cuối thành công. Chọn “QR”, “chuyển khoản” hay “thẻ” không xác nhận tiền đã nhận.

## Nguyên tắc làm việc

- Bảo toàn giao diện đã duyệt; chỉ thay đổi để giúp hoàn thành công việc, dễ tiếp cận hoặc phù hợp nền tảng.
- Dữ liệu sản phẩm và giao dịch thật thuộc máy chủ; `localStorage`/dữ liệu seed không bao giờ thay thế nguồn dữ liệu đó.
- Tiền lưu dưới dạng số nguyên VND; kho, công nợ, trả hàng và tiền mặt phải có sổ truy vết.
- Không tạo nút giả, thông báo thành công giả, dữ liệu mẫu trong cửa hàng thật hay tính năng chỉ chạy trên một thiết bị nhưng được quảng bá là đồng bộ.
- Dùng nguồn chính thức và hiện hành cho hành vi nền tảng/nhà cung cấp; ghi nguồn và phân biệt sự kiện với suy luận.
- Không tự tạo bí mật, tài khoản, tài khoản ngân hàng, email, giấy tờ pháp lý, quyền truy cập, thiết bị thử nghiệm hoặc bằng chứng triển khai.
- Không chạy hay thêm kiểm thử khi chỉ thị cấp cao hơn cấm; trong mọi trường hợp không mô tả kiểm tra cú pháp như nghiệm thu sản phẩm.

## Khi nào được dừng để yêu cầu đầu vào

Không dừng chỉ vì công việc khó, rộng hoặc cần nhiều phiên. Chỉ yêu cầu người dùng cung cấp phần mà không thể lấy an toàn trong workspace, chẳng hạn thông tin truy cập cơ sở dữ liệu/hosting, tài khoản nhà cung cấp thật, email gửi thư, phê duyệt pháp lý, hoặc quyền sử dụng thiết bị thử nghiệm. Trước khi hỏi, hoàn tất phần độc lập; nêu tên chính xác phụ thuộc, vì sao cần và cổng nào nó mở. Không gửi dữ liệu hay thay đổi hệ thống bên ngoài khi chưa được ủy quyền.

## Nguồn trạng thái và mục đích từng tài liệu

- [`BUILD_CHARTER.md`](BUILD_CHARTER.md): nguồn chuẩn cho mục tiêu, định nghĩa hoàn thành và cổng giao khách.
- [`PROJECT_PLAN.md`](PROJECT_PLAN.md): hướng khách hàng hiện hành, cách chọn phân khúc mở màn, các chặng và điều kiện hoàn tất.
- [`PRODUCT.md`](PRODUCT.md): hành vi mong muốn, luồng và hướng trải nghiệm.
- [`DELIVERY_ROADMAP.md`](DELIVERY_ROADMAP.md): nguồn chuẩn duy nhất cho hiện trạng đã chứng minh, thiếu sót, thứ tự việc và bằng chứng.
- [`BACKEND_SETUP.md`](BACKEND_SETUP.md): cách chạy và cấu hình phần máy chủ; không đồng nghĩa môi trường thật đã tồn tại.
- [`decisions/`](decisions/): quyết định kỹ thuật đã có căn cứ và điều kiện xem xét lại.
- [`README.md`](README.md): lối vào ngắn cho người phát triển/người dùng; không thay thế đặc tả hoặc bằng chứng.

Nếu một tài liệu cũ mâu thuẫn với mã nguồn hoặc môi trường hiện tại, kiểm tra mâu thuẫn, sửa tài liệu theo bằng chứng và giữ nguyên mục tiêu giao khách. Xem bản đồ tài liệu tại [`README.md`](README.md).
