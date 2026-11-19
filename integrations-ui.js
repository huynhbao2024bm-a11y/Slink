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

  function renderIntegrationSettingsSection({ data, loading, error, canEdit, escposCaps } = {}) {
    const settings = data?.settings || {};
    const webhookUrls = data?.webhookUrls || {};
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

    const hasBankWebhook = Boolean(settings.bankWebhookProvider && settings.bankWebhookProvider !== 'none');
    const activeWebhookUrl = hasBankWebhook ? (webhookUrls[settings.bankWebhookProvider] || '') : '';
    const ghnShopId = data?.ghnShopId || '';
    const hasAdvancedConfigured = Boolean(
      hasBankWebhook
      || (settings.einvoiceProvider && settings.einvoiceProvider !== 'none')
      || (settings.shippingProvider && settings.shippingProvider !== 'none')
      || settings.taxCode
    );

    const serialHardwareHtml = caps.serialSupported
      ? `<div class='integration-hardware-bar' style='margin-top:12px'>
          <div>
            <strong>Máy in nhiệt USB / COM</strong>
            <small>${caps.connected ? 'Đã kết nối' : 'Máy in 58mm / 80mm'}</small>
          </div>
          <div class='integration-hardware-actions'>
            <button class='btn btn-secondary' type='button' data-action='escpos-connect'>${caps.connected ? 'Đổi máy in' : 'Kết nối'}</button>
            <button class='btn btn-secondary' type='button' data-action='escpos-test-print'>In thử</button>
            <button class='btn btn-secondary' type='button' data-action='escpos-kick-drawer'>Mở két</button>
          </div>
        </div>`
      : '';

    const advancedBlock = hasAdvancedConfigured
      ? `<details class='settings-advanced-fold' style='margin-top:14px'>
          <summary style='cursor:pointer;font-weight:600;color:var(--muted)'>Kết nối mở rộng đã cấu hình</summary>
          <div class='form-grid' style='margin-top:12px'>
            <div class='form-field full'>
              <label class='input-label' for='int-shipping-provider'>Đơn vị vận chuyển${ghnShopId ? ` · GHN #${esc(ghnShopId)}` : ''}</label>
              <div style='display:flex;gap:8px;flex-wrap:wrap;align-items:center'>
                <div class='select-wrap' style='flex:1 1 220px'><select class='input' id='int-shipping-provider' name='shippingProvider' ${disabled}>${shippingOptions}</select></div>
                ${canEdit && ghnShopId ? `<button class='btn btn-secondary' type='button' data-action='verify-ghn-token'>Kiểm tra GHN</button>` : ''}
              </div>
            </div>
            <div class='form-field'>
              <label class='input-label' for='int-bank-webhook'>Đối soát chuyển khoản</label>
              <div class='select-wrap'><select class='input' id='int-bank-webhook' name='bankWebhookProvider' ${disabled}>${webhookOptions}</select></div>
            </div>
            <div class='form-field'>
              <label class='input-label' for='int-einvoice-provider'>Hóa đơn điện tử</label>
              <div class='select-wrap'><select class='input' id='int-einvoice-provider' name='einvoiceProvider' ${disabled}>${einvoiceOptions}</select></div>
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
          </div>
        </details>`
      : '';

    return `<section class='panel settings-panel integrations-panel' id='integrations-panel'>
      <div class='panel-header'>
        <div>
          <h2>Tài khoản nhận chuyển khoản (VietQR)</h2>
        </div>
      </div>
      ${loading ? `<div class='install-hint' role='status'>Đang tải…</div>` : ''}
      ${error ? `<div class='auth-message error' role='alert'>${esc(error)}</div>` : ''}
      <form id='integration-settings-form' data-form='integration-settings'>
        <div class='form-grid'>
          <div class='form-field'>
            <label class='input-label' for='int-bank-bin'>Ngân hàng</label>
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
        ${canEdit ? `<div class='modal-footer' style='padding:17px 0 0;margin-top:12px'><button class='btn btn-primary' type='submit'>Lưu tài khoản VietQR</button></div>` : ''}
      </form>
      ${serialHardwareHtml}
    </section>`;
  }

  function renderOrderIntegrationSection({ order, settings, role } = {}) {
    if (!order) return '';
    const canOperate = ['owner', 'manager', 'cashier', 'accountant'].includes(role);
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
      : (hasShipping && (canOperate || role === 'stockkeeper') && order.rawStatus !== 'voided'
        ? `<button class='btn btn-secondary' type='button' data-action='create-order-shipping' data-id='${esc(order.id)}'>Tạo vận đơn</button>`
        : '');

    const hasMomo = Boolean(settings?.momoConfigured);
    const momoBtn = (hasMomo && canOperate && order.due > 0 && order.rawStatus !== 'voided')
      ? `<button class='btn btn-secondary' type='button' data-action='create-order-momo' data-id='${esc(order.id)}'>MoMo</button>`
      : '';

    const serialSupported = Boolean(root.SlinkEscPosPrinter?.capabilities?.().serialSupported);
    const escposBtn = serialSupported
      ? `<button class='btn btn-secondary' type='button' data-action='escpos-print-order' data-id='${esc(order.id)}'>In bill nhiệt</button>`
      : '';

    if (!qrHtml && !einvoiceStatus && !shippingStatus && !escposBtn && !momoBtn) return '';

    return `${qrHtml}${escposBtn || momoBtn || einvoiceStatus || shippingStatus ? `<div class='order-integration-bar'>${escposBtn}${momoBtn}${einvoiceStatus}${shippingStatus}</div>` : ''}`;
  }

  return {
    renderVietQrCard,
    renderIntegrationSettingsSection,
    renderOrderIntegrationSection,
  };
}));
