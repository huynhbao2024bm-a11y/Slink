if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', function () {
    var hadController = Boolean(navigator.serviceWorker.controller);
    var reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloaded) return;
      var slink = window.Slink;
      var isBusy = Boolean(
        slink && slink.state && (
          slink.state.activeWrites > 0
          || (slink.dom && slink.dom.modal && !slink.dom.modal.hidden)
          || (slink.state.page === 'pos' && Array.isArray(slink.state.cart) && slink.state.cart.length > 0)
        )
      );
      if (isBusy) {
        if (slink.fn && typeof slink.fn.toast === 'function') {
          slink.fn.toast('Đã có bản cập nhật mới', 'Hoàn tất thao tác hiện tại rồi tải lại trang để dùng bản mới.');
        }
        return;
      }
      reloaded = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(function (reg) {
      if (reg && typeof reg.update === 'function') reg.update().catch(function () {});
    }).catch(function () {});
  });
}
