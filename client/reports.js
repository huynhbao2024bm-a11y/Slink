(function (S) {
  'use strict';

  S.fn.reportIsoDay = function reportIsoDay(date) {
    const d = date instanceof Date ? date : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }


  S.fn.resolveReportQuery = function resolveReportQuery(daysOrOptions) {
    const now = new Date();
    const today = S.fn.reportIsoDay(now);
    if (typeof daysOrOptions === 'number') {
      const safeDays = [1, 7, 30].includes(daysOrOptions) ? daysOrOptions : 7;
      if (S.state.page === 'reports') {
        S.state.reportPreset = safeDays === 1 ? 'today' : safeDays === 30 ? '30d' : '7d';
        S.state.chartRange = safeDays === 30 ? '30 ngày' : '7 ngày';
      }
      return { query: `days=${safeDays}`, key: `days:${safeDays}` };
    }
    const opts = daysOrOptions && typeof daysOrOptions === 'object' ? daysOrOptions : {};
    const preset = opts.preset || S.state.reportPreset || '7d';
    S.state.reportPreset = preset;
    if (preset === 'today') return { query: 'days=1', key: 'days:1' };
    if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      const yStr = S.fn.reportIsoDay(y);
      S.state.reportFrom = yStr;
      S.state.reportTo = yStr;
      return { query: `from=${encodeURIComponent(yStr)}&to=${encodeURIComponent(yStr)}`, key: `${yStr}:${yStr}` };
    }
    if (preset === '30d') { S.state.chartRange = '30 ngày'; return { query: 'days=30', key: 'days:30' }; }
    if (preset === 'month') {
      const firstOfMonth = `${today.slice(0, 8)}01`;
      S.state.reportFrom = firstOfMonth;
      S.state.reportTo = today;
      return { query: `from=${encodeURIComponent(firstOfMonth)}&to=${encodeURIComponent(today)}`, key: `${firstOfMonth}:${today}` };
    }
    if (preset === 'custom') {
      const from = String(opts.from || S.state.reportFrom || today);
      const to = String(opts.to || S.state.reportTo || today);
      S.state.reportFrom = from;
      S.state.reportTo = to;
      return { query: `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, key: `${from}:${to}` };
    }
    S.state.chartRange = '7 ngày';
    return { query: 'days=7', key: 'days:7' };
  }


  S.fn.loadAnalytics = async function loadAnalytics(daysOrOptions) {
    if (!S.state.authSession || !S.state.store.id) return;
    if (!S.fn.hasPerm('viewReports')) {
      S.state.analyticsRequestNumber += 1;
      S.state.analyticsData = null;
      S.state.analyticsLoading = false;
      S.state.analyticsError = '';
      return;
    }
    const resolved = S.fn.resolveReportQuery(daysOrOptions);
    const requestNumber = ++S.state.analyticsRequestNumber;
    if (S.state.analyticsData?._queryKey !== resolved.key) S.state.analyticsData = null;
    S.state.analyticsLoading = true;
    S.state.analyticsError = '';
    if (S.state.page === 'dashboard' || S.state.page === 'reports') S.fn.render();
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/analytics?${resolved.query}`);
      if (requestNumber !== S.state.analyticsRequestNumber) return;
      if (result) result._queryKey = resolved.key;
      S.state.analyticsData = result;
      if (result?.range?.from) S.state.reportFrom = result.range.from;
      if (result?.range?.to) S.state.reportTo = result.range.to;
      S.state.analyticsLoading = false;
      if (S.state.page === 'dashboard' || S.state.page === 'reports') S.fn.render();
    } catch (error) {
      if (requestNumber !== S.state.analyticsRequestNumber) return;
      S.state.analyticsLoading = false;
      S.state.analyticsError = error.message;
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      S.fn.toast('Chưa tải được báo cáo', error.message, 'error');
      if (S.state.page === 'dashboard' || S.state.page === 'reports') S.fn.render();
    }
  }


  S.fn.reportCsvText = function reportCsvText(value) {
    let text = String(value == null ? '' : value);
    if (/^[\s\u0000-\u001f]*[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }


  S.fn.reportCsvInteger = function reportCsvInteger(value, label) {
    const text = String(value == null || value === '' ? '0' : value);
    if (!/^-?\d+$/.test(text)) throw new Error('Giá trị không hợp lệ trong báo cáo: ' + label);
    return text;
  }


  S.fn.reportCsvQuantity = function reportCsvQuantity(value, label) {
    const text = String(value == null || value === '' ? '0' : value);
    if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new Error('Số lượng không hợp lệ trong báo cáo: ' + label);
    return text;
  }


  S.fn.downloadReportsCsv = function downloadReportsCsv() {
    if (!S.fn.hasPerm('viewReports')) {
      return S.fn.toast('Không có quyền xuất báo cáo', 'Vai trò của bạn không được phép xem dữ liệu tài chính.', 'error');
    }
    if (S.state.analyticsLoading || S.state.analyticsError || !S.state.analyticsData || !S.state.analyticsData.range || !S.state.analyticsData.summary) {
      return S.fn.toast('Báo cáo chưa sẵn sàng', 'Tải báo cáo thành công rồi thử tải CSV.', 'error');
    }
    try {
      const report = S.state.analyticsData;
      const summary = report.summary;
      const canCost = S.fn.hasPerm('viewCostPrice') && summary.grossProfitVnd != null;
      const rows = [
        ['Slink - Báo cáo bán hàng', S.fn.reportCsvText(report.range.from), S.fn.reportCsvText(report.range.to)],
        [],
        ['Chỉ số', 'Giá trị', 'Đơn vị'],
        ['Doanh thu thuần', S.fn.reportCsvInteger(summary.netSalesVnd, 'doanh thu thuần'), 'VND'],
        ...(canCost ? [['Lãi gộp ước tính', S.fn.reportCsvInteger(summary.grossProfitVnd, 'lãi gộp'), 'VND']] : []),
        ['Thu khác', S.fn.reportCsvInteger(summary.otherIncomeVnd || '0', 'thu khác'), 'VND'],
        ['Chi phí vận hành', S.fn.reportCsvInteger(summary.operatingExpenseVnd || '0', 'chi phí vận hành'), 'VND'],
        ...(canCost ? [['Lãi ròng', S.fn.reportCsvInteger(summary.netProfitVnd != null ? summary.netProfitVnd : summary.grossProfitVnd, 'lãi ròng'), 'VND']] : []),
        ['Số đơn trong kỳ', S.fn.reportCsvInteger(summary.orderCount, 'số đơn'), 'đơn'],
        ['Giá trị đơn trung bình', S.fn.reportCsvInteger(summary.averageTicketVnd, 'giá trị đơn trung bình'), 'VND'],
        ['Tiền đã thu ròng', S.fn.reportCsvInteger(summary.collectedVnd, 'tiền đã thu'), 'VND'],
        ['Còn phải thu', S.fn.reportCsvInteger(summary.receivableVnd, 'còn phải thu'), 'VND'],
        [], ['Doanh thu thuần theo ngày'], ['Ngày', 'Số đơn', 'Doanh thu thuần (VND)'],
      ];
      (Array.isArray(report.days) ? report.days : []).forEach(function (item) {
        rows.push([S.fn.reportCsvText(item.date), S.fn.reportCsvInteger(item.orderCount, 'số đơn theo ngày'), S.fn.reportCsvInteger(item.salesVnd, 'doanh thu theo ngày')]);
      });
      rows.push([], ['Sản phẩm bán chạy'], ['Tên sản phẩm', 'SKU', 'Số lượng bán ròng', 'Đơn vị', 'Doanh thu thuần (VND)']);
      (Array.isArray(report.topProducts) ? report.topProducts : []).forEach(function (item) {
        rows.push([S.fn.reportCsvText(item.name), S.fn.reportCsvText(item.sku), S.fn.reportCsvQuantity(item.quantity_sold, 'số lượng sản phẩm'), S.fn.reportCsvText(item.unit), S.fn.reportCsvInteger(item.net_sales_vnd, 'doanh thu sản phẩm')]);
      });
      const csv = '\uFEFF' + rows.map(function (row) { return row.join(','); }).join('\r\n');
      const safeFrom = String(report.range.from).replace(/[^0-9-]/g, '');
      const safeTo = String(report.range.to).replace(/[^0-9-]/g, '');
      const filename = `slink-bao-cao-${safeFrom}-${safeTo}.csv`;
      S.fn.download(filename, csv, 'text/csv;charset=utf-8');
      S.fn.toast('Đã xuất báo cáo CSV', `${report.range.from} đến ${report.range.to}`);
    } catch (error) {
      S.fn.toast('Chưa xuất được báo cáo', error.message, 'error');
    }
  }


  S.fn.printReportsPdf = function printReportsPdf() {
    if (!S.fn.hasPerm('viewReports')) {
      return S.fn.toast('Không có quyền xuất báo cáo', 'Vai trò của bạn không được phép xem dữ liệu tài chính.', 'error');
    }
    if (S.state.analyticsLoading || S.state.analyticsError || !S.state.analyticsData || !S.state.analyticsData.range || !S.state.analyticsData.summary) {
      return S.fn.toast('Báo cáo chưa sẵn sàng', 'Tải báo cáo thành công rồi thử in hoặc lưu PDF.', 'error');
    }

    const report = S.state.analyticsData;
    const summary = report.summary;
    const dailyRows = (Array.isArray(report.days) ? report.days : []).map(function (item) {
      const date = new Date(String(item.date || '') + 'T12:00:00');
      const label = Number.isNaN(date.getTime()) ? String(item.date || '') : date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `<tr><td>${S.fn.esc(label)}</td><td class="num">${S.fn.number(item.orderCount)}</td><td class="num">${S.fn.esc(S.fn.moneyVndText(item.salesVnd))}</td></tr>`;
    }).join('');
    const products = (Array.isArray(report.topProducts) ? report.topProducts : []).map(function (item, index) {
      return `<tr><td>${index + 1}</td><td>${S.fn.esc(item.name)}</td><td>${S.fn.esc(item.sku || '—')}</td><td class="num">${S.fn.number(item.quantity_sold)} ${S.fn.esc(item.unit || '')}</td><td class="num">${S.fn.esc(S.fn.moneyVndText(item.net_sales_vnd))}</td></tr>`;
    }).join('');
    const generatedAt = new Date().toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
    const storeName = S.state.store.settings && S.state.store.settings.storeName || 'Slink';
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Báo cáo bán hàng ${S.fn.esc(report.range.from)}–${S.fn.esc(report.range.to)}</title><style>
      @page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#202923;margin:0;line-height:1.45}h1{font-size:22px;margin:0 0 4px}h2{font-size:14px;margin:20px 0 8px}.muted{color:#657069}.brand{font-size:11px;font-weight:700;color:#4d775d;text-transform:uppercase;letter-spacing:.08em}.meta{margin:8px 0 18px}.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.card{border:1px solid #dce4dc;border-radius:8px;padding:10px}.card small{display:block;color:#667169;margin-bottom:5px}.card strong{font-size:17px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:7px 6px;border-bottom:1px solid #e5eae5;text-align:left;vertical-align:top}th{background:#f2f5f1;font-weight:700}.num{text-align:right;white-space:nowrap}.note{margin-top:18px;padding:10px;background:#f6f7f4;border-radius:6px;color:#566158;font-size:10px}.footer{margin-top:18px;color:#7b847c;font-size:10px}.empty{padding:10px;color:#68736b;border:1px dashed #ccd5cd}@media print{tr{break-inside:avoid}thead{display:table-header-group}}
      </style></head><body><div class="brand">${S.fn.esc(storeName)}</div><h1>Báo cáo bán hàng</h1><div class="meta muted">Kỳ báo cáo: ${S.fn.esc(report.range.from)} đến ${S.fn.esc(report.range.to)} · Tạo lúc ${S.fn.esc(generatedAt)}</div>
      <div class="cards"><div class="card"><small>Doanh thu thuần</small><strong>${S.fn.esc(S.fn.moneyVndText(summary.netSalesVnd))}</strong></div><div class="card"><small>Lãi gộp ước tính</small><strong>${S.fn.hasPerm('viewCostPrice') && summary.grossProfitVnd != null ? S.fn.esc(S.fn.moneyVndText(summary.grossProfitVnd)) : 'Ẩn theo quyền'}</strong></div><div class="card"><small>Chi phí vận hành</small><strong>${S.fn.esc(S.fn.moneyVndText(summary.operatingExpenseVnd || '0'))}</strong></div><div class="card"><small>Lãi ròng</small><strong>${S.fn.hasPerm('viewCostPrice') && (summary.netProfitVnd != null || summary.grossProfitVnd != null) ? S.fn.esc(S.fn.moneyVndText(summary.netProfitVnd != null ? summary.netProfitVnd : summary.grossProfitVnd)) : 'Ẩn theo quyền'}</strong></div><div class="card"><small>Số đơn trong kỳ</small><strong>${S.fn.number(summary.orderCount)}</strong></div><div class="card"><small>Giá trị đơn trung bình</small><strong>${S.fn.esc(S.fn.moneyVndText(summary.averageTicketVnd))}</strong></div><div class="card"><small>Tiền đã thu ròng</small><strong>${S.fn.esc(S.fn.moneyVndText(summary.collectedVnd))}</strong></div><div class="card"><small>Còn phải thu</small><strong>${S.fn.esc(S.fn.moneyVndText(summary.receivableVnd))}</strong></div></div>
      <h2>Doanh thu thuần theo ngày</h2>${dailyRows ? `<table><thead><tr><th>Ngày</th><th class="num">Số đơn</th><th class="num">Doanh thu thuần</th></tr></thead><tbody>${dailyRows}</tbody></table>` : '<div class="empty">Không có dữ liệu theo ngày trong kỳ này.</div>'}
      <h2>Sản phẩm bán chạy</h2>${products ? `<table><thead><tr><th>#</th><th>Sản phẩm</th><th>Mã hàng</th><th class="num">Số lượng bán ròng</th><th class="num">Doanh thu thuần</th></tr></thead><tbody>${products}</tbody></table>` : '<div class="empty">Không có sản phẩm bán trong kỳ này.</div>'}
      <div class="footer">Dùng hộp thoại in của trình duyệt để in hoặc chọn “Lưu dưới dạng PDF”.</div></body></html>`;
    S.fn.printHtmlDocument(html, `Bao cao ${report.range.from}-${report.range.to}`);
  }


  S.fn.renderReports = function renderReports() {
    if (!S.fn.hasPerm('viewReports')) {
      return `<section class='panel locked-page'><div class='empty-icon'>${S.fn.icon('chart', 23)}</div><h2>Không có quyền xem báo cáo</h2><p>Báo cáo doanh thu, lãi gộp và công nợ chỉ dành cho tài khoản được cấp quyền Xem báo cáo.</p></section>`;
    }
    const report = S.state.analyticsData || {};
    const summary = report.summary || {};
    const prev = report.previousSummary || {};
    const eod = report.endOfDay || {};
    const canCost = S.fn.hasPerm('viewCostPrice');
    const activeTab = S.state.reportTab || 'eod';
    const preset = S.state.reportPreset || '7d';
    const fromVal = S.state.reportFrom || report.range?.from || S.fn.reportIsoDay(new Date());
    const toVal = S.state.reportTo || report.range?.to || S.fn.reportIsoDay(new Date());
    const reportCanPrint = !!(report.range && report.summary && !S.state.analyticsLoading && !S.state.analyticsError);

    const presetsHtml = [
      ['today', 'Hôm nay'],
      ['yesterday', 'Hôm qua'],
      ['7d', '7 ngày'],
      ['30d', '30 ngày'],
      ['month', 'Tháng này'],
    ].map(function (p) {
      return `<button type='button' class='segment ${preset === p[0] ? 'active' : ''}' data-action='report-preset' data-preset='${p[0]}'>${p[1]}</button>`;
    }).join('');

    const filterBar = `<section class='report-filter-bar'>
      <div class='segmented' role='group' aria-label='Chọn nhanh kỳ báo cáo'>${presetsHtml}</div>
      <div class='report-date-range'>
        <input class='input' id='report-from' type='date' value='${S.fn.esc(fromVal)}' aria-label='Từ ngày'/>
        <span class='muted'>→</span>
        <input class='input' id='report-to' type='date' value='${S.fn.esc(toVal)}' aria-label='Đến ngày'/>
        <button type='button' class='btn btn-secondary' data-action='report-custom-range'>Xem</button>
      </div>
    </section>`;

    const tabDefs = [
      ['eod', 'Cuối ngày'],
      ['sales', 'Bán hàng & Lợi nhuận'],
      ['inventory', 'Hàng hóa & Kho'],
      ['people', 'Nhân viên & Khách hàng'],
    ];
    const tabBar = `<div class='detail-tabs' role='tablist' aria-label='Nhóm báo cáo'>${tabDefs.map(function (t) {
      return `<button type='button' role='tab' class='${activeTab === t[0] ? 'active' : ''}' data-action='report-tab' data-tab='${t[0]}' aria-selected='${activeTab === t[0]}'>${t[1]}</button>`;
    }).join('')}</div>`;

    let bodyHtml = '';
    if (S.state.analyticsLoading && !report.summary) {
      bodyHtml = `<section class='panel empty-state'><strong>Đang tổng hợp số liệu báo cáo…</strong></section>`;
    } else if (activeTab === 'eod') {
      const eodCards = `<div class='report-grid' data-tour-target='reports-summary'>
        <article class='panel report-card'><small>Hóa đơn hoàn tất</small><strong>${S.fn.number(eod.completedOrders ?? summary.orderCount ?? 0)} đơn</strong><span>Doanh thu thuần: ${S.fn.moneyVndText(summary.netSalesVnd || '0')}</span></article>
        <article class='panel report-card'><small>Thu tiền mặt trong kỳ</small><strong style='color:var(--primary)'>+${S.fn.moneyVndText(eod.cashInflowVnd || '0')}</strong><span>Tổng thu các kênh: ${S.fn.moneyVndText(summary.collectedVnd || '0')}</span></article>
        <article class='panel report-card'><small>Chi tiền mặt / Trả hàng</small><strong style='color:var(--danger)'>−${S.fn.moneyVndText(eod.cashOutflowVnd || '0')}</strong><span>${S.fn.number(eod.returnedOrders || 0)} phiếu trả (${S.fn.moneyVndText(eod.returnedVnd || '0')}) · ${S.fn.number(eod.voidedOrders || 0)} hủy</span></article>
        <article class='panel report-card'><small>Chênh lệch két tiền mặt</small><strong>${S.fn.moneyVndText(eod.netCashflowVnd || '0')}</strong><span>Phát sinh phải thu mới: ${S.fn.moneyVndText(summary.receivableVnd || '0')}</span></article>
      </div>`;
      const donutHtml = S.charts?.renderPaymentDonutChart ? S.charts.renderPaymentDonutChart(report.paymentBreakdown) : '';
      bodyHtml = `${eodCards}<section class='panel'><div class='panel-header'><div><h2>Cơ cấu phương thức thanh toán</h2><p>${report.range ? `${S.fn.esc(report.range.from)} đến ${S.fn.esc(report.range.to)}` : ''}</p></div></div>${donutHtml}</section>`;
    } else if (activeTab === 'sales') {
      const deltaBadge = S.charts?.renderDeltaBadge ? S.charts.renderDeltaBadge(prev.salesGrowthPct, 'so với kỳ trước') : '';
      const grossDisplay = canCost && summary.grossProfitVnd != null ? S.fn.moneyVndText(summary.grossProfitVnd) : 'Ẩn theo quyền';
      const pnlExtras = window.SlinkFinanceUI ? window.SlinkFinanceUI.renderReportsPnlExtras({ summary, expenseBreakdown: report.expenseBreakdown || [] }) : { pnlCardsHtml: '', expenseSectionHtml: '' };
      const chartHtml = S.charts?.renderRevenueBarChart ? S.charts.renderRevenueBarChart(report.days || []) : '';
      bodyHtml = `<div class='report-grid' data-tour-target='reports-summary'>
        <article class='panel report-card'><small>Doanh thu thuần</small><strong>${S.fn.moneyVndText(summary.netSalesVnd || '0')}</strong><span>${S.fn.number(summary.orderCount || 0)} đơn</span><div style='margin-top:6px'>${deltaBadge}</div></article>
        <article class='panel report-card'><small>Lãi gộp ước tính</small><strong>${grossDisplay}</strong>${canCost ? '' : '<span>Cần quyền Xem giá vốn</span>'}</article>
        <article class='panel report-card'><small>Giá trị đơn trung bình</small><strong>${S.fn.moneyVndText(summary.averageTicketVnd || '0')}</strong></article>
        <article class='panel report-card'><small>Tiền đã thu ròng</small><strong>${S.fn.moneyVndText(summary.collectedVnd || '0')}</strong><span>Còn thu: ${S.fn.moneyVndText(summary.receivableVnd || '0')}</span></article>
      </div>
      ${pnlExtras.pnlCardsHtml ? `<div class='fv-pnl-grid'>${pnlExtras.pnlCardsHtml}</div>` : ''}
      <section class='panel' style='margin-bottom:18px'><div class='panel-header'><div><h2>Biểu đồ doanh thu</h2><p>${report.range ? `${S.fn.esc(report.range.from)} → ${S.fn.esc(report.range.to)}` : ''}</p></div></div>${chartHtml}</section>
      ${pnlExtras.expenseSectionHtml}`;
    } else if (activeTab === 'inventory') {
      const topRows = (Array.isArray(report.topProducts) ? report.topProducts : []).map(function (item, i) {
        return `<tr><td>${i + 1}</td><td><strong>${S.fn.esc(item.name)}</strong><div class='muted' style='font-size:11.5px'>${S.fn.esc(item.sku || '—')}</div></td><td class='text-right'>${S.fn.number(item.quantity_sold)} ${S.fn.esc(item.unit || '')}</td><td class='text-right'><strong>${S.fn.moneyVndText(item.net_sales_vnd || '0')}</strong></td></tr>`;
      }).join('');
      const catRows = (Array.isArray(report.byCategory) ? report.byCategory : []).map(function (c) {
        return `<tr><td><strong>${S.fn.esc(c.category || 'Chung')}</strong></td><td class='text-right'>${S.fn.number(c.quantitySold || 0)}</td><td class='text-right'><strong>${S.fn.moneyVndText(c.netSalesVnd || '0')}</strong></td>${canCost ? `<td class='text-right'>${c.grossProfitVnd != null ? S.fn.moneyVndText(c.grossProfitVnd) : '—'}</td>` : ''}</tr>`;
      }).join('');
      bodyHtml = `<div class='report-main-grid'>
        <section class='panel'><div class='panel-header'><h2>Top sản phẩm bán chạy</h2></div><div class='table-wrap'><table class='data-table'><thead><tr><th>#</th><th>Sản phẩm</th><th class='text-right'>SL bán ròng</th><th class='text-right'>Doanh thu thuần</th></tr></thead><tbody>${topRows || `<tr><td colspan='4'><div class='empty-state'>Chưa có sản phẩm phát sinh doanh số.</div></td></tr>`}</tbody></table></div></section>
        <section class='panel'><div class='panel-header'><h2>Hiệu quả theo danh mục</h2></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Danh mục</th><th class='text-right'>SL bán</th><th class='text-right'>Doanh thu</th>${canCost ? `<th class='text-right'>Lãi gộp</th>` : ''}</tr></thead><tbody>${catRows || `<tr><td colspan='${canCost ? 4 : 3}'><div class='empty-state'>Chưa có dữ liệu danh mục.</div></td></tr>`}</tbody></table></div></section>
      </div>`;
    } else {
      const staffRows = (Array.isArray(report.byStaff) ? report.byStaff : []).map(function (s, i) {
        return `<tr><td>${i + 1}</td><td><strong>${S.fn.esc(s.name || 'Nhân viên')}</strong></td><td class='text-right'>${S.fn.number(s.orderCount || 0)} đơn</td><td class='text-right'><strong>${S.fn.moneyVndText(s.netSalesVnd || '0')}</strong></td></tr>`;
      }).join('');
      bodyHtml = `<section class='panel' style='margin-bottom:16px'><div class='panel-header'><h2>Doanh số theo nhân viên</h2></div><div class='table-wrap'><table class='data-table'><thead><tr><th>#</th><th>Nhân viên</th><th class='text-right'>Số hóa đơn</th><th class='text-right'>Doanh thu thuần</th></tr></thead><tbody>${staffRows || `<tr><td colspan='4'><div class='empty-state'>Chưa có giao dịch theo nhân viên.</div></td></tr>`}</tbody></table></div></section>
      <section class='panel'><div class='panel-header'><h2>Tổng hợp công nợ khách hàng</h2><button class='link-button' data-route='customers'>Mở danh sách khách →</button></div><div class='detail-kv-grid'><div class='detail-kv-item'><small>Phát sinh phải thu mới</small><strong>${S.fn.moneyVndText(summary.receivableVnd || '0')}</strong></div><div class='detail-kv-item'><small>Tổng dư nợ hiện tại</small><strong>${S.fn.moneyVndText(S.state.financeSummary?.customerDebtVnd || '0')}</strong></div></div></section>`;
    }

    return S.fn.pageHeading('Báo cáo', '', `<button class='btn btn-secondary' data-action='download-reports-csv' ${reportCanPrint ? '' : 'disabled'}>Tải CSV</button><button class='btn btn-secondary' data-action='print-reports-pdf' ${reportCanPrint ? '' : 'disabled'} title='In hoặc lưu báo cáo thành PDF'>In / lưu PDF</button>`) +
      `${S.state.analyticsError ? `<div class='notice-item'><span>${S.fn.icon('alert', 18)}</span><span><strong>Chưa tải được báo cáo</strong><small>${S.fn.esc(S.state.analyticsError)}</small></span></div>` : ''}${filterBar}${tabBar}${bodyHtml}`;
  }

})(window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {}, charts: {} });
