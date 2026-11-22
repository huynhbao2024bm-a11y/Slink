(function () {
  'use strict';

  const S = window.Slink;
  if (!S || !S.fn || typeof S.fn.boot !== 'function') {
    throw new Error('Slink frontend modules failed to initialize in order.');
  }

  S.fn.boot();
})();
