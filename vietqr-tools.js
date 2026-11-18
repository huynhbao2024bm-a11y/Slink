(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlinkVietQrTools = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function asciiClean(raw, maxLen = 40) {
    return String(raw || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[Đđ]/g, (m) => (m === 'Đ' ? 'D' : 'd'))
      .replace(/[^\x20-\x7e]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLen);
  }

  function tlv(id, value) {
    const text = String(value);
    return id + String(text.length).padStart(2, '0') + text;
  }

  // Standard CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) per EMVCo QRCPS.
  function crc16Ccitt(input) {
    let crc = 0xFFFF;
    for (let i = 0; i < input.length; i += 1) {
      crc ^= input.charCodeAt(i) << 8;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function buildVietQrPayload({ bankBin, accountNumber, amountVnd = 0, description = '' } = {}) {
    const bin = String(bankBin || '').replace(/\D/g, '');
    const acc = asciiClean(accountNumber, 32).replace(/\s+/g, '');
    if (!/^\d{6}$/.test(bin)) throw new Error('Mã BIN ngân hàng NAPAS phải gồm 6 chữ số.');
    if (!acc || acc.length > 32) throw new Error('Số tài khoản ngân hàng không hợp lệ.');

    const amountStr = String(amountVnd ?? '0').trim();
    const hasAmount = /^[1-9]\d{0,12}$/.test(amountStr);
    const memo = asciiClean(description, 50);

    const beneficiary = tlv('00', bin) + tlv('01', acc);
    const merchantInfo = tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');
    const additional = memo ? tlv('62', tlv('08', memo)) : '';

    const raw =
      tlv('00', '01') +
      tlv('01', hasAmount ? '12' : '11') +
      tlv('38', merchantInfo) +
      tlv('53', '704') +
      (hasAmount ? tlv('54', amountStr) : '') +
      tlv('58', 'VN') +
      additional +
      '6304';

    return raw + crc16Ccitt(raw);
  }

  // ---- Pure JS QR Code Matrix Encoder (Byte Mode, ECC Level M, Versions 1..10) ----
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i += 1) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGenerator(eccCount) {
    let poly = [1];
    for (let i = 0; i < eccCount; i += 1) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = GF_EXP[i];
      for (let j = 0; j < poly.length; j += 1) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function rsCompute(data, eccCount) {
    const gen = rsGenerator(eccCount);
    const res = new Uint8Array(data.length + eccCount);
    res.set(data);
    for (let i = 0; i < data.length; i += 1) {
      const coef = res[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j += 1) res[i + j] ^= gfMul(gen[j], coef);
      }
    }
    return res.slice(data.length);
  }

  const QR_M_EXACT = [
    { v: 1, blocks: [[1, 16, 10]], align: [] },
    { v: 2, blocks: [[1, 28, 16]], align: [6, 18] },
    { v: 3, blocks: [[1, 44, 26]], align: [6, 22] },
    { v: 4, blocks: [[2, 32, 18]], align: [6, 26] },
    { v: 5, blocks: [[2, 43, 24]], align: [6, 30] },
    { v: 6, blocks: [[4, 27, 16]], align: [6, 34] },
    { v: 7, blocks: [[4, 31, 18]], align: [6, 22, 38] },
    { v: 8, blocks: [[2, 38, 22], [2, 39, 22]], align: [6, 24, 42] },
    { v: 9, blocks: [[3, 36, 22], [2, 37, 22]], align: [6, 26, 46] },
    { v: 10, blocks: [[4, 43, 26], [1, 44, 26]], align: [6, 28, 50] },
  ];

  function totalDataBytes(spec) {
    return spec.blocks.reduce((sum, [cnt, d]) => sum + cnt * d, 0);
  }

  function encodeDataCodewords(bytes, spec) {
    const capBytes = totalDataBytes(spec);
    const countBits = spec.v <= 9 ? 8 : 16;
    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i -= 1) bits.push((val >> i) & 1);
    };
    pushBits(0b0100, 4); // Byte mode
    pushBits(bytes.length, countBits);
    for (const b of bytes) pushBits(b, 8);
    const maxBits = capBytes * 8;
    pushBits(0, Math.min(4, maxBits - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);
    const out = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
      out.push(byte);
    }
    const pads = [0xec, 0x11];
    let p = 0;
    while (out.length < capBytes) {
      out.push(pads[p]);
      p ^= 1;
    }

    const dataBlocks = [];
    const eccBlocks = [];
    let offset = 0;
    for (const [cnt, dLen, eLen] of spec.blocks) {
      for (let b = 0; b < cnt; b += 1) {
        const chunk = out.slice(offset, offset + dLen);
        offset += dLen;
        dataBlocks.push(chunk);
        eccBlocks.push(Array.from(rsCompute(Uint8Array.from(chunk), eLen)));
      }
    }

    const interleaved = [];
    const maxData = Math.max(...dataBlocks.map((b) => b.length));
    for (let i = 0; i < maxData; i += 1) {
      for (const blk of dataBlocks) if (i < blk.length) interleaved.push(blk[i]);
    }
    const maxEcc = eccBlocks[0].length;
    for (let i = 0; i < maxEcc; i += 1) {
      for (const blk of eccBlocks) if (i < blk.length) interleaved.push(blk[i]);
    }
    return interleaved;
  }

  function buildQrBase(spec) {
    const size = spec.v * 4 + 17;
    const mod = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    const fixed = Array.from({ length: size }, () => new Uint8Array(size));
    const setFixed = (r, c, v) => {
      if (r >= 0 && r < size && c >= 0 && c < size) {
        mod[r][c] = v ? 1 : 0;
        fixed[r][c] = 1;
      }
    };

    const drawFinder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr += 1) {
        for (let dc = -1; dc <= 7; dc += 1) {
          const r = r0 + dr;
          const c = c0 + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const on = (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) &&
            (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
          setFixed(r, c, on ? 1 : 0);
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    for (let i = 8; i < size - 8; i += 1) {
      setFixed(6, i, i % 2 === 0 ? 1 : 0);
      setFixed(i, 6, i % 2 === 0 ? 1 : 0);
    }
    setFixed(size - 8, 8, 1);

    for (const r of spec.align) {
      for (const c of spec.align) {
        if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 8) || (r >= size - 8 && c <= 8)) continue;
        for (let dr = -2; dr <= 2; dr += 1) {
          for (let dc = -2; dc <= 2; dc += 1) {
            const on = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
            setFixed(r + dr, c + dc, on ? 1 : 0);
          }
        }
      }
    }

    // Reserve format areas
    for (let i = 0; i < 9; i += 1) {
      if (!fixed[8][i]) fixed[8][i] = 1;
      if (!fixed[i][8]) fixed[i][8] = 1;
    }
    for (let i = size - 8; i < size; i += 1) {
      fixed[8][i] = 1;
      fixed[i][8] = 1;
    }

    // Version info for v >= 7
    if (spec.v >= 7) {
      let rem = spec.v;
      for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const vBits = (spec.v << 12) | rem;
      for (let i = 0; i < 18; i += 1) {
        const bit = (vBits >> i) & 1;
        const a = Math.floor(i / 3);
        const b = size - 11 + (i % 3);
        setFixed(a, b, bit);
        setFixed(b, a, bit);
      }
    }

    return { size, mod, fixed };
  }

  function applyFormatInfo(mod, size, maskPattern) {
    // ECC M = 00 -> data = (00 << 3) | maskPattern
    const data = maskPattern & 7;
    let rem = data << 10;
    for (let i = 4; i >= 0; i -= 1) {
      if (rem & (1 << (i + 10))) rem ^= 0x537 << i;
    }
    const fmt = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i < 15; i += 1) {
      const bit = (fmt >> i) & 1;
      // Vertical top-left / bottom-left
      if (i < 6) mod[i][8] = bit;
      else if (i < 8) mod[i + 1][8] = bit;
      else mod[size - 15 + i][8] = bit;
      // Horizontal top-right / top-left
      if (i < 8) mod[8][size - 1 - i] = bit;
      else if (i === 8) mod[8][7] = bit;
      else mod[8][14 - i] = bit;
    }
    mod[size - 8][8] = 1;
  }

  function penaltyScore(mod, size) {
    let score = 0;
    for (let r = 0; r < size; r += 1) {
      let runC = 1;
      for (let c = 1; c < size; c += 1) {
        if (mod[r][c] === mod[r][c - 1]) {
          runC += 1;
          if (runC === 5) score += 3;
          else if (runC > 5) score += 1;
        } else runC = 1;
      }
    }
    for (let c = 0; c < size; c += 1) {
      let runR = 1;
      for (let r = 1; r < size; r += 1) {
        if (mod[r][c] === mod[r - 1][c]) {
          runR += 1;
          if (runR === 5) score += 3;
          else if (runR > 5) score += 1;
        } else runR = 1;
      }
    }
    for (let r = 0; r < size - 1; r += 1) {
      for (let c = 0; c < size - 1; c += 1) {
        const v = mod[r][c];
        if (v === mod[r][c + 1] && v === mod[r + 1][c] && v === mod[r + 1][c + 1]) score += 3;
      }
    }
    return score;
  }

  function encodeQrMatrix(text) {
    const bytes = new TextEncoder().encode(String(text || ''));
    let spec = null;
    for (const candidate of QR_M_EXACT) {
      const lenBytes = candidate.v <= 9 ? 2 : 3; // 4 mode bits + count bits <= 12..20
      if (totalDataBytes(candidate) >= bytes.length + lenBytes) {
        spec = candidate;
        break;
      }
    }
    if (!spec) throw new Error('Nội dung mã QR vượt quá giới hạn phiên bản 10.');

    const codewords = encodeDataCodewords(bytes, spec);
    const { size, mod: baseMod, fixed } = buildQrBase(spec);

    let bestMask = 0;
    let bestScore = Infinity;
    let bestMod = null;

    for (let mask = 0; mask < 8; mask += 1) {
      const m = baseMod.map((row) => new Int8Array(row));
      let bitIdx = 0;
      const totalBits = codewords.length * 8;
      let col = size - 1;
      let up = true;
      while (col > 0) {
        if (col === 6) col -= 1;
        for (let step = 0; step < size; step += 1) {
          const r = up ? size - 1 - step : step;
          for (let offset = 0; offset < 2; offset += 1) {
            const c = col - offset;
            if (fixed[r][c]) continue;
            let bit = 0;
            if (bitIdx < totalBits) {
              bit = (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
              bitIdx += 1;
            }
            const invert =
              mask === 0 ? (r + c) % 2 === 0 :
              mask === 1 ? r % 2 === 0 :
              mask === 2 ? c % 3 === 0 :
              mask === 3 ? (r + c) % 3 === 0 :
              mask === 4 ? (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0 :
              mask === 5 ? ((r * c) % 2) + ((r * c) % 3) === 0 :
              mask === 6 ? (((r * c) % 2) + ((r * c) % 3)) % 2 === 0 :
              (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
            m[r][c] = invert ? bit ^ 1 : bit;
          }
        }
        col -= 2;
        up = !up;
      }
      applyFormatInfo(m, size, mask);
      const score = penaltyScore(m, size);
      if (score < bestScore) {
        bestScore = score;
        bestMask = mask;
        bestMod = m;
      }
    }
    return { size, mask: bestMask, modules: bestMod };
  }

  function renderQrSvg(text, { label = 'VietQR', quiet = 3, modulePx = 4 } = {}) {
    const q = Math.min(10, Math.max(1, Math.trunc(Number(quiet) || 3)));
    const m = Math.min(20, Math.max(1, Math.trunc(Number(modulePx) || 4)));
    const { size, modules } = encodeQrMatrix(text);
    const total = size + q * 2;
    const rects = [];
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (modules[r][c] === 1) {
          rects.push(`<rect x='${c + q}' y='${r + q}' width='1' height='1'/>`);
        }
      }
    }
    const px = total * m;
    return `<svg class='vietqr-svg' width='${px}' height='${px}' viewBox='0 0 ${total} ${total}' role='img' aria-label='${escapeHtml(label)}' shape-rendering='crispEdges'><rect width='${total}' height='${total}' fill='#ffffff'/><g fill='#111111'>${rects.join('')}</g></svg>`;
  }

  return {
    crc16Ccitt,
    asciiClean,
    buildVietQrPayload,
    encodeQrMatrix,
    renderQrSvg,
  };
}));
