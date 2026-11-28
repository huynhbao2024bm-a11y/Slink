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
    const badge = isRegisterFlow ? '✦ Khởi tạo nhanh' : '● Đồng bộ thời gian thực';
    const heading = isRegisterFlow
      ? 'Không gian riêng cho cửa hàng của bạn.'
      : 'Quầy quản lý bán hàng Slink.';
    const lead = isRegisterFlow
      ? 'Dữ liệu tách biệt theo từng cửa hàng, sẵn sàng bán ngay.'
      : 'Lên đơn, tra tồn kho và đối soát ca tiền mặt trong một nơi.';
    const previewImg = isRegisterFlow ? './assets/slink-showcase-web-dashboard.webp' : './assets/slink-showcase-web-pos.webp';
    const previewTitle = isRegisterFlow ? 'Slink · Tổng quan cửa hàng' : 'Slink · Quầy bán hàng POS';
    const highlights = isRegisterFlow
      ? [
          ['1', 'Không chèn dữ liệu mẫu', 'Cửa hàng mới hoàn toàn sạch sẽ.'],
          ['2', 'Đủ nghiệp vụ bán lẻ', 'POS, đa kho, biến thể và sổ quỹ.'],
          ['3', 'Bảo mật chuẩn mực', 'Mật khẩu ≥ 12 ký tự, tách phiên thiết bị.'],
        ]
      : [
          ['✓', 'Thu ngân nhanh gọn', 'Tách phương thức thanh toán và in hóa đơn.'],
          ['✓', 'Phân quyền theo kho', '5 vai trò với phạm vi kho rõ ràng.'],
          ['✓', 'Kiểm soát an toàn', 'Phiên bảo vệ CSRF và nhật ký kiểm toán.'],
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
      headline: 'Quản lý chuẩn từng màu sắc, kích cỡ.',
      description: 'Quản lý biến thể Màu/Size và tra cứu tồn chi nhánh ngay tại quầy.',
      points: [
        'Tạo nhóm sản phẩm nhiều màu, nhiều size.',
        'Kiểm tra tồn từng kho khi khách đổi size.',
        'Lưu lịch sử điều chỉnh giá bán và thẻ khách VIP.',
      ],
      metrics: [
        { title: 'Biến thể Màu / Size', sub: 'Tạo đồng loạt SKU con chỉ 1 lần', badge: 'Thời trang' },
        { title: 'Đối soát đa kho', sub: 'Điều chuyển rõ số xuất – thực nhận', badge: 'Chống thất thoát' },
        { title: 'Bộ lọc khách hàng', sub: 'Lọc công nợ, chi tiêu và thẻ phân loại', badge: 'Chăm sóc khách' },
      ],
    },
    cosmetics: {
      tab: 'Mỹ phẩm & Làm đẹp',
      shortTab: 'Mỹ phẩm',
      storeSample: 'Aura Beauty Room',
      headline: 'Kiểm soát dung tích, giá vốn và khách quen.',
      description: 'Phân loại theo dung tích, cảnh báo sắp hết hàng và giữ rõ lãi gộp.',
      points: [
        'Phân nhóm theo thương hiệu, dung tích (30ml, 50ml…).',
        'Cảnh báo mặt hàng chạm mức tồn tối thiểu.',
        'Theo dõi giá vốn và đơn đặt hàng NCC (PO).',
      ],
      metrics: [
        { title: 'Cảnh báo định mức tồn', sub: 'Chủ động nhập bổ sung mã bán chạy', badge: 'Không đứt hàng' },
        { title: 'Lãi gộp thực tế', sub: 'Tính sau giá vốn và hàng trả lại', badge: 'Rõ lợi nhuận' },
        { title: 'Đặt hàng NCC (PO)', sub: 'Nhận từng phần và theo dõi công nợ', badge: 'Chuẩn quy trình' },
      ],
    },
    grocery: {
      tab: 'Tạp hóa & Bán lẻ',
      shortTab: 'Tạp hóa',
      storeSample: 'Siêu thị Mini An Phú',
      headline: 'Tính tiền nhanh, rõ sổ quỹ và công nợ.',
      description: 'Quét mã tìm hàng, gộp thanh toán và đối soát két tiền cuối ca.',
      points: [
        'Tìm mặt hàng, quét mã vạch và cộng giỏ tức thì.',
        'Khách trả một phần, ghi nợ thẳng vào hồ sơ.',
        'Mở ca – chốt ca tiền mặt khớp két rõ ràng.',
      ],
      metrics: [
        { title: 'Quản lý ca tiền mặt', sub: 'Theo dõi đầu ca, thu chi và kiểm đếm', badge: 'Khớp két' },
        { title: 'Công nợ khách & NCC', sub: 'Thu trả từng đợt kèm biên nhận', badge: 'Minh bạch' },
        { title: 'Nhập danh mục CSV', sub: 'Đưa hàng trăm mặt hàng lên quầy nhanh', badge: 'Dễ bắt đầu' },
      ],
    },
    omnichannel: {
      tab: 'Online & Chuỗi nhiều kho',
      shortTab: 'Đa kênh',
      storeSample: 'Hệ thống Kho Minh Khang',
      headline: 'Đồng nhất tồn đa kho và đơn kênh bán.',
      description: 'Gom đơn quầy và đơn kênh ngoài trên một hệ thống phân quyền theo kho.',
      points: [
        'Ánh xạ SKU kênh bán với kho nội bộ để giữ tồn.',
        'Phân 5 vai trò: Chủ shop, Quản lý, Thu ngân, Thủ kho, Kế toán.',
        'Nhật ký kiểm toán lưu vết mọi thay đổi nhạy cảm.',
      ],
      metrics: [
        { title: 'Phân quyền theo kho', sub: 'Nhân viên chỉ thao tác đúng kho được giao', badge: 'Đa chi nhánh' },
        { title: 'Đơn kênh bán ngoài', sub: 'Lưu người nhận và tiến độ giao đơn', badge: 'Gom đơn gọn' },
        { title: 'Nhật ký kiểm toán', sub: 'Tra lịch sử sửa giá, hủy đơn, chỉnh tồn', badge: 'Minh bạch' },
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
              <div class='lp-eyebrow'><i class='lp-eyebrow-dot' aria-hidden='true'></i>Nền tảng vận hành bán lẻ</div>
              <h1 id='lp-hero-heading' class='lp-hero-title'>Bán hàng nhanh gọn,<br/><span>chính xác từng đồng.</span></h1>
              <p class='lp-hero-lead'>POS tính tiền, biến thể màu/size, tồn đa kho, công nợ và sổ quỹ số nguyên VND — đồng bộ web và Android.</p>
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
                <span><strong>Đồng bộ máy chủ:</strong> Lên đơn, trừ kho và chốt ca nhất quán trên web lẫn điện thoại.</span>
                <span class='lp-pill-tag ok'>Sẵn sàng bán ngay</span>
              </div>
            </div>
          </div>
        </section>

        <section class='lp-strip-section' aria-label='Nền tảng vận hành cốt lõi'>
          <div class='lp-strip-grid lp-glass'>
            <article class='lp-strip-item lp-solid-card' data-reveal>
              <span>Chuẩn kế toán</span>
              <strong>Số nguyên VND</strong>
              <p>Đơn bán, trả hàng và sổ quỹ khép kín.</p>
            </article>
            <article class='lp-strip-item lp-solid-card' data-reveal>
              <span>Quầy thu ngân</span>
              <strong>Thanh toán linh hoạt</strong>
              <p>Gộp tiền mặt, chuyển khoản, QR hoặc ghi nợ.</p>
            </article>
            <article class='lp-strip-item lp-solid-card' data-reveal>
              <span>Kiểm soát kho</span>
              <strong>Đa kho &amp; Chống âm</strong>
              <p>Theo dõi tồn, nhập NCC và điều chuyển.</p>
            </article>
            <article class='lp-strip-item lp-solid-card' data-reveal>
              <span>Đội ngũ</span>
              <strong>5 vai trò phân quyền</strong>
              <p>Chủ shop, Quản lý, Thu ngân, Thủ kho, Kế toán.</p>
            </article>
          </div>
        </section>

        <section id='lp-features' class='lp-section' aria-labelledby='lp-features-title'>
          <div class='lp-section-head'>
            <div class='lp-eyebrow'><i class='lp-eyebrow-dot' aria-hidden='true'></i>Hệ sinh thái tính năng</div>
            <h2 id='lp-features-title'>Trọn bộ nghiệp vụ cửa hàng trên một màn hình</h2>
            <p>Liên thông nhập hàng, bán tại quầy và khóa sổ cuối ngày.</p>
          </div>
          <div class='lp-bento-grid'>
            <article class='lp-bento-card span-7 lp-glass lp-sheen-host' data-reveal>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('cart', 22)}</span>
              <h3>Bán hàng tại quầy (POS)</h3>
              <p>Tìm nhanh theo tên/SKU, áp khuyến mãi, gộp thanh toán và in bill.</p>
              <div class='lp-bento-preview lp-solid-card'>
                <div class='lp-preview-row'><span>Đơn #HD-1048 · Khách lẻ</span><span class='lp-pill-tag ok'>Hoàn tất</span></div>
                <div class='lp-preview-row'><span>Thu tiền mặt + Chuyển khoản QR</span><strong>1.240.000 ₫</strong></div>
              </div>
            </article>

            <article class='lp-bento-card span-5 lp-glass lp-sheen-host' data-reveal>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('box', 22)}</span>
              <h3>Hàng hóa &amp; Biến thể</h3>
              <p>Hỗ trợ Màu/Size, lưu lịch sử đổi giá và nhập xuất CSV.</p>
              <div class='lp-bento-preview lp-solid-card'>
                <div class='lp-preview-row'><span>Áo Polo Basic (Trắng / Đen · S, M, L)</span><span class='lp-pill-tag'>6 biến thể</span></div>
                <div class='lp-preview-row'><span>Giá bán hiện tại</span><strong>295.000 ₫</strong></div>
              </div>
            </article>

            <article class='lp-bento-card span-5 lp-glass lp-sheen-host' data-reveal>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('layers', 22)}</span>
              <h3>Đa kho &amp; Điều chuyển</h3>
              <p>Đặt hàng NCC (PO), nhận nhiều đợt, chuyển kho và kiểm kê.</p>
              <div class='lp-bento-preview lp-solid-card'>
                <div class='lp-preview-row'><span>Kho Tổng → Quầy Q1</span><span class='lp-pill-tag ok'>Đã nhận đủ</span></div>
                <div class='lp-preview-row'><span>Đơn nhập PO-029 · NCC</span><strong>18.500.000 ₫</strong></div>
              </div>
            </article>

            <article class='lp-bento-card span-7 lp-glass lp-sheen-host' data-reveal>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('wallet', 22)}</span>
              <h3>Sổ quỹ, Ca thu ngân &amp; Công nợ</h3>
              <p>Tách quỹ tiền mặt – ngân hàng, chốt ca và công nợ khách / NCC.</p>
              <div class='lp-bento-preview lp-solid-card'>
                <div class='lp-preview-row'><span>Ca sáng · Bàn giao két</span><span class='lp-pill-tag ok'>Chênh lệch: 0 ₫</span></div>
                <div class='lp-preview-row'><span>Lãi gộp sau trả hàng</span><strong>+4.680.000 ₫</strong></div>
              </div>
            </article>

            <article class='lp-bento-card lp-glass lp-sheen-host' data-reveal>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('users', 22)}</span>
              <h3>Khách hàng &amp; Bộ lọc</h3>
              <p>Lịch sử mua, công nợ và phân nhóm theo chi tiêu.</p>
            </article>

            <article class='lp-bento-card lp-glass lp-sheen-host' data-reveal>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('shop', 22)}</span>
              <h3>Đơn kênh bán ngoài</h3>
              <p>Ánh xạ SKU với kho nội bộ để giữ tồn và theo dõi giao.</p>
            </article>

            <article class='lp-bento-card lp-glass lp-sheen-host' data-reveal>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('receipt', 22)}</span>
              <h3>Bảo mật &amp; Nhật ký kiểm toán</h3>
              <p>Cô lập dữ liệu cửa hàng, kiểm soát phiên và nhật ký thao tác.</p>
            </article>
          </div>
        </section>

        <section id='lp-industries' class='lp-section' aria-labelledby='lp-industries-title'>
          <div class='lp-section-head'>
            <div class='lp-eyebrow'><i class='lp-eyebrow-dot' aria-hidden='true'></i>Theo mô hình kinh doanh</div>
            <h2 id='lp-industries-title'>Linh hoạt cho từng ngành hàng</h2>
          </div>
          <div class='lp-industry-tabs' data-tab-glider-host role='tablist' aria-label='Ngành hàng'>${industryTabs}</div>
          <div class='lp-industry-panel lp-glass lp-sheen-host' data-reveal>
            <div class='lp-industry-copy'>
              <span class='lp-pill-tag'>${esc(current.tab)}</span>
              <h3>${esc(current.headline)}</h3>
              <p>${esc(current.description)}</p>
              <ul class='lp-industry-points'>${industryPoints}</ul>
              <button type='button' class='lp-btn lp-btn-primary lp-btn-lg' data-action='auth-mode' data-mode='register'>Tạo cửa hàng ${esc(current.shortTab)} →</button>
            </div>
            <div class='lp-industry-cards'>${industryCards}</div>
          </div>
        </section>

        <section id='lp-workflow' class='lp-section' aria-labelledby='lp-workflow-title'>
          <div class='lp-section-head'>
            <div class='lp-eyebrow'><i class='lp-eyebrow-dot' aria-hidden='true'></i>Bắt đầu nhanh</div>
            <h2 id='lp-workflow-title'>Bán hàng chỉ sau 3 bước</h2>
          </div>
          <div class='lp-steps-grid'>
            <article class='lp-step-card lp-glass' data-reveal>
              <span class='lp-step-num'>1</span>
              <h3>Tạo cửa hàng</h3>
              <p>Đăng ký không gian dữ liệu riêng theo mô hình kinh doanh.</p>
            </article>
            <article class='lp-step-card lp-glass' data-reveal>
              <span class='lp-step-num'>2</span>
              <h3>Thêm sản phẩm</h3>
              <p>Nhập từng mặt hàng hoặc tải lên hàng loạt từ tệp CSV.</p>
            </article>
            <article class='lp-step-card lp-glass' data-reveal>
              <span class='lp-step-num'>3</span>
              <h3>Bán hàng &amp; Chốt ca</h3>
              <p>Lên đơn web/Android, chốt két tiền mặt và xem lãi gộp.</p>
            </article>
          </div>
        </section>

        <section id='lp-download' class='lp-section lp-download-section' aria-labelledby='lp-download-title'>
          <div class='lp-download-card lp-glass lp-sheen-host' data-reveal>
            <div class='lp-download-copy'>
              <div class='lp-eyebrow'><i class='lp-eyebrow-dot' aria-hidden='true'></i>Ứng dụng Android</div>
              <h2 id='lp-download-title'>Tải Slink cho Android — luôn là bản mới nhất.</h2>
              <p>Mở thẳng vào màn hình cửa hàng, hỗ trợ máy in nhiệt Bluetooth 58mm/80mm và tự kiểm tra cập nhật.</p>
              <div class='lp-download-points'>
                <span><i class='lp-check-badge' aria-hidden='true'>✓</i>Gọn nhẹ cho Android 10+</span>
                <span><i class='lp-check-badge' aria-hidden='true'>✓</i>In nhiệt Bluetooth 58mm / 80mm</span>
                <span><i class='lp-check-badge' aria-hidden='true'>✓</i>Tự kiểm tra cập nhật mới</span>
              </div>
            </div>
            <div class='lp-download-cta-box lp-solid-card'>
              <span class='lp-pill-tag ok' data-apk-version-badge>Android 10+</span>
              <strong>Slink.apk</strong>
              <p class='lp-apk-meta' data-apk-meta-text>Android 10 trở lên</p>
              <a class='lp-btn lp-btn-primary lp-btn-lg lp-apk-download-cta' href='/download/android'>${icon('download', 18)}<span>Tải Slink Android (.apk)</span></a>
            </div>
          </div>
        </section>

        <section id='lp-trust' class='lp-section lp-trust-section' aria-labelledby='lp-trust-title'>
          <div class='lp-section-head'>
            <div class='lp-eyebrow'><i class='lp-eyebrow-dot' aria-hidden='true'></i>Bảo mật &amp; An toàn dữ liệu</div>
            <h2 id='lp-trust-title'>Cô lập dữ liệu và kiểm soát chặt theo cửa hàng</h2>
          </div>
          <div class='lp-footer-trust-strip lp-glass' data-reveal>
            <div class='lp-footer-trust-card lp-solid-card'>
              <strong>Cô lập từng cửa hàng</strong>
              <p>Dữ liệu và phân quyền kho tách biệt hoàn toàn.</p>
            </div>
            <div class='lp-footer-trust-card lp-solid-card'>
              <strong>Bảo vệ phiên đăng nhập</strong>
              <p>Mật khẩu scrypt, chống CSRF và nhật ký kiểm toán.</p>
            </div>
            <div class='lp-footer-trust-card lp-solid-card'>
              <strong>Số nguyên VND &amp; Offline</strong>
              <p>Giao dịch máy chủ chuẩn đồng, giữ hàng đợi khi mất mạng.</p>
            </div>
          </div>
        </section>

        <section class='lp-cta-banner lp-glass lp-sheen-host' data-reveal aria-labelledby='lp-cta-heading'>
          <span class='lp-eyebrow'><i class='lp-eyebrow-dot' aria-hidden='true'></i>Bắt đầu miễn phí</span>
          <h2 id='lp-cta-heading'>Quản lý cửa hàng sáng rõ, chuẩn xác từng đồng.</h2>
          <div class='lp-cta-actions'>
            <button type='button' class='lp-btn lp-btn-primary lp-btn-lg' data-action='auth-mode' data-mode='register'>Tạo tài khoản cửa hàng →</button>
            <button type='button' class='lp-btn lp-btn-glass lp-btn-lg' data-action='auth-mode' data-mode='login'>Đăng nhập</button>
          </div>
        </section>

        <footer class='lp-footer' aria-label='Thông tin bảo mật, hỗ trợ và pháp lý Slink'>
          <div class='lp-footer-grid'>
            <div class='lp-footer-brand'>
              <div class='lp-brand'>${slinkBrandLogoHtml()}</div>
              <p>Quản lý bán hàng, đa kho và sổ quỹ cho cửa hàng tại Việt Nam.</p>
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
  let lpScrollLock = { targetId: '', until: 0 };

  function reducedMotionEnabled() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function syncAppChromeMetrics() {
    const docStyle = document.documentElement.style;
    const topbar = document.querySelector('.topbar');
    const mobileNav = document.getElementById('mobile-nav');
    const posCart = document.querySelector('.pos-mobile-cart');
    const lpHeaderWrap = document.querySelector('.lp-header-wrap');
    if (topbar && topbar.offsetHeight > 0) docStyle.setProperty('--topbar-h', topbar.offsetHeight + 'px');
    else docStyle.removeProperty('--topbar-h');
    if (mobileNav && mobileNav.offsetHeight > 0) docStyle.setProperty('--mobile-nav-h', mobileNav.offsetHeight + 'px');
    else docStyle.removeProperty('--mobile-nav-h');
    if (posCart && posCart.offsetHeight > 0) docStyle.setProperty('--pos-cart-bar-h', posCart.offsetHeight + 'px');
    else docStyle.removeProperty('--pos-cart-bar-h');
    if (lpHeaderWrap && lpHeaderWrap.offsetHeight > 0) docStyle.setProperty('--lp-header-h', Math.ceil(lpHeaderWrap.getBoundingClientRect().bottom) + 'px');
    else docStyle.removeProperty('--lp-header-h');
    if (typeof window.ResizeObserver === 'function') {
      if (!chromeResizeObserver) {
        chromeResizeObserver = new window.ResizeObserver(function () {
          syncAppChromeMetrics();
        });
      }
      [topbar, mobileNav, posCart, lpHeaderWrap].forEach(function (el) {
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
    const hostRect = host.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const relLeft = (activeRect.left - hostRect.left) - host.clientLeft + host.scrollLeft;
    const relTop = (activeRect.top - hostRect.top) - host.clientTop + host.scrollTop;
    const relW = activeRect.width || active.offsetWidth;
    const relH = activeRect.height || active.offsetHeight;
    glider.style.setProperty('--glider-left', ((relLeft / hostW) * 100).toFixed(4) + '%');
    glider.style.setProperty('--glider-top', ((relTop / hostH) * 100).toFixed(4) + '%');
    glider.style.setProperty('--glider-width', ((relW / hostW) * 100).toFixed(4) + '%');
    glider.style.setProperty('--glider-height', ((relH / hostH) * 100).toFixed(4) + '%');
    glider.classList.add('is-visible');
    if (host.scrollWidth > host.clientWidth + 2) {
      const pad = 12;
      if (relLeft < host.scrollLeft + pad) host.scrollLeft = Math.max(0, relLeft - pad);
      else if (relLeft + relW > host.scrollLeft + host.clientWidth - pad) {
        host.scrollLeft = Math.min(host.scrollWidth - host.clientWidth, relLeft + relW - host.clientWidth + pad);
      }
    }
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
    const headerBottom = Math.ceil(headerWrap.getBoundingClientRect().bottom);
    const threshold = headerBottom + 72;
    let activeTarget = '';

    if (lpScrollLock.targetId && Date.now() < lpScrollLock.until) {
      activeTarget = lpScrollLock.targetId;
      const lockedEl = document.getElementById(activeTarget);
      if (lockedEl && Math.abs(lockedEl.getBoundingClientRect().top - (headerBottom + 18)) <= 8) {
        lpScrollLock = { targetId: '', until: 0 };
      }
    } else {
      lpScrollLock = { targetId: '', until: 0 };
      const sections = links.map(function (link) {
        const el = document.getElementById(link.dataset.target || '');
        return el ? { id: link.dataset.target, el, top: el.getBoundingClientRect().top } : null;
      }).filter(Boolean).sort(function (a, b) { return a.top - b.top; });

      const atBottom = (scrollY + (window.innerHeight || 0)) >= (document.documentElement.scrollHeight - 28);
      if (atBottom && sections.length) {
        activeTarget = sections[sections.length - 1].id;
      } else if (scrollY > 40 && sections.length && sections[0].top <= threshold) {
        for (let i = 0; i < sections.length; i += 1) {
          if (sections[i].top <= threshold) activeTarget = sections[i].id;
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
    const isSearchCrawler = /googlebot|google-inspectiontool|bingbot|slurp|duckduckbot|baiduspider|yandex|chrome-lighthouse|pagespeed|\bbot\b|crawl|spider/i.test(navigator.userAgent || '');
    if (reducedMotionEnabled() || isSearchCrawler || typeof window.IntersectionObserver !== 'function') {
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

    const clearLock = function () { lpScrollLock = { targetId: '', until: 0 }; };
    window.addEventListener('wheel', clearLock, { passive: true });
    window.addEventListener('touchstart', clearLock, { passive: true });

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
      const targetId = button.dataset.target || '';
      const target = document.getElementById(targetId);
      const headerWrap = S.dom.authRoot?.querySelector('.lp-header-wrap');
      const headerClearance = headerWrap ? Math.ceil(headerWrap.getBoundingClientRect().bottom) + 18 : 104;
      if (target) {
        const destY = Math.max(0, Math.round(target.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0) - headerClearance));
        lpScrollLock = target.closest?.('.lp-nav') || button.closest('.lp-nav')
          ? { targetId, until: Date.now() + 900 }
          : { targetId: '', until: 0 };
        window.scrollTo({ top: destY, behavior: reducedMotionEnabled() ? 'auto' : 'smooth' });
      }
      const nav = button.closest('.lp-nav') || S.dom.authRoot?.querySelector('.lp-nav');
      if (nav) {
        nav.querySelectorAll('.lp-nav-link').forEach(function (link) { link.classList.toggle('active', link.dataset.target === targetId); });
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
