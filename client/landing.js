(function (S) {
  'use strict';

  S.state.landingDemoTab = S.state.landingDemoTab || 'pos';
  S.state.landingDemoCart = S.state.landingDemoCart || { cf: 2, tr: 1 };
  S.state.landingRevealedOnce = Boolean(S.state.landingRevealedOnce);

  const DEMO_PRODUCTS = [
    { id: 'cf', name: 'Cà phê sữa đá', price: 35000, stock: 42 },
    { id: 'tr', name: 'Trà đào cam sả', price: 45000, stock: 28 },
    { id: 'cr', name: 'Bánh sừng bò', price: 32000, stock: 16 },
  ];

  function demoCartSummary() {
    const cart = S.state.landingDemoCart || {};
    let total = 0;
    let count = 0;
    for (const p of DEMO_PRODUCTS) {
      const qty = Math.max(0, Number(cart[p.id] || 0));
      count += qty;
      total += qty * p.price;
    }
    return { total, count };
  }

  S.fn.isAndroidApp = function isAndroidApp() {
    if (window.SlinkAndroid) return true;
    try {
      return new URLSearchParams(window.location.search).get('platform') === 'android';
    } catch (_error) {
      return false;
    }
  };

  S.fn.renderLandingStage = function renderLandingStage() {
    const tab = S.state.landingDemoTab || 'pos';
    const cart = S.state.landingDemoCart || {};
    const summary = demoCartSummary();

    let stageBody = '';
    if (tab === 'inventory') {
      stageBody = `<div class='landing-stage-table'>
        <div class='landing-stage-row head'><span>Mặt hàng</span><span>Tồn kho</span><span>Giá bán</span></div>
        ${DEMO_PRODUCTS.map((p, idx) => `<div class='landing-stage-row'>
          <span><strong>${S.fn.esc(p.name)}</strong><small class='mono'>SKU-0${idx + 1}</small></span>
          <span class='landing-pill ${p.stock < 20 ? 'warn' : 'ok'}'>${p.stock}</span>
          <span class='tabular'><strong>${S.fn.moneyVndText(String(p.price))}</strong></span>
        </div>`).join('')}
      </div>`;
    } else if (tab === 'finance') {
      stageBody = `<div class='landing-finance-grid'>
        <div class='landing-finance-stat'><span>Quỹ tiền mặt</span><strong class='tabular'>4.850.000 ₫</strong></div>
        <div class='landing-finance-stat'><span>Ngân hàng</span><strong class='tabular'>12.400.000 ₫</strong></div>
        <div class='landing-finance-stat accent'><span>Doanh thu hôm nay</span><strong class='tabular'>6.290.000 ₫</strong></div>
      </div>`;
    } else {
      stageBody = `<div class='landing-pos-grid'>
        ${DEMO_PRODUCTS.map((p) => {
          const qty = Number(cart[p.id] || 0);
          return `<button type='button' class='landing-pos-tile ${qty > 0 ? 'active' : ''}' data-action='landing-demo-add' data-id='${p.id}'>
            <span class='landing-pos-name'>${S.fn.esc(p.name)}</span>
            <span class='landing-pos-meta'><strong class='tabular'>${S.fn.moneyVndText(String(p.price))}</strong>${qty > 0 ? `<span class='landing-qty-badge'>×${qty}</span>` : ''}</span>
          </button>`;
        }).join('')}
      </div>
      <div class='landing-pos-bar'>
        <div><small>Tạm tính (${summary.count} món)</small><strong class='tabular'>${S.fn.moneyVndText(String(summary.total))}</strong></div>
        <span class='landing-voice-tag'>Loa đọc tiền: Bật</span>
      </div>`;
    }

    return `<div class='landing-live-stage' id='landing-preview' aria-label='Xem trước giao diện Slink'>
      <div class='landing-stage-chrome'>
        <div class='landing-chrome-dots' aria-hidden='true'><span></span><span></span><span></span></div>
        <div class='landing-stage-tabs' role='tablist' aria-label='Phân hệ Slink'>
          <button type='button' role='tab' aria-selected='${tab === 'pos'}' class='${tab === 'pos' ? 'active' : ''}' data-action='landing-demo-tab' data-tab='pos'>Thu ngân POS</button>
          <button type='button' role='tab' aria-selected='${tab === 'inventory'}' class='${tab === 'inventory' ? 'active' : ''}' data-action='landing-demo-tab' data-tab='inventory'>Tồn kho</button>
          <button type='button' role='tab' aria-selected='${tab === 'finance'}' class='${tab === 'finance' ? 'active' : ''}' data-action='landing-demo-tab' data-tab='finance'>Sổ quỹ</button>
        </div>
      </div>
      <div class='landing-stage-body'>${stageBody}</div>
    </div>`;
  };

  S.fn.renderWebAuthLanding = function renderWebAuthLanding(authCardHtml) {
    const revealClass = S.state.landingRevealedOnce ? 'landing-reveal is-visible' : 'landing-reveal';
    const currentMode = S.state.authMode === 'register' ? 'register' : 'login';
    return `<div class='landing-page'>
      <header class='landing-nav' aria-label='Điều hướng giới thiệu'>
        <a href='#top' class='landing-brand'>
          <span class='brand-mark' aria-hidden='true'><svg viewBox='0 0 32 32'><path d='M8 8.5h16v5H13v2h11v8H8v-5h11v-2H8z' fill='currentColor'/><circle cx='24.5' cy='7.5' r='2.5' fill='#c8f36c'/></svg></span>
          <span class='brand-name'>slink<span class='brand-period'>.</span></span>
        </a>
        <nav class='landing-nav-links'>
          <a href='#landing-preview'>Trải nghiệm</a>
          <a href='#landing-features'>Tính năng</a>
          <a href='#landing-android'>Android</a>
        </nav>
        <div class='landing-nav-actions'>
          <button type='button' class='btn btn-quiet btn-sm' data-action='landing-focus-auth' data-mode='login' aria-pressed='${currentMode === 'login'}'>Đăng nhập</button>
          <button type='button' class='btn btn-primary btn-sm' data-action='landing-focus-auth' data-mode='register' aria-pressed='${currentMode === 'register'}'>Tạo cửa hàng</button>
        </div>
      </header>

      <div class='landing-hero' id='top'>
        <div class='landing-hero-copy ${revealClass}'>
          <span class='landing-eyebrow'>Phần mềm quản lý bán lẻ</span>
          <h1 class='landing-headline'>Bán hàng gọn nhẹ.<br/>Chính xác từng đồng.</h1>
          <p class='landing-lead'>Thu ngân một chạm, kiểm soát tồn kho, sổ quỹ và công nợ trên máy tính lẫn điện thoại Android.</p>
          <div class='landing-hero-cta'>
            <button type='button' class='btn btn-primary' data-action='landing-focus-auth' data-mode='register'>Bắt đầu miễn phí</button>
            <a class='btn btn-secondary' href='#landing-android'>Tải bản Android</a>
          </div>
          ${S.fn.renderLandingStage()}
        </div>
        <div class='landing-hero-auth' id='auth-card-anchor'>
          ${authCardHtml}
        </div>
      </div>

      <section class='landing-bento' id='landing-features' aria-label='Điểm nổi bật'>
        <article class='landing-bento-card ${revealClass}'>
          <span class='landing-bento-icon'>${S.fn.icon('cart', 20)}</span>
          <h2>Thu ngân một chạm</h2>
          <p>Quét mã vạch, tách nhiều hóa đơn song song và loa đọc tiền tự động ngay khi thu.</p>
        </article>
        <article class='landing-bento-card ${revealClass}'>
          <span class='landing-bento-icon'>${S.fn.icon('layers', 20)}</span>
          <h2>Tồn kho &amp; giá vốn tức thì</h2>
          <p>Nhập hàng, kiểm kho nhanh và giữ tồn tối thiểu chính xác theo từng điểm bán.</p>
        </article>
        <article class='landing-bento-card ${revealClass}'>
          <span class='landing-bento-icon'>${S.fn.icon('wallet', 20)}</span>
          <h2>Sổ quỹ &amp; công nợ minh bạch</h2>
          <p>Tách bạch tiền mặt, chuyển khoản và công nợ; giữ chứng từ an toàn ngay cả khi mất mạng.</p>
        </article>
      </section>

      <section class='landing-android-card ${revealClass}' id='landing-android' aria-label='Ứng dụng Android'>
        <div class='landing-android-copy'>
          <span class='landing-eyebrow'>Ứng dụng di động</span>
          <h2>Slink cho Android. Mở thẳng vào quầy thu ngân.</h2>
          <div class='landing-android-pills'>
            <span>In hóa đơn Bluetooth</span>
            <span>Quét mã bằng camera</span>
            <span>Cập nhật trong ứng dụng</span>
          </div>
        </div>
        <div class='landing-android-cta'>
          <a class='btn btn-primary' href='https://github.com/huynhbao2024bm-a11y/Slink/releases/latest/download/Slink.apk' rel='noopener noreferrer'>Tải Slink Android (.apk)</a>
        </div>
      </section>

      <footer class='landing-footer'>
        <span>Slink · Quản lý bán hàng</span>
        <div class='landing-footer-links'>
          <button type='button' class='link-button' data-action='open-legal' data-kind='terms'>Điều khoản</button>
          <button type='button' class='link-button' data-action='open-legal' data-kind='privacy'>Bảo mật</button>
        </div>
      </footer>
    </div>`;
  };

  S.fn.renderAndroidAuthWelcome = function renderAndroidAuthWelcome(authCardHtml) {
    return `<div class='auth-android-shell'>${authCardHtml}</div>`;
  };

  S.fn.setupLandingInteractions = function setupLandingInteractions() {
    const items = Array.from(S.dom.authRoot.querySelectorAll('.landing-reveal'));
    if (!items.length) return;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || S.state.landingRevealedOnce || typeof window.IntersectionObserver !== 'function') {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      S.state.landingRevealedOnce = true;
      return;
    }
    const observer = new window.IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    items.forEach(function (el) { observer.observe(el); });
    window.setTimeout(function () {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      S.state.landingRevealedOnce = true;
    }, 350);
  };

  S.fn.handleLandingAction = function handleLandingAction(action, button) {
    if (action === 'landing-demo-tab') {
      const nextTab = button.dataset.tab || 'pos';
      S.state.landingDemoTab = nextTab;
      S.state.landingRevealedOnce = true;
      const preview = document.getElementById('landing-preview');
      if (preview) {
        preview.outerHTML = S.fn.renderLandingStage();
        document.querySelector(`#landing-preview [data-action='landing-demo-tab'][data-tab='${nextTab}']`)?.focus({ preventScroll: true });
      }
      return true;
    }
    if (action === 'landing-demo-add') {
      const id = button.dataset.id || '';
      if (id) {
        const cur = Number(S.state.landingDemoCart[id] || 0);
        S.state.landingDemoCart[id] = cur >= 5 ? 0 : cur + 1;
        S.state.landingRevealedOnce = true;
        const preview = document.getElementById('landing-preview');
        if (preview) {
          preview.outerHTML = S.fn.renderLandingStage();
          document.querySelector(`#landing-preview [data-action='landing-demo-add'][data-id='${id}']`)?.focus({ preventScroll: true });
        }
      }
      return true;
    }
    if (action === 'landing-focus-auth') {
      const mode = button.dataset.mode === 'register' ? 'register' : 'login';
      S.state.landingRevealedOnce = true;
      S.state.authMode = mode;
      S.fn.renderAuth();
      const anchor = document.getElementById('auth-card-anchor');
      if (anchor && anchor.scrollIntoView) {
        const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        anchor.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      }
      const firstInput = document.querySelector('#auth-card-anchor input:not([type="hidden"])');
      if (firstInput) firstInput.focus({ preventScroll: true });
      return true;
    }
    return false;
  };
})(window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {}, charts: {} });
