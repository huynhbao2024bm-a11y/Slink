# Onboarding, cửa hàng và chế độ thao tác

## Cập nhật ưu tiên 2026-10-31

Hành trình hiện hành: đăng ký → chọn loại hình → thêm vài mặt hàng hoặc nhập danh sách → bán → bổ sung dữ liệu trong quá trình dùng. Phần triển khai local mới rút gọn hộp chọn loại hình, lưu lựa chọn trên máy chủ trước khi đánh dấu hoàn tất; không còn tự lưu “Chưa rõ” khi đóng. Có lựa chọn “Chưa rõ, hướng dẫn tôi” để xác nhận rõ ràng. Điều này thay thế mô tả “Để sau”/tự hoàn tất khi đóng trong các ghi chú cũ phía dưới.

Thêm mặt hàng nhanh lưu cả tồn ban đầu qua giao dịch nhập danh mục, có nút “Lưu và thêm tiếp”. Cửa hàng trống hướng tới thêm hàng hoặc nhập CSV; không buộc khai báo nhân viên, nhiều kho, kênh bán hoặc toàn bộ danh mục trước khi bán. Vai trò nhân viên vẫn do máy chủ cấp; chọn loại hình không nâng quyền. Chi tiết phạm vi và hạn chế ở `PRODUCT.md`, công việc còn lại ở `EXECUTION_PLAN.md`. Chưa nghiệm thu trải nghiệm/thiết bị hoặc phát hành các thay đổi này.

**Trạng thái:** Bản trong workspace có onboarding một lần và lọc menu theo hồ sơ; thay đổi lọc menu vừa được bổ sung theo yêu cầu người dùng ngày 2026-10-26. Chưa kiểm tra tự động/runtime, chưa xác minh migration trên database production, chưa deploy và chưa nghiệm thu trên trình duyệt/điện thoại. Đây chưa phải tính năng được xác nhận đang chạy cho người dùng.

## Mục tiêu

Giúp chủ cửa hàng mới vào đúng nhóm chức năng cần dùng ngay, giảm thuật ngữ và số lựa chọn ban đầu. Chủ tiệm tạp hóa, cửa hàng online, cửa hàng nhiều kho và người mới dùng phần mềm đều có thể bắt đầu mà không phải tự hiểu các chữ như PIM, OMS hay WMS. Mục tiêu hàng đầu là dễ dùng, thân thiện với mọi người, không giả định tuổi hoặc trình độ công nghệ.

Việc chọn hồ sơ chỉ sắp xếp cách dùng những khả năng Slink đã có. Nó không tạo nghiệp vụ giả, không biến đơn nhập tay thành đồng bộ sàn và không cấp thêm quyền.

## Ba khái niệm phải tách riêng

| Khái niệm | Gắn với | Tác dụng | Không được dùng để |
| --- | --- | --- | --- |
| Cách cửa hàng vận hành | Cửa hàng | Chọn trang bắt đầu, lối tắt và hướng dẫn phù hợp | Cấp quyền truy cập hoặc khẳng định Slink có tính năng chưa làm |
| Vai trò nhân viên | Thành viên trong cửa hàng | Cho phép hoặc từ chối thao tác ở máy chủ; hiện có chủ cửa hàng, quản lý, thu ngân, nhân viên kho và kế toán | Thay đổi theo lựa chọn hồ sơ cửa hàng |
| Cách hiển thị / máy bán hàng | Tùy chọn cá nhân hoặc thiết bị, sau khi thiết kế | Giảm rối, tăng khả năng đọc hoặc tập trung vào bán hàng | Dùng chung tài khoản khiến mất người chịu trách nhiệm cho thao tác |

Hồ sơ cửa hàng và vai trò phải độc lập. Ẩn một mục trên màn hình chỉ là sắp xếp giao diện; API vẫn phải kiểm tra vai trò thật.

## Luồng chọn cách vận hành một lần

1. Sau khi chủ tạo tài khoản/cửa hàng và vào ứng dụng lần đầu, hỏi cách cửa hàng đang vận hành. Cửa hàng đã tồn tại trước cập nhật cũng được hỏi đúng một lần nếu chưa có trạng thái hoàn tất.
2. “Để sau” lưu hồ sơ “Chưa rõ” và hoàn tất bước chọn; không hỏi lại khi tải trang, đăng nhập lần sau hay dùng thiết bị khác.
3. Sau khi chọn, menu chỉ hiện các khu vực phù hợp với hồ sơ. Khu vực nghiệp vụ khác được ẩn khỏi menu, không bị xóa và không mất dữ liệu. Mục “Khác” trên điện thoại chỉ chứa các mục còn lại trong hồ sơ đã chọn, không mở toàn bộ chức năng.
4. Thu chi và Cài đặt vẫn hiện như các mục chung vì mọi cửa hàng cần theo dõi tiền và quản lý tài khoản. Cài đặt cho chủ/quản lý đổi hồ sơ; menu được cập nhật theo lựa chọn mới.
5. Khi chủ cửa hàng mời nhân viên, nhân viên nhận đúng cửa hàng/vai trò theo lời mời; không hỏi họ chọn hồ sơ thay chủ.

### Các lựa chọn ban đầu

| Lựa chọn hiển thị | Ví dụ dễ nhận ra | Nhóm mục hiện trong menu |
| --- | --- | --- |
| **Bán tại cửa hàng** (`retail`) | Tạp hóa, cửa hàng tiện lợi, thời trang, mỹ phẩm, đồ gia dụng | Hiện Tổng quan, Bán hàng, Mặt hàng, Đơn hàng, Khách hàng và Kho |
| **Bán hàng online** (`online`) | Cửa hàng nhận đơn qua mạng xã hội hoặc website | Hiện Kênh bán, Đơn hàng, Mặt hàng, Khách hàng và Kho. Ghi nhận đơn ngoài vẫn thủ công; chưa đồng bộ Shopee, TikTok Shop, Lazada hay website |
| **Quản lý kho hoặc nhiều điểm bán** (`warehouse`) | Cửa hàng có nhiều kho, chi nhánh hoặc nơi giao hàng | Hiện Kho, Mặt hàng, Đơn hàng và kênh ghi nhận đơn ngoài; quyền từng nhân viên vẫn do chủ cài |
| **Cửa hàng lớn hoặc nhiều nhân viên** (`large_business`) | Cần thường xuyên theo dõi nhân viên và báo cáo | Hiện Báo cáo, Nhân viên, Kho, Bán hàng, Đơn hàng, Mặt hàng và Khách hàng; vẫn chịu kiểm tra quyền hiện có |
| **Tôi chưa rõ, hướng dẫn tôi bắt đầu** (`unsure`) | Người chưa chọn được cách phù hợp | Hiện các mục cơ bản: Tổng quan, Bán hàng, Mặt hàng, Đơn hàng và Kho; chưa có hướng dẫn từng bước tự động |

Menu desktop/mobile là bộ lọc hiển thị theo hồ sơ, không chỉ là sắp xếp ưu tiên. Không có mục “Tất cả chức năng” để lộ lại các phần đã ẩn. Chủ/quản lý có thể đổi hồ sơ trong Cài đặt; nhân viên chỉ thấy phần giao giữa hồ sơ cửa hàng và quyền vai trò của mình. API tiếp tục là nơi quyết định quyền thật. Hồ sơ không thay đổi quyền, dữ liệu hay số liệu.

Ví dụ ngành hàng như quán ăn, quán cà phê, bán buôn/phân phối có thể được ghi nhận riêng để nghiên cứu, nhưng không nên trình bày như một chế độ hoàn chỉnh. Trước khi gọi là phù hợp cho quán ăn/cà phê, cần có và nghiệm thu ít nhất quy trình bàn/đơn tại chỗ, món và tuỳ chọn món, ghi chú bếp, trạng thái chế biến, công thức/định lượng trừ kho và kiểm soát huỷ món. Trước khi gọi là phù hợp cho bán buôn, cần chốt giá theo nhóm khách, đơn vị quy đổi, hạn mức/công nợ và quy trình giao nhận.

Ngành hàng nên là câu hỏi tùy chọn riêng với các ví dụ như tạp hóa/tiện lợi, thời trang, mỹ phẩm, đồ gia dụng, ăn uống, bán buôn/phân phối và khác. Dùng lựa chọn này để điều chỉnh từ ngữ/hướng dẫn hoặc ưu tiên nghiên cứu; không tự bật module chưa hoàn chỉnh và không bắt người dùng chọn một ngành hàng duy nhất cho mọi hoạt động của họ.

## Chế độ dễ bắt đầu

Đây là tùy chọn dễ dùng cho mọi người, không phải “chế độ cho người già”. Đề xuất gồm:

- dùng từ quen thuộc như “Mặt hàng”, “Đơn hàng”, “Kho”, “Tiền thu/chi”;
- tăng cỡ chữ và vùng chạm; giữ tương phản và tiêu điểm bàn phím;
- đưa một hành động chính lên trước, giải thích ngay cạnh trường nhập;
- chỉ hiện các khu vực cần cho hồ sơ cửa hàng; các khu vực khác được ẩn khỏi menu để giảm rối;
- chủ/quản lý có thể đổi hồ sơ từ Cài đặt khi cách vận hành thay đổi; việc đó chỉ thay menu, không đổi dữ liệu hay quyền;
- không tự động bỏ qua xác nhận khi thao tác ảnh hưởng đến tiền, tồn kho hoặc dữ liệu khách.

### Hướng dẫn bắt đầu theo vai trò (workspace 2026-10-29)

- Sau đăng nhập, người dùng vào trang Tổng quan. Chủ/quản lý thấy bước đầu theo hồ sơ cửa hàng; thu ngân thấy cách bán; nhân viên kho thấy nhập/kiểm hàng; kế toán thấy thu chi và báo cáo.
- Hướng dẫn tự ẩn sau khi có mặt hàng hoặc đơn; mở lại bằng nút Trợ giúp. Các nút dẫn thẳng đến đúng màn hình và không tạo dữ liệu mẫu.
- Kho chính tự chọn trong POS, phiếu nhập và đơn kênh. Khi có nhiều kho, đổi kho là lựa chọn phụ; tồn trong đơn đang mở vẫn khóa ở kho đã chọn.
- POS mở camera ngay sau khi người dùng bấm quét. Sau 10 giây chưa đọc được, ứng dụng tự chụp một khung hình và thử đọc lại trên máy; nếu chưa được, hướng dẫn căn mã lại hoặc nhập tay. Ảnh chỉ tồn tại trong màn hình, không lưu cùng đơn.
- Trong biểu mẫu ghi đơn từ kênh online, nút “Quét mã đơn” mở camera ngay trong biểu mẫu, điền mã nhận diện được vào ô mã đơn, và không làm mất thông tin đang nhập. Nếu không đọc được sau 10 giây, ảnh tạm hiện để người dùng nhìn lại; ảnh không được gắn vào đơn.
- Chưa có OCR hoặc lưu ảnh đơn online. Trước khi triển khai cần chọn định dạng ảnh/mã của từng kênh, cách người dùng duyệt thông tin trích ra, nơi lưu tệp có phân quyền và thời hạn xóa; không được biến ảnh thành giao dịch nếu người dùng chưa xác nhận các dòng hàng, kho và trạng thái thanh toán.

Đề xuất bật cách hiển thị đơn giản cho cửa hàng mới, nhưng hỏi người dùng hoặc cho tắt ngay trong thiết lập. Cỡ chữ cá nhân là sở thích của từng người; danh sách chức năng ban đầu là cấu hình cửa hàng. Không gộp hai thiết lập này vào một cờ nếu chúng có vòng đời khác nhau.

Hướng này dựa trên hướng dẫn W3C: nhu cầu của người lớn tuổi phần lớn được đáp ứng bằng các nguyên tắc accessibility chung, như phóng to chữ và điều hướng rõ ràng, thay vì một giao diện riêng gắn nhãn tuổi. Đây là cơ sở thiết kế; vẫn cần người bán thật thử nghiệm.

## Phân biệt nhân viên và thiết bị POS

Thu ngân là **một nhân viên có tài khoản riêng và vai trò thu ngân**. “Màn hình bán hàng” là cách mở Slink tập trung vào thao tác quầy, không phải một tài khoản chung mới. Mỗi đơn, khoản thu/hoàn và ca tiền mặt phải lưu đúng người thực hiện.

Trước khi làm màn hình POS theo thiết bị, cần chốt:

- đăng nhập cá nhân trên từng máy và cách chuyển người trực;
- thời gian tự khóa, mở khóa lại và xử lý khi mất máy;
- cách mở/đóng ca tiền mặt, quyền hoàn/hủy và giới hạn xem giá vốn;
- tên thiết bị/điểm bán nếu cần báo cáo theo máy;
- ghi nhận actor, store, thiết bị, thời gian và kết quả cho mọi thao tác.

Không tạo “tài khoản bán hàng” dùng chung hoặc PIN chung nếu chưa có cách nhận biết nhân viên thực hiện. Nếu sau này có khóa nhanh bằng mã PIN, nó phải mở phiên cá nhân đã xác thực và không thay vai trò phía máy chủ.

## Phạm vi lát cắt đầu tiên (mã đã thêm, chưa nghiệm thu)

1. Migration 0024 thêm `business_profile` và `onboarding_completed_at`; giá trị rỗng để cửa hàng cũ không bị đổi ngầm.
2. Chủ cửa hàng được hỏi một lần; nhân viên được mời không bị đưa qua onboarding chủ; “Để sau” chọn `unsure`.
3. Hồ sơ lọc điều hướng desktop/mobile; không có lối vào toàn bộ chức năng. Menu “Khác” trên điện thoại chỉ liệt kê phần còn lại thuộc hồ sơ đang chọn.
4. Cài đặt cho chủ/quản lý đổi lựa chọn; API lưu cùng nhật ký cửa hàng, không đổi quyền hoặc dữ liệu nghiệp vụ.
5. Xác minh giới hạn mật khẩu hiện tại, mật khẩu mới và nhập lại khi đổi mật khẩu trong Cài đặt; backend cập nhật hash trong giao dịch, vô hiệu liên kết đặt lại còn hiệu lực và thu hồi các phiên khác.

### Quét mã khi ghi nhận đơn online

- Quét mã mặt hàng ở quầy để tìm sản phẩm; quét mã đơn trong biểu mẫu kênh bán chỉ điền mã đơn vào đơn đang soạn.
- Hướng dẫn trên màn hình yêu cầu mở mã đơn trên màn hình khác, cho phép camera nếu điện thoại hỏi, rồi đưa mã vào giữa khung và giữ máy yên, đủ sáng. Nếu chưa đọc được trong 10 giây, camera tự chụp một ảnh tạm để người dùng nhìn lại và nhập mã. Nếu chỉ có một điện thoại, người dùng nhập hoặc dán mã thay vì cố quét chính màn hình đó.
- Mã vừa đọc vẫn cần kiểm tra. Người dùng phải tự rà soát mặt hàng, số lượng, giá, người nhận, địa chỉ và trạng thái thanh toán trước khi giữ tồn.
- Ảnh chỉ nằm tạm trên thiết bị, không được lưu vào đơn hoặc gửi lên máy chủ. Slink chưa đọc chữ trong ảnh và chưa tự tạo đơn từ ảnh; giao diện phải nói rõ giới hạn này.
- Nghiệm thu trên HTTPS ở điện thoại: mã đơn không bị đưa nhầm vào ô mã mặt hàng; mở scanner không làm mất dữ liệu biểu mẫu; fallback ảnh không đóng biểu mẫu; gửi thiếu dữ liệu vẫn bị chặn; camera dừng khi đóng cửa sổ.

Không đưa lựa chọn “chế độ thu ngân trên thiết bị riêng” vào lát cắt đầu tiên. Trước hết dùng vai trò thu ngân hiện có; thiết kế phiên/thiết bị thành một quyết định riêng sau.

## Điều kiện nghiệm thu

- Chủ mới được hỏi một lần; chủ cửa hàng cũ được hỏi đúng một lần khi chưa hoàn tất; tải lại, đăng nhập lại hoặc đổi thiết bị không hỏi lại.
- Sau khi chọn hồ sơ, chỉ nhóm mục phù hợp xuất hiện trên desktop và điện thoại; mục “Khác” không làm lộ các module ngoài hồ sơ.
- Đổi hồ sơ trong Cài đặt cập nhật menu nhưng không xóa dữ liệu, đổi số liệu hoặc thay quyền phía máy chủ.
- Thu chi/Cài đặt vẫn hiện cho mọi hồ sơ; từng màn vẫn ẩn nếu vai trò nhân viên không có quyền.
- Nhân viên được mời vào đúng cửa hàng/vai trò và không bị hỏi thông tin dành cho chủ.
- Lựa chọn online nói rõ nhập tay hay đã kết nối; không có dấu “đã đồng bộ” nếu chưa có xác nhận nhà cung cấp.
- Nhân viên được mời không bị hỏi hồ sơ chủ; menu của họ là giao giữa hồ sơ đã chọn và quyền được cấp.
- Người dùng đổi lại hồ sơ mà không mất mặt hàng, đơn hàng, tồn, công nợ hay lịch sử.
- Kiểm tra bàn phím, trình đọc màn hình, phóng to chữ đến 200% mà không mất nội dung/chức năng, và điện thoại; chủ cửa hàng mới hoàn tất các bước đầu mà không cần người phát triển giải thích.
- Đổi mật khẩu: mật khẩu hiện tại sai bị từ chối; mật khẩu mới dưới 12 ký tự hoặc nhập lại không khớp bị chặn; mật khẩu đúng được đổi; phiên hiện tại tiếp tục, phiên khác và liên kết đặt lại cũ không còn dùng được; thao tác được ghi vào lịch sử bảo mật.

## Phụ thuộc và việc còn mở

- Migration 0024 thêm trường lưu hồ sơ đã có sẵn; backup mới đã được xác minh ngày 2026-10-26, còn chờ chạy workflow production và kiểm tra hậu migration.
- Xác nhận API/UI với PostgreSQL; thử hỏi một lần với chủ mới/chủ cũ, không hỏi nhân viên theo lời mời, và xác nhận menu lọc đúng theo từng hồ sơ trên desktop/điện thoại.
- Thử đổi hồ sơ trên màn hình desktop/điện thoại, bàn phím và trình đọc màn hình; xác nhận mọi chức năng và quyền không đổi.
- Thử đổi mật khẩu qua API/database và phiên đăng nhập trên ít nhất hai thiết bị/trình duyệt.
- Lựa chọn hiện tại là một hồ sơ chính; ngành hàng riêng và nhiều hồ sơ đồng thời chưa được chốt.
- Hồ sơ hiện là cài đặt cấp cửa hàng, đổi được bởi chủ/quản lý; sở thích cỡ chữ cá nhân chưa triển khai.
- POS thiết bị, PIN, phiên ca và báo cáo theo thiết bị cần thiết kế bảo mật riêng trước khi triển khai.
- Quán ăn/cà phê, bán buôn, kết nối sàn và các tính năng online thực cần phạm vi cùng đối tác/đầu vào riêng; không nằm trong lời hứa của onboarding đầu tiên.

## Bằng chứng cần ghi vào roadmap

Ghi rõ bản build, cửa hàng thử được phép dùng, thiết bị và luồng đã thử. Chỉ đánh dấu lát cắt onboarding đạt khi có thử nghiệm với chủ cửa hàng mới và nhân viên theo lời mời, đồng thời xác nhận hồ sơ không đổi quyền hoặc số liệu.

## Nguồn thiết kế

- [W3C WAI — Older Users and Web Accessibility](https://www.w3.org/WAI/older-users/): nhu cầu của người lớn tuổi được hỗ trợ bằng các nguyên tắc accessibility dùng chung.
- [W3C WAI — Understanding Resize Text](https://www.w3.org/WAI/WCAG21/Understanding/resize-text): nội dung cần giữ nguyên chức năng khi chữ được phóng to đến 200%.
- [W3C WAI — Cognitive Accessibility: Help Users Find What They Need](https://www.w3.org/WAI/WCAG2/supplemental/objectives/o2-find/): điều hướng rõ giúp người dùng tìm đúng việc.
