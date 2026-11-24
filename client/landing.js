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
          <nav class='lp-nav' aria-label='Khám phá Slink'>
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
                <div class='lp-stage-tabs' role='tablist' aria-label='Xem màn hình thực tế của Slink'>
                  <button type='button' class='lp-stage-tab ${landingStageView === 'pos' ? 'active' : ''}' data-action='lp-stage-view' data-view='pos'>Màn hình Bán hàng POS</button>
                  <button type='button' class='lp-stage-tab ${landingStageView === 'dashboard' ? 'active' : ''}' data-action='lp-stage-view' data-view='dashboard'>Tổng quan &amp; Doanh thu</button>
                </div>
                <span class='lp-stage-caption'>Ảnh chụp giao diện thực tế</span>
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
            <article class='lp-strip-item lp-solid-card'>
              <span>Chuẩn kế toán bán lẻ</span>
              <strong>Số nguyên VND minh bạch</strong>
              <p>Đơn bán, trả hàng và sổ quỹ đồng bộ trong một giao dịch khép kín.</p>
            </article>
            <article class='lp-strip-item lp-solid-card'>
              <span>Quầy thu ngân linh hoạt</span>
              <strong>Thanh toán gộp đa phương thức</strong>
              <p>Gộp Tiền mặt, Chuyển khoản, QR hoặc trả một phần trên cùng một đơn.</p>
            </article>
            <article class='lp-strip-item lp-solid-card'>
              <span>Kiểm soát kho chặt chẽ</span>
              <strong>Đa chi nhánh &amp; Chống âm kho</strong>
              <p>Theo dõi tồn từng kho, nhập NCC, điều chuyển và kiểm kê nhanh.</p>
            </article>
            <article class='lp-strip-item lp-solid-card'>
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
            <article class='lp-bento-card span-7 lp-glass lp-sheen-host'>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('cart', 22)}</span>
              <h3>Bán hàng tại quầy (POS) nhanh &amp; chuẩn xác</h3>
              <p>Tìm nhanh theo tên hoặc SKU, áp dụng khuyến mãi, tách thanh toán nhiều hình thức và in biên nhận rõ ràng.</p>
              <div class='lp-bento-preview lp-solid-card'>
                <div class='lp-preview-row'><span>Đơn #HD-1048 · Khách lẻ</span><span class='lp-pill-tag ok'>Hoàn tất</span></div>
                <div class='lp-preview-row'><span>Thu tiền mặt + Chuyển khoản QR</span><strong>1.240.000 ₫</strong></div>
              </div>
            </article>

            <article class='lp-bento-card span-5 lp-glass lp-sheen-host'>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('box', 22)}</span>
              <h3>Hàng hóa, Biến thể &amp; Lịch sử giá</h3>
              <p>Quản lý mặt hàng đơn hoặc nhiều Màu/Size, lưu vết điều chỉnh giá và hỗ trợ nhập/xuất CSV.</p>
              <div class='lp-bento-preview lp-solid-card'>
                <div class='lp-preview-row'><span>Áo Polo Basic (Trắng / Đen · S, M, L)</span><span class='lp-pill-tag'>6 biến thể</span></div>
                <div class='lp-preview-row'><span>Cập nhật giá bán gần nhất</span><strong>295.000 ₫</strong></div>
              </div>
            </article>

            <article class='lp-bento-card span-5 lp-glass lp-sheen-host'>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('layers', 22)}</span>
              <h3>Đa kho, Nhập hàng NCC &amp; Điều chuyển</h3>
              <p>Tạo đơn nhập NCC (PO), nhận hàng từng đợt, điều chuyển giữa các kho và kiểm kê liên tục.</p>
              <div class='lp-bento-preview lp-solid-card'>
                <div class='lp-preview-row'><span>Điều chuyển: Kho Tổng → Quầy Q1</span><span class='lp-pill-tag ok'>Đã nhận đủ</span></div>
                <div class='lp-preview-row'><span>Đơn nhập PO-029 · Nhà cung cấp</span><strong>18.500.000 ₫</strong></div>
              </div>
            </article>

            <article class='lp-bento-card span-7 lp-glass lp-sheen-host'>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('wallet', 22)}</span>
              <h3>Sổ quỹ, Ca thu ngân &amp; Quản lý công nợ</h3>
              <p>Tách biệt tiền mặt trong két và tiền ngân hàng/QR; kiểm soát công nợ khách và phải trả NCC.</p>
              <div class='lp-bento-preview lp-solid-card'>
                <div class='lp-preview-row'><span>Ca sáng · Thu ngân bàn giao két</span><span class='lp-pill-tag ok'>Chênh lệch: 0 ₫</span></div>
                <div class='lp-preview-row'><span>Báo cáo lãi gộp sau giá vốn &amp; trả hàng</span><strong>+4.680.000 ₫</strong></div>
              </div>
            </article>

            <article class='lp-bento-card lp-glass lp-sheen-host'>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('users', 22)}</span>
              <h3>Chăm sóc &amp; Phân nhóm khách hàng</h3>
              <p>Lưu lịch sử mua, công nợ từng khách và bộ lọc theo mức chi tiêu.</p>
            </article>

            <article class='lp-bento-card lp-glass lp-sheen-host'>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('shop', 22)}</span>
              <h3>Ghi nhận đơn Kênh bán ngoài</h3>
              <p>Ánh xạ SKU thủ công với kho nội bộ để giữ hàng và theo dõi giao đơn.</p>
            </article>

            <article id='lp-trust' class='lp-bento-card lp-glass lp-sheen-host'>
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
          <div class='lp-industry-tabs' role='tablist' aria-label='Ngành hàng'>${industryTabs}</div>
          <div class='lp-industry-panel lp-glass lp-sheen-host'>
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
            <article class='lp-step-card lp-glass'>
              <span class='lp-step-num'>1</span>
              <h3>Đăng ký cửa hàng riêng</h3>
              <p>Nhập tên cửa hàng và chọn ngành hàng để hệ thống cấu hình quy trình gọn gàng.</p>
            </article>
            <article class='lp-step-card lp-glass'>
              <span class='lp-step-num'>2</span>
              <h3>Đưa sản phẩm lên kệ</h3>
              <p>Thêm nhanh sản phẩm kèm tồn đầu hoặc nhập hàng loạt bằng tệp mẫu CSV.</p>
            </article>
            <article class='lp-step-card lp-glass'>
              <span class='lp-step-num'>3</span>
              <h3>Bán hàng &amp; Xem báo cáo thực</h3>
              <p>Lên đơn trên web hoặc điện thoại, chốt ca tiền mặt và theo dõi lãi gộp mọi lúc.</p>
            </article>
          </div>
        </section>

        <section id='lp-download' class='lp-section lp-download-section' aria-labelledby='lp-download-title'>
          <div class='lp-download-card lp-glass lp-sheen-host'>
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

        <section class='lp-cta-banner lp-glass lp-sheen-host' aria-labelledby='lp-cta-heading'>
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

  S.fn.setupLandingInteractions = function setupLandingInteractions() {
    const canvas = S.dom.authRoot.querySelector('.lp-ambient-canvas');
    if (!canvas || !canvas.offsetWidth) return;
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    for (let wave = 0; wave < 3; wave += 1) {
      ctx.beginPath();
      for (let x = 0; x <= width + 16; x += 16) {
        const y = height * (.24 + wave * .26) + Math.sin(x * .0032 + wave * 1.7) * (34 + wave * 12) + Math.cos(x * .0016) * 18;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = wave === 1 ? '#0e5e4621' : '#749ac431';
      ctx.lineWidth = 44 - wave * 8;
      ctx.stroke();
      ctx.strokeStyle = '#ffffffdd';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };

  S.fn.handleLandingAction = function handleLandingAction(action, button) {
    if (action === 'lp-scroll') {
      document.getElementById(button.dataset.target)?.scrollIntoView({ block: 'start' });
      return;
    }
    if (action === 'lp-stage-view') landingStageView = button.dataset.view === 'dashboard' ? 'dashboard' : 'pos';
    else if (Object.hasOwn(landingIndustryBlueprints, button.dataset.industry)) landingIndustry = button.dataset.industry;
    const name = document.querySelector('[data-landing-start] input');
    if (name) quickStoreName = name.value;
    S.fn.renderAuth();
    const choices = S.dom.authRoot.querySelectorAll(`[data-action='${action}']`);
    Array.from(choices).find(choice => choice.dataset.view === button.dataset.view && choice.dataset.industry === button.dataset.industry)?.focus({ preventScroll: true });
  };
})(window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {} });
