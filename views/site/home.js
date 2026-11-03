'use strict';
// Homepage. Every section reads live settings / DB data passed in `d`.
// Motion lives in /js/home.js (hero phone, product tour, voice demo); /js/site.js handles the shared bits.
// Section keys (leak, compare, calc, how, ...) match the admin's on/off toggles in Admin → Site.
const A = require('./art');
const P = require('./parts');
const { esc } = A;

const andList = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : l.join('');
const IMG = '/img/home/';
const ARROW_INK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const PLAY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>';
const TICK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

// Small line above the headline: what Replyvoo does (no numbers, nothing made up).
const HERO_TAG = {"en": "AI Closers that reply in seconds, 24/7", "fr": "Des Closers IA qui répondent en quelques secondes, jour et nuit", "pt": "Closers de IA que respondem em segundos, dia e noite", "es": "Closers con IA que responden en segundos, de día y de noche", "sw": "Closers wa AI wanaojibu kwa sekunde, mchana na usiku", "ar": "Closers بالذكاء الاصطناعي يردّون خلال ثوانٍ، ليلاً ونهاراً"};

// Example shops the hero phone cycles through. Product demos, clearly sample data.
const SHOPS = [
  { id: 'fashion', label: 'Fashion', name: 'Linen & Co', mono: 'L', tone: '#E9E3D8',
    ask: 'Hi! How much is the linen shirt?', photo: IMG + 'product-shirt.webp', item: 'Linen shirt · Oat', price: '$48',
    reply: 'It’s $48 and in stock from S to XL. Free delivery this week. Which size?', ans: 'M please',
    pay: 'Done. Here’s your secure checkout for the shirt in M.', owner: IMG + 'owner-boutique.webp', order: 'Linen shirt, size M' },
  { id: 'gadgets', label: 'Gadgets', name: 'Volt Corner', mono: 'V', tone: '#DCE6F2',
    ask: 'How much are the wireless earbuds?', photo: IMG + 'product-buds.webp', item: 'Volt Buds · White', price: '$59',
    reply: 'They’re $59 with a one-year warranty, in stock in white. Want them delivered today?', ans: 'Yes, today',
    pay: 'Great. Pay here and they leave the shop within the hour.', owner: IMG + 'owner-gadgets.webp', order: 'Volt Buds, same-day delivery' },
  { id: 'food', label: 'Food', name: 'Crumb Bakery', mono: 'C', tone: '#F3E4CF',
    ask: 'How much for a box of pastries?', photo: IMG + 'product-pastry.webp', item: 'Morning box · 6 pastries', price: '$18',
    reply: 'A box of six is $18, baked this morning. Pickup or delivery?', ans: 'Delivery at 10am',
    pay: 'Perfect, 10am it is. Tap to pay and you’re all set.', owner: IMG + 'owner-bakery.webp', order: 'Morning box, delivery 10:00' }
];

// The shop's own welcome line opens every chat, so the phone never starts empty.
const greet = s => 'Welcome to ' + s.name + '! Ask me about prices, sizes or delivery.';
// Static, complete first conversation: what no-JS and reduced-motion visitors see. /js/home.js replays it.
function phoneChat(s) {
  return '<div class="pm-day">Today</div><div class="pm pm-out pm-greet">' + esc(greet(s)) + '</div>' +
    '<div class="pm pm-in">' + esc(s.ask) + '</div>' +
    '<div class="pm pm-out pm-card"><img src="' + s.photo + '" alt="" width="260" height="195" loading="eager" decoding="async"><span class="pm-card-t"><b>' + esc(s.item) + '</b><span>' + esc(s.price) + '</span></span></div>' +
    '<div class="pm pm-out">' + esc(s.reply) + '<small>Replied in 3s</small></div>' +
    '<div class="pm pm-in">' + esc(s.ans) + '</div>' +
    '<div class="pm pm-out">' + esc(s.pay) + '<span class="pm-pay paid">' + TICK + 'Paid ' + esc(s.price) + '</span></div>';
}

function heroPhone() {
  const s = SHOPS[0];
  const client = SHOPS.map(x => ({ label: x.label, name: x.name, mono: x.mono, tone: x.tone, greet: greet(x), ask: x.ask, photo: x.photo, item: x.item, price: x.price, reply: x.reply, ans: x.ans, pay: x.pay, owner: x.owner, order: x.order }));
  return '<div class="hp-stage" id="hpStage" dir="ltr" data-shops="' + esc(JSON.stringify(client)) + '">' +
    '<div class="hp-stage-bg" aria-hidden="true"><svg class="hp-stage-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.2-4.2A7.5 7.5 0 1 1 20 11.5z"/><path d="M9 11.5l2 2 4-4"/></svg></div>' +
    '<div class="hp-dev"><div class="hp-phone" role="img" aria-label="Product demo: a customer asks how much, the Closer replies in seconds with the price and a photo, the customer pays and a new order arrives.">' +
    '<div class="hp-screen" aria-hidden="true">' +
    '<div class="hp-status"><span class="tnum">9:41</span><span class="hp-island"></span><span class="hp-sig"><i></i><i></i><i></i><b></b></span></div>' +
    '<div class="hp-chat-head"><span class="hp-av" data-av style="background:' + s.tone + '">' + esc(s.mono) + '</span><span class="hp-who"><b data-name>' + esc(s.name) + '</b><small>AI Closer · replies in seconds</small></span></div>' +
    '<div class="hp-msgs" data-msgs>' + phoneChat(s) + '</div>' +
    '<div class="hp-input"><span>Message</span><i></i></div>' +
    '</div></div>' +
    '</div>' +
    '<div class="hp-shops" aria-hidden="true">' + SHOPS.map((x, i) => '<span data-shop="' + i + '"' + (i === 0 ? ' class="on"' : '') + '>' + esc(x.label) + '</span>').join('') + '</div>' +
    '<div class="hp-order show" data-order aria-hidden="true"><img src="' + s.owner + '" alt="" width="48" height="60" data-owner><span class="hp-order-t"><b>New order <span data-oprice>' + esc(s.price) + '</span></b><span data-oitem>' + esc(s.order) + '</span></span><span class="hp-order-ok">' + TICK + '</span></div>' +
    '</div>';
}

function heroSec(ctx, d) {
  const all = ctx.s.site.hero || {};
  const en = all.en || {};
  const h = Object.assign({}, en, all[ctx.lang] || {});
  const checks = [d.freeConv ? d.freeConv + ' free chats a month' : 'Start free', 'Live in 5 minutes', 'No code, no contracts'];
  return '<section class="hp-hero" id="top">' +
    '<div class="wrap hp-hero-in" id="heroIn"' + (ctx.lang === 'ar' ? ' dir="rtl"' : '') + '>' +
    '<div class="hp-copy">' +
    (ctx.ref ? '<a class="hp-ref" href="' + ctx.signupUrl + '">' + A.ic('star', 'currentColor', 15) + '<span>You were invited. Get ' + (d.bonus ? P.fmt(d.bonus) + ' ' : '') + 'bonus credits</span></a>' : '') +
    '<p class="hp-tag">' + A.ic('bolt', 'currentColor', 15) + '<span>' + esc(HERO_TAG[ctx.lang] || HERO_TAG.en) + '</span></p>' +
    '<h1 class="hp-h1"><span data-i="h1a">' + esc(h.h1a) + '</span> <span class="hp-h1b" data-i="h1b">' + esc(h.h1b) + '</span></h1>' +
    heroFlow(ctx) +
    '<div class="hp-ctas"><a class="hp-btn hp-btn-y" href="' + ctx.signupUrl + '"><span data-i="cta">' + esc(h.cta) + '</span>' + ARROW_INK + '</a>' +
    '<a class="hp-btn hp-btn-line" href="#studio" data-demo-play><span class="hp-play">' + PLAY + '</span><span data-i="cta2">' + esc(h.cta2) + '</span></a></div>' +
    '<p class="hp-sub" data-i="sub">' + esc(h.sub) + '</p>' +
    '<ul class="hp-checks">' + checks.map(t => '<li>' + TICK + esc(t) + '</li>').join('') + '</ul>' + heroChannels(d) + '</div>' +
    heroPhone() +
    '</div></section>';
}

// "Customers in, AI replies out": small faces drift in with a question, it glides into the Replyvoo mark,
// a yellow answer flies back and the face gets a Paid / Booked tick. Animated by /js/home.js; this markup is the
// still frame that no-JS and reduced-motion visitors see. Texts per language, so the switcher can swap them.
const FLOW = {
  en: { q: ['How much?', 'Do you deliver?', 'Is it in stock?', 'Can I pay now?'], a: ['$48, in stock. Want it?', 'Yes, today 🚚', 'Yes, size M left', 'Here’s your link'], t: ['Paid', 'Booked', 'Paid', 'Paid'] },
  fr: { q: ['C’est combien ?', 'Vous livrez ?', 'Il est en stock ?', 'Je peux payer ?'], a: ['48 $, en stock. On le prend ?', 'Oui, aujourd’hui 🚚', 'Oui, il reste du M', 'Voici votre lien'], t: ['Payé', 'Réservé', 'Payé', 'Payé'] },
  pt: { q: ['Quanto custa?', 'Vocês entregam?', 'Tem em estoque?', 'Posso pagar agora?'], a: ['$48, em estoque. Quer?', 'Sim, hoje 🚚', 'Sim, resta o M', 'Aqui está o link'], t: ['Pago', 'Reservado', 'Pago', 'Pago'] },
  es: { q: ['¿Cuánto cuesta?', '¿Hacen envíos?', '¿Hay en stock?', '¿Puedo pagar ya?'], a: ['$48, en stock. ¿Lo quieres?', 'Sí, hoy mismo 🚚', 'Sí, queda talla M', 'Aquí tienes el enlace'], t: ['Pagado', 'Reservado', 'Pagado', 'Pagado'] },
  sw: { q: ['Bei gani?', 'Mnaleta?', 'Kipo stoo?', 'Nilipe sasa?'], a: ['$48, kipo. Unakitaka?', 'Ndiyo, leo 🚚', 'Ndiyo, saizi M ipo', 'Hiki hapa kiungo'], t: ['Imelipwa', 'Imehifadhiwa', 'Imelipwa', 'Imelipwa'] },
  ar: { q: ['بكم؟', 'هل يوجد توصيل؟', 'هل هو متوفر؟', 'هل أدفع الآن؟'], a: ['48$، متوفر. تريده؟', 'نعم، اليوم 🚚', 'نعم، بقي مقاس M', 'هذا رابط الدفع'], t: ['تم الدفع', 'تم الحجز', 'تم الدفع', 'تم الدفع'] }
};
const FLOW_FACES = ['owner-cafe', 'owner-gadgets', 'owner-boutique', 'owner-skincare', 'owner-bakery'];
function heroFlow(ctx) {
  const L = FLOW[ctx.lang] || FLOW.en;
  const face = (img, cls, inner) => '<span class="fl-who ' + cls + '"><span class="fl-face"><img src="' + IMG + img + '.webp" alt="" width="40" height="40" decoding="async"></span>' + inner + '</span>';
  return '<div class="hp-flow" data-flow dir="ltr" aria-hidden="true" data-faces="' + esc(JSON.stringify(FLOW_FACES.map(f => IMG + f + '.webp'))) + '" data-texts="' + esc(JSON.stringify(FLOW)) + '">' +
    '<span class="fl-track"></span>' +
    '<span class="fl-core">' + A.LOGO_MARK('#FFC21A', 26) + '</span>' +
    '<span class="fl-static">' +
    face(FLOW_FACES[0], 'fl-l fl-top', '<span class="fl-b fl-q" dir="auto">' + esc(L.q[0]) + '</span>') +
    face(FLOW_FACES[1], 'fl-r fl-bot', '<span class="fl-b fl-a" dir="auto">' + esc(L.a[1]) + '</span><span class="fl-tick">' + TICK + '<span dir="auto">' + esc(L.t[1]) + '</span></span>') +
    '</span></div>';
}

// Which chat apps are live / coming, straight from the flags. Real brand marks, honest "coming soon".
function heroChannels(d) {
  const ch = (d.channels || []).filter(c => c.id !== 'messenger');
  if (!ch.length) return '';
  const live = ch.filter(c => c.status === 'live'), soon = ch.filter(c => c.status === 'soon');
  return '<div class="hp-ch">' +
    (live.length ? '<span class="hp-ch-g"><span class="hp-ch-l">Live on</span>' + live.map(c => '<a href="/' + esc(c.slug) + '" class="hp-ch-i" title="' + esc(c.name) + '">' + A.brandIcon(c.id, 26) + '<span>' + esc(c.name) + '</span></a>').join('') + '</span>' : '') +
    (soon.length ? '<span class="hp-ch-g hp-ch-soon"><span class="hp-ch-l">Coming soon</span>' + soon.map(c => '<a href="/' + esc(c.slug) + '" class="hp-ch-i" title="' + esc(c.name) + ' (coming soon)">' + A.brandIcon(c.id, 26) + '<span class="sr">' + esc(c.name) + '</span></a>').join('') + '</span>' : '') +
    '</div>';
}

// Small, real-looking photos of the kind of people Replyvoo is for. Shop types only: no quotes, no names, no claims.
const PEOPLE = [['owner-boutique', 'Boutique'], ['owner-bakery', 'Home bakery'], ['owner-gadgets', 'Gadget shop'], ['owner-skincare', 'Skincare maker'], ['owner-cafe', 'Café']];
// Orbit geometry, shared with /js/home.js (data-orbit-* attributes): a ring seen at a tilt, so it reads as an ellipse.
// Satellites are placed in % of the orbit box; y grows towards the viewer, which is where they are largest.
const ORBIT = { tilt: 0.46, aspect: 0.74, outer: 0.385, inner: 0.22 };
function orbitPos(angle, r) {
  const a = angle * Math.PI / 180, depth = Math.sin(a);
  return { x: 50 + r * 100 * Math.cos(a), y: 50 + r * 100 * ORBIT.tilt * depth / ORBIT.aspect, s: 0.74 + 0.26 * (depth + 1) / 2, z: Math.round(100 + depth * 50) };
}
const satStyle = p => '--x:' + p.x.toFixed(2) + '%;--y:' + p.y.toFixed(2) + '%;--s:' + p.s.toFixed(3) + ';z-index:' + p.z;
// Small things a Closer does all day, riding the inner ring. Words only, no numbers.
const ORBIT_CHIPS = [['tag', 'Price sent'], ['check', 'Paid'], ['clock', 'Booked'], ['bolt', 'Replied']];
const CHIP_IC = {
  tag: '<path d="M3 12V4h8l9 9-8 8-9-9z"/><circle cx="7.5" cy="8" r="1.4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  bolt: '<path d="M13 3 4 14h7l-1 7 9-11h-7l1-7z"/>'
};
function people() {
  const step = 360 / PEOPLE.length, step2 = 360 / ORBIT_CHIPS.length;
  return '<section class="hp-people" aria-labelledby="peopleH"><div class="wrap hp-people-in">' +
    '<div class="hp-people-copy"><h2 class="hp-h2" id="peopleH">Made for people who sell in chat.</h2>' +
    '<p class="hp-lead">Clothing shops, home kitchens, gadget stores and solo sellers who can’t answer every message themselves. Your Closer takes the questions, you keep the customers.</p></div>' +
    '<div class="hp-orbit" data-orbit data-tilt="' + ORBIT.tilt + '" data-aspect="' + ORBIT.aspect + '" style="aspect-ratio:100/' + Math.round(ORBIT.aspect * 100) + '">' +
    '<svg class="hp-orbit-rings" viewBox="0 0 100 ' + Math.round(ORBIT.aspect * 100) + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<ellipse cx="50" cy="' + Math.round(ORBIT.aspect * 50) + '" rx="' + (ORBIT.outer * 100).toFixed(1) + '" ry="' + (ORBIT.outer * 100 * ORBIT.tilt).toFixed(2) + '" class="r1"/>' +
    '<ellipse cx="50" cy="' + Math.round(ORBIT.aspect * 50) + '" rx="' + (ORBIT.inner * 100).toFixed(1) + '" ry="' + (ORBIT.inner * 100 * ORBIT.tilt).toFixed(2) + '" class="r2"/></svg>' +
    '<div class="hp-orbit-core" aria-hidden="true"><span class="hp-orbit-mark">' + A.LOGO_MARK('#FFC21A', 40) + '</span></div>' +
    '<ul class="hp-orbit-ring" data-ring="' + ORBIT.outer + '" data-speed="-1" aria-label="Who Replyvoo is for">' + PEOPLE.map((p, i) => {
      const ang = 90 + i * step;
      return '<li class="hp-sat" data-a="' + ang + '" style="' + satStyle(orbitPos(ang, ORBIT.outer)) + '"><span class="hp-sat-in"><span class="hp-sat-face"><img src="' + IMG + p[0] + '.webp" alt="" width="96" height="120" loading="lazy" decoding="async"></span><span class="hp-sat-tag">' + esc(p[1]) + '</span></span></li>';
    }).join('') + '</ul>' +
    '<ul class="hp-orbit-ring hp-orbit-chips" data-ring="' + ORBIT.inner + '" data-speed="1.35" aria-hidden="true">' + ORBIT_CHIPS.map((c, i) => {
      const ang = 45 + i * step2;
      return '<li class="hp-sat" data-a="' + ang + '" style="' + satStyle(orbitPos(ang, ORBIT.inner)) + '"><span class="hp-sat-in hp-chipx"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + CHIP_IC[c[0]] + '</svg>' + esc(c[1]) + '</span></li>';
    }).join('') + '</ul>' +
    '</div></div></section>';
}

function leak() {
  const rows = [['3 hours', 'They already bought from someone who answered first.', ''], ['30 minutes', 'They’re comparing you with three other shops.', ''], ['Seconds', 'Your Closer answers, sends the price and the payment link. Even at 3am.', 'on']];
  // Ink brand band: a reply-time track that runs from "hours" (lost) to "seconds" (sold).
  return '<section class="hp-band" id="leak"><div class="wrap">' +
    '<div class="hp-band-head"><h2 class="hp-h2">Slow replies lose the sale.</h2><p class="hp-lead">Every lead you pay for has a short attention span. Answer in hours and they’re gone. Answer in seconds and they buy.</p></div>' +
    '<ol class="hp-leak">' + rows.map(r => '<li class="' + r[2] + '"><span class="hp-leak-dot" aria-hidden="true">' + (r[2] ? A.LOGO_MARK('#121110', 18) : '') + '</span><b>' + esc(r[0]) + '</b><span>' + esc(r[1]) + '</span></li>').join('') + '</ol>' +
    '</div></section>';
}

function compare(ctx, d) {
  return '<section class="hp-sec" id="compare"><div class="wrap hp-split">' +
    '<div class="hp-head hp-head-side"><h2 class="hp-h2">Your team types the same replies all day. A Closer never gets tired.</h2>' +
    '<p class="hp-lead">Keep your people for the chats that need a human. Let Closers answer the rest instantly, in your customer’s language.</p>' +
    '<a class="hp-btn hp-btn-ink" href="' + ctx.signupUrl + '">Hire your first Closer' + ARROW_INK + '</a></div>' +
    '<div class="hp-table" role="table" aria-label="Manual team vs Replyvoo Closers"><div class="hp-tr hp-th" role="row"><span role="columnheader"><span class="sr">What you get</span></span><span role="columnheader">Manual team</span><span role="columnheader">Replyvoo</span></div>' +
    d.vsRows.map(r => '<div class="hp-tr" role="row"><span role="rowheader">' + esc(r[0]) + '</span><span role="cell" class="bad">' + esc(r[1]) + '</span><span role="cell" class="good">' + esc(r[0] === 'Monthly cost' ? 'From ' + (d.minPrice > 0 ? P.money(d.minPrice) : '$0') : r[2]) + '</span></div>').join('') +
    '</div></div></section>';
}

function calc(ctx) {
  const slider = (id, label, min, max, step, val, shown) => '<div class="range-row"><div class="top"><label for="' + id + '">' + label + '</label><span class="tnum" id="' + id + 'V">' + shown + '</span></div><input class="slider" id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></div>';
  return '<section class="hp-sec" id="calc"><div class="wrap hp-calc">' +
    '<div class="hp-calc-l"><h2 class="hp-h2">What would you save?</h2>' +
    '<p class="hp-lead">Move the sliders. We keep one person on your team for the chats that need a human and let Closers handle the rest.</p>' +
    '<div class="hp-calc-card">' + slider('cStaff', 'Support staff', 1, 20, 1, 4, '4') + slider('cSal', 'Monthly pay per person (USD)', 100, 2500, 50, 450, '$450') + slider('cChats', 'New chats per day', 20, 3000, 10, 150, '150') + '</div></div>' +
    '<div class="hp-calc-r" aria-live="polite"><span class="hp-calc-k">You could save every month</span><b class="tnum hp-calc-big" id="cSave">$0</b>' +
    '<dl class="hp-calc-dl"><div><dt>Today you spend</dt><dd class="tnum" id="cNow">$1,800</dd></div><div><dt>With Replyvoo</dt><dd class="tnum" id="cNew">–</dd></div><div><dt>Recommended plan</dt><dd id="cPlan">–</dd></div></dl>' +
    '<p class="hp-calc-note">An estimate. It counts one conversation per new chat and keeps one team member for handoffs.</p>' +
    '<a class="hp-btn hp-btn-y" href="' + ctx.signupUrl + '">Start free' + ARROW_INK + '</a></div></div></section>';
}

// Product tour: real screenshots of the Replyvoo dashboard (sample shop "Glow Labs"), auto-advancing like a product tour.
const TOUR = [
  ['studio', 'Agent Studio', 'Pick a role, name your Closer, set its tone and see a sample reply change as you go.', 'screen-studio', 1600, 1100, 'app.replyvoo.com/studio'],
  ['score', 'Training score', 'A checklist scores how well your Closer knows your business, so you know exactly what to teach next.', 'screen-score', 1600, 1100, 'app.replyvoo.com/studio/test-lab'],
  ['inbox', 'Every chat, one inbox', 'See who is waiting, who is hot and which Closer is replying, across every channel.', 'screen-inbox', 1600, 1100, 'app.replyvoo.com/inbox'],
  ['takeover', 'Take over any chat', 'One tap and you’re in. The Closer pauses, your reply goes out, and you hand it back when you’re done.', 'screen-takeover', 1600, 1100, 'app.replyvoo.com/inbox']
];
function how() {
  return '<section class="hp-sec hp-tour-sec" id="product"><div class="wrap">' +
    '<div class="hp-head"><h2 class="hp-h2">The dashboard you’ll actually use.</h2><p class="hp-lead">Real screens from Replyvoo, shown with a sample skincare shop. Nothing mocked up.</p></div>' +
    '<div class="hp-tour" data-tour>' +
    '<div class="hp-tabs" role="tablist" aria-label="Product tour">' + TOUR.map((t, i) => '<button type="button" role="tab" id="tt-' + t[0] + '" aria-controls="tp-' + t[0] + '" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '" class="hp-tab' + (i === 0 ? ' on' : '') + '"><b>' + esc(t[1]) + '</b><span>' + esc(t[2]) + '</span><i aria-hidden="true"></i></button>').join('') + '</div>' +
    '<div class="hp-view"><div class="hp-frame" data-tilt-frame><div class="hp-frame-bar" aria-hidden="true"><i></i><i></i><i></i><span data-url>' + esc(TOUR[0][6]) + '</span></div><div class="hp-shots">' +
    TOUR.map((t, i) => '<figure role="tabpanel" id="tp-' + t[0] + '" aria-labelledby="tt-' + t[0] + '" class="hp-shot' + (i === 0 ? ' on' : '') + '" data-url="' + esc(t[6]) + '"' + (i === 0 ? '' : ' aria-hidden="true"') + '><img src="' + IMG + t[3] + '.webp" alt="Replyvoo ' + esc(t[1]) + ' screen" width="' + t[4] + '" height="' + t[5] + '" loading="' + (i === 0 ? 'eager' : 'lazy') + '" decoding="async"></figure>').join('') +
    '</div></div></div><p class="hp-tour-cap" data-cap>' + esc(TOUR[0][2]) + '</p></div></div></section>';
}

// Agent Studio: the 30-second training demo (/js/train-scene.js). Loops silently; "Play with voice" replays it with the recorded narration.
function studioSec(ctx) {
  const steps = [['Pick a role', 'Sales, support, bookings, VIP or win-backs.'], ['Give it a personality', 'Name, look and tone, with a live sample reply.'], ['Teach it', 'Q&As, products with exact prices, policies, or import your FAQ page.'], ['Set the rules', 'Never promise dates, cap discounts, hand angry chats to you.'], ['Test and go live', 'One-tap tests, a training score, then flip it live.']];
  return '<section class="hp-sec" id="studio"><div class="wrap hp-studio">' +
    '<div class="hp-studio-copy"><h2 class="hp-h2">Train your Closer like a new hire. In ten minutes.</h2>' +
    '<p class="hp-lead">A step-by-step coach shows you what to do and why. Teach it your answers once. If a reply is ever off, tap “Fix this answer” and it’s right from then on.</p>' +
    '<ol class="hp-steps">' + steps.map(x => '<li><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></li>').join('') + '</ol>' +
    '<div class="hp-ctas"><a class="hp-btn hp-btn-ink" href="' + ctx.signupUrl + '">Build your Closer free' + ARROW_INK + '</a><button type="button" class="hp-btn hp-btn-line" data-video="/video/replyvoo-studio-demo.mp4" data-poster="/video/replyvoo-studio-demo.jpg"><span class="hp-play">' + PLAY + '</span>Watch the video</button></div></div>' +
    '<div class="hp-studio-demo"><div class="hp-demo" data-hp-train><p class="hp-demo-alt">A shop owner names their Closer, teaches it “Do you deliver on Sundays?”, the Closer answers a customer with exactly that line, a wrong answer gets fixed in one tap, and it goes live with a training score of 92.</p></div>' +
    '<button type="button" class="hp-voice" data-demo-play><span class="hp-play">' + PLAY + '</span>Play with voice</button></div>' +
    '</div></section>';
}

// Website chat: the animated widget demo (/js/scene.js).
function website(ctx, d) {
  const pts = [['Your colours and logo', 'Six looks or your own brand. It feels like part of your site.'], ['Human-like timing', 'A natural pause and typing dots, never a wall of text.'], ['Lead capture built in', 'Name, email or phone, saved with a HeatScore.'], ['One line of code', 'WordPress, Shopify, Wix, Webflow or plain HTML.']];
  return '<section class="hp-sec" id="website"><div class="wrap hp-web">' +
    '<div class="hp-web-copy"><h2 class="hp-h2">Your website, answering like your best salesperson.</h2>' +
    '<p class="hp-lead">The same Closer that sells on Telegram sits on your website. It greets visitors, answers in seconds at a human pace, captures the lead and lets your team jump in from Pulse Inbox.</p>' +
    '<ul class="hp-list">' + pts.map(p => '<li><b>' + esc(p[0]) + '</b><span>' + esc(p[1]) + '</span></li>').join('') + '</ul>' +
    '<div class="hp-ctas"><a class="hp-btn hp-btn-ink" href="' + ctx.signupUrl + '">Start free' + ARROW_INK + '</a><a class="hp-btn hp-btn-line" href="/website-ai-chatbot">How website chat works</a></div>' +
    (d.webPrice ? '<p class="hp-fine">' + esc(d.webPrice) + '</p>' : '') + '</div>' +
    '<div class="hp-web-art"><div class="chp-scene" data-scene data-photo="' + IMG + 'product-serum.webp"><p class="muted">A visitor asks “Do you ship to Spain?” and the AI answers in seconds, then captures their email.</p></div></div></div></section>';
}

const MORE = { website: 'AI chatbot for website', whatsapp: 'WhatsApp AI chatbot', instagram: 'Instagram DM automation', tiktok: 'TikTok DM automation', messenger: 'Messenger AI chatbot' };
function channels(ctx, d) {
  if (!d.channels.length) return '';
  const fl = ctx.s.flags.channels;
  const tgModes = [['telegram_bot', 'Bots'], ['telegram_group', 'Groups'], ['telegram_business', 'Personal account']].filter(m => fl[m[0]] === 'live');
  const liveN = d.channels.filter(c => c.status === 'live').map(c => c.name);
  const soonN = d.channels.filter(c => c.status === 'soon').map(c => c.name);
  const row = c => {
    const soon = c.status === 'soon';
    const modes = c.id === 'telegram' && tgModes.length ? '<span class="hp-chr-modes">' + tgModes.map(m => esc(m[1])).join(', ') + '</span>' : '';
    return '<li class="hp-chr' + (soon ? ' soon' : '') + '" data-ch="' + esc(c.id) + '">' + A.brandIcon(c.id, 44) +
      '<span class="hp-chr-t"><b>' + esc(c.name) + '<span class="hp-st' + (soon ? '' : ' live') + '">' + (soon ? 'Coming soon' : 'Live') + '</span></b><span>' + esc(c.desc) + '</span>' + modes + '</span>' +
      '<span class="hp-chr-a">' + (c.slug ? '<a class="hp-more" href="/' + esc(c.slug) + '">' + esc(c.id === 'telegram' ? 'Telegram AI chatbot' : (MORE[c.id] || c.name)) + '</a>' : '') +
      (soon ? '<button type="button" class="hp-btn hp-btn-line hp-btn-sm wl-btn" data-wl="' + esc(c.name) + '">Join the waitlist</button>' : '<a class="hp-btn hp-btn-ink hp-btn-sm" href="' + ctx.signupUrl + '">Connect ' + esc(c.name) + '</a>') + '</span></li>';
  };
  return '<section id="channels" class="hp-sec"><div class="wrap hp-split">' +
    '<div class="hp-head hp-head-side"><h2 class="hp-h2">One AI team for every inbox.</h2>' +
    '<p class="hp-lead">Your Closers live where your customers already chat.' + (liveN.length ? ' ' + esc(andList(liveN)) + (liveN.length > 1 ? ' are' : ' is') + ' live today.' : '') + (soonN.length ? ' ' + esc(andList(soonN)) + ' ' + (soonN.length > 1 ? 'are' : 'is') + ' coming through each platform’s official business tools.' : '') + '</p>' +
    '<a class="hp-more" href="/channels">Compare every channel</a></div>' +
    '<ul class="hp-chs">' + d.channels.map(row).join('') + '</ul></div>' +
    '<div class="wrap"><p class="hp-fine">Channel names are trademarks of their owners. <a href="/legal/disclaimer">Not affiliated or endorsed</a>.</p></div></section>';
}

function closers(ctx, d) {
  return '<section class="hp-sec" id="closers"><div class="wrap">' +
    '<div class="hp-head"><h2 class="hp-h2">Build a whole team of Closers.</h2><p class="hp-lead">One for sales, one for support, one guarding your group. Start from a template, give it a name and a personality, and launch it in minutes.</p></div>' +
    '<ul class="hp-roles">' + d.templates.map(t => '<li><span class="hp-role-m" style="background:' + esc(t.color) + '">' + esc(t.letter) + '</span><b>' + esc(t.name) + '</b><span class="hp-role-n">' + esc(t.role) + '</span><p>' + esc(t.desc) + '</p><span class="hp-role-s">' + t.skills.map(esc).join(' / ') + '</span></li>').join('') + '</ul>' +
    '<a class="hp-btn hp-btn-y" href="' + ctx.signupUrl + '">Build your first Closer' + ARROW_INK + '</a></div></section>';
}

function features(ctx, d) {
  const f = ctx.features;
  const j = ctx.s.joinvoo;
  const items = d.features.map(b => '<li><span class="hp-fi">' + A.ic(b[4], 'currentColor', 20, 1.8) + '</span><b>' + esc(b[1]) + '</b><span>' + esc(b[2]) + (b[3] ? ' ' + esc(b[3]) : '') + '</span></li>').join('');
  const jv = (j.enabled && f.joinvoo) ? '<div class="hp-jv"><div><b>Sister app: Joinvoo</b><h3>' + esc(j.headline) + '</h3><p>' + esc(j.pitch) + '</p></div><a class="hp-btn hp-btn-line" href="/go/joinvoo?from=site_features" rel="noopener">See Joinvoo</a></div>' : '';
  return '<section class="hp-sec" id="features"><div class="wrap">' +
    '<div class="hp-head"><h2 class="hp-h2">Everything included, with names your team will remember.</h2></div>' +
    '<ul class="hp-feats">' + items + '</ul>' + jv + '</div></section>';
}

// Juno answers here are examples of the kind of reply you get, without invented figures.
const JUNO_QA = [
  ['Who should I follow up first?', 'Three people asked for a payment link in the last hour and one already paid. Want me to nudge the other two?'],
  ['What did my Closers miss?', 'Several people asked about delivery times this week and your Closer had no answer. Add one line to your FAQ and I’ll cover it from now on.'],
  ['Write a Blast for no-buyers', '“Your cart is still waiting. Order today and delivery is on us.” Want me to send it to everyone who chatted but didn’t pay?'],
  ['How was today?', 'Here’s today in one line: chats handled, orders, sales and complaints, plus the two chats waiting for a human.']
];
function juno() {
  return '<section class="hp-sec" id="juno"><div class="wrap hp-juno">' +
    '<div class="hp-juno-l"><h2 class="hp-h2">Your Closers talk to customers. Juno talks to you.</h2>' +
    '<p class="hp-lead">Ask your business anything in plain words. Juno reads every chat, finds hot leads, spots what your Closers missed and writes your next Blast.</p></div>' +
    '<div class="hp-juno-r"><div class="juno-chips hp-chips" role="group" aria-label="Example questions for Juno">' + JUNO_QA.map((q, i) => '<button type="button" class="hp-chip' + (i === 0 ? ' on' : '') + '" aria-pressed="' + (i === 0) + '" data-juno="' + esc(q[1]) + '">' + esc(q[0]) + '</button>').join('') + '</div>' +
    '<div class="hp-juno-ans"><span class="hp-juno-av" aria-hidden="true">J</span><p id="junoAns" aria-live="polite">' + esc(JUNO_QA[0][1]) + '</p></div><p class="hp-fine">Example answers.</p></div>' +
    '</div></section>';
}

function wallet(ctx) {
  const b = ctx.s.billing;
  const rows = [
    ['1 extra conversation (up to ' + b.conversation_reply_limit + ' replies)', '1 credit'],
    ['Voice notes and screenshots', 'Included'],
    ['Pro Brain conversation', '+' + b.pro_brain_extra_credits + ' credit' + (b.pro_brain_extra_credits > 1 ? 's' : '')],
    ['Blast, per ' + b.blast_people_per_credit + ' people', '1 credit'],
    ['Extra Closer for a month', P.fmt(b.extra_closer_credits) + ' credits']
  ];
  return '<section class="hp-sec" id="credits"><div class="wrap hp-split">' +
    '<div class="hp-head hp-head-side"><h2 class="hp-h2">Pay for what you use with Voo Credits.</h2>' +
    '<p class="hp-lead">Your plan covers your monthly chats. Voo Credits buy extra chats and power-ups whenever you need them. Top up with card, Paystack or Flutterwave' + (b.crypto_enabled ? ' or USDT' : '') + ', or turn on Auto Top-up and never go quiet.</p></div>' +
    '<dl class="hp-costs">' + rows.map(r => '<div><dt>' + esc(r[0]) + '</dt><dd class="tnum">' + esc(r[1]) + '</dd></div>').join('') + '</dl>' +
    '</div></section>';
}

function pricing(ctx, d) {
  const b = ctx.s.billing;
  return '<section id="pricing" class="hp-sec hp-pricing"><div class="wrap">' +
    '<div class="hp-head hp-head-c"><h2 class="hp-h2">More Closers. More sales. Less payroll.</h2>' +
    '<p class="hp-lead">Pay per conversation, not per message. One conversation is a customer chat of up to ' + b.conversation_reply_limit + ' AI replies within ' + b.conversation_window_hours + ' hours, and most sales fit in one.</p>' + P.billingToggle(ctx) + '</div>' +
    '<div class="pricing" data-pricing>' + P.planGrids(ctx, d.plans) + '</div>' +
    '<div class="pp-extra"><div class="card box"><h3 class="box-h">Power-ups</h3><div class="addons">' + P.addonsList(d.addons) + '</div></div>' +
    '<div class="card box"><h3 class="box-h">Credit packs</h3><div class="packs">' + P.packsList(d.packs) + '</div></div></div>' +
    '<p class="hp-center"><a class="hp-more" href="/pricing">Compare every plan in detail</a></p></div></section>';
}

function squad(ctx) {
  const b = ctx.s.billing;
  const tiers = (b.referral_tiers || []).slice(0, 3);
  const names = ['Starter', 'Pro', 'Legend'];
  const base = tiers[0] ? Math.round(tiers[0].rate * 100) : 20;
  const top = tiers.length ? Math.round(tiers[tiers.length - 1].rate * 100) : base;
  return '<section class="hp-sec" id="squad"><div class="wrap"><div class="hp-squad">' +
    '<div class="hp-squad-l"><h2 class="hp-h2">Bring friends. Get paid every month.</h2>' +
    '<p>Earn ' + base + '% of every payment your referrals make, for as long as they stay. Paid in Voo Credits. ' + (top > base ? 'Climb tiers to unlock ' + top + '%. ' : '') + (b.referee_bonus_credits ? 'Your friends get ' + P.fmt(b.referee_bonus_credits) + ' bonus credits.' : '') + '</p>' +
    '<div class="hp-ctas"><a class="hp-btn hp-btn-y" href="' + ctx.signupUrl + '">Join the Squad' + ARROW_INK + '</a><a class="hp-btn hp-btn-dk" href="/legal/referral">Programme terms</a></div></div>' +
    (tiers.length ? '<ol class="hp-tiers">' + tiers.map((t, i) => '<li><b>' + esc(names[i] || 'Tier ' + (i + 1)) + '</b><span class="tnum">' + Math.round(t.rate * 100) + '%</span><small>' + (t.min ? 'after ' + t.min + ' referrals' : 'from your first referral') + '</small></li>').join('') + '</ol>' : '') +
    '</div></div></section>';
}

function blog(ctx, d) {
  if (!d.posts.length) return '';
  return '<section class="hp-sec" id="blog"><div class="wrap"><div class="hp-head hp-head-row"><h2 class="hp-h2">Playbooks for faster sales.</h2><a class="hp-more" href="/blog">Read the blog</a></div>' +
    '<div class="post-grid">' + d.posts.map(p => P.postCard(p, { uid: 'h' })).join('') + '</div></div></section>';
}

function faq(ctx) {
  const items = (ctx.s.site.faq || []).filter(f => Array.isArray(f) && f[0]);
  if (!items.length) return '';
  return '<section id="faq" class="hp-sec"><div class="wrap hp-faq"><div class="hp-head hp-head-side"><h2 class="hp-h2">Questions, answered.</h2>' +
    '<p class="hp-lead">Still curious? <a href="/contact">Send us a message</a>' + (ctx.features.chat_widget ? ' or <button type="button" class="linkish" data-open-chat>chat with Juno</button>' : '') + '.</p></div>' +
    '<div>' + P.faqList(items, 'hf') + '</div></div></section>';
}

function cta(ctx) {
  const c = ctx.s.site.final_cta || {};
  const all = ctx.s.site.hero || {};
  const h = Object.assign({}, all.en || {}, all[ctx.lang] || {});
  // The closing brand moment: a full yellow block, the headline set large, and one chat that ends in a sale.
  return '<section class="hp-final-sec"><div class="wrap"><div class="hp-final" data-final>' +
    '<svg class="hp-final-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=".7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.2-4.2A7.5 7.5 0 1 1 20 11.5z"/><path d="M9 11.5l2 2 4-4"/></svg>' +
    '<div class="hp-final-copy"><h2 class="hp-final-h">' + esc(c.a) + ' ' + esc(c.b) + '</h2>' +
    '<p>' + esc(c.sub) + '</p>' +
    '<div class="hp-final-ctas"><a class="hp-btn hp-btn-ink hp-btn-lg" href="' + ctx.signupUrl + '"><span data-i="cta">' + esc(h.cta) + '</span>' + ARROW_INK + '</a>' +
    '<a class="hp-final-link" href="/pricing">See pricing</a></div></div>' +
    '<div class="hp-final-chat" aria-hidden="true" dir="ltr">' +
    '<div class="fc fc-in"><img src="' + IMG + 'owner-cafe.webp" alt="" width="40" height="50" loading="lazy" decoding="async"><span>Hi! Is the oat linen shirt still available?</span></div>' +
    '<div class="fc fc-out"><span>Yes, in every size. It ships today. Shall I send your checkout link?</span></div>' +
    '<div class="fc fc-in fc-short"><span>Yes please</span></div>' +
    '<div class="fc fc-paid">' + TICK + '<span>Paid. New order for Linen &amp; Co</span></div>' +
    '</div></div></div></section>';
}

function render(ctx, d) {
  const S = Object.assign({}, ctx.s.site.sections || {});
  const f = ctx.features;
  const on = k => S[k] !== false;
  return heroSec(ctx, d) + people() +
    (on('how') ? how() : '') +
    (on('leak') ? leak() : '') +
    (on('studio') && f.studio !== false ? studioSec(ctx) : '') +
    (on('compare') ? compare(ctx, d) : '') +
    (on('calc') ? calc(ctx) : '') +
    (on('website') && ctx.s.flags.channels.website === 'live' ? website(ctx, d) : '') +
    (on('channels') ? channels(ctx, d) : '') +
    (on('closers') ? closers(ctx, d) : '') +
    (on('features') ? features(ctx, d) : '') +
    (on('juno') && f.juno ? juno() : '') +
    (on('wallet') && f.wallet ? wallet(ctx) : '') +
    (on('pricing') ? pricing(ctx, d) : '') +
    (on('squad') && f.squad ? squad(ctx) : '') +
    (on('blog') && f.blog ? blog(ctx, d) : '') +
    (on('faq') ? faq(ctx) : '') +
    (on('cta') ? cta(ctx) : '');
}

module.exports = { render, SHOPS };
