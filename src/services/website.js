'use strict';
// Website AI chat: widget config (defaults, presets, validation), origin rules, plan gating,
// uploaded images and the public config the embeddable /widget.js reads.
const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const settings = require('./settings');
const ws = require('./workspace');
const { HttpError } = require('../lib/http');

// Six looks. "Custom" is any preset whose colours were edited afterwards.
const PRESETS = {
  gold: { name: 'Replyvoo Gold', glass: false, colors: { primary: '#FFC21A', primary_text: '#121110', panel_bg: '#FFFFFF', header_bg: '#121110', header_text: '#FFFFFF', bubble_in: '#F4F2EC', bubble_in_text: '#121110', bubble_out: '#FFC21A', bubble_out_text: '#121110', text: '#121110' } },
  midnight: { name: 'Midnight', glass: false, colors: { primary: '#7C6CFF', primary_text: '#FFFFFF', panel_bg: '#14131A', header_bg: '#1F1D2B', header_text: '#FFFFFF', bubble_in: '#252336', bubble_in_text: '#ECEAF5', bubble_out: '#7C6CFF', bubble_out_text: '#FFFFFF', text: '#ECEAF5' } },
  white: { name: 'Clean White', glass: false, colors: { primary: '#121110', primary_text: '#FFFFFF', panel_bg: '#FFFFFF', header_bg: '#FFFFFF', header_text: '#121110', bubble_in: '#F2F2F0', bubble_in_text: '#121110', bubble_out: '#121110', bubble_out_text: '#FFFFFF', text: '#121110' } },
  pastel: { name: 'Soft Pastel', glass: false, colors: { primary: '#F49AC1', primary_text: '#3A1027', panel_bg: '#FFF8FB', header_bg: '#FDE2EE', header_text: '#3A1027', bubble_in: '#FFFFFF', bubble_in_text: '#3A1027', bubble_out: '#CDE7FF', bubble_out_text: '#0E2A47', text: '#3A1027' } },
  ink: { name: 'Bold Ink', glass: false, colors: { primary: '#FF5A36', primary_text: '#FFFFFF', panel_bg: '#FFFFFF', header_bg: '#121110', header_text: '#FFFFFF', bubble_in: '#121110', bubble_in_text: '#FFFFFF', bubble_out: '#FF5A36', bubble_out_text: '#FFFFFF', text: '#121110' } },
  glass: { name: 'Glass', glass: true, colors: { primary: '#2AABEE', primary_text: '#FFFFFF', panel_bg: '#FFFFFF', header_bg: '#0E2A47', header_text: '#FFFFFF', bubble_in: '#EEF6FC', bubble_in_text: '#0E2A47', bubble_out: '#2AABEE', bubble_out_text: '#FFFFFF', text: '#0E2A47' } }
};
const COLOR_KEYS = Object.keys(PRESETS.gold.colors);
const FONTS = {
  system: { name: 'System default', family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', css: '' },
  jakarta: { name: 'Plus Jakarta Sans', family: '"Plus Jakarta Sans", system-ui, sans-serif', css: 'Plus+Jakarta+Sans:wght@400;600;700;800' },
  inter: { name: 'Inter', family: 'Inter, system-ui, sans-serif', css: 'Inter:wght@400;600;700;800' },
  dmsans: { name: 'DM Sans', family: '"DM Sans", system-ui, sans-serif', css: 'DM+Sans:wght@400;600;700' },
  poppins: { name: 'Poppins', family: 'Poppins, system-ui, sans-serif', css: 'Poppins:wght@400;600;700' },
  nunito: { name: 'Nunito', family: 'Nunito, system-ui, sans-serif', css: 'Nunito:wght@400;600;800' }
};
const ASSET_KINDS = ['logo', 'avatar', 'launcher'];
const MAX_ASSET = 300 * 1024;

function defaults(business, closerName) {
  return {
    preset: 'gold', glass: false, colors: { ...PRESETS.gold.colors }, font: 'system', radius: 22,
    launcher: 'bubble', launcher_text: 'Chat with us', position: 'right', offset_x: 20, offset_y: 20, size: 'normal', theme: 'light',
    title: business || 'Chat with us', subtitle: 'Typically replies in seconds', show_online: false, closer_name: closerName || '', avatar_mode: 'initials',
    custom_css: '', hide_branding: false,
    welcome: 'Hi there! 👋 Ask me anything about our products, prices or delivery. I reply in seconds.',
    placeholder: 'Type your message…',
    chips: ['What do you sell?', 'How much is delivery?', 'Talk to a person'],
    greet_after: 8, greet_text: 'Hey! Got a question? I can help in seconds.', greet_url: '',
    delay_min: 1.5, delay_max: 4, human_typing: true, typing_cps: 22, sound: false,
    disclosure: true, disclosure_text: 'AI assistant',
    lead: { mode: 'after_first', title: 'Where can we reach you?', name: { on: true, req: false }, email: { on: true, req: true }, phone: { on: false, req: false } },
    handoff_text: 'I’ve passed this to the team. Someone will reply right here.',
    offline_text: 'Our team is offline right now. Leave your message and we’ll reply here as soon as we’re back.',
    hours: { on: false, tz: 'UTC', days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' },
    telegram_button: true,
    assets: {}
  };
}

const clampN = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const txt = (v, max, d = '') => (v == null ? d : String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max));
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const hex = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v).toUpperCase() : d);
const time = (v, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : d);
function validTz(tz) { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } }

// Custom CSS runs inside the widget's Shadow DOM, but we still strip anything that loads or runs code.
function cleanCss(css) {
  let s = String(css || '').slice(0, 5000);
  for (;;) {
    const before = s;
    s = s.replace(/<\/?\s*style/gi, '').replace(/@import[^;]*;?/gi, '').replace(/url\s*\(/gi, '').replace(/expression\s*\(/gi, '').replace(/javascript\s*:/gi, '').replace(/behaviou?r\s*:/gi, '').replace(/-moz-binding/gi, '').replace(/</g, '');
    if (s === before) break;
  }
  return s.trim();
}

// Merge a (partial) widget config from the dashboard over the stored one, validating every field.
function cleanWidget(input, existing, lim) {
  const cur = { ...defaults(), ...(existing || {}) };
  const b = input && typeof input === 'object' ? input : {};
  const has = k => Object.prototype.hasOwnProperty.call(b, k);
  const out = { ...cur };
  if (has('preset')) out.preset = oneOf(b.preset, Object.keys(PRESETS).concat('custom'), cur.preset);
  if (has('glass')) out.glass = !!b.glass;
  const colors = { ...PRESETS.gold.colors, ...(cur.colors || {}) };
  if (b.colors && typeof b.colors === 'object') for (const k of COLOR_KEYS) if (k in b.colors) colors[k] = hex(b.colors[k], colors[k]);
  out.colors = colors;
  if (has('font')) out.font = oneOf(b.font, Object.keys(FONTS), cur.font);
  if (has('radius')) out.radius = Math.round(clampN(b.radius, 0, 32, cur.radius));
  if (has('launcher')) out.launcher = oneOf(b.launcher, ['bubble', 'pill', 'avatar'], cur.launcher);
  if (has('launcher_text')) out.launcher_text = txt(b.launcher_text, 30) || 'Chat with us';
  if (has('position')) out.position = oneOf(b.position, ['right', 'left'], cur.position);
  if (has('offset_x')) out.offset_x = Math.round(clampN(b.offset_x, 0, 120, cur.offset_x));
  if (has('offset_y')) out.offset_y = Math.round(clampN(b.offset_y, 0, 160, cur.offset_y));
  if (has('size')) out.size = oneOf(b.size, ['compact', 'normal', 'large'], cur.size);
  if (has('theme')) out.theme = oneOf(b.theme, ['auto', 'light', 'dark'], cur.theme);
  if (has('title')) out.title = txt(b.title, 40) || cur.title;
  if (has('subtitle')) out.subtitle = txt(b.subtitle, 60);
  if (has('show_online')) out.show_online = !!b.show_online;
  if (has('closer_name')) out.closer_name = txt(b.closer_name, 30);
  if (has('avatar_mode')) out.avatar_mode = oneOf(b.avatar_mode, ['initials', 'upload'], cur.avatar_mode);
  if (has('welcome')) out.welcome = txt(b.welcome, 400);
  if (has('placeholder')) out.placeholder = txt(b.placeholder, 50) || 'Type your message…';
  if (has('chips')) out.chips = (Array.isArray(b.chips) ? b.chips : []).map(c => txt(c, 40)).filter(Boolean).slice(0, 4);
  if (has('greet_after')) out.greet_after = Math.round(clampN(b.greet_after, 0, 120, cur.greet_after));
  if (has('greet_text')) out.greet_text = txt(b.greet_text, 120);
  if (has('greet_url')) out.greet_url = txt(b.greet_url, 120);
  if (has('delay_min')) out.delay_min = Math.round(clampN(b.delay_min, 0, 20, cur.delay_min) * 10) / 10;
  if (has('delay_max')) out.delay_max = Math.round(clampN(b.delay_max, 0, 30, cur.delay_max) * 10) / 10;
  if (out.delay_max < out.delay_min) out.delay_max = out.delay_min;
  if (has('human_typing')) out.human_typing = !!b.human_typing;
  if (has('typing_cps')) out.typing_cps = Math.round(clampN(b.typing_cps, 5, 80, cur.typing_cps));
  if (has('sound')) out.sound = !!b.sound;
  if (has('disclosure')) out.disclosure = !!b.disclosure;
  if (has('disclosure_text')) out.disclosure_text = txt(b.disclosure_text, 40) || 'AI assistant';
  if (has('lead') && b.lead && typeof b.lead === 'object') {
    const l = b.lead, cl = cur.lead || defaults().lead;
    const f = k => ({ on: l[k] && 'on' in l[k] ? !!l[k].on : cl[k].on, req: l[k] && 'req' in l[k] ? !!l[k].req : cl[k].req });
    out.lead = { mode: oneOf(l.mode, ['off', 'after_first', 'before'], cl.mode), title: 'title' in l ? (txt(l.title, 60) || 'Where can we reach you?') : cl.title, name: f('name'), email: f('email'), phone: f('phone') };
    for (const k of ['name', 'email', 'phone']) if (!out.lead[k].on) out.lead[k].req = false;
    if (out.lead.mode !== 'off' && !out.lead.name.on && !out.lead.email.on && !out.lead.phone.on) throw new HttpError(400, 'Lead capture needs at least one field. Switch on name, email or phone, or turn lead capture off.');
  }
  if (has('handoff_text')) out.handoff_text = txt(b.handoff_text, 200);
  if (has('offline_text')) out.offline_text = txt(b.offline_text, 200);
  if (has('hours') && b.hours && typeof b.hours === 'object') {
    const h = b.hours, ch = cur.hours || defaults().hours;
    const tz = 'tz' in h ? txt(h.tz, 60) : ch.tz;
    if (h.on && !validTz(tz)) throw new HttpError(400, 'That time zone is not valid. Use a name like Europe/Madrid or America/New_York.');
    out.hours = { on: 'on' in h ? !!h.on : ch.on, tz: validTz(tz) ? tz : 'UTC', days: Array.isArray(h.days) ? [...new Set(h.days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : ch.days, from: time(h.from, ch.from), to: time(h.to, ch.to) };
  }
  if (has('telegram_button')) out.telegram_button = !!b.telegram_button;
  if (has('custom_css')) {
    const css = String(b.custom_css || '');
    if (css.trim() && !(lim && lim.custom_css)) throw new HttpError(402, 'Custom CSS is available on Business and up.', { code: 'custom_css_locked' });
    if (css.length > 5000) throw new HttpError(400, 'Custom CSS can be at most 5,000 characters.');
    out.custom_css = cleanCss(css);
  }
  if (has('hide_branding')) {
    if (b.hide_branding && !(lim && lim.remove_branding)) throw new HttpError(402, 'Hiding “Powered by Replyvoo” is available on Business and up.', { code: 'branding_locked' });
    out.hide_branding = !!b.hide_branding;
  }
  out.assets = cur.assets || {};
  return out;
}

// Domains: "https://www.Shop.com/path" → "www.shop.com". "*.shop.com" allows every subdomain (and shop.com).
function cleanDomains(list) {
  if (!Array.isArray(list)) throw new HttpError(400, 'Send domains as a list.');
  const out = [];
  for (const raw of list.slice(0, 40)) {
    let d = String(raw || '').trim().toLowerCase();
    if (!d) continue;
    d = d.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
    if (!/^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(d) || d.length > 253) throw new HttpError(400, '“' + String(raw).slice(0, 60) + '” is not a valid domain. Use something like shop.example.com or *.example.com.');
    if (d.startsWith('*.') && !d.slice(2).includes('.')) throw new HttpError(400, 'Wildcards need a real domain, like *.example.com.');
    if (!out.includes(d)) out.push(d);
  }
  if (out.length > 20) throw new HttpError(400, 'You can add up to 20 domains per widget.');
  return out;
}

const isLocalHost = h => h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
function hostOf(u) { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } }
function hostMatches(host, domains) {
  for (const d of domains || []) {
    if (d.startsWith('*.')) { const base = d.slice(2); if (host === base || host.endsWith('.' + base)) return true; }
    else if (host === d || host === 'www.' + d || (d.startsWith('www.') && host === d.slice(4))) return true;
  }
  return false;
}
// Which page is embedding the widget: Origin first (sent on every cross-origin fetch), then Referer.
function requestOrigin(req) {
  const o = req.headers.origin;
  if (o && o !== 'null') return o;
  const r = req.headers.referer || req.headers.referrer;
  if (r) { try { return new URL(r).origin; } catch { return ''; } }
  return '';
}
function originAllowed(origin, domains) {
  const host = hostOf(origin);
  if (!host) return false;
  if (hostMatches(host, domains)) return true;
  return isLocalHost(host) && !config.isProd;
}

function newKey() {
  let k;
  do { k = 'wk_' + crypto.randomBytes(16).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 20); }
  while (k.length < 23 || db.one('SELECT id FROM channels WHERE type = \'website\' AND external_id = ?', k));
  return k;
}

// Chat link: a free hosted chat page (/c/<slug>) built from the website widget. It is stored as a website channel with
// data.link = true, lives on Replyvoo's own address (no domains, no code), and never uses a website chat slot.
const LINK_SQL = "COALESCE(json_extract(data, '$.link'), 0) = 0";
function isLink(channel) { return !!(channel && channel.type === 'website' && db.json(channel.data, {}).link); }
function slugify(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'chat'; }
function uniqueSlug(name) {
  const base = slugify(name);
  const taken = s => db.one("SELECT id FROM channels WHERE type = 'website' AND status != 'deleted' AND json_extract(data, '$.slug') = ?", s);
  if (!taken(base)) return base;
  for (let i = 2; i < 500; i++) if (!taken(base + '-' + i)) return base + '-' + i;
  return base + '-' + crypto.randomBytes(3).toString('hex');
}
function linkUrl(slug) { return config.appUrl + '/c/' + slug; }
function linkDefaults(business, closerName) {
  return { ...defaults(business, closerName), greet_after: 0, greet_text: '', subtitle: 'We reply in seconds',
    lead: { mode: 'off', title: 'Want us to reach you later?', name: { on: true, req: false }, email: { on: true, req: false }, phone: { on: false, req: false } } };
}
function linkBySlug(slug) { return /^[a-z0-9-]{1,48}$/.test(String(slug || '')) ? db.one("SELECT * FROM channels WHERE type = 'website' AND status != 'deleted' AND json_extract(data, '$.link') = 1 AND json_extract(data, '$.slug') = ?", String(slug)) : null; }
// The chat link page runs on Replyvoo's own address, so it may talk to its own channel.
function ownHost(origin, req) {
  const host = hostOf(origin);
  if (!host) return false;
  const reqHost = String((req && req.headers && req.headers.host) || '').toLowerCase().replace(/:\d+$/, '');
  return host === hostOf(config.appUrl) || (!!reqHost && host === reqHost);
}

// Plan gating: the first N active website channels (oldest first) are on; the rest are locked. Chat links don't count.
function activeSites(wsId) { return db.all('SELECT id FROM channels WHERE workspace_id = ? AND type = \'website\' AND status = \'active\' AND ' + LINK_SQL + ' ORDER BY id', wsId).map(r => r.id); }
function channelUnlocked(channel) {
  const w = ws.get(channel.workspace_id);
  if (!w) return false;
  if (isLink(channel)) return channel.status === 'active';
  const lim = ws.limits(w);
  const idx = activeSites(w.id).indexOf(channel.id);
  return idx >= 0 && idx < lim.website_sites;
}

// Is the team "in office" right now? (Only used to choose between the handoff and the offline text.)
function teamOnline(hours, now = new Date()) {
  if (!hours || !hours.on) return true;
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: hours.tz || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    const mins = Number(parts.hour) * 60 + Number(parts.minute);
    const [fh, fm] = String(hours.from || '09:00').split(':').map(Number);
    const [th, tm] = String(hours.to || '18:00').split(':').map(Number);
    const from = fh * 60 + fm, to = th * 60 + tm;
    if (!(hours.days || []).includes(day)) return false;
    return from <= to ? mins >= from && mins < to : mins >= from || mins < to;
  } catch { return true; }
}

// How long the widget waits (and shows "typing…") before revealing a reply.
function replyTiming(w, text) {
  const min = Math.max(0, Number(w.delay_min) || 0), max = Math.max(min, Number(w.delay_max) || 0);
  let sec;
  if (w.human_typing) sec = Math.min(max, Math.max(min, min * 0.6 + String(text || '').length / Math.max(5, w.typing_cps || 22)));
  else sec = min + Math.random() * (max - min);
  const delay = Math.round(sec * 1000);
  return { delay_ms: delay, typing_ms: Math.max(0, delay - Math.min(600, Math.round(delay * 0.25))) };
}

function widgetOf(channel) { const d = db.json(channel.data, {}); return { data: d, widget: { ...defaults(channel.name), ...(d.widget || {}) }, domains: Array.isArray(d.domains) ? d.domains : [] }; }

function assetUrl(channel, kind, v) { return config.appUrl + '/w/' + channel.external_id + '/asset/' + kind + '?v=' + encodeURIComponent(v); }

function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(x => x.charAt(0).toUpperCase()).join('') || '?'; }

// Everything the widget needs to render, and nothing secret.
function publicConfig(channel) {
  const { widget: wd } = widgetOf(channel);
  const w = ws.get(channel.workspace_id);
  const lim = ws.limits(w);
  const closer = channel.closer_id ? db.one('SELECT id, name, active FROM closers WHERE id = ?', channel.closer_id) : null;
  const flagLive = settings.channel('website') === 'live' || (isLink(channel) && settings.channel('website') !== 'off');
  const unlocked = channelUnlocked(channel);
  const online = flagLive && unlocked && w.status === 'active' && channel.status === 'active';
  const tgBot = wd.telegram_button ? db.one('SELECT username FROM channels WHERE workspace_id = ? AND type = \'telegram_bot\' AND status = \'active\' AND username != \'\' ORDER BY id LIMIT 1', w.id) : null;
  const closerName = wd.closer_name || (closer && closer.name) || wd.title;
  const assets = {};
  for (const k of ASSET_KINDS) if (wd.assets && wd.assets[k]) assets[k] = assetUrl(channel, k, wd.assets[k]);
  const showBranding = !(wd.hide_branding && lim.remove_branding);
  const { custom_css: css, assets: _a, hours, ...rest } = wd;
  void _a;
  return {
    key: channel.external_id, online, offline_reason: online ? '' : (!flagLive ? 'Chat is offline right now.' : 'This chat is paused.'),
    business: w.name, closer: { name: closerName, initials: initials(closerName), ai: !!(closer && closer.active) },
    widget: { ...rest, hours_on: !!(hours && hours.on) }, font: { family: (FONTS[wd.font] || FONTS.system).family, css: (FONTS[wd.font] || FONTS.system).css },
    assets, team_online: teamOnline(hours),
    telegram_url: tgBot ? 'https://t.me/' + tgBot.username : '',
    branding: { show: showBranding, url: config.appUrl + '/?ref=' + encodeURIComponent(w.ref_code) + '&utm_source=widget&utm_medium=powered_by' },
    css: lim.custom_css ? (css || '') : ''
  };
}

// Uploaded images: PNG, JPEG or WebP only (SVG can carry scripts), checked by their bytes, not their name.
function sniff(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
function parseUpload(dataUrl) {
  const m = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'Upload a PNG, JPG or WebP image. SVG files are not allowed.');
  if (m[2].length > Math.ceil(MAX_ASSET / 3) * 4 + 8) throw new HttpError(413, 'That image is too big. Keep it under 300 KB.');
  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  if (!buf.length) throw new HttpError(400, 'That image is empty.');
  if (buf.length > MAX_ASSET) throw new HttpError(413, 'That image is too big. Keep it under 300 KB.');
  const mime = sniff(buf);
  if (!mime) throw new HttpError(400, 'That file is not a real PNG, JPG or WebP image.');
  return { mime, buf };
}

module.exports = { LINK_SQL, isLink, slugify, uniqueSlug, linkUrl, linkDefaults, linkBySlug, ownHost, PRESETS, FONTS, ASSET_KINDS, MAX_ASSET, defaults, cleanWidget, cleanDomains, cleanCss, originAllowed, requestOrigin, hostOf, hostMatches, isLocalHost, newKey, activeSites, channelUnlocked, teamOnline, replyTiming, widgetOf, publicConfig, parseUpload, sniff, initials, assetUrl };
