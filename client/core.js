(function () {
  'use strict';
  const S = window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {}, charts: {} };

  S.dom.root = document.getElementById('view');
  S.dom.authRoot = document.getElementById('auth-screen');
  S.dom.appShell = document.querySelector('.app-shell');
  S.dom.modal = document.getElementById('modal');
  S.dom.backdrop = document.getElementById('modal-backdrop');
  S.dom.toastStack = document.getElementById('toast-stack');
  S.dom.pendingCompatibilityWarning = document.getElementById('pending-compatibility-warning');

  const FONT_SCALE_STEPS = [90, 100, 112, 125];
  S.fn.loadFontScale = function loadFontScale() {
    try {
      const saved = Number(window.localStorage.getItem('slink_font_scale_pct') || 100);
      return FONT_SCALE_STEPS.includes(saved) ? saved : 100;
    } catch (_) {
      return 100;
    }
  };
  S.fn.syncFontScaleButtons = function syncFontScaleButtons() {
    const pct = Number(S.state.fontScalePct || 100);
    const min = FONT_SCALE_STEPS[0];
    const max = FONT_SCALE_STEPS[FONT_SCALE_STEPS.length - 1];
    document.querySelectorAll('[data-action="font-decrease"]').forEach(function (btn) {
      btn.disabled = pct <= min;
      btn.title = `Giảm cỡ chữ (hiện tại ${pct}%)`;
    });
    document.querySelectorAll('[data-action="font-increase"]').forEach(function (btn) {
      btn.disabled = pct >= max;
      btn.title = `Tăng cỡ chữ (hiện tại ${pct}%)`;
    });
  };
  S.fn.applyFontScale = function applyFontScale(rawPct) {
    const pct = FONT_SCALE_STEPS.includes(Number(rawPct)) ? Number(rawPct) : 100;
    S.state.fontScalePct = pct;
    document.documentElement.dataset.fontScale = String(pct);
    document.documentElement.style.setProperty('--font-scale', String(pct / 100));
    document.documentElement.style.fontSize = (16 * pct / 100) + 'px';
    try { window.localStorage.setItem('slink_font_scale_pct', String(pct)); } catch (_) {}
    S.fn.syncFontScaleButtons();
    return pct;
  };
  S.fn.stepFontScale = function stepFontScale(delta) {
    const current = S.state.fontScalePct || S.fn.loadFontScale();
    const idx = Math.max(0, FONT_SCALE_STEPS.indexOf(current));
    const nextIdx = Math.max(0, Math.min(FONT_SCALE_STEPS.length - 1, idx + delta));
    const next = S.fn.applyFontScale(FONT_SCALE_STEPS[nextIdx]);
    S.fn.toast?.('Cỡ chữ giao diện', `${next}%`);
  };
  S.fn.applyFontScale(S.fn.loadFontScale());
  S.state.ROLE_CAPABILITIES = {
    owner: {
      posSell: true, posDiscount: true, viewOrders: true, voidOrReturnOrder: true,
      viewProducts: true, editProducts: true, viewCostPrice: true, manageInventory: true,
      viewFinance: true, recordCashbook: true, operateCashShift: true, viewReports: true,
      manageCustomers: true, manageStaff: true, manageSettings: true, viewAudit: true, exportData: true,
    },
    manager: {
      posSell: true, posDiscount: true, viewOrders: true, voidOrReturnOrder: true,
      viewProducts: true, editProducts: true, viewCostPrice: true, manageInventory: true,
      viewFinance: true, recordCashbook: true, operateCashShift: true, viewReports: true,
      manageCustomers: true, manageStaff: false, manageSettings: true, viewAudit: true, exportData: true,
    },
    cashier: {
      posSell: true, posDiscount: true, viewOrders: true, voidOrReturnOrder: false,
      viewProducts: true, editProducts: false, viewCostPrice: false, manageInventory: false,
      viewFinance: true, recordCashbook: false, operateCashShift: true, viewReports: false,
      manageCustomers: true, manageStaff: false, manageSettings: false, viewAudit: false, exportData: false,
    },
    stockkeeper: {
      posSell: false, posDiscount: false, viewOrders: false, voidOrReturnOrder: false,
      viewProducts: true, editProducts: true, viewCostPrice: true, manageInventory: true,
      viewFinance: false, recordCashbook: false, operateCashShift: false, viewReports: false,
      manageCustomers: false, manageStaff: false, manageSettings: false, viewAudit: false, exportData: false,
    },
    accountant: {
      posSell: false, posDiscount: false, viewOrders: true, voidOrReturnOrder: false,
      viewProducts: true, editProducts: false, viewCostPrice: true, manageInventory: false,
      viewFinance: true, recordCashbook: true, operateCashShift: false, viewReports: true,
      manageCustomers: true, manageStaff: false, manageSettings: false, viewAudit: false, exportData: true,
    },
    affiliate: {
      posSell: false, posDiscount: false, viewOrders: false, voidOrReturnOrder: false,
      viewProducts: false, editProducts: false, viewCostPrice: false, manageInventory: false,
      viewFinance: false, recordCashbook: false, operateCashShift: false, viewReports: false,
      manageCustomers: false, manageStaff: false, manageSettings: false, viewAudit: false, exportData: false,
    },
  };

  S.state.GRANULAR_PERM_KEYS = [
    'view_cost_price',
    'pos_max_discount_pct',
    'void_or_return_order',
    'record_cashbook',
    'view_reports',
    'edit_products',
  ];

  S.state.CAP_TO_GRANULAR = {
    viewCostPrice: 'view_cost_price',
    view_cost_price: 'view_cost_price',
    voidOrReturnOrder: 'void_or_return_order',
    void_or_return_order: 'void_or_return_order',
    recordCashbook: 'record_cashbook',
    record_cashbook: 'record_cashbook',
    viewReports: 'view_reports',
    view_reports: 'view_reports',
    editProducts: 'edit_products',
    edit_products: 'edit_products',
    pos_max_discount_pct: 'pos_max_discount_pct',
  };

  S.state.GRANULAR_TO_CAP = {
    view_cost_price: 'viewCostPrice',
    void_or_return_order: 'voidOrReturnOrder',
    record_cashbook: 'recordCashbook',
    view_reports: 'viewReports',
    edit_products: 'editProducts',
  };

  S.state.ROLE_DEFAULT_DISCOUNT_PCT = {
    owner: 100,
    manager: 100,
    cashier: 10,
    stockkeeper: 0,
    accountant: 0,
    affiliate: 0,
  };

  S.state.page = 'pos';
  S.state.taskFocusRoute = '';
  S.state.authSession = null;
  S.state.authMode = 'login';
  S.state.invitationToken = '';
  S.state.invitationInfo = null;
  S.state.staffState = { members: [], invitations: [], warehouses: [], loading: false, error: '' };
  S.state.staffRequestNumber = 0;
  S.state.channelState = { profiles: [], mappings: [], total: 0, nextOffset: null, offset: 0, query: '', state: 'active', view: 'mappings', orders: [], orderTotal: 0, orderOffset: 0, orderNextOffset: null, orderStatus: '', orderQuery: '', orderLoading: false, orderError: '', orderRequestNumber: 0, loading: false, error: '', requestNumber: 0 };
  S.state.channelProductOptions = [];
  S.state.channelProductRequestNumber = 0;
  S.state.channelProductSearchTimer = null;
  S.state.auditState = { events: [], total: 0, nextOffset: null, offset: 0, limit: 50, loading: false, error: '', requestNumber: 0, filters: { from: '', to: '', q: '' } };
  S.state.accountSecurityState = { sessions: [], events: [], loading: false, error: '', requestNumber: 0 };
  S.state.productTotal = 0;
  S.state.purchasePacksSupported = false;
  S.state.productPackDefaultsSupported = false;
  S.state.productOffset = 0;
  S.state.productNextOffset = null;
  S.state.productLoading = false;
  S.state.productError = '';
  S.state.productRequestNumber = 0;
  S.state.productPriceHistoryRequestNumber = 0;
  S.state.productPriceHistoryState = { productId: '', currentPriceVnd: null, history: [], nextCursor: null, loading: false, error: '', historyStartsAtMigrationBaseline: false };
  S.state.productSearchTimer = null;
  S.state.purchaseProductSearchTimer = null;
  S.state.purchaseProductRequestNumber = 0;
  S.state.receiveProductSearches = new WeakMap();
  S.state.inventoryTotal = 0;
  S.state.inventoryOffset = 0;
  S.state.inventoryNextOffset = null;
  S.state.inventoryRequestNumber = 0;
  S.state.inventoryLoading = false;
  S.state.inventoryError = '';
  S.state.inventorySummary = { total: 0, low: 0, out: 0, stockValueVnd: 0 };
  S.state.inventoryProducts = [];
  S.state.inventoryWarehouseId = null;
  S.state.inventoryStockFilter = 'all';
  S.state.inventoryLoadedFilter = 'all';
  S.state.inventoryLoadedQuery = '';
  S.state.warehouses = [];
  S.state.selectedWarehouseId = '';
  S.state.warehouseTransfers = [];
  S.state.warehouseRequestNumber = 0;
  S.state.warehouseLoading = false;
  S.state.warehouseError = '';
  S.state.financeLoading = false;
  S.state.financeDataReady = false;
  S.state.financeError = '';
  S.state.financeRequestNumber = 0;
  S.state.supplierBalanceRequestNumber = 0;
  S.state.financeMovementTotal = 0;
  S.state.purchaseHistory = [];
  S.state.purchaseOrders = [];
  S.state.financeSummary = { todayInVnd: '0', todayOutVnd: '0', customerDebtVnd: '0', customerDebtCount: 0, supplierPayableVnd: '0' };
  S.state.cashRegisterState = { session: null, lastClosed: null, recentClosed: [], canOperate: false };
  S.state.cashRegisterError = '';
  S.state.financeTopCustomers = [];
  S.state.financeReceivables = { rows: [], total: 0, nextOffset: null, offset: 0, query: '', ready: false, loading: false, error: '', requestNumber: 0 };
  S.state.financeReceivableSearchTimer = null;
  S.state.financeCashbook = { rows: [], balances: null, total: 0, nextOffset: null, offset: 0, filters: { fund: 'all', direction: '', kind: '', includeInPnl: '', from: '', to: '', q: '' }, ready: false, loading: false, error: '', requestNumber: 0 };
  S.state.financeCashbookSearchTimer = null;
  S.state.financeCategories = { rows: [], ready: false, loading: false, requestNumber: 0 };
  S.state.financePayables = { rows: [], total: 0, totalPayableVnd: '0', nextOffset: null, offset: 0, query: '', onlyOwing: true, ready: false, loading: false, error: '', requestNumber: 0 };
  S.state.financePayableSearchTimer = null;
  S.state.analyticsData = null;
  S.state.analyticsLoading = false;
  S.state.analyticsError = '';
  S.state.analyticsRequestNumber = 0;
  S.state.reportTab = 'eod';
  S.state.reportPreset = '7d';
  S.state.reportFrom = '';
  S.state.reportTo = '';
  S.state.onboardingDismissed = false;
  S.state.selectedProductIds = new Set();
  S.state.productDetailState = null;
  S.state.dashboardState = { data: null, loading: false, error: '', fallback: false, loadedAt: 0 };
  S.state.dashboardRequestNumber = 0;
  S.state.posCatalogStale = false;
  S.state.vietqrBrightnessActive = false;
  S.state.rapidStockCountState = { warehouseId: '', items: [], products: [], loading: false, submitting: false };
  S.state.receiveCameraActive = false;
  S.state.integrationState = { data: null, loading: false, error: '', requestNumber: 0, storeId: '' };
  S.state.customerTotal = 0;
  S.state.customerListLoaded = false;
  S.state.customerOffset = 0;
  S.state.customerNextOffset = null;
  S.state.customerRequestNumber = 0;
  S.state.customerDetailRequestNumber = 0;
  S.state.customerTagFilter = '';
  S.state.customerSegmentFilter = '';
  S.state.customerMinSpentVnd = '';
  S.state.customerAdvancedOpen = false;
  S.state.staffExpandedIds = new Set();
  S.state.customerSavedSegments = [];
  S.state.customerSavedSegmentsStoreId = '';
  S.state.selectedCustomerSavedSegmentId = '';
  S.state.customerSearchTimer = null;
  S.state.modalGeneration = 0;
  S.state.modalReturnFocus = null;
  S.state.modalEditedField = null;
  S.state.pickerCustomerRequestNumber = 0;
  S.state.pickerCustomerSearchTimer = null;
  S.state.orderTotal = 0;
  S.state.orderOffset = 0;
  S.state.orderNextOffset = null;
  S.state.orderRequestNumber = 0;
  S.state.cart = [];
  S.state.posMode = 'standard';
  S.state.posViewMode = 'grid';
  S.state.posStandardMethod = 'cash';
  S.state.posStandardNote = '';
  S.state.posBills = [{ id: 1, label: 'Đơn 1', items: [], discount: 0, customerId: '', note: '', method: 'cash' }];
  S.state.activePosBillId = 1;
  S.state.nextPosBillNumber = 2;
  S.state.posBarcodeScanState = { continuous: true, lastCode: '', lastAt: 0, busy: false };
  S.state.posDelivery = { receiverName: '', receiverPhone: '', address: '', carrier: '', collection: 'cod', note: '' };
  S.state.posFastCashInput = '';
  S.state.inventoryTab = 'stock';
  S.state.supplierReturnsList = [];
  S.state.supplierReturnsLoading = false;
  S.state.supplierReturnsError = '';
  S.state.lastImportedPrintItems = [];
  S.state.offlineConflictInspections = new Map();
  S.state.lastCompletedSale = null;
  S.state.posCustomerInlineText = '';
  S.state.posAssistantState = { data: null, loading: false, query: '', timer: 0, requestNumber: 0 };
  S.state.posRedeemPointsActive = false;
  S.state.posBundlePriorDebtActive = false;
  S.state.posSellers = [];
  S.state.posSellerId = '';
  S.state.activePosPrebillId = '';
  S.state.staffSubTab = 'members';
  S.state.payrollState = { periodMonth: new Date().toISOString().slice(0, 7), rows: [], totalEstimatedPayableVnd: '0', loading: false, error: '', requestNumber: 0 };
  S.state.radarState = { prebillAlerts: [], refundAlerts: [], shortageAlerts: [], loading: false, error: '', requestNumber: 0 };
  S.state.productCache = new Map();
  S.state.customerCache = new Map();
  S.state.orderNoteHistoryCache = new Map();
  S.state.orderNoteHistoryCursor = new Map();
  S.state.orderNoteHistoryLoading = new Set();
  S.state.posCatalog = [];
  S.state.posCatalogWarehouseId = null;
  S.state.posKnownProducts = new Map();
  S.state.posProducts = [];
  S.state.posSearchTerm = '';
  S.state.posSearchLoading = false;
  S.state.posSearchRequestNumber = 0;
  S.state.posSearchTimer = null;
  S.state.cartCustomerId = '';
  S.state.checkoutIdempotencyKey = '';
  S.state.checkoutPendingPayload = null;
  S.state.checkoutPromotion = null;
  S.state.returnPending = null;
  S.state.productImportReadNumber = 0;
  S.state.productImportReading = false;
  S.state.productImportRows = [];
  S.state.productImportSourceRows = [];
  S.state.productImportErrors = [];
  S.state.productImportPending = false;
  S.state.productImportVerifiedWarehouseId = '';
  S.state.productImportWarehouseName = '';
  S.state.customerImportReadNumber = 0;
  S.state.customerImportReading = false;
  S.state.customerImportRows = [];
  S.state.customerImportErrors = [];
  S.state.customerImportConflict = '';
  S.state.customerImportPreviewValid = false;
  S.state.customerImportBalanceTotalVnd = '0';
  S.state.productBulkUpdateReadNumber = 0;
  S.state.productBulkUpdateReading = false;
  S.state.productBulkUpdateRows = [];
  S.state.productBulkUpdateErrors = [];
  S.state.stockBulkCountReadNumber = 0;
  S.state.stockBulkCountReading = false;
  S.state.stockBulkCountRows = [];
  S.state.stockBulkCountErrors = [];
  S.state.scanCameraGeneration = 0;
  S.state.scanCameraStream = null;
  S.state.scanCameraDetector = null;
  S.state.scanCameraTimer = 0;
  S.state.scanPhotoFallbackTimer = 0;
  S.state.scanCameraRunning = false;
  S.state.scanCameraStarting = false;
  S.state.pendingCompatibilityStoreId = '';
  S.state.pendingCompatibilitySaveBlocked = false;
  S.state.categoryFilter = 'Tất cả';
  S.state.searchTerms = { products: '', orders: '', customers: '', inventory: '' };
  S.state.orderFilter = 'Tất cả';
  S.state.chartRange = '7 ngày';
  S.state.guidedTourState = { active: false, steps: [], index: 0, returnPage: 'dashboard', layer: null, lastFocused: null };
  S.state.guidedTourSeenInSessionKey = '';
  S.state.guidedTourPositionFrame = 0;

  S.state.syncBusInitialized = false;
  S.state.lastForegroundSyncAt = 0;
  S.state.offlineDisk = window.SlinkOfflineStore ? window.SlinkOfflineStore({ validateEnqueue: window.SlinkOfflineLedger?.validateEnqueue }) : null;
  S.state.offlineState = { mode: navigator.onLine ? 'online' : 'offline', cachedAt: '', storageIssue: '', preparing: false, pending: 0, conflicts: 0, syncing: false, issue: '' };
  S.state.cachedBootScope = '';
  S.state.cachedBootSnapshot = null;
  S.state.financeTab = 'cashbook';
  S.state.receivableDetail = null;
  S.state.offlinePreparation = 0;
  S.state.offlineSender = null;
  S.state.offlineSenderScope = '';
  S.state.offlineRefreshDue = false;
  S.state.offlineChannel = window.BroadcastChannel ? new BroadcastChannel('slink-offline') : null;

  S.state.activeWrites = 0;
  S.state.freshReadsUntil = 0;
  S.state.backgroundReadCount = 0;
  S.state.backgroundRefreshTimer = 0;
  S.state.localWriteGeneration = 0;
  S.state.backgroundReadQueue = [];
  S.state.backgroundReadTimes = new Map();
  S.state.deferredProfiles = new Set();
  S.state.vndFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
  S.state.quantityFormatter = new Intl.NumberFormat('vi-VN');
  S.state.toastTimer = null;
  S.state.activeDebtQrPreview = { dataUrl: '', blob: null, filename: '', text: '' };

  S.state.staffRoleFilter = '';
  S.state.staffSearchTerm = '';

  S.state.channelNames = { shopee: 'Shopee', lazada: 'Lazada', tiktok_shop: 'TikTok Shop', tiki: 'Tiki', sendo: 'Sendo', grabmart: 'GrabMart', website: 'Website', other: 'Kênh khác' };

  S.state.channelOrderStatusNames = { reserved: 'Đã giữ tồn', packed: 'Đã đóng gói', shipped: 'Đã gửi', delivered: 'Đã giao', cancelled: 'Đã hủy' };
  S.state.channelPaymentNames = { unpaid: 'Chưa thanh toán', paid: 'Đã thanh toán', cod: 'Thu hộ COD', unknown: 'Chưa rõ' };
  S.state.channelOrderMappingOptions = [];
  S.state.channelOrderCatalogRequest = 0;
  S.state.channelOrderSearchTimer = null;

  S.state.activeSettingsArea = 0;

  S.state.productImportBaseHeaders = ['Mã SKU', 'Mã vạch', 'Tên sản phẩm', 'Danh mục', 'Đơn vị', 'Giá bán (VND)', 'Giá vốn (VND)', 'Ngưỡng tồn tối thiểu', 'Theo dõi tồn kho (Có/Không)', 'Tồn đầu kỳ'];
  S.state.productImportVariantHeaders = [...S.state.productImportBaseHeaders, 'Tên nhóm biến thể', 'Thuộc tính biến thể (Tên=Giá trị; ...)'];
  S.state.productImportHeaders = [...S.state.productImportVariantHeaders, 'Danh sách mã riêng (Serial/IMEI)'];
  S.state.customerImportHeaders = ['Tên khách hàng', 'Số điện thoại', 'Email', 'Công nợ ban đầu (VND)', 'Ghi chú'];

  S.state.checkoutMethods = [
    ['cash', 'Tiền mặt'], ['bank_qr', 'QR ngân hàng · xác nhận thủ công'],
    ['bank_transfer', 'Chuyển khoản · xác nhận thủ công'], ['card', 'Thẻ · xác nhận thủ công'], ['other', 'Khác'],
  ];

  S.state.orderDetailRequest = 0;
  S.state.switchingStore = false;
  S.state.scanPillTimer = 0;
  S.state.cartDraftReady = '';
  S.state.cartDraftLast = '';
  S.state.lastPosBarcodeInput = { code: '', at: 0 };

  S.state.barcodePrintState = { items: [], paper: 'a4-65', showStore: true, showPrice: true };

  S.state.nativeRequests = new Map();
  S.state.appUpdateState = null;
  S.state.exportInProgress = false;
  S.state.exportFiles = {
    products: 'slink-san-pham.csv', inventory: 'slink-ton-kho.csv', 'inventory-movements': 'slink-bien-dong-kho.csv',
    customers: 'slink-khach-hang.csv', 'customer-ledger': 'slink-so-cong-no-khach-hang.csv', orders: 'slink-don-hang.csv',
    'order-lines': 'slink-chi-tiet-don-hang.csv', payments: 'slink-thanh-toan.csv', returns: 'slink-hang-tra.csv',
    'channel-orders': 'slink-don-kenh-ban.csv',
    refunds: 'slink-hoan-tien.csv', cashbook: 'slink-so-thu-chi.csv', suppliers: 'slink-nha-cung-cap.csv',
    'supplier-ledger': 'slink-so-cong-no-nha-cung-cap.csv', purchases: 'slink-phieu-nhap-hang.csv', 'purchase-orders': 'slink-don-dat-hang.csv',
  };
  S.state.activeReceiptPngPreview = { dataUrl: '', blob: null, filename: '', title: '', text: '' };

  S.state.cartViewport = window.matchMedia('(min-width: 1101px)');

  S.fn.resolveEffectivePermissions = function resolveEffectivePermissions(role, overrides, serverEffective) {
    const base = S.state.ROLE_CAPABILITIES[role] || {};
    const out = {};
    Object.keys(base).forEach(function (k) { out[k] = Boolean(base[k]); });
    out.view_cost_price = Boolean(base.viewCostPrice);
    out.void_or_return_order = Boolean(base.voidOrReturnOrder);
    out.record_cashbook = Boolean(base.recordCashbook);
    out.view_reports = Boolean(base.viewReports);
    out.edit_products = Boolean(base.editProducts);
    out.pos_max_discount_pct = S.state.ROLE_DEFAULT_DISCOUNT_PCT[role] != null ? S.state.ROLE_DEFAULT_DISCOUNT_PCT[role] : 0;

    const applyMap = function (map) {
      if (!map || typeof map !== 'object') return;
      Object.keys(map).forEach(function (key) {
        const val = map[key];
        if (val === undefined || val === null) return;
        if (key === 'pos_max_discount_pct' || key === 'posMaxDiscountPct') {
          const pct = Math.max(0, Math.min(100, Math.trunc(Number(val))));
          if (Number.isFinite(pct)) out.pos_max_discount_pct = pct;
          return;
        }
        const granularKey = S.state.CAP_TO_GRANULAR[key];
        if (granularKey) {
          const boolVal = Boolean(val);
          out[granularKey] = boolVal;
          const camelKey = S.state.GRANULAR_TO_CAP[granularKey];
          if (camelKey) out[camelKey] = boolVal;
          return;
        }
        if (key === 'posDiscount') {
          out.posDiscount = Boolean(val);
          return;
        }
        out[key] = Boolean(val);
      });
    };

    applyMap(overrides);
    applyMap(serverEffective);
    out.posDiscount = role === 'affiliate' ? false : (Boolean(out.posSell) && Number(out.pos_max_discount_pct || 0) > 0);
    return out;
  }


  S.fn.hasPerm = function hasPerm(capability) {
    if (!capability) return false;
    const effective = S.state.store && S.state.store.effectivePermissions
      ? S.state.store.effectivePermissions
      : S.fn.resolveEffectivePermissions(S.state.store?.role, S.state.store?.permissions, null);
    if (capability === 'pos_max_discount_pct' || capability === 'posMaxDiscountPct') {
      return Number(effective.pos_max_discount_pct || 0) > 0;
    }
    if (capability === 'posDiscount') {
      return Boolean(effective.posSell) && Number(effective.pos_max_discount_pct || 0) > 0;
    }
    const granularKey = S.state.CAP_TO_GRANULAR[capability];
    if (granularKey && granularKey in effective) {
      return Boolean(effective[granularKey]);
    }
    if (capability in effective) {
      return Boolean(effective[capability]);
    }
    const caps = S.state.ROLE_CAPABILITIES[S.state.store?.role] || {};
    return Boolean(caps[capability]);
  }


  S.fn.getMaxDiscountPct = function getMaxDiscountPct() {
    const effective = S.state.store && S.state.store.effectivePermissions
      ? S.state.store.effectivePermissions
      : S.fn.resolveEffectivePermissions(S.state.store?.role, S.state.store?.permissions, null);
    if (!effective.posSell) return 0;
    const raw = Number(effective.pos_max_discount_pct);
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(100, Math.trunc(raw)));
  }


  S.fn.scrubRestrictedState = function scrubRestrictedState() {
    if (!S.fn.hasPerm('view_cost_price')) {
      (S.state.store.products || []).forEach(function (p) { if (p) p.cost = null; });
      (S.state.posCatalog || []).forEach(function (p) { if (p) p.cost = null; });
      (S.state.posProducts || []).forEach(function (p) { if (p) p.cost = null; });
      (S.state.inventoryProducts || []).forEach(function (p) { if (p) p.cost = null; });
      S.state.productCache.forEach(function (p) { if (p) p.cost = null; });
      S.state.posKnownProducts.forEach(function (p) { if (p) p.cost = null; });
      if (S.state.inventorySummary) S.state.inventorySummary.stockValueVnd = null;
    }
    if (!S.fn.hasPerm('view_reports')) {
      S.state.analyticsData = null;
    }
    if (!S.fn.hasPerm('view_reports') && !S.fn.hasPerm('record_cashbook') && !S.fn.hasPerm('view_cost_price')) {
      S.state.dashboardState.data = null;
    }
    if (S.fn.getMaxDiscountPct() <= 0 && S.state.cart && Number(S.state.cart.discount || 0) > 0) {
      S.state.cart.discount = 0;
    }
  }


  S.fn.emitSyncDomains = function emitSyncDomains(domains, meta) {
    try {
      if (window.SlinkSyncBus && typeof window.SlinkSyncBus.emit === 'function') {
        window.SlinkSyncBus.emit(domains, meta || {});
      }
    } catch (_) {}
  }


  S.fn.initSyncBus = function initSyncBus() {
    if (S.state.syncBusInitialized || !window.SlinkSyncBus) return;
    S.state.syncBusInitialized = true;
    const bus = window.SlinkSyncBus;
    bus.onInvalidate(function (domains) {
      const set = new Set(domains || []);
      if (set.has('products')) {
        S.state.productCache.clear();
        S.state.posCatalogStale = true;
      }
      if (set.has('customers')) {
        S.state.customerCache.clear();
      }
      if (set.has('dashboard') || set.has('orders') || set.has('cashbook') || set.has('debts') || set.has('stock') || set.has('me')) {
        S.state.dashboardState.loadedAt = 0;
      }
      if (set.has('cashbook') || set.has('debts') || set.has('suppliers')) {
        S.state.financeDataReady = false;
      }
    });
    bus.on('*', function (ev) {
      if (!S.state.authSession || !S.state.store.id || S.state.offlineState.mode !== 'online') return;
      const set = new Set(ev?.domains || []);
      const jobs = [];
      if (set.has('me')) {
        jobs.push(S.fn.syncAfterMutation(['me']));
      }
      if (set.has('products') && (S.state.page === 'products' || S.state.page === 'pos' || S.state.page === 'inventory')) {
        if (S.state.page === 'pos' && typeof loadPosCatalog === 'function') {
          jobs.push(loadPosCatalog().catch(function () {}));
        }
        if (S.state.page === 'products') {
          jobs.push(S.fn.loadProductsPage(S.state.searchTerms.products, S.state.productOffset).catch(function () {}));
        }
      }
      if (set.has('stock') && (S.state.page === 'inventory' || S.state.page === 'pos')) {
        if (S.state.page === 'inventory') {
          jobs.push(S.fn.loadInventoryPage(S.state.searchTerms.inventory, S.state.inventoryOffset).catch(function () {}));
        } else if (S.state.page === 'pos' && typeof loadPosCatalog === 'function') {
          jobs.push(loadPosCatalog().catch(function () {}));
        }
      }
      if (set.has('orders') && S.state.page === 'orders' && S.fn.canAccessRoute('orders')) {
        jobs.push(S.fn.loadOrdersPage(S.state.searchTerms.orders, S.state.orderOffset).catch(function () {}));
      }
      if ((set.has('cashbook') || set.has('debts') || set.has('suppliers')) && S.state.page === 'finance' && S.fn.canAccessRoute('finance')) {
        jobs.push(S.fn.loadFinancePage().catch(function () {}));
      }
      if (set.has('customers') && (S.state.page === 'customers' || S.state.page === 'pos') && S.fn.canAccessRoute('customers')) {
        jobs.push(S.fn.loadCustomersPage(S.state.searchTerms.customers, S.state.customerOffset).catch(function () {}));
      }
      if (set.has('staff') && S.state.page === 'staff' && S.fn.hasPerm('manageStaff') && (!ev?.meta?.skipLocalReload || ev?.remote)) {
        jobs.push(S.fn.loadStaffPage().catch(function () {}));
      }
      if (set.has('reports') && S.state.page === 'reports' && S.fn.hasPerm('viewReports')) {
        jobs.push(S.fn.loadAnalytics().catch(function () {}));
      }
      if ((set.has('dashboard') || set.has('orders') || set.has('cashbook') || set.has('debts') || set.has('stock') || set.has('me')) && S.state.page === 'dashboard' && typeof S.fn.loadDashboardPage === 'function') {
        jobs.push(S.fn.loadDashboardPage({ silent: true }).catch(function () {}));
      }
      if (jobs.length) {
        Promise.allSettled(jobs).then(function () { if (S.state.authSession) S.fn.render(); });
      }
    });
  }


  S.fn.loadPosPrefs = function loadPosPrefs() {
    try {
      const parsed = JSON.parse(localStorage.getItem('slink-pos-prefs') || '{}');
      return {
        paperWidth: ['58mm', '80mm', 'a4'].includes(parsed.paperWidth) ? parsed.paperWidth : '80mm',
        autoPrint: Boolean(parsed.autoPrint),
        requireFullPayment: Boolean(parsed.requireFullPayment),
        voiceAnnounce: parsed.voiceAnnounce !== false,
      };
    } catch (_) {
      return { paperWidth: '80mm', autoPrint: false, requireFullPayment: false, voiceAnnounce: true };
    }
  }

  S.fn.savePosPrefs = function savePosPrefs(patch) {
    S.state.posPrefs = { ...S.state.posPrefs, ...patch };
    try { localStorage.setItem('slink-pos-prefs', JSON.stringify(S.state.posPrefs)); } catch (_) {}
  }


  S.fn.syncAfterMutation = async function syncAfterMutation(scopes = []) {
    if (!S.state.authSession || !S.state.store.id || S.state.offlineState.mode !== 'online') return;
    const set = new Set(scopes);
    const jobs = [];
      if (set.has('me')) {
      jobs.push(S.fn.apiRequest('/api/auth/me', { preferFresh: true }).then((me) => {
        if (!me || !me.user) return;
        S.state.authSession = me;
        const active = (me.stores || []).find(s => s.id === S.state.store.id);
        if (active) {
          const prevPermsJson = JSON.stringify(S.state.store.effectivePermissions || {});
          const prevRole = S.state.store.role;
          S.state.store.role = active.role;
          S.state.store.permissions = active.permissions || {};
          S.state.store.effectivePermissions = S.fn.resolveEffectivePermissions(active.role, active.permissions, active.effectivePermissions);
          const nextPermsJson = JSON.stringify(S.state.store.effectivePermissions || {});
          if (active.role !== prevRole || nextPermsJson !== prevPermsJson) {
            S.fn.scrubRestrictedState();
            if (!S.fn.canAccessRoute(S.state.page)) S.state.page = S.fn.defaultHomeRouteForRole();
            S.fn.render();
            S.fn.toast('Quyền truy cập đã cập nhật', `Vai trò hiện tại: ${S.fn.staffRoleName(S.state.store.role)}`);
          }
        }
      }).catch(() => {}));
    }
    if (set.has('products')) jobs.push(S.fn.loadProductsPage(S.state.searchTerms.products, S.state.productOffset).catch(() => {}));
    if (set.has('inventory') && S.fn.canAccessRoute('inventory')) jobs.push(S.fn.loadInventoryPage(S.state.searchTerms.inventory, S.state.inventoryOffset).catch(() => {}));
    if (set.has('orders') && S.fn.canAccessRoute('orders')) jobs.push(S.fn.loadOrdersPage(S.state.searchTerms.orders, S.state.orderOffset).catch(() => {}));
    if ((set.has('finance') || set.has('cashSession')) && S.fn.canAccessRoute('finance')) jobs.push(S.fn.loadFinancePage().catch(() => {}));
    if (set.has('customers') && S.fn.canAccessRoute('customers')) jobs.push(S.fn.loadCustomersPage(S.state.searchTerms.customers, S.state.customerOffset).catch(() => {}));
    if (set.has('dashboard') && S.state.page === 'dashboard') {
      if (typeof S.fn.loadDashboardPage === 'function') jobs.push(S.fn.loadDashboardPage({ silent: true }).catch(() => {}));
      else if (S.fn.hasPerm('viewReports')) jobs.push(S.fn.loadAnalytics(1).catch(() => {}));
    }
    if (set.has('staff') && S.fn.hasPerm('manageStaff')) jobs.push(S.fn.loadStaffPage().catch(() => {}));
    await Promise.allSettled(jobs);
  }


  S.fn.printHtmlDocument = async function printHtmlDocument(html, jobName) {
    const cleanJob = String(jobName || 'Slink').slice(0, 80);
    if (window.SlinkAndroid) {
      try {
        const sanitized = String(html).replace(/<script[\s\S]*?<\/script>/gi, '');
        await S.fn.nativeAction({ type: 'printHtml', jobName: cleanJob, html: sanitized });
        return true;
      } catch (error) {
        S.fn.toast('Không mở được trình in Android', error.message, 'error');
        return false;
      }
    }
    const existing = document.getElementById('slink-hidden-print-frame');
    if (existing) existing.remove();
    const frame = document.createElement('iframe');
    frame.id = 'slink-hidden-print-frame';
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const doc = frame.contentDocument || frame.contentWindow?.document;
    if (!doc) {
      const win = window.open('', '_blank', 'width=460,height=680');
      if (!win) { S.fn.toast('Trình duyệt đã chặn cửa sổ in', 'Hãy cho phép bật cửa sổ in rồi thử lại.', 'error'); return false; }
      win.document.open(); win.document.write(html); win.document.close();
      return true;
    }
    const cleanHtml = String(html).replace(/<script[\s\S]*?<\/script>/gi, '');
    doc.open(); doc.write(cleanHtml); doc.close();
    window.setTimeout(() => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (_) {}
      window.setTimeout(() => frame.remove(), 60000);
    }, 180);
    return true;
  }


  S.fn.emptyStore = function emptyStore() {
    return {
      role: 'cashier',
      permissions: {},
      effectivePermissions: S.fn.resolveEffectivePermissions('cashier', null, null),
      businessProfile: '',
      onboardingCompletedAt: null,
      settings: { storeName: 'Slink', ownerName: '', phone: '', address: '', receiptFooter: '', version: 1, loyaltyEarnUnitVnd: '100000', loyaltyRedeemValueVnd: '1000', protectCostMargin: true },
      products: [], customers: [], orders: [], cashbook: [], movements: [], suppliers: [], sequence: 1001,
    };
  }


  S.fn.csrfCookie = function csrfCookie() {
    const match = document.cookie.split(';').map(function (part) { return part.trim(); }).find(function (part) { return part.startsWith('slink_csrf='); });
    return match ? decodeURIComponent(match.slice('slink_csrf='.length)) : '';
  }


  S.fn.newIdempotencyKey = function newIdempotencyKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      try {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return 'slink-' + Array.from(bytes, function (value) { return value.toString(16).padStart(2, '0'); }).join(''); // taste-skill-ignore: real date/time formatting
      } catch (error) { /* Use the compatibility fallback when secure randomness is unavailable. */ }
    }
    return 'slink-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }


  S.fn.pendingOutboxKey = function pendingOutboxKey(kind, entityId) {
    const userId = S.state.authSession && S.state.authSession.user && S.state.authSession.user.id;
    if (!userId || !S.state.store.id) return '';
    return ['slink-pending-v2', encodeURIComponent(userId), encodeURIComponent(S.state.store.id), kind, encodeURIComponent(entityId || '_')].join(':');
  }


  S.fn.unscopedLegacyPendingKeys = function unscopedLegacyPendingKeys(storeId) {
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


  S.fn.updatePendingCompatibilityWarning = function updatePendingCompatibilityWarning(storeId) {
    S.state.pendingCompatibilityStoreId = storeId || '';
    if (!S.dom.pendingCompatibilityWarning) return;
    S.dom.pendingCompatibilityWarning.hidden = !storeId || S.fn.unscopedLegacyPendingKeys(storeId).length === 0;
  }


  S.fn.clearReviewedLegacyPending = function clearReviewedLegacyPending() {
    const keys = S.fn.unscopedLegacyPendingKeys(S.state.pendingCompatibilityStoreId);
    if (!keys.length) {
      S.fn.updatePendingCompatibilityWarning(S.state.pendingCompatibilityStoreId);
      return;
    }
    const confirmed = window.confirm('Bạn đã đối soát các đơn hàng, khoản thu chi và tồn kho đang chờ trên máy chủ chưa? Slink chỉ xóa các bản lưu cũ trên thiết bị; dữ liệu trên máy chủ không thay đổi.');
    if (!confirmed) return;
    try { keys.forEach(function (key) { window.sessionStorage.removeItem(key); }); } catch (error) { /* Keep the warning visible when cleanup cannot be confirmed. */ }
    S.fn.updatePendingCompatibilityWarning(S.state.pendingCompatibilityStoreId);
    if (!S.fn.unscopedLegacyPendingKeys(S.state.pendingCompatibilityStoreId).length) S.fn.toast('Đã xóa bản lưu cũ', 'Chỉ bản chờ trên thiết bị được xóa; dữ liệu cửa hàng trên máy chủ không thay đổi.');
  }


  S.fn.readPendingRecord = function readPendingRecord(kind, entityId, legacyKey, isValid) {
    const key = S.fn.pendingOutboxKey(kind, entityId);
    if (!key) return null;
    try {
      const value = JSON.parse(window.localStorage.getItem(key) || 'null');
      if (value && value.userId === S.state.authSession.user.id && value.storeId === S.state.store.id && isValid(value)) return value;
    } catch (error) { /* Treat an unreadable record as unavailable; never submit a partial payload. */ }
    try {
      const legacy = JSON.parse(window.sessionStorage.getItem(legacyKey) || 'null');
      if (legacy && legacy.userId === S.state.authSession.user.id && legacy.storeId === S.state.store.id && typeof legacy.key === 'string' && isValid(legacy)) return legacy;
    } catch (error) { /* Unscoped or unreadable legacy records must never be submitted. */ }
    return null;
  }


  S.fn.savePendingRecord = function savePendingRecord(kind, entityId, value, legacyKey) {
    const key = S.fn.pendingOutboxKey(kind, entityId);
    if (!key || !value) return false;
    try {
      const legacy = JSON.parse(window.sessionStorage.getItem(legacyKey) || 'null');
      if (legacy && legacy.storeId === S.state.store.id && !legacy.userId) {
        S.state.pendingCompatibilitySaveBlocked = true;
        S.fn.updatePendingCompatibilityWarning(S.state.store.id);
        return false;
      }
    } catch (error) { /* Unreadable old records cannot be submitted or overwrite a new request. */ }
    try {
      const record = Object.assign({}, value, {
        userId: S.state.authSession.user.id,
        storeId: S.state.store.id,
        outboxVersion: 2,
        savedAt: new Date().toISOString(),
      });
      window.localStorage.setItem(key, JSON.stringify(record));
      const saved = JSON.parse(window.localStorage.getItem(key) || 'null');
      if (!saved || saved.userId !== S.state.authSession.user.id || saved.storeId !== S.state.store.id || saved.key !== value.key) return false;
      try { window.sessionStorage.removeItem(legacyKey); } catch (error) { /* Persistent copy is already saved. */ }
      return true;
    } catch (error) { return false; }
  }


  S.fn.removePendingRecord = function removePendingRecord(kind, entityId, legacyKey) {
    const key = S.fn.pendingOutboxKey(kind, entityId);
    try { if (key) window.localStorage.removeItem(key); } catch (error) { /* Keep UI recovery available if storage is unavailable. */ }
    try { window.sessionStorage.removeItem(legacyKey); } catch (error) { /* Older session storage may be unavailable. */ }
  }


  S.fn.pendingSaveFailed = function pendingSaveFailed() {
    if (S.state.pendingCompatibilitySaveBlocked) {
      S.state.pendingCompatibilitySaveBlocked = false;
      S.fn.toast('Cần đối soát giao dịch cũ', 'Yêu cầu mới chưa được gửi. Hãy kiểm tra dữ liệu trên máy chủ rồi xác nhận đã đối soát bản lưu cũ.', 'error');
      return false;
    }
    S.fn.toast('Chưa gửi thao tác', 'Không thể lưu mã khôi phục trên thiết bị. Hãy kiểm tra quyền lưu dữ liệu hoặc dung lượng trình duyệt rồi thử lại; yêu cầu chưa được gửi.', 'error');
    return false;
  }


  S.fn.loadPendingSale = function loadPendingSale() {
    return S.fn.readPendingRecord('sale', '', 'slink-pending-sale-v1', function (value) {
      return typeof value.key === 'string' && value.payload && Array.isArray(value.payload.items);
    });
  }

  S.fn.savePendingSale = function savePendingSale() {
    if (!S.state.checkoutPendingPayload || !S.state.checkoutIdempotencyKey) return false;
    return S.fn.savePendingRecord('sale', '', { key: S.state.checkoutIdempotencyKey, payload: S.state.checkoutPendingPayload }, 'slink-pending-sale-v1');
  }

  S.fn.clearPendingSale = function clearPendingSale() {
    S.state.checkoutIdempotencyKey = '';
    S.state.checkoutPendingPayload = null;
    S.fn.removePendingRecord('sale', '', 'slink-pending-sale-v1');
  }


  S.fn.loadPendingReturn = function loadPendingReturn(orderId) {
    return S.fn.readPendingRecord('return', orderId, 'slink-pending-return-v1:' + orderId, function (value) {
      return value.orderId === orderId && typeof value.key === 'string' && value.payload;
    });
  }

  S.fn.savePendingReturn = function savePendingReturn() {
    if (!S.state.returnPending) return false;
    return S.fn.savePendingRecord('return', S.state.returnPending.orderId, S.state.returnPending, 'slink-pending-return-v1:' + S.state.returnPending.orderId);
  }

  S.fn.clearPendingReturn = function clearPendingReturn(orderId) {
    S.state.returnPending = null;
    S.fn.removePendingRecord('return', orderId, 'slink-pending-return-v1:' + orderId);
  }


  S.fn.customerTagPendingKey = function customerTagPendingKey(customerId) { return 'slink-pending-customer-tag-v1:' + customerId; }

  S.fn.loadPendingCustomerTag = function loadPendingCustomerTag(customerId) {
    return S.fn.readPendingRecord('customer-tag', customerId, S.fn.customerTagPendingKey(customerId), function (value) {
      return value.customerId === customerId && typeof value.key === 'string' && value.payload
        && ['add', 'remove'].includes(value.payload.operation) && typeof value.payload.tag === 'string';
    });
  }

  S.fn.savePendingCustomerTag = function savePendingCustomerTag(value) {
    return S.fn.savePendingRecord('customer-tag', value.customerId, value, S.fn.customerTagPendingKey(value.customerId));
  }

  S.fn.clearPendingCustomerTag = function clearPendingCustomerTag(customerId) {
    S.fn.removePendingRecord('customer-tag', customerId, S.fn.customerTagPendingKey(customerId));
  }


  S.fn.loadPendingStock = function loadPendingStock(productId) {
    return S.fn.readPendingRecord('stock', productId, 'slink-pending-stock-v1:' + S.state.store.id + ':' + productId, function (value) {
      return value.productId === productId && typeof value.key === 'string' && value.payload;
    });
  }

  S.fn.savePendingStock = function savePendingStock(value) {
    return S.fn.savePendingRecord('stock', value.productId, value, 'slink-pending-stock-v1:' + value.storeId + ':' + value.productId);
  }

  S.fn.clearPendingStock = function clearPendingStock(productId) {
    S.fn.removePendingRecord('stock', productId, 'slink-pending-stock-v1:' + S.state.store.id + ':' + productId);
  }


  S.fn.loadPendingPayment = function loadPendingPayment(orderId) {
    return S.fn.readPendingRecord('payment', orderId, 'slink-pending-payment-v1:' + orderId, function (value) {
      return value.orderId === orderId && typeof value.key === 'string' && value.payload;
    });
  }

  S.fn.savePendingPayment = function savePendingPayment(value) {
    return S.fn.savePendingRecord('payment', value.orderId, value, 'slink-pending-payment-v1:' + value.orderId);
  }

  S.fn.clearPendingPayment = function clearPendingPayment(orderId) {
    S.fn.removePendingRecord('payment', orderId, 'slink-pending-payment-v1:' + orderId);
  }


  S.fn.loadPendingCustomerPayment = function loadPendingCustomerPayment(customerId) {
    return S.fn.readPendingRecord('customer-payment', customerId, 'slink-pending-customer-payment-v1:' + S.state.store.id + ':' + customerId, function (value) {
      return value.customerId === customerId && typeof value.key === 'string' && value.payload;
    });
  }

  S.fn.savePendingCustomerPayment = function savePendingCustomerPayment(value) {
    return S.fn.savePendingRecord('customer-payment', value.customerId, value, 'slink-pending-customer-payment-v1:' + value.storeId + ':' + value.customerId);
  }

  S.fn.clearPendingCustomerPayment = function clearPendingCustomerPayment(customerId) {
    S.fn.removePendingRecord('customer-payment', customerId, 'slink-pending-customer-payment-v1:' + S.state.store.id + ':' + customerId);
  }

  S.fn.openingDebtPendingKey = function openingDebtPendingKey(customerId) { return 'slink-pending-opening-debt-v1:' + S.state.store.id + ':' + customerId; }

  S.fn.loadPendingOpeningDebt = function loadPendingOpeningDebt(customerId) {
    return S.fn.readPendingRecord('opening-debt', customerId, S.fn.openingDebtPendingKey(customerId), value => value.customerId === customerId && typeof value.key === 'string' && value.payload);
  }

  S.fn.savePendingOpeningDebt = function savePendingOpeningDebt(value) { return S.fn.savePendingRecord('opening-debt', value.customerId, value, S.fn.openingDebtPendingKey(value.customerId)); }

  S.fn.clearPendingOpeningDebt = function clearPendingOpeningDebt(customerId) { S.fn.removePendingRecord('opening-debt', customerId, S.fn.openingDebtPendingKey(customerId)); }


  S.fn.loadPendingPurchase = function loadPendingPurchase() {
    return S.fn.readPendingRecord('purchase', '', 'slink-pending-purchase-v1', function (value) {
      return typeof value.key === 'string' && value.payload;
    });
  }

  S.fn.savePendingPurchase = function savePendingPurchase(value) {
    return S.fn.savePendingRecord('purchase', '', value, 'slink-pending-purchase-v1');
  }

  S.fn.clearPendingPurchase = function clearPendingPurchase() {
    S.fn.removePendingRecord('purchase', '', 'slink-pending-purchase-v1');
  }


  S.fn.purchaseOrderPendingKey = function purchaseOrderPendingKey(orderId) { return 'slink-pending-purchase-order-v1:' + (orderId || 'new'); }

  S.fn.loadPendingPurchaseOrder = function loadPendingPurchaseOrder(orderId) {
    return S.fn.readPendingRecord('purchase-order', orderId || '', S.fn.purchaseOrderPendingKey(orderId), function (value) {
      return (!orderId || value.orderId === orderId) && typeof value.key === 'string' && value.payload;
    });
  }

  S.fn.savePendingPurchaseOrder = function savePendingPurchaseOrder(value) {
    return S.fn.savePendingRecord('purchase-order', value.orderId || '', value, S.fn.purchaseOrderPendingKey(value.orderId));
  }

  S.fn.clearPendingPurchaseOrder = function clearPendingPurchaseOrder(orderId) {
    S.fn.removePendingRecord('purchase-order', orderId || '', S.fn.purchaseOrderPendingKey(orderId));
  }


  S.fn.purchaseOrderReceiptPendingKey = function purchaseOrderReceiptPendingKey(orderId) { return 'slink-pending-purchase-order-receipt-v1:' + orderId; }

  S.fn.loadPendingPurchaseOrderReceipt = function loadPendingPurchaseOrderReceipt(orderId) {
    return S.fn.readPendingRecord('purchase-order-receipt', orderId, S.fn.purchaseOrderReceiptPendingKey(orderId), function (value) {
      return value.orderId === orderId && typeof value.key === 'string' && value.payload;
    });
  }

  S.fn.savePendingPurchaseOrderReceipt = function savePendingPurchaseOrderReceipt(value) {
    return S.fn.savePendingRecord('purchase-order-receipt', value.orderId, value, S.fn.purchaseOrderReceiptPendingKey(value.orderId));
  }

  S.fn.clearPendingPurchaseOrderReceipt = function clearPendingPurchaseOrderReceipt(orderId) {
    S.fn.removePendingRecord('purchase-order-receipt', orderId, S.fn.purchaseOrderReceiptPendingKey(orderId));
  }


  S.fn.supplierPaymentKey = function supplierPaymentKey(supplierId) { return 'slink-pending-supplier-payment-v1:' + supplierId; }

  S.fn.loadPendingSupplierPayment = function loadPendingSupplierPayment(supplierId) {
    return S.fn.readPendingRecord('supplier-payment', supplierId, S.fn.supplierPaymentKey(supplierId), function (value) {
      return value.supplierId === supplierId && typeof value.key === 'string' && value.payload;
    });
  }

  S.fn.savePendingSupplierPayment = function savePendingSupplierPayment(value) {
    return S.fn.savePendingRecord('supplier-payment', value.supplierId, value, S.fn.supplierPaymentKey(value.supplierId));
  }

  S.fn.clearPendingSupplierPayment = function clearPendingSupplierPayment(supplierId) {
    S.fn.removePendingRecord('supplier-payment', supplierId, S.fn.supplierPaymentKey(supplierId));
  }


  S.fn.loadPendingCash = function loadPendingCash() {
    return S.fn.readPendingRecord('cash', '', 'slink-pending-cash-v1', function (value) {
      return typeof value.key === 'string' && value.payload;
    });
  }

  S.fn.savePendingCash = function savePendingCash(value) {
    return S.fn.savePendingRecord('cash', '', value, 'slink-pending-cash-v1');
  }

  S.fn.clearPendingCash = function clearPendingCash() {
    S.fn.removePendingRecord('cash', '', 'slink-pending-cash-v1');
  }


  S.fn.loadPendingProductImport = function loadPendingProductImport() {
    return S.fn.readPendingRecord('product-import', '', 'slink-pending-product-import-v1', function (value) {
      return typeof value.key === 'string' && value.payload && Array.isArray(value.payload.items);
    });
  }

  S.fn.savePendingProductImport = function savePendingProductImport(value) {
    return S.fn.savePendingRecord('product-import', '', value, 'slink-pending-product-import-v1');
  }

  S.fn.clearPendingProductImport = function clearPendingProductImport() {
    S.fn.removePendingRecord('product-import', '', 'slink-pending-product-import-v1');
  }


  S.fn.loadPendingProductBulkUpdate = function loadPendingProductBulkUpdate() {
    return S.fn.readPendingRecord('product-bulk-update', '', 'slink-pending-product-bulk-update-v1', function (value) {
      return typeof value.key === 'string' && value.payload && Array.isArray(value.payload.items);
    });
  }

  S.fn.savePendingProductBulkUpdate = function savePendingProductBulkUpdate(value) {
    return S.fn.savePendingRecord('product-bulk-update', '', value, 'slink-pending-product-bulk-update-v1');
  }

  S.fn.clearPendingProductBulkUpdate = function clearPendingProductBulkUpdate() {
    S.fn.removePendingRecord('product-bulk-update', '', 'slink-pending-product-bulk-update-v1');
  }


  S.fn.loadPendingProductVariantGroup = function loadPendingProductVariantGroup() {
    return S.fn.readPendingRecord('product-variant-group', '', 'slink-pending-product-variant-group-v1', function (value) {
      return typeof value.key === 'string' && value.payload && Array.isArray(value.payload.variants);
    });
  }

  S.fn.savePendingProductVariantGroup = function savePendingProductVariantGroup(value) {
    return S.fn.savePendingRecord('product-variant-group', '', value, 'slink-pending-product-variant-group-v1');
  }

  S.fn.clearPendingProductVariantGroup = function clearPendingProductVariantGroup() {
    S.fn.removePendingRecord('product-variant-group', '', 'slink-pending-product-variant-group-v1');
  }

  S.fn.loadPendingProductVariantAdd = function loadPendingProductVariantAdd() {
    return S.fn.readPendingRecord('product-variant-add', '', 'slink-pending-product-variant-add-v1', function (value) {
      return typeof value.key === 'string' && typeof value.productId === 'string' && value.payload && Array.isArray(value.payload.variants);
    });
  }

  S.fn.savePendingProductVariantAdd = function savePendingProductVariantAdd(value) {
    return S.fn.savePendingRecord('product-variant-add', '', value, 'slink-pending-product-variant-add-v1');
  }

  S.fn.clearPendingProductVariantAdd = function clearPendingProductVariantAdd() {
    S.fn.removePendingRecord('product-variant-add', '', 'slink-pending-product-variant-add-v1');
  }


  S.fn.loadPendingStockBulkCount = function loadPendingStockBulkCount() {
    return S.fn.readPendingRecord('stock-bulk-count', '', 'slink-pending-stock-bulk-count-v1', function (value) {
      return typeof value.key === 'string' && value.payload && Array.isArray(value.payload.items);
    });
  }

  S.fn.savePendingStockBulkCount = function savePendingStockBulkCount(value) {
    return S.fn.savePendingRecord('stock-bulk-count', '', value, 'slink-pending-stock-bulk-count-v1');
  }

  S.fn.clearPendingStockBulkCount = function clearPendingStockBulkCount() {
    S.fn.removePendingRecord('stock-bulk-count', '', 'slink-pending-stock-bulk-count-v1');
  }


  S.fn.loadPendingCustomer = function loadPendingCustomer() {
    return S.fn.readPendingRecord('customer-create', '', 'slink-pending-customer-create-v1', function (value) {
      return typeof value.key === 'string' && value.payload && typeof value.payload.name === 'string';
    });
  }

  S.fn.savePendingCustomer = function savePendingCustomer(value) {
    return S.fn.savePendingRecord('customer-create', '', value, 'slink-pending-customer-create-v1');
  }

  S.fn.clearPendingCustomer = function clearPendingCustomer() {
    S.fn.removePendingRecord('customer-create', '', 'slink-pending-customer-create-v1');
  }


  S.fn.loadPendingCustomerImport = function loadPendingCustomerImport() {
    return S.fn.readPendingRecord('customer-import', '', 'slink-pending-customer-import-v1', function (value) {
      return typeof value.key === 'string' && value.payload && Array.isArray(value.payload.items);
    });
  }

  S.fn.savePendingCustomerImport = function savePendingCustomerImport(value) {
    return S.fn.savePendingRecord('customer-import', '', value, 'slink-pending-customer-import-v1');
  }

  S.fn.clearPendingCustomerImport = function clearPendingCustomerImport() {
    S.fn.removePendingRecord('customer-import', '', 'slink-pending-customer-import-v1');
  }


  S.fn.loadPendingSupplier = function loadPendingSupplier() {
    return S.fn.readPendingRecord('supplier-create', '', 'slink-pending-supplier-create-v1', function (value) {
      return typeof value.key === 'string' && value.payload && typeof value.payload.name === 'string';
    });
  }

  S.fn.savePendingSupplier = function savePendingSupplier(value) {
    return S.fn.savePendingRecord('supplier-create', '', value, 'slink-pending-supplier-create-v1');
  }

  S.fn.clearPendingSupplier = function clearPendingSupplier() {
    S.fn.removePendingRecord('supplier-create', '', 'slink-pending-supplier-create-v1');
  }


  S.fn.cashSessionCloseKey = function cashSessionCloseKey(sessionId) { return 'slink-pending-cash-session-close-v1:' + sessionId; }

  S.fn.loadPendingCashSessionOpen = function loadPendingCashSessionOpen() {
    return S.fn.readPendingRecord('cash-session-open', '', 'slink-pending-cash-session-open-v1', function (value) {
      return typeof value.key === 'string' && value.payload && typeof value.payload.openingFloatVnd === 'string';
    });
  }

  S.fn.savePendingCashSessionOpen = function savePendingCashSessionOpen(value) {
    return S.fn.savePendingRecord('cash-session-open', '', value, 'slink-pending-cash-session-open-v1');
  }

  S.fn.clearPendingCashSessionOpen = function clearPendingCashSessionOpen() {
    S.fn.removePendingRecord('cash-session-open', '', 'slink-pending-cash-session-open-v1');
  }

  S.fn.loadPendingCashSessionClose = function loadPendingCashSessionClose(sessionId) {
    return S.fn.readPendingRecord('cash-session-close', sessionId, S.fn.cashSessionCloseKey(sessionId), function (value) {
      return value.sessionId === sessionId && typeof value.key === 'string' && value.payload;
    });
  }

  S.fn.savePendingCashSessionClose = function savePendingCashSessionClose(value) {
    return S.fn.savePendingRecord('cash-session-close', value.sessionId, value, S.fn.cashSessionCloseKey(value.sessionId));
  }

  S.fn.clearPendingCashSessionClose = function clearPendingCashSessionClose(sessionId) {
    S.fn.removePendingRecord('cash-session-close', sessionId, S.fn.cashSessionCloseKey(sessionId));
  }


  S.fn.orderMutationLegacyKey = function orderMutationLegacyKey(orderId) {
    return `slink-pending-order-mutation-v1:${S.state.store.id}:${orderId}`;
  }

  S.fn.loadPendingOrderMutation = function loadPendingOrderMutation(orderId) {
    return S.fn.readPendingRecord('order-mutation', orderId, S.fn.orderMutationLegacyKey(orderId), function (value) {
      return value.orderId === orderId && typeof value.key === 'string' && value.payload
        && ['note', 'tag'].includes(value.kind);
    });
  }

  S.fn.savePendingOrderMutation = function savePendingOrderMutation(value) {
    return S.fn.savePendingRecord('order-mutation', value.orderId, value, S.fn.orderMutationLegacyKey(value.orderId));
  }

  S.fn.clearPendingOrderMutation = function clearPendingOrderMutation(orderId) {
    S.fn.removePendingRecord('order-mutation', orderId, S.fn.orderMutationLegacyKey(orderId));
  }


  S.fn.activeOfflineScope = function activeOfflineScope() { return S.state.offlineDisk && S.state.authSession?.user?.id && S.state.store.id ? S.state.offlineDisk.scopeKey(S.state.authSession.user.id, S.state.store.id) : ''; }

  S.fn.updateOfflineStatus = function updateOfflineStatus() {
    document.body.dataset.connection = S.state.offlineState.mode;
  }

  S.fn.cacheScope = function cacheScope(url) {
    if (!S.state.offlineDisk || !S.state.authSession?.user?.id) return '';
    const match = url.match(/^\/api\/stores\/([^/]+)\//);
    if (match && !/\/(exports|staff|audit(?:-events)?)(\/|\?|$)/.test(url)) {
      const id = decodeURIComponent(match[1]);
      if (S.state.authSession.stores.some(item => item.id === id)) return S.state.offlineDisk.scopeKey(S.state.authSession.user.id, id);
    }
    if (/^\/api\/(affiliate\/links|commerce\/platforms)(\?|$)/.test(url)) return S.state.offlineDisk.scopeKey(S.state.authSession.user.id, 'personal');
    return '';
  }

  S.fn.rememberOfflineSession = async function rememberOfflineSession(session) {
    if (!S.state.offlineDisk || !session?.user?.id) return;
    const user = session.user;
    const saved = { user: { id: user.id, email: user.email, displayName: user.displayName, workspaceMode: user.workspaceMode }, stores: session.stores || [], verifiedAt: new Date().toISOString() };
    const previous = await S.state.offlineDisk.getMeta('session|' + user.id);
    for (const item of previous?.stores || []) if (!saved.stores.some(current => current.id === item.id && current.role === item.role)) await S.state.offlineDisk.clearResponses(S.state.offlineDisk.scopeKey(user.id, item.id));
    await S.state.offlineDisk.putMeta('session|' + user.id, saved);
    await S.state.offlineDisk.putMeta('active-user', user.id);
  }

  S.fn.serverNowIso = function serverNowIso() {
    return new Date(Date.now() + (S.state.serverClockOffsetMs || 0)).toISOString();
  }

  S.fn.offlineRowsChanged = async function offlineRowsChanged(notifyOthers, reason) {
    const scope = S.fn.activeOfflineScope();
    if (!scope) return;
    let rows = [];
    try { rows = await S.state.offlineDisk.operations(scope); }
    catch (_) { return; }
    if (scope !== S.fn.activeOfflineScope()) return;
    S.state.offlineState.pending = rows.filter(row => row.state !== 'acknowledged').length;
    S.state.offlineState.conflicts = rows.filter(row => row.state === 'conflict').length;
    S.fn.updateOfflineStatus();
    if (notifyOthers) S.state.offlineChannel?.postMessage({ scope, reason: reason || 'updated' });
  }

  S.fn.collectOfflineResponses = async function collectOfflineResponses(storeId, role, confirmed, permissions) {
    const base = '/api/stores/' + encodeURIComponent(storeId), rows = [];
    const eff = S.fn.resolveEffectivePermissions(role, permissions, null);
    const take = async url => { const value = await S.fn.networkRequest(url); rows.push({ url, value, fetchedAt: new Date().toISOString() }); return value; };
    const [, list] = await Promise.all([take(base + '/settings'), take(base + '/warehouses?view=picker')]);
    const active = list.warehouses.filter(item => item.status === 'active');
    const tasks = [];
    tasks.push(Promise.all(active.map(async warehouse => {
      let offset = 0; const seen = new Set();
      while (offset !== null && !seen.has(offset)) {
        seen.add(offset);
        const result = await take(base + '/products?limit=100&offset=' + offset + '&q=&warehouseId=' + encodeURIComponent(warehouse.id));
        offset = result.nextOffset ?? null;
      }
    })));
    if (eff.operateCashShift || eff.posSell) {
      tasks.push(take(base + '/cash-register'));
    }
    if (eff.manageCustomers) {
      tasks.push(take(base + '/customers?view=picker&limit=100&q='));
    }
    if (eff.viewFinance) {
      tasks.push(take(base + '/finance'));
    }
    if (eff.manageInventory) {
      tasks.push(take(base + '/warehouses'));
      tasks.push(take(base + '/warehouse-transfers?limit=100'));
      active.forEach(warehouse => tasks.push(take(base + '/inventory?limit=100&offset=0&q=&warehouseId=' + encodeURIComponent(warehouse.id))));
    }
    if (eff.viewOrders) {
      tasks.push((async () => {
        const orders = await take(base + '/orders?limit=100&offset=0&q=&status=all');
        // Reconciliation only needs the receipts for newly sent sales.
        const ids = new Set(confirmed ? [] : (orders.orders || []).slice(0, 20).map(item => item.id));
        (confirmed || []).forEach(row => { if (row.result?.order?.id) ids.add(row.result.order.id); });
        const orderIds = Array.from(ids);
        for (let offset = 0; offset < orderIds.length; offset += 4) {
          await Promise.all(orderIds.slice(offset, offset + 4).map(id => take(base + '/orders/' + encodeURIComponent(id))));
        }
      })());
    }
    if (eff.viewReports) {
      tasks.push(take(base + '/analytics?days=7'));
      tasks.push(take(base + '/analytics?days=30'));
    }
    if (eff.manageCustomers && eff.viewReports) {
      tasks.push(take(base + '/customers?limit=100&offset=0&q='));
    }
    await Promise.all(tasks);
    return rows;
  }

  S.fn.userIdForScope = function userIdForScope(scope) { return decodeURIComponent(scope.split('|')[0]); }

  S.fn.prepareProductImages = async function prepareProductImages(rows, scope) {
    const userId = S.fn.userIdForScope(scope), storeId = decodeURIComponent(scope.split('|')[1]);
    if (!('serviceWorker' in navigator)) return;
    const products = new Map();
    rows.forEach(row => (row.value.products || []).forEach(product => { if (product.image_content_type) products.set(product.id, product); }));
    for (const product of products.values()) {
      if (!navigator.onLine || S.fn.activeOfflineScope() !== scope) return;
      const url = '/api/stores/' + encodeURIComponent(storeId) + '/products/' + encodeURIComponent(product.id) + '/image?v=' + Number(product.image_version) + '&savedFor=' + encodeURIComponent(userId);
      try { const response = await fetch(url, { credentials: 'same-origin' }); if (response.ok) await response.arrayBuffer(); } catch (_) { return; }
    }
  }

  S.fn.prepareOfflineData = async function prepareOfflineData() {
    const scope = S.fn.activeOfflineScope();
    if (!scope || !navigator.onLine) return;
    if ((await S.state.offlineDisk.operations(scope)).some(row => row.state !== 'acknowledged')) { S.fn.startOfflineSync(); return; }
      const generation = ++S.state.offlinePreparation, storeId = S.state.store.id, role = S.state.store.role, perms = S.state.store.effectivePermissions || S.state.store.permissions;
    S.state.offlineState.preparing = true; S.fn.updateOfflineStatus();
    try {
      await S.state.offlineDisk.requestPersistence();
      const epoch = await S.state.offlineDisk.getMeta('epoch|' + scope) || '';
      const rows = await S.fn.collectOfflineResponses(storeId, role, null, perms);
      if (scope !== S.fn.activeOfflineScope() || generation !== S.state.offlinePreparation) return;
      const saved = await S.state.offlineDisk.replaceResponses(scope, rows, epoch);
      if (saved) S.state.offlineState.storageIssue = '';
      if (saved) await S.fn.prepareProductImages(rows, scope);
    } catch (error) {
      if (scope === S.fn.activeOfflineScope()) S.state.offlineState.storageIssue = error.code === 'offline_storage_unavailable' ? error.message : 'Chưa tải đủ dữ liệu để dùng khi mất mạng. Những dữ liệu đã tải vẫn được giữ.';
    } finally { if (generation === S.state.offlinePreparation) { S.state.offlineState.preparing = false; S.fn.updateOfflineStatus(); } }
  }

  S.fn.senderForCurrentStore = function senderForCurrentStore() {
    const scope = S.fn.activeOfflineScope();
    if (!scope || !window.SlinkOfflineSync) return null;
    if (S.state.offlineSenderScope === scope) return S.state.offlineSender;
    S.state.offlineSender?.close();
    const userId = S.state.authSession.user.id, storeId = S.state.store.id;
    S.state.offlineSenderScope = scope;
    S.state.offlineSender = window.SlinkOfflineSync({
      disk: S.state.offlineDisk, scope, owner: S.state.offlineOwner, userId, storeId,
      authenticate: async () => { const identity = await S.fn.networkRequest('/api/auth/me'); await S.fn.rememberOfflineSession(identity); return identity; },
      send: S.fn.networkRequest,
      refresh: async () => {
        const identity = await S.fn.networkRequest('/api/auth/me');
        const active = identity.stores.find(row => row.id === storeId && identity.user.id === userId);
        if (!active?.role) { const error = new Error('Đăng nhập đúng tài khoản còn quyền vào cửa hàng để đồng bộ.'); error.status = 403; throw error; }
        return [];
      },
      onChange: event => {
        if (scope !== S.fn.activeOfflineScope()) return;
        if (event.type === 'acknowledged') {
          const saved = event.operations.find(row => row.kind === 'sale' && S.state.lastCompletedSale?.id === 'local:' + row.key);
          if (saved?.result?.order) {
            const order = saved.result.order;
            S.state.lastCompletedSale = { id: order.id, number: order.number, total: order.totalVnd, change: order.changeVnd, offlineQueued: false };
          }
          S.state.offlineState.issue = '';
          S.state.offlineState.storageIssue = '';
          S.state.freshReadsUntil = Date.now() + 8000;
          S.state.backgroundReadTimes.clear();
          S.state.customerListLoaded = false;
          S.state.inventoryWarehouseId = null;
          S.state.offlineDisk.putMeta('cache-stale|' + scope, new Date().toISOString()).catch(() => {});
          S.state.offlineRefreshDue = true;
          S.fn.emitSyncDomains(['orders', 'stock', 'cashbook', 'debts', 'customers', 'dashboard', 'reports'], { source: 'offline-sync' });
          S.fn.refreshAfterOfflineSync();
        }
        if (event.type === 'issue' || event.type === 'conflict') S.state.offlineState.issue = event.status === 401 ? 'Phiên đã hết hạn. Đăng nhập lại để đồng bộ các việc đã lưu.' : event.message;
        const broadcastReason = (event.type === 'acknowledged' || event.type === 'confirmed') ? event.type : '';
        S.fn.offlineRowsChanged(Boolean(broadcastReason), broadcastReason).catch(() => {});
      },
    });
    return S.state.offlineSender;
  }

  S.fn.startOfflineSync = function startOfflineSync() {
    if (!navigator.onLine || !S.fn.activeOfflineScope()) return Promise.resolve();
    const sender = S.fn.senderForCurrentStore();
    if (!sender) return Promise.resolve();
    S.state.offlineState.syncing = true; S.fn.updateOfflineStatus();
    return sender.flush().finally(() => { S.state.offlineState.syncing = false; S.fn.offlineRowsChanged(false).catch(() => {}); });
  }

  S.fn.resumeOfflineWork = async function resumeOfflineWork() {
    const scope = S.fn.activeOfflineScope();
    const result = await S.fn.startOfflineSync();
    if (!scope || scope !== S.fn.activeOfflineScope()) return;
    if (result?.synced && await S.state.offlineDisk.getMeta('prepared|' + scope)) return;
    await S.fn.prepareOfflineData();
  }

  S.fn.refreshAfterOfflineSync = async function refreshAfterOfflineSync() {
    if (!S.state.offlineRefreshDue || !S.state.authSession || !S.dom.modal.hidden || S.state.guidedTourState.active || S.fn.hasAnyOpenPosBillItems() || S.state.checkoutPendingPayload || document.getElementById('drawer-cart')?.classList.contains('open')) return;
    if (S.state.page === 'pos' && S.dom.root.querySelector('.pos-warehouse-picker details[open]')) return;
    if (S.dom.root.querySelector('form[data-dirty="true"]') || (S.dom.root.contains(document.activeElement) && document.activeElement.matches('input,textarea,select'))) return;
    S.state.offlineRefreshDue = false;
    if (S.state.page === 'pos' || S.state.page === 'products') await S.fn.loadProductsPage(S.state.page === 'pos' ? S.state.posSearchTerm : S.state.searchTerms.products, 0, { preferFresh: true });
    else if (S.state.page === 'inventory') await S.fn.loadInventoryPage(S.state.searchTerms.inventory, S.state.inventoryOffset, { preferFresh: true });
    else if (S.state.page === 'finance') await S.fn.loadFinancePage();
    else if (S.state.page === 'orders') { await S.fn.loadOrdersPage(S.state.searchTerms.orders, 0); if (S.state.page === 'orders') S.fn.render(); }
    else if (S.state.page === 'customers') { await S.fn.loadCustomersPage(S.state.searchTerms.customers, S.state.customerOffset); if (S.state.page === 'customers') S.fn.render(); }
    else if (S.state.page === 'dashboard') {
      if (typeof S.fn.loadDashboardPage === 'function') {
        await S.fn.loadDashboardPage({ silent: true });
      } else {
        const loads = [S.fn.loadInventoryPage('', 0)];
        if (S.fn.hasPerm('viewReports') || S.fn.hasPerm('recordCashbook')) loads.push(S.fn.loadFinancePage());
        if (S.fn.hasPerm('viewReports')) loads.push(S.fn.loadAnalytics(1));
        if (S.fn.hasPerm('viewOrders')) loads.push(S.fn.loadOrdersPage('', 0));
        await Promise.all(loads);
      }
      if (S.state.page === 'dashboard') S.fn.render();
    } else if (S.state.page === 'reports' && S.fn.hasPerm('viewReports')) await S.fn.loadAnalytics();
  }

  S.fn.offlineKind = function offlineKind(url) {
    const tail = url.replace(/^\/api\/stores\/[^/]+/, '');
    if (tail === '/sales') return 'sale';
    if (tail === '/purchases' || tail === '/purchase-packs') return 'purchase';
    if (tail === '/stock-adjustments') return 'stock-count';
    if (tail === '/cash-movements') return 'cash';
    if (tail === '/cash-register/open') return 'shift-open';
    if (/^\/cash-register\/[^/]+\/close$/.test(tail)) return 'shift-close';
    return '';
  }

  S.fn.provisionalResult = function provisionalResult(record, snapshot) {
    if (record.state === 'acknowledged') return record.result;
    const state = window.SlinkOfflineLedger.derive(snapshot.responses, snapshot.operations);
    const body = record.payload, number = 'TẠM-' + String(record.sequence).padStart(4, '0');
    const result = { offlineQueued: true, operationKey: record.key };
    if (record.kind === 'sale') {
      const order = state.localOrders.find(row => row.key === record.key);
      result.order = { ...order, id: 'local:' + record.key, number, changeVnd: order.changeVnd, totalVnd: order.totalVnd };
    }
    if (record.kind === 'purchase') {
      const total = body.items.reduce((sum, item) => {
        if (item.lineTotalVnd !== undefined) return sum + BigInt(item.lineTotalVnd);
        if (item.pack) return sum + window.SlinkPurchaseUnits.fromPack(item.pack).lineTotalVnd;
        return sum + window.SlinkOfflineLedger.lineTotal(item.unitCostVnd, window.SlinkOfflineLedger.quantity(item.quantity));
      }, 0n);
      result.purchase = { id: 'local:' + record.key, number, totalVnd: String(total), itemCount: body.items.length };
    }
    if (record.kind === 'cash') result.movement = { id: 'local:' + record.key, amountVnd: body.amountVnd };
    if (record.kind === 'shift-open') result.session = state.session;
    if (record.kind === 'shift-close') result.session = state.lastClosed;
    return result;
  }

  S.fn.queueOfflineOperation = async function queueOfflineOperation(url, options) {
    const scope = S.fn.activeOfflineScope(), key = options.headers?.['idempotency-key'];
    if (!scope || !key) throw new Error('Chưa chuẩn bị được nơi lưu chứng từ. Giữ nội dung và thử lại.');
    const kind = S.fn.offlineKind(url), source = JSON.parse(JSON.stringify(options.body));
    let snapshot = await S.state.offlineDisk.snapshot(scope);
    let record = snapshot.operations.find(row => row.key === key);
    if (record) {
      if (record.source && JSON.stringify(record.source) !== JSON.stringify(source)) throw new Error('Nội dung đã đổi sau khi lưu. Mở chứng từ chờ để kiểm tra.');
    } else {
      // The register must be known before saving money, including the first online sale.
      const base = '/api/stores/' + encodeURIComponent(S.state.store.id);
      if ((S.fn.hasPerm('operateCashShift') || S.fn.hasPerm('posSell')) && !snapshot.responses.some(row => row.url === base + '/cash-register') && !snapshot.operations.some(row => row.state !== 'acknowledged') && navigator.onLine) {
        await S.state.offlineDisk.cacheResponse(scope, base + '/cash-register', await S.fn.networkRequest(base + '/cash-register'));
        snapshot = await S.state.offlineDisk.snapshot(scope);
      }
      const warehouseId = source.warehouseId || S.state.selectedWarehouseId || S.state.warehouses.find(row => row.is_default)?.id;
      const productIds = new Set((source.items || []).map(item => item.productId));
      if (source.productId) productIds.add(source.productId);
      let state = window.SlinkOfflineLedger.derive(snapshot.responses, snapshot.operations);
      const missing = Array.from(productIds).filter(id => !state.products.has(window.SlinkOfflineLedger.productKey(warehouseId, id)));
      // A newly created or newly found product may not be in the warehouse cache yet.
      if (missing.length && navigator.onLine && warehouseId && !snapshot.operations.some(row => row.state !== 'acknowledged')) {
        for (const id of missing) {
          const url = base + '/products?limit=1&productId=' + encodeURIComponent(id) + '&warehouseId=' + encodeURIComponent(warehouseId);
          const result = await S.fn.networkRequest(url);
          if (S.fn.activeOfflineScope() !== scope) throw new Error('Cửa hàng hoặc tài khoản đã đổi. Mở lại chứng từ để tiếp tục.');
          if (result.products?.some(product => product.id === id)) await S.state.offlineDisk.cacheResponse(scope, url, result, undefined, snapshot.epoch);
        }
        snapshot = await S.state.offlineDisk.snapshot(scope);
        state = window.SlinkOfflineLedger.derive(snapshot.responses, snapshot.operations);
      }
      let deviceId = await S.state.offlineDisk.getMeta('device-id');
      if (!deviceId) { deviceId = S.fn.newIdempotencyKey(); await S.state.offlineDisk.putMeta('device-id', deviceId); }
      const payload = JSON.parse(JSON.stringify(source));
      delete payload._slinkOfflineVersion;
      delete payload._slinkExpectedCashVnd;
      if (kind === 'sale' && (payload.promotionCode || payload.redeemPoints || Number(payload.pointsToRedeem || 0) > 0 || payload.settlePriorDebt)) {
        const error = new Error('Đơn có mã ưu đãi, đổi điểm hoặc gộp thu nợ cũ cần kết nối mạng trực tiếp với máy chủ.'); error.status = 400; throw error;
      }
      payload.warehouseId = warehouseId;
      payload.offline = { actorUserId: S.state.authSession.user.id, deviceId, occurredAt: S.fn.serverNowIso(), cashSessionId: state.session?.id || null, expectedCashVnd: kind === 'shift-close' ? source._slinkExpectedCashVnd ?? state.session?.expectedCashVnd : null };
      const productSnapshots = Array.from(productIds, id => state.products.get(window.SlinkOfflineLedger.productKey(warehouseId, id))).filter(Boolean);
      if (kind === 'sale') payload.items.forEach(item => { item.expectedUnitPriceVnd ??= String(S.fn.productById(item.productId)?.price ?? state.products.get(window.SlinkOfflineLedger.productKey(payload.warehouseId, item.productId))?.sale_price_vnd); });
      if (kind === 'purchase') payload.items.forEach(item => { item.expectedProductVersion ??= S.fn.productById(item.productId)?.version ?? state.products.get(window.SlinkOfflineLedger.productKey(payload.warehouseId, item.productId))?.version; });
      record = await S.state.offlineDisk.enqueue({ userId: S.state.authSession.user.id, storeId: S.state.store.id, actorName: S.state.authSession.user.displayName, kind, key, url, payload, source, productSnapshots });
      S.state.offlinePreparation += 1; S.state.offlineState.preparing = false;
      snapshot = await S.state.offlineDisk.snapshot(scope);
    }
    await S.fn.offlineRowsChanged(true, 'enqueued');
    S.state.freshReadsUntil = Date.now() + 6000;
    window.setTimeout(S.fn.startOfflineSync, 0);
    return S.fn.provisionalResult(record, snapshot);
  }

  S.fn.cachedOfflineRead = async function cachedOfflineRead(scope, url, snapshot) {
    const saved = await S.state.offlineDisk.lookup(scope, url, snapshot);
    if (!saved) return null;
    S.state.offlineState.cachedAt = saved.fetchedAt;
    const value = window.SlinkOfflineLedger.projectResponse(url, { ...saved.value, offlineCachedAt: saved.fetchedAt }, snapshot.responses, snapshot.operations, S.state.authSession?.user.id);
    if (url.endsWith('/finance')) value.offlineSummaryDate = new Intl.DateTimeFormat('vi-VN', { timeZone: S.state.store.settings.timezone || 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }).format(new Date(saved.fetchedAt));
    return value;
  }

  S.fn.refreshCachedRead = function refreshCachedRead(url, scope, previous) {
    if (!navigator.onLine || Date.now() - (S.state.backgroundReadTimes.get(scope+'|'+url)||0) < 15000) return;
    S.state.backgroundReadTimes.set(scope+'|'+url,Date.now());
    if(S.state.backgroundReadTimes.size>160)S.state.backgroundReadTimes.delete(S.state.backgroundReadTimes.keys().next().value);
    const session=S.state.authSession, requestedPage=S.state.page, writeGeneration=S.state.localWriteGeneration;
    S.state.backgroundReadQueue.push(async()=>{
      if(S.state.authSession!==session||S.fn.activeOfflineScope()!==scope||writeGeneration!==S.state.localWriteGeneration)return;
      try{
        const snapshot=await S.state.offlineDisk.snapshot(scope);
        if(snapshot.operations.some(row=>row.state!=='acknowledged'))return;
        const fresh=await S.fn.networkRequest(url);
        if(S.state.authSession!==session||S.fn.activeOfflineScope()!==scope||writeGeneration!==S.state.localWriteGeneration)return;
        if(JSON.stringify(previous.value)===JSON.stringify(fresh))return;
        if(!(await S.state.offlineDisk.cacheResponse(scope,url,fresh,undefined,snapshot.epoch)))return;
        if(S.state.page===requestedPage){S.state.offlineRefreshDue=true;window.clearTimeout(S.state.backgroundRefreshTimer);S.state.backgroundRefreshTimer=window.setTimeout(S.fn.refreshAfterOfflineSync,120);}
      }catch(error){if(S.state.authSession===session&&S.fn.activeOfflineScope()===scope)S.state.offlineState.issue=error.status===401?'Đăng nhập lại khi cần gửi dữ liệu.':error.message;}
    });
    S.fn.runBackgroundReads();
  }

  S.fn.runBackgroundReads = function runBackgroundReads() {
    while(S.state.backgroundReadCount<2&&S.state.backgroundReadQueue.length){
      const job=S.state.backgroundReadQueue.shift();S.state.backgroundReadCount++;
      job().finally(()=>{S.state.backgroundReadCount--;S.fn.runBackgroundReads();});
    }
  }

  S.fn.apiRequest = async function apiRequest(url, options) {
    const method = String(options?.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD') return S.fn.runApiRequest(url, options, method);
    S.state.localWriteGeneration += 1;
    S.state.activeWrites += 1;
    try {
      const result = await S.fn.runApiRequest(url, options, method);
      if (url.startsWith('/api/stores/') && !result?.offlineQueued) {
        S.state.freshReadsUntil = Date.now() + 5000;
        const scope = S.fn.activeOfflineScope();
        if (scope) {
          try { await S.state.offlineDisk.putMeta('cache-stale|' + scope, new Date().toISOString()); }
          catch (error) { S.state.offlineState.storageIssue = error.message || 'Chưa cập nhật được dữ liệu trên máy.'; }
        }
      }
      return result;
    }
    finally { S.state.activeWrites -= 1; }
  }


  S.fn.runApiRequest = async function runApiRequest(url, options, method) {
    const readGeneration=S.state.localWriteGeneration;
    const isSerialSale = S.fn.offlineKind(url) === 'sale' && Array.isArray(options?.body?.items) && options.body.items.some(line => (Array.isArray(line.serialCodes) && line.serialCodes.length > 0) || !S.fn.productById(line.productId) || Boolean(S.fn.productById(line.productId)?.serialTracked));
    const isOnlineOnlySale = S.fn.offlineKind(url) === 'sale' && Boolean(options?.body?.promotionCode || isSerialSale || options?.body?.redeemPoints || Number(options?.body?.pointsToRedeem || 0) > 0 || options?.body?.settlePriorDebt);
    const activeScope = S.fn.activeOfflineScope();
    if (method === 'POST' && S.fn.offlineKind(url) && options?.body?._slinkOfflineVersion === 1 && !isOnlineOnlySale) {
      let hasQueued = false;
      if (activeScope && S.state.offlineDisk) {
        try { hasQueued = (await S.state.offlineDisk.operations(activeScope)).some(row => row.state !== 'acknowledged'); }
        catch (err) { S.state.offlineState.storageIssue = err?.message || ''; }
      }
      if (!navigator.onLine || hasQueued) {
        return S.fn.queueOfflineOperation(url, options);
      }
      const onlineBody = JSON.parse(JSON.stringify(options.body));
      delete onlineBody._slinkOfflineVersion;
      delete onlineBody._slinkExpectedCashVnd;
      try {
        const direct = await S.fn.networkRequest(url, { ...options, body: onlineBody });
        S.state.offlineState.mode = 'online';
        S.fn.updateOfflineStatus();
        return direct;
      } catch (err) {
        if ((!err.status || err.status >= 502 || err.code === 'connection_timeout') && err.name !== 'AbortError') {
          return S.fn.queueOfflineOperation(url, options);
        }
        throw err;
      }
    }
    const scope = method === 'GET' ? S.fn.cacheScope(url) : '';
    let snapshot = null;
    if (scope && S.state.offlineDisk) {
      try {
        snapshot = scope === S.state.cachedBootScope && S.state.cachedBootSnapshot ? S.state.cachedBootSnapshot : await S.state.offlineDisk.snapshot(scope);
      } catch (err) {
        S.state.offlineState.storageIssue = err?.message || '';
        snapshot = null;
      }
    }
    if (scope && scope === S.state.cachedBootScope && snapshot) {
      try {
        const saved = await S.fn.cachedOfflineRead(scope, url, snapshot);
        if (saved) return saved;
      } catch (_) {}
    }
    if (snapshot?.operations.some(row => row.state !== 'acknowledged')) {
      if (method === 'GET') {
        try {
          const saved = await S.fn.cachedOfflineRead(scope, url, snapshot);
          if (saved) return saved;
        } catch (_) {}
        if (/\/(products|inventory|cash-register|finance|customers|orders)(\/|\?|$)/.test(url)) { const error = new Error('Phần này chưa có trên máy. Đồng bộ các chứng từ đang chờ rồi tải lại.'); error.code = 'offline_data_missing'; throw error; }
      }
    }
    if (!navigator.onLine && !options?.preferFresh && scope && snapshot && /^\/api\/stores\/[^/]+\/(products|inventory|customers|orders|finance|cash-register|settings|warehouses|analytics)(\/|\?|$)/.test(url)) {
      try {
        const saved = await S.fn.cachedOfflineRead(scope, url, snapshot);
        if (saved) return saved;
      } catch (_) {}
    }
    try {
      if (!navigator.onLine) throw new TypeError('offline');
      // Other business writes must not race ahead of this device's saved ledger.
      const active = activeScope;
      if (!['GET', 'HEAD'].includes(method) && url.startsWith('/api/stores/') && active && S.state.offlineDisk) {
        let pendingOps = [];
        try { pendingOps = await S.state.offlineDisk.operations(active); } catch (_) { pendingOps = []; }
        if (pendingOps.some(row => row.state !== 'acknowledged')) {
          const error = new Error('Đồng bộ các chứng từ đã lưu trên máy trước khi thay đổi dữ liệu chung.'); error.status = 409; error.code = 'offline_pending_operations'; throw error;
        }
      }
      const sendOptions = (method !== 'GET' && options?.body?._slinkOfflineVersion === 1)
        ? (() => { const cleaned = JSON.parse(JSON.stringify(options.body)); delete cleaned._slinkOfflineVersion; delete cleaned._slinkExpectedCashVnd; return { ...options, body: cleaned }; })()
        : options;
      const result = await S.fn.networkRequest(url, sendOptions);
      S.state.offlineState.mode = 'online';
      try {
        if ((method === 'GET' && url === '/api/auth/me') || (method === 'POST' && ['/api/auth/login', '/api/auth/register'].includes(url))) await S.fn.rememberOfflineSession(result);
        if (scope && snapshot && scope === S.fn.cacheScope(url) && readGeneration===S.state.localWriteGeneration) {
          const stored = await S.state.offlineDisk.cacheResponse(scope, url, result, undefined, snapshot.epoch);
          if (!stored) { const current = await S.state.offlineDisk.snapshot(scope); const saved = await S.fn.cachedOfflineRead(scope, url, current); if (saved) return saved; }
        }
      } catch (error) { S.state.offlineState.storageIssue = error.message || 'Chưa lưu được dữ liệu trên máy.'; }
      S.fn.updateOfflineStatus(); return result;
    } catch (error) {
      if ((error.status && error.status < 500) || error.name === 'AbortError') throw error;
      S.state.offlineState.mode = 'offline';
      if (method === 'GET' && S.state.offlineDisk) {
        try {
          if (url === '/api/auth/me') {
            const userId = await S.state.offlineDisk.getMeta('active-user');
            const session = userId ? await S.state.offlineDisk.getMeta('session|' + userId) : null;
            if (session) { S.state.offlineState.cachedAt = session.verifiedAt; S.fn.updateOfflineStatus(); return session; }
          }
          if (scope) { const saved = await S.fn.cachedOfflineRead(scope, url, await S.state.offlineDisk.snapshot(scope)); if (saved) { S.fn.updateOfflineStatus(); return saved; } }
        } catch (idbErr) { S.state.offlineState.storageIssue = idbErr?.message || ''; }
      }
      S.fn.updateOfflineStatus();
      const issue = new Error(method === 'GET' ? 'Dữ liệu này chưa có trên máy. Kết nối mạng để tải về lần đầu.' : 'Việc này cần máy chủ xác nhận. Nội dung đang nhập vẫn được giữ lại.');
      issue.code = method === 'GET' ? 'offline_data_missing' : 'offline_connection_required'; throw issue;
    }
  }


  S.fn.networkRequest = async function networkRequest(url, options) {
    const config = options || {};
    const method = String(config.method || 'GET').toUpperCase();
    const headers = Object.assign({}, config.headers || {});
    if (config.body !== undefined) headers['content-type'] = 'application/json';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const token = S.fn.csrfCookie();
      if (token) headers['x-csrf-token'] = token;
    }
    const controller = new AbortController();
    const cancel = function () { controller.abort(); };
    config.signal?.addEventListener('abort', cancel, { once: true });
    if (config.signal?.aborted) cancel();
    let expired = false;
    const deadline = window.setTimeout(function () { expired = true; controller.abort(); }, 15000);
    try {
    const response = await fetch(url, {
      method: method,
      credentials: 'same-origin',
      headers: headers,
      body: config.body === undefined ? undefined : JSON.stringify(config.body),
      signal: controller.signal,
    });
    const hdrDate = Date.parse(response.headers?.get?.('date') || '');
    if (Number.isFinite(hdrDate)) S.state.serverClockOffsetMs = hdrDate - Date.now();
    let result = {};
    try { result = await response.json(); } catch (e) { /* The server may return a non-JSON gateway error. */ }
    if (!response.ok) {
      const error = new Error(result.error && result.error.message ? result.error.message : 'Không thể kết nối Slink. Vui lòng thử lại.');
      error.status = response.status;
      error.code = result.error && result.error.code;
      throw error;
    }
    return result;
    } catch (error) { if (expired) { const issue = new TypeError('Kết nối chậm. Chứng từ đã lưu sẽ được gửi lại an toàn.'); issue.code = 'connection_timeout'; throw issue; } throw error; }
    finally { window.clearTimeout(deadline); config.signal?.removeEventListener('abort', cancel); }
  }


  S.fn.mapProduct = function mapProduct(row) {
    const product = {
      id: row.id,
      sku: row.sku,
      barcode: row.barcode || '',
      extraBarcodes: Array.isArray(row.extra_barcodes) ? row.extra_barcodes : [],
      imageVersion: Number(row.image_version || 0),
      imageUrl: row.image_content_type ? `/api/stores/${encodeURIComponent(S.state.store.id)}/products/${encodeURIComponent(row.id)}/image?v=${Number(row.image_version)}&savedFor=${encodeURIComponent(S.state.authSession?.user.id || '')}` : '',
      name: row.name,
      category: row.category,
      unit: row.unit,
      purchasePack: row.purchase_pack || null,
      price: Number(row.sale_price_vnd),
      cost: row.cost_vnd == null ? null : Number(row.cost_vnd),
      stock: Number(row.on_hand),
      reserved: Number(row.reserved),
      minStock: Number(row.low_stock_threshold),
      inventoryTracked: row.inventory_tracked,
      serialTracked: Boolean(row.serial_tracked),
      warrantyMonths: Number(row.warranty_months || 0),
      inventoryVersion: Number(row.inventory_version) || 1,
      status: row.status,
      version: row.version,
      variantGroupId: row.variant_group_id || '',
      variantGroupName: row.variant_group_name || '',
      variantAttributes: row.variant_attributes && typeof row.variant_attributes === 'object' ? row.variant_attributes : {},
      tone: 'product-sage',
    };
    S.state.productCache.set(product.id, product);
    return product;
  }


  S.fn.mapCustomer = function mapCustomer(row) {
    const balance = Number(row.balance_vnd) || 0;
    const totalSpent = Number(row.total_spent_vnd) || 0;
    const bonusPoints = Number(row.bonus_points) || 0;
    const loyaltyPoints = row.loyalty_points !== undefined
      ? Number(row.loyalty_points) || 0
      : Math.max(0, Math.floor(totalSpent / 100000) + bonusPoints);
    const loyaltyTier = row.loyalty_tier || (totalSpent >= 50000000 ? 'diamond' : (totalSpent >= 15000000 || ['vip', 'agency'].includes(row.customer_type)) ? 'gold' : totalSpent >= 3000000 ? 'silver' : 'member');
    const tierNames = { diamond: 'Hạng Kim cương', gold: 'Hạng Vàng', silver: 'Hạng Bạc', member: 'Thành viên' };
    const customer = {
      id: row.id,
      customerCode: row.customer_code || '',
      name: row.name,
      phone: row.phone || '',
      email: row.email || '',
      note: row.note || '',
      shippingAddress: row.shipping_address || '',
      customerType: row.customer_type || 'retail',
      creditLimitVnd: row.credit_limit_vnd == null ? '' : String(row.credit_limit_vnd),
      birthday: row.birthday ? String(row.birthday).slice(0, 10) : '',
      gender: row.gender || '',
      companyName: row.company_name || '',
      taxCode: row.tax_code || '',
      discountRateBps: Number(row.discount_rate_bps) || 0,
      bonusPoints,
      loyaltyPoints,
      loyaltyTier,
      tier: tierNames[loyaltyTier] || 'Thành viên',
      points: loyaltyPoints,
      balanceVnd: String(row.balance_vnd || '0'),
      debt: Math.max(0, balance),
      credit: Math.max(0, -balance),
      totalSpent,
      orders: Number(row.order_count) || 0,
      version: row.version,
      createdAt: row.created_at,
      tags: Array.isArray(row.tags) ? row.tags : [],
    };
    S.state.customerCache.set(customer.id, customer);
    return customer;
  }


  S.fn.mapPosCustomer = function mapPosCustomer(row) {
    return {
      id: row.id,
      customerCode: row.customer_code || '',
      name: row.name,
      phone: row.phone || '',
      customerType: row.customer_type || 'retail',
      discountRateBps: Number(row.discount_rate_bps) || 0,
      shippingAddress: row.shipping_address || '',
    };
  }


  S.fn.statusText = function statusText(status, due) {
    if (status === 'pending_sync') return 'Đã lưu trên máy';
    if (status === 'returned') return 'Đã trả hàng';
    if (status === 'partially_returned') return 'Trả một phần';
    if (status === 'partially_returned') return 'Trả một phần';
    if (status === 'voided') return 'Đã hủy';
    if (Number(due) > 0) return 'Còn nợ';
    return 'Hoàn tất';
  }


  S.fn.mapOrder = function mapOrder(row) {
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
      status: S.fn.statusText(row.status, total - paid - returned + refunded),
      subtotal: Number(row.subtotal_vnd) || 0,
      discount: Number(row.discount_vnd) || 0,
      total: total,
      paid: paid,
      refunded: refunded,
      returned: returned,
      due: Math.max(0, total - paid - returned + refunded),
      pointsEarned: Number(row.points_earned || 0),
      pointsRedeemed: Number(row.points_redeemed || 0),
      pointsRedeemedVnd: String(row.points_redeemed_vnd || '0'),
      itemCount: Number(row.line_count) || 0,
      items: [],
      method: '',
      createdAt: row.occurred_at,
      note: row.note || '',
    };
  }


  S.fn.icon = function icon(name, size) { return `<svg width='${size || 18}' height='${size || 18}' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>${S.state.iconPaths[name] || S.state.iconPaths.spark}</svg>`; }

  S.fn.localDate = function localDate(date) { const d = date || new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); } // taste-skill-ignore: real date/time formatting

  S.fn.isoAgo = function isoAgo(days, hour, minute) { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(hour || 10, minute || 0, 0, 0); return d.toISOString(); }

  S.fn.money = function money(amount) { return S.state.vndFormatter.format(Math.round(Number(amount) || 0)); }

  S.fn.moneyVndText = function moneyVndText(value) {
    try {
      const integer = BigInt(String(value == null || value === '' ? '0' : value));
      return S.state.vndFormatter.format(integer);
    } catch (error) { return S.fn.money(value); }
  }

  S.fn.number = function number(value) { return S.state.quantityFormatter.format(Number(value) || 0); }

  S.fn.shortMoney = function shortMoney(value) { const n = Number(value) || 0; if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace('.', ',') + ' tr'; if (n >= 1000) return (n / 1000).toFixed(0) + 'k'; return S.fn.number(n); }

  S.fn.esc = function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  S.fn.humanDate = function humanDate(value, withTime) { const d = new Date(value); if (Number.isNaN(d.getTime())) return ''; return d.toLocaleString('vi-VN', withTime ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' }); }

  S.fn.timeOf = function timeOf(value) { return new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); }

  S.fn.todayLabel = function todayLabel() { return new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }

  S.fn.initials = function initials(name) { return String(name || 'Slink').trim().split(/\s+/).slice(-2).map(function (x) { return x[0]; }).join('').toUpperCase(); }

  S.fn.productById = function productById(id) {
    const currentSearchResult = S.state.page === 'pos' && S.state.posCatalogWarehouseId === S.state.selectedWarehouseId && S.state.posKnownProducts.get(id);
    return currentSearchResult || S.state.store.products.find(function (p) { return p.id === id; }) || S.state.productCache.get(id);
  }

  S.fn.customerById = function customerById(id) { return S.state.store.customers.find(function (c) { return c.id === id; }) || S.state.customerCache.get(id); }

  S.fn.dismissToast = function dismissToast() {
    if (S.state.toastTimer) {
      window.clearTimeout(S.state.toastTimer);
      S.state.toastTimer = null;
    }
    if (S.dom.toastStack) S.dom.toastStack.replaceChildren();
  }

  S.fn.toast = function toast(title, message, tone) {
    if(tone==='error'&&!S.dom.modal.hidden&&S.dom.modal.querySelector('form')){
      const form=S.dom.modal.querySelector('form');let note=form.querySelector('[data-form-message]');
      if(!note){note=document.createElement('p');note.className='form-message';note.dataset.formMessage='true';note.setAttribute('role','alert');form.append(note);}
      note.textContent=title+(message?' · '+message:'');return;
    }
    if(tone==='error'&&S.state.offlineState.mode==='offline'&&/^Chưa (tải|làm mới|tìm được)/.test(title)){S.state.offlineState.issue=message||title;return;}
    if (S.state.toastTimer) {
      window.clearTimeout(S.state.toastTimer);
      S.state.toastTimer = null;
    }
    const node = document.createElement('div');
    node.className = 'toast' + (tone === 'error' ? ' error' : '');
    node.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    node.innerHTML = `<div class='toast-body'><strong>${S.fn.esc(title)}</strong>${message ? `<small>${S.fn.esc(message)}</small>` : ''}</div><button type='button' class='toast-close' data-action='dismiss-toast' aria-label='Đóng thông báo'>×</button>`;
    S.dom.toastStack.replaceChildren(node);
    S.state.toastTimer = window.setTimeout(function () {
      node.remove();
      S.state.toastTimer = null;
    }, tone === 'error' ? 4500 : 2600);
  }


  S.fn.statusBadge = function statusBadge(status) {
    const cls = status === 'Hoàn tất' ? 'success' : status === 'Còn nợ' ? 'warning' : status === 'Đã trả hàng' ? 'neutral' : status === 'Đã hủy' ? 'danger' : 'info';
    return `<span class='badge badge-${cls}'><i class='badge-dot'></i>${S.fn.esc(status)}</span>`;
  }


  S.fn.staffRoleName = function staffRoleName(role) {
    return ({ owner: 'Chủ cửa hàng', manager: 'Quản lý', cashier: 'Thu ngân', stockkeeper: 'Nhân viên kho', accountant: 'Kế toán' })[role] || 'Nhân viên';
  }


  S.fn.staffRoleDescription = function staffRoleDescription(role) {
    return ({
      manager: 'Điều phối bán hàng, trả hàng, kho, tài chính và cài đặt cửa hàng; không được quản lý nhân viên.',
      cashier: 'Tạo đơn bán, cập nhật hồ sơ khách và ghi nhận thu nợ; không được tự hủy đơn hoặc trả hàng.',
      stockkeeper: 'Cập nhật danh mục, kiểm kê tồn và nhận hàng nhập kho.',
      accountant: 'Theo dõi công nợ, thanh toán, thu chi và nghiệp vụ nhập hàng; không bán hàng hoặc sửa danh mục.',
    })[role] || '';
  }


  S.fn.canAccessRoute = function canAccessRoute(route) {
    if (route === 'workspace') return Boolean(S.state.authSession);
    if (route === 'affiliate') return S.state.store.role === 'affiliate';
    if (S.state.store.role === 'affiliate') return ['affiliate', 'settings'].includes(route);
    if (route === 'staff') return S.state.store.role === 'owner';
    if (route === 'settings') return true;
    if (route === 'pos') return S.fn.hasPerm('posSell');
    if (route === 'orders') return S.fn.hasPerm('viewOrders');
    if (route === 'customers') return S.fn.hasPerm('manageCustomers');
    if (route === 'products') return S.fn.hasPerm('editProducts') || S.fn.hasPerm('manageInventory') || S.fn.hasPerm('viewReports');
    if (route === 'inventory') return S.fn.hasPerm('manageInventory') || S.fn.hasPerm('viewCostPrice');
    if (route === 'inventory-count' || route === 'inventory-transfer') return S.fn.hasPerm('manageInventory');
    if (route === 'inventory-receive') return S.fn.hasPerm('manageInventory') || S.fn.hasPerm('recordCashbook');
    if (route === 'suppliers') return S.fn.hasPerm('manageInventory') || S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewFinance');
    if (route === 'finance') return S.fn.hasPerm('viewFinance') || S.fn.hasPerm('recordCashbook');
    if (route === 'reports') return S.fn.hasPerm('viewReports');
    if (route === 'channels') return S.fn.hasPerm('manageInventory') || S.fn.hasPerm('manageSettings');
    if (route === 'promotions') return S.fn.hasPerm('manageSettings');
    if (route === 'audit') return S.fn.hasPerm('viewAudit');
    if (route === 'dashboard') return S.fn.hasPerm('viewReports') || S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('manageInventory') || S.fn.hasPerm('manageSettings');
    return true;
  }


  S.fn.defaultHomeRouteForRole = function defaultHomeRouteForRole() {
    if (S.state.store.role === 'affiliate') return 'workspace';
    if (S.state.store.role === 'cashier') return 'pos';
    if (S.state.store.role === 'stockkeeper') return 'inventory';
    if (S.state.store.role === 'accountant') return 'finance';
    return S.state.taskFocusRoute || 'dashboard';
  }


  S.fn.enhanceRecordLists = function enhanceRecordLists(container) {
    container.querySelectorAll('.pagination-actions').forEach(function (pagination) {
      if (!pagination.querySelector('button')) pagination.hidden = true;
    });
    container.querySelectorAll('.data-table').forEach(function (table) {
      if (table.closest('.desktop-table')) return;
      table.classList.add('record-table'); table.setAttribute('role', 'table');
      const labels = Array.from(table.querySelectorAll('thead th')).map(function (th) { return th.textContent.trim(); });
      table.querySelectorAll('tr').forEach(function (row) { row.setAttribute('role', 'row'); });
      table.querySelectorAll('th').forEach(function (th) { th.setAttribute('role', 'columnheader'); });
      table.querySelectorAll('tbody tr').forEach(function (row) {
        Array.from(row.children).forEach(function (cell, index) { cell.setAttribute('role', 'cell'); if (cell.colSpan === 1) cell.dataset.label = labels[index] || ''; });
      });
    });
  }


  S.fn.restoreVietQrBrightness = function restoreVietQrBrightness() {
    if (S.state.vietqrBrightnessActive) {
      S.state.vietqrBrightnessActive = false;
      window.SlinkPosHardware?.setScreenBrightness(-1);
    }
  }


  S.fn.showModal = function showModal(title, subtitle, body, footer, wide, options = {}) {
    S.fn.stopScanCamera();
    S.fn.restoreVietQrBrightness();
    document.querySelectorAll('details.catalog-more[open]').forEach(function (d) { d.open = false; });
    if (S.dom.modal.hidden) {
      const active = document.activeElement;
      S.state.modalReturnFocus = active && active !== document.body && !S.dom.modal.contains(active) ? active : null;
    }
    S.state.modalGeneration += 1;
    S.state.modalEditedField = null;
    S.dom.modal.className = 'modal' + (wide ? ' wide' : '') + (options.productEditor ? ' product-editor' : '');
    const close = `<button class='modal-close' type='button' data-action='close-modal' aria-label='Đóng'>×</button>`;
    const headerActions = options.headerActions ? `<div class='product-editor-actions'>${options.headerActions}${close}</div>` : close;
    S.dom.modal.innerHTML = `<div class='modal-head'><div><h2 id='modal-title'>${S.fn.esc(title)}</h2><p id='modal-description' ${subtitle ? '' : 'hidden'}>${S.fn.esc(subtitle || '')}</p></div>${headerActions}</div><div class='modal-body'>${body || ''}</div>${footer ? `<div class='modal-footer'>${footer}</div>` : ''}`;
    S.dom.modal.hidden = false; S.dom.backdrop.hidden = false; document.body.style.overflow = 'hidden';
    window.SlinkMoneyFields.enhance(S.dom.modal);
    S.fn.syncTabGliders?.(S.dom.modal);
    S.fn.updateProductHints(S.dom.modal.querySelector('[data-form="product"],[data-form="quick-product"]'));
    const first = S.dom.modal.querySelector('input:not([type=hidden]),select,button');
    if (first) window.requestAnimationFrame(function () {
      if (first.isConnected && !S.dom.modal.hidden && !S.dom.modal.contains(document.activeElement)) first.focus({ preventScroll: true });
    });
  }


  S.fn.requestCloseModal = function requestCloseModal(afterClose) {
    if (S.dom.modal.hidden) return;
    S.fn.closeProductBarcode();
    S.fn.closeSerialCamera();
    const proceed = typeof afterClose === 'function' ? afterClose : S.fn.dismissModal;
    const form = S.dom.modal.querySelector('form[data-user-edited="true"]');
    if (S.state.activeWrites && form) {
      S.fn.toast('Đang lưu', 'Chờ ứng dụng xác nhận kết quả.', 'error');
      return;
    }
    if (!form) return proceed();
    const existing = S.dom.modal.querySelector('.modal-discard');
    if (existing) { existing.querySelector('[data-action="keep-modal-input"]')?.focus(); return; }
    const actions = document.createElement('section');
    actions.className = 'modal-discard';
    actions.innerHTML = `<p>Giữ nội dung đang nhập?</p><div><button class='btn btn-secondary' type='button' data-action='discard-modal-input'>Bỏ thay đổi</button><button class='btn btn-primary' type='button' data-action='keep-modal-input'>Tiếp tục nhập</button></div>`;
    actions.querySelector('[data-action="discard-modal-input"]').addEventListener('click', () => {
      if (S.state.activeWrites) return;
      actions.remove();
      proceed();
    });
    const footer = S.dom.modal.querySelector('.modal-footer');
    if (footer) footer.before(actions);
    else S.dom.modal.appendChild(actions);
    actions.querySelector('[data-action="keep-modal-input"]').focus({ preventScroll: true });
  }


  S.fn.dismissModal = function dismissModal() {
    if (S.dom.modal.querySelector('#business-profile-onboarding')) S.fn.deferBusinessProfile();
    else S.fn.closeModal();
  }


  S.fn.closeModal = function closeModal() {
    const wasOpen = !S.dom.modal.hidden;
    S.fn.stopScanCamera();
    S.fn.restoreVietQrBrightness();
    S.dom.modal.classList.remove('modal-vietqr-fullscreen');
    S.dom.modal.hidden = true;
    S.dom.backdrop.hidden = true;
    S.state.modalEditedField = null;
    document.body.style.overflow = document.querySelector('#drawer-cart.open') ? 'hidden' : '';
    if (!wasOpen) return;
    const focusTarget = S.state.modalReturnFocus;
    S.state.modalReturnFocus = null;
    if (focusTarget && focusTarget.isConnected && !focusTarget.disabled) window.requestAnimationFrame(function () {
      if (S.dom.modal.hidden) focusTarget.focus({ preventScroll: true });
    });
    if(S.state.offlineRefreshDue)window.setTimeout(S.fn.refreshAfterOfflineSync,150);
  }


  S.fn.keepModalFocus = function keepModalFocus(event) {
    const dialog = S.dom.modal.hidden ? document.querySelector('#drawer-cart.open') : S.dom.modal;
    if (!dialog || event.key !== 'Tab') return;
    const focusable = Array.from(dialog.querySelectorAll('a[href],summary,button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      .filter(function (element) { return !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0; });
    if (!focusable.length) {
      event.preventDefault();
      dialog.setAttribute('tabindex', '-1');
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }


  S.fn.modalForm = function modalForm(title, subtitle, form, submitLabel, wide) {
    S.fn.showModal(title, subtitle, form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>${submitLabel || 'Lưu'}</button>`, wide);
  }


  S.fn.applyAppUpdateState = function applyAppUpdateState(state) {
    S.state.appUpdateState = state;
    const panel = S.dom.root.querySelector('[data-app-update-state]');
    if (!panel) return;
    const labels = { idle: 'Tự kiểm tra bản mới khi mở ứng dụng.', checking: 'Đang kiểm tra bản mới…', downloading: 'Đang tải bản mới ở nền…', ready: 'Bản ' + (state.nextVersion || '') + ' đã sẵn sàng.', current: 'Đang dùng bản mới nhất.', unpublished: 'Chưa có bản cập nhật được phát hành.', unavailable: 'Chưa kiểm tra được. Ứng dụng sẽ tự thử lại.' };
    panel.querySelector('[data-app-version]').textContent = 'Slink ' + state.versionName;
    panel.querySelector('[data-app-update-message]').textContent = labels[state.status] || labels.idle;
    panel.querySelector('[data-action="install-app-update"]').hidden = state.status !== 'ready';
    panel.querySelector('[data-action="check-app-update"]').disabled = ['checking', 'downloading'].includes(state.status);
  }
  window.addEventListener('slink-app-update', event => S.fn.applyAppUpdateState(event.detail));

  S.fn.nativeAction = function nativeAction(payload) {
    return new Promise((resolve, reject) => {
      const id = S.fn.newIdempotencyKey();
      S.state.nativeRequests.set(id, { resolve, reject });
      try { window.SlinkAndroid.postMessage(JSON.stringify({ ...payload, id: id })); }
      catch (error) { S.state.nativeRequests.delete(id); reject(error); }
    });
  }
  if (window.SlinkAndroid) window.SlinkAndroid.onmessage = function (event) {
    let result;
    try { result = JSON.parse(event.data); } catch (_) { return; }
    const pending = S.state.nativeRequests.get(result.id);
    if (!pending) return;
    S.state.nativeRequests.delete(result.id);
    if (result.update) { S.fn.applyAppUpdateState(result.update); pending.resolve(result.update); }
    else if (result.status === 'ok') pending.resolve(result);
    else if (['saved', 'opened', 'canceled'].includes(result.status)) pending.resolve(result.status);
    else pending.reject(new Error(result.message || 'Thao tác thiết bị chưa hoàn tất. Hãy thử lại.'));
  };


  S.fn.download = async function download(name, content, type) {
    if (window.SlinkAndroid) {
      try {
        const status = await S.fn.nativeAction({ type: 'save', name: name, content: content, mime: type || 'text/plain' });
        if (status === 'saved') S.fn.toast('Đã lưu tệp', name);
        return status === 'saved';
      } catch (error) { S.fn.toast('Chưa lưu được tệp', error.message, 'error'); return false; }
    }
    const blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return true;
  }


  S.fn.canExportData = function canExportData() {
    return S.fn.hasPerm('exportData') || S.fn.hasPerm('manageInventory') || S.fn.hasPerm('viewReports') || S.fn.hasPerm('recordCashbook');
  }


  S.fn.openExportDialog = function openExportDialog() {
    const groupsHtml = S.state.exportGroups.map(function (group) {
      const options = group.options.filter(function (option) { return typeof option[2] === 'function' ? option[2]() : false; });
      return options.length ? `<optgroup label='${S.fn.esc(group.label)}'>${options.map(function (option) { return `<option value='${option[0]}'>${S.fn.esc(option[1])}</option>`; }).join('')}</optgroup>` : '';
    }).join('');
    if (!groupsHtml) return S.fn.toast('Không có quyền xuất dữ liệu', 'Vai trò tài khoản hiện tại không được tải dữ liệu cửa hàng.', 'error');
    const warehouseOptions = `<option value=''>Tất cả kho</option>${S.state.warehouses.map(function (warehouse) { return `<option value='${S.fn.esc(warehouse.id)}'>${S.fn.esc(warehouse.name)}${warehouse.is_default ? ' · Kho chính' : ''}</option>`; }).join('')}`;
    const warehouseField = S.state.warehouses.length ? `<div class='form-field full'><label class='input-label' for='export-warehouse'>Lọc theo kho (tùy chọn)</label><div class='select-wrap'><select class='input' id='export-warehouse'>${warehouseOptions}</select></div></div>` : '';
    const body = `<div class='form-grid'><div class='form-field full'><label class='input-label' for='export-dataset'>Loại dữ liệu *</label><div class='select-wrap'><select class='input' id='export-dataset' required>${groupsHtml}</select></div></div>${warehouseField}<div class='form-field'><label class='input-label' for='export-from'>Từ ngày (tùy chọn)</label><input class='input' id='export-from' type='date'/></div><div class='form-field'><label class='input-label' for='export-to'>Đến ngày (tùy chọn)</label><input class='input' id='export-to' type='date'/></div></div><div class='modal-note'>Bỏ trống ngày để xuất toàn bộ. CSV tồn kho luôn chỉ chứa một kho để kiểm kê đúng địa điểm; nếu chưa chọn kho, Slink dùng kho đang mở. Với biến động kho, phiếu nhập, đơn đặt hàng và đơn kênh bán, có thể chọn “Tất cả kho” hoặc lọc theo một kho được giao. Đơn kênh bán xuất từng dòng hàng; trạng thái thanh toán trong tệp là ảnh chụp trên kênh, không phải giao dịch tài chính Slink. Khoảng ngày tính theo múi giờ cửa hàng; tồn kho lọc theo lần thay đổi tồn gần nhất, sổ lọc theo ngày phát sinh. Mỗi tệp tối đa 50.000 dòng; số tiền giữ nguyên bằng VND.</div>`;
    const footer = `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='button' data-action='export-dataset'>Tải tệp CSV</button>`;
    S.fn.showModal('Xuất dữ liệu cửa hàng', 'Tải dữ liệu đã ghi nhận trên máy chủ để lưu trữ hoặc làm báo cáo.', body, footer, true);
  }


  S.fn.exportCsv = async function exportCsv(dataset, from, to, button, warehouseId) {
    if (S.state.exportInProgress) return;
    const filename = S.state.exportFiles[dataset];
    if (!filename) return S.fn.toast('Chưa xuất được dữ liệu', 'Hãy chọn một loại dữ liệu trong danh sách.', 'error');
    S.state.exportInProgress = true;
    if (button) button.disabled = true;
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    if (dataset === 'inventory' && (warehouseId || S.state.selectedWarehouseId)) query.set('warehouseId', warehouseId || S.state.selectedWarehouseId);
    else if (['inventory-movements', 'purchases', 'purchase-orders', 'channel-orders'].includes(dataset) && warehouseId) query.set('warehouseId', warehouseId);
    const suffix = query.toString();
    try {
      const response = await fetch(`/api/stores/${encodeURIComponent(S.state.store.id)}/exports/${encodeURIComponent(dataset)}${suffix ? '?' + suffix : ''}`, {
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
      S.fn.download(filename, file, 'text/csv;charset=utf-8');
      S.fn.toast('Đã xuất tệp CSV', `${filename} · ${from || to ? `${from || 'đầu kỳ'} đến ${to || 'hiện tại'}` : 'toàn bộ dữ liệu'}`);
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa xuất được dữ liệu', error.message, 'error');
    } finally {
      S.state.exportInProgress = false;
      if (button && button.isConnected) button.disabled = false;
    }
  }


  S.state.store = S.fn.emptyStore();
  S.state.posPrefs = S.fn.loadPosPrefs();
  S.state.offlineOwner = S.fn.newIdempotencyKey();
  S.state.exportGroups = [
    { label: 'Danh mục và kho', options: [
      ['products', 'Danh mục sản phẩm', () => S.fn.hasPerm('viewProducts') && (S.fn.hasPerm('editProducts') || S.fn.hasPerm('manageInventory') || S.fn.hasPerm('viewReports'))],
      ['inventory', 'Tồn kho hiện tại theo kho', () => S.fn.hasPerm('manageInventory') || S.fn.hasPerm('viewCostPrice')],
      ['inventory-movements', 'Lịch sử biến động kho', () => S.fn.hasPerm('manageInventory') || S.fn.hasPerm('viewCostPrice')],
    ] },
    { label: 'Khách hàng và bán hàng', options: [
      ['customers', 'Hồ sơ khách hàng', () => S.fn.hasPerm('manageCustomers') && (S.fn.hasPerm('viewReports') || S.fn.hasPerm('recordCashbook'))],
      ['customer-ledger', 'Sổ công nợ khách hàng', () => S.fn.hasPerm('manageCustomers') && (S.fn.hasPerm('viewReports') || S.fn.hasPerm('recordCashbook'))],
      ['orders', 'Đơn hàng', () => S.fn.hasPerm('viewOrders') && (S.fn.hasPerm('viewReports') || S.fn.hasPerm('recordCashbook'))],
      ['channel-orders', 'Đơn kênh bán ghi nhận thủ công', () => S.fn.hasPerm('manageInventory') || S.fn.hasPerm('manageSettings')],
      ['order-lines', 'Chi tiết sản phẩm trong đơn', () => S.fn.hasPerm('viewOrders') && (S.fn.hasPerm('viewReports') || S.fn.hasPerm('recordCashbook'))],
      ['payments', 'Giao dịch thanh toán', () => S.fn.hasPerm('viewReports') || S.fn.hasPerm('recordCashbook')],
      ['returns', 'Chi tiết hàng trả', () => S.fn.hasPerm('viewReports') || S.fn.hasPerm('recordCashbook')],
      ['refunds', 'Giao dịch hoàn tiền', () => S.fn.hasPerm('viewReports') || S.fn.hasPerm('recordCashbook')],
    ] },
    { label: 'Thu chi và nhập hàng', options: [
      ['cashbook', 'Sổ thu chi', () => S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports')],
      ['suppliers', 'Nhà cung cấp', () => S.fn.hasPerm('manageInventory') || S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports')],
      ['supplier-ledger', 'Sổ công nợ nhà cung cấp', () => S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports')],
      ['purchase-orders', 'Đơn đặt hàng', () => S.fn.hasPerm('manageInventory') || S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports')],
      ['purchases', 'Phiếu nhập và mặt hàng', () => S.fn.hasPerm('manageInventory') || S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('viewReports')],
    ] },
  ];

})();
