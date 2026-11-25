(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlinkLegalContent = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LAST_UPDATED = '19/11/2026';
  const LAST_UPDATED_ISO = '2026-11-19';

  const TERMS_SECTIONS = [
    {
      title: '1. Phạm vi dịch vụ Slink',
      body: 'Slink cung cấp phần mềm quản lý bán hàng tại quầy (POS), hàng hóa, mã vạch / Serial-IMEI, tồn kho, thu chi, sổ quỹ và công nợ cho hộ kinh doanh và cửa hàng bán lẻ tại Việt Nam.',
    },
    {
      title: '2. Tài khoản và phân quyền cửa hàng',
      body: 'Chủ cửa hàng chịu trách nhiệm quản lý mật khẩu, danh sách nhân viên và phân quyền truy cập (Chủ cửa hàng, Quản lý, Thu ngân, Thủ kho, Kế toán). Mọi thao tác bán hàng, thu chi, hủy đơn và kiểm kê đều được ghi nhật ký theo tài khoản thực hiện.',
    },
    {
      title: '3. Tính toàn vẹn dữ liệu và sao lưu',
      body: 'Mọi giao dịch tiền mặt, chuyển khoản, tồn kho và công nợ được lưu theo đơn vị đồng Việt Nam (VND nguyên) trên cơ sở dữ liệu máy chủ. Slink duy trì cơ chế sao lưu mã hóa định kỳ; người dùng vẫn có quyền chủ động xuất toàn bộ dữ liệu cửa hàng bất cứ lúc nào.',
    },
    {
      title: '4. Thanh toán VietQR và kết nối bên thứ ba',
      body: 'Tính năng tạo mã VietQR tại quầy hiển thị thông tin tài khoản do cửa hàng tự khai báo để khách quét chuyển khoản trực tiếp; Slink không giữ tiền hộ và không thay thế xác nhận biến động số dư của ngân hàng trừ khi cửa hàng kích hoạt đối soát tự động hợp lệ.',
    },
    {
      title: '5. Nghĩa vụ thuế và hóa đơn',
      body: 'Biên nhận bán hàng in từ Slink phục vụ đối chiếu nội bộ và giao cho khách tại quầy, không thay thế hóa đơn điện tử theo quy định cơ quan thuế trừ khi cửa hàng tích hợp nhà cung cấp HĐĐT được cấp phép.',
    },
    {
      title: '6. Chấm dứt sử dụng và hỗ trợ',
      body: 'Chủ cửa hàng có thể ngừng sử dụng bất kỳ lúc nào, xuất toàn bộ dữ liệu của mình trước khi yêu cầu đóng tài khoản. Mọi yêu cầu hỗ trợ kỹ thuật hoặc khiếu nại dữ liệu được tiếp nhận qua kênh hỗ trợ chính thức của Slink.',
    },
  ];

  const PRIVACY_SECTIONS = [
    {
      title: '1. Tuân thủ Nghị định 13/2023/NĐ-CP',
      body: 'Slink xử lý dữ liệu cá nhân theo nguyên tắc minh bạch, đúng mục đích và bảo mật phù hợp với quy định về bảo vệ dữ liệu cá nhân tại Việt Nam.',
    },
    {
      title: '2. Dữ liệu chúng tôi thu thập',
      body: 'Bao gồm thông tin tài khoản đăng nhập (họ tên, email, mật khẩu đã băm một chiều), thông tin cửa hàng (tên, số điện thoại, địa chỉ, tài khoản ngân hàng VietQR nếu bạn khai báo), và dữ liệu nghiệp vụ do cửa hàng tự nhập (hàng hóa, đơn hàng, khách hàng, nhà cung cấp, sổ quỹ).',
    },
    {
      title: '3. Mục đích sử dụng dữ liệu',
      body: 'Dữ liệu chỉ được dùng để vận hành phần mềm bán hàng, đồng bộ giữa các thiết bị của cửa hàng, gửi email xác thực/đặt lại mật khẩu và sao lưu phục hồi sự cố. Slink không bán, cho thuê hoặc chia sẻ danh sách khách hàng hay doanh thu của bạn cho bên thứ ba.',
    },
    {
      title: '4. Biện pháp bảo vệ kỹ thuật',
      body: 'Kết nối được mã hóa HTTPS/TLS; dữ liệu từng cửa hàng được cô lập ở tầng cơ sở dữ liệu (Row-Level Security); phiên đăng nhập có bảo vệ chống CSRF và cho phép thu hồi từ xa; bản sao lưu được mã hóa AES-256-GCM.',
    },
    {
      title: '5. Quyền của chủ thể dữ liệu (Xuất & Xóa dữ liệu)',
      body: 'Chủ cửa hàng có quyền truy cập, chỉnh sửa, tự xuất toàn bộ dữ liệu cửa hàng trong mục Cài đặt → Dữ liệu & sao lưu, hoặc gửi yêu cầu xóa vĩnh viễn tài khoản và dữ liệu cửa hàng (xử lý tối đa trong 72 giờ làm việc sau khi xác minh chủ sở hữu).',
    },
  ];

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderLegalSectionsHtml(kind) {
    const sections = kind === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS;
    return `<div class='legal-doc'>
      <p class='muted' style='margin:0 0 12px'>Cập nhật lần cuối: ${esc(LAST_UPDATED)}</p>
      ${sections.map((s) => `<section class='legal-section'><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></section>`).join('')}
    </div>`;
  }

  function renderStandaloneLegalPage(kind, options) {
    const isPrivacy = kind === 'privacy';
    const pathSegment = isPrivacy ? '/legal/privacy' : '/legal/terms';
    const title = isPrivacy ? 'Chính sách bảo mật — Slink' : 'Điều khoản sử dụng — Slink';
    const heading = isPrivacy ? 'Chính sách bảo mật & Dữ liệu cá nhân' : 'Điều khoản sử dụng Slink';
    const description = isPrivacy
      ? 'Chính sách bảo mật, cô lập dữ liệu cửa hàng và quyền xuất/xóa dữ liệu cá nhân của Slink theo Nghị định 13/2023/NĐ-CP.'
      : 'Điều khoản sử dụng phần mềm quản lý bán hàng POS, tồn kho, sổ quỹ số nguyên VND và phân quyền cửa hàng Slink.';
    const rawOrigin = options && typeof options.origin === 'string' ? options.origin.replace(/\/+$/, '') : '';
    const canonicalUrl = rawOrigin ? `${rawOrigin}${pathSegment}` : '';
    const otherHref = isPrivacy ? '/legal/terms' : '/legal/privacy';
    const otherLabel = isPrivacy ? 'Xem Điều khoản sử dụng' : 'Xem Chính sách bảo mật';
    return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#0F6B4E" />
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="index,follow" />
  <meta property="og:type" content="article" />
  <meta property="og:locale" content="vi_VN" />
  <meta property="og:site_name" content="Slink" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  ${canonicalUrl ? `<meta property="og:url" content="${esc(canonicalUrl)}" />\n  <link rel="canonical" href="${esc(canonicalUrl)}" />` : ''}
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <title>${esc(title)}</title>
  <style>
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f8f6;color:#1b2621;line-height:1.6}
    main{max-width:760px;margin:32px auto;padding:28px 24px;background:#fff;border:1px solid #e2e8e4;border-radius:14px}
    h1{margin:0 0 8px;font-size:24px;color:#123f35}
    h3{margin:18px 0 6px;font-size:16px;color:#123f35}
    p{margin:0 0 10px;font-size:14.5px;color:#33423b}
    .muted{color:#64746c;font-size:13px}
    .nav{display:flex;gap:14px;flex-wrap:wrap;margin-top:24px;padding-top:16px;border-top:1px solid #e6ece8}
    a{color:#185c46;font-weight:600;text-decoration:none}
    a:hover{text-decoration:underline}
  </style>
</head>
<body>
  <main>
    <h1>${esc(heading)}</h1>
    ${renderLegalSectionsHtml(kind)}
    <nav class="nav">
      <a href="/">← Quay lại Slink</a>
      <a href="${otherHref}">${esc(otherLabel)}</a>
    </nav>
  </main>
</body>
</html>`;
  }

  return {
    LAST_UPDATED,
    LAST_UPDATED_ISO,
    TERMS_SECTIONS,
    PRIVACY_SECTIONS,
    renderLegalSectionsHtml,
    renderStandaloneLegalPage,
  };
}));
