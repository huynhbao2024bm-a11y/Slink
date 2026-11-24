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
      return `<section class='panel settings-panel settings-card'>
        <div class='settings-card-head'><h2>Máy in hóa đơn &amp; Két tiền</h2></div>
        <div class='settings-partner-row'>
          <div class='settings-partner-info'>
            <span class='settings-partner-badge'>IN</span>
            <div>
              <strong>In trực tiếp qua trình duyệt</strong>
              <small class='muted'>Dùng ứng dụng Slink Android để kết nối máy in nhiệt Bluetooth.</small>
            </div>
          </div>
          <span class='partner-status-pill is-ready'>Sẵn sàng</span>
        </div>
      </section>`;
    }
    const printerTitle = caps.btSupported ? 'Máy in nhiệt Bluetooth (58mm / 80mm)' : 'Máy in nhiệt USB';
    const printerSubtitle = caps.btSupported
      ? (caps.btDeviceName ? `Đã chọn: ${caps.btDeviceName}` : 'Chưa chọn máy in Bluetooth')
      : (caps.connected ? 'Đã kết nối' : 'Chưa kết nối máy in');
    return `<section class='panel settings-panel settings-card'>
      <div class='settings-card-head'><h2>Máy in hóa đơn &amp; Két tiền</h2></div>
      <div class='settings-partner-row'>
        <div class='settings-partner-info'>
          <span class='settings-partner-badge'>IN</span>
          <div>
            <strong>${esc(printerTitle)}</strong>
            <small class='muted'>${esc(printerSubtitle)}</small>
          </div>
        </div>
        <div class='integration-hardware-actions'>
          <button class='btn btn-secondary btn-sm' type='button' data-action='escpos-connect'>${caps.connected ? 'Đổi máy in' : 'Chọn máy in'}</button>
          <button class='btn btn-secondary btn-sm' type='button' data-action='escpos-test-print'>In thử</button>
          <button class='btn btn-secondary btn-sm' type='button' data-action='escpos-kick-drawer'>Mở két</button>
        </div>
      </div>
    </section>`;
  }

  function renderPartnerRowsHtml(groups, settings, connectors) {
    const connectorMap = new Map((connectors || []).map((item) => [item.id, item]));
    return `<div class='settings-partner-groups'>
      ${groups.map((group) => `<div class='settings-partner-group'>
        <h3>${esc(group.title)}</h3>
        <div class='settings-partner-list'>
          ${group.items.map((item) => {
            const c = connectorMap.get(item.id);
            const active = item.isConnected ? item.isConnected(settings, c) : Boolean(c?.status === 'configured');
            const statusHtml = active
              ? `<span class='partner-status-pill is-ok'>Đã kết nối</span>`
              : `<span class='partner-status-pill'>Chưa kết nối</span>`;
            const actionHtml = active
              ? ''
              : `<button class='btn btn-secondary btn-sm' type='button' data-action='partner-connect' data-partner-name='${esc(item.name)}'>Kết nối</button>`;
            return `<div class='settings-partner-row'>
              <div class='settings-partner-info'>
                <span class='settings-partner-badge'>${esc(item.code)}</span>
                <strong>${esc(item.name)}</strong>
              </div>
              <div class='settings-partner-actions'>${statusHtml}${actionHtml}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`).join('')}
    </div>`;
  }

  function renderIntegrationSettingsSection({ data, loading, error, canEdit } = {}) {
    const settings = data?.settings || {};
    const connectors = Array.isArray(data?.connectors) ? data.connectors : [];
    const banks = getBanksApi()?.VN_BANKS || [];
    const formReady = !loading && Boolean(data);
    const disabled = (canEdit && formReady) ? '' : 'disabled';

    const bankOptions = `<option value=''>— Chọn ngân hàng —</option>` + banks.map((b) =>
      `<option value='${esc(b.bin)}' ${settings.bankBin === b.bin ? 'selected' : ''}>${esc(b.shortName)} (${esc(b.code)})</option>`
    ).join('');

    const partnerGroups = [
      {
        title: 'Đơn vị vận chuyển',
        items: [
          { id: 'shipping', code: 'GHN', name: 'Giao Hàng Nhanh (GHN)', isConnected: (s, c) => Boolean(c?.providers?.ghn && s.shippingProvider === 'ghn') },
          { id: 'shipping', code: 'GHTK', name: 'Giao Hàng Tiết Kiệm', isConnected: (s, c) => Boolean(c?.providers?.ghtk && s.shippingProvider === 'ghtk') },
          { id: 'shipping', code: 'VTP', name: 'Viettel Post', isConnected: (s, c) => Boolean(c?.providers?.viettelpost && s.shippingProvider === 'viettelpost') },
        ],
      },
      {
        title: 'Thanh toán & Đối soát',
        items: [
          { id: 'bank_webhook', code: 'CK', name: 'Đối soát biến động ngân hàng', isConnected: (s, c) => Boolean(c?.status === 'configured' && s.bankWebhookProvider && s.bankWebhookProvider !== 'none') },
          { id: 'ewallets', code: 'MM', name: 'Ví MoMo', isConnected: (s, c) => Boolean(c?.providers?.momo || s.momoConfigured) },
          { id: 'ewallets', code: 'VN', name: 'VNPAY', isConnected: (s, c) => Boolean(c?.providers?.vnpay || s.vnpayConfigured) },
        ],
      },
      {
        title: 'Hóa đơn & Sàn thương mại',
        items: [
          { id: 'einvoice', code: 'HĐ', name: 'Hóa đơn điện tử', isConnected: (s, c) => Boolean(c?.status === 'configured' && s.einvoiceProvider && s.einvoiceProvider !== 'none') },
          { id: 'marketplaces', code: 'SÀN', name: 'Shopee / TikTok Shop', isConnected: (_s, c) => Boolean(c?.status === 'configured' && (c?.providers?.shopee || c?.providers?.tiktok)) },
        ],
      },
    ];

    return `<section class='panel settings-panel settings-card integrations-panel' id='integrations-panel'>
      <div class='settings-card-head'><h2>Tài khoản ngân hàng nhận tiền</h2></div>
      ${loading ? `<div class='install-hint' role='status'>Đang tải…</div>` : ''}
      ${error ? `<div class='auth-message error' role='alert'>${esc(error)}</div>` : ''}
      <form id='integration-settings-form' data-form='integration-settings'>
        <div class='settings-bank-grid'>
          <div class='form-field'>
            <label class='input-label' for='int-bank-bin'>Ngân hàng</label>
            <div class='select-wrap'><select class='input' id='int-bank-bin' name='bankBin' ${disabled}>${bankOptions}</select></div>
          </div>
          <div class='form-field'>
            <label class='input-label' for='int-bank-account'>Số tài khoản</label>
            <input class='input' id='int-bank-account' name='bankAccountNumber' value='${esc(settings.bankAccountNumber || '')}' maxlength='32' autocomplete='off' placeholder='Nhập số tài khoản' ${disabled}/>
          </div>
          <div class='form-field'>
            <label class='input-label' for='int-bank-owner'>Chủ tài khoản</label>
            <input class='input' id='int-bank-owner' name='bankAccountName' value='${esc(settings.bankAccountName || '')}' maxlength='120' placeholder='VD: NGUYEN VAN A' ${disabled}/>
          </div>
        </div>
        ${canEdit ? `<div class='modal-footer settings-form-footer'><button class='btn btn-primary' type='submit' ${formReady ? '' : 'disabled'}>Lưu tài khoản</button></div>` : ''}
      </form>
    </section>
    <section class='panel settings-panel settings-card'>
      <div class='settings-card-head'><h2>Kết nối đối tác</h2></div>
      ${renderPartnerRowsHtml(partnerGroups, settings, connectors)}
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
    const qrHtml = '';

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

    const hasVnpay = Boolean(settings?.vnpayConfigured);
    const vnpayBtn = (hasVnpay && canOperate && order.due > 0 && order.rawStatus !== 'voided')
      ? `<button class='btn btn-secondary' type='button' data-action='create-order-vnpay' data-id='${esc(order.id)}'>VNPAY</button>`
      : '';

    const caps = root.SlinkEscPosPrinter?.capabilities?.() || {};
    const serialSupported = Boolean(caps.serialSupported || caps.btSupported);
    const escposBtn = serialSupported
      ? `<button class='btn btn-secondary' type='button' data-action='escpos-print-order' data-id='${esc(order.id)}'>In bill nhiệt</button>`
      : '';

    if (!qrHtml && !einvoiceStatus && !shippingStatus && !escposBtn && !momoBtn && !vnpayBtn) return '';

    return `${qrHtml}${escposBtn || momoBtn || vnpayBtn || einvoiceStatus || shippingStatus ? `<div class='order-integration-bar'>${escposBtn}${momoBtn}${vnpayBtn}${einvoiceStatus}${shippingStatus}</div>` : ''}`;
  }

  return {
    renderVietQrCard,
    renderPrinterHardwareSection,
    renderIntegrationSettingsSection,
    renderOrderIntegrationSection,
  };
}));
