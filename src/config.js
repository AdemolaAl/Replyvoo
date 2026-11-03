'use strict';
// Loads settings from .env (if present) and the process environment.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    v = v.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.startsWith('#') ? '' : v.replace(/\s+#.*$/, '').trim(); // "KEY=value   # comment" and "KEY=   # comment"
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnvFile(path.join(ROOT, '.env'));

const env = (k, d = '') => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const bool = (k, d = false) => { const v = env(k, ''); return v === '' ? d : /^(1|true|yes|on)$/i.test(v); };
// A bare host ("https://gatevoo.com", as the other Voo apps take it) gets Gatevoo's merchant API path appended.
function gatevooApiUrl(raw) {
  const s = String(raw).trim().replace(/\/+$/, '');
  try { const u = new URL(s); if (u.pathname === '/' || u.pathname === '') return s + '/api/v1'; } catch { /* reported by Test connection */ }
  return s;
}
const APP_URL = env('APP_URL', env('RAILWAY_PUBLIC_DOMAIN') ? 'https://' + env('RAILWAY_PUBLIC_DOMAIN') : 'http://localhost:' + env('PORT', '3000')).replace(/\/+$/, '');

const config = {
  root: ROOT,
  env: env('NODE_ENV', 'development'),
  isProd: env('NODE_ENV', 'development') === 'production',
  port: Number(env('PORT', '3000')),
  appUrl: APP_URL,
  secret: env('APP_SECRET', ''),
  dbPath: path.resolve(ROOT, env('DATABASE_PATH', './data/replyvoo.db')),
  adminEmail: env('ADMIN_EMAIL', ''),
  adminPassword: env('ADMIN_PASSWORD', ''),
  ai: {
    key: env('ANTHROPIC_API_KEY'),
    model: env('AI_MODEL', 'claude-haiku-4-5-20251001'),
    proModel: env('AI_PRO_MODEL', 'claude-sonnet-5-5'),
    maxTokens: Number(env('AI_MAX_TOKENS', '400')),
    transcribeUrl: env('TRANSCRIBE_API_URL', 'https://api.openai.com/v1/audio/transcriptions'),
    transcribeKey: env('TRANSCRIBE_API_KEY'),
    transcribeModel: env('TRANSCRIBE_MODEL', 'whisper-1'),
    // Careful mode: the model thinks before answering money, refund and angry-customer messages (and Pro Brain chats).
    thinking: bool('AI_THINKING', true),
    // Optional backup AI (any OpenAI-compatible chat API): used if Claude is down, or as the main AI when it's the only key.
    openaiKey: env('OPENAI_API_KEY'),
    openaiModel: env('OPENAI_MODEL', 'gpt-4o-mini'),
    openaiUrl: env('OPENAI_API_URL', 'https://api.openai.com/v1/chat/completions')
  },
  mail: {
    provider: env('MAIL_PROVIDER', 'log'),
    key: env('MAIL_API_KEY'),
    from: env('MAIL_FROM', 'Replyvoo <hello@replyvoo.com>'),
    replyTo: env('MAIL_REPLY_TO', 'support@replyvoo.com')
  },
  pay: {
    paystackSecret: env('PAYSTACK_SECRET_KEY'),
    paystackPublic: env('PAYSTACK_PUBLIC_KEY'),
    flwSecret: env('FLUTTERWAVE_SECRET_KEY'),
    flwHash: env('FLUTTERWAVE_WEBHOOK_HASH'),
    demo: bool('PAYMENTS_DEMO', env('NODE_ENV', 'development') !== 'production')
  },
  // Gatevoo: Zedapex's own crypto checkout (USDT on TRON and Bitcoin, straight to our wallets).
  // Without keys, and with PAYMENTS_DEMO on, a local sandbox checkout is used instead so the flow can be tested.
  gatevoo: {
    // Gatevoo's merchant API lives at gatevoo.com/api/v1 (as for Joinvoo, Castvoo and Spyvoo). The old default,
    // api.gatevoo.com, does not exist in DNS, so every crypto checkout failed with "could not be reached".
    apiUrl: gatevooApiUrl(env('GATEVOO_API_URL') || env('GATEVOO_URL') || 'https://gatevoo.com'),
    apiKey: env('GATEVOO_API_KEY'),
    webhookSecret: env('GATEVOO_WEBHOOK_SECRET')
  },
  // Bachs (bachs.io): hosted checkout for African cards, bank transfer, mobile money and USDT/USDC.
  // Keys are normally saved in Admin → Billing rules → Bachs (encrypted); these variables are the fallback.
  bachs: {
    secretKey: env('BACHS_SECRET_KEY'),
    webhookSecret: env('BACHS_WEBHOOK_SECRET'),
    apiBase: env('BACHS_API_BASE'),          // tests only: a fake Bachs
    allowSandbox: bool('BACHS_ALLOW_SANDBOX', false)
  },
  // VooSquare (Voo Connect kit in ./voo-connect): one Voo ID for every Zedapex tool. "Continue with VooSquare" is added
  // NEXT TO Replyvoo's own login (never instead of it). On once VOO_BASE, VOO_CLIENT_ID and VOO_CLIENT_SECRET are set
  // (or saved in Admin → Billing rules → VooSquare). VOO_CONNECT=off switches everything off.
  voo: {
    on: !/^(0|false|no|off)$/i.test(env('VOO_CONNECT', 'on')),
    base: env('VOO_BASE', env('VOO_ISSUER')).replace(/\/+$/, ''),
    serverBase: env('VOO_SERVER_BASE').replace(/\/+$/, ''),
    clientId: env('VOO_CLIENT_ID'),
    clientSecret: env('VOO_CLIENT_SECRET'),
    apiKey: env('VOO_API_KEY'),
    signalSecret: env('VOO_SIGNAL_SECRET'),
    redirectUri: env('VOO_REDIRECT_URI', APP_URL + '/auth/voosquare/callback'),
    // Inbound-only key for VooSquare's staff sync (POST /api/voosquare/staff). Optional; the API key is NOT accepted there.
    serviceKey: env('VOO_SERVICE_KEY'),
    // VooSquare's chat widget on Replyvoo's pages (off by default: Replyvoo has its own Juno chat; support tickets are
    // copied into VooSquare HQ anyway).
    widget: bool('VOO_WIDGET', false),
    flushMs: Number(env('VOO_FLUSH_MS', '5000'))
  },
  // WhatsApp through Meta's WhatsApp Business Platform (Cloud API). Normally saved in Admin → Connections → WhatsApp
  // (owners only, encrypted); these variables are the fallback. Customers connect their own WhatsApp Business Account
  // with Embedded Signup, so Meta bills their account for template messages, never Replyvoo's.
  whatsapp: {
    appId: env('META_APP_ID', env('WHATSAPP_APP_ID')),
    appSecret: env('META_APP_SECRET', env('WHATSAPP_APP_SECRET')),
    configId: env('WHATSAPP_CONFIG_ID'),
    verifyToken: env('WHATSAPP_VERIFY_TOKEN'),
    graphVersion: env('META_GRAPH_VERSION', ''),
    enabled: env('WHATSAPP_ENABLED', ''), // '' = follow the admin switch; true/false forces it
    graphBase: env('META_GRAPH_BASE', 'https://graph.facebook.com').replace(/\/+$/, '') // tests only: a fake Graph API
  },
  // Replyvoo's own support desk: Telegram support bot, reply-to address for support emails, inbound email webhook key.
  support: {
    tgToken: env('SUPPORT_TG_BOT_TOKEN'),
    replyTo: env('SUPPORT_EMAIL_REPLY_TO'),
    inboundKey: env('SUPPORT_INBOUND_KEY')
  },
  // Staff must enter an emailed 6-digit code once per session before using the admin (on by default in production).
  staffMfa: bool('STAFF_2FA', env('NODE_ENV', 'development') === 'production'),
  demoSimulator: bool('DEMO_SIMULATOR', false),
  trustProxy: bool('TRUST_PROXY', true),
  trustProxyHops: Math.max(1, parseInt(env('TRUST_PROXY_HOPS', '1'), 10) || 1) // proxies in front of Replyvoo that add to X-Forwarded-For
};
config.gatevooApiUrl = gatevooApiUrl;

if (!config.secret) {
  if (config.isProd) {
    console.error('APP_SECRET is missing. Set a long random APP_SECRET in .env before starting in production.');
    process.exit(1);
  }
  config.secret = 'dev-only-secret-do-not-use-in-production-0123456789';
}
if (config.isProd && config.pay.demo) {
  console.warn('WARNING: PAYMENTS_DEMO=true in production. Anyone can get free plans and credits. Turn it off.');
}

module.exports = config;
