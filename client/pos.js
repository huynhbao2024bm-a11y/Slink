(function (S) {
  'use strict';

  S.fn.loadPosCustomers = async function loadPosCustomers(query) {
    if (!S.state.authSession || !S.state.store.id) return;
    if (!S.fn.hasPerm('manageCustomers')) {
      S.state.customerRequestNumber += 1;
      S.state.store.customers = [];
      S.state.customerListLoaded = true;
      return;
    }
    const requestedStoreId = S.state.store.id;
    const requestNumber = ++S.state.customerRequestNumber;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(requestedStoreId)}/customers?view=picker&limit=100&q=${encodeURIComponent(query || '')}`);
      if (requestNumber !== S.state.customerRequestNumber || S.state.store.id !== requestedStoreId) return;
      S.state.store.customers = result.customers.map(S.fn.mapPosCustomer);
      S.state.customerListLoaded = true;
    } catch (error) {
      if (requestNumber !== S.state.customerRequestNumber || S.state.store.id !== requestedStoreId) return;
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa tải được khách hàng', error.message, 'error');
    }
  }


  S.fn.posWarehouseParam = function posWarehouseParam() {
    return S.state.page === 'pos' && S.state.selectedWarehouseId ? `&warehouseId=${encodeURIComponent(S.state.selectedWarehouseId)}` : '';
  }


  S.fn.loadPosSellers = async function loadPosSellers() {
    if (!S.state.authSession || !S.state.store.id) return;
    try {
      const res = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/pos/sellers`);
      S.state.posSellers = Array.isArray(res.sellers) ? res.sellers : [];
      if (!S.state.posSellerId && S.state.authSession?.user?.id) S.state.posSellerId = S.state.authSession.user.id;
      if (S.state.page === 'pos') S.fn.refreshCartPanels();
    } catch (_) {}
  }


  S.fn.loadPosCustomerAssistant = async function loadPosCustomerAssistant(opts = {}) {
    if (!S.state.authSession || !S.state.store.id || !navigator.onLine) return;
    const reqNum = ++S.state.posAssistantState.requestNumber;
    const storeId = S.state.store.id;
    const billId = S.state.activePosBillId;
    const q = opts.q !== undefined ? String(opts.q || '').trim() : '';
    const cid = opts.customerId !== undefined ? String(opts.customerId || '').trim() : '';
    if (!q && !cid) {
      S.state.posAssistantState.data = null;
      if (S.state.page === 'pos') S.fn.refreshCartPanels();
      return;
    }
    try {
      const params = new URLSearchParams();
      if (cid) params.set('customerId', cid);
      else if (q) params.set('q', q);
      const res = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/pos/customer-assistant?${params}`);
      if (reqNum !== S.state.posAssistantState.requestNumber || S.state.store.id !== storeId || S.state.activePosBillId !== billId) return;
      S.state.posAssistantState.data = res;
      if (res.matched && res.customer && (res.exactTailMatch || cid === res.customer.id)) {
        const c = res.customer;
        if (!S.state.store.customers.some(item => item.id === c.id)) {
          S.state.store.customers.push({
            id: c.id,
            customerCode: c.customerCode || '',
            name: c.name,
            phone: c.phone || '',
            customerType: c.customerType || 'retail',
            discountRateBps: Number(c.discountRateBps || 0),
            shippingAddress: c.shippingAddress || '',
            debt: Math.max(0, Number(res.debt?.balanceVnd || 0)),
          });
        }
        if (S.state.cartCustomerId !== c.id) {
          S.state.cartCustomerId = c.id;
          S.state.posRedeemPointsActive = false;
          S.state.posBundlePriorDebtActive = false;
          const rateBps = Number(c.discountRateBps || 0);
          const totalsNow = S.fn.cartTotals();
          const sub = totalsNow.subtotal;
          const remainingAllowance = Math.max(0, S.fn.maxAllowedDiscountVnd(sub) - totalsNow.lineDiscount);
          if (rateBps > 0 && sub > 0 && !S.state.cart.discount) {
            S.state.cart.discount = Math.min(remainingAllowance, Math.round(sub * rateBps / 10000));
          }
        }
      } else if (!cid && !res.exactTailMatch) {
        if (S.state.cartCustomerId && q) {
          S.state.cartCustomerId = '';
          S.state.posRedeemPointsActive = false;
          S.state.posBundlePriorDebtActive = false;
        }
      }
      if (S.state.page === 'pos') {
        const activeInput = document.getElementById('pos-customer-inline-input');
        const wasFocused = document.activeElement === activeInput;
        const posStart = activeInput?.selectionStart || 0;
        S.fn.refreshCartPanels();
        if (wasFocused) {
          const nextInput = document.getElementById('pos-customer-inline-input');
          if (nextInput) {
            nextInput.focus({ preventScroll: true });
            try { nextInput.setSelectionRange(posStart, posStart); } catch {}
          }
        }
      }
    } catch (_) {}
  }


  S.fn.cartLineGross = function cartLineGross(item) {
    const price = BigInt(String(S.fn.cartUnitPrice(item) || 0));
    const milli = BigInt(Math.round(Number(item.qty || 0) * 1000));
    return Number((price * milli + 500n) / 1000n);
  }


  S.fn.cartTotals = function cartTotals() {
    let subtotalBig = 0n;
    let lineDiscountBig = 0n;
    for (const item of S.state.cart) {
      const lineGross = BigInt(S.fn.cartLineGross(item));
      const rawLineDisc = BigInt(Math.max(0, Math.round(Number(item.discountVnd) || 0)));
      const clampedLineDisc = rawLineDisc > lineGross ? lineGross : rawLineDisc;
      subtotalBig += lineGross;
      lineDiscountBig += clampedLineDisc;
    }
    const remainingAfterLines = subtotalBig - lineDiscountBig;
    const rawOrderDiscount = BigInt(Math.max(0, Math.round(Number(S.state.cart.discount) || 0)));
    const orderDiscountBig = rawOrderDiscount > remainingAfterLines ? remainingAfterLines : rawOrderDiscount;
    const totalDiscountBig = lineDiscountBig + orderDiscountBig;
    const totalBig = subtotalBig - totalDiscountBig;
    return {
      subtotal: Number(subtotalBig),
      lineDiscount: Number(lineDiscountBig),
      orderDiscount: Number(orderDiscountBig),
      discount: Number(orderDiscountBig),
      manualDiscountTotal: Number(totalDiscountBig),
      total: Number(totalBig),
      subtotalVnd: subtotalBig.toString(),
      lineDiscountVnd: lineDiscountBig.toString(),
      discountVnd: orderDiscountBig.toString(),
      totalDiscountVnd: totalDiscountBig.toString(),
      totalVnd: totalBig.toString(),
      count: S.state.cart.reduce(function (sum, item) { return sum + item.qty; }, 0),
    };
  }


  S.fn.cartUnitPrice = function cartUnitPrice(item) { return item.unitPriceVnd ?? S.fn.productById(item.id)?.price ?? 0; }


  S.fn.cartPriceChanges = function cartPriceChanges() {
    return S.state.cart.flatMap(item => {
      const product = S.fn.productById(item.id);
      const before = S.fn.cartUnitPrice(item);
      return product && product.price !== before ? [{ id: item.id, name: product.name, before, after: product.price }] : [];
    });
  }


  S.fn.openCartPriceReview = function openCartPriceReview(changes) {
    const rows = changes.map(change => `<div class='detail-line'><span>${S.fn.esc(change.name)}</span><strong>${S.fn.moneyVndText(change.before)} → ${S.fn.moneyVndText(change.after)}</strong></div>`).join('');
    const body = `<form id='entity-form' data-form='cart-price-review' data-prices='${S.fn.esc(JSON.stringify(changes))}'>${rows}</form>`;
    S.fn.showModal('Giá bán đã đổi', 'Kiểm tra giá mới trước khi nhận tiền.', body, `<button class='btn btn-secondary' data-action='close-modal'>Để sau</button><button class='btn btn-primary' type='submit' form='entity-form'>Dùng giá mới</button>`);
  }


  S.fn.confirmCartPrices = function confirmCartPrices(form) {
    if (S.state.checkoutPendingPayload) return;
    const changes = JSON.parse(form.dataset.prices);
    if (changes.some(change => S.fn.productById(change.id)?.price !== change.after)) return S.fn.openCheckout();
    changes.forEach(change => {
      const item = S.state.cart.find(row => row.id === change.id);
      if (item) {
        item.unitPriceVnd = change.after;
        if (Number(item.discountVnd) > 0) item.discountVnd = Math.min(Number(item.discountVnd), S.fn.cartLineGross(item));
      }
    });
    S.state.checkoutPromotion = null;
    S.state.checkoutIdempotencyKey = '';
    S.fn.refreshCartPanels();
    S.fn.openCheckout();
  }


  S.fn.setCartDrawerOpen = function setCartDrawerOpen(open) {
    const drawer = document.getElementById('drawer-cart');
    if (!drawer) return;
    if (open) { const panel = drawer.querySelector('.cart-panel'); if (panel) panel.outerHTML = S.fn.cartPanel(); }
    drawer.classList.toggle('open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    drawer.toggleAttribute('inert', !open);
    document.body.style.overflow = open || !S.dom.modal.hidden ? 'hidden' : '';
    document.querySelectorAll('[data-action="open-cart"]').forEach(function (button) { button.setAttribute('aria-expanded', String(open)); });
    if (open) window.requestAnimationFrame(function () {
      const closeButton = drawer.querySelector('[data-action="close-cart"]');
      if (drawer.classList.contains('open') && S.dom.modal.hidden) closeButton?.focus({ preventScroll: true });
    });
    else window.requestAnimationFrame(function () {
      const cartButton = document.querySelector('.pos-mobile-cart-edit');
      if (S.dom.modal.hidden && !drawer.classList.contains('open') && cartButton?.getClientRects().length) cartButton.focus({ preventScroll: true });
    });
  }


  S.fn.addMoreProducts = function addMoreProducts() {
    if (S.state.checkoutPendingPayload) return;
    S.fn.setCartDrawerOpen(false);
    const productList = document.getElementById('pos-products');
    if (productList) {
      productList.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      window.requestAnimationFrame(function () {
        const firstProduct = productList.querySelector('[data-action="add-cart"]');
        if (firstProduct) firstProduct.focus({ preventScroll: true });
        else document.getElementById('pos-search')?.focus({ preventScroll: true });
      });
    }
  }


  S.state.emptyCartRow = `<div class='cart-empty'><div>Chọn sản phẩm để bắt đầu đơn hàng</div></div>`;

  S.fn.cartRow = function cartRow(item) {
    const product = S.fn.productById(item.id);
    if (!product) return '';
    const serials = Array.isArray(item.serialCodes) ? item.serialCodes : [];
    const hasSerials = serials.length > 0;
    const lineGross = S.fn.cartLineGross(item);
    const lineDisc = Math.max(0, Math.min(lineGross, Math.round(Number(item.discountVnd) || 0)));
    const lineNet = lineGross - lineDisc;
    const canDiscount = S.fn.getMaxDiscountPct() > 0;
    const disabledAttr = S.state.checkoutPendingPayload ? 'disabled' : '';
    const serialChips = hasSerials
      ? `<div class='cart-serial-chips'>${serials.map((code) => `<span class='serial-chip'><span>${S.fn.esc(code)}</span><button type='button' data-action='cart-remove-serial' data-id='${S.fn.esc(product.id)}' data-code='${S.fn.esc(code)}' ${disabledAttr} aria-label='Bỏ mã ${S.fn.esc(code)}'>×</button></span>`).join('')}</div>`
      : '';
    const discountBtn = canDiscount
      ? `<button type='button' class='cart-line-discount-btn ${lineDisc > 0 ? 'has-discount' : ''}' data-action='pos-line-discount' data-id='${S.fn.esc(product.id)}' ${disabledAttr} title='Giảm giá từng món'>${lineDisc > 0 ? `Giảm −${S.fn.money(lineDisc)}` : 'Giảm %/₫'}</button>`
      : '';
    const priceLine = lineDisc > 0
      ? `<div class='cart-item-price'>${S.fn.money(lineNet)} <small class='muted' style='text-decoration:line-through;font-weight:500'>${S.fn.money(lineGross)}</small></div>`
      : `<div class='cart-item-price'>${S.fn.moneyVndText(S.fn.cartUnitPrice(item))} / ${S.fn.esc(product.unit)}</div>`;
    return `<div class='cart-row' data-cart-product='${S.fn.esc(product.id)}'><div><div class='cart-item-name'>${S.fn.esc(product.name)}</div>${priceLine}<div style='display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap'>${discountBtn}</div>${serialChips}</div><div class='qty-control'><button data-action='cart-qty' data-id='${S.fn.esc(product.id)}' data-delta='-1' ${disabledAttr} aria-label='Giảm'>−</button><button data-action='cart-qty-edit' data-id='${S.fn.esc(product.id)}' ${S.state.checkoutPendingPayload || hasSerials ? 'disabled' : ''} aria-label='Sửa số lượng'>${S.fn.number(item.qty)}</button><button data-action='cart-qty' data-id='${S.fn.esc(product.id)}' data-delta='1' ${S.state.checkoutPendingPayload || hasSerials || (product.inventoryTracked && item.qty >= S.fn.availableForSale(product)) ? 'disabled' : ''} aria-label='Tăng'>＋</button></div></div>`;
  }


  S.fn.fastCashPresets = function fastCashPresets(total) {
    const amount = Math.max(0, Number(total) || 0);
    if (!amount) return [];
    const base = [amount];
    const denominations = [50000, 100000, 200000, 500000];
    denominations.forEach(function (note) {
      if (note > amount && base.length < 4) base.push(note);
    });
    const rounded50k = Math.ceil(amount / 50000) * 50000;
    if (rounded50k > amount && !base.includes(rounded50k) && base.length < 4) base.splice(1, 0, rounded50k);
    return base.slice(0, 4);
  }


  S.fn.hasAnyOpenPosBillItems = function hasAnyOpenPosBillItems() {
    return S.state.cart.length > 0 || S.state.posBills.some(b => b.id !== S.state.activePosBillId && Array.isArray(b.items) && b.items.length > 0);
  }


  S.fn.qtyReservedInOtherPosBills = function qtyReservedInOtherPosBills(productId) {
    let totalMilli = 0;
    for (const bill of S.state.posBills) {
      if (bill.id === S.state.activePosBillId) continue;
      for (const item of bill.items || []) {
        if (item.id === productId) totalMilli += Math.round((Number(item.qty) || 0) * 1000);
      }
    }
    return totalMilli / 1000;
  }


  S.fn.hasSerialInAnyPosBill = function hasSerialInAnyPosBill(rawCode) {
    const key = String(rawCode || '').trim().toLocaleLowerCase('vi');
    if (!key) return false;
    if (S.state.cart.some(item => Array.isArray(item.serialCodes) && item.serialCodes.some(c => String(c).toLocaleLowerCase('vi') === key))) return true;
    for (const bill of S.state.posBills) {
      if (bill.id === S.state.activePosBillId) continue;
      if ((bill.items || []).some(item => Array.isArray(item.serialCodes) && item.serialCodes.some(c => String(c).toLocaleLowerCase('vi') === key))) return true;
    }
    return false;
  }


  S.fn.syncActivePosBillFromCart = function syncActivePosBillFromCart() {
    let active = S.state.posBills.find(b => b.id === S.state.activePosBillId);
    if (!active) {
      active = { id: S.state.activePosBillId || 1, label: `Đơn ${S.state.activePosBillId || 1}`, items: [], discount: 0, customerId: '', note: '', method: 'cash' };
      S.state.posBills = [active];
      S.state.activePosBillId = active.id;
    }
    active.items = S.state.cart.map(item => ({
      id: item.id,
      qty: item.qty,
      unitPriceVnd: item.unitPriceVnd,
      ...(Number(item.discountVnd) > 0 ? { discountVnd: Math.round(Number(item.discountVnd)) } : {}),
      ...(Array.isArray(item.serialCodes) && item.serialCodes.length ? { serialCodes: item.serialCodes.slice() } : {}),
    }));
    active.discount = Number(S.state.cart.discount || 0);
    active.customerId = S.state.cartCustomerId || '';
    active.customerInlineText = S.state.posCustomerInlineText || '';
    active.assistantData = S.state.posAssistantState?.data || null;
    active.redeemPointsActive = Boolean(S.state.posRedeemPointsActive);
    active.bundlePriorDebtActive = Boolean(S.state.posBundlePriorDebtActive);
    active.prebillEventId = S.state.activePosPrebillId || '';
    active.note = S.state.posStandardNote || '';
    active.method = S.state.posStandardMethod || 'cash';
  }


  S.fn.loadPosBillIntoCart = function loadPosBillIntoCart(bill) {
    const nextCart = (bill.items || []).map(item => ({
      id: item.id,
      qty: item.qty,
      unitPriceVnd: item.unitPriceVnd,
      ...(Number(item.discountVnd) > 0 ? { discountVnd: Math.round(Number(item.discountVnd)) } : {}),
      ...(Array.isArray(item.serialCodes) && item.serialCodes.length ? { serialCodes: item.serialCodes.slice() } : {}),
    }));
    nextCart.discount = Number(bill.discount || 0);
    S.state.cart = nextCart;
    S.state.cartCustomerId = bill.customerId || '';
    S.state.posCustomerInlineText = bill.customerInlineText || '';
    S.state.posAssistantState.data = bill.assistantData || null;
    S.state.posAssistantState.requestNumber += 1;
    S.state.posRedeemPointsActive = Boolean(bill.redeemPointsActive);
    S.state.posBundlePriorDebtActive = Boolean(bill.bundlePriorDebtActive);
    S.state.activePosPrebillId = bill.prebillEventId || '';
    S.state.posStandardNote = bill.note || '';
    S.state.posStandardMethod = bill.method || 'cash';
    S.state.activePosBillId = bill.id;
  }


  S.fn.switchPosBill = function switchPosBill(billId) {
    if (S.state.checkoutPendingPayload) return S.fn.toast('Đang chờ xác nhận đơn', 'Hoàn tất đơn đang chờ trước khi chuyển đơn khác.', 'error');
    const idNum = Number(billId);
    if (idNum === S.state.activePosBillId) return;
    S.fn.syncActivePosBillFromCart();
    const target = S.state.posBills.find(b => b.id === idNum);
    if (!target) return;
    S.fn.loadPosBillIntoCart(target);
    S.state.posFastCashInput = '';
    if (S.state.page === 'pos') S.fn.refreshCartPanels();
  }


  S.fn.addPosBill = function addPosBill() {
    if (S.state.checkoutPendingPayload) return S.fn.toast('Đang chờ xác nhận đơn', 'Hoàn tất đơn đang chờ trước khi mở đơn mới.', 'error');
    if (S.state.posBills.length >= 5) return S.fn.toast('Tối đa 5 đơn chờ', 'Hoàn tất hoặc đóng bớt một đơn đang mở.', 'error');
    S.fn.syncActivePosBillFromCart();
    const bill = { id: S.state.nextPosBillNumber, label: `Đơn ${S.state.nextPosBillNumber}`, items: [], discount: 0, customerId: '', customerInlineText: '', assistantData: null, redeemPointsActive: false, bundlePriorDebtActive: false, prebillEventId: '', note: '', method: 'cash' };
    S.state.nextPosBillNumber += 1;
    S.state.posBills.push(bill);
    S.fn.loadPosBillIntoCart(bill);
    S.state.posFastCashInput = '';
    if (S.state.page === 'pos') S.fn.refreshCartPanels();
  }


  S.fn.closePosBill = function closePosBill(billId) {
    if (S.state.checkoutPendingPayload) return;
    const idNum = Number(billId);
    if (S.state.posBills.length <= 1) return;
    S.fn.syncActivePosBillFromCart();
    const closingBill = S.state.posBills.find(b => b.id === idNum);
    const prebillToAbandon = closingBill?.prebillEventId || '';
    if (prebillToAbandon && navigator.onLine) {
      if (S.state.activePosBillId === idNum) S.state.activePosPrebillId = '';
      S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/pos/prebill-events/${encodeURIComponent(prebillToAbandon)}/abandon`, { method: 'POST', body: {} }).catch(() => {});
    }
    S.state.posBills = S.state.posBills.filter(b => b.id !== idNum);
    if (S.state.activePosBillId === idNum) {
      S.fn.loadPosBillIntoCart(S.state.posBills[0]);
    }
    if (S.state.page === 'pos') S.fn.refreshCartPanels();
  }


  S.fn.resetPosBillsAfterSale = function resetPosBillsAfterSale() {
    S.state.posCustomerInlineText = '';
    S.state.posAssistantState.data = null;
    S.state.posRedeemPointsActive = false;
    S.state.posBundlePriorDebtActive = false;
    S.state.activePosPrebillId = '';
    if (S.state.posBills.length > 1) {
      S.state.posBills = S.state.posBills.filter(b => b.id !== S.state.activePosBillId);
      S.fn.loadPosBillIntoCart(S.state.posBills[0]);
      S.state.posMode = 'standard';
    } else {
      S.state.posBills = [{ id: 1, label: 'Đơn 1', items: [], discount: 0, customerId: '', customerInlineText: '', assistantData: null, redeemPointsActive: false, bundlePriorDebtActive: false, prebillEventId: '', note: '', method: 'cash' }];
      S.state.nextPosBillNumber = 2;
      S.fn.loadPosBillIntoCart(S.state.posBills[0]);
    }
  }


  S.fn.renderPosBillsTabs = function renderPosBillsTabs(disabled) {
    if (S.state.posMode !== 'standard') return '';
    return `<div class='pos-bill-tabs' role='tablist' aria-label='Các đơn đang mở'>${S.state.posBills.map(function (bill) {
      const active = bill.id === S.state.activePosBillId;
      const count = active ? S.state.cart.reduce((sum, item) => sum + item.qty, 0) : (bill.items || []).reduce((sum, item) => sum + item.qty, 0);
      return `<div class='pos-bill-tab ${active ? 'active' : ''}'><button type='button' role='tab' aria-selected='${active}' data-action='pos-bill-switch' data-bill-id='${bill.id}' ${disabled}>${S.fn.esc(bill.label)}${count > 0 ? ` <span class='pos-bill-badge'>${S.fn.number(count)}</span>` : ''}</button>${S.state.posBills.length > 1 ? `<button type='button' class='pos-bill-close' data-action='pos-bill-close' data-bill-id='${bill.id}' aria-label='Đóng ${S.fn.esc(bill.label)}' ${disabled}>×</button>` : ''}</div>`;
    }).join('')}${S.state.posBills.length < 5 ? `<button type='button' class='pos-bill-add' data-action='pos-bill-add' aria-label='Mở thêm đơn mới' title='Mở thêm đơn' ${disabled}>＋</button>` : ''}</div>`;
  }


  S.fn.renderPosDeliverySection = function renderPosDeliverySection(customer, disabled) {
    const recName = S.state.posDelivery.receiverName || customer?.name || '';
    const recPhone = S.state.posDelivery.receiverPhone || customer?.phone || '';
    return `<div class='pos-delivery-box'>
      <div class='pos-delivery-head'><strong>${S.fn.icon('truck', 15)} Thông tin giao hàng</strong><span>${S.state.posDelivery.collection === 'cod' ? 'Thu hộ COD' : S.state.posDelivery.collection === 'prepaid' ? 'Đã trả trước' : 'Ghi công nợ'}</span></div>
      <div class='pos-delivery-fields'>
        <input class='input' type='text' data-delivery-field='receiverName' maxlength='120' placeholder='Tên người nhận *' value='${S.fn.esc(recName)}' aria-label='Tên người nhận' ${disabled}/>
        <input class='input' type='tel' data-delivery-field='receiverPhone' maxlength='30' placeholder='Số điện thoại *' value='${S.fn.esc(recPhone)}' aria-label='Số điện thoại người nhận' ${disabled}/>
        <input class='input pos-delivery-full' type='text' data-delivery-field='address' maxlength='240' placeholder='Địa chỉ giao hàng chi tiết *' value='${S.fn.esc(S.state.posDelivery.address)}' aria-label='Địa chỉ giao hàng' ${disabled}/>
        <input class='input' type='text' data-delivery-field='carrier' maxlength='60' placeholder='Đơn vị / Shipper' value='${S.fn.esc(S.state.posDelivery.carrier)}' aria-label='Đơn vị vận chuyển' ${disabled}/>
        <select class='input' data-delivery-field='collection' aria-label='Hình thức thu tiền giao hàng' ${disabled}>
          <option value='cod' ${S.state.posDelivery.collection === 'cod' ? 'selected' : ''}>Thu hộ COD khi giao</option>
          <option value='prepaid' ${S.state.posDelivery.collection === 'prepaid' ? 'selected' : ''}>Khách đã trả trước (CK)</option>
          <option value='debt' ${S.state.posDelivery.collection === 'debt' ? 'selected' : ''}>Ghi công nợ khách</option>
        </select>
        <input class='input pos-delivery-full' type='text' data-delivery-field='note' maxlength='140' placeholder='Ghi chú giao (giờ giao, kiểm hàng…)' value='${S.fn.esc(S.state.posDelivery.note)}' aria-label='Ghi chú giao hàng' ${disabled}/>
      </div>
    </div>`;
  }


  S.fn.posEffectivePayable = function posEffectivePayable(totals = S.fn.cartTotals()) {
    const assist = S.state.posAssistantState.data;
    const matchedCust = assist && assist.matched && assist.customer && assist.customer.id === S.state.cartCustomerId;
    const redeemablePts = matchedCust ? Math.max(0, Number(assist.loyalty?.redeemablePoints || 0)) : 0;
    const redeemUnitVnd = matchedCust ? Math.max(1, Number(assist.loyalty?.redeemValueVnd || 1000)) : 1000;
    const maxPtsForOrder = Math.floor(Math.max(0, totals.total) / redeemUnitVnd);
    const pointsUsed = (S.state.posRedeemPointsActive && matchedCust) ? Math.min(redeemablePts, maxPtsForOrder) : 0;
    const pointsDiscountVnd = pointsUsed * redeemUnitVnd;
    const orderNetVnd = Math.max(0, totals.total - pointsDiscountVnd);
    const priorDebtVnd = matchedCust ? Math.max(0, Number(assist.debt?.balanceVnd || 0)) : 0;
    const bundledDebtVnd = (S.state.posBundlePriorDebtActive && matchedCust && priorDebtVnd > 0) ? priorDebtVnd : 0;
    return {
      pointsUsed,
      pointsDiscountVnd,
      orderNetVnd,
      priorDebtVnd,
      bundledDebtVnd,
      grandCollectVnd: orderNetVnd + bundledDebtVnd,
    };
  }


  S.fn.renderPosCustomerAssistantBox = function renderPosCustomerAssistantBox(totals, disabled) {
    const assist = S.state.posAssistantState.data;
    const sellerBar = S.state.posSellers.length > 1
      ? `<div class='pos-seller-pills' role='group' aria-label='Nhân viên bán đơn này'><small>Người bán:</small>${S.state.posSellers.slice(0, 6).map(function (s) {
          const active = (S.state.posSellerId || S.state.authSession?.user?.id) === s.user_id;
          return `<button type='button' class='pos-seller-pill ${active ? 'active' : ''}' data-action='pos-select-seller' data-id='${S.fn.esc(s.user_id)}' ${disabled}>${S.fn.esc(s.display_name)}</button>`;
        }).join('')}</div>`
      : '';
    const inlineInput = `<div class='pos-inline-customer-row'><input class='input' id='pos-customer-inline-input' type='search' maxlength='140' placeholder='Nhập SĐT tích điểm (10 số) hoặc 4 số cuối…' value='${S.fn.esc(S.state.posCustomerInlineText)}' aria-label='Nhập SĐT 10 số để tự tạo thẻ hoặc gõ 4 số cuối khách quen' ${disabled}/>${(S.state.cartCustomerId || S.state.posCustomerInlineText) ? `<button type='button' class='link-button' data-action='pos-clear-customer' ${disabled}>Xóa</button>` : ''}</div>`;
    let detailCard = '';
    const earnUnit = Math.max(1000, Number(S.state.store.settings?.loyaltyEarnUnitVnd || 100000));
    const estEff = S.fn.posEffectivePayable(totals);
    const estEarnPts = Math.floor(Math.max(0, estEff.orderNetVnd) / earnUnit);
    if (assist && assist.matched && assist.customer && assist.customer.id === S.state.cartCustomerId) {
      const ptsBalance = Number(assist.loyalty?.pointsBalance || 0);
      const redeemablePts = Number(assist.loyalty?.redeemablePoints || 0);
      const maxRedeemVnd = Math.min(totals.total, Number(assist.loyalty?.maxRedeemVnd || 0));
      const priorDebt = Number(assist.debt?.balanceVnd || 0);
      const favs = Array.isArray(assist.favoriteItems) ? assist.favoriteItems : [];
      const tierNames = { diamond: 'Kim cương', gold: 'VIP Vàng', silver: 'Thân thiết', member: 'Thành viên' };
      const tierBadge = `<span class='badge badge-info'>${S.fn.esc(tierNames[assist.customer.loyaltyTier] || 'Thành viên')}</span>`;
      const ptsChip = redeemablePts > 0 && totals.total > 0
        ? `<button type='button' class='pos-assist-chip ${S.state.posRedeemPointsActive ? 'active' : ''}' data-action='pos-toggle-redeem-points' ${disabled}>${S.state.posRedeemPointsActive ? '✓ Đang dùng' : 'Dùng'} ${S.fn.number(redeemablePts)} điểm (−${S.fn.money(maxRedeemVnd)})</button>`
        : `<small class='muted'>Điểm hiện có: ${S.fn.number(ptsBalance)}</small>`;
      const favChips = favs.map(function (f) {
        return `<button type='button' class='pos-assist-fav' data-action='add-cart' data-id='${S.fn.esc(f.productId)}' title='Chạm để thêm nhanh vào giỏ' ${disabled}>＋ ${S.fn.esc(f.name)}</button>`;
      }).join('');
      const line1 = `<div class='pos-assist-line'>${tierBadge} ${ptsChip}${estEarnPts > 0 ? `<small class='badge badge-success'>+${S.fn.number(estEarnPts)} điểm đơn này</small>` : ''}${assist.activeWarrantyCount > 0 ? `<small class='muted'>· ${S.fn.number(assist.activeWarrantyCount)} SP còn BH</small>` : ''}${favChips}</div>`;
      const line2 = priorDebt > 0
        ? `<div class='pos-assist-line pos-assist-debt'><span>Nợ cũ: <strong>${S.fn.money(priorDebt)}</strong></span><button type='button' class='pos-assist-chip pos-assist-debt-btn ${S.state.posBundlePriorDebtActive ? 'active' : ''}' data-action='pos-toggle-bundle-debt' ${disabled}>${S.state.posBundlePriorDebtActive ? '✓ Đã gộp thu nợ cũ' : 'Gộp thu luôn nợ cũ'} (+${S.fn.money(priorDebt)})</button></div>`
        : '';
      detailCard = `<div class='pos-customer-assistant-card'>${line1}${line2}</div>`;
    } else if (!S.state.cartCustomerId && assist && assist.inlineNewCustomerPreview) {
      const p = assist.inlineNewCustomerPreview;
      detailCard = `<div class='pos-customer-assistant-card'><div class='pos-assist-line'><span class='badge badge-success'>SĐT mới</span><span><strong>${S.fn.esc(p.explicitName || p.fallbackName)}</strong> (${S.fn.esc(p.phoneDisplay)}) · <small class='muted'>Tự tạo thẻ &amp; ${estEarnPts > 0 ? `tích +${S.fn.number(estEarnPts)} điểm` : 'lưu tích điểm'} khi thanh toán</small></span></div></div>`;
    } else if (!S.state.cartCustomerId) {
      const rawDigits = String(S.state.posCustomerInlineText || '').replace(/\D/g, '');
      const normalizedDigits = rawDigits.startsWith('84') && rawDigits.length >= 11 ? '0' + rawDigits.slice(2) : rawDigits;
      if (/^0[35789]\d{8}$/.test(normalizedDigits)) {
        detailCard = `<div class='pos-customer-assistant-card'><div class='pos-assist-line'><span class='badge badge-success'>SĐT tích điểm</span><span>${S.fn.esc(normalizedDigits)} · <small class='muted'>Tự tạo thẻ thành viên${estEarnPts > 0 ? ` (+${S.fn.number(estEarnPts)} điểm)` : ''}</small></span></div></div>`;
      }
    }
    return `${sellerBar}${inlineInput}${detailCard}`;
  }


  S.fn.renderPosModeFooter = function renderPosModeFooter(totals, disabled) {
    if (S.state.checkoutPendingPayload) {
      return `<button class='btn btn-primary' data-action='checkout'>Kiểm tra đơn chờ <span style='margin-left:auto'>${S.fn.money(S.state.checkoutPendingPayload.totalVnd)} →</span></button>`;
    }
    const eff = S.fn.posEffectivePayable(totals);
    const collectTotal = eff.grandCollectVnd;
    if (S.state.posMode === 'delivery') {
      const label = S.state.posDelivery.collection === 'prepaid' ? 'Xác nhận đã thu & giao' : S.state.posDelivery.collection === 'debt' ? 'Tạo đơn giao · Ghi nợ' : 'Tạo đơn giao · COD';
      return `<button class='btn btn-primary' type='button' data-action='submit-delivery-sale' ${S.state.cart.length ? '' : 'disabled'}>${label} <span style='margin-left:auto'>${S.fn.money(eff.orderNetVnd)} →</span></button>`;
    }
    if (S.state.posPrefs.requireFullPayment && S.state.posStandardMethod === 'debt') S.state.posStandardMethod = 'cash';
    const methods = S.state.posPrefs.requireFullPayment
      ? [['cash', 'Tiền mặt'], ['bank_transfer', 'Chuyển khoản']]
      : [['cash', 'Tiền mặt'], ['bank_transfer', 'Chuyển khoản'], ['debt', 'Ghi nợ']];
    const payLabel = S.state.posStandardMethod === 'debt'
      ? 'Ghi nợ khách'
      : (eff.bundledDebtVnd > 0 ? 'Thu đơn + Nợ cũ' : S.state.posStandardMethod === 'bank_transfer' ? 'Thu chuyển khoản' : 'Thu tiền mặt');
    let cashBlock = '';
    if (S.state.posStandardMethod === 'cash' && S.state.cart.length) {
      const presets = S.fn.fastCashPresets(collectTotal);
      const enteredCash = S.state.posFastCashInput !== '' ? Number(S.state.posFastCashInput) : collectTotal;
      const validCash = Number.isSafeInteger(enteredCash) && enteredCash >= collectTotal;
      const changeVnd = validCash ? enteredCash - collectTotal : 0;
      cashBlock = `<div class='pos-fast-presets' role='group' aria-label='Mệnh giá gợi ý'>${presets.map(function (v, idx) {
        return `<button type='button' class='pos-fast-chip ${enteredCash === v ? 'active' : ''}' data-action='fast-cash-preset' data-amount='${v}'>${idx === 0 ? 'Đủ tiền' : S.fn.money(v)}</button>`;
      }).join('')}</div>
      <div class='pos-fast-cash-row'><label class='input-label' for='pos-fast-cash'>Khách đưa</label><input class='input' id='pos-fast-cash' type='number' min='0' step='1' value='${S.fn.esc(S.state.posFastCashInput)}' placeholder='${collectTotal}'/></div>
      ${S.state.posFastCashInput !== '' ? `<div class='pos-fast-change'><span>${validCash ? 'Thối lại' : 'Còn thiếu'}</span><strong>${S.fn.money(validCash ? changeVnd : collectTotal - (Number.isSafeInteger(enteredCash) ? enteredCash : 0))}</strong></div>` : ''}`;
    }
    const qrBtn = '';
    return `<div class='pos-standard-pay'>
      <div class='pos-standard-methods' role='radiogroup' aria-label='Phương thức thanh toán'>${methods.map(([m, label]) => `<button type='button' class='pos-fast-chip ${S.state.posStandardMethod === m ? 'active' : ''}' data-action='standard-method' data-method='${m}' ${disabled}>${label}</button>`).join('')}</div>
      ${cashBlock}
      ${qrBtn}
      <button class='btn btn-primary' type='button' data-pos-primary-pay data-action='${S.state.posStandardMethod === 'debt' ? 'checkout' : 'standard-pay'}' ${S.state.cart.length ? '' : 'disabled'}>${payLabel} <span style='margin-left:auto'>${S.fn.money(collectTotal)} →</span></button>
      <div style='display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px'>
        <button class='link-button pos-fast-more' type='button' data-action='pos-proforma' ${S.state.cart.length ? '' : 'disabled'}>In tạm tính (F8)</button>
        <button class='link-button pos-fast-more' type='button' data-action='checkout' ${S.state.cart.length ? '' : 'disabled'}>Chia thanh toán / Mã giảm →</button>
      </div>
    </div>`;
  }


  S.fn.cartTotalsHtml = function cartTotalsHtml(totals, eff, disabled) {
    const lineDiscLine = totals.lineDiscount > 0
      ? `<div class='cart-total-line'><span>Giảm theo từng món</span><strong style='color:var(--primary-hover)'>−${S.fn.money(totals.lineDiscount)}</strong></div>`
      : '';
    const orderDiscBtn = S.fn.getMaxDiscountPct() > 0
      ? `<button class='cart-total-line' type='button' data-action='discount' ${disabled} style='border:0;background:transparent;padding:0;text-align:left'><span>Giảm giá đơn <span style='color:#4a7b58'>＋</span></span><strong>${totals.discount ? '−' + S.fn.money(totals.discount) : 'Thêm'}</strong></button>`
      : `<div class='cart-total-line'><span>Giảm giá đơn</span><strong>${totals.discount ? '−' + S.fn.money(totals.discount) : '0đ'}</strong></div>`;
    const pointsLine = eff.pointsDiscountVnd > 0 ? `<div class='cart-total-line'><span>Trừ ${S.fn.number(eff.pointsUsed)} điểm</span><strong style='color:var(--accent-strong)'>−${S.fn.money(eff.pointsDiscountVnd)}</strong></div>` : '';
    const debtBundleLine = eff.bundledDebtVnd > 0 ? `<div class='cart-total-line'><span>Gộp thu nợ cũ</span><strong class='stock-number low'>+${S.fn.money(eff.bundledDebtVnd)}</strong></div>` : '';
    const rawInlineDigits = String(S.state.posCustomerInlineText || '').replace(/\D/g, '');
    const normInlineDigits = rawInlineDigits.startsWith('84') && rawInlineDigits.length >= 11 ? '0' + rawInlineDigits.slice(2) : rawInlineDigits;
    const hasLoyaltyTarget = Boolean(S.state.cartCustomerId || /^0[35789]\d{8}$/.test(normInlineDigits));
    const earnUnit = Math.max(1000, Number(S.state.store.settings?.loyaltyEarnUnitVnd || 100000));
    const estEarnPts = hasLoyaltyTarget && eff.orderNetVnd > 0 ? Math.floor(eff.orderNetVnd / earnUnit) : 0;
    const earnPreviewLine = estEarnPts > 0
      ? `<div class='cart-total-line'><span>Tích điểm đơn này</span><strong style='color:var(--success)'>+${S.fn.number(estEarnPts)} điểm</strong></div>`
      : '';
    return `<div class='cart-total-line'><span>Tạm tính</span><strong>${S.fn.money(totals.subtotal)}</strong></div>${lineDiscLine}${orderDiscBtn}${pointsLine}${debtBundleLine}<div class='cart-total-line total'><span>${eff.bundledDebtVnd > 0 ? 'Tổng thu (Đơn + Nợ cũ)' : 'Khách cần trả'}</span><strong>${S.fn.money(eff.grandCollectVnd)}</strong></div>${earnPreviewLine}`;
  }


  S.fn.cartPanel = function cartPanel(totals = S.fn.cartTotals(), isDesktop = false) {
    const customer = S.fn.customerById(S.state.cartCustomerId);
    const eff = S.fn.posEffectivePayable(totals);
    const pendingNote = S.state.checkoutPendingPayload ? `<div class='modal-note' style='margin:0 14px 10px'>Có đơn đang chờ xác nhận. <button class='link-button' data-action='retry-pending-sale'>Kiểm tra đơn →</button></div>` : '';
    const rows = S.state.cart.map(S.fn.cartRow).join('');
    const disabled = S.state.checkoutPendingPayload ? 'disabled' : '';
    const billsBar = S.fn.renderPosBillsTabs(disabled);
    const deliverySection = S.state.posMode === 'delivery' ? S.fn.renderPosDeliverySection(customer, disabled) : '';
    const standardNoteRow = S.state.posMode === 'standard'
      ? `<div class='pos-standard-note-wrap'><input class='input' type='text' data-standard-note maxlength='240' placeholder='Ghi chú đơn hàng…' value='${S.fn.esc(S.state.posStandardNote)}' aria-label='Ghi chú đơn hàng' ${disabled}/></div>`
      : '';
    const customerBlock = S.state.posMode === 'fast'
      ? `<div class='cart-customer'>${customer ? `<button data-action='pick-customer' ${disabled}><span class='avatar' style='width:22px;height:22px;font-size:8px'>${S.fn.esc(S.fn.initials(customer.name))}</span><span>${S.fn.esc(customer.name)}</span><strong>${S.fn.esc(customer.phone || 'Đổi')}</strong></button>` : ''}${S.fn.renderPosCustomerAssistantBox(totals, disabled)}</div>`
      : `<div class='cart-customer'><button data-action='pick-customer' ${disabled}><span class='avatar' style='width:24px;height:24px;font-size:8px'>${customer ? S.fn.esc(S.fn.initials(customer.name)) : '+'}</span><span>${customer ? S.fn.esc(customer.name) : 'Chọn khách hàng'}${customer && customer.debt > 0 ? ` <small class='stock-number low'>· Nợ ${S.fn.money(customer.debt)}</small>` : ''}</span><strong>${customer ? S.fn.esc(customer.phone || 'Đổi') : '＋'}</strong></button>${S.fn.renderPosCustomerAssistantBox(totals, disabled)}</div>`;
    const cartTitle = S.state.posMode === 'delivery' ? `<h2>Đơn giao hàng</h2>` : '';
    return `<section class='panel cart-panel' ${isDesktop ? "data-tour-target='pos-cart-desktop'" : ''}>${billsBar}<div class='cart-heading ${cartTitle ? '' : 'is-compact'}'>${cartTitle}<div class='cart-heading-actions'><span>${S.fn.number(totals.count)} SP</span><button class='cart-close mobile-only' data-action='close-cart' aria-label='Đóng giỏ hàng'>×</button></div></div>${customerBlock}<div class='cart-add-product mobile-only'><button class='btn btn-secondary' data-action='add-more-products' ${disabled}>＋ Thêm sản phẩm</button></div>${pendingNote}<div class='cart-items'>${rows || `<div class='cart-empty'><div>${S.state.checkoutPendingPayload ? 'Đơn đang chờ xác nhận.' : 'Chạm sản phẩm hoặc quét mã vạch'}</div></div>`}</div>${standardNoteRow}${deliverySection}<div class='cart-totals'>${S.fn.cartTotalsHtml(totals, eff, disabled)}</div><div class='cart-footer'>${S.fn.renderPosModeFooter(totals, disabled)}</div></section>`;
  }


  S.fn.updateProductSelections = function updateProductSelections(changedId) {
    const selector = changedId ? `[data-action="add-cart"][data-id="${CSS.escape(changedId)}"]` : '[data-action="add-cart"]';
    const byId = new Map(S.state.cart.map(item => [item.id, item]));
    document.querySelectorAll(selector).forEach(function (node) {
      const item = byId.get(node.dataset.id);
      const selected = item ? 'true' : 'false';
      if (node.dataset.selected !== selected) node.dataset.selected = selected;
      const nameEl = node.querySelector('strong');
      if (nameEl) {
        const label = nameEl.textContent + (item ? ' · trong giỏ: ' + S.fn.number(item.qty) : ' · thêm vào đơn');
        if (node.getAttribute('aria-label') !== label) node.setAttribute('aria-label', label);
      }
      let badge = node.querySelector('.selected-quantity');
      if (!item) { if (badge) badge.remove(); return; }
      const target = node.querySelector('.pos-price-row') || node.querySelector('[data-pos-list-qty]') || node;
      if (!badge) { badge = document.createElement('span'); badge.className = 'selected-quantity'; badge.setAttribute('aria-hidden', 'true'); target.appendChild(badge); }
      const quantity = S.fn.number(item.qty);
      if (badge.textContent !== quantity) badge.textContent = quantity;
    });
  }


  S.fn.updateCartPanelLine = function updateCartPanelLine(panel, id, totals) {
    const items = panel.querySelector('.cart-items');
    const row = items.querySelector(`[data-cart-product="${CSS.escape(id)}"]`);
    const item = S.state.cart.find(line => line.id === id);
    if (!item) {
      row?.remove();
      if (!items.firstElementChild) items.innerHTML = S.state.emptyCartRow;
    } else if (!row) {
      items.querySelector('.cart-empty')?.remove();
      items.insertAdjacentHTML('beforeend', S.fn.cartRow(item));
    } else {
      row.outerHTML = S.fn.cartRow(item);
    }
    panel.querySelector('.cart-heading-actions > span').textContent = `${S.fn.number(totals.count)} SP`;
    const disabled = S.state.checkoutPendingPayload ? 'disabled' : '';
    const eff = S.fn.posEffectivePayable(totals);
    const totalsEl = panel.querySelector('.cart-totals');
    if (totalsEl) totalsEl.innerHTML = S.fn.cartTotalsHtml(totals, eff, disabled);
    const activeTabBtn = panel.querySelector(".pos-bill-tab.active button[role='tab']");
    if (activeTabBtn) {
      let badge = activeTabBtn.querySelector('.pos-bill-badge');
      if (totals.count > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'pos-bill-badge';
          activeTabBtn.append(' ', badge);
        }
        badge.textContent = S.fn.number(totals.count);
      } else if (badge) {
        badge.remove();
      }
    }
    const footerEl = panel.querySelector('.cart-footer');
    if (footerEl) footerEl.innerHTML = S.fn.renderPosModeFooter(totals, disabled);
  }


  S.fn.refreshCartPanels = function refreshCartPanels(options) {
    S.fn.syncActivePosBillFromCart();
    S.fn.saveCartDraft();
    const changedId = options?.changedId;
    S.fn.updateProductSelections(changedId);
    const drawer = document.getElementById('drawer-cart');
    const drawerWasOpen = Boolean(drawer && drawer.classList.contains('open'));
    const activeControl = document.activeElement?.closest('#drawer-cart [data-action], .pos-layout > .cart-panel [data-action]');
    const activeControlIsInDrawer = Boolean(activeControl && activeControl.closest('#drawer-cart'));
    const activeFocus = activeControl ? {
      action: activeControl.dataset.action,
      id: activeControl.dataset.id,
      delta: activeControl.dataset.delta,
      inDrawer: activeControlIsInDrawer,
    } : null;
    const focusTarget = options && options.focus ? options.focus : activeFocus;
    const panels = [];
    if (window.matchMedia('(min-width: 1101px)').matches) {
      const desktop = document.querySelector('.pos-layout > .cart-panel'); if (desktop) panels.push({ el: desktop, isDesktop: true });
    }
    if (drawerWasOpen) { const current = drawer.querySelector('.cart-panel'); if (current) panels.push({ el: current, isDesktop: false }); }
    const totals = S.fn.cartTotals();
    if (changedId && !S.state.checkoutPendingPayload && S.state.posMode === 'standard') panels.forEach(({ el }) => S.fn.updateCartPanelLine(el, changedId, totals));
    else if (panels.length) {
      panels.forEach(function ({ el, isDesktop }) {
        const scroll = el.querySelector('.cart-items')?.scrollTop || 0, parent = el.parentElement;
        el.outerHTML = S.fn.cartPanel(totals, isDesktop);
        const items = parent.querySelector('.cart-panel .cart-items');
        if (items) items.scrollTop = scroll;
      });
    }

    const currentDrawer = document.getElementById('drawer-cart');

    document.querySelectorAll('[data-action="open-cart"]').forEach(function (button) {
      button.setAttribute('aria-expanded', String(drawerWasOpen));
      if (button.classList.contains('pos-cart-top')) button.textContent = `Giỏ hàng · ${S.fn.number(totals.count)}`;
      const count = button.querySelector('.mobile-cart-count');
      if (count) count.textContent = S.fn.number(totals.count);
      const label = Array.from(button.querySelectorAll('span')).find(function (span) { return !span.classList.contains('mobile-cart-count'); });
      if (label) label.textContent = 'Giỏ';
    });
    const checkoutButton = document.querySelector('.pos-mobile-checkout');
    if (checkoutButton) {
      checkoutButton.disabled = !S.state.cart.length && !S.state.checkoutPendingPayload;
      checkoutButton.dataset.action = S.state.checkoutPendingPayload ? 'checkout' : (S.state.posMode === 'fast' ? 'fast-pay' : S.state.posMode === 'delivery' ? 'open-cart' : (S.state.posStandardMethod === 'debt' ? 'checkout' : 'standard-pay'));
      if (S.state.posMode === 'fast' && !S.state.checkoutPendingPayload) checkoutButton.dataset.method = 'cash';
      else delete checkoutButton.dataset.method;
      const label = checkoutButton.querySelector('span');
      const amount = checkoutButton.querySelector('strong');
      if (label) label.textContent = S.state.checkoutPendingPayload ? 'Kiểm tra đơn chờ' : !S.state.cart.length ? 'Chọn mặt hàng' : S.state.posMode === 'fast' ? 'Thu tiền nhanh' : S.state.posMode === 'delivery' ? 'Nhập giao hàng' : 'Thanh toán';
      if (amount) amount.textContent = `${S.fn.money(S.state.checkoutPendingPayload ? S.state.checkoutPendingPayload.totalVnd : totals.total)} →`;
    }

    if (focusTarget && (!changedId || !activeControl?.isConnected || activeControl.disabled)) window.requestAnimationFrame(function () {
      if (!S.dom.modal.hidden || (document.activeElement !== document.body && document.activeElement !== activeControl)) return;
      const focusContainer = focusTarget.inDrawer || drawerWasOpen ? currentDrawer : document.querySelector('.pos-layout > .cart-panel');
      if (!focusContainer) return;
      const controls = Array.from(focusContainer.querySelectorAll('[data-action]'));
      const target = controls.find(function (control) {
        return !control.disabled && control.dataset.action === focusTarget.action && control.dataset.id === focusTarget.id && control.dataset.delta === focusTarget.delta;
      }) || focusContainer.querySelector('[data-action="cart-qty"]:not([disabled])') || focusContainer.querySelector('[data-action="add-more-products"]') || focusContainer.querySelector('[data-action="close-cart"]') || focusContainer.querySelector('[data-action="checkout"]:not([disabled])') || document.getElementById('pos-search');
      if (target) target.focus({ preventScroll: true });
    });
  }


  S.fn.posProductButton = function posProductButton(product) {
    return `<button class='pos-product' data-has-photo='${Boolean(product.imageUrl)}' data-action='add-cart' data-id='${product.id}'>${S.fn.productThumb(product)}<span class='pos-stock'>${product.inventoryTracked ? `Còn ${S.fn.number(S.fn.availableForSale(product))}` : 'Không theo dõi tồn'}</span><strong>${S.fn.esc(product.name)}</strong><small>${S.fn.esc(product.sku)}</small><div class='pos-price-row'><span class='pos-price'>${S.fn.money(product.price)}</span></div></button>`;
  }


  S.fn.availableForSale = function availableForSale(product) {
    if (!product.inventoryTracked) return Infinity;
    return Math.max(0, Math.round(product.stock * 1000) - Math.round((product.reserved || 0) * 1000)) / 1000;
  }


  S.fn.resetPosCatalog = function resetPosCatalog() {
    S.state.posCatalogWarehouseId = null;
    S.state.posCatalog = [];
    S.state.posKnownProducts.clear();
    S.state.posProducts = [];
    S.state.posSearchLoading = false;
    S.state.posSearchRequestNumber += 1;
    window.clearTimeout(S.state.posSearchTimer);
  }


  S.fn.rememberPosProducts = function rememberPosProducts(products, warehouseId, query) {
    if (S.state.posCatalogWarehouseId !== warehouseId) {
      S.state.posCatalogWarehouseId = warehouseId;
      S.state.posKnownProducts.clear();
      S.state.posCatalog = [];
      S.state.posProducts = [];
    }
    products.forEach(product => S.state.posKnownProducts.set(product.id, product));
    if (!query) S.state.posCatalog = products;
    else S.state.posCatalog = S.state.posCatalog.map(product => S.state.posKnownProducts.get(product.id));
    if (query === S.state.posSearchTerm) S.state.posProducts = products;
    else if (S.state.posSearchTerm) S.state.posProducts = S.state.posProducts.map(product => S.state.posKnownProducts.get(product.id) || product);
  }


  S.fn.visiblePosProducts = function visiblePosProducts() {
    if (S.state.posCatalogWarehouseId !== S.state.selectedWarehouseId) return [];
    const products = S.state.posSearchTerm ? S.state.posProducts : S.state.posCatalog;
    return products.filter(product => (S.state.categoryFilter === 'Tất cả' || product.category === S.state.categoryFilter) && S.fn.availableForSale(product) > 0);
  }


  S.fn.posProductListRow = function posProductListRow(product) {
    return `<tr class='pos-fast-scan-row' data-action='add-cart' data-id='${product.id}' role='button' tabindex='0'><td><strong>${S.fn.esc(product.name)}</strong><div class='muted' style='font-size:11.5px'>${S.fn.esc(product.sku)} · ${S.fn.esc(product.unit)}</div></td><td class='text-right'><strong>${S.fn.money(product.price)}</strong></td><td class='text-right'>${product.inventoryTracked ? S.fn.number(S.fn.availableForSale(product)) : '∞'}</td><td class='text-right' data-pos-list-qty><span class='muted'>＋</span></td></tr>`;
  }


  S.fn.renderPosCatalogMarkup = function renderPosCatalogMarkup(products, emptyHtml) {
    if (S.state.posViewMode === 'list') {
      const rows = products.length ? products.map(S.fn.posProductListRow).join('') : `<tr><td colspan='4'>${emptyHtml}</td></tr>`;
      return `<table class='data-table'><thead><tr><th>Sản phẩm / SKU</th><th class='text-right'>Giá bán</th><th class='text-right'>Tồn</th><th class='text-right'>Giỏ</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    return products.map(S.fn.posProductButton).join('') || emptyHtml;
  }


  S.fn.renderPosSearchResults = function renderPosSearchResults(error = '') {
    const container = document.getElementById('pos-products');
    if (!container) return;
    const emptyHtml = `<div class='panel empty-state' style='grid-column:1/-1'><strong>${S.fn.esc(error || (S.state.posSearchLoading ? 'Đang tìm mặt hàng…' : 'Không có mặt hàng phù hợp'))}</strong></div>`;
    const markup = S.fn.renderPosCatalogMarkup(S.fn.visiblePosProducts(), emptyHtml);
    if (container.resultsMarkup === markup) return;
    container.innerHTML = markup;
    container.resultsMarkup = markup;
    S.fn.updateProductSelections();
  }


  S.fn.searchPosProducts = function searchPosProducts(value) {
    const query = value.trim();
    const number = ++S.state.posSearchRequestNumber;
    const session = S.state.authSession, storeId = S.state.store.id, warehouseId = S.state.selectedWarehouseId;
    const current = () => number === S.state.posSearchRequestNumber && S.state.authSession === session && S.state.store.id === storeId && S.state.page === 'pos' && S.state.selectedWarehouseId === warehouseId;
    window.clearTimeout(S.state.posSearchTimer);
    S.state.posSearchTerm = query;
    S.state.posSearchLoading = Boolean(query);
    S.state.posProducts = S.state.posCatalogWarehouseId === warehouseId ? S.fn.filteredProducts(query, 'Tất cả', Array.from(S.state.posKnownProducts.values())) : [];
    S.fn.renderPosSearchResults();
    if (!query) return;
    S.state.posSearchTimer = window.setTimeout(async () => {
      const writeGeneration = S.state.localWriteGeneration;
      try {
        const warehouseQuery = warehouseId ? `&warehouseId=${encodeURIComponent(warehouseId)}` : '';
        const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/products?limit=100&q=${encodeURIComponent(query)}${warehouseQuery}`, { preferFresh: true });
        if (!current()) return;
        if (writeGeneration !== S.state.localWriteGeneration) { S.fn.searchPosProducts(query); return; }
        S.state.posSearchLoading = false;
        S.fn.rememberPosProducts(result.products.map(S.fn.mapProduct), warehouseId, query);
        S.fn.renderPosSearchResults();
      } catch (error) {
        if (!current()) return;
        S.state.posSearchLoading = false;
        if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
        else S.fn.renderPosSearchResults(error.message);
      }
    }, 180);
  }


  S.fn.renderLastSale = function renderLastSale() {
    if (!S.state.lastCompletedSale) return '';
    const sale = S.state.lastCompletedSale;
    const id = S.fn.esc(sale.id);
    const receipt = sale.offlineQueued ? '' : `<button class='btn btn-secondary' type='button' data-action='latest-receipt-png' data-id='${id}'>Gửi ảnh</button><button class='btn btn-secondary' type='button' data-action='latest-receipt' data-id='${id}'>Biên nhận</button>`;
    return `<div class='sale-saved'><span role='status'>${S.fn.icon('check', 16)} ${sale.offlineQueued ? 'Đã lưu trên máy' : 'Đã lưu'} ${S.fn.esc(sale.number)} · ${S.fn.moneyVndText(sale.total)}${Number(sale.change) ? ` · Trả lại khách ${S.fn.moneyVndText(sale.change)}` : ''}</span><div class='sale-saved-actions'><button class='link-button' type='button' data-action='order-detail' data-id='${id}'>Xem đơn</button>${receipt}</div></div>`;
  }


  S.fn.renderPOS = function renderPOS() {
    const query = S.state.posSearchTerm;
    const products = S.fn.visiblePosProducts();
    const categories = ['Tất cả'].concat(Array.from(new Set(S.state.posCatalog.map(product => product.category))));
    const totals = S.fn.cartTotals();
    const canManageProducts = S.fn.hasPerm('editProducts');
    const hasCatalog = S.state.productTotal > 0 || S.state.store.products.length > 0;
    let emptyProductState = `<div class='panel empty-state pos-empty-start' style='grid-column:1/-1'><strong>Đang tải mặt hàng…</strong></div>`;
    if (S.state.productError || S.state.warehouseError) {
      emptyProductState = `<div class='panel empty-state pos-empty-start' role='alert' style='grid-column:1/-1'><strong>Chưa tải được hàng để bán</strong><span>${S.fn.esc(S.state.productError || S.state.warehouseError)}</span><button class='btn btn-secondary' data-action='retry-pos-catalog'>Thử lại</button></div>`;
    } else if (!S.state.productLoading && (query || S.state.categoryFilter !== 'Tất cả')) {
      emptyProductState = `<div class='panel empty-state pos-empty-start' style='grid-column:1/-1'><strong>Không tìm thấy mặt hàng phù hợp</strong><span>Thử đổi từ khóa hoặc chọn mục “Tất cả”.</span></div>`;
    } else if (!S.state.productLoading && !hasCatalog) {
      emptyProductState = canManageProducts
        ? `<section class='panel pos-empty-start' style='grid-column:1/-1'><span class='pos-empty-icon' aria-hidden='true'>＋</span><strong>Chưa có mặt hàng nào</strong><div class='pos-empty-actions'><button class='btn btn-primary' data-action='new-product'>＋ Thêm hàng</button><button class='btn btn-secondary' data-action='import-products'>Nhập CSV</button></div></section>`
        : `<div class='panel empty-state pos-empty-start' style='grid-column:1/-1'><strong>Chưa có mặt hàng để bán</strong></div>`;
    } else if (!S.state.productLoading) {
      emptyProductState = canManageProducts
        ? `<div class='panel empty-state pos-empty-start' style='grid-column:1/-1'><strong>Kho đang chọn hết hàng</strong><button class='btn btn-secondary' data-route='inventory'>Mở kho hàng</button></div>`
        : `<div class='panel empty-state pos-empty-start' style='grid-column:1/-1'><strong>Kho đang chọn hết hàng</strong></div>`;
    }
    const activePosWarehouse = S.state.warehouses.find(function (warehouse) { return warehouse.id === S.state.selectedWarehouseId; }) || S.state.warehouses.find(function (warehouse) { return warehouse.is_default; }) || S.state.warehouses[0];
    const posWarehouseLocked = S.fn.hasAnyOpenPosBillItems() || Boolean(S.state.checkoutPendingPayload);
    const warehouseSelectHtml = S.state.warehouses.length > 1
      ? `<select class='pos-warehouse-select' id='pos-warehouse' aria-label='Chọn kho bán hàng' ${posWarehouseLocked ? 'disabled' : ''}>${S.state.warehouses.map(function (warehouse) { return `<option value='${S.fn.esc(warehouse.id)}' ${warehouse.id === activePosWarehouse?.id ? 'selected' : ''}>${S.fn.esc(warehouse.name)}${warehouse.is_default ? ' · Kho chính' : ''}</option>`; }).join('')}</select>`
      : '';
    const shiftChip = S.fn.hasPerm('operateCashShift')
      ? (S.state.cashRegisterState.session
        ? `<button class='pos-topbar-chip active' type='button' data-action='close-cash-session'>Ca: ${S.fn.moneyVndText(S.state.cashRegisterState.session.expectedCashVnd)}</button>`
        : `<button class='pos-topbar-chip' type='button' data-action='open-cash-session'>Mở ca</button>`)
      : '';
    const returnChip = S.fn.hasPerm('voidOrReturnOrder')
      ? `<button class='pos-topbar-chip' type='button' data-action='pos-quick-return'>Đổi trả</button>`
      : '';
    const voiceOn = S.state.posPrefs?.voiceAnnounce !== false;
    const voiceChip = `<button class='pos-topbar-chip ${voiceOn ? 'active' : ''}' type='button' data-action='pos-toggle-voice' title='Bật/tắt loa đọc tiền sau thanh toán'>Loa: ${voiceOn ? 'Bật' : 'Tắt'}</button>`;
    const viewModeToggle = `<button class='pos-topbar-chip ${S.state.posViewMode === 'grid' ? 'active' : ''}' type='button' data-action='pos-view-mode' data-mode='grid' title='Hiển thị dạng thẻ lớn'>Lưới</button><button class='pos-topbar-chip ${S.state.posViewMode === 'list' ? 'active' : ''}' type='button' data-action='pos-view-mode' data-mode='list' title='Hiển thị dạng danh sách quét nhanh'>Danh sách</button>`;
    const addProductChip = canManageProducts
      ? `<button class='pos-topbar-chip' type='button' data-action='new-product'>＋ Hàng</button>`
      : '';
    const fontPct = Number(S.state.fontScalePct || 100);
    const fontControls = `<div class='topbar-font-controls pos-font-controls' role='group' aria-label='Cỡ chữ'><button class='icon-button font-step-btn' type='button' data-action='font-decrease' title='Giảm cỡ chữ (hiện tại ${fontPct}%)' aria-label='Giảm cỡ chữ' ${fontPct <= 90 ? 'disabled' : ''}>A−</button><button class='icon-button font-step-btn' type='button' data-action='font-increase' title='Tăng cỡ chữ (hiện tại ${fontPct}%)' aria-label='Tăng cỡ chữ' ${fontPct >= 125 ? 'disabled' : ''}>A+</button></div><button class='icon-button help-button pos-help-btn' type='button' aria-label='Trợ giúp' title='Trợ giúp' data-action='help'>?</button>`;
    const moreMenuItems = [viewModeToggle, returnChip, voiceChip, addProductChip].filter(Boolean).join('');
    const moreMenuHtml = moreMenuItems
      ? `<details class='pos-more-menu'><summary class='pos-topbar-chip' aria-label='Tùy chọn quầy'>⋯ Tùy chọn</summary><div class='pos-more-dropdown'>${moreMenuItems}</div></details>`
      : '';
    const canBack = S.state.store.role !== 'cashier';
    const topbar = `<header class='pos-topbar'>
      ${canBack ? `<button type='button' class='pos-exit-btn' data-action='exit-pos' aria-label='Về trang quản trị'>${S.fn.icon('back', 16)}<span>Về quản trị</span></button>` : `<span class='pos-exit-btn' style='pointer-events:none'>${S.fn.esc(S.state.store.settings.storeName || 'Slink POS')}</span>`}
      <div class='pos-search-bar'>
        <div class='search-wrap pos-search' data-tour-target='pos-search'><span class='search-symbol'>⌕</span><input class='input' id='pos-search' type='search' placeholder='Tìm hàng, mã vạch…' value='${S.fn.esc(query)}' aria-label='Tìm sản phẩm'></div>
        <button class='pos-topbar-chip' type='button' data-action='pos-scan' aria-label='Quét mã vạch bằng camera' title='Quét mã vạch'>${S.fn.icon('scan', 17)}</button>
      </div>
      <div class='pos-topbar-actions'>
        ${warehouseSelectHtml}
        ${shiftChip}
        ${moreMenuHtml}
        ${fontControls}
      </div>
    </header>`;
    if (!S.state.productLoading && !S.state.warehouseLoading && !S.state.productError && !S.state.warehouseError && !hasCatalog && !query && S.state.categoryFilter === 'Tất cả' && !S.state.cart.length && !S.state.checkoutPendingPayload && S.state.warehouses.length <= 1) {
      return `<div class='pos-shell'>${topbar}<div class='pos-workspace-body'>${emptyProductState}</div></div>`;
    }
    const posModesBar = `<div class='pos-mode-bar' role='tablist' aria-label='Hình thức bán hàng'>
      ${[['standard', 'Tại quầy'], ['delivery', 'Giao hàng']].map(function (m) {
        return `<button type='button' role='tab' class='pos-mode-tab ${S.state.posMode === m[0] ? 'active' : ''}' data-action='pos-mode' data-mode='${m[0]}' aria-selected='${S.state.posMode === m[0]}'><strong>${m[1]}</strong></button>`;
      }).join('')}
    </div>`;
    const mobileCheckoutAction = S.state.checkoutPendingPayload ? 'checkout' : (S.state.posMode === 'delivery' ? 'open-cart' : (S.state.posStandardMethod === 'debt' ? 'checkout' : 'standard-pay'));
    const mobileCheckoutLabel = S.state.checkoutPendingPayload ? 'Kiểm tra đơn chờ' : !S.state.cart.length ? 'Chọn hàng' : S.state.posMode === 'delivery' ? 'Nhập giao hàng' : 'Thanh toán';
    const catalogContainer = S.state.posViewMode === 'list'
      ? `<div class='pos-fast-scan-table-wrap' id='pos-products'>${S.fn.renderPosCatalogMarkup(products, emptyProductState)}</div>`
      : `<div class='pos-product-grid' id='pos-products'>${S.fn.renderPosCatalogMarkup(products, emptyProductState)}</div>`;
    return `<div class='pos-shell'>${topbar}<div class='pos-workspace-body'>${S.fn.renderLastSale()}${posModesBar}${S.fn.renderAiQuickOrderBar()}<div class='pos-layout'><div><div class='category-scroll'>${categories.map(function (category) { return `<button class='pos-category ${S.state.categoryFilter === category ? 'active' : ''}' data-action='category' data-category='${S.fn.esc(category)}'>${S.fn.esc(category)}</button>`; }).join('')}</div>${catalogContainer}</div>${S.fn.cartPanel(totals, true)}</div></div><div class='pos-mobile-cart'><button class='btn pos-mobile-cart-edit' data-action='open-cart' aria-controls='drawer-cart' aria-expanded='false'><span class='mobile-cart-count'>${S.fn.number(totals.count)}</span><span>Giỏ</span></button><button class='btn btn-primary pos-mobile-checkout' data-action='${mobileCheckoutAction}' ${S.state.posMode === 'fast' && !S.state.checkoutPendingPayload ? "data-method='cash'" : ''} data-tour-target='pos-cart-mobile' ${S.state.cart.length || S.state.checkoutPendingPayload ? '' : 'disabled'}><span>${mobileCheckoutLabel}</span><strong>${S.fn.money(S.state.checkoutPendingPayload ? S.state.checkoutPendingPayload.totalVnd : totals.total)} →</strong></button></div><div class='drawer-cart' id='drawer-cart' role='dialog' aria-modal='true' aria-label='Giỏ hàng' aria-hidden='true' inert>${S.fn.cartPanel(totals, false)}</div></div>`;
  }


  S.fn.checkoutTenderRow = function checkoutTenderRow(tender, index, count, disabled) {
    const options = S.state.checkoutMethods.map(function (method) { return `<option value='${method[0]}' ${tender.method === method[0] ? 'selected' : ''}>${method[1]}</option>`; }).join('');
    return `<div class='checkout-tender-row' data-tender-row><div class='form-field'><label class='input-label' for='tender-method-${index}'>Cách thanh toán</label><div class='select-wrap'><select class='input' id='tender-method-${index}' data-tender-method ${disabled}>${options}</select></div></div><div class='form-field'><label class='input-label' for='tender-amount-${index}'>Số tiền nhận (VND)</label><input class='input' id='tender-amount-${index}' data-tender-amount type='number' inputmode='numeric' min='0' step='1' value='${S.fn.esc(tender.amountReceivedVnd)}' required ${disabled}/></div>${count > 1 ? `<button class='row-action checkout-tender-remove' type='button' data-action='remove-tender' data-index='${index}' aria-label='Xóa khoản thanh toán ${index + 1}' ${disabled}>×</button>` : ''}</div>`;
  }


  S.fn.checkoutTenderValues = function checkoutTenderValues(form) {
    return Array.from(form.querySelectorAll('[data-tender-row]')).map(function (row) {
      return {
        method: row.querySelector('[data-tender-method]').value,
        amountText: S.fn.moneyInputRaw(row.querySelector('[data-tender-amount]').value),
      };
    });
  }


  S.fn.updateCheckoutTenderSummary = function updateCheckoutTenderSummary(form) {
    const summary = form && form.querySelector('#checkout-tender-summary');
    if (!summary) return;
    const total = Number(form.dataset.totalVnd || 0);
    let received = 0;
    let cash = 0;
    let nonCash = 0;
    for (const tender of S.fn.checkoutTenderValues(form)) {
      const amountReceived = Number(tender.amountText);
      if (!Number.isSafeInteger(amountReceived) || amountReceived < 0) {
        summary.textContent = 'Nhập số tiền VND nguyên không âm cho từng phương thức.';
        summary.classList.add('error');
        return;
      }
      received += amountReceived;
      if (tender.method === 'cash') cash += amountReceived;
      else nonCash += amountReceived;
    }
    if (nonCash > total || (received > total && cash === 0)) {
      summary.textContent = nonCash > total ? 'Khoản không tiền mặt không được vượt tổng đơn.' : 'Chỉ tiền mặt mới có thể tạo tiền thối.';
      summary.classList.add('error');
      return;
    }
    const paid = nonCash + Math.min(cash, Math.max(0, total - nonCash));
    const change = received - paid;
    const due = Math.max(0, total - paid);
    summary.textContent = `Tổng nhận ${S.fn.money(received)} · Đã thu ${S.fn.money(paid)} · Còn nợ ${S.fn.money(due)}${change ? ` · Tiền thối ${S.fn.money(change)}` : ''}`;
    summary.classList.remove('error');
    const qrBox = form.querySelector('#checkout-vietqr-box');
    if (qrBox) qrBox.innerHTML = '';
  }


  S.fn.renderCheckoutTenders = function renderCheckoutTenders(form, tenders) {
    const container = form.querySelector('#checkout-tenders');
    if (!container) return;
    container.innerHTML = tenders.map(function (tender, index) {
      return S.fn.checkoutTenderRow(tender, index, tenders.length, S.state.checkoutPendingPayload ? 'disabled' : '');
    }).join('');
    const addButton = form.querySelector('[data-action="add-tender"]');
    if (addButton) addButton.disabled = tenders.length >= 5 || Boolean(S.state.checkoutPendingPayload);
    S.fn.updateCheckoutTenderSummary(form);
  }


  S.fn.applyCheckoutPromotion = async function applyCheckoutPromotion() {
    const form = S.dom.modal.querySelector('[data-form="checkout"]');
    if (!form || S.state.checkoutPendingPayload) return;
    const input = form.querySelector('[name="promotionCode"]');
    const status = form.querySelector('#checkout-promotion-status');
    const button = form.querySelector('[data-action="apply-promotion"]');
    const code = String(input?.value || '').trim().toUpperCase();
    const baseTotal = Number(form.dataset.baseTotalVnd || 0);
    const previousTotal = Number(form.dataset.totalVnd || baseTotal);
    const previousCash = Array.from(form.querySelectorAll('[data-tender-row]')).find((row) => row.querySelector('[data-tender-method]')?.value === 'cash')?.querySelector('[data-tender-amount]');
    if (previousCash && previousTotal !== baseTotal && Number(S.fn.moneyInputRaw(previousCash.value)) === previousTotal) previousCash.value = String(baseTotal);
    const showStatus = (message, isError = false) => {
      if (!status) return;
      status.textContent = message;
      status.classList.toggle('error', isError);
    };
    S.state.checkoutPromotion = null;
    form.dataset.promotionDiscountVnd = '0';
    form.dataset.totalVnd = String(baseTotal);
    form.querySelector('#checkout-due')?.replaceChildren(document.createTextNode(S.fn.money(baseTotal)));
    if (!code) {
      showStatus('Nhập mã để kiểm tra điều kiện áp dụng.');
      S.fn.updateCheckoutTenderSummary(form);
      return;
    }
    if (button) button.disabled = true;
    showStatus('Đang kiểm tra mã…');
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/promotions/preview`, {
        method: 'POST', body: {
          code,
          subtotalVnd: String(S.fn.cartTotals().subtotal),
          customerId: String(form.querySelector('[name="customerId"]')?.value || '') || null,
        },
      });
      const promotion = result.promotion;
      const discount = Number(promotion.discountVnd);
      if (!Number.isSafeInteger(discount) || discount < 1 || discount > baseTotal) throw new Error('Mức giảm trả về không hợp lệ.');
      const total = baseTotal - discount;
      const defaultCash = Array.from(form.querySelectorAll('[data-tender-row]')).find((row) => row.querySelector('[data-tender-method]')?.value === 'cash');
      const cashAmount = defaultCash?.querySelector('[data-tender-amount]');
      if (cashAmount && Number(S.fn.moneyInputRaw(cashAmount.value)) === baseTotal) cashAmount.value = String(total);
      S.state.checkoutPromotion = {
        code: promotion.code,
        discountVnd: String(promotion.discountVnd),
        customerId: String(form.querySelector('[name="customerId"]')?.value || '') || null,
      };
      form.dataset.promotionDiscountVnd = String(promotion.discountVnd);
      form.dataset.totalVnd = String(total);
      form.querySelector('#checkout-due')?.replaceChildren(document.createTextNode(S.fn.money(total)));
      showStatus(`${promotion.code} · ${promotion.name}: giảm ${S.fn.money(discount)}.`);
    } catch (error) {
      showStatus(error.message || 'Chưa kiểm tra được mã.', true);
    } finally {
      if (button && !S.state.checkoutPendingPayload) button.disabled = false;
      S.fn.updateCheckoutTenderSummary(form);
    }
  }


  S.fn.openCheckout = function openCheckout() {
    if (!S.state.cart.length && !S.state.checkoutPendingPayload) return S.fn.toast('Giỏ hàng đang trống', 'Chọn sản phẩm trước khi thanh toán.', 'error');
    const pending = S.state.checkoutPendingPayload;
    const changes = pending ? [] : S.fn.cartPriceChanges();
    if (changes.length) return S.fn.openCartPriceReview(changes);
    if (!pending) S.state.checkoutPromotion = null;
    const baseTotals = pending ? { total: Number(pending.totalVnd), count: pending.items.reduce(function (sum, item) { return sum + Number(item.quantity); }, 0) } : S.fn.cartTotals();
    const eff = pending ? { pointsDiscountVnd: 0 } : S.fn.posEffectivePayable(baseTotals);
    if (pending && pending.promotionCode) S.state.checkoutPromotion = { code: pending.promotionCode, discountVnd: String(pending.promotionDiscountVnd || '0'), customerId: pending.customerId || null };
    const promotionDiscount = pending ? Number(pending.promotionDiscountVnd || 0) : Number(S.state.checkoutPromotion?.discountVnd || 0);
    const baseAfterPoints = pending ? baseTotals.total : Math.max(0, baseTotals.total - (eff.pointsDiscountVnd || 0));
    const totals = { ...baseTotals, total: pending ? baseTotals.total : Math.max(0, baseAfterPoints - promotionDiscount) };
    const selectedCustomer = pending ? pending.customerId || '' : S.state.cartCustomerId;
    const checkoutItems = pending
      ? pending.items.map(item => ({ id: item.productId, product: S.fn.productById(item.productId), qty: Number(item.quantity), quantity: Number(item.quantity), unitPriceVnd: Number(item.expectedUnitPriceVnd ?? S.fn.productById(item.productId)?.price), discountVnd: Number(item.discountVnd || 0) }))
      : S.state.cart.map(item => ({ id: item.id, product: S.fn.productById(item.id), qty: Number(item.qty), quantity: Number(item.qty), unitPriceVnd: S.fn.cartUnitPrice(item), discountVnd: Number(item.discountVnd || 0) }));
    const itemSummary = checkoutItems.map(function (item) {
      const product = item.product;
      const gross = Number.isFinite(item.unitPriceVnd) ? S.fn.cartLineGross(item) : null;
      const disc = gross != null ? Math.max(0, Math.min(gross, Math.round(item.discountVnd || 0))) : 0;
      const net = gross != null ? gross - disc : null;
      const lineAmount = net != null
        ? `<strong>${S.fn.moneyVndText(net)}${disc > 0 ? ` <small class='muted'>(−${S.fn.moneyVndText(disc)})</small>` : ''}</strong>`
        : `<span class='muted'>Đang tải giá</span>`;
      return `<div class='checkout-item'><span>${S.fn.esc(product ? product.name : 'Mặt hàng')} <small>× ${S.fn.number(item.quantity)}</small></span>${lineAmount}</div>`;
    }).join('');
    const defaultStandardTender = S.state.posMode === 'standard' && S.state.posStandardMethod === 'debt'
      ? [{ method: 'cash', amountReceivedVnd: 0 }]
      : S.state.posMode === 'standard' && S.state.posStandardMethod === 'bank_transfer'
        ? [{ method: 'bank_transfer', amountReceivedVnd: totals.total }]
        : [{ method: 'cash', amountReceivedVnd: totals.total }];
    const selectedTenders = pending
      ? (Array.isArray(pending.tenders) && pending.tenders.length ? pending.tenders : [{ method: pending.method || 'cash', amountReceivedVnd: pending.amountReceivedVnd || 0 }])
      : defaultStandardTender;
    const selectedNote = pending ? pending.note || '' : (S.state.posMode === 'standard' ? S.state.posStandardNote || '' : '');
    const disabled = pending ? 'disabled' : '';
    const customers = `<option value=''>Khách lẻ</option>` + S.state.store.customers.map(function (c) { return `<option value='${c.id}' ${selectedCustomer === c.id ? 'selected' : ''}>${S.fn.esc(c.name)} · ${S.fn.esc(c.phone)}</option>`; }).join('');
    if (!S.state.checkoutIdempotencyKey) S.state.checkoutIdempotencyKey = S.fn.newIdempotencyKey();
    const openOptional = Boolean(selectedCustomer || selectedNote || (S.state.posMode === 'standard' && S.state.posStandardMethod === 'debt'));
    const optionalFields = `<details class='checkout-more' ${openOptional ? 'open' : ''}><summary>Thêm thông tin nếu cần</summary><div class='form-grid'><div class='form-field full'><label class='input-label'>Khách hàng</label><div class='select-wrap'><select class='input' name='customerId' ${disabled}>${customers}</select></div></div>${pending ? '' : `<div class='form-field full'><label class='input-label' for='checkout-promotion-code'>Mã giảm giá</label><div class='form-field-inline'><input class='input' id='checkout-promotion-code' name='promotionCode' maxlength='32' autocomplete='off' placeholder='Chỉ nhập khi khách có mã'/><button class='btn btn-secondary' type='button' data-action='apply-promotion'>Kiểm tra</button></div><small id='checkout-promotion-status' class='muted' aria-live='polite'>Mã sẽ được kiểm tra trước khi lưu đơn.</small></div>`}<div class='form-field full'><label class='input-label'>Ghi chú</label><input class='input' name='note' value='${S.fn.esc(selectedNote)}' placeholder='Không bắt buộc' ${disabled}/></div></div></details>`;
    const body = `<form id='entity-form' data-form='checkout' data-base-total-vnd='${baseTotals.total}' data-promotion-discount-vnd='${promotionDiscount}' data-total-vnd='${totals.total}'><div class='checkout-total'><span>${pending ? 'Đơn đang chờ · kiểm tra số tiền' : 'Khách cần thanh toán'}</span><strong id='checkout-due'>${S.fn.money(totals.total)}</strong></div><details class='work-details checkout-lines'><summary>Xem ${S.fn.number(totals.count)} sản phẩm</summary><div class='checkout-items' aria-label='Mặt hàng trong đơn'>${itemSummary}</div></details><div class='checkout-payment'><span class='input-label'>Khách trả bằng</span><div id='checkout-tenders'>${selectedTenders.map(function (tender, index) { return S.fn.checkoutTenderRow(tender, index, selectedTenders.length, disabled); }).join('')}</div>${pending ? '' : `<button class='link-button' type='button' data-action='add-tender'>＋ Chia nhiều cách trả</button>`}<div id='checkout-tender-summary' class='checkout-tender-summary' aria-live='polite'></div><div id='checkout-vietqr-box'></div></div>${optionalFields}${pending ? `<div class='modal-note'>Gửi lại cùng yêu cầu để tránh tạo đơn trùng.</div>` : ''}</form>`;
    S.fn.showModal(pending ? 'Kiểm tra đơn đang chờ' : 'Xác nhận thanh toán', `${totals.count} sản phẩm`, body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Để sau</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại đơn hàng' : 'Đã nhận tiền · Lưu đơn'}</button>`);
    S.fn.updateCheckoutTenderSummary(S.dom.modal.querySelector('[data-form="checkout"]'));
  }


  S.fn.playScanBeep = function playScanBeep(kind) {
    if (window.SlinkPosHardware && typeof window.SlinkPosHardware.playScanBeep === 'function') {
      window.SlinkPosHardware.playScanBeep(kind);
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = kind === 'error' ? 340 : 920;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
      osc.onended = () => ctx.close().catch(() => {});
    } catch (_) { /* Audio feedback is optional. */ }
  }


  S.fn.showScan = function showScan() {
    const body = `<form id='entity-form' data-form='scan'><div class='scan-camera-panel' data-scan-surface data-scan-mode='product' data-scan-target='scan-code'><div class='scan-camera-stage'><div class='scan-camera-prompt' aria-hidden='true'><span>${S.fn.icon('scan', 28)}</span><strong>Đặt mã vào khung</strong></div><video id='scan-camera-video' class='scan-camera-video' playsinline muted hidden aria-label='Khung camera để quét mã'></video><div class='scan-viewfinder' aria-hidden='true'><i></i><i></i><i></i><i></i></div><img id='scan-photo-preview' class='scan-photo-preview' alt='Ảnh vừa chụp để đối chiếu' hidden/></div><div class='scan-camera-actions'><button class='btn btn-secondary' type='button' data-action='start-camera-scan'>Mở camera</button><button class='btn btn-primary' type='button' data-action='capture-scan-photo' disabled>Chụp</button></div><p id='scan-camera-status' class='scan-camera-status' role='status' aria-live='polite'></p><details class='scan-manual-entry'><summary>Nhập mã thủ công</summary><div class='scan-manual-fields'><label class='form-field'><span class='input-label'>Mã vạch hoặc SKU</span><input id='scan-code' class='input' name='code' placeholder='Nhập mã sản phẩm' autocomplete='off' inputmode='text' maxlength='80'/></label><button class='btn btn-secondary' type='submit'>Thêm</button><button class='link-button' type='button' data-action='create-product-from-scan'>Tạo sản phẩm mới</button></div></details></div></form>`;
    S.fn.showModal('Quét mã', '', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button>`);
    S.fn.startScanCamera(S.dom.modal.querySelector('[data-action="start-camera-scan"]'));
  }


  S.fn.openProductFromScan = function openProductFromScan(barcode, photo, sku) {
    S.fn.closeModal();
    if (!S.fn.hasPerm('editProducts')) {
      S.fn.toast('Chưa có mặt hàng này', 'Nhờ chủ cửa hàng hoặc người quản lý danh mục thêm sản phẩm trước khi bán.', 'error');
      return;
    }
    S.state.page = 'pos';
    S.fn.openProduct('', { fromScan: true, barcode: barcode || '', sku: sku || '', photo: photo || '' });
  }

  S.fn.showScanPill = function showScanPill(surface, message, isError = false) {
    const pill = surface?.querySelector('[data-scan-pill]') || S.dom.modal.querySelector('[data-scan-surface]:not([hidden]) [data-scan-pill]');
    if (!pill) return;
    window.clearTimeout(S.state.scanPillTimer);
    pill.textContent = message;
    pill.classList.toggle('is-error', Boolean(isError));
    pill.hidden = false;
    S.state.scanPillTimer = window.setTimeout(function () {
      if (pill.isConnected) pill.hidden = true;
    }, 1800);
  }

  S.fn.setScanCameraStatus = function setScanCameraStatus(message, isError) {
    const status = S.dom.modal.querySelector('[data-scan-surface]:not([hidden]) #scan-camera-status') || S.dom.modal.querySelector('#scan-camera-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', Boolean(isError));
  }


  S.fn.scanCodeInput = function scanCodeInput(surface) {
    const targetId = surface?.dataset.scanTarget;
    return targetId ? document.getElementById(targetId) : null;
  }


  S.fn.captureScanPhoto = async function captureScanPhoto() {
    if (!S.state.scanCameraRunning || !S.state.scanCameraStream) return;
    const surface = S.dom.modal.querySelector('[data-scan-surface]');
    const video = surface?.querySelector('#scan-camera-video');
    const image = surface?.querySelector('#scan-photo-preview');
    const codeInput = S.fn.scanCodeInput(surface);
    const form = S.dom.modal.querySelector('form[data-form="scan"]');
    const detector = S.state.scanCameraDetector;
    const isProductScan = surface && surface.dataset.scanMode !== 'order';
    if (!surface || !video || !image || !video.videoWidth || !video.videoHeight) {
      S.fn.stopScanCamera();
      if (isProductScan) S.fn.openProductFromScan('', '');
      else S.fn.setScanCameraStatus('Chưa chụp được ảnh. Hãy thử mở camera lại hoặc nhập mã đơn.', true);
      return;
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / video.videoWidth);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      S.fn.stopScanCamera();
      if (isProductScan) S.fn.openProductFromScan('', '');
      else S.fn.setScanCameraStatus('Chưa chụp được ảnh. Hãy nhập mã đơn hoặc thử lại.', true);
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const localPhoto = canvas.toDataURL('image/jpeg', 0.78);
    S.fn.stopScanCamera();
    image.src = localPhoto;
    image.hidden = false;
    surface.classList.add('has-photo');
    if (!detector) {
      if (isProductScan) S.fn.openProductFromScan('', localPhoto);
      else S.fn.setScanCameraStatus('Ảnh đã chụp. Trình duyệt chưa tự đọc mã; hãy nhìn ảnh rồi nhập mã đơn vào ô phía trên.');
      return;
    }
    S.fn.setScanCameraStatus('Mình đã chụp ảnh và đang thử đọc mã lần nữa…');
    try {
      const codes = await detector.detect(canvas);
      const detected = codes.find(function (code) { return typeof code.rawValue === 'string' && code.rawValue.trim(); });
      if (detected && codeInput) {
        codeInput.value = detected.rawValue.trim();
        if (surface.dataset.scanMode === 'order') {
          S.fn.setScanCameraStatus('Đã điền mã đơn. Kiểm tra lại mã, mặt hàng và thông tin giao trước khi lưu.');
        } else if (form) {
          S.fn.setScanCameraStatus('Đã đọc được mã. Đang kiểm tra danh mục cửa hàng…');
          await S.fn.addByCode(form, { detected: true, photo: localPhoto });
        }
        if (!S.dom.modal.hidden) codeInput.focus();
        return;
      }
      if (isProductScan) S.fn.openProductFromScan('', localPhoto);
      else S.fn.setScanCameraStatus('Ảnh chưa đọc được mã. Hãy đưa mã gần hơn, tránh lóa sáng rồi quét lại, hoặc nhìn ảnh và nhập mã đơn vào ô phía trên.');
    } catch (_error) {
      if (isProductScan) S.fn.openProductFromScan('', localPhoto);
      else S.fn.setScanCameraStatus('Ảnh đã chụp nhưng chưa đọc được mã. Hãy thử gần hơn, đủ sáng, hoặc nhập mã đơn vào ô phía trên.');
    }
  }


  S.fn.stopScanCamera = function stopScanCamera() {
    S.state.scanCameraGeneration += 1;
    S.state.scanCameraRunning = false;
    S.state.scanCameraStarting = false;
    S.state.scanCameraDetector = null;
    if (S.state.scanCameraTimer) window.clearTimeout(S.state.scanCameraTimer);
    S.state.scanCameraTimer = 0;
    if (S.state.scanPhotoFallbackTimer) window.clearTimeout(S.state.scanPhotoFallbackTimer);
    S.state.scanPhotoFallbackTimer = 0;
    if (S.state.scanCameraStream) S.state.scanCameraStream.getTracks().forEach(function (track) { track.stop(); });
    S.state.scanCameraStream = null;
    S.dom.modal.querySelectorAll('[data-scan-surface] #scan-camera-video').forEach(function (video) {
      video.pause();
      video.srcObject = null;
      video.hidden = true;
      const surface = video.closest('[data-scan-surface]');
      if (surface) surface.classList.remove('camera-active');
    });
    const button = S.dom.modal.querySelector('[data-scan-surface] [data-action="start-camera-scan"]');
    const captureButton = S.dom.modal.querySelector('[data-scan-surface] [data-action="capture-scan-photo"]');
    if (button && button.dataset.unsupported !== 'true') {
      button.disabled = false;
      button.textContent = 'Quét lại';
    }
    if (captureButton) captureButton.disabled = true;
  }

  S.fn.startScanCamera = async function startScanCamera(button) {
    if (S.state.scanCameraRunning || S.state.scanCameraStarting) return;
    const requestGeneration = ++S.state.scanCameraGeneration;
    const surface = button?.closest('[data-scan-surface]') || S.dom.modal.querySelector('[data-scan-surface]');
    const video = surface?.querySelector('#scan-camera-video');
    const codeInput = S.fn.scanCodeInput(surface);
    const image = surface?.querySelector('#scan-photo-preview');
    const captureButton = surface?.querySelector('[data-action="capture-scan-photo"]');
    const form = S.dom.modal.querySelector('form[data-form="scan"]');
    const warehouseSearch = surface?.dataset.scanMode === 'warehouse-search';
    const productSearch = surface?.dataset.scanMode === 'product-search';
    const posCartScan = surface?.dataset.scanMode === 'pos-cart';
    const serialListScan = surface?.dataset.scanMode === 'serial-list';
    const receiveCartScan = surface?.dataset.scanMode === 'receive-cart';
    const stockCountScan = surface?.dataset.scanMode === 'stock-count';
    const warrantyLookupScan = surface?.dataset.scanMode === 'warranty-lookup';
    const inlineBarcode = surface?.dataset.scanMode === 'barcode-field' || warehouseSearch || productSearch || posCartScan || serialListScan || receiveCartScan || stockCountScan || warrantyLookupScan;
    if (!surface || !video || !codeInput || (!inlineBarcode && surface.dataset.scanMode !== 'order' && !form)) return;
    if (!window.isSecureContext || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      S.fn.setScanCameraStatus('Camera cần kết nối HTTPS và trình duyệt cho phép sử dụng camera. Bạn vẫn có thể nhập mã thủ công.', true);
      return;
    }
    const Detector = window.BarcodeDetector;
    if (inlineBarcode && typeof Detector !== 'function') {
      S.fn.setScanCameraStatus('Thiết bị này chưa hỗ trợ tự đọc mã qua camera. Bạn có thể nhập mã vạch.', true);
      return;
    }
    S.state.scanCameraStarting = true;
    const requestedFormats = ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'code_93', 'codabar', 'upc_a', 'upc_e', 'itf', 'data_matrix', 'pdf417', 'aztec'];
    try {
      if (typeof Detector !== 'function') {
        S.state.scanCameraDetector = null;
      } else {
        let supportedFormats = [];
        if (typeof Detector.getSupportedFormats === 'function') supportedFormats = await Detector.getSupportedFormats();
        if (requestGeneration !== S.state.scanCameraGeneration || S.dom.modal.hidden) return;
        if (inlineBarcode && typeof Detector.getSupportedFormats === 'function' && !supportedFormats.length) throw new Error('Không có định dạng hỗ trợ');
        const formats = supportedFormats.length ? requestedFormats.filter(function (format) { return supportedFormats.includes(format); }) : requestedFormats;
        if (!formats.length) throw new Error('Trình duyệt không hỗ trợ định dạng mã này.');
        S.state.scanCameraDetector = new Detector({ formats });
      }
    } catch (error) {
      if (requestGeneration !== S.state.scanCameraGeneration) return;
      S.state.scanCameraDetector = null;
      if (inlineBarcode) {
        S.state.scanCameraStarting = false;
        S.fn.setScanCameraStatus('Thiết bị này chưa hỗ trợ tự đọc mã qua camera. Bạn có thể nhập mã vạch.', true);
        return;
      }
      S.fn.setScanCameraStatus('Không thể tự đọc mã trên trình duyệt này. Mình sẽ mở camera để chụp ảnh mã cho bạn xem.');
    }
    if (requestGeneration !== S.state.scanCameraGeneration || S.dom.modal.hidden) return;
    if (button && button.tagName === 'BUTTON') { button.disabled = true; button.textContent = 'Đang mở camera…'; }
    if (image) { image.hidden = true; image.removeAttribute('src'); }
    S.fn.setScanCameraStatus('Đang mở camera. Cho phép truy cập camera, rồi đưa mã vào giữa khung.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (requestGeneration !== S.state.scanCameraGeneration || S.dom.modal.hidden) {
        stream.getTracks().forEach(function (track) { track.stop(); });
        return;
      }
      S.state.scanCameraStream = stream;
      video.srcObject = stream;
      video.hidden = false;
      surface.classList.remove('has-photo');
      surface.classList.add('camera-active');
      await video.play();
      if (requestGeneration !== S.state.scanCameraGeneration || S.dom.modal.hidden) {
        stream.getTracks().forEach(function (track) { track.stop(); });
        if (S.state.scanCameraStream === stream) S.state.scanCameraStream = null;
        video.srcObject = null;
        video.hidden = true;
        return;
      }
      S.state.scanCameraRunning = true;
      S.state.scanCameraStarting = false;
      if (button && button.tagName === 'BUTTON') button.textContent = 'Đang quét…';
      if (captureButton) captureButton.disabled = false;
      S.fn.setScanCameraStatus(inlineBarcode ? 'Đưa mã vạch vào khung.' : 'Đưa mã vào khung.');
      if (!inlineBarcode) S.state.scanPhotoFallbackTimer = window.setTimeout(function () {
        if (S.state.scanCameraRunning && requestGeneration === S.state.scanCameraGeneration && !S.dom.modal.hidden) S.fn.captureScanPhoto();
      }, 10000);
      const detectFrame = async function () {
        if (!S.state.scanCameraRunning || requestGeneration !== S.state.scanCameraGeneration || S.dom.modal.hidden) return;
        if (video.readyState >= 2) {
          try {
            const codes = await S.state.scanCameraDetector.detect(video);
            if (!S.state.scanCameraRunning || requestGeneration !== S.state.scanCameraGeneration || S.dom.modal.hidden) return;
            const detected = codes.find(function (code) { return typeof code.rawValue === 'string' && code.rawValue.trim(); });
            const rawValue = detected ? detected.rawValue.trim() : '';
            if (rawValue) {
              if (inlineBarcode) {
                const maxLen = codeInput.maxLength > 0 ? codeInput.maxLength : 120;
                if (rawValue.length < 1 || rawValue.length > maxLen) {
                  S.fn.setScanCameraStatus('Mã không hợp lệ.', true);
                } else if (serialListScan) {
                  const now = Date.now();
                  if (S.state.posBarcodeScanState.lastCode === rawValue && now - S.state.posBarcodeScanState.lastAt < 1200) {
                    if (S.state.scanCameraRunning && requestGeneration === S.state.scanCameraGeneration) S.state.scanCameraTimer = window.setTimeout(detectFrame, 180);
                    return;
                  }
                  S.state.posBarcodeScanState.lastCode = rawValue;
                  S.state.posBarcodeScanState.lastAt = now;
                  const targetForm = surface.closest('form');
                  const addedRes = S.fn.appendFormSerialCode(targetForm, rawValue);
                  if (addedRes.ok) S.fn.setScanCameraStatus(`✓ Đã thêm mã ${addedRes.code} (tổng ${S.fn.number(addedRes.total)})`);
                  else S.fn.setScanCameraStatus(addedRes.reason, true);
                } else if (warehouseSearch) {
                  S.fn.searchInventoryBarcode(rawValue);
                  return;
                } else if (productSearch) {
                  S.fn.closeModal();
                  S.state.searchTerms.products = rawValue;
                  S.fn.loadProductsPage(rawValue, 0, { keepSearch: true });
                  return;
                } else if (warrantyLookupScan) {
                  S.fn.stopScanCamera();
                  codeInput.value = rawValue;
                  S.fn.lookupWarrantyBySerial(rawValue);
                  return;
                } else if (receiveCartScan) {
                  const now = Date.now();
                  const contChecked = surface.querySelector('[data-scan-continuous]')?.checked !== false;
                  if (S.state.posBarcodeScanState.busy || (S.state.posBarcodeScanState.lastCode === rawValue && now - S.state.posBarcodeScanState.lastAt < 1100)) {
                    if (S.state.scanCameraRunning && requestGeneration === S.state.scanCameraGeneration) S.state.scanCameraTimer = window.setTimeout(detectFrame, 180);
                    return;
                  }
                  S.state.posBarcodeScanState.busy = true;
                  S.state.posBarcodeScanState.lastCode = rawValue;
                  S.state.posBarcodeScanState.lastAt = now;
                  codeInput.value = rawValue;
                  try {
                    const matchedReceive = await S.fn.handleReceiveBarcodeScan(codeInput);
                    if (!S.state.scanCameraRunning || requestGeneration !== S.state.scanCameraGeneration || S.dom.modal.hidden) return;
                    if (matchedReceive) {
                      window.SlinkPosHardware?.vibrate(45);
                      S.fn.playScanBeep();
                      S.fn.showScanPill(surface, `+1 ${matchedReceive.name}`);
                      S.fn.setScanCameraStatus(`✓ Đã thêm ${matchedReceive.name}`);
                      if (!contChecked) {
                        S.fn.stopScanCamera();
                        surface.hidden = true;
                        return;
                      }
                    } else {
                      S.fn.playScanBeep('error');
                      S.fn.showScanPill(surface, `Không khớp: ${rawValue}`, true);
                    }
                  } finally {
                    S.state.posBarcodeScanState.lastAt = Date.now();
                    S.state.posBarcodeScanState.busy = false;
                  }
                } else if (stockCountScan) {
                  const now = Date.now();
                  const contChecked = surface.querySelector('[data-scan-continuous]')?.checked !== false;
                  if (S.state.posBarcodeScanState.busy || (S.state.posBarcodeScanState.lastCode === rawValue && now - S.state.posBarcodeScanState.lastAt < 1100)) {
                    if (S.state.scanCameraRunning && requestGeneration === S.state.scanCameraGeneration) S.state.scanCameraTimer = window.setTimeout(detectFrame, 180);
                    return;
                  }
                  S.state.posBarcodeScanState.busy = true;
                  S.state.posBarcodeScanState.lastCode = rawValue;
                  S.state.posBarcodeScanState.lastAt = now;
                  try {
                    const countedRes = await S.fn.handleRapidStockCountScan(rawValue);
                    if (!S.state.scanCameraRunning || requestGeneration !== S.state.scanCameraGeneration || S.dom.modal.hidden) return;
                    if (countedRes?.ok) {
                      window.SlinkPosHardware?.vibrate(45);
                      S.fn.playScanBeep();
                      S.fn.showScanPill(surface, `+1 ${countedRes.name} (đếm: ${S.fn.number(countedRes.counted)})`);
                      S.fn.setScanCameraStatus(`✓ ${countedRes.name}: ${S.fn.number(countedRes.counted)}`);
                      if (!contChecked) {
                        S.fn.stopScanCamera();
                        return;
                      }
                    } else if (countedRes?.reason) {
                      S.fn.playScanBeep('error');
                      S.fn.showScanPill(surface, countedRes.reason, true);
                      S.fn.setScanCameraStatus(countedRes.reason, true);
                    }
                  } finally {
                    S.state.posBarcodeScanState.lastAt = Date.now();
                    S.state.posBarcodeScanState.busy = false;
                  }
                } else if (posCartScan) {
                  const now = Date.now();
                  if (S.state.posBarcodeScanState.busy || (S.state.posBarcodeScanState.lastCode === rawValue && now - S.state.posBarcodeScanState.lastAt < 1100)) {
                    if (S.state.scanCameraRunning && requestGeneration === S.state.scanCameraGeneration) S.state.scanCameraTimer = window.setTimeout(detectFrame, 180);
                    return;
                  }
                  S.state.posBarcodeScanState.busy = true;
                  S.state.posBarcodeScanState.lastCode = rawValue;
                  S.state.posBarcodeScanState.lastAt = now;
                  if (codeInput) codeInput.value = '';
                  try {
                    const added = await S.fn.handlePosBarcodeSubmit(rawValue, { keepModalStatus: true, fromCamera: true, surface });
                    if (!S.state.scanCameraRunning || requestGeneration !== S.state.scanCameraGeneration || S.dom.modal.hidden) return;
                    if (added) {
                      window.SlinkPosHardware?.vibrate(45);
                      S.dom.modal.querySelector('[data-form="pos-scan"] [data-form-message]')?.remove();
                      if (!S.state.posBarcodeScanState.continuous) {
                        S.fn.closeModal();
                        return;
                      }
                    }
                  } finally {
                    S.state.posBarcodeScanState.lastAt = Date.now();
                    S.state.posBarcodeScanState.busy = false;
                  }
                } else {
                  codeInput.value = rawValue;
                  codeInput.dispatchEvent(new Event('input', { bubbles: true }));
                  S.fn.closeProductBarcode();
                  return;
                }
              } else {
                S.fn.stopScanCamera();
                codeInput.value = rawValue;
                if (surface.dataset.scanMode === 'order') {
                  S.fn.setScanCameraStatus('Đã điền mã đơn.');
                } else {
                  S.fn.setScanCameraStatus('Đang tìm sản phẩm…');
                  await S.fn.addByCode(form, { detected: true });
                }
                if (!S.dom.modal.hidden) codeInput.focus();
                return;
              }
            }
          } catch (error) {
            if (requestGeneration !== S.state.scanCameraGeneration) return;
            if (inlineBarcode) {
              S.fn.stopScanCamera();
              S.fn.setScanCameraStatus('Chưa đọc được mã. Thử lại hoặc nhập thủ công.', true);
              return;
            }
            S.fn.setScanCameraStatus('Đang chụp ảnh đối chiếu…');
            await S.fn.captureScanPhoto();
            return;
          }
        }
        if (S.state.scanCameraRunning && requestGeneration === S.state.scanCameraGeneration) S.state.scanCameraTimer = window.setTimeout(detectFrame, 160);
      };
      if (S.state.scanCameraDetector) detectFrame();
    } catch (error) {
      if (requestGeneration !== S.state.scanCameraGeneration) return;
      S.fn.stopScanCamera();
      const message = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
        ? 'Quyền camera chưa được cấp. Cho phép camera trong cài đặt trình duyệt hoặc tiếp tục nhập mã thủ công.'
        : error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError'
          ? 'Không tìm thấy camera trên thiết bị này. Bạn vẫn có thể nhập mã thủ công.'
          : 'Chưa mở được camera. Hãy kiểm tra quyền camera hoặc nhập mã thủ công.';
      S.fn.setScanCameraStatus(message, true);
      if (codeInput) codeInput.focus();
    } finally {
      S.state.scanCameraStarting = false;
    }
  }

  S.fn.maxAllowedDiscountVnd = function maxAllowedDiscountVnd(subtotal) {
    const maxPct = S.fn.getMaxDiscountPct();
    if (maxPct <= 0) return 0;
    const sub = BigInt(Math.max(0, Math.trunc(Number(subtotal || 0))));
    const cap = (sub * BigInt(maxPct)) / 100n;
    return Number(cap);
  }


  S.fn.showDiscount = function showDiscount() {
    const maxPct = S.fn.getMaxDiscountPct();
    if (maxPct <= 0) {
      return S.fn.toast('Không có quyền giảm giá', 'Tài khoản này chưa được cấp hạn mức giảm giá tại quầy.', 'error');
    }
    const totals = S.fn.cartTotals();
    const subtotal = totals.subtotal;
    const totalCap = S.fn.maxAllowedDiscountVnd(subtotal);
    const maxVnd = Math.max(0, Math.min(subtotal - totals.lineDiscount, totalCap - totals.lineDiscount));
    const current = Math.min(S.state.cart.discount || 0, maxVnd);
    const chips = [['percent', 5, '5%'], ['percent', 10, '10%'], ['percent', 15, '15%'], ['percent', 20, '20%'], ['vnd', 0, 'Xóa giảm']]
      .filter(([m, v]) => m !== 'percent' || v <= maxPct)
      .map(([m, v, l]) => `<button type='button' class='pos-fast-chip' data-action='quick-discount' data-mode='${m}' data-value='${v}'>${l}</button>`)
      .join('');
    const form = `<form id='entity-form' data-form='discount'>
      <div class='form-grid'>
        <div class='form-field'><label class='input-label' for='disc-mode'>Kiểu giảm</label><div class='select-wrap'><select class='input' id='disc-mode' name='discountMode'><option value='vnd'>Số tiền (₫)</option><option value='percent'>Phần trăm (%)</option></select></div></div>
        <div class='form-field'><label class='input-label' for='disc-val'>Giá trị giảm</label><input class='input' id='disc-val' name='discount' type='number' min='0' max='${maxVnd}' step='1' value='${current}' required/></div>
      </div>
      <div style='display:flex;flex-wrap:wrap;gap:6px;margin-top:10px'>${chips}</div>
      <small class='muted' style='display:block;margin-top:8px'>Tạm tính: ${S.fn.money(subtotal)}${totals.lineDiscount > 0 ? ` · Đã giảm món: ${S.fn.money(totals.lineDiscount)}` : ''} · Hạn mức còn lại: tối đa ${S.fn.money(maxVnd)} (${S.fn.number(maxPct)}% tổng đơn)</small>
    </form>`;
    S.fn.modalForm('Giảm giá đơn hàng', '', form, 'Áp dụng');
  }


  S.fn.openLineDiscountModal = function openLineDiscountModal(productId) {
    if (S.state.checkoutPendingPayload) return S.fn.toast('Đang chờ xác nhận đơn', 'Hoàn tất đơn đang chờ trước khi sửa giảm giá.', 'error');
    const maxPct = S.fn.getMaxDiscountPct();
    if (maxPct <= 0) return S.fn.toast('Không có quyền giảm giá', 'Tài khoản này chưa được cấp hạn mức giảm giá tại quầy.', 'error');
    const item = S.state.cart.find(row => row.id === productId);
    const product = S.fn.productById(productId);
    if (!item || !product) return;
    const totals = S.fn.cartTotals();
    const lineGross = S.fn.cartLineGross(item);
    const currentLineDisc = Math.max(0, Math.min(lineGross, Math.round(Number(item.discountVnd) || 0)));
    const otherLinesDiscount = Math.max(0, totals.lineDiscount - currentLineDisc);
    const totalAllowance = S.fn.maxAllowedDiscountVnd(totals.subtotal);
    const maxLineCap = Math.max(0, Math.min(lineGross, totalAllowance - otherLinesDiscount - totals.orderDiscount));
    const chips = [['percent', 5, '5%'], ['percent', 10, '10%'], ['percent', 15, '15%'], ['percent', 20, '20%'], ['vnd', 0, 'Xóa giảm']]
      .filter(([m, v]) => m !== 'percent' || v <= maxPct)
      .map(([m, v, l]) => `<button type='button' class='pos-fast-chip' data-action='quick-discount' data-mode='${m}' data-value='${v}'>${l}</button>`)
      .join('');
    const form = `<form id='entity-form' data-form='pos-line-discount' data-id='${S.fn.esc(product.id)}' data-line-gross='${lineGross}' data-max-cap='${maxLineCap}'>
      <div class='form-grid'>
        <div class='form-field'><label class='input-label' for='line-disc-mode'>Kiểu giảm món</label><div class='select-wrap'><select class='input' id='line-disc-mode' name='discountMode'><option value='vnd'>Số tiền (₫)</option><option value='percent'>Phần trăm (%)</option></select></div></div>
        <div class='form-field'><label class='input-label' for='line-disc-val'>Giá trị giảm</label><input class='input' id='line-disc-val' name='discount' type='number' min='0' step='1' value='${currentLineDisc}' required/></div>
      </div>
      <div style='display:flex;flex-wrap:wrap;gap:6px;margin-top:10px'>${chips}</div>
      <small class='muted' style='display:block;margin-top:8px'>Thành tiền món: ${S.fn.money(lineGross)} (${S.fn.number(item.qty)} × ${S.fn.moneyVndText(S.fn.cartUnitPrice(item))}) · Tối đa hợp lệ: ${S.fn.money(maxLineCap)}</small>
    </form>`;
    S.fn.modalForm('Giảm giá theo món', product.name, form, 'Áp dụng');
  }


  S.fn.saveLineDiscount = function saveLineDiscount(form) {
    const id = form.dataset.id;
    const item = S.state.cart.find(row => row.id === id);
    if (!item) return S.fn.closeModal();
    const maxPct = S.fn.getMaxDiscountPct();
    if (maxPct <= 0) return S.fn.toast('Không có quyền giảm giá', 'Tài khoản này chưa được cấp hạn mức giảm giá.', 'error');
    const fd = new FormData(form);
    const mode = String(fd.get('discountMode') || 'vnd');
    const rawVal = Math.max(0, Number(fd.get('discount')) || 0);
    const lineGross = S.fn.cartLineGross(item);
    const totals = S.fn.cartTotals();
    const currentLineDisc = Math.max(0, Math.min(lineGross, Math.round(Number(item.discountVnd) || 0)));
    const otherLinesDiscount = Math.max(0, totals.lineDiscount - currentLineDisc);
    const totalAllowance = S.fn.maxAllowedDiscountVnd(totals.subtotal);
    const maxLineCap = Math.max(0, Math.min(lineGross, totalAllowance - otherLinesDiscount - totals.orderDiscount));
    const computed = mode === 'percent' ? Math.round(lineGross * Math.min(100, rawVal) / 100) : Math.round(rawVal);
    if (computed > maxLineCap) {
      return S.fn.toast('Vượt hạn mức giảm món', `Tối đa hợp lệ cho món này là ${S.fn.money(maxLineCap)} (theo giá trị món và hạn mức ${S.fn.number(maxPct)}%).`, 'error');
    }
    item.discountVnd = Math.max(0, computed);
    S.fn.closeModal();
    if (S.state.page === 'pos') S.fn.refreshCartPanels({ changedId: id });
    else S.fn.render();
    S.fn.toast('Đã cập nhật giảm món', item.discountVnd ? `−${S.fn.money(item.discountVnd)}` : 'Không giảm');
  }


  S.fn.cartDraftValue = function cartDraftValue() {
    return { items: S.state.cart.map(item => ({ id: item.id, qty: item.qty, unitPriceVnd: S.fn.cartUnitPrice(item), ...(Number(item.discountVnd) > 0 ? { discountVnd: Math.round(Number(item.discountVnd)) } : {}), ...(Array.isArray(item.serialCodes) && item.serialCodes.length ? { serialCodes: item.serialCodes.slice() } : {}) })), customerId: S.state.cartCustomerId, discount: S.state.cart.discount || 0, warehouseId: S.state.selectedWarehouseId };
  }

  S.fn.saveCartDraft = function saveCartDraft() {
    const scope = S.fn.activeOfflineScope();
    if (!scope || scope !== S.state.cartDraftReady || S.state.checkoutPendingPayload) return;
    const value = S.fn.cartDraftValue();
    const signature = JSON.stringify(value);
    if (S.state.cartDraftLast === signature) return;
    S.state.cartDraftLast = signature;
    S.state.offlineDisk.putMeta('cart|' + scope, value).catch(error => { S.state.cartDraftLast = ''; S.state.offlineState.storageIssue = error.message; S.fn.updateOfflineStatus(); });
  }

  S.fn.restoreCartDraft = async function restoreCartDraft() {
    const scope = S.fn.activeOfflineScope();
    if (!scope) return;
    const value = await S.state.offlineDisk.getMeta('cart|' + scope);
    if (scope !== S.fn.activeOfflineScope()) return;
    if (!S.state.checkoutPendingPayload && value?.items?.length && S.state.warehouses.some(row => row.id === value.warehouseId)) {
      S.state.selectedWarehouseId = value.warehouseId;
      const snapshot = await S.state.offlineDisk.snapshot(scope), state = window.SlinkOfflineLedger.derive(snapshot.responses, snapshot.operations);
      for (const item of value.items) {
        const row = state.products.get(window.SlinkOfflineLedger.productKey(S.state.selectedWarehouseId, item.id));
        if (row) S.fn.mapProduct(row);
      }
      S.state.cart = value.items.filter(item => S.fn.productById(item.id) && item.qty > 0).map(item => ({ ...item, unitPriceVnd: S.fn.cartUnitPrice(item) }));
      S.state.cartCustomerId = value.customerId || ''; S.state.cart.discount = value.discount || 0;
      const customer = state.customers.get(S.state.cartCustomerId); if (customer) S.fn.mapCustomer(customer);
      if (S.state.page === 'pos') await S.fn.loadProductsPage('', 0);
    }
    S.state.cartDraftReady = scope; S.state.cartDraftLast = '';
    S.fn.saveCartDraft();
    if (S.state.page === 'pos') S.fn.refreshCartPanels();
  }

  S.fn.openLocalOrder = async function openLocalOrder(key) {
    const scope = S.fn.activeOfflineScope(); if (!scope) return;
    const snapshot = await S.state.offlineDisk.snapshot(scope), record = snapshot.operations.find(row => row.key === key && row.kind === 'sale');
    if (!record) return S.fn.toast('Không tìm thấy đơn trên máy', 'Mở danh sách chứng từ để kiểm tra.', 'error');
    if (record.state === 'acknowledged') return S.fn.openOrder(record.result.order.id);
    const result = S.fn.provisionalResult(record, snapshot), order = result.order;
    const lines = order.items.map(item => `<div class='offline-line'><span>${S.fn.esc(item.name)} × ${S.fn.number(item.quantity)}</span><strong>${S.fn.moneyVndText(String(window.SlinkOfflineLedger.lineTotal(item.unitPriceVnd, window.SlinkOfflineLedger.quantity(item.quantity))))}</strong></div>`).join('');
    S.fn.showModal('Đơn ' + order.number, 'Đã lưu trên thiết bị · Chờ hoàn tất đồng bộ', `<div class='modal-note'>${S.fn.esc(record.issue?.message || 'Đơn được giữ trên máy và tự gửi khi có mạng. Không tạo lại đơn này. Mã chính thức sẽ có sau đồng bộ.')}</div>${lines}<div class='offline-line'><span>Tổng tiền</span><strong>${S.fn.moneyVndText(order.totalVnd)}</strong></div><div class='offline-line'><span>Đã nhận (ghi thủ công)</span><strong>${S.fn.moneyVndText(order.receivedVnd)}</strong></div><div class='offline-line'><span>Trả lại khách</span><strong>${S.fn.moneyVndText(order.changeVnd)}</strong></div><p class='muted'>${S.fn.esc(S.fn.humanDate(record.queuedAt, true))}</p>`, `<button class='btn btn-secondary' data-action='offline-records'>Chứng từ trên máy</button><button class='btn btn-primary' data-action='close-modal'>Đóng</button>`);
  }

  S.fn.openOfflineRecords = async function openOfflineRecords() {
    const scope = S.fn.activeOfflineScope(); if (!scope) return;
    const snapshot = await S.state.offlineDisk.snapshot(scope), prepared = await S.state.offlineDisk.getMeta('prepared|' + scope);
    if (scope !== S.fn.activeOfflineScope()) return;
    const names = { sale: 'Đơn bán', purchase: 'Phiếu nhập', 'stock-count': 'Kiểm kê', cash: 'Thu chi', 'shift-open': 'Mở ca', 'shift-close': 'Chốt ca' };
    const states = { ready: 'Đã lưu trên máy', sending: 'Đang gửi', confirmed: 'Đã nhận · đang đối chiếu', acknowledged: 'Đã đồng bộ', conflict: 'Cần kiểm tra' };
    const rows = snapshot.operations.slice().reverse();
    const conflictUi = window.SlinkOfflineConflictUI;
    const html = rows.map(row => {
      const inspection = S.state.offlineConflictInspections.get(row.id) || null;
      const issueText = row.state === 'conflict' && conflictUi
        ? conflictUi.explainConflictVi(row, inspection)
        : (row.issue?.message || '');
      const conflictCard = row.state === 'conflict' && conflictUi
        ? (inspection
          ? conflictUi.buildConflictComparisonHtml(row, inspection, { role: S.state.store.role, canResolvePrice: S.fn.hasPerm('manageSettings') || S.fn.hasPerm('viewAudit') })
          : `<div class='conflict-toolbar'><button class='btn btn-primary' type='button' data-action='offline-inspect-conflict' data-id='${S.fn.esc(row.id)}'>Kiểm tra &amp; xử lý xung đột</button><button class='btn btn-secondary' type='button' data-action='offline-retry' data-id='${S.fn.esc(row.id)}'>Thử gửi lại</button></div>`)
        : '';
      return `<article class='offline-record' data-offline-state='${S.fn.esc(row.state)}'><div class='offline-line'><strong>${S.fn.esc(names[row.kind])} · ${row.result?.order?.number ? S.fn.esc(row.result.order.number) : 'TẠM-' + String(row.sequence).padStart(4, '0')}</strong><span>${S.fn.esc(states[row.state])}</span></div><small>${S.fn.esc(S.fn.humanDate(row.queuedAt, true))}</small>${issueText ? `<p role='alert'>${S.fn.esc(issueText)}</p>` : ''}${conflictCard}<details><summary>Xem thông tin</summary><dl><dt>Mã chống ghi trùng</dt><dd>${S.fn.esc(row.key)}</dd><dt>Nội dung</dt><dd><pre>${S.fn.esc(JSON.stringify(row.source || row.payload, null, 2))}</pre></dd></dl></details>${row.kind === 'sale' ? `<button class='link-button' data-action='order-detail' data-id='local:${S.fn.esc(row.key)}'>Xem đơn</button>` : ''}</article>`;
    }).join('');
    S.fn.showModal('Chứng từ trên thiết bị', prepared ? 'Đã chuẩn bị dữ liệu: ' + S.fn.humanDate(prepared, true) : 'Kết nối mạng một lần để chuẩn bị dữ liệu.', `${S.state.offlineState.storageIssue || S.state.offlineState.issue ? `<p class='auth-message error' role='alert'>${S.fn.esc(S.state.offlineState.storageIssue || S.state.offlineState.issue)}</p>` : ''}<p class='modal-note'>${S.state.offlineState.pending ? 'Chứng từ chưa đồng bộ vẫn ở máy này. Giữ dữ liệu ứng dụng; không tạo lại cùng giao dịch ở máy khác.' : 'Các việc đã đồng bộ có trên máy chủ. Việc cần dữ liệu chung như trả hàng, sửa danh mục, quản lý tài khoản và kết nối sàn cần mạng.'}</p>${html || `<p>Chưa có chứng từ chờ trên máy này.</p>`}`, `<button class='btn btn-secondary' data-action='offline-export'>Lưu bản đối chiếu</button><button class='btn btn-secondary' data-action='offline-sync'>Đồng bộ / chuẩn bị</button><button class='btn btn-primary' data-action='close-modal'>Đóng</button>`, true);
  }


  S.fn.inspectOfflineConflict = async function inspectOfflineConflict(operationId, button) {
    const scope = S.fn.activeOfflineScope();
    const conflictUi = window.SlinkOfflineConflictUI;
    if (!scope || !conflictUi || !S.state.store.id) return;
    const ops = await S.state.offlineDisk.operations(scope);
    const operation = ops.find(row => row.id === operationId);
    if (!operation) return;
    if (button) button.disabled = true;
    try {
      const inspection = await conflictUi.inspectOperation({ storeId: S.state.store.id, operation, csrfToken: S.fn.csrfCookie() });
      S.state.offlineConflictInspections.set(operationId, inspection);
      await S.fn.openOfflineRecords();
    } catch (error) {
      S.fn.toast('Chưa kiểm tra được xung đột', error.message, 'error');
      if (button?.isConnected) button.disabled = false;
    }
  }


  S.fn.readOrCreatePendingKey = function readOrCreatePendingKey(storageKey) {
    try {
      const existing = localStorage.getItem(storageKey);
      if (existing && existing.length >= 16) return existing;
      const created = S.fn.newIdempotencyKey();
      localStorage.setItem(storageKey, created);
      return created;
    } catch (_) {
      return S.fn.newIdempotencyKey();
    }
  }


  S.fn.clearPendingKey = function clearPendingKey(storageKey) {
    try { localStorage.removeItem(storageKey); } catch (_) {}
  }


  S.fn.handleOfflineConflictAction = async function handleOfflineConflictAction(button) {
    const action = button.dataset.conflictAction;
    const operationId = button.dataset.id;
    const scope = S.fn.activeOfflineScope();
    const conflictUi = window.SlinkOfflineConflictUI;
    if (!scope || !conflictUi || !operationId) return;
    const ops = await S.state.offlineDisk.operations(scope);
    const operation = ops.find(row => row.id === operationId);
    if (!operation) return;
    const inspection = S.state.offlineConflictInspections.get(operationId) || null;
    if (action === 'retry-sync' || action === 'retry-plain') {
      await S.state.offlineDisk.retry(scope, operationId);
      S.state.offlineConflictInspections.delete(operationId);
      S.fn.closeModal();
      S.fn.startOfflineSync();
      return;
    }
    if (action === 'export-slip') {
      const text = conflictUi.buildReconciliationText(operation, inspection);
      await S.fn.download('doi-chieu-' + String(operation.key || operationId).slice(0, 12) + '.txt', text, 'text/plain;charset=utf-8');
      S.fn.toast('Đã tải phiếu đối chiếu');
      return;
    }
    const allowedActions = ['acknowledge-synced', 'resolve-historical', 'resolve-discounted', 'requeue-stock-count'];
    if (!allowedActions.includes(action)) return;
    if ((action === 'resolve-historical' || action === 'resolve-discounted') && !S.fn.hasPerm('manageSettings') && !S.fn.hasPerm('viewAudit')) {
      return S.fn.toast('Không có quyền xử lý', 'Chỉ Chủ cửa hàng hoặc Quản lý được xác nhận chênh lệch giá.', 'error');
    }
    const card = button.closest('.conflict-card');
    const reason = card?.querySelector('[data-conflict-field="reason"]')?.value?.trim() || '';
    const assignShift = Boolean(card?.querySelector('[data-conflict-field="assignToCurrentCashSession"]')?.checked);
    const conflictKeyStorage = `slink-conflict-key:${S.state.store.id}:${operationId}:${action}`;
    button.disabled = true;
    try {
      if (action === 'requeue-stock-count') {
        await conflictUi.requeueStockCountConflict({ scope, disk: S.state.offlineDisk, operation, inspection, nextKey: S.fn.newIdempotencyKey() });
        S.state.offlineConflictInspections.delete(operationId);
        S.fn.toast('Đã xếp lại phiếu kiểm kê', 'Hệ thống sẽ đồng bộ lại ngay.');
      } else {
        const mode = action === 'resolve-discounted' ? 'accept_current_price_with_discount' : 'accept_historical_price';
        await conflictUi.resolveQueuedConflict({
          storeId: S.state.store.id, scope, disk: S.state.offlineDisk, operation, inspection, mode, reason,
          assignToCurrentCashSession: assignShift, csrfToken: S.fn.csrfCookie(),
          idempotencyKey: S.fn.readOrCreatePendingKey(conflictKeyStorage),
        });
        S.fn.clearPendingKey(conflictKeyStorage);
        S.state.offlineConflictInspections.delete(operationId);
        S.fn.toast('Đã xử lý chứng từ xung đột', 'Dữ liệu đã được đồng bộ lên máy chủ.');
      }
      await S.fn.offlineRowsChanged(false);
      await S.fn.openOfflineRecords();
      S.fn.startOfflineSync();
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        S.fn.clearPendingKey(conflictKeyStorage);
      }
      S.fn.toast('Chưa xử lý được xung đột', error.message, 'error');
      if (button.isConnected) button.disabled = false;
    }
  }

  S.fn.exportOfflineRecords = async function exportOfflineRecords() {
    const scope = S.fn.activeOfflineScope(); if (!scope) return;
    const rows = await S.state.offlineDisk.operations(scope);
    await S.fn.download('chung-tu-tren-may-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ format: 'slink-offline-review-v1', userId: S.state.authSession.user.id, storeId: S.state.store.id, exportedAt: new Date().toISOString(), operations: rows }, null, 2), 'application/json');
  }


  S.fn.addSerialToCart = function addSerialToCart(product, serialCode) {
    if (S.state.checkoutPendingPayload) { S.fn.toast('Đang chờ xác nhận đơn', 'Hãy kiểm tra hoặc gửi lại đơn trước khi tạo đơn mới.', 'error'); return false; }
    if (!product || !(S.fn.availableForSale(product) > 0)) { S.fn.toast('Không còn hàng để bán', 'Kiểm tra tồn kho và số hàng đang giữ.', 'error'); return false; }
    if (S.fn.hasSerialInAnyPosBill(serialCode)) { S.fn.toast('Mã đã có trong giỏ', `Mã “${serialCode}” đã được quét vào đơn rồi.`, 'error'); return false; }
    const current = S.state.cart.find(function (item) { return item.id === product.id; });
    const inOtherBills = product.inventoryTracked ? S.fn.qtyReservedInOtherPosBills(product.id) : 0;
    const remaining = Math.round((S.fn.availableForSale(product) - inOtherBills - (current ? current.qty : 0)) * 1000) / 1000;
    if (!(remaining >= 1)) { S.fn.toast('Đã chọn hết hàng có thể bán', inOtherBills > 0 ? 'Một phần hàng đang nằm ở đơn chờ khác.' : '', 'error'); return false; }
    if (current) {
      if (!Array.isArray(current.serialCodes) || !current.serialCodes.length) {
        S.fn.toast('Xóa dòng chọn tay trước', 'Sản phẩm này đang được chọn theo số lượng tay — hãy xóa dòng cũ rồi quét mã riêng.', 'error');
        return false;
      }
      current.serialCodes.push(serialCode);
      current.qty = current.serialCodes.length;
    } else {
      S.state.cart.push({ id: product.id, qty: 1, unitPriceVnd: product.price, serialCodes: [serialCode] });
    }
    if (S.state.page === 'pos') S.fn.refreshCartPanels({ changedId: product.id });
    else S.fn.render();
    return true;
  }


  S.fn.removeSerialFromCart = function removeSerialFromCart(productId, serialCode) {
    if (S.state.checkoutPendingPayload) return S.fn.toast('Đang chờ xác nhận đơn', 'Hãy kiểm tra đơn đang chờ trước khi thay đổi giỏ hàng.', 'error');
    const item = S.state.cart.find(x => x.id === productId);
    if (!item || !Array.isArray(item.serialCodes)) return;
    const key = String(serialCode || '').toLocaleLowerCase('vi');
    item.serialCodes = item.serialCodes.filter(c => String(c).toLocaleLowerCase('vi') !== key);
    item.qty = item.serialCodes.length;
    if (item.qty <= 0) S.state.cart = S.state.cart.filter(x => x.id !== productId);
    S.fn.refreshCartPanels({ changedId: productId });
  }


  S.fn.buildSalePayloadItems = function buildSalePayloadItems() {
    return S.state.cart.map(item => {
      const lineGross = S.fn.cartLineGross(item);
      const disc = Math.max(0, Math.min(lineGross, Math.round(Number(item.discountVnd) || 0)));
      return {
        productId: item.id,
        quantity: item.qty,
        expectedUnitPriceVnd: String(S.fn.cartUnitPrice(item)),
        ...(disc > 0 ? { discountVnd: disc } : {}),
        ...(Array.isArray(item.serialCodes) && item.serialCodes.length ? { serialCodes: item.serialCodes.slice() } : {}),
      };
    });
  }


  S.fn.addProductToCart = function addProductToCart(product) {
    if (S.state.checkoutPendingPayload) { S.fn.toast('Đang chờ xác nhận đơn', 'Hãy kiểm tra hoặc gửi lại đơn trước khi tạo đơn mới.', 'error'); return false; }
    if (!product || !(S.fn.availableForSale(product) > 0)) { S.fn.toast('Không còn hàng để bán', 'Kiểm tra tồn kho và số hàng đang giữ.', 'error'); return false; }
    if (product.serialTracked && (!navigator.onLine || S.state.offlineState.pending)) {
      S.fn.toast('Cần kết nối mạng', 'Hàng quản lý theo từng mã riêng cần có mạng để khóa mã, tránh bán trùng.', 'error');
      return false;
    }
    const current = S.state.cart.find(function (item) { return item.id === product.id; });
    if (current && Array.isArray(current.serialCodes) && current.serialCodes.length) {
      S.fn.toast('Quét mã riêng tiếp theo', 'Sản phẩm này đang chọn theo từng mã riêng — hãy quét mã kế tiếp.', 'error');
      return false;
    }
    const inOtherBills = product.inventoryTracked ? S.fn.qtyReservedInOtherPosBills(product.id) : 0;
    const remaining = Math.round((S.fn.availableForSale(product) - inOtherBills - (current ? current.qty : 0)) * 1000) / 1000;
    if (!(remaining > 0)) { S.fn.toast('Đã chọn hết hàng có thể bán', inOtherBills > 0 ? 'Một phần hàng đang nằm ở đơn chờ khác.' : '', 'error'); return false; }
    const increment = Math.min(1, remaining);
    if (current) current.qty = Math.round((current.qty + increment) * 1000) / 1000;
    else S.state.cart.push({ id: product.id, qty: increment, unitPriceVnd: product.price });
    if (S.state.page === 'pos') S.fn.refreshCartPanels({ changedId: product.id });
    else S.fn.render();
    return true;
  }


  S.fn.addToCart = function addToCart(id) {
    return S.fn.addProductToCart(S.fn.productById(id));
  }


  S.fn.setCartQty = function setCartQty(id, delta) {
    if (S.state.checkoutPendingPayload) return S.fn.toast('Đang chờ xác nhận đơn', 'Hãy kiểm tra hoặc gửi lại đơn trước khi thay đổi giỏ hàng.', 'error');
    const item = S.state.cart.find(function (x) { return x.id === id; }); const p = S.fn.productById(id); if (!item) return;
    if (Array.isArray(item.serialCodes) && item.serialCodes.length) {
      if (Number(delta) < 0) {
        item.serialCodes.pop();
        item.qty = item.serialCodes.length;
        if (item.qty <= 0) S.state.cart = S.state.cart.filter(x => x.id !== id);
        S.fn.refreshCartPanels({ changedId: id });
      }
      return;
    }
    const next = Math.round((item.qty + Number(delta)) * 1000) / 1000;
    const maxForThisBill = p && p.inventoryTracked ? Math.max(0, Math.round((S.fn.availableForSale(p) - S.fn.qtyReservedInOtherPosBills(p.id)) * 1000) / 1000) : Infinity;
    if (Number(delta) > 0 && p && next > maxForThisBill) return S.fn.toast('Đã chọn hết hàng có thể bán', '', 'error');
    item.qty = next;
    if (Number(item.discountVnd) > 0) item.discountVnd = Math.min(Number(item.discountVnd), S.fn.cartLineGross(item));
    if (item.qty <= 0) S.state.cart = S.state.cart.filter(function (x) { return x.id !== id; });
    S.fn.refreshCartPanels({ changedId: id });
  }


  S.fn.editCartQuantity = function editCartQuantity(id) {
    if (S.state.checkoutPendingPayload) return S.fn.toast('Đang chờ xác nhận đơn', 'Hãy kiểm tra đơn đang chờ trước khi thay đổi giỏ hàng.', 'error');
    const item = S.state.cart.find(function (row) { return row.id === id; });
    const product = S.fn.productById(id);
    if (!item || !product) return;
    const available = S.fn.availableForSale(product);
    const stockLimit = product.inventoryTracked ? `max='${available}'` : '';
    const stockNote = product.inventoryTracked ? `Có thể bán ${S.fn.number(available)} ${S.fn.esc(product.unit)}` : 'Mặt hàng này không theo dõi tồn kho.';
    const form = `<form id='entity-form' data-form='cart-quantity' data-id='${product.id}'><div class='form-field'><label class='input-label'>Số lượng · ${S.fn.esc(product.unit)}</label><input class='input' name='quantity' type='number' min='0.001' ${stockLimit} step='0.001' value='${item.qty}' required/><small class='muted'>${stockNote}</small></div><div class='modal-note'>Số lượng được ghi vào đơn khi bạn hoàn tất thanh toán.</div></form>`;
    S.fn.showModal('Thay đổi số lượng', product.name, form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>Cập nhật</button>`);
  }


  S.fn.saveCartQuantity = function saveCartQuantity(form) {
    const id = form.dataset.id;
    const item = S.state.cart.find(function (row) { return row.id === id; });
    const product = S.fn.productById(id);
    const quantity = Number(new FormData(form).get('quantity'));
    if (!item || !product) return S.fn.closeModal();
    if (!Number.isFinite(quantity) || quantity <= 0 || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 1e-6) return S.fn.toast('Số lượng không hợp lệ', 'Nhập số lượng lớn hơn 0, tối đa 3 chữ số thập phân.', 'error');
    if (product.serialTracked && !Number.isInteger(quantity)) return S.fn.toast('Số lượng không hợp lệ', 'Hàng quản lý theo từng mã riêng chỉ bán số lượng nguyên.', 'error');
    if (quantity > S.fn.availableForSale(product)) return S.fn.toast('Không đủ hàng để bán', `Có thể bán ${S.fn.number(S.fn.availableForSale(product))} ${product.unit}.`, 'error');
    item.qty = quantity;
    if (Number(item.discountVnd) > 0) item.discountVnd = Math.min(Number(item.discountVnd), S.fn.cartLineGross(item));
    S.fn.closeModal();
    if (S.state.page === 'pos') S.fn.refreshCartPanels({ changedId: id, focus: { action: 'cart-qty-edit', id: id } });
    else S.fn.render();
  }


  S.fn.applyLocalSaleStockDelta = function applyLocalSaleStockDelta(items, warehouseId) {
    if (!Array.isArray(items) || !items.length) return;
    const deductedMilli = new Map();
    items.forEach(function (line) {
      const milli = Math.round((Number(line.quantity) || 0) * 1000);
      if (!line.productId || !Number.isSafeInteger(milli) || milli <= 0) return;
      deductedMilli.set(line.productId, (deductedMilli.get(line.productId) || 0) + milli);
    });
    if (!deductedMilli.size) return;
    const updateOne = function (product) {
      if (!product || !product.inventoryTracked) return product;
      const milli = deductedMilli.get(product.id);
      if (!milli) return product;
      const nextMilli = Math.max(0, Math.round((Number(product.stock) || 0) * 1000) - milli);
      return { ...product, stock: nextMilli / 1000 };
    };
    S.state.store.products = S.state.store.products.map(updateOne);
    S.state.posCatalog = S.state.posCatalog.map(updateOne);
    S.state.posProducts = S.state.posProducts.map(updateOne);
    const targetWarehouse = warehouseId || S.state.selectedWarehouseId;
    if (!targetWarehouse || S.state.inventoryWarehouseId === targetWarehouse) {
      S.state.inventoryProducts = S.state.inventoryProducts.map(updateOne);
    }
    for (const pid of deductedMilli.keys()) {
      const known = S.state.posKnownProducts.get(pid);
      if (known) S.state.posKnownProducts.set(pid, updateOne(known));
      const cached = S.state.productCache.get(pid);
      if (cached) S.state.productCache.set(pid, updateOne(cached));
    }
  }


  S.fn.submitSalePayload = async function submitSalePayload(triggerButton) {
    if (S.state.posSubmitting) return;
    if (!S.fn.savePendingSale()) return S.fn.pendingSaveFailed();
    S.state.posSubmitting = true;
    const key = S.state.checkoutIdempotencyKey;
    const payload = S.state.checkoutPendingPayload;
    const generation = S.state.modalGeneration;
    const session = S.state.authSession;
    const storeId = S.state.store.id;
    const sameStore = () => S.state.authSession === session && S.state.store.id === storeId;
    const checkoutOpen = () => !S.dom.modal.hidden && S.state.modalGeneration === generation;
    if (triggerButton) triggerButton.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/sales`, {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: payload,
      });
      if (!sameStore()) return;
      S.fn.applyLocalSaleStockDelta(payload.items, payload.warehouseId);
      if (payload.customerId) S.state.customerListLoaded = false;
      S.state.inventoryWarehouseId = null;
      S.fn.resetPosBillsAfterSale();
      S.state.posFastCashInput = '';
      S.state.posDelivery = { receiverName: '', receiverPhone: '', address: '', carrier: '', collection: 'cod', note: '' };
      S.state.checkoutPromotion = null;
      S.fn.clearPendingSale();
      if (checkoutOpen()) S.fn.closeModal();
      if (document.getElementById('drawer-cart')?.classList.contains('open')) S.fn.setCartDrawerOpen(false);
      S.state.lastCompletedSale = {
        id: result.order.id,
        number: result.order.number,
        total: result.order.totalVnd,
        change: result.order.changeVnd,
        offlineQueued: result.offlineQueued,
        pointsEarned: Number(result.order?.pointsEarned || 0),
        pointsRedeemed: Number(result.order?.pointsRedeemed || 0),
        customerPointsBalance: result.order?.customerPointsBalance ?? null,
      };
      const order = result.order;
      const ptsNote = !result.offlineQueued && Number(order?.pointsEarned || 0) > 0
        ? ` · +${S.fn.number(order.pointsEarned)} điểm${order.customerPhone ? ` (${order.customerPhone})` : ''}`
        : '';
      if (S.state.page === 'pos') {
        S.fn.render();
        await S.fn.loadProductsPage(S.state.posSearchTerm, 0, { preferFresh: true, silentLoading: true });
        if (ptsNote) S.fn.toast('Đã lưu đơn & tích điểm', `${order.number}${ptsNote}`);
      }
      else S.fn.toast(result.offlineQueued ? 'Đã lưu đơn trên máy' : 'Đã lưu đơn hàng', `${order.number}${ptsNote}`);
      if (!result.offlineQueued) {
        const confirmedAmount = result.order?.totalVnd ?? payload.totalVnd;
        if (S.state.posPrefs.voiceAnnounce !== false && Number(confirmedAmount) > 0 && window.SlinkPosHardware && typeof window.SlinkPosHardware.playTingTing === 'function') {
          window.SlinkPosHardware.playTingTing(confirmedAmount).catch(function () {});
        }
        S.fn.emitSyncDomains(['orders', 'stock', 'products', 'cashbook', 'debts', 'customers', 'dashboard', 'reports'], { source: 'sale', orderId: order?.id || '' });
        S.fn.syncAfterMutation(['inventory', 'orders', 'finance', 'cashSession', 'customers', 'dashboard']);
        if (S.state.posPrefs.autoPrint && order?.id) {
          S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/orders/${encodeURIComponent(order.id)}`).then(res => {
            if (res?.order) {
              const idx = S.state.store.orders.findIndex(o => o.id === res.order.id);
              const mapped = S.fn.mapOrder(res.order);
              if (idx >= 0) S.state.store.orders[idx] = mapped; else S.state.store.orders.unshift(mapped);
              const printer = window.SlinkEscPosPrinter;
              const caps = printer?.capabilities?.();
              if (printer && (caps?.btConnected || caps?.connected)) S.fn.handleEscPosAction('escpos-print-order', order.id);
              else S.fn.printOrder(order.id);
            }
          }).catch(() => {});
        }
      }
    } catch (error) {
      if (!sameStore()) return;
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra đơn đang chờ.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        if (error.code === 'cash_session_required') {
          if (triggerButton?.isConnected) triggerButton.disabled = false;
          S.fn.openCashSessionForm('checkout');
          return;
        }
        S.fn.clearPendingSale();
        if (S.state.page === 'pos' && ['insufficient_stock', 'product_unavailable', 'inventory_unavailable'].includes(error.code)) await S.fn.loadProductsPage('', 0);
        if (checkoutOpen()) S.fn.openCheckout();
      }
      S.fn.toast('Chưa hoàn tất được đơn hàng', error.message, 'error');
      if (triggerButton?.isConnected) triggerButton.disabled = false;
    } finally {
      S.state.posSubmitting = false;
    }
  }


  S.fn.createSale = async function createSale(form) {
    const data = new FormData(form);
    const totals = S.fn.cartTotals();
    const checkoutTotal = Number(form.dataset.totalVnd || totals.total);
    const customerId = String(data.get('customerId') || '') || null;
    if (!S.state.checkoutPendingPayload) {
      if (S.fn.cartPriceChanges().length) return S.fn.toast('Giá bán đã đổi', 'Đóng và mở lại thanh toán để kiểm tra giá mới.', 'error');
      const short = S.state.cart.find(item => { const p = S.fn.productById(item.id); return p && item.qty > S.fn.availableForSale(p); });
      if (short) return S.fn.toast('Số hàng có thể bán đã đổi', 'Kiểm tra lại số lượng trong giỏ.', 'error');
      const maxAllowedDisc = S.fn.maxAllowedDiscountVnd(totals.subtotal);
      if (totals.manualDiscountTotal > maxAllowedDisc) {
        return S.fn.toast('Vượt hạn mức giảm giá', `Tài khoản này chỉ được giảm tối đa ${S.fn.number(S.fn.getMaxDiscountPct())}% (${S.fn.money(maxAllowedDisc)}).`, 'error');
      }
      const enteredPromotionCode = String(data.get('promotionCode') || '').trim().toUpperCase();
      if (enteredPromotionCode && (!S.state.checkoutPromotion || S.state.checkoutPromotion.code !== enteredPromotionCode || S.state.checkoutPromotion.customerId !== customerId)) {
        return S.fn.toast('Hãy kiểm tra lại mã', 'Mã khuyến mãi hoặc khách hàng đã thay đổi sau lần kiểm tra.', 'error');
      }
      if (!enteredPromotionCode && Number(form.dataset.promotionDiscountVnd || 0) > 0) {
        return S.fn.toast('Hãy kiểm tra lại mã', 'Mã khuyến mãi đã bị xóa. Hãy bấm Kiểm tra trước khi thanh toán.', 'error');
      }
      const tenderInputs = S.fn.checkoutTenderValues(form);
      const tenders = [];
      const usedMethods = new Set();
      let amountReceivedVnd = 0;
      let nonCashReceived = 0;
      let cashReceived = 0;
      for (const input of tenderInputs) {
        const amountReceived = Number(input.amountText);
        if (!Number.isSafeInteger(amountReceived) || amountReceived < 0) return S.fn.toast('Số tiền không hợp lệ', 'Mỗi khoản thanh toán phải là VND nguyên không âm.', 'error');
        if (usedMethods.has(input.method) && amountReceived > 0) return S.fn.toast('Phương thức bị lặp', 'Mỗi phương thức chỉ được nhập một khoản.', 'error');
        if (amountReceived === 0) continue;
        usedMethods.add(input.method);
        amountReceivedVnd += amountReceived;
        if (!Number.isSafeInteger(amountReceivedVnd)) return S.fn.toast('Tổng tiền vượt giới hạn', 'Hãy chia hoặc kiểm tra lại các khoản thanh toán.', 'error');
        if (input.method === 'cash') cashReceived += amountReceived;
        else nonCashReceived += amountReceived;
        tenders.push({ method: input.method, amountReceivedVnd: amountReceived });
      }
      if (nonCashReceived > checkoutTotal) return S.fn.toast('Khoản không tiền mặt quá lớn', 'Tiền chuyển khoản, QR hoặc thẻ không được vượt tổng đơn.', 'error');
      if (amountReceivedVnd > checkoutTotal && cashReceived === 0) return S.fn.toast('Không thể tính tiền thối', 'Chỉ khoản tiền mặt mới được nhận cao hơn số còn phải thanh toán.', 'error');
      if (amountReceivedVnd < checkoutTotal && !customerId) return S.fn.toast('Chọn khách hàng', 'Cần gắn khách hàng để lưu khoản còn nợ.', 'error');
      S.state.checkoutIdempotencyKey = S.state.checkoutIdempotencyKey || S.fn.newIdempotencyKey();
      const eff = S.fn.posEffectivePayable(totals);
      S.state.checkoutPendingPayload = {
        _slinkOfflineVersion: 1,
        items: S.fn.buildSalePayloadItems(),
        customerId: customerId,
        customerInline: (!customerId && S.state.posCustomerInlineText.trim()) ? S.state.posCustomerInlineText.trim() : undefined,
        sellerId: S.state.posSellerId || S.state.authSession?.user?.id || undefined,
        redeemPoints: Boolean(S.state.posRedeemPointsActive && eff.pointsUsed > 0),
        settlePriorDebt: false,
        prebillEventId: S.state.activePosPrebillId || undefined,
        discountVnd: totals.discount,
        promotionCode: String(data.get('promotionCode') || '').trim().toUpperCase() || undefined,
        promotionDiscountVnd: String(form.dataset.promotionDiscountVnd || '0'),
        method: tenders.length === 1 ? tenders[0].method : (tenderInputs[0]?.method || 'cash'),
        tenders: tenders,
        amountReceivedVnd: amountReceivedVnd,
        note: String(data.get('note') || '').trim(),
        totalVnd: checkoutTotal,
        warehouseId: S.state.selectedWarehouseId || undefined,
      };
    }
    const submitButton = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    return S.fn.submitSalePayload(submitButton);
  }


  S.fn.quickFastPaySale = async function quickFastPaySale(method, button) {
    if (S.state.checkoutPendingPayload) return S.fn.openCheckout();
    if (!S.state.cart.length) return S.fn.toast('Giỏ hàng đang trống', 'Chọn hoặc quét sản phẩm trước khi thu tiền.', 'error');
    if (S.fn.cartPriceChanges().length) return S.fn.openCheckout();
    const short = S.state.cart.find(item => { const p = S.fn.productById(item.id); return !p || item.qty > S.fn.availableForSale(p); });
    if (short) return S.fn.toast('Số hàng có thể bán đã đổi', 'Kiểm tra lại số lượng trong giỏ.', 'error');
    const totals = S.fn.cartTotals();
    const eff = S.fn.posEffectivePayable(totals);
    const collectTotal = eff.grandCollectVnd;
    const maxAllowedDisc = S.fn.maxAllowedDiscountVnd(totals.subtotal);
    if (totals.manualDiscountTotal > maxAllowedDisc) {
      return S.fn.toast('Vượt hạn mức giảm giá', `Tài khoản này chỉ được giảm tối đa ${S.fn.number(S.fn.getMaxDiscountPct())}% (${S.fn.money(maxAllowedDisc)}).`, 'error');
    }
    const safeMethod = method === 'bank_transfer' ? 'bank_transfer' : 'cash';
    let received = collectTotal;
    if (safeMethod === 'cash' && S.state.posFastCashInput !== '') {
      const parsed = Number(S.state.posFastCashInput);
      if (!Number.isSafeInteger(parsed) || parsed < collectTotal) {
        return S.fn.toast('Tiền khách đưa chưa đủ', 'Nhập đúng số tiền khách đưa hoặc bấm Đủ tiền.', 'error');
      }
      received = parsed;
    }
    S.state.checkoutIdempotencyKey = S.fn.newIdempotencyKey();
    S.state.checkoutPendingPayload = {
      _slinkOfflineVersion: 1,
      items: S.fn.buildSalePayloadItems(),
      customerId: S.state.cartCustomerId || null,
      customerInline: (!S.state.cartCustomerId && S.state.posCustomerInlineText.trim()) ? S.state.posCustomerInlineText.trim() : undefined,
      sellerId: S.state.posSellerId || S.state.authSession?.user?.id || undefined,
      redeemPoints: Boolean(S.state.posRedeemPointsActive && eff.pointsUsed > 0),
      settlePriorDebt: Boolean(S.state.posBundlePriorDebtActive && eff.bundledDebtVnd > 0),
      prebillEventId: S.state.activePosPrebillId || undefined,
      discountVnd: totals.discount,
      method: safeMethod,
      tenders: received > 0 ? [{ method: safeMethod, amountReceivedVnd: received }] : [],
      amountReceivedVnd: received,
      note: 'Bán nhanh tại quầy',
      totalVnd: totals.total,
      warehouseId: S.state.selectedWarehouseId || undefined,
    };
    return S.fn.submitSalePayload(button);
  }


  S.fn.openPosVietQrModal = async function openPosVietQrModal() {
    if (!S.state.cart.length) return S.fn.toast('Giỏ hàng đang trống', 'Chọn sản phẩm trước khi tạo mã QR.', 'error');
    if (!S.state.integrationState.data && !S.state.integrationState.loading) {
      try { await S.fn.loadIntegrationStatus(false); } catch {}
    }
    const settings = S.state.integrationState.data?.settings || {};
    const totals = S.fn.cartTotals();
    const eff = S.fn.posEffectivePayable(totals);
    const collectTotal = eff.grandCollectVnd;
    if (!settings.bankBin || !settings.bankAccountNumber || !window.SlinkIntegrationsUI) {
      const canConfig = S.fn.hasPerm('manageSettings');
      S.fn.showModal('Chưa có tài khoản nhận tiền', '', `<div class='empty-state'><strong>Chưa có số tài khoản ngân hàng</strong><span>Nhập Ngân hàng và Số tài khoản trong Cài đặt.</span></div>`, `${canConfig ? `<button class='btn btn-primary' type='button' data-route='settings'>Mở Cài đặt →</button>` : ''}<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button>`);
      return;
    }
    const qrHtml = window.SlinkIntegrationsUI.renderVietQrCard({
      bankBin: settings.bankBin,
      bankAccountNumber: settings.bankAccountNumber,
      bankAccountName: settings.bankAccountName,
      bankName: settings.bankName,
      amountVnd: String(collectTotal),
      note: `${S.state.store.settings.storeName || 'SLINK'} ${collectTotal}`.slice(0, 45),
    });
    const fullscreenBody = `<div class='vietqr-fullscreen-body'><div class='vietqr-fullscreen-amount'>${S.fn.money(collectTotal)}</div>${eff.bundledDebtVnd > 0 ? `<p class='muted' style='text-align:center;margin:4px 0 8px'>Đã gộp đơn mới (${S.fn.money(eff.orderNetVnd)}) + nợ cũ (${S.fn.money(eff.bundledDebtVnd)})</p>` : ''}${qrHtml}<p class='vietqr-fullscreen-note'>Thu ngân kiểm tra tiền đã vào tài khoản ngân hàng, sau đó bấm nút bên dưới để xác nhận thủ công và xuất bill.</p></div>`;
    const fullscreenFooter = `<div class='vietqr-fullscreen-actions'><button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-primary' type='button' data-action='pos-confirm-vietqr'>Đã nhận tiền · Xuất bill (${S.fn.money(collectTotal)})</button></div>`;
    S.fn.showModal('Quét VietQR thanh toán', '', fullscreenBody, fullscreenFooter, true);
    S.dom.modal.classList.add('modal-vietqr-fullscreen');
    S.state.vietqrBrightnessActive = true;
    window.SlinkPosHardware?.setScreenBrightness(1.0);
  }


  S.fn.standardPaySale = async function standardPaySale(button) {
    if (S.state.checkoutPendingPayload) return S.fn.openCheckout();
    if (!S.state.cart.length) return S.fn.toast('Giỏ hàng đang trống', 'Chọn hoặc quét sản phẩm trước khi thanh toán.', 'error');
    if (S.fn.cartPriceChanges().length) return S.fn.openCheckout();
    const short = S.state.cart.find(item => { const p = S.fn.productById(item.id); return !p || item.qty > S.fn.availableForSale(p); });
    if (short) return S.fn.toast('Không đủ hàng để bán', 'Kiểm tra lại số lượng trong giỏ.', 'error');
    if (S.state.posStandardMethod === 'debt') return S.fn.openCheckout();
    const totals = S.fn.cartTotals();
    const eff = S.fn.posEffectivePayable(totals);
    const collectTotal = eff.grandCollectVnd;
    const maxAllowedDisc = S.fn.maxAllowedDiscountVnd(totals.subtotal);
    if (totals.manualDiscountTotal > maxAllowedDisc) {
      return S.fn.toast('Vượt hạn mức giảm giá', `Tài khoản này chỉ được giảm tối đa ${S.fn.number(S.fn.getMaxDiscountPct())}% (${S.fn.money(maxAllowedDisc)}).`, 'error');
    }
    const safeMethod = S.state.posStandardMethod === 'bank_transfer' ? 'bank_transfer' : 'cash';
    let received = collectTotal;
    if (safeMethod === 'cash' && S.state.posFastCashInput !== '') {
      const parsed = Number(S.state.posFastCashInput);
      if (!Number.isSafeInteger(parsed) || parsed < collectTotal) {
        return S.fn.toast('Tiền khách đưa chưa đủ', 'Nhập đúng số tiền khách đưa hoặc bấm Đủ tiền.', 'error');
      }
      received = parsed;
    }
    S.state.checkoutIdempotencyKey = S.fn.newIdempotencyKey();
    S.state.checkoutPendingPayload = {
      _slinkOfflineVersion: 1,
      items: S.fn.buildSalePayloadItems(),
      customerId: S.state.cartCustomerId || null,
      customerInline: (!S.state.cartCustomerId && S.state.posCustomerInlineText.trim()) ? S.state.posCustomerInlineText.trim() : undefined,
      sellerId: S.state.posSellerId || S.state.authSession?.user?.id || undefined,
      redeemPoints: Boolean(S.state.posRedeemPointsActive && eff.pointsUsed > 0),
      settlePriorDebt: Boolean(S.state.posBundlePriorDebtActive && eff.bundledDebtVnd > 0),
      prebillEventId: S.state.activePosPrebillId || undefined,
      discountVnd: totals.discount,
      method: safeMethod,
      tenders: received > 0 ? [{ method: safeMethod, amountReceivedVnd: received }] : [],
      amountReceivedVnd: received,
      note: String(S.state.posStandardNote || '').trim().slice(0, 500),
      totalVnd: totals.total,
      warehouseId: S.state.selectedWarehouseId || undefined,
    };
    return S.fn.submitSalePayload(button);
  }


  S.fn.resolveDeliveryCustomer = async function resolveDeliveryCustomer(recName, recPhone, address) {
    if (S.state.cartCustomerId) return S.state.cartCustomerId;
    const normalizedPhone = recPhone.replace(/\s+/g, '');
    const cached = S.state.store.customers.find(c => c.phone && c.phone.replace(/\s+/g, '') === normalizedPhone);
    if (cached) return cached.id;
    const found = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customers?view=picker&limit=5&q=${encodeURIComponent(recPhone)}`);
    const exact = (found.customers || []).find(c => String(c.phone || '').replace(/\s+/g, '') === normalizedPhone);
    if (exact) {
      const mapped = S.fn.mapPosCustomer(exact);
      S.state.store.customers.unshift(mapped);
      return mapped.id;
    }
    const created = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/customers`, {
      method: 'POST',
      headers: { 'idempotency-key': S.fn.newIdempotencyKey() },
      body: { name: recName, phone: recPhone, shippingAddress: address, customerType: 'retail', openingBalanceVnd: '0' },
    });
    const customer = S.fn.mapCustomer(created.customer);
    S.state.store.customers.unshift(customer);
    return customer.id;
  }


  S.fn.submitDeliverySale = async function submitDeliverySale(button) {
    if (S.state.checkoutPendingPayload) return S.fn.openCheckout();
    if (!S.state.cart.length) return S.fn.toast('Giỏ hàng đang trống', 'Chọn sản phẩm trước khi tạo đơn giao hàng.', 'error');
    if (S.fn.cartPriceChanges().length) return S.fn.openCheckout();
    const short = S.state.cart.find(item => { const p = S.fn.productById(item.id); return !p || item.qty > S.fn.availableForSale(p); });
    if (short) return S.fn.toast('Không đủ hàng để bán', 'Kiểm tra lại số lượng trong giỏ.', 'error');
    const picked = S.fn.customerById(S.state.cartCustomerId);
    const recName = String(S.state.posDelivery.receiverName || picked?.name || '').trim();
    const recPhone = String(S.state.posDelivery.receiverPhone || picked?.phone || '').trim();
    const address = String(S.state.posDelivery.address || '').trim();
    const carrier = String(S.state.posDelivery.carrier || '').trim();
    const extraNote = String(S.state.posDelivery.note || '').trim();
    const collection = S.state.posDelivery.collection || 'cod';
    if (!recName || !address) {
      return S.fn.toast('Thiếu thông tin giao hàng', 'Nhập tên người nhận và địa chỉ giao hàng.', 'error');
    }
    if (collection !== 'prepaid' && !recPhone && !S.state.cartCustomerId) {
      return S.fn.toast('Thiếu số điện thoại', 'Nhập SĐT người nhận hoặc chọn khách hàng để theo dõi thu hộ COD / công nợ.', 'error');
    }
    let customerId = S.state.cartCustomerId || null;
    if (collection !== 'prepaid' && !customerId) {
      if (!navigator.onLine) {
        return S.fn.toast('Cần chọn khách hàng có sẵn', 'Khi mất mạng, chọn khách hàng đã lưu hoặc chọn Đã trả trước cho đơn giao hàng.', 'error');
      }
      try {
        if (button) button.disabled = true;
        if (S.state.offlineState.pending) await S.fn.startOfflineSync();
        customerId = await S.fn.resolveDeliveryCustomer(recName, recPhone, address);
        S.state.cartCustomerId = customerId;
      } catch (error) {
        if (button?.isConnected) button.disabled = false;
        return S.fn.toast('Chưa gắn được khách giao hàng', error.message, 'error');
      }
    }
    const totals = S.fn.cartTotals();
    const maxAllowedDisc = S.fn.maxAllowedDiscountVnd(totals.subtotal);
    if (totals.manualDiscountTotal > maxAllowedDisc) {
      return S.fn.toast('Vượt hạn mức giảm giá', `Tài khoản này chỉ được giảm tối đa ${S.fn.number(S.fn.getMaxDiscountPct())}% (${S.fn.money(maxAllowedDisc)}).`, 'error');
    }
    const prepaid = collection === 'prepaid';
    const noteParts = [
      `[GIAO HÀNG] ${recName}`,
      recPhone || null,
      address,
      carrier ? `ĐV: ${carrier}` : null,
      collection === 'cod' ? 'Thu hộ COD' : collection === 'debt' ? 'Ghi công nợ' : 'Đã trả trước',
      extraNote || null,
    ].filter(Boolean);
    const eff = S.fn.posEffectivePayable(totals);
    S.state.checkoutIdempotencyKey = S.fn.newIdempotencyKey();
    S.state.checkoutPendingPayload = {
      _slinkOfflineVersion: 1,
      items: S.fn.buildSalePayloadItems(),
      customerId,
      customerInline: (!customerId && S.state.posCustomerInlineText.trim()) ? S.state.posCustomerInlineText.trim() : undefined,
      sellerId: S.state.posSellerId || S.state.authSession?.user?.id || undefined,
      redeemPoints: Boolean(S.state.posRedeemPointsActive && eff.pointsUsed > 0),
      discountVnd: totals.discount,
      method: prepaid ? 'bank_transfer' : 'cash',
      tenders: prepaid && totals.total > 0 ? [{ method: 'bank_transfer', amountReceivedVnd: totals.total }] : [],
      amountReceivedVnd: prepaid ? totals.total : 0,
      note: noteParts.join(' · ').slice(0, 500),
      totalVnd: totals.total,
      warehouseId: S.state.selectedWarehouseId || undefined,
    };
    return S.fn.submitSalePayload(button);
  }


  S.fn.findExactBarcodeMatch = function findExactBarcodeMatch(list, rawCode) {
    const clean = String(rawCode || '').trim();
    const lower = clean.toLocaleLowerCase('vi');
    return (list || []).find(function (p) {
      return (p.barcode && String(p.barcode).trim() === clean)
        || (Array.isArray(p.extraBarcodes) && p.extraBarcodes.some(code => String(code || '').trim() === clean))
        || (p.sku && String(p.sku).trim().toLocaleLowerCase('vi') === lower);
    }) || null;
  }


  S.fn.incrementScanQuantity = function incrementScanQuantity(current, step = 1) {
    const add = Number.isFinite(Number(step)) && Number(step) > 0 ? Number(step) : 1;
    const nextQty = Math.round((Number(current || 0) + add) * 1000) / 1000;
    return String(nextQty > 0 ? nextQty : add);
  }


  S.fn.parseBarcodeScanMultiplier = function parseBarcodeScanMultiplier(rawInput) {
    const trimmed = String(rawInput || '').trim();
    const multMatch = /^(\d{1,6}(?:\.\d{1,3})?)\s*[*xX]\s*(.{3,80})$/.exec(trimmed);
    if (multMatch) {
      return { quantityStep: Number(multMatch[1]) || 1, code: multMatch[2].trim() };
    }
    return { quantityStep: 1, code: trimmed };
  }


  S.fn.findProductByBarcodeOrSku = async function findProductByBarcodeOrSku(rawCode, options = {}) {
    const code = String(rawCode || '').trim();
    if (!code) return null;
    const requestStoreId = S.state.store.id;
    const requestSession = S.state.authSession;
    const requestWarehouseId = S.state.selectedWarehouseId;
    const forSale = options.forSale === true;
    let matched = forSale
      ? (S.fn.findExactBarcodeMatch(Array.from(S.state.posKnownProducts.values()), code) || (S.state.posCatalogWarehouseId === requestWarehouseId ? S.fn.findExactBarcodeMatch(S.state.store.products, code) : null))
      : (S.fn.findExactBarcodeMatch(S.state.store.products, code) || S.fn.findExactBarcodeMatch(S.state.inventoryProducts, code) || S.fn.findExactBarcodeMatch(Array.from(S.state.posKnownProducts.values()), code));
    if (!matched && requestStoreId && navigator.onLine) {
      const warehouseQuery = requestWarehouseId ? `&warehouseId=${encodeURIComponent(requestWarehouseId)}` : '';
      const res = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(requestStoreId)}/products?limit=20&q=${encodeURIComponent(code)}${warehouseQuery}`, { preferFresh: true });
      if (S.state.store.id !== requestStoreId || S.state.authSession !== requestSession || S.state.selectedWarehouseId !== requestWarehouseId) return null;
      const mapped = (res.products || []).map(S.fn.mapProduct);
      mapped.forEach(function (item) { S.state.posKnownProducts.set(item.id, item); });
      matched = S.fn.findExactBarcodeMatch(mapped, code);
    }
    if (matched && S.state.store.id === requestStoreId) {
      const latest = S.fn.productById(matched.id);
      if (latest) matched = latest;
      if (!S.state.store.products.some(function (item) { return item.id === matched.id; })) {
        S.state.store.products.push(matched);
      }
    }
    return matched;
  }


  S.fn.handlePosBarcodeSubmit = async function handlePosBarcodeSubmit(rawCode, options = {}) {
    const code = String(rawCode || '').trim();
    if (!code) return false;
    const now = Date.now();
    if (!options.fromCamera && S.state.lastPosBarcodeInput.code === code && now - S.state.lastPosBarcodeInput.at < 350) return false;
    if (!options.fromCamera) S.state.lastPosBarcodeInput = { code, at: now };
    const requestStoreId = S.state.store.id;
    const requestSession = S.state.authSession;
    const requestModalGen = S.state.modalGeneration;
    const modalStillActive = () => !options.keepModalStatus || (!S.dom.modal.hidden && S.state.modalGeneration === requestModalGen);
    const clearPosInputIfUnchanged = () => {
      const input = document.getElementById('pos-search');
      if (input && !options.keepModalStatus && input.value.trim() === code) {
        input.value = '';
        S.fn.searchPosProducts('');
      }
    };
    const reportFail = (title, msg) => {
      if (options.fromCamera) {
        S.fn.playScanBeep('error');
        S.fn.showScanPill(options.surface, msg, true);
      }
      if (options.keepModalStatus) { if (modalStillActive()) S.fn.setScanCameraStatus(msg, true); }
      else S.fn.toast(title, msg, 'error');
    };

    if (navigator.onLine && !S.state.offlineState.pending) {
      let lookup;
      try {
        const qs = new URLSearchParams({ code });
        if (S.state.selectedWarehouseId) qs.set('warehouseId', S.state.selectedWarehouseId);
        lookup = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(requestStoreId)}/serials/lookup?${qs.toString()}`, { preferFresh: true });
      } catch (error) {
        if (S.state.store.id === requestStoreId && S.state.authSession === requestSession) {
          reportFail('Chưa tìm được mã vạch', error.message);
        }
        return false;
      }
      if (S.state.store.id !== requestStoreId || S.state.authSession !== requestSession || !modalStillActive()) return false;
      if (lookup.matchType === 'serial' && lookup.serial) {
        const s = lookup.serial;
        if (s.status !== 'in_stock') {
          clearPosInputIfUnchanged();
          reportFail('Mã đã được bán', `Mã “${s.code}” đã bán${s.orderNumber ? ` (${s.orderNumber})` : ''} — không thể bán lại!`);
          return false;
        }
        if (S.state.selectedWarehouseId && s.warehouseId !== S.state.selectedWarehouseId) {
          clearPosInputIfUnchanged();
          reportFail('Sai kho bán', `Mã “${s.code}” đang ở kho ${s.warehouseName}.`);
          return false;
        }
        if (S.fn.hasSerialInAnyPosBill(s.code)) {
          clearPosInputIfUnchanged();
          reportFail('Mã đã có trong đơn', `Mã “${s.code}” đã được quét vào đơn rồi.`);
          return false;
        }
        if (!lookup.product) {
          reportFail('Sản phẩm không khả dụng', `Sản phẩm của mã “${s.code}” không còn bán.`);
          return false;
        }
        const matched = S.fn.mapProduct(lookup.product);
        if (S.fn.addSerialToCart(matched, s.code)) {
          S.fn.playScanBeep();
          clearPosInputIfUnchanged();
          const itemInCart = S.state.cart.find(i => i.id === matched.id);
          const qtyNow = itemInCart ? itemInCart.qty : 1;
          if (options.fromCamera) S.fn.showScanPill(options.surface, `+1 ${matched.name} (#${s.code})`);
          if (options.keepModalStatus) S.fn.setScanCameraStatus(`✓ ${matched.name} · #${s.code} (×${S.fn.number(qtyNow)})`);
          S.fn.toast('Đã thêm vào đơn', `${matched.name} · mã ${s.code}`);
          return true;
        }
        return false;
      }
      if (lookup.matchType === 'product' && lookup.product) {
        const matched = S.fn.mapProduct(lookup.product);
        if (matched.inventoryTracked && !(S.fn.availableForSale(matched) > 0)) {
          reportFail('Sản phẩm đã hết hàng', `“${matched.name}” đã hết hàng (tồn: 0).`);
          return false;
        }
        if (S.fn.addProductToCart(matched)) {
          S.fn.playScanBeep();
          clearPosInputIfUnchanged();
          const itemInCart = S.state.cart.find(i => i.id === matched.id);
          const qtyNow = itemInCart ? itemInCart.qty : 1;
          if (options.fromCamera) S.fn.showScanPill(options.surface, `+1 ${matched.name} (×${S.fn.number(qtyNow)})`);
          if (options.keepModalStatus) S.fn.setScanCameraStatus(`✓ ${matched.name} (×${S.fn.number(qtyNow)})`);
          S.fn.toast('Đã thêm vào đơn', `${matched.name} · ×${S.fn.number(qtyNow)}`);
          return true;
        }
        if (options.keepModalStatus) {
          S.fn.setScanCameraStatus(S.state.checkoutPendingPayload ? 'Đang có đơn chờ xác nhận.' : `Đã chọn tối đa tồn kho của “${matched.name}”.`, true);
        }
        return false;
      }
      reportFail('Không khớp mã', `Không tìm thấy hàng hóa có mã “${code}”.`);
      return false;
    }

    let matched;
    try {
      matched = await S.fn.findProductByBarcodeOrSku(code, { forSale: true });
    } catch (error) {
      if (S.state.store.id === requestStoreId && S.state.authSession === requestSession) {
        reportFail('Chưa tìm được mã vạch', error.message);
      }
      return false;
    }
    if (S.state.store.id !== requestStoreId || S.state.authSession !== requestSession) return false;
    if (!matched) {
      reportFail('Không khớp mã vạch', `Không tìm thấy sản phẩm có mã “${code}”.`);
      return false;
    }
    if (matched.serialTracked) {
      reportFail('Cần kết nối mạng', 'Hàng quản lý theo từng mã riêng cần có mạng để khóa mã, tránh bán trùng.');
      return false;
    }
    if (matched.inventoryTracked && !(S.fn.availableForSale(matched) > 0)) {
      reportFail('Sản phẩm đã hết hàng', `“${matched.name}” đã hết hàng (tồn: 0).`);
      return false;
    }
    if (S.fn.addProductToCart(matched)) {
      S.fn.playScanBeep();
      const input = document.getElementById('pos-search');
      if (input && !options.keepModalStatus) { input.value = ''; S.fn.searchPosProducts(''); }
      const itemInCart = S.state.cart.find(i => i.id === matched.id);
      const qtyNow = itemInCart ? itemInCart.qty : 1;
      if (options.fromCamera) S.fn.showScanPill(options.surface, `+1 ${matched.name} (×${S.fn.number(qtyNow)})`);
      if (options.keepModalStatus) S.fn.setScanCameraStatus(`✓ ${matched.name} (×${S.fn.number(qtyNow)})`);
      S.fn.toast('Đã thêm vào đơn', `${matched.name} · ×${S.fn.number(qtyNow)}`);
      return true;
    }
    if (options.keepModalStatus) {
      S.fn.setScanCameraStatus(S.state.checkoutPendingPayload ? 'Đang có đơn chờ xác nhận.' : `Đã chọn tối đa tồn kho của “${matched.name}”.`, true);
    }
    return false;
  }


  S.fn.openPosBarcodeScanner = function openPosBarcodeScanner() {
    S.state.posBarcodeScanState.lastCode = '';
    S.state.posBarcodeScanState.lastAt = 0;
    S.state.posBarcodeScanState.busy = false;
    const body = `<form id='entity-form' data-form='pos-scan'>
      <div class='scan-camera-panel' data-scan-surface data-scan-mode='pos-cart' data-scan-target='pos-scan-code'>
        <div class='scan-camera-stage'><div class='scan-camera-prompt' aria-hidden='true'>${S.fn.icon('scan', 28)}<strong>Đưa mã vào khung</strong></div>
          <video id='scan-camera-video' class='scan-camera-video' playsinline muted hidden aria-label='Camera quét mã vạch'></video>
          <div class='scan-viewfinder' aria-hidden='true'><i></i><i></i><i></i><i></i></div>
          <div class='scan-feedback-pill' data-scan-pill hidden></div></div>
        <p id='scan-camera-status' class='scan-camera-status' role='status' aria-live='polite'></p>
        <div class='scan-camera-actions'>
          <button class='btn btn-secondary' type='button' data-action='start-camera-scan'>Mở camera</button>
          <label class='scan-continuous-toggle'><input type='checkbox' id='pos-scan-continuous' ${S.state.posBarcodeScanState.continuous ? 'checked' : ''}/><span>Quét liên tiếp</span></label>
        </div>
        <details class='scan-manual-entry'><summary>Nhập mã thủ công</summary><div class='editor-input-action' style='margin-top:8px'><input id='pos-scan-code' class='input' maxlength='120' autocomplete='off' placeholder='Nhập mã vạch, mã QR, Serial hoặc SKU…'/><button class='btn btn-primary' type='submit'>Thêm</button></div></details>
      </div></form>`;
    S.fn.showModal('Quét mã bán hàng', '', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Xong</button>`);
    const gen = S.state.modalGeneration;
    const form = S.dom.modal.querySelector('[data-form="pos-scan"]');
    const contToggle = form.querySelector('#pos-scan-continuous');
    if (contToggle) {
      contToggle.addEventListener('change', function () { S.state.posBarcodeScanState.continuous = contToggle.checked; });
    }
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      event.stopPropagation();
      const input = form.querySelector('#pos-scan-code');
      const val = input.value;
      input.value = '';
      S.fn.handlePosBarcodeSubmit(val, { keepModalStatus: true }).then((added) => {
        if (S.dom.modal.hidden || S.state.modalGeneration !== gen) return;
        if (added) {
          form.querySelector('[data-form-message]')?.remove();
          if (!S.state.posBarcodeScanState.continuous) S.fn.closeModal();
        }
        if (!S.dom.modal.hidden && input.isConnected) input.focus();
      });
    });
    S.fn.startScanCamera(form.querySelector('[data-action="start-camera-scan"]'));
  }


  S.fn.printProformaBill = async function printProformaBill() {
    if (!S.state.cart.length) return S.fn.toast('Giỏ hàng đang trống', 'Thêm sản phẩm trước khi in tạm tính.', 'error');
    const totals = S.fn.cartTotals();
    const customer = S.fn.customerById(S.state.cartCustomerId);
    if (navigator.onLine && S.state.store.id) {
      S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/pos/prebill-events`, {
        method: 'POST',
        body: {
          billTabLabel: S.state.posBills.find(b => b.id === S.state.activePosBillId)?.label || 'Đơn 1',
          customerName: customer?.name || S.state.posCustomerInlineText.trim() || 'Khách lẻ',
          itemCount: totals.count,
          totalVnd: String(totals.total),
          itemsSnapshot: S.state.cart.map(line => {
            const p = S.fn.productById(line.id);
            return { productId: line.id, name: p?.name || '', qty: line.qty, price: S.fn.cartUnitPrice(line) };
          }),
        },
      }).then(res => {
        if (res?.prebillEvent?.id) S.state.activePosPrebillId = res.prebillEvent.id;
      }).catch(() => {});
    }
    const printer = window.SlinkEscPosPrinter;
    const caps = printer?.capabilities?.();
    if (printer && (caps?.btConnected || caps?.connected)) {
      try {
        await printer.printReceipt({
          storeName: S.state.store.settings.storeName || 'Slink',
          address: S.state.store.settings.address || '',
          phone: S.state.store.settings.phone || '',
          orderNumber: 'PHIEU TAM TINH',
          createdAt: S.fn.humanDate(new Date().toISOString(), true),
          customerName: customer?.name || 'Khach le',
          items: S.state.cart.map(line => {
            const p = S.fn.productById(line.id);
            const price = S.fn.cartUnitPrice(line);
            const gross = S.fn.cartLineGross(line);
            const disc = Math.max(0, Math.min(gross, Math.round(Number(line.discountVnd) || 0)));
            return { name: p?.name || 'Hang hoa', quantity: line.qty, unitPriceVnd: String(price), lineTotalVnd: String(gross - disc) };
          }),
          subtotalVnd: String(totals.subtotal),
          discountVnd: String(totals.manualDiscountTotal),
          totalVnd: String(totals.total),
          paidVnd: '0',
          footer: 'Phieu tam tinh - Chua thanh toan',
        });
        S.fn.toast('Đã in phiếu tạm tính');
        return;
      } catch (_) { /* Fallback to HTML print dialog */ }
    }
    const paperMaxW = S.state.posPrefs.paperWidth === '58mm' ? '54mm' : S.state.posPrefs.paperWidth === 'a4' ? '190mm' : '76mm';
    const itemsHtml = S.state.cart.map(line => {
      const p = S.fn.productById(line.id);
      const price = S.fn.cartUnitPrice(line);
      const gross = S.fn.cartLineGross(line);
      const disc = Math.max(0, Math.min(gross, Math.round(Number(line.discountVnd) || 0)));
      return `<div class='item-line'><div class='item-copy'><strong>${S.fn.esc(p?.name || 'Sản phẩm')}</strong><small>${S.fn.number(line.qty)} ${S.fn.esc(p?.unit || '')} × ${S.fn.money(price)}${disc > 0 ? ` (−${S.fn.money(disc)})` : ''}</small></div><strong>${S.fn.money(gross - disc)}</strong></div>`;
    }).join('');
    const html = `<html lang='vi'><head><meta charset='utf-8'><title>Phiếu tạm tính</title><style>
      @page{size:auto;margin:6mm}*{box-sizing:border-box}body{font:13px Arial,sans-serif;width:100%;max-width:${paperMaxW};margin:0 auto;padding:5mm 3mm;color:#222}h1{font-size:17px;margin:0 0 4px}p{font-size:11px;margin:3px 0;color:#555}.center{text-align:center}.rule{border:0;border-top:1px dashed #999;margin:8px 0}.item-line,.summary-line{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px dashed #ddd;font-size:12px}.item-copy{display:grid;gap:2px}.grand-total{font-size:15px;font-weight:700;border-bottom:0;padding-top:8px}
    </style></head><body><header class='center'><h1>${S.fn.esc(S.state.store.settings.storeName || 'Slink')}</h1>${S.state.store.settings.phone ? `<p>${S.fn.esc(S.state.store.settings.phone)}</p>` : ''}<hr class='rule'><strong>PHIẾU TẠM TÍNH</strong><p>${S.fn.humanDate(new Date().toISOString(), true)}</p><p>Khách: ${S.fn.esc(customer?.name || 'Khách lẻ')}</p></header><hr class='rule'><main>${itemsHtml}<div class='summary-line'><span>Tạm tính</span><strong>${S.fn.money(totals.subtotal)}</strong></div>${totals.manualDiscountTotal ? `<div class='summary-line'><span>Giảm giá</span><strong>−${S.fn.money(totals.manualDiscountTotal)}</strong></div>` : ''}<div class='summary-line grand-total'><span>Cần thanh toán</span><strong>${S.fn.money(totals.total)}</strong></div></main><footer class='center' style='margin-top:14px'><p>Phiếu tạm tính · Chưa ghi nhận thanh toán</p></footer></body></html>`;
    await S.fn.printHtmlDocument(html, 'Phieu tam tinh');
  }

  S.fn.renderAiQuickOrderBar = function renderAiQuickOrderBar() {
    const val = S.state.posAiDraftText || '';
    const busy = Boolean(S.state.posAiBusy);
    const listening = Boolean(S.state.posAiListening);
    const statusText = S.state.posAiStatus || '';
    const statusErr = Boolean(S.state.posAiStatusError);
    return `<div class='pos-ai-bar' role='region' aria-label='Lên đơn nhanh bằng giọng nói hoặc AI'>
      <div class='pos-ai-input-wrap'>
        <button type='button' class='btn btn-secondary pos-ai-mic-btn ${listening ? 'is-listening' : ''}' data-action='pos-ai-voice' ${busy ? 'disabled' : ''} title='Nói câu lệnh lên đơn (tiếng Việt)'>${listening ? 'Đang nghe…' : '🎤 Nói lên đơn AI'}</button>
        <input class='input' id='pos-ai-input' type='search' maxlength='500' autocomplete='off' value='${S.fn.esc(val)}' placeholder='VD: "Bán 2 ly trà sữa cho chị Hoa ghi nợ"' aria-label='Câu lệnh lên đơn AI'/>
        <button type='button' class='btn btn-primary' data-action='pos-ai-submit' ${busy ? 'disabled' : ''}>${busy ? 'Đang xử lý…' : 'Lên đơn'}</button>
      </div>
      <div id='pos-ai-status' class='pos-ai-status ${statusErr ? 'is-error' : ''}' role='status' ${statusText ? '' : 'hidden'}>${S.fn.esc(statusText)}</div>
    </div>`;
  }

  S.fn.setPosAiStatus = function setPosAiStatus(text, isError) {
    S.state.posAiStatus = text || '';
    S.state.posAiStatusError = Boolean(isError);
    const el = document.getElementById('pos-ai-status');
    if (!el) return;
    el.textContent = S.state.posAiStatus;
    el.classList.toggle('is-error', S.state.posAiStatusError);
    el.hidden = !S.state.posAiStatus;
  }

  S.fn.startPosAiVoice = async function startPosAiVoice(button) {
    if (S.state.posAiBusy) return;
    if (window.SlinkAndroid && typeof S.fn.nativeAction === 'function') {
      S.state.posAiListening = true;
      if (button) { button.classList.add('is-listening'); button.textContent = 'Đang nghe…'; }
      S.fn.setPosAiStatus('Hãy nói đơn hàng (ví dụ: 2 cà phê sữa đá cho anh Nam)…', false);
      try {
        const res = await S.fn.nativeAction({ type: 'speech', action: 'recognize' });
        S.state.posAiListening = false;
        if (button && button.isConnected) { button.classList.remove('is-listening'); button.textContent = '🎤 Nói lên đơn AI'; }
        const spoken = String(res?.transcript || '').trim();
        if (spoken) {
          const input = document.getElementById('pos-ai-input');
          if (input) input.value = spoken;
          S.state.posAiDraftText = spoken;
          await S.fn.submitPosAiCommand(spoken);
        } else {
          S.fn.setPosAiStatus('Chưa nhận được giọng nói. Bạn có thể gõ câu lệnh và bấm Lên đơn.', true);
        }
      } catch (error) {
        S.state.posAiListening = false;
        if (button && button.isConnected) { button.classList.remove('is-listening'); button.textContent = '🎤 Nói lên đơn AI'; }
        S.fn.setPosAiStatus(error?.message || 'Không mở được micro thiết bị. Hãy gõ câu lệnh vào ô bên cạnh.', true);
      }
      return;
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      S.fn.setPosAiStatus('Trình duyệt chưa hỗ trợ thu âm trực tiếp — hãy gõ câu lệnh vào ô và bấm Lên đơn.', true);
      document.getElementById('pos-ai-input')?.focus();
      return;
    }
    if (S.state.posAiListening && S.state.posAiRec) {
      try { S.state.posAiRec.stop(); } catch (_) { /* ignore */ }
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'vi-VN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    S.state.posAiRec = rec;
    S.state.posAiListening = true;
    if (button) { button.classList.add('is-listening'); button.textContent = 'Đang nghe…'; }
    S.fn.setPosAiStatus('Đang nghe tiếng Việt… hãy nói tên món, số lượng và tên khách nếu có.', false);
    rec.onresult = function (event) {
      const spoken = String(event.results?.[0]?.[0]?.transcript || '').trim();
      if (spoken) {
        const input = document.getElementById('pos-ai-input');
        if (input) input.value = spoken;
        S.state.posAiDraftText = spoken;
        S.fn.submitPosAiCommand(spoken);
      }
    };
    rec.onerror = function (event) {
      S.fn.setPosAiStatus(`Không thu được giọng nói (${event.error || 'mic'}). Hãy gõ câu lệnh trực tiếp.`, true);
    };
    rec.onend = function () {
      S.state.posAiListening = false;
      S.state.posAiRec = null;
      const btn = document.querySelector('[data-action="pos-ai-voice"]');
      if (btn) { btn.classList.remove('is-listening'); btn.textContent = '🎤 Nói lên đơn AI'; }
    };
    try { rec.start(); } catch (error) {
      S.state.posAiListening = false;
      if (button) { button.classList.remove('is-listening'); button.textContent = '🎤 Nói lên đơn AI'; }
      S.fn.setPosAiStatus(error.message || 'Không khởi động được micro.', true);
    }
  }

  S.fn.applyAiOrderResult = function applyAiOrderResult(parsed) {
    if (S.state.checkoutPendingPayload) {
      S.fn.toast('Đang có đơn chờ xác nhận', 'Hãy hoàn tất hoặc xóa đơn chờ trước khi thêm món bằng AI.', 'error');
      return;
    }
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const added = [];
    const skipped = [];
    items.forEach(function (entry) {
      const product = S.fn.productById(entry.productId);
      const reqQty = Math.round(Number(entry.quantity || 1) * 1000) / 1000;
      if (!product || !(reqQty > 0)) {
        skipped.push(entry.name || 'Sản phẩm không rõ');
        return;
      }
      if (product.serialTracked) {
        skipped.push(`${product.name} (cần quét Serial/IMEI)`);
        return;
      }
      const inOtherBills = product.inventoryTracked ? S.fn.qtyReservedInOtherPosBills(product.id) : 0;
      const current = S.state.cart.find(function (line) { return line.id === product.id; });
      const remaining = Math.round((S.fn.availableForSale(product) - inOtherBills - (current ? current.qty : 0)) * 1000) / 1000;
      const take = Math.min(reqQty, Math.max(0, remaining));
      if (!(take > 0)) {
        skipped.push(`${product.name} (hết tồn bán)`);
        return;
      }
      if (current) current.qty = Math.round((current.qty + take) * 1000) / 1000;
      else S.state.cart.push({ id: product.id, qty: take, unitPriceVnd: product.price });
      added.push(`${product.name} × ${take}`);
    });
    if (parsed?.customerId) {
      const cust = S.fn.customerById(parsed.customerId);
      if (cust) {
        S.state.cartCustomerId = cust.id;
        S.state.posCustomerInlineText = cust.phone || cust.name;
        S.fn.loadPosCustomerAssistant({ customerId: cust.id });
      }
    } else if (parsed?.customerPhone) {
      S.state.cartCustomerId = '';
      S.state.posCustomerInlineText = String(parsed.customerPhone).slice(0, 40);
      S.fn.loadPosCustomerAssistant({ q: S.state.posCustomerInlineText });
    } else if (parsed?.customerName) {
      S.state.cartCustomerId = '';
      S.state.posCustomerInlineText = String(parsed.customerName).slice(0, 140);
    }
    if (parsed?.redeemPoints) {
      S.state.posRedeemPointsActive = true;
    }
    if ((Number(parsed?.discountVnd || 0) > 0 || Number(parsed?.discountPct || 0) > 0) && S.fn.getMaxDiscountPct() > 0) {
      const totalsNow = S.fn.cartTotals();
      const sub = totalsNow.subtotal;
      const cap = Math.max(0, S.fn.maxAllowedDiscountVnd(sub) - totalsNow.lineDiscount);
      const rawDisc = Number(parsed?.discountPct || 0) > 0
        ? Math.round(sub * Math.min(100, Number(parsed.discountPct)) / 100)
        : Math.round(Number(parsed.discountVnd || 0));
      if (rawDisc > 0 && cap > 0) {
        S.state.cart.discount = Math.min(rawDisc, cap);
      }
    }
    if (parsed?.deliveryAddress) {
      S.state.posMode = 'delivery';
      S.state.posDelivery.address = String(parsed.deliveryAddress).slice(0, 240);
    } else if (parsed?.paymentMethod === 'debt' || parsed?.isDebt) {
      if (!S.state.posPrefs?.requireFullPayment) {
        S.state.posMode = 'standard';
        S.state.posStandardMethod = 'debt';
      }
    } else if (parsed?.paymentMethod === 'bank_transfer') {
      if (S.state.posMode === 'standard') S.state.posStandardMethod = 'bank_transfer';
    } else if (parsed?.paymentMethod === 'cash') {
      if (S.state.posMode === 'standard') S.state.posStandardMethod = 'cash';
    }
    if (parsed?.note) {
      S.state.posStandardNote = String(parsed.note).slice(0, 240);
    }
    S.fn.refreshCartPanels();
    const unmatched = Array.isArray(parsed?.unmatched) ? parsed.unmatched : [];
    const notes = [];
    if (added.length) notes.push(`Đã thêm: ${added.join(', ')}`);
    if (parsed?.customerName || parsed?.customerPhone) notes.push(`Khách: ${parsed.customerName || parsed.customerPhone}`);
    if (parsed?.redeemPoints) notes.push('Dùng điểm tích lũy');
    if (S.state.cart.discount > 0 && (Number(parsed?.discountVnd || 0) > 0 || Number(parsed?.discountPct || 0) > 0)) {
      notes.push(`Giảm: ${S.fn.money(S.state.cart.discount)}`);
    }
    if (parsed?.deliveryAddress) notes.push(`Giao: ${parsed.deliveryAddress}`);
    else if (parsed?.isDebt && !S.state.posPrefs?.requireFullPayment) notes.push('Chế độ: Ghi nợ');
    else if (parsed?.paymentMethod === 'bank_transfer') notes.push('Chuyển khoản');
    if (skipped.length || unmatched.length) {
      const missing = skipped.concat(unmatched.map(function (u) { return u.name || 'món chưa khớp'; }));
      notes.push(`Chưa khớp: ${missing.join(', ')}`);
    }
    const speedTag = parsed?.source === 'local_fast'
      ? `AI tức thì (${Math.max(1, Number(parsed?.latencyMs || 1))}ms)`
      : (parsed?.latencyMs ? `Gemini Turbo (${Number(parsed.latencyMs)}ms)` : 'AI');
    const statusLine = notes.length ? `[${speedTag}] ${notes.join(' · ')}. Kiểm tra giỏ trước khi bấm Thu.` : 'Chưa tìm thấy sản phẩm khớp danh mục cửa hàng.';
    S.fn.setPosAiStatus(statusLine, !added.length);
    if (added.length) S.fn.toast(`${speedTag} đã điền giỏ`, added.join(', '));
  }

  S.fn.submitPosAiCommand = async function submitPosAiCommand(rawText, triggerBtn) {
    const transcript = String(rawText || '').trim();
    if (!transcript) {
      S.fn.setPosAiStatus('Nhập hoặc nói câu lệnh lên đơn trước (VD: "2 trà sữa cho chị Hoa ghi nợ").', true);
      return;
    }
    if (!S.state.store?.id || S.state.posAiBusy) return;
    S.state.posAiDraftText = transcript;
    S.state.posAiBusy = true;
    if (triggerBtn) triggerBtn.disabled = true;
    S.fn.setPosAiStatus('Gemini AI đang phân tích câu lệnh…', false);
    try {
      const parsed = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/ai/parse-order`, {
        method: 'POST',
        body: { transcript },
      });
      S.fn.applyAiOrderResult(parsed);
    } catch (error) {
      S.fn.setPosAiStatus(error.message || 'Chưa phân tích được câu lệnh AI.', true);
      S.fn.toast('Lên đơn AI chưa thành công', error.message || 'Thử diễn đạt ngắn gọn hơn.', 'error');
    } finally {
      S.state.posAiBusy = false;
      const btn = triggerBtn || document.querySelector('[data-action="pos-ai-submit"]');
      if (btn && btn.isConnected) btn.disabled = false;
    }
  }

})(window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {}, charts: {} });
