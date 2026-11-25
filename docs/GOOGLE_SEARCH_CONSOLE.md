# Hướng dẫn khai báo Slink lên Google Search Console

Tài liệu này tổng hợp toàn bộ hạ tầng SEO kỹ thuật đã được cấu hình sẵn trong mã nguồn Slink và các bước thao tác trên **Google Search Console (GSC)** cho địa chỉ mặc định `https://slink-xny3.onrender.com/` (hoặc tên miền riêng qua biến môi trường `PUBLIC_ORIGIN`).

---

## 1. Những gì Slink đã chuẩn bị sẵn trong mã nguồn

- **`/robots.txt`** (`server/index.js`): Cho phép Googlebot thu thập trang chủ, trang pháp lý và tài nguyên tĩnh (`Allow: /`), đồng thời chặn thu thập `/api/`, `/verify`, `/invite`, `/download/` và gắn `X-Robots-Tag: noindex, nofollow` cho các đường dẫn kỹ thuật/tải file.
- **`/sitemap.xml`** (`server/index.js`): Sitemap XML chuẩn kèm `<lastmod>`, `<changefreq>`, `<priority>` và `xmlns:image` cho 3 URL công khai:
  - `/` (`priority: 1.0`, kèm danh sách ảnh preview POS / Dashboard / Mobile)
  - `/legal/privacy` (`priority: 0.5`)
  - `/legal/terms` (`priority: 0.5`)
- **Trang chủ (`index.html`)**:
  - Đầy đủ `<title>`, `<meta name="description">`, `<meta name="robots" content="index,follow" />`.
  - `<link rel="canonical" ...>` và `hreflang="vi-VN"` / `x-default` tự đồng bộ theo `PUBLIC_ORIGIN`.
  - Đầy đủ OpenGraph (`og:*`), Twitter Card (`summary_large_image`) trỏ tới `/assets/slink-og-cover.png`, favicon và Web Manifest.
  - Dữ liệu có cấu trúc **JSON-LD (`application/ld+json`)** theo Schema.org: `Organization`, `WebSite`, `SoftwareApplication`.
  - Khối `<noscript>` ngữ nghĩa tiếng Việt với `<h1>`, mô tả chức năng và liên kết nội bộ tới `/legal/privacy`, `/legal/terms`, `/download/android` để trình thu thập dữ liệu đọc được ngay ở HTML thô trước khi chạy JavaScript.
- **Trang pháp lý (`/legal/privacy`, `/legal/terms` trong `legal-content.js`)**: Có `<meta name="description">`, `<meta name="robots" content="index,follow" />`, OpenGraph và `<link rel="canonical">`.
- **Xác minh GSC không cần cấu hình thêm (`google02950e16d4d7ed98.html` + `GOOGLE_SITE_VERIFICATION`)**:
  - Đã tích hợp sẵn tệp xác minh chính thức `google02950e16d4d7ed98.html` phục vụ trực tiếp tại `/google02950e16d4d7ed98.html`.
  - Đồng thời máy chủ hỗ trợ đọc biến môi trường `GOOGLE_SITE_VERIFICATION` (và `GOOGLE_SITE_VERIFICATION_FILE`) trên Render nếu sau này cần bổ sung mã hoặc tệp xác minh mới mà không cần sửa code.

---

## 2. Các bước khai báo & xác minh trên Google Search Console

### Bước 1: Thêm thuộc tính (Property)
1. Mở [Google Search Console](https://search.google.com/search-console).
2. Chọn **Thêm thuộc tính (Add property)**.
3. Nếu đang dùng tên miền phụ của Render (`https://slink-xny3.onrender.com/`):
   - Chọn ô bên phải: **Tiền tố URL (URL prefix)**.
   - Nhập chính xác: `https://slink-xny3.onrender.com/` → bấm **Tiếp tục**.
   *(Chỉ dùng ô **Miền (Domain)** bên trái nếu bạn đã gắn tên miền riêng như `slink.vn` có quyền sửa DNS TXT).*

### Bước 2: Lấy mã xác minh & gắn lên Render
Trong màn hình **Xác minh quyền sở hữu**, chọn **một trong hai** phương thức tiện nhất:

- **Cách A — Khuyên dùng: Thẻ HTML (HTML tag)**
  1. Mở mục **Thẻ HTML (HTML tag)** trên GSC, sao chép dòng thẻ Google cấp (ví dụ `<meta name="google-site-verification" content="ABC123..." />`).
  2. Mở **Render Dashboard → Service `slink` → Environment**.
  3. Thêm hoặc cập nhật biến:
     - **Key:** `GOOGLE_SITE_VERIFICATION`
     - **Value:** dán giá trị `content` (hoặc dán cả thẻ `<meta ...>` đều được, máy chủ tự bóc tách an toàn).
  4. Bấm **Save, rebuild, and deploy** (hoặc **Save Changes** nếu dịch vụ restart với env mới).
  5. Chờ Render deploy xong, kiểm tra nhanh bằng trình duyệt hoặc lệnh:
     `curl.exe -sSL https://slink-xny3.onrender.com/ | findstr google-site-verification`
  6. Quay lại GSC và bấm **Xác minh (Verify)**.

- **Cách B — Tệp HTML (HTML file)**
  1. Ở mục **Tệp HTML**, GSC hiển thị tên tệp dạng `google1a2b3c4d5e6f7a8b.html`.
  2. Đặt `GOOGLE_SITE_VERIFICATION=google1a2b3c4d5e6f7a8b.html` trong biến môi trường trên Render (có thể ghép cả 2 cách bằng dấu phẩy: `TOKEN,google1a2b3c4d5e6f7a8b.html`).
  3. Sau khi Render cập nhật env, mở thử `https://slink-xny3.onrender.com/google1a2b3c4d5e6f7a8b.html` thấy trả về `google-site-verification: google1a2b3c4d5e6f7a8b.html` rồi bấm **Xác minh (Verify)**.

### Bước 3: Gửi Sơ đồ trang web (Sitemap)
1. Trong menu trái GSC, vào **Sơ đồ trang web (Sitemaps)**.
2. Ở ô **Thêm sơ đồ trang web mới**, nhập: `sitemap.xml` (để thành `https://slink-xny3.onrender.com/sitemap.xml`).
3. Bấm **Gửi (Submit)** và kiểm tra trạng thái chuyển sang **Thành công (Success)** với 3 URL đã phát hiện.

### Bước 4: Kiểm tra URL & Yêu cầu lập chỉ mục (Request Indexing)
1. Dán `https://slink-xny3.onrender.com/` vào thanh **Kiểm tra URL (URL Inspection)** ở trên cùng GSC.
2. Bấm **Kiểm tra URL đang hoạt động (Test Live URL)** → xem **Ảnh chụp màn hình / HTML đã kết xuất** để đảm bảo Googlebot tải đầy đủ CSS/JS trang giới thiệu mà không bị chặn tài nguyên.
3. Bấm **Yêu cầu lập chỉ mục (Request Indexing)** cho `/` (và tùy chọn `/legal/privacy`, `/legal/terms`).

---

## 3. Lưu ý khi chuyển sang tên miền riêng (Custom Domain)

1. Trỏ DNS tên miền riêng về Render và bật HTTPS.
2. Cập nhật biến `PUBLIC_ORIGIN=https://<ten-mien-cua-ban>` trên Render — `canonical`, `og:url`, `og:image`, `JSON-LD`, `robots.txt`, `sitemap.xml` và các trang `/legal/*` sẽ tự động chuyển theo tên miền mới.
3. Khai báo thuộc tính loại **Miền (Domain)** trên Google Search Console, xác minh bằng bản ghi DNS TXT và gửi lại `sitemap.xml`.
