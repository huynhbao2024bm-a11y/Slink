# Slink — Phân tích Đối thủ (KiotViet 2026 vs Sapo OmniAI v3) & Chiến lược Tạo Khác Biệt Khả Thi

> **Ngày lập:** 2026-11-20  
> **Nguồn đối chiếu:** Tài liệu vận hành thực tế Sapo OmniAI v3 (2026), KiotViet Retail (2026), và hiện trạng Slink `v0.5.0` (`67618de`).

---

## 1. Hệ sinh thái nhà cung cấp cần kết nối để tương đương KiotViet

Không nên ký toàn bộ cùng lúc — ưu tiên theo thứ tự tạo giá trị trực tiếp cho khách hàng trả tiền:

| Ưu tiên | Nhóm nhà cung cấp | Tên đối tác tiêu biểu | Vai trò thực tế | Trạng thái Slink |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Email hệ thống** | **Resend** *(hoặc Postmark / AWS SES)* | Xác minh tài khoản, quên mật khẩu, mời nhân viên, gửi biên nhận. | Đã hỗ trợ `RESEND_API_KEY`, chờ kích hoạt gói. |
| **1** | **Thanh toán QR tự đối soát** | **SePay / Casso / PayOS** *(dễ duyệt cho HKD/startup)*; giai đoạn lớn: Open Banking (VCB, MB, TCB, BIDV, VPBank, ACB), MoMo, ZaloPay, VNPAY | Sinh VietQR động khóa số tiền + mã đơn, webhook báo tiền về tức thì, loa đọc tiền chống bill giả. | Đã có VietQR tĩnh 1 chạm + khung webhook SePay & MoMo IPN. |
| **2** | **HĐĐT từ máy tính tiền & CKS** | **MISA meInvoice**, **Viettel S-Invoice**, **VNPT eInvoice**, FPT.eInvoice + Remote Signing (MISA eSign / MySign / SmartCA) | Tự phát hành HĐĐT từ máy tính tiền lên Cơ quan Thuế theo quy định 2025–2026; khách quét QR tự điền MST. | Giai đoạn 2 (bắt buộc khi mở bán đại trà cho HKD kê khai). |
| **3** | **Giao vận & Đối soát COD** | **GHN**, GHTK, Viettel Post, SPX, J&T, Ahamove, GrabExpress, GreenSM | Đẩy vận đơn 1 chạm, in phiếu giao, theo dõi hành trình, đối soát COD tự động. | Đã có giao hàng COD thủ công + nền API GHN. |
| **4** | **Sàn TMĐT & Chat đa kênh** | Shopee, TikTok Shop, Lazada, Tiki, Meta (FB/IG), Zalo OA (ZNS) | Đồng bộ đơn sàn, chat chốt đơn livestream, gửi tin ZNS chăm sóc khách. | Tạm hoãn — chỉ làm khi có đội bảo trì API chuyên trách. |

---

## 2. Bảng so sánh toàn diện KiotViet (2026) vs Sapo OmniAI v3 (2026) vs Slink `v0.5.0`

| STT | Luồng nghiệp vụ | **KiotViet (2026)** | **Sapo OmniAI v3 (2026)** | **Slink `v0.5.0`** |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Định vị & Điểm mạnh cốt lõi** | Quản trị cửa hàng vật lý & nội bộ (4 ngành dọc: Retail, FnB, Salon, Hotel). | Cỗ máy thương mại điện tử & bán hàng hợp kênh (Omnichannel + Chat AI). | POS di động & web siêu gọn, tốc độ cao, dễ học trong 5 phút cho shop bán lẻ tại chỗ. |
| **2** | **Bán hàng tại quầy (POS)** | 3 chế độ (Bán nhanh/Thường/Giao), nút lớn, Loa KV66, báo có QR 8+ NH, VietQRGlobal, thu nợ QR. | 7 bước khép kín (Mở ca → Quét mã/nhiều tab → Khách/Loyalty → Gợi ý KM/VAT → In tạm tính → Thanh toán đa phương thức + QR03 5 phút → Đóng ca kiểm két), bán Offline, bắt buộc thanh toán đủ. | **Đủ 7 bước Sapo:** Mở/Đóng ca ngay góc phải POS, nhiều tab đơn, giảm `%`/`₫` (`F6`), In tạm tính (`F8`), chia nhiều phương thức, phím tắt `F1–F9`, tự in bill, bắt buộc thanh toán đủ, bán Offline. |
| **3** | **Hàng hóa & Kho vật lý** | 6 loại hàng (Thường, Dịch vụ, Combo, **Sản xuất theo NVL**, Lô/HSD, IMEI), **Bảo hành/Bảo trì**, nhiều bảng giá, Xuất dùng nội bộ/Xuất hủy, Kiểm kho gộp phiếu tạm. | Phiên bản, quy đổi, Combo, Lô/HSD, IMEI, **5 trạng thái tồn kho** (*Tổng, Có thể bán, Đang GD, Đang giao, Đang về*), liên thông Dược Quốc gia. | Hàng thường, Biến thể, **Serial/IMEI từng mã (1D+2D/QR không số)**, quy đổi đơn vị nhập, đa kho, kiểm kho CSV, chuyển kho thường & **chuyển kho từng mã Serial nguyên tử**. |
| **4** | **Xử lý đơn & Giao vận** | Đặt hàng → Hóa đơn → KShip / hãng VC; hỗ trợ đơn nhiều kiện, đa điểm Ahamove, xác nhận chuyển hoàn loạt. | **Wave Picking** (giảm 50–70% đi lại kho), màn **Kiện bất thường**, **Điều phối O2O** đa chi nhánh, Sapo Express, đối soát COD. | Giao hàng COD / tự ship thủ công ngay trên POS; nền API GHN sẵn sàng khi bật. |
| **5** | **Đổi trả & Hàng hoàn** | Trả hàng theo hóa đơn gốc, khớp giá bán, chọn nhập kho & hoàn tiền. | 3 luồng chặt: Đổi trả tách Nhập kho & Hoàn tiền; **Chờ xác nhận hoàn hàng** khi hủy giao; gom riêng hoàn hàng Sàn TMĐT. | Trả hàng 1 phần/toàn phần, **tích chọn đúng từng mã Serial**, tách hàng hỏng (`archived`), đổi hàng liền mạch, trả hàng NCC. |
| **6** | **Sổ quỹ, Thu chi & Công nợ** | Sổ quỹ truyền thống dễ đọc, tách TM/NH/ví, phiếu thu/chi, công nợ KH/NCC. | Sổ quỹ tự động 100% tách bán lẻ vs COD sàn/ví; báo cáo lợi nhuận cho **phân bổ chi phí thủ công** theo kênh/chi nhánh. | Tách quỹ Tiền mặt / Ngân hàng, chuyển quỹ nội bộ, chip chọn nhanh lý do thu/chi, kiểm két đóng ca, báo cáo **Lãi ròng (Net Profit)** tự trừ chi phí vận hành. |
| **7** | **Nhân sự, Phân quyền & Lương** | **Tích hợp gốc rất mạnh:** Xếp ca, Chấm công (vân tay/QR/tự động), Hoa hồng (% DT hoặc cố định/SP), Bảng lương, Zalo Mini App NV; **phân quyền theo nhóm hàng**. | Phân quyền theo vai trò & chi nhánh/gian hàng, ẩn SĐT khách Sale Online; chưa có chấm công/tính lương gốc. | Tạo nhanh NV, hồ sơ lương cơ bản + % hoa hồng, phân quyền theo vai trò & phạm vi kho, **Bảng ma trận phân quyền** đồng bộ UI & API, tự làm mới quyền khi quay lại app. |
| **8** | **Thuế, Kế toán & HĐĐT** | Tặng sẵn **5.000 HĐĐT/năm + Chữ ký số IntrustCA + Kế toán HKD miễn phí** (01/CNKD, 01/BK-HTK) + mở kết nối MISA/Viettel/VNPT/FPT. | **Sapo Invoice** (tự động phát hành theo NĐ 254/2026/NĐ-CP, QR khách tự điền MST) + Sapo Accounting & Sapo Tax. | Chưa kết nối HĐĐT (kế hoạch giai đoạn 2). |
| **9** | **AI & Tự động hóa** | **Trợ lý KiCi:** hỏi số liệu, vẽ biểu đồ, đọc ảnh lỗi, đặt lịch gửi báo cáo định kỳ. | **Chat OmniAI** (AI chốt đơn 24/7, bắt bình luận live), **Trợ lý Sapo AI** (`@mention`), **Sapo Automate**, Metafield tùy biến. | Chưa có AI assistant. |
| **10** | **Mức giá thị trường (2026)** | **270k – 490k/tháng** (+270k–375k/chi nhánh thêm), đã gồm 5.000 HĐĐT + CKS + Kế toán HKD. | **249k – 899k+/tháng** chia theo kênh/gói + điểm AI mua thêm. | Dự kiến định vị phân khúc siêu gọn **99k – 149k/tháng** không phí ẩn. |

---

## 3. Phân tích thẳng thắn: Vì sao không đấu trực diện — và Slink thắng ở đâu?

**Sự thật thực tế:** Đua số lượng tính năng với KiotViet (9 phân hệ + tặng 5.000 HĐĐT từ 270k/tháng) hay Sapo OmniAI (Chat AI + Wave Picking + 4 sàn TMĐT) là **bất khả thi với một đội ngũ nhỏ**.

Nhưng chính sự cồng kềnh của hai ông lớn lại tạo ra **4 nỗi đau rất thật** của hàng trăm nghìn hộ kinh doanh nhỏ & vừa tại Việt Nam:
1. **Quá rối & quá nhiều "cài đặt ngầm":** Tài liệu KiotViet thừa nhận chủ shop dùng nhiều năm chỉ đụng 30% sức mạnh; mở phần mềm lên là choáng với hàng chục menu, nhân viên mới hay bấm nhầm gây lệch kho/lệch quỹ.
2. **Chi phí phần cứng & phí cộng thêm nặng:** Mua loa KV66, màn hình QR03, máy quét mã vạch, máy tính bàn, thêm phí theo chi nhánh (+270k/CN) khiến shop nhỏ tốn 5–10 triệu ngay lúc bắt đầu.
3. **Trải nghiệm bán hàng thuần trên điện thoại chưa sướng:** KiotViet/Sapo sinh ra cho màn hình máy tính bàn; thao tác trên điện thoại hay bị nhỏ, chậm, hoặc thiếu tính năng in ấn/quét mã linh hoạt.
4. **Hàng hóa có mã riêng lẻ (Serial/QR không chuẩn EAN-13):** Chủ shop sách, phụ kiện, điện thoại cũ, đồ ký gửi/secondhand, đồng hồ, mỹ phẩm lẻ rất khổ với quy trình IMEI cứng nhắc của KiotViet/Sapo.

---

## 4. 5 Điểm Khác Biệt KHẢ THI để khách hàng sẵn sàng trả tiền cho Slink

Đây là những điểm **Slink hoàn toàn có thể làm tốt hơn KiotViet & Sapo** mà không cần 100 kỹ sư:

1. **Triết lý "60 giây bán được ngay — Không cần học":**
   - Mặc định thông minh theo đúng mô hình shop, giấu sạch mọi thứ không dùng tới.
   - Bấm mở app là vào thẳng màn bán hàng gọn như app ngân hàng; người lớn tuổi hay nhân viên part-time nhìn 2 phút là dùng được.
2. **Biến 1 chiếc điện thoại thành trọn bộ quầy thu ngân "0 đồng phần cứng":**
   - Quét mọi mã vạch 1D + 2D + QR chữ/tiếng Việt bằng camera điện thoại.
   - **Màn hình QR khách quét phóng to + Loa đọc số tiền bằng giọng nói ngay trên điện thoại** (thay thế màn QR03 & Loa KV66).
   - **Gửi biên nhận đẹp qua Zalo/Messenger 1 chạm** (dạng ảnh hoặc text) + in máy in nhiệt Bluetooth 58/80mm giá rẻ 400k (đã có sẵn trong APK `v0.5.0`).
3. **Vua quản lý từng món riêng (Serial / QR / Hàng ký gửi / Secondhand):**
   - Tạo 1 sản phẩm gốc, bấm `＋` quét liên tiếp bao nhiêu mã cũng được (cả mã tự in QR), chặn bán trùng tuyệt đối, trả đúng từng mã, chuyển kho từng mã — mượt hơn hẳn luồng IMEI nặng nề của đối thủ.
4. **3 con số thật cuối ngày (Lời thật — Tiền thật — Tồn thật) + Chạy mượt khi mất mạng:**
   - Màn hình chủ chỉ tập trung trả lời đúng câu hỏi chủ shop hỏi mỗi tối: *Hôm nay bán được bao nhiêu? Tiền mặt & ngân hàng thực còn bao nhiêu? Trừ vốn + chi phí hôm nay lời thật bao nhiêu?*
   - Mất mạng (bán hội chợ, chợ đêm, quán đông) vẫn bán bình thường rồi tự đồng bộ sạch.
5. **Giá dễ chốt + Chỉ gắn đúng 2 tích hợp "đáng tiền nhất":**
   - Định giá mềm (**99k–149k/tháng**, bằng 1/2 đến 1/3 đối thủ, không khóa tính năng vặt).
   - Chỉ tập trung hoàn thiện **SePay (báo tiền về tự động + loa đọc tiền)** và **1 đối tác HĐĐT từ máy tính tiền** (MISA hoặc Viettel) để khách yên tâm dùng lâu dài đúng luật thuế.
