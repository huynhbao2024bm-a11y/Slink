(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlinkFirebaseAuth = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SDK_VERSION = '11.6.0';
  let cachedConfig = null;
  let configPromise = null;
  let sdkPromise = null;

  function extractOobCode(raw) {
    const text = String(raw || '').trim();
    if (!text) return '';
    if (/oobCode=/i.test(text) || /^https?:\/\//i.test(text)) {
      try {
        const parsed = new URL(text, window.location.origin);
        const code = parsed.searchParams.get('oobCode') || parsed.searchParams.get('token');
        if (code) return code.trim();
      } catch (_) {
        const match = text.match(/[?&#](?:oobCode|token)=([^&#]+)/i);
        if (match) return decodeURIComponent(match[1]).trim();
      }
    }
    return text;
  }

  function mapFirebaseError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (code === 'slink/already-verified') {
      return message;
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || /hủy|canceled|cancelled/i.test(message)) {
      return 'Bạn đã đóng cửa sổ đăng nhập Google.';
    }
    if (code === 'auth/popup-blocked') {
      return 'Trình duyệt đang chặn cửa sổ bật lên. Hãy cho phép popup rồi thử lại.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'Email này đã được đăng ký trước đó. Hãy đăng nhập hoặc gửi lại email xác nhận.';
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return 'Email hoặc mật khẩu chưa đúng.';
    }
    if (code === 'auth/invalid-email') {
      return 'Địa chỉ email chưa đúng định dạng.';
    }
    if (code === 'auth/weak-password') {
      return 'Mật khẩu chưa đủ mạnh (tối thiểu 12 ký tự).';
    }
    if (code === 'auth/expired-action-code') {
      return 'Mã xác nhận trong email đã hết hạn. Hãy yêu cầu gửi lại email mới.';
    }
    if (code === 'auth/invalid-action-code') {
      return 'Mã xác nhận hoặc liên kết email không hợp lệ hoặc đã được sử dụng.';
    }
    if (code === 'auth/user-disabled') {
      return 'Tài khoản này đã bị vô hiệu hóa.';
    }
    if (code === 'auth/unauthorized-domain') {
      return 'Tên miền hiện tại chưa được cấp quyền OAuth trong Firebase Console.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.';
    }
    if (code === 'auth/operation-not-allowed') {
      return 'Phương thức xác thực này chưa được bật trong Firebase Console.';
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

  async function registerWithEmailPassword(email, password, displayName, continueUrl, opts) {
    try {
      const fb = await ensureWebSdk(opts?.config);
      const cred = await fb.auth().createUserWithEmailAndPassword(String(email || '').trim(), String(password || ''));
      if (displayName && cred.user && typeof cred.user.updateProfile === 'function') {
        try {
          await cred.user.updateProfile({ displayName: String(displayName).trim().slice(0, 120) });
        } catch (_) {
          // Display name is still persisted atomically on Slink server.
        }
      }
      if (cred.user && !cred.user.emailVerified) {
        await cred.user.sendEmailVerification(continueUrl ? { url: continueUrl, handleCodeInApp: false } : undefined);
      }
      const idToken = await cred.user.getIdToken(true);
      return {
        idToken,
        uid: cred.user.uid,
        emailVerified: Boolean(cred.user.emailVerified),
        email: cred.user.email || String(email || '').trim(),
      };
    } catch (error) {
      const err = new Error(mapFirebaseError(error));
      err.firebaseCode = error?.code || '';
      throw err;
    }
  }

  async function signInWithEmailPassword(email, password, opts) {
    try {
      const fb = await ensureWebSdk(opts?.config);
      const cred = await fb.auth().signInWithEmailAndPassword(String(email || '').trim(), String(password || ''));
      await cred.user.reload();
      const idToken = await cred.user.getIdToken(true);
      return {
        idToken,
        uid: cred.user.uid,
        emailVerified: Boolean(cred.user.emailVerified),
        email: cred.user.email || String(email || '').trim(),
      };
    } catch (error) {
      const err = new Error(mapFirebaseError(error));
      err.firebaseCode = error?.code || '';
      throw err;
    }
  }

  async function resendVerificationEmail(continueUrl, opts) {
    try {
      const fb = await ensureWebSdk(opts?.config);
      let user = fb.auth().currentUser;
      if (!user && opts?.email && opts?.password) {
        const cred = await fb.auth().signInWithEmailAndPassword(String(opts.email).trim(), String(opts.password));
        user = cred.user;
      }
      if (!user) {
        throw new Error('Hãy nhập mật khẩu tài khoản bên dưới để gửi lại email xác nhận qua Firebase.');
      }
      await user.reload();
      if (user.emailVerified) {
        const verifiedErr = new Error('Email của bạn đã được xác nhận trước đó. Hãy bấm Kiểm tra hoặc Đăng nhập.');
        verifiedErr.code = 'slink/already-verified';
        throw verifiedErr;
      }
      await user.sendEmailVerification(continueUrl ? { url: continueUrl, handleCodeInApp: false } : undefined);
      return { sent: true, email: user.email || opts?.email || '' };
    } catch (error) {
      const err = new Error(mapFirebaseError(error));
      err.firebaseCode = error?.code || '';
      throw err;
    }
  }

  async function checkEmailVerified(opts) {
    try {
      const fb = await ensureWebSdk(opts?.config);
      let user = fb.auth().currentUser;
      if (!user && opts?.email && opts?.password) {
        const cred = await fb.auth().signInWithEmailAndPassword(String(opts.email).trim(), String(opts.password));
        user = cred.user;
      }
      if (!user) {
        return { emailVerified: false, signedIn: false };
      }
      await user.reload();
      if (!user.emailVerified) {
        return { emailVerified: false, signedIn: true, email: user.email || '' };
      }
      const idToken = await user.getIdToken(true);
      return { emailVerified: true, signedIn: true, idToken, email: user.email || '' };
    } catch (error) {
      throw new Error(mapFirebaseError(error));
    }
  }

  async function applyVerificationCode(rawCodeOrUrl, opts) {
    const oobCode = extractOobCode(rawCodeOrUrl);
    if (!oobCode) throw new Error('Hãy nhập mã xác nhận hoặc dán liên kết từ email.');
    try {
      const fb = await ensureWebSdk(opts?.config);
      await fb.auth().applyActionCode(oobCode);
      const user = fb.auth().currentUser;
      if (user) {
        await user.reload();
        if (user.emailVerified) {
          const idToken = await user.getIdToken(true);
          return { applied: true, idToken };
        }
      }
      return { applied: true, idToken: '' };
    } catch (error) {
      throw new Error(mapFirebaseError(error));
    }
  }

  async function confirmPasswordResetWithCode(rawCodeOrUrl, newPassword, opts) {
    const oobCode = extractOobCode(rawCodeOrUrl);
    if (!oobCode) throw new Error('Hãy nhập mã xác nhận hoặc dán liên kết đặt lại mật khẩu từ email.');
    try {
      const fb = await ensureWebSdk(opts?.config);
      await fb.auth().confirmPasswordReset(oobCode, String(newPassword || ''));
      return { reset: true };
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
    extractOobCode,
    mapFirebaseError,
    loadConfig,
    ensureWebSdk,
    signInWithGoogle,
    registerWithEmailPassword,
    signInWithEmailPassword,
    resendVerificationEmail,
    checkEmailVerified,
    applyVerificationCode,
    confirmPasswordResetWithCode,
    signOutSilent,
  };
}));
