# Làm việc khi mất mạng

Cập nhật 04/11/2026. Bản mã cục bộ đã qua kiểm tra dưới đây; chưa commit, đẩy GitHub, migrate Supabase hoặc phát hành Render. Bản production xác minh ngày03/11 vẫn là main2d6be6e (PR36).

## Cách dùng

1. Đăng nhập hoặc tạo tài khoản khi có mạng, chọn cách sử dụng cửa hàng và để ứng dụng chuẩn bị dữ liệu. Chứng từ trên thiết bị cho biết lần chuẩn bị gần nhất.
2. Khi mất mạng, tiếp tục dùng dữ liệu đã tải. Bán hàng, nhập hàng, kiểm kê, thu/chi, mở và chốt ca được lưu trước trên máy. Mã TẠM chưa phải mã chứng từ chính thức.
3. Có mạng lại và ứng dụng đang mở hoặc vừa trở lại màn hình, hệ thống tự gửi theo thứ tự. Chỉ báo đồng bộ xong khi máy chủ nhận và số liệu trên máy được đối chiếu cùng lúc.
4. Bấm “Xem chứng từ” để xem việc đang chờ/cần kiểm tra, xem đơn tạm, thử gửi lại cùng nội dung hoặc tải bản JSON đối chiếu. Giữ dữ liệu ứng dụng trước khi đồng bộ; không tạo lại cùng giao dịch ở máy khác. Bản đối chiếu không có chức năng khôi phục tự động.

## Phạm vi hiện có

| Công việc | Khi không có mạng |
| --- | --- |
| Mở lại tài khoản đã xác nhận trên thiết bị | Có; không phải đăng nhập tài khoản mới |
| Xem/tìm mặt hàng, tồn theo kho, ảnh đã chuẩn bị | Có; danh mục phân trang được chuẩn bị theo kho được phép |
| Bán hàng, giảm giá bằng số tiền, nhiều cách trả tiền, tiền thối/còn nợ | Có với hàng/khách đã tải; tiền không phải tiền mặt do người bán ghi nhận thủ công |
| Nhận hàng từ mặt hàng sẵn có, ghi khoản đã trả/còn phải trả | Có; giữ phiên bản mặt hàng để kiểm tra khi gửi |
| Kiểm kê một mặt hàng | Có; giữ phiên bản tồn gốc, không tự ép lên tồn mới |
| Thu/chi, mở/chốt ca | Có; giữ đúng ca và số tiền dự kiến đã thấy |
| Xem lịch sử/báo cáo/khách hoặc link affiliate đã tải | Có trong phạm vi dữ liệu trên máy; ngày cập nhật được giữ |
| Trả/hủy đơn, thu/trả công nợ, điều chuyển, thay danh mục/khách/cài đặt chung | Cần mạng và đồng bộ việc đang chờ trước, vì phải kiểm tra lịch sử/quyền/phiên bản chung tại máy chủ |
| Mã ưu đãi cần kiểm tra quyền dùng, đăng nhập mới, đổi mật khẩu/quyền, mời nhân viên | Cần mạng |
| Lấy đơn, tiền, vận đơn, hóa đơn, hoa hồng từ nhà cung cấp | Cần kết nối và tích hợp thật; đợt này không tạo tích hợp sàn/ngân hàng mới |

Đơn gần đây được chuẩn bị tối đa100 đơn, chi tiết30 đơn và các đơn vừa đồng bộ; danh sách khách chuẩn bị100 hồ sơ/picker và các dữ liệu đã mở. Danh mục mặt hàng chuẩn bị mọi trang theo kho. Dữ liệu chưa có trên máy cần mạng để tải. Báo cáo cũ không được gọi là số liệu trực tiếp; tổng thu/chi giữ đúng ngày địa phương của bản dữ liệu, chứng từ chờ qua ngày vẫn hiện riêng theo ngày thực hiện.

## Quy tắc lưu và đối chiếu

- IndexedDB giữ cache và sổ chờ theo người dùng+cửa hàng. Không lưu mật khẩu, cookie, CSRF hoặc token thư xác minh trong các bản này.
- Mỗi write hỗ trợ offline được lưu bền với key và nội dung bất biến trước request đầu tiên, kể cả khi có mạng. Nếu ghi thất bại/hết chỗ, không báo đã lưu. Pending cũ đã có thể gửi qua mạng không được tự thêm metadata làm đổi hash.
- Enqueue và kiểm tra tồn/quỹ/role dùng cùng transaction giữa tab. Bộ đếm, outbox và cache epoch không bị cập nhật một nửa. Giỏ nháp cũng được nhớ lại trên thiết bị.
- Một tab gửi theo lease; tab kế tiếp sau sự cố gửi lại cùng key/delivery. Ca local được ánh xạ sang ca chính thức, delivery đã bắt đầu gửi không được đổi. Actor trong metadata ngăn gửi chứng từ dưới một tài khoản khác khi cookie đổi giữa chừng.
- Server giữ giao dịch nguyên tử: đơn, dòng hàng, thanh toán, hàng, nợ, tiền, audit và receipt. Metadata thời gian được đặt theo transaction, không rò sang request tiếp theo; receipt/audit vẫn có thời gian server.
- Chỉ chuyển sang acknowledged cùng lúc làm mới cache nền. Nếu server nhận mà response hoặc phần đối chiếu bị mất, chứng từ vẫn được giữ và gửi/đối chiếu lại an toàn; không cộng trùng projection.
- Giá/phiên bản/ca/tồn thay đổi gây conflict rõ ràng và chặn việc phía sau. Không tự đổi giá đã thu hoặc tự chốt ca khác. Người dùng cần kiểm tra tình huống thực tế; “Thử gửi lại” giữ nguyên nội dung. Không có nút âm thầm xóa/xác nhận thay người quản lý.
- Shell được cache trọn bộ theo hash nội dung tài nguyên, giữ cùng phiên bản HTML/JS/CSS khi mất mạng giữa lần tải. Cache ảnh có phiên bản và người dùng trong key. Đăng xuất không xóa chứng từ chờ; tài khoản khác không được gửi thay.
- Refresh nền giữ khung giỏ, nội dung đang nhập, tiêu điểm và vị trí cuộn. Hướng dẫn bắt đầu không giành màn hình khi người dùng đã bắt đầu một việc khác.

## Bằng chứng đã đạt cục bộ

- 56/56 kiểm tra Node API/schema/ledger. Phép tính VND nguyên, nhiều kho/giá vốn dùng chung, giữ hàng, phiên bản, quyền và ngày thu/chi được kiểm tra.
- PostgreSQL18.6 thực trong container dùng role migrator/app riêng: 3/3 kịch bản đạt, gồm migration thật, ca có thời gian quá khứ, replay, rollback xung đột và hai đơn8 sản phẩm đồng thời trên tồn12. Một đơn được nhận, một bị từ chối; tồn4 và tiền740.000đ khớp. Container thử đã xóa sau test.
- Edge mobile390: mở ca100.000đ → hai đơn80.000đ → nhập5 trả50.000đ → đếm14 → chi10.000đ → chốt200.000đ/lệch0. Bảy thao tác còn nguyên sau đóng tab/mở offline; nối mạng có đúng2 đơn, tồn14 và ca khớp.
- Ngắt response sau server commit: retry cùng key và payload, chỉ một đơn và tiền đúng. Đổi giá từ thiết bị khác: giữ conflict, không gửi việc phía sau, xuất bản đối chiếu không chứa thông tin đăng nhập, kiểm tra rồi gửi lại không thay giá đã chốt.
- IndexedDB thật: hai tab tranh tồn1 chỉ một được lưu; lease hết hạn giữ payload; ack/cache nguyên tử; quota lỗi không tạo record hoặc mất sequence; cache GET cũ không ghi đè số đã chờ/đối chiếu.
- Đóng hẳn Edge rồi mở profile khi offline: khôi phục tài khoản, ảnh, tìm hàng thứ130 ở POS và kho. HTTP503 cũng mở được dữ liệu đã lưu.
- Đăng ký demo bằng UI, chọn loại cửa hàng, mở lại offline không hỏi thiết lập lần nữa; mở ca và lưu được đơn đầu tiên.
- 115 tổ hợp trang/cỡ320/360/390/600/768/1024/1100/1280/1440, tên dài/tiền lớn/ảnh/modal: không tràn ngang toàn trang, tràn modal hoặc chồng giá/điều khiển theo phép đo. Giỏ30 dòng giữ cuộn/focus sau cộng số lượng; response danh mục chậm không đóng giỏ. POS tìm kiếm và danh sách dùng chung một cách vẽ mặt hàng.
- Docker runtime build thành công; các tệp offline/migration/CSS có trong image và JavaScript hợp lệ. Taste CSS0FAIL/0WARN; kiểm toàn bộ tệp giao diện0FAIL/1WARN về dấu phân cách trong các màn khác nhau, không phải chữ trang trí lặp trên cùng một màn.

Bằng chứng ở D:/Slink/.local-data/offline-evidence và offline-layout-evidence. Cookie/profile/tài khoản/đơn trong đó đều là dữ liệu kiểm thử riêng, không đưa thư mục này lên GitHub.

## Điều kiện trước phát hành

1. Chạy0027 bằng quy trình migration hiện có, với backup đã xác minh và đúng role. Chưa chạy trên Supabase thật trong đợt này. Runtime mới từ chối schema còn thiếu0027.
2. Khi được yêu cầu phát hành: rà đúng diff, loại docs/dữ liệu local, CI, merge main, xác minh đúng deploy và smoke trên dữ liệu được phép.
3. Chạy trên iOS/Android10+ thật, gồm quyền lưu, tắt/mở, bàn phím, camera nếu sử dụng và thay mạng. Bằng chứng Edge và PostgreSQL local không thay bằng chứng điện thoại/production.
4. Phạm vi dữ liệu đã tải, giới hạn trình duyệt/lưu trữ, khả năng xử lý conflict cần hỗ trợ và chưa có đồng bộ nền khi app bị hệ điều hành đóng phải được nói rõ. Tiếp tục đo hiệu năng với lịch sử chờ lớn; chưa tuyên bố mọi khối lượng hoặc mọi thiết bị đã nghiệm thu.

Các cổng còn lại của BUILD_CHARTER vẫn mở; đợt này không chứng minh toàn bộ sản phẩm đã đủ giao khách.

Tham khảo nền tảng: [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB), [độ bền transaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability), [lưu trữ của trình duyệt](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [PostgreSQL set_config theo transaction](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADMIN-SET).
