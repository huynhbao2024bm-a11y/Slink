# Giao diện theo công việc — 2026-11-02

## Mục tiêu đã được người dùng xác nhận

Dễ sử dụng là tiêu chí số một. Được thay đổi cả giao diện lẫn cách thao tác. Tham khảo quy trình và ranh giới công việc của KiotViet/Sapo; chọn phần phù hợp thay vì đưa tất cả lựa chọn lên màn hình. Không cố định vào trà sữa: đây chỉ là ví dụ để phân biệt người quản lý với người bán.

## Những việc thật sự cần ở mỗi vị trí

| Người dùng | Mở ứng dụng để làm gì | Hiện trước | Mở khi cần |
| --- | --- | --- | --- |
| Chủ/quản lý | Bán, thêm hàng, biết tồn/tiền, chia việc | Bán hàng, Hàng hóa, Thu chi, Hôm nay | Nhân viên, khách hàng, đơn online, báo cáo, cài đặt |
| Nhân viên bán hàng (cashier) | Chọn hàng và nhận tiền | Danh sách hàng, giỏ, thanh toán | Đơn đã bán, tài khoản; mở ca khi nghiệp vụ tiền mặt yêu cầu |
| Nhân viên kho | Nhận hàng, đếm hàng | Kho, danh mục hàng | Phiếu nhập, nhà cung cấp và chuyển kho theo quyền |
| Kế toán | Xem tiền, công nợ, đối chiếu | Thu chi và báo cáo | Chi tiết phiếu, nhập hàng theo quyền |

Lời mời giữ nguyên vai trò do chủ chọn; mặc định là nhân viên bán hàng. Người nhận không tự chọn quyền chủ và không bị hỏi lại loại cửa hàng. Menu giao diện chỉ giúp tập trung; kiểm tra quyền ở máy chủ vẫn là nguồn quyết định.

## Luồng hiện thực trong bản local

- **Bán thông thường:** chọn hàng → Thanh toán → xác nhận tiền đã nhận. Tiền mặt/đúng số tiền được điền trước; chưa ghi tiền cho tới khi xác nhận. Chia nhiều cách trả, khách, ghi chú và giảm giá vẫn có khi cần. Nếu chưa mở ca, hỏi tiền thực có trong quầy và đưa trở lại đúng đơn chờ; không tự giả định tiền đầu ca. Sau khi lưu, ở lại POS; xem chi tiết đơn là lựa chọn thêm.
- **Giỏ:** hiện số lượng đã chọn ngay trên mặt hàng. Tăng/giảm không đóng giỏ. Trên điện thoại, thanh thanh toán ở phía dưới; không dùng thêm một nút giỏ trùng ở đầu trang.
- **Danh mục/kho:** hai thẻ chuyển giữa danh sách hàng và số lượng trong kho. Tạo mặt hàng có thể ghi luôn tồn đầu kỳ qua API hiện có. Nhập hàng thật dùng phiếu nhập, không nhầm thành tồn đầu kỳ.
- **Nhập hàng:** chọn hàng, số lượng và giá nhập. Tiền hàng luôn có lựa chọn rõ: chưa trả, trả đủ, hoặc nhập số đã trả. Trả đủ tự tính từ các dòng; còn nợ cần biết mua của ai. Không tự ghi chi khi chỉ chọn hàng.
- **Hôm nay:** doanh thu hôm nay trong ô xanh, ba lối tắt và thông tin cần chú ý. Báo cáo chi tiết mở riêng; lỗi tải không hiển thị như doanh thu 0.
- **Thu chi:** trước hết hiện thu/chi hôm nay và sổ. Chi tiết tiền quầy, lịch sử ca, công nợ, đặt hàng và lịch sử nhập được thu gọn, vẫn mở được.
- **Toàn ứng dụng:** nền sáng, chữ lớn hơn, nút chạm rõ, bảng dữ liệu thành từng thẻ trên điện thoại. Thông báo ngắn chỉ xuất hiện một cái mỗi lần. Hộp nhập nằm trên thanh điều hướng và có vùng cuộn riêng.

## Cấu trúc theo ngành — phạm vi phải nói đúng

| Nhóm | Tận dụng hiện có | Cần làm riêng trước khi quảng bá |
| --- | --- | --- |
| Shop hàng hóa/thời trang | Danh mục, mã hàng, nhóm màu/cỡ, kho, bán/trả hàng | Thử quy trình với dữ liệu thật của shop |
| Mỹ phẩm/hàng có hạn dùng | Danh mục, kho, giá, bán hàng | Lô/hạn dùng, quy tắc chọn lô, cảnh báo hết hạn |
| Quán đồ uống/ăn uống | Danh sách mặt hàng bán, bán/thu tiền và quản lý nhân viên | Trang nguyên liệu riêng; công thức/định lượng theo cỡ, topping; trừ nguyên liệu nguyên tử khi bán, hoàn lại khi trả/hủy theo quy tắc; bàn/bếp nếu cần |
| Online/hỗn hợp | Ghi nhận đơn kênh thủ công và luồng tồn đã có | Kết nối sàn, vận chuyển, COD phải có nhà cung cấp thật và đối soát |

Không đổi tên kho thành “quản lý nguyên liệu” rồi coi như đã có công thức. Không đưa tùy chọn bàn, bếp, lô, size/topping vào mọi cửa hàng. Các nghiệp vụ theo ngành là phần mở rộng theo mô hình; lõi bán/tồn/tiền/quyền chung cần giữ đúng.

## Nguồn tham khảo đã đọc

- KiotViet, bán hàng: https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ban-hang/ban-hang/
- KiotViet, nhập hàng: https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-giao-dich/nhap-hang/
- Sapo, phân quyền vai trò: https://help.sapo.vn/phan-quyen-vai-tro-tai-khoan-nhan-vien
- Sapo, nhập hàng: https://help.sapo.vn/thao-tac-nhap-hang-tren-phan-mem-quan-ly-ban-hang-sapo

Đây là tham khảo tài liệu công khai, không phải kết quả dùng hệ thống nội bộ của họ, cũng không chứng minh mọi quy trình của đối thủ đều phù hợp với Slink.

## Mã nguồn và bằng chứng

Nguồn nâng cấp nằm ở D:/Slink/.local-data/first-sale-release, nhánh codex/easy-operations-20261102, nền main e0eb1fc (#34). Không chép đè workspace cũ D:/Slink vì workspace đó còn nhiều thay đổi chưa phát hành. Dữ liệu thử và công cụ kiểm tra nằm trong .local-data, không đưa vào repo.

Kiểm tra giao diện có dữ liệu riêng bằng trình duyệt Edge tự động: 31 màn hình/kích thước, gồm 360, 390, 768, 1024 và 1440px; không tràn ngang toàn trang. Luồng thêm hàng + tồn đầu kỳ → mở ca lần đầu → bán → bán tiếp 3 thao tác → nhập 5 đơn vị đã trả đủ được chạy trên PGlite cục bộ; tồn đã đối chiếu: 12 → 11 → 10 → 15. Đây là kiểm tra trình duyệt mô phỏng kích thước, không phải thử điện thoại vật lý hoặc nghiệm thu production. Tệp ảnh và kết quả: D:/Slink/.local-data/easy-ui-evidence.

Đã kiểm tra thêm: chủ mời cashier → đăng ký qua lời mời → xác nhận email tự kích hoạt thành viên → đăng nhập vào POS; không có menu quản lý; máy chủ trả 403 khi tạo sản phẩm hoặc xem analytics; tăng/giảm không đóng giỏ; tải lại không hỏi thiết lập cửa hàng. Ảnh cashier-390.png và cashier-1440.png được lưu cùng bộ bằng chứng.

Cần tiếp tục: dùng thử với người bán thật; lỗi mạng/gửi lại/đồng thời; iOS/Android thật; triển khai theo yêu cầu riêng. Chưa đo hiệu năng trước/sau, không tuyên bố đã giải quyết độ trễ mạng hoặc gói hosting. Chưa đẩy GitHub hay triển khai đợt nâng cấp này.


## Bỏ khung trang, giữ vùng thao tác (2026-11-02)

Yêu cầu bổ sung: bỏ các khung làm chật. Đã bỏ viền/nền thẻ bao panel, các thẻ thống kê, khung ngoài tìm kiếm, khung link affiliate và khung nổi của thanh thanh toán. Dùng nền liền và đường phân cách; giữ ô doanh thu xanh, ô nhập, nút chính, focus bàn phím và trạng thái hàng đã chọn. Cùng lượt rà ảnh đã sửa thanh mobile hiện thừa ở desktop; kiểm tra rõ việc ẩn/hiện hai kiểu giỏ tại các breakpoint.

Edge local: 34 tổ hợp trang/kích thước 320–1440px không tràn ngang toàn trang; thử tăng/giảm vẫn giữ giỏ, bán và nhập hàng vẫn ghi đúng tồn 12→11→10→15. Ảnh, affiliate lưu link hai sàn và tải lại cũng đạt lại. Xem .local-data/open-layout-evidence và .local-data/open-layout-affiliate-evidence. Đây là kiểm tra trình duyệt máy tính mô phỏng kích thước, không phải nghiệm thu điện thoại thật hay production; chưa đo hiệu năng. Chưa đẩy/deploy.

Kiểm tra bổ sung sau khi chỉnh chữ giỏ: tổng tiền dùng chữ từ 14px, tổng phải trả 20px; bỏ câu nhắc tùy chọn lặp dưới nút Thanh toán. Luồng mở ca/bán và tăng giảm được chạy lại; ảnh cart-390.png, cart-1440.png nằm cùng bộ bằng chứng.
