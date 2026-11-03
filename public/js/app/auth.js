/* Replyvoo dashboard: sign up, log in, password reset, email verification, team invites. */
(function () {
  'use strict';
  const RV = window.RV;
  const { $, esc, first, POST, GET, toast, go } = RV;
  const S = RV.S;

  const NICHES = [['E-commerce', 'Shops, orders, delivery', '#FFC21A'], ['Coaching and courses', 'Programs, cohorts, mentors', '#8FB8FF'], ['Trading and finance', 'Academies, brokers, education', '#7EE0B0'], ['iGaming', 'Sportsbooks, casinos', '#C9A7FF'], ['Real estate', 'Listings, viewings', '#FFB199'], ['Beauty and fashion', 'Products, bookings', '#FF9FC3'], ['Services', 'Bookings, quotes, support', '#FFE07A'], ['Something else', 'We’ll keep it general', '#CFC9BB']];
  RV.NICHES = NICHES;

  const su = { name: '', email: '', password: '', business: '', moji: { gender: 'other', skin: 2, hair: 0, glasses: false, beard: false, earrings: false }, showPass: false, err: '', busy: false, done: false };
  let site = null;
  async function loadSite() { if (site) return site; try { site = await GET('/api/public/site'); } catch (e) { site = { features: { signup: true }, plans: [] }; } return site; }

  // VooSquare: "Continue with VooSquare" (one Voo ID for every Zedapex tool) NEXT TO Replyvoo's own email login.
  const vooOn = () => !!(site && site.voo && site.voo.enabled);
  function vooHref(q, signup) {
    const p = new URLSearchParams();
    const next = q && q.next && /^\/app/.test(q.next) ? q.next : (q && q.plan ? '/app/plan?checkout=' + encodeURIComponent(q.plan) + '&interval=' + (q.interval === 'year' ? 'year' : 'month') : '/app');
    p.set('return_to', next);
    if (signup) p.set('signup', '1');
    return '/auth/voosquare?' + p;
  }
  const vooBtn = (q, signup) => vooOn() ? '<div class="row" style="gap:12px;color:var(--mut);font-size:13px;font-weight:700"><span style="flex:1;height:1px;background:var(--line)"></span>or<span style="flex:1;height:1px;background:var(--line)"></span></div><a class="btn btn-voo" id="vooGo" href="' + esc(vooHref(q, signup)) + '" style="padding:15px;font-size:16px;justify-content:center;gap:10px">' + RV.vooMark(20) + 'Continue with VooSquare</a>' : '';

  function frame(mode, body, side) {
    return '<div class="su">' +
      '<aside class="su-side" aria-hidden="true"><div class="mesh a-mesh" style="width:520px;height:520px;right:-180px;top:-160px;background:#FFC21A;opacity:.35"></div><div class="mesh a-mesh2" style="width:380px;height:380px;left:-160px;bottom:-120px;background:#FFE58A;opacity:.25"></div>' +
      '<a class="logo" href="/" style="position:relative;color:#FFFFFF">' + RV.LOGO + '<span class="logo-word">Replyvoo</span></a>' +
      '<div style="position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px">' +
      '<div class="su-bubble a-pop" id="suBubble">' + side.bubble + '</div>' +
      '<div class="su-big a-float" id="suBig">' + side.art + '</div>' +
      '<div class="col" style="align-items:center;gap:2px"><strong id="suName" style="font-size:22px;letter-spacing:-0.03em">' + esc(side.name) + '</strong><span style="font-size:14px;font-weight:600;color:var(--jade)">' + esc(side.note) + '</span></div></div>' +
      '<div class="su-tip">' + RV.ic('M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z', '#FFC21A', 22, 2.2) + '<span>' + esc(side.tip) + '</span></div></aside>' +
      '<main class="su-main" id="main"><div class="su-inner">' +
      '<div class="row" style="justify-content:space-between"><a class="logo show-sm" href="/" aria-label="Replyvoo website">' + RV.LOGO + '<span class="logo-word">Replyvoo</span></a>' + (mode.top || '') + '</div>' +
      body + '</div></main></div>';
  }
  const H = (t, s) => '<div class="col" style="gap:8px"><h1 class="su-h">' + t + '</h1>' + (s ? '<p style="margin:0;color:var(--mut);font-size:16.5px">' + s + '</p>' : '') + '</div>';
  const pw = (id, ph, ac) => '<div class="field"><label class="lbl" for="' + id + '">Password</label><div class="pw-wrap"><input id="' + id + '" class="input" type="password" placeholder="' + (ph || 'At least 8 characters') + '" autocomplete="' + (ac || 'new-password') + '" minlength="8" required><button type="button" class="pw-btn" data-pw="' + id + '">Show</button></div></div>';
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pw]'); if (!b) return;
    const i = $(b.getAttribute('data-pw')); if (!i) return;
    i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? 'Show' : 'Hide';
  });
  const errBox = msg => msg ? '<div class="err a-in" role="alert">' + esc(msg) + '</div>' : '';
  const mojiSide = (m, happy) => RV.moji(m, 290, true, happy);

  /* ---------- sign up (step 1 of 4; steps 2–4 are the first-run setup in setup.js) ---------- */
  async function renderSignup(root, q, welcome) {
    await loadSite();
    if (welcome && !su.voo) { su.voo = true; su.name = (RV.S.me && RV.S.me.name) || ''; su.business = (RV.S.boot && RV.S.boot.workspace && RV.S.boot.workspace.name) || ''; su.next = q.next && /^\/app/.test(q.next) ? q.next : ''; }
    if (q.invite) su.ref = q.invite; // Voo Squad code (own parameter: ?ref= belongs to VooSquare affiliates)
    if (q.plan) su.plan = q.plan;
    if (q.interval) su.interval = q.interval;
    if (site.features && site.features.signup === false && !su.done) {
      root.innerHTML = frame({}, '<div class="col a-in" style="gap:18px;padding-top:30px">' + RV.waitingArt(200) + H('Sign-ups are paused', 'We’re making room for new shops. Please check back soon, or log in if you already have an account.') + '<a class="btn btn-ink" href="/app/login" style="padding:16px">Log in</a><a class="btn btn-ghost" href="/">Back to website</a></div>',
        { bubble: 'Back very soon!', art: mojiSide(su.moji, false), name: 'Hello there', note: 'Sign-ups paused', tip: 'Already have an account? You can log in as normal.' });
      return;
    }
    const top = '<span style="font-size:14px;font-weight:700;color:var(--mut)">Step 1 of 4</span>';
    const bars = '<div class="su-bars" aria-hidden="true" style="grid-template-columns:repeat(4,minmax(0,1fr))"><span class="cur"></span><span></span><span></span><span></span></div>';
    const shop = '<div class="field"><label class="lbl" for="suBiz">Shop name</label><input id="suBiz" class="input" placeholder="e.g. Petal & Stem" value="' + esc(su.business) + '" maxlength="80" autocomplete="organization"></div>';
    let body;
    if (su.voo) {
      body = '<form class="col a-in" id="suForm" style="gap:16px" novalidate><span class="voo-chip">' + RV.vooMark(16) + 'Signed in with your Voo ID</span>' + H('Welcome' + (first(su.name) ? ', ' + esc(first(su.name)) : '') + '! What is your shop called?', 'Your AI helper uses this name with customers.') + errBox(su.err) + shop +
        '<div class="su-act"><button class="btn btn-ink" type="submit" id="suCreate" style="padding:17px;font-size:17px;width:100%">Next</button></div></form>';
    } else {
      body = '<form class="col a-in" id="suForm" style="gap:14px" novalidate>' + H('Let’s make your AI helper', 'It answers your customers for you. Free to start.') + errBox(su.err) +
        '<div class="field"><label class="lbl" for="suNameIn">Your name</label><input id="suNameIn" class="input" autocomplete="name" placeholder="Your name" value="' + esc(su.name) + '" maxlength="80"></div>' +
        '<div class="field"><label class="lbl" for="suEmail">Email</label><input id="suEmail" class="input" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="' + esc(su.email) + '"></div>' +
        pw('suPass') + shop +
        '<div class="su-act"><button class="btn btn-ink" type="submit" id="suCreate" style="padding:17px;font-size:17px;width:100%">Next</button></div>' + vooBtn(q, true) +
        '<p style="margin:0;text-align:center;font-size:13.5px;color:var(--mut)">Already have an account? <a href="/app/login' + (q.next ? '?next=' + encodeURIComponent(q.next) : '') + '" style="font-weight:800">Log in</a><br>By going on you agree to the <a href="/legal/terms">Terms</a> and <a href="/legal/privacy">Privacy Policy</a>.</p></form>';
    }
    const side = { bubble: 'Hi! Let’s get you set up.', art: mojiSide(su.moji, false), name: first(su.name) || 'Hello there', note: 'Your future AI helper', tip: 'Free to start. No card needed.' };
    root.innerHTML = frame({ top }, bars + body, side);
    $('suForm').addEventListener('submit', onSignupSubmit);
    const nm = $('suNameIn');
    if (nm) nm.addEventListener('input', () => { su.name = nm.value; const s = $('suName'); if (s) s.textContent = first(su.name) || 'Hello there'; });
  }
  async function onSignupSubmit(e) {
    e.preventDefault();
    su.err = '';
    const btn = $('suCreate');
    su.business = ($('suBiz').value || '').trim();
    const afterSetup = () => { if (su.plan) RV.store.set('after_setup', '/app/plan?checkout=' + encodeURIComponent(su.plan) + '&interval=' + (su.interval === 'year' ? 'year' : 'month')); else if (su.next && su.next !== '/app') RV.store.set('after_setup', su.next); };
    if (su.voo) {
      RV.busy(btn, true, 'Saving…');
      try { await POST('/api/auth/onboard', { business: su.business }); su.done = true; afterSetup(); RV.S.boot = null; RV.S.me = null; await RV.loadMe(); go('/app/start', { replace: true }); }
      catch (er) { RV.busy(btn, false); su.err = er.message; RV.render(); }
      return;
    }
    su.name = $('suNameIn').value.trim(); su.email = $('suEmail').value.trim(); su.password = $('suPass').value;
    if (!su.name) su.err = 'Please type your name.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(su.email)) su.err = 'This email looks wrong. Check for a typo, like a missing @.';
    else if (su.password.length < 8) su.err = 'Password needs 8 or more letters or numbers.';
    if (su.err) { RV.render(); return; }
    RV.busy(btn, true, 'Making your account…');
    try {
      await POST('/api/auth/signup', { name: su.name, email: su.email, password: su.password, business: su.business, ref: su.ref || '' });
      su.done = true; su.password = ''; afterSetup();
      RV.S.boot = null; RV.S.me = null;
      await RV.loadMe();
      go('/app/start', { replace: true });
    } catch (er) {
      RV.busy(btn, false);
      su.err = er.status === 409 ? 'This email already has an account. Tap “Log in” below.' : er.message; RV.render();
    }
  }

  /* ---------- log in ---------- */
  function sideLogin(bubble, tip) { return { bubble: bubble || 'Welcome back! Your AI kept working.', art: mojiSide({ gender: 'female', skin: 3, hair: 0, earrings: true }, false), name: 'Juno says hi', note: 'Your helper never sleeps', tip: tip || 'Turn on the daily summary email to get your day in one message every evening.' }; }
  async function renderLogin(root, q) {
    await loadSite();
    root.innerHTML = frame({ top: '<a href="/" class="small" style="font-weight:700;color:var(--mut);text-decoration:none">Website</a>' },
      '<form class="col a-in" id="liForm" style="gap:16px" novalidate>' + H('Welcome back', 'Your AI helper kept answering while you were away.') + (q.reset === 'ok' ? '<div class="ok-box">Password updated. Log in with your new password.</div>' : '') + '<div id="liErr"></div>' +
      '<div class="field"><label class="lbl" for="liEmail">Email</label><input id="liEmail" class="input" type="email" placeholder="you@business.com" autocomplete="email" required value="' + esc(q.email || '') + '"></div>' +
      pw('liPass', 'Your password', 'current-password') +
      '<div class="row" style="justify-content:flex-end;margin-top:-6px"><a href="/app/forgot" class="small" style="font-weight:700">Forgot password?</a></div>' +
      '<button class="btn btn-ink" type="submit" id="liBtn" style="padding:17px;font-size:17px">Log in</button>' + vooBtn(q, false) +
      '<p style="margin:0;text-align:center;font-size:14px;color:var(--mut)">New here? <a href="/app/signup" style="font-weight:800">Create an account</a></p></form>', sideLogin());
    $('liForm').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('liBtn'); RV.busy(btn, true, 'Logging in…'); $('liErr').innerHTML = '';
      try {
        await POST('/api/auth/login', { email: $('liEmail').value.trim(), password: $('liPass').value });
        RV.S.boot = null; RV.S.me = null; await RV.loadMe();
        const next = q.next && /^\/app(\/|$|\?)/.test(q.next) && !/^\/app\/(login|signup)/.test(q.next) ? q.next : '/app';
        go(next, { replace: true });
      } catch (er) { RV.busy(btn, false); $('liErr').innerHTML = errBox(er.message); }
    });
  }

  async function renderForgot(root, q) {
    await loadSite();
    root.innerHTML = frame({ top: '<a href="/app/login" class="small" style="font-weight:700;color:var(--mut);text-decoration:none">Back to log in</a>' },
      '<form class="col a-in" id="fgForm" style="gap:16px" novalidate>' + H('Forgot your password?', 'Enter your email and we’ll send you a reset link. It works for one hour.') + '<div id="fgMsg"></div>' +
      '<div class="field"><label class="lbl" for="fgEmail">Email</label><input id="fgEmail" class="input" type="email" autocomplete="email" placeholder="you@business.com" required></div>' +
      '<button class="btn btn-ink" type="submit" id="fgBtn" style="padding:17px;font-size:17px">Send reset link</button><p style="margin:0;text-align:center;font-size:14px;color:var(--mut)">Remembered it? <a href="/app/login" style="font-weight:800">Log in</a></p></form>', sideLogin('No stress. Happens to everyone.', 'Use a password manager so you never lose it again.'));
    $('fgForm').addEventListener('submit', async e => {
      e.preventDefault();
      const em = $('fgEmail').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { $('fgMsg').innerHTML = errBox('This email looks wrong. Check for a typo, like a missing @.'); return; }
      const btn = $('fgBtn'); RV.busy(btn, true, 'Sending…');
      try { await POST('/api/auth/forgot', { email: em }); $('fgMsg').innerHTML = '<div class="ok-box a-in">If an account exists for ' + esc(em) + ', a reset link is on its way. Check your inbox and spam folder.</div>'; RV.busy(btn, false); btn.textContent = 'Send again'; }
      catch (er) { RV.busy(btn, false); $('fgMsg').innerHTML = errBox(er.message); }
    });
  }

  async function renderReset(root, q) {
    await loadSite();
    if (!q.token) { root.innerHTML = frame({}, '<div class="col a-in" style="gap:16px">' + H('This link is incomplete', 'Open the reset link from your email again, or ask for a new one.') + '<a class="btn btn-ink" href="/app/forgot" style="padding:16px">Get a new link</a></div>', sideLogin('Hmm, that link looks cut off.')); return; }
    root.innerHTML = frame({}, '<form class="col a-in" id="rsForm" style="gap:16px" novalidate>' + H('Choose a new password', 'Make it at least 8 characters. You’ll be logged in right after.') + '<div id="rsMsg"></div>' + pw('rsPass') +
      '<button class="btn btn-ink" type="submit" id="rsBtn" style="padding:17px;font-size:17px">Save and log in</button></form>', sideLogin('Fresh start. Pick something strong.'));
    $('rsForm').addEventListener('submit', async e => {
      e.preventDefault();
      const p = $('rsPass').value;
      if (p.length < 8) { $('rsMsg').innerHTML = errBox('Your password needs at least 8 characters.'); return; }
      const btn = $('rsBtn'); RV.busy(btn, true, 'Saving…');
      try { await POST('/api/auth/reset', { token: q.token, password: p }); RV.S.boot = null; RV.S.me = null; await RV.loadMe(); toast('Password updated. Welcome back!'); go('/app', { replace: true }); }
      catch (er) { RV.busy(btn, false); $('rsMsg').innerHTML = errBox(er.message) + '<a class="btn btn-ghost btn-sm" href="/app/forgot" style="margin-top:10px">Get a new link</a>'; }
    });
  }

  async function renderVerify(root, q) {
    root.innerHTML = frame({}, '<div class="col a-in" style="gap:16px;align-items:flex-start">' + H('Checking your link…', '') + '<span class="spin" style="width:28px;height:28px;border-width:3px;border-radius:50%;border:3px solid #121110;border-top-color:transparent;animation:aSpin .8s linear infinite;display:inline-block"></span></div>', sideLogin('One sec…'));
    let ok = false, msg = 'This link is incomplete. Open it from your email again.', vr = {};
    if (q.token) { try { vr = await POST('/api/auth/verify', { token: q.token }) || {}; ok = true; } catch (er) { msg = er.message; } }
    if (ok && RV.S.me) { RV.S.me.email_verified = true; if (RV.S.boot) RV.S.boot.user.email_verified = true; }
    const dash = RV.S.me ? '/app' : '/app/login';
    root.innerHTML = frame({}, '<div class="col a-in" style="gap:18px;align-items:flex-start">' + (ok ? '<div class="a-pop moji-c" style="width:120px;height:120px;background:linear-gradient(160deg,#FFD23F,#FFC21A)">' + RV.moji(RV.S.me ? RV.S.me.moji : { gender: 'female', skin: 3 }, 112, false, true) + '</div>' + H('Email verified!', 'Thanks. Your account is fully set up.') : H('That link didn’t work', esc(msg))) +
      (ok && vr.voo_account ? '<div class="ok-box" style="display:flex;gap:10px;align-items:flex-start">' + RV.vooMark(22) + '<span><strong>You already have a Voo account.</strong> This email already has a Voo ID, the one login for VooSquare and every Zedapex tool. Connect it once to open Replyvoo from VooSquare. Your password keeps working too.</span></div>' + (RV.S.me ? '<button class="btn btn-voo" id="vfVoo" style="padding:15px 22px;gap:10px">' + RV.vooMark(18) + 'Connect my Voo account</button>' : '<a class="btn btn-voo" href="' + esc(vr.connect_url) + '" style="padding:15px 22px;gap:10px">' + RV.vooMark(18) + 'Continue with Voo ID</a>') : '') +
      '<a class="btn btn-ink" href="' + dash + '" style="padding:16px 22px">' + (RV.S.me ? 'Open my dashboard' : 'Log in') + '</a>' + (!ok && RV.S.me ? '<button class="btn btn-ghost" id="vfResend">Send a new link</button>' : '') + '</div>', sideLogin(ok ? 'You’re verified. Nice!' : 'Let’s try that again.'));
    if (ok) RV.confetti(36);
    const vb = $('vfVoo'); if (vb) vb.addEventListener('click', async () => { RV.busy(vb, true, 'Opening VooSquare…'); try { const x = await POST('/api/auth/voosquare/link', { return_to: '/app/settings' }); location.href = x.url; } catch (er) { RV.busy(vb, false); RV.fail(er); } });
    const r = $('vfResend'); if (r) r.addEventListener('click', async () => { RV.busy(r, true); try { await POST('/api/auth/resend-verify'); toast('New link sent. Check your inbox.'); } catch (er) { RV.fail(er); } RV.busy(r, false); });
  }

  const inv = { moji: { gender: 'other', skin: 1, hair: 0, glasses: false, beard: false, earrings: false } };
  async function renderInvite(root, q) {
    root.innerHTML = frame({}, '<div class="col" style="gap:14px"><div class="sk" style="height:44px;width:70%"></div><div class="sk" style="height:20px;width:90%"></div><div class="sk" style="height:52px"></div></div>', sideLogin('Someone wants you on the team!'));
    let info;
    try { info = await GET('/api/auth/invite?token=' + encodeURIComponent(q.token || '')); }
    catch (er) { root.innerHTML = frame({}, '<div class="col a-in" style="gap:16px">' + RV.waitingArt(180) + H('This invite has expired', esc(er.message) + ' Ask your teammate to send a new one.') + '<a class="btn btn-ink" href="' + (RV.S.me ? '/app' : '/app/login') + '" style="padding:16px">' + (RV.S.me ? 'Open my dashboard' : 'Log in') + '</a></div>', sideLogin('Oops, this one is old.')); return; }
    const me = RV.S.me, same = me && me.email.toLowerCase() === info.email.toLowerCase();
    if (info.voo) {
      const here = '/app/invite?token=' + encodeURIComponent(q.token || '');
      const side = { bubble: 'Welcome to the team!', art: mojiSide(inv.moji, false), name: info.workspace, note: 'Team invite', tip: 'One Voo ID opens every Zedapex tool.' };
      const drawVoo = err => {
        root.innerHTML = frame({}, '<div class="col a-in" style="gap:16px">' + H('Join ' + esc(info.workspace), 'You were invited as <strong>' + esc(info.email) + '</strong>.') + errBox(err) +
          (!me ? '<a class="btn btn-ink" href="/auth/voosquare?return_to=' + encodeURIComponent(here) + '" style="padding:17px;font-size:17px">Continue with VooSquare</a><p class="small muted" style="margin:0">Log in or sign up with ' + esc(info.email) + '. You’ll come straight back here to join.</p>'
            : same ? '<button class="btn btn-ink" id="ivJoin" style="padding:17px;font-size:17px">Join ' + esc(info.workspace) + '</button>'
              : '<p style="margin:0">You’re logged in as <strong>' + esc(me.email) + '</strong>. This invite is for ' + esc(info.email) + '.</p><a class="btn btn-ink" href="/auth/voosquare/logout" style="padding:16px">Log out and switch account</a>') + '</div>', side);
        const j = $('ivJoin');
        if (j) j.addEventListener('click', async () => {
          RV.busy(j, true, 'Joining…');
          try { await POST('/api/auth/invite/accept', { token: q.token }); RV.S.boot = null; RV.S.me = null; await RV.loadMe(); toast('Welcome to ' + info.workspace + '!'); RV.confetti(36); go('/app', { replace: true }); }
          catch (er) { drawVoo(er.message); }
        });
      };
      drawVoo('');
      return;
    }
    const needPw = !same;
    const newUser = !info.has_account;
    function draw(err) {
      root.innerHTML = frame({}, '<form class="col a-in" id="ivForm" style="gap:16px" novalidate>' + H('Join ' + esc(info.workspace), 'You were invited as <strong>' + esc(info.email) + '</strong>. ' + (newUser ? 'Create your login to join the team.' : same ? 'Tap join and you’re in.' : 'Enter your password to join.')) + errBox(err) +
        (newUser ? '<div class="field"><label class="lbl" for="ivName">Your name</label><input id="ivName" class="input" autocomplete="name" placeholder="Your full name" value="' + esc(inv.name || '') + '"></div>' : '') +
        (needPw ? pw('ivPass', newUser ? 'At least 8 characters' : 'Your password', newUser ? 'new-password' : 'current-password') : '') +
        (newUser ? '<div class="col" style="gap:8px"><span class="lbl">Your Moji</span><div class="row" style="gap:16px;align-items:flex-start;flex-wrap:wrap"><div id="ivMoji" class="moji-c" style="width:110px;height:110px;background:linear-gradient(160deg,#FFD23F,#FFC21A)">' + RV.moji(inv.moji, 104) + '</div><div id="ivEd" class="grow">' + RV.mojiEditor(inv.moji) + '</div></div></div>' : '') +
        '<button class="btn btn-ink" type="submit" id="ivBtn" style="padding:17px;font-size:17px">Join ' + esc(info.workspace) + '</button>' + (me && !same ? '<p class="small muted" style="margin:0">You’re logged in as ' + esc(me.email) + '. Joining will switch you to ' + esc(info.email) + '.</p>' : '') + '</form>',
        { bubble: 'Welcome to the team!', art: mojiSide(inv.moji, false), name: info.workspace, note: 'Team invite', tip: 'In Chats you can reply yourself any time with one tap.' });
      $('ivForm').addEventListener('submit', async e => {
        e.preventDefault();
        if (newUser) inv.name = $('ivName').value.trim();
        const p = needPw ? $('ivPass').value : '';
        if (newUser && p.length < 8) { draw('Choose a password with at least 8 characters.'); return; }
        const btn = $('ivBtn'); RV.busy(btn, true, 'Joining…');
        try { await POST('/api/auth/invite/accept', { token: q.token, name: inv.name || '', password: p, moji: RV.cleanMoji(inv.moji) }); RV.S.boot = null; RV.S.me = null; await RV.loadMe(); toast('Welcome to ' + info.workspace + '!'); RV.confetti(36); go('/app', { replace: true }); }
        catch (er) { RV.busy(btn, false); draw(er.message); }
      });
    }
    draw('');
    root.onclick = e => {
      const b = e.target.closest('[data-mj]'); if (!b || RV.parse().name !== 'invite') return;
      const nm = $('ivName'); if (nm) inv.name = nm.value;
      RV.mojiApply(inv.moji, b);
      $('ivMoji').innerHTML = RV.moji(inv.moji, 104); $('ivEd').innerHTML = RV.mojiEditor(inv.moji);
      const big = $('suBig'); if (big) big.innerHTML = mojiSide(inv.moji, false);
    };
  }

  RV.authPages = { welcome: (root, q) => renderSignup(root, q, true), signup: renderSignup, login: renderLogin, forgot: renderForgot, reset: renderReset, verify: renderVerify, invite: renderInvite };
  RV.resetSignup = () => { su.done = false; su.err = ''; };
  RV.signupDone = () => su.done;
})();
