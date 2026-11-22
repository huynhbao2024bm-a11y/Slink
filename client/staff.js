(function (S) {
  'use strict';

  S.fn.loadStaffPage = async function loadStaffPage() {
    if (!S.state.authSession || !S.state.store.id || S.state.store.role !== 'owner') return;
    if (S.state.staffSubTab === 'payroll') {
      await S.fn.loadStaffPayroll();
      return;
    }
    if (S.state.staffSubTab === 'radar') {
      await S.fn.loadLossPreventionRadar();
      return;
    }
    const storeId = S.state.store.id, session = S.state.authSession, request = ++S.state.staffRequestNumber;
    const current = () => S.state.store.id === storeId && S.state.authSession === session && request === S.state.staffRequestNumber;
    S.state.staffState.loading = true;
    S.state.staffState.error = '';
    if (S.state.page === 'staff') S.fn.render();
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/staff`);
      if (!current()) return;
      S.state.staffState.members = result.members || [];
      S.state.staffState.invitations = result.invitations || [];
      S.state.staffState.warehouses = result.warehouses || [];
      S.state.staffState.summary = result.summary || null;
      S.state.staffState.loading = false;
    } catch (error) {
      if (!current()) return;
      S.state.staffState.loading = false;
      S.state.staffState.error = error.message;
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
    }
    if (S.state.page === 'staff') S.fn.render();
  }


  S.fn.loadStaffPayroll = async function loadStaffPayroll(monthOverride) {
    if (!S.state.authSession || !S.state.store.id || S.state.store.role !== 'owner') return;
    if (monthOverride) S.state.payrollState.periodMonth = monthOverride;
    const reqNum = ++S.state.payrollState.requestNumber;
    S.state.payrollState.loading = true;
    S.state.payrollState.error = '';
    if (S.state.page === 'staff') S.fn.render();
    try {
      const res = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/payroll?month=${encodeURIComponent(S.state.payrollState.periodMonth)}`);
      if (reqNum !== S.state.payrollState.requestNumber) return;
      S.state.payrollState.periodMonth = res.periodMonth || S.state.payrollState.periodMonth;
      S.state.payrollState.rows = Array.isArray(res.staffPayroll) ? res.staffPayroll : (Array.isArray(res.rows) ? res.rows : []);
      S.state.payrollState.totalEstimatedPayableVnd = res.totalEstimatedPayableVnd || '0';
      S.state.payrollState.loading = false;
    } catch (error) {
      if (reqNum !== S.state.payrollState.requestNumber) return;
      S.state.payrollState.loading = false;
      S.state.payrollState.error = error.message;
    }
    if (S.state.page === 'staff') S.fn.render();
  }


  S.fn.loadLossPreventionRadar = async function loadLossPreventionRadar() {
    if (!S.state.authSession || !S.state.store.id || S.state.store.role !== 'owner') return;
    const reqNum = ++S.state.radarState.requestNumber;
    S.state.radarState.loading = true;
    S.state.radarState.error = '';
    if (S.state.page === 'staff') S.fn.render();
    try {
      const res = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/loss-prevention-radar`);
      if (reqNum !== S.state.radarState.requestNumber) return;
      S.state.radarState.prebillAlerts = Array.isArray(res.prebillAlerts) ? res.prebillAlerts : [];
      S.state.radarState.refundAlerts = Array.isArray(res.refundAlerts) ? res.refundAlerts : [];
      S.state.radarState.shortageAlerts = Array.isArray(res.shortageAlerts) ? res.shortageAlerts : [];
      S.state.radarState.loading = false;
    } catch (error) {
      if (reqNum !== S.state.radarState.requestNumber) return;
      S.state.radarState.loading = false;
      S.state.radarState.error = error.message;
    }
    if (S.state.page === 'staff') S.fn.render();
  }


  S.fn.openStaffAdvanceModal = function openStaffAdvanceModal(userId) {
    if (S.state.store.role !== 'owner') return S.fn.toast('Không đủ quyền', 'Chỉ chủ cửa hàng mới được ghi ứng lương.', 'error');
    const member = (S.state.staffState.members || []).find(m => m.user_id === userId) || (S.state.payrollState.rows || []).find(r => r.userId === userId);
    const name = member?.display_name || member?.displayName || 'Nhân viên';
    const form = `<form id='entity-form' data-form='staff-advance' data-id='${S.fn.esc(userId)}'>
      <div class='form-grid'>
        <div class='form-field'><label class='input-label' for='advance-amount'>Số tiền ứng (VND) *</label><input class='input' id='advance-amount' name='amountVnd' type='number' min='1000' step='1000' required placeholder='500000'/></div>
        <div class='form-field'><label class='input-label' for='advance-method'>Nguồn tiền chi *</label><select class='input' id='advance-method' name='method'><option value='bank_transfer'>Chuyển khoản ngân hàng</option><option value='cash'>Tiền mặt tại két</option></select></div>
        <div class='form-field full'><label class='input-label' for='advance-note'>Ghi chú ứng lương</label><input class='input' id='advance-note' name='note' maxlength='240' placeholder='Ứng lương giữa tháng…'/></div>
      </div>
      <div class='modal-note'>Slink sẽ tự động tạo phiếu chi trong Sổ quỹ và tự động trừ khoản ứng này khi chốt bảng lương cuối tháng của <strong>${S.fn.esc(name)}</strong>.</div>
    </form>`;
    S.fn.showModal(`Ứng lương · ${name}`, 'Ghi nhận khoản tạm ứng lương nhanh 1 chạm.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>Xác nhận chi ứng lương</button>`);
  }


  S.fn.submitStaffAdvanceForm = async function submitStaffAdvanceForm(form) {
    const userId = form.dataset.id;
    const fd = new FormData(form);
    const amountVnd = String(fd.get('amountVnd') || '0').trim();
    const method = String(fd.get('method') || 'bank_transfer');
    const note = String(fd.get('note') || '').trim();
    const submit = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (submit) submit.disabled = true;
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/staff/${encodeURIComponent(userId)}/advances`, {
        method: 'POST',
        headers: { 'idempotency-key': S.fn.newIdempotencyKey() },
        body: { amountVnd, method, note },
      });
      S.fn.closeModal();
      S.fn.emitSyncDomains(['cashbook', 'staff', 'dashboard'], { source: 'staff-advance', userId, skipLocalReload: true });
      S.fn.toast('Đã ghi nhận ứng lương', `Đã tạo phiếu chi tạm ứng ${S.fn.moneyVndText(amountVnd)}.`);
      if (S.state.staffSubTab === 'payroll') await S.fn.loadStaffPayroll();
    } catch (error) {
      if (submit?.isConnected) submit.disabled = false;
      S.fn.toast('Chưa ghi nhận được ứng lương', error.message, 'error');
    }
  }


  S.fn.settleStaffPayroll = async function settleStaffPayroll(userId, button) {
    if (S.state.store.role !== 'owner') return;
    const row = (S.state.payrollState.rows || []).find(r => r.userId === userId);
    if (!row) return;
    const unitsInput = document.querySelector(`[data-payroll-units='${CSS.escape(userId)}']`);
    const bonusInput = document.querySelector(`[data-payroll-bonus='${CSS.escape(userId)}']`);
    const shortageBox = document.querySelector(`[data-payroll-shortage='${CSS.escape(userId)}']`);
    const workedUnits = unitsInput ? Number(unitsInput.value ?? row.autoWorkedUnits ?? 0) : Number(row.autoWorkedUnits ?? 0);
    const bonusVnd = bonusInput ? String(Math.max(0, Math.trunc(Number(bonusInput.value || 0)))) : '0';
    const includeShortages = shortageBox ? Boolean(shortageBox.checked) : true;
    if (button) button.disabled = true;
    try {
      const res = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/payroll/settle`, {
        method: 'POST',
        headers: { 'idempotency-key': S.fn.newIdempotencyKey() },
        body: {
          userId,
          periodMonth: S.state.payrollState.periodMonth,
          workedUnits,
          bonusVnd,
          includeShortages,
          paymentMethod: 'bank_transfer',
        },
      });
      S.fn.emitSyncDomains(['cashbook', 'staff', 'dashboard'], { source: 'payroll-settle', userId, skipLocalReload: true });
      const payslipNum = res.payslip?.payslip_number || res.payslip?.payslipNumber || '';
      const netPayVnd = res.payslip?.net_payable_vnd || res.payslip?.netPayableVnd || '0';
      S.fn.toast('Đã chốt phiếu lương', `${payslipNum} · Thực lĩnh ${S.fn.moneyVndText(netPayVnd)}`);
      await S.fn.loadStaffPayroll();
      if (res.payslip) {
        await S.fn.shareStaffPayslipPng(userId, res.payslip);
      }
    } catch (error) {
      if (button?.isConnected) button.disabled = false;
      S.fn.toast('Chưa chốt được lương', error.message, 'error');
    }
  }


  S.fn.shareStaffPayslipPng = async function shareStaffPayslipPng(userId, payslipOverride) {
    const row = (S.state.payrollState.rows || []).find(r => r.userId === userId);
    if (!row || !window.SlinkReceiptImage || typeof window.SlinkReceiptImage.renderPayslipPng !== 'function') return;
    const ps = payslipOverride || row.settledPayslip;
    const netPayableVnd = ps ? (ps.net_payable_vnd ?? ps.netPayableVnd ?? '0') : (row.netPayableVnd ?? row.estimatedNetPayableVnd ?? '0');
    const payslipNumber = ps?.payslip_number || ps?.payslipNumber || `PL-${S.state.payrollState.periodMonth.replace('-', '')}`;
    const paidAt = ps?.paid_at ? S.fn.humanDate(ps.paid_at, true) : '';
    const workedUnits = ps ? (ps.worked_units ?? ps.workedUnits ?? row.autoWorkedUnits) : (row.autoWorkedUnits ?? 0);
    const basePayVnd = ps ? (ps.base_pay_vnd ?? ps.basePayVnd ?? '0') : (row.basePayVnd ?? '0');
    const netSalesVnd = ps ? (ps.net_sales_vnd ?? ps.netSalesVnd ?? '0') : (row.netSalesVnd ?? '0');
    const commissionPayVnd = ps ? (ps.commission_pay_vnd ?? ps.commissionPayVnd ?? '0') : (row.commissionPayVnd ?? '0');
    const bonusVnd = ps ? (ps.bonus_vnd ?? ps.bonusVnd ?? '0') : '0';
    const advanceDeductionVnd = ps ? (ps.advance_deduction_vnd ?? ps.advanceDeductionVnd ?? '0') : (row.advanceDeductionVnd ?? '0');
    const shortageDeductionVnd = ps ? (ps.shortage_deduction_vnd ?? ps.shortageDeductionVnd ?? '0') : (row.shortageDeductionVnd ?? '0');
    try {
      const rendered = await window.SlinkReceiptImage.renderPayslipPng({
        storeName: S.state.store.settings.storeName || 'Slink',
        payslipNumber,
        paidAt,
        periodMonth: S.state.payrollState.periodMonth,
        employeeName: row.displayName,
        staffCode: row.staffCode || '',
        jobTitle: row.jobTitle || '',
        roleLabel: S.fn.staffRoleName(row.role),
        salaryMode: row.salaryMode,
        workedUnits,
        basePayVnd,
        netSalesVnd,
        commissionPayVnd,
        bonusVnd,
        advanceDeductionVnd,
        shortageDeductionVnd,
        netPayableVnd,
        bankBin: row.bankBin || '',
        bankAccountNumber: row.bankAccountNumber || '',
        bankAccountOwner: row.bankAccountOwner || '',
      });
      const filename = `phieu-luong-${S.state.payrollState.periodMonth}-${String(row.staffCode || row.displayName || 'nv').replace(/[^a-zA-Z0-9_-]+/g, '-')}.png`;
      await window.SlinkReceiptImage.sharePng({
        dataUrl: rendered.dataUrl,
        blob: rendered.blob,
        filename,
        title: `Phiếu lương tháng ${S.state.payrollState.periodMonth} · ${row.displayName}`,
        text: `${S.state.store.settings.storeName || 'Slink'} · Phiếu lương tháng ${S.state.payrollState.periodMonth} · ${row.displayName} · Thực lĩnh ${S.fn.moneyVndText(netPayableVnd)}`,
      });
    } catch (error) {
      S.fn.toast('Chưa tạo được ảnh phiếu lương', error.message, 'error');
    }
  }


  S.fn.toggleWaiveShortage = async function toggleWaiveShortage(sessionId, waived) {
    if (S.state.store.role !== 'owner' || !sessionId) return;
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/cash-sessions/${encodeURIComponent(sessionId)}/waive-variance`, {
        method: 'POST',
        body: { waived: Boolean(waived) },
      });
      S.fn.toast(waived ? 'Đã bỏ qua lệch két ca này' : 'Đã khôi phục trừ lệch két');
      if (S.state.staffSubTab === 'radar') await S.fn.loadLossPreventionRadar();
      else if (S.state.staffSubTab === 'payroll') await S.fn.loadStaffPayroll();
    } catch (error) {
      S.fn.toast('Chưa cập nhật được lệch két', error.message, 'error');
    }
  }


  S.fn.openStaffActivity = async function openStaffActivity(id) {
    if (S.state.store.role !== 'owner') return;
    const member = S.state.staffState.members.find(row => row.user_id === id);
    if (!member) return;
    const storeId = S.state.store.id, session = S.state.authSession;
    const assigned = S.state.staffState.warehouses.filter(warehouse => (member.warehouse_scope_ids || []).includes(warehouse.id)).map(warehouse => warehouse.name);
    const body = `<div class='detail-line'><span>Tài khoản</span><strong>${S.fn.esc(member.email)}</strong></div>
      <div class='detail-line'><span>Vai trò</span><strong>${S.fn.esc(S.fn.staffRoleName(member.role))}</strong></div>
      <div class='detail-line'><span>Trạng thái</span><strong>${member.status === 'active' ? 'Đang hoạt động' : 'Tạm khóa'}</strong></div>
      ${member.role === 'stockkeeper' ? `<div class='detail-line'><span>Kho được giao</span><strong>${S.fn.esc(member.warehouse_scope_mode === 'selected' ? assigned.join(', ') || 'Chưa có kho' : 'Tất cả kho')}</strong></div>` : ''}
      <section class='activity-list'><h3>Việc đã ghi gần đây</h3><div data-staff-activity role='status'>Đang tải…</div></section>`;
    S.fn.showModal(member.display_name, 'Hồ sơ nhân viên', body, `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button>`);
    const view = S.dom.modal.querySelector('[data-staff-activity]');
    const current = () => !S.dom.modal.hidden && view.isConnected && S.state.authSession === session && S.state.store.id === storeId;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/audit-events?actorId=${encodeURIComponent(id)}&limit=15`);
      if (!current()) return;
      view.innerHTML = result.events.map(item => `<div class='activity-item'><span class='activity-text'><strong>${S.fn.esc(S.fn.auditActionLabel(item.action))}</strong><small>${S.fn.humanDate(item.occurredAt, true)}${item.reason ? ' · ' + S.fn.esc(item.reason) : ''}</small></span></div>`).join('') || '<p>Chưa có việc được ghi.</p>';
    } catch (error) {
      if (!current()) return;
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      view.textContent = 'Chưa xem được nhật ký. Thử lại khi có mạng.';
    }
  }


  S.fn.renderStaffPermFieldset = function renderStaffPermFieldset(member) {
    const eff = S.fn.resolveEffectivePermissions(member.role, member.permissions, member.effectivePermissions);
    const uid = S.fn.esc(member.user_id);
    const toggles = [
      ['view_cost_price', 'Xem giá vốn & lãi gộp'],
      ['edit_products', 'Thêm / sửa sản phẩm'],
      ['void_or_return_order', 'Hủy đơn & đổi / trả hàng'],
      ['record_cashbook', 'Ghi phiếu thu chi & sổ quỹ'],
      ['view_reports', 'Xem báo cáo & doanh thu'],
    ].map(function ([key, label]) {
      return `<label class='staff-perm-toggle'><input type='checkbox' data-member-perm='${uid}' data-perm-key='${key}' ${eff[key] ? 'checked' : ''}/><span>${label}</span></label>`;
    }).join('');
    return `<fieldset class='staff-perms' data-member-perms='${uid}'><div class='staff-perm-header'><span class='staff-perm-title'>Quyền chi tiết theo nhân viên</span><button class='link-button' type='button' data-action='reset-member-perms' data-id='${uid}'>Đặt lại theo vai trò</button></div><div class='staff-perm-grid'>${toggles}</div><label class='staff-perm-discount'><span>Mức giảm giá tối đa tại POS (%)</span><input class='input' type='number' min='0' max='100' step='1' data-member-perm='${uid}' data-perm-key='pos_max_discount_pct' value='${S.fn.esc(String(eff.pos_max_discount_pct ?? 0))}'/></label></fieldset>`;
  }


  S.fn.renderStaffPayrollSection = function renderStaffPayrollSection() {
    const rows = S.state.payrollState.rows || [];
    const modeLabel = (m) => ({ monthly: 'Theo tháng', shift: 'Theo ca', hourly: 'Theo giờ' })[m] || 'Theo tháng';
    const unitLabel = (m) => ({ monthly: 'ngày công', shift: 'ca', hourly: 'giờ' })[m] || 'ngày công';
    const rowsHtml = rows.map(function (row) {
      const settled = row.settledPayslip;
      const hasShortages = Number(row.shortageDeductionVnd || 0) > 0;
      return `<tr data-payroll-row='${S.fn.esc(row.userId)}'>
        <td>
          <div class='product-name-stack'>
            <strong>${S.fn.esc(row.displayName)}${row.staffCode ? ` <small class='badge badge-neutral'>${S.fn.esc(row.staffCode)}</small>` : ''}</strong>
            <small>${S.fn.esc(S.fn.staffRoleName(row.role))} · ${S.fn.esc(modeLabel(row.salaryMode))} (${S.fn.moneyVndText(row.baseSalaryVnd)})</small>
            ${row.firstSeenAt ? `<small class='muted'>Hoạt động: ${S.fn.humanDate(row.firstSeenAt, true)} → ${S.fn.humanDate(row.lastSeenAt, true)}</small>` : ''}
          </div>
        </td>
        <td>
          <div style='display:flex;align-items:center;gap:6px'>
            <input class='input' type='number' min='0' max='744' step='0.5' style='width:78px' data-payroll-units='${S.fn.esc(row.userId)}' value='${S.fn.esc(String(settled ? settled.worked_units : row.autoWorkedUnits))}' aria-label='Số công của ${S.fn.esc(row.displayName)}'/>
            <small class='muted'>${S.fn.esc(unitLabel(row.salaryMode))}<br>(Tự đếm: ${S.fn.number(row.activeDays)} ngày)</small>
          </div>
        </td>
        <td class='text-right'><strong>${S.fn.moneyVndText(settled ? settled.base_pay_vnd : row.basePayVnd)}</strong></td>
        <td class='text-right'>
          <div class='product-name-stack'>
            <strong style='color:var(--accent-strong)'>+${S.fn.moneyVndText(settled ? settled.commission_pay_vnd : row.commissionPayVnd)}</strong>
            <small class='muted'>DT thực thu: ${S.fn.moneyVndText(settled ? settled.net_sales_vnd : row.netSalesVnd)} (${S.fn.number(row.commissionRateBps / 100)}%)</small>
          </div>
        </td>
        <td class='text-right'>
          ${Number(row.advanceDeductionVnd || 0) > 0
            ? `<span class='stock-number low'>−${S.fn.moneyVndText(row.advanceDeductionVnd)}</span>`
            : settled && Number(settled.advance_deduction_vnd || 0) > 0
              ? `<small class='muted'>Đã trừ −${S.fn.moneyVndText(settled.advance_deduction_vnd)}</small>`
              : `<span class='muted'>0 ₫</span>`}
          <div><button type='button' class='link-button' data-action='open-staff-advance' data-id='${S.fn.esc(row.userId)}'>＋ Ứng lương</button></div>
        </td>
        <td class='text-right'>
          ${hasShortages
            ? `<label style='display:inline-flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' data-payroll-shortage='${S.fn.esc(row.userId)}' checked/><span class='stock-number low'>−${S.fn.moneyVndText(row.shortageDeductionVnd)}</span></label>`
            : `<span class='muted'>0 ₫</span>`}
        </td>
        <td class='text-right'>
          <strong style='font-size:15px;color:var(--accent-strong)'>${S.fn.moneyVndText(settled ? settled.net_payable_vnd : row.netPayableVnd)}</strong>
          ${settled ? `<div><span class='badge badge-success'>Đã chốt ${S.fn.esc(settled.payslip_number)}</span></div>` : ''}
        </td>
        <td class='text-right'>
          <div style='display:flex;flex-direction:column;gap:6px;align-items:flex-end'>
            <button type='button' class='btn btn-primary' data-action='settle-staff-payroll' data-id='${S.fn.esc(row.userId)}'>${settled ? 'Chốt bổ sung' : 'Chốt & Chi lương'}</button>
            <button type='button' class='btn btn-secondary' data-action='share-staff-payslip-png' data-id='${S.fn.esc(row.userId)}'>Ảnh phiếu lương</button>
          </div>
        </td>
      </tr>`;
    }).join('');
    return `<section class='panel staff-panel'>
      <div class='panel-header'>
        <div>
          <h2>Bảng lương tự động 1 trang</h2>
          <p>Tự đếm ngày công từ ca &amp; đơn bán, tự tính hoa hồng thực thu (đã trừ hàng trả), tự gom tiền ứng lương và lệch két.</p>
        </div>
        <div style='display:flex;align-items:center;gap:8px'>
          <label style='display:flex;align-items:center;gap:6px'><span class='muted'>Kỳ lương:</span><input class='input' id='payroll-month-input' type='month' value='${S.fn.esc(S.state.payrollState.periodMonth)}' style='width:155px'/></label>
          <button type='button' class='btn btn-secondary' data-action='reload-payroll'>Làm mới</button>
        </div>
      </div>
      ${S.state.payrollState.error ? `<div class='auth-message error'>${S.fn.esc(S.state.payrollState.error)}</div>` : ''}
      ${S.state.payrollState.loading ? `<div class='empty-state'><strong>Đang tổng hợp bảng lương…</strong></div>` : `
      <div class='table-wrap'>
        <table class='data-table'>
          <thead>
            <tr>
              <th>Nhân viên</th>
              <th>Số công / Ca</th>
              <th class='text-right'>Lương cơ bản</th>
              <th class='text-right'>Hoa hồng thực thu</th>
              <th class='text-right'>Trừ tạm ứng</th>
              <th class='text-right'>Trừ lệch két</th>
              <th class='text-right'>Thực lĩnh</th>
              <th class='text-right'>Thao tác</th>
            </tr>
          </thead>
          <tbody>${rowsHtml || `<tr><td colspan='8'><div class='empty-state'><strong>Chưa có nhân viên trong bảng lương</strong></div></td></tr>`}</tbody>
        </table>
      </div>`}
    </section>`;
  }


  S.fn.renderStaffRadarSection = function renderStaffRadarSection() {
    const prebills = S.state.radarState.prebillAlerts || [];
    const refunds = S.state.radarState.refundAlerts || [];
    const shortages = S.state.radarState.shortageAlerts || [];
    return `<section class='panel staff-panel'>
      <div class='panel-header'>
        <div>
          <h2>Radar Chống Thất Thoát Thực Chiến</h2>
          <p>Tự động bắt 3 hành vi gây thất thoát tiền mặt tại quầy: In tạm tính (F8) rồi xóa giỏ/sửa giảm món, hoàn trả tiền mặt và đóng ca lệch thiếu két.</p>
        </div>
        <button type='button' class='btn btn-secondary' data-action='reload-radar'>Làm mới</button>
      </div>
      ${S.state.radarState.loading ? `<div class='empty-state'><strong>Đang quét dữ liệu kiểm soát…</strong></div>` : `
      <div style='display:grid;gap:14px'>
        <div class='panel' style='padding:14px'>
          <h3 style='margin:0 0 8px;font-size:14px'>1. In hóa đơn tạm tính (F8) nhưng xóa giỏ hoặc giảm tiền &gt; 15% (${S.fn.number(prebills.length)})</h3>
          ${prebills.length ? `<div class='staff-list'>${prebills.map(function (a) {
            return `<article class='staff-invite-row'><div><strong style='color:#b91c1c'>${S.fn.esc(a.description)}</strong><small>${S.fn.humanDate(a.printedAt, true)} · ${S.fn.number(a.lineCount)} dòng hàng</small></div><span class='badge badge-warning'>Cần kiểm tra</span></article>`;
          }).join('')}</div>` : `<small class='muted'>Chưa phát hiện trường hợp in tạm tính F8 bất thường.</small>`}
        </div>
        <div class='panel' style='padding:14px'>
          <h3 style='margin:0 0 8px;font-size:14px'>2. Các ca đóng két lệch thiếu tiền mặt (${S.fn.number(shortages.length)})</h3>
          ${shortages.length ? `<div class='staff-list'>${shortages.map(function (s) {
            return `<article class='staff-invite-row'><div><strong>${S.fn.esc(s.description)}</strong><small>Đóng ca: ${S.fn.humanDate(s.closedAt, true)} · ${s.settled ? 'Đã chốt vào phiếu lương' : s.waived ? 'Đã bỏ qua (không trừ lương)' : 'Đang chờ trừ lương'}</small></div>${!s.settled ? `<button type='button' class='btn btn-secondary' data-action='toggle-waive-shortage' data-id='${S.fn.esc(s.id)}' data-waived='${s.waived ? 'false' : 'true'}'>${s.waived ? 'Đưa lại vào trừ lương' : 'Bỏ qua (Không trừ lương)'}</button>` : ''}</article>`;
          }).join('')}</div>` : `<small class='muted'>Không có ca đóng két nào bị lệch thiếu tiền mặt.</small>`}
        </div>
        <div class='panel' style='padding:14px'>
          <h3 style='margin:0 0 8px;font-size:14px'>3. Nhật ký trả hàng &amp; hoàn tiền gần đây (${S.fn.number(refunds.length)})</h3>
          ${refunds.length ? `<div class='staff-list'>${refunds.map(function (r) {
            return `<article class='staff-invite-row'><div><strong>${S.fn.esc(r.description)}</strong><small>${S.fn.humanDate(r.createdAt, true)} · Lý do: ${S.fn.esc(r.reason)}</small></div>${r.walkinCustomer ? `<span class='badge badge-warning'>Khách lẻ không SĐT</span>` : `<span class='badge badge-neutral'>Có hồ sơ KH</span>`}</article>`;
          }).join('')}</div>` : `<small class='muted'>Chưa phát sinh giao dịch hoàn trả hàng.</small>`}
        </div>
      </div>`}
    </section>`;
  }


  S.fn.renderStaff = function renderStaff() {
    if (S.state.store.role !== 'owner') return `<section class='panel locked-page'><div class='empty-icon'>${S.fn.icon('users', 23)}</div><h2>Không có quyền quản lý nhân viên</h2><p>Chỉ chủ cửa hàng mới có thể mời, phân quyền hoặc tạm khóa thành viên.</p></section>`;
    const q = S.state.staffSearchTerm.trim().toLocaleLowerCase('vi');
    const filteredMembers = S.state.staffState.members.filter(function (member) {
      if (S.state.staffRoleFilter && member.role !== S.state.staffRoleFilter) return false;
      if (!q) return true;
      const hay = `${member.staff_code || ''} ${member.display_name || ''} ${member.email || ''} ${member.phone || ''} ${member.job_title || ''}`.toLocaleLowerCase('vi');
      return hay.includes(q);
    });
    const bankOptionsHtml = (selectedBin) => `<option value=''>— Chọn ngân hàng nhận lương —</option>` + ((window.SlinkBanksVn?.VN_BANKS || window.SlinkBanksVn?.BANKS || []).map(function (b) {
      return `<option value='${S.fn.esc(b.bin)}' ${selectedBin === b.bin ? 'selected' : ''}>${S.fn.esc(b.shortName)} · ${S.fn.esc(b.name)}</option>`;
    }).join(''));
    const memberRows = filteredMembers.map(function (member) {
      const joined = member.joined_at ? S.fn.humanDate(member.joined_at) : 'Chưa có ngày tham gia';
      const scopeMode = member.warehouse_scope_mode || 'all';
      const selectedIds = new Set(Array.isArray(member.warehouse_scope_ids) ? member.warehouse_scope_ids : []);
      const warehouseChecks = S.state.staffState.warehouses.map(function (warehouse) {
        return `<label class='staff-warehouse-option'><input type='checkbox' data-member-warehouse='${member.user_id}' value='${warehouse.id}' ${selectedIds.has(warehouse.id) ? 'checked' : ''}/><span>${S.fn.esc(warehouse.name)}${warehouse.is_default ? ' · Kho chính' : ''}</span></label>`;
      }).join('');
      const codeBadge = member.staff_code ? `<span class='badge badge-neutral' style='margin-right:6px'>${S.fn.esc(member.staff_code)}</span>` : '';
      const commPercent = Number(member.commission_rate_bps || 0) / 100;
      const perfSummary = `${S.fn.number(member.orders_count || 0)} đơn bán · Doanh số ${S.fn.moneyVndText(member.revenue_vnd || '0')}${commPercent > 0 ? ` · Hoa hồng (${commPercent}%): ${S.fn.moneyVndText(member.commission_vnd || '0')}` : ''}${Number(member.base_salary_vnd || 0) > 0 ? ` · Lương cứng: ${S.fn.moneyVndText(member.base_salary_vnd)}` : ''}${Number(member.shifts_count || 0) > 0 ? ` · ${S.fn.number(member.shifts_count)} ca thu ngân` : ''}`;
      return `<article class='staff-row'><div class='staff-person'><span class='avatar'>${S.fn.esc(S.fn.initials(member.display_name))}</span><span class='staff-person-info'><div>${codeBadge}<button type='button' class='link-button' data-action='staff-activity' data-id='${S.fn.esc(member.user_id)}'>${S.fn.esc(member.display_name)}</button>${member.job_title ? ` <small class='muted'>(${S.fn.esc(member.job_title)})</small>` : ''}</div><small>${S.fn.esc(member.email)}${member.phone ? ` · SĐT: ${S.fn.esc(member.phone)}` : ''}</small><small>${S.fn.esc(S.fn.staffRoleName(member.role))} · ${member.status === 'suspended' ? 'Tạm khóa' : 'Đang làm'} · Tham gia ${S.fn.esc(joined)}</small><small style='color:var(--accent-strong);font-weight:600'>${perfSummary}</small></span><div class='staff-person-actions'><button type='button' class='btn btn-secondary' data-action='open-staff-advance' data-id='${S.fn.esc(member.user_id)}'>${S.fn.icon('wallet', 15)} Ứng lương</button></div></div><details class='staff-details' data-staff-detail='${S.fn.esc(member.user_id)}' ${S.state.staffExpandedIds.has(member.user_id) ? 'open' : ''}><summary>Sửa hồ sơ, lương hoa hồng &amp; quyền</summary><div class='staff-controls' style='display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px'><label><span>Họ tên</span><input class='input' data-member-name='${member.user_id}' value='${S.fn.esc(member.display_name || '')}' maxlength='120'/></label><label><span>Mã NV</span><input class='input' data-member-code='${member.user_id}' value='${S.fn.esc(member.staff_code || '')}' maxlength='40' placeholder='NV-001'/></label><label><span>Số điện thoại</span><input class='input' data-member-phone='${member.user_id}' value='${S.fn.esc(member.phone || '')}' maxlength='32' placeholder='09xx...'/></label><label><span>Chức danh / Ca</span><input class='input' data-member-title='${member.user_id}' value='${S.fn.esc(member.job_title || '')}' maxlength='120' placeholder='Thu ngân ca sáng'/></label><label><span>Vai trò</span><select class='input' data-member-role='${member.user_id}'>${Array.from(['manager', 'cashier', 'stockkeeper', 'accountant']).map(function (role) { return `<option value='${role}' ${member.role === role ? 'selected' : ''}>${S.fn.staffRoleName(role)}</option>`; }).join('')}</select></label><label><span>Trạng thái</span><select class='input' data-member-status='${member.user_id}'><option value='active' ${member.status === 'active' ? 'selected' : ''}>Đang hoạt động</option><option value='suspended' ${member.status === 'suspended' ? 'selected' : ''}>Tạm khóa</option></select></label><label><span>Hình thức lương</span><select class='input' data-member-salary-mode='${member.user_id}'><option value='monthly' ${(member.salary_mode || 'monthly') === 'monthly' ? 'selected' : ''}>Theo tháng (26 công)</option><option value='shift' ${member.salary_mode === 'shift' ? 'selected' : ''}>Theo ca làm việc</option><option value='hourly' ${member.salary_mode === 'hourly' ? 'selected' : ''}>Theo giờ làm việc</option></select></label><label><span>Mức lương cơ bản (đ)</span><input class='input' type='number' min='0' step='1' data-member-salary='${member.user_id}' value='${S.fn.esc(member.base_salary_vnd || '0')}'/></label><label><span>Hoa hồng doanh số (%)</span><input class='input' type='number' min='0' max='100' step='0.1' data-member-commission='${member.user_id}' value='${S.fn.esc(commPercent)}'/></label><label><span>Ngân hàng nhận lương</span><select class='input' data-member-bank-bin='${member.user_id}'>${bankOptionsHtml(member.bank_bin || '')}</select></label><label><span>Số tài khoản</span><input class='input' data-member-bank-acc='${member.user_id}' value='${S.fn.esc(member.bank_account_number || '')}' maxlength='40' placeholder='STK nhận lương'/></label><label><span>Chủ tài khoản</span><input class='input' data-member-bank-owner='${member.user_id}' value='${S.fn.esc(member.bank_account_owner || '')}' maxlength='120' placeholder='NGUYEN VAN A'/></label><label style='grid-column:1 / -1'><span>Ghi chú hồ sơ</span><input class='input' data-member-note='${member.user_id}' value='${S.fn.esc(member.note || '')}' maxlength='500' placeholder='Ghi chú hợp đồng, ca làm việc...'/></label><div style='grid-column:1 / -1;display:flex;justify-content:flex-end'><button class='btn btn-primary' data-action='save-staff-member' data-id='${member.user_id}'>Lưu hồ sơ &amp; quyền</button></div></div>${S.fn.renderStaffPermFieldset(member)}<fieldset class='staff-scope' data-member-scope='${member.user_id}' ${member.role === 'stockkeeper' ? '' : 'hidden'}><legend>Phạm vi kho của nhân viên kho</legend><label class='staff-scope-mode'><span>Kho được phép truy cập</span><select class='input' data-member-scope-mode='${member.user_id}'><option value='all' ${scopeMode === 'all' ? 'selected' : ''}>Tất cả kho hiện tại và kho mới</option><option value='selected' ${scopeMode === 'selected' ? 'selected' : ''}>Chỉ các kho đã chọn</option></select></label><div class='staff-warehouse-options' data-member-warehouse-list='${member.user_id}' ${scopeMode === 'selected' ? '' : 'hidden'}>${warehouseChecks || `<small>Chưa có kho đang hoạt động.</small>`}</div><small>Kho mới chỉ tự cấp cho nhân viên ở chế độ “Tất cả kho”.</small></fieldset></details></article>`;
    }).join('');
    const inviteRows = S.state.staffState.invitations.map(function (invite) {
      const pendingInvite = invite.status === 'pending';
      const canResend = pendingInvite || invite.status === 'expired';
      const statusLabel = { pending: 'Đang chờ', accepted: 'Đã tham gia', revoked: 'Đã thu hồi', expired: 'Đã hết hạn' }[invite.status] || invite.status;
      return `<article class='staff-invite-row'><div><strong>${S.fn.esc(invite.email)}</strong><small>${S.fn.staffRoleName(invite.role)} · Hết hạn ${S.fn.humanDate(invite.expires_at)}</small></div><span class='badge ${pendingInvite ? 'badge-warning' : invite.status === 'accepted' ? 'badge-success' : 'badge-neutral'}'><i class='badge-dot'></i>${statusLabel}</span>${canResend ? `<div class='staff-invite-actions'><button class='link-button' data-action='resend-staff-invite' data-id='${invite.id}'>Gửi lại</button>${pendingInvite ? `<button class='link-button danger-text' data-action='revoke-staff-invite' data-id='${invite.id}'>Thu hồi</button>` : ''}</div>` : ''}</article>`;
    }).join('');
    const summary = S.state.staffState.summary || {
      totalStaff: S.state.staffState.members.length,
      activeStaff: S.state.staffState.members.filter(m => m.status === 'active').length,
      totalTeamRevenueVnd: '0',
      totalEstimatedPayoutVnd: '0',
      pendingInvites: S.state.staffState.invitations.filter(i => i.status === 'pending').length,
    };
    const kpiHtml = `<div class='stat-grid' style='margin-bottom:14px'>
      <article class='stat-card'><div class='stat-top'><span class='stat-label'>Đội ngũ nhân sự</span><span class='stat-icon'>${S.fn.icon('users', 15)}</span></div><div class='stat-value'>${S.fn.number(summary.activeStaff)} / ${S.fn.number(summary.totalStaff)}</div><small class='muted'>Đang hoạt động tại cửa hàng</small></article>
      <article class='stat-card'><div class='stat-top'><span class='stat-label'>Doanh số nhân viên</span><span class='stat-icon'>${S.fn.icon('spark', 15)}</span></div><div class='stat-value'>${S.fn.moneyVndText(summary.totalTeamRevenueVnd)}</div><small class='muted'>Tính từ đơn bán hoàn tất</small></article>
      <article class='stat-card'><div class='stat-top'><span class='stat-label'>Lương &amp; Hoa hồng dự kiến</span><span class='stat-icon'>${S.fn.icon('wallet', 15)}</span></div><div class='stat-value'>${S.fn.moneyVndText(summary.totalEstimatedPayoutVnd)}</div><small class='muted'>Lương cơ bản + Hoa hồng doanh số</small></article>
    </div>`;
    const subTabs = `<nav class='workspace-tabs' aria-label='Phân hệ quản trị nhân sự' style='margin-bottom:12px'>
      <button type='button' data-action='staff-subtab' data-subtab='members' ${S.state.staffSubTab === 'members' ? "aria-current='page'" : ''}>Nhân viên (${S.fn.number(S.state.staffState.members.length)})</button>
      <button type='button' data-action='staff-subtab' data-subtab='payroll' ${S.state.staffSubTab === 'payroll' ? "aria-current='page'" : ''}>Bảng lương</button>
      <button type='button' data-action='staff-subtab' data-subtab='radar' ${S.state.staffSubTab === 'radar' ? "aria-current='page'" : ''}>Cảnh báo thất thoát</button>
    </nav>`;
    if (S.state.staffSubTab === 'payroll') {
      return S.fn.pageHeading('Quản lý nhân viên', '', `<button class='btn btn-secondary' data-action='new-staff-invite'>${S.fn.icon('mail', 15)} Mời qua Email</button><button class='btn btn-primary' data-action='new-staff-direct'>${S.fn.icon('plus', 15)} Tạo nhanh nhân viên</button>`) + kpiHtml + subTabs + S.fn.renderStaffPayrollSection();
    }
    if (S.state.staffSubTab === 'radar') {
      return S.fn.pageHeading('Quản lý nhân viên', '', `<button class='btn btn-secondary' data-action='new-staff-invite'>${S.fn.icon('mail', 15)} Mời qua Email</button><button class='btn btn-primary' data-action='new-staff-direct'>${S.fn.icon('plus', 15)} Tạo nhanh nhân viên</button>`) + kpiHtml + subTabs + S.fn.renderStaffRadarSection();
    }
    const roleTabs = `<nav class='workspace-tabs' aria-label='Lọc vai trò nhân viên'>${[['', 'Tất cả'], ['cashier', 'Thu ngân'], ['stockkeeper', 'Nhân viên kho'], ['accountant', 'Kế toán'], ['manager', 'Quản lý']].map(([val, label]) => `<button type='button' data-action='staff-role-filter' data-role='${val}' ${S.state.staffRoleFilter === val ? "aria-current='page'" : ''}>${label}</button>`).join('')}</nav>`;
    const permRows = [
      ['Bán hàng tại quầy (POS)', 'posSell'],
      ['Xem & tra cứu đơn hàng', 'viewOrders'],
      ['Hủy đơn & Trả hàng', 'voidOrReturnOrder'],
      ['Xem giá vốn sản phẩm', 'viewCostPrice'],
      ['Thêm / sửa hàng hóa & Kho', 'manageInventory'],
      ['Mở / Chốt ca tiền mặt', 'operateCashShift'],
      ['Lập phiếu thu chi & Sổ quỹ', 'recordCashbook'],
      ['Xem báo cáo doanh thu / lãi lỗ', 'viewReports'],
      ['Quản lý khách hàng', 'manageCustomers'],
      ['Quản lý nhân viên & phân quyền', 'manageStaff'],
    ];
    const permRoles = [['owner', 'Chủ'], ['manager', 'Quản lý'], ['cashier', 'Thu ngân'], ['stockkeeper', 'Kho'], ['accountant', 'Kế toán']];
    const permMatrixHtml = `<section class='panel staff-panel'><div class='panel-header'><div><h2>Bảng phân quyền theo vai trò</h2><p>Quyền được áp dụng đồng thời cả trên giao diện và máy chủ API.</p></div></div><div class='table-wrap'><table class='data-table'><thead><tr><th>Chức năng</th>${permRoles.map(([, l]) => `<th class='text-right'>${l}</th>`).join('')}</tr></thead><tbody>${permRows.map(([label, key]) => `<tr><td>${label}</td>${permRoles.map(([r]) => `<td class='text-right'>${S.state.ROLE_CAPABILITIES[r]?.[key] ? `<span class='badge badge-success'>Có</span>` : `<span class='muted'>—</span>`}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
    return S.fn.pageHeading('Quản lý nhân viên', '', `<button class='btn btn-secondary' data-action='new-staff-invite' data-tour-target='staff-invite'>${S.fn.icon('mail', 15)} Mời qua Email</button><button class='btn btn-primary' data-action='new-staff-direct'>${S.fn.icon('plus', 15)} Tạo nhanh nhân viên</button>`) +
      kpiHtml + subTabs + roleTabs +
      `<div class='toolbar' style='margin-bottom:12px'><div class='toolbar-left'><div class='search-wrap'><span class='search-symbol'>⌕</span><input class='input' id='staff-search-input' type='search' placeholder='Tìm theo mã NV, họ tên, SĐT, chức danh hoặc email…' value='${S.fn.esc(S.state.staffSearchTerm)}' aria-label='Tìm nhân viên'/></div></div></div>` +
      `${S.state.staffState.error ? `<div class='auth-message error'>${S.fn.esc(S.state.staffState.error)} <button class='link-button' data-action='reload-staff'>Tải lại</button></div>` : ''}<section class='panel staff-panel'><div class='panel-header'><div><h2>Hồ sơ &amp; Hiệu suất nhân viên</h2></div><span class='badge badge-info'><i class='badge-dot'></i>${filteredMembers.length} nhân viên</span></div>${S.state.staffState.loading ? `<div class='empty-state'><strong>Đang tải thành viên…</strong></div>` : memberRows ? `<div class='staff-list'>${memberRows}</div>` : `<div class='empty-state'><strong>Chưa có nhân viên phù hợp</strong><span>Bấm “＋ Tạo nhanh nhân viên” để cấp tài khoản dùng ngay tại quầy.</span></div>`}</section>${permMatrixHtml}<section class='panel staff-panel'><div class='panel-header'><div><h2>Lời mời qua Email</h2></div></div>${inviteRows ? `<div class='staff-list'>${inviteRows}</div>` : `<div class='empty-state'><strong>Chưa có lời mời</strong></div>`}</section>`;
  }


  S.fn.openStaffInvite = function openStaffInvite() {
    if (S.state.store.role !== 'owner') return S.fn.toast('Không đủ quyền', 'Chỉ chủ cửa hàng mới có thể mời nhân viên.', 'error');
    const form = `<form id='entity-form' data-form='staff-invite'><div class='form-grid'><div class='form-field full'><label class='input-label' for='staff-invite-email'>Email nhân viên *</label><input class='input' id='staff-invite-email' name='email' type='email' autocomplete='email' required maxlength='254' placeholder='Email nhân viên'/></div><div class='form-field full'><label class='input-label' for='staff-invite-role'>Vai trò *</label><div class='select-wrap'><select class='input' id='staff-invite-role' name='role' required><option value='cashier'>Nhân viên bán hàng</option><option value='stockkeeper'>Nhân viên kho</option><option value='accountant'>Kế toán</option><option value='manager'>Quản lý</option></select></div><small class='staff-role-help'>${S.fn.staffRoleDescription('cashier')}</small></div></div><div class='modal-note'>Lời mời có hiệu lực 7 ngày. Nhân viên cần dùng đúng email này và xác minh email trước khi được cấp quyền.</div></form>`;
    S.fn.showModal('Mời nhân viên', 'Gửi liên kết tham gia cửa hàng qua email.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>Gửi lời mời</button>`);
  }


  S.fn.showInvitationResult = function showInvitationResult(result, title) {
    S.fn.closeModal();
    if (result.developmentInviteUrl) {
      S.fn.showModal(title || 'Đã tạo lời mời', 'Môi trường phát triển chưa gửi email; dùng liên kết dưới đây để tiếp tục.', `<div class='notice-item'><span>${S.fn.icon('users', 18)}</span><span><strong>${S.fn.esc(result.invitation.email)}</strong><small>${S.fn.staffRoleName(result.invitation.role)} · Liên kết sẽ hết hạn sau 7 ngày</small></span></div><a class='staff-invite-link' href='${S.fn.esc(result.developmentInviteUrl)}' target='_blank' rel='noopener'>Mở trang nhận lời mời →</a>`, `<button class='btn btn-secondary' data-action='close-modal'>Đóng</button><button class='btn btn-primary' data-action='reload-staff'>Xong</button>`, true);
    } else {
      S.fn.toast(title || 'Đã gửi lời mời', result.message || 'Email mời đã được chấp nhận để gửi.');
      S.fn.closeModal();
      S.fn.loadStaffPage();
    }
  }


  S.fn.saveStaffInvitation = async function saveStaffInvitation(form) {
    const data = new FormData(form);
    const button = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (button) button.disabled = true;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/staff/invitations`, {
        method: 'POST', body: { email: String(data.get('email') || '').trim(), role: String(data.get('role') || '') },
      });
      S.fn.showInvitationResult(result);
      S.fn.emitSyncDomains(['staff'], { source: 'staff-invite' });
      await S.fn.loadStaffPage();
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa gửi được lời mời', error.message, 'error');
      if (button && !S.dom.modal.hidden) button.disabled = false;
    }
  }


  S.fn.openStaffDirectCreateModal = function openStaffDirectCreateModal() {
    if (S.state.store.role !== 'owner') return S.fn.toast('Không đủ quyền', 'Chỉ chủ cửa hàng mới có thể tạo tài khoản nhân viên.', 'error');
    const nextCode = `NV-${String((S.state.staffState.members?.length || 0) + 1).padStart(3, '0')}`;
    const defaultEff = S.fn.resolveEffectivePermissions('cashier', null, null);
    const permToggles = [
      ['view_cost_price', 'Xem giá vốn & lãi gộp'],
      ['edit_products', 'Thêm / sửa sản phẩm'],
      ['void_or_return_order', 'Hủy đơn & đổi / trả hàng'],
      ['record_cashbook', 'Ghi phiếu thu chi & sổ quỹ'],
      ['view_reports', 'Xem báo cáo & doanh thu'],
    ].map(function ([key, label]) {
      return `<label class='staff-perm-toggle'><input type='checkbox' data-direct-perm='${key}' ${defaultEff[key] ? 'checked' : ''}/><span>${label}</span></label>`;
    }).join('');
    const form = `<form id='entity-form' data-form='staff-direct-create'><div class='form-grid'>
      <div class='form-field'><label class='input-label'>Họ và tên nhân viên *</label><input class='input' name='displayName' required minlength='2' maxlength='120' placeholder='Ví dụ: Nguyễn Văn A'/></div>
      <div class='form-field'><label class='input-label'>Mã nhân viên</label><input class='input' name='staffCode' value='${S.fn.esc(nextCode)}' maxlength='40' placeholder='NV-001'/></div>
      <div class='form-field'><label class='input-label'>Email đăng nhập *</label><input class='input' name='email' type='email' required maxlength='254' placeholder='thungan1@cửa-hàng.vn'/></div>
      <div class='form-field'><label class='input-label'>Mật khẩu khởi tạo * (từ 12 ký tự)</label><input class='input' name='password' type='password' required minlength='12' maxlength='128' placeholder='Tối thiểu 12 ký tự'/></div>
      <div class='form-field'><label class='input-label'>Vai trò *</label><div class='select-wrap'><select class='input' name='role' required><option value='cashier'>Thu ngân (Bán hàng tại quầy)</option><option value='stockkeeper'>Nhân viên kho</option><option value='accountant'>Kế toán</option><option value='manager'>Quản lý cửa hàng</option></select></div></div>
      <div class='form-field'><label class='input-label'>Chức danh / Ca làm việc</label><input class='input' name='jobTitle' maxlength='120' placeholder='VD: Thu ngân ca sáng'/></div>
      <div class='form-field'><label class='input-label'>Số điện thoại</label><input class='input' name='phone' inputmode='tel' maxlength='32' placeholder='09xx xxx xxx'/></div>
      <div class='form-field'><label class='input-label'>Lương cơ bản (đ/tháng)</label><input class='input' name='baseSalaryVnd' type='number' min='0' step='1' value='0'/></div>
      <div class='form-field'><label class='input-label'>Hoa hồng doanh số (%)</label><input class='input' name='commissionPercent' type='number' min='0' max='100' step='0.1' value='0'/></div>
      <div class='form-field full'><label class='input-label'>Ghi chú nhân sự</label><input class='input' name='note' maxlength='500' placeholder='Ghi chú ca trực, chi nhánh, hợp đồng...'/></div>
    </div><details class='staff-perms' data-direct-perms><summary style='cursor:pointer;font-weight:700;font-size:13px'>Quyền chi tiết theo nhân viên (tùy chọn)</summary><div class='staff-perm-grid' style='margin-top:10px'>${permToggles}</div><label class='staff-perm-discount'><span>Mức giảm giá tối đa tại POS (%)</span><input class='input' type='number' min='0' max='100' step='1' data-direct-perm='pos_max_discount_pct' value='${S.fn.esc(String(defaultEff.pos_max_discount_pct ?? 10))}'/></label></details><div class='modal-note'>Tài khoản được kích hoạt ngay lập tức. Nhân viên có thể dùng Email và Mật khẩu này đăng nhập ngay trên điện thoại hoặc máy tính tại quầy.</div></form>`;
    S.fn.showModal('Tạo nhanh nhân viên (Chuẩn KiotViet / Sapo)', 'Cấp tài khoản, phân vai trò và thiết lập lương & hoa hồng dùng ngay.', form, `<button class='btn btn-secondary' type='button' data-action='close-modal'>Hủy</button><button class='btn btn-primary' type='submit' form='entity-form'>Tạo tài khoản nhân viên</button>`);
  }


  S.fn.saveStaffDirectCreate = async function saveStaffDirectCreate(form) {
    const data = new FormData(form);
    const button = S.dom.modal.querySelector('button[type="submit"][form="entity-form"]');
    if (button) button.disabled = true;
    const commPct = Number(data.get('commissionPercent') || 0);
    const commissionRateBps = Number.isFinite(commPct) && commPct >= 0 && commPct <= 100 ? Math.round(commPct * 100) : 0;
    const permissions = {};
    form.querySelectorAll('[data-direct-perm]').forEach(function (el) {
      const key = el.dataset.directPerm;
      if (!key) return;
      if (key === 'pos_max_discount_pct') {
        const pct = Math.max(0, Math.min(100, Math.trunc(Number(el.value || 0))));
        permissions[key] = Number.isFinite(pct) ? pct : 0;
      } else {
        permissions[key] = Boolean(el.checked);
      }
    });
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/staff/direct-create`, {
        method: 'POST',
        body: {
          displayName: String(data.get('displayName') || '').trim(),
          staffCode: String(data.get('staffCode') || '').trim(),
          email: String(data.get('email') || '').trim(),
          password: String(data.get('password') || ''),
          role: String(data.get('role') || 'cashier'),
          jobTitle: String(data.get('jobTitle') || '').trim(),
          phone: String(data.get('phone') || '').trim(),
          baseSalaryVnd: String(data.get('baseSalaryVnd') || '0').trim() || '0',
          commissionRateBps,
          note: String(data.get('note') || '').trim(),
          permissions,
        },
      });
      S.fn.closeModal();
      S.state.staffSubTab = 'members';
      S.fn.emitSyncDomains(['staff'], { source: 'staff-direct-create', skipLocalReload: true });
      S.fn.toast('Đã tạo tài khoản nhân viên', `${result.member?.display_name || ''} (${result.member?.staff_code || ''}) đã có thể đăng nhập ngay.`);
      await S.fn.loadStaffPage();
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa tạo được nhân viên', error.message, 'error');
      if (button && !S.dom.modal.hidden) button.disabled = false;
    }
  }


  S.fn.readMemberGranularPerms = function readMemberGranularPerms(userId) {
    const permissions = {};
    document.querySelectorAll(`[data-member-perm='${CSS.escape(userId)}']`).forEach(function (el) {
      const key = el.dataset.permKey;
      if (!key) return;
      if (key === 'pos_max_discount_pct') {
        const raw = Math.trunc(Number(el.value || 0));
        permissions[key] = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
      } else {
        permissions[key] = Boolean(el.checked);
      }
    });
    return permissions;
  }


  S.fn.saveStaffMember = async function saveStaffMember(userId) {
    const role = document.querySelector(`[data-member-role='${userId}']`)?.value;
    const status = document.querySelector(`[data-member-status='${userId}']`)?.value;
    const displayName = document.querySelector(`[data-member-name='${userId}']`)?.value?.trim();
    const staffCode = document.querySelector(`[data-member-code='${userId}']`)?.value?.trim();
    const phone = document.querySelector(`[data-member-phone='${userId}']`)?.value?.trim();
    const jobTitle = document.querySelector(`[data-member-title='${userId}']`)?.value?.trim();
    const baseSalaryVnd = document.querySelector(`[data-member-salary='${userId}']`)?.value?.trim() || '0';
    const salaryMode = document.querySelector(`[data-member-salary-mode='${userId}']`)?.value || 'monthly';
    const bankBin = document.querySelector(`[data-member-bank-bin='${userId}']`)?.value?.trim() || '';
    const bankAccountNumber = document.querySelector(`[data-member-bank-acc='${userId}']`)?.value?.trim() || '';
    const bankAccountOwner = document.querySelector(`[data-member-bank-owner='${userId}']`)?.value?.trim() || '';
    const commPct = Number(document.querySelector(`[data-member-commission='${userId}']`)?.value || 0);
    const commissionRateBps = Number.isFinite(commPct) && commPct >= 0 && commPct <= 100 ? Math.round(commPct * 100) : 0;
    const note = document.querySelector(`[data-member-note='${userId}']`)?.value?.trim();
    const warehouseScopeMode = document.querySelector(`[data-member-scope-mode='${userId}']`)?.value || 'all';
    const warehouseIds = Array.from(document.querySelectorAll(`[data-member-warehouse='${userId}']:checked`)).map(function (input) { return input.value; });
    const permissions = S.fn.readMemberGranularPerms(userId);
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/staff/members/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: {
          role,
          status,
          ...(displayName ? { displayName } : {}),
          ...(staffCode !== undefined ? { staffCode } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(jobTitle !== undefined ? { jobTitle } : {}),
          baseSalaryVnd,
          salaryMode,
          bankBin,
          bankAccountNumber,
          bankAccountOwner,
          commissionRateBps,
          ...(note !== undefined ? { note } : {}),
          warehouseScopeMode,
          warehouseIds,
          permissions,
        },
      });
      S.fn.emitSyncDomains(['staff', 'me'], { source: 'staff-member-save', userId, skipLocalReload: true });
      S.fn.toast('Đã cập nhật hồ sơ & quyền nhân viên', 'Thông tin lương, hoa hồng và phân quyền đã được lưu.');
      await S.fn.loadStaffPage();
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa cập nhật được quyền', error.message, 'error');
    }
  }


  S.fn.resendStaffInvite = async function resendStaffInvite(invitationId) {
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/staff/invitations/${encodeURIComponent(invitationId)}/resend`, { method: 'POST', body: {} });
      S.fn.showInvitationResult(result, 'Đã gửi lại lời mời');
      S.fn.emitSyncDomains(['staff'], { source: 'staff-invite-resend' });
      await S.fn.loadStaffPage();
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa gửi lại được lời mời', error.message, 'error');
    }
  }


  S.fn.revokeStaffInvite = async function revokeStaffInvite(invitationId) {
    if (!window.confirm('Thu hồi lời mời này? Liên kết hiện tại sẽ không còn sử dụng được.')) return;
    try {
      await S.fn.apiRequest(`/api/stores/${encodeURIComponent(S.state.store.id)}/staff/invitations/${encodeURIComponent(invitationId)}/revoke`, { method: 'POST', body: {} });
      S.fn.emitSyncDomains(['staff'], { source: 'staff-invite-revoke' });
      S.fn.toast('Đã thu hồi lời mời');
      await S.fn.loadStaffPage();
    } catch (error) {
      if (error.status === 401) S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      else S.fn.toast('Chưa thu hồi được lời mời', error.message, 'error');
    }
  }

})(window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {}, charts: {} });
