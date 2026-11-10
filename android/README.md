# Ứng dụng Android Slink

## Bản cài thử 0.3.3

Ứng dụng cài được từ APK, có biểu tượng riêng và không mở một thẻ Chrome. Giao diện được đóng gói trong APK; Android WebView hiển thị giao diện đó, còn API dùng máy chủ Slink. Đây là ứng dụng hybrid, chưa phải giao diện viết lại hoàn toàn bằng thành phần Android.

Android 10 trở lên là mức tối thiểu được cấu hình. Cần Android System WebView/Chrome còn được cập nhật. Bản hiện tại dùng chữ ký debug để cài thử. Từ 0.3.1 đã có bộ tự kiểm tra và tải bản cập nhật; cần phát hành APK và thông tin phiên bản trên GitHub để sử dụng nguồn cập nhật thật. Chưa có bản trên Google Play.

### Cài trên điện thoại

1. Chép `Slink-0.3.3-preview.apk` sang điện thoại Android.
2. Mở tệp, cho phép ứng dụng đang mở tệp cài ứng dụng nếu Android yêu cầu, rồi chọn **Cài đặt**.
3. Mở **Slink**, đăng nhập khi có mạng và chờ tải dữ liệu cửa hàng trong lần đầu.
4. Sau đó có thể tiếp tục các nghiệp vụ đã hỗ trợ offline. Tài khoản, quyền truy cập, dữ liệu dùng chung và xác nhận giao dịch vẫn cần máy chủ. Đơn chưa gửi được giữ trên thiết bị cho tới khi đối soát xong.

Không xóa dữ liệu hoặc gỡ ứng dụng khi còn chứng từ chưa gửi. Bản cài thử được đặt ngoài Git tại `D:\Slink\dist\Slink-0.3.1-preview.apk`.

## Thành phần đã nối với Android

- Nút Quay lại đóng khung đang mở, giữ bước xác nhận bỏ nội dung đang nhập và trở về màn hình làm việc đã chọn.
- Lưu tệp bằng trình chọn nơi lưu của Android. Hủy không báo đã lưu. Chỉ báo thành công sau khi ghi tệp xong.
- Chia sẻ biên nhận qua trình chia sẻ của Android. Mở trình chia sẻ không được xem là đã gửi cho khách.
- Chọn ảnh/tệp, tùy chọn chụp ảnh và xin quyền camera khi cần. Nếu không cấp quyền chụp, vẫn có thể chọn ảnh có sẵn.
- Chừa chỗ cho thanh hệ thống, bàn phím và vùng khuyết màn hình.
- Giữ cookie phiên đăng nhập và dữ liệu offline trong vùng lưu trữ riêng của ứng dụng.

## Đóng gói lại

Cần Node.js theo dự án, Android SDK 35 và JDK 17 hoặc 21. Cài các thành phần SDK bằng Android Studio trước; script dùng SDK trong `%LOCALAPPDATA%/Android/Sdk` nếu chưa đặt `ANDROID_HOME`. Đặt `JAVA_HOME` nếu script không tìm được JDK phù hợp.

Từ thư mục gốc của bản mã cần đóng gói:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\android-build.ps1
```

Thư mục nhận mặc định là `dist/`. Có thể chọn nơi nhận khác bằng `-Destination 'D:\Slink\dist\Slink-0.3.1-preview.apk'`. API mặc định là `https://slink-xny3.onrender.com`; `-AppOrigin` chỉ nhận HTTPS origin, không nhận mật khẩu, đường dẫn hoặc chuỗi truy vấn. Không nhúng thông tin đăng nhập vào APK.

Gradle wrapper và phiên bản thư viện được cố định trong mã. Lần build đầu cần mạng tải dependency. `prepareWeb` chỉ sao chép danh sách tệp giao diện được phép; không đưa `.env`, dữ liệu thử, backup hoặc mã máy chủ vào APK.

## Cách phục vụ giao diện và cập nhật

`WebViewAssetLoader` phục vụ tài nguyên đã đóng gói từ đúng HTTPS origin của API. Chỉ những đường dẫn tĩnh trong danh sách cho phép mới được chặn và đọc từ APK; `/api/` tiếp tục gọi máy chủ. Không dùng `file://`, không bỏ xác minh TLS và không thêm cầu nối JavaScript cho trang bên ngoài. Mở liên kết ngoài dùng ứng dụng hệ thống.

Giao diện trong APK được cập nhật bằng bản APK mới. Từ 0.3.1, ứng dụng tự kiểm tra GitHub Releases khi mở hoặc quay lại app, tối đa một lần mỗi 6 giờ; có nút kiểm tra ngay trong Cài đặt → Dữ liệu → Phiên bản ứng dụng. App tự tải bản mới ở nền, không mở trình cài khi đang làm việc. Người dùng chọn Cài bản mới khi thuận tiện và xác nhận trong Android. Mất mạng hoặc chưa có release không chặn việc bán hàng. Render deploy riêng mã web không tạo APK mới. Các bản API tiếp theo phải giữ tương thích với bản APK đang dùng hoặc có kế hoạch nâng cấp. Trước phát hành chính thức cần tăng `versionCode`, cấu hình khóa ký phát hành do chủ dự án giữ và kiểm tra quy trình cập nhật giữ dữ liệu. Khóa ký và mật khẩu không được commit.

Từ 0.3.3, trang mở đầu có mã phiên bản APK và các tài nguyên giao diện có dấu phiên bản nội dung riêng. Nhờ vậy service worker cũ không trả lại giao diện cũ ở lần mở đầu sau khi cài bản mới. Không xóa cache nghiệp vụ, IndexedDB, cookie, giỏ nháp hoặc chứng từ đang chờ để xử lý cập nhật.

## Bằng chứng và phần cần kiểm tra tiếp

Bằng chứng cục bộ được ghi ở `docs/DELIVERY_ROADMAP.md`. Máy giả lập không thay nghiệm thu trên điện thoại thật. Camera/ảnh, bàn phím, phóng to chữ, Android 10, chia sẻ sang ứng dụng bên thứ ba và cập nhật qua một APK ký phát hành vẫn cần ca kiểm tra riêng. In hệ thống và toàn bộ luồng nghiệp vụ chưa được nghiệm thu trong APK. iOS tiếp tục là phạm vi riêng.

Không gọi bản cài thử là bản phát hành thương mại chỉ vì build thành công.

Bản 0.3.1 đã bỏ trạng thái đồng bộ trên màn hình làm việc; xem chẩn đoán trong Cài đặt → Dữ liệu. Nhập lô/hộp/thùng chỉ xuất hiện khi máy chủ hỗ trợ. Trước khi deploy backend của đợt này, phải có backup đã xác minh và migration `20261110050914_purchase_unit_packs.sql`. Cài APK riêng không áp dụng migration hoặc nâng cấp Render.

## Phát hành để nguồn cập nhật có hiệu lực

Workflow `.github/workflows/android-release.yml` chạy khi có tag dạng `android-v0.3.2`. Nó build APK, xác minh chữ ký, tạo manifest SHA-256 và chỉ công khai release sau khi tải đủ cả hai tệp. Đợt triển khai cục bộ này chưa tạo tag hoặc phát hành release.

Trước khi dùng workflow, cấu hình bốn GitHub Actions secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Khóa ký phải khớp APK đang cài; không tạo khóa mới cho từng lượt CI. Khóa và mật khẩu không được đặt trong Git, đầu ra tác vụ hoặc chat. Bản preview hiện ký bằng cùng khóa debug đang dùng trên máy phát triển; cần quyết định khóa ổn định trước khi đưa người khác cài diện rộng.

Chỉ bật repository variable `ANDROID_AUTOBUILD=true` sau khi đã cấu hình khóa ký ổn định. Khi chưa bật, vẫn có thể build ở máy phát triển và phát hành APK cùng manifest; không cần đưa khóa cá nhân lên GitHub. Bản 0.3.2 dùng mã phiên bản 3002. Người đang cài 0.3.0 cần cài đè bản mới một lần vì 0.3.0 chưa có bộ cập nhật. Giữ app và dữ liệu khi cài đè; những lần sau bộ cập nhật lấy bản mới từ GitHub Releases và Android tiếp tục yêu cầu người dùng đồng ý cài.

Thông tin cập nhật nằm tại release mới nhất, tệp `android-update.json`, gồm packageName/versionCode/versionName/url/sha256/sizeBytes. APK tên `Slink.apk`. Bộ cập nhật giới hạn kích thước 64 MiB, chỉ dùng HTTPS từ GitHub và các máy chủ tải release của GitHub, kiểm tra hash, package, mã phiên bản tăng và chữ ký khớp trước khi cho cài. Android tiếp tục thực hiện kiểm tra cài đặt của hệ điều hành. Phiên bản trong CI tính theo major × 1.000.000 + minor × 1.000 + patch; bản preview cục bộ 0.3.1 dùng mã 2.

Cài đè giữ dữ liệu ứng dụng. Không gỡ app hoặc xóa dữ liệu để vượt qua lỗi chữ ký. Nếu Android chưa cho Slink quyền cài cập nhật, người dùng cấp quyền trong màn hình Android rồi quay lại bấm Cài bản mới. Các bản APK/API mới phải giữ khả năng đọc chứng từ và mã chống trùng cũ; quy trình kiểm tra trước phát hành vẫn bắt buộc.
