'use strict';
// Blasts: audiences and the sender that runs in the background scheduler.
const db = require('../db');
const tg = require('./telegram');
const wa = require('./whatsapp');
const ws = require('./workspace');
const { decrypt } = require('../lib/security');

const BASE = 'SELECT DISTINCT t.id thread_id, t.chat_id, t.channel_id FROM threads t JOIN contacts c ON c.id = t.contact_id JOIN channels ch ON ch.id = t.channel_id ' +
  'WHERE t.workspace_id = ? AND ch.type = \'telegram_bot\' AND ch.status = \'active\' AND t.business_connection_id = \'\' AND c.blocked = 0 AND t.chat_id NOT LIKE \'-%\'';
// WhatsApp: everyone who wrote to a connected number, except people who replied STOP.
const WA_BASE = 'SELECT DISTINCT t.id thread_id, t.chat_id, t.channel_id FROM threads t JOIN contacts c ON c.id = t.contact_id JOIN channels ch ON ch.id = t.channel_id ' +
  'WHERE t.workspace_id = ? AND ch.type = \'whatsapp\' AND ch.status = \'active\' AND c.blocked = 0 AND c.opt_out_at IS NULL';

function segmentRecipients(wsId, seg, channel = 'telegram') {
  const base = channel === 'whatsapp' ? WA_BASE : BASE;
  if (seg === 'hot') return db.all(base + ' AND c.heat = \'hot\'', wsId);
  if (seg === 'no_buy') return db.all(base + ' AND c.stage IN (\'qualified\',\'checkout\')', wsId);
  if (seg === 'quiet') return db.all(base + ' AND c.last_seen < ?', wsId, new Date(Date.now() - 7 * 864e5).toISOString());
  if (seg === 'won') return db.all(base + ' AND c.stage = \'won\'', wsId);
  return db.all(base, wsId);
}
// How many WhatsApp customers are left out because they replied STOP.
function optedOut(wsId) { return db.one('SELECT COUNT(DISTINCT c.id) n FROM contacts c JOIN channels ch ON ch.id = c.channel_id WHERE c.workspace_id = ? AND ch.type = \'whatsapp\' AND c.opt_out_at IS NOT NULL', wsId).n; }

// Only charge for people the Blast actually reached: refund credits for the rest.
function refundUnsent(b, sent) {
  const per = require('./settings').get('billing').blast_people_per_credit || 10;
  const used = Math.min(b.credits, Math.ceil(sent / per));
  const refund = Math.max(0, b.credits - used);
  if (refund > 0) ws.addCredits(b.workspace_id, refund, 'Blast refund (' + (b.total - sent) + ' not reached)', 'blast:' + b.id);
  return refund;
}

const running = new Set();
async function runDue() {
  const due = db.all('SELECT * FROM blasts WHERE status = \'queued\' AND scheduled_at <= ? ORDER BY id LIMIT 3', db.now());
  for (const b of due) {
    if (running.has(b.id)) continue;
    running.add(b.id);
    db.update('blasts', b.id, { status: 'sending' });
    let sent = 0, failed = 0;
    try {
      // Never send to more people than the Blast was paid for.
      const isWa = b.channel === 'whatsapp';
      // Recipients are read again at send time, so anyone who replied STOP since scheduling is skipped.
      const rec = segmentRecipients(b.workspace_id, b.segment, isWa ? 'whatsapp' : 'telegram').slice(0, b.total || undefined);
      const tokens = new Map();
      const tpl = isWa ? db.one('SELECT * FROM wa_templates WHERE id = ? AND workspace_id = ?', b.template_id, b.workspace_id) : null;
      if (isWa && (!tpl || tpl.status !== 'APPROVED')) throw new Error('The WhatsApp template is missing or no longer approved');
      const vars = db.json(b.template_vars, []);
      for (const r of rec) {
        if (!tokens.has(r.channel_id)) { const ch = db.one('SELECT token_enc FROM channels WHERE id = ?', r.channel_id); tokens.set(r.channel_id, ch ? decrypt(ch.token_enc) : ''); }
        const tok = tokens.get(r.channel_id);
        if (!tok) { failed++; continue; }
        try {
          const thread = db.one('SELECT * FROM threads WHERE id = ?', r.thread_id);
          if (isWa) {
            const ch = db.one('SELECT * FROM channels WHERE id = ?', r.channel_id);
            const contact = db.one('SELECT * FROM contacts WHERE id = ?', thread.contact_id);
            const out = await wa.sendRaw(ch, tok, r.chat_id, wa.templateMsg(tpl, vars, contact));
            const id = require('./engine').addMessage(thread, 'out', 'system', wa.renderTemplate(tpl, vars, contact), 'template', { blast_id: b.id, template: tpl.name, template_id: tpl.id, category: tpl.category, message_id: out.message_id });
            wa.track(out.message_id, ch.id, id);
          } else {
            await tg.sendText(tok, r.chat_id, b.message);
            require('./engine').addMessage(thread, 'out', 'system', b.message, 'text', { blast_id: b.id });
          }
          sent++;
        } catch (e) {
          if (isWa && Number(e.code) === 131050) db.run('UPDATE contacts SET opt_out_at = COALESCE(opt_out_at, ?) WHERE id = (SELECT contact_id FROM threads WHERE id = ?)', db.now(), r.thread_id);
          if (isWa && Number(e.code) === 130429) await new Promise(res => setTimeout(res, 2000));
          if (e.retryAfter) await new Promise(res => setTimeout(res, (e.retryAfter + 1) * 1000));
          failed++;
          if (!isWa && e.code === 403) db.run('UPDATE contacts SET blocked = 1 WHERE id = (SELECT contact_id FROM threads WHERE id = ?)', r.thread_id);
        }
        if ((sent + failed) % 20 === 0) { db.update('blasts', b.id, { sent, failed }); await new Promise(res => setTimeout(res, 1100)); }
      }
      const refund = refundUnsent(b, sent);
      db.update('blasts', b.id, { status: sent ? 'sent' : 'failed', sent, failed, total: rec.length, credits: b.credits - refund });
      ws.event(b.workspace_id, 'blast', (sent ? 'Blast sent to ' + sent + ' people' + (failed ? ' (' + failed + ' could not be reached)' : '') : 'Blast could not be delivered to anyone') + (refund ? '. ' + refund + ' credit' + (refund > 1 ? 's' : '') + ' refunded.' : ''), { blast_id: b.id });
    } catch (e) {
      console.error('[blast]', e.message);
      let refund = 0;
      try { refund = refundUnsent(b, sent); } catch (e2) { console.error('[blast] refund', e2.message); }
      db.update('blasts', b.id, { status: 'failed', sent, failed, credits: b.credits - refund });
    } finally { running.delete(b.id); }
  }
}

module.exports = { segmentRecipients, optedOut, runDue };
