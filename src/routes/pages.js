'use strict';
// Public marketing website: server-rendered, SEO-ready pages. Templates live in views/site/*.js.
// Settings are read on every request (they are cached in memory), so admin edits show up at once.
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const config = require('../config');
const settings = require('../services/settings');
const ws = require('../services/workspace');
const catalog = require('../services/catalog');
const md = require('../lib/md');

const VIEWS = path.join(config.root, 'views', 'site');
const LANG_CODES = ['en', 'fr', 'pt', 'es', 'sw', 'ar'];

// In development, re-read templates on every request so edits show without a restart.
function T(name) {
  const file = path.join(VIEWS, name + '.js');
  if (!config.isProd && !T.fresh) {
    for (const k of Object.keys(require.cache)) if (k.startsWith(VIEWS + path.sep)) delete require.cache[k];
    T.fresh = true; setImmediate(() => { T.fresh = false; });
  }
  return require(file);
}

// Cache-busting version for /css/site.css and /js/site.js.
let assetV = null;
function version() {
  if (assetV && config.isProd) return assetV;
  let t = 0;
  for (const f of ['public/css/site.css', 'public/js/site.js', 'public/js/scene.js', 'public/widget.js']) { try { t = Math.max(t, fs.statSync(path.join(config.root, f)).mtimeMs); } catch { /* missing */ } }
  assetV = Math.floor(t).toString(36);
  return assetV;
}

function ctxFor(req, extra = {}) {
  const s = settings.all();
  const features = Object.assign({}, s.flags.features);
  for (const k of Object.keys(features)) features[k] = features[k] !== false;
  const qLang = String(req.query.lang || '').toLowerCase();
  const plans = ws.publicPlans();
  const free = plans.find(p => p.id === s.billing.free_plan_id) || plans.find(p => p.price_month <= 0);
  return Object.assign({
    s, features, user: req.user || null, appUrl: config.appUrl, v: version(),
    lang: LANG_CODES.includes(qLang) ? qLang : 'en',
    ref: req.query.invite ? String(req.query.invite).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) : '', // Voo Squad invite (own parameter)
    signupUrl: features.signup ? '/app/signup' : '/contact',
    freeConv: free ? free.conversations : 0,
    plans, home: false, voo: require('../services/voosquare').publicInfo(), channelNav: channelPages().filter(c => c.status !== 'off')
  }, extra);
}

const andList = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : l.join('');
const html = (res, body, status = 200) => res.send(body, status, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });

function publishedPosts(limit) {
  return db.all('SELECT id, slug, title, description, category, cover, keywords, read_time, featured, published_at, updated_at FROM posts WHERE status = \'published\' AND published_at <= ? ORDER BY published_at DESC' + (limit ? ' LIMIT ' + Number(limit) : ''), db.now());
}
function packs() { return db.all('SELECT id, credits, bonus, price, label FROM packs WHERE active = 1 ORDER BY sort, price'); }
function addons() { return addonsFor(db.all('SELECT slug, name, description, price_text, status FROM addons WHERE active = 1 AND status != \'off\' ORDER BY sort')); }
// The "WhatsApp channel" power-up follows the channel: once WhatsApp is live it is part of every plan (each chat is a
// normal conversation; Meta bills template messages to the customer's own WhatsApp account), and when it is off it is hidden.
function addonsFor(list) {
  const st = settings.channel('whatsapp');
  return list.map(a => {
    if (a.slug !== 'whatsapp-channel') return a;
    if (st === 'off') return null;
    if (st === 'live') return { ...a, status: 'live', price_text: 'Included', description: 'Your Closers on your WhatsApp Business number. Chats count as normal conversations. Meta bills template messages to your own WhatsApp account.' };
    return { ...a, status: 'soon' };
  }).filter(Boolean);
}

function channelStatus(c, fl) {
  if (c.id === 'telegram') {
    const v = ['telegram_bot', 'telegram_business', 'telegram_group'].map(k => fl[k]);
    return v.includes('live') ? 'live' : v.includes('soon') ? 'soon' : 'off';
  }
  return fl[c.flag] || 'off';
}
function channelList() {
  const fl = settings.get('flags').channels;
  const pages = T('channel-content');
  return catalog.CHANNELS.map(c => ({ ...c, status: channelStatus(c, fl), slug: (pages.byId(c.id) || {}).slug })).filter(c => c.status !== 'off');
}
// Channel landing pages with their live status from admin flags (including 'off', so callers can 404).
function channelPages() {
  const fl = settings.get('flags').channels;
  return T('channel-content').PAGES.map(p => {
    const c = catalog.CHANNELS.find(x => x.id === p.id) || {};
    return { ...p, desc: c.desc || '', status: channelStatus(c.id ? c : { id: p.id, flag: p.id }, fl) };
  });
}

// ---------- JSON-LD ----------
function orgLd(ctx) {
  const c = ctx.s.company;
  const logo = c.logo_url ? T('layout').abs(ctx, c.logo_url) : ctx.appUrl + '/favicon.svg';
  const sameAs = [c.twitter && /^https?:/.test(c.twitter) ? c.twitter : '', c.telegram_support && /^https?:/.test(c.telegram_support) ? c.telegram_support : ''].filter(Boolean);
  return { '@context': 'https://schema.org', '@type': 'Organization', '@id': ctx.appUrl + '/#organization', name: c.product, url: ctx.appUrl,
    logo: { '@type': 'ImageObject', url: logo }, email: c.support_email,
    description: ctx.s.seo.description,
    address: c.address ? { '@type': 'PostalAddress', addressLocality: c.address } : undefined,
    parentOrganization: { '@type': 'Organization', name: c.legal_name },
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', email: c.support_email, url: ctx.appUrl + '/contact', availableLanguage: ['English', 'French', 'Portuguese', 'Spanish', 'Swahili', 'Arabic'] }],
    sameAs: sameAs.length ? sameAs : undefined };
}
const FEATURE_LIST = ['AI sales agent (AI Closer) for Telegram bots, groups and personal accounts', 'WhatsApp AI chatbot on the WhatsApp Business Platform (coming soon)', 'Instagram DM automation: DMs, story replies and comment-to-DM (coming soon)',
  'TikTok DM automation via TikTok Business Messaging (coming soon)', 'Facebook Messenger AI chatbot (coming soon)', 'Lead qualification and HeatScore', 'Payment links and receipt reading', 'Human handoff in a shared inbox', 'Automatic follow-ups (Nudge) and broadcasts (Blast)', 'Voice note understanding', 'Multilingual replies'];
function appLd(ctx, plans) {
  const P = T('parts');
  return { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: ctx.s.company.product, applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
    url: ctx.appUrl, description: ctx.s.seo.description, publisher: { '@id': ctx.appUrl + '/#organization' },
    featureList: featureList(), keywords: ctx.s.seo.keywords, image: T('layout').abs(ctx, ctx.s.seo.og_image || '/img/og.png'),
    offers: plans.map(p => {
      const price = Number(P.planPrices(p).mNow.toFixed(2));
      return { '@type': 'Offer', name: p.name, price, priceCurrency: 'USD', url: ctx.appUrl + '/pricing', description: p.description,
        priceSpecification: { '@type': 'UnitPriceSpecification', price, priceCurrency: 'USD', unitText: 'MONTH' } };
    }) };
}
// Feature list follows the channel flags, so "coming soon" never shows for a live channel (or an off one).
function featureList() {
  const st = {}; for (const c of channelPages()) st[c.id] = c.status;
  const ch = { whatsapp: 1, instagram: 2, tiktok: 3, messenger: 4 };
  return FEATURE_LIST.map((f, i) => {
    const id = Object.keys(ch).find(k => ch[k] === i);
    if (i === 0 && st.telegram === 'off') return null;
    if (!id) return f;
    if (st[id] === 'off') return null;
    return st[id] === 'live' ? f.replace(' (coming soon)', '') : f;
  }).filter(Boolean);
}
function faqLd(items) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(f => ({ '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[1] } })) };
}
function crumbLd(ctx, list) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list.map((l, i) => ({ '@type': 'ListItem', position: i + 1, name: l[0], item: ctx.appUrl + l[1] })) };
}

// "Website chat is included on Pro ($149/mo) and up, or as a $29/mo power-up on any plan." Built from the DB.
function websitePricing(ctx) {
  const inc = ctx.plans.filter(p => p.website_sites > 0).sort((a, b) => a.price_month - b.price_month);
  const addon = db.one('SELECT name, price, price_text FROM addons WHERE slug = \'website-chat\' AND active = 1 AND status = \'live\'');
  const first = inc[0];
  const parts = [];
  if (first) parts.push('Website chat is included on ' + first.name + (first.contact_sales ? '' : ' ($' + first.price_month + '/mo)') + (inc.length > 1 ? ' and up' : '') + (first.website_sites === 1 ? ' with 1 site' : ' with ' + first.website_sites + ' sites') + (inc[1] ? ', ' + inc[1].name + ' includes ' + (inc[1].website_sites >= 999 ? 'unlimited' : inc[1].website_sites) + ' sites' : '') + '.');
  if (addon) parts.push('On any other plan, add it as the ' + addon.name + ' power-up for $' + addon.price + ' a month per site.');
  parts.push('Each conversation is billed like any other channel.');
  return { price: parts.join(' '), included: first ? first.name : '', addon_price: addon ? addon.price : null };
}

function calcPlans(plans) {
  return plans.filter(p => !p.contact_sales).map(p => ({ id: p.id, name: p.name, m: Math.round((p.offer ? p.price_month * (1 - p.offer.percent / 100) : p.price_month) * 100) / 100, conv: p.conversations, extra: p.extra_chat_price }));
}

function errorView(req, res, status) {
  const ctx = ctxFor(req);
  html(res, T('layout').page(ctx, { title: (status === 404 ? 'Page not found' : 'Something went wrong') + ' | ' + ctx.s.company.product, path: req.path, noindex: true, header: { solid: true }, data: { page: 'error' } }, T('misc').errorPage(ctx, status)), status);
}

module.exports = function (app) {
  // ---------- Home ----------
  app.get('/', (req, res) => {
    const ctx = ctxFor(req, { home: true });
    const s = ctx.s;
    const plans = ctx.plans;
    const paid = plans.filter(p => p.price_month > 0 && !p.contact_sales).map(p => p.price_month);
    const flagFor = { Nudge: 'nudge', Blast: 'blast', 'Night Shift Report': 'night_report', 'Joinvoo Sync': 'joinvoo' };
    const d = {
      plans, packs: packs(), addons: addons(), channels: channelList(),
      posts: publishedPosts(3), templates: catalog.TEMPLATES, vsRows: catalog.VS_ROWS,
      features: catalog.FEATURES.filter(f => !flagFor[f[1]] || ctx.features[flagFor[f[1]]]),
      freeConv: ctx.freeConv, bonus: s.billing.referee_bonus_credits,
      minPrice: plans.some(p => p.price_month <= 0) ? 0 : (paid.length ? Math.min(...paid) : 0),
      webPrice: websitePricing(ctx).price.replace(' Each conversation is billed like any other channel.', '')
    };
    const L = T('layout');
    const faq = (s.site.faq || []).filter(f => Array.isArray(f) && f[0]);
    const jsonld = [orgLd(ctx), appLd(ctx, plans)];
    if (s.site.sections.faq !== false && faq.length) jsonld.push(faqLd(faq));
    html(res, L.page(ctx, {
      title: s.seo.title, description: s.seo.description, path: '/', lang: ctx.lang, jsonld, announce: true, mobileBar: true,
      header: { langs: true }, bodyClass: 'home', scene: s.site.sections.website !== false && s.flags.channels.website === 'live', train: s.site.sections.studio !== false && ctx.features.studio !== false,
      css: ['/css/home.css'], js: (s.site.sections.studio !== false && ctx.features.studio !== false ? ['/js/voice.js'] : []).concat(['/js/home.js']),
      data: { page: 'home', lang: ctx.lang, langFromQuery: !!req.query.lang, hero: s.site.hero, plans: calcPlans(plans) }
    }, T('home').render(ctx, d)));
  });

  // ---------- Pricing ----------
  app.get('/pricing', (req, res) => {
    const ctx = ctxFor(req);
    const d = { plans: ctx.plans, packs: packs(), addons: addons() };
    const firstPaid = ctx.plans.find(p => p.price_month > 0);
    const chs = channelPages().filter(c => c.id !== 'website' && c.id !== 'messenger');
    const live = chs.filter(c => c.status === 'live').map(c => c.name); const soon = chs.filter(c => c.status === 'soon').map(c => c.name);
    const desc = 'AI sales agent pricing for ' + (andList(live) || 'chat apps') + (soon.length ? ', with ' + andList(soon) + ' coming soon' : '') + '. Start free, pay per conversation, never per message.' + (firstPaid ? ' Plans from $' + firstPaid.price_month + '/mo.' : '');
    html(res, T('layout').page(ctx, {
      title: 'Pricing | ' + ctx.s.company.product + ' AI Sales Agents for Telegram & WhatsApp', description: desc, path: '/pricing',
      jsonld: [orgLd(ctx), appLd(ctx, ctx.plans), crumbLd(ctx, [['Home', '/'], ['Pricing', '/pricing']])],
      header: { current: '/pricing' }, mobileBar: true, data: { page: 'pricing' }
    }, T('misc').pricingPage(ctx, d)));
  });

  // ---------- Blog ----------
  const blogOn = (req, res) => { if (!settings.feature('blog')) { errorView(req, res, 404); return false; } return true; };
  app.get('/blog', (req, res) => {
    if (!blogOn(req, res)) return;
    const ctx = ctxFor(req);
    const posts = publishedPosts();
    html(res, T('layout').page(ctx, {
      title: 'Blog | ' + ctx.s.company.product + ' playbooks for faster sales in chat',
      description: 'Guides for selling in chat with AI: Telegram bots, WhatsApp chatbots, Instagram and TikTok DM automation, follow-ups, broadcasts and pricing.',
      path: '/blog', jsonld: [orgLd(ctx), { '@context': 'https://schema.org', '@type': 'Blog', name: ctx.s.company.product + ' Blog', url: ctx.appUrl + '/blog',
        blogPost: posts.slice(0, 20).map(p => ({ '@type': 'BlogPosting', headline: p.title, url: ctx.appUrl + '/blog/' + p.slug, datePublished: p.published_at })) }],
      header: { current: '/blog', sub: 'Blog' }, data: { page: 'blog' }
    }, T('misc').blogIndex(ctx, { posts })));
  });

  // RSS 2.0 feed of the latest 20 posts (registered before /blog/:slug so it is not treated as a post).
  app.get('/blog/rss.xml', (req, res) => {
    if (!blogOn(req, res)) return;
    const s = settings.all();
    const base = config.appUrl;
    const posts = publishedPosts(20);
    const x = md.esc;
    const rfc = d => new Date(d).toUTCString();
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>' +
      '<title>' + x(s.company.product + ' Blog') + '</title><link>' + x(base + '/blog') + '</link>' +
      '<description>' + x('Playbooks for selling in chat with AI on Telegram, WhatsApp, Instagram and TikTok.') + '</description><language>en</language>' +
      '<atom:link href="' + x(base + '/blog/rss.xml') + '" rel="self" type="application/rss+xml"/>' +
      (posts[0] ? '<lastBuildDate>' + rfc(posts[0].updated_at || posts[0].published_at) + '</lastBuildDate>' : '') +
      posts.map(p => '<item><title>' + x(p.title) + '</title><link>' + x(base + '/blog/' + p.slug) + '</link><guid isPermaLink="true">' + x(base + '/blog/' + p.slug) + '</guid>' +
        '<pubDate>' + rfc(p.published_at) + '</pubDate><category>' + x(p.category) + '</category><description>' + x(p.description) + '</description></item>').join('') +
      '</channel></rss>';
    res.send(xml, 200, 'application/rss+xml; charset=utf-8', { 'Cache-Control': 'public, max-age=900' });
  });

  app.get('/blog/:slug', (req, res) => {
    if (!blogOn(req, res)) return;
    const post = db.one('SELECT * FROM posts WHERE slug = ? AND status = \'published\' AND published_at <= ?', String(req.params.slug), db.now());
    if (!post) return errorView(req, res, 404);
    const ctx = ctxFor(req);
    const r = md.render(post.body_md);
    // Links to a channel page that admin switched off would 404: point them at the /channels hub instead.
    for (const c of channelPages().filter(x => x.status === 'off')) r.html = r.html.split('href="/' + c.slug + '"').join('href="/channels"');
    const all = publishedPosts().filter(p => p.slug !== post.slug);
    const related = all.filter(p => p.category === post.category).concat(all.filter(p => p.category !== post.category)).slice(0, 3);
    const url = ctx.appUrl + '/blog/' + post.slug;
    const L = T('layout');
    html(res, L.page(ctx, {
      title: post.title + ' | ' + ctx.s.company.product + ' Blog', description: post.description, keywords: post.keywords, path: '/blog/' + post.slug, ogType: 'article',
      article: { published: post.published_at, modified: post.updated_at || post.published_at, section: post.category },
      jsonld: [{ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.description, datePublished: post.published_at, dateModified: post.updated_at || post.published_at,
        articleSection: post.category, keywords: post.keywords, image: L.abs(ctx, ctx.s.seo.og_image || '/img/og.png'), mainEntityOfPage: url, url,
        author: { '@type': 'Organization', name: ctx.s.company.product + ' team', url: ctx.appUrl },
        publisher: { '@type': 'Organization', name: ctx.s.company.legal_name, logo: { '@type': 'ImageObject', url: ctx.appUrl + '/favicon.svg' } } },
      crumbLd(ctx, [['Home', '/'], ['Blog', '/blog'], [post.title, '/blog/' + post.slug]])],
      header: { current: '/blog', sub: 'Blog' }, data: { page: 'post' }
    }, T('misc').article(ctx, { post, html: r.html, toc: r.toc, related })));
  });

  // ---------- Legal ----------
  const LEGAL_ORDER = ['terms', 'privacy', 'acceptable-use', 'messaging', 'ai-use', 'refunds', 'availability', 'security', 'ip-takedowns', 'cookies', 'dpa', 'referral', 'disclaimer'];
  const legalPages = () => db.all('SELECT slug, title, description, updated_at FROM pages').sort((a, b) => ((LEGAL_ORDER.indexOf(a.slug) + 1) || 99) - ((LEGAL_ORDER.indexOf(b.slug) + 1) || 99) || a.title.localeCompare(b.title));
  app.get('/legal', (req, res) => {
    const ctx = ctxFor(req);
    html(res, T('layout').page(ctx, {
      title: 'Legal | ' + ctx.s.company.product, description: 'Terms, privacy, refunds, cookies, acceptable use and other policies for ' + ctx.s.company.product + ' by ' + ctx.s.company.legal_name + '.',
      path: '/legal', jsonld: [crumbLd(ctx, [['Home', '/'], ['Legal', '/legal']])], header: { solid: true }, data: { page: 'legal' }
    }, T('misc').legalIndex(ctx, legalPages())));
  });
  app.get('/legal/:slug', (req, res) => {
    const page = db.one('SELECT * FROM pages WHERE slug = ?', String(req.params.slug));
    if (!page) return errorView(req, res, 404);
    const ctx = ctxFor(req);
    // The page title is the <h1>; drop a duplicate leading "# Title" heading from the markdown.
    const body = String(page.body_md).replace(/^((?:\s*>[^\n]*\n)*)\s*#\s+[^\n]*\n/, '$1');
    const r = md.render(body);
    html(res, T('layout').page(ctx, {
      title: page.title + ' | ' + ctx.s.company.product, description: page.description || page.title, path: '/legal/' + page.slug,
      jsonld: [crumbLd(ctx, [['Home', '/'], ['Legal', '/legal'], [page.title, '/legal/' + page.slug]])], header: { solid: true }, data: { page: 'legal' }
    }, T('misc').legalPage(ctx, { page, html: r.html, toc: r.toc, others: legalPages().filter(p => p.slug !== page.slug) })));
  });

  // ---------- Channel landing pages + hub ----------
  // Status always comes from flags.channels (admin → Channels & features). 'off' → 404 and hidden everywhere.
  const servicePrice = ctx => { const free = ctx.plans.find(p => p.price_month <= 0); return free ? { '@type': 'Offer', price: 0, priceCurrency: 'USD', url: ctx.appUrl + '/pricing', description: free.name + ' plan' } : undefined; };
  app.get('/channels', (req, res) => {
    const ctx = ctxFor(req);
    const list = channelPages().filter(c => c.status !== 'off');
    const d = { list, liveNames: list.filter(c => c.status === 'live').map(c => c.name), soonNames: list.filter(c => c.status === 'soon').map(c => c.name) };
    const names = list.filter(c => c.id !== 'website').map(c => c.name).filter(n => n !== 'Messenger');
    html(res, T('layout').page(ctx, {
      title: 'AI Chatbot for ' + (names.length > 1 ? names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1] : names[0] || 'chat apps') + ' | ' + ctx.s.company.product,
      description: 'One AI sales and support agent for every chat app. ' + (d.liveNames.length ? andList(d.liveNames) + ' live today' : 'Channels on the way') + (d.soonNames.length ? '; ' + andList(d.soonNames) + ' coming soon via official APIs.' : '.'),
      keywords: 'ai chatbot for telegram, whatsapp ai chatbot, instagram dm automation, tiktok dm automation, messenger ai chatbot, omnichannel ai sales agent, ai customer support agent',
      path: '/channels',
      jsonld: [orgLd(ctx), crumbLd(ctx, [['Home', '/'], ['Channels', '/channels']]),
        { '@context': 'https://schema.org', '@type': 'ItemList', name: ctx.s.company.product + ' channels', itemListElement: list.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.keyword, url: ctx.appUrl + '/' + c.slug })) }],
      header: { current: '/channels' }, mobileBar: true, data: { page: 'channels' }
    }, T('channels').hub(ctx, d)));
  });
  for (const slug of T('channel-content').PAGES.map(p => p.slug)) {
    app.get('/' + slug, (req, res) => {
      const all = channelPages();
      const c = all.find(p => p.slug === slug);
      if (!c || c.status === 'off') return errorView(req, res, 404);
      const ctx = ctxFor(req);
      const telegramLive = (all.find(p => p.id === 'telegram') || {}).status === 'live';
      const web = c.id === 'website' ? websitePricing(ctx) : null;
      const faq = T('channels').faqFor(c, c.status, telegramLive).map(f => [f[0], web ? f[1].replace('{price}', web.price) : f[1]]);
      const blog = settings.feature('blog');
      const posts = blog && c.posts.length ? db.all('SELECT slug, title, description, category, cover, read_time, published_at FROM posts WHERE status = \'published\' AND published_at <= ? AND slug IN (' + c.posts.map(() => '?').join(',') + ')', db.now(), ...c.posts)
        .sort((a, b) => c.posts.indexOf(a.slug) - c.posts.indexOf(b.slug)) : [];
      const url = ctx.appUrl + '/' + c.slug;
      const live = c.status === 'live';
      const service = { '@context': 'https://schema.org', '@type': 'Service', name: ctx.s.company.product + ' ' + c.keyword, serviceType: c.keyword, url,
        description: live ? c.leadLive : c.leadSoon, provider: { '@id': ctx.appUrl + '/#organization' }, areaServed: 'Worldwide', audience: { '@type': 'BusinessAudience', audienceType: 'Small and medium businesses' },
        isRelatedTo: { '@type': 'SoftwareApplication', name: ctx.s.company.product, applicationCategory: 'BusinessApplication', operatingSystem: 'Web', url: ctx.appUrl },
        offers: live ? servicePrice(ctx) : undefined,
        termsOfService: ctx.appUrl + '/legal/terms', availableChannel: { '@type': 'ServiceChannel', name: c.name, serviceUrl: url } };
      html(res, T('layout').page(ctx, {
        title: c.title, description: c.description, keywords: c.keywords, path: '/' + c.slug,
        jsonld: [orgLd(ctx), service, crumbLd(ctx, [['Home', '/'], ['Channels', '/channels'], [c.keyword, '/' + c.slug]]), faqLd(faq)],
        header: { current: '/channels' }, mobileBar: live, scene: c.id === 'website', data: { page: 'channel', channel: c.id, status: c.status }
      }, T('channels').landing(ctx, c, { status: c.status, faq, posts, telegramLive, web, others: all.filter(o => o.id !== c.id && o.status !== 'off') })));
    });
  }

  // ---------- Contact ----------
  app.get('/contact', (req, res) => {
    const ctx = ctxFor(req);
    const plan = String(req.query.plan || '').slice(0, 40);
    const topic = req.query.topic === 'sales' || (plan && ctx.plans.some(p => p.id === plan && (p.contact_sales || p.elite))) ? 'sales' : 'contact';
    html(res, T('layout').page(ctx, {
      title: (topic === 'sales' ? 'Talk to sales' : 'Contact us') + ' | ' + ctx.s.company.product, description: 'Get in touch with the ' + ctx.s.company.product + ' team for sales, partnerships or support.', path: '/contact',
      jsonld: [crumbLd(ctx, [['Home', '/'], ['Contact', '/contact']])], header: { solid: true }, data: { page: 'contact' }
    }, T('misc').contact(ctx, { plan, topic, planOptions: ctx.plans.filter(p => p.price_month > 0) })));
  });

  // ---------- Sitemap / robots ----------
  app.get('/sitemap.xml', (req, res) => {
    const base = config.appUrl;
    const blog = settings.feature('blog');
    const posts = blog ? publishedPosts() : [];
    const pages = db.all('SELECT slug, updated_at FROM pages');
    const latest = posts[0] ? posts[0].updated_at || posts[0].published_at : null;
    const chUpdated = T('channel-content').UPDATED;
    const chans = channelPages().filter(c => c.status !== 'off');
    const u = (loc, lastmod, freq, pri) => '<url><loc>' + md.esc(base + loc) + '</loc>' + (lastmod ? '<lastmod>' + String(lastmod).slice(0, 10) + '</lastmod>' : '') + '<changefreq>' + freq + '</changefreq><priority>' + pri + '</priority></url>';
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      u('/', latest, 'weekly', '1.0') + u('/pricing', null, 'weekly', '0.9') +
      u('/channels', chUpdated, 'weekly', '0.9') + chans.map(c => u('/' + c.slug, chUpdated, 'weekly', c.status === 'live' ? '0.9' : '0.8')).join('') +
      (blog ? u('/blog', latest, 'weekly', '0.8') + posts.map(p => u('/blog/' + p.slug, p.updated_at || p.published_at, 'monthly', '0.7')).join('') : '') +
      u('/contact', null, 'yearly', '0.4') + u('/legal', null, 'yearly', '0.3') +
      pages.map(p => u('/legal/' + p.slug, p.updated_at, 'yearly', '0.3')).join('') + '</urlset>';
    res.send(xml, 200, 'application/xml; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
  });
  app.get('/robots.txt', (req, res) => {
    res.send('User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /admin\nDisallow: /api\nDisallow: /pay\n\nSitemap: ' + config.appUrl + '/sitemap.xml\n', 200, 'text/plain; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
  });

  // ---------- 404 / error pages ----------
  app.notFound = (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/') || req.path.startsWith('/w/')) return res.json({ error: 'Not found' }, 404);
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.send('Not found', 404, 'text/plain; charset=utf-8');
    errorView(req, res, 404);
  };
  app.errorPage = (req, res, status) => {
    try { errorView(req, res, status === 404 ? 404 : status >= 500 ? 500 : status); } catch (e) { console.error('[errorPage]', e); res.send(String(status), status, 'text/plain; charset=utf-8'); }
  };
};

module.exports.addonsFor = addonsFor;
