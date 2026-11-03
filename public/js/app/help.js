/* Replyvoo dashboard: "Help" panel. Customers write to the Replyvoo team; replies from the support desk show up here.
   Opens from the Help button in the top bar, the mobile menu, or ?help=1 in the address (support emails link there). */
(function () {
  'use strict';
  const RV = window.RV;
  const { $, esc, POST, GET, toast } = RV;
  const TOPICS = [['setup', 'Setting up', 'Telegram, your AI helper, website chat'], ['billing', 'Paying', 'Plans, credits, payments'], ['other', 'Something else', 'Ideas, problems, anything']];
  let data = null; let view = 'home'; let cur = null; let topic = 'setup'; let poll = null; let answer = null; let q = '';
  const helperName = () => ((RV.S.closers || [])[0] || {}).name || 'Your AI helper';
  const firstId = () => ((RV.S.closers || [])[0] || {}).id;
  // Short answers first. The message form is the last step, not the first.
  const ANSWERS = [
    { id: 'telegram', title: 'Connect Telegram', keys: 'telegram bot botfather token connect code key', steps: () => ['Open <b>Places your AI answers</b> and tap <b>Telegram</b>.', 'Tap <b>Open BotFather</b>. BotFather is Telegram’s own helper. It has a blue tick ✓.', 'Tap <b>Start</b>, then send <b>/newbot</b>. Give it your shop name, then a username that ends in <b>bot</b>.', 'BotFather sends a long code with a colon in it. Copy it.', 'Come back and paste it. That’s it. ' + RV.esc(helperName()) + ' answers your Telegram now.'], go: ['Start the Telegram guide', '/app/channels?add=telegram'] },
    { id: 'botfather', title: 'What is BotFather?', keys: 'botfather telegram bot father blue tick what', steps: () => ['BotFather is a helper made by Telegram. It makes new bot accounts.', 'You chat with it like a person. It asks for a name and a username.', 'At the end it gives you a long code, like <b>123456789:AAH…</b>. This code is like a key. Only paste it into Replyvoo. Never share it in a chat.'], go: ['Open BotFather', 'https://t.me/BotFather'] },
    { id: 'link', title: 'Share my chat link', keys: 'chat link qr share bio instagram status free', steps: () => ['Your chat link is a free chat page. No website needed.', 'Open <b>Places your AI answers</b> and copy your chat link.', 'Put it in your Instagram bio, your WhatsApp status or print the QR code. ' + RV.esc(helperName()) + ' answers everyone who writes.'], go: ['Get my chat link', '/app/channels'] },
    { id: 'prices', title: 'Add my prices', keys: 'price prices product teach answer knowledge faq', steps: () => ['Open <b>My AI</b> and tap <b>Train</b>.', 'Go to <b>What do customers ask you?</b>', 'Tap <b>+ Add a question</b>. Write the question, like “How much is it?”, and your answer with the price.'], go: ['Teach my helper', '/app/studio?coach=3'] },
    { id: 'wrong', title: 'My AI helper said something wrong', dyn: () => helperName() + ' said something wrong', keys: 'wrong answer fix mistake bad reply correct', steps: () => ['Under every AI reply there is a button: <b>Fix this answer</b>.', 'Tap it, write the right answer, and save.', 'From now on ' + RV.esc(helperName()) + ' uses your answer. You can do this in Chats and in the test chat.'], go: ['Open my chats', '/app/inbox'] },
    { id: 'person', title: 'Talk to a customer myself', keys: 'human person reply myself take over pass handoff', steps: () => ['Open the chat in <b>Chats</b>.', 'Tap <b>I’ll reply</b>. ' + RV.esc(helperName()) + ' stops answering this chat.', 'When you are done, tap <b>Let the AI reply</b>.'], go: ['Open my chats', '/app/inbox'] },
    { id: 'website', title: 'Put chat on my website', keys: 'website site widget shopify wordpress wix code bubble', steps: () => ['Open <b>Places your AI answers</b> and tap <b>My website</b>.', 'Pick a colour, then tap <b>Copy this code</b>.', 'Paste the code on your site (we show you where on Shopify, WordPress and Wix). Website chat is in Pro, or $29 a month on any plan.'], go: ['Set up website chat', '/app/widget'] },
    { id: 'credits', title: 'How credits work', keys: 'credits credit wallet chats extra pay top up', steps: () => ['Your plan has free chats every month. One chat is one customer talking to you in a day.', 'When the free chats run out, credits pay for extra chats. 1 credit = 1 extra chat.', 'You can buy credits in <b>Plan & billing → Credits</b>, or earn them with <b>Invite & earn</b>.'], go: ['See my credits', '/app/wallet'] },
    { id: 'plan', title: 'Change my plan', keys: 'plan upgrade downgrade price billing pay', steps: () => ['Open <b>More → Plan & billing</b>.', 'Pick a plan and tap it. You can pay by card, bank or crypto. Fees are already in the price.', 'Bachs takes up to $5,000 per payment. For more, pay in parts or pick another way to pay.', 'You come straight back here when it’s done.'], go: ['See plans', '/app/plan'] },
    { id: 'renew', title: 'Auto-renew and cancelling', keys: 'renew renewal auto cancel stop card charge reminder failed declined update card grace bank crypto', steps: () => ['Card plans renew by themselves. We email you 3 days before a monthly charge (7 days before a yearly one).', 'To stop it, open <b>More → Plan & billing</b> and turn off auto-renew. One click. Your plan stays until the end of the time you paid for.', 'Card failed? Your plan keeps working for a short grace period. Tap <b>Update card</b> in Plan & billing.', 'Bank, mobile money and crypto are paid ahead and never renew by themselves.'], go: ['Open Plan & billing', '/app/plan'] }
  ];
  RV.helpAnswers = ANSWERS;

  const when = iso => { const d = new Date(iso); return new Date().toDateString() === d.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' }); };
  const status = s => s === 'solved' ? '<span class="hp-st done">Solved</span>' : s === 'pending' ? '<span class="hp-st rep">Replied</span>' : '<span class="hp-st">Open</span>';
  const textHtml = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
  const unread = () => (data ? data.tickets.reduce((n, t) => n + (t.unread || 0), 0) : 0);
  function dot() { const n = unread(); RV.qsa('[data-help-dot]').forEach(d => { d.hidden = !n; d.textContent = n ? String(n) : ''; }); }

  async function load() { data = await GET('/api/app/support'); dot(); return data; }

  function head(title, sub, back) {
    return '<div class="hp-h">' + (back ? '<button class="hp-back" data-hp="back" aria-label="Back">' + RV.ic('back', '#121110', 18, 2.4) + '</button>' : '<span class="hp-team" aria-hidden="true"><i style="background:#FFC21A"></i><i style="background:#8FB8FF"></i><i style="background:#7EE0B0"></i></span>') +
      '<div class="col" style="gap:0;min-width:0"><strong class="h3 ell">' + title + '</strong><span class="small muted">' + sub + '</span></div></div>';
  }

  function render() {
    const m = $('modalRoot') && document.querySelector('#modalRoot .modal.hp');
    if (!m) return;
    const body = m.querySelector('.hp-body');
    if (view === 'home') {
      const t = (data && data.tickets) || [];
      const ql = q.trim().toLowerCase();
      const list = ANSWERS.filter(a => !ql || (a.title + ' ' + a.keys).toLowerCase().includes(ql) || ql.split(/\s+/).some(w => w.length > 2 && a.keys.includes(w)));
      body.innerHTML = '<div class="hp-h"><span class="hp-team" aria-hidden="true"><i style="background:#FFC21A"></i><i style="background:#8FB8FF"></i><i style="background:#7EE0B0"></i></span><div class="col" style="gap:0;min-width:0"><strong class="h3">Need help?</strong><span class="small muted">Short answers first. Real people if you’re still stuck.</span></div></div>' +
        '<div class="field"><label class="lbl" for="hpQ">What do you need help with?</label><input id="hpQ" class="input" type="search" placeholder="e.g. Telegram, prices, website" value="' + esc(q) + '" autocomplete="off"></div>' +
        '<div class="hp-list" id="hpAns">' + (list.length ? list.map(a => '<button class="hp-row" data-ans="' + a.id + '"><span class="col grow" style="gap:1px;min-width:0"><strong>' + esc(a.title) + '</strong></span>' + RV.ic('right', '#121110', 16, 2.4) + '</button>').join('') : '<div class="hp-empty"><strong>No answer for that yet</strong><span class="small muted">Message us below. We’ll help.</span></div>') + '</div>' +
        (t.length ? '<button class="hp-new" data-hp="list"><span class="hp-plus">✉</span><span class="col" style="gap:0"><strong>Your messages with us</strong><span class="small muted">' + t.length + ' conversation' + (t.length === 1 ? '' : 's') + (unread() ? ' · ' + unread() + ' new' : '') + '</span></span>' + RV.ic('right', '#121110', 18, 2.4) + '</button>' : '') +
        '<button class="hp-new" data-hp="new"><span class="hp-plus">+</span><span class="col" style="gap:0"><strong>Still stuck? Message us</strong><span class="small muted">Real people. We usually reply within a few hours.</span></span>' + RV.ic('right', '#121110', 18, 2.4) + '</button>';
      const qi = $('hpQ'); qi.addEventListener('input', () => { q = qi.value; const pos = qi.selectionStart; render(); const n = $('hpQ'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* */ } } });
      return;
    }
    if (view === 'answer') {
      const a = ANSWERS.find(x => x.id === answer) || ANSWERS[0];
      const goHref = a.id === 'prices' && firstId() ? '/app/studio?id=' + firstId() + '&coach=3' : a.id === 'prices' ? '/app/closers' : a.go[1];
      const ext = /^https?:/.test(goHref);
      body.innerHTML = head(esc(a.dyn ? a.dyn() : a.title), 'Short answer', true) + '<ol class="hp-steps">' + a.steps().map(x => '<li>' + x + '</li>').join('') + '</ol>' +
        (a.id === 'telegram' || a.id === 'botfather' ? '<p class="small muted" style="margin:0">' + RV.whats('botfather', 'What is BotFather?') + '</p>' : '') +
        '<a class="btn btn-main" href="' + esc(goHref) + '"' + (ext ? ' target="_blank" rel="noopener"' : ' data-close') + ' style="justify-content:space-between">' + esc(a.go[0]) + '<span class="arr">' + RV.ic('right', '#121110', 18, 2.6) + '</span></a>' +
        '<button class="btn btn-ghost" data-hp="new">Still stuck? Message us</button>';
      return;
    }
    if (view === 'list') {
      const t = data.tickets;
      body.innerHTML = head('Your messages with us', 'Real people. We usually reply within a few hours.', true) +
        '<button class="hp-new" data-hp="new"><span class="hp-plus">+</span><span class="col" style="gap:0"><strong>Ask a question</strong><span class="small muted">Setup, billing or anything else</span></span>' + RV.ic('right', '#121110', 18, 2.4) + '</button>' +
        (t.length ? '<div class="hp-sub">Your conversations</div><div class="hp-list">' + t.map((x, i) => '<button class="hp-row a-in" style="animation-delay:' + i * 0.04 + 's" data-ref="' + esc(x.ref) + '"><span class="col grow" style="gap:1px;min-width:0"><span class="row" style="gap:8px;justify-content:space-between"><strong class="ell">' + esc(x.subject || 'Your question') + '</strong><span class="small muted">' + when(x.last_message_at) + '</span></span><span class="small muted ell">' + esc(x.last_text) + '</span><span class="row" style="gap:6px;margin-top:3px">' + status(x.status) + '<span class="small muted">' + esc(x.ref) + '</span></span></span>' + (x.unread ? '<span class="hp-st rep">New</span>' : '') + '</button>').join('') + '</div>' : '<div class="hp-empty"><strong>No conversations yet</strong><span class="small muted">Ask anything. Your questions and our replies stay here.</span></div>') +
        '<div class="hp-alt">' + (data.telegram ? '<a href="https://t.me/' + esc(data.telegram) + '" target="_blank" rel="noopener">' + RV.brandIcon('telegram', 20) + 'Message us on Telegram</a>' : '') + (data.email ? '<a href="mailto:' + esc(data.email) + '">' + RV.ic('M4 6h16v12H4zM4 7l8 6 8-6', '#121110', 18, 2) + esc(data.email) + '</a>' : '') + '</div>';
    } else if (view === 'new') {
      body.innerHTML = head('Message us', 'Tell us what happened. We reply here and by email.', true) +
        '<form class="col" id="hpForm" style="gap:14px" novalidate><div class="hp-topics" role="radiogroup" aria-label="Topic">' + TOPICS.map(x => '<button type="button" role="radio" aria-checked="' + (topic === x[0]) + '" class="hp-topic' + (topic === x[0] ? ' on' : '') + '" data-topic="' + x[0] + '"><strong>' + x[1] + '</strong><span>' + x[2] + '</span></button>').join('') + '</div>' +
        '<div class="field"><label class="lbl" for="hpSubj">Subject</label><input id="hpSubj" class="input" maxlength="120" placeholder="e.g. My helper isn’t replying"></div>' +
        '<div class="field"><label class="lbl" for="hpText">Message</label><textarea id="hpText" class="input" rows="5" maxlength="6000" placeholder="What happened, and what did you expect?"></textarea></div>' +
        '<button class="btn btn-ink" type="submit" id="hpSend" style="padding:15px">Send to the team</button></form>';
      $('hpSubj').focus();
    } else {
      const t = cur;
      body.innerHTML = head(esc(t.subject || 'Your question'), esc(t.ref) + ' · ' + (t.status === 'solved' ? 'Solved' : t.status === 'pending' ? 'We replied' : 'We’re on it'), true) +
        '<div class="hp-msgs" id="hpMsgs">' + t.messages.map(m => '<div class="hp-msg ' + (m.dir === 'in' ? 'me' : 'them') + '"><div class="hp-bub">' + textHtml(m.text) + '</div><span class="hp-mm">' + (m.dir === 'in' ? 'You' : esc(m.author_name || 'Replyvoo team') + ' · Replyvoo') + ' · ' + when(m.created_at) + '</span></div>').join('') + '</div>' +
        '<form class="hp-reply" id="hpReply" novalidate><textarea id="hpR" class="input" rows="2" maxlength="6000" placeholder="' + (t.status === 'solved' ? 'Reply to reopen this conversation…' : 'Write a reply…') + '"></textarea><button class="btn btn-ink" type="submit" id="hpRGo" aria-label="Send">' + RV.ic('M5 12h14M13 6l6 6-6 6', '#FFFFFF', 18, 2.6) + '</button></form>';
      const ms = $('hpMsgs'); ms.scrollTop = ms.scrollHeight;
      if (t.unread) { t.unread = 0; POST('/api/app/support/' + encodeURIComponent(t.ref) + '/seen').catch(() => {}); dot(); }
    }
  }

  async function open(opts) {
    opts = opts || {};
    RV.modal('<div class="hp-body"><div class="col" style="gap:12px;padding:8px 0"><div class="sk" style="height:46px;width:70%"></div><div class="sk" style="height:70px"></div><div class="sk" style="height:70px"></div></div></div>', { label: 'Help', noFocus: true, onClose: () => { clearInterval(poll); } });
    const m = document.querySelector('#modalRoot .modal'); m.classList.add('hp');
    try { await load(); } catch (e) { m.querySelector('.hp-body').innerHTML = '<p>' + esc(e.message) + '</p>'; return; }
    view = opts.ref ? 'thread' : opts.topic && ANSWERS.some(a => a.id === opts.topic) ? 'answer' : 'home';
    answer = opts.topic || null; q = '';
    if (opts.ref) cur = data.tickets.find(t => t.ref === opts.ref) || null;
    if (view === 'thread' && !cur) view = 'list';
    render();
    clearInterval(poll);
    poll = setInterval(async () => {
      if (document.hidden || view === 'new' || view === 'home' || view === 'answer') return;
      const before = JSON.stringify(cur ? cur.messages.length : 0);
      try { await load(); } catch (e) { return; }
      if (view === 'thread' && cur) { const fresh = data.tickets.find(t => t.ref === cur.ref); if (fresh && JSON.stringify(fresh.messages.length) !== before && !($('hpR') && $('hpR').value)) { cur = fresh; render(); } }
      else if (view === 'list') render();
    }, 15000);
  }
  RV.openHelp = open;

  document.addEventListener('click', async e => {
    const hb = e.target.closest('[data-help]');
    if (hb) { e.preventDefault(); RV.closePops && RV.closePops(); open({ topic: hb.getAttribute('data-help-topic') || '' }); return; }
    const m = e.target.closest('#modalRoot .modal.hp'); if (!m) return;
    const a = e.target.closest('[data-hp]');
    if (a && a.dataset.hp === 'new') { view = 'new'; render(); return; }
    if (a && a.dataset.hp === 'back') { view = view === 'thread' ? 'list' : 'home'; render(); return; }
    if (a && a.dataset.hp === 'list') { view = 'list'; render(); return; }
    const an = e.target.closest('[data-ans]'); if (an) { answer = an.getAttribute('data-ans'); view = 'answer'; render(); return; }
    const tp = e.target.closest('[data-topic]'); if (tp) { topic = tp.dataset.topic; RV.qsa('.hp-topic').forEach(b => { const on = b === tp; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); return; }
    const r = e.target.closest('[data-ref]'); if (r) { cur = data.tickets.find(t => t.ref === r.dataset.ref); view = 'thread'; render(); }
  });
  document.addEventListener('submit', async e => {
    if (e.target.id === 'hpForm') {
      e.preventDefault();
      const text = $('hpText').value.trim();
      if (text.length < 3) { $('hpText').focus(); toast('Type a few words so we know how to help.', 'err'); return; }
      const btn = $('hpSend'); RV.busy(btn, true, 'Sending…');
      try { const r = await POST('/api/app/support', { topic, subject: $('hpSubj').value.trim(), text, page: RV.parse().name }); await load(); cur = data.tickets.find(t => t.ref === r.ticket.ref) || r.ticket; view = 'thread'; render(); toast('Sent! We’ll reply here and by email.'); RV.confetti && RV.confetti(18); }
      catch (er) { RV.busy(btn, false); RV.fail(er); }
    }
    if (e.target.id === 'hpReply') {
      e.preventDefault();
      const ta = $('hpR'); const text = ta.value.trim(); if (!text) { ta.focus(); return; }
      const btn = $('hpRGo'); btn.disabled = true;
      try { const r = await POST('/api/app/support/' + encodeURIComponent(cur.ref) + '/reply', { text }); cur = r.ticket; const i = data.tickets.findIndex(t => t.ref === cur.ref); if (i >= 0) data.tickets[i] = cur; render(); }
      catch (er) { btn.disabled = false; RV.fail(er); }
    }
  });
  document.addEventListener('keydown', e => { if (e.target && e.target.id === 'hpR' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('hpReply').requestSubmit(); } });

  // Quiet check for replies so the Help button can show a dot.
  RV.checkHelp = () => load().catch(() => {});
  // ?help=1 (links in support emails): open the panel once the dashboard is on screen, then tidy the address.
  if (/[?&]help=1\b/.test(location.search)) {
    let tries = 0;
    const t = setInterval(() => {
      if (++tries > 60) return clearInterval(t);
      if (!document.getElementById('helpBtn')) return;
      clearInterval(t);
      try { const u = new URL(location.href); u.searchParams.delete('help'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) { /* ignore */ }
      open();
    }, 150);
  }
})();
