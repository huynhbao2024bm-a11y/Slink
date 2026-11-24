(function (S) {
  'use strict';

  S.state.navItems = [
    { id: 'dashboard', label: 'Tổng quan', icon: 'home' },
    { id: 'pos', label: 'Bán hàng (POS)', icon: 'cart', accent: true },
    { id: 'products', label: 'Sản phẩm', icon: 'box' },
    { id: 'inventory', label: 'Tồn kho', icon: 'layers' },
    { id: 'inventory-count', label: 'Kiểm kê', icon: 'check' },
    { id: 'inventory-transfer', label: 'Điều chuyển', icon: 'truck' },
    { id: 'orders', label: 'Đơn hàng', icon: 'receipt' },
    { id: 'inventory-receive', label: 'Nhập hàng', icon: 'download' },
    { id: 'promotions', label: 'Khuyến mãi', icon: 'tag' },
    { id: 'customers', label: 'Khách hàng', icon: 'users' },
    { id: 'suppliers', label: 'Nhà cung cấp', icon: 'shop' },
    { id: 'finance', label: 'Thu chi', icon: 'wallet' },
    { id: 'reports', label: 'Báo cáo', icon: 'chart' },
    { id: 'staff', label: 'Nhân viên', icon: 'users' },
    { id: 'audit', label: 'Nhật ký', icon: 'clock' },
    { id: 'settings', label: 'Cài đặt', icon: 'settings' },
    { id: 'channels', label: 'Kênh bán', icon: 'shop' },
    { id: 'workspace', label: 'Quản lý', icon: 'layers' },
    { id: 'affiliate', label: 'Link của tôi', icon: 'tag' },
  ];

  S.state.sidebarGroups = [
    { title: '', routes: ['dashboard'] },
    { title: 'Hàng hóa', routes: ['products', 'inventory', 'inventory-count', 'inventory-transfer'] },
    { title: 'Giao dịch', routes: ['orders', 'inventory-receive', 'promotions'] },
    { title: 'Đối tác', routes: ['customers', 'suppliers'] },
    { title: 'Tài chính & Báo cáo', routes: ['finance', 'reports'] },
    { title: 'Hệ thống', routes: ['staff', 'audit', 'settings'] },
  ];

  S.state.iconPaths = {
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/><path d="M9 21v-6h6v6"/>',
    cart: '<path d="M3 4h2l2.2 11.3a2 2 0 0 0 2 1.7h8.5a2 2 0 0 0 2-1.6L21 9H7"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
    box: '<path d="m12 3 9 5-9 5-9-5z"/><path d="M3 8v9l9 5 9-5V8M12 13v9"/>',
    receipt: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2z"/><path d="M8 8h8M8 12h8M8 16h4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.2a4 4 0 0 1 0 7.6"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    wallet: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M16 14h2"/><path d="M7 5V3h11"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 6-7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8L6.9 12l1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 1.9z"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.4"/><path d="m16 16 4.5 4.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    close: '<path d="m18 6-12 12M6 6l12 12"/>',
    download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 17v3h14v-3"/>',
    scan: '<path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M4 12h1m3 0h1m3 0h1m3 0h1m3 0h1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    tag: '<path d="M20 13 11 22l-9-9V2h11z"/><circle cx="7" cy="7" r="1"/>',
    alert: '<path d="m10.3 4.3-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-2.7l-8-14a2 2 0 0 0-3.4 0z"/><path d="M12 9v4m0 4h.01"/>',
    spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z"/>',
    edit: '<path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15z"/>',
    trash: '<path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/>',
    more: '<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    receiptSmall: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6m-6 4h6m-6 4h3"/>',
    gift: '<path d="M20 12v9H4v-9m-1-5h18v5H3zM12 7v14"/><path d="M12 7H7.5a2.5 2.5 0 1 1 2.4-3.2L12 7zm0 0h4.5a2.5 2.5 0 1 0-2.4-3.2L12 7z"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18m-14 5h3"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    truck: '<path d="M3 5h12v12H3zM15 9h4l3 4v4h-7z"/><circle cx="7.5" cy="18" r="1.8"/><circle cx="18.5" cy="18" r="1.8"/>',
    shop: '<path d="M4 10v10h16V10M3 10l2-6h14l2 6"/><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-6h6v6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.5 1.5c-1.1 1.1-2 1.3-2 3m0 3h.01"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'
  };


  S.fn.authCard = function authCard(title, subtitle, body, message, tone) {
    document.body.classList.remove('pos-fullscreen');
    const mode = S.state.authMode;
    const showModeTabs = mode === 'login' || mode === 'register';
    const modeTabs = showModeTabs
      ? `<div class='auth-mode-tabs' role='tablist' aria-label='Tài khoản'>
          <button type='button' role='tab' aria-selected='${mode === 'login'}' class='auth-mode-tab ${mode === 'login' ? 'active' : ''}' data-action='auth-mode' data-mode='login'>Đăng nhập</button>
          <button type='button' role='tab' aria-selected='${mode === 'register'}' class='auth-mode-tab ${mode === 'register' ? 'active' : ''}' data-action='auth-mode' data-mode='register'>Tạo cửa hàng</button>
        </div>`
      : '';
    const isApp = S.fn.isAndroidApp();
    const cardHtml = `<section class='auth-card${isApp ? ' android-auth-card' : ''}'>
      <div class='auth-brand'>
        <span class='brand-mark' aria-hidden='true'><svg viewBox='0 0 32 32'><path d='M8 8.5h16v5H13v2h11v8H8v-5h11v-2H8z' fill='currentColor'/><circle cx='24.5' cy='7.5' r='2.5' fill='#c8f36c'/></svg></span>
        <span class='brand-name'>slink<span class='brand-period'>.</span></span>
        ${isApp ? "<span class='android-auth-label'>Android</span>" : ''}
      </div>
      ${modeTabs}
      <h1>${S.fn.esc(title)}</h1>
      ${subtitle ? `<p>${S.fn.esc(subtitle)}</p>` : ''}
      ${message ? `<div class='auth-message ${tone === 'error' ? 'error' : ''}'>${message}</div>` : ''}
      ${body}
      <div class='auth-footnote'><button type='button' class='link-button' data-action='open-legal' data-kind='terms'>Điều khoản</button> · <button type='button' class='link-button' data-action='open-legal' data-kind='privacy'>Bảo mật</button></div>
    </section>`;
    if (isApp) {
      S.dom.authRoot.className = 'auth-screen is-android-welcome';
      S.dom.authRoot.innerHTML = cardHtml;
    } else if (!isApp && showModeTabs && typeof S.fn.renderWebAuthLanding === 'function') {
      S.dom.authRoot.className = 'auth-screen is-web-landing';
      S.dom.authRoot.innerHTML = S.fn.renderWebAuthLanding(cardHtml);
      S.fn.setupLandingInteractions?.();
    } else {
      S.dom.authRoot.className = 'auth-screen';
      S.dom.authRoot.innerHTML = cardHtml;
    }
    S.dom.appShell.hidden = true;
    S.dom.authRoot.hidden = false;
  }


  S.fn.openLegalModal = function openLegalModal(kind) {
    const k = kind === 'privacy' ? 'privacy' : 'terms';
    const title = k === 'privacy' ? 'Chính sách bảo mật' : 'Điều khoản sử dụng';
    const legal = window.SlinkLegalContent;
    const html = legal
      ? `<div class='legal-modal-body' style='max-height:60vh;overflow:auto;padding-right:4px'>${legal.renderLegalSectionsHtml(k)}<p class='muted' style='margin-top:14px;font-size:12px'>Cập nhật: ${S.fn.esc(legal.LAST_UPDATED || '')} · <a href='/legal/${k}' target='_blank' rel='noopener'>Mở trang độc lập</a></p></div>`
      : `<div class='empty-state'><a href='/legal/${k}' target='_blank' rel='noopener'>Xem ${S.fn.esc(title)}</a></div>`;
    S.fn.showModal(title, '', html, `<button class='btn btn-primary' type='button' data-action='close-modal'>Đóng</button>`, true);
  }


  S.fn.authPasswordField = function authPasswordField(id, name, label, autocomplete, confirmationFor) {
    const confirmationAttribute = confirmationFor ? ` data-password-confirm-for='${S.fn.esc(confirmationFor)}'` : '';
    return `<div class='form-field'><label class='input-label' for='${S.fn.esc(id)}'>${S.fn.esc(label)}</label><div class='auth-password-control'><input class='input auth-password-input' id='${S.fn.esc(id)}' name='${S.fn.esc(name)}' type='password' autocomplete='${S.fn.esc(autocomplete)}' required minlength='${name === 'password' || name === 'newPassword' ? '12' : '1'}' maxlength='128'${confirmationAttribute}/><button class='auth-password-toggle' type='button' data-action='toggle-password' data-target='${S.fn.esc(id)}' aria-label='Hiện mật khẩu' aria-pressed='false' title='Hiện mật khẩu'><svg viewBox='0 0 24 24' aria-hidden='true'><path d='M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z'/><circle cx='12' cy='12' r='2.7'/></svg></button></div></div>`;
  }


  S.fn.updatePasswordConfirmation = function updatePasswordConfirmation(form) {
    if (!form) return true;
    const confirmation = form.querySelector('[data-password-confirm-for]');
    if (!confirmation) return true;
    const password = document.getElementById(confirmation.dataset.passwordConfirmFor);
    const matches = Boolean(password && confirmation.value === password.value);
    confirmation.setCustomValidity(matches ? '' : 'Hai lần nhập mật khẩu chưa khớp.');
    return matches;
  }


  S.state.businessProfileOptions = [
    { value: 'retail', label: 'Cửa hàng bán lẻ', detail: 'Bán tại quầy, hàng hóa, đơn hàng, kho, thu chi.' },
    { value: 'warehouse', label: 'Nhiều kho / điểm bán', detail: 'Quản lý kho, chuyển kho, hàng hóa và đơn hàng.' },
    { value: 'large_business', label: 'Cửa hàng có nhân viên', detail: 'Phân quyền nhân viên, báo cáo, kho và bán hàng.' },
    { value: 'unsure', label: 'Mặc định gọn nhẹ', detail: 'Đủ tính năng bán hàng và quản lý cơ bản.' },
  ];

  S.state.businessProfileNavigation = {
    retail: ['dashboard', 'pos', 'products', 'orders', 'inventory', 'inventory-count', 'inventory-transfer', 'inventory-receive', 'promotions', 'customers', 'suppliers', 'finance', 'reports', 'staff', 'audit', 'settings'],
    online: ['dashboard', 'pos', 'products', 'orders', 'inventory', 'customers', 'suppliers', 'finance', 'reports', 'settings'],
    warehouse: ['dashboard', 'inventory', 'inventory-count', 'inventory-transfer', 'inventory-receive', 'products', 'orders', 'pos', 'suppliers', 'finance', 'reports', 'settings'],
    large_business: ['dashboard', 'pos', 'products', 'orders', 'inventory', 'inventory-count', 'inventory-transfer', 'inventory-receive', 'promotions', 'customers', 'suppliers', 'finance', 'reports', 'staff', 'audit', 'settings'],
    unsure: ['dashboard', 'pos', 'products', 'orders', 'inventory', 'customers', 'finance', 'reports', 'settings'],
  };

  S.state.businessProfileMobileNavigation = {
    retail: ['dashboard', 'orders', 'pos', 'products'],
    online: ['dashboard', 'orders', 'pos', 'products'],
    warehouse: ['inventory', 'products', 'inventory-receive', 'inventory-count'],
    large_business: ['dashboard', 'orders', 'pos', 'products'],
    unsure: ['dashboard', 'orders', 'pos', 'products'],
  };


  S.fn.isProfileRouteEnabled = function isProfileRouteEnabled(routeId) {
    const profileRoutes = S.state.businessProfileNavigation[S.state.store.businessProfile] || S.state.businessProfileNavigation.unsure;
    return profileRoutes.includes(routeId) || ['finance', 'settings'].includes(routeId);
  }


  S.fn.businessProfileLabel = function businessProfileLabel(value) {
    const option = S.state.businessProfileOptions.find(function (item) { return item.value === value; });
    return option ? option.label : 'Chưa chọn';
  }


  S.fn.renderBusinessProfileChoices = function renderBusinessProfileChoices(selected) {
    return S.state.businessProfileOptions.map(function (option) {
      return `<label class='business-profile-choice'><input type='radio' name='businessProfile' value='${option.value}' required ${selected === option.value ? 'checked' : ''}/><span><strong>${S.fn.esc(option.label)}</strong><small>${S.fn.esc(option.detail)}</small></span></label>`;
    }).join('');
  }


  S.fn.taskFocusStorageKey = function taskFocusStorageKey() {
    const userId = S.state.authSession && S.state.authSession.user && S.state.authSession.user.id;
    return userId && S.state.store.id ? `slink-task-focus-v1:${encodeURIComponent(userId)}:${encodeURIComponent(S.state.store.id)}` : '';
  }


  S.fn.taskFocusOptions = function taskFocusOptions() {
    const candidates = [];
    if (S.fn.hasPerm('viewReports') || S.fn.hasPerm('manageSettings')) candidates.push({ route: 'dashboard', label: S.state.store.role === 'owner' ? 'Chủ cửa hàng' : 'Quản lý cửa hàng', detail: 'Xem việc cần làm và tình hình hôm nay.' });
    if (S.fn.hasPerm('posSell')) candidates.push({ route: 'pos', label: 'Người bán hàng', detail: 'Chọn mặt hàng, thu tiền và xem đơn.' });
    if (S.fn.hasPerm('manageInventory') || S.fn.hasPerm('editProducts')) candidates.push({ route: 'inventory', label: 'Phụ trách hàng hóa và kho', detail: 'Nhận hàng, kiểm tra số lượng và mặt hàng.' });
    if (S.fn.hasPerm('viewFinance') || S.fn.hasPerm('recordCashbook')) candidates.push({ route: 'finance', label: 'Theo dõi thu chi', detail: 'Ghi nhận tiền và xem các khoản còn lại.' });
    return candidates.filter(function (option) { return S.fn.canAccessRoute(option.route) && S.fn.isProfileRouteEnabled(option.route); });
  }


  S.fn.defaultTaskFocusRoute = function defaultTaskFocusRoute() {
    const preferred = S.state.store.role === 'stockkeeper' ? 'inventory' : S.state.store.role === 'accountant' ? 'finance' : 'pos';
    if (S.fn.canAccessRoute(preferred) && S.fn.isProfileRouteEnabled(preferred)) return preferred;
    const options = S.fn.taskFocusOptions();
    return options.length ? options[0].route : '';
  }


  S.fn.readTaskFocusRoute = function readTaskFocusRoute() {
    const key = S.fn.taskFocusStorageKey();
    if (!key) return '';
    try {
      const saved = window.localStorage.getItem(key) || '';
      return S.fn.taskFocusOptions().some(function (option) { return option.route === saved; }) ? saved : '';
    } catch (_error) { return ''; }
  }


  S.fn.saveTaskFocusRoute = function saveTaskFocusRoute(route) {
    if (!S.fn.taskFocusOptions().some(function (option) { return option.route === route; })) return false;
    S.state.taskFocusRoute = route;
    const key = S.fn.taskFocusStorageKey();
    try { if (key) window.localStorage.setItem(key, route); } catch (_error) { /* Keep the preference for this session if storage is unavailable. */ }
    return true;
  }


  S.fn.renderTaskFocusChoices = function renderTaskFocusChoices(selected) {
    const options = S.fn.taskFocusOptions();
    const choice = selected || S.state.taskFocusRoute || S.fn.defaultTaskFocusRoute();
    return options.map(function (option) {
      return `<label class='business-profile-choice task-focus-choice'><input type='radio' name='taskFocusRoute' value='${option.route}' required ${choice === option.route ? 'checked' : ''}/><span><strong>${S.fn.esc(option.label)}</strong><small>${S.fn.esc(option.detail)}</small></span></label>`;
    }).join('');
  }


  S.fn.openTaskFocusOnboarding = function openTaskFocusOnboarding() {
    const options = S.fn.taskFocusOptions();
    if (!options.length) return S.fn.scheduleInitialGuidedTour();
    const body = `<form id='task-focus-onboarding' data-form='task-focus'><div class='task-focus-role'>Vai trò: <strong>${S.fn.esc(S.fn.staffRoleName(S.state.store.role))}</strong></div><div class='task-focus-choices'>${S.fn.renderTaskFocusChoices(S.state.taskFocusRoute)}</div></form>`;
    S.fn.showModal('Chọn màn hình chính', '', body, `<button class='btn btn-primary' type='submit' form='task-focus-onboarding'>Tiếp tục</button>`, true);
  }


  S.fn.saveTaskFocusSelection = function saveTaskFocusSelection(form) {
    const route = String(new FormData(form).get('taskFocusRoute') || '');
    if (!S.fn.saveTaskFocusRoute(route)) return S.fn.toast('Hãy chọn công việc', 'Chọn vai trò phù hợp với quyền tài khoản của bạn.', 'error');
    if (!S.dom.modal.contains(form)) {
      delete form.dataset.dirty;
      S.fn.renderShell();
      S.fn.toast('Đã lưu màn hình mở đầu', 'Lần mở tiếp theo sẽ vào ' + (S.fn.taskFocusOptions().find(item => item.route === route)?.label || 'màn hình đã chọn') + '.');
      return;
    }
    S.fn.closeModal(true);
    S.fn.renderShell();
    S.fn.routeTo(route);
    S.fn.scheduleInitialGuidedTour();
  }


  S.fn.starterGuideSteps = function starterGuideSteps() {
    if (S.state.store.role === 'cashier') return {
      title: 'Bán hàng',
      intro: S.state.inventorySummary.total > 0 ? 'Tìm hoặc quét mã hàng, kiểm tra giỏ rồi thanh toán.' : 'Chưa có mặt hàng để bán. Báo chủ cửa hàng thêm hàng trước nhé.',
      steps: S.state.inventorySummary.total > 0 ? [
        { title: 'Tìm hoặc chọn hàng', detail: 'Chạm vào hàng để thêm vào đơn.', route: 'pos' },
        { title: 'Kiểm tra giỏ hàng', detail: 'Xem số lượng và số tiền cần thu.', route: 'pos' },
        { title: 'Thanh toán', detail: 'Chọn cách khách trả tiền rồi xác nhận.', route: 'pos' },
      ] : [{ title: 'Mở màn hình bán hàng', detail: 'Sau khi có mặt hàng, bạn có thể bắt đầu ngay.', route: 'pos' }],
    };
    if (S.state.store.role === 'stockkeeper') return {
      title: 'Bắt đầu với kho hàng',
      intro: S.state.inventorySummary.total > 0 ? 'Kho chính được chọn sẵn; chỉ đổi kho khi cần.' : 'Chủ cửa hàng cần thêm danh sách mặt hàng trước.',
      steps: S.state.inventorySummary.total > 0 ? [
        { title: 'Nhập hàng đã nhận', detail: 'Ghi số lượng thực nhận vào kho đang chọn.', action: 'receive-stock' },
        { title: 'Kiểm tra số lượng', detail: 'Tìm mặt hàng và xem số đang có.', route: 'inventory' },
      ] : [{ title: 'Mở kho hàng', detail: 'Xem các mặt hàng sau khi chủ cửa hàng thêm vào.', route: 'inventory' }],
    };
    if (S.state.store.role === 'accountant') return {
      title: 'Xem sổ và báo cáo',
      intro: 'Các số liệu sẽ hiện sau khi cửa hàng ghi nhận giao dịch.',
      steps: [
        { title: 'Xem thu chi', detail: 'Kiểm tra tiền đã ghi trong sổ.', route: 'finance' },
        { title: 'Xem báo cáo', detail: 'Theo dõi doanh thu và công nợ.', route: 'reports' },
      ],
    };

    const guides = {
      retail: {
        title: 'Bán tại cửa hàng', intro: 'Thêm hàng, nhập số lượng đang có rồi bắt đầu bán.', steps: [
          { title: 'Thêm mặt hàng', detail: 'Ghi tên và giá bán.', action: 'new-product', route: 'products' },
          { title: 'Ghi số lượng đang có', detail: 'Kho chính được chọn sẵn.', action: 'receive-stock', route: 'inventory' },
          { title: 'Bán hàng', detail: 'Quét mã hoặc chạm vào mặt hàng.', route: 'pos' },
        ],
      },
      online: {
        title: 'Bán hàng online', intro: 'Ghi đơn online cùng danh sách hàng của cửa hàng.', note: 'Đơn online hiện chưa tự lấy từ sàn; cần ghi nhận thủ công.', steps: [
          { title: 'Thêm mặt hàng', detail: 'Ghi tên, giá và mã hàng nếu có.', action: 'new-product', route: 'products' },
          { title: 'Khai báo gian hàng', detail: 'Nối mã hàng trên kênh với hàng trong Slink.', route: 'channels' },
          { title: 'Ghi nhận đơn online', detail: 'Kho chính được chọn sẵn; đổi kho khi cần.', route: 'channels' },
        ],
      },
      warehouse: {
        title: 'Quản lý nhiều kho', intro: 'Ghi mặt hàng và nhận hàng vào đúng nơi.', steps: [
          { title: 'Thêm mặt hàng', detail: 'Ghi tên và giá bán.', action: 'new-product', route: 'products' },
          { title: 'Nhập hàng', detail: 'Kho chính được chọn sẵn; đổi kho nếu chuyến hàng về nơi khác.', action: 'receive-stock', route: 'inventory' },
          { title: 'Xem hàng từng kho', detail: 'Chuyển hàng giữa các kho khi cần.', route: 'inventory' },
        ],
      },
      large_business: {
        title: 'Cửa hàng có nhiều nhân viên', intro: 'Chia quyền theo công việc; mỗi người dùng tài khoản riêng.', steps: [
          { title: 'Thêm mặt hàng', detail: 'Ghi tên, giá và số lượng ban đầu.', action: 'new-product', route: 'products' },
          { title: 'Mời nhân viên', detail: 'Chọn quyền phù hợp với công việc.', route: 'staff' },
          { title: 'Xem báo cáo', detail: 'Kiểm tra doanh thu và công nợ.', route: 'reports' },
        ],
      },
      unsure: {
        title: 'Bắt đầu với những việc cơ bản', intro: 'Bạn có thể bắt đầu ngay; lựa chọn này đổi được trong Cài đặt.', steps: [
          { title: 'Thêm mặt hàng', detail: 'Ghi tên và giá bán.', action: 'new-product', route: 'products' },
          { title: 'Ghi số lượng đang có', detail: 'Kho chính được chọn sẵn.', action: 'receive-stock', route: 'inventory' },
          { title: 'Bán hàng', detail: 'Quét mã hoặc chạm vào mặt hàng.', route: 'pos' },
        ],
      },
    };
    return guides[S.state.store.businessProfile] || guides.unsure;
  }


  S.fn.guidedTourSteps = function guidedTourSteps() {
    const steps = [];
    const add = (route, target, title, detail) => {
      if (S.fn.canAccessRoute(route) && S.fn.isProfileRouteEnabled(route)) steps.push({ route, target, title, detail });
    };
    if (S.fn.canAccessRoute('pos') && S.state.page !== 'pos') {
      steps.push({ route: S.state.page, target: 'topbar-pos', title: 'Bán hàng tại quầy', detail: 'Bấm nút Bán hàng ở góc trên bất kỳ lúc nào để mở màn hình thu ngân.' });
    }
    if (S.fn.canAccessRoute('pos')) {
      add('pos', 'pos-search', 'Tìm hàng & quét mã vạch', 'Gõ tên/mã hàng, dùng máy tít hoặc bấm biểu tượng quét camera để thêm ngay vào đơn.');
      add('pos', 'pos-cart', 'Tại quầy & Giao hàng', 'Chuyển nhanh giữa bán tại quầy (hỗ trợ nhiều hóa đơn song song, ghi nợ) và đơn giao vận.');
    }
    if (S.fn.hasPerm('editProducts')) {
      add('products', 'products-add', 'Thêm hàng & in tem mã vạch', 'Tạo sản phẩm mới, thêm nhiều mã vạch cùng loại và in tem ngay tại đây.');
    }
    if (S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports')) {
      add('finance', 'finance-income', 'Thu chi & công nợ', 'Ghi phiếu thu chi, mở ca tiền mặt và theo dõi công nợ khách hàng / nhà cung cấp.');
    }
    steps.push({ route: S.state.page, target: 'settings-gear', title: 'Cài đặt cửa hàng', detail: 'Thiết lập thông tin cửa hàng, máy in, loa đọc tiền và tài khoản ngân hàng.' });
    return S.state.cart.length ? steps.filter(step => step.route === S.state.page) : steps;
  }


  S.fn.guidedTourStorageKey = function guidedTourStorageKey() {
    const userId = S.state.authSession && S.state.authSession.user && S.state.authSession.user.id;
    return userId && S.state.store.id ? `slink-guided-tour-v1:${encodeURIComponent(userId)}:${encodeURIComponent(S.state.store.id)}` : '';
  }


  S.fn.guidedTourWasSeen = function guidedTourWasSeen() {
    const key = S.fn.guidedTourStorageKey();
    if (!key) return false;
    if (S.state.guidedTourSeenInSessionKey === key) return true;
    try { return window.localStorage.getItem(key) === 'done'; } catch (error) { return false; }
  }


  S.fn.scheduleInitialGuidedTour = function scheduleInitialGuidedTour() {
    // Keep initial mobile/desktop screens uncluttered; tour remains accessible via Help or Settings.
  }


  S.fn.resolveGuidedTourTarget = function resolveGuidedTourTarget(step) {
    const selectors = {
      'topbar-pos': '#topbar-pos-cta, [data-route="pos"]',
      'dashboard-revenue': '[data-tour-target="dashboard-revenue"]',
      'dashboard-actions': '[data-tour-target="dashboard-actions"]',
      'products-add': '[data-tour-target="products-add"], #view [data-action="new-product"]',
      'inventory-receive': '[data-tour-target="inventory-receive"]',
      'inventory-search': '[data-tour-target="inventory-search"]',
      'inventory-warehouse': '#inventory-warehouse',
      'pos-search': '[data-tour-target="pos-search"]',
      'pos-products': '#pos-products',
      'orders-search': '#order-search',
      'customers-search': '#customer-search',
      'finance-income': "[data-action='new-expense'][data-direction='in'], [data-tour-target='finance-register']",
      'finance-book': '[data-tour-target="finance-register"]',
      'settings-gear': ".topbar [aria-label='Cài đặt'], [data-action='account-settings'], #primary-nav [data-route='settings']",
      'pos-cart': '[data-tour-target="pos-cart-desktop"], [data-tour-target="pos-cart-mobile"]',
      'finance-register': '[data-tour-target="finance-register"]',
      'reports-summary': '[data-tour-target="reports-summary"]',
      'channels-profiles': '[data-tour-target="channels-profiles"]',
      'channels-orders': '[data-tour-target="channels-orders"]',
      'staff-invite': '[data-tour-target="staff-invite"]',
    };
    return Array.from(document.querySelectorAll(selectors[step.target] || ':not(*)')).find(node => {
      const rect = node.getBoundingClientRect();
      return !node.closest('[inert]') && rect.width > 0 && rect.height > 0 && rect.left < innerWidth && rect.right > 0;
    });
  }


  S.fn.positionGuidedTour = function positionGuidedTour() {
    if (!S.state.guidedTourState.active || !S.state.guidedTourState.layer) return;
    const step = S.state.guidedTourState.steps[S.state.guidedTourState.index], target = step && S.fn.resolveGuidedTourTarget(step);
    const spotlight = S.state.guidedTourState.layer.querySelector('.guided-tour-spotlight'), card = S.state.guidedTourState.layer.querySelector('.guided-tour-card');
    if (!target || !spotlight || !card) return;
    const rect = target.getBoundingClientRect(), height = card.offsetHeight;
    if (!rect.width || !rect.height) return;
    const margin = 12, width = Math.min(340, innerWidth - margin * 2), viewHeight = window.visualViewport?.height || innerHeight;
    let top = rect.bottom + 14;
    if (top + height > viewHeight - margin) top = rect.top - height - 14;
    spotlight.style.cssText = `left:${Math.max(2, rect.left - 6)}px;top:${Math.max(2, rect.top - 6)}px;width:${Math.min(innerWidth - 4, rect.width + 12)}px;height:${Math.min(viewHeight - 4, rect.height + 12)}px;opacity:1`;
    card.style.left = Math.max(margin, Math.min(rect.left, innerWidth - width - margin)) + 'px';
    card.style.top = Math.max(margin, Math.min(top, viewHeight - height - margin)) + 'px';
    card.style.opacity = '1';
  }


  S.fn.cancelGuidedTourWait = function cancelGuidedTourWait() {
    S.state.guidedTourState.waiter?.disconnect(); S.state.guidedTourState.waiter = null;
    window.clearTimeout(S.state.guidedTourState.waitTimer);
    if (S.state.guidedTourState.waitFrame) cancelAnimationFrame(S.state.guidedTourState.waitFrame);
  }

  S.fn.showGuidedTourStep = function showGuidedTourStep() {
    if (!S.state.guidedTourState.active) return;
    S.fn.cancelGuidedTourWait();
    const step = S.state.guidedTourState.steps[S.state.guidedTourState.index];
    if (!step) return S.fn.finishGuidedTour(true);
    const token = (S.state.guidedTourState.generation || 0) + 1;
    S.state.guidedTourState.generation = token;
    const card = S.state.guidedTourState.layer.querySelector('.guided-tour-card');
    const first = S.state.guidedTourState.index === 0;
    const last = S.state.guidedTourState.index === S.state.guidedTourState.steps.length - 1;
    card.style.width = 'min(340px, calc(100vw - 24px))';
    card.innerHTML = `<div class='guided-tour-progress'>Bước ${S.fn.number(S.state.guidedTourState.index + 1)} / ${S.fn.number(S.state.guidedTourState.steps.length)}</div><h2 id='guided-tour-title'>${S.fn.esc(step.title)}</h2><p id='guided-tour-detail'>${S.fn.esc(step.detail)}</p><div class='guided-tour-actions'><button class='guided-tour-skip' type='button' data-action='guided-tour-skip'>Bỏ qua</button><div style='display:flex;gap:8px'>${!first ? `<button class='btn btn-secondary' type='button' data-action='guided-tour-prev'>Quay lại</button>` : ''}<button class='btn btn-primary' type='button' data-action='guided-tour-next' disabled>${last ? 'Bắt đầu' : 'Tiếp theo'}</button></div></div>`;
    const place = () => {
      if (!S.state.guidedTourState.active || S.state.guidedTourState.generation !== token) return false;
      const target = S.fn.resolveGuidedTourTarget(step);
      if (!target || !target.getClientRects().length) return false;
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      S.fn.cancelGuidedTourWait();
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'center', inline: 'nearest' });
      S.state.guidedTourState.waitFrame = requestAnimationFrame(() => {
        if (!S.state.guidedTourState.active || S.state.guidedTourState.generation !== token) return;
        S.fn.positionGuidedTour();
        const next = card.querySelector('[data-action="guided-tour-next"]');
        if (next) { next.disabled = false; next.focus({ preventScroll: true }); }
      });
      return true;
    };
    if (S.state.page !== step.route) S.fn.routeTo(step.route);
    if (place()) return;
    S.state.guidedTourState.waiter = new MutationObserver(() => {
      if (S.state.guidedTourState.waitFrame) cancelAnimationFrame(S.state.guidedTourState.waitFrame);
      S.state.guidedTourState.waitFrame = requestAnimationFrame(place);
    });
    S.state.guidedTourState.waiter.observe(S.dom.root, { childList: true, subtree: true });
    S.state.guidedTourState.waitTimer = setTimeout(() => {
      if (!S.state.guidedTourState.active || S.state.guidedTourState.generation !== token) return;
      S.state.guidedTourState.index++;
      S.fn.showGuidedTourStep();
    }, 850);
  }


  S.fn.finishGuidedTour = function finishGuidedTour(markSeen) {
    if (!S.state.guidedTourState.active) return;
    S.fn.cancelGuidedTourWait();
    const key = S.fn.guidedTourStorageKey();
    if (markSeen && key) {
      S.state.guidedTourSeenInSessionKey = key;
      try { window.localStorage.setItem(key, 'done'); } catch (error) { /* Keep this browser session from reopening the tour. */ }
    }
    const returnPage = S.state.guidedTourState.returnPage;
    const focus = S.state.guidedTourState.lastFocused;
    S.state.guidedTourState.active = false;
    if (S.state.guidedTourState.layer) S.state.guidedTourState.layer.remove();
    S.state.guidedTourState.layer = null;
    if (returnPage && S.state.page !== returnPage) S.fn.routeTo(returnPage);
    if (focus && focus.isConnected) window.setTimeout(function () { focus.focus({ preventScroll: true }); }, 60);
  }


  S.fn.startGuidedTour = function startGuidedTour(force) {
    if (!S.state.authSession || !S.state.store.id || (!force && S.fn.guidedTourWasSeen())) return;
    const steps = S.fn.guidedTourSteps();
    if (!steps.length) return;
    if (!S.dom.modal.hidden || S.state.activeWrites) return S.fn.toast('Giữ nội dung đang nhập', 'Đóng khung đang dùng rồi mở hướng dẫn.');
    S.state.guidedTourState = { active: true, steps, index: 0, returnPage: S.state.page || 'dashboard', layer: null, lastFocused: document.activeElement };
    const layer = document.createElement('div');
    layer.className = 'guided-tour-layer';
    layer.innerHTML = `<div class='guided-tour-shade' aria-hidden='true'></div><div class='guided-tour-spotlight' aria-hidden='true'></div><section class='guided-tour-card' role='dialog' aria-modal='true' aria-labelledby='guided-tour-title' aria-describedby='guided-tour-detail'></section>`;
    document.body.appendChild(layer);
    S.state.guidedTourState.layer = layer;
    S.fn.showGuidedTourStep(0);
  }


  S.fn.guidedTourKeydown = function guidedTourKeydown(event) {
    if (!S.state.guidedTourState.active || !S.state.guidedTourState.layer) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      S.fn.finishGuidedTour(true);
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = Array.from(S.state.guidedTourState.layer.querySelectorAll('button:not([disabled])'));
    if (!buttons.length) return;
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }


  S.fn.guidedTourViewportChanged = function guidedTourViewportChanged() {
    if (!S.state.guidedTourState.active || S.state.guidedTourPositionFrame) return;
    S.state.guidedTourPositionFrame = window.requestAnimationFrame(function () {
      S.state.guidedTourPositionFrame = 0;
      S.fn.positionGuidedTour();
    });
  }


  S.fn.renderAuth = function renderAuth(message, tone, verificationUrl) {
    let title = 'Đăng nhập';
    let subtitle = '';
    let body = '';
    if (S.state.authMode === 'invite-confirm' && S.state.invitationInfo) {
      title = 'Xác nhận tham gia cửa hàng';
      subtitle = `Bạn được mời vào ${S.state.invitationInfo.storeName} với vai trò ${S.fn.staffRoleName(S.state.invitationInfo.role)}.`;
      body = `<form class='auth-form' data-auth-form='invite-accept'><p class='muted'>Lời mời dành cho ${S.fn.esc(S.state.invitationInfo.email)}.</p><button class='btn btn-primary auth-submit' type='submit'>Tham gia cửa hàng</button></form><button class='auth-switch' type='button' data-action='leave-invitation'>Để sau</button>`;
    } else if (S.state.authMode === 'invite-register') {
      title = 'Tham gia cửa hàng';
      subtitle = S.state.invitationInfo ? `${S.state.invitationInfo.storeName} · ${S.fn.staffRoleName(S.state.invitationInfo.role)}` : '';
      body = `<form class='auth-form' data-auth-form='invite-register'><div class='form-field'><label class='input-label' for='auth-name'>Tên của bạn</label><input class='input' id='auth-name' name='displayName' autocomplete='name' required minlength='2' maxlength='120'/></div><div class='form-field'><label class='input-label' for='auth-email'>Email được mời</label><input class='input' id='auth-email' name='email' type='email' value='${S.fn.esc(S.state.invitationInfo ? S.state.invitationInfo.email : '')}' readonly/></div>${S.fn.authPasswordField('auth-password', 'password', 'Mật khẩu (tối thiểu 12 ký tự)', 'new-password')}${S.fn.authPasswordField('auth-password-confirm', 'passwordConfirm', 'Nhập lại mật khẩu', 'new-password', 'auth-password')}<button class='btn btn-primary auth-submit' type='submit'>Tạo tài khoản và tham gia</button></form><button class='auth-switch' type='button' data-action='auth-mode' data-mode='invite-login'>Đã có tài khoản? Đăng nhập</button>`;
    } else if (S.state.authMode === 'register') {
      title = 'Tạo cửa hàng';
      subtitle = '';
      body = `<form class='auth-form' data-auth-form='register'><input type='hidden' name='workspaceMode' value='shop'/><div class='form-field'><label class='input-label' for='auth-name'>Tên của bạn</label><input class='input' id='auth-name' name='displayName' autocomplete='name' required minlength='2' maxlength='120'/></div><div class='form-field' data-shop-registration><label class='input-label' for='auth-store'>Tên cửa hàng</label><input class='input' id='auth-store' name='storeName' autocomplete='organization' required minlength='2' maxlength='160'/></div><div class='form-field'><label class='input-label' for='auth-email'>Email</label><input class='input' id='auth-email' name='email' type='email' autocomplete='email' required maxlength='254'/></div>${S.fn.authPasswordField('auth-password', 'password', 'Mật khẩu (tối thiểu 12 ký tự)', 'new-password')}${S.fn.authPasswordField('auth-password-confirm', 'passwordConfirm', 'Nhập lại mật khẩu', 'new-password', 'auth-password')}<button class='btn btn-primary auth-submit' type='submit'>Tạo tài khoản</button></form>`;
    } else if (S.state.authMode === 'resend') {
      title = 'Gửi lại email xác nhận';
      subtitle = 'Nhập email đã đăng ký Slink.';
      body = `<form class='auth-form' data-auth-form='resend'><div class='form-field'><label class='input-label' for='auth-email'>Email</label><input class='input' id='auth-email' name='email' type='email' autocomplete='email' required maxlength='254'/></div><button class='btn btn-primary auth-submit' type='submit'>Gửi liên kết mới</button></form><button class='auth-switch' type='button' data-action='auth-mode' data-mode='login'>Quay lại đăng nhập</button>`;
    } else if (S.state.authMode === 'reset') {
      title = 'Đặt lại mật khẩu';
      subtitle = 'Nhập email đã đăng ký để nhận liên kết đặt lại.';
      body = `<form class='auth-form' data-auth-form='reset'><div class='form-field'><label class='input-label' for='auth-email'>Email</label><input class='input' id='auth-email' name='email' type='email' autocomplete='email' required maxlength='254'/></div><button class='btn btn-primary auth-submit' type='submit'>Gửi liên kết đặt lại</button></form><button class='auth-switch' type='button' data-action='auth-mode' data-mode='login'>Quay lại đăng nhập</button>`;
    } else if (S.state.authMode === 'reset-complete') {
      title = 'Tạo mật khẩu mới';
      subtitle = '';
      const resetToken = new URLSearchParams(window.location.hash.slice(1)).get('reset') || '';
      body = resetToken ? `<form class='auth-form' data-auth-form='reset-complete'><input type='hidden' name='token' value='${S.fn.esc(resetToken)}'/>${S.fn.authPasswordField('auth-password', 'password', 'Mật khẩu mới (tối thiểu 12 ký tự)', 'new-password')}${S.fn.authPasswordField('auth-password-confirm', 'passwordConfirm', 'Nhập lại mật khẩu', 'new-password', 'auth-password')}<button class='btn btn-primary auth-submit' type='submit'>Cập nhật mật khẩu</button></form>` : `<div class='auth-message error'>Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.</div>`;
      body += `<button class='auth-switch' type='button' data-action='auth-mode' data-mode='login'>Quay lại đăng nhập</button>`;
    } else {
      const invited = S.state.authMode === 'invite-login' && S.state.invitationInfo;
      if (invited) { title = 'Đăng nhập để tham gia'; subtitle = `${S.state.invitationInfo.storeName} · ${S.fn.staffRoleName(S.state.invitationInfo.role)}`; }
      body = `<form class='auth-form' data-auth-form='login'><div class='form-field'><label class='input-label' for='auth-email'>Email</label><input class='input' id='auth-email' name='email' type='email' autocomplete='username' value='${S.fn.esc(invited ? S.state.invitationInfo.email : '')}' required maxlength='254'/></div>${S.fn.authPasswordField('auth-password', 'password', 'Mật khẩu', 'current-password')}<button class='btn btn-primary auth-submit' type='submit'>${invited ? 'Đăng nhập và tham gia' : 'Đăng nhập'}</button></form><div class='auth-secondary-links'>${invited ? `<button class='link-button' type='button' data-action='auth-mode' data-mode='invite-register'>Tạo tài khoản mới</button><button class='link-button' type='button' data-action='auth-mode' data-mode='resend'>Gửi lại xác nhận</button>` : `<button class='link-button' type='button' data-action='auth-mode' data-mode='reset'>Quên mật khẩu?</button><button class='link-button' type='button' data-action='auth-mode' data-mode='resend'>Gửi lại xác nhận</button>`}</div>`;
    }
    let htmlMessage = message ? S.fn.esc(message) : '';
    if (verificationUrl) htmlMessage += `<br/><a href='${S.fn.esc(verificationUrl)}'>${S.state.authMode === 'reset' ? 'Mở liên kết đặt lại mật khẩu' : 'Xác nhận email và kích hoạt cửa hàng'}</a>`;
    S.fn.authCard(title, subtitle, body, htmlMessage, tone);
  }


  S.fn.showSignedOut = function showSignedOut(message, tone) {
    S.state.offlineSender?.close(); S.state.offlineSender = null; S.state.offlineSenderScope = ''; S.state.offlineState.pending = 0; S.state.offlineState.conflicts = 0; S.state.offlineState.issue = ''; S.state.cartDraftReady = '';
    if (S.state.offlineDisk) S.state.offlineDisk.removeMeta('active-user').catch(function () {});
    S.fn.closeModal();
    S.state.taskFocusRoute = '';
    S.state.channelState.requestNumber += 1;
    S.state.channelState = { profiles: [], mappings: [], total: 0, nextOffset: null, offset: 0, query: '', state: 'active', view: 'mappings', orders: [], orderTotal: 0, orderOffset: 0, orderNextOffset: null, orderStatus: '', orderQuery: '', orderLoading: false, orderError: '', orderRequestNumber: S.state.channelState.orderRequestNumber, loading: false, error: '', requestNumber: S.state.channelState.requestNumber };
    S.state.channelProductRequestNumber += 1;
    S.state.customerTagFilter = '';
    S.state.customerSegmentFilter = '';
    S.state.customerMinSpentVnd = '';
    S.state.customerAdvancedOpen = false;
    S.state.staffExpandedIds = new Set();
    S.state.customerSavedSegments = [];
    S.state.customerSavedSegmentsStoreId = '';
    S.state.selectedCustomerSavedSegmentId = '';
    S.state.customerListLoaded = false;
    S.state.orderNoteHistoryCache.clear();
    S.state.orderNoteHistoryCursor.clear();
    S.state.orderNoteHistoryLoading.clear();
    S.state.auditState.requestNumber += 1;
    S.state.auditState = { events: [], total: 0, nextOffset: null, offset: 0, limit: 50, loading: false, error: '', requestNumber: S.state.auditState.requestNumber, filters: { from: '', to: '', q: '' } };
    S.state.promotionsState = { rows: [], loading: false, error: '', requestNumber: (S.state.promotionsState?.requestNumber || 0) + 1 };
    S.state.accountSecurityState.requestNumber += 1;
    S.state.accountSecurityState = { sessions: [], events: [], loading: false, error: '', requestNumber: S.state.accountSecurityState.requestNumber };
    S.fn.resetPosCatalog();
    S.state.cart = [];
    S.state.cartCustomerId = '';
    S.state.posStandardMethod = 'cash';
    S.state.posStandardNote = '';
    S.state.posBills = [{ id: 1, label: 'Đơn 1', items: [], discount: 0, customerId: '', note: '', method: 'cash' }];
    S.state.activePosBillId = 1;
    S.state.nextPosBillNumber = 2;
    S.state.posDelivery = { receiverName: '', receiverPhone: '', address: '', carrier: '', collection: 'cod', note: '' };
    S.state.posFastCashInput = '';
    S.state.posBarcodeScanState = { continuous: false, lastCode: '', lastAt: 0, busy: false };
    S.state.integrationState.data = null;
    S.state.integrationState.loading = false;
    S.state.integrationState.error = '';
    S.state.integrationState.storeId = '';
    S.state.inventoryProducts = [];
    S.state.lastImportedPrintItems = [];
    S.state.productImportSourceRows = [];
    S.state.authSession = null;
    S.state.store = S.fn.emptyStore();
    S.state.dashboardState = { data: null, loading: false, error: '', fallback: false, loadedAt: 0 };
    S.state.posCatalogStale = false;
    if (window.SlinkSyncBus) window.SlinkSyncBus.setContext({ storeId: '', userId: '' });
    S.state.page = 'products';
    S.state.authMode = 'login';
    S.state.pendingCompatibilityStoreId = '';
    S.state.pendingCompatibilitySaveBlocked = false;
    if (S.dom.pendingCompatibilityWarning) S.dom.pendingCompatibilityWarning.hidden = true;
    S.fn.renderAuth(message, tone);
  }


  S.state.affiliateState = { links: [], total: 0, nextOffset: null, loading: false, error: '' };


  S.fn.enterAffiliate = async function enterAffiliate(session) {
    S.state.offlineState.pending = 0; S.state.offlineState.conflicts = 0; S.state.offlineState.issue = '';
    S.state.authSession = { user: session.user, stores: session.stores || [] };
    S.state.store = S.fn.emptyStore(); S.state.store.role = 'affiliate'; S.state.store.permissions = {}; S.state.store.effectivePermissions = S.fn.resolveEffectivePermissions('affiliate', null, null); S.state.store.settings.storeName = 'Không gian Affiliate';
    S.state.dashboardState = { data: null, loading: false, error: '', fallback: false, loadedAt: 0 };
    S.state.posCatalogStale = false;
    if (window.SlinkSyncBus) window.SlinkSyncBus.setContext({ storeId: '', userId: session?.user?.id || '' });
    S.state.cart = []; S.state.cartCustomerId = ''; S.state.posStandardMethod = 'cash'; S.state.posStandardNote = '';
    S.state.posBills = [{ id: 1, label: 'Đơn 1', items: [], discount: 0, customerId: '', note: '', method: 'cash' }];
    S.state.activePosBillId = 1; S.state.nextPosBillNumber = 2;
    S.state.posDelivery = { receiverName: '', receiverPhone: '', address: '', carrier: '', collection: 'cod', note: '' };
    S.state.posFastCashInput = ''; S.state.posBarcodeScanState = { continuous: true, lastCode: '', lastAt: 0, busy: false };
    S.state.integrationState.data = null; S.state.integrationState.storeId = '';
    S.state.productCache.clear(); S.state.customerCache.clear(); S.state.lastCompletedSale = null;
    S.state.affiliateState = { links: [], total: 0, nextOffset: null, loading: false, error: '' };
    S.state.page = 'affiliate'; S.dom.authRoot.hidden = true; S.dom.appShell.hidden = false; S.fn.closeModal(true); S.fn.render();
    await S.fn.loadAffiliateLinks(0);
  }


  S.fn.loadAffiliateLinks = async function loadAffiliateLinks(offset) {
    const session = S.state.authSession;
    S.state.affiliateState.loading = true; S.state.affiliateState.error = ''; S.fn.render();
    try {
      const result = await S.fn.apiRequest('/api/affiliate/links?offset=' + (offset || 0));
      if (S.state.authSession !== session || S.state.store.role !== 'affiliate') return;
      S.state.affiliateState.links = offset ? S.state.affiliateState.links.concat(result.links) : result.links;
      S.state.affiliateState.total = result.total; S.state.affiliateState.nextOffset = result.nextOffset;
    } catch (error) {
      if (S.state.authSession !== session) return;
      if (error.status === 401) return S.fn.showSignedOut('Đăng nhập lại để xem link của bạn.', 'error');
      S.state.affiliateState.error = error.message;
    } finally { if (S.state.authSession === session) { S.state.affiliateState.loading = false; S.fn.render(); } }
  }


  S.fn.renderAffiliate = function renderAffiliate() {
    const cards = S.state.affiliateState.links.map(function (link) {
      return "<article class='affiliate-link' role='listitem'><span class='platform-tag'>" + (link.platform === 'tiktok' ? 'TikTok Shop' : 'Shopee') + "</span><div class='affiliate-link-main'><strong>" + S.fn.esc(link.title) + "</strong><p>" + S.fn.esc(link.affiliate_url) + "</p></div><div class='affiliate-link-actions'><button class='btn btn-primary' data-action='copy-affiliate-link' data-id='" + link.id + "'>Sao chép link</button><button class='link-button' data-action='edit-affiliate-link' data-id='" + link.id + "'>Sửa tên</button></div></article>";
    }).join('');
    return S.fn.pageHeading('Affiliate', '', "<button class='btn btn-primary' data-action='new-affiliate-link'>＋ Lưu link</button>") +
      "<p class='affiliate-intro'>Lưu link tiếp thị do sàn cấp, rồi sao chép khi đăng nội dung. Bạn không cần tạo cửa hàng hay quản lý kho.</p>" +
      (S.state.affiliateState.error ? "<div class='auth-message error' role='alert'>" + S.fn.esc(S.state.affiliateState.error) + "<button class='link-button' data-action='reload-affiliate'>Thử lại</button></div>" : '') +
      "<section class='affiliate-links' role='list' aria-label='Link của tôi'>" + (cards || "<div class='empty-state' role='listitem'><strong>Link của bạn ở đây</strong><span>Đã có link từ TikTok Shop hoặc Shopee? Dán vào là lưu được.</span><button class='btn btn-primary' data-action='new-affiliate-link'>Lưu link đầu tiên</button></div>") + "</section>" +
      (S.state.affiliateState.loading ? "<p role='status'>Đang tải link…</p>" : '') +
      (S.state.affiliateState.nextOffset !== null ? "<button class='btn btn-secondary' data-action='more-affiliate-links'>Xem thêm</button>" : '') +
      "<details class='work-details'><summary>Trạng thái kết nối</summary><div class='affiliate-connection-note'><strong>Chưa kết nối</strong><p>Xin lỗi, dịch vụ này hiện chưa được kết nối với nhà cung cấp.</p></div></details>";
  }


  S.fn.openAffiliateLink = function openAffiliateLink(id) {
    const link = id && S.state.affiliateState.links.find(function (item) { return item.id === id; });
    if (id && !link) return;
    const body = "<form id='entity-form' data-form='affiliate-link' data-id='" + (link?.id || '') + "' data-version='" + (link?.version || '') + "'><div class='form-grid'>" + (link ? '' : "<label class='form-field full'><span class='input-label'>Link tiếp thị *</span><input class='input' name='url' type='url' required maxlength='2048' placeholder='Dán link TikTok Shop hoặc Shopee'/></label>") + "<label class='form-field full'><span class='input-label'>Tên gợi nhớ (không bắt buộc)</span><input class='input' name='title' maxlength='240' value='" + S.fn.esc(link?.title || '') + "' placeholder='Ví dụ: Sản phẩm trong video hôm nay'/></label></div><div class='auth-message error' data-affiliate-error role='alert' hidden></div></form>";
    S.fn.showModal(link ? 'Sửa tên link' : 'Lưu link của bạn', link ? '' : 'Dùng link tiếp thị được cấp trong tài khoản sàn của bạn.', body, "<button class='btn btn-primary' type='submit' form='entity-form'>Lưu link</button>");
  }


  S.fn.saveAffiliateLink = async function saveAffiliateLink(form) {
    if (form.dataset.saving === 'true') return;
    const session = S.state.authSession; const generation = S.state.modalGeneration; const data = new FormData(form);
    form.dataset.saving = 'true'; const button = S.dom.modal.querySelector('button[type="submit"]'); if (button) button.disabled = true;
    try {
      const id = form.dataset.id;
      const payload = id ? { title: String(data.get('title') || '').trim(), version: Number(form.dataset.version) } : { title: String(data.get('title') || '').trim(), url: String(data.get('url') || '').trim() };
      await S.fn.apiRequest('/api/affiliate/links' + (id ? '/' + encodeURIComponent(id) : ''), { method: id ? 'PUT' : 'POST', body: payload });
      if (S.state.authSession !== session) return;
      if (S.state.modalGeneration === generation) S.fn.closeModal();
      await S.fn.loadAffiliateLinks(0); S.fn.toast('Đã lưu link', 'Link được lưu trong tài khoản của bạn.');
    } catch (error) {
      if (S.state.authSession !== session) return;
      const feedback = form.querySelector('[data-affiliate-error]'); if (feedback) { feedback.hidden = false; feedback.textContent = error.message; }
    } finally { delete form.dataset.saving; if (button?.isConnected) button.disabled = false; }
  }


  S.fn.changeWorkspace = async function changeWorkspace(mode) {
    try { await S.fn.apiRequest('/api/account/workspace', { method: 'PUT', body: { mode: mode } }); await S.fn.enterStore(await S.fn.apiRequest('/api/auth/me')); }
    catch (error) { S.fn.toast('Chưa chuyển được khu làm việc', error.message, 'error'); }
  }


  S.fn.enterStore = async function enterStore(session, preferredStoreId) {
    S.state.cartDraftReady = '';
    if (session?.user?.workspaceMode === 'affiliate' && !session.stores?.length) {
      S.state.authSession = { user: session.user, stores: [] };
      S.state.store = S.fn.emptyStore();
      S.state.store.role = 'affiliate';
      S.state.page = 'workspace';
      S.dom.authRoot.hidden = true; S.dom.appShell.hidden = false;
      S.fn.render();
      return;
    }
    if (!session || !session.stores || !session.stores.length) {
      S.fn.showSignedOut('Tài khoản chưa có cửa hàng đang hoạt động. Hãy tạo tài khoản cửa hàng mới hoặc liên hệ quản lý.', 'error');
      return;
    }
    S.state.customerTagFilter = '';
    S.state.customerSegmentFilter = '';
    S.state.customerMinSpentVnd = '';
    S.state.customerSavedSegments = [];
    S.state.customerSavedSegmentsStoreId = '';
    S.state.selectedCustomerSavedSegmentId = '';
    S.state.customerListLoaded = false;
    S.state.orderNoteHistoryCache.clear();
    S.state.orderNoteHistoryCursor.clear();
    S.state.orderNoteHistoryLoading.clear();
    S.state.channelState.requestNumber += 1;
    S.state.channelState = { profiles: [], mappings: [], total: 0, nextOffset: null, offset: 0, query: '', state: 'active', view: 'mappings', orders: [], orderTotal: 0, orderOffset: 0, orderNextOffset: null, orderStatus: '', orderQuery: '', orderLoading: false, orderError: '', orderRequestNumber: S.state.channelState.orderRequestNumber, loading: false, error: '', requestNumber: S.state.channelState.requestNumber };
    S.state.channelProductRequestNumber += 1;
    S.state.inventoryRequestNumber += 1;
    S.state.analyticsRequestNumber += 1;
    S.state.financeRequestNumber += 1;
    S.state.inventorySummary = { total: 0, low: 0, out: 0, stockValueVnd: 0 };
    S.state.inventoryProducts = [];
    S.state.inventoryWarehouseId = null;
    S.state.inventoryStockFilter = 'all';
    S.state.inventoryLoadedFilter = 'all';
    S.state.inventoryLoadedQuery = '';
    S.state.inventoryError = '';
    S.state.staffRequestNumber += 1;
    S.state.staffState = { members: [], invitations: [], warehouses: [], loading: false, error: '' };
    S.state.financeSummary = { todayInVnd: '0', todayOutVnd: '0', customerDebtVnd: '0', customerDebtCount: 0, supplierPayableVnd: '0' };
    S.state.financeLoading = false;
    S.state.financeDataReady = false;
    S.state.financeTopCustomers = [];
    S.state.financeReceivables.requestNumber += 1;
    S.state.financeReceivables = { rows: [], total: 0, nextOffset: null, offset: 0, query: '', ready: false, loading: false, error: '', requestNumber: S.state.financeReceivables.requestNumber };
    S.state.financeCashbook.requestNumber += 1;
    S.state.financeCashbook = { rows: [], balances: null, total: 0, nextOffset: null, offset: 0, filters: { fund: 'all', direction: '', kind: '', includeInPnl: '', from: '', to: '', q: '' }, ready: false, loading: false, error: '', requestNumber: S.state.financeCashbook.requestNumber };
    S.state.financeCategories.requestNumber += 1;
    S.state.financeCategories = { rows: [], ready: false, loading: false, requestNumber: S.state.financeCategories.requestNumber };
    S.state.financePayables.requestNumber += 1;
    S.state.financePayables = { rows: [], total: 0, totalPayableVnd: '0', nextOffset: null, offset: 0, query: '', onlyOwing: true, ready: false, loading: false, error: '', requestNumber: S.state.financePayables.requestNumber };
    S.state.financeTab = 'cashbook';
    S.state.financeError = '';
    S.state.analyticsData = null;
    S.state.analyticsLoading = false;
    S.state.analyticsError = '';
    S.state.cashRegisterState = { session: null, lastClosed: null, recentClosed: [], canOperate: false };
    S.state.cashRegisterError = '';
    S.state.authSession = { user: session.user, stores: session.stores };
    S.state.auditState.requestNumber += 1;
    S.state.auditState = { events: [], total: 0, nextOffset: null, offset: 0, limit: 50, loading: false, error: '', requestNumber: S.state.auditState.requestNumber, filters: { from: '', to: '', q: '' } };
    S.state.promotionsState = { rows: [], loading: false, error: '', requestNumber: (S.state.promotionsState?.requestNumber || 0) + 1 };
    S.state.accountSecurityState.requestNumber += 1;
    S.state.accountSecurityState = { sessions: [], events: [], loading: false, error: '', requestNumber: S.state.accountSecurityState.requestNumber };
    S.state.checkoutIdempotencyKey = '';
    S.state.checkoutPendingPayload = null;
    S.state.cart = [];
    S.state.cartCustomerId = '';
    S.state.posStandardMethod = 'cash';
    S.state.posStandardNote = '';
    S.state.posBills = [{ id: 1, label: 'Đơn 1', items: [], discount: 0, customerId: '', note: '', method: 'cash' }];
    S.state.activePosBillId = 1;
    S.state.nextPosBillNumber = 2;
    S.state.posDelivery = { receiverName: '', receiverPhone: '', address: '', carrier: '', collection: 'cod', note: '' };
    S.state.posFastCashInput = '';
    S.state.inventoryTab = 'stock';
    S.state.supplierReturnsList = [];
    S.state.supplierReturnsLoading = false;
    S.state.supplierReturnsError = '';
    S.state.lastImportedPrintItems = [];
    S.state.offlineConflictInspections.clear();
    let rememberedStoreId = '';
    try { rememberedStoreId = sessionStorage.getItem('slink-current-store:' + session.user.id); } catch (error) { /* This tab can still use its first store. */ }
    const requestedStoreId = preferredStoreId || rememberedStoreId;
    const requestedStore = session.stores.find(item => item.id === requestedStoreId);
    const activeStore = requestedStore || session.stores[0];
    S.state.posMode = 'standard';
    if (preferredStoreId && requestedStore) {
      try { sessionStorage.setItem('slink-current-store:' + session.user.id, requestedStore.id); } catch (error) { /* Current selection still works. */ }
    }
    S.state.store = S.fn.emptyStore();
    S.state.store.id = activeStore.id;
    S.fn.resetPosCatalog();
    S.state.posCatalogStale = false;
    S.state.posSearchTerm = '';
    S.state.store.role = activeStore.role;
    S.state.store.permissions = activeStore.permissions || {};
    S.state.store.effectivePermissions = S.fn.resolveEffectivePermissions(activeStore.role, activeStore.permissions, activeStore.effectivePermissions);
    S.fn.scrubRestrictedState();
    S.state.dashboardState = { data: null, loading: false, error: '', fallback: false, loadedAt: 0 };
    if (window.SlinkSyncBus) window.SlinkSyncBus.setContext({ storeId: activeStore.id, userId: session.user.id });
    S.state.store.businessProfile = activeStore.business_profile || '';
    S.state.store.onboardingCompletedAt = activeStore.onboarding_completed_at || null;
    S.state.taskFocusRoute = S.fn.readTaskFocusRoute();
    S.fn.updatePendingCompatibilityWarning(S.state.store.id);
    const pendingSale = S.fn.canAccessRoute('pos') ? S.fn.loadPendingSale() : null;
    if (pendingSale && pendingSale.storeId === S.state.store.id) {
      S.state.checkoutIdempotencyKey = pendingSale.key;
      S.state.checkoutPendingPayload = pendingSale.payload;
    }
    S.state.store.settings.storeName = activeStore.name;
    S.state.store.settings.ownerName = session.user.displayName;
    S.state.store.settings.phone = activeStore.phone || '';
    S.state.store.settings.address = activeStore.address || '';
    S.state.store.settings.receiptFooter = activeStore.receipt_footer || '';
    S.state.store.settings.version = Number(activeStore.version) || 1;
    S.state.lastCompletedSale = null;
    S.state.selectedProductIds = new Set();
    S.state.productDetailState = null;
    S.state.promotionsState = { rows: [], loading: false, error: '', requestNumber: (S.state.promotionsState?.requestNumber || 0) + 1 };
    S.state.inventoryTab = 'stock';
    S.state.onboardingDismissed = false;
    S.state.warehouses = [];
    S.state.warehouseTransfers = [];
    S.state.selectedWarehouseId = '';
    S.state.warehouseLoading = false;
    S.state.warehouseError = '';
    S.state.integrationState.data = null;
    S.state.integrationState.loading = false;
    S.state.integrationState.error = '';
    S.state.integrationState.storeId = '';
    S.state.page = S.state.checkoutPendingPayload ? 'pos' : S.state.taskFocusRoute || (S.state.store.role === 'stockkeeper' ? 'inventory' : S.state.store.role === 'accountant' ? 'finance' : S.state.store.role === 'cashier' ? 'pos' : 'dashboard');
    S.dom.authRoot.hidden = true;
    S.dom.appShell.hidden = false;
    S.state.productLoading = S.state.page === 'pos';
    S.fn.render();
    if (S.state.page === 'pos') {
      S.fn.loadPosSellers();
      await S.fn.loadWarehouses({ includeTransfers: false, view: 'picker' });
      await S.fn.loadProductsPage('', 0);
    } else if (S.state.page === 'inventory') {
      await S.fn.loadWarehouses({ includeTransfers: false });
      await S.fn.loadInventoryPage('', 0);
    } else if (S.state.page === 'channels') {
      S.state.channelState.view = 'orders'; await Promise.all([S.fn.loadChannelCatalog(), S.fn.loadChannelOrders(0)]);
    } else if (S.state.page === 'finance') {
      await S.fn.loadFinancePage();
    } else if (S.state.page === 'dashboard') {
      if (typeof S.fn.loadDashboardPage === 'function') {
        await S.fn.loadDashboardPage();
      } else {
        const dashboardLoads = [S.fn.loadWarehouses({ includeTransfers: false }), S.fn.loadInventoryPage('', 0)];
        if (S.fn.hasPerm('viewReports')) dashboardLoads.push(S.fn.loadAnalytics(1));
        if (S.fn.hasPerm('viewOrders')) dashboardLoads.push(S.fn.loadOrdersPage('', 0));
        if (S.fn.hasPerm('viewFinance') || S.fn.hasPerm('recordCashbook')) dashboardLoads.push(S.fn.loadFinancePage());
        await Promise.all(dashboardLoads);
      }
    }
    if (['pos', 'orders', 'settings'].includes(S.state.page)) S.fn.loadIntegrationStatus();
    if (S.state.page === 'pos' && S.state.checkoutPendingPayload) {
      S.state.cart = S.state.checkoutPendingPayload.items.map(function (item) {
        return {
          id: item.productId,
          qty: item.quantity,
          unitPriceVnd: item.expectedUnitPriceVnd == null ? undefined : Number(item.expectedUnitPriceVnd),
          ...(Number(item.discountVnd) > 0 ? { discountVnd: Math.round(Number(item.discountVnd)) } : {}),
          ...(Array.isArray(item.serialCodes) && item.serialCodes.length ? { serialCodes: item.serialCodes.slice() } : {}),
        };
      });
      S.state.cartCustomerId = S.state.checkoutPendingPayload.customerId || '';
      S.state.cart.discount = S.state.checkoutPendingPayload.discountVnd || 0;
      if (S.state.cartCustomerId) await S.fn.loadCustomersPage('', 0);
    }
    await S.fn.restoreCartDraft();
    if (S.state.authSession) S.fn.render();
    if (requestedStoreId && !requestedStore) S.fn.toast('Cửa hàng trước không còn truy cập được', 'Bạn đang ở ' + activeStore.name + '.', 'error');
    if (S.state.store.role === 'owner' && !S.state.store.onboardingCompletedAt && !S.fn.businessProfileDeferred()) S.fn.openBusinessProfileOnboarding();
    else S.fn.scheduleInitialGuidedTour();
    await S.fn.offlineRowsChanged(false);
    S.fn.startOfflineSync();
    if (S.state.offlineState.mode === 'online' && !S.state.cachedBootScope) window.setTimeout(S.fn.prepareOfflineData, 3000);
  }


  S.fn.restoreSavedWorkspace = async function restoreSavedWorkspace() {
    if (!S.state.offlineDisk) return false;
    try {
      const userId = await S.state.offlineDisk.getMeta('active-user');
      const session = userId ? await S.state.offlineDisk.getMeta('session|' + userId) : null;
      if (!session?.user?.id || !session.stores?.length) return false;
      let selected = '';
      try { selected = sessionStorage.getItem('slink-current-store:' + userId) || ''; } catch (_) { /* Use the first authorized store. */ }
      const activeStore = session.stores.find(item => item.id === selected) || session.stores[0];
      const scope = S.state.offlineDisk.scopeKey(userId, activeStore.id);
      const snapshot = await S.state.offlineDisk.snapshot(scope);
      if (!snapshot.responses.length) return false;
      S.state.cachedBootScope = scope;
      S.state.cachedBootSnapshot = snapshot;
      S.state.offlineState.mode = navigator.onLine ? 'cached' : 'offline';
      S.state.offlineState.cachedAt = session.verifiedAt;
      try { await S.fn.enterStore(session); }
      finally { S.state.cachedBootScope = ''; S.state.cachedBootSnapshot = null; }
      S.fn.verifySavedWorkspace(S.state.authSession).catch(function (error) {
        if (S.state.authSession) { S.state.offlineState.issue = error.message; S.fn.updateOfflineStatus(); }
      });
      return true;
    } catch (error) {
      S.state.cachedBootScope = ''; S.state.cachedBootSnapshot = null;
      return false;
    }
  }


  S.fn.verifySavedWorkspace = async function verifySavedWorkspace(session) {
    if (!navigator.onLine || !session) return;
    try {
      const current = await S.fn.networkRequest('/api/auth/me');
      if (S.state.authSession !== session) return;
      const membership = current.stores.find(item => item.id === S.state.store.id);
      if (current.user.id !== session.user.id || !membership || membership.role !== S.state.store.role) {
        S.fn.showSignedOut('Quyền hoặc tài khoản đã thay đổi. Đăng nhập lại để tiếp tục.', 'error');
        return;
      }
      S.state.store.permissions = membership.permissions || {};
      S.state.store.effectivePermissions = S.fn.resolveEffectivePermissions(membership.role, membership.permissions, membership.effectivePermissions);
      S.fn.scrubRestrictedState();
      if (!S.fn.canAccessRoute(S.state.page)) S.state.page = S.fn.defaultHomeRouteForRole();
      await S.fn.rememberOfflineSession(current);
      if (S.state.authSession !== session) return;
      S.state.offlineState.mode = 'online'; S.fn.updateOfflineStatus();
      await S.fn.startOfflineSync();
      if (S.state.authSession !== session) return;
      S.state.offlineRefreshDue = true;
      await S.fn.refreshAfterOfflineSync();
      if (S.state.authSession === session) window.setTimeout(S.fn.prepareOfflineData, 3000);
    } catch (error) {
      if (S.state.authSession !== session) return;
      if (error.status === 401) S.fn.showSignedOut('Đăng nhập lại để tiếp tục. Các việc đã lưu trên máy vẫn được giữ.', 'error');
      else { S.state.offlineState.mode = 'offline'; S.fn.updateOfflineStatus(); }
    }
  }


  S.fn.businessProfileDeferred = function businessProfileDeferred() {
    const key = 'slink-profile-deferred:' + S.state.authSession?.user.id + ':' + S.state.store.id;
    try { return S.state.deferredProfiles.has(key) || localStorage.getItem(key) === 'yes'; }
    catch (error) { return S.state.deferredProfiles.has(key); }
  }


  S.fn.deferBusinessProfile = function deferBusinessProfile() {
    const key = 'slink-profile-deferred:' + S.state.authSession?.user.id + ':' + S.state.store.id;
    S.state.deferredProfiles.add(key);
    try { localStorage.setItem(key, 'yes'); } catch (error) { /* Remember this choice in the current view. */ }
    S.fn.closeModal();
  }


  S.fn.openBusinessProfileOnboarding = function openBusinessProfileOnboarding() {
    const body = `<form id='business-profile-onboarding' data-form='business-profile'><details class='work-details'><summary>Việc thường làm (có thể chọn sau)</summary><section class='onboarding-question'><h3>Bạn thường làm việc gì?</h3><p>Quyền hiện tại: <strong>${S.fn.esc(S.fn.staffRoleName(S.state.store.role))}</strong>. Chọn việc bạn thường phụ trách.</p><div class='task-focus-choices'>${S.fn.renderTaskFocusChoices(S.fn.defaultTaskFocusRoute())}</div></section></details><section class='onboarding-question'><h3>Cửa hàng hoạt động như thế nào?</h3><div class='business-profile-choices'>${S.fn.renderBusinessProfileChoices(S.state.store.businessProfile)}</div><p class='install-hint'>Slink đưa các việc thường dùng lên trước.</p></section><div class='auth-message error' data-profile-error role='alert' hidden></div></form>`;
    S.fn.showModal('Cửa hàng của bạn', 'Chọn một lần, đổi lại được trong Cài đặt.', body, `<button class='btn btn-secondary' type='button' data-action='business-profile-later'>Để sau</button><button class='btn btn-primary' type='submit' form='business-profile-onboarding'>Tiếp tục</button>`, true);
  }


  S.fn.isNavItemActive = function isNavItemActive(id) {
    if (id === 'products' && S.state.page === 'product-detail') return true;
    if (id === 'orders' && S.state.page === 'order-detail') return true;
    if (S.state.page === 'inventory') {
      const tab = S.state.inventoryTab || 'stock';
      if (id === 'inventory') return tab === 'stock' || tab === 'supplier-returns';
      if (id === 'inventory-count') return tab === 'stock-count';
      if (id === 'inventory-transfer') return tab === 'transfers';
      if (id === 'inventory-receive') return tab === 'purchases';
      return false;
    }
    return S.state.page === id;
  }


  S.fn.navHtml = function navHtml(item, mobile) {
    const active = S.fn.isNavItemActive(item.id);
    if (mobile) {
      const mobileLabels = { dashboard: 'Tổng quan', orders: 'Đơn hàng', pos: 'Bán hàng', products: 'Hàng hóa', inventory: 'Kho hàng', 'inventory-count': 'Kiểm kho', 'inventory-transfer': 'Chuyển kho', 'inventory-receive': 'Nhập hàng', finance: 'Thu chi', reports: 'Báo cáo', customers: 'Khách hàng', suppliers: 'Nhà CC', promotions: 'Khuyến mãi', staff: 'Nhân viên', settings: 'Cài đặt' };
      const label = mobileLabels[item.id] || item.label;
      const centerClass = item.id === 'pos' ? ' is-pos-center' : '';
      return `<button class='mobile-nav-link${centerClass} ${active ? 'active' : ''}' type='button' data-route='${item.id}' aria-label='${S.fn.esc(item.label)}' ${active ? "aria-current='page'" : ''}><span class='nav-icon'>${S.fn.icon(item.icon, 18)}</span><span>${S.fn.esc(label)}</span></button>`;
    }
    return `<button class='nav-link ${active ? 'active' : ''}' type='button' data-route='${item.id}' aria-label='${S.fn.esc(item.label)}' title='${S.fn.esc(item.label)}' ${active ? "aria-current='page'" : ''}><span class='nav-icon'>${S.fn.icon(item.icon, 18)}</span><span class='nav-label'>${S.fn.esc(item.label)}</span>${item.id === 'inventory' && S.fn.lowStockProducts().length ? `<span class='nav-count'>${S.fn.lowStockProducts().length}</span>` : ''}</button>`;
  }


  S.fn.renderShell = function renderShell() {
    document.body.classList.toggle('pos-fullscreen', S.state.page === 'pos');
    document.getElementById('sidebar-store-name').textContent = S.state.store.settings.storeName;
    const storeAvatar = document.querySelector('.store-avatar');
    if (storeAvatar) storeAvatar.textContent = S.fn.initials(S.state.store.settings.storeName).slice(0, 1);
    const userName = S.state.authSession && S.state.authSession.user ? S.state.authSession.user.displayName : 'Slink';
    const userEmail = S.state.authSession && S.state.authSession.user ? S.state.authSession.user.email : '';
    const profileName = document.querySelector('.profile-button strong');
    const profileEmail = document.querySelector('.profile-button small');
    if (profileName) profileName.textContent = userName;
    if (profileEmail) profileEmail.textContent = userEmail;
    const profileAvatar = document.querySelector('.profile-avatar');
    const topbarAvatar = document.querySelector('.topbar-avatar');
    if (profileAvatar) profileAvatar.textContent = S.fn.initials(userName);
    if (topbarAvatar) topbarAvatar.textContent = S.fn.initials(userName);
    document.body.dataset.page = S.state.page;
    S.fn.updateOfflineStatus();
    document.body.dataset.role = S.state.store.role;
    const isAffiliate = S.state.store.role === 'affiliate';
    const isCashier = S.state.store.role === 'cashier';
    const isStockkeeper = S.state.store.role === 'stockkeeper';
    const isAccountant = S.state.store.role === 'accountant';
    const home = isAffiliate
      ? 'affiliate'
      : isCashier
        ? 'pos'
        : S.state.taskFocusRoute || (isStockkeeper ? 'inventory' : isAccountant ? 'finance' : 'dashboard');

    const findNav = function (id) { return S.state.navItems.find(function (n) { return n.id === id; }); };
    let primaryNavHtml = '';
    if (isAffiliate) {
      primaryNavHtml = ['affiliate', 'settings'].filter(S.fn.canAccessRoute).map(findNav).filter(Boolean).map(function (item) {
        return S.fn.navHtml(item, false);
      }).join('');
    } else {
      const posCta = S.fn.canAccessRoute('pos')
        ? `<button class='btn btn-primary sidebar-pos-cta' type='button' data-route='pos'>${S.fn.icon('cart', 18)}<span>Bán hàng (POS)</span></button>`
        : '';
      const groupsHtml = (S.state.sidebarGroups || []).map(function (group) {
        const items = group.routes.filter(S.fn.canAccessRoute).map(findNav).filter(Boolean);
        if (!items.length) return '';
        return `<div class='nav-group'>${group.title ? `<div class='nav-group-label'>${S.fn.esc(group.title)}</div>` : ''}${items.map(function (item) { return S.fn.navHtml(item, false); }).join('')}</div>`;
      }).join('');
      primaryNavHtml = posCta + groupsHtml;
    }

    const mobileCoreCandidates = isAffiliate
      ? ['affiliate', 'settings']
      : isCashier
        ? ['orders', 'customers', 'pos', 'finance']
        : isStockkeeper
          ? ['inventory', 'products', 'inventory-receive', 'inventory-count']
          : isAccountant
            ? ['finance', 'orders', 'reports', 'customers']
            : ['dashboard', 'orders', 'pos', 'products'];
    const mobileCoreIds = mobileCoreCandidates.filter(S.fn.canAccessRoute).slice(0, 4);
    const visibleMobileNav = mobileCoreIds.map(findNav).filter(Boolean);
    const mobileActiveInCore = visibleMobileNav.some(function (item) { return S.fn.isNavItemActive(item.id); });
    const moreActive = !isAffiliate && !mobileActiveInCore;
    const moreBtnHtml = isAffiliate
      ? ''
      : `<button class='mobile-nav-link ${moreActive ? 'active' : ''}' type='button' data-action='more-menu' aria-label='Mở menu chức năng' ${moreActive ? "aria-current='page'" : ''}><span class='nav-icon'>${S.fn.icon('more', 18)}</span><span>Thêm</span></button>`;

    const topbarPosCta = document.getElementById('topbar-pos-cta');
    if (topbarPosCta) {
      const showTopbarPos = S.fn.canAccessRoute('pos') && !isCashier && !isAffiliate;
      topbarPosCta.hidden = !showTopbarPos;
      topbarPosCta.classList.toggle('active', S.state.page === 'pos');
      topbarPosCta.setAttribute('aria-current', S.state.page === 'pos' ? 'page' : 'false');
    }
    document.getElementById('primary-nav').innerHTML = primaryNavHtml;
    const mobileNavEl = document.getElementById('mobile-nav');
    mobileNavEl.style.setProperty('--nav-count', String(visibleMobileNav.length + (moreBtnHtml ? 1 : 0)));
    mobileNavEl.innerHTML = visibleMobileNav.map(function (item) { return S.fn.navHtml(item, true); }).join('') + moreBtnHtml;
    const brand = document.querySelector('.mobile-brand');
    if (brand) { brand.dataset.route = isCashier ? 'pos' : home; brand.setAttribute('aria-label', visibleMobileNav[0]?.label || 'Slink'); }
    const workspaceName = document.querySelector('.workspace-name');
    const storeName = isAffiliate ? 'Affiliate' : S.state.store.settings.storeName;
    const canSwitchStore = Boolean(S.state.store.id && S.state.authSession?.stores?.length > 1);
    const desktopStorePicker = document.getElementById('store-switcher');
    desktopStorePicker.disabled = !canSwitchStore;
    desktopStorePicker.setAttribute('aria-label', canSwitchStore ? 'Đổi cửa hàng · ' + storeName : storeName);
    if (workspaceName) {
      workspaceName.textContent = storeName;
      workspaceName.disabled = !canSwitchStore;
      workspaceName.setAttribute('aria-label', canSwitchStore ? 'Đổi cửa hàng · ' + storeName : storeName);
    }
    const invNames = { stock: ['Hàng hóa', 'Tồn kho'], purchases: ['Giao dịch', 'Nhập hàng'], 'supplier-returns': ['Giao dịch', 'Trả hàng NCC'], 'stock-count': ['Hàng hóa', 'Kiểm kho'], transfers: ['Hàng hóa', 'Chuyển kho'] };
    const names = { dashboard: ['Trang chủ', 'Tổng quan'], pos: ['Bán hàng', 'Quầy thu ngân'], products: ['Hàng hóa', 'Sản phẩm'], orders: ['Giao dịch', 'Hóa đơn'], promotions: ['Giao dịch', 'Khuyến mãi'], customers: ['Đối tác', 'Khách hàng'], suppliers: ['Đối tác', 'Nhà cung cấp'], inventory: invNames[S.state.inventoryTab || 'stock'] || ['Hàng hóa', 'Tồn kho'], finance: ['Tài chính', 'Sổ quỹ & công nợ'], reports: ['Phân tích', 'Báo cáo'], workspace: ['Hệ thống', 'Chức năng'], affiliate: ['Affiliate', 'Link của tôi'], settings: ['Hệ thống', 'Cài đặt'], channels: ['Giao dịch', 'Kênh bán'], staff: ['Hệ thống', 'Nhân viên'], audit: ['Hệ thống', 'Nhật ký hoạt động'], 'order-detail': ['Giao dịch', 'Chi tiết đơn'], 'product-detail': ['Hàng hóa', 'Chi tiết sản phẩm'] };
    const meta = names[S.state.page] || ['Slink', 'Cửa hàng'];
    document.getElementById('crumb').textContent = meta[0];
    document.getElementById('crumb-current').textContent = meta[1];
    S.fn.updateOfflineStatus();
  }


  S.fn.enhanceWorkspace = function enhanceWorkspace() {
    const actions = S.dom.root.querySelector('.page-heading .heading-actions');
    if (actions && !['products', 'finance', 'reports', 'suppliers'].includes(S.state.page)) {
      const extras = Array.from(actions.children).filter(function (node) { return node.tagName === 'BUTTON' && !node.classList.contains('btn-primary') && !(S.state.page === 'finance' && node.dataset.action === 'new-expense'); });
      let menu = actions.querySelector('.catalog-more');
      if (extras.length && (actions.children.length > 1 || menu)) {
        if (!menu) {
          menu = document.createElement('details'); menu.className = 'catalog-more';
          menu.innerHTML = "<summary class='btn btn-secondary'>Khác</summary><div></div>";
          actions.append(menu);
        }
        extras.forEach(function (node) { menu.querySelector('div').append(node); });
        menu.querySelector('summary').textContent = 'Khác';
      }
    }
    if (S.state.page === 'customers') {
      const filters = S.dom.root.querySelector('.customer-filters');
      if (filters) {
        const details = document.createElement('details'); details.className = 'work-details customer-extra-filters';
        details.innerHTML = '<summary>Lọc khách hàng</summary><div></div>';
        const content = details.querySelector('div');
        ['.customer-saved-tools', '.customer-tag-filter', '.customer-segment-filter', '.customer-spend-filter', '.customer-filter-hint'].forEach(function (selector) {
          const node = S.dom.root.querySelector(selector); if (node) content.append(node);
        });
        if (S.state.customerTagFilter || (S.state.customerSegmentFilter && S.state.customerSegmentFilter !== 'owing') || S.state.customerMinSpentVnd || S.state.selectedCustomerSavedSegmentId) details.open = true;
        filters.closest('.toolbar').after(details);
      }
    }
    if (S.state.page === 'settings') {
      const sections = Array.from(S.dom.root.querySelectorAll(':scope > .settings-panel'));
      sections.forEach(group => {
        group.querySelectorAll('.settings-panel').forEach(child => {
          child.classList.remove('settings-panel');
          child.classList.add('settings-block');
        });
      });
      const tabs = document.createElement('div'); tabs.className = 'settings-areas'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Các phần cài đặt');
      tabs.innerHTML = sections.map(function (section, i) { section.id = 'settings-area-' + i; section.setAttribute('role', 'tabpanel'); section.setAttribute('aria-labelledby', 'settings-tab-' + i); return "<button role='tab' id='settings-tab-" + i + "' aria-controls='" + section.id + "' data-action='settings-area' data-index='" + i + "'>" + S.fn.esc(section.dataset.label || 'Cài đặt') + '</button>'; }).join('');
      S.dom.root.querySelector('.page-heading')?.after(tabs); S.fn.selectSettingsArea(S.state.activeSettingsArea);
      if (window.SlinkAndroid) S.fn.nativeAction({ type: 'appUpdate', action: 'state' }).catch(() => {});
    }
    S.fn.enhanceRecordLists(S.dom.root);
  }


  S.fn.render = function render() {
    S.fn.saveCartDraft();
    if (!S.state.authSession) { S.fn.renderAuth(); return; }
    const previousDrawer = S.dom.root.querySelector('#drawer-cart');
    const preservePos = S.state.page === 'pos' && S.dom.root.dataset.page === 'pos';
    const warehousePickerOpen = preservePos && S.dom.root.querySelector('.pos-warehouse-picker details')?.open;
    const drawerOpen = preservePos && previousDrawer?.classList.contains('open');
    const posScroll = preservePos ? { desktop: S.dom.root.querySelector('.pos-layout > .cart-panel .cart-items')?.scrollTop || 0, drawer: previousDrawer?.querySelector('.cart-items')?.scrollTop || 0 } : null;
    const active = document.activeElement;
    const posFocus = preservePos && S.dom.root.contains(active) ? { id: active.id, action: active.dataset.action, productId: active.dataset.id, delta: active.dataset.delta, drawer: Boolean(active.closest('#drawer-cart')), start: active.selectionStart, end: active.selectionEnd } : null;
    if (previousDrawer?.classList.contains('open') && !preservePos && S.dom.modal.hidden) document.body.style.overflow = '';
    // Keep transient edits in memory across background profile/security refreshes.
    // These values are never sent, logged or persisted until the user submits the form.
    const drafts = S.state.page === 'settings' && S.dom.root.dataset.page === 'settings' ? Array.from(S.dom.root.querySelectorAll('form[data-dirty="true"]')).map(function (form) {
      return { type: form.dataset.form, fields: Array.from(form.querySelectorAll('input[name],select[name],textarea[name]')).filter(function (field) { return field.type !== 'file'; }).map(function (field) { return { name: field.name, value: field.value, checked: field.checked }; }) };
    }) : [];
    const editing = S.dom.root.dataset.page === S.state.page && S.dom.root.contains(active) && active.matches('input[id],textarea[id]') ? { id: active.id, page: S.state.page, start: active.selectionStart, end: active.selectionEnd } : null;
    S.dom.root.dataset.page = S.state.page;
    S.fn.renderShell();
    const renderers = { workspace: S.fn.renderWorkspace, affiliate: S.fn.renderAffiliate, dashboard: S.fn.renderDashboard, products: S.fn.renderProducts, pos: S.fn.renderPOS, orders: S.fn.renderOrders, promotions: S.fn.renderPromotions, customers: S.fn.renderCustomers, suppliers: S.fn.renderSuppliers, inventory: S.fn.renderInventory, finance: S.fn.renderFinance, reports: S.fn.renderReports, settings: S.fn.renderSettings, channels: S.fn.renderChannelMappings, staff: S.fn.renderStaff, audit: S.fn.renderAudit };
    const pageHtml = renderers[S.state.page] ? renderers[S.state.page]() : `<section class='panel locked-page'><div class='empty-icon'>${S.fn.icon('clock', 23)}</div><h2>Đang hoàn thiện</h2><p>Mục này hiện chưa khả dụng.</p><button class='btn btn-primary' data-route='products'>Mở danh mục sản phẩm</button></section>`;
    S.dom.root.innerHTML = pageHtml;
    S.fn.enhanceWorkspace();
    drafts.forEach(function (draft) {
      const form = Array.from(S.dom.root.querySelectorAll('form')).find(function (item) { return item.dataset.form === draft.type; });
      if (!form) return;
      draft.fields.forEach(function (saved) {
        const field = form.elements.namedItem(saved.name);
        if (field && field.tagName) { field.value = saved.value; if (field.type === 'checkbox' || field.type === 'radio') field.checked = saved.checked; }
      });
      form.dataset.dirty = 'true';
    });
    if (editing) window.requestAnimationFrame(function () {
      const field = document.getElementById(editing.id);
      if (field && S.dom.modal.hidden && S.state.page === editing.page && document.activeElement === document.body) {
        field.focus({ preventScroll: true });
        if (editing.start !== null && field.setSelectionRange) field.setSelectionRange(editing.start, editing.end);
      }
    });
    window.SlinkMoneyFields.enhance(S.dom.root);
    if (S.state.page === 'pos') S.fn.updateProductSelections();
    if (preservePos) {
      const picker = S.dom.root.querySelector('.pos-warehouse-picker details:not([hidden])');
      if (warehousePickerOpen && picker) picker.open = true;
      const drawer = document.getElementById('drawer-cart');
      if (drawerOpen && drawer && window.matchMedia('(max-width: 1100px)').matches) {
        drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); drawer.removeAttribute('inert');
        S.dom.root.querySelectorAll('[data-action="open-cart"]').forEach(button => button.setAttribute('aria-expanded', 'true'));
      }
      for (const [container, scroll] of [[S.dom.root.querySelector('.pos-layout > .cart-panel .cart-items'), posScroll.desktop], [drawer?.querySelector('.cart-items'), posScroll.drawer]]) if (container) container.scrollTop = scroll;
      if (posFocus) {
        const container = posFocus.drawer ? drawer : S.dom.root;
        const target = posFocus.id ? document.getElementById(posFocus.id) : posFocus.action ? Array.from(container?.querySelectorAll('[data-action]') || []).find(node => node.dataset.action === posFocus.action && node.dataset.id === posFocus.productId && node.dataset.delta === posFocus.delta) : null;
        if (target && S.dom.modal.hidden) { target.focus({ preventScroll: true }); if (posFocus.start != null && target.setSelectionRange) target.setSelectionRange(posFocus.start, posFocus.end); }
      }
    }
  }


  S.fn.showMoreMenu = function showMoreMenu() {
    S.fn.openMoreDrawer();
  }


  S.fn.openMoreDrawer = function openMoreDrawer() {
    const groups = [
      { title: 'Hàng hóa & Kho', routes: ['products', 'inventory', 'inventory-count', 'inventory-transfer', 'inventory-receive'] },
      { title: 'Bán hàng & Đối tác', routes: ['pos', 'promotions', 'customers', 'suppliers'] },
      { title: 'Tài chính & Báo cáo', routes: ['finance', 'reports'] },
      { title: 'Hệ thống', routes: ['staff', 'audit', 'settings'] },
    ];
    const sections = groups.map(function (group) {
      const items = group.routes.filter(S.fn.canAccessRoute).map(function (id) {
        return S.state.navItems.find(function (item) { return item.id === id; });
      }).filter(Boolean);
      if (!items.length) return '';
      return `<section class='more-drawer-section'><h3>${S.fn.esc(group.title)}</h3><div class='more-drawer-items'>${items.map(function (item) {
        const active = S.fn.isNavItemActive(item.id);
        return `<button class='more-drawer-item ${active ? 'active' : ''}' type='button' data-route='${item.id}'>${S.fn.icon(item.icon, 20)}<span>${S.fn.esc(item.label)}</span></button>`;
      }).join('')}</div></section>`;
    }).filter(Boolean).join('');
    const storeName = S.state.store.settings.storeName || 'Cửa hàng';
    const canSwitch = Boolean(S.state.store.id && S.state.authSession?.stores?.length > 1);
    const body = `<div class='more-drawer-grid'>${sections || `<p class='muted'>Không có mục mở rộng khác.</p>`}</div>`;
    const footer = `${canSwitch ? `<button class='btn btn-secondary' type='button' data-action='store-picker'>Đổi cửa hàng (${S.fn.esc(storeName)})</button>` : ''}<button class='btn btn-secondary' type='button' data-action='help'>Trợ giúp</button><button class='btn btn-primary' type='button' data-action='close-modal'>Đóng</button>`;
    S.fn.showModal('Chức năng cửa hàng', storeName, body, footer, true);
  }


  S.fn.renderWorkspace = function renderWorkspace() {
    if (S.state.store.role === 'affiliate' || (!S.fn.hasPerm('viewReports') && !S.fn.hasPerm('manageInventory') && !S.fn.hasPerm('recordCashbook') && !S.fn.hasPerm('manageSettings') && !S.fn.hasPerm('viewAudit'))) {
      return S.fn.pageHeading('Tài khoản', '', '') + S.fn.renderWorkspaceLinks([{ title: '', routes: ['settings'] }]);
    }
    const groups = [
      { title: 'Hàng hóa & Kho', routes: ['products', 'inventory', 'inventory-count', 'inventory-transfer', 'inventory-receive'] },
      { title: 'Bán hàng & Đối tác', routes: ['dashboard', 'orders', 'promotions', 'customers', 'suppliers'] },
      { title: 'Tài chính & Hệ thống', routes: ['finance', 'reports', 'staff', 'channels', 'audit', 'settings'] },
    ];
    return S.fn.pageHeading('Tất cả chức năng', '', '') + S.fn.renderWorkspaceLinks(groups);
  }


  S.fn.renderWorkspaceLinks = function renderWorkspaceLinks(groups) {
    const descriptions = { promotions: 'Mã giảm giá & ưu đãi', pos: 'Bán hàng tại quầy', dashboard: 'Tổng quan hôm nay', finance: 'Sổ quỹ, thu chi & công nợ', orders: 'Hóa đơn & trả hàng', inventory: 'Tồn kho theo cửa hàng', 'inventory-count': 'Kiểm kho & cân bằng', 'inventory-transfer': 'Chuyển hàng giữa các kho', 'inventory-receive': 'Nhập hàng nhà cung cấp', products: 'Danh mục sản phẩm & giá', customers: 'Khách hàng & điểm thưởng', suppliers: 'Nhà cung cấp & công nợ NCC', channels: 'Đồng bộ kênh bán online', staff: 'Tài khoản & phân quyền', reports: 'Báo cáo doanh thu & lãi lỗ', settings: 'Cửa hàng, ngân hàng & thiết bị', audit: 'Lịch sử thao tác' };
    return "<div class='workspace-directory'>" + groups.map(function (group) {
      const items = group.routes.filter(S.fn.canAccessRoute).map(function (id) { return S.state.navItems.find(function (item) { return item.id === id; }); }).filter(Boolean);
      return items.length ? (group.folded ? "<details class='directory-group directory-fold'><summary>" + S.fn.esc(group.title) + '</summary>' : "<section class='directory-group'>" + (group.title ? "<h2>" + S.fn.esc(group.title) + "</h2>" : '')) + items.map(function (item) { return "<button class='directory-link' type='button' data-route='" + item.id + "'>" + S.fn.icon(item.icon, 21) + "<span><strong>" + S.fn.esc(item.label) + "</strong><small>" + S.fn.esc(descriptions[item.id] || '') + "</small></span><span aria-hidden='true'>→</span></button>"; }).join('') + (group.folded ? '</details>' : '</section>') : '';
    }).join('') + '</div>';
  }


  S.fn.showAccountMenu = function showAccountMenu() {
    const user = S.state.authSession && S.state.authSession.user ? S.state.authSession.user : {};
    const displayName = S.fn.esc(user.displayName || 'Tài khoản Slink');
    const email = S.fn.esc(user.email || '');
    const avatar = S.fn.esc(S.fn.initials(user.displayName || user.email || 'S'));
    const storeName = S.fn.esc(S.state.store.settings.storeName || 'Cửa hàng của bạn');
    const body = `<div class='account-summary'><span class='account-avatar' aria-hidden='true'>${avatar}</span><div class='account-summary-copy'><strong>${displayName}</strong><span>${email}</span></div></div><div class='account-store'><span class='account-store-label'>Cửa hàng</span><strong>${storeName}</strong></div>`;
    const switchButton = S.state.store.id && S.state.authSession.stores.length > 1 ? `<button class='btn btn-secondary' data-action='store-picker'>Đổi cửa hàng</button>` : '';
    const footer = `${switchButton}<button class='btn btn-secondary' data-action='account-settings'>Cài đặt tài khoản</button><button class='btn btn-danger' data-action='logout'>Đăng xuất</button>`;
    S.fn.showModal('Tài khoản', '', body, footer);
  }


  S.fn.openStorePicker = function openStorePicker() {
    const stores = S.state.authSession?.stores || [];
    if (!S.state.store.id || stores.length < 2) return;
    const rows = stores.map(item => {
      const current = item.id === S.state.store.id;
      return `<button class='store-option' type='button' data-action='switch-store' data-id='${S.fn.esc(item.id)}' ${current ? 'disabled aria-current="true"' : ''}><span><strong>${S.fn.esc(item.name)}</strong><small>${S.fn.esc(S.fn.staffRoleName(item.role))}</small></span><span>${current ? 'Đang mở' : 'Mở →'}</span></button>`;
    }).join('');
    S.fn.showModal('Đổi cửa hàng', '', `<div class='store-options'>${rows}</div><p class='auth-message error' data-store-switch-error role='alert' hidden></p>`, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button>`);
  }


  S.fn.switchStore = async function switchStore(id, button) {
    const session = S.state.authSession;
    if (S.state.switchingStore || !S.state.store.id || id === S.state.store.id || !session?.stores.some(item => item.id === id)) return;
    const feedback = S.dom.modal.querySelector('[data-store-switch-error]');
    if (!feedback) return;
    S.state.switchingStore = true;
    button.disabled = true;
    feedback.hidden = true;
    const generation = S.state.modalGeneration;
    try {
      if (S.state.activeWrites) throw new Error('Đang ghi giao dịch. Chờ lưu xong rồi đổi cửa hàng.');
      if (S.dom.root.querySelector('form[data-dirty="true"]')) throw new Error('Bạn đang sửa cài đặt. Hãy lưu hoặc bỏ thay đổi ở cửa hàng này trước.');
      if (!S.state.checkoutPendingPayload && (S.state.cart.length || S.state.cartCustomerId || S.state.cart.discount)) {
        const scope = S.fn.activeOfflineScope();
        if (!scope) throw new Error('Chưa thể lưu giỏ nháp trên máy. Hãy hoàn tất đơn trước khi đổi cửa hàng.');
        await S.state.offlineDisk.putMeta('cart|' + scope, S.fn.cartDraftValue());
      }
      if (S.dom.modal.hidden || S.state.modalGeneration !== generation || S.state.authSession !== session) return;
      sessionStorage.setItem('slink-current-store:' + session.user.id, id);
      window.location.reload();
    } catch (error) {
      feedback.hidden = false;
      feedback.textContent = error.message || 'Chưa đổi được cửa hàng. Hãy thử lại.';
    } finally {
      S.state.switchingStore = false;
      if (button.isConnected) button.disabled = false;
    }
  }




  S.fn.showHelp = function showHelp() {
    const body = `<div class='help-section'>
        <h3>Quy trình vận hành chính</h3>
        <div class='notice-list'>
          <div class='notice-item'><span>${S.fn.icon('cart', 18)}</span><span><strong>Bán hàng &amp; Chuyển khoản</strong><small>Chạm mặt hàng hoặc quét mã vạch, bấm <strong>Thanh toán</strong>, chọn Tiền mặt / Chuyển khoản / Ghi nợ.</small></span></div>
          <div class='notice-item'><span>${S.fn.icon('users', 18)}</span><span><strong>Nhân sự &amp; Chấm công</strong><small>Tự tính ngày công, hoa hồng thực thu và tạm ứng theo ca.</small></span></div>
          <div class='notice-item'><span>${S.fn.icon('receipt', 18)}</span><span><strong>Khách hàng, Đổi trả &amp; Bảo hành</strong><small>Tích điểm theo số điện thoại và tra cứu Serial / IMEI.</small></span></div>
          <div class='notice-item'><span>${S.fn.icon('layers', 18)}</span><span><strong>Kho &amp; Kiểm kê</strong><small>Kiểm kê quét mã và tự giữ đơn an toàn khi mất mạng.</small></span></div>
        </div>
      </div>
      <div class='help-section'>
        <h3>Phím tắt bán hàng nhanh</h3>
        <div class='help-shortcut-grid'>
          <div class='help-shortcut-item'><kbd>F1</kbd><span>Thêm đơn chờ mới</span></div>
          <div class='help-shortcut-item'><kbd>F2</kbd><span>Tìm / quét sản phẩm</span></div>
          <div class='help-shortcut-item'><kbd>F4</kbd><span>Chọn khách hàng</span></div>
          <div class='help-shortcut-item'><kbd>F6</kbd><span>Giảm giá / chiết khấu</span></div>
          <div class='help-shortcut-item'><kbd>F8</kbd><span>In phiếu tạm tính</span></div>
          <div class='help-shortcut-item'><kbd>F9</kbd><span>Thanh toán ngay</span></div>
        </div>
      </div>`;
    S.fn.showModal('Hướng dẫn sử dụng', '', body, `<button class='btn btn-secondary' type='button' data-action='change-task-focus'>Đổi màn hình mở đầu</button><button class='btn btn-primary' type='button' data-action='close-modal'>Đóng</button>`, true);
  }


  S.fn.routeTo = function routeTo(next) {
    if (!next) return;
    if (!S.fn.canAccessRoute(next)) return S.fn.toast('Không có quyền truy cập', 'Vai trò của bạn không được mở khu vực này.', 'error');
    if (S.state.page === 'settings' && next !== S.state.page && S.dom.root.querySelector('form[data-dirty="true"]')) {
      S.fn.showModal('Bạn đang sửa cài đặt', 'Chọn tiếp tục nhập để giữ nội dung, hoặc bỏ thay đổi để sang trang khác.', '', `<button class='btn btn-secondary' data-action='discard-settings' data-next='${S.fn.esc(next)}'>Bỏ thay đổi</button><button class='btn btn-primary' data-action='close-modal'>Tiếp tục nhập</button>`);
      return;
    }
    if (next === 'inventory-count') { S.state.inventoryTab = 'stock-count'; next = 'inventory'; }
    else if (next === 'inventory-transfer') { S.state.inventoryTab = 'transfers'; next = 'inventory'; }
    else if (next === 'inventory-receive') { S.state.inventoryTab = 'purchases'; next = 'inventory'; }
    else if (next === 'inventory' && S.state.page !== 'inventory') { S.state.inventoryTab = 'stock'; }
    S.state.page = next; S.fn.closeModal();
    if (S.state.page === 'pos') {
      S.state.searchTerms.products = '';
      S.state.searchTerms.customers = '';
      S.state.posSearchTerm = '';
      S.state.posProducts = [];
      if (!S.state.store.products.length && !S.state.posCatalog.length) S.state.productLoading = true;
    } else if (S.state.page === 'inventory' && S.state.inventoryWarehouseId !== S.state.selectedWarehouseId) {
      S.state.inventoryLoading = true;
    }
    S.fn.render();
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (S.state.page === 'products') S.fn.loadProductsPage(S.state.searchTerms.products, 0, { silentLoading: true });
    else if (S.state.page === 'dashboard') {
      S.fn.loadDashboardPage();
    }
    else if (S.state.page === 'inventory') {
      if (S.state.warehouses.length && S.state.selectedWarehouseId) {
        const initialWarehouseId = S.state.selectedWarehouseId;
        Promise.all([S.fn.loadWarehouses(), S.fn.loadInventoryPage(S.state.searchTerms.inventory, 0, { silentLoading: true })]).then(() => {
          if (S.state.page === 'inventory' && S.state.selectedWarehouseId && S.state.selectedWarehouseId !== initialWarehouseId) {
            S.fn.loadInventoryPage(S.state.searchTerms.inventory, 0, { silentLoading: true });
          }
        });
      } else {
        S.fn.loadWarehouses().then(function () { return S.fn.loadInventoryPage(S.state.searchTerms.inventory, 0, { silentLoading: true }); });
      }
    }
    else if (S.state.page === 'finance') S.fn.loadFinancePage();
    else if (S.state.page === 'reports') S.fn.loadAnalytics();
    else if (S.state.page === 'settings') { if (S.state.store.id) { S.fn.loadStoreProfile(); S.fn.loadIntegrationStatus(true); } S.fn.loadAccountSecurity(); }
    else if (S.state.page === 'affiliate') S.fn.loadAffiliateLinks(0);
    else if (S.state.page === 'staff') S.fn.loadStaffPage();
    else if (S.state.page === 'channels') { S.fn.loadChannelCatalog(); if (S.state.channelState.view === 'orders') S.fn.loadChannelOrders(0); }
    else if (S.state.page === 'audit') S.fn.loadAuditEvents(null, 0);
    else if (S.state.page === 'customers') S.fn.loadCustomersPage(S.state.searchTerms.customers, 0).then(() => { if (S.state.page === 'customers') S.fn.render(); });
    else if (S.state.page === 'suppliers') { if (typeof S.fn.loadSuppliersPage === 'function') S.fn.loadSuppliersPage(); }
    else if (S.state.page === 'promotions') { if (typeof S.fn.loadPromotionsPage === 'function') S.fn.loadPromotionsPage(); }
    else if (S.state.page === 'orders') { S.fn.loadIntegrationStatus(); S.fn.loadOrdersPage(S.state.searchTerms.orders, 0).then(() => { if (S.state.page === 'orders') S.fn.render(); }); }
    else if (S.state.page === 'pos') { S.fn.loadIntegrationStatus(); S.fn.loadPosSellers(); S.fn.loadProductsPage('', 0, { silentLoading: true }); }
  }


  S.fn.submitAuth = async function submitAuth(form) {
    const type = form.dataset.authForm;
    const data = new FormData(form);
    const submit = form.querySelector('[type=submit]');
    if (submit) submit.disabled = true;
    try {
      if (type === 'login') {
        const session = await S.fn.apiRequest('/api/auth/login', {
          method: 'POST', body: { email: String(data.get('email') || '').trim(), password: String(data.get('password') || '') },
        });
        if (S.state.authMode === 'invite-login' && S.state.invitationToken && S.state.invitationInfo?.status === 'pending') await S.fn.acceptStoreInvitation();
        else await S.fn.enterStore(session);
      } else if (type === 'invite-accept') {
        await S.fn.acceptStoreInvitation();
      } else if (type === 'register') {
        const result = await S.fn.apiRequest('/api/auth/register', {
          method: 'POST', body: {
            displayName: String(data.get('displayName') || '').trim(),
            storeName: String(data.get('storeName') || '').trim(),
            workspaceMode: String(data.get('workspaceMode') || 'shop'),
            email: String(data.get('email') || '').trim(),
            password: String(data.get('password') || ''),
          },
        });
        if (result.user && Array.isArray(result.stores)) {
          await S.fn.enterStore(result);
          S.fn.toast('Đã tạo tài khoản', 'Chế độ dùng thử: email chưa cần xác minh.', 'success');
        } else {
          S.state.authMode = 'login';
          S.fn.renderAuth(result.message, 'success', result.developmentVerificationUrl);
        }
      } else if (type === 'resend') {
        const result = await S.fn.apiRequest('/api/auth/resend-verification', {
          method: 'POST', body: { email: String(data.get('email') || '').trim() },
        });
        S.state.authMode = 'login';
        S.fn.renderAuth(result.message, 'success', result.developmentVerificationUrl);
      } else if (type === 'reset') {
        const result = await S.fn.apiRequest('/api/auth/password-reset', {
          method: 'POST', body: { email: String(data.get('email') || '').trim() },
        });
        S.fn.renderAuth(result.message, 'success', result.developmentResetUrl);
      } else if (type === 'reset-complete') {
        const password = String(data.get('password') || '');
        if (password !== String(data.get('passwordConfirm') || '')) throw new Error('Hai lần nhập mật khẩu chưa khớp.');
        const result = await S.fn.apiRequest('/api/auth/password-reset/complete', {
          method: 'POST', body: { token: String(data.get('token') || ''), password: password },
        });
        window.history.replaceState({}, '', '/');
        S.state.authMode = 'login';
        S.fn.renderAuth(result.message, 'success');
      } else if (type === 'invite-register') {
        if (!S.state.invitationToken || !S.state.invitationInfo || S.state.invitationInfo.status !== 'pending') throw new Error('Lời mời không còn hiệu lực. Hãy xin chủ cửa hàng gửi liên kết mới.');
        const result = await S.fn.apiRequest(`/api/invitations/${encodeURIComponent(S.state.invitationToken)}/register`, {
          method: 'POST', body: { displayName: String(data.get('displayName') || '').trim(), password: String(data.get('password') || '') },
        });
        if (result.user && Array.isArray(result.stores)) { S.fn.clearInvitation(); await S.fn.enterStore(result); return; }
        S.state.authMode = 'invite-login';
        S.fn.renderAuth(result.message, 'success', result.developmentVerificationUrl);
      }
    } catch (error) {
      if (type === 'register' && error.code === 'account_exists') {
        S.state.authMode = 'login';
        S.fn.renderAuth('Email này đã được đăng ký. Hãy đăng nhập hoặc chọn “Gửi lại email xác nhận” nếu bạn chưa xác nhận email.', 'error');
      } else if (type === 'register' && error.code === 'email_unavailable') {
        S.state.authMode = 'login';
        S.fn.renderAuth('Tài khoản đã được tạo nhưng email xác nhận chưa gửi được. Hãy chọn “Gửi lại email xác nhận” sau khi dịch vụ gửi thư hoạt động; không cần tạo lại tài khoản.', 'error');
      } else {
        S.fn.renderAuth(error.message, 'error');
      }
    } finally {
      if (submit && submit.isConnected) submit.disabled = false;
    }
  }


  S.fn.signOut = async function signOut() {
    try {
      await S.fn.apiRequest('/api/auth/logout', { method: 'POST', body: {} });
      S.fn.showSignedOut('Phiên cửa hàng được lưu trên máy chủ. Bạn đã đăng xuất.');
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn.');
      else S.fn.toast('Chưa đăng xuất được', error.message, 'error');
    }
  }


  S.fn.clearInvitation = function clearInvitation() {
    S.state.invitationToken = '';
    S.state.invitationInfo = null;
    window.history.replaceState({}, '', '/');
  }


  S.fn.acceptStoreInvitation = async function acceptStoreInvitation() {
    if (!S.state.invitationToken || S.state.invitationInfo?.status !== 'pending') return;
    const accepted = await S.fn.apiRequest(`/api/invitations/${encodeURIComponent(S.state.invitationToken)}/accept`, { method: 'POST', body: {} });
    const current = await S.fn.apiRequest('/api/auth/me');
    S.fn.clearInvitation();
    await S.fn.enterStore(current, accepted.storeId);
  }

})(window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {}, charts: {} });
