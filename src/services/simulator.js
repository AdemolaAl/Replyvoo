'use strict';
// Demo simulator: feeds realistic customer chats into the demo workspace so the dashboard looks alive
// on a staging/demo server. Enable with DEMO_SIMULATOR=true. Never enable it on a real customer server.
const db = require('../db');
const engine = require('./engine');

const PEOPLE = [
  ['Lena Fischer', 'lenaf'], ['Marco Rossi', 'marcor'], ['Nora Lindqvist', 'noral'], ['Diego Alvarez', 'diegoa'], ['Sofia Petrova', 'sofiap'],
  ['Kenji Sato', 'kenjis'], ['Hannah Weber', 'hannahw'], ['Lucas Martin', 'lucasm'], ['Priya Nair', 'priyan'], ['Omar Haddad', 'omarh'],
  ['Emma Larsen', 'emmal'], ['Mateo Silva', 'mateos'], ['Chloe Dubois', 'chloed'], ['Noah Becker', 'noahb'], ['Yara Mansour', 'yaram']
];
const LINES = [
  'Hi, how much is the starter bundle?', 'Do you deliver this week?', 'Is the large size in stock?', 'Can I pay by bank transfer?',
  'Send me the payment link please', 'What is included in the premium plan?', 'Do you have a discount for 2?', 'I want to order one',
  'How long does shipping take?', 'Can I talk to a human?', 'Is there a warranty?', 'Thanks! Just paid', 'Do you ship to Kenya?'
];
const pick = a => a[Math.floor(Math.random() * a.length)];

async function step() {
  if (Math.random() < 0.4) return;
  const w = db.one('SELECT w.id FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE u.email = \'demo@replyvoo.com\'');
  if (!w) return;
  const ch = db.one('SELECT * FROM channels WHERE workspace_id = ? AND type = \'telegram_bot\' AND status = \'active\' ORDER BY id LIMIT 1', w.id);
  if (!ch) return;
  const [name, username] = pick(PEOPLE);
  const id = 900000 + PEOPLE.findIndex(p => p[1] === username);
  await engine.handleInbound({ channel: ch, chatId: id, from: { id, name, username, lang: 'en' }, text: pick(LINES), kind: 'text' });
}

module.exports = { step };
