# Slink — chuẩn bị tích hợp thương mại

## Trạng thái đã kiểm tra

| Khả năng | Hiện trạng | Điều kiện trước khi gọi là tích hợp thật |
| --- | --- | --- |
| Tiền mặt/chuyển khoản/QR/thẻ tại quầy | Nhân viên ghi nhận phương thức và số tiền; hệ thống chưa nhận xác nhận thanh toán từ ngân hàng/cổng | Chọn luồng đối soát phù hợp cho cửa hàng; tài khoản merchant, sandbox, callback/webhook đã xác minh, retry/idempotency, truy vấn trạng thái, hoàn tiền và đối soát cuối ngày |
| Hóa đơn điện tử | Chưa phát hành hoặc quản lý trạng thái hóa đơn từ nhà cung cấp | Chọn nhà cung cấp theo điều kiện pháp lý/cửa hàng; tài khoản API sandbox và production, quy tắc lập/điều chỉnh/hủy, mã số thuế và chữ ký/ủy quyền cần thiết; chuyên gia có thẩm quyền xác nhận phạm vi áp dụng |
| Email đăng nhập/lời mời | Máy chủ có adapter HTTPS gửi JSON gồm `to`, `subject`, `text`; source hiện không gửi trường `from`. `DEMO_DISABLE_EMAIL_VERIFICATION` có thể bỏ bước xác minh trong môi trường demo. Log Render trước đây có `email_unavailable`; trạng thái gửi thư hiện tại chưa xác minh | Nếu endpoint được trỏ thẳng tới nhà cung cấp, thêm cấu hình người gửi hợp lệ và kiểm tra hợp đồng request theo tài liệu provider; hoặc dùng gateway riêng có người gửi đã cấu hình. Xác thực domain, lưu token an toàn, thử gửi/nhận, bounce/throttle và quy trình thất lạc thư. Chỉ bật bypass cho demo |
| Thu phí Slink và gói dịch vụ | Chưa có bảng giá, quyền theo gói, subscription lifecycle hoặc thu phí của chính Slink | Quyết định chủ thể bán hàng, giá/chu kỳ/gia hạn/hủy/hoàn tiền, thuế/hóa đơn, hỗ trợ và điều khoản; chọn đơn vị thanh toán cho giao dịch định kỳ |
| Hosting và database | Người dùng đã chọn Render + Supabase và từng chia sẻ log cho thấy service chạy. SHA Live, migration/role hiện tại, backup ngoài máy và restore chưa được xác nhận trong lần rà soát này | Đối chiếu trạng thái thật; chốt người vận hành, ngân sách, miền riêng nếu cần, chính sách mạng, backup/restore, monitoring và rollback |

**Trạng thái kiểm tra hiện tại:** Có bằng chứng lịch sử rằng người dùng đã triển khai Slink trên Render và kết nối Supabase; chưa có ảnh/log mới xác nhận SHA Live, database role/schema, email thành công hoặc restore. Xem [`DELIVERY_ROADMAP.md`](DELIVERY_ROADMAP.md) trước khi xem lại một tích hợp cũ là đã xong.

## Nguồn chính thức để lựa chọn

- MoMo có tài liệu tích hợp riêng sandbox và production, credential theo từng môi trường, `requestId` duy nhất cho kiểm soát gửi lặp và callback IPN phía máy chủ. Đây là một ứng viên cho luồng thanh toán online/QR; tài liệu không chứng minh một merchant Slink đã được chấp thuận hoặc giao dịch thật đã nghiệm thu: [MoMo — quy trình tích hợp](https://developers.momo.vn/v3/docs/payment/onboarding/integration-process/), [MoMo — API thanh toán](https://developers.momo.vn/v3/docs/payment/api/credit/onetime/).
- VNPAY công bố tài liệu cổng sandbox, bao gồm API thanh toán và các API liên quan. Chọn hay không còn tùy hồ sơ merchant, cách cửa hàng đối soát và điều kiện hợp đồng: [VNPAY Sandbox — giới thiệu](https://sandbox.vnpayment.vn/apis/docs/gioi-thieu/), [VNPAY Sandbox — kết nối thanh toán](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html).
- MISA có cổng developer mô tả Workflow và Open API. Cần lấy tài liệu API đúng sản phẩm, hợp đồng và thông tin tài khoản từ nhà cung cấp trước khi tạo hóa đơn trong Slink: [MISA Developer Portal](https://developer.misa.vn/).
- Quy định thuế và hóa đơn có thể áp dụng khác nhau theo loại hình cửa hàng, hóa đơn và thời điểm phát hành. Tài liệu kỹ thuật của nhà cung cấp không thay cho xác nhận pháp lý/kế toán.

## Mẫu xác nhận tích hợp

Trước khi nối bất kỳ nhà cung cấp nào, lưu quyết định gồm: tên pháp nhân merchant; sản phẩm/API cụ thể; sandbox/production; người sở hữu tài khoản; callback URL; loại dữ liệu được gửi; chính sách lưu và xóa; giới hạn số tiền/đơn; timeout/retry/idempotency; cách tra soát; webhook giả mạo/replay; quy trình hoàn/điều chỉnh; điều khoản và phí đã được chấp nhận; người chịu trách nhiệm vận hành.

Không ghi secret vào issue, PR, tài liệu, ảnh chụp màn hình hoặc lịch sử Git. Nếu cần credential để chạy thử, nhập qua secret manager hoặc kênh bảo mật của môi trường đã chọn; chỉ gửi test với merchant sandbox và dữ liệu tổng hợp.
