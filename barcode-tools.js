(function (root, factory) {
  'use strict';
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.SlinkBarcodeTools = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ISO/IEC 15417 Code 128 bar/space width patterns (indices 0..106; index 106 is 7-element Stop)
  const CODE128_PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
  ];

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatVnd(value) {
    const raw = String(value == null ? '0' : value).trim();
    if (!/^-?\d+$/.test(raw)) return '—';
    const neg = raw.startsWith('-');
    const abs = neg ? raw.slice(1) : raw;
    return (neg ? '-' : '') + abs.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ₫';
  }

  function computeEan13CheckDigit(twelveDigits) {
    const clean = String(twelveDigits || '').replace(/\D/g, '');
    if (!/^\d{12}$/.test(clean)) {
      throw new Error('EAN-13 yêu cầu đúng 12 chữ số đầu để tính số kiểm tra.');
    }
    let sum = 0;
    for (let i = 0; i < 12; i += 1) {
      const digit = clean.charCodeAt(i) - 48;
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    return String((10 - (sum % 10)) % 10);
  }

  function isValidEan13(code) {
    const text = String(code || '').trim();
    if (!/^\d{13}$/.test(text)) return false;
    return computeEan13CheckDigit(text.slice(0, 12)) === text.slice(12);
  }

  function generateEan13(prefix = '20') {
    const cleanPrefix = String(prefix || '20').replace(/\D/g, '').slice(0, 9) || '20';
    let body = cleanPrefix;
    const cryptoObj = globalThis.crypto;
    while (body.length < 12) {
      let n;
      if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
        const buf = new Uint32Array(1);
        cryptoObj.getRandomValues(buf);
        n = buf[0] % 10;
      } else {
        n = Math.floor(Math.random() * 10);
      }
      body += String(n);
    }
    body = body.slice(0, 12);
    return body + computeEan13CheckDigit(body);
  }

  function generateUniqueEan13(existingSet, prefix = '20') {
    const seen = existingSet instanceof Set ? existingSet : new Set(existingSet || []);
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const candidate = generateEan13(prefix);
      if (!seen.has(candidate)) {
        seen.add(candidate);
        return candidate;
      }
    }
    throw new Error('Không thể tạo mã vạch duy nhất lúc này. Hãy thử lại.');
  }

  function getQrRenderer() {
    if (typeof globalThis !== 'undefined' && globalThis.SlinkVietQrTools && typeof globalThis.SlinkVietQrTools.renderQrSvg === 'function') {
      return globalThis.SlinkVietQrTools.renderQrSvg;
    }
    if (typeof require === 'function') {
      try {
        const mod = require('./vietqr-tools');
        if (mod && typeof mod.renderQrSvg === 'function') return mod.renderQrSvg;
      } catch {}
    }
    return null;
  }

  function validateCode128Input(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return { ok: false, reason: 'Mã vạch trống.' };
    if (text.length > 120) return { ok: false, reason: 'Mã vượt quá 120 ký tự.' };
    if (/[\x00-\x1f\x7f]/.test(text)) {
      return { ok: false, reason: 'Mã chứa ký tự điều khiển không hợp lệ.' };
    }
    if (/[^\x20-\x7e]/.test(text) || text.length > 80) {
      return { ok: false, useQr: true, text, reason: 'Mã chứa ký tự đặc biệt hoặc dài — hiển thị dạng QR để quét chuẩn.' };
    }
    return { ok: true, text };
  }

  function encodeCode128B(rawText) {
    const check = validateCode128Input(rawText);
    if (!check.ok) return null;
    const text = check.text;
    const START_B = 104;
    const STOP = 106;
    const codes = [START_B];
    let checksum = START_B;
    for (let i = 0; i < text.length; i += 1) {
      const value = text.charCodeAt(i) - 32;
      codes.push(value);
      checksum += value * (i + 1);
    }
    codes.push(checksum % 103);
    codes.push(STOP);

    const bars = [];
    let totalModules = 0;
    for (let i = 0; i < codes.length; i += 1) {
      const pattern = CODE128_PATTERNS[codes[i]];
      for (let j = 0; j < pattern.length; j += 1) {
        const w = pattern.charCodeAt(j) - 48;
        const isBar = j % 2 === 0;
        if (isBar) bars.push({ x: totalModules, w });
        totalModules += w;
      }
    }
    return { text, bars, totalModules };
  }

  function renderBarcodeSvg(code, options = {}) {
    const check = validateCode128Input(code);
    if (!check.ok && check.useQr) {
      const renderQr = getQrRenderer();
      if (renderQr) {
        try {
          const qrSvg = renderQr(check.text, { label: `Mã QR ${check.text}`, quiet: 2, modulePx: 3 })
            .replace("class='vietqr-svg'", "class='barcode-svg barcode-qr-svg'");
          const showText = options.showText !== false;
          const caption = showText ? `<div class='barcode-qr-caption'>${escapeHtml(check.text)}</div>` : '';
          return `<div class='barcode-qr-wrap'>${qrSvg}${caption}</div>`;
        } catch {}
      }
    }
    const encoded = check.ok ? encodeCode128B(check.text) : null;
    if (!encoded) {
      return `<div class='barcode-svg-empty'>${escapeHtml(check.reason || 'Mã không hợp lệ')}</div>`;
    }
    const quiet = Number.isFinite(options.quiet) ? options.quiet : 8;
    const barHeight = Number.isFinite(options.barHeight) ? options.barHeight : 38;
    const showText = options.showText !== false;
    const textHeight = showText ? 13 : 0;
    const vbWidth = encoded.totalModules + quiet * 2;
    const vbHeight = barHeight + textHeight + 2;
    const rects = encoded.bars
      .map((b) => `<rect x='${b.x + quiet}' y='1' width='${b.w}' height='${barHeight}'/>`)
      .join('');
    const label = showText
      ? `<text x='${vbWidth / 2}' y='${barHeight + 12}' text-anchor='middle' font-family='ui-monospace,Consolas,monospace' font-size='9.5' font-weight='600' fill='#111111'>${escapeHtml(encoded.text)}</text>`
      : '';
    return `<svg class='barcode-svg' viewBox='0 0 ${vbWidth} ${vbHeight}' role='img' aria-label='Mã vạch ${escapeHtml(encoded.text)}' preserveAspectRatio='xMidYMid meet'><rect x='0' y='0' width='${vbWidth}' height='${vbHeight}' fill='#ffffff'/><g fill='#111111'>${rects}</g>${label}</svg>`;
  }

  const MAX_STICKERS = 600;
  const PAPER_FORMATS = new Set(['a4-65', 'a4-40', 'thermal-2up', 'thermal-1up']);

  function buildBarcodeStickersList(items, options = {}) {
    const showStore = options.showStore !== false;
    const showPrice = options.showPrice !== false;
    const storeName = String(options.storeName || 'Slink').trim();
    const maxStickers = Number.isFinite(options.maxStickers) && options.maxStickers > 0 ? Math.floor(options.maxStickers) : MAX_STICKERS;
    const stickers = [];
    let truncated = false;
    for (const item of items || []) {
      const code = String(item.barcode || item.sku || '').trim();
      if (!code) continue;
      const copies = Math.max(1, Math.min(200, Math.floor(Number(item.copies) || 1)));
      const svg = renderBarcodeSvg(code, { barHeight: 34, showText: true });
      const card = `<article class='barcode-sticker'>
        ${showStore ? `<div class='barcode-sticker-store'>${escapeHtml(storeName)}</div>` : ''}
        <div class='barcode-sticker-name'>${escapeHtml(item.name || 'Sản phẩm')}</div>
        <div class='barcode-sticker-svg'>${svg}</div>
        <div class='barcode-sticker-meta'>
          <span class='barcode-sticker-sku'>${escapeHtml(item.sku || '')}</span>
          ${showPrice ? `<strong class='barcode-sticker-price'>${escapeHtml(formatVnd(item.priceVnd))}</strong>` : ''}
        </div>
      </article>`;
      for (let c = 0; c < copies; c += 1) {
        if (stickers.length >= maxStickers) {
          truncated = true;
          break;
        }
        stickers.push(card);
      }
      if (truncated) break;
    }
    return { html: stickers.join(''), truncated, maxStickers };
  }

  function buildBarcodeStickersHtml(items, options = {}) {
    return buildBarcodeStickersList(items, options).html;
  }

  function buildBarcodeSheetHtml({ storeName, items, paper = 'a4-65', showStore = true, showPrice = true, maxStickers = MAX_STICKERS } = {}) {
    const safePaper = PAPER_FORMATS.has(paper) ? paper : 'a4-65';
    const built = buildBarcodeStickersList(items, { storeName, showStore, showPrice, maxStickers });
    if (!built.html) {
      return `<div class='barcode-sheet-empty'>Chưa có sản phẩm nào có mã vạch hoặc mã hàng (SKU) để in tem.</div>`;
    }
    const note = built.truncated
      ? `<div class='barcode-sheet-cap-note'>Hiển thị tối đa ${built.maxStickers} tem mỗi lượt in để giữ trình duyệt mượt trên thiết bị di động.</div>`
      : '';
    return `${note}<div class='barcode-print-sheet' data-paper='${safePaper}'>${built.html}</div>`;
  }

  return {
    computeEan13CheckDigit,
    isValidEan13,
    generateEan13,
    generateUniqueEan13,
    encodeCode128B,
    renderBarcodeSvg,
    buildBarcodeStickersHtml,
    buildBarcodeSheetHtml,
    paperFormats: Array.from(PAPER_FORMATS),
    MAX_STICKERS,
  };
});
