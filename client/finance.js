(function (S) {
  'use strict';

  S.fn.loadFinancePage = async function loadFinancePage() {
    if (!S.state.authSession || !S.state.store.id) return;
    const requestNumber = ++S.state.financeRequestNumber;
    const requestSession = S.state.authSession;
    const requestStore = S.state.store.id;
    const current = () => requestNumber === S.state.financeRequestNumber && S.state.authSession === requestSession && S.state.store.id === requestStore;
    S.state.financeLoading = true;
    S.state.financeError = '';
    if (S.state.page === 'finance' && !S.state.financeDataReady) S.fn.refreshFinanceBody();
    try {
      const [result, register] = await Promise.all([
        S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/finance`),
        (S.fn.hasPerm('operateCashShift') || S.fn.hasPerm('posSell'))
          ? S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/cash-register`)
          : Promise.resolve({ session: null, lastClosed: null, recentClosed: [], canOperate: false, canOpen: false, canClose: false }),
      ]);
      if (!current()) return;
      S.state.store.cashbook = result.movements.map(function (row) {
        return { id: row.source_id, movementId: row.movement_id || [row.source_id, row.method, row.direction].join(':'), voucherNumber: row.voucher_number || '', fundType: row.fund_type || '', movementKind: row.movement_kind || 'standard', includeInPnl: row.include_in_pnl === true, voidReason: row.void_reason || '', reversedByMovementId: row.reversed_by_movement_id || null, orderId: row.order_id, orderNumber: row.order_number, counterparty: row.counterparty, sourceType: row.source_type, local: row.offline_pending === true, type: row.direction, category: row.category, amountVnd: row.amount_vnd, note: row.note, method: row.method, actorName: row.actor_name, cashSessionId: row.cash_session_id, cashSessionOpenedAt: row.cash_session_opened_at, createdAt: row.occurred_at };
      });
      S.state.store.suppliers = result.suppliers.map(function (row) { return { id: row.id, name: row.name, debtVnd: String(row.balance_vnd || '0'), lastActivityAt: row.last_activity_at, local: row.offline_pending === true }; });
      S.state.purchaseHistory = (result.purchases || []).map(S.fn.mapFinancePurchase);
      S.state.purchaseOrders = (result.purchaseOrders || []).map(S.fn.mapFinancePurchaseOrder);
      S.state.financeTopCustomers = result.customerDebtors.map(function (row) { return { id: row.id, name: row.name, phone: row.phone, debt: String(row.balance_vnd) }; });
      S.state.financeSummary = {
        todayInVnd: result.summary ? String(result.summary.todayInVnd) : '0', todayOutVnd: result.summary ? String(result.summary.todayOutVnd) : '0',
        customerDebtVnd: result.summary ? String(result.summary.customerDebtVnd) : '0', customerDebtCount: result.summary ? Number(result.summary.customerDebtCount) : 0,
        supplierPayableVnd: result.summary ? String(result.summary.supplierPayableVnd || '0') : '0', periodDate: result.offlineSummaryDate || '',
      };
      S.state.financeMovementTotal = result.movementTotal;
      S.state.cashRegisterState = register;
      S.state.cashRegisterError = '';
      S.state.financeLoading = false;
      S.state.financeDataReady = true;
      if (S.state.page === 'finance') S.fn.refreshFinanceBody();
      if (S.state.page === 'finance' && S.state.financeTab === 'receivables') S.fn.loadFinanceReceivables(S.state.financeReceivables.offset);
      if (S.state.page === 'finance' && ['cashbook', 'vouchers'].includes(S.state.financeTab) && (S.fn.hasPerm('viewReports') || S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('operateCashShift'))) S.fn.loadFinanceCashbook(S.state.financeCashbook.offset || 0);
      if (S.state.page === 'finance' && (S.state.financeTab === 'payables' || (!S.fn.hasPerm('recordCashbook') && !S.fn.hasPerm('operateCashShift') && S.fn.hasPerm('manageInventory')))) S.fn.loadFinancePayables(S.state.financePayables.offset || 0);
      if (S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports')) S.fn.loadFinanceCategories();
    } catch (error) {
      if (!current()) return;
      S.state.financeLoading = false;
      S.state.financeError = error.message;
      S.state.cashRegisterError = error.message;
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      if (S.state.page === 'finance') S.fn.refreshFinanceBody();
    }
  }


  S.fn.loadFinanceReceivables = async function loadFinanceReceivables(offset = 0) {
    if (!S.state.authSession || !S.state.store.id || !S.fn.hasPerm('manageCustomers')) return;
    const state = S.state.financeReceivables;
    const requestNumber = ++state.requestNumber;
    const session = S.state.authSession, storeId = S.state.store.id, query = state.query;
    state.loading = true;
    state.error = '';
    if (S.state.page === 'finance' && S.state.financeTab === 'receivables') S.fn.refreshFinanceBody();
    try {
      const params = new URLSearchParams({ segment: 'owing', limit: '50', offset: String(offset), q: query });
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/customers?${params}`);
      if (state.requestNumber !== requestNumber || S.state.authSession !== session || S.state.store.id !== storeId || state.query !== query) return;
      state.rows = (result.customers || []).map(row => ({ id: row.id, name: row.name, phone: row.phone, debt: String(row.balance_vnd || '0'), creditLimitVnd: String(row.credit_limit_vnd || '0') }));
      state.total = Number(result.total || 0);
      state.nextOffset = result.nextOffset;
      state.offset = offset;
      state.ready = true;
    } catch (error) {
      if (state.requestNumber !== requestNumber || S.state.authSession !== session || S.state.store.id !== storeId) return;
      state.error = error.message || 'Chưa tải được danh sách khách nợ.';
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    } finally {
      if (state.requestNumber === requestNumber && S.state.authSession === session && S.state.store.id === storeId) {
        state.loading = false;
        if (S.state.page === 'finance' && S.state.financeTab === 'receivables') S.fn.refreshFinanceBody();
      }
    }
  }


  S.fn.loadFinanceCashbook = async function loadFinanceCashbook(offset = 0) {
    if (!S.state.authSession || !S.state.store.id || (!S.fn.hasPerm('viewReports') && !S.fn.hasPerm('recordCashbook') && !S.fn.hasPerm('operateCashShift') && !S.fn.hasPerm('posSell'))) return;
    if (S.state.offlineState.mode !== 'online') return;
    const state = S.state.financeCashbook;
    const requestNumber = ++state.requestNumber;
    const session = S.state.authSession, storeId = S.state.store.id;
    const f = state.filters;
    state.loading = true;
    state.error = '';
    if (S.state.page === 'finance' && ['cashbook', 'vouchers'].includes(S.state.financeTab)) S.fn.refreshFinanceBody();
    try {
      const params = new URLSearchParams({ limit: '50', offset: String(offset) });
      if (f.fund && f.fund !== 'all') params.set('fund', f.fund);
      if (f.direction) params.set('direction', f.direction);
      if (f.kind) params.set('kind', f.kind);
      if (f.includeInPnl) params.set('includeInPnl', f.includeInPnl);
      if (f.from) params.set('from', f.from);
      if (f.to) params.set('to', f.to);
      if (f.q && f.q.trim()) params.set('q', f.q.trim());
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/finance/cashbook?${params}`);
      if (state.requestNumber !== requestNumber || S.state.authSession !== session || S.state.store.id !== storeId) return;
      state.rows = Array.isArray(result.movements) ? result.movements : [];
      state.balances = result.balances || null;
      state.total = Number(result.total || 0);
      state.nextOffset = result.nextOffset;
      state.offset = offset;
      state.ready = true;
    } catch (error) {
      if (state.requestNumber !== requestNumber || S.state.authSession !== session || S.state.store.id !== storeId) return;
      state.error = error.message || 'Chưa tải được sổ quỹ.';
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    } finally {
      if (state.requestNumber === requestNumber && S.state.authSession === session && S.state.store.id === storeId) {
        state.loading = false;
        if (S.state.page === 'finance' && ['cashbook', 'vouchers'].includes(S.state.financeTab)) S.fn.refreshFinanceBody();
      }
    }
  }


  S.fn.loadFinanceCategories = async function loadFinanceCategories() {
    if (!S.state.authSession || !S.state.store.id || (!S.fn.hasPerm('recordCashbook') && !S.fn.hasPerm('viewReports'))) return;
    if (S.state.offlineState.mode !== 'online') return;
    const state = S.state.financeCategories;
    const requestNumber = ++state.requestNumber;
    const session = S.state.authSession, storeId = S.state.store.id;
    state.loading = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/finance/categories?includeArchived=true`);
      if (state.requestNumber !== requestNumber || S.state.authSession !== session || S.state.store.id !== storeId) return;
      state.rows = Array.isArray(result.categories) ? result.categories : [];
      state.ready = true;
    } catch (error) {
      if (state.requestNumber === requestNumber && error.status === 401) {
        S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      }
    } finally {
      if (state.requestNumber === requestNumber && S.state.authSession === session && S.state.store.id === storeId) state.loading = false;
    }
  }


  S.fn.loadFinancePayables = async function loadFinancePayables(offset = 0) {
    if (!S.state.authSession || !S.state.store.id || (!S.fn.hasPerm('recordCashbook') && !S.fn.hasPerm('viewReports'))) return;
    if (S.state.offlineState.mode !== 'online') return;
    const state = S.state.financePayables;
    const requestNumber = ++state.requestNumber;
    const session = S.state.authSession, storeId = S.state.store.id, query = state.query, onlyOwing = state.onlyOwing;
    state.loading = true;
    state.error = '';
    if (S.state.page === 'finance' && S.state.financeTab === 'payables') S.fn.refreshFinanceBody();
    try {
      const params = new URLSearchParams({ limit: '50', offset: String(offset), q: query, onlyOwing: onlyOwing ? 'true' : 'false' });
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/finance/payables?${params}`);
      if (state.requestNumber !== requestNumber || S.state.authSession !== session || S.state.store.id !== storeId || state.query !== query || state.onlyOwing !== onlyOwing) return;
      state.rows = Array.isArray(result.suppliers) ? result.suppliers : [];
      state.total = Number(result.total || 0);
      state.totalPayableVnd = String(result.totalPayableVnd || '0');
      state.nextOffset = result.nextOffset;
      state.offset = offset;
      state.ready = true;
    } catch (error) {
      if (state.requestNumber !== requestNumber || S.state.authSession !== session || S.state.store.id !== storeId) return;
      state.error = error.message || 'Chưa tải được công nợ nhà cung cấp.';
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    } finally {
      if (state.requestNumber === requestNumber && S.state.authSession === session && S.state.store.id === storeId) {
        state.loading = false;
        if (S.state.page === 'finance' && S.state.financeTab === 'payables') S.fn.refreshFinanceBody();
      }
    }
  }


  S.fn.cashMethodName = function cashMethodName(method) {
    const labels = { cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', bank_qr: 'QR ngân hàng', card: 'Thẻ', other: 'Khác' };
    return labels[method] || method || 'Khác';
  }


  S.fn.cashMovementTitle = function cashMovementTitle(movement) {
    if (!movement.orderNumber) return movement.category;
    return (movement.type === 'in' ? 'Thu đơn ' : 'Thối tiền đơn ') + movement.orderNumber;
  }


  S.fn.cashRows = function cashRows(rows) {
    return rows.map(movement => {
      const title = S.fn.cashMovementTitle(movement);
      const person = movement.counterparty?.name;
      const session = movement.cashSessionOpenedAt ? `Ca mở ${S.fn.humanDate(movement.cashSessionOpenedAt, true)}` : movement.cashSessionId ? 'Ca tiền mặt' : '';
      const meta = [S.fn.cashMethodName(movement.method), session, movement.actorName].filter(Boolean).join(' · ');
      return `<button type='button' class='finance-cash-row' data-action='cash-movement-detail' data-id='${S.fn.esc(movement.movementId)}'>
        <span><strong>${S.fn.esc(title)}</strong><small>${S.fn.esc(meta)}</small>${person ? `<small>${S.fn.esc(person)}</small>` : ''}</span>
        <span class='finance-cash-amount'><strong class='finance-amount-${movement.type === 'in' ? 'in' : 'out'}'>${movement.type === 'in' ? '+' : '−'}${S.fn.moneyVndText(movement.amountVnd)}</strong><small>${S.fn.humanDate(movement.createdAt, true)}</small></span>
      </button>`;
    }).join('');
  }


  S.fn.findCashMovementById = function findCashMovementById(id) {
    const key = String(id || '');
    const cb = S.state.financeCashbook.rows.find(row => String(row.movement_id) === key);
    if (cb) {
      return {
        id: cb.source_id,
        movementId: cb.movement_id,
        voucherNumber: cb.voucher_number || '',
        fundType: cb.fund_type || '',
        movementKind: cb.movement_kind || 'standard',
        includeInPnl: cb.include_in_pnl === true,
        voidReason: cb.void_reason || '',
        reversedByMovementId: cb.reversed_by_movement_id || null,
        reversesMovementId: cb.reverses_movement_id || null,
        orderId: cb.order_id,
        orderNumber: cb.order_number,
        counterparty: cb.counterparty,
        sourceType: cb.source_type,
        local: false,
        type: cb.direction,
        category: cb.category,
        amountVnd: cb.amount_vnd,
        note: cb.note,
        method: cb.method,
        actorName: cb.actor_name,
        cashSessionId: cb.cash_session_id,
        cashSessionOpenedAt: cb.cash_session_opened_at,
        createdAt: cb.occurred_at,
      };
    }
    return S.state.store.cashbook.find(row => String(row.movementId) === key) || null;
  }


  S.fn.openCashMovement = function openCashMovement(id) {
    const movement = S.fn.findCashMovementById(id);
    if (!movement) return;
    const canRecord = S.fn.hasPerm('recordCashbook');
    const direction = movement.movementKind === 'transfer' ? 'Chuyển quỹ nội bộ' : movement.movementKind === 'reversal' ? 'Phiếu đảo / hủy' : movement.type === 'in' ? 'Khoản thu' : 'Khoản chi';
    const sourceId = S.fn.esc(movement.id || '');
    const orderId = movement.orderId || (['order_payment', 'order_change'].includes(movement.sourceType) ? movement.id : '');
    const order = orderId && S.fn.canAccessRoute('orders');
    const purchase = movement.sourceType === 'purchase_payment' && S.state.purchaseHistory.some(row => row.id === movement.id);
    const voidable = window.SlinkFinanceUI && window.SlinkFinanceUI.canVoidMovement(movement, canRecord);
    const voidBtn = voidable ? `<button class='btn btn-secondary finance-quick-out' type='button' data-action='void-cash-movement' data-id='${S.fn.esc(movement.movementId)}'>Hủy / Đảo phiếu</button>` : '';
    const source = order ? `<button class='btn btn-primary' data-action='order-detail' data-id='${S.fn.esc(orderId)}'>Xem đơn bán</button>`
      : purchase ? `<button class='btn btn-primary' data-action='purchase-detail' data-id='${sourceId}'>Xem phiếu nhập</button>` : '';
    const rows = [];
    if (movement.voucherNumber) rows.push(['Mã chứng từ', movement.voucherNumber]);
    rows.push(['Ngày giờ', S.fn.humanDate(movement.createdAt, true)]);
    rows.push(['Quỹ', movement.fundType === 'cash' ? 'Tiền mặt' : movement.fundType === 'bank' ? 'Ngân hàng' : S.fn.cashMethodName(movement.method)]);
    rows.push(['Phương thức', S.fn.cashMethodName(movement.method)]);
    rows.push(['Hạch toán KQKD', movement.includeInPnl ? 'Có tính Lãi/Lỗ' : 'Không tính Lãi/Lỗ']);
    rows.push(['Người ghi', movement.actorName || 'Nhân viên']);
    if (movement.cashSessionOpenedAt) rows.push(['Ca mở', S.fn.humanDate(movement.cashSessionOpenedAt, true)]);
    if (movement.counterparty?.name) rows.push([movement.type === 'in' ? 'Người nộp tiền' : 'Người nhận tiền', movement.counterparty.name]);
    if (movement.voidReason) rows.push(['Lý do hủy', movement.voidReason]);
    if (movement.reversedByMovementId) rows.push(['Trạng thái', 'Đã bị hủy bởi bút toán đảo']);
    if (movement.note) rows.push(['Ghi chú', movement.note]);
    if (movement.local) rows.push(['Chứng từ', 'Đã lưu trên máy']);
    const body = `<div class='checkout-total'><span>${S.fn.esc(S.fn.cashMovementTitle(movement))}</span><strong>${S.fn.moneyVndText(movement.amountVnd)}</strong></div>
      ${rows.map(([label, value]) => `<div class='detail-line'><span>${label}</span><strong>${S.fn.esc(value)}</strong></div>`).join('')}`;
    S.fn.showModal(direction, '', body, `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button>${voidBtn}${source}`);
  }


  S.fn.renderReceivables = function renderReceivables() {
    const shownCustomers = S.state.financeReceivables.ready ? S.state.financeReceivables.rows : S.state.financeReceivables.query ? [] : S.state.financeTopCustomers;
    const rows = shownCustomers.map(customer => `<div class='activity-item'><span class='avatar'>${S.fn.esc(S.fn.initials(customer.name))}</span>
      <span class='activity-text'><button type='button' class='link-button' data-action='finance-receivable' data-id='${S.fn.esc(customer.id)}'>${S.fn.esc(customer.name)}</button>${customer.phone ? `<small>${S.fn.esc(customer.phone)}</small>` : ''}${BigInt(customer.creditLimitVnd || '0') > 0n && BigInt(customer.debt) > BigInt(customer.creditLimitVnd) ? `<small class='finance-credit-warning'>Vượt hạn mức nợ</small>` : ''}</span>
      <strong class='activity-amount'>${S.fn.moneyVndText(customer.debt)}</strong></div>`).join('');
    const empty = S.state.financeReceivables.loading ? 'Đang tải khách nợ…' : S.state.financeReceivables.error ? 'Chưa tải được danh sách khách nợ' : !S.state.financeDataReady ? (S.state.financeError ? 'Chưa tải được công nợ' : 'Đang tải công nợ…') : S.state.financeReceivables.query ? 'Không tìm thấy khách còn nợ' : 'Chưa có khách còn nợ';
    const detail = S.state.receivableDetail && shownCustomers.some(row => row.id === S.state.receivableDetail.customer.id)
      ? `<section class='panel finance-debt-detail'><div class='panel-header'><h2>${S.fn.esc(S.state.receivableDetail.customer.name)}</h2><button type='button' class='link-button' data-action='close-receivable'>Đóng</button></div>
        <div class='finance-balance'><span>Còn nợ</span><strong>${S.fn.moneyVndText(S.state.receivableDetail.balanceVnd)}</strong></div>
        <div class='finance-debt-actions'><button type='button' class='btn btn-primary' data-action='collect-customer-payment' data-id='${S.fn.esc(S.state.receivableDetail.customer.id)}'>Thu tiền</button><button type='button' class='btn btn-secondary' data-action='add-customer-opening-debt' data-id='${S.fn.esc(S.state.receivableDetail.customer.id)}'>Thêm khoản nợ cũ</button><button type='button' class='btn btn-secondary' data-action='finance-reminder' data-id='${S.fn.esc(S.state.receivableDetail.customer.id)}'>Nhắc nợ QR</button></div>
        <h3>Các khoản còn nợ</h3><div class='activity-list'>${S.state.receivableDetail.orders.map(row => `<div class='activity-item'><span class='activity-text'><strong>Đơn ${S.fn.esc(row.order_number)}</strong><small>${S.fn.humanDate(row.occurred_at)}</small></span><strong>${S.fn.moneyVndText(row.due_vnd)}</strong></div>`).join('')}${(S.state.receivableDetail.openingItems || []).map(row => `<div class='activity-item'><span class='activity-text'><strong>${S.fn.esc(row.note || 'Nợ cũ')}</strong><small>${S.fn.humanDate(row.occurredAt)}</small></span><strong>${S.fn.moneyVndText(row.dueVnd)}</strong></div>`).join('')}</div>
        <h3>Lịch sử công nợ</h3><div class='activity-list'>${S.state.receivableDetail.timeline.map(row => `<div class='activity-item'><span class='activity-text'><strong>${S.fn.esc(row.note || (BigInt(row.debit_vnd) > 0n ? 'Phát sinh nợ' : 'Đã thu'))}</strong><small>${S.fn.humanDate(row.occurred_at, true)}</small></span><strong>${BigInt(row.debit_vnd) > 0n ? '+' + S.fn.moneyVndText(row.debit_vnd) : '−' + S.fn.moneyVndText(row.credit_vnd)}</strong></div>`).join('')}</div></section>` : '';
    return `<div class='finance-balance'><span>Tổng cần thu</span><strong>${S.state.financeDataReady ? S.fn.moneyVndText(S.state.financeSummary.customerDebtVnd) : '—'}</strong></div>
      <div class='finance-debt-layout'><section class='panel'><div class='panel-header'><h2>Khách còn nợ</h2><button type='button' class='link-button' data-action='new-debtor'>＋ Thêm khách nợ</button></div>
      <div class='finance-debt-search'><label class='input-label' for='finance-receivable-search'>Tìm khách còn nợ</label><input id='finance-receivable-search' class='input' type='search' value='${S.fn.esc(S.state.financeReceivables.query)}' placeholder='Tên hoặc số điện thoại' autocomplete='off'/></div>
      ${S.state.financeReceivables.error ? `<div class='notice-item' role='status'><span><strong>Chưa tải được danh sách</strong></span><button type='button' class='link-button' data-action='finance-receivable-retry'>Thử lại</button></div>` : ''}
      <div class='activity-list'>${rows || `<div class='empty-state finance-debt-empty'><strong>${empty}</strong>${S.state.financeDataReady && !S.state.financeReceivables.query ? `<button type='button' class='btn btn-secondary' data-action='new-debtor'>＋ Thêm khách nợ</button>` : ''}</div>`}</div>
      ${S.state.financeReceivables.ready ? `<div class='pagination'><span>Hiển thị ${shownCustomers.length} trên ${S.fn.number(S.state.financeReceivables.total)} khách còn nợ</span><span class='pagination-actions'>${S.state.financeReceivables.offset > 0 ? `<button class='page-button' data-action='finance-receivable-page' data-offset='${Math.max(0, S.state.financeReceivables.offset - 50)}' aria-label='Trang trước'>‹</button>` : ''}${S.state.financeReceivables.nextOffset !== null ? `<button class='page-button' data-action='finance-receivable-page' data-offset='${S.state.financeReceivables.nextOffset}' aria-label='Trang sau'>›</button>` : ''}</span></div>` : ''}</section>${detail || `<aside class='panel finance-debt-placeholder'><h2>Chi tiết công nợ</h2><p class='muted'>Chọn một khách hàng để xem đơn nợ và thu tiền.</p></aside>`}</div>`;
  }


  S.fn.openReceivable = async function openReceivable(id) {
    const customer = S.state.financeReceivables.rows.find(item => item.id === id)
      || S.state.financeTopCustomers.find(item => item.id === id);
    if (!customer) return;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customers/${encodeURIComponent(id)}/debts`);
      if (S.state.page !== 'finance' || S.state.financeTab !== 'receivables') return;
      S.state.receivableDetail = result;
      S.fn.render();
      S.dom.root.querySelector('.finance-debt-detail')?.scrollIntoView({ block: 'nearest' });
    } catch (error) { S.fn.toast('Chưa tải được công nợ', error.message, 'error'); }
  }


  S.fn.openAddCustomerOpeningDebt = function openAddCustomerOpeningDebt(customerId) {
    const host = S.dom.root.querySelector('.finance-debt-detail');
    if (!host || S.state.receivableDetail?.customer.id !== customerId) return;
    host.querySelector('[data-inline-debt-payment]')?.remove();
    host.querySelector('[data-inline-opening-debt]')?.remove();
    const pending = S.fn.loadPendingOpeningDebt(customerId);
    const value = pending?.payload || {};
    const disabled = pending ? 'disabled' : '';
    host.insertAdjacentHTML('beforeend', `<div data-inline-opening-debt><h3>Thêm khoản nợ cũ</h3><form id='opening-debt-form' data-form='customer-opening-debt' data-customer-id='${S.fn.esc(customerId)}'><div class='form-grid'><label class='form-field'><span class='input-label'>Ngày phát sinh</span><input class='input' type='date' name='date' value='${S.fn.esc(value.date || new Date().toISOString().slice(0, 10))}' required ${disabled}/></label><label class='form-field'><span class='input-label'>Số tiền (đ)</span><input class='input' name='amountVnd' type='number' min='1' step='1' inputmode='numeric' value='${S.fn.esc(value.amountVnd || '')}' required ${disabled}/></label><label class='form-field full'><span class='input-label'>Ghi chú khoản nợ</span><input class='input' name='note' maxlength='300' minlength='2' value='${S.fn.esc(value.note || '')}' placeholder='Ví dụ: Đơn giấy ngày 5/11' required ${disabled}/></label></div></form><div class='finance-debt-actions'><button type='button' class='btn btn-secondary' data-action='close-inline-opening-debt'>Hủy</button><button type='submit' form='opening-debt-form' class='btn btn-primary'>${pending ? 'Thử lại khoản đang chờ' : 'Lưu khoản nợ'}</button></div></div>`);
    window.SlinkMoneyFields.enhance(host.querySelector('[data-inline-opening-debt]'));
    host.querySelector('[data-inline-opening-debt]')?.scrollIntoView({ block: 'nearest' });
  }


  S.fn.saveCustomerOpeningDebt = async function saveCustomerOpeningDebt(form) {
    const customerId = form.dataset.customerId;
    let pending = S.fn.loadPendingOpeningDebt(customerId);
    if (!pending) {
      const data = new FormData(form);
      const amountVnd = S.fn.moneyInputRaw(data.get('amountVnd') || '').trim();
      if (!/^[1-9]\d*$/.test(amountVnd) || !Number.isSafeInteger(Number(amountVnd))) return S.fn.toast('Số tiền không hợp lệ', 'Nhập số tiền VND nguyên dương.', 'error');
      pending = { storeId: S.state.store.id, customerId, key: S.fn.newIdempotencyKey(), payload: { amountVnd, date: String(data.get('date') || ''), note: String(data.get('note') || '').trim() } };
    }
    if (!S.fn.savePendingOpeningDebt(pending)) return S.fn.pendingSaveFailed();
    const submit = form.closest('[data-inline-opening-debt]')?.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customers/${encodeURIComponent(customerId)}/opening-debts`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      S.fn.clearPendingOpeningDebt(customerId);
      form.closest('[data-inline-opening-debt]')?.remove();
      await S.fn.loadFinancePage();
      if (S.state.page === 'finance' && S.state.financeTab === 'receivables') {
        S.state.receivableDetail = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customers/${encodeURIComponent(customerId)}/debts`);
        S.fn.render();
      }
      S.fn.toast('Đã lưu khoản nợ cũ', 'Khoản này đã có ngày và ghi chú riêng trong sổ công nợ.');
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) S.fn.clearPendingOpeningDebt(customerId);
      S.fn.toast('Chưa lưu được khoản nợ', error.message, 'error');
      if (submit?.isConnected) submit.disabled = false;
    }
  }


  S.fn.openDebtReminder = async function openDebtReminder(id) {
    const customer = S.state.financeReceivables.rows.find(item => item.id === id)
      || S.state.financeTopCustomers.find(item => item.id === id)
      || S.fn.customerById(id);
    if (!customer) return;
    const debtVnd = Math.max(0, Math.trunc(Number(customer.debt || customer.balanceVnd || 0)));
    const message = `Chào ${customer.name}, ${S.state.store.settings.storeName} xin nhắc khoản còn phải thanh toán là ${S.fn.moneyVndText(debtVnd)}. Nếu bạn đã thanh toán, vui lòng phản hồi để cửa hàng kiểm tra. Cảm ơn bạn!`;
    S.state.activeDebtQrPreview = { dataUrl: '', blob: null, filename: '', text: message };
    const body = `<label class='form-field'><span class='input-label'>Lời nhắc${customer.phone ? ' · ' + S.fn.esc(customer.phone) : ''}</span><textarea class='input finance-reminder-text' rows='4' data-finance-reminder>${S.fn.esc(message)}</textarea></label>`;
    const share = window.SlinkAndroid || typeof navigator.share === 'function' ? `<button class='btn btn-primary' type='button' data-action='share-finance-reminder'>Chia sẻ</button>` : '';
    S.fn.showModal('Nhắc nợ khách hàng', '', body, `<button class='btn btn-secondary' type='button' data-action='copy-finance-reminder'>Sao chép</button>${share}`);
  }


  S.fn.shareOrDownloadDebtQr = async function shareOrDownloadDebtQr(downloadOnly) {
    if (!S.state.activeDebtQrPreview.dataUrl || !window.SlinkReceiptImage) {
      return S.fn.toast('Chưa có ảnh QR', 'Kiểm tra lại thông tin ngân hàng VietQR.', 'error');
    }
    if (downloadOnly) {
      window.SlinkReceiptImage.triggerDownload(S.state.activeDebtQrPreview.dataUrl, S.state.activeDebtQrPreview.filename || 'nhac-no-vietqr.png');
      S.fn.toast('Đã tải ảnh thẻ VietQR');
      return;
    }
    const res = await window.SlinkReceiptImage.sharePng({
      dataUrl: S.state.activeDebtQrPreview.dataUrl,
      blob: S.state.activeDebtQrPreview.blob,
      filename: S.state.activeDebtQrPreview.filename || 'nhac-no-vietqr.png',
      title: 'Nhắc thanh toán công nợ',
      text: S.state.activeDebtQrPreview.text || '',
    });
    if (res?.method === 'download') S.fn.toast('Đã tải ảnh thẻ VietQR');
  }


  S.fn.useDebtReminder = async function useDebtReminder(share) {
    const field = S.dom.modal.querySelector('[data-finance-reminder]');
    const message = field?.value.trim();
    if (!message) return;
    try {
      if (share && window.SlinkAndroid) await S.fn.nativeAction({ type: 'share', title: 'Nhắc công nợ', text: message });
      else if (share && navigator.share) await navigator.share({ title: 'Nhắc công nợ', text: message });
      else { await navigator.clipboard.writeText(message); S.fn.toast('Đã sao chép lời nhắc'); }
    } catch (error) {
      if (error.name !== 'AbortError') { field.select(); S.fn.toast('Bạn có thể sao chép lời nhắc trong ô này.'); }
    }
  }


  S.fn.renderPayables = function renderPayables(canViewFullFinance, canManageSuppliers, canReceivePurchases) {
    const list = S.state.store.suppliers.slice();
    if (canViewFullFinance) list.sort((a, b) => {
      const difference = BigInt(b.debtVnd) - BigInt(a.debtVnd);
      return difference > 0n ? 1 : difference < 0n ? -1 : a.name.localeCompare(b.name, 'vi');
    });
    const supplierRow = supplier => {
      const due = BigInt(supplier.debtVnd);
      const name = canViewFullFinance ? `<button type='button' class='link-button' data-action='supplier-balance' data-id='${S.fn.esc(supplier.id)}'>${S.fn.esc(supplier.name)}</button>` : `<strong>${S.fn.esc(supplier.name)}</strong>`;
      return `<div class='activity-item'><span class='activity-mark'>${S.fn.icon('truck', 14)}</span><span class='activity-text'>${name}
        ${canViewFullFinance ? `<small>${due > 0n ? 'Cần trả' : due < 0n ? 'Đã trả trước' : 'Đã đủ'}</small>` : ''}</span>
        ${canViewFullFinance ? `<strong class='activity-amount'>${S.fn.moneyVndText(due < 0n ? -due : due)}</strong>${due > 0n && !supplier.local ? `<button type='button' class='link-button' data-action='supplier-payment' data-id='${S.fn.esc(supplier.id)}'>Ghi trả tiền</button>` : ''}` : ''}</div>`;
    };
    const rows = list.filter(supplier => !canViewFullFinance || BigInt(supplier.debtVnd) > 0n).map(supplierRow).join('');
    const otherSuppliers = canViewFullFinance ? list.filter(supplier => BigInt(supplier.debtVnd) <= 0n) : [];
    const actions = `${canManageSuppliers ? `<button type='button' class='link-button' data-action='new-supplier'>＋ Thêm nhà cung cấp</button>` : ''}${canReceivePurchases ? `<button type='button' class='link-button' data-action='receive-stock'>＋ Nhập hàng</button>` : ''}`;
    const total = canViewFullFinance ? `<div class='finance-balance'><span>Tổng cần trả</span><strong>${S.state.financeDataReady ? S.fn.moneyVndText(S.state.financeSummary.supplierPayableVnd) : '—'}</strong></div>` : '';
    return `${total}<section class='panel'><div class='panel-header'><h2>Nhà cung cấp</h2><span>${actions}</span></div>
      <div class='activity-list'>${rows || `<div class='empty-state'><strong>${!S.state.financeDataReady ? (S.state.financeError ? 'Chưa tải được danh sách' : 'Đang tải nhà cung cấp…') : canViewFullFinance ? 'Chưa có khoản phải trả' : 'Chưa có nhà cung cấp'}</strong></div>`}</div>
      ${otherSuppliers.length ? `<details class='work-details' data-finance-fold='other-suppliers'><summary>Nhà cung cấp khác (${otherSuppliers.length})</summary><div class='activity-list'>${otherSuppliers.map(supplierRow).join('')}</div></details>` : ''}</section>`;
  }


  S.fn.openSupplierBalance = async function openSupplierBalance(id) {
    if (!S.fn.hasPerm('recordCashbook') && !S.fn.hasPerm('viewReports')) return;
    const supplier = S.state.store.suppliers.find(row => row.id === id);
    if (!supplier) return;
    const generation = S.state.modalGeneration, session = S.state.authSession, storeId = S.state.store.id, openedOn = S.state.page;
    const request = ++S.state.supplierBalanceRequestNumber;
    const current = () => request === S.state.supplierBalanceRequestNumber && S.state.modalGeneration === generation && S.state.authSession === session && S.state.store.id === storeId && S.state.page === openedOn;
    let result = null, issue = '';
    if (!supplier.local) {
      try { result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/suppliers/${encodeURIComponent(id)}/ledger`, { preferFresh: true }); }
      catch (error) {
        if (!current()) return;
        if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
        issue = error.message;
      }
    }
    if (!current()) return;
    const due = BigInt(!result || result.offlineCachedAt ? supplier.debtVnd : result.supplier.balance_vnd);
    const receipts = result?.purchases?.map(S.fn.mapFinancePurchase) || S.state.purchaseHistory.filter(row => row.supplierId === id).slice(0, 8);
    const orders = result?.purchaseOrders?.map(S.fn.mapFinancePurchaseOrder) || S.state.purchaseOrders.filter(row => row.supplierId === id).slice(0, 8);
    const documentButton = (kind, item, label) => `<button type='button' class='link-button' data-supplier-document='${kind}' data-id='${S.fn.esc(item.id)}'>${S.fn.esc(label)}</button>`;
    const entries = (result?.entries || []).map(entry => {
      const increased = BigInt(entry.increases_payable_vnd);
      const label = increased > 0n ? 'Phát sinh phải trả' : entry.entry_type === 'payment_debit' ? 'Đã trả' : 'Giảm phải trả';
      const receipt = entry.purchase_id && receipts.some(row => row.id === entry.purchase_id)
        ? documentButton('receipt', { id: entry.purchase_id }, entry.purchase_number) : '';
      return `<div class='activity-item'><span class='activity-text'><strong>${label}</strong><small>${S.fn.humanDate(entry.occurred_at, true)}${entry.note ? ' · ' + S.fn.esc(entry.note) : ''}</small>${receipt}</span><strong>${S.fn.moneyVndText(increased > 0n ? increased : entry.decreases_payable_vnd)}</strong></div>`;
    }).join('');
    const body = `<div class='checkout-total'><span>${due < 0n ? 'Đã trả trước' : 'Cần trả'}</span><strong>${S.fn.moneyVndText(due < 0n ? -due : due)}</strong></div>
      ${result ? `<section class='activity-list' aria-label='Lịch sử công nợ'><h3>${result.offlineCachedAt ? 'Lịch sử đã tải' : 'Lịch sử gần đây'}</h3>${entries || '<p>Chưa có phát sinh.</p>'}</section>` : `<p class='muted'>${S.fn.esc(supplier.local ? 'Khoản này đã lưu trên máy.' : issue)}</p>`}
      ${orders.length || receipts.length ? `<section class='activity-list finance-supplier-documents' data-supplier-documents><h3>Chứng từ gần đây</h3>${receipts.map(row => documentButton('receipt', row, 'Phiếu nhập ' + row.number)).join('')}${orders.map(row => documentButton('order', row, 'Đơn đặt ' + row.number)).join('')}</section>` : ''}`;
    const action = due > 0n && result && !result.offlineCachedAt ? `<button type='button' class='btn btn-primary' data-action='supplier-payment' data-id='${S.fn.esc(id)}'>Ghi trả tiền</button>` : '';
    if (result && !result.offlineCachedAt) supplier.debtVnd = due.toString();
    S.fn.showModal(supplier.name, 'Công nợ nhà cung cấp', body, `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button>${action}`);
    S.dom.modal.querySelector('.modal-body')?.addEventListener('click', function documentClick(event) {
      const button = event.target.closest('[data-supplier-document]');
      if (!button) return;
      const { id, supplierDocument } = button.dataset;
      if (supplierDocument === 'receipt') S.fn.openPurchaseDetail(id, receipts.find(row => row.id === id));
      else S.fn.openPurchaseOrderDetail(id, orders.find(row => row.id === id));
    });
  }


  S.fn.renderFinanceContent = function renderFinanceContent() {
    const canViewFullFinance = S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports');
    const isStockkeeper = !canViewFullFinance && !S.fn.hasPerm('operateCashShift') && S.fn.hasPerm('manageInventory');
    const canViewCashbook = canViewFullFinance || S.fn.hasPerm('operateCashShift') || S.fn.hasPerm('posSell');
    const canRecord = S.fn.hasPerm('recordCashbook');
    const canManageSuppliers = canRecord || S.fn.hasPerm('manageInventory');
    const canReceivePurchases = canManageSuppliers;
    if (isStockkeeper || (canViewFullFinance && S.state.financeTab === 'payables')) {
      const payablesHtml = canViewFullFinance && window.SlinkFinanceUI && S.state.offlineState.mode === 'online'
        ? window.SlinkFinanceUI.renderPayablesPanel({
          state: S.state.financePayables,
          summaryTotalVnd: S.state.financeDataReady ? S.state.financeSummary.supplierPayableVnd : null,
          canViewFullFinance,
          canManageSuppliers,
          canReceivePurchases,
          fallbackSuppliers: S.state.store.suppliers,
        })
        : S.fn.renderPayables(canViewFullFinance, canManageSuppliers, canReceivePurchases);
      return payablesHtml + `<details class='work-details' data-finance-fold='purchase-history'><summary>Đặt hàng và lịch sử nhập hàng</summary>${S.fn.purchaseOrderPanel()}${S.fn.purchaseHistoryPanel()}</details>`;
    }
    if (canViewFullFinance && S.state.financeTab === 'receivables') return S.fn.renderReceivables();
    const cashSession = S.state.cashRegisterState.session;
    const recentClosed = Array.isArray(S.state.cashRegisterState.recentClosed) ? S.state.cashRegisterState.recentClosed : [];
    const canOperateCash = Boolean(S.state.cashRegisterState.canOperate);
    const canOpenCash = S.state.cashRegisterState.canOpen === true || (!cashSession && canOperateCash);
    const canCloseCash = S.state.cashRegisterState.canClose === true || (S.state.cashRegisterState.canClose === undefined && Boolean(cashSession && canOperateCash));
    let cashSessionPanel = '';
    if (!isStockkeeper && S.state.financeTab === 'shifts') {
      let cashSessionContent = '';
      if (S.state.cashRegisterError) {
        cashSessionContent = `<div class='notice-item'><span>${S.fn.icon('alert', 18)}</span><span><strong>Chưa tải được trạng thái ca</strong></span></div>`;
      } else if (cashSession) {
        const closePermissionNote = canCloseCash ? '' : S.state.store.role === 'cashier' ? 'Chỉ người mở ca mới chốt được ca.' : '';
        cashSessionContent = `<div class='cash-session-summary'><div><small>Trạng thái</small><strong>Đang mở · ${S.fn.esc(cashSession.openedByName || 'Nhân viên')}</strong></div><div><small>Tiền đầu ca</small><strong>${S.fn.moneyVndText(cashSession.openingFloatVnd)}</strong></div><div><small>Thu bằng tiền mặt</small><strong>${S.fn.moneyVndText(cashSession.cashInVnd)}</strong></div><div><small>Chi bằng tiền mặt</small><strong>${S.fn.moneyVndText(cashSession.cashOutVnd)}</strong></div><div><small>Dự kiến trong quầy</small><strong>${S.fn.moneyVndText(cashSession.expectedCashVnd)}</strong></div></div><div class='modal-note'>Mở lúc ${S.fn.humanDate(cashSession.openedAt, true)}. ${closePermissionNote}</div>`;
      } else {
        const message = canOpenCash ? 'Mở ca và nhập tiền đầu ca trước khi ghi giao dịch tiền mặt.' : 'Nhân viên có quyền mở ca sẽ cần bắt đầu trước khi phát sinh giao dịch tiền mặt.';
        cashSessionContent = `<div class='empty-state' style='padding:18px'><strong>Chưa có ca tiền mặt đang mở</strong><span>${message}</span></div>`;
      }
      const cashSessionAction = cashSession && canCloseCash
        ? `<button class='btn btn-primary' data-action='close-cash-session'>Chốt ca</button>`
        : !cashSession && canOpenCash ? `<button class='btn btn-primary' data-action='open-cash-session'>Mở ca</button>` : '';
      const cashSessionHistory = S.state.cashRegisterError ? '' : `<section class='cash-session-history' aria-labelledby='cash-session-history-title'><div class='cash-session-history-heading'><div><h3 id='cash-session-history-title'>Lịch sử ca đã chốt</h3><p>10 ca gần nhất${S.state.store.role === 'cashier' ? ' của bạn' : ''}</p></div></div>${recentClosed.length ? `<div class='cash-session-history-list'>${recentClosed.map(function (item) {
        const variance = BigInt(String(item.varianceVnd || '0'));
        const varianceLabel = variance === 0n ? 'Khớp số tiền' : variance > 0n ? `Thừa ${S.fn.moneyVndText(variance)}` : `Thiếu ${S.fn.moneyVndText(-variance)}`;
        return `<article class='cash-session-history-card'><div class='cash-session-history-top'><div><strong>Chốt ${S.fn.humanDate(item.closedAt, true)}</strong><small>Mở ${S.fn.humanDate(item.openedAt, true)} · ${S.fn.esc(item.openedByName || 'Nhân viên')} → ${S.fn.esc(item.closedByName || 'Nhân viên')}</small></div><span class='cash-session-variance ${variance === 0n ? 'matched' : 'mismatch'}'>${S.fn.esc(varianceLabel)}</span></div><div class='cash-session-history-summary'><div><small>Đầu ca</small><strong>${S.fn.moneyVndText(item.openingFloatVnd)}</strong></div><div><small>Thu tiền mặt</small><strong>${S.fn.moneyVndText(item.cashInVnd)}</strong></div><div><small>Chi tiền mặt</small><strong>${S.fn.moneyVndText(item.cashOutVnd)}</strong></div><div><small>Dự kiến</small><strong>${S.fn.moneyVndText(item.expectedCashVnd)}</strong></div><div><small>Đã đếm</small><strong>${S.fn.moneyVndText(item.countedCashVnd)}</strong></div><div><small>Chênh lệch</small><strong>${S.fn.moneyVndText(variance)}</strong></div></div>${item.closeNote ? `<p class='cash-session-history-note'><strong>Lý do:</strong> ${S.fn.esc(item.closeNote)}</p>` : ''}</article>`;
      }).join('')}</div>` : `<div class='empty-state cash-session-history-empty'><strong>Chưa có ca nào được chốt</strong><span>Lịch sử đối soát sẽ xuất hiện sau khi chốt ca đầu tiên.</span></div>`}</section>`;
      cashSessionPanel = `<section class='panel finance-register-card'><div class='panel-header'><div><h2>Tiền mặt trong quầy</h2><p>${cashSession ? 'Đang mở · ' + S.fn.esc(cashSession.openedByName || 'Nhân viên') : 'Chưa mở ca'}</p>${cashSession ? `<strong class='finance-register-amount'>${S.fn.moneyVndText(cashSession.expectedCashVnd)}</strong>` : ''}</div>${cashSessionAction}</div>
        ${S.state.cashRegisterError ? cashSessionContent : cashSession ? `<details class='work-details' data-finance-fold='shift-current'><summary>Chi tiết ca đang mở</summary>${cashSessionContent}</details>` : ''}
        ${cashSessionHistory ? `<details class='work-details' data-finance-fold='shift-closed'><summary>Xem các ca đã chốt</summary>${cashSessionHistory}</details>` : ''}</section>`;
    }
    const metrics = canViewFullFinance ? `<div class='stat-grid finance-today'><article class='stat-card'><div class='stat-label'>${S.state.financeSummary.periodDate || S.state.offlineState.mode !== 'online' || S.state.offlineState.pending ? 'Thu' + (S.state.financeSummary.periodDate ? ' ' + S.state.financeSummary.periodDate : '') + ' · trên máy' : 'Đã thu hôm nay'}</div><div class='stat-value'>${S.state.financeDataReady ? S.fn.moneyVndText(S.state.financeSummary.todayInVnd) : '—'}</div></article><article class='stat-card'><div class='stat-label'>${S.state.financeSummary.periodDate || S.state.offlineState.mode !== 'online' || S.state.offlineState.pending ? 'Chi' + (S.state.financeSummary.periodDate ? ' ' + S.state.financeSummary.periodDate : '') + ' · trên máy' : 'Đã chi hôm nay'}</div><div class='stat-value'>${S.state.financeDataReady ? S.fn.moneyVndText(S.state.financeSummary.todayOutVnd) : '—'}</div></article></div>` : '';
    if (S.state.financeTab === 'shifts' || (!canViewFullFinance && !isStockkeeper && S.fn.hasPerm('operateCashShift'))) return cashSessionPanel;
    if (S.state.financeTab === 'vouchers' && canRecord) {
      if (window.SlinkFinanceUI && S.state.offlineState.mode === 'online') {
        return window.SlinkFinanceUI.renderVouchersPanel({
          cashbookState: S.state.financeCashbook,
          fallbackRows: S.state.store.cashbook,
          canRecord,
          humanDate: S.fn.humanDate,
        });
      }
      const vouchers = S.state.store.cashbook.filter(row => row.sourceType === 'manual_cash_movement');
      return `<section class='panel finance-record-panel'><div class='panel-header'><div><h2>Phiếu thu và phiếu chi</h2><p>Phiếu ghi tay trong ${S.fn.number(S.state.store.cashbook.length)} giao dịch gần nhất</p></div></div>
        <div class='finance-cash-list'>${S.fn.cashRows(vouchers) || `<div class='empty-state'><strong>${S.state.financeDataReady ? 'Chưa có phiếu ghi tay gần đây' : 'Đang tải…'}</strong></div>`}</div></section>`;
    }
    if (canViewCashbook && window.SlinkFinanceUI && S.state.offlineState.mode === 'online') {
      return window.SlinkFinanceUI.renderCashbookPanel({
        state: S.state.financeCashbook,
        canViewFullFinance,
        canRecord,
        canExport: S.fn.canExportData(),
        humanDate: S.fn.humanDate,
      });
    }
    const cashbook = canViewCashbook ? `<section class='panel finance-record-panel' data-tour-target='finance-register'><div class='panel-header'><div><h2>Sổ thu chi</h2><p>${S.fn.number(S.state.store.cashbook.length)} giao dịch gần nhất${S.state.financeMovementTotal > S.state.store.cashbook.length ? ` trên ${S.fn.number(S.state.financeMovementTotal)}` : ''}</p></div>${S.fn.canExportData() ? `<button type='button' class='link-button' data-action='open-export'>Xuất CSV</button>` : ''}</div>
      <div class='finance-cash-list'>${S.fn.cashRows(S.state.store.cashbook) || `<div class='empty-state'><strong>${!S.state.financeDataReady ? (S.state.financeError ? 'Chưa tải được sổ thu chi' : 'Đang tải sổ thu chi…') : 'Chưa có giao dịch'}</strong></div>`}</div></section>` : '';
    return `${metrics}${cashbook}`;
  }


  S.fn.financeBody = function financeBody() {
    const retry = S.state.financeError ? `<div class='notice-item' role='status'><span><strong>Chưa tải đủ dữ liệu</strong></span><button class='link-button' data-action='reload-finance'>Thử lại</button></div>` : '';
    return retry + S.fn.renderFinanceContent();
  }


  S.fn.refreshFinanceBody = function refreshFinanceBody() {
    const body = S.dom.root.querySelector('[data-finance-content]');
    if (!body) return;
    const active = document.activeElement;
    const focusAction = body.contains(active) ? active.dataset.action : '';
    const focusId = focusAction && active.dataset.id;
    const focusFund = focusAction === 'cashbook-fund' ? active.dataset.fund : '';
    const focusFilterKey = body.contains(active) ? active.dataset?.cashbookFilter : '';
    const focusCheckboxId = body.contains(active) && active.id === 'finance-payable-only-owing' ? active.id : '';
    const preservedSearchIds = ['finance-receivable-search', 'finance-cashbook-search', 'finance-payable-search'];
    const focusInput = body.contains(active) && preservedSearchIds.includes(active.id) ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
    const focusedSummary = body.contains(active) && active.matches('summary') ? active.parentElement : null;
    const openDetails = new Set(Array.from(body.querySelectorAll('details[data-finance-fold][open]'), node => node.dataset.financeFold));
    body.innerHTML = S.fn.financeBody();
    body.querySelectorAll('details[data-finance-fold]').forEach(node => { node.open = openDetails.has(node.dataset.financeFold); });
    S.fn.enhanceRecordLists(body);
    if (focusInput) {
      const input = body.querySelector('#' + focusInput.id);
      if (input) { input.focus({ preventScroll: true }); if (focusInput.start !== null) input.setSelectionRange(focusInput.start, focusInput.end); }
    } else if (focusFilterKey) {
      body.querySelector(`[data-cashbook-filter='${focusFilterKey}']`)?.focus({ preventScroll: true });
    } else if (focusCheckboxId) {
      body.querySelector('#' + focusCheckboxId)?.focus({ preventScroll: true });
    }
    if (focusAction === 'cashbook-fund' && focusFund) {
      body.querySelector(`[data-action='cashbook-fund'][data-fund='${focusFund}']`)?.focus({ preventScroll: true });
    } else if (focusAction) {
      Array.from(body.querySelectorAll('[data-action]')).find(node => node.dataset.action === focusAction && node.dataset.id === focusId)?.focus({ preventScroll: true });
    } else if (focusedSummary?.dataset.financeFold) {
      Array.from(body.querySelectorAll('details[data-finance-fold]')).find(node => node.dataset.financeFold === focusedSummary.dataset.financeFold)?.querySelector('summary')?.focus({ preventScroll: true });
    }
  }


  S.fn.renderFinance = function renderFinance() {
    const canRecord = S.fn.hasPerm('recordCashbook');
    const canViewFullFinance = canRecord || S.fn.hasPerm('viewReports');
    const stockkeeper = !canViewFullFinance && !S.fn.hasPerm('operateCashShift') && S.fn.hasPerm('manageInventory');
    const cashierOnly = !canViewFullFinance && !stockkeeper && S.fn.hasPerm('operateCashShift');
    const actions = stockkeeper ? `<button class='btn btn-secondary' data-action='new-purchase-order'>＋ Đặt hàng</button><button class='btn btn-primary' data-action='receive-stock'>＋ Nhập hàng</button>`
      : canRecord ? `<button class='btn btn-primary' data-action='new-expense' data-direction='in'>＋ Thu</button><button class='btn btn-secondary finance-quick-out' data-action='new-expense' data-direction='out'>− Chi</button><button class='btn btn-secondary' data-action='open-cash-transfer'>⇄ Chuyển quỹ</button>` : '';
    const heading = S.fn.pageHeading(stockkeeper ? 'Nhập hàng' : 'Thu chi', '', actions);
    const tabOptions = canViewFullFinance ? [['cashbook', 'Sổ quỹ'], ['vouchers', 'Phiếu thu / chi'], ['shifts', 'Ca & két tiền'], ['receivables', 'Khách nợ'], ['payables', 'Nhà cung cấp']]
      : cashierOnly ? [['shifts', 'Ca tiền mặt'], ['cashbook', 'Giao dịch']] : [];
    if (cashierOnly && !tabOptions.some(([value]) => value === S.state.financeTab)) S.state.financeTab = 'shifts';
    const tabs = tabOptions.length ? `<nav class='workspace-tabs finance-tabs' aria-label='Các phần thu chi'>${tabOptions.map(([value, label]) => `<button type='button' data-action='finance-tab' data-tab='${value}' ${S.state.financeTab === value ? `aria-current='page'` : ''}>${label}</button>`).join('')}</nav>` : '';
    return `${heading}${tabs}<div data-finance-content>${S.fn.financeBody()}</div>`;
  }


  S.fn.openSupplierPayment = function openSupplierPayment(supplierId) {
    const supplier = S.state.store.suppliers.find(function (item) { return item.id === supplierId; });
    if (!supplier) return S.fn.toast('Không tìm thấy nhà cung cấp', 'Tải lại sổ công nợ rồi thử lại.', 'error');
    const pending = S.fn.loadPendingSupplierPayment(supplierId);
    const due = BigInt(supplier.debtVnd);
    if (!pending && (supplier.local || due <= 0n)) return S.fn.toast('Chưa có khoản phải trả', 'Kiểm tra số dư nhà cung cấp.');
    const disabled = pending ? 'disabled' : '';
    const max = due > 9007199254740991n ? 9007199254740991n : due;
    const amountVnd = pending ? pending.payload.amountVnd : due > max ? '' : due.toString();
    const form = `<form id='entity-form' data-form='supplier-payment' data-id='${supplier.id}'><div class='checkout-total'><span>Còn phải trả ${S.fn.esc(supplier.name)}</span><strong>${S.fn.moneyVndText(due)}</strong></div><div class='form-grid'><div class='form-field full'><label class='input-label'>Số tiền thanh toán (VND) *</label><input class='input' name='amount' type='number' min='1' max='${max}' step='1' value='${S.fn.esc(amountVnd)}' required ${disabled}/></div><div class='form-field'><label class='input-label'>Phương thức</label><div class='select-wrap'><select class='input' name='method' ${disabled}><option value='cash' ${!pending || pending.payload.method === 'cash' ? 'selected' : ''}>Tiền mặt</option><option value='bank_transfer' ${pending && pending.payload.method === 'bank_transfer' ? 'selected' : ''}>Chuyển khoản</option><option value='bank_qr' ${pending && pending.payload.method === 'bank_qr' ? 'selected' : ''}>QR ngân hàng</option><option value='card' ${pending && pending.payload.method === 'card' ? 'selected' : ''}>Thẻ</option><option value='other' ${pending && pending.payload.method === 'other' ? 'selected' : ''}>Khác</option></select></div></div><div class='form-field'><label class='input-label'>Ghi chú</label><input class='input' name='note' maxlength='300' value='${pending ? S.fn.esc(pending.payload.note) : ''}' placeholder='Mã giao dịch hoặc nội dung chuyển tiền' ${disabled}/></div></div>${pending ? `<div class='modal-note'>Khoản thanh toán đang chờ xác nhận. Gửi lại cùng nội dung để tránh ghi sổ hai lần.</div>` : ''}</form>`;
    S.fn.showModal(pending ? 'Kiểm tra khoản thanh toán đang chờ' : 'Thanh toán nhà cung cấp', `Số dư hiện tại · ${S.fn.moneyVndText(due)}`, form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Để sau</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại khoản thanh toán' : 'Ghi nhận thanh toán'}</button>`);
  }


  S.fn.voucherCategories = function voucherCategories(direction, current) {
    const names = direction === 'in' ? ['Thu khác', 'Góp vốn', 'Hoàn lại chi phí'] : ['Vận hành', 'Điện nước', 'Thuê mặt bằng', 'Nhập hàng', 'Hoàn tiền', 'Chi khác'];
    if (current && !names.includes(current)) names.push(current);
    return names.map(name => `<option value='${S.fn.esc(name)}' data-default-pnl='${/góp vốn|rút vốn/i.test(name) ? '0' : '1'}' ${current === name ? 'selected' : ''}>${S.fn.esc(name)}</option>`).join('');
  }


  S.fn.voucherCategoryOptions = function voucherCategoryOptions(direction, currentName, currentId) {
    const active = (S.state.financeCategories.rows || [])
      .filter(cat => cat.status === 'active' && (cat.direction === direction || cat.direction === 'both'))
      .sort((a, b) => (a.direction === direction ? 0 : 1) - (b.direction === direction ? 0 : 1));
    if (!active.length) return S.fn.voucherCategories(direction, currentName);
    const hasMatch = active.some(cat => (currentId && cat.id === currentId) || (!currentId && currentName && cat.name === currentName));
    const options = active.map((cat, idx) => {
      const selected = hasMatch ? (currentId ? cat.id === currentId : cat.name === currentName) : idx === 0;
      return `<option value='${S.fn.esc(cat.name)}' data-category-id='${S.fn.esc(cat.id)}' data-default-pnl='${cat.default_include_in_pnl ? '1' : '0'}' ${selected ? 'selected' : ''}>${S.fn.esc(cat.name)}</option>`;
    }).join('');
    if (!hasMatch && currentName) {
      return options + `<option value='${S.fn.esc(currentName)}' data-category-id='${S.fn.esc(currentId || '')}' data-default-pnl='1' selected>${S.fn.esc(currentName)}</option>`;
    }
    return options;
  }


  S.fn.openExpense = function openExpense(direction) {
    const pending = S.fn.loadPendingCash();
    const disabled = pending ? 'disabled' : '';
    const payload = pending ? pending.payload : { direction: direction === 'in' ? 'in' : 'out', amountVnd: '', category: direction === 'in' ? 'Thu nhập khác' : 'Chi phí vận hành khác', categoryId: '', method: 'cash', note: '' };
    const party = payload.counterparty;
    const isOtherParty = party?.kind === 'other';
    const matchingCats = (S.state.financeCategories.rows || [])
      .filter(cat => cat.status === 'active' && (cat.direction === payload.direction || cat.direction === 'both'))
      .sort((a, b) => (a.direction === payload.direction ? 0 : 1) - (b.direction === payload.direction ? 0 : 1));
    const initialCat = matchingCats.find(cat => (payload.categoryId && cat.id === payload.categoryId) || cat.name === payload.category) || matchingCats[0];
    const initialPnl = typeof payload.includeInPnl === 'boolean' ? payload.includeInPnl : (initialCat ? Boolean(initialCat.default_include_in_pnl) : true);
    const form = `<form id='entity-form' data-form='cash'><div class='form-grid'>
      <label class='form-field full'><span class='input-label'>Số tiền (đ) *</span><input class='input finance-voucher-amount' name='amount' type='number' min='1' step='1' required value='${S.fn.esc(payload.amountVnd)}' placeholder='0' ${disabled}/></label>
      <label class='form-field'><span class='input-label'>Loại giao dịch</span><select class='input' name='type' ${disabled}><option value='in' ${payload.direction === 'in' ? 'selected' : ''}>Phiếu thu</option><option value='out' ${payload.direction === 'out' ? 'selected' : ''}>Phiếu chi</option></select></label>
      <label class='form-field'><span class='input-label'>Khoản mục</span><select class='input' name='category' ${disabled}>${S.fn.voucherCategoryOptions(payload.direction, payload.category, payload.categoryId)}</select></label>
      <label class='form-field'><span class='input-label'>Phương thức</span><select class='input' name='method' ${disabled}>${['cash', 'bank_transfer', 'bank_qr', 'card', 'other'].map(value => `<option value='${value}' ${payload.method === value ? 'selected' : ''}>${S.fn.esc(S.fn.cashMethodName(value))}</option>`).join('')}</select></label>
      <label class='form-field'><span class='input-label' data-voucher-party-label>${payload.direction === 'in' ? 'Người nộp tiền' : 'Người nhận tiền'}</span><select class='input' name='partyKind' ${disabled}><option value=''>Không chọn</option>${[['customer', 'Khách hàng'], ['supplier', 'Nhà cung cấp'], ['staff', 'Nhân viên'], ['other', 'Đối tượng khác']].map(([value, label]) => `<option value='${value}' ${party?.kind === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <div class='form-field full finance-party' data-voucher-party ${party && !isOtherParty ? '' : 'hidden'}><input class='input' id='voucher-party-search' name='partySearch' type='search' maxlength='80' autocomplete='off' aria-label='Tìm theo tên' placeholder='Tìm theo tên' value='${S.fn.esc(!isOtherParty ? (party?.name || '') : '')}' ${disabled}/><div class='finance-party-options' data-voucher-options></div></div>
      <label class='form-field full' data-voucher-party-other ${isOtherParty ? '' : 'hidden'}><span class='input-label'>Tên đối tượng khác *</span><input class='input' id='voucher-party-other-name' name='partyOtherName' maxlength='80' placeholder='Ví dụ: EVN, Chủ mặt bằng, Grab…' value='${S.fn.esc(isOtherParty ? (party?.name || '') : '')}' ${disabled}/></label>
      <label class='fv-checkbox-inline full'><input type='checkbox' name='includeInPnl' ${initialPnl ? 'checked' : ''} ${disabled}/><span>Hạch toán vào kết quả kinh doanh (Lãi/Lỗ)</span></label>
      <label class='form-field full'><span class='input-label'>Ghi chú</span><textarea class='input finance-reminder-text' name='note' rows='2' maxlength='300' placeholder='Không bắt buộc' ${disabled}>${S.fn.esc(payload.note)}</textarea></label>
      ${pending ? '' : `<div class='form-field full'><span class='input-label'>Chọn nhanh lý do</span><div style='display:flex;flex-wrap:wrap;gap:6px'>${(payload.direction === 'in' ? ['Thu nợ khách', 'Góp vốn thêm', 'Thu hoàn trả', 'Thu khác'] : ['Tiền điện / nước', 'Thuê mặt bằng', 'Trả lương nhân viên', 'Nhập hàng lẻ', 'Phí vận chuyển', 'Chi vật tư']).map(r => `<button type='button' class='pos-fast-chip' data-action='expense-quick-note' data-note='${S.fn.esc(r)}'>${S.fn.esc(r)}</button>`).join('')}</div></div>`}</div>
      ${pending ? `<p class='modal-note'>Phiếu đang chờ xác nhận. Gửi lại cùng nội dung để tránh ghi hai lần.</p>` : ''}</form>`;
    S.fn.showModal(pending ? 'Kiểm tra phiếu đang chờ' : payload.direction === 'in' ? 'Thu tiền' : 'Chi tiền', '', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại phiếu' : 'Lưu phiếu'}</button>`);
    const element = S.dom.modal.querySelector('[data-form="cash"]');
    const kind = element.elements.partyKind;
    const search = element.elements.partySearch;
    const otherWrap = element.querySelector('[data-voucher-party-other]');
    const otherInput = element.elements.partyOtherName;
    const results = element.querySelector('[data-voucher-options]');
    element.cashCounterparty = party;
    if (pending) return;
    if (!S.state.financeCategories.ready && S.state.offlineState.mode === 'online') {
      const gen = S.state.modalGeneration;
      S.fn.loadFinanceCategories().then(() => {
        if (gen !== S.state.modalGeneration || S.dom.modal.hidden || !element.isConnected) return;
        const catSel = element.elements.category;
        const pnlBox = element.elements.includeInPnl;
        catSel.innerHTML = S.fn.voucherCategoryOptions(element.elements.type.value, catSel.value, '');
        const opt = catSel.selectedOptions[0];
        if (opt && opt.dataset.defaultPnl !== undefined && pnlBox) pnlBox.checked = opt.dataset.defaultPnl === '1';
      });
    }
    let timer, sequence = 0;
    function findPeople() {
      clearTimeout(timer);
      const request = ++sequence;
      const type = kind.value;
      element.cashCounterparty = null;
      search.setCustomValidity('');
      if (otherInput) otherInput.setCustomValidity('');
      if (otherWrap) otherWrap.hidden = type !== 'other';
      element.querySelector('[data-voucher-party]').hidden = !type || type === 'other';
      results.replaceChildren();
      if (!type || type === 'other') return;
      const query = search.value.trim();
      function renderPeople(people, empty = '') {
        results.innerHTML = people.map(person => `<button type='button' class='link-button' data-voucher-option='${S.fn.esc(person.id)}'>${S.fn.esc(person.name)}${person.detail ? `<small>${S.fn.esc(person.detail)}</small>` : ''}</button>`).join('') || (empty ? `<small role='status'>${empty}</small>` : '');
        results.people = people;
      }
      const cached = type === 'customer' ? [...S.state.store.customers, ...S.state.financeTopCustomers] : type === 'supplier' ? S.state.store.suppliers : S.state.staffState.members;
      const matchText = text => text.normalize('NFKC').toLocaleLowerCase('vi');
      const local = Array.from(new Map(cached.filter(person => (type === 'staff' ? person.user_id : person.id) && !String(person.id).startsWith('local:'))
        .map(person => ({ id: type === 'staff' ? person.user_id : person.id, name: person.name || person.display_name, detail: person.phone }))
        .filter(person => person.name && matchText(person.name + ' ' + (person.detail || '')).includes(matchText(query))).map(person => [person.id, person])).values()).slice(0, 20);
      renderPeople(local);
      const current = () => request === sequence && element.isConnected && !element.cashCounterparty && !search.disabled;
      timer = setTimeout(async () => {
        try {
          const data = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/finance/people?kind=${type}&q=${encodeURIComponent(query)}`);
          if (current()) renderPeople(data.people, 'Không tìm thấy người phù hợp.');
        } catch (_) {
          if (current() && !local.length) renderPeople([], 'Chưa tải được danh sách. Bạn có thể bỏ chọn người hoặc thử lại.');
        }
      }, 180);
    }
    kind.addEventListener('change', () => { search.value = ''; if (otherInput) otherInput.value = ''; findPeople(); if (kind.value === 'other' && otherInput) otherInput.focus(); else if (kind.value) search.focus(); });
    search.addEventListener('input', findPeople);
    results.addEventListener('click', event => {
      const person = results.people?.find(row => row.id === event.target.closest('[data-voucher-option]')?.dataset.voucherOption);
      if (!person) return;
      element.cashCounterparty = { kind: kind.value, id: person.id, name: person.name };
      search.value = person.name;
      search.setCustomValidity('');
      results.replaceChildren();
      search.focus();
    });
    element.elements.category.addEventListener('change', () => {
      const opt = element.elements.category.selectedOptions[0];
      if (opt && opt.dataset.defaultPnl !== undefined && element.elements.includeInPnl) {
        element.elements.includeInPnl.checked = opt.dataset.defaultPnl === '1';
      }
    });
    element.elements.type.addEventListener('change', event => {
      const incoming = event.target.value === 'in';
      element.elements.category.innerHTML = S.fn.voucherCategoryOptions(event.target.value, '', '');
      const opt = element.elements.category.selectedOptions[0];
      if (opt && opt.dataset.defaultPnl !== undefined && element.elements.includeInPnl) {
        element.elements.includeInPnl.checked = opt.dataset.defaultPnl === '1';
      }
      element.querySelector('[data-voucher-party-label]').textContent = incoming ? 'Người nộp tiền' : 'Người nhận tiền';
      S.dom.modal.querySelector('#modal-title').textContent = incoming ? 'Thu tiền' : 'Chi tiền';
    });
  }


  S.fn.openCashTransfer = function openCashTransfer() {
    if (!window.SlinkFinanceUI) return;
    if (S.state.offlineState.mode !== 'online') return S.fn.toast('Cần kết nối mạng', 'Chuyển quỹ nội bộ cần thực hiện khi trực tuyến.', 'error');
    const body = window.SlinkFinanceUI.renderTransferModalHtml();
    S.fn.showModal('Chuyển quỹ nội bộ', 'Chuyển tiền qua lại giữa quỹ Tiền mặt và Ngân hàng.', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>Xác nhận chuyển</button>`);
    const form = S.dom.modal.querySelector('[data-form="cash-transfer"]');
    if (form) {
      form.elements.fromFund.addEventListener('change', () => {
        form.elements.toFund.value = form.elements.fromFund.value === 'cash' ? 'bank' : 'cash';
      });
      form.elements.toFund.addEventListener('change', () => {
        form.elements.fromFund.value = form.elements.toFund.value === 'cash' ? 'bank' : 'cash';
      });
    }
  }


  S.fn.openVoidCashMovement = function openVoidCashMovement(id) {
    if (!window.SlinkFinanceUI) return;
    if (S.state.offlineState.mode !== 'online') return S.fn.toast('Cần kết nối mạng', 'Hủy chứng từ cần thực hiện khi trực tuyến.', 'error');
    const movement = S.fn.findCashMovementById(id);
    if (!movement) return S.fn.toast('Không tìm thấy chứng từ', 'Hãy tải lại sổ quỹ và thử lại.', 'error');
    const body = window.SlinkFinanceUI.renderVoidMovementModalHtml(movement);
    S.fn.showModal('Hủy / Đảo phiếu thu chi', '', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-primary finance-quick-out' type='submit' form='entity-form'>Xác nhận hủy phiếu</button>`);
  }


  S.fn.openCashCategoriesModal = async function openCashCategoriesModal() {
    if (!window.SlinkFinanceUI) return;
    if (!S.state.financeCategories.ready && S.state.offlineState.mode === 'online') await S.fn.loadFinanceCategories();
    const body = window.SlinkFinanceUI.renderCategoriesModalHtml(S.state.financeCategories.rows);
    S.fn.showModal('Quản lý khoản mục thu chi', 'Khoản mục giúp phân loại chi phí vận hành và tự động tính Lãi/Lỗ.', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-primary' type='submit' form='entity-form'>Thêm khoản mục</button>`);
  }


  S.fn.openCashSessionForm = function openCashSessionForm(returnFlow) {
    const pending = S.fn.loadPendingCashSessionOpen();
    const initial = pending ? pending.payload.openingFloatVnd : S.state.cashRegisterState.lastClosed ? S.state.cashRegisterState.lastClosed.countedCashVnd : '0';
    const disabled = pending ? 'disabled' : '';
    const form = `<form id='entity-form' data-form='cash-session-open' data-return-flow='${returnFlow === 'checkout' ? 'checkout' : ''}'><div class='form-field'><label class='input-label' for='cash-session-opening'>Tiền mặt có sẵn trong quầy (VND) *</label><input class='input' id='cash-session-opening' name='openingFloatVnd' type='number' inputmode='numeric' min='0' step='1' value='${S.fn.esc(initial)}' required ${disabled}/></div><div class='modal-note'>Nhập số tiền thực tế đã đếm trước khi bắt đầu bán. Giao dịch tiền mặt sẽ được gắn vào ca này cho đến khi chốt ca.</div></form>`;
    S.fn.showModal(pending ? 'Kiểm tra yêu cầu mở ca' : 'Mở ca tiền mặt', pending ? 'Gửi lại đúng số tiền đầu ca để xác nhận trạng thái.' : 'Xác nhận số tiền ban đầu có trong quầy.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Kiểm tra yêu cầu' : 'Bắt đầu ca'}</button>`);
  }


  S.fn.openCashSessionCloseForm = function openCashSessionCloseForm() {
    const session = S.state.cashRegisterState.session;
    if (!session) return S.fn.toast('Không có ca đang mở', 'Tải lại trạng thái ca trước khi chốt.', 'error');
    const pending = S.fn.loadPendingCashSessionClose(session.id);
    const expected = pending?.payload._slinkExpectedCashVnd ?? session.expectedCashVnd;
    const counted = pending?.payload.countedCashVnd ?? '';
    const note = pending?.payload.note || '';
    const locked = pending ? 'disabled' : '';
    const form = `<form id='entity-form' data-form='cash-session-close' data-session-id='${S.fn.esc(session.id)}' data-expected-cash-vnd='${S.fn.esc(expected)}' data-pending='${Boolean(pending)}'>
      <div class='checkout-total'><span>Dự kiến trong quầy</span><strong>${S.fn.moneyVndText(expected)}</strong></div>
      <div class='form-grid'>
        <div class='form-field full'><label class='input-label' for='cash-session-counted'>Bạn đếm được (VND) *</label>
          <input class='input' id='cash-session-counted' name='countedCashVnd' type='number' min='0' step='1' value='${S.fn.esc(counted)}' required ${locked}/>
          <p class='muted' data-cash-close-variance role='status' aria-live='polite' hidden></p>
        </div>
        <div class='form-field full' data-cash-close-reason hidden><label class='input-label' for='cash-session-note'>Lý do chênh lệch *</label>
          <textarea class='input' id='cash-session-note' name='note' rows='2' maxlength='500' ${locked}>${S.fn.esc(note)}</textarea>
        </div>
      </div>
    </form>`;
    const footer = `<button class='btn btn-secondary' type='button' data-action='close-modal'>Để sau</button>
      <button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Kiểm tra yêu cầu' : 'Xác nhận chốt ca'}</button>`;
    S.fn.showModal(pending ? 'Kiểm tra yêu cầu chốt ca' : 'Chốt ca tiền mặt', 'Đếm tiền mặt trong quầy rồi nhập tổng thực tế.', form, footer);
    S.fn.updateCashClosePreview(S.dom.modal.querySelector('[data-form="cash-session-close"]'));
  }


  S.fn.updateCashClosePreview = function updateCashClosePreview(form) {
    if (!form) return;
    const counted = S.fn.validCashSessionAmount(S.fn.moneyInputRaw(form.elements.countedCashVnd.value));
    const variance = counted === null ? null : BigInt(counted) - BigInt(form.dataset.expectedCashVnd);
    const output = form.querySelector('[data-cash-close-variance]');
    output.hidden = variance === null;
    output.textContent = variance === null ? '' : variance === 0n ? 'Khớp với số dự kiến'
      : variance < 0n ? 'Thiếu ' + S.fn.moneyVndText(-variance) : 'Thừa ' + S.fn.moneyVndText(variance);
    const showReason = variance !== null && variance !== 0n;
    const note = form.elements.note;
    form.querySelector('[data-cash-close-reason]').hidden = !showReason;
    note.disabled = !showReason || form.dataset.pending === 'true';
    note.required = showReason && !note.disabled;
    note.setCustomValidity(note.required && note.value.trim().length < 2 ? 'Nhập lý do chênh lệch.' : '');
  }


  S.fn.validCashSessionAmount = function validCashSessionAmount(value) {
    const text = String(value == null ? '' : value).trim();
    if (!/^(0|[1-9]\d{0,15})$/.test(text)) return null;
    const amount = BigInt(text);
    return amount <= 9007199254740991n ? text : null;
  }


  S.fn.saveCashSessionOpen = async function saveCashSessionOpen(form) {
    let pending = S.fn.loadPendingCashSessionOpen();
    if (!pending) {
      const openingFloatVnd = S.fn.validCashSessionAmount(new FormData(form).get('openingFloatVnd'));
      if (openingFloatVnd === null) return S.fn.toast('Tiền đầu ca không hợp lệ', 'Nhập số VND nguyên không âm, tối đa 9.007.199.254.740.991.', 'error');
      pending = { storeId: S.state.store.id, key: S.fn.newIdempotencyKey(), payload: { _slinkOfflineVersion: 1, openingFloatVnd: openingFloatVnd } };
    }
    if (!S.fn.savePendingCashSessionOpen(pending)) return S.fn.pendingSaveFailed();
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/cash-register/open`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      S.fn.clearPendingCashSessionOpen();
      S.fn.closeModal();
      await S.fn.loadFinancePage();
      S.fn.emitSyncDomains(['cashbook', 'dashboard'], { source: 'cash-session-open' });
      S.fn.render();
      S.fn.toast(result.offlineQueued ? 'Đã lưu ca trên máy' : 'Đã mở ca tiền mặt', result.offlineQueued ? '' : 'Các giao dịch được đối soát trong ca này.');
      if (form.dataset.returnFlow === 'checkout' && S.state.checkoutPendingPayload) S.fn.openCheckout();
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra yêu cầu mở ca.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingCashSessionOpen();
        if (!S.dom.modal.hidden) form.querySelectorAll('input').forEach(function (field) { field.disabled = false; });
        if (error.code === 'cash_session_already_open') await S.fn.loadFinancePage();
      }
      S.fn.toast('Chưa mở được ca tiền mặt', error.message, 'error');
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }


  S.fn.saveCashSessionClose = async function saveCashSessionClose(form) {
    const sessionId = form.dataset.sessionId;
    let pending = S.fn.loadPendingCashSessionClose(sessionId);
    if (!pending) {
      const data = new FormData(form);
      const countedCashVnd = S.fn.validCashSessionAmount(data.get('countedCashVnd'));
      const note = String(data.get('note') || '').trim();
      if (countedCashVnd === null) return S.fn.toast('Tiền thực đếm không hợp lệ', 'Nhập số VND nguyên không âm, tối đa 9.007.199.254.740.991.', 'error');
      if (BigInt(countedCashVnd) !== BigInt(form.dataset.expectedCashVnd) && note.length < 2) {
        form.elements.note.reportValidity();
        return;
      }
      pending = { storeId: S.state.store.id, sessionId, key: S.fn.newIdempotencyKey(), payload: { _slinkOfflineVersion: 1, _slinkExpectedCashVnd: form.dataset.expectedCashVnd, sessionId, countedCashVnd, note } };
    }
    if (!S.fn.savePendingCashSessionClose(pending)) return S.fn.pendingSaveFailed();
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/cash-register/${encodeURIComponent(sessionId)}/close`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      S.fn.clearPendingCashSessionClose(sessionId);
      S.fn.closeModal();
      await S.fn.loadFinancePage();
      S.fn.emitSyncDomains(['cashbook', 'dashboard'], { source: 'cash-session-close' });
      S.fn.render();
      const variance = result.session.varianceVnd;
      S.fn.toast(result.offlineQueued ? 'Đã lưu chốt ca trên máy' : 'Đã chốt ca tiền mặt', variance === '0' ? 'Tiền thực đếm khớp số dự kiến.' : `Chênh lệch đã ghi nhận: ${S.fn.moneyVndText(variance)}.`);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra yêu cầu chốt ca.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingCashSessionClose(sessionId);
        if (!S.dom.modal.hidden) form.querySelectorAll('input,textarea').forEach(function (field) { field.disabled = false; });
        if (error.code === 'cash_session_not_open') await S.fn.loadFinancePage();
      }
      S.fn.toast('Chưa chốt được ca tiền mặt', error.message, 'error');
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }


  S.fn.openCollectCustomerPayment = async function openCollectCustomerPayment(customerId) {
    const generation = S.state.modalGeneration;
    const openedOnPage = S.state.page;
    const session = S.state.authSession;
    const canShow = () => S.state.modalGeneration === generation && S.state.page === openedOnPage && S.state.authSession === session;
    let debt;
    try {
      debt = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customers/${encodeURIComponent(customerId)}/debts`);
    } catch (error) { if (canShow()) S.fn.toast('Chưa tải được công nợ', error.message, 'error'); return; }
    if (!canShow()) return;
    const pending = S.fn.loadPendingCustomerPayment(customerId);
    const due = BigInt(debt.balanceVnd || '0');
    const outstanding = due > 0n ? due : 0n;
    const fromFinance = openedOnPage === 'finance' && S.state.receivableDetail?.customer?.id === customerId && !!S.dom.root.querySelector('.finance-debt-detail');
    const payload = pending ? pending.payload : { amountVnd: fromFinance ? '' : due.toString(), method: 'cash', note: '' };
    const disabled = pending ? 'disabled' : '';
    const chosen = new Map((payload.allocations || []).map(item => [item.orderId, item.amountVnd]));
    const manual = Boolean(payload.allocations);
    const dues = debt.orders.map(row => ({ id: row.id, label: `Đơn ${row.order_number} · ${S.fn.humanDate(row.occurred_at)}`, due: row.due_vnd }));
    (debt.openingItems || []).forEach(row => dues.push({ id: `opening:${row.id}`, label: `${row.note || 'Nợ cũ'} · ${S.fn.humanDate(row.occurredAt)}`, due: row.dueVnd }));
    const dueRows = dues.map(row => `<label class='debt-allocation'><span><strong>${S.fn.esc(row.label)}</strong><small>Còn ${S.fn.moneyVndText(row.due)}</small></span><input class='input' data-debt-allocation='${S.fn.esc(row.id)}' aria-label='Thu cho ${S.fn.esc(row.label)}' type='number' min='0' max='${S.fn.esc(row.due)}' step='1' inputmode='numeric' value='${S.fn.esc(chosen.get(row.id) || '')}' ${disabled}/></label>`).join('');
    const body = `<form id='entity-form' data-form='customer-payment' data-customer-id='${S.fn.esc(customerId)}'><div class='checkout-total'><span>${due > 0n ? 'Còn phải thu' : 'Khách đang có dư'} · ${S.fn.esc(debt.customer.name)}</span><strong>${S.fn.moneyVndText(due > 0n ? due : -due)}</strong></div><div class='form-grid'><div class='form-field'><label class='input-label'>Số tiền khách trả (đ) *</label><input class='input' name='amountVnd' type='number' min='1' step='1' value='${S.fn.esc(payload.amountVnd)}' required ${disabled}/></div><div class='form-field'><label class='input-label'>Nhận bằng</label><div class='select-wrap'><select class='input' name='method' ${disabled}><option value='cash' ${payload.method === 'cash' ? 'selected' : ''}>Tiền mặt</option><option value='bank_transfer' ${payload.method === 'bank_transfer' ? 'selected' : ''}>Chuyển khoản</option><option value='bank_qr' ${payload.method === 'bank_qr' ? 'selected' : ''}>QR ngân hàng</option><option value='card' ${payload.method === 'card' ? 'selected' : ''}>Thẻ</option><option value='other' ${payload.method === 'other' ? 'selected' : ''}>Khác</option></select></div></div></div>${outstanding ? `<label class='form-field'><span class='input-label'>Trừ tiền vào</span><select class='input' data-debt-mode ${disabled}><option value='oldest' ${manual ? '' : 'selected'}>Tự trừ khoản cũ nhất</option><option value='selected' ${manual ? 'selected' : ''}>Chọn từng khoản</option></select></label><div data-debt-rows ${manual ? '' : 'hidden'}>${dueRows}</div>` : ''}<p class='editor-field-note' data-debt-summary></p><label class='form-field'><span class='input-label'>Ghi chú</span><input class='input' name='note' maxlength='300' value='${S.fn.esc(payload.note || '')}' placeholder='Có thể bỏ trống' ${disabled}/></label>${pending ? `<div class='modal-note'>Khoản thu đang chờ xác nhận. Gửi lại đúng nội dung để tránh ghi hai lần.</div>` : ''}</form>`;
    if (fromFinance) {
      const host = S.dom.root.querySelector('.finance-debt-detail');
      host.querySelector('[data-inline-debt-payment]')?.remove();
      host.insertAdjacentHTML('beforeend', `<div data-inline-debt-payment><h3>Thu tiền nợ</h3>${body}<div class='finance-debt-actions'><button class='btn btn-secondary' type='button' data-action='close-inline-debt-payment'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại khoản thu' : 'Xác nhận thu tiền'}</button></div></div>`);
      host.querySelector('[data-inline-debt-payment]')?.scrollIntoView({ block: 'nearest' });
    } else S.fn.showModal(pending ? 'Kiểm tra khoản thu đang chờ' : 'Thu tiền nợ', '', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Quay lại</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại khoản thu' : 'Xác nhận thu tiền'}</button>`);
    const form = fromFinance ? S.dom.root.querySelector('.finance-debt-detail [data-form="customer-payment"]') : S.dom.modal.querySelector('[data-form="customer-payment"]');
    window.SlinkMoneyFields.enhance(fromFinance ? form.parentElement : S.dom.modal);
    const safeAmount = input => {
      const raw = S.fn.moneyInputRaw(input?.value || '');
      return /^\d+$/.test(raw) ? BigInt(raw) : 0n;
    };
    const update = () => {
      const selectedMode = form.querySelector('[data-debt-mode]')?.value === 'selected';
      const rows = form.querySelector('[data-debt-rows]');
      if (rows) rows.hidden = !selectedMode;
      const total = selectedMode ? Array.from(form.querySelectorAll('[data-debt-allocation]')).reduce((sum, input) => sum + safeAmount(input), 0n) : safeAmount(form.elements.amountVnd);
      if (selectedMode && !pending) form.elements.amountVnd.value = total ? window.SlinkMoneyFields.format(total.toString()) : '';
      form.elements.amountVnd.readOnly = selectedMode;
      form.querySelector('[data-debt-summary]').textContent = total > due
        ? `Thu ${S.fn.moneyVndText(total)} · hết nợ, khách còn dư ${S.fn.moneyVndText(total - due)} để dùng lần mua sau`
        : `Thu ${S.fn.moneyVndText(total)} · còn nợ ${S.fn.moneyVndText(due - total)}`;
    };
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    update();
  }


  S.fn.saveCustomerPayment = async function saveCustomerPayment(form) {
    const customerId = form.dataset.customerId;
    const session = S.state.authSession;
    const generation = S.state.modalGeneration;
    const originalPage = S.state.page;
    let pending = S.fn.loadPendingCustomerPayment(customerId);
    if (!pending) {
      const data = new FormData(form);
      const amount = S.fn.moneyInputRaw(data.get('amountVnd') || '').trim();
      if (!/^[1-9]\d*$/.test(amount) || !Number.isSafeInteger(Number(amount))) return S.fn.toast('Số tiền không hợp lệ', 'Nhập số tiền bằng VND nguyên dương.', 'error');
      const allocations = form.querySelector('[data-debt-mode]')?.value === 'selected'
        ? Array.from(form.querySelectorAll('[data-debt-allocation]')).filter(input => /^\d+$/.test(S.fn.moneyInputRaw(input.value)) && BigInt(S.fn.moneyInputRaw(input.value)) > 0n)
          .map(input => ({ orderId: input.dataset.debtAllocation, amountVnd: S.fn.moneyInputRaw(input.value) })) : undefined;
      pending = { storeId: S.state.store.id, customerId, key: S.fn.newIdempotencyKey(), payload: { amountVnd: amount, method: String(data.get('method') || 'cash'), note: String(data.get('note') || '').trim(), ...(allocations ? { allocations } : {}) } };
    }
    if (!S.fn.savePendingCustomerPayment(pending)) return S.fn.pendingSaveFailed();
    const submitButton = form.closest('[data-inline-debt-payment]')?.querySelector('button[type="submit"]') || S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customers/${encodeURIComponent(customerId)}/payments`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      if (S.state.authSession !== session) return;
      S.fn.clearPendingCustomerPayment(customerId);
      const canFinishHere = !S.dom.modal.hidden && S.state.modalGeneration === generation && S.state.page === originalPage;
      if (S.state.page === 'finance') {
        if (form.closest('[data-inline-debt-payment]')) form.closest('[data-inline-debt-payment]').remove();
        else if (canFinishHere) S.fn.closeModal();
      }
      const refreshList = S.state.page === 'customers'
        ? S.fn.loadCustomersPage(S.state.searchTerms.customers, S.state.customerOffset)
        : Promise.resolve();
      S.fn.emitSyncDomains(['customers', 'debts', 'cashbook', 'orders', 'dashboard'], { source: 'customer-payment' });
      await Promise.all([refreshList, S.fn.loadFinancePage()]);
      if (S.state.page === 'finance' && S.state.financeTab === 'receivables') {
        S.state.receivableDetail = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customers/${encodeURIComponent(customerId)}/debts`);
        S.fn.render();
      }
      S.fn.toast('Đã ghi nhận khoản thu', `${S.fn.moneyVndText(result.payment.amountVnd)} · còn nợ ${S.fn.moneyVndText(result.payment.customerBalanceVnd)}`);
      if (canFinishHere && S.state.page === 'customers' && S.state.modalGeneration === generation && !S.dom.modal.hidden) await S.fn.openCustomerDetail(customerId);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra khoản thu.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingCustomerPayment(customerId);
        if (!S.dom.modal.hidden || form.closest('[data-inline-debt-payment]')) S.fn.openCollectCustomerPayment(customerId);
      }
      S.fn.toast('Chưa lưu được khoản thu', error.message, 'error');
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }


  S.fn.saveSupplierPayment = async function saveSupplierPayment(form) {
    const supplierId = form.dataset.id;
    let pending = S.fn.loadPendingSupplierPayment(supplierId);
    if (!pending) {
      const data = new FormData(form);
      const amountVnd = Number(data.get('amount'));
      if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0) return S.fn.toast('Số tiền không hợp lệ', 'Nhập số tiền thanh toán bằng VND nguyên dương.', 'error');
      pending = {
        storeId: S.state.store.id,
        supplierId: supplierId,
        key: S.fn.newIdempotencyKey(),
        payload: { amountVnd: amountVnd, method: String(data.get('method') || 'cash'), note: String(data.get('note') || '').trim() },
      };
    }
    if (!S.fn.savePendingSupplierPayment(pending)) return S.fn.pendingSaveFailed();
    form.querySelectorAll('input,select').forEach(function (field) { field.disabled = true; });
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/suppliers/${encodeURIComponent(supplierId)}/payments`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      S.fn.clearPendingSupplierPayment(supplierId);
      S.fn.closeModal();
      S.fn.emitSyncDomains(['suppliers', 'cashbook', 'dashboard'], { source: 'supplier-payment' });
      await S.fn.loadFinancePage();
      S.fn.render();
      S.fn.toast('Đã ghi nhận thanh toán nhà cung cấp', S.fn.money(Number(result.payment.amountVnd)));
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra khoản thanh toán.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingSupplierPayment(supplierId);
        form.querySelectorAll('input,select').forEach(function (field) { field.disabled = false; });
      }
      S.fn.toast('Chưa lưu được khoản thanh toán', error.message, 'error');
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }


  S.fn.saveCash = async function saveCash(form) {
    let pending = S.fn.loadPendingCash();
    if (!pending) {
      const data = new FormData(form);
      const amountVnd = Number(S.fn.moneyInputRaw(data.get('amount')));
      if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0) return S.fn.toast('Số tiền không hợp lệ', 'Nhập số tiền bằng VND nguyên dương.', 'error');
      const partyKind = String(data.get('partyKind') || '');
      let counterparty = form.cashCounterparty || null;
      if (partyKind === 'other') {
        const otherName = String(data.get('partyOtherName') || '').trim();
        if (!otherName) {
          const otherField = form.elements.partyOtherName;
          if (otherField) { otherField.setCustomValidity('Nhập tên đối tượng thu chi.'); otherField.reportValidity(); }
          return;
        }
        counterparty = { kind: 'other', name: otherName };
      } else if (partyKind && !counterparty) {
        const search = form.elements.partySearch;
        search.setCustomValidity('Chọn một người trong danh sách hoặc chọn Không chọn.');
        search.reportValidity();
        return;
      }
      const catOption = form.elements.category?.selectedOptions?.[0];
      const categoryId = catOption?.dataset?.categoryId || '';
      const includeInPnl = Boolean(form.elements.includeInPnl?.checked);
      pending = {
        storeId: S.state.store.id,
        key: S.fn.newIdempotencyKey(),
        payload: { _slinkOfflineVersion: 1,
          direction: data.get('type') === 'in' ? 'in' : 'out',
          amountVnd: amountVnd,
          category: String(data.get('category') || 'Chi phí khác'),
          ...(categoryId ? { categoryId } : {}),
          includeInPnl,
          method: String(data.get('method') || 'cash'),
          note: String(data.get('note') || '').trim(),
          ...(counterparty ? { counterparty } : {}),
        },
      };
    }
    if (!S.fn.savePendingCash(pending)) return S.fn.pendingSaveFailed();
    form.querySelectorAll('input,select,textarea,button').forEach(function (field) { field.disabled = true; });
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/cash-movements`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      S.fn.clearPendingCash();
      S.fn.closeModal();
      if (!result.offlineQueued) S.fn.emitSyncDomains(['cashbook', 'dashboard', 'reports'], { source: 'cash-movement' });
      await S.fn.loadFinancePage();
      S.fn.toast(result.offlineQueued ? 'Đã lưu thu chi trên máy' : (pending.payload.direction === 'in' ? 'Đã ghi phiếu thu' : 'Đã ghi phiếu chi'), S.fn.money(Number(result.movement.amountVnd)));
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra phiếu thu chi.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingCash();
        form.querySelectorAll('input,select,textarea,button').forEach(function (field) { field.disabled = false; });
      }
      S.fn.toast('Chưa lưu được phiếu thu chi', error.message, 'error');
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }


  S.fn.saveCashTransfer = async function saveCashTransfer(form) {
    const data = new FormData(form);
    const fromFund = String(data.get('fromFund') || '');
    const toFund = String(data.get('toFund') || '');
    const amountVnd = Number(S.fn.moneyInputRaw(data.get('amount')));
    if (!['cash', 'bank'].includes(fromFund) || !['cash', 'bank'].includes(toFund) || fromFund === toFund) {
      return S.fn.toast('Quỹ không hợp lệ', 'Chọn 2 quỹ khác nhau (Tiền mặt và Ngân hàng).', 'error');
    }
    if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0) return S.fn.toast('Số tiền không hợp lệ', 'Nhập số tiền VND nguyên dương.', 'error');
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    const idempotencyKey = form.dataset.idempotencyKey || (form.dataset.idempotencyKey = S.fn.newIdempotencyKey());
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/cash-transfers`, {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: { fromFund, toFund, amountVnd, bankMethod: String(data.get('bankMethod') || 'bank_transfer'), note: String(data.get('note') || '').trim() },
      });
      S.fn.closeModal();
      await S.fn.loadFinancePage();
      S.fn.toast('Đã chuyển quỹ nội bộ', `${result.transfer.voucherNumber} · ${S.fn.money(Number(result.transfer.amountVnd))}`);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else {
        if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
          delete form.dataset.idempotencyKey;
        }
        S.fn.toast('Chưa chuyển được quỹ', error.message, 'error');
      }
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }


  S.fn.saveVoidCashMovement = async function saveVoidCashMovement(form) {
    const id = form.dataset.id;
    const reason = String(new FormData(form).get('reason') || '').trim();
    if (reason.length < 3) return S.fn.toast('Thiếu lý do hủy', 'Nhập lý do hủy ít nhất 3 ký tự.', 'error');
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    const idempotencyKey = form.dataset.idempotencyKey || (form.dataset.idempotencyKey = S.fn.newIdempotencyKey());
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/cash-movements/${encodeURIComponent(id)}/void`, {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: { reason },
      });
      S.fn.closeModal();
      await S.fn.loadFinancePage();
      const firstCode = result.reversals?.[0]?.voucherNumber || '';
      S.fn.toast('Đã lập phiếu đảo', firstCode ? `Chứng từ ${firstCode}` : 'Đã hủy phiếu và cập nhật số dư.');
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else {
        if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
          delete form.dataset.idempotencyKey;
        }
        S.fn.toast('Chưa hủy được phiếu', error.message, 'error');
      }
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }


  S.fn.saveCashCategory = async function saveCashCategory(form) {
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    const direction = String(data.get('direction') || 'out');
    const defaultIncludeInPnl = Boolean(form.elements.defaultIncludeInPnl?.checked);
    if (!name) return S.fn.toast('Thiếu tên khoản mục', 'Nhập tên khoản mục thu chi.', 'error');
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/finance/categories`, {
        method: 'POST',
        body: { name, direction, defaultIncludeInPnl },
      });
      await S.fn.loadFinanceCategories();
      S.fn.emitSyncDomains(['cashbook'], { source: 'cash-category-create' });
      await S.fn.openCashCategoriesModal();
      S.fn.toast('Đã thêm khoản mục', name);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa thêm được khoản mục', error.message, 'error');
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }


  S.fn.toggleCashCategoryStatus = async function toggleCashCategoryStatus(id, nextStatus) {
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/finance/categories/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      await S.fn.loadFinanceCategories();
      S.fn.emitSyncDomains(['cashbook'], { source: 'cash-category-create' });
      await S.fn.openCashCategoriesModal();
      S.fn.toast(nextStatus === 'active' ? 'Đã hiện lại khoản mục' : 'Đã ẩn khoản mục');
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa cập nhật được khoản mục', error.message, 'error');
    }
  }

})(window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {}, charts: {} });
