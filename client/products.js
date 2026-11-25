(function (S) {
  'use strict';

  S.fn.productThumb = function productThumb(product, extra) {
    return "<span class='product-thumb " + (product.tone || 'product-sage') + (product.imageUrl ? ' with-photo ' : ' ') + (extra || '') + "'>" + S.fn.esc(S.fn.initials(product.name || product.sku || 'Hàng')) + (product.imageUrl ? "<img data-product-photo src='" + S.fn.esc(product.imageUrl) + "' alt='' loading='lazy' decoding='async'/>" : '') + "</span>";
  }


  S.fn.productPhotoField = function productPhotoField(product) {
    const url = product?.imageUrl || '';
    return `<div class='product-photo-field' data-photo-field>
      <label class='product-photo-preview product-photo-pick'><span aria-hidden='true'>${S.fn.icon('image', 22)}<small>Thêm ảnh</small></span><img data-photo-preview ${url ? `src='${S.fn.esc(url)}'` : 'hidden'} alt='Ảnh sản phẩm'/><input type='file' accept='image/jpeg,image/png,image/webp' data-product-photo-input aria-label='Chọn ảnh sản phẩm'/></label>
      <button class='link-button' type='button' data-action='remove-product-photo' ${url ? '' : 'hidden'}>Bỏ ảnh</button>
      <span data-photo-status role='status' aria-live='polite'></span>
    </div>`;
  }


  S.fn.readProductPhoto = function readProductPhoto(form) {
    if (form.dataset.photoLoading === 'true') throw new Error('Đang chuẩn bị ảnh. Đợi một chút rồi lưu.');
    if (form.dataset.photoError === 'true') throw new Error('Chọn lại ảnh hoặc bấm Bỏ ảnh rồi lưu.');
    return form.productPhotoValue;
  }


  S.fn.selectProductPhoto = async function selectProductPhoto(input) {
    const form = input.form;
    const file = input.files?.[0];
    if (!form || !file) return;
    const token = String(Number(form.dataset.photoRead || 0) + 1);
    form.dataset.photoRead = token; form.dataset.photoLoading = 'true';
    const field = form.querySelector('[data-photo-field]');
    const status = field.querySelector('[data-photo-status]');
    const remove = field.querySelector('[data-action="remove-product-photo"]');
    remove.hidden = false;
    status.textContent = 'Đang chuẩn bị ảnh…';
    let url;
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Chọn ảnh JPG, PNG hoặc WebP dưới 8 MB.');
      url = URL.createObjectURL(file);
      const photo = new Image();
      await new Promise(function (resolve, reject) { photo.onload = resolve; photo.onerror = reject; photo.src = url; });
      if (!photo.naturalWidth || photo.naturalWidth * photo.naturalHeight > 40000000) throw new Error('Ảnh quá lớn. Hãy chọn ảnh khác.');
      const ratio = Math.min(1, 720 / Math.max(photo.naturalWidth, photo.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(photo.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(photo.naturalHeight * ratio));
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
      let data = canvas.toDataURL('image/jpeg', 0.8);
      if (data.length > 650000) data = canvas.toDataURL('image/jpeg', 0.6);
      if (data.length > 650000) throw new Error('Ảnh vẫn quá lớn. Hãy chọn ảnh đơn giản hơn.');
      if (!form.isConnected || form.dataset.photoRead !== token) return;
      form.productPhotoValue = data; delete form.dataset.photoError;
      const preview = field.querySelector('[data-photo-preview]'); preview.src = data; preview.hidden = false;
      status.textContent = '';
    } catch (error) {
      if (!form.isConnected || form.dataset.photoRead !== token) return;
      form.dataset.photoError = 'true'; status.textContent = error.message || 'Không đọc được ảnh. Hãy chọn ảnh khác.';
    } finally {
      if (url) URL.revokeObjectURL(url);
      if (form.dataset.photoRead === token) delete form.dataset.photoLoading;
      input.value = '';
    }
  }


  S.fn.removeProductPhoto = function removeProductPhoto(button) {
    const form = button.closest('form'); if (!form) return;
    form.dataset.photoRead = String(Number(form.dataset.photoRead || 0) + 1);
    delete form.dataset.photoLoading; delete form.dataset.photoError;
    form.productPhotoValue = form.dataset.id ? null : undefined;
    const preview = form.querySelector('[data-photo-preview]'); preview.hidden = true; preview.removeAttribute('src');
    form.querySelector('[data-photo-status]').textContent = form.dataset.id ? 'Ảnh sẽ được bỏ khi lưu thay đổi.' : '';
    button.hidden = true;
  }


  S.fn.loadProductsPage = async function loadProductsPage(query, offset, options = {}) {
    if (!S.state.authSession || !S.state.store.id) return;
    const requestStoreId = S.state.store.id;
    const requestSession = S.state.authSession;
    const requestedForPos = S.state.page === 'pos';
    const requestWarehouseId = requestedForPos ? S.state.selectedWarehouseId : null;
    const requestNumber = ++S.state.productRequestNumber;
    const searchCurrent = () => !options.keepSearch || (S.state.page === 'products' && S.state.searchTerms.products === query);
    const draw = () => {
      if (S.state.page === 'products' && S.dom.root.dataset.page === 'products') S.fn.refreshSearchList('product');
      else S.fn.render();
    };
    S.state.productLoading = true;
    S.state.productError = '';
    if (!options.silentLoading && (S.state.page === 'products' || S.state.page === 'pos') && !S.state.store.products.length && !S.state.posCatalog.length) draw();
    const warehouseQuery = requestWarehouseId ? `&warehouseId=${encodeURIComponent(requestWarehouseId)}` : '';
    const url = `/api/stores/${encodeURIComponent(S.state.store.id)}/products?limit=100&offset=${Math.max(0, offset || 0)}&q=${encodeURIComponent(query || '')}${warehouseQuery}`;
    try {
      const result = await S.fn.apiRequest(url, { preferFresh: options.keepSearch === true || options.preferFresh === true });
      if (requestNumber !== S.state.productRequestNumber || S.state.store.id !== requestStoreId || S.state.authSession !== requestSession) return;
      if (!searchCurrent()) return;
      if (requestedForPos && (S.state.page !== 'pos' || S.state.selectedWarehouseId !== requestWarehouseId)) return;
      if (!result.products.length && offset > 0) return S.fn.loadProductsPage(query, Math.max(0, offset - 100), options);
      S.state.store.products = result.products.map(S.fn.mapProduct);
      if (requestedForPos) S.fn.rememberPosProducts(S.state.store.products, requestWarehouseId, query || '');
      S.state.productTotal = result.total;
      S.state.purchasePacksSupported = result.purchasePacksSupported === true;
      S.state.productPackDefaultsSupported = result.productPackDefaultsSupported === true;
      S.state.productOffset = offset || 0;
      S.state.productNextOffset = result.nextOffset;
      S.state.productLoading = false;
      S.state.productError = '';
      draw();
    } catch (error) {
      if (requestNumber !== S.state.productRequestNumber || S.state.store.id !== requestStoreId || S.state.authSession !== requestSession) return;
      if (!searchCurrent()) return;
      if (requestedForPos && (S.state.page !== 'pos' || S.state.selectedWarehouseId !== requestWarehouseId)) return;
      S.state.productLoading = false;
      S.state.productError = error.message;
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      S.fn.toast('Chưa tải được sản phẩm', error.message, 'error');
      draw();
    }
  }


  S.fn.filteredProducts = function filteredProducts(query, category, source) {
    const term = String(query || '').trim();
    const q = term.toLowerCase();
    return (source || S.state.store.products).filter(function (p) {
      const attributes = Object.entries(p.variantAttributes || {}).map(function (entry) { return entry.join(' '); }).join(' ');
      const extraHit = Array.isArray(p.extraBarcodes) && p.extraBarcodes.some(code => String(code || '').toLowerCase() === q);
      return (!category || category === 'Tất cả' || p.category === category) && (!q || p.barcode === term || extraHit || [p.name, p.sku, p.category, p.variantGroupName, attributes].some(function (value) { return String(value || '').toLowerCase().includes(q); }));
    });
  }


  S.fn.stockBadge = function stockBadge(product) {
    if (!product.inventoryTracked) return `<span class='badge badge-neutral'>Không theo dõi tồn</span>`;
    if (product.stock <= 0) return `<span class='badge badge-danger'>Hết hàng</span>`;
    if (product.stock <= product.minStock) return `<span class='badge badge-warning'>Sắp hết</span>`;
    return `<span class='badge badge-success'>Đang bán</span>`;
  }


  S.fn.productRow = function productRow(product) {
    const canEdit = S.fn.hasPerm('editProducts');
    const canViewPriceHistory = S.fn.hasPerm('viewCostPrice') || S.fn.hasPerm('editProducts') || S.fn.hasPerm('viewReports');
    const showCost = S.fn.hasPerm('viewCostPrice');
    const attributes = Object.entries(product.variantAttributes || {}).map(function (entry) { return `${entry[0]}: ${entry[1]}`; }).join(' · ');
    const serialBadge = product.serialTracked ? ` <span class='badge badge-neutral'>Mã riêng</span>` : '';
    const warrantyBadge = product.warrantyMonths > 0 ? ` <span class='badge badge-info serial-warranty-badge'>BH ${S.fn.number(product.warrantyMonths)}T</span>` : '';
    const checked = S.state.selectedProductIds && S.state.selectedProductIds.has(product.id) ? 'checked' : '';
    return `<tr><td><input type='checkbox' data-action='product-select' data-id='${S.fn.esc(product.id)}' ${checked} aria-label='Chọn ${S.fn.esc(product.name)}'/></td><td><div class='product-cell'>${S.fn.productThumb(product)}<span class='product-name-stack'><button type='button' class='link-button' data-action='product-detail' data-id='${S.fn.esc(product.id)}' style='padding:0;text-align:left;color:var(--ink)'><strong>${S.fn.esc(product.name)}</strong></button>${serialBadge}${warrantyBadge}<small>${S.fn.esc(product.sku)}${product.barcode ? ` · ${S.fn.esc(product.barcode)}` : ''}${attributes ? ` · ${S.fn.esc(attributes)}` : ''}</small></span></div></td><td>${S.fn.esc(product.category)}</td><td class='text-right'>${S.fn.money(product.price)}</td>${showCost ? `<td class='text-right'>${product.cost == null ? '—' : S.fn.money(product.cost)}</td>` : ''}<td class='text-right'><span class='stock-number ${product.inventoryTracked && product.stock <= 0 ? 'out' : product.inventoryTracked && product.stock <= product.minStock ? 'low' : ''}'>${product.inventoryTracked ? `${S.fn.number(product.stock)} ${S.fn.esc(product.unit)}` : '—'}</span></td><td>${S.fn.stockBadge(product)}</td><td class='text-right'><button class='row-action' data-action='product-detail' data-id='${S.fn.esc(product.id)}' aria-label='Chi tiết &amp; Thẻ kho ${S.fn.esc(product.name)}' title='Chi tiết &amp; Thẻ kho'>${S.fn.icon('layers', 15)}</button>${canEdit ? `<button class='row-action' data-action='add-product-units' data-id='${product.id}' aria-label='Thêm tồn hoặc quét mã cho ${S.fn.esc(product.name)}' title='Thêm tồn / Quét mã'>＋</button>` : ''}${product.serialTracked ? `<button class='row-action' data-action='view-product-serials' data-id='${product.id}' aria-label='Xem danh sách mã riêng của ${S.fn.esc(product.name)}' title='Danh sách mã riêng'>#</button>` : ''}<button class='row-action' data-action='print-barcode-single' data-id='${product.id}' aria-label='In tem mã vạch ${S.fn.esc(product.name)}' title='In tem mã vạch'>${S.fn.icon('scan', 15)}</button>${canViewPriceHistory ? `<button class='row-action' data-action='product-price-history' data-id='${product.id}' aria-label='Xem lịch sử giá ${S.fn.esc(product.name)}' title='Lịch sử giá'>${S.fn.icon('clock', 15)}</button>` : ''}${canEdit ? `<button class='row-action' data-action='edit-product' data-id='${product.id}' aria-label='Sửa ${S.fn.esc(product.name)}'>•••</button>` : ''}</td></tr>`;
  }


  S.fn.productMobileCard = function productMobileCard(product) {
    const canEdit = S.fn.hasPerm('editProducts');
    const attributes = Object.entries(product.variantAttributes || {}).map(function (entry) { return `${entry[0]}: ${entry[1]}`; }).join(' · ');
    const serialTag = product.serialTracked ? 'Mã riêng' : '';
    const warrantyTag = product.warrantyMonths > 0 ? `BH ${S.fn.number(product.warrantyMonths)}T` : '';
    const productMain = `${S.fn.productThumb(product)}<span class='product-mobile-info'><strong>${S.fn.esc(product.name)}</strong><small>${S.fn.esc([product.sku, serialTag, warrantyTag, attributes || product.category].filter(Boolean).join(' · '))}</small></span><span class='product-mobile-side'><strong>${S.fn.money(product.price)}</strong><small>${product.inventoryTracked ? (product.stock <= 0 ? 'Hết hàng' : `Còn ${S.fn.number(product.stock)} ${S.fn.esc(product.unit)}`) : 'Không theo dõi tồn'}</small></span>`;
    return `<article class='product-mobile-card'>${canEdit ? `<button class='product-mobile-main' data-action='edit-product' data-id='${product.id}' aria-label='Sửa ${S.fn.esc(product.name)}'>${productMain}</button>` : `<div class='product-mobile-main'>${productMain}</div>`}<button class='product-card-menu-button' data-action='product-card-menu' data-id='${product.id}' aria-label='Thao tác với ${S.fn.esc(product.name)}' title='Thao tác'>${S.fn.icon('more', 21)}</button></article>`;
  }


  S.fn.openProductCardMenu = function openProductCardMenu(id) {
    const product = S.fn.productById(id);
    if (!product) return;
    const canEdit = S.fn.hasPerm('editProducts');
    const canViewHistory = S.fn.hasPerm('viewCostPrice') || S.fn.hasPerm('editProducts') || S.fn.hasPerm('viewReports');
    const actions = [
      ['detail', 'Chi tiết & Thẻ kho'],
      canEdit ? ['add-units', '＋ Thêm tồn / Quét mã'] : null,
      product.serialTracked ? ['serials', 'Danh sách mã riêng'] : null,
      canEdit ? ['edit', 'Sửa mặt hàng'] : null,
      ['print', 'In tem mã vạch'],
      canViewHistory ? ['history', 'Lịch sử giá'] : null,
      S.fn.hasPerm('manageInventory') && product.inventoryTracked && !product.serialTracked ? ['stock', 'Kiểm kê tồn kho'] : null,
    ].filter(Boolean);
    S.fn.showModal(product.name, '', `<div class='product-card-actions'>${actions.map(([kind, label]) => `<button type='button' class='btn btn-secondary' data-action='product-card-choice' data-kind='${kind}' data-id='${S.fn.esc(id)}'>${label}</button>`).join('')}</div>`, '');
  }


  S.fn.renderProducts = function renderProducts() {
    const canEdit = S.fn.hasPerm('editProducts');
    const moreActions = (canEdit ? `<button class='btn btn-secondary' data-action='import-products'>Nhập danh sách</button><button class='btn btn-secondary' data-action='new-product-variant-group'>Thêm nhiều màu, cỡ</button><button class='btn btn-secondary' data-action='bulk-update-products'>Cập nhật hàng loạt</button>` : '') + `<button class='btn btn-secondary' data-action='print-barcode-batch'>In tem mã vạch</button><button class='btn btn-secondary' data-action='open-warranty-lookup'>Tra cứu bảo hành</button>` + (S.fn.canExportData() ? `<button class='btn btn-secondary' data-action='open-export'>Xuất CSV</button>` : '');
    const actions = (canEdit ? `<button class='btn btn-primary' data-action='new-product'>＋ Thêm hàng</button><button class='btn btn-secondary desktop-only-btn' data-action='import-products'>Nhập danh sách</button>` : '') + `<button class='btn btn-secondary desktop-only-btn' data-action='print-barcode-batch'>In tem</button>` + (moreActions ? `<details class='catalog-more'><summary class='btn btn-secondary'>Khác</summary><div>${moreActions}</div></details>` : '');
    return S.fn.pageHeading('Sản phẩm', '', actions) +
      `<div class='toolbar'><div class='toolbar-left'><div class='search-wrap product-search-wrap'><span class='search-symbol'>⌕</span><input class='input' id='product-search' type='search' placeholder='Tìm tên, mã hàng hoặc mã vạch…' value='${S.fn.esc(S.state.searchTerms.products)}' aria-label='Tìm sản phẩm'><button class='icon-button inventory-scan' type='button' data-action='product-scan' aria-label='Quét mã vạch tìm sản phẩm' title='Quét mã vạch'>${S.fn.icon('scan', 19)}</button></div><span class='result-count' data-product-result-count>${S.state.productLoading ? 'Đang tải…' : `${S.fn.number(S.state.productTotal)} sản phẩm`}</span></div></div>` + S.fn.renderProductList();
  }


  S.fn.renderProductList = function renderProductList() {
    const products = S.fn.filteredProducts(S.state.searchTerms.products, 'Tất cả');
    const showCost = S.fn.hasPerm('viewCostPrice');
    const selectedSet = S.state.selectedProductIds || new Set();
    const allSelected = products.length > 0 && products.every(function (p) { return selectedSet.has(p.id); });
    const batchBar = selectedSet.size > 0
      ? `<div class='batch-action-bar' role='region' aria-label='Thao tác hàng loạt'><span class='batch-action-info'>Đã chọn <strong>${S.fn.number(selectedSet.size)}</strong> sản phẩm</span><div class='batch-action-buttons'><button type='button' class='btn btn-secondary' data-action='batch-print-barcodes'>In tem mã vạch loạt</button>${S.fn.canExportData() ? `<button type='button' class='btn btn-secondary' data-action='batch-export-products'>Xuất CSV</button>` : ''}<button type='button' class='btn btn-secondary' data-action='batch-clear-products'>Bỏ chọn</button></div></div>`
      : '';
    const empty = S.state.productLoading ? 'Đang tải danh mục…' : S.state.productError ? S.fn.esc(S.state.productError) : S.state.searchTerms.products ? 'Không tìm thấy sản phẩm phù hợp.' : 'Thêm sản phẩm đầu tiên để bắt đầu quản lý danh mục.';
    return `<section class='panel' data-product-result-list>${batchBar}<div class='table-wrap desktop-table'><table class='data-table'><thead><tr><th style='width:38px'><input type='checkbox' data-action='product-select-all' ${allSelected ? 'checked' : ''} aria-label='Chọn tất cả sản phẩm'/></th><th>Sản phẩm</th><th>Danh mục</th><th class='text-right'>Giá bán</th>${showCost ? `<th class='text-right'>Giá vốn</th>` : ''}<th class='text-right'>Tồn kho</th><th>Trạng thái</th><th></th></tr></thead><tbody>${products.map(S.fn.productRow).join('') || `<tr><td colspan='${showCost ? 8 : 7}'><div class='empty-state'><strong>${S.fn.esc(empty)}</strong></div></td></tr>`}</tbody></table></div><div class='product-list-mobile'>${products.map(S.fn.productMobileCard).join('') || `<div class='panel empty-state'><strong>${S.fn.esc(empty)}</strong></div>`}</div><div class='pagination'><span>Hiển thị ${products.length} trên ${S.fn.number(S.state.productTotal)} sản phẩm</span><span class='pagination-actions'>${S.state.productOffset > 0 ? `<button class='page-button' data-action='products-page' data-offset='${Math.max(0, S.state.productOffset - 100)}'>‹</button>` : ''}<span class='page-button current'>${Math.floor(S.state.productOffset / 100) + 1}</span>${S.state.productNextOffset !== null ? `<button class='page-button' data-action='products-page' data-offset='${S.state.productNextOffset}'>›</button>` : ''}</span></div></section>`;
  }


  S.fn.refreshSearchList = function refreshSearchList(kind) {
    const product = kind === 'product';
    const list = S.dom.root.querySelector(`[data-${kind}-result-list]`);
    const count = S.dom.root.querySelector(`[data-${kind}-result-count]`);
    if (!list || !count) { S.fn.render(); return; }
    const search = document.getElementById(`${kind}-search`);
    const term = product ? S.state.searchTerms.products : S.state.searchTerms.inventory;
    if (search && search.value !== term) search.value = term;
    list.outerHTML = product ? S.fn.renderProductList() : S.fn.renderInventoryList();
    count.textContent = product
      ? (S.state.productLoading ? 'Đang tải…' : S.state.productError || `${S.fn.number(S.state.productTotal)} sản phẩm`)
      : (S.state.inventoryLoading ? 'Đang tải…' : S.state.inventoryError ? 'Chưa tải được' : `${S.fn.number(S.state.inventoryTotal)} mặt hàng`);
    if (!product) S.dom.root.querySelectorAll('[data-inventory-stat]').forEach(value => { value.textContent = S.fn.inventoryStatText(value.dataset.inventoryStat); });
    S.fn.enhanceRecordLists(S.dom.root.querySelector(`[data-${kind}-result-list]`));
  }


  S.fn.formatImportQuantity = function formatImportQuantity(value) {
    const match = /^(\d{1,10})(?:\.(\d{1,3}))?$/.exec(String(value ?? '0'));
    if (!match) return '0';
    const whole = BigInt(match[1]).toLocaleString('vi-VN');
    const fraction = (match[2] || '').padEnd(3, '0').replace(/0+$/, '');
    return whole + (fraction ? `,${fraction}` : '');
  }


  S.fn.totalImportQuantity = function totalImportQuantity(rows) {
    const totalMilliUnits = rows.reduce(function (sum, item) {
      const match = /^(\d{1,10})(?:\.(\d{1,3}))?$/.exec(String(item.openingQuantity ?? '0'));
      if (!match) return sum;
      return sum + BigInt(match[1]) * 1000n + BigInt((match[2] || '').padEnd(3, '0') || '0');
    }, 0n);
    const whole = (totalMilliUnits / 1000n).toLocaleString('vi-VN');
    const fraction = String(totalMilliUnits % 1000n).padStart(3, '0').replace(/0+$/, '');
    return whole + (fraction ? `,${fraction}` : '');
  }


  S.fn.detectCsvDelimiter = function detectCsvDelimiter(source) {
    let quoted = false;
    let commas = 0;
    let semicolons = 0;
    for (let i = 0; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '"') {
        if (quoted && source[i + 1] === '"') { i += 1; continue; }
        quoted = !quoted;
      } else if (!quoted) {
        if (ch === '\n' || ch === '\r') break;
        if (ch === ',') commas += 1;
        else if (ch === ';') semicolons += 1;
      }
    }
    return commas === 0 && semicolons >= 3 ? ';' : ',';
  }


  S.fn.parseCsvDocument = function parseCsvDocument(text) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    const delimiter = S.fn.detectCsvDelimiter(source);
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    let quoteClosed = false;
    let physicalLine = 1;
    let rowStartLine = 1;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
        else if (character === '"') { quoted = false; quoteClosed = true; }
        else {
          field += character;
          if (character === '\r' || character === '\n') {
            if (character !== '\n' || source[index - 1] !== '\r') physicalLine += 1;
          }
        }
        continue;
      }
      if (character === '"') {
        if (field.length || quoteClosed) throw new Error('Dấu ngoặc kép trong tệp CSV chưa đúng định dạng.');
        quoted = true;
      } else if (character === delimiter) {
        row.push(field); field = ''; quoteClosed = false;
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && source[index + 1] === '\n') index += 1;
        row.push(field); rows.push({ cells: row, line: rowStartLine }); row = []; field = ''; quoteClosed = false;
        physicalLine += 1;
        rowStartLine = physicalLine;
      } else if (quoteClosed) {
        if (!/\s/.test(character)) throw new Error('Có ký tự thừa sau trường CSV được đặt trong dấu ngoặc kép.');
      } else field += character;
    }
    if (quoted) throw new Error('Tệp CSV có trường chưa đóng dấu ngoặc kép.');
    if (field.length || row.length || quoteClosed) { row.push(field); rows.push({ cells: row, line: rowStartLine }); }
    return rows;
  }


  S.fn.knownBarcodeSet = function knownBarcodeSet(extraBarcodes) {
    const set = new Set();
    const add = function (code) {
      const clean = String(code || '').trim();
      if (clean) set.add(clean);
    };
    const addProd = function (p) {
      if (!p) return;
      add(p.barcode);
      if (Array.isArray(p.extraBarcodes)) p.extraBarcodes.forEach(add);
    };
    (S.state.store.products || []).forEach(addProd);
    (S.state.inventoryProducts || []).forEach(addProd);
    S.state.posKnownProducts.forEach(addProd);
    (S.state.productImportSourceRows || []).forEach(p => add(p.barcode));
    (S.state.productBulkUpdateRows || []).forEach(p => add(p.barcode));
    S.dom.modal.querySelectorAll('#product-barcode, [data-variant-barcode], [data-mb-barcode]').forEach(el => add(el.value));
    if (extraBarcodes) extraBarcodes.forEach(c => add(c));
    return set;
  }


  S.fn.nextUniqueBarcode = function nextUniqueBarcode(extraSet) {
    if (!window.SlinkBarcodeTools) return '';
    return window.SlinkBarcodeTools.generateUniqueEan13(S.fn.knownBarcodeSet(extraSet), '20');
  }


  S.fn.isAutoBarcodeKeyword = function isAutoBarcodeKeyword(value) {
    const normalized = String(value || '').normalize('NFC').trim().toLocaleLowerCase('vi');
    return normalized === 'auto' || normalized === 'tự tạo' || normalized === 'tu tao';
  }


  S.fn.parseProductImportCsv = function parseProductImportCsv(text) {
    let parsed;
    try { parsed = S.fn.parseCsvDocument(text); }
    catch (error) { return { items: [], errors: [error.message] }; }
    const rows = parsed.filter(function (record, index) { return index === 0 || record.cells.some(function (cell) { return String(cell || '').trim() !== ''; }); });
    if (!rows.length) return { items: [], errors: ['Tệp CSV đang trống.'] };
    const headers = rows[0].cells.map(function (cell) { return String(cell || '').trim(); });
    const legacyTemplate = headers.length === S.state.productImportBaseHeaders.length && S.state.productImportBaseHeaders.every(function (header, index) { return headers[index] === header; });
    const variantTemplate = headers.length === S.state.productImportVariantHeaders.length && S.state.productImportVariantHeaders.every(function (header, index) { return headers[index] === header; });
    const fullTemplate = headers.length === S.state.productImportHeaders.length && S.state.productImportHeaders.every(function (header, index) { return headers[index] === header; });
    if (!legacyTemplate && !variantTemplate && !fullTemplate) {
      return { items: [], errors: ['Tiêu đề cột không đúng mẫu Slink. Hãy tải tệp mẫu CSV rồi điền dữ liệu vào.'] };
    }
    const dataRows = rows.slice(1);
    const errors = [];
    if (!dataRows.length) errors.push('Tệp chưa có dòng sản phẩm nào.');
    if (dataRows.length > 200) errors.push('Mỗi lần nhập tối đa 200 sản phẩm. Hãy chia tệp thành nhiều phần.');
    const seenSkus = new Map();
    const seenBarcodes = new Map();
    const seenSerials = new Map();
    const autoSeedBarcodes = new Set();
    dataRows.slice(0, 200).forEach(r => {
      const b = String(r.cells[1] || '').trim();
      if (b && !S.fn.isAutoBarcodeKeyword(b)) autoSeedBarcodes.add(b);
    });
    const variantGroups = new Map();
    const items = [];
    const expectedColumns = legacyTemplate ? S.state.productImportBaseHeaders.length : variantTemplate ? S.state.productImportVariantHeaders.length : S.state.productImportHeaders.length;
    dataRows.slice(0, 200).forEach(function (record, rowIdx) {
      const line = record.line;
      const cells = record.cells;
      const rowErrors = [];
      if (cells.length !== expectedColumns) rowErrors.push(`Dòng ${line}: số cột không khớp mẫu.`);
      const values = Array.from({ length: expectedColumns }, function (_value, cellIndex) { return String(cells[cellIndex] || '').trim(); });
      const rawSku = values[0];
      const sku = rawSku || S.fn.newProductSku();
      const rawBarcode = values[1];
      let barcode = rawBarcode || null;
      if (rawBarcode && S.fn.isAutoBarcodeKeyword(rawBarcode)) {
        try { barcode = S.fn.nextUniqueBarcode(autoSeedBarcodes); }
        catch (error) { rowErrors.push(`Dòng ${line}: ${error.message}`); barcode = null; }
        if (!barcode && !rowErrors.length) rowErrors.push(`Dòng ${line}: không thể tự tạo mã vạch tự động lúc này.`);
      }
      if (barcode) autoSeedBarcodes.add(barcode);
      const name = values[2];
      const category = values[3] || 'Chưa phân loại';
      const unit = values[4] || 'cái';
      if (!sku || sku.length > 80) rowErrors.push(`Dòng ${line}: mã SKU cần có từ 1 đến 80 ký tự.`);
      if (!name || name.length > 240) rowErrors.push(`Dòng ${line}: tên sản phẩm cần có từ 1 đến 240 ký tự.`);
      if (category.length > 120) rowErrors.push(`Dòng ${line}: danh mục tối đa 120 ký tự.`);
      if (unit.length > 40) rowErrors.push(`Dòng ${line}: đơn vị tối đa 40 ký tự.`);
      if (barcode && (barcode.length > 120 || /[\x00-\x1f\x7f]/.test(barcode))) rowErrors.push(`Dòng ${line}: mã vạch cần từ 1 đến 120 ký tự hợp lệ.`);

      function integerVnd(value, label, required) {
        if (!value && !required) return 0;
        const cleaned = /^\d{1,3}(?:[.,]\d{3})+$/.test(value) ? value.replace(/[.,]/g, '') : value;
        if (!/^\d+$/.test(cleaned)) { rowErrors.push(`Dòng ${line}: ${label} phải là số tiền VND nguyên không âm.`); return 0; }
        const amount = Number(cleaned);
        if (!Number.isSafeInteger(amount)) { rowErrors.push(`Dòng ${line}: ${label} vượt giới hạn số an toàn.`); return 0; }
        return amount;
      }
      function quantity(value, label) {
        if (!value) return '0';
        const cleaned = value.replace(',', '.');
        if (!/^\d{1,10}(?:\.\d{1,3})?$/.test(cleaned)) { rowErrors.push(`Dòng ${line}: ${label} phải không âm và có tối đa 3 chữ số thập phân.`); return '0'; }
        return cleaned;
      }

      const salePriceVnd = integerVnd(values[5], 'Giá bán', true);
      const costVnd = integerVnd(values[6], 'Giá vốn', false);
      const lowStockThreshold = quantity(values[7], 'Ngưỡng tồn tối thiểu');
      const trackedText = values[8].toLocaleLowerCase('vi');
      let inventoryTracked = true;
      if (trackedText === 'không' || trackedText === 'khong') inventoryTracked = false;
      else if (trackedText && trackedText !== 'có' && trackedText !== 'co') rowErrors.push(`Dòng ${line}: cột theo dõi tồn kho chỉ nhận “Có” hoặc “Không”.`);
      let openingQuantity = quantity(values[9], 'Tồn đầu kỳ');
      const rawSerialsText = fullTemplate ? values[12] : '';
      const serialCodes = [];
      let serialTracked = false;
      if (rawSerialsText) {
        const parts = rawSerialsText.split(/[\r\n,;|]+/).map(s => s.trim()).filter(Boolean);
        if (parts.length > 500) rowErrors.push(`Dòng ${line}: mỗi dòng sản phẩm tối đa 500 mã riêng.`);
        for (const sc of parts) {
          if (sc.length > 120 || /[\x00-\x1f\x7f]/.test(sc)) {
            rowErrors.push(`Dòng ${line}: mã riêng “${sc.slice(0, 30)}” không hợp lệ.`);
            continue;
          }
          const k = sc.toLocaleLowerCase('vi');
          if (seenSerials.has(k)) rowErrors.push(`Dòng ${line}: mã riêng “${sc}” trùng với dòng ${seenSerials.get(k)} trong tệp.`);
          else {
            seenSerials.set(k, line);
            serialCodes.push(sc);
          }
        }
        if (serialCodes.length) {
          serialTracked = true;
          inventoryTracked = true;
          if (values[9] && Number(openingQuantity) !== serialCodes.length) {
            rowErrors.push(`Dòng ${line}: tồn đầu kỳ (${values[9]}) không khớp số mã riêng (${serialCodes.length}). Để trống cột Tồn đầu kỳ hoặc điền đúng ${serialCodes.length}.`);
          }
          openingQuantity = String(serialCodes.length);
        }
      }
      if (!inventoryTracked && Number(openingQuantity) > 0) rowErrors.push(`Dòng ${line}: sản phẩm không theo dõi tồn kho phải có tồn đầu kỳ bằng 0.`);
      const normalizedSku = sku.toLocaleLowerCase('vi');
      if (sku && seenSkus.has(normalizedSku)) rowErrors.push(`Dòng ${line}: SKU trùng với dòng ${seenSkus.get(normalizedSku)} trong tệp.`);
      else if (sku) seenSkus.set(normalizedSku, line);
      if (barcode && seenBarcodes.has(barcode)) rowErrors.push(`Dòng ${line}: mã vạch trùng với dòng ${seenBarcodes.get(barcode)} trong tệp.`);
      else if (barcode) seenBarcodes.set(barcode, line);
      const variantGroupName = legacyTemplate ? '' : values[10];
      const variantAttributesText = legacyTemplate ? '' : values[11];
      let variantAttributes = null;
      if (Boolean(variantGroupName) !== Boolean(variantAttributesText)) {
        rowErrors.push(`Dòng ${line}: cần điền đồng thời tên nhóm và thuộc tính biến thể.`);
      } else if (variantGroupName) {
        if (variantGroupName.length > 200) rowErrors.push(`Dòng ${line}: tên nhóm biến thể tối đa 200 ký tự.`);
        try {
          const entries = S.fn.parseVariantAttributesText(variantAttributesText, items.length);
          variantAttributes = Object.fromEntries(entries.map(function (entry) { return [entry.name, entry.value]; }));
          const groupKey = variantGroupName.toLocaleLowerCase('vi');
          const group = variantGroups.get(groupKey) || { name: variantGroupName, category: category, unit: unit, attributes: null, signatures: new Set(), count: 0 };
          const keys = Object.keys(variantAttributes).map(function (key) { return key.toLocaleLowerCase('vi'); }).sort();
          const keySignature = JSON.stringify(keys);
          const signature = JSON.stringify(Object.entries(variantAttributes).map(function (entry) { return [entry[0].toLocaleLowerCase('vi'), entry[1].toLocaleLowerCase('vi')]; }).sort(function (a, b) { return a[0].localeCompare(b[0], 'vi'); }));
          if (group.category !== category || group.unit !== unit) rowErrors.push(`Dòng ${line}: danh mục và đơn vị phải giống nhau trong cùng nhóm biến thể.`);
          if (group.attributes && group.attributes !== keySignature) rowErrors.push(`Dòng ${line}: tên thuộc tính phải giống các dòng khác trong nhóm.`);
          if (group.signatures.has(signature)) rowErrors.push(`Dòng ${line}: tổ hợp thuộc tính bị trùng trong nhóm.`);
          group.attributes = keySignature;
          group.signatures.add(signature);
          group.count += 1;
          variantGroups.set(groupKey, group);
        } catch (error) { rowErrors.push(error.message); }
      }
      if (rowErrors.length) errors.push(...rowErrors);
      else items.push({
        sku, barcode, name, category, unit, salePriceVnd, costVnd, lowStockThreshold, inventoryTracked, openingQuantity, sourceLine: line,
        ...(serialTracked ? { serialTracked: true, serialCodes } : {}),
        ...(variantGroupName ? { variantGroupName, variantAttributes } : {}),
      });
    });
    for (const group of variantGroups.values()) {
      if (group.count < 2) errors.push(`Nhóm “${group.name}” cần ít nhất 2 SKU trong cùng tệp.`);
    }
    return { items: errors.length ? [] : items, errors: errors };
  }


  S.fn.parseProductBulkUpdateCsv = function parseProductBulkUpdateCsv(text) {
    let parsed;
    try { parsed = S.fn.parseCsvDocument(text); }
    catch (error) { return { items: [], errors: [error.message] }; }
    const rows = parsed.filter(function (record, index) { return index === 0 || record.cells.some(function (cell) { return String(cell || '').trim() !== ''; }); });
    if (!rows.length) return { items: [], errors: ['Tệp CSV đang trống.'] };
    const headers = rows[0].cells.map(function (cell) { return String(cell || '').trim(); });
    const required = ['Mã sản phẩm', 'Phiên bản dữ liệu'];
    const editable = [
      ['Cập nhật SKU', 'sku', 'text', 80], ['Cập nhật mã vạch', 'barcode', 'text', 80],
      ['Cập nhật tên sản phẩm', 'name', 'text', 240], ['Cập nhật danh mục', 'category', 'text', 120],
      ['Cập nhật đơn vị', 'unit', 'text', 40], ['Giá bán mới (VND)', 'salePriceVnd', 'vnd'],
      ['Giá vốn mới (VND)', 'costVnd', 'vnd'], ['Ngưỡng tồn mới', 'lowStockThreshold', 'quantity'],
    ];
    const baselineFields = {
      sku: 'SKU', barcode: 'Mã vạch', name: 'Tên sản phẩm', category: 'Danh mục', unit: 'Đơn vị',
      salePriceVnd: 'Giá bán (VND)', costVnd: 'Giá vốn (VND)', lowStockThreshold: 'Ngưỡng tồn thấp',
    };
    const seenHeaders = new Set();
    const duplicateHeader = headers.find(function (header) { if (seenHeaders.has(header)) return true; seenHeaders.add(header); return false; });
    if (duplicateHeader) return { items: [], errors: [`Cột “${duplicateHeader}” xuất hiện nhiều lần.`] };
    const missingRequired = required.filter(function (header) { return !headers.includes(header); });
    if (missingRequired.length) return { items: [], errors: [`Thiếu cột bắt buộc: ${missingRequired.join(', ')}. Hãy dùng CSV xuất từ Slink và giữ nguyên mã sản phẩm, phiên bản dữ liệu.`] };
    const editableHeaders = editable.filter(function (field) { return headers.includes(field[0]); });
    if (!editableHeaders.length && !headers.includes('Xóa mã vạch')) return { items: [], errors: ['Tệp không có cột nào được phép cập nhật.'] };
    const indexes = new Map(headers.map(function (header, index) { return [header, index]; }));
    const dataRows = rows.slice(1);
    const errors = [];
    const seenProducts = new Map();
    const autoBulkBarcodes = new Set();
    const updateBarcodeIndex = indexes.get('Cập nhật mã vạch');
    if (updateBarcodeIndex !== undefined) {
      dataRows.forEach(function (r) {
        const b = String(r.cells[updateBarcodeIndex] || '').trim();
        if (b && !S.fn.isAutoBarcodeKeyword(b)) autoBulkBarcodes.add(b);
      });
    }
    const items = [];
    dataRows.forEach(function (record) {
      const line = record.line;
      const cells = record.cells;
      const rowErrors = [];
      if (cells.length > headers.length && cells.slice(headers.length).some(function (cell) { return String(cell || '').trim() !== ''; })) {
        rowErrors.push(`Dòng ${line}: tệp có cột dữ liệu không nằm trong tiêu đề.`);
      }
      function value(header) {
        const index = indexes.get(header);
        return index === undefined ? '' : String(cells[index] || '').trim();
      }
      const clearBarcodeText = value('Xóa mã vạch');
      const hasAnyUpdate = editableHeaders.some(function (field) { return value(field[0]) !== ''; }) || clearBarcodeText !== '';
      if (!hasAnyUpdate) {
        if (rowErrors.length) errors.push(...rowErrors);
        return;
      }
      if (clearBarcodeText && !/^có$/i.test(clearBarcodeText)) rowErrors.push(`Dòng ${line}: cột “Xóa mã vạch” chỉ nhận “Có” hoặc để trống.`);
      if (clearBarcodeText && value('Cập nhật mã vạch')) rowErrors.push(`Dòng ${line}: không thể vừa xóa vừa cập nhật mã vạch.`);
      const productId = value('Mã sản phẩm').toLowerCase();
      const versionText = value('Phiên bản dữ liệu');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) rowErrors.push(`Dòng ${line}: mã sản phẩm không đúng định dạng.`);
      if (!/^\d+$/.test(versionText) || !Number.isSafeInteger(Number(versionText)) || Number(versionText) < 1) rowErrors.push(`Dòng ${line}: phiên bản dữ liệu không hợp lệ.`);
      if (productId && seenProducts.has(productId)) rowErrors.push(`Dòng ${line}: mã sản phẩm trùng với dòng ${seenProducts.get(productId)}.`);
      else if (productId) seenProducts.set(productId, line);
      const before = {};
      for (const [key, header] of Object.entries(baselineFields)) {
        if (indexes.has(header)) before[key] = value(header);
      }
      const item = { productId: productId, version: Number(versionText), sourceLine: line, before: before };
      if (/^có$/i.test(clearBarcodeText)) item.clearBarcode = true;
      for (const [header, key, kind, max] of editable) {
        if (!indexes.has(header)) continue;
        const field = value(header);
        if (!field) continue;
        if (kind === 'text') {
          let resolvedField = field;
          if (key === 'barcode' && S.fn.isAutoBarcodeKeyword(field)) {
            try { resolvedField = S.fn.nextUniqueBarcode(autoBulkBarcodes); }
            catch (error) { rowErrors.push(`Dòng ${line}: ${error.message}`); resolvedField = ''; }
            if (!resolvedField && !rowErrors.length) rowErrors.push(`Dòng ${line}: không thể tự tạo mã vạch tự động lúc này.`);
          }
          if (key === 'barcode' && resolvedField) autoBulkBarcodes.add(resolvedField);
          if (resolvedField && (resolvedField.length > max || (key === 'barcode' && resolvedField.length < 3))) rowErrors.push(`Dòng ${line}: ${header} có độ dài không hợp lệ.`);
          else if (resolvedField) item[key] = resolvedField;
        } else if (kind === 'vnd') {
          const amount = Number(field);
          if (!/^\d+$/.test(field) || !Number.isSafeInteger(amount) || amount < 0) rowErrors.push(`Dòng ${line}: ${header} phải là VND nguyên không âm, không có dấu phân cách.`);
          else item[key] = amount;
        } else if (!/^\d{1,11}(?:\.\d{1,3})?$/.test(field)) {
          rowErrors.push(`Dòng ${line}: ${header} phải không âm và có tối đa 3 chữ số thập phân.`);
        } else item[key] = field;
      }
      if (rowErrors.length) errors.push(...rowErrors);
      else items.push(item);
    });
    if (!items.length && !errors.length) errors.push('Chưa có ô cập nhật nào được điền.');
    if (items.length > 200) errors.push('Mỗi lần cập nhật tối đa 200 sản phẩm có thay đổi. Hãy chia tệp thành nhiều phần.');
    return { items: errors.length ? [] : items, errors: errors };
  }


  S.fn.renderProductImportPreview = function renderProductImportPreview() {
    const preview = S.dom.modal.querySelector('#product-import-preview');
    const submit = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    const warehouseSelect = S.dom.modal.querySelector('#product-import-warehouse');
    if (!preview) return;
    if (warehouseSelect && !S.state.productImportPending) warehouseSelect.disabled = S.state.productImportReading;
    if (S.state.productImportReading) {
      preview.innerHTML = `<div class='notice-item' role='status'><span>…</span><span><strong>Đang kiểm tra tệp CSV</strong><small>Slink đang kiểm tra dữ liệu và mã trùng trên máy chủ; bước này chưa ghi sản phẩm.</small></span></div>`;
    } else if (S.state.productImportErrors.length) {
      preview.innerHTML = `<div class='auth-message error'><strong>Chưa thể nhập tệp.</strong><br/>${S.state.productImportErrors.slice(0, 8).map(S.fn.esc).join('<br/>')}${S.state.productImportErrors.length > 8 ? `<br/>Còn ${S.state.productImportErrors.length - 8} lỗi khác.` : ''}</div>`;
    } else if (S.state.productImportRows.length) {
      const warehouseSummary = S.state.productImportWarehouseName && S.fn.totalImportQuantity(S.state.productImportRows) !== '0'
        ? `Tồn đầu kỳ sẽ được ghi vào kho ${S.fn.esc(S.state.productImportWarehouseName)}. ` : '';
      const variantGroupCount = new Set(S.state.productImportRows.map(function (item) { return item.variantGroupName?.toLocaleLowerCase('vi'); }).filter(Boolean)).size;
      const variantSummary = variantGroupCount ? ` · ${S.fn.number(variantGroupCount)} nhóm biến thể` : '';
      const missingBarcodeCount = S.state.productImportRows.filter(function (item) { return !item.barcode && !item.serialTracked; }).length;
      const serialRowsCount = S.state.productImportRows.filter(function (item) { return item.serialTracked; }).length;
      const barcodeActionBanner = !S.state.productImportPending && missingBarcodeCount > 0 && window.SlinkBarcodeTools
        ? `<div class='import-barcode-bar'><span>Có <strong>${S.fn.number(missingBarcodeCount)}</strong> sản phẩm chưa có mã vạch.</span><button class='btn btn-secondary' type='button' data-action='import-fill-barcodes'>Tự tạo ${S.fn.number(missingBarcodeCount)} mã EAN-13</button></div>`
        : '';
      preview.innerHTML = `<div class='notice-item'><span>${S.fn.icon('check', 18)}</span><span><strong>${S.fn.number(S.state.productImportRows.length)} sản phẩm sẵn sàng${variantSummary}${serialRowsCount ? ` · ${S.fn.number(serialRowsCount)} SP mã riêng` : ''}</strong><small>${warehouseSummary}Tổng tồn đầu: ${S.fn.totalImportQuantity(S.state.productImportRows)}.</small></span></div>${barcodeActionBanner}<div class='table-wrap'><table class='data-table'><thead><tr><th>SKU / mã</th><th>Sản phẩm</th><th class='text-right'>Giá bán / vốn</th><th class='text-right'>Tồn đầu</th><th>Quản lý</th></tr></thead><tbody>${S.state.productImportRows.map(function (item) { const attributes = Object.entries(item.variantAttributes || {}).map(function (entry) { return `${entry[0]}=${entry[1]}`; }).join('; '); const displayName = item.variantGroupName ? `${item.variantGroupName} · ${Object.values(item.variantAttributes || {}).join(' · ')}` : item.name; const codeSub = item.serialTracked ? `${S.fn.number(item.serialCodes?.length || 0)} mã riêng` : (item.barcode || 'Chưa có mã'); return `<tr><td><span class='product-name-stack'><strong>${S.fn.esc(item.sku)}</strong><small>${S.fn.esc(codeSub)}</small></span></td><td><span class='product-name-stack'><strong>${S.fn.esc(displayName)}</strong><small>${item.variantGroupName ? `${S.fn.esc(item.variantGroupName)} · ${S.fn.esc(attributes)}` : `${S.fn.esc(item.category)} · ${S.fn.esc(item.unit)}`}</small></span></td><td class='text-right'><span class='product-name-stack'><strong>${S.fn.money(Number(item.salePriceVnd))}</strong><small>Vốn ${S.fn.money(Number(item.costVnd))}</small></span></td><td class='text-right'><strong>${S.fn.formatImportQuantity(item.openingQuantity)} ${S.fn.esc(item.unit)}</strong></td><td>${item.serialTracked ? 'Mã riêng' : item.inventoryTracked ? 'Số lượng' : 'Không tồn'}</td></tr>`; }).join('')}</tbody></table></div>`;
    } else preview.innerHTML = `<div class='empty-state'><strong>Chưa chọn tệp</strong><span>Tải tệp mẫu CSV, điền hàng hóa rồi chọn tệp để xem trước.</span></div>`;
    const selectedWarehouseId = warehouseSelect?.value || '';
    const verified = S.state.productImportPending || S.state.productImportVerifiedWarehouseId === selectedWarehouseId;
    if (submit) submit.disabled = S.state.productImportReading || S.state.productImportRows.length === 0 || S.state.productImportErrors.length > 0 || !verified;
  }


  S.fn.previewProductImportAtWarehouse = async function previewProductImportAtWarehouse(items) {
    const requestStoreId = S.state.store.id;
    const requestSession = S.state.authSession;
    const readNumber = ++S.state.productImportReadNumber;
    const readGeneration = S.state.modalGeneration;
    const warehouseSelect = S.dom.modal.querySelector('#product-import-warehouse');
    const warehouseId = warehouseSelect?.value || '';
    S.state.productImportReading = true;
    S.state.productImportRows = [];
    S.state.productImportErrors = [];
    S.state.productImportVerifiedWarehouseId = '';
    S.state.productImportWarehouseName = '';
    S.fn.renderProductImportPreview();
    if (!warehouseId) {
      S.state.productImportReading = false;
      S.state.productImportErrors = ['Cửa hàng chưa có kho đang hoạt động được phép nhận tồn đầu kỳ.'];
      S.fn.renderProductImportPreview();
      return;
    }
    try {
      const previewResult = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(requestStoreId)}/products/import/preview`, {
        method: 'POST', body: { items, warehouseId },
      });
      if (S.state.store.id !== requestStoreId || S.state.authSession !== requestSession || readGeneration !== S.state.modalGeneration || readNumber !== S.state.productImportReadNumber || S.dom.modal.hidden) return;
      S.state.productImportReading = false;
      if (!previewResult.valid) S.state.productImportErrors = [previewResult.conflict || 'Tệp có mã sản phẩm đã tồn tại trong cửa hàng.'];
      else if (previewResult.warehouseId !== warehouseId) S.state.productImportErrors = ['Kho xem trước đã thay đổi. Hãy chọn lại kho để kiểm tra.'];
      else {
        S.state.productImportRows = items;
        S.state.productImportVerifiedWarehouseId = previewResult.warehouseId;
        S.state.productImportWarehouseName = previewResult.warehouseName || '';
      }
    } catch (error) {
      if (S.state.store.id !== requestStoreId || S.state.authSession !== requestSession || readGeneration !== S.state.modalGeneration || readNumber !== S.state.productImportReadNumber || S.dom.modal.hidden) return;
      S.state.productImportReading = false;
      S.state.productImportErrors = [error.status === 401
        ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi chọn tệp để kiểm tra.'
        : `Chưa kiểm tra được dữ liệu với cửa hàng: ${error.message} Tệp chưa được nhập.`];
    }
    S.fn.renderProductImportPreview();
  }


  S.fn.renderProductBulkUpdatePreview = function renderProductBulkUpdatePreview() {
    const preview = S.dom.modal.querySelector('#product-bulk-update-preview');
    const submit = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (!preview) return;
    if (S.state.productBulkUpdateReading) {
      preview.innerHTML = `<div class='notice-item' role='status'><span>…</span><span><strong>Đang đối chiếu tệp CSV</strong><small>Slink đang kiểm tra phiên bản và mã trùng trên máy chủ; bước này chưa lưu thay đổi.</small></span></div>`;
    } else if (S.state.productBulkUpdateErrors.length) {
      preview.innerHTML = `<div class='auth-message error'><strong>Chưa thể cập nhật tệp.</strong><br/>${S.state.productBulkUpdateErrors.slice(0, 8).map(S.fn.esc).join('<br/>')}${S.state.productBulkUpdateErrors.length > 8 ? `<br/>Còn ${S.state.productBulkUpdateErrors.length - 8} lỗi khác.` : ''}</div>`;
    } else if (S.state.productBulkUpdateRows.length) {
      const labels = { sku: 'SKU', barcode: 'Mã vạch', name: 'Tên', category: 'Danh mục', unit: 'Đơn vị', salePriceVnd: 'Giá bán', costVnd: 'Giá vốn', lowStockThreshold: 'Ngưỡng tồn' };
      const changedCount = S.state.productBulkUpdateRows.filter(function (item) { return !item.unchanged; }).length;
      const unchangedCount = S.state.productBulkUpdateRows.length - changedCount;
      const displayValue = function (key, value) {
        if (key === 'salePriceVnd' || key === 'costVnd') return S.fn.money(Number(value));
        if (key === 'lowStockThreshold') return S.fn.formatImportQuantity(value);
        return S.fn.esc(value || (key === 'barcode' ? 'Không có' : 'Trống'));
      };
      preview.innerHTML = `<div class='notice-item'><span>${S.fn.icon('check', 18)}</span><span><strong>${S.fn.number(S.state.productBulkUpdateRows.length)} dòng · ${S.fn.number(changedCount)} có thay đổi · ${S.fn.number(unchangedCount)} giữ nguyên</strong><small>Giá trị “trước” được lấy trực tiếp từ cửa hàng. Khi lưu, máy chủ sẽ khóa và kiểm tra lại toàn bộ lô; nếu một dòng lỗi hoặc đã đổi, mọi cập nhật đều bị hủy.</small></span></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Dòng / mã sản phẩm</th><th>Giá trị hiện tại → giá trị mới</th></tr></thead><tbody>${S.state.productBulkUpdateRows.map(function (item) { const keys = Object.keys(labels).filter(function (key) { return Object.hasOwn(item, key) || (key === 'barcode' && item.clearBarcode); }); const changes = keys.map(function (key) { const before = item.before && Object.hasOwn(item.before, key) ? displayValue(key, item.before[key]) : 'Không có trong tệp'; const after = item.clearBarcode && key === 'barcode' ? 'Xóa mã vạch' : displayValue(key, item[key]); return `<span class='product-name-stack'><strong>${labels[key]}</strong><small>${before} → ${after}</small></span>`; }).join(''); return `<tr><td><span class='product-name-stack'><strong>Dòng ${S.fn.number(item.sourceLine)}</strong><small>${S.fn.esc(item.productId)}</small>${item.unchanged ? '<small>Không đổi</small>' : ''}</span></td><td>${changes}</td></tr>`; }).join('')}</tbody></table></div>`;
    } else {
      preview.innerHTML = `<div class='empty-state'><strong>Chưa chọn tệp</strong><span>Xuất danh sách sản phẩm, sửa những cột cần thiết rồi tải CSV lên để xem trước.</span></div>`;
    }
    if (submit) submit.disabled = S.state.productBulkUpdateReading || S.state.productBulkUpdateRows.length === 0 || S.state.productBulkUpdateErrors.length > 0;
  }


  S.fn.openProductBulkUpdate = function openProductBulkUpdate() {
    const pending = S.fn.loadPendingProductBulkUpdate();
    S.state.productBulkUpdateReading = false;
    S.state.productBulkUpdateRows = pending ? pending.payload.items : [];
    S.state.productBulkUpdateErrors = [];
    const body = `<form id='entity-form' data-form='product-bulk-update'><div class='form-field full'><label class='input-label' for='product-bulk-update-file'>Chọn tệp CSV sản phẩm đã chỉnh sửa</label><input class='input' id='product-bulk-update-file' type='file' accept='.csv,text/csv' ${pending ? 'disabled' : ''}/></div><div id='product-bulk-update-preview' class='product-import-preview' aria-live='polite'></div></form>`;
    const footer = `<button class='btn btn-secondary' type='button' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Gửi lại cập nhật đang chờ' : 'Cập nhật sản phẩm'}</button>`;
    S.fn.showModal(pending ? 'Kiểm tra cập nhật đang chờ' : 'Cập nhật nhiều sản phẩm', pending ? 'Gửi lại đúng lô trước đó để xác nhận, không nhân đôi thay đổi.' : '', body, footer, true);
    S.fn.renderProductBulkUpdatePreview();
  }


  S.fn.openProductImport = function openProductImport() {
    const pending = S.fn.loadPendingProductImport();
    S.state.productImportReading = false;
    S.state.productImportPending = Boolean(pending);
    S.state.productImportRows = pending ? pending.payload.items : [];
    S.state.productImportSourceRows = pending ? pending.payload.items : [];
    S.state.productImportErrors = [];
    const requestedWarehouseId = pending ? (pending.payload.warehouseId || '') : (S.state.warehouses.some(function (warehouse) { return warehouse.id === S.state.selectedWarehouseId; }) ? S.state.selectedWarehouseId : (S.state.warehouses[0]?.id || ''));
    const selectedWarehouse = S.state.warehouses.find(function (warehouse) { return warehouse.id === requestedWarehouseId; });
    S.state.productImportVerifiedWarehouseId = pending ? requestedWarehouseId : '';
    S.state.productImportWarehouseName = selectedWarehouse?.name || '';
    const warehouseOptions = S.state.warehouses.map(function (warehouse) {
      return `<option value='${S.fn.esc(warehouse.id)}' ${warehouse.id === requestedWarehouseId ? 'selected' : ''}>${S.fn.esc(warehouse.name)}${warehouse.is_default ? ' · Mặc định' : ''}</option>`;
    }).join('');
    const body = `<form id='entity-form' data-form='product-import'><div class='import-start-help'><div class='heading-actions'><button class='btn btn-secondary' type='button' data-action='download-product-import-template'>Tải tệp mẫu (.csv)</button><button class='btn btn-secondary' type='button' data-action='download-product-import-sample'>Tải mẫu có ví dụ</button></div></div><div class='form-grid'><div class='form-field'><label class='input-label' for='product-import-file'>Chọn tệp CSV</label><input class='input' id='product-import-file' type='file' accept='.csv,text/csv' ${pending ? 'disabled' : ''}/></div><div class='form-field'><label class='input-label' for='product-import-warehouse'>Kho nhận tồn đầu</label><select class='input' id='product-import-warehouse' ${pending || !S.state.warehouses.length ? 'disabled' : ''}>${warehouseOptions || `<option value=''>Chưa có kho</option>`}</select></div></div><details class='quick-product-details'><summary>Quy ước cột nhanh</summary><p>Để trống <strong>Mã SKU</strong> để Slink tự tạo. Cột <strong>Mã vạch</strong> nhận mã số, mã chữ/QR hoặc <code>AUTO</code>. Hàng quản lý theo từng mã riêng (Serial/IMEI) điền cột cuối, cách nhau bằng dấu <code>|</code> (tồn đầu tự tính theo số mã).</p></details><div id='product-import-preview' class='product-import-preview' aria-live='polite'></div></form>`;
    const footer = `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Gửi lại lần nhập đang chờ' : 'Nhập hàng hóa'}</button>`;
    S.fn.showModal(pending ? 'Kiểm tra lần nhập đang chờ' : 'Nhập hàng từ file', '', body, footer, true);
    S.fn.renderProductImportPreview();
  }


  S.fn.downloadProductImportTemplate = function downloadProductImportTemplate(withSample = false) {
    const quoteCsv = (cells) => cells.map(function (cell) { return '"' + String(cell ?? '').replace(/"/g, '""') + '"'; }).join(',');
    const sampleRows = withSample
      ? [
        ['CF-SUADA', '8938505974194', 'Cà phê sữa đá đóng chai', 'Đồ uống', 'chai', '29000', '14000', '10', 'Có', '24', '', '', ''],
        ['SACH-TA', '', 'Sách Tiếng Anh Giao Tiếp', 'Sách', 'cuốn', '120000', '75000', '5', 'Có', '', '', '', 'SACH-TA-01|SACH-TA-02|SACH-TA-03'],
        ['AO-THUN-M', 'AUTO', 'Áo thun cotton M', 'Thời trang', 'cái', '180000', '95000', '5', 'Có', '12', 'Áo thun cotton', 'Màu=Trắng; Cỡ=M', ''],
        ['AO-THUN-L', 'AUTO', 'Áo thun cotton L', 'Thời trang', 'cái', '180000', '95000', '5', 'Có', '12', 'Áo thun cotton', 'Màu=Trắng; Cỡ=L', ''],
      ]
      : [];
    const lines = [quoteCsv(S.state.productImportHeaders), ...sampleRows.map(quoteCsv)];
    const csv = '\uFEFF' + lines.join('\r\n') + '\r\n';
    S.fn.download(withSample ? 'slink-vi-du-nhap-san-pham.csv' : 'slink-mau-nhap-san-pham.csv', csv, 'text/csv;charset=utf-8');
  }


  S.fn.fillImportMissingBarcodes = async function fillImportMissingBarcodes() {
    if (S.state.productImportPending || S.state.productImportReading || !S.state.productImportSourceRows.length || !window.SlinkBarcodeTools) return;
    const seen = S.fn.knownBarcodeSet();
    let updated;
    try {
      updated = S.state.productImportSourceRows.map(function (item) {
        if (item.barcode || item.serialTracked) { if (item.barcode) seen.add(item.barcode); return item; }
        const barcode = window.SlinkBarcodeTools.generateUniqueEan13(seen, '20');
        return { ...item, barcode };
      });
    } catch (error) {
      return S.fn.toast('Chưa thể tự tạo mã vạch', error.message, 'error');
    }
    S.state.productImportSourceRows = updated;
    await S.fn.previewProductImportAtWarehouse(updated);
  }


  S.fn.productPackFields = function productPackFields(product) {
    if (!S.state.productPackDefaultsSupported) return '';
    const pack = product?.purchasePack;
    const name = pack && window.SlinkPurchaseUnits.isPackName(pack.name) ? pack.name : '';
    return `<div class='product-pack'>
      <label class='product-pack-toggle'><input type='checkbox' name='usePurchasePack' ${pack ? 'checked' : ''}/> Nhập theo hộp, ram hoặc thùng</label>
      <div data-product-pack-fields data-legacy-name='${Boolean(pack && !name)}' ${pack ? '' : 'hidden'}>
        ${pack && !name ? `<p class='editor-field-note' data-legacy-pack-note>Chọn tên như Thùng, Hộp hoặc Ram để dùng lại quy đổi đã lưu.</p>` : ''}
        <div class='product-pack-ratio'>
          <label class='form-field'><span class='input-label'>Tên đơn vị nhập</span><span class='product-pack-part'><span aria-hidden='true'>1</span><input class='input' name='packName' list='product-pack-names' maxlength='40' placeholder='Thùng, Hộp, Ram' value='${S.fn.esc(name)}'/></span></label>
          <datalist id='product-pack-names'><option value='Thùng'></option><option value='Hộp'></option><option value='Ram'></option><option value='Lốc'></option><option value='Lô'></option></datalist>
          <span class='product-pack-equals' aria-hidden='true'>=</span>
          <label class='form-field'><span class='input-label'>Số lượng quy đổi</span><span class='product-pack-part'><input class='input' name='packSize' type='number' min='1' max='1000000' step='1' inputmode='numeric' value='${S.fn.esc(pack?.size ?? '')}'/><span data-pack-base-unit>${S.fn.esc(product?.unit || 'cái')}</span></span></label>
        </div>
        <label class='form-field product-pack-price'><span class='input-label'>Giá nhập 1 <span data-pack-name-label>${S.fn.esc(name || 'đơn vị nhập')}</span> (đ)</span><input class='input' name='packCostVnd' type='number' min='0' step='1' value='${S.fn.esc(pack?.unitCostVnd ?? '')}'/></label>
        <p class='product-pack-equation' data-product-pack-equation aria-live='polite' hidden></p>
      </div>
    </div>`;
  }


  S.fn.unchangedLegacyPack = function unchangedLegacyPack(form) {
    const { packName, packSize, packCostVnd, unit } = form.elements;
    return form.querySelector('[data-product-pack-fields]')?.dataset.legacyName === 'true' && !packName.value.trim() &&
      packSize.value === packSize.defaultValue && S.fn.moneyInputRaw(packCostVnd.value) === S.fn.moneyInputRaw(packCostVnd.defaultValue) && unit.value.trim() === unit.defaultValue.trim();
  }

  S.fn.readProductPack = function readProductPack(form) {
    const { usePurchasePack, packName, packSize, packCostVnd } = form.elements;
    if (!usePurchasePack) return undefined;
    if (!usePurchasePack.checked) return null;
    if (S.fn.unchangedLegacyPack(form)) return undefined;
    if (!window.SlinkPurchaseUnits.isPackName(packName.value)) throw new Error('Ghi tên đơn vị nhập, ví dụ Thùng, Hộp hoặc Ram.');
    return window.SlinkPurchaseUnits.fromPack({ name: packName.value, size: packSize.value, quantity: '1', unitCostVnd: S.fn.moneyInputRaw(packCostVnd.value) }).pack;
  }

  S.fn.moneyInputRaw = function moneyInputRaw(value) { return window.SlinkMoneyFields.raw(value); }

  S.fn.updateProductHints = function updateProductHints(form) {
    if (!form || form.dataset.saving === 'true') return;
    const { usePurchasePack, packName, price, unit, inventoryTracked, openingQuantity, minStock } = form.elements;
    const baseUnit = unit?.value.trim() || 'cái';
    const saleUnit = form.querySelector('[data-product-sale-unit]');
    if (saleUnit) saleUnit.textContent = baseUnit;
    if (openingQuantity) openingQuantity.disabled = !inventoryTracked.checked;
    if (minStock) minStock.disabled = !inventoryTracked.checked;
    const trackingNote = form.querySelector('[data-product-tracking-note]');
    if (trackingNote) trackingNote.hidden = inventoryTracked.checked;
    const fields = form.querySelector('[data-product-pack-fields]');
    const rawCost = S.fn.moneyInputRaw(form.elements.cost?.value || '');
    const savedCost = /^\d+$/.test(rawCost) ? BigInt(rawCost) : 0n;
    let packCost = 0n;
    if (fields) {
      const enabled = usePurchasePack.checked, validName = window.SlinkPurchaseUnits.isPackName(packName.value);
      fields.hidden = !enabled;
      fields.querySelectorAll('input').forEach(input => { input.required = enabled; input.disabled = !enabled; });
      packName.required = enabled && !S.fn.unchangedLegacyPack(form);
      packName.setCustomValidity(enabled && packName.value.trim() && !validName ? 'Nhập tên như Thùng, Hộp hoặc Ram.' : '');
      fields.querySelectorAll('.money-shortcut button').forEach(button => { button.disabled = !enabled; });
      fields.querySelector('[data-pack-base-unit]').textContent = baseUnit;
      fields.querySelector('[data-pack-name-label]').textContent = validName ? packName.value.trim() : 'đơn vị nhập';
      const note = fields.querySelector('[data-legacy-pack-note]');
      if (note) note.hidden = validName;
      const preview = fields.querySelector('[data-product-pack-equation]');
      preview.hidden = true;
      try {
        const pack = enabled ? S.fn.readProductPack(form) : null;
        if (pack) {
          packCost = window.SlinkPurchaseUnits.fromPack(pack).unitCostVnd;
          const estimated = packCost * BigInt(pack.size) !== BigInt(pack.unitCostVnd);
          preview.textContent = `1 ${pack.name} = ${S.fn.number(Number(pack.size))} ${baseUnit} · Giá vốn quy đổi ${estimated ? 'khoảng ' : ''}${S.fn.moneyVndText(packCost)} / ${baseUnit}`;
          preview.hidden = false;
        }
      } catch (_) { /* Keep the preview hidden until all three fields are valid. */ }
    }
    if (!price) return;
    const suggestedCost = savedCost > packCost ? savedCost : packCost;
    price.placeholder = suggestedCost > 0n && suggestedCost < BigInt(Number.MAX_SAFE_INTEGER) ? 'Từ ' + window.SlinkMoneyFields.format(String(suggestedCost + 1n)) + ' đ' : 'Giá bán';
    price.title = suggestedCost > 0n ? 'Gợi ý dựa trên giá vốn mỗi đơn vị, chưa gồm chi phí khác.' : '';
    const warning = form.querySelector('[data-product-price-warning]');
    const costConflict = form.querySelector('[data-product-cost-conflict]');
    if (costConflict) {
      const saleRaw = S.fn.moneyInputRaw(price?.value || '');
      const conflict = Boolean(usePurchasePack?.checked && packCost > 0n && rawCost && /^\d+$/.test(saleRaw) && savedCost > BigInt(saleRaw) && savedCost > packCost);
      costConflict.hidden = !conflict;
      if (conflict) costConflict.querySelector('[data-cost-conflict-text]').textContent = `Giá vốn ${S.fn.moneyVndText(savedCost)} / ${baseUnit} cao hơn giá bán, còn giá nhập quy đổi là ${S.fn.moneyVndText(packCost)} / ${baseUnit}. Giá trị tồn dùng giá vốn.`;
    }
    const priceRaw = S.fn.moneyInputRaw(price.value);
    if (warning) {
      const comparedCost = rawCost ? savedCost : packCost;
      warning.hidden = comparedCost <= 0n || !/^\d+$/.test(priceRaw) || BigInt(priceRaw) >= comparedCost;
      price.setAttribute('aria-describedby', warning.hidden ? 'product-sale-unit' : 'product-sale-unit product-price-warning');
    }
  }

  S.fn.productEditorCategory = function productEditorCategory(product, grouped) {
    const selected = product?.category || 'Chưa phân loại';
    const categories = [...new Set([...S.state.store.products.map(item => item.category), selected, 'Chưa phân loại'])].sort((a, b) => a.localeCompare(b, 'vi'));
    const control = grouped ? `<input class='input' id='product-category' name='category' value='${S.fn.esc(selected)}' readonly/>` : `<select class='input' id='product-category' name='category' data-product-category>${categories.map(category => `<option value='${S.fn.esc(category)}' ${category === selected ? 'selected' : ''}>${S.fn.esc(category)}</option>`).join('')}<option value=''>＋ Thêm danh mục…</option></select>`;
    return `<div class='form-field'><label class='input-label' for='product-category'>Danh mục</label>${control}${grouped ? '' : `<label class='form-field' data-new-product-category hidden><span class='input-label'>Tên danh mục mới</span><input class='input' name='newCategory' maxlength='120' disabled/></label>`}</div>`;
  }


  S.fn.loadProductEditorCategories = async function loadProductEditorCategories(form) {
    const select = form.querySelector('[data-product-category]');
    if (!select) return;
    try {
      const { categories } = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products/categories`);
      const add = () => {
        if (!select.isConnected || !Array.isArray(categories)) return;
        const existing = new Set(Array.from(select.options, option => option.value));
        for (const category of categories) if (category && !existing.has(category)) {
          select.add(new Option(category, category), select.options[select.options.length - 1]);
        }
      };
      if (document.activeElement === select) select.addEventListener('blur', add, { once: true });
      else add();
    } catch (_) { /* Loaded categories and manual entry still work. */ }
  }


  S.fn.readProductCategory = function readProductCategory(data) {
    return String(data.get('category') || data.get('newCategory') || '').trim() || 'Chưa phân loại';
  }


  S.fn.updateProductCategoryField = function updateProductCategoryField(select, focus = false) {
    if (!select) return;
    const field = select.form.querySelector('[data-new-product-category]');
    const input = field.querySelector('input');
    const custom = select.value === '';
    field.hidden = !custom;
    input.disabled = !custom;
    input.required = custom;
    if (custom && focus) input.focus();
  }


  S.fn.newProductSku = function newProductSku(key = S.fn.newIdempotencyKey()) {
    return `SL-${key.replace(/[^a-z0-9]/gi, '').slice(0, 16).toUpperCase()}`;
  }


  S.fn.productCostField = function productCostField(product) {
    return `<div class='form-field'><label class='input-label' for='product-unit-cost'>Giá vốn mỗi đơn vị (đ)</label><input class='input' id='product-unit-cost' name='cost' type='number' min='0' step='1' value='${S.fn.esc(product?.cost ?? '')}' placeholder='Bổ sung sau'/><small>Giá trị tồn kho = số lượng đang có × giá vốn này.</small></div>`;
  }


  S.fn.barcodePreviewHtml = function barcodePreviewHtml(code) {
    const clean = String(code || '').trim();
    if (!clean || !window.SlinkBarcodeTools) return '';
    return window.SlinkBarcodeTools.renderBarcodeSvg(clean, { barHeight: 28, showText: true });
  }


  S.fn.productBarcodeFieldHtml = function productBarcodeFieldHtml(barcode, includeCamera = true, fieldClass = 'form-field') {
    const preview = S.fn.barcodePreviewHtml(barcode);
    const camera = includeCamera
      ? `<section class='editor-barcode-camera full' data-scan-surface data-scan-mode='barcode-field' data-scan-target='product-barcode' hidden>
        <video id='scan-camera-video' playsinline muted hidden aria-label='Khung camera để quét mã vạch'></video>
        <p id='scan-camera-status' role='status' aria-live='polite'></p>
        <button class='btn btn-secondary' type='button' data-action='stop-product-barcode'>Đóng camera</button>
      </section>`
      : '';
    return `<div class='${fieldClass}'><label class='input-label' for='product-barcode'>Mã vạch / QR</label><div class='editor-input-action'><input class='input' id='product-barcode' name='barcode' value='${S.fn.esc(barcode || '')}' placeholder='Quét mã số, mã chữ/QR hoặc Tạo mã' maxlength='120' autocomplete='off'/><button class='btn btn-secondary' type='button' data-action='generate-product-barcode' aria-label='Tạo mã vạch EAN-13' title='Tạo mã vạch EAN-13'>Tạo mã</button><button class='btn btn-secondary' type='button' data-action='scan-product-barcode' aria-label='Quét mã vạch bằng camera' title='Quét mã vạch'>${S.fn.icon('scan', 19)}</button></div><div class='barcode-field-preview' data-barcode-field-preview ${preview ? '' : 'hidden'}>${preview}</div></div>${camera}`;
  }


  S.fn.productIdentityFields = function productIdentityFields(product, barcode, grouped, sku = '', includeCost = true, includeBarcode = true) {
    const showCost = includeCost && S.fn.hasPerm('viewCostPrice');
    return `<div class='form-grid'>
      <div class='form-field'><label class='input-label' for='product-sku'>Mã hàng (SKU)${product ? " <span class='editor-required' aria-hidden='true'>*</span>" : ''}</label><div class='editor-input-action'><input class='input' id='product-sku' name='sku' value='${S.fn.esc(product?.sku ?? sku)}' placeholder='Để trống, Slink tự tạo' maxlength='80' ${product ? 'required' : ''}/><button class='btn btn-secondary' type='button' data-action='generate-product-sku' aria-label='Tạo mã SKU' title='Tạo mã SKU'>${S.fn.icon('spark', 19)}</button></div></div>
      ${includeBarcode ? S.fn.productBarcodeFieldHtml(barcode, true) : ''}
      ${S.fn.productEditorCategory(product, grouped)}
      ${showCost ? S.fn.productCostField(product) : ''}
    </div>`;
  }


  S.fn.productSaleFields = function productSaleFields(product, grouped, includeCost = false) {
    const showCost = includeCost && S.fn.hasPerm('viewCostPrice');
    return `<div class='form-grid editor-sale-fields'>
      <div class='form-field'><label class='input-label' for='quick-product-price'>Giá bán (đ) <span class='editor-required' aria-hidden='true'>*</span></label><input class='input' id='quick-product-price' name='price' type='number' min='0' step='1' value='${S.fn.esc(product?.price ?? '')}' required aria-describedby='product-sale-unit product-price-warning'/><small id='product-sale-unit'>Giá của 1 <span data-product-sale-unit>${S.fn.esc(product?.unit || 'cái')}</span></small></div>
      <div class='form-field'><label class='input-label' for='product-base-unit'>Đơn vị tính</label><input class='input' id='product-base-unit' name='unit' value='${S.fn.esc(product?.unit || 'cái')}' list='product-base-units' maxlength='40' ${grouped ? 'readonly' : ''}/><datalist id='product-base-units'><option value='cái'></option><option value='chiếc'></option><option value='tờ'></option><option value='hộp'></option><option value='quyển'></option><option value='kg'></option></datalist></div>
      ${showCost ? S.fn.productCostField(product) : ''}
      <div class='form-field'><label class='input-label' for='product-warranty-months'>Bảo hành (tháng)</label><input class='input' id='product-warranty-months' name='warrantyMonths' type='number' min='0' max='120' step='1' inputmode='numeric' value='${S.fn.esc(product?.warrantyMonths ?? 0)}' placeholder='0'/></div>
      <p class='editor-field-note editor-price-warning full' id='product-price-warning' data-product-price-warning role='status' hidden>Giá bán thấp hơn giá vốn mỗi đơn vị. Kiểm tra lại số tiền trước khi lưu.</p>
      <div class='editor-field-note editor-price-warning full' data-product-cost-conflict role='status' hidden><span data-cost-conflict-text></span> <button type='button' class='link-button' data-action='use-pack-cost'>Dùng giá nhập quy đổi</button><label><input type='checkbox' name='confirmCostMismatch'/> Giữ giá vốn đã nhập</label></div>
    </div>`;
  }


  S.fn.productTrackingFields = function productTrackingFields(product, adding = false) {
    const tracked = !product || product.inventoryTracked;
    const warehouse = (S.state.page === 'inventory' || S.state.page === 'pos') && S.state.warehouses.find(item => item.id === S.state.selectedWarehouseId);
    const stock = product ? `<div class='form-field'><span class='input-label'>Tồn kho hiện tại</span><strong class='editor-stock-value'>${tracked ? `${S.fn.number(product.stock)} ${S.fn.esc(product.unit)}` : 'Chưa theo dõi'}</strong>${warehouse && tracked ? `<small>${S.fn.esc(warehouse.name)}</small>` : ''}</div>` : '';
    const note = adding ? 'Khi tắt theo dõi, mặt hàng được tạo với tồn bằng 0.' : product?.inventoryTracked ? 'Để tắt theo dõi, tồn kho và lượng đang giữ ở các kho cần về 0.' : '';
    return `<label class='editor-stock-switch'><span>Theo dõi số lượng trong kho</span><input type='checkbox' role='switch' name='inventoryTracked' ${tracked ? 'checked' : ''}/></label>
      ${note ? `<p class='editor-field-note' data-product-tracking-note hidden>${note}</p>` : ''}
      <div class='form-grid editor-stock-fields'>${stock}<div class='form-field'><label class='input-label' for='product-stock-threshold'>Nhắc khi tồn ít</label><input class='input' id='product-stock-threshold' name='minStock' type='number' min='0' step='0.001' value='${S.fn.esc(product?.minStock ?? 0)}'/></div></div>`;
  }


  S.fn.readFormSerialCodes = function readFormSerialCodes(form) {
    if (!form) return [];
    try {
      const parsed = JSON.parse(form.dataset.serialCodes || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }


  S.fn.renderFormSerialChips = function renderFormSerialChips(form) {
    if (!form) return;
    const codes = S.fn.readFormSerialCodes(form);
    const list = form.querySelector('[data-serial-chips]');
    const countEl = form.querySelector('[data-serial-count]');
    if (countEl) countEl.textContent = S.fn.number(codes.length);
    if (!list) return;
    if (!codes.length) {
      list.innerHTML = `<div class='serial-chips-empty'>Chưa có mã nào — quét bằng máy/camera hoặc bấm Tự sinh mã.</div>`;
      return;
    }
    list.innerHTML = codes.map((code, idx) => `<span class='serial-chip'><span>${S.fn.esc(code)}</span><button type='button' data-action='remove-form-serial' data-index='${idx}' aria-label='Xóa mã ${S.fn.esc(code)}'>×</button></span>`).join('');
  }


  S.fn.appendFormSerialCode = function appendFormSerialCode(form, rawCode) {
    if (!form) return { ok: false, reason: 'Biểu mẫu không tồn tại.' };
    const code = String(rawCode || '').trim();
    if (!code || code.length > 120 || /[\x00-\x1f\x7f]/.test(code)) {
      return { ok: false, reason: 'Mã không hợp lệ (1–120 ký tự).' };
    }
    const codes = S.fn.readFormSerialCodes(form);
    if (codes.length >= 500) return { ok: false, reason: 'Tối đa 500 mã mỗi lần.' };
    const key = code.toLocaleLowerCase('vi');
    if (codes.some(c => c.toLocaleLowerCase('vi') === key)) {
      return { ok: false, reason: `Mã “${code}” đã có trong danh sách.` };
    }
    codes.push(code);
    form.dataset.serialCodes = JSON.stringify(codes);
    S.fn.renderFormSerialChips(form);
    S.fn.playScanBeep();
    return { ok: true, code, total: codes.length };
  }


  S.fn.removeFormSerialCode = function removeFormSerialCode(form, index) {
    if (!form) return;
    const codes = S.fn.readFormSerialCodes(form);
    if (index < 0 || index >= codes.length) return;
    codes.splice(index, 1);
    form.dataset.serialCodes = JSON.stringify(codes);
    S.fn.renderFormSerialChips(form);
  }


  S.fn.autoGenerateFormSerials = function autoGenerateFormSerials(form, countRaw, prefixRaw) {
    if (!form) return;
    const count = Number.parseInt(String(countRaw || ''), 10);
    if (!Number.isSafeInteger(count) || count < 1 || count > 200) {
      return S.fn.toast('Số lượng không hợp lệ', 'Nhập số lượng từ 1 đến 200 mã.', 'error');
    }
    const existing = S.fn.readFormSerialCodes(form);
    if (existing.length + count > 500) {
      return S.fn.toast('Vượt giới hạn', 'Tổng số mã mỗi lần tối đa 500.', 'error');
    }
    const used = S.fn.knownBarcodeSet(existing);
    existing.forEach(c => used.add(c.toLocaleLowerCase('vi')));
    const cleanPrefix = String(prefixRaw || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
    const added = [];
    for (let i = 0; i < count; i += 1) {
      let candidate = '';
      if (!cleanPrefix && window.SlinkBarcodeTools) {
        candidate = window.SlinkBarcodeTools.generateUniqueEan13(used, '21');
        used.add(candidate.toLocaleLowerCase('vi'));
      } else {
        const basePrefix = cleanPrefix || 'SP';
        for (let attempt = 0; attempt < 64; attempt += 1) {
          const seq = String(existing.length + i + 1 + attempt).padStart(3, '0');
          const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
          const trial = attempt === 0 ? `${basePrefix}-${seq}` : `${basePrefix}-${rand}`;
          if (!used.has(trial) && !used.has(trial.toLocaleLowerCase('vi'))) {
            candidate = trial;
            used.add(trial);
            used.add(trial.toLocaleLowerCase('vi'));
            break;
          }
        }
      }
      if (candidate) added.push(candidate);
    }
    form.dataset.serialCodes = JSON.stringify([...existing, ...added]);
    S.fn.renderFormSerialChips(form);
    S.fn.toast('Đã tạo mã riêng', `Thêm ${S.fn.number(added.length)} mã (tổng ${S.fn.number(existing.length + added.length)}).`);
  }


  S.fn.serialCapturePanelHtml = function serialCapturePanelHtml(initialPrefix = '') {
    return `<div class='serial-builder-panel'>
      <div class='editor-input-action'>
        <input class='input' id='serial-rapid-input' type='text' maxlength='120' placeholder='Quét hoặc gõ mã số, mã chữ, QR rồi Enter…' autocomplete='off'/>
        <button class='btn btn-secondary' type='button' data-action='add-serial-from-input'>＋ Thêm</button>
        <button class='btn btn-secondary' type='button' data-action='scan-serial-list' aria-label='Quét mã bằng camera' title='Quét camera liên tiếp'>${S.fn.icon('scan', 19)}</button>
      </div>
      <section class='editor-barcode-camera' data-scan-surface data-scan-mode='serial-list' data-scan-target='serial-rapid-input' hidden>
        <video id='scan-camera-video' playsinline muted hidden aria-label='Camera quét liên tiếp mã riêng'></video>
        <p id='scan-camera-status' role='status' aria-live='polite'></p>
        <button class='btn btn-secondary' type='button' data-action='stop-serial-camera'>Đóng camera</button>
      </section>
      <div class='serial-autogen-row'>
        <input class='input' id='serial-auto-count' type='number' min='1' max='200' step='1' inputmode='numeric' placeholder='Số lượng (VD: 10)' aria-label='Số lượng mã muốn tự tạo'/>
        <input class='input' id='serial-auto-prefix' maxlength='20' value='${S.fn.esc(initialPrefix)}' placeholder='Tiền tố (VD: SACH) hoặc trống = EAN-13' aria-label='Tiền tố mã tự tạo'/>
        <button class='btn btn-secondary' type='button' data-action='autogen-form-serials'>${S.fn.icon('spark', 15)} Tự sinh mã</button>
      </div>
      <div class='serial-summary-line'><strong>Tổng tồn: <span data-serial-count>0</span></strong><span>1 mã = 1 đơn vị · bán xong tự khóa mã</span></div>
      <div class='serial-chips-box' data-serial-chips></div>
    </div>`;
  }


  S.fn.switchQuickProductMode = function switchQuickProductMode(form, mode) {
    if (!form) return;
    const isSerial = mode === 'serial';
    form.dataset.stockMode = isSerial ? 'serial' : 'standard';
    form.querySelectorAll('[data-action="switch-product-stock-mode"]').forEach(btn => {
      const active = btn.dataset.mode === form.dataset.stockMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const stdBlock = form.querySelector('[data-stock-mode-panel="standard"]');
    const serBlock = form.querySelector('[data-stock-mode-panel="serial"]');
    if (stdBlock) stdBlock.hidden = isSerial;
    if (serBlock) serBlock.hidden = !isSerial;
    if (isSerial) {
      if (form.elements.inventoryTracked) form.elements.inventoryTracked.checked = true;
      S.fn.renderFormSerialChips(form);
      form.querySelector('#serial-rapid-input')?.focus();
    } else {
      S.fn.closeSerialCamera();
    }
  }


  S.fn.openQuickProduct = function openQuickProduct(focusOrInitial = false) {
    const pending = S.fn.loadPendingProductImport();
    if (pending) {
      if (pending.storeId !== S.state.store.id) return S.fn.toast('Còn lần nhập đang chờ', 'Hãy chuyển về đúng cửa hàng trước khi tiếp tục lần nhập đó.', 'error');
      S.fn.openProductImport();
      return;
    }
    const opts = typeof focusOrInitial === 'object' && focusOrInitial !== null ? focusOrInitial : { focusName: focusOrInitial === true };
    const tpl = opts.templateProduct || null;
    const initialBarcode = opts.barcode || '';
    const initialMode = opts.mode === 'serial' ? 'serial' : 'standard';
    const idempotencyKey = S.fn.newIdempotencyKey();
    const receiveAt = S.state.warehouses.length > 1 ? S.state.warehouses.find(warehouse => warehouse.id === S.state.selectedWarehouseId)?.name : '';
    const body = `<form id='entity-form' class='product-editor-form' data-form='quick-product' data-stock-mode='${initialMode}' data-serial-codes='[]' data-idempotency-key='${S.fn.esc(idempotencyKey)}'>
      <section class='product-editor-section' aria-labelledby='product-quick-heading'>
        <h3 id='product-quick-heading'>Thông tin hàng hóa</h3>
        <div class='product-editor-photo-name'>${S.fn.productPhotoField()}<div class='form-field'><label class='input-label' for='quick-product-name'>Tên hàng hóa <span class='editor-required' aria-hidden='true'>*</span></label><input class='input' id='quick-product-name' name='name' value='${S.fn.esc(opts.name || tpl?.name || '')}' required maxlength='240' placeholder='Ví dụ: Sách Tiếng Anh, Áo thun cotton'/></div></div>
        ${S.fn.productSaleFields(tpl)}
      </section>
      <section class='product-editor-section' aria-labelledby='product-mode-heading'>
        <h3 id='product-mode-heading'>Mã vạch &amp; tồn kho ban đầu${receiveAt ? ` · ${S.fn.esc(receiveAt)}` : ''}</h3>
        <div class='segmented-mode' role='group' aria-label='Kiểu quản lý tồn kho'>
          <button type='button' class='segmented-btn ${initialMode === 'standard' ? 'active' : ''}' data-action='switch-product-stock-mode' data-mode='standard' aria-pressed='${initialMode === 'standard'}'>Hàng thường (theo số lượng)</button>
          <button type='button' class='segmented-btn ${initialMode === 'serial' ? 'active' : ''}' data-action='switch-product-stock-mode' data-mode='serial' aria-pressed='${initialMode === 'serial'}'>Từng mã riêng (Serial / IMEI)</button>
        </div>
        <div data-stock-mode-panel='standard' ${initialMode === 'serial' ? 'hidden' : ''}>
          ${S.fn.productBarcodeFieldHtml(initialBarcode, true, 'form-field full')}
          <div class='form-field editor-opening-stock'><label class='input-label' for='quick-product-opening'>Tồn kho ban đầu</label><input class='input' id='quick-product-opening' name='openingQuantity' type='number' min='0' step='0.001' inputmode='decimal' value='${S.fn.esc(opts.openingQuantity ?? '')}' placeholder='0'/></div>
        </div>
        <div data-stock-mode-panel='serial' ${initialMode === 'serial' ? '' : 'hidden'}>
          ${S.fn.serialCapturePanelHtml(opts.sku || '')}
        </div>
      </section>
      <details class='product-editor-section editor-identity-details' ${tpl ? 'open' : ''}><summary>Mã SKU, danh mục, giá vốn &amp; quy đổi</summary>${S.fn.productIdentityFields(tpl ? { ...tpl, sku: '' } : null, '', false, opts.sku || '', true, false)}${S.fn.productTrackingFields(tpl, true)}${S.fn.productPackFields(tpl)}</details>
      <div class='auth-message error' data-quick-product-error role='alert' hidden></div>
    </form>`;
    S.fn.showModal('Thêm hàng hóa', '', body, `<button class='btn btn-secondary' type='submit' form='entity-form' data-add-another='true'>Lưu &amp; thêm tiếp</button><button class='btn btn-secondary' type='submit' form='entity-form' data-print-after='true'>Lưu &amp; in tem</button><button class='btn btn-primary' type='submit' form='entity-form'>Lưu hàng hóa</button>`, true, { productEditor: true });
    const form = S.dom.modal.querySelector('[data-form="quick-product"]');
    S.fn.loadProductEditorCategories(form);
    S.fn.renderFormSerialChips(form);
    if (opts.focusName) form.elements.name.focus();
  }


  S.fn.openCatalogNextStep = function openCatalogNextStep(readyToSell, productId) {
    const canSell = S.fn.canAccessRoute('pos');
    const nextRoute = readyToSell && canSell ? 'pos' : 'inventory';
    const nextLabel = readyToSell && canSell ? 'Bắt đầu bán' : 'Xem kho hàng';
    const canReceive = !readyToSell && S.fn.productById(productId) && (S.fn.hasPerm('manageInventory') || S.fn.hasPerm('recordCashbook'));
    const next = canReceive
      ? `<button class='btn btn-primary' data-action='add-product-units' data-id='${S.fn.esc(productId)}'>＋ Thêm tồn / Quét mã</button>`
      : `<button class='btn btn-primary' data-route='${nextRoute}'>${nextLabel}</button>`;
    const printImported = S.state.lastImportedPrintItems.length
      ? `<button class='btn btn-secondary' type='button' data-action='print-barcode-imported'>In tem (${S.fn.number(S.state.lastImportedPrintItems.length)} SP)</button>`
      : '';
    S.fn.showModal('Đã lưu hàng hóa', '', '', `${printImported}<button class='btn btn-secondary' data-action='new-product'>Thêm hàng khác</button>${next}`);
  }


  S.fn.resetCatalogFilters = function resetCatalogFilters() {
    S.state.searchTerms.products = '';
    S.state.categoryFilter = 'Tất cả';
    S.state.posSearchTerm = '';
    S.state.posProducts = [];
    ++S.state.posSearchRequestNumber;
    window.clearTimeout(S.state.posSearchTimer);
    const searchInput = document.getElementById('pos-search');
    if (searchInput) searchInput.value = '';
  }


  S.fn.saveQuickProduct = async function saveQuickProduct(form, submitter) {
    if (form.dataset.saving === 'true') return;
    S.fn.closeProductBarcode();
    S.fn.closeSerialCamera();
    const requestStoreId = S.state.store.id;
    const requestSession = S.state.authSession;
    const sameContext = function () { return S.state.authSession === requestSession && S.state.store.id === requestStoreId; };
    const addAnother = submitter?.dataset.addAnother === 'true';
    const printAfter = submitter?.dataset.printAfter === 'true';
    const formData = new FormData(form);
    const key = form.dataset.idempotencyKey || S.fn.newIdempotencyKey();
    form.dataset.idempotencyKey = key;
    const feedback = form.querySelector('[data-quick-product-error]');
    const submitButtons = Array.from(S.dom.modal.querySelectorAll('button[type="submit"][form="entity-form"]'));
    const submitButton = submitButtons.find(function (button) { return !button.dataset.addAnother && !button.dataset.printAfter; });
    const reportError = function (message) {
      if (feedback) { feedback.hidden = false; feedback.textContent = message; }
      else S.fn.toast('Chưa lưu được hàng hóa', message, 'error');
    };
    let pending = S.fn.loadPendingProductImport();
    if (pending && (pending.storeId !== S.state.store.id || pending.key !== key)) {
      return reportError('Còn một lần nhập danh sách đang chờ xác nhận. Hãy mở mục Nhập từ file để hoàn tất trước.');
    }
    const isSerialMode = form.dataset.stockMode === 'serial';
    const serialCodes = isSerialMode ? S.fn.readFormSerialCodes(form) : [];
    if (!pending) {
      const name = String(formData.get('name') || '').trim();
      const price = Number(formData.get('price'));
      let cost = Number(formData.get('cost') || 0);
      const inventoryTracked = isSerialMode ? true : (formData.get('inventoryTracked') === 'on');
      const openingQuantity = isSerialMode ? String(serialCodes.length) : (String(formData.get('openingQuantity') || '').trim() || '0');
      const quantityPattern = /^\d{1,10}(?:\.\d{1,3})?$/;
      if (!name || name.length > 240) return reportError('Nhập tên hàng hóa từ 1 đến 240 ký tự.');
      if (!String(formData.get('price') || '').trim() || !Number.isSafeInteger(price) || price < 0) return reportError('Nhập giá bán bằng số VND nguyên không âm.');
      if (!Number.isSafeInteger(cost) || cost < 0) return reportError('Giá vốn phải là số VND nguyên không âm.');
      if (!quantityPattern.test(openingQuantity)) return reportError('Tồn kho ban đầu phải không âm và tối đa 3 chữ số thập phân.');
      if (!inventoryTracked && Number(openingQuantity) !== 0) return reportError('Mặt hàng không theo dõi tồn cần để tồn kho ban đầu bằng 0.');
      const rawSku = String(formData.get('sku') || '').trim();
      const sku = rawSku || S.fn.newProductSku(key);
      const rawThreshold = String(formData.get('minStock') || '').trim() || '0';
      if (!quantityPattern.test(rawThreshold)) return reportError('Mức nhắc tồn phải không âm và tối đa 3 chữ số thập phân.');
      const rawWarranty = String(formData.get('warrantyMonths') ?? '0').trim() || '0';
      const warrantyMonths = Number(rawWarranty);
      if (!/^\d+$/.test(rawWarranty) || !Number.isSafeInteger(warrantyMonths) || warrantyMonths < 0 || warrantyMonths > 120) {
        return reportError('Thời gian bảo hành phải là số nguyên từ 0 đến 120 tháng.');
      }
      let image; try { image = S.fn.readProductPhoto(form); } catch (error) { return reportError(error.message); }
      let purchasePack; try { purchasePack = S.fn.readProductPack(form); } catch (error) { return reportError(error.message); }
      if (purchasePack && !String(formData.get('cost') || '').trim()) cost = Number(window.SlinkPurchaseUnits.fromPack(purchasePack).unitCostVnd);
      if (purchasePack && cost > price && cost > Number(window.SlinkPurchaseUnits.fromPack(purchasePack).unitCostVnd) && !formData.get('confirmCostMismatch')) return reportError('Giá vốn cao hơn giá bán và giá nhập quy đổi.');
      const rawBarcode = isSerialMode ? '' : String(formData.get('barcode') || '').trim();
      let barcodeValue = rawBarcode || null;
      if (!isSerialMode && !barcodeValue && printAfter) {
        try { barcodeValue = S.fn.nextUniqueBarcode() || null; }
        catch (error) { return reportError(error.message); }
      }
      const categoryVal = S.fn.readProductCategory(formData);
      const unitVal = String(formData.get('unit') || '').trim() || 'cái';
      const item = {
        ...(purchasePack ? { purchasePack } : {}),
        image,
        sku,
        barcode: barcodeValue,
        name,
        category: categoryVal,
        unit: unitVal,
        salePriceVnd: price,
        costVnd: cost,
        lowStockThreshold: rawThreshold,
        warrantyMonths,
        inventoryTracked,
        openingQuantity,
        ...(isSerialMode ? { serialTracked: true, serialCodes } : {}),
      };
      const payload = { items: [item] };
      if (S.state.selectedWarehouseId) payload.warehouseId = S.state.selectedWarehouseId;
      pending = { storeId: S.state.store.id, key, payload };
    }
    if (!S.fn.savePendingProductImport(pending)) return S.fn.pendingSaveFailed();
    const requestGeneration = S.state.modalGeneration;
    form.dataset.saving = 'true';
    if (feedback) feedback.hidden = true;
    form.querySelectorAll('input,select').forEach(function (field) { field.disabled = true; });
    submitButtons.forEach(function (button) { button.disabled = true; });
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Đang lưu…'; }
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(requestStoreId)}/products/import`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      if (!sameContext()) return;
      S.fn.clearPendingProductImport();
      const canContinue = requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden;
      if (canContinue) {
        S.fn.resetCatalogFilters();
        if (addAnother) S.fn.openQuickProduct({ focusName: true, mode: isSerialMode ? 'serial' : 'standard' });
        else S.fn.closeModal();
      }
      await S.fn.loadProductsPage('', 0);
      S.fn.emitSyncDomains(['products'], { source: 'product-bulk-update' });
      if (!sameContext()) return;
      S.fn.emitSyncDomains(['products', 'stock', 'dashboard'], { source: 'quick-product' });
      const createdList = Array.isArray(result.products) ? result.products : [];
      for (const cRow of createdList) {
        if (cRow && !S.fn.productById(cRow.id)) S.state.store.products.push(S.fn.mapProduct(cRow));
      }
      const created = createdList[0];
      const fallback = pending.payload.items[0];
      const readyToSell = !(created?.inventory_tracked ?? fallback.inventoryTracked) || Number(created?.on_hand ?? fallback.openingQuantity) > 0;
      const createdName = created?.name || fallback.name || 'Hàng hóa mới';
      S.fn.toast('Đã lưu hàng hóa', readyToSell ? `${createdName} · sẵn sàng bán.` : `${createdName} · tồn 0, bấm ＋ để thêm tồn hoặc quét mã.`);
      if (printAfter && requestGeneration === S.state.modalGeneration && S.dom.modal.hidden) {
        const mappedCreated = created?.id ? S.fn.mapProduct(created) : { ...fallback, id: fallback.sku, price: fallback.salePriceVnd };
        if (isSerialMode && serialCodes.length) {
          S.fn.openBarcodePrintModal(serialCodes.map((code) => ({ ...mappedCreated, barcode: code, copies: 1 })));
        } else {
          const qtyCopies = Math.max(1, Math.min(200, Math.round(Number(fallback.openingQuantity) || 1)));
          S.fn.openBarcodePrintModal([{ ...mappedCreated, copies: qtyCopies }]);
        }
      }
    } catch (error) {
      if (!sameContext()) return;
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra mặt hàng.', 'error');
      const definitiveFailure = error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code);
      if (definitiveFailure) {
        S.fn.clearPendingProductImport();
        form.dataset.idempotencyKey = S.fn.newIdempotencyKey();
        submitButtons.forEach(function (button) { button.disabled = false; });
        form.querySelectorAll('input,select').forEach(function (field) { field.disabled = false; });
        delete form.dataset.saving;
        S.fn.updateProductHints(form);
        S.fn.updateProductCategoryField(form.querySelector('[data-product-category]'));
        if (feedback) { feedback.hidden = false; feedback.textContent = error.message; }
        if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Lưu hàng hóa'; }
      } else {
        if (feedback) { feedback.hidden = false; feedback.textContent = 'Chưa nhận được xác nhận. Bấm “Gửi lại để kiểm tra” để Slink kiểm tra đúng thao tác này, không tạo trùng.'; }
        if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Gửi lại để kiểm tra'; }
      }
      if (!feedback) S.fn.toast('Chưa lưu được hàng hóa', error.message, 'error');
    } finally {
      delete form.dataset.saving;
    }
  }


  S.fn.closeSerialCamera = function closeSerialCamera() {
    const surface = S.dom.modal.querySelector('[data-scan-mode="serial-list"]:not([hidden])');
    if (!surface) return false;
    S.fn.stopScanCamera();
    surface.hidden = true;
    return true;
  }


  S.fn.openAddProductUnits = function openAddProductUnits(productId) {
    const product = S.fn.productById(productId) || S.state.inventoryProducts.find(item => item.id === productId);
    if (!product) return;
    const defaultTab = product.serialTracked ? 'serial' : 'quantity';
    const warehouse = S.state.warehouses.find(w => w.id === S.state.selectedWarehouseId) || S.state.warehouses[0];
    const idempotencyKey = S.fn.newIdempotencyKey();
    const body = `<form id='entity-form' class='product-editor-form' data-form='add-product-units' data-id='${S.fn.esc(product.id)}' data-mode='${defaultTab}' data-serial-codes='[]' data-idempotency-key='${S.fn.esc(idempotencyKey)}'>
      <div class='add-units-summary'>
        <strong>${S.fn.esc(product.name)}</strong>
        <span>SKU: ${S.fn.esc(product.sku)} · Tồn hiện tại: <strong>${S.fn.number(product.stock)} ${S.fn.esc(product.unit)}</strong> · Giá bán: ${S.fn.money(product.price)}${warehouse ? ` · Kho: ${S.fn.esc(warehouse.name)}` : ''}</span>
      </div>
      <div class='segmented-mode' role='group' aria-label='Cách thêm hàng vào kho'>
        <button type='button' class='segmented-btn ${defaultTab === 'serial' ? 'active' : ''}' data-action='switch-add-units-mode' data-mode='serial' aria-pressed='${defaultTab === 'serial'}'>Quét / thêm từng mã riêng</button>
        ${!product.serialTracked ? `<button type='button' class='segmented-btn ${defaultTab === 'quantity' ? 'active' : ''}' data-action='switch-add-units-mode' data-mode='quantity' aria-pressed='${defaultTab === 'quantity'}'>Nhập thêm số lượng</button>` : ''}
      </div>
      <div data-add-units-panel='serial' ${defaultTab === 'serial' ? '' : 'hidden'}>
        ${S.fn.serialCapturePanelHtml(product.sku.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12))}
      </div>
      ${!product.serialTracked ? `<div data-add-units-panel='quantity' ${defaultTab === 'quantity' ? '' : 'hidden'}>
        <div class='form-grid'>
          <div class='form-field'><label class='input-label' for='add-units-qty'>Số lượng thêm (${S.fn.esc(product.unit)}) *</label><input class='input' id='add-units-qty' name='addQty' type='number' min='0.001' step='0.001' inputmode='decimal' placeholder='Ví dụ: 10'/></div>
          ${S.fn.hasPerm('viewCostPrice') ? `<div class='form-field'><label class='input-label' for='add-units-cost'>Giá nhập 1 ${S.fn.esc(product.unit)} (đ)</label><input class='input' id='add-units-cost' name='unitCostVnd' type='number' min='0' step='1' value='${S.fn.esc(product.cost || 0)}'/></div>` : `<input type='hidden' name='unitCostVnd' value='0'/>`}
        </div>
        <div class='form-field'><label class='input-label' for='add-units-note'>Ghi chú</label><input class='input' id='add-units-note' name='note' maxlength='240' placeholder='Nhập thêm hàng cùng loại'/></div>
      </div>` : ''}
      <div class='auth-message error' data-add-units-error role='alert' hidden></div>
    </form>`;
    const footer = `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-secondary' type='submit' form='entity-form' data-print-after='true'>Lưu &amp; in tem</button><button class='btn btn-primary' type='submit' form='entity-form'>Lưu vào kho</button>`;
    S.fn.showModal('Thêm tồn / Quét mã', '', body, footer, true);
    const form = S.dom.modal.querySelector('[data-form="add-product-units"]');
    S.fn.renderFormSerialChips(form);
    if (defaultTab === 'serial') form.querySelector('#serial-rapid-input')?.focus();
    else form.querySelector('#add-units-qty')?.focus();
  }


  S.fn.saveAddProductUnits = async function saveAddProductUnits(form, submitter) {
    if (form.dataset.saving === 'true') return;
    S.fn.closeSerialCamera();
    const requestStoreId = S.state.store.id;
    const requestSession = S.state.authSession;
    const requestGeneration = S.state.modalGeneration;
    const sameContext = () => S.state.authSession === requestSession && S.state.store.id === requestStoreId;
    const productId = form.dataset.id;
    const product = S.fn.productById(productId) || S.state.inventoryProducts.find(item => item.id === productId);
    if (!product) return;
    const mode = form.dataset.mode || (product.serialTracked ? 'serial' : 'quantity');
    const printAfter = submitter?.dataset.printAfter === 'true';
    const feedback = form.querySelector('[data-add-units-error]');
    const reportError = (msg) => {
      if (feedback) { feedback.hidden = false; feedback.textContent = msg; }
      else S.fn.toast('Chưa thêm được hàng', msg, 'error');
    };
    const key = form.dataset.idempotencyKey || S.fn.newIdempotencyKey();
    form.dataset.idempotencyKey = key;
    const submitButtons = Array.from(S.dom.modal.querySelectorAll('button[type="submit"][form="entity-form"]'));
    form.dataset.saving = 'true';
    if (feedback) feedback.hidden = true;
    submitButtons.forEach(b => { b.disabled = true; });
    try {
      if (mode === 'serial') {
        const codes = S.fn.readFormSerialCodes(form);
        if (!codes.length) throw new Error('Quét hoặc bấm Tự sinh ít nhất 1 mã riêng trước khi lưu.');
        const res = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(requestStoreId)}/products/${encodeURIComponent(productId)}/serials`, {
          method: 'POST',
          headers: { 'idempotency-key': key },
          body: {
            codes,
            warehouseId: S.state.selectedWarehouseId || undefined,
            note: 'Thêm mã riêng',
          },
        });
        if (!sameContext()) return;
        const canClose = requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden;
        if (canClose) S.fn.closeModal();
        await Promise.all([S.fn.loadProductsPage(S.state.searchTerms.products, 0), S.state.page === 'inventory' ? S.fn.loadInventoryPage() : Promise.resolve()]);
        if (!sameContext()) return;
        S.fn.emitSyncDomains(['products', 'stock', 'dashboard'], { source: 'add-product-units' });
        const addedCodes = (res.serials || []).map(r => r.code);
        S.fn.toast('Đã thêm mã vào kho', `${product.name}: +${S.fn.number(res.addedCount)} ${product.unit} (tồn mới: ${S.fn.number(res.newOnHand)}).`);
        if (printAfter && canClose && S.dom.modal.hidden && addedCodes.length) {
          S.fn.openBarcodePrintModal(addedCodes.map(code => ({ ...product, barcode: code, copies: 1 })));
        }
      } else {
        const fd = new FormData(form);
        const qtyRaw = String(fd.get('addQty') || '').trim();
        const qty = Number(qtyRaw);
        if (!qtyRaw || !Number.isFinite(qty) || qty <= 0) throw new Error('Nhập số lượng lớn hơn 0.');
        const unitCostVnd = Number(fd.get('unitCostVnd') || 0);
        if (!Number.isSafeInteger(unitCostVnd) || unitCostVnd < 0) throw new Error('Giá nhập phải là số VND nguyên không âm.');
        await S.fn.apiRequest(`/api/stores/${encodeURIComponent(requestStoreId)}/purchases`, {
          method: 'POST',
          headers: { 'idempotency-key': key },
          body: {
            warehouseId: S.state.selectedWarehouseId || undefined,
            paymentMethod: 'other',
            paidAmountVnd: 0,
            note: String(fd.get('note') || '').trim() || 'Nhập thêm tồn nhanh',
            items: [{ productId, quantity: qty, unitCostVnd }],
          },
        });
        if (!sameContext()) return;
        const canClose = requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden;
        if (canClose) S.fn.closeModal();
        await Promise.all([S.fn.loadProductsPage(S.state.searchTerms.products, 0), S.state.page === 'inventory' ? S.fn.loadInventoryPage() : Promise.resolve()]);
        if (!sameContext()) return;
        S.fn.emitSyncDomains(['products', 'stock', 'cashbook', 'suppliers', 'dashboard'], { source: 'add-product-units-purchase' });
        S.fn.toast('Đã nhập thêm tồn kho', `${product.name}: +${S.fn.number(qty)} ${product.unit}.`);
        if (printAfter && canClose && S.dom.modal.hidden) {
          S.fn.openBarcodePrintModal([{ ...product, copies: Math.min(200, Math.max(1, Math.round(qty))) }]);
        }
      }
    } catch (error) {
      if (!sameContext()) return;
      if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        form.dataset.idempotencyKey = S.fn.newIdempotencyKey();
      }
      form.dataset.saving = 'false';
      submitButtons.forEach(b => { b.disabled = false; });
      reportError(error.message || 'Chưa lưu được tồn kho.');
    } finally {
      delete form.dataset.saving;
    }
  }


  S.fn.formatSerialWarrantyBadge = function formatSerialWarrantyBadge(row, fallbackWarrantyMonths = 0) {
    const expiresAt = row?.warranty_expires_at || row?.warrantyExpiresAt || '';
    const status = row?.warrantyStatus || row?.warranty_status || '';
    if (row?.status === 'in_stock') {
      const months = Number(row?.warrantyMonths ?? row?.warranty_months ?? fallbackWarrantyMonths ?? 0);
      return months > 0
        ? `<span class='badge badge-neutral'>${S.fn.number(months)} tháng khi bán</span>`
        : `<span class='badge badge-warranty-none'>Không bảo hành</span>`;
    }
    if (!expiresAt && status === 'none') {
      return `<span class='badge badge-warranty-none'>Không bảo hành</span>`;
    }
    if (expiresAt) {
      const expTime = new Date(expiresAt).getTime();
      const active = status ? status === 'active' : (Number.isFinite(expTime) && expTime >= Date.now());
      return `<span class='badge ${active ? 'badge-warranty-ok' : 'badge-warranty-expired'}'>${active ? 'Còn BH' : 'Hết BH'} · ${S.fn.esc(S.fn.humanDate(expiresAt))}</span>`;
    }
    const months = Number(row?.warrantyMonths ?? row?.warranty_months ?? fallbackWarrantyMonths ?? 0);
    return months > 0
      ? `<span class='badge badge-neutral'>BH ${S.fn.number(months)} tháng</span>`
      : `<span class='badge badge-warranty-none'>Không bảo hành</span>`;
  }


  S.fn.openProductSerials = async function openProductSerials(productId, statusFilter = 'all') {
    const product = S.fn.productById(productId) || S.state.inventoryProducts.find(item => item.id === productId);
    if (!product) return;
    const canEdit = S.fn.hasPerm('editProducts');
    S.fn.showModal(`Mã riêng · ${product.name}`, '', `<div class='empty-state'><span>Đang tải danh sách mã…</span></div>`, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button>`, true);
    const gen = S.state.modalGeneration;
    try {
      const qs = new URLSearchParams({ status: statusFilter, limit: '200' });
      if (S.state.selectedWarehouseId) qs.set('warehouseId', S.state.selectedWarehouseId);
      const data = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products/${encodeURIComponent(productId)}/serials?${qs.toString()}`, { preferFresh: true });
      if (S.dom.modal.hidden || S.state.modalGeneration !== gen) return;
      const inStockCodes = (data.serials || []).filter(s => s.status === 'in_stock');
      const tabs = `<div class='segmented-mode' style='margin-bottom:10px'>
        <button type='button' class='segmented-btn ${statusFilter === 'all' ? 'active' : ''}' data-action='filter-product-serials' data-id='${S.fn.esc(productId)}' data-status='all'>Tất cả (${S.fn.number(data.counts.inStock + data.counts.sold)})</button>
        <button type='button' class='segmented-btn ${statusFilter === 'in_stock' ? 'active' : ''}' data-action='filter-product-serials' data-id='${S.fn.esc(productId)}' data-status='in_stock'>Còn trong kho (${S.fn.number(data.counts.inStock)})</button>
        <button type='button' class='segmented-btn ${statusFilter === 'sold' ? 'active' : ''}' data-action='filter-product-serials' data-id='${S.fn.esc(productId)}' data-status='sold'>Đã bán (${S.fn.number(data.counts.sold)})</button>
      </div>`;
      const rowsHtml = (data.serials || []).length
        ? `<div class='table-wrap'><table class='data-table'><thead><tr><th>Mã riêng / QR</th><th>Kho</th><th>Trạng thái</th><th>Bảo hành</th><th>Đơn hàng</th></tr></thead><tbody>${data.serials.map(s => `<tr><td><button type='button' class='serial-chip' data-action='lookup-serial-warranty' data-code='${S.fn.esc(s.code)}'>${S.fn.esc(s.code)}</button></td><td>${S.fn.esc(s.warehouse_name || '')}</td><td>${s.status === 'in_stock' ? `<span class='badge badge-success'>Còn trong kho</span>` : `<span class='badge badge-neutral'>Đã bán</span>`}</td><td>${S.fn.formatSerialWarrantyBadge(s, product.warrantyMonths)}</td><td>${s.order_number ? `<button type='button' class='link-button' data-action='order-detail' data-id='${S.fn.esc(s.order_id)}'>${S.fn.esc(s.order_number)}</button>` : '—'}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class='empty-state'><strong>Chưa có mã nào</strong></div>`;
      const footer = `${canEdit ? `<button class='btn btn-secondary' type='button' data-action='add-product-units' data-id='${S.fn.esc(productId)}'>＋ Thêm / quét mã</button>` : ''}${S.fn.hasPerm('manageInventory') && S.state.warehouses.length > 1 && inStockCodes.length ? `<button class='btn btn-secondary' type='button' data-action='open-transfer-serials' data-id='${S.fn.esc(productId)}'>Chuyển kho</button>` : ''}${inStockCodes.length ? `<button class='btn btn-secondary' type='button' data-action='print-product-serials' data-id='${S.fn.esc(productId)}'>In ${S.fn.number(inStockCodes.length)} tem còn kho</button>` : ''}<button class='btn btn-primary' type='button' data-action='close-modal'>Đóng</button>`;
      S.dom.modal.dataset.productSerialsCache = JSON.stringify(inStockCodes.map(s => s.code));
      S.dom.modal.dataset.productSerialsFullCache = JSON.stringify(inStockCodes.map(s => ({ code: s.code, warehouseId: s.warehouse_id, warehouseName: s.warehouse_name })));
      S.fn.showModal(`Mã riêng · ${product.name}`, '', tabs + rowsHtml, footer, true);
    } catch (error) {
      if (S.dom.modal.hidden || S.state.modalGeneration !== gen) return;
      S.fn.showModal(`Mã riêng · ${product.name}`, '', `<div class='auth-message error'>${S.fn.esc(error.message)}</div>`, `<button class='btn btn-primary' type='button' data-action='close-modal'>Đóng</button>`);
    }
  }


  S.fn.openTransferSerialsModal = function openTransferSerialsModal(productId) {
    const product = S.fn.productById(productId) || S.state.inventoryProducts.find(item => item.id === productId);
    if (!product || S.state.warehouses.length < 2) return;
    let items = [];
    try { items = JSON.parse(S.dom.modal.dataset.productSerialsFullCache || '[]'); } catch {}
    if (!items.length) return S.fn.toast('Không có mã riêng còn kho', 'Hãy thêm mã trước khi chuyển kho.', 'error');
    const sourceIds = Array.from(new Set(items.map(i => i.warehouseId)));
    const defaultSourceId = sourceIds[0];
    const defaultDest = S.state.warehouses.find(w => w.id !== defaultSourceId) || S.state.warehouses[0];
    const renderCodeList = (whId) => items.filter(i => i.warehouseId === whId).map(i => `<label style='display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--border);border-radius:999px;font-size:12px;cursor:pointer'><input type='checkbox' name='codes' value='${S.fn.esc(i.code)}'/><code>${S.fn.esc(i.code)}</code></label>`).join('');
    const sourceOptions = S.state.warehouses.filter(w => sourceIds.includes(w.id)).map(w => `<option value='${S.fn.esc(w.id)}' ${w.id === defaultSourceId ? 'selected' : ''}>${S.fn.esc(w.name)}</option>`).join('');
    const destOptions = S.state.warehouses.map(w => `<option value='${S.fn.esc(w.id)}' ${w.id === defaultDest?.id ? 'selected' : ''}>${S.fn.esc(w.name)}</option>`).join('');
    const body = `<form id='entity-form' data-form='transfer-serials' data-id='${S.fn.esc(productId)}' data-idempotency-key='${S.fn.esc(S.fn.newIdempotencyKey())}'>
      <div class='form-grid'>
        <div class='form-field'><label class='input-label' for='ts-source'>Kho xuất</label><div class='select-wrap'><select class='input' id='ts-source' name='sourceWarehouseId'>${sourceOptions}</select></div></div>
        <div class='form-field'><label class='input-label' for='ts-dest'>Kho nhận</label><div class='select-wrap'><select class='input' id='ts-dest' name='destinationWarehouseId'>${destOptions}</select></div></div>
      </div>
      <div class='form-field full' style='margin-top:12px'>
        <label class='input-label'>Chọn mã riêng cần chuyển</label>
        <div data-transfer-serial-list style='display:flex;flex-wrap:wrap;gap:6px;max-height:220px;overflow:auto;padding:4px 0'>${renderCodeList(defaultSourceId)}</div>
      </div>
      <div class='form-field full' style='margin-top:10px'><label class='input-label' for='ts-note'>Ghi chú</label><input class='input' id='ts-note' name='note' maxlength='240' placeholder='Tùy chọn'/></div>
    </form>`;
    S.fn.showModal(`Chuyển kho mã riêng · ${product.name}`, '', body, `<button class='btn btn-secondary' type='button' data-action='view-product-serials' data-id='${S.fn.esc(productId)}'>Quay lại</button><button class='btn btn-primary' type='submit' form='entity-form'>Xác nhận chuyển kho</button>`, true);
    S.dom.modal.dataset.productSerialsFullCache = JSON.stringify(items);
  }


  S.fn.saveTransferSerials = async function saveTransferSerials(form) {
    const productId = form.dataset.id;
    const data = new FormData(form);
    const sourceWarehouseId = String(data.get('sourceWarehouseId') || '');
    const destinationWarehouseId = String(data.get('destinationWarehouseId') || '');
    const codes = data.getAll('codes').map(v => String(v).trim()).filter(Boolean);
    const note = String(data.get('note') || '').trim();
    if (!sourceWarehouseId || !destinationWarehouseId || sourceWarehouseId === destinationWarehouseId) {
      return S.fn.toast('Kho nhận phải khác kho xuất', '', 'error');
    }
    if (!codes.length) return S.fn.toast('Chưa chọn mã riêng', 'Tích chọn ít nhất 1 mã cần chuyển kho.', 'error');
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/serials/transfer`, {
        method: 'POST',
        headers: { 'idempotency-key': form.dataset.idempotencyKey || S.fn.newIdempotencyKey() },
        body: { productId, sourceWarehouseId, destinationWarehouseId, codes, note },
      });
      S.fn.toast('Đã chuyển kho mã riêng', `${result.transferredCount} mã · ${result.sourceWarehouseName} → ${result.destinationWarehouseName}`);
      S.fn.emitSyncDomains(['products', 'stock', 'dashboard'], { source: 'transfer-serials' });
      await S.fn.loadProductsPage(S.state.searchTerms.products, S.state.productOffset);
      S.fn.openProductSerials(productId);
    } catch (error) {
      S.fn.toast('Chưa chuyển kho được', error.message, 'error');
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }


  S.fn.openProduct = function openProduct(id, initial) {
    if (!id && !initial) return S.fn.openQuickProduct();
    const p = id ? S.fn.productById(id) : null;
    if (id && !p) return;
    const scanned = !p && initial && initial.fromScan ? initial : null;
    const rawBarcode = p ? p.barcode : (scanned && scanned.barcode ? scanned.barcode : '');
    const barcode = rawBarcode.length <= 120 ? rawBarcode : '';
    const suggestedSku = scanned
      ? (scanned.sku || (barcode && /^[A-Za-z0-9._-]+$/.test(barcode) ? barcode : `MH-${Date.now().toString(36).toUpperCase()}`))
      : '';
    const grouped = Boolean(p?.variantGroupId);
    const displayedName = grouped
      ? `<div class='form-field'><label class='input-label' for='product-name'>Tên biến thể <span class='editor-required' aria-hidden='true'>*</span></label><input class='input' id='product-name' name='name' value='${S.fn.esc(p.name)}' required maxlength='240' readonly/><small>Tên được ghép từ nhóm “${S.fn.esc(p.variantGroupName)}” và thuộc tính bên dưới.</small></div>`
      : `<div class='form-field'><label class='input-label' for='product-name'>Tên sản phẩm <span class='editor-required' aria-hidden='true'>*</span></label><input class='input' id='product-name' name='name' value='${S.fn.esc(p?.name || '')}' placeholder='Ví dụ: Áo thun Cotton Basic' required maxlength='240'/></div>`;
    const variantAttributes = grouped
      ? `<div class='form-field full'><label class='input-label' for='product-variant-attributes'>Thuộc tính biến thể *</label><input class='input' id='product-variant-attributes' name='variantAttributesText' value='${S.fn.esc(Object.entries(p.variantAttributes || {}).map(function (entry) { return `${entry[0]}=${entry[1]}`; }).join('; '))}' placeholder='Màu=Đỏ; Kích cỡ=M' required/><small>Giữ nguyên tên thuộc tính của nhóm; bạn có thể sửa giá trị. Thuộc tính không làm thay đổi tồn kho.</small></div>` : '';
    const scanPhoto = scanned && scanned.photo ? `<img class='scan-photo-preview product-scan-reference' src='${S.fn.esc(scanned.photo)}' alt='Ảnh vừa chụp để đối chiếu khi nhập sản phẩm'/>` : '';
    const scanNote = scanned
      ? `<div class='notice-item product-scan-note' role='status'><span>${scanned.barcode ? S.fn.icon('check', 18) : 'i'}</span><span><strong>${scanned.barcode ? 'Mã chưa có trong danh mục' : 'Nhập mặt hàng mới'}</strong></span></div>`
      : '';
    const form = `<form id='entity-form' class='product-editor-form' data-form='product' data-from-scan='${scanned ? 'true' : 'false'}' data-id='${S.fn.esc(p?.id || '')}' data-version='${S.fn.esc(p?.version || '')}'>
      <section class='product-editor-section' aria-labelledby='product-identity-heading'><h3 id='product-identity-heading'>Thông tin cơ bản</h3>
        <div class='product-editor-photo-name'>${S.fn.productPhotoField(p)}${displayedName}</div>${scanPhoto}${scanNote}
        ${variantAttributes}${S.fn.productIdentityFields(p, barcode, grouped, suggestedSku, false)}
        <div class='form-field full' style='margin-top:8px'><label class='input-label' for='product-extra-barcodes'>Mã vạch phụ</label><input class='input' id='product-extra-barcodes' name='extraBarcodes' value='${S.fn.esc((p?.extraBarcodes || []).join(', '))}' placeholder='Cách nhau bằng dấu phẩy'/></div>
      </section>
      <section class='product-editor-section' aria-labelledby='product-prices-heading'><h3 id='product-prices-heading'>Giá và đơn vị tính</h3>${S.fn.productSaleFields(p, grouped, true)}</section>
      <section class='product-editor-section' aria-labelledby='product-stock-heading'><h3 id='product-stock-heading'>Quản lý kho</h3>${S.fn.productTrackingFields(p)}</section>
      ${S.state.productPackDefaultsSupported ? `<section class='product-editor-section' aria-labelledby='product-pack-heading'><h3 id='product-pack-heading'>Quy đổi đơn vị nhập</h3>${S.fn.productPackFields(p)}</section>` : ''}
      <div class='auth-message error' data-product-editor-error role='alert' hidden></div>
    </form>`;
    const footer = `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>${p ? 'Lưu thay đổi' : 'Thêm sản phẩm'}</button>`;
    const actions = p ? [
      S.fn.hasPerm('editProducts') ? ['add-product-units', '＋ Thêm tồn / Quét mã'] : null,
      p.serialTracked ? ['view-product-serials', 'Danh sách mã riêng'] : null,
      ['print-barcode-single', 'In tem mã vạch'],
      p.inventoryTracked && !p.serialTracked && S.fn.hasPerm('manageInventory') ? ['adjust-stock', 'Kiểm kê tồn kho'] : null,
      (S.fn.hasPerm('viewCostPrice') || S.fn.hasPerm('editProducts') || S.fn.hasPerm('viewReports')) ? ['product-price-history', 'Lịch sử giá'] : null,
      grouped && S.fn.hasPerm('editProducts') ? ['add-product-to-existing-variant-group', 'Thêm SKU vào nhóm'] : null,
      S.fn.hasPerm('editProducts') ? ['archive-product', 'Lưu trữ sản phẩm'] : null,
    ].filter(Boolean) : [];
    const headerActions = actions.length ? `<details class='product-editor-more' data-product-editor-more><summary class='btn btn-secondary' aria-label='Thao tác sản phẩm' title='Thao tác sản phẩm'>${S.fn.icon('more', 21)}</summary><div class='product-editor-more-panel'>${actions.map(([action, label]) => `<button type='button' data-action='${action}' data-id='${S.fn.esc(p.id)}' ${action === 'archive-product' ? "class='editor-danger'" : ''}>${label}</button>`).join('')}</div></details>` : '';
    S.fn.showModal(p ? 'Cập nhật sản phẩm' : 'Thêm sản phẩm mới', '', form, footer, true, { productEditor: true, headerActions });
    S.fn.loadProductEditorCategories(S.dom.modal.querySelector('[data-form="product"]'));
  }


  S.fn.closeProductBarcode = function closeProductBarcode() {
    const surface = S.dom.modal.querySelector('[data-scan-mode="barcode-field"]:not([hidden])');
    if (!surface) return false;
    S.fn.stopScanCamera();
    surface.hidden = true;
    S.fn.scanCodeInput(surface)?.focus({ preventScroll: true });
    return true;
  }


  S.fn.closeProductEditorMenu = function closeProductEditorMenu() {
    const menu = S.dom.modal.querySelector('[data-product-editor-more][open]');
    if (!menu) return false;
    menu.open = false;
    menu.querySelector('summary').focus({ preventScroll: true });
    return true;
  }


  S.fn.openProductVariantAdd = function openProductVariantAdd(productId) {
    const product = S.fn.productById(productId);
    if (!product?.variantGroupId) return S.fn.toast('Chưa thể thêm biến thể', 'Sản phẩm không thuộc một nhóm biến thể.', 'error');
    const pending = S.fn.loadPendingProductVariantAdd();
    if (pending && pending.productId !== product.id) return S.fn.toast('Còn một SKU đang chờ', 'Hãy mở đúng nhóm biến thể đó để xác nhận thao tác đang chờ.', 'error');
    const payload = pending?.payload || { variants: [] };
    const row = payload.variants[0] || null;
    const rows = row ? S.fn.productVariantRow(row, 0, true, 1) : S.fn.productVariantRow(null, 0, false, 1);
    const batchBar = pending ? '' : `<div class='import-barcode-bar'><span>Quét hoặc tự sinh EAN-13 cho ô trống.</span><button class='btn btn-secondary' type='button' data-action='fill-variant-barcodes'>Tự tạo mã</button></div>`;
    const body = `<form id='entity-form' data-form='product-variant-add' data-id='${S.fn.esc(product.id)}'>${batchBar}<div id='product-variant-rows'>${rows}</div>${pending ? `<div class='modal-note'>Lần thêm này đang chờ máy chủ xác nhận. Gửi lại để dùng đúng nội dung và mã thao tác cũ.</div>` : ''}</form>`;
    const footer = `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Gửi lại cùng SKU' : 'Thêm biến thể'}</button>`;
    S.fn.showModal(pending ? 'Xác nhận SKU đang chờ' : 'Thêm SKU vào nhóm', '', body, footer, true);
  }


  S.fn.productVariantRow = function productVariantRow(variant, index, disabled, rowCount) {
    const attrs = Array.isArray(variant?.attributes)
      ? variant.attributes.map(function (item) { return `${item.name}=${item.value}`; }).join('; ')
      : '';
    const attrValue = typeof variant?.attributesText === 'string' ? variant.attributesText : attrs;
    return `<section class='purchase-line-card' data-product-variant-row><div class='purchase-line-head'><strong>Biến thể ${S.fn.number(index + 1)}</strong><button class='link-button' type='button' data-action='remove-product-variant' ${disabled || rowCount <= 2 ? 'disabled' : ''}>Xóa dòng</button></div><div class='form-grid'><div class='form-field'><label class='input-label'>SKU *</label><input class='input' data-variant-sku value='${S.fn.esc(variant?.sku || '')}' maxlength='80' required ${disabled ? 'disabled' : ''}/></div><div class='form-field'><label class='input-label'>Mã vạch</label><div class='input-action-row'><input class='input' data-variant-barcode value='${S.fn.esc(variant?.barcode || '')}' maxlength='80' placeholder='Quét hoặc tạo tự động' ${disabled ? 'disabled' : ''}/><button class='btn btn-secondary' type='button' data-action='generate-variant-barcode' ${disabled ? 'disabled' : ''}>Tạo mã</button></div></div><div class='form-field full'><label class='input-label'>Thuộc tính *</label><input class='input' data-variant-attributes value='${S.fn.esc(attrValue)}' placeholder='Màu=Đỏ; Kích cỡ=M' required ${disabled ? 'disabled' : ''}/><small>Nhập cặp Tên=Giá trị, phân tách bằng dấu chấm phẩy.</small></div><div class='form-field'><label class='input-label'>Giá bán (VND) *</label><input class='input' data-variant-price type='number' min='0' step='1' value='${S.fn.esc(variant?.salePriceVnd ?? '')}' required ${disabled ? 'disabled' : ''}/></div><div class='form-field'><label class='input-label'>Giá vốn (VND)</label><input class='input' data-variant-cost type='number' min='0' step='1' value='${S.fn.esc(variant?.costVnd ?? '0')}' ${disabled ? 'disabled' : ''}/></div><div class='form-field'><label class='input-label'>Nhắc khi còn</label><input class='input' data-variant-threshold type='number' min='0' step='0.001' value='${S.fn.esc(variant?.lowStockThreshold ?? '5')}' ${disabled ? 'disabled' : ''}/></div><label class='install-hint' style='display:flex;align-items:flex-start;gap:9px'><input data-variant-tracked type='checkbox' ${variant?.inventoryTracked === false ? '' : 'checked'} ${disabled ? 'disabled' : ''} style='margin-top:2px;flex:none'/><span><strong>Theo dõi tồn kho</strong></span></label></div></section>`;
  }


  S.fn.openProductVariantGroup = function openProductVariantGroup(initialPayload) {
    const pending = S.fn.loadPendingProductVariantGroup();
    const payload = pending?.payload || initialPayload || null;
    const disabled = Boolean(pending);
    const rows = payload
      ? payload.variants.map(function (variant, index) { return S.fn.productVariantRow(variant, index, disabled, payload.variants.length); }).join('')
      : S.fn.productVariantRow(null, 0, false, 2) + S.fn.productVariantRow(null, 1, false, 2);
    const batchBar = disabled ? '' : `<div class='import-barcode-bar'><span>Quét hoặc tự sinh EAN-13 cho ô trống.</span><button class='btn btn-secondary' type='button' data-action='fill-variant-barcodes'>Tự tạo mã</button></div>`;
    const form = `<form id='entity-form' data-form='product-variants' data-pending='${disabled ? 'true' : 'false'}'><div class='form-grid'><div class='form-field full'><label class='input-label'>Tên nhóm sản phẩm *</label><input class='input' name='name' value='${S.fn.esc(payload?.name || '')}' maxlength='200' placeholder='Ví dụ: Áo thun cotton' required ${disabled ? 'disabled' : ''}/></div><div class='form-field'><label class='input-label'>Danh mục</label><input class='input' name='category' value='${S.fn.esc(payload?.category || 'Chưa phân loại')}' maxlength='120' ${disabled ? 'disabled' : ''}/></div><div class='form-field'><label class='input-label'>Đơn vị</label><input class='input' name='unit' value='${S.fn.esc(payload?.unit || 'cái')}' maxlength='40' ${disabled ? 'disabled' : ''}/></div></div>${batchBar}<div id='product-variant-rows'>${rows}</div><button class='btn btn-secondary' type='button' data-action='add-product-variant' ${disabled ? 'disabled' : ''}>＋ Thêm biến thể</button>${disabled ? `<div class='modal-note'>Lần lưu này đang chờ máy chủ xác nhận. Gửi lại để dùng đúng nội dung và mã thao tác cũ.</div>` : ''}</form>`;
    S.fn.showModal(disabled ? 'Xác nhận nhóm biến thể đang chờ' : 'Tạo nhóm biến thể', '', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-primary' type='submit' form='entity-form'>${disabled ? 'Gửi lại cùng nhóm' : 'Tạo nhóm'}</button>`, true);
  }


  S.fn.productPriceSourceName = function productPriceSourceName(source) {
    return ({ created: 'Tạo sản phẩm', csv_import: 'Thêm vào danh mục', manual_adjustment: 'Điều chỉnh thủ công', bulk_update: 'Cập nhật danh mục hàng loạt', migration_baseline: 'Giá tại thời điểm bắt đầu ghi lịch sử' })[source] || 'Cập nhật giá';
  }


  S.fn.renderProductPriceHistory = function renderProductPriceHistory() {
    if (S.state.productPriceHistoryState.loading && !S.state.productPriceHistoryState.history.length) {
      return `<div class='empty-state product-price-history-empty'><strong>Đang tải lịch sử giá…</strong></div>`;
    }
    if (S.state.productPriceHistoryState.error && !S.state.productPriceHistoryState.history.length) {
      return `<div class='auth-message error'>${S.fn.esc(S.state.productPriceHistoryState.error)} <button class='link-button' data-action='product-price-history' data-id='${S.state.productPriceHistoryState.productId}'>Thử lại</button></div>`;
    }
    const entries = S.state.productPriceHistoryState.history.map(function (entry) {
      const transition = entry.previous_price_vnd === null
        ? `<strong>${S.fn.moneyVndText(entry.new_price_vnd)}</strong>`
        : `<span>${S.fn.moneyVndText(entry.previous_price_vnd)}</span><b aria-hidden='true'>→</b><strong>${S.fn.moneyVndText(entry.new_price_vnd)}</strong>`;
      return `<article class='product-price-history-entry'><i aria-hidden='true'></i><div class='product-price-history-copy'><div class='product-price-history-top'><strong>${S.fn.esc(S.fn.productPriceSourceName(entry.source_type))}</strong><time datetime='${S.fn.esc(entry.created_at)}'>${S.fn.esc(S.fn.humanDate(entry.created_at, true))}</time></div><div class='product-price-history-transition'>${transition}</div><small>${entry.actor_name ? `Thực hiện bởi ${S.fn.esc(entry.actor_name)}` : entry.source_type === 'migration_baseline' ? 'Mốc khởi tạo từ dữ liệu hiện có' : 'Không có thông tin người thực hiện'}</small></div></article>`;
    }).join('');
    const baselineNote = S.state.productPriceHistoryState.historyStartsAtMigrationBaseline
      ? `<p class='product-price-history-note'>Lịch sử bắt đầu ghi từ ngày cập nhật này. Các lần đổi giá trước đó không thể khôi phục.</p>` : '';
    const currentPrice = S.state.productPriceHistoryState.currentPriceVnd !== null
      ? `<div class='product-price-current'><span>Giá bán hiện tại</span><strong>${S.fn.moneyVndText(S.state.productPriceHistoryState.currentPriceVnd)}</strong></div>` : '';
    const loadMore = S.state.productPriceHistoryState.nextCursor
      ? `<button class='btn btn-secondary' type='button' data-action='load-more-product-price-history' ${S.state.productPriceHistoryState.loading ? 'disabled' : ''}>${S.state.productPriceHistoryState.loading ? 'Đang tải…' : 'Xem thay đổi cũ hơn'}</button>` : '';
    return `<div aria-live='polite'>${currentPrice}${baselineNote}<div class='product-price-history-list'>${entries || `<div class='empty-state product-price-history-empty'><strong>Chưa có lịch sử giá</strong></div>`}</div>${S.state.productPriceHistoryState.error ? `<div class='auth-message error'>${S.fn.esc(S.state.productPriceHistoryState.error)}</div>` : ''}${loadMore ? `<div class='product-price-history-more'>${loadMore}</div>` : ''}</div>`;
  }


  S.fn.paintProductPriceHistory = function paintProductPriceHistory(generation) {
    if (generation !== S.state.modalGeneration || S.dom.modal.hidden) return;
    const body = S.dom.modal.querySelector('.modal-body');
    if (body) body.innerHTML = S.fn.renderProductPriceHistory();
    const footer = S.dom.modal.querySelector('.modal-footer');
    if (footer) footer.innerHTML = `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button>`;
  }


  S.fn.openProductPriceHistory = async function openProductPriceHistory(productId) {
    if (!S.fn.hasPerm('viewCostPrice') && !S.fn.hasPerm('editProducts') && !S.fn.hasPerm('viewReports')) return S.fn.toast('Không có quyền', 'Vai trò của bạn không được xem lịch sử giá sản phẩm.', 'error');
    const product = S.fn.productById(productId);
    if (!productId || !S.state.store.id) return;
    const requestNumber = ++S.state.productPriceHistoryRequestNumber;
    S.state.productPriceHistoryState = { productId, currentPriceVnd: null, history: [], nextCursor: null, loading: true, error: '', historyStartsAtMigrationBaseline: false };
    S.fn.showModal('Lịch sử giá bán', product ? `${product.name} · ${product.sku}` : 'Thay đổi giá bán đã lưu trong cửa hàng.', S.fn.renderProductPriceHistory(), `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button>`, true);
    const generation = S.state.modalGeneration;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products/${encodeURIComponent(productId)}/price-history?limit=30`);
      if (requestNumber !== S.state.productPriceHistoryRequestNumber || generation !== S.state.modalGeneration || S.dom.modal.hidden) return;
      S.state.productPriceHistoryState.currentPriceVnd = result.product?.current_price_vnd ?? null;
      S.state.productPriceHistoryState.history = result.history || [];
      S.state.productPriceHistoryState.nextCursor = result.nextCursor || null;
      S.state.productPriceHistoryState.historyStartsAtMigrationBaseline = result.historyStartsAtMigrationBaseline === true;
      S.state.productPriceHistoryState.loading = false;
      S.fn.paintProductPriceHistory(generation);
    } catch (error) {
      if (requestNumber !== S.state.productPriceHistoryRequestNumber || generation !== S.state.modalGeneration || S.dom.modal.hidden) return;
      S.state.productPriceHistoryState.loading = false;
      S.state.productPriceHistoryState.error = error.message;
      S.fn.paintProductPriceHistory(generation);
    }
  }


  S.fn.loadMoreProductPriceHistory = async function loadMoreProductPriceHistory() {
    if (S.state.productPriceHistoryState.loading || !S.state.productPriceHistoryState.nextCursor) return;
    const requestNumber = ++S.state.productPriceHistoryRequestNumber;
    const generation = S.state.modalGeneration;
    S.state.productPriceHistoryState.loading = true;
    S.state.productPriceHistoryState.error = '';
    S.fn.paintProductPriceHistory(generation);
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products/${encodeURIComponent(S.state.productPriceHistoryState.productId)}/price-history?limit=30&before=${encodeURIComponent(S.state.productPriceHistoryState.nextCursor)}`);
      if (requestNumber !== S.state.productPriceHistoryRequestNumber || generation !== S.state.modalGeneration || S.dom.modal.hidden) return;
      S.state.productPriceHistoryState.history = S.state.productPriceHistoryState.history.concat(result.history || []);
      S.state.productPriceHistoryState.nextCursor = result.nextCursor || null;
      S.state.productPriceHistoryState.loading = false;
      S.fn.paintProductPriceHistory(generation);
    } catch (error) {
      if (requestNumber !== S.state.productPriceHistoryRequestNumber || generation !== S.state.modalGeneration || S.dom.modal.hidden) return;
      S.state.productPriceHistoryState.loading = false;
      S.state.productPriceHistoryState.error = error.message;
      S.fn.paintProductPriceHistory(generation);
    }
  }


  S.fn.renderWarrantyLookupResult = function renderWarrantyLookupResult(data, code) {
    if (!data || data.matchType !== 'serial' || !data.serial) {
      return `<div class='empty-state'><strong>Không tìm thấy Serial / IMEI “${S.fn.esc(code)}”</strong><span>Kiểm tra lại mã hoặc tìm theo sản phẩm khác.</span></div>`;
    }
    const s = data.serial;
    const prod = data.product ? S.fn.mapProduct(data.product) : null;
    const warrantyMonths = Number(s.warrantyMonths ?? s.warranty_months ?? prod?.warrantyMonths ?? 0);
    const expiresAt = s.warrantyExpiresAt || s.warranty_expires_at || '';
    const statusBadgeHtml = S.fn.formatSerialWarrantyBadge(s, warrantyMonths);
    const soldDate = s.soldAt || s.sold_at || s.orderOccurredAt || '';
    const orderBtn = s.orderId
      ? `<button class='link-button' type='button' data-action='order-detail' data-id='${S.fn.esc(s.orderId)}'>${S.fn.esc(s.orderNumber || s.orderId)}</button>`
      : 'Chưa gắn đơn bán';
    return `<article class='warranty-lookup-card'>
      <div class='warranty-card-head'>
        <div>
          <strong>${S.fn.esc(prod?.name || s.productName || 'Sản phẩm')}</strong>
          <small style='display:block;color:var(--muted)'>Serial/IMEI: <code>${S.fn.esc(s.code)}</code>${prod?.sku ? ` · SKU: ${S.fn.esc(prod.sku)}` : ''}</small>
        </div>
        ${statusBadgeHtml}
      </div>
      <div class='warranty-card-grid'>
        <div><small class='muted'>Trạng thái</small><div><strong>${s.status === 'in_stock' ? 'Còn trong kho' : 'Đã bán'}</strong></div></div>
        <div><small class='muted'>Thời hạn mặc định</small><div><strong>${warrantyMonths > 0 ? `${S.fn.number(warrantyMonths)} tháng` : 'Không bảo hành'}</strong></div></div>
        <div><small class='muted'>Ngày bán</small><div><strong>${soldDate ? S.fn.esc(S.fn.humanDate(soldDate, true)) : '—'}</strong></div></div>
        <div><small class='muted'>Hạn bảo hành</small><div><strong>${expiresAt ? S.fn.esc(S.fn.humanDate(expiresAt)) : (warrantyMonths > 0 && s.status === 'in_stock' ? 'Tính từ ngày bán' : '—')}</strong></div></div>
        <div><small class='muted'>Khách hàng</small><div><strong>${S.fn.esc(s.customerName || 'Khách lẻ')}${s.customerPhone ? ` · ${S.fn.esc(s.customerPhone)}` : ''}</strong></div></div>
        <div><small class='muted'>Đơn hàng</small><div>${orderBtn}</div></div>
      </div>
    </article>`;
  }


  S.fn.lookupWarrantyBySerial = async function lookupWarrantyBySerial(rawCode) {
    const code = String(rawCode || '').trim();
    const out = S.dom.modal.querySelector('[data-warranty-lookup-result]');
    if (!code || !out) return;
    out.innerHTML = `<div class='empty-state'><span>Đang tra cứu bảo hành…</span></div>`;
    try {
      const data = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/serials/lookup?code=${encodeURIComponent(code)}`, { preferFresh: true });
      if (!out.isConnected) return;
      out.innerHTML = S.fn.renderWarrantyLookupResult(data, code);
    } catch (error) {
      if (out.isConnected) {
        out.innerHTML = `<div class='auth-message error'>${S.fn.esc(error.message || 'Chưa tra cứu được Serial/IMEI.')}</div>`;
      }
    }
  }


  S.fn.openWarrantyLookupModal = function openWarrantyLookupModal(initialCode = '') {
    const body = `<form id='entity-form' data-form='warranty-lookup'>
      <div class='editor-input-action'>
        <input class='input' id='warranty-lookup-code' name='code' maxlength='120' value='${S.fn.esc(initialCode)}' placeholder='Nhập hoặc quét Serial / IMEI…' autocomplete='off' required/>
        <button class='btn btn-primary' type='submit'>Tra cứu</button>
        <button class='btn btn-secondary' type='button' data-action='toggle-warranty-camera' aria-label='Quét camera Serial/IMEI'>${S.fn.icon('scan', 18)}</button>
      </div>
      <section class='editor-barcode-camera' data-scan-surface data-scan-mode='warranty-lookup' data-scan-target='warranty-lookup-code' hidden style='margin-top:10px'>
        <div class='scan-camera-stage'>
          <video id='scan-camera-video' class='scan-camera-video' playsinline muted hidden aria-label='Camera quét bảo hành'></video>
          <div class='scan-feedback-pill' data-scan-pill hidden></div>
        </div>
        <p id='scan-camera-status' role='status' aria-live='polite'></p>
        <button class='btn btn-secondary' type='button' data-action='stop-warranty-camera'>Đóng camera</button>
      </section>
      <div data-warranty-lookup-result style='margin-top:14px'>${initialCode ? `<div class='empty-state'><span>Đang tra cứu…</span></div>` : `<div class='empty-state'><strong>Nhập hoặc quét Serial / IMEI</strong><span>Kiểm tra ngày bán, khách hàng và hạn bảo hành còn lại.</span></div>`}</div>
    </form>`;
    S.fn.showModal('Tra cứu bảo hành Serial / IMEI', 'Kiểm tra hạn bảo hành theo mã riêng của sản phẩm đã bán.', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button>`, true);
    if (initialCode) S.fn.lookupWarrantyBySerial(initialCode);
  }


  S.fn.openProductBarcodeSearchModal = function openProductBarcodeSearchModal() {
    const body = `<form id='entity-form' data-form='product-scan'>
      <div class='scan-camera-panel' data-scan-surface data-scan-mode='product-search' data-scan-target='product-scan-code'>
        <div class='scan-camera-stage'><div class='scan-camera-prompt' aria-hidden='true'>${S.fn.icon('scan', 28)}<strong>Đặt mã vào khung</strong></div>
          <video id='scan-camera-video' class='scan-camera-video' playsinline muted hidden aria-label='Camera quét tìm sản phẩm'></video>
          <div class='scan-viewfinder' aria-hidden='true'><i></i><i></i><i></i><i></i></div></div>
        <p id='scan-camera-status' class='scan-camera-status' role='status'></p>
        <button class='btn btn-secondary' type='button' data-action='start-camera-scan'>Mở camera</button>
        <details class='scan-manual-entry'><summary>Nhập mã thủ công</summary><div class='editor-input-action' style='margin-top:8px'><input id='product-scan-code' class='input' maxlength='80' autocomplete='off' placeholder='Nhập mã vạch…'/><button class='btn btn-primary' type='submit'>Tìm</button></div></details>
      </div></form>`;
    S.fn.showModal('Quét tìm sản phẩm', '', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button>`);
    const form = S.dom.modal.querySelector('[data-form="product-scan"]');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      event.stopPropagation();
      const code = form.querySelector('#product-scan-code').value.trim();
      if (!code) return;
      S.fn.closeModal();
      S.state.searchTerms.products = code;
      S.fn.loadProductsPage(code, 0, { keepSearch: true });
    });
    S.fn.startScanCamera(form.querySelector('[data-action="start-camera-scan"]'));
  }


  S.fn.barcodePrintItemsFromForm = function barcodePrintItemsFromForm(form) {
    const rows = Array.from(form.querySelectorAll('[data-barcode-print-row]'));
    return rows.map(function (row) {
      const checked = row.querySelector('[name="selected"]')?.checked;
      const copies = Math.max(0, Math.min(200, Math.floor(Number(row.querySelector('[name="copies"]')?.value) || 0)));
      return {
        id: row.dataset.id,
        name: row.dataset.name,
        sku: row.dataset.sku,
        barcode: row.dataset.barcode,
        priceVnd: row.dataset.price,
        copies: checked && copies > 0 ? copies : 0,
      };
    }).filter(function (item) { return item.copies > 0; });
  }


  S.fn.updateBarcodePrintPreview = function updateBarcodePrintPreview() {
    const form = S.dom.modal.querySelector('[data-form="barcode-print"]');
    const preview = S.dom.modal.querySelector('[data-barcode-sheet-preview]');
    if (!form || !preview || !window.SlinkBarcodeTools) return;
    const formats = Array.isArray(window.SlinkBarcodeTools.paperFormats) ? window.SlinkBarcodeTools.paperFormats : ['a4-65'];
    S.state.barcodePrintState.paper = formats.includes(form.elements.paper.value) ? form.elements.paper.value : 'a4-65';
    S.state.barcodePrintState.showStore = Boolean(form.elements.showStore.checked);
    S.state.barcodePrintState.showPrice = Boolean(form.elements.showPrice.checked);
    const items = S.fn.barcodePrintItemsFromForm(form);
    preview.innerHTML = window.SlinkBarcodeTools.buildBarcodeSheetHtml({
      storeName: S.state.store.settings.storeName || 'Slink',
      items,
      paper: S.state.barcodePrintState.paper,
      showStore: S.state.barcodePrintState.showStore,
      showPrice: S.state.barcodePrintState.showPrice,
      maxStickers: 120,
    });
  }


  S.fn.triggerBarcodePrintNow = function triggerBarcodePrintNow() {
    const form = S.dom.modal.querySelector('[data-form="barcode-print"]');
    if (!form || !window.SlinkBarcodeTools) return;
    const items = S.fn.barcodePrintItemsFromForm(form);
    if (!items.length) return S.fn.toast('Chưa chọn tem để in', 'Chọn ít nhất 1 sản phẩm và nhập số lượng tem > 0.', 'error');
    const html = window.SlinkBarcodeTools.buildBarcodeSheetHtml({
      storeName: S.state.store.settings.storeName || 'Slink',
      items,
      paper: S.state.barcodePrintState.paper,
      showStore: S.state.barcodePrintState.showStore,
      showPrice: S.state.barcodePrintState.showPrice,
    });
    const standaloneHtml = `<!doctype html><html lang='vi'><head><meta charset='utf-8'><title>Tem mã vạch ${S.fn.esc(S.state.store.settings.storeName || 'Slink')}</title><style>
      @page{size:auto;margin:4mm}*{box-sizing:border-box}body{margin:0;padding:4mm;font-family:Arial,sans-serif;background:#fff;color:#111}
      .barcode-print-sheet{display:grid;gap:3mm;background:#fff}
      .barcode-print-sheet[data-paper='a4-65']{grid-template-columns:repeat(5,minmax(0,1fr))}
      .barcode-print-sheet[data-paper='a4-40']{grid-template-columns:repeat(4,minmax(0,1fr))}
      .barcode-print-sheet[data-paper='thermal-2up']{grid-template-columns:repeat(2,minmax(0,1fr));max-width:72mm}
      .barcode-print-sheet[data-paper='thermal-1up']{grid-template-columns:1fr;max-width:52mm}
      .barcode-sticker{padding:4px 5px;border:1px dashed #ccc;display:grid;gap:2px;text-align:center;break-inside:avoid}
      .barcode-sticker-store{font-size:8px;font-weight:700;text-transform:uppercase;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .barcode-sticker-name{font-size:9px;font-weight:600;line-height:1.2;overflow:hidden}
      .barcode-sticker-svg{width:100%;max-height:42px}
      .barcode-sticker-meta{display:flex;justify-content:space-between;align-items:center;gap:4px;font-size:9px}
      .barcode-sticker-price{font-weight:700;white-space:nowrap}
      .barcode-sheet-cap-note{display:none}
    </style></head><body>${html}</body></html>`;
    if (window.SlinkAndroid) {
      S.fn.printHtmlDocument(standaloneHtml, `Tem ma vach ${S.state.store.settings.storeName || 'Slink'}`);
      return;
    }
    S.fn.printHtmlDocument(standaloneHtml, `Tem ma vach ${S.state.store.settings.storeName || 'Slink'}`);
  }


  S.fn.ensureCatalogProducts = async function ensureCatalogProducts() {
    if (!S.state.store.products.length && navigator.onLine && S.state.store.id) {
      try { await S.fn.loadProductsPage('', 0); } catch (_) {}
    }
    return S.state.store.products.length ? S.state.store.products : S.state.inventoryProducts;
  }


  S.fn.openBarcodePrintModal = async function openBarcodePrintModal(seedItems) {
    const requestStoreId = S.state.store.id;
    const requestSession = S.state.authSession;
    const sourceList = (Array.isArray(seedItems) && seedItems.length) ? seedItems : (await S.fn.ensureCatalogProducts()).slice(0, 60);
    if (S.state.store.id !== requestStoreId || S.state.authSession !== requestSession) return;
    const list = sourceList.map(function (p) {
      const code = p.barcode || '';
      return {
        id: p.id,
        name: p.name,
        sku: p.sku || '',
        barcode: code || p.sku || '',
        hasOwnBarcode: Boolean(code),
        priceVnd: String(p.price ?? p.salePriceVnd ?? '0'),
        copies: Math.max(1, Math.min(200, Math.round(Number(p.copies) || 1))),
        selected: p.selected !== false,
      };
    });
    if (!list.length) return S.fn.toast('Chưa có sản phẩm để in tem', 'Thêm sản phẩm trước khi tạo bảng in mã vạch.', 'error');
    const rowHtml = list.map(function (item) {
      return `<tr data-barcode-print-row data-id='${S.fn.esc(item.id)}' data-name='${S.fn.esc(item.name)}' data-sku='${S.fn.esc(item.sku)}' data-barcode='${S.fn.esc(item.barcode)}' data-price='${S.fn.esc(item.priceVnd)}' data-search='${S.fn.esc(`${item.name} ${item.sku} ${item.barcode}`.toLocaleLowerCase('vi'))}'>
        <td><input type='checkbox' name='selected' ${item.selected ? 'checked' : ''} aria-label='Chọn ${S.fn.esc(item.name)}'/></td>
        <td><strong>${S.fn.esc(item.name)}</strong><br><small>${S.fn.esc(item.barcode || item.sku)}${item.hasOwnBarcode ? '' : ' · dùng tạm SKU'}</small></td>
        <td class='text-right'>${S.fn.moneyVndText(item.priceVnd)}</td>
        <td><input class='input barcode-qty-input' type='number' name='copies' min='1' max='200' step='1' value='${item.copies}' aria-label='Số tem ${S.fn.esc(item.name)}'/></td>
      </tr>`;
    }).join('');
    const body = `<form id='entity-form' data-form='barcode-print' class='barcode-print-modal'>
      <div class='form-grid'>
        <div class='form-field'><label class='input-label' for='barcode-paper-size'>Khổ giấy in tem</label><select class='input' id='barcode-paper-size' name='paper'><option value='a4-65' ${S.state.barcodePrintState.paper === 'a4-65' ? 'selected' : ''}>Khổ A4 - 65 tem (38×21mm)</option><option value='a4-40' ${S.state.barcodePrintState.paper === 'a4-40' ? 'selected' : ''}>Khổ A4 - 40 tem (52×29mm)</option><option value='thermal-2up' ${S.state.barcodePrintState.paper === 'thermal-2up' ? 'selected' : ''}>Cuộn in nhiệt 2 cột (70×22mm)</option><option value='thermal-1up' ${S.state.barcodePrintState.paper === 'thermal-1up' ? 'selected' : ''}>Cuộn in nhiệt 1 tem (50×30mm)</option></select></div>
        <div class='form-field barcode-print-checks'><label><input type='checkbox' name='showStore' ${S.state.barcodePrintState.showStore ? 'checked' : ''}/> Hiện tên shop</label><label><input type='checkbox' name='showPrice' ${S.state.barcodePrintState.showPrice ? 'checked' : ''}/> Hiện giá bán</label></div>
      </div>
      <div class='barcode-toolbar'>
        <input class='input' type='search' data-barcode-filter placeholder='Lọc nhanh theo tên, SKU hoặc mã vạch…' aria-label='Lọc sản phẩm in tem' autocomplete='off'/>
        <div class='barcode-toolbar-actions'>
          <button class='btn btn-secondary' type='button' data-action='barcode-select-all'>Chọn tất cả</button>
          <button class='btn btn-secondary' type='button' data-action='barcode-select-none'>Bỏ chọn</button>
        </div>
      </div>
      <div class='table-wrap barcode-pick-table'><table class='data-table'><thead><tr><th>In</th><th>Sản phẩm &amp; mã vạch</th><th class='text-right'>Giá</th><th>Số tem</th></tr></thead><tbody>${rowHtml}</tbody></table></div>
      <div class='barcode-preview-wrap'><strong>Xem trước tem in</strong><div data-barcode-sheet-preview></div></div>
    </form>`;
    S.fn.showModal('In tem mã vạch', 'Hỗ trợ máy in mã vạch nhiệt (cuộn 1 tem, 2 tem) hoặc giấy Tomy/Decal A4 (40, 65 tem).', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-primary' type='button' data-action='confirm-print-barcodes'>In tem ngay</button>`, true);
    const form = S.dom.modal.querySelector('[data-form="barcode-print"]');
    form.addEventListener('input', S.fn.updateBarcodePrintPreview);
    form.addEventListener('change', S.fn.updateBarcodePrintPreview);
    S.fn.updateBarcodePrintPreview();
  }


  S.fn.saveProductImport = async function saveProductImport(form) {
    if (form.dataset.saving === 'true') return;
    const requestStoreId = S.state.store.id;
    const requestSession = S.state.authSession;
    let pending = S.fn.loadPendingProductImport();
    if (!pending) {
      if (S.state.productImportErrors.length || !S.state.productImportRows.length) return S.fn.toast('Chưa thể nhập sản phẩm', 'Chọn tệp CSV hợp lệ rồi kiểm tra bản xem trước.', 'error');
      if (!S.state.productImportVerifiedWarehouseId || S.state.productImportVerifiedWarehouseId !== (S.dom.modal.querySelector('#product-import-warehouse')?.value || '')) return S.fn.toast('Chưa thể nhập sản phẩm', 'Hãy chọn kho và kiểm tra lại tệp trước khi nhập.', 'error');
      pending = { storeId: S.state.store.id, key: S.fn.newIdempotencyKey(), payload: { items: S.state.productImportRows, warehouseId: S.state.productImportVerifiedWarehouseId } };
    }
    if (!S.fn.savePendingProductImport(pending)) return S.fn.pendingSaveFailed();
    form.dataset.saving = 'true';
    const requestGeneration = S.state.modalGeneration;
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    const fileInput = S.dom.modal.querySelector('#product-import-file');
    if (submitButton) submitButton.disabled = true;
    if (fileInput) fileInput.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products/import`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      if (S.state.store.id !== requestStoreId || S.state.authSession !== requestSession) return;
      S.fn.clearPendingProductImport();
      const importedSource = pending.payload.items || [];
      S.state.lastImportedPrintItems = Array.isArray(result.products) ? result.products.map(function (item, index) {
        const mapped = S.fn.mapProduct(item);
        const src = importedSource[index];
        const qty = Math.round(Number(src?.openingQuantity ?? item.on_hand ?? 1));
        return { ...mapped, copies: qty > 0 ? Math.min(200, qty) : 1, selected: true };
      }) : [];
      const canContinue = requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden;
      if (canContinue) {
        S.fn.closeModal();
        S.fn.resetCatalogFilters();
        S.state.productImportRows = [];
        S.state.productImportSourceRows = [];
        S.state.productImportErrors = [];
        S.state.productImportPending = false;
      }
      await S.fn.loadProductsPage('', 0);
      S.fn.emitSyncDomains(['products'], { source: 'product-bulk-update' });
      if (S.state.store.id !== requestStoreId || S.state.authSession !== requestSession) return;
      S.fn.emitSyncDomains(['products', 'stock', 'dashboard'], { source: 'product-import' });
      S.fn.toast('Đã nhập sản phẩm', `${S.fn.number(Number(result.count))} sản phẩm · tồn đầu kỳ đã ghi vào sổ kho.`);
      if (canContinue && requestGeneration === S.state.modalGeneration && S.dom.modal.hidden && S.state.page !== 'pos') {
        S.fn.openCatalogNextStep(result.products.some(function (product) { return !product.inventory_tracked || Number(product.on_hand) > 0; }));
      }
    } catch (error) {
      if (S.state.store.id !== requestStoreId || S.state.authSession !== requestSession) return;
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra lần nhập.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingProductImport();
        S.state.productImportPending = false;
        if (requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden) {
          S.state.productImportRows = [];
          S.state.productImportErrors = [`Máy chủ chưa nhập dòng nào: ${error.message} Chọn tệp đã sửa để thử lại.`];
          S.state.productImportVerifiedWarehouseId = '';
          if (fileInput && fileInput.isConnected) fileInput.disabled = false;
          S.fn.renderProductImportPreview();
        }
      }
      S.fn.toast('Chưa nhập được danh mục', error.message, 'error');
      if (submitButton && requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden && submitButton.isConnected && !S.state.productImportRows.length) submitButton.disabled = true;
      else if (submitButton && requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden && submitButton.isConnected) submitButton.disabled = false;
    } finally {
      delete form.dataset.saving;
    }
  }


  S.fn.saveProductBulkUpdate = async function saveProductBulkUpdate(form) {
    let pending = S.fn.loadPendingProductBulkUpdate();
    if (!pending) {
      if (S.state.productBulkUpdateErrors.length || !S.state.productBulkUpdateRows.length) return S.fn.toast('Chưa thể cập nhật', 'Chọn tệp CSV hợp lệ và kiểm tra bản xem trước.', 'error');
      pending = { key: S.fn.newIdempotencyKey(), payload: { items: S.state.productBulkUpdateRows } };
    }
    if (!S.fn.savePendingProductBulkUpdate(pending)) return S.fn.pendingSaveFailed();
    const requestGeneration = S.state.modalGeneration;
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    const fileInput = S.dom.modal.querySelector('#product-bulk-update-file');
    if (submitButton) submitButton.disabled = true;
    if (fileInput) fileInput.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products/bulk-update`, {
        method: 'POST', headers: { 'idempotency-key': pending.key },
        body: { items: pending.payload.items.map(function (item) { const { before, ...requestItem } = item; return requestItem; }) },
      });
      S.fn.clearPendingProductBulkUpdate();
      if (requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden) {
        S.fn.closeModal();
        S.state.productBulkUpdateRows = [];
        S.state.productBulkUpdateErrors = [];
      }
      await S.fn.loadProductsPage('', 0);
      S.fn.emitSyncDomains(['products'], { source: 'product-bulk-update' });
      const changedCount = Number.isSafeInteger(result.changedCount) ? result.changedCount : (Number(result.count) || 0);
      const unchangedCount = Number.isSafeInteger(result.unchangedCount) ? result.unchangedCount : 0;
      if (changedCount > 0) {
        S.fn.toast('Đã cập nhật sản phẩm', `${S.fn.number(changedCount)} thay đổi đã lưu · ${S.fn.number(unchangedCount)} sản phẩm giữ nguyên.`);
      } else {
        S.fn.toast('Danh mục không đổi', `${S.fn.number(unchangedCount || result.count)} sản phẩm đã giống dữ liệu hiện tại; không phát sinh lịch sử mới.`);
      }
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra cập nhật đang chờ.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingProductBulkUpdate();
        if (requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden) {
          S.state.productBulkUpdateRows = [];
          S.state.productBulkUpdateErrors = [`Máy chủ không cập nhật dòng nào: ${error.message} Hãy tải danh sách mới, áp dụng lại thay đổi rồi gửi lại.`];
          if (fileInput && fileInput.isConnected) fileInput.disabled = false;
          S.fn.renderProductBulkUpdatePreview();
        }
      }
      S.fn.toast('Chưa cập nhật được sản phẩm', error.message, 'error');
      if (submitButton && requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden && submitButton.isConnected && !S.state.productBulkUpdateRows.length) submitButton.disabled = true;
      else if (submitButton && requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden && submitButton.isConnected) submitButton.disabled = false;
    }
  }


  S.fn.saveProduct = async function saveProduct(form) {
    if (form.dataset.saving === 'true') return;
    S.fn.closeProductBarcode();
    const data = new FormData(form); const id = form.dataset.id; const old = id ? S.fn.productById(id) : null;
    const feedback = form.querySelector('[data-product-editor-error]');
    const report = message => { feedback.textContent = message; feedback.hidden = false; feedback.scrollIntoView({ block: 'nearest' }); };
    feedback.hidden = true;
    let image; try { image = S.fn.readProductPhoto(form); } catch (error) { return S.fn.toast('Chưa lưu được mặt hàng', error.message, 'error'); }
    const extraBarcodesRaw = String(data.get('extraBarcodes') || '').trim();
    const extraBarcodes = extraBarcodesRaw
      ? extraBarcodesRaw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
      : [];
    const rawWarranty = String(data.get('warrantyMonths') ?? old?.warrantyMonths ?? 0).trim() || '0';
    const warrantyMonths = Number(rawWarranty);
    if (!/^\d+$/.test(rawWarranty) || !Number.isSafeInteger(warrantyMonths) || warrantyMonths < 0 || warrantyMonths > 120) {
      return report('Thời gian bảo hành phải là số nguyên từ 0 đến 120 tháng.');
    }
    const payload = {
      image,
      name: String(data.get('name')).trim(),
      sku: String(data.get('sku') || '').trim(),
      barcode: String(data.get('barcode') || '').trim() || null,
      extraBarcodes,
      category: S.fn.readProductCategory(data),
      unit: String(data.get('unit') || 'cái').trim(),
      salePriceVnd: Number(data.get('price')),
      costVnd: S.fn.hasPerm('viewCostPrice') ? Number(data.get('cost') || 0) : Number(old?.cost || 0),
      lowStockThreshold: Number(data.get('minStock') ?? old?.minStock ?? 0),
      warrantyMonths,
      inventoryTracked: data.get('inventoryTracked') === 'on',
    };
    if (old?.variantGroupId) {
      try {
        payload.variantAttributes = Object.fromEntries(S.fn.parseVariantAttributesText(String(data.get('variantAttributesText') || ''), 0).map(function (entry) { return [entry.name, entry.value]; }));
      } catch (error) { return S.fn.toast('Thuộc tính chưa hợp lệ', error.message, 'error'); }
    }
    try { const pack=S.fn.readProductPack(form); if(pack!==undefined)payload.purchasePack=pack;if(!old&&pack&&!String(data.get('cost')||'').trim())payload.costVnd=Number(window.SlinkPurchaseUnits.fromPack(pack).unitCostVnd); } catch(error) { return S.fn.toast('Kiểm tra quy đổi nhập hàng',error.message,'error'); }
    if (payload.purchasePack && payload.costVnd > payload.salePriceVnd && payload.costVnd > Number(window.SlinkPurchaseUnits.fromPack(payload.purchasePack).unitCostVnd) && !data.get('confirmCostMismatch')) return report('Giá vốn cao hơn giá bán và giá nhập quy đổi. Chọn dùng giá quy đổi hoặc xác nhận giữ giá vốn.');
    if (old) payload.version = Number(form.dataset.version);
    form.dataset.saving = 'true';
    const submit = S.dom.modal.querySelector('.modal-footer [type="submit"]');
    submit.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products${old ? `/${encodeURIComponent(old.id)}` : ''}`, {
        method: old ? 'PUT' : 'POST', body: payload,
      });
      if (S.dom.modal.contains(form)) S.fn.closeModal();
      S.fn.emitSyncDomains(['products'], { source: 'product-save' });
      S.fn.toast(old ? 'Đã cập nhật sản phẩm' : 'Đã thêm sản phẩm', result.product.name);
      if (S.state.page === 'inventory') await S.fn.loadInventoryPage(S.state.searchTerms.inventory, S.state.inventoryOffset);
      else await S.fn.loadProductsPage(S.state.searchTerms.products, S.state.productOffset);
    } catch (error) {
      if (S.dom.modal.contains(form)) report(error.message);
    } finally {
      delete form.dataset.saving;
      if (submit.isConnected) submit.disabled = false;
    }
  }


  S.fn.parseVariantAttributesText = function parseVariantAttributesText(value, index) {
    const pairs = String(value || '').split(';').map(function (part) { return part.trim(); }).filter(Boolean);
    if (!pairs.length || pairs.length > 8) throw new Error(`Biến thể ${S.fn.number(index + 1)}: nhập từ 1 đến 8 thuộc tính theo dạng Tên=Giá trị.`);
    const names = new Set();
    return pairs.map(function (pair) {
      const separator = pair.indexOf('=');
      if (separator < 1) throw new Error(`Biến thể ${S.fn.number(index + 1)}: mỗi thuộc tính cần có dạng Tên=Giá trị.`);
      const name = pair.slice(0, separator).trim();
      const valueText = pair.slice(separator + 1).trim();
      const key = name.toLocaleLowerCase('vi');
      if (!name || !valueText || names.has(key)) throw new Error(`Biến thể ${S.fn.number(index + 1)}: tên thuộc tính phải riêng biệt và giá trị không được để trống.`);
      names.add(key);
      return { name: name, value: valueText };
    });
  }


  S.fn.saveProductVariantGroup = async function saveProductVariantGroup(form) {
    let pending = S.fn.loadPendingProductVariantGroup();
    let payload = pending?.payload || null;
    if (!pending) {
      const value = function (name) { return String(new FormData(form).get(name) || '').trim(); };
      const rows = Array.from(form.querySelectorAll('[data-product-variant-row]'));
      if (rows.length < 2 || rows.length > 50) return S.fn.toast('Số biến thể chưa hợp lệ', 'Mỗi nhóm cần từ 2 đến 50 biến thể.', 'error');
      try {
        payload = {
          name: value('name'), category: value('category') || 'Chưa phân loại', unit: value('unit') || 'cái',
          variants: rows.map(function (row, index) {
            return {
              sku: String(row.querySelector('[data-variant-sku]').value || '').trim(),
              barcode: String(row.querySelector('[data-variant-barcode]').value || '').trim() || null,
              attributes: S.fn.parseVariantAttributesText(row.querySelector('[data-variant-attributes]').value, index),
              salePriceVnd: Number(S.fn.moneyInputRaw(row.querySelector('[data-variant-price]').value)),
              costVnd: Number(S.fn.moneyInputRaw(row.querySelector('[data-variant-cost]').value || '0')),
              lowStockThreshold: Number(row.querySelector('[data-variant-threshold]').value || 0),
              inventoryTracked: row.querySelector('[data-variant-tracked]').checked,
            };
          }),
        };
      } catch (error) { return S.fn.toast('Thuộc tính chưa hợp lệ', error.message, 'error'); }
      pending = { key: S.fn.newIdempotencyKey(), payload: payload };
      if (!S.fn.savePendingProductVariantGroup(pending)) return S.fn.pendingSaveFailed();
    }
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products/variants`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: payload,
      });
      S.fn.clearPendingProductVariantGroup();
      S.fn.closeModal();
      S.fn.emitSyncDomains(['products'], { source: 'variant-group' });
      S.fn.toast('Đã tạo nhóm biến thể', `${result.count} SKU · ${result.name}`);
      await S.fn.loadProductsPage(S.state.searchTerms.products, S.state.productOffset);
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingProductVariantGroup();
        S.fn.openProductVariantGroup(payload);
      } else if (submitButton && submitButton.isConnected) submitButton.disabled = false;
      S.fn.toast('Chưa xác nhận được nhóm biến thể', error.message, 'error');
    }
  }


  S.fn.saveProductVariantAdd = async function saveProductVariantAdd(form) {
    let pending = S.fn.loadPendingProductVariantAdd();
    if (pending && pending.productId !== form.dataset.id) return S.fn.toast('Còn một thao tác đang chờ', 'Hãy xác nhận SKU đang chờ trước khi bắt đầu thao tác khác.', 'error');
    if (!pending) {
      const row = form.querySelector('[data-product-variant-row]');
      if (!row) return S.fn.toast('Thiếu dòng biến thể', 'Hãy nhập SKU mới rồi thử lại.', 'error');
      try {
        pending = {
          key: S.fn.newIdempotencyKey(), productId: form.dataset.id,
          payload: { variants: [{
            sku: String(row.querySelector('[data-variant-sku]').value || '').trim(),
            barcode: String(row.querySelector('[data-variant-barcode]').value || '').trim() || null,
            attributes: S.fn.parseVariantAttributesText(row.querySelector('[data-variant-attributes]').value, 0),
            salePriceVnd: Number(S.fn.moneyInputRaw(row.querySelector('[data-variant-price]').value)),
            costVnd: Number(S.fn.moneyInputRaw(row.querySelector('[data-variant-cost]').value || '0')),
            lowStockThreshold: Number(row.querySelector('[data-variant-threshold]').value || 0),
            inventoryTracked: row.querySelector('[data-variant-tracked]').checked,
          }] },
        };
      } catch (error) { return S.fn.toast('Thuộc tính chưa hợp lệ', error.message, 'error'); }
    }
    if (!S.fn.savePendingProductVariantAdd(pending)) return S.fn.pendingSaveFailed();
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products/${encodeURIComponent(pending.productId)}/variants`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      S.fn.clearPendingProductVariantAdd();
      S.fn.closeModal();
      S.fn.emitSyncDomains(['products'], { source: 'variant-add' });
      await S.fn.loadProductsPage(S.state.searchTerms.products, S.state.productOffset);
      S.fn.toast('Đã thêm SKU vào nhóm', `${result.count} biến thể · ${result.name}`);
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) S.fn.clearPendingProductVariantAdd();
      if (submitButton && submitButton.isConnected) submitButton.disabled = false;
      S.fn.toast('Chưa xác nhận được SKU mới', error.message, 'error');
    }
  }


  S.fn.archiveProduct = async function archiveProduct(id) {
    const product = S.fn.productById(id);
    if (!product || !window.confirm('Lưu trữ sản phẩm này? Lịch sử bán hàng và tồn kho sẽ được giữ lại.')) return;
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products/${encodeURIComponent(id)}/archive`, { method: 'POST', body: {} });
      S.fn.closeModal();
      S.fn.emitSyncDomains(['products', 'stock'], { source: 'archive-product' });
      S.fn.toast('Đã lưu trữ sản phẩm', product.name);
      await S.fn.loadProductsPage(S.state.searchTerms.products, Math.max(0, S.state.productOffset));
    } catch (error) {
      S.fn.toast('Chưa lưu trữ được sản phẩm', error.message, 'error');
    }
  }


  S.fn.addByCode = async function addByCode(form, options) {
    const code = String(new FormData(form).get('code') || '').trim();
    if (!code) return S.fn.toast('Nhập mã sản phẩm', 'Quét hoặc nhập SKU, mã vạch hoặc tên chính xác.', 'error');
    if (S.state.checkoutPendingPayload) return S.fn.toast('Đang chờ xác nhận đơn', 'Hãy kiểm tra hoặc gửi lại đơn trước khi thay đổi giỏ hàng.', 'error');
    if (code.length > 120) {
      S.fn.openProductFromScan('', options && options.photo, '');
      return;
    }
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products?limit=100&q=${encodeURIComponent(code)}${S.fn.posWarehouseParam()}`);
      const products = (result.products || []).map(S.fn.mapProduct);
      const normalized = code.toLocaleLowerCase('vi');
      const product = products.find(function (item) {
        return item.sku.toLocaleLowerCase('vi') === normalized
          || item.barcode === code
          || (Array.isArray(item.extraBarcodes) && item.extraBarcodes.includes(code))
          || item.name.toLocaleLowerCase('vi') === normalized;
      });
      if (!product) {
        const canCreate = S.fn.hasPerm('editProducts');
        if (!canCreate) {
          S.fn.closeModal();
          return S.fn.toast('Chưa có mặt hàng này', 'Nhờ chủ cửa hàng hoặc người quản lý danh mục thêm sản phẩm trước khi bán.', 'error');
        }
        const barcode = options && options.detected && code.length <= 80 ? code : '';
        const safeSku = barcode && /^[A-Za-z0-9._-]+$/.test(barcode) ? barcode : '';
        S.fn.openProductFromScan(barcode, options && options.photo, safeSku);
        return;
      }
      if (product.inventoryTracked && !(product.stock > 0)) return S.fn.toast('Sản phẩm đã hết hàng', 'Hãy nhập kho trước khi bán.', 'error');
      const current = S.state.cart.find(function (item) { return item.id === product.id; });
      if (product.inventoryTracked && current && current.qty >= product.stock) return S.fn.toast('Không đủ số lượng tồn', 'Giỏ hàng đã đạt số lượng đang có trong kho.', 'error');
      const cachedIndex = S.state.store.products.findIndex(function (item) { return item.id === product.id; });
      if (cachedIndex >= 0) S.state.store.products[cachedIndex] = product;
      else S.state.store.products.unshift(product);
      S.fn.closeModal();
      S.state.page = 'pos';
      if (!S.fn.addProductToCart(product)) return;
      S.fn.toast('Đã thêm vào giỏ', product.name);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa tra cứu được mã hàng', error.message, 'error');
    }
  }


  S.fn.toggleProductSelect = function toggleProductSelect(id, checked) {
    if (!S.state.selectedProductIds) S.state.selectedProductIds = new Set();
    if (checked) S.state.selectedProductIds.add(id);
    else S.state.selectedProductIds.delete(id);
    S.fn.refreshSearchList('product');
  }


  S.fn.toggleSelectAllProducts = function toggleSelectAllProducts(checked) {
    if (!S.state.selectedProductIds) S.state.selectedProductIds = new Set();
    const visible = S.fn.filteredProducts(S.state.searchTerms.products, 'Tất cả');
    visible.forEach(function (p) {
      if (checked) S.state.selectedProductIds.add(p.id);
      else S.state.selectedProductIds.delete(p.id);
    });
    S.fn.refreshSearchList('product');
  }


  S.fn.clearSelectedProducts = function clearSelectedProducts() {
    S.state.selectedProductIds = new Set();
    S.fn.refreshSearchList('product');
  }


  S.fn.selectedProductsList = function selectedProductsList() {
    const selected = S.state.selectedProductIds || new Set();
    const byId = new Map();
    S.state.store.products.forEach(function (p) { if (p && selected.has(p.id)) byId.set(p.id, p); });
    S.state.productCache.forEach(function (p) { if (p && selected.has(p.id) && !byId.has(p.id)) byId.set(p.id, p); });
    return Array.from(byId.values());
  }


  S.fn.batchPrintSelectedBarcodes = function batchPrintSelectedBarcodes() {
    const list = S.fn.selectedProductsList();
    if (!list.length) return S.fn.toast('Chưa chọn sản phẩm', 'Đánh dấu ít nhất một sản phẩm để in tem.', 'error');
    S.fn.openBarcodePrintModal(list);
  }


  S.fn.batchExportSelectedProducts = function batchExportSelectedProducts() {
    const list = S.fn.selectedProductsList();
    if (!list.length) return S.fn.toast('Chưa chọn sản phẩm', 'Đánh dấu ít nhất một sản phẩm để xuất CSV.', 'error');
    const safeCell = function (val) {
      let s = String(val ?? '');
      if (/^[\s\u0000-\u001f]*[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const showCost = S.fn.hasPerm('viewCostPrice');
    const headers = ['SKU', 'Mã vạch', 'Tên sản phẩm', 'Danh mục', 'Đơn vị', 'Giá bán (VND)', ...(showCost ? ['Giá vốn (VND)'] : []), 'Tồn kho'];
    const rows = [headers.map(safeCell).join(',')];
    list.forEach(function (p) {
      const cells = [p.sku, p.barcode || '', p.name, p.category, p.unit, String(p.price ?? 0), ...(showCost ? [p.cost == null ? '' : String(p.cost)] : []), p.inventoryTracked ? String(p.stock ?? 0) : ''];
      rows.push(cells.map(safeCell).join(','));
    });
    const csv = '\uFEFF' + rows.join('\r\n');
    S.fn.download(`slink-san-pham-da-chon-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
    S.fn.toast('Đã xuất CSV sản phẩm đã chọn', `${S.fn.number(list.length)} sản phẩm`);
  }


  S.fn.stockCardMovementLabel = function stockCardMovementLabel(type) {
    const labels = {
      initial: 'Tồn đầu kỳ',
      sale: 'Bán hàng',
      void_sale: 'Hủy hóa đơn',
      reversal: 'Hoàn kho hủy đơn',
      return: 'Khách trả hàng',
      purchase: 'Nhập hàng',
      purchase_receipt: 'Nhập kho NCC',
      supplier_return: 'Trả hàng NCC',
      count: 'Kiểm kho',
      adjustment: 'Kiểm kho / Điều chỉnh',
      transfer_out: 'Xuất chuyển kho',
      transfer_in: 'Nhập chuyển kho',
    };
    return labels[type] || type || 'Biến động';
  }


  S.fn.renderProductDetailBody = function renderProductDetailBody(state) {
    if (!state || state.loading) return `<div class='empty-state'><strong>Đang tải thông tin và thẻ kho…</strong></div>`;
    if (state.error) return `<div class='auth-message error'>${S.fn.esc(state.error)}</div>`;
    const data = state.data;
    if (!data || !data.product) return `<div class='empty-state'><strong>Không tìm thấy dữ liệu sản phẩm.</strong></div>`;
    const p = data.product;
    const activeTab = state.tab || 'info';
    const tabs = [
      ['info', 'Thông tin & Giá'],
      ['stock-card', 'Thẻ kho'],
      ['warehouses', 'Tồn theo kho'],
      ['serials', 'Serial & Bảo hành'],
    ];
    const tabBar = `<div class='detail-tabs' role='tablist' aria-label='Chi tiết sản phẩm'>${tabs.map(function (t) {
      return `<button type='button' role='tab' class='${activeTab === t[0] ? 'active' : ''}' data-action='product-detail-tab' data-tab='${t[0]}' aria-selected='${activeTab === t[0]}'>${t[1]}</button>`;
    }).join('')}</div>`;
    let content = '';
    if (activeTab === 'info') {
      const showCost = S.fn.hasPerm('viewCostPrice') && p.costVnd !== null && p.costVnd !== undefined;
      const totalOnHand = (data.balancesByWarehouse || []).reduce(function (sum, w) { return sum + (Number(w.onHand) || 0); }, 0);
      const extraBarcodes = Array.isArray(p.extraBarcodes) && p.extraBarcodes.length ? p.extraBarcodes.join(', ') : '—';
      content = `<div class='detail-kv-grid'>
        <div class='detail-kv-item'><small>Mã SKU</small><strong>${S.fn.esc(p.sku || '—')}</strong></div>
        <div class='detail-kv-item'><small>Mã vạch chính</small><strong>${S.fn.esc(p.barcode || 'Chưa gắn')}</strong></div>
        <div class='detail-kv-item'><small>Mã vạch phụ</small><strong>${S.fn.esc(extraBarcodes)}</strong></div>
        <div class='detail-kv-item'><small>Danh mục &amp; ĐVT</small><strong>${S.fn.esc(p.category || 'Chung')} · ${S.fn.esc(p.unit || 'cái')}</strong></div>
        <div class='detail-kv-item'><small>Giá bán</small><strong style='color:var(--primary)'>${S.fn.moneyVndText(p.salePriceVnd)}</strong></div>
        ${showCost ? `<div class='detail-kv-item'><small>Giá vốn bình quân</small><strong>${S.fn.moneyVndText(p.costVnd)}</strong></div>` : ''}
        <div class='detail-kv-item'><small>Tổng tồn các kho được xem</small><strong>${p.inventoryTracked ? `${S.fn.number(totalOnHand)} ${S.fn.esc(p.unit)}` : 'Không theo dõi tồn'}</strong></div>
        <div class='detail-kv-item'><small>Nhắc khi tồn dưới</small><strong>${p.inventoryTracked ? S.fn.number(p.lowStockThreshold || 0) : '—'}</strong></div>
        <div class='detail-kv-item'><small>Bảo hành / Serial</small><strong>${p.warrantyMonths > 0 ? `${S.fn.number(p.warrantyMonths)} tháng` : 'Không bảo hành'}${p.serialTracked ? ' · Quản lý Serial/IMEI' : ''}</strong></div>
      </div>`;
    } else if (activeTab === 'stock-card') {
      const showCost = S.fn.hasPerm('viewCostPrice');
      const rows = (data.movements || []).map(function (m) {
        const delta = Number(m.quantityDelta || 0);
        const deltaText = delta > 0 ? `+${S.fn.number(delta)}` : S.fn.number(delta);
        const deltaTone = delta > 0 ? 'badge-success' : delta < 0 ? 'badge-warning' : 'badge-neutral';
        return `<tr>
          <td>${S.fn.humanDate(m.occurredAt, true)}</td>
          <td>${S.fn.esc(m.warehouseName || '—')}</td>
          <td><strong>${S.fn.esc(S.fn.stockCardMovementLabel(m.movementType))}</strong>${m.reason ? `<div class='muted' style='font-size:11.5px'>${S.fn.esc(m.reason)}</div>` : ''}</td>
          <td class='text-right'><span class='badge ${deltaTone}'>${deltaText}</span></td>
          <td class='text-right'><strong>${S.fn.number(m.quantityAfter)}</strong></td>
          ${showCost ? `<td class='text-right'>${m.unitCostVnd != null ? S.fn.moneyVndText(m.unitCostVnd) : '—'}</td>` : ''}
          <td>${S.fn.esc(m.actorName || 'Hệ thống')}</td>
        </tr>`;
      }).join('');
      content = `<div class='table-wrap'><table class='data-table'><thead><tr><th>Thời gian</th><th>Kho</th><th>Nghiệp vụ / Lý do</th><th class='text-right'>Thay đổi</th><th class='text-right'>Tồn sau</th>${showCost ? `<th class='text-right'>Giá vốn</th>` : ''}<th>Người thực hiện</th></tr></thead><tbody>${rows || `<tr><td colspan='${showCost ? 7 : 6}'><div class='empty-state'>Chưa có lịch sử xuất nhập kho cho mặt hàng này.</div></td></tr>`}</tbody></table></div>`;
    } else if (activeTab === 'warehouses') {
      const rows = (data.balancesByWarehouse || []).map(function (w) {
        const available = Math.max(0, Number(w.onHand || 0) - Number(w.reserved || 0));
        return `<tr>
          <td><strong>${S.fn.esc(w.warehouseName)}</strong>${w.isDefault ? ` <span class='badge badge-info'>Kho chính</span>` : ''}</td>
          <td>${S.fn.esc(w.warehouseCode || '—')}</td>
          <td class='text-right'><strong>${S.fn.number(w.onHand || 0)}</strong></td>
          <td class='text-right'>${S.fn.number(w.reserved || 0)}</td>
          <td class='text-right'><strong style='color:var(--primary)'>${S.fn.number(available)}</strong></td>
          <td>${w.updatedAt ? S.fn.humanDate(w.updatedAt, true) : '—'}</td>
        </tr>`;
      }).join('');
      content = `<div class='table-wrap'><table class='data-table'><thead><tr><th>Tên kho</th><th>Mã kho</th><th class='text-right'>Tồn thực tế</th><th class='text-right'>Đang giữ</th><th class='text-right'>Có thể bán</th><th>Cập nhật</th></tr></thead><tbody>${rows || `<tr><td colspan='6'><div class='empty-state'>Chưa có dữ liệu tồn theo kho.</div></td></tr>`}</tbody></table></div>`;
    } else {
      const s = data.serialSummary || { inStockCount: 0, soldCount: 0, archivedCount: 0 };
      content = `<div class='stat-grid' style='margin-bottom:14px'>
        <article class='stat-card'><div class='stat-top'><span class='stat-label'>Đang trong kho</span></div><div class='stat-value'>${S.fn.number(s.inStockCount || 0)}</div></article>
        <article class='stat-card'><div class='stat-top'><span class='stat-label'>Đã bán</span></div><div class='stat-value'>${S.fn.number(s.soldCount || 0)}</div></article>
        <article class='stat-card'><div class='stat-top'><span class='stat-label'>Đã lưu trữ</span></div><div class='stat-value'>${S.fn.number(s.archivedCount || 0)}</div></article>
        <article class='stat-card'><div class='stat-top'><span class='stat-label'>Thời hạn bảo hành</span></div><div class='stat-value'>${p.warrantyMonths > 0 ? `${S.fn.number(p.warrantyMonths)} tháng` : 'Không BH'}</div></article>
      </div>
      ${p.serialTracked
        ? `<button type='button' class='btn btn-secondary' data-action='view-product-serials' data-id='${S.fn.esc(p.id)}'>Mở danh sách Serial / IMEI →</button>`
        : `<div class='modal-note'>Không bật quản lý Serial / IMEI riêng.</div>`}`;
    }
    return `${tabBar}<div data-product-detail-panel>${content}</div>`;
  }


  S.fn.renderProductDetailModal = function renderProductDetailModal() {
    const state = S.state.productDetailState;
    if (!state) return;
    const p = state.data?.product || S.fn.productById(state.productId);
    const title = p ? p.name : 'Chi tiết sản phẩm';
    const sub = p ? `${p.sku || ''} · ${p.category || 'Sản phẩm'}` : 'Thẻ kho & Tồn kho đa kho';
    const canEdit = S.fn.hasPerm('editProducts');
    const footer = `${p ? `<button class='btn btn-secondary' type='button' data-action='print-barcode-single' data-id='${S.fn.esc(p.id)}'>In tem</button>` : ''}${p && canEdit ? `<button class='btn btn-secondary' type='button' data-action='edit-product' data-id='${S.fn.esc(p.id)}'>Sửa sản phẩm</button>` : ''}<button class='btn btn-primary' type='button' data-action='close-modal'>Đóng</button>`;
    S.fn.showModal(title, sub, S.fn.renderProductDetailBody(state), footer, true);
  }


  S.fn.switchProductDetailTab = function switchProductDetailTab(tab) {
    if (!S.state.productDetailState) return;
    S.state.productDetailState.tab = tab || 'info';
    S.fn.renderProductDetailModal();
  }


  S.fn.openProductDetail = async function openProductDetail(productId, tab = 'info') {
    if (!productId || !S.state.store.id) return;
    const storeId = S.state.store.id;
    const state = { productId, tab: tab || 'info', loading: true, error: '', data: null };
    S.state.productDetailState = state;
    S.fn.renderProductDetailModal();
    const gen = S.state.modalGeneration;
    try {
      const res = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}/stock-card`);
      if (S.dom.modal.hidden || S.state.modalGeneration !== gen || S.state.store.id !== storeId || S.state.productDetailState !== state) return;
      state.loading = false;
      state.data = res;
      S.fn.renderProductDetailModal();
    } catch (error) {
      if (S.dom.modal.hidden || S.state.modalGeneration !== gen || S.state.store.id !== storeId || S.state.productDetailState !== state) return;
      state.loading = false;
      state.error = error.message || 'Chưa tải được thẻ kho sản phẩm.';
      S.fn.renderProductDetailModal();
    }
  }

})(window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {}, charts: {} });
