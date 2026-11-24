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
      description: 'Tạo nhanh hàng trăm biến thể Màu/Size (S, M, L, XL), kiểm tra tồn kho từng chi nhánh ngay tại quầy thu ngân và theo dõi mẫu bán chạy theo ngày.',
      points: [
        'Quản lý nhóm sản phẩm nhiều màu, nhiều size không rối mã hàng.',
        'Tra cứu tồn kho chi nhánh tức thì khi khách hỏi đổi size.',
        'Lưu lịch sử mua sắm và gắn thẻ khách VIP để chăm sóc lại.',
        'Lịch sử thay đổi giá bán minh bạch theo từng đợt khuyến mãi.',
      ],
      metrics: [
        { title: 'Quản lý biến thể Màu / Size', sub: 'Tạo đồng loạt SKU con chỉ trong 1 thao tác', badge: 'Chuẩn thời trang' },
        { title: 'Đối soát tồn kho quầy & kho phụ', sub: 'Phiếu điều chuyển rõ số lượng xuất – thực nhận', badge: 'Chống thất thoát' },
        { title: 'Lưu bộ lọc nhóm khách hàng', sub: 'Lọc theo công nợ, mức chi tiêu và gắn thẻ phân loại', badge: 'Chăm sóc khách quen' },
      ],
    },
    cosmetics: {
      tab: 'Mỹ phẩm & Làm đẹp',
      shortTab: 'Mỹ phẩm',
      storeSample: 'Aura Beauty Room',
      headline: 'Kiểm soát hàng chính hãng, dung tích và tệp khách thân thiết.',
      description: 'Quản lý chặt chẽ hàng trăm mã serum, kem chống nắng theo dung tích/phân loại, ghi chú tình trạng da khách hàng và bảo vệ biên lợi nhuận gộp.',
      points: [
        'Phân loại rõ ràng theo thương hiệu, dung tích (30ml, 50ml, Fullsize).',
        'Cảnh báo sớm mặt hàng sắp chạm định mức tồn tối thiểu để đặt hàng NCC.',
        'Theo dõi giá vốn mặt hàng và lưu lịch sử điều chỉnh giá bán minh bạch.',
        'Ghi chú chi tiết nhu cầu từng khách hàng ngay trên hồ sơ & đơn bán.',
      ],
      metrics: [
        { title: 'Cảnh báo tồn kho tối thiểu', sub: 'Chủ động nhập bổ sung các mã bán chạy', badge: 'Không đứt hàng' },
        { title: 'Lãi gộp thực tế theo ngày', sub: 'Tự động tính sau giá vốn và hàng trả lại', badge: 'Rõ lợi nhuận' },
        { title: 'Quản lý đơn đặt hàng NCC (PO)', sub: 'Nhận hàng từng phần và theo dõi công nợ phải trả', badge: 'Chuẩn quy trình' },
      ],
    },
    grocery: {
      tab: 'Tạp hóa & Bán lẻ',
      shortTab: 'Tạp hóa',
      storeSample: 'Siêu thị Mini An Phú',
      headline: 'Tính tiền nhanh tại quầy, sổ quỹ và công nợ rõ ràng cuối ca.',
      description: 'Tìm kiếm hàng hóa tức thì theo tên hoặc mã vạch/SKU, kết hợp nhiều phương thức thanh toán trên cùng một đơn và khóa sổ ca thu ngân minh bạch.',
      points: [
        'Tốc độ tìm mặt hàng và cộng giỏ hàng tức thì, thao tác gọn trên cảm ứng.',
        'Hỗ trợ khách trả một phần, ghi nợ phần còn lại gắn trực tiếp vào hồ sơ khách.',
        'Mở ca – đóng ca tiền mặt đối soát chênh lệch chính xác đến từng đồng.',
        'Kiểm kê hàng loạt bằng tệp hoặc đếm nhanh ngay trên điện thoại.',
      ],
      metrics: [
        { title: 'Sổ ca tiền mặt chuyên nghiệp', sub: 'Theo dõi tiền đầu ca, thu chi mặt và kiểm đếm cuối ca', badge: 'Khớp két tiền' },
        { title: 'Quản lý công nợ khách & NCC', sub: 'Thu nợ từng đợt, lưu biên nhận rõ ràng', badge: 'Không quên nợ' },
        { title: 'Nhập danh mục siêu tốc từ CSV', sub: 'Đưa hàng trăm mặt hàng lên quầy trong vài phút', badge: 'Dễ chuyển đổi' },
      ],
    },
    omnichannel: {
      tab: 'Online & Chuỗi nhiều kho',
      shortTab: 'Đa kênh',
      storeSample: 'Hệ thống Kho Minh Khang',
      headline: 'Đồng nhất tồn kho nhiều chi nhánh và quản lý đơn kênh bán.',
      description: 'Ghi nhận tập trung đơn bán tại quầy cùng đơn nhập thủ công từ kênh bán ngoài, phân quyền nhân sự theo kho phụ trách và lưu nhật ký kiểm toán.',
      points: [
        'Khai báo kênh bán, ánh xạ mã SKU thủ công và giữ tồn kho khi tạo đơn kênh bán.',
        'Phân quyền nhân viên chi tiết: Chủ shop, Quản lý, Thu ngân, Thủ kho, Kế toán.',
        'Giới hạn phạm vi kho làm việc cho từng nhân sự ở từng chi nhánh.',
        'Nhật ký kiểm toán (Audit Log) ghi lại mọi thao tác nhạy cảm trên hệ thống.',
      ],
      metrics: [
        { title: 'Phân quyền nhân sự theo kho', sub: 'Nhân viên chi nhánh nào chỉ thao tác kho được giao', badge: 'Bảo mật đa kho' },
        { title: 'Quản lý đơn hàng kênh bán', sub: 'Lưu thông tin người nhận, địa chỉ và tiến độ giao', badge: 'Gom đơn gọn' },
        { title: 'Nhật ký hoạt động toàn diện', sub: 'Tra cứu ai đã sửa giá, hủy đơn hoặc chỉnh tồn', badge: 'Minh bạch 100%' },
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
                <span class='lp-stage-pill-info'>● Ảnh chụp giao diện thật Slink</span>
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
              <p>Đơn bán, trả hàng, sổ quỹ và công nợ được ghi nhận đồng bộ trong một giao dịch khép kín.</p>
            </article>
            <article class='lp-strip-item lp-solid-card'>
              <span>Quầy thu ngân linh hoạt</span>
              <strong>Thanh toán gộp đa phương thức</strong>
              <p>Kết hợp Tiền mặt, Chuyển khoản, QR hoặc ghi nhận trả một phần ngay trên cùng một hóa đơn.</p>
            </article>
            <article class='lp-strip-item lp-solid-card'>
              <span>Kiểm soát kho chặt chẽ</span>
              <strong>Đa chi nhánh &amp; Chống âm kho</strong>
              <p>Theo dõi tồn thực tế từng kho, đặt hàng nhà cung cấp, điều chuyển nội bộ và kiểm kê nhanh.</p>
            </article>
            <article class='lp-strip-item lp-solid-card'>
              <span>Vận hành đội ngũ</span>
              <strong>Phân quyền 5 vai trò độc lập</strong>
              <p>Tách biệt rõ Chủ cửa hàng, Quản lý, Thu ngân, Thủ kho và Kế toán kèm nhật ký kiểm toán.</p>
            </article>
          </div>
        </section>

        <section id='lp-features' class='lp-section' aria-labelledby='lp-features-title'>
          <div class='lp-section-head'>
            <div class='lp-eyebrow'><i class='lp-eyebrow-dot' aria-hidden='true'></i>Hệ sinh thái tính năng</div>
            <h2 id='lp-features-title'>Mọi nghiệp vụ cửa hàng hội tụ trên một nền tảng tinh gọn</h2>
            <p>Không cần ghép nối rời rạc nhiều bảng tính. Slink kết nối liền mạch từ lúc nhập hàng, lên đơn tại quầy đến khi khóa sổ cuối ngày.</p>
          </div>
          <div class='lp-bento-grid'>
            <article class='lp-bento-card span-7 lp-glass lp-sheen-host'>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('cart', 22)}</span>
              <h3>Bán hàng tại quầy (POS) nhanh &amp; chuẩn xác</h3>
              <p>Tìm nhanh theo tên, mã SKU hoặc danh mục; áp dụng mã khuyến mãi, chọn khách hàng, tách thanh toán nhiều hình thức và in biên nhận rõ ràng ngay lập tức.</p>
              <div class='lp-bento-preview lp-solid-card'>
                <div class='lp-preview-row'><span>Đơn #HD-1048 · Khách lẻ</span><span class='lp-pill-tag ok'>Hoàn tất</span></div>
                <div class='lp-preview-row'><span>Thu tiền mặt + Chuyển khoản QR</span><strong>1.240.000 ₫</strong></div>
              </div>
            </article>

            <article class='lp-bento-card span-5 lp-glass lp-sheen-host'>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('box', 22)}</span>
              <h3>Hàng hóa, Biến thể &amp; Lịch sử giá</h3>
              <p>Quản lý mặt hàng đơn lẻ hoặc nhóm nhiều màu sắc, kích cỡ. Lưu vết mọi lần điều chỉnh giá bán, giá vốn và hỗ trợ nhập/xuất CSV hàng loạt.</p>
              <div class='lp-bento-preview lp-solid-card'>
                <div class='lp-preview-row'><span>Áo Polo Basic (Trắng / Đen · S, M, L)</span><span class='lp-pill-tag'>6 biến thể</span></div>
                <div class='lp-preview-row'><span>Cập nhật giá bán gần nhất</span><strong>295.000 ₫</strong></div>
              </div>
            </article>

            <article class='lp-bento-card span-5 lp-glass lp-sheen-host'>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('layers', 22)}</span>
              <h3>Đa kho, Nhập hàng NCC &amp; Điều chuyển</h3>
              <p>Tạo đơn đặt hàng nhà cung cấp (PO), nhận hàng từng đợt, chuyển hàng giữa các kho xuất – kho nhận và kiểm kê tồn kho thực tế không gián đoạn bán hàng.</p>
              <div class='lp-bento-preview lp-solid-card'>
                <div class='lp-preview-row'><span>Điều chuyển: Kho Tổng → Quầy Q1</span><span class='lp-pill-tag ok'>Đã nhận đủ</span></div>
                <div class='lp-preview-row'><span>Đơn nhập PO-029 · Nhà cung cấp</span><strong>18.500.000 ₫</strong></div>
              </div>
            </article>

            <article class='lp-bento-card span-7 lp-glass lp-sheen-host'>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('wallet', 22)}</span>
              <h3>Sổ quỹ, Ca thu ngân &amp; Quản lý công nợ</h3>
              <p>Theo dõi tách biệt tiền mặt trong két và tiền vào qua ngân hàng/QR. Kiểm soát chặt các khoản phải thu từ khách mua chịu và công nợ phải trả nhà cung cấp.</p>
              <div class='lp-bento-preview lp-solid-card'>
                <div class='lp-preview-row'><span>Ca sáng · Thu ngân bàn giao két</span><span class='lp-pill-tag ok'>Chênh lệch: 0 ₫</span></div>
                <div class='lp-preview-row'><span>Báo cáo lãi gộp sau giá vốn &amp; trả hàng</span><strong>+4.680.000 ₫</strong></div>
              </div>
            </article>

            <article class='lp-bento-card lp-glass lp-sheen-host'>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('users', 22)}</span>
              <h3>Chăm sóc &amp; Phân nhóm khách hàng</h3>
              <p>Lưu lịch sử giao dịch, công nợ từng khách, gắn nhãn phân loại và lưu bộ lọc tệp khách hàng theo tổng mức chi tiêu.</p>
            </article>

            <article class='lp-bento-card lp-glass lp-sheen-host'>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('shop', 22)}</span>
              <h3>Ghi nhận đơn Kênh bán ngoài</h3>
              <p>Khai báo gian hàng, ánh xạ mã SKU thủ công với kho nội bộ để giữ hàng, xuất kho và theo dõi trạng thái giao đơn.</p>
            </article>

            <article id='lp-trust' class='lp-bento-card lp-glass lp-sheen-host'>
              <span class='lp-bento-icon' aria-hidden='true'>${icon('receipt', 22)}</span>
              <h3>Bảo mật cửa hàng &amp; Nhật ký kiểm toán</h3>
              <p>Cô lập dữ liệu tuyệt đối giữa các cửa hàng, quản lý phiên đăng nhập thiết bị và ghi nhận đầy đủ lịch sử thao tác quan trọng.</p>
            </article>
          </div>
        </section>

        <section id='lp-industries' class='lp-section' aria-labelledby='lp-industries-title'>
          <div class='lp-section-head'>
            <div class='lp-eyebrow'><i class='lp-eyebrow-dot' aria-hidden='true'></i>Tối ưu theo mô hình kinh doanh</div>
            <h2 id='lp-industries-title'>Thiết kế sát thực tế cho từng ngành hàng tại Việt Nam</h2>
            <p>Dù bạn vận hành một cửa hàng nhỏ tinh gọn hay chuỗi nhiều kho hàng, Slink tự động sắp xếp giao diện đúng với quy trình của bạn.</p>
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
            <p>Không cần cài đặt phần mềm phức tạp hay đào tạo dài ngày. Nhân viên mới có thể thao tác thành thạo ngay trong ca đầu tiên.</p>
          </div>
          <div class='lp-steps-grid'>
            <article class='lp-step-card lp-glass'>
              <span class='lp-step-num'>1</span>
              <h3>Đăng ký cửa hàng riêng</h3>
              <p>Nhập tên cửa hàng và chọn mô hình kinh doanh. Hệ thống tự động cấu hình thanh điều hướng gọn gàng nhất cho bạn.</p>
            </article>
            <article class='lp-step-card lp-glass'>
              <span class='lp-step-num'>2</span>
              <h3>Đưa sản phẩm lên kệ</h3>
              <p>Thêm nhanh mặt hàng kèm tồn kho ban đầu chỉ trong vài giây, hoặc tải lên danh sách hàng loạt bằng tệp mẫu CSV.</p>
            </article>
            <article class='lp-step-card lp-glass'>
              <span class='lp-step-num'>3</span>
              <h3>Bán hàng &amp; Xem báo cáo thực</h3>
              <p>Lên đơn trên máy tính hoặc điện thoại, quản lý ca tiền mặt và nắm bắt doanh thu, lãi gộp mọi lúc mọi nơi.</p>
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

        <footer class='lp-footer'>
          <div class='lp-footer-inner'>
            <div class='lp-brand'>${slinkBrandLogoHtml()}</div>
            <div class='lp-footer-links'>
              <button type='button' data-action='auth-mode' data-mode='login'>Đăng nhập</button>
              <button type='button' data-action='auth-mode' data-mode='register'>Đăng ký cửa hàng</button>
              <a href='/download/android'>Tải ứng dụng Android (.apk)</a>
              <a href='/legal/privacy'>Chính sách quyền riêng tư</a>
              <a href='/legal/terms'>Điều khoản sử dụng</a>
            </div>
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
