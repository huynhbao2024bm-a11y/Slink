(function (root, factory) {
  'use strict';
  const value = factory(typeof module === 'object' && module.exports ? require('./purchase-units') : root.SlinkPurchaseUnits);
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.SlinkOfflineLedger = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (purchaseUnits) {
  'use strict';
  function problem(code, message) { const error = new Error(message); error.code = code; error.status = 409; return error; }
  function amount(value) {
    if (!/^(0|[1-9]\d*)$/.test(String(value))) throw problem('offline_invalid_amount', 'Số tiền phải là VND nguyên không âm.');
    const result = BigInt(value);
    if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw problem('offline_invalid_amount', 'Số tiền vượt giới hạn trên thiết bị.');
    return result;
  }
  function quantity(value) {
    const number = Number(value), milli = Math.round(number * 1000);
    if (!Number.isFinite(number) || number < 0 || number > 1000000000 || Math.abs(number - milli / 1000) > 1e-9) {
      throw problem('offline_invalid_quantity', 'Số lượng cần không âm và tối đa 3 chữ số thập phân.');
    }
    return milli;
  }
  function productKey(warehouseId, productId) { return warehouseId + '|' + productId; }
  function lineTotal(price, milli) { return (amount(price) * BigInt(milli) + 500n) / 1000n; }
  function purchaseLineAmounts(item, milli) {
    if (!milli) throw problem('offline_invalid_quantity', 'Số lượng nhập phải lớn hơn 0.');
    if (item.lineTotalVnd !== undefined) {
      if (item.pack || item.unitCostVnd !== undefined) throw problem('offline_invalid_amount', 'Chỉ nhập tổng tiền hoặc đơn giá cho một dòng hàng.');
      const total = amount(item.lineTotalVnd);
      const unitCost = purchaseUnits.unitCostFromTotal(total, milli);
      amount(unitCost);
      return { unitCost, total };
    }
    if (item.pack) {
      const packed = purchaseUnits.fromPack(item.pack);
      if (packed.quantityMilli !== BigInt(milli) || String(packed.unitCostVnd) !== String(item.unitCostVnd)) throw problem('purchase_pack_invalid', 'Số lượng quy đổi của phiếu nhập chưa khớp.');
      return { unitCost: packed.unitCostVnd, total: packed.lineTotalVnd, pack: packed.pack };
    }
    return { unitCost: amount(item.unitCostVnd), total: lineTotal(item.unitCostVnd, milli) };
  }

  function derive(responses, operations) {
    const state = { products: new Map(), customers: new Map(), session: null, lastClosed: null, localOrders: [], moneyEntries: [], customerDebtChanges: new Map(), supplierDebtChanges: new Map(), issues: [], cashChanges: [], movements: [] };
    const ordered = responses.slice().sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt));
    const warehouseMap = new Map(), metadata = new Map();
    ordered.forEach(row => (row.value.warehouses || []).forEach(warehouse => warehouseMap.set(warehouse.id, warehouse)));
    const knownWarehouses = Array.from(warehouseMap.values()).filter(row => row.status !== 'archived');
    const defaultWarehouse = knownWarehouses.find(row => row.is_default)?.id || '';
    for (const response of ordered) {
      const url = new URL(response.url, 'https://offline.invalid');
      for (const row of (response.value.customers || []).concat(response.value.customerDebtors || [])) state.customers.set(row.id, { ...state.customers.get(row.id), ...row });
      if (/\/(products|inventory)$/.test(url.pathname)) {
        for (const item of response.value.products || []) {
          const { on_hand, reserved, inventory_version, warehouseId, milli, ...fields } = item;
          const old = metadata.get(item.id);
          if (!old || Number(item.version || 0) >= Number(old.version || 0)) metadata.set(item.id, { ...old, ...fields });
        }
        if (!url.searchParams.has('warehouseId') && knownWarehouses.length > 1) continue;
        const warehouseId = url.searchParams.get('warehouseId') || defaultWarehouse;
        for (const item of response.value.products || []) {
          const key = productKey(warehouseId, item.id), old = state.products.get(key);
          if (!old || Number(item.inventory_version || 0) >= Number(old.inventory_version || 0)) {
            state.products.set(key, { ...old, ...item, warehouseId, milli: quantity(item.on_hand || 0) });
          }
        }
      }
      if (url.pathname.endsWith('/cash-register')) { state.session = response.value.session ? { ...response.value.session } : null; state.lastClosed = response.value.lastClosed || null; }
    }
    for (const [key, product] of state.products) state.products.set(key, { ...product, ...metadata.get(product.id) });
    for (const operation of operations.filter(row => row.state !== 'acknowledged').sort((a, b) => a.sequence - b.sequence)) apply(state, operation, false);
    return state;
  }

  function findProduct(state, warehouseId, id, operation, strict) {
    let product = state.products.get(productKey(warehouseId, id));
    const saved = operation?.productSnapshots?.find(row => row.id === id && row.warehouseId === warehouseId);
    if (!product && saved && !strict) {
      product = { ...saved, milli: quantity(saved.on_hand || 0) };
      state.products.set(productKey(warehouseId, id), product);
      state.issues.push({ key: operation.key, code: 'offline_product_missing' });
    }
    if (strict && product?.status === 'archived') throw problem('offline_product_missing', 'Mặt hàng đã ngừng bán. Kiểm tra lại danh mục.');
    if (!product) throw problem('offline_product_missing', 'Mặt hàng này chưa được tải về cho kho đang chọn. Kết nối mạng để chuẩn bị dữ liệu.');
    return product;
  }

  function cash(state, operation, delta, strict) {
    if (delta === 0n) return;
    if (!state.session) {
      if (strict) throw problem('cash_session_required', 'Mở ca tiền mặt trước khi ghi khoản tiền này.');
      state.issues.push({ key: operation.key, code: 'cash_session_required' }); return;
    }
    const before = BigInt(state.session.expectedCashVnd);
    if (before + delta < 0n) {
      if (strict) throw problem('offline_insufficient_cash', 'Tiền trong quầy trên thiết bị không đủ để ghi khoản chi.');
      state.issues.push({ key: operation.key, code: 'offline_insufficient_cash' });
    }
    state.session.expectedCashVnd = String(before + delta);
    state.cashChanges.push({ key: operation.key, deltaVnd: String(delta), queuedAt: operation.queuedAt, kind: operation.kind });
  }

  function move(state, operation, product, delta, strict) {
    if (!product.inventory_tracked) return;
    if (product.milli + delta < 0) {
      if (strict) throw problem('offline_insufficient_stock', 'Số lượng trên thiết bị không đủ. Kiểm tra lại mặt hàng trước khi lưu.');
      state.issues.push({ key: operation.key, code: 'offline_insufficient_stock' });
    }
    product.milli += delta; product.on_hand = String(product.milli / 1000);
    product.inventory_version = Number(product.inventory_version || 1) + 1;
    state.movements.push({ key: operation.key, productId: product.id, warehouseId: product.warehouseId, quantity: delta / 1000, kind: operation.kind, queuedAt: operation.queuedAt });
  }

  function moneyEntry(state, operation, direction, amountVnd, method, category, sourceType) {
    if (amountVnd === 0n) return;
    const localId = 'local:' + operation.key;
    state.moneyEntries.push({ source_id: localId, source_type: sourceType, direction, amount_vnd: String(amountVnd), method, category, note: operation.payload.note || '', actor_name: operation.actorName || 'Bạn', occurred_at: operation.payload.offline?.occurredAt || operation.queuedAt, cash_session_id: method === 'cash' ? state.session?.id || null : null, cash_session_opened_at: method === 'cash' ? state.session?.openedAt : null, offline_pending: true,
      ...(operation.kind === 'cash' && operation.payload.counterparty ? { counterparty: operation.payload.counterparty } : {}),
      ...(operation.kind === 'sale' ? { order_id: localId, order_number: 'TẠM-' + String(operation.sequence).padStart(4, '0') } : {}),
    });
    if (method === 'cash' && state.session && operation.kind !== 'shift-close') {
      const field = direction === 'in' ? 'cashInVnd' : 'cashOutVnd';
      state.session[field] = String(BigInt(state.session[field] || 0) + amountVnd);
    }
  }

  function apply(state, operation, validate) {
    const body = operation.payload;
    if (operation.kind === 'shift-open') {
      if (state.session) {
        if (validate) throw problem('offline_shift_open', 'Thiết bị đang có ca tiền mặt chưa chốt.');
        state.issues.push({ key: operation.key, code: 'offline_shift_open' });
      }
      state.session = { id: 'local:' + operation.key, status: 'open', openingFloatVnd: String(amount(body.openingFloatVnd)), expectedCashVnd: String(amount(body.openingFloatVnd)), cashInVnd: '0', cashOutVnd: '0', openedAt: operation.queuedAt, openedBy: operation.userId, openedByName: operation.actorName || 'Bạn', offline: true };
      return state;
    }
    if (operation.kind === 'shift-close') {
      if (!state.session) {
        if (validate) throw problem('cash_session_required', 'Không có ca tiền mặt để chốt.');
        state.issues.push({ key: operation.key, code: 'cash_session_required' }); return state;
      }
      const counted = amount(body.countedCashVnd);
      const expected = BigInt(state.session.expectedCashVnd);
      if (validate && body.offline?.expectedCashVnd != null && BigInt(body.offline.expectedCashVnd) !== expected) {
        throw problem('offline_cash_balance_changed', 'Số dự kiến đã thay đổi. Mở lại ca để kiểm tra trước khi chốt.');
      }
      const variance = counted - expected;
      if (validate && variance !== 0n && String(body.note || '').trim().length < 2) throw problem('offline_cash_variance_reason', 'Nhập lý do khi tiền đếm khác số dự kiến.');
      state.lastClosed = { ...state.session, status: 'closed', countedCashVnd: String(counted), varianceVnd: String(variance), closedAt: operation.payload.offline?.occurredAt || operation.queuedAt, closeNote: body.note || '', offline: true };
      if (variance !== 0n) moneyEntry(state, operation, variance > 0n ? 'in' : 'out', variance > 0n ? variance : -variance, 'cash', 'Chênh lệch chốt ca', 'cash_session_reconciliation');
      state.session = null; return state;
    }
    if (operation.kind === 'sale') {
      if (!body.items?.length || body.items.length > 100) throw problem('offline_empty_sale', 'Đơn cần từ 1 đến 100 mặt hàng.');
      if (body.promotionCode) throw problem('offline_promotion_requires_network', 'Mã ưu đãi cần mạng để kiểm tra. Có thể dùng giảm giá bằng số tiền khi không có mạng.');
      let subtotal = 0n;
      const lines = [];
      for (const item of body.items) {
        const product = findProduct(state, body.warehouseId, item.productId, operation, validate), milli = quantity(item.quantity);
        if (!milli) throw problem('offline_invalid_quantity', 'Số lượng bán phải lớn hơn 0.');
        if (validate && amount(item.expectedUnitPriceVnd) !== amount(product.sale_price_vnd)) throw problem('offline_price_changed', 'Giá trên thiết bị đã đổi. Kiểm tra lại đơn trước khi lưu.');
        if (product.inventory_tracked && milli > product.milli - quantity(product.reserved || 0)) {
          if (validate) throw problem('offline_insufficient_stock', 'Số hàng còn bán được trên thiết bị không đủ, có hàng đang được giữ cho đơn khác.');
          state.issues.push({ key: operation.key, code: 'offline_insufficient_stock' });
        }
        const price = item.expectedUnitPriceVnd ?? product.sale_price_vnd;
        subtotal += lineTotal(price, milli); lines.push({ productId: product.id, name: product.name, quantity: milli / 1000, unitPriceVnd: String(price) });
        move(state, operation, product, -milli, validate);
      }
      const discount = amount(body.discountVnd || 0);
      if (discount > subtotal) throw problem('offline_invalid_discount', 'Giảm giá không được lớn hơn tiền hàng.');
      const total = subtotal - discount;
      if (amount(body.totalVnd) !== total) throw problem('offline_total_changed', 'Tổng tiền không khớp với mặt hàng. Kiểm tra lại trước khi lưu.');
      let received = 0n, cashReceived = 0n; const used = new Set();
      for (const tender of body.tenders || []) {
        const value = amount(tender.amountReceivedVnd);
        if (!['cash', 'bank_transfer', 'bank_qr', 'card', 'other'].includes(tender.method) || used.has(tender.method)) throw problem('offline_invalid_tender', 'Kiểm tra lại các cách trả tiền.');
        used.add(tender.method); received += value; if (tender.method === 'cash') cashReceived += value;
      }
      if (received < total && !body.customerId) throw problem('offline_customer_required', 'Chọn khách hàng để ghi khoản còn nợ.');
      const change = received > total ? received - total : 0n;
      if (received - cashReceived > total || change > cashReceived) throw problem('offline_invalid_change', 'Chỉ tiền mặt được nhận dư để trả lại khách.');
      cash(state, operation, cashReceived - change, validate);
      for (const tender of body.tenders || []) moneyEntry(state, operation, 'in', amount(tender.amountReceivedVnd), tender.method, 'Bán hàng', 'order_payment');
      moneyEntry(state, operation, 'out', change, 'cash', 'Tiền thối', 'order_change');
      if (body.customerId && received < total) state.customerDebtChanges.set(body.customerId, (state.customerDebtChanges.get(body.customerId) || 0n) + total - received);
      state.localOrders.push({ key: operation.key, sequence: operation.sequence, items: lines, customerId: body.customerId || null, subtotalVnd: String(subtotal), discountVnd: String(discount), totalVnd: String(total), receivedVnd: String(received), changeVnd: String(change), queuedAt: operation.queuedAt });
      return state;
    }
    if (operation.kind === 'purchase') {
      let total = 0n;
      if (!body.items?.length || body.items.length > 50) throw problem('offline_empty_purchase', 'Phiếu nhập cần từ 1 đến 50 mặt hàng.');
      for (const item of body.items) {
        const product = findProduct(state, body.warehouseId, item.productId, operation, validate), milli = quantity(item.quantity);
        if (validate && item.expectedProductVersion !== undefined && Number(item.expectedProductVersion) !== Number(product.version || 1)) throw problem('offline_product_changed', 'Mặt hàng trên thiết bị đã đổi. Kiểm tra phiếu nhập trước khi lưu.');
        const amounts = purchaseLineAmounts(item, milli);
        total += amounts.total; move(state, operation, product, milli, validate);
        const version = Number(product.version || 1) + 1;
        for (const peer of state.products.values()) if (peer.id === product.id) { peer.cost_vnd = String(amounts.unitCost); peer.version = version; if (purchaseUnits.isPackName(amounts.pack?.name)) peer.purchase_pack = amounts.pack; }
      }
      const paid = amount(body.amountPaidVnd || 0);
      if (paid > total) throw problem('offline_overpaid_purchase', 'Tiền trả không được lớn hơn phiếu nhập.');
      if (paid < total && !String(body.supplierName || '').trim()) throw problem('supplier_required', 'Nhập tên nhà cung cấp để theo dõi khoản còn phải trả.');
      if (body.method === 'cash') cash(state, operation, -paid, validate);
      moneyEntry(state, operation, 'out', paid, body.method || 'cash', 'Nhập hàng', 'purchase_payment');
      if (paid < total) {
        const name = body.supplierName.trim();
        const supplierKey = body.supplierId || name.toLocaleLowerCase('vi-VN');
        state.supplierDebtChanges.set(supplierKey, { id: body.supplierId, name, amount: (state.supplierDebtChanges.get(supplierKey)?.amount || 0n) + total - paid, key: operation.key });
      }
      return state;
    }
    if (operation.kind === 'stock-count') {
      const product = findProduct(state, body.warehouseId, body.productId, operation, validate);
      if (validate && Number(body.expectedInventoryVersion) !== Number(product.inventory_version)) throw problem('inventory_version_conflict', 'Tồn trên thiết bị đã thay đổi. Đếm lại hoặc kiểm tra trước khi ghi.');
      if (quantity(body.count) < quantity(product.reserved || 0)) {
        if (validate) throw problem('offline_reserved_stock', 'Số đếm không thể thấp hơn hàng đang giữ cho đơn khác.');
        state.issues.push({ key: operation.key, code: 'offline_reserved_stock' });
      }
      move(state, operation, product, quantity(body.count) - product.milli, validate); return state;
    }
    if (operation.kind === 'cash') {
      const value = amount(body.amountVnd);
      if (value === 0n || !['in', 'out'].includes(body.direction)) throw problem('offline_invalid_cash', 'Khoản thu/chi cần số tiền dương và đúng loại giao dịch.');
      if (body.method === 'cash') cash(state, operation, body.direction === 'in' ? value : -value, validate);
      moneyEntry(state, operation, body.direction, value, body.method || 'cash', body.category || 'Vận hành', 'manual_cash_movement');
      return state;
    }
    throw problem('offline_operation_not_supported', 'Việc này cần kết nối máy chủ.');
  }

  function validateEnqueue(responses, existing, candidate, session) {
    if (session?.user?.id !== candidate.userId) throw problem('offline_forbidden', 'Cần đăng nhập đúng tài khoản đã chuẩn bị dữ liệu.');
    const membership = session?.stores?.find(row => row.id === candidate.storeId);
    const allowed = {
      sale: ['owner', 'manager', 'cashier'], purchase: ['owner', 'manager', 'stockkeeper', 'accountant'],
      'stock-count': ['owner', 'manager', 'stockkeeper'], cash: ['owner', 'manager', 'accountant'],
      'shift-open': ['owner', 'manager', 'cashier'], 'shift-close': ['owner', 'manager', 'cashier'],
    };
    if (!membership || !allowed[candidate.kind]?.includes(membership.role)) throw problem('offline_forbidden', 'Tài khoản này không có quyền ghi việc đó.');
    if (existing.some(row => row.state === 'conflict')) throw problem('offline_review_required', 'Có chứng từ cần kiểm tra. Mở phần đồng bộ và xử lý trước khi ghi thêm.');
    const state = derive(responses, existing);
    if (state.issues.length) throw problem('offline_review_required', 'Có chứng từ chờ cần kiểm tra sau khi dữ liệu thay đổi. Mở phần đồng bộ để xử lý trước.');
    if (candidate.kind === 'shift-close' && state.session && membership.role === 'cashier' && state.session.openedBy !== candidate.userId) throw problem('offline_forbidden', 'Chỉ người mở ca hoặc quản lý mới có thể chốt ca này.');
    apply(state, candidate, true);
    return state;
  }

  function projectResponse(url, value, responses, operations, userId) {
    const queued = operations.filter(row => row.state !== 'acknowledged');
    if (!queued.length && !value.offlineStockCandidates) return value;
    const result = JSON.parse(JSON.stringify(value)), state = derive(responses, queued);
    const query = new URL(url, 'https://offline.invalid'), warehouseId = query.searchParams.get('warehouseId');
    if (/\/(products|inventory)$/.test(query.pathname)) {
      const byProduct = new Map();
      for (const item of state.products.values()) {
        if (warehouseId && item.warehouseId !== warehouseId) continue;
        if (!byProduct.has(item.id)) byProduct.set(item.id, []);
        byProduct.get(item.id).push(item);
      }
      result.products = (result.products || []).map(row => {
        const candidates = byProduct.get(row.id);
        if (!candidates) return row;
        return { ...row, on_hand: String(candidates.reduce((sum, item) => sum + item.milli, 0) / 1000), inventory_version: Math.max(...candidates.map(item => Number(item.inventory_version || 1))), cost_vnd: candidates[0].cost_vnd, purchase_pack: candidates[0].purchase_pack || null, version: Math.max(...candidates.map(item => Number(item.version || row.version || 1))) };
      });
      if (query.pathname.endsWith('/inventory')) {
        const products = Array.from(state.products.values()).filter(row => row.inventory_tracked && (!warehouseId || row.warehouseId === warehouseId));
        if (queued.length) result.summary = { total: products.length, low: products.filter(row => row.milli > 0 && row.milli <= quantity(row.low_stock_threshold || 0)).length, out: products.filter(row => row.milli === 0).length, stockValueVnd: products.some(row => row.cost_vnd == null) ? null : String(products.reduce((sum, row) => sum + lineTotal(row.cost_vnd, Math.max(0, row.milli)), 0n)) };
        if (result.offlineStockCandidates) {
          const stock = query.searchParams.get('stock');
          const filtered = result.products.filter(row => stock === 'out'
            ? Number(row.on_hand) === 0
            : Number(row.on_hand) > 0 && Number(row.on_hand) <= Number(row.low_stock_threshold));
          const offset = Math.max(0, Number(query.searchParams.get('offset')) || 0);
          const limit = Math.max(1, Math.min(100, Number(query.searchParams.get('limit')) || 100));
          result.products = filtered.slice(offset, offset + limit);
          result.total = filtered.length;
          result.nextOffset = offset + limit < filtered.length ? offset + limit : null;
          delete result.offlineStockCandidates;
        }
        result.movements = state.movements.filter(row => !warehouseId || row.warehouseId === warehouseId).map(row => ({ productId: row.productId, type: row.kind === 'purchase' ? 'purchase_receipt' : row.kind === 'sale' ? 'sale' : 'adjustment', delta: String(row.quantity), reason: 'Chờ đồng bộ', createdAt: row.queuedAt })).concat(result.movements || []);
      }
    }
    if (query.pathname.endsWith('/cash-register')) {
      result.session = state.session;
      result.lastClosed = state.lastClosed;
      result.canOpen = Boolean(result.canOperate && !state.session);
      result.canClose = Boolean(result.canOperate && state.session && (state.session.openedBy === userId || result.canClose || state.session.offline));
      if (state.lastClosed?.offline) result.recentClosed = [state.lastClosed].concat((result.recentClosed || []).filter(row => row.id !== state.lastClosed.id));
    }
    if (query.pathname.endsWith('/finance')) {
      result.movements = state.moneyEntries.concat(result.movements || []);
      result.movementTotal = Number(result.movementTotal || 0) + state.moneyEntries.length;
      let customerDebt = 0n, supplierDebt = 0n;
      for (const [id, delta] of state.customerDebtChanges) {
        const customer = (result.customerDebtors || []).find(row => row.id === id);
        const known = state.customers.get(id);
        if (customer) { customer.balance_vnd = String(BigInt(customer.balance_vnd || 0) + delta); customerDebt += delta; }
        else if (known?.balance_vnd !== undefined) {
          const before = BigInt(known.balance_vnd), after = before + delta;
          customerDebt += (after > 0n ? after : 0n) - (before > 0n ? before : 0n);
          if (after > 0n) (result.customerDebtors ||= []).push({ ...known, balance_vnd: String(after), offline_pending: true });
        } else result.offlineCustomerDebtUnverified = true;
      }
      for (const change of state.supplierDebtChanges.values()) {
        const supplier = (result.suppliers || []).find(row => change.id ? row.id === change.id : row.name.toLocaleLowerCase('vi-VN') === change.name.toLocaleLowerCase('vi-VN'));
        const before = BigInt(supplier?.balance_vnd || 0);
        const after = before + change.amount;
        if (supplier) supplier.balance_vnd = String(after);
        else (result.suppliers ||= []).push({ id: change.id || 'local:' + change.key, name: change.name, balance_vnd: String(after), offline_pending: true });
        supplierDebt += (after > 0n ? after : 0n) - (before > 0n ? before : 0n);
      }
      if (result.summary) {
        result.summary.customerDebtVnd = String(BigInt(result.summary.customerDebtVnd || 0) + customerDebt);
        result.summary.supplierPayableVnd = String(BigInt(result.summary.supplierPayableVnd || 0) + supplierDebt);
        // Keep each cached daily total in its own business day, including a queue spanning midnight.
        const zone = responses.find(row => row.url.endsWith('/settings'))?.value?.settings?.timezone || 'Asia/Ho_Chi_Minh';
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
        const baseTime = value.offlineCachedAt || responses.find(row => row.url.endsWith('/finance'))?.fetchedAt;
        for (const entry of state.moneyEntries) {
          if (baseTime && day.format(new Date(entry.occurred_at)) !== day.format(new Date(baseTime))) continue;
          const field = entry.direction === 'in' ? 'todayInVnd' : 'todayOutVnd';
          result.summary[field] = String(BigInt(result.summary[field] || 0) + BigInt(entry.amount_vnd));
        }
      }
    }
    if (query.pathname.endsWith('/customers')) result.customers = (result.customers || []).map(row => ({ ...row, balance_vnd: String(BigInt(row.balance_vnd || 0) + (state.customerDebtChanges.get(row.id) || 0n)) }));
    if (query.pathname.endsWith('/orders') && (!query.searchParams.get('status') || query.searchParams.get('status') === 'all')) {
      const text = (query.searchParams.get('q') || '').toLocaleLowerCase('vi-VN');
      const pending = state.localOrders.map(row => ({ id: 'local:' + row.key, order_number: 'TẠM-' + String(row.sequence).padStart(4, '0'), customer_id: row.customerId, customer_name: state.customers.get(row.customerId)?.name || null, status: 'pending_sync', total_vnd: row.totalVnd, subtotal_vnd: row.subtotalVnd, discount_vnd: row.discountVnd, paid_vnd: String(BigInt(row.receivedVnd) - BigInt(row.changeVnd)), refunded_vnd: '0', return_total_vnd: '0', line_count: row.items.length, occurred_at: row.queuedAt, offline_pending: true }));
      result.orders = pending.filter(row => !text || row.order_number.toLocaleLowerCase('vi-VN').includes(text)).concat(result.orders || []);
      result.total = Number(result.total || 0) + result.orders.filter(row => row.offline_pending).length;
    }
    result.offlinePendingCount = queued.length;
    result.offlineIssues = state.issues;
    return result;
  }
  return { amount, quantity, lineTotal, productKey, derive, validateEnqueue, projectResponse, problem };
});
