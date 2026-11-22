(function (S) {
  'use strict';

  function esc(v) {
    return S.fn?.esc ? S.fn.esc(v) : String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function formatMoney(v) {
    return S.fn?.money ? S.fn.money(v) : `${Number(v || 0).toLocaleString('vi-VN')} đ`;
  }

  function shortMoney(v) {
    return S.fn?.shortMoney ? S.fn.shortMoney(v) : `${Math.round(Number(v || 0) / 1000)}k`;
  }

  function renderDeltaBadge(pct, suffixLabel = 'so với kỳ trước') {
    if (pct === null || pct === undefined || Number.isNaN(Number(pct))) {
      return `<span class='kpi-delta is-flat'>— ${esc(suffixLabel)}</span>`;
    }
    const n = Number(pct);
    if (n > 0) return `<span class='kpi-delta is-up'>↑ +${esc(String(n))}% ${esc(suffixLabel)}</span>`;
    if (n < 0) return `<span class='kpi-delta is-down'>↓ ${esc(String(n))}% ${esc(suffixLabel)}</span>`;
    return `<span class='kpi-delta is-flat'>0% ${esc(suffixLabel)}</span>`;
  }

  function renderRevenueBarChart(days, options = {}) {
    const rows = Array.isArray(days) ? days : [];
    if (!rows.length) {
      return `<div class='empty-state'><small>Chưa có dữ liệu doanh thu trong khoảng thời gian này.</small></div>`;
    }
    const width = 680;
    const height = Number(options.height || 230);
    const padL = 56;
    const padR = 16;
    const padT = 22;
    const padB = 34;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const values = rows.map((d) => Number(d.salesVnd || d.sales || 0));
    const maxVal = Math.max(1000, ...values);
    const gridSteps = [0, 0.25, 0.5, 0.75, 1];
    const barSlot = plotW / rows.length;
    const barW = Math.max(8, Math.min(34, barSlot * 0.58));

    const gridLines = gridSteps.map((ratio) => {
      const y = (padT + plotH * (1 - ratio)).toFixed(1);
      const val = Math.round(maxVal * ratio);
      const label = val === 0 ? '0' : shortMoney(val);
      return `<line x1='${padL}' y1='${y}' x2='${width - padR}' y2='${y}' stroke='#E2E8F0' stroke-dasharray='3 3'/><text x='${padL - 8}' y='${Number(y) + 4}' text-anchor='end' font-size='11' fill='#52606D'>${esc(label)}</text>`;
    }).join('');

    const stepLabel = rows.length > 14 ? Math.ceil(rows.length / 7) : 1;
    const bars = rows.map((row, idx) => {
      const val = values[idx];
      const h = Math.max(val > 0 ? 4 : 2, (val / maxVal) * plotH);
      const x = (padL + idx * barSlot + (barSlot - barW) / 2).toFixed(1);
      const y = (padT + plotH - h).toFixed(1);
      const parts = String(row.date || '').split('-');
      const shortDate = parts.length === 3 ? `${parts[2]}/${parts[1]}` : String(row.date || '');
      const showLabel = idx % stepLabel === 0 || idx === rows.length - 1;
      const fill = val > 0 ? 'url(#slinkBarGrad)' : '#E2E8F0';
      return `<g>
        <rect x='${x}' y='${y}' width='${barW.toFixed(1)}' height='${h.toFixed(1)}' rx='5' fill='${fill}'>
          <title>${esc(shortDate)}: ${esc(formatMoney(val))} (${Number(row.orderCount || row.orders || 0)} đơn)</title>
        </rect>
        ${showLabel ? `<text x='${(Number(x) + barW / 2).toFixed(1)}' y='${height - 10}' text-anchor='middle' font-size='11' fill='#52606D'>${esc(shortDate)}</text>` : ''}
      </g>`;
    }).join('');

    return `<div class='chart-svg-wrap'>
      <svg class='chart-svg' viewBox='0 0 ${width} ${height}' role='img' aria-label='Biểu đồ doanh thu theo ngày'>
        <defs>
          <linearGradient id='slinkBarGrad' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0%' stop-color='#0F6B4E'/>
            <stop offset='100%' stop-color='#10B981'/>
          </linearGradient>
        </defs>
        ${gridLines}
        ${bars}
      </svg>
    </div>`;
  }

  function renderPaymentDonutChart(paymentBreakdown) {
    const pb = paymentBreakdown || {};
    const slices = [
      { key: 'cash', label: 'Tiền mặt', color: '#0F6B4E', value: Number(pb.cash || 0) },
      { key: 'bank_qr', label: 'VietQR', color: '#10B981', value: Number(pb.bank_qr || 0) },
      { key: 'bank_transfer', label: 'Chuyển khoản', color: '#2563EB', value: Number(pb.bank_transfer || 0) },
      { key: 'card', label: 'Thẻ', color: '#7C3AED', value: Number(pb.card || 0) },
      { key: 'receivable', label: 'Khách ghi nợ', color: '#D97706', value: Number(pb.receivableVnd || 0) },
      { key: 'other', label: 'Khác', color: '#64748B', value: Number(pb.other || 0) },
    ];
    const nonZero = slices.filter((s) => s.value > 0);
    const total = nonZero.reduce((sum, s) => sum + s.value, 0);
    const size = 156;
    const cx = 78;
    const cy = 78;
    const r = 56;
    const circ = 2 * Math.PI * r;
    let offset = 0;

    const arcs = total > 0
      ? nonZero.map((s) => {
        const dash = (s.value / total) * circ;
        const arc = `<circle cx='${cx}' cy='${cy}' r='${r}' fill='none' stroke='${s.color}' stroke-width='20' stroke-dasharray='${dash.toFixed(2)} ${(circ - dash).toFixed(2)}' stroke-dashoffset='${(-offset).toFixed(2)}' transform='rotate(-90 ${cx} ${cy})'><title>${esc(s.label)}: ${esc(formatMoney(s.value))}</title></circle>`;
        offset += dash;
        return arc;
      }).join('')
      : `<circle cx='${cx}' cy='${cy}' r='${r}' fill='none' stroke='#E2E8F0' stroke-width='20'/>`;

    const legend = slices.filter((s) => s.value > 0 || ['cash', 'bank_qr', 'bank_transfer', 'receivable'].includes(s.key)).map((s) => {
      const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
      return `<div class='donut-legend-row'>
        <span class='donut-legend-label'><i class='donut-dot' style='background:${s.color}'></i>${esc(s.label)}</span>
        <strong class='tabular'>${esc(formatMoney(s.value))} <span class='muted'>(${pct}%)</span></strong>
      </div>`;
    }).join('');

    return `<div class='payment-donut-layout'>
      <svg width='${size}' height='${size}' viewBox='0 0 ${size} ${size}' role='img' aria-label='Cơ cấu thanh toán'>
        ${arcs}
        <text x='${cx}' y='${cy - 4}' text-anchor='middle' font-size='11' fill='#52606D' font-weight='600'>Tổng dòng</text>
        <text x='${cx}' y='${cy + 14}' text-anchor='middle' font-size='13' fill='#0F172A' font-weight='800'>${esc(total > 0 ? shortMoney(total) : '0')}</text>
      </svg>
      <div class='donut-legend'>${legend}</div>
    </div>`;
  }

  window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {}, charts: {} };
  window.Slink.charts = {
    renderDeltaBadge,
    renderRevenueBarChart,
    renderPaymentDonutChart,
  };
})(window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {}, charts: {} });
