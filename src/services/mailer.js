'use strict';
// Sends branded emails using the templates in /emails. Providers: log, resend, brevo, postmark.
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const db = require('../db');
const tpl = require('../lib/tpl');
const settings = require('./settings');

const DIR = path.join(config.root, 'emails');
const cache = new Map();

function load(name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Bad template name');
  if (cache.has(name) && config.isProd) return cache.get(name);
  const src = fs.readFileSync(path.join(DIR, name + '.html'), 'utf8');
  const subject = (src.match(/<!--\s*subject:\s*([\s\S]*?)-->/) || [])[1] || 'Replyvoo';
  const preheader = (src.match(/<!--\s*preheader:\s*([\s\S]*?)-->/) || [])[1] || '';
  // Short context word shown in the branded header, e.g. "Receipt" or "Security".
  const label = (src.match(/<!--\s*label:\s*([\s\S]*?)-->/) || [])[1] || '';
  const body = src.replace(/<!--\s*(subject|preheader|label):[\s\S]*?-->\s*/g, '');
  const t = { subject: subject.trim(), preheader: preheader.trim(), label: label.trim(), body };
  cache.set(name, t);
  return t;
}

function list() {
  return fs.readdirSync(DIR).filter(f => f.endsWith('.html') && f !== 'base.html').map(f => {
    const name = f.replace(/\.html$/, '');
    return { name, subject: load(name).subject };
  });
}

function baseData() {
  const c = settings.get('company');
  return { app_url: config.appUrl, logo_url: c.logo_url, company_name: c.legal_name, company_address: c.address, support_email: c.support_email, year: new Date().getFullYear() };
}

function build(name, data = {}) {
  const t = load(name);
  const all = { ...baseData(), ...data };
  const content = tpl.render(t.body, all);
  const subject = tpl.render(t.subject, all).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  const preheader = tpl.render(t.preheader, all);
  const base = load('base');
  const html = tpl.render(base.body, { ...all, content, preheader, label: t.label });
  const text = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|tr|h\d|div|table)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  return { subject, html, text };
}

function parseFrom(from) {
  const m = String(from).match(/^(.*)<(.+)>$/);
  return m ? { name: m[1].trim(), email: m[2].trim() } : { name: 'Replyvoo', email: from };
}

async function deliver(to, msg, opts = {}) {
  const replyTo = opts.replyTo || config.mail.replyTo;
  const p = config.mail.provider;
  const key = config.mail.key;
  if (p === 'log' || !key) {
    if (!process.env.RV_QUIET) {
      console.log('[mail:' + (p === 'log' ? 'log' : 'no-key') + '] to=' + to + ' subject="' + msg.subject + '"');
      // In development, print the links so verify/reset/invite flows can be tested without an email provider.
      if (!config.isProd) (msg.html.match(/href="(https?:\/\/[^"]+)"/g) || []).map(h => h.slice(6, -1)).filter(u => u.startsWith(config.appUrl) && !/\/(legal|blog)\b/.test(u)).slice(0, 3).forEach(u => console.log('    link: ' + u.replace(/&amp;/g, '&')));
    }
    return;
  }
  let res;
  if (p === 'resend') {
    res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.mail.from, to: [to], subject: msg.subject, html: msg.html, text: msg.text, reply_to: replyTo || undefined }) });
  } else if (p === 'brevo') {
    const f = parseFrom(config.mail.from);
    res = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: f, to: [{ email: to }], subject: msg.subject, htmlContent: msg.html, textContent: msg.text, replyTo: replyTo ? { email: replyTo } : undefined }) });
  } else if (p === 'postmark') {
    res = await fetch('https://api.postmarkapp.com/email', { method: 'POST', headers: { 'X-Postmark-Server-Token': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ From: config.mail.from, To: to, Subject: msg.subject, HtmlBody: msg.html, TextBody: msg.text, ReplyTo: replyTo || undefined, MessageStream: 'outbound' }) });
  } else throw new Error('Unknown MAIL_PROVIDER ' + p);
  if (!res.ok) throw new Error('Email provider ' + p + ' returned ' + res.status + ': ' + (await res.text()).slice(0, 300));
}

// Fire-and-forget by default; returns a promise you can await in tests/admin.
function send(to, name, data = {}, opts = {}) {
  let msg;
  try { msg = build(name, data); } catch (e) { console.error('[mail] build failed', name, e.message); return Promise.resolve(false); }
  return deliver(to, msg, opts).then(() => {
    db.insert('email_log', { to_email: to, template: name, subject: msg.subject, status: 'sent', created_at: db.now() });
    return true;
  }).catch(e => {
    console.error('[mail] send failed', name, to, e.message);
    db.insert('email_log', { to_email: to, template: name, subject: msg.subject, status: 'failed', error: e.message.slice(0, 500), created_at: db.now() });
    return false;
  });
}

const SAMPLE = {
  name: 'Maya', dashboard_url: config.appUrl + '/app', verify_url: config.appUrl + '/app/verify?token=sample', reset_url: config.appUrl + '/app/reset?token=sample',
  inviter_name: 'Maya', workspace_name: 'Glow Lab', invite_url: config.appUrl + '/app/invite?token=sample', item: 'Pro plan (monthly)', amount: '149.00', currency: 'USD',
  reference: 'RV-SAMPLE-123', date: new Date().toDateString(), credits_added: '', plan: 'Pro', renew_date: new Date(Date.now() + 3 * 864e5).toDateString(),
  renew_url: config.appUrl + '/app/plan', balance: '42', topup_url: config.appUrl + '/app/wallet', credits: '2,200', wallet_url: config.appUrl + '/app/wallet',
  chats: '128', replies: '412', sales: '9', hot_leads: '12', handoffs: '2', friend: 'Lucas B.', reward: '180 credits', squad_url: config.appUrl + '/app/squad',
  closer_name: 'Ace', channel: '@glowlab_bot', studio_url: config.appUrl + '/app/studio', customer: 'Mia K.', snippet: 'I want a refund, the box was damaged',
  inbox_url: config.appUrl + '/app/inbox', code: '482913', ip: '203.0.113.24', role_name: 'Support', ref: 'T-8F2A1C', from_name: 'Mia K.', source: 'Telegram', agent_name: 'Sam', reply_html: 'Hi Mia, I’ve reset your bot connection. Try sending a message now and your Closer will answer.', ticket_url: config.appUrl + '/admin/support/T-8F2A1C', join_url: config.appUrl + '/admin/join?token=sample', joinvoo_url: 'https://joinvoo.com', phone: '+44 7700 900123', template_name: 'order_update', approved: true, reason: 'Meta did not give a reason.', channels_url: config.appUrl + '/app/inbox', manager_url: 'https://business.facebook.com/wa/manage/home/', subject: 'An update from Replyvoo', body_html: '<p>This is a sample announcement.</p>'
};

module.exports = { send, build, list, SAMPLE };
