/* Replyvoo admin: overview, users & workspaces, orders, blog, legal pages, emails, activity. */
(function () {
  'use strict';
  const RV = window.RV, { $, $$, esc, fmt, money, ic, F, clone, ago } = RV;

  /* ================= OVERVIEW ================= */
  const CH_NAMES = { website: 'Website chat', whatsapp: 'WhatsApp', instagram: 'Instagram', tiktok: 'TikTok', messenger: 'Messenger', telegram_bot: 'Telegram bots', telegram_business: 'Telegram Business', telegram_group: 'Telegram groups', newsletter: 'Newsletter' };
  function health(c) {
    const rows = [
      [c.ai, 'AI replies', c.ai ? 'Closers answer with the real AI.' : 'Closers send demo replies, not real AI answers.', 'Set <code>ANTHROPIC_API_KEY</code> on the server and restart.'],
      [c.mail, 'Email sending', c.mail ? 'Emails go out through your email provider.' : 'Emails are only printed to the server log. Customers get nothing.', 'Set <code>MAIL_PROVIDER</code> (resend, brevo or postmark) and <code>MAIL_API_KEY</code>.'],
      [c.paystack || c.flutterwave, 'Card payments', c.paystack || c.flutterwave ? 'Connected: ' + [c.paystack && 'Paystack', c.flutterwave && 'Flutterwave'].filter(Boolean).join(' and ') + '.' : 'No real payment provider is connected, so nobody can pay by card.', 'Set <code>PAYSTACK_SECRET_KEY</code> or <code>FLUTTERWAVE_SECRET_KEY</code>.'],
      [!c.demo_payments, 'Demo payments', c.demo_payments ? 'Demo checkout is ON: anyone can “pay” without money and get plans and credits for free.' : 'Demo checkout is off. Good.', 'Set <code>PAYMENTS_DEMO=false</code> before launch.', true],
      [c.transcribe, 'Voice notes', c.transcribe ? 'Voice notes are transcribed so Closers can answer them.' : 'Voice notes can’t be understood yet.', 'Set <code>TRANSCRIBE_API_KEY</code> (optional).'],
    ];
    return rows.map(([ok, t, what, fix, danger]) => '<div class="hl-row"><span class="hl-dot" style="background:' + (ok ? 'var(--ok-bg);color:var(--ok)' : danger ? 'var(--bad-bg);color:var(--bad)' : 'var(--warn-bg);color:var(--jade-dd)') + '">' + ic(ok ? 'check' : 'warn', 15, 2.6) + '</span><div><strong>' + t + '</strong><p>' + what + (ok ? '' : ' <br><span style="color:var(--ink)">How to fix:</span> ' + fix) + '</p></div></div>').join('') + '<p class="mut" style="font-size:12.5px;margin:10px 0 0">Site address: <strong>' + esc(c.app_url) + '</strong></p>';
  }
  RV.route('overview', {
    async render(page, arg, stale) {
      const [o, pl] = await Promise.all([RV.get('/api/admin/overview'), RV.get('/api/admin/plans').catch(() => [])]); if (stale()) return;
      RV.cache.overview = o; RV.cache.plans = pl; RV.setPending(o.orders_pending);
      const pname = id => (pl.find(p => p.id === id) || { name: id }).name;
      const hour = new Date().getHours();
      const hi = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      const sig = o.series.reduce((s, r) => s + r.signups, 0), rev = o.series.reduce((s, r) => s + r.revenue, 0);
      const totalWs = o.plans.reduce((s, p) => s + p.n, 0) || 1;
      const wl = o.waitlist.filter(w => w.item !== 'newsletter');
      const news = (o.waitlist.find(w => w.item === 'newsletter') || { n: 0 }).n;
      page.innerHTML = RV.header(hi + ', <span class="it">' + esc((RV.user.name || 'boss').split(' ')[0]) + '</span>', 'Here’s how Replyvoo is doing today.', '<a class="btn btn-g" href="/" target="_blank" rel="noopener">' + ic('ext', 16) + 'View site</a>') +
        (o.config.demo_payments ? '<div class="warn red" style="margin-bottom:14px">' + ic('warn', 18) + '<span><strong>Demo payments are ON.</strong> Anyone can get paid plans for free. Turn off before launch (see Setup health below).</span></div>' : '') +
        (o.orders_pending ? '<a class="warn" href="/admin/orders?status=pending" style="margin-bottom:14px;text-decoration:none">' + ic('clock', 18) + '<span style="flex:1"><strong>' + o.orders_pending + ' USDT order' + (o.orders_pending > 1 ? 's' : '') + ' waiting</strong> for you to confirm the transfer.</span>' + ic('right', 18) + '</a>' : '') +
        '<div class="grid g4">' +
        '<div class="stat dark"><span class="k">MRR</span><span class="v tnum">' + money(o.mrr) + '</span><span class="s">monthly recurring revenue</span></div>' +
        '<div class="stat"><span class="k">Paying workspaces</span><span class="v tnum">' + fmt(o.paying) + '</span><span class="s">of ' + fmt(o.workspaces) + ' workspaces</span></div>' +
        '<div class="stat"><span class="k">Revenue, 30 days</span><span class="v tnum">' + money(o.revenue_30d) + '</span><span class="s">paid orders</span></div>' +
        '<div class="stat"><span class="k">Users</span><span class="v tnum">' + fmt(o.users) + '</span><span class="s">' + fmt(sig) + ' new in 14 days</span></div>' +
        '<div class="stat hl"><span class="k">Chats today</span><span class="v tnum">' + fmt(o.chats_today) + '</span><span class="s">' + fmt(o.ai_replies_today) + ' AI replies</span></div>' +
        '<a class="stat" href="/admin/orders?status=pending"><span class="k">Pending USDT</span><span class="v tnum">' + fmt(o.orders_pending) + '</span><span class="s">tap to review →</span></a>' +
        '<div class="stat"><span class="k">Joinvoo clicks</span><span class="v tnum">' + fmt(o.joinvoo_clicks) + '</span><span class="s">' + fmt(o.joinvoo_clicks_30d) + ' in 30 days</span></div>' +
        '<div class="stat"><span class="k">Live channels</span><span class="v tnum">' + fmt(o.channels) + '</span><span class="s">' + fmt(o.closers) + ' Closers built</span></div>' +
        '</div>' +
        '<div class="grid g2" style="margin-top:14px">' +
        '<section class="card"><div class="card-h"><div><h3>Sign-ups</h3><p>Last 14 days</p></div><span class="chart-total tnum">' + fmt(sig) + '</span></div>' + RV.barChart(o.series, 'signups', { label: 'sign-ups' }) + '</section>' +
        '<section class="card"><div class="card-h"><div><h3>Revenue</h3><p>Last 14 days, paid orders</p></div><span class="chart-total tnum">' + money(Math.round(rev * 100) / 100) + '</span></div>' + RV.barChart(o.series, 'revenue', { fmtV: v => money(Math.round(v * 100) / 100), color: 'var(--ink)' }) + '</section>' +
        '</div>' +
        '<div class="grid g2" style="margin-top:14px">' +
        '<section class="card"><div class="card-h"><div><h3>Plans</h3><p>Workspaces on each plan</p></div><a class="btn btn-g btn-sm" href="/admin/plans">Manage</a></div><div class="stack" style="gap:10px">' + o.plans.slice().sort((a, b) => b.n - a.n).map(p => '<div><div style="display:flex;justify-content:space-between;font-size:13.5px;font-weight:700"><span>' + esc(pname(p.plan_id)) + '</span><span class="tnum">' + fmt(p.n) + ' <span class="mut2">· ' + Math.round(p.n / totalWs * 100) + '%</span></span></div><div class="bar" style="height:8px"><i style="width:' + Math.max(2, p.n / totalWs * 100) + '%;background:var(--ink)"></i></div></div>').join('') + '</div></section>' +
        '<section class="card"><div class="card-h"><div><h3>Waitlists</h3><p>People waiting for coming-soon channels</p></div><a class="btn btn-g btn-sm" href="/admin/channels">Channels</a></div>' + (wl.length ? '<div class="list">' + wl.map(w => '<div class="li">' + RV.brandIcon(w.item.startsWith('telegram') ? 'telegram' : w.item, 34) + '<span class="li-main"><strong>' + esc(CH_NAMES[w.item] || w.item) + '</strong></span><span class="li-end"><strong class="tnum">' + fmt(w.n) + '</strong></span></div>').join('') + '</div>' : '<div class="empty" style="padding:18px">No one on a waitlist yet.</div>') + (news ? '<p class="mut" style="font-size:13px;margin:8px 0 0">' + fmt(news) + ' newsletter subscriber' + (news > 1 ? 's' : '') + '.</p>' : '') + '</section>' +
        '</div>' +
        '<div class="grid g2" style="margin-top:14px">' +
        '<section class="card"><div class="card-h"><div><h3>Recent orders</h3></div><a class="btn btn-g btn-sm" href="/admin/orders">All orders</a></div>' + (o.recent_orders.length ? '<div class="list">' + o.recent_orders.map(r => '<div class="li"><span class="li-main"><strong>' + esc(r.item_name) + '</strong><span>' + esc(r.ws) + ' · ' + esc(r.provider) + ' · ' + ago(r.created_at) + '</span></span><span class="li-end"><strong class="tnum">' + money(r.amount_usd) + '</strong>' + RV.statusPill(r.status) + '</span></div>').join('') + '</div>' : '<div class="empty">No orders yet.</div>') + '</section>' +
        '<section class="card"><div class="card-h"><div><h3>Setup health</h3><p>What’s connected on the server</p></div></div>' + health(o.config) + '</section>' +
        '</div>';
    }
  });

  /* ================= USERS & WORKSPACES ================= */
  const initials = u => (u.name || u.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('');
  const AV_BG = ['#FFE9A6', '#E5F6EC', '#EEEBFF', '#FDECE8', '#E3F3FC'];
  RV.route('users', {
    async render(page, arg, stale) {
      let q = '', pg = 0, rows = [], total = 0, t = null;
      page.innerHTML = RV.header('Users & workspaces', 'Find anyone, fix their account, adjust their plan or credits.') +
        '<div class="card" style="padding:12px"><div class="affix srch"><span>' + ic('search', 18) + '</span><input class="input" type="search" id="uq" placeholder="Search email, name or business" aria-label="Search users" style="padding-left:42px"></div></div>' +
        '<div class="card" style="padding:4px 14px;margin-top:14px"><div class="list" id="ul"></div></div><div style="text-align:center;margin-top:12px"><button class="btn btn-g" id="more" hidden>Load more</button></div>';
      const draw = () => {
        $('#ul', page).innerHTML = rows.length ? rows.map((u, i) => '<button class="li" data-u="' + i + '"><span class="me-av" style="background:' + AV_BG[u.id % 5] + '">' + esc(initials(u)) + '</span><span class="li-main"><strong>' + esc(u.name || u.email) + '</strong><span>' + esc(u.email) + (u.ws_name ? ' · ' + esc(u.ws_name) : '') + '</span></span><span class="li-end">' + (u.role === 'admin' ? '<span class="pill p-ink">STAFF</span>' : '') + (u.suspended ? '<span class="pill p-bad">SUSPENDED</span>' : '') + (u.plan_id ? '<span class="pill p-mut">' + esc(u.plan_id) + '</span>' : '') + ic('right', 16) + '</span></button>').join('') : '<div class="empty"><strong>No one found</strong>Try another search.</div>';
        $('#more', page).hidden = rows.length >= total || rows.length < (pg + 1) * 50;
      };
      const load = async (append) => {
        const r = await RV.get('/api/admin/users?q=' + encodeURIComponent(q) + '&page=' + pg);
        if (stale()) return;
        rows = append ? rows.concat(r.rows) : r.rows; total = r.total; draw();
      };
      await load(); if (stale()) return;
      $('#uq', page).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); pg = 0; load().catch(RV.fail); }, 250); });
      $('#more', page).onclick = () => { pg++; load(true).catch(RV.fail); };
      $('#ul', page).addEventListener('click', e => { const b = e.target.closest('[data-u]'); if (b) userSheet(rows[+b.dataset.u], () => { pg = 0; load().catch(RV.fail); }); });
      if (arg && /^ws\/\d+$/.test(arg)) wsSheet(+arg.split('/')[1]);
    }
  });

  function userSheet(u, refresh) {
    const st = { suspended: !!u.suspended, admin: u.role === 'admin', email_verified: !!u.email_verified };
    const sh = RV.sheet({ title: u.name || u.email, sub: esc(u.email), noFooter: true, body:
      '<div class="grid g2" style="gap:10px"><div class="stat"><span class="k">Joined</span><span style="font-weight:800">' + RV.date(u.created_at) + '</span></div><div class="stat"><span class="k">Last login</span><span style="font-weight:800">' + ago(u.last_login) + '</span></div></div>' +
      (u.ws_id ? '<button class="li card" data-ws style="border:1px solid var(--line);border-radius:18px;padding:12px 14px"><span class="ico">' + ic('building', 18) + '</span><span class="li-main"><strong>' + esc(u.ws_name) + '</strong><span>' + esc(u.plan_id) + ' plan · ' + fmt(u.credits) + ' credits · renews ' + RV.date(u.period_end) + '</span></span><span class="li-end">' + ic('right', 18) + '</span></button>' : '') +
      '<div class="card" style="padding:4px 16px">' + F.tog('suspended', 'Suspended', 'Blocks log in and ends their sessions') + F.tog('admin', 'Staff access', 'Adds them as an Admin. Fine-tune their role on the Staff page') + F.tog('email_verified', 'Email verified') + '</div>' +
      '<div class="card"><div class="card-h"><div><h3>Set a new password</h3><p>Share it with them privately. At least 8 characters.</p></div></div><div style="display:flex;gap:8px"><input class="input" type="text" id="npw" minlength="8" autocomplete="new-password" aria-label="New password" placeholder="New password"><button class="btn" id="spw">Set</button></div></div>' });
    RV.bind(sh.body, st, async (k, v, el) => {
      const body = k === 'admin' ? { role: v ? 'admin' : 'user' } : { [k]: v };
      if (k === 'suspended' && v && !(await RV.confirm({ title: 'Suspend ' + (u.name || u.email) + '?', text: 'They’ll be logged out and can’t log in until you unsuspend them.', ok: 'Suspend', danger: true }))) { st[k] = false; el.setAttribute('aria-checked', 'false'); return; }
      if (k === 'admin' && v && !(await RV.confirm({ title: 'Make ' + (u.name || u.email) + ' an admin?', text: 'They’ll be able to change prices, users and everything here.', ok: 'Make admin' }))) { st[k] = false; el.setAttribute('aria-checked', 'false'); return; }
      el.disabled = true;
      try { await RV.put('/api/admin/users/' + u.id, body); RV.toast('Saved'); if (k === 'admin') u.role = v ? 'admin' : 'user'; else u[k] = v ? 1 : 0; refresh && refresh(); }
      catch (err) { RV.fail(err); st[k] = !v; el.setAttribute('aria-checked', String(!v)); }
      finally { el.disabled = false; sh.dirty = false; }
    });
    sh.el.addEventListener('click', async e => {
      if (e.target.closest('[data-ws]')) return wsSheet(u.ws_id, refresh);
      if (e.target.closest('#spw')) {
        const pw = $('#npw', sh.el).value;
        if (pw.length < 8) return RV.toast('Password needs 8+ characters', 'err');
        try { await RV.put('/api/admin/users/' + u.id, { password: pw }); RV.toast('Password updated'); $('#npw', sh.el).value = ''; sh.dirty = false; } catch (err) { RV.fail(err); }
      }
    });
  }

  async function wsSheet(id, refresh) {
    let d, pl;
    try { [d, pl] = await Promise.all([RV.get('/api/admin/workspaces/' + id), RV.cache.plans ? Promise.resolve(RV.cache.plans) : RV.get('/api/admin/plans')]); RV.cache.plans = pl; }
    catch (err) { return RV.fail(err); }
    const w = d.workspace, u = d.usage;
    const f = { plan_id: w.plan_id, plan_interval: w.plan_interval, period_end: w.period_end, status: w.status, extra_closer_slots: w.extra_closer_slots, extra_seats: w.extra_seats, reset_usage: false, credits_delta: null, credits_reason: '' };
    const convPct = u.conversations.included ? Math.min(100, u.conversations.used / u.conversations.included * 100) : 0;
    const sec = (t, inner) => '<div class="card"><div class="card-h"><h3>' + t + '</h3></div>' + inner + '</div>';
    const sh = RV.sheet({ title: w.name, sub: 'Workspace #' + w.id + ' · created ' + RV.date(w.created_at), wide: true, save: 'Save workspace', body:
      '<div class="grid g4" style="gap:10px"><div class="stat dark"><span class="k">Credits</span><span class="v tnum" id="wsCred">' + fmt(w.credits) + '</span></div><div class="stat"><span class="k">Conversations</span><span class="v tnum" style="font-size:22px">' + fmt(u.conversations.used) + '<span class="mut2" style="font-size:14px"> / ' + fmt(u.conversations.included) + '</span></span><div class="bar"><i style="width:' + convPct + '%"></i></div></div><div class="stat"><span class="k">Closers</span><span class="v tnum" style="font-size:22px">' + u.closers_used + ' / ' + (u.closers_limit >= 9999 ? '∞' : u.closers_limit) + '</span></div><div class="stat"><span class="k">Seats</span><span class="v tnum" style="font-size:22px">' + u.seats_used + ' / ' + u.seats_limit + '</span></div></div>' +
      '<div class="split"><div class="stack">' +
      '<div class="card"><div class="card-h"><div><h3>Add or remove credits</h3><p>Use a minus number to remove. The reason shows in their wallet.</p></div></div><div class="row-wrap" style="margin-bottom:10px"><button type="button" class="chip" data-cq="100">+100</button><button type="button" class="chip" data-cq="500">+500</button><button type="button" class="chip" data-cq="1000">+1,000</button><button type="button" class="chip" data-cq="-100">−100</button></div><div class="fg c2m">' + F.num('credits_delta', 'Credits (+/−)', { int: true, min: -10000000, ph: '0' }) + F.text('credits_reason', 'Reason', { max: 120, ph: 'Goodwill for downtime' }) + '</div></div>' +
      '<div class="card"><div class="card-h"><h3>Plan</h3></div><div class="fg">' + F.sel('plan_id', 'Plan', pl.map(p => [p.id, p.name + (p.price_month ? ' · $' + p.price_month + '/mo' : ' · free') + (p.active ? '' : ' (paused)')])) + '<div class="f"><span class="lbl">Billing</span>' + F.seg('plan_interval', [['month', 'Monthly'], ['year', 'Yearly']], { w: true, label: 'Billing interval' }) + '</div>' + F.dt('period_end', 'Period ends', { req: true }) + '<div class="row-wrap"><button type="button" class="chip" data-pe="30">+30 days</button><button type="button" class="chip" data-pe="365">+1 year</button></div>' + '<div class="fg c2m">' + F.num('extra_closer_slots', 'Extra Closer slots', { int: true }) + F.num('extra_seats', 'Extra seats', { int: true }) + '</div><div class="f"><span class="lbl">Status</span>' + F.seg('status', [['active', 'Active', 's-live'], ['suspended', 'Suspended', 's-off']], { w: true, label: 'Workspace status' }) + '</div>' + F.tog('reset_usage', 'Reset usage now', 'Sets this period’s conversation and Pro Brain counts to 0') + '</div></div>' +
      '</div><div class="stack">' +
      sec('Members', '<div class="list">' + d.members.map(m => '<div class="li"><span class="li-main"><strong>' + esc(m.name || m.email) + '</strong><span>' + esc(m.email) + '</span></span><span class="pill p-mut">' + esc(m.role) + '</span></div>').join('') + '</div>') +
      sec('Channels', d.channels.length ? '<div class="list">' + d.channels.map(c => '<div class="li">' + RV.brandIcon(c.type.startsWith('telegram') ? 'telegram' : c.type, 32) + '<span class="li-main"><strong>' + esc(c.name || c.username || c.type) + '</strong><span>' + esc(c.type) + (c.username ? ' · @' + esc(c.username) : '') + '</span></span>' + RV.statusPill(c.status) + '</div>').join('') + '</div>' : '<p class="mut" style="margin:0">No channels connected.</p>') +
      sec('Closers', d.closers.length ? '<div class="list">' + d.closers.map(c => '<div class="li"><span class="li-main"><strong>' + esc(c.name) + '</strong><span>' + esc(c.template) + ' · ' + fmt(c.replies) + ' replies</span></span>' + RV.statusPill(c.active ? 'active' : 'paused') + '</div>').join('') + '</div>' : '<p class="mut" style="margin:0">No Closers yet.</p>') +
      sec('Orders', d.orders.length ? '<div class="list">' + d.orders.map(o => '<div class="li"><span class="li-main"><strong>' + esc(o.item_name) + '</strong><span>' + esc(o.ref) + ' · ' + RV.date(o.created_at) + '</span></span><span class="li-end"><strong class="tnum">' + money(o.amount_usd) + '</strong>' + RV.statusPill(o.status) + '</span></div>').join('') + '</div>' : '<p class="mut" style="margin:0">No orders.</p>') +
      sec('Credit history', d.tx.length ? '<div class="list">' + d.tx.map(t => '<div class="li"><span class="li-main"><strong>' + esc(t.reason) + '</strong><span>' + ago(t.created_at) + ' · balance ' + fmt(t.balance) + '</span></span><strong class="tnum" style="color:' + (t.amount >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + (t.amount >= 0 ? '+' : '') + fmt(t.amount) + '</strong></div>').join('') + '</div>' : '<p class="mut" style="margin:0">No credit activity.</p>') +
      '<p class="mut" style="font-size:12.5px;margin:0">Referral code <strong>' + esc(w.ref_code) + '</strong> · ' + fmt(d.referred) + ' workspace(s) referred</p>' +
      '</div></div>',
      async onSave() {
        const body = clone(f);
        if (!body.credits_delta) delete body.credits_delta;
        if (body.credits_delta && !String(body.credits_reason).trim()) { RV.toast('Add a reason for the credit change.', 'err'); $('[data-k=credits_reason]', sh.el).focus(); return false; }
        if (body.credits_delta && body.credits_delta < 0 && -body.credits_delta > w.credits && !(await RV.confirm({ title: 'Remove more credits than they have?', text: 'They have ' + fmt(w.credits) + ' credits.', ok: 'Remove anyway', danger: true }))) return false;
        if (body.status === 'suspended' && w.status !== 'suspended' && !(await RV.confirm({ title: 'Suspend this workspace?', text: 'Its Closers stop replying until you set it back to Active.', ok: 'Suspend', danger: true }))) return false;
        if (!body.reset_usage) delete body.reset_usage;
        await RV.put('/api/admin/workspaces/' + w.id, body);
        RV.toast(body.credits_delta ? (body.credits_delta > 0 ? '+' : '') + fmt(body.credits_delta) + ' credits · workspace saved' : 'Workspace saved');
        refresh && refresh();
      } });
    RV.bind(sh.body, f);
    sh.el.addEventListener('click', e => {
      const cq = e.target.closest('[data-cq]');
      if (cq) { f.credits_delta = (f.credits_delta || 0) + +cq.dataset.cq; $('[data-k=credits_delta]', sh.el).value = f.credits_delta; if (!f.credits_reason) { f.credits_reason = f.credits_delta > 0 ? 'Bonus from the Replyvoo team' : 'Adjusted by the Replyvoo team'; $('[data-k=credits_reason]', sh.el).value = f.credits_reason; } sh.dirty = true; }
      const pe = e.target.closest('[data-pe]');
      if (pe) { const base = new Date(f.period_end) > new Date() ? new Date(f.period_end) : new Date(); f.period_end = new Date(base.getTime() + +pe.dataset.pe * 864e5).toISOString(); $('[data-k=period_end]', sh.el).value = RV.toLocalInput(f.period_end); sh.dirty = true; RV.toast('Period end moved to ' + RV.date(f.period_end)); }
    });
  }

  /* ================= ORDERS ================= */
  // What the customer paid: the base price plus the payment method's fee (kept apart on the order).
  const paidOf = o => Math.round((Number(o.amount_usd) + Number(o.fee_usd || 0)) * 100) / 100;
  RV.route('orders', {
    async render(page, arg, stale) {
      const status = new URLSearchParams(location.search).get('status') || '';
      const list = await RV.get('/api/admin/orders' + (status ? '?status=' + encodeURIComponent(status) : '')); if (stale()) return;
      // Joinvoo bridge: plans and packs paid with Joinvoo credits, per month (settlement between the two apps)
      let sett = []; try { sett = (await RV.get('/api/admin/joinvoo/settlement')).months || []; } catch (e) { sett = []; } if (stale()) return;
      const settHtml = sett.length ? '<div class="card" style="padding:14px 16px;margin-bottom:14px"><strong>Paid with Joinvoo credits</strong><div class="muted small" style="margin:2px 0 8px">Settlement with Joinvoo, per month. Refunds of these orders go back as Joinvoo credits.</div>' +
        sett.map(r => '<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid var(--line)"><span>' + esc(r.month) + ' · ' + r.orders + ' order' + (r.orders === 1 ? '' : 's') + '</span><span>' + money(r.usd) + (r.refunded_usd ? ' · refunded ' + money(r.refunded_usd) : '') + ' · <b>net ' + money(r.net_usd) + '</b></span></div>').join('') + '</div>' : '';
      const F2 = [['', 'All'], ['pending', 'Pending'], ['paid', 'Paid'], ['refunded', 'Refunded'], ['charged_back', 'Charged back'], ['cancelled', 'Cancelled'], ['failed', 'Failed']];
      page.innerHTML = RV.header('Orders', 'Every checkout. Gatevoo and Bachs payments confirm on their own. “joinvoo_credits” orders were paid with Joinvoo credits.') + settHtml +
        '<div class="chips" role="group" aria-label="Filter by status" style="margin-bottom:14px">' + F2.map(([v, l]) => '<a class="chip' + (v === status ? ' on' : '') + '" href="/admin/orders' + (v ? '?status=' + v : '') + '"' + (v === status ? ' aria-current="true"' : '') + '>' + l + '</a>').join('') + '</div>' +
        (list.length ? '<div class="stack" style="gap:10px">' + list.map((o, i) => '<div class="card" style="padding:14px 16px"><div style="display:flex;gap:12px;align-items:flex-start">' + (o.gatevoo ? '<span class="ico" style="background:none;border:0">' + RV.gatevooMark(36) + '</span>' : '<span class="ico">' + ic(o.kind === 'pack' ? 'coins' : o.kind === 'plan' ? 'tag' : 'bolt', 18) + '</span>') + '<div class="li-main"><strong style="white-space:normal">' + esc(o.item_name) + (o.interval ? ' <span class="mut" style="font-weight:600">(' + esc(o.interval) + 'ly)</span>' : '') + '</strong><span>' + esc(o.ws_name) + (o.email ? ' · ' + esc(o.email) : '') + '</span><span>' + esc(o.ref) + ' · ' + (o.gatevoo ? '<span class="gv-tag">' + RV.gatevooMark(14) + 'Gatevoo' + (o.gatevoo.coin ? ' · ' + esc(o.gatevoo.coin) : '') + (o.gatevoo.sandbox ? ' · sandbox' : '') + '</span>' : esc(o.provider)) + ' · ' + RV.dateTime(o.created_at) + '</span>' + (o.gatevoo && (o.gatevoo.tx_hash || o.gatevoo.paid_amount) ? '<span class="gv-tx">' + (o.gatevoo.paid_amount ? esc(o.gatevoo.paid_amount) + ' ' + esc(o.gatevoo.coin === 'Bitcoin' ? 'BTC' : 'USDT') + (o.gatevoo.network ? ' on ' + esc(o.gatevoo.network) : '') : '') + (o.gatevoo.tx_hash ? ' · ' + (o.gatevoo.tx_url ? '<a href="' + esc(o.gatevoo.tx_url) + '" target="_blank" rel="noopener">' + esc(o.gatevoo.tx_hash.slice(0, 10) + '…' + o.gatevoo.tx_hash.slice(-6)) + ' ↗</a>' : esc(o.gatevoo.tx_hash.slice(0, 18)) + '…') : '') + '</span>' : '') + (o.gatevoo && o.gatevoo.underpaid ? '<span style="color:var(--bad);font-weight:700">Underpaid: received $' + Number(o.gatevoo.paid_usd || 0).toFixed(2) + '</span>' : '') + '</div><div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:4px"><strong class="tnum" style="font-size:17px">' + money(paidOf(o)) + '</strong>' + (o.fee_usd ? '<span class="mut" style="font-size:12px">' + money(o.amount_usd) + ' base + ' + money(o.fee_usd) + ' fee (' + esc(String(o.fee_pct)) + '%)</span>' : '') + (o.discount_usd ? '<span class="mut" style="font-size:12px">−' + money(o.discount_usd) + ' coupon</span>' : '') + (o.currency !== 'USD' ? '<span class="mut" style="font-size:12px">' + fmt(o.amount_local, 2) + ' ' + esc(o.currency) + '</span>' : '') + RV.statusPill(o.status) + '</div></div>' +
          (o.status === 'paid' && o.amount_usd > 0 ? '<div class="row-wrap" style="margin-top:12px;justify-content:flex-end"><button class="btn btn-g btn-sm" data-rev="refund" data-i="' + i + '">Refund</button><button class="btn btn-red btn-sm" data-rev="chargeback" data-i="' + i + '">Chargeback</button></div>' : '') + (o.status === 'pending' ? '<div class="row-wrap" style="margin-top:12px;justify-content:flex-end">' + (o.provider === 'crypto' ? '<span class="pill p-warn" style="margin-right:auto">USDT · check your wallet</span>' : '') + (o.provider === 'gatevoo' ? '<span class="pill p-warn" style="margin-right:auto">Waiting for the coins</span><button class="btn btn-g btn-sm" data-check="' + i + '">' + ic('refresh', 16) + 'Check payment</button>' : '') + (o.provider === 'bachs' ? '<span class="pill p-warn" style="margin-right:auto">Bachs · waiting for payment</span><button class="btn btn-g btn-sm" data-check="' + i + '">' + ic('refresh', 16) + 'Check payment</button>' : '') + '<button class="btn btn-red btn-sm" data-cancel="' + i + '">Cancel</button><button class="btn btn-y btn-sm" data-paid="' + i + '">' + ic('check', 16) + 'Mark paid</button></div>' : '') + '</div>').join('') + '</div>' : '<div class="card empty"><strong>No orders' + (status ? ' with status “' + esc(status) + '”' : '') + '</strong>They show up here as people check out.</div>');
      page.onclick = async e => {
        const ck = e.target.closest('[data-check]');
        if (ck) { const o = list[+ck.dataset.check]; RV.busy ? RV.busy(ck, true) : (ck.disabled = true); try { const r = await RV.post('/api/admin/orders/' + encodeURIComponent(o.ref) + '/check'); RV.toast(r.ok ? 'Paid! ' + o.item_name + ' is active.' : (r.reason || 'Not paid yet.'), r.ok ? undefined : 'err'); if (r.ok || r.status !== 'pending') RV.render(); } catch (err) { RV.fail(err); } if (ck.isConnected) { RV.busy ? RV.busy(ck, false) : (ck.disabled = false); } return; }
        const rv = e.target.closest('[data-rev]');
        if (rv) {
          const o = list[+rv.dataset.i]; const kind = rv.dataset.rev; const st = { amount_usd: paidOf(o), note: '' };
          const sh = RV.sheet({ title: (kind === 'refund' ? 'Refund ' : 'Record chargeback for ') + o.ref, sub: esc(o.item_name) + ' · ' + money(paidOf(o)) + (o.fee_usd ? ' (incl. ' + money(o.fee_usd) + ' fee)' : ''), save: kind === 'refund' ? 'Record refund' : 'Record chargeback',
            body: '<div class="warn">' + ic('info', 18) + '<span>' + (kind === 'refund' && o.provider === 'joinvoo_credits' ? 'Paid with Joinvoo credits: recording the refund sends the amount back to the customer’s Joinvoo balance as Joinvoo credits by itself (retried until Joinvoo confirms). It also takes back what was bought.' : kind === 'refund' ? 'Send the money back in ' + esc(o.provider) + ' first. This records it and takes back what was bought (credits from a pack, the rest of a plan, a power-up).' : 'The card network took this payment back. This takes back what was bought and reverses the Voo Squad reward paid for it.') + ' VooSquare is told too.</span></div>' + F.num('amount_usd', 'Amount (USD)', { pre: '$', step: 0.01, min: 0.01 }) + F.text('note', 'Note', { max: 200, ph: kind === 'refund' ? 'e.g. Customer asked within 7 days' : 'e.g. Dispute ID' }),
            async onSave() { await RV.post('/api/admin/orders/' + encodeURIComponent(o.ref) + '/' + kind, st); RV.toast(kind === 'refund' ? 'Refund recorded' : 'Chargeback recorded'); RV.render(); } });
          RV.bind(sh.body, st);
          return;
        }
        const c = e.target.closest('[data-cancel]');
        if (c) { const o = list[+c.dataset.cancel]; if (!(await RV.confirm({ title: 'Cancel order ' + o.ref + '?', text: 'The customer won’t get ' + o.item_name + '.', ok: 'Cancel order', danger: true, cancel: 'Keep it' }))) return; try { await RV.post('/api/admin/orders/' + encodeURIComponent(o.ref) + '/cancel'); RV.toast('Order cancelled'); RV.render(); } catch (err) { RV.fail(err); } return; }
        const p = e.target.closest('[data-paid]');
        if (p) {
          const o = list[+p.dataset.paid]; const st = { note: '' };
          const sh = RV.sheet({ title: 'Mark ' + o.ref + ' as paid', sub: esc(o.item_name) + ' · ' + money(paidOf(o)), save: 'Mark paid', body: '<div class="warn">' + ic('info', 18) + '<span>Only do this after you see <strong>' + money(paidOf(o)) + (o.provider === 'crypto' ? ' USDT' : '') + '</strong> arrive. ' + esc(o.ws_name) + ' gets ' + esc(o.item_name) + ' immediately.</span></div>' + F.text('note', 'Note / transaction hash', { max: 120, ph: 'e.g. TX hash from your wallet' }),
            async onSave() { const r = await RV.post('/api/admin/orders/' + encodeURIComponent(o.ref) + '/mark-paid', st); if (r && r.ok === false) { RV.toast('Couldn’t mark it paid. It may already be paid or cancelled.', 'err'); } else RV.toast('Order marked paid. ' + o.item_name + ' is active.'); RV.render(); RV.get('/api/admin/overview').then(ov => RV.setPending(ov.orders_pending)).catch(() => {}); } });
          RV.bind(sh.body, st);
        }
      };
    }
  });

  /* ================= MARKDOWN EDITOR ================= */
  RV.mdEditor = function (k, label, o = {}) {
    return '<div class="f"><label for="' + (o.id || 'md_' + k) + '">' + esc(label) + '</label><div class="md-tools" role="toolbar" aria-label="Formatting"><button type="button" data-md="b" aria-label="Bold">' + ic('bold', 16) + '</button><button type="button" data-md="h" aria-label="Heading">H2</button><button type="button" data-md="a" aria-label="Link">' + ic('link', 16) + '</button><button type="button" data-md="l" aria-label="Bullet list">' + ic('list', 16) + '</button><button type="button" data-md="i" aria-label="Image">' + ic('image', 16) + '</button></div><textarea id="' + (o.id || 'md_' + k) + '" class="md-area" data-k="' + k + '" rows="' + (o.rows || 14) + '"' + (o.req ? ' required' : '') + '></textarea></div>';
  };
  RV.wireMd = function (root, onUpdate) {
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-md]'); if (!b) return;
      const ta = $('textarea.md-area', b.closest('.f'));
      const s = ta.selectionStart, en = ta.selectionEnd, sel = ta.value.slice(s, en);
      let ins, cs, ce;
      const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
      switch (b.dataset.md) {
        case 'b': ins = '**' + (sel || 'bold text') + '**'; cs = s + 2; ce = cs + (sel || 'bold text').length; break;
        case 'a': ins = '[' + (sel || 'link text') + '](https://)'; cs = s + ins.length - 9; ce = s + ins.length - 1; break;
        case 'i': ins = '![' + (sel || 'Image description') + '](https://)'; cs = s + ins.length - 9; ce = s + ins.length - 1; break;
        case 'h': ta.setRangeText('## ', lineStart, lineStart, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); return;
        case 'l': ins = (sel || 'List item').split('\n').map(x => '- ' + x).join('\n'); if (s !== lineStart) ins = '\n' + ins; cs = s + ins.length; ce = cs; break;
      }
      ta.setRangeText(ins, s, en, 'end'); ta.focus(); ta.setSelectionRange(cs, ce);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    let t = null;
    const ta = $('textarea.md-area', root);
    const go = () => { clearTimeout(t); t = setTimeout(async () => { try { const r = await RV.post('/api/admin/preview-md', { md: ta.value }); onUpdate(r.html); } catch (err) { /* preview is best-effort */ } }, 350); };
    ta.addEventListener('input', go); go();
  };

  /* ================= BLOG ================= */
  const COVERS = { rocket: ['#FFC21A', '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M9 15l-3-3c1-3 4-8 12-9-1 8-6 11-9 12z"/><circle cx="15" cy="9" r="1.6"/>'], plane: ['#2AABEE', '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>'], phone: ['#14804A', '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>'], brain: ['#6D5BFF', '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h1V4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-1V4z"/>'], chart: ['#FFD23F', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'], shield: ['#121110', '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>'], money: ['#FF7A59', '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/>'], people: ['#F0AE00', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/>'], clock: ['#2C2925', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'], globe: ['#2AABEE', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>'] };
  const coverSvg = (k, s) => { const c = COVERS[k] || COVERS.rocket; const light = ['#FFC21A', '#FFD23F', '#F0AE00'].includes(c[0]); return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="' + (light ? '#121110' : '#fff') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + c[1] + '</svg>'; };
  RV.route('blog', {
    async render(page, arg, stale) {
      const list = await RV.get('/api/admin/posts'); if (stale()) return;
      page.innerHTML = RV.header('Blog', 'Write posts for the Replyvoo blog.', '<button class="btn btn-y" data-new>' + ic('plus', 18) + 'New post</button>') +
        '<div class="card" style="padding:4px 14px"><div class="list">' + (list.length ? list.map((p, i) => '<button class="li" data-edit="' + i + '"><span class="sq" style="width:44px;height:44px;border-radius:13px;display:flex;align-items:center;justify-content:center;flex:0 0 44px;background:' + (COVERS[p.cover] || COVERS.rocket)[0] + '">' + coverSvg(p.cover, 20) + '</span><span class="li-main"><strong>' + esc(p.title) + '</strong><span>' + esc(p.category) + ' · ' + RV.date(p.published_at) + '</span></span><span class="li-end">' + (p.featured ? '<span class="pill p-y">FEATURED</span>' : '') + RV.statusPill(p.status) + '</span></button>').join('') : '<div class="empty"><strong>No posts yet</strong>Write your first one.</div>') + '</div></div>';
      page.onclick = async e => {
        if (e.target.closest('[data-new]')) return editPost(null);
        const ed = e.target.closest('[data-edit]');
        if (ed) { try { editPost(await RV.get('/api/admin/posts/' + list[+ed.dataset.edit].id)); } catch (err) { RV.fail(err); } }
      };
    }
  });
  const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  function editPost(orig) {
    const p = orig ? clone(orig) : { title: '', slug: '', description: '', category: 'Product', cover: 'rocket', keywords: '', read_time: '', body_md: '', featured: false, status: 'draft', published_at: new Date().toISOString() };
    p.featured = !!p.featured;
    let slugTouched = !!orig;
    const sh = RV.sheet({ title: orig ? 'Edit post' : 'New post', wide: true, save: 'Save post', body:
      '<div class="split"><div class="stack">' + F.text('title', 'Title', { req: true, max: 140 }) + F.text('slug', 'Link (slug)', { max: 60, hint: '<span id="slugH"></span>' }) + F.area('description', 'Short description', { rows: 2, max: 300 }) +
      '<div class="fg c2m">' + F.text('category', 'Category', { max: 30, ph: 'Product' }) + F.text('read_time', 'Read time', { max: 20, ph: 'auto' }) + '</div>' + F.text('keywords', 'Keywords', { max: 300, ph: 'telegram sales, ai agent' }) +
      '<div class="f"><span class="lbl">Cover</span><div class="covers" role="group" aria-label="Cover">' + Object.keys(COVERS).map(k => '<button type="button" class="cv" data-cv="' + k + '" aria-pressed="' + (p.cover === k) + '" aria-label="' + k + '"><span class="sq" style="background:' + COVERS[k][0] + '">' + coverSvg(k, 22) + '</span>' + k + '</button>').join('') + '</div></div>' +
      '<div class="fg c2" style="align-items:end">' + F.dt('published_at', 'Published date') + '<div class="f"><span class="lbl">Status</span>' + F.seg('status', [['draft', 'Draft'], ['published', 'Published', 's-live']], { w: true, label: 'Status' }) + '</div></div>' +
      '<div class="card" style="padding:4px 16px">' + F.tog('featured', 'Featured', 'Shown big at the top of the blog. Only one post can be featured.') + '</div>' +
      RV.mdEditor('body_md', 'Article (Markdown)', { req: true }) + '</div><div class="sticky"><div class="preview-lbl">' + ic('eye', 14) + 'Live preview</div><div class="md-prev" id="mdPrev"></div></div></div>',
      extra: orig ? '<button class="btn btn-red" data-delpost>' + ic('trash', 16) + 'Delete</button><a class="btn btn-g" href="/blog/' + esc(orig.slug) + '" target="_blank" rel="noopener">' + ic('ext', 16) + 'View</a>' : '',
      async onSave() {
        if (!p.slug) p.slug = slugify(p.title);
        if (orig) await RV.put('/api/admin/posts/' + orig.id, p); else await RV.post('/api/admin/posts', p);
        RV.toast(p.status === 'published' ? 'Post published' : 'Draft saved'); RV.render();
      } });
    const slugH = () => { $('#slugH', sh.el).textContent = '/blog/' + (p.slug || slugify(p.title) || '…'); };
    RV.bind(sh.body, p, (k, v) => { if (k === 'title' && !slugTouched) { p.slug = slugify(v); $('[data-k=slug]', sh.el).value = p.slug; } if (k === 'slug') slugTouched = true; slugH(); });
    slugH();
    const cover = () => {
      const c = COVERS[p.cover] || COVERS.rocket;
      return '<div class="cover" style="background:' + c[0] + '">' + coverSvg(p.cover, 56) + '</div>';
    };
    let html = '';
    const draw = () => { $('#mdPrev', sh.el).innerHTML = cover() + '<h1 style="font-size:26px;margin:14px 0 6px">' + esc(p.title || 'Untitled') + '</h1><p class="mut" style="margin:0 0 12px">' + esc(p.description) + '</p>' + html; };
    RV.wireMd(sh.body, h => { html = h; draw(); });
    sh.body.addEventListener('input', e => { if (e.target.dataset.k === 'title' || e.target.dataset.k === 'description') draw(); });
    sh.el.addEventListener('click', async e => {
      const cv = e.target.closest('[data-cv]');
      if (cv) { p.cover = cv.dataset.cv; $$('[data-cv]', sh.el).forEach(b => b.setAttribute('aria-pressed', String(b === cv))); sh.dirty = true; draw(); }
      if (e.target.closest('[data-delpost]')) { if (!(await RV.confirm({ title: 'Delete “' + orig.title + '”?', text: 'This can’t be undone.', ok: 'Delete', danger: true }))) return; try { await RV.del('/api/admin/posts/' + orig.id); RV.toast('Post deleted'); sh.close(true); RV.render(); } catch (err) { RV.fail(err); } }
    });
  }

  /* ================= LEGAL PAGES ================= */
  RV.route('legal', {
    async render(page, arg, stale) {
      const list = await RV.get('/api/admin/pages'); if (stale()) return;
      page.innerHTML = RV.header('Legal pages', 'Terms, privacy, refunds and other pages under /legal.', '<button class="btn btn-y" data-new>' + ic('plus', 18) + 'New page</button>') +
        '<div class="card" style="padding:4px 14px"><div class="list">' + (list.length ? list.map((p, i) => '<button class="li" data-edit="' + i + '"><span class="ico">' + ic('doc', 18) + '</span><span class="li-main"><strong>' + esc(p.title) + '</strong><span>/legal/' + esc(p.slug) + ' · updated ' + ago(p.updated_at) + '</span></span><span class="li-end">' + ic('right', 16) + '</span></button>').join('') : '<div class="empty"><strong>No pages</strong></div>') + '</div></div>';
      page.onclick = async e => {
        if (e.target.closest('[data-new]')) return editPage(null);
        const ed = e.target.closest('[data-edit]');
        if (ed) { try { editPage(await RV.get('/api/admin/pages/' + encodeURIComponent(list[+ed.dataset.edit].slug))); } catch (err) { RV.fail(err); } }
      };
    }
  });
  function editPage(orig) {
    const p = orig ? clone(orig) : { slug: '', title: '', description: '', body_md: '' };
    const sh = RV.sheet({ title: orig ? orig.title : 'New page', sub: orig ? '/legal/' + esc(orig.slug) : '', wide: true, save: 'Save page', body:
      '<div class="split"><div class="stack">' + (orig ? '' : F.text('slug', 'Link (slug)', { req: true, max: 60, ph: 'cookies', hint: 'Lowercase letters, numbers and dashes.' })) + F.text('title', 'Title', { req: true, max: 140 }) + F.text('description', 'Description (for Google)', { max: 300 }) + RV.mdEditor('body_md', 'Content (Markdown)', { rows: 18 }) + '</div><div class="sticky"><div class="preview-lbl">' + ic('eye', 14) + 'Live preview</div><div class="md-prev" id="lgPrev"></div></div></div>',
      extra: orig ? '<a class="btn btn-g" href="/legal/' + esc(orig.slug) + '" target="_blank" rel="noopener">' + ic('ext', 16) + 'View</a>' : '',
      async onSave() { const s = slugify(p.slug); if (!s) { RV.toast('Add a link (slug).', 'err'); return false; } await RV.put('/api/admin/pages/' + encodeURIComponent(s), p); RV.toast('Page saved'); RV.render(); } });
    RV.bind(sh.body, p);
    RV.wireMd(sh.body, h => { $('#lgPrev', sh.el).innerHTML = '<h1 style="font-size:26px;margin:0 0 10px">' + esc(p.title) + '</h1>' + h; });
  }

  /* ================= EMAILS ================= */
  RV.route('emails', {
    async render(page, arg, stale) {
      const d = await RV.get('/api/admin/emails'); if (stale()) return;
      const nice = n => n.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());
      const b = { subject: '', body_md: '', audience: 'all' };
      let tested = false;
      page.innerHTML = RV.header('Emails', 'Preview every automatic email, send tests and broadcast announcements.') +
        (d.provider === 'log' ? '<div class="warn" style="margin-bottom:14px">' + ic('info', 18) + '<span><strong>Emails aren’t really sent yet.</strong> MAIL_PROVIDER is “log”, so emails are printed to the server console. See Setup health on the Overview.</span></div>' : '') +
        '<div class="grid g2" style="align-items:start">' +
        '<section class="card"><div class="card-h"><div><h2>Templates</h2><p>Tap one to preview and test.</p></div></div><div class="list">' + d.templates.map((t, i) => '<button class="li" data-t="' + i + '"><span class="ico">' + ic('mail', 18) + '</span><span class="li-main"><strong>' + esc(nice(t.name)) + '</strong><span>' + esc(t.subject) + '</span></span>' + ic('right', 16) + '</button>').join('') + '</div></section>' +
        '<section class="card" id="bc"><div class="card-h"><div><h2>Broadcast</h2><p>Email an announcement to your users.</p></div></div><div class="stack">' + F.text('subject', 'Subject', { max: 140, req: true, ph: 'New: WhatsApp is coming' }) + RV.mdEditor('body_md', 'Message (Markdown)', { rows: 8, req: true, id: 'bcBody' }) +
        '<div class="f"><span class="lbl">Send to</span>' + F.seg('audience', [['all', 'Everyone'], ['paying', 'Paying'], ['free', 'Free plan']], { w: true, label: 'Audience' }) + '</div>' +
        '<div class="preview-lbl" style="margin:0">' + ic('eye', 14) + 'Preview</div><div class="md-prev" id="bcPrev" style="min-height:80px"></div>' +
        '<div class="row-wrap"><button class="btn btn-g" data-bt>' + ic('send', 16) + 'Send to me first</button><button class="btn btn-y" data-bs disabled>Send broadcast</button></div><span class="hint mut" id="bcHint" style="font-size:12.5px">Step 1: send it to yourself (' + esc(RV.user.email) + ') and check it. Step 2: send it to everyone.</span></div></section>' +
        '</div>' +
        '<section class="card" style="margin-top:14px"><div class="card-h"><div><h2>Email log</h2><p>Last 100 emails</p></div></div>' + (d.log.length ? '<div class="list">' + d.log.map(l => '<div class="li"><span class="li-main"><strong>' + esc(l.subject) + '</strong><span>' + esc(l.to_email) + ' · ' + esc(l.template) + ' · ' + ago(l.created_at) + (l.error ? ' · ' + esc(l.error) : '') + '</span></span>' + RV.statusPill(l.status) + '</div>').join('') + '</div>' : '<div class="empty">No emails sent yet.</div>') + '</section>';
      const bc = $('#bc', page);
      RV.bind(bc, b, () => { tested = false; $('[data-bs]', page).disabled = true; });
      RV.wireMd(bc, h => { $('#bcPrev', page).innerHTML = (b.subject ? '<strong style="font-size:17px">' + esc(b.subject) + '</strong><hr style="border:0;border-top:1px solid var(--line);margin:10px 0">' : '') + (h || '<span class="mut">Start typing to see a preview.</span>'); });
      page.addEventListener('click', async e => {
        const t = e.target.closest('[data-t]');
        if (t) return tplSheet(d.templates[+t.dataset.t], nice);
        const bt = e.target.closest('[data-bt]'), bs = e.target.closest('[data-bs]');
        if (bt || bs) {
          if (!RV.validate(bc)) return;
          if (b.body_md.trim().length < 5) return RV.toast('Write a longer message.', 'err');
          const aud = bt ? 'test' : b.audience;
          if (bs && !(await RV.confirm({ title: 'Send to ' + { all: 'everyone', paying: 'all paying customers', free: 'everyone on the free plan' }[b.audience] + '?', text: 'This can’t be undone. Emails go out one by one over the next few minutes.', ok: 'Send now' }))) return;
          const btn = bt || bs; btn.disabled = true;
          try {
            const r = await RV.post('/api/admin/broadcast', { subject: b.subject, body_md: b.body_md, audience: aud });
            if (bt) { tested = true; $('[data-bs]', page).disabled = false; $('#bcHint', page).textContent = 'Test sent to ' + RV.user.email + '. Looks good? Send it.'; RV.toast('Test sent to you'); }
            else { RV.toast('Broadcast queued for ' + fmt(r.count) + ' people'); b.subject = ''; b.body_md = ''; tested = false; RV.render(); }
          } catch (err) { RV.fail(err); }
          finally { btn.disabled = bs ? !tested : false; }
        }
      });
    }
  });
  function tplSheet(t, nice) {
    const url = '/api/admin/emails/' + encodeURIComponent(t.name) + '/preview';
    const st = { to: RV.user.email };
    const sh = RV.sheet({ title: nice(t.name), sub: esc(t.subject), wide: true, noFooter: true, body:
      '<div class="card"><div class="card-h"><div><h3>Send a test</h3><p>Uses sample data.</p></div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><input class="input" type="email" data-k="to" aria-label="Send test to" style="flex:1;min-width:200px"><button class="btn btn-y" data-send>' + ic('send', 16) + 'Send test</button></div><div id="tNote"></div></div>' +
      '<div class="row-wrap"><div class="seg" role="group" aria-label="Preview width"><button type="button" data-w="375" aria-pressed="true">' + ic('phone', 16) + 'Phone</button><button type="button" data-w="680" aria-pressed="false">' + ic('monitor', 16) + 'Desktop</button></div><a class="btn btn-g btn-sm" href="' + url + '" target="_blank" rel="noopener">' + ic('ext', 16) + 'Open</a></div>' +
      '<div class="frames"><div class="frame"><div class="frame-h" id="fw">375px</div><iframe title="Email preview" src="' + url + '" width="375" height="640" loading="lazy"></iframe></div></div>' });
    RV.bind(sh.body, st);
    sh.el.addEventListener('click', async e => {
      const w = e.target.closest('[data-w]');
      if (w) { const fr = $('iframe', sh.el); fr.width = Math.min(+w.dataset.w, sh.body.clientWidth - 40); $('#fw', sh.el).textContent = w.dataset.w + 'px'; $$('[data-w]', sh.el).forEach(b => b.setAttribute('aria-pressed', String(b === w))); }
      if (e.target.closest('[data-send]')) {
        if (!RV.validate(sh.body)) return;
        try { const r = await RV.post('/api/admin/emails/' + encodeURIComponent(t.name) + '/test', st); RV.toast(r.ok ? 'Test sent to ' + r.to : 'Sending failed. Check the email log.', r.ok ? '' : 'err'); $('#tNote', sh.el).innerHTML = r.note ? '<div class="note" style="margin-top:10px">' + esc(r.note) + '</div>' : ''; sh.dirty = false; } catch (err) { RV.fail(err); }
      }
    });
  }

  /* ================= ACTIVITY ================= */
  RV.route('activity', {
    async render(page, arg, stale) {
      const d = await RV.get('/api/admin/activity'); if (stale()) return;
      let tab = new URLSearchParams(location.search).get('tab') || 'clicks';
      const TABS = [['clicks', 'Clicks', d.clicks.reduce((s, c) => s + c.n, 0)], ['waitlist', 'Waitlist', d.waitlist.length], ['contact', 'Messages', d.contact.length], ['audit', 'Audit log', d.audit.length]];
      const body = () => {
        if (tab === 'clicks') return d.clicks.length ? '<div class="list">' + d.clicks.map(c => '<div class="li"><span class="ico">' + ic(c.target === 'joinvoo' ? 'link' : 'users', 18) + '</span><span class="li-main"><strong>' + esc(c.target === 'joinvoo' ? 'Joinvoo' : c.target === 'ref' ? 'Voo Squad referral' : c.target) + '</strong><span>from ' + esc(c.source || 'unknown') + '</span></span><strong class="tnum">' + fmt(c.n) + '</strong></div>').join('') + '</div>' : '<div class="empty">No tracked clicks yet.</div>';
        if (tab === 'waitlist') return '<div style="display:flex;justify-content:flex-end;margin-bottom:6px"><button class="btn btn-g btn-sm" data-csv' + (d.waitlist.length ? '' : ' disabled') + '>' + ic('download', 16) + 'Export CSV</button></div>' + (d.waitlist.length ? '<div class="list">' + d.waitlist.map(w => '<div class="li">' + RV.brandIcon(w.item.startsWith('telegram') ? 'telegram' : (['whatsapp', 'instagram', 'tiktok', 'messenger', 'website'].includes(w.item) ? w.item : 'telegram'), 32) + '<span class="li-main"><strong>' + esc(w.email || w.ws || '—') + '</strong><span>' + esc(CH_NAMES[w.item] || w.item) + (w.ws ? ' · ' + esc(w.ws) : '') + ' · ' + ago(w.created_at) + '</span></span></div>').join('') + '</div>' : '<div class="empty">No waitlist entries yet.</div>');
        if (tab === 'contact') return d.contact.length ? '<div class="stack" style="gap:10px">' + d.contact.map(c => '<div style="border:1px solid var(--line);border-radius:16px;padding:12px 14px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><strong>' + esc(c.name || c.email) + '</strong><span class="row-wrap"><span class="pill ' + (c.source === 'sales' ? 'p-y' : 'p-mut') + '">' + esc(c.source) + '</span><span class="mut" style="font-size:12.5px">' + ago(c.created_at) + '</span></span></div><p style="margin:6px 0 10px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px">' + esc(c.message) + '</p><a class="btn btn-g btn-sm" href="mailto:' + esc(c.email) + '?subject=' + encodeURIComponent('Re: your message to Replyvoo') + '&body=' + encodeURIComponent('\n\n> ' + c.message.slice(0, 500).split('\n').join('\n> ')) + '">' + ic('mail', 16) + 'Reply to ' + esc(c.email) + '</a></div>').join('') + '</div>' : '<div class="empty">No messages yet.</div>';
        return d.audit.length ? '<div class="list">' + d.audit.map(a => { let data = ''; try { const o = JSON.parse(a.data); data = Object.entries(o).filter(([, v]) => v != null && v !== '').slice(0, 4).map(([k, v]) => k + ': ' + (typeof v === 'object' ? JSON.stringify(v) : v)).join(' · '); } catch (e) { data = ''; } return '<div class="li"><span class="li-main"><strong>' + esc(a.action) + '</strong><span>' + esc(a.email || 'system') + ' · ' + ago(a.created_at) + (data ? ' · ' + esc(data.slice(0, 140)) : '') + '</span></span></div>'; }).join('') + '</div>' : '<div class="empty">Nothing yet.</div>';
      };
      const draw = () => {
        page.innerHTML = RV.header('Activity', 'Clicks, waitlists, messages from the website and everything admins changed.') +
          '<div class="chips" role="group" aria-label="Activity type" style="margin-bottom:14px">' + TABS.map(([k, l, n]) => '<button class="chip' + (k === tab ? ' on' : '') + '" data-tab="' + k + '" aria-pressed="' + (k === tab) + '">' + l + ' <span class="tnum" style="opacity:.7">' + fmt(n) + '</span></button>').join('') + '</div>' +
          '<div class="card" style="padding:8px 16px">' + body() + '</div>';
      };
      draw();
      page.onclick = e => {
        const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; history.replaceState({}, '', '/admin/activity?tab=' + tab); draw(); return; }
        if (e.target.closest('[data-csv]')) RV.csv('replyvoo-waitlist-' + new Date().toISOString().slice(0, 10) + '.csv', [['channel', 'email', 'workspace', 'joined']].concat(d.waitlist.map(w => [w.item, w.email, w.ws || '', w.created_at])));
      };
    }
  });
})();
