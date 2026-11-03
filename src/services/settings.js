'use strict';
// Admin-editable settings stored in the "settings" table, merged over these defaults.
const db = require('../db');

const HERO = {
  en: { badge: 'replies sent by Closers in the last hour', h1a: 'Sky-rocket your sales.', h1b: 'On autopilot.', sub: 'Slow replies are killing your conversions. Replyvoo puts AI Closers on your chats that answer in seconds, qualify every lead and close the sale while you sleep. Live on Telegram and your website today, with WhatsApp, Instagram and TikTok coming next.', cta: 'Hire your first Closer free', cta2: 'Watch it close a sale' },
  fr: { badge: 'réponses envoyées par les Closers cette dernière heure', h1a: 'Faites exploser vos ventes.', h1b: 'En pilote automatique.', sub: 'Les réponses lentes tuent vos conversions. Replyvoo place des Closers IA sur vos messageries : ils répondent en quelques secondes, qualifient chaque prospect et concluent la vente pendant que vous dormez. Disponible sur Telegram aujourd’hui, WhatsApp, Instagram et TikTok arrivent bientôt.', cta: 'Recrutez votre premier Closer', cta2: 'Voir une vente conclue' },
  pt: { badge: 'respostas enviadas pelos Closers na última hora', h1a: 'Dispare suas vendas.', h1b: 'No piloto automático.', sub: 'Respostas lentas estão matando suas conversões. O Replyvoo coloca Closers de IA nas suas conversas que respondem em segundos, qualificam cada lead e fecham a venda enquanto você dorme. Já no Telegram, com WhatsApp, Instagram e TikTok chegando em breve.', cta: 'Contrate seu primeiro Closer', cta2: 'Veja uma venda fechada' },
  es: { badge: 'respuestas enviadas por Closers en la última hora', h1a: 'Dispara tus ventas.', h1b: 'En piloto automático.', sub: 'Las respuestas lentas están matando tus conversiones. Replyvoo pone Closers de IA en tus chats que responden en segundos, califican cada lead y cierran la venta mientras duermes. Ya en Telegram, con WhatsApp, Instagram y TikTok muy pronto.', cta: 'Contrata tu primer Closer', cta2: 'Mira cómo cierra una venta' },
  sw: { badge: 'majibu yaliyotumwa na Closers saa iliyopita', h1a: 'Panda mauzo yako juu.', h1b: 'Yenyewe tu.', sub: 'Majibu ya polepole yanaua mauzo yako. Replyvoo inaweka Closers wa AI kwenye mazungumzo yako wanaojibu kwa sekunde, kuchuja kila mteja na kufunga mauzo ukiwa umelala. Inapatikana kwenye Telegram leo, na WhatsApp, Instagram na TikTok zinakuja hivi karibuni.', cta: 'Ajiri Closer wako wa kwanza', cta2: 'Tazama mauzo yakifungwa' },
  ar: { badge: 'رداً أرسلها الـ Closers خلال الساعة الأخيرة', h1a: 'ضاعف مبيعاتك.', h1b: 'بشكل تلقائي.', sub: 'الردود البطيئة تقتل مبيعاتك. يضع Replyvoo وكلاء ذكاء اصطناعي على محادثاتك يردّون خلال ثوانٍ، ويؤهلون كل عميل، ويغلقون البيع وأنت نائم. متاح على تيليجرام اليوم، وواتساب وإنستغرام وتيك توك قريباً.', cta: 'وظّف أول Closer مجاناً', cta2: 'شاهد إغلاق صفقة' }
};

const DEFAULTS = {
  company: {
    legal_name: 'Zedapex Limited', product: 'Replyvoo', address: 'Lagos', support_email: 'support@replyvoo.com',
    legal_email: 'legal@replyvoo.com', privacy_email: 'privacy@replyvoo.com', logo_url: '', telegram_support: '', twitter: ''
  },
  seo: {
    title: 'Replyvoo | AI Sales Agent for Telegram, WhatsApp & Instagram',
    description: 'AI sales & support agents that reply in seconds, qualify leads and close sales 24/7. Live on Telegram; WhatsApp, Instagram and TikTok coming soon.',
    keywords: 'ai sales agent, ai customer support agent, telegram ai chatbot, whatsapp ai chatbot, whatsapp business automation, instagram dm automation, instagram auto reply, tiktok dm automation, messenger ai chatbot, ai chatbot for small business, chat automation for small business, auto reply bot, ai closer, telegram business bot, omnichannel ai chatbot',
    og_image: '/img/og.png', twitter_handle: ''
  },
  site: {
    announcement: { on: true, text: 'AI Closers are live on Telegram and on your website. WhatsApp, Instagram and TikTok are coming soon.', link_text: 'See all channels', link: '/channels' },
    hero: HERO,
    sections: { leak: true, compare: true, calc: true, how: true, studio: true, website: true, channels: true, closers: true, features: true, juno: true, wallet: true, pricing: true, squad: true, blog: true, faq: true, cta: true },
    live_counter_start: 0, // no longer used (the counter is real now); kept so old saved settings still load
    live_counter_min: 50, // no longer used: the homepage shows no reply counter
    faq: [
      ['What is a Closer?', 'A Closer is an AI sales and support agent that chats with your customers in the apps they use. It is live on Telegram today, with WhatsApp, Instagram and TikTok coming soon. Each Closer has its own name, personality, knowledge and job, like sales, support or guarding your group. You can run several at once.'],
      ['Do I need to train it?', 'No. Pick a template, paste your FAQ or product list, and your Closer learns from it in minutes. Fix any answer and it remembers.'],
      ['How does pricing work?', 'You pay for conversations, not messages. A conversation is one customer chatting within 24 hours, up to 10 AI replies, and most sales chats fit in one. Need more? Voo Credits buy extra chats: 1 credit = 1 chat.'],
      ['Can it answer my personal Telegram account?', 'Yes. Connect through Telegram Business (it needs Telegram Premium) and your Closer answers your private chats. You choose which chats it handles.'],
      ['Do you support WhatsApp, Instagram and TikTok?', 'Telegram is live today. WhatsApp, Instagram, TikTok and Messenger are coming soon through each platform’s official business tools: the WhatsApp Business Platform, Meta’s Instagram and Messenger APIs and TikTok Business Messaging. They need platform approval, so we don’t promise dates. Join the waitlist on our Channels page and the same Closer will carry over when each one opens.'],
      ['Will my WhatsApp or Instagram account get banned?', 'Replyvoo only connects through official business APIs, never through scripts that pretend to be you in the app. Each platform has rules, like WhatsApp’s 24-hour reply window, and your Closer is built to follow them.'],
      ['What happens when the AI can’t answer?', 'The Closer hands the chat to your team with the full history. You choose the triggers: angry customers, refunds, big orders or anything else.'],
      ['Can I cancel anytime?', 'Yes. No contracts. Unused top-up credits stay in your Voo Wallet.']
    ],
    final_cta: { a: 'Your next customer is typing.', b: 'Answer in seconds.', sub: 'Hire your first Closer tonight. It’s free, and it starts replying the moment you switch it on.' }
  },
  flags: {
    maintenance: false,
    channels: { telegram_bot: 'live', telegram_business: 'live', telegram_group: 'live', whatsapp: 'soon', instagram: 'soon', tiktok: 'soon', messenger: 'soon', website: 'live' },
    features: { signup: true, studio: true, live_room: true, blast: true, juno: true, wallet: true, squad: true, joinvoo: true, pro_brain: true, voice: true, blog: true, chat_widget: true, nudge: true, night_report: true }
  },
  billing: {
    conversation_reply_limit: 10, conversation_window_hours: 24, free_plan_id: 'spark',
    credit_value_usd: 0.03, extra_closer_credits: 150, blast_people_per_credit: 10, pro_brain_extra_credits: 3,
    low_credit_threshold: 50, referee_bonus_credits: 100, referral_min_payout_usd: 300, signup_bonus_credits: 0,
    referral_tiers: [{ min: 0, rate: 0.20 }, { min: 10, rate: 0.25 }, { min: 50, rate: 0.30 }],
    paystack_currency: 'NGN', flutterwave_currency: 'USD',
    rates: { NGN: 1600, GHS: 15, KES: 130, ZAR: 18, USD: 1 },
    crypto_enabled: false, crypto_wallet: '', crypto_network: 'USDT on TRC20', gatevoo_enabled: true, gatevoo_usdt: true, gatevoo_btc: true,
    // Customer fee per payment method, in percent, built into the price shown for that method (migration 013).
    // Bachs is a third-party platform (4% covers its fees and FX risk). Gatevoo is always 0. Joinvoo credits never carry a fee.
    method_fees: { bachs: 4, gatevoo: 0, paystack: 0, flutterwave: 0, crypto: 0, demo: 0 },
    yearly_months_free: 2
  },
  joinvoo: {
    enabled: true, url: 'https://joinvoo.com', utm: 'utm_source=replyvoo&utm_medium=dashboard&utm_campaign=sister',
    headline: 'Running ads to Telegram? Stop paying for fake traffic.',
    pitch: 'Joinvoo tracks every real Telegram join, sign-up, deposit and sale, then sends them back to Meta, TikTok and Snapchat server-side. Your ads stop optimising on bots and start buying real customers.'
  },
  support: { routing: { web_chat: 0, telegram: 0, dashboard: 0, contact: 0, sales: 0, email: 0 }, auto_assign: true, email_staff: true, ai_drafts: true, tg_username: '', help_button: true },
  ai: { support_bot_prompt: 'You are Juno, the friendly support assistant on the Replyvoo website. Answer questions about Replyvoo in 1 to 3 short sentences. You are an AI: say so if asked. If you cannot help, hand off to the team.' }
};

const cache = new Map();
function deepMerge(a, b) {
  if (Array.isArray(a) || Array.isArray(b) || typeof a !== 'object' || typeof b !== 'object' || !a || !b) return b === undefined ? a : b;
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
  return out;
}
function raw(key) {
  if (cache.has(key)) return cache.get(key);
  const row = db.one('SELECT value FROM settings WHERE key = ?', key);
  const v = deepMerge(DEFAULTS[key] || {}, row ? db.json(row.value, {}) : {});
  cache.set(key, v);
  return v;
}
// What customers see. WhatsApp is only "live" when Admin → Connections → WhatsApp is configured and switched on
// (otherwise "soon"); the admin's "off" in Channels & features still hides it. The admin editor reads raw('flags').
function get(key) {
  const v = raw(key);
  if (key !== 'flags') return v;
  const wa = require('./whatsapp').effectiveChannel(v.channels && v.channels.whatsapp);
  return v.channels && v.channels.whatsapp === wa ? v : { ...v, channels: { ...v.channels, whatsapp: wa } };
}
function set(key, value) {
  if (!(key in DEFAULTS)) throw new Error('Unknown setting ' + key);
  db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', key, JSON.stringify(value), db.now());
  cache.delete(key);
  return get(key);
}
function all() { const o = {}; for (const k of Object.keys(DEFAULTS)) o[k] = get(k); return o; }
function feature(name) { return get('flags').features[name] !== false; }
function channel(name) { return get('flags').channels[name] || 'off'; }
function reset() { cache.clear(); try { require('./whatsapp').reset(); } catch { /* not loaded */ } }

module.exports = { get, raw, set, all, feature, channel, reset, DEFAULTS, KEYS: Object.keys(DEFAULTS) };
