(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.SlinkIntegrationsUI = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMoneyVnd(value) {
    const raw = String(value ?? '0').replace(/\s+/g, '').trim() || '0';
    if (!/^-?\d+$/.test(raw)) return '0 đ';
    return new Intl.NumberFormat('vi-VN').format(BigInt(raw)) + ' đ';
  }

  function getVietQrApi() {
    return root.SlinkVietQrTools || null;
  }

  function getBanksApi() {
    return root.SlinkBanksVn || null;
  }

  function renderVietQrCard({ bankBin, bankAccountNumber, bankAccountName, bankName, amountVnd, orderNumber, note, subtitle } = {}) {
    const qrApi = getVietQrApi();
    if (!qrApi || !bankBin || !bankAccountNumber) return '';
    const amountStr = String(amountVnd ?? '0').replace(/\D/g, '') || '0';
    const memo = note || (orderNumber ? `SLINK ${orderNumber}` : 'SLINK THANH TOAN');
    let svg = '';
    try {
      const payload = qrApi.buildVietQrPayload({
        bankBin,
        accountNumber: bankAccountNumber,
        amountVnd: amountStr,
        description: memo,
      });
      svg = qrApi.renderQrSvg(payload, {
        label: `VietQR ${bankName || bankBin} ${bankAccountNumber}`,
        quiet: 3,
        modulePx: 4,
      });
    } catch {
      return '';
    }
    const foundBank = getBanksApi()?.findBankByBin?.(bankBin);
    const resolvedBankName = bankName || foundBank?.shortName || `BIN ${bankBin}`;
    return `<div class='vietqr-card'>
      <div class='vietqr-svg-wrap'>${svg}</div>
      <div class='vietqr-meta'>
        <span class='eyebrow'>VIETQR CHUYỂN KHOẢN</span>
        <strong>${esc(resolvedBankName)} · ${esc(bankAccountNumber)}</strong>
        ${bankAccountName ? `<small>Chủ TK: ${esc(bankAccountName)}</small>` : ''}
        ${Number(amountStr) > 0 ? `<small class='vietqr-amount'>Số tiền: <strong>${esc(formatMoneyVnd(amountStr))}</strong></small>` : ''}
        <small>Nội dung CK: <code>${esc(qrApi.asciiClean(memo, 50))}</code></small>
        ${subtitle ? `<small class='muted'>${esc(subtitle)}</small>` : ''}
      </div>
    </div>`;
  }

  function renderPrinterHardwareSection({ escposCaps } = {}) {
    const caps = escposCaps || root.SlinkEscPosPrinter?.capabilities?.() || { serialSupported: false, connected: false };
    const printerSupported = Boolean(caps.serialSupported || caps.btSupported);
    if (!printerSupported) {
      return `<section class='panel settings-panel'>
        <div class='panel-header'><h2>Máy in nhiệt &amp; Két tiền</h2></div>
        <div class='integration-hardware-bar'>
          <div>
            <strong>Chế độ in trình duyệt / PDF</strong>
            <small>Hỗ trợ in hệ thống hoặc gửi ảnh PNG. Dùng Slink Android để in Bluetooth.</small>
          </div>
        </div>
      </section>`;
    }
    const printerTitle = caps.btSupported ? 'Máy in nhiệt Bluetooth (58mm / 80mm)' : 'Máy in nhiệt USB / COM';
    const printerSubtitle = caps.btSupported
      ? (caps.btDeviceName ? `Đã chọn: ${caps.btDeviceName}` : 'Chưa chọn máy in Bluetooth')
      : (caps.connected ? 'Đã kết nối' : 'Máy in 58mm / 80mm');
    return `<section class='panel settings-panel'>
      <div class='panel-header'><h2>Máy in nhiệt &amp; Két tiền</h2></div>
      <div class='integration-hardware-bar'>
        <div>
          <strong>${esc(printerTitle)}</strong>
          <small>${esc(printerSubtitle)}</small>
        </div>
        <div class='integration-hardware-actions'>
          <button class='btn btn-secondary' type='button' data-action='escpos-connect'>${caps.connected ? 'Đổi máy in' : 'Chọn máy in'}</button>
          <button class='btn btn-secondary' type='button' data-action='escpos-test-print'>In thử</button>
          <button class='btn btn-secondary' type='button' data-action='escpos-kick-drawer'>Mở két</button>
        </div>
      </div>
    </section>`;
  }

  function renderIntegrationSettingsSection({ data, loading, error, canEdit, escposCaps, includeHardware = true } = {}) {
    const settings = data?.settings || {};
    const webhookUrls = data?.webhookUrls || {};
    const connectors = Array.isArray(data?.connectors) ? data.connectors : [];
    const banks = getBanksApi()?.VN_BANKS || [];
    const disabled = canEdit ? '' : 'disabled';
    const caps = escposCaps || root.SlinkEscPosPrinter?.capabilities?.() || { serialSupported: false, connected: false };

    const bankOptions = `<option value=''>— Chọn ngân hàng —</option>` + banks.map((b) =>
      `<option value='${esc(b.bin)}' ${settings.bankBin === b.bin ? 'selected' : ''}>${esc(b.shortName)} (${esc(b.code)})</option>`
    ).join('');

    const webhookOptions = [
      ['none', 'Xác nhận thủ công'],
      ['sepay', 'SePay'],
      ['casso', 'Casso'],
      ['payos', 'PayOS'],
    ].map(([v, label]) => `<option value='${esc(v)}' ${(settings.bankWebhookProvider || 'none') === v ? 'selected' : ''}>${esc(label)}</option>`).join('');

    const einvoiceOptions = [
      ['none', 'Chưa sử dụng'],
      ['misa', 'MISA meInvoice'],
      ['viettel', 'Viettel S-Invoice'],
      ['vnpt', 'VNPT Invoice'],
    ].map(([v, label]) => `<option value='${esc(v)}' ${(settings.einvoiceProvider || 'none') === v ? 'selected' : ''}>${esc(label)}</option>`).join('');

    const shippingOptions = [
      ['none', 'Tự giao'],
      ['ghn', 'Giao Hàng Nhanh (GHN)'],
      ['ghtk', 'Giao Hàng Tiết Kiệm (GHTK)'],
      ['viettelpost', 'Viettel Post'],
    ].map(([v, label]) => `<option value='${esc(v)}' ${(settings.shippingProvider || 'none') === v ? 'selected' : ''}>${esc(label)}</option>`).join('');

    const previewQr = settings.bankBin && settings.bankAccountNumber
      ? renderVietQrCard({
        bankBin: settings.bankBin,
        bankAccountNumber: settings.bankAccountNumber,
        bankAccountName: settings.bankAccountName,
        bankName: settings.bankName,
        amountVnd: '100000',
        note: 'SLINK TEST',
      })
      : '';

    const credentials = data?.credentials || {};
    const credField = (key, label, placeholder = '', type = 'password') => {
      const info = credentials[key] || {};
      const hint = info.set ? `Đã lưu (${info.masked || '••••'})` : (placeholder || 'Chưa gắn khóa');
      const clearBtn = (canEdit && info.set)
        ? `<button type='button' class='link-button' data-action='clear-integration-cred' data-cred-key='${esc(key)}' style='font-size:11.5px;padding:0 6px;min-height:24px'>Xóa</button>`
        : '';
      return `<div class='form-field'>
        <div style='display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:4px'>
          <label class='input-label' for='int-cred-${esc(key)}' style='margin:0'>${esc(label)}</label>
          ${clearBtn}
        </div>
        <input class='input' id='int-cred-${esc(key)}' name='cred:${esc(key)}' type='${type}' value='' maxlength='512' autocomplete='off' placeholder='${esc(hint)}' ${disabled}/>
      </div>`;
    };

    const connectorStatusLabel = {
      active: ['Hoạt động', 'is-ok'],
      configured: ['Đã kết nối', 'is-ok'],
      needs_store_config: ['Cần STK', 'is-warn'],
      needs_credentials: ['Chưa gắn khóa', 'is-muted'],
    };
    const coreConnectors = connectors.filter((c) => ['vietqr', 'escpos', 'bank_webhook', 'ewallets', 'einvoice', 'shipping'].includes(c.id));
    const connectorsGridHtml = coreConnectors.length
      ? `<div class='integration-status-grid'>${coreConnectors.map((c) => {
          const [badgeText, badgeTone] = connectorStatusLabel[c.status] || ['Chưa cấu hình', 'is-muted'];
          return `<div class='integration-status-card'>
            <div class='integration-status-head'>
              <strong>${esc(c.name)}</strong>
              <span class='integration-badge ${badgeTone}'>${esc(badgeText)}</span>
            </div>
          </div>`;
        }).join('')}</div>`
      : '';

    const hasBankWebhook = Boolean(settings.bankWebhookProvider && settings.bankWebhookProvider !== 'none');
    const activeWebhookUrl = hasBankWebhook ? (webhookUrls[settings.bankWebhookProvider] || '') : '';
    const ghnShopId = data?.ghnShopId || '';
    const hasAnyCredSet = Object.values(credentials).some((c) => c && c.set);
    const hasAdvancedConfigured = Boolean(
      hasBankWebhook
      || hasAnyCredSet
      || (settings.einvoiceProvider && settings.einvoiceProvider !== 'none')
      || (settings.shippingProvider && settings.shippingProvider !== 'none')
      || settings.taxCode
    );

    const printerSupported = Boolean(caps.serialSupported || caps.btSupported);
    const printerTitle = caps.btSupported ? 'Máy in nhiệt Bluetooth (58mm / 80mm)' : 'Máy in nhiệt USB / COM';
    const printerSubtitle = caps.btSupported
      ? (caps.btDeviceName ? `Đã chọn: ${caps.btDeviceName}` : 'Ghép đôi máy in trong Cài đặt điện thoại rồi chọn tại đây')
      : (caps.connected ? 'Đã kết nối' : 'Máy in 58mm / 80mm');
    const serialHardwareHtml = (includeHardware && printerSupported)
      ? `<div class='integration-hardware-bar' style='margin-top:12px'>
          <div>
            <strong>${esc(printerTitle)}</strong>
            <small>${esc(printerSubtitle)}</small>
          </div>
          <div class='integration-hardware-actions'>
            <button class='btn btn-secondary' type='button' data-action='escpos-connect'>${caps.connected ? 'Đổi máy in' : 'Chọn máy in'}</button>
            <button class='btn btn-secondary' type='button' data-action='escpos-test-print'>In thử</button>
            <button class='btn btn-secondary' type='button' data-action='escpos-kick-drawer'>Mở két</button>
          </div>
        </div>`
      : '';

    const ghnReady = Boolean(credentials.GHN_TOKEN?.set || ghnShopId || settings.shippingProvider === 'ghn');
    const advancedBlock = `<details class='settings-advanced-fold' ${hasAdvancedConfigured ? 'open' : ''} style='margin-top:14px'>
          <summary style='cursor:pointer;font-weight:600;color:var(--ink)'>Cấu hình & Khóa dịch vụ bên thứ 3</summary>
          <div class='form-grid' style='margin-top:12px'>
            <div class='form-field full'>
              <label class='input-label' for='int-shipping-provider'>Đơn vị vận chuyển${ghnShopId ? ` · GHN #${esc(ghnShopId)}` : ''}</label>
              <div style='display:flex;gap:8px;flex-wrap:wrap;align-items:center'>
                <div class='select-wrap' style='flex:1 1 200px'><select class='input' id='int-shipping-provider' name='shippingProvider' ${disabled}>${shippingOptions}</select></div>
                ${canEdit && ghnReady ? `<button class='btn btn-secondary' type='button' data-action='verify-ghn-token'>Kiểm tra GHN</button>` : ''}
              </div>
            </div>
            ${credField('GHN_TOKEN', 'GHN Token', 'Nhập API Token GHN')}
            ${credField('GHN_SHOP_ID', 'GHN Shop ID', 'Tự nhận nếu để trống', 'text')}
            ${credField('GHTK_TOKEN', 'GHTK Token', 'Nhập Token GHTK')}
            ${credField('VTP_TOKEN', 'Viettel Post Token', 'Nhập Token Viettel Post')}

            <div class='form-field full'>
              <label class='input-label' for='int-bank-webhook'>Đối soát chuyển khoản tự động</label>
              <div class='select-wrap'><select class='input' id='int-bank-webhook' name='bankWebhookProvider' ${disabled}>${webhookOptions}</select></div>
            </div>
            ${activeWebhookUrl ? `<div class='form-field full'>
              <div class='integration-webhook-box'>
                <div>
                  <span class='input-label' style='margin:0 0 4px'>Webhook URL (${esc(String(settings.bankWebhookProvider).toUpperCase())})</span>
                  <code>${esc(activeWebhookUrl)}</code>
                </div>
                <button class='btn btn-secondary' type='button' data-action='copy-integration-url' data-copy-value='${esc(activeWebhookUrl)}'>Sao chép</button>
              </div>
            </div>` : ''}
            ${credField('SEPAY_WEBHOOK_TOKEN', 'SePay API / Webhook Token', 'Khóa xác thực SePay')}
            ${credField('CASSO_SECURE_TOKEN', 'Casso Secure Token', 'Khóa xác thực Casso')}
            ${credField('PAYOS_CLIENT_ID', 'PayOS Client ID', 'Mã Client PayOS', 'text')}
            ${credField('PAYOS_API_KEY', 'PayOS API Key', 'Khóa API PayOS')}
            ${credField('PAYOS_CHECKSUM_KEY', 'PayOS Checksum Key', 'Khóa Checksum PayOS')}

            ${credField('MOMO_PARTNER_CODE', 'MoMo Partner Code', 'Mã đối tác MoMo', 'text')}
            ${credField('MOMO_ACCESS_KEY', 'MoMo Access Key', 'Access Key MoMo')}
            ${credField('MOMO_SECRET_KEY', 'MoMo Secret Key', 'Secret Key MoMo')}
            ${credField('VNPAY_TMN_CODE', 'VNPAY TmnCode', 'Mã website VNPAY', 'text')}
            ${credField('VNPAY_HASH_SECRET', 'VNPAY HashSecret', 'Chuỗi bí mật VNPAY')}

            <div class='form-field'>
              <label class='input-label' for='int-einvoice-provider'>Hóa đơn điện tử</label>
              <div class='select-wrap'><select class='input' id='int-einvoice-provider' name='einvoiceProvider' ${disabled}>${einvoiceOptions}</select></div>
            </div>
            <div class='form-field'>
              <label class='input-label' for='int-tax-code'>Mã số thuế</label>
              <input class='input' id='int-tax-code' name='taxCode' value='${esc(settings.taxCode || '')}' maxlength='14' placeholder='Không bắt buộc' ${disabled}/>
            </div>
            <div class='form-field'>
              <label class='input-label' for='int-einvoice-template'>Mẫu số HĐ</label>
              <input class='input' id='int-einvoice-template' name='einvoiceTemplateCode' value='${esc(settings.einvoiceTemplateCode || '')}' maxlength='40' placeholder='VD: 1' ${disabled}/>
            </div>
            <div class='form-field'>
              <label class='input-label' for='int-einvoice-serial'>Ký hiệu HĐ</label>
              <input class='input' id='int-einvoice-serial' name='einvoiceSerial' value='${esc(settings.einvoiceSerial || '')}' maxlength='40' placeholder='VD: 1C26TYY' ${disabled}/>
            </div>
            ${credField('MISA_EINVOICE_URL', 'MISA meInvoice URL', 'https://...', 'url')}
            ${credField('MISA_APP_ID', 'MISA App ID', 'App ID MISA', 'text')}
            ${credField('MISA_SECRET', 'MISA Secret', 'Secret Key MISA')}
            ${credField('VIETTEL_EINVOICE_URL', 'Viettel S-Invoice URL', 'https://...', 'url')}
            ${credField('VIETTEL_EINVOICE_USER', 'Viettel S-Invoice User', 'Tài khoản Viettel', 'text')}
            ${credField('VIETTEL_EINVOICE_PASS', 'Viettel S-Invoice Pass', 'Mật khẩu Viettel')}
          </div>
        </details>`;

    return `<section class='panel settings-panel integrations-panel' id='integrations-panel'>
      <div class='panel-header'>
        <div>
          <h2>Thanh toán & Dịch vụ bên thứ 3</h2>
        </div>
      </div>
      ${loading ? `<div class='install-hint' role='status'>Đang tải…</div>` : ''}
      ${error ? `<div class='auth-message error' role='alert'>${esc(error)}</div>` : ''}
      ${connectorsGridHtml}
      <form id='integration-settings-form' data-form='integration-settings'>
        <div class='form-grid'>
          <div class='form-field'>
            <label class='input-label' for='int-bank-bin'>Ngân hàng (VietQR)</label>
            <div class='select-wrap'><select class='input' id='int-bank-bin' name='bankBin' ${disabled}>${bankOptions}</select></div>
          </div>
          <div class='form-field'>
            <label class='input-label' for='int-bank-account'>Số tài khoản</label>
            <input class='input' id='int-bank-account' name='bankAccountNumber' value='${esc(settings.bankAccountNumber || '')}' maxlength='32' autocomplete='off' placeholder='Nhập số tài khoản' ${disabled}/>
          </div>
          <div class='form-field full'>
            <label class='input-label' for='int-bank-owner'>Chủ tài khoản</label>
            <input class='input' id='int-bank-owner' name='bankAccountName' value='${esc(settings.bankAccountName || '')}' maxlength='120' placeholder='VD: NGUYEN VAN A' ${disabled}/>
          </div>
          <div class='form-field full' id='int-vietqr-preview' ${previewQr ? '' : 'hidden'}>${previewQr}</div>
        </div>
        ${advancedBlock}
        ${canEdit ? `<div class='modal-footer settings-form-footer'><button class='btn btn-primary' type='submit'>Lưu cấu hình tích hợp</button></div>` : ''}
      </form>
      ${serialHardwareHtml}
    </section>`;
  }

  function renderOrderIntegrationSection({ order, settings, role, canOperate: canOperateOpt, canShipping: canShippingOpt } = {}) {
    if (!order) return '';
    const canOperate = canOperateOpt !== undefined
      ? Boolean(canOperateOpt)
      : ['owner', 'manager', 'cashier', 'accountant'].includes(role);
    const canShipping = canShippingOpt !== undefined
      ? Boolean(canShippingOpt)
      : (canOperate || role === 'stockkeeper');
    const qrHtml = (order.due > 0 && settings?.bankBin && settings?.bankAccountNumber)
      ? renderVietQrCard({
        bankBin: settings.bankBin,
        bankAccountNumber: settings.bankAccountNumber,
        bankAccountName: settings.bankAccountName,
        bankName: settings.bankName,
        amountVnd: order.dueVndText || String(order.due),
        orderNumber: order.number,
        note: `SLINK ${order.number}`,
      })
      : '';

    const hasEinvoice = Boolean(settings?.einvoiceProvider && settings.einvoiceProvider !== 'none');
    const einvoiceStatus = order.einvoiceStatus === 'issued'
      ? `<span class='badge badge-success'><i class='badge-dot'></i>HĐĐT ${esc(order.einvoiceNumber || 'Đã phát hành')}${order.einvoiceLookupCode ? ` · ${esc(order.einvoiceLookupCode)}` : ''}</span>`
      : (hasEinvoice && canOperate && order.rawStatus !== 'voided'
        ? `<button class='btn btn-secondary' type='button' data-action='issue-order-einvoice' data-id='${esc(order.id)}'>Xuất HĐĐT</button>`
        : '');

    const hasShipping = Boolean(settings?.shippingProvider && settings.shippingProvider !== 'none');
    const shippingStatus = order.shippingTrackingCode
      ? `<span class='badge badge-info'><i class='badge-dot'></i>Vận đơn ${esc((order.shippingProvider || '').toUpperCase())}: ${esc(order.shippingTrackingCode)}</span>`
      : (hasShipping && canShipping && order.rawStatus !== 'voided'
        ? `<button class='btn btn-secondary' type='button' data-action='create-order-shipping' data-id='${esc(order.id)}'>Tạo vận đơn</button>`
        : '');

    const hasMomo = Boolean(settings?.momoConfigured);
    const momoBtn = (hasMomo && canOperate && order.due > 0 && order.rawStatus !== 'voided')
      ? `<button class='btn btn-secondary' type='button' data-action='create-order-momo' data-id='${esc(order.id)}'>MoMo</button>`
      : '';

    const caps = root.SlinkEscPosPrinter?.capabilities?.() || {};
    const serialSupported = Boolean(caps.serialSupported || caps.btSupported);
    const escposBtn = serialSupported
      ? `<button class='btn btn-secondary' type='button' data-action='escpos-print-order' data-id='${esc(order.id)}'>In bill nhiệt</button>`
      : '';

    if (!qrHtml && !einvoiceStatus && !shippingStatus && !escposBtn && !momoBtn) return '';

    return `${qrHtml}${escposBtn || momoBtn || einvoiceStatus || shippingStatus ? `<div class='order-integration-bar'>${escposBtn}${momoBtn}${einvoiceStatus}${shippingStatus}</div>` : ''}`;
  }

  return {
    renderVietQrCard,
    renderPrinterHardwareSection,
    renderIntegrationSettingsSection,
    renderOrderIntegrationSection,
  };
}));
