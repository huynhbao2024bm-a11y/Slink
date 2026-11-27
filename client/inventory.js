(function (S) {
  'use strict';

  S.fn.loadInventoryPage = async function loadInventoryPage(query, offset, options = {}) {
    if (!S.state.authSession || !S.state.store.id) return;
    const requestNumber = ++S.state.inventoryRequestNumber;
    const requestSession = S.state.authSession;
    const requestStoreId = S.state.store.id;
    const requestWarehouseId = S.state.selectedWarehouseId;
    const requestedForInventory = S.state.page === 'inventory';
    const stockFilter = requestedForInventory ? S.state.inventoryStockFilter : 'all';
    const isCurrent = () => requestNumber === S.state.inventoryRequestNumber && S.state.authSession === requestSession && S.state.store.id === requestStoreId && S.state.selectedWarehouseId === requestWarehouseId &&
      (!requestedForInventory || S.state.inventoryStockFilter === stockFilter) &&
      (!options.keepSearch || (S.state.page === 'inventory' && S.state.searchTerms.inventory === query));
    const draw = () => {
      if (S.state.page === 'inventory') {
        if (options.keepSearch || document.activeElement?.id === 'inventory-search') S.fn.refreshSearchList('inventory');
        else S.fn.render();
      }
    };
    S.state.inventoryLoading = true;
    S.state.inventoryError = '';
    if (!options.silentLoading && !S.state.inventoryProducts.length) draw();
    try {
      const warehouseQuery = requestWarehouseId ? `&warehouseId=${encodeURIComponent(requestWarehouseId)}` : '';
      const stockQuery = stockFilter === 'all' ? '' : `&stock=${stockFilter}`;
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(requestStoreId)}/inventory?limit=100&offset=${Math.max(0, offset || 0)}&q=${encodeURIComponent(query || '')}${warehouseQuery}${stockQuery}`, { preferFresh: options.keepSearch === true || options.preferFresh === true });
      if (!isCurrent()) return;
      if (!result.summary || !Array.isArray(result.movements) || (requestWarehouseId && result.warehouse?.id !== requestWarehouseId)) {
        throw new Error('Chưa có đủ dữ liệu của kho này. Thử lại khi có mạng.');
      }
      S.state.inventoryWarehouseId = requestWarehouseId;
      S.state.inventoryLoadedFilter = stockFilter;
      S.state.inventoryLoadedQuery = query || '';
      S.state.inventoryProducts = result.products.map(S.fn.mapProduct);
      if (S.state.page === 'inventory' && stockFilter === 'all' && !query) S.state.store.products = S.state.inventoryProducts.slice();
      S.state.store.movements = result.movements.map(function (movement) { return { productId: movement.productId, type: movement.type, delta: Number(movement.delta), reason: movement.reason, createdAt: movement.createdAt }; });
      S.state.inventorySummary = result.summary;
      S.state.purchasePacksSupported = result.purchasePacksSupported === true;
      S.state.productPackDefaultsSupported = result.productPackDefaultsSupported === true;
      S.state.inventoryTotal = result.total;
      S.state.inventoryOffset = offset || 0;
      S.state.inventoryNextOffset = result.nextOffset;
      S.state.inventoryLoading = false;
      draw();
    } catch (error) {
      if (!isCurrent()) return;
      S.state.inventoryLoading = false;
      S.state.inventoryError = error.message;
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      S.fn.toast('Chưa tải được tồn kho', error.message, 'error');
      draw();
    }
  }


  S.fn.loadWarehouses = async function loadWarehouses(options) {
    if (!S.state.authSession || !S.state.store.id) return;
    const requestNumber = ++S.state.warehouseRequestNumber;
    const requestSession = S.state.authSession;
    const requestStoreId = S.state.store.id;
    const isCurrent = () => requestNumber === S.state.warehouseRequestNumber && S.state.authSession === requestSession && S.state.store.id === requestStoreId;
    const previousWarehouseId = S.state.selectedWarehouseId;
    S.state.warehouseLoading = true;
    S.state.warehouseError = '';
    try {
      const viewQuery = options && options.view === 'picker' ? '?view=picker' : '';
      const list = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(requestStoreId)}/warehouses${viewQuery}`);
      if (!isCurrent()) return;
      const warehouseRows = list.warehouses || [];
      warehouseRows.forEach(function (warehouse) {
        if (warehouse.status === 'archived' && S.fn.readPendingWarehouseMutation('warehouse-archive', warehouse.id)) {
          S.fn.removePendingRecord('warehouse-archive', warehouse.id, `slink-pending-warehouse-archive-v1:${S.state.store.id}:${warehouse.id}`);
        }
      });
      S.state.warehouses = warehouseRows.filter(function (warehouse) { return warehouse.status === 'active'; });
      if (!S.state.warehouses.some(function (warehouse) { return warehouse.id === S.state.selectedWarehouseId; })) {
        S.state.selectedWarehouseId = (S.state.warehouses.find(function (warehouse) { return warehouse.is_default; }) || S.state.warehouses[0] || {}).id || '';
      }
      if (S.fn.hasPerm('viewReports') || S.fn.hasPerm('manageInventory')) {
        if (!S.fn.hasPerm('manageInventory') || (options && options.includeTransfers === false)) S.state.warehouseTransfers = [];
        else {
          const transfers = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(requestStoreId)}/warehouse-transfers?limit=100`);
          if (!isCurrent()) return;
          S.state.warehouseTransfers = transfers.transfers || [];
        }
      } else {
        S.state.warehouseTransfers = [];
      }
    } catch (error) {
      if (!isCurrent()) return;
      S.state.warehouseError = error.message;
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    } finally {
      if (isCurrent()) {
        S.state.warehouseLoading = false;
        if (S.state.page === 'inventory' && (S.state.selectedWarehouseId !== previousWarehouseId || document.activeElement?.id !== 'inventory-search')) S.fn.render();
      }
    }
  }


  S.fn.mapFinancePurchase = function mapFinancePurchase(row) {
    return { id: row.id, number: row.purchase_number, purchaseOrderNumber: row.purchase_order_number || '', status: row.status, note: row.note || '', totalVnd: String(row.total_vnd || '0'), supplierId: row.supplier_id, supplierName: row.supplier_name || '', receivedAt: row.received_at, items: Array.isArray(row.lines) ? row.lines : [] };
  }


  S.fn.mapFinancePurchaseOrder = function mapFinancePurchaseOrder(row) {
    return { id: row.id, number: row.purchase_order_number, status: row.status, version: Number(row.version) || 1, note: row.note || '', totalVnd: String(row.total_vnd || '0'), supplierId: row.supplier_id, supplierName: row.supplier_name || '', warehouseId: row.warehouse_id || '', warehouseName: row.warehouse_name || '', createdAt: row.created_at, orderedAt: row.ordered_at, completedAt: row.completed_at, cancelledAt: row.cancelled_at, items: Array.isArray(row.lines) ? row.lines : [] };
  }


  S.fn.movementLabel = function movementLabel(movement) {
    return movement.type === 'purchase_receipt' ? 'Nhập hàng' : movement.type === 'sale' ? 'Bán hàng' : movement.type === 'return' ? 'Trả hàng' : movement.type === 'reversal' ? 'Hoàn kho do hủy đơn' : movement.type === 'transfer_in' ? 'Nhận điều chuyển' : movement.type === 'transfer_out' ? 'Xuất điều chuyển' : movement.type === 'count' ? 'Kiểm kê' : 'Điều chỉnh';
  }


  S.fn.inventoryRows = function inventoryRows(products) {
    return products.map(function (product) {
      const movement = S.state.store.movements.find(function (item) { return item.productId === product.id; });
      return `<tr><td><div class='product-cell'>${S.fn.productThumb(product)}<span class='product-name-stack'><strong>${S.fn.esc(product.name)}</strong><small>${S.fn.esc(product.sku)}${product.barcode ? ` · ${S.fn.esc(product.barcode)}` : ''}</small></span></div></td><td>${S.fn.esc(product.category)}</td><td class='text-right'><span class='stock-number ${product.stock <= 0 ? 'out' : product.stock <= product.minStock ? 'low' : ''}'>${S.fn.number(product.stock)} ${S.fn.esc(product.unit)}</span>${product.reserved > 0 ? `<small class='table-subtitle'>Giữ ${S.fn.number(product.reserved)} · Bán được ${S.fn.number(S.fn.availableForSale(product))}</small>` : ''}</td><td class='text-right'>${S.fn.number(product.minStock)} ${S.fn.esc(product.unit)}</td><td>${movement ? `<span class='product-name-stack'><strong>${S.fn.movementLabel(movement)}</strong><small>${S.fn.humanDate(movement.createdAt, true)} · ${S.fn.esc(movement.reason)}</small></span>` : `<span class='muted'>Chưa có biến động</span>`}</td><td>${movement ? `<span class='stock-number ${movement.delta > 0 ? '' : 'low'}'>${movement.delta > 0 ? '+' : ''}${S.fn.number(movement.delta)}</span>` : '—'}</td><td class='text-right'><button class='row-action' data-action='print-barcode-single' data-id='${product.id}' aria-label='In tem mã vạch ${S.fn.esc(product.name)}' title='In tem mã vạch'>${S.fn.icon('scan', 15)}</button>${S.fn.hasPerm('manageInventory') ? `<button class='row-action' data-action='adjust-stock' data-id='${product.id}' aria-label='Kiểm kê ${S.fn.esc(product.name)}' title='Kiểm kê'>＋</button>` : ''}</td></tr>`;
    }).join('');
  }


  S.fn.inventoryStatText = function inventoryStatText(key) {
    if (S.state.inventoryWarehouseId !== S.state.selectedWarehouseId) return '—';
    if (key === 'stockValueVnd' && (!S.fn.hasPerm('viewCostPrice') || S.state.inventorySummary.stockValueVnd == null)) return '—';
    return key === 'stockValueVnd' ? S.fn.money(S.state.inventorySummary.stockValueVnd) : S.fn.number(S.state.inventorySummary[key]);
  }


  S.fn.warehouseOptionName = function warehouseOptionName(warehouse) {
    return warehouse.name + (warehouse.is_default && warehouse.name.trim().toLocaleLowerCase('vi') !== 'kho chính' ? ' · Kho chính' : '');
  }


  S.fn.renderInventoryPurchases = function renderInventoryPurchases() {
    const canReceive = S.fn.hasPerm('manageInventory') || S.fn.hasPerm('recordCashbook');
    const receiptRows = (S.state.purchaseHistory || []).slice(0, 20).map(function (p) {
      return `<tr><td><button class='link-button order-ref' data-action='purchase-detail' data-id='${S.fn.esc(p.id)}'>${S.fn.esc(p.number)}</button></td><td>${S.fn.esc(p.supplierName || 'Không chỉ định NCC')}</td><td>${S.fn.humanDate(p.receivedAt, true)}</td><td class='text-right'>${S.fn.moneyVndText(p.totalVnd)}</td><td class='text-right'><button class='btn btn-secondary' data-action='print-barcode-purchase' data-id='${S.fn.esc(p.id)}'>In tem</button></td></tr>`;
    }).join('');
    const orderRowsHtml = (S.state.purchaseOrders || []).slice(0, 15).map(function (po) {
      return `<tr><td><button class='link-button order-ref' data-action='purchase-order-detail' data-id='${S.fn.esc(po.id)}'>${S.fn.esc(po.number)}</button></td><td>${S.fn.esc(po.supplierName || 'Nhà cung cấp')}</td><td>${S.fn.humanDate(po.createdAt, true)}</td><td class='text-right'>${S.fn.moneyVndText(po.totalVnd)}</td><td>${S.fn.esc(po.status || '')}</td></tr>`;
    }).join('');
    return `<section class='panel'><div class='panel-header'><div><h2>Phiếu nhập hàng</h2></div>${canReceive ? `<div class='heading-actions'><button class='btn btn-secondary' data-action='new-purchase-order'>＋ Đặt hàng NCC</button><button class='btn btn-primary' data-action='receive-stock'>＋ Nhập hàng mới</button></div>` : ''}</div><div class='table-wrap'><table class='data-table'><thead><tr><th>Mã phiếu</th><th>Nhà cung cấp</th><th>Thời gian</th><th class='text-right'>Tổng tiền</th><th class='text-right'>Tem mã</th></tr></thead><tbody>${receiptRows || `<tr><td colspan='5'><div class='empty-state'><strong>${S.state.financeDataReady ? 'Chưa có phiếu nhập nào' : 'Đang tải danh sách phiếu nhập…'}</strong>${!S.state.financeDataReady ? `<button type='button' class='link-button' data-action='reload-inventory-purchases'>Tải ngay</button>` : ''}</div></td></tr>`}</tbody></table></div></section>` +
      (orderRowsHtml ? `<section class='panel' style='margin-top:16px'><div class='panel-header'><div><h2>Đơn đặt hàng NCC</h2></div></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Mã đơn đặt</th><th>Nhà cung cấp</th><th>Ngày tạo</th><th class='text-right'>Giá trị</th><th>Trạng thái</th></tr></thead><tbody>${orderRowsHtml}</tbody></table></div></section>` : '');
  }


  S.fn.renderInventorySupplierReturns = function renderInventorySupplierReturns() {
    const canReturnSupplier = S.fn.hasPerm('manageInventory') || S.fn.hasPerm('recordCashbook');
    const listHtml = window.SlinkReturnsExchangeUI
      ? window.SlinkReturnsExchangeUI.renderSupplierReturnListHtml(S.state.supplierReturnsList)
      : '<p>Đang tải công cụ trả hàng…</p>';
    return `<section class='panel'><div class='panel-header'><div><h2>Trả hàng nhà cung cấp</h2></div>${canReturnSupplier ? `<button class='btn btn-primary' data-action='new-supplier-return'>＋ Tạo phiếu trả NCC</button>` : ''}</div>${S.state.supplierReturnsLoading ? `<div class='empty-state'><strong>Đang tải danh sách phiếu trả NCC…</strong></div>` : S.state.supplierReturnsError ? `<div class='empty-state' role='alert'><strong>${S.fn.esc(S.state.supplierReturnsError)}</strong><button type='button' class='link-button' data-action='reload-supplier-returns'>Thử lại</button></div>` : `<div class='table-wrap'>${listHtml}</div>`}</section>`;
  }


  S.fn.renderInventoryStockCount = function renderInventoryStockCount() {
    const canCount = S.fn.hasPerm('manageInventory');
    const needReview = (S.state.inventoryProducts || []).filter(function (p) { return p.inventoryTracked && p.stock <= p.minStock; }).slice(0, 15);
    return `<section class='panel'><div class='panel-header'><h2>Kiểm kê kho</h2>${canCount ? `<div class='heading-actions'><button class='btn btn-secondary' data-action='bulk-stock-count'>Kiểm kê CSV</button><button class='btn btn-secondary' data-action='adjust-stock-picker'>＋ Kiểm kê mã</button><button class='btn btn-primary' data-action='rapid-stock-count'>${S.fn.icon('scan', 16)} Quét kiểm kho</button></div>` : ''}</div><div class='table-wrap'><table class='data-table'><thead><tr><th>Sản phẩm sắp hết / cần kiểm</th><th>SKU</th><th class='text-right'>Tồn hệ thống</th><th class='text-right'>Định mức tối thiểu</th><th></th></tr></thead><tbody>${needReview.map(function (p) {
      return `<tr><td><strong>${S.fn.esc(p.name)}</strong></td><td>${S.fn.esc(p.sku)}</td><td class='text-right'><span class='stock-number ${p.stock <= 0 ? 'out' : 'low'}'>${S.fn.number(p.stock)} ${S.fn.esc(p.unit)}</span></td><td class='text-right'>${S.fn.number(p.minStock)} ${S.fn.esc(p.unit)}</td><td class='text-right'>${canCount ? `<button class='btn btn-secondary' data-action='adjust-stock' data-id='${S.fn.esc(p.id)}'>Đếm lại</button>` : ''}</td></tr>`;
    }).join('') || `<tr><td colspan='5'><div class='empty-state'><strong>Các mặt hàng đều đủ định mức</strong></div></td></tr>`}</tbody></table></div></section>`;
  }


  S.fn.renderInventory = function renderInventory() {
    const currentWarehouse = S.state.inventoryWarehouseId === S.state.selectedWarehouseId && S.state.inventoryLoadedFilter === S.state.inventoryStockFilter && S.state.inventoryLoadedQuery === S.state.searchTerms.inventory;
    const total = currentWarehouse ? S.state.inventoryTotal : 0;
    const canCount = S.fn.hasPerm('manageInventory');
    const canReceive = S.fn.hasPerm('manageInventory') || S.fn.hasPerm('recordCashbook');
    const canManageWarehouse = S.fn.hasPerm('manageSettings');
    const showCostValue = S.fn.hasPerm('viewCostPrice');
    const warehouseOptions = S.state.warehouses.map(warehouse => `<option value='${S.fn.esc(warehouse.id)}' ${warehouse.id === S.state.selectedWarehouseId ? 'selected' : ''}>${S.fn.esc(S.fn.warehouseOptionName(warehouse))}</option>`).join('');
    const defaultWarehouseSelected = S.state.warehouses.some(function (warehouse) { return warehouse.id === S.state.selectedWarehouseId && warehouse.is_default; });
    const advanced = `${canCount ? `<button class='btn btn-secondary' data-action='rapid-stock-count'>Quét camera kiểm kho</button><button class='btn btn-secondary' data-action='adjust-stock-picker'>Đếm lại hàng</button>` : ''}${canManageWarehouse ? `<button class='btn btn-secondary' data-action='new-warehouse'>Thêm kho</button>` : ''}${canCount ? `<button class='btn btn-secondary' data-action='bulk-stock-count'>Kiểm kê CSV</button>` : ''}${S.fn.canExportData() ? `<button class='btn btn-secondary' data-action='open-export'>Xuất CSV</button>` : ''}${canManageWarehouse && S.state.selectedWarehouseId && !defaultWarehouseSelected ? `<button class='btn btn-secondary' data-action='archive-warehouse' data-id='${S.fn.esc(S.state.selectedWarehouseId)}'>Lưu trữ kho</button>` : ''}${canCount && S.state.warehouses.length > 1 ? `<button class='btn btn-secondary' data-action='new-warehouse-transfer'>Điều chuyển kho</button>` : ''}`;
    const tabs = [
      ['stock', 'Tồn kho'],
      ['purchases', 'Nhập hàng'],
      canReceive ? ['supplier-returns', 'Trả hàng NCC'] : null,
      canCount ? ['stock-count', 'Kiểm kê'] : null,
      canReceive ? ['transfers', 'Điều chuyển'] : null,
    ].filter(Boolean);
    const activeTab = tabs.some(function (t) { return t[0] === S.state.inventoryTab; }) ? S.state.inventoryTab : 'stock';
    const tabBar = `<div class='inventory-subtabs' role='tablist' aria-label='Nghiệp vụ kho hàng'>${tabs.map(function (t) {
      return `<button type='button' role='tab' class='inventory-subtab ${activeTab === t[0] ? 'active' : ''}' data-action='inventory-tab' data-tab='${t[0]}' aria-selected='${activeTab === t[0]}'>${t[1]}</button>`;
    }).join('')}</div>`;
    let tabBody = '';
    if (activeTab === 'purchases') tabBody = S.fn.renderInventoryPurchases();
    else if (activeTab === 'supplier-returns') tabBody = S.fn.renderInventorySupplierReturns();
    else if (activeTab === 'stock-count') tabBody = S.fn.renderInventoryStockCount();
    else if (activeTab === 'transfers') tabBody = `${canCount && S.state.warehouses.length > 1 ? `<div style='margin-bottom:12px;display:flex;justify-content:flex-end'><button class='btn btn-primary' data-action='new-warehouse-transfer'>＋ Tạo phiếu điều chuyển</button></div>` : ''}${S.fn.renderWarehouseTransfers()}`;
    else tabBody = `<div class='stat-grid inventory-stats'><article class='stat-card'><div class='stat-top'><span class='stat-label'>Tổng mặt hàng</span><span class='stat-icon'>${S.fn.icon('box', 15)}</span></div><div class='stat-value' data-inventory-stat='total'>${S.fn.inventoryStatText('total')}</div></article><article class='stat-card'><div class='stat-top'><span class='stat-label'>Sắp hết hàng</span><span class='stat-icon'>${S.fn.icon('alert', 15)}</span></div><div class='stat-value' data-inventory-stat='low'>${S.fn.inventoryStatText('low')}</div></article><article class='stat-card'><div class='stat-top'><span class='stat-label'>Hết hàng</span><span class='stat-icon'>${S.fn.icon('layers', 15)}</span></div><div class='stat-value' data-inventory-stat='out'>${S.fn.inventoryStatText('out')}</div></article>${showCostValue ? `<article class='stat-card'><div class='stat-top'><span class='stat-label'>Giá trị tồn ước tính</span><span class='stat-icon'>${S.fn.icon('wallet', 15)}</span></div><div class='stat-value' style='font-size:17px' data-inventory-stat='stockValueVnd'>${S.fn.inventoryStatText('stockValueVnd')}</div></article>` : ''}</div>` +
      `<div class='toolbar inventory-search-tools'><div class='toolbar-left'><div class='search-wrap inventory-search-wrap' data-tour-target='inventory-search'><span class='search-symbol' aria-hidden='true'>⌕</span><input class='input' id='inventory-search' type='search' placeholder='Tìm tên, mã hàng hoặc mã vạch…' value='${S.fn.esc(S.state.searchTerms.inventory)}' aria-label='Tìm trong kho'><button class='icon-button inventory-scan' type='button' data-action='inventory-scan' aria-label='Quét mã vạch tìm hàng' title='Quét mã vạch'>${S.fn.icon('scan', 20)}</button></div><span class='result-count' data-inventory-result-count aria-live='polite'>${S.state.inventoryLoading ? 'Đang tải…' : S.state.inventoryError ? 'Chưa tải được' : `${S.fn.number(total)} mặt hàng`}</span></div></div>
      <div class='inventory-stock-filters' role='group' aria-label='Lọc theo tồn kho'>${[['all', 'Tất cả'], ['low', 'Sắp hết'], ['out', 'Hết hàng']].map(([value, label]) => `<button type='button' data-action='inventory-stock-filter' data-stock='${value}' aria-pressed='${S.state.inventoryStockFilter === value}'>${label}</button>`).join('')}</div>` + S.fn.renderInventoryList();
    return S.fn.pageHeading('Kho hàng', '', `${canReceive ? `<button class='btn btn-primary' data-action='receive-stock' data-tour-target='inventory-receive'>＋ Nhập hàng</button>` : ''}${advanced ? `<details class='catalog-more'><summary class='btn btn-secondary'>Khác</summary><div>${advanced}</div></details>` : ''}`) +
      `<div class='toolbar warehouse-toolbar'><div class='toolbar-left'><label class='input-label' for='inventory-warehouse'>Kho</label><div class='select-wrap'><select class='input' id='inventory-warehouse' aria-label='Chọn kho tồn kho'>${warehouseOptions}</select></div><span class='result-count'>${S.state.warehouseLoading ? 'Đang tải kho…' : S.state.warehouseError ? 'Chưa tải được kho' : ''}</span></div></div>` +
      tabBar + tabBody;
  }


  S.fn.inventoryMobileCards = function inventoryMobileCards(products) {
    return products.map(function (product) {
      const stockClass = product.stock <= 0 ? 'out' : product.stock <= product.minStock ? 'low' : '';
      return `<article class='product-mobile-card'>
        <div class='product-mobile-main'>
          ${S.fn.productThumb(product)}
          <div class='product-mobile-info'>
            <strong>${S.fn.esc(product.name)}</strong>
            <small>${S.fn.esc(product.sku)} · ${S.fn.esc(product.category)}</small>
          </div>
          <div class='product-mobile-side'>
            <strong class='stock-number ${stockClass}'>${S.fn.number(product.stock)} ${S.fn.esc(product.unit)}</strong>
            <small class='muted'>Nhắc ≤ ${S.fn.number(product.minStock)}</small>
          </div>
        </div>
        ${S.fn.hasPerm('manageInventory') ? `<button class='product-card-menu-button' data-action='adjust-stock' data-id='${product.id}' aria-label='Kiểm kê ${S.fn.esc(product.name)}' title='Kiểm kê'>＋</button>` : ''}
      </article>`;
    }).join('');
  }

  S.fn.renderInventoryList = function renderInventoryList() {
    const currentWarehouse = S.state.inventoryWarehouseId === S.state.selectedWarehouseId && S.state.inventoryLoadedFilter === S.state.inventoryStockFilter && S.state.inventoryLoadedQuery === S.state.searchTerms.inventory;
    const products = currentWarehouse ? S.state.inventoryProducts : [];
    const total = currentWarehouse ? S.state.inventoryTotal : 0;
    const offset = currentWarehouse ? S.state.inventoryOffset : 0;
    const nextOffset = currentWarehouse ? S.state.inventoryNextOffset : null;
    const empty = S.state.inventoryLoading ? 'Đang tải tồn kho' : S.state.inventoryError ? 'Chưa tải được tồn kho' : S.state.searchTerms.inventory ? 'Không tìm thấy mặt hàng' : S.state.inventoryStockFilter === 'low' ? 'Không có mặt hàng sắp hết' : S.state.inventoryStockFilter === 'out' ? 'Không có mặt hàng hết hàng' : 'Chưa có sản phẩm trong kho';
    const emptyMobile = `<div class='empty-state'><strong>${empty}</strong>${S.state.inventoryError ? `<button type='button' class='link-button' data-action='inventory-page' data-offset='0'>Thử lại</button>` : ''}</div>`;
    return `<section class='panel' data-inventory-result-list><div class='panel-header'><div><h2>Tồn kho tại ${S.fn.esc((S.state.warehouses.find(function (item) { return item.id === S.state.selectedWarehouseId; }) || {}).name || 'kho')}</h2></div></div><div class='table-wrap desktop-only-table'><table class='data-table'><thead><tr><th>Sản phẩm</th><th>Danh mục</th><th class='text-right'>Đang có</th><th class='text-right'>Nhắc khi còn</th><th>Biến động gần nhất</th><th>Thay đổi</th><th></th></tr></thead><tbody>${S.fn.inventoryRows(products) || `<tr><td colspan='7'><div class='empty-state'><strong>${empty}</strong>${S.state.inventoryError ? `<button type='button' class='link-button' data-action='inventory-page' data-offset='0'>Thử lại</button>` : ''}</div></td></tr>`}</tbody></table></div><div class='mobile-only-cards'>${S.fn.inventoryMobileCards(products) || emptyMobile}</div><div class='pagination'><span>Hiển thị ${products.length} trên ${S.fn.number(total)} mặt hàng</span><span class='pagination-actions'>${offset > 0 ? `<button class='page-button' data-action='inventory-page' data-offset='${Math.max(0, offset - 100)}'>‹</button>` : ''}<span class='page-button current'>${Math.floor(offset / 100) + 1}</span>${nextOffset !== null ? `<button class='page-button' data-action='inventory-page' data-offset='${nextOffset}'>›</button>` : ''}</span></div></section>`;
  }


  S.fn.transferStatusName = function transferStatusName(status) {
    return ({ draft: 'Phiếu nháp', in_transit: 'Đang vận chuyển', partially_received: 'Đã nhận một phần', received: 'Đã nhận đủ', cancelled: 'Đã hủy' })[status] || status;
  }


  S.fn.renderWarehouseTransfers = function renderWarehouseTransfers() {
    const active = S.state.warehouseTransfers.filter(function (transfer) { return transfer.status !== 'received' && transfer.status !== 'cancelled'; });
    const history = S.state.warehouseTransfers.filter(function (transfer) { return transfer.status === 'received' || transfer.status === 'cancelled'; }).slice(0, 10);
    const rows = active.concat(history).map(function (transfer) {
      const lines = (transfer.lines || []).map(function (line) {
        return `${S.fn.esc(line.productName)} · ${S.fn.number(Number(line.quantityReceived))}/${S.fn.number(Number(line.quantitySent))} ${S.fn.esc(line.unit)}`;
      }).join('　 ·　');
      const pendingDispatch = S.fn.readPendingWarehouseMutation('transfer-dispatch', transfer.id);
      const pendingReceipt = S.fn.readPendingWarehouseMutation('transfer-receipt', transfer.id);
      const pendingCancel = S.fn.readPendingWarehouseMutation('transfer-cancel', transfer.id);
      const actions = pendingDispatch
        ? `<button class='btn btn-primary' data-action='transfer-dispatch' data-id='${S.fn.esc(transfer.id)}'>Thử lại xuất chuyển</button>`
        : pendingReceipt
          ? `<button class='btn btn-primary' data-action='transfer-receive' data-id='${S.fn.esc(transfer.id)}'>Kiểm tra lần nhận</button>`
          : pendingCancel
            ? `<button class='btn btn-secondary' data-action='transfer-cancel' data-id='${S.fn.esc(transfer.id)}'>Kiểm tra lệnh hủy</button>`
            : transfer.status === 'draft'
        ? `<button class='btn btn-secondary' data-action='transfer-dispatch' data-id='${S.fn.esc(transfer.id)}'>Xuất chuyển</button><button class='link-button' data-action='transfer-cancel' data-id='${S.fn.esc(transfer.id)}'>Hủy nháp</button>`
        : ['in_transit', 'partially_received'].includes(transfer.status)
          ? `<button class='btn btn-primary' data-action='transfer-receive' data-id='${S.fn.esc(transfer.id)}'>Nhận hàng</button>`
          : '';
      return `<article class='warehouse-transfer-card'><div class='warehouse-transfer-main'><div><strong>${S.fn.esc(transfer.transfer_number)}</strong><span class='badge ${transfer.status === 'received' ? 'badge-success' : transfer.status === 'cancelled' ? 'badge-neutral' : 'badge-warning'}'>${S.fn.esc(S.fn.transferStatusName(transfer.status))}</span></div><p>${S.fn.esc(transfer.source_warehouse_name)} → ${S.fn.esc(transfer.destination_warehouse_name)}</p><small>${lines || 'Không có dòng hàng'}${transfer.note ? ` · ${S.fn.esc(transfer.note)}` : ''}</small></div><div class='warehouse-transfer-actions'>${actions}</div></article>`;
    }).join('');
    return `<section class='panel warehouse-transfers-panel'><div class='panel-header'><div><h2>Điều chuyển giữa các kho</h2></div></div>${rows || `<div class='empty-state'><strong>Chưa có phiếu điều chuyển</strong><span>Tạo phiếu để chuyển hàng giữa các kho đang hoạt động.</span></div>`}</section>`;
  }


  S.fn.openNewWarehouse = function openNewWarehouse() {
    if (!S.fn.hasPerm('manageSettings')) return S.fn.toast('Không có quyền', 'Chỉ chủ cửa hàng hoặc quản lý được thêm kho.', 'error');
    const pending = S.fn.readPendingWarehouseMutation('warehouse-create', 'new');
    const disabled = pending ? 'disabled' : '';
    const form = `<form id='entity-form' data-form='warehouse-create'><div class='form-grid'><div class='form-field'><label class='input-label' for='warehouse-code'>Mã kho *</label><input class='input' id='warehouse-code' name='code' value='${S.fn.esc(pending?.payload.code || '')}' maxlength='32' required autocomplete='off' placeholder='VD: CN-02' ${disabled}/></div><div class='form-field'><label class='input-label' for='warehouse-name'>Tên kho *</label><input class='input' id='warehouse-name' name='name' value='${S.fn.esc(pending?.payload.name || '')}' maxlength='120' required placeholder='VD: Kho chi nhánh 2' ${disabled}/></div></div><div class='modal-note'>${pending ? 'Thao tác tạo kho đang chờ máy chủ. Gửi lại đúng dữ liệu để tránh tạo trùng.' : 'Sản phẩm đang theo dõi tồn sẽ được tạo số dư 0 tại kho mới. Tồn kho được ghi nhận riêng theo từng địa điểm.'}</div></form>`;
    S.fn.showModal(pending ? 'Kiểm tra kho đang chờ' : 'Thêm kho hàng', 'Tạo địa điểm lưu trữ mới trong cửa hàng.', form, `<button class='btn btn-secondary' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại tạo kho' : 'Tạo kho'}</button>`);
  }


  S.fn.transferLineHtml = function transferLineHtml(item, index, disabled) {
    const options = S.state.store.products.filter(function (product) { return product.inventoryTracked; }).map(function (product) {
      return `<option value='${S.fn.esc(product.id)}' ${product.id === item.productId ? 'selected' : ''}>${S.fn.esc(product.name)} · ${S.fn.esc(product.sku)} · còn ${S.fn.number(product.stock)}</option>`;
    }).join('');
    return `<article class='purchase-line-card' data-transfer-line data-index='${index}'><div class='purchase-line-head'><strong>Mặt hàng ${S.fn.number(index + 1)}</strong>${!disabled && index > 0 ? `<button class='link-button' type='button' data-action='remove-transfer-line' data-index='${index}'>Xóa dòng</button>` : ''}</div><div class='form-grid'><div class='form-field full'><label class='input-label' for='transfer-product-${index}'>Sản phẩm *</label><div class='select-wrap'><select class='input' id='transfer-product-${index}' name='productId' required ${disabled ? 'disabled' : ''}>${options}</select></div></div><div class='form-field'><label class='input-label' for='transfer-quantity-${index}'>Số lượng chuyển *</label><input class='input' id='transfer-quantity-${index}' name='quantity' type='number' min='0.001' step='0.001' value='${S.fn.esc(item.quantity || '1')}' required ${disabled ? 'disabled' : ''}/></div></div></article>`;
  }


  S.fn.openWarehouseTransfer = function openWarehouseTransfer() {
    if (!S.fn.hasPerm('manageInventory')) return S.fn.toast('Không có quyền', 'Vai trò của bạn không được điều chuyển tồn kho.', 'error');
    const active = S.state.warehouses.filter(function (warehouse) { return warehouse.status === 'active'; });
    if (active.length < 2) return S.fn.toast('Cần thêm kho nhận', 'Tạo thêm một kho để bắt đầu điều chuyển hàng.', 'error');
    const pending = S.fn.readPendingWarehouseMutation('transfer-create', 'new');
    const sourceId = pending?.payload.sourceWarehouseId || (active.some(function (warehouse) { return warehouse.id === S.state.selectedWarehouseId; }) ? S.state.selectedWarehouseId : active[0].id);
    const destinationId = pending?.payload.destinationWarehouseId || active.find(function (warehouse) { return warehouse.id !== sourceId; }).id;
    const disabled = pending ? 'disabled' : '';
    const options = function (chosenId) { return active.map(function (warehouse) { return `<option value='${S.fn.esc(warehouse.id)}' ${warehouse.id === chosenId ? 'selected' : ''}>${S.fn.esc(warehouse.name)}${warehouse.is_default ? ' · Kho chính' : ''}</option>`; }).join(''); };
    const product = S.state.store.products.find(function (item) { return item.inventoryTracked && item.stock > 0; }) || S.state.store.products.find(function (item) { return item.inventoryTracked; });
    const initialLines = pending?.payload.items || [{ productId: product?.id || '', quantity: '1' }];
    const form = `<form id='entity-form' data-form='warehouse-transfer-create'><div class='form-grid'><div class='form-field'><label class='input-label' for='transfer-source'>Kho xuất *</label><div class='select-wrap'><select class='input' id='transfer-source' name='sourceWarehouseId' required ${disabled}>${options(sourceId)}</select></div></div><div class='form-field'><label class='input-label' for='transfer-destination'>Kho nhận *</label><div class='select-wrap'><select class='input' id='transfer-destination' name='destinationWarehouseId' required ${disabled}>${options(destinationId)}</select></div></div><div class='form-field full'><div class='panel-header'><div><h2>Mặt hàng</h2><p>Số lượng sẽ được kiểm tra lại tại kho nguồn khi xuất.</p></div>${pending ? '' : `<button class='btn btn-secondary' type='button' data-action='add-transfer-line'>＋ Thêm dòng</button>`}</div>${pending ? '' : `<div class='receive-scan-bar'><label class='input-label' for='transfer-barcode-scan'>Quét nhanh bằng mã vạch / SKU</label><input class='input' id='transfer-barcode-scan' type='search' placeholder='Quét máy tít hoặc nhập mã rồi bấm Enter để thêm / +1 SL' autocomplete='off'/></div>`}<div id='warehouse-transfer-lines'>${initialLines.map(function (item, index) { return S.fn.transferLineHtml(item, index, Boolean(pending)); }).join('')}</div></div><div class='form-field full'><label class='input-label' for='transfer-note'>Ghi chú</label><input class='input' id='transfer-note' name='note' value='${S.fn.esc(pending?.payload.note || '')}' maxlength='500' placeholder='Lý do hoặc thông tin giao nhận' ${disabled}/></div></div>${pending ? `<div class='modal-note'>Phiếu điều chuyển đang chờ máy chủ xác nhận. Gửi lại đúng nội dung để tránh tạo trùng.</div>` : ''}</form>`;
    S.fn.showModal(pending ? 'Kiểm tra phiếu điều chuyển đang chờ' : 'Tạo phiếu điều chuyển', 'Phiếu nháp chưa thay đổi tồn kho. Tồn kho nguồn giảm khi xuất.', form, `<button class='btn btn-secondary' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại lưu phiếu' : 'Lưu phiếu nháp'}</button>`, true);
  }


  S.fn.addTransferLine = function addTransferLine() {
    const form = S.dom.modal.querySelector('[data-form="warehouse-transfer-create"]');
    if (!form) return;
    const lines = Array.from(form.querySelectorAll('[data-transfer-line]'));
    if (lines.length >= 100) return S.fn.toast('Đã đạt giới hạn dòng hàng', 'Mỗi phiếu hỗ trợ tối đa 100 mặt hàng.', 'error');
    const productId = lines[0]?.querySelector('[name="productId"]')?.value || '';
    const choices = S.state.store.products.filter(function (item) { return item.inventoryTracked && item.id !== productId; });
    const next = choices[0] || S.state.store.products.find(function (item) { return item.inventoryTracked; });
    const container = form.querySelector('#warehouse-transfer-lines');
    if (container && next) {
      container.dataset.transferTouched = 'true';
      container.insertAdjacentHTML('beforeend', S.fn.transferLineHtml({ productId: next.id, quantity: '1' }, lines.length));
    }
  }


  S.fn.removeTransferLine = function removeTransferLine(index) {
    const form = S.dom.modal.querySelector('[data-form="warehouse-transfer-create"]');
    const line = form?.querySelector(`[data-transfer-line][data-index="${index}"]`);
    if (form && form.querySelectorAll('[data-transfer-line]').length > 1 && line) line.remove();
  }


  S.fn.openTransferReceipt = function openTransferReceipt(transferId) {
    const transfer = S.state.warehouseTransfers.find(function (item) { return item.id === transferId; });
    const pending = S.fn.readPendingWarehouseMutation('transfer-receipt', transferId);
    if (!transfer || (!pending && !['in_transit', 'partially_received'].includes(transfer.status))) return;
    const disabled = pending ? 'disabled' : '';
    const transferLines = transfer.lines || [];
    const lines = pending
      ? pending.payload.items.map(function (item) {
        return { line: transferLines.find(function (candidate) { return candidate.id === item.transferLineId; }), remaining: null, requested: String(item.quantity) };
      }).filter(function (item) { return item.line; })
      : transferLines.map(function (line) {
      const sent = Math.round(Number(line.quantitySent) * 1000);
      const received = Math.round(Number(line.quantityReceived) * 1000);
      const remaining = Math.max(0, sent - received);
      return { line, remaining };
    }).filter(function (item) { return item.remaining > 0; });
    const rows = lines.map(function (item) {
      const max = item.remaining === null ? item.requested : (item.remaining / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
      const prior = pending?.payload.items.find(function (candidate) { return candidate.transferLineId === item.line.id; });
      return `<article class='purchase-line-card' data-transfer-receipt-line data-id='${S.fn.esc(item.line.id)}' ${pending ? '' : `data-max='${S.fn.esc(max)}'`}><div class='purchase-line-head'><strong>${S.fn.esc(item.line.productName)} <small>${S.fn.esc(item.line.sku)}</small></strong><span>${pending ? `Lần trước đã xác nhận: ${S.fn.number(Number(max))}` : `Còn chuyển ${S.fn.number(Number(max))} ${S.fn.esc(item.line.unit)}`}</span></div><div class='form-field'><label class='input-label' for='transfer-receive-${S.fn.esc(item.line.id)}'>Số lượng nhận lần này</label><input class='input' id='transfer-receive-${S.fn.esc(item.line.id)}' type='number' min='0' ${pending ? '' : `max='${S.fn.esc(max)}'`} step='0.001' value='${S.fn.esc(prior?.quantity ?? max)}' ${disabled}/></div></article>`;
    }).join('');
    const form = `<form id='entity-form' data-form='warehouse-transfer-receipt' data-id='${S.fn.esc(transfer.id)}'><div class='form-grid'><div class='form-field full'><div class='purchase-order-receipt-lines'>${rows}</div></div><div class='form-field full'><label class='input-label' for='transfer-receive-note'>Ghi chú nhận hàng</label><input class='input' id='transfer-receive-note' name='note' value='${S.fn.esc(pending?.payload.note || '')}' maxlength='500' ${disabled}/></div></div>${pending ? `<div class='modal-note'>Lần nhận đang chờ máy chủ. Gửi lại số lượng đã xác nhận để tránh cộng trùng.</div>` : ''}</form>`;
    S.fn.showModal(pending ? `Kiểm tra lần nhận ${transfer.transfer_number}` : `Nhận điều chuyển ${transfer.transfer_number}`, `${transfer.source_warehouse_name} → ${transfer.destination_warehouse_name}`, form, `<button class='btn btn-secondary' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại lần nhận' : 'Xác nhận nhận hàng'}</button>`, true);
  }


  S.fn.openTransferCancel = function openTransferCancel(transferId) {
    const transfer = S.state.warehouseTransfers.find(function (item) { return item.id === transferId; });
    const pending = S.fn.readPendingWarehouseMutation('transfer-cancel', transferId);
    if (!transfer || (!pending && transfer.status !== 'draft')) return;
    const form = `<form id='entity-form' data-form='warehouse-transfer-cancel' data-id='${S.fn.esc(transfer.id)}'><div class='form-field'><label class='input-label' for='transfer-cancel-reason'>Lý do hủy *</label><textarea class='input' id='transfer-cancel-reason' name='reason' required minlength='3' maxlength='500' ${pending ? 'disabled' : ''}>${S.fn.esc(pending?.payload.reason || '')}</textarea></div>${pending ? `<div class='modal-note'>Lệnh hủy đang chờ máy chủ. Gửi lại đúng lý do để đối chiếu kết quả.</div>` : ''}</form>`;
    S.fn.showModal(pending ? `Kiểm tra lệnh hủy ${transfer.transfer_number}` : `Hủy phiếu ${transfer.transfer_number}`, '', form, `<button class='btn btn-secondary' data-action='close-modal'>${pending ? 'Để sau' : 'Quay lại'}</button><button class='btn btn-danger' type='submit' form='entity-form'>${pending ? 'Thử lại lệnh hủy' : 'Xác nhận hủy'}</button>`);
  }


  S.fn.openArchiveWarehouse = function openArchiveWarehouse(warehouseId) {
    const warehouse = S.state.warehouses.find(function (item) { return item.id === warehouseId; });
    if (!warehouse || warehouse.is_default || !S.fn.hasPerm('manageSettings')) return;
    const pending = S.fn.readPendingWarehouseMutation('warehouse-archive', warehouseId);
    const form = `<form id='entity-form' data-form='warehouse-archive' data-id='${S.fn.esc(warehouse.id)}'><div class='form-field'><label class='input-label' for='warehouse-archive-reason'>Lý do lưu trữ *</label><textarea class='input' id='warehouse-archive-reason' name='reason' required minlength='3' maxlength='500' ${pending ? 'disabled' : ''}>${S.fn.esc(pending?.payload.reason || '')}</textarea></div>${pending ? `<div class='modal-note'>Lệnh lưu trữ đang chờ máy chủ. Gửi lại đúng lý do để đối chiếu kết quả.</div>` : ''}</form>`;
    S.fn.showModal(pending ? 'Kiểm tra lệnh lưu trữ đang chờ' : `Lưu trữ ${warehouse.name}`, '', form, `<button class='btn btn-secondary' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-danger' type='submit' form='entity-form'>${pending ? 'Thử lại lưu trữ' : 'Lưu trữ kho'}</button>`);
  }


  S.fn.readPendingWarehouseMutation = function readPendingWarehouseMutation(kind, entityId) {
    const legacyKey = `slink-pending-${kind}-v1:${S.state.store.id}:${entityId}`;
    return S.fn.readPendingRecord(`warehouse-${kind}`, entityId, legacyKey, function (value) {
      return typeof value.key === 'string' && value.payload && typeof value.payload === 'object';
    });
  }


  S.fn.sendWarehouseMutation = async function sendWarehouseMutation(kind, entityId, path, payload, title) {
    const legacyKey = `slink-pending-${kind}-v1:${S.state.store.id}:${entityId}`;
    let pending = S.fn.readPendingWarehouseMutation(kind, entityId);
    if (!pending) pending = { key: S.fn.newIdempotencyKey(), payload };
    if (!S.fn.savePendingRecord(`warehouse-${kind}`, entityId, pending, legacyKey)) return S.fn.pendingSaveFailed();
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}${path}`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      S.fn.removePendingRecord(`warehouse-${kind}`, entityId, legacyKey);
      await S.fn.loadWarehouses();
      if (S.state.page === 'inventory') await S.fn.loadInventoryPage(S.state.searchTerms.inventory, S.state.inventoryOffset);
      S.fn.toast(title, result.transfer?.number || result.warehouse?.name || 'Đã cập nhật dữ liệu kho.');
      return result;
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra thao tác kho đang chờ.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.removePendingRecord(`warehouse-${kind}`, entityId, legacyKey);
        const pendingForm = S.dom.modal.querySelector('form[data-form^="warehouse-"]');
        if (pendingForm) pendingForm.querySelectorAll('input,select,textarea,button').forEach(function (field) { field.disabled = false; });
      }
      S.fn.toast('Chưa hoàn tất thao tác kho', error.message, 'error');
      return null;
    }
  }


  S.fn.saveWarehouse = async function saveWarehouse(form) {
    const data = new FormData(form);
    const pending = S.fn.readPendingWarehouseMutation('warehouse-create', 'new');
    const code = String(pending?.payload.code || data.get('code') || '').trim();
    const name = String(pending?.payload.name || data.get('name') || '').trim();
    if (!code || !name) return S.fn.toast('Thiếu thông tin kho', 'Nhập mã kho và tên kho.', 'error');
    const submit = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    const result = await S.fn.sendWarehouseMutation('warehouse-create', 'new', '/warehouses', { code, name }, 'Đã tạo kho');
    if (result) { S.fn.closeModal(); if (!S.state.selectedWarehouseId) S.state.selectedWarehouseId = result.warehouse.id; await S.fn.loadInventoryPage('', 0); }
    else if (submit && submit.isConnected) submit.disabled = false;
  }


  S.fn.saveWarehouseArchive = async function saveWarehouseArchive(form) {
    const warehouseId = form.dataset.id;
    const pending = S.fn.readPendingWarehouseMutation('warehouse-archive', warehouseId);
    const reason = String(pending?.payload.reason || new FormData(form).get('reason') || '').trim();
    if (reason.length < 3) return S.fn.toast('Lý do quá ngắn', 'Nhập lý do lưu trữ từ 3 ký tự trở lên.', 'error');
    const submit = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    const result = await S.fn.sendWarehouseMutation('warehouse-archive', warehouseId, `/warehouses/${encodeURIComponent(warehouseId)}/archive`, { reason }, 'Đã lưu trữ kho');
    if (result) S.fn.closeModal();
    else if (submit && submit.isConnected) submit.disabled = false;
  }


  S.fn.saveWarehouseTransfer = async function saveWarehouseTransfer(form) {
    const sourceWarehouseId = String(form.querySelector('#transfer-source')?.value || '');
    const destinationWarehouseId = String(form.querySelector('#transfer-destination')?.value || '');
    if (!sourceWarehouseId || !destinationWarehouseId || sourceWarehouseId === destinationWarehouseId) return S.fn.toast('Chọn kho khác nhau', 'Kho xuất và kho nhận phải là hai địa điểm khác nhau.', 'error');
    const seen = new Set();
    const items = Array.from(form.querySelectorAll('[data-transfer-line]')).map(function (row) {
      return { productId: String(row.querySelector('[name="productId"]')?.value || ''), quantity: String(row.querySelector('[name="quantity"]')?.value || '') };
    });
    for (const item of items) {
      if (!item.productId || seen.has(item.productId)) return S.fn.toast('Dòng hàng bị lặp', 'Mỗi sản phẩm chỉ được xuất hiện một lần trong phiếu.', 'error');
      seen.add(item.productId);
      if (!/^(0|[1-9]\d{0,9})(?:\.\d{1,3})?$/.test(item.quantity) || Number(item.quantity) <= 0) return S.fn.toast('Số lượng chưa hợp lệ', 'Nhập số lượng lớn hơn 0, tối đa 3 chữ số thập phân.', 'error');
    }
    const payload = { sourceWarehouseId, destinationWarehouseId, items, note: String(form.querySelector('#transfer-note')?.value || '').trim() };
    const submit = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    const result = await S.fn.sendWarehouseMutation('transfer-create', 'new', '/warehouse-transfers', payload, 'Đã tạo phiếu nháp');
    if (result) S.fn.closeModal();
    else if (submit && submit.isConnected) submit.disabled = false;
  }


  S.fn.dispatchWarehouseTransfer = async function dispatchWarehouseTransfer(transferId) {
    await S.fn.sendWarehouseMutation('transfer-dispatch', transferId, `/warehouse-transfers/${encodeURIComponent(transferId)}/dispatch`, {}, 'Đã xuất điều chuyển');
  }


  S.fn.saveWarehouseTransferReceipt = async function saveWarehouseTransferReceipt(form) {
    const transferId = form.dataset.id;
    const pending = S.fn.readPendingWarehouseMutation('transfer-receipt', transferId);
    const items = pending ? pending.payload.items : Array.from(form.querySelectorAll('[data-transfer-receipt-line]')).map(function (row) {
      return { transferLineId: row.dataset.id, quantity: String(row.querySelector('input')?.value || '0') };
    }).filter(function (item) { return Number(item.quantity) > 0; });
    if (!items.length) return S.fn.toast('Chưa nhập số lượng nhận', 'Nhập ít nhất một số lượng lớn hơn 0 để ghi nhận chuyến nhận.', 'error');
    if (!pending) {
      for (const item of items) {
        const row = form.querySelector(`[data-transfer-receipt-line][data-id="${item.transferLineId}"]`);
        if (Number(item.quantity) > Number(row?.dataset.max)) return S.fn.toast('Số lượng nhận vượt giới hạn', 'Không thể nhận nhiều hơn lượng còn đang vận chuyển.', 'error');
      }
    }
    const payload = pending ? pending.payload : { items, note: String(form.querySelector('#transfer-receive-note')?.value || '').trim() };
    const submit = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    const result = await S.fn.sendWarehouseMutation('transfer-receipt', transferId, `/warehouse-transfers/${encodeURIComponent(transferId)}/receipts`, payload, 'Đã ghi nhận nhận hàng');
    if (result) S.fn.closeModal();
    else if (submit && submit.isConnected) submit.disabled = false;
  }


  S.fn.saveWarehouseTransferCancel = async function saveWarehouseTransferCancel(form) {
    const transferId = form.dataset.id;
    const pending = S.fn.readPendingWarehouseMutation('transfer-cancel', transferId);
    const reason = String(pending?.payload.reason || new FormData(form).get('reason') || '').trim();
    if (reason.length < 3) return S.fn.toast('Lý do quá ngắn', 'Nhập lý do hủy từ 3 ký tự trở lên.', 'error');
    const submit = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    const result = await S.fn.sendWarehouseMutation('transfer-cancel', transferId, `/warehouse-transfers/${encodeURIComponent(transferId)}/cancel`, { reason }, 'Đã hủy phiếu nháp');
    if (result) S.fn.closeModal();
    else if (submit && submit.isConnected) submit.disabled = false;
  }


  S.fn.purchaseHistoryPanel = function purchaseHistoryPanel() {
    const rows = S.state.purchaseHistory.map(function (purchase) {
      return `<tr><td><button class='link-button order-ref' data-action='purchase-detail' data-id='${purchase.id}'>${S.fn.esc(purchase.number)}</button>${purchase.purchaseOrderNumber ? `<small class='table-subtitle'>Đơn ${S.fn.esc(purchase.purchaseOrderNumber)}</small>` : ''}</td><td>${S.fn.esc(purchase.supplierName || 'Không chỉ định')}</td><td>${S.fn.humanDate(purchase.receivedAt, true)}</td><td>${S.fn.number(purchase.items.length)} dòng</td><td class='text-right'><strong>${S.fn.moneyVndText(purchase.totalVnd)}</strong></td></tr>`;
    }).join('');
    return `<section class='panel' style='margin-top:14px'><div class='panel-header'><div><h2>Phiếu nhập gần đây</h2><p>${S.state.purchaseHistory.length ? 'Tối đa 50 phiếu mới nhất' : 'Lịch sử nhận hàng của cửa hàng'}</p></div><button class='link-button' data-action='receive-stock'>＋ Nhập hàng</button></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Mã phiếu</th><th>Nhà cung cấp</th><th>Ngày nhận</th><th>Số dòng</th><th class='text-right'>Tổng tiền</th></tr></thead><tbody>${rows || `<tr><td colspan='5'><div class='empty-state'><strong>${S.state.financeLoading ? 'Đang tải phiếu nhập' : 'Chưa có phiếu nhập'}</strong><span>Phiếu nhập mới sẽ hiện ở đây.</span></div></td></tr>`}</tbody></table></div></section>`;
  }


  S.fn.purchaseOrderStatus = function purchaseOrderStatus(status) {
    return ({ draft: 'Bản nháp', ordered: 'Đã đặt hàng', partially_received: 'Đã nhận một phần', received: 'Đã nhận đủ', cancelled: 'Đã hủy' })[status] || status;
  }


  S.fn.purchaseOrderPanel = function purchaseOrderPanel() {
    const rows = S.state.purchaseOrders.map(function (order) {
      const received = order.items.reduce(function (sum, item) { return sum + (Number(item.quantityReceived) || 0); }, 0);
      const ordered = order.items.reduce(function (sum, item) { return sum + (Number(item.quantityOrdered) || 0); }, 0);
      const progress = ordered > 0 ? `${S.fn.number(received)} / ${S.fn.number(ordered)} đơn vị` : `${order.items.length} dòng hàng`;
      const pendingReceipt = S.fn.loadPendingPurchaseOrderReceipt(order.id);
      const canReceive = ['ordered', 'partially_received'].includes(order.status);
      const canCancel = ['draft', 'ordered', 'partially_received'].includes(order.status);
      return `<article class='purchase-order-card'><div class='purchase-order-summary'><div><button class='link-button order-ref' data-action='purchase-order-detail' data-id='${order.id}'>${S.fn.esc(order.number)}</button><small>${S.fn.esc(order.supplierName)} · ${S.fn.esc(order.warehouseName || 'Kho chính')} · ${S.fn.humanDate(order.createdAt, true)}</small></div><span class='purchase-order-status status-${S.fn.esc(order.status)}'>${S.fn.esc(S.fn.purchaseOrderStatus(order.status))}</span></div><div class='purchase-order-metrics'><span>${S.fn.esc(progress)}</span><strong>${S.fn.moneyVndText(order.totalVnd)}</strong></div><div class='purchase-order-actions'><button class='link-button' data-action='purchase-order-detail' data-id='${order.id}'>Chi tiết</button>${order.status === 'draft' ? `<button class='link-button' data-action='edit-purchase-order' data-id='${order.id}'>Sửa nháp</button><button class='link-button' data-action='place-purchase-order' data-id='${order.id}'>Đánh dấu đã gửi</button>` : ''}${pendingReceipt ? `<button class='link-button' data-action='receive-purchase-order' data-id='${order.id}'>Kiểm tra lần nhận</button>` : canReceive ? `<button class='link-button' data-action='receive-purchase-order' data-id='${order.id}'>Nhận hàng</button>` : ''}${canCancel ? `<button class='link-button danger-link' data-action='cancel-purchase-order' data-id='${order.id}'>Hủy đơn</button>` : ''}</div></article>`;
    }).join('');
    return `<section class='panel purchase-orders-panel' style='margin-top:14px'><div class='panel-header'><div><h2>Đơn đặt hàng</h2></div><button class='btn btn-secondary' data-action='new-purchase-order'>＋ Tạo đơn</button></div><div class='purchase-order-list'>${rows || `<div class='empty-state'><strong>${S.state.financeLoading ? 'Đang tải đơn đặt hàng' : 'Chưa có đơn đặt hàng'}</strong></div>`}</div></section>`;
  }


  S.fn.renderPurchaseOrderLines = function renderPurchaseOrderLines(items, disabled) {
    return items.map(function (item, index) {
      const product = S.state.store.products.find(function (candidate) { return candidate.id === item.productId; });
      const selected = item.productId && !product ? `<option value='${S.fn.esc(item.productId)}' selected>${S.fn.esc(item.productName || 'Sản phẩm trong nháp')} · ${S.fn.esc(item.sku || '')}</option>` : '';
      const options = S.state.store.products.map(function (candidate) {
        return `<option value='${candidate.id}' data-cost='${candidate.cost}' ${candidate.id === item.productId ? 'selected' : ''}>${S.fn.esc(candidate.name)} · ${S.fn.esc(candidate.sku)}</option>`;
      }).join('');
      return `<article class='purchase-line-card' data-order-line data-index='${index}'><div class='purchase-line-head'><strong>Mặt hàng ${S.fn.number(index + 1)}</strong>${!disabled && items.length > 1 ? `<button class='link-button' type='button' data-action='remove-order-line' data-index='${index}'>Xóa dòng</button>` : ''}</div><div class='form-grid'><div class='form-field full'><label class='input-label' for='order-product-search-${index}'>Tìm sản phẩm</label><input class='input' id='order-product-search-${index}' data-order-search data-index='${index}' type='search' placeholder='Tên hoặc mã SKU…' ${disabled}/></div><div class='form-field full'><label class='input-label' for='order-product-${index}'>Sản phẩm *</label><div class='select-wrap'><select class='input' id='order-product-${index}' data-order-product required ${disabled}>${selected}${options}</select></div></div><div class='form-field'><label class='input-label' for='order-quantity-${index}'>Số lượng đặt *</label><input class='input' id='order-quantity-${index}' data-order-quantity type='number' min='0.001' step='0.001' value='${S.fn.esc(item.quantity ?? '1')}' required ${disabled}/></div><div class='form-field'><label class='input-label' for='order-cost-${index}'>Giá dự kiến / đơn vị (VND) *</label><input class='input' id='order-cost-${index}' data-order-cost type='number' min='0' step='1' value='${S.fn.esc(item.unitCostVnd ?? (product ? product.cost : ''))}' required ${disabled}/></div></div></article>`;
    }).join('');
  }


  S.fn.purchaseOrderItemsFromForm = function purchaseOrderItemsFromForm(form) {
    return Array.from(form.querySelectorAll('[data-order-line]')).map(function (row) {
      const product = row.querySelector('[data-order-product]');
      return { productId: String(product?.value || ''), productName: product?.selectedOptions[0]?.textContent || '', quantity: String(row.querySelector('[data-order-quantity]')?.value || ''), unitCostVnd: S.fn.moneyInputRaw(row.querySelector('[data-order-cost]')?.value || '') };
    });
  }


  S.fn.updatePurchaseOrderTotal = function updatePurchaseOrderTotal(form) {
    const output = form && form.querySelector('#purchase-order-total');
    if (!output) return;
    let total = 0n;
    try {
      const seen = new Set();
      for (const item of S.fn.purchaseOrderItemsFromForm(form)) {
        if (!item.productId || seen.has(item.productId)) throw new Error('incomplete');
        seen.add(item.productId);
        const quantity = /^(0|[1-9]\d{0,9})(?:\.(\d{1,3}))?$/.exec(item.quantity);
        if (!quantity || !/^(0|[1-9]\d{0,18})$/.test(item.unitCostVnd)) throw new Error('incomplete');
        const milli = BigInt(quantity[1]) * 1000n + BigInt((quantity[2] || '').padEnd(3, '0') || '0');
        if (milli <= 0n) throw new Error('incomplete');
        total += (BigInt(item.unitCostVnd) * milli + 500n) / 1000n;
        if (total > 9223372036854775807n) throw new Error('limit');
      }
      output.textContent = S.fn.moneyVndText(total.toString());
    } catch (error) { output.textContent = error.message === 'limit' ? 'Vượt giới hạn lưu trữ' : 'Nhập đủ số lượng và giá'; }
  }


  S.fn.redrawPurchaseOrderLines = function redrawPurchaseOrderLines(form, items) {
    const container = form.querySelector('#purchase-order-lines');
    if (container) container.innerHTML = S.fn.renderPurchaseOrderLines(items, false);
    S.fn.updatePurchaseOrderTotal(form);
  }


  S.fn.openPurchaseOrder = function openPurchaseOrder(orderId) {
    if (!S.state.store.products.length) return S.fn.toast('Chưa có sản phẩm để đặt', 'Hãy tạo sản phẩm trước khi lập đơn đặt hàng.');
    if (!S.state.store.suppliers.length) return S.fn.toast('Chưa có nhà cung cấp', 'Tạo hồ sơ nhà cung cấp trước khi lập đơn đặt hàng.');
    const order = orderId ? S.state.purchaseOrders.find(function (item) { return item.id === orderId; }) : null;
    if (orderId && (!order || order.status !== 'draft')) return S.fn.toast('Đơn không còn là bản nháp', 'Tải lại danh sách đơn trước khi sửa.', 'error');
    const pending = S.fn.loadPendingPurchaseOrder(orderId || '');
    const suppliers = S.state.store.suppliers.map(function (supplier) { return `<option value='${supplier.id}' ${(pending?.payload.supplierId || order?.supplierId || S.state.store.suppliers[0].id) === supplier.id ? 'selected' : ''}>${S.fn.esc(supplier.name)}</option>`; }).join('');
    const defaultWarehouseId = (S.state.warehouses.find(function (item) { return item.is_default; }) || {}).id || '';
    const orderWarehouseId = pending ? (pending.payload.warehouseId || defaultWarehouseId) : (order?.warehouseId || S.state.selectedWarehouseId || defaultWarehouseId);
    const warehouseOptions = S.state.warehouses.map(function (warehouse) { return `<option value='${S.fn.esc(warehouse.id)}' ${warehouse.id === orderWarehouseId ? 'selected' : ''}>${S.fn.esc(warehouse.name)}${warehouse.is_default ? ' · Kho chính' : ''}</option>`; }).join('');
    const initial = pending?.payload.items || (order ? order.items.map(function (item) { return { productId: item.productId, productName: item.productName, sku: item.sku, quantity: item.quantityOrdered, unitCostVnd: item.unitCostVnd }; }) : [{ productId: S.state.store.products[0].id, quantity: '1', unitCostVnd: String(S.state.store.products[0].cost) }]);
    const disabled = pending ? 'disabled' : '';
    const form = `<form id='entity-form' data-form='purchase-order' data-id='${order ? order.id : ''}' data-version='${order ? order.version : ''}'><div class='form-grid'><div class='form-field full'><label class='input-label' for='purchase-order-supplier'>Nhà cung cấp *</label><div class='select-wrap'><select class='input' id='purchase-order-supplier' name='supplierId' required ${disabled}>${suppliers}</select></div></div><div class='form-field full'><label class='input-label' for='purchase-order-warehouse'>Kho nhận hàng *</label><div class='select-wrap'><select class='input' id='purchase-order-warehouse' name='warehouseId' required ${disabled}>${warehouseOptions}</select></div></div><div class='form-field full'><div class='panel-header'><h2>Sản phẩm đặt</h2>${pending ? '' : `<button class='btn btn-secondary' type='button' data-action='add-order-line'>＋ Thêm mặt hàng</button>`}</div><div id='purchase-order-lines'>${S.fn.renderPurchaseOrderLines(initial, Boolean(pending))}</div><div class='checkout-total' style='margin:12px 0 0'><span>Tổng giá trị dự kiến</span><strong id='purchase-order-total'>Đang tính…</strong></div></div><div class='form-field full'><label class='input-label' for='purchase-order-note'>Ghi chú</label><textarea class='input' id='purchase-order-note' name='note' maxlength='500' ${disabled}>${S.fn.esc(pending?.payload.note ?? order?.note ?? '')}</textarea></div></div>${pending ? `<div class='modal-note'>Thao tác đang chờ máy chủ xác nhận. Gửi lại đúng nội dung để tránh tạo hoặc sửa lặp.</div>` : ''}</form>`;
    S.fn.showModal(pending ? 'Kiểm tra đơn đặt hàng đang chờ' : order ? `Sửa đơn ${order.number}` : 'Tạo đơn đặt hàng', '', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại lưu đơn' : 'Lưu bản nháp'}</button>`, true);
    S.fn.updatePurchaseOrderTotal(S.dom.modal.querySelector('[data-form="purchase-order"]'));
  }


  S.fn.openPurchaseOrderDetail = function openPurchaseOrderDetail(orderId, provided) {
    const order = provided || S.state.purchaseOrders.find(function (item) { return item.id === orderId; });
    if (!order) return;
    const rows = order.items.map(function (item) {
      return `<tr><td><span class='product-name-stack'><strong>${S.fn.esc(item.productName)}</strong><small>${S.fn.esc(item.sku)}</small></span></td><td>${S.fn.number(Number(item.quantityReceived))} / ${S.fn.number(Number(item.quantityOrdered))} ${S.fn.esc(item.unit)}</td><td class='text-right'>${S.fn.moneyVndText(item.unitCostVnd)}</td><td class='text-right'>${S.fn.moneyVndText(item.totalVnd)}</td></tr>`;
    }).join('');
    const pendingReceipt = S.fn.loadPendingPurchaseOrderReceipt(order.id);
    const orderActions = provided ? '' : order.status === 'draft' ? `<button class='btn btn-secondary' data-action='edit-purchase-order' data-id='${order.id}'>Sửa nháp</button><button class='btn btn-primary' data-action='place-purchase-order' data-id='${order.id}'>Đánh dấu đã gửi</button>` : pendingReceipt || ['ordered', 'partially_received'].includes(order.status) ? `<button class='btn btn-primary' data-action='receive-purchase-order' data-id='${order.id}'>${pendingReceipt ? 'Kiểm tra lần nhận' : 'Nhận hàng'}</button>` : '';
    const body = `<div class='summary-banner'><div><strong>${S.fn.esc(order.supplierName)}</strong><small>${S.fn.esc(order.warehouseName || 'Kho chính')} · ${S.fn.esc(S.fn.purchaseOrderStatus(order.status))} · tạo ${S.fn.humanDate(order.createdAt, true)}${order.orderedAt ? ` · gửi ${S.fn.humanDate(order.orderedAt, true)}` : ''}</small></div><strong>${S.fn.moneyVndText(order.totalVnd)}</strong></div><div class='table-wrap' style='margin-top:14px'><table class='data-table'><thead><tr><th>Sản phẩm</th><th>Đã nhận / Đặt</th><th class='text-right'>Giá dự kiến</th><th class='text-right'>Tổng dự kiến</th></tr></thead><tbody>${rows}</tbody></table></div>${order.note ? `<div class='modal-note'>${S.fn.esc(order.note)}</div>` : ''}`;
    S.fn.showModal(`Đơn đặt hàng ${order.number}`, '', body, `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button>${orderActions}`, true);
  }


  S.fn.openPurchaseOrderReceipt = function openPurchaseOrderReceipt(orderId) {
    const order = S.state.purchaseOrders.find(function (item) { return item.id === orderId; });
    const pending = S.fn.loadPendingPurchaseOrderReceipt(orderId);
    if (!order || (!pending && !['ordered', 'partially_received'].includes(order.status))) return S.fn.toast('Đơn chưa thể nhận hàng', 'Chỉ đơn đã gửi và chưa nhận đủ mới có thể ghi nhận hàng về.', 'error');
    const toMilli = function (value) { const parts = String(value).split('.'); return BigInt(parts[0]) * 1000n + BigInt((parts[1] || '').padEnd(3, '0')); };
    const remainingItems = order.items.map(function (item) {
      return { ...item, remaining: toMilli(item.quantityOrdered) - toMilli(item.quantityReceived) };
    }).filter(function (item) { return item.remaining > 0n; });
    const receiptItems = pending ? pending.payload.items.map(function (candidate) {
      const item = order.items.find(function (line) { return line.id === candidate.purchaseOrderLineId; });
      return item ? { ...item, remaining: toMilli(item.quantityOrdered) - toMilli(item.quantityReceived), pendingQuantity: String(candidate.quantity) } : null;
    }).filter(Boolean) : remainingItems;
    const rows = receiptItems.map(function (item) {
      const pendingQuantity = item.pendingQuantity;
      const milli = item.remaining;
      const whole = milli > 0n ? milli / 1000n : 0n;
      const fraction = milli > 0n ? milli % 1000n : 0n;
      const maximum = fraction ? `${whole}.${String(fraction).padStart(3, '0').replace(/0+$/, '')}` : String(whole);
      const displayedQuantity = pending ? pendingQuantity : maximum;
      return `<article class='purchase-line-card' data-receipt-line data-id='${item.id}' data-cost='${S.fn.esc(item.unitCostVnd)}'><div class='purchase-line-head'><strong>${S.fn.esc(item.productName)} <small>${S.fn.esc(item.sku)}</small></strong><span>${pending ? `Lần trước đã gửi ${S.fn.number(Number(displayedQuantity))} ${S.fn.esc(item.unit)}` : `Còn lại ${S.fn.number(Number(maximum))} ${S.fn.esc(item.unit)}`}</span></div><div class='form-field'><label class='input-label' for='receipt-quantity-${item.id}'>Số lượng chuyến này</label><input class='input' id='receipt-quantity-${item.id}' data-receipt-quantity type='number' min='0' ${pending ? `max='${S.fn.esc(displayedQuantity)}'` : `max='${S.fn.esc(maximum)}'`} step='0.001' value='${S.fn.esc(displayedQuantity)}' ${pending ? 'disabled' : ''}/></div></article>`;
    }).join('');
    const canPay = S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports');
    const disabled = pending ? 'disabled' : '';
    const payload = pending?.payload || {};
    const form = `<form id='entity-form' data-form='purchase-order-receipt' data-id='${order.id}'><div class='form-grid'><div class='form-field full'><div class='purchase-order-receipt-lines'>${rows}</div><div class='checkout-total' style='margin:12px 0 0'><span>Giá trị chuyến nhận</span><strong id='purchase-order-receipt-total'>Đang tính…</strong></div></div>${canPay ? `<div class='form-field'><label class='input-label' for='receipt-paid'>Thanh toán lần này (VND)</label><input class='input' id='receipt-paid' name='paid' type='number' min='0' step='1' value='${S.fn.esc(payload.amountPaidVnd ?? '0')}' ${disabled}/></div><div class='form-field'><label class='input-label' for='receipt-method'>Phương thức</label><div class='select-wrap'><select class='input' id='receipt-method' name='method' ${disabled}><option value='cash' ${!payload.method || payload.method === 'cash' ? 'selected' : ''}>Tiền mặt</option><option value='bank_transfer' ${payload.method === 'bank_transfer' ? 'selected' : ''}>Chuyển khoản</option><option value='bank_qr' ${payload.method === 'bank_qr' ? 'selected' : ''}>QR ngân hàng</option><option value='card' ${payload.method === 'card' ? 'selected' : ''}>Thẻ</option><option value='other' ${payload.method === 'other' ? 'selected' : ''}>Khác</option></select></div></div>` : ''}<div class='form-field full'><label class='input-label' for='receipt-note'>Ghi chú chuyến nhận</label><input class='input' id='receipt-note' name='note' maxlength='500' value='${S.fn.esc(payload.note || '')}' ${disabled}/></div></div>${pending ? `<div class='modal-note'>Phiếu nhận đang chờ máy chủ xác nhận. Gửi lại cùng nội dung để tránh cộng tồn kho hai lần.</div>` : ''}</form>`;
    S.fn.showModal(pending ? `Kiểm tra lần nhận ${order.number}` : `Nhận hàng ${order.number}`, '', form, `<button class='btn btn-secondary' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại nhận hàng' : 'Ghi nhận chuyến này'}</button>`, true);
    S.fn.updatePurchaseOrderReceiptTotal(S.dom.modal.querySelector('[data-form="purchase-order-receipt"]'));
  }


  S.fn.updatePurchaseOrderReceiptTotal = function updatePurchaseOrderReceiptTotal(form) {
    const output = form && form.querySelector('#purchase-order-receipt-total');
    if (!output) return;
    let total = 0n;
    try {
      for (const row of form.querySelectorAll('[data-receipt-line]')) {
        const quantityText = String(row.querySelector('[data-receipt-quantity]')?.value || '').trim();
        if (!quantityText || quantityText === '0') continue;
        const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,3}))?$/.exec(quantityText);
        if (!match) throw new Error('invalid');
        const milli = BigInt(match[1]) * 1000n + BigInt((match[2] || '').padEnd(3, '0') || '0');
        if (milli <= 0n) throw new Error('invalid');
        total += (BigInt(row.dataset.cost) * milli + 500n) / 1000n;
        if (total > 9223372036854775807n) throw new Error('limit');
      }
      output.textContent = total > 0n ? S.fn.moneyVndText(total.toString()) : 'Chọn số lượng nhận';
    } catch (error) { output.textContent = error.message === 'limit' ? 'Vượt giới hạn lưu trữ' : 'Kiểm tra số lượng'; }
  }


  S.fn.openCancelPurchaseOrder = function openCancelPurchaseOrder(orderId) {
    const order = S.state.purchaseOrders.find(function (item) { return item.id === orderId; });
    if (!order || !['draft', 'ordered', 'partially_received'].includes(order.status)) return;
    const form = `<form id='entity-form' data-form='purchase-order-cancel' data-id='${order.id}'><div class='form-field'><label class='input-label' for='purchase-order-cancel-reason'>Lý do hủy *</label><textarea class='input' id='purchase-order-cancel-reason' name='reason' required minlength='3' maxlength='500'></textarea></div>${order.status === 'partially_received' ? `<div class='modal-note'>Các phiếu đã nhận vẫn được giữ nguyên; chỉ phần chưa nhận còn lại bị đóng.</div>` : ''}</form>`;
    S.fn.showModal(`Hủy đơn ${order.number}`, 'Ghi lý do để lưu lịch sử thay đổi.', form, `<button class='btn btn-secondary' data-action='close-modal'>Quay lại</button><button class='btn btn-danger' type='submit' form='entity-form'>Xác nhận hủy</button>`);
  }


  S.fn.addPurchaseOrderLine = function addPurchaseOrderLine() {
    const form = S.dom.modal.querySelector('[data-form="purchase-order"]');
    if (!form) return;
    const items = S.fn.purchaseOrderItemsFromForm(form);
    if (items.length >= 50) return S.fn.toast('Đã đạt giới hạn dòng hàng', 'Mỗi đơn hỗ trợ tối đa 50 mặt hàng.', 'error');
    const existing = new Set(items.map(function (item) { return item.productId; }));
    const next = S.state.store.products.find(function (product) { return !existing.has(product.id); }) || S.state.store.products[0];
    items.push({ productId: next ? next.id : '', quantity: '1', unitCostVnd: next ? String(next.cost) : '' });
    S.fn.redrawPurchaseOrderLines(form, items);
  }


  S.fn.removePurchaseOrderLine = function removePurchaseOrderLine(index) {
    const form = S.dom.modal.querySelector('[data-form="purchase-order"]');
    if (!form) return;
    const items = S.fn.purchaseOrderItemsFromForm(form);
    if (items.length <= 1) return;
    items.splice(index, 1);
    S.fn.redrawPurchaseOrderLines(form, items);
  }


  S.fn.savePurchaseOrder = async function savePurchaseOrder(form) {
    const orderId = form.dataset.id || '';
    let pending = S.fn.loadPendingPurchaseOrder(orderId);
    if (!pending) {
      const data = new FormData(form);
      const items = S.fn.purchaseOrderItemsFromForm(form);
      if (!items.length || items.length > 50) return S.fn.toast('Đơn chưa hợp lệ', 'Đơn cần từ 1 đến 50 dòng hàng.', 'error');
      const seen = new Set();
      const normalized = [];
      for (const item of items) {
        if (!item.productId || seen.has(item.productId)) return S.fn.toast('Sản phẩm bị thiếu hoặc lặp', 'Mỗi sản phẩm chỉ xuất hiện một lần trong đơn.', 'error');
        seen.add(item.productId);
        if (!/^(0|[1-9]\d{0,9})(?:\.\d{1,3})?$/.test(item.quantity) || Number(item.quantity) <= 0) return S.fn.toast('Số lượng không hợp lệ', 'Số lượng phải lớn hơn 0, tối đa 3 chữ số thập phân.', 'error');
        if (!/^(0|[1-9]\d{0,18})$/.test(item.unitCostVnd)) return S.fn.toast('Giá nhập không hợp lệ', 'Giá dự kiến phải là VND nguyên không âm.', 'error');
        normalized.push({ productId: item.productId, quantity: item.quantity, unitCostVnd: item.unitCostVnd });
      }
      const supplierId = String(data.get('supplierId') || '');
      if (!supplierId) return S.fn.toast('Chưa chọn nhà cung cấp', 'Chọn nhà cung cấp trước khi lưu đơn.', 'error');
      const warehouseId = String(data.get('warehouseId') || '');
      if (!warehouseId) return S.fn.toast('Chưa chọn kho nhận', 'Chọn kho sẽ nhận hàng của đơn đặt.', 'error');
      pending = { orderId, version: Number(form.dataset.version) || null, key: S.fn.newIdempotencyKey(), payload: { supplierId: supplierId, warehouseId: warehouseId, items: normalized, note: String(data.get('note') || '').trim() } };
    }
    if (!S.fn.savePendingPurchaseOrder(pending)) return S.fn.pendingSaveFailed();
    form.querySelectorAll('input,select,textarea,button').forEach(function (field) { field.disabled = true; });
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const path = `/api/stores/${encodeURIComponent(S.state.store.id)}/purchase-orders${pending.orderId ? `/${encodeURIComponent(pending.orderId)}` : ''}`;
      const payload = pending.orderId ? { ...pending.payload, version: pending.version } : pending.payload;
      const result = await S.fn.apiRequest(path, { method: pending.orderId ? 'PUT' : 'POST', headers: { 'idempotency-key': pending.key }, body: payload });
      S.fn.clearPendingPurchaseOrder(pending.orderId || '');
      S.fn.closeModal();
      await S.fn.loadFinancePage();
      S.fn.render();
      S.fn.toast(pending.orderId ? 'Đã cập nhật đơn đặt hàng' : 'Đã tạo bản nháp', `${result.purchaseOrder.number || ''} · ${S.fn.moneyVndText(result.purchaseOrder.totalVnd || '0')}`);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra đơn đặt hàng đang chờ.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingPurchaseOrder(pending.orderId || '');
        form.querySelectorAll('input,select,textarea,button').forEach(function (field) { field.disabled = false; });
      }
      S.fn.toast('Chưa lưu được đơn đặt hàng', error.message, 'error');
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }


  S.fn.pendingPurchaseOrderAction = function pendingPurchaseOrderAction(orderId, action, reason) {
    const legacyKey = 'slink-pending-purchase-order-action-v1:' + orderId;
    let pending = S.fn.readPendingRecord('purchase-order-action', orderId, legacyKey, function (value) {
      return value.orderId === orderId && typeof value.key === 'string' && value.payload;
    });
    if (pending && (pending.action !== action || (action === 'cancel' && pending.payload.reason !== reason))) {
      throw new Error('Một thao tác khác trên đơn này đang chờ xác nhận. Hãy tải lại dữ liệu trước khi thực hiện tiếp.');
    }
    if (!pending) pending = { orderId, action, key: S.fn.newIdempotencyKey(), payload: action === 'cancel' ? { reason } : {} };
    if (!S.fn.savePendingRecord('purchase-order-action', orderId, pending, legacyKey)) throw new Error('Không lưu được mã thử lại trên thiết bị. Hãy kiểm tra dung lượng lưu trữ rồi thử lại.');
    return { pending, legacyKey };
  }


  S.fn.submitPurchaseOrderAction = async function submitPurchaseOrderAction(orderId, action, reason) {
    let record;
    try { record = S.fn.pendingPurchaseOrderAction(orderId, action, reason); }
    catch (error) { S.fn.toast('Chưa thể cập nhật đơn', error.message, 'error'); return; }
    const legacyKey = record.legacyKey;
    const pending = record.pending;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/purchase-orders/${encodeURIComponent(orderId)}/${action}`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      S.fn.removePendingRecord('purchase-order-action', orderId, legacyKey);
      S.fn.closeModal();
      await S.fn.loadFinancePage();
      S.fn.render();
      S.fn.toast(action === 'place' ? 'Đơn đã được đánh dấu đã gửi' : 'Đã hủy đơn đặt hàng', result.purchaseOrder.number || '');
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra thao tác đang chờ.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) S.fn.removePendingRecord('purchase-order-action', orderId, legacyKey);
      S.fn.toast('Chưa cập nhật được đơn', error.message, 'error');
    }
  }


  S.fn.placePurchaseOrder = function placePurchaseOrder(orderId) {
    const order = S.state.purchaseOrders.find(function (item) { return item.id === orderId; });
    if (!order || order.status !== 'draft') return;
    if (!window.confirm(`Xác nhận đã gửi đơn ${order.number} cho ${order.supplierName}? Slink chỉ ghi trạng thái; việc gửi cho nhà cung cấp vẫn do cửa hàng thực hiện.`)) return;
    S.fn.submitPurchaseOrderAction(orderId, 'place', '');
  }


  S.fn.cancelPurchaseOrder = async function cancelPurchaseOrder(form) {
    const orderId = form.dataset.id;
    const reason = String(new FormData(form).get('reason') || '').trim();
    if (reason.length < 3 || reason.length > 500) return S.fn.toast('Lý do hủy chưa hợp lệ', 'Nhập lý do từ 3 đến 500 ký tự.', 'error');
    await S.fn.submitPurchaseOrderAction(orderId, 'cancel', reason);
  }


  S.fn.receivePurchaseOrder = async function receivePurchaseOrder(form) {
    const orderId = form.dataset.id;
    let pending = S.fn.loadPendingPurchaseOrderReceipt(orderId);
    if (!pending) {
      const items = [];
      for (const row of form.querySelectorAll('[data-receipt-line]')) {
        const quantity = String(row.querySelector('[data-receipt-quantity]')?.value || '').trim();
        if (!quantity || quantity === '0') continue;
        if (!/^(0|[1-9]\d{0,9})(?:\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0) return S.fn.toast('Số lượng nhận không hợp lệ', 'Nhập số lượng lớn hơn 0, tối đa 3 chữ số thập phân.', 'error');
        const max = String(row.querySelector('[data-receipt-quantity]')?.max || '0');
        const milli = function (value) { const parts = value.split('.'); return BigInt(parts[0]) * 1000n + BigInt((parts[1] || '').padEnd(3, '0')); };
        if (milli(quantity) > milli(max)) return S.fn.toast('Số nhận vượt số còn lại', 'Giảm số lượng theo phần chưa nhận của đơn.', 'error');
        items.push({ purchaseOrderLineId: row.dataset.id, quantity });
      }
      if (!items.length) return S.fn.toast('Chưa nhập số lượng nhận', 'Nhập ít nhất một dòng hàng trong chuyến này.', 'error');
      const data = new FormData(form);
      const amountPaidVnd = String(data.get('paid') || '0').trim() || '0';
      if (!/^(0|[1-9]\d{0,18})$/.test(amountPaidVnd)) return S.fn.toast('Số tiền thanh toán không hợp lệ', 'Nhập VND nguyên không âm.', 'error');
      pending = { orderId, key: S.fn.newIdempotencyKey(), payload: { items, amountPaidVnd, method: String(data.get('method') || 'cash'), note: String(data.get('note') || '').trim() } };
    }
    if (!S.fn.savePendingPurchaseOrderReceipt(pending)) return S.fn.pendingSaveFailed();
    form.querySelectorAll('input,select,button').forEach(function (field) { field.disabled = true; });
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/purchase-orders/${encodeURIComponent(orderId)}/receipts`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      S.fn.clearPendingPurchaseOrderReceipt(orderId);
      S.fn.closeModal();
      await S.fn.loadFinancePage();
      await S.fn.loadInventoryPage(S.state.searchTerms.inventory, S.state.inventoryOffset);
      S.fn.emitSyncDomains(['stock', 'products', 'dashboard'], { source: 'stock-bulk-count' });
      await S.fn.loadProductsPage(S.state.searchTerms.products, S.state.productOffset);
      S.fn.render();
      S.fn.toast('Đã ghi nhận chuyến hàng', `${result.purchase.number} · ${result.purchaseOrder.number} · ${S.fn.moneyVndText(result.purchase.totalVnd)}`);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra chuyến nhận đang chờ.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingPurchaseOrderReceipt(orderId);
        form.querySelectorAll('input,select,button').forEach(function (field) { field.disabled = false; });
      }
      S.fn.toast('Chưa hoàn tất được chuyến nhận', error.message, 'error');
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }


  S.fn.openPurchaseDetail = function openPurchaseDetail(id, provided) {
    const purchase = provided || S.state.purchaseHistory.find(function (item) { return item.id === id; });
    if (!purchase) return;
    const rows = purchase.items.map(function (item) {
      const milli = Math.round(Number(item.quantity) * 1000);
      const estimated = item.pack || BigInt(item.unitCostVnd) * BigInt(milli) !== BigInt(item.totalVnd) * 1000n;
      return `<tr><td><span class='product-name-stack'><strong>${S.fn.esc(item.productName)}</strong><small>${S.fn.esc(item.sku)}</small>${item.pack ? `<small>${S.fn.number(Number(item.pack.quantity))} ${S.fn.esc(item.pack.name)} × ${S.fn.number(Number(item.pack.size))} ${S.fn.esc(item.unit)} · ${S.fn.moneyVndText(item.pack.unitCostVnd)} / ${S.fn.esc(item.pack.name)}</small>` : ''}</span></td><td>${S.fn.number(Number(item.quantity))} ${S.fn.esc(item.unit)}</td><td class='text-right'>${estimated ? '≈ ' : ''}${S.fn.moneyVndText(item.unitCostVnd)}</td><td class='text-right'><strong>${S.fn.moneyVndText(item.totalVnd)}</strong></td></tr>`;
    }).join('');
    const body = `<div class='summary-banner'><div><strong>${S.fn.esc(purchase.supplierName || 'Không chỉ định nhà cung cấp')}</strong><small>${S.fn.humanDate(purchase.receivedAt, true)} · ${S.fn.esc(purchase.status === 'received' ? 'Đã nhận hàng' : purchase.status)}${purchase.purchaseOrderNumber ? ` · đơn ${S.fn.esc(purchase.purchaseOrderNumber)}` : ''}</small></div><strong>${S.fn.moneyVndText(purchase.totalVnd)}</strong></div><div class='table-wrap' style='margin-top:14px'><table class='data-table'><thead><tr><th>Sản phẩm</th><th>Số lượng</th><th class='text-right'>Giá nhập / đơn vị</th><th class='text-right'>Thành tiền</th></tr></thead><tbody>${rows}</tbody></table></div>${purchase.note ? `<div class='modal-note'>${S.fn.esc(purchase.note)}</div>` : ''}`;
    S.fn.showModal(`Phiếu nhập ${purchase.number}`, '', body, `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button><button class='btn btn-primary' type='button' data-action='print-barcode-purchase' data-id='${S.fn.esc(purchase.id)}'>In tem</button>`, true);
  }


  S.fn.parseStockBulkCountCsv = function parseStockBulkCountCsv(text) {
    let parsed;
    try { parsed = S.fn.parseCsvDocument(text); }
    catch (error) { return { items: [], errors: [error.message] }; }
    const rows = parsed.filter(function (record, index) { return index === 0 || record.cells.some(function (cell) { return String(cell || '').trim() !== ''; }); });
    if (!rows.length) return { items: [], errors: ['Tệp CSV đang trống.'] };
    const headers = rows[0].cells.map(function (cell) { return String(cell || '').trim(); });
    const required = ['Mã kho', 'Mã sản phẩm', 'Phiên bản tồn kho', 'Tồn đếm mới'];
    const seenHeaders = new Set();
    const duplicateHeader = headers.find(function (header) { if (seenHeaders.has(header)) return true; seenHeaders.add(header); return false; });
    if (duplicateHeader) return { items: [], errors: [`Cột “${duplicateHeader}” xuất hiện nhiều lần.`] };
    const missing = required.filter(function (header) { return !headers.includes(header); });
    if (missing.length) return { items: [], errors: [`Thiếu cột bắt buộc: ${missing.join(', ')}. Hãy dùng CSV Tồn kho xuất từ Slink và chỉ điền số đếm mới.`] };
    const indexes = new Map(headers.map(function (header, index) { return [header, index]; }));
    const dataRows = rows.slice(1);
    const errors = [];
    const seenProducts = new Map();
    const items = [];
    if (!dataRows.length) errors.push('Tệp chưa có dòng kiểm kê nào.');
    if (dataRows.length > 200) errors.push('Mỗi lần kiểm kê tối đa 200 sản phẩm. Hãy chia tệp thành nhiều phần.');
    dataRows.slice(0, 200).forEach(function (record) {
      const line = record.line;
      const cells = record.cells;
      const rowErrors = [];
      if (cells.length > headers.length && cells.slice(headers.length).some(function (cell) { return String(cell || '').trim() !== ''; })) rowErrors.push(`Dòng ${line}: có dữ liệu nằm ngoài các cột tiêu đề.`);
      const value = function (header) { const index = indexes.get(header); return index === undefined ? '' : String(cells[index] || '').trim(); };
      const productId = value('Mã sản phẩm').toLowerCase();
      const warehouseId = value('Mã kho').toLowerCase();
      const versionText = value('Phiên bản tồn kho');
      const count = value('Tồn đếm mới');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(warehouseId)) rowErrors.push(`Dòng ${line}: mã kho không đúng định dạng; hãy dùng CSV mới xuất từ Slink.`);
      else if (warehouseId !== S.state.selectedWarehouseId.toLowerCase()) rowErrors.push(`Dòng ${line}: CSV thuộc kho khác với kho đang chọn. Hãy chọn đúng kho hoặc xuất lại tệp.`);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) rowErrors.push(`Dòng ${line}: mã sản phẩm không đúng định dạng.`);
      if (!/^\d+$/.test(versionText) || !Number.isSafeInteger(Number(versionText)) || Number(versionText) < 1) rowErrors.push(`Dòng ${line}: phiên bản tồn kho không hợp lệ; hãy xuất CSV mới từ Slink.`);
      if (!/^\d{1,10}(?:\.\d{1,3})?$/.test(count)) rowErrors.push(`Dòng ${line}: số đếm phải không âm, tối đa 10 chữ số nguyên và 3 chữ số thập phân.`);
      if (productId && seenProducts.has(productId)) rowErrors.push(`Dòng ${line}: mã sản phẩm trùng với dòng ${seenProducts.get(productId)}.`);
      else if (productId) seenProducts.set(productId, line);
      if (rowErrors.length) errors.push(...rowErrors);
      else items.push({ productId, expectedInventoryVersion: Number(versionText), count, sourceLine: line });
    });
    return { items: errors.length ? [] : items, errors };
  }


  S.fn.renderStockBulkCountPreview = function renderStockBulkCountPreview() {
    const preview = S.dom.modal.querySelector('#stock-bulk-count-preview');
    const submit = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (!preview) return;
    if (S.state.stockBulkCountReading) {
      preview.innerHTML = `<div class='notice-item' role='status'><span>…</span><span><strong>Đang đối chiếu số đếm</strong><small>Slink đang kiểm tra phiên bản tồn kho và lượng hàng được giữ; chưa ghi thay đổi nào.</small></span></div>`;
    } else if (S.state.stockBulkCountErrors.length) {
      preview.innerHTML = `<div class='auth-message error'><strong>Chưa thể kiểm kê lô này.</strong><br/>${S.state.stockBulkCountErrors.slice(0, 8).map(S.fn.esc).join('<br/>')}${S.state.stockBulkCountErrors.length > 8 ? `<br/>Còn ${S.state.stockBulkCountErrors.length - 8} lỗi khác.` : ''}</div>`;
    } else if (S.state.stockBulkCountRows.length) {
      const changedCount = S.state.stockBulkCountRows.filter(function (item) { return !item.unchanged; }).length;
      const unchangedCount = S.state.stockBulkCountRows.length - changedCount;
      preview.innerHTML = `<div class='notice-item'><span>${S.fn.icon('check', 18)}</span><span><strong>${S.fn.number(S.state.stockBulkCountRows.length)} dòng đã sẵn sàng · ${S.fn.number(changedCount)} có chênh lệch</strong><small>${S.fn.number(unchangedCount)} dòng giữ nguyên. Khi xác nhận, máy chủ sẽ khóa và kiểm tra lại toàn bộ lô; nếu một dòng đã đổi hoặc không hợp lệ, toàn bộ lô bị hủy.</small></span></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Dòng</th><th>Sản phẩm</th><th class='text-right'>Tồn hiện tại</th><th class='text-right'>Đang giữ</th><th class='text-right'>Số đếm mới</th><th class='text-right'>Chênh lệch</th></tr></thead><tbody>${S.state.stockBulkCountRows.map(function (item) { return `<tr><td>${S.fn.number(item.sourceLine)}</td><td><span class='product-name-stack'><strong>${S.fn.esc(item.name)}</strong><small>${S.fn.esc(item.sku)} · ${S.fn.esc(item.unit)}</small></span></td><td class='text-right'>${S.fn.formatImportQuantity(item.onHand)}</td><td class='text-right'>${S.fn.formatImportQuantity(item.reserved)}</td><td class='text-right'><strong>${S.fn.formatImportQuantity(item.counted)}</strong></td><td class='text-right'><span class='stock-number ${item.delta.startsWith('-') ? 'low' : ''}'>${item.delta.startsWith('-') ? '−' : item.delta === '0' ? '' : '+'}${S.fn.formatImportQuantity(item.delta.replace(/^-/, ''))}</span></td></tr>`; }).join('')}</tbody></table></div>`;
    } else {
      preview.innerHTML = `<div class='empty-state'><strong>Chưa chọn tệp kiểm kê</strong><span>Xuất CSV Tồn kho, điền cột “Tồn đếm mới” cho tối đa 200 sản phẩm rồi tải lại tệp tại đây.</span></div>`;
    }
    if (submit) submit.disabled = S.state.stockBulkCountReading || S.state.stockBulkCountRows.length === 0 || S.state.stockBulkCountErrors.length > 0;
  }


  S.fn.openStockBulkCount = function openStockBulkCount() {
    if (!S.state.warehouses.some(function (warehouse) { return warehouse.id === S.state.selectedWarehouseId; })) return S.fn.toast('Chưa chọn kho', 'Chọn kho cần kiểm kê rồi thử lại.', 'error');
    const pending = S.fn.loadPendingStockBulkCount();
    S.state.stockBulkCountReading = false;
    S.state.stockBulkCountRows = pending && Array.isArray(pending.payload.preview) ? pending.payload.preview : [];
    S.state.stockBulkCountErrors = [];
    const disabled = pending ? 'disabled' : '';
    const savedReason = pending ? pending.payload.reason : 'Kiểm kê hàng loạt';
    const body = `<form id='entity-form' data-form='stock-bulk-count'><div class='form-field full'><label class='input-label' for='stock-bulk-count-file'>Chọn tệp CSV tồn kho đã điền số đếm</label><input class='input' id='stock-bulk-count-file' type='file' accept='.csv,text/csv' ${disabled}/></div><div class='form-field full'><label class='input-label' for='stock-bulk-count-reason'>Lý do kiểm kê *</label><input class='input' id='stock-bulk-count-reason' name='reason' value='${S.fn.esc(savedReason)}' maxlength='500' required ${disabled}/></div><div id='stock-bulk-count-preview' class='product-import-preview' aria-live='polite'></div></form>`;
    const footer = `<button class='btn btn-secondary' type='button' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Gửi lại lô kiểm kê đang chờ' : 'Ghi nhận kiểm kê'}</button>`;
    S.fn.showModal(pending ? 'Kiểm tra lô kiểm kê đang chờ' : 'Kiểm kê nhiều sản phẩm', pending ? 'Gửi lại đúng lô trước đó để xác nhận kết quả, không ghi trùng.' : '', body, footer, true);
    S.fn.renderStockBulkCountPreview();
  }


  S.fn.openStockAdjustPicker = function openStockAdjustPicker() {
    if (S.state.inventoryWarehouseId !== S.state.selectedWarehouseId || !S.state.inventoryProducts.length) {
      return S.fn.toast('Chưa có mặt hàng để đếm', 'Kiểm tra kho đang chọn hoặc tìm lại mặt hàng.');
    }
    const options = S.state.inventoryProducts.map(product => `<option value='${S.fn.esc(product.id)}'>${S.fn.esc(product.name)} · ${S.fn.esc(product.sku)}</option>`).join('');
    const body = `<form id='entity-form' data-form='adjust-stock-picker'><label class='form-field'><span class='input-label'>Mặt hàng</span>
      <select class='input' name='productId' required><option value=''>Chọn mặt hàng…</option>${options}</select></label></form>`;
    const warehouse = S.state.warehouses.find(row => row.id === S.state.selectedWarehouseId);
    S.fn.showModal('Đếm lại hàng', warehouse?.name || '', body, `<button class='btn btn-secondary' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>Tiếp tục</button>`);
  }


  S.fn.openStockAdjust = async function openStockAdjust(id) {
    const pending = S.fn.loadPendingStock(id);
    const warehouseId = pending?.payload.warehouseId || S.state.selectedWarehouseId;
    let p = S.state.inventoryWarehouseId === warehouseId ? S.state.inventoryProducts.find(product => product.id === id) : null;
    if (!p && pending) p = S.fn.productById(id);
    if (!p && warehouseId && !pending) {
      const scope = S.fn.activeOfflineScope();
      const generation = S.state.modalGeneration, openedOn = S.state.page, session = S.state.authSession;
      const current = () => S.state.authSession === session && S.fn.activeOfflineScope() === scope && S.state.modalGeneration === generation && S.state.page === openedOn && S.state.selectedWarehouseId === warehouseId;
      try {
        const snapshot = scope ? await S.state.offlineDisk.snapshot(scope) : null;
        let row = snapshot && window.SlinkOfflineLedger.derive(snapshot.responses, snapshot.operations).products.get(window.SlinkOfflineLedger.productKey(warehouseId, id));
        if (!row && navigator.onLine && current()) {
          const result = await S.fn.networkRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products?limit=1&productId=${encodeURIComponent(id)}&warehouseId=${encodeURIComponent(warehouseId)}`);
          row = result.products.find(item => item.id === id);
        }
        if (!current()) return;
        if (row) p = S.fn.mapProduct(row);
      } catch (error) {
        if (!current()) return;
        return S.fn.toast('Chưa tải được số tồn của kho', error.message, 'error');
      }
    }
    if (!p) return S.fn.toast('Chọn sản phẩm cần kiểm kê', '', 'error');
    const disabled = pending ? 'disabled' : '';
    const warehouseName = S.state.warehouses.find(item => item.id === warehouseId)?.name || 'Kho đã chọn';
    const form = `<form id='entity-form' data-form='adjust-stock' data-id='${p.id}' data-inventory-version='${p.inventoryVersion}' data-stock-at-open='${p.stock}'><input type='hidden' name='warehouseId' value='${S.fn.esc(warehouseId)}'/><div class='customer-header' style='padding:0 0 14px'>${S.fn.productThumb(p, 'large')}<span><h2 style='font-size:12px;margin:0 0 4px'>${S.fn.esc(p.name)}</h2><p>${S.fn.esc(p.sku)} · ${S.fn.esc(warehouseName)}${pending ? '' : ': ' + S.fn.number(p.stock) + ' ' + S.fn.esc(p.unit)}</p></span></div><div class='form-grid'><div class='form-field'><label class='input-label'>Số lượng thực đếm *</label><input class='input' name='count' type='number' min='0' step='0.001' value='${pending ? S.fn.esc(pending.payload.count) : ''}' required ${disabled}/></div><div class='form-field'><label class='input-label'>Lý do điều chỉnh</label><div class='select-wrap'><select class='input' name='reason' ${disabled}><option ${pending && pending.payload.reason === 'Kiểm kê thực tế' ? 'selected' : ''}>Kiểm kê thực tế</option><option ${pending && pending.payload.reason === 'Hàng hư hỏng' ? 'selected' : ''}>Hàng hư hỏng</option><option ${pending && pending.payload.reason === 'Hàng thất lạc' ? 'selected' : ''}>Hàng thất lạc</option><option ${pending && pending.payload.reason === 'Điều chỉnh nhập đầu kỳ' ? 'selected' : ''}>Điều chỉnh nhập đầu kỳ</option></select></div></div></div>${pending ? `<div class='modal-note'>Thay đổi này đang chờ xác nhận. Hãy gửi lại cùng nội dung để tránh ghi tồn hai lần.</div>` : ''}</form>`;
    S.fn.showModal('Kiểm kê sản phẩm', '', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại cập nhật tồn' : 'Cập nhật tồn kho'}</button>`);
  }


  S.fn.cancelReceiveProductSearch = function cancelReceiveProductSearch(row) {
    const search = row && S.state.receiveProductSearches.get(row);
    if (search) window.clearTimeout(search.timer);
    if (row) S.state.receiveProductSearches.delete(row);
  }


  S.fn.searchReceiveProducts = function searchReceiveProducts(input) {
    const row = input.closest('[data-purchase-line]');
    if (!row) return;
    S.fn.cancelReceiveProductSearch(row);
    const query = input.value.trim();
    const generation = S.state.modalGeneration, session = S.state.authSession, storeId = S.state.store.id;
    const search = {};
    S.state.receiveProductSearches.set(row, search);
    const canApply = () => S.state.receiveProductSearches.get(row) === search && row.isConnected &&
      generation === S.state.modalGeneration && !S.dom.modal.hidden && S.state.authSession === session && S.state.store.id === storeId;
    search.timer = window.setTimeout(async function () {
      if (!canApply()) return;
      try {
        const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/products?limit=100&q=${encodeURIComponent(query)}`, { preferFresh: true });
        if (!canApply()) return;
        const select = row.querySelector('[data-purchase-product]');
        const previousId = select.value;
        const products = result.products.map(S.fn.mapProduct);
        // Only complete results can establish an unambiguous match.
        const exact = products.filter(product => product.sku.toLocaleLowerCase('vi') === query.toLocaleLowerCase('vi') || product.barcode === query || (Array.isArray(product.extraBarcodes) && product.extraBarcodes.includes(query)));
        const automatic = query && result.nextOffset == null && result.offlineCachedCount === undefined
          ? (exact.length === 1 ? exact[0] : Number(result.total) === 1 ? products[0] : null)
          : null;
        const selected = automatic || products.find(product => product.id === previousId) || (!query && S.fn.productById(previousId));
        if (selected && !products.some(product => product.id === selected.id)) products.unshift(selected);
        const placeholder = products.length ? 'Chọn mặt hàng…' : 'Không tìm thấy sản phẩm';
        select.innerHTML = `<option value=''>${placeholder}</option>` + products.map(function (product) {
          return `<option value='${S.fn.esc(product.id)}'>${S.fn.esc(product.name)} · ${S.fn.esc(product.sku)}</option>`;
        }).join('');
        select.value = selected?.id || '';
        for (const product of products) {
          const position = S.state.store.products.findIndex(item => item.id === product.id);
          if (position === -1) S.state.store.products.push(product);
          else S.state.store.products[position] = product;
        }
        if (result.purchasePacksSupported === true) S.state.purchasePacksSupported = true;
        const needsPackOptions = S.state.purchasePacksSupported && !row.querySelector('[data-purchase-mode]');
        if (needsPackOptions) select.closest('label').insertAdjacentHTML('afterend', S.fn.renderReceivePackControls(row.dataset.index, selected?.unit || 'cái'));
        // Repeating a search must not replace a price or pack the user edited.
        if (row.dataset.photoLine !== undefined && selected) input.form.receivePhotoProducts?.set(selected.id, selected);
        if (row.dataset.photoLine !== undefined && select.value !== previousId) row.querySelector('[data-photo-unit]').checked = false;
        if (row.dataset.photoLine === undefined && (select.value !== previousId || (needsPackOptions && !row.querySelector('[data-purchase-cost]').value))) {
          S.fn.setReceivePackMode(row, selected, true);
        }
        S.fn.updateReceivePurchaseTotal(input.form);
      } catch (error) {
        if (!canApply()) return;
        if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
        else S.fn.toast('Chưa tìm được sản phẩm', error.message, 'error');
      }
    }, 250);
  }


  S.fn.openReceive = async function openReceive(productId) {
    const pending = S.fn.loadPendingPurchase();
    if (!S.state.warehouses.length && !pending?.payload.warehouseId) {
      const generation = S.state.modalGeneration, session = S.state.authSession, openedOn = S.state.page;
      await S.fn.loadWarehouses({ includeTransfers: false });
      if (generation !== S.state.modalGeneration || session !== S.state.authSession || openedOn !== S.state.page) return;
      if (!S.state.warehouses.length) return S.fn.toast('Chưa tải được kho', 'Thử lại khi danh sách kho đã sẵn sàng.', 'error');
    }
    const pendingItems = pending
      ? (Array.isArray(pending.payload.items) ? pending.payload.items : [{ productId: pending.payload.productId, quantity: pending.payload.quantity, unitCostVnd: pending.payload.unitCostVnd }])
      : null;
    const product = S.fn.productById(productId);
    const initialItems = pendingItems || [{ productId: product?.id || '', quantity: '1' }];
    const disabled = pending ? 'disabled' : '';
    const defaultWarehouseId = (S.state.warehouses.find(function (item) { return item.is_default; }) || {}).id || '';
    const receiveWarehouseId = pending ? (pending.payload.warehouseId || defaultWarehouseId) : (S.state.selectedWarehouseId || defaultWarehouseId);
    const receiveWarehouseOptions = S.state.warehouses.map(function (warehouse) { return `<option value='${S.fn.esc(warehouse.id)}' ${warehouse.id === receiveWarehouseId ? 'selected' : ''}>${S.fn.esc(S.fn.warehouseOptionName(warehouse))}</option>`; }).join('');
    const warehouseField = S.state.warehouses.length > 1
      ? `<div class='form-field full'><label class='input-label' for='purchase-warehouse'>Kho nhận hàng *</label><div class='select-wrap'><select class='input' id='purchase-warehouse' name='warehouseId' required ${disabled}>${receiveWarehouseOptions}</select></div></div>`
      : `<input type='hidden' name='warehouseId' value='${S.fn.esc(receiveWarehouseId)}'/>`;
    const paid = pending?.payload.amountPaidVnd || 0;
    const form = `<form id='entity-form' data-form='receive' class='receive-receipt'>${S.state.warehouses.length > 1 ? `<div class='form-grid'>${warehouseField}</div>` : warehouseField}
      <section class='receive-section' aria-labelledby='receive-items-heading'><h3 id='receive-items-heading'>Hàng vừa nhận</h3>
        ${pending ? '' : `<div class='receive-ai-toolbar'><button class='btn btn-secondary' type='button' data-action='receive-ai-invoice'>Đọc ảnh phiếu nhập</button><input type='file' id='receive-ai-invoice-input' accept='image/*' hidden/><div id='receive-ai-status' class='receive-ai-status' role='status' hidden></div><div data-receive-ai-review hidden></div></div><div class='receive-scan-bar'><div class='receive-scan-row'><label class='input-label' for='receive-barcode-scan'>Quét nhanh bằng mã vạch / SKU</label><button class='btn btn-secondary' type='button' data-action='toggle-receive-camera'>${S.fn.icon('scan', 16)} Quét camera</button></div><input class='input' id='receive-barcode-scan' type='search' placeholder='Quét máy tít hoặc nhập mã rồi bấm Enter để thêm hoặc +1 SL' autocomplete='off'/><section class='editor-barcode-camera' data-scan-surface data-scan-mode='receive-cart' data-scan-target='receive-barcode-scan' hidden><div class='scan-camera-stage'><video id='scan-camera-video' playsinline muted hidden aria-label='Camera quét nhanh nhập kho'></video><div class='scan-feedback-pill' data-scan-pill hidden></div></div><p id='scan-camera-status' role='status' aria-live='polite'></p><div class='scan-camera-actions'><label class='scan-continuous-toggle'><input type='checkbox' data-scan-continuous checked/><span>Quét liên tiếp</span></label><button class='btn btn-secondary' type='button' data-action='stop-receive-camera'>Đóng camera</button></div></section></div>`}
        <details data-receive-lines open><summary>Chi tiết mặt hàng</summary><div id='purchase-lines'>${S.fn.renderReceivePurchaseLines(initialItems, disabled)}</div></details>
        ${pending ? '' : `<button class='btn btn-secondary' type='button' data-action='add-purchase-line'>＋ Thêm mặt hàng</button>`}</section>
      <section class='receive-section' aria-labelledby='receive-payment-heading'><h3 id='receive-payment-heading'>Thanh toán và nhà cung cấp</h3>
        <div class='purchase-total'><span>Tổng tiền hàng</span><strong id='purchase-total'>—</strong><small id='purchase-total-note' role='status' hidden></small></div>
        <div class='form-grid'>
          <label class='form-field'><span class='input-label'>Tình trạng thanh toán</span><select class='input' id='receive-payment-state' name='paymentState' required ${disabled}><option value='' disabled>Chọn tình trạng thanh toán</option><option value='unpaid' selected>Chưa thanh toán · Ghi nợ</option><option value='full'>Đã thanh toán</option><option value='partial' ${Number(paid) > 0 ? 'selected' : ''}>Đã trả một phần</option></select></label>
          <label class='form-field' id='receive-paid-field' hidden><span class='input-label'>Số tiền đã trả (đ)</span><input class='input' name='paid' type='number' min='0' step='1' value='${S.fn.esc(paid)}' ${disabled}/></label>
          <label class='form-field' data-receive-method><span class='input-label'>Hình thức trả</span><select class='input' name='method' ${disabled}><option value='' disabled>Chọn hình thức trả</option>${['cash', 'bank_transfer', 'bank_qr', 'card', 'other'].filter(value => ['cash', 'bank_transfer'].includes(value) || value === pending?.payload.method).map(value => `<option value='${value}' ${(pending?.payload.method || 'cash') === value ? 'selected' : ''}>${S.fn.esc(S.fn.cashMethodName(value))}</option>`).join('')}</select></label>
          <div class='form-field full' id='receive-supplier-field'><label class='input-label' for='receive-supplier-name'>Nhà cung cấp <span data-receive-supplier-required hidden>*</span></label><input id='receive-supplier-name' class='input' name='supplierName' type='search' maxlength='160' value='${S.fn.esc(pending?.payload.supplierName || '')}' placeholder='Tìm theo tên hoặc thêm mới' autocomplete='off' ${disabled}/><div class='finance-party-options' data-receive-suppliers hidden></div></div>
          <label class='form-field full'><span class='input-label'>Ghi chú</span><input class='input' name='note' maxlength='500' value='${S.fn.esc(pending?.payload.note || '')}' placeholder='Không bắt buộc' ${disabled}/></label>
        </div></section>
      ${pending ? '<p class="modal-note">Phiếu nhập đang chờ xác nhận. Gửi lại cùng nội dung để tránh cộng tồn hai lần.</p>' : ''}</form>`;
    S.fn.showModal(pending ? 'Kiểm tra phiếu nhập đang chờ' : 'Nhận hàng vào kho', '', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại phiếu nhập' : 'Xác nhận nhập kho'}</button>`, true);
    const element = S.dom.modal.querySelector('[data-form="receive"]');
    if (!pending) {
      S.fn.setupReceiveSuppliers(element);
      const refreshPhoto = () => { if (element.receivePhoto) S.fn.updateReceivePurchaseTotal(element); };
      element.addEventListener('change', refreshPhoto);
      element.addEventListener('input', event => {
        if (event.target.matches('[name="paid"], [name="supplierName"]')) refreshPhoto();
      });
      element.addEventListener('invalid', event => {
        const details = event.target.closest('[data-receive-lines]');
        if (details) details.open = true;
      }, true);
      element.addEventListener('click', event => {
        const create = event.target.closest('[data-receive-create]');
        if (create) openReceivePhotoProduct(element, create.closest('[data-photo-line]'));
      });

      if (!S.state.store.products.length || !S.state.purchasePacksSupported) S.fn.searchReceiveProducts(element.querySelector('[data-purchase-search]'));
      element.elements.paid.addEventListener('input', event => event.target.setCustomValidity(''));
      element.elements.paymentState.addEventListener('change', () => {
        element.receivePaymentEdited = true;
        element.elements.paid.setCustomValidity('');
        element.elements.supplierName.setCustomValidity('');
      });
    }
    S.fn.updateReceivePurchaseTotal(element);
  }


  S.fn.setupReceiveSuppliers = function setupReceiveSuppliers(form) {
    const field = form.elements.supplierName;
    const list = form.querySelector('[data-receive-suppliers]');
    const nameKey = name => name.trim().normalize('NFKC').toLocaleLowerCase('vi');
    let suppliers = S.state.store.suppliers.slice();
    function showChoices() {
      const name = field.value.trim();
      const query = nameKey(name);
      const matches = suppliers.filter(item => nameKey(item.name).includes(query));
      list.innerHTML = matches.slice(0, 8).map(item => `<button type='button' class='link-button' data-receive-supplier='${S.fn.esc(item.id)}'>${S.fn.esc(item.name)}</button>`).join('') +
        (name && !matches.some(item => nameKey(item.name) === query) ? `<button type='button' class='link-button' data-receive-supplier-new>＋ Thêm “${S.fn.esc(name)}”</button>` : '');
      list.hidden = !list.children.length;
    }
    field.addEventListener('focus', () => { if (!form.receiveSupplier) showChoices(); });
    field.addEventListener('input', () => { form.receiveSupplier = null; field.setCustomValidity(''); showChoices(); });
    form.querySelector('#receive-supplier-field').addEventListener('focusout', event => { if (!event.currentTarget.contains(event.relatedTarget)) list.hidden = true; });
    list.addEventListener('click', event => {
      const button = event.target.closest('[data-receive-supplier], [data-receive-supplier-new]');
      if (!button) return;
      const saved = suppliers.find(item => item.id === button.dataset.receiveSupplier);
      form.receiveSupplier = { id: saved?.local ? '' : saved?.id || '', name: saved?.name || field.value.trim() };
      field.value = form.receiveSupplier.name;
      field.setCustomValidity('');
      list.hidden = true;
      field.focus();
    });
    S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/purchase-suppliers`).then(result => {
      if (!form.isConnected) return;
      const knownNames = new Set(result.suppliers.map(item => nameKey(item.name)));
      suppliers = [...result.suppliers, ...suppliers.filter(item => item.local && !knownNames.has(nameKey(item.name)))];
      if (document.activeElement === field && !form.receiveSupplier && !field.disabled) showChoices();
    }).catch(() => {});
  }


  S.fn.renderReceivePackControls = function renderReceivePackControls(index, unit, pack, disabled = '') {
    const packed = Boolean(pack);
    return `<div class='form-field full'><label class='input-label' for='purchase-mode-${index}'>Cách nhận hàng</label><select class='input' id='purchase-mode-${index}' data-purchase-mode ${disabled}><option value='loose' ${packed ? '' : 'selected'}>Nhận từng ${S.fn.esc(unit)}</option><option value='pack' ${packed ? 'selected' : ''}>Nhận theo lô, hộp hoặc thùng</option></select></div><div class='form-field full' data-purchase-pack-fields ${packed ? '' : 'hidden'}><div class='form-grid'><label class='form-field'><span class='input-label'>Tên đơn vị nhập</span><input class='input' data-pack-name value='${S.fn.esc(pack?.name || 'lô')}' placeholder='Lô, hộp, thùng…' maxlength='40' ${packed ? 'required' : ''} ${disabled}/></label><label class='form-field'><span class='input-label'>Mỗi đơn vị có bao nhiêu ${S.fn.esc(unit)}?</span><input class='input' data-pack-size type='number' min='1' max='1000000' step='1' inputmode='numeric' value='${S.fn.esc(pack?.size || '')}' ${packed ? 'required' : ''} ${disabled}/></label></div><small>Nhớ cách nhập này cho lần sau.</small></div>`;
  }


  S.fn.renderReceivePurchaseLines = function renderReceivePurchaseLines(items, disabled, form) {
    return items.map(function (item, index) {
      const product = S.fn.productById(item.productId) || form?.receivePhotoProducts?.get(item.productId);
      const savedPack = window.SlinkPurchaseUnits.isPackName(product?.purchasePack?.name) ? product.purchasePack : null;
      const pack = item.pack || (item.packMode !== false && savedPack ? { ...savedPack, quantity: item.quantity || '1' } : null);
      const packed = Boolean(pack);
      const unit = product?.unit || 'cái';
      const priceMode = packed || item.priceMode === 'unit' || (!item.priceMode && item.unitCostVnd != null) ? 'unit' : 'total';
      const packName = packed ? (window.SlinkPurchaseUnits.isPackName(pack.name) ? pack.name : 'đơn vị nhập') : unit;
      const costLabel = priceMode === 'total' ? 'Tổng tiền nhập' : 'Giá 1 ' + packName;
      const amount = pack?.unitCostVnd ?? (priceMode === 'total' ? item.lineTotalVnd : item.unitCostVnd) ?? '';
      const priceField = `<div class='form-field'><label class='form-field' for='purchase-price-${index}'><span class='input-label' data-purchase-cost-label>${S.fn.esc(costLabel)} (đ)</span><input class='input' id='purchase-price-${index}' data-purchase-cost type='number' min='0' step='1' value='${S.fn.esc(amount)}' required ${disabled}/></label>${disabled ? '' : `<button class='link-button' type='button' data-action='toggle-receive-price' ${packed ? 'hidden' : ''}>${priceMode === 'total' ? 'Dùng giá từng ' + S.fn.esc(unit) : 'Dùng tổng tiền'}</button>`}</div>`;
      const options = S.state.store.products.map(candidate => `<option value='${candidate.id}' ${candidate.id === item.productId ? 'selected' : ''}>${S.fn.esc(candidate.name)} · ${S.fn.esc(candidate.sku)}</option>`).join('');
      const selected = item.productId && !S.state.store.products.some(candidate => candidate.id === item.productId) ? `<option value='${S.fn.esc(item.productId)}' selected>${S.fn.esc(product?.name || 'Sản phẩm trên phiếu đang chờ')}</option>` : '';
      const packControls = S.state.purchasePacksSupported || packed ? S.fn.renderReceivePackControls(index, unit, pack, disabled) : '';
      return `<article class='purchase-line-card' data-purchase-line data-index='${index}' ${item.photoLine !== undefined ? `data-photo-line='${item.photoLine}'` : ''} data-price-mode='${priceMode}' data-total-price='${S.fn.esc(item.lineTotalVnd ?? '')}' data-unit-price='${S.fn.esc(item.unitCostVnd ?? '')}'>${item.photoLine !== undefined ? S.fn.receivePhotoLineHeading(item) : ''}${items.length > 1 ? `<div class='purchase-line-head'><strong>Mặt hàng ${S.fn.number(index + 1)}</strong>${disabled ? '' : `<button class='link-button' type='button' data-action='remove-purchase-line' data-index='${index}'>Xóa dòng</button>`}</div>` : ''}<div class='form-grid'>${disabled ? '' : `<label class='form-field full receive-search'><span class='input-label'>Tìm mặt hàng</span><input class='input' data-purchase-search data-index='${index}' type='search' placeholder='Tên, mã hàng hoặc mã vạch…' autocomplete='off'/></label>`}<label class='form-field full'><span class='input-label'>Sản phẩm *</span><select class='input' name='productId' data-purchase-product data-index='${index}' required ${disabled}><option value=''>Chọn mặt hàng…</option>${selected}${options}</select><small data-receive-product-cost hidden></small></label>${packControls}<label class='form-field'><span class='input-label' data-purchase-quantity-label>${packed ? 'Số ' + S.fn.esc(pack.name) + ' nhận' : 'Số lượng nhận (' + S.fn.esc(unit) + ')'}</span><input class='input' data-purchase-quantity name='quantity' type='number' min='0.001' step='0.001' value='${S.fn.esc(pack?.quantity ?? item.quantity ?? '1')}' required ${disabled}/></label>${priceField}<p class='muted full' data-pack-preview hidden aria-live='polite'></p></div></article>`;
    }).join('');
  }


  S.fn.receivePurchaseItemsFromForm = function receivePurchaseItemsFromForm(form) {
    return Array.from(form.querySelectorAll('[data-purchase-line]')).map(function (row) {
      const quantity = String(row.querySelector('[data-purchase-quantity]')?.value || '');
      const price = S.fn.moneyInputRaw(row.querySelector('[data-purchase-cost]').value);
      const packed = row.querySelector('[data-purchase-mode]')?.value === 'pack';
      const priceMode = row.dataset.priceMode;
      const unitCostVnd = priceMode === 'unit' ? price : row.dataset.unitPrice;
      const lineTotalVnd = priceMode === 'total' ? price : row.dataset.totalPrice;
      return {
        productId: String(row.querySelector('[data-purchase-product]')?.value || ''), quantity, unitCostVnd, lineTotalVnd, priceMode, packMode: packed,
        ...(row.dataset.photoLine !== undefined ? {
          photoLine: Number(row.dataset.photoLine),
          sourceLabel: row.querySelector('[data-photo-source]').textContent,
          unitConfirmed: row.querySelector('[data-photo-unit]')?.checked === true,
        } : {}),
        ...(packed ? { pack: { name: row.querySelector('[data-pack-name]').value.trim(), size: row.querySelector('[data-pack-size]').value, quantity, unitCostVnd } } : {}),
      };
    });
  }


  S.fn.setReceivePackMode = function setReceivePackMode(row, product, useSaved) {
    const mode = row.querySelector('[data-purchase-mode]');
    const saved = product?.purchasePack;
    const named = window.SlinkPurchaseUnits.isPackName(saved?.name);
    if (useSaved && mode) mode.value = named ? 'pack' : 'loose';
    const packed = mode?.value === 'pack';
    const fields = row.querySelector('[data-purchase-pack-fields]');
    if (fields) {
      fields.hidden = !packed;
      fields.querySelectorAll('input').forEach(input => { input.required = packed; input.disabled = !packed; });
      const size = row.querySelector('[data-pack-size]');
      size.closest('label').querySelector('.input-label').textContent = 'Mỗi đơn vị có bao nhiêu ' + (product?.unit || 'cái') + '?';
      if (useSaved) {
        row.querySelector('[data-pack-name]').value = named ? saved.name : (saved ? '' : 'lô');
        size.value = saved?.size || '';
      }
    }
    row.dataset.priceMode = packed ? 'unit' : 'total';
    row.dataset.totalPrice = '';
    row.dataset.unitPrice = '';
    row.querySelector('[data-purchase-cost]').value = window.SlinkMoneyFields.format(packed ? saved?.unitCostVnd || '' : '');
  }


  S.fn.toggleReceivePurchasePrice = function toggleReceivePurchasePrice(button) {
    const row = button.closest('[data-purchase-line]');
    const input = row.querySelector('[data-purchase-cost]');
    const current = row.dataset.priceMode;
    const next = current === 'total' ? 'unit' : 'total';
    row.dataset[current + 'Price'] = S.fn.moneyInputRaw(input.value);
    row.dataset.priceMode = next;
    input.value = window.SlinkMoneyFields.format(row.dataset[next + 'Price']);
    S.fn.updateReceivePurchaseTotal(input.form);
    input.focus();
  }


  S.fn.normalizeReceivePurchaseLine = function normalizeReceivePurchaseLine(item, allowLegacyPack = false) {
    if (item.pack && !allowLegacyPack && !window.SlinkPurchaseUnits.isPackName(item.pack.name)) throw new Error('Ghi tên đơn vị nhập, ví dụ Thùng, Hộp hoặc Ram.');
    const packed = item.pack ? window.SlinkPurchaseUnits.fromPack(item.pack) : null;
    const quantity = packed?.quantity || item.quantity;
    if (!/^(0|[1-9]\d{0,9})(?:\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0 || Number(quantity) > 1_000_000_000) {
      throw new Error('Nhập số lượng lớn hơn 0, tối đa 3 chữ số thập phân.');
    }
    const milli = BigInt(window.SlinkOfflineLedger.quantity(quantity));
    const totalMode = item.priceMode === 'total' && !packed;
    const price = packed?.pack.unitCostVnd ?? (totalMode ? item.lineTotalVnd : item.unitCostVnd);
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    if (!/^(0|[1-9]\d{0,15})$/.test(price) || BigInt(price) > max) throw new Error('Nhập số tiền bằng đồng, không có phần lẻ.');
    const unitCost = packed?.unitCostVnd ?? (totalMode ? window.SlinkPurchaseUnits.unitCostFromTotal(price, milli) : BigInt(price));
    const total = packed?.lineTotalVnd ?? (totalMode ? BigInt(price) : window.SlinkOfflineLedger.lineTotal(price, milli));
    if (unitCost > max || total > max) throw new Error('Số tiền quá lớn. Chia thành phiếu nhỏ hơn.');
    const payload = { productId: item.productId, quantity };
    if (totalMode) payload.lineTotalVnd = price;
    else payload.unitCostVnd = Number(unitCost);
    if (packed) payload.pack = packed.pack;
    return { payload, total, unitCost, milli };
  }


  S.fn.updateReceivePurchaseTotal = function updateReceivePurchaseTotal(form) {
    const output = form && form.querySelector('#purchase-total');
    if (!output) return;
    const note = form.querySelector('#purchase-total-note');
    const explain = message => {
      output.textContent = '—';
      note.textContent = message;
      note.hidden = false;
    };
    const rows = form.querySelectorAll('[data-purchase-line]');
    let total = 0n;
    let incomplete = false;
    const seenProducts = new Set();
    S.fn.receivePurchaseItemsFromForm(form).forEach((item, index) => {
      const row = rows[index], product = S.fn.productById(item.productId) || form.receivePhotoProducts?.get(item.productId), unit = product?.unit || 'cái';
      const lastCost = row.querySelector('[data-receive-product-cost]');
      lastCost.hidden = !product;
      if (product) lastCost.textContent = `Đơn vị ${unit} · Giá vốn hiện tại ${S.fn.moneyVndText(product.cost)} / ${unit}`;
      const packName = window.SlinkPurchaseUnits.isPackName(item.pack?.name) ? item.pack.name : 'đơn vị nhập';
      const totalMode = item.priceMode === 'total' && !item.pack;
      const mode = row.querySelector('[data-purchase-mode]');
      if (mode) mode.options[0].textContent = 'Nhận từng ' + unit;
      row.querySelector('[data-purchase-quantity-label]').textContent = item.pack ? 'Số ' + packName + ' nhận' : 'Số lượng nhận (' + unit + ')';
      row.querySelector('[data-purchase-cost-label]').textContent = (totalMode ? 'Tổng tiền nhập' : 'Giá 1 ' + (item.pack ? packName : unit)) + ' (đ)';
      const switcher = row.querySelector('[data-action="toggle-receive-price"]');
      if (switcher) {
        switcher.hidden = Boolean(item.pack);
        switcher.textContent = totalMode ? 'Dùng giá từng ' + unit : 'Dùng tổng tiền';
      }
      const preview = row.querySelector('[data-pack-preview]');
      preview.hidden = true;
      try {
        if (!item.productId || seenProducts.has(item.productId)) throw new Error('incomplete');
        seenProducts.add(item.productId);
        const line = S.fn.normalizeReceivePurchaseLine(item, row.querySelector('[data-purchase-product]').disabled);
        total += line.total;
        const rounded = line.total * 1000n !== line.unitCost * line.milli;
        if (item.pack) preview.textContent = `Nhận ${S.fn.number(Number(line.payload.quantity))} ${unit} · ${S.fn.moneyVndText(line.total)}`;
        else if (totalMode) preview.textContent = `${rounded ? 'Khoảng ' : ''}${S.fn.moneyVndText(line.unitCost)} / ${unit}`;
        else preview.textContent = `Thành tiền ${S.fn.moneyVndText(line.total)}`;
        preview.hidden = false;
      } catch (_) { incomplete = true; }
    });
    const mode = form.querySelector('[name="paymentState"]')?.value;
    const paid = form.querySelector('[name="paid"]');
    paid?.setCustomValidity('');
    const methodField = form.querySelector('[data-receive-method]');
    if (methodField) {
      const needsMethod = mode === 'full' || mode === 'partial';
      methodField.hidden = !needsMethod;
      if (!methodField.querySelector('select').disabled) methodField.querySelector('select').required = needsMethod;
    }
    const supplierRequired = form.querySelector('[data-receive-supplier-required]');
    if (supplierRequired) supplierRequired.hidden = mode === 'full';
    const paidField = form.querySelector('#receive-paid-field');
    if (paidField) paidField.hidden = mode !== 'partial';
    const tooLarge = total > BigInt(Number.MAX_SAFE_INTEGER);
    if (paid) {
      if (form.receivePaymentMode === 'partial' && mode !== 'partial') form.partialPaid = paid.value;
      if (mode === 'unpaid') paid.value = '0';
      else if (mode === 'full') paid.value = incomplete || tooLarge ? '' : window.SlinkMoneyFields.format(String(total));
      else if (form.receivePaymentMode && form.receivePaymentMode !== 'partial') paid.value = form.partialPaid || '';
      form.receivePaymentMode = mode;
    }
    if (incomplete || tooLarge) {
      explain(tooLarge ? 'Số tiền quá lớn. Chia thành phiếu nhỏ hơn.' : 'Chọn hàng, nhập số lượng và số tiền.');
      S.fn.updateReceivePhotoSummary(form, null);
      return;
    }
    output.textContent = S.fn.moneyVndText(total);
    note.textContent = '';
    note.hidden = true;
    S.fn.updateReceivePhotoSummary(form, total);
  }


  S.fn.redrawReceivePurchaseLines = function redrawReceivePurchaseLines(form, items) {
    const container = form.querySelector('#purchase-lines');
    if (container) container.innerHTML = S.fn.renderReceivePurchaseLines(items, false, form);
    S.fn.updateReceivePurchaseTotal(form);
  }


  S.fn.addReceivePurchaseLine = function addReceivePurchaseLine() {
    const form = S.dom.modal.querySelector('[data-form="receive"]');
    if (!form) return;
    const items = S.fn.receivePurchaseItemsFromForm(form);
    if (items.length >= 50) return S.fn.toast('Đã đạt giới hạn dòng hàng', 'Mỗi phiếu nhập hỗ trợ tối đa 50 mặt hàng.', 'error');
    items.push({ productId: '', quantity: '1', unitCostVnd: '' });
    S.fn.redrawReceivePurchaseLines(form, items);
  }


  S.fn.removeReceivePurchaseLine = function removeReceivePurchaseLine(index) {
    const form = S.dom.modal.querySelector('[data-form="receive"]');
    if (!form) return;
    const items = S.fn.receivePurchaseItemsFromForm(form);
    if (items.length <= 1) return;
    items.splice(index, 1);
    S.fn.redrawReceivePurchaseLines(form, items);
  }


  S.fn.openInventoryBarcode = function openInventoryBarcode() {
    const body = `<form id='entity-form' data-form='inventory-scan'>
      <div class='scan-camera-panel' data-scan-surface data-scan-mode='warehouse-search' data-scan-target='inventory-scan-code'>
        <div class='scan-camera-stage'><div class='scan-camera-prompt' aria-hidden='true'>${S.fn.icon('scan', 28)}<strong>Đặt mã vào khung</strong></div>
          <video id='scan-camera-video' class='scan-camera-video' playsinline muted hidden aria-label='Camera quét mã vạch'></video>
          <div class='scan-viewfinder' aria-hidden='true'><i></i><i></i><i></i><i></i></div></div>
        <p id='scan-camera-status' class='scan-camera-status' role='status'></p>
        <button class='btn btn-secondary' type='button' data-action='start-camera-scan'>Mở camera</button>
        <details class='scan-manual-entry'><summary>Nhập mã thủ công</summary><div class='editor-input-action' style='margin-top:8px'><input id='inventory-scan-code' class='input' maxlength='80' autocomplete='off' inputmode='text' placeholder='Nhập mã vạch…'/><button class='btn btn-primary' type='submit'>Tìm</button></div></details>
      </div></form>`;
    S.fn.showModal('Quét mã tìm kho', '', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button>`);
    const form = S.dom.modal.querySelector('[data-form="inventory-scan"]');
    form.addEventListener('submit', event => {
      event.preventDefault();
      event.stopPropagation();
      S.fn.searchInventoryBarcode(form.querySelector('#inventory-scan-code').value);
    });
    S.fn.startScanCamera(form.querySelector('[data-action="start-camera-scan"]'));
  }


  S.fn.searchInventoryBarcode = function searchInventoryBarcode(value) {
    const code = value.trim();
    if (!code || S.state.page !== 'inventory') return;
    S.fn.closeModal();
    S.state.inventoryStockFilter = 'all';
    S.state.searchTerms.inventory = code;
    S.dom.root.querySelectorAll('[data-stock]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.stock === 'all')));
    S.fn.loadInventoryPage(code, 0, { keepSearch: true });
  }


  S.fn.handleReceiveBarcodeScan = async function handleReceiveBarcodeScan(input) {
    const form = input?.closest('[data-form="receive"]');
    const rawValue = String(input?.value || '').trim();
    if (!form || !rawValue || form.dataset.barcodeScanning === 'true') return;
    const { quantityStep, code } = S.fn.parseBarcodeScanMultiplier(rawValue);
    if (!code) return;
    const requestStoreId = S.state.store.id;
    const requestSession = S.state.authSession;
    const requestGeneration = S.state.modalGeneration;
    form.dataset.barcodeScanning = 'true';
    try {
      let matched;
      try {
        matched = await S.fn.findProductByBarcodeOrSku(code);
      } catch (error) {
        if (S.state.store.id === requestStoreId && S.state.authSession === requestSession && S.state.modalGeneration === requestGeneration && !S.dom.modal.hidden && form.isConnected) {
          S.fn.toast('Chưa tìm được mã vạch', error.message, 'error');
        }
        return;
      }
      if (S.state.store.id !== requestStoreId || S.state.authSession !== requestSession || S.state.modalGeneration !== requestGeneration || S.dom.modal.hidden || !form.isConnected) return;
      let missingBox = form.querySelector('[data-receive-missing-barcode]');
      if (!matched) {
        input.select?.();
        if (!missingBox) {
          missingBox = document.createElement('div');
          missingBox.setAttribute('data-receive-missing-barcode', '');
          missingBox.className = 'notice-item';
          missingBox.style.marginTop = '8px';
          input.closest('.receive-scan-bar')?.appendChild(missingBox);
        }
        missingBox.innerHTML = `<span>${S.fn.icon('scan', 16)}</span><span><strong>Mã “${S.fn.esc(code)}” chưa có trong danh mục</strong><small>Bạn có thể tạo nhanh mặt hàng mới với sẵn mã vạch này.</small></span><button class='btn btn-secondary' type='button' data-action='quick-create-from-receive' data-barcode='${S.fn.esc(code)}'>＋ Tạo mặt hàng mới</button>`;
        missingBox.hidden = false;
        S.fn.toast('Không khớp mã vạch', `Chưa tìm thấy sản phẩm có mã “${code}”. Bấm “＋ Tạo mặt hàng mới” ngay bên dưới thanh quét để thêm nhanh.`, 'error');
        return null;
      }
      if (missingBox) missingBox.hidden = true;
      const items = S.fn.receivePurchaseItemsFromForm(form);
      const existingIndex = items.findIndex(function (item) { return item.productId === matched.id; });
      const costText = matched.cost != null ? String(matched.cost) : '';
      if (existingIndex >= 0) {
        items[existingIndex].quantity = S.fn.incrementScanQuantity(items[existingIndex].quantity, quantityStep);
        if (items[existingIndex].pack) items[existingIndex].pack.quantity = items[existingIndex].quantity;
      } else if (items.length === 1 && !items[0].productId && items[0].photoLine === undefined) {
        items[0] = { productId: matched.id, quantity: String(quantityStep), unitCostVnd: costText };
      } else {
        if (items.length >= 50) { S.fn.toast('Đã đạt giới hạn dòng hàng', 'Mỗi phiếu nhập hỗ trợ tối đa 50 mặt hàng.', 'error'); return null; }
        items.push({ productId: matched.id, quantity: String(quantityStep), unitCostVnd: costText });
      }
      S.fn.redrawReceivePurchaseLines(form, items);
      input.value = '';
      input.focus();
      S.fn.toast('Đã thêm vào phiếu nhập', `${matched.name} (+${S.fn.number(quantityStep)}) · mã ${matched.barcode || matched.sku}`);
      return matched;
    } finally {
      delete form.dataset.barcodeScanning;
    }
  }


  S.fn.handleTransferBarcodeScan = async function handleTransferBarcodeScan(input) {
    const form = input?.closest('[data-form="warehouse-transfer-create"]');
    const container = form?.querySelector('#warehouse-transfer-lines');
    const code = String(input?.value || '').trim();
    if (!form || !container || !code || form.dataset.barcodeScanning === 'true') return;
    const requestStoreId = S.state.store.id;
    const requestSession = S.state.authSession;
    const requestGeneration = S.state.modalGeneration;
    form.dataset.barcodeScanning = 'true';
    try {
      let matched;
      try {
        matched = await S.fn.findProductByBarcodeOrSku(code);
      } catch (error) {
        if (S.state.store.id === requestStoreId && S.state.authSession === requestSession && S.state.modalGeneration === requestGeneration && !S.dom.modal.hidden && form.isConnected) {
          S.fn.toast('Chưa tìm được mã vạch', error.message, 'error');
        }
        return;
      }
      if (S.state.store.id !== requestStoreId || S.state.authSession !== requestSession || S.state.modalGeneration !== requestGeneration || S.dom.modal.hidden || !form.isConnected) return;
      if (!matched) {
        input.select?.();
        return S.fn.toast('Không khớp mã vạch', `Chưa tìm thấy sản phẩm có mã “${code}”.`, 'error');
      }
      if (!matched.inventoryTracked) return S.fn.toast('Không theo dõi tồn kho', `${matched.name} không tham gia điều chuyển kho.`, 'error');
      const lines = Array.from(container.querySelectorAll('[data-transfer-line]'));
      const existing = lines.find(function (row) { return row.querySelector('[name="productId"]')?.value === matched.id; });
      if (existing && container.dataset.transferTouched === 'true') {
        const qtyInput = existing.querySelector('[name="quantity"]');
        if (qtyInput) qtyInput.value = S.fn.incrementScanQuantity(qtyInput.value);
      } else if (lines.length === 1 && container.dataset.transferTouched !== 'true') {
        lines[0].outerHTML = S.fn.transferLineHtml({ productId: matched.id, quantity: '1' }, 0, false);
        container.dataset.transferTouched = 'true';
      } else {
        if (lines.length >= 100) return S.fn.toast('Đã đạt giới hạn dòng hàng', 'Mỗi phiếu hỗ trợ tối đa 100 mặt hàng.', 'error');
        const nextIndex = lines.reduce(function (maxIdx, el) { return Math.max(maxIdx, Number(el.dataset.index) || 0); }, -1) + 1;
        container.insertAdjacentHTML('beforeend', S.fn.transferLineHtml({ productId: matched.id, quantity: '1' }, nextIndex, false));
        container.dataset.transferTouched = 'true';
      }
      input.value = '';
      input.focus();
      S.fn.toast('Đã thêm vào phiếu chuyển', `${matched.name} · mã ${matched.barcode || matched.sku}`);
    } finally {
      delete form.dataset.barcodeScanning;
    }
  }


  S.fn.renderRapidStockCountRows = function renderRapidStockCountRows() {
    const list = S.dom.modal.querySelector('[data-stock-count-list]');
    const summaryEl = S.dom.modal.querySelector('[data-stock-count-summary]');
    const items = S.state.rapidStockCountState.items || [];
    const totalCounted = items.reduce((s, r) => s + Number(r.counted || 0), 0);
    if (summaryEl) {
      summaryEl.innerHTML = `<span>Đã quét <strong>${S.fn.number(items.length)}</strong> mặt hàng · Tổng đếm <strong>${S.fn.number(totalCounted)}</strong></span><button class='link-button' type='button' data-action='clear-rapid-stock-count' ${items.length ? '' : 'hidden'}>Làm trống</button>`;
    }
    if (!list) return;
    if (!items.length) {
      list.innerHTML = `<div class='empty-state'><strong>Chưa quét sản phẩm nào</strong><span>Đưa mã vạch vào khung camera hoặc nhập mã ở trên để tự cộng +1 mỗi lần quét.</span></div>`;
      return;
    }
    list.innerHTML = items.map(function (row, idx) {
      const diff = Math.round((Number(row.counted) - Number(row.systemStock)) * 1000) / 1000;
      const diffLabel = diff === 0 ? 'Khớp hệ thống' : (diff > 0 ? `Thừa +${S.fn.number(diff)}` : `Thiếu ${S.fn.number(diff)}`);
      return `<article class='stock-count-row' data-stock-count-row='${S.fn.esc(row.productId)}'>
        <div>
          <strong>${S.fn.esc(row.name)}</strong>
          <small style='display:block;color:var(--muted)'>${S.fn.esc(row.sku)} · Hệ thống: ${S.fn.number(row.systemStock)} ${S.fn.esc(row.unit)} · <b>${S.fn.esc(diffLabel)}</b></small>
        </div>
        <div class='stock-count-qty'>
          <button class='btn btn-secondary' type='button' data-action='rapid-count-delta' data-index='${idx}' data-delta='-1' aria-label='Giảm 1'>−</button>
          <input class='input' type='number' min='0' step='0.001' data-rapid-count-input='${idx}' value='${S.fn.esc(String(row.counted))}' aria-label='Số thực đếm ${S.fn.esc(row.name)}'/>
          <button class='btn btn-secondary' type='button' data-action='rapid-count-delta' data-index='${idx}' data-delta='1' aria-label='Tăng 1'>+</button>
        </div>
      </article>`;
    }).join('');
  }


  S.fn.resolveRapidStockCountProduct = async function resolveRapidStockCountProduct(rawCode) {
    const code = String(rawCode || '').trim();
    if (!code) return { ok: false, reason: 'Mã trống.' };
    const whId = S.state.rapidStockCountState.warehouseId || S.state.selectedWarehouseId;
    let matched = (S.state.inventoryWarehouseId === whId ? S.fn.findExactBarcodeMatch(S.state.inventoryProducts, code) : null)
      || S.fn.findExactBarcodeMatch(S.state.rapidStockCountState.products, code);
    if (!matched && S.state.store.id && navigator.onLine) {
      const warehouseQuery = whId ? `&warehouseId=${encodeURIComponent(whId)}` : '';
      const res = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products?limit=20&q=${encodeURIComponent(code)}${warehouseQuery}`, { preferFresh: true });
      const mapped = (res.products || []).map(S.fn.mapProduct);
      mapped.forEach(p => {
        if (!S.state.rapidStockCountState.products.some(x => x.id === p.id)) S.state.rapidStockCountState.products.push(p);
      });
      matched = S.fn.findExactBarcodeMatch(mapped, code);
    }
    if (!matched) return { ok: false, reason: `Không tìm thấy sản phẩm mã “${code}”.` };
    if (matched.serialTracked) return { ok: false, reason: `${matched.name} quản lý theo Serial — không dùng kiểm kê nhanh.` };
    if (!matched.inventoryTracked) return { ok: false, reason: `${matched.name} không theo dõi tồn kho.` };
    return { ok: true, product: matched };
  }


  S.fn.handleRapidStockCountScan = async function handleRapidStockCountScan(rawCode) {
    const res = await S.fn.resolveRapidStockCountProduct(rawCode);
    if (!res.ok) return res;
    const p = res.product;
    const existing = S.state.rapidStockCountState.items.find(r => r.productId === p.id);
    if (existing) {
      existing.counted = Math.round((Number(existing.counted || 0) + 1) * 1000) / 1000;
    } else {
      if (S.state.rapidStockCountState.items.length >= 200) {
        return { ok: false, reason: 'Đã đạt giới hạn 200 mặt hàng mỗi phiếu kiểm kho.' };
      }
      S.state.rapidStockCountState.items.unshift({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit || 'cái',
        systemStock: Number(p.stock || 0),
        inventoryVersion: Number(p.inventoryVersion || 1),
        counted: 1,
      });
    }
    S.fn.renderRapidStockCountRows();
    const row = S.state.rapidStockCountState.items.find(r => r.productId === p.id);
    return { ok: true, name: p.name, counted: row.counted };
  }


  S.fn.openRapidStockCount = async function openRapidStockCount() {
    if (!S.fn.hasPerm('manageInventory')) return S.fn.toast('Không có quyền', 'Tài khoản không có quyền kiểm kê kho.', 'error');
    const whId = S.state.selectedWarehouseId || (S.state.warehouses.find(w => w.is_default) || S.state.warehouses[0] || {}).id || '';
    const whName = S.state.warehouses.find(w => w.id === whId)?.name || 'Kho chính';
    S.state.rapidStockCountState = {
      warehouseId: whId,
      items: [],
      products: S.state.inventoryWarehouseId === whId ? S.state.inventoryProducts.slice() : [],
      loading: false,
      submitting: false,
    };
    const body = `<form id='entity-form' data-form='rapid-stock-count'>
      <div class='stock-count-stage'>
        <div class='scan-camera-panel' data-scan-surface data-scan-mode='stock-count' data-scan-target='rapid-stock-count-input'>
          <div class='scan-camera-stage'>
            <div class='scan-camera-prompt' aria-hidden='true'>${S.fn.icon('scan', 28)}<strong>Quét kiểm kê tại ${S.fn.esc(whName)}</strong></div>
            <video id='scan-camera-video' class='scan-camera-video' playsinline muted hidden aria-label='Camera kiểm kho liên tiếp'></video>
            <div class='scan-viewfinder' aria-hidden='true'><i></i><i></i><i></i><i></i></div>
            <div class='scan-feedback-pill' data-scan-pill hidden></div>
          </div>
          <p id='scan-camera-status' class='scan-camera-status' role='status' aria-live='polite'></p>
          <div class='scan-camera-actions'>
            <button class='btn btn-secondary' type='button' data-action='start-camera-scan'>Mở camera</button>
            <label class='scan-continuous-toggle'><input type='checkbox' data-scan-continuous checked/><span>Quét liên tiếp</span></label>
          </div>
        </div>
        <div class='editor-input-action'>
          <input class='input' id='rapid-stock-count-input' type='search' maxlength='120' autocomplete='off' placeholder='Hoặc nhập / bắn súng mã vạch rồi Enter…'/>
          <button class='btn btn-secondary' type='button' data-action='add-rapid-stock-count-code'>＋ Đếm +1</button>
        </div>
        <div class='stock-count-summary' data-stock-count-summary></div>
        <div class='stock-count-list' data-stock-count-list></div>
        <label class='form-field'><span class='input-label'>Lý do kiểm kê</span><input class='input' name='reason' maxlength='500' value='Kiểm kê nhanh bằng camera' required/></label>
      </div>
    </form>`;
    S.fn.showModal('Quét camera kiểm kho', whName, body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-primary' type='submit' form='entity-form'>Cân bằng tồn kho</button>`, true);
    S.fn.renderRapidStockCountRows();
    if (S.state.inventoryWarehouseId !== whId && whId && navigator.onLine) {
      S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products?limit=100&warehouseId=${encodeURIComponent(whId)}`).then(res => {
        S.state.rapidStockCountState.products = (res.products || []).map(S.fn.mapProduct);
      }).catch(() => {});
    }
    S.fn.startScanCamera(S.dom.modal.querySelector('[data-action="start-camera-scan"]'));
  }


  S.fn.submitRapidStockCount = async function submitRapidStockCount(form) {
    if (S.state.rapidStockCountState.submitting) return;
    const items = S.state.rapidStockCountState.items || [];
    if (!items.length) return S.fn.toast('Chưa có mặt hàng nào được đếm', 'Quét ít nhất 1 sản phẩm trước khi cân bằng kho.', 'error');
    const reason = String(new FormData(form).get('reason') || '').trim() || 'Kiểm kê nhanh bằng camera';
    const submitBtn = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    S.state.rapidStockCountState.submitting = true;
    if (submitBtn) submitBtn.disabled = true;
    try {
      const payload = {
        warehouseId: S.state.rapidStockCountState.warehouseId || S.state.selectedWarehouseId,
        reason,
        items: items.map((row, idx) => ({
          productId: row.productId,
          count: row.counted,
          expectedInventoryVersion: row.inventoryVersion,
          sourceLine: idx + 2,
        })),
      };
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/stock-adjustments/bulk`, {
        method: 'POST',
        headers: { 'idempotency-key': S.fn.newIdempotencyKey() },
        body: payload,
      });
      S.fn.closeModal();
      S.fn.emitSyncDomains(['stock', 'products', 'dashboard'], { source: 'rapid-stock-count' });
      await S.fn.loadInventoryPage(S.state.searchTerms.inventory, S.state.inventoryOffset);
      S.fn.emitSyncDomains(['stock', 'products', 'dashboard'], { source: 'stock-bulk-count' });
      S.fn.render();
      S.fn.toast('Đã cân bằng tồn kho', `${S.fn.number(Number(result.changedCount) || 0)} mặt hàng cập nhật · ${S.fn.number(Number(result.unchangedCount) || 0)} mặt hàng khớp.`);
    } catch (error) {
      S.fn.toast('Chưa cập nhật được kiểm kho', error.message, 'error');
      if (submitBtn?.isConnected) submitBtn.disabled = false;
    } finally {
      S.state.rapidStockCountState.submitting = false;
    }
  }


  S.fn.loadSupplierReturns = async function loadSupplierReturns() {
    if (!S.state.store.id || !window.SlinkReturnsExchangeUI) return;
    S.state.supplierReturnsLoading = true;
    S.state.supplierReturnsError = '';
    if (S.state.page === 'inventory' && S.state.inventoryTab === 'supplier-returns') S.fn.render();
    try {
      const res = await window.SlinkReturnsExchangeUI.listSupplierReturns({
        storeId: S.state.store.id,
        warehouseId: S.state.selectedWarehouseId || undefined,
      });
      S.state.supplierReturnsList = Array.isArray(res.supplierReturns) ? res.supplierReturns : [];
      S.state.supplierReturnsLoading = false;
      if (S.state.page === 'inventory' && S.state.inventoryTab === 'supplier-returns') S.fn.render();
    } catch (error) {
      S.state.supplierReturnsLoading = false;
      S.state.supplierReturnsError = error.message;
      if (S.state.page === 'inventory' && S.state.inventoryTab === 'supplier-returns') S.fn.render();
    }
  }


  S.fn.openSupplierReturnModal = async function openSupplierReturnModal() {
    if (!S.fn.hasPerm('manageInventory') && !S.fn.hasPerm('recordCashbook')) return S.fn.toast('Không có quyền', 'Vai trò của bạn không được lập phiếu trả hàng NCC.', 'error');
    if (!S.state.store.suppliers.length) await S.fn.loadFinancePage();
    if (!S.state.store.suppliers.length) return S.fn.toast('Chưa có nhà cung cấp', 'Hãy thêm hoặc nhập hàng từ nhà cung cấp trước.', 'error');
    const catalog = await S.fn.ensureCatalogProducts();
    if (!catalog.length) return S.fn.toast('Chưa có sản phẩm', 'Thêm hoặc tải danh sách sản phẩm trước khi lập phiếu trả.', 'error');
    const canFinance = S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports');
    const showCost = S.fn.hasPerm('viewCostPrice');
    const supplierOpts = S.state.store.suppliers.map(s => `<option value='${S.fn.esc(s.id)}'>${S.fn.esc(s.name)}</option>`).join('');
    const whOpts = S.state.warehouses.map(w => `<option value='${S.fn.esc(w.id)}' ${w.id === S.state.selectedWarehouseId ? 'selected' : ''}>${S.fn.esc(S.fn.warehouseOptionName(w))}</option>`).join('');
    const prodOpts = catalog.map(p => `<option value='${S.fn.esc(p.id)}' data-cost='${showCost ? (p.cost ?? 0) : 0}'>${S.fn.esc(p.name)} · ${S.fn.esc(p.sku)} (tồn ${S.fn.number(p.stock)})</option>`).join('');
    const defaultCost = showCost ? (catalog[0]?.cost || 0) : 0;
    const srKeyStorage = `slink-sr-key:${S.state.store.id}`;
    const financeFields = canFinance
      ? `<div class='form-field'><label class='input-label' for='sr-cost'>Đơn giá trả (đ)</label><input class='input' id='sr-cost' name='unitCostVnd' value='${defaultCost}'/></div>
        <div class='form-field'><label class='input-label' for='sr-refund'>Tiền NCC hoàn ngay (đ)</label><input class='input' id='sr-refund' name='refundReceivedVnd' value='0'/><small>Để 0 đ nếu trừ thẳng vào công nợ NCC.</small></div>
        <div class='form-field'><label class='input-label' for='sr-method'>Hình thức hoàn</label><select class='input' id='sr-method' name='refundMethod'><option value='cash'>Tiền mặt</option><option value='bank_transfer'>Chuyển khoản</option><option value='bank_qr'>QR ngân hàng</option><option value='card'>Thẻ</option><option value='other'>Khác</option></select></div>`
      : `<div class='form-field full'><div class='modal-note'>Thủ kho xuất trả theo giá vốn hệ thống; Quản lý hoặc Kế toán đối soát khoản hoàn tiền / công nợ NCC.</div></div>`;
    const form = `<form id='entity-form' data-form='supplier-return' data-key-storage='${S.fn.esc(srKeyStorage)}' data-idempotency-key='${S.fn.esc(S.fn.readOrCreatePendingKey(srKeyStorage))}'>
      <div class='form-grid'>
        <div class='form-field'><label class='input-label' for='sr-supplier'>Nhà cung cấp *</label><select class='input' id='sr-supplier' name='supplierId' required>${supplierOpts}</select></div>
        <div class='form-field'><label class='input-label' for='sr-warehouse'>Kho xuất trả *</label><select class='input' id='sr-warehouse' name='warehouseId' required>${whOpts}</select></div>
        <div class='form-field full'><label class='input-label' for='sr-product'>Sản phẩm trả lại *</label><select class='input' id='sr-product' name='productId' required>${prodOpts}</select></div>
        <div class='form-field'><label class='input-label' for='sr-qty'>Số lượng trả *</label><input class='input' id='sr-qty' name='quantity' type='number' min='0.001' step='0.001' value='1' required/></div>
        ${financeFields}
        <div class='form-field full'><label class='input-label' for='sr-reason'>Lý do trả hàng *</label><input class='input' id='sr-reason' name='reason' required minlength='2' maxlength='300' placeholder='Ví dụ: Hàng lỗi kỹ thuật, hết hạn…'/></div>
      </div></form>`;
    S.fn.showModal('Tạo phiếu trả hàng NCC', '', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>Xác nhận trả NCC</button>`);
    if (canFinance) {
      const prodSelect = S.dom.modal.querySelector('#sr-product');
      prodSelect?.addEventListener('change', function () {
        const costInput = S.dom.modal.querySelector('#sr-cost');
        if (costInput) {
          costInput.value = prodSelect.selectedOptions[0]?.dataset.cost || '0';
          window.SlinkMoneyFields?.enhance(costInput.closest('form'));
        }
      });
    }
  }


  S.fn.rawVndDigits = function rawVndDigits(val, fallback = '0') {
    const raw = window.SlinkMoneyFields ? window.SlinkMoneyFields.raw(val ?? fallback) : String(val ?? fallback).trim();
    return /^(0|[1-9]\d{0,18})$/.test(raw) ? raw : null;
  }


  S.fn.submitSupplierReturnForm = async function submitSupplierReturnForm(form) {
    if (!window.SlinkReturnsExchangeUI) return;
    const data = new FormData(form);
    const canFinance = S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports');
    const qty = Number(data.get('quantity') || 0);
    if (!Number.isFinite(qty) || qty <= 0) return S.fn.toast('Số lượng trả chưa hợp lệ', 'Nhập số lượng lớn hơn 0.', 'error');
    const item = { productId: String(data.get('productId') || ''), quantity: qty };
    let refundReceivedVnd;
    let refundMethod;
    if (canFinance) {
      const costStr = S.fn.rawVndDigits(data.get('unitCostVnd'), '0');
      const refundStr = S.fn.rawVndDigits(data.get('refundReceivedVnd'), '0');
      if (costStr === null || refundStr === null) return S.fn.toast('Số tiền không hợp lệ', 'Đơn giá và tiền hoàn phải là số VND nguyên không âm.', 'error');
      item.unitCostVnd = costStr;
      refundReceivedVnd = refundStr;
      refundMethod = String(data.get('refundMethod') || 'cash');
    }
    const submitBtn = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitBtn) submitBtn.disabled = true;
    const keyStorage = form.dataset.keyStorage || `slink-sr-key:${S.state.store.id}`;
    try {
      const payload = {
        supplierId: String(data.get('supplierId') || ''),
        warehouseId: String(data.get('warehouseId') || ''),
        items: [item],
        reason: String(data.get('reason') || '').trim(),
      };
      if (canFinance) {
        payload.refundReceivedVnd = refundReceivedVnd;
        payload.refundMethod = refundMethod;
      }
      await window.SlinkReturnsExchangeUI.submitSupplierReturn({
        storeId: S.state.store.id,
        payload,
        csrfToken: S.fn.csrfCookie(),
        idempotencyKey: form.dataset.idempotencyKey || S.fn.readOrCreatePendingKey(keyStorage),
      });
      S.fn.clearPendingKey(keyStorage);
      S.fn.closeModal();
      S.fn.emitSyncDomains(['stock', 'products', 'suppliers', 'cashbook', 'dashboard'], { source: 'supplier-return' });
      S.fn.toast('Đã lập phiếu trả hàng NCC', 'Tồn kho và sổ công nợ đã cập nhật.');
      await Promise.all([S.fn.loadSupplierReturns(), S.fn.loadInventoryPage(S.state.searchTerms.inventory, S.state.inventoryOffset, { keepSearch: true }), S.fn.loadFinancePage()]);
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingKey(keyStorage);
      }
      S.fn.toast('Chưa tạo được phiếu trả NCC', error.message, 'error');
      if (submitBtn?.isConnected) submitBtn.disabled = false;
    }
  }


  S.fn.saveStockBulkCount = async function saveStockBulkCount(form) {
    let pending = S.fn.loadPendingStockBulkCount();
    if (!pending) {
      if (S.state.stockBulkCountErrors.length || !S.state.stockBulkCountRows.length) return S.fn.toast('Chưa thể kiểm kê', 'Chọn tệp CSV hợp lệ và đợi Slink đối chiếu trước.', 'error');
      const reason = String(new FormData(form).get('reason') || '').trim();
      if (!reason || reason.length > 500) return S.fn.toast('Lý do chưa hợp lệ', 'Nhập lý do kiểm kê từ 1 đến 500 ký tự.', 'error');
      pending = {
        key: S.fn.newIdempotencyKey(),
        payload: {
          reason,
          warehouseId: S.state.selectedWarehouseId,
          items: S.state.stockBulkCountRows.map(function (item) {
            return { productId: item.productId, expectedInventoryVersion: item.inventoryVersion, count: item.counted, sourceLine: item.sourceLine };
          }),
          preview: S.state.stockBulkCountRows,
        },
      };
    }
    if (!S.fn.savePendingStockBulkCount(pending)) return S.fn.pendingSaveFailed();
    const requestGeneration = S.state.modalGeneration;
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    const fileInput = S.dom.modal.querySelector('#stock-bulk-count-file');
    const reasonInput = S.dom.modal.querySelector('#stock-bulk-count-reason');
    if (submitButton) submitButton.disabled = true;
    if (fileInput) fileInput.disabled = true;
    if (reasonInput) reasonInput.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/stock-adjustments/bulk`, {
        method: 'POST', headers: { 'idempotency-key': pending.key },
        body: { items: pending.payload.items, reason: pending.payload.reason, warehouseId: pending.payload.warehouseId || S.state.selectedWarehouseId },
      });
      S.fn.clearPendingStockBulkCount();
      if (requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden) {
        S.fn.closeModal();
        S.state.stockBulkCountRows = [];
        S.state.stockBulkCountErrors = [];
      }
      await S.fn.loadInventoryPage(S.state.searchTerms.inventory, S.state.inventoryOffset);
      S.fn.emitSyncDomains(['stock', 'products', 'dashboard'], { source: 'stock-bulk-count' });
      const changedCount = Number(result.changedCount) || 0;
      const unchangedCount = Number(result.unchangedCount) || 0;
      S.fn.toast(changedCount ? 'Đã ghi nhận kiểm kê' : 'Tồn kho không đổi', `${S.fn.number(changedCount)} sản phẩm có chênh lệch đã ghi sổ · ${S.fn.number(unchangedCount)} sản phẩm giữ nguyên.`);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra lô kiểm kê đang chờ.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingStockBulkCount();
        if (requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden) {
          S.state.stockBulkCountRows = [];
          S.state.stockBulkCountErrors = [`Máy chủ chưa ghi dòng nào: ${error.message} Hãy xuất CSV tồn kho mới, điền lại số đếm rồi gửi lô mới.`];
          if (fileInput && fileInput.isConnected) fileInput.disabled = false;
          if (reasonInput && reasonInput.isConnected) reasonInput.disabled = false;
          S.fn.renderStockBulkCountPreview();
        }
      }
      S.fn.toast('Chưa xác nhận được lô kiểm kê', error.message, 'error');
      if (submitButton && requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden && submitButton.isConnected && !S.state.stockBulkCountRows.length) submitButton.disabled = true;
      else if (submitButton && requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden && submitButton.isConnected) submitButton.disabled = false;
    }
  }


  S.fn.adjustStock = async function adjustStock(form) {
    const p = S.fn.productById(form.dataset.id); if (!p) return;
    let pending = S.fn.loadPendingStock(p.id);
    if (!pending) {
      const data = new FormData(form);
      const input = String(data.get('count') ?? '').trim();
      const count = Number(input);
      if (!input || !Number.isFinite(count) || count < 0 || count > 1_000_000_000 || Math.abs(count * 1000 - Math.round(count * 1000)) > 1e-6) return S.fn.toast('Số lượng không hợp lệ', 'Nhập số lượng không âm, tối đa 3 chữ số thập phân.', 'error');
      if (count === Number(form.dataset.stockAtOpen)) { S.fn.closeModal(); return S.fn.toast('Số lượng khớp', 'Số đếm khớp với tồn lúc mở phiếu.'); }
      pending = { storeId: S.state.store.id, productId: p.id, key: S.fn.newIdempotencyKey(), payload: { _slinkOfflineVersion: 1, productId: p.id, count: count, expectedInventoryVersion: Number(form.dataset.inventoryVersion), reason: String(data.get('reason') || 'Kiểm kê thực tế'), warehouseId: String(data.get('warehouseId') || S.state.selectedWarehouseId) } };
    }
    if (!S.fn.savePendingStock(pending)) return S.fn.pendingSaveFailed();
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/stock-adjustments`, { method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload });
      S.fn.clearPendingStock(p.id);
      S.fn.closeModal();
      if (!result.offlineQueued) S.fn.emitSyncDomains(['stock', 'products', 'dashboard'], { source: 'stock-adjust' });
      if (S.state.page === 'inventory') await S.fn.loadInventoryPage(S.state.searchTerms.inventory, S.state.inventoryOffset);
      else await S.fn.loadProductsPage(S.state.searchTerms.products, S.state.productOffset);
      S.fn.render();
      S.fn.toast(result.offlineQueued ? 'Đã lưu số đếm trên máy' : 'Đã cập nhật tồn kho', p.name + ' · ' + S.fn.number(Number(pending.payload.count)) + ' ' + p.unit);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra cập nhật tồn.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingStock(p.id);
        if (error.code === 'inventory_version_conflict') {
          if (S.state.page === 'inventory') await S.fn.loadInventoryPage(S.state.searchTerms.inventory, S.state.inventoryOffset);
          else await S.fn.loadProductsPage(S.state.searchTerms.products, S.state.productOffset);
        }
        if (!S.dom.modal.hidden) S.fn.openStockAdjust(p.id);
      }
      S.fn.toast('Chưa cập nhật được tồn kho', error.message, 'error');
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }


  S.fn.receiveStock = async function receiveStock(form) {
    let pending = S.fn.loadPendingPurchase();
    if (!pending) {
      const data = new FormData(form);
      const purchaseItems = S.fn.receivePurchaseItemsFromForm(form);
      if (!purchaseItems.length || purchaseItems.length > 50) return S.fn.toast('Dòng hàng chưa hợp lệ', 'Phiếu nhập cần từ 1 đến 50 mặt hàng.', 'error');
      const seenProducts = new Set();
      const normalizedItems = [];
      let total = 0n;
      for (const item of purchaseItems) {
        if (!item.productId || seenProducts.has(item.productId)) return S.fn.toast('Sản phẩm bị thiếu hoặc lặp', 'Mỗi sản phẩm chỉ xuất hiện một lần trên phiếu nhập. Gộp số lượng vào cùng dòng.', 'error');
        seenProducts.add(item.productId);
        try {
          const line = S.fn.normalizeReceivePurchaseLine(item);
          normalizedItems.push(line.payload);
          total += line.total;
        } catch (error) { return S.fn.toast('Kiểm tra số lượng và tiền nhập', error.message, 'error'); }
      }
      if (total > BigInt(Number.MAX_SAFE_INTEGER)) return S.fn.toast('Tổng tiền quá lớn', 'Chia thành phiếu nhỏ hơn.', 'error');
      const paymentState = data.get('paymentState');
      if (form.receivePhoto && !S.fn.checkReceivePhoto(form, purchaseItems, total)) return;
      if (!['unpaid', 'partial', 'full'].includes(paymentState) || (paymentState !== 'unpaid' && !data.get('method'))) {
        return S.fn.toast('Chọn tình trạng và hình thức thanh toán', '');
      }
      const amountPaidVnd = paymentState === 'full' ? Number(total) : paymentState === 'partial' ? Number(S.fn.moneyInputRaw(data.get('paid'))) : 0;
      if (!Number.isSafeInteger(amountPaidVnd) || amountPaidVnd < 0) return S.fn.toast('Số tiền không hợp lệ', 'Số tiền thanh toán phải là VND nguyên không âm.', 'error');
      if (paymentState === 'partial' && (amountPaidVnd <= 0 || BigInt(amountPaidVnd) >= total)) {
        const paid = form.elements.paid;
        paid.setCustomValidity('Nhập số tiền lớn hơn 0 và nhỏ hơn tổng tiền hàng, hoặc đổi tình trạng thanh toán.');
        paid.reportValidity();
        return;
      }
      const supplierName = String(data.get('supplierName') || '').trim();
      if ((supplierName && !form.receiveSupplier) || (BigInt(amountPaidVnd) < total && !supplierName)) {
        const supplier = form.elements.supplierName;
        supplier.setCustomValidity(supplierName ? 'Chọn tên trong danh sách hoặc bấm Thêm nhà cung cấp.' : 'Chọn nhà cung cấp để ghi nợ.');
        supplier.reportValidity();
        return;
      }
      pending = {
        storeId: S.state.store.id,
        key: S.fn.newIdempotencyKey(),
        payload: { _slinkOfflineVersion: 1,
          items: normalizedItems,
          amountPaidVnd, supplierName,
          ...(form.receiveSupplier?.id ? { supplierId: form.receiveSupplier.id } : {}),
          note: String(data.get('note') || '').trim(), method: String(data.get('method') || 'cash'),
          warehouseId: String(data.get('warehouseId') || S.state.selectedWarehouseId || ''),
        },
      };
    }
    if (!S.fn.savePendingPurchase(pending)) return S.fn.pendingSaveFailed();
    form.querySelectorAll('input,select,button').forEach(function (field) { field.disabled = true; });
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const endpoint = pending.payload.items?.some(item => item.pack) ? 'purchase-packs' : 'purchases';
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/${endpoint}`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      S.fn.clearPendingPurchase();
      if (!result.offlineQueued) S.fn.emitSyncDomains(['stock', 'products', 'suppliers', 'cashbook', 'dashboard'], { source: 'receive-stock' });
      if (S.state.page === 'inventory') await S.fn.loadInventoryPage(S.state.searchTerms.inventory, S.state.inventoryOffset);
      else await S.fn.loadProductsPage('', 0);
      if (S.state.page === 'finance') await S.fn.loadFinancePage();
      if (S.dom.modal.contains(form)) S.fn.closeModal();
      S.fn.render();
      S.fn.toast(result.offlineQueued ? 'Đã lưu phiếu nhập trên máy' : 'Đã nhập kho', `${result.purchase.number} · ${S.fn.number(Number(result.purchase.itemCount || (result.purchase.items || []).length || 1))} mặt hàng · ${S.fn.moneyVndText(result.purchase.totalVnd)}`);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra phiếu nhập.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingPurchase();
        form.querySelectorAll('input,select,button').forEach(function (field) { field.disabled = false; });
      }
      S.fn.toast('Chưa hoàn tất được phiếu nhập', error.message, 'error');
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }

  S.fn.resizeInvoiceImageToBase64 = function resizeInvoiceImageToBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('Không đọc được tệp ảnh đã chọn.')); };
      reader.onload = function () {
        const img = new Image();
        img.onerror = function () { reject(new Error('Tệp không phải ảnh hợp lệ.')); };
        img.onload = function () {
          const maxDim = 1280;
          const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
          const w = Math.max(1, Math.round((img.width || 1) * scale));
          const h = Math.max(1, Math.round((img.height || 1) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          const parts = dataUrl.split(',');
          resolve({ mimeType: 'image/jpeg', imageBase64: parts[1] || '' });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  S.fn.receivePhotoLineHeading = function receivePhotoLineHeading(item) {
    const source = S.fn.esc(item.sourceLabel || 'Dòng trên ảnh');
    return `<div class='purchase-line-head'><strong data-photo-source>${source}</strong>
      ${item.productId ? '' : "<button type='button' class='link-button' data-receive-create>Tạo nhanh</button>"}</div>
      <label class='photo-unit-check' data-photo-unit-check hidden><input type='checkbox' data-photo-unit ${item.unitConfirmed ? 'checked' : ''}/> Đã đối chiếu số lượng, đơn vị và giá với ảnh</label>`;
  };

  function normalizeInvoiceUnit(value) {
    return String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  }

  function photoLineNeedsUnit(source, item, product) {
    if (source.issue === 'line_total' || !source.unit || !product) return true;
    const unit = normalizeInvoiceUnit(source.unit);
    if (item.pack) return !source.pack || source.product?.id !== product.id ||
      unit !== normalizeInvoiceUnit(item.pack.name) || Number(source.pack.size) !== Number(item.pack.size);
    return unit !== normalizeInvoiceUnit(product.unit);
  }

  S.fn.updateReceivePhotoSummary = function updateReceivePhotoSummary(form, total) {
    if (!form.receivePhoto) return;
    const box = form.querySelector('[data-photo-summary]');
    if (!box) return;
    const items = S.fn.receivePurchaseItemsFromForm(form);
    const rows = form.querySelectorAll('[data-purchase-line]');
    let issues = 0;
    const duplicates = new Set(items.filter((item, i) => item.productId && items.findIndex(other => other.productId === item.productId) !== i).map(item => item.productId));
    for (const [index, item] of items.entries()) {
      if (item.photoLine === undefined) continue;
      const missingUnit = photoLineNeedsUnit(form.receivePhoto.rows[item.photoLine], item, S.fn.productById(item.productId) || form.receivePhotoProducts?.get(item.productId));
      const row = rows[index];
      row.querySelector('[data-photo-unit-check]').hidden = !item.productId || !missingUnit;
      let valid = Boolean(item.productId) && !duplicates.has(item.productId) && (!missingUnit || item.unitConfirmed);
      try { S.fn.normalizeReceivePurchaseLine(item); } catch { valid = false; }
      row.classList.toggle('photo-line-needs-review', !valid);
      if (!valid) issues++;
      const create = row.querySelector('[data-receive-create]');
      if (create) create.hidden = Boolean(item.productId) || !S.fn.hasPerm('editProducts');
    }
    const warehouse = S.state.warehouses.find(row => row.id === form.elements.warehouseId.value);
    const mode = form.elements.paymentState.value;
    const paidText = S.fn.moneyInputRaw(form.elements.paid.value);
    let paid = null;
    if (total !== null && mode === 'full') paid = total;
    if (total !== null && mode === 'unpaid') paid = 0n;
    if (total !== null && mode === 'partial' && /^\d+$/.test(paidText) && BigInt(paidText) < total) paid = BigInt(paidText);
    box.textContent = [
      warehouse ? S.fn.warehouseOptionName(warehouse) : 'Chọn kho',
      form.elements.supplierName.value.trim() || 'Chưa chọn nơi mua',
      `${items.length} dòng hàng`,
      total === null ? 'Chưa đủ dữ liệu tính tổng' : S.fn.moneyVndText(total),
      paid === null ? 'Chưa chọn thanh toán' : `Đã trả ${S.fn.moneyVndText(paid)} · Còn nợ ${S.fn.moneyVndText(total - paid)}`,
      issues ? `${issues} dòng cần kiểm tra` : '',
    ].filter(Boolean).join(' · ');
  };

  S.fn.checkReceivePhoto = function checkReceivePhoto(form, items, total) {
    const photo = form.receivePhoto;
    if (form.receivePhotoLoading || form.querySelector('[data-photo-product-editor]')) {
      S.fn.toast(form.receivePhotoLoading ? 'Đang đọc ảnh phiếu nhập' : 'Hoàn tất mặt hàng đang thêm', '');
      return false;
    }
    const hasUnresolved = items.some(item => item.photoLine !== undefined && !item.unitConfirmed &&
      photoLineNeedsUnit(photo.rows[item.photoLine], item, S.fn.productById(item.productId) || form.receivePhotoProducts?.get(item.productId)));
    if (hasUnresolved) {
      form.querySelector('[data-receive-lines]').open = true;
      S.fn.toast('Kiểm tra đơn vị và số lượng', 'Xác nhận các dòng được đánh dấu trước khi nhập kho.', 'error');
      return false;
    }
    const sourceTotal = S.fn.moneyInputRaw(form.querySelector('[data-photo-total]').value);
    const manualTotal = photo.combined ? items.filter(item => item.photoLine === undefined)
      .reduce((sum, item) => sum + S.fn.normalizeReceivePurchaseLine(item).total, 0n) : 0n;
    if (!/^\d+$/.test(sourceTotal) || BigInt(sourceTotal) + manualTotal !== total) {
      form.querySelector('[data-receive-lines]').open = true;
      S.fn.toast('Tổng tiền chưa khớp', 'Đối chiếu số tiền trên ảnh với từng dòng hàng.', 'error');
      return false;
    }
    return true;
  };

  function openReceivePhotoProduct(form, row) {
    if (!row || row.querySelector('[data-photo-product-editor]') || !S.fn.hasPerm('editProducts')) return;
    const source = form.receivePhoto.rows[Number(row.dataset.photoLine)];
    const editor = document.createElement('div');
    editor.dataset.photoProductEditor = '';
    editor.className = 'form-grid';
    editor.innerHTML = `<label class='form-field'><span class='input-label'>Tên mặt hàng</span><input class='input' data-new-name maxlength='240' value='${S.fn.esc(source.name)}'></label>
      <label class='form-field'><span class='input-label'>Đơn vị bán</span><input class='input' data-new-unit maxlength='40' value='${S.fn.esc(source.unit)}'></label>
      <label class='form-field'><span class='input-label'>Giá bán (đ)</span><input class='input' data-new-price type='number' min='0' step='1' inputmode='numeric'></label>
      <div class='heading-actions full'><button class='btn btn-primary' type='button' data-create-save>Lưu mặt hàng</button><button class='btn btn-secondary' type='button' data-create-cancel>Để sau</button></div>
      <p class='full' role='status' data-create-error hidden></p>`;
    row.append(editor);
    window.SlinkMoneyFields.enhance(editor);
    editor.querySelector('[data-new-name]').focus();
    const storeId = S.state.store.id;
    const session = S.state.authSession;
    const key = S.fn.newIdempotencyKey();
    const sku = S.fn.newProductSku(key);
    const save = editor.querySelector('[data-create-save]');
    const cancel = editor.querySelector('[data-create-cancel]');
    const errorText = editor.querySelector('[data-create-error]');
    const fail = message => { errorText.hidden = false; errorText.textContent = message; };
    cancel.addEventListener('click', () => editor.remove());
    save.addEventListener('click', async () => {
      const name = editor.querySelector('[data-new-name]').value.trim();
      const unit = editor.querySelector('[data-new-unit]').value.trim();
      const salePriceVnd = S.fn.moneyInputRaw(editor.querySelector('[data-new-price]').value);
      if (!name || !unit || !/^\d+$/.test(salePriceVnd) || !Number.isSafeInteger(Number(salePriceVnd))) {
        fail('Nhập tên, đơn vị bán và giá bán bằng đồng.'); return;
      }
      const outstanding = S.fn.loadPendingProductImport();
      if (outstanding && outstanding.key !== key) { fail('Còn mặt hàng đang chờ lưu. Hãy xử lý lần nhập trước.'); return; }
      const payload = outstanding?.payload ?? { items: [{
        sku, name, unit, salePriceVnd: Number(salePriceVnd), costVnd: 0, inventoryTracked: true, openingQuantity: '0',
      }], warehouseId: form.elements.warehouseId.value };
      if (!S.fn.savePendingProductImport({ storeId, key, payload })) { fail('Chưa giữ được dữ liệu. Hãy thử lại.'); return; }
      editor.querySelectorAll('input,button').forEach(field => { field.disabled = true; });
      errorText.hidden = true;
      try {
        const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/products/import`, {
          method: 'POST', headers: { 'idempotency-key': key }, body: payload,
        });
        if (S.state.authSession !== session || S.state.store.id !== storeId) return;
        if (S.fn.loadPendingProductImport()?.key === key) S.fn.clearPendingProductImport();
        const created = result.products?.[0];
        if (!created) { fail('Chưa tìm được mặt hàng vừa lưu. Hãy tìm lại trong danh mục.'); return; }
        const product = S.fn.mapProduct(created);
        if (!S.fn.productById(product.id)) S.state.store.products.push(product);
        if (row.isConnected) {
          form.receivePhotoProducts.set(product.id, product);
          const select = row.querySelector('[data-purchase-product]');
          if (!Array.from(select.options).some(option => option.value === product.id)) {
            select.add(new Option(product.name, product.id));
          }
          select.value = product.id;
          editor.remove();
          S.fn.updateReceivePurchaseTotal(form);
        }
        S.fn.emitSyncDomains(['products', 'stock'], { source: 'receive-photo-product' });
      } catch (error) {
        if (S.state.authSession !== session || S.state.store.id !== storeId) return;
        if ([400, 403, 409, 422].includes(error.status) && S.fn.loadPendingProductImport()?.key === key) S.fn.clearPendingProductImport();
        fail(error.message || 'Chưa xác nhận được mặt hàng. Hãy bấm Lưu để thử lại.');
      } finally {
        const retryPending = S.fn.loadPendingProductImport()?.key === key;
        editor.querySelectorAll('input,button').forEach(field => { field.disabled = retryPending && field !== save; });
      }
    });
  }

  function receiveDraftSignature(form) {
    return JSON.stringify([S.fn.receivePurchaseItemsFromForm(form), form.elements.warehouseId.value,
      form.elements.supplierName.value, form.elements.paymentState.value, form.elements.method.value,
      form.elements.paid.value, form.elements.note.value]);
  }

  function receivePhotoItem(row) {
    const item = {
      photoLine: row.index, sourceLabel: [row.name || 'Dòng trên ảnh', row.quantity && row.unit ? `${row.quantity} ${row.unit}` : row.unit].filter(Boolean).join(' · '),
      productId: row.product?.id || '', quantity: row.quantity ?? '',
      packMode: false, priceMode: row.lineTotalVnd === null ? 'unit' : 'total',
      unitCostVnd: row.unitCostVnd ?? '', lineTotalVnd: row.lineTotalVnd ?? '',
    };
    if (row.pack && row.quantity && (row.unitCostVnd !== null || row.lineTotalVnd !== null)) {
      try {
        const milli = BigInt(window.SlinkOfflineLedger.quantity(row.quantity));
        const unitCost = row.unitCostVnd ?? window.SlinkPurchaseUnits.unitCostFromTotal(row.lineTotalVnd, milli).toString();
        const pack = { ...row.pack, quantity: row.quantity, unitCostVnd: unitCost };
        const converted = window.SlinkPurchaseUnits.fromPack(pack);
        if (row.lineTotalVnd === null || converted.lineTotalVnd === BigInt(row.lineTotalVnd)) item.pack = pack;
      } catch { /* Leave values visible for review. */ }
    }
    return item;
  }

  function applyPurchasePhoto(form, draft, image, keepExisting) {
    const oldRows = keepExisting ? S.fn.receivePurchaseItemsFromForm(form).filter(row => row.photoLine === undefined &&
      (row.productId || row.unitCostVnd || row.lineTotalVnd || (row.quantity && row.quantity !== '1'))) : [];
    if (oldRows.length + draft.rows.length > 50) {
      S.fn.toast('Phiếu có quá nhiều dòng', 'Mỗi phiếu tối đa 50 mặt hàng.', 'error');
      return;
    }
    form.receivePhotoProducts ??= new Map();
    const products = S.state.store.products;
    for (const { product } of draft.rows) {
      if (product) {
        const matching = products.find(row => row.id === product.id) || { ...product, cost: null };
        form.receivePhotoProducts.set(product.id, matching);
        if (!products.some(row => row.id === product.id)) products.push(matching);
      }
    }
    form.receivePhoto = { rows: draft.rows, combined: oldRows.length > 0 };
    const review = form.querySelector('[data-receive-ai-review]');
    const charges = [Number(draft.discountVnd) > 0 ? `Giảm giá ${S.fn.moneyVndText(draft.discountVnd)}` : '',
      Number(draft.feeVnd) > 0 ? `Phụ phí ${S.fn.moneyVndText(draft.feeVnd)}` : ''].filter(Boolean);
    review.innerHTML = `<p data-photo-summary role='status'></p>
      <details><summary>Xem ảnh phiếu nhập</summary><img alt='Ảnh phiếu nhập đang đối chiếu'></details>
      <label class='form-field'><span class='input-label'>Tổng phải trả trên ảnh (đ)</span>
      <input class='input' type='number' inputmode='numeric' min='0' step='1' data-photo-total required value='${S.fn.esc(draft.totalVnd ?? '')}'></label>
      ${charges.length ? `<p>${charges.join(' · ')}. Điều chỉnh thành tiền từng dòng để khớp phiếu.</p>` : ''}
      ${oldRows.length ? '<p>Tổng phiếu sẽ gồm số tiền trên ảnh và phần đã nhập trước.</p>' : ''}`;
    review.querySelector('img').src = 'data:image/jpeg;base64,' + image.imageBase64;
    if (draft.supplierName && !form.elements.supplierName.value) {
      form.elements.supplierName.value = draft.supplierName;
      if (draft.supplierId) form.receiveSupplier = { id: draft.supplierId, name: draft.supplierName };
    }
    if (!keepExisting || !form.receivePaymentEdited) {
      const paid = oldRows.length ? null : draft.paidVnd;
      const total = draft.totalVnd;
      let mode = '';
      if (paid === '0') mode = 'unpaid';
      if (draft.canRecordPayment && paid !== null && total !== null && paid !== '0' && BigInt(paid) <= BigInt(total)) mode = paid === total ? 'full' : 'partial';
      form.elements.paymentState.value = mode;
      form.elements.method.value = draft.method || '';
      form.partialPaid = mode === 'partial' ? paid : '';
      form.elements.paid.value = form.partialPaid;
    }
    const sortedRows = [...draft.rows].sort((a, b) => Number(Boolean(b.issue)) - Number(Boolean(a.issue)));
    S.fn.redrawReceivePurchaseLines(form, [...sortedRows.map(receivePhotoItem), ...oldRows]);
    window.SlinkMoneyFields.enhance(form);
    const lines = form.querySelector('[data-receive-lines]');
    lines.open = oldRows.length > 0 || draft.totalVnd === null || charges.length > 0 ||
      Boolean(lines.querySelector('.photo-line-needs-review')) || form.querySelector('#purchase-total-note').hidden === false;
    if (!lines.open) {
      try {
        lines.open = S.fn.receivePurchaseItemsFromForm(form).reduce((sum, row) => sum + S.fn.normalizeReceivePurchaseLine(row).total, 0n) !== BigInt(draft.totalVnd);
      } catch { lines.open = true; }
    }
    form.dataset.dirty = 'true';
  }

  S.fn.handleReceiveAiInvoiceFile = async function handleReceiveAiInvoiceFile(file, form) {
    const storeId = S.state.store?.id;
    if (!file || !form || !storeId || form.receivePhotoLoading) return;
    const status = form.querySelector('#receive-ai-status');
    const review = form.querySelector('[data-receive-ai-review]');
    const button = form.querySelector('[data-action="receive-ai-invoice"]');
    const session = S.state.authSession;
    const current = () => form.isConnected && S.state.store?.id === storeId && S.state.authSession === session;
    const signature = receiveDraftSignature(form);
    const hasManualDraft = form.dataset.dirty === 'true' || S.fn.receivePurchaseItemsFromForm(form).some(row => row.productId || row.unitCostVnd || row.lineTotalVnd || (row.quantity && row.quantity !== '1')) ||
      form.elements.supplierName.value || form.elements.note.value || form.elements.paymentState.value !== 'unpaid';
    form.receivePhotoLoading = true;
    button.disabled = true;
    status.hidden = false;
    status.textContent = 'Đang đọc ảnh…';
    try {
      if (file.size > 18 * 1024 * 1024) throw new Error('Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn.');
      const image = await S.fn.resizeInvoiceImageToBase64(file);
      if (!current()) return;
      const draft = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/ai/parse-invoice`, {
        method: 'POST', body: { ...image, draftVersion: 2 },
      });
      if (!current() || S.fn.loadPendingPurchase()) return;
      if (!Array.isArray(draft.rows) || !draft.rows.length) throw new Error('Chưa đọc được mặt hàng. Hãy chụp lại hoặc nhập tay.');
      if (!hasManualDraft && signature === receiveDraftSignature(form) && !form.receivePhoto) {
        review.hidden = false;
        applyPurchasePhoto(form, draft, image, false);
        status.hidden = true;
        return;
      }
      let proposal = form.querySelector('[data-receive-photo-proposal]');
      if (!proposal) {
        proposal = document.createElement('div');
        proposal.dataset.receivePhotoProposal = '';
        review.before(proposal);
      }
      status.textContent = `Đã đọc ${draft.rows.length} dòng. Phiếu đang nhập vẫn được giữ.`;
      proposal.innerHTML = "<button type='button' class='btn btn-secondary'>Dùng kết quả đọc ảnh</button>";
      proposal.querySelector('button').addEventListener('click', () => {
        const prior = form.receivePhoto;
        if (prior && !window.confirm('Thay các dòng đã đọc từ ảnh trước? Các dòng nhập tay sẽ được giữ.')) return;
        review.hidden = false;
        applyPurchasePhoto(form, draft, image, true);
        if (form.receivePhoto !== prior) { proposal.remove(); status.hidden = true; }
      });
    } catch (error) {
      if (current()) status.textContent = error.message || 'Chưa đọc được ảnh. Hãy chụp lại hoặc nhập tay.';
    } finally {
      form.receivePhotoLoading = false;
      if (current()) button.disabled = false;
    }
  };

})(window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {}, charts: {} });
