(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlinkFirebaseAuth = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SDK_VERSION = '11.6.0';
  let cachedConfig = null;
  let configPromise = null;
  let sdkPromise = null;

  function mapFirebaseError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || /hủy|canceled|cancelled/i.test(message)) {
      return 'Bạn đã đóng cửa sổ đăng nhập Google.';
    }
    if (code === 'auth/popup-blocked') {
      return 'Trình duyệt đang chặn cửa sổ bật lên. Hãy cho phép popup rồi thử lại.';
    }
    if (code === 'auth/unauthorized-domain') {
      return 'Tên miền hiện tại chưa được cấp quyền OAuth trong Firebase Console.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.';
    }
    if (code === 'auth/operation-not-allowed') {
      return 'Đăng nhập Google chưa được bật trong Firebase Console.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Không thể kết nối máy chủ xác thực Google. Kiểm tra mạng rồi thử lại.';
    }
    return message || 'Chưa xác thực được với Firebase. Vui lòng thử lại.';
  }

  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      const existing = document.querySelector(`script[data-slink-firebase-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === '1') { resolve(); return; }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Không tải được Firebase SDK.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.slinkFirebaseSrc = src;
      script.addEventListener('load', function () { script.dataset.loaded = '1'; resolve(); }, { once: true });
      script.addEventListener('error', function () { reject(new Error('Không tải được thư viện đăng nhập Google.')); }, { once: true });
      document.head.appendChild(script);
    });
  }

  async function loadConfig() {
    if (cachedConfig) return cachedConfig;
    if (configPromise) return configPromise;
    configPromise = fetch('/api/auth/firebase/config', { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) return { enabled: false };
        return response.json();
      })
      .then(function (data) {
        cachedConfig = data && data.enabled ? data : { enabled: false };
        return cachedConfig;
      })
      .catch(function () {
        return { enabled: false };
      })
      .finally(function () {
        configPromise = null;
      });
    return configPromise;
  }

  async function ensureWebSdk(config) {
    const cfg = config || await loadConfig();
    if (!cfg || !cfg.enabled) {
      throw new Error('Đăng nhập Google chưa được cấu hình trên máy chủ.');
    }
    if (!sdkPromise) {
      sdkPromise = (async function () {
        await loadScriptOnce(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app-compat.js`);
        await loadScriptOnce(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth-compat.js`);
        if (!window.firebase) throw new Error('Firebase SDK chưa sẵn sàng.');
        if (!window.firebase.apps.length) {
          window.firebase.initializeApp({
            apiKey: cfg.apiKey,
            authDomain: cfg.authDomain,
            projectId: cfg.projectId,
            storageBucket: cfg.storageBucket,
            messagingSenderId: cfg.messagingSenderId,
            appId: cfg.appId,
          });
        }
        window.firebase.auth().languageCode = 'vi';
        return window.firebase;
      })().catch(function (error) {
        sdkPromise = null;
        throw error;
      });
    }
    return sdkPromise;
  }

  async function signInWithGoogle(options) {
    const opts = options || {};
    if (opts.isAndroid && typeof opts.nativeAction === 'function') {
      const result = await opts.nativeAction({ type: 'firebaseAuth', action: 'googleSignIn' });
      if (!result || !result.idToken) throw new Error('Không lấy được mã xác thực Google trên Android.');
      return { idToken: result.idToken, provider: 'google.com' };
    }
    try {
      const fb = await ensureWebSdk(opts.config);
      const provider = new fb.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await fb.auth().signInWithPopup(provider);
      const idToken = await credential.user.getIdToken();
      return { idToken, provider: 'google.com' };
    } catch (error) {
      throw new Error(mapFirebaseError(error));
    }
  }

  async function signOutSilent(options) {
    const opts = options || {};
    try {
      if (opts.isAndroid && typeof opts.nativeAction === 'function') {
        await opts.nativeAction({ type: 'firebaseAuth', action: 'signOut' });
      } else if (window.firebase && typeof window.firebase.auth === 'function') {
        await window.firebase.auth().signOut();
      }
    } catch (_) {
      // Ignore Firebase client sign-out failures while clearing Slink server session.
    }
  }

  return {
    mapFirebaseError,
    loadConfig,
    ensureWebSdk,
    signInWithGoogle,
    signOutSilent,
  };
}));
