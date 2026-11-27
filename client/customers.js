(function (S) {
  'use strict';

  S.fn.loadCustomersPage = async function loadCustomersPage(query, offset) {
    if (!S.state.authSession || !S.state.store.id) return;
    if (!S.fn.hasPerm('manageCustomers')) {
      S.state.customerRequestNumber += 1;
      S.state.store.customers = [];
      S.state.customerTotal = 0;
      S.state.customerOffset = 0;
      S.state.customerNextOffset = null;
      S.state.customerListLoaded = true;
      return;
    }
    const requestNumber = ++S.state.customerRequestNumber;
    try {
      const activeTag = S.state.page === 'customers' ? S.state.customerTagFilter.trim() : '';
      const activeSegment = S.state.page === 'customers' ? S.state.customerSegmentFilter : '';
      const minSpent = S.state.page === 'customers' ? S.state.customerMinSpentVnd : '';
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customers?limit=100&offset=${Math.max(0, offset || 0)}&q=${encodeURIComponent(query || '')}${activeTag ? `&tag=${encodeURIComponent(activeTag)}` : ''}${activeSegment ? `&segment=${encodeURIComponent(activeSegment)}` : ''}${minSpent !== '' ? `&minSpentVnd=${encodeURIComponent(minSpent)}` : ''}`);
      if (requestNumber !== S.state.customerRequestNumber) return;
      S.state.store.customers = result.customers.map(S.fn.mapCustomer);
      S.state.customerTotal = result.total;
      S.state.customerOffset = offset || 0;
      S.state.customerNextOffset = result.nextOffset;
      S.state.customerListLoaded = true;
      if (S.state.page === 'customers' && S.state.customerSavedSegmentsStoreId !== S.state.store.id) S.fn.loadCustomerSavedSegments().then(function(){if(S.state.page==='customers'&&S.dom.modal.hidden&&!S.dom.root.contains(document.activeElement))S.fn.render();});
    } catch (error) {
      if (requestNumber !== S.state.customerRequestNumber) return;
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa tải được khách hàng', error.message, 'error');
    }
  }


  S.fn.loadCustomerSavedSegments = async function loadCustomerSavedSegments(force) {
    if (!S.state.authSession || !S.state.store.id || !S.fn.hasPerm('manageCustomers')) return;
    if (!force && S.state.customerSavedSegmentsStoreId === S.state.store.id) return;
    const requestedStoreId = S.state.store.id;
    S.state.customerSavedSegmentsStoreId = requestedStoreId;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(requestedStoreId)}/customer-segments`);
      if (requestedStoreId !== S.state.store.id) return;
      S.state.customerSavedSegments = Array.isArray(result.segments) ? result.segments : [];
    } catch (error) {
      if (requestedStoreId !== S.state.store.id) return;
      S.state.customerSavedSegmentsStoreId = '';
      S.state.customerSavedSegments = [];
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa tải được bộ lọc đã lưu', error.message, 'error');
    }
  }


  S.fn.selectedCustomerSavedSegment = function selectedCustomerSavedSegment() {
    return S.state.customerSavedSegments.find(function (segment) { return segment.id === S.state.selectedCustomerSavedSegmentId; }) || null;
  }


  S.fn.customerTypeBadgeLabel = function customerTypeBadgeLabel(type) {
    return ({ retail: 'Khách lẻ', wholesale: 'Khách sỉ', vip: 'Khách VIP', agency: 'Đại lý' })[type] || 'Khách lẻ';
  }


  S.fn.customerMobileCards = function customerMobileCards(customers) {
    return customers.map(function (customer) {
      const debtText = customer.debt ? `<strong class='stock-number low'>${S.fn.money(customer.debt)}</strong>` : customer.credit ? `<strong class='stock-number' style='color:#47835a'>Dư ${S.fn.money(customer.credit)}</strong>` : `<span class='muted'>0 đ</span>`;
      return `<article class='product-mobile-card'>
        <button type='button' class='product-mobile-main' data-action='customer-detail' data-id='${customer.id}'>
          <span class='avatar'>${S.fn.esc(S.fn.initials(customer.name))}</span>
          <div class='product-mobile-info'>
            <strong>${S.fn.esc(customer.name)}</strong>
            <small>${S.fn.esc(customer.phone || 'Chưa có SĐT')} · ${S.fn.number(customer.orders)} đơn · ${S.fn.money(customer.totalSpent)}</small>
          </div>
          <div class='product-mobile-side'>
            ${debtText}
            <small class='muted'>Công nợ</small>
          </div>
        </button>
      </article>`;
    }).join('');
  }

  S.fn.customerRows = function customerRows(customers) {
    return customers.map(function (customer) {
      const tags = (customer.tags || []).slice(0, 2).map(function (tag) { return `<span class='customer-tag-chip'>${S.fn.esc(tag.label)}</span>`; }).join('');
      const moreTags = customer.tags && customer.tags.length > 2 ? `<small class='customer-more-tags'>+${S.fn.number(customer.tags.length - 2)}</small>` : '';
      const overLimit = customer.creditLimitVnd !== '' && customer.debt > Number(customer.creditLimitVnd);
      const groupChip = customer.customerType && customer.customerType !== 'retail'
        ? `<span class='customer-tag-chip'>${S.fn.esc(S.fn.customerTypeBadgeLabel(customer.customerType))}${customer.discountRateBps > 0 ? ` −${S.fn.number(customer.discountRateBps / 100)}%` : ''}</span>`
        : '';
      const pointsNote = customer.loyaltyPoints > 0 ? ` · ${S.fn.number(customer.loyaltyPoints)} điểm` : '';
      const chipsHtml = (groupChip || tags || moreTags) ? `<span class='customer-row-tags'>${groupChip}${tags}${moreTags}</span>` : '';
      return `<tr><td><div class='customer-cell'><span class='avatar'>${S.fn.esc(S.fn.initials(customer.name))}</span><span class='product-name-stack'><strong>${S.fn.esc(customer.name)}</strong><small>${S.fn.esc(customer.phone || 'Chưa có SĐT')}${customer.customerCode ? ` · ${S.fn.esc(customer.customerCode)}` : ''}${pointsNote}</small>${chipsHtml}</span></div></td><td>${S.fn.number(customer.orders)} đơn</td><td class='text-right'>${S.fn.money(customer.totalSpent)}</td><td class='text-right'>${customer.debt ? `<span class='stock-number low'>${S.fn.money(customer.debt)}</span>${overLimit ? `<br><span class='badge badge-warning'>Vượt hạn mức</span>` : ''}` : customer.credit ? `<span class='stock-number' style='color:#47835a'>Dư ${S.fn.money(customer.credit)}</span>` : `<span class='muted'>—</span>`}</td><td class='text-right'><button class='row-action' data-action='customer-detail' data-id='${customer.id}'>›</button></td></tr>`;
    }).join('');
  }


  S.fn.renderCustomers = function renderCustomers() {
    const customers = S.state.store.customers;
    const canEdit = S.fn.hasPerm('manageCustomers');
    const canImport = S.fn.hasPerm('manageCustomers') && (S.fn.hasPerm('viewReports') || S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('manageSettings'));
    const canManageSegments = canImport;
    const hasCustomerFilters = Boolean(S.state.searchTerms.customers || S.state.customerTagFilter || S.state.customerSegmentFilter || S.state.customerMinSpentVnd);
    const hasSavedCriteria = Boolean(S.state.customerTagFilter.trim() || S.state.customerSegmentFilter || S.state.customerMinSpentVnd !== '');
    const filterToggleLabel = S.state.customerAdvancedOpen ? 'Ẩn bộ lọc' : hasSavedCriteria ? 'Lọc thêm · đang lọc' : 'Lọc thêm';
    const selectedSaved = S.fn.selectedCustomerSavedSegment();
    const segmentOptions = [
      ['', 'Tất cả khách hàng'],
      ['owing', 'Đang nợ tiền'],
      ['over_credit_limit', 'Vượt hạn mức nợ'],
      ['vip_tier', 'VIP Mua nhiều / Đại lý'],
      ['inactive30', 'Khách quen >30 ngày chưa ghé'],
      ['no_purchase', 'Chưa mua lần nào'],
      ['wholesale', 'Khách sỉ'],
      ['repeat', 'Mua lại (từ 2 đơn)'],
      ['birthday_month', 'Sinh nhật tháng này'],
      ['inactive90', '90 ngày chưa mua'],
    ].map(([value, label]) => `<option value='${value}' ${S.state.customerSegmentFilter === value ? 'selected' : ''}>${label}</option>`).join('');
    const savedSegmentOptions = [`<option value=''>Bộ lọc đã lưu…</option>`].concat(S.state.customerSavedSegments.map(function (segment) {
      return `<option value='${S.fn.esc(segment.id)}' ${S.state.selectedCustomerSavedSegmentId === segment.id ? 'selected' : ''}>${S.fn.esc(segment.name)}</option>`;
    })).join('');
    const owingCustomers = customers.filter(c => c.debt > 0);
    const totalDebtVisible = owingCustomers.reduce((sum, c) => sum + c.debt, 0);
    const kpiHtml = `<div class='stat-grid' style='margin-bottom:14px'>
      <article class='stat-card'><div class='stat-top'><span class='stat-label'>Tổng khách hàng</span><span class='stat-icon'>${S.fn.icon('users', 15)}</span></div><div class='stat-value'>${S.fn.number(S.state.customerTotal)}</div></article>
      <article class='stat-card'><div class='stat-top'><span class='stat-label'>Còn công nợ</span><span class='stat-icon'>${S.fn.icon('wallet', 15)}</span></div><div class='stat-value'>${S.fn.number(owingCustomers.length)}</div><small class='muted'>${S.fn.money(totalDebtVisible)}</small></article>
    </div>`;
    return S.fn.pageHeading('Khách hàng', '', (canEdit ? `<button class='btn btn-primary' data-action='new-customer'><span class='btn-icon'>＋</span> Thêm khách</button>` : '') + (S.fn.canExportData() ? `<button class='btn btn-secondary' data-action='export-customers'>Xuất Excel / CSV</button>` : '') + ((canImport || S.fn.canExportData()) ? `<details class='catalog-more'><summary class='btn btn-secondary'>Khác</summary><div>${canImport ? `<button class='btn btn-secondary' data-action='import-customers'>Nhập CSV</button>` : ''}${S.fn.canExportData() ? `<button class='btn btn-secondary' data-action='open-export'>Tùy chọn xuất CSV</button>` : ''}</div></details>` : '')) +
      kpiHtml +
      `<nav class='workspace-tabs' aria-label='Nhóm khách hàng'><button type='button' data-action='customer-quick-filter' data-segment='' ${!S.state.customerSegmentFilter ? `aria-current='page'` : ''}>Tất cả</button><button type='button' data-action='customer-quick-filter' data-segment='owing' ${S.state.customerSegmentFilter === 'owing' ? `aria-current='page'` : ''}>Đang nợ tiền</button><button type='button' data-action='customer-quick-filter' data-segment='vip_tier' ${S.state.customerSegmentFilter === 'vip_tier' ? `aria-current='page'` : ''}>VIP Mua nhiều</button><button type='button' data-action='customer-quick-filter' data-segment='inactive30' ${S.state.customerSegmentFilter === 'inactive30' ? `aria-current='page'` : ''}>>30 ngày chưa ghé</button><button type='button' data-action='customer-quick-filter' data-segment='no_purchase' ${S.state.customerSegmentFilter === 'no_purchase' ? `aria-current='page'` : ''}>Chưa mua lần nào</button></nav><div class='customer-main-search'><div class='search-wrap'><span class='search-symbol'>⌕</span><input class='input' id='customer-search' type='search' placeholder='Tìm tên, SĐT hoặc mã KH…' value='${S.fn.esc(S.state.searchTerms.customers)}' aria-label='Tìm khách hàng'></div></div><button class='customer-more-filters' type='button' data-action='toggle-customer-filters' aria-controls='customer-advanced' aria-expanded='${S.state.customerAdvancedOpen}'>${S.fn.esc(filterToggleLabel)}</button><div id='customer-advanced' class='customer-advanced' ${S.state.customerAdvancedOpen ? '' : 'hidden'}><div class='customer-saved-tools'><label class='customer-saved-select-wrap'><span>Bộ lọc đã lưu</span><select class='input' id='customer-saved-segment-select' aria-label='Chọn bộ lọc khách hàng đã lưu'>${savedSegmentOptions}</select></label>${canManageSegments ? `<button class='btn btn-secondary' data-action='save-customer-segment' ${hasSavedCriteria ? '' : 'disabled'}>${selectedSaved ? 'Cập nhật' : 'Lưu bộ lọc'}</button>${selectedSaved ? `<button class='btn btn-secondary' data-action='delete-customer-segment' data-id='${S.fn.esc(selectedSaved.id)}'>Xóa</button>` : ''}` : ''}</div><div class='toolbar'><div class='toolbar-left customer-filters'><input class='input customer-tag-filter' id='customer-tag-filter' type='search' maxlength='32' placeholder='Theo nhãn…' value='${S.fn.esc(S.state.customerTagFilter)}' aria-label='Lọc khách hàng theo nhãn'/><select class='input customer-segment-filter' id='customer-segment-filter' aria-label='Phân khúc khách hàng'>${segmentOptions}</select><label class='customer-spend-filter'><span>Chi tiêu từ (đ)</span><input class='input customer-min-spent' id='customer-min-spent' type='number' min='0' max='9223372036854775807' step='1' inputmode='numeric' placeholder='Không giới hạn' value='${S.fn.esc(S.state.customerMinSpentVnd)}' aria-describedby='customer-spend-error'/><small id='customer-spend-error' class='customer-spend-error' hidden></small></label></div></div></div><section class='panel'><div class='table-wrap desktop-only-table'><table class='data-table'><thead><tr><th>Khách hàng</th><th>Đơn</th><th class='text-right'>Chi tiêu</th><th class='text-right'>Công nợ</th><th></th></tr></thead><tbody>${S.fn.customerRows(customers) || `<tr><td colspan='5'><div class='empty-state'><strong>${hasCustomerFilters ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng'}</strong><span>${hasCustomerFilters ? 'Thử từ khóa hoặc bộ lọc khác.' : 'Bấm “＋ Thêm khách” để bắt đầu.'}</span></div></td></tr>`}</tbody></table></div><div class='mobile-only-cards'>${S.fn.customerMobileCards(customers) || `<div class='empty-state'><strong>${hasCustomerFilters ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng'}</strong><span>${hasCustomerFilters ? 'Thử từ khóa hoặc bộ lọc khác.' : 'Bấm “＋ Thêm khách” để bắt đầu.'}</span></div>`}</div><div class='pagination'><span>Hiển thị ${customers.length} / ${S.fn.number(S.state.customerTotal)}</span><span class='pagination-actions'>${S.state.customerOffset > 0 ? `<button class='page-button' data-action='customers-page' data-offset='${Math.max(0, S.state.customerOffset - 100)}'>‹</button>` : ''}<span class='page-button current'>${Math.floor(S.state.customerOffset / 100) + 1}</span>${S.state.customerNextOffset !== null ? `<button class='page-button' data-action='customers-page' data-offset='${S.state.customerNextOffset}'>›</button>` : ''}</span></div></section>`;
  }


  S.fn.parseCustomerImportCsv = function parseCustomerImportCsv(text) {
    let parsed;
    try { parsed = S.fn.parseCsvDocument(text); }
    catch (error) { return { items: [], errors: [error.message] }; }
    const rows = parsed.filter(function (record, index) { return index === 0 || record.cells.some(function (cell) { return String(cell || '').trim() !== ''; }); });
    if (!rows.length) return { items: [], errors: ['Tệp CSV đang trống.'] };
    const headers = rows[0].cells.map(function (cell) { return String(cell || '').trim(); });
    if (headers.length !== S.state.customerImportHeaders.length || S.state.customerImportHeaders.some(function (header, index) { return headers[index] !== header; })) {
      return { items: [], errors: ['Tiêu đề cột không đúng mẫu Slink. Hãy tải mẫu CSV rồi điền dữ liệu vào.'] };
    }
    const dataRows = rows.slice(1);
    const errors = [];
    if (!dataRows.length) errors.push('Tệp chưa có dòng khách hàng nào.');
    if (dataRows.length > 200) errors.push('Mỗi lần nhập tối đa 200 khách hàng. Hãy chia tệp thành nhiều phần.');
    const seenPhones = new Map();
    const seenEmails = new Map();
    const items = [];
    dataRows.slice(0, 200).forEach(function (record) {
      const line = record.line;
      const cells = record.cells;
      const rowErrors = [];
      if (cells.length !== S.state.customerImportHeaders.length) rowErrors.push(`Dòng ${line}: số cột không khớp mẫu.`);
      const values = S.state.customerImportHeaders.map(function (_header, index) { return String(cells[index] || '').trim(); });
      const name = values[0];
      const phone = values[1];
      const email = values[2];
      const openingBalanceVnd = values[3] || '0';
      const note = values[4];
      if (!name || name.length > 160) rowErrors.push(`Dòng ${line}: tên khách hàng cần có từ 1 đến 160 ký tự.`);
      const normalizedPhone = phone.replace(/\D/g, '');
      if (phone && (normalizedPhone.length < 7 || normalizedPhone.length > 15)) rowErrors.push(`Dòng ${line}: số điện thoại cần có từ 7 đến 15 chữ số.`);
      if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) rowErrors.push(`Dòng ${line}: email không hợp lệ.`);
      if (!/^(0|[1-9]\d{0,18})$/.test(openingBalanceVnd)) rowErrors.push(`Dòng ${line}: công nợ ban đầu phải là VND nguyên không âm, không dùng dấu phân cách.`);
      else if (BigInt(openingBalanceVnd) > 9223372036854775807n) rowErrors.push(`Dòng ${line}: công nợ ban đầu vượt giới hạn lưu trữ.`);
      if (note.length > 1000) rowErrors.push(`Dòng ${line}: ghi chú tối đa 1.000 ký tự.`);
      if (normalizedPhone) {
        if (seenPhones.has(normalizedPhone)) rowErrors.push(`Dòng ${line}: số điện thoại trùng với dòng ${seenPhones.get(normalizedPhone)} trong tệp.`);
        else seenPhones.set(normalizedPhone, line);
      }
      const normalizedEmail = email.toLocaleLowerCase('vi-VN');
      if (normalizedEmail) {
        if (seenEmails.has(normalizedEmail)) rowErrors.push(`Dòng ${line}: email trùng với dòng ${seenEmails.get(normalizedEmail)} trong tệp.`);
        else seenEmails.set(normalizedEmail, line);
      }
      if (rowErrors.length) errors.push(...rowErrors);
      else items.push({ sourceLine: line, name, phone, email, openingBalanceVnd, note });
    });
    return { items: errors.length ? [] : items, errors: errors };
  }


  S.fn.renderCustomerImportPreview = function renderCustomerImportPreview() {
    const preview = S.dom.modal.querySelector('#customer-import-preview');
    if (!preview) return;
    const submit = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = S.state.customerImportReading || S.state.customerImportErrors.length > 0 || !S.state.customerImportRows.length || !S.state.customerImportPreviewValid;
    if (S.state.customerImportReading) {
      preview.innerHTML = `<div class='install-hint' role='status' aria-live='polite'>Đang đọc tệp và kiểm tra trùng lặp với cửa hàng…</div>`;
      return;
    }
    if (S.state.customerImportErrors.length) {
      preview.innerHTML = `<div class='auth-message error' role='alert'>${S.state.customerImportErrors.map(S.fn.esc).join('<br>')}</div>`;
      return;
    }
    if (S.state.customerImportConflict) {
      preview.innerHTML = `<div class='auth-message error' role='alert'>${S.fn.esc(S.state.customerImportConflict)}</div>`;
      return;
    }
    if (!S.state.customerImportRows.length) {
      preview.innerHTML = `<div class='muted'>Chọn mẫu CSV đã điền để xem trước. Chưa có dữ liệu nào được lưu.</div>`;
      return;
    }
    const balanceTotal = S.state.customerImportRows.reduce(function (sum, row) { return sum + BigInt(row.openingBalanceVnd || '0'); }, 0n).toString();
    S.state.customerImportBalanceTotalVnd = balanceTotal;
    const checkMessage = S.state.customerImportPreviewValid
      ? `<div class='notice-item'><span>${S.fn.icon('check', 18)}</span><span><strong>${S.fn.number(S.state.customerImportRows.length)} khách hàng sẵn sàng</strong><small>Chưa có thay đổi nào được ghi. Khi xác nhận, hồ sơ và công nợ mở đầu được lưu nguyên tử; tổng công nợ mở đầu ${S.fn.moneyVndText(balanceTotal)}.</small></span></div>`
      : `<div class='install-hint'>Đang kiểm tra trùng lặp với cửa hàng…</div>`;
    const table = `<div class='table-wrap'><table class='data-table'><thead><tr><th>Dòng</th><th>Khách hàng</th><th>Email</th><th class='text-right'>Công nợ ban đầu</th></tr></thead><tbody>${S.state.customerImportRows.map(function (row) { return `<tr><td>${S.fn.number(row.sourceLine)}</td><td><span class='product-name-stack'><strong>${S.fn.esc(row.name)}</strong><small>${S.fn.esc(row.phone || 'Không có điện thoại')}</small></span></td><td>${S.fn.esc(row.email || '—')}</td><td class='text-right'>${S.fn.moneyVndText(row.openingBalanceVnd || '0')}</td></tr>`; }).join('')}</tbody></table></div>`;
    preview.innerHTML = checkMessage + table;
  }


  S.fn.previewCustomerImport = async function previewCustomerImport(items, generation, readNumber) {
    S.state.customerImportReading = true;
    S.state.customerImportRows = items;
    S.state.customerImportErrors = [];
    S.state.customerImportConflict = '';
    S.state.customerImportPreviewValid = false;
    S.fn.renderCustomerImportPreview();
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customers/import/preview`, {
        method: 'POST', body: { items: items },
      });
      if (generation !== S.state.modalGeneration || readNumber !== S.state.customerImportReadNumber || S.dom.modal.hidden) return;
      S.state.customerImportReading = false;
      S.state.customerImportPreviewValid = result.valid === true && result.count === items.length;
      if (!S.state.customerImportPreviewValid) S.state.customerImportConflict = result.conflict || 'Máy chủ chưa xác nhận đầy đủ bản xem trước.';
      S.state.customerImportBalanceTotalVnd = String(result.openingBalanceTotalVnd || '0');
    } catch (error) {
      if (generation !== S.state.modalGeneration || readNumber !== S.state.customerImportReadNumber || S.dom.modal.hidden) return;
      S.state.customerImportReading = false;
      S.state.customerImportConflict = error.status === 401
        ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi chọn tệp để kiểm tra.'
        : `Chưa đối chiếu được với cửa hàng: ${error.message} Chưa có thay đổi nào được lưu.`;
    }
    S.fn.renderCustomerImportPreview();
  }


  S.fn.openCustomerImport = function openCustomerImport() {
    const pending = S.fn.loadPendingCustomerImport();
    S.state.customerImportReadNumber += 1;
    S.state.customerImportReading = false;
    S.state.customerImportRows = pending ? pending.payload.items : [];
    S.state.customerImportErrors = [];
    S.state.customerImportConflict = '';
    S.state.customerImportPreviewValid = false;
    const body = `<form id='entity-form' data-form='customer-import'><div class='form-field full'><label class='input-label' for='customer-import-file'>Chọn tệp khách hàng CSV</label><input class='input' id='customer-import-file' type='file' accept='.csv,text/csv' ${pending ? 'disabled' : ''}/></div><button class='link-button' type='button' data-action='download-customer-import-template'>Tải mẫu CSV</button><div id='customer-import-preview' class='product-import-preview' aria-live='polite'></div></form>`;
    const footer = `<button class='btn btn-secondary' type='button' data-action='close-modal'>${pending ? 'Để sau' : 'Đóng'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Gửi lại lần nhập đang chờ' : 'Nhập khách hàng'}</button>`;
    S.fn.showModal(pending ? 'Kiểm tra lần nhập khách hàng đang chờ' : 'Nhập khách hàng từ CSV', pending ? 'Gửi lại đúng nội dung đã lưu trên thiết bị để máy chủ xác nhận, tránh tạo trùng.' : 'Xem lại mọi dòng và công nợ trước khi ghi dữ liệu cửa hàng.', body, footer, true);
    S.fn.renderCustomerImportPreview();
    if (pending) S.fn.previewCustomerImport(pending.payload.items, S.state.modalGeneration, S.state.customerImportReadNumber);
  }


  S.fn.downloadCustomerImportTemplate = function downloadCustomerImportTemplate() {
    const csv = '\uFEFF' + S.state.customerImportHeaders.map(function (header) { return '"' + header.replace(/"/g, '""') + '"'; }).join(',') + '\r\n';
    S.fn.download('slink-mau-nhap-khach-hang.csv', csv, 'text/csv;charset=utf-8');
  }


  S.fn.openCustomer = function openCustomer(id, { debt = false } = {}) {
    const c = id ? S.fn.customerById(id) : null;
    const pending = !c ? S.fn.loadPendingCustomer() : null;
    const saved = pending ? pending.payload : c;
    const disabled = pending ? 'disabled' : '';
    const canSetOpeningBalance = S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports');
    const discPercent = saved && saved.discountRateBps ? Number(saved.discountRateBps) / 100 : (saved?.discountPercent ?? 0);
    const hasExtra = Boolean(saved && (saved.customerCode || discPercent > 0 || saved.creditLimitVnd || saved.birthday || saved.gender || saved.companyName || saved.taxCode || saved.email || Number(saved.bonusPoints || 0) !== 0));
    const openingField = !c && canSetOpeningBalance ? `<div class='form-field'><label class='input-label' for='customer-opening-balance'>Nợ ban đầu (đ)</label><input class='input' id='customer-opening-balance' name='openingBalanceVnd' type='number' inputmode='numeric' min='0' step='1' value='${S.fn.esc(saved ? saved.openingBalanceVnd : '')}' placeholder='0' ${disabled}/></div>` : '';
    const form = `<form id='entity-form' data-form='customer' data-id='${c ? S.fn.esc(c.id) : ''}' data-version='${c ? S.fn.esc(c.version) : ''}'><div class='form-grid'>
      <div class='form-field'><label class='input-label'>Tên khách hàng *</label><input class='input' name='name' value='${S.fn.esc(saved ? saved.name : '')}' required maxlength='160' placeholder='Họ và tên' ${disabled}/></div>
      <div class='form-field'><label class='input-label'>Số điện thoại</label><input class='input' name='phone' value='${S.fn.esc(saved ? saved.phone : '')}' inputmode='tel' placeholder='09xx xxx xxx' ${disabled}/></div>
      <div class='form-field'><label class='input-label'>Nhóm khách</label><select class='input' name='customerType' ${disabled}>${[['retail', 'Khách lẻ'], ['wholesale', 'Khách sỉ'], ['vip', 'Khách VIP'], ['agency', 'Đại lý']].map(([value, label]) => `<option value='${value}' ${(!saved && value === 'retail') || saved?.customerType === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      ${openingField}
      <div class='form-field full'><label class='input-label'>Địa chỉ</label><input class='input' name='shippingAddress' value='${S.fn.esc(saved ? saved.shippingAddress || '' : '')}' maxlength='500' placeholder='Số nhà, đường, quận/huyện…' ${disabled}/></div>
      <div class='form-field full'><label class='input-label'>Ghi chú</label><input class='input' name='note' value='${S.fn.esc(saved ? saved.note || '' : '')}' maxlength='500' placeholder='Lưu ý khi bán hoặc giao hàng' ${disabled}/></div>
    </div>
    <details class='customer-extra-fields' style='margin-top:12px' ${hasExtra ? 'open' : ''}>
      <summary style='cursor:pointer;font-weight:600;color:var(--muted)'>Thông tin mở rộng (mã KH, ưu đãi, hạn mức, hóa đơn)</summary>
      <div class='form-grid' style='margin-top:10px'>
        <div class='form-field'><label class='input-label'>Mã khách hàng</label><input class='input' name='customerCode' value='${S.fn.esc(saved ? saved.customerCode || '' : '')}' maxlength='40' placeholder='Tự tạo nếu để trống' ${disabled}/></div>
        <div class='form-field'><label class='input-label'>Chiết khấu (%)</label><input class='input' name='discountPercent' type='number' min='0' max='100' step='0.1' value='${S.fn.esc(discPercent)}' ${disabled}/></div>
        <div class='form-field'><label class='input-label'>Hạn mức nợ (đ)</label><input class='input' name='creditLimitVnd' type='number' min='0' step='1' inputmode='numeric' value='${S.fn.esc(saved ? saved.creditLimitVnd ?? '' : '')}' placeholder='Không giới hạn' ${disabled}/></div>
        <div class='form-field'><label class='input-label'>Điểm thưởng cộng thêm</label><input class='input' name='bonusPoints' type='number' step='1' value='${S.fn.esc(saved ? saved.bonusPoints ?? 0 : 0)}' ${disabled}/></div>
        <div class='form-field'><label class='input-label'>Ngày sinh</label><input class='input' name='birthday' type='date' value='${S.fn.esc(saved ? saved.birthday || '' : '')}' ${disabled}/></div>
        <div class='form-field'><label class='input-label'>Giới tính</label><select class='input' name='gender' ${disabled}><option value=''>—</option><option value='female' ${saved?.gender === 'female' ? 'selected' : ''}>Nữ</option><option value='male' ${saved?.gender === 'male' ? 'selected' : ''}>Nam</option><option value='other' ${saved?.gender === 'other' ? 'selected' : ''}>Khác</option></select></div>
        <div class='form-field'><label class='input-label'>Email</label><input class='input' type='email' name='email' value='${S.fn.esc(saved ? saved.email : '')}' placeholder='email@example.com' ${disabled}/></div>
        <div class='form-field'><label class='input-label'>Công ty</label><input class='input' name='companyName' value='${S.fn.esc(saved ? saved.companyName || '' : '')}' maxlength='160' placeholder='Tên đơn vị' ${disabled}/></div>
        <div class='form-field'><label class='input-label'>Mã số thuế</label><input class='input' name='taxCode' value='${S.fn.esc(saved ? saved.taxCode || '' : '')}' maxlength='40' placeholder='MST' ${disabled}/></div>
      </div>
    </details></form>`;
    S.fn.modalForm(pending ? 'Kiểm tra khách đang chờ' : c ? 'Cập nhật khách hàng' : debt ? 'Thêm khách nợ' : 'Thêm khách hàng', '', form, pending ? 'Gửi lại' : c ? 'Lưu thay đổi' : 'Lưu khách hàng');
  }


  S.fn.customerFilterCriteria = function customerFilterCriteria() {
    return { segment: S.state.customerSegmentFilter || '', tag: S.state.customerTagFilter.trim(), minSpentVnd: S.state.customerMinSpentVnd || '' };
  }


  S.fn.openSaveCustomerSegment = function openSaveCustomerSegment() {
    if (!S.fn.hasPerm('manageCustomers') || (!S.fn.hasPerm('viewReports') && !S.fn.hasPerm('recordCashbook'))) return S.fn.toast('Không đủ quyền', 'Chỉ tài khoản có quyền báo cáo hoặc sổ quỹ được lưu bộ lọc.', 'error');
    const criteria = S.fn.customerFilterCriteria();
    if (!criteria.segment && !criteria.tag && criteria.minSpentVnd === '') return S.fn.toast('Chưa có điều kiện lọc', 'Chọn ít nhất một phân khúc, nhãn hoặc mức chi tiêu trước khi lưu.', 'error');
    const selected = S.fn.selectedCustomerSavedSegment();
    const form = `<form id='entity-form' data-form='customer-saved-segment' data-id='${selected ? S.fn.esc(selected.id) : ''}' data-version='${selected ? selected.version : ''}' data-idempotency-key='${S.fn.newIdempotencyKey()}'><div class='form-field'><label class='input-label' for='customer-saved-segment-name'>Tên bộ lọc *</label><input class='input' id='customer-saved-segment-name' name='name' value='${S.fn.esc(selected ? selected.name : '')}' required minlength='1' maxlength='48' autocomplete='off' placeholder='Ví dụ: Khách còn công nợ'/><small>Dùng chung trong cửa hàng; mỗi cửa hàng lưu tối đa 50 bộ lọc.</small></div><div class='notice-item customer-saved-summary'><span>⌕</span><span><strong>Điều kiện sẽ được lưu</strong><small>${criteria.segment ? S.fn.esc({ no_purchase: 'Chưa từng mua', repeat: 'Mua lại · từ 2 đơn', owing: 'Còn công nợ', inactive90: '90 ngày chưa mua' }[criteria.segment]) : ''}${criteria.tag ? `${criteria.segment ? ' · ' : ''}Nhãn: ${S.fn.esc(criteria.tag)}` : ''}${criteria.minSpentVnd !== '' ? `${criteria.segment || criteria.tag ? ' · ' : ''}Chi tiêu từ ${S.fn.moneyVndText(criteria.minSpentVnd)}` : ''}</small></span></div></form>`;
    S.fn.modalForm(selected ? 'Cập nhật bộ lọc khách hàng' : 'Lưu bộ lọc khách hàng', 'Các điều kiện được tính từ hồ sơ và giao dịch trong cửa hàng. Bộ lọc không lưu tên tìm kiếm.', form, selected ? 'Cập nhật bộ lọc' : 'Lưu bộ lọc');
  }


  S.fn.openDeleteCustomerSegment = function openDeleteCustomerSegment(id) {
    const segment = S.state.customerSavedSegments.find(function (item) { return item.id === id; });
    if (!segment) return S.fn.toast('Không tìm thấy bộ lọc', 'Tải lại danh sách bộ lọc rồi thử lại.', 'error');
    const form = `<form id='entity-form' data-form='customer-saved-segment-delete' data-id='${S.fn.esc(segment.id)}' data-version='${segment.version}' data-idempotency-key='${S.fn.newIdempotencyKey()}'><p>Bộ lọc <strong>${S.fn.esc(segment.name)}</strong> sẽ bị xóa khỏi danh sách của cửa hàng. Hồ sơ khách hàng và giao dịch không bị thay đổi.</p></form>`;
    S.fn.showModal('Xóa bộ lọc đã lưu?', 'Bạn có thể tạo lại bộ lọc này sau.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Giữ lại</button><button class='btn btn-primary' type='submit' form='entity-form'>Xóa bộ lọc</button>`);
  }


  S.fn.saveCustomerSegment = async function saveCustomerSegment(form) {
    const name = String(new FormData(form).get('name') || '').trim();
    const criteria = S.fn.customerFilterCriteria();
    if (!criteria.segment && !criteria.tag && criteria.minSpentVnd === '') return S.fn.toast('Chưa có điều kiện lọc', 'Chọn ít nhất một điều kiện trước khi lưu.', 'error');
    const id = form.dataset.id || '';
    const payload = { name, criteria };
    if (id) payload.version = Number(form.dataset.version);
    const key = form.dataset.idempotencyKey || S.fn.newIdempotencyKey();
    form.dataset.idempotencyKey = key;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customer-segments${id ? `/${encodeURIComponent(id)}` : ''}`, {
        method: id ? 'PUT' : 'POST', headers: { 'idempotency-key': key }, body: payload,
      });
      const saved = result.segment;
      S.state.customerSavedSegments = S.state.customerSavedSegments.filter(function (item) { return item.id !== saved.id; }).concat(saved).sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); });
      S.state.customerSavedSegmentsStoreId = S.state.store.id;
      S.state.selectedCustomerSavedSegmentId = saved.id;
      S.fn.closeModal();
      await S.fn.loadCustomersPage(S.state.searchTerms.customers, 0);
      S.fn.emitSyncDomains(['customers', 'debts', 'dashboard'], { source: 'customer-import' });
      if (S.state.page === 'customers') S.fn.render();
      S.fn.toast(id ? 'Đã cập nhật bộ lọc' : 'Đã lưu bộ lọc', saved.name);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa lưu được bộ lọc', error.message, 'error');
    }
  }


  S.fn.deleteCustomerSegment = async function deleteCustomerSegment(form) {
    const id = form.dataset.id;
    const key = form.dataset.idempotencyKey || S.fn.newIdempotencyKey();
    form.dataset.idempotencyKey = key;
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customer-segments/${encodeURIComponent(id)}/delete`, {
        method: 'POST', headers: { 'idempotency-key': key }, body: { version: Number(form.dataset.version) },
      });
      S.state.customerSavedSegments = S.state.customerSavedSegments.filter(function (item) { return item.id !== id; });
      S.state.customerSavedSegmentsStoreId = S.state.store.id;
      if (S.state.selectedCustomerSavedSegmentId === id) S.state.selectedCustomerSavedSegmentId = '';
      S.fn.closeModal();
      await S.fn.loadCustomersPage(S.state.searchTerms.customers, 0);
      S.fn.emitSyncDomains(['customers', 'debts', 'dashboard'], { source: 'customer-import' });
      if (S.state.page === 'customers') S.fn.render();
      S.fn.toast('Đã xóa bộ lọc', 'Hồ sơ và dữ liệu bán hàng vẫn được giữ nguyên.');
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa xóa được bộ lọc', error.message, 'error');
    }
  }


  S.fn.openSupplier = function openSupplier() {
    const pending = S.fn.loadPendingSupplier();
    const saved = pending ? pending.payload : null;
    const disabled = pending ? 'disabled' : '';
    const canSetOpeningBalance = S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports');
    const openingBalanceField = canSetOpeningBalance
      ? `<div class='form-field full'><label class='input-label' for='supplier-opening-payable'>Nợ đầu kỳ (VND)</label><input class='input' id='supplier-opening-payable' name='openingPayableVnd' type='number' inputmode='numeric' min='0' step='1' value='${S.fn.esc(saved ? saved.openingPayableVnd : '0')}' ${disabled}/><small>Số còn nợ trước khi dùng Slink (nếu có).</small></div>`
      : `<input type='hidden' name='openingPayableVnd' value='0'/><div class='form-field full'><small>Khoản phải trả ban đầu do chủ cửa hàng, quản lý hoặc kế toán ghi nhận.</small></div>`;
    const form = `<form id='entity-form' data-form='supplier'><div class='form-grid'><div class='form-field full'><label class='input-label' for='supplier-name'>Tên nhà cung cấp *</label><input class='input' id='supplier-name' name='name' value='${S.fn.esc(saved ? saved.name : '')}' required maxlength='160' placeholder='Tên doanh nghiệp hoặc người bán' ${disabled}/></div>${openingBalanceField}</div></form>`;
    S.fn.modalForm(pending ? 'Kiểm tra nhà cung cấp đang chờ' : 'Thêm nhà cung cấp', pending ? 'Gửi lại đúng nội dung đã lưu để máy chủ xác nhận, tránh ghi nợ hai lần.' : 'Tạo hồ sơ và ghi sổ phải trả ban đầu nếu có.', form, pending ? 'Gửi lại nhà cung cấp' : 'Lưu nhà cung cấp');
  }


  S.fn.openCustomerDetail = async function openCustomerDetail(id) {
    if (!id) return;
    const requestNumber = ++S.state.customerDetailRequestNumber;
    S.fn.showModal('Hồ sơ khách hàng', 'Đang tải thông tin và lịch sử mua hàng…', `<div class='empty-state'><strong>Đang tải hồ sơ</strong></div>`, `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button>`, true);
    const currentModalGeneration = S.state.modalGeneration;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customers/${encodeURIComponent(id)}`);
      if (requestNumber !== S.state.customerDetailRequestNumber || currentModalGeneration !== S.state.modalGeneration || S.dom.modal.hidden) return;
      const c = S.fn.mapCustomer(result.customer);
      const balance = BigInt(c.balanceVnd);
      const orders = result.recentOrders || [];
      const payments = result.recentPayments || [];
      const orderRows = orders.map(function (row) {
        const order = S.fn.mapOrder(row);
        return `<tr><td><button class='link-button order-ref' data-action='order-detail' data-id='${order.id}'>${S.fn.esc(order.number)}</button></td><td>${S.fn.humanDate(order.createdAt)}</td><td class='text-right'>${S.fn.money(order.total)}</td><td>${S.fn.statusBadge(order.status)}</td></tr>`;
      }).join('');
      const paymentMethodLabels = { cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', bank_qr: 'QR ngân hàng', card: 'Thẻ', other: 'Khác' };
      const paymentRows = payments.map(function (payment) {
        const allocations = Array.isArray(payment.allocations) ? payment.allocations : [];
        const allocationLabels = allocations.map(function (allocation) {
          return `${S.fn.esc(allocation.orderNumber || 'Đơn hàng')} · ${S.fn.moneyVndText(allocation.amountVnd || '0')}`;
        });
        if (BigInt(payment.opening_balance_amount_vnd || '0') > 0n) {
          allocationLabels.push(`Công nợ đầu kỳ · ${S.fn.moneyVndText(payment.opening_balance_amount_vnd)}`);
        }
        return `<tr><td>${S.fn.humanDate(payment.occurred_at, true)}</td><td><strong>${S.fn.moneyVndText(payment.amount_vnd)}</strong></td><td>${S.fn.esc(paymentMethodLabels[payment.method] || payment.method || '')}</td><td>${allocationLabels.join('<br>') || 'Không có chi tiết phân bổ'}</td><td>${S.fn.esc(payment.note || '')}</td></tr>`;
      }).join('');
      const canManageTags = S.fn.hasPerm('manageCustomers');
      const canCollectDebt = S.fn.hasPerm('manageCustomers') && (S.fn.hasPerm('posSell') || S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports'));
      const pendingTag = S.fn.loadPendingCustomerTag(c.id);
      const tagChips = (Array.isArray(result.customer.tags) ? result.customer.tags : []).map(function (tag) {
        return `<span class='customer-tag-chip'>${S.fn.esc(tag.label)}${canManageTags ? `<button type='button' data-action='customer-tag-remove' data-id='${S.fn.esc(c.id)}' data-tag='${S.fn.esc(tag.label)}' aria-label='Gỡ nhãn ${S.fn.esc(tag.label)}' ${pendingTag ? 'disabled' : ''}>×</button>` : ''}</span>`;
      }).join('');
      const tagPendingHint = pendingTag && canManageTags
        ? `<div class='install-hint customer-tag-pending' role='status'>Nhãn đang chờ máy chủ xác nhận. Gửi lại đúng thao tác đã lưu trên thiết bị.<button class='btn btn-secondary' type='button' data-action='retry-customer-tag' data-id='${S.fn.esc(c.id)}'>Thử lại thao tác</button></div>`
        : '';
      const customerTags = `<section class='panel customer-tags-panel'><div class='panel-header'><div><h2>Nhãn</h2></div></div>${tagPendingHint}<div class='customer-tag-list'>${tagChips || `<span class='muted'>Chưa gắn nhãn</span>`}</div>${canManageTags ? `<form class='customer-tag-form' data-form='customer-tag' data-id='${S.fn.esc(c.id)}'><div><input class='input' id='customer-tag-input' name='tag' maxlength='32' placeholder='Thêm nhãn (VD: VIP, Mua sỉ)…' required ${pendingTag ? 'disabled' : ''}/><button class='btn btn-secondary' type='submit' ${pendingTag ? 'disabled' : ''}>Gắn</button></div></form>` : ''}</section>`;
      const overLimit = c.creditLimitVnd !== '' && c.debt > Number(c.creditLimitVnd);
      const genderLabel = ({ female: 'Nữ', male: 'Nam', other: 'Khác' })[c.gender] || '';
      const metaCells = [
        `<div><small class='muted'>Nhóm khách</small><div><strong>${S.fn.esc(S.fn.customerTypeBadgeLabel(c.customerType))}</strong>${c.discountRateBps > 0 ? ` · CK −${S.fn.number(c.discountRateBps / 100)}%` : ''}</div></div>`,
        c.creditLimitVnd !== '' ? `<div><small class='muted'>Hạn mức nợ</small><div><strong>${S.fn.moneyVndText(c.creditLimitVnd)}</strong>${overLimit ? ` <span class='badge badge-warning'>Vượt hạn mức</span>` : ''}</div></div>` : '',
        (c.birthday || genderLabel) ? `<div><small class='muted'>Sinh nhật / Giới tính</small><div>${S.fn.esc([c.birthday, genderLabel].filter(Boolean).join(' · '))}</div></div>` : '',
        (c.companyName || c.taxCode) ? `<div style='grid-column:1 / -1'><small class='muted'>Xuất hóa đơn</small><div><strong>${S.fn.esc(c.companyName || '—')}</strong>${c.taxCode ? ` · MST: <code>${S.fn.esc(c.taxCode)}</code>` : ''}</div></div>` : '',
        c.shippingAddress ? `<div style='grid-column:1 / -1'><small class='muted'>Địa chỉ</small><div>${S.fn.esc(c.shippingAddress)}</div></div>` : '',
        c.note ? `<div style='grid-column:1 / -1'><small class='muted'>Ghi chú</small><div>${S.fn.esc(c.note)}</div></div>` : '',
      ].filter(Boolean).join('');
      const loyaltyInfo = result.loyalty || {};
      const pointHistory = Array.isArray(result.pointHistory) ? result.pointHistory : [];
      const pointRows = pointHistory.map(function (entry) {
        const delta = Number(entry.points_delta || 0);
        const sign = delta > 0 ? `+${S.fn.number(delta)}` : `${S.fn.number(delta)}`;
        const cls = delta > 0 ? 'badge badge-success' : 'badge badge-warning';
        return `<tr><td>${S.fn.humanDate(entry.created_at, true)}</td><td><span class='${cls}'>${sign} điểm</span></td><td>${S.fn.esc(entry.note || entry.entry_type || '')}</td></tr>`;
      }).join('');
      const loyaltyHistoryHtml = `<section class='panel' style='margin-top:17px'><div class='panel-header'><div><h2>Lịch sử tích &amp; đổi điểm (${S.fn.number(loyaltyInfo.pointsBalance ?? c.loyaltyPoints)} điểm)</h2>${Number(loyaltyInfo.maxRedeemVnd || 0) > 0 ? `<small class='muted'>Giá trị quy đổi hiện tại: ${S.fn.moneyVndText(loyaltyInfo.maxRedeemVnd)}</small>` : ''}</div></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Thời gian</th><th>Điểm</th><th>Nội dung</th></tr></thead><tbody>${pointRows || `<tr><td colspan='3'><div class='empty-state'><strong>Chưa có giao dịch tích điểm</strong></div></td></tr>`}</tbody></table></div></section>`;
      const crmMetaHtml = metaCells ? `<div class='form-grid' style='margin-top:12px;padding-top:12px;border-top:1px solid var(--line);font-size:13px'>${metaCells}</div>` : '';
      const body = `<section class='panel'><div class='customer-header'><span class='avatar'>${S.fn.esc(S.fn.initials(c.name))}</span><div><h2>${S.fn.esc(c.name)}</h2><p>${S.fn.esc([c.phone || 'Chưa có SĐT', c.customerCode, c.email].filter(Boolean).join(' · '))}</p></div>${c.loyaltyPoints > 0 ? `<span class='badge badge-success' style='margin-left:auto'>${S.fn.number(c.loyaltyPoints)} điểm</span>` : ''}</div><div class='customer-stats'><div class='customer-stat'><small>Tổng chi tiêu</small><strong>${S.fn.money(c.totalSpent)}</strong></div><div class='customer-stat'><small>Đơn hàng</small><strong>${S.fn.number(c.orders)}</strong></div><div class='customer-stat'><small>${balance < 0n ? 'Khách dư' : 'Còn nợ'}</small><strong>${S.fn.moneyVndText(balance < 0n ? -balance : balance)}</strong></div></div>${crmMetaHtml}</section>${customerTags}${loyaltyHistoryHtml}<section style='margin-top:17px'><div class='panel-header' style='padding:0 0 10px'><div><h2>Đơn hàng gần đây</h2></div></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Mã đơn</th><th>Ngày</th><th class='text-right'>Tổng tiền</th><th>Trạng thái</th></tr></thead><tbody>${orderRows || `<tr><td colspan='4'><div class='empty-state'><strong>Chưa có đơn hàng</strong></div></td></tr>`}</tbody></table></div></section><section class='panel customer-payment-history' style='margin-top:17px'><div class='panel-header'><div><h2>Lịch sử thu nợ</h2></div></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Thời gian</th><th>Số tiền</th><th>Phương thức</th><th>Phân bổ</th><th>Ghi chú</th></tr></thead><tbody>${paymentRows || `<tr><td colspan='5'><div class='empty-state'><strong>Chưa có khoản thu nào</strong></div></td></tr>`}</tbody></table></div></section>`;
      S.fn.showModal('Hồ sơ khách hàng', '', body, `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button>${canManageTags ? `<button class='btn btn-secondary' data-action='edit-customer' data-id='${S.fn.esc(c.id)}'>${S.fn.icon('edit', 14)} Sửa</button>` : ''}${Number(c.debt) > 0 && canCollectDebt ? `<button class='btn btn-secondary' data-action='finance-reminder' data-id='${S.fn.esc(c.id)}'>Nhắc nợ QR</button>` : ''}${canCollectDebt ? `<button class='btn btn-primary' data-action='collect-customer-payment' data-id='${S.fn.esc(c.id)}'>${Number(c.debt) > 0 ? 'Thu tiền nợ' : 'Nhận trả trước'}</button>` : ''}`, true);
    } catch (error) {
      if (requestNumber !== S.state.customerDetailRequestNumber || currentModalGeneration !== S.state.modalGeneration || S.dom.modal.hidden) return;
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      S.fn.showModal('Chưa tải được hồ sơ', error.message, `<div class='auth-message error'>Tải lại hồ sơ khách hàng rồi thử lại.</div>`, `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button>`, true);
    }
  }


  S.fn.sendPendingCustomerTag = async function sendPendingCustomerTag(customerId) {
    const pending = S.fn.loadPendingCustomerTag(customerId);
    if (!pending) return S.fn.toast('Không có thao tác đang chờ', 'Nhập lại nhãn khách hàng để tạo yêu cầu mới.', 'error');
    S.dom.modal.querySelectorAll('.customer-tag-form input,.customer-tag-form button,.customer-tag-chip button').forEach(function (control) { control.disabled = true; });
    const retry = S.dom.modal.querySelector('[data-action="retry-customer-tag"]');
    if (retry) retry.disabled = true;
    const requestGeneration = S.state.modalGeneration;
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customers/${encodeURIComponent(customerId)}/tags`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      S.fn.clearPendingCustomerTag(customerId);
      S.fn.emitSyncDomains(['customers'], { source: 'customer-tag' });
      S.fn.toast(pending.payload.operation === 'add' ? 'Đã gắn nhãn khách hàng' : 'Đã gỡ nhãn khách hàng');
      const refreshList = S.state.page === 'customers'
        ? S.fn.loadCustomersPage(S.state.searchTerms.customers, S.state.customerOffset)
        : Promise.resolve();
      await Promise.all([S.fn.openCustomerDetail(customerId), refreshList]);
      if (S.state.page === 'customers') S.fn.render();
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingCustomerTag(customerId);
      }
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra nhãn khách hàng đang chờ.', 'error');
      else S.fn.toast('Chưa cập nhật được nhãn khách hàng', error.message, 'error');
      if (requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden) await S.fn.openCustomerDetail(customerId);
    }
  }


  S.fn.changeCustomerTag = function changeCustomerTag(customerId, operation, tag) {
    const existing = S.fn.loadPendingCustomerTag(customerId);
    if (existing) return S.fn.sendPendingCustomerTag(customerId);
    const normalized = String(tag || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!normalized || Array.from(normalized).length > 32) return S.fn.toast('Nhãn chưa hợp lệ', 'Nhãn cần từ 1 đến 32 ký tự.', 'error');
    const pending = { customerId, key: S.fn.newIdempotencyKey(), payload: { operation, tag: normalized } };
    if (!S.fn.savePendingCustomerTag(pending)) return S.fn.pendingSaveFailed();
    return S.fn.sendPendingCustomerTag(customerId);
  }


  S.fn.pickCustomer = async function pickCustomer() {
    if (!S.state.customerListLoaded) {
      S.fn.showModal('Chọn khách hàng', 'Đang lấy danh sách khách hàng…', `<div class='empty-state' role='status'>Đang tải…</div>`, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button>`, true);
      await S.fn.loadPosCustomers('');
      if (S.dom.modal.hidden) return;
      if (!S.state.customerListLoaded) {
        S.fn.showModal('Chưa tải được khách hàng', 'Kiểm tra kết nối rồi thử lại, hoặc tiếp tục bán cho khách lẻ.', `<div class='empty-state' role='status'>Danh sách chưa tải được.</div>`, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-primary' type='button' data-action='pick-customer'>Thử lại</button>`, true);
        return;
      }
    }
    const body = `<div class='search-wrap'><span class='search-symbol'>⌕</span><input id='pick-customer-search' class='input' type='search' placeholder='Tìm tên hoặc điện thoại…'/></div><div id='customer-options' class='customer-picker'>${S.state.store.customers.map(function (c) { return `<button class='customer-option' data-action='select-customer' data-id='${S.fn.esc(c.id)}' data-name='${S.fn.esc(c.name)}' data-phone='${S.fn.esc(c.phone)}' data-discount-bps='${Number(c.discountRateBps) || 0}' data-address='${S.fn.esc(c.shippingAddress || '')}'><span class='avatar' style='width:26px;height:26px'>${S.fn.esc(S.fn.initials(c.name))}</span><span>${S.fn.esc(c.name)}${c.discountRateBps > 0 ? ` <small class='badge badge-info'>-${S.fn.number(c.discountRateBps / 100)}%</small>` : ''}</span><small>${S.fn.esc(c.phone)}</small></button>`; }).join('')}</div><button class='btn btn-secondary' style='margin-top:13px;width:100%' data-action='new-customer-from-pos'>＋ Tạo khách hàng mới</button>`;
    S.fn.showModal('Chọn khách hàng', 'Gắn đơn hàng với hồ sơ khách hàng.', body, `<button class='btn btn-secondary' data-action='select-customer' data-id=''>Bán cho khách lẻ</button>`, true);
  }


  S.fn.saveCustomerImport = async function saveCustomerImport(form) {
    let pending = S.fn.loadPendingCustomerImport();
    if (!pending) {
      if (S.state.customerImportErrors.length || S.state.customerImportConflict || !S.state.customerImportRows.length || !S.state.customerImportPreviewValid) {
        return S.fn.toast('Chưa thể nhập khách hàng', 'Chọn CSV hợp lệ, kiểm tra trùng lặp và xem lại toàn bộ bản xem trước.', 'error');
      }
      pending = { key: S.fn.newIdempotencyKey(), payload: { items: S.state.customerImportRows } };
    }
    if (!S.fn.savePendingCustomerImport(pending)) return S.fn.pendingSaveFailed();
    const requestGeneration = S.state.modalGeneration;
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    const fileInput = S.dom.modal.querySelector('#customer-import-file');
    if (submitButton) submitButton.disabled = true;
    if (fileInput) fileInput.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customers/import`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      S.fn.clearPendingCustomerImport();
      if (requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden) {
        S.fn.closeModal();
        S.state.customerImportRows = [];
        S.state.customerImportErrors = [];
        S.state.customerImportConflict = '';
        S.state.customerImportPreviewValid = false;
      }
      await S.fn.loadCustomersPage(S.state.searchTerms.customers, 0);
      S.fn.emitSyncDomains(['customers', 'debts', 'dashboard'], { source: 'customer-import' });
      if (S.state.page === 'customers') S.fn.render();
      S.fn.toast('Đã nhập khách hàng', `${S.fn.number(Number(result.count))} hồ sơ · công nợ mở đầu ${S.fn.moneyVndText(result.openingBalanceTotalVnd || '0')}.`);
    } catch (error) {
      if (error.status === 401) S.fn.toast('Phiên đăng nhập đã hết hạn', 'Đăng nhập lại rồi mở lần nhập đang chờ để kiểm tra kết quả.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingCustomerImport();
        S.state.customerImportPreviewValid = false;
        S.state.customerImportConflict = `Máy chủ chưa nhập dòng nào: ${error.message} Chọn tệp đã sửa để kiểm tra lại.`;
        if (fileInput && fileInput.isConnected) fileInput.disabled = false;
        S.fn.renderCustomerImportPreview();
      }
      S.fn.toast('Chưa nhập được khách hàng', error.message, 'error');
      if (submitButton && requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden && submitButton.isConnected && !S.state.customerImportPreviewValid) submitButton.disabled = true;
      else if (submitButton && requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden && submitButton.isConnected) submitButton.disabled = false;
    }
  }


  S.fn.saveCustomer = async function saveCustomer(form) {
    const data = new FormData(form); const id = form.dataset.id; const old = id ? S.fn.customerById(id) : null;
    const discPct = Number(data.get('discountPercent') || 0);
    const discountRateBps = Number.isFinite(discPct) && discPct >= 0 && discPct <= 100 ? Math.round(discPct * 100) : 0;
    const bonusPoints = Math.round(Number(data.get('bonusPoints') || 0)) || 0;
    let payload = {
      customerCode: String(data.get('customerCode') || '').trim() || null,
      name: String(data.get('name') || '').trim(),
      phone: String(data.get('phone') || '').trim(),
      email: String(data.get('email') || '').trim(),
      note: String(data.get('note') || '').trim(),
      shippingAddress: String(data.get('shippingAddress') || '').trim(),
      customerType: String(data.get('customerType') || 'retail'),
      creditLimitVnd: String(data.get('creditLimitVnd') || '').trim() || null,
      birthday: String(data.get('birthday') || '').trim() || null,
      gender: String(data.get('gender') || '').trim() || null,
      companyName: String(data.get('companyName') || '').trim(),
      taxCode: String(data.get('taxCode') || '').trim(),
      discountRateBps,
      bonusPoints,
    };
    let pending = null;
    if (old) payload.version = Number(form.dataset.version);
    else {
      pending = S.fn.loadPendingCustomer();
      if (!pending) {
        const openingBalanceText = String(data.get('openingBalanceVnd') || '0').trim() || '0';
        const openingBalance = Number(openingBalanceText);
        if (!/^\d+$/.test(openingBalanceText) || !Number.isSafeInteger(openingBalance) || openingBalance < 0) return S.fn.toast('Công nợ ban đầu không hợp lệ', 'Nhập số VND nguyên không âm.', 'error');
        payload.openingBalanceVnd = String(openingBalance);
        pending = { storeId: S.state.store.id, key: S.fn.newIdempotencyKey(), payload: payload };
      }
      payload = pending.payload;
      if (!S.fn.savePendingCustomer(pending)) return S.fn.pendingSaveFailed();
      form.querySelectorAll('input,textarea').forEach(function (field) { field.disabled = true; });
    }
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customers${old ? `/${encodeURIComponent(old.id)}` : ''}`, {
        method: old ? 'PUT' : 'POST', headers: pending ? { 'idempotency-key': pending.key } : {}, body: payload,
      });
      if (pending) S.fn.clearPendingCustomer();
      const rawCustomer = old ? {
        balance_vnd: old.balanceVnd,
        total_spent_vnd: old.totalSpent,
        order_count: old.orders,
        tags: old.tags,
        ...result.customer,
      } : result.customer;
      const customer = S.fn.mapCustomer(rawCustomer);
      if (old) Object.assign(old, customer); else S.state.store.customers.unshift(customer);
      S.fn.closeModal();
      S.fn.emitSyncDomains(['customers', 'debts'], { source: 'customer-save' });
      S.fn.toast(old ? 'Đã cập nhật khách hàng' : 'Đã thêm khách hàng', `${customer.name}${!old && Number(payload.openingBalanceVnd) > 0 ? ` · công nợ ban đầu ${S.fn.money(Number(payload.openingBalanceVnd))}` : ''}`);
      if (S.state.page === 'pos') S.state.cartCustomerId = customer.id;
      if (S.state.page === 'finance') return await S.fn.loadFinancePage();
      if (S.state.page === 'pos') await S.fn.loadPosCustomers('');
      else await S.fn.loadCustomersPage(S.state.searchTerms.customers, S.state.customerOffset);
      if (S.state.page === 'pos' && !S.state.store.customers.some(function (row) { return row.id === customer.id; })) S.state.store.customers.unshift(customer);
      S.fn.render();
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra khách hàng đang chờ.', 'error');
      else if (pending && error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingCustomer();
        form.querySelectorAll('input,textarea').forEach(function (field) { field.disabled = false; });
      }
      S.fn.toast('Chưa lưu được khách hàng', error.message, 'error');
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }


  S.fn.saveSupplier = async function saveSupplier(form) {
    let pending = S.fn.loadPendingSupplier();
    if (!pending) {
      const data = new FormData(form);
      const name = String(data.get('name') || '').trim();
      const amountText = String(data.get('openingPayableVnd') || '0').trim() || '0';
      const openingPayableVnd = Number(amountText);
      if (!name || name.length > 160) return S.fn.toast('Tên nhà cung cấp không hợp lệ', 'Tên cần từ 1 đến 160 ký tự.', 'error');
      if (!/^\d+$/.test(amountText) || !Number.isSafeInteger(openingPayableVnd) || openingPayableVnd < 0) return S.fn.toast('Khoản phải trả ban đầu không hợp lệ', 'Nhập số VND nguyên không âm.', 'error');
      pending = { storeId: S.state.store.id, key: S.fn.newIdempotencyKey(), payload: { name: name, openingPayableVnd: String(openingPayableVnd) } };
    }
    if (!S.fn.savePendingSupplier(pending)) return S.fn.pendingSaveFailed();
    form.querySelectorAll('input').forEach(function (field) { field.disabled = true; });
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/suppliers`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      S.fn.clearPendingSupplier();
      S.fn.closeModal();
      S.fn.emitSyncDomains(['suppliers', 'cashbook'], { source: 'supplier-save' });
      await S.fn.loadFinancePage();
      S.fn.render();
      S.fn.toast(result.supplier.created ? 'Đã thêm nhà cung cấp' : 'Đã cập nhật công nợ nhà cung cấp', `${result.supplier.name}${Number(pending.payload.openingPayableVnd) > 0 ? ` · phải trả ${S.fn.money(Number(result.supplier.balance_vnd))}` : ''}`);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra nhà cung cấp đang chờ.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingSupplier();
        form.querySelectorAll('input').forEach(function (field) { field.disabled = false; });
      }
      S.fn.toast('Chưa lưu được nhà cung cấp', error.message, 'error');
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }


  S.fn.loadSuppliersPage = async function loadSuppliersPage() {
    if (!S.state.authSession || !S.state.store.id) return;
    await S.fn.loadFinancePage();
    if (S.state.page === 'suppliers') S.fn.render();
  }


  S.fn.renderSuppliers = function renderSuppliers() {
    if (!S.fn.canAccessRoute('suppliers')) {
      return `<section class='panel locked-page'><div class='empty-icon'>${S.fn.icon('shop', 23)}</div><h2>Không có quyền xem nhà cung cấp</h2><p>Chỉ chủ cửa hàng, quản lý, kho hoặc kế toán được xem danh sách nhà cung cấp.</p></section>`;
    }
    const query = String(S.state.searchTerms.suppliers || '').trim().toLocaleLowerCase('vi');
    const suppliers = (S.state.store.suppliers || []).filter(function (s) {
      return !query || String(s.name || '').toLocaleLowerCase('vi').includes(query);
    });
    const canManage = S.fn.hasPerm('manageInventory') || S.fn.hasPerm('recordCashbook');
    const canPay = S.fn.hasPerm('recordCashbook');
    const canViewFinance = S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports');
    const totalPayable = suppliers.reduce(function (sum, s) {
      const bal = Number(s.balance_vnd || 0);
      return bal > 0 ? sum + bal : sum;
    }, 0);
    const owingCount = suppliers.filter(function (s) { return Number(s.balance_vnd || 0) > 0; }).length;
    const rows = suppliers.map(function (s) {
      const bal = Number(s.balance_vnd || 0);
      const balHtml = canViewFinance
        ? `<strong style='color:${bal > 0 ? 'var(--warning)' : 'var(--ink)'}'>${S.fn.moneyVndText(s.balance_vnd || '0')}</strong>`
        : `<span class='muted'>—</span>`;
      return `<tr>
        <td><strong>${S.fn.esc(s.name)}</strong>${s.last_activity_at ? `<div class='muted' style='font-size:11.5px'>GD gần nhất: ${S.fn.humanDate(s.last_activity_at, true)}</div>` : ''}</td>
        <td class='text-right'>${balHtml}</td>
        <td class='text-right'>
          ${canViewFinance ? `<button class='btn btn-secondary' type='button' data-action='supplier-balance' data-id='${S.fn.esc(s.id)}' style='min-height:32px;padding:4px 10px'>Sổ công nợ</button>` : ''}
          ${canPay && bal > 0 ? `<button class='btn btn-primary' type='button' data-action='supplier-payment' data-id='${S.fn.esc(s.id)}' style='min-height:32px;padding:4px 10px'>Trả nợ</button>` : ''}
        </td>
      </tr>`;
    }).join('');
    const mobileCards = suppliers.map(function (s) {
      const bal = Number(s.balance_vnd || 0);
      const balText = canViewFinance ? S.fn.moneyVndText(s.balance_vnd || '0') : '—';
      return `<article class='product-mobile-card'>
        <div class='product-mobile-info'>
          <strong>${S.fn.esc(s.name)}</strong>
          ${s.last_activity_at ? `<small class='muted'>${S.fn.humanDate(s.last_activity_at, true)}</small>` : ''}
        </div>
        <div class='product-mobile-side'>
          <strong style='color:${bal > 0 ? 'var(--warning)' : 'var(--ink)'}'>${balText}</strong>
          <div style='display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end'>
            ${canViewFinance ? `<button class='btn btn-secondary' type='button' data-action='supplier-balance' data-id='${S.fn.esc(s.id)}' style='min-height:32px;padding:4px 10px;font-size:12px'>Sổ nợ</button>` : ''}
            ${canPay && bal > 0 ? `<button class='btn btn-primary' type='button' data-action='supplier-payment' data-id='${S.fn.esc(s.id)}' style='min-height:32px;padding:4px 10px;font-size:12px'>Trả nợ</button>` : ''}
          </div>
        </div>
      </article>`;
    }).join('');
    const headingActions = `${canManage ? `<button class='btn btn-primary' type='button' data-action='new-supplier'>＋ Thêm NCC</button><button class='btn btn-secondary desktop-only-btn' type='button' data-action='receive-stock'>Nhập hàng</button>` : ''}`;
    return S.fn.pageHeading('Nhà cung cấp', '', headingActions) +
      (canViewFinance ? `<div class='stat-grid' style='margin-bottom:16px'><article class='stat-card'><div class='stat-top'><span class='stat-label'>Tổng NCC</span></div><div class='stat-value'>${S.fn.number(suppliers.length)}</div></article><article class='stat-card'><div class='stat-top'><span class='stat-label'>NCC đang nợ</span></div><div class='stat-value'>${S.fn.number(owingCount)}</div></article><article class='stat-card'><div class='stat-top'><span class='stat-label'>Tổng phải trả</span></div><div class='stat-value' style='color:var(--warning)'>${S.fn.money(totalPayable)}</div></article></div>` : '') +
      `<div class='toolbar'><div class='toolbar-left'><div class='search-wrap'><span class='search-symbol'>⌕</span><input class='input' id='supplier-search' type='search' placeholder='Tìm tên nhà cung cấp…' value='${S.fn.esc(S.state.searchTerms.suppliers || '')}' aria-label='Tìm nhà cung cấp'></div><span class='result-count'>${S.fn.number(suppliers.length)} NCC</span></div></div>` +
      `<section class='panel desktop-only-table'><div class='table-wrap'><table class='data-table'><thead><tr><th>Nhà cung cấp</th><th class='text-right'>Công nợ phải trả</th><th class='text-right'>Thao tác</th></tr></thead><tbody>${rows || `<tr><td colspan='3'><div class='empty-state'><strong>${S.state.financeLoading ? 'Đang tải…' : 'Chưa có nhà cung cấp'}</strong></div></td></tr>`}</tbody></table></div></section>` +
      `<div class='mobile-only-cards'>${mobileCards || `<section class='panel empty-state'><strong>${S.state.financeLoading ? 'Đang tải…' : 'Chưa có nhà cung cấp'}</strong></section>`}</div>`;
  }

})(window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {}, charts: {} });
