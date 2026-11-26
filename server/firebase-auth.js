'use strict';

const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

function parseServiceAccountJson(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  let text = trimmed;
  if (!trimmed.startsWith('{')) {
    try {
      text = Buffer.from(trimmed, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('Firebase service account JSON is missing required credential fields.');
  }
  return {
    ...parsed,
    private_key: String(parsed.private_key).replace(/\\n/g, '\n'),
  };
}

function loadServiceAccount(env = {}) {
  if (typeof env.FIREBASE_SERVICE_ACCOUNT_JSON === 'string' && env.FIREBASE_SERVICE_ACCOUNT_JSON.trim()) {
    return parseServiceAccountJson(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  const candidatePath = typeof env.FIREBASE_SERVICE_ACCOUNT_PATH === 'string' && env.FIREBASE_SERVICE_ACCOUNT_PATH.trim()
    ? env.FIREBASE_SERVICE_ACCOUNT_PATH.trim()
    : (typeof env.GOOGLE_APPLICATION_CREDENTIALS === 'string' ? env.GOOGLE_APPLICATION_CREDENTIALS.trim() : '');
  if (candidatePath) {
    const resolved = path.isAbsolute(candidatePath) ? candidatePath : path.resolve(process.cwd(), candidatePath);
    if (existsSync(resolved)) {
      return parseServiceAccountJson(readFileSync(resolved, 'utf8'));
    }
  }
  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return {
      project_id: String(env.FIREBASE_PROJECT_ID).trim(),
      client_email: String(env.FIREBASE_CLIENT_EMAIL).trim(),
      private_key: String(env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n'),
    };
  }
  return null;
}

function createFirebaseVerifier(env = {}, customVerifier = null) {
  if (typeof customVerifier === 'function') {
    return {
      configured: true,
      verifyIdToken: (idToken) => customVerifier(idToken),
    };
  }
  const serviceAccount = loadServiceAccount(env);
  if (!serviceAccount) {
    return {
      configured: false,
      verifyIdToken: async () => {
        throw new Error('firebase_unconfigured');
      },
    };
  }
  const appName = `slink-auth-${serviceAccount.project_id}`;
  const firebaseApp = getApps().some((item) => item.name === appName)
    ? getApp(appName)
    : initializeApp({ credential: cert(serviceAccount) }, appName);
  const authClient = getAuth(firebaseApp);
  return {
    configured: true,
    verifyIdToken: (idToken) => authClient.verifyIdToken(idToken, true),
  };
}

function getPublicFirebaseConfig(env = {}, verifierConfigured = false) {
  const apiKey = typeof env.FIREBASE_WEB_API_KEY === 'string' ? env.FIREBASE_WEB_API_KEY.trim() : '';
  const authDomain = typeof env.FIREBASE_AUTH_DOMAIN === 'string' ? env.FIREBASE_AUTH_DOMAIN.trim() : '';
  const projectId = typeof env.FIREBASE_PROJECT_ID === 'string' ? env.FIREBASE_PROJECT_ID.trim() : '';
  const storageBucket = typeof env.FIREBASE_STORAGE_BUCKET === 'string' ? env.FIREBASE_STORAGE_BUCKET.trim() : '';
  const messagingSenderId = typeof env.FIREBASE_MESSAGING_SENDER_ID === 'string' ? env.FIREBASE_MESSAGING_SENDER_ID.trim() : '';
  const appId = typeof env.FIREBASE_APP_ID === 'string' ? env.FIREBASE_APP_ID.trim() : '';
  const enabled = Boolean(verifierConfigured && apiKey && authDomain && projectId && appId);
  if (!enabled) {
    return { enabled: false };
  }
  return {
    enabled: true,
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    providers: {
      google: true,
      emailPassword: true,
    },
  };
}

module.exports = {
  loadServiceAccount,
  createFirebaseVerifier,
  getPublicFirebaseConfig,
};
