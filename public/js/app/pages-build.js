/* Replyvoo dashboard pages: My Closers, Agent Studio, Channels, Blast, Juno. */
(function () {
  'use strict';
  const RV = window.RV;
  const { $, esc, fmt, GET, PUT, POST, DEL, toast, fail, go, ic } = RV;
  const S = RV.S;
  const panel = (cls, head, body, attrs) => RV.panel(cls, head, body, attrs);

  /* ======================= MY AI ======================= */
  async function closers(ctx) {
    const [list] = await Promise.all([RV.loadClosers(true), RV.loadChannels(true)]);
    if (!ctx.ok()) return;
    RV.paintChrome();
    const u = S.boot.usage, mgr = RV.isManager(), lim = u.closers_limit, used = list.length;
    const studio = RV.flag('studio');
    const newBtn = mgr && studio ? '<button class="btn btn-jade" data-newc>' + ic('plus', '#121110', 18, 2.6) + (list.length ? 'Make another helper' : 'Make my AI helper') + '</button>' : '';
    ctx.el.innerHTML = (list.length ? '<section class="panel a-in" style="flex-direction:row;flex-wrap:wrap;align-items:center;gap:16px"><span class="col" style="gap:4px;flex:1 1 260px;min-width:0"><strong style="font-size:17px">Your AI helpers ' + RV.whats('helper') + '</strong><span class="muted small">' + used + ' of ' + (lim > 9000 ? 'unlimited' : lim) + ' on your ' + esc(u.plan.name) + ' plan. Each one answers your customers for you.</span></span>' + (used < lim ? newBtn : '') + '</section>' : '') +
      (list.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">' + list.map((c, i) => {
        const t = RV.tpl(c.template), ch = c.channels || [], sc = c.score || 0;
        return '<article class="card a-in" style="animation-delay:' + (i * 0.06) + 's;padding:18px;border-radius:24px;display:flex;flex-direction:column;gap:12px">' +
          '<div class="row" style="gap:12px">' + RV.closerBot((c.persona && c.persona.color) || t.color, 60, c.name.charAt(0)) + '<span class="col grow" style="gap:0;line-height:1.25;min-width:0"><strong class="ell" style="font-size:20px;letter-spacing:-0.03em">' + esc(c.name) + '</strong><span style="font-size:13.5px;color:var(--mut);font-weight:600">' + esc(RV.roleOf(c.template)) + '</span></span>' +
          (mgr ? '<button class="toggle ' + (c.active ? 'on' : 'off') + '" data-ctog="' + c.id + '" aria-label="' + esc(c.name) + ' is ' + (c.active ? 'on' : 'paused') + '. Tap to change." aria-pressed="' + c.active + '"><span></span></button>' : '<span class="pill" style="background:' + (c.active ? '#E8F6EC;color:#1E6B3A' : '#F2F0EA;color:#5E5A50') + '">' + (c.active ? 'On' : 'Paused') + '</span>') + '</div>' +
          (studio ? '<a href="/app/studio?id=' + c.id + '&coach=5" class="cl-score" aria-label="' + esc(c.name) + ' is ' + sc + '% ready">' + RV.scoreRing(sc, 40) + '<span class="col" style="gap:0;line-height:1.25;min-width:0"><b style="font-size:14px">' + esc(c.name) + ' is ' + sc + '% ready ' + RV.whats('score') + '</b><span style="font-size:12.5px;color:var(--mut)">' + (sc >= 80 ? 'Great. Keep fixing answers when you see them.' : 'Teach a few more answers to get it higher.') + '</span></span></a>' : '') +
          (c.locked ? '<a href="/app/plan" class="pill" style="align-self:flex-start;background:#121110;color:#FFC21A;text-decoration:none;padding:6px 11px">Paused: your plan has fewer helpers · See plans →</a>' : '') +
          (studio && c.gaps ? '<a href="/app/studio?id=' + c.id + '&tab=gaps" class="pill" style="align-self:flex-start;background:#FFF0EC;color:#9A2A12;text-decoration:none;padding:6px 11px">' + c.gaps + (c.gaps === 1 ? ' question' : ' questions') + ' it couldn’t answer →</a>' : '') +
          '<span style="font-size:13.5px;color:var(--mut)">' + (ch.length ? 'Answers on ' + ch.map(x => '<strong style="color:var(--ink)">' + esc(RV.placeName(x)) + '</strong>').join(', ') : 'Not answering anywhere yet. <a href="/app/channels" style="font-weight:800">Choose a place</a>') + '</span>' +
          '<div class="row" style="gap:8px;margin-top:auto">' + (studio ? '<a class="btn btn-ink btn-sm grow" href="/app/studio?id=' + c.id + '">' + (mgr ? 'Train ' + esc(c.name) : 'See ' + esc(c.name)) + '</a>' : '') + '<a class="btn btn-ghost btn-sm grow" href="/app/inbox">Chats</a></div></article>';
      }).join('') + '</div>' + (used >= lim && mgr ? '<p class="small muted" style="margin:0">Want another helper? <button class="btn-link small" data-newc style="font-weight:800">See how</button></p>' : '')
        : '<section class="panel a-in">' + RV.empty('Make your first AI helper', 'Tell it what you sell. It answers your customers day and night.', newBtn || '<p class="small">Ask the shop owner to make one.</p>', RV.closerBot('#FFC21A', 90, 'A')) + '</section>');
    ctx.el.querySelectorAll('[data-newc]').forEach(b => b.addEventListener('click', newCloser));
    ctx.el.querySelectorAll('[data-ctog]').forEach(b => b.addEventListener('click', async () => {
      const id = +b.getAttribute('data-ctog'), c = list.find(x => x.id === id), on = !c.active;
      b.className = 'toggle ' + (on ? 'on' : 'off'); b.disabled = true;
      try { await PUT('/api/app/closers/' + id, { active: on }); c.active = on; toast(c.name + (on ? ' is on again' : ' is paused. It won’t answer anyone.')); RV.paintChrome(); }
      catch (e) { b.className = 'toggle ' + (c.active ? 'on' : 'off'); fail(e); }
      b.disabled = false; b.setAttribute('aria-pressed', c.active);
    }));
  }
  function newCloser() {
    const u = S.boot.usage;
    void u;
    if ((S.closers || []).length >= u.closers_limit) { RV.closerFull(); return; }
    go('/app/studio');
  }
  RV.route('closers', { render: closers });

  /* Agent Studio lives in pages-studio.js. */
  function chanLabel(type) { return { telegram_bot: 'Telegram', telegram_business: 'Telegram account', telegram_group: 'Telegram group', website: 'Website chat', whatsapp: 'WhatsApp', joinvoo_bot: 'Telegram bot · via Joinvoo', joinvoo_account: 'Manager’s Telegram · via Joinvoo' }[type] || 'Telegram'; }
  RV.chanLabel = chanLabel;

  /* ======================= PLACES YOUR AI ANSWERS (Channels) ======================= */
  async function channels(ctx) {
    const [list] = await Promise.all([RV.loadChannels(true), RV.loadClosers(), RV.refreshBoot()]);
    if (!ctx.ok()) return;
    const mgr = RV.isManager(), b = S.boot, cat = b.channels_catalog || [];
    const fBot = RV.chan('telegram_bot'), fBiz = RV.chan('telegram_business'), fGrp = RV.chan('telegram_group');
    const bots = list.filter(c => c.type === 'telegram_bot');
    const others = cat.filter(c => c.id !== 'telegram' && c.id !== 'website' && c.id !== 'whatsapp' && RV.chan(c.flag) !== 'off');
    const fWeb = RV.chan('website'), sites = list.filter(RV.isSite), link = list.find(RV.isLink);
    const wl = new Set(b.waitlist || []);
    const nm = ((S.closers || [])[0] || {}).name || 'your AI helper';
    const multi = (S.closers || []).length > 1;
    const stateOf = c => c.status !== 'active' ? ['#FFE3D6', '#9A3412', 'Off'] : !c.closer_id ? ['#FFF3CC', '#7A5800', 'No AI helper yet'] : c.type === 'website' && c.unlocked === false ? ['#FFE3D6', '#9A3412', 'Paused · plan'] : ['#E8F6EC', '#1E6B3A', 'Answering'];
    const row = c => '<div class="row" style="gap:14px;flex-wrap:wrap;border:1px solid var(--line);border-radius:20px;padding:12px 14px">' + (RV.isLink(c) ? '<span class="fr-ic">' + ic('link', '#121110', 22, 2.4) + '</span>' : RV.brandIcon(c.type === 'website' ? 'website' : c.type === 'whatsapp' ? 'whatsapp' : 'telegram', 44)) +
      (c.type === 'whatsapp' ? RV.wa.connectedRow(c) : '<span class="col grow" style="gap:0;min-width:160px"><strong class="ell">' + esc(RV.placeName(c)) + '</strong><span class="small muted">' + (RV.isLink(c) ? esc((c.link_url || '').replace(/^https?:\/\//, '')) : c.type === 'website' ? (c.domains && c.domains.length ? esc(c.domains.slice(0, 2).join(', ')) : 'No website address yet') : esc(c.name || '')) + ' · ' + fmt(c.chats) + ' chats</span></span>') +
      (RV.jv && RV.jv.isType(c.type) ? '<span class="small muted" style="flex-basis:100%;order:9">' + (c.type === 'joinvoo_account' ? esc(c.via_label || 'via Joinvoo') + '. Joinvoo is connected to this account through Telegram Business and keeps tracking its ads and deposits. Your AI helper replies from the manager’s own Telegram.' : 'Joinvoo keeps this bot and keeps tracking its ads and deposits. Your AI helper answers its chats here in Chats.') + ' To stop, pick Team inbox in Joinvoo, or disconnect it here.</span>' : '') +
      '<span class="pill" style="background:' + stateOf(c)[0] + ';color:' + stateOf(c)[1] + '">' + stateOf(c)[2] + '</span>' +
      (RV.isLink(c) ? '<button class="btn btn-ink btn-sm" data-showlink>Show link</button>' : c.type === 'website' ? '<a class="btn btn-ink btn-sm" href="/app/widget?id=' + c.id + '">Set up</a>' : '') +
      (mgr ? (multi || !c.closer_id ? '<label class="sr" for="chc' + c.id + '">Which AI helper answers ' + esc(RV.placeName(c)) + '</label><select class="input" id="chc' + c.id + '" data-chcl="' + c.id + '" style="width:auto;min-width:140px;padding:9px 36px 9px 12px;font-size:14px;border-radius:999px"><option value="0">No AI helper</option>' + (S.closers || []).map(x => '<option value="' + x.id + '"' + (x.id === c.closer_id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select>' : '') + (RV.isLink(c) ? '' : '<button class="btn btn-ghost btn-sm" data-chdel="' + c.id + '">Disconnect</button>') : '') + '</div>';
    const mock = id => {
      const lines = { instagram: [['in', 'Replied to your story: price? 😍'], ['out', 'It’s $24. Shall I send the link?'], ['in', 'Send it!']], tiktok: [['in', 'Saw your video, how do I order?'], ['out', 'Easy! Tap the link and pick your size.'], ['in', 'Done ✅']], messenger: [['in', 'Are you open on Sunday?'], ['out', 'We are, 10am to 4pm!'], ['in', 'See you then']] }[id] || [];
      const col = { instagram: ['#FFF0F5', '#E1306C'], tiktok: ['#F2F0EA', '#121110'], messenger: ['#EFEDFF', '#6D5BFF'] }[id] || ['#F2F0EA', '#121110'];
      return '<div class="soon-mock" style="background:' + col[0] + '">' + lines.map((l, i) => '<span class="mb" style="animation-delay:' + (i * 1.1) + 's;' + (l[0] === 'out' ? 'align-self:flex-end;background:' + col[1] + ';color:#fff' : 'align-self:flex-start;background:#fff') + '">' + esc(l[1]) + '</span>').join('') + '</div>';
    };
    const card = (icon, title, sub, body, act, extra) => '<section class="connect-card a-in" style="background:#fff;border:1px solid var(--line)' + (extra || '') + '"><div class="row" style="gap:12px">' + icon + '<span class="col" style="gap:0;min-width:0"><strong style="font-size:17px">' + title + '</strong><span class="small muted">' + sub + '</span></span></div>' + (body || '') + (act || '') + '</section>';
    const webAct = fWeb === 'live' ? (sites.length ? '<a class="btn btn-ink" href="/app/widget" style="margin-top:auto">Open website chat</a>' : mgr ? '<button class="btn btn-ink" data-addweb style="margin-top:auto">Add website chat</button>' : '<p class="small muted" style="margin:0">Ask the shop owner to add it.</p>') + (RV.webCanAdd() || sites.length ? '' : '<span class="small muted">Included in Pro. Or add it to any plan for $29 a month.</span>') : soonBtn('website', wl);
    ctx.el.innerHTML =
      '<section class="panel a-in" style="gap:6px"><strong style="font-size:clamp(24px,3vw,32px);letter-spacing:-0.04em;line-height:1.1">Where should ' + esc(nm) + ' answer?</strong><span class="muted">Pick a place. You can add more later.</span></section>' +
      (list.length ? RV.panel('a-in', '<strong>Answering now</strong>', '<div class="col" style="gap:10px">' + list.map(row).join('') + '</div>')
        : RV.panel('a-in', '', RV.empty(esc(nm) + ' isn’t answering anywhere yet', 'Start with your chat link. It’s ready now and it’s free.', mgr ? '<button class="btn btn-jade" data-mklink>Make my chat link</button>' : '', '<span class="fr-ic" style="width:72px;height:72px;flex-basis:72px;border-radius:22px">' + ic('link', '#121110', 34, 2.4) + '</span>'))) +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">' +
      (fWeb !== 'off' && !link ? card('<span class="fr-ic">' + ic('link', '#121110', 22, 2.4) + '</span>', 'Chat link <span class="fr-tag">Free</span>', 'Easiest. Share it anywhere. No website needed.', '<p class="small muted" style="margin:0">A chat page with its own link and QR code. Put it in your bio, your status or on a card. ' + RV.whats('link') + '</p>', link ? '<button class="btn btn-ink" data-showlink style="margin-top:auto">Show my chat link</button>' : mgr ? '<button class="btn btn-ink" data-mklink style="margin-top:auto">Make my chat link</button>' : '', ';border-color:var(--ink);box-shadow:0 0 0 3px var(--mint2)') : '') +
      (fBot !== 'off' ? card(RV.brandIcon('telegram', 48), 'Telegram', esc(nm) + ' answers your Telegram. Takes about 3 minutes.', '<p class="small muted" style="margin:0">We show you each step with pictures. You copy, paste, done. ' + RV.whats('botfather', 'What is BotFather?') + '</p>', fBot === 'live' ? (mgr ? '<button class="btn btn-ink" data-wizard style="margin-top:auto">Connect Telegram</button>' : '<p class="small muted" style="margin:0">Ask the shop owner to connect it.</p>') : soonBtn('telegram_bot', wl)) : '') +
      '<div id="waCard" style="display:contents">' + RV.wa.connectCard(list, mgr, soonBtn, wl) + '</div>' +
      (fWeb !== 'off' ? card(RV.brandIcon('website', 48), 'My website', 'A chat bubble on your own website.', '<p class="small muted" style="margin:0">Pick a colour, copy one line of code, paste it on your site. ' + RV.whats('web') + '</p>', webAct) : '') + '</div>' +
      '<details class="panel a-in" style="gap:12px"><summary style="cursor:pointer;font-weight:800;list-style:none" class="row">' + ic('plus', '#121110', 16, 2.6) + '<span>More places</span><span class="small muted" style="font-weight:600">Telegram account, groups, coming soon</span></summary>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:12px">' +
      (fBiz !== 'off' ? card(RV.brandIcon('telegram', 44), 'Your own Telegram account', 'Needs Telegram Premium, and a bot first', '<ol class="steps light" style="margin:0"><li>Connect Telegram above first' + (bots.length ? ' <span class="pill" style="background:#1E6B3A;color:#fff">done ✓</span>' : '') + '</li><li>In Telegram open <strong>Settings → Telegram Business → Chatbots</strong></li><li>Type your bot’s username' + (bots.length ? ': ' + bots.map(x => '<button class="pill" data-copyu="@' + esc(x.username) + '" style="background:var(--jade);color:var(--ink);border:0;cursor:pointer">@' + esc(x.username) + ' ⧉</button>').join(' ') : '') + '</li></ol>', fBiz === 'live' ? '' : soonBtn('telegram_business', wl)) : '') +
      (fGrp !== 'off' ? card(RV.brandIcon('telegram', 44), 'Telegram group ' + RV.whats('guard'), 'Welcomes people and deletes spam', '<p class="small muted" style="margin:0">Want your AI in your Telegram group? It can welcome people and delete spam. Add your bot to the group and make it an admin.</p>', fGrp === 'live' ? (mgr && RV.flag('studio') ? '<a class="btn btn-ink" href="/app/studio?template=guard" style="margin-top:auto">Set up group helper</a>' : '') : soonBtn('telegram_group', wl)) : '') +
      others.map(c => { const st = RV.chan(c.flag); return '<article class="soon-tile">' + mock(c.id) + '<div class="row" style="gap:12px">' + RV.brandIcon(c.id, 40) + '<span class="col grow" style="gap:0"><strong>' + esc(c.name) + '</strong><span class="pill" style="align-self:flex-start;background:' + (st === 'live' ? '#E8F6EC;color:#1E6B3A' : 'var(--mint);color:var(--jade-dd)') + '">' + (st === 'live' ? 'Available' : 'Coming soon') + '</span></span></div>' + (st === 'live' ? '<a class="btn btn-ink btn-sm" href="/contact?channel=' + esc(c.id) + '" style="margin-top:auto">Talk to us to connect</a>' : soonBtn(c.id, wl)) + '</article>'; }).join('') + '</div></details>';
    ctx.el.querySelectorAll('[data-wizard]').forEach(x => x.addEventListener('click', () => RV.tgWizard({ onDone: () => channels(ctx) })));
    RV.wa.bindChannels(ctx.el, async () => { await Promise.all([RV.loadClosers(true), RV.refreshBoot()]); if (ctx.ok()) channels(ctx); });
    ctx.el.querySelectorAll('[data-addweb]').forEach(x => x.addEventListener('click', () => { if (RV.webCanAdd()) go('/app/widget?new=1'); else RV.websiteLocked(); }));
    ctx.el.querySelectorAll('[data-copyu]').forEach(x => x.addEventListener('click', () => RV.copy(x.getAttribute('data-copyu'), 'Username copied')));
    ctx.el.querySelectorAll('[data-mklink]').forEach(x => x.addEventListener('click', async () => { RV.busy(x, true, 'Making it…'); try { const ch = await POST('/api/app/channels/link', {}); await RV.loadChannels(true); RV.confetti(30); showLink(ch); channels(ctx); } catch (e) { RV.busy(x, false); fail(e); } }));
    ctx.el.querySelectorAll('[data-showlink]').forEach(x => x.addEventListener('click', () => showLink(link)));
    ctx.el.querySelectorAll('[data-wl]').forEach(x => x.addEventListener('click', async () => {
      const item = x.getAttribute('data-wl'); RV.busy(x, true);
      try { await POST('/api/app/waitlist', { item }); (S.boot.waitlist = S.boot.waitlist || []).push(item); x.outerHTML = '<span class="pill a-pop" style="background:#E8F6EC;color:#1E6B3A;padding:10px 14px;align-self:flex-start;margin-top:auto">✓ You’re on the list</span>'; toast('You’re on the list. We’ll email you the day it opens.'); }
      catch (e) { RV.busy(x, false); fail(e); }
    }));
    ctx.el.querySelectorAll('[data-chcl]').forEach(sel => sel.addEventListener('change', async () => {
      try { await PUT('/api/app/channels/' + sel.getAttribute('data-chcl'), { closer_id: +sel.value }); toast(+sel.value ? ((S.closers || []).find(x => x.id === +sel.value) || {}).name + ' answers here now' : 'No AI helper here now'); RV.loadClosers(true); RV.loadChannels(true); }
      catch (e) { fail(e); }
    }));
    ctx.el.querySelectorAll('[data-chdel]').forEach(x => x.addEventListener('click', async () => {
      const c = list.find(y => y.id === +x.getAttribute('data-chdel'));
      if (!(await RV.confirmBox('Disconnect ' + RV.placeName(c) + '?', (c.type === 'website' ? 'The chat leaves your website right away. Your chats and customers stay.' : c.type === 'whatsapp' ? 'Your AI stops answering this WhatsApp number right away. Your chats stay. You can connect it again anytime.' : c.type === 'joinvoo_bot' || c.type === 'joinvoo_account' ? 'Your AI helper stops answering here. Joinvoo is told, and its Team inbox answers again. Your chats stay.' : 'Your AI stops answering there right away. Your chats stay. You can connect again anytime with the same code.'), 'Disconnect', true))) return;
      try { await DEL('/api/app/channels/' + c.id); toast('Disconnected'); await Promise.all([RV.loadClosers(true), RV.refreshBoot()]); channels(ctx); }
      catch (e) { fail(e); }
    }));
    if (ctx.q.add === 'telegram' && mgr && fBot === 'live') { history.replaceState({}, '', '/app/channels'); RV.tgWizard({ onDone: () => channels(ctx) }); }
    if (ctx.q.add === 'whatsapp') { history.replaceState({}, '', '/app/channels'); const w = $('waCard'); if (w && w.firstElementChild) w.firstElementChild.scrollIntoView({ block: 'center' }); }
  }
  function showLink(ch) {
    if (!ch) return;
    const url = ch.link_url, short = url.replace(/^https?:\/\//, '');
    RV.modal('<div class="col" style="gap:14px;align-items:center;text-align:center"><strong class="h3">Your chat link</strong><p class="muted" style="margin:0">Anyone can open it and chat with your AI helper. Share it anywhere.</p>' + RV.qrSvg(url, 200, { label: 'QR code for ' + short }) +
      '<div class="copy-row" style="width:100%"><span class="mono">' + esc(short) + '</span></div><div class="row" style="gap:8px;width:100%;flex-wrap:wrap"><button class="btn btn-ink grow" id="slCopy">' + ic('copy', '#FFC21A', 16, 2.4) + 'Copy link</button><a class="btn btn-ghost grow" href="' + esc(url) + '" target="_blank" rel="noopener">Open it</a></div>' +
      '<p class="small muted" style="margin:0">Tip: put it in your Instagram bio, your WhatsApp status, or print the QR code.</p></div>', { label: 'Your chat link' });
    $('slCopy').addEventListener('click', () => RV.copy(url, 'Chat link copied'));
  }
  RV.showChatLink = showLink;
  function soonBtn(item, wl) { return wl.has(item) ? '<span class="pill" style="background:#E8F6EC;color:#1E6B3A;padding:10px 14px;align-self:flex-start;margin-top:auto">✓ You’re on the list</span>' : '<button class="btn btn-ghost btn-sm" data-wl="' + esc(item) + '" style="margin-top:auto;align-self:flex-start">Tell me when it’s ready</button>'; }
  // Server error codes → plain words (invalid code vs. Telegram not reachable are different problems).
  function friendlyTg(e) {
    if (e.code === 'invalid_token' || e.code === 'telegram_error') return 'Telegram said no to this code. Copy it again from BotFather (the long line with a colon), then paste it here. If it still fails, tap “Stuck? We’ll help”.';
    if (e.code === 'telegram_unreachable' || e.status === 0) return 'We couldn’t reach Telegram just now. Wait a minute, then tap Connect again.';
    if (e.code === 'channel_limit') return e.message;
    return e.message;
  }
  const TOKEN = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;
  // Telegram, for a child: one step per screen, a picture, one sentence, one button. Copy buttons for everything.
  RV.tgWizard = function (opts) {
    opts = opts || {};
    let step = 1, token = '', closerId = ((S.closers || [])[0] || {}).id || 0, busy = false;
    const shop = (S.boot && S.boot.workspace && S.boot.workspace.name) || 'My shop';
    const base = shop.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'myshop';
    const users = [base + '_bot', base + '2_bot', base + 'shop_bot'];
    const desk = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    const nm = ((S.closers || [])[0] || {}).name || 'Your AI helper';
    const pic = n => {
      const bub = (me, t, mono) => '<div class="' + (me ? 'bub-me' : 'bub-in') + '" style="font-size:12px;padding:7px 10px;' + (me ? 'background:#2AABEE;' : '') + (mono ? 'font-family:ui-monospace,monospace;' : '') + '">' + t + '</div>';
      const msgs = { 1: '', 2: bub(true, '/newbot'), 3: bub(true, '/newbot') + bub(false, 'How are we going to call it?') + bub(true, esc(shop)), 4: bub(false, 'Now choose a username. It must end in “bot”.') + bub(true, esc(users[0])), 5: bub(false, 'Done! Use this token:') + bub(false, '<mark style="background:#FFE58A;border-radius:4px;padding:0 2px">123456789:AAH…</mark>', true) }[n];
      const finger = '<span class="tg-finger" aria-hidden="true">👆</span>';
      const body = n === 1 ? '<div class="col" style="flex:1;align-items:center;justify-content:center;gap:8px;background:#fff">' + RV.brandIcon('telegram', 54) + '<strong style="font-size:14px">BotFather <span style="color:#2AABEE">✓</span></strong><span class="tg-start">START' + finger + '</span></div>'
        : '<div class="col" style="flex:1;padding:10px;gap:6px;justify-content:flex-end;background:#DCE8F0">' + msgs + '</div><div class="tg-input">' + (n === 2 ? '/newbot' + finger : n === 5 ? 'Tap and hold the code, then Copy' : 'Message') + '</div>';
      return '<div class="phone tg-phone"><div class="phone-screen" style="height:250px;border-radius:26px;display:flex;flex-direction:column"><div class="row" style="background:#fff;padding:10px 12px 8px;gap:8px;border-bottom:1px solid var(--line)">' + RV.brandIcon('telegram', 24) + '<strong style="font-size:12.5px">BotFather</strong></div>' + body + '</div></div>';
    };
    const copyBtn = (v, label) => '<button type="button" class="btn btn-ink" data-cp="' + esc(v) + '" style="width:100%">' + ic('copy', '#FFC21A', 16, 2.4) + esc(label) + '</button>';
    function draw(err) {
      const help = '<button type="button" class="btn-link small" data-help data-help-topic="telegram" style="color:var(--mut);font-weight:700">Stuck? We’ll help</button>';
      let title, text, act, extra = '';
      if (step === 1) { title = 'Open Telegram’s helper'; text = 'Telegram has a helper called BotFather. It makes a new account for ' + esc(nm) + '. It has a blue tick ✓.'; act = '<a class="btn btn-main" href="https://t.me/BotFather" target="_blank" rel="noopener" data-next style="width:100%;justify-content:space-between">Open BotFather<span class="arr">' + ic('right', '#121110', 18, 2.6) + '</span></a>'; if (desk) extra = '<div class="row" style="gap:12px;align-items:center;background:var(--soft);border-radius:16px;padding:10px">' + RV.qrSvg('https://t.me/BotFather', 92, { label: 'QR code to open BotFather on your phone' }) + '<span class="small muted">On a computer? Scan this with your phone to do it there.</span></div>'; }
      else if (step === 2) { title = 'Tap START, then type /newbot'; text = 'Tap the <b>START</b> button at the bottom. Then send <b>/newbot</b>. You can copy it here.'; act = copyBtn('/newbot', 'Copy /newbot'); }
      else if (step === 3) { title = 'Give it a name'; text = 'BotFather asks for a name. Type your shop name, like <b>' + esc(shop) + '</b>. Send it.'; act = copyBtn(shop, 'Copy my shop name'); }
      else if (step === 4) { title = 'Give it a username'; text = 'It must end in <b>bot</b>. Try <b>' + esc(users[0]) + '</b>.'; act = copyBtn(users[0], 'Copy this username'); extra = '<p class="small muted" style="margin:0">Taken? Try one of these: ' + users.slice(1).map(u => '<button type="button" class="pill" data-cp="' + esc(u) + '" style="border:1px solid var(--line);background:#fff;cursor:pointer">' + esc(u) + ' ⧉</button>').join(' ') + '</p>'; }
      else { title = 'Copy the long code'; text = 'BotFather sends a long code with a colon in it. Tap and hold it, then tap <b>Copy</b>. Then paste it here.'; act = '<form id="wzForm" class="col" style="gap:10px" novalidate><div class="field"><label class="lbl" for="wzTok">Your bot’s code</label><div class="row" style="gap:8px"><input id="wzTok" class="input mono" placeholder="123456789:AAH…" autocomplete="off" spellcheck="false" autocapitalize="off" value="' + esc(token) + '" style="flex:1;min-width:0"><button type="button" class="btn btn-ghost" id="wzPaste">Paste</button></div></div>' +
          ((S.closers || []).length > 1 ? '<div class="field"><label class="lbl" for="wzCl">Which AI helper answers?</label><select id="wzCl" class="input">' + S.closers.map(c => '<option value="' + c.id + '"' + (c.id === closerId ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></div>' : '') +
          (err ? '<div class="err" role="alert">' + esc(err) + '</div>' : '') + '<p class="small" style="margin:0;color:#7A5800;font-weight:700">🔑 This code is like a key. Only paste it here. Never share it in a chat.</p><button class="btn btn-main" type="submit" id="wzGo" style="width:100%;justify-content:space-between">Connect<span class="arr">' + ic('right', '#121110', 18, 2.6) + '</span></button></form>'; }
      const dfy = ((S.boot && S.boot.addons) || []).find(a => /done.?for.?you|setup/i.test(a.slug + ' ' + a.name) && a.status === 'live' && a.price > 0);
      RV.modal('<div class="col" style="gap:14px"><div class="row" style="justify-content:space-between;gap:8px;padding-right:36px"><span class="eyebrow">Step ' + step + ' of 5</span>' + help + '</div><div class="su-bars" style="grid-template-columns:repeat(5,1fr)">' + [1, 2, 3, 4, 5].map(i => '<span class="' + (i < step ? 'done' : i === step ? 'cur' : '') + '"></span>').join('') + '</div>' +
        pic(step) + '<strong class="h3">' + title + '</strong><p class="muted" style="margin:0;font-size:16px">' + text + '</p>' + act + extra +
        '<div class="row" style="gap:8px">' + (step > 1 ? '<button class="btn btn-ghost" data-wz="back">Back</button>' : '') + (step < 5 ? '<button class="btn btn-ghost grow" data-wz="next">' + (step === 1 ? 'I opened it. Next' : 'Done. Next') + '</button>' : '') + '</div>' +
        (dfy && step === 1 ? '<button type="button" class="btn-link small" id="wzDfy" style="color:var(--mut);font-weight:700;align-self:center">Want us to do it for you? ' + esc(dfy.price_text || '') + '</button>' : '') + '</div>', { label: 'Connect Telegram', noFocus: step < 5 });
      RV.qsa('#modalRoot [data-wz]').forEach(x => x.addEventListener('click', () => { const t = $('wzTok'); if (t) token = t.value; step += x.getAttribute('data-wz') === 'next' ? 1 : -1; draw(); }));
      RV.qsa('#modalRoot [data-next]').forEach(x => x.addEventListener('click', () => setTimeout(() => { step = 2; draw(); }, 400)));
      RV.qsa('#modalRoot [data-cp]').forEach(x => x.addEventListener('click', () => RV.copy(x.getAttribute('data-cp'), 'Copied. Now paste it in Telegram.')));
      const dy = $('wzDfy'); if (dy) dy.addEventListener('click', () => { RV.closeModal(); RV.checkout({ kind: 'addon', item_id: dfy.slug }); });
      const f = $('wzForm'); if (!f) return;
      const inp = $('wzTok');
      const tryAuto = () => { const v = inp.value.replace(/\s/g, ''); if (TOKEN.test(v) && !busy) f.requestSubmit(); };
      inp.addEventListener('input', () => { token = inp.value; tryAuto(); });
      inp.addEventListener('paste', () => setTimeout(tryAuto, 30));
      $('wzPaste').addEventListener('click', async () => { try { const t = await navigator.clipboard.readText(); inp.value = t.trim(); token = inp.value; tryAuto(); if (!TOKEN.test(inp.value.replace(/\s/g, ''))) draw('That’s not the code yet. It looks like numbers, a colon, then letters, like 123456789:AAH…'); } catch (e) { inp.focus(); toast('Tap and hold the box, then tap Paste.', 'info'); } });
      f.addEventListener('submit', async e => {
        e.preventDefault();
        token = inp.value.replace(/\s/g, ''); const cl = $('wzCl'); if (cl) closerId = +cl.value;
        if (!token) { draw('Paste the code from BotFather first.'); return; }
        if (!TOKEN.test(token)) { draw('That’s not the code yet. It looks like numbers, a colon, then letters, like 123456789:AAH…'); return; }
        const btn = $('wzGo'); busy = true; RV.busy(btn, true, 'Checking with Telegram…');
        try {
          const ch = await POST('/api/app/channels/telegram', { token, closer_id: closerId });
          busy = false; RV.confetti(40);
          await Promise.all([RV.loadChannels(true), RV.loadClosers(true)]);
          if (opts.onDone && opts.skipDone) { RV.closeModal(); opts.onDone(ch); return; }
          done(ch);
        } catch (er) { busy = false; RV.busy(btn, false); draw(friendlyTg(er)); }
      });
    }
    function done(ch) {
      const url = 'https://t.me/' + (ch.username || '');
      RV.modal('<div class="col" style="gap:14px;align-items:center;text-align:center"><div class="a-pop">' + RV.brandIcon('telegram', 72) + '</div><strong class="h3">' + esc(nm) + ' now answers on Telegram!</strong><p class="muted" style="margin:0">Send ' + esc(nm) + ' a message to see.</p>' +
        '<a class="btn btn-main" href="' + esc(url) + '" target="_blank" rel="noopener" style="width:100%;justify-content:space-between">Open my bot<span class="arr">' + ic('right', '#121110', 18, 2.6) + '</span></a>' + (desk ? RV.qrSvg(url, 140, { label: 'QR code to open your bot' }) + '<span class="small muted">Or scan this with your phone.</span>' : '') +
        '<button class="btn btn-ghost" data-close id="tgDone" style="width:100%">Done</button></div>', { label: 'Telegram is connected', onClose: () => { if (opts.onDone) opts.onDone(ch); } });
    }
    draw();
  };
  RV.route('channels', { render: channels });

  /* ======================= BLAST ======================= */
  const SEG = { no_buy: ['Asked but didn’t buy', 'Showed interest, haven’t paid yet'], all: ['Everyone', 'Everyone who wrote to you'], hot: ['Ready to buy', 'Asked for a price or how to pay'], quiet: ['Quiet for 7 days', 'Haven’t written in a week'], won: ['Already bought', 'People who bought before'] };
  const BL = { seg: 'no_buy', msg: '', when: 'now', at: '', ch: 'telegram' };
  async function blast(ctx) {
    const d = await GET('/api/app/blasts');
    if (!ctx.ok()) return;
    // WhatsApp Blasts (approved templates only) live in pages-whatsapp.js; this switch picks the channel.
    if (!d.whatsapp) BL.ch = 'telegram';
    const switchHtml = d.whatsapp ? '<div class="seg" role="radiogroup" aria-label="Channel" style="align-self:flex-start"><button type="button" data-blch="telegram" class="' + (BL.ch !== 'whatsapp' ? 'on' : '') + '">' + RV.brandIcon('telegram', 18) + 'Telegram</button><button type="button" data-blch="whatsapp" class="' + (BL.ch === 'whatsapp' ? 'on' : '') + '">' + RV.brandIcon('whatsapp', 18) + 'WhatsApp</button></div>' : '';
    const bindSwitch = () => ctx.el.querySelectorAll('[data-blch]').forEach(b => b.addEventListener('click', () => { if (BL.ch === b.getAttribute('data-blch')) return; BL.ch = b.getAttribute('data-blch'); blast(ctx); }));
    const per = S.boot.billing.blast_people_per_credit || 10, mgr = RV.isManager();
    const segs = d.segments;
    if (!segs.find(s => s.id === BL.seg && s.count)) { const firstWith = segs.find(s => s.count); if (firstWith) BL.seg = firstWith.id; }
    const cost = () => { const s = segs.find(x => x.id === BL.seg); return s ? Math.ceil(s.count / per) : 0; };
    const count = () => (segs.find(x => x.id === BL.seg) || {}).count || 0;
    const statusPill = b => { const m = { queued: ['#FFF3CC', '#7A5800', new Date(b.scheduled_at) > new Date() ? 'Scheduled' : 'Queued'], sending: ['#E3ECFF', '#1E3A8A', 'Sending'], sent: ['#E8F6EC', '#1E6B3A', 'Sent'], done: ['#E8F6EC', '#1E6B3A', 'Sent'], failed: ['#FFE3D6', '#9A3412', 'Failed'] }[b.status] || ['#F2F0EA', '#5E5A50', b.status]; return '<span class="pill" style="background:' + m[0] + ';color:' + m[1] + '">' + m[2] + '</span>'; };
    const minDt = new Date(Date.now() + 5 * 60e3); const pad = n => String(n).padStart(2, '0');
    const minStr = minDt.getFullYear() + '-' + pad(minDt.getMonth() + 1) + '-' + pad(minDt.getDate()) + 'T' + pad(minDt.getHours()) + ':' + pad(minDt.getMinutes());
    const recentHtml = RV.panel('c5 a-in', '<strong>Sent before</strong>', d.blasts.length ? '<div class="col" style="gap:10px">' + d.blasts.map(b => { const done = b.sent + b.failed; const p = b.total ? Math.round(done / b.total * 100) : 0; return '<div class="col" style="gap:8px;border:1px solid var(--line);border-radius:16px;padding:12px 14px"><div class="row" style="justify-content:space-between;gap:10px"><strong class="ell small" style="font-size:14px">' + (b.channel === 'whatsapp' ? RV.brandIcon('whatsapp', 16) + ' ' : '') + esc(b.message.slice(0, 60)) + '</strong>' + statusPill(b) + '</div><div class="meter"><span style="width:' + p + '%"></span></div><span class="small muted">' + esc(SEG[b.segment] ? SEG[b.segment][0] : b.segment) + ' · ' + fmt(b.sent) + ' sent' + (b.failed ? ' · ' + fmt(b.failed) + ' failed' : '') + ' of ' + fmt(b.total) + ' · ' + fmt(b.credits) + ' credits · ' + (new Date(b.scheduled_at) > new Date() ? 'sends ' + RV.date(b.scheduled_at) + ' ' + RV.time(b.scheduled_at) : RV.ago(b.scheduled_at)) + '</span></div>'; }).join('') + '</div>'
      : RV.empty('You haven’t sent one yet', 'Try one to people who asked but didn’t buy.', '', '<svg viewBox="0 0 120 90" width="120" aria-hidden="true"><g class="a-floats"><path d="M10 50 110 10 80 80 58 58z" fill="#FFC21A" stroke="#121110" stroke-width="4" stroke-linejoin="round"/><path d="M58 58 110 10" stroke="#121110" stroke-width="4"/></g></svg>'));
    if (BL.ch === 'whatsapp' && d.whatsapp) { RV.wa.blast(ctx, d, { switchHtml, bindSwitch, recentHtml, rerender: () => blast(ctx) }); return; }
    ctx.el.innerHTML = '<div class="dgrid">' +
      RV.panel('c7 a-in', '<strong>Send a message to many customers ' + RV.whats('blast') + '</strong><span class="pill" style="background:var(--mint);color:var(--jade-dd)" id="blCost"></span>',
        (switchHtml ? '<div>' + switchHtml + '</div>' : '') + '<div class="col" style="gap:8px"><span class="lbl" id="segL">1. Who?</span><div role="radiogroup" aria-labelledby="segL" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px">' + segs.filter(s => ['no_buy', 'all', 'hot'].includes(s.id) || s.id === BL.seg).sort((a, c) => Object.keys(SEG).indexOf(a.id) - Object.keys(SEG).indexOf(c.id)).map(s => '<button type="button" role="radio" class="pick' + (BL.seg === s.id ? ' on' : '') + '" data-seg="' + s.id + '" aria-checked="' + (BL.seg === s.id) + '" style="flex-direction:column;align-items:flex-start;gap:4px"' + (s.count ? '' : ' disabled') + '><span class="row" style="justify-content:space-between;width:100%"><strong style="font-size:14.5px">' + SEG[s.id][0] + '</strong><b class="tnum">' + fmt(s.count) + '</b></span><span style="font-size:12px;color:var(--mut)">' + SEG[s.id][1] + '</span></button>').join('') + '</div></div>' +
        '<div class="field"><div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><label class="lbl" for="blMsg">2. Message</label>' + '<button type="button" class="btn btn-ghost btn-sm" id="blDraft">' + ic('spark', '#121110', 16) + 'Write it for me</button></div><textarea id="blMsg" class="input" rows="5" maxlength="3500" placeholder="Hey! Your picks are still waiting. Reply here and we’ll help you finish your order today.">' + esc(BL.msg) + '</textarea><span class="row hint" style="justify-content:space-between"><span>Only people who already wrote to you can get it.</span><span class="tnum" id="blLen">' + BL.msg.length + '/3500</span></span></div>' +
        '<div class="col" style="gap:8px"><span class="lbl">3. When</span><div class="seg" role="radiogroup" aria-label="When to send"><button type="button" data-when="now" class="' + (BL.when === 'now' ? 'on' : '') + '">Send now</button><button type="button" data-when="later" class="' + (BL.when === 'later' ? 'on' : '') + '">Schedule</button></div><div id="blAtWrap" class="field"' + (BL.when === 'later' ? '' : ' hidden') + '><label class="lbl sr" for="blAt">Send at</label><input id="blAt" class="input" type="datetime-local" min="' + minStr + '" value="' + esc(BL.at || minStr) + '" style="max-width:280px"></div></div>' +
        '<div class="row" style="gap:12px;flex-wrap:wrap;background:var(--soft);border:1px solid var(--line);border-radius:16px;padding:12px 14px"><span class="col grow" style="gap:0"><strong id="blSum"></strong><span class="small muted">You have <b class="tnum" data-bal data-v="' + S.credits + '">' + fmt(S.credits) + '</b> credits ' + RV.whats('credits') + '</span></span>' + (mgr ? '<button class="btn btn-jade" id="blSend">Send</button>' : '<span class="small muted">Only the shop owner or an admin can send.</span>') + '</div>') +
      recentHtml + '</div>';
    bindSwitch();
    const sum = () => { const n = count(), c = cost(); $('blCost').textContent = fmt(c) + ' credit' + (c === 1 ? '' : 's'); $('blSum').textContent = n ? 'Goes to ' + fmt(n) + ' ' + (n === 1 ? 'person' : 'people') + '. This uses ' + fmt(c) + ' credit' + (c === 1 ? '' : 's') + '.' : 'Nobody is in this group yet'; };
    sum();
    ctx.el.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => { BL.seg = b.getAttribute('data-seg'); ctx.el.querySelectorAll('[data-seg]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); sum(); }));
    ctx.el.querySelectorAll('[data-when]').forEach(b => b.addEventListener('click', () => { BL.when = b.getAttribute('data-when'); ctx.el.querySelectorAll('[data-when]').forEach(x => x.classList.toggle('on', x === b)); $('blAtWrap').hidden = BL.when !== 'later'; }));
    const m = $('blMsg'); m.addEventListener('input', () => { BL.msg = m.value; $('blLen').textContent = m.value.length + '/3500'; });
    $('blAt').addEventListener('change', e => { BL.at = e.target.value; });
    $('blDraft').addEventListener('click', () => {
      RV.modal('<form id="dfForm" class="col" style="gap:14px"><div class="row" style="gap:12px">' + RV.junoArt(64) + '<strong class="h3">What should the message do?</strong></div><div class="field"><label class="lbl" for="dfGoal">Goal</label><input id="dfGoal" class="input" placeholder="e.g. bring back people who chatted but didn’t buy" value="' + esc(SEG[BL.seg] ? 'Re-engage: ' + SEG[BL.seg][1].toLowerCase() : '') + '"></div><button class="btn btn-ink" type="submit" id="dfGo">' + ic('spark', '#FFC21A', 16) + 'Write it for me</button></form>', { label: 'Write it for me' });
      $('dfForm').addEventListener('submit', async e => {
        e.preventDefault(); const b = $('dfGo'); RV.busy(b, true, 'Writing…');
        try {
          const r = await POST('/api/app/blasts/draft', { goal: $('dfGoal').value.trim() });
          RV.closeModal();
          const txt = r.text || ''; let i = 0; m.value = ''; BL.msg = txt;
          const iv = setInterval(() => { i += 3; m.value = txt.slice(0, i); $('blLen').textContent = m.value.length + '/3500'; if (i >= txt.length) { clearInterval(iv); m.value = txt; m.focus(); } }, RV.reduced() ? 0 : 22);
        } catch (er) { RV.busy(b, false); fail(er); }
      });
    });
    const send = $('blSend');
    if (send) send.addEventListener('click', async () => {
      const msg = m.value.trim();
      if (msg.length < 2) { toast('Write your message first.', 'err'); m.focus(); return; }
      if (!count()) { toast('Nobody is in that group yet.', 'err'); return; }
      let when = null;
      if (BL.when === 'later') { const v = $('blAt').value; if (!v || new Date(v) <= new Date()) { toast('Pick a time in the future.', 'err'); return; } when = new Date(v).toISOString(); }
      if (cost() > S.credits) { toast('This needs ' + cost() + ' credits. You have ' + fmt(S.credits) + '. Buy credits, then try again.', 'err', RV.flag('wallet') ? { label: 'Buy credits', fn: () => go('/app/wallet') } : null); return; }
      if (!(await RV.confirmBox('Send this message?', 'It goes to ' + fmt(count()) + ' people' + (when ? ' on ' + RV.date(when) + ' at ' + RV.time(when) : ' right now') + ' and uses ' + fmt(cost()) + ' credits.', when ? 'Schedule it' : 'Send now'))) return;
      RV.busy(send, true, 'Sending…');
      try {
        const r = await POST('/api/app/blasts', { segment: BL.seg, message: msg, scheduled_at: when || undefined });
        BL.msg = ''; toast((when ? 'Scheduled for ' : 'On its way to ') + fmt(r.total) + ' people'); RV.confetti(30);
        RV.setBalance(S.credits - r.credits);
        blast(ctx);
      } catch (e) { RV.busy(send, false); if (e.code === 'no_credits') toast(e.message, 'err', { label: 'Buy credits', fn: () => go('/app/wallet') }); else fail(e); }
    });
  }
  RV.route('blast', { render: blast, flag: 'blast' });

  /* ======================= JUNO ======================= */
  const JL = [];
  async function juno(ctx) {
    const fn = RV.first(S.boot.user.name);
    const sug = ['How was today?', 'Who should I call first?', 'Which chats need me?', 'What do customers ask most?'];
    ctx.el.innerHTML = '<div class="dgrid"><section class="c8 card a-in" style="border-radius:26px;overflow:hidden;display:flex;flex-direction:column;min-height:560px">' +
      '<div class="row" style="background:linear-gradient(135deg,#FFD23F,#FFC21A);padding:18px 20px;gap:14px">' + RV.junoArt(70) + '<div class="col" style="gap:0"><strong style="font-size:21px;letter-spacing:-0.03em">Ask about my shop</strong><span style="font-size:14px;color:#3B3000">Ask anything about your shop. Juno answers from your chats.</span></div></div>' +
      '<div id="junoLog" style="flex:1;padding:18px;display:flex;flex-direction:column;gap:10px;background:#F8F7F2;min-height:300px;max-height:56vh;overflow-y:auto" aria-live="polite"><div class="bub-in">Hi' + (fn ? ' ' + esc(fn) : '') + '! Ask me anything about your chats, customers and sales. Or tap a question below.</div>' + JL.map(x => '<div class="' + (x.q ? 'bub-me' : 'bub-in') + '">' + esc(x.q || x.a) + '</div>').join('') + '</div>' +
      '<div class="row" style="padding:12px;flex-wrap:wrap;gap:8px;border-top:1px solid var(--line)">' + sug.map(q => '<button class="chip" data-jq>' + esc(q) + '</button>').join('') + '</div>' +
      '<form id="junoForm" class="row" style="gap:8px;padding:12px;border-top:1px solid var(--line)"><label for="junoIn" class="sr">Your question</label><input id="junoIn" class="input" placeholder="Ask about your shop…" autocomplete="off" maxlength="600" style="padding:12px 14px"><button class="btn btn-ink" type="submit" id="junoGo">Ask</button></form></section>' +
      '<div class="c4 col" style="gap:14px">' + RV.panel('a-in', '<strong>What it knows</strong>', '<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:14px;color:var(--mut)"><li>Today’s chats and AI replies</li><li>Who is ready to buy</li><li>Chats that need you</li><li>What customers ask most</li></ul>') + '</div></div>';
    const log = $('junoLog'); log.scrollTop = log.scrollHeight;
    const ask = async q => {
      if (!q) return;
      JL.push({ q });
      log.insertAdjacentHTML('beforeend', '<div class="bub-me a-in">' + esc(q) + '</div><div id="jt" class="bub-in" style="display:flex;gap:5px;padding:12px 14px"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>'); log.scrollTop = log.scrollHeight;
      const b = $('junoGo'); if (b) b.disabled = true;
      try { const r = await POST('/api/app/juno', { question: q }); JL.push({ a: r.answer }); const t = $('jt'); if (t) t.remove(); log.insertAdjacentHTML('beforeend', '<div class="bub-in a-in">' + esc(r.answer) + '</div>'); }
      catch (e) { const t = $('jt'); if (t) t.remove(); JL.pop(); fail(e); }
      if (b) b.disabled = false; log.scrollTop = log.scrollHeight;
    };
    ctx.el.querySelectorAll('[data-jq]').forEach(b => b.addEventListener('click', () => ask(b.textContent.trim())));
    $('junoForm').addEventListener('submit', e => { e.preventDefault(); const v = $('junoIn').value.trim(); $('junoIn').value = ''; ask(v); });
  }
  RV.route('juno', { render: juno, flag: 'juno' });
})();
