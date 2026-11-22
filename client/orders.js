(function (S) {
  'use strict';

  S.fn.loadOrdersPage = async function loadOrdersPage(query, offset) {
    if (!S.state.authSession || !S.state.store.id) return;
    if (!S.fn.hasPerm('viewOrders')) {
      S.state.orderRequestNumber += 1;
      S.state.store.orders = [];
      S.state.orderTotal = 0;
      S.state.orderOffset = 0;
      S.state.orderNextOffset = null;
      return;
    }
    const requestNumber = ++S.state.orderRequestNumber;
    const orderStatusFilter = S.state.page === 'orders' ? ({
      'Hoàn tất': 'completed', 'Còn nợ': 'due', 'Trả một phần': 'partially_returned', 'Đã trả hàng': 'returned',
    }[S.state.orderFilter] || 'all') : 'all';
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/orders?limit=100&offset=${Math.max(0, offset || 0)}&q=${encodeURIComponent(query || '')}&status=${orderStatusFilter}`, { preferFresh: navigator.onLine });
      if (requestNumber !== S.state.orderRequestNumber) return;
      S.state.store.orders = result.orders.map(S.fn.mapOrder);
      S.state.orderTotal = result.total;
      S.state.orderOffset = offset || 0;
      S.state.orderNextOffset = result.nextOffset;
    } catch (error) {
      if (requestNumber !== S.state.orderRequestNumber) return;
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa tải được đơn hàng', error.message, 'error');
    }
  }


  S.fn.parseOrderDeliveryPrefill = function parseOrderDeliveryPrefill(order, customer) {
    let recName = order.customerName || customer?.name || '';
    let recPhone = order.customerPhone || customer?.phone || '';
    let address = customer?.shippingAddress || '';
    const note = String(order.note || '');
    if (note.startsWith('[GIAO HÀNG]')) {
      const segs = note.replace(/^\[GIAO HÀNG\]\s*/, '').split(' · ').map(s => s.trim()).filter(Boolean);
      if (segs[0] && !recName) recName = segs[0];
      if (segs[1] && /^[0-9+\s-]{8,15}$/.test(segs[1])) {
        if (!recPhone) recPhone = segs[1];
        if (segs[2] && !address) address = segs[2];
      } else if (segs[1] && !address) {
        address = segs[1];
      }
    }
    return { recName, recPhone, address };
  }


  S.fn.openOrderShippingModal = function openOrderShippingModal(orderId) {
    const o = S.state.store.orders.find(item => item.id === orderId);
    if (!o) return;
    const c = S.fn.customerById(o.customerId);
    const prefill = S.fn.parseOrderDeliveryPrefill(o, c);
    const defaultProv = S.state.integrationState.data?.settings?.shippingProvider && S.state.integrationState.data.settings.shippingProvider !== 'none'
      ? S.state.integrationState.data.settings.shippingProvider : 'ghn';
    const form = `<form id='entity-form' data-form='order-shipping' data-id='${S.fn.esc(o.id)}'>
      <div class='form-grid'>
        <div class='form-field'><label class='input-label' for='ship-provider'>Đơn vị vận chuyển</label><div class='select-wrap'><select class='input' id='ship-provider' name='provider'><option value='ghn' ${defaultProv === 'ghn' ? 'selected' : ''}>Giao Hàng Nhanh (GHN)</option><option value='ghtk' ${defaultProv === 'ghtk' ? 'selected' : ''}>Giao Hàng Tiết Kiệm (GHTK)</option></select></div></div>
        <div class='form-field'><label class='input-label' for='ship-cod'>Tiền thu hộ COD (VND)</label><input class='input' id='ship-cod' name='codAmountVnd' type='number' min='0' step='1' value='${S.fn.esc(String(o.due || 0))}'/></div>
        <div class='form-field'><label class='input-label' for='ship-name'>Tên người nhận *</label><input class='input' id='ship-name' name='receiverName' value='${S.fn.esc(prefill.recName)}' required maxlength='120'/></div>
        <div class='form-field'><label class='input-label' for='ship-phone'>Số điện thoại *</label><input class='input' id='ship-phone' name='receiverPhone' value='${S.fn.esc(prefill.recPhone)}' required maxlength='30' inputmode='tel'/></div>
        <div class='form-field full'><label class='input-label' for='ship-address'>Địa chỉ giao hàng (Số nhà, đường, Phường/Xã, Quận/Huyện, Tỉnh/Thành) *</label><input class='input' id='ship-address' name='address' value='${S.fn.esc(prefill.address)}' required maxlength='300' placeholder='VD: 12 Nguyễn Huệ, Phường Bến Nghé, Quận 1, Hồ Chí Minh'/></div>
        <div class='form-field'><label class='input-label' for='ship-ward'>Phường / Xã</label><input class='input' id='ship-ward' name='wardName' maxlength='80' placeholder='VD: Phường Bến Nghé'/></div>
        <div class='form-field'><label class='input-label' for='ship-district'>Quận / Huyện</label><input class='input' id='ship-district' name='districtName' maxlength='80' placeholder='VD: Quận 1'/></div>
        <div class='form-field'><label class='input-label' for='ship-province'>Tỉnh / Thành phố</label><input class='input' id='ship-province' name='provinceName' maxlength='80' placeholder='VD: Hồ Chí Minh'/></div>
        <div class='form-field'><label class='input-label' for='ship-weight'>Khối lượng (gram)</label><input class='input' id='ship-weight' name='weightGram' type='number' min='50' max='500000' value='500'/></div>
      </div>
      <div class='modal-note' data-shipping-preview>Bấm "Tính thử phí GHN" để kiểm tra cước và thời gian giao dự kiến trực tiếp từ Giao Hàng Nhanh trước khi tạo vận đơn.</div>
    </form>`;
    S.fn.showModal(`Tạo vận đơn · ${o.number}`, 'Điền thông tin người nhận để đẩy sang GHN hoặc GHTK.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-secondary' type='button' data-action='preview-order-shipping' data-id='${S.fn.esc(o.id)}'>Tính thử phí GHN</button><button class='btn btn-primary' type='submit' form='entity-form'>Đẩy vận đơn</button>`);
  }


  S.fn.readShippingFormPayload = function readShippingFormPayload(form) {
    const data = new FormData(form);
    return {
      provider: String(data.get('provider') || 'ghn'),
      receiverName: String(data.get('receiverName') || '').trim(),
      receiverPhone: String(data.get('receiverPhone') || '').trim(),
      address: String(data.get('address') || '').trim(),
      wardName: String(data.get('wardName') || '').trim(),
      districtName: String(data.get('districtName') || '').trim(),
      provinceName: String(data.get('provinceName') || '').trim(),
      codAmountVnd: Number(data.get('codAmountVnd') || 0),
      weightGram: Number(data.get('weightGram') || 500),
    };
  }


  S.fn.previewOrderShippingFee = async function previewOrderShippingFee(orderId, button) {
    const form = S.dom.modal.querySelector("form[data-form='order-shipping']");
    if (!form) return;
    const previewBox = form.querySelector('[data-shipping-preview]');
    if (button) button.disabled = true;
    try {
      const payload = S.fn.readShippingFormPayload(form);
      const res = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/orders/${encodeURIComponent(orderId)}/shipping/preview`, {
        method: 'POST',
        body: payload,
      });
      const eta = res.expectedDeliveryTime ? ` · Giao dự kiến: ${S.fn.humanDate(res.expectedDeliveryTime, false)}` : '';
      const msg = `Cước GHN dự kiến: ${S.fn.moneyVndText(res.feeVnd || '0')} (Shop #${res.shopId || ''}${eta})`;
      if (previewBox) previewBox.textContent = msg;
      S.fn.toast('Đã tính cước GHN', msg);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else {
        if (previewBox) previewBox.textContent = error.message;
        S.fn.toast('Chưa tính được phí GHN', error.message, 'error');
      }
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
  }


  S.fn.verifyGhnIntegrationToken = async function verifyGhnIntegrationToken(button) {
    if (button) button.disabled = true;
    try {
      const res = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/integrations/ghn/verify`, {
        method: 'POST',
        body: {},
      });
      S.fn.toast('Kết nối GHN thành công', `Shop #${res.shopId} · ${res.shopName || res.phone || 'Đang hoạt động'}`);
      S.fn.loadIntegrationStatus(true);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa kết nối được GHN', error.message, 'error');
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
  }


  S.fn.saveOrderShipping = async function saveOrderShipping(form) {
    const orderId = form.dataset.id;
    const submit = S.dom.modal.querySelector("button[type='submit'][form='entity-form']");
    if (submit) submit.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/orders/${encodeURIComponent(orderId)}/shipping`, {
        method: 'POST',
        body: S.fn.readShippingFormPayload(form),
      });
      S.fn.closeModal();
      S.fn.toast('Đã tạo vận đơn', `Mã vận đơn ${result.trackingCode}`);
      await S.fn.openOrder(orderId);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa tạo được vận đơn', error.message, 'error');
      if (submit?.isConnected) submit.disabled = false;
    }
  }


  S.fn.handleOrderIntegrationAction = async function handleOrderIntegrationAction(action, orderId, button) {
    if (!orderId) return;
    if (action === 'create-order-shipping') {
      S.fn.openOrderShippingModal(orderId);
      return;
    }
    if (action === 'preview-order-shipping') {
      await S.fn.previewOrderShippingFee(orderId, button);
      return;
    }
    if (action === 'create-order-momo') {
      if (button?.disabled) return;
      if (button) button.disabled = true;
      try {
        const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/orders/${encodeURIComponent(orderId)}/momo-payment`, {
          method: 'POST',
          body: {},
        });
        const rawLink = String(result.payUrl || result.qrCodeUrl || result.deeplink || '').trim();
        const link = /^(https?:\/\/|momo:\/\/)/i.test(rawLink) ? rawLink : '';
        const body = `<div class='checkout-total'><span>Thanh toán MoMo · ${S.fn.esc(result.orderNumber)}</span><strong>${S.fn.moneyVndText(result.amountVnd)}</strong></div>
          ${link ? `<div class='integration-webhook-box' style='margin-top:12px'><div><span class='input-label'>Liên kết thanh toán MoMo</span><code>${S.fn.esc(link)}</code></div><a class='btn btn-primary' href='${S.fn.esc(link)}' target='_blank' rel='noopener noreferrer'>Mở cổng MoMo</a></div>` : ''}`;
        S.fn.showModal('Thanh toán ví MoMo', 'Khách quét mã hoặc mở liên kết MoMo; khi hoàn tất, IPN tự động gạch nợ đơn hàng.', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button>`);
      } catch (error) {
        if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
        else S.fn.toast('Chưa tạo được phiên MoMo', error.message, 'error');
      } finally {
        if (button?.isConnected) button.disabled = false;
      }
      return;
    }
    if (button?.disabled) return;
    if (button) button.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/orders/${encodeURIComponent(orderId)}/einvoice`, {
        method: 'POST',
        body: {},
      });
      S.fn.toast('Đã xuất hóa đơn điện tử', `Số HĐĐT ${result.invoiceNumber}`);
      await S.fn.openOrder(orderId);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa xuất được hóa đơn điện tử', error.message, 'error');
      if (button?.isConnected) button.disabled = false;
    }
  }


  S.fn.orderRows = function orderRows(orders) {
    return orders.map(function (order) {
      return `<tr><td><button class='link-button order-ref' data-action='order-detail' data-id='${order.id}'>${S.fn.esc(order.number)}</button></td><td>${order.customerName ? `<div class='customer-cell'><span class='avatar'>${S.fn.esc(S.fn.initials(order.customerName))}</span><span class='product-name-stack'><strong>${S.fn.esc(order.customerName)}</strong><small>${S.fn.esc(order.customerPhone)}</small></span></div>` : `<span class='muted'>Khách lẻ</span>`}</td><td>${S.fn.humanDate(order.createdAt, true)}</td><td>${S.fn.number(order.itemCount)} dòng</td><td class='text-right'>${S.fn.money(order.total)}</td><td>${S.fn.statusBadge(order.status)}</td><td class='text-right'><button class='row-action' data-action='order-detail' data-id='${order.id}'>›</button></td></tr>`;
    }).join('');
  }


  S.fn.filteredOrders = function filteredOrders() {
    return S.state.store.orders;
  }


  S.fn.renderOrders = function renderOrders() {
    const orders = S.fn.filteredOrders();
    return S.fn.pageHeading('Đơn hàng', '', `${S.fn.canAccessRoute('pos') ? `<button class='btn btn-primary' data-route='pos'><span class='btn-icon'>＋</span> Bán hàng</button>` : ''}<button class='btn btn-secondary' data-action='open-warranty-lookup'>Tra cứu bảo hành</button>${S.fn.canExportData() ? `<button class='btn btn-secondary' data-action='open-export'>Xuất CSV</button>` : ''}`) +
      `<div class='toolbar'><div class='toolbar-left'><div class='search-wrap'><span class='search-symbol'>⌕</span><input class='input' id='order-search' type='search' placeholder='Tìm đơn, tên hoặc số điện thoại…' value='${S.fn.esc(S.state.searchTerms.orders)}' aria-label='Tìm đơn hàng hoặc SKU'></div></div><div class='toolbar-right'><div class='segmented'>${['Tất cả', 'Hoàn tất', 'Còn nợ', 'Trả một phần', 'Đã trả hàng'].map(function (status) { return `<button class='segment ${S.state.orderFilter === status ? 'active' : ''}' data-action='order-filter' data-filter='${status}'>${status}</button>`; }).join('')}</div></div></div><section class='panel'><div class='table-wrap'><table class='data-table'><thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Thời gian</th><th>Sản phẩm</th><th class='text-right'>Giá trị</th><th>Trạng thái</th><th></th></tr></thead><tbody>${S.fn.orderRows(orders) || `<tr><td colspan='7'><div class='empty-state'><strong>${S.state.orderNextOffset === null && !S.state.orderOffset ? 'Chưa có đơn hàng' : 'Không tìm thấy đơn hàng'}</strong><span>Đơn bán mới sẽ xuất hiện ở đây.</span></div></td></tr>`}</tbody></table></div><div class='pagination'><span>Hiển thị ${orders.length} trên ${S.fn.number(S.state.orderTotal)} đơn</span><span class='pagination-actions'>${S.state.orderOffset > 0 ? `<button class='page-button' data-action='orders-page' data-offset='${Math.max(0, S.state.orderOffset - 100)}'>‹</button>` : ''}<span class='page-button current'>${Math.floor(S.state.orderOffset / 100) + 1}</span>${S.state.orderNextOffset !== null ? `<button class='page-button' data-action='orders-page' data-offset='${S.state.orderNextOffset}'>›</button>` : ''}</span></div></section>`;
  }


  S.fn.openOrder = async function openOrder(id, receipt = false) {
    if (!id) return;
    const request = ++S.state.orderDetailRequest;
    if (id.startsWith('local:')) return S.fn.openLocalOrder(id.slice(6));
    const generation = S.state.modalGeneration;
    const openedOnPage = S.state.page;
    const session = S.state.authSession;
    const wasHidden = S.dom.modal.hidden;
    const canShow = () => request === S.state.orderDetailRequest && S.state.modalGeneration === generation && S.state.page === openedOnPage && S.state.authSession === session && S.dom.modal.hidden === wasHidden;
    let o;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/orders/${encodeURIComponent(id)}`);
      if (!canShow()) return;
      const row = result.order;
      const payments = row.payments.filter(function (p) { return p.status === 'succeeded'; });
      const paid = payments.reduce(function (sum, p) { return sum + Number(p.amount_vnd); }, 0);
      const refunded = row.returns.reduce(function (sum, r) { return sum + (r.status === 'completed' ? Number(r.refunded_vnd) : 0); }, 0);
      const returned = row.returns.reduce(function (sum, r) { return sum + (r.status === 'completed' ? Number(r.refund_total_vnd) : 0); }, 0);
      const total = Number(row.totalVnd);
      const paidVndText = payments.reduce(function (sum, payment) { return sum + BigInt(payment.amount_vnd); }, 0n).toString();
      const returnedVndText = row.returns.reduce(function (sum, item) { return sum + (item.status === 'completed' ? BigInt(item.refund_total_vnd) : 0n); }, 0n).toString();
      const refundedVndText = row.returns.reduce(function (sum, item) { return sum + (item.status === 'completed' ? BigInt(item.refunded_vnd) : 0n); }, 0n).toString();
      const dueVndExact = row.status === 'voided'
        ? 0n
        : BigInt(row.totalVnd) - BigInt(paidVndText) - BigInt(returnedVndText) + BigInt(refundedVndText);
      const methodLabels = { cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', bank_qr: 'QR ngân hàng', card: 'Thẻ', other: 'Khác' };
      o = {
        id: row.id,
        number: row.number,
        customerId: row.customerId || '',
        customerName: row.customerName || '',
        customerPhone: row.customerPhone || '',
        createdAt: row.occurredAt,
        subtotalVndText: row.subtotalVnd,
        discountVndText: row.discountVnd,
        promotion: row.promotion || null,
        totalVndText: row.totalVnd,
        paidVndText: paidVndText,
        cashReceivedVndText: row.cashReceivedVnd || '0',
        cashChangeVndText: row.cashChangeVnd || '0',
        dueVndText: (dueVndExact > 0n ? dueVndExact : 0n).toString(),
        refundedVndText: refundedVndText,
        subtotal: Number(row.subtotalVnd),
        discount: Number(row.discountVnd),
        total: total,
        paid: paid,
        cashReceived: Number(row.cashReceivedVnd || 0),
        cashChange: Number(row.cashChangeVnd || 0),
        paymentLines: payments.map(function (payment) { return { method: methodLabels[payment.method] || payment.method, amount: Number(payment.amount_vnd), amountVnd: payment.amount_vnd }; }),
        refunded: refunded,
        returned: returned,
        due: row.status === 'voided' ? 0 : Math.max(0, total - paid - returned + refunded),
        status: S.fn.statusText(row.status, total - paid - returned + refunded),
        rawStatus: row.status,
        einvoiceProvider: row.einvoiceProvider || null,
        einvoiceNumber: row.einvoiceNumber || null,
        einvoiceLookupCode: row.einvoiceLookupCode || null,
        einvoiceStatus: row.einvoiceStatus || 'none',
        shippingProvider: row.shippingProvider || null,
        shippingTrackingCode: row.shippingTrackingCode || null,
        shippingFeeVnd: row.shippingFeeVnd || '0',
        shippingStatus: row.shippingStatus || 'none',
        voidRestockWarehouseId: row.voidRestockWarehouseId || '',
        voidRestockWarehouseName: row.voidRestockWarehouseName || '',
        method: Array.from(new Set(payments.map(function (p) { return methodLabels[p.method] || p.method; }))).join(' · ') || 'Chưa thu tiền',
        cashierName: row.cashierName || row.actorName || '',
        note: row.note || '',
        internalNotes: S.fn.mergeOrderNotes(S.state.orderNoteHistoryCache.get(id) || [], Array.isArray(row.internalNotes) ? row.internalNotes : []),
        internalNotesTotal: Number(row.internalNotesTotal) || 0,
        tags: Array.isArray(row.tags) ? row.tags : [],
        items: row.items.map(function (line) {
          return {
            orderLineId: line.id,
            productId: line.product_id,
            name: line.product_name_snapshot,
            sku: line.sku_snapshot,
            unit: line.unit_snapshot,
            qty: Number(line.quantity),
            returnedQty: Number(line.returned_quantity),
            price: Number(line.unit_price_vnd),
            priceVnd: line.unit_price_vnd,
            cost: Number(line.unit_cost_vnd),
            discount: Number(line.discount_vnd),
            discountVnd: line.discount_vnd,
            total: Number(line.line_total_vnd),
            totalVnd: line.line_total_vnd,
            soldSerialCodes: Array.isArray(line.sold_serial_codes) ? line.sold_serial_codes.filter(Boolean) : [],
          };
        }),
        returns: row.returns,
      };
      S.state.orderNoteHistoryCache.set(id, o.internalNotes);
      if (!S.state.orderNoteHistoryCursor.has(id) || (!S.state.orderNoteHistoryCursor.get(id) && o.internalNotes.length < o.internalNotesTotal)) {
        S.state.orderNoteHistoryCursor.set(id, row.internalNotesNextBeforeId || null);
      }
      const cached = S.state.store.orders.find(function (item) { return item.id === o.id; });
      if (cached) Object.assign(cached, o);
      else S.state.store.orders.unshift(o);
    } catch (error) {
      if (canShow()) S.fn.toast('Chưa tải được đơn hàng', error.message, 'error');
      return;
    }
    if (receipt) {
      S.fn.showModal('Biên nhận số', 'Chọn cách lưu hoặc gửi cho khách.', '', `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button>`);
      S.fn.showDigitalReceipt(id);
      return;
    }
    const c = S.fn.customerById(o.customerId);
    const items = o.items.map(function (i) {
      const serialChips = (i.soldSerialCodes || []).length
        ? `<div style='display:flex;flex-wrap:wrap;gap:6px;margin-top:4px'>${i.soldSerialCodes.map(function (code) { return `<button type='button' class='serial-chip' data-action='lookup-serial-warranty' data-code='${S.fn.esc(code)}' title='Xem bảo hành Serial/IMEI'>BH: ${S.fn.esc(code)}</button>`; }).join('')}</div>`
        : '';
      const discTag = Number(i.discount || 0) > 0
        ? ` <small style='color:var(--primary-hover);font-weight:600'>· Giảm món −${S.fn.money(i.discount)}</small>`
        : '';
      return `<div class='detail-line' style='flex-wrap:wrap'><span>${S.fn.esc(i.name)} <small>× ${S.fn.number(i.qty)} ${S.fn.esc(i.unit)}</small>${discTag}${serialChips}</span><strong>${S.fn.money(i.total)}</strong></div>`;
    }).join('');
    const returnHistory = o.returns.map(function (r) { return `<div class='timeline-item'><span class='timeline-dot'></span><span><strong>Trả hàng ${S.fn.esc(r.return_number)}</strong><small>${S.fn.humanDate(r.occurred_at, true)} · ${S.fn.money(Number(r.refund_total_vnd))}${r.restock_warehouse_name ? ` · Nhập lại ${S.fn.esc(r.restock_warehouse_name)}` : ''}</small></span></div>`; }).join('');
    const deliveryNoteBlock = o.note && o.note.startsWith('[GIAO HÀNG]')
      ? `<div class='timeline-item'><span class='timeline-dot'></span><span><strong>Đơn giao hàng</strong><small>${S.fn.esc(o.note.replace(/^\[GIAO HÀNG\]\s*/, ''))}</small></span></div>`
      : '';
    const body = `<div class='order-details'><section class='panel detail-card'><div class='detail-heading'><div><h2>${S.fn.esc(o.number)}</h2><p>${S.fn.humanDate(o.createdAt, true)}${c ? ' · ' + S.fn.esc(c.name) : ' · Khách lẻ'}</p></div>${S.fn.statusBadge(o.status)}</div><div class='detail-lines'>${items}<div class='detail-line'><span>Tạm tính</span><strong>${S.fn.money(o.subtotal)}</strong></div>${o.discount ? `<div class='detail-line'><span>Giảm giá</span><strong>−${S.fn.money(o.discount)}</strong></div>` : ''}${o.promotion ? `<div class='detail-line'><span>Mã ${S.fn.esc(o.promotion.code)}</span><strong>−${S.fn.moneyVndText(o.promotion.discountVnd)}</strong></div>` : ''}<div class='detail-line'><span>Tổng đã thu</span><strong>${S.fn.money(o.paid)}</strong></div>${o.paymentLines.map(function (payment) { return `<div class='detail-line'><span>· ${S.fn.esc(payment.method)}</span><strong>${S.fn.money(payment.amount)}</strong></div>`; }).join('')}${o.cashReceived ? `<div class='detail-line'><span>Tiền mặt khách đưa</span><strong>${S.fn.money(o.cashReceived)}</strong></div>` : ''}${o.cashChange ? `<div class='detail-line'><span>Tiền thối</span><strong>−${S.fn.money(o.cashChange)}</strong></div>` : ''}${o.refunded ? `<div class='detail-line'><span>Đã hoàn tiền</span><strong>−${S.fn.money(o.refunded)}</strong></div>` : ''}${o.due ? `<div class='detail-line'><span>Còn phải thu</span><strong style='color:#aa762a'>${S.fn.money(o.due)}</strong></div>` : ''}<div class='detail-total'><span>Tổng cộng</span><strong>${S.fn.money(o.total)}</strong></div></div></section><section class='panel detail-card'><div class='section-title'><h2>Thông tin giao dịch</h2><p>Biên nhận và thay đổi được lưu trên máy chủ</p></div><div class='order-timeline'><div class='timeline-item'><span class='timeline-dot'></span><span><strong>Đơn hàng đã tạo</strong><small>${S.fn.humanDate(o.createdAt, true)}</small></span></div>${deliveryNoteBlock}<div class='timeline-item'><span class='timeline-dot'></span><span><strong>${o.due > 0 ? 'Còn khoản phải thu' : 'Đã thu đủ'}</strong><small>${o.due > 0 ? `Còn phải thu ${S.fn.money(o.due)} · Đã thu ${S.fn.money(o.paid)}` : `${S.fn.money(o.paid)} · ${S.fn.esc(o.method)}`}</small></span></div>${o.rawStatus === 'voided' ? `<div class='timeline-item'><span class='timeline-dot'></span><span><strong>Đơn đã hủy</strong><small>Hoàn tồn vào kho ${S.fn.esc(o.voidRestockWarehouseName || 'đã ghi nhận')}</small></span></div>` : ''}${returnHistory}${c ? `<div class='timeline-item'><span class='timeline-dot'></span><span><strong>Khách hàng: ${S.fn.esc(c.name)}</strong><small>${S.fn.esc(c.phone)}</small></span></div>` : ''}</div>${o.note && !deliveryNoteBlock ? `<div class='modal-note'>${S.fn.esc(o.note)}</div>` : ''}</section></div>`;
    const pendingMutation = S.fn.loadPendingOrderMutation(o.id);
    const canCollaborate = S.fn.hasPerm('posSell') || S.fn.hasPerm('viewOrders') || S.fn.hasPerm('recordCashbook');
    const tagChips = o.tags.map(function (tag) {
      return `<span class='order-tag-chip'>#${S.fn.esc(tag.label)}${canCollaborate ? `<button type='button' data-action='order-tag-remove' data-id='${S.fn.esc(o.id)}' data-tag='${S.fn.esc(tag.label)}' aria-label='Gỡ nhãn ${S.fn.esc(tag.label)}' ${pendingMutation ? 'disabled' : ''}>×</button>` : ''}</span>`;
    }).join('');
    const pendingHint = pendingMutation
      ? `<div class='install-hint order-mutation-pending' role='status'>Thao tác ${pendingMutation.kind === 'note' ? 'ghi chú' : 'nhãn'} đang chờ máy chủ xác nhận. Hãy gửi lại đúng nội dung đã lưu trên thiết bị.<button type='button' class='btn btn-secondary' data-action='retry-order-mutation' data-id='${S.fn.esc(o.id)}'>Thử lại thao tác</button></div>`
      : '';
    const collaborationPanel = `<section class='panel detail-card order-collaboration-card'><div class='section-title'><h2>Ghi chú nội bộ &amp; nhãn</h2><p>Chỉ nhân viên cửa hàng xem được; lịch sử được giữ lại để truy vết.</p></div>${pendingHint}<div class='order-tags-list'>${tagChips || `<span class='muted'>Chưa có nhãn</span>`}</div>${canCollaborate ? `<form id='order-tag-form' data-form='order-tag' data-id='${S.fn.esc(o.id)}' class='order-tag-form'><label class='input-label' for='order-tag-input'>Gắn nhãn đơn hàng</label><div><input class='input' id='order-tag-input' name='tag' maxlength='32' autocomplete='off' placeholder='Ví dụ: Giao gấp, Khách VIP' required ${pendingMutation ? 'disabled' : ''}/><button class='btn btn-secondary' type='submit' ${pendingMutation ? 'disabled' : ''}>Gắn nhãn</button></div></form>` : ''}${S.fn.renderOrderNoteHistory(o.id, o.internalNotesTotal, o.internalNotes)}${canCollaborate ? `<form id='order-note-form' data-form='order-note' data-id='${S.fn.esc(o.id)}' class='order-note-form'><label class='input-label' for='order-note-input'>Thêm ghi chú nội bộ</label><textarea class='input' id='order-note-input' name='note' rows='3' maxlength='1000' placeholder='Thông tin chỉ dành cho nhân viên cửa hàng…' required ${pendingMutation ? 'disabled' : ''}>${pendingMutation?.kind === 'note' ? S.fn.esc(pendingMutation.payload.note) : ''}</textarea><button class='btn btn-primary' type='submit' ${pendingMutation ? 'disabled' : ''}>Thêm ghi chú</button></form>` : ''}</section>`;
    const canCollect = o.due > 0 && o.customerId && (S.fn.hasPerm('posSell') || S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports'));
    const canVoid = S.fn.hasPerm('voidOrReturnOrder') && o.rawStatus === 'completed' && o.paid === 0 && o.returned === 0;
    const canReturn = S.fn.hasPerm('voidOrReturnOrder') && o.status !== 'Đã hủy' && o.items.some(item => item.returnedQty < item.qty);
    const primary = canCollect ? `<button class='btn btn-primary' data-action='collect-payment' data-id='${o.id}'>Thu tiền còn thiếu</button>`
      : canReturn ? `<button class='btn btn-secondary' data-action='exchange-order' data-id='${o.id}'>Đổi hàng</button><button class='btn btn-primary' data-action='return-order' data-id='${o.id}'>Trả hàng</button>` : '';
    const integrationActions = window.SlinkIntegrationsUI ? window.SlinkIntegrationsUI.renderOrderIntegrationSection({
      order: o,
      settings: S.state.integrationState.data?.settings,
      role: S.state.store.role,
      canOperate: S.fn.hasPerm('posSell') || S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports'),
      canShipping: S.fn.hasPerm('posSell') || S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('manageInventory'),
    }) : '';
    const more = `<details class='order-more-actions'><summary>Thao tác khác</summary><p>Đơn đã ghi được giữ nguyên để đối soát. Chọn thu tiền, đổi hàng, trả hàng hoặc hủy đơn khi cần điều chỉnh.</p><div class='order-more-actions-buttons'><button class='btn btn-secondary' data-action='print-order' data-id='${o.id}'>In biên nhận</button><button class='btn btn-secondary' data-action='share-order' data-id='${o.id}'>Chia sẻ biên nhận</button>${canCollect && canReturn ? `<button class='btn btn-secondary' data-action='exchange-order' data-id='${o.id}'>Đổi hàng</button><button class='btn btn-secondary' data-action='return-order' data-id='${o.id}'>Trả hàng</button>` : ''}${canVoid ? `<button class='btn btn-danger' data-action='void-order' data-id='${o.id}'>Hủy đơn</button>` : ''}</div>${integrationActions}${collaborationPanel}</details>`;
    const completeBody = body.replace(/<\/div>$/, `${more}</div>`);
    const footer = `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button>${primary}`;
    S.fn.showModal('Chi tiết đơn hàng', 'Hàng đã bán, tiền đã thu và phần còn phải thu.', completeBody, footer, true);
  }


  S.fn.mergeOrderNotes = function mergeOrderNotes() {
    const byId = new Map();
    Array.from(arguments).flat().forEach(function (note) {
      if (note && note.id != null) byId.set(String(note.id), note);
    });
    return Array.from(byId.values()).sort(function (left, right) {
      const leftId = BigInt(left.id);
      const rightId = BigInt(right.id);
      return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    });
  }


  S.fn.renderOrderNoteHistory = function renderOrderNoteHistory(orderId, total, notes) {
    const rows = notes.map(function (item) {
      return `<article class='order-note-entry'><div><strong>${S.fn.esc(item.actor?.name || 'Nhân viên')}</strong><time>${S.fn.humanDate(item.createdAt, true)}</time></div><p>${S.fn.esc(item.note)}</p></article>`;
    }).join('');
    const hasMore = Boolean(S.state.orderNoteHistoryCursor.get(orderId));
    const loading = S.state.orderNoteHistoryLoading.has(orderId);
    const moreButton = hasMore
      ? `<button type='button' class='btn btn-secondary order-notes-load-more' data-action='load-older-order-notes' data-id='${S.fn.esc(orderId)}' ${loading ? 'disabled' : ''}>${loading ? 'Đang tải ghi chú…' : 'Xem ghi chú cũ hơn'}</button>`
      : '';
    const countHint = notes.length < total ? `<small>Đang hiển thị ${S.fn.number(notes.length)} trên ${S.fn.number(total)} ghi chú.</small>` : '';
    const list = rows || `<div class='empty-state order-notes-empty'><strong>Chưa có ghi chú nội bộ</strong><span>Ghi lại thông tin chăm sóc hoặc lưu ý xử lý đơn.</span></div>`;
    return `<div class='order-note-history' data-order-id='${S.fn.esc(orderId)}' data-total='${total}'><div class='order-notes-heading' tabindex='-1'><strong>Ghi chú (${S.fn.number(total)})</strong>${countHint}</div>${moreButton}<div class='order-note-list'>${list}</div></div>`;
  }


  S.fn.loadOlderOrderNotes = async function loadOlderOrderNotes(orderId) {
    if (S.state.orderNoteHistoryLoading.has(orderId)) return;
    const known = S.state.orderNoteHistoryCache.get(orderId) || [];
    const beforeId = S.state.orderNoteHistoryCursor.get(orderId);
    if (!known.length || !beforeId) return S.fn.toast('Chưa thể tải ghi chú cũ', 'Hãy đóng và mở lại chi tiết đơn hàng để tải dữ liệu mới nhất.', 'error');
    const requestGeneration = S.state.modalGeneration;
    S.state.orderNoteHistoryLoading.add(orderId);
    const button = S.dom.modal.querySelector('.order-notes-load-more');
    if (button) { button.disabled = true; button.textContent = 'Đang tải ghi chú…'; }
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/orders/${encodeURIComponent(orderId)}/internal-notes?beforeId=${encodeURIComponent(beforeId)}&limit=100`);
      const current = S.state.orderNoteHistoryCache.get(orderId) || known;
      const merged = S.fn.mergeOrderNotes(current, Array.isArray(result.notes) ? result.notes : []);
      S.state.orderNoteHistoryCache.set(orderId, merged);
      S.state.orderNoteHistoryCursor.set(orderId, result.nextBeforeId || null);
      S.state.orderNoteHistoryLoading.delete(orderId);
      if (requestGeneration === S.state.modalGeneration && !S.dom.modal.hidden) {
        const history = S.dom.modal.querySelector('.order-note-history');
        if (history && history.dataset.orderId === orderId) {
          history.outerHTML = S.fn.renderOrderNoteHistory(orderId, Number(history.dataset.total) || 0, merged);
          const focusTarget = S.dom.modal.querySelector('.order-notes-load-more') || S.dom.modal.querySelector('.order-notes-heading');
          if (focusTarget) focusTarget.focus();
        }
      }
    } catch (error) {
      S.state.orderNoteHistoryLoading.delete(orderId);
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để tải lịch sử ghi chú.', 'error');
      else S.fn.toast('Chưa tải được ghi chú cũ', error.message, 'error');
      if (button && button.isConnected) { button.disabled = false; button.textContent = 'Thử tải lại ghi chú cũ'; }
    }
  }


  S.fn.sendPendingOrderMutation = async function sendPendingOrderMutation(orderId) {
    const pending = S.fn.loadPendingOrderMutation(orderId);
    if (!pending) return S.fn.toast('Không có thao tác đang chờ', 'Nhập lại ghi chú hoặc nhãn để tạo yêu cầu mới.', 'error');
    const submit = S.dom.modal.querySelector('[data-action="retry-order-mutation"]')
      || S.dom.modal.querySelector(pending.kind === 'note' ? '#order-note-form button[type="submit"]' : '#order-tag-form button[type="submit"]');
    if (submit) submit.disabled = true;
    const endpoint = pending.kind === 'note' ? 'internal-notes' : 'tags';
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/orders/${encodeURIComponent(orderId)}/${endpoint}`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      S.fn.clearPendingOrderMutation(orderId);
      S.fn.emitSyncDomains(['orders'], { source: 'order-mutation' });
      S.fn.toast(pending.kind === 'note' ? 'Đã thêm ghi chú' : 'Đã cập nhật nhãn', 'Thao tác đã được lưu vào lịch sử đơn hàng.');
      await S.fn.openOrder(orderId);
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingOrderMutation(orderId);
      }
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra thao tác đang chờ.', 'error');
      else S.fn.toast('Chưa cập nhật được đơn hàng', error.message, 'error');
      if (submit && submit.isConnected) submit.disabled = false;
    }
  }


  S.fn.saveOrderNote = function saveOrderNote(form) {
    const orderId = form.dataset.id;
    const existing = S.fn.loadPendingOrderMutation(orderId);
    if (existing) return S.fn.sendPendingOrderMutation(orderId);
    const note = String(new FormData(form).get('note') || '').trim();
    if (!note) return S.fn.toast('Ghi chú đang trống', 'Nhập nội dung cần lưu cho nhân viên cửa hàng.', 'error');
    const pending = { orderId, kind: 'note', key: S.fn.newIdempotencyKey(), payload: { note } };
    if (!S.fn.savePendingOrderMutation(pending)) return S.fn.pendingSaveFailed();
    return S.fn.sendPendingOrderMutation(orderId);
  }


  S.fn.changeOrderTag = function changeOrderTag(orderId, operation, tag) {
    const existing = S.fn.loadPendingOrderMutation(orderId);
    if (existing) return S.fn.sendPendingOrderMutation(orderId);
    const pending = { orderId, kind: 'tag', key: S.fn.newIdempotencyKey(), payload: { operation, tag } };
    if (!S.fn.savePendingOrderMutation(pending)) return S.fn.pendingSaveFailed();
    return S.fn.sendPendingOrderMutation(orderId);
  }


  S.fn.openVoidOrder = function openVoidOrder(orderId) {
    const defaultWarehouseId = (S.state.warehouses.find(function (warehouse) { return warehouse.is_default; }) || S.state.warehouses[0] || {}).id || '';
    const voidWarehouseId = S.state.selectedWarehouseId || defaultWarehouseId;
    const options = S.state.warehouses.map(function (warehouse) { return `<option value='${S.fn.esc(warehouse.id)}' ${warehouse.id === voidWarehouseId ? 'selected' : ''}>${S.fn.esc(warehouse.name)}${warehouse.is_default ? ' · Kho chính' : ''}</option>`; }).join('');
    const warehouseField = S.state.warehouses.length > 1
      ? `<div class='form-field full'><label class='input-label' for='void-restock-warehouse'>Kho nhận hàng hoàn lại *</label><div class='select-wrap'><select class='input' id='void-restock-warehouse' name='warehouseId' required>${options}</select></div></div>`
      : `<input type='hidden' name='warehouseId' value='${S.fn.esc(voidWarehouseId)}'/>`;
    const form = `<form id='entity-form' data-form='void-order' data-id='${S.fn.esc(orderId)}'><div class='notice-item'><span>${S.fn.icon('alert', 18)}</span><span><strong>Hủy đơn sẽ hoàn lại tồn kho và xóa khoản nợ của đơn bằng bút toán đảo.</strong><small>Đơn đã thu tiền phải xử lý qua trả hàng/hoàn tiền. Lịch sử đơn và lý do hủy vẫn được giữ lại.</small></span></div><div class='form-grid' style='margin-top:14px'>${warehouseField}</div><label class='install-hint' style='display:flex;align-items:flex-start;gap:9px;margin-top:14px'><input type='checkbox' name='stockConfirmed' required style='margin-top:2px;flex:none'/>Tôi xác nhận hàng chưa giao hoặc đã được đưa lại cửa hàng.</label><div class='form-field full' style='margin-top:14px'><label class='input-label' for='void-reason'>Lý do hủy *</label><textarea class='input' id='void-reason' name='reason' rows='3' required minlength='1' maxlength='450' placeholder='Ví dụ: tạo nhầm đơn trước khi thu tiền' style='height:auto;padding:10px'></textarea></div></form>`;
    S.fn.modalForm('Hủy đơn hàng', 'Chỉ hủy được đơn chưa thu tiền và chưa trả hàng.', form, 'Xác nhận hủy đơn', true);
  }


  S.fn.saveVoidOrder = async function saveVoidOrder(form) {
    const orderId = form.dataset.id;
    const data = new FormData(form);
    const reason = String(data.get('reason') || '').trim();
    if (!reason) return S.fn.toast('Cần nhập lý do', 'Ghi lý do để cửa hàng có thể truy vết việc hủy.', 'error');
    const warehouseId = String(data.get('warehouseId') || '');
    if (!warehouseId) return S.fn.toast('Chưa chọn kho nhận tồn', 'Chọn kho đang hoạt động để nhận lại hàng.', 'error');
    const submit = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/orders/${encodeURIComponent(orderId)}/void`, {
        method: 'POST', body: { reason: reason, warehouseId: warehouseId, stockConfirmed: data.get('stockConfirmed') === 'on' },
      });
      S.fn.closeModal();
      S.fn.emitSyncDomains(['orders', 'stock', 'products', 'cashbook', 'debts', 'customers', 'dashboard', 'reports'], { source: 'void-order' });
      await Promise.all([
        S.fn.loadProductsPage('', 0), S.fn.loadInventoryPage('', 0),
        S.fn.loadOrdersPage('', 0), S.fn.loadFinancePage(),
      ]);
      S.fn.render();
      S.fn.toast(result.alreadyVoided ? 'Đơn đã được hủy trước đó' : 'Đã hủy đơn hàng', 'Tồn kho và công nợ đã được cập nhật bằng bút toán đảo.');
      await S.fn.openOrder(orderId);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa hủy được đơn hàng', error.message, 'error');
      if (submit && submit.isConnected) submit.disabled = false;
    }
  }


  S.fn.openCollectPayment = async function openCollectPayment(orderId) {
    let order;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/orders/${encodeURIComponent(orderId)}`);
      order = result.order;
    } catch (error) { return S.fn.toast('Chưa tải được đơn hàng', error.message, 'error'); }
    const pending = S.fn.loadPendingPayment(orderId);
    const paid = order.payments.filter(function (p) { return p.status === 'succeeded'; }).reduce(function (sum, payment) { return sum + Number(payment.amount_vnd); }, 0);
    const refunded = order.returns.reduce(function (sum, row) { return sum + Number(row.refunded_vnd); }, 0);
    const returned = order.returns.reduce(function (sum, row) { return sum + Number(row.refund_total_vnd); }, 0);
    const due = Math.max(0, Number(order.totalVnd) - paid - returned + refunded);
    if (!due && !pending) return S.fn.toast('Đơn hàng đã thanh toán đủ', 'Không còn khoản cần thu.');
    const payload = pending ? pending.payload : { amountVnd: due, method: 'cash', note: '' };
    const disabled = pending ? 'disabled' : '';
    const body = `<form id='entity-form' data-form='payment' data-order-id='${orderId}'><div class='checkout-total'><span>Còn phải thu · ${S.fn.esc(order.number)}</span><strong>${S.fn.money(due)}</strong></div><div class='form-grid'><div class='form-field'><label class='input-label'>Số tiền nhận (VND) *</label><input class='input' name='amountVnd' type='number' min='1' max='${due}' step='1' value='${S.fn.esc(payload.amountVnd)}' required ${disabled}/></div><div class='form-field'><label class='input-label'>Phương thức nhận tiền</label><div class='select-wrap'><select class='input' name='method' ${disabled}><option value='cash' ${payload.method === 'cash' ? 'selected' : ''}>Tiền mặt</option><option value='bank_transfer' ${payload.method === 'bank_transfer' ? 'selected' : ''}>Chuyển khoản</option><option value='bank_qr' ${payload.method === 'bank_qr' ? 'selected' : ''}>QR ngân hàng</option><option value='card' ${payload.method === 'card' ? 'selected' : ''}>Thẻ</option><option value='other' ${payload.method === 'other' ? 'selected' : ''}>Khác</option></select></div></div><div class='form-field full'><label class='input-label'>Ghi chú</label><input class='input' name='note' maxlength='300' value='${S.fn.esc(payload.note || '')}' placeholder='Ghi chú không bắt buộc' ${disabled}/></div></div><div class='modal-note'>Slink ghi khoản thu vào đơn hàng, công nợ khách và sổ quỹ. Chuyển khoản và QR được nhân viên xác nhận thủ công.</div>${pending ? `<div class='modal-note'>Yêu cầu thu tiền đang chờ xác nhận. Hãy gửi lại cùng nội dung để tránh ghi nhận hai lần.</div>` : ''}</form>`;
    S.fn.showModal(pending ? 'Kiểm tra khoản thu đang chờ' : 'Ghi nhận khách thanh toán', 'Ghi lại số tiền khách vừa trả cho đơn hàng.', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Quay lại đơn</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại khoản thu' : 'Lưu khoản thu'}</button>`);
  }


  S.fn.savePayment = async function savePayment(form) {
    const orderId = form.dataset.orderId;
    let pending = S.fn.loadPendingPayment(orderId);
    if (!pending) {
      const data = new FormData(form);
      const amount = Number(data.get('amountVnd'));
      if (!Number.isSafeInteger(amount) || amount <= 0) return S.fn.toast('Số tiền không hợp lệ', 'Nhập số tiền bằng VND nguyên dương.', 'error');
      pending = { storeId: S.state.store.id, orderId: orderId, key: S.fn.newIdempotencyKey(), payload: { amountVnd: amount, method: String(data.get('method') || 'cash'), note: String(data.get('note') || '').trim() } };
    }
    if (!S.fn.savePendingPayment(pending)) return S.fn.pendingSaveFailed();
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/orders/${encodeURIComponent(orderId)}/payments`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      S.fn.clearPendingPayment(orderId);
      S.fn.closeModal();
      S.fn.emitSyncDomains(['orders', 'cashbook', 'debts', 'customers', 'dashboard', 'reports'], { source: 'order-payment' });
      await Promise.all([S.fn.loadCustomersPage(S.state.searchTerms.customers, S.state.customerOffset), S.fn.loadOrdersPage(S.state.searchTerms.orders, S.state.orderOffset)]);
      S.fn.toast('Đã ghi nhận khoản thu', S.fn.money(Number(result.payment.amountVnd)));
      await S.fn.openOrder(orderId);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra khoản thu.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingPayment(orderId);
        if (!S.dom.modal.hidden) S.fn.openCollectPayment(orderId);
      }
      S.fn.toast('Chưa lưu được khoản thu', error.message, 'error');
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }


  S.fn.openReturn = async function openReturn(orderId) {
    let order;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/orders/${encodeURIComponent(orderId)}`);
      order = result.order;
    } catch (error) {
      return S.fn.toast('Chưa tải được đơn hàng', error.message, 'error');
    }
    const saved = S.fn.loadPendingReturn(orderId);
    S.state.returnPending = saved;
    const returnMap = new Map((saved && saved.payload.items || []).map(function (item) { return [item.orderLineId, Number(item.quantity)]; }));
    const returnSerialMap = new Map((saved && saved.payload.items || []).map(function (item) { return [item.orderLineId, new Set(item.serialCodes || [])]; }));
    const lines = order.items.filter(function (line) { return Number(line.returned_quantity) < Number(line.quantity); });
    if (!lines.length) return S.fn.toast('Đơn hàng đã trả đủ', 'Không còn sản phẩm nào có thể trả.');
    const lineMarkup = lines.map(function (line) {
      const remaining = Number(line.quantity) - Number(line.returned_quantity);
      const soldSerials = Array.isArray(line.sold_serial_codes) ? line.sold_serial_codes.filter(Boolean) : [];
      const savedSerials = returnSerialMap.get(line.id) || new Set();
      const quantity = soldSerials.length ? savedSerials.size : (returnMap.has(line.id) ? returnMap.get(line.id) : 0);
      const disabled = saved ? 'disabled' : '';
      const serialPicker = soldSerials.length
        ? `<div class='return-serial-picker' data-return-serials-for='${S.fn.esc(line.id)}' style='display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;width:100%'>${soldSerials.map(function (code) { return `<label style='display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border:1px solid var(--border);border-radius:999px;font-size:12px;cursor:pointer'><input type='checkbox' data-return-serial-check='${S.fn.esc(line.id)}' value='${S.fn.esc(code)}' ${savedSerials.has(code) ? 'checked' : ''} ${disabled}/><code>${S.fn.esc(code)}</code></label>`; }).join('')}</div>`
        : '';
      return `<div class='detail-line' style='gap:12px;flex-wrap:wrap'><span>${S.fn.esc(line.product_name_snapshot)}<small> Còn trả ${S.fn.number(remaining)} ${S.fn.esc(line.unit_snapshot)}${soldSerials.length ? ' · tích chọn mã riêng trả lại' : ''}</small></span><input class='input' data-return-line='${line.id}' type='number' min='0' max='${remaining}' step='${soldSerials.length ? '1' : '0.001'}' value='${quantity}' aria-label='Số lượng trả ${S.fn.esc(line.product_name_snapshot)}' style='max-width:125px' ${soldSerials.length ? 'readonly' : ''} ${disabled}/>${serialPicker}</div>`;
    }).join('');
    const disabled = saved ? 'disabled' : '';
    const reason = saved ? saved.payload.reason : '';
    const restock = saved ? saved.payload.restockPolicy : 'restock';
    const refundMethod = saved ? saved.payload.refundMethod : 'cash';
    const restockWarehouseId = saved ? (saved.payload.restockWarehouseId || '') : (S.state.selectedWarehouseId || ((S.state.warehouses.find(function (warehouse) { return warehouse.is_default; }) || S.state.warehouses[0] || {}).id || ''));
    const restockWarehouseOptions = S.state.warehouses.map(function (warehouse) { return `<option value='${S.fn.esc(warehouse.id)}' ${warehouse.id === restockWarehouseId ? 'selected' : ''}>${S.fn.esc(warehouse.name)}${warehouse.is_default ? ' · Kho chính' : ''}</option>`; }).join('');
    const restockWarehouseField = S.state.warehouses.length > 1
      ? `<div class='form-field full'><label class='input-label' for='return-restock-warehouse'>Kho nhận hàng hoàn</label><div class='select-wrap'><select class='input' id='return-restock-warehouse' name='restockWarehouseId' ${disabled}>${restockWarehouseOptions}</select></div></div>`
      : `<input type='hidden' name='restockWarehouseId' value='${S.fn.esc(restockWarehouseId)}'/>`;
    const body = `<form id='entity-form' data-form='return' data-order-id='${orderId}'><div class='checkout-total'><span>Đơn hàng</span><strong>${S.fn.esc(order.number)}</strong></div><div class='detail-lines'>${lineMarkup}</div><div class='form-grid' style='margin-top:14px'><div class='form-field full'><label class='input-label'>Lý do trả hàng *</label><input class='input' name='reason' required minlength='2' maxlength='500' value='${S.fn.esc(reason)}' placeholder='Ví dụ: đổi size, sản phẩm lỗi' ${disabled}/></div>${restockWarehouseField}<div class='form-field'><label class='input-label'>Tình trạng hàng</label><div class='select-wrap'><select class='input' name='restockPolicy' ${disabled}><option value='restock' ${restock === 'restock' ? 'selected' : ''}>Còn bán được · nhập lại kho</option><option value='damaged' ${restock === 'damaged' ? 'selected' : ''}>Hư hỏng · không nhập kho</option><option value='discarded' ${restock === 'discarded' ? 'selected' : ''}>Bỏ hàng · không nhập kho</option></select></div></div><div class='form-field'><label class='input-label'>Phương thức hoàn tiền</label><div class='select-wrap'><select class='input' name='refundMethod' ${disabled}><option value='cash' ${refundMethod === 'cash' ? 'selected' : ''}>Tiền mặt</option><option value='bank_transfer' ${refundMethod === 'bank_transfer' ? 'selected' : ''}>Chuyển khoản</option><option value='bank_qr' ${refundMethod === 'bank_qr' ? 'selected' : ''}>QR ngân hàng</option><option value='card' ${refundMethod === 'card' ? 'selected' : ''}>Thẻ</option><option value='other' ${refundMethod === 'other' ? 'selected' : ''}>Khác</option></select></div></div></div><div class='modal-note'>Slink tính tiền hoàn theo giá đã bán và mức giảm giá của từng sản phẩm. Chọn kho đang hoạt động để nhận hàng còn bán được. Phần đơn chưa thanh toán được chuyển thành số dư khách hàng nếu đơn có gắn hồ sơ khách.</div>${saved ? `<div class='modal-note'>Thao tác trả hàng đang chờ xác nhận. Gửi lại cùng nội dung để tránh ghi nhận hai lần.</div>` : ''}</form>`;
    S.fn.showModal(saved ? 'Kiểm tra trả hàng đang chờ' : 'Trả một phần đơn hàng', 'Chọn số lượng khách trả lại và cách xử lý hàng.', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Quay lại đơn</button><button class='btn btn-primary' type='submit' form='entity-form'>${saved ? 'Thử lại trả hàng' : 'Xác nhận trả hàng'}</button>`, true);
  }


  S.fn.saveReturn = async function saveReturn(form) {
    const orderId = form.dataset.orderId;
    let pending = S.fn.loadPendingReturn(orderId);
    if (!pending) {
      const data = new FormData(form);
      const items = Array.from(form.querySelectorAll('[data-return-line]')).map(function (input) {
        const lineId = input.dataset.returnLine;
        const serialChecks = Array.from(form.querySelectorAll(`[data-return-serial-check="${CSS.escape(lineId)}"]:checked`)).map(function (el) { return el.value; });
        const item = { orderLineId: lineId, quantity: serialChecks.length ? serialChecks.length : (Number(input.value) || 0) };
        if (serialChecks.length) item.serialCodes = serialChecks;
        return item;
      }).filter(function (item) { return item.quantity > 0; });
      if (!items.length) return S.fn.toast('Chưa chọn sản phẩm', 'Nhập số lượng lớn hơn 0 cho ít nhất một dòng.', 'error');
      for (const item of items) {
        if (!Number.isFinite(item.quantity) || item.quantity < 0 || Math.abs(item.quantity * 1000 - Math.round(item.quantity * 1000)) > 1e-6) return S.fn.toast('Số lượng không hợp lệ', 'Số lượng trả tối đa có 3 chữ số thập phân.', 'error');
      }
      const reason = String(data.get('reason') || '').trim();
      if (reason.length < 2) return S.fn.toast('Cần ghi lý do trả hàng', 'Nhập lý do từ 2 ký tự trở lên.', 'error');
      const restockPolicy = String(data.get('restockPolicy') || 'restock');
      const restockWarehouseId = String(data.get('restockWarehouseId') || '');
      if (restockPolicy === 'restock' && !restockWarehouseId) return S.fn.toast('Chưa có kho nhận hàng', 'Chọn kho đang hoạt động để nhập lại hàng hoàn.', 'error');
      pending = {
        storeId: S.state.store.id,
        orderId: orderId,
        key: S.fn.newIdempotencyKey(),
        payload: { items: items, reason: reason, restockPolicy: restockPolicy, restockWarehouseId: restockPolicy === 'restock' ? restockWarehouseId : null, refundMethod: String(data.get('refundMethod') || 'cash') },
      };
      S.state.returnPending = pending;
    }
    if (!S.fn.savePendingReturn()) return S.fn.pendingSaveFailed();
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/orders/${encodeURIComponent(orderId)}/returns`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      S.fn.clearPendingReturn(orderId);
      S.fn.closeModal();
      S.fn.emitSyncDomains(['orders', 'stock', 'products', 'cashbook', 'debts', 'customers', 'dashboard', 'reports'], { source: 'order-return' });
      await Promise.all([S.fn.loadProductsPage('', 0), S.fn.loadOrdersPage(S.state.searchTerms.orders, S.state.orderOffset)]);
      S.fn.toast('Đã ghi nhận trả hàng', `${result.return.number} · ${S.fn.money(Number(result.return.refundTotalVnd))}`);
      await S.fn.openOrder(orderId);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra yêu cầu trả hàng.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingReturn(orderId);
        if (!S.dom.modal.hidden) S.fn.openReturn(orderId);
      }
      S.fn.toast('Chưa hoàn tất được trả hàng', error.message, 'error');
      if (submitButton && !S.dom.modal.hidden) submitButton.disabled = false;
    }
  }


  S.fn.loadPromotionsPage = async function loadPromotionsPage() {
    if (!S.state.authSession || !S.state.store.id || !S.fn.canAccessRoute('promotions')) return;
    const storeId = S.state.store.id;
    const reqNo = ((S.state.promotionsState && S.state.promotionsState.requestNumber) || 0) + 1;
    S.state.promotionsState = { ...(S.state.promotionsState || { rows: [] }), loading: true, error: '', requestNumber: reqNo };
    if (S.state.page === 'promotions') S.fn.render();
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/promotions`);
      if (S.state.store.id !== storeId || S.state.promotionsState?.requestNumber !== reqNo) return;
      S.state.promotionsState = { rows: Array.isArray(result.promotions) ? result.promotions : [], loading: false, error: '', requestNumber: reqNo };
    } catch (error) {
      if (S.state.store.id !== storeId || S.state.promotionsState?.requestNumber !== reqNo) return;
      S.state.promotionsState = { ...(S.state.promotionsState || { rows: [] }), loading: false, error: error.message || 'Chưa tải được mã khuyến mãi.', requestNumber: reqNo };
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    }
    if (S.state.page === 'promotions') S.fn.render();
  }


  S.fn.renderPromotions = function renderPromotions() {
    if (!S.fn.canAccessRoute('promotions')) {
      return `<section class='panel locked-page'><div class='empty-icon'>${S.fn.icon('tag', 23)}</div><h2>Không có quyền quản lý khuyến mãi</h2><p>Chỉ chủ cửa hàng và quản lý được tạo hoặc ngừng mã giảm giá.</p></section>`;
    }
    const state = S.state.promotionsState || { rows: [], loading: false, error: '' };
    const rows = (state.rows || []).map(function (promo) {
      const offer = promo.discountType === 'fixed' ? S.fn.moneyVndText(promo.discountVnd) : `${promo.discountPercent}%`;
      const limit = promo.usageLimit === null ? 'Không giới hạn' : `${S.fn.number(promo.usageCount)} / ${S.fn.number(promo.usageLimit)}`;
      const dates = promo.endsAt ? S.fn.humanDate(promo.endsAt, true) : 'Không giới hạn';
      const badge = promo.isActive ? `<span class='badge badge-success'>Đang áp dụng</span>` : `<span class='badge badge-neutral'>Đã ngừng</span>`;
      return `<tr>
        <td><strong>${S.fn.esc(promo.code)}</strong><div class='muted' style='font-size:12px'>${S.fn.esc(promo.name)}</div></td>
        <td><strong>${S.fn.esc(offer)}</strong><div class='muted' style='font-size:11.5px'>Đơn tối thiểu ${S.fn.moneyVndText(promo.minimumSubtotalVnd)}</div></td>
        <td>${limit}</td>
        <td>${S.fn.esc(dates)}</td>
        <td>${badge}</td>
        <td class='text-right'>${promo.isActive ? `<button type='button' class='btn btn-secondary' data-action='archive-promotion' data-id='${S.fn.esc(promo.id)}' style='min-height:32px;padding:4px 10px'>Ngừng mã</button>` : '—'}</td>
      </tr>`;
    }).join('');
    const mobileCards = (state.rows || []).map(function (promo) {
      const offer = promo.discountType === 'fixed' ? S.fn.moneyVndText(promo.discountVnd) : `${promo.discountPercent}%`;
      const limit = promo.usageLimit === null ? 'Không giới hạn' : `${S.fn.number(promo.usageCount)} / ${S.fn.number(promo.usageLimit)}`;
      return `<article class='product-mobile-card'>
        <div class='product-mobile-info'>
          <strong>${S.fn.esc(promo.code)}</strong>
          <small class='muted'>${S.fn.esc(promo.name)} · ${S.fn.esc(offer)}</small>
          <small class='muted'>Tối thiểu ${S.fn.moneyVndText(promo.minimumSubtotalVnd)} · ${S.fn.esc(limit)}</small>
        </div>
        <div class='product-mobile-side'>
          ${promo.isActive ? `<span class='badge badge-success'>Đang áp dụng</span>` : `<span class='badge badge-neutral'>Đã ngừng</span>`}
          ${promo.isActive ? `<button type='button' class='btn btn-secondary' data-action='archive-promotion' data-id='${S.fn.esc(promo.id)}' style='min-height:32px;padding:4px 10px;font-size:12px'>Ngừng mã</button>` : ''}
        </div>
      </article>`;
    }).join('');
    return S.fn.pageHeading('Khuyến mãi', '', `<button class='btn btn-primary' type='button' data-action='new-promotion'>＋ Tạo mã</button>`) +
      `${state.error ? `<div class='auth-message error'>${S.fn.esc(state.error)}</div>` : ''}` +
      `<section class='panel desktop-only-table'><div class='table-wrap'><table class='data-table'><thead><tr><th>Mã / Chương trình</th><th>Mức giảm</th><th>Lượt dùng</th><th>Hết hạn</th><th>Trạng thái</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan='6'><div class='empty-state'><strong>${state.loading ? 'Đang tải…' : 'Chưa có mã khuyến mãi'}</strong></div></td></tr>`}</tbody></table></div></section>` +
      `<div class='mobile-only-cards'>${mobileCards || `<section class='panel empty-state'><strong>${state.loading ? 'Đang tải…' : 'Chưa có mã khuyến mãi'}</strong></section>`}</div>`;
  }


  S.fn.openPromotions = async function openPromotions() {
    const storeId = S.state.store.id;
    const gen = S.state.modalGeneration;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/promotions`);
      if (S.state.store.id !== storeId || S.state.modalGeneration !== gen) return;
      S.state.promotionsState = { rows: Array.isArray(result.promotions) ? result.promotions : [], loading: false, error: '', requestNumber: ((S.state.promotionsState && S.state.promotionsState.requestNumber) || 0) + 1 };
      const rows = result.promotions.map(function (promo) {
        const offer = promo.discountType === 'fixed' ? S.fn.moneyVndText(promo.discountVnd) : `${promo.discountPercent}%`;
        const limit = promo.usageLimit === null ? 'Không giới hạn lượt' : `${S.fn.number(promo.usageCount)} / ${S.fn.number(promo.usageLimit)} lượt`;
        const dates = promo.endsAt ? `Hết hạn ${S.fn.humanDate(promo.endsAt, true)}` : 'Không đặt ngày hết hạn';
        return `<article class='purchase-order-card'><div class='purchase-order-summary'><div><strong>${S.fn.esc(promo.code)} · ${S.fn.esc(promo.name)}</strong><small>Giảm ${S.fn.esc(offer)} · Đơn tối thiểu ${S.fn.moneyVndText(promo.minimumSubtotalVnd)}</small><small>${S.fn.esc(limit)} · ${S.fn.esc(dates)}</small></div><span class='purchase-order-status ${promo.isActive ? 'status-received' : 'status-cancelled'}'>${promo.isActive ? 'Đang áp dụng' : 'Đã ngừng'}</span></div>${promo.isActive ? `<div class='purchase-order-actions'><button class='link-button danger-link' data-action='archive-promotion' data-id='${S.fn.esc(promo.id)}'>Ngừng mã</button></div>` : ''}</article>`;
      }).join('');
      S.fn.showModal('Mã khuyến mãi', '', `<div class='purchase-order-list'>${rows || `<div class='panel empty-state'><strong>Chưa có mã khuyến mãi</strong></div>`}</div>`, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-primary' type='button' data-action='new-promotion'>＋ Tạo mã</button>`, true);
    } catch (error) { S.fn.toast('Chưa tải được mã khuyến mãi', error.message, 'error'); }
  }


  S.fn.openPromotionCreate = function openPromotionCreate() {
    const form = `<form id='entity-form' data-form='promotion-create'><div class='form-grid'><div class='form-field'><label class='input-label' for='promotion-code'>Mã *</label><input class='input' id='promotion-code' name='code' maxlength='32' pattern='[A-Za-z0-9_-]{3,32}' required placeholder='VD: KHAITRUONG10'/></div><div class='form-field'><label class='input-label' for='promotion-name'>Tên chương trình *</label><input class='input' id='promotion-name' name='name' maxlength='120' required placeholder='Ưu đãi khai trương'/></div><div class='form-field'><label class='input-label' for='promotion-type'>Kiểu giảm</label><div class='select-wrap'><select class='input' id='promotion-type' name='discountType'><option value='percent'>Theo phần trăm</option><option value='fixed'>Số tiền cố định</option></select></div></div><div class='form-field'><label class='input-label' for='promotion-percent'>Phần trăm giảm</label><input class='input' id='promotion-percent' name='discountPercent' type='number' inputmode='decimal' min='0.01' max='100' step='0.01' value='10'/></div><div class='form-field'><label class='input-label' for='promotion-vnd'>Số tiền giảm (VND)</label><input class='input' id='promotion-vnd' name='discountVnd' type='number' inputmode='numeric' min='1' step='1'/></div><div class='form-field'><label class='input-label' for='promotion-minimum'>Đơn tối thiểu (VND)</label><input class='input' id='promotion-minimum' name='minimumSubtotalVnd' type='number' inputmode='numeric' min='0' step='1' value='0'/></div><div class='form-field'><label class='input-label' for='promotion-cap'>Giảm tối đa (VND, tùy chọn)</label><input class='input' id='promotion-cap' name='maximumDiscountVnd' type='number' inputmode='numeric' min='1' step='1'/></div><div class='form-field'><label class='input-label' for='promotion-limit'>Tổng lượt dùng</label><input class='input' id='promotion-limit' name='usageLimit' type='number' min='1' step='1'/></div><div class='form-field'><label class='input-label' for='promotion-customer-limit'>Lượt dùng mỗi khách</label><input class='input' id='promotion-customer-limit' name='perCustomerLimit' type='number' min='1' step='1'/></div><div class='form-field'><label class='input-label' for='promotion-start'>Bắt đầu</label><input class='input' id='promotion-start' name='startsAt' type='datetime-local'/></div><div class='form-field'><label class='input-label' for='promotion-end'>Kết thúc</label><input class='input' id='promotion-end' name='endsAt' type='datetime-local'/></div></div></form>`;
    S.fn.modalForm('Tạo mã khuyến mãi', '', form, 'Tạo mã', true);
  }


  S.fn.savePromotion = async function savePromotion(form) {
    const data = new FormData(form);
    const value = (key) => String(data.get(key) || '').trim();
    const toIso = (key) => { const raw = value(key); return raw ? new Date(raw).toISOString() : null; };
    const discountType = value('discountType');
    const payload = {
      code: value('code'), name: value('name'), discountType,
      discountPercent: discountType === 'percent' ? value('discountPercent') : undefined,
      discountVnd: discountType === 'fixed' ? value('discountVnd') : undefined,
      minimumSubtotalVnd: value('minimumSubtotalVnd') || '0', maximumDiscountVnd: value('maximumDiscountVnd') || null,
      usageLimit: value('usageLimit') || null, perCustomerLimit: value('perCustomerLimit') || null,
      startsAt: toIso('startsAt'), endsAt: toIso('endsAt'),
    };
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/promotions`, { method: 'POST', body: payload });
      S.fn.toast('Đã tạo mã khuyến mãi', payload.code.toUpperCase(), 'success');
      if (S.state.page === 'promotions') { S.fn.closeModal(); await S.fn.loadPromotionsPage(); }
      else S.fn.openPromotions();
    } catch (error) { S.fn.toast('Chưa tạo được mã', error.message, 'error'); }
  }


  S.fn.archivePromotion = async function archivePromotion(id) {
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/promotions/${encodeURIComponent(id)}/archive`, { method: 'POST', body: {} });
      S.fn.toast('Đã ngừng mã khuyến mãi', '', 'success');
      if (S.state.page === 'promotions') await S.fn.loadPromotionsPage();
      else S.fn.openPromotions();
    } catch (error) { S.fn.toast('Chưa ngừng được mã', error.message, 'error'); }
  }


  S.fn.updateOrderExchangePreview = function updateOrderExchangePreview(form) {
    const out = form.querySelector('[data-exchange-preview]');
    if (!out || !window.SlinkReturnsExchangeUI) return;
    let returnTotal = 0n;
    form.querySelectorAll('[data-exchange-ret-row]').forEach(function (row) {
      const qty = Math.max(0, Number(row.querySelector('[name="retQty"]')?.value) || 0);
      const maxQty = Math.max(0.001, Number(row.dataset.maxQty) || 1);
      const remainingTotal = BigInt(row.dataset.remainingTotal || '0');
      if (qty > 0) {
        const retMilli = BigInt(Math.round(Math.min(qty, maxQty) * 1000));
        const maxMilli = BigInt(Math.round(maxQty * 1000));
        returnTotal += maxMilli > 0n ? (remainingTotal * retMilli + maxMilli / 2n) / maxMilli : 0n;
      }
    });
    const repProd = form.querySelector('#exchange-rep-product');
    const repQty = Math.max(0, Number(form.querySelector('#exchange-rep-qty')?.value) || 0);
    const repPrice = BigInt(repProd?.selectedOptions[0]?.dataset.price || '0');
    const replacementTotal = (repPrice * BigInt(Math.round(repQty * 1000)) + 500n) / 1000n;
    const preview = window.SlinkReturnsExchangeUI.computeExchangePreview({
      returnTotalVnd: returnTotal.toString(),
      replacementTotalVnd: replacementTotal.toString(),
    });
    out.innerHTML = window.SlinkReturnsExchangeUI.renderExchangeSummaryHtml(preview);
    const collectBox = form.querySelector('[data-exchange-collect]');
    const refundBox = form.querySelector('[data-exchange-refund]');
    const collectInput = form.querySelector('#exchange-collect-amount');
    if (collectBox) collectBox.hidden = preview.direction !== 'collect';
    if (refundBox) refundBox.hidden = preview.direction !== 'refund';
    if (collectInput && preview.direction === 'collect' && collectInput.dataset.userEdited !== 'true') {
      collectInput.value = preview.netDeltaVnd;
      window.SlinkMoneyFields?.enhance(form);
    }
  }


  S.fn.openOrderExchange = async function openOrderExchange(orderId) {
    if (!S.fn.hasPerm('voidOrReturnOrder')) return S.fn.toast('Không có quyền', 'Tài khoản này chưa được cấp quyền đổi / trả hàng.', 'error');
    const order = S.state.store.orders.find(o => o.id === orderId);
    if (!order) return;
    if (!S.state.warehouses.length) await S.fn.loadWarehouses({ includeTransfers: false });
    const catalog = await S.fn.ensureCatalogProducts();
    if (!catalog.length) return S.fn.toast('Chưa có sản phẩm đổi', 'Tải danh sách sản phẩm trước khi đổi hàng.', 'error');
    const whOpts = S.state.warehouses.map(w => `<option value='${S.fn.esc(w.id)}' ${w.id === S.state.selectedWarehouseId ? 'selected' : ''}>${S.fn.esc(S.fn.warehouseOptionName(w))}</option>`).join('');
    const retRows = order.items.filter(i => i.returnedQty < i.qty).map(function (item) {
      const maxRet = Math.max(0, Math.round((item.qty - item.returnedQty) * 1000) / 1000);
      const totalVnd = BigInt(String(item.totalVnd ?? Math.round(item.price * item.qty)));
      const fullMilli = BigInt(Math.max(1, Math.round(item.qty * 1000)));
      const remMilli = BigInt(Math.round(maxRet * 1000));
      const remainingTotal = ((totalVnd * remMilli + fullMilli / 2n) / fullMilli).toString();
      return `<div class='exchange-ret-row' data-exchange-ret-row data-line-id='${S.fn.esc(item.orderLineId)}' data-max-qty='${maxRet}' data-remaining-total='${S.fn.esc(remainingTotal)}'>
        <span><strong>${S.fn.esc(item.name)}</strong><small>Còn có thể đổi: ${S.fn.number(maxRet)} · Giá trị còn ${S.fn.moneyVndText(remainingTotal)}</small></span>
        <input class='input' type='number' name='retQty' min='0' max='${maxRet}' step='0.001' value='${maxRet}' aria-label='SL trả ${S.fn.esc(item.name)}'/>
      </div>`;
    }).join('');
    const eligibleCatalog = catalog.filter(p => !p.serialTracked).sort((a, b) => ((b.inventoryTracked ? b.stock : 1) > 0 ? 1 : 0) - ((a.inventoryTracked ? a.stock : 1) > 0 ? 1 : 0));
    if (!eligibleCatalog.length) return S.fn.toast('Chưa có sản phẩm đổi', 'Sản phẩm quản lý theo từng mã riêng cần trả hàng và bán mới tại quầy.', 'error');
    const repOpts = eligibleCatalog.map(p => `<option value='${S.fn.esc(p.id)}' data-price='${p.price}'>${S.fn.esc(p.name)} · ${S.fn.money(p.price)} (còn ${S.fn.number(p.stock)})</option>`).join('');
    const exKeyStorage = `slink-ex-key:${S.state.store.id}:${order.id}`;
    const form = `<form id='entity-form' data-form='order-exchange' data-id='${S.fn.esc(order.id)}' data-key-storage='${S.fn.esc(exKeyStorage)}' data-idempotency-key='${S.fn.esc(S.fn.readOrCreatePendingKey(exKeyStorage))}'>
      <div class='form-grid'>
        <div class='form-field full'><label class='input-label' for='exchange-warehouse'>Kho nhận &amp; xuất đổi *</label><select class='input' id='exchange-warehouse' name='warehouseId' required>${whOpts}</select></div>
        <div class='form-field full'><span class='input-label'>1. Chọn sản phẩm khách trả lại</span>${retRows}</div>
        <div class='form-field'><label class='input-label' for='exchange-rep-product'>2. Sản phẩm đổi mới *</label><select class='input' id='exchange-rep-product' name='repProductId' required>${repOpts}</select></div>
        <div class='form-field'><label class='input-label' for='exchange-rep-qty'>Số lượng mới *</label><input class='input' id='exchange-rep-qty' name='repQty' type='number' min='0.001' step='0.001' value='1' required/></div>
        <div class='form-field full' data-exchange-preview></div>
        <div class='form-field' data-exchange-collect hidden><label class='input-label' for='exchange-collect-amount'>Tiền khách trả thêm (đ)</label><input class='input' id='exchange-collect-amount' name='amountReceivedVnd' value='0'/></div>
        <div class='form-field' data-exchange-collect hidden><label class='input-label' for='exchange-method'>Phương thức thu thêm</label><select class='input' id='exchange-method' name='method'><option value='cash'>Tiền mặt</option><option value='bank_transfer'>Chuyển khoản</option><option value='bank_qr'>QR ngân hàng</option><option value='card'>Thẻ</option></select></div>
        <div class='form-field' data-exchange-refund hidden><label class='input-label' for='exchange-refund-method'>Phương thức hoàn tiền khách</label><select class='input' id='exchange-refund-method' name='refundMethod'><option value='cash'>Tiền mặt</option><option value='bank_transfer'>Chuyển khoản</option><option value='bank_qr'>QR ngân hàng</option></select></div>
        <div class='form-field full'><label class='input-label' for='exchange-reason'>Lý do đổi *</label><input class='input' id='exchange-reason' name='reason' required minlength='2' maxlength='200' value='Khách đổi hàng'/></div>
      </div></form>`;
    S.fn.showModal(`Đổi hàng · ${order.number}`, 'Hoàn tồn hàng cũ, xuất hàng mới và cấn trừ tiền chênh lệch trong một giao dịch.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>Xác nhận đổi hàng</button>`, true);
    const el = S.dom.modal.querySelector('[data-form="order-exchange"]');
    el.querySelector('#exchange-collect-amount')?.addEventListener('input', (e) => { e.target.dataset.userEdited = 'true'; });
    el.addEventListener('input', () => S.fn.updateOrderExchangePreview(el));
    el.addEventListener('change', () => S.fn.updateOrderExchangePreview(el));
    S.fn.updateOrderExchangePreview(el);
  }


  S.fn.submitOrderExchangeForm = async function submitOrderExchangeForm(form) {
    if (!window.SlinkReturnsExchangeUI) return;
    const data = new FormData(form);
    const returnItems = [];
    form.querySelectorAll('[data-exchange-ret-row]').forEach(function (row) {
      const qty = Number(row.querySelector('[name="retQty"]')?.value || 0);
      if (qty > 0) returnItems.push({ orderLineId: row.dataset.lineId, quantity: qty });
    });
    if (!returnItems.length) return S.fn.toast('Chưa chọn hàng trả lại', 'Nhập số lượng trả lại lớn hơn 0.', 'error');
    const repProductId = String(data.get('repProductId') || '');
    const repQty = Number(data.get('repQty') || 0);
    if (!repProductId || !(repQty > 0)) return S.fn.toast('Chưa chọn hàng mới', 'Chọn sản phẩm và số lượng đổi mới.', 'error');
    const warehouseId = String(data.get('warehouseId') || '');
    const collectVisible = !form.querySelector('[data-exchange-collect]')?.hidden;
    const extraAmtStr = collectVisible ? S.fn.rawVndDigits(data.get('amountReceivedVnd'), '0') : '0';
    if (extraAmtStr === null) return S.fn.toast('Số tiền thu thêm không hợp lệ', 'Nhập số VND nguyên không âm.', 'error');
    const method = String(data.get('method') || 'cash');
    const refundMethod = String(data.get('refundMethod') || 'cash');
    const tenders = collectVisible && BigInt(extraAmtStr) > 0n ? [{ method, amountReceivedVnd: extraAmtStr }] : [];
    const submitBtn = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitBtn) submitBtn.disabled = true;
    const keyStorage = form.dataset.keyStorage || `slink-ex-key:${S.state.store.id}:${form.dataset.id}`;
    try {
      const res = await window.SlinkReturnsExchangeUI.submitOrderExchange({
        storeId: S.state.store.id,
        orderId: form.dataset.id,
        payload: {
          restockWarehouseId: warehouseId,
          replacementWarehouseId: warehouseId,
          returnItems,
          replacementItems: [{ productId: repProductId, quantity: repQty }],
          tenders,
          refundMethod,
          reason: String(data.get('reason') || 'Khách đổi hàng').trim(),
        },
        csrfToken: S.fn.csrfCookie(),
        idempotencyKey: form.dataset.idempotencyKey || S.fn.readOrCreatePendingKey(keyStorage),
      });
      S.fn.clearPendingKey(keyStorage);
      S.fn.closeModal();
      S.fn.emitSyncDomains(['orders', 'stock', 'products', 'cashbook', 'customers', 'dashboard', 'reports'], { source: 'order-exchange' });
      S.fn.toast('Đã đổi hàng thành công', res.exchange?.replacementOrderNumber ? `Đơn mới: ${res.exchange.replacementOrderNumber}` : '');
      await S.fn.loadOrdersPage(S.state.searchTerms.orders, S.state.orderOffset);
      S.fn.openOrder(form.dataset.id);
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingKey(keyStorage);
      }
      S.fn.toast('Chưa hoàn tất đổi hàng', error.message, 'error');
      if (submitBtn?.isConnected) submitBtn.disabled = false;
    }
  }


  S.fn.printOrder = function printOrder(id) {
    const o = S.state.store.orders.find(function (item) { return item.id === id; });
    if (!o) return;
    const customer = S.fn.customerById(o.customerId);
    const customerName = o.customerName || customer?.name || 'Khách lẻ';
    const customerPhone = o.customerPhone || customer?.phone || '';
    const cancelled = o.rawStatus === 'voided';
    const items = (o.items || []).map(function (item) {
      const quantity = S.fn.number(item.qty);
      const lineTotal = item.totalVnd != null
        ? S.fn.moneyVndText(item.totalVnd)
        : S.fn.money(Number.isFinite(Number(item.total)) ? Number(item.total) : Math.round(Number(item.price) * Number(item.qty)));
      const lineDiscount = BigInt(String(item.discountVnd ?? item.discount ?? '0')) > 0n
        ? `<small>Giảm dòng: −${S.fn.moneyVndText(item.discountVnd ?? item.discount)}</small>`
        : '';
      return `<div class='item-line'><div class='item-copy'><strong>${S.fn.esc(item.name)}</strong><small>${quantity} ${S.fn.esc(item.unit || '')} × ${S.fn.moneyVndText(item.priceVnd ?? item.price)}</small>${lineDiscount}</div><strong>${lineTotal}</strong></div>`;
    }).join('');
    const payments = (o.paymentLines || []).map(function (payment) {
      return `<div class='summary-line payment-line'><span>· ${S.fn.esc(payment.method)}</span><strong>${S.fn.moneyVndText(payment.amountVnd ?? payment.amount)}</strong></div>`;
    }).join('');
    const returnLines = (o.returns || []).filter(function (item) { return item.status === 'completed' && BigInt(String(item.refunded_vnd || '0')) > 0n; }).map(function (item) {
      return `<div class='summary-line'><span>Hoàn tiền · ${S.fn.esc(item.return_number)}</span><strong>−${S.fn.moneyVndText(item.refunded_vnd || '0')}</strong></div>`;
    }).join('');
    const showDiscount = BigInt(String(o.discountVndText ?? o.discount ?? '0')) > 0n;
    const showCashReceived = BigInt(String(o.cashReceivedVndText ?? o.cashReceived ?? '0')) > 0n;
    const showCashChange = BigInt(String(o.cashChangeVndText ?? o.cashChange ?? '0')) > 0n;
    const showDue = BigInt(String(o.dueVndText ?? o.due ?? '0')) > 0n;
    const showRefunded = BigInt(String(o.refundedVndText ?? o.refunded ?? '0')) > 0n;
    const paperMaxW = S.state.posPrefs.paperWidth === '58mm' ? '54mm' : S.state.posPrefs.paperWidth === 'a4' ? '190mm' : '76mm';
    const html = `<html lang='vi'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Biên nhận ${S.fn.esc(o.number)}</title><style>
      @page{size:auto;margin:6mm}*{box-sizing:border-box}body{font:13px Arial,sans-serif;width:100%;max-width:${paperMaxW};margin:0 auto;padding:5mm 3mm;color:#222}h1{font-size:18px;line-height:1.25;margin:0 0 4px;overflow-wrap:anywhere}p{font-size:11px;line-height:1.4;margin:4px 0;color:#555;overflow-wrap:anywhere}.center{text-align:center}.muted{color:#666}.rule{border:0;border-top:1px dashed #999;margin:10px 0}.receipt-title{font-size:13px;font-weight:700;letter-spacing:.04em}.cancelled{display:inline-block;margin:8px 0;padding:5px 8px;border:1px solid #a33;color:#a33;font-weight:700}.item-line,.summary-line{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px dashed #ddd;font-size:12px;break-inside:avoid}.item-copy{display:grid;gap:3px;min-width:0}.item-copy strong{overflow-wrap:anywhere}.item-copy small{color:#555;font-size:10px}.item-line>strong,.summary-line>strong{white-space:nowrap}.summary{margin-top:4px}.grand-total{font-size:15px;font-weight:700;border-bottom:0;padding-top:9px}.payment-line{padding-top:2px;padding-bottom:2px;border-bottom:0;color:#555}.footer{margin-top:16px}@media screen{body{margin:16px auto;padding:12px;border:1px solid #ddd;box-shadow:0 2px 12px #0001}}@media print{body{padding:0;border:0;box-shadow:none}} /* taste-skill-ignore: printable receipt preview paper, not app chrome */
    </style></head><body><header class='center'><h1>${S.fn.esc(S.state.store.settings.storeName || 'Slink')}</h1>${S.state.store.settings.address ? `<p>${S.fn.esc(S.state.store.settings.address)}</p>` : ''}${S.state.store.settings.phone ? `<p>${S.fn.esc(S.state.store.settings.phone)}</p>` : ''}<hr class='rule'><div class='receipt-title'>BIÊN NHẬN BÁN HÀNG</div><p>${S.fn.esc(o.number)}<br>${S.fn.humanDate(o.createdAt, true)}</p><p>Khách hàng: ${S.fn.esc(customerName)}${customerPhone ? `<br>${S.fn.esc(customerPhone)}` : ''}</p>${cancelled ? `<div class='cancelled'>ĐƠN HÀNG ĐÃ HỦY</div>` : ''}</header><hr class='rule'><main>${items || `<p class='muted'>Không có dòng sản phẩm.</p>`}<section class='summary'><div class='summary-line'><span>Tạm tính</span><strong>${S.fn.moneyVndText(o.subtotalVndText ?? o.subtotal)}</strong></div>${showDiscount ? `<div class='summary-line'><span>Giảm giá đơn hàng</span><strong>−${S.fn.moneyVndText(o.discountVndText ?? o.discount)}</strong></div>` : ''}${o.promotion ? `<div class='summary-line'><span>Mã ${S.fn.esc(o.promotion.code)}</span><strong>−${S.fn.moneyVndText(o.promotion.discountVnd)}</strong></div>` : ''}<div class='summary-line grand-total'><span>Tổng cộng</span><strong>${S.fn.moneyVndText(o.totalVndText ?? o.total)}</strong></div><div class='summary-line'><span>Đã thanh toán</span><strong>${S.fn.moneyVndText(o.paidVndText ?? o.paid)}</strong></div>${payments}${showCashReceived ? `<div class='summary-line'><span>Tiền mặt khách đưa</span><strong>${S.fn.moneyVndText(o.cashReceivedVndText ?? o.cashReceived)}</strong></div>` : ''}${showCashChange ? `<div class='summary-line'><span>Tiền thối</span><strong>${S.fn.moneyVndText(o.cashChangeVndText ?? o.cashChange)}</strong></div>` : ''}${showDue ? `<div class='summary-line'><span>Còn phải thu</span><strong>${S.fn.moneyVndText(o.dueVndText ?? o.due)}</strong></div>` : ''}${returnLines}${!returnLines && showRefunded ? `<div class='summary-line'><span>Đã hoàn</span><strong>−${S.fn.moneyVndText(o.refundedVndText ?? o.refunded)}</strong></div>` : ''}</section></main><footer class='center footer'><p>${S.fn.esc(S.state.store.settings.receiptFooter || 'Cảm ơn quý khách!')}</p></footer></body></html>`;
    S.fn.printHtmlDocument(html, `Bien nhan ${o.number}`);
  }


  S.fn.digitalReceiptText = function digitalReceiptText(order) {
    const shareLabel = function (value, limit) { return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit || 240); };
    const paymentLines = (order.paymentLines || []).map(function (payment) {
      return `${shareLabel(payment.method, 40)}: ${S.fn.moneyVndText(payment.amountVnd ?? payment.amount)}`;
    });
    const itemLines = order.items.map(function (item) {
      const lineDiscount = BigInt(String(item.discountVnd ?? item.discount ?? '0')) > 0n ? ` (đã giảm ${S.fn.moneyVndText(item.discountVnd ?? item.discount)})` : '';
      return `• ${shareLabel(item.name)} — ${S.fn.number(item.qty)} ${shareLabel(item.unit, 40)} × ${S.fn.moneyVndText(item.priceVnd ?? item.price)} = ${S.fn.moneyVndText(item.totalVnd ?? item.total)}${lineDiscount}`.trim();
    });
    const lines = [
      shareLabel(S.state.store.settings.storeName || 'Slink'),
      'BIÊN NHẬN BÁN HÀNG',
      `Đơn: ${shareLabel(order.number, 80)}`,
      `Thời gian: ${S.fn.humanDate(order.createdAt, true)}`,
      order.rawStatus === 'voided' ? 'Trạng thái: ĐÃ HỦY' : null,
      '',
      ...itemLines,
      '',
      BigInt(String(order.discountVndText ?? order.discount ?? '0')) > 0n ? `Giảm giá đơn hàng: −${S.fn.moneyVndText(order.discountVndText ?? order.discount)}` : null,
      order.promotion ? `Mã khuyến mãi ${shareLabel(order.promotion.code, 32)}: −${S.fn.moneyVndText(order.promotion.discountVnd)}` : null,
      `Tổng cộng: ${S.fn.moneyVndText(order.totalVndText ?? order.total)}`,
      `Đã thanh toán: ${S.fn.moneyVndText(order.paidVndText ?? order.paid)}`,
      ...paymentLines,
      BigInt(String(order.cashReceivedVndText ?? order.cashReceived ?? '0')) > 0n ? `Tiền mặt khách đưa: ${S.fn.moneyVndText(order.cashReceivedVndText ?? order.cashReceived)}` : null,
      BigInt(String(order.cashChangeVndText ?? order.cashChange ?? '0')) > 0n ? `Tiền thối: ${S.fn.moneyVndText(order.cashChangeVndText ?? order.cashChange)}` : null,
      BigInt(String(order.dueVndText ?? order.due ?? '0')) > 0n ? `Còn phải thu: ${S.fn.moneyVndText(order.dueVndText ?? order.due)}` : null,
      BigInt(String(order.refundedVndText ?? order.refunded ?? '0')) > 0n ? `Đã hoàn tiền: ${S.fn.moneyVndText(order.refundedVndText ?? order.refunded)}` : null,
      '',
      shareLabel(S.state.store.settings.receiptFooter || 'Cảm ơn quý khách!', 300)
    ].filter(function (line) { return line != null; });
    return lines.join('\n');
  }


  S.fn.buildReceiptImageData = function buildReceiptImageData(order) {
    const c = S.fn.customerById(order.customerId);
    const bankSettings = S.state.integrationState.data?.settings || {};
    let vietQrText = '';
    if (order.due > 0 && bankSettings.bankBin && bankSettings.bankAccountNumber && window.SlinkVietQrTools) {
      vietQrText = window.SlinkVietQrTools.buildVietQrPayload({
        bankBin: bankSettings.bankBin,
        accountNumber: bankSettings.bankAccountNumber,
        amountVnd: Math.max(0, Math.trunc(Number(order.due || 0))),
        description: `SLINK ${order.number}`.slice(0, 40),
      });
    }
    return {
      storeName: S.state.store.settings.storeName || 'Slink',
      storeAddress: S.state.store.settings.address || '',
      storePhone: S.state.store.settings.phone || '',
      code: order.number,
      createdAtLabel: S.fn.humanDate(order.createdAt, true),
      customerName: order.customerName || c?.name || 'Khách lẻ',
      cashierName: order.cashierName || '',
      items: (order.items || []).map(function (item) {
        const prod = S.fn.productById(item.productId);
        return {
          name: item.name,
          qty: item.qty,
          unitPriceVnd: item.priceVnd ?? item.price ?? 0,
          lineTotalVnd: item.totalVnd ?? item.total ?? 0,
          serials: item.soldSerialCodes || [],
          warrantyMonths: Number(prod?.warrantyMonths || 0),
        };
      }),
      subtotalVnd: order.subtotalVndText ?? order.subtotal ?? 0,
      discountVnd: order.discountVndText ?? order.discount ?? 0,
      totalVnd: order.totalVndText ?? order.total ?? 0,
      paidVnd: order.paidVndText ?? order.paid ?? 0,
      debtVnd: order.dueVndText ?? order.due ?? 0,
      paymentLabel: order.method || 'Tiền mặt',
      vietQrText,
      footerText: S.state.store.settings.receiptFooter || 'Cảm ơn quý khách đã mua hàng!',
    };
  }


  S.fn.showDigitalReceipt = async function showDigitalReceipt(id, autoSharePng = false) {
    const order = S.state.store.orders.find(item => item.id === id);
    if (!order || !Array.isArray(order.items)) return S.fn.toast('Chưa có biên nhận', 'Mở lại chi tiết đơn để tải dữ liệu.', 'error');
    const body = S.dom.modal.querySelector('.modal-body');
    if (!body) return;
    let panel = body.querySelector('.digital-receipt');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'digital-receipt';
      panel.dataset.number = order.number;
      panel.innerHTML = `<h3 tabindex='-1'>Biên nhận ${S.fn.esc(order.number)}</h3>
        <div class='receipt-png-preview' data-receipt-png-box><span class='muted'>Đang tạo ảnh biên nhận…</span></div>
        <div class='receipt-png-actions'>
          <button class='btn btn-primary' type='button' data-action='receipt-share-png' disabled>Gửi ảnh biên nhận</button>
          <button class='btn btn-secondary' type='button' data-action='receipt-download-png' disabled>Tải ảnh PNG</button>
        </div>
        <details class='receipt-text-fallback'><summary>Gửi dạng tin nhắn văn bản</summary>
          <div class='receipt-actions' style='margin-top:8px'>${typeof navigator.share === 'function' || window.SlinkAndroid ? `<button class='btn btn-secondary' type='button' data-action='receipt-share'>Chia sẻ chữ</button>` : ''}<button class='btn btn-secondary' type='button' data-action='receipt-copy'>Sao chép</button><button class='btn btn-secondary' type='button' data-action='receipt-download'>Lưu .txt</button></div>
          <label class='input-label' for='share-order-copy'>Nội dung văn bản</label>
          <textarea id='share-order-copy' class='input' rows='7' readonly>${S.fn.esc(S.fn.digitalReceiptText(order))}</textarea>
        </details>
        <p class='muted' role='status' data-receipt-feedback></p>`;
      body.prepend(panel);
    }
    body.scrollTop = 0;
    panel.querySelector('h3').focus({ preventScroll: true });
    if (window.SlinkReceiptImage && typeof window.SlinkReceiptImage.renderReceiptPng === 'function') {
      try {
        const rendered = await window.SlinkReceiptImage.renderReceiptPng(S.fn.buildReceiptImageData(order));
        const filename = `bien-nhan-${String(order.number || 'slink').replace(/[^a-zA-Z0-9_-]+/g, '-')}.png`;
        S.state.activeReceiptPngPreview = {
          dataUrl: rendered.dataUrl,
          blob: rendered.blob,
          filename,
          title: `Biên nhận ${order.number}`,
          text: `${S.state.store.settings.storeName || 'Slink'} · ${order.number} · ${S.fn.moneyVndText(order.totalVndText ?? order.total)}`,
        };
        if (panel.isConnected) {
          const box = panel.querySelector('[data-receipt-png-box]');
          if (box) box.innerHTML = `<img src='${rendered.dataUrl}' alt='Ảnh biên nhận ${S.fn.esc(order.number)}'/>`;
          panel.querySelectorAll('[data-action="receipt-share-png"], [data-action="receipt-download-png"]').forEach(b => { b.disabled = false; });
        }
        if (autoSharePng && panel.isConnected) {
          await S.fn.useDigitalReceipt('receipt-share-png', panel.querySelector('[data-action="receipt-share-png"]'));
        }
      } catch (_) {
        const box = panel.querySelector('[data-receipt-png-box]');
        if (box) box.innerHTML = `<span class='muted'>Chưa tạo được ảnh PNG; dùng biên nhận văn bản bên dưới.</span>`;
      }
    }
  }


  S.fn.useDigitalReceipt = async function useDigitalReceipt(action, button) {
    const panel = button?.closest('.digital-receipt');
    const field = panel?.querySelector('textarea');
    if (!panel || !button || button.disabled) return;
    const feedback = panel.querySelector('[data-receipt-feedback]');
    const number = panel.dataset.number;
    if (action === 'receipt-download-png') {
      if (S.state.activeReceiptPngPreview.dataUrl && window.SlinkReceiptImage) {
        window.SlinkReceiptImage.triggerDownload(S.state.activeReceiptPngPreview.dataUrl, S.state.activeReceiptPngPreview.filename);
        if (feedback) feedback.textContent = 'Đã tải ảnh biên nhận PNG.';
      }
      return;
    }
    if (action === 'receipt-share-png') {
      if (!S.state.activeReceiptPngPreview.dataUrl || !window.SlinkReceiptImage) return;
      button.disabled = true;
      try {
        const res = await window.SlinkReceiptImage.sharePng(S.state.activeReceiptPngPreview);
        if (feedback) feedback.textContent = res?.method === 'download' ? 'Đã tải ảnh biên nhận PNG.' : '';
      } finally {
        if (button.isConnected) button.disabled = false;
      }
      return;
    }
    if (!field) return;
    if (action === 'receipt-download') {
      S.fn.download('bien-nhan-' + number.replace(/[^a-z0-9-]/gi, '-') + '.txt', field.value, 'text/plain;charset=utf-8');
      return;
    }
    button.disabled = true;
    try {
      if (action === 'receipt-share') {
        if (window.SlinkAndroid) await S.fn.nativeAction({ type: 'share', title: 'Biên nhận ' + number, text: field.value });
        else await navigator.share({ title: 'Biên nhận ' + number, text: field.value });
      }
      else {
        await navigator.clipboard.writeText(field.value);
        feedback.textContent = 'Đã sao chép. Bạn có thể dán vào tin nhắn cho khách.';
      }
    } catch (error) {
      if (error.name === 'AbortError' || !field.isConnected) return;
      if (action === 'receipt-copy') { field.focus(); field.select(); }
      feedback.textContent = action === 'receipt-share' ? 'Chưa mở được trình chia sẻ. Bạn có thể sao chép hoặc lưu tệp.' : 'Chọn nội dung ở trên để sao chép thủ công.';
    } finally { button.disabled = false; }
  }
})(window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {}, charts: {} });
