/* Replyvoo admin: boot, login (VooSquare or owner password), 2-step code, staff join page, and the app shell.
   The menu only shows the pages this staff member can open; pages they can only view are shown read-only. */
(function () {
  'use strict';
  const RV = window.RV, { $, esc, ic } = RV;

  // [page id, label, icon, section that controls access]
  const NAV = [
    ['', [['overview', 'Overview', 'home', 'overview']]],
    ['Support', [['support', 'Support desk', 'inbox', 'support']]],
    ['Pricing', [['plans', 'Plans', 'tag', 'pricing'], ['packs', 'Credit packs', 'coins', 'pricing'], ['powerups', 'Power-ups', 'bolt', 'pricing'], ['coupons', 'Coupons', 'ticket', 'pricing']]],
    ['Website', [['homepage', 'Homepage', 'layout', 'website'], ['channels', 'Channels & features', 'toggle', 'website'], ['company', 'Company & SEO', 'building', 'website'], ['blog', 'Blog', 'pen', 'website'], ['legal', 'Legal pages', 'doc', 'website']]],
    ['Business', [['users', 'Users & workspaces', 'users', 'users'], ['orders', 'Orders', 'cart', 'orders'], ['billing', 'Billing rules', 'card', 'pricing'], ['connections', 'Connections', 'link', 'staff']]],
    ['Messages', [['emails', 'Emails', 'mail', 'emails'], ['activity', 'Activity', 'pulse', 'activity']]],
    ['Team', [['staff', 'Staff & access', 'shield', 'staff']]]
  ];
  const SECTION_OF = Object.fromEntries(NAV.flatMap(([, items]) => items.map(it => [it[0], it[3]])));
  const LV = { none: 0, view: 1, edit: 2 };
  RV.can = (section, level = 'view') => !!(RV.staff && LV[RV.staff.perms[section]] >= LV[level]);
  RV.canPage = id => RV.can(SECTION_OF[id] || 'staff');
  const visibleNav = () => NAV.map(([h, items]) => [h, items.filter(it => RV.canPage(it[0]))]).filter(([, items]) => items.length);
  const label = name => { for (const [, items] of NAV) for (const it of items) if (it[0] === name) return it[1]; return 'Admin'; };
  RV.label = label;

  const loginArt = '<svg width="150" height="120" viewBox="0 0 150 120" aria-hidden="true"><ellipse cx="75" cy="112" rx="46" ry="6" fill="#EEEBE2"/><g class="float"><rect x="38" y="30" width="74" height="62" rx="22" fill="#121110"/><rect x="48" y="44" width="54" height="30" rx="14" fill="#1E1C19"/><circle cx="63" cy="59" r="5" fill="#FFC21A"/><circle cx="87" cy="59" r="5" fill="#FFC21A"/><path d="M68 80q7 5 14 0" stroke="#FFC21A" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="72" y="16" width="6" height="16" rx="3" fill="#121110"/><circle cx="75" cy="14" r="6" fill="#FFC21A"/><g class="wave"><rect x="108" y="40" width="10" height="30" rx="5" fill="#121110" transform="rotate(-30 113 70)"/></g><rect x="30" y="56" width="10" height="26" rx="5" fill="#121110"/></g><g transform="translate(112 8)"><rect width="34" height="22" rx="11" fill="#FFC21A"/><circle cx="10" cy="11" r="2" fill="#121110"/><circle cx="17" cy="11" r="2" fill="#121110"/><circle cx="24" cy="11" r="2" fill="#121110"/></g></svg>';
  const VOO_MARK = '<svg width="20" height="20" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="avq" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#18C784"/><stop offset="1" stop-color="#067A4A"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#avq)"/><rect x="14" y="14" width="16" height="16" rx="5" fill="#fff"/><rect x="34" y="14" width="16" height="16" rx="5" fill="#C4E8DA"/><rect x="14" y="34" width="16" height="16" rx="5" fill="#C4E8DA"/><rect x="34" y="34" width="16" height="16" rx="5" fill="#C8F55A"/></svg>';
  const card = (inner, cls = '') => '<main class="auth"><div class="auth-card a-rise ' + cls + '">' + inner + '</div></main>';
  const brand = '<div class="logo">' + RV.LOGO + '<span class="logo-word">Replyvoo</span><span class="logo-tag">Admin</span></div>';

  let site = null;
  async function vooOn() { if (!site) { try { site = await RV.get('/api/public/site'); } catch (e) { site = {}; } } return !!(site.voo && site.voo.enabled); }

  /* ---------- login ---------- */
  async function showLogin(msg) {
    const voo = await vooOn();
    const pwForm = '<form class="stack" id="loginForm" novalidate style="gap:14px">' +
      '<div class="f"><label for="lgE">Email</label><input id="lgE" type="email" autocomplete="username" required inputmode="email" placeholder="you@company.com"></div>' +
      '<div class="f"><label for="lgP">Password</label><input id="lgP" type="password" autocomplete="current-password" required placeholder="Your password"></div>' +
      '<button class="btn btn-y btn-w" type="submit" style="min-height:52px;font-size:16px">Log in</button></form>';
    $('#root').innerHTML = card(brand + '<div class="auth-art">' + loginArt + '</div><div><h1>Welcome back, <span class="it">team.</span></h1><p class="mut" style="margin:6px 0 0">' + 'Log in to run support, pricing, the website and everything else.' + '</p></div>' +
      (msg ? '<div class="warn red">' + ic('warn', 18) + '<span>' + esc(msg) + '</span></div>' : '') +
      pwForm +
      (voo ? '<a class="btn btn-voo btn-w" href="/auth/voosquare?return_to=%2Fadmin" style="min-height:52px;font-size:16px">' + VOO_MARK + 'Continue with VooSquare</a>' : '') + '<a class="mut" href="/" style="text-align:center;font-size:13.5px">Back to website</a>');
    const t = $('#pwToggle'); if (t) t.onclick = () => { $('#loginForm').hidden = false; t.hidden = true; $('#lgE').focus(); };
    $('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      if (!RV.validate(e.target)) return;
      const btn = $('button[type=submit]', e.target); btn.disabled = true; btn.textContent = 'Logging in…';
      try { await RV.post('/api/auth/login', { email: $('#lgE').value.trim(), password: $('#lgP').value }); boot(); }
      catch (err) { RV.fail(err); btn.disabled = false; btn.textContent = 'Log in'; }
    });
  }
  function showDenied(email) {
    $('#root').innerHTML = card(brand + '<div class="auth-art">' + loginArt + '</div><h1>Staff only</h1><p class="mut" style="margin:0">You’re logged in as <strong>' + esc(email) + '</strong>, which isn’t on the Replyvoo staff. Ask an owner to invite you.</p><a class="btn btn-y btn-w" href="/app">Go to your dashboard</a><button class="link" id="swAcc">Log in with another account</button>', 'center');
    $('#swAcc').onclick = logout;
  }

  /* ---------- 2-step code ---------- */
  async function showCode(me, msg) {
    $('#root').innerHTML = card(brand +
      '<div class="code-hero"><span class="code-ic">' + ic('lock', 26) + '</span></div><div><h1>Check your <span class="it">email.</span></h1><p class="mut" style="margin:6px 0 0" id="cdTo">We’re sending a 6-digit code to ' + esc(me.user.email) + '. It keeps the admin safe even if a password leaks.</p></div>' +
      (msg ? '<div class="warn red">' + ic('warn', 18) + '<span>' + esc(msg) + '</span></div>' : '') +
      '<form id="cdForm" class="stack" style="gap:14px" novalidate><div class="otp" id="otp">' + Array.from({ length: 6 }, (_, i) => '<input inputmode="numeric" autocomplete="' + (i ? 'off' : 'one-time-code') + '" maxlength="1" aria-label="Digit ' + (i + 1) + '">').join('') + '</div>' +
      '<button class="btn btn-y btn-w" type="submit" id="cdGo" style="min-height:52px;font-size:16px">Verify and continue</button></form>' +
      '<div class="row-c"><button class="link" id="cdAgain" disabled>Send a new code</button><span class="mut2" id="cdTimer"></span></div><button class="link" id="cdOut" style="align-self:center;font-size:13px">Use another account</button>');
    const boxes = [...document.querySelectorAll('#otp input')];
    boxes[0].focus();
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => { b.value = b.value.replace(/\D/g, '').slice(-1); if (b.value && boxes[i + 1]) boxes[i + 1].focus(); if (boxes.every(x => x.value)) $('#cdForm').requestSubmit(); });
      b.addEventListener('keydown', e => { if (e.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus(); });
      b.addEventListener('paste', e => { const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (d.length) { e.preventDefault(); d.split('').forEach((c, j) => { if (boxes[j]) boxes[j].value = c; }); (boxes[d.length] || boxes[5]).focus(); if (d.length === 6) $('#cdForm').requestSubmit(); } });
    });
    let left = 0; let tm = null;
    const tick = () => { left--; $('#cdTimer').textContent = left > 0 ? 'in ' + left + 's' : ''; $('#cdAgain').disabled = left > 0; if (left <= 0) clearInterval(tm); };
    const send = async () => {
      $('#cdAgain').disabled = true;
      try { const r = await RV.post('/api/admin/mfa/send'); $('#cdTo').textContent = 'We sent a 6-digit code to ' + r.sent_to + '. It works for 10 minutes.'; }
      catch (e) { RV.fail(e); }
      left = 30; clearInterval(tm); tm = setInterval(tick, 1000); tick();
    };
    $('#cdAgain').onclick = send;
    $('#cdOut').onclick = logout;
    $('#cdForm').addEventListener('submit', async e => {
      e.preventDefault();
      const code = boxes.map(b => b.value).join('');
      if (code.length !== 6) { boxes.find(b => !b.value).focus(); return; }
      const btn = $('#cdGo'); btn.disabled = true; btn.textContent = 'Checking…';
      try { await RV.post('/api/admin/mfa/verify', { code }); clearInterval(tm); $('#otp').classList.add('ok'); setTimeout(boot, 350); }
      catch (err) { btn.disabled = false; btn.textContent = 'Verify and continue'; $('#otp').classList.remove('shake'); void $('#otp').offsetWidth; $('#otp').classList.add('shake'); boxes.forEach(b => { b.value = ''; }); boxes[0].focus(); RV.fail(err); }
    });
    send();
  }

  /* ---------- join from an invite ---------- */
  async function showJoin() {
    const tok = new URLSearchParams(location.search).get('token') || '';
    let inv;
    try { inv = await RV.get('/api/admin/join?token=' + encodeURIComponent(tok)); }
    catch (e) { $('#root').innerHTML = card(brand + '<div class="auth-art">' + loginArt + '</div><h1>This invite has expired</h1><p class="mut" style="margin:0">' + esc(e.message) + '</p><a class="btn btn-g btn-w" href="/admin">Go to admin login</a>', 'center'); return; }
    let me = null; try { me = (await RV.get('/api/auth/me')).user; } catch (e) { /* not signed in */ }
    const same = me && me.email.toLowerCase() === inv.email.toLowerCase();
    const here = '/admin/join?token=' + encodeURIComponent(tok);
    let body = '';
    if (inv.voo) {
      body = !me ? '<a class="btn btn-voo btn-w" href="/auth/voosquare?return_to=' + encodeURIComponent(here) + '" style="min-height:52px;font-size:16px">' + VOO_MARK + 'Continue with VooSquare</a><p class="mut" style="margin:0;font-size:13.5px;text-align:center">Log in or sign up with <strong>' + esc(inv.email) + '</strong>. You’ll come straight back here.</p>'
        : same ? '<button class="btn btn-y btn-w" id="jnGo" style="min-height:52px;font-size:16px">Join as ' + esc(inv.role_name) + '</button>'
          : '<div class="warn">' + ic('info', 18) + '<span>You’re logged in as ' + esc(me.email) + '. This invite is for ' + esc(inv.email) + '.</span></div><a class="btn btn-g btn-w" href="/auth/voosquare/logout">Log out and switch account</a>';
    } else {
      body = '<form class="stack" id="jnForm" style="gap:14px" novalidate>' + (same ? '' : !inv.has_account ? '<div class="f"><label for="jnN">Your name</label><input id="jnN" autocomplete="name" required maxlength="80" placeholder="Your full name"></div><div class="f"><label for="jnP">Choose a password</label><input id="jnP" type="password" autocomplete="new-password" minlength="10" required placeholder="At least 10 characters"></div>'
        : '<div class="f"><label for="jnP">Password for ' + esc(inv.email) + '</label><input id="jnP" type="password" autocomplete="current-password" required></div>') +
        '<button class="btn btn-y btn-w" type="submit" id="jnGo" style="min-height:52px;font-size:16px">Join as ' + esc(inv.role_name) + '</button></form>';
    }
    $('#root').innerHTML = card(brand + '<div class="join-card"><span class="eyebrow">Staff invite</span><strong>' + esc(inv.role_name) + (inv.title ? ' · ' + esc(inv.title) : '') + '</strong><span>Invited by ' + esc(inv.invited_by) + '</span></div><div><h1>Join the <span class="it">Replyvoo</span> team.</h1><p class="mut" style="margin:6px 0 0">You’ll see the admin pages that fit your role. Owners can change your access at any time.</p></div>' + body);
    const go = async () => {
      const btn = $('#jnGo'); if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }
      try {
        await RV.post('/api/admin/join', { token: tok, name: $('#jnN') ? $('#jnN').value.trim() : '', password: $('#jnP') ? $('#jnP').value : '' });
        history.replaceState({}, '', '/admin/'); RV.toast('Welcome to the team!'); boot();
      } catch (err) { RV.fail(err); if (btn) { btn.disabled = false; btn.textContent = 'Join as ' + inv.role_name; } }
    };
    const f = $('#jnForm'); if (f) f.addEventListener('submit', e => { e.preventDefault(); if (RV.validate(f)) go(); });
    else { const b = $('#jnGo'); if (b) b.onclick = go; }
  }

  async function logout() {
    if (RV.isDirty() && !(await RV.confirm({ title: 'Log out without saving?', text: 'You have unsaved changes.', ok: 'Log out', danger: true }))) return;
    RV.dropPageGuard();
    RV.stopPolls && RV.stopPolls();
    let next = null;
    try { next = (await RV.post('/api/auth/logout')).next; } catch (e) { /* ignore */ }
    RV.user = null; RV.staff = null; RV.cache = {};
    if (next) { location.href = next; return; }
    history.replaceState({}, '', '/admin');
    showLogin();
  }
  RV.onLoggedOut = () => { if (RV.user) { RV.user = null; RV.dropPageGuard(); showLogin('Your session ended. Please log in again.'); } };
  RV.onMfa = () => { if (RV.user) boot(); };

  /* ---------- shell ---------- */
  function shell() {
    const u = RV.user, nav = visibleNav();
    const tabs = ['overview', 'support', 'plans', 'homepage', 'users', 'orders'].filter(id => RV.canPage(id)).slice(0, 4);
    const initials = (u.name || u.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('');
    const icons = Object.fromEntries(NAV.flatMap(([, items]) => items.map(it => [it[0], it[2]])));
    const navHtml = nav.map(([h, items]) => (h ? '<div class="nav-h">' + h + '</div>' : '') + items.map(([id, l, i]) => '<a href="/admin/' + (id === 'overview' ? '' : id) + '" data-id="' + id + '">' + ic(i, 19) + '<span>' + l + '</span>' + (id === 'orders' ? '<span class="badge" data-pend hidden></span>' : id === 'support' ? '<span class="badge sup" data-sup hidden></span>' : '') + '</a>').join('')).join('');
    $('#root').innerHTML =
      '<div class="shell"><aside class="side" aria-label="Admin navigation"><a class="logo" href="/admin/">' + RV.LOGO + '<span class="logo-word">Replyvoo</span><span class="logo-tag">Admin</span></a><nav class="nav">' + navHtml + '</nav>' +
      '<div class="side-foot"><a class="btn btn-g btn-sm" href="/" target="_blank" rel="noopener">' + ic('ext', 16) + 'View website</a><div class="me"><span class="me-av">' + esc(initials) + '</span><span class="me-t"><strong>' + esc(u.name || 'Admin') + '</strong><span>' + esc(RV.staff.role_name + (RV.staff.title ? ' · ' + RV.staff.title : '')) + '</span></span><button class="ib ghost" data-logout aria-label="Log out" title="Log out" style="margin-left:auto">' + ic('out', 18) + '</button></div></div></aside>' +
      '<header class="top"><a class="logo" href="/admin/" aria-label="Admin home">' + RV.LOGO + '</a><span class="top-title" id="topTitle"></span><span style="display:flex;gap:6px"><a class="ib" href="/" target="_blank" rel="noopener" aria-label="View website">' + ic('ext', 18) + '</a><button class="ib" data-logout aria-label="Log out">' + ic('out', 18) + '</button></span></header>' +
      '<main class="main" id="main" tabindex="-1"></main>' +
      '<nav class="tabs" aria-label="Sections">' + tabs.map(id => '<a class="tab" href="/admin/' + (id === 'overview' ? '' : id) + '" data-id="' + id + '"><span class="ti">' + ic(icons[id], 20) + '</span>' + label(id).replace('Users & workspaces', 'Users').replace('Support desk', 'Support') + (id === 'support' ? '<span class="badge sup" data-sup hidden></span>' : '') + '</a>').join('') + '<button class="tab" id="moreBtn" aria-label="More sections"><span class="ti">' + ic('grid', 20) + '</span>More<span class="badge" data-pend hidden></span></button></nav></div>';
    RV.tabIds = tabs;
    document.querySelectorAll('[data-logout]').forEach(b => b.onclick = logout);
    $('#moreBtn').onclick = openMore;
  }
  function openMore() {
    const cur = RV.path().name;
    const all = visibleNav().flatMap(([, items]) => items);
    const s = RV.sheet({ title: 'All sections', noFooter: true, body: '<div class="more">' + all.map(([id, l, i]) => '<a href="/admin/' + (id === 'overview' ? '' : id) + '" class="' + (id === cur ? 'on' : '') + '"><span class="ico">' + ic(i, 20) + '</span>' + l + '</a>').join('') + '</div><button class="btn btn-g btn-w" data-lo>' + ic('out', 18) + 'Log out</button>' });
    s.body.addEventListener('click', e => { if (e.target.closest('[data-lo]')) { s.close(true); logout(); } else if (e.target.closest('a')) s.close(true); });
  }
  RV.setPending = n => document.querySelectorAll('[data-pend]').forEach(b => { b.hidden = !n; b.textContent = n; });
  RV.setSupport = n => document.querySelectorAll('[data-sup]').forEach(b => { b.hidden = !n; b.textContent = n > 99 ? '99+' : n; });

  // Unread support tickets in the menu, refreshed in the background.
  let supTimer = null;
  function pollSupport() {
    clearInterval(supTimer);
    if (!RV.can('support')) return;
    const run = () => { if (document.hidden) return; RV.get('/api/admin/support/poll').then(r => { RV.setSupport(r.counts.unread); RV.supportLatest = r.latest; }).catch(() => {}); };
    run(); supTimer = setInterval(run, 20000);
  }
  RV.stopPolls = () => { clearInterval(supTimer); };

  let renderSeq = 0;
  RV.render = async function () {
    if (!RV.user || !$('#main')) return;
    const { name, arg } = RV.path();
    let r = RV.routes[name] ? name : 'overview';
    // Support agents start on their desk.
    if (!location.pathname.replace(/^\/admin\/?/, '') && RV.staff.role === 'support' && RV.canPage('support')) r = 'support';
    if (!RV.canPage(r)) r = visibleNav()[0][1][0][0];
    RV.dropPageGuard();
    RV.current = location.pathname;
    const main = $('#main');
    document.querySelectorAll('.nav a, .tab[data-id]').forEach(a => { const on = a.dataset.id === r; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const mb = $('#moreBtn'); if (mb) mb.classList.toggle('on', !(RV.tabIds || []).includes(r));
    $('#topTitle').textContent = label(r);
    document.title = label(r) + ' | Replyvoo Admin';
    main.classList.toggle('wide', r === 'support');
    const seq = ++renderSeq;
    const readOnly = r !== 'overview' && !RV.can(SECTION_OF[r] || 'staff', 'edit');
    const page = document.createElement('div'); page.className = 'page' + (readOnly ? ' ro' : ''); page.innerHTML = RV.loadingHTML;
    main.innerHTML = ''; main.appendChild(page);
    window.scrollTo(0, 0);
    try {
      await RV.routes[r].render(page, arg, () => seq !== renderSeq);
      if (readOnly && seq === renderSeq) page.insertAdjacentHTML('afterbegin', '<div class="ro-note">' + ic('eye', 16) + '<span>View only. Ask an owner if you need to make changes here.</span></div>');
    } catch (e) {
      if (seq !== renderSeq) return;
      console.warn('[admin]', e);
      page.innerHTML = RV.errorHTML(e);
      const b = page.querySelector('[data-retry]'); if (b) b.onclick = () => RV.render();
    }
  };

  async function boot() {
    if (/^\/admin\/join\/?$/.test(location.pathname)) return showJoin();
    let me = null;
    try { me = await RV.get('/api/admin/me'); }
    catch (e) {
      if (e.status === 401 || !e.status) return showLogin();
      if (e.status === 403) { let u = null; try { u = (await RV.get('/api/auth/me')).user; } catch (x) { /* ignore */ } return u ? showDenied(u.email) : showLogin(); }
      return showLogin(e.message);
    }
    RV.user = me.user; RV.staff = me.staff; RV.sections = me.sections;
    if (me.mfa_required) return showCode(me);
    shell();
    RV.render();
    pollSupport();
    if (RV.can('overview')) RV.get('/api/admin/overview').then(o => { RV.cache.overview = o; RV.setPending(o.orders_pending); }).catch(() => {});
  }
  boot();
})();
