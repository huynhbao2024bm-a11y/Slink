# Nền chung bán online và affiliate — 2026-11-02

## Chỉ đạo hiện hành

Người dùng muốn giảm tối đa nhập tay và tập trung vào người làm affiliate cùng chủ shop online. Affiliate có khu làm việc riêng. Sau khi được hỏi thứ tự nền tảng, người dùng chọn **làm nền chung cho TikTok Shop và Shopee trước**. Không giới hạn ngành vào trà sữa hoặc bất kỳ ví dụ nào trước đó. Các chức năng cửa hàng/POS vẫn phục vụ người có nhu cầu.

## Hai hành trình độc lập

| Người dùng | Việc chính | Hành trình mục tiêu |
| --- | --- | --- |
| Affiliate/nhà sáng tạo | Tìm sản phẩm phù hợp, lấy link có ghi nhận, theo dõi kết quả và tiền hoa hồng | Tạo tài khoản cá nhân → liên kết tài khoản creator trên sàn → chọn sản phẩm/lấy link → chia sẻ → tự cập nhật đơn/hoa hồng theo dữ liệu sàn |
| Chủ shop | Quản lý hàng, xử lý đơn, giao hàng và đối soát tiền nhận | Tạo shop → liên kết gian hàng → lấy danh sách hàng/đơn hiện có → xử lý việc cần làm → tự cập nhật vận chuyển, trả hàng, phí và đối soát |

Không bắt affiliate tạo shop, quản lý tồn hoặc mời nhân viên. Không dùng quyền creator để đọc dữ liệu seller. Người vừa có shop vừa làm affiliate có thể đổi khu làm việc; dữ liệu cá nhân và dữ liệu cửa hàng phải tách riêng.

## Những điểm được nguồn chính thức xác nhận

- Shopee Affiliate có khu tổng hợp link, hiệu suất, báo cáo click và thông tin nhận hoa hồng; link tiếp thị do Shopee cấp. Link sản phẩm thông thường không mặc nhiên trở thành link có ghi nhận hoa hồng.
- TikTok Shop có cơ chế affiliate cho nhà sáng tạo và cộng tác cho nhà bán hàng. Đơn phát sinh không đồng nghĩa hoa hồng đã được nhận; quyết toán phụ thuộc trạng thái đơn và sàn.
- TikTok có luồng cấp quyền creator riêng, khác luồng cấp quyền seller. Cần app và phạm vi quyền phù hợp; không hoán đổi URL hoặc token giữa hai loại tài khoản.
- Sapo dùng liên kết hàng/biến thể giữa shop và sàn trước khi đồng bộ tồn, giá; dữ liệu đơn, phí và tồn đi qua kết nối đã được cấp quyền. Khai báo tên shop thủ công không phải kết nối.
- Shopee có tài liệu Affiliate API ở một số thị trường. **Chưa xác minh quyền API cụ thể cho tài khoản tại Việt Nam của dự án.** Không suy ra endpoint hay điều kiện Việt Nam từ tài liệu Singapore/Thái Lan/Brazil.

## Nền đã thực thi local

1. Đăng ký chọn Chủ shop hoặc Affiliate. Affiliate không cần tên cửa hàng, không tạo store/membership giả; chế độ làm việc được lưu trên máy chủ và trả lại khi đăng nhập/tải lại.
2. Khu Affiliate riêng: lưu link TikTok Shop/Shopee, tự nhận diện nền tảng từ hostname hợp lệ, đặt tên tùy chọn, lưu chống trùng, sửa tên có kiểm tra phiên bản, sao chép link. Giữ nguyên tham số ghi nhận và fragment của link; không tự thêm mã affiliate giả. Đây là lưu link sẵn có, chưa phải API tạo link từ tài khoản sàn.
3. Dữ liệu link gắn user_id và RLS theo người dùng, không đưa vào kho/danh mục của cửa hàng. Cùng một người có shop có thể chuyển sang khu affiliate; chuyển về shop chỉ được khi có thành viên cửa hàng thật.
4. Có registry chung /api/commerce/platforms cho TikTok Shop/Shopee, phân biệt mã nền tảng và mã kênh seller hiện có. Trạng thái kết nối hiện là not_connected, earnings=null; không dựng doanh số, hoa hồng hoặc lần đồng bộ giả.
5. Shop chọn mô hình online mở vào trang đơn online, có lọc nhanh Cần đóng gói/Cần bàn giao/Đang giao, dùng dữ liệu/luồng giữ hàng/gửi/hủy hiện có. Các đơn này vẫn là đơn ghi nhận thủ công, chưa tự lấy từ sàn hoặc tạo doanh thu POS.
6. Ảnh sản phẩm: một ảnh tùy chọn khi thêm/sửa; preview, đổi/bỏ ảnh; thu nhỏ ở client, kiểm tra và mã hóa lại ở server. JPEG tối đa 256 KiB, cạnh tối đa 720px, bỏ metadata. Ảnh và sản phẩm/tồn đầu kỳ được lưu cùng transaction. Byte ảnh ở bảng riêng, danh mục chỉ có metadata; URL ảnh cần phiên thành viên cùng cửa hàng. Không lưu ảnh trên ổ tạm Render. pg_dump mặc định bao gồm bảng này.

Các thay đổi nằm tại D:/Slink/.local-data/first-sale-release, nhánh codex/easy-operations-20261102; chưa đẩy GitHub/deploy. Migration mới: 0025_product_images.sql và 0026_affiliate_workspace.sql; cần chạy trước khi khởi động mã mới trên PostgreSQL thật. Không chạy migration production trong phiên này.

## Chặng tiếp theo: tự động hóa chung, adapter riêng

| Chặng | Phạm vi triển khai | Điều kiện/bằng chứng để đạt |
| --- | --- | --- |
| A. Kết nối tài khoản | Registry platform + actor_type creator/seller; OAuth state dùng một lần, callback đúng vùng; token mã hóa phía server, refresh/revoke và phạm vi quyền theo tài khoản | Có app được cấp quyền và tài khoản thử của từng sàn, callback HTTPS; cấp quyền/thu hồi/thất bại được thử thật |
| B. Lấy dữ liệu lần đầu | Cursor đồng bộ, phân trang và backfill; khóa ngoài ổn định theo platform + account + object_id; hàng/biến thể/link/cộng tác thuộc đúng loại tài khoản | Lấy lại không tạo trùng; đối chiếu số lượng, IDs và thời điểm với sàn; không yêu cầu nhập lại từng hàng hoặc đơn |
| C. Tự cập nhật | Webhook có xác minh chữ ký, event inbox, xử lý trùng/đảo thứ tự; lịch lấy bổ sung cho phần không có webhook, refresh token và retry theo rate limit | Phát lại event không tạo trùng; sự kiện muộn không ghi đè bản mới; hiển thị thời điểm dữ liệu thật và việc cần người xử lý |
| D. Chuẩn hóa nghiệp vụ | Cấu trúc chung cho sản phẩm/biến thể, đơn/dòng hàng, hủy/trả/hoàn, phí, hoa hồng và kỳ đối soát; giữ nguyên raw provider IDs, nguồn và trạng thái gốc | Hai adapter ánh xạ được vào cùng hợp đồng mà không làm mất thông tin; giá/tồn đúng nguồn được chọn một lần |
| E. Tiền và hoa hồng | Tách dự kiến, được duyệt, có thể nhận, đã trả, đảo/thu hồi. Sổ giao dịch hoa hồng/đối soát chỉ ghi thêm; lưu external settlement/line ID, ngày và tiền tệ | Đối chiếu báo cáo sàn; đơn hủy/hoàn làm điều chỉnh đúng; không lấy tỷ lệ hiển thị nhân đơn để gọi là tiền đã nhận |
| F. Hành động ít bước | Affiliate chọn/lấy link/chia sẻ; shop thấy hàng chờ đóng gói, in/giao đúng chứng từ từ nhà cung cấp; mặc định kho/quy tắc một lần, chỉ hỏi trường thật sự thiếu | Người dùng làm hết việc mà không phải nhập lại dữ liệu sàn; các thao tác thành công có xác nhận provider và lịch sử |

Không tự đặt mã đơn, trạng thái kết nối, vận đơn, hoa hồng hoặc khoản thu. Không trừ kho hai lần khi cùng một đơn đã ghi tay rồi được lấy từ sàn. Chứng từ nhập tay phải có quy tắc ghép với mã ngoài trước khi chuyển sang đồng bộ. Ảnh/link do người dùng chọn không được gửi ra nền tảng khi chưa có tác vụ được cấp quyền.

## Phần phụ thuộc bên ngoài chưa có bằng chứng

Chưa có bằng chứng app_key/app_secret, quyền Affiliate Creator/Seller, callback đã được duyệt, tài khoản sàn đã cấp quyền hoặc báo cáo mẫu thực tế. Chỉ cần yêu cầu các phần đó khi bắt đầu chặng A/B; bí mật phải nhập riêng trên môi trường cung cấp, không gửi trong chat hoặc mã nguồn. Không gắn nút “đã kết nối” hay hứa tự động lấy dữ liệu trước khi hoàn tất cấp quyền và thử API thật.

## Kiểm tra đã chạy

- 27 kiểm tra API/nghiệp vụ và biến thể hiện có đạt sau thay đổi schema/auth.
- 2 kiểm tra ảnh mới: lưu ảnh + tồn nguyên tử, replay không tạo trùng, rollback khi audit lỗi, đọc ảnh có phiên/đúng cửa hàng, cashier đọc được nhưng không sửa, thay/bỏ ảnh, version conflict, raster lỗi/SVG bị từ chối và metadata bị loại.
- 2 kiểm tra affiliate mới: đăng ký không store, đăng nhập/tải lại đúng chế độ, link hai sàn chống trùng, cô lập người dùng, phiên bản sửa link, đổi không gian của chủ, kiểm tra URL và không dựng số tiền.
- 2 kiểm tra shell/readiness đạt. Tổng các nhóm trên: 33 test đạt, không phải tuyên bố toàn bộ bộ test của repo hoặc production đã đạt.
- Edge local: chọn ảnh từ tệp → preview → thêm → thấy ảnh POS → bỏ → thay → đọc từ phiên browser khác; affiliate không có store → lưu link hai sàn → tải lại còn link; chủ online mở đúng trang đơn; không có pageerror. Bằng chứng: .local-data/media-affiliate-evidence/results.json và PNG.
- Chưa thử iOS/Android vật lý, production PostgreSQL, restore có ảnh hoặc Docker Linux với dependency sharp mới; chưa thử kết nối API sàn thật.

## Nguồn chính thức (tra cứu 2026-11-02)

- Shopee VN, Hệ thống Affiliate: https://help.shopee.vn/portal/10/article/152867
- Shopee VN, cẩm nang: https://doitac.shopee.vn/cam-nang-affiliate/
- TikTok VN, link affiliate: https://seller-vn.tiktok.com/university/essay?knowledge_id=1679024774448913
- TikTok VN, hoa hồng creator: https://seller-vn.tiktok.com/university/essay?knowledge_id=6837840205842177
- TikTok VN, cộng tác seller: https://seller-vn.tiktok.com/university/essay?knowledge_id=10005907
- TikTok Partner, tích hợp affiliate: https://partner.tiktokshop.com/docv2/page/affiliate-integration
- TikTok Partner, creator authorization: https://partner.tiktokshop.com/docv2/page/678e3a362dccb8030ea6f98c
- Shopee Singapore, API access (không dùng để khẳng định quyền Việt Nam): https://help.shopee.sg/portal/10/article/191702-API-Access
- Sapo, cấu hình TikTok Shop: https://help.sapo.vn/cap-nhat-cau-hinh-kenh-tiktok-shop
- Sapo, kết nối các sàn: https://help.sapo.vn/ket-noi-kenh-va-gian-hang-tren-san-shopee-tiktok-shop-lazada-tiki-voi-sapo
- Sharp, xử lý ảnh: https://sharp.pixelplumbing.com/api-constructor/ và https://sharp.pixelplumbing.com/api-output/
