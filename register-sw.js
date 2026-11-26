if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', function () {
    var hadController = Boolean(navigator.serviceWorker.controller);
    var reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(function (reg) {
      if (reg && typeof reg.update === 'function') reg.update().catch(function () {});
    }).catch(function () {});
  });
}
