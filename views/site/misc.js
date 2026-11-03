'use strict';
// Pricing, blog, article, legal, contact and error pages.
const A = require('./art');
const P = require('./parts');
const { esc } = A;
const fs = require('node:fs');
const path = require('node:path');
const PUBLIC = path.join(__dirname, '..', '..', 'public');
const it = t => '<span class="it hl">' + t + '</span>';
// Local images that are not on disk yet (e.g. screenshots still being produced) are left out entirely.
function localMissing(src) {
  if (!src.startsWith('/') || src.startsWith('//')) return false;
  const file = path.join(PUBLIC, decodeURIComponent(src.split(/[?#]/)[0]));
  if (!file.startsWith(PUBLIC + path.sep)) return true;
  try { return !fs.statSync(file).isFile(); } catch { return true; }
}

function pageHero(eyebrow, h1, lead, extra) {
  return '<section class="p-hero"><div class="mesh a-mesh" style="width:520px;height:520px;right:-160px;top:-200px;background:#FFE58A"></div><div class="grid-bg"></div>' +
    '<div class="wrap p-hero-in center"><span class="eyebrow">' + eyebrow + '</span><h1 class="h1 p-h1">' + h1 + '</h1>' + (lead ? '<p class="lead" style="max-width:620px">' + lead + '</p>' : '') + (extra || '') + '</div></section>';
}

function ctaBox(ctx, title, sub) {
  return '<div class="cta-box"><div class="mesh a-mesh" style="width:300px;height:300px;right:-80px;top:-140px;background:#FFC21A;opacity:.35"></div><div class="rel"><strong class="h3">' + esc(title) + '</strong>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
    '<a class="btn btn-jade rel" href="' + ctx.signupUrl + '">Hire a Closer free</a></div>';
}

// ---------------- Pricing ----------------
function pricingFaq(ctx, d) {
  const b = ctx.s.billing;
  const free = d.plans.find(p => p.id === b.free_plan_id) || d.plans.find(p => p.price_month <= 0);
  const out = [
    ['What counts as a conversation?', 'One customer chatting with your Closers within ' + b.conversation_window_hours + ' hours, up to ' + b.conversation_reply_limit + ' AI replies. If they come back the next day, that starts a new conversation. Messages your team sends by hand are always free.'],
    ['What happens if I run out of conversations?', 'Your Closers keep replying using Voo Credits from your wallet: 1 credit = 1 extra conversation. Turn on Auto Top-up and you never go quiet. If you have no credits left, chats wait for your team in Pulse Inbox.'],
    free ? ['Is the free plan really free?', 'Yes. ' + free.name + ' gives you ' + free.closers + ' Closer and ' + P.fmt(free.conversations) + ' conversations every month. No card needed. Upgrade whenever you are ready.'] : null,
    b.yearly_months_free > 0 ? ['How does yearly billing work?', 'Pay for the year up front and get ' + b.yearly_months_free + ' month' + (b.yearly_months_free > 1 ? 's' : '') + ' free compared with paying monthly. Your conversations still reset every month.'] : null,
    ['Can I change or cancel my plan?', 'Yes. Upgrade, downgrade or cancel from your dashboard at any time. There are no contracts. Unused top-up credits stay in your Voo Wallet.'],
    ['How do I pay?', 'Card, bank transfer and local methods through Paystack and Flutterwave' + (b.crypto_enabled ? ', or USDT' : '') + '. See our <refunds> for the details.'],
    ['Do you offer custom plans?', 'Yes. If you run very high volume or need custom integrations, talk to our sales team and we will build a plan around you.']
  ].filter(Boolean);
  return out.map(f => [f[0], f[1].replace('<refunds>', 'refund policy')]);
}

function compareTable(ctx, plans) {
  const yes = A.CHECK_INK(16), no = '<span class="muted">–</span>';
  const rows = [
    ['Price per month', p => p.contact_sales ? 'from ' + P.money(P.planPrices(p).mNow) : P.money(P.planPrices(p).mNow)],
    ['AI Closers', p => p.closers >= 9999 ? 'Unlimited' : P.fmt(p.closers)],
    ['Conversations / month', p => P.fmt(p.conversations) + (p.contact_sales ? '+' : '')],
    ['Team seats', p => p.seats >= 999 ? 'Unlimited' : P.fmt(p.seats)],
    ['Channels', p => esc(p.channels_text)],
    ['Pro Brain chats included', p => p.pro_brain_chats ? P.fmt(p.pro_brain_chats) : no],
    ['Extra conversation', () => '1 Voo Credit'],
    ['Pulse Inbox + human takeover', () => yes],
    ['Juno AI assistant', () => yes]
  ];
  return '<div class="cmp-wrap reveal" tabindex="0" role="region" aria-label="Plan comparison table"><table class="cmp"><thead><tr><th scope="col">Plan</th>' +
    plans.map(p => '<th scope="col"' + (p.popular ? ' class="hot"' : '') + '>' + esc(p.name) + (p.badge ? '<span class="cmp-badge">' + esc(p.badge) + '</span>' : '') + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(r => '<tr><th scope="row">' + r[0] + '</th>' + plans.map(p => '<td' + (p.popular ? ' class="hot"' : '') + '>' + r[1](p) + '</td>').join('') + '</tr>').join('') +
    '<tr><th scope="row"></th>' + plans.map(p => {
      const href = p.contact_sales ? '/contact?plan=' + encodeURIComponent(p.id) + '&topic=sales' : ctx.signupUrl + (ctx.signupUrl.includes('?') ? '&' : '?') + 'plan=' + encodeURIComponent(p.id);
      return '<td' + (p.popular ? ' class="hot"' : '') + '><a class="btn btn-sm ' + (p.popular ? 'btn-jade' : 'btn-ink') + '" href="' + esc(href) + '">' + esc(p.cta || 'Choose') + '</a></td>';
    }).join('') + '</tr></tbody></table></div>';
}

function pricingPage(ctx, d) {
  const b = ctx.s.billing;
  const explainer = '<section class="band"><div class="wrap sec"><div class="center reveal"><span class="eyebrow">How billing works</span><h2 class="h2" style="max-width:820px">You pay for ' + it('conversations,') + ' not messages.</h2></div>' +
    '<div class="conv reveal"><div class="conv-eq"><span class="conv-big">1</span><span class="conv-lbl">conversation</span></div><span class="conv-op">=</span>' +
    '<div class="conv-part"><span class="conv-ic">' + A.ic('chat', '#121110', 26) + '</span><strong>One customer</strong><span>chatting with your Closers</span></div><span class="conv-op">+</span>' +
    '<div class="conv-part"><span class="conv-ic">' + A.ic('clock', '#121110', 26) + '</span><strong>Within ' + b.conversation_window_hours + ' hours</strong><span>the window starts at their first message</span></div><span class="conv-op">+</span>' +
    '<div class="conv-part"><span class="conv-ic">' + A.ic('send', '#121110', 26) + '</span><strong>Up to ' + b.conversation_reply_limit + ' AI replies</strong><span>most sales fit in one</span></div></div>' +
    '<p class="muted tc" style="margin-top:22px">Need more than your plan includes? Voo Credits cover extra conversations: 1 credit = 1 conversation. Replies your team types by hand are always free.</p></div></section>';
  return pageHero('Pricing', 'Simple pricing. ' + it('Serious results.'), 'Start free. Upgrade when your Closers are closing. Pay per conversation, never per message.', P.billingToggle(ctx)) +
    '<section class="wrap" style="padding-bottom:40px"><div class="pricing" data-pricing>' + P.planGrids(ctx, d.plans) + '</div></section>' +
    explainer +
    '<section class="wrap sec"><div class="center reveal"><span class="eyebrow">Compare plans</span><h2 class="h2">Every plan, ' + it('side by side.') + '</h2></div>' + compareTable(ctx, d.plans) + '</section>' +
    '<section class="band"><div class="wrap sec"><div class="center reveal"><span class="eyebrow">Voo Wallet</span><h2 class="h2">Top up and ' + it('power up.') + '</h2><p class="lead" style="max-width:560px">Bigger packs come with bonus credits. Credits never expire while your account is active.</p></div>' +
    '<div class="pp-extra"><div class="card reveal box"><h3 class="box-h">Credit packs</h3><div class="packs">' + P.packsList(d.packs) + '</div><a class="btn btn-ink" href="/app/wallet" style="align-self:flex-start">Top up in your Voo Wallet</a></div>' +
    '<div class="card reveal box"><h3 class="box-h">Power-ups</h3><div class="addons">' + P.addonsList(d.addons) + '</div></div></div></div></section>' +
    '<section class="wrap sec" style="max-width:920px" id="faq"><div class="center reveal"><span class="eyebrow">Pricing FAQ</span><h2 class="h2">Good questions.</h2></div><div style="margin-top:36px">' + P.faqList(pricingFaq(ctx, d), 'pf') + '</div>' +
    '<p class="muted tc" style="margin-top:24px">Read the full <a href="/legal/refunds">billing and refund policy</a> or <a href="/contact?topic=sales">talk to sales</a>.</p></section>' +
    '<section class="wrap" style="padding-bottom:100px">' + ctaBox(ctx, 'Your first Closer is free.', 'No card. Live in five minutes.') + '</section>';
}

// ---------------- Blog ----------------
function blogIndex(ctx, d) {
  const posts = d.posts;
  const f = posts.find(p => p.featured) || posts[0];
  const rest = posts.filter(p => p !== f);
  const cats = ['All'].concat([...new Set(posts.map(p => p.category))]);
  return '<section class="p-hero blog-hero"><div class="mesh a-mesh" style="width:520px;height:520px;right:-160px;top:-200px;background:#FFE58A"></div><div class="wrap" style="position:relative;padding-block:56px 30px">' +
    '<div class="center"><span class="eyebrow">The ' + esc(ctx.s.company.product) + ' blog</span><h1 class="h1 p-h1">Sell faster. ' + it('Reply smarter.') + '</h1><p class="lead" style="max-width:560px">Playbooks, guides and ideas for businesses that sell in chat.</p></div>' +
    (f ? '<a class="card lift feat-post" href="/blog/' + encodeURIComponent(f.slug) + '"><div class="post-art feat-art" style="background:' + A.catBg(f.category) + '">' + A.coverArt(f.cover, f.category, 'f' + f.slug) + '</div>' +
      '<div class="feat-t"><span class="pill pill-ink">Featured · ' + esc(f.category) + '</span><h2 class="h3 feat-h">' + esc(f.title) + '</h2><span class="lead" style="font-size:17px">' + esc(f.description) + '</span><span class="muted small">' + esc(f.read_time) + ' read · ' + P.shortDate(f.published_at) + '</span><span class="feat-go">Read the story →</span></div></a>' : '') +
    (cats.length > 2 ? '<div class="chips" id="blogCats" role="group" aria-label="Filter by category">' + cats.map((c, i) => '<button type="button" class="chip' + (i === 0 ? ' on' : '') + '" aria-pressed="' + (i === 0) + '" data-cat-btn="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>' : '') +
    '<div class="post-grid" id="postGrid" style="margin-top:18px">' + rest.map(p => P.postCard(p, { h: 'h2' })).join('') + '</div>' +
    '<p class="muted tc" id="noPosts" hidden>No posts in this category yet.</p></div></section>' +
    '<section class="wrap" style="padding-block:60px 100px"><div class="nl"><div class="nl-t"><strong class="h3">Get one playbook a week</strong><span>Short, practical, no spam.</span></div>' +
    '<form id="nlForm" class="nl-f"><label for="nlIn" class="sr">Email address</label><input id="nlIn" class="input" type="email" placeholder="you@business.com" required autocomplete="email"><button class="btn btn-jade" type="submit">Subscribe</button></form></div></section>';
}

function enhanceArticle(html) {
  // Figures: graceful fallback when a screenshot is missing, and the alt text as a caption.
  return html
    .replace(/<figure><img src="([^"]*)"[^>]*><\/figure>/g, (m, src) => (localMissing(src.replace(/&amp;/g, '&')) ? '' : m))
    .replace(/<img src="([^"]*)"[^>]*>/g, (m, src) => (localMissing(src.replace(/&amp;/g, '&')) ? '' : m))
    .replace(/<figure><img ([^>]*?)alt="([^"]*)"([^>]*)><\/figure>/g, (_, a, alt, b) => '<figure><img ' + a + 'alt="' + alt + '"' + b + ' data-broken="figure">' + (alt ? '<figcaption>' + alt + '</figcaption>' : '') + '</figure>')
    .replace(/<img (?![^>]*data-broken)/g, '<img data-broken="img" ')
    .replace(/<table>/g, '<div class="tbl"><table>').replace(/<\/table>/g, '</table></div>');
}

function shareLinks(ctx, url, title) {
  const u = encodeURIComponent(url), t = encodeURIComponent(title);
  return '<div class="share"><span class="tiny-k">Share</span>' +
    '<a href="https://twitter.com/intent/tweet?url=' + u + '&text=' + t + '" target="_blank" rel="noopener" aria-label="Share on X">X</a>' +
    '<a href="https://www.linkedin.com/sharing/share-offsite/?url=' + u + '" target="_blank" rel="noopener" aria-label="Share on LinkedIn">LinkedIn</a>' +
    '<a href="https://t.me/share/url?url=' + u + '&text=' + t + '" target="_blank" rel="noopener" aria-label="Share on Telegram">Telegram</a>' +
    '<a href="https://wa.me/?text=' + t + '%20' + u + '" target="_blank" rel="noopener" aria-label="Share on WhatsApp">WhatsApp</a>' +
    '<button type="button" data-copy="' + esc(url) + '" aria-label="Copy link">' + A.ic('copy', '#121110', 15) + 'Copy link</button></div>';
}

function article(ctx, d) {
  const p = d.post;
  const url = ctx.appUrl + '/blog/' + encodeURIComponent(p.slug);
  const toc = d.toc.length > 1 ? '<nav class="toc" aria-label="On this page"><span class="tiny-k">On this page</span><ol>' + d.toc.map(t => '<li><a href="#' + esc(t.id) + '">' + esc(t.text) + '</a></li>').join('') + '</ol></nav>' : '';
  return '<article class="post">' +
    '<header class="wrap post-head"><nav class="crumbs" aria-label="Breadcrumb"><a href="/blog">Blog</a><span aria-hidden="true">/</span><span>' + esc(p.category) + '</span></nav>' +
    '<div class="post-meta big"><span class="pill pill-mint">' + esc(p.category) + '</span><span>' + esc(p.read_time) + ' read · <time datetime="' + esc(p.published_at) + '">' + P.shortDate(p.published_at) + '</time> · ' + esc(ctx.s.company.product) + ' team</span></div>' +
    '<h1 class="h1 post-h1">' + esc(p.title) + '</h1><p class="lead">' + esc(p.description) + '</p>' +
    '<div class="post-art post-cover" style="background:' + A.catBg(p.category) + '">' + A.coverArt(p.cover, p.category, 'a' + p.slug) + '</div></header>' +
    '<div class="wrap post-body"><aside class="post-side">' + toc + shareLinks(ctx, url, p.title) + '</aside>' +
    '<div class="prose">' + enhanceArticle(d.html) + ctaBox(ctx, 'Put this on autopilot.', 'Your first Closer is free and live in minutes.') + '</div></div></article>' +
    (d.related.length ? '<section class="band"><div class="wrap" style="padding-block:60px"><h2 class="h3">Keep reading</h2><div class="post-grid" style="margin-top:20px">' + d.related.map(r => P.postCard(r, { uid: 'r' })).join('') + '</div></div></section>' : '');
}

// ---------------- Legal ----------------
function legalIndex(ctx, pages) {
  return pageHero('Legal', 'The fine print, ' + it('in plain English.'), 'How ' + esc(ctx.s.company.product) + ' works, what we do with data and the rules that keep everyone safe.') +
    '<section class="wrap" style="padding-bottom:100px"><div class="legal-grid">' + pages.map(p => '<a class="card lift legal-card" href="/legal/' + encodeURIComponent(p.slug) + '"><span class="legal-ic">' + A.ic('doc', '#121110', 22) + '</span><h2 class="legal-t">' + esc(p.title) + '</h2><p>' + esc(p.description) + '</p><span class="muted xs">Updated ' + P.shortDate(p.updated_at) + '</span></a>').join('') + '</div>' +
    '<p class="muted tc" style="margin-top:28px">Questions about these documents? Email <a href="mailto:' + esc(ctx.s.company.legal_email) + '">' + esc(ctx.s.company.legal_email) + '</a>.</p></section>';
}

function legalPage(ctx, d) {
  const p = d.page;
  const toc = d.toc.length > 1 ? '<nav class="toc" aria-label="Contents"><span class="tiny-k">Contents</span><ol>' + d.toc.map(t => '<li><a href="#' + esc(t.id) + '">' + esc(t.text) + '</a></li>').join('') + '</ol></nav>' : '';
  return '<article class="post legal">' +
    '<header class="wrap post-head"><nav class="crumbs" aria-label="Breadcrumb"><a href="/legal">Legal</a><span aria-hidden="true">/</span><span>' + esc(p.title) + '</span></nav>' +
    '<h1 class="h1 post-h1">' + esc(p.title) + '</h1>' + (p.description ? '<p class="lead">' + esc(p.description) + '</p>' : '') + '<p class="muted small">Last updated <time datetime="' + esc(p.updated_at) + '">' + P.shortDate(p.updated_at) + '</time></p></header>' +
    '<div class="wrap post-body"><aside class="post-side">' + toc + '<div class="side-links"><span class="tiny-k">More legal</span>' + d.others.map(o => '<a href="/legal/' + encodeURIComponent(o.slug) + '">' + esc(o.title) + '</a>').join('') + '</div></aside>' +
    '<div class="prose">' + enhanceArticle(d.html) + '</div></div></article>';
}

// ---------------- Contact ----------------
function contact(ctx, d) {
  const c = ctx.s.company;
  const sales = d.topic === 'sales';
  return pageHero(sales ? 'Talk to sales' : 'Contact', sales ? 'Let\'s build your ' + it('Closer team.') : 'We reply ' + it('fast.') + ' Obviously.',
    sales ? 'Tell us about your volume and goals. We will get back within one business day with a plan built around you.' : 'Questions, partnerships or support. Send a message and a real person on our team will reply.') +
    '<section class="wrap" style="padding-bottom:100px"><div class="contact">' +
    '<form id="contactForm" class="card contact-f" novalidate>' +
    '<div class="seg" role="group" aria-label="Topic"><button type="button" data-topic="contact" class="' + (sales ? '' : 'on') + '" aria-pressed="' + !sales + '">General</button><button type="button" data-topic="sales" class="' + (sales ? 'on' : '') + '" aria-pressed="' + sales + '">Sales</button></div>' +
    '<input type="hidden" name="source" value="' + (sales ? 'sales' : 'contact') + '">' +
    '<div class="fld"><label class="lbl" for="cName">Your name</label><input class="input" id="cName" name="name" autocomplete="name" maxlength="80" placeholder="Alex Morgan"></div>' +
    '<div class="fld"><label class="lbl" for="cEmail">Work email</label><input class="input" id="cEmail" name="email" type="email" autocomplete="email" required maxlength="200" placeholder="you@business.com"></div>' +
    (d.planOptions.length ? '<div class="fld"><label class="lbl" for="cPlan">Plan you are interested in</label><select class="input" id="cPlan" name="plan"><option value="">Not sure yet</option>' + d.planOptions.map(p => '<option value="' + esc(p.name) + '"' + (p.id === d.plan ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></div>' : '') +
    '<div class="fld"><label class="lbl" for="cMsg">How can we help?</label><textarea class="input" id="cMsg" name="message" rows="6" required maxlength="4000" placeholder="' + (sales ? 'Tell us what you sell, how many chats you get a day and which channels you use.' : 'Write your message…') + '"></textarea></div>' +
    '<p class="form-err" id="cErr" role="alert" hidden></p>' +
    '<button class="btn btn-main" type="submit" style="align-self:flex-start"><span>Send message</span><span class="arr">' + A.ARROW + '</span></button>' +
    '<p class="muted xs">By sending this you agree to our <a href="/legal/privacy">Privacy Policy</a>.</p></form>' +
    '<aside class="contact-side"><div class="card side-card"><span class="legal-ic">' + A.ic('mail', '#121110', 22) + '</span><strong>Email us</strong><a href="mailto:' + esc(c.support_email) + '">' + esc(c.support_email) + '</a><span class="muted small">We usually reply within a few hours.</span></div>' +
    (ctx.features.chat_widget ? '<div class="card side-card"><span class="legal-ic">' + A.ic('chat', '#121110', 22) + '</span><strong>Chat with Juno</strong><span class="muted small">Instant answers about plans, setup and channels.</span><button type="button" class="btn btn-ink btn-sm" data-open-chat style="align-self:flex-start">Open chat</button></div>' : '') +
    '<div class="card side-card side-dark"><div class="side-juno">' + A.junoArt(90, true, false) + '</div><strong>' + esc(c.product) + ' is a product of ' + esc(c.legal_name) + '</strong><span>' + esc(c.address) + '</span></div></aside></div></section>';
}

// ---------------- Errors ----------------
function errorPage(ctx, status) {
  const nf = status === 404;
  return '<section class="p-hero err"><div class="mesh a-mesh" style="width:520px;height:520px;right:-160px;top:-200px;background:#FFE58A"></div><div class="wrap p-hero-in center">' +
    '<div class="err-art">' + A.closerBot('#FFC21A', 130, '?') + '</div><span class="eyebrow">Error ' + status + '</span>' +
    '<h1 class="h1 p-h1">' + (nf ? 'This page went ' + it('quiet.') : 'Something ' + it('broke.')) + '</h1>' +
    '<p class="lead" style="max-width:520px">' + (nf ? 'We couldn\'t find that page. It may have moved, or the link has a typo. Unlike our Closers, this one didn\'t reply.' : 'Our team has been told. Please try again in a moment.') + '</p>' +
    '<div class="tags" style="justify-content:center"><a class="btn btn-main" href="/"><span>Back to home</span><span class="arr">' + A.ARROW + '</span></a>' + (nf && ctx.features.blog ? '<a class="btn btn-ghost" href="/blog">Read the blog</a>' : '') + '<a class="btn btn-ghost" href="/contact">Contact us</a></div></div></section>';
}

module.exports = { pricingPage, blogIndex, article, legalIndex, legalPage, contact, errorPage };
