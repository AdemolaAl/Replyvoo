'use strict';
// Shared site blocks: plan cards, packs, power-ups, FAQ accordion, blog cards.
const A = require('./art');
const { esc } = A;

const fmt = n => Math.round(Number(n) || 0).toLocaleString('en-US');
function money(n) {
  const v = Number(n) || 0;
  const small = Math.abs(v) < 1 && v !== 0;
  const r = small ? Math.round(v * 1000) / 1000 : Math.round(v * 100) / 100;
  if (Number.isInteger(r)) return '$' + r.toLocaleString('en-US');
  return '$' + r.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: small ? 3 : 2 });
}
function shortDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function planPrices(p) {
  const pct = p.offer ? Math.min(100, Math.max(0, Number(p.offer.percent) || 0)) : 0;
  const k = 1 - pct / 100;
  const m = p.price_month, y = p.price_year / 12;
  return { pct, m, y, mNow: m * k, yNow: y * k, yTotalNow: p.price_year * k };
}

function planCard(ctx, p) {
  const pr = planPrices(p);
  const dark = p.popular || p.elite;
  const free = p.price_month <= 0;
  let dots = '';
  for (let i = 0; i < Math.min(p.closers, 10); i++) dots += '<span style="background:' + (dark ? '#FFC21A' : '#121110') + ';opacity:' + (1 - i * 0.06).toFixed(2) + '"></span>';
  const agText = p.closers >= 9999 ? 'Unlimited AI Closers' : p.closers + ' AI Closer' + (p.closers > 1 ? 's' : '');
  const href = p.contact_sales ? '/contact?plan=' + encodeURIComponent(p.id) + '&topic=sales' : ctx.signupUrl + (ctx.signupUrl.includes('?') ? '&' : '?') + 'plan=' + encodeURIComponent(p.id);
  const perM = free ? 'forever' : '/month';
  const perY = free ? 'forever' : '/mo, billed ' + money(pr.yTotalNow) + ' yearly';
  let ribbon = '';
  if (p.offer) {
    const ends = p.offer.ends_at ? shortDate(p.offer.ends_at) : '';
    ribbon = '<div class="offer-rib"><span>' + esc(p.offer.label || ('Save ' + pr.pct + '%')) + '</span>' + (p.offer.label ? '<b>-' + pr.pct + '%</b>' : '') + (ends ? '<em>Ends ' + esc(ends) + '</em>' : '') + '</div>';
  }
  const elBg = p.elite ? ' elite' : '';
  return '<article class="plan lift' + (dark ? ' pop' : '') + elBg + '" data-plan="' + esc(p.id) + '">' +
    (p.popular ? '<div class="mesh a-mesh" style="width:240px;height:240px;right:-90px;top:-90px;background:#FFC21A;opacity:.35"></div>' : '') +
    ribbon +
    '<div class="plan-top"><h3 class="plan-name">' + esc(p.name) + '</h3>' + (p.badge ? '<span class="pill plan-badge">' + esc(p.badge) + '</span>' : '') + '</div>' +
    '<span class="pdesc">' + esc(p.description) + '</span>' +
    '<div class="plan-price">' + (p.contact_sales ? '<span class="pper pfrom">from</span>' : '') +
    (p.offer && !free ? '<s class="pold" data-m="' + money(pr.m) + '" data-y="' + money(pr.y) + '">' + money(pr.m) + '</s>' : '') +
    '<span class="pnum tnum" data-m="' + money(pr.mNow) + '" data-y="' + money(pr.yNow) + '">' + money(pr.mNow) + '</span>' +
    '<span class="pper" data-m="' + esc(perM) + '" data-y="' + esc(perY) + '">' + esc(perM) + '</span></div>' +
    '<div class="agents"><div class="agent-dots" aria-hidden="true">' + dots + '</div><span class="agents-t"><strong>' + agText + '</strong><span class="pdesc">' + fmt(p.conversations) + (p.contact_sales ? '+' : '') + ' chats · ' + esc(p.channels_text) + '</span></span></div>' +
    '<a class="btn plan-cta" href="' + esc(href) + '" data-base="' + esc(href) + '"' + (p.contact_sales ? '' : ' data-signup') + '>' + esc(p.cta || 'Get started') + '</a>' +
    '<ul class="plan-feats">' + p.features.map(x => '<li>' + A.CHECK + '<span>' + esc(x) + '</span></li>').join('') +
    (p.extra_chat_price > 0 ? '<li class="dim">' + A.CHECK + '<span>Extra chats: 1 Voo Credit each</span></li>' : '') + '</ul></article>';
}

function billingToggle(ctx) {
  const free = ctx.s.billing.yearly_months_free;
  return '<div class="seg" role="group" aria-label="Billing period"><button type="button" class="on" data-bill="m" aria-pressed="true">Monthly</button><button type="button" data-bill="y" aria-pressed="false">Yearly' +
    (free > 0 ? ' <span class="seg-tag">' + free + ' month' + (free > 1 ? 's' : '') + ' free</span>' : '') + '</button></div>';
}

function planGrids(ctx, plans) {
  const normal = plans.filter(p => !p.elite), elite = plans.filter(p => p.elite);
  return '<div class="plan-grid">' + normal.map(p => planCard(ctx, p)).join('') + '</div>' +
    (elite.length ? '<div class="divider-lbl"><span></span><span class="eyebrow">For big operators</span><span></span></div><div class="plan-grid elite-grid">' + elite.map(p => planCard(ctx, p)).join('') + '</div>' : '');
}

function addonsList(addons) {
  return addons.map(a => {
    const soon = a.status === 'soon';
    return '<div class="addon' + (soon ? ' soon' : '') + '"><span class="addon-t"><strong>' + esc(a.name) + '</strong><span>' + esc(a.description) + '</span></span><span class="pill ' + (soon ? 'pill-soon' : 'pill-mint') + '">' + (soon ? 'Coming soon' : esc(a.price_text)) + '</span></div>';
  }).join('');
}

function packsList(packs) {
  return packs.map((p, i) => '<div class="pack' + (p.label && /popular/i.test(p.label) ? ' feat' : '') + '">' +
    (p.label ? '<span class="pack-lbl">' + esc(p.label) + '</span>' : '') +
    '<span class="pack-top"><strong class="tnum">' + fmt(p.credits) + '</strong>' + (p.bonus ? '<span class="pill pill-jade">+' + fmt(p.bonus) + ' bonus</span>' : '') + '</span>' +
    '<span class="muted small">Voo Credits</span><strong class="pack-price">' + money(p.price) + '</strong>' +
    '<span class="muted xs">' + money(p.price / (p.credits + p.bonus) * 100) + ' per 100 chats</span></div>').join('');
}

function faqList(items, idp) {
  return '<div class="faq-list">' + items.map((f, i) => {
    const id = (idp || 'faq') + i;
    const open = i === 0;
    return '<div class="faq' + (open ? ' open' : '') + '"><h3 class="faq-h"><button type="button" class="faq-q" id="' + id + 'q" aria-expanded="' + open + '" aria-controls="' + id + 'a"><span>' + esc(f[0]) + '</span><span class="faq-i" aria-hidden="true">+</span></button></h3>' +
      '<div class="faq-a" id="' + id + 'a" role="region" aria-labelledby="' + id + 'q"' + (open ? '' : ' hidden') + '><p>' + esc(f[1]) + '</p></div></div>';
  }).join('') + '</div>';
}

function postCard(p, opts = {}) {
  const dark = A.catDark(p.category);
  return '<a class="post-card lift" href="/blog/' + encodeURIComponent(p.slug) + '" data-cat="' + esc(p.category) + '">' +
    '<div class="post-art" style="background:' + A.catBg(p.category) + '">' + A.coverArt(p.cover, p.category, (opts.uid || '') + p.slug) + '</div>' +
    '<div class="post-meta"><span class="pill ' + (dark ? 'pill-ink' : 'pill-mint') + '">' + esc(p.category) + '</span><span>' + esc(p.read_time) + ' read · ' + shortDate(p.published_at) + '</span></div>' +
    '<' + (opts.h || 'h3') + ' class="post-title">' + esc(p.title) + '</' + (opts.h || 'h3') + '><span class="post-ex">' + esc(p.description) + '</span></a>';
}

module.exports = { fmt, money, shortDate, planPrices, planCard, billingToggle, planGrids, addonsList, packsList, faqList, postCard };
