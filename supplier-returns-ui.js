(function (root, factory) {
  'use strict';
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.SlinkReturnsExchangeUI = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatVnd(value) {
    const raw = String(value == null ? '0' : value);
    if (!/^-?\d+$/.test(raw)) return escapeHtml(raw);
    const neg = raw.startsWith('-');
    const abs = neg ? raw.slice(1) : raw;
    return (neg ? '-' : '') + abs.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ₫';
  }

  function computeExchangePreview({ returnTotalVnd, replacementTotalVnd }) {
    const ret = BigInt(String(returnTotalVnd || '0'));
    const rep = BigInt(String(replacementTotalVnd || '0'));
    const netDelta = rep - ret;
    if (netDelta > 0n) {
      return {
        direction: 'collect',
        netDeltaVnd: netDelta.toString(),
        labelVi: `Khách cần trả thêm ${formatVnd(netDelta.toString())}`,
      };
    }
    if (netDelta < 0n) {
      const refund = (-netDelta).toString();
      return {
        direction: 'refund',
        netDeltaVnd: netDelta.toString(),
        labelVi: `Cửa hàng hoàn lại khách ${formatVnd(refund)}`,
      };
    }
    return {
      direction: 'even',
      netDeltaVnd: '0',
      labelVi: 'Đổi ngang giá (chênh lệch 0 ₫)',
    };
  }

  function renderExchangeSummaryHtml(preview) {
    const cls = preview.direction === 'collect'
      ? 'exchange-collect'
      : preview.direction === 'refund'
        ? 'exchange-refund'
        : 'exchange-even';
    return `<div class='exchange-summary ${cls}'><strong>${escapeHtml(preview.labelVi)}</strong></div>`;
  }

  function renderSupplierReturnListHtml(list) {
    if (!Array.isArray(list) || !list.length) {
      return `<p class='muted-note'>Chưa có phiếu trả hàng nhà cung cấp nào.</p>`;
    }
    const rows = list.map((item) => {
      const linesCount = Array.isArray(item.items) ? item.items.length : 0;
      return `<tr>
        <td><strong>${escapeHtml(item.returnNumber || '-')}</strong><br><small>${escapeHtml(item.warehouseName || '')}</small></td>
        <td>${escapeHtml(item.supplierName || '-')}</td>
        <td class='text-right'>${linesCount} SP · ${formatVnd(item.totalVnd)}</td>
        <td class='text-right'>${formatVnd(item.refundReceivedVnd)}</td>
        <td>${escapeHtml(item.reason || '')}</td>
      </tr>`;
    }).join('');
    return `<table class='data-table'>
      <thead><tr><th>Phiếu</th><th>Nhà cung cấp</th><th class='text-right'>Giá trị trả</th><th class='text-right'>Tiền NCC hoàn</th><th>Lý do</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  async function requestJson(method, url, body, { csrfToken, idempotencyKey, fetchImpl } = {}) {
    const doFetch = fetchImpl || globalThis.fetch;
    if (typeof doFetch !== 'function') throw new Error('Trình duyệt không hỗ trợ gửi yêu cầu mạng.');
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (csrfToken) headers['x-csrf-token'] = csrfToken;
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    const response = await doFetch(url, {
      method,
      credentials: 'same-origin',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch (_) { parsed = {}; }
    if (!response.ok) {
      const err = new Error(parsed?.error?.message || parsed?.message || 'Thao tác chưa hoàn tất.');
      err.status = response.status;
      err.code = parsed?.error?.code || 'request_failed';
      throw err;
    }
    return parsed;
  }

  function submitSupplierReturn({ storeId, payload, csrfToken, idempotencyKey, fetchImpl }) {
    return requestJson(
      'POST',
      `/api/stores/${encodeURIComponent(storeId)}/supplier-returns`,
      payload,
      { csrfToken, idempotencyKey, fetchImpl }
    );
  }

  function listSupplierReturns({ storeId, supplierId, warehouseId, fetchImpl } = {}) {
    const qs = new URLSearchParams();
    if (supplierId) qs.set('supplierId', supplierId);
    if (warehouseId) qs.set('warehouseId', warehouseId);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return requestJson('GET', `/api/stores/${encodeURIComponent(storeId)}/supplier-returns${suffix}`, undefined, { fetchImpl });
  }

  function submitOrderExchange({ storeId, orderId, payload, csrfToken, idempotencyKey, fetchImpl }) {
    return requestJson(
      'POST',
      `/api/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}/exchange`,
      payload,
      { csrfToken, idempotencyKey, fetchImpl }
    );
  }

  return {
    computeExchangePreview,
    renderExchangeSummaryHtml,
    renderSupplierReturnListHtml,
    submitSupplierReturn,
    listSupplierReturns,
    submitOrderExchange,
  };
});
