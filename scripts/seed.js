'use strict';
// Seeds plans, credit packs, power-ups, coupons, blog posts, legal pages and the admin account.
// Safe to run many times: existing rows are kept (use --force-content to overwrite posts and pages,
// --force-pricing to reset plans/packs/add-ons to these defaults, --demo for a demo workspace).
const fs = require('node:fs');
const path = require('node:path');
const config = require('../src/config');
const db = require('../src/db');

const PLANS = [
  { id: 'spark', name: 'Spark', description: 'Try it free, no card', price_month: 0, price_year: 0, closers: 1, conversations: 30, seats: 1, channels_text: '1 channel', extra_chat_price: 0, pro_brain_chats: 0, website_sites: 0, remove_branding: 0, custom_css: 0, cta: 'Start free', sort: 1,
    features: ['1 AI Closer', '30 conversations / month', '1 Telegram bot or account', 'Pulse Inbox + human takeover', 'Juno AI assistant'] },
  { id: 'starter', name: 'Starter', description: 'Solo sellers and creators', price_month: 29, price_year: 290, closers: 2, conversations: 500, seats: 2, channels_text: '2 channels', extra_chat_price: 0.04, pro_brain_chats: 0, website_sites: 0, remove_branding: 0, custom_css: 0, cta: 'Start Starter', sort: 2,
    features: ['2 AI Closers', '500 conversations / month', 'Bots, groups + personal account', 'Voice notes & screenshots', 'HeatScore + Nudge follow-ups', '2 team seats'] },
  { id: 'growth', name: 'Growth', description: 'Small teams selling daily', price_month: 79, price_year: 790, closers: 5, conversations: 1500, seats: 3, channels_text: '5 channels', extra_chat_price: 0.035, pro_brain_chats: 50, website_sites: 0, remove_branding: 0, custom_css: 0, cta: 'Start Growth', sort: 3,
    features: ['5 AI Closers', '1,500 conversations / month', 'Everything in Starter', 'Blast + PayLink', 'Pro Brain on 50 chats', '3 team seats'] },
  { id: 'pro', name: 'Pro', description: 'Teams that sell every day', price_month: 149, price_year: 1490, closers: 10, conversations: 3500, seats: 5, channels_text: '10 channels', extra_chat_price: 0.03, pro_brain_chats: 300, website_sites: 1, remove_branding: 0, custom_css: 0, cta: 'Start Pro', popular: 1, badge: 'MOST POPULAR', sort: 4,
    features: ['10 AI Closers', '3,500 conversations / month', 'Everything in Growth', 'Pro Brain on 300 chats', 'Night Shift Report', '5 team seats', 'Website AI chat (1 site)'] },
  { id: 'business', name: 'Business', description: 'Brands and agencies at volume', price_month: 299, price_year: 2990, closers: 25, conversations: 6000, seats: 12, channels_text: 'Unlimited channels', extra_chat_price: 0.025, pro_brain_chats: 1000, website_sites: 3, remove_branding: 1, custom_css: 1, cta: 'Start Business', elite: 1, badge: 'BEST VALUE', sort: 5,
    features: ['25 AI Closers', '6,000 conversations / month', 'Pro Brain on 1,000 chats', 'Done-for-you setup included', '12 team seats', 'Priority support', 'Website AI chat on 3 sites, your branding only'] },
  { id: 'titan', name: 'Titan', description: 'High-volume sales machines', price_month: 599, price_year: 5990, closers: 60, conversations: 14000, seats: 30, channels_text: 'Unlimited channels', extra_chat_price: 0.02, pro_brain_chats: 3000, website_sites: 10, remove_branding: 1, custom_css: 1, cta: 'Go Titan', elite: 1, badge: 'POWER', sort: 6,
    features: ['60 AI Closers', '14,000 conversations / month', 'Pro Brain on 3,000 chats', '30 team seats', 'Done-for-you setup included', 'Dedicated success manager', 'Website AI chat on 10 sites, your branding only'] },
  { id: 'black', name: 'Black', description: 'Enterprise. Built around you.', price_month: 1499, price_year: 14990, closers: 9999, conversations: 40000, seats: 999, channels_text: 'Every channel we support', extra_chat_price: 0.018, pro_brain_chats: 10000, website_sites: 999, remove_branding: 1, custom_css: 1, cta: 'Talk to sales', elite: 1, contact_sales: 1, badge: 'INVITE ONLY', sort: 7,
    features: ['Unlimited AI Closers', '40,000+ conversations / month', 'Pro Brain on 10,000 chats', 'Custom integrations built for you', 'Unlimited seats', '24/7 priority line with your own team', 'Website AI chat on every site, your branding only'] }
];
const PACKS = [
  { credits: 500, bonus: 0, price: 20, label: 'Starter', sort: 1 },
  { credits: 2000, bonus: 200, price: 70, label: 'Popular', sort: 2 },
  { credits: 10000, bonus: 1500, price: 300, label: 'Best value', sort: 3 },
  { credits: 50000, bonus: 10000, price: 1200, label: 'Whale', sort: 4 }
];
const ADDONS = [
  { slug: 'extra-closer', name: 'Extra Closer', description: 'Add one more AI Closer to any plan for 30 days.', price_text: '$5 / mo or 150 credits', price: 5, status: 'live', sort: 1 },
  { slug: 'extra-seat', name: 'Extra seat', description: 'Add a teammate to Pulse Inbox for 30 days.', price_text: '$5 / mo', price: 5, status: 'live', sort: 2 },
  { slug: 'website-chat', name: 'Website chat', description: 'Website AI chat for 1 site on any plan, 30 days.', price_text: '$29 / mo', price: 29, status: 'live', sort: 3 },
  { slug: 'pro-brain', name: 'Pro Brain', description: 'Our smartest model for complex sales and support. Switch it on per Closer.', price_text: '+3 credits per chat', price: 0, status: 'live', sort: 3 },
  { slug: 'done-for-you', name: 'Done-for-you setup', description: 'We build, train and test your first Closers for you.', price_text: '$99 once', price: 99, status: 'live', sort: 4 },
  { slug: 'custom-voice', name: 'Custom Voice', description: 'Your brand voice for Closer voice replies.', price_text: '$15 / mo', price: 15, status: 'soon', sort: 5 },
  { slug: 'whatsapp-channel', name: 'WhatsApp channel', description: 'Put your Closers on the WhatsApp Business Platform.', price_text: 'Coming soon', price: 0, status: 'soon', sort: 6 }
];
const COUPONS = [
  { code: 'WELCOME20', description: '20% off your first paid plan', kind: 'percent', value: 20, applies_to: 'plan', first_purchase_only: 1 },
  { code: 'VOO10', description: '$10 off any credit pack', kind: 'fixed', value: 10, applies_to: 'pack', max_uses: 500 }
];

function seedPricing(force) {
  const now = db.now();
  for (const p of PLANS) {
    const row = { description: '', badge: '', popular: 0, elite: 0, contact_sales: 0, offer: '{}', active: 1, ...p, features: JSON.stringify(p.features), created_at: now };
    if (db.one('SELECT id FROM plans WHERE id = ?', p.id)) { if (force) { const { id, created_at, ...rest } = row; void created_at; db.update('plans', id, rest); } }
    else db.insert('plans', row);
  }
  if (force || !db.one('SELECT id FROM packs LIMIT 1')) { db.run('DELETE FROM packs'); PACKS.forEach(p => db.insert('packs', { ...p, active: 1 })); }
  for (const a of ADDONS) {
    const ex = db.one('SELECT id FROM addons WHERE slug = ?', a.slug);
    if (!ex) db.insert('addons', { ...a, active: 1 }); else if (force) db.update('addons', ex.id, a);
  }
  for (const c of COUPONS) if (!db.one('SELECT id FROM coupons WHERE code = ?', c.code)) db.insert('coupons', { max_uses: 0, first_purchase_only: 0, plan_ids: '[]', ...c, active: 1, created_at: now });
}

function seedContent(force) {
  const md = require('../src/lib/md');
  const blogDir = path.join(config.root, 'content', 'blog');
  for (const f of fs.readdirSync(blogDir).filter(x => x.endsWith('.md'))) {
    const { data, body } = md.frontMatter(fs.readFileSync(path.join(blogDir, f), 'utf8'));
    const slug = f.replace(/\.md$/, '');
    const row = { slug, title: data.title || slug, description: data.description || '', category: data.category || 'Product', cover: data.cover || 'rocket', keywords: data.keywords || '', read_time: data.readTime || '5 min', body_md: body.trim(), featured: data.featured === 'true' ? 1 : 0, status: 'published', published_at: new Date((data.date || '2026-10-01') + 'T09:00:00Z').toISOString(), updated_at: db.now() };
    const ex = db.one('SELECT id FROM posts WHERE slug = ?', slug);
    if (!ex) db.insert('posts', row); else if (force) db.update('posts', ex.id, row);
  }
  // Legal pages: added when missing; with --force-content, overwritten. (Boot also brings unedited pages up to date.)
  require('../src/services/legal').syncPages({ force });
}

function seedAdmin() {
  const { hashPassword } = require('../src/lib/security');
  const ws = require('../src/services/workspace');
  let email = config.adminEmail; let password = config.adminPassword;
  if (!email || !password) {
    if (config.isProd) { console.log('! ADMIN_EMAIL / ADMIN_PASSWORD not set. Run "npm run create-admin" to create an admin.'); return null; }
    email = 'admin@replyvoo.local'; password = 'admin12345';
  }
  email = email.toLowerCase();
  let u = db.one('SELECT * FROM users WHERE email = ?', email);
  if (!u) {
    const id = db.insert('users', { email, name: 'Admin', password_hash: hashPassword(password), role: 'admin', email_verified: 1, moji: JSON.stringify({ gender: 'female', skin: 1, hair: 2, glasses: true }), created_at: db.now() });
    u = db.one('SELECT * FROM users WHERE id = ?', id);
    ws.createWorkspace(u, 'Zedapex HQ');
    console.log('✓ Admin created: ' + email + (config.adminPassword ? '' : ' / ' + password + '  (dev only, change it!)'));
  } else if (u.role !== 'admin') { db.update('users', u.id, { role: 'admin' }); console.log('✓ ' + email + ' promoted to admin'); }
  // The first admin is an owner on the Staff page (full access, manages other staff).
  const st = db.one('SELECT status FROM staff WHERE user_id = ?', u.id);
  if (!st) db.insert('staff', { user_id: u.id, role: 'owner', created_at: db.now() });
  else if (st.status !== 'active') db.run("UPDATE staff SET status = 'active', role = 'owner' WHERE user_id = ?", u.id);
  return u;
}

function seedDemo() {
  const { hashPassword, encrypt, token } = require('../src/lib/security');
  const ws = require('../src/services/workspace');
  if (db.one('SELECT id FROM users WHERE email = ?', 'demo@replyvoo.com')) return;
  const uid = db.insert('users', { email: 'demo@replyvoo.com', name: 'Grace Lee', password_hash: hashPassword('demo12345'), email_verified: 1, moji: JSON.stringify({ gender: 'female', skin: 2, hair: 1, earrings: true }), created_at: db.now() });
  const u = db.one('SELECT * FROM users WHERE id = ?', uid);
  const w = ws.createWorkspace(u, 'Glow Labs', { settings: { niche: 'Beauty & skincare', alerts: { handoff: true, night_report: true, hot: true, low_credits: true } } });
  db.update('workspaces', w.id, { plan_id: 'pro', conv_used: 1812, pro_used: 64 });
  ws.addCredits(w.id, 1240, 'Top-up: 2,000 Voo Credits (demo)');
  const kb = 'Glow Labs sells skincare.\n\nVitamin C Serum 30ml costs $24. Best seller. Brightens skin in 2 weeks.\n\nHydra Cream 50ml costs $19.\n\nGlow Bundle (serum + cream) costs $38, save $5.\n\nShipping: we ship to Spain, France, Germany and the rest of Europe in 2 to 4 days, and worldwide in 5 to 9 days. Free shipping over $50.\n\nPayment: card or bank transfer through the payment link.\n\nReturns: 14 days for unopened products.';
  const now = db.now();
  const ace = db.insert('closers', { workspace_id: w.id, name: 'Ace', template: 'sales', persona: JSON.stringify({ tone: 25, length: 30, emoji: 50 }), skills: JSON.stringify({ paylink: true, vision: true, upsell: true, nudge: true, handoff: true, receipt: true }), instructions: 'Always suggest the Glow Bundle when someone asks about the serum.', knowledge: kb, pay_link: 'https://pay.example.com/glowlabs', replies: 3120, created_at: now, updated_at: now });
  db.insert('closers', { workspace_id: w.id, name: 'Mira', template: 'support', persona: JSON.stringify({ tone: 15, length: 35, emoji: 10 }), skills: JSON.stringify({ vision: true, handoff: true, receipt: true }), instructions: '', knowledge: kb, replies: 1288, created_at: now, updated_at: now });
  const ch = db.insert('channels', { workspace_id: w.id, type: 'telegram_bot', name: 'Glow Labs Shop', username: 'glowlabs_shop_bot', external_id: '0', token_enc: encrypt(''), webhook_secret: token(16), closer_id: ace, status: 'active', created_at: now });
  const people = [['Lena Fischer', 'hot', 'checkout'], ['Marco Rossi', 'won', 'won'], ['Nora Lindqvist', 'warm', 'qualified'], ['Diego Alvarez', 'cold', 'new'], ['Sofia Petrova', 'hot', 'checkout'], ['Kenji Sato', 'warm', 'qualified']];
  const engine = require('../src/services/engine');
  people.forEach(([name, heat, stage], i) => {
    const cid = db.insert('contacts', { workspace_id: w.id, channel_id: ch, external_id: String(800000 + i), name, username: name.split(' ')[0].toLowerCase(), heat, stage, value: stage === 'won' ? 38 : 0, last_seen: now, created_at: now });
    const tid = db.insert('threads', { workspace_id: w.id, channel_id: ch, contact_id: cid, chat_id: String(800000 + i), closer_id: ace, last_message_at: now, created_at: now });
    const t = db.one('SELECT * FROM threads WHERE id = ?', tid);
    engine.addMessage(t, 'in', 'customer', ['Hi! How much is the vitamin C serum?', 'Just paid for the bundle, here is the receipt', 'Do you ship to Spain?', 'hello', 'Send me the payment link please', 'Is the cream good for dry skin?'][i]);
    engine.addMessage(t, 'out', 'ai', ['It’s $24 for 30ml and it’s our best seller. Most people grab the Glow Bundle (serum + cream) for $38 and save $5. Want the link?', 'Thank you Marco! I can see your receipt. The team will confirm it shortly and your bundle ships in 2 to 4 days.', 'Yes! Spain gets delivery in 2 to 4 days, and shipping is free over $50.', 'Hi Diego! Welcome to Glow Labs. What can I help you find today?', 'Here you go: https://pay.example.com/glowlabs. Tell me once it’s done and I’ll confirm your order.', 'Yes, Hydra Cream is made for dry skin. It’s $19 for 50ml.'][i], 'text', { closer_id: ace });
  });
  seedTraining(w.id, ace, ch, engine);
  // Website chat (Pro includes 1 site). Allowed on localhost so the demo works out of the box.
  const web = require('../src/services/website');
  const widget = { ...web.defaults('Glow Labs'), title: 'Glow Labs', subtitle: 'Skincare experts · replies in seconds', closer_name: 'Ace',
    welcome: 'Hi! 👋 I’m Ace from Glow Labs. Ask me about our serums, prices or shipping.', chips: ['Do you ship to Spain?', 'How much is the serum?', 'Talk to a person'],
    greet_text: 'Psst! Free shipping over $50 this week. Any questions?', greet_after: 6 };
  const siteKey = web.newKey();
  const site = db.insert('channels', { workspace_id: w.id, type: 'website', name: 'glowlabs.shop', username: '', external_id: siteKey, token_enc: '', webhook_secret: '', closer_id: ace, status: 'active', data: JSON.stringify({ widget, domains: ['localhost', 'glowlabs.shop'] }), created_at: now });
  const vid = 'v_demoEmmaNovak0000000001';
  const ec = db.insert('contacts', { workspace_id: w.id, channel_id: site, external_id: vid, name: 'Emma Novak', email: 'emma.novak@example.com', heat: 'warm', stage: 'qualified', last_seen: now, created_at: now });
  const et = db.insert('threads', { workspace_id: w.id, channel_id: site, contact_id: ec, chat_id: vid, closer_id: ace, last_message_at: now, created_at: now });
  const etr = db.one('SELECT * FROM threads WHERE id = ?', et);
  engine.addMessage(etr, 'in', 'customer', 'Is the Glow Bundle good as a gift?', 'text', { page_url: 'https://glowlabs.shop/products/glow-bundle', page_title: 'Glow Bundle | Glow Labs' });
  engine.addMessage(etr, 'out', 'ai', 'It’s our most gifted set! Serum + cream for $38, and you save $5. Want me to send the link?', 'text', { closer_id: ace });
  engine.addMessage(etr, 'note', 'system', 'Lead details: Emma Novak · emma.novak@example.com');
  console.log('✓ Demo website widget key: ' + siteKey + ' (allowed on localhost)');
  console.log('✓ Demo workspace: demo@replyvoo.com / demo12345');
  seedSupportDemo(u, w);
}

// Demo staff and support tickets so the Support desk and Staff pages have something to show.
function seedSupportDemo(customer, w) {
  const { hashPassword } = require('../src/lib/security');
  const support = require('../src/services/support');
  const staffSvc = require('../src/services/staff');
  const box = name => (db.one('SELECT id FROM support_boxes WHERE name = ?', name) || {}).id;
  const mk = (email, name, role, opts = {}) => {
    let u = db.one('SELECT * FROM users WHERE email = ?', email);
    if (!u) { const id = db.insert('users', { email, name, password_hash: hashPassword('staff12345'), email_verified: 1, created_at: db.now() }); u = db.one('SELECT * FROM users WHERE id = ?', id); }
    staffSvc.upsert(u.id, { role, ...opts });
    db.run('UPDATE staff SET last_seen = ? WHERE user_id = ?', new Date(Date.now() - (opts.seenMin || 2) * 60e3).toISOString(), u.id);
    return u;
  };
  const sam = mk('sam@replyvoo.local', 'Sam Carter', 'support', { title: 'Support lead', all_boxes: false, boxes: [box('Billing'), box('Setup help')], seenMin: 1 });
  const lena = mk('lena@replyvoo.local', 'Lena Fischer', 'content', { title: 'Content & SEO', seenMin: 300 });
  mk('ivo@replyvoo.local', 'Ivo Petrov', 'finance', { title: 'Payments', seenMin: 45 });
  void lena;
  const ago = m => new Date(Date.now() - m * 60e3).toISOString();
  const add = (o, msgs) => {
    const { ticket } = support.intake(o);
    db.run('UPDATE support_tickets SET created_at = ?, last_message_at = ? WHERE id = ?', ago(msgs[0][2] + 1), ago(msgs[msgs.length - 1][2]), ticket.id);
    db.run('UPDATE support_messages SET created_at = ? WHERE ticket_id = ?', ago(msgs[0][2] + 1), ticket.id);
    msgs.slice(1).forEach(([dir, text, m, who]) => { const id = support.addMessage(db.one('SELECT * FROM support_tickets WHERE id = ?', ticket.id), { dir, text, authorId: who ? who.id : null, authorName: who ? who.name : o.name, via: dir === 'out' ? (o.source === 'telegram' ? 'telegram' : o.source === 'dashboard' ? 'dashboard' : 'email') : o.source }); db.run('UPDATE support_messages SET created_at = ? WHERE id = ?', ago(m), id); });
    return ticket;
  };
  add({ source: 'dashboard', name: customer.name, email: customer.email, userId: customer.id, workspaceId: w.id, subject: 'Bot stopped replying after I changed the token', text: 'Hi! I made a new bot token in BotFather and now my Closer doesn’t answer anyone. What do I do?', boxId: box('Setup help') },
    [['in', '', 26], ['out', 'Hi Grace! When you make a new token, paste it again under Channels → your bot → Reconnect. It takes 10 seconds.', 18, sam], ['in', 'Done, it works again. Thank you!! One more thing: can Ace send photos of the products?', 4]]);
  add({ source: 'telegram', name: 'Tomás Herrera', tgChatId: '7001001', tgUsername: '@tomas_h', text: 'Hello, I paid for Pro with USDT 20 minutes ago but my plan still shows Spark.', boxId: box('Billing'), priority: 'high' }, [['in', '', 12]]);
  add({ source: 'web_chat', name: 'Elif Demir', email: 'elif.demir@example.com', subject: 'From the website chat', text: 'Asked to talk to a human from the website chat.\n\nChat so far:\nVisitor: Can Replyvoo answer in Turkish?\nJuno: Yes! Closers reply in the customer’s language.\nVisitor: Can I get a demo for my team of 12?' }, [['in', '', 55]]);
  add({ source: 'sales', name: 'Jonas Weber', email: 'jonas@atlas-academy.com', subject: 'Sales enquiry: Black', text: '[Plan: Black] We run 40 Telegram channels for our trading academy and want a custom setup with SSO. Can we talk this week?', priority: 'high' }, [['in', '', 140]]);
  const solved = add({ source: 'contact', name: 'Ana Costa', email: 'ana.costa@example.com', text: 'How do I add a teammate to my inbox?', boxId: box('Setup help') },
    [['in', '', 1500], ['out', 'Hi Ana! Go to Team → Invite, enter their email and pick Agent. They’ll get a link to join.', 1480, sam], ['in', 'Perfect, thanks!', 1470]]);
  support.update(db.one('SELECT * FROM support_tickets WHERE id = ?', solved.id), sam, { status: 'solved' });
  const urgent = add({ source: 'email', name: 'Ryan Brooks', email: 'ryan@brooksfitness.co', subject: 'Charged twice this month', text: 'I was charged twice for the Growth plan on the 1st. Please refund one of them.', boxId: box('Billing'), priority: 'urgent' }, [['in', '', 35]]);
  support.addMessage(db.one('SELECT * FROM support_tickets WHERE id = ?', urgent.id), { dir: 'note', text: 'Checked Paystack: two charges, 14 seconds apart. Refund the second one.', authorId: sam.id, authorName: sam.name, via: 'note' });
  console.log('✓ Demo support desk: 6 tickets, staff sam@replyvoo.local / staff12345 (support)');
}

// Agent Studio content for the demo "Ace" Closer: Q&As, products, policies, rules, a correction,
// and handoff conversations that show up as knowledge gaps.
function seedTraining(wsId, ace, channelId, engine) {
  const now = db.now();
  const item = (kind, f) => db.insert('closer_knowledge', { workspace_id: wsId, closer_id: ace, kind, title: f.title || '', question: f.question || '', answer: f.answer || '', data: JSON.stringify(f.data || {}), source: f.source || 'manual', enabled: 1, created_at: now, updated_at: now });
  [
    ['Do you deliver on Sundays?', 'We don’t deliver on Sundays, but orders placed by Saturday noon usually arrive on Monday or Tuesday.', ['weekend delivery']],
    ['How long does delivery take?', 'Europe gets it in 2 to 4 days and the rest of the world in 5 to 9 days. Shipping is free over $50.', ['shipping time', 'when will it arrive']],
    ['Do you ship outside Europe?', 'Yes! We ship worldwide in 5 to 9 days, with tracking.', ['international shipping']],
    ['Is the serum good for sensitive skin?', 'Yes, it’s fragrance-free and dermatologist tested. If your skin is very sensitive, do a small patch test first.', []],
    ['Are your products vegan?', 'Yes, every Glow Labs product is vegan and cruelty-free.', ['cruelty free']],
    ['How do I use the Vitamin C Serum?', 'Use 2 to 3 drops every morning on clean skin, then moisturiser and SPF.', ['how to apply the serum']],
    ['Can I track my order?', 'Yes! You get a tracking link by email as soon as your order ships.', ['where is my order']],
    ['Do you have a shop I can visit?', 'We’re online only for now, which keeps our prices low.', ['physical store']],
    ['What payment methods do you accept?', 'Card or bank transfer, both through our secure payment link.', ['can I pay by card']],
    ['Can I return a product?', 'Yes, within 14 days if it’s unopened. Message us and we’ll send you a return label.', ['returns']]
  ].forEach(([question, answer, alt]) => item('qa', { question, answer, data: alt.length ? { alt } : {} }));
  item('product', { title: 'Vitamin C Serum 30ml', answer: 'Our best seller. Brightens skin in 2 weeks.', data: { price: 24, currency: 'USD', stock: true, link: 'https://pay.example.com/glowlabs/serum', sku: 'GL-VC30' } });
  item('product', { title: 'Hydra Cream 50ml', answer: 'Rich daily moisturiser for dry skin.', data: { price: 19, currency: 'USD', stock: true, link: 'https://pay.example.com/glowlabs/cream', sku: 'GL-HC50' } });
  item('product', { title: 'Glow Bundle', answer: 'Serum + cream together. Save $5.', data: { price: 38, currency: 'USD', stock: true, link: 'https://pay.example.com/glowlabs/bundle', sku: 'GL-BUNDLE' } });
  item('policy', { title: 'Delivery', answer: 'We ship to Spain, France, Germany and the rest of Europe in 2 to 4 days, and worldwide in 5 to 9 days. Free shipping over $50. No deliveries on Sundays.', data: { topic: 'delivery' } });
  item('policy', { title: 'Returns & refunds', answer: '14 days for unopened products. Refunds are handled by our team.', data: { topic: 'returns' } });
  item('policy', { title: 'Payment methods', answer: 'Card or bank transfer through the secure payment link.', data: { topic: 'payment' } });
  item('policy', { title: 'Opening hours', answer: 'Our team answers Monday to Saturday, 9am to 6pm CET. Ace answers 24/7.', data: { topic: 'hours' } });
  item('correction', { question: 'Can I use the serum with retinol?', answer: 'Yes, just use them at different times: Vitamin C in the morning and retinol at night.', source: 'correction', data: { ai_answer: 'Yes, mix them together every night.' } });
  const rules = { do: ['Suggest the Glow Bundle when someone asks about the serum'], dont: ['Promise an exact delivery date', 'Discuss competitors'], avoid: ['politics'], required: [], discount: { mode: 'max', max: 10 },
    handoff: { angry: true, refund: true, human: true, legal: false, order_over: 300, keywords: ['wholesale'] }, hours: 'If the team is offline, say a person will reply in the morning.', language: { mode: 'auto', lang: '' }, set: true };
  const tr = { personality_ok: true, coach: { step: 5, done: [1, 2, 3, 4], finished: true }, runs: { price: { at: now, pass: true, note: 'Mentions a price', reply: 'Vitamin C Serum 30ml is $24.' }, refund: { at: now, pass: true, note: 'Handed over to your team', reply: 'I’m sorry about that. Let me bring in someone from the team.' } } };
  db.update('closers', ace, { rules: JSON.stringify(rules), training: JSON.stringify(tr) });
  db.insert('closer_versions', { workspace_id: wsId, closer_id: ace, user_id: null, label: 'Created', data: JSON.stringify({ name: 'Ace', template: 'sales', persona: { tone: 25, length: 30, emoji: 50 }, instructions: 'Always suggest the Glow Bundle when someone asks about the serum.', rules: {}, pay_link: 'https://pay.example.com/glowlabs' }), created_at: new Date(Date.now() - 3 * 864e5).toISOString() });
  // Conversations Ace couldn't answer: they become "gaps" to teach.
  const gapChats = [
    ['Hannah Becker', 'Do you offer gift wrapping?', 'handoff'],
    ['Lukas Weber', 'Do you have gift wrapping?', 'handoff'],
    ['Chloe Martin', 'Can I pick up my order from your studio in Lisbon?', 'human']
  ];
  gapChats.forEach(([name, q, how], i) => {
    const cid = db.insert('contacts', { workspace_id: wsId, channel_id: channelId, external_id: String(810000 + i), name, username: name.split(' ')[0].toLowerCase(), heat: 'warm', stage: 'qualified', last_seen: now, created_at: now });
    const tid = db.insert('threads', { workspace_id: wsId, channel_id: channelId, contact_id: cid, chat_id: String(810000 + i), closer_id: ace, status: how === 'handoff' ? 'handoff' : 'open', ai_on: how === 'human' ? 0 : 1, last_message_at: now, created_at: now });
    const t = db.one('SELECT * FROM threads WHERE id = ?', tid);
    engine.addMessage(t, 'in', 'customer', q);
    if (how === 'handoff') {
      engine.addMessage(t, 'out', 'ai', 'Good question! I don’t have that detail right now, so let me check with the team and get back to you shortly.', 'text', { closer_id: ace });
      engine.addMessage(t, 'note', 'system', 'Ace handed this chat to your team');
    } else {
      engine.addMessage(t, 'note', 'system', 'Grace took over this chat');
      engine.addMessage(t, 'out', 'human', 'Hi Chloe! Not yet, but we’re looking into pickups in Lisbon. I’ll let you know!', 'text', { user_name: 'Grace Lee' });
    }
  });
}

function seed(opts = {}) {
  db.tx(() => {
    seedPricing(opts.forcePricing);
    seedContent(opts.forceContent);
  });
  const admin = seedAdmin();
  if (opts.demo) seedDemo();
  return { admin };
}

if (require.main === module) {
  db.open();
  const args = process.argv.slice(2);
  seed({ demo: args.includes('--demo'), forceContent: args.includes('--force-content'), forcePricing: args.includes('--force-pricing') });
  console.log('✓ Plans, packs, power-ups, coupons, blog posts and legal pages are ready.');
}

module.exports = { seed, PLANS, PACKS, ADDONS };
