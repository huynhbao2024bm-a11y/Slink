'use strict';

const ExcelJS = require('exceljs');
const { ApiError, authenticate } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { requirePermission } = require('./rbac');

const MAX_TT152_ROWS = 50_000;

function sanitizeExcelCellText(value) {
  const text = String(value == null ? '' : value);
  if (/^[\s\u0000-\u001f]*[=+\-@\t\r]/.test(text)) {
    return `'${text}`;
  }
  return text;
}

function excelMoneyValue(bigintVal) {
  const value = typeof bigintVal === 'bigint' ? bigintVal : BigInt(String(bigintVal || '0'));
  if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }
  return value.toString();
}

function parseCalendarDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, 'validation_error', `${label} phải có định dạng YYYY-MM-DD.`);
  }
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime()) || dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) {
    throw new ApiError(400, 'validation_error', `${label} không phải ngày hợp lệ.`);
  }
  return { text: value, ms: dt.getTime() };
}

function defaultVnMonthRange() {
  const vnToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return {
    from: `${vnToday.slice(0, 8)}01`,
    to: vnToday,
  };
}

function resolveDateRange(query = {}) {
  const hasFrom = query.from !== undefined && query.from !== '';
  const hasTo = query.to !== undefined && query.to !== '';
  if (hasFrom !== hasTo) {
    throw new ApiError(400, 'validation_error', 'Cần truyền đầy đủ cả ngày bắt đầu (from) và ngày kết thúc (to).');
  }
  if (!hasFrom) {
    const def = defaultVnMonthRange();
    return { from: def.from, to: def.to };
  }
  const from = parseCalendarDate(String(query.from), 'Ngày bắt đầu');
  const to = parseCalendarDate(String(query.to), 'Ngày kết thúc');
  if (from.ms > to.ms) {
    throw new ApiError(400, 'validation_error', 'Ngày bắt đầu không được lớn hơn ngày kết thúc.');
  }
  const span = Math.round((to.ms - from.ms) / 86_400_000) + 1;
  if (span > 366) {
    throw new ApiError(400, 'validation_error', 'Khoảng thời gian xuất sổ kế toán tối đa 366 ngày.');
  }
  return { from: from.text, to: to.text };
}

function formatVnDate(isoOrDate, timezone = 'Asia/Ho_Chi_Minh') {
  if (!isoOrDate) return '';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return String(isoOrDate);
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: timezone || 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function formatYmdToVn(ymd) {
  const parts = String(ymd || '').split('-');
  if (parts.length !== 3) return String(ymd || '');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatMethodLabel(method) {
  const map = {
    cash: 'Tiền mặt',
    bank_transfer: 'Chuyển khoản NH',
    bank_qr: 'VietQR ngân hàng',
    card: 'Thẻ',
    other: 'Khác',
    debt: 'Ghi nợ',
  };
  return map[method] || sanitizeExcelCellText(method || 'Khác');
}

function styleHeaderRow(row) {
  row.font = { bold: true, size: 11, color: { argb: 'FF0F3D2E' } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 30;
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5EE' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFB7D5C5' } },
      left: { style: 'thin', color: { argb: 'FFB7D5C5' } },
      bottom: { style: 'thin', color: { argb: 'FFB7D5C5' } },
      right: { style: 'thin', color: { argb: 'FFB7D5C5' } },
    };
  });
}

function styleDataRow(row, moneyCols = []) {
  const moneySet = new Set(moneyCols);
  row.font = { size: 10.5 };
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };
    if (moneySet.has(colNumber)) {
      cell.numFmt = '#,##0';
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else {
      cell.alignment = { vertical: 'middle', wrapText: true };
    }
  });
}

async function buildAccountingTt152Workbook({ store, range, orders = [], cashMovements = [] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Slink';
  wb.created = new Date();

  const timezone = store.timezone || 'Asia/Ho_Chi_Minh';
  const periodLabel = `Từ ngày ${formatYmdToVn(range.from)} đến ngày ${formatYmdToVn(range.to)}`;
  const storeNameUpper = sanitizeExcelCellText((store.name || 'Cửa hàng Slink').toUpperCase());
  const storeAddress = sanitizeExcelCellText(store.address || 'Chưa cập nhật địa chỉ');
  const taxCode = sanitizeExcelCellText(store.tax_code || 'Chưa khai báo');

  // ================= SHEET 1: SỔ CHI TIẾT DOANH THU (MẪU S1-HKD TT 152/2025/TT-BTC) =================
  const ws1 = wb.addWorksheet('So_Doanh_Thu_TT152');
  ws1.columns = [
    { width: 16 },
    { width: 18 },
    { width: 16 },
    { width: 42 },
    { width: 24 },
    { width: 22 },
  ];

  ws1.addRow([`HỘ, CÁ NHÂN KINH DOANH: ${storeNameUpper}`, '', '', '', '', 'Mẫu số: S1-HKD']);
  ws1.addRow([`Địa chỉ: ${storeAddress}`, '', '', '', '', '(Ban hành kèm theo Thông tư số 152/2025/TT-BTC']);
  ws1.addRow([`Mã số thuế: ${taxCode}`, '', '', '', '', 'ngày 31/12/2025 của Bộ Tài chính)']);
  ws1.getCell('A1').font = { bold: true, size: 11 };
  ws1.getCell('F1').font = { bold: true, size: 10.5 };
  ws1.getCell('F1').alignment = { horizontal: 'right' };
  ws1.getCell('F2').alignment = { horizontal: 'right' };
  ws1.getCell('F3').alignment = { horizontal: 'right' };

  ws1.addRow([]);
  const titleRow1 = ws1.addRow(['SỔ CHI TIẾT DOANH THU BÁN HÀNG HÓA, DỊCH VỤ']);
  ws1.mergeCells(`A${titleRow1.number}:F${titleRow1.number}`);
  titleRow1.getCell(1).font = { bold: true, size: 13 };
  titleRow1.getCell(1).alignment = { horizontal: 'center' };

  const periodRow1 = ws1.addRow([`Kỳ kê khai: ${periodLabel}`]);
  ws1.mergeCells(`A${periodRow1.number}:F${periodRow1.number}`);
  periodRow1.getCell(1).alignment = { horizontal: 'center' };

  const unitRow1 = ws1.addRow(['Đơn vị tính: Đồng Việt Nam (Số nguyên VND)']);
  ws1.mergeCells(`A${unitRow1.number}:F${unitRow1.number}`);
  unitRow1.getCell(1).alignment = { horizontal: 'right' };
  unitRow1.getCell(1).font = { italic: true, size: 10 };

  ws1.addRow([]);
  const header1 = ws1.addRow([
    'Ngày, tháng ghi sổ',
    'Số hiệu chứng từ',
    'Ngày, tháng chứng từ',
    'Diễn giải nghiệp vụ kinh tế phát sinh',
    'Doanh thu phân phối, cung cấp hàng hóa (VNĐ)',
    'Ghi chú / Hình thức thu',
  ]);
  styleHeaderRow(header1);

  let totalRevenueVnd = 0n;
  for (const order of orders) {
    const grossVnd = BigInt(String(order.total_vnd || '0'));
    const returnedVnd = BigInt(String(order.returned_vnd || '0'));
    const netVnd = grossVnd > returnedVnd ? grossVnd - returnedVnd : 0n;
    totalRevenueVnd += netVnd;
    const dateStr = formatVnDate(order.occurred_at, timezone);
    const methods = Array.isArray(order.payment_methods) && order.payment_methods.length
      ? order.payment_methods.map(formatMethodLabel).join(', ')
      : 'Ghi nợ / Chưa thu';
    const desc = order.note && String(order.note).trim()
      ? sanitizeExcelCellText(order.note.trim())
      : sanitizeExcelCellText(`Bán lẻ hàng hóa theo đơn ${order.order_number || ''}`);
    const row = ws1.addRow([
      dateStr,
      sanitizeExcelCellText(order.order_number || ''),
      dateStr,
      desc,
      excelMoneyValue(netVnd),
      sanitizeExcelCellText(methods),
    ]);
    styleDataRow(row, [5]);
  }

  const totalRow1 = ws1.addRow([
    '',
    '',
    '',
    'TỔNG CỘNG DOANH THU TRONG KỲ',
    excelMoneyValue(totalRevenueVnd),
    `${orders.length} chứng từ`,
  ]);
  totalRow1.font = { bold: true, size: 11 };
  styleDataRow(totalRow1, [5]);
  totalRow1.font = { bold: true, size: 11 };

  ws1.addRow([]);
  const sigDate1 = ws1.addRow(['', '', '', '', 'Ngày ..... tháng ..... năm ........', '']);
  sigDate1.getCell(5).alignment = { horizontal: 'center' };
  const sigTitle1 = ws1.addRow(['Người lập biểu', '', '', '', 'NGƯỜI ĐẠI DIỆN HỘ KINH DOANH', '']);
  sigTitle1.font = { bold: true };
  sigTitle1.getCell(1).alignment = { horizontal: 'center' };
  sigTitle1.getCell(5).alignment = { horizontal: 'center' };
  const sigSub1 = ws1.addRow(['(Ký, họ tên)', '', '', '', '(Ký, họ tên, đóng dấu nếu có)', '']);
  sigSub1.font = { italic: true, size: 10 };
  sigSub1.getCell(1).alignment = { horizontal: 'center' };
  sigSub1.getCell(5).alignment = { horizontal: 'center' };

  // ================= SHEET 2: SỔ QUỸ TIỀN MẶT & NGÂN HÀNG =================
  const ws2 = wb.addWorksheet('So_Quy_Thu_Chi');
  ws2.columns = [
    { width: 16 },
    { width: 18 },
    { width: 42 },
    { width: 20 },
    { width: 20 },
    { width: 24 },
  ];

  ws2.addRow([`HỘ, CÁ NHÂN KINH DOANH: ${storeNameUpper}`]).font = { bold: true, size: 11 };
  const titleRow2 = ws2.addRow(['SỔ QUỸ TIỀN MẶT VÀ TIỀN GỬI NGÂN HÀNG (THÔNG TƯ 152/2025/TT-BTC)']);
  ws2.mergeCells(`A${titleRow2.number}:F${titleRow2.number}`);
  titleRow2.getCell(1).font = { bold: true, size: 12.5 };
  titleRow2.getCell(1).alignment = { horizontal: 'center' };

  const periodRow2 = ws2.addRow([`Kỳ kê khai: ${periodLabel} · MST: ${taxCode}`]);
  ws2.mergeCells(`A${periodRow2.number}:F${periodRow2.number}`);
  periodRow2.getCell(1).alignment = { horizontal: 'center' };

  ws2.addRow([]);
  const header2 = ws2.addRow([
    'Ngày ghi sổ',
    'Số phiếu thu/chi',
    'Nội dung thu / chi',
    'Số tiền THU (VNĐ)',
    'Số tiền CHI (VNĐ)',
    'Phương thức / Quỹ',
  ]);
  styleHeaderRow(header2);

  let sumInVnd = 0n;
  let sumOutVnd = 0n;
  for (const m of cashMovements) {
    const amountVnd = BigInt(String(m.amount_vnd || '0'));
    const isIn = m.direction === 'in';
    if (isIn) sumInVnd += amountVnd;
    else sumOutVnd += amountVnd;
    const descParts = [m.category, m.note].filter((part) => typeof part === 'string' && part.trim());
    const channel = m.fund_type === 'bank'
      ? `Ngân hàng (${formatMethodLabel(m.method)})`
      : `Tiền mặt (${formatMethodLabel(m.method)})`;
    const row = ws2.addRow([
      formatVnDate(m.occurred_at, timezone),
      sanitizeExcelCellText(m.voucher_number || (isIn ? 'PT' : 'PC')),
      sanitizeExcelCellText(descParts.join(' — ') || 'Giao dịch quỹ cửa hàng'),
      isIn ? excelMoneyValue(amountVnd) : 0,
      !isIn ? excelMoneyValue(amountVnd) : 0,
      sanitizeExcelCellText(channel),
    ]);
    styleDataRow(row, [4, 5]);
  }

  const diffVnd = sumInVnd - sumOutVnd;
  const formattedDiff = new Intl.NumberFormat('vi-VN').format(diffVnd);
  const totalRow2 = ws2.addRow([
    '',
    '',
    'TỔNG CỘNG PHÁT SINH THU - CHI',
    excelMoneyValue(sumInVnd),
    excelMoneyValue(sumOutVnd),
    `Chênh lệch: ${formattedDiff} đ`,
  ]);
  styleDataRow(totalRow2, [4, 5]);
  totalRow2.font = { bold: true, size: 11 };

  return wb.xlsx.writeBuffer();
}

function registerAccountingTt152Routes(app, { pool }) {
  app.get('/api/stores/:storeId/exports/accounting-tt152.xlsx', async (request, reply) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) {
      throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    }
    const range = resolveDateRange(request.query);

    const buffer = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      requirePermission(membership, 'view_reports', 'Tài khoản này không có quyền xuất sổ kế toán.');
      const storeRes = await client.query(
        'SELECT name, address, phone, tax_code, timezone FROM stores WHERE id = $1 LIMIT 1',
        [storeId]
      );
      if (!storeRes.rowCount) {
        throw new ApiError(404, 'store_not_found', 'Không tìm thấy cửa hàng.');
      }
      const store = storeRes.rows[0];
      const ordersRes = await client.query(
        `WITH bounds AS (
           SELECT $2::date AS start_date, $3::date AS end_date, timezone FROM stores WHERE id = $1
         )
         SELECT o.id, o.order_number, o.total_vnd::text AS total_vnd, o.note, o.occurred_at,
                COALESCE((
                  SELECT SUM(r.refund_total_vnd) FROM returns r
                  WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'
                ), 0)::text AS returned_vnd,
                ARRAY(
                  SELECT DISTINCT p.method FROM payments p
                  WHERE p.store_id = o.store_id AND p.order_id = o.id AND p.status = 'succeeded'
                ) AS payment_methods
         FROM orders o CROSS JOIN bounds b
         WHERE o.store_id = $1 AND o.status <> 'voided'
           AND o.occurred_at >= (b.start_date::timestamp AT TIME ZONE b.timezone)
           AND o.occurred_at < ((b.end_date + 1)::timestamp AT TIME ZONE b.timezone)
         ORDER BY o.occurred_at ASC, o.id ASC
         LIMIT $4`,
        [storeId, range.from, range.to, MAX_TT152_ROWS]
      );
      const cashRes = await client.query(
        `WITH bounds AS (
           SELECT $2::date AS start_date, $3::date AS end_date, timezone FROM stores WHERE id = $1
         )
         SELECT c.id, c.voucher_number, c.direction, c.category, c.amount_vnd::text AS amount_vnd,
                c.method, c.fund_type, c.note, c.occurred_at
         FROM cash_movements c CROSS JOIN bounds b
         WHERE c.store_id = $1
           AND c.movement_kind <> 'reversal'
           AND NOT EXISTS (
             SELECT 1 FROM cash_movements rev
             WHERE rev.store_id = c.store_id AND rev.reverses_movement_id = c.id
           )
           AND c.occurred_at >= (b.start_date::timestamp AT TIME ZONE b.timezone)
           AND c.occurred_at < ((b.end_date + 1)::timestamp AT TIME ZONE b.timezone)
         ORDER BY c.occurred_at ASC, c.id ASC
         LIMIT $4`,
        [storeId, range.from, range.to, MAX_TT152_ROWS]
      );
      return buildAccountingTt152Workbook({
        store,
        range,
        orders: ordersRes.rows,
        cashMovements: cashRes.rows,
      });
    });

    const filename = `So_Ke_Toan_TT152_2025_${range.from}_${range.to}.xlsx`;
    return reply
      .header('cache-control', 'no-store')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .send(Buffer.from(buffer));
  });
}

module.exports = {
  sanitizeExcelCellText,
  resolveDateRange,
  buildAccountingTt152Workbook,
  registerAccountingTt152Routes,
};
