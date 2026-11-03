/* Replyvoo dashboard: boot + page dispatcher. Pages register themselves with RV.route(name, {render, flag}). */
(function () {
  'use strict';
  const RV = window.RV;
  const { $, go } = RV;
  const S = RV.S;
  const AUTH = ['signup', 'login', 'forgot', 'reset', 'verify', 'invite', 'welcome'];
  let seq = 0, booted = false;

  RV.onUnauthorized = () => {
    if (!S.me) return;
    S.me = null; S.boot = null; RV.stopPolling();
    const ar = $('appRoot'); if (ar) ar.remove();
    go('/app/login?next=' + encodeURIComponent(location.pathname + location.search), { replace: true });
  };

  function allowed(name) {
    const d = RV.routes[name]; if (!d) return false;
    if (d.flag && !RV.flag(d.flag)) return false;
    if (d.when && !d.when()) return false;
    return true;
  }

  function skeleton() {
    return '<div class="dgrid" aria-busy="true"><div class="c8 sk" style="height:220px;border-radius:28px"></div><div class="c4 sk" style="height:220px;border-radius:24px"></div>' +
      '<div class="c3 sk" style="height:120px"></div><div class="c3 sk" style="height:120px"></div><div class="c3 sk" style="height:120px"></div><div class="c3 sk" style="height:120px"></div><div class="c12 sk" style="height:260px"></div></div>';
  }

  async function render(opts) {
    opts = opts || {};
    const r = RV.parse(), root = $('root');
    const my = ++seq;
    RV.clearLive(); if (RV.closePops) RV.closePops();
    if (!opts.keepModal && !S.watching) RV.closeModal();
    if (r.name === 'auth') { go('/app/login', { replace: true }); return; }
    if (AUTH.includes(r.name)) {
      if (!booted) { booted = true; try { await RV.loadMe(); } catch (e) { /* offline */ } }
      if (my !== seq) return;
      if (S.me && (r.name === 'login' || r.name === 'forgot' || (r.name === 'signup' && !RV.signupDone()))) {
        go(r.query.next && /^\/app/.test(r.query.next) ? r.query.next : '/app', { replace: true }); return;
      }
      if (r.name === 'welcome' && !S.me) { go('/app/login', { replace: true }); return; }
      if (r.name === 'welcome' && !S.boot) { try { await RV.loadBoot(); } catch (e) { /* the page still works without it */ } }
      RV.stopPolling();
      const ar = $('appRoot'); if (ar) ar.remove();
      document.title = ({ welcome: 'Set up your workspace', signup: 'Create your account', login: 'Log in', forgot: 'Reset your password', reset: 'Choose a new password', verify: 'Verify your email', invite: 'Join your team' })[r.name] + ' | Replyvoo';
      await RV.authPages[r.name](root, r.query);
      return;
    }
    if (!booted) { booted = true; try { await RV.loadMe(); } catch (e) { /* offline */ } }
    if (r.name === 'start') {
      // First-run setup: full screen, no menu, until it's done.
      if (!S.me) { go('/app/signup', { replace: true }); return; }
      if (!S.boot) { try { await RV.loadBoot(); } catch (e) { root.innerHTML = '<div class="boot"><div class="col" style="align-items:center;text-align:center;padding:20px"><strong class="h3">We couldn’t load your setup</strong><p class="muted">' + RV.esc(e.message) + '</p><button class="btn btn-ink" data-reload type="button">Try again</button></div></div>'; return; } }
      if (my !== seq) return;
      if (!RV.needsSetup()) { go('/app', { replace: true }); return; }
      RV.stopPolling();
      const ar = $('appRoot'); if (ar) ar.remove();
      await RV.setupPage(root, r.query);
      return;
    }
    if (!S.me) { go('/app/login' + (r.path !== '/app' ? '?next=' + encodeURIComponent(r.path + location.search) : ''), { replace: true }); return; }
    if (!S.boot) {
      try { await RV.loadBoot(); }
      catch (e) {
        if (e.status === 403) { root.innerHTML = '<div class="boot"><div class="col" style="align-items:center;text-align:center;max-width:420px;padding:20px">' + RV.waitingArt(200) + '<strong class="h3">' + RV.esc(e.message) + '</strong><p class="muted">If you think this is a mistake, contact support.</p><button class="btn btn-ink" id="lo">Log out</button></div></div>'; $('lo').onclick = RV.logout; return; }
        root.innerHTML = '<div class="boot"><div class="col" style="align-items:center;text-align:center;padding:20px">' + RV.waitingArt(200) + '<strong class="h3">We couldn’t load your dashboard</strong><p class="muted">' + RV.esc(e.message) + '</p><button class="btn btn-ink" data-reload type="button">Try again</button></div></div>'; return;
      }
      RV.loadClosers().then(() => RV.paintChrome()).catch(() => {});
    }
    if (my !== seq) return;
    // New accounts finish the 4-step setup first (one main button per screen, no menu).
    if (RV.needsSetup && RV.needsSetup()) { go('/app/start', { replace: true }); return; }
    RV.shell(root);
    if (!RV.pollingStarted) { RV.pollingStarted = true; RV.startPolling(); if (RV.checkHelp) { RV.checkHelp(); setInterval(() => { if (!document.hidden) RV.checkHelp(); }, 120000); } if (r.query.help === '1' && RV.openHelp) setTimeout(() => RV.openHelp(), 400); }
    let name = r.name;
    if (!allowed(name)) {
      if (!RV.routes[name] || name === 'home') name = 'home';
      else { const d = RV.routes[name]; RV.toast(d.flag && !RV.flag(d.flag) ? 'That page is switched off right now.' : 'Only owners and admins can open that page.', 'info'); go('/app', { replace: true }); return; }
      if (r.name !== 'home' && !RV.routes[r.name]) { go('/app', { replace: true }); return; }
    }
    RV.paintChrome();
    const el = $('page');
    if (!opts.soft) el.innerHTML = skeleton();
    const ctx = { el, q: r.query, ok: () => my === seq, soft: !!opts.soft };
    try { await RV.routes[name].render(ctx); }
    catch (e) {
      if (my !== seq) return;
      if (e.status === 401) return;
      el.innerHTML = RV.empty('This page didn’t load', e.message || 'Please try again.', '<button class="btn btn-ink" id="retry">Try again</button>');
      const b = $('retry'); if (b) b.onclick = () => render();
    }
    if (r.query.order && my === seq) RV.watchOrder(r.query.order);
  }
  RV.render = render;
  RV.rerender = () => render({ soft: true, keepModal: true });
  RV.pollingStarted = false;
  const _stop = RV.stopPolling;
  RV.stopPolling = function () { RV.pollingStarted = false; _stop(); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => render());
  else render();
})();
// "Try again" buttons on the error screens (no inline handlers: the page runs under a strict CSP).
document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-reload]')) location.reload(); });
