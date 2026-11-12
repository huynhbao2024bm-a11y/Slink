# Slink — kế hoạch sản phẩm và triển khai tổng thể

**Cập nhật:** 2026-10-31  
**Trạng thái:** kế hoạch định hướng; phân khúc mở màn và các chức năng theo ngành chưa được xác nhận bằng cửa hàng thử nghiệm.

Tài liệu này biến mục tiêu sản phẩm thành các chặng có thứ tự. [`BUILD_CHARTER.md`](BUILD_CHARTER.md) giữ các nguyên tắc và cổng giao khách; [`DELIVERY_ROADMAP.md`](DELIVERY_ROADMAP.md) giữ bằng chứng; [`EXECUTION_PLAN.md`](EXECUTION_PLAN.md) là hàng việc kế tiếp; [`TARGET_CUSTOMER_WORKFLOWS.md`](TARGET_CUSTOMER_WORKFLOWS.md) lưu nghiên cứu quy trình và giả thuyết khách hàng.

## 1. Hướng sản phẩm

Slink hướng đến cửa hàng độc lập và nhóm bán hàng hiện đại: thời trang, mỹ phẩm/chăm sóc cá nhân, quán cà phê/ăn uống, người bán online và cửa hàng kết hợp bán tại quầy với bán qua mạng. Không lấy tiệm tạp hóa truyền thống làm khách hàng mặc định, cũng chưa nhắm tới hệ thống siêu thị hoặc chuỗi lớn.

**Chưa chọn ngành hàng mở màn.** Tài liệu nhà cung cấp và đối chiếu mã nguồn giúp hình thành giả thuyết; chỉ quan sát và thử với người bán mới có thể chốt phân khúc. Shop thời trang bán tại quầy hiện là một ứng viên để đem ra kiểm chứng, không phải quyết định đã chốt.

Giá trị cần chứng minh là **bắt đầu nhanh, làm đúng việc ngay và nhìn rõ tiền cùng hàng**. Slink không cần thắng bằng số lượng menu. Lợi thế cần kiểm chứng là ít thiết lập ban đầu, thao tác gần với cách người bán đang làm, dữ liệu chỉ nhập một lần, và mỗi thay đổi hàng/tiền đều có chứng từ cùng lịch sử để tra lại.

## 2. Quy tắc định hình sản phẩm

- Tách bốn khái niệm: **mô hình cửa hàng** (cách kinh doanh), **công việc của người dùng** (chủ, thu ngân, kho, phục vụ, kế toán), **quyền được phép làm**, và **thiết bị/chế độ quầy**. Chọn hồ sơ chỉ sắp xếp lối vào/hướng dẫn; không tự cấp quyền hay làm mất dữ liệu.
- Giữ một lõi chung cho hàng hóa/menu, bán, thanh toán, tồn, nhận hàng, đổi/trả, thu chi và lịch sử. Chỉ bật nghiệp vụ riêng của ngành khi người dùng cần: size/màu; lô/hạn dùng; bàn/bếp; đơn/kênh giao hàng.
- “Dễ dùng” không có nghĩa là bỏ xác nhận tiền, kiểm tra tồn, quyền, lý do sửa/hủy hoặc lưu lịch sử. Ẩn bước nội bộ khỏi người không cần, nhưng giữ kết quả và sổ sách minh bạch cho người có trách nhiệm.
- Không yêu cầu nhập tay lặp lại dữ liệu đã có; hỗ trợ cách thêm hàng phù hợp danh mục hiện tại. Mã vạch, camera, ảnh, nhập file hoặc tích hợp chỉ được ưu tiên nếu thử nghiệm cho thấy chúng giảm thời gian/lỗi.
- Không quảng bá đồng bộ, thanh toán, hóa đơn, giao hàng, offline, khôi phục hay bảo mật đã hoàn tất nếu chưa có kiểm chứng đầu-cuối.
- Giữ giao diện tiếng Việt đời thường, chữ dễ đọc, thao tác chạm và bàn phím dễ dùng; không mặc định mọi cửa hàng hay người dùng đều giống nhau.
- **Phân công công việc:** mình phụ trách mã nguồn, tích hợp và xử lý lỗi kỹ thuật từ log; người dùng tự thử vận hành thật và quyết định cách chấp nhận rủi ro ở Supabase/hosting. Advisory bảo mật không chặn việc code nếu nó không làm ứng dụng ngừng chạy; không tự đổi quyền, schema hay cấu hình production. Nếu sự cố quyền gây lỗi runtime, xử lý đúng phần kỹ thuật làm ứng dụng chạy lại.

## 3. Chọn phân khúc mở màn bằng bằng chứng

Khảo sát người đang làm việc trong các nhóm mục tiêu, tối thiểu gồm chủ/người quản lý và người trực tiếp bán hoặc nhận hàng. Ghi lại cách họ làm hiện tại trước khi trình bày Slink:

1. Tạo danh mục hoặc biến thể, nhập hàng và kiểm tra hàng thực nhận.
2. Bán một món/đơn, xử lý mặt hàng không tìm thấy, thanh toán thiếu/thừa và xem lại đơn.
3. Đổi/trả/hủy, ghi giảm giá hoặc sửa tồn và truy ra ai làm, vì sao.
4. Đối tiền cuối ca/ngày và xác định hàng nào cần bổ sung.
5. Nếu bán online: nhận đơn, ghép SKU, đóng gói, giao/hủy/trả và đối chiếu khoản thực nhận.

Chọn phân khúc đầu tiên theo: có thể tiếp cận cửa hàng thử thật; vấn đề xảy ra thường xuyên và tốn công; phần lõi hiện có giải quyết được phần lớn luồng; phần thiếu có ranh giới nhỏ; rủi ro tiền/tồn có thể kiểm soát; cửa hàng sẵn sàng thử trên thiết bị thật. Ghi rõ dữ liệu nào là quan sát, lời người dùng, nguồn đối thủ hay suy luận.

Nghiên cứu KiotViet/Sapo hiện có dựa trên hướng dẫn công khai của nhà cung cấp. Đây là tham chiếu quy trình, không phải nghiên cứu khách hàng độc lập hay chứng nhận chất lượng của đối thủ. Không sao chép danh sách chức năng; học cách hoàn tất việc của từng vai trò và đặt lựa chọn chuyên sâu đúng lúc.

## 4. Lộ trình theo cổng

Các chặng sau phụ thuộc vào kết quả chặng trước. Không cần hoàn thành toàn bộ ngành hàng trước khi thử sản phẩm; mỗi chặng phải có đầu ra và bằng chứng riêng.

### Chặng 0 — Xác nhận ứng dụng chạy và xử lý lỗi kỹ thuật chặn đường

**Lý do:** phải phân biệt trạng thái ứng dụng thật trên Render với code đang sửa trong workspace. Supabase có advisory RLS đã được báo cho chủ dự án; chủ dự án chịu trách nhiệm quyết định rủi ro đó. Advisory này không chặn các thay đổi mã nguồn nếu app vẫn chạy.

**Việc làm:** đối chiếu SHA Render với `main`, app migration ledger và `/api/ready`; dùng log thực tế để tìm lỗi khởi động/route/database chặn chức năng rồi sửa code phù hợp. Không sửa quyền, schema hay cấu hình production trừ khi chủ dự án yêu cầu.

**Qua chặng khi:** app khởi động và readiness thành công, schema app đang chạy khớp mã nguồn, không còn lỗi runtime ngăn đăng nhập hoặc mở luồng chính. Người dùng tự thử các thao tác kinh doanh; khi có lỗi gửi log để xử lý tiếp. Các rủi ro bảo mật production vẫn được ghi nhận riêng do chủ dự án quản lý.

### Chặng 1 — Quan sát quy trình và chọn nhóm thử đầu tiên

**Việc làm:** quan sát một số cửa hàng thuộc các ứng viên; ghi thời gian, lần nhập lại, lỗi, ngoại lệ và công cụ họ đang dùng. So sánh thời gian hoàn thành các việc chính với KiotViet/Sapo theo tài liệu công khai, nhưng ưu tiên cách người bán thật vận hành. Chọn một nhóm thử bằng ma trận tiêu chí ở mục 3.

**Qua chặng khi:** có ít nhất một nhóm cửa hàng đồng ý thử, sơ đồ hiện trạng và luồng mục tiêu, danh sách quy tắc tiền/tồn/quyền, cùng phạm vi rõ ràng cho lần thử. Không chọn mặc định thời trang, F&B, mỹ phẩm hay online trước khi có bằng chứng tiếp cận và nhu cầu.

### Chặng 2 — Bắt đầu nhanh và điều hướng theo đúng công việc

**Việc làm:** tinh gọn tạo cửa hàng, thêm/nhập danh mục và hướng dẫn lần đầu. Hồ sơ cửa hàng và vai trò công việc riêng biệt. Mặc định đã được triển khai theo yêu cầu: chủ/quản lý/thu ngân mở Bán hàng; kho mở Kho hàng; kế toán mở Thu chi; đơn bán đang chờ được khôi phục. Người dùng sẽ tự thử và gửi lỗi thực tế.

**Qua chặng khi:** màn đúng mở theo vai trò, hồ sơ chỉ lọc menu, quyền vẫn do server kiểm tra, mặt hàng/dữ liệu tải theo màn đang dùng; người dùng tự xác nhận trải nghiệm thật.

### Chặng 3 — Chứng minh lõi vận hành và sổ sách

**Việc làm:** kiểm chứng danh mục (SKU/mã vạch/đơn vị/biến thể nếu có), bán → thanh toán → tồn → tiền/công nợ → tìm lại đơn/báo cáo; nhận hàng/chi phí → tồn → khoản phải trả → thanh toán; đổi/trả/hủy → hoàn tiền và xử lý tồn. Hoàn tất ca/thu chi, lịch sử thay đổi, xuất dữ liệu và phân quyền theo vai trò/kho. Xử lý gửi lại, mất mạng, đồng thời và thao tác sai.

**Qua chặng khi:** ghi nhận nguyên tử, không trùng khi thử lại, không bán/hoàn vượt quy tắc, số dư đối chiếu từ ledger, lịch sử không mất, ranh giới cửa hàng/vai trò/kho được kiểm tra ở máy chủ. Chạy trên PostgreSQL thật có backup và dữ liệu tổng hợp; bằng chứng local/PGlite chỉ hỗ trợ, không thay thế.

### Chặng 4 — Một lát cắt ngành hàng cho nhóm thử

**Việc làm:** xây đúng luồng gây đau nhất của phân khúc đã chọn, không làm preset chỉ đổi tên menu. Ví dụ: thời trang cần chọn/tồn size-màu và đổi hàng; F&B cần bàn/đơn mở, tùy chọn món, gửi bếp/bar và xử lý hủy; mỹ phẩm cần theo lô/hạn nếu cửa hàng yêu cầu; online cần nhận/ghép/xử lý trạng thái đơn. Chỉ làm nhu cầu của pilot và phần giao với lõi.

**Qua chặng khi:** người bán và nhân viên đại diện hoàn tất luồng thuận lợi cùng tình huống sai thường gặp trên thiết bị thật; tiền, tồn, quyền và lịch sử khớp; không phải quay về ghi sổ hai lần. Ghi nhận thời gian/lỗi trước-sau và điều chưa hỗ trợ.

### Chặng 5 — Nhân viên, quầy và thiết bị thực tế

**Việc làm:** phân biệt đăng nhập cá nhân, quyền theo vai trò, giao diện POS gọn, chuyển người trực, ca tiền và thu hồi phiên/thiết bị. Thử điện thoại, tablet và desktop; chữ lớn, bàn phím, trình đọc màn hình, máy in/chia sẻ và quét mã nếu được pilot xác nhận. Chưa làm bán offline cho tới khi có hàng đợi bền, chống trùng và xử lý xung đột.

**Qua chặng khi:** mỗi giao dịch gắn đúng người/ca/cửa hàng; nhân viên chỉ nhìn/thực hiện việc được giao; thao tác chạm/keyboard/accessibility cốt lõi và mất kết nối có trạng thái dễ hiểu trên ma trận thiết bị hỗ trợ.

### Chặng 6 — Mở rộng sang các mô hình kế tiếp

Sau khi pilot ổn định, xếp nhóm kế tiếp theo nhu cầu đã quan sát và mức tái sử dụng lõi. Thêm lần lượt các chức năng F&B, thời trang/biến thể, lô/hạn mỹ phẩm hoặc bán online; không mặc định cần triển khai đủ bốn trước khi có khách hàng. Mỗi nhóm có quy trình riêng, điều kiện bật, quyền và acceptance riêng.

### Chặng 7 — Kết nối đối tác và đa kênh

Chọn từng sàn/website, vận chuyển/COD, thanh toán/QR, email, hóa đơn điện tử và kế toán theo nhu cầu pilot, quyền truy cập và nhà cung cấp thật. Bao gồm ghép SKU, trạng thái, retry/webhook, hủy/trả, phí và đối soát tiền. Không trình bày đơn nhập tay là đồng bộ; không xác nhận đã thanh toán khi chưa có phản hồi đối tác.

### Chặng 8 — Sẵn sàng giao khách và vận hành

Hoàn thiện privacy/terms sau khi xác nhận đơn vị vận hành và quy trình dữ liệu; rà yêu cầu pháp lý/thuế với nguồn có thẩm quyền; xác minh email, backup ngoài máy, restore, theo dõi lỗi, cảnh báo, hỗ trợ, lưu/xóa dữ liệu, rollback, chi phí và điều khoản gói dịch vụ. Giao pilot có giới hạn, dữ liệu thật chỉ khi an toàn và có đồng ý.

**Qua chặng khi:** các cổng phát hành trong [`BUILD_CHARTER.md`](BUILD_CHARTER.md) đều có bằng chứng; chủ cửa hàng tự làm được việc hằng ngày; khôi phục, quyền, hỗ trợ và chi phí được người chịu trách nhiệm chấp nhận.

### Chặng 9 — Tối ưu theo số đo

Đo tải trang/API, thao tác POS, lỗi, tỷ lệ bỏ dở và thời gian từ mở cửa hàng đến hoàn tất việc chính. Chọn một nút thắt có số liệu; sửa nhỏ; đo cùng kịch bản trước/sau. Không refactor rộng chỉ vì cảm giác code cần “gọn” hoặc “mượt”.

## 5. Chỉ số cần theo dõi trong pilot

Lấy baseline trước khi đặt ngưỡng: thời gian tạo/nhập mặt hàng, thời gian hoàn tất một giao dịch lặp lại, số lần quay lại/sửa, số lỗi chọn nhầm hoặc gửi trùng, số việc phải ghi lại ngoài app, thời gian đối ca, người dùng tự làm không cần trợ giúp, và tỷ lệ giao dịch/số liệu khớp ledger. Mục tiêu 2–3 thao tác bán hàng là giả thuyết trải nghiệm để thử cho hàng quen thuộc, không được làm mất chọn biến thể, xác nhận tiền hoặc kiểm soát rủi ro.

## 6. Những gì chưa chốt

- Ngành hàng mở màn, cách thêm hàng nhanh nhất, và camera/máy quét.
- Mức độ cần bàn/bếp, hạn dùng, nhiều kho, bán buôn, offline hoặc đồng bộ marketplace ở đợt đầu.
- Nhà cung cấp email, thanh toán, hóa đơn điện tử, vận chuyển, marketplace, gói giá và SLA hỗ trợ.
- Nội dung/chủ thể pháp lý và thời hạn lưu/xóa dữ liệu.

Mỗi quyết định được chốt sau nghiên cứu hoặc thử nghiệm, cập nhật [`PRODUCT.md`](PRODUCT.md), quyết định liên quan và roadmap. Các mục chưa chốt không được biến thành cam kết sản phẩm.
