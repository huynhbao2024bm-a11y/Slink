I. QUẢN LÝ TÀI KHOẢN & KẾT NỐI SÀN

1. Kết nối gian hàng đa sàn
   · Shopee, Lazada, TikTok Shop, Tiki, Sendo, GrabMart, Website (Haravan/Sapo/WordPress)
   · Kết nối qua API Key / OAuth
   · Hỗ trợ nhiều shop trên cùng một sàn (Shopee Mall + Shopee thường)
2. Quản lý tài khoản người dùng nội bộ
   · Phân quyền theo vai trò (Admin, Kế toán, Kho, CSKH, Marketing)
   · Phân quyền theo chi nhánh/kho
   · Lịch sử đăng nhập, log thao tác
3. Quản lý đồng bộ
   · Cài đặt tần suất đồng bộ (real-time / 5 phút / 15 phút)
   · Bật/tắt đồng bộ từng sàn, từng loại dữ liệu
   · Xem log đồng bộ, cảnh báo lỗi kết nối API
4. Quản lý token & làm mới tự động
   · Tự động refresh token khi hết hạn
   · Cảnh báo khi token sắp hết hạn

---

II. QUẢN LÝ SẢN PHẨM (PIM)

1. Tạo & chỉnh sửa sản phẩm
   · Tạo sản phẩm đơn (single)
   · Tạo sản phẩm có biến thể (variant: màu, size, chất liệu)
   · Tạo sản phẩm combo/bundle
   · Tạo sản phẩm theo nhóm/danh mục
2. Đăng bán đa sàn
   · Đẩy sản phẩm lên nhiều sàn cùng lúc
   · Tùy chỉnh tiêu đề, mô tả, hình ảnh riêng cho từng sàn
   · Ánh xạ danh mục sàn (category mapping)
   · Ánh xạ thuộc tính (attribute mapping)
3. Quản lý SKU & mã sản phẩm
   · Ánh xạ SKU nội bộ với SKU từng sàn
   · Quản lý mã vạch (barcode), QR code
   · Quản lý mã sản phẩm theo nhà cung cấp
4. Cập nhật hàng loạt (bulk update)
   · Cập nhật giá hàng loạt
   · Cập nhật tồn kho hàng loạt
   · Cập nhật mô tả, hình ảnh hàng loạt
   · Import/Export Excel, CSV
5. Quản lý giá
   · Giá gốc, giá bán, giá khuyến mãi
   · Giá theo từng sàn
   · Giá theo kênh (bán buôn/bán lẻ)
   · Quy tắc tính giá tự động (theo % lợi nhuận)
6. Quản lý hình ảnh & media
   · Thư viện ảnh dùng chung
   · Nén ảnh tự động
   · Watermark theo thương hiệu
7. Quản lý trạng thái sản phẩm
   · Đang bán / Tạm ẩn / Hết hàng / Ngừng kinh doanh
   · Đồng bộ trạng thái lên sàn

---

III. QUẢN LÝ ĐƠN HÀNG (OMS)

1. Đồng bộ đơn hàng
   · Kéo đơn tự động từ tất cả các sàn
   · Đồng bộ đơn real-time
   · Phát hiện đơn trùng lặp
2. Xử lý đơn hàng
   · Xác nhận đơn
   · Đóng gói
   · In phiếu giao hàng (AWB)
   · In phiếu đóng gói (packing slip)
   · In hóa đơn VAT
   · In tem sản phẩm
3. Xử lý hàng loạt
· Duyệt nhiều đơn cùng lúc
   · In hàng loạt
   · Đổi trạng thái hàng loạt
   · Gán đơn vị vận chuyển hàng loạt
4. Gộp & tách đơn
   · Gộp nhiều đơn cùng khách
   · Tách đơn theo kho
   · Tách đơn theo sản phẩm hết hàng
5. Quản lý trạng thái đơn
   · Chờ xác nhận → Đã xác nhận → Đang đóng gói → Đã giao VTP → Đang giao → Đã giao → Hoàn thành
   · Đơn hủy, đơn hoàn, đơn thất lạc
6. Quản lý đơn hoàn/đổi trả
   · Tiếp nhận yêu cầu hoàn từ sàn
   · Xử lý hoàn tiền
   · Nhập lại kho hàng hoàn
   · Đối soát phí hoàn
7. Quản lý đơn COD
   · Theo dõi tiền COD
   · Đối soát COD với đơn vị vận chuyển
   · Cảnh báo đơn COD rủi ro (khách bom hàng)
8. Tìm kiếm & lọc đơn
   · Theo mã đơn, mã vận đơn, SĐT khách, SKU
   · Theo trạng thái, ngày, sàn, kho
   · Lưu bộ lọc yêu thích
9. Ghi chú & tag đơn hàng
   · Ghi chú nội bộ
   · Tag đơn (VIP, bom hàng, gấp...)

---

IV. QUẢN LÝ KHO (WMS)

1. Quản lý kho hàng
   · Nhiều kho, nhiều chi nhánh
   · Kho theo khu vực (Hà Nội, HCM, Đà Nẵng)
   · Vị trí lưu kho (kệ, tầng, ô)
2. Đồng bộ tồn kho đa kênh
   · Trừ tồn tự động khi có đơn
   · Đồng bộ tồn lên tất cả các sàn
   · Cơ chế khóa tồn (lock) tránh oversell
   · Buffer tồn kho (giữ lại X sản phẩm dự phòng)
3. Nhập kho
   · Tạo phiếu nhập
   · Nhập theo PO (Purchase Order)
   · Nhập từ nhà cung cấp
   · Nhập hàng hoàn từ khách
4. Xuất kho
   · Xuất bán
   · Xuất chuyển kho
   · Xuất hủy, xuất mẫu
5. Chuyển kho
   · Tạo phiếu chuyển kho nội bộ
   · Theo dõi hàng đang vận chuyển giữa các kho
6. Kiểm kê
   · Kiểm kê định kỳ
   · Kiểm kê đột xuất
   · Điều chỉnh tồn kho sau kiểm kê
   · Báo cáo chênh lệch
7. Cảnh báo tồn kho
   · Cảnh báo sắp hết hàng
   · Cảnh báo hàng tồn lâu (dead stock)
   · Cảnh báo hàng âm kho
8. Quản lý lô & hạn sử dụng
   · Quản lý theo lô (batch)
   · Quản lý hạn sử dụng (expiry)
   · FEFO (First Expired First Out)
9. Quản lý nhà cung cấp
   · Danh sách NCC
   · Lịch sử nhập hàng
   · Công nợ NCC

---

V. QUẢN LÝ VẬN CHUYỂN

1. Kết nối đơn vị vận chuyển
   · GHN, GHTK, Viettel Post, J&T, Best Express, Ninja Van, GrabExpress, Ahamove, VNPost
   · Kết nối qua API
2. Tạo vận đơn
   · Tạo vận đơn tự động
   · Tạo vận đơn hàng loạt
   · In tem vận chuyển
3. Quy tắc chọn VTP
   · Tự động chọn theo giá rẻ nhất
   · Tự động chọn theo tốc độ nhanh nhất
   · Tự động chọn theo khu vực
   · Tự động chọn theo cân nặng
4. Theo dõi vận chuyển
   · Tracking real-time
   · Cập nhật trạng thái giao hàng
   · Cảnh báo đơn giao thất bại
5. Đối soát COD
   · Đối soát tiền COD với VTP
   · Báo cáo COD chưa về
   · Xử lý COD thất lạc
6. Quản lý phí vận chuyển
   · Tính phí ship tự động
   · Đối soát phí ship với VTP
   · Hỗ trợ phí ship cho khách

---

VI. TÀI CHÍNH & KẾ TOÁN

1. Đối soát doanh thu sàn
   · Đối soát đơn hàng với báo cáo sàn
   · Đối soát phí sàn (commission)
   · Đối soát phí thanh toán
   · Đối soát phí hạ tầng
   · Đối soát phí affiliate
2. Quản lý dòng tiền
   · Tiền sàn đang giữ
   · Tiền đã về ví
   · Tiền COD đang vận chuyển
   · Tiền hoàn khách
3. Tính lợi nhuận
   · Lợi nhuận gộp (giá bán - giá nhập)
   · Lợi nhuận ròng (trừ phí sàn, ship, marketing)
   · Lợi nhuận theo sản phẩm
   · Lợi nhuận theo sàn
   · Lợi nhuận theo đơn
4. Quản lý chi phí
   · Chi phí nhập hàng
   · Chi phí vận chuyển
   · Chi phí marketing (ads)
   · Chi phí vận hành
   · Chi phí đóng gói
5. Quản lý công nợ
   · Công nợ khách hàng
   · Công nợ nhà cung cấp
   · Công nợ đối tác vận chuyển
6. Hóa đơn & chứng từ
   · Xuất hóa đơn VAT
   · Quản lý hóa đơn điện tử
   · In phiếu thu, phiếu chi
7. Báo cáo tài chính
   · Báo cáo doanh thu
   · Báo cáo lợi nhuận
   · Báo cáo dòng tiền
   · Báo cáo thuế

---

VII. CHĂM SÓC KHÁCH HÀNG (CRM)

1. Chat đa kênh
   · Chat Shopee, Lazada, TikTok, Facebook, Zalo, Website trên một giao diện
   · Trả lời nhanh (quick reply)
   · Chatbot tự động
   · Phân chia hội thoại cho nhân viên
2. Quản lý khách hàng
   · Hồ sơ khách hàng tập trung
   · Gộp khách hàng từ nhiều sàn
   · Lịch sử mua hàng
   · Phân hạng khách hàng (VIP, thân thiết, mới)
3. Quản lý đánh giá
   · Theo dõi đánh giá từ các sàn
   · Phản hồi đánh giá
   · Cảnh báo đánh giá xấu
4. Marketing & khuyến mãi
   · Tạo mã giảm giá
   · Tạo voucher
   · Flash sale
   · Combo khuyến mãi
   · Email marketing, SMS marketing
5. Remarketing
   · Danh sách khách hàng cũ
   · Gửi tin nhắn chăm sóc
   · Khách hàng bỏ giỏ (abandoned cart)

**Trạng thái triển khai Slink (2026-10-20):** Đã có một lát cắt mã giảm tại POS: chủ/quản lý tạo mã theo số tiền hoặc phần trăm, thời gian áp dụng, mức đơn tối thiểu và giới hạn lượt; thu ngân kiểm tra mã ở màn thanh toán; server tính lại số giảm, lưu redemption cùng đơn và chặn dùng quá hạn mức/trùng đơn. Đây chưa phải toàn bộ marketing: chưa có flash sale tự động, combo, điểm khách hàng hay gửi email/SMS. Migration `0018_promotions_vouchers.sql` cần áp dụng vào database cửa hàng theo luồng backup có sẵn trước khi dùng trên cửa hàng thật; giao diện cần thử trực tiếp bởi người bán.

---

VIII. BÁO CÁO & PHÂN TÍCH

1. Dashboard tổng quan
   · Doanh thu hôm nay/tuần/tháng
   · Số đơn hàng
   · Tỷ lệ hoàn/hủy
   · Top sản phẩm bán chạy
   · Top sàn hiệu quả
2. Báo cáo bán hàng
   · Doanh thu theo sàn
   · Doanh thu theo sản phẩm
   · Doanh thu theo nhân viên
   · Doanh thu theo khu vực
   · Doanh thu theo thời gian
3. Báo cáo kho
   · Tồn kho hiện tại
   · Xuất nhập tồn
   · Hàng sắp hết
· Hàng tồn lâu
   · Vòng quay tồn kho
4. Báo cáo vận chuyển
   · Tỷ lệ giao thành công
   · Thời gian giao hàng trung bình
   · Chi phí vận chuyển
   · Đối soát COD
5. Báo cáo khách hàng
   · Khách hàng mới/cũ
   · Tỷ lệ mua lại
   · Giá trị đơn trung bình (AOV)
   · Lifetime Value (LTV)
6. Báo cáo hiệu quả marketing
   · ROI quảng cáo
   · Chi phí trên mỗi đơn (CPA)
   · Tỷ lệ chuyển đổi
7. Dự báo
   · Dự báo doanh thu
   · Dự báo tồn kho
   · Dự báo nhu cầu theo mùa
8. Export báo cáo
   · Xuất Excel, CSV, PDF
   · Lên lịch gửi báo cáo tự động qua email

---

IX. TỰ ĐỘNG HÓA & QUY TẮC

1. Quy tắc tự động (Automation Rules)
   · Tự động duyệt đơn khi có điều kiện
   · Tự động gán VTP theo khu vực
   · Tự động gửi tin nhắn cảm ơn
   · Tự động cập nhật tồn kho
   · Tự động tag đơn hàng
2. Thông báo (Notification)
   · Thông báo đơn mới
   · Thông báo hết hàng
   · Thông báo đánh giá xấu
   · Thông báo lỗi đồng bộ
   · Thông báo qua app, email, Telegram, Zalo
3. Workflow phê duyệt
   · Duyệt đơn hàng giá trị lớn
   · Duyệt chiết khấu
   · Duyệt nhập/xuất kho

---

X. TÍCH HỢP & MỞ RỘNG

1. Tích hợp kế toán
   · MISA, Fast, Bravo
   · Xuất dữ liệu kế toán
2. Tích hợp POS
   · Bán hàng tại cửa hàng
   · Đồng bộ tồn kho online - offline
3. Tích hợp website
   · Haravan, Sapo, WordPress, Shopify
   · Đồng bộ sản phẩm, đơn hàng, tồn kho
4. Tích hợp marketing
   · Facebook Ads, Google Ads
   · Google Analytics
   · Pixel tracking
5. Tích hợp thanh toán
   · VNPay, Momo, ZaloPay, PayOS
   · Đối soát giao dịch
6. API & Webhook
   · API mở cho bên thứ ba
   · Webhook thông báo sự kiện
7. Mobile App
   · App iOS, Android cho chủ shop
   · Xem báo cáo, duyệt đơn, chat

---

XI. BẢO MẬT & QUẢN TRỊ

1. Bảo mật
   · Xác thực 2 lớp (2FA)
   · Mã hóa dữ liệu
   · Log truy cập
   · Backup tự động
2. Quản trị hệ thống
   · Quản lý gói dịch vụ
   · Quản lý dung lượng
   · Quản lý API call
   · Nâng cấp, bảo trì
3. Phân quyền chi tiết
   · Theo module
   · Theo hành động (xem/sửa/xóa)
   · Theo dữ liệu (chỉ xem đơn của mình)

---

XII. TIỆN ÍCH KHÁC

1. Quản lý nhân viên
   · Chấm công, KPI
   · Hoa hồng theo đơn
   · Bảng lương
2. Quản lý tài liệu
   · Lưu hợp đồng, chứng từ
   · Quản lý quy trình nội bộ
3. Đa ngôn ngữ & đa tiền tệ
   · Hỗ trợ bán quốc tế (Shopee Global, Amazon)
4. Ghi chú & Task
   · Tạo task nội bộ
   · Nhắc việc
