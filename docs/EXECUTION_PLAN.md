# Kế hoạch triển khai Slink

## Ưu tiên mới: từ đăng ký đến đơn đầu tiên (2026-10-31)

Áp dụng cho cả giao diện và chức năng. Các mục lịch sử phía dưới vẫn là backlog; không chờ đủ tính năng nâng cao mới cải thiện được hành trình bắt đầu.

| Lát cắt | Mục đích và phạm vi | Phụ thuộc | Bằng chứng cần để đạt |
| --- | --- | --- | --- |
| 1. Bắt đầu với danh mục nhỏ — đang làm local | Chọn loại hình một lần; trạng thái cửa hàng trống; thêm nhanh kèm tồn ban đầu hoặc nhập CSV; đi thẳng tới bán | API hồ sơ và nhập danh mục hiện có | Đăng ký → lựa chọn được lưu → thêm/nhập → bán → tải lại đúng tiền/tồn; thử lỗi mạng, bấm lưu lặp, đổi cửa hàng; điện thoại và PC |
| 2. Bán hàng gọn — tiếp theo | Rà chọn hàng, giỏ, số lượng, xác nhận tiền; chỉ hỏi khách/ghi chú khi cần, giữ xử lý đơn chờ | Danh mục, kho và API đơn/thanh toán | Đơn thu tiền được lưu đúng; không bán âm, gửi trùng hoặc làm mất giỏ; thao tác chạm và bàn phím |
| 3. Bổ sung đúng lúc | Hướng dẫn tại tác vụ; thiếu tồn tới kho, thêm người khi chia việc, thêm kênh khi có đơn online; xem lại trợ giúp | Trạng thái dữ liệu thật và quyền thành viên | Hướng dẫn không lặp mỗi đăng nhập, không chặn công việc; thiếu dữ liệu nào thì hỏi đúng dữ liệu đó |
| 4. Gọn toàn bộ vận hành | Kho, đơn, thu chi, báo cáo và cài đặt: một việc chính mỗi màn hình; chi tiết mở khi cần | Luồng nghiệp vụ hiện có và các khoảng trống đã ghi | Hoàn thành công việc thật, giữ lịch sử/tiền/tồn; kiểm tra màn hình nhỏ, lỗi và trạng thái rỗng |

Lát cắt 1 đã có sửa mã giao diện và gọi API thật, chưa có bằng chứng đầu-cuối mới. Không đánh dấu đạt dựa trên kiểm tra cú pháp. Không tự push/deploy; người dùng sẽ yêu cầu khi muốn phát hành.

**Cập nhật:** 2026-10-31. Đây là hàng việc sống; bằng chứng hiện tại ở [`DELIVERY_ROADMAP.md`](DELIVERY_ROADMAP.md), kế hoạch tổng thể ở [`PROJECT_PLAN.md`](PROJECT_PLAN.md). Render báo deploy live từ `main` ở commit `819f38698e8a6bd398fe446fe36b66ae6631f356`; Supabase app migration ledger đã có `0024_store_business_profile.sql`. Chủ dự án đã nhận thông tin advisory RLS và tự chịu trách nhiệm quyết định rủi ro; advisory đó không phải ưu tiên code nếu không làm app ngừng chạy. Workspace có nhiều sửa đổi chưa commit, nên không đồng nghĩa chúng đã nằm trong bản live.

## Tiêu chí khách hàng và vận hành mới (2026-10-31)

Đọc [`TARGET_CUSTOMER_WORKFLOWS.md`](TARGET_CUSTOMER_WORKFLOWS.md) trước khi đổi luồng. Khách hàng mục tiêu cần nghiên cứu là quán cà phê/ăn uống, shop thời trang, mỹ phẩm và người bán online; tiệm tạp hóa không còn là giả định mặc định. Dùng một lõi chung cho giao dịch/tồn/tiền, nhưng không ép nghiệp vụ bàn-bếp, size-màu, lô-hạn dùng và đồng bộ sàn vào mọi cửa hàng.

Việc tiếp theo sau P0 là chọn một phân khúc mở màn dựa trên người có thể tiếp cận và khoảng trống thật trong workspace. Tách câu hỏi “bạn kinh doanh mô hình nào?” khỏi “bạn đang làm công việc gì?” và khỏi quyền tài khoản. Sau đó hoàn tất một luồng từ bắt đầu → bán/nhập → tiền/tồn → xử lý sai thường gặp, thử với người dùng đại diện và đo thời gian/lỗi trước-sau.

Camera bị gỡ khỏi workspace trong giả định khách hàng trước; quyết định đó nay được mở lại vì shop nhiều mã hàng có thể hưởng lợi từ quét. Chưa khôi phục camera và chưa coi việc xóa là yêu cầu cuối cùng. Giữ barcode và tìm văn bản; đánh giá quét lại trên thiết bị/luồng đã chọn. Phần hướng dẫn cũ riêng cho tiệm tạp hóa nằm trong tài liệu lịch sử, không còn là kế hoạch hiện hành.

## Mục tiêu và cách làm

Hoàn thiện một sản phẩm bán hàng/vận hành dễ bắt đầu cho shop và nhóm bán hàng hiện đại; chọn ngành hàng thử đầu tiên bằng quan sát, không mặc định tạp hóa. Không tuyên bố tính năng, tích hợp, hosting, thiết bị hay khả năng thương mại đã đạt nếu chưa có bằng chứng. Theo thứ tự [`PROJECT_PLAN.md`](PROJECT_PLAN.md).

- Ưu tiên phần có thể làm độc lập; nêu rõ mọi phụ thuộc dịch vụ/credential.
- Với dữ liệu, tiền, quyền, bảo mật và sao lưu: dùng kiểm tra có mục đích và ghi kết quả vào roadmap.
- Với giao diện và khả năng dùng: cần người bán thử trên thiết bị thực; không lấy test mã thay nghiệm thu.
- Giữ thay đổi nhỏ, có thể xem lại và không ghi đè thay đổi đang có của người dùng.
- Chỉ tối ưu hiệu năng sau khi đo được điểm nghẽn; không refactor diện rộng để “cho mượt” khi chưa có số liệu.

## Ranh giới bằng chứng hiện tại

- Người dùng đã báo thao tác giỏ POS hiện ổn sau bản sửa gần nhất. Chưa có biên bản thử độc lập trên điện thoại thật hoặc xác nhận SHA Render đang chạy; giữ việc nghiệm thu thiết bị ở trạng thái mở.
- Plugin Render đọc được service Slink đang chạy trên nhánh `main`, auto-deploy theo commit, gói Free, URL `https://slink-xny3.onrender.com`; deploy gần nhất ở trạng thái `live`, commit `819f38698e8a6bd398fe446fe36b66ae6631f356` (2026-10-30). API metadata chưa có health-check path; chưa kiểm tra luồng bán/đăng nhập trên bản này trong phiên hiện tại.
- Truy vấn chỉ đọc `public.schema_migrations` trên Supabase trả về migration mới nhất `0024_store_business_profile.sql`; API liệt kê migration của Supabase trả danh sách rỗng, đây không phải app ledger và không phủ định kết quả từ bảng của Slink. Chưa xác minh đầy đủ quyền database, role-boundary, đăng nhập sau migration hoặc khôi phục backup.
- Supabase phát advisory mức **critical** về RLS trên sáu bảng nội bộ, gồm dữ liệu tài khoản/phiên/token. Người dùng đã nói sẽ tự xử lý rủi ro; không thay đổi quyền/schema production. Chỉ điều tra thêm nếu có log chứng minh việc này làm app không chạy được.
- `DEMO_DISABLE_EMAIL_VERIFICATION` có trong source và `.env.example` mặc định tắt. Chỉ bật cho môi trường demo được kiểm soát; chưa có bằng chứng ở đây về giá trị Render hiện tại hoặc đăng ký/login sau deploy mới nhất.
- Vai trò trong source gồm chủ cửa hàng, quản lý, thu ngân, nhân viên kho và kế toán. Workspace có thay đổi điều hướng theo hồ sơ và cách mở đầu; chưa xác minh toàn bộ thay đổi đó trên Render. Danh tính/phiên POS riêng và chuyển người trực vẫn cần thiết kế, nghiệm thu.
- Bản workspace ngày 2026-10-29 đã tăng cỡ chữ ở các phần chính, rút gọn trang Tổng quan, mở thẳng vào trang bắt đầu theo vai trò/hồ sơ, thêm hướng dẫn ngắn cho cửa hàng mới và mặc định chọn kho chính. Khi đó còn có quét mã đơn/ảnh tạm; thay đổi ngày 2026-10-31 đã gỡ camera dùng chung khỏi POS và đơn online. Cũng có trang quyền riêng tư/điều khoản ở trạng thái dự thảo. Chưa kiểm tra giao diện mới trên điện thoại và chưa đưa lên GitHub. Hai trang chính sách cần xác nhận đơn vị vận hành/địa chỉ liên hệ, nhà cung cấp email, vùng lưu dữ liệu, lịch lưu/xóa và quy trình yêu cầu dữ liệu trước khi dùng thương mại.
- Đơn marketplace/website hiện là ghi nhận thủ công. Chưa có kết nối đồng bộ sàn, vận đơn, COD hay xác nhận thanh toán từ cổng.

## Thứ tự thực hiện hiện hành

Thứ tự chi tiết và tiêu chí qua từng chặng nằm trong [`PROJECT_PLAN.md`](PROJECT_PLAN.md). Hàng việc hiện tại là:

1. **P0 — Gỡ lỗi kỹ thuật đang chặn app.** Khi có log hoặc bằng chứng lỗi, đối chiếu đúng commit/runtime và sửa source; không tự đổi dữ liệu, quyền hoặc schema production.
2. **P1 — Làm luồng vào đúng công việc.** Đã triển khai trong workspace: chủ/quản lý/thu ngân vào Bán hàng; nhân viên kho vào Kho; kế toán vào Thu chi; mở lại giỏ đang chờ. Lần tải đầu chỉ gọi dữ liệu cần cho trang hiện tại, không tải đơn lịch sử không dùng.
3. **P2 — Bạn thử quy trình thật và gửi lỗi/log.** Phần chấp nhận thực tế trên cửa hàng và thiết bị do chủ dự án làm; mình xử lý lỗi source theo log, không yêu cầu bạn cung cấp mật khẩu hay dữ liệu khách.
4. **P3 — Chọn lát cắt code kế tiếp từ nhu cầu đã xác nhận.** Không tự chọn ngành hàng khi chưa có phản hồi sử dụng hoặc ưu tiên mới.
5. **P4 — Hoàn thiện lõi giao dịch và các nghiệp vụ còn thiếu.** Bán/thu tiền/tồn, nhập/ghi nợ, đổi trả/hoàn, ca/thu chi, công nợ, báo cáo; giữ kiểm soát chống gửi trùng, từ chối quyền, rollback và thao tác đồng thời.
6. **P5 — Thêm từng quy trình riêng theo mô hình sau khi được ưu tiên.** F&B, biến thể thời trang, lô/hạn mỹ phẩm, đơn online; không làm preset chỉ đổi tên menu.
7. **P6 — Mở rộng vai trò, thiết bị và trợ năng** theo lỗi/nhu cầu được người dùng báo.
8. **P7 — Kết nối đối tác** khi người dùng chọn provider và có quyền/môi trường thử.
9. **P8 — Đo rồi mới tối ưu hiệu năng.** Chọn một điểm nghẽn có số liệu và so cùng tình huống trước/sau.

## Chi tiết các gói việc còn mở

Các mục P0–P9 bên dưới giữ lại những đầu việc và bằng chứng từ kế hoạch trước. Thứ tự chạy là danh sách hiện hành ở trên; không hiểu số thứ tự cũ là cam kết phải triển khai ngành nào trước.

### P0 — Xác nhận runtime và xử lý lỗi kỹ thuật chặn app

**Mục đích:** biết lỗi có nằm ở source, runtime hay schema mà không biến advisory bảo mật thành điều kiện chặn mọi công việc code.

**Phạm vi:** đối chiếu commit Render `819f386…`, `/api/ready`, app ledger `0024`, cấu hình demo/email và log lỗi nếu người dùng gửi. Advisory RLS do chủ dự án tự quản lý; chỉ xem tiếp nếu có bằng chứng nó làm API/runtime thất bại. Không gửi mật khẩu hay secret vào tài liệu/chat.

**Bằng chứng cần:** dịch vụ khởi động, readiness trả thành công, lỗi đăng nhập/API được xử lý đúng theo log. Kiểm thử thực tế và restore do chủ dự án tự thực hiện.

**Phụ thuộc:** log hoặc kết quả kiểm tra do chủ dự án cung cấp khi có lỗi. App migration `0024` đã thấy trong ledger; không chạy lại migration hoặc đổi cấu hình production chỉ vì ghi chú cũ nói còn thiếu.

### P1 — Nghiệm thu lại POS và bố cục responsive

**Mục đích:** Xác nhận lỗi giỏ hàng đã hết trên đúng bản đang chạy và thao tác quầy không bị che/cắt.

**Phạm vi:** Sản phẩm thêm vào giỏ; mở/đóng drawer; tăng, giảm, xóa; tổng tiền; thêm sản phẩm; tìm bằng tên/SKU/mã vạch và chọn kho; thanh toán đến bước xác nhận. Camera hiện đã gỡ khỏi workspace nhưng việc có cần quét ở phân khúc mở màn còn chờ nghiên cứu. Có thể hủy trước khi gửi giao dịch. Không tạo giao dịch thật nếu chưa được chủ cửa hàng cho phép.

**Bằng chứng cần:** SHA bản chạy; thử trên màn 360×800, 390×844 và màn desktop/tablet; người thử ghi lại lỗi và hệ điều hành/trình duyệt. Đơn bán demo chỉ được ghi khi có dữ liệu thử và đồng ý rõ.

**Trạng thái:** người dùng báo hiện đã ổn; nghiệm thu thiết bị còn mở.

### P2 — Nghiệm thu onboarding hồ sơ cửa hàng và trải nghiệm tài khoản

**Mục đích:** Đưa người mới vào đúng các chức năng hiện có, giảm thuật ngữ và rối màn hình.

**Tài liệu đầu vào:** [`ONBOARDING_AND_ACCESS_PROFILES.md`](ONBOARDING_AND_ACCESS_PROFILES.md).

**Phạm vi đã có trong source/release trước:** migration 0024, chọn hồ sơ, onboarding một lần, hiện/ẩn mật khẩu, xác nhận mật khẩu lúc đăng ký và đổi mật khẩu trong Cài đặt. CI của thay đổi trước đã đạt. Render hiện có deploy live sau các thay đổi onboarding; Supabase app ledger đã ghi 0024. Chưa có bằng chứng runtime cho toàn bộ onboarding/đổi mật khẩu, role-boundary hoặc thiết bị; nội dung demo email và gửi thư thật chưa xác minh.

**Nguyên tắc:** hồ sơ cửa hàng lọc mục hiển thị, không thay role/API; chỉ thu chi và Cài đặt là mục chung; không hiển thị mục toàn bộ chức năng; nhân viên được mời không chọn hồ sơ của chủ. Không tuyên bố hỗ trợ nghiệp vụ F&B, đồng bộ online hay bán buôn chuyên sâu nếu chưa có luồng thật.

**Bằng chứng cần:** kiểm tra chủ mới, chủ cũ và nhân viên được mời; đổi hồ sơ không đổi dữ liệu/quyền; thử trên điện thoại, bàn phím và trình đọc màn hình; kiểm tra đổi mật khẩu đúng/sai, phiên hiện tại/phiên khác và liên kết đặt lại cũ; ngôn ngữ được người bán hiểu. Chưa đánh dấu đạt cho đến khi có runtime evidence.

### P3 — Tách vai trò nhân viên khỏi chế độ máy POS

**Mục đích:** Làm POS đơn giản cho thu ngân mà mỗi thao tác vẫn gắn đúng người.

**Phạm vi khảo sát:** tiếp tục dùng tài khoản cá nhân + vai trò `cashier`; xác định thanh điều hướng POS-only, chuyển người trực, khóa/timeout, ca tiền mặt, quyền hoàn/hủy, tên thiết bị và báo cáo. Chưa tạo tài khoản chung hoặc PIN chung.

**Bằng chứng cần trước code:** mô hình phiên, ca, actor/store/device, thu hồi máy mất, phân quyền server, kiểm thử hai nhân viên dùng cùng quầy mà không gán nhầm giao dịch.

### P4 — Hoàn tất bằng chứng cho nghiệp vụ bán lẻ đã có

**Mục đích:** Kiểm chứng chuỗi bán, tiền, tồn và lịch sử trên môi trường PostgreSQL tương thích production.

**Các phần còn phải đóng theo roadmap:** xác minh migrations/role/schema; sale–payment–stock–cash/debt–report; đổi/trả/hoàn và huỷ; nhập hàng/đơn mua/công nợ NCC; kiểm kê/điều chuyển; ca tiền; nhập CSV và số dư đầu kỳ; customer/order history; exports và phân quyền; native concurrency và audit. Dùng database cô lập và dữ liệu tổng hợp; không tạo dữ liệu thử trong cửa hàng thật nếu chưa được cho phép.

**Bằng chứng cần:** ledger khớp độc lập, thao tác gửi lại không ghi hai lần, rollback khi lỗi, không bán vượt tồn/hoàn quá số đã bán, ranh giới tenant/role, và người bán thử theo kịch bản.

### P5 — Hoàn tất kho tính năng và các lát cắt PIM/OMS còn mở

**Phạm vi:** đối chiếu chính xác trạng thái migration 0018 trở đi; duyệt giá/biến thể/lịch sử; native + browser cho đơn kênh ghi tay, SKU mapping, giữ/gửi/hủy tồn và bản chụp người nhận; đơn mua nhận từng phần; CSV và báo cáo theo kho; trạng thái lỗi/empty state. Kiểm tra mục nào đã đạt thì chuyển sang “đã có bằng chứng”; không làm lại chỉ vì nằm trong nhật ký cũ.

**Ngoài phạm vi hiện tại:** kết nối marketplace, nhãn vận đơn, đối soát COD, loyalty/chiến dịch, giá theo kênh và automation cần quyết định sản phẩm hoặc đối tác riêng.

### Sổ việc còn dở từ các phiên trước

Đây là các kiểm tra/tính năng còn mở đã được gom từ nhật ký cũ. Trước khi bắt tay vào từng việc, đối chiếu roadmap để bỏ qua mục đã có bằng chứng mới hơn:

| Khu vực | Việc còn mở |
| --- | --- |
| Tài khoản/cửa hàng | Xác minh luồng đăng ký/đăng nhập trên Render; onboarding cửa hàng/nhân viên; nhập CSV sản phẩm/khách/NCC, xem trước, lỗi từng dòng, gửi lại an toàn và số dư đầu kỳ; nghiệm thu với cửa hàng đại diện |
| Mặt hàng | Thử trên browser/điện thoại nhập và cập nhật hàng loạt; báo xung đột SKU/barcode rõ; nghiệm thu nhóm biến thể, lịch sử giá và nhập sản phẩm gắn tồn kho |
| Bán hàng/tiền | Nghiệm thu đủ bán, nhiều phương thức thu, tiền thừa, công nợ, ca tiền, hủy đơn, trả/hoàn theo dòng, lịch sử và báo cáo; kiểm tra gửi trùng, sai vai trò, hai nhân viên cùng sửa và rollback |
| Kho/mua hàng | Nghiệm thu PostgreSQL và giao diện cho nhập nhanh hàng cũ/hàng mới cùng phiếu nhận, nhập đúng số thực nhận, khoản đã trả/còn nợ, kiểm kê theo kho, điều chuyển, đơn mua/nhận từng phần chỉ cho cửa hàng cần, nhân viên giới hạn kho và CSV theo kho |
| Đơn đa kênh nội bộ | Xác minh migrations 0021–0023 theo thực tế; thử hồ sơ kênh chưa kết nối, mapping SKU, nhập mã đơn bằng bàn phím, giữ tồn, gửi/hủy, bản chụp người nhận, tìm kiếm và CSV. Camera/ảnh chụp đã bị gỡ khỏi workspace; không gọi đây là sync sàn |
| Khách hàng/CRM | Thử nhãn, bộ lọc/phân khúc đã lưu, lịch sử thanh toán và số dư; giữ các phần gộp khách trùng, loyalty/điểm và chiến dịch trong backlog |
| Bảo mật/dữ liệu | Đối chiếu role/RLS và log bảo mật, giới hạn truy cập theo kho, thu hồi phiên, privacy/retention/xóa, chống lạm dụng, backup/restore; offline bán hàng chưa được hỗ trợ |
| Thiết bị/trợ năng | Thử POS drawer, chọn kho/tìm kiếm, bố cục bảng, cỡ chữ/keyboard/screen reader, PWA và máy quét/in/chia sẻ trên thiết bị thật; iOS và Android 10+ chưa có ma trận nghiệm thu |
| Dịch vụ/đối tác | Email production, payment/QR, hóa đơn, kế toán, carrier/COD, marketplace/website, API/webhooks và subscription Slink cần nhà cung cấp, quyền, sandbox và đối soát; không cấu hình giả |

### P6 — Hosting, email, bảo mật và phục hồi

**Phạm vi:** xác nhận Render + Supabase đúng SHA, TLS/CA, quyền tối thiểu, secret env, migration có backup; sửa adapter email để gửi trường người gửi mà nhà cung cấp yêu cầu và kiểm tra gửi/nhận nếu bật xác minh; kiểm tra đổi/đặt lại mật khẩu, thu hồi phiên cũ và lịch sử bảo mật; theo dõi lỗi/health; backup mã hóa lưu ngoài máy; diễn tập restore vào database tách biệt; quyền riêng tư, thời hạn lưu/xóa dữ liệu, xử lý sự cố/hỗ trợ và rollback.

**Bằng chứng cần:** restore thật đọc được dữ liệu và xác thực; lịch backup/retention/alert có người chịu trách nhiệm; email được gửi/nhận ở môi trường phù hợp; không log secret; quy trình rollback được thử. Việc deploy hoặc migrate production là bước riêng có review, không suy ra từ CI xanh.

### P7 — Thiết bị, khả năng tiếp cận và làm việc ngoại tuyến

**Phạm vi:** xác nhận Android 10+ và iOS/iPadOS hỗ trợ, cài đặt/cập nhật PWA, màn dọc/ngang, cỡ chữ lớn, bàn phím, trình đọc màn hình, máy quét và in/chia sẻ nếu được hứa. Ghi rõ offline hiện chỉ mở app shell; chưa bán offline.

**Bằng chứng cần:** ma trận thiết bị/trình duyệt và kịch bản cốt lõi pass; trước khi làm giao dịch offline cần hàng đợi bền, idempotency, server acknowledgement, quy tắc xung đột và phục hồi.

### P8 — Mở rộng thương mại và ngành hàng sau khi lõi ổn định

**Phạm vi:** theo thứ tự tài liệu [`MULTICHANNEL_SCOPE.md`](MULTICHANNEL_SCOPE.md) và [`COMMERCIAL_READINESS.md`](COMMERCIAL_READINESS.md): chọn từng marketplace/website, vận chuyển/COD, thanh toán, hoá đơn điện tử, email và gói thu phí Slink; có sandbox, scope, hợp đồng, webhook/retry/đối soát và người vận hành trước khi code tích hợp. Quán ăn/cà phê, bán buôn và phân phối cần phạm vi riêng, không chỉ preset menu.

**Danh sách còn lại để không rơi khỏi kế hoạch:**

- **Kết nối kênh:** Shopee, TikTok Shop, Lazada/Tiki và website chỉ sau khi chọn đối tác, có OAuth/API scope, token an toàn, nhật ký đồng bộ, retry và xử lý lệch dữ liệu.
- **Sản phẩm đa kênh:** ánh xạ danh mục/thuộc tính từng sàn, ảnh/mô tả, bundle, giá theo kênh/nhóm khách và xuất bản sản phẩm.
- **Giao đơn:** mã vận đơn/nhãn hãng, trạng thái giao/lỗi, thao tác hàng loạt, COD đang đi/về, phí vận chuyển và đối soát hãng.
- **Tài chính ngoài cửa hàng:** đối soát tiền sàn, hoa hồng/phí/affiliate, ngân hàng/QR/cổng thanh toán, hóa đơn điện tử và thuế sau khi có xác nhận pháp lý/nhà cung cấp.
- **Khách hàng và tự động hóa:** trùng hồ sơ từ kênh, loyalty/điểm, voucher nâng cao/combo, chiến dịch có consent, giao việc và workflow duyệt. Chỉ triển khai sau khi quy tắc, quyền và dữ liệu nguồn đã rõ.
- **Mở rộng nhân sự/tích hợp:** chấm công, KPI/lương, API/webhook công khai, kế toán/website/marketing và subscription của Slink là các chặng sau, không phải điều kiện để giả vờ có kết nối.
- **Ngành hàng mới:** quán ăn/cà phê cần bàn, menu/modifier, bếp, công thức trừ tồn và xử lý huỷ món; bán buôn cần giá sỉ, đơn vị quy đổi và quy trình giao nhận.

### P9 — Tối ưu tốc độ (không bắt buộc)

**Mục đích:** Chỉ xử lý điểm chậm người dùng gặp.

**Cách làm:** đo thời gian tải/chờ của các trang và API chính, xác định một nút thắt, thay đổi nhỏ, so sánh trước/sau và giữ nguyên kiểm tra nghiệp vụ. Không refactor rộng hoặc thay cấu trúc dữ liệu chỉ để làm code trông gọn.

## Việc bị hủy hoặc đã được thay thế

- Hosting GCP ban đầu đã được thay bằng hướng Render + Supabase theo chỉ đạo sau; không đưa GCP thành bước active nếu người dùng chưa đổi lựa chọn.
- Video giới thiệu đã bị người dùng dừng/hủy; không tạo lại trừ khi được yêu cầu.
- Không xóa, seed hoặc migration dữ liệu production để “thử cho nhanh”.
- Các ghi chú lịch sử theo ngày vẫn giữ trong roadmap để truy lại bằng chứng; nếu mâu thuẫn, phần **Current snapshot** mới nhất trong roadmap là chuẩn.

## Cổng phát hành

Chưa gọi là sẵn sàng thương mại cho tới khi cả bảy cổng trong [`BUILD_CHARTER.md`](BUILD_CHARTER.md) có bằng chứng: nghiệp vụ đúng, dữ liệu phục hồi được, bảo mật/quyền, thiết bị, tích hợp được quảng bá, vận hành và người bán chấp nhận.
