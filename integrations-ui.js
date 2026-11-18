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

  function connectorStatusMeta(status) {
    if (status === 'active') return { cls: 'badge-success', text: 'Chạy ngay · 0 khóa' };
    if (status === 'configured') return { cls: 'badge-success', text: 'Đã gắn khóa .env' };
    if (status === 'needs_store_config') return { cls: 'badge-warning', text: 'Chờ nhập TK cửa hàng' };
    return { cls: 'badge-neutral', text: 'Chờ khóa đối tác' };
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
        <span class='eyebrow'>VIETQR CHUẨN NAPAS · OFFLINE 100%</span>
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
    const connectors = Array.isArray(data?.connectors) ? data.connectors : [];
    const webhookUrls = data?.webhookUrls || {};
    const banks = getBanksApi()?.VN_BANKS || [];
    const disabled = canEdit ? '' : 'disabled';
    const caps = escposCaps || root.SlinkEscPosPrinter?.capabilities?.() || { serialSupported: false, connected: false };

    const bankOptions = `<option value=''>— Chưa chọn ngân hàng —</option>` + banks.map((b) =>
      `<option value='${esc(b.bin)}' ${settings.bankBin === b.bin ? 'selected' : ''}>${esc(b.shortName)} (${esc(b.code)} · ${esc(b.bin)})</option>`
    ).join('');

    const webhookOptions = [
      ['none', 'Tạm tắt — đối soát thủ công'],
      ['sepay', 'SePay Webhook (Khuyên dùng · hỗ trợ ĐV Việt Nam)'],
      ['casso', 'Casso Webhook v2'],
      ['payos', 'PayOS / VietQR tự động'],
    ].map(([v, label]) => `<option value='${esc(v)}' ${(settings.bankWebhookProvider || 'none') === v ? 'selected' : ''}>${esc(label)}</option>`).join('');

    const einvoiceOptions = [
      ['none', 'Chưa kích hoạt Hóa đơn điện tử'],
      ['misa', 'MISA meInvoice (NĐ 123 / NĐ 70)'],
      ['viettel', 'Viettel S-Invoice'],
      ['vnpt', 'VNPT Invoice'],
    ].map(([v, label]) => `<option value='${esc(v)}' ${(settings.einvoiceProvider || 'none') === v ? 'selected' : ''}>${esc(label)}</option>`).join('');

    const shippingOptions = [
      ['none', 'Chưa chọn ĐVVC mặc định'],
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
        note: 'SLINK TEST VIETQR',
        subtitle: 'Mã thử 100.000 đ — quét bằng mọi app ngân hàng VN để kiểm tra.',
      })
      : `<div class='install-hint'>Chọn ngân hàng + nhập số tài khoản bên cạnh để tạo mã VietQR động tự động tại POS và nhắc nợ.</div>`;

    const activeWebhookUrl = settings.bankWebhookProvider && settings.bankWebhookProvider !== 'none'
      ? webhookUrls[settings.bankWebhookProvider] || ''
      : '';

    const connectorCards = connectors.map((c) => {
      const meta = connectorStatusMeta(c.status);
      const missing = Array.isArray(c.missingKeys) && c.missingKeys.length
        ? `<small class='integration-missing'>Cần gắn: <code>${esc(c.missingKeys.join(', '))}</code></small>`
        : `<small class='integration-ready-note'>Đã sẵn sàng để sử dụng.</small>`;
      return `<article class='integration-connector-card'>
        <div class='integration-connector-head'>
          <strong>${esc(c.name)}</strong>
          <span class='badge ${meta.cls}'><i class='badge-dot'></i>${esc(meta.text)}</span>
        </div>
        <p>${esc(c.description)}</p>
        ${missing}
      </article>`;
    }).join('');

    return `<section class='panel settings-panel integrations-panel' id='integrations-panel'>
      <div class='panel-header'>
        <div>
          <h2>Tích hợp thương mại &amp; Thiết bị POS</h2>
          <p>VietQR &amp; máy in ESC/POS chạy ngay không cần khóa. Webhook ngân hàng, HĐĐT, vận chuyển và sàn chỉ cần gắn biến .env để kích hoạt.</p>
        </div>
        <button class='link-button' type='button' data-action='reload-integrations'>Làm mới trạng thái</button>
      </div>
      ${loading ? `<div class='install-hint' role='status'>Đang tải cấu hình tích hợp…</div>` : ''}
      ${error ? `<div class='auth-message error' role='alert'>${esc(error)}</div>` : ''}
      <form id='integration-settings-form' data-form='integration-settings'>
        <div class='form-grid'>
          <div class='form-field'>
            <label class='input-label' for='int-bank-bin'>Ngân hàng nhận VietQR (NAPAS)</label>
            <div class='select-wrap'><select class='input' id='int-bank-bin' name='bankBin' ${disabled}>${bankOptions}</select></div>
          </div>
          <div class='form-field'>
            <label class='input-label' for='int-bank-account'>Số tài khoản nhận tiền</label>
            <input class='input' id='int-bank-account' name='bankAccountNumber' value='${esc(settings.bankAccountNumber || '')}' maxlength='32' autocomplete='off' placeholder='VD: 19036688999' ${disabled}/>
          </div>
          <div class='form-field'>
            <label class='input-label' for='int-bank-owner'>Tên chủ tài khoản</label>
            <input class='input' id='int-bank-owner' name='bankAccountName' value='${esc(settings.bankAccountName || '')}' maxlength='120' placeholder='NGUYEN VAN A' ${disabled}/>
          </div>
          <div class='form-field'>
            <label class='input-label' for='int-bank-webhook'>Cổng gạch nợ Webhook tự động</label>
            <div class='select-wrap'><select class='input' id='int-bank-webhook' name='bankWebhookProvider' ${disabled}>${webhookOptions}</select></div>
          </div>
          ${activeWebhookUrl ? `<div class='form-field full'>
            <div class='integration-webhook-box'>
              <div>
                <span class='input-label' style='margin:0 0 4px'>Webhook URL dán vào cổng ${esc(String(settings.bankWebhookProvider).toUpperCase())}</span>
                <code>${esc(activeWebhookUrl)}</code>
              </div>
              <button class='btn btn-secondary' type='button' data-action='copy-integration-url' data-copy-value='${esc(activeWebhookUrl)}'>Sao chép URL</button>
            </div>
          </div>` : ''}
          <div class='form-field full' id='int-vietqr-preview'>${previewQr}</div>
          <div class='form-field'>
            <label class='input-label' for='int-einvoice-provider'>Hóa đơn điện tử (NĐ 123 / NĐ 70)</label>
            <div class='select-wrap'><select class='input' id='int-einvoice-provider' name='einvoiceProvider' ${disabled}>${einvoiceOptions}</select></div>
          </div>
          <div class='form-field'>
            <label class='input-label' for='int-tax-code'>Mã số thuế hộ / doanh nghiệp</label>
            <input class='input' id='int-tax-code' name='taxCode' value='${esc(settings.taxCode || '')}' maxlength='14' placeholder='VD: 0312345678' ${disabled}/>
          </div>
          <div class='form-field'>
            <label class='input-label' for='int-einvoice-template'>Mẫu số hóa đơn</label>
            <input class='input' id='int-einvoice-template' name='einvoiceTemplateCode' value='${esc(settings.einvoiceTemplateCode || '')}' maxlength='40' placeholder='VD: 1' ${disabled}/>
          </div>
          <div class='form-field'>
            <label class='input-label' for='int-einvoice-serial'>Ký hiệu hóa đơn</label>
            <input class='input' id='int-einvoice-serial' name='einvoiceSerial' value='${esc(settings.einvoiceSerial || '')}' maxlength='40' placeholder='VD: 1C26TYY' ${disabled}/>
          </div>
          <div class='form-field full'>
            <label class='input-label' for='int-shipping-provider'>Đơn vị vận chuyển mặc định</label>
            <div class='select-wrap'><select class='input' id='int-shipping-provider' name='shippingProvider' ${disabled}>${shippingOptions}</select></div>
          </div>
        </div>
        ${canEdit ? `<div class='modal-footer' style='padding:17px 0 0;margin-top:12px'><button class='btn btn-primary' type='submit'>Lưu cấu hình tích hợp</button></div>` : ''}
      </form>
      <div class='integration-hardware-bar'>
        <div>
          <strong>Máy in nhiệt ESC/POS (58mm/80mm) &amp; Két tiền</strong>
          <small>${caps.serialSupported ? (caps.connected ? 'Đã kết nối cổng Serial sẵn sàng in trực tiếp.' : 'Trình duyệt hỗ trợ WebSerial — bấm Kết nối để chọn cổng COM/USB máy in.') : 'Trình duyệt hiện tại dùng hộp thoại in chuẩn (Chrome/Edge máy tính hỗ trợ in trực tiếp không hộp thoại).'}</small>
        </div>
        <div class='integration-hardware-actions'>
          ${caps.serialSupported ? `<button class='btn btn-secondary' type='button' data-action='escpos-connect'>${caps.connected ? 'Đổi máy in' : 'Kết nối máy in USB/COM'}</button>` : ''}
          ${caps.serialSupported ? `<button class='btn btn-secondary' type='button' data-action='escpos-test-print'>In thử bill</button>` : ''}
          ${caps.serialSupported ? `<button class='btn btn-secondary' type='button' data-action='escpos-kick-drawer'>Mở két tiền</button>` : ''}
        </div>
      </div>
      ${connectorCards ? `<div class='integration-grid'>${connectorCards}</div>` : ''}
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
        subtitle: 'Khách quét mã sẽ điền sẵn đúng số tiền còn thiếu & mã đơn để đối soát.',
      })
      : '';

    const einvoiceStatus = order.einvoiceStatus === 'issued'
      ? `<span class='badge badge-success'><i class='badge-dot'></i>HĐĐT ${esc(order.einvoiceNumber || 'Đã phát hành')}${order.einvoiceLookupCode ? ` · Mã tra cứu: ${esc(order.einvoiceLookupCode)}` : ''}</span>`
      : (canOperate && order.rawStatus !== 'voided'
        ? `<button class='btn btn-secondary' type='button' data-action='issue-order-einvoice' data-id='${esc(order.id)}'>Xuất hóa đơn điện tử</button>`
        : '');

    const shippingStatus = order.shippingTrackingCode
      ? `<span class='badge badge-info'><i class='badge-dot'></i>Vận đơn ${esc((order.shippingProvider || '').toUpperCase())}: ${esc(order.shippingTrackingCode)}</span>`
      : ((canOperate || role === 'stockkeeper') && order.rawStatus !== 'voided'
        ? `<button class='btn btn-secondary' type='button' data-action='create-order-shipping' data-id='${esc(order.id)}'>Tạo vận đơn (GHN/GHTK)</button>`
        : '');

    const serialSupported = Boolean(root.SlinkEscPosPrinter?.capabilities?.().serialSupported);
    const escposBtn = serialSupported
      ? `<button class='btn btn-secondary' type='button' data-action='escpos-print-order' data-id='${esc(order.id)}'>In bill nhiệt ESC/POS</button>`
      : '';

    if (!qrHtml && !einvoiceStatus && !shippingStatus && !escposBtn) return '';

    return `${qrHtml}<div class='order-integration-bar'>${escposBtn}${einvoiceStatus}${shippingStatus}</div>`;
  }

  return {
    renderVietQrCard,
    renderIntegrationSettingsSection,
    renderOrderIntegrationSection,
  };
}));
