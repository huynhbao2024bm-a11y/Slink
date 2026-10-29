# Đánh giá nghiệp vụ Slink so với KiotViet

**Ngày rà soát:** 2026-10-29  
**Phạm vi:** các quy trình vận hành cửa hàng, không so sánh quy mô, giá bán, thương hiệu hay độ phổ biến.  
**Cách đánh giá:** đối chiếu mã nguồn và tài liệu dự án hiện có với tài liệu hướng dẫn công khai của KiotViet. Đây là đánh giá rà soát mã và tài liệu; không phải nghiệm thu sản phẩm đang chạy.

## Kết luận ngắn

Slink đã có nền tảng nghiệp vụ cho cửa hàng bán lẻ: bán hàng, thanh toán, tồn kho, nhập hàng, đơn online ghi thủ công, khách hàng, thu chi và báo cáo cơ bản. Nhiều luồng có lưu dữ liệu phía máy chủ, sổ giao dịch và kiểm tra quyền. Đây là nền tốt để tiếp tục hoàn thiện.

Khoảng cách chính nằm ở độ khép kín và bằng chứng vận hành. KiotViet mô tả các quy trình đầu-cuối rõ hơn ở đặt hàng nhà cung cấp, nhận hàng từng phần, trả hàng nhà cung cấp, trả hàng khách không cần hóa đơn gốc, kết ca thu ngân, chuyển hàng có trạng thái nhận và tích hợp kênh bán/giao vận. Slink có một số phần tương ứng trong mã, nhưng chưa có đủ bằng chứng chạy trên môi trường production và thiết bị thật để khẳng định cửa hàng có thể dựa vào chúng hằng ngày.

Vì vậy, Slink phù hợp để tiếp tục thử nghiệm có kiểm soát cho cửa hàng bán lẻ đơn giản; chưa nên giới thiệu như hệ thống đã thay thế đầy đủ quy trình vận hành của một cửa hàng đang kinh doanh. Các lựa chọn hồ sơ cửa hàng hiện chủ yếu sắp xếp giao diện, không tự tạo nghiệp vụ riêng cho quán ăn, quán cà phê hoặc kho lớn.

## So sánh theo công việc hằng ngày

| Công việc | Slink hiện có trong mã/tài liệu | KiotViet theo tài liệu hướng dẫn | Đánh giá khoảng cách và hệ quả |
| --- | --- | --- | --- |
| Bán tại quầy | Tạo đơn, quét/tìm hàng, giỏ, khách hàng, giảm giá, nhiều cách thanh toán, tiền thừa và công nợ; tồn và sổ giao dịch có API phía máy chủ. | Tạo hóa đơn hoặc đơn đặt hàng, thêm hàng bằng tìm kiếm/quét, thanh toán và thông tin giao hàng trong cùng quy trình. | Slink có nền luồng bán cơ bản. Cần thử đủ chu trình trên điện thoại: chọn hàng, đổi số lượng, thanh toán, xem lại đơn và số tồn sau khi tải lại. Chưa có nghiệm thu với người bán thật trong lần rà soát này. |
| Trả hàng khách | Có API trả hàng theo đơn gốc và hoàn tiền/tồn theo giao dịch. | Có trả theo hóa đơn và luồng trả nhanh khi không cần mở lại hóa đơn gốc; có hướng dẫn xử lý hàng hoàn từ kênh online. | Slink phụ thuộc nhiều hơn vào việc tìm đúng đơn gốc. Cần xác minh một phần hàng trả, giới hạn số lượng/hoàn tiền, lý do, tồn trả về và lịch sử. Trả hàng nhanh không theo đơn gốc vẫn là khoảng trống cần chốt nghiệp vụ. |
| Nhập hàng | Có nhà cung cấp, nhập hàng, đơn đặt hàng và nhận nhiều đợt theo tài liệu/mã nguồn. | Đặt hàng có gợi ý số lượng theo tồn/bán gần đây, theo dõi ngày dự kiến, thanh toán/công nợ và nhận hàng nhiều lần với trạng thái nhập một phần/hoàn tất. | Nền Slink đã có nhưng chưa thấy bằng chứng có gợi ý nhập hàng hay theo dõi đầy đủ tiến độ nhà cung cấp. Ưu tiên thử đơn mua, nhận thiếu/thừa, công nợ và sửa/hủy để bảo đảm không lệch tồn. |
| Trả hàng nhà cung cấp | Không thấy luồng trả hàng nhập độc lập trong các route nghiệp vụ đã rà soát. | Có thể trả nhanh hoặc trả theo phiếu nhập; hệ thống cập nhật tồn kho và công nợ nhà cung cấp. | Đây là khoảng trống nghiệp vụ đáng kể: hàng lỗi/hết hạn trả lại có thể làm sai tồn và công nợ nếu phải sửa thủ công. Cần thiết kế chứng từ trả riêng, liên kết phiếu nhập khi có, lưu lý do và ghi đồng thời tồn/khoản phải trả. |
| Kho và điều chuyển | Có tồn theo kho, nhập/điều chỉnh/kiểm kê, chuyển kho và ghi nhận trạng thái đơn online; một số luồng đã có kiểm tra chống gửi lặp theo tài liệu dự án. | Có chuyển giữa kho/chi nhánh, trạng thái đang chuyển/đã nhận, xác nhận số lượng thực nhận; hỗ trợ quản lý lô/hạn dùng và Serial/IMEI. | Slink có nền đa kho nhưng cần kiểm tra giao nhận từng phần và đối soát hai kho. Quản lý lô, hạn dùng, FEFO và Serial/IMEI chưa được xác nhận là có. Cửa hàng thực phẩm, mỹ phẩm hoặc hàng cần truy xuất lô sẽ gặp giới hạn. |
| Thu ngân và tiền mặt | Có sổ thu chi, công nợ, thanh toán và API ca tiền mặt theo tài liệu dự án. | Mở ca với tiền đầu ca, gắn giao dịch theo ca/người, đóng ca, đối chiếu tiền thực tế với hệ thống và lưu phiếu bàn giao. | Slink cần nghiệm thu ca với số liệu thật trong database, nhiều thu ngân, tiền đầu/cuối ca, giao dịch trả hàng và chênh lệch. Đăng nhập vai trò thu ngân hiện không đồng nghĩa với một thiết bị POS tách riêng; không dùng chung tài khoản nếu cần biết ai làm. |
| Khách hàng | Có hồ sơ, lịch sử, công nợ, nhãn/phân nhóm và bộ lọc lưu theo tài liệu dự án. | Có quản lý khách, lịch sử mua và các báo cáo/nhóm khách theo hướng dẫn sản phẩm. | Phần nền CRM của Slink khá rộng ở mức dữ liệu. Chưa xác nhận chương trình tích điểm, ưu đãi và quy trình chăm sóc khách hoàn chỉnh. Cần kiểm tra quyền xem công nợ/dữ liệu cá nhân và tính đúng của số dư. |
| Đơn online | Có cấu hình kênh ở trạng thái chưa kết nối, ghép SKU, nhập đơn thủ công, giữ tồn, gửi/hủy và lưu thông tin người nhận theo tài liệu dự án. | Tài liệu mô tả kết nối gian hàng, ghép SKU, đồng bộ hàng hóa và thông tin lỗi đồng bộ; có luồng giao hàng và COD. | Đây là ghi nhận thủ công, chưa phải kết nối Shopee/TikTok Shop/website. Người dùng vẫn phải tự xác minh giá, phí sàn, người nhận, thanh toán và trạng thái giao hàng. Không được giới thiệu là đã đồng bộ đa kênh. |
| Giao hàng và đối soát COD | Chưa có bằng chứng về nhãn vận chuyển, mã vận đơn từ nhà cung cấp, cập nhật trạng thái hãng vận chuyển hoặc đối soát COD/phí. | Có hướng dẫn tạo đơn giao hàng, chọn hãng vận chuyển, COD và quyết toán công nợ/phí giao hàng. | Nên để ngoài lời hứa hiện tại. Khi triển khai, phải có tích hợp nhà cung cấp, xử lý webhook/trạng thái trùng hoặc đến sai thứ tự, phí và COD đối soát. |
| Báo cáo | Có phân tích doanh thu/tồn/công nợ cơ bản, bộ lọc và CSV theo vai trò trong tài liệu dự án. | Hướng dẫn phân tích nhiều chiều về hàng hóa, khách hàng, doanh thu, lãi gộp, tồn cao/chậm bán và xu hướng. | Cần đối chiếu công thức với sổ giao dịch và xác minh các báo cáo trên PostgreSQL thật. Báo cáo nâng cao và gợi ý hành động chưa được coi là tương đương. |
| Quán ăn/cà phê | Chọn hồ sơ kinh doanh hiện chỉ lọc nhóm menu; chưa thấy bằng chứng về bàn, sơ đồ bàn, món/tùy chọn, bếp, tách/gộp hóa đơn hoặc công thức tiêu hao kho. | KiotViet có hướng dẫn riêng cho quy trình bán tại quán bar/café/nhà hàng. | Không nên chọn hồ sơ quán ăn/cà phê như một cam kết đã có nghiệp vụ nhà hàng. Cần khảo sát một quy trình quán cụ thể rồi mới thiết kế lát cắt riêng. |

## Điểm Slink đang làm đúng hướng

- Tách số liệu nghiệp vụ khỏi giao diện: một số luồng được xử lý bởi API, ghi lịch sử và giới hạn theo cửa hàng/vai trò.
- Dùng sổ biến động cho hàng và tiền thay vì chỉ đổi con số đang hiển thị.
- Có cơ sở cho đơn mua, nhiều kho, đơn online thủ công và báo cáo, nên có thể mở rộng theo từng quy trình mà không cần làm lại toàn bộ sản phẩm.
- Giao diện đang được làm ngắn gọn hơn, có hướng dẫn bắt đầu, chọn kho mặc định và thao tác quét. Tuy nhiên chưa có kiểm tra thực tế với người dùng mới trên máy tính và điện thoại trong lần đánh giá này.

## Rủi ro cần đóng trước khi dùng thay cho sổ vận hành thật

1. **Độ đúng của giao dịch:** nghiệm thu bán → thanh toán → trả một phần/toàn phần → tồn → công nợ → sổ tiền → báo cáo; kiểm tra gửi lặp, lỗi giữa chừng và tải lại trang.
2. **Nhập và trả hàng:** xác minh nhận hàng một phần, giá vốn, công nợ NCC và bổ sung chứng từ trả nhà cung cấp.
3. **Điều chuyển và kiểm kê:** xác nhận hàng đang đi, hàng thực nhận, chênh lệch có lý do, xung đột nhiều nhân viên và kho.
4. **Production:** workflow GitHub `Prepare production database` run `40259264564` đã báo thành công ở bước áp dụng migrations và kiểm tra ranh giới role. Điều này xác nhận workflow trên database mà nó kết nối đã chạy qua các bước đó; vẫn cần biết commit Render đang phục vụ và thực hiện diễn tập khôi phục backup trước khi coi cổng production đã đạt.
5. **Người dùng và thiết bị:** thử riêng chủ, quản lý, thu ngân, kho và kế toán; mỗi người thao tác tài khoản riêng. Hồ sơ cửa hàng chỉ giúp ẩn bớt menu, không thay thế kiểm tra quyền ở máy chủ.
6. **Điện thoại:** thử trên iOS và Android 10+ với kết nối yếu/mất mạng, bàn phím, camera, màn hình nhỏ và thao tác cảm ứng. Giao diện co giãn hoặc camera mở được chưa đủ chứng minh bán hàng chạy ổn.

## Thứ tự triển khai đề nghị

1. Đóng bằng chứng production: đúng commit đang chạy, migrations, database, role ứng dụng, backup khôi phục được và readiness.
2. Nghiệm thu quy trình bán lẻ đầu-cuối với dữ liệu thử được phép dùng; ghi rõ kết quả theo vai trò và thiết bị.
3. Hoàn thiện trả hàng khách và ca tiền, sau đó thêm chứng từ trả NCC và nhận/điều chuyển từng phần.
4. Kiểm tra khả năng dùng trên điện thoại với chủ tiệm và thu ngân; sửa điểm gây sai giao dịch trước khi tiếp tục tinh chỉnh giao diện.
5. Chỉ sau khi có đối tác/quyền API mới triển khai đồng bộ kênh bán, vận chuyển và COD. Giữ trạng thái “nhập tay” hiển thị rõ cho tới lúc đồng bộ thật được nghiệm thu.
6. Tách quy trình nhà hàng, hạn dùng/lô và bán buôn thành các phạm vi riêng sau khi khảo sát người dùng đại diện.

## Giới hạn và mức tin cậy

Đây là rà soát mã nguồn và tài liệu dự án cộng với tài liệu hướng dẫn công khai của KiotViet. Trong lần này không chạy thử hệ thống production, không thao tác giao dịch trong tài khoản cửa hàng thật, không đo tốc độ, không thử trực tiếp trên iPhone/Android và không phỏng vấn khách hàng. Vì vậy:

- “Có trong mã” không đồng nghĩa với “đang có trên bản production”.
- “Có API” không chứng minh đầy đủ quy trình, giao diện hoặc khả năng phục hồi khi lỗi.
- Các hướng dẫn KiotViet là căn cứ để so sánh phạm vi nghiệp vụ công khai, không phải đánh giá chất lượng toàn bộ sản phẩm KiotViet.
- Cập nhật trạng thái từng khoảng trống trong [`DELIVERY_ROADMAP.md`](DELIVERY_ROADMAP.md) khi có bằng chứng mới.

## Nguồn tham khảo

Các trang dưới đây là tài liệu hướng dẫn chính thức, được kiểm tra ngày 2026-10-29:

- [KiotViet — Bán hàng tại quầy](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ban-hang/ban-hang/)
- [KiotViet — Trả hàng khách](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-tra-hang/tra-hang/)
- [KiotViet — Đặt hàng nhập](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-giao-dich/dat-hang-nhap/)
- [KiotViet — Trả hàng nhập](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-giao-dich/tra-hang-nhap/)
- [KiotViet — Chuyển hàng giữa kho/chi nhánh](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/chuyen-hang/)
- [KiotViet — Kết ca](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ket-ca/ket-ca/)
- [KiotViet — Kết nối gian hàng thương mại điện tử](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ban-online/ket-noi-san-tmdt/)
- [KiotViet — Giao hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-giao-van/giao-hang/)
- [KiotViet — Phân tích](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-phan-tich/phan-tich/)
- [KiotViet — Bán hàng Bar/Cafe/Nhà hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bar-cafe-nha-hang/ban-hang-bar-cafe-nha-hang/)
