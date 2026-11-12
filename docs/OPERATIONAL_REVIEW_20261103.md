# Đánh giá khả năng vận hành thực tế — 03/11/2026

## Kết luận

Slink có nghiệp vụ và dữ liệu thật cho bán lẻ cơ bản, phù hợp để chạy thử có kiểm soát tại một cửa hàng, một quầy tiền, mạng ổn định. Chưa đủ bằng chứng để giao làm hệ thống vận hành duy nhất hoặc tuyên bố sẵn sàng thương mại. Với trọng tâm shop online/affiliate, các phần còn thiếu là chức năng cốt lõi, không chỉ là giao diện.

Không chấm một điểm tổng vì sẽ che mất khác biệt giữa nhóm khách hàng và giữa kiểm tra cục bộ với sử dụng thật. Một cửa hàng bán lẻ đơn giản và một quán có bếp/nguyên liệu có nhu cầu khác nhau.

## Phiên bản và phạm vi bằng chứng

- PR [#36](https://github.com/huynhbao2024bm-a11y/Slink/pull/36), nhánh nguồn `fabf904`, đã squash vào main `2d6be6e9d4cf37e3b55c731d6a31968ad4cb0084`. Đúng 12 tệp mã/kiểm tra, không có docs, dữ liệu thử hoặc bí mật.
- CI [41619226438](https://github.com/huynhbao2024bm-a11y/Slink/actions/runs/41619226438): API/schema và container đều đạt. Bộ kiểm tra local đạt 49/49.
- Render deploy `dep-dbkrelcs728c7391ca10` live đúng commit này. `/api/ready`, CSS mới và GSAP trả 200; không có log mức error trong cửa sổ kiểm tra sau deploy. Đây là bằng chứng khởi động/đọc HTTP, không chứng minh mọi giao dịch production hoạt động.
- Trình duyệt production mở được trang đăng nhập; không có phiên đăng nhập sẵn. Không xin mật khẩu, không tạo tài khoản hoặc giao dịch thử trong cơ sở dữ liệu thật. Xác nhận đăng nhập trước đó của người dùng thuộc bản sau migration 0025/0026.
- Các luồng nghiệp vụ dưới đây chạy trên PGlite riêng, dữ liệu thử, Edge desktop mô phỏng màn hình điện thoại. Chưa nghiệm thu iOS/Android thật, thiết bị in, đồng thời trên PostgreSQL production hoặc phục hồi dữ liệu mới.

## Những việc đã chạy được

| Công việc | Kết quả và bằng chứng | Giới hạn thực tế |
| --- | --- | --- |
| Khởi tạo hàng | Thêm tên/giá/tồn đầu; import, biến thể thành SKU riêng; ảnh lưu/đổi/bỏ và đọc ở phiên khác. Danh mục trống có đường bắt đầu; danh mục 130 hàng tìm được hàng cuối và phân trang đúng. | Chất lượng dữ liệu nhập và giá vốn vẫn phụ thuộc người dùng. Chưa nghiệm thu bộ dữ liệu lớn trên thiết bị thật. |
| Bán tại quầy | Chọn hàng → Thanh toán → Đã nhận tiền; đơn trả 201, tồn 12→11, ở lại POS. Tiền, tồn và mã chống gửi trùng có kiểm tra API. | QR/chuyển khoản/thẻ đang do người bán xác nhận, chưa có ngân hàng xác nhận tiền. Mở ca tiền mặt là một bước thiết lập thêm. |
| Trả hàng | Hoàn tiền, nhập lại hàng và cập nhật trạng thái đơn được chạy qua giao diện. Báo cáo doanh thu/tiền thu sau hoàn khớp 0. API giới hạn lượng trả. | Chưa thử đủ tình huống cửa hàng thật; đổi hàng thường cần trả rồi bán lại, chưa có luồng đổi hàng liền mạch. |
| Nhập và kiểm kho | Phiếu nhận hàng trả đủ qua UI; tồn và tiền đổi cùng lúc. Kiểm kê ghi số thực đếm và chênh lệch. Đặt hàng nhận từng phần, chuyển kho/nhận từng phần và kiểm kê CSV đã đạt API. | Nhiều kho có nền thật nhưng chưa nghiệm thu đồng thời giữa các máy tại production. Không có bằng chứng quản lý nguyên liệu/công thức, lô/hạn dùng hoặc serial. |
| Thu chi và công nợ | Ghi chi và chốt ca qua UI khớp số tiền thực đếm. Thu nợ khách, trả nhà cung cấp, thiếu tiền trong quầy và quyền tài chính có kiểm tra API. | Một ca tiền mặt mở cho mỗi store, chưa tách nhiều ngăn kéo/quầy độc lập. Lãi gộp phụ thuộc giá vốn, không phải lợi nhuận sau mọi chi phí. Không thay kế toán/thuế. |
| Nhân viên | Mời thu ngân, tham gia, vào POS gọn, bán và reload được. API chặn thu ngân sửa hàng/xem tài chính tổng; quản lý, kế toán, kho có phạm vi khác nhau. | Chưa có bằng chứng chấm công/tính lương hoặc quy trình bàn giao nhiều quầy. Không được coi menu ẩn là toàn bộ kiểm soát quyền. |
| Online | SKU kênh và đơn ghi tay có giữ hàng, đóng gói/gửi/hủy và lịch sử; API không tự ghi doanh thu POS cho trạng thái vận chuyển. | Chưa lấy đơn/hàng/tồn từ sàn, chưa vận đơn thật, COD/phí/đối soát chưa tự động. Chưa đủ làm trung tâm vận hành shop online. |
| Affiliate | Tài khoản không cần cửa hàng, lưu link cá nhân Shopee/TikTok, sửa tên/sao chép/tải lại; giữ tham số link. | Hiện là sổ link: chưa tạo link có xác nhận từ tài khoản sàn, chưa lấy click/đơn/chuyển đổi/hoa hồng/quyết toán. Chưa phải hệ thống affiliate đầy đủ. |

### Một ca kiểm tra qua giao diện sau khi đẩy mã

Cửa hàng thử có tiền đầu ca 100.000đ và đơn đã thu 80.000đ. Nhập thêm 5 sản phẩm, trả nhà cung cấp 50.000đ → quầy 130.000đ. Trả lại đơn, hoàn 80.000đ và nhập hàng còn bán được → quầy 50.000đ. Tồn mặt hàng sau nhập/trả là 17; kiểm kê thực đếm 16 ghi thiếu một. Ghi chi vận hành 10.000đ → quầy 40.000đ. Chốt 40.000đ có chênh lệch 0; tải lại giữ kết quả. Báo cáo doanh thu thuần và tiền thu ròng của đơn sau hoàn đều 0.

Bằng chứng: `.local-data/calm-polish/operations-results.json`, `operations-checkpoints.json`, `audit-finance-390.png`. Một số lần chạy script dừng vì bộ chọn trùng hoặc chưa đóng màn chi tiết; đã tiếp tục từ checkpoint và đối chiếu dữ liệu, không nhập/hoàn trùng. Các lỗi bộ điều khiển đó không được ghi thành lỗi sản phẩm.

## Vấn đề còn mở, theo thứ tự cần xử lý

### 1. P1 — trạng thái mạng, dữ liệu cũ và đơn chưa xác nhận

**Đã tái hiện:** đăng nhập và tải danh mục → mở Quản lý → ngắt mạng → quay về Bán hàng. Sáu mặt hàng cũ vẫn hiện; phần báo lỗi trong danh mục không xuất hiện vì có hàng để render. Toast dùng thông điệp `Failed to fetch`. Trở lại mạng và mở POS lại tải được.

Điều này không chứng minh dữ liệu bị ghi sai, nhưng người bán khó biết danh mục đang cũ hoặc máy chủ có nhận thao tác không. Không có hàng đợi bán offline/đồng bộ xung đột đã được nghiệm thu. Không quảng bá bán offline từ việc PWA mở lại được.

**Việc cần làm:** trạng thái dữ liệu cũ/mất mạng nhìn thấy lâu dài; lỗi tiếng Việt; hướng dẫn đơn chưa xác nhận và thử lại cùng mã; không báo hoàn tất khi máy chủ chưa xác nhận. **Bằng chứng đạt:** mất mạng trước/gửi xong nhưng mất phản hồi, reload, kết nối lại, thử lại và đối chiếu một chứng từ/tồn/tiền trên PostgreSQL; không cần dựa vào toast.

### 2. P1 — vận hành online/affiliate còn thiếu phần cốt lõi

Sản phẩm đang ưu tiên hai nhóm này nhưng hiện đòi hỏi nhập tay và xem tiền ở nền tảng khác. Cần chọn một luồng hoàn chỉnh có ích trước: shop lấy đơn → xử lý → nhận trạng thái giao/hoàn → đối soát; hoặc affiliate kết nối → lấy link → xem kết quả/hoa hồng đúng nguồn.

**Phụ thuộc:** tài khoản/app và quyền API được sàn cấp. **Bằng chứng đạt:** đối chiếu dữ liệu với sàn thật/sandbox được cấp, event trùng/đảo thứ tự không ghi trùng, đơn hủy/hoàn và kỳ thanh toán khớp. Xem `ONLINE_AFFILIATE_FOUNDATION.md`; không tự sáng tác endpoint/quyền.

### 3. P1 trước giao khách — dữ liệu và độ tin cậy production

Có script backup mã hóa và backup đã verify ngày 26/10; chưa có bằng chứng restore mới sau schema 0025/0026 hoặc lịch backup/giám sát tự động đang chạy. Chưa nghiệm thu cùng lúc nhiều thiết bị trên PostgreSQL production, khôi phục mật khẩu qua email thật, cài/cập nhật PWA và in/chia sẻ trên điện thoại thật.

**Bằng chứng đạt:** backup mới có thể khôi phục vào môi trường tách biệt, đối chiếu chứng từ và ảnh; diễn tập gián đoạn/retry; hai thiết bị bán cùng hàng còn ít; ma trận vai trò và thiết bị thật. Các dịch vụ gửi email/thiết bị là phụ thuộc bên ngoài khi thử.

### 4. P2 — vẫn còn biểu mẫu dài và dấu hiệu giao diện gây hiểu nhầm

Nhập hàng, trả hàng, tài chính vẫn có nhiều trường/thuật ngữ hơn POS. Kiểm kê còn tiêu đề mặt hàng khai báo inline 12px trong mã. Khối tên cửa hàng desktop có dấu sổ xuống nhưng không có luồng đổi store được nối trong mã đã rà. Các lỗi này cần xử lý theo công việc cụ thể, không chỉ tăng cỡ chữ toàn cục hoặc thêm tour.

**Bằng chứng đạt:** người dùng tự thêm hàng, nhập hàng quen, trả một phần và chốt ngày mà không cần người phát triển hướng dẫn; kiểm tra cả lỗi, sửa lại và dữ liệu dài.

### 5. Phạm vi theo ngành — không coi mọi tính năng của đối thủ là bắt buộc

- Bán lẻ thời trang/phụ kiện đơn giản: nền hiện có phù hợp để thử có kiểm soát; cần chốt ma trận vận hành thật và dữ liệu.
- Mỹ phẩm cần theo lô/hạn dùng: chưa đủ cho yêu cầu đó.
- Cafe/quán ăn có nguyên liệu, công thức, topping, bàn/bếp: chưa đủ nghiệp vụ đầy đủ; bán từng SKU đơn giản không thay được quản lý nguyên liệu/bếp.
- Shop online và affiliate: chưa đủ tự động hóa như định hướng đã chọn.
- Nhiều quầy tiền/chi nhánh: không suy ra đã hỗ trợ độc lập từ việc có nhiều kho; giới hạn một ca mở/store cần được xử lý khi nhóm này được ưu tiên.

## Giao diện và độ mượt — đã cải thiện trong phạm vi đo

Tham khảo quy trình chọn hàng, danh mục và chỉnh giỏ trong [Sapo](https://help.sapo.vn/them-san-pham-vao-don-hang) và [KiotViet](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ban-hang/ban-hang/?industry=retailer). Đây là tham khảo cách tổ chức công việc, không sao chép tài sản hay lấy danh sách chức năng làm bằng chứng đã tích hợp.

Theo phản hồi người dùng, hướng Taste đổi từ `achromatic-ledger` sang `accent-ladder` (seed 934597644): giữ xanh thương hiệu và khối doanh thu xanh, nền POS nhạt, hàng/giỏ trắng tách rõ, vẫn ba mục điều hướng. Không quay lại thẻ lồng thẻ.

Đo cùng danh mục 100 hàng, 40 dòng giỏ, 30 mẫu sau warm-up, Edge với CPU slowdown 4x:

| Chỉ số | Trước | Sau |
| --- | ---: | ---: |
| Trung vị handler thêm hàng, 390px | 13,3ms | 2,3ms |
| P95 handler, 390px | 18,2ms | 4,2ms |
| Trung vị handler, 1440px | 14,6ms | 3,9ms |
| P95 handler, 1440px | 19,2ms | 6,7ms |
| Phản hồi chuyển Hàng hóa khi cố ý làm API chậm 600ms, 390px | 761ms | 126ms |
| Cùng phép đo, 1440px | 800ms | 156ms |

Tái sử dụng bộ định dạng số/tiền, chỉ dựng lại giỏ đang nhìn thấy; mở giỏ hoặc chuyển breakpoint làm mới đúng nội dung. Chuyển danh mục phản hồi ngay khi bắt đầu tải. Không thay quy tắc tiền/tồn. Bằng chứng `perf-before.json`, `perf-after.json`, `flow-evidence`; các số này là tổng hợp cục bộ, không phải FPS, tốc độ mạng hay hiệu năng điện thoại thật.

44 tổ hợp trang/cỡ 320–1440px không tràn ngang, luồng bán, tăng/giảm giỏ, chuyển mobile/desktop, tab cài đặt và reduced-motion đạt. Đánh giá thẩm mỹ vẫn cần người dùng nhận xét; không coi số đo này chứng minh mọi người đều thấy dễ dùng.

## Đề xuất chặng kế tiếp

1. Đóng lỗi mạng/dữ liệu cũ và nghiệm thu trọn ca bán lẻ trên PostgreSQL cùng điện thoại thật. Giữ các tính năng đã có, sửa những chỗ cản trở hoàn thành công việc.
2. Chọn và hoàn tất một luồng online hoặc affiliate đầu-cuối với dữ liệu sàn được cấp quyền. Đo số lần phải nhập lại, tỉ lệ đơn cần sửa và đối soát lệch.
3. Backup/restore mới, khôi phục tài khoản và bộ kiểm tra trước phát hành thành quy trình lặp được.
4. Sau đó mới mở rộng nghiệp vụ ngành hoặc nhiều quầy theo nhóm khách đã chọn. Các cổng giao khách trong BUILD_CHARTER vẫn còn mở.
