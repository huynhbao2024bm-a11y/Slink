(function (root, factory) {
  'use strict';
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.SlinkPurchaseUnits = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX = 9223372036854775807n;
  function fail(message) { const error = new Error(message); error.code = 'purchase_pack_invalid'; error.status = 400; throw error; }
  function quantity(value) {
    const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,3}))?$/.exec(String(value));
    if (!match) fail('Số lô cần lớn hơn 0 và có tối đa 3 số sau dấu phẩy.');
    const milli = BigInt(match[1]) * 1000n + BigInt((match[2] || '').padEnd(3, '0') || '0');
    if (!milli) fail('Nhập số lô lớn hơn 0.');
    return milli;
  }
  function text(milli) {
    const fraction = String(milli % 1000n).padStart(3, '0').replace(/0+$/, '');
    return String(milli / 1000n) + (fraction ? '.' + fraction : '');
  }
  function fromPack(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Kiểm tra cách nhập theo lô.');
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 40) fail('Ghi tên đơn vị nhập, ví dụ lô, hộp hoặc thùng.');
    if (!/^[1-9]\d{0,6}$/.test(String(input.size)) || BigInt(input.size) > 1000000n) fail('Số cái trong một lô cần là số nguyên từ 1 đến 1.000.000.');
    const size = BigInt(input.size), packs = quantity(input.quantity), base = packs * size;
    if (base > 9999999999999n) fail('Số lượng quy đổi quá lớn. Chia thành nhiều phiếu nhập.');
    if (!/^(0|[1-9]\d{0,18})$/.test(String(input.unitCostVnd)) || BigInt(input.unitCostVnd) > MAX) fail('Giá một lô phải là số VND nguyên không âm.');
    const cost = BigInt(input.unitCostVnd), total = (cost * packs + 500n) / 1000n;
    if (total > MAX) fail('Tổng tiền lô vượt giới hạn lưu trữ.');
    return {
      quantityMilli: base, quantity: text(base), unitCostVnd: (cost + size / 2n) / size, lineTotalVnd: total,
      pack: { name, size: String(size), quantity: text(packs), unitCostVnd: String(cost) },
    };
  }
  function unitCostFromTotal(totalVnd, quantityMilli) {
    const quantity = BigInt(quantityMilli);
    return (BigInt(totalVnd) * 1000n + quantity / 2n) / quantity;
  }
  return { fromPack, unitCostFromTotal };
});
