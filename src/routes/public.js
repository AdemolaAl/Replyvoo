'use strict';
// Public API used by the marketing site: site data, support chat, contact form, newsletter.
const db = require('../db');
const config = require('../config');
const settings = require('../services/settings');
const ws = require('../services/workspace');
const ai = require('../services/ai');
const catalog = require('../services/catalog');
const { HttpError, rateLimit } = require('../lib/http');
const { sha256 } = require('../lib/security');

const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '')) && String(e).length <= 200;

const bachsCap = () => { try { return Number(require('../services/bachs').maxUsd()).toLocaleString('en-US'); } catch { return '5,000'; } };
// Facts the website chat bot answers from. Built from live settings so price changes show up at once.
function supportFacts() {
  const b = settings.get('billing');
  const c = settings.get('company');
  const flags = settings.get('flags');
  const plans = ws.publicPlans().map(p => p.name + ': ' + (p.contact_sales ? 'contact sales' : p.price_month ? '$' + p.price_month + '/month' : 'free') + ', ' + (p.closers >= 9999 ? 'unlimited' : p.closers) + ' Closers, ' + p.conversations.toLocaleString('en-US') + ' conversations a month' + (p.offer ? ' (offer: ' + (p.offer.label || p.offer.percent + '% off') + ')' : '')).join('\n');
  const packs = db.all('SELECT * FROM packs WHERE active = 1 ORDER BY sort, price').map(p => p.credits + (p.bonus ? '+' + p.bonus + ' bonus' : '') + ' credits for $' + p.price).join('; ');
  const soon = Object.entries(flags.channels).filter(([, v]) => v === 'soon').map(([k]) => k).join(', ');
  return [
    c.product + ' is made by ' + c.legal_name + '. Support email: ' + c.support_email + '.',
    'Replyvoo puts AI agents called Closers on Telegram (bots, groups and personal accounts through Telegram Business). They reply in seconds, qualify leads, send payment links, follow up and hand chats to humans when needed.',
    'A conversation = one customer chatting within ' + b.conversation_window_hours + ' hours, up to ' + b.conversation_reply_limit + ' AI replies. Plans include a number of conversations each month. Extra conversations use Voo Credits: 1 credit = 1 conversation.',
    'PLANS:\n' + plans,
    'CREDIT PACKS: ' + packs,
    (flags.channels.whatsapp === 'live' ? 'WhatsApp is live: customers connect their own WhatsApp Business number with Meta’s Embedded Signup (Channels → Connect WhatsApp). WhatsApp chats count as normal conversations. Outside the 24-hour reply window only approved message templates can be sent, and Meta bills those template messages to the customer’s own WhatsApp account at Meta’s rates.\n' : '') + 'Coming soon: ' + (soon || 'none') + '. Users can join the waitlist in their dashboard.',
    'Voo Squad: referral programme, members earn ' + Math.round((b.referral_tiers[0] || { rate: 0.2 }).rate * 100) + '% or more of what their friends pay, paid as Voo Credits (no minimum) or as cash once the balance reaches $' + (b.referral_min_payout_usd || 300) + '. Friends get ' + b.referee_bonus_credits + ' bonus credits.',
    'Sign up free at ' + config.appUrl + '/app/signup. No card needed for the free plan.',
    'PAYING: card plans paid through Bachs renew automatically by default. We email a reminder 3 days before each monthly charge (7 days before a yearly one). Owners cancel with one click in Plan & billing and keep the plan until the paid period ends. If a card payment fails there is a grace period and an "update card" link in Plan & billing. Bank transfer, mobile money and crypto are prepaid and never renew on their own. Bachs takes at most $' + bachsCap() + ' per payment; above that, pay in parts or pick another method. Payment-method fees are built into the price, never added as a separate line.',
    'POLICIES: Terms ' + config.appUrl + '/legal/terms, Refund policy ' + config.appUrl + '/legal/refunds, Privacy policy ' + config.appUrl + '/legal/privacy. Refunds and exceptions follow the Refund policy only; the team decides them, not the assistant.',
    (require('../services/voosquare').enabled() ? 'VooSquare (voosquare.com) is the Voo hub: one Voo ID logs you in to every Voo app ("Continue with VooSquare" on the login page; email and password login still works). It has free community rooms, VooSquare Academy, Premium, a Deals hub of partner affiliate programs (partner links may earn Zedapex a commission, see voosquare.com/legal/deals) and the Voo Affiliates program (lifetime RevShare from 20% up to 50% by tier). Gatevoo, the Voo crypto checkout, is still waitlist-only for other businesses.\n' : '') +
    'Sister company Joinvoo (' + settings.get('joinvoo').url + ') tracks real Telegram joins and sales for ad campaigns so ads stop optimising on fake traffic.'
  ].join('\n\n');
}

function fallbackAnswer(q) {
  const s = q.toLowerCase();
  const b = settings.get('billing');
  if (/price|cost|plan|how much|pricing|\$/.test(s)) {
    const p = ws.publicPlans().filter(x => !x.contact_sales).slice(0, 4).map(x => x.name + (x.price_month ? ' $' + x.price_month + '/mo' : ' free')).join(', ');
    return 'Plans: ' + p + '. You pay per conversation (up to ' + b.conversation_reply_limit + ' AI replies in ' + b.conversation_window_hours + 'h), not per message. See /pricing for everything.';
  }
  if (/whatsapp|instagram|tiktok|messenger|facebook/.test(s)) {
    if (/whatsapp/.test(s) && settings.channel('whatsapp') === 'live') return 'Yes. WhatsApp is live through Meta’s official WhatsApp Business Platform: tap Connect WhatsApp in Channels and log in with Facebook. Chats count as normal conversations; Meta bills template messages to your own WhatsApp account.';
    return 'Telegram is live today. ' + (settings.channel('whatsapp') === 'live' ? 'WhatsApp is live too. Instagram and TikTok are' : 'WhatsApp, Instagram and TikTok are') + ' coming soon through each platform’s official business tools. You can join the waitlist from your dashboard.';
  }
  if (/train|setup|set up|start|how/.test(s)) return 'Setup takes about 5 minutes: create a bot with @BotFather, paste the token, pick a Closer template and paste your FAQ. Start free at /app/signup.';
  if (/refund|cancel|renew/.test(s)) return 'Card plans renew automatically. Turn off auto-renew with one click in Plan & billing and keep your plan until the period ends. See our refund policy at /legal/refunds.';
  if (/human|agent|person|talk/.test(s)) return 'Sure. Tap “Talk to a human” and leave your email, and our team will reply.';
  if (/personal|account|business/.test(s)) return 'Yes. With Telegram Business (needs Telegram Premium) your Closer can answer chats on your personal account.';
  return 'I can help with pricing, setup, channels and features. For anything else, tap “Talk to a human” and leave your email.';
}

module.exports = function (app) {
  app.get('/api/public/site', () => {
    const s = settings.all();
    return {
      company: s.company, site: s.site, seo: s.seo,
      channels: catalog.CHANNELS.map(c => ({ ...c, status: c.id === 'telegram' ? 'live' : settings.channel(c.id) })),
      features: s.flags.features, plans: ws.publicPlans(),
      packs: db.all('SELECT id, credits, bonus, price, label FROM packs WHERE active = 1 ORDER BY sort, price'),
      addons: require('./pages').addonsFor(db.all('SELECT slug, name, description, price_text, status FROM addons WHERE active = 1 AND status != \'off\' ORDER BY sort')),
      billing: { reply_limit: s.billing.conversation_reply_limit, window_hours: s.billing.conversation_window_hours, credit_value_usd: s.billing.credit_value_usd, referral_tiers: s.billing.referral_tiers, referee_bonus: s.billing.referee_bonus_credits, yearly_months_free: s.billing.yearly_months_free },
      joinvoo: s.joinvoo,
      voo: require('../services/voosquare').publicInfo()
    };
  });

  const chatLimit = rateLimit('pubchat', 40, 3600e3);
  app.post('/api/public/chat', chatLimit, async req => {
    if (!settings.feature('chat_widget')) throw new HttpError(403, 'Chat is offline right now.');
    const b = req.body || {};
    const q = String(b.message || '').trim().slice(0, 800);
    if (!q) throw new HttpError(400, 'Type a message first.');
    let answer = null;
    try { answer = await ai.supportBot(q, Array.isArray(b.history) ? b.history : [], supportFacts(), settings.get('ai').support_bot_prompt); } catch (e) { console.warn('[support-bot]', e.message); }
    return { reply: answer || fallbackAnswer(q), ai: !!answer };
  });

  app.post('/api/public/contact', rateLimit('contact', 8, 3600e3), req => {
    // req.user is set when a signed-in customer uses the form
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    if (!emailOk(email)) throw new HttpError(400, 'Please enter a valid email so we can reply.');
    const message = String(b.message || '').trim().slice(0, 4000);
    if (message.length < 2) throw new HttpError(400, 'Please write a short message.');
    const source = ['chat', 'contact', 'sales'].includes(b.source) ? b.source : 'contact';
    db.insert('contact_messages', { name: String(b.name || '').slice(0, 80), email, message, source, created_at: db.now() });
    // Every website message also becomes a support desk ticket (website chat, contact form or sales form).
    let ref = null;
    try {
      // Link to a customer account only when that customer is signed in (anyone can type an email into a form).
      const known = req.user && String(req.user.email).toLowerCase() === email ? { id: req.user.id } : null;
      const plan = (message.match(/^\[Plan: ([^\]]+)\]/) || [])[1];
      ref = require('../services/support').intake({ source: source === 'chat' ? 'web_chat' : source, text: message, subject: source === 'sales' ? 'Sales enquiry' + (plan ? ': ' + plan : '') : source === 'chat' ? 'From the website chat' : '', name: String(b.name || '').slice(0, 80), email, userId: known ? known.id : null, priority: source === 'sales' ? 'high' : 'normal' }).ticket.ref;
    } catch (e) { console.error('[support] contact intake', e.message); }
    return { ok: true, ref };
  });

  app.post('/api/public/newsletter', rateLimit('news', 8, 3600e3), req => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!emailOk(email)) throw new HttpError(400, 'Please enter a valid email.');
    if (!db.one('SELECT id FROM waitlist WHERE email = ? AND item = \'newsletter\'', email)) db.insert('waitlist', { workspace_id: null, email, item: 'newsletter', created_at: db.now() });
    return { ok: true };
  });

  app.post('/api/public/waitlist', rateLimit('pubwait', 12, 3600e3), req => {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    if (!emailOk(email)) throw new HttpError(400, 'Please enter a valid email.');
    const item = String(b.item || '').toLowerCase();
    if (!catalog.CHANNELS.some(c => c.id === item)) throw new HttpError(400, 'Unknown channel');
    if (!db.one('SELECT id FROM waitlist WHERE email = ? AND item = ?', email, item)) db.insert('waitlist', { workspace_id: null, email, item, created_at: db.now() });
    return { ok: true };
  });

  app.post('/api/public/track', rateLimit('track', 120, 3600e3), req => {
    const target = String((req.body || {}).target || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 30);
    if (!target) return { ok: true };
    db.insert('clicks', { target, source: String((req.body || {}).source || '').slice(0, 40), workspace_id: req.ws ? req.ws.id : null, user_id: req.user ? req.user.id : null, ip_hash: sha256(req.ip + config.secret).slice(0, 16), created_at: db.now() });
    return { ok: true };
  });
};

module.exports.supportFacts = supportFacts;
module.exports.supportFacts = supportFacts;
