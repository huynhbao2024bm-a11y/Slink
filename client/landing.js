(function (S) {
  'use strict';

  const esc = value => S.fn.esc(value);
  const icon = (name, size) => S.fn.icon(name, size);
  let landingIndustry = 'fashion';
  let landingStageView = 'pos';
  let quickStoreName = '';

  S.fn.isAndroidApp = function isAndroidApp() {
    const params = new URLSearchParams(window.location.search);
    const detected = Boolean(window.SlinkAndroid)
      || /\bSlinkAndroid\//i.test(navigator.userAgent)
      || params.get('platform') === 'android'
      || /^\d+$/.test(params.get('appVersion') || '');
    try {
      if (detected) window.sessionStorage.setItem('slink_android_app', '1');
      return detected || window.sessionStorage.getItem('slink_android_app') === '1';
    } catch {
      return detected;
    }
  };

  function slinkBrandLogoHtml() {
    return `<span class='lp-brand-mark' aria-hidden='true'><svg viewBox='0 0 32 32'><path d='M8 8.5h16v5H13v2h11v8H8v-5h11v-2H8z' fill='currentColor'/><circle cx='24.5' cy='7.5' r='2.5' fill='#c8f36c'/></svg></span><span class='lp-brand-text'>slink<span class='lp-brand-dot'>.</span></span>`;
  }
  S.fn.slinkBrandLogoHtml = slinkBrandLogoHtml;

  S.fn.renderAuthPortalAside = function renderAuthPortalAside(mode) {
    const isRegisterFlow = mode === 'register' || mode === 'invite-register';
    const badge = isRegisterFlow ? '✦ Khởi tạo nhanh trong 1 phút' : '● Vận hành đồng bộ thời gian thực';
    const heading = isRegisterFlow
      ? 'Thiết lập không gian vận hành riêng cho cửa hàng.'
      : 'Chào mừng trở lại quầy quản lý cửa hàng Slink.';
    const lead = isRegisterFlow
      ? 'Dữ liệu độc lập theo từng cửa hàng, sẵn sàng cho bán hàng tại quầy, kiểm kho, sổ quỹ và phân quyền nhân sự.'
      : 'Tiếp tục lên đơn tại quầy, tra cứu tồn kho chi nhánh, đối soát ca tiền mặt và theo dõi lãi gộp hôm nay.';
    const previewImg = isRegisterFlow ? './assets/slink-showcase-web-dashboard.webp' : './assets/slink-showcase-web-pos.webp';
    const previewTitle = isRegisterFlow ? 'Slink · Tổng quan cửa hàng' : 'Slink · Quầy bán hàng POS';
    const highlights = isRegisterFlow
      ? [
          ['1', 'Không trộn dữ liệu mẫu', 'Cửa hàng mới sạch sẽ, chỉ lưu giao dịch thực tế của bạn.'],
          ['2', 'Tối ưu theo ngành hàng', 'Thời trang, mỹ phẩm, tạp hóa và mô hình nhiều kho.'],
          ['3', 'Bảo mật tiêu chuẩn cao', 'Mật khẩu tối thiểu 12 ký tự, kiểm soát phiên từng thiết bị.'],
        ]
      : [
          ['✓', 'Bán hàng & thu ngân mượt mà', 'Tính tiền nhanh, tách phương thức thanh toán và in hóa đơn.'],
          ['✓', 'Phân quyền 5 vai trò theo kho', 'Tự động mở đúng phạm vi cho Chủ shop, Quản lý, Thu ngân, Thủ kho.'],
          ['✓', 'An toàn dữ liệu tuyệt đối', 'Băm mật khẩu scrypt, chống CSRF và lưu nhật ký kiểm toán.'],
        ];
    const itemsHtml = highlights.map(function (item) {
      return `<div class='auth-aside-item'><span class='lp-check-badge' aria-hidden='true'>${item[0]}</span><div><strong>${esc(item[1])}</strong><small>${esc(item[2])}</small></div></div>`;
    }).join('');

    return `<aside class='auth-portal-aside'>
      <div class='auth-aside-top'>
        <span class='auth-aside-badge'>${badge}</span>
        <h2>${esc(heading)}</h2>
        <p>${esc(lead)}</p>
      </div>
      <div class='auth-aside-showcase' aria-hidden='true'>
        <div class='auth-aside-frame'>
          <div class='lp-3d-desktop-bar'><i></i><i></i><i></i><span>${previewTitle}</span></div>
          <img class='auth-aside-showcase-img' src='${previewImg}' alt='' width='1440' height='900' loading='eager' decoding='async'/>
          <div class='lp-3d-glare'></div>
        </div>
        <span class='auth-aside-chip auth-aside-chip-top'><i aria-hidden='true'></i>Số nguyên VND</span>
        <span class='auth-aside-chip auth-aside-chip-bottom'><i aria-hidden='true'></i>Đồng bộ kho tức thì</span>
      </div>
      <div class='auth-aside-highlights'>${itemsHtml}</div>
      <div class='auth-aside-apk'><a class='lp-inline-link' href='/download/android'>${icon('download', 15)}<span>Tải ứng dụng Android (.apk) mới nhất</span><em class='lp-pill-tag ok'>Android 10+</em></a></div>
    </aside>`;
  };

  const landingIndustryBlueprints = {
    fashion: {
      tab: 'Thời trang & Phụ kiện',
      shortTab: 'Thời trang',
      storeSample: 'Linh Chi Boutique',
      headline: 'Quản lý shop thời trang chuẩn từng màu sắc, kích cỡ.',
      description: 'Quản lý hàng trăm biến thể Màu/Size, tra cứu tồn kho chi nhánh tại quầy và theo dõi mẫu bán chạy theo ngày.',
      points: [
        'Quản lý nhóm sản phẩm nhiều màu, nhiều size gọn gàng.',
        'Tra cứu tồn kho chi nhánh tức thì khi khách đổi size.',
        'Lưu lịch sử mua sắm và gắn thẻ khách VIP chăm sóc lại.',
        'Theo dõi lịch sử điều chỉnh giá bán theo từng đợt khuyến mãi.',
      ],
      metrics: [
        { title: 'Quản lý biến thể Màu / Size', sub: 'Tạo đồng loạt SKU con chỉ trong 1 thao tác', badge: 'Chuẩn thời trang' },
        { title: 'Đối soát tồn kho quầy & kho phụ', sub: 'Phiếu điều chuyển rõ số lượng xuất – thực nhận', badge: 'Chống thất thoát' },
        { title: 'Lưu bộ lọc nhóm khách hàng', sub: 'Lọc theo công nợ, chi tiêu và thẻ phân loại', badge: 'Chăm sóc khách quen' },
      ],
    },
    cosmetics: {
      tab: 'Mỹ phẩm & Làm đẹp',
      shortTab: 'Mỹ phẩm',
      storeSample: 'Aura Beauty Room',
      headline: 'Kiểm soát hàng chính hãng, dung tích và tệp khách thân thiết.',
      description: 'Theo dõi sản phẩm theo dung tích/phân loại, cảnh báo chạm định mức tồn tối thiểu và giữ biên lợi nhuận gộp.',
      points: [
        'Phân loại rõ ràng theo thương hiệu, dung tích (30ml, 50ml, Fullsize).',
        'Cảnh báo sớm mặt hàng chạm định mức tối thiểu để đặt thêm.',
        'Theo dõi giá vốn và lưu lịch sử điều chỉnh giá bán minh bạch.',
        'Ghi chú nhu cầu từng khách hàng ngay trên hồ sơ & đơn bán.',
      ],
      metrics: [
        { title: 'Cảnh báo tồn kho tối thiểu', sub: 'Chủ động nhập bổ sung các mã bán chạy', badge: 'Không đứt hàng' },
        { title: 'Lãi gộp thực tế theo ngày', sub: 'Tự động tính sau giá vốn và hàng trả lại', badge: 'Rõ lợi nhuận' },
        { title: 'Quản lý đơn đặt hàng NCC (PO)', sub: 'Nhận hàng từng phần, theo dõi công nợ phải trả', badge: 'Chuẩn quy trình' },
      ],
    },
    grocery: {
      tab: 'Tạp hóa & Bán lẻ',
      shortTab: 'Tạp hóa',
      storeSample: 'Siêu thị Mini An Phú',
      headline: 'Tính tiền nhanh tại quầy, sổ quỹ và công nợ rõ ràng cuối ca.',
      description: 'Tìm hàng hóa tức thì theo tên hoặc mã SKU, gộp nhiều phương thức thanh toán và chốt ca tiền mặt minh bạch.',
      points: [
        'Tìm mặt hàng và cộng giỏ hàng tức thì, thao tác gọn trên cảm ứng.',
        'Khách trả một phần, ghi nợ phần còn lại vào thẳng hồ sơ khách.',
        'Mở ca – đóng ca tiền mặt đối soát chênh lệch rõ ràng.',
        'Kiểm kê hàng loạt bằng tệp hoặc đếm nhanh trên điện thoại.',
      ],
      metrics: [
        { title: 'Sổ ca tiền mặt chuyên nghiệp', sub: 'Theo dõi tiền đầu ca, thu chi và kiểm đếm cuối ca', badge: 'Khớp két tiền' },
        { title: 'Quản lý công nợ khách & NCC', sub: 'Thu nợ từng đợt, lưu biên nhận rõ ràng', badge: 'Không quên nợ' },
        { title: 'Nhập danh mục siêu tốc từ CSV', sub: 'Đưa hàng trăm mặt hàng lên quầy trong vài phút', badge: 'Dễ chuyển đổi' },
      ],
    },
    omnichannel: {
      tab: 'Online & Chuỗi nhiều kho',
      shortTab: 'Đa kênh',
      storeSample: 'Hệ thống Kho Minh Khang',
      headline: 'Đồng nhất tồn kho nhiều chi nhánh và quản lý đơn kênh bán.',
      description: 'Gom đơn bán tại quầy cùng đơn kênh bán ngoài trên một hệ thống, giới hạn quyền nhân sự theo đúng kho phụ trách.',
      points: [
        'Khai báo kênh bán, ánh xạ mã SKU và giữ tồn khi tạo đơn.',
        'Phân quyền chi tiết: Chủ shop, Quản lý, Thu ngân, Thủ kho, Kế toán.',
        'Giới hạn phạm vi kho làm việc cho từng nhân sự theo chi nhánh.',
        'Nhật ký kiểm toán (Audit Log) lưu mọi thao tác nhạy cảm.',
      ],
      metrics: [
        { title: 'Phân quyền nhân sự theo kho', sub: 'Nhân viên chi nhánh nào chỉ thao tác kho được giao', badge: 'Bảo mật đa kho' },
        { title: 'Quản lý đơn hàng kênh bán', sub: 'Lưu người nhận, địa chỉ và tiến độ giao đơn', badge: 'Gom đơn gọn' },
        { title: 'Nhật ký hoạt động toàn diện', sub: 'Tra cứu lịch sử sửa giá, hủy đơn hoặc chỉnh tồn', badge: 'Minh bạch 100%' },
      ],
    },
  };

  S.fn.renderWebAuthLanding = function renderWebAuthLanding() {
    const activeKey = landingIndustryBlueprints[landingIndustry] ? landingIndustry : 'fashion';
    const current = landingIndustryBlueprints[activeKey];
    const industryKeys = Object.keys(landingIndustryBlueprints);

    const industryTabs = industryKeys.map(function (key) {
      const item = landingIndustryBlueprints[key];
      return `<button type='button' class='lp-industry-tab ${key === activeKey ? 'active' : ''}' data-action='lp-industry' data-industry='${key}'>${esc(item.tab)}</button>`;
    }).join('');

    const industryPoints = current.points.map(function (pt) {
      return `<li><span class='lp-check-badge' aria-hidden='true'>✓</span><span>${esc(pt)}</span></li>`;
    }).join('');

    const industryCards = current.metrics.map(function (m) {
      return `<div class='lp-industry-metric-card lp-solid-card'><div><strong>${esc(m.title)}</strong><small>${esc(m.sub)}</small></div><span class='lp-pill-tag'>${esc(m.badge)}</span></div>`;
    }).join('');

    return `<div class='lp-page landing-page'><canvas class='lp-ambient-canvas' aria-hidden='true'></canvas>
      <div class='lp-header-wrap'>
        <header class='lp-header lp-glass'>
          <button type='button' class='lp-brand' data-action='lp-scroll' data-target='lp-top' aria-label='Trang chủ Slink'>${slinkBrandLogoHtml()}</button>
          <nav class='lp-nav' data-tab-glider-host aria-label='Khám phá Slink'>
            <button type='button' class='lp-nav-link' data-action='lp-scroll' data-target='lp-features'>Tính năng</button>
            <button type='button' class='lp-nav-link' data-action='lp-scroll' data-target='lp-industries'>Ngành hàng</button>
            <button type='button' class='lp-nav-link' data-action='lp-scroll' data-target='lp-workflow'>Quy trình 3 bước</button>
            <button type='button' class='lp-nav-link' data-action='lp-scroll' data-target='lp-download'>Tải ứng dụng</button>
            <button type='button' class='lp-nav-link' data-action='lp-scroll' data-target='lp-trust'>Bảo mật</button>
          </nav>
          <div class='lp-header-actions'>
            <button type='button' class='lp-btn lp-btn-glass' data-action='auth-mode' data-mode='login'>Đăng nhập</button>
            <button type='button' class='lp-btn lp-btn-primary' data-action='auth-mode' data-mode='register'>Dùng thử miễn phí</button>
          </div>
        </header>
      </div>
      <div id='lp-top' class='lp-container'>
        <section class='lp-hero' aria-labelledby='lp-hero-heading'>
          <div class='lp-hero-grid'>
            <div class='lp-hero-copy'>
              <div class='lp-eyebrow'><i class='lp-eyebrow-dot' aria-hidden='true'></i>Nền tảng quản lý bán hàng &amp; vận hành cửa hàng</div>
              <h1 id='lp-hero-heading' class='lp-hero-title'>Bán hàng nhanh gọn,<br/><span>chính xác từng đồng.</span></h1>
              <p class='lp-hero-lead'>Giải pháp quản lý toàn diện từ tính tiền tại quầy (POS), biến thể màu sắc/kích cỡ, tồn kho đa chi nhánh đến sổ quỹ và công nợ khách hàng — thiết kế sáng rõ, mượt mà trên cả máy tính và điện thoại.</p>
              <form class='lp-quickstart-form' data-landing-start>
                <input class='lp-quickstart-input' type='text' name='quickStoreName' maxlength='160' value='${esc(quickStoreName)}' placeholder='Tên cửa hàng (VD: ${esc(current.storeSample)})…' aria-label='Tên cửa hàng muốn tạo'/>
                <button class='lp-btn lp-btn-primary lp-btn-lg' type='submit'>Tạo cửa hàng miễn phí →</button>
              </form>
              <div class='lp-hero-subactions'>
                <button type='button' class='lp-inline-link' data-action='auth-mode' data-mode='login'>Đã có tài khoản cửa hàng? <strong>Đăng nhập ngay →</strong></button>
                <a class='lp-btn lp-btn-glass lp-apk-hero-btn' href='/download/android'>${icon('download', 16)}<span>Tải bản Android (.apk)</span></a>
              </div>
              <ul class='lp-trust-checks'>
                <li><span class='lp-check-badge' aria-hidden='true'>✓</span>Dữ liệu riêng theo cửa hàng</li>
                <li><span class='lp-check-badge' aria-hidden='true'>✓</span>Dùng trên web và Android</li>
                <li><span class='lp-check-badge' aria-hidden='true'>✓</span>Phân quyền nhân viên chặt chẽ</li>
              </ul>
            </div>

            <div class='lp-stage-wrap'>
              <div class='lp-stage-controls'>
                <div class='lp-stage-tabs' data-tab-glider-host role='tablist' aria-label='Xem màn hình thực tế của Slink'>
                  <button type='button' class='lp-stage-tab ${landingStageView === 'pos' ? 'active' : ''}' data-action='lp-stage-view' data-view='pos'>Màn hình Bán hàng POS</button>
                  <button type='button' class='lp-stage-tab ${landingStageView === 'dashboard' ? 'active' : ''}' data-action='lp-stage-view' data-view='dashboard'>Tổng quan &amp; Doanh thu</button>
                </div>
              </div>
              <div class='lp-3d-stage'>
                <div class='lp-3d-desktop'>
                  <div class='lp-3d-desktop-screen'>
                    <div class='lp-3d-desktop-bar' aria-hidden='true'>
                      <i></i><i></i><i></i>
                      <span>${landingStageView === 'dashboard' ? 'Slink · Tổng quan hôm nay' : 'Slink · Quầy bán hàng POS'}</span>
                    </div>
                    <picture>
                      <img class='lp-3d-desktop-img' src='${landingStageView === 'dashboard' ? './assets/slink-showcase-web-dashboard.webp' : './assets/slink-showcase-web-pos.webp'}' alt='${landingStageView === 'dashboard' ? 'Giao diện Tổng quan hôm nay thực tế của Slink trên máy tính' : 'Giao diện Bán hàng POS thực tế của Slink trên máy tính'}' width='1440' height='900' loading='eager' decoding='async'/>
                    </picture>
                    <div class='lp-3d-glare' aria-hidden='true'></div>
                  </div>
                </div>
                <div class='lp-3d-phone-anchor'>
                  <div class='lp-3d-phone-body'>
                    <div class='lp-3d-phone-bezel'>
                      <div class='lp-3d-phone-screen'>
                        <div class='lp-3d-phone-island' aria-hidden='true'></div>
                        <picture>
                          <img class='lp-3d-phone-img' src='./assets/slink-showcase-mobile-pos.webp' alt='Giao diện Slink Mobile POS trên điện thoại' width='660' height='1428' loading='eager' decoding='async'/>
                        </picture>
                      </div>
                      <div class='lp-3d-phone-glare' aria-hidden='true'></div>
                    </div>
                  </div>
                  <div class='lp-3d-phone-shadow' aria-hidden='true'></div>
                </div>
              </div>
              <div class='lp-stage-note'>
                <span><strong>Dữ liệu lưu tập trung trên máy chủ:</strong> Lên đơn, trừ tồn kho và đối soát ca tiền mặt nhất quán giữa máy tính và điện thoại.</span>
                <span class='lp-pill-tag ok'>Sẵn sàng bán ngay</span>
              </div>
            </div>
          </div>
        </section>

        <section class='lp-strip-section' aria-label='Nền tảng vận hành cốt lõi'>
          <div class='lp-strip-grid lp-glass'>
            <article class='lp-strip-item lp-solid-card' data-reveal>
              <span>Chuẩn kế toán bán lẻ</span>
              <strong>Số nguyên VND minh bạch</strong>
              <p>Đơn bán, trả hàng và sổ quỹ đồng bộ trong một giao dịch khép kín.</p>
            </article>
            <article class='lp-strip-item lp-solid-card' data-reveal>
              <span>Quầy thu ngân linh hoạt</span>
              <strong>Thanh toán gộp đa phương thức</strong>
              <p>Gộp Tiền mặt, Chuyển khoản, QR hoặc trả một phần trên cùng một đơn.</p>
            </article>
            <article class='lp-strip-item lp-solid-card' data-reveal>
              <span>Kiểm soát kho chặt chẽ</span>
              <strong>Đa chi nhánh &amp; Chống âm kho</strong>
              <p>Theo dõi tồn từng kho, nhập NCC, điều chuyển và kiểm kê nhanh.</p>
            </article>
            <article class='lp-strip-item lp-solid-card' data-reveal>
              <span>Vận hành đội ngũ</span>
              <strong>Phân quyền 5 vai trò độc lập</strong>
              <p>Phân quyền rõ Chủ shop, Quản lý, Thu ngân, Thủ kho và Kế toán.</p>
            </article>
          </div>
        </section>

        <section id='lp-features' class='lp-section' aria-labelledby='lp-features-title'>
          <div class='lp-section-head'>
            <div class='lp-eyebrow'><i class='lp-eyebrow-dot' aria-hidden='true'></i>Hệ sinh thái tính năng</div>
            <h2 id='lp-features-title'>Mọi nghiệp vụ cửa hàng hội tụ trên một nền tảng tinh gọn</h2>
            <p>Kết nối liền mạch từ lúc nhập hàng, lên đơn tại quầy đến khi khóa sổ cuối ngày trên một giao diện thống nhất.</p>
          </div>
          <div class='lp-bento-grid'>
            <article class='lp-bento-card span-7 lp-glass lp-sheen-host' data-reveal>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('cart', 22)}</span>
              <h3>Bán hàng tại quầy (POS) nhanh &amp; chuẩn xác</h3>
              <p>Tìm nhanh theo tên hoặc SKU, áp dụng khuyến mãi, tách thanh toán nhiều hình thức và in biên nhận rõ ràng.</p>
              <div class='lp-bento-preview lp-solid-card'>
                <div class='lp-preview-row'><span>Đơn #HD-1048 · Khách lẻ</span><span class='lp-pill-tag ok'>Hoàn tất</span></div>
                <div class='lp-preview-row'><span>Thu tiền mặt + Chuyển khoản QR</span><strong>1.240.000 ₫</strong></div>
              </div>
            </article>

            <article class='lp-bento-card span-5 lp-glass lp-sheen-host' data-reveal>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('box', 22)}</span>
              <h3>Hàng hóa, Biến thể &amp; Lịch sử giá</h3>
              <p>Quản lý mặt hàng đơn hoặc nhiều Màu/Size, lưu vết điều chỉnh giá và hỗ trợ nhập/xuất CSV.</p>
              <div class='lp-bento-preview lp-solid-card'>
                <div class='lp-preview-row'><span>Áo Polo Basic (Trắng / Đen · S, M, L)</span><span class='lp-pill-tag'>6 biến thể</span></div>
                <div class='lp-preview-row'><span>Cập nhật giá bán gần nhất</span><strong>295.000 ₫</strong></div>
              </div>
            </article>

            <article class='lp-bento-card span-5 lp-glass lp-sheen-host' data-reveal>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('layers', 22)}</span>
              <h3>Đa kho, Nhập hàng NCC &amp; Điều chuyển</h3>
              <p>Tạo đơn nhập NCC (PO), nhận hàng từng đợt, điều chuyển giữa các kho và kiểm kê liên tục.</p>
              <div class='lp-bento-preview lp-solid-card'>
                <div class='lp-preview-row'><span>Điều chuyển: Kho Tổng → Quầy Q1</span><span class='lp-pill-tag ok'>Đã nhận đủ</span></div>
                <div class='lp-preview-row'><span>Đơn nhập PO-029 · Nhà cung cấp</span><strong>18.500.000 ₫</strong></div>
              </div>
            </article>

            <article class='lp-bento-card span-7 lp-glass lp-sheen-host' data-reveal>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('wallet', 22)}</span>
              <h3>Sổ quỹ, Ca thu ngân &amp; Quản lý công nợ</h3>
              <p>Tách biệt tiền mặt trong két và tiền ngân hàng/QR; kiểm soát công nợ khách và phải trả NCC.</p>
              <div class='lp-bento-preview lp-solid-card'>
                <div class='lp-preview-row'><span>Ca sáng · Thu ngân bàn giao két</span><span class='lp-pill-tag ok'>Chênh lệch: 0 ₫</span></div>
                <div class='lp-preview-row'><span>Báo cáo lãi gộp sau giá vốn &amp; trả hàng</span><strong>+4.680.000 ₫</strong></div>
              </div>
            </article>

            <article class='lp-bento-card lp-glass lp-sheen-host' data-reveal>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('users', 22)}</span>
              <h3>Chăm sóc &amp; Phân nhóm khách hàng</h3>
              <p>Lưu lịch sử mua, công nợ từng khách và bộ lọc theo mức chi tiêu.</p>
            </article>

            <article class='lp-bento-card lp-glass lp-sheen-host' data-reveal>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('shop', 22)}</span>
              <h3>Ghi nhận đơn Kênh bán ngoài</h3>
              <p>Ánh xạ SKU thủ công với kho nội bộ để giữ hàng và theo dõi giao đơn.</p>
            </article>

            <article id='lp-trust' class='lp-bento-card lp-glass lp-sheen-host' data-reveal>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('receipt', 22)}</span>
              <h3>Bảo mật cửa hàng &amp; Nhật ký kiểm toán</h3>
              <p>Cô lập dữ liệu từng cửa hàng, kiểm soát phiên thiết bị và nhật ký thao tác.</p>
            </article>
          </div>
        </section>

        <section id='lp-industries' class='lp-section' aria-labelledby='lp-industries-title'>
          <div class='lp-section-head'>
            <div class='lp-eyebrow'><i class='lp-eyebrow-dot' aria-hidden='true'></i>Tối ưu theo mô hình kinh doanh</div>
            <h2 id='lp-industries-title'>Thiết kế sát thực tế cho từng ngành hàng tại Việt Nam</h2>
            <p>Tự động sắp xếp thanh điều hướng phù hợp từ cửa hàng nhỏ đến chuỗi nhiều kho.</p>
          </div>
          <div class='lp-industry-tabs' data-tab-glider-host role='tablist' aria-label='Ngành hàng'>${industryTabs}</div>
          <div class='lp-industry-panel lp-glass lp-sheen-host' data-reveal>
            <div class='lp-industry-copy'>
              <span class='lp-pill-tag'>Giải pháp chuyên biệt · ${esc(current.tab)}</span>
              <h3>${esc(current.headline)}</h3>
              <p>${esc(current.description)}</p>
              <ul class='lp-industry-points'>${industryPoints}</ul>
              <button type='button' class='lp-btn lp-btn-primary lp-btn-lg' data-action='auth-mode' data-mode='register'>Khởi tạo cửa hàng ${esc(current.shortTab)} →</button>
            </div>
            <div class='lp-industry-cards'>${industryCards}</div>
          </div>
        </section>

        <section id='lp-workflow' class='lp-section' aria-labelledby='lp-workflow-title'>
          <div class='lp-section-head'>
            <div class='lp-eyebrow'><i class='lp-eyebrow-dot' aria-hidden='true'></i>Bắt đầu dễ dàng</div>
            <h2 id='lp-workflow-title'>Sẵn sàng bán hàng chỉ sau 3 bước đơn giản</h2>
            <p>Không cần cài đặt phức tạp. Nhân viên mới thao tác thành thạo ngay trong ca đầu tiên.</p>
          </div>
          <div class='lp-steps-grid'>
            <article class='lp-step-card lp-glass' data-reveal>
              <span class='lp-step-num'>1</span>
              <h3>Đăng ký cửa hàng riêng</h3>
              <p>Nhập tên cửa hàng và chọn ngành hàng để hệ thống cấu hình quy trình gọn gàng.</p>
            </article>
            <article class='lp-step-card lp-glass' data-reveal>
              <span class='lp-step-num'>2</span>
              <h3>Đưa sản phẩm lên kệ</h3>
              <p>Thêm nhanh sản phẩm kèm tồn đầu hoặc nhập hàng loạt bằng tệp mẫu CSV.</p>
            </article>
            <article class='lp-step-card lp-glass' data-reveal>
              <span class='lp-step-num'>3</span>
              <h3>Bán hàng &amp; Xem báo cáo thực</h3>
              <p>Lên đơn trên web hoặc điện thoại, chốt ca tiền mặt và theo dõi lãi gộp mọi lúc.</p>
            </article>
          </div>
        </section>

        <section id='lp-download' class='lp-section lp-download-section' aria-labelledby='lp-download-title'>
          <div class='lp-download-card lp-glass lp-sheen-host' data-reveal>
            <div class='lp-download-copy'>
              <div class='lp-eyebrow'><i class='lp-eyebrow-dot' aria-hidden='true'></i>Ứng dụng Android chính thức</div>
              <h2 id='lp-download-title'>Tải Slink cho điện thoại Android — luôn nhận bản mới nhất.</h2>
              <p>Đóng gói tối ưu cho Android 10+, mở thẳng vào màn hình đăng nhập cửa hàng, kết nối máy in hóa đơn nhiệt Bluetooth và tự động kiểm tra bản cập nhật mới ngay trong ứng dụng.</p>
              <div class='lp-download-points'>
                <span><i class='lp-check-badge' aria-hidden='true'>✓</i>Giao diện vận hành tinh gọn</span>
                <span><i class='lp-check-badge' aria-hidden='true'>✓</i>In nhiệt Bluetooth 58mm / 80mm</span>
                <span><i class='lp-check-badge' aria-hidden='true'>✓</i>Tự kiểm tra bản cập nhật mới</span>
              </div>
            </div>
            <div class='lp-download-cta-box lp-solid-card'>
              <span class='lp-pill-tag ok' data-apk-version-badge>Android 10+</span>
              <strong>Gói cài đặt Slink.apk</strong>
              <p class='lp-apk-meta' data-apk-meta-text>Android 10 trở lên</p>
              <a class='lp-btn lp-btn-primary lp-btn-lg lp-apk-download-cta' href='/download/android'>${icon('download', 18)}<span>Tải xuống Slink Android (.apk)</span></a>
            </div>
          </div>
        </section>

        <section class='lp-cta-banner lp-glass lp-sheen-host' data-reveal aria-labelledby='lp-cta-heading'>
          <span class='lp-eyebrow'><i class='lp-eyebrow-dot' aria-hidden='true'></i>Sẵn sàng đồng hành cùng cửa hàng bạn</span>
          <h2 id='lp-cta-heading'>Trải nghiệm không gian quản lý bán hàng sáng rõ, chuẩn xác ngay hôm nay.</h2>
          <p>Tạo tài khoản cửa hàng mới hoàn toàn miễn phí hoặc đăng nhập vào cửa hàng hiện có của bạn.</p>
          <div class='lp-cta-actions'>
            <button type='button' class='lp-btn lp-btn-primary lp-btn-lg' data-action='auth-mode' data-mode='register'>Tạo tài khoản cửa hàng →</button>
            <button type='button' class='lp-btn lp-btn-glass lp-btn-lg' data-action='auth-mode' data-mode='login'>Đăng nhập tài khoản có sẵn</button>
          </div>
        </section>

        <footer class='lp-footer' aria-label='Thông tin bảo mật, hỗ trợ và pháp lý Slink'>
          <div class='lp-footer-trust-strip lp-glass'>
            <div class='lp-footer-trust-card lp-solid-card'>
              <strong>Cô lập dữ liệu theo cửa hàng</strong>
              <p>Mỗi cửa hàng dùng không gian dữ liệu và phân quyền kho tách biệt hoàn toàn.</p>
            </div>
            <div class='lp-footer-trust-card lp-solid-card'>
              <strong>Bảo vệ phiên &amp; Tài khoản</strong>
              <p>Mật khẩu băm scrypt, phiên đăng nhập bảo vệ CSRF và nhật ký kiểm toán thao tác.</p>
            </div>
            <div class='lp-footer-trust-card lp-solid-card'>
              <strong>Lưu trữ an toàn &amp; Đồng bộ</strong>
              <p>Giao dịch số nguyên VND trên máy chủ, giữ hàng đợi đơn ngay cả khi rớt mạng.</p>
            </div>
          </div>
          <div class='lp-footer-grid'>
            <div class='lp-footer-brand'>
              <div class='lp-brand'>${slinkBrandLogoHtml()}</div>
              <p>Phần mềm quản lý bán hàng tinh gọn cho cửa hàng, shop thời trang, mỹ phẩm và mô hình nhiều kho tại Việt Nam.</p>
              <div class='lp-footer-platforms'>
                <span class='lp-pill-tag'>Web Desktop</span>
                <span class='lp-pill-tag'>Mobile PWA</span>
                <span class='lp-pill-tag ok'>Android 10+</span>
              </div>
            </div>
            <div class='lp-footer-col'>
              <h3>Sản phẩm</h3>
              <div class='lp-footer-links'>
                <button type='button' data-action='lp-scroll' data-target='lp-features'>Tính năng nổi bật</button>
                <button type='button' data-action='lp-scroll' data-target='lp-industries'>Ngành hàng tối ưu</button>
                <button type='button' data-action='lp-scroll' data-target='lp-workflow'>Quy trình 3 bước</button>
                <button type='button' data-action='lp-scroll' data-target='lp-download'>Ứng dụng Android</button>
              </div>
            </div>
            <div class='lp-footer-col'>
              <h3>Tài khoản &amp; Tải app</h3>
              <div class='lp-footer-links'>
                <button type='button' data-action='auth-mode' data-mode='login'>Đăng nhập cửa hàng</button>
                <button type='button' data-action='auth-mode' data-mode='register'>Tạo cửa hàng miễn phí</button>
                <a href='/download/android'>Tải file Slink Android (.apk)</a>
                <a href='/download/slink-latest.apk'>Liên kết tải trực tiếp mới nhất</a>
              </div>
            </div>
            <div class='lp-footer-col'>
              <h3>Bảo mật &amp; Pháp lý</h3>
              <div class='lp-footer-links'>
                <a href='/legal/privacy'>Chính sách quyền riêng tư</a>
                <a href='/legal/terms'>Điều khoản sử dụng</a>
                <button type='button' data-action='lp-scroll' data-target='lp-trust'>Kiến trúc bảo mật cửa hàng</button>
              </div>
            </div>
          </div>
          <div class='lp-footer-bottom'>
            <span>© Slink · Quản lý bán hàng số nguyên VND &amp; tồn kho thời gian thực</span>
            <span>Không chèn dữ liệu mẫu vào cửa hàng thật</span>
          </div>
        </footer>
      </div>
    </div>`;


  };

  const ambientState = {
    raf: 0,
    active: false,
    width: 0,
    height: 0,
    dpr: 1,
    pointerX: 0,
    pointerY: 0,
    targetX: 0,
    targetY: 0,
    canvas: null,
  };
  let publicListenersBound = false;
  let scrollSpyFrame = 0;
  let revealObserver = null;
  let gliderResizeObserver = null;
  let chromeResizeObserver = null;
  let fontsSyncBound = false;

  function reducedMotionEnabled() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function syncAppChromeMetrics() {
    const docStyle = document.documentElement.style;
    const topbar = document.querySelector('.topbar');
    const mobileNav = document.getElementById('mobile-nav');
    const posCart = document.querySelector('.pos-mobile-cart');
    if (topbar && topbar.offsetHeight > 0) docStyle.setProperty('--topbar-h', topbar.offsetHeight + 'px');
    else docStyle.removeProperty('--topbar-h');
    if (mobileNav && mobileNav.offsetHeight > 0) docStyle.setProperty('--mobile-nav-h', mobileNav.offsetHeight + 'px');
    else docStyle.removeProperty('--mobile-nav-h');
    if (posCart && posCart.offsetHeight > 0) docStyle.setProperty('--pos-cart-bar-h', posCart.offsetHeight + 'px');
    else docStyle.removeProperty('--pos-cart-bar-h');
    if (typeof window.ResizeObserver === 'function') {
      if (!chromeResizeObserver) {
        chromeResizeObserver = new window.ResizeObserver(function () {
          syncAppChromeMetrics();
        });
      }
      [topbar, mobileNav, posCart].forEach(function (el) {
        if (el && el.dataset.chromeObserved !== '1') {
          el.dataset.chromeObserved = '1';
          chromeResizeObserver.observe(el);
        }
      });
    }
  }

  function applyGliderPercentages(host) {
    if (!host || !host.isConnected) return;
    host.classList.add('has-glider');
    let glider = Array.from(host.children).find(function (node) { return node.classList?.contains('slink-tab-glider'); });
    if (!glider) {
      glider = document.createElement('span');
      glider.className = 'slink-tab-glider';
      glider.setAttribute('aria-hidden', 'true');
      host.prepend(glider);
    }
    const active = Array.from(host.children).find(function (node) {
      return node !== glider && node.tagName === 'BUTTON' && (
        node.classList.contains('active') ||
        node.getAttribute('aria-selected') === 'true' ||
        node.getAttribute('aria-current') === 'page' ||
        node.getAttribute('aria-pressed') === 'true'
      );
    });
    if (!active || active.offsetWidth <= 0 || host.clientWidth <= 0) {
      glider.classList.remove('is-visible');
      return;
    }
    const hostW = Math.max(host.clientWidth, 1);
    const hostH = Math.max(host.clientHeight, 1);
    glider.style.setProperty('--glider-left', ((active.offsetLeft / hostW) * 100).toFixed(4) + '%');
    glider.style.setProperty('--glider-top', ((active.offsetTop / hostH) * 100).toFixed(4) + '%');
    glider.style.setProperty('--glider-width', ((active.offsetWidth / hostW) * 100).toFixed(4) + '%');
    glider.style.setProperty('--glider-height', ((active.offsetHeight / hostH) * 100).toFixed(4) + '%');
    glider.classList.add('is-visible');
    if (!glider.classList.contains('is-ready')) {
      window.requestAnimationFrame(function () {
        if (glider.isConnected) glider.classList.add('is-ready');
      });
    }
  }

  S.fn.syncTabGliders = function syncTabGliders(root = document) {
    syncAppChromeMetrics();
    const scope = root || document;
    const selector = '[data-tab-glider-host], .workspace-tabs, .inventory-stock-filters, .inventory-subtabs, .detail-tabs, .settings-areas, .auth-mode-tabs';
    const hosts = [];
    if (scope.matches && scope.matches(selector)) hosts.push(scope);
    if (scope.querySelectorAll) hosts.push(...scope.querySelectorAll(selector));

    if (!fontsSyncBound && document.fonts && document.fonts.ready) {
      fontsSyncBound = true;
      document.fonts.ready.then(function () {
        syncAppChromeMetrics();
        document.querySelectorAll(selector).forEach(applyGliderPercentages);
      }).catch(function () {});
    }

    if (typeof window.ResizeObserver === 'function' && !gliderResizeObserver) {
      gliderResizeObserver = new window.ResizeObserver(function (entries) {
        entries.forEach(function (entry) { applyGliderPercentages(entry.target); });
      });
    }

    hosts.forEach(function (host) {
      if (gliderResizeObserver && host.dataset.gliderObserved !== '1') {
        host.dataset.gliderObserved = '1';
        gliderResizeObserver.observe(host);
      }
      applyGliderPercentages(host);
    });
  };

  function syncAmbientCanvasSize() {
    const canvas = S.dom.authRoot?.querySelector('.lp-ambient-canvas');
    if (!canvas) {
      ambientState.canvas = null;
      return false;
    }
    ambientState.canvas = canvas;
    const width = Math.max(window.innerWidth || canvas.offsetWidth || 0, 1);
    const height = Math.max(window.innerHeight || canvas.offsetHeight || 0, 1);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ambientState.width = width;
    ambientState.height = height;
    ambientState.dpr = dpr;
    if (!ambientState.targetX && !ambientState.targetY) {
      ambientState.pointerX = ambientState.targetX = width * 0.55;
      ambientState.pointerY = ambientState.targetY = height * 0.35;
    }
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    return true;
  }

  function renderAmbientFrame(timestamp) {
    const canvas = ambientState.canvas;
    if (!ambientState.active || !canvas || !canvas.isConnected || !S.dom.authRoot || S.dom.authRoot.hidden || document.hidden || window.innerWidth <= 820 || S.fn.isAndroidApp()) {
      ambientState.raf = 0;
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      ambientState.raf = 0;
      return;
    }
    if (!ambientState.width) syncAmbientCanvasSize();
    const w = ambientState.width;
    const h = ambientState.height;
    const t = timestamp * 0.00042;

    ambientState.pointerX += (ambientState.targetX - ambientState.pointerX) * 0.085;
    ambientState.pointerY += (ambientState.targetY - ambientState.pointerY) * 0.085;

    ctx.save();
    ctx.setTransform(ambientState.dpr, 0, 0, ambientState.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const orbs = [
      { x: w * (0.18 + Math.sin(t * 0.9) * 0.06), y: h * (0.22 + Math.cos(t * 0.7) * 0.06), r: Math.max(w, h) * 0.38, color: 'rgba(134, 208, 182, 0.36)' },
      { x: w * (0.82 + Math.cos(t * 0.8) * 0.05), y: h * (0.28 + Math.sin(t * 0.65) * 0.07), r: Math.max(w, h) * 0.36, color: 'rgba(156, 198, 242, 0.34)' },
      { x: w * (0.52 + Math.sin(t * 0.6) * 0.07), y: h * (0.78 + Math.cos(t * 0.85) * 0.05), r: Math.max(w, h) * 0.40, color: 'rgba(176, 214, 224, 0.32)' },
    ];
    for (let i = 0; i < orbs.length; i += 1) {
      const orb = orbs[i];
      const grad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r);
      grad.addColorStop(0, orb.color);
      grad.addColorStop(1, 'rgba(229, 236, 245, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    for (let r = 0; r < 3; r += 1) {
      const baseY = h * (0.24 + r * 0.26);
      const amp = 32 + r * 12;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 28) {
        const y = baseY + Math.sin(x * 0.0032 + t * (1.3 + r * 0.35) + r * 1.7) * amp + Math.cos(x * 0.0016 - t * 0.9) * 18;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = r === 1 ? 'rgba(14, 94, 70, 0.12)' : 'rgba(116, 154, 196, 0.18)';
      ctx.lineWidth = 44 - r * 8;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.86)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    const spacing = 54;
    const radiusSq = 180 * 180;
    ctx.fillStyle = 'rgba(71, 98, 136, 0.24)';
    for (let gx = 32; gx < w; gx += spacing) {
      for (let gy = 32; gy < h; gy += spacing) {
        const dx = gx - ambientState.pointerX;
        const dy = gy - ambientState.pointerY;
        const distSq = dx * dx + dy * dy;
        let px = gx;
        let py = gy;
        if (distSq < radiusSq && distSq > 1) {
          const dist = Math.sqrt(distSq);
          const push = (1 - dist / 180) * 11;
          px += (dx / dist) * push;
          py += (dy / dist) * push;
        }
        ctx.beginPath();
        ctx.arc(px, py, 1.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
    ambientState.raf = window.requestAnimationFrame(renderAmbientFrame);
  }

  function resumeAmbientLoop() {
    if (!ambientState.active || ambientState.raf || document.hidden || reducedMotionEnabled() || window.innerWidth <= 820 || S.fn.isAndroidApp()) return;
    if (!S.dom.authRoot || S.dom.authRoot.hidden || !syncAmbientCanvasSize()) return;
    ambientState.raf = window.requestAnimationFrame(renderAmbientFrame);
  }

  function syncLandingScrollState() {
    const headerWrap = S.dom.authRoot?.querySelector('.lp-header-wrap');
    if (!headerWrap) return;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    headerWrap.classList.toggle('is-scrolled', scrollY > 18);

    const nav = headerWrap.querySelector('.lp-nav');
    if (!nav) return;
    const links = Array.from(nav.querySelectorAll('.lp-nav-link[data-target]'));
    const headerBottom = headerWrap.getBoundingClientRect().bottom + 36;
    let activeTarget = '';
    const firstSection = document.getElementById(links[0]?.dataset.target || '');
    if (firstSection && scrollY > 80 && firstSection.getBoundingClientRect().top <= headerBottom + 160) {
      for (let i = 0; i < links.length; i += 1) {
        const section = document.getElementById(links[i].dataset.target);
        if (section && section.getBoundingClientRect().top <= headerBottom + 160) {
          activeTarget = links[i].dataset.target;
        }
      }
    }
    let changed = false;
    links.forEach(function (link) {
      const shouldBeActive = Boolean(activeTarget) && link.dataset.target === activeTarget;
      if (link.classList.contains('active') !== shouldBeActive) {
        link.classList.toggle('active', shouldBeActive);
        changed = true;
      }
    });
    if (changed) S.fn.syncTabGliders(nav);
  }

  function setupScrollReveals() {
    if (!S.dom.authRoot) return;
    const targets = Array.from(S.dom.authRoot.querySelectorAll('[data-reveal]'));
    if (!targets.length) return;
    targets.forEach(function (node, index) {
      node.style.setProperty('--reveal-delay', ((index % 4) * 55) + 'ms');
    });
    if (reducedMotionEnabled() || typeof window.IntersectionObserver !== 'function') {
      targets.forEach(function (node) { node.classList.add('is-revealed'); });
      return;
    }
    if (revealObserver) revealObserver.disconnect();
    revealObserver = new window.IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
    targets.forEach(function (node) { revealObserver.observe(node); });
  }

  function bindPublicListeners() {
    if (publicListenersBound || !S.dom.authRoot) return;
    publicListenersBound = true;

    S.dom.authRoot.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'touch') return;
      ambientState.targetX = event.clientX;
      ambientState.targetY = event.clientY;
      const card = event.target.closest('.lp-sheen-host');
      if (card) {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--sheen-x', Math.round(event.clientX - rect.left) + 'px');
        card.style.setProperty('--sheen-y', Math.round(event.clientY - rect.top) + 'px');
      }
      const stageWrap = event.target.closest('.lp-stage-wrap');
      const stage = stageWrap?.querySelector('.lp-3d-stage');
      if (stage && !reducedMotionEnabled()) {
        const rect = stage.getBoundingClientRect();
        const nx = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2));
        const ny = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2));
        stage.style.setProperty('--stage-ry', (nx * 4.5).toFixed(2) + 'deg');
        stage.style.setProperty('--stage-rx', (-ny * 3.2).toFixed(2) + 'deg');
        stage.style.setProperty('--phone-shift-x', (nx * 6).toFixed(1) + 'px');
        stage.style.setProperty('--phone-shift-y', (ny * 5).toFixed(1) + 'px');
      }
    }, { passive: true });

    S.dom.authRoot.addEventListener('pointerout', function (event) {
      const stageWrap = event.target.closest?.('.lp-stage-wrap');
      if (!stageWrap || (event.relatedTarget && stageWrap.contains(event.relatedTarget))) return;
      const stage = stageWrap.querySelector('.lp-3d-stage');
      if (!stage) return;
      stage.style.removeProperty('--stage-ry');
      stage.style.removeProperty('--stage-rx');
      stage.style.removeProperty('--phone-shift-x');
      stage.style.removeProperty('--phone-shift-y');
    });

    window.addEventListener('scroll', function () {
      if (S.dom.authRoot?.hidden || scrollSpyFrame) return;
      scrollSpyFrame = window.requestAnimationFrame(function () {
        scrollSpyFrame = 0;
        syncLandingScrollState();
      });
    }, { passive: true });

    window.addEventListener('resize', function () {
      if (S.dom.authRoot?.hidden) return;
      syncAmbientCanvasSize();
      resumeAmbientLoop();
      S.fn.syncTabGliders(S.dom.authRoot);
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) resumeAmbientLoop();
    });
  }

  S.fn.setupLandingInteractions = function setupLandingInteractions() {
    bindPublicListeners();
    const shouldAnimateCanvas = !S.fn.isAndroidApp() && !reducedMotionEnabled() && Boolean(S.dom.authRoot && !S.dom.authRoot.hidden && S.dom.authRoot.querySelector('.lp-ambient-canvas'));
    ambientState.active = shouldAnimateCanvas;
    if (shouldAnimateCanvas) {
      syncAmbientCanvasSize();
      resumeAmbientLoop();
    } else if (ambientState.raf) {
      window.cancelAnimationFrame(ambientState.raf);
      ambientState.raf = 0;
    }
    setupScrollReveals();
    syncLandingScrollState();
    S.fn.syncTabGliders(S.dom.authRoot);
  };
  S.fn.setupPublicSurfaceInteractions = S.fn.setupLandingInteractions;

  function triggerMorph(element) {
    if (!element || reducedMotionEnabled()) return;
    element.classList.remove('is-morphing');
    void element.offsetWidth;
    element.classList.add('is-morphing');
  }

  S.fn.handleLandingAction = function handleLandingAction(action, button) {
    if (action === 'lp-scroll') {
      const target = document.getElementById(button.dataset.target);
      target?.scrollIntoView({ behavior: reducedMotionEnabled() ? 'auto' : 'smooth', block: 'start' });
      const nav = button.closest('.lp-nav');
      if (nav) {
        nav.querySelectorAll('.lp-nav-link').forEach(function (link) { link.classList.toggle('active', link === button); });
        S.fn.syncTabGliders(nav);
      }
      return;
    }

    if (action === 'lp-stage-view') {
      landingStageView = button.dataset.view === 'dashboard' ? 'dashboard' : 'pos';
      const tabsWrap = button.closest('.lp-stage-tabs');
      if (tabsWrap) {
        tabsWrap.querySelectorAll('.lp-stage-tab').forEach(function (tab) {
          const isCurrent = tab.dataset.view === landingStageView;
          tab.classList.toggle('active', isCurrent);
          tab.setAttribute('aria-selected', String(isCurrent));
        });
        S.fn.syncTabGliders(tabsWrap);
      }
      const img = S.dom.authRoot?.querySelector('.lp-3d-desktop-img');
      const barTitle = S.dom.authRoot?.querySelector('.lp-3d-desktop-bar span');
      const desktopScreen = S.dom.authRoot?.querySelector('.lp-3d-desktop-screen');
      if (img && barTitle) {
        const isDash = landingStageView === 'dashboard';
        img.src = isDash ? './assets/slink-showcase-web-dashboard.webp' : './assets/slink-showcase-web-pos.webp';
        img.alt = isDash ? 'Giao diện Tổng quan hôm nay thực tế của Slink trên máy tính' : 'Giao diện Bán hàng POS thực tế của Slink trên máy tính';
        barTitle.textContent = isDash ? 'Slink · Tổng quan hôm nay' : 'Slink · Quầy bán hàng POS';
        triggerMorph(desktopScreen || img);
        return;
      }
    }

    if (action === 'lp-industry' && Object.hasOwn(landingIndustryBlueprints, button.dataset.industry)) {
      landingIndustry = button.dataset.industry;
      const current = landingIndustryBlueprints[landingIndustry];
      const tabsWrap = button.closest('.lp-industry-tabs');
      if (tabsWrap) {
        tabsWrap.querySelectorAll('.lp-industry-tab').forEach(function (tab) {
          const isCurrent = tab.dataset.industry === landingIndustry;
          tab.classList.toggle('active', isCurrent);
          tab.setAttribute('aria-selected', String(isCurrent));
        });
        S.fn.syncTabGliders(tabsWrap);
      }
      const quickInput = document.querySelector("[data-landing-start] input[name='quickStoreName']");
      if (quickInput) quickInput.placeholder = `Tên cửa hàng (VD: ${current.storeSample})…`;
      const panel = S.dom.authRoot?.querySelector('.lp-industry-panel');
      if (panel) {
        const industryPoints = current.points.map(function (pt) {
          return `<li><span class='lp-check-badge' aria-hidden='true'>✓</span><span>${esc(pt)}</span></li>`;
        }).join('');
        const industryCards = current.metrics.map(function (m) {
          return `<div class='lp-industry-metric-card lp-solid-card'><div><strong>${esc(m.title)}</strong><small>${esc(m.sub)}</small></div><span class='lp-pill-tag'>${esc(m.badge)}</span></div>`;
        }).join('');
        panel.innerHTML = `<div class='lp-industry-copy'>
          <span class='lp-pill-tag'>Giải pháp chuyên biệt · ${esc(current.tab)}</span>
          <h3>${esc(current.headline)}</h3>
          <p>${esc(current.description)}</p>
          <ul class='lp-industry-points'>${industryPoints}</ul>
          <button type='button' class='lp-btn lp-btn-primary lp-btn-lg' data-action='auth-mode' data-mode='register'>Khởi tạo cửa hàng ${esc(current.shortTab)} →</button>
        </div>
        <div class='lp-industry-cards'>${industryCards}</div>`;
        triggerMorph(panel);
        return;
      }
    }

    const name = document.querySelector('[data-landing-start] input');
    if (name) quickStoreName = name.value;
    S.fn.renderAuth();
    const choices = S.dom.authRoot.querySelectorAll(`[data-action='${action}']`);
    Array.from(choices).find(choice => choice.dataset.view === button.dataset.view && choice.dataset.industry === button.dataset.industry)?.focus({ preventScroll: true });
  };
})(window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {} });
