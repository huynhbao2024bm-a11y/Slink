# Nghiên cứu tinh gọn nghiệp vụ cửa hàng nhỏ

> **Tài liệu lịch sử, không còn là định hướng hiện hành.** Ngày 2026-10-31, người dùng làm rõ khách hàng mục tiêu là cửa hàng hiện đại như quán cà phê/ăn uống, shop thời trang, mỹ phẩm và người bán online. Nghiên cứu cập nhật nằm ở [`TARGET_CUSTOMER_WORKFLOWS.md`](TARGET_CUSTOMER_WORKFLOWS.md). Các gợi ý riêng cho tiệm tạp hóa dưới đây không được dùng làm yêu cầu sản phẩm mặc định.

**Ngày:** 2026-10-31  
**Trạng thái:** nghiên cứu và đề xuất; chưa triển khai mã nguồn.

## Thay đổi tiêu chí

Ưu tiên cửa hàng bán lẻ nhỏ tại Việt Nam, bắt đầu từ tiệm tạp hóa hoặc cửa hàng do chủ tự vận hành. Chủ có thể tự bán, gọi hàng và ghi thu chi; không bắt buộc phải có nhân viên mua hàng, thủ kho hay kế toán riêng.

Slink cần giữ sổ tồn và sổ tiền chính xác, nhưng không bắt chủ cửa hàng làm theo quy trình của doanh nghiệp lớn. Việc gọi nhà cung cấp quen vẫn có thể làm ngoài ứng dụng. Ứng dụng chỉ cần gợi ý hàng cần lấy và ghi nhận đúng hàng đã nhận.

Máy quét camera cho mặt hàng không còn là chức năng ưu tiên của luồng cửa hàng nhỏ. Tính đến 2026-10-31, workspace đã gỡ camera quét mã mặt hàng lẫn mã đơn online để bỏ quyền camera và phần xử lý ảnh dùng chung. Mã vạch vẫn là thông tin tùy chọn của mặt hàng và có thể được tìm như văn bản; thay đổi workspace chưa được nghiệm thu trên điện thoại hoặc đưa lên hosting.

## Bằng chứng và giới hạn

### Quan sát trực tiếp

Ngày 2026-10-30, ứng dụng Render được mở ở cửa sổ Chrome hẹp để quan sát cách dùng trên màn hình nhỏ:

- Phiên đang dùng chưa có sản phẩm nên không thể kiểm tra một giao dịch bán hoặc nhận hàng thật.
- Nút quét ở trang bán hàng mở camera. Trình duyệt báo chưa tự đọc được mã; bấm chụp mở biểu mẫu tạo sản phẩm mới, không đưa người bán trở lại luồng bán.
- Biểu mẫu tạo sản phẩm yêu cầu nhập tên, mã SKU và giá bán; mã vạch là mục riêng. Tồn ban đầu bằng 0 nên phải mở luồng nhập hàng thêm lần nữa.
- Luồng Nhập hàng báo phải tạo sản phẩm trước. Trang Sản phẩm có nút thêm sản phẩm nhưng không có nút quét riêng.
- Không có sản phẩm, phiếu nhập hoặc đơn nào được lưu trong lần quan sát.

Đây là quan sát trên trình duyệt hẹp, không phải nghiệm thu trên điện thoại thật. Quyền camera được cho phép một lần để quan sát màn hình quét; camera đã dừng khi đóng biểu mẫu. Không có dữ liệu mặt hàng hay giao dịch được gửi.

### Đối chiếu mã nguồn

Workspace hiện có năm vai trò: chủ cửa hàng, quản lý, thu ngân, nhân viên kho và kế toán. Mã nguồn phân quyền trang và thao tác theo vai trò; hồ sơ cửa hàng là một lớp chọn khu vực nghiệp vụ khác với quyền nhân viên.

Các khu vực bán hàng, sản phẩm, kho, đơn hàng, khách hàng, đơn online, báo cáo, nhân viên và thu chi đang tách thành các trang riêng. Tạo sản phẩm và tăng tồn cũng là hai thao tác khác nhau. Mã nguồn workspace đang có nhiều thay đổi chưa commit và không được xác nhận là cùng phiên bản với Render; vì vậy thông tin mã nguồn là đối chiếu tĩnh, không phải bằng chứng hành vi trên dịch vụ đang chạy.

### Nguồn bên ngoài

Các hướng dẫn công khai dưới đây là tài liệu của nhà cung cấp phần mềm, hữu ích để hiểu các quy trình phổ biến. Chúng không chứng minh tất cả tiệm tạp hóa đều làm giống nhau và không thay thế phỏng vấn chủ tiệm:

- Hướng dẫn KiotViet có luồng nhập hàng trực tiếp; đơn đặt hàng nhà cung cấp là một nghiệp vụ riêng. Biểu mẫu nhập cho phép thêm mặt hàng mới ngay trong luồng và ghi nhận số lượng, giá nhập, nhà cung cấp, tiền đã trả hoặc công nợ. [KiotViet — Nhập hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-giao-dich/nhap-hang/), [KiotViet — Đặt hàng nhập](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-giao-dich/dat-hang-nhap/)
- Gợi ý đặt hàng của KiotViet có thể dựa trên hàng dưới định mức, mức tồn tối thiểu/tối đa, lần đặt gần nhất hoặc lượng bán trong một khoảng thời gian. Với cửa hàng nhỏ, chỉ cần gợi ý đơn giản và cho chủ sửa số lượng trước khi gọi nhà cung cấp. [KiotViet — Đặt hàng nhập](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-giao-dich/dat-hang-nhap/)
- Shopify ghi rõ không phải lúc nào cũng cần tạo đơn mua trước khi nhận hàng; có thể ghi nhận hàng từ nhà cung cấp bằng một phiếu nhận độc lập. [Shopify — Nhận hàng từ nhà cung cấp](https://help.shopify.com/en/manual/inventory-and-locations/purchase-orders/creating-inventory-transfers)
- Tài liệu KiotViet tách thao tác bán hàng, sổ quỹ, kết ca và phân quyền nhân viên. Đây là gợi ý về ranh giới nghiệp vụ, không phải yêu cầu phải bật tất cả cho một tiệm nhỏ. [KiotViet — Bán hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ban-hang/ban-hang/), [KiotViet — Sổ quỹ](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-so-quy/so-quy/), [KiotViet — Kết ca](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ket-ca/ket-ca/), [KiotViet — Quản lý người dùng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-thiet-lap/quan-ly-nguoi-dung/)

## Luồng vận hành đề xuất

### 1. Bán hàng

1. Mở thẳng trang bán hàng.
2. Chạm vào mặt hàng thường bán hoặc tìm bằng tên/mã chữ.
3. Kiểm tra giỏ và bấm thanh toán; tiền mặt là cách điền sẵn nếu phù hợp cửa hàng.

Khách lẻ là lựa chọn mặc định. Chỉ hỏi thông tin khách khi chủ muốn ghi nợ hoặc lưu khách quen. Giảm giá, khuyến mại, đổi kho và các trường hợp đặc biệt nằm sau thao tác chính.

Một lần bán vẫn phải tạo đơn, khoản thanh toán và biến động tồn tương ứng. Đây là cách để doanh thu và kho tự cập nhật; không biến thu chi thành việc nhập số thủ công sau mỗi lần bán.

### 2. Gọi hàng từ điểm bán quen

1. Slink đưa hàng sắp hết vào danh sách “Cần lấy”, kèm số lượng đang có và số lượng gợi ý.
2. Chủ xem lại số lượng, rồi gọi hoặc nhắn cho người bán như đang làm.
3. Có thể bấm “Đã dặn lấy” để ghi nhớ; trạng thái này không tăng tồn và không tạo khoản nợ.
4. Nếu chưa cần lưu việc đã gọi, bỏ qua bước đó.

Không bắt khai báo nhà cung cấp, địa chỉ giao, ngày hẹn hay gửi đơn điện tử. Không tự đặt hàng và không tự tăng tồn chỉ vì hàng được dặn giao.

### 3. Nhận hàng

Khi hàng thực sự tới, mở “Nhập hàng nhanh”:

- Hàng đã có: chọn bằng tên, nhập số lượng thực nhận; giá nhập gợi ý từ lần trước và sửa nếu đổi.
- Hàng mới: thêm ngay trong phiếu nhận bằng tên, giá bán, số lượng vừa nhận và giá nhập; Slink tự tạo mã nội bộ. Đơn vị, nhóm hàng và mã vạch có thể bổ sung sau.
- Nhà cung cấp, ảnh biên lai và ghi chú là phần tùy chọn. Nếu chủ ghi khoản đã trả, Slink lưu khoản chi; phần còn lại mới được ghi là còn nợ.
- Một lần lưu ghi cả mặt hàng mới, tồn nhận, giá vốn, khoản đã trả/còn nợ và người thực hiện trong cùng nghiệp vụ.

Nếu giao thiếu, nhập số thực nhận. Nếu hàng chưa đến, không thay đổi tồn. Không yêu cầu người bán làm phiếu đặt hàng trước mới được nhận hàng.

### 4. Thu chi và xem tiền

- Tiền từ đơn bán, nhập hàng đã thanh toán, thu nợ và chi phí được ghi cùng nghiệp vụ gốc; không yêu cầu ghi lại lần hai trong sổ quỹ.
- Chi phí khác như điện, nước hoặc vận chuyển chỉ cần số tiền, lý do quen thuộc và cách trả. Danh mục chi tiết có thể mở rộng sau.
- Trang đầu ưu tiên doanh thu hôm nay và số tiền cần đối chiếu; lãi chỉ hiển thị khi giá vốn đủ tin cậy.
- Kết ca là bắt buộc khi cửa hàng có nhiều người dùng chung quầy hoặc cần bàn giao tiền. Tiệm chỉ có một chủ có thể dùng cách đối chiếu tiền cuối ngày gọn hơn, không bị buộc điền ca như một thủ tục.

### 5. Kiểm kê và xử lý sai sót

- Kiểm kê là việc định kỳ hoặc khi chủ thấy số trên ứng dụng không khớp hàng thật; không nằm trên màn hình bán hàng.
- Nếu sửa tồn, ghi rõ lý do và người thực hiện; không âm thầm thay đổi lịch sử.
- Trả hàng, hủy nhầm đơn và trả nhà cung cấp là việc ít xảy ra, nên nằm ở lịch sử/chi tiết giao dịch và yêu cầu xác nhận rõ tiền, hàng bị ảnh hưởng.

## Việc mỗi người cần thấy

| Người làm việc | Việc thường ngày | Màn hình ưu tiên | Ẩn khỏi màn hình chính |
| --- | --- | --- | --- |
| Chủ tiệm kiêm người bán | Bán hàng, nhận hàng, xem tiền, sửa thông tin cơ bản | Bán hàng; nhắc hàng cần lấy; thu chi hôm nay | Cài đặt sâu, nhập/xuất CSV, phân tích nâng cao |
| Quản lý | Xử lý lệch tiền/tồn, trả hàng, theo dõi nhân viên và hoạt động | Việc cần xử lý, tồn, đơn gần đây | Các bước cấu hình kỹ thuật |
| Thu ngân | Chọn hàng, thu tiền, gửi biên nhận, bàn giao quỹ nếu có | Bán hàng và ca hiện tại | Giá vốn, nhập kho, công nợ nhà cung cấp, báo cáo lãi |
| Nhân viên kho | Nhận hàng thực tế, kiểm đếm, sửa chênh lệch có lý do | Cần nhận, tồn thấp, phiếu nhận/kiểm kê | Giá trị tài chính và số dư công nợ |
| Kế toán | Đối chiếu thu chi, khoản khách/nơi bán còn nợ, chứng từ | Sổ tiền, khoản còn nợ, lịch sử nhập và bán | Lưới thao tác POS hằng ngày |
| Người xử lý đơn online | Nhận đơn từ kênh, soạn/giao và cập nhật trạng thái | Đơn online nếu cửa hàng bật hồ sơ này | Menu online trong hồ sơ tiệm chỉ bán tại quầy |

Vai trò là ranh giới quyền truy cập; hồ sơ cửa hàng chỉ giúp rút gọn menu. Chủ tiệm tự làm tất cả việc không cần tạo thêm tài khoản nhân viên. Nhân viên không nên dùng chung một tài khoản nếu cửa hàng cần biết ai đã bán, nhận hàng hoặc sửa tồn.

## Nên đưa xuống phần ít dùng

Đối với cửa hàng bán tại quầy, các mục sau không nên hiện ngay: đơn đặt hàng nhà cung cấp, kết nối kênh online, phân khúc khách, khuyến mại nâng cao, nhóm biến thể, nhiều kho, nhập/xuất CSV, báo cáo chi tiết và quản trị nhân viên. Chúng vẫn có thể được giữ cho cửa hàng thực sự cần, nhưng chỉ hiện khi hồ sơ hoặc quyền phù hợp.

Máy quét camera mặt hàng đã được bỏ khỏi luồng bán, nhận hàng và ghi nhận đơn online trong workspace. Luồng tìm tên/SKU/mã vạch gõ tay vẫn được giữ. Cần kiểm tra trực tiếp trên thiết bị rằng tìm mã vạch và nhập đơn thủ công còn hoạt động đúng.

## Thứ tự tối ưu đề xuất

1. Chốt chế độ cửa hàng nhỏ: bán hàng, kho và thu chi là các việc chính; không hỏi thêm vai trò nếu chỉ có một người.
2. Bỏ máy quét camera mặt hàng khỏi luồng bán và nhập kho; không hỏi quyền camera.
3. Gộp thêm mặt hàng mới và số lượng nhận đầu tiên vào cùng phiếu nhập.
4. Làm danh sách “Cần lấy” có số lượng gợi ý, nhưng không tự gửi đơn hay cộng tồn.
5. Rút gọn menu theo vai trò và hồ sơ; đẩy tính năng hiếm vào “Thêm”.
6. Sau khi luồng đơn giản đã ổn, mới cân nhắc các cửa hàng nhiều nhân viên, nhiều kho, bán online hoặc ngành hàng chuyên biệt.

## Tiêu chí nghiệm thu nghiệp vụ

- Chủ tiệm có thể bán món quen mà không cần mở danh mục quản trị, thêm khách hoặc quét camera.
- Hàng cũ được nhập bằng số lượng thực nhận và giá nhập hiện tại; hàng mới được tạo và tăng tồn trong cùng lần lưu.
- Khi nhận một phần, tồn tăng đúng số đã nhận; khi chưa nhận, tồn không đổi.
- Tiền đã trả, còn nợ, người ghi nhận và thời điểm khớp với chứng từ; gửi lại thao tác không nhân đôi.
- Thu ngân không thấy giá vốn hoặc nghiệp vụ tài chính không thuộc quyền; kế toán có thể đối chiếu; chủ tiệm có thể xem lịch sử.
- Nhân viên đại diện cửa hàng hiểu nhãn và hoàn thành việc chính trên điện thoại thật mà không cần hướng dẫn bằng thuật ngữ.

## Việc chưa xác minh

- Cửa hàng thật có muốn lưu trạng thái “Đã dặn lấy” hay chỉ cần nhập khi hàng tới.
- Cách tính gợi ý số lượng phù hợp từng loại tiệm và tốc độ bán; ngưỡng mặc định cần người bán thử.
- Trường nào thật sự cần khi tạo mặt hàng mới; chưa phỏng vấn đủ chủ tiệm.
- Bố cục và chữ trên iOS/Android thật, thao tác bàn giao ca, trường hợp nợ nhà cung cấp và các lỗi khi mất mạng.

Không xem nguồn tài liệu sản phẩm của đối thủ hoặc kiểm tra mã là bằng chứng người bán đã chấp nhận luồng mới.
