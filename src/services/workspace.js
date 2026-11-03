'use strict';
// Workspaces, plans, usage counting (per conversation), credits ledger, live events.
const db = require('../db');
const settings = require('./settings');
const { refCode } = require('../lib/security');

const DAY = 864e5;

function plan(id) {
  const p = db.one('SELECT * FROM plans WHERE id = ?', id) || db.one('SELECT * FROM plans WHERE id = ?', settings.get('billing').free_plan_id) || db.one('SELECT * FROM plans ORDER BY price_month LIMIT 1');
  return p ? decoratePlan(p) : null;
}
function decoratePlan(p) {
  const offer = db.json(p.offer, {});
  const offerOn = offer && offer.percent > 0 && (!offer.ends_at || new Date(offer.ends_at) > new Date());
  return { ...p, features: db.json(p.features, []), offer: offerOn ? offer : null, popular: !!p.popular, elite: !!p.elite, contact_sales: !!p.contact_sales, active: !!p.active };
}
function publicPlans() { return db.all('SELECT * FROM plans WHERE active = 1 ORDER BY sort, price_month').map(decoratePlan); }

function createWorkspace(owner, name, extra = {}) {
  const free = settings.get('billing').free_plan_id;
  const t = Date.now();
  let code; do { code = refCode(); } while (db.one('SELECT id FROM workspaces WHERE ref_code = ?', code));
  const id = db.insert('workspaces', {
    name: name || 'My business', owner_id: owner.id, plan_id: free, plan_interval: 'month',
    period_start: new Date(t).toISOString(), period_end: new Date(t + 30 * DAY).toISOString(),
    ref_code: code, referred_by: extra.referred_by || null, settings: JSON.stringify(extra.settings || {}), created_at: db.now()
  });
  db.insert('members', { workspace_id: id, user_id: owner.id, role: 'owner', created_at: db.now() });
  const b = settings.get('billing');
  const invited = !!(extra.referred_by || extra.invited);
  const bonus = (b.signup_bonus_credits || 0) + (invited ? (b.referee_bonus_credits || 0) : 0);
  if (bonus > 0) addCredits(id, bonus, invited ? 'Welcome bonus (invited by a friend)' : 'Welcome bonus');
  return get(id);
}

function get(id) { const w = db.one('SELECT * FROM workspaces WHERE id = ?', id); return w ? { ...w, settings: db.json(w.settings, {}) } : null; }
function saveSettings(id, patch) { const w = get(id); db.update('workspaces', id, { settings: JSON.stringify({ ...w.settings, ...patch }) }); }

// Roll free periods and expire paid ones.
function ensurePeriod(w) {
  if (!w) return w;
  const t = Date.now();
  if (new Date(w.period_end).getTime() > t) {
    // Periods longer than a month (yearly plans, early renewals): the allowance resets every 30 days.
    const base = new Date(w.usage_reset_at || w.period_start).getTime();
    if (Number.isFinite(base) && new Date(w.period_end).getTime() - base > 32 * DAY) {
      if (t - base >= 30 * DAY) {
        const cycles = Math.floor((t - base) / (30 * DAY));
        db.update('workspaces', w.id, { conv_used: 0, pro_used: 0, usage_reset_at: new Date(base + cycles * 30 * DAY).toISOString() });
        return get(w.id);
      }
    }
    return w;
  }
  const p = plan(w.plan_id);
  const free = settings.get('billing').free_plan_id;
  const patch = { conv_used: 0, pro_used: 0, period_start: new Date(t).toISOString(), period_end: new Date(t + 30 * DAY).toISOString(), plan_interval: 'month', usage_reset_at: null };
  let expired = null;
  if (p && p.price_month > 0) { patch.plan_id = free; expired = p; }
  db.update('workspaces', w.id, patch);
  if (expired) {
    event(w.id, 'plan', 'Your ' + expired.name + ' plan ended. You are on the free plan now.', {});
    require('./voosquare').safeEmit(w.id, 'plan_cancelled', { planId: expired.id, periodEnd: w.period_end });
    require('./notify').planExpired(w.id, expired);
  }
  return get(w.id);
}

function limits(w) {
  const p = plan(w.plan_id);
  const slots = (w.settings.slots || []).filter(s => new Date(s.exp) > new Date()).length;
  // Website chat: sites included in the plan + active "Website chat" power-ups (30 days each).
  const webSlots = (w.settings.web_slots || []).filter(s => new Date(s.exp) > new Date()).length;
  return {
    plan: p, closers: (p ? p.closers : 1) + (w.extra_closer_slots || 0) + slots, conversations: p ? p.conversations : 50,
    seats: (p ? p.seats : 1) + (w.extra_seats || 0) + (w.settings.seat_slots || []).filter(s => new Date(s.exp) > new Date()).length, pro: p ? p.pro_brain_chats : 0,
    website_sites: (p ? p.website_sites || 0 : 0) + webSlots, website_slots: webSlots,
    remove_branding: !!(p && p.remove_branding), custom_css: !!(p && p.custom_css)
  };
}

// Closers beyond the plan's limit (after a downgrade or an expired power-up) stay saved but stop replying.
// The oldest Closers keep working, the same way website sites are ranked.
function closerUnlocked(closer) {
  const w = get(closer.workspace_id);
  if (!w) return false;
  const ids = db.all('SELECT id FROM closers WHERE workspace_id = ? ORDER BY id', w.id).map(r => r.id);
  const idx = ids.indexOf(closer.id);
  return idx >= 0 && idx < limits(w).closers;
}

function usage(w) {
  w = ensurePeriod(w);
  const l = limits(w);
  return {
    plan: l.plan, period_start: w.period_start, period_end: w.period_end, interval: w.plan_interval,
    conversations: { used: w.conv_used, included: l.conversations, left: Math.max(0, l.conversations - w.conv_used) },
    credits: w.credits, closers_limit: l.closers, seats_limit: l.seats, pro: { used: w.pro_used, included: l.pro },
    closers_used: db.one('SELECT COUNT(*) n FROM closers WHERE workspace_id = ?', w.id).n,
    seats_used: db.one('SELECT COUNT(*) n FROM members WHERE workspace_id = ?', w.id).n,
    website: { sites: l.website_sites, used: db.one('SELECT COUNT(*) n FROM channels WHERE workspace_id = ? AND type = \'website\' AND status = \'active\' AND COALESCE(json_extract(data, \'$.link\'), 0) = 0', w.id).n, slots: l.website_slots, remove_branding: l.remove_branding, custom_css: l.custom_css }
  };
}

function addCredits(wsId, amount, reason, ref = '') {
  return db.tx(() => {
    const w = db.one('SELECT credits FROM workspaces WHERE id = ?', wsId);
    const bal = Math.max(0, (w ? w.credits : 0) + Math.round(amount));
    db.run('UPDATE workspaces SET credits = ? WHERE id = ?', bal, wsId);
    db.insert('credit_tx', { workspace_id: wsId, amount: Math.round(amount), balance: bal, reason, ref, created_at: db.now() });
    return bal;
  });
}
function spendCredits(wsId, amount, reason, ref = '') {
  return db.tx(() => {
    const w = db.one('SELECT credits FROM workspaces WHERE id = ?', wsId);
    if (!w || w.credits < amount) return false;
    addCredits(wsId, -amount, reason, ref);
    return true;
  });
}

// Called before an AI reply. Decides whether a new billable conversation starts and pays for it.
function chargeForReply(wsId, thread, opts = {}) {
  return db.tx(() => {
    let w = ensurePeriod(get(wsId));
    const b = settings.get('billing');
    const l = limits(w);
    const windowMs = (b.conversation_window_hours || 24) * 3600e3;
    const expired = !thread.window_start || Date.now() - new Date(thread.window_start).getTime() > windowMs;
    const needNew = expired || thread.unit_replies >= (b.conversation_reply_limit || 10);
    if (!needNew) return { ok: true, newUnit: false };
    let credits = 0;
    let fromPlan = false;
    if (w.conv_used < l.conversations) fromPlan = true; else credits += 1;
    let proFromPlan = false;
    if (opts.pro) { if (w.pro_used < l.pro) proFromPlan = true; else credits += (b.pro_brain_extra_credits || 1); }
    if (credits > 0 && w.credits < credits) return { ok: false, reason: 'no_credits' };
    if (fromPlan) db.run('UPDATE workspaces SET conv_used = conv_used + 1 WHERE id = ?', w.id);
    if (proFromPlan) db.run('UPDATE workspaces SET pro_used = pro_used + 1 WHERE id = ?', w.id);
    if (credits > 0) addCredits(w.id, -credits, opts.pro && !proFromPlan ? 'Extra conversation (Pro Brain)' : 'Extra conversation', 'thread:' + thread.id);
    const prev = { window_start: thread.window_start || null, unit_replies: thread.unit_replies || 0 };
    // A new conversation always starts a fresh window (also when it started because the reply limit was reached).
    const startedAt = db.now();
    db.run('UPDATE threads SET window_start = ?, unit_replies = 0, units = units + 1 WHERE id = ?', startedAt, thread.id);
    thread.unit_replies = 0; thread.window_start = startedAt;
    w = get(w.id);
    const lowAt = b.low_credit_threshold || 50;
    if (!fromPlan && w.credits <= lowAt) require('./notify').lowCredits(w);
    return { ok: true, newUnit: true, credits, fromPlan, proFromPlan, prev, threadId: thread.id };
  });
}
// Undo a charge when the reply it paid for never reached the customer (AI or Telegram failure).
function refundCharge(wsId, charge) {
  if (!charge || !charge.newUnit) return;
  db.tx(() => {
    if (charge.fromPlan) db.run('UPDATE workspaces SET conv_used = MAX(0, conv_used - 1) WHERE id = ?', wsId);
    if (charge.proFromPlan) db.run('UPDATE workspaces SET pro_used = MAX(0, pro_used - 1) WHERE id = ?', wsId);
    if (charge.credits > 0) addCredits(wsId, charge.credits, 'Refund: reply not delivered', 'thread:' + charge.threadId);
    db.run('UPDATE threads SET window_start = ?, unit_replies = ?, units = MAX(0, units - 1) WHERE id = ?', charge.prev.window_start, charge.prev.unit_replies, charge.threadId);
  });
}
function commitReply(threadId) { db.run('UPDATE threads SET unit_replies = unit_replies + 1 WHERE id = ?', threadId); }

function event(wsId, type, text, data = {}) {
  db.insert('events', { workspace_id: wsId, type, text: String(text).slice(0, 300), data: JSON.stringify(data), created_at: db.now() });
}

function memberRole(wsId, userId) { const m = db.one('SELECT role FROM members WHERE workspace_id = ? AND user_id = ?', wsId, userId); return m ? m.role : null; }
function owner(wsId) { return db.one('SELECT u.* FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE w.id = ?', wsId); }

module.exports = { plan, decoratePlan, publicPlans, createWorkspace, get, saveSettings, ensurePeriod, limits, closerUnlocked, usage, addCredits, spendCredits, chargeForReply, refundCharge, commitReply, event, memberRole, owner, DAY };
