# Khách hàng mục tiêu và quy trình vận hành của Slink

**Ngày:** 2026-10-31  
**Trạng thái:** nghiên cứu định hướng; chưa có phỏng vấn đại diện và chưa phải phạm vi đã chốt.

## 1. Điều chỉnh hướng khách hàng

Tiệm tạp hóa truyền thống không còn là khách hàng mặc định của Slink. Hướng cần nghiên cứu là cửa hàng và nhóm bán hàng hiện đại: quán cà phê/ăn uống, shop thời trang, mỹ phẩm, người bán online và mô hình vừa bán tại quầy vừa bán qua mạng. Giai đoạn đầu không nhắm giải quyết vận hành của siêu thị lớn hay chuỗi nhiều cấp.

Lợi thế mong muốn là **dễ bắt đầu và dễ làm đúng việc hằng ngày**. Chỉ mở app rồi nhìn thấy nhiều menu là chưa đủ: cần thiết lập ít, tên gọi quen, tác vụ xuất hiện đúng lúc, và một giao dịch bán/nhập vẫn cập nhật đúng tồn, tiền và lịch sử. Không thể lấy chữ “dễ dùng” làm lý do bỏ qua các bước nghiệp vụ thiết yếu.

Đây là giả thuyết sản phẩm. Cần quan sát người đang làm việc và thử theo tình huống thật trước khi chốt ngành hàng mở màn.

## 2. Cách nghiên cứu và giới hạn

- Đã xem hướng dẫn vận hành công khai của KiotViet và Sapo, tập trung vào quy trình theo ngành thay vì so quy mô công ty.
- Đã đối chiếu tĩnh cấu trúc nghiệp vụ trong workspace. Mã ở workspace có thể khác bản Render và nhiều thay đổi chưa được đưa lên hosting; đây không phải chứng nhận các chức năng chạy đúng.
- Quan sát Render trước đây diễn ra trong tài khoản chưa có sản phẩm, nên chỉ thấy được màn hình trống và đường đi giữa các chức năng. Không thể dùng lần đó để kết luận bán hàng, nhập kho hoặc phân quyền hoạt động thế nào với dữ liệu thật.
- Chưa phỏng vấn chủ shop, thu ngân, nhân viên phục vụ, nhân viên kho hoặc kế toán; chưa thử bằng điện thoại thật. Tài liệu nhà cung cấp thể hiện chức năng của sản phẩm họ, không chứng minh mọi cửa hàng đều cần các chức năng đó.

## 3. Quy trình dùng chung

Các mô hình đều cần một nền vận hành có thể kiểm tra được:

1. **Bắt đầu:** khai báo cửa hàng, chọn cách kinh doanh và việc người dùng đảm nhận; thêm danh sách hàng/menu bằng cách phù hợp quy mô.
2. **Bán:** chọn hàng/món, số lượng và lựa chọn cần thiết; xác nhận giá và cách thanh toán.
3. **Nhập hàng:** ghi mặt hàng, số lượng nhận thật, giá vốn và khoản đã trả/còn phải trả.
4. **Xử lý sai:** tìm lại đơn, đổi/trả/hủy đúng trạng thái và ghi lý do.
5. **Đối chiếu:** xem tiền vào/ra, ca hoặc người chịu trách nhiệm, hàng lệch và lịch sử thay đổi.

Những bước này nên dùng chung quy tắc dữ liệu và lịch sử, nhưng cách thao tác phải theo công việc. Không bắt người phục vụ quán cà phê nhìn thấy màn hình quản lý lô hàng; không bắt người xử lý đơn online đi qua màn hình bàn ăn.

## 4. Quy trình riêng theo mô hình

### Quán cà phê và ăn uống

Luồng tại chỗ thường đi từ chọn bàn hoặc loại đơn → gọi món → chọn size/topping/ghi chú → gửi món xuống quầy pha chế/bếp → phục vụ → thanh toán. Trong lúc phục vụ có thể đổi bàn, hủy món, tách/gộp hóa đơn hoặc ghi nhận đơn mang đi/giao hàng. Phần kho có thể theo dõi món bán sẵn hoặc nguyên liệu theo công thức; không nên yêu cầu mọi quán khai báo công thức phức tạp ngay từ đầu.

Tài liệu Sapo mô tả chuỗi bàn → thực đơn → lưu hóa đơn → chuyển bếp → phục vụ → thanh toán, cùng các đường xử lý bàn, đơn và vai trò nhân viên ([Sapo — tạo hóa đơn FnB](https://help.sapo.vn/huong-dan-tao-hoa-don-ban-hang-tren-sapo-fnb), [Sapo — thao tác trên đơn FnB](https://help.sapo.vn/thuc-hien-thao-tac-tren-don-hang-tren-ung-dung-sapo-fnb)). KiotViet mô tả menu, món chế biến, topping và nguyên liệu ([KiotViet — quản lý món trong thực đơn](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-hang-hoa/quan-ly-mon-trong-thuc-don/), [KiotViet — gọi món](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-goi-mon/goi-mon/)).

**Điều đó có nghĩa với Slink:** nếu nhận quán ăn/cà phê là khách hàng chính thì cần khảo sát bàn, đơn đang mở, sửa/hủy món có báo bếp, thanh toán và ca. POS sản phẩm thông thường chưa thay thế được quy trình này.

### Shop thời trang

Hàng thường có màu và size; mỗi phiên bản phải có tồn và giá/mã nhận diện phù hợp. Nhập hàng phải chọn đúng phiên bản; bán tại quầy hoặc đơn online phải trừ đúng phiên bản; đổi size/màu phải đưa hàng cũ về kho và thu/hoàn phần chênh lệch; giữ hàng, đặt cọc và hàng mùa vụ có thể là nhu cầu tùy shop.

Hướng dẫn KiotViet nêu tồn theo size/màu, đổi trả và đồng bộ đa kênh trong bối cảnh shop thời trang ([KiotViet — giải pháp shop quần áo](https://www.kiotviet.vn/phan-mem-ban-hang-thoi-trang)); luồng trả hàng/đổi hàng có thể chọn hàng trả và hàng đổi, rồi tính chênh lệch ([KiotViet — trả hàng và đổi hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-tra-hang/tra-hang/)).

**Điều đó có nghĩa với Slink:** nhóm biến thể hiện có là nền phù hợp để đánh giá, nhưng cần chứng minh thao tác chọn size/màu, nhập theo biến thể, đổi hàng và tồn sau đổi trên thiết bị thật. Chưa coi đối chiếu mã nguồn là nghiệm thu.

### Shop mỹ phẩm và chăm sóc cá nhân

Ngoài phiên bản theo màu/dung tích, một số sản phẩm cần theo dõi lô và hạn sử dụng, cảnh báo sắp hết hạn, xuất lô gần hết hạn trước, xử lý hàng hỏng/đổi trả và theo dõi giá vốn theo lô. Không phải mọi mỹ phẩm đều cần bật quản lý lô, nên đây phải là lựa chọn theo mặt hàng hoặc nhóm hàng.

KiotViet mô tả quản lý lô/hạn dùng, gợi ý FEFO, nhập hàng theo lô và báo cáo hàng cận hạn ([KiotViet — nghiệp vụ ngành mỹ phẩm](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-chuyen-nganh/nganh-my-pham/)).

**Điều đó có nghĩa với Slink:** tồn tổng hợp hiện tại không đủ để tuyên bố quản lý mỹ phẩm có hạn dùng. Cần thiết kế và nghiệm thu lô/hạn sử dụng trước khi nhắm các shop mà hạn dùng là rủi ro chính.

### Người bán online và shop bán cả online lẫn tại quầy

Luồng đầy đủ gồm nhận đơn từ kênh → ghép SKU của kênh với sản phẩm → giữ đúng tồn → chọn/đóng gói → bàn giao vận chuyển → theo dõi giao/hủy/trả → đối chiếu COD, phí và tiền thực nhận. Trạng thái đơn có thể khác nhau theo từng sàn; đồng bộ lỗi và hàng chưa ghép mã cũng là việc phải xử lý, không chỉ là màn hình danh sách đơn.

Tài liệu KiotViet mô tả kết nối sàn, ghép sản phẩm, đồng bộ tồn và đơn, xử lý đơn chờ, hủy, vận chuyển và trả/hoàn ([KiotViet — kết nối sàn thương mại điện tử](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ban-online/ket-noi-san-tmdt/)).

**Điều đó có nghĩa với Slink:** nhập đơn thủ công có thể giúp ghi nhận quy trình nhưng không được gọi là đồng bộ online. Kết nối thật cần chọn nhà cung cấp/kênh trước, xử lý quyền truy cập, thay đổi trạng thái, gửi lại an toàn và đối soát tiền.

## 5. Ai làm việc gì

Vai trò công việc và quyền tài khoản là hai việc khác nhau. Một chủ shop có thể kiêm bán hàng, nhập hàng và thu chi; nếu có nhân viên thì mỗi người cần tài khoản/quyền riêng để biết ai đã thao tác.

| Người dùng | Việc chính trong ngày | Màn hình nên ưu tiên | Cần giới hạn |
| --- | --- | --- | --- |
| Chủ shop | Xem tình hình, duyệt giá/chi, nhận hàng, xử lý ngoại lệ, quản lý người dùng | Việc cần làm, doanh thu/tiền, tồn, lịch sử | Thiết lập nâng cao chỉ hiện khi cần |
| Quản lý ca/cửa hàng | Chia việc, xử lý sai đơn, bàn giao tiền, theo dõi tồn | Đơn/ca đang mở, cảnh báo, việc chờ xử lý | Không nhất thiết có quyền đổi mọi cấu hình hoặc xóa lịch sử |
| Thu ngân/bán tại quầy | Chọn đúng hàng, nhận thanh toán, gửi biên nhận, xử lý hủy theo quyền | POS, tìm hàng, giỏ hiện tại, ca nếu có | Ẩn giá vốn, báo cáo lãi, quản lý nhân sự |
| Nhân viên phục vụ | Chọn bàn/loại đơn, ghi món và yêu cầu của khách, theo dõi trạng thái món | Khu vực/bàn và đơn đang phục vụ | Không hiển thị báo cáo tiền/kho không cần thiết |
| Nhân viên pha chế/bếp | Nhận thứ tự món, xem ghi chú, báo món xong hoặc hết món | Danh sách phiếu cần làm | Không phải thao tác lại đơn bán/thu tiền |
| Nhân viên kho/nhận hàng | Nhận đúng sản phẩm/biến thể/lô, đếm số thật, báo lệch | Phiếu nhận, kiểm đếm, hàng cần xử lý | Không xem dữ liệu khách và báo cáo lợi nhuận nếu không cần |
| Nhân viên xử lý đơn online | Ghép hàng, lấy/đóng gói, bàn giao, xử lý đơn lỗi/hủy/trả | Đơn mới và danh sách việc theo trạng thái | Không phải vào từng kênh để chép tay nếu đã có tích hợp; trước đó phải ghi rõ đang làm thủ công |
| Kế toán/người đối soát | Kiểm tra tiền, công nợ, phí, hóa đơn/chứng từ và lịch sử | Sổ tiền, khoản phải thu/trả, đối soát | Không cần màn hình POS để bán từng món |

Nếu một người kiêm nhiều việc, giao diện có thể gộp lối vào; quyền máy chủ vẫn phải tách thao tác nhạy cảm và lưu người thực hiện.

## 6. Phần Slink có thể chen vào

### Điểm khác biệt cần kiểm chứng

Không cạnh tranh bằng cách có nhiều menu hơn. Giả thuyết đáng thử là giúp shop nhỏ:

- mở lên là thấy đúng việc của mình, không bắt học cấu hình trước;
- thêm hàng, biến thể, menu và tồn bằng cách ngắn phù hợp dữ liệu đang có;
- bán/nhận hàng xong thì tiền và tồn tự theo đúng sổ, không nhập lại ở hai nơi;
- xử lý lỗi, đổi trả và bàn giao theo hướng dẫn bằng tiếng đời thường;
- chỉ mở chức năng chuyên sâu khi mô hình hoặc người dùng thực sự cần.

Hướng dẫn của các nhà cung cấp cho thấy họ không dùng một màn hình cho tất cả: quán ăn có luồng bàn/đơn/bếp; thời trang nhấn vào biến thể và đổi trả; mỹ phẩm có lô/hạn dùng; online có đồng bộ và trạng thái giao. Bài học nên lấy là **hoàn tất trọn việc của từng vai trò và đặt lựa chọn nâng cao đúng chỗ**, không sao chép toàn bộ menu hoặc cài đặt của họ.

“Dễ dùng” phải đo được bằng thời gian hoàn tất tác vụ, số lần quay lại, lỗi chọn nhầm, số trường bắt buộc và khả năng tự làm sau hướng dẫn ngắn. Không dùng lời quảng cáo hoặc số lượng bước trên mockup làm bằng chứng.

### Mức phù hợp hiện tại (đối chiếu tĩnh workspace)

| Mô hình | Nền đang có trong workspace | Khoảng trống lớn trước khi chào đúng nghiệp vụ |
| --- | --- | --- |
| Shop sản phẩm, gồm thời trang | Bán hàng, sản phẩm/biến thể, tồn, nhập, trả hàng và thu chi có trong cấu trúc | Chứng minh chọn biến thể nhanh, nhập theo biến thể, đổi hàng/hoàn tiền và cách dùng mã vạch trên thiết bị thật |
| Mỹ phẩm | Danh mục, bán, nhập và tồn chung | Lô/hạn sử dụng, FEFO, cảnh báo cận hạn và truy xuất lô chưa được xác nhận |
| Quán cà phê/ăn uống | POS sản phẩm và danh mục cơ bản | Bàn/đơn mở, menu có size/topping, phiếu bếp/bar, công thức trừ nguyên liệu và các thao tác tách/gộp |
| Bán online | Đơn kênh ghi nhận thủ công và luồng kho liên quan có trong source | Kết nối sàn, SKU mapping đáng tin cậy, trạng thái đồng bộ, vận chuyển, COD/phí và trả hàng |

Đây là bản đồ để chọn phần cần làm, không phải chứng nhận bất kỳ dòng nào đã hoạt động ở Render. Hiện chưa có đối thủ cạnh tranh nào bị “vượt qua” bởi bằng chứng sử dụng thật.

### Cách vào thị trường ít rủi ro hơn

1. Giữ một lõi chung: mặt hàng/menu, bán, nhận hàng, tồn, thu chi, trả/hủy và lịch sử.
2. Để người dùng chọn **mô hình kinh doanh** và **việc mình đảm nhận** riêng. Lựa chọn chỉ sắp xếp màn hình/hướng dẫn; nó không tự cấp quyền và không khóa dữ liệu.
3. Không cố ra mắt mọi nghiệp vụ ngành cùng lúc. Chọn một nhóm thử nghiệm mở màn dựa trên người có thể tiếp cận và khoảng trống nhỏ nhất sau khi quan sát thực tế.
4. Làm trọn một luồng có đầu-cuối cho nhóm đó, gồm ngoại lệ thường gặp; đo thời gian và lỗi trước/sau.
5. Chỉ mở rộng sang nhóm kế tiếp khi luồng lõi không làm sai tiền/tồn và người dùng tự làm được trên thiết bị của họ.

**Giả thuyết mở màn để đem đi kiểm chứng:** thử trước với shop thời trang bán tại quầy, vì luồng biến thể, POS, tồn và đổi/trả gần với nền hiện có hơn F&B đầy đủ, mỹ phẩm quản lý lô/hạn dùng hoặc đồng bộ nhiều sàn. Đây là suy luận từ mã nguồn và tài liệu đối thủ, chưa phải quyết định chốt phân khúc; nếu người thử dễ tiếp cận nhất thuộc nhóm khác thì phải đánh giá lại theo nhu cầu của họ.

Thứ tự mở rộng có thể là: (1) shop sản phẩm có biến thể; (2) shop online khi chọn được kênh/tích hợp cụ thể; (3) mỹ phẩm có hạn dùng sau khi có lô/FEFO; (4) quán cà phê/ăn uống sau khi có bàn, menu/tùy chọn, bếp/bar và kiểm soát nguyên liệu. Thứ tự này là đề xuất để giới hạn rủi ro phát triển, không phải đánh giá ngành nào ít giá trị hơn.

## 7. Lựa chọn camera quét mã còn mở

Camera đã bị gỡ khỏi workspace trong lần tối ưu trước, khi giả định tiệm tạp hóa là khách hàng chính. Với shop thời trang/mỹ phẩm, quầy bán và kho nhận nhiều SKU, quét mã có thể giảm thời gian tìm hàng; với quán ăn hoặc người bán online, lợi ích khác nhau. Vì vậy **không coi việc bỏ scanner là quyết định sản phẩm cuối cùng**.

Giữ mã hàng/mã vạch ở dữ liệu và tìm kiếm văn bản. Chỉ quyết định khôi phục quét camera hoặc dùng máy quét rời sau khi quan sát ít nhất các tác vụ bán/nhận hàng và kiểm tra thiết bị thực tế. Nếu camera không giúp giảm lỗi/thời gian thì không thêm lại chỉ vì đối thủ có.

## 8. Bước nghiên cứu và nghiệm thu tiếp theo

1. Quan sát lần lượt người bán tại quầy, người phục vụ/pha chế, người nhận hàng và người xử lý đơn online; xin họ làm việc như thường lệ, không dạy cách dùng app trước.
2. Ghi từng tác vụ, dữ liệu phải nhập, chỗ hay sai, việc làm ngoài app và trường hợp ngoại lệ.
3. Chọn một phân khúc mở màn; lập bảng “có trong source / chạy được / được người dùng chấp nhận / thiếu”.
4. Thử trên dữ liệu giả ở thiết bị thử nghiệm, không ghi vào shop thật nếu chưa được đồng ý.
5. Với tiền và tồn, xác nhận đơn, thanh toán, biến động kho, đổi/trả, ca và báo cáo khớp; kiểm tra gửi lại không tạo bản ghi trùng.
6. Đo thao tác trên điện thoại thật và màn rộng; kiểm tra chữ, vùng chạm, bàn phím, quyền camera (nếu có), mạng yếu và hướng dẫn.

## 9. Câu hỏi cần trả lời bằng quan sát

- Nhóm người dùng đầu tiên Slink có thể tiếp cận để thử là shop thời trang, mỹ phẩm, quán cà phê hay người bán online?
- Người đó có bán cả tại quầy và qua mạng không; nếu có, kênh nào đem nhiều đơn nhất?
- Công việc gây phiền nhất hiện nay là tạo danh mục, chọn hàng lúc bán, nhận hàng, đổi trả hay cuối ngày đối tiền?
- Có cần bàn/bếp/topping, size-màu, hạn dùng hoặc đồng bộ sàn ngay từ ngày đầu không?
- Một người kiêm bao nhiêu việc; khi có nhân viên, ai được sửa giá, hủy đơn, hoàn tiền và sửa tồn?

Không chốt module hoặc quy trình đặc thù chỉ bằng suy đoán hay tài liệu của nhà cung cấp.
