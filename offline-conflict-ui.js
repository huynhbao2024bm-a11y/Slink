(function (root, factory) {
  'use strict';
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.SlinkOfflineConflictUI = value;
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
    const grouped = abs.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + grouped + ' ₫';
  }

  function explainConflictVi(operation, inspection) {
    if (inspection?.alreadySynced) {
      return 'Chứng từ này đã được máy chủ ghi nhận thành công trước đó. Bạn chỉ cần đánh dấu hoàn tất để giải phóng các chứng từ tiếp theo.';
    }
    if (inspection?.explanationVi) return inspection.explanationVi;
    const code = operation?.issue?.code || '';
    const map = {
      offline_price_changed: 'Giá bán trên máy chủ đã thay đổi sau khi đơn tạm được lưu ngoại tuyến. Chọn giữ giá đã thu từ khách hoặc cập nhật theo giá mới kèm chiết khấu bù.',
      offline_total_changed: 'Tổng tiền đơn tạm lệch với bảng giá hiện hành trên máy chủ. Cần Chủ cửa hàng hoặc Quản lý xác nhận lại đơn.',
      insufficient_stock: 'Tồn kho thực tế trên máy chủ hiện không đủ cho số lượng trong đơn tạm. Cần nhập hàng bổ sung rồi đồng bộ lại.',
      offline_cash_session_changed: 'Ca tiền mặt lúc bán đã đóng và máy chủ đang mở ca mới. Quản lý có thể chọn chuyển khoản thu tiền mặt này sang ca hiện tại.',
      cash_session_required: 'Máy chủ chưa có ca tiền mặt đang mở. Hãy mở ca tiền mặt rồi gửi lại đơn.',
      inventory_version_conflict: 'Tồn kho mặt hàng đã thay đổi trong lúc kiểm kê ngoại tuyến. Kiểm tra lại số tồn mới rồi gửi lại.',
      offline_cash_variance_reason: 'Số tiền mặt thực đếm lúc chốt ca khác số dự kiến trên máy chủ. Hãy kiểm đếm lại hoặc nhập lý do chênh lệch.',
    };
    return map[code] || operation?.issue?.message || 'Chứng từ này cần bạn kiểm tra lại trước khi tiếp tục đồng bộ.';
  }

  function renderAlreadySyncedCard(operationId, explanation) {
    return `<div class='conflict-card conflict-synced'>
      <p class='conflict-summary'>${escapeHtml(explanation)}</p>
      <div class='conflict-actions'>
        <button type='button' class='btn btn-primary' data-conflict-action='acknowledge-synced' data-id='${escapeHtml(operationId)}'>Đánh dấu đã đồng bộ &amp; mở khóa hàng đợi</button>
      </div>
    </div>`;
  }

  function renderSaleConflictCard(operationId, inspection, explanation, canManage) {
    const rowsHtml = (inspection.items || []).map((item) => {
      const changed = item.offlineUnitPriceVnd !== item.serverUnitPriceVnd;
      const shortBadge = item.stockShortfall ? `<span class='pill pill-danger'>Thiếu ${escapeHtml(item.stockShortfall)} ${escapeHtml(item.unit)}</span>` : '';
      return `<tr>
        <td><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.sku)} · SL: ${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</small> ${shortBadge}</td>
        <td class='text-right'>${formatVnd(item.offlineUnitPriceVnd)}</td>
        <td class='text-right'>${changed ? `<strong>${formatVnd(item.serverUnitPriceVnd)}</strong>` : formatVnd(item.serverUnitPriceVnd)}</td>
      </tr>`;
    }).join('');

    const shiftWarning = inspection.requiresCashSessionReassignment
      ? `<label class='conflict-check'>
          <input type='checkbox' data-conflict-field='assignToCurrentCashSession' checked>
          <span>Ghi nhận khoản tiền mặt này vào ca đang mở hiện tại (${escapeHtml(inspection.activeCashSession?.openedByName || 'quầy hiện tại')})</span>
        </label>`
      : '';

    const reasonBlock = canManage && inspection.canResolveHistoricalPrice
      ? `<label class='input-label'>Lý do xác nhận xử lý (bắt buộc để lưu nhật ký kiểm toán)
          <input type='text' class='input' data-conflict-field='reason' maxlength='300' value='Khách đã thanh toán đủ lúc mất mạng theo giá niêm yết cũ'>
        </label>`
      : '';

    const actionButtons = [];
    if (canManage && inspection.canResolveHistoricalPrice) {
      actionButtons.push(`<button type='button' class='btn btn-primary' data-conflict-action='resolve-historical' data-id='${escapeHtml(operationId)}'>Giữ nguyên giá lúc bán (${formatVnd(inspection.offlineTotalVnd)})</button>`);
      if (inspection.canResolveCurrentPriceWithDiscount && inspection.flags?.hasPriceChange) {
        actionButtons.push(`<button type='button' class='btn btn-secondary' data-conflict-action='resolve-discounted' data-id='${escapeHtml(operationId)}'>Ghi theo giá mới + Chiết khấu bù</button>`);
      }
    } else {
      actionButtons.push(`<button type='button' class='btn btn-secondary' data-conflict-action='retry-sync' data-id='${escapeHtml(operationId)}'>Kiểm tra xong · Thử gửi lại</button>`);
    }
    actionButtons.push(`<button type='button' class='btn btn-secondary' data-conflict-action='export-slip' data-id='${escapeHtml(operationId)}'>Tải phiếu đối chiếu</button>`);

    const blockers = (inspection.blockedReasons || []).length
      ? `<ul class='conflict-blockers'>${inspection.blockedReasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`
      : '';

    return `<div class='conflict-card'>
      <p class='conflict-summary' role='alert'>${escapeHtml(explanation)}</p>
      ${blockers}
      <div class='conflict-totals'>
        <div><span>Khách đã trả lúc ngoại tuyến</span><strong>${formatVnd(inspection.collectedVnd)}</strong></div>
        <div><span>Tổng đơn theo giá cũ</span><strong>${formatVnd(inspection.offlineTotalVnd)}</strong></div>
        <div><span>Tổng nếu tính theo giá mới</span><strong>${formatVnd(inspection.serverTotalAtCurrentPricesVnd)}</strong></div>
      </div>
      <table class='data-table'>
        <thead><tr><th>Mặt hàng</th><th class='text-right'>Giá lúc bán</th><th class='text-right'>Giá hiện tại</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${shiftWarning}
      ${reasonBlock}
      <div class='conflict-actions'>${actionButtons.join('')}</div>
    </div>`;
  }

  function renderStockCountConflictCard(operationId, inspection, explanation) {
    const canRequeue = Boolean(inspection.canRequeueWithCurrentVersion);
    return `<div class='conflict-card'>
      <p class='conflict-summary' role='alert'>${escapeHtml(explanation)}</p>
      <div class='conflict-totals'>
        <div><span>Số đếm trên thiết bị</span><strong>${escapeHtml(inspection.countedQuantity)} ${escapeHtml(inspection.unit)}</strong></div>
        <div><span>Tồn máy chủ hiện tại</span><strong>${escapeHtml(inspection.currentServerOnHand ?? 0)} ${escapeHtml(inspection.unit)}</strong></div>
      </div>
      <div class='conflict-actions'>
        ${canRequeue ? `<button type='button' class='btn btn-primary' data-conflict-action='requeue-stock-count' data-id='${escapeHtml(operationId)}'>Cập nhật theo tồn mới &amp; gửi lại số đếm (${escapeHtml(inspection.countedQuantity)})</button>` : ''}
        <button type='button' class='btn btn-secondary' data-conflict-action='export-slip' data-id='${escapeHtml(operationId)}'>Tải phiếu đối chiếu</button>
      </div>
    </div>`;
  }

  function buildConflictComparisonHtml(operation, inspection, opts = {}) {
    const canManage = opts.role === 'owner' || opts.role === 'manager';
    const explanation = explainConflictVi(operation, inspection);
    const operationId = operation?.id || '';

    if (inspection?.alreadySynced) return renderAlreadySyncedCard(operationId, explanation);
    if (operation?.kind === 'sale' && inspection?.kind === 'sale') {
      return renderSaleConflictCard(operationId, inspection, explanation, canManage);
    }
    if (operation?.kind === 'stock-count' && inspection?.kind === 'stock-count') {
      return renderStockCountConflictCard(operationId, inspection, explanation);
    }
    return `<div class='conflict-card'>
      <p class='conflict-summary' role='alert'>${escapeHtml(explanation)}</p>
      <div class='conflict-actions'>
        <button type='button' class='btn btn-secondary' data-conflict-action='retry-sync' data-id='${escapeHtml(operationId)}'>Thử đồng bộ lại</button>
        <button type='button' class='btn btn-secondary' data-conflict-action='export-slip' data-id='${escapeHtml(operationId)}'>Tải phiếu đối chiếu</button>
      </div>
    </div>`;
  }

  function buildReconciliationText(operation, inspection) {
    const lines = [
      'SLINK - PHIEU DOI CHIEU CHUNG TU NGOAI TUYEN',
      '--------------------------------------------',
      `Loai chung tu : ${operation?.kind || '-'}`,
      `Ma thao tac   : ${operation?.key || '-'}`,
      `Thoi diem ghi : ${operation?.queuedAt || '-'}`,
      `Trang thai    : ${operation?.state || '-'}`,
      `Giai thich    : ${explainConflictVi(operation, inspection)}`,
    ];
    if (inspection?.kind === 'sale') {
      lines.push(`Tong gia cu   : ${inspection.offlineTotalVnd} VND`);
      lines.push(`Tong gia moi  : ${inspection.serverTotalAtCurrentPricesVnd} VND`);
      lines.push(`Da thu khach  : ${inspection.collectedVnd} VND`);
      lines.push('Chi tiet mat hang:');
      for (const item of inspection.items || []) {
        lines.push(`- ${item.name} (${item.sku}) x ${item.quantity} ${item.unit}: cu=${item.offlineUnitPriceVnd}d | moi=${item.serverUnitPriceVnd}d`);
      }
    }
    return lines.join('\n');
  }

  async function postJson(url, body, { csrfToken, idempotencyKey, fetchImpl } = {}) {
    const doFetch = fetchImpl || globalThis.fetch;
    if (typeof doFetch !== 'function') throw new Error('Trình duyệt không hỗ trợ gửi yêu cầu mạng.');
    const headers = { 'content-type': 'application/json' };
    if (csrfToken) headers['x-csrf-token'] = csrfToken;
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    const response = await doFetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch (_) { parsed = {}; }
    if (!response.ok) {
      const err = new Error(parsed?.error?.message || parsed?.message || 'Không xử lý được chứng từ.');
      err.status = response.status;
      err.code = parsed?.error?.code || 'request_failed';
      throw err;
    }
    return parsed;
  }

  async function inspectOperation({ storeId, operation, csrfToken, fetchImpl }) {
    return postJson(
      `/api/stores/${encodeURIComponent(storeId)}/offline-conflicts/inspect`,
      { kind: operation.kind, operationKey: operation.key, payload: operation.payload, issue: operation.issue || null },
      { csrfToken, fetchImpl }
    );
  }

  async function resolveQueuedConflict({
    storeId,
    scope,
    disk,
    operation,
    inspection,
    mode = 'accept_historical_price',
    reason,
    assignToCurrentCashSession = false,
    csrfToken,
    idempotencyKey,
    fetchImpl,
  }) {
    if (inspection?.alreadySynced) {
      return disk.resolveConflict(scope, operation.id, {
        result: { alreadySynced: true, entityId: inspection.existingEntityId },
        meta: { mode: 'already_synced' },
      });
    }
    const cleanReason = String(reason || '').trim() || 'Xử lý chênh lệch đơn ngoại tuyến theo thực tế đã thu tiền';
    const offlineMeta = operation?.payload?.offline && typeof operation.payload.offline === 'object'
      ? { ...operation.payload.offline, actorUserId: operation.payload.offline.actorUserId || operation.userId }
      : operation?.payload?.offline;
    const salePayload = operation?.payload ? { ...operation.payload, offline: offlineMeta } : operation?.payload;

    const result = await postJson(
      `/api/stores/${encodeURIComponent(storeId)}/offline-conflicts/resolve-sale`,
      {
        operationKey: operation.key,
        resolutionMode: mode,
        reason: cleanReason,
        assignToCurrentCashSession: Boolean(assignToCurrentCashSession),
        salePayload,
      },
      { csrfToken, idempotencyKey, fetchImpl }
    );
    const updated = await disk.resolveConflict(scope, operation.id, {
      result,
      meta: { mode, orderId: result.order?.id || null, orderNumber: result.order?.number || null },
    });
    return { server: result, localRecord: updated };
  }

  async function requeueStockCountConflict({ scope, disk, operation, inspection, nextKey }) {
    if (!inspection?.canRequeueWithCurrentVersion || !inspection?.currentServerVersion) {
      throw new Error('Không thể xếp lại phiếu kiểm kê vì chưa có phiên bản tồn kho hợp lệ trên máy chủ.');
    }
    const nextPayload = {
      ...operation.payload,
      expectedInventoryVersion: inspection.currentServerVersion,
    };
    return disk.requeueConflict(scope, operation.id, {
      nextKey,
      nextPayload,
      note: 'Cập nhật phiên bản tồn kho mới từ máy chủ để gửi lại kiểm kê',
    });
  }

  return {
    explainConflictVi,
    buildConflictComparisonHtml,
    buildReconciliationText,
    inspectOperation,
    resolveQueuedConflict,
    requeueStockCountConflict,
  };
});
