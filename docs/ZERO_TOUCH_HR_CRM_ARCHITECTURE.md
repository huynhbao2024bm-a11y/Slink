# Slink — Thiết kế Tinh gọn Tối thượng: Hệ thống Nhân sự & Khách hàng dưới Góc nhìn Chủ cửa hàng (Owner-First Zero-Touch HR & CRM)

> **Trạng thái:** **ĐÃ PHÊ DUYỆT CHÍNH THỨC BỞI CHỦ DỰ ÁN (2026-11-21 21:03 +07:00)** — Đã qua 2 vòng thẩm định khắt khe của Chuyên gia Hệ thống Bán lẻ & Kế toán Quản trị (`5db65af6-1913-49f5-a7f6-bd1e3b5f058d`) (Vòng 1: Khóa lỗ hổng kế toán; Vòng 2: Đội mũ Chủ cửa hàng Việt Nam cắt bỏ toàn bộ mỡ thừa kỹ thuật). Sẵn sàng triển khai.

---

## 1. 7 Sự Thật Trần Trụi Dưới Góc Nhìn Chủ Cửa Hàng (Vì sao phải gọt bỏ "Tự động hóa mù quáng"?)

Ở góc nhìn của người bỏ tiền túi trả mặt bằng và trả lương nhân viên, **tự động hóa máy móc còn nguy hiểm hơn làm thủ công**, vì máy tự động làm sai là **mất tiền, mất khách, mất cả nhân viên giỏi**:

1. **Bẫy "Tự động giảm giá % toàn giỏ theo Hạng VIP" → Bán càng đông khách VIP càng LỖ VỐN:**
   - *Thực tế cửa hàng:* Không có tiệm nào mọi mặt hàng đều lãi giống nhau (ốp lưng lãi 70% nhưng máy nguyên seal chỉ lãi 2%; mỹ phẩm dưỡng lãi 30% nhưng sữa/bỉm hàng phễu chỉ lãi 3%). Nếu khách VIP Vàng được máy tự động giảm 5% toàn giỏ, mua món hàng lãi 2% là **chủ tiệm lỗ tươi 3% ngay tại quầy!**
   - *Giải pháp thực chiến:*
     - Mặc định dùng **Tích điểm thưởng hoàn tiền cho lần mua sau** (an toàn tuyệt đối cho dòng tiền và tạo lý do buộc khách phải quay lại lần 2).
     - Bổ sung **Chốt chặn Bảo vệ Giá vốn (Margin Guard)**: Khi áp chiết khấu nhân viên hoặc chiết khấu hạng VIP, hệ thống **tự động chặn không cho giá sau giảm tụt xuống dưới Giá vốn (`cost_vnd`)** (trừ khi chính tài khoản Chủ cửa hàng `owner` là người bấm).
2. **Bẫy "Đếm từng phút từ thao tác đầu–cuối ngày (`first_seen_at` → `last_seen_at`)" → Cỗ máy gây cãi vã với nhân viên:**
   - *Thực tế cửa hàng:* Nhân viên đến lúc 7h30 sáng quét dọn, bày hàng, 9h15 mới có khách mở hàng bấm POS -> máy tính từ 9h15 làm nhân viên mất oan 1 tiếng 45 phút! Ngược lại, 22h30 đêm nhân viên nằm ở nhà mở điện thoại vào app xem đơn -> máy chấm công đến 22h30 đêm!
   - *Giải pháp thực chiến:* 95% cửa hàng Việt Nam tính lương theo **Ngày công / Ca có mặt** hoặc **Lương tháng**. Trong ngày nhân viên có mở/đóng ca hoặc có phát sinh đơn/phiếu = **Tự động tính 1 Ngày công (hoặc số ca trong ngày)**. Giờ bấm máy đầu–cuối ngày chỉ hiển thị nhỏ bên dưới để chủ xem ai đi muộn/về sớm, và chủ có nút `+ / -` chỉnh nhanh số công ngay trên dòng bảng lương nếu cần.
3. **Bẫy "Tự động trừ thẳng tiền lệch két vào lương mà không hỏi chủ" → Nhân viên tự ái nghỉ việc ngay hôm sau:**
   - *Thực tế cửa hàng:* Lệch thiếu tiền mặt cuối ca rất hay xảy ra do: (1) Chủ tiệm chạy qua quầy rút 500k trả tiền ship quên ghi phiếu, hoặc (2) Khách chuyển khoản QR nhưng thu ngân bấm nhầm nút Tiền mặt (tiền mặt thiếu 300k nhưng tài khoản ngân hàng của chủ lại thừa 300k). Nếu máy tự động trừ thẳng vào lương, nhân viên nghĩ bị vu oan ăn cắp sẽ bỏ việc.
   - *Giải pháp thực chiến:* Máy vẫn **tự động gom toàn bộ các ca lệch thiếu** của nhân viên đó lên dòng bảng lương cuối tháng, nhưng đặt trong một **ô Checkbox `[x] Trừ lệch két (-200.000 ₫)`** (kèm nút `[Bỏ qua lệch két]` ngay lúc xem ca). Nếu do nhầm phương thức hoặc chủ đã lấy, chủ chỉ cần bỏ tick 1 chạm là xong!
4. **Bẫy "Tự trừ tiền mặt hoàn trả của khách khi khách đã tiêu hết điểm thưởng" → Khách làm ầm ĩ tại quầy:**
   - *Thực tế cửa hàng:* Khách mua áo 1.000.000 ₫ (được tặng 10.000 ₫ điểm), hôm sau mua đôi tất tiêu hết 10.000 ₫ điểm đó. Ngày thứ 3 áo bị lỗi đường may khách mang ra trả. Nếu máy chỉ hoàn 990.000 ₫ tiền mặt, khách sẽ làm ầm lên giữa tiệm!
   - *Giải pháp thực chiến:*
     - Nếu đơn trả **có dùng điểm để thanh toán**, ưu tiên **hoàn lại Điểm vào ví điểm trước**, phần tiền thực trả mới hoàn bằng tiền mặt/công nợ (chặn 100% trò dùng điểm mua hàng rồi trả hàng rút tiền mặt).
     - Nếu thu hồi điểm thưởng được tặng từ đơn trả khiến ví điểm thiếu, cứ cho phép **Ví điểm của khách về số âm (VD: `-10 điểm`)** để tự động cấn trừ vào lần mua sau, còn tiền mặt của món hàng trả vẫn hoàn đủ để giữ uy tín cửa hàng.
5. **Bẫy "Chỉ gõ 10 số SĐT tạo khách ngầm" → 3 tháng sau Sổ Nợ ngập 5.000 người tên `Khách lẻ • 09xxx` không biết ai để đòi:**
   - *Giải pháp thực chiến:* **Ô khách hàng thông minh 1 dòng duy nhất trên POS**:
     - Gõ **4 số cuối SĐT** (VD: `6886`) -> Tự động bắt trúng khách quen ngay lập tức.
     - Nếu là khách mới, thu ngân gõ liền mạch trên cùng 1 ô đó kiểu người Việt: **`0912345678 Chị Lan`** -> Máy tự tách số làm SĐT, chữ làm Tên khách và tự tạo ngầm khi bấm Thanh toán (Zero-Popup). Nếu đơn trả đủ tiền mà khách vội chỉ đọc SĐT thì cho qua luôn; nếu **đơn mua nợ** thì nhắc gõ thêm tên gợi nhớ ngay tại ô đó.
6. **Bẫy "Chấm điểm gian lận 0–100" & "Ma trận RFM học thuật":**
   - *Thực tế cửa hàng:* Chủ tiệm không cần điểm số AI cảm tính hay chữ viết tắt "RFM".
   - *Giải pháp thực chiến:*
     - Thay điểm số bằng **Hộp "Cảnh báo Thất thoát" chỉ điểm đích danh vụ việc mất tiền**: *"14:20 — Thu ngân Tuấn in tạm tính F8 (450.000 ₫) rồi xóa giỏ không thanh toán"* hoặc *"Thu ngân Hoa hủy/trả 4 đơn hoàn tiền mặt trong ca"*.
     - Thay ma trận RFM bằng **4 Nút Lọc Khách Hàng Hái Ra Tiền + Xuất Excel 1 chạm**: `Đang nợ tiền`, `VIP Mua nhiều`, `Khách quen >30 ngày chưa ghé`, `Chưa mua lần nào`.
7. **Bẫy "Lộ bảng lương nhân viên trên máy POS dùng chung ở quầy":**
   - *Giải pháp thực chiến:* Tab **`Bảng lương & Cảnh báo thất thoát`** chỉ hiển thị cho **Chủ cửa hàng (`owner`)** (và Kế toán nếu được cấp quyền rõ ràng). Thu ngân đứng máy chung chỉ thấy doanh số và hoa hồng của riêng mình nếu chủ cho phép.

---

## 2. Ma Trận Lọc Bỏ Không Thương Tiếc (Giữ — Đơn Giản Hóa — Cắt Bỏ)

| Hạng mục | GIỮ & LÀM CỰC ĐỈNH *(Đúng chỗ ngứa chủ tiệm trả tiền)* | ĐƠN GIẢN HÓA 80% *(Giữ lõi, bỏ phức tạp ngầm)* | CẮT BỎ LUÔN *(Lý thuyết màu mè, hại thực tế)* |
| :--- | :--- | :--- | :--- |
| **1. Nhận diện & Tạo khách trên POS** | Gõ **4 số cuối SĐT** tự chọn khách quen. Khách mới gõ liền `0912345678 Chị Lan` trên 1 ô -> Bấm thanh toán tự tạo ngầm trong cùng transaction. | Đơn trả đủ tiền chỉ gõ SĐT cũng tự lưu; đơn **ghi nợ** mới bắt buộc có tên gợi nhớ. | Cắt bỏ hoàn toàn popup bắt nhập Email, Địa chỉ, Ngày sinh, MST lúc đang bán hàng tại quầy. |
| **2. Trợ lý Khách quen & Gộp thu nợ cũ** | Chọn khách là bung ngay thẻ 2 dòng: **Điểm hiện có + 3 món hay mua nhất (chạm là vào giỏ) + Nợ cũ**. Nút 1 chạm **`Gộp thu luôn nợ cũ + Đơn này (1 mã VietQR)`** tự tách thu đơn mới + gạch nợ cũ FIFO nguyên tử. | Khi khách trả thiếu so với (Đơn mới + Nợ cũ): **Ưu tiên thu đủ đơn mới trước, phần dư mới gạch nợ cũ FIFO**. | Cắt bỏ danh sách mã Serial dài dòng trên giỏ POS (chỉ hiện nhãn nhỏ `2 máy còn BH`). |
| **3. Tích điểm & Bảo vệ Lãi gộp** | Mua hàng tự tích điểm theo thực thu, trả/hủy đơn tự thu hồi điểm. Có điểm là hiện nút 1 chạm **`Dùng X điểm (-Y ₫)`** ngay lúc thanh toán. | Thêm **Chốt chặn Bảo vệ Giá vốn (Margin Guard)**: Không cho chiết khấu/ưu đãi tự động ăn lủng giá vốn (`cost_vnd`). | Cắt bỏ việc tự động trừ tiền mặt hoàn trả khi khách bị âm điểm (để âm điểm cấn trừ vào lần mua sau). |
| **4. Chấm công, Ứng lương & Bảng lương 1 trang** | Nút **`Ứng lương 1 chạm`** gắn thẳng Sổ quỹ vào nhân viên. Cuối tháng **Bảng lương 1 trang** tự gom đủ: `Công + Hoa hồng ròng - Ứng lương - Lệch két` -> Bấm **`Chốt & Chi lương`** tự ghi Sổ quỹ/P&L + xuất **Phiếu lương ảnh PNG + QR lương** gửi Zalo. | Tự đếm **Số ngày/ca có mặt thực tế** từ lịch sử Mở ca & Bán hàng (Realtime SQL) + cho phép chủ bấm `+ / -` chỉnh công và tick/bỏ tick khoản trừ lệch két ngay trên bảng. | Cắt bỏ bộ đếm từng phút `worked_minutes`, cắt bỏ thuật toán `auto_capped + 15 phút` và sổ cái kết chuyển nợ lương âm nhiều kỳ rườm rà. |
| **5. Radar Chống Thất Thoát** | Bắt tận tay 3 mánh thất thoát thật:<br>1. **In tạm tính F8 rồi xóa giỏ / giảm tiền > 15%**.<br>2. **Hủy / Trả đơn hoàn tiền mặt bất thường**.<br>3. **Đóng ca lệch thiếu tiền mặt lặp lại**. | Báo cáo bằng câu Tiếng Việt chỉ rõ: **Ai làm — Lúc nào — Đơn/Giỏ nào — Chênh lệch bao nhiêu tiền**. | Cắt bỏ "Điểm số tín nhiệm nhân viên 0–100 (Fraud Score)" cảm tính. |

---

## 3. 5 "Vũ Khí Sát Thủ" Thực Dụng Nhất Giúp Slink Đè Bẹp KiotViet & Sapo

1. **Vũ khí 1 — "Trợ lý Khách Quen 4 Số Cuối & Gộp Nợ 1 Mã QR" ngay trên giỏ POS (3 giây xong cả đơn mới lẫn nợ cũ):**
   - Thu ngân gõ 4 số cuối SĐT -> Bung ngay thẻ 2 dòng: `[Có 45 điểm (-45.000 ₫) • Dùng ngay]` + 3 món khách hay mua nhất `[+ Cà phê sữa] [+ Bánh mì]` + `[Đang nợ cũ: 450.000 ₫ • Gộp thu luôn (Tổng: 750.000 ₫)]`.
   - Bấm 1 chạm -> Mã VietQR tự nhảy lên `750.000 ₫`. Khách quét 1 lần duy nhất: Đơn mới (`300k`) thanh toán xong, nợ cũ (`450k`) tự gạch sạch theo FIFO, Sổ quỹ ghi 2 chứng từ độc lập!
2. **Vũ khí 2 — "Bảng Lương Tự Động 1 Trang — Chốt Lương & Bắn Ảnh Phiếu Lương Zalo Trong 5 Giây":**
   - Cuối tháng mở tab **Bảng Lương**, mọi con số đã nằm sẵn trên 1 dòng cho từng nhân viên: **Số ngày/ca có mặt** + **Doanh số thực thu (đã trừ trả hàng)** + **Hoa hồng tự tính** − **Tiền đã ứng trong tháng** − **Checkbox `[x] Lệch thiếu két`** = **Thực lĩnh**.
   - Bấm **`Chốt & Chi lương`**: Hiện ngay mã VietQR ngân hàng của nhân viên để chủ quét chuyển lương, tự ghi Sổ quỹ + P&L, và xuất ngay **Ảnh Phiếu Lương PNG (`<canvas>`)** sắc nét để gửi Zalo cho nhân viên.
3. **Vũ khí 3 — "Ứng Lương Nhanh 1 Chạm" khóa chặt Sổ Quỹ với Bảng Lương:**
   - Nhân viên xin ứng tiền giữa tháng -> Chủ bấm `[Ứng lương]` ngay cạnh tên nhân viên -> Nhập số tiền -> Tự tạo phiếu chi Sổ quỹ gắn cứng `employee_user_id` và tự động trừ vào kỳ lương cuối tháng, không bao giờ quên hay phải ghi sổ tay.
4. **Vũ khí 4 — "Radar Bắt Gian Lận F8 & Hoàn Tiền Mặt Thực Chiến":**
   - Bấm `In tạm tính (F8)` tự động lưu dấu vết ngầm lên máy chủ (`pos_prebill_events`). Nếu thu ngân cầm bill tạm tính thu tiền khách rồi xóa giỏ hoặc giảm món > 15%, màn hình Chủ tiệm báo đỏ ngay lập tức kèm thời gian và số tiền nghi vấn.
5. **Vũ khí 5 — "Tích Điểm Tự Động Bảo Vệ Giá Vốn & 4 Tệp Khách Hàng Hái Ra Tiền":**
   - Tự động tích điểm (`100k = 1 điểm = 1.000 ₫`) ngay từ đơn đầu tiên không cần cài đặt; tự động chặn chiết khấu lủng giá vốn (`Margin Guard`); bộ lọc 1 chạm `Đang nợ tiền` / `VIP Mua nhiều` / `Khách quen >30 ngày chưa ghé` / `Chưa mua lần nào` kèm xuất Excel sạch.

---

## 4. Schema Database Tối Giản (Từ 6 bảng rút gọn còn đúng 3 bảng mới + mở rộng nhẹ)

1. **Mở rộng các bảng hiện có:**
   - `memberships`: thêm `salary_mode` (`'monthly' | 'shift' | 'hourly'`), `standard_days_per_month` (`26`), `bank_bin`, `bank_account_number`, `bank_account_owner`.
   - `stores`: thêm `loyalty_earn_unit_vnd` (`100000`), `loyalty_redeem_value_vnd` (`1000`), `protect_cost_margin` (`true`).
   - `orders`: thêm `seller_id uuid`, `points_redeemed bigint`, `points_redeemed_vnd bigint`, `points_earned bigint`, `prebill_event_id uuid`.
   - `cash_movements`: thêm `employee_user_id uuid`, `settled_payslip_id uuid`.
   - `cash_register_sessions`: thêm `settled_payslip_id uuid`, `variance_waived boolean DEFAULT false`.
2. **Đúng 3 bảng mới chuẩn RLS (`app.store_id`):**
   - `customer_point_ledger_entries`: Sổ cái điểm thưởng nguyên tử (`earn_sale`, `redeem_sale`, `return_refund_points`, `return_clawback_points`, `manual_adjustment`).
   - `staff_payslips`: Phiếu lương đã chốt theo tháng (`period_month`, `worked_units`, `base_pay_vnd`, `net_sales_vnd`, `commission_pay_vnd`, `bonus_vnd`, `advance_deduction_vnd`, `shortage_deduction_vnd`, `net_payable_vnd`, `cash_movement_id`).
   - `pos_prebill_events`: Nhật ký In tạm tính F8 (`actor_user_id`, `subtotal_vnd`, `expected_total_vnd`, `line_count`, `items_snapshot`, `status`, `matched_order_id`, `printed_at`).
