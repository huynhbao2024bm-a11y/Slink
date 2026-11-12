# Đánh giá vận hành và khoảng cách cạnh tranh — 04/11/2026

## Kết luận để quyết định

Slink đã có nền nghiệp vụ bán lẻ thật, không chỉ có các màn hình mẫu. Có thể chọn một cửa hàng bán sản phẩm đơn giản, một quầy tiền để chạy thử có kiểm soát. Chưa đủ bằng chứng để giao làm công cụ vận hành duy nhất cho khách trả phí. Với shop online, affiliate hoặc quán có pha chế/bếp, hiện còn thiếu nghiệp vụ cốt lõi.

Chức năng offline mới giải quyết được việc tiếp tục ghi giao dịch và gửi lại an toàn trong các tình huống đã thử. Nó chưa giải quyết hết việc xử lý chênh lệch giữa các thiết bị. Không lấy số lượng màn hình, số kiểm tra đạt hoặc HTTP 200 làm tỷ lệ hoàn thiện của sản phẩm.

## Bản được đánh giá và ranh giới bằng chứng

- Mã phát hành: `7cdb82071a8143d44db8cf2d72151458eb2651d6`, nhánh `codex/offline-operations-20261103`, [PR #38](https://github.com/huynhbao2024bm-a11y/Slink/pull/38), đúng 25 tệp mã/kiểm tra/hướng dẫn deploy; không có `docs/`, dữ liệu thử hoặc thông tin đăng nhập.
- [GitHub CI 41844000885](https://github.com/huynhbao2024bm-a11y/Slink/actions/runs/41844000885): cả API/schema acceptance và production container build đều đạt.
- Cục bộ: 56/56 kiểm tra Node/API/schema/domain; 3/3 kiểm tra PostgreSQL 18.6 thật, dùng hai role riêng. Thử đồng thời hai đơn cùng mua 8 khi tồn 12: chỉ một đơn thành công, còn tồn 4, tiền và receipt không ghi trùng.
- Trình duyệt Edge: ca ngoại tuyến 7 thao tác, mất phản hồi sau khi máy chủ đã ghi, xung đột giá, hai tab, lỗi lưu trữ, đóng hẳn rồi mở lại trình duyệt, tài khoản demo mới, danh mục 130 hàng và 115 tổ hợp màn hình/modal ở 9 độ rộng. Đây là mô phỏng trình duyệt desktop, không phải nghiệm thu điện thoại thật.
- Tại thời điểm rà soát, Render đang live `99d6573` (PR #37), deploy `dep-dbkrvhk9v7es73d05jl0`. Supabase PostgreSQL 17.11 còn ở migration `0026`, chưa có `offline_operation_receipts`. Vì vậy các kiểm tra website dưới đây thuộc bản đang chạy trước PR #38.
- Website trả `/api/ready` 200. Lần đầu đo 32,6 giây, lần kiểm tra tiếp theo 811ms; chưa cô lập nguyên nhân nên không kết luận đó là độ chậm của giao diện hoặc của database. Render đang dùng free instance. `/sw.js` còn là `slink-calm-workspace-v1`, xác nhận bản offline mới chưa được triển khai. Không có log warning/error trong cửa sổ 13:00–14:05 UTC; không có nghĩa mọi nghiệp vụ đều đã chạy thành công.
- Không tạo tài khoản, đơn bán hoặc chứng từ thử trong production trong đợt rà soát này. Các ca nghiệp vụ trước đó ở [đánh giá 03/11](OPERATIONAL_REVIEW_20261103.md) vẫn có giá trị đúng phạm vi đã ghi.
- Bản sao lưu mới nhất nhìn thấy hiện là bản đã verify ngày 26/10. Đang chờ người dùng chạy sao lưu mới bằng mật khẩu nhập riêng trên máy trước khi chạy `0027` và gộp main. Đây là phụ thuộc phát hành, không phải lỗi của CI.

## Đã có gì thực sự dùng được?

| Công việc của cửa hàng | Đã có hành vi thật | Chưa được suy ra từ bằng chứng hiện có |
| --- | --- | --- |
| Bắt đầu dùng | Đăng ký, đăng nhập, chọn loại hình, thêm hàng/import, vào POS; mật khẩu có hiện/ẩn và đổi trong cài đặt. | Email xác minh/khôi phục và mời nhân viên qua dịch vụ thật chưa nghiệm thu lại. Bỏ xác minh demo không thay được khôi phục tài khoản. |
| Hàng hóa | Tên/giá/tồn đầu, SKU theo biến thể, import có xem trước, ảnh lưu trên máy chủ và phân quyền đọc. | Chưa có lô/hạn dùng, serial, bộ quy đổi đơn vị hoặc công thức nguyên liệu. Không nhầm biến thể size/màu với định lượng pha chế. |
| Bán tại quầy | Chọn hàng, đổi số lượng, giảm giá, nhận tiền, ghi đơn/tồn/tiền/công nợ; kiểm tra chống ghi trùng. | QR/chuyển khoản/thẻ do người bán xác nhận. Chưa có nguồn ngân hàng xác nhận đã nhận tiền. |
| Đổi trả | Trả một phần, hoàn tiền/nhập lại hàng, giới hạn số đã bán, cập nhật báo cáo; đã chạy UI cục bộ. | Chưa có thao tác đổi sản phẩm liền một giao dịch. Chưa có quy trình trả hàng nhà cung cấp nối với phiếu nhập và tiền/công nợ. |
| Nhập và kho | Nhận hàng, đơn đặt nhà cung cấp/nhận từng phần, kiểm kê, chuyển kho/nhận từng phần, lịch sử tồn và kiểm tra quyền kho. | Nhiều kho không đồng nghĩa có nhiều chi nhánh/quầy độc lập đã nghiệm thu. Chưa thử dài ngày với nhiều thiết bị thật. |
| Tiền và nợ | Thu/chi, nợ khách/nhà cung cấp, thu nợ, trả nợ, mở/chốt ca và đối chiếu chênh lệch. | Chỉ một ca tiền mặt mở/store theo unique index. Lãi gộp không phải kết quả sau mọi chi phí; chưa có bộ sổ kế toán/thuế hoặc phát hành hóa đơn điện tử qua nhà cung cấp. |
| Nhân viên | Lời mời, tham gia, các vai trò và API chặn thao tác ngoài quyền; thu ngân vào luồng bán gọn. | Chưa có chấm công/lương, bàn giao nhiều quầy hoặc quản trị chuỗi hoàn chỉnh. Ẩn menu không thay kiểm tra API. |
| Mất mạng | Thiết bị đã chuẩn bị dữ liệu có thể bán, nhận hàng, kiểm đếm từng hàng, thu/chi, mở/chốt ca; giữ chứng từ và giỏ khi đóng/mở lại, tự gửi khi có mạng. | Chỉ dữ liệu đã tải; không đăng nhập tài khoản mới offline. Trả/hủy, thu/trả nợ, chuyển kho, sửa danh mục, tài khoản và provider cần mạng. Chưa có đồng bộ khi ứng dụng bị hệ điều hành đóng; chưa nghiệm thu iOS/Android thật. |
| Shop online | Khai báo kênh và ghép SKU, nhập đơn bằng tay, giữ hàng, đóng gói, gửi/hủy và lưu lịch sử. | Chưa kết nối tài khoản sàn, tự lấy đơn/tồn, tạo vận đơn, nhận trạng thái hãng giao, nhận/đối soát COD và phí hoặc xử lý hoàn sàn đầu-cuối. Bấm “Đã giao” chưa chứng minh tiền đã về. |
| Affiliate | Không gian cá nhân, lưu/sửa/sao chép link Shopee/TikTok, giữ tham số link. | API chủ động trả `earnings: null`: chưa có xác nhận link thuộc tài khoản affiliate, click/chuyển đổi/đơn/hoa hồng và kỳ thanh toán. Hiện là công cụ lưu link. |

Nguồn mã chính: `app.js`, `offline-store.js`, `offline-sync.js`, `offline-ledger.js`, `server/sales.js`, `returns.js`, `purchases.js`, `purchase-orders.js`, `stock.js`, `cash-register.js`, `finance.js`, `staff.js`, `channel-orders.js`, `channel-mappings.js`, `affiliate.js` và các bài `server/test/`. Tệp hoặc route tồn tại chỉ giúp xác định phạm vi; kết luận “đã chạy” dựa vào bằng chứng kiểm thử ghi phía trên và ngày 03/11.

## Các điểm còn cản trở vận hành hằng ngày

### P1 — có giữ chứng từ xung đột, nhưng chưa có cách xử lý hoàn chỉnh cho chủ cửa hàng

Tình huống thật: máy A mất mạng, đã bán và thu 80.000đ; máy B đổi giá lên 90.000đ. Khi A nối lại, máy chủ từ chối vì giá đã đổi, giữ nguyên chứng từ 80.000đ và dừng các chứng từ sau. Bảo toàn tiền đã ghi là đúng, nhưng chủ cửa hàng hiện chỉ có xem nội dung, tải bản JSON và thử gửi lại. Gửi lại cùng nội dung không tự giải quyết được giá hoặc tồn đã thay đổi thật. Bài thử khôi phục giá phía máy chủ rồi gửi lại chứng minh chống trùng; không thay được một nghiệp vụ giải quyết chênh lệch cho người dùng.

Căn cứ: `server/sales.js` trả `offline_price_changed`; `offline-sync.js` dừng ở conflict; `app.js` phần `openOfflineRecords` chỉ có xem/thử lại/xuất đối chiếu. Chưa có màn phân quyền cho quản lý chấp nhận giá lịch sử, liên kết với chứng từ đã ghi bằng cách khác hoặc lập bút toán điều chỉnh tương ứng. Không được thêm nút xóa hàng đợi để che chênh lệch.

**Điều kiện đạt:** chủ cửa hàng xử lý một đơn đã thu tiền bị đổi giá/thiếu tồn/đổi ca, lịch sử giữ nguyên, không ghi lại doanh thu hai lần, các việc sau tiếp tục đúng. Đây là ưu tiên trước khi xem offline là nền vận hành duy nhất.

### P1 — shop online chưa khép được vòng hàng và tiền

Hiện biết hàng nào đã giữ/xuất theo đơn nhập tay nhưng chưa chứng minh được: đơn lấy từ nguồn nào, hãng giao xác nhận gì, khách trả hàng đã về kho chưa, sàn/hãng còn giữ bao nhiêu tiền và phí lệch ở đâu. Đây là khoảng trống chức năng, không thể bù bằng dashboard đẹp hoặc thêm các trạng thái thủ công.

**Điều kiện đạt:** chọn một kênh được cấp quyền, từ đơn thật/sandbox → giữ hàng → giao/hủy/hoàn → nhận tiền/phí → đối soát; event lặp và đảo thứ tự không ghi trùng, hàng và tiền khớp nguồn. Affiliate là luồng khác, chỉ triển khai số liệu khi lấy được nguồn xác thực.

### P1 trước giao khách — khả năng khôi phục và thiết bị sử dụng thực

Backup verify xác nhận tệp sao lưu hợp lệ; chưa phải phục hồi rồi đối chiếu đầy đủ trên schema mới. Cần thử khôi phục môi trường tách biệt, giao dịch đồng thời, mất kết nối dài, cập nhật PWA khi có chứng từ chờ, đổi tài khoản/hết phiên và điện thoại thật. Những gì không xác minh được từ dịch vụ bên ngoài phải ghi là phụ thuộc, không giả lập thông báo thành công.

Render hiện chưa đặt đường dẫn HTTP health check (trường healthCheckPath rỗng). Có `/api/ready` nhưng nền tảng chưa được cấu hình dùng nó để theo dõi trạng thái sẵn sàng HTTP. Xem [Render health checks](https://render.com/docs/health-checks) để phân biệt TCP và HTTP; đây là mục cần hoàn thiện khi chuẩn hóa vận hành, không phải bằng chứng website đang ngừng chạy.

### P2 — còn những thao tác buộc người bán làm vòng

- Đổi size/màu: trả đơn rồi bán đơn mới, thiếu màn tự bù chênh lệch tiền.
- Trả hàng lỗi cho nguồn nhập: chưa có nghiệp vụ liên kết tồn–giá vốn–nợ/tiền hoàn từ nhà cung cấp.
- Chứng từ chờ hiện JSON và thuật ngữ kỹ thuật; chưa đạt mục tiêu người không biết công nghệ tự xử lý được.
- Nhập hàng, kiểm kê, tài chính cần nghiệm thu bằng công việc đầy đủ với dữ liệu dài, không chỉ kiểm tra không tràn màn hình.
- Mỗi store một ca tiền; chưa thể dùng như nhiều ngăn kéo độc lập. Cần chọn nhóm khách rồi mới mở rộng, không ép mọi cửa hàng khai báo cấu trúc phức tạp.

## So với KiotViet và Sapo: khác biệt nghiệp vụ, không so quy mô

Nguồn là hướng dẫn công khai của nhà cung cấp, đọc ngày 04/11/2026. Đây là năng lực họ mô tả, không phải kiểm thử độc lập của mình hoặc cam kết mọi gói đều có.

| Quy trình | Đối thủ đã mô tả | Khoảng cách hiện tại của Slink |
| --- | --- | --- |
| Bán đa kênh | KiotViet có kết nối sàn, đồng bộ hàng/đơn và xử lý yêu cầu hủy/hoàn; Sapo có kết nối TikTok Shop. [KiotViet](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ban-online/ket-noi-san-tmdt/), [Sapo](https://support.sapo.vn/ket-noi-tiktok-shop/). | Mới có dữ liệu kênh và đơn nhập tay; thiếu tích hợp thật và cơ chế theo dõi lỗi đồng bộ. |
| Tiền giao hàng | Sapo có danh sách đối soát COD/phí, trạng thái và tình trạng thanh toán. [Hướng dẫn](https://help.sapo.vn/huong-dan-xem-doi-soat-cod-va-phi-tren-sapo). | Chưa có sổ tiền sàn/hãng giao, phí thực tế và so khớp kỳ chuyển tiền. |
| Đổi hàng và trả nguồn nhập | KiotViet cho chọn hàng đổi ngay khi trả và có nghiệp vụ trả hàng nhập; Sapo quản lý đơn trả nhà cung cấp với hàng/tiền riêng. [Đổi trả](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-tra-hang/tra-hang/?industry=retailer), [Trả hàng nhập](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-giao-dich/tra-hang-nhap/), [Sapo](https://help.sapo.vn/xem-tim-kiem-loc-danh-sach-don-tra-hang-nhap). | Hoàn khách đã có; đổi hàng liền mạch và trả nhà cung cấp còn thiếu. Quan trọng với shop thời trang/mỹ phẩm. |
| Cafe/quán ăn | KiotViet mô tả định lượng, topping, bàn/gộp/tách và báo bếp; Sapo hướng dẫn liên kết nguyên liệu, in phiếu bếp/tem. [KiotViet FnB](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-he-thong-giai-phap-kiotviet/tong-quan-cac-nhom-giai-phap-kiotviet/), [Nguyên liệu Sapo](https://help.sapo.vn/lien-ket-nguyen-lieu-hang-ton-tren-phan-mem-sapo-fnb), [Phiếu bếp Sapo](https://help.sapo.vn/in-phieu-bep-tem-va-phieu-kiem-do-tren-ung-dung-sapo-fnb). | Bán SKU độc lập được nhưng chưa có vận hành nguyên liệu/bếp; chưa phù hợp thay hệ thống quản lý quán đầy đủ. |
| Kho đặc thù | Sapo có phiên bản, combo, quy đổi và quản lý lô/hạn dùng trong tài liệu sản phẩm/kho. [Tổng quan](https://help.sapo.vn/tong-quan-cac-tinh-nang-quan-ly-san-pham-kho-hang). | Biến thể đã có; combo trừ thành phần, lô/hạn và quy đổi chưa có bằng chứng triển khai. Chỉ cần ưu tiên theo ngành được chọn. |

Không kết luận affiliate của đối thủ có những gì khi chưa đọc được tài liệu tương ứng. Khoảng thiếu affiliate của Slink dựa vào mục tiêu đã chọn và mã hiện tại, không gán năng lực chưa xác minh cho KiotViet/Sapo.

## Dùng thật cho nhóm nào lúc này?

| Nhóm | Nhận định |
| --- | --- |
| Shop nhỏ bán SKU/size/màu, một quầy | Có thể chạy thử có kiểm soát. Phải thử đủ ca, đổi trả, nhập kho, nợ và khôi phục trên thiết bị thật trước khi dùng làm sổ duy nhất. |
| Mỹ phẩm có yêu cầu theo lô/hạn | Chưa đủ cho yêu cầu truy vết đó. Không khuyên thay bằng ô ghi chú. |
| Cafe/trà sữa có công thức, topping hoặc bếp | Chưa đủ. POS chọn món đơn giản chưa phải hệ thống vận hành quán. |
| Shop online cần giảm nhập tay | Chưa đủ: thiếu tự lấy đơn, vận đơn và đối soát. |
| Người làm affiliate cần quản lý thu nhập | Chưa đủ: hiện chỉ lưu link, chưa có số liệu nguồn sàn. |
| Nhiều quầy/chi nhánh | Chưa đủ bằng chứng; đặc biệt giới hạn một ca mở/store cần thiết kế lại theo công việc. |

## Thứ tự làm tiếp

1. **Hoàn tất phát hành hiện tại:** backup mới → workflow migration `0027` trên đúng SHA → xác minh schema/role → gộp PR khi checks đạt → Render đúng commit và readiness. Không phát hành runtime trước schema.
2. **Đóng vòng ngoại lệ bán lẻ:** giải quyết chứng từ offline đã thu tiền nhưng xung đột; đổi hàng/bù chênh lệch; trả nhà cung cấp. Bằng chứng phải gồm tồn, tiền, nợ và lịch sử trước/sau, không chỉ màn thành công.
3. **Nghiệm thu một cửa hàng trên hai điện thoại:** mở ca → nhận hàng → bán → trả/đổi → thu/chi/nợ → chốt; mất mạng, khởi động lại và phản hồi chậm; backup/restore trên bản mới. Người dùng tự vận hành, phía phát triển theo dõi bằng chứng/log và sửa lỗi kỹ thuật.
4. **Khép một kênh online:** dùng tài khoản/API được cấp, làm trọn vòng đơn–giao–hoàn–tiền trước khi thêm nhiều kênh. Affiliate tách riêng và không hiển thị hoa hồng ước lượng như đã được sàn xác nhận.
5. **Mở ngành theo nhu cầu thực:** FnB thêm nguyên liệu/bàn/bếp; mỹ phẩm thêm lô/hạn; nhiều quầy thêm giao ca độc lập. Tiếp tục ẩn những phần không phục vụ vai trò/loại cửa hàng. Không đưa tất cả menu của đối thủ lên cùng một màn.

Mỗi bước cần phạm vi, phụ thuộc và bằng chứng đạt trong DELIVERY_ROADMAP. Báo cáo này ghi nhận việc cần làm, chưa tự động mở rộng mã hoặc tích hợp dịch vụ ngoài trong lượt phát hành.
