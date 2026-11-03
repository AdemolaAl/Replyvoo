'use strict';
// Page shell for the marketing site: <head> with SEO tags, header, footer, chat widget and data block.
const A = require('./art');
const { esc } = A;

const LANGS = [['en', 'EN', 'English'], ['fr', 'FR', 'Français'], ['pt', 'PT', 'Português'], ['es', 'ES', 'Español'], ['sw', 'SW', 'Kiswahili'], ['ar', 'AR', 'العربية']];

// JSON for <script type="application/json"> and JSON-LD: no "<" can close the tag early.
function safeJson(o) { return JSON.stringify(o).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16)); }

function abs(ctx, u) { return /^https?:\/\//.test(u) ? u : ctx.appUrl + (u.startsWith('/') ? u : '/' + u); }

const OG_LOCALE = { en: 'en_US', fr: 'fr_FR', pt: 'pt_BR', es: 'es_ES', sw: 'sw_KE', ar: 'ar_AR' };

function head(ctx, o) {
  const seo = ctx.s.seo;
  const title = o.title || seo.title;
  const desc = o.description || seo.description;
  const canonical = ctx.appUrl + (o.path || '/');
  const og = abs(ctx, o.image || seo.og_image || '/img/og.png');
  const tw = seo.twitter_handle ? (seo.twitter_handle.startsWith('@') ? seo.twitter_handle : '@' + seo.twitter_handle) : '';
  const ld = (o.jsonld || []).map(j => '<script type="application/ld+json">' + safeJson(j) + '</script>').join('');
  return '<!doctype html><html lang="' + esc(o.lang || 'en') + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>' + esc(title) + '</title><meta name="description" content="' + esc(desc) + '">' +
    (o.keywords || (o.path === '/' && seo.keywords) ? '<meta name="keywords" content="' + esc(o.keywords || seo.keywords) + '">' : '') +
    (o.noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index,follow,max-image-preview:large">') +
    '<link rel="canonical" href="' + esc(canonical) + '">' +
    '<meta property="og:site_name" content="' + esc(ctx.s.company.product) + '"><meta property="og:type" content="' + (o.ogType || 'website') + '">' +
    '<meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:url" content="' + esc(canonical) + '"><meta property="og:image" content="' + esc(og) + '"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' +
    '<meta property="og:locale" content="' + (OG_LOCALE[o.lang] || 'en_US') + '">' + (o.article ? '<meta property="article:published_time" content="' + esc(o.article.published) + '"><meta property="article:modified_time" content="' + esc(o.article.modified) + '"><meta property="article:section" content="' + esc(o.article.section) + '">' : '') +
    '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + esc(title) + '"><meta name="twitter:description" content="' + esc(desc) + '"><meta name="twitter:image" content="' + esc(og) + '">' + (tw ? '<meta name="twitter:site" content="' + esc(tw) + '">' : '') +
    '<meta name="theme-color" content="#FFC21A"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest">' +
    (ctx.features.blog ? '<link rel="alternate" type="application/rss+xml" title="' + esc(ctx.s.company.product) + ' Blog" href="' + esc(ctx.appUrl) + '/blog/rss.xml">' : '') +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap">' +
    '<link rel="stylesheet" href="/css/site.css?v=' + ctx.v + '">' +
    (o.css || []).map(c => '<link rel="stylesheet" href="' + c + '?v=' + ctx.v + '">').join('') +
    '<script>document.documentElement.classList.add("js")</script>' +
    '<script src="/js/site.js?v=' + ctx.v + '" defer></script>' +
    // Voo Connect: keeps a VooSquare affiliate click (ref / vclick / coupon) even on cached pages, and adds it to login links.
    (ctx.voo && ctx.voo.enabled ? '<script src="/voo-connect-browser.js" defer></script>' : '') +
    (ctx.voo && ctx.voo.widget ? '<script src="' + esc(ctx.voo.widget.src) + '" data-product="replyvoo" defer></script>' : '') + (o.scene ? '<script src="/js/scene.js?v=' + ctx.v + '" defer></script>' : '') + (o.train ? '<script src="/js/train-scene.js?v=' + ctx.v + '" defer></script>' : '') + (o.js || []).map(j => '<script src="' + j + '?v=' + ctx.v + '" defer></script>').join('') + ld + '</head>';
}

function navHref(ctx, hash) { return (ctx.home ? '' : '/') + '#' + hash; }

function header(ctx, o = {}) {
  const f = ctx.features;
  const sec = ctx.s.site.sections || {};
  const links = [
    ['nav0', 'Product', navHref(ctx, 'product')],
    (ctx.channelNav || []).length ? ['navCh', 'Channels', '/channels'] : null,
    sec.compare !== false ? ['nav1', 'Compare', navHref(ctx, 'compare')] : null,
    ['nav2', 'Pricing', '/pricing'],
    f.blog ? ['nav3', 'Blog', '/blog'] : null
  ].filter(Boolean);
  const cur = o.current || '';
  const navLinks = links.map(l => '<a href="' + l[2] + '" data-i="' + l[0] + '"' + (cur === l[2] ? ' aria-current="page"' : '') + '>' + l[1] + '</a>').join('');
  const lang = ctx.lang || 'en';
  const langCode = (LANGS.find(l => l[0] === lang) || LANGS[0])[1];
  const authBtns = ctx.user
    ? '<a class="btn btn-ink hide-sm" href="/app">Open dashboard</a>'
    : '<a class="btn hide-sm hdr-login" href="/app/login" data-i="login">Log in</a><a class="btn btn-ink hide-sm" href="' + ctx.signupUrl + '" data-i="ctaShort">Start free</a>';
  return '<header class="hdr' + (o.solid ? ' scrolled' : '') + '" id="hdr"><div class="wrap hdr-in">' +
    '<a class="logo" href="/" aria-label="' + esc(ctx.s.company.product) + ' home"><span class="logo-mark shine">' + A.LOGO_MARK() + '</span><span class="logo-word">' + esc(ctx.s.company.product) + '</span>' + (o.sub ? '<span class="it logo-sub">' + esc(o.sub) + '</span>' : '') + '</a>' +
    '<nav class="nav hide-sm" aria-label="Main">' + navLinks + '</nav>' +
    '<div class="hdr-right">' +
    (o.langs ? '<div class="lang-wrap"><button class="lang-btn" id="langBtn" type="button" aria-label="Change language" aria-haspopup="true" aria-expanded="false" aria-controls="langMenu">' + A.ic('globe', 'currentColor', 16) + '<span id="langCode">' + langCode + '</span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>' +
      '<div class="lang-menu" id="langMenu" role="menu" hidden>' + LANGS.map(l => '<button type="button" role="menuitemradio" class="lang-item' + (l[0] === lang ? ' on' : '') + '" aria-checked="' + (l[0] === lang) + '" data-lang="' + l[0] + '"><span class="lang-code">' + l[1] + '</span><span style="flex:1">' + l[2] + '</span><span class="lang-chk">' + A.CHECK_INK(16) + '</span></button>').join('') + '</div></div>' : '') +
    authBtns +
    '<button class="menu-btn show-sm" id="menuBtn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mMenu">' + A.ic('menu', '#121110', 22, 2.4) + '</button>' +
    '</div></div>' +
    '<div class="m-menu" id="mMenu" hidden><nav aria-label="Mobile">' + links.map(l => '<a href="' + l[2] + '">' + l[1] + '</a>').join('') + '<a href="/contact">Contact</a></nav>' +
    '<div class="m-menu-cta">' + (ctx.user ? '<a class="btn btn-ink" href="/app">Open dashboard</a>' : '<a class="btn btn-ghost" href="/app/login">Log in</a><a class="btn btn-ink" href="' + ctx.signupUrl + '">Start free</a>') + '</div></div>' +
    '</header>';
}

function announcement(ctx) {
  const a = ctx.s.site.announcement || {};
  if (!a.on || !a.text) return '';
  const link = a.link && /^(\/|https?:\/\/)/.test(a.link) ? a.link : '';
  return '<div class="topstrip"><div class="wrap topstrip-in"><span class="new-tag">New</span><span>' + esc(a.text) + '</span>' +
    (link && a.link_text ? '<a href="' + esc(link) + '">' + esc(a.link_text) + ' →</a>' : '') + '</div></div>';
}

function footer(ctx) {
  const f = ctx.features;
  const c = ctx.s.company;
  const j = ctx.s.joinvoo;
  const sec = ctx.s.site.sections || {};
  const on = k => sec[k] !== false;
  const col = (title, items) => '<div class="f-col"><strong>' + title + '</strong>' + items.filter(Boolean).map(i => '<a href="' + i[1] + '"' + (i[2] ? ' rel="noopener"' : '') + '>' + i[0] + '</a>').join('') + '</div>';
  return '<footer class="foot"><div class="wrap foot-in">' +
    '<div class="f-brand"><a class="logo" href="/" aria-label="' + esc(c.product) + ' home"><span class="logo-mark">' + A.LOGO_MARK() + '</span><span class="logo-word">' + esc(c.product) + '</span></a>' +
    '<p class="muted">AI Closers that answer your customer chats in seconds and sell while you sleep. Live on Telegram, with WhatsApp, Instagram and TikTok on the way.</p>' +
    '<p class="muted small">' + esc(c.product) + ' is a product of ' + esc(c.legal_name) + (c.address ? ', ' + esc(c.address) : '') + '.</p>' +
    '<a class="f-mail" href="mailto:' + esc(c.support_email) + '">' + A.ic('mail', '#121110', 18) + esc(c.support_email) + '</a></div>' +
    col('Product', [on('closers') ? ['Agent Studio', '/#closers'] : null, on('compare') ? ['Compare', '/#compare'] : null, ['Pricing', '/pricing'], f.wallet && on('wallet') ? ['Voo Wallet', '/#credits'] : null, f.juno && on('juno') ? ['Juno', '/#juno'] : null]) +
    ((ctx.channelNav || []).length ? col('Channels', ctx.channelNav.map(c => [esc(c.keyword) + (c.status === 'soon' ? ' <span class="f-soon">soon</span>' : ''), '/' + c.slug]).concat([['Compare channels', '/channels']])) : '') +
    col('Resources', [f.blog ? ['Blog', '/blog'] : null, on('faq') ? ['FAQ', '/#faq'] : ['Pricing FAQ', '/pricing#faq'], on('calc') ? ['Savings calculator', '/#calc'] : null, ['Contact', '/contact'], ['Talk to sales', '/contact?topic=sales'], (j.enabled && f.joinvoo) ? ['Joinvoo', '/go/joinvoo?from=site_footer', 1] : null]) +
    col('Company', [f.squad ? ['Voo Squad', on('squad') ? '/#squad' : '/legal/referral'] : null, ['Log in', '/app/login'], ['Start free', ctx.signupUrl], ['Legal', '/legal']]) +
    col('Legal', [['Terms', '/legal/terms'], ['Privacy', '/legal/privacy'], ['Refunds', '/legal/refunds'], ['Acceptable use', '/legal/acceptable-use'], ['Messaging & anti-spam', '/legal/messaging'], ['AI use', '/legal/ai-use'], ['Security', '/legal/security'], ['Service availability', '/legal/availability'], ['IP & takedowns', '/legal/ip-takedowns'], ['Disclaimers', '/legal/disclaimer'], ['Cookies', '/legal/cookies'], ['DPA', '/legal/dpa']]) +
    '</div><div class="wrap foot-base"><span>© ' + new Date().getFullYear() + ' ' + esc(c.legal_name) + '. All rights reserved.' + (ctx.voo && ctx.voo.enabled ? ' · <a class="foot-voo" href="' + esc(ctx.voo.dashboard_url) + '" rel="noopener"><img src="/img/voosquare-mark.svg" width="16" height="16" alt="" loading="lazy"><span>Part of Voo<b>Square</b></span></a>' : '') + '</span>' +
    '<span>Telegram, WhatsApp, Instagram, Facebook, Messenger and TikTok are trademarks of their owners. ' + esc(c.product) + ' is not affiliated with or endorsed by them. <a href="/legal/disclaimer">Read the disclaimer</a>.</span></div></footer>';
}

// Replyvoo's own chat bubble is the same /widget.js customers install, in "house" mode: it talks to
// /api/public/chat (Juno, prompt from admin settings) and /api/public/contact instead of a widget key.
function houseWidget(ctx, o) {
  if (!ctx.features.chat_widget) return '';
  const c = ctx.s.company;
  const tg = /^https:\/\/t\.me\//.test(c.telegram_support || '') ? c.telegram_support : '';
  const cfg = {
    key: 'house', online: true, business: c.product, closer: { name: 'Juno', initials: 'J', ai: true },
    widget: {
      preset: 'gold', glass: false, colors: { primary: '#FFC21A', primary_text: '#121110', panel_bg: '#FFFFFF', header_bg: '#121110', header_text: '#FFFFFF', bubble_in: '#F4F2EC', bubble_in_text: '#121110', bubble_out: '#FFC21A', bubble_out_text: '#121110', text: '#121110' },
      radius: 24, launcher: 'pill', launcher_text: 'Chat with Juno', position: 'right', offset_x: 18, offset_y: 18, offset_y_m: o.mobileBar && !ctx.user ? 84 : 18, size: 'normal', theme: 'light',
      title: 'Juno from ' + c.product, subtitle: 'Online · replies in seconds', show_online: true, avatar_mode: 'initials',
      welcome: 'Hi there! 👋 I’m Juno. Ask me anything about ' + c.product + ', or tap a question below.', placeholder: 'Type your message…',
      chips: ['How does pricing work?', 'Connect my Telegram', 'Add chat to my website', 'Talk to a human'],
      greet_after: 0, greet_text: '', delay_min: 0.8, delay_max: 2.4, human_typing: true, typing_cps: 45, sound: false,
      disclosure: true, disclosure_text: 'AI assistant', lead: { mode: 'off' }, handoff_text: '', offline_text: '', telegram_button: !!tg
    },
    font: { family: '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif', css: '' }, assets: {}, team_online: true, telegram_url: tg, branding: { show: false }, css: ''
  };
  return '<script type="application/json" id="rv-house-widget">' + safeJson(cfg) + '</script><script src="/widget.js?v=' + ctx.v + '" data-house async></script>';
}

function mobileBar(ctx) {
  if (ctx.user) return '';
  return '<div class="mobile-bar"><a class="btn btn-ghost" href="/app/login" data-i="login">Log in</a><a class="btn btn-ink" href="' + ctx.signupUrl + '" style="flex:1"><span data-i="ctaShort">Start free</span>' + (ctx.freeConv ? '&nbsp;· ' + ctx.freeConv + ' free chats' : '') + '</a></div>';
}

function page(ctx, o, body) {
  const data = Object.assign({ chat: !!ctx.features.chat_widget, product: ctx.s.company.product, supportEmail: ctx.s.company.support_email }, o.data || {});
  return head(ctx, o) + '<body class="' + (o.bodyClass || '') + '"><a class="skip" href="#main">Skip to content</a>' +
    (o.announce ? announcement(ctx) : '') + header(ctx, o.header || {}) + '<main id="main">' + body + '</main>' + footer(ctx) +
    (o.mobileBar ? mobileBar(ctx) : '') + houseWidget(ctx, o) + '<div id="toastRoot" aria-live="polite"></div>' +
    '<script type="application/json" id="rv-data">' + safeJson(data) + '</script></body></html>';
}

module.exports = { page, safeJson, abs, LANGS };
