(function (S) {
  'use strict';

  S.fn.loadChannelCatalog = async function loadChannelCatalog(offset) {
    if (!S.state.authSession || !S.state.store.id || !S.fn.canAccessRoute('channels')) return;
    const requestedStoreId = S.state.store.id;
    const requestNumber = ++S.state.channelState.requestNumber;
    S.state.channelState.offset = Math.max(0, Number(offset) || 0);
    S.state.channelState.loading = true;
    S.state.channelState.error = '';
    if (S.state.page === 'channels') S.fn.render();
    const params = new URLSearchParams({ limit: '50', offset: String(S.state.channelState.offset), state: S.state.channelState.state });
    if (S.state.channelState.query) params.set('q', S.state.channelState.query);
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/channel-catalog?${params}`);
      if (requestNumber !== S.state.channelState.requestNumber || S.state.store.id !== requestedStoreId) return;
      S.state.channelState.profiles = Array.isArray(result.profiles) ? result.profiles : [];
      S.state.channelState.mappings = Array.isArray(result.mappings) ? result.mappings : [];
      S.state.channelState.total = Number(result.total) || 0;
      S.state.channelState.nextOffset = result.nextOffset;
      S.state.channelState.loading = false;
    } catch (error) {
      if (requestNumber !== S.state.channelState.requestNumber) return;
      S.state.channelState.loading = false;
      S.state.channelState.error = error.message;
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    }
    if (S.state.page === 'channels') S.fn.render();
  }


  S.fn.loadChannelOrders = async function loadChannelOrders(offset) {
    if (!S.state.authSession || !S.state.store.id || !S.fn.canAccessRoute('channels')) return;
    const requestedStoreId = S.state.store.id;
    const requestNumber = ++S.state.channelState.orderRequestNumber;
    S.state.channelState.orderOffset = Math.max(0, Number(offset) || 0);
    S.state.channelState.orderLoading = true;
    S.state.channelState.orderError = '';
    if (S.state.page === 'channels') S.fn.render();
    const params = new URLSearchParams({ limit: '50', offset: String(S.state.channelState.orderOffset) });
    if (S.state.channelState.orderStatus) params.set('status', S.state.channelState.orderStatus);
    if (S.state.channelState.orderQuery) params.set('q', S.state.channelState.orderQuery);
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/channel-orders?${params}`);
      if (requestNumber !== S.state.channelState.orderRequestNumber || S.state.store.id !== requestedStoreId) return;
      S.state.channelState.orders = Array.isArray(result.orders) ? result.orders : [];
      S.state.channelState.orderTotal = Number(result.total) || 0;
      S.state.channelState.orderNextOffset = result.nextOffset;
      S.state.channelState.orderLoading = false;
    } catch (error) {
      if (requestNumber !== S.state.channelState.orderRequestNumber) return;
      S.state.channelState.orderLoading = false;
      S.state.channelState.orderError = error.message;
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    }
    if (S.state.page === 'channels') S.fn.render();
  }


  S.fn.channelOrderActions = function channelOrderActions(order) {
    const actions = [];
    if (order.fulfillmentStatus === 'reserved') actions.push(`<button class='link-button' data-action='channel-order-status' data-id='${S.fn.esc(order.id)}' data-status='packed'>Đóng gói</button>`);
    if (order.fulfillmentStatus === 'packed') actions.push(`<button class='link-button' data-action='channel-order-status' data-id='${S.fn.esc(order.id)}' data-status='shipped'>Đã gửi</button>`);
    if (order.fulfillmentStatus === 'shipped') actions.push(`<button class='link-button' data-action='channel-order-status' data-id='${S.fn.esc(order.id)}' data-status='delivered'>Đã giao</button>`);
    if (['reserved', 'packed'].includes(order.fulfillmentStatus)) actions.push(`<button class='link-button danger-text' data-action='channel-order-status' data-id='${S.fn.esc(order.id)}' data-status='cancelled'>Hủy</button>`);
    return actions.join('');
  }


  S.fn.renderChannelOrders = function renderChannelOrders() {
    const statuses = [['', 'Tất cả trạng thái'], ...Object.entries(S.state.channelOrderStatusNames)];
    const rows = S.state.channelState.orders.map(function (order) {
      return `<article class='channel-order-row'><div class='channel-order-primary'><strong>${S.fn.esc(order.externalOrderRef)}</strong><small>${S.fn.esc(S.state.channelNames[order.channelCode] || 'Kênh khác')} · ${S.fn.esc(order.shopLabel)} · ${S.fn.humanDate(order.createdAt, true)}</small></div><div class='channel-order-meta'><span class='badge ${order.fulfillmentStatus === 'delivered' ? 'badge-success' : order.fulfillmentStatus === 'cancelled' ? 'badge-neutral' : 'badge-info'}'>${S.fn.esc(S.state.channelOrderStatusNames[order.fulfillmentStatus] || order.fulfillmentStatus)}</span><small>${S.fn.esc(S.state.channelPaymentNames[order.paymentStatusSnapshot] || 'Chưa rõ')} · ${S.fn.number(order.lineCount)} dòng</small></div><div class='channel-order-meta'><strong>${S.fn.moneyVndText(order.totalVnd)}</strong><small>${S.fn.esc(order.warehouseName || 'Kho giao')}</small></div><div class='channel-order-actions'><button class='link-button' data-action='channel-order-detail' data-id='${S.fn.esc(order.id)}'>Chi tiết</button>${S.fn.channelOrderActions(order)}</div></article>`;
    }).join('');
    return `<section class='panel channel-orders-panel'><div class='panel-header'><div><h2>Đơn được ghi nhận thủ công</h2><p>Ghi mã đơn từ gian hàng, giữ tồn tại kho rồi cập nhật đóng gói và giao hàng.</p></div><button class='btn btn-primary' data-action='new-channel-order' ${S.state.channelState.profiles.some((item) => item.status === 'active') ? '' : 'disabled title="Thêm gian hàng trước"'}>${S.fn.icon('plus', 15)} Ghi nhận đơn</button></div>
      <div class='channel-toolbar'><form data-form='channel-order-filter' class='channel-filter-form'><label class='search-wrap' for='channel-order-search'>${S.fn.icon('search', 16)}<input class='input' id='channel-order-search' name='q' type='search' maxlength='120' value='${S.fn.esc(S.state.channelState.orderQuery)}' placeholder='Tìm mã đơn, tên hoặc điện thoại'/></label><label class='select-wrap'><select class='input' name='status' aria-label='Lọc trạng thái đơn'>${statuses.map((entry) => `<option value='${S.fn.esc(entry[0])}' ${S.state.channelState.orderStatus === entry[0] ? 'selected' : ''}>${S.fn.esc(entry[1])}</option>`).join('')}</select></label><button class='btn btn-secondary' type='submit'>Lọc</button></form></div>
      ${S.state.channelState.orderError ? `<div class='auth-message error' role='alert'>${S.fn.esc(S.state.channelState.orderError)} <button class='link-button' data-action='reload-channel-orders'>Tải lại</button></div>` : ''}
      <div class='channel-order-list'>${rows || `<div class='empty-state'><strong>${S.state.channelState.orderLoading ? 'Đang tải đơn kênh bán…' : 'Chưa có đơn hàng nào'}</strong></div>`}</div>
      <div class='pagination'><span>${S.fn.number(S.state.channelState.orderTotal)} đơn</span><span class='pagination-actions'>${S.state.channelState.orderOffset > 0 ? `<button class='page-button' data-action='channel-order-page' data-offset='${Math.max(0, S.state.channelState.orderOffset - 50)}' aria-label='Trang trước'>‹</button>` : ''}<span class='page-button current'>${Math.floor(S.state.channelState.orderOffset / 50) + 1}</span>${S.state.channelState.orderNextOffset !== null ? `<button class='page-button' data-action='channel-order-page' data-offset='${S.state.channelState.orderNextOffset}' aria-label='Trang sau'>›</button>` : ''}</span></div></section>`;
  }


  S.fn.loadChannelOrderCatalog = async function loadChannelOrderCatalog(profileId, query) {
    const form = S.dom.modal.querySelector('[data-form="channel-order-create"]');
    if (!form || !profileId) return;
    const requestNumber = ++S.state.channelOrderCatalogRequest;
    const previous = Array.from(form.querySelectorAll('[data-channel-order-mapping]')).map((select) => select.value);
    form.querySelectorAll('[data-channel-order-mapping]').forEach((select) => { select.innerHTML = `<option value=''>Đang tải SKU…</option>`; });
    try {
      const params = new URLSearchParams({ profileId, limit: '100' });
      if (query) params.set('q', query);
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/channel-order-catalog?${params}`);
      if (requestNumber !== S.state.channelOrderCatalogRequest || S.dom.modal.hidden) return;
      S.state.channelOrderMappingOptions = Array.isArray(result.mappings) ? result.mappings : [];
      const note = document.getElementById('channel-order-catalog-note');
      if (note) note.textContent = result.nextOffset !== null ? 'Có nhiều SKU phù hợp; nhập từ khóa để thu hẹp danh sách.' : `${S.fn.number(S.state.channelOrderMappingOptions.length)} SKU đã ánh xạ và theo dõi tồn.`;
      form.querySelectorAll('[data-channel-order-mapping]').forEach((select, index) => {
        const selected = previous[index] || '';
        select.innerHTML = `<option value=''>Chọn SKU trên kênh</option>` + S.state.channelOrderMappingOptions.map((item) => `<option value='${S.fn.esc(item.mappingId)}' data-price='${S.fn.esc(item.suggestedUnitPriceVnd)}' data-label='${S.fn.esc(item.productName)}'>${S.fn.esc(item.externalSku)} · ${S.fn.esc(item.productName)} (${S.fn.esc(item.sku)})</option>`).join('');
        select.value = S.state.channelOrderMappingOptions.some((item) => item.mappingId === selected) ? selected : (S.state.channelOrderMappingOptions[0]?.mappingId || '');
        const price = select.closest('[data-channel-order-line]')?.querySelector('[data-channel-order-price]');
        if (price && !price.value) price.value = select.selectedOptions[0]?.dataset.price || '0';
      });
      S.fn.updateChannelOrderTotal(form);
    } catch (error) {
      if (requestNumber !== S.state.channelOrderCatalogRequest || S.dom.modal.hidden) return;
      form.querySelectorAll('[data-channel-order-mapping]').forEach((select) => { select.innerHTML = `<option value=''>Chưa tải được SKU</option>`; });
      const note = document.getElementById('channel-order-catalog-note');
      if (note) note.textContent = error.message;
    }
  }


  S.fn.channelOrderLineRow = function channelOrderLineRow(index) {
    const options = S.state.channelOrderMappingOptions.map((item) => `<option value='${S.fn.esc(item.mappingId)}' data-price='${S.fn.esc(item.suggestedUnitPriceVnd)}' data-label='${S.fn.esc(item.productName)}'>${S.fn.esc(item.externalSku)} · ${S.fn.esc(item.productName)} (${S.fn.esc(item.sku)})</option>`).join('');
    const firstPrice = S.state.channelOrderMappingOptions[0]?.suggestedUnitPriceVnd || '0';
    return `<div class='channel-order-line' data-channel-order-line><label class='form-field'><span class='input-label'>SKU trên kênh</span><select class='input' data-channel-order-mapping required><option value=''>${options ? 'Chọn SKU' : 'Đang tải SKU…'}</option>${options}</select></label><label class='form-field'><span class='input-label'>Số lượng</span><input class='input' data-channel-order-quantity inputmode='decimal' value='1' required pattern='^(0|[1-9]\\d{0,9})(?:[.,]\\d{1,3})?$' aria-label='Số lượng dòng ${index + 1}'/></label><label class='form-field'><span class='input-label'>Đơn giá kênh (VND)</span><input class='input' data-channel-order-price inputmode='numeric' value='${S.fn.esc(firstPrice)}' required pattern='^(0|[1-9]\\d{0,18})$' aria-label='Đơn giá dòng ${index + 1}'/></label><button class='row-action' type='button' data-action='remove-channel-order-line' aria-label='Xóa dòng ${index + 1}'>×</button></div>`;
  }


  S.fn.openChannelOrderModal = async function openChannelOrderModal() {
    const profiles = S.state.channelState.profiles.filter((item) => item.status === 'active');
    if (!profiles.length) return S.fn.toast('Chưa có gian hàng', 'Hãy khai báo gian hàng trước khi ghi nhận đơn.', 'error');
    const profileOptions = profiles.map((profile) => `<option value='${S.fn.esc(profile.id)}'>${S.fn.esc(S.fn.channelProfileLabel(profile))}</option>`).join('');
    S.fn.showModal('Ghi nhận đơn từ kênh', 'Nhập đơn đã thấy trên gian hàng. Việc này không kết nối hoặc đồng bộ với sàn.', `<form id='entity-form' data-form='channel-order-create' data-idempotency-key='${S.fn.newIdempotencyKey()}'><div class='form-grid'><label class='form-field'><span class='input-label'>Gian hàng *</span><select class='input' id='channel-order-profile-id' name='channelProfileId' required>${profileOptions}</select></label><label class='form-field'><span class='input-label'>Kho giao *</span><select class='input' id='channel-order-warehouse-id' name='warehouseId' required><option value=''>Đang tải kho…</option></select></label><div class='form-field full channel-order-ref-field'><label class='input-label' for='channel-order-external-ref'>Mã đơn trên kênh *</label><input class='input' id='channel-order-external-ref' name='externalOrderRef' required maxlength='120' autocomplete='off' placeholder='Ví dụ: 240801ABCDEF'/><button class='btn btn-secondary' type='button' data-action='scan-channel-order'>Quét mã đơn</button><div class='scan-camera-panel channel-order-scan-panel' data-scan-surface data-scan-mode='order' data-scan-target='channel-order-external-ref' hidden><ol class='scan-steps'><li>Đưa mã đơn vào giữa khung camera, nơi đủ sáng.</li><li>Chọn Cho phép nếu điện thoại hỏi quyền camera.</li><li>Nếu sau 10 giây chưa đọc được, Slink chụp ảnh để bạn xem và tự nhập mã.</li></ol><video id='scan-camera-video' class='scan-camera-video' playsinline muted hidden aria-label='Khung camera để quét mã đơn'></video><img id='scan-photo-preview' class='scan-photo-preview' alt='Ảnh mã đơn chụp để xem lại' hidden/><button class='btn btn-secondary' type='button' data-action='start-camera-scan'>Mở camera để quét</button><p id='scan-camera-status' class='scan-camera-status' role='status' aria-live='polite'>Mã đơn sẽ điền vào ô phía trên. Hãy kiểm tra lại và nhập các thông tin còn lại trước khi lưu.</p><small class='scan-privacy-note'>Ảnh chỉ hiện tạm thời trên thiết bị này. Slink chưa đọc chữ trong ảnh và không lưu ảnh vào đơn. Bạn có thể nhập hoặc dán mã nếu chỉ có một điện thoại.</small></div></div><label class='form-field'><span class='input-label'>Thanh toán hiển thị ở kênh</span><select class='input' name='paymentStatusSnapshot'><option value='unknown'>Chưa rõ</option><option value='unpaid'>Chưa thanh toán</option><option value='paid'>Đã thanh toán</option><option value='cod'>Thu hộ COD</option></select></label><label class='form-field'><span class='input-label'>Tên người nhận</span><input class='input' name='customerName' maxlength='160' autocomplete='name'/></label><label class='form-field'><span class='input-label'>Điện thoại người nhận</span><input class='input' name='customerPhone' type='tel' inputmode='tel' maxlength='32' autocomplete='tel'/></label><label class='form-field full'><span class='input-label'>Địa chỉ giao hàng</span><textarea class='input' name='shippingAddress' rows='2' maxlength='500' autocomplete='shipping street-address'></textarea></label><label class='form-field full'><span class='input-label'>Ghi chú đóng gói nội bộ</span><textarea class='input' name='internalNote' rows='2' maxlength='500'></textarea></label></div><div class='channel-order-catalog-search'><label class='form-field'><span class='input-label'>Tìm SKU đã ánh xạ</span><input class='input' id='channel-order-mapping-search' type='search' maxlength='100' placeholder='Tên, SKU Slink hoặc SKU trên kênh'/></label><small id='channel-order-catalog-note'>Đang tải SKU đã ánh xạ…</small></div><div id='channel-order-lines'>${S.fn.channelOrderLineRow(0)}</div><button class='btn btn-secondary' type='button' data-action='add-channel-order-line'>Thêm mặt hàng</button><div class='channel-order-total'><span>Tổng mặt hàng theo giá kênh</span><strong data-channel-order-total>—</strong></div><div class='notice-item channel-modal-note'><span>${S.fn.icon('alert', 16)}</span><span><strong>Xác nhận sẽ giữ số lượng tại kho giao</strong><small>Thông tin người nhận là bản chụp từ gian hàng. Đánh dấu “Đã gửi” sẽ trừ tồn và ghi thẻ kho; Slink chưa tạo giao dịch thu tiền, doanh thu hay công nợ.</small></span></div></form>`, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>Giữ tồn và ghi đơn</button>`, true);
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/warehouses`);
      if (S.dom.modal.hidden) return;
      const active = (result.warehouses || []).filter((item) => item.status === 'active');
      const select = document.getElementById('channel-order-warehouse-id');
      if (!select) return;
      select.innerHTML = active.length ? active.map((item) => `<option value='${S.fn.esc(item.id)}' ${item.is_default ? 'selected' : ''}>${S.fn.esc(item.name)}${item.is_default ? ' · Kho chính' : ''}</option>`).join('') : `<option value=''>Không có kho được giao</option>`;
      const profile = document.getElementById('channel-order-profile-id')?.value;
      await S.fn.loadChannelOrderCatalog(profile, '');
    } catch (error) {
      const select = document.getElementById('channel-order-warehouse-id');
      if (select) select.innerHTML = `<option value=''>Chưa tải được kho</option>`;
      const note = document.getElementById('channel-order-catalog-note');
      if (note) note.textContent = error.message;
    }
  }


  S.fn.updateChannelOrderTotal = function updateChannelOrderTotal(form) {
    const output = form?.querySelector('[data-channel-order-total]');
    if (!output) return;
    try {
      let total = 0n;
      form.querySelectorAll('[data-channel-order-line]').forEach((row) => {
        const quantity = String(row.querySelector('[data-channel-order-quantity]')?.value || '').replace(',', '.');
        const price = S.fn.moneyInputRaw(row.querySelector('[data-channel-order-price]')?.value || '');
        const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,3}))?$/.exec(quantity);
        if (!match || !/^(0|[1-9]\d{0,18})$/.test(price)) throw new Error('invalid');
        const milli = BigInt(match[1]) * 1000n + BigInt((match[2] || '').padEnd(3, '0') || '0');
        total += (BigInt(price) * milli + 500n) / 1000n;
      });
      output.textContent = S.fn.moneyVndText(total.toString());
    } catch (_error) { output.textContent = 'Nhập số lượng và đơn giá hợp lệ'; }
  }


  S.fn.createChannelOrder = async function createChannelOrder(form) {
    const lines = [];
    for (const row of form.querySelectorAll('[data-channel-order-line]')) {
      const mappingId = row.querySelector('[data-channel-order-mapping]')?.value || '';
      const quantity = String(row.querySelector('[data-channel-order-quantity]')?.value || '').trim().replace(',', '.');
      const unitPriceVnd = S.fn.moneyInputRaw(row.querySelector('[data-channel-order-price]')?.value || '').trim();
      if (!mappingId || !/^(0|[1-9]\d{0,9})(?:\.\d{1,3})?$/.test(quantity) || !/^(0|[1-9]\d{0,18})$/.test(unitPriceVnd)) {
        return S.fn.toast('Dòng hàng chưa hợp lệ', 'Chọn SKU đã ánh xạ, số lượng dương và đơn giá VND nguyên.', 'error');
      }
      lines.push({ mappingId, quantity, unitPriceVnd });
    }
    const data = new FormData(form);
    const payload = {
      channelProfileId: String(data.get('channelProfileId') || ''),
      warehouseId: String(data.get('warehouseId') || ''),
      externalOrderRef: String(data.get('externalOrderRef') || '').trim(),
      paymentStatusSnapshot: String(data.get('paymentStatusSnapshot') || 'unknown'),
      customerName: String(data.get('customerName') || '').trim(),
      customerPhone: String(data.get('customerPhone') || '').trim(),
      shippingAddress: String(data.get('shippingAddress') || '').trim(),
      internalNote: String(data.get('internalNote') || '').trim(),
      items: lines,
    };
    const submit = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/channel-orders`, {
        method: 'POST', headers: { 'idempotency-key': form.dataset.idempotencyKey }, body: payload,
      });
      S.fn.closeModal();
      S.state.channelState.view = 'orders';
      S.fn.emitSyncDomains(['channels', 'stock', 'dashboard'], { source: 'channel-order-create' });
      await S.fn.loadChannelOrders(0);
      S.fn.render();
      S.fn.toast('Đơn kênh đã được ghi nhận', `${result.order.externalOrderRef} · ${S.fn.moneyVndText(result.order.totalVnd)} · tồn đã được giữ tại ${result.order.warehouseName}.`);
    } catch (error) {
      if (submit) submit.disabled = false;
      S.fn.toast('Chưa ghi nhận được đơn', error.message, 'error');
    }
  }


  S.fn.openChannelOrderStatus = function openChannelOrderStatus(order, nextStatus) {
    if (!order || !new Set(['reserved', 'packed', 'shipped', 'delivered', 'cancelled']).has(nextStatus)) return;
    const cancel = nextStatus === 'cancelled';
    const title = cancel ? 'Hủy đơn kênh?' : `${S.state.channelOrderStatusNames[nextStatus]}?`;
    const actionText = cancel ? 'Hủy đơn và nhả tồn' : `Xác nhận ${S.state.channelOrderStatusNames[nextStatus].toLocaleLowerCase('vi-VN')}`;
    const help = nextStatus === 'shipped' ? 'Slink sẽ trừ lượng đang giữ khỏi tồn và ghi thẻ kho trong cùng giao dịch.' : cancel ? 'Chỉ hủy được trước khi gửi. Lượng tồn đang giữ sẽ được trả lại khả dụng.' : 'Trạng thái sẽ được lưu vào lịch sử đơn kênh.';
    const form = `<form id='entity-form' data-form='channel-order-status' data-id='${S.fn.esc(order.id)}' data-status='${S.fn.esc(nextStatus)}' data-version='${S.fn.esc(order.version)}' data-idempotency-key='${S.fn.newIdempotencyKey()}'><p><strong>${S.fn.esc(order.externalOrderRef)}</strong> · ${S.fn.esc(S.state.channelOrderStatusNames[order.fulfillmentStatus])}</p>${cancel ? `<label class='form-field'><span class='input-label'>Lý do hủy *</span><textarea class='input' name='reason' rows='3' minlength='3' maxlength='500' required></textarea></label>` : `<label class='form-field'><span class='input-label'>Ghi chú nội bộ (không bắt buộc)</span><textarea class='input' name='reason' rows='2' maxlength='500'></textarea></label>`}<div class='modal-note'>${S.fn.esc(help)}</div></form>`;
    S.fn.showModal(title, 'Thao tác có kiểm soát phiên bản và sẽ ghi lịch sử.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Quay lại</button><button class='btn ${cancel ? 'btn-danger' : 'btn-primary'}' type='submit' form='entity-form'>${S.fn.esc(actionText)}</button>`);
  }


  S.fn.saveChannelOrderStatus = async function saveChannelOrderStatus(form) {
    const id = form.dataset.id;
    const status = form.dataset.status;
    const reason = String(new FormData(form).get('reason') || '').trim();
    const submit = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/channel-orders/${encodeURIComponent(id)}/status`, {
        method: 'POST', headers: { 'idempotency-key': form.dataset.idempotencyKey },
        body: { status, version: Number(form.dataset.version), reason },
      });
      S.fn.closeModal();
      S.fn.emitSyncDomains(['channels', 'stock', 'dashboard'], { source: 'channel-order-status' });
      await S.fn.loadChannelOrders(S.state.channelState.orderOffset);
      S.fn.toast('Đã cập nhật đơn kênh', S.state.channelOrderStatusNames[status]);
    } catch (error) {
      if (submit) submit.disabled = false;
      S.fn.toast('Chưa cập nhật được đơn', error.message, 'error');
    }
  }


  S.fn.openChannelOrderDetail = async function openChannelOrderDetail(id) {
    try {
      const detail = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/channel-orders/${encodeURIComponent(id)}`);
      const order = detail.order;
      const lines = detail.lines.map((line) => `<tr><td>${S.fn.esc(line.productName)}<small class='table-secondary'>${S.fn.esc(line.sku)} · ${S.fn.esc(line.externalSku)}</small></td><td>${S.fn.number(Number(line.quantity))} ${S.fn.esc(line.unit)}</td><td class='text-right'>${S.fn.moneyVndText(line.unitPriceVnd)}</td><td class='text-right'>${S.fn.moneyVndText(line.lineTotalVnd)}</td></tr>`).join('');
      const events = detail.events.map((event) => `<div class='channel-order-event'><span class='badge badge-neutral'>${S.fn.esc(S.state.channelOrderStatusNames[event.toStatus] || event.toStatus)}</span><div><strong>${S.fn.esc(event.actorName)}</strong><small>${S.fn.humanDate(event.occurredAt, true)}${event.reason ? ` · ${S.fn.esc(event.reason)}` : ''}</small></div></div>`).join('');
      const recipient = [order.customerName && `<div><small>Người nhận</small><strong>${S.fn.esc(order.customerName)}</strong></div>`, order.customerPhone && `<div><small>Điện thoại</small><strong>${S.fn.esc(order.customerPhone)}</strong></div>`, order.shippingAddress && `<div class='channel-recipient-address'><small>Địa chỉ giao hàng</small><strong>${S.fn.esc(order.shippingAddress)}</strong></div>`, order.internalNote && `<div class='channel-recipient-address'><small>Ghi chú đóng gói</small><strong>${S.fn.esc(order.internalNote)}</strong></div>`].filter(Boolean).join('');
      const body = `<div class='summary-banner'><div><strong>${S.fn.esc(S.state.channelNames[order.channelCode] || 'Kênh khác')} · ${S.fn.esc(order.shopLabel)}</strong><small>${S.fn.esc(order.externalOrderRef)} · ${S.fn.esc(order.warehouseName || '')}</small></div><strong>${S.fn.moneyVndText(order.totalVnd)}</strong></div>${recipient ? `<section class='channel-recipient-card'>${recipient}</section>` : ''}<div class='notice-item'><span>${S.fn.icon('alert', 16)}</span><span><strong>Thanh toán: ${S.fn.esc(S.state.channelPaymentNames[order.paymentStatusSnapshot] || 'Chưa rõ')}</strong><small>Trạng thái do nhân viên ghi lại; không phản ánh tiền đã vào sổ Slink.</small></span></div><section class='panel'><div class='table-wrap'><table class='data-table'><thead><tr><th>Sản phẩm</th><th>Số lượng</th><th class='text-right'>Đơn giá</th><th class='text-right'>Thành tiền</th></tr></thead><tbody>${lines}</tbody></table></div></section><section class='channel-order-timeline'><h3>Lịch sử xử lý</h3>${events || `<div class='empty-state'>Chưa có lịch sử.</div>`}</section>`;
      S.fn.showModal(`Đơn ${order.externalOrderRef}`, `${S.state.channelOrderStatusNames[order.fulfillmentStatus]} · ${S.fn.humanDate(order.createdAt, true)}`, body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-primary' type='button' data-action='print-channel-order' data-id='${S.fn.esc(order.id)}'>In phiếu đóng gói</button>`, true);
    } catch (error) { S.fn.toast('Chưa tải được đơn kênh', error.message, 'error'); }
  }


  S.fn.formatChannelQuantity = function formatChannelQuantity(value) {
    const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,3}))?$/.exec(String(value));
    if (!match) return '';
    const whole = new Intl.NumberFormat('vi-VN').format(BigInt(match[1]));
    const fraction = (match[2] || '').replace(/0+$/, '');
    return fraction ? `${whole},${fraction}` : whole;
  }


  S.fn.printChannelPackingSlip = async function printChannelPackingSlip(id) {
    const popup = window.open('', '_blank', 'width=860,height=1000');
    if (!popup) return S.fn.toast('Trình duyệt đã chặn cửa sổ in', 'Cho phép cửa sổ bật lên rồi thử lại.', 'error');
    popup.document.open();
    popup.document.write(`<!doctype html><html lang='vi'><head><meta charset='utf-8'><title>Slink · Đang tải phiếu</title></head><body>Đang tải dữ liệu đơn từ máy chủ…</body></html>`);
    popup.document.close();
    try {
      const detail = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/channel-orders/${encodeURIComponent(id)}`);
      if (popup.closed) return;
      const order = detail.order;
      const rows = detail.lines.map((line, index) => `<tr><td class='index'>${index + 1}</td><td><strong>${S.fn.esc(line.productName)}</strong><small>SKU: ${S.fn.esc(line.sku)} · SKU kênh: ${S.fn.esc(line.externalSku)}</small></td><td class='quantity'>${S.fn.formatChannelQuantity(line.quantity)} ${S.fn.esc(line.unit)}</td><td class='check'></td></tr>`).join('');
      const contacts = [order.customerName && `<div><span>Người nhận</span><strong>${S.fn.esc(order.customerName)}</strong></div>`, order.customerPhone && `<div><span>Điện thoại</span><strong>${S.fn.esc(order.customerPhone)}</strong></div>`, order.shippingAddress && `<div><span>Địa chỉ giao hàng</span><strong>${S.fn.esc(order.shippingAddress)}</strong></div>`].filter(Boolean).join('');
      const note = order.internalNote ? `<section class='note'><strong>Ghi chú đóng gói</strong><p>${S.fn.esc(order.internalNote)}</p></section>` : '';
      const cancelled = order.fulfillmentStatus === 'cancelled' ? `<div class='cancelled'>ĐƠN ĐÃ HỦY — KHÔNG ĐÓNG GÓI</div>` : '';
      const html = `<!doctype html><html lang='vi'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Phiếu đóng gói · ${S.fn.esc(order.externalOrderRef)}</title><style>
        @page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#202923;margin:0;line-height:1.45}header{display:flex;justify-content:space-between;gap:18px;border-bottom:2px solid #263d30;padding-bottom:12px}h1{font-size:20px;margin:0 0 4px}h2{font-size:23px;margin:0 0 5px}.muted{color:#667169;font-size:11px}.meta{text-align:right}.meta strong{display:block}.contacts{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;padding:14px 0;border-bottom:1px solid #dce4dc}.contacts div{display:grid;gap:3px;min-width:0}.contacts span,.note strong{font-size:11px;color:#69766d}.contacts strong{overflow-wrap:anywhere}.contacts div:nth-child(3){grid-column:1/-1}.note{margin:13px 0;padding:10px 12px;background:#f5f7f4;border-left:3px solid #78977e;break-inside:avoid}.note p{margin:5px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin-top:15px}th,td{padding:10px 8px;border-bottom:1px solid #dfe5df;text-align:left;vertical-align:top}th{background:#f4f6f3;font-size:11px}.index{width:34px;color:#78847c}.quantity{width:120px;font-weight:700}.check{width:46px}.check:after{content:'□';font-size:20px;color:#77857c}.cancelled{margin-top:14px;padding:10px;border:2px solid #a33434;text-align:center;color:#a33434;font-weight:700}.footer{margin-top:24px;padding-top:10px;border-top:1px solid #dce4dc;color:#77847c;font-size:10px}@media print{tr{break-inside:avoid}thead{display:table-header-group}}
        </style></head><body>${cancelled}<header><div><h1>${S.fn.esc(S.state.store.settings.storeName || 'Slink')}</h1><div class='muted'>${S.fn.esc(S.state.channelNames[order.channelCode] || 'Kênh khác')} · ${S.fn.esc(order.shopLabel)}</div><div class='muted'>Kho giao: ${S.fn.esc(order.warehouseName || 'Chưa rõ')}</div></div><div class='meta'><h2>PHIẾU ĐÓNG GÓI</h2><strong>${S.fn.esc(order.externalOrderRef)}</strong><span class='muted'>Tạo lúc ${S.fn.humanDate(order.createdAt, true)}</span><span class='muted'>Trạng thái: ${S.fn.esc(S.state.channelOrderStatusNames[order.fulfillmentStatus] || order.fulfillmentStatus)}</span></div></header>${contacts ? `<section class='contacts'>${contacts}</section>` : `<section class='contacts'><span>Chưa có thông tin người nhận trong dữ liệu đã ghi.</span></section>`}${note}<table><thead><tr><th>#</th><th>Mặt hàng</th><th>Số lượng</th><th>Đã lấy</th></tr></thead><tbody>${rows}</tbody></table><footer class='footer'>Phiếu nội bộ để soạn hàng. Không phải vận đơn hoặc hóa đơn. Trạng thái thanh toán và COD cần được đối chiếu riêng trên gian hàng.</footer></body></html>`;
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      window.setTimeout(() => { if (!popup.closed) popup.print(); }, 300);
    } catch (error) {
      if (!popup.closed) popup.close();
      S.fn.toast('Chưa tạo được phiếu đóng gói', error.message, 'error');
    }
  }


  S.fn.channelProfileLabel = function channelProfileLabel(profile) {
    return `${S.state.channelNames[profile.channel_code] || 'Kênh khác'} · ${profile.shop_label}`;
  }


  S.fn.renderChannelMappings = function renderChannelMappings() {
    if (!S.fn.canAccessRoute('channels')) return `<section class='panel locked-page'><div class='empty-icon'>${S.fn.icon('shop', 23)}</div><h2>Không có quyền quản lý kênh bán</h2><p>Chỉ chủ cửa hàng, quản lý hoặc nhân viên kho được quản lý mã sản phẩm trên kênh bán.</p></section>`;
    const activeProfiles = S.state.channelState.profiles.filter(function (profile) { return profile.status === 'active'; });
    const profileRows = S.state.channelState.profiles.map(function (profile) {
      const archived = profile.status === 'archived';
      const count = Number(profile.active_mapping_count) || 0;
      return `<article class='channel-profile-card'><div class='channel-profile-main'><span class='channel-profile-icon'>${S.fn.icon('shop', 18)}</span><div><div class='channel-profile-title'><strong>${S.fn.esc(S.state.channelNames[profile.channel_code] || 'Kênh khác')}</strong><span class='channel-connection'>Chưa kết nối</span>${archived ? `<span class='channel-archived'>Đã lưu trữ</span>` : ''}</div><p>${S.fn.esc(profile.shop_label)}</p><small>${S.fn.number(count)} sản phẩm liên kết</small></div></div><div class='channel-profile-actions'>${!archived ? `<button class='link-button' data-action='edit-channel-profile' data-id='${S.fn.esc(profile.id)}'>Sửa tên</button><button class='link-button danger-text' data-action='archive-channel-profile' data-id='${S.fn.esc(profile.id)}' ${count ? 'disabled title="Lưu trữ các ánh xạ trước"' : ''}>Lưu trữ</button>` : ''}</div></article>`;
    }).join('');
    const rows = S.state.channelState.mappings.map(function (mapping) {
      const archived = mapping.status === 'archived';
      const attributes = mapping.variant_attributes && Object.keys(mapping.variant_attributes).length
        ? ` · ${Object.entries(mapping.variant_attributes).map(function (entry) { return `${entry[0]}: ${entry[1]}`; }).map(S.fn.esc).join(' · ')}` : '';
      return `<article class='channel-mapping-row'><div class='channel-product-name'><strong>${S.fn.esc(mapping.product_name)}</strong><small>${S.fn.esc(mapping.internal_sku || 'Chưa có SKU')}${attributes}</small></div><div class='channel-mapping-profile'><span>${S.fn.esc(S.state.channelNames[mapping.channel_code] || 'Kênh khác')} · ${S.fn.esc(mapping.shop_label)}</span><small>Chưa kết nối</small></div><div class='channel-sku-cell'><strong>${S.fn.esc(mapping.external_sku)}</strong><small>${mapping.external_product_ref ? `Mã mặt hàng: ${S.fn.esc(mapping.external_product_ref)}` : 'Chưa nhập mã mặt hàng'}</small></div><div class='channel-mapping-actions'>${archived ? `<span class='channel-archived'>Đã lưu trữ</span>` : `<button class='link-button' data-action='edit-channel-mapping' data-id='${S.fn.esc(mapping.id)}'>Sửa</button><button class='link-button danger-text' data-action='archive-channel-mapping' data-id='${S.fn.esc(mapping.id)}'>Lưu trữ</button>`}</div></article>`;
    }).join('');
    const archivedTab = S.state.channelState.state === 'archived';
    const orderView = S.state.channelState.view === 'orders';
    const viewTabs = `<div class='channel-view-tabs' role='tablist' aria-label='Khu vực kênh bán'><button class='segment ${!orderView ? 'active' : ''}' data-action='channel-view' data-view='mappings' role='tab' aria-selected='${!orderView}'>Gian hàng và sản phẩm</button><button class='segment ${orderView ? 'active' : ''}' data-action='channel-view' data-view='orders' data-tour-target='channels-orders' role='tab' aria-selected='${orderView}'>Đơn online</button></div>`;
    const headingActions = orderView
      ? `${S.fn.canExportData() ? `<button class='btn btn-secondary' data-action='open-export'>Xuất CSV</button>` : ''}<button class='btn btn-secondary' data-action='reload-channel-orders'>Tải lại</button><button class='btn btn-primary' data-action='new-channel-order' ${activeProfiles.length ? '' : 'disabled title="Thêm gian hàng trước"'}>${S.fn.icon('plus', 15)} Ghi nhận đơn</button>`
      : `<button class='btn btn-secondary' data-action='reload-channel-catalog'>Tải lại</button><button class='btn btn-primary' data-action='new-channel-profile' data-tour-target='channels-profiles'>${S.fn.icon('plus', 15)} Thêm gian hàng</button>`;
    const header = S.fn.pageHeading('Bán online', '', headingActions) +
      `<div class='settings-partner-row channel-partner-bar'><div class='settings-partner-info'><strong>Kết nối sàn thương mại</strong><span class='partner-status-pill'>Chưa kết nối</span></div><button class='btn btn-secondary btn-sm' type='button' data-action='partner-connect' data-partner-name='Sàn thương mại điện tử'>Kết nối</button></div>${viewTabs}`;
    if (orderView) return header + "<div class='category-scroll online-task-tabs' aria-label='Việc cần làm'>" + [['', 'Tất cả đơn'], ['reserved', 'Cần đóng gói'], ['packed', 'Cần bàn giao'], ['shipped', 'Đang giao']].map(function (item) { return "<button class='pos-category " + (S.state.channelState.orderStatus === item[0] ? 'active' : '') + "' data-action='quick-channel-status' data-status='" + item[0] + "'>" + item[1] + "</button>"; }).join('') + "</div>" + S.fn.renderChannelOrders();
    return header +
      `<section class='panel channel-profiles-panel'><div class='panel-header'><div><h2>Gian hàng đã khai báo</h2></div><span class='badge badge-neutral'>${S.fn.number(S.state.channelState.profiles.length)} gian hàng</span></div>${profileRows || `<div class='empty-state'><strong>${S.state.channelState.loading ? 'Đang tải gian hàng…' : 'Chưa có gian hàng'}</strong></div>`}</section>
      <section class='panel channel-mappings-panel'><div class='panel-header'><div><h2>${archivedTab ? 'Ánh xạ đã lưu trữ' : 'Ánh xạ sản phẩm'}</h2></div><button class='btn btn-primary' data-action='new-channel-mapping' ${activeProfiles.length ? '' : 'disabled title="Thêm gian hàng trước"'}>${S.fn.icon('plus', 15)} Thêm ánh xạ</button></div>
      <div class='channel-toolbar'><form data-form='channel-filter' class='channel-filter-form'><label class='search-wrap' for='channel-search'>${S.fn.icon('search', 16)}<input class='input' id='channel-search' name='q' type='search' maxlength='120' value='${S.fn.esc(S.state.channelState.query)}' placeholder='Tìm sản phẩm, SKU hoặc gian hàng'/></label><button class='btn btn-secondary' type='submit'>Tìm</button></form><div class='segmented'><button class='segment ${!archivedTab ? 'active' : ''}' data-action='channel-state' data-state='active'>Đang dùng</button><button class='segment ${archivedTab ? 'active' : ''}' data-action='channel-state' data-state='archived'>Đã lưu trữ</button></div></div>
      ${S.state.channelState.error ? `<div class='auth-message error' role='alert'>${S.fn.esc(S.state.channelState.error)} <button class='link-button' data-action='reload-channel-catalog'>Tải lại</button></div>` : ''}<div class='channel-mapping-list'>${rows || `<div class='empty-state'><strong>${S.state.channelState.loading ? 'Đang tải ánh xạ…' : archivedTab ? 'Chưa có ánh xạ lưu trữ' : 'Chưa có ánh xạ SKU'}</strong></div>`}</div><div class='pagination'><span>${S.fn.number(S.state.channelState.total)} ánh xạ</span><span class='pagination-actions'>${S.state.channelState.offset > 0 ? `<button class='page-button' data-action='channel-page' data-offset='${Math.max(0, S.state.channelState.offset - 50)}' aria-label='Trang trước'>‹</button>` : ''}<span class='page-button current'>${Math.floor(S.state.channelState.offset / 50) + 1}</span>${S.state.channelState.nextOffset !== null ? `<button class='page-button' data-action='channel-page' data-offset='${S.state.channelState.nextOffset}' aria-label='Trang sau'>›</button>` : ''}</span></div></section>`;
  }


  S.fn.openChannelProfile = function openChannelProfile(profile) {
    const isEdit = Boolean(profile);
    const code = profile ? profile.channel_code : 'shopee';
    const options = Object.entries(S.state.channelNames).map(function (entry) { return `<option value='${entry[0]}' ${code === entry[0] ? 'selected' : ''}>${S.fn.esc(entry[1])}</option>`; }).join('');
    const form = `<form id='entity-form' data-form='channel-profile' data-id='${profile ? S.fn.esc(profile.id) : ''}' data-version='${profile ? profile.version : ''}' data-idempotency-key='${S.fn.newIdempotencyKey()}'><div class='form-grid'><div class='form-field'><label class='input-label' for='channel-code'>Kênh bán *</label><select class='input' id='channel-code' name='channelCode' ${isEdit ? 'disabled' : ''} required>${options}</select></div><div class='form-field'><label class='input-label' for='channel-shop-label'>Tên gian hàng *</label><input class='input' id='channel-shop-label' name='shopLabel' value='${S.fn.esc(profile ? profile.shop_label : '')}' required maxlength='120' placeholder='Ví dụ: Slink Official'/></div></div></form>`;
    S.fn.showModal(isEdit ? 'Sửa thông tin gian hàng' : 'Thêm gian hàng', '', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>${isEdit ? 'Lưu thay đổi' : 'Thêm gian hàng'}</button>`);
  }


  S.fn.loadChannelProductOptions = async function loadChannelProductOptions(query, selectedId) {
    const requestNumber = ++S.state.channelProductRequestNumber;
    const select = document.getElementById('channel-product-id');
    if (select) select.innerHTML = `<option value=''>Đang tìm sản phẩm…</option>`;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products?limit=100&q=${encodeURIComponent(query || '')}`);
      if (requestNumber !== S.state.channelProductRequestNumber || S.dom.modal.hidden) return;
      S.state.channelProductOptions = Array.isArray(result.products) ? result.products : [];
      const next = document.getElementById('channel-product-id');
      if (!next) return;
      next.innerHTML = `<option value=''>Chọn sản phẩm</option>` + S.state.channelProductOptions.map(function (product) {
        return `<option value='${S.fn.esc(product.id)}' ${product.id === selectedId ? 'selected' : ''}>${S.fn.esc(product.name)} · ${S.fn.esc(product.sku)}</option>`;
      }).join('');
      const count = document.getElementById('channel-product-count');
      if (count) count.textContent = `${S.fn.number(result.total)} sản phẩm phù hợp${result.nextOffset !== null ? ' · nhập thêm từ khóa để thu hẹp danh sách' : ''}`;
    } catch (error) {
      if (requestNumber !== S.state.channelProductRequestNumber || S.dom.modal.hidden) return;
      const next = document.getElementById('channel-product-id');
      if (next) next.innerHTML = `<option value=''>Chưa tải được sản phẩm</option>`;
      const count = document.getElementById('channel-product-count');
      if (count) count.textContent = error.message;
    }
  }


  S.fn.openChannelMapping = function openChannelMapping(mapping) {
    const isEdit = Boolean(mapping);
    const profiles = S.state.channelState.profiles.filter(function (profile) { return profile.status === 'active'; });
    const selectedProfile = mapping ? mapping.channel_profile_id : profiles[0]?.id || '';
    const profileOptions = profiles.map(function (profile) { return `<option value='${S.fn.esc(profile.id)}' ${selectedProfile === profile.id ? 'selected' : ''}>${S.fn.esc(S.fn.channelProfileLabel(profile))}</option>`; }).join('');
    const form = `<form id='entity-form' data-form='channel-mapping' data-id='${mapping ? S.fn.esc(mapping.id) : ''}' data-version='${mapping ? mapping.version : ''}' data-product-id='${mapping ? S.fn.esc(mapping.product_id) : ''}' data-idempotency-key='${S.fn.newIdempotencyKey()}'><div class='form-field'><label class='input-label' for='channel-profile-id'>Gian hàng *</label><select class='input' id='channel-profile-id' name='channelProfileId' ${isEdit ? 'disabled' : ''} required>${profileOptions}</select></div>${isEdit ? `<div class='channel-readonly-product'><small>Sản phẩm nội bộ</small><strong>${S.fn.esc(mapping.product_name)}</strong><span>${S.fn.esc(mapping.internal_sku || 'Chưa có SKU')}</span></div>` : `<div class='form-field'><label class='input-label' for='channel-product-search'>Tìm sản phẩm nội bộ</label><input class='input' id='channel-product-search' type='search' maxlength='120' placeholder='Tên sản phẩm hoặc SKU'/><small id='channel-product-count'>Đang tải danh mục…</small></div><div class='form-field'><label class='input-label' for='channel-product-id'>Sản phẩm *</label><select class='input' id='channel-product-id' name='productId' required><option value=''>Đang tải sản phẩm…</option></select></div>`}<div class='form-grid'><div class='form-field'><label class='input-label' for='channel-external-sku'>SKU trên kênh *</label><input class='input' id='channel-external-sku' name='externalSku' value='${mapping ? S.fn.esc(mapping.external_sku) : ''}' required maxlength='80' autocomplete='off' placeholder='Ví dụ: SP-RED-01'/></div><div class='form-field'><label class='input-label' for='channel-external-ref'>Mã mặt hàng trên kênh</label><input class='input' id='channel-external-ref' name='externalProductRef' value='${mapping ? S.fn.esc(mapping.external_product_ref || '') : ''}' maxlength='120' autocomplete='off' placeholder='Không bắt buộc'/></div></div><div class='notice-item channel-modal-note'><span>○</span><span><strong>Ánh xạ thủ công · chưa đồng bộ</strong><small>Thay đổi này chỉ lưu mã đối chiếu trong Slink, không cập nhật gian hàng bên ngoài.</small></span></div></form>`;
    S.fn.showModal(isEdit ? 'Sửa ánh xạ SKU' : 'Thêm ánh xạ SKU', 'Liên kết một mã hàng trên kênh với đúng một sản phẩm Slink.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>${isEdit ? 'Lưu thay đổi' : 'Tạo ánh xạ'}</button>`, true);
    if (!isEdit) S.fn.loadChannelProductOptions('', '');
  }


  S.fn.saveChannelProfile = async function saveChannelProfile(form) {
    const id = form.dataset.id;
    const payload = { channelCode: form.querySelector('[name="channelCode"]').value, shopLabel: String(new FormData(form).get('shopLabel') || '').trim() };
    if (id) payload.version = Number(form.dataset.version);
    const submit = S.dom.modal.querySelector('[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/channel-profiles${id ? `/${encodeURIComponent(id)}` : ''}`, {
        method: id ? 'PUT' : 'POST', headers: { 'idempotency-key': form.dataset.idempotencyKey }, body: payload,
      });
      S.fn.closeModal();
      S.fn.emitSyncDomains(['channels'], { source: 'channel-profile' });
      await S.fn.loadChannelCatalog(S.state.channelState.offset);
      S.fn.toast('Đã lưu gian hàng');
    } catch (error) {
      if (submit) submit.disabled = false;
      S.fn.toast('Chưa lưu được gian hàng', error.message, 'error');
    }
  }


  S.fn.saveChannelMapping = async function saveChannelMapping(form) {
    const id = form.dataset.id;
    const profileSelect = form.querySelector('[name="channelProfileId"]');
    const productSelect = form.querySelector('[name="productId"]');
    const payload = {
      channelProfileId: profileSelect.value,
      ...(id ? {} : { productId: productSelect.value }),
      externalSku: String(new FormData(form).get('externalSku') || '').trim(),
      externalProductRef: String(new FormData(form).get('externalProductRef') || '').trim(),
    };
    if (id) payload.version = Number(form.dataset.version);
    const submit = S.dom.modal.querySelector('[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/channel-mappings${id ? `/${encodeURIComponent(id)}` : ''}`, {
        method: id ? 'PUT' : 'POST', headers: { 'idempotency-key': form.dataset.idempotencyKey }, body: payload,
      });
      S.fn.closeModal();
      S.fn.emitSyncDomains(['channels'], { source: 'channel-profile' });
      await S.fn.loadChannelCatalog(S.state.channelState.offset);
      S.fn.toast('Đã lưu ánh xạ SKU', 'Ánh xạ chỉ phục vụ đối chiếu thủ công trong Slink.');
    } catch (error) {
      if (submit) submit.disabled = false;
      S.fn.toast('Chưa lưu được ánh xạ', error.message, 'error');
    }
  }


  S.fn.confirmChannelArchive = function confirmChannelArchive(kind, record) {
    const profile = kind === 'profile';
    const title = profile ? 'Lưu trữ gian hàng?' : 'Lưu trữ ánh xạ SKU?';
    const recordName = profile ? record.shop_label : `${record.product_name} · ${record.external_sku}`;
    const form = `<form id='entity-form' data-form='channel-archive' data-kind='${profile ? 'profile' : 'mapping'}' data-id='${S.fn.esc(record.id)}' data-version='${record.version}' data-idempotency-key='${S.fn.newIdempotencyKey()}'><p><strong>${S.fn.esc(recordName)}</strong> sẽ được lưu trữ và không còn xuất hiện trong danh sách đang dùng. Không có sản phẩm, tồn kho hay dữ liệu sàn nào bị thay đổi.</p></form>`;
    S.fn.showModal(title, 'Lịch sử được giữ lại trong cửa hàng.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Giữ lại</button><button class='btn btn-primary' type='submit' form='entity-form'>Lưu trữ</button>`);
  }


  S.fn.saveChannelArchive = async function saveChannelArchive(form) {
    const kind = form.dataset.kind;
    const id = form.dataset.id;
    const endpoint = kind === 'profile' ? 'channel-profiles' : 'channel-mappings';
    const button = S.dom.modal.querySelector('[type="submit"][form="entity-form"]');
    if (button) button.disabled = true;
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/${endpoint}/${encodeURIComponent(id)}/archive`, {
        method: 'POST', headers: { 'idempotency-key': form.dataset.idempotencyKey }, body: { version: Number(form.dataset.version) },
      });
      S.fn.closeModal();
      S.fn.emitSyncDomains(['channels'], { source: 'channel-profile' });
      await S.fn.loadChannelCatalog(S.state.channelState.offset);
      S.fn.toast(kind === 'profile' ? 'Đã lưu trữ gian hàng' : 'Đã lưu trữ ánh xạ SKU', 'Lịch sử được giữ trong cửa hàng.');
    } catch (error) {
      if (button) button.disabled = false;
      S.fn.toast('Chưa lưu trữ được', error.message, 'error');
    }
  }


  S.fn.showChannelOrderScanner = function showChannelOrderScanner() {
    const surface = S.dom.modal.querySelector('[data-scan-surface][data-scan-mode="order"]');
    if (!surface) return;
    surface.hidden = false;
    const button = surface.querySelector('[data-action="start-camera-scan"]');
    if (button) button.focus();
  }

  S.fn.boot = async function boot() {
    if (window.SlinkEscPosPrinter?.setAndroidBridge) {
      window.SlinkEscPosPrinter.setAndroidBridge(S.fn.nativeAction);
      if (window.SlinkAndroid) window.SlinkEscPosPrinter.refreshBluetoothState().catch(() => {});
    }
    window.SlinkPosHardware?.setAndroidBridge?.(S.fn.nativeAction);
    window.SlinkReceiptImage?.setAndroidBridge?.(S.fn.nativeAction);
    if (window.SlinkSyncBus) {
      window.SlinkSyncBus.setContext({ origin: window.location.origin });
      S.fn.initSyncBus();
    }
    const resetToken = new URLSearchParams(window.location.hash.slice(1)).get('reset');
    if (resetToken) {
      S.state.authMode = 'reset-complete';
      S.fn.renderAuth();
      return;
    }
    const verificationToken = new URLSearchParams(window.location.hash.slice(1)).get('token') || new URLSearchParams(window.location.search).get('token');
    if (window.location.pathname === '/verify' && verificationToken) {
      S.state.authMode = 'login';
      S.fn.authCard('Đang xác nhận email', 'Đang kích hoạt cửa hàng của bạn.', '', 'Đang kiểm tra liên kết bảo mật…');
      try {
        const result = await S.fn.apiRequest('/api/auth/verify-email', { method: 'POST', body: { token: verificationToken } });
        window.history.replaceState({}, '', '/');
        S.fn.renderAuth(result.message, 'success');
      } catch (error) {
        window.history.replaceState({}, '', '/');
        S.fn.renderAuth(error.message, 'error');
      }
      return;
    }
    S.state.invitationToken = new URLSearchParams(window.location.hash.slice(1)).get('invite') || '';
    if (window.location.pathname === '/invite' && S.state.invitationToken) {
      try {
        const result = await S.fn.apiRequest(`/api/invitations/${encodeURIComponent(S.state.invitationToken)}`);
        S.state.invitationInfo = result.invitation;
        if (S.state.invitationInfo.status !== 'pending') {
          S.state.authMode = 'login';
          S.fn.renderAuth('Lời mời đã được dùng, thu hồi hoặc hết hạn. Hãy liên hệ chủ cửa hàng để nhận lời mời mới.', 'error');
          return;
        }
      } catch (error) {
        S.state.authMode = 'login';
        S.fn.renderAuth(error.message, 'error');
        return;
      }
      let session;
      try { session = await S.fn.apiRequest('/api/auth/me'); }
      catch (error) {
        if (error.status === 401) { S.state.authMode = 'invite-login'; S.fn.renderAuth(); return; }
        S.state.authMode = 'invite-login'; S.fn.renderAuth('Chưa kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', 'error'); return;
      }
      S.state.authMode = session.user.email.toLowerCase() === S.state.invitationInfo.email.toLowerCase() ? 'invite-confirm' : 'invite-login';
      S.fn.renderAuth(S.state.authMode === 'invite-login' ? 'Đăng nhập bằng email được mời để tham gia.' : '');
      return;
    }
    try {
      if (await S.fn.restoreSavedWorkspace()) return;
      const session = await S.fn.apiRequest('/api/auth/me');
      await S.fn.enterStore(session);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut();
      else S.fn.showSignedOut('Slink chưa kết nối được máy chủ. Kiểm tra mạng rồi thử đăng nhập lại.', 'error');
    }
  }

  document.addEventListener('input', function (event) {
    const form = event.target.closest('form');
    if (!form || !form.querySelector('[data-password-confirm-for]')) return;
    const confirmation = form.querySelector('[data-password-confirm-for]');
    if (event.target === confirmation || event.target.id === confirmation.dataset.passwordConfirmFor) S.fn.updatePasswordConfirmation(form);
  });

  document.addEventListener('click', function (event) {
    if (!S.state.guidedTourState.active || (S.state.guidedTourState.layer && S.state.guidedTourState.layer.contains(event.target))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener('keydown', S.fn.guidedTourKeydown, true);
  window.addEventListener('resize', S.fn.guidedTourViewportChanged, { passive: true });
  window.addEventListener('scroll', S.fn.guidedTourViewportChanged, { passive: true, capture: true });

  document.addEventListener('click', function (event) {
    if (event.target.closest('.toast') || event.target.closest("[data-action='dismiss-toast']")) { S.fn.dismissToast(); return; }
    const conflictBtn = event.target.closest('[data-conflict-action]');
    if (conflictBtn) { S.fn.handleOfflineConflictAction(conflictBtn); return; }
    const editorMenu = S.dom.modal.querySelector('[data-product-editor-more][open]');
    if (editorMenu && !editorMenu.contains(event.target)) editorMenu.open = false;
    const route = event.target.closest('[data-route]');
    if (route) { S.fn.routeTo(route.dataset.route); return; }
    const button = event.target.closest('[data-action]'); if (!button) return;
    const action = button.dataset.action; const id = button.dataset.id;
    if (editorMenu?.contains(button)) {
      editorMenu.open = false;
      if (action === 'print-barcode-single') {
        const p = S.fn.productById(id);
        if (p) S.fn.requestCloseModal(() => S.fn.openBarcodePrintModal([{ ...p, copies: 1 }]));
        return;
      }
      if (S.dom.modal.querySelector('form[data-saving="true"]')) return;
      const open = { 'adjust-stock': S.fn.openStockAdjust, 'product-price-history': S.fn.openProductPriceHistory, 'add-product-to-existing-variant-group': S.fn.openProductVariantAdd, 'archive-product': S.fn.archiveProduct }[action];
      if (open) S.fn.requestCloseModal(() => open(id));
      return;
    }
    if (action === 'generate-product-sku') {
      const field = button.form.elements.sku;
      if (field.disabled || button.form.dataset.saving === 'true') return;
      field.value = S.fn.newProductSku();
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.focus();
      return;
    }
    if (action === 'generate-product-barcode') {
      const field = button.form?.elements.barcode;
      if (!field || field.disabled || button.form.dataset.saving === 'true' || !window.SlinkBarcodeTools) return;
      try {
        field.value = S.fn.nextUniqueBarcode();
      } catch (error) {
        return S.fn.toast('Chưa tạo được mã vạch', error.message, 'error');
      }
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.focus();
      return;
    }
    if (action === 'generate-variant-barcode') {
      const field = button.closest('[data-product-variant-row]')?.querySelector('[data-variant-barcode]');
      if (!field || field.disabled || button.form?.dataset.saving === 'true' || !window.SlinkBarcodeTools) return;
      try {
        field.value = S.fn.nextUniqueBarcode();
      } catch (error) {
        return S.fn.toast('Chưa tạo được mã vạch', error.message, 'error');
      }
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.focus();
      return;
    }
    if (action === 'fill-variant-barcodes') {
      const inputs = Array.from(S.dom.modal.querySelectorAll('[data-variant-barcode]:not(:disabled)'));
      const seen = new Set();
      let generated = 0;
      try {
        inputs.forEach(function (field) {
          if (!String(field.value || '').trim()) {
            const code = S.fn.nextUniqueBarcode(seen);
            if (code) {
              seen.add(code);
              field.value = code;
              field.dispatchEvent(new Event('input', { bubbles: true }));
              generated += 1;
            }
          }
        });
      } catch (error) {
        return S.fn.toast('Chưa tạo được mã vạch', error.message, 'error');
      }
      if (generated) S.fn.toast('Đã tạo mã vạch biến thể', `Đã bổ sung ${S.fn.number(generated)} mã EAN-13 cho biến thể trống.`);
      else S.fn.toast('Biến thể đã đủ mã vạch', 'Mọi dòng biến thể đều đã có mã.');
      return;
    }
    if (action === 'scan-product-barcode') {
      if (button.form.elements.barcode.disabled || button.form.dataset.saving === 'true') return;
      const surface = button.form.querySelector('[data-scan-mode="barcode-field"]');
      surface.hidden = false;
      surface.querySelector('button').focus({ preventScroll: true });
      S.fn.startScanCamera();
      return;
    }
    if (action === 'stop-product-barcode') { S.fn.closeProductBarcode(); return; }
    if (action === 'settings-area') { S.fn.selectSettingsArea(Number(button.dataset.index)); return; }
    if (action === 'remove-product-photo') { S.fn.removeProductPhoto(button); return; }
    if (action === 'quick-channel-status') { S.state.channelState.orderStatus = button.dataset.status || ''; S.fn.loadChannelOrders(0); return; }
    if (action === 'new-affiliate-link') { S.fn.openAffiliateLink(); return; }
    if (action === 'edit-affiliate-link') { S.fn.openAffiliateLink(id); return; }
    if (action === 'reload-affiliate') { S.fn.loadAffiliateLinks(0); return; }
    if (action === 'more-affiliate-links') { S.fn.loadAffiliateLinks(S.state.affiliateState.nextOffset); return; }
    if (action === 'switch-workspace') { S.fn.changeWorkspace(button.dataset.mode); return; }
    if (action === 'store-picker') { S.fn.openStorePicker(); return; }
    if (action === 'switch-store') { S.fn.switchStore(id, button); return; }
    if (action === 'copy-affiliate-link') {
      const link = S.state.affiliateState.links.find(function (item) { return item.id === id; });
      if (link) navigator.clipboard.writeText(link.affiliate_url).then(function () { S.fn.toast('Đã sao chép link', 'Dán link khi đăng nội dung.'); }).catch(function () { S.fn.toast('Chưa sao chép được', 'Cho phép truy cập bộ nhớ tạm rồi thử lại.', 'error'); });
      return;
    }

    if (action === 'guided-tour-next') { S.state.guidedTourState.index += 1; S.fn.showGuidedTourStep(0); }
    else if (action === 'guided-tour-prev') { S.state.guidedTourState.index = Math.max(0, S.state.guidedTourState.index - 1); S.fn.showGuidedTourStep(0); }
    else if (action === 'guided-tour-skip') S.fn.finishGuidedTour(true);
    else if (action === 'replay-guided-tour') { S.fn.closeModal(); S.fn.startGuidedTour(true); }
    else if (action === 'toggle-password') {
      const input = document.getElementById(button.dataset.target);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
      button.setAttribute('aria-pressed', show ? 'true' : 'false');
      button.title = show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu';
      button.innerHTML = show
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/><path d="m4 4 16 16"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>';
    }
    else if (action === 'business-profile-later') { if (!S.state.activeWrites) S.fn.requestCloseModal(); }
    else if (action === 'leave-invitation') { if (!S.state.activeWrites) { S.fn.clearInvitation(); S.state.authMode = 'login'; S.fn.boot(); } }
    else if (action === 'auth-mode') {
      const mode = button.dataset.mode || 'login';
      S.state.authMode = mode === 'landing' && S.fn.isAndroidApp() ? 'login' : mode;
      S.fn.renderAuth();
    }
    else if (action === 'logout') { S.fn.closeModal(); S.fn.signOut(); }
    else if (action === 'account-menu') S.fn.showAccountMenu();
    else if (action === 'account-settings') { S.fn.closeModal(); S.state.activeSettingsArea = 0; S.fn.routeTo('settings'); }
    else if (action === 'check-app-update') S.fn.nativeAction({ type: 'appUpdate', action: 'check' }).catch(error => S.fn.toast('Chưa kiểm tra được bản mới', error.message, 'error'));
    else if (action === 'install-app-update') {
      if (S.state.activeWrites || S.state.offlineState.syncing) return S.fn.toast('Đang lưu dữ liệu', 'Chờ hoàn tất rồi hãy cài bản mới.');
      if (S.dom.root.querySelector('form[data-dirty="true"]')) return S.fn.toast('Bạn đang sửa cài đặt', 'Lưu hoặc bỏ thay đổi trước khi cập nhật.');
      S.fn.showModal('Cài bản Slink mới?', 'Ứng dụng sẽ đóng trong lúc cài. Tài khoản, cửa hàng và dữ liệu đã lưu được giữ nguyên.', '<p>Nếu Android hỏi, hãy cho phép Slink cài bản cập nhật, sau đó quay lại và bấm Cài bản mới. Không cần gỡ ứng dụng hiện tại.</p>', `<button class='btn btn-secondary' data-action='close-modal'>Để sau</button><button class='btn btn-primary' data-action='confirm-app-update'>Tiếp tục</button>`);
    }
    else if (action === 'confirm-app-update') { S.fn.closeModal(); S.fn.nativeAction({ type: 'appUpdate', action: 'install' }).catch(() => S.fn.toast('Chưa cài được bản mới', 'Kiểm tra quyền cài ứng dụng và thử lại.', 'error')); }
    else if (action === 'account-logout') S.fn.showModal('Đăng xuất tài khoản?', 'Các việc đã lưu trên thiết bị được giữ lại cho đúng tài khoản.', '', `<button class='btn btn-secondary' data-action='close-modal'>Ở lại</button><button class='btn btn-primary' data-action='logout'>Đăng xuất</button>`);
    else if (action === 'discard-settings') { S.dom.root.querySelectorAll('form[data-dirty]').forEach(form => delete form.dataset.dirty); S.fn.routeTo(button.dataset.next); }
    else if (action === 'reload-finance') S.fn.loadFinancePage();
    else if (action === 'finance-tab') {
      S.state.financeTab = button.dataset.tab;
      button.parentElement.querySelector('[aria-current]')?.removeAttribute('aria-current');
      button.setAttribute('aria-current', 'page');
      S.fn.refreshFinanceBody();
      if (S.state.financeTab === 'receivables') S.fn.loadFinanceReceivables(0);
      else if (S.state.financeTab === 'cashbook' || S.state.financeTab === 'vouchers') S.fn.loadFinanceCashbook(0);
      else if (S.state.financeTab === 'payables') S.fn.loadFinancePayables(0);
    }
    else if (action === 'cashbook-fund') {
      S.state.financeCashbook.filters.fund = button.dataset.fund || 'all';
      S.fn.loadFinanceCashbook(0);
    }
    else if (action === 'cashbook-page') S.fn.loadFinanceCashbook(Number(button.dataset.offset) || 0);
    else if (action === 'finance-payable-page') S.fn.loadFinancePayables(Number(button.dataset.offset) || 0);
    else if (action === 'open-cash-transfer') S.fn.openCashTransfer();
    else if (action === 'void-cash-movement') S.fn.openVoidCashMovement(id);
    else if (action === 'manage-cash-categories') S.fn.openCashCategoriesModal();
    else if (action === 'toggle-cash-category') S.fn.toggleCashCategoryStatus(id, button.dataset.nextStatus);
    else if (action === 'finance-receivable-page') S.fn.loadFinanceReceivables(Number(button.dataset.offset) || 0);
    else if (action === 'finance-receivable-retry') S.fn.loadFinanceReceivables(S.state.financeReceivables.offset);
    else if (action === 'new-debtor') S.fn.openCustomer(null, { debt: true });
    else if (action === 'close-receivable') { S.state.receivableDetail = null; S.fn.render(); }
    else if (action === 'close-inline-debt-payment') button.closest('[data-inline-debt-payment]')?.remove();
    else if (action === 'add-customer-opening-debt') S.fn.openAddCustomerOpeningDebt(id);
    else if (action === 'close-inline-opening-debt') button.closest('[data-inline-opening-debt]')?.remove();
    else if (action === 'use-pack-cost') {
      const form = button.closest('form');
      try { const pack = S.fn.readProductPack(form); form.elements.cost.value = window.SlinkPurchaseUnits.fromPack(pack).unitCostVnd; S.fn.updateProductHints(form); form.elements.cost.focus(); }
      catch (error) { S.fn.toast('Chưa dùng được giá nhập', error.message, 'error'); }
    }
    else if (action === 'finance-receivable') S.fn.openReceivable(id);
    else if (action === 'finance-reminder') S.fn.openDebtReminder(id);
    else if (action === 'share-finance-reminder' || action === 'copy-finance-reminder') S.fn.useDebtReminder(action === 'share-finance-reminder');
    else if (action === 'cash-movement-detail') S.fn.openCashMovement(id);
    else if (action === 'toggle-customer-filters') {
      S.state.customerAdvancedOpen = !S.state.customerAdvancedOpen;
      const advanced = document.getElementById('customer-advanced');
      if (advanced) advanced.hidden = !S.state.customerAdvancedOpen;
      button.setAttribute('aria-expanded', String(S.state.customerAdvancedOpen));
      button.textContent = S.state.customerAdvancedOpen ? 'Ẩn bớt bộ lọc' : S.state.customerTagFilter || S.state.customerSegmentFilter || S.state.customerMinSpentVnd ? 'Lọc thêm · đang áp dụng' : 'Lọc thêm';
    }
    else if (action === 'view-customer-debt' || action === 'customer-quick-filter') {
      const nextSegment = action === 'view-customer-debt' ? 'owing' : button.dataset.segment || '';
      S.state.customerSegmentFilter = nextSegment;
      if (action === 'customer-quick-filter' && !nextSegment) {
        S.state.customerTagFilter = '';
        S.state.customerMinSpentVnd = '';
      }
      S.state.selectedCustomerSavedSegmentId = '';
      if (S.state.page !== 'customers') S.fn.routeTo('customers');
      else S.fn.loadCustomersPage(S.state.searchTerms.customers, 0).then(S.fn.render);
    }
    else if (action === 'reload-security') S.fn.loadAccountSecurity();
    else if (action === 'revoke-session') S.fn.revokeAccountSession(id);
    else if (action === 'retry-pos-catalog') S.fn.loadWarehouses().then(function () { return S.fn.loadProductsPage('', 0); });
    else if (action === 'products-page') S.fn.loadProductsPage(S.state.searchTerms.products, Number(button.dataset.offset) || 0);
    else if (action === 'inventory-page') S.fn.loadInventoryPage(S.state.searchTerms.inventory, Number(button.dataset.offset) || 0, { keepSearch: true });
    else if (action === 'inventory-stock-filter' && button.dataset.stock !== S.state.inventoryStockFilter) {
      S.state.inventoryStockFilter = button.dataset.stock;
      button.parentElement.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-pressed', 'true');
      S.fn.loadInventoryPage(S.state.searchTerms.inventory, 0, { keepSearch: true });
    }
    else if (action === 'inventory-scan') S.fn.openInventoryBarcode();
    else if (action === 'customers-page') S.fn.loadCustomersPage(S.state.searchTerms.customers, Number(button.dataset.offset) || 0).then(S.fn.render);
    else if (action === 'orders-page') S.fn.loadOrdersPage(S.state.searchTerms.orders, Number(button.dataset.offset) || 0).then(S.fn.render);
    else if (action === 'close-modal') S.fn.requestCloseModal();
    else if (action === 'keep-modal-input') {
      button.closest('.modal-discard')?.remove();
      if (S.state.modalEditedField?.isConnected) S.state.modalEditedField.focus({ preventScroll: true });
    }
    else if (action === 'review-legacy-pending') S.fn.clearReviewedLegacyPending();
    else if (action === 'import-products') S.fn.openProductImport();
    else if (action === 'bulk-update-products') S.fn.openProductBulkUpdate();
    else if (action === 'download-product-import-template') S.fn.downloadProductImportTemplate(false);
    else if (action === 'download-product-import-sample') S.fn.downloadProductImportTemplate(true);
    else if (action === 'import-fill-barcodes') { S.fn.fillImportMissingBarcodes(); return; }
    else if (action === 'print-barcode-imported') {
      if (S.state.lastImportedPrintItems.length) {
        const items = S.state.lastImportedPrintItems;
        S.fn.closeModal();
        S.fn.openBarcodePrintModal(items);
      }
      return;
    }
    else if (action === 'import-customers') S.fn.openCustomerImport();
    else if (action === 'download-customer-import-template') S.fn.downloadCustomerImportTemplate();
    else if (action === 'help') S.fn.showHelp();
    else if (action === 'more-menu') S.fn.showMoreMenu();
    else if (action === 'new-channel-profile') S.fn.openChannelProfile(null);
    else if (action === 'edit-channel-profile') {
      const profile = S.state.channelState.profiles.find(function (item) { return item.id === id; });
      if (profile) S.fn.openChannelProfile(profile);
    }
    else if (action === 'archive-channel-profile') {
      const profile = S.state.channelState.profiles.find(function (item) { return item.id === id; });
      if (profile && !Number(profile.active_mapping_count)) S.fn.confirmChannelArchive('profile', profile);
    }
    else if (action === 'new-channel-mapping') S.fn.openChannelMapping(null);
    else if (action === 'edit-channel-mapping') {
      const mapping = S.state.channelState.mappings.find(function (item) { return item.id === id; });
      if (mapping) S.fn.openChannelMapping(mapping);
    }
    else if (action === 'archive-channel-mapping') {
      const mapping = S.state.channelState.mappings.find(function (item) { return item.id === id; });
      if (mapping) S.fn.confirmChannelArchive('mapping', mapping);
    }
    else if (action === 'channel-view') {
      S.state.channelState.view = button.dataset.view === 'orders' ? 'orders' : 'mappings';
      S.fn.render();
      if (S.state.channelState.view === 'orders') S.fn.loadChannelOrders(0);
    }
    else if (action === 'new-channel-order') S.fn.openChannelOrderModal();
    else if (action === 'reload-channel-orders') S.fn.loadChannelOrders(S.state.channelState.orderOffset);
    else if (action === 'channel-order-page') S.fn.loadChannelOrders(Number(button.dataset.offset) || 0);
    else if (action === 'channel-order-detail') S.fn.openChannelOrderDetail(id);
    else if (action === 'print-channel-order') S.fn.printChannelPackingSlip(id);
    else if (action === 'channel-order-status') {
      const order = S.state.channelState.orders.find(function (item) { return item.id === id; });
      if (order) S.fn.openChannelOrderStatus(order, button.dataset.status);
    }
    else if (action === 'add-channel-order-line') {
      const container = document.getElementById('channel-order-lines');
      const rows = container ? container.querySelectorAll('[data-channel-order-line]') : [];
      if (container && rows.length < 100) {
        container.insertAdjacentHTML('beforeend', S.fn.channelOrderLineRow(rows.length));
        S.fn.updateChannelOrderTotal(container.closest('[data-form="channel-order-create"]'));
      } else S.fn.toast('Đã đạt giới hạn', 'Mỗi đơn kênh có thể có tối đa 100 dòng.', 'error');
    }
    else if (action === 'remove-channel-order-line') {
      const container = document.getElementById('channel-order-lines');
      const row = button.closest('[data-channel-order-line]');
      if (container && row && container.querySelectorAll('[data-channel-order-line]').length > 1) {
        row.remove();
        container.querySelectorAll('[data-channel-order-line]').forEach((item, index) => {
          const quantity = item.querySelector('[data-channel-order-quantity]');
          const price = item.querySelector('[data-channel-order-price]');
          const remove = item.querySelector('[data-action="remove-channel-order-line"]');
          if (quantity) quantity.setAttribute('aria-label', `Số lượng dòng ${index + 1}`);
          if (price) price.setAttribute('aria-label', `Đơn giá dòng ${index + 1}`);
          if (remove) remove.setAttribute('aria-label', `Xóa dòng ${index + 1}`);
        });
        S.fn.updateChannelOrderTotal(container.closest('[data-form="channel-order-create"]'));
      }
    }
    else if (action === 'reload-channel-catalog') S.fn.loadChannelCatalog(S.state.channelState.offset);
    else if (action === 'channel-state') { S.state.channelState.state = button.dataset.state === 'archived' ? 'archived' : 'active'; S.fn.loadChannelCatalog(0); }
    else if (action === 'channel-page') S.fn.loadChannelCatalog(Number(button.dataset.offset) || 0);
    else if (action === 'new-product') S.fn.openProduct('');
    else if (action === 'new-product-variant-group') S.fn.openProductVariantGroup();
    else if (action === 'add-product-variant') {
      const container = document.getElementById('product-variant-rows');
      const rows = container ? container.querySelectorAll('[data-product-variant-row]') : [];
      if (container && rows.length < 50) {
        container.insertAdjacentHTML('beforeend', S.fn.productVariantRow(null, rows.length, false, rows.length + 1));
        container.querySelectorAll('[data-action="remove-product-variant"]').forEach(function (item) { item.disabled = false; });
      }
      else S.fn.toast('Đã đạt giới hạn', 'Mỗi nhóm có thể có tối đa 50 biến thể.', 'error');
    }
    else if (action === 'remove-product-variant') {
      const container = document.getElementById('product-variant-rows');
      const row = button.closest('[data-product-variant-row]');
      if (container && row && container.querySelectorAll('[data-product-variant-row]').length > 2) {
        row.remove();
        const rows = Array.from(container.querySelectorAll('[data-product-variant-row]'));
        rows.forEach(function (item, index) {
          const title = item.querySelector('.purchase-line-head strong');
          const removeButton = item.querySelector('[data-action="remove-product-variant"]');
          if (title) title.textContent = `Biến thể ${S.fn.number(index + 1)}`;
          if (removeButton) removeButton.disabled = index < 2 || rows.length <= 2;
        });
      }
    }
    else if (action === 'product-card-menu') S.fn.openProductCardMenu(id);
    else if (action === 'product-card-choice') {
      const product = S.fn.productById(id);
      if (!product) return;
      const kind = button.dataset.kind;
      const canEdit = S.fn.hasPerm('editProducts');
      const canViewHistory = S.fn.hasPerm('viewCostPrice') || S.fn.hasPerm('editProducts') || S.fn.hasPerm('viewReports');
      if (kind === 'detail') S.fn.requestCloseModal(() => S.fn.openProductDetail(id));
      else if (kind === 'add-units' && canEdit) S.fn.requestCloseModal(() => S.fn.openAddProductUnits(id));
      else if (kind === 'serials' && product.serialTracked) S.fn.requestCloseModal(() => S.fn.openProductSerials(id));
      else if (kind === 'edit' && canEdit) S.fn.requestCloseModal(() => S.fn.openProduct(id));
      else if (kind === 'print') S.fn.requestCloseModal(() => S.fn.openBarcodePrintModal([{ ...product, copies: 1 }]));
      else if (kind === 'history' && canViewHistory) S.fn.requestCloseModal(() => S.fn.openProductPriceHistory(id));
      else if (kind === 'stock' && S.fn.hasPerm('manageInventory') && product.inventoryTracked) S.fn.requestCloseModal(() => S.fn.openStockAdjust(id));
    }
    else if (action === 'edit-product') S.fn.openProduct(id);
    else if (action === 'add-product-units') {
      if (S.dom.modal.hidden) S.fn.openAddProductUnits(id);
      else S.fn.requestCloseModal(() => S.fn.openAddProductUnits(id));
    }
    else if (action === 'view-product-serials') {
      if (S.dom.modal.hidden) S.fn.openProductSerials(id);
      else S.fn.requestCloseModal(() => S.fn.openProductSerials(id));
    }
    else if (action === 'filter-product-serials') S.fn.openProductSerials(id, button.dataset.status || 'all');
    else if (action === 'open-transfer-serials') S.fn.openTransferSerialsModal(id);
    else if (action === 'open-legal') S.fn.openLegalModal(button.dataset.kind || 'terms');
    else if (action === 'select-bt-printer') {
      const addr = button.dataset.address || '';
      const name = button.dataset.name || addr;
      if (addr && window.SlinkEscPosPrinter?.selectBluetoothPrinter) {
        window.SlinkEscPosPrinter.selectBluetoothPrinter(addr, name).then(() => {
          S.fn.closeModal();
          S.fn.toast('Đã chọn máy in Bluetooth', name);
          if (S.state.page === 'settings') S.fn.render();
        }).catch(err => S.fn.toast('Không lưu được máy in', err.message, 'error'));
      }
    }
    else if (action === 'print-product-serials') {
      const product = S.fn.productById(id) || S.state.inventoryProducts.find(item => item.id === id);
      let codes = [];
      try { codes = JSON.parse(S.dom.modal.dataset.productSerialsCache || '[]'); } catch {}
      if (product && codes.length) {
        S.fn.requestCloseModal(() => S.fn.openBarcodePrintModal(codes.map(code => ({ ...product, barcode: code, copies: 1 }))));
      }
    }
    else if (action === 'switch-product-stock-mode') {
      S.fn.switchQuickProductMode(button.closest('form'), button.dataset.mode);
    }
    else if (action === 'switch-add-units-mode') {
      const form = button.closest('form');
      if (!form) return;
      const mode = button.dataset.mode === 'serial' ? 'serial' : 'quantity';
      form.dataset.mode = mode;
      form.querySelectorAll('[data-action="switch-add-units-mode"]').forEach(btn => {
        const active = btn.dataset.mode === mode;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      const ser = form.querySelector('[data-add-units-panel="serial"]');
      const qty = form.querySelector('[data-add-units-panel="quantity"]');
      if (ser) ser.hidden = mode !== 'serial';
      if (qty) qty.hidden = mode !== 'quantity';
      if (mode === 'serial') form.querySelector('#serial-rapid-input')?.focus();
      else { S.fn.closeSerialCamera(); form.querySelector('#add-units-qty')?.focus(); }
    }
    else if (action === 'add-serial-from-input') {
      const form = button.closest('form');
      const input = form?.querySelector('#serial-rapid-input');
      if (!form || !input) return;
      const res = S.fn.appendFormSerialCode(form, input.value);
      if (!res.ok) S.fn.toast('Chưa thêm được mã', res.reason, 'error');
      else input.value = '';
      input.focus();
    }
    else if (action === 'remove-form-serial') {
      S.fn.removeFormSerialCode(button.closest('form'), Number(button.dataset.index));
    }
    else if (action === 'autogen-form-serials') {
      const form = button.closest('form');
      if (!form) return;
      S.fn.autoGenerateFormSerials(form, form.querySelector('#serial-auto-count')?.value, form.querySelector('#serial-auto-prefix')?.value);
    }
    else if (action === 'scan-serial-list') {
      const form = button.closest('form');
      const surface = form?.querySelector('[data-scan-mode="serial-list"]');
      if (!surface) return;
      surface.hidden = false;
      S.fn.startScanCamera(surface);
    }
    else if (action === 'stop-serial-camera') S.fn.closeSerialCamera();
    else if (action === 'cart-remove-serial') S.fn.removeSerialFromCart(id, button.dataset.code || '');
    else if (action === 'quick-create-from-receive') {
      const code = button.dataset.barcode || '';
      S.fn.requestCloseModal(() => S.fn.openQuickProduct({ barcode: code, focusName: true }));
    }
    else if (action === 'add-product-to-existing-variant-group') S.fn.openProductVariantAdd(id);
    else if (action === 'product-price-history') S.fn.openProductPriceHistory(id);
    else if (action === 'load-more-product-price-history') S.fn.loadMoreProductPriceHistory();
    else if (action === 'new-customer') S.fn.openCustomer('');
    else if (action === 'save-customer-segment') S.fn.openSaveCustomerSegment();
    else if (action === 'delete-customer-segment') S.fn.openDeleteCustomerSegment(id);
    else if (action === 'new-supplier') S.fn.openSupplier();
    else if (action === 'edit-customer') { S.fn.closeModal(); S.fn.openCustomer(id); }
    else if (action === 'customer-detail') S.fn.openCustomerDetail(id);
    else if (action === 'collect-customer-payment') S.fn.openCollectCustomerPayment(id);
    else if (action === 'customer-tag-remove') S.fn.changeCustomerTag(id, 'remove', button.dataset.tag || '');
    else if (action === 'retry-customer-tag') S.fn.sendPendingCustomerTag(id);
    else if (action === 'order-detail') S.fn.openOrder(id);
    else if (action === 'load-older-order-notes') S.fn.loadOlderOrderNotes(id);
    else if (action === 'order-tag-remove') S.fn.changeOrderTag(id, 'remove', button.dataset.tag || '');
    else if (action === 'retry-order-mutation') S.fn.sendPendingOrderMutation(id);
    else if (action === 'void-order') S.fn.openVoidOrder(id);
    else if (action === 'manage-promotions') S.fn.openPromotions();
    else if (action === 'new-promotion') S.fn.openPromotionCreate();
    else if (action === 'archive-promotion') S.fn.archivePromotion(id);
    else if (action === 'purchase-detail') S.fn.openPurchaseDetail(id);
    else if (action === 'purchase-order-detail') S.fn.openPurchaseOrderDetail(id);
    else if (action === 'new-purchase-order') S.fn.openPurchaseOrder('');
    else if (action === 'edit-purchase-order') S.fn.openPurchaseOrder(id);
    else if (action === 'place-purchase-order') S.fn.placePurchaseOrder(id);
    else if (action === 'cancel-purchase-order') S.fn.openCancelPurchaseOrder(id);
    else if (action === 'receive-purchase-order') S.fn.openPurchaseOrderReceipt(id);
    else if (action === 'add-order-line') S.fn.addPurchaseOrderLine();
    else if (action === 'remove-order-line') S.fn.removePurchaseOrderLine(Number(button.dataset.index));
    else if (action === 'return-order') S.fn.openReturn(id);
    else if (action === 'collect-payment') S.fn.openCollectPayment(id);
    else if (action === 'print-order') S.fn.printOrder(id);
    else if (action === 'share-order') S.fn.showDigitalReceipt(id, false);
    else if (action === 'latest-receipt') S.fn.openOrder(id, true);
    else if (action === 'latest-receipt-png') {
      if (!id) return;
      if (id.startsWith('local:')) return S.fn.openLocalOrder(id.slice(6));
      S.fn.openOrder(id, true).then(function () {
        if (!S.dom.modal.hidden) {
          const btn = S.dom.modal.querySelector('[data-action="receipt-share-png"]');
          if (btn && !btn.disabled) S.fn.useDigitalReceipt('receipt-share-png', btn);
        }
      });
    }
    else if (action === 'share-debt-qr-png') S.fn.shareOrDownloadDebtQr(false);
    else if (action === 'download-debt-qr-png') S.fn.shareOrDownloadDebtQr(true);
    else if (action === 'rapid-stock-count') S.fn.openRapidStockCount();
    else if (action === 'clear-rapid-stock-count') { S.state.rapidStockCountState.items = []; S.fn.renderRapidStockCountRows(); }
    else if (action === 'rapid-count-delta') {
      const idx = Number(button.dataset.index);
      const delta = Number(button.dataset.delta || 0);
      const item = S.state.rapidStockCountState.items[idx];
      if (item) {
        item.counted = Math.max(0, Math.round((Number(item.counted || 0) + delta) * 1000) / 1000);
        S.fn.renderRapidStockCountRows();
      }
    }
    else if (action === 'add-rapid-stock-count-code') {
      const inp = S.dom.modal.querySelector('#rapid-stock-count-input');
      const code = inp?.value.trim() || '';
      if (code) {
        inp.value = '';
        S.fn.handleRapidStockCountScan(code).then(res => {
          if (res?.ok) { window.SlinkPosHardware?.vibrate(45); S.fn.playScanBeep(); }
          else if (res?.reason) S.fn.toast('Không thêm được', res.reason, 'error');
          inp.focus();
        });
      }
    }
    else if (action === 'toggle-receive-camera') {
      const surface = S.dom.modal.querySelector('[data-scan-mode="receive-cart"]');
      if (!surface) return;
      if (!surface.hidden) { S.fn.stopScanCamera(); surface.hidden = true; }
      else { surface.hidden = false; S.fn.startScanCamera(surface); }
    }
    else if (action === 'stop-receive-camera') {
      const surface = S.dom.modal.querySelector('[data-scan-mode="receive-cart"]');
      S.fn.stopScanCamera();
      if (surface) surface.hidden = true;
    }
    else if (action === 'open-warranty-lookup') S.fn.openWarrantyLookupModal('');
    else if (action === 'lookup-serial-warranty') S.fn.openWarrantyLookupModal(button.dataset.code || '');
    else if (action === 'toggle-warranty-camera') {
      const surface = S.dom.modal.querySelector('[data-scan-mode="warranty-lookup"]');
      if (!surface) return;
      if (!surface.hidden) { S.fn.stopScanCamera(); surface.hidden = true; }
      else { surface.hidden = false; S.fn.startScanCamera(surface); }
    }
    else if (action === 'stop-warranty-camera') {
      const surface = S.dom.modal.querySelector('[data-scan-mode="warranty-lookup"]');
      S.fn.stopScanCamera();
      if (surface) surface.hidden = true;
    }
    else if (action === 'reset-member-perms') {
      const roleVal = document.querySelector(`[data-member-role='${CSS.escape(id)}']`)?.value || 'cashier';
      const eff = S.fn.resolveEffectivePermissions(roleVal, null, null);
      document.querySelectorAll(`[data-member-perm='${CSS.escape(id)}']`).forEach(function (el) {
        const k = el.dataset.permKey;
        if (k === 'pos_max_discount_pct') el.value = String(eff.pos_max_discount_pct ?? 0);
        else if (k) el.checked = Boolean(eff[k]);
      });
      S.fn.toast('Đã đặt lại quyền theo vai trò', S.fn.staffRoleName(roleVal));
    }
    else if (action === 'dashboard-open-low-stock') {
      S.state.inventoryTab = 'stock';
      S.state.inventoryStockFilter = 'low';
      S.fn.routeTo('inventory');
    }
    else if (action === 'dashboard-open-debts') {
      if (S.fn.canAccessRoute('finance') && (S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports'))) {
        S.state.financeTab = 'receivables';
        S.fn.routeTo('finance');
      } else if (S.fn.canAccessRoute('customers')) {
        S.state.customerSegmentFilter = 'owing';
        S.fn.routeTo('customers');
      }
    }
    else if (action === 'dashboard-open-orders') {
      S.state.orderFilter = 'Còn nợ';
      S.fn.routeTo('orders');
    }
    else if (action === 'dashboard-open-shifts') {
      S.state.financeTab = 'shifts';
      S.fn.routeTo('finance');
    }
    else if (action === 'reload-integrations') S.fn.loadIntegrationStatus(true);
    else if (action === 'partner-connect') S.fn.showPartnerUnconnectedNotice?.(button.dataset.partnerName || '');
    else if (['lp-stage-view', 'lp-industry', 'lp-scroll'].includes(action)) S.fn.handleLandingAction(action, button);
    else if (action === 'verify-ghn-token') S.fn.verifyGhnIntegrationToken(button);
    else if (action === 'clear-integration-cred') S.fn.clearIntegrationCredential(button.dataset.credKey, button);
    else if (action === 'copy-integration-url') {
      const value = button.dataset.copyValue || '';
      if (value) navigator.clipboard?.writeText(value).then(() => S.fn.toast('Đã sao chép liên kết', value)).catch(() => S.fn.toast('Sao chép thủ công', value));
    }
    else if (['escpos-connect', 'escpos-test-print', 'escpos-kick-drawer', 'escpos-print-order'].includes(action)) S.fn.handleEscPosAction(action, id);
    else if (['issue-order-einvoice', 'create-order-shipping', 'preview-order-shipping', 'create-order-momo', 'create-order-vnpay'].includes(action)) S.fn.handleOrderIntegrationAction(action, id, button);
    else if (['receipt-share', 'receipt-copy', 'receipt-download', 'receipt-share-png', 'receipt-download-png'].includes(action)) S.fn.useDigitalReceipt(action, button);
    else if (action === 'download-reports-csv') S.fn.downloadReportsCsv();
    else if (action === 'print-reports-pdf') S.fn.printReportsPdf();
    else if (action === 'add-cart') S.fn.addToCart(id);
    else if (action === 'cart-qty') S.fn.setCartQty(id, Number(button.dataset.delta));
    else if (action === 'cart-qty-edit') S.fn.editCartQuantity(id);
    else if (action === 'checkout') S.fn.openCheckout();
    else if (action === 'change-task-focus') S.fn.openTaskFocusOnboarding();
    else if (action === 'apply-promotion') S.fn.applyCheckoutPromotion();
    else if (action === 'add-tender') {
      if (S.state.checkoutPendingPayload) return S.fn.toast('Đơn đang chờ xác nhận', 'Không thể đổi các khoản thanh toán của đơn đã gửi.', 'error');
      const form = S.dom.modal.querySelector('[data-form="checkout"]');
      if (!form) return;
      const tenders = S.fn.checkoutTenderValues(form);
      if (tenders.length >= 5) return S.fn.toast('Đã đạt giới hạn', 'Mỗi đơn có thể chia tối đa 5 phương thức thanh toán.', 'error');
      const used = new Set(tenders.map(function (tender) { return tender.method; }));
      const nextMethod = S.state.checkoutMethods.find(function (method) { return !used.has(method[0]); });
      if (!nextMethod) return S.fn.toast('Đã có đủ phương thức', 'Mỗi phương thức chỉ được thêm một lần.', 'error');
      tenders.push({ method: nextMethod[0], amountReceivedVnd: '0' });
      S.fn.renderCheckoutTenders(form, tenders);
      const nextSelect = form.querySelector(`#tender-method-${tenders.length - 1}`);
      if (nextSelect) nextSelect.focus();
    }
    else if (action === 'remove-tender') {
      if (S.state.checkoutPendingPayload) return;
      const form = S.dom.modal.querySelector('[data-form="checkout"]');
      if (!form) return;
      const tenders = S.fn.checkoutTenderValues(form);
      tenders.splice(Number(button.dataset.index), 1);
      S.fn.renderCheckoutTenders(form, tenders.map(function (tender) { return { method: tender.method, amountReceivedVnd: tender.amountText }; }));
    }
    else if (action === 'pick-customer') S.fn.pickCustomer();
    else if (action === 'select-customer') {
      if (S.state.checkoutPendingPayload) return S.fn.toast('Đang chờ xác nhận đơn', 'Hãy kiểm tra đơn đang chờ trước khi đổi khách hàng.', 'error');
      const discBps = Number(button.dataset.discountBps) || 0;
      const addr = button.dataset.address || '';
      if (id && !S.state.store.customers.some(function (customer) { return customer.id === id; })) {
        S.state.store.customers.push({ id, name: button.dataset.name || '', phone: button.dataset.phone || '', discountRateBps: discBps, shippingAddress: addr });
      }
      S.state.cartCustomerId = id || '';
      S.state.posRedeemPointsActive = false;
      S.state.posBundlePriorDebtActive = false;
      if (id) {
        const cust = S.fn.customerById(id);
        const rateBps = cust?.discountRateBps || discBps;
        const totalsNow = S.fn.cartTotals();
        const sub = totalsNow.subtotal;
        if (rateBps > 0 && sub > 0 && !S.state.cart.discount) {
          const cap = Math.max(0, S.fn.maxAllowedDiscountVnd(sub) - totalsNow.lineDiscount);
          const autoDisc = Math.round(sub * rateBps / 10000);
          S.state.cart.discount = Math.min(cap, autoDisc);
        }
        const shipAddr = cust?.shippingAddress || addr;
        if (shipAddr && !S.state.posDelivery.address) S.state.posDelivery.address = shipAddr;
        S.fn.loadPosCustomerAssistant({ customerId: id });
      } else {
        S.state.posAssistantState.data = null;
      }
      S.fn.closeModal(); S.state.page = 'pos'; S.fn.render();
    }
    else if (action === 'retry-pending-sale') S.fn.openCheckout();
    else if (action === 'new-customer-from-pos') { S.fn.closeModal(); S.fn.openCustomer(''); }
    else if (action === 'offline-records') S.fn.openOfflineRecords().catch(error => S.fn.toast('Chưa mở được chứng từ', error.message, 'error'));
    else if (action === 'offline-inspect-conflict') S.fn.inspectOfflineConflict(id, button);
    else if (action === 'offline-export') S.fn.exportOfflineRecords().catch(error => S.fn.toast('Chưa lưu được bản đối chiếu', error.message, 'error'));
    else if (action === 'offline-sync') { S.fn.closeModal(); S.fn.startOfflineSync().then(S.fn.prepareOfflineData); }
    else if (action === 'offline-retry') { S.state.offlineConflictInspections.delete(button.dataset.id); S.state.offlineDisk.retry(S.fn.activeOfflineScope(), button.dataset.id).then(() => { S.fn.closeModal(); S.fn.startOfflineSync(); }).catch(error => S.fn.toast('Chưa thử lại được', error.message, 'error')); }
    else if (action === 'pos-mode') {
      const rawNext = button.dataset.mode;
      const next = rawNext === 'fast' ? 'standard' : rawNext;
      if (['standard', 'delivery'].includes(next) && next !== S.state.posMode) {
        S.state.posMode = next;
        S.state.posFastCashInput = '';
        if (next === 'delivery' && S.state.cartCustomerId) {
          const c = S.fn.customerById(S.state.cartCustomerId);
          if (c) {
            if (!S.state.posDelivery.receiverName) S.state.posDelivery.receiverName = c.name || '';
            if (!S.state.posDelivery.receiverPhone) S.state.posDelivery.receiverPhone = c.phone || '';
          }
        }
        S.fn.render();
      }
    }
    else if (action === 'fast-cash-preset') { S.state.posFastCashInput = String(button.dataset.amount || ''); S.fn.refreshCartPanels(); }
    else if (action === 'fast-pay') S.fn.quickFastPaySale(button.dataset.method, button);
    else if (action === 'standard-method') {
      S.state.posStandardMethod = button.dataset.method || 'cash';
      S.state.posFastCashInput = '';
      if (S.state.posStandardMethod === 'bank_transfer' && !S.state.integrationState.data && !S.state.integrationState.loading) S.fn.loadIntegrationStatus(false);
      S.fn.refreshCartPanels();
    }
    else if (action === 'standard-pay') S.fn.standardPaySale(button);
    else if (action === 'pos-show-vietqr') S.fn.openPosVietQrModal();
    else if (action === 'pos-confirm-vietqr') { S.state.posStandardMethod = 'bank_transfer'; S.fn.closeModal(); S.fn.standardPaySale(button); }
    else if (action === 'pos-bill-switch') S.fn.switchPosBill(button.dataset.billId);
    else if (action === 'pos-bill-add') S.fn.addPosBill();
    else if (action === 'pos-bill-close') S.fn.closePosBill(button.dataset.billId);
    else if (action === 'pos-view-mode') {
      const mode = button.dataset.mode === 'list' ? 'list' : 'grid';
      if (S.state.posViewMode !== mode) { S.state.posViewMode = mode; S.fn.render(); }
    }
    else if (action === 'pos-toggle-voice') {
      const next = S.state.posPrefs?.voiceAnnounce === false;
      S.fn.savePosPrefs({ ...(S.state.posPrefs || {}), voiceAnnounce: next });
      S.fn.render();
      S.fn.toast(next ? 'Đã bật loa đọc tiền' : 'Đã tắt loa đọc tiền');
    }
    else if (action === 'exit-pos') {
      const fallback = S.fn.canAccessRoute('dashboard') ? 'dashboard' : (S.fn.canAccessRoute('orders') ? 'orders' : S.fn.defaultHomeRouteForRole());
      S.fn.routeTo(fallback);
    }
    else if (action === 'pos-line-discount') S.fn.openLineDiscountModal(id);
    else if (action === 'product-detail') S.fn.openProductDetail(id);
    else if (action === 'product-detail-tab') S.fn.switchProductDetailTab(button.dataset.tab || 'info');
    else if (action === 'batch-print-barcodes') S.fn.batchPrintSelectedBarcodes();
    else if (action === 'batch-export-products') S.fn.batchExportSelectedProducts();
    else if (action === 'batch-clear-products') S.fn.clearSelectedProducts();
    else if (action === 'dismiss-onboarding') { S.state.onboardingDismissed = true; S.fn.render(); }
    else if (action === 'report-tab') { S.state.reportTab = button.dataset.tab || 'eod'; S.fn.render(); }
    else if (action === 'report-preset') { S.fn.loadAnalytics({ preset: button.dataset.preset || '7d' }); }
    else if (action === 'report-custom-range') {
      const from = document.getElementById('report-from')?.value || '';
      const to = document.getElementById('report-to')?.value || '';
      if (!from || !to || from > to) return S.fn.toast('Khoảng ngày chưa hợp lệ', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.', 'error');
      S.fn.loadAnalytics({ preset: 'custom', from, to });
    }
    else if (action === 'submit-delivery-sale') S.fn.submitDeliverySale(button);
    else if (action === 'pos-scan') S.fn.openPosBarcodeScanner();
    else if (action === 'product-scan') S.fn.openProductBarcodeSearchModal();
    else if (action === 'print-barcode-single') {
      const prod = S.fn.productById(id) || S.state.inventoryProducts.find(item => item.id === id);
      if (prod) S.fn.openBarcodePrintModal([{ ...prod, copies: 1 }]);
    }
    else if (action === 'print-barcode-batch') S.fn.openBarcodePrintModal();
    else if (action === 'print-barcode-purchase') {
      const pur = S.state.purchaseHistory.find(item => item.id === id);
      if (!pur) return;
      S.fn.ensureCatalogProducts().then(function (catalog) {
        const byId = new Map(catalog.map(function (c) { return [c.id, c]; }));
        const items = pur.items.map(function (line) {
          const prod = S.fn.productById(line.productId) || byId.get(line.productId);
          return {
            id: line.productId,
            name: line.productName || prod?.name || 'Mặt hàng',
            sku: line.sku || prod?.sku || '',
            barcode: prod?.barcode || line.sku || '',
            price: prod?.price ?? 0,
            copies: Math.max(1, Math.min(200, Math.round(Number(line.quantity) || 1))),
          };
        });
        S.fn.closeModal();
        S.fn.openBarcodePrintModal(items);
      });
    }
    else if (action === 'confirm-print-barcodes') S.fn.triggerBarcodePrintNow();
    else if (action === 'barcode-select-all' || action === 'barcode-select-none') {
      const checked = action === 'barcode-select-all';
      S.dom.modal.querySelectorAll('[data-barcode-print-row]').forEach(function (row) {
        if (row.hidden) return;
        const box = row.querySelector('[name="selected"]');
        if (box) box.checked = checked;
      });
      S.fn.updateBarcodePrintPreview();
    }
    else if (action === 'inventory-tab') {
      S.state.inventoryTab = button.dataset.tab || 'stock';
      if (S.state.inventoryTab === 'purchases' && !S.state.financeDataReady) S.fn.loadFinancePage().then(() => { if (S.state.page === 'inventory' && S.state.inventoryTab === 'purchases') S.fn.render(); });
      if (S.state.inventoryTab === 'supplier-returns') S.fn.loadSupplierReturns();
      S.fn.render();
    }
    else if (action === 'reload-inventory-purchases') S.fn.loadFinancePage().then(() => { if (S.state.page === 'inventory') S.fn.render(); });
    else if (action === 'reload-supplier-returns') S.fn.loadSupplierReturns();
    else if (action === 'new-supplier-return') S.fn.openSupplierReturnModal();
    else if (action === 'exchange-order') S.fn.openOrderExchange(id);
    else if (action === 'open-cart') S.fn.setCartDrawerOpen(true);
    else if (action === 'close-cart') S.fn.setCartDrawerOpen(false);
    else if (action === 'add-more-products') S.fn.addMoreProducts();
    else if (action === 'category') { S.state.categoryFilter = button.dataset.category; S.fn.render(); }
    else if (action === 'chart-range') { S.state.chartRange = button.dataset.range; S.fn.loadAnalytics(S.state.chartRange === '30 ngày' ? 30 : 7); }
    else if (action === 'order-filter') {
      S.state.orderFilter = button.dataset.filter;
      S.fn.loadOrdersPage(S.state.searchTerms.orders, 0).then(S.fn.render);
    }
    else if (action === 'new-expense') S.fn.openExpense(button.dataset.direction);
    else if (action === 'open-cash-session') S.fn.openCashSessionForm();
    else if (action === 'close-cash-session') S.fn.openCashSessionCloseForm();
    else if (action === 'supplier-payment') S.fn.openSupplierPayment(id);
    else if (action === 'supplier-balance') S.fn.openSupplierBalance(id);
    else if (action === 'receive-stock') S.fn.openReceive(id);
    else if (action === 'new-warehouse') S.fn.openNewWarehouse();
    else if (action === 'archive-warehouse') S.fn.openArchiveWarehouse(id);
    else if (action === 'new-warehouse-transfer') S.fn.openWarehouseTransfer();
    else if (action === 'add-transfer-line') S.fn.addTransferLine();
    else if (action === 'remove-transfer-line') S.fn.removeTransferLine(Number(button.dataset.index));
    else if (action === 'transfer-dispatch') S.fn.dispatchWarehouseTransfer(id);
    else if (action === 'transfer-receive') S.fn.openTransferReceipt(id);
    else if (action === 'transfer-cancel') S.fn.openTransferCancel(id);
    else if (action === 'add-purchase-line') S.fn.addReceivePurchaseLine();
    else if (action === 'remove-purchase-line') S.fn.removeReceivePurchaseLine(Number(button.dataset.index));
    else if (action === 'toggle-receive-price') S.fn.toggleReceivePurchasePrice(button);
    else if (action === 'adjust-stock') S.fn.openStockAdjust(id);
    else if (action === 'adjust-stock-picker') S.fn.openStockAdjustPicker();
    else if (action === 'bulk-stock-count') S.fn.openStockBulkCount();
    else if (action === 'inventory-low') { S.state.searchTerms.inventory = ''; S.fn.render(); const first = S.fn.lowStockProducts()[0]; if (first) S.fn.openStockAdjust(first.id); }
    else if (action === 'discount') S.fn.showDiscount();
    else if (action === 'pos-proforma') S.fn.printProformaBill();
    else if (action === 'pos-quick-return') { S.fn.routeTo('orders'); S.fn.toast('Chọn đơn cần đổi / trả hàng'); }
    else if (action === 'expense-quick-note') {
      const form = button.closest('form');
      if (form?.elements?.note) { form.elements.note.value = button.dataset.note || ''; form.elements.note.focus(); }
    }
    else if (action === 'quick-discount') {
      const form = button.closest('form');
      if (form) {
        if (form.elements.discountMode) form.elements.discountMode.value = button.dataset.mode || 'vnd';
        if (form.elements.discount) form.elements.discount.value = button.dataset.value || '0';
      }
    }
    else if (action === 'scan') S.fn.showScan();
    else if (action === 'scan-channel-order') S.fn.showChannelOrderScanner();
    else if (action === 'start-camera-scan') S.fn.startScanCamera(button);
    else if (action === 'capture-scan-photo') S.fn.captureScanPhoto();
    else if (action === 'create-product-from-scan') S.fn.openProductFromScan('', '', '');
    else if (action === 'open-export') S.fn.openExportDialog();
    else if (action === 'export-dataset') {
      const dataset = S.dom.modal.querySelector('#export-dataset')?.value || '';
      const from = S.dom.modal.querySelector('#export-from')?.value || '';
      const to = S.dom.modal.querySelector('#export-to')?.value || '';
      const warehouseId = S.dom.modal.querySelector('#export-warehouse')?.value || '';
      if (from && to && from > to) return S.fn.toast('Khoảng ngày chưa hợp lệ', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.', 'error');
      S.fn.closeModal();
      S.fn.exportCsv(dataset, from, to, button, warehouseId);
    }
    else if (action === 'export-csv') S.fn.exportCsv(button.dataset.dataset || 'products', '', '', button);
    else if (action === 'export-customers') S.fn.exportCsv('customers', '', '', button);
    else if (action === 'settings-tab') { S.dom.modal.querySelectorAll('.settings-tab').forEach(function (el) { el.classList.toggle('active', el === button); }); }
    else if (action === 'archive-product') S.fn.archiveProduct(id);
    else if (action === 'new-staff-invite') S.fn.openStaffInvite();
    else if (action === 'new-staff-direct') S.fn.openStaffDirectCreateModal();
    else if (action === 'staff-role-filter') {
      S.state.staffRoleFilter = button.dataset.role || '';
      S.fn.render();
    }
    else if (action === 'staff-subtab') {
      const nextSub = button.dataset.subtab || 'members';
      if (nextSub !== S.state.staffSubTab) {
        S.state.staffSubTab = nextSub;
        S.fn.render();
        S.fn.loadStaffPage();
      }
    }
    else if (action === 'test-pos-voice') {
      if (window.SlinkPosHardware && typeof window.SlinkPosHardware.playTingTing === 'function') {
        window.SlinkPosHardware.playTingTing(150000).catch(function () {});
      }
      S.fn.toast('Đã phát âm thanh thử', 'Kiểm tra loa điện thoại hoặc máy tính.');
    }
    else if (action === 'reload-payroll') S.fn.loadStaffPayroll();
    else if (action === 'reload-radar') S.fn.loadLossPreventionRadar();
    else if (action === 'open-staff-advance') S.fn.openStaffAdvanceModal(id);
    else if (action === 'settle-staff-payroll') S.fn.settleStaffPayroll(id, button);
    else if (action === 'share-staff-payslip-png') S.fn.shareStaffPayslipPng(id);
    else if (action === 'toggle-waive-shortage') S.fn.toggleWaiveShortage(id, button.dataset.waived === 'true');
    else if (action === 'pos-select-seller') {
      S.state.posSellerId = id || '';
      S.fn.refreshCartPanels();
    }
    else if (action === 'pos-clear-customer') {
      S.state.cartCustomerId = '';
      S.state.posCustomerInlineText = '';
      S.state.posAssistantState.data = null;
      S.state.posRedeemPointsActive = false;
      S.state.posBundlePriorDebtActive = false;
      S.fn.refreshCartPanels();
    }
    else if (action === 'pos-toggle-redeem-points') {
      S.state.posRedeemPointsActive = !S.state.posRedeemPointsActive;
      S.state.posFastCashInput = '';
      S.fn.refreshCartPanels();
    }
    else if (action === 'pos-toggle-bundle-debt') {
      S.state.posBundlePriorDebtActive = !S.state.posBundlePriorDebtActive;
      S.state.posFastCashInput = '';
      S.fn.refreshCartPanels();
    }
    else if (action === 'save-staff-member') S.fn.saveStaffMember(id);
    else if (action === 'staff-activity') S.fn.openStaffActivity(id);
    else if (action === 'resend-staff-invite') S.fn.resendStaffInvite(id);
    else if (action === 'revoke-staff-invite') S.fn.revokeStaffInvite(id);
    else if (action === 'reload-staff') { S.fn.closeModal(); S.fn.loadStaffPage(); }
    else if (action === 'reload-audit') S.fn.loadAuditEvents(null, S.state.auditState.offset);
    else if (action === 'audit-page') S.fn.loadAuditEvents(null, Number(button.dataset.offset) || 0);
    else if (action === 'finance-filter') { const type = button.dataset.filter; const rows = S.state.store.cashbook.filter(function (m) { return m.type === type; }); S.fn.modalForm('Sổ quỹ đã lọc', type === 'in' ? 'Phiếu thu' : 'Phiếu chi', `<section class='panel'><div class='table-wrap'><table class='data-table'><thead><tr><th>Khoản mục</th><th>Thời gian</th><th class='text-right'>Số tiền</th></tr></thead><tbody>${rows.map(function (m) { return `<tr><td>${S.fn.esc(m.category)}</td><td>${S.fn.humanDate(m.createdAt, true)}</td><td class='text-right'>${S.fn.moneyVndText(m.amountVnd)}</td></tr>`; }).join('')}</tbody></table></div></section>`, 'Đóng', true); }
    else if (action === 'open-upgrade') S.fn.showModal('Slink Pro', 'Một số dịch vụ nâng cao cần được cấu hình trước khi sử dụng.', `<div class='notice-item'><span>${S.fn.icon('help', 18)}</span><span><strong>Đang dùng bản trải nghiệm</strong><small>Đồng bộ khi mất mạng, kết nối thanh toán và sao lưu tự động cần máy chủ và nhà cung cấp tương ứng.</small></span></div>`, `<button class='btn btn-primary' data-action='close-modal'>Đã hiểu</button>`);
  });

  document.addEventListener('input', function (event) {
    if (event.target.matches('[data-barcode-filter]')) {
      const q = event.target.value.trim().toLocaleLowerCase('vi');
      S.dom.modal.querySelectorAll('[data-barcode-print-row]').forEach(function (row) {
        row.hidden = Boolean(q && !(row.dataset.search || '').includes(q));
      });
      return;
    }
    if (event.target.id === 'product-barcode') {
      const preview = event.target.form?.querySelector('[data-barcode-field-preview]');
      if (preview) {
        const html = S.fn.barcodePreviewHtml(event.target.value);
        preview.innerHTML = html;
        preview.hidden = !html;
      }
      return;
    }
    if (event.target.id === 'staff-search-input') {
      S.state.staffSearchTerm = event.target.value;
      const pos = event.target.selectionStart;
      S.fn.render();
      const el = document.getElementById('staff-search-input');
      if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} }
      return;
    }
    if (event.target.id === 'pos-customer-inline-input') {
      S.state.posCustomerInlineText = event.target.value;
      window.clearTimeout(S.state.posAssistantState.timer);
      const q = S.state.posCustomerInlineText.trim();
      if (!q) {
        S.state.posAssistantState.data = null;
        return;
      }
      S.state.posAssistantState.timer = window.setTimeout(function () {
        S.fn.loadPosCustomerAssistant({ q });
      }, 150);
      return;
    }
    if (event.target.id === 'pos-fast-cash') {
      S.state.posFastCashInput = event.target.value;
      const totals = S.fn.cartTotals();
      const collectTotal = S.fn.posEffectivePayable(totals).grandCollectVnd;
      const entered = S.state.posFastCashInput !== '' ? Number(S.state.posFastCashInput) : collectTotal;
      const valid = Number.isSafeInteger(entered) && entered >= collectTotal;
      const panel = event.target.closest('.cart-panel');
      if (panel) {
        const ch = panel.querySelector('.pos-fast-change');
        if (ch) {
          ch.querySelector('span').textContent = valid ? 'Tiền thối lại' : 'Cần thu thêm';
          ch.querySelector('strong').textContent = S.fn.money(valid ? entered - collectTotal : collectTotal - (Number.isSafeInteger(entered) ? entered : 0));
        }
        panel.querySelectorAll('.pos-fast-chip').forEach(chip => chip.classList.toggle('active', Number(chip.dataset.amount) === entered));
      }
      return;
    }
    if (event.target.matches('[data-delivery-field]')) {
      S.state.posDelivery[event.target.dataset.deliveryField] = event.target.value;
      return;
    }
    if (!event.target.matches('[data-purchase-search]')) S.fn.cancelReceiveProductSearch(event.target.closest('[data-purchase-line]'));
    if (event.target.matches('#cash-session-counted,#cash-session-note')) { S.fn.updateCashClosePreview(event.target.form); return; }
    if (event.target.matches('[data-tender-amount]')) { S.fn.updateCheckoutTenderSummary(event.target.form); return; }
    if (event.target.matches('[data-purchase-quantity],[data-purchase-cost],[data-pack-name],[data-pack-size]')) { S.fn.updateReceivePurchaseTotal(event.target.form); return; }
    if (event.target.matches('[data-order-quantity],[data-order-cost]')) { S.fn.updatePurchaseOrderTotal(event.target.form); return; }
    if (event.target.matches('[data-receipt-quantity]')) { S.fn.updatePurchaseOrderReceiptTotal(event.target.form); return; }
    const id = event.target.id;
    if (event.target.matches('[data-channel-order-quantity],[data-channel-order-price]')) {
      S.fn.updateChannelOrderTotal(event.target.form);
      return;
    }
    if (id === 'channel-order-mapping-search') {
      const query = event.target.value.normalize('NFKC').trim();
      const profileId = document.getElementById('channel-order-profile-id')?.value;
      window.clearTimeout(S.state.channelOrderSearchTimer);
      S.state.channelOrderSearchTimer = window.setTimeout(function () { S.fn.loadChannelOrderCatalog(profileId, query); }, 250);
      return;
    }
    if (id === 'channel-product-search') {
      const query = event.target.value.trim();
      window.clearTimeout(S.state.channelProductSearchTimer);
      S.state.channelProductSearchTimer = window.setTimeout(function () { S.fn.loadChannelProductOptions(query, ''); }, 180);
      return;
    }
    if (id === 'product-search') {
      S.state.searchTerms.products = event.target.value;
      const query = S.state.searchTerms.products;
      window.clearTimeout(S.state.productSearchTimer);
      S.state.productSearchTimer = window.setTimeout(function () {
        if (S.state.page === 'products') S.fn.loadProductsPage(query, 0, { keepSearch: true });
      }, 250);
    }
    else if (id === 'finance-receivable-search') {
      S.state.financeReceivables.query = event.target.value;
      S.state.financeReceivables.ready = false;
      S.state.financeReceivables.requestNumber += 1;
      S.fn.refreshFinanceBody();
      window.clearTimeout(S.state.financeReceivableSearchTimer);
      S.state.financeReceivableSearchTimer = window.setTimeout(function () {
        if (S.state.page === 'finance' && S.state.financeTab === 'receivables') S.fn.loadFinanceReceivables(0);
      }, 250);
    }
    else if (id === 'finance-cashbook-search') {
      S.state.financeCashbook.filters.q = event.target.value;
      S.state.financeCashbook.requestNumber += 1;
      window.clearTimeout(S.state.financeCashbookSearchTimer);
      S.state.financeCashbookSearchTimer = window.setTimeout(function () {
        if (S.state.page === 'finance' && ['cashbook', 'vouchers'].includes(S.state.financeTab)) S.fn.loadFinanceCashbook(0);
      }, 250);
    }
    else if (id === 'finance-payable-search') {
      S.state.financePayables.query = event.target.value;
      S.state.financePayables.ready = false;
      S.state.financePayables.requestNumber += 1;
      S.fn.refreshFinanceBody();
      window.clearTimeout(S.state.financePayableSearchTimer);
      S.state.financePayableSearchTimer = window.setTimeout(function () {
        if (S.state.page === 'finance' && S.state.financeTab === 'payables') S.fn.loadFinancePayables(0);
      }, 250);
    }
    else if (id === 'order-search') {
      S.state.searchTerms.orders = event.target.value;
      const query = S.state.searchTerms.orders;
      const start = event.target.selectionStart;
      window.clearTimeout(S.state.productSearchTimer);
      S.state.productSearchTimer = window.setTimeout(function () {
        S.fn.loadOrdersPage(query, 0).then(function () { if (S.state.page === 'orders') S.fn.render(); const next = document.getElementById(id); if (next) { next.focus(); next.setSelectionRange(start, start); } });
      }, 250);
    }
    else if (id === 'customer-search') {
      S.state.searchTerms.customers = event.target.value;
      const query = S.state.searchTerms.customers;
      const start = event.target.selectionStart;
      window.clearTimeout(S.state.customerSearchTimer);
      S.state.customerSearchTimer = window.setTimeout(function () {
        S.fn.loadCustomersPage(query, 0).then(function () { if (S.state.page === 'customers') S.fn.render(); const next = document.getElementById(id); if (next) { next.focus(); next.setSelectionRange(start, start); } });
      }, 250);
    }
    else if (id === 'supplier-search') {
      S.state.searchTerms.suppliers = event.target.value;
      const start = event.target.selectionStart;
      if (S.state.page === 'suppliers') {
        S.fn.render();
        const next = document.getElementById(id);
        if (next) { next.focus(); try { next.setSelectionRange(start, start); } catch (_) {} }
      }
    }
    else if (id === 'customer-tag-filter') {
      S.state.customerTagFilter = event.target.value;
      const start = event.target.selectionStart;
      window.clearTimeout(S.state.customerSearchTimer);
      S.state.customerSearchTimer = window.setTimeout(function () {
        S.fn.loadCustomersPage(S.state.searchTerms.customers, 0).then(function () {
          if (S.state.page === 'customers') S.fn.render();
          const next = document.getElementById(id);
          if (next) { next.focus(); next.setSelectionRange(start, start); }
        });
      }, 250);
    }
    else if (id === 'customer-min-spent') {
      const rawValue = event.target.value.trim();
      const error = document.getElementById('customer-spend-error');
      const validDigits = rawValue === '' || /^\d{1,19}$/.test(rawValue);
      const normalized = validDigits && rawValue !== '' ? BigInt(rawValue).toString() : '';
      const validRange = rawValue === '' || (validDigits && BigInt(rawValue) <= 9223372036854775807n);
      if (!validRange) {
        event.target.setAttribute('aria-invalid', 'true');
        if (error) { error.textContent = 'Nhập số VND nguyên từ 0 đến 9.223.372.036.854.775.807.'; error.hidden = false; }
        window.clearTimeout(S.state.customerSearchTimer);
        return;
      }
      event.target.removeAttribute('aria-invalid');
      if (error) { error.textContent = ''; error.hidden = true; }
      S.state.customerMinSpentVnd = normalized;
      window.clearTimeout(S.state.customerSearchTimer);
      S.state.customerSearchTimer = window.setTimeout(function () {
        S.fn.loadCustomersPage(S.state.searchTerms.customers, 0).then(function () {
          if (S.state.page === 'customers') S.fn.render();
          const next = document.getElementById(id);
          if (next) next.focus();
        });
      }, 250);
    }
    else if (id === 'inventory-search') {
      S.state.searchTerms.inventory = event.target.value;
      const query = S.state.searchTerms.inventory;
      window.clearTimeout(S.state.productSearchTimer);
      S.state.productSearchTimer = window.setTimeout(() => { if (S.state.page === 'inventory') S.fn.loadInventoryPage(query, 0, { keepSearch: true }); }, 250);
    }
    else if (event.target.matches('[data-purchase-search]')) {
      S.fn.searchReceiveProducts(event.target);
    }
    else if (event.target.matches('[data-order-search]')) {
      const query = event.target.value.trim();
      const requestNumber = ++S.state.purchaseProductRequestNumber;
      const readGeneration = S.state.modalGeneration;
      const lineIndex = event.target.dataset.index;
      window.clearTimeout(S.state.purchaseProductSearchTimer);
      S.state.purchaseProductSearchTimer = window.setTimeout(async function () {
        try {
          const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products?limit=100&q=${encodeURIComponent(query)}`);
          if (requestNumber !== S.state.purchaseProductRequestNumber || readGeneration !== S.state.modalGeneration || S.dom.modal.hidden) return;
          const row = S.dom.modal.querySelector(`[data-order-line][data-index="${lineIndex}"]`);
          const select = row && row.querySelector('[data-order-product]');
          if (!select) return;
          const products = result.products.map(S.fn.mapProduct);
          select.innerHTML = products.map(function (product, index) { return `<option value='${product.id}' data-cost='${product.cost}' ${index === 0 ? 'selected' : ''}>${S.fn.esc(product.name)} · ${S.fn.esc(product.sku)}</option>`; }).join('') || `<option value=''>Không tìm thấy sản phẩm</option>`;
          const selected = products[0];
          const cost = row.querySelector('[data-order-cost]');
          if (selected && cost) cost.value = String(selected.cost);
          S.fn.updatePurchaseOrderTotal(S.dom.modal.querySelector('[data-form="purchase-order"]'));
        } catch (error) {
          if (readGeneration !== S.state.modalGeneration || S.dom.modal.hidden) return;
          if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
          else S.fn.toast('Chưa tìm được sản phẩm', error.message, 'error');
        }
      }, 250);
    }
    else if (event.target.matches('[data-standard-note]')) { S.state.posStandardNote = event.target.value; S.fn.syncActivePosBillFromCart(); }
    else if (id === 'pos-search') S.fn.searchPosProducts(event.target.value);
    else if (id === 'pick-customer-search') {
      const query = event.target.value.trim();
      const requestNumber = ++S.state.pickerCustomerRequestNumber;
      window.clearTimeout(S.state.pickerCustomerSearchTimer);
      S.state.pickerCustomerSearchTimer = window.setTimeout(async function () {
        try {
          const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customers?view=picker&limit=100&q=${encodeURIComponent(query)}`);
          if (requestNumber !== S.state.pickerCustomerRequestNumber || S.dom.modal.hidden) return;
          const customers = result.customers.map(S.fn.mapPosCustomer);
          const options = document.getElementById('customer-options');
          if (options) options.innerHTML = customers.map(function (customer) { return `<button class='customer-option' data-action='select-customer' data-id='${S.fn.esc(customer.id)}' data-name='${S.fn.esc(customer.name)}' data-phone='${S.fn.esc(customer.phone)}' data-discount-bps='${Number(customer.discountRateBps) || 0}' data-address='${S.fn.esc(customer.shippingAddress || '')}'><span class='avatar' style='width:26px;height:26px'>${S.fn.esc(S.fn.initials(customer.name))}</span><span>${S.fn.esc(customer.name)}${customer.discountRateBps > 0 ? ` <small class='badge badge-info'>-${S.fn.number(customer.discountRateBps / 100)}%</small>` : ''}</span><small>${S.fn.esc(customer.phone)}</small></button>`; }).join('') || `<div class='empty-state'>Không tìm thấy khách hàng phù hợp.</div>`;
        } catch (error) {
          if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
          else S.fn.toast('Chưa tìm được khách hàng', error.message, 'error');
        }
      }, 180);
    }
  });

  document.addEventListener('change', function (event) {
    if (event.target.matches('[data-cashbook-filter]')) {
      S.state.financeCashbook.filters[event.target.dataset.cashbookFilter] = event.target.value;
      S.fn.loadFinanceCashbook(0);
      return;
    }
    if (event.target.id === 'finance-payable-only-owing') {
      S.state.financePayables.onlyOwing = Boolean(event.target.checked);
      S.fn.loadFinancePayables(0);
      return;
    }
    if (event.target.matches('[data-delivery-field]')) {
      S.state.posDelivery[event.target.dataset.deliveryField] = event.target.value;
      if (event.target.dataset.deliveryField === 'collection') S.fn.refreshCartPanels();
      return;
    }
    if (event.target.matches('[data-standard-note]')) {
      S.state.posStandardNote = event.target.value;
      S.fn.syncActivePosBillFromCart();
      return;
    }
    if (!event.target.matches('[data-purchase-search]')) S.fn.cancelReceiveProductSearch(event.target.closest('[data-purchase-line]'));
    if (event.target.matches('[data-product-category]')) S.fn.updateProductCategoryField(event.target, true);
    if (event.target.closest('.product-editor-form')) S.fn.updateProductHints(event.target.form);
    if (event.target.id === 'register-workspace') { const field = event.target.form.querySelector('[data-shop-registration]'); const shop = event.target.value === 'shop'; field.hidden = !shop; field.querySelector('input').required = shop; field.querySelector('input').disabled = !shop; return; }
    if (event.target.matches('[data-product-photo-input]')) { S.fn.selectProductPhoto(event.target); return; }
    if (event.target.name === 'businessProfile' && event.target.closest('#business-profile-onboarding')) {
      const form = event.target.closest('#business-profile-onboarding');
      const choices = form.querySelector('.task-focus-choices');
      if (choices) {
        const previousProfile = S.state.store.businessProfile;
        const previousFocus = String(form.querySelector('[name="taskFocusRoute"]:checked')?.value || '');
        S.state.store.businessProfile = event.target.value;
        const available = S.fn.taskFocusOptions();
        const nextFocus = available.some(function (option) { return option.route === previousFocus; }) ? previousFocus : S.fn.defaultTaskFocusRoute();
        choices.innerHTML = S.fn.renderTaskFocusChoices(nextFocus);
        S.state.store.businessProfile = previousProfile;
      }
    }
    if (event.target.id === 'channel-order-profile-id') {
      const search = document.getElementById('channel-order-mapping-search');
      if (search) search.value = '';
      S.state.channelOrderMappingOptions = [];
      S.fn.loadChannelOrderCatalog(event.target.value, '');
      return;
    }
    if (event.target.matches('[data-channel-order-mapping]')) {
      const price = event.target.closest('[data-channel-order-line]')?.querySelector('[data-channel-order-price]');
      if (price) price.value = event.target.selectedOptions[0]?.dataset.price || '0';
      S.fn.updateChannelOrderTotal(event.target.form);
      return;
    }
    if (event.target.matches('[data-member-role]')) {
      const uid = event.target.dataset.memberRole;
      const scope = document.querySelector(`[data-member-scope='${uid}']`);
      if (scope) scope.hidden = event.target.value !== 'stockkeeper';
      const eff = S.fn.resolveEffectivePermissions(event.target.value, null, null);
      document.querySelectorAll(`[data-member-perm='${CSS.escape(uid)}']`).forEach(function (el) {
        const k = el.dataset.permKey;
        if (k === 'pos_max_discount_pct') el.value = String(eff.pos_max_discount_pct ?? 0);
        else if (k) el.checked = Boolean(eff[k]);
      });
      return;
    }
    if (event.target.matches('[data-rapid-count-input]')) {
      const idx = Number(event.target.dataset.rapidCountInput);
      const item = S.state.rapidStockCountState.items[idx];
      if (item) {
        const val = Math.max(0, Number(event.target.value || 0));
        item.counted = Number.isFinite(val) ? val : 0;
        S.fn.renderRapidStockCountRows();
      }
      return;
    }
    if (event.target.matches('[data-member-scope-mode]')) {
      const warehouseList = document.querySelector(`[data-member-warehouse-list='${event.target.dataset.memberScopeMode}']`);
      if (warehouseList) warehouseList.hidden = event.target.value !== 'selected';
      return;
    }
    if (event.target.matches('[data-action="product-select"]')) {
      S.fn.toggleProductSelect(event.target.dataset.id, event.target.checked);
      return;
    }
    if (event.target.matches('[data-action="product-select-all"]')) {
      S.fn.toggleSelectAllProducts(event.target.checked);
      return;
    }
    if (event.target.matches('[data-tender-method]')) { S.fn.updateCheckoutTenderSummary(event.target.form); return; }
    if (event.target.id === 'customer-saved-segment-select') {
      const id = event.target.value;
      if (!id) {
        S.state.selectedCustomerSavedSegmentId = '';
        S.fn.render();
        const next = document.getElementById('customer-saved-segment-select');
        if (next) next.focus();
        return;
      }
      const segment = S.state.customerSavedSegments.find(function (item) { return item.id === id; });
      if (!segment) return;
      S.state.selectedCustomerSavedSegmentId = segment.id;
      S.state.customerSegmentFilter = segment.criteria.segment || '';
      S.state.customerTagFilter = segment.criteria.tag || '';
      S.state.customerMinSpentVnd = segment.criteria.minSpentVnd || '';
      S.fn.loadCustomersPage(S.state.searchTerms.customers, 0).then(function () {
        if (S.state.page === 'customers') S.fn.render();
        const next = document.getElementById('customer-saved-segment-select');
        if (next) next.focus();
      });
      return;
    }
    if (event.target.id === 'customer-segment-filter') {
      S.state.customerSegmentFilter = event.target.value;
      window.clearTimeout(S.state.customerSearchTimer);
      S.fn.loadCustomersPage(S.state.searchTerms.customers, 0).then(function () {
        if (S.state.page === 'customers') S.fn.render();
        const next = document.getElementById('customer-segment-filter');
        if (next) next.focus();
      });
      return;
    }
    if (event.target.id === 'customer-import-file') {
      const readNumber = ++S.state.customerImportReadNumber;
      S.state.customerImportReading = false;
      S.state.customerImportRows = [];
      S.state.customerImportErrors = [];
      S.state.customerImportConflict = '';
      S.state.customerImportPreviewValid = false;
      const file = event.target.files && event.target.files[0];
      if (!file) { S.fn.renderCustomerImportPreview(); return; }
      if (file.size > 500000) {
        S.state.customerImportErrors = ['Tệp CSV vượt quá 500 KB. Hãy chia tệp thành các phần nhỏ hơn.'];
        S.fn.renderCustomerImportPreview();
        return;
      }
      S.state.customerImportReading = true;
      S.fn.renderCustomerImportPreview();
      const reader = new FileReader();
      const readGeneration = S.state.modalGeneration;
      reader.onload = async function () {
        if (readGeneration !== S.state.modalGeneration || readNumber !== S.state.customerImportReadNumber || S.dom.modal.hidden) return;
        const selectedFile = S.dom.modal.querySelector('#customer-import-file');
        if (selectedFile) selectedFile.value = '';
        const parsed = S.fn.parseCustomerImportCsv(String(reader.result || ''));
        S.state.customerImportErrors = parsed.errors;
        S.state.customerImportRows = [];
        if (parsed.errors.length) {
          S.state.customerImportReading = false;
          S.fn.renderCustomerImportPreview();
          return;
        }
        await S.fn.previewCustomerImport(parsed.items, readGeneration, readNumber);
      };
      reader.onerror = function () {
        if (readGeneration !== S.state.modalGeneration || readNumber !== S.state.customerImportReadNumber || S.dom.modal.hidden) return;
        const selectedFile = S.dom.modal.querySelector('#customer-import-file');
        if (selectedFile) selectedFile.value = '';
        S.state.customerImportReading = false;
        S.state.customerImportErrors = ['Không đọc được tệp. Hãy chọn lại CSV khách hàng.'];
        S.fn.renderCustomerImportPreview();
      };
      reader.readAsText(file, 'UTF-8');
      return;
    }
    if (event.target.id === 'inventory-warehouse') {
      S.state.selectedWarehouseId = event.target.value;
      S.state.inventoryOffset = 0;
      S.fn.loadInventoryPage(S.state.searchTerms.inventory, 0);
      return;
    }
    if (event.target.id === 'pos-warehouse') {
      if (S.fn.hasAnyOpenPosBillItems() || S.state.checkoutPendingPayload) return S.fn.toast('Hoàn tất đơn đang mở trước', 'Kho xuất được khóa trong suốt các đơn đang mở để tồn khả dụng không thay đổi giữa chừng.', 'error');
      S.state.selectedWarehouseId = event.target.value;
      const details = event.target.closest('details');
      if (details) details.open = false;
      S.state.categoryFilter = 'Tất cả';
      S.fn.resetPosCatalog();
      const warehouseId = S.state.selectedWarehouseId;
      S.fn.loadProductsPage('', 0).then(() => {
        if (S.state.page === 'pos' && S.state.selectedWarehouseId === warehouseId && S.state.posSearchTerm) S.fn.searchPosProducts(S.state.posSearchTerm);
      });
      return;
    }
    if (event.target.id === 'stock-bulk-count-file') {
      const readNumber = ++S.state.stockBulkCountReadNumber;
      S.state.stockBulkCountReading = false;
      S.state.stockBulkCountRows = [];
      S.state.stockBulkCountErrors = [];
      const file = event.target.files && event.target.files[0];
      if (!file) { S.fn.renderStockBulkCountPreview(); return; }
      if (file.size > 500000) {
        S.state.stockBulkCountErrors = ['Tệp CSV vượt quá 500 KB. Hãy chia tệp thành các phần nhỏ hơn.'];
        S.fn.renderStockBulkCountPreview();
        return;
      }
      S.state.stockBulkCountReading = true;
      S.fn.renderStockBulkCountPreview();
      const reader = new FileReader();
      const readGeneration = S.state.modalGeneration;
      reader.onload = async function () {
        if (readGeneration !== S.state.modalGeneration || readNumber !== S.state.stockBulkCountReadNumber || S.dom.modal.hidden) return;
        const selectedFile = S.dom.modal.querySelector('#stock-bulk-count-file');
        if (selectedFile) selectedFile.value = '';
        const parsed = S.fn.parseStockBulkCountCsv(String(reader.result || ''));
        S.state.stockBulkCountErrors = parsed.errors;
        S.state.stockBulkCountRows = [];
        if (parsed.errors.length) {
          S.state.stockBulkCountReading = false;
          S.fn.renderStockBulkCountPreview();
          return;
        }
        try {
          const previewResult = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/stock-adjustments/bulk/preview`, {
            method: 'POST', body: { items: parsed.items, warehouseId: S.state.selectedWarehouseId },
          });
          if (readGeneration !== S.state.modalGeneration || readNumber !== S.state.stockBulkCountReadNumber || S.dom.modal.hidden) return;
          S.state.stockBulkCountReading = false;
          if (!previewResult.valid) S.state.stockBulkCountErrors = [previewResult.conflict || 'Số tồn đã thay đổi hoặc tệp chưa hợp lệ.'];
          else if (!Array.isArray(previewResult.items) || previewResult.items.length !== parsed.items.length) S.state.stockBulkCountErrors = ['Máy chủ chưa trả đủ kết quả đối chiếu. Chưa có thay đổi nào được lưu.'];
          else S.state.stockBulkCountRows = previewResult.items;
        } catch (error) {
          if (readGeneration !== S.state.modalGeneration || readNumber !== S.state.stockBulkCountReadNumber || S.dom.modal.hidden) return;
          S.state.stockBulkCountReading = false;
          S.state.stockBulkCountErrors = [error.status === 401
            ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi chọn tệp để kiểm tra.'
            : `Chưa đối chiếu được số đếm với cửa hàng: ${error.message} Chưa có thay đổi nào được lưu.`];
        }
        S.fn.renderStockBulkCountPreview();
      };
      reader.onerror = function () {
        if (readGeneration !== S.state.modalGeneration || readNumber !== S.state.stockBulkCountReadNumber || S.dom.modal.hidden) return;
        const selectedFile = S.dom.modal.querySelector('#stock-bulk-count-file');
        if (selectedFile) selectedFile.value = '';
        S.state.stockBulkCountReading = false;
        S.state.stockBulkCountErrors = ['Không đọc được tệp. Hãy chọn lại CSV đã xuất từ Slink.'];
        S.fn.renderStockBulkCountPreview();
      };
      reader.readAsText(file, 'UTF-8');
      return;
    }
    if (event.target.id === 'product-bulk-update-file') {
      const readNumber = ++S.state.productBulkUpdateReadNumber;
      S.state.productBulkUpdateReading = false;
      S.state.productBulkUpdateRows = [];
      S.state.productBulkUpdateErrors = [];
      const file = event.target.files && event.target.files[0];
      if (!file) { S.fn.renderProductBulkUpdatePreview(); return; }
      if (file.size > 500000) {
        S.state.productBulkUpdateErrors = ['Tệp CSV vượt quá 500 KB. Hãy chia tệp thành các phần nhỏ hơn.'];
        S.fn.renderProductBulkUpdatePreview();
        return;
      }
      S.state.productBulkUpdateReading = true;
      S.fn.renderProductBulkUpdatePreview();
      const reader = new FileReader();
      const readGeneration = S.state.modalGeneration;
      reader.onload = async function () {
        if (readGeneration !== S.state.modalGeneration || readNumber !== S.state.productBulkUpdateReadNumber || S.dom.modal.hidden) return;
        const selectedFile = S.dom.modal.querySelector('#product-bulk-update-file');
        if (selectedFile) selectedFile.value = '';
        const parsed = S.fn.parseProductBulkUpdateCsv(String(reader.result || ''));
        S.state.productBulkUpdateErrors = parsed.errors;
        S.state.productBulkUpdateRows = [];
        if (parsed.errors.length) {
          S.state.productBulkUpdateReading = false;
          S.fn.renderProductBulkUpdatePreview();
          return;
        }
        try {
          const previewResult = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/products/bulk-update/preview`, {
            method: 'POST',
            body: { items: parsed.items.map(function (item) { const { before, ...requestItem } = item; return requestItem; }) },
          });
          if (readGeneration !== S.state.modalGeneration || readNumber !== S.state.productBulkUpdateReadNumber || S.dom.modal.hidden) return;
          S.state.productBulkUpdateReading = false;
          if (!previewResult.valid) S.state.productBulkUpdateErrors = [previewResult.conflict || 'Sản phẩm đã thay đổi hoặc bị trùng trong danh mục.'];
          else if (Array.isArray(previewResult.items) && previewResult.items.length === parsed.items.length) S.state.productBulkUpdateRows = previewResult.items;
          else S.state.productBulkUpdateErrors = ['Máy chủ trả về bản xem trước không đầy đủ. Chưa có thay đổi nào được lưu; hãy chọn lại tệp để thử lại.'];
        } catch (error) {
          if (readGeneration !== S.state.modalGeneration || readNumber !== S.state.productBulkUpdateReadNumber || S.dom.modal.hidden) return;
          S.state.productBulkUpdateReading = false;
          S.state.productBulkUpdateErrors = [error.status === 401
            ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi chọn tệp để kiểm tra.'
            : `Chưa đối chiếu được thay đổi với cửa hàng: ${error.message} Hãy chọn lại CSV để thử lại. Chưa có thay đổi nào được lưu.`];
        }
        S.fn.renderProductBulkUpdatePreview();
      };
      reader.onerror = function () {
        if (readGeneration !== S.state.modalGeneration || readNumber !== S.state.productBulkUpdateReadNumber || S.dom.modal.hidden) return;
        const selectedFile = S.dom.modal.querySelector('#product-bulk-update-file');
        if (selectedFile) selectedFile.value = '';
        S.state.productBulkUpdateReading = false;
        S.state.productBulkUpdateErrors = ['Không đọc được tệp. Hãy chọn lại CSV đã xuất từ Slink.'];
        S.fn.renderProductBulkUpdatePreview();
      };
      reader.readAsText(file, 'UTF-8');
      return;
    }
    if (event.target.id === 'product-import-warehouse') {
      if (!S.state.productImportPending && S.state.productImportSourceRows.length) S.fn.previewProductImportAtWarehouse(S.state.productImportSourceRows);
      else S.fn.renderProductImportPreview();
      return;
    }
    if (event.target.id === 'product-import-file') {
      const readNumber = ++S.state.productImportReadNumber;
      S.state.productImportReading = false;
      S.state.productImportRows = [];
      S.state.productImportErrors = [];
      S.state.productImportSourceRows = [];
      S.state.productImportVerifiedWarehouseId = '';
      S.state.productImportWarehouseName = '';
      const file = event.target.files && event.target.files[0];
      if (!file) { S.fn.renderProductImportPreview(); return; }
      if (file.size > 500000) {
        S.state.productImportErrors = ['Tệp CSV vượt quá 500 KB. Hãy chia tệp thành các phần nhỏ hơn.'];
        S.fn.renderProductImportPreview();
        return;
      }
      S.state.productImportReading = true;
      S.fn.renderProductImportPreview();
      const reader = new FileReader();
      const readGeneration = S.state.modalGeneration;
      reader.onload = async function () {
        if (readGeneration !== S.state.modalGeneration || readNumber !== S.state.productImportReadNumber || S.dom.modal.hidden) return;
        const parsed = S.fn.parseProductImportCsv(String(reader.result || ''));
        S.state.productImportErrors = parsed.errors;
        S.state.productImportRows = [];
        S.state.productImportSourceRows = parsed.items;
        if (parsed.errors.length) {
          S.state.productImportReading = false;
          S.fn.renderProductImportPreview();
          return;
        }
        await S.fn.previewProductImportAtWarehouse(parsed.items);
      };
      reader.onerror = function () {
        if (readGeneration !== S.state.modalGeneration || readNumber !== S.state.productImportReadNumber || S.dom.modal.hidden) return;
        S.state.productImportReading = false;
        S.state.productImportErrors = ['Không đọc được tệp. Hãy chọn lại tệp CSV.'];
        S.fn.renderProductImportPreview();
      };
      reader.readAsText(file, 'UTF-8');
      return;
    }
    if (event.target.id === 'payroll-month-input') {
      const m = event.target.value;
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) {
        S.fn.loadStaffPayroll(m);
      }
      return;
    }
    if (event.target.id === 'receive-payment-state') { S.fn.updateReceivePurchaseTotal(event.target.form); return; }
    if (event.target.id === 'staff-invite-role') {
      const help = S.dom.modal.querySelector('.staff-role-help');
      if (help) help.textContent = S.fn.staffRoleDescription(event.target.value);
      return;
    }
    if (event.target.matches("form[data-form='staff-direct-create'] select[name='role']")) {
      const form = event.target.closest("form[data-form='staff-direct-create']");
      const eff = S.fn.resolveEffectivePermissions(event.target.value, null, null);
      if (form) {
        form.querySelectorAll('[data-direct-perm]').forEach(function (el) {
          const k = el.dataset.directPerm;
          if (k === 'pos_max_discount_pct') el.value = String(eff.pos_max_discount_pct ?? 0);
          else if (k) el.checked = Boolean(eff[k]);
        });
      }
      return;
    }
    if (event.target.matches('[data-purchase-mode]')) {
      const row = event.target.closest('[data-purchase-line]');
      S.fn.setReceivePackMode(row, S.fn.productById(row.querySelector('[data-purchase-product]').value), false);
      S.fn.updateReceivePurchaseTotal(event.target.form); return;
    }
    if (event.target.matches('[data-purchase-product]')) {
      const row = event.target.closest('[data-purchase-line]');
      const product = S.fn.productById(event.target.value);
      if (!S.fn.loadPendingPurchase()) S.fn.setReceivePackMode(row, product, true);
      S.fn.updateReceivePurchaseTotal(S.dom.modal.querySelector('[data-form="receive"]'));
    }
    if (event.target.matches('[data-order-product]')) {
      const row = event.target.closest('[data-order-line]');
      const cost = row && row.querySelector('[data-order-cost]');
      const selectedCost = event.target.selectedOptions[0]?.dataset.cost;
      if (cost && selectedCost !== undefined) cost.value = String(selectedCost);
      S.fn.updatePurchaseOrderTotal(S.dom.modal.querySelector('[data-form="purchase-order"]'));
    }
  });

  document.addEventListener('submit', function (event) {
    if (event.target.matches('[data-landing-start]')) {
      event.preventDefault();
      const name = new FormData(event.target).get('quickStoreName').trim();
      S.state.authMode = 'register';
      S.fn.renderAuth();
      const storeName = document.getElementById('auth-store');
      storeName.value = name;
      document.getElementById('auth-name').focus();
      return;
    }
    const authForm = event.target.closest('form[data-auth-form]');
    if (authForm) {
      event.preventDefault();
      if (!S.fn.updatePasswordConfirmation(authForm)) {
        const confirmation = authForm.querySelector('[data-password-confirm-for]');
        if (confirmation) confirmation.reportValidity();
        return;
      }
      S.fn.submitAuth(authForm);
      return;
    }
    const form = event.target.closest('form[data-form]'); if (!form) return; event.preventDefault(); const type = form.dataset.form;
    if (type === 'affiliate-link') { S.fn.saveAffiliateLink(form); return; }
    if (type === 'business-profile') { S.fn.saveBusinessProfile(String(new FormData(form).get('businessProfile') || ''), form); return; }
    if (type === 'task-focus') { S.fn.saveTaskFocusSelection(form); return; }
    if (type === 'change-password') { S.fn.saveAccountPassword(form); return; }
    if (type === 'channel-filter') {
      S.state.channelState.query = String(new FormData(form).get('q') || '').trim().slice(0, 120);
      S.fn.loadChannelCatalog(0);
    }
    else if (type === 'channel-order-filter') {
      const data = new FormData(form);
      S.state.channelState.orderQuery = String(data.get('q') || '').trim().slice(0, 120);
      S.state.channelState.orderStatus = String(data.get('status') || '');
      S.fn.loadChannelOrders(0);
    }
    else if (type === 'channel-profile') S.fn.saveChannelProfile(form);
    else if (type === 'channel-mapping') S.fn.saveChannelMapping(form);
    else if (type === 'channel-archive') S.fn.saveChannelArchive(form);
    else if (type === 'channel-order-create') S.fn.createChannelOrder(form);
    else if (type === 'channel-order-status') S.fn.saveChannelOrderStatus(form);
    else if (type === 'product') S.fn.saveProduct(form);
    else if (type === 'quick-product') S.fn.saveQuickProduct(form, event.submitter);
    else if (type === 'add-product-units') S.fn.saveAddProductUnits(form, event.submitter);
    else if (type === 'transfer-serials') S.fn.saveTransferSerials(form);
    else if (type === 'product-variants') S.fn.saveProductVariantGroup(form);
    else if (type === 'product-variant-add') S.fn.saveProductVariantAdd(form);
    else if (type === 'promotion-create') S.fn.savePromotion(form);
    else if (type === 'audit-filter') {
      const data = new FormData(form);
      const filters = { from: String(data.get('from') || ''), to: String(data.get('to') || ''), q: String(data.get('q') || '').trim().slice(0, 100) };
      if (filters.from && filters.to && filters.from > filters.to) return S.fn.toast('Khoảng ngày chưa hợp lệ', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.', 'error');
      S.fn.loadAuditEvents(filters, 0);
    }
    else if (type === 'customer') S.fn.saveCustomer(form);
    else if (type === 'customer-opening-debt') S.fn.saveCustomerOpeningDebt(form);
    else if (type === 'customer-saved-segment') S.fn.saveCustomerSegment(form);
    else if (type === 'customer-saved-segment-delete') S.fn.deleteCustomerSegment(form);
    else if (type === 'customer-tag') S.fn.changeCustomerTag(form.dataset.id, 'add', String(new FormData(form).get('tag') || '').trim());
    else if (type === 'supplier') S.fn.saveSupplier(form);
    else if (type === 'order-note') S.fn.saveOrderNote(form);
    else if (type === 'order-tag') S.fn.changeOrderTag(form.dataset.id, 'add', String(new FormData(form).get('tag') || '').trim());
    else if (type === 'void-order') S.fn.saveVoidOrder(form);
    else if (type === 'cart-price-review') S.fn.confirmCartPrices(form);
    else if (type === 'checkout') S.fn.createSale(form);
    else if (type === 'return') S.fn.saveReturn(form);
    else if (type === 'payment') S.fn.savePayment(form);
    else if (type === 'customer-payment') S.fn.saveCustomerPayment(form);
    else if (type === 'customer-import') S.fn.saveCustomerImport(form);
    else if (type === 'product-import') S.fn.saveProductImport(form);
    else if (type === 'product-bulk-update') S.fn.saveProductBulkUpdate(form);
    else if (type === 'stock-bulk-count') S.fn.saveStockBulkCount(form);
    else if (type === 'cart-quantity') S.fn.saveCartQuantity(form);
    else if (type === 'adjust-stock-picker') S.fn.openStockAdjust(String(new FormData(form).get('productId') || ''));
    else if (type === 'adjust-stock') S.fn.adjustStock(form);
    else if (type === 'receive') S.fn.receiveStock(form);
    else if (type === 'purchase-order') S.fn.savePurchaseOrder(form);
    else if (type === 'purchase-order-receipt') S.fn.receivePurchaseOrder(form);
    else if (type === 'purchase-order-cancel') S.fn.cancelPurchaseOrder(form);
    else if (type === 'warehouse-create') S.fn.saveWarehouse(form);
    else if (type === 'warehouse-archive') S.fn.saveWarehouseArchive(form);
    else if (type === 'warehouse-transfer-create') S.fn.saveWarehouseTransfer(form);
    else if (type === 'warehouse-transfer-receipt') S.fn.saveWarehouseTransferReceipt(form);
    else if (type === 'warehouse-transfer-cancel') S.fn.saveWarehouseTransferCancel(form);
    else if (type === 'supplier-payment') S.fn.saveSupplierPayment(form);
    else if (type === 'supplier-return') S.fn.submitSupplierReturnForm(form);
    else if (type === 'order-exchange') S.fn.submitOrderExchangeForm(form);
    else if (type === 'cash') S.fn.saveCash(form);
    else if (type === 'cash-transfer') S.fn.saveCashTransfer(form);
    else if (type === 'void-cash-movement') S.fn.saveVoidCashMovement(form);
    else if (type === 'cash-category-create') S.fn.saveCashCategory(form);
    else if (type === 'cash-session-open') S.fn.saveCashSessionOpen(form);
    else if (type === 'cash-session-close') S.fn.saveCashSessionClose(form);
    else if (type === 'settings') S.fn.saveSettings(form);
    else if (type === 'integration-settings') S.fn.saveIntegrationSettings(form);
    else if (type === 'order-shipping') S.fn.saveOrderShipping(form);
    else if (type === 'staff-invite') S.fn.saveStaffInvitation(form);
    else if (type === 'staff-direct-create') S.fn.saveStaffDirectCreate(form);
    else if (type === 'staff-advance') S.fn.submitStaffAdvanceForm(form);
    else if (type === 'scan') S.fn.addByCode(form);
    else if (type === 'rapid-stock-count') S.fn.submitRapidStockCount(form);
    else if (type === 'warranty-lookup') S.fn.lookupWarrantyBySerial(new FormData(form).get('code'));
    else if (type === 'pos-prefs') {
      const fd = new FormData(form);
      S.fn.savePosPrefs({ paperWidth: String(fd.get('paperWidth') || '80mm'), autoPrint: fd.get('autoPrint') === 'on', requireFullPayment: fd.get('requireFullPayment') === 'on', voiceAnnounce: fd.get('voiceAnnounce') === 'on' });
      S.fn.toast('Đã lưu cấu hình POS & Hóa đơn');
    }
    else if (type === 'discount') {
      if (S.state.checkoutPendingPayload) return S.fn.toast('Đang chờ xác nhận đơn', 'Hãy kiểm tra đơn đang chờ trước khi thay đổi giảm giá.', 'error');
      const maxPct = S.fn.getMaxDiscountPct();
      if (maxPct <= 0) return S.fn.toast('Không có quyền giảm giá', 'Tài khoản này chưa được cấp hạn mức giảm giá.', 'error');
      const fd = new FormData(form);
      const mode = String(fd.get('discountMode') || 'vnd');
      const rawVal = Math.max(0, Number(fd.get('discount')) || 0);
      const totals = S.fn.cartTotals();
      const sub = totals.subtotal;
      const totalCap = S.fn.maxAllowedDiscountVnd(sub);
      const cap = Math.max(0, Math.min(sub - totals.lineDiscount, totalCap - totals.lineDiscount));
      const computed = mode === 'percent' ? Math.round(sub * Math.min(100, rawVal) / 100) : Math.round(rawVal);
      if (computed > cap) {
        return S.fn.toast('Vượt hạn mức giảm giá', `Mức giảm đơn tối đa còn lại là ${S.fn.money(cap)} (tổng hạn mức ${S.fn.number(maxPct)}%).`, 'error');
      }
      S.state.cart.discount = Math.max(0, Math.min(cap, computed));
      S.fn.closeModal(); S.fn.render(); S.fn.toast('Đã áp dụng giảm giá đơn', S.fn.money(S.state.cart.discount));
    }
    else if (type === 'pos-line-discount') S.fn.saveLineDiscount(form);
  });

  S.dom.backdrop.addEventListener('click', S.fn.requestCloseModal);
  S.dom.modal.addEventListener('invalid', function (event) {
    const details = event.target.closest('.editor-identity-details, .customer-extra-fields');
    if (details) details.open = true;
  }, true);
  S.dom.modal.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && event.target && event.target.id === 'serial-rapid-input') {
      event.preventDefault();
      event.stopPropagation();
      const form = event.target.closest('form');
      const code = event.target.value.trim();
      if (form && code) {
        const res = S.fn.appendFormSerialCode(form, code);
        if (!res.ok) S.fn.toast('Chưa thêm được mã', res.reason, 'error');
        else event.target.value = '';
        event.target.focus();
      }
    }
  }, true);
  document.addEventListener('keydown', function (event) {
    S.fn.keepModalFocus(event);
    if (event.key === 'Enter' && (event.target.id === 'product-barcode' || event.target.matches('[data-variant-barcode],[data-barcode-filter],[data-mb-barcode]'))) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && event.target.id === 'receive-barcode-scan') {
      event.preventDefault();
      S.fn.handleReceiveBarcodeScan(event.target);
      return;
    }
    if (event.key === 'Enter' && event.target.id === 'rapid-stock-count-input') {
      event.preventDefault();
      const code = event.target.value.trim();
      if (code) {
        event.target.value = '';
        S.fn.handleRapidStockCountScan(code).then(res => {
          if (res?.ok) { window.SlinkPosHardware?.vibrate(45); S.fn.playScanBeep(); }
          else if (res?.reason) S.fn.toast('Không thêm được', res.reason, 'error');
        });
      }
      return;
    }
    if (event.key === 'Enter' && event.target.id === 'transfer-barcode-scan') {
      event.preventDefault();
      S.fn.handleTransferBarcodeScan(event.target);
      return;
    }
    if (((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'b') && S.state.page === 'pos' && S.dom.modal.hidden && !S.state.guidedTourState?.active && !document.querySelector('#drawer-cart.open')) {
      const search = document.getElementById('pos-search');
      if (search) {
        event.preventDefault();
        search.focus({ preventScroll: true });
        search.select?.();
        return;
      }
    }
    if (event.key === 'Enter' && event.target.id === 'pos-search') {
      const code = event.target.value.trim();
      if (code) {
        event.preventDefault();
        S.fn.handlePosBarcodeSubmit(code);
        return;
      }
    }
    if (event.key === 'Escape') {
      if (S.fn.closeProductBarcode() || S.fn.closeProductEditorMenu()) { event.preventDefault(); return; }
      if (!S.dom.modal.hidden) S.fn.requestCloseModal();
      else if (document.querySelector('#drawer-cart.open')) S.fn.setCartDrawerOpen(false);
    }
  });
  document.addEventListener('click', function (event) { const drawer = document.getElementById('drawer-cart'); if (drawer && event.target === drawer) S.fn.setCartDrawerOpen(false); });

  S.state.updateCartViewport = function () { if (S.state.page === 'pos') S.fn.refreshCartPanels(); };
  if (S.state.cartViewport.addEventListener) S.state.cartViewport.addEventListener('change', S.state.updateCartViewport);
  else S.state.cartViewport.addListener(S.state.updateCartViewport);
  window.addEventListener('online', function () {
    S.state.offlineState.mode = 'online';
    S.fn.renderShell();
    S.fn.resumeOfflineWork().catch(error => { S.state.offlineState.storageIssue = error.message; });
  });
  S.state.offlineChannel?.addEventListener('message', function (event) { if (event.data?.scope === S.fn.activeOfflineScope()) { S.fn.offlineRowsChanged(false).catch(() => {}); S.state.offlineRefreshDue = true; S.fn.refreshAfterOfflineSync(); S.fn.startOfflineSync(); } });
  window.setInterval(function () { if (S.state.authSession && navigator.onLine && S.state.offlineState.pending) S.fn.startOfflineSync(); S.fn.refreshAfterOfflineSync(); }, 30000);
  window.addEventListener('offline', function () { S.state.offlinePreparation += 1; S.state.offlineState.preparing = false; S.state.offlineState.mode = 'offline'; S.fn.renderShell(); });
  document.addEventListener('input', function (event) {
    if (S.state.page === 'settings' && event.target.closest('#view form')) event.target.closest('form').dataset.dirty = 'true';
    if (event.target.closest('#integration-settings-form')) S.fn.updateIntegrationVietQrPreview(event.target.form);
    if(event.target.closest('[data-form="product"],[data-form="quick-product"]'))S.fn.updateProductHints(event.target.form);
  }, true);
  document.addEventListener('change', function (event) {
    if (S.state.page === 'settings' && event.target.closest('#view form')) event.target.closest('form').dataset.dirty = 'true';
    if (event.target.closest('#integration-settings-form')) S.fn.updateIntegrationVietQrPreview(event.target.form);
  }, true);
  for (const type of ['input', 'change']) S.dom.modal.addEventListener(type, function (event) {
    const form = event.target.closest('form[data-form]');
    if (form) {
      if (form.dataset.form !== 'barcode-print') form.dataset.userEdited = 'true';
      if (event.target.name === 'taskFocusRoute') form.dataset.taskFocusEdited = 'true';
      if (event.target.closest('#warehouse-transfer-lines')) {
        event.target.closest('#warehouse-transfer-lines').dataset.transferTouched = 'true';
      }
      if (event.target.matches('[data-return-serial-check]')) {
        const lineId = event.target.dataset.returnSerialCheck;
        const checkedCount = form.querySelectorAll(`[data-return-serial-check="${CSS.escape(lineId)}"]:checked`).length;
        const qtyInput = form.querySelector(`[data-return-line="${CSS.escape(lineId)}"]`);
        if (qtyInput) qtyInput.value = String(checkedCount);
      }
      if (form.dataset.form === 'transfer-serials' && event.target.name === 'sourceWarehouseId') {
        let items = [];
        try { items = JSON.parse(S.dom.modal.dataset.productSerialsFullCache || '[]'); } catch {}
        const listEl = form.querySelector('[data-transfer-serial-list]');
        if (listEl) {
          listEl.innerHTML = items.filter(i => i.warehouseId === event.target.value).map(i => `<label style='display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--border);border-radius:999px;font-size:12px;cursor:pointer'><input type='checkbox' name='codes' value='${S.fn.esc(i.code)}'/><code>${S.fn.esc(i.code)}</code></label>`).join('');
        }
      }
      S.state.modalEditedField = event.target;
    }
  });
  document.addEventListener('toggle', function (event) {
    if (event.target.matches?.('[data-staff-detail]')) {
      const id = event.target.dataset.staffDetail;
      if (event.target.open) S.state.staffExpandedIds.add(id);
      else S.state.staffExpandedIds.delete(id);
    }
    if (event.target.matches?.('.pos-warehouse-picker details') && !event.target.open) window.setTimeout(S.fn.refreshAfterOfflineSync, 0);
  }, true);
  S.dom.root.addEventListener('focusout', function () { window.setTimeout(S.fn.refreshAfterOfflineSync, 0); });
  document.addEventListener('keydown', function (event) {
    if (event.target.matches('[data-action="settings-area"]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      const buttons = Array.from(S.dom.root.querySelectorAll('[data-action="settings-area"]'));
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (buttons.indexOf(event.target) + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length;
      event.preventDefault(); S.fn.selectSettingsArea(index); buttons[index].focus();
      return;
    }
    if (event.target.matches?.('.pos-fast-scan-row[data-action="add-cart"]') && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      S.fn.addToCart(event.target.dataset.id);
      return;
    }
    if (S.state.page === 'pos' && S.dom.modal.hidden && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === 'F1') { event.preventDefault(); S.fn.addPosBill(); }
      else if (event.key === 'F2') { event.preventDefault(); const inp = document.getElementById('pos-search'); inp?.focus(); inp?.select?.(); }
      else if (event.key === 'F4') { event.preventDefault(); S.dom.root.querySelector('[data-action="pick-customer"]')?.click(); }
      else if (event.key === 'F6') { event.preventDefault(); S.fn.showDiscount(); }
      else if (event.key === 'F8') { event.preventDefault(); S.fn.printProformaBill(); }
      else if (event.key === 'F9') { event.preventDefault(); S.fn.openCheckout(); }
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      S.fn.stopScanCamera();
      S.fn.restoreVietQrBrightness();
    }
    else if (S.state.authSession) {
      S.fn.offlineRowsChanged(false).catch(() => {});
      S.fn.startOfflineSync();
      const now = Date.now();
      if (now - S.state.lastForegroundSyncAt > 20000) {
        S.state.lastForegroundSyncAt = now;
        S.fn.syncAfterMutation(['me', S.state.page === 'pos' ? 'products' : S.state.page]);
      }
    }
  });
  window.SlinkHandleBack = function () {
    if (S.fn.closeProductBarcode() || S.fn.closeSerialCamera() || S.fn.closeProductEditorMenu()) return true;
    if (!S.dom.modal.hidden) { S.fn.requestCloseModal(); return true; }
    if (document.getElementById('drawer-cart')?.classList.contains('open')) { S.fn.setCartDrawerOpen(false); return true; }
    const home = S.state.taskFocusRoute || S.fn.defaultTaskFocusRoute();
    if (S.state.authSession && home && S.state.page !== home) { S.fn.routeTo(home); return true; }
    return false;
  };
  window.addEventListener('pagehide', function () {
    S.fn.stopScanCamera();
    S.fn.restoreVietQrBrightness();
  });
  document.addEventListener('error', function (event) { if (event.target.matches?.('img[data-product-photo]')) event.target.remove(); }, true);
})(window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {}, charts: {} });
