(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlinkBanksVn = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Official NAPAS Bank BIN registry sourced from api.vietqr.io/v2/banks (2026-11-18).
  const VN_BANKS = [
    { code: 'VCB', shortName: 'Vietcombank', bin: '970436', name: 'Ngân hàng TMCP Ngoại Thương Việt Nam' },
    { code: 'TCB', shortName: 'Techcombank', bin: '970407', name: 'Ngân hàng TMCP Kỹ Thương Việt Nam' },
    { code: 'MB', shortName: 'MBBank', bin: '970422', name: 'Ngân hàng TMCP Quân Đội' },
    { code: 'BIDV', shortName: 'BIDV', bin: '970418', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam' },
    { code: 'ICB', shortName: 'VietinBank', bin: '970415', name: 'Ngân hàng TMCP Công Thương Việt Nam' },
    { code: 'VBA', shortName: 'Agribank', bin: '970405', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam' },
    { code: 'ACB', shortName: 'ACB', bin: '970416', name: 'Ngân hàng TMCP Á Châu' },
    { code: 'VPB', shortName: 'VPBank', bin: '970432', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
    { code: 'TPB', shortName: 'TPBank', bin: '970423', name: 'Ngân hàng TMCP Tiên Phong' },
    { code: 'STB', shortName: 'Sacombank', bin: '970403', name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
    { code: 'VIB', shortName: 'VIB', bin: '970441', name: 'Ngân hàng TMCP Quốc tế Việt Nam' },
    { code: 'HDB', shortName: 'HDBank', bin: '970437', name: 'Ngân hàng TMCP Phát triển TP. Hồ Chí Minh' },
    { code: 'OCB', shortName: 'OCB', bin: '970448', name: 'Ngân hàng TMCP Phương Đông' },
    { code: 'MSB', shortName: 'MSB', bin: '970426', name: 'Ngân hàng TMCP Hàng Hải' },
    { code: 'SHB', shortName: 'SHB', bin: '970443', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội' },
    { code: 'EIB', shortName: 'Eximbank', bin: '970431', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam' },
    { code: 'LPB', shortName: 'LPBank', bin: '970449', name: 'Ngân hàng TMCP Lộc Phát Việt Nam' },
    { code: 'SEAB', shortName: 'SeABank', bin: '970440', name: 'Ngân hàng TMCP Đông Nam Á' },
    { code: 'NAB', shortName: 'NamABank', bin: '970428', name: 'Ngân hàng TMCP Nam Á' },
    { code: 'ABB', shortName: 'ABBANK', bin: '970425', name: 'Ngân hàng TMCP An Bình' },
    { code: 'BAB', shortName: 'BacABank', bin: '970409', name: 'Ngân hàng TMCP Bắc Á' },
    { code: 'VCCB', shortName: 'VietCapitalBank', bin: '970454', name: 'Ngân hàng TMCP Bản Việt' },
    { code: 'SCB', shortName: 'SCB', bin: '970429', name: 'Ngân hàng TMCP Sài Gòn' },
    { code: 'PVB', shortName: 'PVcomBank', bin: '970412', name: 'Ngân hàng TMCP Đại Chúng Việt Nam' },
    { code: 'OJB', shortName: 'OceanBank', bin: '970414', name: 'Ngân hàng Thương mại TNHH MTV Đại Dương' },
    { code: 'NCB', shortName: 'NCB', bin: '970419', name: 'Ngân hàng TMCP Quốc Dân' },
    { code: 'KLB', shortName: 'KienLongBank', bin: '970452', name: 'Ngân hàng TMCP Kiên Long' },
    { code: 'BVB', shortName: 'BaoVietBank', bin: '970438', name: 'Ngân hàng TMCP Bảo Việt' },
    { code: 'PGB', shortName: 'PGBank', bin: '970430', name: 'Ngân hàng TMCP Thịnh Vượng và Phát triển' },
    { code: 'VIETBANK', shortName: 'VietBank', bin: '970433', name: 'Ngân hàng TMCP Việt Nam Thương Tín' },
    { code: 'SGICB', shortName: 'SaigonBank', bin: '970400', name: 'Ngân hàng TMCP Sài Gòn Công Thương' },
    { code: 'CAKE', shortName: 'CAKE', bin: '546034', name: 'Ngân hàng số CAKE by VPBank' },
    { code: 'Ubank', shortName: 'Ubank', bin: '546035', name: 'Ngân hàng số Ubank by VPBank' },
    { code: 'TIMO', shortName: 'Timo', bin: '963388', name: 'Ngân hàng số Timo by BVBank' },
    { code: 'SHBVN', shortName: 'ShinhanBank', bin: '970424', name: 'Ngân hàng TNHH MTV Shinhan Việt Nam' },
    { code: 'WVN', shortName: 'Woori', bin: '970457', name: 'Ngân hàng TNHH MTV Woori Việt Nam' },
    { code: 'IVB', shortName: 'IndovinaBank', bin: '970434', name: 'Ngân hàng TNHH Indovina' },
    { code: 'CIMB', shortName: 'CIMB', bin: '422589', name: 'Ngân hàng TNHH MTV CIMB Việt Nam' },
    { code: 'HSBC', shortName: 'HSBC', bin: '458761', name: 'Ngân hàng TNHH MTV HSBC Việt Nam' },
    { code: 'CBB', shortName: 'CBBank', bin: '970444', name: 'Ngân hàng TM TNHH MTV Xây Dựng Việt Nam' },
    { code: 'COOPBANK', shortName: 'COOPBANK', bin: '970446', name: 'Ngân hàng Hợp tác xã Việt Nam' },
  ];

  function findBankByBin(bin) {
    const clean = String(bin || '').trim();
    return VN_BANKS.find((b) => b.bin === clean) || null;
  }

  function findBankByCode(code) {
    const clean = String(code || '').trim().toUpperCase();
    return VN_BANKS.find((b) => b.code.toUpperCase() === clean) || null;
  }

  return { VN_BANKS, findBankByBin, findBankByCode };
}));
