'use strict';

const { ApiError, authenticate } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { allowedWarehouseIds, findAccessibleWarehouse } = require('./warehouse-access');

const MAX_EXPORT_ROWS = 50_000;
const FINANCE_EXPORT_ROLES = new Set(['owner', 'manager', 'accountant']);
const STOCK_EXPORT_ROLES = new Set(['owner', 'manager', 'stockkeeper', 'accountant']);
const CHANNEL_ORDER_EXPORT_ROLES = new Set(['owner', 'manager', 'stockkeeper']);
const EXPORT_ROLES = {
  products: STOCK_EXPORT_ROLES, inventory: STOCK_EXPORT_ROLES, 'inventory-movements': STOCK_EXPORT_ROLES,
  customers: FINANCE_EXPORT_ROLES, 'customer-ledger': FINANCE_EXPORT_ROLES,
  orders: FINANCE_EXPORT_ROLES, 'order-lines': FINANCE_EXPORT_ROLES, payments: FINANCE_EXPORT_ROLES,
  'channel-orders': CHANNEL_ORDER_EXPORT_ROLES,
  returns: FINANCE_EXPORT_ROLES, refunds: FINANCE_EXPORT_ROLES, cashbook: FINANCE_EXPORT_ROLES,
  suppliers: STOCK_EXPORT_ROLES, 'supplier-ledger': FINANCE_EXPORT_ROLES, purchases: STOCK_EXPORT_ROLES, 'purchase-orders': STOCK_EXPORT_ROLES,
};

// These queries and their column definitions are deliberately static. The route
// never accepts SQL fragments or column names from the request.
const EXPORTS = {
  products: {
    filename: 'slink-san-pham.csv',
    columns: [
      ['Mã sản phẩm', 'id', 'text'], ['Phiên bản dữ liệu', 'version', 'number'], ['SKU', 'sku', 'text'], ['Mã vạch', 'barcode', 'text'],
      ['Tên sản phẩm', 'name', 'text'], ['Danh mục', 'category', 'text'], ['Đơn vị', 'unit', 'text'],
      ['Mã nhóm biến thể', 'variant_group_id', 'text'], ['Tên nhóm biến thể', 'variant_group_name', 'text'], ['Thuộc tính biến thể', 'variant_attributes', 'text'],
      ['Giá bán (VND)', 'sale_price_vnd', 'number'], ['Giá vốn (VND)', 'cost_vnd', 'number'],
      ['Ngưỡng tồn thấp', 'low_stock_threshold', 'number'], ['Theo dõi tồn kho', 'inventory_tracked', 'text'],
      ['Cập nhật SKU', 'update_sku', 'text'], ['Cập nhật mã vạch', 'update_barcode', 'text'],
      ['Xóa mã vạch', 'clear_barcode', 'text'],
      ['Cập nhật tên sản phẩm', 'update_name', 'text'], ['Cập nhật danh mục', 'update_category', 'text'],
      ['Cập nhật đơn vị', 'update_unit', 'text'], ['Giá bán mới (VND)', 'update_sale_price_vnd', 'number'],
      ['Giá vốn mới (VND)', 'update_cost_vnd', 'number'], ['Ngưỡng tồn mới', 'update_low_stock_threshold', 'number'],
      ['Tồn thực tế', 'on_hand', 'number'], ['Đang giữ', 'reserved', 'number'], ['Trạng thái', 'status', 'text'],
      ['Ngày tạo', 'created_at', 'date'], ['Cập nhật gần nhất', 'updated_at', 'date'],
    ],
    dateColumn: 'p.created_at', orderBy: 'p.created_at, p.id',
    sql: `SELECT p.id, p.sku, p.barcode, p.name, p.category, p.unit,
                 p.variant_group_id, p.variant_group_name, p.variant_attributes::text AS variant_attributes,
                 p.version, p.sale_price_vnd::text AS sale_price_vnd, p.cost_vnd::text AS cost_vnd,
                 p.low_stock_threshold::text AS low_stock_threshold, p.inventory_tracked::text AS inventory_tracked,
                 ''::text AS update_sku, ''::text AS update_barcode, ''::text AS clear_barcode, ''::text AS update_name,
                 ''::text AS update_category, ''::text AS update_unit, ''::text AS update_sale_price_vnd,
                 ''::text AS update_cost_vnd, ''::text AS update_low_stock_threshold,
                 COALESCE(stock.on_hand, '0') AS on_hand, COALESCE(stock.reserved, '0') AS reserved,
                 p.status, p.created_at, p.updated_at
          FROM products p LEFT JOIN LATERAL (
            SELECT SUM(b.on_hand)::text AS on_hand, SUM(b.reserved)::text AS reserved
            FROM inventory_balances b WHERE b.store_id = p.store_id AND b.product_id = p.id
              AND ($6::uuid[] IS NULL OR b.warehouse_id = ANY($6))
          ) stock ON true
          WHERE p.store_id = $1`,
  },
  inventory: {
    filename: 'slink-ton-kho.csv',
    columns: [
      ['Mã kho', 'warehouse_id', 'text'], ['Kho', 'warehouse_name', 'text'],
      ['Mã sản phẩm', 'id', 'text'], ['SKU', 'sku', 'text'], ['Tên sản phẩm', 'name', 'text'],
      ['Danh mục', 'category', 'text'], ['Đơn vị', 'unit', 'text'], ['Tồn thực tế', 'on_hand', 'number'],
      ['Đang giữ', 'reserved', 'number'], ['Phiên bản tồn kho', 'inventory_version', 'number'], ['Mức cảnh báo', 'low_stock_threshold', 'number'],
      ['Giá vốn (VND)', 'cost_vnd', 'number'], ['Giá trị tồn theo giá vốn (VND)', 'stock_value_vnd', 'number'],
      ['Theo dõi tồn kho', 'inventory_tracked', 'text'], ['Trạng thái sản phẩm', 'status', 'text'],
      ['Biến động gần nhất', 'latest_movement_type', 'text'], ['Số lượng thay đổi', 'latest_quantity_delta', 'number'],
      ['Lý do thay đổi', 'latest_reason', 'text'], ['Thời điểm thay đổi', 'latest_occurred_at', 'date'],
    ],
    dateColumn: 'b.updated_at', orderBy: 'p.name, p.id',
    sql: `SELECT w.id AS warehouse_id, w.name AS warehouse_name,
                 p.id, p.sku, p.name, p.category, p.unit, b.on_hand::text AS on_hand,
                 b.reserved::text AS reserved, b.version AS inventory_version, p.low_stock_threshold::text AS low_stock_threshold,
                 p.cost_vnd::text AS cost_vnd, (p.cost_vnd * b.on_hand)::text AS stock_value_vnd,
                 p.inventory_tracked::text AS inventory_tracked, p.status,
                 latest.movement_type AS latest_movement_type, latest.quantity_delta::text AS latest_quantity_delta,
                 latest.reason AS latest_reason, latest.occurred_at AS latest_occurred_at, p.updated_at
          FROM products p JOIN inventory_balances b ON b.store_id = p.store_id AND b.product_id = p.id AND b.warehouse_id = $6
          JOIN warehouses w ON w.store_id = b.store_id AND w.id = b.warehouse_id AND w.status = 'active'
          LEFT JOIN LATERAL (
            SELECT movement_type, quantity_delta, reason, occurred_at FROM inventory_movements m
            WHERE m.store_id = p.store_id AND m.product_id = p.id AND m.warehouse_id = $6
            ORDER BY m.occurred_at DESC, m.id DESC LIMIT 1
          ) latest ON true
          WHERE p.store_id = $1 AND p.inventory_tracked = true AND p.status = 'active'`,
  },
  'inventory-movements': {
    filename: 'slink-bien-dong-kho.csv',
    columns: [
      ['Mã kho', 'warehouse_id', 'text'], ['Kho', 'warehouse_name', 'text'],
      ['Mã biến động', 'id', 'text'], ['Mã sản phẩm', 'product_id', 'text'], ['SKU', 'sku', 'text'],
      ['Tên sản phẩm', 'product_name', 'text'], ['Loại biến động', 'movement_type', 'text'],
      ['Số lượng thay đổi', 'quantity_delta', 'number'], ['Tồn sau thay đổi', 'quantity_after', 'number'],
      ['Lý do', 'reason', 'text'], ['Loại chứng từ nguồn', 'source_type', 'text'], ['Mã chứng từ nguồn', 'source_id', 'text'],
      ['Người ghi nhận', 'actor_name', 'text'], ['Thời điểm phát sinh', 'occurred_at', 'date'],
    ],
    dateColumn: 'm.occurred_at', orderBy: 'm.occurred_at, m.id',
    sql: `SELECT m.warehouse_id, w.name AS warehouse_name, m.id, m.product_id, p.sku, p.name AS product_name, m.movement_type,
                 m.quantity_delta::text AS quantity_delta, m.quantity_after::text AS quantity_after,
                 m.reason, m.source_type, m.source_id, u.display_name AS actor_name, m.occurred_at
          FROM inventory_movements m JOIN products p ON p.store_id = m.store_id AND p.id = m.product_id
          JOIN warehouses w ON w.store_id = m.store_id AND w.id = m.warehouse_id
          JOIN users u ON u.id = m.actor_user_id WHERE m.store_id = $1 AND ($6::uuid IS NULL OR m.warehouse_id = $6)`,
  },
  customers: {
    filename: 'slink-khach-hang.csv',
    columns: [
      ['Mã khách hàng', 'id', 'text'], ['Tên khách hàng', 'name', 'text'], ['Số điện thoại', 'phone', 'text'],
      ['Email', 'email', 'text'], ['Ghi chú', 'note', 'text'], ['Nhãn phân loại', 'tags', 'text'], ['Trạng thái', 'status', 'text'],
      ['Công nợ ròng (VND)', 'balance_vnd', 'number'], ['Số đơn không bị hủy', 'order_count', 'number'],
      ['Chi tiêu thuần (VND)', 'total_spent_vnd', 'number'], ['Ngày tạo', 'created_at', 'date'],
      ['Cập nhật gần nhất', 'updated_at', 'date'],
    ],
    dateColumn: 'c.created_at', orderBy: 'c.created_at, c.id',
    sql: `SELECT c.id, c.name, c.phone, c.email, c.note,
                 COALESCE((SELECT string_agg(active.tag, ', ' ORDER BY active.tag_key)
                           FROM (
                             SELECT DISTINCT ON (tag_key) tag_key, tag, operation
                             FROM customer_tag_events t WHERE t.store_id = c.store_id AND t.customer_id = c.id
                             ORDER BY tag_key, id DESC
                           ) active WHERE active.operation = 'added'), '') AS tags,
                 c.status,
                 COALESCE((SELECT SUM(l.debit_vnd - l.credit_vnd) FROM customer_ledger_entries l
                           WHERE l.store_id = c.store_id AND l.customer_id = c.id), 0)::text AS balance_vnd,
                 COALESCE((SELECT COUNT(*) FROM orders o WHERE o.store_id = c.store_id AND o.customer_id = c.id AND o.status <> 'voided'), 0)::text AS order_count,
                 COALESCE((SELECT SUM(o.total_vnd - COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r
                           WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0))
                           FROM orders o WHERE o.store_id = c.store_id AND o.customer_id = c.id AND o.status <> 'voided'), 0)::text AS total_spent_vnd,
                 c.created_at, c.updated_at
          FROM customers c WHERE c.store_id = $1`,
  },
  'customer-ledger': {
    filename: 'slink-so-cong-no-khach-hang.csv',
    columns: [
      ['Mã bút toán', 'id', 'text'], ['Mã khách hàng', 'customer_id', 'text'], ['Khách hàng', 'customer_name', 'text'],
      ['Điện thoại', 'phone', 'text'], ['Loại bút toán', 'entry_type', 'text'], ['Nợ phát sinh (VND)', 'debit_vnd', 'number'],
      ['Có phát sinh (VND)', 'credit_vnd', 'number'], ['Loại chứng từ nguồn', 'source_type', 'text'],
      ['Mã chứng từ nguồn', 'source_id', 'text'], ['Ghi chú', 'note', 'text'], ['Người ghi nhận', 'actor_name', 'text'],
      ['Thời điểm phát sinh', 'occurred_at', 'date'],
    ],
    dateColumn: 'l.occurred_at', orderBy: 'l.occurred_at, l.id',
    sql: `SELECT l.id, l.customer_id, c.name AS customer_name, c.phone, l.entry_type,
                 l.debit_vnd::text AS debit_vnd, l.credit_vnd::text AS credit_vnd,
                 l.source_type, l.source_id, l.note, u.display_name AS actor_name, l.occurred_at
          FROM customer_ledger_entries l JOIN customers c ON c.store_id = l.store_id AND c.id = l.customer_id
          JOIN users u ON u.id = l.actor_user_id WHERE l.store_id = $1`,
  },
  orders: {
    filename: 'slink-don-hang.csv',
    columns: [
      ['Mã đơn', 'order_number', 'text'], ['Mã đơn hàng', 'id', 'text'], ['Trạng thái', 'status', 'text'],
      ['Mã khách hàng', 'customer_id', 'text'], ['Khách hàng', 'customer_name', 'text'], ['Điện thoại', 'customer_phone', 'text'],
      ['Thu ngân', 'cashier_name', 'text'], ['Tạm tính (VND)', 'subtotal_vnd', 'number'], ['Giảm giá (VND)', 'discount_vnd', 'number'],
      ['Thuế (VND)', 'tax_vnd', 'number'], ['Tổng đơn (VND)', 'total_vnd', 'number'], ['Đã thu (VND)', 'paid_vnd', 'number'],
      ['Tiền mặt khách đưa (VND)', 'cash_received_vnd', 'number'], ['Tiền thối (VND)', 'cash_change_vnd', 'number'],
      ['Đã hoàn thành công (VND)', 'refunded_vnd', 'number'], ['Giá trị hàng trả (VND)', 'return_total_vnd', 'number'],
      ['Mã kho hoàn tồn khi hủy', 'void_restock_warehouse_code', 'text'], ['Kho hoàn tồn khi hủy', 'void_restock_warehouse_name', 'text'],
      ['Còn phải thu theo đơn (VND)', 'receivable_vnd', 'number'], ['Số dòng hàng', 'line_count', 'number'],
      ['Ghi chú', 'note', 'text'], ['Thời điểm bán', 'occurred_at', 'date'], ['Cập nhật gần nhất', 'updated_at', 'date'],
    ],
    dateColumn: 'o.occurred_at', orderBy: 'o.occurred_at, o.id',
    sql: `SELECT o.id, o.order_number, o.status, o.customer_id, c.name AS customer_name, c.phone AS customer_phone,
                 u.display_name AS cashier_name, o.subtotal_vnd::text AS subtotal_vnd,
                 o.discount_vnd::text AS discount_vnd, o.tax_vnd::text AS tax_vnd, o.total_vnd::text AS total_vnd,
                 o.cash_received_vnd::text AS cash_received_vnd, o.cash_change_vnd::text AS cash_change_vnd,
                 COALESCE((SELECT SUM(p.amount_vnd) FROM payments p WHERE p.store_id = o.store_id AND p.order_id = o.id AND p.status = 'succeeded'), 0)::text AS paid_vnd,
                 COALESCE((SELECT SUM(f.amount_vnd) FROM refunds f JOIN returns r ON r.store_id = f.store_id AND r.id = f.return_id
                           WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed' AND f.status = 'succeeded'), 0)::text AS refunded_vnd,
                 COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0)::text AS return_total_vnd,
                 GREATEST(o.total_vnd - COALESCE((SELECT SUM(p.amount_vnd) FROM payments p WHERE p.store_id = o.store_id AND p.order_id = o.id AND p.status = 'succeeded'), 0)
                   - COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0), 0)::text AS receivable_vnd,
                 COALESCE((SELECT COUNT(*) FROM order_lines l WHERE l.store_id = o.store_id AND l.order_id = o.id), 0)::text AS line_count,
                 vw.code AS void_restock_warehouse_code, vw.name AS void_restock_warehouse_name,
                 o.note, o.occurred_at, o.updated_at
          FROM orders o LEFT JOIN customers c ON c.store_id = o.store_id AND c.id = o.customer_id
          LEFT JOIN warehouses vw ON vw.store_id = o.store_id AND vw.id = o.void_restock_warehouse_id
          JOIN users u ON u.id = o.cashier_id WHERE o.store_id = $1`,
  },
  'channel-orders': {
    filename: 'slink-don-kenh-ban.csv',
    columns: [
      ['Mã đơn kênh', 'external_order_ref', 'text'], ['Mã nội bộ', 'id', 'text'], ['Kênh', 'channel_code', 'text'],
      ['Gian hàng', 'shop_label', 'text'], ['Trạng thái xử lý', 'fulfillment_status', 'text'],
      ['Thanh toán hiển thị trên kênh', 'payment_status_snapshot', 'text'], ['Kho giao', 'warehouse_name', 'text'],
      ['Người nhận', 'customer_name_snapshot', 'text'], ['Ghi chú nội bộ', 'internal_note', 'text'],
      ['SKU trên kênh', 'external_sku_snapshot', 'text'], ['SKU Slink', 'internal_sku_snapshot', 'text'],
      ['Tên sản phẩm', 'product_name_snapshot', 'text'], ['Đơn vị', 'unit_snapshot', 'text'],
      ['Số lượng', 'quantity', 'number'], ['Đơn giá theo kênh (VND)', 'unit_price_vnd', 'number'],
      ['Thành tiền dòng (VND)', 'line_total_vnd', 'number'], ['Tổng đơn (VND)', 'total_vnd', 'number'],
      ['Phiên bản', 'version', 'number'], ['Tạo lúc', 'created_at', 'date'], ['Đã gửi lúc', 'shipped_at', 'date'],
      ['Đã giao lúc', 'delivered_at', 'date'], ['Đã hủy lúc', 'cancelled_at', 'date'],
    ],
    dateColumn: 'co.created_at', orderBy: 'co.created_at, co.id, col.line_number',
    sql: `SELECT co.external_order_ref, co.id, cp.channel_code, cp.shop_label, co.fulfillment_status,
                 co.payment_status_snapshot, w.name AS warehouse_name, co.customer_name_snapshot, co.internal_note,
                 col.external_sku_snapshot, col.internal_sku_snapshot, col.product_name_snapshot, col.unit_snapshot,
                 col.quantity::text AS quantity, col.unit_price_vnd::text AS unit_price_vnd,
                 col.line_total_vnd::text AS line_total_vnd, co.total_vnd::text AS total_vnd, co.version,
                 co.created_at, co.shipped_at, co.delivered_at, co.cancelled_at
          FROM channel_orders co
          JOIN sales_channel_profiles cp ON cp.store_id = co.store_id AND cp.id = co.channel_profile_id
          JOIN warehouses w ON w.store_id = co.store_id AND w.id = co.fulfillment_warehouse_id
          JOIN channel_order_lines col ON col.store_id = co.store_id AND col.order_id = co.id
          WHERE co.store_id = $1 AND ($6::uuid IS NULL OR co.fulfillment_warehouse_id = $6)`,
  },
  'order-lines': {
    filename: 'slink-chi-tiet-don-hang.csv',
    columns: [
      ['Mã đơn', 'order_number', 'text'], ['Mã dòng hàng', 'id', 'text'], ['Mã sản phẩm', 'product_id', 'text'],
      ['Mã SKU', 'sku', 'text'], ['Tên sản phẩm lúc bán', 'product_name', 'text'], ['Đơn vị', 'unit', 'text'],
      ['Số lượng bán', 'quantity', 'number'], ['Đơn giá (VND)', 'unit_price_vnd', 'number'],
      ['Giá vốn lúc bán (VND)', 'unit_cost_vnd', 'number'], ['Giảm giá dòng (VND)', 'discount_vnd', 'number'],
      ['Thuế dòng (VND)', 'tax_vnd', 'number'], ['Thành tiền (VND)', 'line_total_vnd', 'number'],
      ['Số lượng đã trả', 'returned_quantity', 'number'], ['Thời điểm bán', 'occurred_at', 'date'],
    ],
    dateColumn: 'o.occurred_at', orderBy: 'o.occurred_at, o.id, l.id',
    sql: `SELECT o.order_number, l.id, l.product_id, l.sku_snapshot AS sku, l.product_name_snapshot AS product_name,
                 l.unit_snapshot AS unit, l.quantity::text AS quantity, l.unit_price_vnd::text AS unit_price_vnd,
                 l.unit_cost_vnd::text AS unit_cost_vnd, l.discount_vnd::text AS discount_vnd,
                 l.tax_vnd::text AS tax_vnd, l.line_total_vnd::text AS line_total_vnd,
                 COALESCE((SELECT SUM(rl.quantity) FROM return_lines rl JOIN returns r ON r.store_id = rl.store_id AND r.id = rl.return_id
                           WHERE rl.store_id = l.store_id AND rl.order_line_id = l.id AND r.status = 'completed'), 0)::text AS returned_quantity,
                 o.occurred_at
          FROM order_lines l JOIN orders o ON o.store_id = l.store_id AND o.id = l.order_id WHERE l.store_id = $1`,
  },
  payments: {
    filename: 'slink-thanh-toan.csv',
    columns: [
      ['Mã thanh toán', 'id', 'text'], ['Mã đơn', 'order_number', 'text'], ['Trạng thái đơn', 'order_status', 'text'],
      ['Khách hàng', 'customer_name', 'text'], ['Phương thức', 'method', 'text'], ['Trạng thái thanh toán', 'status', 'text'],
      ['Số tiền (VND)', 'amount_vnd', 'number'], ['Nhà cung cấp thanh toán', 'provider', 'text'],
      ['Mã tham chiếu', 'provider_reference', 'text'], ['Người ghi nhận', 'actor_name', 'text'],
      ['Thời điểm thanh toán', 'occurred_at', 'date'],
    ],
    dateColumn: 'p.occurred_at', orderBy: 'p.occurred_at, p.id',
    sql: `SELECT p.id, o.order_number, o.status AS order_status, c.name AS customer_name, p.method, p.status,
                 p.amount_vnd::text AS amount_vnd, p.provider, p.provider_reference, u.display_name AS actor_name, p.occurred_at
          FROM payments p JOIN orders o ON o.store_id = p.store_id AND o.id = p.order_id
          LEFT JOIN customers c ON c.store_id = o.store_id AND c.id = o.customer_id
          JOIN users u ON u.id = p.recorded_by WHERE p.store_id = $1`,
  },
  returns: {
    filename: 'slink-hang-tra.csv',
    columns: [
      ['Mã phiếu trả', 'return_number', 'text'], ['Mã đơn', 'order_number', 'text'], ['Mã dòng trả', 'return_line_id', 'text'],
      ['Khách hàng', 'customer_name', 'text'], ['Trạng thái phiếu', 'status', 'text'], ['Lý do', 'reason', 'text'],
      ['Cách xử lý hàng', 'restock_policy', 'text'], ['Mã kho nhận lại', 'restock_warehouse_code', 'text'],
      ['Tên kho nhận lại', 'restock_warehouse_name', 'text'], ['Mã SKU', 'sku', 'text'], ['Tên sản phẩm lúc bán', 'product_name', 'text'],
      ['Số lượng trả', 'quantity', 'number'], ['Số lượng nhập lại kho', 'restocked_quantity', 'number'],
      ['Tiền hàng trả (VND)', 'line_refund_vnd', 'number'], ['Tổng giá trị phiếu trả (VND)', 'refund_total_vnd', 'number'],
      ['Người ghi nhận', 'actor_name', 'text'], ['Thời điểm trả hàng', 'occurred_at', 'date'],
    ],
    dateColumn: 'r.occurred_at', orderBy: 'r.occurred_at, r.id, rl.id',
    sql: `SELECT r.return_number, o.order_number, rl.id AS return_line_id, c.name AS customer_name, r.status,
                 r.reason, r.restock_policy, w.code AS restock_warehouse_code, w.name AS restock_warehouse_name,
                 l.sku_snapshot AS sku, l.product_name_snapshot AS product_name,
                 rl.quantity::text AS quantity, rl.restocked_quantity::text AS restocked_quantity,
                 rl.refund_vnd::text AS line_refund_vnd, r.refund_total_vnd::text AS refund_total_vnd,
                 u.display_name AS actor_name, r.occurred_at
          FROM returns r JOIN orders o ON o.store_id = r.store_id AND o.id = r.order_id
          JOIN return_lines rl ON rl.store_id = r.store_id AND rl.return_id = r.id
          JOIN order_lines l ON l.store_id = rl.store_id AND l.id = rl.order_line_id
          LEFT JOIN warehouses w ON w.store_id = r.store_id AND w.id = r.restock_warehouse_id
          LEFT JOIN customers c ON c.store_id = o.store_id AND c.id = o.customer_id
          JOIN users u ON u.id = r.created_by WHERE r.store_id = $1`,
  },
  refunds: {
    filename: 'slink-hoan-tien.csv',
    columns: [
      ['Mã hoàn tiền', 'id', 'text'], ['Mã phiếu trả', 'return_number', 'text'], ['Mã đơn', 'order_number', 'text'],
      ['Phương thức', 'method', 'text'], ['Trạng thái', 'status', 'text'], ['Số tiền (VND)', 'amount_vnd', 'number'],
      ['Nhà cung cấp thanh toán', 'provider', 'text'], ['Mã tham chiếu', 'provider_reference', 'text'],
      ['Người ghi nhận', 'actor_name', 'text'], ['Thời điểm hoàn tiền', 'occurred_at', 'date'],
    ],
    dateColumn: 'f.occurred_at', orderBy: 'f.occurred_at, f.id',
    sql: `SELECT f.id, r.return_number, o.order_number, f.method, f.status, f.amount_vnd::text AS amount_vnd,
                 f.provider, f.provider_reference, u.display_name AS actor_name, f.occurred_at
          FROM refunds f JOIN returns r ON r.store_id = f.store_id AND r.id = f.return_id
          JOIN orders o ON o.store_id = r.store_id AND o.id = r.order_id
          JOIN users u ON u.id = f.recorded_by WHERE f.store_id = $1`,
  },
  cashbook: {
    filename: 'slink-so-thu-chi.csv',
    columns: [
      ['Mã giao dịch', 'id', 'text'], ['Loại', 'direction', 'text'], ['Khoản mục', 'category', 'text'],
      ['Số tiền (VND)', 'amount_vnd', 'number'], ['Phương thức', 'method', 'text'], ['Loại chứng từ nguồn', 'source_type', 'text'],
      ['Mã chứng từ nguồn', 'source_id', 'text'], ['Ghi chú', 'note', 'text'], ['Người ghi nhận', 'actor_name', 'text'],
      ['Mã ca tiền mặt', 'cash_session_id', 'text'], ['Ca mở lúc', 'cash_session_opened_at', 'date'],
      ['Thời điểm phát sinh', 'occurred_at', 'date'], ['Ngày tạo', 'created_at', 'date'],
    ],
    dateColumn: 'c.occurred_at', orderBy: 'c.occurred_at, c.id',
    sql: `SELECT c.id, c.direction, c.category, c.amount_vnd::text AS amount_vnd, c.method,
                 c.source_type, c.source_id, c.note, u.display_name AS actor_name,
                 c.cash_session_id, s.opened_at AS cash_session_opened_at, c.occurred_at, c.created_at
          FROM cash_movements c JOIN users u ON u.id = c.actor_user_id
          LEFT JOIN cash_register_sessions s ON s.store_id = c.store_id AND s.id = c.cash_session_id
          WHERE c.store_id = $1`,
  },
  suppliers: {
    filename: 'slink-nha-cung-cap.csv',
    columns: [
      ['Mã nhà cung cấp', 'id', 'text'], ['Tên nhà cung cấp', 'name', 'text'], ['Điện thoại', 'phone', 'text'],
      ['Email', 'email', 'text'], ['Ghi chú', 'note', 'text'], ['Trạng thái', 'status', 'text'],
      ['Công nợ phải trả (VND)', 'balance_vnd', 'number'], ['Ngày tạo', 'created_at', 'date'],
      ['Cập nhật gần nhất', 'updated_at', 'date'],
    ],
    dateColumn: 's.created_at', orderBy: 's.created_at, s.id',
    sql: `SELECT s.id, s.name, s.phone, s.email, s.note, s.status,
                 COALESCE((SELECT SUM(l.increases_payable_vnd - l.decreases_payable_vnd) FROM supplier_ledger_entries l
                           WHERE l.store_id = s.store_id AND l.supplier_id = s.id), 0)::text AS balance_vnd,
                 s.created_at, s.updated_at FROM suppliers s WHERE s.store_id = $1`,
  },
  'supplier-ledger': {
    filename: 'slink-so-cong-no-nha-cung-cap.csv',
    columns: [
      ['Mã bút toán', 'id', 'text'], ['Mã nhà cung cấp', 'supplier_id', 'text'], ['Nhà cung cấp', 'supplier_name', 'text'],
      ['Loại bút toán', 'entry_type', 'text'], ['Tăng phải trả (VND)', 'increases_payable_vnd', 'number'],
      ['Giảm phải trả (VND)', 'decreases_payable_vnd', 'number'], ['Loại chứng từ nguồn', 'source_type', 'text'],
      ['Mã chứng từ nguồn', 'source_id', 'text'], ['Ghi chú', 'note', 'text'], ['Người ghi nhận', 'actor_name', 'text'],
      ['Thời điểm phát sinh', 'occurred_at', 'date'],
    ],
    dateColumn: 'l.occurred_at', orderBy: 'l.occurred_at, l.id',
    sql: `SELECT l.id, l.supplier_id, s.name AS supplier_name, l.entry_type,
                 l.increases_payable_vnd::text AS increases_payable_vnd,
                 l.decreases_payable_vnd::text AS decreases_payable_vnd,
                 l.source_type, l.source_id, l.note, u.display_name AS actor_name, l.occurred_at
          FROM supplier_ledger_entries l JOIN suppliers s ON s.store_id = l.store_id AND s.id = l.supplier_id
          JOIN users u ON u.id = l.actor_user_id WHERE l.store_id = $1`,
  },
  purchases: {
    filename: 'slink-phieu-nhap-hang.csv',
    columns: [
      ['Mã kho', 'warehouse_id', 'text'], ['Kho nhận', 'warehouse_name', 'text'],
      ['Mã phiếu nhập', 'purchase_number', 'text'], ['Mã đơn đặt hàng', 'purchase_order_number', 'text'], ['Trạng thái phiếu', 'status', 'text'],
      ['Mã nhà cung cấp', 'supplier_id', 'text'], ['Nhà cung cấp', 'supplier_name', 'text'],
      ['Mã dòng hàng', 'line_id', 'text'], ['Mã sản phẩm', 'product_id', 'text'], ['SKU lúc nhập', 'sku', 'text'],
      ['Tên sản phẩm lúc nhập', 'product_name', 'text'], ['Đơn vị', 'unit', 'text'], ['Số lượng đặt', 'quantity_ordered', 'number'],
      ['Số lượng đã nhận', 'quantity_received', 'number'], ['Đơn giá nhập (VND)', 'unit_cost_vnd', 'number'],
      ['Thành tiền dòng (VND)', 'line_total_vnd', 'number'], ['Tạm tính phiếu (VND)', 'subtotal_vnd', 'number'],
      ['Thuế phiếu (VND)', 'tax_vnd', 'number'], ['Tổng phiếu (VND)', 'total_vnd', 'number'],
      ['Ghi chú', 'note', 'text'], ['Người tạo', 'actor_name', 'text'], ['Ngày lập', 'occurred_at', 'date'], ['Ngày nhận', 'received_at', 'date'],
    ],
    dateColumn: 'p.occurred_at', orderBy: 'p.occurred_at, p.id, pl.id',
    sql: `SELECT p.warehouse_id, w.name AS warehouse_name, p.purchase_number, po.purchase_order_number, p.status, p.supplier_id, s.name AS supplier_name, pl.id AS line_id,
                 pl.product_id, pl.sku_snapshot AS sku, pl.product_name_snapshot AS product_name,
                 pl.unit_snapshot AS unit, pl.quantity_ordered::text AS quantity_ordered,
                 pl.quantity_received::text AS quantity_received, pl.unit_cost_vnd::text AS unit_cost_vnd,
                 pl.line_total_vnd::text AS line_total_vnd, p.subtotal_vnd::text AS subtotal_vnd,
                 p.tax_vnd::text AS tax_vnd, p.total_vnd::text AS total_vnd, p.note, u.display_name AS actor_name,
                 p.occurred_at, p.received_at
          FROM purchases p LEFT JOIN suppliers s ON s.store_id = p.store_id AND s.id = p.supplier_id
          JOIN warehouses w ON w.store_id = p.store_id AND w.id = p.warehouse_id
          LEFT JOIN purchase_orders po ON po.store_id = p.store_id AND po.id = p.purchase_order_id
          LEFT JOIN purchase_lines pl ON pl.store_id = p.store_id AND pl.purchase_id = p.id
          JOIN users u ON u.id = p.created_by WHERE p.store_id = $1 AND ($6::uuid IS NULL OR p.warehouse_id = $6)`,
  },
  'purchase-orders': {
    filename: 'slink-don-dat-hang.csv',
    columns: [
      ['Mã kho', 'warehouse_id', 'text'], ['Kho nhận', 'warehouse_name', 'text'],
      ['Mã đơn đặt hàng', 'purchase_order_number', 'text'], ['Trạng thái', 'status', 'text'],
      ['Mã nhà cung cấp', 'supplier_id', 'text'], ['Nhà cung cấp', 'supplier_name', 'text'],
      ['Mã dòng hàng', 'line_id', 'text'], ['Mã sản phẩm', 'product_id', 'text'], ['SKU lúc đặt', 'sku', 'text'],
      ['Tên sản phẩm lúc đặt', 'product_name', 'text'], ['Đơn vị', 'unit', 'text'], ['Số lượng đặt', 'quantity_ordered', 'number'],
      ['Số lượng đã nhận', 'quantity_received', 'number'], ['Giá dự kiến / đơn vị (VND)', 'unit_cost_vnd', 'number'],
      ['Tổng dự kiến dòng (VND)', 'line_total_vnd', 'number'], ['Tổng dự kiến đơn (VND)', 'total_vnd', 'number'],
      ['Ghi chú', 'note', 'text'], ['Ngày tạo', 'created_at', 'date'], ['Ngày gửi', 'ordered_at', 'date'],
      ['Ngày nhận đủ', 'completed_at', 'date'], ['Ngày hủy', 'cancelled_at', 'date'], ['Người tạo', 'actor_name', 'text'],
    ],
    dateColumn: 'po.created_at', orderBy: 'po.created_at, po.id, pol.id',
    sql: `SELECT po.warehouse_id, w.name AS warehouse_name, po.purchase_order_number, po.status, po.supplier_id, s.name AS supplier_name,
                 pol.id AS line_id, pol.product_id, pol.sku_snapshot AS sku, pol.product_name_snapshot AS product_name,
                 pol.unit_snapshot AS unit, pol.quantity_ordered::text AS quantity_ordered,
                 pol.quantity_received::text AS quantity_received, pol.unit_cost_vnd::text AS unit_cost_vnd,
                 pol.line_total_vnd::text AS line_total_vnd, po.total_vnd::text AS total_vnd, po.note,
                 po.created_at, po.ordered_at, po.completed_at, po.cancelled_at, u.display_name AS actor_name
          FROM purchase_orders po JOIN suppliers s ON s.store_id = po.store_id AND s.id = po.supplier_id
          JOIN warehouses w ON w.store_id = po.store_id AND w.id = po.warehouse_id
          JOIN users u ON u.id = po.created_by
          LEFT JOIN purchase_order_lines pol ON pol.store_id = po.store_id AND pol.purchase_order_id = po.id
          WHERE po.store_id = $1 AND ($6::uuid IS NULL OR po.warehouse_id = $6)`,
  },
};

function parseDate(value, label) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, 'validation_error', `${label} không hợp lệ.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, 'validation_error', `${label} không hợp lệ.`);
  }
  return value;
}

function csvCell(value, kind) {
  let text = value == null ? '' : value instanceof Date ? value.toISOString() : String(value);
  if (kind === 'text' && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function makeCsv(dataset, rows) {
  const header = dataset.columns.map(([label]) => csvCell(label, 'text')).join(',');
  const body = rows.map((row) => dataset.columns.map(([, key, kind]) => csvCell(row[key], kind)).join(','));
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`;
}

function registerExportRoutes(app, { pool }) {
  app.get('/api/stores/:storeId/exports/:dataset', async (request, reply) => {
    const auth = await authenticate(pool, request);
    const { storeId, dataset: key } = request.params;
    const dataset = EXPORTS[key];
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    if (!dataset) throw new ApiError(404, 'export_not_found', 'Không hỗ trợ loại dữ liệu này.');
    const from = parseDate(request.query?.from, 'Ngày bắt đầu');
    const to = parseDate(request.query?.to, 'Ngày kết thúc');
    if (from && to && from > to) throw new ApiError(400, 'validation_error', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');

    const result = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!EXPORT_ROLES[key]?.has(membership.role)) throw new ApiError(403, 'forbidden', 'Vai trò này không có quyền tải bộ dữ liệu cửa hàng.');
      const allowedIds = allowedWarehouseIds(membership);
      let scopedWarehouseId = null;
      let scopedWarehouseIds = null;
      if (['inventory', 'inventory-movements', 'purchases', 'purchase-orders', 'channel-orders'].includes(key)) {
        const requestedWarehouseId = request.query?.warehouseId;
        if (requestedWarehouseId !== undefined && (typeof requestedWarehouseId !== 'string' || !UUID_PATTERN.test(requestedWarehouseId))) {
          throw new ApiError(400, 'validation_error', 'Kho tồn kho không hợp lệ.');
        }
        if (requestedWarehouseId || key === 'inventory') {
          const warehouse = await findAccessibleWarehouse(client, storeId, membership, requestedWarehouseId ? requestedWarehouseId.toLowerCase() : null);
          if (!warehouse) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho đang hoạt động.');
          scopedWarehouseId = warehouse.id;
        } else if (allowedIds !== null) {
          scopedWarehouseIds = allowedIds;
        }
      }
      const scopeColumn = {
        'inventory-movements': 'm.warehouse_id',
        purchases: 'p.warehouse_id',
        'purchase-orders': 'po.warehouse_id',
        'channel-orders': 'co.fulfillment_warehouse_id',
      }[key];
      const warehouseScopeFilter = scopedWarehouseIds !== null ? ` AND ${scopeColumn} = ANY($7::uuid[])` : '';
      const dateFilter = dataset.dateColumn
        ? ` AND ($2::date IS NULL OR ${dataset.dateColumn} >= (($2::date)::timestamp AT TIME ZONE $4))
             AND ($3::date IS NULL OR ${dataset.dateColumn} < (($3::date + INTERVAL '1 day') AT TIME ZONE $4))`
        : '';
      const sql = `${dataset.sql}${dateFilter}${warehouseScopeFilter} ORDER BY ${dataset.orderBy} LIMIT $5`;
      const parameters = [storeId, from, to, membership.timezone, MAX_EXPORT_ROWS + 1];
      if (['inventory', 'inventory-movements', 'purchases', 'purchase-orders', 'channel-orders'].includes(key)) parameters.push(scopedWarehouseId);
      else if (key === 'products') parameters.push(allowedIds);
      if (scopedWarehouseIds !== null) parameters.push(scopedWarehouseIds);
      const rows = await client.query(sql, parameters);
      if (rows.rowCount > MAX_EXPORT_ROWS) {
        throw new ApiError(413, 'export_too_large', 'Tệp vượt quá 50.000 dòng. Hãy chọn khoảng ngày ngắn hơn rồi xuất lại.');
      }
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'data.exported', 'store', $1, '', jsonb_build_object('dataset', $3::text, 'row_count', $4::integer, 'from', $5::text, 'to', $6::text, 'warehouse_id', $7::text))`,
        [storeId, auth.userId, key, rows.rowCount, from, to, scopedWarehouseId]
      );
      return rows.rows;
    });

    reply
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Disposition', `attachment; filename="${dataset.filename}"`)
      .type('text/csv; charset=utf-8')
      .send(makeCsv(dataset, result));
  });
}

module.exports = { EXPORTS, MAX_EXPORT_ROWS, csvCell, makeCsv, parseDate, registerExportRoutes };
