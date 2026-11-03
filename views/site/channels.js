'use strict';
// Channel landing pages (/telegram-ai-chatbot, /whatsapp-ai-chatbot, ...) and the /channels hub.
// Copy lives in ./channel-content.js. Status (live/soon) always comes from the admin flags via d.status.
const A = require('./art');
const P = require('./parts');
const { esc } = A;
const it = t => '<span class="it hl">' + t + '</span>';
const andList = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : l.join('');

const isLive = s => s === 'live';

// Phone mock with a chat that plays bubble by bubble (animated in /js/site.js, static without JS).
function chatMock(c) {
  const m = c.chat;
  const msgs = m.msgs.map(x => {
    const k = x[0], t = esc(x[1]);
    if (k === 'in') return '<div class="cm-b bub-in">' + t + '</div>';
    if (k === 'out') return '<div class="cm-b cm-out" style="background:' + c.bub + ';color:' + c.bubInk + '">' + t + '</div>';
    if (k === 'pay') return '<div class="cm-b cm-pay">' + t + '</div>';
    if (k === 'story') return '<div class="cm-b cm-story"><span class="cm-story-img" style="background:linear-gradient(160deg,' + c.bub + ',' + c.color + ')"></span><span>' + t + '</span></div>';
    return '';
  }).join('');
  return '<div class="phone cm-phone" role="img" aria-label="Example ' + esc(c.name) + ' chat where a Replyvoo Closer answers a customer"><div class="phone-screen" style="background:' + c.tint + '">' +
    '<div class="phone-top">' + A.brandIcon(c.id, 38) + '<span class="phone-who"><strong>' + esc(m.who) + '</strong><span style="color:var(--mut)">' + esc(c.name) + ' · ' + esc(m.sub) + '</span></span><span class="cm-ai">AI Closer</span></div>' +
    '<div class="demo-chat cm" data-chatmock>' + msgs + '<div class="cm-typing" aria-hidden="true"><span></span><span></span><span></span></div></div></div></div>';
}

function waitForm(c, extraCls) {
  const id = 'wl-' + c.id + (extraCls ? '-b' : '');
  return '<form class="wl-form chp-wl' + (extraCls ? ' ' + extraCls : '') + '" data-wl-name="' + esc(c.name) + '" data-wl-item="' + esc(c.id) + '">' +
    '<label class="sr" for="' + id + '">Email for the ' + esc(c.name) + ' waitlist</label>' +
    '<input id="' + id + '" class="input" type="email" required placeholder="you@business.com" autocomplete="email">' +
    '<button class="btn btn-ink" type="submit">Join the waitlist</button></form>';
}

function statusPill(status) {
  return isLive(status) ? '<span class="pill pill-live"><span class="a-pulse live-dot"></span>Live now</span>' : '<span class="pill pill-soon">Coming soon</span>';
}

function heroCtas(ctx, c, d) {
  if (isLive(d.status)) {
    return '<div class="hero-ctas"><a class="btn btn-main" href="' + ctx.signupUrl + '"><span>Start free</span><span class="arr">' + A.ARROW + '</span></a>' +
      '<a class="btn btn-ghost" href="/pricing">See pricing</a></div>';
  }
  const tg = d.telegramLive ? '<a class="chp-alt" href="/telegram-ai-chatbot">Or start selling on Telegram today →</a>' : '';
  return '<div class="chp-cta-soon">' + waitForm(c) + '<p class="muted small chp-wl-note">We’ll email you once when ' + esc(c.name) + ' opens. No spam, no dates promised.</p>' + tg + '</div>';
}

function landing(ctx, c, d) {
  const live = isLive(d.status);
  const nm = c.id === 'website' ? 'website chat' : esc(c.name);
  const will = live ? 'does' : 'will do';
  const checks = c.id === 'website' ? ['One line of code', 'Your colours and logo', 'Human handoff built in'] : live ? [ctx.freeConv ? ctx.freeConv + ' free chats a month' : 'Free plan', 'Live in minutes', 'No code'] : ['Official ' + c.name + ' access', 'Human handoff built in', 'Same Closer on every channel'];

  const hero = '<section class="p-hero chp-hero"><div class="mesh a-mesh" style="width:560px;height:560px;right:-160px;top:-200px;background:' + c.color + ';opacity:.22"></div><div class="mesh a-mesh2" style="width:420px;height:420px;left:-180px;top:200px;background:#FFF1C2"></div><div class="grid-bg"></div>' +
    '<div class="wrap chp-in"><div class="chp-copy">' +
    '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/channels">Channels</a><span aria-hidden="true">/</span><span aria-current="page">' + esc(c.name) + '</span></nav>' +
    '<div class="chp-badge">' + A.brandIcon(c.id, 44) + '<span class="ch-name"><strong>' + esc(c.name) + '</strong>' + statusPill(d.status) + '</span></div>' +
    '<h1 class="h1 chp-h1">' + esc(c.h1a) + ' ' + it(esc(c.h1b)) + '</h1>' +
    '<p class="lead">' + esc(live ? c.leadLive : c.leadSoon) + '</p>' +
    heroCtas(ctx, c, d) +
    '<div class="hero-checks">' + checks.map(t => '<span>' + A.CHECK + esc(t) + '</span>').join('') + '</div>' +
    '</div><div class="chp-art">' + (c.id === 'website' ? '<div class="chp-scene" data-scene>' + chatMock(c) + '</div>' : chatMock(c)) + '</div></div></section>';

  const notice = live ? '' : '<section class="wrap"><div class="chp-notice reveal"><span class="chp-notice-ic">' + A.ic('clock', '#121110', 22) + '</span><div><strong>' + esc(c.name) + ' is coming soon.</strong> ' +
    'We are connecting through ' + esc(c.platform) + ', which needs the platform’s review and approval. We will not promise a date we do not control. This page explains exactly how it will work, so you can get ready now. ' +
    (d.telegramLive ? 'Your Closers already work on <a href="/telegram-ai-chatbot">Telegram</a>, and the same Closer will carry over.' : '') + '</div></div></section>';

  const does = '<section class="wrap sec"><div class="sec-head"><div class="sec-head-l reveal"><span class="eyebrow">What it ' + (live ? 'does' : 'will do') + '</span><h2 class="h2">What your ' + nm + ' AI agent ' + will + '</h2></div>' +
    '<p class="lead reveal" style="max-width:440px">One Closer handles sales, support and lead qualification in the same chat, then steps aside when a person should take over.</p></div>' +
    '<div class="chp-grid">' + c.does.map(x => '<article class="card lift reveal chp-card"><span class="bx-ic" style="background:' + c.tint + '">' + A.ic(x[0]) + '</span><h3>' + esc(x[1]) + '</h3><p>' + esc(x[2]) + '</p></article>').join('') + '</div></section>';

  const setup = '<section class="band"><div class="wrap sec"><div class="center reveal"><span class="eyebrow">Setup</span><h2 class="h2" style="max-width:860px">How ' + nm + ' setup ' + (live ? 'works' : 'will work') + '</h2><p class="lead" style="max-width:620px">' + esc(live ? c.setupIntro.replace(/will work/g, 'works') : c.setupIntro) + '</p></div>' +
    '<div class="chp-setup"><ol class="chp-steps">' + c.setup.map((s, i) => '<li class="card reveal"><span class="beat-n">' + (i + 1) + '</span><span><strong>' + esc(s[0]) + '</strong><span>' + esc(s[1]) + '</span></span></li>').join('') + '</ol>' +
    '<aside class="chp-rules reveal"><span class="tiny-k">' + (c.id === 'website' ? 'Safe by design' : esc(c.name) + ' rules we follow') + '</span><h3 class="h3">' + (c.id === 'website' ? 'How we keep your site safe' : 'Built on ' + esc(c.platform)) + '</h3><ul>' + c.rules.map(r => '<li>' + A.CHECK + '<span>' + esc(r) + '</span></li>').join('') + '</ul>' +
    '<p class="muted xs">Platform rules change. We summarise the current rules in plain words; the platform’s own policy always wins.</p></aside></div></div></section>';

  const uses = '<section class="wrap sec"><div class="sec-head"><div class="sec-head-l reveal"><span class="eyebrow">Use cases</span><h2 class="h2">Who uses ' + (/chatbot$/i.test(c.keyword) ? 'a ' : '') + esc(c.keyword) + '</h2></div>' +
    '<p class="lead reveal" style="max-width:440px">Any business that gets the same questions every day and loses sales when replies are slow.</p></div>' +
    '<div class="chp-uses">' + c.uses.map(u => '<article class="card reveal chp-use"><h3>' + esc(u[0]) + '</h3><p>' + esc(u[1]) + '</p></article>').join('') + '</div></section>';

  const vs = '<section class="band"><div class="wrap sec"><div class="center reveal"><span class="eyebrow">Manual vs AI</span><h2 class="h2" style="max-width:900px">Manual replies vs an AI Closer on ' + nm + '</h2></div>' +
    '<div class="card reveal vs-table" role="table" aria-label="Manual replies vs Replyvoo on ' + nm + '"><div class="vs-row vs-head" role="row"><div role="columnheader">On ' + nm + '</div><div role="columnheader">Manual replies</div><div role="columnheader" class="good-h">Replyvoo Closer</div></div>' +
    c.vs.map(r => '<div class="vs-row" role="row"><div role="cell" style="font-weight:700">' + esc(r[0]) + '</div><div role="cell" class="bad">✕ ' + esc(r[1]) + '</div><div role="cell" class="good">✓ ' + esc(r[2]) + '</div></div>').join('') + '</div></div></section>';

  const faqSec = '<section class="wrap sec" style="max-width:920px" id="faq"><div class="center reveal"><span class="eyebrow">FAQ</span><h2 class="h2">' + esc(c.keyword) + ' FAQ</h2></div><div style="margin-top:36px">' + P.faqList(d.faq, 'cf') + '</div></section>';

  const others = d.others.length ? '<section class="band"><div class="wrap sec" style="padding-block:64px"><h2 class="h3">Your Closers on other channels</h2><div class="chp-others">' +
    d.others.map(o => '<a class="card lift chp-other" href="/' + o.slug + '">' + A.brandIcon(o.id, 40) + '<span><strong>' + esc(o.keyword) + '</strong><span class="muted small">' + (isLive(o.status) ? 'Live now' : 'Coming soon') + '</span></span></a>').join('') +
    '<a class="card lift chp-other" href="/channels"><span class="chp-all">' + A.ic('layers', '#121110', 20) + '</span><span><strong>All channels</strong><span class="muted small">Compare every channel</span></span></a></div>' +
    (d.posts.length ? '<h2 class="h3" style="margin-top:40px">Guides for ' + nm + ' sellers</h2><div class="post-grid" style="margin-top:18px">' + d.posts.map(p => P.postCard(p, { uid: 'c' })).join('') + '</div>' : '') +
    '</div></section>' : '';

  const ctaEnd = '<section class="wrap" style="padding-block:72px 100px"><div class="cta-box chp-end"><div class="mesh a-mesh" style="width:300px;height:300px;right:-80px;top:-140px;background:' + c.color + ';opacity:.35"></div>' +
    (live
      ? '<div class="rel"><strong class="h3">Put an AI Closer on ' + (c.id === 'website' ? 'your website' : esc(c.name)) + ' tonight.</strong><p>Free to start. Live in minutes. Pay per conversation, never per message.</p></div><a class="btn btn-jade rel" href="' + ctx.signupUrl + '">Start free</a>'
      : '<div class="rel"><strong class="h3">Be first when ' + esc(c.name) + ' opens.</strong><p>Join the waitlist' + (d.telegramLive ? ', or start on Telegram today and bring the same Closer over later.' : '.') + '</p></div><div class="rel chp-end-r">' + waitForm(c, 'on-dark') + (d.telegramLive ? '<a class="btn btn-jade" href="' + ctx.signupUrl + '">Start on Telegram today</a>' : '') + '</div>') +
    '</div></section>';

  return hero + notice + does + setup + (c.id === 'website' && live ? webInstall(ctx, d) : '') + uses + vs + faqSec + others + ctaEnd;
}

// Website chat only: the install snippet, platform list and where it's included (read from plans/power-ups).
function webInstall(ctx, d) {
  const w = d.web || {};
  const plats = ['HTML', 'WordPress', 'Shopify', 'Wix', 'Webflow', 'Google Tag Manager'];
  return '<section class="wrap sec" id="install"><div class="web-inst reveal"><div class="web-inst-copy"><span class="eyebrow">Install</span><h2 class="h2">One line of code. <span class="it hl">That’s it.</span></h2>' +
    '<p class="lead">Paste it once in your site’s footer and the chat appears on every page you allow. Works with ' + esc(andList(plats)) + '.</p>' +
    '<ul class="web-plats">' + plats.map(p => '<li>' + A.CHECK + esc(p) + '</li>').join('') + '</ul></div>' +
    '<div class="web-code-wrap"><div class="web-code" aria-label="Example install code"><span class="web-code-bar"><i></i><i></i><i></i><span>footer.html</span></span><code>&lt;script src="' + esc(ctx.appUrl) + '/widget.js"<br>&nbsp;&nbsp;data-key="wk_your_widget_key" async&gt;&lt;/script&gt;</code></div>' +
    (w.price ? '<div class="web-price"><strong>Where it’s included</strong><span>' + esc(w.price) + '</span><a href="/pricing">See pricing →</a></div>' : '') + '</div></div></section>';
}

// Availability question first, generated from the live flag so it can never contradict the badge.
function faqFor(c, status, telegramLive) {
  const live = isLive(status);
  if (c.id === 'telegram') return c.faq;
  if (c.id === 'website') return [live ? ['Can I add Replyvoo chat to my website today?', 'Yes. Website chat is live. Create it in Widget Studio, add your domain and paste one line of code. Your Closer starts answering right away.'] : ['Can I add Replyvoo chat to my website today?', 'Not yet. Website chat is coming soon. Join the waitlist on this page and we will email you when it opens.']].concat(c.faq);
  const first = live
    ? ['Can I use Replyvoo on ' + c.name + ' today?', 'Yes. ' + c.name + ' is live. Sign up free, connect your account from Channels in your dashboard and switch on a Closer.']
    : ['Can I use Replyvoo on ' + c.name + ' today?', 'Not yet. ' + c.name + ' is coming soon and depends on approval for ' + c.platform + '. We do not give dates we do not control. Join the waitlist on this page and we will email you when it opens.' + (telegramLive ? ' Meanwhile your Closers can sell on Telegram today.' : '')];
  return [first].concat(c.faq);
}

// ---------- /channels hub ----------
function hub(ctx, d) {
  const names = d.list.map(c => (c.id === 'website' ? 'your website' : c.name));
  const joined = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names.join('');
  const hero = '<section class="p-hero"><div class="mesh a-mesh" style="width:520px;height:520px;right:-160px;top:-200px;background:#FFE58A"></div><div class="grid-bg"></div>' +
    '<div class="wrap p-hero-in center"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span aria-current="page">Channels</span></nav>' +
    '<span class="eyebrow">Channels</span><h1 class="h1 p-h1">AI sales agents for ' + it(esc(joined) + '.') + '</h1>' +
    '<p class="lead" style="max-width:660px">Your customers chat on different apps. Your Closers should meet them there. ' + (d.liveNames.length ? esc(andList(d.liveNames)) + (d.liveNames.length > 1 ? ' are' : ' is') + ' live today' : 'Every channel is on the way') + (d.soonNames.length ? ', and ' + esc(andList(d.soonNames)) + ' ' + (d.soonNames.length > 1 ? 'are' : 'is') + ' coming soon through each platform’s official business tools.' : '.') + '</p></div></section>';

  const cards = '<section class="wrap" style="padding-bottom:40px"><div class="hub-grid">' + d.list.map(c => {
    const live = isLive(c.status);
    return '<article class="hub-card reveal' + (live ? ' hub-live' : '') + '"><div class="mesh" style="width:240px;height:240px;right:-90px;top:-110px;background:' + c.color + ';opacity:' + (live ? '.4' : '.18') + '"></div>' +
      '<div class="ch-top rel">' + A.brandIcon(c.id, 52) + '<span class="ch-name"><strong>' + esc(c.name) + '</strong>' + statusPill(c.status) + '</span></div>' +
      '<h2 class="hub-h rel">' + esc(c.keyword) + '</h2><p class="rel">' + esc(c.desc) + '</p>' +
      '<ul class="hub-pts rel">' + c.does.slice(0, 3).map(x => '<li>' + (live ? A.CHECK_INK(16) : A.CHECK) + '<span>' + esc(x[1]) + '</span></li>').join('') + '</ul>' +
      '<a class="btn ' + (live ? 'btn-jade' : 'btn-ink') + ' btn-sm rel" href="/' + c.slug + '">' + (live ? 'Explore the ' : 'How the ') + esc(c.keyword) + (live ? '' : ' will work') + ' →</a></article>';
  }).join('') + '</div></section>';

  const why = '<section class="band"><div class="wrap sec"><div class="center reveal"><span class="eyebrow">One brain, every inbox</span><h2 class="h2" style="max-width:860px">Build a Closer once. ' + it('Use it everywhere.') + '</h2>' +
    '<p class="lead" style="max-width:640px">Your Closer’s knowledge, tone and handoff rules are shared across channels. As each channel goes live, you switch it on for the same Closer instead of starting again.</p></div>' +
    '<div class="chp-grid" style="margin-top:44px">' + [
      ['inbox', 'One Pulse Inbox', 'Every chat from every channel lands in one inbox, with the same human takeover button.'],
      ['card', 'One price per conversation', 'A conversation costs the same on any channel. Platform fees, like WhatsApp template messages, are charged by the platform at its own rates.'],
      ['shield', 'Official access only', 'We connect through each platform’s official business API. No scripts that pretend to be you, so your accounts stay safe.']
    ].map(x => '<article class="card reveal chp-card"><span class="bx-ic">' + A.ic(x[0]) + '</span><h3>' + esc(x[1]) + '</h3><p>' + esc(x[2]) + '</p></article>').join('') + '</div></div></section>';

  const end = '<section class="wrap" style="padding-block:72px 100px"><div class="cta-box"><div class="mesh a-mesh" style="width:300px;height:300px;right:-80px;top:-140px;background:#FFC21A;opacity:.35"></div><div class="rel"><strong class="h3">Start where your customers already are.</strong><p>' + (d.liveNames.length ? esc(andList(d.liveNames)) + ' ' + (d.liveNames.length > 1 ? 'are' : 'is') + ' live today. Your first Closer is free.' : 'Join a waitlist above and we will tell you when it opens.') + '</p></div>' +
    (d.liveNames.length ? '<a class="btn btn-jade rel" href="' + ctx.signupUrl + '">Start free</a>' : '') + '</div>' +
    '<p class="ch-note">Channel names are trademarks of their owners. <a href="/legal/disclaimer">Not affiliated or endorsed</a>.</p></section>';
  return hero + cards + why + end;
}

module.exports = { landing, hub, faqFor };
