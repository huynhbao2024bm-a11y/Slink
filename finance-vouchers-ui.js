(function (root, factory) {
  'use strict';
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.SlinkFinanceUI = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function moneyVnd(value) {
    const raw = String(value == null ? '0' : value);
    if (!/^-?\d+$/.test(raw)) return esc(raw);
    const neg = raw.startsWith('-');
    const abs = neg ? raw.slice(1) : raw;
    return (neg ? '−' : '') + abs.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ₫';
  }

  function methodLabel(method) {
    return ({
      cash: 'Tiền mặt',
      bank_transfer: 'Chuyển khoản',
      bank_qr: 'QR ngân hàng',
      card: 'Thẻ',
      other: 'Khác',
    })[method] || method || 'Khác';
  }

  function fundLabel(fundType) {
    return fundType === 'cash' ? 'Tiền mặt' : fundType === 'bank' ? 'Ngân hàng' : 'Khác';
  }

  function voucherBadgeHtml(row) {
    const num = row.voucher_number || row.voucherNumber || '';
    const kind = row.movement_kind || row.movementKind || 'standard';
    const isVoided = Boolean(row.reversed_by_movement_id || row.reversedByMovementId);
    let badge = '';
    if (num) {
      const cls = kind === 'reversal' ? 'fv-badge fv-badge-rev'
        : kind === 'transfer' ? 'fv-badge fv-badge-xfer'
          : row.direction === 'in' || row.type === 'in' ? 'fv-badge fv-badge-in' : 'fv-badge fv-badge-out';
      badge += `<span class='${cls}'>${esc(num)}</span>`;
    }
    if (row.include_in_pnl || row.includeInPnl) {
      badge += `<span class='fv-badge fv-badge-pnl'>Tính lãi/lỗ</span>`;
    }
    if (isVoided) {
      badge += `<span class='fv-badge fv-badge-voided'>Đã hủy</span>`;
    }
    return badge;
  }

  function canVoidMovement(row, canRecord) {
    if (!canRecord) return false;
    if (row.local || row.offline_pending) return false;
    const sourceType = row.source_type || row.sourceType;
    const kind = row.movement_kind || row.movementKind || 'standard';
    const reversed = Boolean(row.reversed_by_movement_id || row.reversedByMovementId);
    return ['manual_cash_movement', 'internal_transfer'].includes(sourceType)
      && kind !== 'reversal'
      && !reversed;
  }

  function movementTitle(row) {
    const orderNumber = row.order_number || row.orderNumber;
    const dir = row.direction || row.type;
    if (orderNumber && (row.source_type === 'order_payment' || row.source_type === 'order_change' || row.sourceType === 'order_payment' || row.sourceType === 'order_change')) {
      return (dir === 'in' ? 'Thu đơn ' : 'Thối tiền đơn ') + orderNumber;
    }
    return row.category || 'Giao dịch quỹ';
  }

  function renderCashbookPanel({
    state,
    canViewFullFinance,
    canRecord,
    canExport,
    humanDate,
  }) {
    const filters = state.filters || { fund: 'all', direction: '', kind: '', includeInPnl: '', from: '', to: '', q: '' };
    const balances = state.balances || {
      all: { openingVnd: '0', inVnd: '0', outVnd: '0', closingVnd: '0' },
      cash: { openingVnd: '0', inVnd: '0', outVnd: '0', closingVnd: '0' },
      bank: canViewFullFinance ? { openingVnd: '0', inVnd: '0', outVnd: '0', closingVnd: '0' } : null,
    };
    const activeFund = canViewFullFinance ? (filters.fund || 'all') : 'cash';
    const activeBal = balances[activeFund] || balances.all;
    const fundTabs = canViewFullFinance ? [
      ['all', 'Tổng hợp'],
      ['cash', 'Tiền mặt'],
      ['bank', 'Ngân hàng'],
    ] : [['cash', 'Tiền mặt']];

    const kpiSubClosing = activeFund === 'all' && balances.bank
      ? `<small>TM: ${moneyVnd(balances.cash.closingVnd)} · NH: ${moneyVnd(balances.bank.closingVnd)}</small>` : '';
    const kpiSubOpening = activeFund === 'all' && balances.bank
      ? `<small>TM: ${moneyVnd(balances.cash.openingVnd)} · NH: ${moneyVnd(balances.bank.openingVnd)}</small>` : '';

    const kpis = `<div class='fv-kpi-grid'>
      <article class='stat-card'><div class='stat-label'>Quỹ đầu kỳ</div><div class='stat-value'>${state.ready ? moneyVnd(activeBal.openingVnd) : '—'}</div>${state.ready ? kpiSubOpening : ''}</article>
      <article class='stat-card'><div class='stat-label'>Tổng thu</div><div class='stat-value finance-amount-in'>${state.ready ? '+' + moneyVnd(activeBal.inVnd) : '—'}</div></article>
      <article class='stat-card'><div class='stat-label'>Tổng chi</div><div class='stat-value finance-amount-out'>${state.ready ? '−' + moneyVnd(activeBal.outVnd) : '—'}</div></article>
      <article class='stat-card'><div class='stat-label'>Tồn quỹ cuối kỳ</div><div class='stat-value'>${state.ready ? moneyVnd(activeBal.closingVnd) : '—'}</div>${state.ready ? kpiSubClosing : ''}</article>
    </div>`;

    const headerActions = `<div class='fv-panel-actions'>
      ${canRecord ? `<button type='button' class='btn btn-secondary fv-compact-btn' data-action='open-cash-transfer'>⇄ Chuyển quỹ nội bộ</button>` : ''}
      ${canExport ? `<button type='button' class='link-button' data-action='open-export'>Xuất CSV</button>` : ''}
    </div>`;

    const fundSwitcher = `<div class='fv-fund-switcher' role='group' aria-label='Loại quỹ'>
      ${fundTabs.map(([id, label]) => `<button type='button' class='fv-fund-pill ${activeFund === id ? 'active' : ''}' data-action='cashbook-fund' data-fund='${id}' aria-pressed='${activeFund === id ? 'true' : 'false'}'>${label}</button>`).join('')}
    </div>`;

    const filterBar = `<div class='fv-filter-bar'>
      <input id='finance-cashbook-search' class='input' type='search' maxlength='80' value='${esc(filters.q || '')}' placeholder='Tìm mã phiếu (PT-, PC-, CQ-), khoản mục, ghi chú…' aria-label='Tìm kiếm sổ quỹ' />
      <div class='fv-filter-controls'>
        <label class='fv-filter-field'><span>Loại</span>
          <select class='input' data-cashbook-filter='direction' aria-label='Lọc loại thu chi'>
            <option value='' ${!filters.direction ? 'selected' : ''}>Tất cả</option>
            <option value='in' ${filters.direction === 'in' ? 'selected' : ''}>Thu (+)</option>
            <option value='out' ${filters.direction === 'out' ? 'selected' : ''}>Chi (−)</option>
          </select>
        </label>
        <label class='fv-filter-field'><span>Từ ngày</span>
          <input class='input' type='date' data-cashbook-filter='from' value='${esc(filters.from || '')}' aria-label='Từ ngày' />
        </label>
        <label class='fv-filter-field'><span>Đến ngày</span>
          <input class='input' type='date' data-cashbook-filter='to' value='${esc(filters.to || '')}' aria-label='Đến ngày' />
        </label>
        <label class='fv-filter-field'><span>KQKD</span>
          <select class='input' data-cashbook-filter='includeInPnl' aria-label='Lọc hạch toán lãi lỗ'>
            <option value='' ${!filters.includeInPnl ? 'selected' : ''}>Tất cả</option>
            <option value='true' ${filters.includeInPnl === 'true' ? 'selected' : ''}>Có tính Lãi/Lỗ</option>
            <option value='false' ${filters.includeInPnl === 'false' ? 'selected' : ''}>Không tính Lãi/Lỗ</option>
          </select>
        </label>
      </div>
    </div>`;

    const rows = state.rows || [];
    const listHtml = rows.length ? `<div class='fv-table-wrap'>
      <table class='data-table fv-desktop-table'>
        <thead><tr><th>Mã phiếu</th><th>Thời gian</th><th>Khoản mục &amp; Ghi chú</th><th>Đối tượng</th><th>Quỹ</th><th class='text-right'>Số tiền</th><th>Thao tác</th></tr></thead>
        <tbody>
          ${rows.map(row => {
            const voidable = canVoidMovement(row, canRecord);
            const amtCls = row.direction === 'in' ? 'finance-amount-in' : 'finance-amount-out';
            const prefix = row.direction === 'in' ? '+' : '−';
            const counterparty = row.counterparty?.name ? esc(row.counterparty.name) : '—';
            const metaNote = [row.note, row.order_number ? `Đơn ${row.order_number}` : '', row.void_reason ? `Lý do hủy: ${row.void_reason}` : ''].filter(Boolean).join(' · ');
            return `<tr class='${row.reversed_by_movement_id ? 'fv-row-voided' : ''}'>
              <td><div class='fv-badge-stack'>${voucherBadgeHtml(row)}</div></td>
              <td><span>${esc(humanDate(row.occurred_at, true))}</span><small class='table-subtitle'>${esc(row.actor_name || '')}</small></td>
              <td><strong>${esc(movementTitle(row))}</strong>${metaNote ? `<small class='table-subtitle'>${esc(metaNote)}</small>` : ''}</td>
              <td>${counterparty}</td>
              <td><span>${esc(fundLabel(row.fund_type))}</span><small class='table-subtitle'>${esc(methodLabel(row.method))}</small></td>
              <td class='text-right'><strong class='${amtCls}'>${prefix}${moneyVnd(row.amount_vnd)}</strong></td>
              <td class='fv-row-actions'>
                <button type='button' class='link-button' data-action='cash-movement-detail' data-id='${esc(row.movement_id)}'>Chi tiết</button>
                ${voidable ? `<button type='button' class='link-button fv-danger-link' data-action='void-cash-movement' data-id='${esc(row.movement_id)}'>Hủy</button>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class='fv-mobile-cards'>
        ${rows.map(row => {
          const amtCls = row.direction === 'in' ? 'finance-amount-in' : 'finance-amount-out';
          const prefix = row.direction === 'in' ? '+' : '−';
          const counterparty = row.counterparty?.name;
          const voidable = canVoidMovement(row, canRecord);
          return `<article class='fv-mobile-card ${row.reversed_by_movement_id ? 'fv-row-voided' : ''}'>
            <button type='button' class='fv-mobile-card-main' data-action='cash-movement-detail' data-id='${esc(row.movement_id)}'>
              <div class='fv-mobile-card-top'>
                <div class='fv-badge-stack'>${voucherBadgeHtml(row)}</div>
                <strong class='${amtCls}'>${prefix}${moneyVnd(row.amount_vnd)}</strong>
              </div>
              <div class='fv-mobile-card-title'><strong>${esc(movementTitle(row))}</strong></div>
              <small class='fv-mobile-card-meta'>${esc(fundLabel(row.fund_type))} · ${esc(methodLabel(row.method))} · ${esc(humanDate(row.occurred_at, true))}${counterparty ? ' · ' + esc(counterparty) : ''}</small>
              ${row.note ? `<small class='fv-mobile-card-note'>${esc(row.note)}</small>` : ''}
            </button>
            ${voidable ? `<div class='fv-mobile-card-actions'><button type='button' class='btn btn-secondary fv-void-chip' data-action='void-cash-movement' data-id='${esc(row.movement_id)}'>Hủy / Đảo phiếu</button></div>` : ''}
          </article>`;
        }).join('')}
      </div>
    </div>` : `<div class='empty-state'><strong>${state.loading ? 'Đang tải sổ quỹ…' : state.error ? esc(state.error) : 'Chưa có giao dịch phù hợp'}</strong><span>${state.error ? 'Thử tải lại dữ liệu.' : 'Điều chỉnh bộ lọc hoặc lập phiếu thu chi mới.'}</span></div>`;

    const total = Number(state.total || 0);
    const offset = Number(state.offset || 0);
    const hasPrev = offset > 0;
    const hasNext = state.nextOffset !== null && state.nextOffset !== undefined;
    const pager = total > rows.length || hasPrev ? `<div class='fv-pager'>
      <small>Hiển thị ${rows.length ? offset + 1 : 0}–${offset + rows.length} trên ${total} chứng từ</small>
      <div class='fv-pager-buttons'>
        <button type='button' class='btn btn-secondary' data-action='cashbook-page' data-offset='${Math.max(0, offset - 50)}' ${hasPrev ? '' : 'disabled'}>Trang trước</button>
        <button type='button' class='btn btn-secondary' data-action='cashbook-page' data-offset='${hasNext ? Number(state.nextOffset) || 0 : offset}' ${hasNext ? '' : 'disabled'}>Trang sau</button>
      </div>
    </div>` : '';

    return `${kpis}<section class='panel finance-record-panel' data-tour-target='finance-register'>
      <div class='panel-header'><div><h2>Sổ quỹ thu chi</h2><p>${total} chứng từ · tách bạch Tiền mặt &amp; Ngân hàng</p></div>${headerActions}</div>
      ${fundSwitcher}${filterBar}${listHtml}${pager}
    </section>`;
  }

  function renderVouchersPanel({ cashbookState, fallbackRows, canRecord, humanDate }) {
    const sourceRows = cashbookState.ready && Array.isArray(cashbookState.rows) ? cashbookState.rows : fallbackRows;
    const vouchers = (sourceRows || []).filter(row => {
      const st = row.source_type || row.sourceType;
      return ['manual_cash_movement', 'internal_transfer', 'cash_movement_reversal'].includes(st);
    });
    const toolbar = canRecord ? `<div class='fv-panel-actions'>
      <button type='button' class='btn btn-primary fv-compact-btn' data-action='new-expense' data-direction='in'>＋ Phiếu thu</button>
      <button type='button' class='btn btn-secondary finance-quick-out fv-compact-btn' data-action='new-expense' data-direction='out'>− Phiếu chi</button>
      <button type='button' class='btn btn-secondary fv-compact-btn' data-action='open-cash-transfer'>⇄ Chuyển quỹ</button>
      <button type='button' class='btn btn-secondary fv-compact-btn' data-action='manage-cash-categories'>Khoản mục</button>
    </div>` : '';

    const list = vouchers.length ? `<div class='fv-mobile-cards fv-cards-always'>
      ${vouchers.map(row => {
        const dir = row.direction || row.type;
        const amtCls = dir === 'in' ? 'finance-amount-in' : 'finance-amount-out';
        const prefix = dir === 'in' ? '+' : '−';
        const id = row.movement_id || row.movementId;
        const occurredAt = row.occurred_at || row.createdAt;
        const fund = row.fund_type || row.fundType || (row.method === 'cash' ? 'cash' : 'bank');
        const voidable = canVoidMovement(row, canRecord);
        const counterparty = row.counterparty?.name;
        return `<article class='fv-mobile-card ${row.reversed_by_movement_id || row.reversedByMovementId ? 'fv-row-voided' : ''}'>
          <button type='button' class='fv-mobile-card-main' data-action='cash-movement-detail' data-id='${esc(id)}'>
            <div class='fv-mobile-card-top'>
              <div class='fv-badge-stack'>${voucherBadgeHtml(row)}</div>
              <strong class='${amtCls}'>${prefix}${moneyVnd(row.amount_vnd || row.amountVnd)}</strong>
            </div>
            <div class='fv-mobile-card-title'><strong>${esc(movementTitle(row))}</strong></div>
            <small class='fv-mobile-card-meta'>${esc(fundLabel(fund))} · ${esc(methodLabel(row.method))} · ${esc(humanDate(occurredAt, true))}${counterparty ? ' · ' + esc(counterparty) : ''}</small>
            ${row.note ? `<small class='fv-mobile-card-note'>${esc(row.note)}</small>` : ''}
          </button>
          ${voidable ? `<div class='fv-mobile-card-actions'><button type='button' class='btn btn-secondary fv-void-chip' data-action='void-cash-movement' data-id='${esc(id)}'>Hủy / Đảo phiếu</button></div>` : ''}
        </article>`;
      }).join('')}
    </div>` : `<div class='empty-state'><strong>Chưa có phiếu thu / chi / chuyển quỹ nào</strong><span>Dùng các nút thao tác ở trên để lập phiếu.</span></div>`;

    return `<section class='panel finance-record-panel'>
      <div class='panel-header'><div><h2>Phiếu thu / chi &amp; Chuyển quỹ</h2><p>${vouchers.length} chứng từ nội bộ gần nhất</p></div>${toolbar}</div>
      ${list}
    </section>`;
  }

  function renderPayablesPanel({
    state,
    summaryTotalVnd,
    canViewFullFinance,
    canManageSuppliers,
    canReceivePurchases,
    fallbackSuppliers,
  }) {
    const rows = state.ready ? state.rows : fallbackSuppliers || [];
    const totalPayable = state.ready ? state.totalPayableVnd : summaryTotalVnd;
    const actions = `${canManageSuppliers ? `<button type='button' class='link-button' data-action='new-supplier'>＋ Thêm nhà cung cấp</button>` : ''}${canReceivePurchases ? `<button type='button' class='link-button' data-action='receive-stock'>＋ Nhập hàng</button>` : ''}`;
    const totalBox = canViewFullFinance ? `<div class='finance-balance'><span>Tổng cần trả nhà cung cấp</span><strong>${totalPayable != null ? moneyVnd(totalPayable) : '—'}</strong></div>` : '';

    const searchControls = canViewFullFinance ? `<div class='fv-payable-controls'>
      <input id='finance-payable-search' class='input' type='search' maxlength='80' value='${esc(state.query || '')}' placeholder='Tìm theo tên nhà cung cấp…' aria-label='Tìm nhà cung cấp' />
      <label class='fv-checkbox-inline'><input type='checkbox' id='finance-payable-only-owing' ${state.onlyOwing ? 'checked' : ''} /><span>Chỉ hiện đang nợ</span></label>
    </div>` : '';

    const rowHtml = rows.map(supplier => {
      const due = BigInt(String(supplier.balanceVnd ?? supplier.debtVnd ?? '0'));
      const abs = due < 0n ? -due : due;
      const name = canViewFullFinance
        ? `<button type='button' class='link-button' data-action='supplier-balance' data-id='${esc(supplier.id)}'>${esc(supplier.name)}</button>`
        : `<strong>${esc(supplier.name)}</strong>`;
      return `<div class='activity-item'>
        <span class='activity-text'>${name}
          ${canViewFullFinance ? `<small>${due > 0n ? 'Cần trả' : due < 0n ? 'Đã trả trước' : 'Đã tất toán'}</small>` : ''}
        </span>
        ${canViewFullFinance ? `<strong class='activity-amount'>${moneyVnd(abs.toString())}</strong>${due > 0n && !supplier.local ? `<button type='button' class='link-button' data-action='supplier-payment' data-id='${esc(supplier.id)}'>Ghi trả tiền</button>` : ''}` : ''}
      </div>`;
    }).join('');

    const totalCount = state.ready ? Number(state.total || 0) : rows.length;
    const offset = Number(state.offset || 0);
    const hasPrev = offset > 0;
    const hasNext = state.nextOffset !== null && state.nextOffset !== undefined;
    const pager = canViewFullFinance && state.ready && (totalCount > rows.length || hasPrev) ? `<div class='fv-pager'>
      <small>Hiển thị ${rows.length ? offset + 1 : 0}–${offset + rows.length} trên ${totalCount} nhà cung cấp</small>
      <div class='fv-pager-buttons'>
        <button type='button' class='btn btn-secondary' data-action='finance-payable-page' data-offset='${Math.max(0, offset - 50)}' ${hasPrev ? '' : 'disabled'}>Trang trước</button>
        <button type='button' class='btn btn-secondary' data-action='finance-payable-page' data-offset='${hasNext ? Number(state.nextOffset) || 0 : offset}' ${hasNext ? '' : 'disabled'}>Trang sau</button>
      </div>
    </div>` : '';

    return `${totalBox}<section class='panel'><div class='panel-header'><div><h2>Công nợ nhà cung cấp</h2></div><span>${actions}</span></div>
      ${searchControls}
      <div class='activity-list'>${rowHtml || `<div class='empty-state'><strong>${state.loading ? 'Đang tải nhà cung cấp…' : state.error ? esc(state.error) : 'Không tìm thấy nhà cung cấp phù hợp'}</strong></div>`}</div>
      ${pager}
    </section>`;
  }

  function renderTransferModalHtml() {
    return `<form id='entity-form' data-form='cash-transfer'><div class='form-grid'>
      <label class='form-field'><span class='input-label'>Chuyển từ quỹ *</span>
        <select class='input' name='fromFund' required>
          <option value='cash' selected>Quỹ tiền mặt (Két/Quầy)</option>
          <option value='bank'>Tài khoản ngân hàng</option>
        </select>
      </label>
      <label class='form-field'><span class='input-label'>Chuyển sang quỹ *</span>
        <select class='input' name='toFund' required>
          <option value='bank' selected>Tài khoản ngân hàng</option>
          <option value='cash'>Quỹ tiền mặt (Két/Quầy)</option>
        </select>
      </label>
      <label class='form-field full'><span class='input-label'>Số tiền chuyển (đ) *</span>
        <input class='input finance-voucher-amount' name='amount' type='number' min='1' step='1' required placeholder='0' />
      </label>
      <label class='form-field full'><span class='input-label'>Hình thức phía ngân hàng</span>
        <select class='input' name='bankMethod'>
          <option value='bank_transfer' selected>Chuyển khoản</option>
          <option value='bank_qr'>QR ngân hàng</option>
          <option value='card'>Thẻ</option>
        </select>
      </label>
      <label class='form-field full'><span class='input-label'>Ghi chú</span>
        <textarea class='input finance-reminder-text' name='note' rows='2' maxlength='300' placeholder='Ví dụ: Nộp tiền mặt cuối ngày vào ngân hàng'></textarea>
      </label>
    </div><p class='modal-note'>Chuyển quỹ nội bộ tạo cặp bút toán CQ tự động, giữ nguyên tổng tiền cửa hàng và không hạch toán vào Lãi/Lỗ.</p></form>`;
  }

  function renderVoidMovementModalHtml(movement) {
    const voucher = movement.voucher_number || movement.voucherNumber || movementTitle(movement);
    return `<form id='entity-form' data-form='void-cash-movement' data-id='${esc(movement.movement_id || movement.movementId)}'>
      <div class='checkout-total'><span>Chứng từ cần hủy</span><strong>${esc(voucher)} · ${moneyVnd(movement.amount_vnd || movement.amountVnd)}</strong></div>
      <label class='form-field full' style='margin-top:12px'><span class='input-label'>Lý do hủy / đảo phiếu *</span>
        <textarea class='input finance-reminder-text' name='reason' rows='3' minlength='3' maxlength='240' required placeholder='Ví dụ: Nhập nhầm số tiền hoặc sai phương thức'></textarea>
      </label>
      <p class='modal-note'>Sổ quỹ không cho phép xóa sửa chứng từ đã ghi. Thao tác này sẽ tạo một bút toán đảo (HUY) giữ nguyên dấu vết kiểm toán.</p>
    </form>`;
  }

  function renderCategoriesModalHtml(categories) {
    const rows = (categories || []).map(cat => {
      const dirLabel = cat.direction === 'in' ? 'Thu' : cat.direction === 'out' ? 'Chi' : 'Thu & Chi';
      const active = cat.status === 'active';
      return `<div class='fv-cat-row ${active ? '' : 'fv-row-voided'}'>
        <div class='fv-cat-info'>
          <strong>${esc(cat.name)}</strong>
          <small>${dirLabel} · ${cat.default_include_in_pnl ? 'Mặc định tính Lãi/Lỗ' : 'Không tính Lãi/Lỗ'}${cat.is_system ? ' · Hệ thống' : ''}</small>
        </div>
        <div class='fv-cat-actions'>
          ${!cat.is_system ? `<button type='button' class='link-button' data-action='toggle-cash-category' data-id='${esc(cat.id)}' data-next-status='${active ? 'archived' : 'active'}'>${active ? 'Ẩn' : 'Hiện lại'}</button>` : ''}
        </div>
      </div>`;
    }).join('');
    return `<div class='fv-cat-list'>${rows || `<div class='empty-state'><span>Chưa có khoản mục nào.</span></div>`}</div>
      <form id='entity-form' data-form='cash-category-create' class='fv-cat-form'>
        <h3>Thêm khoản mục mới</h3>
        <div class='form-grid'>
          <label class='form-field'><span class='input-label'>Tên khoản mục *</span><input class='input' name='name' maxlength='80' required placeholder='Ví dụ: Tiền điện, Quảng cáo' /></label>
          <label class='form-field'><span class='input-label'>Áp dụng cho</span>
            <select class='input' name='direction'>
              <option value='out' selected>Phiếu chi</option>
              <option value='in'>Phiếu thu</option>
              <option value='both'>Cả Thu và Chi</option>
            </select>
          </label>
          <label class='fv-checkbox-inline full'><input type='checkbox' name='defaultIncludeInPnl' checked /><span>Mặc định hạch toán vào kết quả kinh doanh (Lãi/Lỗ)</span></label>
        </div>
      </form>`;
  }

  function renderReportsPnlExtras({ summary, expenseBreakdown }) {
    const netProfit = summary.netProfitVnd != null ? summary.netProfitVnd : summary.grossProfitVnd || '0';
    const otherIn = summary.otherIncomeVnd || '0';
    const opEx = summary.operatingExpenseVnd || '0';
    const breakdownRows = Array.isArray(expenseBreakdown) && expenseBreakdown.length
      ? expenseBreakdown.map(item => `<div class='breakdown-row'><span>${esc(item.category)}</span><strong>${moneyVnd(item.amountVnd)}</strong></div>`).join('')
      : `<div class='empty-state'><strong>Chưa có chi phí vận hành trong kỳ</strong><span>Khi lập phiếu chi có bật "Tính Lãi/Lỗ", chi phí sẽ được tổng hợp theo khoản mục ở đây.</span></div>`;
    return {
      pnlCardsHtml: `<article class='panel report-card'><small>Chi phí vận hành</small><strong>${moneyVnd(opEx)}</strong><span>Thu khác: ${moneyVnd(otherIn)}</span></article>
        <article class='panel report-card'><small>Lãi ròng (Net Profit)</small><strong class='${String(netProfit).startsWith('-') ? 'finance-amount-out' : 'finance-amount-in'}'>${moneyVnd(netProfit)}</strong><span>= Lãi gộp + Thu khác − Chi vận hành</span></article>`,
      expenseSectionHtml: `<section class='panel' style='margin-top:16px'><div class='panel-header'><div><h2>Chi phí vận hành theo khoản mục</h2><p>Chỉ tính các phiếu thu/chi có bật hạch toán KQKD (đã trừ phiếu hủy)</p></div></div><div class='report-breakdown'>${breakdownRows}</div></section>`,
    };
  }

  return {
    esc,
    moneyVnd,
    methodLabel,
    fundLabel,
    voucherBadgeHtml,
    canVoidMovement,
    movementTitle,
    renderCashbookPanel,
    renderVouchersPanel,
    renderPayablesPanel,
    renderTransferModalHtml,
    renderVoidMovementModalHtml,
    renderCategoriesModalHtml,
    renderReportsPnlExtras,
  };
});
