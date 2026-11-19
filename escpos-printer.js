(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlinkEscPosPrinter = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function asciiClean(text) {
    return String(text == null ? '' : text)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[Đđ]/g, (m) => (m === 'Đ' ? 'D' : 'd'))
      .replace(/[^\x20-\x7e]/g, ' ');
  }

  function formatVnd(value) {
    const raw = String(value ?? '0').trim();
    if (!/^-?\d+$/.test(raw)) return '0 d';
    const sign = raw.startsWith('-') ? '-' : '';
    const digits = raw.replace(/^-/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}${digits} d`;
  }

  function padLine(left, right, width = 32) {
    const l = asciiClean(left);
    const r = asciiClean(right);
    if (l.length + r.length + 1 <= width) {
      return l + ' '.repeat(width - l.length - r.length) + r;
    }
    const maxLeft = Math.max(8, width - r.length - 1);
    return l.slice(0, maxLeft) + ' ' + r;
  }

  function buildReceiptBytes({ storeName = 'Slink Store', address = '', phone = '', orderNumber = '', createdAt = '', customerName = '', items = [], subtotalVnd = '0', discountVnd = '0', totalVnd = '0', paidVnd = '0', footer = 'Cam on quy khach!', paperWidth = 58, openDrawer = false } = {}) {
    const cols = paperWidth >= 80 ? 48 : 32;
    const hr = '-'.repeat(cols);
    const out = [];
    const push = (...bytes) => out.push(...bytes);
    const pushText = (line) => {
      const clean = asciiClean(line);
      for (let i = 0; i < clean.length; i += 1) out.push(clean.charCodeAt(i));
      out.push(0x0a);
    };

    // ESC @ (Initialize printer)
    push(0x1b, 0x40);
    // Optional cash drawer kick (ESC p m t1 t2)
    if (openDrawer) push(0x1b, 0x70, 0x00, 0x19, 0xfa);
    // Align center + bold on
    push(0x1b, 0x61, 0x01, 0x1b, 0x45, 0x01);
    pushText(String(storeName || 'SLINK').slice(0, cols));
    push(0x1b, 0x45, 0x00);
    if (address) pushText(address.slice(0, cols));
    if (phone) pushText(`DT: ${phone}`.slice(0, cols));
    pushText('HOA DON BAN HANG');

    // Align left
    push(0x1b, 0x61, 0x00);
    if (orderNumber) pushText(`Ma don: ${orderNumber}`);
    if (createdAt) pushText(`Luc: ${createdAt}`);
    if (customerName) pushText(`Khach: ${customerName}`);
    pushText(hr);

    for (const line of items || []) {
      const name = String(line.name || 'Mat hang');
      pushText(name.slice(0, cols));
      const qtyVal = line.quantity ?? line.qty ?? 1;
      const qtyStr = `${qtyVal} x ${formatVnd(line.unitPriceVnd)}`;
      const subStr = formatVnd(line.lineTotalVnd);
      pushText(padLine(qtyStr, subStr, cols));
    }

    pushText(hr);
    pushText(padLine('Tam tinh:', formatVnd(subtotalVnd), cols));
    const discountRaw = String(discountVnd ?? '0').trim();
    if (/^-?\d+$/.test(discountRaw) && BigInt(discountRaw) > 0n) {
      pushText(padLine('Giam gia:', `-${formatVnd(discountRaw)}`, cols));
    }
    push(0x1b, 0x45, 0x01);
    pushText(padLine('TONG CONG:', formatVnd(totalVnd), cols));
    push(0x1b, 0x45, 0x00);
    pushText(padLine('Da thu:', formatVnd(paidVnd), cols));
    pushText(hr);

    push(0x1b, 0x61, 0x01);
    if (footer) pushText(footer.slice(0, cols));
    pushText('');
    pushText('');
    pushText('');
    // Partial cut GS V 66 0
    push(0x1d, 0x56, 0x42, 0x00);

    return Uint8Array.from(out);
  }

  function buildDrawerKickBytes() {
    return Uint8Array.from([0x1b, 0x40, 0x1b, 0x70, 0x00, 0x19, 0xfa]);
  }

  let activeSerialPort = null;
  let btBridgeFn = null;
  let btDevice = { address: '', name: '' };

  function setAndroidBridge(fn) {
    btBridgeFn = typeof fn === 'function' ? fn : null;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    if (typeof btoa === 'function') return btoa(binary);
    return Buffer.from(bytes).toString('base64');
  }

  function capabilities() {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const hasAndroid = Boolean(typeof window !== 'undefined' && window.SlinkAndroid && btBridgeFn);
    return {
      serialSupported: Boolean(nav && 'serial' in nav),
      btSupported: hasAndroid,
      usbSupported: Boolean(nav && 'usb' in nav),
      connected: Boolean((activeSerialPort && activeSerialPort.writable) || (hasAndroid && btDevice.address)),
      btDeviceName: btDevice.name || '',
      btDeviceAddress: btDevice.address || '',
    };
  }

  async function refreshBluetoothState() {
    if (!btBridgeFn) return btDevice;
    try {
      const res = await btBridgeFn({ type: 'btPrinter', action: 'state' });
      if (res?.printer) {
        btDevice = { address: res.printer.address || '', name: res.printer.name || '' };
      }
    } catch {}
    return btDevice;
  }

  async function listBluetoothPrinters() {
    if (!btBridgeFn) throw new Error('Chỉ hỗ trợ máy in Bluetooth trên ứng dụng Android Slink.');
    const res = await btBridgeFn({ type: 'btPrinter', action: 'list' });
    if (res?.status !== 'ok') throw new Error(res?.message || 'Chưa lấy được danh sách thiết bị Bluetooth.');
    if (res.printer) btDevice = { address: res.printer.address || '', name: res.printer.name || '' };
    return Array.isArray(res.devices) ? res.devices : [];
  }

  async function selectBluetoothPrinter(address, name) {
    if (!btBridgeFn) throw new Error('Chỉ hỗ trợ máy in Bluetooth trên ứng dụng Android Slink.');
    const res = await btBridgeFn({ type: 'btPrinter', action: 'select', address: String(address || ''), name: String(name || '') });
    if (res?.status !== 'ok') throw new Error(res?.message || 'Chưa lưu được máy in Bluetooth.');
    btDevice = { address: String(address || ''), name: String(name || '') };
    return btDevice;
  }

  async function connectSerialPrinter(baudRate = 9600) {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      throw new Error('Trình duyệt này chưa hỗ trợ WebSerial (hãy dùng Chrome/Edge hoặc in qua hộp thoại trình duyệt).');
    }
    const port = await navigator.serial.requestPort();
    if (!port.readable && !port.writable) {
      await port.open({ baudRate });
    }
    activeSerialPort = port;
    return true;
  }

  async function writeBytes(bytes) {
    const caps = capabilities();
    if (caps.btSupported) {
      if (!btDevice.address) await refreshBluetoothState();
      if (!btDevice.address) throw new Error('Chưa chọn máy in Bluetooth. Vào Cài đặt → Chọn máy in đã ghép đôi.');
      const res = await btBridgeFn({ type: 'btPrinter', action: 'print', address: btDevice.address, base64: bytesToBase64(bytes) });
      if (res?.status !== 'ok') throw new Error(res?.message || 'In hóa đơn Bluetooth thất bại.');
      return true;
    }
    if (!activeSerialPort || !activeSerialPort.writable) {
      await connectSerialPrinter(9600);
    }
    const writer = activeSerialPort.writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
    return true;
  }

  async function printReceipt(receiptData) {
    return writeBytes(buildReceiptBytes(receiptData));
  }

  async function openCashDrawer() {
    return writeBytes(buildDrawerKickBytes());
  }

  return {
    asciiClean,
    buildReceiptBytes,
    buildDrawerKickBytes,
    capabilities,
    setAndroidBridge,
    refreshBluetoothState,
    listBluetoothPrinters,
    selectBluetoothPrinter,
    connectSerialPrinter,
    printReceipt,
    openCashDrawer,
  };
}));
