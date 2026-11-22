(function (S) {
  'use strict';

  S.fn.applyStoreProfile = function applyStoreProfile(settings) {
    S.state.store.settings.storeName = settings.name;
    S.state.store.settings.phone = settings.phone || '';
    S.state.store.settings.address = settings.address || '';
    S.state.store.settings.receiptFooter = settings.receipt_footer || '';
    S.state.store.settings.version = Number(settings.version) || 1;
    const activeStore = S.state.authSession && S.state.authSession.stores.find(function (item) { return item.id === S.state.store.id; });
    if (activeStore) Object.assign(activeStore, { name: settings.name, phone: settings.phone, address: settings.address, receipt_footer: settings.receipt_footer, version: settings.version });
  }


  S.fn.loadStoreProfile = async function loadStoreProfile() {
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/settings`);
      S.fn.applyStoreProfile(result.settings);
      if (S.state.page === 'settings') S.fn.render();
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa tải được thông tin cửa hàng', error.message, 'error');
    }
  }


  S.fn.loadIntegrationStatus = async function loadIntegrationStatus(force = false) {
    if (!S.state.authSession || !S.state.store.id) return;
    if (!force && S.state.integrationState.storeId === S.state.store.id && (S.state.integrationState.data || S.state.integrationState.loading)) return;
    const storeId = S.state.store.id;
    const requestNumber = ++S.state.integrationState.requestNumber;
    S.state.integrationState.loading = true;
    S.state.integrationState.error = '';
    S.state.integrationState.storeId = storeId;
    if (S.state.page === 'settings') S.fn.render();
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/integrations/status`);
      if (requestNumber !== S.state.integrationState.requestNumber || S.state.store.id !== storeId) return;
      S.state.integrationState.data = result;
      S.state.integrationState.loading = false;
    } catch (error) {
      if (requestNumber !== S.state.integrationState.requestNumber || S.state.store.id !== storeId) return;
      S.state.integrationState.loading = false;
      S.state.integrationState.error = error.message;
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    }
    if (S.state.page === 'settings') S.fn.render();
    else if (S.state.page === 'pos' && !S.dom.modal.hidden) {
      const checkoutForm = S.dom.modal.querySelector('[data-form="checkout"]');
      if (checkoutForm) S.fn.updateCheckoutTenderSummary(checkoutForm);
    }
  }


  S.fn.saveIntegrationSettings = async function saveIntegrationSettings(form) {
    if (!S.fn.hasPerm('manageSettings')) return;
    const data = new FormData(form);
    const submit = form.querySelector('[type="submit"]');
    const credentials = {};
    for (const [key, val] of data.entries()) {
      if (typeof key === 'string' && key.startsWith('cred:')) {
        const trimmed = String(val || '').trim();
        if (trimmed) credentials[key.slice(5)] = trimmed;
      }
    }
    const payload = {
      bankBin: String(data.get('bankBin') || '').trim(),
      bankAccountNumber: String(data.get('bankAccountNumber') || '').trim(),
      bankAccountName: String(data.get('bankAccountName') || '').trim(),
      bankWebhookProvider: String(data.get('bankWebhookProvider') || 'none').trim(),
      einvoiceProvider: String(data.get('einvoiceProvider') || 'none').trim(),
      taxCode: String(data.get('taxCode') || '').trim(),
      einvoiceTemplateCode: String(data.get('einvoiceTemplateCode') || '').trim(),
      einvoiceSerial: String(data.get('einvoiceSerial') || '').trim(),
      shippingProvider: String(data.get('shippingProvider') || 'none').trim(),
      credentials,
    };
    if (submit) submit.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/integrations/settings`, { method: 'PUT', body: payload });
      delete form.dataset.dirty;
      S.state.integrationState.data = {
        ...(S.state.integrationState.data || {}),
        settings: result.settings,
        connectors: result.connectors,
        credentials: result.credentials,
        ghnShopId: result.ghnShopId,
      };
      await S.fn.loadIntegrationStatus(true);
      S.fn.toast('Đã lưu cấu hình tích hợp', result.settings.bankAccountNumber ? `${result.settings.bankName || result.settings.bankBin} · ${result.settings.bankAccountNumber}` : 'Đã cập nhật');
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa lưu được tích hợp', error.message, 'error');
      if (submit?.isConnected) submit.disabled = false;
    }
  }

  S.fn.clearIntegrationCredential = async function clearIntegrationCredential(key, button) {
    if (!S.fn.hasPerm('manageSettings') || !key) return;
    const current = S.state.integrationState.data?.settings || {};
    if (button) button.disabled = true;
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/integrations/settings`, {
        method: 'PUT',
        body: { ...current, clearCredentials: [key] },
      });
      await S.fn.loadIntegrationStatus(true);
      S.fn.toast('Đã xóa khóa kết nối', key);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa xóa được khóa', error.message, 'error');
      if (button?.isConnected) button.disabled = false;
    }
  }


  S.fn.updateIntegrationVietQrPreview = function updateIntegrationVietQrPreview(form) {
    const preview = form?.querySelector('#int-vietqr-preview');
    if (!preview || !window.SlinkIntegrationsUI) return;
    const bankBin = String(form.elements.bankBin?.value || '').trim();
    const bankAccountNumber = String(form.elements.bankAccountNumber?.value || '').trim();
    const bankAccountName = String(form.elements.bankAccountName?.value || '').trim();
    const found = window.SlinkBanksVn?.findBankByBin?.(bankBin);
    const html = bankBin && bankAccountNumber
      ? window.SlinkIntegrationsUI.renderVietQrCard({
        bankBin,
        bankAccountNumber,
        bankAccountName,
        bankName: found?.shortName || '',
        amountVnd: '100000',
        note: 'SLINK TEST',
      })
      : '';
    preview.innerHTML = html;
    preview.hidden = !html;
  }


  S.fn.handleEscPosAction = async function handleEscPosAction(action, orderId) {
    const printer = window.SlinkEscPosPrinter;
    if (!printer) return;
    try {
      if (action === 'escpos-connect') {
        const caps = printer.capabilities();
        if (caps.btSupported) {
          const devices = await printer.listBluetoothPrinters();
          if (!devices.length) {
            S.fn.toast('Chưa có máy in Bluetooth đã ghép đôi', 'Mở Cài đặt Bluetooth trên điện thoại, ghép đôi máy in nhiệt 58mm/80mm rồi thử lại.', 'error');
            return;
          }
          const rows = devices.map(d => `<button type='button' class='btn btn-secondary' style='width:100%;justify-content:space-between;margin-bottom:8px' data-action='select-bt-printer' data-address='${S.fn.esc(d.address)}' data-name='${S.fn.esc(d.name || d.address)}'><span><strong>${S.fn.esc(d.name || 'Máy in Bluetooth')}</strong><br/><small class='muted'>${S.fn.esc(d.address)}</small></span><span>Chọn</span></button>`).join('');
          S.fn.showModal('Chọn máy in nhiệt Bluetooth', 'Chọn máy in đã ghép đôi với điện thoại.', `<div>${rows}</div>`, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button>`);
          return;
        }
        await printer.connectSerialPrinter(9600);
        S.fn.toast('Đã kết nối máy in bill', 'Sẵn sàng in ESC/POS trực tiếp.');
        if (S.state.page === 'settings') S.fn.render();
      } else if (action === 'escpos-kick-drawer') {
        await printer.openCashDrawer();
        S.fn.toast('Đã gửi lệnh mở két tiền');
      } else if (action === 'escpos-test-print') {
        await printer.printReceipt({
          storeName: S.state.store.settings.storeName || 'Slink',
          address: S.state.store.settings.address || '',
          phone: S.state.store.settings.phone || '',
          orderNumber: 'SLINK-TEST',
          createdAt: S.fn.humanDate(new Date().toISOString(), true),
          items: [{ name: 'Thu may in nhiet ESC/POS', quantity: 1, unitPriceVnd: '100000', lineTotalVnd: '100000' }],
          subtotalVnd: '100000',
          discountVnd: '0',
          totalVnd: '100000',
          paidVnd: '100000',
          footer: S.state.store.settings.receiptFooter || 'Cam on quy khach!',
        });
        S.fn.toast('Đã in bill thử nghiệm');
      } else if (action === 'escpos-print-order' && orderId) {
        const o = S.state.store.orders.find(item => item.id === orderId);
        if (!o) return;
        const c = S.fn.customerById(o.customerId);
        await printer.printReceipt({
          storeName: S.state.store.settings.storeName || 'Slink',
          address: S.state.store.settings.address || '',
          phone: S.state.store.settings.phone || '',
          orderNumber: o.number,
          createdAt: S.fn.humanDate(o.createdAt, true),
          customerName: o.customerName || c?.name || '',
          items: (o.items || []).map(i => ({
            name: i.name,
            quantity: i.qty,
            unitPriceVnd: i.priceVnd ?? String(i.price || 0),
            lineTotalVnd: i.totalVnd ?? String(i.total || 0),
          })),
          subtotalVnd: o.subtotalVndText ?? String(o.subtotal || 0),
          discountVnd: o.discountVndText ?? String(o.discount || 0),
          totalVnd: o.totalVndText ?? String(o.total || 0),
          paidVnd: o.paidVndText ?? String(o.paid || 0),
          footer: S.state.store.settings.receiptFooter || 'Cam on quy khach!',
        });
        S.fn.toast('Đã in bill ESC/POS', o.number);
      }
    } catch (error) {
      S.fn.toast('Thao tác máy in chưa hoàn tất', error.message, 'error');
    }
  }


  S.fn.loadAccountSecurity = async function loadAccountSecurity() {
    if (!S.state.authSession) return;
    const requestNumber = ++S.state.accountSecurityState.requestNumber;
    S.state.accountSecurityState.loading = true;
    S.state.accountSecurityState.error = '';
    if (S.state.page === 'settings') S.fn.render();
    try {
      const result = await S.fn.apiRequest('/api/auth/security');
      if (requestNumber !== S.state.accountSecurityState.requestNumber) return;
      S.state.accountSecurityState.sessions = result.sessions || [];
      S.state.accountSecurityState.events = result.events || [];
      S.state.accountSecurityState.loading = false;
    } catch (error) {
      if (requestNumber !== S.state.accountSecurityState.requestNumber) return;
      S.state.accountSecurityState.loading = false;
      S.state.accountSecurityState.error = error.message;
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    }
    if (S.state.page === 'settings') S.fn.render();
  }


  S.fn.revokeAccountSession = async function revokeAccountSession(sessionId) {
    if (!sessionId || !window.confirm('Đăng xuất phiên được chọn? Thiết bị đó sẽ phải đăng nhập lại.')) return;
    try {
      const result = await S.fn.apiRequest(`/api/auth/sessions/${encodeURIComponent(sessionId)}/revoke`, { method: 'POST', body: {} });
      S.fn.toast(result.status === 'revoked' ? 'Đã đăng xuất thiết bị' : 'Phiên này đã được đăng xuất');
      await S.fn.loadAccountSecurity();
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập hiện tại đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa đăng xuất được thiết bị', error.message, 'error');
    }
  }


  S.fn.loadAuditEvents = async function loadAuditEvents(filters, offset) {
    if (!S.state.authSession || !S.state.store.id || !S.fn.hasPerm('viewAudit')) return;
    if (filters) S.state.auditState.filters = { from: filters.from || '', to: filters.to || '', q: filters.q || '' };
    const requestNumber = ++S.state.auditState.requestNumber;
    S.state.auditState.offset = Math.max(0, Number(offset) || 0);
    S.state.auditState.loading = true;
    S.state.auditState.error = '';
    if (S.state.page === 'audit') S.fn.render();
    const params = new URLSearchParams({ limit: String(S.state.auditState.limit), offset: String(S.state.auditState.offset) });
    if (S.state.auditState.filters.from) params.set('from', S.state.auditState.filters.from);
    if (S.state.auditState.filters.to) params.set('to', S.state.auditState.filters.to);
    if (S.state.auditState.filters.q) params.set('q', S.state.auditState.filters.q);
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/audit-events?${params}`);
      if (requestNumber !== S.state.auditState.requestNumber) return;
      S.state.auditState.events = result.events || [];
      S.state.auditState.total = Number(result.total) || 0;
      S.state.auditState.nextOffset = result.nextOffset;
      S.state.auditState.loading = false;
    } catch (error) {
      if (requestNumber !== S.state.auditState.requestNumber) return;
      S.state.auditState.loading = false;
      S.state.auditState.error = error.status === 404
        ? 'Máy chủ Slink chưa có phiên bản nhật ký này. Hãy khởi động lại API rồi tải lại trang.'
        : error.message;
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    }
    if (S.state.page === 'audit') S.fn.render();
  }


  S.fn.renderPosPrefsSettings = function renderPosPrefsSettings() {
    const voiceEnabled = S.state.posPrefs.voiceAnnounce !== false;
    return `<section class='panel settings-panel'><h2>POS &amp; Hóa đơn</h2><form data-form='pos-prefs'><div class='form-grid'><div class='form-field'><label class='input-label' for='pos-pref-paper'>Khổ giấy in mặc định</label><div class='select-wrap'><select class='input' id='pos-pref-paper' name='paperWidth'><option value='80mm' ${S.state.posPrefs.paperWidth === '80mm' ? 'selected' : ''}>Khổ nhiệt 80mm (phổ biến)</option><option value='58mm' ${S.state.posPrefs.paperWidth === '58mm' ? 'selected' : ''}>Khổ nhiệt 58mm (mini)</option><option value='a4' ${S.state.posPrefs.paperWidth === 'a4' ? 'selected' : ''}>Khổ giấy A4 / A5</option></select></div></div><div class='form-field' style='display:grid;gap:10px;align-content:end;padding-bottom:4px'><label style='display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px'><input type='checkbox' name='autoPrint' ${S.state.posPrefs.autoPrint ? 'checked' : ''}/><span>Tự động in hóa đơn</span></label><label style='display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px'><input type='checkbox' name='requireFullPayment' ${S.state.posPrefs.requireFullPayment ? 'checked' : ''}/><span>Bắt buộc thanh toán đủ</span></label><label style='display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px'><input type='checkbox' name='voiceAnnounce' ${voiceEnabled ? 'checked' : ''}/><span>Loa đọc tiền khi thu</span></label></div></div><div class='modal-footer' style='padding:14px 0 0;margin-top:8px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap'><button class='btn btn-secondary' type='button' data-action='test-pos-voice'>Thử loa</button><button class='btn btn-primary' type='submit'>Lưu</button></div></form></section>`;
  }


  S.fn.renderSettings = function renderSettings() {
    const canEdit = S.fn.hasPerm('manageSettings');
    const disabled = canEdit ? '' : 'disabled';
    const printerBlock = window.SlinkIntegrationsUI?.renderPrinterHardwareSection?.({ escposCaps: window.SlinkEscPosPrinter?.capabilities?.() }) || '';
    if (S.state.store.role === 'affiliate' || (!canEdit && !S.fn.hasPerm('manageInventory') && !S.fn.hasPerm('viewReports') && !S.fn.hasPerm('recordCashbook'))) {
      return S.fn.pageHeading('Cài đặt', '', '') +
        (S.fn.hasPerm('posSell') ? `<section class='settings-panel settings-group' data-label='Bán hàng & Thiết bị'>${S.fn.renderPosPrefsSettings()}${printerBlock}</section>` : '') +
        `<section class='settings-panel settings-group' data-label='Tài khoản & Ứng dụng'>${S.fn.renderAccountSummary()}${S.fn.renderChangePasswordForm()}${S.fn.renderAccountSecurity()}${S.fn.renderDeviceSettings()}</section>`;
    }
    const storeInfoBlock = `<section class='panel settings-panel'><h2>Thông tin cửa hàng</h2><form id='entity-form' data-form='settings' data-version='${S.state.store.settings.version || 1}'><div class='form-grid'><div class='form-field full'><label class='input-label' for='setting-store-name'>Tên cửa hàng *</label><input class='input' id='setting-store-name' name='storeName' value='${S.fn.esc(S.state.store.settings.storeName)}' required minlength='2' maxlength='160' ${disabled}/></div><div class='form-field'><label class='input-label' for='setting-phone'>Số điện thoại</label><input class='input' id='setting-phone' name='phone' value='${S.fn.esc(S.state.store.settings.phone)}' inputmode='tel' maxlength='40' ${disabled}/></div><div class='form-field full'><label class='input-label' for='setting-address'>Địa chỉ</label><input class='input' id='setting-address' name='address' value='${S.fn.esc(S.state.store.settings.address)}' maxlength='300' ${disabled}/></div><div class='form-field full'><label class='input-label' for='setting-footer'>Lời chào biên nhận</label><input class='input' id='setting-footer' name='receiptFooter' value='${S.fn.esc(S.state.store.settings.receiptFooter)}' maxlength='240' placeholder='Cảm ơn quý khách' ${disabled}/></div></div>${canEdit ? `<div class='modal-footer' style='padding:17px 0 0;margin-top:12px'><button class='btn btn-primary' type='submit'>Lưu thay đổi</button></div>` : ''}</form></section>`;
    const integrationsBlock = canEdit && window.SlinkIntegrationsUI
      ? window.SlinkIntegrationsUI.renderIntegrationSettingsSection({ data: S.state.integrationState.data, loading: S.state.integrationState.loading, error: S.state.integrationState.error, canEdit, includeHardware: false })
      : '';
    return S.fn.pageHeading('Cài đặt', '', '') +
      `<section class='settings-panel settings-group' data-label='Cửa hàng'>${storeInfoBlock}${S.fn.renderBusinessProfileSettings(canEdit)}</section>` +
      `<section class='settings-panel settings-group' data-label='Bán hàng & Thiết bị'>${S.fn.renderPosPrefsSettings()}${printerBlock}</section>` +
      (integrationsBlock ? `<section class='settings-panel settings-group' data-label='Thanh toán & Tích hợp'>${integrationsBlock}</section>` : '') +
      `<section class='settings-panel settings-group' data-label='Tài khoản & Ứng dụng'>${S.fn.renderAccountSummary()}${S.fn.renderChangePasswordForm()}${S.fn.renderAccountSecurity()}${S.fn.renderDeviceSettings()}</section>`;
  }


  S.fn.renderAccountSummary = function renderAccountSummary() {
    const user = S.state.authSession.user;
    return `<section class='panel settings-panel'><h2>Tài khoản</h2><dl class='settings-identity'><div><dt>Tên</dt><dd>${S.fn.esc(user.displayName)}</dd></div><div><dt>Email</dt><dd>${S.fn.esc(user.email)}</dd></div><div><dt>Vai trò</dt><dd>${S.fn.esc(S.fn.staffRoleName(S.state.store.role))}</dd></div></dl><div class='settings-actions'>${S.state.authSession.stores.length > 1 ? `<button class='btn btn-secondary' type='button' data-action='store-picker'>Đổi cửa hàng</button>` : ''}<button class='btn btn-secondary' type='button' data-action='account-logout'>Đăng xuất</button></div></section>`;
  }


  S.fn.renderDeviceSettings = function renderDeviceSettings() {
    const startOptions = S.fn.taskFocusOptions();
    const focus = S.state.store.id && startOptions.length ? `<section class='panel settings-panel'><h2>Màn hình mở đầu</h2><form data-form='task-focus'><div class='task-focus-choices'>${S.fn.renderTaskFocusChoices(S.state.taskFocusRoute)}</div><button class='btn btn-primary' type='submit'>Lưu</button></form><button class='link-button' type='button' data-action='replay-guided-tour'>Xem lại hướng dẫn</button></section>` : '';
    const data = `<section class='panel settings-panel'><h2>Dữ liệu &amp; sao lưu</h2><div class='settings-actions'>${S.state.store.id ? `<button class='btn btn-secondary' type='button' data-action='offline-records'>Chứng từ trên máy</button>` : ''}${S.fn.canExportData() && S.state.store.id ? `<button class='btn btn-secondary' type='button' data-action='open-export'>Xuất dữ liệu cửa hàng</button>` : ''}<button class='btn btn-secondary' type='button' data-action='open-legal' data-kind='terms'>Điều khoản</button><button class='btn btn-secondary' type='button' data-action='open-legal' data-kind='privacy'>Chính sách bảo mật</button></div></section>`;
    const updates = window.SlinkAndroid ? `<section class='panel settings-panel' data-app-update-state><h2>Phiên bản ứng dụng</h2><p data-app-version>Slink</p><p data-app-update-message></p><div class='settings-actions'><button class='btn btn-secondary' type='button' data-action='check-app-update'>Kiểm tra cập nhật</button><button class='btn btn-primary' type='button' data-action='install-app-update' hidden>Cài bản mới</button></div></section>` : '';
    return focus + data + updates;
  }


  S.fn.renderBusinessProfileSettings = function renderBusinessProfileSettings(canEdit) {
    return `<section class='panel settings-panel'><h2>Mô hình cửa hàng</h2><form data-form='business-profile'><div class='business-profile-choices'>${S.fn.renderBusinessProfileChoices(S.state.store.businessProfile || 'retail')}</div>${canEdit ? `<div class='modal-footer' style='padding:14px 0 0;margin-top:10px'><button class='btn btn-primary' type='submit'>Áp dụng mô hình</button></div>` : ''}</form></section>`;
  }


  S.fn.renderChangePasswordForm = function renderChangePasswordForm() {
    return `<section class='panel settings-panel'><h2>Đổi mật khẩu</h2><form class='auth-form account-password-form' data-form='change-password'>${S.fn.authPasswordField('settings-current-password', 'currentPassword', 'Mật khẩu hiện tại', 'current-password')}${S.fn.authPasswordField('settings-new-password', 'newPassword', 'Mật khẩu mới (≥ 12 ký tự)', 'new-password')}${S.fn.authPasswordField('settings-confirm-password', 'confirmPassword', 'Nhập lại mật khẩu mới', 'new-password', 'settings-new-password')}<div class='auth-message error' data-password-feedback role='alert' hidden></div><button class='btn btn-primary auth-submit' type='submit'>Đổi mật khẩu</button></form></section>`;
  }


  S.fn.securityEventLabel = function securityEventLabel(type) {
    return ({
      login_succeeded: 'Đăng nhập thành công',
      login_failed: 'Đăng nhập không thành công',
      email_verified: 'Xác nhận email',
      logout: 'Đăng xuất',
      password_changed: 'Đổi mật khẩu',
      session_revoked: 'Đăng xuất phiên từ xa',
    })[type] || 'Hoạt động bảo mật';
  }


  S.fn.renderAccountSecurity = function renderAccountSecurity() {
    const sessionRows = S.state.accountSecurityState.sessions.map(function (session) {
      return `<div class='security-session-row'><span><strong>${session.current ? 'Thiết bị hiện tại' : 'Phiên đang đăng nhập'}</strong><small>Đăng nhập ${S.fn.humanDate(session.createdAt, true)} · Hết hạn ${S.fn.humanDate(session.expiresAt, true)}</small></span>${session.current ? `<span class='badge badge-success'><i class='badge-dot'></i>Đang dùng</span>` : `<button class='btn btn-secondary' data-action='revoke-session' data-id='${S.fn.esc(session.id)}'>Đăng xuất thiết bị</button>`}</div>`;
    }).join('');
    const eventRows = S.state.accountSecurityState.events.map(function (item) {
      return `<tr><td>${S.fn.humanDate(item.occurredAt, true)}</td><td>${S.fn.esc(S.fn.securityEventLabel(item.type))}</td></tr>`;
    }).join('');
    return `<section class='panel settings-panel account-security-panel'><div class='panel-header'><h2>Bảo mật tài khoản</h2><button class='link-button' data-action='reload-security'>Tải lại</button></div>${S.state.accountSecurityState.loading ? `<div class='install-hint' role='status' aria-live='polite'>Đang tải phiên đăng nhập…</div>` : ''}${S.state.accountSecurityState.error ? `<div class='auth-message error' role='alert'>${S.fn.esc(S.state.accountSecurityState.error)}</div>` : ''}<div class='security-session-list'>${sessionRows || `<div class='empty-state'><strong>${S.state.accountSecurityState.loading ? 'Đang tải phiên đăng nhập…' : 'Không có phiên đang hoạt động'}</strong></div>`}</div><div class='security-events-heading'><h3>Lịch sử bảo mật</h3></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Thời gian</th><th>Hoạt động</th></tr></thead><tbody>${eventRows || `<tr><td colspan='2'><div class='empty-state'><strong>${S.state.accountSecurityState.loading ? 'Đang tải lịch sử…' : 'Chưa có hoạt động bảo mật'}</strong></div></td></tr>`}</tbody></table></div></section>`;
  }

  S.fn.auditActionLabel = function auditActionLabel(action) {
    const labels = {
      'sale.created': 'Tạo đơn bán', 'sale.voided': 'Hủy đơn chưa thanh toán', 'order.payment_recorded': 'Ghi nhận thanh toán',
      'return.created': 'Trả hàng / hoàn tiền', 'purchase.received': 'Nhận hàng nhập kho', 'inventory.adjusted': 'Điều chỉnh tồn kho',
      'purchase_order.created': 'Tạo đơn đặt hàng', 'purchase_order.updated': 'Sửa đơn đặt hàng', 'purchase_order.placed': 'Xác nhận đã gửi đơn',
      'purchase_order.cancelled': 'Hủy đơn đặt hàng', 'purchase_order.receipt_recorded': 'Nhận một chuyến hàng',
      'product.created': 'Tạo sản phẩm', 'product.updated': 'Cập nhật sản phẩm', 'products.imported': 'Nhập danh mục CSV',
      'product.bulk_updated': 'Cập nhật danh mục hàng loạt', 'product.archived': 'Ngừng kinh doanh sản phẩm',
      'customer.created': 'Tạo khách hàng', 'customer.updated': 'Cập nhật khách hàng', 'customer.archived': 'Lưu trữ khách hàng',
      'customer.opening_balance_recorded': 'Ghi nhận công nợ đầu kỳ', 'customer.payment_recorded': 'Thu công nợ khách hàng', 'supplier.created': 'Tạo nhà cung cấp',
      'cash_session.opened': 'Mở ca tiền mặt', 'cash_session.closed': 'Chốt ca tiền mặt', 'cash_movement.created': 'Ghi thu chi',
      'supplier.opening_balance_recorded': 'Ghi nhận phải trả đầu kỳ', 'supplier.payment_recorded': 'Thanh toán nhà cung cấp',
      'channel.profile_created': 'Khai báo gian hàng bán', 'channel.profile_updated': 'Cập nhật tên gian hàng', 'channel.profile_archived': 'Lưu trữ gian hàng',
      'channel.mapping_created': 'Tạo ánh xạ SKU thủ công', 'channel.mapping_updated': 'Cập nhật ánh xạ SKU', 'channel.mapping_archived': 'Lưu trữ ánh xạ SKU',
      'order.note_added': 'Thêm ghi chú nội bộ', 'order.tag_added': 'Gắn nhãn đơn hàng', 'order.tag_removed': 'Gỡ nhãn đơn hàng',
      'staff.invited': 'Mời nhân viên', 'staff.joined': 'Nhân viên tham gia', 'staff.access_changed': 'Thay đổi quyền nhân viên',
      'staff.invitation_resent': 'Gửi lại lời mời', 'staff.invitation_revoked': 'Thu hồi lời mời', 'store.settings_updated': 'Cập nhật cài đặt cửa hàng',
      'data.exported': 'Xuất dữ liệu cửa hàng'
    };
    return labels[action] || String(action || '').replace(/\./g, ' · ');
  }


  S.fn.renderAudit = function renderAudit() {
    if (!S.fn.canAccessRoute('audit')) return `<section class='panel locked-page'><h2>Không có quyền xem nhật ký</h2><p>Khu vực này chỉ dành cho chủ cửa hàng và quản lý.</p></section>`;
    const rows = S.state.auditState.events.map(function (item) {
      const entity = `${item.entityType} · ${String(item.entityId).slice(0, 8)}`;
      return `<tr><td>${S.fn.humanDate(item.occurredAt, true)}</td><td>${S.fn.esc(item.actor.name)}</td><td><strong>${S.fn.esc(S.fn.auditActionLabel(item.action))}</strong><small class='table-subtitle'>${S.fn.esc(item.action)}</small></td><td>${S.fn.esc(entity)}</td><td>${S.fn.esc(item.reason || '—')}</td></tr>`;
    }).join('');
    return S.fn.pageHeading('Nhật ký hoạt động', '', `<button class='btn btn-secondary' data-action='reload-audit'>Tải lại</button>`) +
      `<section class='panel'><form id='audit-filter-form' data-form='audit-filter' class='audit-filter-form'><div class='form-field'><label class='input-label' for='audit-from'>Từ ngày</label><input class='input' id='audit-from' name='from' type='date' value='${S.fn.esc(S.state.auditState.filters.from)}'/></div><div class='form-field'><label class='input-label' for='audit-to'>Đến ngày</label><input class='input' id='audit-to' name='to' type='date' value='${S.fn.esc(S.state.auditState.filters.to)}'/></div><div class='form-field audit-search-field'><label class='input-label' for='audit-q'>Tìm thao tác, nhân viên, mã bản ghi hoặc lý do</label><input class='input' id='audit-q' name='q' type='search' maxlength='100' value='${S.fn.esc(S.state.auditState.filters.q)}' placeholder='Ví dụ: nhập hàng, Nguyễn…'/></div><button class='btn btn-primary audit-filter-button' type='submit'>Lọc nhật ký</button></form>${S.state.auditState.loading ? `<div class='install-hint' role='status' aria-live='polite'>Đang tải nhật ký hoạt động…</div>` : ''}${S.state.auditState.error ? `<div class='auth-message error' role='alert'>${S.fn.esc(S.state.auditState.error)}</div>` : ''}<div class='table-wrap'><table class='data-table'><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Thao tác</th><th>Bản ghi</th><th>Lý do</th></tr></thead><tbody>${rows || `<tr><td colspan='5'><div class='empty-state'><strong>${S.state.auditState.loading ? 'Đang tải nhật ký…' : S.state.auditState.error ? 'Chưa tải được nhật ký' : 'Chưa có thao tác phù hợp'}</strong><span>${S.state.auditState.error ? 'Hãy thử tải lại hoặc điều chỉnh bộ lọc.' : 'Các thay đổi nghiệp vụ sẽ xuất hiện sau khi được ghi nhận trên máy chủ.'}</span></div></td></tr>`}</tbody></table></div><div class='pagination'><span>${S.state.auditState.total ? `Hiển thị ${S.state.auditState.offset + 1}–${S.state.auditState.offset + S.state.auditState.events.length} trên ${S.fn.number(S.state.auditState.total)} mục` : `${S.fn.number(S.state.auditState.total)} mục`}</span><span class='pagination-actions'>${S.state.auditState.offset > 0 ? `<button class='page-button' data-action='audit-page' data-offset='${Math.max(0, S.state.auditState.offset - S.state.auditState.limit)}' aria-label='Trang trước'>‹</button>` : ''}<span class='page-button current'>${Math.floor(S.state.auditState.offset / S.state.auditState.limit) + 1}</span>${S.state.auditState.nextOffset !== null ? `<button class='page-button' data-action='audit-page' data-offset='${S.state.auditState.nextOffset}' aria-label='Trang sau'>›</button>` : ''}</span></div></section>`;
  }


  S.fn.selectSettingsArea = function selectSettingsArea(index) {
    const sections = Array.from(S.dom.root.querySelectorAll('.settings-panel'));
    S.state.activeSettingsArea = index >= 0 && index < sections.length ? index : 0;
    sections.forEach(function (section, i) { section.hidden = i !== S.state.activeSettingsArea; });
    S.dom.root.querySelectorAll('[data-action="settings-area"]').forEach(function (button, i) { button.setAttribute('aria-selected', String(i === S.state.activeSettingsArea)); button.tabIndex = i === S.state.activeSettingsArea ? 0 : -1; });
  }


  S.fn.saveSettings = async function saveSettings(form) {
    const data = new FormData(form);
    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/settings`, {
        method: 'PUT',
        body: {
          name: String(data.get('storeName') || '').trim(),
          phone: String(data.get('phone') || '').trim(),
          address: String(data.get('address') || '').trim(),
          receiptFooter: String(data.get('receiptFooter') || '').trim(),
          version: Number(form.dataset.version),
        },
      });
      const settings = result.settings;
      delete form.dataset.dirty;
      S.fn.applyStoreProfile(settings);
      S.fn.emitSyncDomains(['settings', 'dashboard'], { source: 'store-settings' });
      S.fn.render();
      S.fn.toast('Đã lưu cài đặt cửa hàng');
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else if (error.code === 'version_conflict') {
        try {
          const latest = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/settings`);
          S.fn.applyStoreProfile(latest.settings);
          S.fn.render();
          S.fn.toast('Cài đặt đã được cập nhật ở thiết bị khác', 'Đã tải phiên bản mới. Kiểm tra lại trước khi lưu.', 'error');
        } catch (reloadError) { S.fn.toast('Chưa lưu được cài đặt', reloadError.message, 'error'); }
      } else S.fn.toast('Chưa lưu được cài đặt', error.message, 'error');
      if (submitButton) submitButton.disabled = false;
    }
  }


  S.fn.saveBusinessProfile = async function saveBusinessProfile(profile, form) {
    const feedback = form ? form.querySelector('[data-profile-error]') : S.dom.modal.querySelector('[data-profile-error]');
    if (!S.state.businessProfileOptions.some(function (item) { return item.value === profile; })) {
      if (feedback) { feedback.hidden = false; feedback.textContent = 'Hãy chọn một cách sử dụng cửa hàng.'; }
      return;
    }
    const submitButton = form?.querySelector('[type="submit"]') || S.dom.modal.querySelector('button[form="business-profile-onboarding"]');
    const generation = S.state.modalGeneration;
    const session = S.state.authSession;
    const storeId = S.state.store.id;
    const wasModalForm = Boolean(form?.closest('#modal'));
    const selectedFocus = form?.dataset.taskFocusEdited === 'true' ? String(new FormData(form).get('taskFocusRoute') || '') : '';
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/business-profile`, {
        method: 'PUT', body: { businessProfile: profile },
      });
      if (S.state.authSession !== session || S.state.store.id !== storeId) return;
      S.state.store.businessProfile = result.businessProfile;
      S.state.store.onboardingCompletedAt = result.onboardingCompletedAt;
      S.fn.emitSyncDomains(['settings'], { source: 'business-profile' });
      S.state.authSession.stores = S.state.authSession.stores.map(function (item) {
        return item.id === S.state.store.id ? Object.assign({}, item, { business_profile: result.businessProfile, onboarding_completed_at: result.onboardingCompletedAt }) : item;
      });
      if (S.state.offlineDisk) {
        try {
          const userId = S.state.authSession.user.id, saved = await S.state.offlineDisk.getMeta('session|' + userId);
          if (saved && await S.state.offlineDisk.getMeta('active-user') === userId) await S.state.offlineDisk.putMeta('session|' + userId, { ...saved, stores: S.state.authSession.stores });
        } catch (error) { S.state.offlineState.storageIssue = error.message; S.fn.updateOfflineStatus(); }
      }
      if (S.state.authSession !== session || S.state.store.id !== storeId) return;
      if (selectedFocus) {
        if (!S.fn.saveTaskFocusRoute(selectedFocus)) S.fn.saveTaskFocusRoute(S.fn.defaultTaskFocusRoute());
      } else if (S.state.taskFocusRoute && !S.fn.taskFocusOptions().some(function (option) { return option.route === S.state.taskFocusRoute; })) {
        S.fn.saveTaskFocusRoute(S.fn.defaultTaskFocusRoute());
      }
      if (S.state.modalGeneration !== generation || (wasModalForm && S.dom.modal.hidden)) {
        S.fn.renderShell();
        S.fn.toast('Đã lưu cách sắp xếp cửa hàng', S.fn.businessProfileLabel(profile));
        return;
      }
      if (wasModalForm) S.fn.closeModal();
      if (S.state.page === 'settings') S.fn.render();
      else if (!selectedFocus && profile === 'online' && S.fn.canAccessRoute('channels')) { S.state.channelState.view = 'orders'; S.fn.routeTo('channels'); }
      else {
        S.fn.renderShell();
        if (S.state.taskFocusRoute && S.state.taskFocusRoute !== S.state.page) S.fn.routeTo(S.state.taskFocusRoute);
      }
      S.fn.toast('Đã lưu cách sắp xếp cửa hàng', S.fn.businessProfileLabel(profile));
      S.fn.scheduleInitialGuidedTour();
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else if (feedback) { feedback.hidden = false; feedback.textContent = error.message; }
      else S.fn.toast('Chưa lưu được lựa chọn', error.message, 'error');
      if (submitButton && submitButton.isConnected) submitButton.disabled = false;
    }
  }


  S.fn.saveAccountPassword = async function saveAccountPassword(form) {
    if (!S.fn.updatePasswordConfirmation(form)) {
      const confirmation = form.querySelector('[data-password-confirm-for]');
      if (confirmation) confirmation.reportValidity();
      return;
    }
    const data = new FormData(form);
    const submitButton = form.querySelector('[type="submit"]');
    const feedback = form.querySelector('[data-password-feedback]');
    if (submitButton) submitButton.disabled = true;
    if (feedback) feedback.hidden = true;
    try {
      const result = await S.fn.apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword: String(data.get('currentPassword') || ''),
          newPassword: String(data.get('newPassword') || ''),
        },
      });
      form.reset();
      form.querySelectorAll('[data-action="toggle-password"]').forEach(function (button) {
        const input = document.getElementById(button.dataset.target);
        if (input) input.type = 'password';
        button.setAttribute('aria-label', 'Hiện mật khẩu');
        button.setAttribute('aria-pressed', 'false');
        button.title = 'Hiện mật khẩu';
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>';
      });
      await S.fn.loadAccountSecurity();
      S.fn.toast(result.message, 'Mật khẩu mới đã có hiệu lực.');
    } catch (error) {
      if (error.status === 401 && error.code === 'unauthorized') S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else if (feedback) { feedback.hidden = false; feedback.textContent = error.message; }
      else S.fn.toast('Chưa đổi được mật khẩu', error.message, 'error');
    } finally {
      if (submitButton && submitButton.isConnected) submitButton.disabled = false;
    }
  }

})(window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {}, charts: {} });
