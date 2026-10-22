(function () {
  'use strict';

  const root = document.getElementById('view');
  const authRoot = document.getElementById('auth-screen');
  const appShell = document.querySelector('.app-shell');
  const modal = document.getElementById('modal');
  const backdrop = document.getElementById('modal-backdrop');
  const toastStack = document.getElementById('toast-stack');
  const pendingCompatibilityWarning = document.getElementById('pending-compatibility-warning');
  const navItems = [
    { id: 'dashboard', label: 'Tổng quan', icon: 'home' },
    { id: 'pos', label: 'Bán hàng', icon: 'cart', accent: true },
    { id: 'products', label: 'Sản phẩm', icon: 'box' },
    { id: 'orders', label: 'Đơn hàng', icon: 'receipt' },
    { id: 'customers', label: 'Khách hàng', icon: 'users' },
    { id: 'inventory', label: 'Kho hàng', icon: 'layers' },
    { id: 'finance', label: 'Thu chi & công nợ', icon: 'wallet' },
    { id: 'reports', label: 'Báo cáo', icon: 'chart' },
    { id: 'settings', label: 'Cài đặt', icon: 'settings' },
    { id: 'channels', label: 'Kênh bán', icon: 'shop' },
    { id: 'staff', label: 'Nhân viên', icon: 'users' }
  ];
  const iconPaths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/><path d="M9 21v-6h6v6"/>',
    cart: '<path d="M3 4h2l2.2 11.3a2 2 0 0 0 2 1.7h8.5a2 2 0 0 0 2-1.6L21 9H7"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
    box: '<path d="m12 3 9 5-9 5-9-5z"/><path d="M3 8v9l9 5 9-5V8M12 13v9"/>',
    receipt: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2z"/><path d="M8 8h8M8 12h8M8 16h4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.2a4 4 0 0 1 0 7.6"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    wallet: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M16 14h2"/><path d="M7 5V3h11"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 6-7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8L6.9 12l1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 1.9z"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.4"/><path d="m16 16 4.5 4.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    close: '<path d="m18 6-12 12M6 6l12 12"/>',
    download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 17v3h14v-3"/>',
    scan: '<path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M4 12h1m3 0h1m3 0h1m3 0h1m3 0h1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    tag: '<path d="M20 13 11 22l-9-9V2h11z"/><circle cx="7" cy="7" r="1"/>',
    alert: '<path d="m10.3 4.3-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-2.7l-8-14a2 2 0 0 0-3.4 0z"/><path d="M12 9v4m0 4h.01"/>',
    spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z"/>',
    edit: '<path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15z"/>',
    trash: '<path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/>',
    more: '<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    receiptSmall: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6m-6 4h6m-6 4h3"/>',
    gift: '<path d="M20 12v9H4v-9m-1-5h18v5H3zM12 7v14"/><path d="M12 7H7.5a2.5 2.5 0 1 1 2.4-3.2L12 7zm0 0h4.5a2.5 2.5 0 1 0-2.4-3.2L12 7z"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18m-14 5h3"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    truck: '<path d="M3 5h12v12H3zM15 9h4l3 4v4h-7z"/><circle cx="7.5" cy="18" r="1.8"/><circle cx="18.5" cy="18" r="1.8"/>',
    shop: '<path d="M4 10v10h16V10M3 10l2-6h14l2 6"/><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-6h6v6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.5 1.5c-1.1 1.1-2 1.3-2 3m0 3h.01"/>'
  };

  let page = 'products';
  let store = emptyStore();
  let authSession = null;
  let authMode = 'login';
  let invitationToken = '';
  let invitationInfo = null;
  let staffState = { members: [], invitations: [], warehouses: [], loading: false, error: '' };
  let channelState = { profiles: [], mappings: [], total: 0, nextOffset: null, offset: 0, query: '', state: 'active', view: 'mappings', orders: [], orderTotal: 0, orderOffset: 0, orderNextOffset: null, orderStatus: '', orderQuery: '', orderLoading: false, orderError: '', orderRequestNumber: 0, loading: false, error: '', requestNumber: 0 };
  let channelProductOptions = [];
  let channelProductRequestNumber = 0;
  let channelProductSearchTimer = null;
  let auditState = { events: [], total: 0, nextOffset: null, offset: 0, limit: 50, loading: false, error: '', requestNumber: 0, filters: { from: '', to: '', q: '' } };
  let accountSecurityState = { sessions: [], events: [], loading: false, error: '', requestNumber: 0 };
  let productTotal = 0;
  let productOffset = 0;
  let productNextOffset = null;
  let productLoading = false;
  let productError = '';
  let productRequestNumber = 0;
  let productPriceHistoryRequestNumber = 0;
  let productPriceHistoryState = { productId: '', currentPriceVnd: null, history: [], nextCursor: null, loading: false, error: '', historyStartsAtMigrationBaseline: false };
  let productSearchTimer = null;
  let purchaseProductSearchTimer = null;
  let purchaseProductRequestNumber = 0;
  let inventoryTotal = 0;
  let inventoryOffset = 0;
  let inventoryNextOffset = null;
  let inventoryRequestNumber = 0;
  let inventoryLoading = false;
  let inventoryError = '';
  let inventorySummary = { total: 0, low: 0, out: 0, stockValueVnd: 0 };
  let warehouses = [];
  let selectedWarehouseId = '';
  let warehouseTransfers = [];
  let warehouseLoading = false;
  let warehouseError = '';
  let financeLoading = false;
  let financeError = '';
  let financeMovementTotal = 0;
  let purchaseHistory = [];
  let purchaseOrders = [];
  let financeSummary = { todayInVnd: '0', todayOutVnd: '0', customerDebtVnd: '0', customerDebtCount: 0, supplierPayableVnd: '0' };
  let cashRegisterState = { session: null, lastClosed: null, recentClosed: [], canOperate: false };
  let cashRegisterError = '';
  let financeTopCustomers = [];
  let analyticsData = null;
  let analyticsLoading = false;
  let analyticsError = '';
  let analyticsRequestNumber = 0;
  let customerTotal = 0;
  let customerOffset = 0;
  let customerNextOffset = null;
  let customerRequestNumber = 0;
  let customerDetailRequestNumber = 0;
  let customerTagFilter = '';
  let customerSegmentFilter = '';
  let customerMinSpentVnd = '';
  let customerSavedSegments = [];
  let customerSavedSegmentsStoreId = '';
  let selectedCustomerSavedSegmentId = '';
  let customerSearchTimer = null;
  let modalGeneration = 0;
  let modalReturnFocus = null;
  let pickerCustomerRequestNumber = 0;
  let pickerCustomerSearchTimer = null;
  let orderTotal = 0;
  let orderOffset = 0;
  let orderNextOffset = null;
  let orderRequestNumber = 0;
  let cart = [];
  const productCache = new Map();
  const customerCache = new Map();
  const orderNoteHistoryCache = new Map();
  const orderNoteHistoryCursor = new Map();
  const orderNoteHistoryLoading = new Set();
  let posProducts = [];
  let posSearchTerm = '';
  let posSearchRequestNumber = 0;
  let posSearchTimer = null;
  let cartCustomerId = '';
  let checkoutIdempotencyKey = '';
  let checkoutPendingPayload = null;
  let checkoutPromotion = null;
  let returnPending = null;
  let productImportReadNumber = 0;
  let productImportReading = false;
  let productImportRows = [];
  let productImportSourceRows = [];
  let productImportErrors = [];
  let productImportPending = false;
  let productImportVerifiedWarehouseId = '';
  let productImportWarehouseName = '';
  let customerImportReadNumber = 0;
  let customerImportReading = false;
  let customerImportRows = [];
  let customerImportErrors = [];
  let customerImportConflict = '';
  let customerImportPreviewValid = false;
  let customerImportBalanceTotalVnd = '0';
  let productBulkUpdateReadNumber = 0;
  let productBulkUpdateReading = false;
  let productBulkUpdateRows = [];
  let productBulkUpdateErrors = [];
  let stockBulkCountReadNumber = 0;
  let stockBulkCountReading = false;
  let stockBulkCountRows = [];
  let stockBulkCountErrors = [];
  let scanCameraGeneration = 0;
  let scanCameraStream = null;
  let scanCameraDetector = null;
  let scanCameraTimer = 0;
  let scanCameraRunning = false;
  let scanCameraStarting = false;
  let pendingCompatibilityStoreId = '';
  let pendingCompatibilitySaveBlocked = false;
  let categoryFilter = 'Tất cả';
  let searchTerms = { products: '', orders: '', customers: '', inventory: '' };
  let orderFilter = 'Tất cả';
  let chartRange = '7 ngày';

  function emptyStore() {
    return {
      settings: { storeName: 'Slink', ownerName: '', phone: '', address: '', receiptFooter: '', version: 1 },
      products: [], customers: [], orders: [], cashbook: [], movements: [], suppliers: [], sequence: 1001,
    };
  }

  function csrfCookie() {
    const match = document.cookie.split(';').map(function (part) { return part.trim(); }).find(function (part) { return part.startsWith('slink_csrf='); });
    return match ? decodeURIComponent(match.slice('slink_csrf='.length)) : '';
  }

  function newIdempotencyKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      try {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return 'slink-' + Array.from(bytes, function (value) { return value.toString(16).padStart(2, '0'); }).join('');
      } catch (error) { /* Use the compatibility fallback when secure randomness is unavailable. */ }
    }
    return 'slink-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  function pendingOutboxKey(kind, entityId) {
    const userId = authSession && authSession.user && authSession.user.id;
    if (!userId || !store.id) return '';
    return ['slink-pending-v2', encodeURIComponent(userId), encodeURIComponent(store.id), kind, encodeURIComponent(entityId || '_')].join(':');
  }

  function unscopedLegacyPendingKeys(storeId) {
    const keys = [];
    try {
      for (let index = 0; index < window.sessionStorage.length; index += 1) {
        const key = window.sessionStorage.key(index);
        if (!key || !key.startsWith('slink-pending-')) continue;
        try {
          const value = JSON.parse(window.sessionStorage.getItem(key) || 'null');
          if (value && value.storeId === storeId && !value.userId) keys.push(key);
        } catch (error) { /* Ignore unreadable legacy records; never submit them. */ }
      }
    } catch (error) { /* Session storage may be unavailable in a restricted browser. */ }
    return keys;
  }

  function updatePendingCompatibilityWarning(storeId) {
    pendingCompatibilityStoreId = storeId || '';
    if (!pendingCompatibilityWarning) return;
    pendingCompatibilityWarning.hidden = !storeId || unscopedLegacyPendingKeys(storeId).length === 0;
  }

  function clearReviewedLegacyPending() {
    const keys = unscopedLegacyPendingKeys(pendingCompatibilityStoreId);
    if (!keys.length) {
      updatePendingCompatibilityWarning(pendingCompatibilityStoreId);
      return;
    }
    const confirmed = window.confirm('Bạn đã đối soát các đơn hàng, khoản thu chi và tồn kho đang chờ trên máy chủ chưa? Slink chỉ xóa các bản lưu cũ trên thiết bị; dữ liệu trên máy chủ không thay đổi.');
    if (!confirmed) return;
    try { keys.forEach(function (key) { window.sessionStorage.removeItem(key); }); } catch (error) { /* Keep the warning visible when cleanup cannot be confirmed. */ }
    updatePendingCompatibilityWarning(pendingCompatibilityStoreId);
    if (!unscopedLegacyPendingKeys(pendingCompatibilityStoreId).length) toast('Đã xóa bản lưu cũ', 'Chỉ bản chờ trên thiết bị được xóa; dữ liệu cửa hàng trên máy chủ không thay đổi.');
  }

  function readPendingRecord(kind, entityId, legacyKey, isValid) {
    const key = pendingOutboxKey(kind, entityId);
    if (!key) return null;
    try {
      const value = JSON.parse(window.localStorage.getItem(key) || 'null');
      if (value && value.userId === authSession.user.id && value.storeId === store.id && isValid(value)) return value;
    } catch (error) { /* Treat an unreadable record as unavailable; never submit a partial payload. */ }
    try {
      const legacy = JSON.parse(window.sessionStorage.getItem(legacyKey) || 'null');
      if (legacy && legacy.userId === authSession.user.id && legacy.storeId === store.id && typeof legacy.key === 'string' && isValid(legacy)) return legacy;
    } catch (error) { /* Unscoped or unreadable legacy records must never be submitted. */ }
    return null;
  }

  function savePendingRecord(kind, entityId, value, legacyKey) {
    const key = pendingOutboxKey(kind, entityId);
    if (!key || !value) return false;
    try {
      const legacy = JSON.parse(window.sessionStorage.getItem(legacyKey) || 'null');
      if (legacy && legacy.storeId === store.id && !legacy.userId) {
        pendingCompatibilitySaveBlocked = true;
        updatePendingCompatibilityWarning(store.id);
        return false;
      }
    } catch (error) { /* Unreadable old records cannot be submitted or overwrite a new request. */ }
    try {
      const record = Object.assign({}, value, {
        userId: authSession.user.id,
        storeId: store.id,
        outboxVersion: 2,
        savedAt: new Date().toISOString(),
      });
      window.localStorage.setItem(key, JSON.stringify(record));
      const saved = JSON.parse(window.localStorage.getItem(key) || 'null');
      if (!saved || saved.userId !== authSession.user.id || saved.storeId !== store.id || saved.key !== value.key) return false;
      try { window.sessionStorage.removeItem(legacyKey); } catch (error) { /* Persistent copy is already saved. */ }
      return true;
    } catch (error) { return false; }
  }

  function removePendingRecord(kind, entityId, legacyKey) {
    const key = pendingOutboxKey(kind, entityId);
    try { if (key) window.localStorage.removeItem(key); } catch (error) { /* Keep UI recovery available if storage is unavailable. */ }
    try { window.sessionStorage.removeItem(legacyKey); } catch (error) { /* Older session storage may be unavailable. */ }
  }

  function pendingSaveFailed() {
    if (pendingCompatibilitySaveBlocked) {
      pendingCompatibilitySaveBlocked = false;
      toast('Cần đối soát giao dịch cũ', 'Yêu cầu mới chưa được gửi. Hãy kiểm tra dữ liệu trên máy chủ rồi xác nhận đã đối soát bản lưu cũ.', 'error');
      return false;
    }
    toast('Chưa gửi thao tác', 'Không thể lưu mã khôi phục trên thiết bị. Hãy kiểm tra quyền lưu dữ liệu hoặc dung lượng trình duyệt rồi thử lại; yêu cầu chưa được gửi.', 'error');
    return false;
  }

  function loadPendingSale() {
    return readPendingRecord('sale', '', 'slink-pending-sale-v1', function (value) {
      return typeof value.key === 'string' && value.payload && Array.isArray(value.payload.items);
    });
  }
  function savePendingSale() {
    if (!checkoutPendingPayload || !checkoutIdempotencyKey) return false;
    return savePendingRecord('sale', '', { key: checkoutIdempotencyKey, payload: checkoutPendingPayload }, 'slink-pending-sale-v1');
  }
  function clearPendingSale() {
    checkoutIdempotencyKey = '';
    checkoutPendingPayload = null;
    removePendingRecord('sale', '', 'slink-pending-sale-v1');
  }

  function loadPendingReturn(orderId) {
    return readPendingRecord('return', orderId, 'slink-pending-return-v1:' + orderId, function (value) {
      return value.orderId === orderId && typeof value.key === 'string' && value.payload;
    });
  }
  function savePendingReturn() {
    if (!returnPending) return false;
    return savePendingRecord('return', returnPending.orderId, returnPending, 'slink-pending-return-v1:' + returnPending.orderId);
  }
  function clearPendingReturn(orderId) {
    returnPending = null;
    removePendingRecord('return', orderId, 'slink-pending-return-v1:' + orderId);
  }

  function customerTagPendingKey(customerId) { return 'slink-pending-customer-tag-v1:' + customerId; }
  function loadPendingCustomerTag(customerId) {
    return readPendingRecord('customer-tag', customerId, customerTagPendingKey(customerId), function (value) {
      return value.customerId === customerId && typeof value.key === 'string' && value.payload
        && ['add', 'remove'].includes(value.payload.operation) && typeof value.payload.tag === 'string';
    });
  }
  function savePendingCustomerTag(value) {
    return savePendingRecord('customer-tag', value.customerId, value, customerTagPendingKey(value.customerId));
  }
  function clearPendingCustomerTag(customerId) {
    removePendingRecord('customer-tag', customerId, customerTagPendingKey(customerId));
  }

  function loadPendingStock(productId) {
    return readPendingRecord('stock', productId, 'slink-pending-stock-v1:' + store.id + ':' + productId, function (value) {
      return value.productId === productId && typeof value.key === 'string' && value.payload;
    });
  }
  function savePendingStock(value) {
    return savePendingRecord('stock', value.productId, value, 'slink-pending-stock-v1:' + value.storeId + ':' + value.productId);
  }
  function clearPendingStock(productId) {
    removePendingRecord('stock', productId, 'slink-pending-stock-v1:' + store.id + ':' + productId);
  }

  function loadPendingPayment(orderId) {
    return readPendingRecord('payment', orderId, 'slink-pending-payment-v1:' + orderId, function (value) {
      return value.orderId === orderId && typeof value.key === 'string' && value.payload;
    });
  }
  function savePendingPayment(value) {
    return savePendingRecord('payment', value.orderId, value, 'slink-pending-payment-v1:' + value.orderId);
  }
  function clearPendingPayment(orderId) {
    removePendingRecord('payment', orderId, 'slink-pending-payment-v1:' + orderId);
  }

  function loadPendingCustomerPayment(customerId) {
    return readPendingRecord('customer-payment', customerId, 'slink-pending-customer-payment-v1:' + store.id + ':' + customerId, function (value) {
      return value.customerId === customerId && typeof value.key === 'string' && value.payload;
    });
  }
  function savePendingCustomerPayment(value) {
    return savePendingRecord('customer-payment', value.customerId, value, 'slink-pending-customer-payment-v1:' + value.storeId + ':' + value.customerId);
  }
  function clearPendingCustomerPayment(customerId) {
    removePendingRecord('customer-payment', customerId, 'slink-pending-customer-payment-v1:' + store.id + ':' + customerId);
  }

  function loadPendingPurchase() {
    return readPendingRecord('purchase', '', 'slink-pending-purchase-v1', function (value) {
      return typeof value.key === 'string' && value.payload;
    });
  }
  function savePendingPurchase(value) {
    return savePendingRecord('purchase', '', value, 'slink-pending-purchase-v1');
  }
  function clearPendingPurchase() {
    removePendingRecord('purchase', '', 'slink-pending-purchase-v1');
  }

  function purchaseOrderPendingKey(orderId) { return 'slink-pending-purchase-order-v1:' + (orderId || 'new'); }
  function loadPendingPurchaseOrder(orderId) {
    return readPendingRecord('purchase-order', orderId || '', purchaseOrderPendingKey(orderId), function (value) {
      return (!orderId || value.orderId === orderId) && typeof value.key === 'string' && value.payload;
    });
  }
  function savePendingPurchaseOrder(value) {
    return savePendingRecord('purchase-order', value.orderId || '', value, purchaseOrderPendingKey(value.orderId));
  }
  function clearPendingPurchaseOrder(orderId) {
    removePendingRecord('purchase-order', orderId || '', purchaseOrderPendingKey(orderId));
  }

  function purchaseOrderReceiptPendingKey(orderId) { return 'slink-pending-purchase-order-receipt-v1:' + orderId; }
  function loadPendingPurchaseOrderReceipt(orderId) {
    return readPendingRecord('purchase-order-receipt', orderId, purchaseOrderReceiptPendingKey(orderId), function (value) {
      return value.orderId === orderId && typeof value.key === 'string' && value.payload;
    });
  }
  function savePendingPurchaseOrderReceipt(value) {
    return savePendingRecord('purchase-order-receipt', value.orderId, value, purchaseOrderReceiptPendingKey(value.orderId));
  }
  function clearPendingPurchaseOrderReceipt(orderId) {
    removePendingRecord('purchase-order-receipt', orderId, purchaseOrderReceiptPendingKey(orderId));
  }

  function supplierPaymentKey(supplierId) { return 'slink-pending-supplier-payment-v1:' + supplierId; }
  function loadPendingSupplierPayment(supplierId) {
    return readPendingRecord('supplier-payment', supplierId, supplierPaymentKey(supplierId), function (value) {
      return value.supplierId === supplierId && typeof value.key === 'string' && value.payload;
    });
  }
  function savePendingSupplierPayment(value) {
    return savePendingRecord('supplier-payment', value.supplierId, value, supplierPaymentKey(value.supplierId));
  }
  function clearPendingSupplierPayment(supplierId) {
    removePendingRecord('supplier-payment', supplierId, supplierPaymentKey(supplierId));
  }

  function loadPendingCash() {
    return readPendingRecord('cash', '', 'slink-pending-cash-v1', function (value) {
      return typeof value.key === 'string' && value.payload;
    });
  }
  function savePendingCash(value) {
    return savePendingRecord('cash', '', value, 'slink-pending-cash-v1');
  }
  function clearPendingCash() {
    removePendingRecord('cash', '', 'slink-pending-cash-v1');
  }

  function loadPendingProductImport() {
    return readPendingRecord('product-import', '', 'slink-pending-product-import-v1', function (value) {
      return typeof value.key === 'string' && value.payload && Array.isArray(value.payload.items);
    });
  }
  function savePendingProductImport(value) {
    return savePendingRecord('product-import', '', value, 'slink-pending-product-import-v1');
  }
  function clearPendingProductImport() {
    removePendingRecord('product-import', '', 'slink-pending-product-import-v1');
  }

  function loadPendingProductBulkUpdate() {
    return readPendingRecord('product-bulk-update', '', 'slink-pending-product-bulk-update-v1', function (value) {
      return typeof value.key === 'string' && value.payload && Array.isArray(value.payload.items);
    });
  }
  function savePendingProductBulkUpdate(value) {
    return savePendingRecord('product-bulk-update', '', value, 'slink-pending-product-bulk-update-v1');
  }
  function clearPendingProductBulkUpdate() {
    removePendingRecord('product-bulk-update', '', 'slink-pending-product-bulk-update-v1');
  }

  function loadPendingProductVariantGroup() {
    return readPendingRecord('product-variant-group', '', 'slink-pending-product-variant-group-v1', function (value) {
      return typeof value.key === 'string' && value.payload && Array.isArray(value.payload.variants);
    });
  }
  function savePendingProductVariantGroup(value) {
    return savePendingRecord('product-variant-group', '', value, 'slink-pending-product-variant-group-v1');
  }
  function clearPendingProductVariantGroup() {
    removePendingRecord('product-variant-group', '', 'slink-pending-product-variant-group-v1');
  }
  function loadPendingProductVariantAdd() {
    return readPendingRecord('product-variant-add', '', 'slink-pending-product-variant-add-v1', function (value) {
      return typeof value.key === 'string' && typeof value.productId === 'string' && value.payload && Array.isArray(value.payload.variants);
    });
  }
  function savePendingProductVariantAdd(value) {
    return savePendingRecord('product-variant-add', '', value, 'slink-pending-product-variant-add-v1');
  }
  function clearPendingProductVariantAdd() {
    removePendingRecord('product-variant-add', '', 'slink-pending-product-variant-add-v1');
  }

  function loadPendingStockBulkCount() {
    return readPendingRecord('stock-bulk-count', '', 'slink-pending-stock-bulk-count-v1', function (value) {
      return typeof value.key === 'string' && value.payload && Array.isArray(value.payload.items);
    });
  }
  function savePendingStockBulkCount(value) {
    return savePendingRecord('stock-bulk-count', '', value, 'slink-pending-stock-bulk-count-v1');
  }
  function clearPendingStockBulkCount() {
    removePendingRecord('stock-bulk-count', '', 'slink-pending-stock-bulk-count-v1');
  }

  function loadPendingCustomer() {
    return readPendingRecord('customer-create', '', 'slink-pending-customer-create-v1', function (value) {
      return typeof value.key === 'string' && value.payload && typeof value.payload.name === 'string';
    });
  }
  function savePendingCustomer(value) {
    return savePendingRecord('customer-create', '', value, 'slink-pending-customer-create-v1');
  }
  function clearPendingCustomer() {
    removePendingRecord('customer-create', '', 'slink-pending-customer-create-v1');
  }

  function loadPendingCustomerImport() {
    return readPendingRecord('customer-import', '', 'slink-pending-customer-import-v1', function (value) {
      return typeof value.key === 'string' && value.payload && Array.isArray(value.payload.items);
    });
  }
  function savePendingCustomerImport(value) {
    return savePendingRecord('customer-import', '', value, 'slink-pending-customer-import-v1');
  }
  function clearPendingCustomerImport() {
    removePendingRecord('customer-import', '', 'slink-pending-customer-import-v1');
  }

  function loadPendingSupplier() {
    return readPendingRecord('supplier-create', '', 'slink-pending-supplier-create-v1', function (value) {
      return typeof value.key === 'string' && value.payload && typeof value.payload.name === 'string';
    });
  }
  function savePendingSupplier(value) {
    return savePendingRecord('supplier-create', '', value, 'slink-pending-supplier-create-v1');
  }
  function clearPendingSupplier() {
    removePendingRecord('supplier-create', '', 'slink-pending-supplier-create-v1');
  }

  function cashSessionCloseKey(sessionId) { return 'slink-pending-cash-session-close-v1:' + sessionId; }
  function loadPendingCashSessionOpen() {
    return readPendingRecord('cash-session-open', '', 'slink-pending-cash-session-open-v1', function (value) {
      return typeof value.key === 'string' && value.payload && typeof value.payload.openingFloatVnd === 'string';
    });
  }
  function savePendingCashSessionOpen(value) {
    return savePendingRecord('cash-session-open', '', value, 'slink-pending-cash-session-open-v1');
  }
  function clearPendingCashSessionOpen() {
    removePendingRecord('cash-session-open', '', 'slink-pending-cash-session-open-v1');
  }
  function loadPendingCashSessionClose(sessionId) {
    return readPendingRecord('cash-session-close', sessionId, cashSessionCloseKey(sessionId), function (value) {
      return value.sessionId === sessionId && typeof value.key === 'string' && value.payload;
    });
  }
  function savePendingCashSessionClose(value) {
    return savePendingRecord('cash-session-close', value.sessionId, value, cashSessionCloseKey(value.sessionId));
  }
  function clearPendingCashSessionClose(sessionId) {
    removePendingRecord('cash-session-close', sessionId, cashSessionCloseKey(sessionId));
  }

  function orderMutationLegacyKey(orderId) {
    return `slink-pending-order-mutation-v1:${store.id}:${orderId}`;
  }
  function loadPendingOrderMutation(orderId) {
    return readPendingRecord('order-mutation', orderId, orderMutationLegacyKey(orderId), function (value) {
      return value.orderId === orderId && typeof value.key === 'string' && value.payload
        && ['note', 'tag'].includes(value.kind);
    });
  }
  function savePendingOrderMutation(value) {
    return savePendingRecord('order-mutation', value.orderId, value, orderMutationLegacyKey(value.orderId));
  }
  function clearPendingOrderMutation(orderId) {
    removePendingRecord('order-mutation', orderId, orderMutationLegacyKey(orderId));
  }

  async function apiRequest(url, options) {
    const config = options || {};
    const method = String(config.method || 'GET').toUpperCase();
    const headers = Object.assign({}, config.headers || {});
    if (config.body !== undefined) headers['content-type'] = 'application/json';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const token = csrfCookie();
      if (token) headers['x-csrf-token'] = token;
    }
    const response = await fetch(url, {
      method: method,
      credentials: 'same-origin',
      headers: headers,
      body: config.body === undefined ? undefined : JSON.stringify(config.body),
      signal: config.signal,
    });
    let result = {};
    try { result = await response.json(); } catch (e) { /* The server may return a non-JSON gateway error. */ }
    if (!response.ok) {
      const error = new Error(result.error && result.error.message ? result.error.message : 'Không thể kết nối Slink. Vui lòng thử lại.');
      error.status = response.status;
      error.code = result.error && result.error.code;
      throw error;
    }
    return result;
  }

  function mapProduct(row) {
    const product = {
      id: row.id,
      sku: row.sku,
      barcode: row.barcode || '',
      name: row.name,
      category: row.category,
      unit: row.unit,
      price: Number(row.sale_price_vnd),
      cost: Number(row.cost_vnd),
      stock: Number(row.on_hand),
      reserved: Number(row.reserved),
      minStock: Number(row.low_stock_threshold),
      inventoryTracked: row.inventory_tracked,
      inventoryVersion: Number(row.inventory_version) || 1,
      status: row.status,
      version: row.version,
      variantGroupId: row.variant_group_id || '',
      variantGroupName: row.variant_group_name || '',
      variantAttributes: row.variant_attributes && typeof row.variant_attributes === 'object' ? row.variant_attributes : {},
      emoji: '📦',
      tone: 'product-sage',
    };
    productCache.set(product.id, product);
    return product;
  }

  function mapCustomer(row) {
    const balance = Number(row.balance_vnd) || 0;
    const customer = {
      id: row.id,
      name: row.name,
      phone: row.phone || '',
      email: row.email || '',
      note: row.note || '',
      tier: 'Khách hàng',
      points: null,
      debt: Math.max(0, balance),
      credit: Math.max(0, -balance),
      totalSpent: Number(row.total_spent_vnd) || 0,
      orders: Number(row.order_count) || 0,
      version: row.version,
      createdAt: row.created_at,
      tags: Array.isArray(row.tags) ? row.tags : [],
    };
    customerCache.set(customer.id, customer);
    return customer;
  }

  function statusText(status, due) {
    if (status === 'returned') return 'Đã trả hàng';
    if (status === 'partially_returned') return 'Trả một phần';
    if (status === 'partially_returned') return 'Trả một phần';
    if (status === 'voided') return 'Đã hủy';
    if (Number(due) > 0) return 'Còn nợ';
    return 'Hoàn tất';
  }

  function mapOrder(row) {
    const total = Number(row.total_vnd) || 0;
    const paid = Number(row.paid_vnd) || 0;
    const refunded = Number(row.refunded_vnd) || 0;
    const returned = Number(row.return_total_vnd) || 0;
    return {
      id: row.id,
      number: row.order_number,
      customerId: row.customer_id || '',
      customerName: row.customer_name || '',
      customerPhone: row.customer_phone || '',
      status: statusText(row.status, total - paid - returned + refunded),
      subtotal: Number(row.subtotal_vnd) || 0,
      discount: Number(row.discount_vnd) || 0,
      total: total,
      paid: paid,
      refunded: refunded,
      returned: returned,
      due: Math.max(0, total - paid - returned + refunded),
      itemCount: Number(row.line_count) || 0,
      items: [],
      method: '',
      createdAt: row.occurred_at,
      note: row.note || '',
    };
  }

  async function loadCustomersPage(query, offset) {
    if (!authSession || !store.id) return;
    if (store.role === 'stockkeeper') {
      customerRequestNumber += 1;
      store.customers = [];
      customerTotal = 0;
      customerOffset = 0;
      customerNextOffset = null;
      return;
    }
    const requestNumber = ++customerRequestNumber;
    try {
      const activeTag = page === 'customers' ? customerTagFilter.trim() : '';
      const activeSegment = page === 'customers' ? customerSegmentFilter : '';
      const minSpent = page === 'customers' ? customerMinSpentVnd : '';
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/customers?limit=100&offset=${Math.max(0, offset || 0)}&q=${encodeURIComponent(query || '')}${activeTag ? `&tag=${encodeURIComponent(activeTag)}` : ''}${activeSegment ? `&segment=${encodeURIComponent(activeSegment)}` : ''}${minSpent !== '' ? `&minSpentVnd=${encodeURIComponent(minSpent)}` : ''}`);
      if (requestNumber !== customerRequestNumber) return;
      store.customers = result.customers.map(mapCustomer);
      customerTotal = result.total;
      customerOffset = offset || 0;
      customerNextOffset = result.nextOffset;
      if (page === 'customers' && customerSavedSegmentsStoreId !== store.id) await loadCustomerSavedSegments();
    } catch (error) {
      if (requestNumber !== customerRequestNumber) return;
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else toast('Chưa tải được khách hàng', error.message, 'error');
    }
  }

  async function loadCustomerSavedSegments(force) {
    if (!authSession || !store.id || store.role === 'stockkeeper') return;
    if (!force && customerSavedSegmentsStoreId === store.id) return;
    const requestedStoreId = store.id;
    customerSavedSegmentsStoreId = requestedStoreId;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(requestedStoreId)}/customer-segments`);
      if (requestedStoreId !== store.id) return;
      customerSavedSegments = Array.isArray(result.segments) ? result.segments : [];
    } catch (error) {
      if (requestedStoreId !== store.id) return;
      customerSavedSegmentsStoreId = '';
      customerSavedSegments = [];
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else toast('Chưa tải được bộ lọc đã lưu', error.message, 'error');
    }
  }

  function selectedCustomerSavedSegment() {
    return customerSavedSegments.find(function (segment) { return segment.id === selectedCustomerSavedSegmentId; }) || null;
  }

  async function loadOrdersPage(query, offset) {
    if (!authSession || !store.id) return;
    if (store.role === 'stockkeeper') {
      orderRequestNumber += 1;
      store.orders = [];
      orderTotal = 0;
      orderOffset = 0;
      orderNextOffset = null;
      return;
    }
    const requestNumber = ++orderRequestNumber;
    const orderStatusFilter = page === 'orders' ? ({
      'Hoàn tất': 'completed', 'Còn nợ': 'due', 'Trả một phần': 'partially_returned', 'Đã trả hàng': 'returned',
    }[orderFilter] || 'all') : 'all';
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/orders?limit=100&offset=${Math.max(0, offset || 0)}&q=${encodeURIComponent(query || '')}&status=${orderStatusFilter}`);
      if (requestNumber !== orderRequestNumber) return;
      store.orders = result.orders.map(mapOrder);
      orderTotal = result.total;
      orderOffset = offset || 0;
      orderNextOffset = result.nextOffset;
    } catch (error) {
      if (requestNumber !== orderRequestNumber) return;
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else toast('Chưa tải được đơn hàng', error.message, 'error');
    }
  }

  function authCard(title, subtitle, body, message, tone) {
    authRoot.innerHTML = `<section class='auth-card'><div class='auth-brand'><span class='brand-mark' aria-hidden='true'><svg viewBox='0 0 32 32'><path d='M8 8.5h16v5H13v2h11v8H8v-5h11v-2H8z' fill='currentColor'/><circle cx='24.5' cy='7.5' r='2.5' fill='#c8f36c'/></svg></span><span class='brand-name'>slink<span class='brand-period'>.</span></span></div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p>${message ? `<div class='auth-message ${tone === 'error' ? 'error' : ''}'>${message}</div>` : ''}${body}<div class='auth-footnote'>Thông tin bán hàng được lưu theo cửa hàng của bạn và chỉ thành viên được cấp quyền mới xem được.</div></section>`;
    appShell.hidden = true;
    authRoot.hidden = false;
  }

  function renderAuth(message, tone, verificationUrl) {
    let title = 'Đăng nhập Slink';
    let subtitle = 'Quản lý cửa hàng của bạn trên mọi thiết bị.';
    let body = '';
    if (authMode === 'invite-register') {
      title = 'Tham gia cửa hàng';
      subtitle = invitationInfo ? `Bạn được mời tham gia ${invitationInfo.storeName} với vai trò ${staffRoleName(invitationInfo.role)}.` : 'Hoàn tất đăng ký từ lời mời của cửa hàng.';
      body = `<form class='auth-form' data-auth-form='invite-register'><div class='form-field'><label class='input-label' for='auth-name'>Tên của bạn</label><input class='input' id='auth-name' name='displayName' autocomplete='name' required minlength='2' maxlength='120'/></div><div class='form-field'><label class='input-label' for='auth-email'>Email được mời</label><input class='input' id='auth-email' name='email' type='email' value='${esc(invitationInfo ? invitationInfo.email : '')}' readonly/></div><div class='form-field'><label class='input-label' for='auth-password'>Mật khẩu (tối thiểu 12 ký tự)</label><input class='input' id='auth-password' name='password' type='password' autocomplete='new-password' required minlength='12' maxlength='128'/></div><button class='btn btn-primary auth-submit' type='submit'>Tạo tài khoản và tham gia</button></form><button class='auth-switch' type='button' data-action='auth-mode' data-mode='invite-login'>Đã có tài khoản? Đăng nhập</button>`;
    } else if (authMode === 'register') {
      title = 'Tạo tài khoản cửa hàng';
      subtitle = 'Bắt đầu bằng email của bạn và thông tin cửa hàng.';
      body = `<form class='auth-form' data-auth-form='register'><div class='form-field'><label class='input-label' for='auth-name'>Tên của bạn</label><input class='input' id='auth-name' name='displayName' autocomplete='name' required minlength='2' maxlength='120'/></div><div class='form-field'><label class='input-label' for='auth-store'>Tên cửa hàng</label><input class='input' id='auth-store' name='storeName' autocomplete='organization' required minlength='2' maxlength='160'/></div><div class='form-field'><label class='input-label' for='auth-email'>Email</label><input class='input' id='auth-email' name='email' type='email' autocomplete='email' required maxlength='254'/></div><div class='form-field'><label class='input-label' for='auth-password'>Mật khẩu (tối thiểu 12 ký tự)</label><input class='input' id='auth-password' name='password' type='password' autocomplete='new-password' required minlength='12' maxlength='128'/></div><button class='btn btn-primary auth-submit' type='submit'>Tạo tài khoản</button></form><button class='auth-switch' type='button' data-action='auth-mode' data-mode='login'>Đã có tài khoản? Đăng nhập</button>`;
    } else if (authMode === 'resend') {
      title = 'Gửi lại email xác nhận';
      subtitle = 'Nhập email đã dùng khi đăng ký Slink.';
      body = `<form class='auth-form' data-auth-form='resend'><div class='form-field'><label class='input-label' for='auth-email'>Email</label><input class='input' id='auth-email' name='email' type='email' autocomplete='email' required maxlength='254'/></div><button class='btn btn-primary auth-submit' type='submit'>Gửi liên kết mới</button></form><button class='auth-switch' type='button' data-action='auth-mode' data-mode='login'>Quay lại đăng nhập</button>`;
    } else if (authMode === 'reset') {
      title = 'Đặt lại mật khẩu';
      subtitle = 'Nhập email đã đăng ký để nhận liên kết bảo mật.';
      body = `<form class='auth-form' data-auth-form='reset'><div class='form-field'><label class='input-label' for='auth-email'>Email</label><input class='input' id='auth-email' name='email' type='email' autocomplete='email' required maxlength='254'/></div><button class='btn btn-primary auth-submit' type='submit'>Gửi liên kết đặt lại</button></form><button class='auth-switch' type='button' data-action='auth-mode' data-mode='login'>Quay lại đăng nhập</button>`;
    } else if (authMode === 'reset-complete') {
      title = 'Tạo mật khẩu mới';
      subtitle = 'Liên kết có hiệu lực trong một giờ và chỉ dùng một lần.';
      const resetToken = new URLSearchParams(window.location.hash.slice(1)).get('reset') || '';
      body = resetToken ? `<form class='auth-form' data-auth-form='reset-complete'><input type='hidden' name='token' value='${esc(resetToken)}'/><div class='form-field'><label class='input-label' for='auth-password'>Mật khẩu mới (tối thiểu 12 ký tự)</label><input class='input' id='auth-password' name='password' type='password' autocomplete='new-password' required minlength='12' maxlength='128'/></div><div class='form-field'><label class='input-label' for='auth-password-confirm'>Nhập lại mật khẩu</label><input class='input' id='auth-password-confirm' name='passwordConfirm' type='password' autocomplete='new-password' required minlength='12' maxlength='128'/></div><button class='btn btn-primary auth-submit' type='submit'>Cập nhật mật khẩu</button></form>` : `<div class='auth-message error'>Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.</div>`;
      body += `<button class='auth-switch' type='button' data-action='auth-mode' data-mode='login'>Quay lại đăng nhập</button>`;
    } else {
      const invited = authMode === 'invite-login' && invitationInfo;
      if (invited) { title = 'Đăng nhập để tham gia'; subtitle = `Lời mời vào ${invitationInfo.storeName} · ${staffRoleName(invitationInfo.role)}.`; }
      body = `<form class='auth-form' data-auth-form='login'><div class='form-field'><label class='input-label' for='auth-email'>Email</label><input class='input' id='auth-email' name='email' type='email' autocomplete='username' value='${esc(invited ? invitationInfo.email : '')}' required maxlength='254'/></div><div class='form-field'><label class='input-label' for='auth-password'>Mật khẩu</label><input class='input' id='auth-password' name='password' type='password' autocomplete='current-password' required maxlength='128'/></div><button class='btn btn-primary auth-submit' type='submit'>${invited ? 'Đăng nhập và tham gia' : 'Đăng nhập'}</button></form>${invited ? `<button class='auth-switch' type='button' data-action='auth-mode' data-mode='invite-register'>Tạo tài khoản mới bằng lời mời</button><button class='auth-switch' type='button' data-action='auth-mode' data-mode='resend'>Gửi lại email xác nhận</button>` : `<button class='auth-switch' type='button' data-action='auth-mode' data-mode='reset'>Quên mật khẩu?</button><button class='auth-switch' type='button' data-action='auth-mode' data-mode='register'>Tạo tài khoản và cửa hàng</button><button class='auth-switch' type='button' data-action='auth-mode' data-mode='resend'>Gửi lại email xác nhận</button>`}`;
    }
    let htmlMessage = message ? esc(message) : '';
    if (verificationUrl) htmlMessage += `<br/><a href='${esc(verificationUrl)}'>${authMode === 'reset' ? 'Mở liên kết đặt lại mật khẩu' : 'Xác nhận email và kích hoạt cửa hàng'}</a>`;
    authCard(title, subtitle, body, htmlMessage, tone);
  }

  function showSignedOut(message, tone) {
    closeModal();
    channelState.requestNumber += 1;
    channelState = { profiles: [], mappings: [], total: 0, nextOffset: null, offset: 0, query: '', state: 'active', view: 'mappings', orders: [], orderTotal: 0, orderOffset: 0, orderNextOffset: null, orderStatus: '', orderQuery: '', orderLoading: false, orderError: '', orderRequestNumber: channelState.orderRequestNumber, loading: false, error: '', requestNumber: channelState.requestNumber };
    channelProductRequestNumber += 1;
    customerTagFilter = '';
    customerSegmentFilter = '';
    customerMinSpentVnd = '';
    customerSavedSegments = [];
    customerSavedSegmentsStoreId = '';
    selectedCustomerSavedSegmentId = '';
    orderNoteHistoryCache.clear();
    orderNoteHistoryCursor.clear();
    orderNoteHistoryLoading.clear();
    auditState.requestNumber += 1;
    auditState = { events: [], total: 0, nextOffset: null, offset: 0, limit: 50, loading: false, error: '', requestNumber: auditState.requestNumber, filters: { from: '', to: '', q: '' } };
    accountSecurityState.requestNumber += 1;
    accountSecurityState = { sessions: [], events: [], loading: false, error: '', requestNumber: accountSecurityState.requestNumber };
    authSession = null;
    store = emptyStore();
    page = 'products';
    authMode = 'login';
    pendingCompatibilityStoreId = '';
    pendingCompatibilitySaveBlocked = false;
    if (pendingCompatibilityWarning) pendingCompatibilityWarning.hidden = true;
    renderAuth(message, tone);
  }

  async function enterStore(session, preferredStoreId) {
    if (!session || !session.stores || !session.stores.length) {
      showSignedOut('Tài khoản chưa có cửa hàng đang hoạt động. Hãy tạo tài khoản cửa hàng mới hoặc liên hệ quản lý.', 'error');
      return;
    }
    customerTagFilter = '';
    customerSegmentFilter = '';
    customerMinSpentVnd = '';
    customerSavedSegments = [];
    customerSavedSegmentsStoreId = '';
    selectedCustomerSavedSegmentId = '';
    orderNoteHistoryCache.clear();
    orderNoteHistoryCursor.clear();
    orderNoteHistoryLoading.clear();
    channelState.requestNumber += 1;
    channelState = { profiles: [], mappings: [], total: 0, nextOffset: null, offset: 0, query: '', state: 'active', view: 'mappings', orders: [], orderTotal: 0, orderOffset: 0, orderNextOffset: null, orderStatus: '', orderQuery: '', orderLoading: false, orderError: '', orderRequestNumber: channelState.orderRequestNumber, loading: false, error: '', requestNumber: channelState.requestNumber };
    channelProductRequestNumber += 1;
    authSession = { user: session.user, stores: session.stores };
    auditState.requestNumber += 1;
    auditState = { events: [], total: 0, nextOffset: null, offset: 0, limit: 50, loading: false, error: '', requestNumber: auditState.requestNumber, filters: { from: '', to: '', q: '' } };
    accountSecurityState.requestNumber += 1;
    accountSecurityState = { sessions: [], events: [], loading: false, error: '', requestNumber: accountSecurityState.requestNumber };
    checkoutIdempotencyKey = '';
    checkoutPendingPayload = null;
    cart = [];
    cartCustomerId = '';
    const activeStore = session.stores.find(function (item) { return item.id === preferredStoreId; }) || session.stores[0];
    store = emptyStore();
    store.id = activeStore.id;
    store.role = activeStore.role;
    updatePendingCompatibilityWarning(store.id);
    const pendingSale = loadPendingSale();
    if (pendingSale && pendingSale.storeId === store.id) {
      checkoutIdempotencyKey = pendingSale.key;
      checkoutPendingPayload = pendingSale.payload;
    }
    store.settings.storeName = activeStore.name;
    store.settings.ownerName = session.user.displayName;
    store.settings.phone = activeStore.phone || '';
    store.settings.address = activeStore.address || '';
    store.settings.receiptFooter = activeStore.receipt_footer || '';
    store.settings.version = Number(activeStore.version) || 1;
    warehouses = [];
    warehouseTransfers = [];
    selectedWarehouseId = '';
    warehouseError = '';
    page = checkoutPendingPayload ? 'pos' : 'products';
    authRoot.hidden = true;
    appShell.hidden = false;
    productLoading = true;
    render();
    await Promise.all([loadProductsPage('', 0), loadCustomersPage('', 0), loadOrdersPage('', 0), loadWarehouses()]);
    if (checkoutPendingPayload) {
      cart = checkoutPendingPayload.items.map(function (item) { return { id: item.productId, qty: item.quantity }; });
      cartCustomerId = checkoutPendingPayload.customerId || '';
      cart.discount = checkoutPendingPayload.discountVnd || 0;
    }
    if (authSession) render();
  }

  async function loadProductsPage(query, offset) {
    if (!authSession || !store.id) return;
    const requestNumber = ++productRequestNumber;
    productLoading = true;
    productError = '';
    const warehouseQuery = page === 'pos' && selectedWarehouseId ? `&warehouseId=${encodeURIComponent(selectedWarehouseId)}` : '';
    const url = `/api/stores/${encodeURIComponent(store.id)}/products?limit=100&offset=${Math.max(0, offset || 0)}&q=${encodeURIComponent(query || '')}${warehouseQuery}`;
    try {
      const result = await apiRequest(url);
      if (requestNumber !== productRequestNumber) return;
      if (!result.products.length && offset > 0) return loadProductsPage(query, Math.max(0, offset - 100));
      store.products = result.products.map(mapProduct);
      productTotal = result.total;
      productOffset = offset || 0;
      productNextOffset = result.nextOffset;
      productLoading = false;
      productError = '';
      render();
    } catch (error) {
      if (requestNumber !== productRequestNumber) return;
      productLoading = false;
      productError = error.message;
      if (error.status === 401) return showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      toast('Chưa tải được sản phẩm', error.message, 'error');
      render();
    }
  }

  function posWarehouseParam() {
    return page === 'pos' && selectedWarehouseId ? `&warehouseId=${encodeURIComponent(selectedWarehouseId)}` : '';
  }

  async function loadInventoryPage(query, offset) {
    if (!authSession || !store.id) return;
    const requestNumber = ++inventoryRequestNumber;
    inventoryLoading = true;
    inventoryError = '';
    if (page === 'inventory') render();
    try {
      const warehouseQuery = selectedWarehouseId ? `&warehouseId=${encodeURIComponent(selectedWarehouseId)}` : '';
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/inventory?limit=100&offset=${Math.max(0, offset || 0)}&q=${encodeURIComponent(query || '')}${warehouseQuery}`);
      if (requestNumber !== inventoryRequestNumber) return;
      store.products = result.products.map(mapProduct);
      store.movements = result.movements.map(function (movement) { return { productId: movement.productId, type: movement.type, delta: Number(movement.delta), reason: movement.reason, createdAt: movement.createdAt }; });
      inventorySummary = result.summary;
      inventoryTotal = result.total;
      inventoryOffset = offset || 0;
      inventoryNextOffset = result.nextOffset;
      inventoryLoading = false;
      if (page === 'inventory') render();
    } catch (error) {
      if (requestNumber !== inventoryRequestNumber) return;
      inventoryLoading = false;
      inventoryError = error.message;
      if (error.status === 401) return showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      toast('Chưa tải được tồn kho', error.message, 'error');
      if (page === 'inventory') render();
    }
  }

  async function loadWarehouses() {
    if (!authSession || !store.id) return;
    warehouseLoading = true;
    warehouseError = '';
    try {
      const list = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/warehouses`);
      const warehouseRows = list.warehouses || [];
      warehouseRows.forEach(function (warehouse) {
        if (warehouse.status === 'archived' && readPendingWarehouseMutation('warehouse-archive', warehouse.id)) {
          removePendingRecord('warehouse-archive', warehouse.id, `slink-pending-warehouse-archive-v1:${store.id}:${warehouse.id}`);
        }
      });
      warehouses = warehouseRows.filter(function (warehouse) { return warehouse.status === 'active'; });
      if (!warehouses.some(function (warehouse) { return warehouse.id === selectedWarehouseId; })) {
        selectedWarehouseId = (warehouses.find(function (warehouse) { return warehouse.is_default; }) || warehouses[0] || {}).id || '';
      }
      if (store.role === 'cashier') warehouseTransfers = [];
      else {
        const transfers = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/warehouse-transfers?limit=100`);
        warehouseTransfers = transfers.transfers || [];
      }
    } catch (error) {
      warehouseError = error.message;
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    } finally {
      warehouseLoading = false;
      if (page === 'inventory') render();
    }
  }

  async function loadFinancePage() {
    if (!authSession || !store.id) return;
    financeLoading = true;
    financeError = '';
    if (page === 'finance') render();
    try {
      const [result, register] = await Promise.all([
        apiRequest(`/api/stores/${encodeURIComponent(store.id)}/finance`),
        store.role === 'stockkeeper'
          ? Promise.resolve({ session: null, lastClosed: null, recentClosed: [], canOperate: false, canOpen: false, canClose: false })
          : apiRequest(`/api/stores/${encodeURIComponent(store.id)}/cash-register`),
      ]);
      store.cashbook = result.movements.map(function (row) {
        return { id: row.source_id, type: row.direction, category: row.category, amountVnd: row.amount_vnd, note: row.note, method: row.method, actorName: row.actor_name, cashSessionId: row.cash_session_id, cashSessionOpenedAt: row.cash_session_opened_at, createdAt: row.occurred_at };
      });
      store.suppliers = result.suppliers.map(function (row) { return { id: row.id, name: row.name, debt: Math.max(0, Number(row.balance_vnd) || 0), lastActivityAt: row.last_activity_at }; });
      purchaseHistory = (result.purchases || []).map(function (row) {
        return { id: row.id, number: row.purchase_number, purchaseOrderNumber: row.purchase_order_number || '', status: row.status, note: row.note || '', total: Number(row.total_vnd) || 0, supplierName: row.supplier_name || '', receivedAt: row.received_at, items: Array.isArray(row.lines) ? row.lines : [] };
      });
      purchaseOrders = (result.purchaseOrders || []).map(function (row) {
        return { id: row.id, number: row.purchase_order_number, status: row.status, version: Number(row.version) || 1, note: row.note || '', totalVnd: String(row.total_vnd || '0'), supplierId: row.supplier_id, supplierName: row.supplier_name || '', warehouseId: row.warehouse_id || '', warehouseName: row.warehouse_name || '', createdAt: row.created_at, orderedAt: row.ordered_at, completedAt: row.completed_at, cancelledAt: row.cancelled_at, items: Array.isArray(row.lines) ? row.lines : [] };
      });
      financeTopCustomers = result.customerDebtors.map(function (row) { return { id: row.id, name: row.name, phone: row.phone, debt: String(row.balance_vnd) }; });
      financeSummary = {
        todayInVnd: result.summary ? String(result.summary.todayInVnd) : '0', todayOutVnd: result.summary ? String(result.summary.todayOutVnd) : '0',
        customerDebtVnd: result.summary ? String(result.summary.customerDebtVnd) : '0', customerDebtCount: result.summary ? Number(result.summary.customerDebtCount) : 0,
        supplierPayableVnd: result.summary ? String(result.summary.supplierPayableVnd || '0') : '0',
      };
      financeMovementTotal = result.movementTotal;
      cashRegisterState = register;
      cashRegisterError = '';
      financeLoading = false;
      if (page === 'finance') render();
    } catch (error) {
      financeLoading = false;
      financeError = error.message;
      cashRegisterError = error.message;
      if (error.status === 401) return showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      toast('Chưa tải được sổ thu chi', error.message, 'error');
      if (page === 'finance') render();
    }
  }

  function applyStoreProfile(settings) {
    store.settings.storeName = settings.name;
    store.settings.phone = settings.phone || '';
    store.settings.address = settings.address || '';
    store.settings.receiptFooter = settings.receipt_footer || '';
    store.settings.version = Number(settings.version) || 1;
    const activeStore = authSession && authSession.stores.find(function (item) { return item.id === store.id; });
    if (activeStore) Object.assign(activeStore, { name: settings.name, phone: settings.phone, address: settings.address, receipt_footer: settings.receipt_footer, version: settings.version });
  }

  async function loadStoreProfile() {
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/settings`);
      applyStoreProfile(result.settings);
      if (page === 'settings') render();
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else toast('Chưa tải được thông tin cửa hàng', error.message, 'error');
    }
  }

  async function loadAccountSecurity() {
    if (!authSession) return;
    const requestNumber = ++accountSecurityState.requestNumber;
    accountSecurityState.loading = true;
    accountSecurityState.error = '';
    if (page === 'settings') render();
    try {
      const result = await apiRequest('/api/auth/security');
      if (requestNumber !== accountSecurityState.requestNumber) return;
      accountSecurityState.sessions = result.sessions || [];
      accountSecurityState.events = result.events || [];
      accountSecurityState.loading = false;
    } catch (error) {
      if (requestNumber !== accountSecurityState.requestNumber) return;
      accountSecurityState.loading = false;
      accountSecurityState.error = error.message;
      if (error.status === 401) return showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    }
    if (page === 'settings') render();
  }

  async function revokeAccountSession(sessionId) {
    if (!sessionId || !window.confirm('Đăng xuất phiên được chọn? Thiết bị đó sẽ phải đăng nhập lại.')) return;
    try {
      const result = await apiRequest(`/api/auth/sessions/${encodeURIComponent(sessionId)}/revoke`, { method: 'POST', body: {} });
      toast(result.status === 'revoked' ? 'Đã đăng xuất thiết bị' : 'Phiên này đã được đăng xuất');
      await loadAccountSecurity();
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập hiện tại đã hết hạn. Hãy đăng nhập lại.', 'error');
      else toast('Chưa đăng xuất được thiết bị', error.message, 'error');
    }
  }

  async function loadStaffPage() {
    if (!authSession || !store.id || store.role !== 'owner') return;
    staffState.loading = true;
    staffState.error = '';
    if (page === 'staff') render();
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/staff`);
      staffState.members = result.members || [];
      staffState.invitations = result.invitations || [];
      staffState.warehouses = result.warehouses || [];
      staffState.loading = false;
    } catch (error) {
      staffState.loading = false;
      staffState.error = error.message;
      if (error.status === 401) return showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    }
    if (page === 'staff') render();
  }

  async function loadAuditEvents(filters, offset) {
    if (!authSession || !store.id || !['owner', 'manager'].includes(store.role)) return;
    if (filters) auditState.filters = { from: filters.from || '', to: filters.to || '', q: filters.q || '' };
    const requestNumber = ++auditState.requestNumber;
    auditState.offset = Math.max(0, Number(offset) || 0);
    auditState.loading = true;
    auditState.error = '';
    if (page === 'audit') render();
    const params = new URLSearchParams({ limit: String(auditState.limit), offset: String(auditState.offset) });
    if (auditState.filters.from) params.set('from', auditState.filters.from);
    if (auditState.filters.to) params.set('to', auditState.filters.to);
    if (auditState.filters.q) params.set('q', auditState.filters.q);
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/audit-events?${params}`);
      if (requestNumber !== auditState.requestNumber) return;
      auditState.events = result.events || [];
      auditState.total = Number(result.total) || 0;
      auditState.nextOffset = result.nextOffset;
      auditState.loading = false;
    } catch (error) {
      if (requestNumber !== auditState.requestNumber) return;
      auditState.loading = false;
      auditState.error = error.status === 404
        ? 'Máy chủ Slink chưa có phiên bản nhật ký này. Hãy khởi động lại API rồi tải lại trang.'
        : error.message;
      if (error.status === 401) return showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    }
    if (page === 'audit') render();
  }

  async function loadAnalytics(days) {
    if (!authSession || !store.id) return;
    if (!['owner', 'manager', 'accountant'].includes(store.role)) {
      analyticsRequestNumber += 1;
      analyticsData = null;
      analyticsLoading = false;
      analyticsError = '';
      return;
    }
    const requestNumber = ++analyticsRequestNumber;
    analyticsLoading = true;
    analyticsError = '';
    if (page === 'dashboard' || page === 'reports') render();
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/analytics?days=${days === 30 ? 30 : 7}`);
      if (requestNumber !== analyticsRequestNumber) return;
      analyticsData = result;
      analyticsLoading = false;
      if (page === 'dashboard' || page === 'reports') render();
    } catch (error) {
      if (requestNumber !== analyticsRequestNumber) return;
      analyticsLoading = false;
      analyticsError = error.message;
      if (error.status === 401) return showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      toast('Chưa tải được báo cáo', error.message, 'error');
      if (page === 'dashboard' || page === 'reports') render();
    }
  }

  function icon(name, size) { return `<svg width='${size || 18}' height='${size || 18}' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>${iconPaths[name] || iconPaths.spark}</svg>`; }
  function localDate(date) { const d = date || new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }
  function isoAgo(days, hour, minute) { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(hour || 10, minute || 0, 0, 0); return d.toISOString(); }
  function money(amount) { return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Math.round(Number(amount) || 0)); }
  function moneyVndText(value) {
    try {
      const integer = BigInt(String(value == null || value === '' ? '0' : value));
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(integer);
    } catch (error) { return money(value); }
  }
  function number(value) { return new Intl.NumberFormat('vi-VN').format(Number(value) || 0); }
  function shortMoney(value) { const n = Number(value) || 0; if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace('.', ',') + ' tr'; if (n >= 1000) return (n / 1000).toFixed(0) + 'k'; return number(n); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function humanDate(value, withTime) { const d = new Date(value); if (Number.isNaN(d.getTime())) return ''; return d.toLocaleString('vi-VN', withTime ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function timeOf(value) { return new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); }
  function todayLabel() { return new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function initials(name) { return String(name || 'Slink').trim().split(/\s+/).slice(-2).map(function (x) { return x[0]; }).join('').toUpperCase(); }
  function productById(id) {
    const currentSearchResult = page === 'pos' && posProducts.find(function (p) { return p.id === id; });
    return currentSearchResult || store.products.find(function (p) { return p.id === id; }) || productCache.get(id);
  }
  function customerById(id) { return store.customers.find(function (c) { return c.id === id; }) || customerCache.get(id); }
  function toast(title, message, tone) {
    const node = document.createElement('div');
    node.className = 'toast' + (tone === 'error' ? ' error' : '');
    node.innerHTML = '<strong>' + esc(title) + '</strong>' + (message ? '<small>' + esc(message) + '</small>' : '');
    toastStack.appendChild(node);
    window.setTimeout(function () { node.remove(); }, 3700);
  }

  function statusBadge(status) {
    const cls = status === 'Hoàn tất' ? 'success' : status === 'Còn nợ' ? 'warning' : status === 'Đã trả hàng' ? 'neutral' : status === 'Đã hủy' ? 'danger' : 'info';
    return `<span class='badge badge-${cls}'><i class='badge-dot'></i>${esc(status)}</span>`;
  }

  function staffRoleName(role) {
    return ({ owner: 'Chủ cửa hàng', manager: 'Quản lý', cashier: 'Thu ngân', stockkeeper: 'Nhân viên kho', accountant: 'Kế toán' })[role] || 'Nhân viên';
  }

  function staffRoleDescription(role) {
    return ({
      manager: 'Điều phối bán hàng, trả hàng, kho, tài chính và cài đặt cửa hàng; không được quản lý nhân viên.',
      cashier: 'Tạo đơn bán, cập nhật hồ sơ khách và ghi nhận thu nợ; không được tự hủy đơn hoặc trả hàng.',
      stockkeeper: 'Cập nhật danh mục, kiểm kê tồn và nhận hàng nhập kho.',
      accountant: 'Theo dõi công nợ, thanh toán, thu chi và nghiệp vụ nhập hàng; không bán hàng hoặc sửa danh mục.',
    })[role] || '';
  }

  function navHtml(item, mobile) {
    const active = page === item.id || (item.id === 'products' && page === 'product-detail') || (item.id === 'orders' && page === 'order-detail');
    if (mobile) return `<button class='mobile-nav-link ${active ? 'active' : ''}' data-route='${item.id}' aria-label='${item.label}' ${active ? "aria-current='page'" : ''}><span class='nav-icon'>${icon(item.icon, 18)}</span><span>${item.id === 'dashboard' ? 'Tổng quan' : item.id === 'pos' ? 'Bán hàng' : item.id === 'orders' ? 'Đơn hàng' : 'Kho hàng'}</span></button>`;
    return `<button class='nav-link ${active ? 'active' : ''}' data-route='${item.id}' aria-label='${esc(item.label)}' title='${esc(item.label)}' ${active ? "aria-current='page'" : ''}><span class='nav-icon'>${icon(item.icon, 18)}</span><span class='nav-label'>${esc(item.label)}</span>${item.id === 'inventory' && lowStockProducts().length ? `<span class='nav-count'>${lowStockProducts().length}</span>` : ''}</button>`;
  }

  function canAccessRoute(route) {
    if (route === 'staff' && store.role !== 'owner') return false;
    if (route === 'audit' && !['owner', 'manager'].includes(store.role)) return false;
    if (route === 'reports' && !['owner', 'manager', 'accountant'].includes(store.role)) return false;
    if (route === 'channels' && !['owner', 'manager', 'stockkeeper'].includes(store.role)) return false;
    if (store.role === 'stockkeeper' && ['pos', 'orders', 'customers'].includes(route)) return false;
    if (store.role === 'accountant' && route === 'pos') return false;
    return true;
  }

  function renderShell() {
    document.getElementById('sidebar-store-name').textContent = store.settings.storeName;
    const storeAvatar = document.querySelector('.store-avatar');
    if (storeAvatar) storeAvatar.textContent = initials(store.settings.storeName).slice(0, 1);
    const userName = authSession && authSession.user ? authSession.user.displayName : 'Slink';
    const userEmail = authSession && authSession.user ? authSession.user.email : '';
    const profileName = document.querySelector('.profile-button strong');
    const profileEmail = document.querySelector('.profile-button small');
    if (profileName) profileName.textContent = userName;
    if (profileEmail) profileEmail.textContent = userEmail;
    const profileAvatar = document.querySelector('.profile-avatar');
    const topbarAvatar = document.querySelector('.topbar-avatar');
    if (profileAvatar) profileAvatar.textContent = initials(userName);
    if (topbarAvatar) topbarAvatar.textContent = initials(userName);
    const visibleNav = navItems.filter(function (item) { return canAccessRoute(item.id); });
    document.getElementById('primary-nav').innerHTML = visibleNav.map(function (n) { return navHtml(n, false); }).join('');
    const moreActive = ['customers', 'finance', 'reports', 'settings', 'products', 'channels', 'staff', 'audit', 'product-detail'].includes(page);
    document.getElementById('mobile-nav').innerHTML = ['dashboard', 'pos', 'orders', 'inventory'].filter(canAccessRoute).map(function (id) { return navHtml(navItems.find(function (n) { return n.id === id; }), true); }).join('') + `<button class='mobile-nav-link ${moreActive ? 'active' : ''}' data-action='more-menu' ${moreActive ? "aria-current='page'" : ''}><span class='nav-icon'>${icon('more', 18)}</span><span>Khác</span></button>`;
    const names = { dashboard: ['Tổng quan', 'Hôm nay'], pos: ['Bán hàng', 'Tạo đơn'], products: ['Hàng hóa', 'Sản phẩm'], orders: ['Vận hành', 'Đơn hàng'], customers: ['Khách hàng', 'Danh sách'], inventory: ['Kho hàng', 'Tồn kho'], finance: ['Tài chính', 'Thu chi & công nợ'], reports: ['Phân tích', 'Báo cáo'], settings: ['Cửa hàng', 'Cài đặt'], channels: ['Bán hàng đa kênh', 'Kênh bán'], staff: ['Cửa hàng', 'Nhân viên'], audit: ['Quản trị', 'Nhật ký hoạt động'], 'order-detail': ['Đơn hàng', 'Chi tiết đơn'], 'product-detail': ['Hàng hóa', 'Chi tiết sản phẩm'] };
    const meta = names[page] || ['Slink', 'Cửa hàng'];
    document.getElementById('crumb').textContent = meta[0];
    document.getElementById('crumb-current').textContent = meta[1];
    const online = navigator.onLine;
    document.getElementById('connection-status').innerHTML = `<i style='${online ? '' : 'background:#d58b55;box-shadow:0 0 0 3px #f9efe2'}'></i>${online ? 'Có kết nối mạng' : 'Ngoại tuyến · chưa thể lưu'}`;
  }

  function pageHeading(title, subtitle, actions) {
    return `<div class='page-heading'><div><h1>${esc(title)}</h1><p>${esc(subtitle || '')}</p></div><div class='heading-actions'>${actions || ''}</div></div>`;
  }

  function lowStockProducts() { return store.products.filter(function (p) { return p.inventoryTracked && p.stock <= p.minStock; }).sort(function (a, b) { return a.stock - b.stock; }); }
  function chartDays(days) {
    if (!analyticsData || !Array.isArray(analyticsData.days)) return [];
    return analyticsData.days.map(function (item) {
      const date = new Date(item.date + 'T12:00:00');
      return { date: item.date, label: days === 7 ? date.toLocaleDateString('vi-VN', { weekday: 'short' }) : String(date.getDate()), total: Number(item.salesVnd) || 0, orders: Number(item.orderCount) || 0 };
    });
  }

  function chartSvg(days) {
    const width = 620, height = 170, left = 34, right = 8, top = 12, bottom = 26;
    const data = chartDays(days); if (!data.length) return `<div class='empty-state'>${analyticsLoading ? 'Đang tải báo cáo…' : esc(analyticsError || 'Chưa có dữ liệu cho khoảng thời gian này.')}</div>`; const max = Math.max(100000, Math.ceil(Math.max.apply(null, data.map(function (x) { return x.total; })) / 100000) * 100000);
    const step = (width - left - right) / Math.max(1, data.length - 1);
    const points = data.map(function (d, i) { return { x: left + i * step, y: top + (height - top - bottom) * (1 - d.total / max), value: d.total, label: d.label }; });
    const line = points.map(function (p, i) { return (i ? 'L' : 'M') + p.x + ' ' + p.y; }).join(' ');
    const area = line + ` L ${points[points.length - 1].x} ${height - bottom} L ${points[0].x} ${height - bottom} Z`;
    const grid = [0, 1, 2, 3].map(function (i) { const y = top + (height - top - bottom) * i / 3; return `<line x1='${left}' x2='${width}' y1='${y}' y2='${y}' class='chart-grid-line'/><text x='0' y='${y + 3}'>${i === 0 ? shortMoney(max) : i === 3 ? '0' : shortMoney(max * (3 - i) / 3)}</text>`; }).join('');
    const labels = points.map(function (p) { return `<text text-anchor='middle' x='${p.x}' y='${height - 5}'>${esc(p.label)}</text>`; }).join('');
    const markers = points.map(function (p) { return `<circle class='chart-point' cx='${p.x}' cy='${p.y}' r='3.5'><title>${esc(p.label)}: ${money(p.value)}</title></circle>`; }).join('');
    return `<svg class='sales-chart' viewBox='0 0 ${width} ${height}' preserveAspectRatio='none' role='img' aria-label='Biểu đồ doanh thu ${days} ngày'><defs><linearGradient id='chartFill' x1='0' x2='0' y1='0' y2='1'><stop offset='0%' stop-color='#6aa982' stop-opacity='.24'/><stop offset='100%' stop-color='#6aa982' stop-opacity='0'/></linearGradient></defs>${grid}<path class='chart-area' d='${area}'/><path class='chart-line' d='${line}'/>${markers}${labels}</svg>`;
  }

  function topProducts() {
    return analyticsData && Array.isArray(analyticsData.topProducts) ? analyticsData.topProducts.slice(0, 4).map(function (item) {
      return { product: { id: item.id, name: item.name, sku: item.sku, unit: item.unit, tone: 'product-sage', emoji: '📦' }, count: Number(item.quantity_sold) || 0, revenue: Number(item.net_sales_vnd) || 0 };
    }) : [];
  }

  function filteredProducts(query, category, source) {
    const q = String(query || '').trim().toLowerCase();
    return (source || store.products).filter(function (p) {
      const attributes = Object.entries(p.variantAttributes || {}).map(function (entry) { return entry.join(' '); }).join(' ');
      return (!category || category === 'Tất cả' || p.category === category) && (!q || [p.name, p.sku, p.category, p.variantGroupName, attributes].some(function (value) { return String(value || '').toLowerCase().includes(q); }));
    });
  }

  function stockBadge(product) {
    if (!product.inventoryTracked) return `<span class='badge badge-neutral'>Không theo dõi tồn</span>`;
    if (product.stock <= 0) return `<span class='badge badge-danger'>Hết hàng</span>`;
    if (product.stock <= product.minStock) return `<span class='badge badge-warning'>Sắp hết</span>`;
    return `<span class='badge badge-success'>Đang bán</span>`;
  }

  function productRow(product) {
    const canEdit = ['owner', 'manager', 'stockkeeper'].includes(store.role);
    const canViewPriceHistory = ['owner', 'manager', 'stockkeeper', 'accountant'].includes(store.role);
    const showCost = store.role !== 'cashier';
    const attributes = Object.entries(product.variantAttributes || {}).map(function (entry) { return `${entry[0]}: ${entry[1]}`; }).join(' · ');
    return `<tr><td><div class='product-cell'><span class='product-thumb ${product.tone || 'product-sage'}'>${esc(product.emoji || '📦')}</span><span class='product-name-stack'><strong>${esc(product.name)}</strong><small>${esc(product.sku)}${attributes ? ` · ${esc(attributes)}` : ''}</small></span></div></td><td>${esc(product.category)}</td><td class='text-right'>${money(product.price)}</td>${showCost ? `<td class='text-right'>${money(product.cost)}</td>` : ''}<td class='text-right'><span class='stock-number ${product.inventoryTracked && product.stock <= 0 ? 'out' : product.inventoryTracked && product.stock <= product.minStock ? 'low' : ''}'>${product.inventoryTracked ? `${number(product.stock)} ${esc(product.unit)}` : '—'}</span></td><td>${stockBadge(product)}</td><td class='text-right'>${canViewPriceHistory ? `<button class='row-action' data-action='product-price-history' data-id='${product.id}' aria-label='Xem lịch sử giá ${esc(product.name)}' title='Lịch sử giá'>${icon('clock', 15)}</button>` : ''}${canEdit ? `<button class='row-action' data-action='edit-product' data-id='${product.id}' aria-label='Sửa ${esc(product.name)}'>•••</button>` : ''}</td></tr>`;
  }

  function productMobileCard(product) {
    const canEdit = ['owner', 'manager', 'stockkeeper'].includes(store.role);
    const canViewPriceHistory = ['owner', 'manager', 'stockkeeper', 'accountant'].includes(store.role);
    const attributes = Object.entries(product.variantAttributes || {}).map(function (entry) { return `${entry[0]}: ${entry[1]}`; }).join(' · ');
    const productMain = `<span class='product-thumb ${product.tone || 'product-sage'}'>${esc(product.emoji || '📦')}</span><span class='product-mobile-info'><strong>${esc(product.name)}</strong><small>${esc(product.sku)} · ${esc(attributes || product.category)}</small></span><span class='product-mobile-side'><strong>${money(product.price)}</strong><small>${product.inventoryTracked ? (product.stock <= 0 ? 'Hết hàng' : `Còn ${number(product.stock)} ${esc(product.unit)}`) : 'Không theo dõi tồn'}</small></span>`;
    return `<article class='product-mobile-card'>${canEdit ? `<button class='product-mobile-main' data-action='edit-product' data-id='${product.id}' aria-label='Sửa ${esc(product.name)}'>${productMain}</button>` : `<div class='product-mobile-main'>${productMain}</div>`}${canViewPriceHistory ? `<button class='product-history-button' data-action='product-price-history' data-id='${product.id}' aria-label='Xem lịch sử giá ${esc(product.name)}' title='Lịch sử giá'>${icon('clock', 17)}</button>` : ''}</article>`;
  }

  function renderProducts() {
    const products = filteredProducts(searchTerms.products, 'Tất cả');
    const canEdit = ['owner', 'manager', 'stockkeeper'].includes(store.role);
    const showCost = store.role !== 'cashier';
    const empty = productLoading ? 'Đang tải danh mục…' : productError ? esc(productError) : searchTerms.products ? 'Không tìm thấy sản phẩm phù hợp.' : 'Thêm sản phẩm đầu tiên để bắt đầu quản lý danh mục.';
    return pageHeading('Sản phẩm', 'Quản lý mặt hàng, giá bán và số lượng hiện có.', (canEdit ? `<button class='btn btn-primary' data-action='new-product'><span class='btn-icon'>＋</span> Thêm sản phẩm</button><button class='btn btn-secondary' data-action='new-product-variant-group'>Tạo nhóm biến thể</button><button class='btn btn-secondary' data-action='import-products'>Nhập CSV</button><button class='btn btn-secondary' data-action='bulk-update-products'>Cập nhật CSV</button>` : '') + (canExportData() ? `<button class='btn btn-secondary' data-action='open-export'>Xuất CSV</button>` : '')) +
      `<div class='toolbar'><div class='toolbar-left'><div class='search-wrap'><span class='search-symbol'>⌕</span><input class='input' id='product-search' type='search' placeholder='Tìm tên hàng hoặc mã SKU…' value='${esc(searchTerms.products)}' aria-label='Tìm sản phẩm'></div><span class='result-count'>${productLoading ? 'Đang tải…' : `${number(productTotal)} sản phẩm`}</span></div></div><section class='panel'><div class='table-wrap desktop-table'><table class='data-table'><thead><tr><th>Sản phẩm</th><th>Danh mục</th><th class='text-right'>Giá bán</th>${showCost ? `<th class='text-right'>Giá vốn</th>` : ''}<th class='text-right'>Tồn kho</th><th>Trạng thái</th><th></th></tr></thead><tbody>${products.map(productRow).join('') || `<tr><td colspan='${showCost ? 7 : 6}'><div class='empty-state'><strong>${esc(empty)}</strong></div></td></tr>`}</tbody></table></div><div class='product-list-mobile'>${products.map(productMobileCard).join('') || `<div class='panel empty-state'><strong>${esc(empty)}</strong></div>`}</div><div class='pagination'><span>Hiển thị ${products.length} trên ${number(productTotal)} sản phẩm</span><span class='pagination-actions'>${productOffset > 0 ? `<button class='page-button' data-action='products-page' data-offset='${Math.max(0, productOffset - 100)}'>‹</button>` : ''}<span class='page-button current'>${Math.floor(productOffset / 100) + 1}</span>${productNextOffset !== null ? `<button class='page-button' data-action='products-page' data-offset='${productNextOffset}'>›</button>` : ''}</span></div></section>`;
  }

  function cartTotals() {
    const subtotal = cart.reduce(function (sum, item) { const product = productById(item.id); return sum + (product ? Math.round(product.price * item.qty) : 0); }, 0);
    const discount = Math.min(subtotal, Math.max(0, Number(cart.discount) || 0));
    return { subtotal: subtotal, discount: discount, total: subtotal - discount, count: cart.reduce(function (sum, item) { return sum + item.qty; }, 0) };
  }

  function cartPanel() {
    const totals = cartTotals();
    const customer = customerById(cartCustomerId);
    const pendingNote = checkoutPendingPayload ? `<div class='modal-note' style='margin:0 14px 10px'>Có đơn đang chờ xác nhận. <button class='link-button' data-action='retry-pending-sale'>Kiểm tra đơn →</button></div>` : '';
    const rows = cart.map(function (item) {
      const product = productById(item.id); if (!product) return '';
      return `<div class='cart-row'><div><div class='cart-item-name'>${esc(product.name)}</div><div class='cart-item-price'>${money(product.price)} / ${esc(product.unit)}</div></div><div class='qty-control'><button data-action='cart-qty' data-id='${product.id}' data-delta='-1' ${checkoutPendingPayload ? 'disabled' : ''} aria-label='Giảm'>−</button><button data-action='cart-qty-edit' data-id='${product.id}' ${checkoutPendingPayload ? 'disabled' : ''} aria-label='Sửa số lượng'>${number(item.qty)}</button><button data-action='cart-qty' data-id='${product.id}' data-delta='1' ${checkoutPendingPayload || (product.inventoryTracked && item.qty >= product.stock) ? 'disabled' : ''} aria-label='Tăng'>＋</button></div></div>`;
    }).join('');
    return `<section class='panel cart-panel'><div class='cart-heading'><h2>Đơn hàng mới</h2><span>${number(totals.count)} sản phẩm</span></div><div class='cart-customer'><button data-action='pick-customer' ${checkoutPendingPayload ? 'disabled' : ''}><span class='avatar' style='width:24px;height:24px;font-size:8px'>${customer ? initials(customer.name) : '+'}</span><span>${customer ? esc(customer.name) : 'Thêm khách hàng'}</span><strong>${customer ? esc(customer.phone) : '＋'}</strong></button></div>${pendingNote}<div class='cart-items'>${rows || `<div class='cart-empty'><div><span>🛍️</span>${checkoutPendingPayload ? 'Đơn đang chờ xác nhận.' : 'Chọn sản phẩm để bắt đầu đơn hàng'}</div></div>`}</div><div class='cart-totals'><div class='cart-total-line'><span>Tạm tính</span><strong>${money(totals.subtotal)}</strong></div><button class='cart-total-line' data-action='discount' ${checkoutPendingPayload ? 'disabled' : ''} style='border:0;background:transparent;padding:0;text-align:left'><span>Giảm giá <span style='color:#4a7b58'>＋</span></span><strong>${totals.discount ? '−' + money(totals.discount) : 'Thêm'}</strong></button><div class='cart-total-line total'><span>Khách cần trả</span><strong>${money(totals.total)}</strong></div></div><div class='cart-footer'><button class='btn btn-primary' data-action='checkout' ${cart.length || checkoutPendingPayload ? '' : 'disabled'}>${checkoutPendingPayload ? 'Kiểm tra đơn đang chờ' : 'Thanh toán'} <span style='margin-left:auto'>${money(checkoutPendingPayload ? checkoutPendingPayload.totalVnd : totals.total)} →</span></button><div class='cart-hint'>${checkoutPendingPayload ? 'Thử lại dùng đúng thông tin đã gửi trước đó.' : 'Có thể thêm khách hàng và giảm giá trước khi thu tiền'}</div></div></section>`;
  }

  function renderPOS() {
    const query = document.getElementById('pos-search') ? document.getElementById('pos-search').value : '';
    const sourceProducts = posSearchTerm ? posProducts : store.products;
    const products = filteredProducts(query, categoryFilter, sourceProducts).filter(function (product) { return !product.inventoryTracked || product.stock > 0; });
    const categories = ['Tất cả'].concat(Array.from(new Set(store.products.map(function (product) { return product.category; }))));
    const totals = cartTotals();
    const posWarehousePicker = warehouses.length > 1 ? `<label class='pos-warehouse-picker'><span>Xuất từ kho</span><div class='select-wrap'><select class='input' id='pos-warehouse' ${cart.length || checkoutPendingPayload ? 'disabled' : ''}>${warehouses.map(function (warehouse) { return `<option value='${esc(warehouse.id)}' ${warehouse.id === selectedWarehouseId ? 'selected' : ''}>${esc(warehouse.name)}</option>`; }).join('')}</select></div></label>` : '';
    return pageHeading('Bán hàng', 'Chọn sản phẩm, thêm vào đơn và thu tiền ngay tại quầy.', `${['owner', 'manager'].includes(store.role) ? `<button class='btn btn-secondary' data-action='manage-promotions'>Mã khuyến mãi</button>` : ''}<button class='btn btn-secondary' data-action='scan'>${icon('scan', 14)} Nhập mã</button><button class='btn btn-secondary hide-on-mobile' data-route='orders'>Đơn gần đây</button>`) +
      `<div class='pos-layout'><div><div class='pos-tools'><div class='search-wrap pos-search'><span class='search-symbol'>⌕</span><input class='input' id='pos-search' type='search' placeholder='Tìm sản phẩm hoặc SKU…' value='${esc(query)}' aria-label='Tìm sản phẩm'></div>${posWarehousePicker}<button class='btn btn-secondary' data-action='scan' aria-label='Nhập mã'>${icon('scan', 15)}</button></div><div class='category-scroll'>${categories.map(function (category) { return `<button class='pos-category ${categoryFilter === category ? 'active' : ''}' data-action='category' data-category='${esc(category)}'>${esc(category)}</button>`; }).join('')}</div><div class='pos-product-grid' id='pos-products'>${products.map(function (product) { return `<button class='pos-product' data-action='add-cart' data-id='${product.id}'><span class='product-thumb ${product.tone || 'product-sage'}'>${esc(product.emoji || '📦')}</span><span class='pos-stock'>${product.inventoryTracked ? `Còn ${number(product.stock)}` : 'Không theo dõi tồn'}</span><strong>${esc(product.name)}</strong><small>${esc(product.sku)}</small><span class='pos-price'>${money(product.price)}</span></button>`; }).join('') || `<div class='panel empty-state' style='grid-column:1/-1'><strong>Chưa có sản phẩm để bán</strong><span>Thêm sản phẩm hoặc nhập kho mặt hàng có theo dõi tồn.</span></div>`}</div></div>${cartPanel()}</div><div class='pos-mobile-cart'><button class='btn' data-action='open-cart'><span class='mobile-cart-count'>${number(totals.count)}</span><span>${totals.count ? 'Xem giỏ hàng' : 'Giỏ hàng đang trống'}</span><strong>${money(totals.total)}　→</strong></button></div><div class='drawer-cart' id='drawer-cart'>${cartPanel()}</div>`;
  }

  function orderRows(orders) {
    return orders.map(function (order) {
      return `<tr><td><button class='link-button order-ref' data-action='order-detail' data-id='${order.id}'>${esc(order.number)}</button></td><td>${order.customerName ? `<div class='customer-cell'><span class='avatar'>${esc(initials(order.customerName))}</span><span class='product-name-stack'><strong>${esc(order.customerName)}</strong><small>${esc(order.customerPhone)}</small></span></div>` : `<span class='muted'>Khách lẻ</span>`}</td><td>${humanDate(order.createdAt, true)}</td><td>${number(order.itemCount)} dòng</td><td class='text-right'>${money(order.total)}</td><td>${statusBadge(order.status)}</td><td class='text-right'><button class='row-action' data-action='order-detail' data-id='${order.id}'>›</button></td></tr>`;
    }).join('');
  }

  function filteredOrders() {
    return store.orders;
  }

  function renderOrders() {
    const orders = filteredOrders();
    return pageHeading('Đơn hàng', 'Theo dõi giao dịch, khoản đã thu và đơn còn phải thu.', `<button class='btn btn-primary' data-route='pos'><span class='btn-icon'>＋</span> Tạo đơn mới</button>${canExportData() ? `<button class='btn btn-secondary' data-action='open-export'>Xuất CSV</button>` : ''}`) +
      `<div class='toolbar'><div class='toolbar-left'><div class='search-wrap'><span class='search-symbol'>⌕</span><input class='input' id='order-search' type='search' placeholder='Tìm mã đơn, tên, điện thoại hoặc SKU…' value='${esc(searchTerms.orders)}' aria-label='Tìm đơn hàng hoặc SKU'></div></div><div class='toolbar-right'><div class='segmented'>${['Tất cả', 'Hoàn tất', 'Còn nợ', 'Trả một phần', 'Đã trả hàng'].map(function (status) { return `<button class='segment ${orderFilter === status ? 'active' : ''}' data-action='order-filter' data-filter='${status}'>${status}</button>`; }).join('')}</div></div></div><section class='panel'><div class='table-wrap'><table class='data-table'><thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Thời gian</th><th>Sản phẩm</th><th class='text-right'>Giá trị</th><th>Trạng thái</th><th></th></tr></thead><tbody>${orderRows(orders) || `<tr><td colspan='7'><div class='empty-state'><strong>${orderNextOffset === null && !orderOffset ? 'Chưa có đơn hàng' : 'Không tìm thấy đơn hàng'}</strong><span>Đơn bán mới sẽ xuất hiện ở đây.</span></div></td></tr>`}</tbody></table></div><div class='pagination'><span>Hiển thị ${orders.length} trên ${number(orderTotal)} đơn</span><span class='pagination-actions'>${orderOffset > 0 ? `<button class='page-button' data-action='orders-page' data-offset='${Math.max(0, orderOffset - 100)}'>‹</button>` : ''}<span class='page-button current'>${Math.floor(orderOffset / 100) + 1}</span>${orderNextOffset !== null ? `<button class='page-button' data-action='orders-page' data-offset='${orderNextOffset}'>›</button>` : ''}</span></div></section>`;
  }

  function customerRows(customers) {
    return customers.map(function (customer) {
      const tags = (customer.tags || []).slice(0, 3).map(function (tag) { return `<span class='customer-tag-chip'>${esc(tag.label)}</span>`; }).join('');
      const moreTags = customer.tags && customer.tags.length > 3 ? `<small class='customer-more-tags'>+${number(customer.tags.length - 3)}</small>` : '';
      return `<tr><td><div class='customer-cell'><span class='avatar'>${esc(initials(customer.name))}</span><span class='product-name-stack'><strong>${esc(customer.name)}</strong><small>${esc(customer.phone)}</small>${tags ? `<span class='customer-row-tags'>${tags}${moreTags}</span>` : ''}</span></div></td><td>${number(customer.orders)} đơn</td><td class='text-right'>${money(customer.totalSpent)}</td><td class='text-right'>${customer.debt ? `<span class='stock-number low'>${money(customer.debt)}</span>` : customer.credit ? `<span class='stock-number' style='color:#47835a'>Dư ${money(customer.credit)}</span>` : `<span class='muted'>—</span>`}</td><td class='text-right'><button class='row-action' data-action='customer-detail' data-id='${customer.id}'>›</button></td></tr>`;
    }).join('');
  }

  function renderCustomers() {
    const customers = store.customers;
    const canEdit = ['owner', 'manager', 'cashier', 'accountant'].includes(store.role);
    const canImport = ['owner', 'manager', 'accountant'].includes(store.role);
    const canManageSegments = ['owner', 'manager', 'accountant'].includes(store.role);
    const hasCustomerFilters = Boolean(searchTerms.customers || customerTagFilter || customerSegmentFilter || customerMinSpentVnd);
    const hasSavedCriteria = Boolean(customerTagFilter.trim() || customerSegmentFilter || customerMinSpentVnd !== '');
    const selectedSaved = selectedCustomerSavedSegment();
    const segmentOptions = [
      ['', 'Tất cả khách hàng'],
      ['no_purchase', 'Chưa từng mua'],
      ['repeat', 'Mua lại · từ 2 đơn'],
      ['owing', 'Còn công nợ'],
      ['inactive90', '90 ngày chưa mua'],
    ].map(([value, label]) => `<option value='${value}' ${customerSegmentFilter === value ? 'selected' : ''}>${label}</option>`).join('');
    const savedSegmentOptions = [`<option value=''>Bộ lọc đã lưu…</option>`].concat(customerSavedSegments.map(function (segment) {
      return `<option value='${esc(segment.id)}' ${selectedCustomerSavedSegmentId === segment.id ? 'selected' : ''}>${esc(segment.name)}</option>`;
    })).join('');
    return pageHeading('Khách hàng', 'Thông tin mua hàng, liên hệ và công nợ trên cùng một nơi.', (canImport ? `<button class='btn btn-secondary' data-action='import-customers'>Nhập CSV</button>` : '') + (canEdit ? `<button class='btn btn-primary' data-action='new-customer'><span class='btn-icon'>＋</span> Thêm khách hàng</button>` : '') + (canExportData() ? `<button class='btn btn-secondary' data-action='open-export'>Xuất CSV</button>` : '')) +
      `<div class='customer-saved-tools'><label class='customer-saved-select-wrap'><span>Bộ lọc đã lưu</span><select class='input' id='customer-saved-segment-select' aria-label='Chọn bộ lọc khách hàng đã lưu'>${savedSegmentOptions}</select></label>${canManageSegments ? `<button class='btn btn-secondary' data-action='save-customer-segment' ${hasSavedCriteria ? '' : 'disabled'}>${selectedSaved ? 'Cập nhật bộ lọc' : 'Lưu bộ lọc hiện tại'}</button>${selectedSaved ? `<button class='btn btn-secondary' data-action='delete-customer-segment' data-id='${esc(selectedSaved.id)}'>Xóa bộ lọc</button>` : ''}` : ''}<span class='customer-saved-hint'>Lưu cách lọc này để cửa hàng dùng lại.</span></div><div class='toolbar'><div class='toolbar-left customer-filters'><div class='search-wrap'><span class='search-symbol'>⌕</span><input class='input' id='customer-search' type='search' placeholder='Tìm tên hoặc số điện thoại…' value='${esc(searchTerms.customers)}' aria-label='Tìm khách hàng'></div><input class='input customer-tag-filter' id='customer-tag-filter' type='search' maxlength='32' placeholder='Lọc theo nhãn…' value='${esc(customerTagFilter)}' aria-label='Lọc khách hàng theo nhãn'/><select class='input customer-segment-filter' id='customer-segment-filter' aria-label='Phân khúc khách hàng'>${segmentOptions}</select><label class='customer-spend-filter'><span>Chi tiêu từ (VND)</span><input class='input customer-min-spent' id='customer-min-spent' type='number' min='0' max='9223372036854775807' step='1' inputmode='numeric' placeholder='Không giới hạn' value='${esc(customerMinSpentVnd)}' aria-describedby='customer-spend-error'/><small id='customer-spend-error' class='customer-spend-error' hidden></small></label><span class='result-count'>${number(customerTotal)} hồ sơ</span></div><p class='customer-filter-hint'>Phân khúc tính từ đơn chưa hủy, công nợ hiện tại và chi tiêu sau hoàn tiền.</p></div><section class='panel'><div class='table-wrap'><table class='data-table'><thead><tr><th>Khách hàng</th><th>Lượt mua</th><th class='text-right'>Tổng chi tiêu</th><th class='text-right'>Công nợ / dư</th><th></th></tr></thead><tbody>${customerRows(customers) || `<tr><td colspan='5'><div class='empty-state'><strong>${hasCustomerFilters ? 'Không tìm thấy khách hàng phù hợp' : 'Chưa có khách hàng'}</strong><span>${customerTagFilter ? `Không có khách hàng mang nhãn “${esc(customerTagFilter)}”.` : hasCustomerFilters ? 'Thử điều chỉnh từ khóa hoặc bộ lọc khách hàng.' : 'Thêm hồ sơ khách mới tại quầy hoặc từ đây.'}</span></div></td></tr>`}</tbody></table></div><div class='pagination'><span>Hiển thị ${customers.length} trên ${number(customerTotal)} khách</span><span class='pagination-actions'>${customerOffset > 0 ? `<button class='page-button' data-action='customers-page' data-offset='${Math.max(0, customerOffset - 100)}'>‹</button>` : ''}<span class='page-button current'>${Math.floor(customerOffset / 100) + 1}</span>${customerNextOffset !== null ? `<button class='page-button' data-action='customers-page' data-offset='${customerNextOffset}'>›</button>` : ''}</span></div></section>`;
  }

  function movementLabel(movement) {
    return movement.type === 'purchase_receipt' ? 'Nhập hàng' : movement.type === 'sale' ? 'Bán hàng' : movement.type === 'return' ? 'Trả hàng' : movement.type === 'reversal' ? 'Hoàn kho do hủy đơn' : movement.type === 'transfer_in' ? 'Nhận điều chuyển' : movement.type === 'transfer_out' ? 'Xuất điều chuyển' : movement.type === 'count' ? 'Kiểm kê' : 'Điều chỉnh';
  }

  function inventoryRows(products) {
    return products.map(function (product) {
      const movement = store.movements.find(function (item) { return item.productId === product.id; });
      return `<tr><td><div class='product-cell'><span class='product-thumb ${product.tone || 'product-sage'}'>📦</span><span class='product-name-stack'><strong>${esc(product.name)}</strong><small>${esc(product.sku)}</small></span></div></td><td>${esc(product.category)}</td><td class='text-right'><span class='stock-number ${product.stock <= 0 ? 'out' : product.stock <= product.minStock ? 'low' : ''}'>${number(product.stock)} ${esc(product.unit)}</span></td><td class='text-right'>${number(product.minStock)} ${esc(product.unit)}</td><td>${movement ? `<span class='product-name-stack'><strong>${movementLabel(movement)}</strong><small>${humanDate(movement.createdAt, true)} · ${esc(movement.reason)}</small></span>` : `<span class='muted'>Chưa có biến động</span>`}</td><td>${movement ? `<span class='stock-number ${movement.delta > 0 ? '' : 'low'}'>${movement.delta > 0 ? '+' : ''}${number(movement.delta)}</span>` : '—'}</td><td class='text-right'>${['owner', 'manager', 'stockkeeper'].includes(store.role) ? `<button class='row-action' data-action='adjust-stock' data-id='${product.id}' aria-label='Kiểm kê ${esc(product.name)}'>＋</button>` : ''}</td></tr>`;
    }).join('');
  }

  function renderInventory() {
    const products = store.products;
    const canCount = ['owner', 'manager', 'stockkeeper'].includes(store.role);
    const canReceive = ['owner', 'manager', 'stockkeeper', 'accountant'].includes(store.role);
    const canManageWarehouse = ['owner', 'manager'].includes(store.role);
    const warehouseOptions = warehouses.map(function (warehouse) { return `<option value='${esc(warehouse.id)}' ${warehouse.id === selectedWarehouseId ? 'selected' : ''}>${esc(warehouse.name)}${warehouse.is_default ? ' · Kho chính' : ''}</option>`; }).join('');
    const defaultWarehouseSelected = warehouses.some(function (warehouse) { return warehouse.id === selectedWarehouseId && warehouse.is_default; });
    return pageHeading('Kho hàng', 'Theo dõi tồn theo địa điểm, kiểm kê và điều chuyển hàng giữa các kho.', `${canManageWarehouse ? `<button class='btn btn-secondary' data-action='new-warehouse'>＋ Thêm kho</button>` : ''}${canCount ? `<button class='btn btn-secondary' data-action='adjust-stock-picker'>Kiểm kê</button><button class='btn btn-secondary' data-action='bulk-stock-count'>Kiểm kê CSV</button>` : ''}${canReceive ? `<button class='btn btn-primary' data-action='receive-stock'><span class='btn-icon'>＋</span> Nhập hàng</button>` : ''}${canExportData() ? `<button class='btn btn-secondary' data-action='open-export' aria-label='Xuất dữ liệu CSV'>CSV</button>` : ''}`) +
      `<div class='toolbar warehouse-toolbar'><div class='toolbar-left'><label class='input-label' for='inventory-warehouse'>Địa điểm tồn kho</label><div class='select-wrap'><select class='input' id='inventory-warehouse' aria-label='Chọn kho tồn kho'>${warehouseOptions}</select></div><span class='result-count'>${warehouseLoading ? 'Đang tải kho…' : warehouseError ? esc(warehouseError) : `${number(warehouses.length)} kho đang hoạt động`}</span></div><div class='toolbar-right'>${canManageWarehouse && !defaultWarehouseSelected ? `<button class='btn btn-secondary' data-action='archive-warehouse' data-id='${esc(selectedWarehouseId)}'>Lưu trữ kho</button>` : ''}${canCount && warehouses.length > 1 ? `<button class='btn btn-secondary' data-action='new-warehouse-transfer'>Điều chuyển kho</button>` : ''}</div></div>` +
      `<div class='stat-grid'><article class='stat-card'><div class='stat-top'><span class='stat-label'>Tổng mặt hàng</span><span class='stat-icon'>${icon('box', 15)}</span></div><div class='stat-value'>${number(inventorySummary.total)}</div><div class='stat-foot'>Sản phẩm đang theo dõi</div></article><article class='stat-card'><div class='stat-top'><span class='stat-label'>Tồn kho thấp</span><span class='stat-icon'>${icon('alert', 15)}</span></div><div class='stat-value'>${number(inventorySummary.low)}</div><div class='stat-foot'>Bằng hoặc dưới ngưỡng nhắc</div></article><article class='stat-card'><div class='stat-top'><span class='stat-label'>Hết hàng</span><span class='stat-icon'>${icon('layers', 15)}</span></div><div class='stat-value'>${number(inventorySummary.out)}</div><div class='stat-foot'>Cần bổ sung trước khi bán</div></article>${store.role !== 'cashier' ? `<article class='stat-card'><div class='stat-top'><span class='stat-label'>Giá trị tồn ước tính</span><span class='stat-icon'>${icon('wallet', 15)}</span></div><div class='stat-value' style='font-size:17px'>${money(inventorySummary.stockValueVnd)}</div><div class='stat-foot'>Theo giá vốn hiện tại</div></article>` : ''}</div>` +
      `<div class='toolbar'><div class='toolbar-left'><div class='search-wrap'><span class='search-symbol'>⌕</span><input class='input' id='inventory-search' type='search' placeholder='Tìm sản phẩm hoặc SKU…' value='${esc(searchTerms.inventory)}' aria-label='Tìm trong kho'></div><span class='result-count'>${inventoryLoading ? 'Đang tải…' : inventoryError ? esc(inventoryError) : `${number(inventoryTotal)} mặt hàng`}</span></div></div><section class='panel'><div class='panel-header'><div><h2>Tồn kho tại ${esc((warehouses.find(function (item) { return item.id === selectedWarehouseId; }) || {}).name || 'kho')}</h2><p>Cập nhật sau đơn bán, phiếu nhập và kiểm kê</p></div></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Sản phẩm</th><th>Danh mục</th><th class='text-right'>Tồn thực tế</th><th class='text-right'>Mức cảnh báo</th><th>Biến động gần nhất</th><th>Thay đổi</th><th></th></tr></thead><tbody>${inventoryRows(products) || `<tr><td colspan='7'><div class='empty-state'><strong>${inventoryLoading ? 'Đang tải tồn kho' : inventoryError ? 'Chưa tải được tồn kho' : 'Chưa có sản phẩm trong kho'}</strong><span>${esc(inventoryError || '')}</span></div></td></tr>`}</tbody></table></div><div class='pagination'><span>Hiển thị ${products.length} trên ${number(inventoryTotal)} mặt hàng</span><span class='pagination-actions'>${inventoryOffset > 0 ? `<button class='page-button' data-action='inventory-page' data-offset='${Math.max(0, inventoryOffset - 100)}'>‹</button>` : ''}<span class='page-button current'>${Math.floor(inventoryOffset / 100) + 1}</span>${inventoryNextOffset !== null ? `<button class='page-button' data-action='inventory-page' data-offset='${inventoryNextOffset}'>›</button>` : ''}</span></div></section>${store.role === 'cashier' ? '' : renderWarehouseTransfers()}`;
  }

  function transferStatusName(status) {
    return ({ draft: 'Phiếu nháp', in_transit: 'Đang vận chuyển', partially_received: 'Đã nhận một phần', received: 'Đã nhận đủ', cancelled: 'Đã hủy' })[status] || status;
  }

  function renderWarehouseTransfers() {
    const active = warehouseTransfers.filter(function (transfer) { return transfer.status !== 'received' && transfer.status !== 'cancelled'; });
    const history = warehouseTransfers.filter(function (transfer) { return transfer.status === 'received' || transfer.status === 'cancelled'; }).slice(0, 10);
    const rows = active.concat(history).map(function (transfer) {
      const lines = (transfer.lines || []).map(function (line) {
        return `${esc(line.productName)} · ${number(Number(line.quantityReceived))}/${number(Number(line.quantitySent))} ${esc(line.unit)}`;
      }).join('　 ·　');
      const pendingDispatch = readPendingWarehouseMutation('transfer-dispatch', transfer.id);
      const pendingReceipt = readPendingWarehouseMutation('transfer-receipt', transfer.id);
      const pendingCancel = readPendingWarehouseMutation('transfer-cancel', transfer.id);
      const actions = pendingDispatch
        ? `<button class='btn btn-primary' data-action='transfer-dispatch' data-id='${esc(transfer.id)}'>Thử lại xuất chuyển</button>`
        : pendingReceipt
          ? `<button class='btn btn-primary' data-action='transfer-receive' data-id='${esc(transfer.id)}'>Kiểm tra lần nhận</button>`
          : pendingCancel
            ? `<button class='btn btn-secondary' data-action='transfer-cancel' data-id='${esc(transfer.id)}'>Kiểm tra lệnh hủy</button>`
            : transfer.status === 'draft'
        ? `<button class='btn btn-secondary' data-action='transfer-dispatch' data-id='${esc(transfer.id)}'>Xuất chuyển</button><button class='link-button' data-action='transfer-cancel' data-id='${esc(transfer.id)}'>Hủy nháp</button>`
        : ['in_transit', 'partially_received'].includes(transfer.status)
          ? `<button class='btn btn-primary' data-action='transfer-receive' data-id='${esc(transfer.id)}'>Nhận hàng</button>`
          : '';
      return `<article class='warehouse-transfer-card'><div class='warehouse-transfer-main'><div><strong>${esc(transfer.transfer_number)}</strong><span class='badge ${transfer.status === 'received' ? 'badge-success' : transfer.status === 'cancelled' ? 'badge-neutral' : 'badge-warning'}'>${esc(transferStatusName(transfer.status))}</span></div><p>${esc(transfer.source_warehouse_name)} → ${esc(transfer.destination_warehouse_name)}</p><small>${lines || 'Không có dòng hàng'}${transfer.note ? ` · ${esc(transfer.note)}` : ''}</small></div><div class='warehouse-transfer-actions'>${actions}</div></article>`;
    }).join('');
    return `<section class='panel warehouse-transfers-panel'><div class='panel-header'><div><h2>Điều chuyển giữa các kho</h2><p>Hàng chỉ rời kho nguồn khi xuất chuyển và chỉ cộng vào kho nhận khi xác nhận nhận hàng.</p></div></div>${rows || `<div class='empty-state'><strong>Chưa có phiếu điều chuyển</strong><span>Tạo phiếu để chuyển hàng giữa các kho đang hoạt động.</span></div>`}</section>`;
  }

  function openNewWarehouse() {
    if (!['owner', 'manager'].includes(store.role)) return toast('Không có quyền', 'Chỉ chủ cửa hàng hoặc quản lý được thêm kho.', 'error');
    const pending = readPendingWarehouseMutation('warehouse-create', 'new');
    const disabled = pending ? 'disabled' : '';
    const form = `<form id='entity-form' data-form='warehouse-create'><div class='form-grid'><div class='form-field'><label class='input-label' for='warehouse-code'>Mã kho *</label><input class='input' id='warehouse-code' name='code' value='${esc(pending?.payload.code || '')}' maxlength='32' required autocomplete='off' placeholder='VD: CN-02' ${disabled}/></div><div class='form-field'><label class='input-label' for='warehouse-name'>Tên kho *</label><input class='input' id='warehouse-name' name='name' value='${esc(pending?.payload.name || '')}' maxlength='120' required placeholder='VD: Kho chi nhánh 2' ${disabled}/></div></div><div class='modal-note'>${pending ? 'Thao tác tạo kho đang chờ máy chủ. Gửi lại đúng dữ liệu để tránh tạo trùng.' : 'Sản phẩm đang theo dõi tồn sẽ được tạo số dư 0 tại kho mới. Tồn kho được ghi nhận riêng theo từng địa điểm.'}</div></form>`;
    showModal(pending ? 'Kiểm tra kho đang chờ' : 'Thêm kho hàng', 'Tạo địa điểm lưu trữ mới trong cửa hàng.', form, `<button class='btn btn-secondary' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại tạo kho' : 'Tạo kho'}</button>`);
  }

  function transferLineHtml(item, index, disabled) {
    const options = store.products.filter(function (product) { return product.inventoryTracked; }).map(function (product) {
      return `<option value='${esc(product.id)}' ${product.id === item.productId ? 'selected' : ''}>${esc(product.name)} · ${esc(product.sku)} · còn ${number(product.stock)}</option>`;
    }).join('');
    return `<article class='purchase-line-card' data-transfer-line data-index='${index}'><div class='purchase-line-head'><strong>Mặt hàng ${number(index + 1)}</strong>${!disabled && index > 0 ? `<button class='link-button' type='button' data-action='remove-transfer-line' data-index='${index}'>Xóa dòng</button>` : ''}</div><div class='form-grid'><div class='form-field full'><label class='input-label' for='transfer-product-${index}'>Sản phẩm *</label><div class='select-wrap'><select class='input' id='transfer-product-${index}' name='productId' required ${disabled ? 'disabled' : ''}>${options}</select></div></div><div class='form-field'><label class='input-label' for='transfer-quantity-${index}'>Số lượng chuyển *</label><input class='input' id='transfer-quantity-${index}' name='quantity' type='number' min='0.001' step='0.001' value='${esc(item.quantity || '1')}' required ${disabled ? 'disabled' : ''}/></div></div></article>`;
  }

  function openWarehouseTransfer() {
    if (!['owner', 'manager', 'stockkeeper'].includes(store.role)) return toast('Không có quyền', 'Vai trò của bạn không được điều chuyển tồn kho.', 'error');
    const active = warehouses.filter(function (warehouse) { return warehouse.status === 'active'; });
    if (active.length < 2) return toast('Cần thêm kho nhận', 'Tạo thêm một kho để bắt đầu điều chuyển hàng.', 'error');
    const pending = readPendingWarehouseMutation('transfer-create', 'new');
    const sourceId = pending?.payload.sourceWarehouseId || (active.some(function (warehouse) { return warehouse.id === selectedWarehouseId; }) ? selectedWarehouseId : active[0].id);
    const destinationId = pending?.payload.destinationWarehouseId || active.find(function (warehouse) { return warehouse.id !== sourceId; }).id;
    const disabled = pending ? 'disabled' : '';
    const options = function (chosenId) { return active.map(function (warehouse) { return `<option value='${esc(warehouse.id)}' ${warehouse.id === chosenId ? 'selected' : ''}>${esc(warehouse.name)}${warehouse.is_default ? ' · Kho chính' : ''}</option>`; }).join(''); };
    const product = store.products.find(function (item) { return item.inventoryTracked && item.stock > 0; }) || store.products.find(function (item) { return item.inventoryTracked; });
    const initialLines = pending?.payload.items || [{ productId: product?.id || '', quantity: '1' }];
    const form = `<form id='entity-form' data-form='warehouse-transfer-create'><div class='form-grid'><div class='form-field'><label class='input-label' for='transfer-source'>Kho xuất *</label><div class='select-wrap'><select class='input' id='transfer-source' name='sourceWarehouseId' required ${disabled}>${options(sourceId)}</select></div></div><div class='form-field'><label class='input-label' for='transfer-destination'>Kho nhận *</label><div class='select-wrap'><select class='input' id='transfer-destination' name='destinationWarehouseId' required ${disabled}>${options(destinationId)}</select></div></div><div class='form-field full'><div class='panel-header'><div><h2>Mặt hàng</h2><p>Số lượng sẽ được kiểm tra lại tại kho nguồn khi xuất.</p></div>${pending ? '' : `<button class='btn btn-secondary' type='button' data-action='add-transfer-line'>＋ Thêm dòng</button>`}</div><div id='warehouse-transfer-lines'>${initialLines.map(function (item, index) { return transferLineHtml(item, index, Boolean(pending)); }).join('')}</div></div><div class='form-field full'><label class='input-label' for='transfer-note'>Ghi chú</label><input class='input' id='transfer-note' name='note' value='${esc(pending?.payload.note || '')}' maxlength='500' placeholder='Lý do hoặc thông tin giao nhận' ${disabled}/></div></div>${pending ? `<div class='modal-note'>Phiếu điều chuyển đang chờ máy chủ xác nhận. Gửi lại đúng nội dung để tránh tạo trùng.</div>` : ''}</form>`;
    showModal(pending ? 'Kiểm tra phiếu điều chuyển đang chờ' : 'Tạo phiếu điều chuyển', 'Phiếu nháp chưa thay đổi tồn kho. Tồn kho nguồn giảm khi xuất.', form, `<button class='btn btn-secondary' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại lưu phiếu' : 'Lưu phiếu nháp'}</button>`, true);
  }

  function addTransferLine() {
    const form = modal.querySelector('[data-form="warehouse-transfer-create"]');
    if (!form) return;
    const lines = Array.from(form.querySelectorAll('[data-transfer-line]'));
    if (lines.length >= 100) return toast('Đã đạt giới hạn dòng hàng', 'Mỗi phiếu hỗ trợ tối đa 100 mặt hàng.', 'error');
    const productId = lines[0]?.querySelector('[name="productId"]')?.value || '';
    const choices = store.products.filter(function (item) { return item.inventoryTracked && item.id !== productId; });
    const next = choices[0] || store.products.find(function (item) { return item.inventoryTracked; });
    const container = form.querySelector('#warehouse-transfer-lines');
    if (container && next) container.insertAdjacentHTML('beforeend', transferLineHtml({ productId: next.id, quantity: '1' }, lines.length));
  }

  function removeTransferLine(index) {
    const form = modal.querySelector('[data-form="warehouse-transfer-create"]');
    const line = form?.querySelector(`[data-transfer-line][data-index="${index}"]`);
    if (form && form.querySelectorAll('[data-transfer-line]').length > 1 && line) line.remove();
  }

  function openTransferReceipt(transferId) {
    const transfer = warehouseTransfers.find(function (item) { return item.id === transferId; });
    const pending = readPendingWarehouseMutation('transfer-receipt', transferId);
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
      return `<article class='purchase-line-card' data-transfer-receipt-line data-id='${esc(item.line.id)}' ${pending ? '' : `data-max='${esc(max)}'`}><div class='purchase-line-head'><strong>${esc(item.line.productName)} <small>${esc(item.line.sku)}</small></strong><span>${pending ? `Lần trước đã xác nhận: ${number(Number(max))}` : `Còn chuyển ${number(Number(max))} ${esc(item.line.unit)}`}</span></div><div class='form-field'><label class='input-label' for='transfer-receive-${esc(item.line.id)}'>Số lượng nhận lần này</label><input class='input' id='transfer-receive-${esc(item.line.id)}' type='number' min='0' ${pending ? '' : `max='${esc(max)}'`} step='0.001' value='${esc(prior?.quantity ?? max)}' ${disabled}/></div></article>`;
    }).join('');
    const form = `<form id='entity-form' data-form='warehouse-transfer-receipt' data-id='${esc(transfer.id)}'><div class='form-grid'><div class='form-field full'><div class='purchase-order-receipt-lines'>${rows}</div></div><div class='form-field full'><label class='input-label' for='transfer-receive-note'>Ghi chú nhận hàng</label><input class='input' id='transfer-receive-note' name='note' value='${esc(pending?.payload.note || '')}' maxlength='500' ${disabled}/></div></div><div class='modal-note'>${pending ? 'Lần nhận đang chờ máy chủ. Gửi lại số lượng đã xác nhận để tránh cộng trùng.' : `Chỉ số lượng xác nhận mới được cộng vào kho ${esc(transfer.destination_warehouse_name)}. Lượng còn lại vẫn nằm trên phiếu đang vận chuyển.`}</div></form>`;
    showModal(pending ? `Kiểm tra lần nhận ${transfer.transfer_number}` : `Nhận điều chuyển ${transfer.transfer_number}`, `${transfer.source_warehouse_name} → ${transfer.destination_warehouse_name}`, form, `<button class='btn btn-secondary' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại lần nhận' : 'Xác nhận nhận hàng'}</button>`, true);
  }

  function openTransferCancel(transferId) {
    const transfer = warehouseTransfers.find(function (item) { return item.id === transferId; });
    const pending = readPendingWarehouseMutation('transfer-cancel', transferId);
    if (!transfer || (!pending && transfer.status !== 'draft')) return;
    const form = `<form id='entity-form' data-form='warehouse-transfer-cancel' data-id='${esc(transfer.id)}'><div class='form-field'><label class='input-label' for='transfer-cancel-reason'>Lý do hủy *</label><textarea class='input' id='transfer-cancel-reason' name='reason' required minlength='3' maxlength='500' ${pending ? 'disabled' : ''}>${esc(pending?.payload.reason || '')}</textarea></div>${pending ? `<div class='modal-note'>Lệnh hủy đang chờ máy chủ. Gửi lại đúng lý do để đối chiếu kết quả.</div>` : ''}</form>`;
    showModal(pending ? `Kiểm tra lệnh hủy ${transfer.transfer_number}` : `Hủy phiếu ${transfer.transfer_number}`, 'Chỉ phiếu nháp mới hủy được. Phiếu đã xuất phải được nhận đủ.', form, `<button class='btn btn-secondary' data-action='close-modal'>${pending ? 'Để sau' : 'Quay lại'}</button><button class='btn btn-danger' type='submit' form='entity-form'>${pending ? 'Thử lại lệnh hủy' : 'Xác nhận hủy'}</button>`);
  }

  function openArchiveWarehouse(warehouseId) {
    const warehouse = warehouses.find(function (item) { return item.id === warehouseId; });
    if (!warehouse || warehouse.is_default || !['owner', 'manager'].includes(store.role)) return;
    const pending = readPendingWarehouseMutation('warehouse-archive', warehouseId);
    const form = `<form id='entity-form' data-form='warehouse-archive' data-id='${esc(warehouse.id)}'><div class='modal-note'>Kho chỉ lưu trữ được khi không còn tồn hoặc hàng đang điều chuyển. Lịch sử cũ vẫn được giữ.</div><div class='form-field'><label class='input-label' for='warehouse-archive-reason'>Lý do lưu trữ *</label><textarea class='input' id='warehouse-archive-reason' name='reason' required minlength='3' maxlength='500' ${pending ? 'disabled' : ''}>${esc(pending?.payload.reason || '')}</textarea></div>${pending ? `<div class='modal-note'>Lệnh lưu trữ đang chờ máy chủ. Gửi lại đúng lý do để đối chiếu kết quả.</div>` : ''}</form>`;
    showModal(pending ? 'Kiểm tra lệnh lưu trữ đang chờ' : `Lưu trữ ${warehouse.name}`, 'Kho sẽ không còn nhận hàng, bán hàng hoặc điều chuyển mới.', form, `<button class='btn btn-secondary' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-danger' type='submit' form='entity-form'>${pending ? 'Thử lại lưu trữ' : 'Lưu trữ kho'}</button>`);
  }

  function readPendingWarehouseMutation(kind, entityId) {
    const legacyKey = `slink-pending-${kind}-v1:${store.id}:${entityId}`;
    return readPendingRecord(`warehouse-${kind}`, entityId, legacyKey, function (value) {
      return typeof value.key === 'string' && value.payload && typeof value.payload === 'object';
    });
  }

  async function sendWarehouseMutation(kind, entityId, path, payload, title) {
    const legacyKey = `slink-pending-${kind}-v1:${store.id}:${entityId}`;
    let pending = readPendingWarehouseMutation(kind, entityId);
    if (!pending) pending = { key: newIdempotencyKey(), payload };
    if (!savePendingRecord(`warehouse-${kind}`, entityId, pending, legacyKey)) return pendingSaveFailed();
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}${path}`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      removePendingRecord(`warehouse-${kind}`, entityId, legacyKey);
      await loadWarehouses();
      if (page === 'inventory') await loadInventoryPage(searchTerms.inventory, inventoryOffset);
      toast(title, result.transfer?.number || result.warehouse?.name || 'Đã cập nhật dữ liệu kho.');
      return result;
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra thao tác kho đang chờ.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        removePendingRecord(`warehouse-${kind}`, entityId, legacyKey);
        const pendingForm = modal.querySelector('form[data-form^="warehouse-"]');
        if (pendingForm) pendingForm.querySelectorAll('input,select,textarea,button').forEach(function (field) { field.disabled = false; });
      }
      toast('Chưa hoàn tất thao tác kho', error.message, 'error');
      return null;
    }
  }

  async function saveWarehouse(form) {
    const data = new FormData(form);
    const pending = readPendingWarehouseMutation('warehouse-create', 'new');
    const code = String(pending?.payload.code || data.get('code') || '').trim();
    const name = String(pending?.payload.name || data.get('name') || '').trim();
    if (!code || !name) return toast('Thiếu thông tin kho', 'Nhập mã kho và tên kho.', 'error');
    const submit = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    const result = await sendWarehouseMutation('warehouse-create', 'new', '/warehouses', { code, name }, 'Đã tạo kho');
    if (result) { closeModal(); selectedWarehouseId = result.warehouse.id; await loadInventoryPage('', 0); }
    else if (submit && submit.isConnected) submit.disabled = false;
  }

  async function saveWarehouseArchive(form) {
    const warehouseId = form.dataset.id;
    const pending = readPendingWarehouseMutation('warehouse-archive', warehouseId);
    const reason = String(pending?.payload.reason || new FormData(form).get('reason') || '').trim();
    if (reason.length < 3) return toast('Lý do quá ngắn', 'Nhập lý do lưu trữ từ 3 ký tự trở lên.', 'error');
    const submit = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    const result = await sendWarehouseMutation('warehouse-archive', warehouseId, `/warehouses/${encodeURIComponent(warehouseId)}/archive`, { reason }, 'Đã lưu trữ kho');
    if (result) closeModal();
    else if (submit && submit.isConnected) submit.disabled = false;
  }

  async function saveWarehouseTransfer(form) {
    const sourceWarehouseId = String(form.querySelector('#transfer-source')?.value || '');
    const destinationWarehouseId = String(form.querySelector('#transfer-destination')?.value || '');
    if (!sourceWarehouseId || !destinationWarehouseId || sourceWarehouseId === destinationWarehouseId) return toast('Chọn kho khác nhau', 'Kho xuất và kho nhận phải là hai địa điểm khác nhau.', 'error');
    const seen = new Set();
    const items = Array.from(form.querySelectorAll('[data-transfer-line]')).map(function (row) {
      return { productId: String(row.querySelector('[name="productId"]')?.value || ''), quantity: String(row.querySelector('[name="quantity"]')?.value || '') };
    });
    for (const item of items) {
      if (!item.productId || seen.has(item.productId)) return toast('Dòng hàng bị lặp', 'Mỗi sản phẩm chỉ được xuất hiện một lần trong phiếu.', 'error');
      seen.add(item.productId);
      if (!/^(0|[1-9]\d{0,9})(?:\.\d{1,3})?$/.test(item.quantity) || Number(item.quantity) <= 0) return toast('Số lượng chưa hợp lệ', 'Nhập số lượng lớn hơn 0, tối đa 3 chữ số thập phân.', 'error');
    }
    const payload = { sourceWarehouseId, destinationWarehouseId, items, note: String(form.querySelector('#transfer-note')?.value || '').trim() };
    const submit = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    const result = await sendWarehouseMutation('transfer-create', 'new', '/warehouse-transfers', payload, 'Đã tạo phiếu nháp');
    if (result) closeModal();
    else if (submit && submit.isConnected) submit.disabled = false;
  }

  async function dispatchWarehouseTransfer(transferId) {
    await sendWarehouseMutation('transfer-dispatch', transferId, `/warehouse-transfers/${encodeURIComponent(transferId)}/dispatch`, {}, 'Đã xuất điều chuyển');
  }

  async function saveWarehouseTransferReceipt(form) {
    const transferId = form.dataset.id;
    const pending = readPendingWarehouseMutation('transfer-receipt', transferId);
    const items = pending ? pending.payload.items : Array.from(form.querySelectorAll('[data-transfer-receipt-line]')).map(function (row) {
      return { transferLineId: row.dataset.id, quantity: String(row.querySelector('input')?.value || '0') };
    }).filter(function (item) { return Number(item.quantity) > 0; });
    if (!items.length) return toast('Chưa nhập số lượng nhận', 'Nhập ít nhất một số lượng lớn hơn 0 để ghi nhận chuyến nhận.', 'error');
    if (!pending) {
      for (const item of items) {
        const row = form.querySelector(`[data-transfer-receipt-line][data-id="${item.transferLineId}"]`);
        if (Number(item.quantity) > Number(row?.dataset.max)) return toast('Số lượng nhận vượt giới hạn', 'Không thể nhận nhiều hơn lượng còn đang vận chuyển.', 'error');
      }
    }
    const payload = pending ? pending.payload : { items, note: String(form.querySelector('#transfer-receive-note')?.value || '').trim() };
    const submit = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    const result = await sendWarehouseMutation('transfer-receipt', transferId, `/warehouse-transfers/${encodeURIComponent(transferId)}/receipts`, payload, 'Đã ghi nhận nhận hàng');
    if (result) closeModal();
    else if (submit && submit.isConnected) submit.disabled = false;
  }

  async function saveWarehouseTransferCancel(form) {
    const transferId = form.dataset.id;
    const pending = readPendingWarehouseMutation('transfer-cancel', transferId);
    const reason = String(pending?.payload.reason || new FormData(form).get('reason') || '').trim();
    if (reason.length < 3) return toast('Lý do quá ngắn', 'Nhập lý do hủy từ 3 ký tự trở lên.', 'error');
    const submit = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    const result = await sendWarehouseMutation('transfer-cancel', transferId, `/warehouse-transfers/${encodeURIComponent(transferId)}/cancel`, { reason }, 'Đã hủy phiếu nháp');
    if (result) closeModal();
    else if (submit && submit.isConnected) submit.disabled = false;
  }

  function cashRows(rows) {
    const labels = { cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', bank_qr: 'QR ngân hàng', card: 'Thẻ', other: 'Khác' };
    return rows.map(function (movement) {
      const sessionLabel = movement.cashSessionOpenedAt ? `Ca mở ${humanDate(movement.cashSessionOpenedAt, true)}` : movement.cashSessionId ? 'Ca tiền mặt' : 'Ngoài ca';
      return `<tr><td><span class='product-name-stack'><strong>${esc(movement.category)}</strong><small>${esc(movement.note || '')}</small></span></td><td>${humanDate(movement.createdAt, true)}</td><td><span class='product-name-stack'><strong>${esc(movement.actorName || 'Nhân viên')}</strong><small>${esc(sessionLabel)}</small></span></td><td>${esc(labels[movement.method] || movement.method)}</td><td class='text-right'><strong style='color:${movement.type === 'in' ? '#3c825a' : '#b26450'}'>${movement.type === 'in' ? '+' : '−'}${moneyVndText(movement.amountVnd)}</strong></td></tr>`;
    }).join('');
  }

  function renderFinance() {
    const isStockkeeper = store.role === 'stockkeeper';
    const canViewFullFinance = ['owner', 'manager', 'accountant'].includes(store.role);
    const canViewCashbook = canViewFullFinance || store.role === 'cashier';
    const canRecord = ['owner', 'manager', 'accountant'].includes(store.role);
    const canManageSuppliers = canRecord || isStockkeeper;
    const canReceivePurchases = ['owner', 'manager', 'accountant', 'stockkeeper'].includes(store.role);
    const cashSession = cashRegisterState.session;
    const recentClosed = Array.isArray(cashRegisterState.recentClosed) ? cashRegisterState.recentClosed : [];
    const canOperateCash = Boolean(cashRegisterState.canOperate);
    const canOpenCash = cashRegisterState.canOpen === true || (!cashSession && canOperateCash);
    const canCloseCash = cashRegisterState.canClose === true || (cashRegisterState.canClose === undefined && Boolean(cashSession && canOperateCash));
    let cashSessionPanel = '';
    if (!isStockkeeper) {
      let cashSessionContent = '';
      if (cashRegisterError) {
        cashSessionContent = `<div class='notice-item'><span>⚠️</span><span><strong>Chưa tải được trạng thái ca</strong><small>${esc(cashRegisterError)}</small></span></div>`;
      } else if (cashSession) {
        const closePermissionNote = canCloseCash ? 'Chốt ca sẽ ghi nhận tiền đếm thực tế; nếu lệch, cần nhập lý do và Slink sẽ ghi một bút toán điều chỉnh.' : store.role === 'cashier' ? 'Thu ngân chỉ có thể chốt ca do mình mở. Hãy nhờ người mở ca hoặc quản lý thực hiện.' : 'Vai trò của bạn chỉ xem được ca. Hãy nhờ người mở ca hoặc chủ cửa hàng/quản lý chốt.';
        cashSessionContent = `<div class='cash-session-summary'><div><small>Trạng thái</small><strong>Đang mở · ${esc(cashSession.openedByName || 'Nhân viên')}</strong></div><div><small>Tiền đầu ca</small><strong>${moneyVndText(cashSession.openingFloatVnd)}</strong></div><div><small>Thu bằng tiền mặt</small><strong>${moneyVndText(cashSession.cashInVnd)}</strong></div><div><small>Chi bằng tiền mặt</small><strong>${moneyVndText(cashSession.cashOutVnd)}</strong></div><div><small>Dự kiến trong quầy</small><strong>${moneyVndText(cashSession.expectedCashVnd)}</strong></div></div><div class='modal-note'>Mở lúc ${humanDate(cashSession.openedAt, true)}. ${closePermissionNote}</div>`;
      } else {
        const message = canOpenCash ? 'Mở ca và nhập tiền đầu ca trước khi ghi giao dịch tiền mặt.' : 'Nhân viên có quyền mở ca sẽ cần bắt đầu trước khi phát sinh giao dịch tiền mặt.';
        cashSessionContent = `<div class='empty-state' style='padding:18px'><strong>Chưa có ca tiền mặt đang mở</strong><span>${message}</span></div>`;
      }
      const cashSessionAction = cashSession && canCloseCash
        ? `<button class='btn btn-primary' data-action='close-cash-session'>Chốt ca</button>`
        : !cashSession && canOpenCash ? `<button class='btn btn-primary' data-action='open-cash-session'>Mở ca</button>` : '';
      const cashSessionHistory = cashRegisterError ? '' : `<section class='cash-session-history' aria-labelledby='cash-session-history-title'><div class='cash-session-history-heading'><div><h3 id='cash-session-history-title'>Lịch sử ca đã chốt</h3><p>10 ca gần nhất${store.role === 'cashier' ? ' của bạn' : ''}</p></div></div>${recentClosed.length ? `<div class='cash-session-history-list'>${recentClosed.map(function (item) {
        const variance = BigInt(String(item.varianceVnd || '0'));
        const varianceLabel = variance === 0n ? 'Khớp số tiền' : variance > 0n ? `Thừa ${moneyVndText(variance)}` : `Thiếu ${moneyVndText(-variance)}`;
        return `<article class='cash-session-history-card'><div class='cash-session-history-top'><div><strong>Chốt ${humanDate(item.closedAt, true)}</strong><small>Mở ${humanDate(item.openedAt, true)} · ${esc(item.openedByName || 'Nhân viên')} → ${esc(item.closedByName || 'Nhân viên')}</small></div><span class='cash-session-variance ${variance === 0n ? 'matched' : 'mismatch'}'>${esc(varianceLabel)}</span></div><div class='cash-session-history-summary'><div><small>Đầu ca</small><strong>${moneyVndText(item.openingFloatVnd)}</strong></div><div><small>Thu tiền mặt</small><strong>${moneyVndText(item.cashInVnd)}</strong></div><div><small>Chi tiền mặt</small><strong>${moneyVndText(item.cashOutVnd)}</strong></div><div><small>Dự kiến</small><strong>${moneyVndText(item.expectedCashVnd)}</strong></div><div><small>Đã đếm</small><strong>${moneyVndText(item.countedCashVnd)}</strong></div><div><small>Chênh lệch</small><strong>${moneyVndText(variance)}</strong></div></div>${item.closeNote ? `<p class='cash-session-history-note'><strong>Lý do:</strong> ${esc(item.closeNote)}</p>` : ''}</article>`;
      }).join('')}</div>` : `<div class='empty-state cash-session-history-empty'><strong>Chưa có ca nào được chốt</strong><span>Lịch sử đối soát sẽ xuất hiện sau khi chốt ca đầu tiên.</span></div>`}</section>`;
      cashSessionPanel = `<section class='panel' style='margin-bottom:14px'><div class='panel-header'><div><h2>Ca tiền mặt</h2><p>Đối soát số dư quầy, giao dịch tiền mặt và chênh lệch khi bàn giao.</p></div>${cashSessionAction}</div>${cashSessionContent}${cashSessionHistory}</section>`;
    }
    const actions = isStockkeeper
      ? `${canManageSuppliers ? `<button class='btn btn-secondary' data-action='new-supplier'>＋ Nhà cung cấp</button>` : ''}${canReceivePurchases ? `<button class='btn btn-secondary' data-action='new-purchase-order'>＋ Đặt hàng</button><button class='btn btn-primary' data-action='receive-stock'>＋ Nhập hàng</button>` : ''}`
      : `${canRecord ? `<button class='btn btn-primary' data-action='new-expense'><span class='btn-icon'>＋</span> Ghi phiếu thu / chi</button>` : ''}${canReceivePurchases ? `<button class='btn btn-secondary' data-action='new-purchase-order'>＋ Đặt hàng</button>` : ''}${canExportData() ? `<button class='btn btn-secondary' data-action='open-export'>Xuất CSV</button>` : ''}`;
    const heading = pageHeading(isStockkeeper ? 'Nhập hàng' : 'Thu chi & công nợ', isStockkeeper ? 'Quản lý nhà cung cấp và theo dõi các phiếu hàng đã nhận.' : store.role === 'cashier' ? 'Theo dõi giao dịch trong ca tiền mặt của bạn.' : 'Theo dõi tiền đã thu, đã chi và các khoản còn phải thu.', actions);
    const metrics = canViewFullFinance ? `<div class='stat-grid'><article class='stat-card'><div class='stat-label'>Đã thu hôm nay</div><div class='stat-value'>${moneyVndText(financeSummary.todayInVnd)}</div></article><article class='stat-card'><div class='stat-label'>Đã chi hôm nay</div><div class='stat-value'>${moneyVndText(financeSummary.todayOutVnd)}</div></article><article class='stat-card'><div class='stat-label'>Khách còn nợ</div><div class='stat-value'>${moneyVndText(financeSummary.customerDebtVnd)}</div><div class='stat-foot'>${number(financeSummary.customerDebtCount)} khách hàng</div></article><article class='stat-card'><div class='stat-label'>Nợ nhà cung cấp</div><div class='stat-value'>${moneyVndText(financeSummary.supplierPayableVnd)}</div></article></div>` : '';
    const cashbookPanel = canViewCashbook ? `<section class='panel'><div class='panel-header'><div><h2>Sổ thu chi</h2><p>${store.role === 'cashier' ? 'Giao dịch thuộc ca đang mở hoặc ca do bạn mở' : '100 giao dịch gần nhất'}</p></div></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Khoản mục</th><th>Thời gian</th><th>Người ghi nhận / ca</th><th>Phương thức</th><th class='text-right'>Số tiền</th></tr></thead><tbody>${cashRows(store.cashbook) || `<tr><td colspan='5'><div class='empty-state'><strong>${financeLoading ? 'Đang tải sổ thu chi' : 'Chưa có giao dịch'}</strong></div></td></tr>`}</tbody></table></div><div class='pagination'><span>Hiển thị ${store.cashbook.length} trên ${number(financeMovementTotal)} giao dịch</span></div></section>` : '';
    const customerPanel = canViewFullFinance ? `<section class='panel'><div class='panel-header'><h2>Khách hàng còn nợ</h2></div><div class='activity-list'>${financeTopCustomers.map(function (customer) { return `<div class='activity-item'><span class='avatar'>${esc(initials(customer.name))}</span><span class='activity-text'><strong>${esc(customer.name)}</strong><small>${esc(customer.phone)}</small></span><span class='activity-amount'>${moneyVndText(customer.debt)}</span></div>`; }).join('') || `<div class='empty-state'><strong>Không có công nợ khách hàng</strong></div>`}</div></section>` : '';
    const supplierPanel = store.role === 'cashier' ? '' : `<section class='panel'><div class='panel-header'><h2>Nhà cung cấp</h2><span>${canManageSuppliers ? `<button class='link-button' data-action='new-supplier'>＋ Thêm</button>` : ''}${canReceivePurchases ? `<button class='link-button' data-action='receive-stock'>＋ Nhập hàng</button>` : ''}</span></div><div class='activity-list'>${store.suppliers.map(function (supplier) { return `<div class='activity-item'><span class='activity-mark'>${icon('truck', 14)}</span><span class='activity-text'><strong>${esc(supplier.name)}</strong><small>${canViewFullFinance ? supplier.debt ? 'Còn phải trả' : 'Không còn nợ' : 'Dùng trong phiếu nhập hàng'}</small></span>${canViewFullFinance ? `<span class='activity-amount'>${money(supplier.debt)}</span>${canRecord && supplier.debt > 0 ? `<button class='link-button' data-action='supplier-payment' data-id='${supplier.id}'>Thanh toán</button>` : ''}` : ''}</div>`; }).join('') || `<div class='empty-state'><strong>Chưa có nhà cung cấp</strong><span>${isStockkeeper ? 'Tạo hồ sơ nhà cung cấp hoặc nhập hàng để bắt đầu.' : 'Nhập hàng để theo dõi công nợ.'}</span></div>`}</div></section>`;
    const sidePanels = [customerPanel, supplierPanel].filter(Boolean).join('');
    const layout = cashbookPanel || sidePanels ? `<div class='finance-layout'>${cashbookPanel}${sidePanels ? `<div class='stack'>${sidePanels}</div>` : ''}</div>` : '';
    return `${heading}${cashSessionPanel}${metrics}${financeError ? `<div class='notice-item'><span>⚠️</span><span><strong>Chưa tải đủ dữ liệu</strong><small>${esc(financeError)}</small></span></div>` : ''}${layout}`;
  }

  function purchaseHistoryPanel() {
    const rows = purchaseHistory.map(function (purchase) {
      return `<tr><td><button class='link-button order-ref' data-action='purchase-detail' data-id='${purchase.id}'>${esc(purchase.number)}</button>${purchase.purchaseOrderNumber ? `<small class='table-subtitle'>Đơn ${esc(purchase.purchaseOrderNumber)}</small>` : ''}</td><td>${esc(purchase.supplierName || 'Không chỉ định')}</td><td>${humanDate(purchase.receivedAt, true)}</td><td>${number(purchase.items.length)} dòng</td><td class='text-right'><strong>${money(purchase.total)}</strong></td></tr>`;
    }).join('');
    return `<section class='panel' style='margin-top:14px'><div class='panel-header'><div><h2>Phiếu nhập gần đây</h2><p>${purchaseHistory.length ? 'Tối đa 50 phiếu mới nhất' : 'Lịch sử nhận hàng của cửa hàng'}</p></div><button class='link-button' data-action='receive-stock'>＋ Nhập hàng</button></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Mã phiếu</th><th>Nhà cung cấp</th><th>Ngày nhận</th><th>Số dòng</th><th class='text-right'>Tổng tiền</th></tr></thead><tbody>${rows || `<tr><td colspan='5'><div class='empty-state'><strong>${financeLoading ? 'Đang tải phiếu nhập' : 'Chưa có phiếu nhập'}</strong><span>Phiếu nhập mới sẽ hiện ở đây.</span></div></td></tr>`}</tbody></table></div></section>`;
  }

  function purchaseOrderStatus(status) {
    return ({ draft: 'Bản nháp', ordered: 'Đã đặt hàng', partially_received: 'Đã nhận một phần', received: 'Đã nhận đủ', cancelled: 'Đã hủy' })[status] || status;
  }

  function purchaseOrderPanel() {
    const rows = purchaseOrders.map(function (order) {
      const received = order.items.reduce(function (sum, item) { return sum + (Number(item.quantityReceived) || 0); }, 0);
      const ordered = order.items.reduce(function (sum, item) { return sum + (Number(item.quantityOrdered) || 0); }, 0);
      const progress = ordered > 0 ? `${number(received)} / ${number(ordered)} đơn vị` : `${order.items.length} dòng hàng`;
      const pendingReceipt = loadPendingPurchaseOrderReceipt(order.id);
      const canReceive = ['ordered', 'partially_received'].includes(order.status);
      const canCancel = ['draft', 'ordered', 'partially_received'].includes(order.status);
      return `<article class='purchase-order-card'><div class='purchase-order-summary'><div><button class='link-button order-ref' data-action='purchase-order-detail' data-id='${order.id}'>${esc(order.number)}</button><small>${esc(order.supplierName)} · ${esc(order.warehouseName || 'Kho chính')} · ${humanDate(order.createdAt, true)}</small></div><span class='purchase-order-status status-${esc(order.status)}'>${esc(purchaseOrderStatus(order.status))}</span></div><div class='purchase-order-metrics'><span>${esc(progress)}</span><strong>${moneyVndText(order.totalVnd)}</strong></div><div class='purchase-order-actions'><button class='link-button' data-action='purchase-order-detail' data-id='${order.id}'>Chi tiết</button>${order.status === 'draft' ? `<button class='link-button' data-action='edit-purchase-order' data-id='${order.id}'>Sửa nháp</button><button class='link-button' data-action='place-purchase-order' data-id='${order.id}'>Đánh dấu đã gửi</button>` : ''}${pendingReceipt ? `<button class='link-button' data-action='receive-purchase-order' data-id='${order.id}'>Kiểm tra lần nhận</button>` : canReceive ? `<button class='link-button' data-action='receive-purchase-order' data-id='${order.id}'>Nhận hàng</button>` : ''}${canCancel ? `<button class='link-button danger-link' data-action='cancel-purchase-order' data-id='${order.id}'>Hủy đơn</button>` : ''}</div></article>`;
    }).join('');
    return `<section class='panel purchase-orders-panel' style='margin-top:14px'><div class='panel-header'><div><h2>Đơn đặt hàng</h2><p>Đơn nháp chưa cập nhật kho hoặc công nợ. Mỗi lần nhận sẽ tạo một phiếu nhập riêng.</p></div><button class='btn btn-secondary' data-action='new-purchase-order'>＋ Tạo đơn</button></div><div class='purchase-order-list'>${rows || `<div class='empty-state'><strong>${financeLoading ? 'Đang tải đơn đặt hàng' : 'Chưa có đơn đặt hàng'}</strong><span>Tạo đơn, đánh dấu đã gửi nhà cung cấp, rồi ghi nhận từng chuyến hàng về.</span></div>`}</div></section>`;
  }

  function renderPurchaseOrderLines(items, disabled) {
    return items.map(function (item, index) {
      const product = store.products.find(function (candidate) { return candidate.id === item.productId; });
      const selected = item.productId && !product ? `<option value='${esc(item.productId)}' selected>${esc(item.productName || 'Sản phẩm trong nháp')} · ${esc(item.sku || '')}</option>` : '';
      const options = store.products.map(function (candidate) {
        return `<option value='${candidate.id}' data-cost='${candidate.cost}' ${candidate.id === item.productId ? 'selected' : ''}>${esc(candidate.name)} · ${esc(candidate.sku)}</option>`;
      }).join('');
      return `<article class='purchase-line-card' data-order-line data-index='${index}'><div class='purchase-line-head'><strong>Mặt hàng ${number(index + 1)}</strong>${!disabled && items.length > 1 ? `<button class='link-button' type='button' data-action='remove-order-line' data-index='${index}'>Xóa dòng</button>` : ''}</div><div class='form-grid'><div class='form-field full'><label class='input-label' for='order-product-search-${index}'>Tìm sản phẩm</label><input class='input' id='order-product-search-${index}' data-order-search data-index='${index}' type='search' placeholder='Tên hoặc mã SKU…' ${disabled}/></div><div class='form-field full'><label class='input-label' for='order-product-${index}'>Sản phẩm *</label><div class='select-wrap'><select class='input' id='order-product-${index}' data-order-product required ${disabled}>${selected}${options}</select></div></div><div class='form-field'><label class='input-label' for='order-quantity-${index}'>Số lượng đặt *</label><input class='input' id='order-quantity-${index}' data-order-quantity type='number' min='0.001' step='0.001' value='${esc(item.quantity ?? '1')}' required ${disabled}/></div><div class='form-field'><label class='input-label' for='order-cost-${index}'>Giá dự kiến / đơn vị (VND) *</label><input class='input' id='order-cost-${index}' data-order-cost type='number' min='0' step='1' value='${esc(item.unitCostVnd ?? (product ? product.cost : ''))}' required ${disabled}/></div></div></article>`;
    }).join('');
  }

  function purchaseOrderItemsFromForm(form) {
    return Array.from(form.querySelectorAll('[data-order-line]')).map(function (row) {
      const product = row.querySelector('[data-order-product]');
      return { productId: String(product?.value || ''), productName: product?.selectedOptions[0]?.textContent || '', quantity: String(row.querySelector('[data-order-quantity]')?.value || ''), unitCostVnd: String(row.querySelector('[data-order-cost]')?.value || '') };
    });
  }

  function updatePurchaseOrderTotal(form) {
    const output = form && form.querySelector('#purchase-order-total');
    if (!output) return;
    let total = 0n;
    try {
      const seen = new Set();
      for (const item of purchaseOrderItemsFromForm(form)) {
        if (!item.productId || seen.has(item.productId)) throw new Error('incomplete');
        seen.add(item.productId);
        const quantity = /^(0|[1-9]\d{0,9})(?:\.(\d{1,3}))?$/.exec(item.quantity);
        if (!quantity || !/^(0|[1-9]\d{0,18})$/.test(item.unitCostVnd)) throw new Error('incomplete');
        const milli = BigInt(quantity[1]) * 1000n + BigInt((quantity[2] || '').padEnd(3, '0') || '0');
        if (milli <= 0n) throw new Error('incomplete');
        total += (BigInt(item.unitCostVnd) * milli + 500n) / 1000n;
        if (total > 9223372036854775807n) throw new Error('limit');
      }
      output.textContent = moneyVndText(total.toString());
    } catch (error) { output.textContent = error.message === 'limit' ? 'Vượt giới hạn lưu trữ' : 'Nhập đủ số lượng và giá'; }
  }

  function redrawPurchaseOrderLines(form, items) {
    const container = form.querySelector('#purchase-order-lines');
    if (container) container.innerHTML = renderPurchaseOrderLines(items, false);
    updatePurchaseOrderTotal(form);
  }

  function openPurchaseOrder(orderId) {
    if (!store.products.length) return toast('Chưa có sản phẩm để đặt', 'Hãy tạo sản phẩm trước khi lập đơn đặt hàng.');
    if (!store.suppliers.length) return toast('Chưa có nhà cung cấp', 'Tạo hồ sơ nhà cung cấp trước khi lập đơn đặt hàng.');
    const order = orderId ? purchaseOrders.find(function (item) { return item.id === orderId; }) : null;
    if (orderId && (!order || order.status !== 'draft')) return toast('Đơn không còn là bản nháp', 'Tải lại danh sách đơn trước khi sửa.', 'error');
    const pending = loadPendingPurchaseOrder(orderId || '');
    const suppliers = store.suppliers.map(function (supplier) { return `<option value='${supplier.id}' ${(pending?.payload.supplierId || order?.supplierId || store.suppliers[0].id) === supplier.id ? 'selected' : ''}>${esc(supplier.name)}</option>`; }).join('');
    const defaultWarehouseId = (warehouses.find(function (item) { return item.is_default; }) || {}).id || '';
    const orderWarehouseId = pending ? (pending.payload.warehouseId || defaultWarehouseId) : (order?.warehouseId || selectedWarehouseId || defaultWarehouseId);
    const warehouseOptions = warehouses.map(function (warehouse) { return `<option value='${esc(warehouse.id)}' ${warehouse.id === orderWarehouseId ? 'selected' : ''}>${esc(warehouse.name)}${warehouse.is_default ? ' · Kho chính' : ''}</option>`; }).join('');
    const initial = pending?.payload.items || (order ? order.items.map(function (item) { return { productId: item.productId, productName: item.productName, sku: item.sku, quantity: item.quantityOrdered, unitCostVnd: item.unitCostVnd }; }) : [{ productId: store.products[0].id, quantity: '1', unitCostVnd: String(store.products[0].cost) }]);
    const disabled = pending ? 'disabled' : '';
    const form = `<form id='entity-form' data-form='purchase-order' data-id='${order ? order.id : ''}' data-version='${order ? order.version : ''}'><div class='form-grid'><div class='form-field full'><label class='input-label' for='purchase-order-supplier'>Nhà cung cấp *</label><div class='select-wrap'><select class='input' id='purchase-order-supplier' name='supplierId' required ${disabled}>${suppliers}</select></div></div><div class='form-field full'><label class='input-label' for='purchase-order-warehouse'>Kho nhận hàng *</label><div class='select-wrap'><select class='input' id='purchase-order-warehouse' name='warehouseId' required ${disabled}>${warehouseOptions}</select></div></div><div class='form-field full'><div class='panel-header'><div><h2>Sản phẩm đặt</h2><p>Tối đa 50 sản phẩm khác nhau</p></div>${pending ? '' : `<button class='btn btn-secondary' type='button' data-action='add-order-line'>＋ Thêm mặt hàng</button>`}</div><div id='purchase-order-lines'>${renderPurchaseOrderLines(initial, Boolean(pending))}</div><div class='checkout-total' style='margin:12px 0 0'><span>Tổng giá trị dự kiến</span><strong id='purchase-order-total'>Đang tính…</strong></div></div><div class='form-field full'><label class='input-label' for='purchase-order-note'>Ghi chú</label><textarea class='input' id='purchase-order-note' name='note' maxlength='500' ${disabled}>${esc(pending?.payload.note ?? order?.note ?? '')}</textarea></div></div>${pending ? `<div class='modal-note'>Thao tác đang chờ máy chủ xác nhận. Gửi lại đúng nội dung để tránh tạo hoặc sửa lặp.</div>` : `<div class='modal-note'>Đơn nháp chưa làm tăng tồn kho hay công nợ. Khi nhận, hàng sẽ vào kho đã chọn và tạo phiếu nhập riêng.</div>`}</form>`;
    showModal(pending ? 'Kiểm tra đơn đặt hàng đang chờ' : order ? `Sửa đơn ${order.number}` : 'Tạo đơn đặt hàng', 'Lập kế hoạch nhập hàng với số lượng và giá dự kiến.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại lưu đơn' : 'Lưu bản nháp'}</button>`, true);
    updatePurchaseOrderTotal(modal.querySelector('[data-form="purchase-order"]'));
  }

  function openPurchaseOrderDetail(orderId) {
    const order = purchaseOrders.find(function (item) { return item.id === orderId; });
    if (!order) return;
    const rows = order.items.map(function (item) {
      return `<tr><td><span class='product-name-stack'><strong>${esc(item.productName)}</strong><small>${esc(item.sku)}</small></span></td><td>${number(Number(item.quantityReceived))} / ${number(Number(item.quantityOrdered))} ${esc(item.unit)}</td><td class='text-right'>${moneyVndText(item.unitCostVnd)}</td><td class='text-right'>${moneyVndText(item.totalVnd)}</td></tr>`;
    }).join('');
    const pendingReceipt = loadPendingPurchaseOrderReceipt(order.id);
    const orderActions = order.status === 'draft' ? `<button class='btn btn-secondary' data-action='edit-purchase-order' data-id='${order.id}'>Sửa nháp</button><button class='btn btn-primary' data-action='place-purchase-order' data-id='${order.id}'>Đánh dấu đã gửi</button>` : pendingReceipt || ['ordered', 'partially_received'].includes(order.status) ? `<button class='btn btn-primary' data-action='receive-purchase-order' data-id='${order.id}'>${pendingReceipt ? 'Kiểm tra lần nhận' : 'Nhận hàng'}</button>` : '';
    const body = `<div class='summary-banner'><div><strong>${esc(order.supplierName)}</strong><small>${esc(order.warehouseName || 'Kho chính')} · ${esc(purchaseOrderStatus(order.status))} · tạo ${humanDate(order.createdAt, true)}${order.orderedAt ? ` · gửi ${humanDate(order.orderedAt, true)}` : ''}</small></div><strong>${moneyVndText(order.totalVnd)}</strong></div><div class='table-wrap' style='margin-top:14px'><table class='data-table'><thead><tr><th>Sản phẩm</th><th>Đã nhận / Đặt</th><th class='text-right'>Giá dự kiến</th><th class='text-right'>Tổng dự kiến</th></tr></thead><tbody>${rows}</tbody></table></div>${order.note ? `<div class='modal-note'>${esc(order.note)}</div>` : ''}`;
    showModal(`Đơn đặt hàng ${order.number}`, 'Theo dõi số lượng đã nhận so với số lượng đặt.', body, `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button>${orderActions}`, true);
  }

  function openPurchaseOrderReceipt(orderId) {
    const order = purchaseOrders.find(function (item) { return item.id === orderId; });
    const pending = loadPendingPurchaseOrderReceipt(orderId);
    if (!order || (!pending && !['ordered', 'partially_received'].includes(order.status))) return toast('Đơn chưa thể nhận hàng', 'Chỉ đơn đã gửi và chưa nhận đủ mới có thể ghi nhận hàng về.', 'error');
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
      return `<article class='purchase-line-card' data-receipt-line data-id='${item.id}' data-cost='${esc(item.unitCostVnd)}'><div class='purchase-line-head'><strong>${esc(item.productName)} <small>${esc(item.sku)}</small></strong><span>${pending ? `Lần trước đã gửi ${number(Number(displayedQuantity))} ${esc(item.unit)}` : `Còn lại ${number(Number(maximum))} ${esc(item.unit)}`}</span></div><div class='form-field'><label class='input-label' for='receipt-quantity-${item.id}'>Số lượng chuyến này</label><input class='input' id='receipt-quantity-${item.id}' data-receipt-quantity type='number' min='0' ${pending ? `max='${esc(displayedQuantity)}'` : `max='${esc(maximum)}'`} step='0.001' value='${esc(displayedQuantity)}' ${pending ? 'disabled' : ''}/></div></article>`;
    }).join('');
    const canPay = ['owner', 'manager', 'accountant'].includes(store.role);
    const disabled = pending ? 'disabled' : '';
    const payload = pending?.payload || {};
    const form = `<form id='entity-form' data-form='purchase-order-receipt' data-id='${order.id}'><div class='form-grid'><div class='form-field full'><div class='purchase-order-receipt-lines'>${rows}</div><div class='checkout-total' style='margin:12px 0 0'><span>Giá trị chuyến nhận</span><strong id='purchase-order-receipt-total'>Đang tính…</strong></div></div>${canPay ? `<div class='form-field'><label class='input-label' for='receipt-paid'>Thanh toán lần này (VND)</label><input class='input' id='receipt-paid' name='paid' type='number' min='0' step='1' value='${esc(payload.amountPaidVnd ?? '0')}' ${disabled}/></div><div class='form-field'><label class='input-label' for='receipt-method'>Phương thức</label><div class='select-wrap'><select class='input' id='receipt-method' name='method' ${disabled}><option value='cash' ${!payload.method || payload.method === 'cash' ? 'selected' : ''}>Tiền mặt</option><option value='bank_transfer' ${payload.method === 'bank_transfer' ? 'selected' : ''}>Chuyển khoản</option><option value='bank_qr' ${payload.method === 'bank_qr' ? 'selected' : ''}>QR ngân hàng</option><option value='card' ${payload.method === 'card' ? 'selected' : ''}>Thẻ</option><option value='other' ${payload.method === 'other' ? 'selected' : ''}>Khác</option></select></div></div>` : ''}<div class='form-field full'><label class='input-label' for='receipt-note'>Ghi chú chuyến nhận</label><input class='input' id='receipt-note' name='note' maxlength='500' value='${esc(payload.note || '')}' ${disabled}/></div></div>${pending ? `<div class='modal-note'>Phiếu nhận đang chờ máy chủ xác nhận. Gửi lại cùng nội dung để tránh cộng tồn kho hai lần.</div>` : `<div class='modal-note'>Chỉ số lượng chuyến này được cộng kho và ghi công nợ. Số còn lại vẫn nằm trong đơn đặt hàng.</div>`}</form>`;
    showModal(pending ? `Kiểm tra lần nhận ${order.number}` : `Nhận hàng ${order.number}`, 'Có thể nhận một phần hoặc bỏ qua dòng chưa về.', form, `<button class='btn btn-secondary' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại nhận hàng' : 'Ghi nhận chuyến này'}</button>`, true);
    updatePurchaseOrderReceiptTotal(modal.querySelector('[data-form="purchase-order-receipt"]'));
  }

  function updatePurchaseOrderReceiptTotal(form) {
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
      output.textContent = total > 0n ? moneyVndText(total.toString()) : 'Chọn số lượng nhận';
    } catch (error) { output.textContent = error.message === 'limit' ? 'Vượt giới hạn lưu trữ' : 'Kiểm tra số lượng'; }
  }

  function openCancelPurchaseOrder(orderId) {
    const order = purchaseOrders.find(function (item) { return item.id === orderId; });
    if (!order || !['draft', 'ordered', 'partially_received'].includes(order.status)) return;
    const form = `<form id='entity-form' data-form='purchase-order-cancel' data-id='${order.id}'><div class='form-field'><label class='input-label' for='purchase-order-cancel-reason'>Lý do hủy *</label><textarea class='input' id='purchase-order-cancel-reason' name='reason' required minlength='3' maxlength='500'></textarea></div>${order.status === 'partially_received' ? `<div class='modal-note'>Các phiếu đã nhận vẫn được giữ nguyên; chỉ phần chưa nhận còn lại bị đóng.</div>` : ''}</form>`;
    showModal(`Hủy đơn ${order.number}`, 'Ghi lý do để lưu lịch sử thay đổi.', form, `<button class='btn btn-secondary' data-action='close-modal'>Quay lại</button><button class='btn btn-danger' type='submit' form='entity-form'>Xác nhận hủy</button>`);
  }

  function addPurchaseOrderLine() {
    const form = modal.querySelector('[data-form="purchase-order"]');
    if (!form) return;
    const items = purchaseOrderItemsFromForm(form);
    if (items.length >= 50) return toast('Đã đạt giới hạn dòng hàng', 'Mỗi đơn hỗ trợ tối đa 50 mặt hàng.', 'error');
    const existing = new Set(items.map(function (item) { return item.productId; }));
    const next = store.products.find(function (product) { return !existing.has(product.id); }) || store.products[0];
    items.push({ productId: next ? next.id : '', quantity: '1', unitCostVnd: next ? String(next.cost) : '' });
    redrawPurchaseOrderLines(form, items);
  }

  function removePurchaseOrderLine(index) {
    const form = modal.querySelector('[data-form="purchase-order"]');
    if (!form) return;
    const items = purchaseOrderItemsFromForm(form);
    if (items.length <= 1) return;
    items.splice(index, 1);
    redrawPurchaseOrderLines(form, items);
  }

  async function savePurchaseOrder(form) {
    const orderId = form.dataset.id || '';
    let pending = loadPendingPurchaseOrder(orderId);
    if (!pending) {
      const data = new FormData(form);
      const items = purchaseOrderItemsFromForm(form);
      if (!items.length || items.length > 50) return toast('Đơn chưa hợp lệ', 'Đơn cần từ 1 đến 50 dòng hàng.', 'error');
      const seen = new Set();
      const normalized = [];
      for (const item of items) {
        if (!item.productId || seen.has(item.productId)) return toast('Sản phẩm bị thiếu hoặc lặp', 'Mỗi sản phẩm chỉ xuất hiện một lần trong đơn.', 'error');
        seen.add(item.productId);
        if (!/^(0|[1-9]\d{0,9})(?:\.\d{1,3})?$/.test(item.quantity) || Number(item.quantity) <= 0) return toast('Số lượng không hợp lệ', 'Số lượng phải lớn hơn 0, tối đa 3 chữ số thập phân.', 'error');
        if (!/^(0|[1-9]\d{0,18})$/.test(item.unitCostVnd)) return toast('Giá nhập không hợp lệ', 'Giá dự kiến phải là VND nguyên không âm.', 'error');
        normalized.push({ productId: item.productId, quantity: item.quantity, unitCostVnd: item.unitCostVnd });
      }
      const supplierId = String(data.get('supplierId') || '');
      if (!supplierId) return toast('Chưa chọn nhà cung cấp', 'Chọn nhà cung cấp trước khi lưu đơn.', 'error');
      const warehouseId = String(data.get('warehouseId') || '');
      if (!warehouseId) return toast('Chưa chọn kho nhận', 'Chọn kho sẽ nhận hàng của đơn đặt.', 'error');
      pending = { orderId, version: Number(form.dataset.version) || null, key: newIdempotencyKey(), payload: { supplierId: supplierId, warehouseId: warehouseId, items: normalized, note: String(data.get('note') || '').trim() } };
    }
    if (!savePendingPurchaseOrder(pending)) return pendingSaveFailed();
    form.querySelectorAll('input,select,textarea,button').forEach(function (field) { field.disabled = true; });
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const path = `/api/stores/${encodeURIComponent(store.id)}/purchase-orders${pending.orderId ? `/${encodeURIComponent(pending.orderId)}` : ''}`;
      const payload = pending.orderId ? { ...pending.payload, version: pending.version } : pending.payload;
      const result = await apiRequest(path, { method: pending.orderId ? 'PUT' : 'POST', headers: { 'idempotency-key': pending.key }, body: payload });
      clearPendingPurchaseOrder(pending.orderId || '');
      closeModal();
      await loadFinancePage();
      render();
      toast(pending.orderId ? 'Đã cập nhật đơn đặt hàng' : 'Đã tạo bản nháp', `${result.purchaseOrder.number || ''} · ${moneyVndText(result.purchaseOrder.totalVnd || '0')}`);
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra đơn đặt hàng đang chờ.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingPurchaseOrder(pending.orderId || '');
        form.querySelectorAll('input,select,textarea,button').forEach(function (field) { field.disabled = false; });
      }
      toast('Chưa lưu được đơn đặt hàng', error.message, 'error');
      if (submitButton && !modal.hidden) submitButton.disabled = false;
    }
  }

  function pendingPurchaseOrderAction(orderId, action, reason) {
    const legacyKey = 'slink-pending-purchase-order-action-v1:' + orderId;
    let pending = readPendingRecord('purchase-order-action', orderId, legacyKey, function (value) {
      return value.orderId === orderId && typeof value.key === 'string' && value.payload;
    });
    if (pending && (pending.action !== action || (action === 'cancel' && pending.payload.reason !== reason))) {
      throw new Error('Một thao tác khác trên đơn này đang chờ xác nhận. Hãy tải lại dữ liệu trước khi thực hiện tiếp.');
    }
    if (!pending) pending = { orderId, action, key: newIdempotencyKey(), payload: action === 'cancel' ? { reason } : {} };
    if (!savePendingRecord('purchase-order-action', orderId, pending, legacyKey)) throw new Error('Không lưu được mã thử lại trên thiết bị. Hãy kiểm tra dung lượng lưu trữ rồi thử lại.');
    return { pending, legacyKey };
  }

  async function submitPurchaseOrderAction(orderId, action, reason) {
    let record;
    try { record = pendingPurchaseOrderAction(orderId, action, reason); }
    catch (error) { toast('Chưa thể cập nhật đơn', error.message, 'error'); return; }
    const legacyKey = record.legacyKey;
    const pending = record.pending;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/purchase-orders/${encodeURIComponent(orderId)}/${action}`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      removePendingRecord('purchase-order-action', orderId, legacyKey);
      closeModal();
      await loadFinancePage();
      render();
      toast(action === 'place' ? 'Đơn đã được đánh dấu đã gửi' : 'Đã hủy đơn đặt hàng', result.purchaseOrder.number || '');
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra thao tác đang chờ.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) removePendingRecord('purchase-order-action', orderId, legacyKey);
      toast('Chưa cập nhật được đơn', error.message, 'error');
    }
  }

  function placePurchaseOrder(orderId) {
    const order = purchaseOrders.find(function (item) { return item.id === orderId; });
    if (!order || order.status !== 'draft') return;
    if (!window.confirm(`Xác nhận đã gửi đơn ${order.number} cho ${order.supplierName}? Slink chỉ ghi trạng thái; việc gửi cho nhà cung cấp vẫn do cửa hàng thực hiện.`)) return;
    submitPurchaseOrderAction(orderId, 'place', '');
  }

  async function cancelPurchaseOrder(form) {
    const orderId = form.dataset.id;
    const reason = String(new FormData(form).get('reason') || '').trim();
    if (reason.length < 3 || reason.length > 500) return toast('Lý do hủy chưa hợp lệ', 'Nhập lý do từ 3 đến 500 ký tự.', 'error');
    await submitPurchaseOrderAction(orderId, 'cancel', reason);
  }

  async function receivePurchaseOrder(form) {
    const orderId = form.dataset.id;
    let pending = loadPendingPurchaseOrderReceipt(orderId);
    if (!pending) {
      const items = [];
      for (const row of form.querySelectorAll('[data-receipt-line]')) {
        const quantity = String(row.querySelector('[data-receipt-quantity]')?.value || '').trim();
        if (!quantity || quantity === '0') continue;
        if (!/^(0|[1-9]\d{0,9})(?:\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0) return toast('Số lượng nhận không hợp lệ', 'Nhập số lượng lớn hơn 0, tối đa 3 chữ số thập phân.', 'error');
        const max = String(row.querySelector('[data-receipt-quantity]')?.max || '0');
        const milli = function (value) { const parts = value.split('.'); return BigInt(parts[0]) * 1000n + BigInt((parts[1] || '').padEnd(3, '0')); };
        if (milli(quantity) > milli(max)) return toast('Số nhận vượt số còn lại', 'Giảm số lượng theo phần chưa nhận của đơn.', 'error');
        items.push({ purchaseOrderLineId: row.dataset.id, quantity });
      }
      if (!items.length) return toast('Chưa nhập số lượng nhận', 'Nhập ít nhất một dòng hàng trong chuyến này.', 'error');
      const data = new FormData(form);
      const amountPaidVnd = String(data.get('paid') || '0').trim() || '0';
      if (!/^(0|[1-9]\d{0,18})$/.test(amountPaidVnd)) return toast('Số tiền thanh toán không hợp lệ', 'Nhập VND nguyên không âm.', 'error');
      pending = { orderId, key: newIdempotencyKey(), payload: { items, amountPaidVnd, method: String(data.get('method') || 'cash'), note: String(data.get('note') || '').trim() } };
    }
    if (!savePendingPurchaseOrderReceipt(pending)) return pendingSaveFailed();
    form.querySelectorAll('input,select,button').forEach(function (field) { field.disabled = true; });
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/purchase-orders/${encodeURIComponent(orderId)}/receipts`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      clearPendingPurchaseOrderReceipt(orderId);
      closeModal();
      await loadFinancePage();
      await loadInventoryPage(searchTerms.inventory, inventoryOffset);
      await loadProductsPage(searchTerms.products, productOffset);
      render();
      toast('Đã ghi nhận chuyến hàng', `${result.purchase.number} · ${result.purchaseOrder.number} · ${moneyVndText(result.purchase.totalVnd)}`);
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra chuyến nhận đang chờ.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingPurchaseOrderReceipt(orderId);
        form.querySelectorAll('input,select,button').forEach(function (field) { field.disabled = false; });
      }
      toast('Chưa hoàn tất được chuyến nhận', error.message, 'error');
      if (submitButton && !modal.hidden) submitButton.disabled = false;
    }
  }

  function openPurchaseDetail(id) {
    const purchase = purchaseHistory.find(function (item) { return item.id === id; });
    if (!purchase) return;
    const rows = purchase.items.map(function (item) {
      return `<tr><td><span class='product-name-stack'><strong>${esc(item.productName)}</strong><small>${esc(item.sku)}</small></span></td><td>${number(Number(item.quantity))} ${esc(item.unit)}</td><td class='text-right'>${money(Number(item.unitCostVnd))}</td><td class='text-right'><strong>${money(Number(item.totalVnd))}</strong></td></tr>`;
    }).join('');
    const body = `<div class='summary-banner'><div><strong>${esc(purchase.supplierName || 'Không chỉ định nhà cung cấp')}</strong><small>${humanDate(purchase.receivedAt, true)} · ${esc(purchase.status === 'received' ? 'Đã nhận hàng' : purchase.status)}${purchase.purchaseOrderNumber ? ` · đơn ${esc(purchase.purchaseOrderNumber)}` : ''}</small></div><strong>${money(purchase.total)}</strong></div><div class='table-wrap' style='margin-top:14px'><table class='data-table'><thead><tr><th>Sản phẩm</th><th>Số lượng</th><th class='text-right'>Giá nhập</th><th class='text-right'>Thành tiền</th></tr></thead><tbody>${rows}</tbody></table></div>${purchase.note ? `<div class='modal-note'>${esc(purchase.note)}</div>` : ''}`;
    showModal(`Phiếu nhập ${purchase.number}`, 'Chi tiết hàng đã nhận và giá nhập được ghi vào sổ.', body, `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button>`, true);
  }

  function renderSettings() {
    const canEdit = ['owner', 'manager'].includes(store.role);
    const disabled = canEdit ? '' : 'disabled';
    return pageHeading('Cài đặt cửa hàng', 'Thông tin này xuất hiện trên khu vực quản lý và biên nhận bán hàng.', '') +
      `<section class='panel settings-panel'><h2>Thông tin cửa hàng</h2><p>Tên cửa hàng, số điện thoại, địa chỉ và lời chào trên biên nhận.</p><form id='entity-form' data-form='settings' data-version='${store.settings.version || 1}'><div class='form-grid'><div class='form-field full'><label class='input-label' for='setting-store-name'>Tên cửa hàng *</label><input class='input' id='setting-store-name' name='storeName' value='${esc(store.settings.storeName)}' required minlength='2' maxlength='160' ${disabled}/></div><div class='form-field'><label class='input-label' for='setting-phone'>Số điện thoại</label><input class='input' id='setting-phone' name='phone' value='${esc(store.settings.phone)}' inputmode='tel' maxlength='40' ${disabled}/></div><div class='form-field full'><label class='input-label' for='setting-address'>Địa chỉ</label><input class='input' id='setting-address' name='address' value='${esc(store.settings.address)}' maxlength='300' ${disabled}/></div><div class='form-field full'><label class='input-label' for='setting-footer'>Lời chào cuối biên nhận</label><input class='input' id='setting-footer' name='receiptFooter' value='${esc(store.settings.receiptFooter)}' maxlength='240' placeholder='Cảm ơn quý khách' ${disabled}/></div></div>${canEdit ? `<div class='modal-footer' style='padding:17px 0 0;margin-top:12px'><button class='btn btn-primary' type='submit'>Lưu thay đổi</button></div>` : `<div class='install-hint'>Chỉ chủ cửa hàng và quản lý mới được sửa thông tin.</div>`}</form><div class='install-hint' style='margin-top:18px'>Cài đặt này được lưu cùng dữ liệu cửa hàng và dùng trên các thiết bị đã đăng nhập. Sao lưu và khôi phục cần quy trình máy chủ riêng.</div></section>${renderAccountSecurity()}${canAccessRoute('audit') ? `<section class='panel settings-panel'><div class='panel-header'><div><h2>Nhật ký hoạt động</h2><p>Xem các thao tác nghiệp vụ đã được ghi nhận, người thực hiện và lý do.</p></div><button class='btn btn-secondary' data-route='audit'>Mở nhật ký</button></div></section>` : ''}`;
  }

  function securityEventLabel(type) {
    return ({
      login_succeeded: 'Đăng nhập thành công',
      login_failed: 'Đăng nhập không thành công',
      email_verified: 'Xác nhận email',
      logout: 'Đăng xuất',
      password_changed: 'Đổi mật khẩu',
      session_revoked: 'Đăng xuất phiên từ xa',
    })[type] || 'Hoạt động bảo mật';
  }

  function renderAccountSecurity() {
    const sessionRows = accountSecurityState.sessions.map(function (session) {
      return `<div class='security-session-row'><span><strong>${session.current ? 'Thiết bị hiện tại' : 'Phiên đang đăng nhập'}</strong><small>Đăng nhập ${humanDate(session.createdAt, true)} · Hết hạn ${humanDate(session.expiresAt, true)}</small></span>${session.current ? `<span class='badge badge-success'><i class='badge-dot'></i>Đang dùng</span>` : `<button class='btn btn-secondary' data-action='revoke-session' data-id='${esc(session.id)}'>Đăng xuất thiết bị</button>`}</div>`;
    }).join('');
    const eventRows = accountSecurityState.events.map(function (item) {
      return `<tr><td>${humanDate(item.occurredAt, true)}</td><td>${esc(securityEventLabel(item.type))}</td></tr>`;
    }).join('');
    return `<section class='panel settings-panel account-security-panel'><div class='panel-header'><div><h2>Bảo mật tài khoản</h2><p>Quản lý các phiên đăng nhập và xem hoạt động bảo mật gần đây của chính tài khoản này.</p></div><button class='link-button' data-action='reload-security'>Tải lại</button></div>${accountSecurityState.loading ? `<div class='install-hint' role='status' aria-live='polite'>Đang tải phiên đăng nhập…</div>` : ''}${accountSecurityState.error ? `<div class='auth-message error' role='alert'>${esc(accountSecurityState.error)}</div>` : ''}<div class='security-session-list'>${sessionRows || `<div class='empty-state'><strong>${accountSecurityState.loading ? 'Đang tải phiên đăng nhập…' : 'Không có phiên đang hoạt động'}</strong></div>`}</div><div class='security-events-heading'><h3>Lịch sử bảo mật</h3><span>Tối đa 50 hoạt động gần đây</span></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Thời gian</th><th>Hoạt động</th></tr></thead><tbody>${eventRows || `<tr><td colspan='2'><div class='empty-state'><strong>${accountSecurityState.loading ? 'Đang tải lịch sử…' : 'Chưa có hoạt động bảo mật'}</strong></div></td></tr>`}</tbody></table></div><p class='security-privacy-note'>Slink không hiển thị mật khẩu, mã phiên, địa chỉ IP hoặc vị trí trong màn hình này.</p></section>`;
  }
  function auditActionLabel(action) {
    const labels = {
      'sale.created': 'Tạo đơn bán', 'sale.voided': 'Hủy đơn chưa thanh toán', 'order.payment_recorded': 'Ghi nhận thanh toán',
      'return.created': 'Trả hàng / hoàn tiền', 'purchase.received': 'Nhận hàng nhập kho', 'inventory.adjusted': 'Điều chỉnh tồn kho',
      'purchase_order.created': 'Tạo đơn đặt hàng', 'purchase_order.updated': 'Sửa đơn đặt hàng', 'purchase_order.placed': 'Xác nhận đã gửi đơn',
      'purchase_order.cancelled': 'Hủy đơn đặt hàng', 'purchase_order.receipt_recorded': 'Nhận một chuyến hàng',
      'product.created': 'Tạo sản phẩm', 'product.updated': 'Cập nhật sản phẩm', 'products.imported': 'Nhập danh mục CSV',
      'product.bulk_updated': 'Cập nhật danh mục hàng loạt', 'product.archived': 'Ngừng kinh doanh sản phẩm',
      'customer.created': 'Tạo khách hàng', 'customer.updated': 'Cập nhật khách hàng', 'customer.archived': 'Lưu trữ khách hàng',
      'customer.opening_balance_recorded': 'Ghi nhận công nợ đầu kỳ', 'customer.payment_recorded': 'Thu công nợ khách hàng', 'supplier.created': 'Tạo nhà cung cấp',
      'supplier.opening_balance_recorded': 'Ghi nhận phải trả đầu kỳ', 'supplier.payment_recorded': 'Thanh toán nhà cung cấp',
      'channel.profile_created': 'Khai báo gian hàng bán', 'channel.profile_updated': 'Cập nhật tên gian hàng', 'channel.profile_archived': 'Lưu trữ gian hàng',
      'channel.mapping_created': 'Tạo ánh xạ SKU thủ công', 'channel.mapping_updated': 'Cập nhật ánh xạ SKU', 'channel.mapping_archived': 'Lưu trữ ánh xạ SKU',
      'order.note_added': 'Thêm ghi chú nội bộ', 'order.tag_added': 'Gắn nhãn đơn hàng', 'order.tag_removed': 'Gỡ nhãn đơn hàng',
      'staff.invited': 'Mời nhân viên', 'staff.joined': 'Nhân viên tham gia', 'staff.access_changed': 'Thay đổi quyền nhân viên',
      'staff.invitation_resent': 'Gửi lại lời mời', 'staff.invitation_revoked': 'Thu hồi lời mời', 'store.settings_updated': 'Cập nhật cài đặt cửa hàng',
      'data.exported': 'Xuất dữ liệu cửa hàng'
    };
    return labels[action] || String(action || '').replace(/\./g, ' · ');
  }

  function renderAudit() {
    if (!canAccessRoute('audit')) return `<section class='panel locked-page'><h2>Không có quyền xem nhật ký</h2><p>Khu vực này chỉ dành cho chủ cửa hàng và quản lý.</p></section>`;
    const rows = auditState.events.map(function (item) {
      const entity = `${item.entityType} · ${String(item.entityId).slice(0, 8)}`;
      return `<tr><td>${humanDate(item.occurredAt, true)}</td><td>${esc(item.actor.name)}</td><td><strong>${esc(auditActionLabel(item.action))}</strong><small class='table-subtitle'>${esc(item.action)}</small></td><td>${esc(entity)}</td><td>${esc(item.reason || '—')}</td></tr>`;
    }).join('');
    return pageHeading('Nhật ký hoạt động', 'Lịch sử nghiệp vụ được ghi cùng giao dịch để truy vết người thực hiện và thời điểm.', `<button class='btn btn-secondary' data-action='reload-audit'>Tải lại</button>`) +
      `<section class='panel'><form id='audit-filter-form' data-form='audit-filter' class='audit-filter-form'><div class='form-field'><label class='input-label' for='audit-from'>Từ ngày</label><input class='input' id='audit-from' name='from' type='date' value='${esc(auditState.filters.from)}'/></div><div class='form-field'><label class='input-label' for='audit-to'>Đến ngày</label><input class='input' id='audit-to' name='to' type='date' value='${esc(auditState.filters.to)}'/></div><div class='form-field audit-search-field'><label class='input-label' for='audit-q'>Tìm thao tác, nhân viên, mã bản ghi hoặc lý do</label><input class='input' id='audit-q' name='q' type='search' maxlength='100' value='${esc(auditState.filters.q)}' placeholder='Ví dụ: nhập hàng, Nguyễn…'/></div><button class='btn btn-primary audit-filter-button' type='submit'>Lọc nhật ký</button></form>${auditState.loading ? `<div class='install-hint' role='status' aria-live='polite'>Đang tải nhật ký hoạt động…</div>` : ''}${auditState.error ? `<div class='auth-message error' role='alert'>${esc(auditState.error)}</div>` : ''}<div class='table-wrap'><table class='data-table'><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Thao tác</th><th>Bản ghi</th><th>Lý do</th></tr></thead><tbody>${rows || `<tr><td colspan='5'><div class='empty-state'><strong>${auditState.loading ? 'Đang tải nhật ký…' : auditState.error ? 'Chưa tải được nhật ký' : 'Chưa có thao tác phù hợp'}</strong><span>${auditState.error ? 'Hãy thử tải lại hoặc điều chỉnh bộ lọc.' : 'Các thay đổi nghiệp vụ sẽ xuất hiện sau khi được ghi nhận trên máy chủ.'}</span></div></td></tr>`}</tbody></table></div><div class='pagination'><span>${auditState.total ? `Hiển thị ${auditState.offset + 1}–${auditState.offset + auditState.events.length} trên ${number(auditState.total)} mục` : `${number(auditState.total)} mục`}</span><span class='pagination-actions'>${auditState.offset > 0 ? `<button class='page-button' data-action='audit-page' data-offset='${Math.max(0, auditState.offset - auditState.limit)}' aria-label='Trang trước'>‹</button>` : ''}<span class='page-button current'>${Math.floor(auditState.offset / auditState.limit) + 1}</span>${auditState.nextOffset !== null ? `<button class='page-button' data-action='audit-page' data-offset='${auditState.nextOffset}' aria-label='Trang sau'>›</button>` : ''}</span></div></section>`;
  }

  function renderStaff() {
    if (store.role !== 'owner') return `<section class='panel locked-page'><div class='empty-icon'>${icon('users', 23)}</div><h2>Không có quyền quản lý nhân viên</h2><p>Chỉ chủ cửa hàng mới có thể mời, phân quyền hoặc tạm khóa thành viên.</p></section>`;
    const memberRows = staffState.members.map(function (member) {
      const joined = member.joined_at ? humanDate(member.joined_at) : 'Chưa có ngày tham gia';
      const scopeMode = member.warehouse_scope_mode || 'all';
      const selectedIds = new Set(Array.isArray(member.warehouse_scope_ids) ? member.warehouse_scope_ids : []);
      const warehouseChecks = staffState.warehouses.map(function (warehouse) {
        return `<label class='staff-warehouse-option'><input type='checkbox' data-member-warehouse='${member.user_id}' value='${warehouse.id}' ${selectedIds.has(warehouse.id) ? 'checked' : ''}/><span>${esc(warehouse.name)}${warehouse.is_default ? ' · Kho chính' : ''}</span></label>`;
      }).join('');
      return `<article class='staff-row'><div class='staff-person'><span class='avatar'>${esc(initials(member.display_name))}</span><span><strong>${esc(member.display_name)}</strong><small>${esc(member.email)} · Tham gia ${esc(joined)}</small></span></div><div class='staff-controls'><label><span>Vai trò</span><select class='input' data-member-role='${member.user_id}'>${Array.from(['manager', 'cashier', 'stockkeeper', 'accountant']).map(function (role) { return `<option value='${role}' ${member.role === role ? 'selected' : ''}>${staffRoleName(role)}</option>`; }).join('')}</select></label><label><span>Trạng thái</span><select class='input' data-member-status='${member.user_id}'><option value='active' ${member.status === 'active' ? 'selected' : ''}>Đang hoạt động</option><option value='suspended' ${member.status === 'suspended' ? 'selected' : ''}>Tạm khóa</option></select></label><button class='btn btn-secondary' data-action='save-staff-member' data-id='${member.user_id}'>Lưu</button></div><fieldset class='staff-scope' data-member-scope='${member.user_id}' ${member.role === 'stockkeeper' ? '' : 'hidden'}><legend>Phạm vi kho của nhân viên kho</legend><label class='staff-scope-mode'><span>Kho được phép truy cập</span><select class='input' data-member-scope-mode='${member.user_id}'><option value='all' ${scopeMode === 'all' ? 'selected' : ''}>Tất cả kho hiện tại và kho mới</option><option value='selected' ${scopeMode === 'selected' ? 'selected' : ''}>Chỉ các kho đã chọn</option></select></label><div class='staff-warehouse-options' data-member-warehouse-list='${member.user_id}' ${scopeMode === 'selected' ? '' : 'hidden'}>${warehouseChecks || `<small>Chưa có kho đang hoạt động.</small>`}</div><small>Kho mới chỉ tự cấp cho nhân viên ở chế độ “Tất cả kho”.</small></fieldset></article>`;
    }).join('');
    const inviteRows = staffState.invitations.map(function (invite) {
      const pendingInvite = invite.status === 'pending';
      const canResend = pendingInvite || invite.status === 'expired';
      const statusLabel = { pending: 'Đang chờ', accepted: 'Đã tham gia', revoked: 'Đã thu hồi', expired: 'Đã hết hạn' }[invite.status] || invite.status;
      return `<article class='staff-invite-row'><div><strong>${esc(invite.email)}</strong><small>${staffRoleName(invite.role)} · Hết hạn ${humanDate(invite.expires_at)}</small></div><span class='badge ${pendingInvite ? 'badge-warning' : invite.status === 'accepted' ? 'badge-success' : 'badge-neutral'}'><i class='badge-dot'></i>${statusLabel}</span>${canResend ? `<div class='staff-invite-actions'><button class='link-button' data-action='resend-staff-invite' data-id='${invite.id}'>Gửi lại</button>${pendingInvite ? `<button class='link-button danger-text' data-action='revoke-staff-invite' data-id='${invite.id}'>Thu hồi</button>` : ''}</div>` : ''}</article>`;
    }).join('');
    return pageHeading('Quản lý nhân viên', 'Mời thành viên bằng email và kiểm soát quyền truy cập cửa hàng.', `<button class='btn btn-primary' data-action='new-staff-invite'>${icon('plus', 15)} Mời nhân viên</button>`) +
      `${staffState.error ? `<div class='auth-message error'>${esc(staffState.error)} <button class='link-button' data-action='reload-staff'>Tải lại</button></div>` : ''}<section class='panel staff-panel'><div class='panel-header'><div><h2>Thành viên</h2><p>Chủ cửa hàng không thể bị tạm khóa hoặc hạ quyền tại đây.</p></div><span class='badge badge-info'><i class='badge-dot'></i>${staffState.members.length} nhân viên</span></div>${staffState.loading ? `<div class='empty-state'><strong>Đang tải thành viên…</strong></div>` : memberRows ? `<div class='staff-list'>${memberRows}</div>` : `<div class='empty-state'><strong>Chưa có nhân viên</strong><span>Mời người đầu tiên để phân chia công việc tại cửa hàng.</span></div>`}</section><section class='panel staff-panel'><div class='panel-header'><div><h2>Lời mời</h2><p>Liên kết chỉ dùng một lần, hết hạn sau 7 ngày và cần xác minh email.</p></div></div>${inviteRows ? `<div class='staff-list'>${inviteRows}</div>` : `<div class='empty-state'><strong>Chưa có lời mời</strong><span>Lời mời đang chờ sẽ xuất hiện ở đây.</span></div>`}</section><div class='staff-role-note'><strong>Vai trò không thể cấp quyền chủ cửa hàng.</strong><span>Quản lý nhân viên chỉ được thực hiện bởi chủ cửa hàng. Mọi thay đổi vai trò và trạng thái đều được ghi vào nhật ký cửa hàng.</span></div>`;
  }

  const channelNames = { shopee: 'Shopee', lazada: 'Lazada', tiktok_shop: 'TikTok Shop', tiki: 'Tiki', sendo: 'Sendo', grabmart: 'GrabMart', website: 'Website', other: 'Kênh khác' };

  async function loadChannelCatalog(offset) {
    if (!authSession || !store.id || !canAccessRoute('channels')) return;
    const requestedStoreId = store.id;
    const requestNumber = ++channelState.requestNumber;
    channelState.offset = Math.max(0, Number(offset) || 0);
    channelState.loading = true;
    channelState.error = '';
    if (page === 'channels') render();
    const params = new URLSearchParams({ limit: '50', offset: String(channelState.offset), state: channelState.state });
    if (channelState.query) params.set('q', channelState.query);
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/channel-catalog?${params}`);
      if (requestNumber !== channelState.requestNumber || store.id !== requestedStoreId) return;
      channelState.profiles = Array.isArray(result.profiles) ? result.profiles : [];
      channelState.mappings = Array.isArray(result.mappings) ? result.mappings : [];
      channelState.total = Number(result.total) || 0;
      channelState.nextOffset = result.nextOffset;
      channelState.loading = false;
    } catch (error) {
      if (requestNumber !== channelState.requestNumber) return;
      channelState.loading = false;
      channelState.error = error.message;
      if (error.status === 401) return showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    }
    if (page === 'channels') render();
  }

  const channelOrderStatusNames = { reserved: 'Đã giữ tồn', packed: 'Đã đóng gói', shipped: 'Đã gửi', delivered: 'Đã giao', cancelled: 'Đã hủy' };
  const channelPaymentNames = { unpaid: 'Chưa thanh toán', paid: 'Đã thanh toán', cod: 'Thu hộ COD', unknown: 'Chưa rõ' };
  let channelOrderMappingOptions = [];
  let channelOrderCatalogRequest = 0;
  let channelOrderSearchTimer = null;

  async function loadChannelOrders(offset) {
    if (!authSession || !store.id || !canAccessRoute('channels')) return;
    const requestedStoreId = store.id;
    const requestNumber = ++channelState.orderRequestNumber;
    channelState.orderOffset = Math.max(0, Number(offset) || 0);
    channelState.orderLoading = true;
    channelState.orderError = '';
    if (page === 'channels') render();
    const params = new URLSearchParams({ limit: '50', offset: String(channelState.orderOffset) });
    if (channelState.orderStatus) params.set('status', channelState.orderStatus);
    if (channelState.orderQuery) params.set('q', channelState.orderQuery);
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/channel-orders?${params}`);
      if (requestNumber !== channelState.orderRequestNumber || store.id !== requestedStoreId) return;
      channelState.orders = Array.isArray(result.orders) ? result.orders : [];
      channelState.orderTotal = Number(result.total) || 0;
      channelState.orderNextOffset = result.nextOffset;
      channelState.orderLoading = false;
    } catch (error) {
      if (requestNumber !== channelState.orderRequestNumber) return;
      channelState.orderLoading = false;
      channelState.orderError = error.message;
      if (error.status === 401) return showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    }
    if (page === 'channels') render();
  }

  function channelOrderActions(order) {
    const actions = [];
    if (order.fulfillmentStatus === 'reserved') actions.push(`<button class='link-button' data-action='channel-order-status' data-id='${esc(order.id)}' data-status='packed'>Đóng gói</button>`);
    if (order.fulfillmentStatus === 'packed') actions.push(`<button class='link-button' data-action='channel-order-status' data-id='${esc(order.id)}' data-status='shipped'>Đã gửi</button>`);
    if (order.fulfillmentStatus === 'shipped') actions.push(`<button class='link-button' data-action='channel-order-status' data-id='${esc(order.id)}' data-status='delivered'>Đã giao</button>`);
    if (['reserved', 'packed'].includes(order.fulfillmentStatus)) actions.push(`<button class='link-button danger-text' data-action='channel-order-status' data-id='${esc(order.id)}' data-status='cancelled'>Hủy</button>`);
    return actions.join('');
  }

  function renderChannelOrders() {
    const statuses = [['', 'Tất cả trạng thái'], ...Object.entries(channelOrderStatusNames)];
    const rows = channelState.orders.map(function (order) {
      return `<article class='channel-order-row'><div class='channel-order-primary'><strong>${esc(order.externalOrderRef)}</strong><small>${esc(channelNames[order.channelCode] || 'Kênh khác')} · ${esc(order.shopLabel)} · ${humanDate(order.createdAt, true)}</small></div><div class='channel-order-meta'><span class='badge ${order.fulfillmentStatus === 'delivered' ? 'badge-success' : order.fulfillmentStatus === 'cancelled' ? 'badge-neutral' : 'badge-info'}'>${esc(channelOrderStatusNames[order.fulfillmentStatus] || order.fulfillmentStatus)}</span><small>${esc(channelPaymentNames[order.paymentStatusSnapshot] || 'Chưa rõ')} · ${number(order.lineCount)} dòng</small></div><div class='channel-order-meta'><strong>${moneyVndText(order.totalVnd)}</strong><small>${esc(order.warehouseName || 'Kho giao')}</small></div><div class='channel-order-actions'><button class='link-button' data-action='channel-order-detail' data-id='${esc(order.id)}'>Chi tiết</button>${channelOrderActions(order)}</div></article>`;
    }).join('');
    return `<section class='panel channel-orders-panel'><div class='panel-header'><div><h2>Đơn được ghi nhận thủ công</h2><p>Ghi mã đơn từ gian hàng, giữ tồn tại kho rồi cập nhật đóng gói và giao hàng.</p></div><button class='btn btn-primary' data-action='new-channel-order' ${channelState.profiles.some((item) => item.status === 'active') ? '' : 'disabled title="Thêm gian hàng trước"'}>${icon('plus', 15)} Ghi nhận đơn</button></div>
      <div class='notice-item channel-boundary-note'><span>${icon('alert', 17)}</span><span><strong>Không phải đồng bộ từ sàn</strong><small>Thanh toán chỉ là trạng thái do nhân viên ghi lại. Chưa ghi doanh thu, công nợ hoặc sổ quỹ; tồn được giữ khi tạo đơn và trừ khi đánh dấu đã gửi.</small></span></div>
      <div class='channel-toolbar'><form data-form='channel-order-filter' class='channel-filter-form'><label class='search-wrap' for='channel-order-search'>${icon('search', 16)}<input class='input' id='channel-order-search' name='q' type='search' maxlength='120' value='${esc(channelState.orderQuery)}' placeholder='Tìm mã đơn, tên hoặc điện thoại'/></label><label class='select-wrap'><select class='input' name='status' aria-label='Lọc trạng thái đơn'>${statuses.map((entry) => `<option value='${esc(entry[0])}' ${channelState.orderStatus === entry[0] ? 'selected' : ''}>${esc(entry[1])}</option>`).join('')}</select></label><button class='btn btn-secondary' type='submit'>Lọc</button></form></div>
      ${channelState.orderError ? `<div class='auth-message error' role='alert'>${esc(channelState.orderError)} <button class='link-button' data-action='reload-channel-orders'>Tải lại</button></div>` : ''}
      <div class='channel-order-list'>${rows || `<div class='empty-state'><strong>${channelState.orderLoading ? 'Đang tải đơn kênh bán…' : 'Chưa có đơn kênh bán'}</strong><span>${channelState.orderLoading ? 'Đang lấy dữ liệu đã ghi trên máy chủ.' : 'Đơn được ghi thủ công sẽ xuất hiện tại đây; Slink chưa kết nối API của sàn.'}</span></div>`}</div>
      <div class='pagination'><span>${number(channelState.orderTotal)} đơn</span><span class='pagination-actions'>${channelState.orderOffset > 0 ? `<button class='page-button' data-action='channel-order-page' data-offset='${Math.max(0, channelState.orderOffset - 50)}' aria-label='Trang trước'>‹</button>` : ''}<span class='page-button current'>${Math.floor(channelState.orderOffset / 50) + 1}</span>${channelState.orderNextOffset !== null ? `<button class='page-button' data-action='channel-order-page' data-offset='${channelState.orderNextOffset}' aria-label='Trang sau'>›</button>` : ''}</span></div></section>`;
  }

  async function loadChannelOrderCatalog(profileId, query) {
    const form = modal.querySelector('[data-form="channel-order-create"]');
    if (!form || !profileId) return;
    const requestNumber = ++channelOrderCatalogRequest;
    const previous = Array.from(form.querySelectorAll('[data-channel-order-mapping]')).map((select) => select.value);
    form.querySelectorAll('[data-channel-order-mapping]').forEach((select) => { select.innerHTML = `<option value=''>Đang tải SKU…</option>`; });
    try {
      const params = new URLSearchParams({ profileId, limit: '100' });
      if (query) params.set('q', query);
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/channel-order-catalog?${params}`);
      if (requestNumber !== channelOrderCatalogRequest || modal.hidden) return;
      channelOrderMappingOptions = Array.isArray(result.mappings) ? result.mappings : [];
      const note = document.getElementById('channel-order-catalog-note');
      if (note) note.textContent = result.nextOffset !== null ? 'Có nhiều SKU phù hợp; nhập từ khóa để thu hẹp danh sách.' : `${number(channelOrderMappingOptions.length)} SKU đã ánh xạ và theo dõi tồn.`;
      form.querySelectorAll('[data-channel-order-mapping]').forEach((select, index) => {
        const selected = previous[index] || '';
        select.innerHTML = `<option value=''>Chọn SKU trên kênh</option>` + channelOrderMappingOptions.map((item) => `<option value='${esc(item.mappingId)}' data-price='${esc(item.suggestedUnitPriceVnd)}' data-label='${esc(item.productName)}'>${esc(item.externalSku)} · ${esc(item.productName)} (${esc(item.sku)})</option>`).join('');
        select.value = channelOrderMappingOptions.some((item) => item.mappingId === selected) ? selected : (channelOrderMappingOptions[0]?.mappingId || '');
        const price = select.closest('[data-channel-order-line]')?.querySelector('[data-channel-order-price]');
        if (price && !price.value) price.value = select.selectedOptions[0]?.dataset.price || '0';
      });
      updateChannelOrderTotal(form);
    } catch (error) {
      if (requestNumber !== channelOrderCatalogRequest || modal.hidden) return;
      form.querySelectorAll('[data-channel-order-mapping]').forEach((select) => { select.innerHTML = `<option value=''>Chưa tải được SKU</option>`; });
      const note = document.getElementById('channel-order-catalog-note');
      if (note) note.textContent = error.message;
    }
  }

  function channelOrderLineRow(index) {
    const options = channelOrderMappingOptions.map((item) => `<option value='${esc(item.mappingId)}' data-price='${esc(item.suggestedUnitPriceVnd)}' data-label='${esc(item.productName)}'>${esc(item.externalSku)} · ${esc(item.productName)} (${esc(item.sku)})</option>`).join('');
    const firstPrice = channelOrderMappingOptions[0]?.suggestedUnitPriceVnd || '0';
    return `<div class='channel-order-line' data-channel-order-line><label class='form-field'><span class='input-label'>SKU trên kênh</span><select class='input' data-channel-order-mapping required><option value=''>${options ? 'Chọn SKU' : 'Đang tải SKU…'}</option>${options}</select></label><label class='form-field'><span class='input-label'>Số lượng</span><input class='input' data-channel-order-quantity inputmode='decimal' value='1' required pattern='^(0|[1-9]\\d{0,9})(?:[.,]\\d{1,3})?$' aria-label='Số lượng dòng ${index + 1}'/></label><label class='form-field'><span class='input-label'>Đơn giá kênh (VND)</span><input class='input' data-channel-order-price inputmode='numeric' value='${esc(firstPrice)}' required pattern='^(0|[1-9]\\d{0,18})$' aria-label='Đơn giá dòng ${index + 1}'/></label><button class='row-action' type='button' data-action='remove-channel-order-line' aria-label='Xóa dòng ${index + 1}'>×</button></div>`;
  }

  async function openChannelOrderModal() {
    const profiles = channelState.profiles.filter((item) => item.status === 'active');
    if (!profiles.length) return toast('Chưa có gian hàng', 'Hãy khai báo gian hàng trước khi ghi nhận đơn.', 'error');
    const profileOptions = profiles.map((profile) => `<option value='${esc(profile.id)}'>${esc(channelProfileLabel(profile))}</option>`).join('');
    showModal('Ghi nhận đơn từ kênh', 'Nhập đơn đã thấy trên gian hàng. Việc này không kết nối hoặc đồng bộ với sàn.', `<form id='entity-form' data-form='channel-order-create' data-idempotency-key='${newIdempotencyKey()}'><div class='form-grid'><label class='form-field'><span class='input-label'>Gian hàng *</span><select class='input' id='channel-order-profile-id' name='channelProfileId' required>${profileOptions}</select></label><label class='form-field'><span class='input-label'>Kho giao *</span><select class='input' id='channel-order-warehouse-id' name='warehouseId' required><option value=''>Đang tải kho…</option></select></label><label class='form-field'><span class='input-label'>Mã đơn trên kênh *</span><input class='input' name='externalOrderRef' required maxlength='120' autocomplete='off' placeholder='Ví dụ: 240801ABCDEF'/></label><label class='form-field'><span class='input-label'>Thanh toán hiển thị ở kênh</span><select class='input' name='paymentStatusSnapshot'><option value='unknown'>Chưa rõ</option><option value='unpaid'>Chưa thanh toán</option><option value='paid'>Đã thanh toán</option><option value='cod'>Thu hộ COD</option></select></label><label class='form-field'><span class='input-label'>Tên người nhận</span><input class='input' name='customerName' maxlength='160' autocomplete='name'/></label><label class='form-field'><span class='input-label'>Điện thoại người nhận</span><input class='input' name='customerPhone' type='tel' inputmode='tel' maxlength='32' autocomplete='tel'/></label><label class='form-field full'><span class='input-label'>Địa chỉ giao hàng</span><textarea class='input' name='shippingAddress' rows='2' maxlength='500' autocomplete='shipping street-address'></textarea></label><label class='form-field full'><span class='input-label'>Ghi chú đóng gói nội bộ</span><textarea class='input' name='internalNote' rows='2' maxlength='500'></textarea></label></div><div class='channel-order-catalog-search'><label class='form-field'><span class='input-label'>Tìm SKU đã ánh xạ</span><input class='input' id='channel-order-mapping-search' type='search' maxlength='100' placeholder='Tên, SKU Slink hoặc SKU trên kênh'/></label><small id='channel-order-catalog-note'>Đang tải SKU đã ánh xạ…</small></div><div id='channel-order-lines'>${channelOrderLineRow(0)}</div><button class='btn btn-secondary' type='button' data-action='add-channel-order-line'>Thêm mặt hàng</button><div class='channel-order-total'><span>Tổng mặt hàng theo giá kênh</span><strong data-channel-order-total>—</strong></div><div class='notice-item channel-modal-note'><span>${icon('alert', 16)}</span><span><strong>Xác nhận sẽ giữ số lượng tại kho giao</strong><small>Thông tin người nhận là bản chụp từ gian hàng. Đánh dấu “Đã gửi” sẽ trừ tồn và ghi thẻ kho; Slink chưa tạo giao dịch thu tiền, doanh thu hay công nợ.</small></span></div></form>`, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>Giữ tồn và ghi đơn</button>`, true);
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/warehouses`);
      if (modal.hidden) return;
      const active = (result.warehouses || []).filter((item) => item.status === 'active');
      const select = document.getElementById('channel-order-warehouse-id');
      if (!select) return;
      select.innerHTML = active.length ? active.map((item) => `<option value='${esc(item.id)}' ${item.is_default ? 'selected' : ''}>${esc(item.name)}${item.is_default ? ' · Kho chính' : ''}</option>`).join('') : `<option value=''>Không có kho được giao</option>`;
      const profile = document.getElementById('channel-order-profile-id')?.value;
      await loadChannelOrderCatalog(profile, '');
    } catch (error) {
      const select = document.getElementById('channel-order-warehouse-id');
      if (select) select.innerHTML = `<option value=''>Chưa tải được kho</option>`;
      const note = document.getElementById('channel-order-catalog-note');
      if (note) note.textContent = error.message;
    }
  }

  function updateChannelOrderTotal(form) {
    const output = form?.querySelector('[data-channel-order-total]');
    if (!output) return;
    try {
      let total = 0n;
      form.querySelectorAll('[data-channel-order-line]').forEach((row) => {
        const quantity = String(row.querySelector('[data-channel-order-quantity]')?.value || '').replace(',', '.');
        const price = String(row.querySelector('[data-channel-order-price]')?.value || '');
        const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,3}))?$/.exec(quantity);
        if (!match || !/^(0|[1-9]\d{0,18})$/.test(price)) throw new Error('invalid');
        const milli = BigInt(match[1]) * 1000n + BigInt((match[2] || '').padEnd(3, '0') || '0');
        total += (BigInt(price) * milli + 500n) / 1000n;
      });
      output.textContent = moneyVndText(total.toString());
    } catch (_error) { output.textContent = 'Nhập số lượng và đơn giá hợp lệ'; }
  }

  async function createChannelOrder(form) {
    const lines = [];
    for (const row of form.querySelectorAll('[data-channel-order-line]')) {
      const mappingId = row.querySelector('[data-channel-order-mapping]')?.value || '';
      const quantity = String(row.querySelector('[data-channel-order-quantity]')?.value || '').trim().replace(',', '.');
      const unitPriceVnd = String(row.querySelector('[data-channel-order-price]')?.value || '').trim();
      if (!mappingId || !/^(0|[1-9]\d{0,9})(?:\.\d{1,3})?$/.test(quantity) || !/^(0|[1-9]\d{0,18})$/.test(unitPriceVnd)) {
        return toast('Dòng hàng chưa hợp lệ', 'Chọn SKU đã ánh xạ, số lượng dương và đơn giá VND nguyên.', 'error');
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
    const submit = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/channel-orders`, {
        method: 'POST', headers: { 'idempotency-key': form.dataset.idempotencyKey }, body: payload,
      });
      closeModal();
      channelState.view = 'orders';
      await loadChannelOrders(0);
      render();
      toast('Đơn kênh đã được ghi nhận', `${result.order.externalOrderRef} · ${moneyVndText(result.order.totalVnd)} · tồn đã được giữ tại ${result.order.warehouseName}.`);
    } catch (error) {
      if (submit) submit.disabled = false;
      toast('Chưa ghi nhận được đơn', error.message, 'error');
    }
  }

  function openChannelOrderStatus(order, nextStatus) {
    if (!order || !new Set(['reserved', 'packed', 'shipped', 'delivered', 'cancelled']).has(nextStatus)) return;
    const cancel = nextStatus === 'cancelled';
    const title = cancel ? 'Hủy đơn kênh?' : `${channelOrderStatusNames[nextStatus]}?`;
    const actionText = cancel ? 'Hủy đơn và nhả tồn' : `Xác nhận ${channelOrderStatusNames[nextStatus].toLocaleLowerCase('vi-VN')}`;
    const help = nextStatus === 'shipped' ? 'Slink sẽ trừ lượng đang giữ khỏi tồn và ghi thẻ kho trong cùng giao dịch.' : cancel ? 'Chỉ hủy được trước khi gửi. Lượng tồn đang giữ sẽ được trả lại khả dụng.' : 'Trạng thái sẽ được lưu vào lịch sử đơn kênh.';
    const form = `<form id='entity-form' data-form='channel-order-status' data-id='${esc(order.id)}' data-status='${esc(nextStatus)}' data-version='${esc(order.version)}' data-idempotency-key='${newIdempotencyKey()}'><p><strong>${esc(order.externalOrderRef)}</strong> · ${esc(channelOrderStatusNames[order.fulfillmentStatus])}</p>${cancel ? `<label class='form-field'><span class='input-label'>Lý do hủy *</span><textarea class='input' name='reason' rows='3' minlength='3' maxlength='500' required></textarea></label>` : `<label class='form-field'><span class='input-label'>Ghi chú nội bộ (không bắt buộc)</span><textarea class='input' name='reason' rows='2' maxlength='500'></textarea></label>`}<div class='modal-note'>${esc(help)}</div></form>`;
    showModal(title, 'Thao tác có kiểm soát phiên bản và sẽ ghi lịch sử.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Quay lại</button><button class='btn ${cancel ? 'btn-danger' : 'btn-primary'}' type='submit' form='entity-form'>${esc(actionText)}</button>`);
  }

  async function saveChannelOrderStatus(form) {
    const id = form.dataset.id;
    const status = form.dataset.status;
    const reason = String(new FormData(form).get('reason') || '').trim();
    const submit = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    try {
      await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/channel-orders/${encodeURIComponent(id)}/status`, {
        method: 'POST', headers: { 'idempotency-key': form.dataset.idempotencyKey },
        body: { status, version: Number(form.dataset.version), reason },
      });
      closeModal();
      await loadChannelOrders(channelState.orderOffset);
      toast('Đã cập nhật đơn kênh', channelOrderStatusNames[status]);
    } catch (error) {
      if (submit) submit.disabled = false;
      toast('Chưa cập nhật được đơn', error.message, 'error');
    }
  }

  async function openChannelOrderDetail(id) {
    try {
      const detail = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/channel-orders/${encodeURIComponent(id)}`);
      const order = detail.order;
      const lines = detail.lines.map((line) => `<tr><td>${esc(line.productName)}<small class='table-secondary'>${esc(line.sku)} · ${esc(line.externalSku)}</small></td><td>${number(Number(line.quantity))} ${esc(line.unit)}</td><td class='text-right'>${moneyVndText(line.unitPriceVnd)}</td><td class='text-right'>${moneyVndText(line.lineTotalVnd)}</td></tr>`).join('');
      const events = detail.events.map((event) => `<div class='channel-order-event'><span class='badge badge-neutral'>${esc(channelOrderStatusNames[event.toStatus] || event.toStatus)}</span><div><strong>${esc(event.actorName)}</strong><small>${humanDate(event.occurredAt, true)}${event.reason ? ` · ${esc(event.reason)}` : ''}</small></div></div>`).join('');
      const recipient = [order.customerName && `<div><small>Người nhận</small><strong>${esc(order.customerName)}</strong></div>`, order.customerPhone && `<div><small>Điện thoại</small><strong>${esc(order.customerPhone)}</strong></div>`, order.shippingAddress && `<div class='channel-recipient-address'><small>Địa chỉ giao hàng</small><strong>${esc(order.shippingAddress)}</strong></div>`, order.internalNote && `<div class='channel-recipient-address'><small>Ghi chú đóng gói</small><strong>${esc(order.internalNote)}</strong></div>`].filter(Boolean).join('');
      const body = `<div class='summary-banner'><div><strong>${esc(channelNames[order.channelCode] || 'Kênh khác')} · ${esc(order.shopLabel)}</strong><small>${esc(order.externalOrderRef)} · ${esc(order.warehouseName || '')}</small></div><strong>${moneyVndText(order.totalVnd)}</strong></div>${recipient ? `<section class='channel-recipient-card'>${recipient}</section>` : ''}<div class='notice-item'><span>${icon('alert', 16)}</span><span><strong>Thanh toán: ${esc(channelPaymentNames[order.paymentStatusSnapshot] || 'Chưa rõ')}</strong><small>Trạng thái do nhân viên ghi lại; không phản ánh tiền đã vào sổ Slink.</small></span></div><section class='panel'><div class='table-wrap'><table class='data-table'><thead><tr><th>Sản phẩm</th><th>Số lượng</th><th class='text-right'>Đơn giá</th><th class='text-right'>Thành tiền</th></tr></thead><tbody>${lines}</tbody></table></div></section><section class='channel-order-timeline'><h3>Lịch sử xử lý</h3>${events || `<div class='empty-state'>Chưa có lịch sử.</div>`}</section>`;
      showModal(`Đơn ${order.externalOrderRef}`, `${channelOrderStatusNames[order.fulfillmentStatus]} · ${humanDate(order.createdAt, true)}`, body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-primary' type='button' data-action='print-channel-order' data-id='${esc(order.id)}'>In phiếu đóng gói</button>`, true);
    } catch (error) { toast('Chưa tải được đơn kênh', error.message, 'error'); }
  }

  function formatChannelQuantity(value) {
    const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,3}))?$/.exec(String(value));
    if (!match) return '';
    const whole = new Intl.NumberFormat('vi-VN').format(BigInt(match[1]));
    const fraction = (match[2] || '').replace(/0+$/, '');
    return fraction ? `${whole},${fraction}` : whole;
  }

  async function printChannelPackingSlip(id) {
    const popup = window.open('', '_blank', 'width=860,height=1000');
    if (!popup) return toast('Trình duyệt đã chặn cửa sổ in', 'Cho phép cửa sổ bật lên rồi thử lại.', 'error');
    popup.document.open();
    popup.document.write(`<!doctype html><html lang='vi'><head><meta charset='utf-8'><title>Slink · Đang tải phiếu</title></head><body>Đang tải dữ liệu đơn từ máy chủ…</body></html>`);
    popup.document.close();
    try {
      const detail = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/channel-orders/${encodeURIComponent(id)}`);
      if (popup.closed) return;
      const order = detail.order;
      const rows = detail.lines.map((line, index) => `<tr><td class='index'>${index + 1}</td><td><strong>${esc(line.productName)}</strong><small>SKU: ${esc(line.sku)} · SKU kênh: ${esc(line.externalSku)}</small></td><td class='quantity'>${formatChannelQuantity(line.quantity)} ${esc(line.unit)}</td><td class='check'></td></tr>`).join('');
      const contacts = [order.customerName && `<div><span>Người nhận</span><strong>${esc(order.customerName)}</strong></div>`, order.customerPhone && `<div><span>Điện thoại</span><strong>${esc(order.customerPhone)}</strong></div>`, order.shippingAddress && `<div><span>Địa chỉ giao hàng</span><strong>${esc(order.shippingAddress)}</strong></div>`].filter(Boolean).join('');
      const note = order.internalNote ? `<section class='note'><strong>Ghi chú đóng gói</strong><p>${esc(order.internalNote)}</p></section>` : '';
      const cancelled = order.fulfillmentStatus === 'cancelled' ? `<div class='cancelled'>ĐƠN ĐÃ HỦY — KHÔNG ĐÓNG GÓI</div>` : '';
      const html = `<!doctype html><html lang='vi'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Phiếu đóng gói · ${esc(order.externalOrderRef)}</title><style>
        @page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#202923;margin:0;line-height:1.45}header{display:flex;justify-content:space-between;gap:18px;border-bottom:2px solid #263d30;padding-bottom:12px}h1{font-size:20px;margin:0 0 4px}h2{font-size:23px;margin:0 0 5px}.muted{color:#667169;font-size:11px}.meta{text-align:right}.meta strong{display:block}.contacts{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;padding:14px 0;border-bottom:1px solid #dce4dc}.contacts div{display:grid;gap:3px;min-width:0}.contacts span,.note strong{font-size:11px;color:#69766d}.contacts strong{overflow-wrap:anywhere}.contacts div:nth-child(3){grid-column:1/-1}.note{margin:13px 0;padding:10px 12px;background:#f5f7f4;border-left:3px solid #78977e;break-inside:avoid}.note p{margin:5px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin-top:15px}th,td{padding:10px 8px;border-bottom:1px solid #dfe5df;text-align:left;vertical-align:top}th{background:#f4f6f3;font-size:11px}.index{width:34px;color:#78847c}.quantity{width:120px;font-weight:700}.check{width:46px}.check:after{content:'□';font-size:20px;color:#77857c}.cancelled{margin-top:14px;padding:10px;border:2px solid #a33434;text-align:center;color:#a33434;font-weight:700}.footer{margin-top:24px;padding-top:10px;border-top:1px solid #dce4dc;color:#77847c;font-size:10px}@media print{tr{break-inside:avoid}thead{display:table-header-group}}
        </style></head><body>${cancelled}<header><div><h1>${esc(store.settings.storeName || 'Slink')}</h1><div class='muted'>${esc(channelNames[order.channelCode] || 'Kênh khác')} · ${esc(order.shopLabel)}</div><div class='muted'>Kho giao: ${esc(order.warehouseName || 'Chưa rõ')}</div></div><div class='meta'><h2>PHIẾU ĐÓNG GÓI</h2><strong>${esc(order.externalOrderRef)}</strong><span class='muted'>Tạo lúc ${humanDate(order.createdAt, true)}</span><span class='muted'>Trạng thái: ${esc(channelOrderStatusNames[order.fulfillmentStatus] || order.fulfillmentStatus)}</span></div></header>${contacts ? `<section class='contacts'>${contacts}</section>` : `<section class='contacts'><span>Chưa có thông tin người nhận trong dữ liệu đã ghi.</span></section>`}${note}<table><thead><tr><th>#</th><th>Mặt hàng</th><th>Số lượng</th><th>Đã lấy</th></tr></thead><tbody>${rows}</tbody></table><footer class='footer'>Phiếu nội bộ để soạn hàng. Không phải vận đơn hoặc hóa đơn. Trạng thái thanh toán và COD cần được đối chiếu riêng trên gian hàng.</footer></body></html>`;
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      window.setTimeout(() => { if (!popup.closed) popup.print(); }, 300);
    } catch (error) {
      if (!popup.closed) popup.close();
      toast('Chưa tạo được phiếu đóng gói', error.message, 'error');
    }
  }

  function channelProfileLabel(profile) {
    return `${channelNames[profile.channel_code] || 'Kênh khác'} · ${profile.shop_label}`;
  }

  function renderChannelMappings() {
    if (!canAccessRoute('channels')) return `<section class='panel locked-page'><div class='empty-icon'>${icon('shop', 23)}</div><h2>Không có quyền quản lý kênh bán</h2><p>Chỉ chủ cửa hàng, quản lý hoặc nhân viên kho được quản lý mã sản phẩm trên kênh bán.</p></section>`;
    const activeProfiles = channelState.profiles.filter(function (profile) { return profile.status === 'active'; });
    const profileRows = channelState.profiles.map(function (profile) {
      const archived = profile.status === 'archived';
      const count = Number(profile.active_mapping_count) || 0;
      return `<article class='channel-profile-card'><div class='channel-profile-main'><span class='channel-profile-icon'>${icon('shop', 18)}</span><div><div class='channel-profile-title'><strong>${esc(channelNames[profile.channel_code] || 'Kênh khác')}</strong><span class='channel-connection'>Chưa kết nối</span>${archived ? `<span class='channel-archived'>Đã lưu trữ</span>` : ''}</div><p>${esc(profile.shop_label)}</p><small>${number(count)} ánh xạ đang hoạt động · Chưa đồng bộ sản phẩm, tồn kho hoặc đơn hàng</small></div></div><div class='channel-profile-actions'>${!archived ? `<button class='link-button' data-action='edit-channel-profile' data-id='${esc(profile.id)}'>Sửa tên</button><button class='link-button danger-text' data-action='archive-channel-profile' data-id='${esc(profile.id)}' ${count ? 'disabled title="Lưu trữ các ánh xạ trước"' : ''}>Lưu trữ</button>` : ''}</div></article>`;
    }).join('');
    const rows = channelState.mappings.map(function (mapping) {
      const archived = mapping.status === 'archived';
      const attributes = mapping.variant_attributes && Object.keys(mapping.variant_attributes).length
        ? ` · ${Object.entries(mapping.variant_attributes).map(function (entry) { return `${entry[0]}: ${entry[1]}`; }).map(esc).join(' · ')}` : '';
      return `<article class='channel-mapping-row'><div class='channel-product-name'><strong>${esc(mapping.product_name)}</strong><small>${esc(mapping.internal_sku || 'Chưa có SKU')}${attributes}</small></div><div class='channel-mapping-profile'><span>${esc(channelNames[mapping.channel_code] || 'Kênh khác')} · ${esc(mapping.shop_label)}</span><small>Chưa kết nối</small></div><div class='channel-sku-cell'><strong>${esc(mapping.external_sku)}</strong><small>${mapping.external_product_ref ? `Mã mặt hàng: ${esc(mapping.external_product_ref)}` : 'Chưa nhập mã mặt hàng'}</small></div><div class='channel-mapping-actions'>${archived ? `<span class='channel-archived'>Đã lưu trữ</span>` : `<button class='link-button' data-action='edit-channel-mapping' data-id='${esc(mapping.id)}'>Sửa</button><button class='link-button danger-text' data-action='archive-channel-mapping' data-id='${esc(mapping.id)}'>Lưu trữ</button>`}</div></article>`;
    }).join('');
    const archivedTab = channelState.state === 'archived';
    const orderView = channelState.view === 'orders';
    const viewTabs = `<div class='channel-view-tabs' role='tablist' aria-label='Khu vực kênh bán'><button class='segment ${!orderView ? 'active' : ''}' data-action='channel-view' data-view='mappings' role='tab' aria-selected='${!orderView}'>Gian hàng & SKU</button><button class='segment ${orderView ? 'active' : ''}' data-action='channel-view' data-view='orders' role='tab' aria-selected='${orderView}'>Đơn kênh bán</button></div>`;
    const headingActions = orderView
      ? `${canExportData() ? `<button class='btn btn-secondary' data-action='open-export'>Xuất CSV</button>` : ''}<button class='btn btn-secondary' data-action='reload-channel-orders'>Tải lại</button><button class='btn btn-primary' data-action='new-channel-order' ${activeProfiles.length ? '' : 'disabled title="Thêm gian hàng trước"'}>${icon('plus', 15)} Ghi nhận đơn</button>`
      : `<button class='btn btn-secondary' data-action='reload-channel-catalog'>Tải lại</button><button class='btn btn-primary' data-action='new-channel-profile'>${icon('plus', 15)} Thêm gian hàng</button>`;
    const header = pageHeading('Kênh bán', orderView ? 'Theo dõi đơn được cửa hàng ghi nhận từ các gian hàng.' : 'Khai báo gian hàng và đối chiếu SKU để chuẩn bị quản lý bán hàng đa kênh.', headingActions) +
      `<div class='notice-item channel-boundary-note'><span>${icon('alert', 17)}</span><span><strong>Quản lý thủ công · chưa kết nối với sàn</strong><small>Không có đồng bộ tự động sản phẩm, tồn kho, đơn hàng, giá hoặc tài chính. Các đơn được ghi bởi nhân viên.</small></span></div>${viewTabs}`;
    if (orderView) return header + renderChannelOrders();
    return header +
      `<section class='panel channel-profiles-panel'><div class='panel-header'><div><h2>Gian hàng đã khai báo</h2><p>Thông tin chỉ giúp bạn nhận diện từng kênh và gian hàng.</p></div><span class='badge badge-neutral'>${number(channelState.profiles.length)} gian hàng</span></div>${profileRows || `<div class='empty-state'><strong>${channelState.loading ? 'Đang tải gian hàng…' : 'Chưa khai báo gian hàng'}</strong><span>Thêm gian hàng để bắt đầu lưu các SKU tương ứng.</span></div>`}</section>
      <section class='panel channel-mappings-panel'><div class='panel-header'><div><h2>${archivedTab ? 'Ánh xạ đã lưu trữ' : 'Ánh xạ sản phẩm'}</h2><p>SKU nội bộ được ghép thủ công với SKU tại từng gian hàng.</p></div><button class='btn btn-primary' data-action='new-channel-mapping' ${activeProfiles.length ? '' : 'disabled title="Thêm gian hàng trước"'}>${icon('plus', 15)} Thêm ánh xạ</button></div>
      <div class='channel-toolbar'><form data-form='channel-filter' class='channel-filter-form'><label class='search-wrap' for='channel-search'>${icon('search', 16)}<input class='input' id='channel-search' name='q' type='search' maxlength='120' value='${esc(channelState.query)}' placeholder='Tìm sản phẩm, SKU hoặc gian hàng'/></label><button class='btn btn-secondary' type='submit'>Tìm</button></form><div class='segmented'><button class='segment ${!archivedTab ? 'active' : ''}' data-action='channel-state' data-state='active'>Đang dùng</button><button class='segment ${archivedTab ? 'active' : ''}' data-action='channel-state' data-state='archived'>Đã lưu trữ</button></div></div>
      ${channelState.error ? `<div class='auth-message error' role='alert'>${esc(channelState.error)} <button class='link-button' data-action='reload-channel-catalog'>Tải lại</button></div>` : ''}<div class='channel-mapping-list'>${rows || `<div class='empty-state'><strong>${channelState.loading ? 'Đang tải ánh xạ…' : archivedTab ? 'Chưa có ánh xạ lưu trữ' : 'Chưa có ánh xạ SKU'}</strong><span>${channelState.loading ? 'Đang lấy thông tin đã lưu trên máy chủ.' : archivedTab ? 'Các ánh xạ đã lưu trữ sẽ xuất hiện tại đây.' : 'Tạo ánh xạ để nhân viên dễ nhận diện mã của cùng một sản phẩm trên từng kênh.'}</span></div>`}</div><div class='pagination'><span>${number(channelState.total)} ánh xạ</span><span class='pagination-actions'>${channelState.offset > 0 ? `<button class='page-button' data-action='channel-page' data-offset='${Math.max(0, channelState.offset - 50)}' aria-label='Trang trước'>‹</button>` : ''}<span class='page-button current'>${Math.floor(channelState.offset / 50) + 1}</span>${channelState.nextOffset !== null ? `<button class='page-button' data-action='channel-page' data-offset='${channelState.nextOffset}' aria-label='Trang sau'>›</button>` : ''}</span></div></section>`;
  }

  function openChannelProfile(profile) {
    const isEdit = Boolean(profile);
    const code = profile ? profile.channel_code : 'shopee';
    const options = Object.entries(channelNames).map(function (entry) { return `<option value='${entry[0]}' ${code === entry[0] ? 'selected' : ''}>${esc(entry[1])}</option>`; }).join('');
    const form = `<form id='entity-form' data-form='channel-profile' data-id='${profile ? esc(profile.id) : ''}' data-version='${profile ? profile.version : ''}' data-idempotency-key='${newIdempotencyKey()}'><div class='form-grid'><div class='form-field'><label class='input-label' for='channel-code'>Kênh bán *</label><select class='input' id='channel-code' name='channelCode' ${isEdit ? 'disabled' : ''} required>${options}</select>${isEdit ? `<small>Loại kênh không đổi để giữ nguyên lịch sử SKU.</small>` : ''}</div><div class='form-field'><label class='input-label' for='channel-shop-label'>Tên gian hàng *</label><input class='input' id='channel-shop-label' name='shopLabel' value='${esc(profile ? profile.shop_label : '')}' required maxlength='120' placeholder='Ví dụ: Slink Official'/></div></div><div class='notice-item channel-modal-note'><span>○</span><span><strong>Trạng thái: Chưa kết nối</strong><small>Thêm hồ sơ không đăng nhập hoặc kết nối tài khoản trên sàn.</small></span></div></form>`;
    showModal(isEdit ? 'Sửa thông tin gian hàng' : 'Thêm gian hàng', 'Khai báo tên để phân biệt các gian hàng đang vận hành.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>${isEdit ? 'Lưu thay đổi' : 'Thêm gian hàng'}</button>`);
  }

  async function loadChannelProductOptions(query, selectedId) {
    const requestNumber = ++channelProductRequestNumber;
    const select = document.getElementById('channel-product-id');
    if (select) select.innerHTML = `<option value=''>Đang tìm sản phẩm…</option>`;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/products?limit=100&q=${encodeURIComponent(query || '')}`);
      if (requestNumber !== channelProductRequestNumber || modal.hidden) return;
      channelProductOptions = Array.isArray(result.products) ? result.products : [];
      const next = document.getElementById('channel-product-id');
      if (!next) return;
      next.innerHTML = `<option value=''>Chọn sản phẩm</option>` + channelProductOptions.map(function (product) {
        return `<option value='${esc(product.id)}' ${product.id === selectedId ? 'selected' : ''}>${esc(product.name)} · ${esc(product.sku)}</option>`;
      }).join('');
      const count = document.getElementById('channel-product-count');
      if (count) count.textContent = `${number(result.total)} sản phẩm phù hợp${result.nextOffset !== null ? ' · nhập thêm từ khóa để thu hẹp danh sách' : ''}`;
    } catch (error) {
      if (requestNumber !== channelProductRequestNumber || modal.hidden) return;
      const next = document.getElementById('channel-product-id');
      if (next) next.innerHTML = `<option value=''>Chưa tải được sản phẩm</option>`;
      const count = document.getElementById('channel-product-count');
      if (count) count.textContent = error.message;
    }
  }

  function openChannelMapping(mapping) {
    const isEdit = Boolean(mapping);
    const profiles = channelState.profiles.filter(function (profile) { return profile.status === 'active'; });
    const selectedProfile = mapping ? mapping.channel_profile_id : profiles[0]?.id || '';
    const profileOptions = profiles.map(function (profile) { return `<option value='${esc(profile.id)}' ${selectedProfile === profile.id ? 'selected' : ''}>${esc(channelProfileLabel(profile))}</option>`; }).join('');
    const form = `<form id='entity-form' data-form='channel-mapping' data-id='${mapping ? esc(mapping.id) : ''}' data-version='${mapping ? mapping.version : ''}' data-product-id='${mapping ? esc(mapping.product_id) : ''}' data-idempotency-key='${newIdempotencyKey()}'><div class='form-field'><label class='input-label' for='channel-profile-id'>Gian hàng *</label><select class='input' id='channel-profile-id' name='channelProfileId' ${isEdit ? 'disabled' : ''} required>${profileOptions}</select></div>${isEdit ? `<div class='channel-readonly-product'><small>Sản phẩm nội bộ</small><strong>${esc(mapping.product_name)}</strong><span>${esc(mapping.internal_sku || 'Chưa có SKU')}</span></div>` : `<div class='form-field'><label class='input-label' for='channel-product-search'>Tìm sản phẩm nội bộ</label><input class='input' id='channel-product-search' type='search' maxlength='120' placeholder='Tên sản phẩm hoặc SKU'/><small id='channel-product-count'>Đang tải danh mục…</small></div><div class='form-field'><label class='input-label' for='channel-product-id'>Sản phẩm *</label><select class='input' id='channel-product-id' name='productId' required><option value=''>Đang tải sản phẩm…</option></select></div>`}<div class='form-grid'><div class='form-field'><label class='input-label' for='channel-external-sku'>SKU trên kênh *</label><input class='input' id='channel-external-sku' name='externalSku' value='${mapping ? esc(mapping.external_sku) : ''}' required maxlength='80' autocomplete='off' placeholder='Ví dụ: SP-RED-01'/></div><div class='form-field'><label class='input-label' for='channel-external-ref'>Mã mặt hàng trên kênh</label><input class='input' id='channel-external-ref' name='externalProductRef' value='${mapping ? esc(mapping.external_product_ref || '') : ''}' maxlength='120' autocomplete='off' placeholder='Không bắt buộc'/></div></div><div class='notice-item channel-modal-note'><span>○</span><span><strong>Ánh xạ thủ công · chưa đồng bộ</strong><small>Thay đổi này chỉ lưu mã đối chiếu trong Slink, không cập nhật gian hàng bên ngoài.</small></span></div></form>`;
    showModal(isEdit ? 'Sửa ánh xạ SKU' : 'Thêm ánh xạ SKU', 'Liên kết một mã hàng trên kênh với đúng một sản phẩm Slink.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>${isEdit ? 'Lưu thay đổi' : 'Tạo ánh xạ'}</button>`, true);
    if (!isEdit) loadChannelProductOptions('', '');
  }

  async function saveChannelProfile(form) {
    const id = form.dataset.id;
    const payload = { channelCode: form.querySelector('[name="channelCode"]').value, shopLabel: String(new FormData(form).get('shopLabel') || '').trim() };
    if (id) payload.version = Number(form.dataset.version);
    const submit = modal.querySelector('[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    try {
      await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/channel-profiles${id ? `/${encodeURIComponent(id)}` : ''}`, {
        method: id ? 'PUT' : 'POST', headers: { 'idempotency-key': form.dataset.idempotencyKey }, body: payload,
      });
      closeModal();
      await loadChannelCatalog(channelState.offset);
      toast('Đã lưu gian hàng', 'Trạng thái kết nối vẫn là chưa kết nối.');
    } catch (error) {
      if (submit) submit.disabled = false;
      toast('Chưa lưu được gian hàng', error.message, 'error');
    }
  }

  async function saveChannelMapping(form) {
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
    const submit = modal.querySelector('[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    try {
      await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/channel-mappings${id ? `/${encodeURIComponent(id)}` : ''}`, {
        method: id ? 'PUT' : 'POST', headers: { 'idempotency-key': form.dataset.idempotencyKey }, body: payload,
      });
      closeModal();
      await loadChannelCatalog(channelState.offset);
      toast('Đã lưu ánh xạ SKU', 'Ánh xạ chỉ phục vụ đối chiếu thủ công trong Slink.');
    } catch (error) {
      if (submit) submit.disabled = false;
      toast('Chưa lưu được ánh xạ', error.message, 'error');
    }
  }

  function confirmChannelArchive(kind, record) {
    const profile = kind === 'profile';
    const title = profile ? 'Lưu trữ gian hàng?' : 'Lưu trữ ánh xạ SKU?';
    const recordName = profile ? record.shop_label : `${record.product_name} · ${record.external_sku}`;
    const form = `<form id='entity-form' data-form='channel-archive' data-kind='${profile ? 'profile' : 'mapping'}' data-id='${esc(record.id)}' data-version='${record.version}' data-idempotency-key='${newIdempotencyKey()}'><p><strong>${esc(recordName)}</strong> sẽ được lưu trữ và không còn xuất hiện trong danh sách đang dùng. Không có sản phẩm, tồn kho hay dữ liệu sàn nào bị thay đổi.</p></form>`;
    showModal(title, 'Lịch sử được giữ lại trong cửa hàng.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Giữ lại</button><button class='btn btn-primary' type='submit' form='entity-form'>Lưu trữ</button>`);
  }

  async function saveChannelArchive(form) {
    const kind = form.dataset.kind;
    const id = form.dataset.id;
    const endpoint = kind === 'profile' ? 'channel-profiles' : 'channel-mappings';
    const button = modal.querySelector('[type="submit"][form="entity-form"]');
    if (button) button.disabled = true;
    try {
      await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/${endpoint}/${encodeURIComponent(id)}/archive`, {
        method: 'POST', headers: { 'idempotency-key': form.dataset.idempotencyKey }, body: { version: Number(form.dataset.version) },
      });
      closeModal();
      await loadChannelCatalog(channelState.offset);
      toast(kind === 'profile' ? 'Đã lưu trữ gian hàng' : 'Đã lưu trữ ánh xạ SKU', 'Lịch sử được giữ trong cửa hàng.');
    } catch (error) {
      if (button) button.disabled = false;
      toast('Chưa lưu trữ được', error.message, 'error');
    }
  }

  function render() {
    if (!authSession) { renderAuth(); return; }
    renderShell();
    const renderers = { dashboard: renderDashboard, products: renderProducts, pos: renderPOS, orders: renderOrders, customers: renderCustomers, inventory: renderInventory, finance: renderFinance, reports: renderReports, settings: renderSettings, channels: renderChannelMappings, staff: renderStaff, audit: renderAudit };
    const pageHtml = renderers[page] ? renderers[page]() : `<section class='panel locked-page'><div class='empty-icon'>${icon('clock', 23)}</div><h2>Đang hoàn thiện</h2><p>Khu vực này đang được kết nối với dữ liệu cửa hàng và quy trình lưu sổ. Các thao tác mẫu đã được khóa để tránh tạo giao dịch không có thật.</p><button class='btn btn-primary' data-route='products'>Mở danh mục sản phẩm</button></section>`;
    root.innerHTML = page === 'finance' && store.role !== 'cashier' ? pageHtml + purchaseOrderPanel() + purchaseHistoryPanel() : pageHtml;
    if (page === 'pos') { const oldSearch = document.activeElement && document.activeElement.id === 'pos-search'; if (oldSearch) document.getElementById('pos-search').focus(); }
  }

  function showModal(title, subtitle, body, footer, wide) {
    stopScanCamera();
    if (modal.hidden) {
      const active = document.activeElement;
      modalReturnFocus = active && active !== document.body && !modal.contains(active) ? active : null;
    }
    modalGeneration += 1;
    modal.className = 'modal' + (wide ? ' wide' : '');
    modal.innerHTML = `<div class='modal-head'><div><h2 id='modal-title'>${esc(title)}</h2><p id='modal-description'>${esc(subtitle || '')}</p></div><button class='modal-close' data-action='close-modal' aria-label='Đóng'>×</button></div><div class='modal-body'>${body || ''}</div>${footer ? `<div class='modal-footer'>${footer}</div>` : ''}`;
    modal.hidden = false; backdrop.hidden = false; document.body.style.overflow = 'hidden';
    const first = modal.querySelector('input:not([type=hidden]),select,button'); if (first) window.setTimeout(function () { first.focus(); }, 40);
  }

  function closeModal() {
    const wasOpen = !modal.hidden;
    stopScanCamera();
    modal.hidden = true;
    backdrop.hidden = true;
    document.body.style.overflow = '';
    if (!wasOpen) return;
    const focusTarget = modalReturnFocus;
    modalReturnFocus = null;
    if (focusTarget && focusTarget.isConnected && !focusTarget.disabled) window.requestAnimationFrame(function () {
      if (modal.hidden) focusTarget.focus();
    });
  }

  function keepModalFocus(event) {
    if (modal.hidden || event.key !== 'Tab') return;
    const focusable = Array.from(modal.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      .filter(function (element) { return !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0; });
    if (!focusable.length) {
      event.preventDefault();
      modal.setAttribute('tabindex', '-1');
      modal.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  function modalForm(title, subtitle, form, submitLabel, wide) {
    showModal(title, subtitle, form + `<div class='modal-note'>Các thay đổi sẽ được lưu vào dữ liệu cửa hàng trên máy chủ.</div>`, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>${submitLabel || 'Lưu thông tin'}</button>`, wide);
  }

  const productImportBaseHeaders = ['Mã SKU', 'Mã vạch', 'Tên sản phẩm', 'Danh mục', 'Đơn vị', 'Giá bán (VND)', 'Giá vốn (VND)', 'Ngưỡng tồn tối thiểu', 'Theo dõi tồn kho (Có/Không)', 'Tồn đầu kỳ'];
  const productImportHeaders = [...productImportBaseHeaders, 'Tên nhóm biến thể', 'Thuộc tính biến thể (Tên=Giá trị; ...)'];
  const customerImportHeaders = ['Tên khách hàng', 'Số điện thoại', 'Email', 'Công nợ ban đầu (VND)', 'Ghi chú'];

  function formatImportQuantity(value) {
    const match = /^(\d{1,10})(?:\.(\d{1,3}))?$/.exec(String(value ?? '0'));
    if (!match) return '0';
    const whole = BigInt(match[1]).toLocaleString('vi-VN');
    const fraction = (match[2] || '').padEnd(3, '0').replace(/0+$/, '');
    return whole + (fraction ? `,${fraction}` : '');
  }

  function totalImportQuantity(rows) {
    const totalMilliUnits = rows.reduce(function (sum, item) {
      const match = /^(\d{1,10})(?:\.(\d{1,3}))?$/.exec(String(item.openingQuantity ?? '0'));
      if (!match) return sum;
      return sum + BigInt(match[1]) * 1000n + BigInt((match[2] || '').padEnd(3, '0') || '0');
    }, 0n);
    const whole = (totalMilliUnits / 1000n).toLocaleString('vi-VN');
    const fraction = String(totalMilliUnits % 1000n).padStart(3, '0').replace(/0+$/, '');
    return whole + (fraction ? `,${fraction}` : '');
  }

  function parseCsvDocument(text) {
    const source = String(text || '').replace(/^\uFEFF/, '');
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
      } else if (character === ',') {
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

  function parseProductImportCsv(text) {
    let parsed;
    try { parsed = parseCsvDocument(text); }
    catch (error) { return { items: [], errors: [error.message] }; }
    const rows = parsed.filter(function (record, index) { return index === 0 || record.cells.some(function (cell) { return String(cell || '').trim() !== ''; }); });
    if (!rows.length) return { items: [], errors: ['Tệp CSV đang trống.'] };
    const headers = rows[0].cells.map(function (cell) { return String(cell || '').trim(); });
    const legacyTemplate = headers.length === productImportBaseHeaders.length && productImportBaseHeaders.every(function (header, index) { return headers[index] === header; });
    const extendedTemplate = headers.length === productImportHeaders.length && productImportHeaders.every(function (header, index) { return headers[index] === header; });
    if (!legacyTemplate && !extendedTemplate) {
      return { items: [], errors: ['Tiêu đề cột không đúng mẫu Slink. Hãy tải mẫu CSV rồi điền dữ liệu vào.'] };
    }
    const dataRows = rows.slice(1);
    const errors = [];
    if (!dataRows.length) errors.push('Tệp chưa có dòng sản phẩm nào.');
    if (dataRows.length > 200) errors.push('Mỗi lần nhập tối đa 200 sản phẩm. Hãy chia tệp thành nhiều phần.');
    const seenSkus = new Map();
    const seenBarcodes = new Map();
    const variantGroups = new Map();
    const items = [];
    dataRows.slice(0, 200).forEach(function (record) {
      const line = record.line;
      const cells = record.cells;
      const rowErrors = [];
      const expectedColumns = legacyTemplate ? productImportBaseHeaders.length : productImportHeaders.length;
      if (cells.length !== expectedColumns) rowErrors.push(`Dòng ${line}: số cột không khớp mẫu.`);
      const values = Array.from({ length: expectedColumns }, function (_value, cellIndex) { return String(cells[cellIndex] || '').trim(); });
      const sku = values[0];
      const barcode = values[1] || null;
      const name = values[2];
      const category = values[3] || 'Chưa phân loại';
      const unit = values[4] || 'cái';
      if (!sku || sku.length > 80) rowErrors.push(`Dòng ${line}: mã SKU cần có từ 1 đến 80 ký tự.`);
      if (!name || name.length > 240) rowErrors.push(`Dòng ${line}: tên sản phẩm cần có từ 1 đến 240 ký tự.`);
      if (category.length > 120) rowErrors.push(`Dòng ${line}: danh mục tối đa 120 ký tự.`);
      if (unit.length > 40) rowErrors.push(`Dòng ${line}: đơn vị tối đa 40 ký tự.`);
      if (barcode && (barcode.length < 3 || barcode.length > 80)) rowErrors.push(`Dòng ${line}: mã vạch phải có từ 3 đến 80 ký tự.`);

      function integerVnd(value, label, required) {
        if (!value && !required) return 0;
        if (!/^\d+$/.test(value)) { rowErrors.push(`Dòng ${line}: ${label} phải là VND nguyên không âm, không dùng dấu phân cách.`); return 0; }
        const amount = Number(value);
        if (!Number.isSafeInteger(amount)) { rowErrors.push(`Dòng ${line}: ${label} vượt giới hạn số an toàn.`); return 0; }
        return amount;
      }
      function quantity(value, label) {
        if (!value) return 0;
        if (!/^\d{1,10}(?:\.\d{1,3})?$/.test(value)) { rowErrors.push(`Dòng ${line}: ${label} phải không âm và có tối đa 3 chữ số thập phân.`); return 0; }
        return value;
      }

      const salePriceVnd = integerVnd(values[5], 'Giá bán', true);
      const costVnd = integerVnd(values[6], 'Giá vốn', false);
      const lowStockThreshold = quantity(values[7], 'Ngưỡng tồn tối thiểu');
      const trackedText = values[8].toLocaleLowerCase('vi');
      let inventoryTracked = true;
      if (trackedText === 'không' || trackedText === 'khong') inventoryTracked = false;
      else if (trackedText && trackedText !== 'có' && trackedText !== 'co') rowErrors.push(`Dòng ${line}: cột theo dõi tồn kho chỉ nhận “Có” hoặc “Không”.`);
      const openingQuantity = quantity(values[9], 'Tồn đầu kỳ');
      if (!inventoryTracked && openingQuantity > 0) rowErrors.push(`Dòng ${line}: sản phẩm không theo dõi tồn kho phải có tồn đầu kỳ bằng 0.`);
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
          const entries = parseVariantAttributesText(variantAttributesText, items.length);
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
      else items.push({ sku: sku, barcode: barcode, name: name, category: category, unit: unit, salePriceVnd: salePriceVnd, costVnd: costVnd, lowStockThreshold: lowStockThreshold, inventoryTracked: inventoryTracked, openingQuantity: openingQuantity, sourceLine: line, ...(variantGroupName ? { variantGroupName: variantGroupName, variantAttributes: variantAttributes } : {}) });
    });
    for (const group of variantGroups.values()) {
      if (group.count < 2) errors.push(`Nhóm “${group.name}” cần ít nhất 2 SKU trong cùng tệp.`);
    }
    return { items: errors.length ? [] : items, errors: errors };
  }

  function parseCustomerImportCsv(text) {
    let parsed;
    try { parsed = parseCsvDocument(text); }
    catch (error) { return { items: [], errors: [error.message] }; }
    const rows = parsed.filter(function (record, index) { return index === 0 || record.cells.some(function (cell) { return String(cell || '').trim() !== ''; }); });
    if (!rows.length) return { items: [], errors: ['Tệp CSV đang trống.'] };
    const headers = rows[0].cells.map(function (cell) { return String(cell || '').trim(); });
    if (headers.length !== customerImportHeaders.length || customerImportHeaders.some(function (header, index) { return headers[index] !== header; })) {
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
      if (cells.length !== customerImportHeaders.length) rowErrors.push(`Dòng ${line}: số cột không khớp mẫu.`);
      const values = customerImportHeaders.map(function (_header, index) { return String(cells[index] || '').trim(); });
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

  function renderCustomerImportPreview() {
    const preview = modal.querySelector('#customer-import-preview');
    if (!preview) return;
    const submit = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = customerImportReading || customerImportErrors.length > 0 || !customerImportRows.length || !customerImportPreviewValid;
    if (customerImportReading) {
      preview.innerHTML = `<div class='install-hint' role='status' aria-live='polite'>Đang đọc tệp và kiểm tra trùng lặp với cửa hàng…</div>`;
      return;
    }
    if (customerImportErrors.length) {
      preview.innerHTML = `<div class='auth-message error' role='alert'>${customerImportErrors.map(esc).join('<br>')}</div>`;
      return;
    }
    if (customerImportConflict) {
      preview.innerHTML = `<div class='auth-message error' role='alert'>${esc(customerImportConflict)}</div>`;
      return;
    }
    if (!customerImportRows.length) {
      preview.innerHTML = `<div class='muted'>Chọn mẫu CSV đã điền để xem trước. Chưa có dữ liệu nào được lưu.</div>`;
      return;
    }
    const balanceTotal = customerImportRows.reduce(function (sum, row) { return sum + BigInt(row.openingBalanceVnd || '0'); }, 0n).toString();
    customerImportBalanceTotalVnd = balanceTotal;
    const checkMessage = customerImportPreviewValid
      ? `<div class='notice-item'><span>✓</span><span><strong>${number(customerImportRows.length)} khách hàng sẵn sàng</strong><small>Chưa có thay đổi nào được ghi. Khi xác nhận, hồ sơ và công nợ mở đầu được lưu nguyên tử; tổng công nợ mở đầu ${moneyVndText(balanceTotal)}.</small></span></div>`
      : `<div class='install-hint'>Đang kiểm tra trùng lặp với cửa hàng…</div>`;
    const table = `<div class='table-wrap'><table class='data-table'><thead><tr><th>Dòng</th><th>Khách hàng</th><th>Email</th><th class='text-right'>Công nợ ban đầu</th></tr></thead><tbody>${customerImportRows.map(function (row) { return `<tr><td>${number(row.sourceLine)}</td><td><span class='product-name-stack'><strong>${esc(row.name)}</strong><small>${esc(row.phone || 'Không có điện thoại')}</small></span></td><td>${esc(row.email || '—')}</td><td class='text-right'>${moneyVndText(row.openingBalanceVnd || '0')}</td></tr>`; }).join('')}</tbody></table></div>`;
    preview.innerHTML = checkMessage + table;
  }

  async function previewCustomerImport(items, generation, readNumber) {
    customerImportReading = true;
    customerImportRows = items;
    customerImportErrors = [];
    customerImportConflict = '';
    customerImportPreviewValid = false;
    renderCustomerImportPreview();
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/customers/import/preview`, {
        method: 'POST', body: { items: items },
      });
      if (generation !== modalGeneration || readNumber !== customerImportReadNumber || modal.hidden) return;
      customerImportReading = false;
      customerImportPreviewValid = result.valid === true && result.count === items.length;
      if (!customerImportPreviewValid) customerImportConflict = result.conflict || 'Máy chủ chưa xác nhận đầy đủ bản xem trước.';
      customerImportBalanceTotalVnd = String(result.openingBalanceTotalVnd || '0');
    } catch (error) {
      if (generation !== modalGeneration || readNumber !== customerImportReadNumber || modal.hidden) return;
      customerImportReading = false;
      customerImportConflict = error.status === 401
        ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi chọn tệp để kiểm tra.'
        : `Chưa đối chiếu được với cửa hàng: ${error.message} Chưa có thay đổi nào được lưu.`;
    }
    renderCustomerImportPreview();
  }

  function openCustomerImport() {
    const pending = loadPendingCustomerImport();
    customerImportReadNumber += 1;
    customerImportReading = false;
    customerImportRows = pending ? pending.payload.items : [];
    customerImportErrors = [];
    customerImportConflict = '';
    customerImportPreviewValid = false;
    const body = `<form id='entity-form' data-form='customer-import'><div class='form-field full'><label class='input-label' for='customer-import-file'>Chọn tệp khách hàng CSV</label><input class='input' id='customer-import-file' type='file' accept='.csv,text/csv' ${pending ? 'disabled' : ''}/></div><div class='modal-note'>Chỉ thêm hồ sơ mới; Slink không tự gộp hoặc ghi đè khách hàng. Số điện thoại/email đang dùng trong cửa hàng hoặc bị lặp trong tệp sẽ chặn toàn bộ lô. Công nợ ban đầu được ghi vào sổ phải thu, không ghi vào sổ tiền mặt. Tối đa 200 dòng và 500 KB; chỉ chủ cửa hàng, quản lý hoặc kế toán được nhập.</div><button class='link-button' type='button' data-action='download-customer-import-template'>Tải mẫu CSV</button><div id='customer-import-preview' class='product-import-preview' aria-live='polite'></div></form>`;
    const footer = `<button class='btn btn-secondary' type='button' data-action='close-modal'>${pending ? 'Để sau' : 'Đóng'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Gửi lại lần nhập đang chờ' : 'Nhập khách hàng'}</button>`;
    showModal(pending ? 'Kiểm tra lần nhập khách hàng đang chờ' : 'Nhập khách hàng từ CSV', pending ? 'Gửi lại đúng nội dung đã lưu trên thiết bị để máy chủ xác nhận, tránh tạo trùng.' : 'Xem lại mọi dòng và công nợ trước khi ghi dữ liệu cửa hàng.', body, footer, true);
    renderCustomerImportPreview();
    if (pending) previewCustomerImport(pending.payload.items, modalGeneration, customerImportReadNumber);
  }

  function downloadCustomerImportTemplate() {
    const csv = '\uFEFF' + customerImportHeaders.map(function (header) { return '"' + header.replace(/"/g, '""') + '"'; }).join(',') + '\r\n';
    download('slink-mau-nhap-khach-hang.csv', csv, 'text/csv;charset=utf-8');
  }

  function parseProductBulkUpdateCsv(text) {
    let parsed;
    try { parsed = parseCsvDocument(text); }
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
          if (field.length > max || (key === 'barcode' && field.length < 3)) rowErrors.push(`Dòng ${line}: ${header} có độ dài không hợp lệ.`);
          else item[key] = field;
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

  function parseStockBulkCountCsv(text) {
    let parsed;
    try { parsed = parseCsvDocument(text); }
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
      else if (warehouseId !== selectedWarehouseId.toLowerCase()) rowErrors.push(`Dòng ${line}: CSV thuộc kho khác với kho đang chọn. Hãy chọn đúng kho hoặc xuất lại tệp.`);
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

  function renderProductImportPreview() {
    const preview = modal.querySelector('#product-import-preview');
    const submit = modal.querySelector('button[type="submit"][form="entity-form"]');
    const warehouseSelect = modal.querySelector('#product-import-warehouse');
    if (!preview) return;
    if (warehouseSelect && !productImportPending) warehouseSelect.disabled = productImportReading;
    if (productImportReading) {
      preview.innerHTML = `<div class='notice-item' role='status'><span>…</span><span><strong>Đang kiểm tra tệp CSV</strong><small>Slink đang kiểm tra dữ liệu và mã trùng trên máy chủ; bước này chưa ghi sản phẩm.</small></span></div>`;
    } else if (productImportErrors.length) {
      preview.innerHTML = `<div class='auth-message error'><strong>Chưa thể nhập tệp.</strong><br/>${productImportErrors.slice(0, 8).map(esc).join('<br/>')}${productImportErrors.length > 8 ? `<br/>Còn ${productImportErrors.length - 8} lỗi khác.` : ''}</div>`;
    } else if (productImportRows.length) {
      const warehouseSummary = productImportWarehouseName && totalImportQuantity(productImportRows) !== '0'
        ? `Tồn đầu kỳ sẽ được ghi vào kho ${esc(productImportWarehouseName)}. ` : '';
      const variantGroupCount = new Set(productImportRows.map(function (item) { return item.variantGroupName?.toLocaleLowerCase('vi'); }).filter(Boolean)).size;
      const variantSummary = variantGroupCount ? ` · ${number(variantGroupCount)} nhóm biến thể` : '';
      preview.innerHTML = `<div class='notice-item'><span>✓</span><span><strong>${number(productImportRows.length)} sản phẩm sẵn sàng xem trước${variantSummary}</strong><small>${warehouseSummary}Tổng tồn đầu kỳ: ${totalImportQuantity(productImportRows)}. Cuộn trong bảng để rà soát toàn bộ; mọi dòng sẽ được ghi cùng nhau hoặc không dòng nào được ghi.</small></span></div><div class='table-wrap'><table class='data-table'><thead><tr><th>SKU / mã vạch</th><th>Sản phẩm</th><th class='text-right'>Giá bán / giá vốn</th><th class='text-right'>Tồn đầu kỳ / ngưỡng</th><th>Theo dõi tồn</th></tr></thead><tbody>${productImportRows.map(function (item) { const attributes = Object.entries(item.variantAttributes || {}).map(function (entry) { return `${entry[0]}=${entry[1]}`; }).join('; '); const displayName = item.variantGroupName ? `${item.variantGroupName} · ${Object.values(item.variantAttributes || {}).join(' · ')}` : item.name; return `<tr><td><span class='product-name-stack'><strong>${esc(item.sku)}</strong><small>Mã vạch: ${esc(item.barcode || 'Không có')}</small></span></td><td><span class='product-name-stack'><strong>${esc(displayName)}</strong><small>${item.variantGroupName ? `Nhóm ${esc(item.variantGroupName)} · ${esc(attributes)}` : `${esc(item.category)} · ${esc(item.unit)}`}</small></span></td><td class='text-right'><span class='product-name-stack'><strong>${money(Number(item.salePriceVnd))}</strong><small>Giá vốn ${money(Number(item.costVnd))}</small></span></td><td class='text-right'><span class='product-name-stack'><strong>${formatImportQuantity(item.openingQuantity)} ${esc(item.unit)}</strong><small>Nhắc khi còn ${formatImportQuantity(item.lowStockThreshold)}</small></span></td><td>${item.inventoryTracked ? 'Có' : 'Không'}</td></tr>`; }).join('')}</tbody></table></div>`;
    } else preview.innerHTML = `<div class='empty-state'><strong>Chưa chọn tệp</strong><span>Tải mẫu CSV, điền danh mục rồi chọn tệp để kiểm tra trước khi gửi.</span></div>`;
    const selectedWarehouseId = warehouseSelect?.value || '';
    const verified = productImportPending || productImportVerifiedWarehouseId === selectedWarehouseId;
    if (submit) submit.disabled = productImportReading || productImportRows.length === 0 || productImportErrors.length > 0 || !verified;
  }

  async function previewProductImportAtWarehouse(items) {
    const readNumber = ++productImportReadNumber;
    const readGeneration = modalGeneration;
    const warehouseSelect = modal.querySelector('#product-import-warehouse');
    const warehouseId = warehouseSelect?.value || '';
    productImportReading = true;
    productImportRows = [];
    productImportErrors = [];
    productImportVerifiedWarehouseId = '';
    productImportWarehouseName = '';
    renderProductImportPreview();
    if (!warehouseId) {
      productImportReading = false;
      productImportErrors = ['Cửa hàng chưa có kho đang hoạt động được phép nhận tồn đầu kỳ.'];
      renderProductImportPreview();
      return;
    }
    try {
      const previewResult = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/products/import/preview`, {
        method: 'POST', body: { items, warehouseId },
      });
      if (readGeneration !== modalGeneration || readNumber !== productImportReadNumber || modal.hidden) return;
      productImportReading = false;
      if (!previewResult.valid) productImportErrors = [previewResult.conflict || 'Tệp có mã sản phẩm đã tồn tại trong cửa hàng.'];
      else if (previewResult.warehouseId !== warehouseId) productImportErrors = ['Kho xem trước đã thay đổi. Hãy chọn lại kho để kiểm tra.'];
      else {
        productImportRows = items;
        productImportVerifiedWarehouseId = previewResult.warehouseId;
        productImportWarehouseName = previewResult.warehouseName || '';
      }
    } catch (error) {
      if (readGeneration !== modalGeneration || readNumber !== productImportReadNumber || modal.hidden) return;
      productImportReading = false;
      productImportErrors = [error.status === 401
        ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi chọn tệp để kiểm tra.'
        : `Chưa kiểm tra được dữ liệu với cửa hàng: ${error.message} Tệp chưa được nhập.`];
    }
    renderProductImportPreview();
  }

  function renderProductBulkUpdatePreview() {
    const preview = modal.querySelector('#product-bulk-update-preview');
    const submit = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (!preview) return;
    if (productBulkUpdateReading) {
      preview.innerHTML = `<div class='notice-item' role='status'><span>…</span><span><strong>Đang đối chiếu tệp CSV</strong><small>Slink đang kiểm tra phiên bản và mã trùng trên máy chủ; bước này chưa lưu thay đổi.</small></span></div>`;
    } else if (productBulkUpdateErrors.length) {
      preview.innerHTML = `<div class='auth-message error'><strong>Chưa thể cập nhật tệp.</strong><br/>${productBulkUpdateErrors.slice(0, 8).map(esc).join('<br/>')}${productBulkUpdateErrors.length > 8 ? `<br/>Còn ${productBulkUpdateErrors.length - 8} lỗi khác.` : ''}</div>`;
    } else if (productBulkUpdateRows.length) {
      const labels = { sku: 'SKU', barcode: 'Mã vạch', name: 'Tên', category: 'Danh mục', unit: 'Đơn vị', salePriceVnd: 'Giá bán', costVnd: 'Giá vốn', lowStockThreshold: 'Ngưỡng tồn' };
      const changedCount = productBulkUpdateRows.filter(function (item) { return !item.unchanged; }).length;
      const unchangedCount = productBulkUpdateRows.length - changedCount;
      const displayValue = function (key, value) {
        if (key === 'salePriceVnd' || key === 'costVnd') return money(Number(value));
        if (key === 'lowStockThreshold') return formatImportQuantity(value);
        return esc(value || (key === 'barcode' ? 'Không có' : 'Trống'));
      };
      preview.innerHTML = `<div class='notice-item'><span>✓</span><span><strong>${number(productBulkUpdateRows.length)} dòng · ${number(changedCount)} có thay đổi · ${number(unchangedCount)} giữ nguyên</strong><small>Giá trị “trước” được lấy trực tiếp từ cửa hàng. Khi lưu, máy chủ sẽ khóa và kiểm tra lại toàn bộ lô; nếu một dòng lỗi hoặc đã đổi, mọi cập nhật đều bị hủy.</small></span></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Dòng / mã sản phẩm</th><th>Giá trị hiện tại → giá trị mới</th></tr></thead><tbody>${productBulkUpdateRows.map(function (item) { const keys = Object.keys(labels).filter(function (key) { return Object.hasOwn(item, key) || (key === 'barcode' && item.clearBarcode); }); const changes = keys.map(function (key) { const before = item.before && Object.hasOwn(item.before, key) ? displayValue(key, item.before[key]) : 'Không có trong tệp'; const after = item.clearBarcode && key === 'barcode' ? 'Xóa mã vạch' : displayValue(key, item[key]); return `<span class='product-name-stack'><strong>${labels[key]}</strong><small>${before} → ${after}</small></span>`; }).join(''); return `<tr><td><span class='product-name-stack'><strong>Dòng ${number(item.sourceLine)}</strong><small>${esc(item.productId)}</small>${item.unchanged ? '<small>Không đổi</small>' : ''}</span></td><td>${changes}</td></tr>`; }).join('')}</tbody></table></div>`;
    } else {
      preview.innerHTML = `<div class='empty-state'><strong>Chưa chọn tệp</strong><span>Xuất danh sách sản phẩm, sửa những cột cần thiết rồi tải CSV lên để xem trước.</span></div>`;
    }
    if (submit) submit.disabled = productBulkUpdateReading || productBulkUpdateRows.length === 0 || productBulkUpdateErrors.length > 0;
  }

  function renderStockBulkCountPreview() {
    const preview = modal.querySelector('#stock-bulk-count-preview');
    const submit = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (!preview) return;
    if (stockBulkCountReading) {
      preview.innerHTML = `<div class='notice-item' role='status'><span>…</span><span><strong>Đang đối chiếu số đếm</strong><small>Slink đang kiểm tra phiên bản tồn kho và lượng hàng được giữ; chưa ghi thay đổi nào.</small></span></div>`;
    } else if (stockBulkCountErrors.length) {
      preview.innerHTML = `<div class='auth-message error'><strong>Chưa thể kiểm kê lô này.</strong><br/>${stockBulkCountErrors.slice(0, 8).map(esc).join('<br/>')}${stockBulkCountErrors.length > 8 ? `<br/>Còn ${stockBulkCountErrors.length - 8} lỗi khác.` : ''}</div>`;
    } else if (stockBulkCountRows.length) {
      const changedCount = stockBulkCountRows.filter(function (item) { return !item.unchanged; }).length;
      const unchangedCount = stockBulkCountRows.length - changedCount;
      preview.innerHTML = `<div class='notice-item'><span>✓</span><span><strong>${number(stockBulkCountRows.length)} dòng đã sẵn sàng · ${number(changedCount)} có chênh lệch</strong><small>${number(unchangedCount)} dòng giữ nguyên. Khi xác nhận, máy chủ sẽ khóa và kiểm tra lại toàn bộ lô; nếu một dòng đã đổi hoặc không hợp lệ, toàn bộ lô bị hủy.</small></span></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Dòng</th><th>Sản phẩm</th><th class='text-right'>Tồn hiện tại</th><th class='text-right'>Đang giữ</th><th class='text-right'>Số đếm mới</th><th class='text-right'>Chênh lệch</th></tr></thead><tbody>${stockBulkCountRows.map(function (item) { return `<tr><td>${number(item.sourceLine)}</td><td><span class='product-name-stack'><strong>${esc(item.name)}</strong><small>${esc(item.sku)} · ${esc(item.unit)}</small></span></td><td class='text-right'>${formatImportQuantity(item.onHand)}</td><td class='text-right'>${formatImportQuantity(item.reserved)}</td><td class='text-right'><strong>${formatImportQuantity(item.counted)}</strong></td><td class='text-right'><span class='stock-number ${item.delta.startsWith('-') ? 'low' : ''}'>${item.delta.startsWith('-') ? '−' : item.delta === '0' ? '' : '+'}${formatImportQuantity(item.delta.replace(/^-/, ''))}</span></td></tr>`; }).join('')}</tbody></table></div>`;
    } else {
      preview.innerHTML = `<div class='empty-state'><strong>Chưa chọn tệp kiểm kê</strong><span>Xuất CSV Tồn kho, điền cột “Tồn đếm mới” cho tối đa 200 sản phẩm rồi tải lại tệp tại đây.</span></div>`;
    }
    if (submit) submit.disabled = stockBulkCountReading || stockBulkCountRows.length === 0 || stockBulkCountErrors.length > 0;
  }

  function openStockBulkCount() {
    if (!warehouses.some(function (warehouse) { return warehouse.id === selectedWarehouseId; })) return toast('Chưa chọn kho', 'Chọn kho cần kiểm kê rồi thử lại.', 'error');
    const pending = loadPendingStockBulkCount();
    stockBulkCountReading = false;
    stockBulkCountRows = pending && Array.isArray(pending.payload.preview) ? pending.payload.preview : [];
    stockBulkCountErrors = [];
    const disabled = pending ? 'disabled' : '';
    const savedReason = pending ? pending.payload.reason : 'Kiểm kê hàng loạt';
    const body = `<form id='entity-form' data-form='stock-bulk-count'><div class='form-field full'><label class='input-label' for='stock-bulk-count-file'>Chọn tệp CSV tồn kho đã điền số đếm</label><input class='input' id='stock-bulk-count-file' type='file' accept='.csv,text/csv' ${disabled}/></div><div class='form-field full'><label class='input-label' for='stock-bulk-count-reason'>Lý do kiểm kê *</label><input class='input' id='stock-bulk-count-reason' name='reason' value='${esc(savedReason)}' maxlength='500' required ${disabled}/></div><div class='modal-note'>Trước tiên xuất “Tồn kho” bằng nút CSV. Giữ nguyên “Mã sản phẩm” và “Phiên bản tồn kho”, chỉ điền “Tồn đếm mới”. Mỗi lô tối đa 200 sản phẩm; số lượng dùng dấu chấm cho phần thập phân. Một dòng lỗi hoặc dữ liệu tồn đã thay đổi sẽ hủy cả lô. Số đếm không thể thấp hơn lượng đang giữ cho đơn hàng.</div><div id='stock-bulk-count-preview' class='product-import-preview' aria-live='polite'></div></form>`;
    const footer = `<button class='btn btn-secondary' type='button' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Gửi lại lô kiểm kê đang chờ' : 'Ghi nhận kiểm kê'}</button>`;
    showModal(pending ? 'Kiểm tra lô kiểm kê đang chờ' : 'Kiểm kê nhiều sản phẩm', pending ? 'Gửi lại đúng lô trước đó để xác nhận kết quả, không ghi trùng.' : 'Xem lại chênh lệch trước khi ghi sổ tồn kho.', body, footer, true);
    renderStockBulkCountPreview();
  }

  function openProductBulkUpdate() {
    const pending = loadPendingProductBulkUpdate();
    productBulkUpdateReading = false;
    productBulkUpdateRows = pending ? pending.payload.items : [];
    productBulkUpdateErrors = [];
    const body = `<form id='entity-form' data-form='product-bulk-update'><div class='form-field full'><label class='input-label' for='product-bulk-update-file'>Chọn tệp sản phẩm đã chỉnh sửa</label><input class='input' id='product-bulk-update-file' type='file' accept='.csv,text/csv' ${pending ? 'disabled' : ''}/></div><div class='modal-note'>Trước tiên chọn “Xuất CSV” và tải dữ liệu Sản phẩm. Giữ nguyên Mã sản phẩm và Phiên bản dữ liệu; chỉ điền các cột bắt đầu bằng “Cập nhật” hoặc có chữ “mới”. Cột “Xóa mã vạch” ghi “Có” để xóa mã hiện tại; không thể vừa xóa vừa thay mã. Các cột hiện tại chỉ để tham khảo. Ô cập nhật trống nghĩa là giữ nguyên dữ liệu; dòng không có ô cập nhật sẽ được bỏ qua. Tối đa 200 sản phẩm có thay đổi mỗi lần; giá nhập bằng VND nguyên. Nếu sản phẩm đã thay đổi sau lúc xuất tệp, Slink sẽ hủy cả lô và yêu cầu xuất lại.</div><div id='product-bulk-update-preview' class='product-import-preview' aria-live='polite'></div></form>`;
    const footer = `<button class='btn btn-secondary' type='button' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Gửi lại cập nhật đang chờ' : 'Cập nhật sản phẩm'}</button>`;
    showModal(pending ? 'Kiểm tra cập nhật đang chờ' : 'Cập nhật nhiều sản phẩm', pending ? 'Gửi lại đúng lô trước đó để Slink kiểm tra kết quả, không nhân đôi thay đổi.' : 'Xem lại các giá trị trước khi lưu đồng thời lên máy chủ.', body, footer, true);
    renderProductBulkUpdatePreview();
  }

  function openProductImport() {
    const pending = loadPendingProductImport();
    productImportReading = false;
    productImportPending = Boolean(pending);
    productImportRows = pending ? pending.payload.items : [];
    productImportSourceRows = pending ? pending.payload.items : [];
    productImportErrors = [];
    const requestedWarehouseId = pending ? (pending.payload.warehouseId || '') : (warehouses.some(function (warehouse) { return warehouse.id === selectedWarehouseId; }) ? selectedWarehouseId : (warehouses[0]?.id || ''));
    const selectedWarehouse = warehouses.find(function (warehouse) { return warehouse.id === requestedWarehouseId; });
    productImportVerifiedWarehouseId = pending ? requestedWarehouseId : '';
    productImportWarehouseName = selectedWarehouse?.name || '';
    const warehouseOptions = warehouses.map(function (warehouse) {
      return `<option value='${esc(warehouse.id)}' ${warehouse.id === requestedWarehouseId ? 'selected' : ''}>${esc(warehouse.name)}${warehouse.is_default ? ' · Mặc định' : ''}</option>`;
    }).join('');
    const body = `<form id='entity-form' data-form='product-import'><div class='form-field full'><label class='input-label' for='product-import-file'>Chọn tệp danh mục CSV</label><input class='input' id='product-import-file' type='file' accept='.csv,text/csv' ${pending ? 'disabled' : ''}/></div><div class='form-field full'><label class='input-label' for='product-import-warehouse'>Kho nhận tồn đầu kỳ</label><select class='input' id='product-import-warehouse' ${pending || !warehouses.length ? 'disabled' : ''}>${warehouseOptions || `<option value=''>Không có kho đang hoạt động</option>`}</select><small>Tồn đầu kỳ trong tệp sẽ được ghi vào kho này; các kho còn lại bắt đầu ở mức 0. Chọn kho khác sẽ kiểm tra lại tệp trước khi nhập.</small></div><div class='modal-note'>Tối đa 200 sản phẩm mỗi lần. Giá bán và giá vốn nhập bằng VND nguyên, không dùng dấu phân cách hàng nghìn. Tồn đầu kỳ hỗ trợ tối đa 3 chữ số thập phân. Hai cột cuối cho phép nhóm ít nhất 2 SKU bằng cùng tên nhóm và thuộc tính; để trống nếu sản phẩm đơn lẻ. Mã trùng sẽ hủy toàn bộ lần nhập.</div><button class='link-button' type='button' data-action='download-product-import-template'>Tải mẫu CSV</button><div id='product-import-preview' class='product-import-preview' aria-live='polite'></div></form>`;
    const footer = `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Gửi lại lần nhập đang chờ' : 'Nhập sản phẩm'}</button>`;
    showModal(pending ? 'Kiểm tra lần nhập đang chờ' : 'Nhập sản phẩm từ CSV', pending ? 'Gửi lại cùng nội dung để máy chủ xác nhận mà không tạo trùng.' : 'Xem trước tệp. Tồn đầu kỳ và danh mục sẽ được ghi nguyên tử trên máy chủ.', body, footer, true);
    renderProductImportPreview();
  }

  function downloadProductImportTemplate() {
    const csv = '\uFEFF' + productImportHeaders.map(function (header) { return '"' + header.replace(/"/g, '""') + '"'; }).join(',') + '\r\n';
    download('slink-mau-nhap-san-pham.csv', csv, 'text/csv;charset=utf-8');
  }

  function openProduct(id) {
    const p = id ? productById(id) : null;
    const grouped = Boolean(p?.variantGroupId);
    const displayedName = grouped
      ? `<div class='form-field full'><label class='input-label'>Tên biến thể *</label><input class='input' name='name' value='${esc(p.name)}' required maxlength='240' readonly/><small>Tên được ghép từ nhóm “${esc(p.variantGroupName)}” và thuộc tính bên dưới.</small></div>`
      : `<div class='form-field full'><label class='input-label'>Tên sản phẩm *</label><input class='input' name='name' value='${esc(p ? p.name : '')}' placeholder='Ví dụ: Cà phê rang xay' required maxlength='240'/></div>`;
    const variantAttributes = grouped
      ? `<div class='form-field full'><label class='input-label' for='product-variant-attributes'>Thuộc tính biến thể *</label><input class='input' id='product-variant-attributes' name='variantAttributesText' value='${esc(Object.entries(p.variantAttributes || {}).map(function (entry) { return `${entry[0]}=${entry[1]}`; }).join('; '))}' placeholder='Màu=Đỏ; Kích cỡ=M' required/><small>Giữ nguyên tên thuộc tính của nhóm; bạn có thể sửa giá trị. Thuộc tính không làm thay đổi tồn kho.</small></div>` : '';
    const form = `<form id='entity-form' data-form='product' data-id='${p ? p.id : ''}' data-version='${p ? p.version : ''}'><div class='form-grid'>${displayedName}${variantAttributes}<div class='form-field'><label class='input-label'>Mã SKU *</label><input class='input' name='sku' value='${esc(p ? p.sku : '')}' placeholder='VD: CF-250' required maxlength='80'/></div><div class='form-field'><label class='input-label'>Mã vạch</label><input class='input' name='barcode' value='${esc(p ? p.barcode : '')}' placeholder='Nhập mã vạch nếu có' maxlength='80'/></div><div class='form-field'><label class='input-label'>Danh mục</label><input class='input' name='category' list='categories' value='${esc(p ? p.category : '')}' placeholder='Chọn hoặc nhập mới' ${grouped ? 'readonly' : ''}/><datalist id='categories'>${Array.from(new Set(store.products.map(function (x) { return x.category; }))).map(function (x) { return `<option value='${esc(x)}'></option>`; }).join('')}</datalist></div><div class='form-field'><label class='input-label'>Đơn vị tính</label><input class='input' name='unit' value='${esc(p ? p.unit : 'cái')}' placeholder='cái, hộp, kg' maxlength='40' ${grouped ? 'readonly' : ''}/></div><div class='form-field'><label class='input-label'>Giá bán (VND) *</label><input class='input' name='price' type='number' min='0' step='1' value='${p ? p.price : ''}' placeholder='0' required/></div><div class='form-field'><label class='input-label'>Giá vốn (VND)</label><input class='input' name='cost' type='number' min='0' step='1' value='${p ? p.cost : ''}' placeholder='0'/></div><div class='form-field'><label class='input-label'>Nhắc khi còn</label><input class='input' name='minStock' type='number' min='0' step='0.001' value='${p ? p.minStock : '5'}'/></div>${p ? `<div class='form-field'><label class='input-label'>Tồn kho hiện tại</label><div class='input' aria-readonly='true'>${number(p.stock)} ${esc(p.unit)}</div></div>` : `<div class='form-field full'><div class='modal-note'>Sản phẩm mới bắt đầu với tồn kho bằng 0. Số lượng chỉ thay đổi qua nghiệp vụ kho.</div></div>`}</div><label class='install-hint' style='display:flex;align-items:flex-start;gap:9px;grid-column:1/-1'><input type='checkbox' name='inventoryTracked' ${!p || p.inventoryTracked ? 'checked' : ''} style='margin-top:2px;flex:none'/><span><strong>Theo dõi tồn kho</strong><small style='display:block;margin-top:4px'>Tắt cho dịch vụ hoặc mặt hàng không quản lý số lượng. Trước khi tắt, cần điều chỉnh tồn và lượng đang giữ về 0.</small></span></label></div></form>`;
    const footer = `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button>${grouped ? `<button class='btn btn-secondary' type='button' data-action='add-product-to-existing-variant-group' data-id='${p.id}'>Thêm SKU vào nhóm</button>` : ''}${p && ['owner', 'manager', 'stockkeeper'].includes(store.role) ? `<button class='btn btn-secondary' type='button' data-action='adjust-stock' data-id='${p.id}'>Kiểm kê tồn</button>` : ''}${p && ['owner', 'manager', 'stockkeeper', 'accountant'].includes(store.role) ? `<button class='btn btn-secondary' type='button' data-action='product-price-history' data-id='${p.id}'>Lịch sử giá</button>` : ''}${p ? `<button class='btn btn-danger' type='button' data-action='archive-product' data-id='${p.id}'>Lưu trữ</button>` : ''}<button class='btn btn-primary' type='submit' form='entity-form'>${p ? 'Lưu thay đổi' : 'Thêm sản phẩm'}</button>`;
    showModal(p ? 'Cập nhật sản phẩm' : 'Thêm sản phẩm mới', p ? 'Chỉnh sửa thông tin sản phẩm. Tồn kho được theo dõi riêng.' : 'Thêm một mặt hàng vào danh mục cửa hàng.', form, footer, true);
  }

  function openProductVariantAdd(productId) {
    const product = productById(productId);
    if (!product?.variantGroupId) return toast('Chưa thể thêm biến thể', 'Sản phẩm không thuộc một nhóm biến thể.', 'error');
    const pending = loadPendingProductVariantAdd();
    if (pending && pending.productId !== product.id) return toast('Còn một SKU đang chờ', 'Hãy mở đúng nhóm biến thể đó để xác nhận thao tác đang chờ.', 'error');
    const payload = pending?.payload || { variants: [] };
    const row = payload.variants[0] || null;
    const rows = row ? productVariantRow(row, 0, true, 1) : productVariantRow(null, 0, false, 1);
    const body = `<form id='entity-form' data-form='product-variant-add' data-id='${esc(product.id)}'><div class='modal-note'>Thêm SKU vào nhóm “${esc(product.variantGroupName)}”. Nhập cùng bộ tên thuộc tính đang dùng trong nhóm. SKU mới bắt đầu tồn bằng 0.</div><div id='product-variant-rows'>${rows}</div>${pending ? `<div class='modal-note'>Lần thêm này đang chờ máy chủ xác nhận. Gửi lại để dùng đúng nội dung và mã thao tác cũ.</div>` : ''}</form>`;
    const footer = `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Gửi lại cùng SKU' : 'Thêm biến thể'}</button>`;
    showModal(pending ? 'Xác nhận SKU đang chờ' : 'Thêm SKU vào nhóm', 'Mã SKU và thuộc tính được kiểm tra trước khi lưu.', body, footer, true);
  }

  function productVariantRow(variant, index, disabled, rowCount) {
    const attrs = Array.isArray(variant?.attributes)
      ? variant.attributes.map(function (item) { return `${item.name}=${item.value}`; }).join('; ')
      : '';
    const attrValue = typeof variant?.attributesText === 'string' ? variant.attributesText : attrs;
    return `<section class='purchase-line-card' data-product-variant-row><div class='purchase-line-head'><strong>Biến thể ${number(index + 1)}</strong><button class='link-button' type='button' data-action='remove-product-variant' ${disabled || rowCount <= 2 ? 'disabled' : ''}>Xóa dòng</button></div><div class='form-grid'><div class='form-field'><label class='input-label'>SKU *</label><input class='input' data-variant-sku value='${esc(variant?.sku || '')}' maxlength='80' required ${disabled ? 'disabled' : ''}/></div><div class='form-field'><label class='input-label'>Mã vạch</label><input class='input' data-variant-barcode value='${esc(variant?.barcode || '')}' maxlength='80' ${disabled ? 'disabled' : ''}/></div><div class='form-field full'><label class='input-label'>Thuộc tính *</label><input class='input' data-variant-attributes value='${esc(attrValue)}' placeholder='Màu=Đỏ; Kích cỡ=M' required ${disabled ? 'disabled' : ''}/><small>Nhập cặp Tên=Giá trị, phân tách bằng dấu chấm phẩy.</small></div><div class='form-field'><label class='input-label'>Giá bán (VND) *</label><input class='input' data-variant-price type='number' min='0' step='1' value='${esc(variant?.salePriceVnd ?? '')}' required ${disabled ? 'disabled' : ''}/></div><div class='form-field'><label class='input-label'>Giá vốn (VND)</label><input class='input' data-variant-cost type='number' min='0' step='1' value='${esc(variant?.costVnd ?? '0')}' ${disabled ? 'disabled' : ''}/></div><div class='form-field'><label class='input-label'>Nhắc khi còn</label><input class='input' data-variant-threshold type='number' min='0' step='0.001' value='${esc(variant?.lowStockThreshold ?? '5')}' ${disabled ? 'disabled' : ''}/></div><label class='install-hint' style='display:flex;align-items:flex-start;gap:9px'><input data-variant-tracked type='checkbox' ${variant?.inventoryTracked === false ? '' : 'checked'} ${disabled ? 'disabled' : ''} style='margin-top:2px;flex:none'/><span><strong>Theo dõi tồn kho</strong></span></label></div></section>`;
  }

  function openProductVariantGroup(initialPayload) {
    const pending = loadPendingProductVariantGroup();
    const payload = pending?.payload || initialPayload || null;
    const disabled = Boolean(pending);
    const rows = payload
      ? payload.variants.map(function (variant, index) { return productVariantRow(variant, index, disabled, payload.variants.length); }).join('')
      : productVariantRow(null, 0, false, 2) + productVariantRow(null, 1, false, 2);
    const form = `<form id='entity-form' data-form='product-variants' data-pending='${disabled ? 'true' : 'false'}'><div class='form-grid'><div class='form-field full'><label class='input-label'>Tên nhóm sản phẩm *</label><input class='input' name='name' value='${esc(payload?.name || '')}' maxlength='200' placeholder='Ví dụ: Áo thun cotton' required ${disabled ? 'disabled' : ''}/></div><div class='form-field'><label class='input-label'>Danh mục</label><input class='input' name='category' value='${esc(payload?.category || 'Chưa phân loại')}' maxlength='120' ${disabled ? 'disabled' : ''}/></div><div class='form-field'><label class='input-label'>Đơn vị</label><input class='input' name='unit' value='${esc(payload?.unit || 'cái')}' maxlength='40' ${disabled ? 'disabled' : ''}/></div></div><div class='modal-note'>Mỗi biến thể có SKU, mã vạch, tồn và giá riêng. Các biến thể cùng nhóm dùng thuộc tính như màu hoặc kích cỡ. Tồn bắt đầu từ 0 và chỉ thay đổi qua nghiệp vụ kho.</div><div id='product-variant-rows'>${rows}</div><button class='btn btn-secondary' type='button' data-action='add-product-variant' ${disabled ? 'disabled' : ''}>＋ Thêm biến thể</button>${disabled ? `<div class='modal-note'>Lần lưu này đang chờ máy chủ xác nhận. Gửi lại để dùng đúng nội dung và mã thao tác cũ.</div>` : ''}</form>`;
    showModal(disabled ? 'Xác nhận nhóm biến thể đang chờ' : 'Tạo nhóm biến thể', 'Thêm các SKU có màu, kích cỡ hoặc thuộc tính riêng; từng biến thể có tồn kho và giá bán độc lập.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-primary' type='submit' form='entity-form'>${disabled ? 'Gửi lại cùng nhóm' : 'Tạo nhóm'}</button>`, true);
  }

  function productPriceSourceName(source) {
    return ({ created: 'Tạo sản phẩm', csv_import: 'Nhập danh mục CSV', manual_adjustment: 'Điều chỉnh thủ công', bulk_update: 'Cập nhật danh mục hàng loạt', migration_baseline: 'Giá tại thời điểm bắt đầu ghi lịch sử' })[source] || 'Cập nhật giá';
  }

  function renderProductPriceHistory() {
    if (productPriceHistoryState.loading && !productPriceHistoryState.history.length) {
      return `<div class='empty-state product-price-history-empty'><strong>Đang tải lịch sử giá…</strong></div>`;
    }
    if (productPriceHistoryState.error && !productPriceHistoryState.history.length) {
      return `<div class='auth-message error'>${esc(productPriceHistoryState.error)} <button class='link-button' data-action='product-price-history' data-id='${productPriceHistoryState.productId}'>Thử lại</button></div>`;
    }
    const entries = productPriceHistoryState.history.map(function (entry) {
      const transition = entry.previous_price_vnd === null
        ? `<strong>${moneyVndText(entry.new_price_vnd)}</strong>`
        : `<span>${moneyVndText(entry.previous_price_vnd)}</span><b aria-hidden='true'>→</b><strong>${moneyVndText(entry.new_price_vnd)}</strong>`;
      return `<article class='product-price-history-entry'><i aria-hidden='true'></i><div class='product-price-history-copy'><div class='product-price-history-top'><strong>${esc(productPriceSourceName(entry.source_type))}</strong><time datetime='${esc(entry.created_at)}'>${esc(humanDate(entry.created_at, true))}</time></div><div class='product-price-history-transition'>${transition}</div><small>${entry.actor_name ? `Thực hiện bởi ${esc(entry.actor_name)}` : entry.source_type === 'migration_baseline' ? 'Mốc khởi tạo từ dữ liệu hiện có' : 'Không có thông tin người thực hiện'}</small></div></article>`;
    }).join('');
    const baselineNote = productPriceHistoryState.historyStartsAtMigrationBaseline
      ? `<p class='product-price-history-note'>Lịch sử bắt đầu ghi từ ngày cập nhật này. Các lần đổi giá trước đó không thể khôi phục.</p>` : '';
    const currentPrice = productPriceHistoryState.currentPriceVnd !== null
      ? `<div class='product-price-current'><span>Giá bán hiện tại</span><strong>${moneyVndText(productPriceHistoryState.currentPriceVnd)}</strong></div>` : '';
    const loadMore = productPriceHistoryState.nextCursor
      ? `<button class='btn btn-secondary' type='button' data-action='load-more-product-price-history' ${productPriceHistoryState.loading ? 'disabled' : ''}>${productPriceHistoryState.loading ? 'Đang tải…' : 'Xem thay đổi cũ hơn'}</button>` : '';
    return `<div aria-live='polite'>${currentPrice}${baselineNote}<div class='product-price-history-list'>${entries || `<div class='empty-state product-price-history-empty'><strong>Chưa có lịch sử giá</strong></div>`}</div>${productPriceHistoryState.error ? `<div class='auth-message error'>${esc(productPriceHistoryState.error)}</div>` : ''}${loadMore ? `<div class='product-price-history-more'>${loadMore}</div>` : ''}</div>`;
  }

  function paintProductPriceHistory(generation) {
    if (generation !== modalGeneration || modal.hidden) return;
    const body = modal.querySelector('.modal-body');
    if (body) body.innerHTML = renderProductPriceHistory();
    const footer = modal.querySelector('.modal-footer');
    if (footer) footer.innerHTML = `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button>`;
  }

  async function openProductPriceHistory(productId) {
    if (!['owner', 'manager', 'stockkeeper', 'accountant'].includes(store.role)) return toast('Không có quyền', 'Vai trò của bạn không được xem lịch sử giá sản phẩm.', 'error');
    const product = productById(productId);
    if (!productId || !store.id) return;
    const requestNumber = ++productPriceHistoryRequestNumber;
    productPriceHistoryState = { productId, currentPriceVnd: null, history: [], nextCursor: null, loading: true, error: '', historyStartsAtMigrationBaseline: false };
    showModal('Lịch sử giá bán', product ? `${product.name} · ${product.sku}` : 'Thay đổi giá bán đã lưu trong cửa hàng.', renderProductPriceHistory(), `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button>`, true);
    const generation = modalGeneration;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/products/${encodeURIComponent(productId)}/price-history?limit=30`);
      if (requestNumber !== productPriceHistoryRequestNumber || generation !== modalGeneration || modal.hidden) return;
      productPriceHistoryState.currentPriceVnd = result.product?.current_price_vnd ?? null;
      productPriceHistoryState.history = result.history || [];
      productPriceHistoryState.nextCursor = result.nextCursor || null;
      productPriceHistoryState.historyStartsAtMigrationBaseline = result.historyStartsAtMigrationBaseline === true;
      productPriceHistoryState.loading = false;
      paintProductPriceHistory(generation);
    } catch (error) {
      if (requestNumber !== productPriceHistoryRequestNumber || generation !== modalGeneration || modal.hidden) return;
      productPriceHistoryState.loading = false;
      productPriceHistoryState.error = error.message;
      paintProductPriceHistory(generation);
    }
  }

  async function loadMoreProductPriceHistory() {
    if (productPriceHistoryState.loading || !productPriceHistoryState.nextCursor) return;
    const requestNumber = ++productPriceHistoryRequestNumber;
    const generation = modalGeneration;
    productPriceHistoryState.loading = true;
    productPriceHistoryState.error = '';
    paintProductPriceHistory(generation);
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/products/${encodeURIComponent(productPriceHistoryState.productId)}/price-history?limit=30&before=${encodeURIComponent(productPriceHistoryState.nextCursor)}`);
      if (requestNumber !== productPriceHistoryRequestNumber || generation !== modalGeneration || modal.hidden) return;
      productPriceHistoryState.history = productPriceHistoryState.history.concat(result.history || []);
      productPriceHistoryState.nextCursor = result.nextCursor || null;
      productPriceHistoryState.loading = false;
      paintProductPriceHistory(generation);
    } catch (error) {
      if (requestNumber !== productPriceHistoryRequestNumber || generation !== modalGeneration || modal.hidden) return;
      productPriceHistoryState.loading = false;
      productPriceHistoryState.error = error.message;
      paintProductPriceHistory(generation);
    }
  }

  function openCustomer(id) {
    const c = id ? customerById(id) : null;
    const pending = !c ? loadPendingCustomer() : null;
    const saved = pending ? pending.payload : c;
    const disabled = pending ? 'disabled' : '';
    const canSetOpeningBalance = ['owner', 'manager', 'accountant'].includes(store.role);
    const openingField = !c && canSetOpeningBalance ? `<div class='form-field full'><label class='input-label' for='customer-opening-balance'>Công nợ ban đầu (VND)</label><input class='input' id='customer-opening-balance' name='openingBalanceVnd' type='number' inputmode='numeric' min='0' step='1' value='${esc(saved ? saved.openingBalanceVnd : '0')}' ${disabled}/><small>Số khách còn nợ trước khi bắt đầu dùng Slink. Đây là bút toán công nợ, không ghi tiền vào sổ thu chi.</small></div>` : '';
    const form = `<form id='entity-form' data-form='customer' data-id='${c ? c.id : ''}' data-version='${c ? c.version : ''}'><div class='form-grid'><div class='form-field'><label class='input-label'>Tên khách hàng *</label><input class='input' name='name' value='${esc(saved ? saved.name : '')}' required maxlength='160' placeholder='Họ và tên' ${disabled}/></div><div class='form-field'><label class='input-label'>Số điện thoại</label><input class='input' name='phone' value='${esc(saved ? saved.phone : '')}' inputmode='tel' placeholder='09xx xxx xxx' ${disabled}/></div><div class='form-field full'><label class='input-label'>Email (không bắt buộc)</label><input class='input' type='email' name='email' value='${esc(saved ? saved.email : '')}' placeholder='ten@example.com' ${disabled}/></div>${openingField}<div class='form-field full'><label class='input-label'>Ghi chú</label><textarea class='input' name='note' rows='2' placeholder='Lưu ý khi chăm sóc' style='height:auto;padding:10px' ${disabled}>${esc(saved ? saved.note || '' : '')}</textarea></div></div></form>`;
    modalForm(pending ? 'Kiểm tra khách hàng đang chờ' : c ? 'Cập nhật khách hàng' : 'Thêm khách hàng', pending ? 'Gửi lại đúng nội dung đã lưu trên thiết bị để máy chủ xác nhận, tránh tạo trùng.' : 'Lưu thông tin để theo dõi lịch sử mua và công nợ.', form, pending ? 'Gửi lại khách hàng' : c ? 'Lưu thay đổi' : 'Lưu khách hàng');
  }

  function customerFilterCriteria() {
    return { segment: customerSegmentFilter || '', tag: customerTagFilter.trim(), minSpentVnd: customerMinSpentVnd || '' };
  }

  function openSaveCustomerSegment() {
    if (!['owner', 'manager', 'accountant'].includes(store.role)) return toast('Không đủ quyền', 'Chỉ chủ cửa hàng, quản lý hoặc kế toán được lưu bộ lọc.', 'error');
    const criteria = customerFilterCriteria();
    if (!criteria.segment && !criteria.tag && criteria.minSpentVnd === '') return toast('Chưa có điều kiện lọc', 'Chọn ít nhất một phân khúc, nhãn hoặc mức chi tiêu trước khi lưu.', 'error');
    const selected = selectedCustomerSavedSegment();
    const form = `<form id='entity-form' data-form='customer-saved-segment' data-id='${selected ? esc(selected.id) : ''}' data-version='${selected ? selected.version : ''}' data-idempotency-key='${newIdempotencyKey()}'><div class='form-field'><label class='input-label' for='customer-saved-segment-name'>Tên bộ lọc *</label><input class='input' id='customer-saved-segment-name' name='name' value='${esc(selected ? selected.name : '')}' required minlength='1' maxlength='48' autocomplete='off' placeholder='Ví dụ: Khách còn công nợ'/><small>Dùng chung trong cửa hàng; mỗi cửa hàng lưu tối đa 50 bộ lọc.</small></div><div class='notice-item customer-saved-summary'><span>⌕</span><span><strong>Điều kiện sẽ được lưu</strong><small>${criteria.segment ? esc({ no_purchase: 'Chưa từng mua', repeat: 'Mua lại · từ 2 đơn', owing: 'Còn công nợ', inactive90: '90 ngày chưa mua' }[criteria.segment]) : ''}${criteria.tag ? `${criteria.segment ? ' · ' : ''}Nhãn: ${esc(criteria.tag)}` : ''}${criteria.minSpentVnd !== '' ? `${criteria.segment || criteria.tag ? ' · ' : ''}Chi tiêu từ ${moneyVndText(criteria.minSpentVnd)}` : ''}</small></span></div></form>`;
    modalForm(selected ? 'Cập nhật bộ lọc khách hàng' : 'Lưu bộ lọc khách hàng', 'Các điều kiện được tính từ hồ sơ và giao dịch trong cửa hàng. Bộ lọc không lưu tên tìm kiếm.', form, selected ? 'Cập nhật bộ lọc' : 'Lưu bộ lọc');
  }

  function openDeleteCustomerSegment(id) {
    const segment = customerSavedSegments.find(function (item) { return item.id === id; });
    if (!segment) return toast('Không tìm thấy bộ lọc', 'Tải lại danh sách bộ lọc rồi thử lại.', 'error');
    const form = `<form id='entity-form' data-form='customer-saved-segment-delete' data-id='${esc(segment.id)}' data-version='${segment.version}' data-idempotency-key='${newIdempotencyKey()}'><p>Bộ lọc <strong>${esc(segment.name)}</strong> sẽ bị xóa khỏi danh sách của cửa hàng. Hồ sơ khách hàng và giao dịch không bị thay đổi.</p></form>`;
    showModal('Xóa bộ lọc đã lưu?', 'Bạn có thể tạo lại bộ lọc này sau.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Giữ lại</button><button class='btn btn-primary' type='submit' form='entity-form'>Xóa bộ lọc</button>`);
  }

  async function saveCustomerSegment(form) {
    const name = String(new FormData(form).get('name') || '').trim();
    const criteria = customerFilterCriteria();
    if (!criteria.segment && !criteria.tag && criteria.minSpentVnd === '') return toast('Chưa có điều kiện lọc', 'Chọn ít nhất một điều kiện trước khi lưu.', 'error');
    const id = form.dataset.id || '';
    const payload = { name, criteria };
    if (id) payload.version = Number(form.dataset.version);
    const key = form.dataset.idempotencyKey || newIdempotencyKey();
    form.dataset.idempotencyKey = key;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/customer-segments${id ? `/${encodeURIComponent(id)}` : ''}`, {
        method: id ? 'PUT' : 'POST', headers: { 'idempotency-key': key }, body: payload,
      });
      const saved = result.segment;
      customerSavedSegments = customerSavedSegments.filter(function (item) { return item.id !== saved.id; }).concat(saved).sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); });
      customerSavedSegmentsStoreId = store.id;
      selectedCustomerSavedSegmentId = saved.id;
      closeModal();
      await loadCustomersPage(searchTerms.customers, 0);
      if (page === 'customers') render();
      toast(id ? 'Đã cập nhật bộ lọc' : 'Đã lưu bộ lọc', saved.name);
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else toast('Chưa lưu được bộ lọc', error.message, 'error');
    }
  }

  async function deleteCustomerSegment(form) {
    const id = form.dataset.id;
    const key = form.dataset.idempotencyKey || newIdempotencyKey();
    form.dataset.idempotencyKey = key;
    try {
      await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/customer-segments/${encodeURIComponent(id)}/delete`, {
        method: 'POST', headers: { 'idempotency-key': key }, body: { version: Number(form.dataset.version) },
      });
      customerSavedSegments = customerSavedSegments.filter(function (item) { return item.id !== id; });
      customerSavedSegmentsStoreId = store.id;
      if (selectedCustomerSavedSegmentId === id) selectedCustomerSavedSegmentId = '';
      closeModal();
      await loadCustomersPage(searchTerms.customers, 0);
      if (page === 'customers') render();
      toast('Đã xóa bộ lọc', 'Hồ sơ và dữ liệu bán hàng vẫn được giữ nguyên.');
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else toast('Chưa xóa được bộ lọc', error.message, 'error');
    }
  }

  function openSupplier() {
    const pending = loadPendingSupplier();
    const saved = pending ? pending.payload : null;
    const disabled = pending ? 'disabled' : '';
    const canSetOpeningBalance = ['owner', 'manager', 'accountant'].includes(store.role);
    const openingBalanceField = canSetOpeningBalance
      ? `<div class='form-field full'><label class='input-label' for='supplier-opening-payable'>Khoản phải trả ban đầu (VND)</label><input class='input' id='supplier-opening-payable' name='openingPayableVnd' type='number' inputmode='numeric' min='0' step='1' value='${esc(saved ? saved.openingPayableVnd : '0')}' ${disabled}/><small>Số còn nợ trước khi bắt đầu dùng Slink. Không ghi khoản này thành tiền chi. Nếu tên đã có, khoản nợ sẽ được cộng vào hồ sơ nhà cung cấp đó.</small></div>`
      : `<input type='hidden' name='openingPayableVnd' value='0'/><div class='form-field full'><small>Khoản phải trả ban đầu do chủ cửa hàng, quản lý hoặc kế toán ghi nhận.</small></div>`;
    const form = `<form id='entity-form' data-form='supplier'><div class='form-grid'><div class='form-field full'><label class='input-label' for='supplier-name'>Tên nhà cung cấp *</label><input class='input' id='supplier-name' name='name' value='${esc(saved ? saved.name : '')}' required maxlength='160' placeholder='Tên doanh nghiệp hoặc người bán' ${disabled}/></div>${openingBalanceField}</div></form>`;
    modalForm(pending ? 'Kiểm tra nhà cung cấp đang chờ' : 'Thêm nhà cung cấp', pending ? 'Gửi lại đúng nội dung đã lưu để máy chủ xác nhận, tránh ghi nợ hai lần.' : 'Tạo hồ sơ và ghi sổ phải trả ban đầu nếu có.', form, pending ? 'Gửi lại nhà cung cấp' : 'Lưu nhà cung cấp');
  }

  const checkoutMethods = [
    ['cash', 'Tiền mặt'], ['bank_qr', 'QR ngân hàng · xác nhận thủ công'],
    ['bank_transfer', 'Chuyển khoản · xác nhận thủ công'], ['card', 'Thẻ · xác nhận thủ công'], ['other', 'Khác'],
  ];

  function checkoutTenderRow(tender, index, count, disabled) {
    const options = checkoutMethods.map(function (method) { return `<option value='${method[0]}' ${tender.method === method[0] ? 'selected' : ''}>${method[1]}</option>`; }).join('');
    return `<div class='checkout-tender-row' data-tender-row><div class='form-field'><label class='input-label' for='tender-method-${index}'>Phương thức ${index + 1}</label><div class='select-wrap'><select class='input' id='tender-method-${index}' data-tender-method ${disabled}>${options}</select></div></div><div class='form-field'><label class='input-label' for='tender-amount-${index}'>Số tiền (VND)</label><input class='input' id='tender-amount-${index}' data-tender-amount type='number' inputmode='numeric' min='0' step='1' value='${esc(tender.amountReceivedVnd)}' required ${disabled}/></div>${count > 1 ? `<button class='row-action checkout-tender-remove' type='button' data-action='remove-tender' data-index='${index}' aria-label='Xóa khoản thanh toán ${index + 1}' ${disabled}>×</button>` : ''}</div>`;
  }

  function checkoutTenderValues(form) {
    return Array.from(form.querySelectorAll('[data-tender-row]')).map(function (row) {
      return {
        method: row.querySelector('[data-tender-method]').value,
        amountText: row.querySelector('[data-tender-amount]').value,
      };
    });
  }

  function updateCheckoutTenderSummary(form) {
    const summary = form && form.querySelector('#checkout-tender-summary');
    if (!summary) return;
    const total = Number(form.dataset.totalVnd || 0);
    let received = 0;
    let cash = 0;
    let nonCash = 0;
    for (const tender of checkoutTenderValues(form)) {
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
    summary.textContent = `Tổng nhận ${money(received)} · Đã thu ${money(paid)} · Còn nợ ${money(due)}${change ? ` · Tiền thối ${money(change)}` : ''}`;
    summary.classList.remove('error');
  }

  function renderCheckoutTenders(form, tenders) {
    const container = form.querySelector('#checkout-tenders');
    if (!container) return;
    container.innerHTML = tenders.map(function (tender, index) {
      return checkoutTenderRow(tender, index, tenders.length, checkoutPendingPayload ? 'disabled' : '');
    }).join('');
    const addButton = form.querySelector('[data-action="add-tender"]');
    if (addButton) addButton.disabled = tenders.length >= 5 || Boolean(checkoutPendingPayload);
    updateCheckoutTenderSummary(form);
  }

  async function applyCheckoutPromotion() {
    const form = modal.querySelector('[data-form="checkout"]');
    if (!form || checkoutPendingPayload) return;
    const input = form.querySelector('[name="promotionCode"]');
    const status = form.querySelector('#checkout-promotion-status');
    const button = form.querySelector('[data-action="apply-promotion"]');
    const code = String(input?.value || '').trim().toUpperCase();
    const baseTotal = Number(form.dataset.baseTotalVnd || 0);
    const previousTotal = Number(form.dataset.totalVnd || baseTotal);
    const previousCash = Array.from(form.querySelectorAll('[data-tender-row]')).find((row) => row.querySelector('[data-tender-method]')?.value === 'cash')?.querySelector('[data-tender-amount]');
    if (previousCash && previousTotal !== baseTotal && Number(previousCash.value) === previousTotal) previousCash.value = String(baseTotal);
    const showStatus = (message, isError = false) => {
      if (!status) return;
      status.textContent = message;
      status.classList.toggle('error', isError);
    };
    checkoutPromotion = null;
    form.dataset.promotionDiscountVnd = '0';
    form.dataset.totalVnd = String(baseTotal);
    form.querySelector('#checkout-due')?.replaceChildren(document.createTextNode(money(baseTotal)));
    if (!code) {
      showStatus('Nhập mã để kiểm tra điều kiện áp dụng.');
      updateCheckoutTenderSummary(form);
      return;
    }
    if (button) button.disabled = true;
    showStatus('Đang kiểm tra mã…');
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/promotions/preview`, {
        method: 'POST', body: {
          code,
          subtotalVnd: String(cartTotals().subtotal),
          customerId: String(form.querySelector('[name="customerId"]')?.value || '') || null,
        },
      });
      const promotion = result.promotion;
      const discount = Number(promotion.discountVnd);
      if (!Number.isSafeInteger(discount) || discount < 1 || discount > baseTotal) throw new Error('Mức giảm trả về không hợp lệ.');
      const total = baseTotal - discount;
      const defaultCash = Array.from(form.querySelectorAll('[data-tender-row]')).find((row) => row.querySelector('[data-tender-method]')?.value === 'cash');
      const cashAmount = defaultCash?.querySelector('[data-tender-amount]');
      if (cashAmount && Number(cashAmount.value) === baseTotal) cashAmount.value = String(total);
      checkoutPromotion = {
        code: promotion.code,
        discountVnd: String(promotion.discountVnd),
        customerId: String(form.querySelector('[name="customerId"]')?.value || '') || null,
      };
      form.dataset.promotionDiscountVnd = String(promotion.discountVnd);
      form.dataset.totalVnd = String(total);
      form.querySelector('#checkout-due')?.replaceChildren(document.createTextNode(money(total)));
      showStatus(`${promotion.code} · ${promotion.name}: giảm ${money(discount)}.`);
    } catch (error) {
      showStatus(error.message || 'Chưa kiểm tra được mã.', true);
    } finally {
      if (button && !checkoutPendingPayload) button.disabled = false;
      updateCheckoutTenderSummary(form);
    }
  }

  function openCheckout() {
    if (!cart.length && !checkoutPendingPayload) return toast('Giỏ hàng đang trống', 'Chọn sản phẩm trước khi thanh toán.', 'error');
    const pending = checkoutPendingPayload;
    if (!pending) checkoutPromotion = null;
    const baseTotals = pending ? { total: Number(pending.totalVnd), count: pending.items.reduce(function (sum, item) { return sum + Number(item.quantity); }, 0) } : cartTotals();
    if (pending && pending.promotionCode) checkoutPromotion = { code: pending.promotionCode, discountVnd: String(pending.promotionDiscountVnd || '0'), customerId: pending.customerId || null };
    const promotionDiscount = pending ? Number(pending.promotionDiscountVnd || 0) : Number(checkoutPromotion?.discountVnd || 0);
    const totals = { ...baseTotals, total: pending ? baseTotals.total : Math.max(0, baseTotals.total - promotionDiscount) };
    const selectedCustomer = pending ? pending.customerId || '' : cartCustomerId;
    const selectedTenders = pending
      ? (Array.isArray(pending.tenders) && pending.tenders.length ? pending.tenders : [{ method: pending.method || 'cash', amountReceivedVnd: pending.amountReceivedVnd || 0 }])
      : [{ method: 'cash', amountReceivedVnd: totals.total }];
    const selectedNote = pending ? pending.note || '' : '';
    const disabled = pending ? 'disabled' : '';
    const customers = `<option value=''>Khách lẻ</option>` + store.customers.map(function (c) { return `<option value='${c.id}' ${selectedCustomer === c.id ? 'selected' : ''}>${esc(c.name)} · ${esc(c.phone)}</option>`; }).join('');
    if (!checkoutIdempotencyKey) checkoutIdempotencyKey = newIdempotencyKey();
    const body = `<form id='entity-form' data-form='checkout' data-base-total-vnd='${baseTotals.total}' data-promotion-discount-vnd='${promotionDiscount}' data-total-vnd='${totals.total}'><div class='checkout-total'><span>Khách cần thanh toán</span><strong id='checkout-due'>${money(totals.total)}</strong></div><div class='form-grid'><div class='form-field full'><label class='input-label'>Khách hàng</label><div class='select-wrap'><select class='input' name='customerId' ${disabled}>${customers}</select></div></div>${pending ? '' : `<div class='form-field full'><label class='input-label' for='checkout-promotion-code'>Mã khuyến mãi</label><div class='form-field-inline'><input class='input' id='checkout-promotion-code' name='promotionCode' maxlength='32' autocomplete='off' placeholder='Nhập mã của khách'/><button class='btn btn-secondary' type='button' data-action='apply-promotion'>Kiểm tra</button></div><small id='checkout-promotion-status' class='muted' aria-live='polite'>Mã được xác nhận lại trong lúc lưu đơn.</small></div>`}<div class='form-field full'><span class='input-label'>Các khoản thanh toán</span><div id='checkout-tenders'>${selectedTenders.map(function (tender, index) { return checkoutTenderRow(tender, index, selectedTenders.length, disabled); }).join('')}</div>${pending ? '' : `<button class='link-button' type='button' data-action='add-tender'>＋ Thêm phương thức thanh toán</button>`}<div id='checkout-tender-summary' class='checkout-tender-summary' aria-live='polite'></div></div><div class='form-field full'><label class='input-label'>Ghi chú đơn hàng</label><input class='input' name='note' value='${esc(pending ? pending.note : '')}' placeholder='Ghi chú không bắt buộc' ${disabled}/></div></div><div class='modal-note'>${pending ? 'Slink chưa nhận được xác nhận hoàn tất từ lần gửi trước. Hãy thử lại đúng yêu cầu đã gửi; hệ thống sẽ không tạo đơn trùng.' : 'Có thể chia số tiền giữa nhiều phương thức. Khoản không tiền mặt không được vượt tổng đơn; tiền mặt nhận dư sẽ được tính phần thối. Chuyển khoản, QR và thẻ hiện được nhân viên xác nhận thủ công.'}</div></form>`;
    showModal(pending ? 'Kiểm tra đơn hàng đang chờ' : 'Xác nhận thanh toán', `${totals.count} sản phẩm trong đơn · ${money(totals.total)}`, body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Để sau</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại đơn hàng' : 'Hoàn tất đơn hàng'}</button>`);
    updateCheckoutTenderSummary(modal.querySelector('[data-form="checkout"]'));
  }

  function openStockAdjust(id) {
    const p = productById(id);
    if (!p) return toast('Chọn sản phẩm cần kiểm kê', '', 'error');
    const pending = loadPendingStock(p.id);
    const disabled = pending ? 'disabled' : '';
    const pendingWarehouseId = pending?.payload.warehouseId || selectedWarehouseId;
    const warehouseName = (warehouses.find(function (item) { return item.id === pendingWarehouseId; }) || {}).name || 'Kho chính';
    const form = `<form id='entity-form' data-form='adjust-stock' data-id='${p.id}' data-inventory-version='${p.inventoryVersion}'><input type='hidden' name='warehouseId' value='${esc(pending?.payload.warehouseId || selectedWarehouseId)}'/><div class='customer-header' style='padding:0 0 14px'><span class='product-thumb large ${p.tone}'>${esc(p.emoji)}</span><span><h2 style='font-size:12px;margin:0 0 4px'>${esc(p.name)}</h2><p>${esc(p.sku)} · ${esc(warehouseName)}: ${p.stock} ${esc(p.unit)}</p></span></div><div class='form-grid'><div class='form-field'><label class='input-label'>Số lượng thực đếm *</label><input class='input' name='count' type='number' min='0' step='0.001' value='${pending ? esc(pending.payload.count) : p.stock}' required ${disabled}/></div><div class='form-field'><label class='input-label'>Lý do điều chỉnh</label><div class='select-wrap'><select class='input' name='reason' ${disabled}><option ${pending && pending.payload.reason === 'Kiểm kê thực tế' ? 'selected' : ''}>Kiểm kê thực tế</option><option ${pending && pending.payload.reason === 'Hàng hư hỏng' ? 'selected' : ''}>Hàng hư hỏng</option><option ${pending && pending.payload.reason === 'Hàng thất lạc' ? 'selected' : ''}>Hàng thất lạc</option><option ${pending && pending.payload.reason === 'Điều chỉnh nhập đầu kỳ' ? 'selected' : ''}>Điều chỉnh nhập đầu kỳ</option></select></div></div></div>${pending ? `<div class='modal-note'>Thay đổi này đang chờ xác nhận. Hãy gửi lại cùng nội dung để tránh ghi tồn hai lần.</div>` : ''}</form>`;
    showModal('Kiểm kê sản phẩm', 'Slink ghi lại phần chênh lệch và lý do vào sổ kho.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại cập nhật tồn' : 'Cập nhật tồn kho'}</button>`);
  }

  function openReceive() {
    if (!store.products.length) return toast('Chưa có sản phẩm để nhập', 'Hãy tạo sản phẩm trước, rồi ghi phiếu nhận hàng để cập nhật tồn kho.');
    const suppliers = store.suppliers.map(function (s) { return `<option value='${esc(s.name)}'>${esc(s.name)}</option>`; }).join('');
    const pending = loadPendingPurchase();
    const pendingItems = pending
      ? (Array.isArray(pending.payload.items) ? pending.payload.items : [{ productId: pending.payload.productId, quantity: pending.payload.quantity, unitCostVnd: pending.payload.unitCostVnd }])
      : null;
    const initialItems = pendingItems || [{ productId: store.products[0] && store.products[0].id || '', quantity: '1', unitCostVnd: store.products[0] ? store.products[0].cost : '' }];
    const disabled = pending ? 'disabled' : '';
    const defaultWarehouseId = (warehouses.find(function (item) { return item.is_default; }) || {}).id || '';
    const receiveWarehouseId = pending ? (pending.payload.warehouseId || defaultWarehouseId) : (selectedWarehouseId || defaultWarehouseId);
    const receiveWarehouseOptions = warehouses.map(function (warehouse) { return `<option value='${esc(warehouse.id)}' ${warehouse.id === receiveWarehouseId ? 'selected' : ''}>${esc(warehouse.name)}${warehouse.is_default ? ' · Kho chính' : ''}</option>`; }).join('');
    const warehouseField = warehouses.length > 1
      ? `<div class='form-field full'><label class='input-label' for='purchase-warehouse'>Kho nhận hàng *</label><div class='select-wrap'><select class='input' id='purchase-warehouse' name='warehouseId' required ${disabled}>${receiveWarehouseOptions}</select></div></div>`
      : `<input type='hidden' name='warehouseId' value='${esc(receiveWarehouseId)}'/>`;
    const form = `<form id='entity-form' data-form='receive'><div class='form-grid'>${warehouseField}<div class='form-field full'><div class='panel-header'><div><h2>Hàng hóa nhận</h2><p>Tối đa 50 mặt hàng trên một phiếu</p></div>${pending ? '' : `<button class='btn btn-secondary' type='button' data-action='add-purchase-line'>＋ Thêm mặt hàng</button>`}</div><div id='purchase-lines'>${renderReceivePurchaseLines(initialItems, disabled)}</div><div class='checkout-total' style='margin:12px 0 0'><span>Tổng giá trị phiếu nhập</span><strong id='purchase-total'>Đang tính…</strong></div></div><div class='form-field full'><label class='input-label'>Nhà cung cấp</label><input class='input' name='supplierName' list='suppliers' value='${pending ? esc(pending.payload.supplierName || '') : ''}' placeholder='Nhập tên để theo dõi công nợ' ${disabled}/><datalist id='suppliers'>${suppliers}</datalist></div><div class='form-field'><label class='input-label'>Đã thanh toán (VND)</label><input class='input' name='paid' type='number' min='0' step='1' value='${pending ? esc(pending.payload.amountPaidVnd ?? '0') : '0'}' ${disabled}/></div><div class='form-field'><label class='input-label'>Phương thức</label><div class='select-wrap'><select class='input' name='method' ${disabled}><option value='cash' ${!pending || pending.payload.method === 'cash' ? 'selected' : ''}>Tiền mặt</option><option value='bank_transfer' ${pending && pending.payload.method === 'bank_transfer' ? 'selected' : ''}>Chuyển khoản</option><option value='bank_qr' ${pending && pending.payload.method === 'bank_qr' ? 'selected' : ''}>QR ngân hàng</option></select></div></div><div class='form-field full'><label class='input-label'>Ghi chú phiếu nhập</label><input class='input' name='note' maxlength='500' value='${pending ? esc(pending.payload.note || '') : ''}' placeholder='Số hóa đơn, lô hàng…' ${disabled}/></div></div>${pending ? `<div class='modal-note'>Phiếu nhập đang chờ xác nhận. Gửi lại cùng nội dung để tránh cộng tồn kho hai lần.</div>` : `<div class='modal-note'>Slink ghi các dòng hàng, cập nhật giá vốn/tồn và tổng khoản phải trả trong cùng giao dịch. Tiền thanh toán được tính trên toàn phiếu.</div>`}</form>`;
    showModal(pending ? 'Kiểm tra phiếu nhập đang chờ' : 'Tạo phiếu nhập hàng', 'Ghi nhận nhiều mặt hàng đã nhận từ nhà cung cấp.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>${pending ? 'Để sau' : 'Hủy'}</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại phiếu nhập' : 'Xác nhận nhập kho'}</button>`, true);
    updateReceivePurchaseTotal(modal.querySelector('[data-form="receive"]'));
  }

  function renderReceivePurchaseLines(items, disabled) {
    return items.map(function (item, index) {
      const product = store.products.find(function (candidate) { return candidate.id === item.productId; });
      const options = store.products.map(function (candidate) {
        return `<option value='${candidate.id}' data-cost='${candidate.cost}' ${candidate.id === item.productId ? 'selected' : ''}>${esc(candidate.name)} · ${esc(candidate.sku)}</option>`;
      }).join('');
      const selectedOption = item.productId && !product ? `<option value='${esc(item.productId)}' selected>Phiếu đang chờ · sản phẩm đã chọn</option>` : '';
      return `<article class='purchase-line-card' data-purchase-line data-index='${index}'><div class='purchase-line-head'><strong>Mặt hàng ${number(index + 1)}</strong>${!disabled && items.length > 1 ? `<button class='link-button' type='button' data-action='remove-purchase-line' data-index='${index}'>Xóa dòng</button>` : ''}</div><div class='form-grid'><div class='form-field full'><label class='input-label' for='purchase-product-search-${index}'>Tìm sản phẩm</label><input class='input' id='purchase-product-search-${index}' data-purchase-search data-index='${index}' type='search' placeholder='Tên hoặc mã SKU…' ${disabled}/></div><div class='form-field full'><label class='input-label' for='purchase-product-${index}'>Sản phẩm *</label><div class='select-wrap'><select class='input' id='purchase-product-${index}' name='productId' data-purchase-product data-index='${index}' required ${disabled}>${selectedOption}${options}</select></div></div><div class='form-field'><label class='input-label' for='purchase-quantity-${index}'>Số lượng nhận *</label><input class='input' id='purchase-quantity-${index}' data-purchase-quantity name='quantity' type='number' min='0.001' step='0.001' value='${esc(item.quantity ?? '1')}' required ${disabled}/></div><div class='form-field'><label class='input-label' for='purchase-cost-${index}'>Giá nhập / đơn vị (VND) *</label><input class='input' id='purchase-cost-${index}' data-purchase-cost name='unitCostVnd' type='number' min='0' step='1' value='${esc(item.unitCostVnd ?? (product ? product.cost : ''))}' required ${disabled}/></div></div></article>`;
    }).join('');
  }

  function receivePurchaseItemsFromForm(form) {
    return Array.from(form.querySelectorAll('[data-purchase-line]')).map(function (row) {
      return {
        productId: String(row.querySelector('[data-purchase-product]')?.value || ''),
        quantity: String(row.querySelector('[data-purchase-quantity]')?.value || ''),
        unitCostVnd: String(row.querySelector('[data-purchase-cost]')?.value || ''),
      };
    });
  }

  function updateReceivePurchaseTotal(form) {
    const output = form && form.querySelector('#purchase-total');
    if (!output) return;
    const items = receivePurchaseItemsFromForm(form);
    let total = 0n;
    try {
      const seenProducts = new Set();
      for (const item of items) {
        if (!item.productId || seenProducts.has(item.productId)) throw new Error('incomplete');
        seenProducts.add(item.productId);
        const quantity = /^(0|[1-9]\d{0,9})(?:\.(\d{1,3}))?$/.exec(item.quantity);
        if (!quantity || !/^(0|[1-9]\d{0,18})$/.test(item.unitCostVnd)) throw new Error('incomplete');
        const quantityMilli = BigInt(quantity[1]) * 1000n + BigInt((quantity[2] || '').padEnd(3, '0') || '0');
        if (quantityMilli <= 0n) throw new Error('incomplete');
        const lineTotal = (BigInt(item.unitCostVnd) * quantityMilli + 500n) / 1000n;
        total += lineTotal;
        if (total > 9223372036854775807n) throw new Error('limit');
      }
      output.textContent = moneyVndText(total.toString());
    } catch (error) {
      output.textContent = error.message === 'limit' ? 'Vượt giới hạn lưu trữ' : 'Nhập đủ số lượng và giá';
    }
  }

  function redrawReceivePurchaseLines(form, items) {
    const container = form.querySelector('#purchase-lines');
    if (container) container.innerHTML = renderReceivePurchaseLines(items, false);
    updateReceivePurchaseTotal(form);
  }

  function addReceivePurchaseLine() {
    const form = modal.querySelector('[data-form="receive"]');
    if (!form) return;
    const items = receivePurchaseItemsFromForm(form);
    if (items.length >= 50) return toast('Đã đạt giới hạn dòng hàng', 'Mỗi phiếu nhập hỗ trợ tối đa 50 mặt hàng.', 'error');
    const existing = new Set(items.map(function (item) { return item.productId; }));
    const next = store.products.find(function (product) { return !existing.has(product.id); }) || store.products[0];
    items.push({ productId: next ? next.id : '', quantity: '1', unitCostVnd: next ? String(next.cost) : '' });
    redrawReceivePurchaseLines(form, items);
  }

  function removeReceivePurchaseLine(index) {
    const form = modal.querySelector('[data-form="receive"]');
    if (!form) return;
    const items = receivePurchaseItemsFromForm(form);
    if (items.length <= 1) return;
    items.splice(index, 1);
    redrawReceivePurchaseLines(form, items);
  }

  function openSupplierPayment(supplierId) {
    const supplier = store.suppliers.find(function (item) { return item.id === supplierId; });
    if (!supplier) return toast('Không tìm thấy nhà cung cấp', 'Tải lại sổ công nợ rồi thử lại.', 'error');
    const pending = loadPendingSupplierPayment(supplierId);
    const disabled = pending ? 'disabled' : '';
    const amountVnd = pending ? pending.payload.amountVnd : supplier.debt;
    const form = `<form id='entity-form' data-form='supplier-payment' data-id='${supplier.id}'><div class='checkout-total'><span>Còn phải trả ${esc(supplier.name)}</span><strong>${money(supplier.debt)}</strong></div><div class='form-grid'><div class='form-field full'><label class='input-label'>Số tiền thanh toán (VND) *</label><input class='input' name='amount' type='number' min='1' max='${supplier.debt}' step='1' value='${esc(amountVnd)}' required ${disabled}/></div><div class='form-field'><label class='input-label'>Phương thức</label><div class='select-wrap'><select class='input' name='method' ${disabled}><option value='cash' ${!pending || pending.payload.method === 'cash' ? 'selected' : ''}>Tiền mặt</option><option value='bank_transfer' ${pending && pending.payload.method === 'bank_transfer' ? 'selected' : ''}>Chuyển khoản</option><option value='bank_qr' ${pending && pending.payload.method === 'bank_qr' ? 'selected' : ''}>QR ngân hàng</option><option value='card' ${pending && pending.payload.method === 'card' ? 'selected' : ''}>Thẻ</option><option value='other' ${pending && pending.payload.method === 'other' ? 'selected' : ''}>Khác</option></select></div></div><div class='form-field'><label class='input-label'>Ghi chú</label><input class='input' name='note' maxlength='300' value='${pending ? esc(pending.payload.note) : ''}' placeholder='Mã giao dịch hoặc nội dung chuyển tiền' ${disabled}/></div></div>${pending ? `<div class='modal-note'>Khoản thanh toán đang chờ xác nhận. Gửi lại cùng nội dung để tránh ghi sổ hai lần.</div>` : `<div class='modal-note'>Slink ghi khoản đã thanh toán vào công nợ nhà cung cấp và sổ chi. Chuyển khoản và QR hiện được nhân viên xác nhận thủ công.</div>`}</form>`;
    showModal(pending ? 'Kiểm tra khoản thanh toán đang chờ' : 'Thanh toán nhà cung cấp', `Số dư hiện tại · ${money(supplier.debt)}`, form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Để sau</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại khoản thanh toán' : 'Ghi nhận thanh toán'}</button>`);
  }

  function openExpense() {
    const pending = loadPendingCash();
    const disabled = pending ? 'disabled' : '';
    const payload = pending ? pending.payload : { direction: 'out', amountVnd: '', category: 'Vận hành', method: 'cash', note: '' };
    const form = `<form id='entity-form' data-form='cash'><div class='form-grid'><div class='form-field'><label class='input-label'>Loại giao dịch</label><div class='select-wrap'><select class='input' name='type' ${disabled}><option value='out' ${payload.direction === 'out' ? 'selected' : ''}>Phiếu chi</option><option value='in' ${payload.direction === 'in' ? 'selected' : ''}>Phiếu thu khác</option></select></div></div><div class='form-field'><label class='input-label'>Số tiền (VND) *</label><input class='input' name='amount' type='number' min='1' step='1' required value='${esc(payload.amountVnd)}' placeholder='0' ${disabled}/></div><div class='form-field'><label class='input-label'>Khoản mục</label><div class='select-wrap'><select class='input' name='category' ${disabled}>${['Vận hành', 'Điện nước', 'Thuê mặt bằng', 'Nhập hàng', 'Thu khác', 'Hoàn tiền'].map(function (name) { return `<option ${payload.category === name ? 'selected' : ''}>${name}</option>`; }).join('')}</select></div></div><div class='form-field'><label class='input-label'>Phương thức</label><div class='select-wrap'><select class='input' name='method' ${disabled}><option value='cash' ${payload.method === 'cash' ? 'selected' : ''}>Tiền mặt</option><option value='bank_transfer' ${payload.method === 'bank_transfer' ? 'selected' : ''}>Chuyển khoản</option><option value='bank_qr' ${payload.method === 'bank_qr' ? 'selected' : ''}>QR ngân hàng</option><option value='card' ${payload.method === 'card' ? 'selected' : ''}>Thẻ</option><option value='other' ${payload.method === 'other' ? 'selected' : ''}>Khác</option></select></div></div><div class='form-field full'><label class='input-label'>Nội dung</label><input class='input' name='note' maxlength='300' value='${esc(payload.note)}' placeholder='Ghi chú cho giao dịch này' ${disabled}/></div></div>${pending ? `<div class='modal-note'>Phiếu đang chờ xác nhận. Hãy gửi lại cùng nội dung để tránh ghi sổ hai lần.</div>` : ''}</form>`;
    showModal(pending ? 'Kiểm tra phiếu đang chờ' : 'Ghi phiếu thu / chi', 'Ghi lại giao dịch để đối soát sổ quỹ.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại phiếu' : 'Lưu giao dịch'}</button>`);
  }

  function openCashSessionForm() {
    const pending = loadPendingCashSessionOpen();
    const initial = pending ? pending.payload.openingFloatVnd : cashRegisterState.lastClosed ? cashRegisterState.lastClosed.countedCashVnd : '0';
    const disabled = pending ? 'disabled' : '';
    const form = `<form id='entity-form' data-form='cash-session-open'><div class='form-field'><label class='input-label' for='cash-session-opening'>Tiền mặt có sẵn trong quầy (VND) *</label><input class='input' id='cash-session-opening' name='openingFloatVnd' type='number' inputmode='numeric' min='0' step='1' value='${esc(initial)}' required ${disabled}/></div><div class='modal-note'>Nhập số tiền thực tế đã đếm trước khi bắt đầu bán. Giao dịch tiền mặt sẽ được gắn vào ca này cho đến khi chốt ca.</div></form>`;
    showModal(pending ? 'Kiểm tra yêu cầu mở ca' : 'Mở ca tiền mặt', pending ? 'Gửi lại đúng số tiền đầu ca để xác nhận trạng thái.' : 'Xác nhận số tiền ban đầu có trong quầy.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Kiểm tra yêu cầu' : 'Bắt đầu ca'}</button>`);
  }

  function openCashSessionCloseForm() {
    const session = cashRegisterState.session;
    if (!session) return toast('Không có ca đang mở', 'Tải lại trạng thái ca trước khi chốt.', 'error');
    const pending = loadPendingCashSessionClose(session.id);
    const expected = pending ? pending.payload.countedCashVnd : session.expectedCashVnd;
    const note = pending ? pending.payload.note : '';
    const disabled = pending ? 'disabled' : '';
    const form = `<form id='entity-form' data-form='cash-session-close' data-session-id='${session.id}'><div class='summary-banner'><div><strong>Số tiền Slink dự kiến</strong><small>Đầu ca ${moneyVndText(session.openingFloatVnd)} · thu ${moneyVndText(session.cashInVnd)} · chi ${moneyVndText(session.cashOutVnd)}</small></div><strong>${moneyVndText(session.expectedCashVnd)}</strong></div><div class='form-grid' style='margin-top:14px'><div class='form-field full'><label class='input-label' for='cash-session-counted'>Tiền mặt thực đếm (VND) *</label><input class='input' id='cash-session-counted' name='countedCashVnd' type='number' inputmode='numeric' min='0' step='1' value='${esc(expected)}' required ${disabled}/></div><div class='form-field full'><label class='input-label' for='cash-session-note'>Lý do khi có chênh lệch</label><textarea class='input' id='cash-session-note' name='note' rows='2' maxlength='500' placeholder='Bắt buộc nếu tiền đếm khác số dự kiến' style='height:auto;padding:10px' ${disabled}>${esc(note)}</textarea></div></div><div class='modal-note'>Nếu số đếm lệch, Slink sẽ ghi bút toán chênh lệch vào sổ thu chi và lưu lý do cùng người chốt.</div></form>`;
    showModal(pending ? 'Kiểm tra yêu cầu chốt ca' : 'Chốt ca tiền mặt', 'Đếm tiền mặt trong quầy rồi nhập tổng thực tế.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Để sau</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Kiểm tra yêu cầu' : 'Xác nhận chốt ca'}</button>`);
  }

  function validCashSessionAmount(value) {
    const text = String(value == null ? '' : value).trim();
    if (!/^(0|[1-9]\d{0,15})$/.test(text)) return null;
    const amount = BigInt(text);
    return amount <= 9007199254740991n ? text : null;
  }

  async function saveCashSessionOpen(form) {
    let pending = loadPendingCashSessionOpen();
    if (!pending) {
      const openingFloatVnd = validCashSessionAmount(new FormData(form).get('openingFloatVnd'));
      if (openingFloatVnd === null) return toast('Tiền đầu ca không hợp lệ', 'Nhập số VND nguyên không âm, tối đa 9.007.199.254.740.991.', 'error');
      pending = { storeId: store.id, key: newIdempotencyKey(), payload: { openingFloatVnd: openingFloatVnd } };
    }
    if (!savePendingCashSessionOpen(pending)) return pendingSaveFailed();
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/cash-register/open`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      clearPendingCashSessionOpen();
      closeModal();
      await loadFinancePage();
      render();
      toast('Đã mở ca tiền mặt', 'Các giao dịch tiền mặt mới sẽ được đối soát trong ca này.');
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra yêu cầu mở ca.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingCashSessionOpen();
        if (!modal.hidden) form.querySelectorAll('input').forEach(function (field) { field.disabled = false; });
        if (error.code === 'cash_session_already_open') await loadFinancePage();
      }
      toast('Chưa mở được ca tiền mặt', error.message, 'error');
      if (submitButton && !modal.hidden) submitButton.disabled = false;
    }
  }

  async function saveCashSessionClose(form) {
    const sessionId = form.dataset.sessionId;
    let pending = loadPendingCashSessionClose(sessionId);
    if (!pending) {
      const data = new FormData(form);
      const countedCashVnd = validCashSessionAmount(data.get('countedCashVnd'));
      const note = String(data.get('note') || '').trim();
      if (countedCashVnd === null) return toast('Tiền thực đếm không hợp lệ', 'Nhập số VND nguyên không âm, tối đa 9.007.199.254.740.991.', 'error');
      pending = { storeId: store.id, sessionId: sessionId, key: newIdempotencyKey(), payload: { sessionId: sessionId, countedCashVnd: countedCashVnd, note: note } };
    }
    if (!savePendingCashSessionClose(pending)) return pendingSaveFailed();
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/cash-register/${encodeURIComponent(sessionId)}/close`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      clearPendingCashSessionClose(sessionId);
      closeModal();
      await loadFinancePage();
      render();
      const variance = result.session.varianceVnd;
      toast('Đã chốt ca tiền mặt', variance === '0' ? 'Tiền thực đếm khớp số dự kiến.' : `Chênh lệch đã ghi nhận: ${moneyVndText(variance)}.`);
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra yêu cầu chốt ca.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingCashSessionClose(sessionId);
        if (!modal.hidden) form.querySelectorAll('input,textarea').forEach(function (field) { field.disabled = false; });
        if (error.code === 'cash_session_not_open') await loadFinancePage();
      }
      toast('Chưa chốt được ca tiền mặt', error.message, 'error');
      if (submitButton && !modal.hidden) submitButton.disabled = false;
    }
  }

  async function openOrder(id) {
    if (!id) return;
    let o;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/orders/${encodeURIComponent(id)}`);
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
        status: statusText(row.status, total - paid - returned + refunded),
        rawStatus: row.status,
        voidRestockWarehouseId: row.voidRestockWarehouseId || '',
        voidRestockWarehouseName: row.voidRestockWarehouseName || '',
        method: Array.from(new Set(payments.map(function (p) { return methodLabels[p.method] || p.method; }))).join(' · ') || 'Chưa thu tiền',
        note: row.note || '',
        internalNotes: mergeOrderNotes(orderNoteHistoryCache.get(id) || [], Array.isArray(row.internalNotes) ? row.internalNotes : []),
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
          };
        }),
        returns: row.returns,
      };
      orderNoteHistoryCache.set(id, o.internalNotes);
      if (!orderNoteHistoryCursor.has(id) || (!orderNoteHistoryCursor.get(id) && o.internalNotes.length < o.internalNotesTotal)) {
        orderNoteHistoryCursor.set(id, row.internalNotesNextBeforeId || null);
      }
      const cached = store.orders.find(function (item) { return item.id === o.id; });
      if (cached) Object.assign(cached, o);
      else store.orders.unshift(o);
    } catch (error) {
      return toast('Chưa tải được đơn hàng', error.message, 'error');
    }
    const c = customerById(o.customerId);
    const items = o.items.map(function (i) { return `<div class='detail-line'><span>${esc(i.name)} <small>× ${number(i.qty)} ${esc(i.unit)}</small></span><strong>${money(i.total)}</strong></div>`; }).join('');
    const returnHistory = o.returns.map(function (r) { return `<div class='timeline-item'><span class='timeline-dot'></span><span><strong>Trả hàng ${esc(r.return_number)}</strong><small>${humanDate(r.occurred_at, true)} · ${money(Number(r.refund_total_vnd))}${r.restock_warehouse_name ? ` · Nhập lại ${esc(r.restock_warehouse_name)}` : ''}</small></span></div>`; }).join('');
    const body = `<div class='order-details'><section class='panel detail-card'><div class='detail-heading'><div><h2>${esc(o.number)}</h2><p>${humanDate(o.createdAt, true)}${c ? ' · ' + esc(c.name) : ' · Khách lẻ'}</p></div>${statusBadge(o.status)}</div><div class='detail-lines'>${items}<div class='detail-line'><span>Tạm tính</span><strong>${money(o.subtotal)}</strong></div>${o.discount ? `<div class='detail-line'><span>Giảm giá</span><strong>−${money(o.discount)}</strong></div>` : ''}${o.promotion ? `<div class='detail-line'><span>Mã ${esc(o.promotion.code)}</span><strong>−${moneyVndText(o.promotion.discountVnd)}</strong></div>` : ''}<div class='detail-line'><span>Tổng đã thu</span><strong>${money(o.paid)}</strong></div>${o.paymentLines.map(function (payment) { return `<div class='detail-line'><span>· ${esc(payment.method)}</span><strong>${money(payment.amount)}</strong></div>`; }).join('')}${o.cashReceived ? `<div class='detail-line'><span>Tiền mặt khách đưa</span><strong>${money(o.cashReceived)}</strong></div>` : ''}${o.cashChange ? `<div class='detail-line'><span>Tiền thối</span><strong>−${money(o.cashChange)}</strong></div>` : ''}${o.refunded ? `<div class='detail-line'><span>Đã hoàn tiền</span><strong>−${money(o.refunded)}</strong></div>` : ''}${o.due ? `<div class='detail-line'><span>Còn phải thu</span><strong style='color:#aa762a'>${money(o.due)}</strong></div>` : ''}<div class='detail-total'><span>Tổng cộng</span><strong>${money(o.total)}</strong></div></div></section><section class='panel detail-card'><div class='section-title'><h2>Thông tin giao dịch</h2><p>Biên nhận và thay đổi được lưu trên máy chủ</p></div><div class='order-timeline'><div class='timeline-item'><span class='timeline-dot'></span><span><strong>Đơn hàng đã tạo</strong><small>${humanDate(o.createdAt, true)}</small></span></div><div class='timeline-item'><span class='timeline-dot'></span><span><strong>${o.due > 0 ? 'Còn khoản phải thu' : 'Đã đối soát khoản thu'}</strong><small>${money(o.paid)} · ${esc(o.method)}</small></span></div>${o.rawStatus === 'voided' ? `<div class='timeline-item'><span class='timeline-dot'></span><span><strong>Đơn đã hủy</strong><small>Hoàn tồn vào kho ${esc(o.voidRestockWarehouseName || 'đã ghi nhận')}</small></span></div>` : ''}${returnHistory}${c ? `<div class='timeline-item'><span class='timeline-dot'></span><span><strong>Khách hàng: ${esc(c.name)}</strong><small>${esc(c.phone)}</small></span></div>` : ''}</div>${o.note ? `<div class='modal-note'>${esc(o.note)}</div>` : ''}</section></div>`;
    const pendingMutation = loadPendingOrderMutation(o.id);
    const canCollaborate = ['owner', 'manager', 'cashier', 'accountant'].includes(store.role);
    const tagChips = o.tags.map(function (tag) {
      return `<span class='order-tag-chip'>#${esc(tag.label)}${canCollaborate ? `<button type='button' data-action='order-tag-remove' data-id='${esc(o.id)}' data-tag='${esc(tag.label)}' aria-label='Gỡ nhãn ${esc(tag.label)}' ${pendingMutation ? 'disabled' : ''}>×</button>` : ''}</span>`;
    }).join('');
    const pendingHint = pendingMutation
      ? `<div class='install-hint order-mutation-pending' role='status'>Thao tác ${pendingMutation.kind === 'note' ? 'ghi chú' : 'nhãn'} đang chờ máy chủ xác nhận. Hãy gửi lại đúng nội dung đã lưu trên thiết bị.<button type='button' class='btn btn-secondary' data-action='retry-order-mutation' data-id='${esc(o.id)}'>Thử lại thao tác</button></div>`
      : '';
    const collaborationPanel = `<section class='panel detail-card order-collaboration-card'><div class='section-title'><h2>Ghi chú nội bộ &amp; nhãn</h2><p>Chỉ nhân viên cửa hàng xem được; lịch sử được giữ lại để truy vết.</p></div>${pendingHint}<div class='order-tags-list'>${tagChips || `<span class='muted'>Chưa có nhãn</span>`}</div>${canCollaborate ? `<form id='order-tag-form' data-form='order-tag' data-id='${esc(o.id)}' class='order-tag-form'><label class='input-label' for='order-tag-input'>Gắn nhãn đơn hàng</label><div><input class='input' id='order-tag-input' name='tag' maxlength='32' autocomplete='off' placeholder='Ví dụ: Giao gấp, Khách VIP' required ${pendingMutation ? 'disabled' : ''}/><button class='btn btn-secondary' type='submit' ${pendingMutation ? 'disabled' : ''}>Gắn nhãn</button></div></form>` : ''}${renderOrderNoteHistory(o.id, o.internalNotesTotal, o.internalNotes)}${canCollaborate ? `<form id='order-note-form' data-form='order-note' data-id='${esc(o.id)}' class='order-note-form'><label class='input-label' for='order-note-input'>Thêm ghi chú nội bộ</label><textarea class='input' id='order-note-input' name='note' rows='3' maxlength='1000' placeholder='Thông tin chỉ dành cho nhân viên cửa hàng…' required ${pendingMutation ? 'disabled' : ''}>${pendingMutation?.kind === 'note' ? esc(pendingMutation.payload.note) : ''}</textarea><button class='btn btn-primary' type='submit' ${pendingMutation ? 'disabled' : ''}>Thêm ghi chú</button></form>` : ''}</section>`;
    const completeBody = body.replace(/<\/div>$/, `${collaborationPanel}</div>`);
    const footer = `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button><button class='btn btn-secondary' data-action='print-order' data-id='${o.id}'>In biên nhận</button><button class='btn btn-secondary' data-action='share-order' data-id='${o.id}'>Chia sẻ biên nhận</button>${o.due > 0 && o.customerId && ['owner', 'manager', 'cashier', 'accountant'].includes(store.role) ? `<button class='btn btn-secondary' data-action='collect-payment' data-id='${o.id}'>Ghi nhận thu tiền</button>` : ''}${['owner', 'manager'].includes(store.role) && o.rawStatus === 'completed' && o.paid === 0 && o.returned === 0 ? `<button class='btn btn-danger' data-action='void-order' data-id='${o.id}'>Hủy đơn</button>` : ''}${['owner', 'manager'].includes(store.role) && o.status !== 'Đã hủy' && o.items.some(function (item) { return item.returnedQty < item.qty; }) ? `<button class='btn btn-danger' data-action='return-order' data-id='${o.id}'>Trả hàng</button>` : ''}`;
    showModal('Chi tiết đơn hàng', 'Kiểm tra sản phẩm, khoản thu, ghi chú nội bộ và lịch sử trả hàng.', completeBody, footer, true);
  }

  function mergeOrderNotes() {
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

  function renderOrderNoteHistory(orderId, total, notes) {
    const rows = notes.map(function (item) {
      return `<article class='order-note-entry'><div><strong>${esc(item.actor?.name || 'Nhân viên')}</strong><time>${humanDate(item.createdAt, true)}</time></div><p>${esc(item.note)}</p></article>`;
    }).join('');
    const hasMore = Boolean(orderNoteHistoryCursor.get(orderId));
    const loading = orderNoteHistoryLoading.has(orderId);
    const moreButton = hasMore
      ? `<button type='button' class='btn btn-secondary order-notes-load-more' data-action='load-older-order-notes' data-id='${esc(orderId)}' ${loading ? 'disabled' : ''}>${loading ? 'Đang tải ghi chú…' : 'Xem ghi chú cũ hơn'}</button>`
      : '';
    const countHint = notes.length < total ? `<small>Đang hiển thị ${number(notes.length)} trên ${number(total)} ghi chú.</small>` : '';
    const list = rows || `<div class='empty-state order-notes-empty'><strong>Chưa có ghi chú nội bộ</strong><span>Ghi lại thông tin chăm sóc hoặc lưu ý xử lý đơn.</span></div>`;
    return `<div class='order-note-history' data-order-id='${esc(orderId)}' data-total='${total}'><div class='order-notes-heading' tabindex='-1'><strong>Ghi chú (${number(total)})</strong>${countHint}</div>${moreButton}<div class='order-note-list'>${list}</div></div>`;
  }

  async function loadOlderOrderNotes(orderId) {
    if (orderNoteHistoryLoading.has(orderId)) return;
    const known = orderNoteHistoryCache.get(orderId) || [];
    const beforeId = orderNoteHistoryCursor.get(orderId);
    if (!known.length || !beforeId) return toast('Chưa thể tải ghi chú cũ', 'Hãy đóng và mở lại chi tiết đơn hàng để tải dữ liệu mới nhất.', 'error');
    const requestGeneration = modalGeneration;
    orderNoteHistoryLoading.add(orderId);
    const button = modal.querySelector('.order-notes-load-more');
    if (button) { button.disabled = true; button.textContent = 'Đang tải ghi chú…'; }
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/orders/${encodeURIComponent(orderId)}/internal-notes?beforeId=${encodeURIComponent(beforeId)}&limit=100`);
      const current = orderNoteHistoryCache.get(orderId) || known;
      const merged = mergeOrderNotes(current, Array.isArray(result.notes) ? result.notes : []);
      orderNoteHistoryCache.set(orderId, merged);
      orderNoteHistoryCursor.set(orderId, result.nextBeforeId || null);
      orderNoteHistoryLoading.delete(orderId);
      if (requestGeneration === modalGeneration && !modal.hidden) {
        const history = modal.querySelector('.order-note-history');
        if (history && history.dataset.orderId === orderId) {
          history.outerHTML = renderOrderNoteHistory(orderId, Number(history.dataset.total) || 0, merged);
          const focusTarget = modal.querySelector('.order-notes-load-more') || modal.querySelector('.order-notes-heading');
          if (focusTarget) focusTarget.focus();
        }
      }
    } catch (error) {
      orderNoteHistoryLoading.delete(orderId);
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để tải lịch sử ghi chú.', 'error');
      else toast('Chưa tải được ghi chú cũ', error.message, 'error');
      if (button && button.isConnected) { button.disabled = false; button.textContent = 'Thử tải lại ghi chú cũ'; }
    }
  }

  async function sendPendingOrderMutation(orderId) {
    const pending = loadPendingOrderMutation(orderId);
    if (!pending) return toast('Không có thao tác đang chờ', 'Nhập lại ghi chú hoặc nhãn để tạo yêu cầu mới.', 'error');
    const submit = modal.querySelector('[data-action="retry-order-mutation"]')
      || modal.querySelector(pending.kind === 'note' ? '#order-note-form button[type="submit"]' : '#order-tag-form button[type="submit"]');
    if (submit) submit.disabled = true;
    const endpoint = pending.kind === 'note' ? 'internal-notes' : 'tags';
    try {
      await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/orders/${encodeURIComponent(orderId)}/${endpoint}`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      clearPendingOrderMutation(orderId);
      toast(pending.kind === 'note' ? 'Đã thêm ghi chú' : 'Đã cập nhật nhãn', 'Thao tác đã được lưu vào lịch sử đơn hàng.');
      await openOrder(orderId);
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingOrderMutation(orderId);
      }
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra thao tác đang chờ.', 'error');
      else toast('Chưa cập nhật được đơn hàng', error.message, 'error');
      if (submit && submit.isConnected) submit.disabled = false;
    }
  }

  function saveOrderNote(form) {
    const orderId = form.dataset.id;
    const existing = loadPendingOrderMutation(orderId);
    if (existing) return sendPendingOrderMutation(orderId);
    const note = String(new FormData(form).get('note') || '').trim();
    if (!note) return toast('Ghi chú đang trống', 'Nhập nội dung cần lưu cho nhân viên cửa hàng.', 'error');
    const pending = { orderId, kind: 'note', key: newIdempotencyKey(), payload: { note } };
    if (!savePendingOrderMutation(pending)) return pendingSaveFailed();
    return sendPendingOrderMutation(orderId);
  }

  function changeOrderTag(orderId, operation, tag) {
    const existing = loadPendingOrderMutation(orderId);
    if (existing) return sendPendingOrderMutation(orderId);
    const pending = { orderId, kind: 'tag', key: newIdempotencyKey(), payload: { operation, tag } };
    if (!savePendingOrderMutation(pending)) return pendingSaveFailed();
    return sendPendingOrderMutation(orderId);
  }

  function openVoidOrder(orderId) {
    const defaultWarehouseId = (warehouses.find(function (warehouse) { return warehouse.is_default; }) || warehouses[0] || {}).id || '';
    const voidWarehouseId = selectedWarehouseId || defaultWarehouseId;
    const options = warehouses.map(function (warehouse) { return `<option value='${esc(warehouse.id)}' ${warehouse.id === voidWarehouseId ? 'selected' : ''}>${esc(warehouse.name)}${warehouse.is_default ? ' · Kho chính' : ''}</option>`; }).join('');
    const warehouseField = warehouses.length > 1
      ? `<div class='form-field full'><label class='input-label' for='void-restock-warehouse'>Kho nhận hàng hoàn lại *</label><div class='select-wrap'><select class='input' id='void-restock-warehouse' name='warehouseId' required>${options}</select></div></div>`
      : `<input type='hidden' name='warehouseId' value='${esc(voidWarehouseId)}'/>`;
    const form = `<form id='entity-form' data-form='void-order' data-id='${esc(orderId)}'><div class='notice-item'><span>⚠️</span><span><strong>Hủy đơn sẽ hoàn lại tồn kho và xóa khoản nợ của đơn bằng bút toán đảo.</strong><small>Đơn đã thu tiền phải xử lý qua trả hàng/hoàn tiền. Lịch sử đơn và lý do hủy vẫn được giữ lại.</small></span></div><div class='form-grid' style='margin-top:14px'>${warehouseField}</div><label class='install-hint' style='display:flex;align-items:flex-start;gap:9px;margin-top:14px'><input type='checkbox' name='stockConfirmed' required style='margin-top:2px;flex:none'/>Tôi xác nhận hàng chưa giao hoặc đã được đưa lại cửa hàng.</label><div class='form-field full' style='margin-top:14px'><label class='input-label' for='void-reason'>Lý do hủy *</label><textarea class='input' id='void-reason' name='reason' rows='3' required minlength='1' maxlength='450' placeholder='Ví dụ: tạo nhầm đơn trước khi thu tiền' style='height:auto;padding:10px'></textarea></div></form>`;
    modalForm('Hủy đơn hàng', 'Chỉ hủy được đơn chưa thu tiền và chưa trả hàng.', form, 'Xác nhận hủy đơn', true);
  }

  async function saveVoidOrder(form) {
    const orderId = form.dataset.id;
    const data = new FormData(form);
    const reason = String(data.get('reason') || '').trim();
    if (!reason) return toast('Cần nhập lý do', 'Ghi lý do để cửa hàng có thể truy vết việc hủy.', 'error');
    const warehouseId = String(data.get('warehouseId') || '');
    if (!warehouseId) return toast('Chưa chọn kho nhận tồn', 'Chọn kho đang hoạt động để nhận lại hàng.', 'error');
    const submit = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/orders/${encodeURIComponent(orderId)}/void`, {
        method: 'POST', body: { reason: reason, warehouseId: warehouseId, stockConfirmed: data.get('stockConfirmed') === 'on' },
      });
      closeModal();
      await Promise.all([
        loadProductsPage('', 0), loadInventoryPage('', 0), loadCustomersPage('', 0),
        loadOrdersPage('', 0), loadFinancePage(),
      ]);
      render();
      toast(result.alreadyVoided ? 'Đơn đã được hủy trước đó' : 'Đã hủy đơn hàng', 'Tồn kho và công nợ đã được cập nhật bằng bút toán đảo.');
      await openOrder(orderId);
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else toast('Chưa hủy được đơn hàng', error.message, 'error');
      if (submit && submit.isConnected) submit.disabled = false;
    }
  }

  async function openCollectPayment(orderId) {
    let order;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/orders/${encodeURIComponent(orderId)}`);
      order = result.order;
    } catch (error) { return toast('Chưa tải được đơn hàng', error.message, 'error'); }
    const pending = loadPendingPayment(orderId);
    const paid = order.payments.filter(function (p) { return p.status === 'succeeded'; }).reduce(function (sum, payment) { return sum + Number(payment.amount_vnd); }, 0);
    const refunded = order.returns.reduce(function (sum, row) { return sum + Number(row.refunded_vnd); }, 0);
    const returned = order.returns.reduce(function (sum, row) { return sum + Number(row.refund_total_vnd); }, 0);
    const due = Math.max(0, Number(order.totalVnd) - paid - returned + refunded);
    if (!due && !pending) return toast('Đơn hàng đã thanh toán đủ', 'Không còn khoản cần thu.');
    const payload = pending ? pending.payload : { amountVnd: due, method: 'cash', note: '' };
    const disabled = pending ? 'disabled' : '';
    const body = `<form id='entity-form' data-form='payment' data-order-id='${orderId}'><div class='checkout-total'><span>Còn phải thu · ${esc(order.number)}</span><strong>${money(due)}</strong></div><div class='form-grid'><div class='form-field'><label class='input-label'>Số tiền nhận (VND) *</label><input class='input' name='amountVnd' type='number' min='1' max='${due}' step='1' value='${esc(payload.amountVnd)}' required ${disabled}/></div><div class='form-field'><label class='input-label'>Phương thức nhận tiền</label><div class='select-wrap'><select class='input' name='method' ${disabled}><option value='cash' ${payload.method === 'cash' ? 'selected' : ''}>Tiền mặt</option><option value='bank_transfer' ${payload.method === 'bank_transfer' ? 'selected' : ''}>Chuyển khoản</option><option value='bank_qr' ${payload.method === 'bank_qr' ? 'selected' : ''}>QR ngân hàng</option><option value='card' ${payload.method === 'card' ? 'selected' : ''}>Thẻ</option><option value='other' ${payload.method === 'other' ? 'selected' : ''}>Khác</option></select></div></div><div class='form-field full'><label class='input-label'>Ghi chú</label><input class='input' name='note' maxlength='300' value='${esc(payload.note || '')}' placeholder='Ghi chú không bắt buộc' ${disabled}/></div></div><div class='modal-note'>Slink ghi khoản thu vào đơn hàng, công nợ khách và sổ quỹ. Chuyển khoản và QR được nhân viên xác nhận thủ công.</div>${pending ? `<div class='modal-note'>Yêu cầu thu tiền đang chờ xác nhận. Hãy gửi lại cùng nội dung để tránh ghi nhận hai lần.</div>` : ''}</form>`;
    showModal(pending ? 'Kiểm tra khoản thu đang chờ' : 'Ghi nhận khách thanh toán', 'Ghi lại số tiền khách vừa trả cho đơn hàng.', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Quay lại đơn</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại khoản thu' : 'Lưu khoản thu'}</button>`);
  }

  async function savePayment(form) {
    const orderId = form.dataset.orderId;
    let pending = loadPendingPayment(orderId);
    if (!pending) {
      const data = new FormData(form);
      const amount = Number(data.get('amountVnd'));
      if (!Number.isSafeInteger(amount) || amount <= 0) return toast('Số tiền không hợp lệ', 'Nhập số tiền bằng VND nguyên dương.', 'error');
      pending = { storeId: store.id, orderId: orderId, key: newIdempotencyKey(), payload: { amountVnd: amount, method: String(data.get('method') || 'cash'), note: String(data.get('note') || '').trim() } };
    }
    if (!savePendingPayment(pending)) return pendingSaveFailed();
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/orders/${encodeURIComponent(orderId)}/payments`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      clearPendingPayment(orderId);
      closeModal();
      await Promise.all([loadCustomersPage(searchTerms.customers, customerOffset), loadOrdersPage(searchTerms.orders, orderOffset)]);
      toast('Đã ghi nhận khoản thu', money(Number(result.payment.amountVnd)));
      await openOrder(orderId);
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra khoản thu.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingPayment(orderId);
        if (!modal.hidden) openCollectPayment(orderId);
      }
      toast('Chưa lưu được khoản thu', error.message, 'error');
      if (submitButton && !modal.hidden) submitButton.disabled = false;
    }
  }

  async function openCollectCustomerPayment(customerId) {
    let customer;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/customers/${encodeURIComponent(customerId)}`);
      customer = result.customer;
    } catch (error) { return toast('Chưa tải được công nợ', error.message, 'error'); }
    const pending = loadPendingCustomerPayment(customerId);
    const due = BigInt(customer.balance_vnd || '0');
    if (due <= 0n && !pending) return toast('Khách hàng không còn nợ', 'Không có khoản công nợ cần thu.');
    const payload = pending ? pending.payload : { amountVnd: due.toString(), method: 'cash', note: '' };
    const disabled = pending ? 'disabled' : '';
    const max = due > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(due);
    const body = `<form id='entity-form' data-form='customer-payment' data-customer-id='${esc(customerId)}'><div class='checkout-total'><span>Còn phải thu · ${esc(customer.name)}</span><strong>${moneyVndText(customer.balance_vnd || '0')}</strong></div><div class='form-grid'><div class='form-field'><label class='input-label'>Số tiền nhận (VND) *</label><input class='input' name='amountVnd' type='number' min='1' max='${max}' step='1' value='${esc(payload.amountVnd)}' required ${disabled}/></div><div class='form-field'><label class='input-label'>Phương thức nhận tiền</label><div class='select-wrap'><select class='input' name='method' ${disabled}><option value='cash' ${payload.method === 'cash' ? 'selected' : ''}>Tiền mặt</option><option value='bank_transfer' ${payload.method === 'bank_transfer' ? 'selected' : ''}>Chuyển khoản</option><option value='bank_qr' ${payload.method === 'bank_qr' ? 'selected' : ''}>QR ngân hàng</option><option value='card' ${payload.method === 'card' ? 'selected' : ''}>Thẻ</option><option value='other' ${payload.method === 'other' ? 'selected' : ''}>Khác</option></select></div></div><div class='form-field full'><label class='input-label'>Ghi chú</label><input class='input' name='note' maxlength='300' value='${esc(payload.note || '')}' placeholder='Ghi chú không bắt buộc' ${disabled}/></div></div><div class='modal-note'>Khoản thu được tự động phân bổ vào các đơn còn nợ cũ nhất trước, sau đó mới trừ công nợ đầu kỳ. Thanh toán không tiền mặt được nhân viên xác nhận thủ công.</div>${pending ? `<div class='modal-note'>Yêu cầu thu tiền đang chờ xác nhận. Gửi lại cùng nội dung để tránh ghi nhận hai lần.</div>` : ''}</form>`;
    showModal(pending ? 'Kiểm tra khoản thu đang chờ' : 'Thu công nợ khách hàng', 'Slink tự phân bổ khoản thu theo thứ tự đơn cũ trước.', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Quay lại hồ sơ</button><button class='btn btn-primary' type='submit' form='entity-form'>${pending ? 'Thử lại khoản thu' : 'Lưu khoản thu'}</button>`);
  }

  async function saveCustomerPayment(form) {
    const customerId = form.dataset.customerId;
    let pending = loadPendingCustomerPayment(customerId);
    if (!pending) {
      const data = new FormData(form);
      const amount = String(data.get('amountVnd') || '').trim();
      if (!/^[1-9]\d*$/.test(amount) || !Number.isSafeInteger(Number(amount))) return toast('Số tiền không hợp lệ', 'Nhập số tiền bằng VND nguyên dương.', 'error');
      pending = { storeId: store.id, customerId, key: newIdempotencyKey(), payload: { amountVnd: amount, method: String(data.get('method') || 'cash'), note: String(data.get('note') || '').trim() } };
    }
    if (!savePendingCustomerPayment(pending)) return pendingSaveFailed();
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/customers/${encodeURIComponent(customerId)}/payments`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      clearPendingCustomerPayment(customerId);
      const refreshList = page === 'customers'
        ? loadCustomersPage(searchTerms.customers, customerOffset)
        : Promise.resolve();
      await Promise.all([refreshList, loadFinancePage()]);
      toast('Đã ghi nhận khoản thu', `${moneyVndText(result.payment.amountVnd)} · còn nợ ${moneyVndText(result.payment.customerBalanceVnd)}`);
      await openCustomerDetail(customerId);
      if (page === 'finance') render();
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra khoản thu.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingCustomerPayment(customerId);
        if (!modal.hidden) openCollectCustomerPayment(customerId);
      }
      toast('Chưa lưu được khoản thu', error.message, 'error');
      if (submitButton && !modal.hidden) submitButton.disabled = false;
    }
  }

  async function openReturn(orderId) {
    let order;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/orders/${encodeURIComponent(orderId)}`);
      order = result.order;
    } catch (error) {
      return toast('Chưa tải được đơn hàng', error.message, 'error');
    }
    const saved = loadPendingReturn(orderId);
    returnPending = saved;
    const returnMap = new Map((saved && saved.payload.items || []).map(function (item) { return [item.orderLineId, Number(item.quantity)]; }));
    const lines = order.items.filter(function (line) { return Number(line.returned_quantity) < Number(line.quantity); });
    if (!lines.length) return toast('Đơn hàng đã trả đủ', 'Không còn sản phẩm nào có thể trả.');
    const lineMarkup = lines.map(function (line) {
      const remaining = Number(line.quantity) - Number(line.returned_quantity);
      const quantity = returnMap.has(line.id) ? returnMap.get(line.id) : 0;
      const disabled = saved ? 'disabled' : '';
      return `<div class='detail-line' style='gap:12px'><span>${esc(line.product_name_snapshot)}<small> Còn trả ${number(remaining)} ${esc(line.unit_snapshot)}</small></span><input class='input' data-return-line='${line.id}' type='number' min='0' max='${remaining}' step='0.001' value='${quantity}' aria-label='Số lượng trả ${esc(line.product_name_snapshot)}' style='max-width:125px' ${disabled}/></div>`;
    }).join('');
    const disabled = saved ? 'disabled' : '';
    const reason = saved ? saved.payload.reason : '';
    const restock = saved ? saved.payload.restockPolicy : 'restock';
    const refundMethod = saved ? saved.payload.refundMethod : 'cash';
    const restockWarehouseId = saved ? (saved.payload.restockWarehouseId || '') : (selectedWarehouseId || ((warehouses.find(function (warehouse) { return warehouse.is_default; }) || warehouses[0] || {}).id || ''));
    const restockWarehouseOptions = warehouses.map(function (warehouse) { return `<option value='${esc(warehouse.id)}' ${warehouse.id === restockWarehouseId ? 'selected' : ''}>${esc(warehouse.name)}${warehouse.is_default ? ' · Kho chính' : ''}</option>`; }).join('');
    const restockWarehouseField = warehouses.length > 1
      ? `<div class='form-field full'><label class='input-label' for='return-restock-warehouse'>Kho nhận hàng hoàn</label><div class='select-wrap'><select class='input' id='return-restock-warehouse' name='restockWarehouseId' ${disabled}>${restockWarehouseOptions}</select></div></div>`
      : `<input type='hidden' name='restockWarehouseId' value='${esc(restockWarehouseId)}'/>`;
    const body = `<form id='entity-form' data-form='return' data-order-id='${orderId}'><div class='checkout-total'><span>Đơn hàng</span><strong>${esc(order.number)}</strong></div><div class='detail-lines'>${lineMarkup}</div><div class='form-grid' style='margin-top:14px'><div class='form-field full'><label class='input-label'>Lý do trả hàng *</label><input class='input' name='reason' required minlength='2' maxlength='500' value='${esc(reason)}' placeholder='Ví dụ: đổi size, sản phẩm lỗi' ${disabled}/></div>${restockWarehouseField}<div class='form-field'><label class='input-label'>Tình trạng hàng</label><div class='select-wrap'><select class='input' name='restockPolicy' ${disabled}><option value='restock' ${restock === 'restock' ? 'selected' : ''}>Còn bán được · nhập lại kho</option><option value='damaged' ${restock === 'damaged' ? 'selected' : ''}>Hư hỏng · không nhập kho</option><option value='discarded' ${restock === 'discarded' ? 'selected' : ''}>Bỏ hàng · không nhập kho</option></select></div></div><div class='form-field'><label class='input-label'>Phương thức hoàn tiền</label><div class='select-wrap'><select class='input' name='refundMethod' ${disabled}><option value='cash' ${refundMethod === 'cash' ? 'selected' : ''}>Tiền mặt</option><option value='bank_transfer' ${refundMethod === 'bank_transfer' ? 'selected' : ''}>Chuyển khoản</option><option value='bank_qr' ${refundMethod === 'bank_qr' ? 'selected' : ''}>QR ngân hàng</option><option value='card' ${refundMethod === 'card' ? 'selected' : ''}>Thẻ</option><option value='other' ${refundMethod === 'other' ? 'selected' : ''}>Khác</option></select></div></div></div><div class='modal-note'>Slink tính tiền hoàn theo giá đã bán và mức giảm giá của từng sản phẩm. Chọn kho đang hoạt động để nhận hàng còn bán được. Phần đơn chưa thanh toán được chuyển thành số dư khách hàng nếu đơn có gắn hồ sơ khách.</div>${saved ? `<div class='modal-note'>Thao tác trả hàng đang chờ xác nhận. Gửi lại cùng nội dung để tránh ghi nhận hai lần.</div>` : ''}</form>`;
    showModal(saved ? 'Kiểm tra trả hàng đang chờ' : 'Trả một phần đơn hàng', 'Chọn số lượng khách trả lại và cách xử lý hàng.', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Quay lại đơn</button><button class='btn btn-primary' type='submit' form='entity-form'>${saved ? 'Thử lại trả hàng' : 'Xác nhận trả hàng'}</button>`, true);
  }

  async function saveReturn(form) {
    const orderId = form.dataset.orderId;
    let pending = loadPendingReturn(orderId);
    if (!pending) {
      const data = new FormData(form);
      const items = Array.from(form.querySelectorAll('[data-return-line]')).map(function (input) {
        return { orderLineId: input.dataset.returnLine, quantity: Number(input.value) || 0 };
      }).filter(function (item) { return item.quantity > 0; });
      if (!items.length) return toast('Chưa chọn sản phẩm', 'Nhập số lượng lớn hơn 0 cho ít nhất một dòng.', 'error');
      for (const item of items) {
        if (!Number.isFinite(item.quantity) || item.quantity < 0 || Math.abs(item.quantity * 1000 - Math.round(item.quantity * 1000)) > 1e-6) return toast('Số lượng không hợp lệ', 'Số lượng trả tối đa có 3 chữ số thập phân.', 'error');
      }
      const reason = String(data.get('reason') || '').trim();
      if (reason.length < 2) return toast('Cần ghi lý do trả hàng', 'Nhập lý do từ 2 ký tự trở lên.', 'error');
      const restockPolicy = String(data.get('restockPolicy') || 'restock');
      const restockWarehouseId = String(data.get('restockWarehouseId') || '');
      if (restockPolicy === 'restock' && !restockWarehouseId) return toast('Chưa có kho nhận hàng', 'Chọn kho đang hoạt động để nhập lại hàng hoàn.', 'error');
      pending = {
        storeId: store.id,
        orderId: orderId,
        key: newIdempotencyKey(),
        payload: { items: items, reason: reason, restockPolicy: restockPolicy, restockWarehouseId: restockPolicy === 'restock' ? restockWarehouseId : null, refundMethod: String(data.get('refundMethod') || 'cash') },
      };
      returnPending = pending;
    }
    if (!savePendingReturn()) return pendingSaveFailed();
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/orders/${encodeURIComponent(orderId)}/returns`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      clearPendingReturn(orderId);
      closeModal();
      await Promise.all([loadProductsPage('', 0), loadCustomersPage(searchTerms.customers, customerOffset), loadOrdersPage(searchTerms.orders, orderOffset)]);
      toast('Đã ghi nhận trả hàng', `${result.return.number} · ${money(Number(result.return.refundTotalVnd))}`);
      await openOrder(orderId);
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra yêu cầu trả hàng.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingReturn(orderId);
        if (!modal.hidden) openReturn(orderId);
      }
      toast('Chưa hoàn tất được trả hàng', error.message, 'error');
      if (submitButton && !modal.hidden) submitButton.disabled = false;
    }
  }

  async function openCustomerDetail(id) {
    const initial = customerById(id);
    if (!initial) return;
    const requestNumber = ++customerDetailRequestNumber;
    showModal('Hồ sơ khách hàng', 'Đang tải thông tin và lịch sử mua hàng…', `<div class='empty-state'><strong>Đang tải hồ sơ</strong></div>`, `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button>`, true);
    const currentModalGeneration = modalGeneration;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/customers/${encodeURIComponent(id)}`);
      if (requestNumber !== customerDetailRequestNumber || currentModalGeneration !== modalGeneration || modal.hidden) return;
      const c = mapCustomer(result.customer);
      const orders = result.recentOrders || [];
      const payments = result.recentPayments || [];
      const orderRows = orders.map(function (row) {
        const order = mapOrder(row);
        return `<tr><td><button class='link-button order-ref' data-action='order-detail' data-id='${order.id}'>${esc(order.number)}</button></td><td>${humanDate(order.createdAt)}</td><td class='text-right'>${money(order.total)}</td><td>${statusBadge(order.status)}</td></tr>`;
      }).join('');
      const paymentMethodLabels = { cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', bank_qr: 'QR ngân hàng', card: 'Thẻ', other: 'Khác' };
      const paymentRows = payments.map(function (payment) {
        const allocations = Array.isArray(payment.allocations) ? payment.allocations : [];
        const allocationLabels = allocations.map(function (allocation) {
          return `${esc(allocation.orderNumber || 'Đơn hàng')} · ${moneyVndText(allocation.amountVnd || '0')}`;
        });
        if (BigInt(payment.opening_balance_amount_vnd || '0') > 0n) {
          allocationLabels.push(`Công nợ đầu kỳ · ${moneyVndText(payment.opening_balance_amount_vnd)}`);
        }
        return `<tr><td>${humanDate(payment.occurred_at, true)}</td><td><strong>${moneyVndText(payment.amount_vnd)}</strong></td><td>${esc(paymentMethodLabels[payment.method] || payment.method || '')}</td><td>${allocationLabels.join('<br>') || 'Không có chi tiết phân bổ'}</td><td>${esc(payment.note || '')}</td></tr>`;
      }).join('');
      const canManageTags = ['owner', 'manager', 'cashier'].includes(store.role);
      const pendingTag = loadPendingCustomerTag(c.id);
      const tagChips = (Array.isArray(result.customer.tags) ? result.customer.tags : []).map(function (tag) {
        return `<span class='customer-tag-chip'>${esc(tag.label)}${canManageTags ? `<button type='button' data-action='customer-tag-remove' data-id='${esc(c.id)}' data-tag='${esc(tag.label)}' aria-label='Gỡ nhãn ${esc(tag.label)}' ${pendingTag ? 'disabled' : ''}>×</button>` : ''}</span>`;
      }).join('');
      const tagPendingHint = pendingTag && canManageTags
        ? `<div class='install-hint customer-tag-pending' role='status'>Nhãn đang chờ máy chủ xác nhận. Gửi lại đúng thao tác đã lưu trên thiết bị.<button class='btn btn-secondary' type='button' data-action='retry-customer-tag' data-id='${esc(c.id)}'>Thử lại thao tác</button></div>`
        : '';
      const customerTags = `<section class='panel customer-tags-panel'><div class='panel-header'><div><h2>Phân loại khách hàng</h2><p>Nhãn giúp lọc nhanh nhóm khách trong danh sách. Mỗi hồ sơ tối đa 20 nhãn.</p></div></div>${tagPendingHint}<div class='customer-tag-list'>${tagChips || `<span class='muted'>Chưa có nhãn phân loại</span>`}</div>${canManageTags ? `<form class='customer-tag-form' data-form='customer-tag' data-id='${esc(c.id)}'><label class='input-label' for='customer-tag-input'>Thêm nhãn</label><div><input class='input' id='customer-tag-input' name='tag' maxlength='32' placeholder='Ví dụ: Khách VIP, Mua sỉ' required ${pendingTag ? 'disabled' : ''}/><button class='btn btn-secondary' type='submit' ${pendingTag ? 'disabled' : ''}>Gắn nhãn</button></div></form>` : ''}</section>`;
      const body = `<section class='panel'><div class='customer-header'><span class='avatar'>${esc(initials(c.name))}</span><div><h2>${esc(c.name)}</h2><p>${esc(c.phone)}${c.email ? ' · ' + c.email : ''}</p></div><span class='badge badge-success' style='margin-left:auto'>${esc(c.tier)}</span></div><div class='customer-stats'><div class='customer-stat'><small>Tổng chi tiêu</small><strong>${money(c.totalSpent)}</strong></div><div class='customer-stat'><small>Số đơn</small><strong>${number(c.orders)}</strong></div><div class='customer-stat'><small>Công nợ</small><strong>${money(c.debt)}</strong></div></div></section>${customerTags}<section style='margin-top:17px'><div class='panel-header' style='padding:0 0 10px'><div><h2>Lịch sử gần đây</h2><p>5 đơn hàng mới nhất</p></div></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Mã đơn</th><th>Ngày</th><th class='text-right'>Tổng tiền</th><th>Trạng thái</th></tr></thead><tbody>${orderRows || `<tr><td colspan='4'><div class='empty-state'><strong>Chưa có đơn mua hàng</strong><span>Khách này chưa phát sinh giao dịch.</span></div></td></tr>`}</tbody></table></div></section><section class='panel customer-payment-history' style='margin-top:17px'><div class='panel-header'><div><h2>Lịch sử thu công nợ</h2><p>20 khoản thu gần nhất, gồm phương thức và phần công nợ được thanh toán.</p></div></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Thời gian</th><th>Số tiền</th><th>Phương thức</th><th>Phân bổ</th><th>Ghi chú</th></tr></thead><tbody>${paymentRows || `<tr><td colspan='5'><div class='empty-state'><strong>Chưa có khoản thu công nợ</strong><span>Khoản thu sẽ xuất hiện tại đây sau khi được lưu.</span></div></td></tr>`}</tbody></table></div></section>${c.debt ? `<div class='summary-banner' style='margin-top:14px'><div><strong>Công nợ hiện tại</strong><small>Khoản chưa thanh toán của khách hàng</small></div><strong>${money(c.debt)}</strong></div>` : ''}`;
      showModal('Hồ sơ khách hàng', 'Thông tin và lịch sử mua hàng.', body, `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button>${['owner', 'manager', 'cashier'].includes(store.role) ? `<button class='btn btn-secondary' data-action='edit-customer' data-id='${c.id}'>${icon('edit', 14)} Chỉnh sửa</button>` : ''}${Number(c.debt) > 0 && ['owner', 'manager', 'cashier', 'accountant'].includes(store.role) ? `<button class='btn btn-primary' data-action='collect-customer-payment' data-id='${c.id}'>Thu công nợ</button>` : ''}`, true);
    } catch (error) {
      if (requestNumber !== customerDetailRequestNumber || currentModalGeneration !== modalGeneration || modal.hidden) return;
      if (error.status === 401) return showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      showModal('Chưa tải được hồ sơ', error.message, `<div class='auth-message error'>Tải lại hồ sơ khách hàng rồi thử lại.</div>`, `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button>`, true);
    }
  }

  async function sendPendingCustomerTag(customerId) {
    const pending = loadPendingCustomerTag(customerId);
    if (!pending) return toast('Không có thao tác đang chờ', 'Nhập lại nhãn khách hàng để tạo yêu cầu mới.', 'error');
    modal.querySelectorAll('.customer-tag-form input,.customer-tag-form button,.customer-tag-chip button').forEach(function (control) { control.disabled = true; });
    const retry = modal.querySelector('[data-action="retry-customer-tag"]');
    if (retry) retry.disabled = true;
    const requestGeneration = modalGeneration;
    try {
      await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/customers/${encodeURIComponent(customerId)}/tags`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      clearPendingCustomerTag(customerId);
      toast(pending.payload.operation === 'add' ? 'Đã gắn nhãn khách hàng' : 'Đã gỡ nhãn khách hàng');
      const refreshList = page === 'customers'
        ? loadCustomersPage(searchTerms.customers, customerOffset)
        : Promise.resolve();
      await Promise.all([openCustomerDetail(customerId), refreshList]);
      if (page === 'customers') render();
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingCustomerTag(customerId);
      }
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra nhãn khách hàng đang chờ.', 'error');
      else toast('Chưa cập nhật được nhãn khách hàng', error.message, 'error');
      if (requestGeneration === modalGeneration && !modal.hidden) await openCustomerDetail(customerId);
    }
  }

  function changeCustomerTag(customerId, operation, tag) {
    const existing = loadPendingCustomerTag(customerId);
    if (existing) return sendPendingCustomerTag(customerId);
    const normalized = String(tag || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!normalized || Array.from(normalized).length > 32) return toast('Nhãn chưa hợp lệ', 'Nhãn cần từ 1 đến 32 ký tự.', 'error');
    const pending = { customerId, key: newIdempotencyKey(), payload: { operation, tag: normalized } };
    if (!savePendingCustomerTag(pending)) return pendingSaveFailed();
    return sendPendingCustomerTag(customerId);
  }

  function pickCustomer() {
    const body = `<div class='search-wrap'><span class='search-symbol'>⌕</span><input id='pick-customer-search' class='input' type='search' placeholder='Tìm tên hoặc điện thoại…'/></div><div id='customer-options' class='customer-picker'>${store.customers.map(function (c) { return `<button class='customer-option' data-action='select-customer' data-id='${c.id}'><span class='avatar' style='width:26px;height:26px'>${esc(initials(c.name))}</span><span>${esc(c.name)}</span><small>${esc(c.phone)}</small></button>`; }).join('')}</div><button class='btn btn-secondary' style='margin-top:13px;width:100%' data-action='new-customer-from-pos'>＋ Tạo khách hàng mới</button>`;
    showModal('Chọn khách hàng', 'Gắn đơn hàng với hồ sơ khách hàng.', body, `<button class='btn btn-secondary' data-action='select-customer' data-id=''>Bán cho khách lẻ</button>`, true);
  }

  function showMoreMenu() {
    const links = navItems.filter(function (n) { return !['dashboard', 'pos', 'orders'].includes(n.id) && canAccessRoute(n.id); });
    const body = `<div class='notice-list'>${links.map(function (n) { return `<button class='notice-item' data-route='${n.id}' style='width:100%;text-align:left;background:#fff;cursor:pointer'><span class='activity-mark'>${icon(n.icon, 15)}</span><span><strong>${n.label}</strong><small>Mở khu vực ${n.label.toLowerCase()}</small></span></button>`; }).join('')}</div>`;
    showModal('Tất cả chức năng', 'Chọn khu vực bạn muốn mở.', body, `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button>`, true);
  }

  function showAccountMenu() {
    const user = authSession && authSession.user ? authSession.user : {};
    const displayName = esc(user.displayName || 'Tài khoản Slink');
    const email = esc(user.email || '');
    const avatar = esc(initials(user.displayName || user.email || 'S'));
    const storeName = esc(store.settings.storeName || 'Cửa hàng của bạn');
    const body = `<div class='account-summary'><span class='account-avatar' aria-hidden='true'>${avatar}</span><div class='account-summary-copy'><strong>${displayName}</strong><span>${email}</span></div></div><div class='account-store'><span class='account-store-label'>Cửa hàng</span><strong>${storeName}</strong></div>`;
    const footer = `<button class='btn btn-secondary' data-action='account-settings'>Cài đặt tài khoản</button><button class='btn btn-danger' data-action='logout'>Đăng xuất</button>`;
    showModal('Tài khoản', 'Quản lý phiên đăng nhập và thông tin cửa hàng.', body, footer);
  }

  function showScan() {
    const body = `<form id='entity-form' data-form='scan'><div class='scan-camera-panel'><video id='scan-camera-video' class='scan-camera-video' playsinline muted hidden aria-label='Xem hình ảnh camera khi quét mã'></video><button class='btn btn-secondary' type='button' data-action='start-camera-scan'>Mở camera để quét</button><p id='scan-camera-status' class='scan-camera-status' role='status'>Trên trình duyệt hỗ trợ, bạn có thể quét mã vạch hoặc QR. Nếu camera không dùng được, hãy nhập mã bên dưới.</p></div><div class='form-field'><label class='input-label' for='scan-code'>Mã SKU, mã vạch hoặc QR</label><input id='scan-code' class='input' name='code' autofocus placeholder='Nhập hoặc dán mã sản phẩm…' autocomplete='off' inputmode='text'/></div></form>`;
    showModal('Tìm sản phẩm nhanh', 'Quét bằng camera hoặc nhập mã SKU, mã vạch trên sản phẩm.', body, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>Tìm sản phẩm</button>`);
  }

  function setScanCameraStatus(message, isError) {
    const status = modal.querySelector('#scan-camera-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', Boolean(isError));
  }

  function stopScanCamera() {
    scanCameraGeneration += 1;
    scanCameraRunning = false;
    scanCameraStarting = false;
    scanCameraDetector = null;
    if (scanCameraTimer) window.clearTimeout(scanCameraTimer);
    scanCameraTimer = 0;
    if (scanCameraStream) scanCameraStream.getTracks().forEach(function (track) { track.stop(); });
    scanCameraStream = null;
    const video = modal.querySelector('#scan-camera-video');
    if (video) {
      video.pause();
      video.srcObject = null;
      video.hidden = true;
    }
    const button = modal.querySelector('[data-action="start-camera-scan"]');
    if (button && button.dataset.unsupported !== 'true') {
      button.disabled = false;
      button.textContent = 'Mở camera để quét';
    }
  }

  async function startScanCamera(button) {
    if (scanCameraRunning || scanCameraStarting) return;
    const requestGeneration = ++scanCameraGeneration;
    const video = modal.querySelector('#scan-camera-video');
    const codeInput = modal.querySelector('#scan-code');
    const form = modal.querySelector('form[data-form="scan"]');
    if (!video || !codeInput || !form) return;
    if (!window.isSecureContext || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setScanCameraStatus('Camera cần kết nối HTTPS và trình duyệt cho phép sử dụng camera. Bạn vẫn có thể nhập mã thủ công.', true);
      return;
    }
    const Detector = window.BarcodeDetector;
    if (typeof Detector !== 'function') {
      if (button) { button.disabled = true; button.dataset.unsupported = 'true'; }
      setScanCameraStatus('Trình duyệt này chưa hỗ trợ nhận dạng mã bằng camera. Hãy nhập hoặc dán mã sản phẩm bên dưới.', true);
      return;
    }
    scanCameraStarting = true;
    const requestedFormats = ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf'];
    try {
      let supportedFormats = [];
      if (typeof Detector.getSupportedFormats === 'function') supportedFormats = await Detector.getSupportedFormats();
      if (requestGeneration !== scanCameraGeneration || modal.hidden) return;
      const formats = supportedFormats.length ? requestedFormats.filter(function (format) { return supportedFormats.includes(format); }) : requestedFormats;
      if (!formats.length) throw new Error('Trình duyệt không hỗ trợ định dạng mã này.');
      scanCameraDetector = new Detector({ formats });
    } catch (error) {
      if (requestGeneration !== scanCameraGeneration) return;
      scanCameraStarting = false;
      if (button) { button.disabled = true; button.dataset.unsupported = 'true'; }
      setScanCameraStatus('Không thể khởi tạo bộ đọc mã trên trình duyệt này. Hãy nhập hoặc dán mã sản phẩm.', true);
      return;
    }
    if (requestGeneration !== scanCameraGeneration || modal.hidden) return;
    if (button) { button.disabled = true; button.textContent = 'Đang mở camera…'; }
    setScanCameraStatus('Đang mở camera. Chỉ cần cho phép camera để quét mã; bạn cũng có thể hủy và nhập mã thủ công.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (requestGeneration !== scanCameraGeneration || modal.hidden) {
        stream.getTracks().forEach(function (track) { track.stop(); });
        return;
      }
      scanCameraStream = stream;
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      if (requestGeneration !== scanCameraGeneration || modal.hidden) {
        stream.getTracks().forEach(function (track) { track.stop(); });
        if (scanCameraStream === stream) scanCameraStream = null;
        video.srcObject = null;
        video.hidden = true;
        return;
      }
      scanCameraRunning = true;
      scanCameraStarting = false;
      if (button) button.textContent = 'Đang quét…';
      setScanCameraStatus('Đưa mã vào khung camera. Khi nhận dạng thành công, Slink sẽ tìm sản phẩm và thêm một sản phẩm vào giỏ.');
      const detectFrame = async function () {
        if (!scanCameraRunning || requestGeneration !== scanCameraGeneration || modal.hidden) return;
        if (video.readyState >= 2) {
          try {
            const codes = await scanCameraDetector.detect(video);
            if (!scanCameraRunning || requestGeneration !== scanCameraGeneration || modal.hidden) return;
            const detected = codes.find(function (code) { return typeof code.rawValue === 'string' && code.rawValue.trim(); });
            const rawValue = detected ? detected.rawValue.trim() : '';
            if (rawValue) {
              stopScanCamera();
              setScanCameraStatus('Đã đọc mã. Đang tìm sản phẩm trong cửa hàng…');
              codeInput.value = rawValue;
              await addByCode(form);
              if (!modal.hidden) codeInput.focus();
              return;
            }
          } catch (error) {
            if (requestGeneration !== scanCameraGeneration) return;
            stopScanCamera();
            setScanCameraStatus('Camera đang mở nhưng chưa đọc được mã. Hãy thử ánh sáng tốt hơn hoặc nhập mã bên dưới.', true);
            return;
          }
        }
        if (scanCameraRunning && requestGeneration === scanCameraGeneration) scanCameraTimer = window.setTimeout(detectFrame, 160);
      };
      detectFrame();
    } catch (error) {
      if (requestGeneration !== scanCameraGeneration) return;
      stopScanCamera();
      const message = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
        ? 'Quyền camera chưa được cấp. Cho phép camera trong cài đặt trình duyệt hoặc tiếp tục nhập mã thủ công.'
        : error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError'
          ? 'Không tìm thấy camera trên thiết bị này. Bạn vẫn có thể nhập mã thủ công.'
          : 'Chưa mở được camera. Hãy kiểm tra quyền camera hoặc nhập mã thủ công.';
      setScanCameraStatus(message, true);
      if (codeInput) codeInput.focus();
    } finally {
      scanCameraStarting = false;
    }
  }

  function showDiscount() {
    const current = cart.discount || 0;
    const form = `<form id='entity-form' data-form='discount'><div class='form-field'><label class='input-label'>Giảm giá đơn hàng (VND)</label><input class='input' name='discount' type='number' min='0' max='${cartTotals().subtotal}' step='1000' value='${current}' required/><small class='muted' style='display:block;margin-top:6px;font-size:9px'>Tạm tính hiện tại: ${money(cartTotals().subtotal)}</small></div></form>`;
    modalForm('Áp dụng giảm giá', 'Số tiền giảm sẽ được lưu cùng đơn hàng.', form, 'Áp dụng');
  }

  async function openPromotions() {
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/promotions`);
      const rows = result.promotions.map(function (promo) {
        const offer = promo.discountType === 'fixed' ? moneyVndText(promo.discountVnd) : `${promo.discountPercent}%`;
        const limit = promo.usageLimit === null ? 'Không giới hạn lượt' : `${number(promo.usageCount)} / ${number(promo.usageLimit)} lượt`;
        const dates = promo.endsAt ? `Hết hạn ${humanDate(promo.endsAt, true)}` : 'Không đặt ngày hết hạn';
        return `<article class='purchase-order-card'><div class='purchase-order-summary'><div><strong>${esc(promo.code)} · ${esc(promo.name)}</strong><small>Giảm ${offer} · Đơn tối thiểu ${moneyVndText(promo.minimumSubtotalVnd)}</small><small>${limit} · ${dates}</small></div><span class='purchase-order-status ${promo.isActive ? 'status-received' : 'status-cancelled'}'>${promo.isActive ? 'Đang áp dụng' : 'Đã ngừng'}</span></div>${promo.isActive ? `<div class='purchase-order-actions'><button class='link-button danger-link' data-action='archive-promotion' data-id='${esc(promo.id)}'>Ngừng mã</button></div>` : ''}</article>`;
      }).join('');
      showModal('Mã khuyến mãi', 'Tạo mã giảm tại quầy; lượt sử dụng được ghi cùng đơn hàng.', `<div class='purchase-order-list'>${rows || `<div class='panel empty-state'><strong>Chưa có mã khuyến mãi</strong><span>Tạo mã đầu tiên để nhân viên áp dụng trong lúc thanh toán.</span></div>`}</div>`, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Đóng</button><button class='btn btn-primary' type='button' data-action='new-promotion'>＋ Tạo mã</button>`, true);
    } catch (error) { toast('Chưa tải được mã khuyến mãi', error.message, 'error'); }
  }

  function openPromotionCreate() {
    const form = `<form id='entity-form' data-form='promotion-create'><div class='form-grid'><div class='form-field'><label class='input-label' for='promotion-code'>Mã *</label><input class='input' id='promotion-code' name='code' maxlength='32' pattern='[A-Za-z0-9_-]{3,32}' required placeholder='VD: KHAITRUONG10'/></div><div class='form-field'><label class='input-label' for='promotion-name'>Tên chương trình *</label><input class='input' id='promotion-name' name='name' maxlength='120' required placeholder='Ưu đãi khai trương'/></div><div class='form-field'><label class='input-label' for='promotion-type'>Kiểu giảm</label><div class='select-wrap'><select class='input' id='promotion-type' name='discountType'><option value='percent'>Theo phần trăm</option><option value='fixed'>Số tiền cố định</option></select></div></div><div class='form-field'><label class='input-label' for='promotion-percent'>Phần trăm giảm</label><input class='input' id='promotion-percent' name='discountPercent' type='number' inputmode='decimal' min='0.01' max='100' step='0.01' value='10'/></div><div class='form-field'><label class='input-label' for='promotion-vnd'>Số tiền giảm (VND)</label><input class='input' id='promotion-vnd' name='discountVnd' type='number' inputmode='numeric' min='1' step='1'/></div><div class='form-field'><label class='input-label' for='promotion-minimum'>Đơn tối thiểu (VND)</label><input class='input' id='promotion-minimum' name='minimumSubtotalVnd' type='number' inputmode='numeric' min='0' step='1' value='0'/></div><div class='form-field'><label class='input-label' for='promotion-cap'>Giảm tối đa (VND, tùy chọn)</label><input class='input' id='promotion-cap' name='maximumDiscountVnd' type='number' inputmode='numeric' min='1' step='1'/></div><div class='form-field'><label class='input-label' for='promotion-limit'>Tổng lượt dùng (để trống: không giới hạn)</label><input class='input' id='promotion-limit' name='usageLimit' type='number' min='1' step='1'/></div><div class='form-field'><label class='input-label' for='promotion-customer-limit'>Lượt dùng mỗi khách (tùy chọn)</label><input class='input' id='promotion-customer-limit' name='perCustomerLimit' type='number' min='1' step='1'/></div><div class='form-field'><label class='input-label' for='promotion-start'>Bắt đầu (tùy chọn)</label><input class='input' id='promotion-start' name='startsAt' type='datetime-local'/></div><div class='form-field'><label class='input-label' for='promotion-end'>Kết thúc (tùy chọn)</label><input class='input' id='promotion-end' name='endsAt' type='datetime-local'/></div></div><div class='modal-note'>Mỗi đơn dùng tối đa một mã. Hệ thống tính lại điều kiện và giới hạn trong giao dịch bán, không dựa vào số giảm do trình duyệt gửi.</div></form>`;
    modalForm('Tạo mã khuyến mãi', 'Mã chỉ áp dụng cho một đơn; tắt mã không xóa lịch sử đã dùng.', form, 'Tạo mã', true);
  }

  async function savePromotion(form) {
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
      await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/promotions`, { method: 'POST', body: payload });
      toast('Đã tạo mã khuyến mãi', payload.code.toUpperCase(), 'success');
      openPromotions();
    } catch (error) { toast('Chưa tạo được mã', error.message, 'error'); }
  }

  async function archivePromotion(id) {
    try {
      await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/promotions/${encodeURIComponent(id)}/archive`, { method: 'POST', body: {} });
      toast('Đã ngừng mã khuyến mãi', '', 'success');
      openPromotions();
    } catch (error) { toast('Chưa ngừng được mã', error.message, 'error'); }
  }

  function showHelp() {
    showModal('Trợ giúp Slink', 'Thông tin về các chức năng đang hoạt động.', `<div class='notice-list'><div class='notice-item'><span>📦</span><span><strong>Sản phẩm và kho</strong><small>Quản lý danh mục, kiểm kê tồn, nhập hàng và xem biến động kho. Mỗi phiếu nhập cập nhật giá vốn và công nợ nhà cung cấp.</small></span></div><div class='notice-item'><span>🧾</span><span><strong>Bán hàng và đơn hàng</strong><small>Đơn bán cập nhật kho, khoản thu và công nợ trong cùng một giao dịch. Từ chi tiết đơn, có thể ghi nhận thu nợ hoặc trả một phần hàng.</small></span></div><div class='notice-item'><span>💳</span><span><strong>Phương thức thanh toán</strong><small>Tiền mặt, chuyển khoản, QR và thẻ hiện được nhân viên xác nhận thủ công. Slink chưa kết nối trực tiếp với ngân hàng hoặc cổng thanh toán.</small></span></div><div class='notice-item'><span>🔐</span><span><strong>Bảo vệ dữ liệu</strong><small>Dữ liệu được lưu theo cửa hàng trên máy chủ. Chỉ thành viên được cấp quyền mới xem hoặc thay đổi được thông tin tương ứng.</small></span></div></div>`, `<button class='btn btn-primary' data-action='close-modal'>Đã hiểu</button>`, true);
  }

  function addProductToCart(product) {
    if (checkoutPendingPayload) { toast('Đang chờ xác nhận đơn', 'Hãy kiểm tra hoặc gửi lại đơn trước khi tạo đơn mới.', 'error'); return false; }
    if (!product || (product.inventoryTracked && !(product.stock > 0))) { toast('Sản phẩm đã hết hàng', 'Hãy nhập kho trước khi bán.', 'error'); return false; }
    const current = cart.find(function (item) { return item.id === product.id; });
    const remaining = product.inventoryTracked ? product.stock - (current ? current.qty : 0) : Infinity;
    if (product.inventoryTracked && !(remaining > 0)) { toast('Không đủ số lượng tồn', 'Giỏ hàng đã đạt số lượng đang có trong kho.', 'error'); return false; }
    const increment = product.inventoryTracked ? Math.min(1, remaining) : 1;
    if (current) current.qty += increment;
    else cart.push({ id: product.id, qty: increment });
    render();
    return true;
  }

  function addToCart(id) {
    addProductToCart(productById(id));
  }

  function setCartQty(id, delta) {
    if (checkoutPendingPayload) return toast('Đang chờ xác nhận đơn', 'Hãy kiểm tra hoặc gửi lại đơn trước khi thay đổi giỏ hàng.', 'error');
    const item = cart.find(function (x) { return x.id === id; }); const p = productById(id); if (!item) return;
    item.qty += Number(delta);
    if (item.qty <= 0) cart = cart.filter(function (x) { return x.id !== id; });
    else if (p && p.inventoryTracked && item.qty > p.stock) { item.qty = p.stock; toast('Đã đạt số lượng tồn', 'Kho hiện còn ' + p.stock + ' ' + p.unit + '.', 'error'); }
    render();
  }

  function editCartQuantity(id) {
    if (checkoutPendingPayload) return toast('Đang chờ xác nhận đơn', 'Hãy kiểm tra đơn đang chờ trước khi thay đổi giỏ hàng.', 'error');
    const item = cart.find(function (row) { return row.id === id; });
    const product = productById(id);
    if (!item || !product) return;
    const stockLimit = product.inventoryTracked ? `max='${product.stock}'` : '';
    const stockNote = product.inventoryTracked ? `Còn ${number(product.stock)} ${esc(product.unit)} trong kho` : 'Mặt hàng này không theo dõi tồn kho.';
    const form = `<form id='entity-form' data-form='cart-quantity' data-id='${product.id}'><div class='form-field'><label class='input-label'>Số lượng · ${esc(product.unit)}</label><input class='input' name='quantity' type='number' min='0.001' ${stockLimit} step='0.001' value='${item.qty}' required/><small class='muted'>${stockNote}</small></div><div class='modal-note'>Số lượng được ghi vào đơn khi bạn hoàn tất thanh toán.</div></form>`;
    showModal('Thay đổi số lượng', product.name, form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>Cập nhật</button>`);
  }

  function saveCartQuantity(form) {
    const id = form.dataset.id;
    const item = cart.find(function (row) { return row.id === id; });
    const product = productById(id);
    const quantity = Number(new FormData(form).get('quantity'));
    if (!item || !product) return closeModal();
    if (!Number.isFinite(quantity) || quantity <= 0 || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 1e-6) return toast('Số lượng không hợp lệ', 'Nhập số lượng lớn hơn 0, tối đa 3 chữ số thập phân.', 'error');
    if (product.inventoryTracked && quantity > product.stock) return toast('Không đủ hàng trong kho', `Hiện còn ${number(product.stock)} ${product.unit}.`, 'error');
    item.qty = quantity;
    closeModal();
    render();
  }

  async function createSale(form) {
    const data = new FormData(form);
    const totals = cartTotals();
    const checkoutTotal = Number(form.dataset.totalVnd || totals.total);
    const customerId = String(data.get('customerId') || '') || null;
    if (!checkoutPendingPayload) {
      const enteredPromotionCode = String(data.get('promotionCode') || '').trim().toUpperCase();
      if (enteredPromotionCode && (!checkoutPromotion || checkoutPromotion.code !== enteredPromotionCode || checkoutPromotion.customerId !== customerId)) {
        return toast('Hãy kiểm tra lại mã', 'Mã khuyến mãi hoặc khách hàng đã thay đổi sau lần kiểm tra.', 'error');
      }
      if (!enteredPromotionCode && Number(form.dataset.promotionDiscountVnd || 0) > 0) {
        return toast('Hãy kiểm tra lại mã', 'Mã khuyến mãi đã bị xóa. Hãy bấm Kiểm tra trước khi thanh toán.', 'error');
      }
      const tenderInputs = checkoutTenderValues(form);
      const tenders = [];
      const usedMethods = new Set();
      let amountReceivedVnd = 0;
      let nonCashReceived = 0;
      let cashReceived = 0;
      for (const input of tenderInputs) {
        const amountReceived = Number(input.amountText);
        if (!Number.isSafeInteger(amountReceived) || amountReceived < 0) return toast('Số tiền không hợp lệ', 'Mỗi khoản thanh toán phải là VND nguyên không âm.', 'error');
        if (usedMethods.has(input.method) && amountReceived > 0) return toast('Phương thức bị lặp', 'Mỗi phương thức chỉ được nhập một khoản.', 'error');
        if (amountReceived === 0) continue;
        usedMethods.add(input.method);
        amountReceivedVnd += amountReceived;
        if (!Number.isSafeInteger(amountReceivedVnd)) return toast('Tổng tiền vượt giới hạn', 'Hãy chia hoặc kiểm tra lại các khoản thanh toán.', 'error');
        if (input.method === 'cash') cashReceived += amountReceived;
        else nonCashReceived += amountReceived;
        tenders.push({ method: input.method, amountReceivedVnd: amountReceived });
      }
      if (nonCashReceived > checkoutTotal) return toast('Khoản không tiền mặt quá lớn', 'Tiền chuyển khoản, QR hoặc thẻ không được vượt tổng đơn.', 'error');
      if (amountReceivedVnd > checkoutTotal && cashReceived === 0) return toast('Không thể tính tiền thối', 'Chỉ khoản tiền mặt mới được nhận cao hơn số còn phải thanh toán.', 'error');
      if (amountReceivedVnd < checkoutTotal && !customerId) return toast('Chọn khách hàng', 'Cần gắn khách hàng để lưu khoản còn nợ.', 'error');
      checkoutIdempotencyKey = checkoutIdempotencyKey || newIdempotencyKey();
      checkoutPendingPayload = {
        items: cart.map(function (item) { return { productId: item.id, quantity: item.qty }; }),
        customerId: customerId,
        discountVnd: totals.discount,
        promotionCode: String(data.get('promotionCode') || '').trim().toUpperCase() || undefined,
        promotionDiscountVnd: String(form.dataset.promotionDiscountVnd || '0'),
        method: tenders.length === 1 ? tenders[0].method : (tenderInputs[0]?.method || 'cash'),
        tenders: tenders,
        amountReceivedVnd: amountReceivedVnd,
        note: String(data.get('note') || '').trim(),
        totalVnd: checkoutTotal,
        warehouseId: selectedWarehouseId || undefined,
      };
    }
    if (!savePendingSale()) return pendingSaveFailed();
    const key = checkoutIdempotencyKey;
    const payload = checkoutPendingPayload;
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/sales`, {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: payload,
      });
      cart = [];
      cartCustomerId = '';
      checkoutPromotion = null;
      clearPendingSale();
      closeModal();
      page = 'orders';
      await Promise.all([loadProductsPage('', 0), loadCustomersPage('', 0), loadOrdersPage('', 0)]);
      render();
      const order = result.order;
      toast('Đã lưu đơn hàng', `${order.number} · ${money(Number(order.totalVnd))}${Number(order.changeVnd) ? ` · tiền thối ${money(Number(order.changeVnd))}` : ''}`, 'success');
      await openOrder(order.id);
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra đơn đang chờ.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingSale();
        if (error.code === 'insufficient_stock' || error.code === 'product_unavailable' || error.code === 'inventory_unavailable') await loadProductsPage('', 0);
        if (!modal.hidden) openCheckout();
      }
      toast('Chưa hoàn tất được đơn hàng', error.message, 'error');
      if (submitButton && !modal.hidden) submitButton.disabled = false;
    }
  }

  async function saveCustomerImport(form) {
    let pending = loadPendingCustomerImport();
    if (!pending) {
      if (customerImportErrors.length || customerImportConflict || !customerImportRows.length || !customerImportPreviewValid) {
        return toast('Chưa thể nhập khách hàng', 'Chọn CSV hợp lệ, kiểm tra trùng lặp và xem lại toàn bộ bản xem trước.', 'error');
      }
      pending = { key: newIdempotencyKey(), payload: { items: customerImportRows } };
    }
    if (!savePendingCustomerImport(pending)) return pendingSaveFailed();
    const requestGeneration = modalGeneration;
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    const fileInput = modal.querySelector('#customer-import-file');
    if (submitButton) submitButton.disabled = true;
    if (fileInput) fileInput.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/customers/import`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      clearPendingCustomerImport();
      if (requestGeneration === modalGeneration && !modal.hidden) {
        closeModal();
        customerImportRows = [];
        customerImportErrors = [];
        customerImportConflict = '';
        customerImportPreviewValid = false;
      }
      await loadCustomersPage(searchTerms.customers, 0);
      if (page === 'customers') render();
      toast('Đã nhập khách hàng', `${number(Number(result.count))} hồ sơ · công nợ mở đầu ${moneyVndText(result.openingBalanceTotalVnd || '0')}.`);
    } catch (error) {
      if (error.status === 401) toast('Phiên đăng nhập đã hết hạn', 'Đăng nhập lại rồi mở lần nhập đang chờ để kiểm tra kết quả.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingCustomerImport();
        customerImportPreviewValid = false;
        customerImportConflict = `Máy chủ chưa nhập dòng nào: ${error.message} Chọn tệp đã sửa để kiểm tra lại.`;
        if (fileInput && fileInput.isConnected) fileInput.disabled = false;
        renderCustomerImportPreview();
      }
      toast('Chưa nhập được khách hàng', error.message, 'error');
      if (submitButton && requestGeneration === modalGeneration && !modal.hidden && submitButton.isConnected && !customerImportPreviewValid) submitButton.disabled = true;
      else if (submitButton && requestGeneration === modalGeneration && !modal.hidden && submitButton.isConnected) submitButton.disabled = false;
    }
  }

  async function saveProductImport(form) {
    let pending = loadPendingProductImport();
    if (!pending) {
      if (productImportErrors.length || !productImportRows.length) return toast('Chưa thể nhập sản phẩm', 'Chọn tệp CSV hợp lệ rồi kiểm tra bản xem trước.', 'error');
      if (!productImportVerifiedWarehouseId || productImportVerifiedWarehouseId !== (modal.querySelector('#product-import-warehouse')?.value || '')) return toast('Chưa thể nhập sản phẩm', 'Hãy chọn kho và kiểm tra lại tệp trước khi nhập.', 'error');
      pending = { storeId: store.id, key: newIdempotencyKey(), payload: { items: productImportRows, warehouseId: productImportVerifiedWarehouseId } };
    }
    if (!savePendingProductImport(pending)) return pendingSaveFailed();
    const requestGeneration = modalGeneration;
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    const fileInput = modal.querySelector('#product-import-file');
    if (submitButton) submitButton.disabled = true;
    if (fileInput) fileInput.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/products/import`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      clearPendingProductImport();
      if (requestGeneration === modalGeneration && !modal.hidden) {
        closeModal();
        productImportRows = [];
        productImportSourceRows = [];
        productImportErrors = [];
        productImportPending = false;
      }
      await loadProductsPage('', 0);
      toast('Đã nhập sản phẩm', `${number(Number(result.count))} sản phẩm · tồn đầu kỳ đã ghi vào sổ kho.`);
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra lần nhập.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingProductImport();
        productImportPending = false;
        if (requestGeneration === modalGeneration && !modal.hidden) {
          productImportRows = [];
          productImportErrors = [`Máy chủ chưa nhập dòng nào: ${error.message} Chọn tệp đã sửa để thử lại.`];
          productImportVerifiedWarehouseId = '';
          if (fileInput && fileInput.isConnected) fileInput.disabled = false;
          renderProductImportPreview();
        }
      }
      toast('Chưa nhập được danh mục', error.message, 'error');
      if (submitButton && requestGeneration === modalGeneration && !modal.hidden && submitButton.isConnected && !productImportRows.length) submitButton.disabled = true;
      else if (submitButton && requestGeneration === modalGeneration && !modal.hidden && submitButton.isConnected) submitButton.disabled = false;
    }
  }

  async function saveProductBulkUpdate(form) {
    let pending = loadPendingProductBulkUpdate();
    if (!pending) {
      if (productBulkUpdateErrors.length || !productBulkUpdateRows.length) return toast('Chưa thể cập nhật', 'Chọn tệp CSV hợp lệ và kiểm tra bản xem trước.', 'error');
      pending = { key: newIdempotencyKey(), payload: { items: productBulkUpdateRows } };
    }
    if (!savePendingProductBulkUpdate(pending)) return pendingSaveFailed();
    const requestGeneration = modalGeneration;
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    const fileInput = modal.querySelector('#product-bulk-update-file');
    if (submitButton) submitButton.disabled = true;
    if (fileInput) fileInput.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/products/bulk-update`, {
        method: 'POST', headers: { 'idempotency-key': pending.key },
        body: { items: pending.payload.items.map(function (item) { const { before, ...requestItem } = item; return requestItem; }) },
      });
      clearPendingProductBulkUpdate();
      if (requestGeneration === modalGeneration && !modal.hidden) {
        closeModal();
        productBulkUpdateRows = [];
        productBulkUpdateErrors = [];
      }
      await loadProductsPage('', 0);
      const changedCount = Number.isSafeInteger(result.changedCount) ? result.changedCount : (Number(result.count) || 0);
      const unchangedCount = Number.isSafeInteger(result.unchangedCount) ? result.unchangedCount : 0;
      if (changedCount > 0) {
        toast('Đã cập nhật sản phẩm', `${number(changedCount)} thay đổi đã lưu · ${number(unchangedCount)} sản phẩm giữ nguyên.`);
      } else {
        toast('Danh mục không đổi', `${number(unchangedCount || result.count)} sản phẩm đã giống dữ liệu hiện tại; không phát sinh lịch sử mới.`);
      }
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra cập nhật đang chờ.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingProductBulkUpdate();
        if (requestGeneration === modalGeneration && !modal.hidden) {
          productBulkUpdateRows = [];
          productBulkUpdateErrors = [`Máy chủ không cập nhật dòng nào: ${error.message} Hãy tải danh sách mới, áp dụng lại thay đổi rồi gửi lại.`];
          if (fileInput && fileInput.isConnected) fileInput.disabled = false;
          renderProductBulkUpdatePreview();
        }
      }
      toast('Chưa cập nhật được sản phẩm', error.message, 'error');
      if (submitButton && requestGeneration === modalGeneration && !modal.hidden && submitButton.isConnected && !productBulkUpdateRows.length) submitButton.disabled = true;
      else if (submitButton && requestGeneration === modalGeneration && !modal.hidden && submitButton.isConnected) submitButton.disabled = false;
    }
  }

  async function saveStockBulkCount(form) {
    let pending = loadPendingStockBulkCount();
    if (!pending) {
      if (stockBulkCountErrors.length || !stockBulkCountRows.length) return toast('Chưa thể kiểm kê', 'Chọn tệp CSV hợp lệ và đợi Slink đối chiếu trước.', 'error');
      const reason = String(new FormData(form).get('reason') || '').trim();
      if (!reason || reason.length > 500) return toast('Lý do chưa hợp lệ', 'Nhập lý do kiểm kê từ 1 đến 500 ký tự.', 'error');
      pending = {
        key: newIdempotencyKey(),
        payload: {
          reason,
          warehouseId: selectedWarehouseId,
          items: stockBulkCountRows.map(function (item) {
            return { productId: item.productId, expectedInventoryVersion: item.inventoryVersion, count: item.counted, sourceLine: item.sourceLine };
          }),
          preview: stockBulkCountRows,
        },
      };
    }
    if (!savePendingStockBulkCount(pending)) return pendingSaveFailed();
    const requestGeneration = modalGeneration;
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    const fileInput = modal.querySelector('#stock-bulk-count-file');
    const reasonInput = modal.querySelector('#stock-bulk-count-reason');
    if (submitButton) submitButton.disabled = true;
    if (fileInput) fileInput.disabled = true;
    if (reasonInput) reasonInput.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/stock-adjustments/bulk`, {
        method: 'POST', headers: { 'idempotency-key': pending.key },
        body: { items: pending.payload.items, reason: pending.payload.reason, warehouseId: pending.payload.warehouseId || selectedWarehouseId },
      });
      clearPendingStockBulkCount();
      if (requestGeneration === modalGeneration && !modal.hidden) {
        closeModal();
        stockBulkCountRows = [];
        stockBulkCountErrors = [];
      }
      await loadInventoryPage(searchTerms.inventory, inventoryOffset);
      const changedCount = Number(result.changedCount) || 0;
      const unchangedCount = Number(result.unchangedCount) || 0;
      toast(changedCount ? 'Đã ghi nhận kiểm kê' : 'Tồn kho không đổi', `${number(changedCount)} sản phẩm có chênh lệch đã ghi sổ · ${number(unchangedCount)} sản phẩm giữ nguyên.`);
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra lô kiểm kê đang chờ.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingStockBulkCount();
        if (requestGeneration === modalGeneration && !modal.hidden) {
          stockBulkCountRows = [];
          stockBulkCountErrors = [`Máy chủ chưa ghi dòng nào: ${error.message} Hãy xuất CSV tồn kho mới, điền lại số đếm rồi gửi lô mới.`];
          if (fileInput && fileInput.isConnected) fileInput.disabled = false;
          if (reasonInput && reasonInput.isConnected) reasonInput.disabled = false;
          renderStockBulkCountPreview();
        }
      }
      toast('Chưa xác nhận được lô kiểm kê', error.message, 'error');
      if (submitButton && requestGeneration === modalGeneration && !modal.hidden && submitButton.isConnected && !stockBulkCountRows.length) submitButton.disabled = true;
      else if (submitButton && requestGeneration === modalGeneration && !modal.hidden && submitButton.isConnected) submitButton.disabled = false;
    }
  }

  async function saveProduct(form) {
    const data = new FormData(form); const id = form.dataset.id; const old = id ? productById(id) : null;
    const payload = {
      name: String(data.get('name')).trim(),
      sku: String(data.get('sku') || '').trim(),
      barcode: String(data.get('barcode') || '').trim() || null,
      category: String(data.get('category') || 'Chưa phân loại').trim(),
      unit: String(data.get('unit') || 'cái').trim(),
      salePriceVnd: Number(data.get('price')),
      costVnd: Number(data.get('cost') || 0),
      lowStockThreshold: Number(data.get('minStock') || 0),
      inventoryTracked: data.get('inventoryTracked') === 'on',
    };
    if (old?.variantGroupId) {
      try {
        payload.variantAttributes = Object.fromEntries(parseVariantAttributesText(String(data.get('variantAttributesText') || ''), 0).map(function (entry) { return [entry.name, entry.value]; }));
      } catch (error) { return toast('Thuộc tính chưa hợp lệ', error.message, 'error'); }
    }
    if (old) payload.version = Number(form.dataset.version);
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/products${old ? `/${encodeURIComponent(old.id)}` : ''}`, {
        method: old ? 'PUT' : 'POST', body: payload,
      });
      closeModal();
      toast(old ? 'Đã cập nhật sản phẩm' : 'Đã thêm sản phẩm', result.product.name);
      if (page === 'inventory') await loadInventoryPage(searchTerms.inventory, inventoryOffset);
      else await loadProductsPage(searchTerms.products, productOffset);
    } catch (error) {
      toast('Chưa lưu được sản phẩm', error.message, 'error');
    }
  }

  function parseVariantAttributesText(value, index) {
    const pairs = String(value || '').split(';').map(function (part) { return part.trim(); }).filter(Boolean);
    if (!pairs.length || pairs.length > 8) throw new Error(`Biến thể ${number(index + 1)}: nhập từ 1 đến 8 thuộc tính theo dạng Tên=Giá trị.`);
    const names = new Set();
    return pairs.map(function (pair) {
      const separator = pair.indexOf('=');
      if (separator < 1) throw new Error(`Biến thể ${number(index + 1)}: mỗi thuộc tính cần có dạng Tên=Giá trị.`);
      const name = pair.slice(0, separator).trim();
      const valueText = pair.slice(separator + 1).trim();
      const key = name.toLocaleLowerCase('vi');
      if (!name || !valueText || names.has(key)) throw new Error(`Biến thể ${number(index + 1)}: tên thuộc tính phải riêng biệt và giá trị không được để trống.`);
      names.add(key);
      return { name: name, value: valueText };
    });
  }

  async function saveProductVariantGroup(form) {
    let pending = loadPendingProductVariantGroup();
    let payload = pending?.payload || null;
    if (!pending) {
      const value = function (name) { return String(new FormData(form).get(name) || '').trim(); };
      const rows = Array.from(form.querySelectorAll('[data-product-variant-row]'));
      if (rows.length < 2 || rows.length > 50) return toast('Số biến thể chưa hợp lệ', 'Mỗi nhóm cần từ 2 đến 50 biến thể.', 'error');
      try {
        payload = {
          name: value('name'), category: value('category') || 'Chưa phân loại', unit: value('unit') || 'cái',
          variants: rows.map(function (row, index) {
            return {
              sku: String(row.querySelector('[data-variant-sku]').value || '').trim(),
              barcode: String(row.querySelector('[data-variant-barcode]').value || '').trim() || null,
              attributes: parseVariantAttributesText(row.querySelector('[data-variant-attributes]').value, index),
              salePriceVnd: Number(row.querySelector('[data-variant-price]').value),
              costVnd: Number(row.querySelector('[data-variant-cost]').value || 0),
              lowStockThreshold: Number(row.querySelector('[data-variant-threshold]').value || 0),
              inventoryTracked: row.querySelector('[data-variant-tracked]').checked,
            };
          }),
        };
      } catch (error) { return toast('Thuộc tính chưa hợp lệ', error.message, 'error'); }
      pending = { key: newIdempotencyKey(), payload: payload };
      if (!savePendingProductVariantGroup(pending)) return pendingSaveFailed();
    }
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/products/variants`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: payload,
      });
      clearPendingProductVariantGroup();
      closeModal();
      toast('Đã tạo nhóm biến thể', `${result.count} SKU · ${result.name}`);
      await loadProductsPage(searchTerms.products, productOffset);
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingProductVariantGroup();
        openProductVariantGroup(payload);
      } else if (submitButton && submitButton.isConnected) submitButton.disabled = false;
      toast('Chưa xác nhận được nhóm biến thể', error.message, 'error');
    }
  }

  async function saveProductVariantAdd(form) {
    let pending = loadPendingProductVariantAdd();
    if (pending && pending.productId !== form.dataset.id) return toast('Còn một thao tác đang chờ', 'Hãy xác nhận SKU đang chờ trước khi bắt đầu thao tác khác.', 'error');
    if (!pending) {
      const row = form.querySelector('[data-product-variant-row]');
      if (!row) return toast('Thiếu dòng biến thể', 'Hãy nhập SKU mới rồi thử lại.', 'error');
      try {
        pending = {
          key: newIdempotencyKey(), productId: form.dataset.id,
          payload: { variants: [{
            sku: String(row.querySelector('[data-variant-sku]').value || '').trim(),
            barcode: String(row.querySelector('[data-variant-barcode]').value || '').trim() || null,
            attributes: parseVariantAttributesText(row.querySelector('[data-variant-attributes]').value, 0),
            salePriceVnd: Number(row.querySelector('[data-variant-price]').value),
            costVnd: Number(row.querySelector('[data-variant-cost]').value || 0),
            lowStockThreshold: Number(row.querySelector('[data-variant-threshold]').value || 0),
            inventoryTracked: row.querySelector('[data-variant-tracked]').checked,
          }] },
        };
      } catch (error) { return toast('Thuộc tính chưa hợp lệ', error.message, 'error'); }
    }
    if (!savePendingProductVariantAdd(pending)) return pendingSaveFailed();
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/products/${encodeURIComponent(pending.productId)}/variants`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      clearPendingProductVariantAdd();
      closeModal();
      await loadProductsPage(searchTerms.products, productOffset);
      toast('Đã thêm SKU vào nhóm', `${result.count} biến thể · ${result.name}`);
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) clearPendingProductVariantAdd();
      if (submitButton && submitButton.isConnected) submitButton.disabled = false;
      toast('Chưa xác nhận được SKU mới', error.message, 'error');
    }
  }

  async function archiveProduct(id) {
    const product = productById(id);
    if (!product || !window.confirm('Lưu trữ sản phẩm này? Lịch sử bán hàng và tồn kho sẽ được giữ lại.')) return;
    try {
      await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/products/${encodeURIComponent(id)}/archive`, { method: 'POST', body: {} });
      closeModal();
      toast('Đã lưu trữ sản phẩm', product.name);
      await loadProductsPage(searchTerms.products, Math.max(0, productOffset));
    } catch (error) {
      toast('Chưa lưu trữ được sản phẩm', error.message, 'error');
    }
  }

  async function saveCustomer(form) {
    const data = new FormData(form); const id = form.dataset.id; const old = id ? customerById(id) : null;
    let payload = {
      name: String(data.get('name') || '').trim(),
      phone: String(data.get('phone') || '').trim(),
      email: String(data.get('email') || '').trim(),
      note: String(data.get('note') || '').trim(),
    };
    let pending = null;
    if (old) payload.version = Number(form.dataset.version);
    else {
      pending = loadPendingCustomer();
      if (!pending) {
        const openingBalanceText = String(data.get('openingBalanceVnd') || '0').trim() || '0';
        const openingBalance = Number(openingBalanceText);
        if (!/^\d+$/.test(openingBalanceText) || !Number.isSafeInteger(openingBalance) || openingBalance < 0) return toast('Công nợ ban đầu không hợp lệ', 'Nhập số VND nguyên không âm.', 'error');
        payload.openingBalanceVnd = String(openingBalance);
        pending = { storeId: store.id, key: newIdempotencyKey(), payload: payload };
      }
      payload = pending.payload;
      if (!savePendingCustomer(pending)) return pendingSaveFailed();
      form.querySelectorAll('input,textarea').forEach(function (field) { field.disabled = true; });
    }
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/customers${old ? `/${encodeURIComponent(old.id)}` : ''}`, {
        method: old ? 'PUT' : 'POST', headers: pending ? { 'idempotency-key': pending.key } : {}, body: payload,
      });
      if (pending) clearPendingCustomer();
      const customer = mapCustomer(result.customer);
      if (old) Object.assign(old, customer); else store.customers.unshift(customer);
      closeModal();
      toast(old ? 'Đã cập nhật khách hàng' : 'Đã thêm khách hàng', `${customer.name}${!old && Number(payload.openingBalanceVnd) > 0 ? ` · công nợ ban đầu ${money(Number(payload.openingBalanceVnd))}` : ''}`);
      if (page === 'pos') cartCustomerId = customer.id;
      await loadCustomersPage(searchTerms.customers, customerOffset);
      if (page === 'pos' && !store.customers.some(function (row) { return row.id === customer.id; })) store.customers.unshift(customer);
      render();
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra khách hàng đang chờ.', 'error');
      else if (pending && error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingCustomer();
        form.querySelectorAll('input,textarea').forEach(function (field) { field.disabled = false; });
      }
      toast('Chưa lưu được khách hàng', error.message, 'error');
      if (submitButton && !modal.hidden) submitButton.disabled = false;
    }
  }

  async function saveSupplier(form) {
    let pending = loadPendingSupplier();
    if (!pending) {
      const data = new FormData(form);
      const name = String(data.get('name') || '').trim();
      const amountText = String(data.get('openingPayableVnd') || '0').trim() || '0';
      const openingPayableVnd = Number(amountText);
      if (!name || name.length > 160) return toast('Tên nhà cung cấp không hợp lệ', 'Tên cần từ 1 đến 160 ký tự.', 'error');
      if (!/^\d+$/.test(amountText) || !Number.isSafeInteger(openingPayableVnd) || openingPayableVnd < 0) return toast('Khoản phải trả ban đầu không hợp lệ', 'Nhập số VND nguyên không âm.', 'error');
      pending = { storeId: store.id, key: newIdempotencyKey(), payload: { name: name, openingPayableVnd: String(openingPayableVnd) } };
    }
    if (!savePendingSupplier(pending)) return pendingSaveFailed();
    form.querySelectorAll('input').forEach(function (field) { field.disabled = true; });
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/suppliers`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      clearPendingSupplier();
      closeModal();
      await loadFinancePage();
      render();
      toast(result.supplier.created ? 'Đã thêm nhà cung cấp' : 'Đã cập nhật công nợ nhà cung cấp', `${result.supplier.name}${Number(pending.payload.openingPayableVnd) > 0 ? ` · phải trả ${money(Number(result.supplier.balance_vnd))}` : ''}`);
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra nhà cung cấp đang chờ.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingSupplier();
        form.querySelectorAll('input').forEach(function (field) { field.disabled = false; });
      }
      toast('Chưa lưu được nhà cung cấp', error.message, 'error');
      if (submitButton && !modal.hidden) submitButton.disabled = false;
    }
  }

  async function adjustStock(form) {
    const p = productById(form.dataset.id); if (!p) return;
    let pending = loadPendingStock(p.id);
    if (!pending) {
      const data = new FormData(form);
      const count = Number(data.get('count'));
      if (!Number.isFinite(count) || count < 0 || count > 1_000_000_000 || Math.abs(count * 1000 - Math.round(count * 1000)) > 1e-6) return toast('Số lượng không hợp lệ', 'Nhập số lượng không âm, tối đa 3 chữ số thập phân.', 'error');
      if (count === p.stock) { closeModal(); return toast('Số lượng không đổi', 'Không có chênh lệch cần ghi nhận.'); }
      pending = { storeId: store.id, productId: p.id, key: newIdempotencyKey(), payload: { productId: p.id, count: count, expectedInventoryVersion: Number(form.dataset.inventoryVersion), reason: String(data.get('reason') || 'Kiểm kê thực tế'), warehouseId: String(data.get('warehouseId') || selectedWarehouseId) } };
    }
    if (!savePendingStock(pending)) return pendingSaveFailed();
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/stock-adjustments`, { method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload });
      clearPendingStock(p.id);
      closeModal();
      if (page === 'inventory') await loadInventoryPage(searchTerms.inventory, inventoryOffset);
      else await loadProductsPage(searchTerms.products, productOffset);
      render();
      toast('Đã cập nhật tồn kho', p.name + ' · ' + number(Number(pending.payload.count)) + ' ' + p.unit);
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra cập nhật tồn.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingStock(p.id);
        if (error.code === 'inventory_version_conflict') {
          if (page === 'inventory') await loadInventoryPage(searchTerms.inventory, inventoryOffset);
          else await loadProductsPage(searchTerms.products, productOffset);
        }
        if (!modal.hidden) openStockAdjust(p.id);
      }
      toast('Chưa cập nhật được tồn kho', error.message, 'error');
      if (submitButton && !modal.hidden) submitButton.disabled = false;
    }
  }

  async function receiveStock(form) {
    let pending = loadPendingPurchase();
    if (!pending) {
      const data = new FormData(form);
      const purchaseItems = receivePurchaseItemsFromForm(form);
      const amountPaidVnd = Number(data.get('paid') || 0);
      if (!purchaseItems.length || purchaseItems.length > 50) return toast('Dòng hàng chưa hợp lệ', 'Phiếu nhập cần từ 1 đến 50 mặt hàng.', 'error');
      const seenProducts = new Set();
      const normalizedItems = [];
      for (const item of purchaseItems) {
        const quantity = Number(item.quantity);
        const unitCostVnd = Number(item.unitCostVnd);
        if (!item.productId || seenProducts.has(item.productId)) return toast('Sản phẩm bị thiếu hoặc lặp', 'Mỗi sản phẩm chỉ xuất hiện một lần trên phiếu nhập. Gộp số lượng vào cùng dòng.', 'error');
        seenProducts.add(item.productId);
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000_000 || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 1e-6) return toast('Số lượng không hợp lệ', 'Mỗi dòng cần số lượng lớn hơn 0, tối đa 3 chữ số thập phân.', 'error');
        if (!Number.isSafeInteger(unitCostVnd) || unitCostVnd < 0) return toast('Giá nhập không hợp lệ', 'Giá nhập mỗi mặt hàng phải là VND nguyên không âm.', 'error');
        normalizedItems.push({ productId: item.productId, quantity: item.quantity, unitCostVnd: unitCostVnd });
      }
      if (!Number.isSafeInteger(amountPaidVnd) || amountPaidVnd < 0) return toast('Số tiền không hợp lệ', 'Số tiền thanh toán phải là VND nguyên không âm.', 'error');
      pending = {
        storeId: store.id,
        key: newIdempotencyKey(),
        payload: {
          items: normalizedItems,
          amountPaidVnd: amountPaidVnd, supplierName: String(data.get('supplierName') || '').trim(),
          note: String(data.get('note') || '').trim(), method: String(data.get('method') || 'cash'),
          warehouseId: String(data.get('warehouseId') || selectedWarehouseId || ''),
        },
      };
    }
    if (!savePendingPurchase(pending)) return pendingSaveFailed();
    form.querySelectorAll('input,select,button').forEach(function (field) { field.disabled = true; });
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/purchases`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      clearPendingPurchase();
      closeModal();
      if (page === 'inventory') await loadInventoryPage(searchTerms.inventory, inventoryOffset);
      else await loadProductsPage('', 0);
      if (page === 'finance') await loadFinancePage();
      render();
      toast('Đã nhập kho', `${result.purchase.number} · ${number(Number(result.purchase.itemCount || (result.purchase.items || []).length || 1))} mặt hàng · ${moneyVndText(result.purchase.totalVnd)}`);
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra phiếu nhập.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingPurchase();
        form.querySelectorAll('input,select,button').forEach(function (field) { field.disabled = false; });
      }
      toast('Chưa hoàn tất được phiếu nhập', error.message, 'error');
      if (submitButton && !modal.hidden) submitButton.disabled = false;
    }
  }

  async function saveSupplierPayment(form) {
    const supplierId = form.dataset.id;
    let pending = loadPendingSupplierPayment(supplierId);
    if (!pending) {
      const data = new FormData(form);
      const amountVnd = Number(data.get('amount'));
      if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0) return toast('Số tiền không hợp lệ', 'Nhập số tiền thanh toán bằng VND nguyên dương.', 'error');
      pending = {
        storeId: store.id,
        supplierId: supplierId,
        key: newIdempotencyKey(),
        payload: { amountVnd: amountVnd, method: String(data.get('method') || 'cash'), note: String(data.get('note') || '').trim() },
      };
    }
    if (!savePendingSupplierPayment(pending)) return pendingSaveFailed();
    form.querySelectorAll('input,select').forEach(function (field) { field.disabled = true; });
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/suppliers/${encodeURIComponent(supplierId)}/payments`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      clearPendingSupplierPayment(supplierId);
      closeModal();
      await loadFinancePage();
      render();
      toast('Đã ghi nhận thanh toán nhà cung cấp', money(Number(result.payment.amountVnd)));
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra khoản thanh toán.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingSupplierPayment(supplierId);
        form.querySelectorAll('input,select').forEach(function (field) { field.disabled = false; });
      }
      toast('Chưa lưu được khoản thanh toán', error.message, 'error');
      if (submitButton && !modal.hidden) submitButton.disabled = false;
    }
  }

  async function saveCash(form) {
    let pending = loadPendingCash();
    if (!pending) {
      const data = new FormData(form);
      const amountVnd = Number(data.get('amount'));
      if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0) return toast('Số tiền không hợp lệ', 'Nhập số tiền bằng VND nguyên dương.', 'error');
      pending = {
        storeId: store.id,
        key: newIdempotencyKey(),
        payload: {
          direction: data.get('type') === 'in' ? 'in' : 'out',
          amountVnd: amountVnd,
          category: String(data.get('category') || 'Vận hành'),
          method: String(data.get('method') || 'cash'),
          note: String(data.get('note') || '').trim(),
        },
      };
    }
    if (!savePendingCash(pending)) return pendingSaveFailed();
    form.querySelectorAll('input,select').forEach(function (field) { field.disabled = true; });
    const submitButton = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/cash-movements`, {
        method: 'POST', headers: { 'idempotency-key': pending.key }, body: pending.payload,
      });
      clearPendingCash();
      closeModal();
      await loadFinancePage();
      render();
      toast(pending.payload.direction === 'in' ? 'Đã ghi phiếu thu' : 'Đã ghi phiếu chi', money(Number(result.movement.amountVnd)));
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Đăng nhập lại để kiểm tra phiếu thu chi.', 'error');
      else if (error.status >= 400 && error.status < 500 && !['idempotency_conflict', 'request_in_progress'].includes(error.code)) {
        clearPendingCash();
        form.querySelectorAll('input,select').forEach(function (field) { field.disabled = false; });
      }
      toast('Chưa lưu được phiếu thu chi', error.message, 'error');
      if (submitButton && !modal.hidden) submitButton.disabled = false;
    }
  }

  async function saveSettings(form) {
    const data = new FormData(form);
    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/settings`, {
        method: 'PUT',
        body: {
          name: String(data.get('storeName') || '').trim(),
          phone: String(data.get('phone') || '').trim(),
          address: String(data.get('address') || '').trim(),
          receiptFooter: String(data.get('receiptFooter') || '').trim(),
          version: Number(form.dataset.version),
        },
      });
      const settings = result.settings;
      applyStoreProfile(settings);
      render();
      toast('Đã lưu cài đặt cửa hàng');
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else if (error.code === 'version_conflict') {
        try {
          const latest = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/settings`);
          applyStoreProfile(latest.settings);
          render();
          toast('Cài đặt đã được cập nhật ở thiết bị khác', 'Đã tải phiên bản mới. Kiểm tra lại trước khi lưu.', 'error');
        } catch (reloadError) { toast('Chưa lưu được cài đặt', reloadError.message, 'error'); }
      } else toast('Chưa lưu được cài đặt', error.message, 'error');
      if (submitButton) submitButton.disabled = false;
    }
  }

  function openStaffInvite() {
    if (store.role !== 'owner') return toast('Không đủ quyền', 'Chỉ chủ cửa hàng mới có thể mời nhân viên.', 'error');
    const form = `<form id='entity-form' data-form='staff-invite'><div class='form-grid'><div class='form-field full'><label class='input-label' for='staff-invite-email'>Email nhân viên *</label><input class='input' id='staff-invite-email' name='email' type='email' autocomplete='email' required maxlength='254' placeholder='nhanvien@example.com'/></div><div class='form-field full'><label class='input-label' for='staff-invite-role'>Vai trò *</label><div class='select-wrap'><select class='input' id='staff-invite-role' name='role' required><option value='cashier'>Thu ngân</option><option value='stockkeeper'>Nhân viên kho</option><option value='accountant'>Kế toán</option><option value='manager'>Quản lý</option></select></div><small class='staff-role-help'>${staffRoleDescription('cashier')}</small></div></div><div class='modal-note'>Lời mời có hiệu lực 7 ngày. Nhân viên cần dùng đúng email này và xác minh email trước khi được cấp quyền.</div></form>`;
    showModal('Mời nhân viên', 'Gửi liên kết tham gia cửa hàng qua email.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>Gửi lời mời</button>`);
  }

  function showInvitationResult(result, title) {
    closeModal();
    if (result.developmentInviteUrl) {
      showModal(title || 'Đã tạo lời mời', 'Môi trường phát triển chưa gửi email; dùng liên kết dưới đây để tiếp tục.', `<div class='notice-item'><span>${icon('users', 18)}</span><span><strong>${esc(result.invitation.email)}</strong><small>${staffRoleName(result.invitation.role)} · Liên kết sẽ hết hạn sau 7 ngày</small></span></div><a class='staff-invite-link' href='${esc(result.developmentInviteUrl)}' target='_blank' rel='noopener'>Mở trang nhận lời mời →</a>`, `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button><button class='btn btn-primary' data-action='reload-staff'>Xong</button>`, true);
    } else {
      toast(title || 'Đã gửi lời mời', result.message || 'Email mời đã được chấp nhận để gửi.');
      closeModal();
      loadStaffPage();
    }
  }

  async function saveStaffInvitation(form) {
    const data = new FormData(form);
    const button = modal.querySelector('button[type="submit"][form="entity-form"]');
    if (button) button.disabled = true;
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/staff/invitations`, {
        method: 'POST', body: { email: String(data.get('email') || '').trim(), role: String(data.get('role') || '') },
      });
      showInvitationResult(result);
      await loadStaffPage();
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else toast('Chưa gửi được lời mời', error.message, 'error');
      if (button && !modal.hidden) button.disabled = false;
    }
  }

  async function saveStaffMember(userId) {
    const role = document.querySelector(`[data-member-role='${userId}']`)?.value;
    const status = document.querySelector(`[data-member-status='${userId}']`)?.value;
    const warehouseScopeMode = document.querySelector(`[data-member-scope-mode='${userId}']`)?.value || 'all';
    const warehouseIds = Array.from(document.querySelectorAll(`[data-member-warehouse='${userId}']:checked`)).map(function (input) { return input.value; });
    try {
      await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/staff/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body: { role: role, status: status, warehouseScopeMode: warehouseScopeMode, warehouseIds: warehouseIds } });
      toast('Đã cập nhật quyền nhân viên', 'Nhân viên cần tải lại trang để nhận quyền mới.');
      await loadStaffPage();
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else toast('Chưa cập nhật được quyền', error.message, 'error');
    }
  }

  async function resendStaffInvite(invitationId) {
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/staff/invitations/${encodeURIComponent(invitationId)}/resend`, { method: 'POST', body: {} });
      showInvitationResult(result, 'Đã gửi lại lời mời');
      await loadStaffPage();
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else toast('Chưa gửi lại được lời mời', error.message, 'error');
    }
  }

  async function revokeStaffInvite(invitationId) {
    if (!window.confirm('Thu hồi lời mời này? Liên kết hiện tại sẽ không còn sử dụng được.')) return;
    try {
      await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/staff/invitations/${encodeURIComponent(invitationId)}/revoke`, { method: 'POST', body: {} });
      toast('Đã thu hồi lời mời');
      await loadStaffPage();
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else toast('Chưa thu hồi được lời mời', error.message, 'error');
    }
  }

  async function addByCode(form) {
    const code = String(new FormData(form).get('code') || '').trim();
    if (!code) return toast('Nhập mã sản phẩm', 'Quét hoặc nhập SKU, mã vạch hoặc tên chính xác.', 'error');
    if (checkoutPendingPayload) return toast('Đang chờ xác nhận đơn', 'Hãy kiểm tra hoặc gửi lại đơn trước khi thay đổi giỏ hàng.', 'error');
    try {
      const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/products?limit=100&q=${encodeURIComponent(code)}${posWarehouseParam()}`);
      const products = result.products.map(mapProduct);
      const normalized = code.toLocaleLowerCase('vi');
      const product = products.find(function (item) { return item.sku.toLocaleLowerCase('vi') === normalized || item.barcode === code || item.name.toLocaleLowerCase('vi') === normalized; });
      if (!product) return toast('Không tìm thấy sản phẩm', 'Kiểm tra lại mã SKU, mã vạch hoặc tên chính xác.', 'error');
      if (product.inventoryTracked && !(product.stock > 0)) return toast('Sản phẩm đã hết hàng', 'Hãy nhập kho trước khi bán.', 'error');
      const current = cart.find(function (item) { return item.id === product.id; });
      if (product.inventoryTracked && current && current.qty >= product.stock) return toast('Không đủ số lượng tồn', 'Giỏ hàng đã đạt số lượng đang có trong kho.', 'error');
      closeModal();
      page = 'pos';
      if (!addProductToCart(product)) return;
      toast('Đã thêm vào giỏ', product.name);
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else toast('Chưa tra cứu được mã hàng', error.message, 'error');
    }
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  let exportInProgress = false;
  const exportFiles = {
    products: 'slink-san-pham.csv', inventory: 'slink-ton-kho.csv', 'inventory-movements': 'slink-bien-dong-kho.csv',
    customers: 'slink-khach-hang.csv', 'customer-ledger': 'slink-so-cong-no-khach-hang.csv', orders: 'slink-don-hang.csv',
    'order-lines': 'slink-chi-tiet-don-hang.csv', payments: 'slink-thanh-toan.csv', returns: 'slink-hang-tra.csv',
    'channel-orders': 'slink-don-kenh-ban.csv',
    refunds: 'slink-hoan-tien.csv', cashbook: 'slink-so-thu-chi.csv', suppliers: 'slink-nha-cung-cap.csv',
    'supplier-ledger': 'slink-so-cong-no-nha-cung-cap.csv', purchases: 'slink-phieu-nhap-hang.csv', 'purchase-orders': 'slink-don-dat-hang.csv',
  };
  const exportGroups = [
    { label: 'Danh mục và kho', options: [
      ['products', 'Danh mục sản phẩm', ['owner', 'manager', 'accountant', 'stockkeeper']],
      ['inventory', 'Tồn kho hiện tại theo kho', ['owner', 'manager', 'accountant', 'stockkeeper']],
      ['inventory-movements', 'Lịch sử biến động kho', ['owner', 'manager', 'accountant', 'stockkeeper']],
    ] },
    { label: 'Khách hàng và bán hàng', options: [
      ['customers', 'Hồ sơ khách hàng', ['owner', 'manager', 'accountant']],
      ['customer-ledger', 'Sổ công nợ khách hàng', ['owner', 'manager', 'accountant']],
      ['orders', 'Đơn hàng', ['owner', 'manager', 'accountant']],
      ['channel-orders', 'Đơn kênh bán ghi nhận thủ công', ['owner', 'manager', 'stockkeeper']],
      ['order-lines', 'Chi tiết sản phẩm trong đơn', ['owner', 'manager', 'accountant']],
      ['payments', 'Giao dịch thanh toán', ['owner', 'manager', 'accountant']],
      ['returns', 'Chi tiết hàng trả', ['owner', 'manager', 'accountant']],
      ['refunds', 'Giao dịch hoàn tiền', ['owner', 'manager', 'accountant']],
    ] },
    { label: 'Thu chi và nhập hàng', options: [
      ['cashbook', 'Sổ thu chi', ['owner', 'manager', 'accountant']],
      ['suppliers', 'Nhà cung cấp', ['owner', 'manager', 'accountant', 'stockkeeper']],
      ['supplier-ledger', 'Sổ công nợ nhà cung cấp', ['owner', 'manager', 'accountant']],
      ['purchase-orders', 'Đơn đặt hàng', ['owner', 'manager', 'accountant', 'stockkeeper']],
      ['purchases', 'Phiếu nhập và mặt hàng', ['owner', 'manager', 'accountant', 'stockkeeper']],
    ] },
  ];

  function canExportData() {
    return ['owner', 'manager', 'accountant', 'stockkeeper'].includes(store.role);
  }

  function openExportDialog() {
    const groupsHtml = exportGroups.map(function (group) {
      const options = group.options.filter(function (option) { return option[2].includes(store.role); });
      return options.length ? `<optgroup label='${esc(group.label)}'>${options.map(function (option) { return `<option value='${option[0]}'>${esc(option[1])}</option>`; }).join('')}</optgroup>` : '';
    }).join('');
    if (!groupsHtml) return toast('Không có quyền xuất dữ liệu', 'Vai trò tài khoản hiện tại không được tải dữ liệu cửa hàng.', 'error');
    const warehouseOptions = `<option value=''>Tất cả kho</option>${warehouses.map(function (warehouse) { return `<option value='${esc(warehouse.id)}'>${esc(warehouse.name)}${warehouse.is_default ? ' · Kho chính' : ''}</option>`; }).join('')}`;
    const warehouseField = warehouses.length ? `<div class='form-field full'><label class='input-label' for='export-warehouse'>Lọc theo kho (tùy chọn)</label><div class='select-wrap'><select class='input' id='export-warehouse'>${warehouseOptions}</select></div></div>` : '';
    const body = `<div class='form-grid'><div class='form-field full'><label class='input-label' for='export-dataset'>Loại dữ liệu *</label><div class='select-wrap'><select class='input' id='export-dataset' required>${groupsHtml}</select></div></div>${warehouseField}<div class='form-field'><label class='input-label' for='export-from'>Từ ngày (tùy chọn)</label><input class='input' id='export-from' type='date'/></div><div class='form-field'><label class='input-label' for='export-to'>Đến ngày (tùy chọn)</label><input class='input' id='export-to' type='date'/></div></div><div class='modal-note'>Bỏ trống ngày để xuất toàn bộ. CSV tồn kho luôn chỉ chứa một kho để kiểm kê đúng địa điểm; nếu chưa chọn kho, Slink dùng kho đang mở. Với biến động kho, phiếu nhập, đơn đặt hàng và đơn kênh bán, có thể chọn “Tất cả kho” hoặc lọc theo một kho được giao. Đơn kênh bán xuất từng dòng hàng; trạng thái thanh toán trong tệp là ảnh chụp trên kênh, không phải giao dịch tài chính Slink. Khoảng ngày tính theo múi giờ cửa hàng; tồn kho lọc theo lần thay đổi tồn gần nhất, sổ lọc theo ngày phát sinh. Mỗi tệp tối đa 50.000 dòng; số tiền giữ nguyên bằng VND.</div>`;
    const footer = `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='button' data-action='export-dataset'>Tải tệp CSV</button>`;
    showModal('Xuất dữ liệu cửa hàng', 'Tải dữ liệu đã ghi nhận trên máy chủ để lưu trữ hoặc làm báo cáo.', body, footer, true);
  }

  async function exportCsv(dataset, from, to, button, warehouseId) {
    if (exportInProgress) return;
    const filename = exportFiles[dataset];
    if (!filename) return toast('Chưa xuất được dữ liệu', 'Hãy chọn một loại dữ liệu trong danh sách.', 'error');
    exportInProgress = true;
    if (button) button.disabled = true;
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    if (dataset === 'inventory' && (warehouseId || selectedWarehouseId)) query.set('warehouseId', warehouseId || selectedWarehouseId);
    else if (['inventory-movements', 'purchases', 'purchase-orders', 'channel-orders'].includes(dataset) && warehouseId) query.set('warehouseId', warehouseId);
    const suffix = query.toString();
    try {
      const response = await fetch(`/api/stores/${encodeURIComponent(store.id)}/exports/${encodeURIComponent(dataset)}${suffix ? '?' + suffix : ''}`, {
        credentials: 'same-origin', headers: { accept: 'text/csv' },
      });
      if (!response.ok) {
        let result = {};
        try { result = await response.json(); } catch (error) { /* Keep a clear fallback for proxy errors. */ }
        const error = new Error(result.error && result.error.message || 'Không thể tải dữ liệu. Vui lòng thử lại.');
        error.status = response.status;
        throw error;
      }
      const file = await response.blob();
      if (!file.size) throw new Error('Tệp xuất đang trống. Hãy thử lại sau.');
      download(filename, file, 'text/csv;charset=utf-8');
      toast('Đã xuất tệp CSV', `${filename} · ${from || to ? `${from || 'đầu kỳ'} đến ${to || 'hiện tại'}` : 'toàn bộ dữ liệu'}`);
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else toast('Chưa xuất được dữ liệu', error.message, 'error');
    } finally {
      exportInProgress = false;
      if (button && button.isConnected) button.disabled = false;
    }
  }

  function printOrder(id) {
    const o = store.orders.find(function (item) { return item.id === id; });
    if (!o) return;
    const customer = customerById(o.customerId);
    const customerName = o.customerName || customer?.name || 'Khách lẻ';
    const customerPhone = o.customerPhone || customer?.phone || '';
    const cancelled = o.rawStatus === 'voided';
    const items = (o.items || []).map(function (item) {
      const quantity = number(item.qty);
      const lineTotal = item.totalVnd != null
        ? moneyVndText(item.totalVnd)
        : money(Number.isFinite(Number(item.total)) ? Number(item.total) : Math.round(Number(item.price) * Number(item.qty)));
      const lineDiscount = BigInt(String(item.discountVnd ?? item.discount ?? '0')) > 0n
        ? `<small>Giảm dòng: −${moneyVndText(item.discountVnd ?? item.discount)}</small>`
        : '';
      return `<div class='item-line'><div class='item-copy'><strong>${esc(item.name)}</strong><small>${quantity} ${esc(item.unit || '')} × ${moneyVndText(item.priceVnd ?? item.price)}</small>${lineDiscount}</div><strong>${lineTotal}</strong></div>`;
    }).join('');
    const payments = (o.paymentLines || []).map(function (payment) {
      return `<div class='summary-line payment-line'><span>· ${esc(payment.method)}</span><strong>${moneyVndText(payment.amountVnd ?? payment.amount)}</strong></div>`;
    }).join('');
    const returnLines = (o.returns || []).filter(function (item) { return item.status === 'completed' && BigInt(String(item.refunded_vnd || '0')) > 0n; }).map(function (item) {
      return `<div class='summary-line'><span>Hoàn tiền · ${esc(item.return_number)}</span><strong>−${moneyVndText(item.refunded_vnd || '0')}</strong></div>`;
    }).join('');
    const showDiscount = BigInt(String(o.discountVndText ?? o.discount ?? '0')) > 0n;
    const showCashReceived = BigInt(String(o.cashReceivedVndText ?? o.cashReceived ?? '0')) > 0n;
    const showCashChange = BigInt(String(o.cashChangeVndText ?? o.cashChange ?? '0')) > 0n;
    const showDue = BigInt(String(o.dueVndText ?? o.due ?? '0')) > 0n;
    const showRefunded = BigInt(String(o.refundedVndText ?? o.refunded ?? '0')) > 0n;
    const html = `<html lang='vi'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Biên nhận ${esc(o.number)}</title><style>
      @page{size:auto;margin:8mm}*{box-sizing:border-box}body{font:13px Arial,sans-serif;width:100%;max-width:76mm;margin:0 auto;padding:5mm 3mm;color:#222}h1{font-size:18px;line-height:1.25;margin:0 0 4px;overflow-wrap:anywhere}p{font-size:11px;line-height:1.4;margin:4px 0;color:#555;overflow-wrap:anywhere}.center{text-align:center}.muted{color:#666}.rule{border:0;border-top:1px dashed #999;margin:10px 0}.receipt-title{font-size:13px;font-weight:700;letter-spacing:.04em}.cancelled{display:inline-block;margin:8px 0;padding:5px 8px;border:1px solid #a33;color:#a33;font-weight:700}.item-line,.summary-line{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px dashed #ddd;font-size:12px;break-inside:avoid}.item-copy{display:grid;gap:3px;min-width:0}.item-copy strong{overflow-wrap:anywhere}.item-copy small{color:#555;font-size:10px}.item-line>strong,.summary-line>strong{white-space:nowrap}.summary{margin-top:4px}.grand-total{font-size:15px;font-weight:700;border-bottom:0;padding-top:9px}.payment-line{padding-top:2px;padding-bottom:2px;border-bottom:0;color:#555}.footer{margin-top:16px}@media screen{body{margin:16px auto;padding:12px;border:1px solid #ddd;box-shadow:0 2px 12px #0001}}@media print{body{padding:0;border:0;box-shadow:none}}
    </style></head><body><header class='center'><h1>${esc(store.settings.storeName || 'Slink')}</h1>${store.settings.address ? `<p>${esc(store.settings.address)}</p>` : ''}${store.settings.phone ? `<p>${esc(store.settings.phone)}</p>` : ''}<hr class='rule'><div class='receipt-title'>BIÊN NHẬN BÁN HÀNG</div><p>${esc(o.number)}<br>${humanDate(o.createdAt, true)}</p><p>Khách hàng: ${esc(customerName)}${customerPhone ? `<br>${esc(customerPhone)}` : ''}</p>${cancelled ? `<div class='cancelled'>ĐƠN HÀNG ĐÃ HỦY</div>` : ''}</header><hr class='rule'><main>${items || `<p class='muted'>Không có dòng sản phẩm.</p>`}<section class='summary'><div class='summary-line'><span>Tạm tính</span><strong>${moneyVndText(o.subtotalVndText ?? o.subtotal)}</strong></div>${showDiscount ? `<div class='summary-line'><span>Giảm giá đơn hàng</span><strong>−${moneyVndText(o.discountVndText ?? o.discount)}</strong></div>` : ''}${o.promotion ? `<div class='summary-line'><span>Mã ${esc(o.promotion.code)}</span><strong>−${moneyVndText(o.promotion.discountVnd)}</strong></div>` : ''}<div class='summary-line grand-total'><span>Tổng cộng</span><strong>${moneyVndText(o.totalVndText ?? o.total)}</strong></div><div class='summary-line'><span>Đã thanh toán</span><strong>${moneyVndText(o.paidVndText ?? o.paid)}</strong></div>${payments}${showCashReceived ? `<div class='summary-line'><span>Tiền mặt khách đưa</span><strong>${moneyVndText(o.cashReceivedVndText ?? o.cashReceived)}</strong></div>` : ''}${showCashChange ? `<div class='summary-line'><span>Tiền thối</span><strong>${moneyVndText(o.cashChangeVndText ?? o.cashChange)}</strong></div>` : ''}${showDue ? `<div class='summary-line'><span>Còn phải thu</span><strong>${moneyVndText(o.dueVndText ?? o.due)}</strong></div>` : ''}${returnLines}${!returnLines && showRefunded ? `<div class='summary-line'><span>Đã hoàn</span><strong>−${moneyVndText(o.refundedVndText ?? o.refunded)}</strong></div>` : ''}</section></main><footer class='center footer'><p>${esc(store.settings.receiptFooter || 'Cảm ơn quý khách!')}</p></footer><script>window.onload=function(){window.print()}<\/script></body></html>`;
    const win = window.open('', '_blank', 'width=430,height=680');
    if (!win) return toast('Trình duyệt đã chặn cửa sổ in', 'Cho phép cửa sổ bật lên rồi thử lại.', 'error');
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  async function shareOrder(id) {
    const order = store.orders.find(function (item) { return item.id === id; });
    if (!order || !Array.isArray(order.items)) return toast('Chưa thể chia sẻ biên nhận', 'Đóng và mở lại chi tiết đơn để tải dữ liệu mới nhất.', 'error');
    const shareLabel = function (value, limit) { return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit || 240); };
    const paymentLines = (order.paymentLines || []).map(function (payment) {
      return `${shareLabel(payment.method, 40)}: ${moneyVndText(payment.amountVnd ?? payment.amount)}`;
    });
    const itemLines = order.items.map(function (item) {
      const lineDiscount = BigInt(String(item.discountVnd ?? item.discount ?? '0')) > 0n ? ` (đã giảm ${moneyVndText(item.discountVnd ?? item.discount)})` : '';
      return `• ${shareLabel(item.name)} — ${number(item.qty)} ${shareLabel(item.unit, 40)} × ${moneyVndText(item.priceVnd ?? item.price)} = ${moneyVndText(item.totalVnd ?? item.total)}${lineDiscount}`.trim();
    });
    const lines = [
      shareLabel(store.settings.storeName || 'Slink'),
      'BIÊN NHẬN BÁN HÀNG',
      `Đơn: ${shareLabel(order.number, 80)}`,
      `Thời gian: ${humanDate(order.createdAt, true)}`,
      order.rawStatus === 'voided' ? 'Trạng thái: ĐÃ HỦY' : null,
      '',
      ...itemLines,
      '',
      BigInt(String(order.discountVndText ?? order.discount ?? '0')) > 0n ? `Giảm giá đơn hàng: −${moneyVndText(order.discountVndText ?? order.discount)}` : null,
      order.promotion ? `Mã khuyến mãi ${shareLabel(order.promotion.code, 32)}: −${moneyVndText(order.promotion.discountVnd)}` : null,
      `Tổng cộng: ${moneyVndText(order.totalVndText ?? order.total)}`,
      `Đã thanh toán: ${moneyVndText(order.paidVndText ?? order.paid)}`,
      ...paymentLines,
      BigInt(String(order.dueVndText ?? order.due ?? '0')) > 0n ? `Còn phải thu: ${moneyVndText(order.dueVndText ?? order.due)}` : null,
      BigInt(String(order.refundedVndText ?? order.refunded ?? '0')) > 0n ? `Đã hoàn tiền: ${moneyVndText(order.refundedVndText ?? order.refunded)}` : null,
      '',
      shareLabel(store.settings.receiptFooter || 'Cảm ơn quý khách!', 300)
    ].filter(function (line) { return line != null; });
    const text = lines.join('\n');
    const shareData = { title: `Biên nhận ${shareLabel(order.number, 80)}`, text: text };

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        toast('Đã hoàn tất chia sẻ', 'Biên nhận đã được chuyển đến ứng dụng bạn chọn.');
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return toast('Đã sao chép biên nhận', 'Bạn có thể dán nội dung vào tin nhắn cho khách.');
      } catch (error) { /* Show a selectable local copy if clipboard access is unavailable. */ }
    }
    showModal('Chia sẻ biên nhận', 'Chọn và sao chép nội dung để gửi cho khách. Thông tin cá nhân và ghi chú nội bộ không được đưa vào.', `<label class='input-label' for='share-order-copy'>Nội dung biên nhận</label><textarea id='share-order-copy' class='input' rows='12' readonly aria-label='Nội dung biên nhận để sao chép'>${esc(text)}</textarea>`, `<button type='button' class='btn btn-secondary' data-action='close-modal'>Đóng</button>`, true);
    const copyField = modal.querySelector('#share-order-copy');
    if (copyField) window.setTimeout(function () { copyField.focus(); copyField.select(); }, 60);
  }
  function renderDashboard() {
    const canViewReports = ['owner', 'manager', 'accountant'].includes(store.role);
    if (!canViewReports) {
      const lowProducts = lowStockProducts().slice(0, 4);
      const operationalActions = store.role === 'cashier'
        ? `<button class='quick-action' data-route='pos'><span class='quick-icon'>＋</span><span class='quick-copy'><strong>Tạo đơn hàng</strong><small>Bán hàng tại quầy</small></span></button><button class='quick-action' data-route='orders'><span class='quick-icon'>▤</span><span class='quick-copy'><strong>Đơn hàng</strong><small>Tìm giao dịch gần đây</small></span></button>`
        : `<button class='quick-action' data-action='receive-stock'><span class='quick-icon'>↙</span><span class='quick-copy'><strong>Nhập hàng</strong><small>Cập nhật tồn kho</small></span></button><button class='quick-action' data-route='inventory'><span class='quick-icon'>▦</span><span class='quick-copy'><strong>Kiểm kê tồn</strong><small>Xem số lượng hiện tại</small></span></button>`;
      return pageHeading('Tổng quan', `Tình hình hoạt động của ${store.settings.storeName}.`, store.role === 'cashier' ? `<button class='btn btn-primary' data-route='pos'>＋ Tạo đơn mới</button>` : `<button class='btn btn-primary' data-action='receive-stock'>＋ Nhập hàng</button>`) +
        `<section class='dashboard-welcome'><div class='welcome-copy'><span class='welcome-overline'>Cửa hàng đang hoạt động</span><h2>Theo dõi hàng hóa<br/>và công việc hôm nay.</h2><p>Các mục hiển thị phù hợp với quyền ${esc(staffRoleName(store.role).toLowerCase())} của bạn.</p><button class='btn' data-route='inventory'>Mở kho hàng ${icon('arrow', 14)}</button></div></section>` +
        `<div class='stat-grid'><article class='stat-card'><div class='stat-label'>Mặt hàng đang quản lý</div><div class='stat-value'>${number(inventorySummary.total)}</div><div class='stat-foot'>Sản phẩm trong cửa hàng</div></article><article class='stat-card'><div class='stat-label'>Sắp hết hàng</div><div class='stat-value'>${number(inventorySummary.low)}</div><div class='stat-foot'>Bằng hoặc dưới mức cảnh báo</div></article><article class='stat-card'><div class='stat-label'>Hết hàng</div><div class='stat-value'>${number(inventorySummary.out)}</div><div class='stat-foot'>Cần bổ sung trước khi bán</div></article><article class='stat-card'><div class='stat-label'>${store.role === 'stockkeeper' ? 'Phiếu nhập gần đây' : 'Đơn hàng gần đây'}</div><div class='stat-value'>${number(store.role === 'stockkeeper' ? purchaseHistory.length : orderTotal)}</div><div class='stat-foot'>${store.role === 'stockkeeper' ? 'Phiếu mới nhất trong kho' : 'Tổng số đơn trong cửa hàng'}</div></article></div>` +
        `<div class='lower-grid operational-dashboard-grid'><section class='panel quick-panel'><div class='section-title'><h2>Thao tác nhanh</h2><p>Công việc thường ngày</p></div><div class='quick-grid'>${operationalActions}</div></section><section class='panel alert-panel'><div class='alert-title'><span class='alert-icon'>${icon('alert', 15)}</span><div><strong>${number(inventorySummary.low)} mặt hàng cần chú ý</strong><small>Kiểm tra số lượng và nhập bổ sung</small></div></div><div class='alert-list'>${lowProducts.map(function (product) { return `<div class='alert-row'><strong>${esc(product.name)}</strong><span class='alert-qty'>${product.stock === 0 ? 'Hết hàng' : `Còn ${number(product.stock)} ${esc(product.unit)}`}</span></div>`; }).join('') || `<div class='alert-row'><strong>Tồn kho đang ổn định</strong><span class='alert-qty'>Tốt</span></div>`}</div><button class='link-button' data-route='inventory'>Mở danh sách kho →</button></section></div>`;
    }
    const summary = analyticsData && analyticsData.summary || {};
    const day = analyticsData && analyticsData.days && analyticsData.days.find(function (item) { return item.date === analyticsData.range.to; });
    const todaySales = canViewReports ? String(day && day.salesVnd || '0') : '0';
    const todayOrderCount = canViewReports ? Number(day && day.orderCount) || 0 : 0;
    const recent = store.orders.slice(0, 5);
    const tops = topProducts();
    const lowCount = Number(inventorySummary.low) || 0;
    const actions = `${canViewReports ? `<button class='btn btn-secondary hide-on-mobile' data-route='reports'>Xem báo cáo</button>` : ''}<button class='btn btn-primary' data-route='pos'><span class='btn-icon'>＋</span> Tạo đơn mới</button>`;
    const welcomePanel = canViewReports
      ? `<section class='dashboard-welcome'><div class='welcome-copy'><span class='welcome-overline'>Cửa hàng đang hoạt động</span><h2>Bán hàng và theo dõi<br/>cửa hàng của bạn.</h2><p>Doanh thu được tính sau khi trừ các khoản trả hàng. Lãi gộp tính theo giá vốn sản phẩm.</p><button class='btn' data-route='orders'>Mở đơn hàng ${icon('arrow', 14)}</button></div><div class='welcome-total'><div><small>Doanh thu hôm nay</small><strong>${moneyVndText(todaySales)}</strong></div><span class='total-change'>${number(todayOrderCount)} đơn · ${analyticsData ? `7 ngày đến ${esc(analyticsData.range.to)}` : 'Đang tải dữ liệu'}</span></div></section>`
      : `<section class='dashboard-welcome'><div class='welcome-copy'><span class='welcome-overline'>Cửa hàng đang hoạt động</span><h2>Theo dõi hàng hóa<br/>và đơn đang xử lý.</h2><p>Chọn thao tác phù hợp với công việc của bạn để tiếp tục vận hành cửa hàng.</p><button class='btn' data-route='inventory'>Mở kho hàng ${icon('arrow', 14)}</button></div></section>`;
    const dashboardMetrics = canViewReports
      ? `<div class='stat-grid'><article class='stat-card'><div class='stat-top'><span class='stat-label'>Lãi gộp trong kỳ</span><span class='stat-icon'>${icon('chart', 16)}</span></div><div class='stat-value'>${moneyVndText(summary.grossProfitVnd)}</div><div class='stat-foot'>Sau giá vốn và hàng trả · trước chi phí vận hành</div></article><article class='stat-card'><div class='stat-top'><span class='stat-label'>Khách còn nợ</span><span class='stat-icon'>${icon('users', 16)}</span></div><div class='stat-value'>${moneyVndText(financeSummary.customerDebtVnd)}</div><div class='stat-foot'>${number(financeSummary.customerDebtCount)} khách hàng</div></article><article class='stat-card'><div class='stat-top'><span class='stat-label'>Sắp hết hàng</span><span class='stat-icon'>${icon('alert', 16)}</span></div><div class='stat-value'>${number(lowCount)}</div><div class='stat-foot'>Mặt hàng bằng hoặc dưới mức cảnh báo</div></article><article class='stat-card'><div class='stat-top'><span class='stat-label'>Giá trị tồn kho</span><span class='stat-icon'>${icon('box', 16)}</span></div><div class='stat-value'>${money(inventorySummary.stockValueVnd)}</div><div class='stat-foot'>Ước tính theo giá vốn hiện tại</div></article></div>`
      : `<div class='stat-grid'><article class='stat-card'><div class='stat-label'>Mặt hàng đang quản lý</div><div class='stat-value'>${number(inventorySummary.total)}</div><div class='stat-foot'>Sản phẩm trong cửa hàng</div></article><article class='stat-card'><div class='stat-label'>Sắp hết hàng</div><div class='stat-value'>${number(lowCount)}</div><div class='stat-foot'>Bằng hoặc dưới mức cảnh báo</div></article><article class='stat-card'><div class='stat-label'>Đơn hàng gần đây</div><div class='stat-value'>${number(recent.length)}</div><div class='stat-foot'>Các giao dịch mới nhất</div></article><article class='stat-card'><div class='stat-label'>Vai trò của bạn</div><div class='stat-value' style='font-size:16px'>${staffRoleName(store.role)}</div><div class='stat-foot'>Quyền truy cập theo nhiệm vụ</div></article></div>`;
    return pageHeading('Tổng quan', `Tình hình hoạt động của ${store.settings.storeName}.`, actions) +
      `${analyticsError ? `<div class='notice-item'><span>⚠️</span><span><strong>Chưa tải được báo cáo</strong><small>${esc(analyticsError)}</small></span></div>` : ''}<section class='dashboard-welcome'><div class='welcome-copy'><span class='welcome-overline'>Cửa hàng đang hoạt động</span><h2>Bán hàng và theo dõi<br/>cửa hàng của bạn.</h2><p>Doanh thu được tính sau khi trừ các khoản trả hàng. Lãi gộp tính theo giá vốn sản phẩm.</p><button class='btn' data-route='orders'>Mở đơn hàng ${icon('arrow', 14)}</button></div><div class='welcome-total'><div><small>Doanh thu hôm nay</small><strong>${money(todaySales)}</strong></div><span class='total-change'>${number(todayOrderCount)} đơn · ${analyticsData ? `7 ngày đến ${esc(analyticsData.range.to)}` : 'Đang tải dữ liệu'}</span></div></section>` +
      `<div class='stat-grid'><article class='stat-card'><div class='stat-top'><span class='stat-label'>Lãi gộp trong kỳ</span><span class='stat-icon'>${icon('chart', 16)}</span></div><div class='stat-value'>${moneyVndText(summary.grossProfitVnd)}</div><div class='stat-foot'>Sau giá vốn và hàng trả · trước chi phí vận hành</div></article><article class='stat-card'><div class='stat-top'><span class='stat-label'>Khách còn nợ</span><span class='stat-icon'>${icon('users', 16)}</span></div><div class='stat-value'>${money(financeSummary.customerDebtVnd)}</div><div class='stat-foot'>${number(financeSummary.customerDebtCount)} khách hàng</div></article><article class='stat-card'><div class='stat-top'><span class='stat-label'>Sắp hết hàng</span><span class='stat-icon'>${icon('alert', 16)}</span></div><div class='stat-value'>${number(lowCount)}</div><div class='stat-foot'>Mặt hàng bằng hoặc dưới mức cảnh báo</div></article><article class='stat-card'><div class='stat-top'><span class='stat-label'>Giá trị tồn kho</span><span class='stat-icon'>${icon('box', 16)}</span></div><div class='stat-value'>${money(inventorySummary.stockValueVnd)}</div><div class='stat-foot'>Ước tính theo giá vốn hiện tại</div></article></div>` +
      `<div class='dashboard-main-grid'><section class='panel chart-panel'><div class='panel-header'><div><h2>Doanh thu bán hàng</h2><p>Doanh thu thuần theo ngày · khoảng ${analyticsData ? esc(analyticsData.range.from) + ' đến ' + esc(analyticsData.range.to) : 'đang tải'}</p></div><div class='view-toggle'><div class='chart-legend'><span><i class='legend-dot'></i> Doanh thu</span></div><div class='segmented'><button class='segment ${chartRange === '7 ngày' ? 'active' : ''}' data-action='chart-range' data-range='7 ngày'>Tuần</button><button class='segment ${chartRange === '30 ngày' ? 'active' : ''}' data-action='chart-range' data-range='30 ngày'>Tháng</button></div></div></div><div class='chart-wrap'>${chartSvg(chartRange === '7 ngày' ? 7 : 30)}</div><div class='chart-foot'><i class='mini-dot'></i><strong>${money(todaySales)}</strong> doanh thu hôm nay <span>·</span> ${number(todayOrderCount)} đơn</div></section><div class='side-stack'><section class='panel quick-panel'><div class='section-title'><h2>Thao tác nhanh</h2><p>Quản lý giao dịch thường ngày</p></div><div class='quick-grid'><button class='quick-action' data-route='pos'><span class='quick-icon'>＋</span><span class='quick-copy'><strong>Tạo đơn hàng</strong><small>Thanh toán tại quầy</small></span></button><button class='quick-action' data-action='new-product'><span class='quick-icon'>⌕</span><span class='quick-copy'><strong>Thêm sản phẩm</strong><small>Tạo mã hàng mới</small></span></button>${['owner', 'manager', 'stockkeeper', 'accountant'].includes(store.role) ? `<button class='quick-action' data-action='receive-stock'><span class='quick-icon'>↙</span><span class='quick-copy'><strong>Nhập hàng</strong><small>Cập nhật tồn và giá vốn</small></span></button>` : ''}${['owner', 'manager', 'accountant'].includes(store.role) ? `<button class='quick-action' data-action='new-expense'><span class='quick-icon'>↗</span><span class='quick-copy'><strong>Ghi khoản thu / chi</strong><small>Đối soát sổ quỹ</small></span></button>` : ''}</div></section><section class='panel alert-panel'><div class='alert-title'><span class='alert-icon'>${icon('alert', 15)}</span><div><strong>${number(lowCount)} mặt hàng cần chú ý</strong><small>Kiểm tra số lượng và nhập bổ sung</small></div></div><div class='alert-list'>${lowStockProducts().slice(0, 3).map(function (p) { return `<div class='alert-row'><strong>${esc(p.name)}</strong><span class='alert-qty'>${p.stock === 0 ? 'Hết hàng' : `Còn ${number(p.stock)} ${esc(p.unit)}`}</span></div>`; }).join('') || `<div class='alert-row'><strong>${lowCount ? 'Mở kho để xem mặt hàng cần chú ý' : 'Tồn kho đang ổn định'}</strong><span class='alert-qty'>${lowCount ? 'Kho hàng' : 'Tốt'}</span></div>`}</div><button class='link-button' data-route='inventory'>Mở danh sách kho →</button></section></div></div>` +
      `<div class='lower-grid'><section class='panel'><div class='panel-header'><div><h2>Đơn hàng gần đây</h2><p>Các giao dịch mới nhất trong cửa hàng</p></div><button class='link-button' data-route='orders'>Xem tất cả →</button></div><div class='activity-list'>${recent.map(function (o) { return `<button class='activity-item' data-action='order-detail' data-id='${o.id}' style='width:100%;border:0;background:none;text-align:left'><span class='activity-mark'>${icon('receiptSmall', 15)}</span><span class='activity-text'><strong>${esc(o.number)}${o.customerName ? ' · ' + esc(o.customerName) : ''}</strong><small>${timeOf(o.createdAt)} · ${number(o.itemCount)} dòng</small></span><span class='activity-amount'>${money(o.total)}</span></button>`; }).join('') || `<div class='empty-state'><strong>Chưa có giao dịch</strong><span>Đơn bán mới sẽ hiện ở đây.</span></div>`}</div></section><section class='panel'><div class='panel-header'><div><h2>Sản phẩm nổi bật</h2><p>Tính theo doanh thu thuần trong kỳ</p></div><button class='link-button' data-route='products'>Danh mục →</button></div><div class='top-products'>${tops.map(function (item, index) { return `<div class='top-product-row'><span class='rank-number'>${String(index + 1).padStart(2, '0')}</span><span class='product-thumb ${item.product.tone}'>${esc(item.product.emoji)}</span><span class='top-product-copy'><strong>${esc(item.product.name)}</strong><small>${esc(item.product.sku)}</small></span><span class='top-product-value'>${number(item.count)}<small>đã bán</small></span></div>`; }).join('') || `<div class='empty-state'><strong>${analyticsLoading ? 'Đang tải báo cáo' : 'Chưa có dữ liệu'}</strong><span>${esc(analyticsError || 'Đơn hàng đã ghi nhận sẽ xuất hiện ở đây.')}</span></div>`}</div></section></div>`;
  }

  function reportCsvText(value) {
    let text = String(value == null ? '' : value);
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function reportCsvInteger(value, label) {
    const text = String(value == null || value === '' ? '0' : value);
    if (!/^-?\d+$/.test(text)) throw new Error('Giá trị không hợp lệ trong báo cáo: ' + label);
    return text;
  }

  function reportCsvQuantity(value, label) {
    const text = String(value == null || value === '' ? '0' : value);
    if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new Error('Số lượng không hợp lệ trong báo cáo: ' + label);
    return text;
  }

  function downloadReportsCsv() {
    if (!['owner', 'manager', 'accountant'].includes(store.role)) {
      return toast('Không có quyền xuất báo cáo', 'Vai trò của bạn không được phép xem dữ liệu tài chính.', 'error');
    }
    if (analyticsLoading || analyticsError || !analyticsData || !analyticsData.range || !analyticsData.summary) {
      return toast('Báo cáo chưa sẵn sàng', 'Tải báo cáo thành công rồi thử tải CSV.', 'error');
    }
    try {
      const report = analyticsData;
      const summary = report.summary;
      const rows = [
        ['Slink - Báo cáo bán hàng', report.range.from, report.range.to],
        [],
        ['Chỉ số', 'Giá trị', 'Đơn vị'],
        ['Doanh thu thuần', reportCsvInteger(summary.netSalesVnd, 'doanh thu thuần'), 'VND'],
        ['Lãi gộp ước tính', reportCsvInteger(summary.grossProfitVnd, 'lãi gộp'), 'VND'],
        ['Số đơn trong kỳ', reportCsvInteger(summary.orderCount, 'số đơn'), 'đơn'],
        ['Giá trị đơn trung bình', reportCsvInteger(summary.averageTicketVnd, 'giá trị đơn trung bình'), 'VND'],
        ['Tiền đã thu ròng', reportCsvInteger(summary.collectedVnd, 'tiền đã thu'), 'VND'],
        ['Còn phải thu', reportCsvInteger(summary.receivableVnd, 'còn phải thu'), 'VND'],
        [], ['Doanh thu thuần theo ngày'], ['Ngày', 'Số đơn', 'Doanh thu thuần (VND)'],
      ];
      (Array.isArray(report.days) ? report.days : []).forEach(function (item) {
        rows.push([reportCsvText(item.date), reportCsvInteger(item.orderCount, 'số đơn theo ngày'), reportCsvInteger(item.salesVnd, 'doanh thu theo ngày')]);
      });
      rows.push([], ['Sản phẩm bán chạy'], ['Tên sản phẩm', 'SKU', 'Số lượng bán ròng', 'Đơn vị', 'Doanh thu thuần (VND)']);
      (Array.isArray(report.topProducts) ? report.topProducts : []).forEach(function (item) {
        rows.push([reportCsvText(item.name), reportCsvText(item.sku), reportCsvQuantity(item.quantity_sold, 'số lượng sản phẩm'), reportCsvText(item.unit), reportCsvInteger(item.net_sales_vnd, 'doanh thu sản phẩm')]);
      });
      const csv = '\uFEFF' + rows.map(function (row) { return row.join(','); }).join('\r\n');
      const safeFrom = String(report.range.from).replace(/[^0-9-]/g, '');
      const safeTo = String(report.range.to).replace(/[^0-9-]/g, '');
      const filename = `slink-bao-cao-${safeFrom}-${safeTo}.csv`;
      download(filename, csv, 'text/csv;charset=utf-8');
      toast('Đã xuất báo cáo CSV', `${report.range.from} đến ${report.range.to}`);
    } catch (error) {
      toast('Chưa xuất được báo cáo', error.message, 'error');
    }
  }

  function printReportsPdf() {
    if (!['owner', 'manager', 'accountant'].includes(store.role)) {
      return toast('Không có quyền xuất báo cáo', 'Vai trò của bạn không được phép xem dữ liệu tài chính.', 'error');
    }
    if (analyticsLoading || analyticsError || !analyticsData || !analyticsData.range || !analyticsData.summary) {
      return toast('Báo cáo chưa sẵn sàng', 'Tải báo cáo thành công rồi thử in hoặc lưu PDF.', 'error');
    }

    const report = analyticsData;
    const summary = report.summary;
    const dailyRows = (Array.isArray(report.days) ? report.days : []).map(function (item) {
      const date = new Date(String(item.date || '') + 'T12:00:00');
      const label = Number.isNaN(date.getTime()) ? String(item.date || '') : date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `<tr><td>${esc(label)}</td><td class="num">${number(item.orderCount)}</td><td class="num">${esc(moneyVndText(item.salesVnd))}</td></tr>`;
    }).join('');
    const products = (Array.isArray(report.topProducts) ? report.topProducts : []).map(function (item, index) {
      return `<tr><td>${index + 1}</td><td>${esc(item.name)}</td><td>${esc(item.sku || '—')}</td><td class="num">${number(item.quantity_sold)} ${esc(item.unit || '')}</td><td class="num">${esc(moneyVndText(item.net_sales_vnd))}</td></tr>`;
    }).join('');
    const popup = window.open('', '_blank', 'width=900,height=760');
    if (!popup) return toast('Không mở được bản in', 'Trình duyệt đang chặn cửa sổ in. Hãy cho phép cửa sổ bật lên của Slink rồi thử lại.', 'error');

    const generatedAt = new Date().toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
    const storeName = store.settings && store.settings.storeName || 'Slink';
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Báo cáo bán hàng ${esc(report.range.from)}–${esc(report.range.to)}</title><style>
      @page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#202923;margin:0;line-height:1.45}h1{font-size:22px;margin:0 0 4px}h2{font-size:14px;margin:20px 0 8px}.muted{color:#657069}.brand{font-size:11px;font-weight:700;color:#4d775d;text-transform:uppercase;letter-spacing:.08em}.meta{margin:8px 0 18px}.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.card{border:1px solid #dce4dc;border-radius:8px;padding:10px}.card small{display:block;color:#667169;margin-bottom:5px}.card strong{font-size:17px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:7px 6px;border-bottom:1px solid #e5eae5;text-align:left;vertical-align:top}th{background:#f2f5f1;font-weight:700}.num{text-align:right;white-space:nowrap}.note{margin-top:18px;padding:10px;background:#f6f7f4;border-radius:6px;color:#566158;font-size:10px}.footer{margin-top:18px;color:#7b847c;font-size:10px}.empty{padding:10px;color:#68736b;border:1px dashed #ccd5cd}@media print{tr{break-inside:avoid}thead{display:table-header-group}}
      </style></head><body><div class="brand">${esc(storeName)}</div><h1>Báo cáo bán hàng</h1><div class="meta muted">Kỳ báo cáo: ${esc(report.range.from)} đến ${esc(report.range.to)} · Tạo lúc ${esc(generatedAt)}</div>
      <div class="cards"><div class="card"><small>Doanh thu thuần</small><strong>${esc(moneyVndText(summary.netSalesVnd))}</strong></div><div class="card"><small>Lãi gộp ước tính</small><strong>${esc(moneyVndText(summary.grossProfitVnd))}</strong></div><div class="card"><small>Số đơn trong kỳ</small><strong>${number(summary.orderCount)}</strong></div><div class="card"><small>Giá trị đơn trung bình</small><strong>${esc(moneyVndText(summary.averageTicketVnd))}</strong></div><div class="card"><small>Tiền đã thu ròng</small><strong>${esc(moneyVndText(summary.collectedVnd))}</strong></div><div class="card"><small>Còn phải thu</small><strong>${esc(moneyVndText(summary.receivableVnd))}</strong></div></div>
      <h2>Doanh thu thuần theo ngày</h2>${dailyRows ? `<table><thead><tr><th>Ngày</th><th class="num">Số đơn</th><th class="num">Doanh thu thuần</th></tr></thead><tbody>${dailyRows}</tbody></table>` : '<div class="empty">Không có dữ liệu theo ngày trong kỳ này.</div>'}
      <h2>Sản phẩm bán chạy</h2>${products ? `<table><thead><tr><th>#</th><th>Sản phẩm</th><th>Mã hàng</th><th class="num">Số lượng bán ròng</th><th class="num">Doanh thu thuần</th></tr></thead><tbody>${products}</tbody></table>` : '<div class="empty">Không có sản phẩm bán trong kỳ này.</div>'}
      <div class="note">Lãi gộp là số ước tính sau giá vốn của hàng bán và hàng trả, trước tiền thuê, lương, thuế và các chi phí vận hành. Báo cáo lấy từ dữ liệu đã ghi sổ trong Slink; bản in không thay thế chứng từ kế toán hoặc hóa đơn thuế.</div><div class="footer">Dùng hộp thoại in của trình duyệt để in hoặc chọn “Lưu dưới dạng PDF”.</div><script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print()},250)})<\/script></body></html>`;
    popup.document.open();
    popup.document.write(html.replace(/<script>[\s\S]*?<\/script>/, ''));
    popup.document.close();
    window.setTimeout(function () { popup.focus(); popup.print(); }, 250);
  }

  function renderReports() {
    if (!['owner', 'manager', 'accountant'].includes(store.role)) {
      return `<section class='panel locked-page'><div class='empty-icon'>${icon('chart', 23)}</div><h2>Không có quyền xem báo cáo</h2><p>Báo cáo doanh thu, lãi gộp và công nợ chỉ dành cho chủ cửa hàng, quản lý hoặc kế toán.</p></section>`;
    }
    const days = chartRange === '30 ngày' ? 30 : 7;
    const summary = analyticsData && analyticsData.summary || {};
    const daily = chartDays(days);
    const maximum = Math.max(1, ...daily.map(function (item) { return item.total; }));
    const bars = daily.map(function (item) { const height = Math.max(4, item.total / maximum * 135); return `<div class='bar-column'><div class='bar-pair'><div class='bar muted' style='height:${Math.max(4, height * .65)}px'></div><div class='bar' style='height:${height}px'><title>${esc(item.date)} · ${money(item.total)} · ${number(item.orders)} đơn</title></div></div><span class='bar-label'>${esc(item.label)}</span></div>`; }).join('');
    const tops = topProducts();
    const totalTopRevenue = tops.reduce(function (sum, item) { return sum + item.revenue; }, 0) || 1;
    const reportCanPrint = !!(analyticsData && analyticsData.range && analyticsData.summary && !analyticsLoading && !analyticsError);
    return pageHeading('Báo cáo', 'Doanh thu, lãi gộp và sản phẩm bán chạy từ dữ liệu đã ghi sổ.', `<button class='btn btn-secondary' data-action='download-reports-csv' ${reportCanPrint ? '' : 'disabled'}>Tải CSV</button><button class='btn btn-secondary' data-action='print-reports-pdf' ${reportCanPrint ? '' : 'disabled'} title='In hoặc lưu báo cáo thành PDF'>In / lưu PDF</button><div class='segmented'><button class='segment ${days === 7 ? 'active' : ''}' data-action='chart-range' data-range='7 ngày'>7 ngày</button><button class='segment ${days === 30 ? 'active' : ''}' data-action='chart-range' data-range='30 ngày'>30 ngày</button></div>`) +
      `${analyticsError ? `<div class='notice-item'><span>⚠️</span><span><strong>Chưa tải được báo cáo</strong><small>${esc(analyticsError)}</small></span></div>` : ''}<div class='report-grid'><article class='panel report-card'><small>Doanh thu thuần</small><strong>${moneyVndText(summary.netSalesVnd)}</strong><span>${number(summary.orderCount)} đơn trong kỳ</span></article><article class='panel report-card'><small>Lãi gộp ước tính</small><strong>${moneyVndText(summary.grossProfitVnd)}</strong><span>Sau giá vốn và hàng trả, trước chi phí vận hành</span></article><article class='panel report-card'><small>Giá trị đơn trung bình</small><strong>${moneyVndText(summary.averageTicketVnd)}</strong><span>Doanh thu thuần chia cho số đơn</span></article><article class='panel report-card'><small>Tiền đã thu ròng</small><strong>${moneyVndText(summary.collectedVnd)}</strong><span>Còn phải thu: ${moneyVndText(summary.receivableVnd)}</span></article></div><div class='report-main-grid'><section class='panel'><div class='panel-header'><div><h2>Doanh thu theo ngày</h2><p>${analyticsData ? esc(analyticsData.range.from) + ' đến ' + esc(analyticsData.range.to) : analyticsLoading ? 'Đang tải…' : 'Chưa có dữ liệu'}</p></div><div class='chart-legend'><span><i class='legend-dot'></i> Doanh thu thuần</span></div></div><div class='bar-chart'>${bars || `<div class='empty-state'>${analyticsLoading ? 'Đang tải báo cáo…' : esc(analyticsError || 'Chưa có dữ liệu trong khoảng này.')}</div>`}</div></section><section class='panel'><div class='panel-header'><div><h2>Sản phẩm nổi bật</h2><p>Doanh thu thuần trong kỳ</p></div></div><div class='report-breakdown'>${tops.map(function (item, index) { const share = Math.round(item.revenue / totalTopRevenue * 100); return `<div class='breakdown-row'><i class='breakdown-mark ${index === 1 ? 'alt' : index > 1 ? 'third' : ''}'></i><span>${esc(item.product.name)} · ${number(item.count)} ${esc(item.product.unit)}</span><strong>${share}%</strong></div>`; }).join('') || `<div class='empty-state'><strong>${analyticsLoading ? 'Đang tải dữ liệu' : 'Chưa có giao dịch'}</strong><span>${esc(analyticsError || 'Sản phẩm bán sẽ được xếp hạng tại đây.')}</span></div>`}</div></section></div><div class='install-hint' style='margin-top:15px'>Lãi gộp đã trừ giá vốn của hàng bán và tính hàng trả lại theo tình trạng nhập lại kho. Chỉ số chưa trừ tiền thuê, lương, thuế và các chi phí vận hành.</div>`;
  }

  function routeTo(next) {
    if (!next) return;
    if (!canAccessRoute(next)) return toast('Không có quyền truy cập', 'Vai trò của bạn không được mở khu vực này.', 'error');
    page = next; closeModal();
    if (page === 'products') loadProductsPage(searchTerms.products, 0);
    else if (page === 'dashboard') {
      const dashboardLoads = [loadInventoryPage('', 0)];
      if (['owner', 'manager', 'accountant'].includes(store.role)) {
        dashboardLoads.push(loadAnalytics(chartRange === '30 ngày' ? 30 : 7), loadOrdersPage('', 0), loadFinancePage());
      } else if (store.role === 'cashier') {
        dashboardLoads.push(loadOrdersPage('', 0));
      } else if (store.role === 'stockkeeper') {
        dashboardLoads.push(loadFinancePage());
      }
      Promise.all(dashboardLoads).then(render);
    }
    else if (page === 'inventory') loadWarehouses().then(function () { return loadInventoryPage(searchTerms.inventory, 0); });
    else if (page === 'finance') loadFinancePage();
    else if (page === 'reports') loadAnalytics(chartRange === '30 ngày' ? 30 : 7);
    else if (page === 'settings') { loadStoreProfile(); loadAccountSecurity(); }
    else if (page === 'staff') loadStaffPage();
    else if (page === 'channels') { loadChannelCatalog(); if (channelState.view === 'orders') loadChannelOrders(0); }
    else if (page === 'audit') loadAuditEvents(null, 0);
    else if (page === 'customers') loadCustomersPage(searchTerms.customers, 0).then(render);
    else if (page === 'orders') loadOrdersPage(searchTerms.orders, 0).then(render);
    else if (page === 'pos') { searchTerms.products = ''; searchTerms.customers = ''; posSearchTerm = ''; posProducts = []; Promise.all([loadProductsPage('', 0), loadCustomersPage('', 0)]).then(function () { posProducts = store.products.slice(); render(); }); }
    else render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submitAuth(form) {
    const type = form.dataset.authForm;
    const data = new FormData(form);
    const submit = form.querySelector('[type=submit]');
    if (submit) submit.disabled = true;
    try {
      if (type === 'login') {
        const session = await apiRequest('/api/auth/login', {
          method: 'POST', body: { email: String(data.get('email') || '').trim(), password: String(data.get('password') || '') },
        });
        if (invitationToken && invitationInfo && invitationInfo.status === 'pending') {
          const accepted = await apiRequest(`/api/invitations/${encodeURIComponent(invitationToken)}/accept`, { method: 'POST', body: {} });
          const current = await apiRequest('/api/auth/me');
          invitationToken = '';
          invitationInfo = null;
          window.history.replaceState({}, '', '/');
          await enterStore(current, accepted.storeId);
        } else await enterStore(session);
      } else if (type === 'register') {
        const result = await apiRequest('/api/auth/register', {
          method: 'POST', body: {
            displayName: String(data.get('displayName') || '').trim(),
            storeName: String(data.get('storeName') || '').trim(),
            email: String(data.get('email') || '').trim(),
            password: String(data.get('password') || ''),
          },
        });
        authMode = 'login';
        renderAuth(result.message, 'success', result.developmentVerificationUrl);
      } else if (type === 'resend') {
        const result = await apiRequest('/api/auth/resend-verification', {
          method: 'POST', body: { email: String(data.get('email') || '').trim() },
        });
        authMode = 'login';
        renderAuth(result.message, 'success', result.developmentVerificationUrl);
      } else if (type === 'reset') {
        const result = await apiRequest('/api/auth/password-reset', {
          method: 'POST', body: { email: String(data.get('email') || '').trim() },
        });
        renderAuth(result.message, 'success', result.developmentResetUrl);
      } else if (type === 'reset-complete') {
        const password = String(data.get('password') || '');
        if (password !== String(data.get('passwordConfirm') || '')) throw new Error('Hai lần nhập mật khẩu chưa khớp.');
        const result = await apiRequest('/api/auth/password-reset/complete', {
          method: 'POST', body: { token: String(data.get('token') || ''), password: password },
        });
        window.history.replaceState({}, '', '/');
        authMode = 'login';
        renderAuth(result.message, 'success');
      } else if (type === 'invite-register') {
        if (!invitationToken || !invitationInfo || invitationInfo.status !== 'pending') throw new Error('Lời mời không còn hiệu lực. Hãy xin chủ cửa hàng gửi liên kết mới.');
        const result = await apiRequest(`/api/invitations/${encodeURIComponent(invitationToken)}/register`, {
          method: 'POST', body: { displayName: String(data.get('displayName') || '').trim(), password: String(data.get('password') || '') },
        });
        authMode = 'invite-login';
        renderAuth(result.message, 'success', result.developmentVerificationUrl);
      }
    } catch (error) {
      if (type === 'register' && error.code === 'account_exists') {
        authMode = 'login';
        renderAuth('Email này đã được đăng ký. Hãy đăng nhập hoặc chọn “Gửi lại email xác nhận” nếu bạn chưa xác nhận email.', 'error');
      } else if (type === 'register' && error.code === 'email_unavailable') {
        authMode = 'login';
        renderAuth('Tài khoản đã được tạo nhưng email xác nhận chưa gửi được. Hãy chọn “Gửi lại email xác nhận” sau khi dịch vụ gửi thư hoạt động; không cần tạo lại tài khoản.', 'error');
      } else {
        renderAuth(error.message, 'error');
      }
    } finally {
      if (submit && submit.isConnected) submit.disabled = false;
    }
  }

  async function signOut() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST', body: {} });
      showSignedOut('Phiên cửa hàng được lưu trên máy chủ. Bạn đã đăng xuất.');
    } catch (error) {
      if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn.');
      else toast('Chưa đăng xuất được', error.message, 'error');
    }
  }

  async function boot() {
    const resetToken = new URLSearchParams(window.location.hash.slice(1)).get('reset');
    if (resetToken) {
      authMode = 'reset-complete';
      renderAuth();
      return;
    }
    const verificationToken = new URLSearchParams(window.location.hash.slice(1)).get('token') || new URLSearchParams(window.location.search).get('token');
    if (window.location.pathname === '/verify' && verificationToken) {
      authMode = 'login';
      authCard('Đang xác nhận email', 'Đang kích hoạt cửa hàng của bạn.', '', 'Đang kiểm tra liên kết bảo mật…');
      try {
        const result = await apiRequest('/api/auth/verify-email', { method: 'POST', body: { token: verificationToken } });
        window.history.replaceState({}, '', '/');
        renderAuth(result.message, 'success');
      } catch (error) {
        window.history.replaceState({}, '', '/');
        renderAuth(error.message, 'error');
      }
      return;
    }
    invitationToken = new URLSearchParams(window.location.hash.slice(1)).get('invite') || '';
    if (window.location.pathname === '/invite' && invitationToken) {
      try {
        const result = await apiRequest(`/api/invitations/${encodeURIComponent(invitationToken)}`);
        invitationInfo = result.invitation;
        if (invitationInfo.status !== 'pending') {
          authMode = 'login';
          renderAuth('Lời mời đã được dùng, thu hồi hoặc hết hạn. Hãy liên hệ chủ cửa hàng để nhận lời mời mới.', 'error');
          return;
        }
      } catch (error) {
        authMode = 'login';
        renderAuth(error.message, 'error');
        return;
      }
      let session;
      try { session = await apiRequest('/api/auth/me'); }
      catch (error) {
        if (error.status === 401) { authMode = 'invite-login'; renderAuth(); return; }
        authMode = 'invite-login'; renderAuth('Chưa kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', 'error'); return;
      }
      try {
        const accepted = await apiRequest(`/api/invitations/${encodeURIComponent(invitationToken)}/accept`, { method: 'POST', body: {} });
        const current = await apiRequest('/api/auth/me');
        invitationToken = '';
        invitationInfo = null;
        window.history.replaceState({}, '', '/');
        await enterStore(current, accepted.storeId);
      } catch (error) {
        authMode = 'invite-login';
        renderAuth(error.message, 'error');
      }
      return;
    }
    try {
      const session = await apiRequest('/api/auth/me');
      await enterStore(session);
    } catch (error) {
      if (error.status === 401) showSignedOut();
      else showSignedOut('Slink chưa kết nối được máy chủ. Kiểm tra mạng rồi thử đăng nhập lại.', 'error');
    }
  }

  document.addEventListener('click', function (event) {
    const route = event.target.closest('[data-route]');
    if (route) { routeTo(route.dataset.route); return; }
    const button = event.target.closest('[data-action]'); if (!button) return;
    const action = button.dataset.action; const id = button.dataset.id;
    if (action === 'auth-mode') { authMode = button.dataset.mode || 'login'; renderAuth(); }
    else if (action === 'logout') { closeModal(); signOut(); }
    else if (action === 'account-menu') showAccountMenu();
    else if (action === 'account-settings') { closeModal(); routeTo('settings'); }
    else if (action === 'reload-security') loadAccountSecurity();
    else if (action === 'revoke-session') revokeAccountSession(id);
    else if (action === 'products-page') loadProductsPage(searchTerms.products, Number(button.dataset.offset) || 0);
    else if (action === 'inventory-page') loadInventoryPage(searchTerms.inventory, Number(button.dataset.offset) || 0);
    else if (action === 'customers-page') loadCustomersPage(searchTerms.customers, Number(button.dataset.offset) || 0).then(render);
    else if (action === 'orders-page') loadOrdersPage(searchTerms.orders, Number(button.dataset.offset) || 0).then(render);
    else if (action === 'close-modal') closeModal();
    else if (action === 'review-legacy-pending') clearReviewedLegacyPending();
    else if (action === 'import-products') openProductImport();
    else if (action === 'bulk-update-products') openProductBulkUpdate();
    else if (action === 'download-product-import-template') downloadProductImportTemplate();
    else if (action === 'import-customers') openCustomerImport();
    else if (action === 'download-customer-import-template') downloadCustomerImportTemplate();
    else if (action === 'help') showHelp();
    else if (action === 'more-menu') showMoreMenu();
    else if (action === 'new-channel-profile') openChannelProfile(null);
    else if (action === 'edit-channel-profile') {
      const profile = channelState.profiles.find(function (item) { return item.id === id; });
      if (profile) openChannelProfile(profile);
    }
    else if (action === 'archive-channel-profile') {
      const profile = channelState.profiles.find(function (item) { return item.id === id; });
      if (profile && !Number(profile.active_mapping_count)) confirmChannelArchive('profile', profile);
    }
    else if (action === 'new-channel-mapping') openChannelMapping(null);
    else if (action === 'edit-channel-mapping') {
      const mapping = channelState.mappings.find(function (item) { return item.id === id; });
      if (mapping) openChannelMapping(mapping);
    }
    else if (action === 'archive-channel-mapping') {
      const mapping = channelState.mappings.find(function (item) { return item.id === id; });
      if (mapping) confirmChannelArchive('mapping', mapping);
    }
    else if (action === 'channel-view') {
      channelState.view = button.dataset.view === 'orders' ? 'orders' : 'mappings';
      render();
      if (channelState.view === 'orders') loadChannelOrders(0);
    }
    else if (action === 'new-channel-order') openChannelOrderModal();
    else if (action === 'reload-channel-orders') loadChannelOrders(channelState.orderOffset);
    else if (action === 'channel-order-page') loadChannelOrders(Number(button.dataset.offset) || 0);
    else if (action === 'channel-order-detail') openChannelOrderDetail(id);
    else if (action === 'print-channel-order') printChannelPackingSlip(id);
    else if (action === 'channel-order-status') {
      const order = channelState.orders.find(function (item) { return item.id === id; });
      if (order) openChannelOrderStatus(order, button.dataset.status);
    }
    else if (action === 'add-channel-order-line') {
      const container = document.getElementById('channel-order-lines');
      const rows = container ? container.querySelectorAll('[data-channel-order-line]') : [];
      if (container && rows.length < 100) {
        container.insertAdjacentHTML('beforeend', channelOrderLineRow(rows.length));
        updateChannelOrderTotal(container.closest('[data-form="channel-order-create"]'));
      } else toast('Đã đạt giới hạn', 'Mỗi đơn kênh có thể có tối đa 100 dòng.', 'error');
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
        updateChannelOrderTotal(container.closest('[data-form="channel-order-create"]'));
      }
    }
    else if (action === 'reload-channel-catalog') loadChannelCatalog(channelState.offset);
    else if (action === 'channel-state') { channelState.state = button.dataset.state === 'archived' ? 'archived' : 'active'; loadChannelCatalog(0); }
    else if (action === 'channel-page') loadChannelCatalog(Number(button.dataset.offset) || 0);
    else if (action === 'new-product') openProduct('');
    else if (action === 'new-product-variant-group') openProductVariantGroup();
    else if (action === 'add-product-variant') {
      const container = document.getElementById('product-variant-rows');
      const rows = container ? container.querySelectorAll('[data-product-variant-row]') : [];
      if (container && rows.length < 50) {
        container.insertAdjacentHTML('beforeend', productVariantRow(null, rows.length, false, rows.length + 1));
        container.querySelectorAll('[data-action="remove-product-variant"]').forEach(function (item) { item.disabled = false; });
      }
      else toast('Đã đạt giới hạn', 'Mỗi nhóm có thể có tối đa 50 biến thể.', 'error');
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
          if (title) title.textContent = `Biến thể ${number(index + 1)}`;
          if (removeButton) removeButton.disabled = index < 2 || rows.length <= 2;
        });
      }
    }
    else if (action === 'edit-product') openProduct(id);
    else if (action === 'add-product-to-existing-variant-group') openProductVariantAdd(id);
    else if (action === 'product-price-history') openProductPriceHistory(id);
    else if (action === 'load-more-product-price-history') loadMoreProductPriceHistory();
    else if (action === 'new-customer') openCustomer('');
    else if (action === 'save-customer-segment') openSaveCustomerSegment();
    else if (action === 'delete-customer-segment') openDeleteCustomerSegment(id);
    else if (action === 'new-supplier') openSupplier();
    else if (action === 'edit-customer') { closeModal(); openCustomer(id); }
    else if (action === 'customer-detail') openCustomerDetail(id);
    else if (action === 'collect-customer-payment') openCollectCustomerPayment(id);
    else if (action === 'customer-tag-remove') changeCustomerTag(id, 'remove', button.dataset.tag || '');
    else if (action === 'retry-customer-tag') sendPendingCustomerTag(id);
    else if (action === 'order-detail') openOrder(id);
    else if (action === 'load-older-order-notes') loadOlderOrderNotes(id);
    else if (action === 'order-tag-remove') changeOrderTag(id, 'remove', button.dataset.tag || '');
    else if (action === 'retry-order-mutation') sendPendingOrderMutation(id);
    else if (action === 'void-order') openVoidOrder(id);
    else if (action === 'manage-promotions') openPromotions();
    else if (action === 'new-promotion') openPromotionCreate();
    else if (action === 'archive-promotion') archivePromotion(id);
    else if (action === 'purchase-detail') openPurchaseDetail(id);
    else if (action === 'purchase-order-detail') openPurchaseOrderDetail(id);
    else if (action === 'new-purchase-order') openPurchaseOrder('');
    else if (action === 'edit-purchase-order') openPurchaseOrder(id);
    else if (action === 'place-purchase-order') placePurchaseOrder(id);
    else if (action === 'cancel-purchase-order') openCancelPurchaseOrder(id);
    else if (action === 'receive-purchase-order') openPurchaseOrderReceipt(id);
    else if (action === 'add-order-line') addPurchaseOrderLine();
    else if (action === 'remove-order-line') removePurchaseOrderLine(Number(button.dataset.index));
    else if (action === 'return-order') openReturn(id);
    else if (action === 'collect-payment') openCollectPayment(id);
    else if (action === 'print-order') printOrder(id);
    else if (action === 'share-order') shareOrder(id);
    else if (action === 'download-reports-csv') downloadReportsCsv();
    else if (action === 'print-reports-pdf') printReportsPdf();
    else if (action === 'add-cart') addToCart(id);
    else if (action === 'cart-qty') setCartQty(id, Number(button.dataset.delta));
    else if (action === 'cart-qty-edit') editCartQuantity(id);
    else if (action === 'checkout') openCheckout();
    else if (action === 'apply-promotion') applyCheckoutPromotion();
    else if (action === 'add-tender') {
      if (checkoutPendingPayload) return toast('Đơn đang chờ xác nhận', 'Không thể đổi các khoản thanh toán của đơn đã gửi.', 'error');
      const form = modal.querySelector('[data-form="checkout"]');
      if (!form) return;
      const tenders = checkoutTenderValues(form);
      if (tenders.length >= 5) return toast('Đã đạt giới hạn', 'Mỗi đơn có thể chia tối đa 5 phương thức thanh toán.', 'error');
      const used = new Set(tenders.map(function (tender) { return tender.method; }));
      const nextMethod = checkoutMethods.find(function (method) { return !used.has(method[0]); });
      if (!nextMethod) return toast('Đã có đủ phương thức', 'Mỗi phương thức chỉ được thêm một lần.', 'error');
      tenders.push({ method: nextMethod[0], amountReceivedVnd: '0' });
      renderCheckoutTenders(form, tenders);
      const nextSelect = form.querySelector(`#tender-method-${tenders.length - 1}`);
      if (nextSelect) nextSelect.focus();
    }
    else if (action === 'remove-tender') {
      if (checkoutPendingPayload) return;
      const form = modal.querySelector('[data-form="checkout"]');
      if (!form) return;
      const tenders = checkoutTenderValues(form);
      tenders.splice(Number(button.dataset.index), 1);
      renderCheckoutTenders(form, tenders.map(function (tender) { return { method: tender.method, amountReceivedVnd: tender.amountText }; }));
    }
    else if (action === 'pick-customer') pickCustomer();
    else if (action === 'select-customer') { if (checkoutPendingPayload) return toast('Đang chờ xác nhận đơn', 'Hãy kiểm tra đơn đang chờ trước khi đổi khách hàng.', 'error'); cartCustomerId = id || ''; closeModal(); page = 'pos'; render(); }
    else if (action === 'retry-pending-sale') openCheckout();
    else if (action === 'new-customer-from-pos') { closeModal(); openCustomer(''); }
    else if (action === 'open-cart') { const drawer = document.getElementById('drawer-cart'); if (drawer) drawer.classList.add('open'); }
    else if (action === 'category') { categoryFilter = button.dataset.category; render(); }
    else if (action === 'chart-range') { chartRange = button.dataset.range; loadAnalytics(chartRange === '30 ngày' ? 30 : 7); }
    else if (action === 'order-filter') {
      orderFilter = button.dataset.filter;
      loadOrdersPage(searchTerms.orders, 0).then(render);
    }
    else if (action === 'new-expense') openExpense();
    else if (action === 'open-cash-session') openCashSessionForm();
    else if (action === 'close-cash-session') openCashSessionCloseForm();
    else if (action === 'supplier-payment') openSupplierPayment(id);
    else if (action === 'receive-stock') openReceive();
    else if (action === 'new-warehouse') openNewWarehouse();
    else if (action === 'archive-warehouse') openArchiveWarehouse(id);
    else if (action === 'new-warehouse-transfer') openWarehouseTransfer();
    else if (action === 'add-transfer-line') addTransferLine();
    else if (action === 'remove-transfer-line') removeTransferLine(Number(button.dataset.index));
    else if (action === 'transfer-dispatch') dispatchWarehouseTransfer(id);
    else if (action === 'transfer-receive') openTransferReceipt(id);
    else if (action === 'transfer-cancel') openTransferCancel(id);
    else if (action === 'add-purchase-line') addReceivePurchaseLine();
    else if (action === 'remove-purchase-line') removeReceivePurchaseLine(Number(button.dataset.index));
    else if (action === 'adjust-stock') openStockAdjust(id);
    else if (action === 'adjust-stock-picker') { const p = store.products[0]; if (p) openStockAdjust(p.id); }
    else if (action === 'bulk-stock-count') openStockBulkCount();
    else if (action === 'inventory-low') { searchTerms.inventory = ''; render(); const first = lowStockProducts()[0]; if (first) openStockAdjust(first.id); }
    else if (action === 'discount') showDiscount();
    else if (action === 'scan') showScan();
    else if (action === 'start-camera-scan') startScanCamera(button);
    else if (action === 'open-export') openExportDialog();
    else if (action === 'export-dataset') {
      const dataset = modal.querySelector('#export-dataset')?.value || '';
      const from = modal.querySelector('#export-from')?.value || '';
      const to = modal.querySelector('#export-to')?.value || '';
      const warehouseId = modal.querySelector('#export-warehouse')?.value || '';
      if (from && to && from > to) return toast('Khoảng ngày chưa hợp lệ', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.', 'error');
      closeModal();
      exportCsv(dataset, from, to, button, warehouseId);
    }
    else if (action === 'export-csv') exportCsv(button.dataset.dataset || 'products', '', '', button);
    else if (action === 'export-customers') exportCsv('customers', '', '', button);
    else if (action === 'settings-tab') { modal.querySelectorAll('.settings-tab').forEach(function (el) { el.classList.toggle('active', el === button); }); }
    else if (action === 'archive-product') archiveProduct(id);
    else if (action === 'new-staff-invite') openStaffInvite();
    else if (action === 'save-staff-member') saveStaffMember(id);
    else if (action === 'resend-staff-invite') resendStaffInvite(id);
    else if (action === 'revoke-staff-invite') revokeStaffInvite(id);
    else if (action === 'reload-staff') { closeModal(); loadStaffPage(); }
    else if (action === 'reload-audit') loadAuditEvents(null, auditState.offset);
    else if (action === 'audit-page') loadAuditEvents(null, Number(button.dataset.offset) || 0);
    else if (action === 'finance-filter') { const type = button.dataset.filter; const rows = store.cashbook.filter(function (m) { return m.type === type; }); modalForm('Sổ quỹ đã lọc', type === 'in' ? 'Phiếu thu' : 'Phiếu chi', `<section class='panel'><div class='table-wrap'><table class='data-table'><thead><tr><th>Khoản mục</th><th>Thời gian</th><th class='text-right'>Số tiền</th></tr></thead><tbody>${rows.map(function (m) { return `<tr><td>${esc(m.category)}</td><td>${humanDate(m.createdAt, true)}</td><td class='text-right'>${moneyVndText(m.amountVnd)}</td></tr>`; }).join('')}</tbody></table></div></section>`, 'Đóng', true); }
    else if (action === 'open-upgrade') showModal('Slink Pro', 'Một số dịch vụ nâng cao cần được cấu hình trước khi sử dụng.', `<div class='notice-item'><span>✨</span><span><strong>Đang dùng bản trải nghiệm</strong><small>Đồng bộ khi mất mạng, kết nối thanh toán và sao lưu tự động cần máy chủ và nhà cung cấp tương ứng.</small></span></div>`, `<button class='btn btn-primary' data-action='close-modal'>Đã hiểu</button>`);
  });

  document.addEventListener('input', function (event) {
    if (event.target.matches('[data-tender-amount]')) { updateCheckoutTenderSummary(event.target.form); return; }
    if (event.target.matches('[data-purchase-quantity],[data-purchase-cost]')) { updateReceivePurchaseTotal(event.target.form); return; }
    if (event.target.matches('[data-order-quantity],[data-order-cost]')) { updatePurchaseOrderTotal(event.target.form); return; }
    if (event.target.matches('[data-receipt-quantity]')) { updatePurchaseOrderReceiptTotal(event.target.form); return; }
    const id = event.target.id;
    if (event.target.matches('[data-channel-order-quantity],[data-channel-order-price]')) {
      updateChannelOrderTotal(event.target.form);
      return;
    }
    if (id === 'channel-order-mapping-search') {
      const query = event.target.value.normalize('NFKC').trim();
      const profileId = document.getElementById('channel-order-profile-id')?.value;
      window.clearTimeout(channelOrderSearchTimer);
      channelOrderSearchTimer = window.setTimeout(function () { loadChannelOrderCatalog(profileId, query); }, 250);
      return;
    }
    if (id === 'channel-product-search') {
      const query = event.target.value.trim();
      window.clearTimeout(channelProductSearchTimer);
      channelProductSearchTimer = window.setTimeout(function () { loadChannelProductOptions(query, ''); }, 180);
      return;
    }
    if (id === 'product-search') {
      searchTerms.products = event.target.value;
      const query = searchTerms.products;
      const start = event.target.selectionStart;
      window.clearTimeout(productSearchTimer);
      productSearchTimer = window.setTimeout(function () {
        loadProductsPage(query, 0).then(function () {
          const next = document.getElementById(id);
          if (next) { next.focus(); next.setSelectionRange(start, start); }
        });
      }, 250);
    }
    else if (id === 'order-search') {
      searchTerms.orders = event.target.value;
      const query = searchTerms.orders;
      const start = event.target.selectionStart;
      window.clearTimeout(productSearchTimer);
      productSearchTimer = window.setTimeout(function () {
        loadOrdersPage(query, 0).then(function () { if (page === 'orders') render(); const next = document.getElementById(id); if (next) { next.focus(); next.setSelectionRange(start, start); } });
      }, 250);
    }
    else if (id === 'customer-search') {
      searchTerms.customers = event.target.value;
      const query = searchTerms.customers;
      const start = event.target.selectionStart;
      window.clearTimeout(customerSearchTimer);
      customerSearchTimer = window.setTimeout(function () {
        loadCustomersPage(query, 0).then(function () { if (page === 'customers') render(); const next = document.getElementById(id); if (next) { next.focus(); next.setSelectionRange(start, start); } });
      }, 250);
    }
    else if (id === 'customer-tag-filter') {
      customerTagFilter = event.target.value;
      const start = event.target.selectionStart;
      window.clearTimeout(customerSearchTimer);
      customerSearchTimer = window.setTimeout(function () {
        loadCustomersPage(searchTerms.customers, 0).then(function () {
          if (page === 'customers') render();
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
        window.clearTimeout(customerSearchTimer);
        return;
      }
      event.target.removeAttribute('aria-invalid');
      if (error) { error.textContent = ''; error.hidden = true; }
      customerMinSpentVnd = normalized;
      window.clearTimeout(customerSearchTimer);
      customerSearchTimer = window.setTimeout(function () {
        loadCustomersPage(searchTerms.customers, 0).then(function () {
          if (page === 'customers') render();
          const next = document.getElementById(id);
          if (next) next.focus();
        });
      }, 250);
    }
    else if (id === 'inventory-search') { searchTerms.inventory = event.target.value; const query = searchTerms.inventory; const start = event.target.selectionStart; window.clearTimeout(productSearchTimer); productSearchTimer = window.setTimeout(function () { loadInventoryPage(query, 0).then(function () { const next = document.getElementById(id); if (next) { next.focus(); next.setSelectionRange(start, start); } }); }, 250); }
    else if (event.target.matches('[data-purchase-search]')) {
      const query = event.target.value.trim();
      const requestNumber = ++purchaseProductRequestNumber;
      const readGeneration = modalGeneration;
      const lineIndex = event.target.dataset.index;
      window.clearTimeout(purchaseProductSearchTimer);
      purchaseProductSearchTimer = window.setTimeout(async function () {
        try {
          const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/products?limit=100&q=${encodeURIComponent(query)}`);
          if (requestNumber !== purchaseProductRequestNumber || readGeneration !== modalGeneration || modal.hidden) return;
          const products = result.products.map(mapProduct);
          const row = modal.querySelector(`[data-purchase-line][data-index="${lineIndex}"]`);
          const select = row && row.querySelector('[data-purchase-product]');
          if (!select) return;
          select.innerHTML = products.map(function (product, index) { return `<option value='${product.id}' data-cost='${product.cost}' ${index === 0 ? 'selected' : ''}>${esc(product.name)} · ${esc(product.sku)}</option>`; }).join('');
          const selected = products[0];
          const cost = row.querySelector('[data-purchase-cost]');
          if (selected && cost) cost.value = String(selected.cost);
          updateReceivePurchaseTotal(modal.querySelector('[data-form="receive"]'));
          if (!products.length) select.innerHTML = `<option value=''>Không tìm thấy sản phẩm</option>`;
        } catch (error) {
          if (readGeneration !== modalGeneration || modal.hidden) return;
          if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
          else toast('Chưa tìm được sản phẩm', error.message, 'error');
        }
      }, 250);
    }
    else if (event.target.matches('[data-order-search]')) {
      const query = event.target.value.trim();
      const requestNumber = ++purchaseProductRequestNumber;
      const readGeneration = modalGeneration;
      const lineIndex = event.target.dataset.index;
      window.clearTimeout(purchaseProductSearchTimer);
      purchaseProductSearchTimer = window.setTimeout(async function () {
        try {
          const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/products?limit=100&q=${encodeURIComponent(query)}`);
          if (requestNumber !== purchaseProductRequestNumber || readGeneration !== modalGeneration || modal.hidden) return;
          const row = modal.querySelector(`[data-order-line][data-index="${lineIndex}"]`);
          const select = row && row.querySelector('[data-order-product]');
          if (!select) return;
          const products = result.products.map(mapProduct);
          select.innerHTML = products.map(function (product, index) { return `<option value='${product.id}' data-cost='${product.cost}' ${index === 0 ? 'selected' : ''}>${esc(product.name)} · ${esc(product.sku)}</option>`; }).join('') || `<option value=''>Không tìm thấy sản phẩm</option>`;
          const selected = products[0];
          const cost = row.querySelector('[data-order-cost]');
          if (selected && cost) cost.value = String(selected.cost);
          updatePurchaseOrderTotal(modal.querySelector('[data-form="purchase-order"]'));
        } catch (error) {
          if (readGeneration !== modalGeneration || modal.hidden) return;
          if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
          else toast('Chưa tìm được sản phẩm', error.message, 'error');
        }
      }, 250);
    }
    else if (id === 'pos-search') {
      const query = event.target.value.trim();
      const requestNumber = ++posSearchRequestNumber;
      window.clearTimeout(posSearchTimer);
      posSearchTerm = query;
      if (!query) { posProducts = store.products.slice(); const list = document.getElementById('pos-products'); if (list) list.innerHTML = filteredProducts('', categoryFilter, posProducts).filter(function (p) { return !p.inventoryTracked || p.stock > 0; }).map(function (p) { return `<button class='pos-product' data-action='add-cart' data-id='${p.id}'><span class='product-thumb ${p.tone || 'product-sage'}'>${esc(p.emoji || '📦')}</span><span class='pos-stock'>${p.inventoryTracked ? `Còn ${number(p.stock)}` : 'Không theo dõi tồn'}</span><strong>${esc(p.name)}</strong><small>${esc(p.sku)}</small><span class='pos-price'>${money(p.price)}</span></button>`; }).join('') || `<div class='panel empty-state' style='grid-column:1/-1'><strong>Chưa có sản phẩm để bán</strong><span>Thêm sản phẩm hoặc nhập kho mặt hàng có theo dõi tồn.</span></div>`; }
      else {
        const list = document.getElementById('pos-products');
        if (list) list.innerHTML = `<div class='panel empty-state' style='grid-column:1/-1'>Đang tìm trong danh mục…</div>`;
        posSearchTimer = window.setTimeout(async function () {
          try {
            const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/products?limit=100&q=${encodeURIComponent(query)}${posWarehouseParam()}`);
            if (requestNumber !== posSearchRequestNumber || page !== 'pos') return;
            posProducts = result.products.map(mapProduct);
            const next = document.getElementById('pos-products');
            if (next) next.innerHTML = filteredProducts(query, categoryFilter, posProducts).filter(function (p) { return !p.inventoryTracked || p.stock > 0; }).map(function (p) { return `<button class='pos-product' data-action='add-cart' data-id='${p.id}'><span class='product-thumb ${p.tone || 'product-sage'}'>${esc(p.emoji || '📦')}</span><span class='pos-stock'>${p.inventoryTracked ? `Còn ${number(p.stock)}` : 'Không theo dõi tồn'}</span><strong>${esc(p.name)}</strong><small>${esc(p.sku)}</small><span class='pos-price'>${money(p.price)}</span></button>`; }).join('') || `<div class='panel empty-state' style='grid-column:1/-1'><strong>Không có sản phẩm phù hợp</strong><span>Thử từ khóa khác.</span></div>`;
          } catch (error) {
            if (requestNumber !== posSearchRequestNumber) return;
            if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
            else if (document.getElementById('pos-products')) document.getElementById('pos-products').innerHTML = `<div class='panel empty-state' style='grid-column:1/-1'>${esc(error.message)}</div>`;
          }
        }, 180);
      }
    }
    else if (id === 'pick-customer-search') {
      const query = event.target.value.trim();
      const requestNumber = ++pickerCustomerRequestNumber;
      window.clearTimeout(pickerCustomerSearchTimer);
      pickerCustomerSearchTimer = window.setTimeout(async function () {
        try {
          const result = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/customers?limit=100&q=${encodeURIComponent(query)}`);
          if (requestNumber !== pickerCustomerRequestNumber || modal.hidden) return;
          const customers = result.customers.map(mapCustomer);
          const options = document.getElementById('customer-options');
          if (options) options.innerHTML = customers.map(function (customer) { return `<button class='customer-option' data-action='select-customer' data-id='${customer.id}'><span class='avatar' style='width:26px;height:26px'>${esc(initials(customer.name))}</span><span>${esc(customer.name)}</span><small>${esc(customer.phone)}</small></button>`; }).join('') || `<div class='empty-state'>Không tìm thấy khách hàng phù hợp.</div>`;
        } catch (error) {
          if (error.status === 401) showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
          else toast('Chưa tìm được khách hàng', error.message, 'error');
        }
      }, 180);
    }
  });

  document.addEventListener('change', function (event) {
    if (event.target.id === 'channel-order-profile-id') {
      const search = document.getElementById('channel-order-mapping-search');
      if (search) search.value = '';
      channelOrderMappingOptions = [];
      loadChannelOrderCatalog(event.target.value, '');
      return;
    }
    if (event.target.matches('[data-channel-order-mapping]')) {
      const price = event.target.closest('[data-channel-order-line]')?.querySelector('[data-channel-order-price]');
      if (price) price.value = event.target.selectedOptions[0]?.dataset.price || '0';
      updateChannelOrderTotal(event.target.form);
      return;
    }
    if (event.target.matches('[data-member-role]')) {
      const scope = document.querySelector(`[data-member-scope='${event.target.dataset.memberRole}']`);
      if (scope) scope.hidden = event.target.value !== 'stockkeeper';
      return;
    }
    if (event.target.matches('[data-member-scope-mode]')) {
      const warehouseList = document.querySelector(`[data-member-warehouse-list='${event.target.dataset.memberScopeMode}']`);
      if (warehouseList) warehouseList.hidden = event.target.value !== 'selected';
      return;
    }
    if (event.target.matches('[data-tender-method]')) { updateCheckoutTenderSummary(event.target.form); return; }
    if (event.target.id === 'customer-saved-segment-select') {
      const id = event.target.value;
      if (!id) {
        selectedCustomerSavedSegmentId = '';
        render();
        const next = document.getElementById('customer-saved-segment-select');
        if (next) next.focus();
        return;
      }
      const segment = customerSavedSegments.find(function (item) { return item.id === id; });
      if (!segment) return;
      selectedCustomerSavedSegmentId = segment.id;
      customerSegmentFilter = segment.criteria.segment || '';
      customerTagFilter = segment.criteria.tag || '';
      customerMinSpentVnd = segment.criteria.minSpentVnd || '';
      loadCustomersPage(searchTerms.customers, 0).then(function () {
        if (page === 'customers') render();
        const next = document.getElementById('customer-saved-segment-select');
        if (next) next.focus();
      });
      return;
    }
    if (event.target.id === 'customer-segment-filter') {
      customerSegmentFilter = event.target.value;
      window.clearTimeout(customerSearchTimer);
      loadCustomersPage(searchTerms.customers, 0).then(function () {
        if (page === 'customers') render();
        const next = document.getElementById('customer-segment-filter');
        if (next) next.focus();
      });
      return;
    }
    if (event.target.id === 'customer-import-file') {
      const readNumber = ++customerImportReadNumber;
      customerImportReading = false;
      customerImportRows = [];
      customerImportErrors = [];
      customerImportConflict = '';
      customerImportPreviewValid = false;
      const file = event.target.files && event.target.files[0];
      if (!file) { renderCustomerImportPreview(); return; }
      if (file.size > 500000) {
        customerImportErrors = ['Tệp CSV vượt quá 500 KB. Hãy chia tệp thành các phần nhỏ hơn.'];
        renderCustomerImportPreview();
        return;
      }
      customerImportReading = true;
      renderCustomerImportPreview();
      const reader = new FileReader();
      const readGeneration = modalGeneration;
      reader.onload = async function () {
        if (readGeneration !== modalGeneration || readNumber !== customerImportReadNumber || modal.hidden) return;
        const selectedFile = modal.querySelector('#customer-import-file');
        if (selectedFile) selectedFile.value = '';
        const parsed = parseCustomerImportCsv(String(reader.result || ''));
        customerImportErrors = parsed.errors;
        customerImportRows = [];
        if (parsed.errors.length) {
          customerImportReading = false;
          renderCustomerImportPreview();
          return;
        }
        await previewCustomerImport(parsed.items, readGeneration, readNumber);
      };
      reader.onerror = function () {
        if (readGeneration !== modalGeneration || readNumber !== customerImportReadNumber || modal.hidden) return;
        const selectedFile = modal.querySelector('#customer-import-file');
        if (selectedFile) selectedFile.value = '';
        customerImportReading = false;
        customerImportErrors = ['Không đọc được tệp. Hãy chọn lại CSV khách hàng.'];
        renderCustomerImportPreview();
      };
      reader.readAsText(file, 'UTF-8');
      return;
    }
    if (event.target.id === 'inventory-warehouse') {
      selectedWarehouseId = event.target.value;
      inventoryOffset = 0;
      loadInventoryPage(searchTerms.inventory, 0);
      return;
    }
    if (event.target.id === 'pos-warehouse') {
      if (cart.length || checkoutPendingPayload) return toast('Hoàn tất giỏ hàng trước', 'Kho xuất được khóa trong suốt một đơn để tồn khả dụng không thay đổi giữa chừng.', 'error');
      selectedWarehouseId = event.target.value;
      posProducts = [];
      loadProductsPage('', 0);
      return;
    }
    if (event.target.id === 'stock-bulk-count-file') {
      const readNumber = ++stockBulkCountReadNumber;
      stockBulkCountReading = false;
      stockBulkCountRows = [];
      stockBulkCountErrors = [];
      const file = event.target.files && event.target.files[0];
      if (!file) { renderStockBulkCountPreview(); return; }
      if (file.size > 500000) {
        stockBulkCountErrors = ['Tệp CSV vượt quá 500 KB. Hãy chia tệp thành các phần nhỏ hơn.'];
        renderStockBulkCountPreview();
        return;
      }
      stockBulkCountReading = true;
      renderStockBulkCountPreview();
      const reader = new FileReader();
      const readGeneration = modalGeneration;
      reader.onload = async function () {
        if (readGeneration !== modalGeneration || readNumber !== stockBulkCountReadNumber || modal.hidden) return;
        const selectedFile = modal.querySelector('#stock-bulk-count-file');
        if (selectedFile) selectedFile.value = '';
        const parsed = parseStockBulkCountCsv(String(reader.result || ''));
        stockBulkCountErrors = parsed.errors;
        stockBulkCountRows = [];
        if (parsed.errors.length) {
          stockBulkCountReading = false;
          renderStockBulkCountPreview();
          return;
        }
        try {
          const previewResult = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/stock-adjustments/bulk/preview`, {
            method: 'POST', body: { items: parsed.items, warehouseId: selectedWarehouseId },
          });
          if (readGeneration !== modalGeneration || readNumber !== stockBulkCountReadNumber || modal.hidden) return;
          stockBulkCountReading = false;
          if (!previewResult.valid) stockBulkCountErrors = [previewResult.conflict || 'Số tồn đã thay đổi hoặc tệp chưa hợp lệ.'];
          else if (!Array.isArray(previewResult.items) || previewResult.items.length !== parsed.items.length) stockBulkCountErrors = ['Máy chủ chưa trả đủ kết quả đối chiếu. Chưa có thay đổi nào được lưu.'];
          else stockBulkCountRows = previewResult.items;
        } catch (error) {
          if (readGeneration !== modalGeneration || readNumber !== stockBulkCountReadNumber || modal.hidden) return;
          stockBulkCountReading = false;
          stockBulkCountErrors = [error.status === 401
            ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi chọn tệp để kiểm tra.'
            : `Chưa đối chiếu được số đếm với cửa hàng: ${error.message} Chưa có thay đổi nào được lưu.`];
        }
        renderStockBulkCountPreview();
      };
      reader.onerror = function () {
        if (readGeneration !== modalGeneration || readNumber !== stockBulkCountReadNumber || modal.hidden) return;
        const selectedFile = modal.querySelector('#stock-bulk-count-file');
        if (selectedFile) selectedFile.value = '';
        stockBulkCountReading = false;
        stockBulkCountErrors = ['Không đọc được tệp. Hãy chọn lại CSV đã xuất từ Slink.'];
        renderStockBulkCountPreview();
      };
      reader.readAsText(file, 'UTF-8');
      return;
    }
    if (event.target.id === 'product-bulk-update-file') {
      const readNumber = ++productBulkUpdateReadNumber;
      productBulkUpdateReading = false;
      productBulkUpdateRows = [];
      productBulkUpdateErrors = [];
      const file = event.target.files && event.target.files[0];
      if (!file) { renderProductBulkUpdatePreview(); return; }
      if (file.size > 500000) {
        productBulkUpdateErrors = ['Tệp CSV vượt quá 500 KB. Hãy chia tệp thành các phần nhỏ hơn.'];
        renderProductBulkUpdatePreview();
        return;
      }
      productBulkUpdateReading = true;
      renderProductBulkUpdatePreview();
      const reader = new FileReader();
      const readGeneration = modalGeneration;
      reader.onload = async function () {
        if (readGeneration !== modalGeneration || readNumber !== productBulkUpdateReadNumber || modal.hidden) return;
        const selectedFile = modal.querySelector('#product-bulk-update-file');
        if (selectedFile) selectedFile.value = '';
        const parsed = parseProductBulkUpdateCsv(String(reader.result || ''));
        productBulkUpdateErrors = parsed.errors;
        productBulkUpdateRows = [];
        if (parsed.errors.length) {
          productBulkUpdateReading = false;
          renderProductBulkUpdatePreview();
          return;
        }
        try {
          const previewResult = await apiRequest(`/api/stores/${encodeURIComponent(store.id)}/products/bulk-update/preview`, {
            method: 'POST',
            body: { items: parsed.items.map(function (item) { const { before, ...requestItem } = item; return requestItem; }) },
          });
          if (readGeneration !== modalGeneration || readNumber !== productBulkUpdateReadNumber || modal.hidden) return;
          productBulkUpdateReading = false;
          if (!previewResult.valid) productBulkUpdateErrors = [previewResult.conflict || 'Sản phẩm đã thay đổi hoặc bị trùng trong danh mục.'];
          else if (Array.isArray(previewResult.items) && previewResult.items.length === parsed.items.length) productBulkUpdateRows = previewResult.items;
          else productBulkUpdateErrors = ['Máy chủ trả về bản xem trước không đầy đủ. Chưa có thay đổi nào được lưu; hãy chọn lại tệp để thử lại.'];
        } catch (error) {
          if (readGeneration !== modalGeneration || readNumber !== productBulkUpdateReadNumber || modal.hidden) return;
          productBulkUpdateReading = false;
          productBulkUpdateErrors = [error.status === 401
            ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi chọn tệp để kiểm tra.'
            : `Chưa đối chiếu được thay đổi với cửa hàng: ${error.message} Hãy chọn lại CSV để thử lại. Chưa có thay đổi nào được lưu.`];
        }
        renderProductBulkUpdatePreview();
      };
      reader.onerror = function () {
        if (readGeneration !== modalGeneration || readNumber !== productBulkUpdateReadNumber || modal.hidden) return;
        const selectedFile = modal.querySelector('#product-bulk-update-file');
        if (selectedFile) selectedFile.value = '';
        productBulkUpdateReading = false;
        productBulkUpdateErrors = ['Không đọc được tệp. Hãy chọn lại CSV đã xuất từ Slink.'];
        renderProductBulkUpdatePreview();
      };
      reader.readAsText(file, 'UTF-8');
      return;
    }
    if (event.target.id === 'product-import-warehouse') {
      if (!productImportPending && productImportSourceRows.length) previewProductImportAtWarehouse(productImportSourceRows);
      else renderProductImportPreview();
      return;
    }
    if (event.target.id === 'product-import-file') {
      const readNumber = ++productImportReadNumber;
      productImportReading = false;
      productImportRows = [];
      productImportErrors = [];
      productImportSourceRows = [];
      productImportVerifiedWarehouseId = '';
      productImportWarehouseName = '';
      const file = event.target.files && event.target.files[0];
      if (!file) { renderProductImportPreview(); return; }
      if (file.size > 500000) {
        productImportErrors = ['Tệp CSV vượt quá 500 KB. Hãy chia tệp thành các phần nhỏ hơn.'];
        renderProductImportPreview();
        return;
      }
      productImportReading = true;
      renderProductImportPreview();
      const reader = new FileReader();
      const readGeneration = modalGeneration;
      reader.onload = async function () {
        if (readGeneration !== modalGeneration || readNumber !== productImportReadNumber || modal.hidden) return;
        const parsed = parseProductImportCsv(String(reader.result || ''));
        productImportErrors = parsed.errors;
        productImportRows = [];
        productImportSourceRows = parsed.items;
        if (parsed.errors.length) {
          productImportReading = false;
          renderProductImportPreview();
          return;
        }
        await previewProductImportAtWarehouse(parsed.items);
      };
      reader.onerror = function () {
        if (readGeneration !== modalGeneration || readNumber !== productImportReadNumber || modal.hidden) return;
        productImportReading = false;
        productImportErrors = ['Không đọc được tệp. Hãy chọn lại tệp CSV.'];
        renderProductImportPreview();
      };
      reader.readAsText(file, 'UTF-8');
      return;
    }
    if (event.target.id === 'staff-invite-role') {
      const help = modal.querySelector('.staff-role-help');
      if (help) help.textContent = staffRoleDescription(event.target.value);
    }
    if (event.target.matches('[data-purchase-product]')) {
      const row = event.target.closest('[data-purchase-line]');
      const selectedCost = event.target.selectedOptions[0]?.dataset.cost;
      const product = productById(event.target.value);
      const cost = row && row.querySelector('[data-purchase-cost]');
      if (cost && !loadPendingPurchase()) cost.value = String(selectedCost ?? (product ? product.cost : ''));
      updateReceivePurchaseTotal(modal.querySelector('[data-form="receive"]'));
    }
    if (event.target.matches('[data-order-product]')) {
      const row = event.target.closest('[data-order-line]');
      const cost = row && row.querySelector('[data-order-cost]');
      const selectedCost = event.target.selectedOptions[0]?.dataset.cost;
      if (cost && selectedCost !== undefined) cost.value = String(selectedCost);
      updatePurchaseOrderTotal(modal.querySelector('[data-form="purchase-order"]'));
    }
  });

  document.addEventListener('submit', function (event) {
    const authForm = event.target.closest('form[data-auth-form]');
    if (authForm) { event.preventDefault(); submitAuth(authForm); return; }
    const form = event.target.closest('form[data-form]'); if (!form) return; event.preventDefault(); const type = form.dataset.form;
    if (type === 'channel-filter') {
      channelState.query = String(new FormData(form).get('q') || '').trim().slice(0, 120);
      loadChannelCatalog(0);
    }
    else if (type === 'channel-order-filter') {
      const data = new FormData(form);
      channelState.orderQuery = String(data.get('q') || '').trim().slice(0, 120);
      channelState.orderStatus = String(data.get('status') || '');
      loadChannelOrders(0);
    }
    else if (type === 'channel-profile') saveChannelProfile(form);
    else if (type === 'channel-mapping') saveChannelMapping(form);
    else if (type === 'channel-archive') saveChannelArchive(form);
    else if (type === 'channel-order-create') createChannelOrder(form);
    else if (type === 'channel-order-status') saveChannelOrderStatus(form);
    else if (type === 'product') saveProduct(form);
    else if (type === 'product-variants') saveProductVariantGroup(form);
    else if (type === 'product-variant-add') saveProductVariantAdd(form);
    else if (type === 'promotion-create') savePromotion(form);
    else if (type === 'audit-filter') {
      const data = new FormData(form);
      const filters = { from: String(data.get('from') || ''), to: String(data.get('to') || ''), q: String(data.get('q') || '').trim().slice(0, 100) };
      if (filters.from && filters.to && filters.from > filters.to) return toast('Khoảng ngày chưa hợp lệ', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.', 'error');
      loadAuditEvents(filters, 0);
    }
    else if (type === 'customer') saveCustomer(form);
    else if (type === 'customer-saved-segment') saveCustomerSegment(form);
    else if (type === 'customer-saved-segment-delete') deleteCustomerSegment(form);
    else if (type === 'customer-tag') changeCustomerTag(form.dataset.id, 'add', String(new FormData(form).get('tag') || '').trim());
    else if (type === 'supplier') saveSupplier(form);
    else if (type === 'order-note') saveOrderNote(form);
    else if (type === 'order-tag') changeOrderTag(form.dataset.id, 'add', String(new FormData(form).get('tag') || '').trim());
    else if (type === 'void-order') saveVoidOrder(form);
    else if (type === 'checkout') createSale(form);
    else if (type === 'return') saveReturn(form);
    else if (type === 'payment') savePayment(form);
    else if (type === 'customer-payment') saveCustomerPayment(form);
    else if (type === 'customer-import') saveCustomerImport(form);
    else if (type === 'product-import') saveProductImport(form);
    else if (type === 'product-bulk-update') saveProductBulkUpdate(form);
    else if (type === 'stock-bulk-count') saveStockBulkCount(form);
    else if (type === 'cart-quantity') saveCartQuantity(form);
    else if (type === 'adjust-stock') adjustStock(form);
    else if (type === 'receive') receiveStock(form);
    else if (type === 'purchase-order') savePurchaseOrder(form);
    else if (type === 'purchase-order-receipt') receivePurchaseOrder(form);
    else if (type === 'purchase-order-cancel') cancelPurchaseOrder(form);
    else if (type === 'warehouse-create') saveWarehouse(form);
    else if (type === 'warehouse-archive') saveWarehouseArchive(form);
    else if (type === 'warehouse-transfer-create') saveWarehouseTransfer(form);
    else if (type === 'warehouse-transfer-receipt') saveWarehouseTransferReceipt(form);
    else if (type === 'warehouse-transfer-cancel') saveWarehouseTransferCancel(form);
    else if (type === 'supplier-payment') saveSupplierPayment(form);
    else if (type === 'cash') saveCash(form);
    else if (type === 'cash-session-open') saveCashSessionOpen(form);
    else if (type === 'cash-session-close') saveCashSessionClose(form);
    else if (type === 'settings') saveSettings(form);
    else if (type === 'staff-invite') saveStaffInvitation(form);
    else if (type === 'scan') addByCode(form);
    else if (type === 'discount') { if (checkoutPendingPayload) return toast('Đang chờ xác nhận đơn', 'Hãy kiểm tra đơn đang chờ trước khi thay đổi giảm giá.', 'error'); cart.discount = Math.max(0, Math.min(cartTotals().subtotal, Number(new FormData(form).get('discount')) || 0)); closeModal(); render(); toast('Đã áp dụng giảm giá', money(cart.discount)); }
  });

  backdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', function (event) {
    keepModalFocus(event);
    if (event.key === 'Escape') { closeModal(); const drawer = document.getElementById('drawer-cart'); if (drawer) drawer.classList.remove('open'); }
  });
  document.addEventListener('click', function (event) { const drawer = document.getElementById('drawer-cart'); if (drawer && event.target === drawer) drawer.classList.remove('open'); });
  window.addEventListener('online', renderShell); window.addEventListener('offline', renderShell);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopScanCamera(); });
  window.addEventListener('pagehide', stopScanCamera);
  boot();
})();
