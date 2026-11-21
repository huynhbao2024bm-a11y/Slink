(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.SlinkReceiptImage = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function (root) {
  'use strict';

  var androidBridgeFn = null;

  function setAndroidBridge(fn) {
    androidBridgeFn = typeof fn === 'function' ? fn : null;
  }

  function makeCanvas(width, height, customCreateCanvas) {
    var canvas = null;
    if (typeof customCreateCanvas === 'function') {
      canvas = customCreateCanvas(width, height);
    } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      canvas = document.createElement('canvas');
    }
    if (!canvas) {
      throw new Error('Không thể khởi tạo canvas để tạo ảnh.');
    }
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function formatIntVnd(amount) {
    var raw = typeof amount === 'bigint' ? amount : BigInt(Math.trunc(Number(amount || 0)));
    var negative = raw < 0n;
    var digits = (negative ? -raw : raw).toString();
    var grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (negative ? '-' : '') + grouped + 'đ';
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    var content = String(text == null ? '' : text).trim();
    if (!content) return [''];
    var words = content.split(/\s+/);
    var lines = [];
    var current = '';
    for (var i = 0; i < words.length; i++) {
      var candidate = current ? current + ' ' + words[i] : words[i];
      var measured = ctx.measureText ? ctx.measureText(candidate).width : candidate.length * 10;
      if (measured > maxWidth && current) {
        lines.push(current);
        current = words[i];
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

  function drawDashedDivider(ctx, x1, x2, y) {
    ctx.save();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([8, 6]);
    }
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.restore();
  }

  function canvasToDataUrlAndBlob(canvas) {
    var dataUrl = typeof canvas.toDataURL === 'function' ? canvas.toDataURL('image/png') : '';
    if (typeof canvas.toBlob === 'function') {
      return new Promise(function (resolve) {
        try {
          canvas.toBlob(function (blob) {
            resolve({ dataUrl: dataUrl, blob: blob || null, width: canvas.width, height: canvas.height });
          }, 'image/png');
        } catch (_) {
          resolve({ dataUrl: dataUrl, blob: null, width: canvas.width, height: canvas.height });
        }
      });
    }
    return Promise.resolve({ dataUrl: dataUrl, blob: null, width: canvas.width, height: canvas.height });
  }

  function drawQrMatrixOnCanvas(ctx, qrText, x, y, boxSize, qrTools) {
    var tools = qrTools || (root && root.SlinkVietQrTools);
    if (!tools || typeof tools.encodeQrMatrix !== 'function') {
      return false;
    }
    var matrix = tools.encodeQrMatrix(String(qrText || ''));
    if (!matrix || !matrix.size || !matrix.modules) return false;
    var quiet = 4;
    var totalModules = matrix.size + quiet * 2;
    var cell = Math.max(2, Math.floor(boxSize / totalModules));
    var actualSize = cell * totalModules;
    var ox = Math.round(x + (boxSize - actualSize) / 2);
    var oy = Math.round(y + (boxSize - actualSize) / 2);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox, oy, actualSize, actualSize);
    ctx.fillStyle = '#0f172a';
    for (var r = 0; r < matrix.size; r++) {
      var row = matrix.modules[r];
      for (var c = 0; c < matrix.size; c++) {
        if (row[c] === 1) {
          ctx.fillRect(ox + (c + quiet) * cell, oy + (r + quiet) * cell, cell, cell);
        }
      }
    }
    return true;
  }

  function renderReceiptPng(receipt, options) {
    var opts = options || {};
    var data = receipt || {};
    var width = 720;
    var padX = 44;
    var contentW = width - padX * 2;
    var items = Array.isArray(data.items) ? data.items : [];

    var measureCanvas = makeCanvas(width, 200, opts.createCanvas);
    var mctx = measureCanvas.getContext('2d');
    var lineEntries = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i] || {};
      mctx.font = '600 22px system-ui, -apple-system, sans-serif';
      var nameLines = wrapCanvasText(mctx, String(item.name || 'Sản phẩm'), contentW - 180);
      var serialText = Array.isArray(item.serials) && item.serials.length
        ? 'Serial/IMEI: ' + item.serials.join(', ')
        : '';
      var warrantyText = Number(item.warrantyMonths || 0) > 0
        ? 'Bảo hành: ' + Number(item.warrantyMonths) + ' tháng'
        : '';
      var subMeta = [serialText, warrantyText].filter(Boolean).join(' • ');
      mctx.font = '400 18px system-ui, -apple-system, sans-serif';
      var metaLines = subMeta ? wrapCanvasText(mctx, subMeta, contentW - 20) : [];
      lineEntries.push({ item: item, nameLines: nameLines, metaLines: metaLines });
    }

    var estimatedHeight = 290;
    if (data.storeAddress || data.storePhone) estimatedHeight += 36;
    if (data.customerName) estimatedHeight += 34;
    if (data.cashierName) estimatedHeight += 34;
    for (var j = 0; j < lineEntries.length; j++) {
      estimatedHeight += 28 + lineEntries[j].nameLines.length * 28 + lineEntries[j].metaLines.length * 24 + 14;
    }
    estimatedHeight += 250;
    if (Number(data.discountVnd || 0) > 0) estimatedHeight += 36;
    if (Number(data.debtVnd || 0) > 0) estimatedHeight += 36;
    if (data.vietQrText) estimatedHeight += 310;
    estimatedHeight += 90;

    var height = Math.max(640, estimatedHeight);
    var canvas = makeCanvas(width, height, opts.createCanvas);
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#0f766e';
    ctx.fillRect(0, 0, width, 14);

    var y = 58;
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 32px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(data.storeName || 'Cửa hàng Slink'), width / 2, y);
    y += 32;

    if (data.storeAddress || data.storePhone) {
      ctx.fillStyle = '#475569';
      ctx.font = '400 19px system-ui, -apple-system, sans-serif';
      var storeMeta = [data.storeAddress, data.storePhone].filter(Boolean).join(' • ');
      var storeLines = wrapCanvasText(ctx, storeMeta, contentW);
      for (var s = 0; s < storeLines.length; s++) {
        ctx.fillText(storeLines[s], width / 2, y);
        y += 24;
      }
    }

    y += 8;
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 24px system-ui, -apple-system, sans-serif';
    ctx.fillText('BIÊN NHẬN BÁN HÀNG', width / 2, y);
    y += 30;

    ctx.fillStyle = '#64748b';
    ctx.font = '500 19px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      [data.code ? 'Mã đơn: ' + data.code : '', data.createdAtLabel || ''].filter(Boolean).join('  •  '),
      width / 2,
      y
    );
    y += 28;

    ctx.textAlign = 'left';
    if (data.customerName) {
      ctx.fillStyle = '#334155';
      ctx.font = '500 20px system-ui, -apple-system, sans-serif';
      ctx.fillText('Khách hàng: ' + String(data.customerName), padX, y);
      y += 30;
    }
    if (data.cashierName) {
      ctx.fillStyle = '#334155';
      ctx.font = '500 20px system-ui, -apple-system, sans-serif';
      ctx.fillText('Thu ngân: ' + String(data.cashierName), padX, y);
      y += 30;
    }

    y += 6;
    drawDashedDivider(ctx, padX, width - padX, y);
    y += 34;

    for (var idx = 0; idx < lineEntries.length; idx++) {
      var entry = lineEntries[idx];
      var it = entry.item;
      ctx.fillStyle = '#0f172a';
      ctx.font = '600 22px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      for (var nl = 0; nl < entry.nameLines.length; nl++) {
        ctx.fillText(entry.nameLines[nl], padX, y);
        if (nl === 0) {
          ctx.textAlign = 'right';
          ctx.fillText(formatIntVnd(it.lineTotalVnd != null ? it.lineTotalVnd : Number(it.qty || 1) * Number(it.unitPriceVnd || 0)), width - padX, y);
          ctx.textAlign = 'left';
        }
        y += 28;
      }

      ctx.fillStyle = '#64748b';
      ctx.font = '400 19px system-ui, -apple-system, sans-serif';
      ctx.fillText(String(it.qty || 1) + ' × ' + formatIntVnd(it.unitPriceVnd || 0), padX, y);
      y += 24;

      for (var ml = 0; ml < entry.metaLines.length; ml++) {
        ctx.fillStyle = '#0f766e';
        ctx.font = '500 18px system-ui, -apple-system, sans-serif';
        ctx.fillText(entry.metaLines[ml], padX, y);
        y += 24;
      }
      y += 10;
    }

    drawDashedDivider(ctx, padX, width - padX, y);
    y += 36;

    function drawSummaryRow(label, valueText, bold, accentColor) {
      ctx.textAlign = 'left';
      ctx.fillStyle = bold ? '#0f172a' : '#475569';
      ctx.font = (bold ? '700 24px' : '500 21px') + ' system-ui, -apple-system, sans-serif';
      ctx.fillText(label, padX, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = accentColor || (bold ? '#0f766e' : '#0f172a');
      ctx.fillText(valueText, width - padX, y);
      y += bold ? 38 : 32;
    }

    if (data.subtotalVnd != null && Number(data.discountVnd || 0) > 0) {
      drawSummaryRow('Tạm tính', formatIntVnd(data.subtotalVnd), false);
      drawSummaryRow('Giảm giá', '-' + formatIntVnd(data.discountVnd), false, '#b45309');
    }
    drawSummaryRow('Tổng cộng', formatIntVnd(data.totalVnd || 0), true, '#0f766e');
    drawSummaryRow('Đã thanh toán (' + String(data.paymentLabel || 'Tiền mặt') + ')', formatIntVnd(data.paidVnd != null ? data.paidVnd : data.totalVnd || 0), false);
    if (Number(data.debtVnd || 0) > 0) {
      drawSummaryRow('Còn ghi nợ', formatIntVnd(data.debtVnd), false, '#dc2626');
    }

    if (data.vietQrText) {
      y += 12;
      drawDashedDivider(ctx, padX, width - padX, y);
      y += 24;
      var qrDrawn = drawQrMatrixOnCanvas(ctx, data.vietQrText, (width - 230) / 2, y, 230, opts.vietQrTools);
      if (qrDrawn) {
        y += 248;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#475569';
        ctx.font = '500 18px system-ui, -apple-system, sans-serif';
        ctx.fillText('Quét mã VietQR để thanh toán / đối chiếu', width / 2, y);
        y += 24;
      }
    }

    y += 18;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = '500 19px system-ui, -apple-system, sans-serif';
    ctx.fillText(String(data.footerText || 'Cảm ơn quý khách đã mua hàng!'), width / 2, y);

    return canvasToDataUrlAndBlob(canvas);
  }

  function renderDebtVietQrCardPng(params, options) {
    var p = params || {};
    var opts = options || {};
    var tools = opts.vietQrTools || (root && root.SlinkVietQrTools);
    var banks = opts.banksVn || (root && root.SlinkBanksVn);

    var bankBin = String(p.bankBin || '').trim();
    var accountNumber = String(p.accountNumber || '').trim();
    var accountName = String(p.accountName || '').trim();
    var amountVnd = Math.max(0, Math.trunc(Number(p.amountVnd || 0)));
    var description = String(p.description || '').trim();
    var bankInfo = banks && typeof banks.findBankByBin === 'function' ? banks.findBankByBin(bankBin) : null;
    var bankLabel = p.bankName || (bankInfo ? (bankInfo.shortName || bankInfo.name) : bankBin);

    if (!tools || typeof tools.buildVietQrPayload !== 'function') {
      throw new Error('Thiếu SlinkVietQrTools để tạo mã VietQR.');
    }
    var qrPayload = tools.buildVietQrPayload({
      bankBin: bankBin,
      accountNumber: accountNumber,
      amountVnd: amountVnd,
      description: description,
    });
    if (!qrPayload) {
      throw new Error('Thông tin ngân hàng hoặc số tài khoản chưa hợp lệ để tạo VietQR.');
    }

    var width = 760;
    var height = 980;
    var canvas = makeCanvas(width, height, opts.createCanvas);
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#0f766e';
    ctx.fillRect(0, 0, width, 160);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ccfbf1';
    ctx.font = '600 20px system-ui, -apple-system, sans-serif';
    ctx.fillText(String(p.storeName || 'Cửa hàng Slink'), width / 2, 54);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 32px system-ui, -apple-system, sans-serif';
    ctx.fillText('NHẮC THANH TOÁN CÔNG NỢ', width / 2, 102);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '500 20px system-ui, -apple-system, sans-serif';
    ctx.fillText('Quét mã VietQR để chuyển khoản nhanh', width / 2, 138);

    // Card surface
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(48, 192, width - 96, 730);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(48, 192, width - 96, 730);

    var y = 248;
    ctx.fillStyle = '#64748b';
    ctx.font = '500 20px system-ui, -apple-system, sans-serif';
    ctx.fillText('Khách hàng: ' + String(p.customerName || 'Khách lẻ') + (p.customerPhone ? ' • ' + p.customerPhone : ''), width / 2, y);

    y += 58;
    ctx.fillStyle = '#dc2626';
    ctx.font = '700 48px system-ui, -apple-system, sans-serif';
    ctx.fillText(formatIntVnd(amountVnd), width / 2, y);

    y += 32;
    drawQrMatrixOnCanvas(ctx, qrPayload, (width - 340) / 2, y, 340, tools);
    y += 374;

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 24px system-ui, -apple-system, sans-serif';
    ctx.fillText(String(bankLabel || 'Ngân hàng'), width / 2, y);
    y += 34;

    ctx.fillStyle = '#0f766e';
    ctx.font = '700 26px ui-monospace, Consolas, monospace';
    ctx.fillText('STK: ' + accountNumber, width / 2, y);
    y += 34;

    if (accountName) {
      ctx.fillStyle = '#334155';
      ctx.font = '600 22px system-ui, -apple-system, sans-serif';
      ctx.fillText(accountName.toUpperCase(), width / 2, y);
      y += 32;
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '500 20px system-ui, -apple-system, sans-serif';
    ctx.fillText('Nội dung CK: ' + (tools.asciiClean ? tools.asciiClean(description, 40) : description), width / 2, y + 8);

    return canvasToDataUrlAndBlob(canvas).then(function (out) {
      out.qrPayload = qrPayload;
      return out;
    });
  }

  function renderPayslipPng(params, options) {
    var p = params || {};
    var opts = options || {};
    var tools = opts.vietQrTools || (root && root.SlinkVietQrTools);
    var width = 760;
    var hasQr = Boolean(p.bankBin && p.bankAccountNumber && Number(p.netPayableVnd || 0) > 0 && tools && typeof tools.buildVietQrPayload === 'function');
    var height = hasQr ? 1120 : 820;
    var canvas = makeCanvas(width, height, opts.createCanvas);
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#0f766e';
    ctx.fillRect(0, 0, width, 150);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ccfbf1';
    ctx.font = '600 20px system-ui, -apple-system, sans-serif';
    ctx.fillText(String(p.storeName || 'Cửa hàng Slink'), width / 2, 48);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 32px system-ui, -apple-system, sans-serif';
    ctx.fillText('PHIẾU LƯƠNG NHÂN VIÊN · KỲ ' + String(p.periodMonth || ''), width / 2, 94);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '500 19px system-ui, -apple-system, sans-serif';
    ctx.fillText('Mã phiếu: ' + String(p.payslipNumber || 'BẢNG TẠM TÍNH') + (p.paidAt ? ' • ' + String(p.paidAt) : ''), width / 2, 130);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(40, 176, width - 80, height - 216);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 176, width - 80, height - 216);

    var padX = 76;
    var y = 230;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 26px system-ui, -apple-system, sans-serif';
    ctx.fillText(String(p.employeeName || 'Nhân viên') + (p.staffCode ? ' (' + p.staffCode + ')' : ''), padX, y);
    y += 32;

    ctx.fillStyle = '#64748b';
    ctx.font = '500 20px system-ui, -apple-system, sans-serif';
    ctx.fillText('Chức vụ / Hình thức: ' + String(p.jobTitle || p.roleLabel || 'Nhân viên') + ' • ' + String(p.workedUnits || 0) + ' công/ca', padX, y);
    y += 28;

    drawDashedDivider(ctx, padX, width - padX, y);
    y += 38;

    function row(label, valText, color, bold) {
      ctx.textAlign = 'left';
      ctx.fillStyle = bold ? '#0f172a' : '#334155';
      ctx.font = (bold ? '700 24px' : '500 21px') + ' system-ui, -apple-system, sans-serif';
      ctx.fillText(label, padX, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = color || '#0f172a';
      ctx.fillText(valText, width - padX, y);
      y += bold ? 42 : 36;
    }

    row('1. Lương cơ bản (' + String(p.workedUnits || 0) + ' công/ca)', '+' + formatIntVnd(p.basePayVnd || 0), '#0f172a', false);
    row('2. Doanh số thực thu kỳ này', formatIntVnd(p.netSalesVnd || 0), '#64748b', false);
    row('3. Hoa hồng bán hàng thực thu', '+' + formatIntVnd(p.commissionPayVnd || 0), '#0f766e', false);
    if (Number(p.bonusVnd || 0) > 0) {
      row('4. Thưởng thêm', '+' + formatIntVnd(p.bonusVnd || 0), '#0f766e', false);
    }
    if (Number(p.advanceDeductionVnd || 0) > 0) {
      row('5. Khấu trừ tạm ứng trong kỳ', '-' + formatIntVnd(p.advanceDeductionVnd || 0), '#b45309', false);
    }
    if (Number(p.shortageDeductionVnd || 0) > 0) {
      row('6. Khấu trừ lệch thiếu két tiền mặt', '-' + formatIntVnd(p.shortageDeductionVnd || 0), '#dc2626', false);
    }

    y += 6;
    drawDashedDivider(ctx, padX, width - padX, y);
    y += 44;

    row('THỰC LĨNH CUỐI KỲ', formatIntVnd(p.netPayableVnd || 0), '#0f766e', true);

    if (hasQr) {
      var qrPayload = tools.buildVietQrPayload({
        bankBin: String(p.bankBin),
        accountNumber: String(p.bankAccountNumber),
        amountVnd: Math.max(0, Math.trunc(Number(p.netPayableVnd || 0))),
        description: 'LUONG ' + String(p.periodMonth || '') + ' ' + String(p.staffCode || p.employeeName || ''),
      });
      if (qrPayload) {
        y += 8;
        drawQrMatrixOnCanvas(ctx, qrPayload, (width - 240) / 2, y, 240, tools);
        y += 264;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#334155';
        ctx.font = '600 19px system-ui, -apple-system, sans-serif';
        ctx.fillText('STK nhận lương: ' + String(p.bankAccountNumber) + (p.bankAccountOwner ? ' • ' + p.bankAccountOwner : ''), width / 2, y);
      }
    }

    return canvasToDataUrlAndBlob(canvas);
  }

  function triggerDownload(dataUrl, filename) {
    if (typeof document === 'undefined' || !document.createElement) return false;
    var link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename || 'slink-image.png';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  }

  function dataUrlToFile(dataUrl, filename) {
    if (typeof File === 'undefined' || !dataUrl || dataUrl.indexOf(',') === -1) return null;
    try {
      var parts = dataUrl.split(',');
      var mimeMatch = parts[0].match(/:(.*?);/);
      var mime = mimeMatch ? mimeMatch[1] : 'image/png';
      var binary = atob(parts[1]);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new File([bytes], filename || 'slink-image.png', { type: mime });
    } catch (_) {
      return null;
    }
  }

  function sharePng(params) {
    var p = params || {};
    var filename = String(p.filename || 'slink-receipt.png');
    var title = String(p.title || 'Biên nhận Slink');
    var text = String(p.text || '');
    var dataUrl = String(p.dataUrl || '');

    if (androidBridgeFn && dataUrl) {
      return Promise.resolve()
        .then(function () {
          return androidBridgeFn({
            type: 'shareImage',
            dataUrl: dataUrl,
            filename: filename,
            title: title,
            text: text,
          });
        })
        .then(function (res) {
          return { method: 'android', result: res };
        })
        .catch(function () {
          return shareViaBrowser(p, filename, title, text, dataUrl);
        });
    }

    return shareViaBrowser(p, filename, title, text, dataUrl);
  }

  function shareViaBrowser(p, filename, title, text, dataUrl) {
    try {
      var file = p.blob && typeof File !== 'undefined'
        ? new File([p.blob], filename, { type: 'image/png' })
        : dataUrlToFile(dataUrl, filename);
      if (
        file &&
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        return navigator
          .share({ files: [file], title: title, text: text })
          .then(function () {
            return { method: 'web-share' };
          })
          .catch(function (err) {
            if (err && err.name === 'AbortError') return { method: 'canceled' };
            triggerDownload(dataUrl, filename);
            return { method: 'download' };
          });
      }
    } catch (_) {}

    triggerDownload(dataUrl, filename);
    return Promise.resolve({ method: 'download' });
  }

  return {
    setAndroidBridge: setAndroidBridge,
    renderReceiptPng: renderReceiptPng,
    renderDebtVietQrCardPng: renderDebtVietQrCardPng,
    renderPayslipPng: renderPayslipPng,
    sharePng: sharePng,
    triggerDownload: triggerDownload,
  };
});
