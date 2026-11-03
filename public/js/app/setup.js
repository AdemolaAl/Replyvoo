/* Replyvoo dashboard: the first-5-minutes path (/app/start). Step 1 is sign-up (auth.js). Here:
   2 "What do you sell?" → makes the AI helper + starter answers   3 "Say hi to <name>" → test chat with Fix this answer
   4 "Where do your customers message you?" → chat link (QR, live first reply), Telegram, WhatsApp or website.
   One main button per screen, in a bar stuck to the bottom. No menu until it's done. */
(function () {
  'use strict';
  const RV = window.RV;
  const { $, esc, GET, POST, PUT, toast, fail, go, ic } = RV;
  const S = RV.S;

  const ASK = ['How much is it?', 'Do you deliver?', 'Can I talk to a person?'];
  const STARTERS = [['How much is it?', 'Our prices start at ___.'], ['Do you deliver?', 'Yes, we deliver to ___.'], ['How do I pay?', 'You can pay by ___.']];
  const SU = { step: 2, sells: '', answers: STARTERS.map(x => x[1]), closer: null, chat: [], view: 'pick', channel: null, after: 0, timer: null, thread: null, reply: null, cust: null };

  RV.needsSetup = () => !!(S.boot && S.boot.setup && !S.boot.setup.done && RV.isManager());
  const name = () => (SU.closer && SU.closer.name) || 'your helper';

  function frame(step, body, bar) {
    return '<div class="fr" id="frRoot"><header class="fr-top"><a class="logo" href="/" aria-label="Replyvoo website">' + RV.LOGO + '<span class="logo-word">Replyvoo</span></a>' +
      '<span class="fr-step">' + (step ? 'Step ' + step + ' of 4' : 'All done') + '</span><button type="button" class="help-pill" data-help>' + ic('info', 'currentColor', 15, 2.4) + 'Need help?</button></header>' +
      (step ? '<div class="su-bars fr-bars" aria-hidden="true" style="grid-template-columns:repeat(4,minmax(0,1fr))">' + [1, 2, 3, 4].map(i => '<span class="' + (i < step ? 'done' : i === step ? 'cur' : '') + '"></span>').join('') + '</div>' : '') +
      '<main class="fr-main" id="main">' + body + '</main>' + (bar ? '<div class="fr-bar">' + bar + '</div>' : '') + '</div>';
  }
  const H = (t, s) => '<div class="col" style="gap:6px"><h1 class="su-h fr-h">' + t + '</h1>' + (s ? '<p class="fr-sub">' + s + '</p>' : '') + '</div>';
  const err = id => '<div class="err" id="' + id + '" role="alert" hidden></div>';
  const showErr = (id, msg) => { const e = $(id); if (e) { e.textContent = msg; e.hidden = !msg; } };

  async function saveStep(step, done) { try { const r = await POST('/api/app/setup', { step, done: !!done }); if (S.boot) S.boot.setup = r.setup; } catch (e) { /* keep going */ } }
  async function finish(to) { stopWait(); await saveStep(4, true); RV.S.boot = null; const after = RV.store.get('after_setup', null); if (after) { RV.store.set('after_setup', null); if (!to || to === '/app') to = after; } go(to || '/app', { replace: true }); }
  RV.finishSetup = finish;

  /* ---------- step 2: what do you sell ---------- */
  function step2(root) {
    root.innerHTML = frame(2, '<form id="frSell" class="col a-in" style="gap:18px" novalidate>' + H('What do you sell?', 'One line is enough. Your helper will learn more later.') +
      '<div class="field"><label class="lbl" for="frSellIn">What you sell</label><textarea id="frSellIn" class="input" rows="3" maxlength="300" placeholder="Flowers and bouquets. Delivery in the city.">' + esc(SU.sells) + '</textarea></div>' +
      '<div class="col" style="gap:10px"><span class="lbl">Three quick answers <span class="muted" style="font-weight:600">(optional)</span></span><p class="small muted" style="margin:-4px 0 0">Fill in the ___ so your helper can answer right away.</p>' +
      STARTERS.map((q, i) => '<div class="fr-qa"><label class="fr-q" for="frA' + i + '">“' + esc(q[0]) + '”</label><input id="frA' + i + '" class="input" maxlength="300" value="' + esc(SU.answers[i]) + '"></div>').join('') + '</div>' + err('frErr') + '</form>',
      '<button type="submit" form="frSell" class="btn btn-main fr-go" id="frNext">Next' + arrow() + '</button><button type="button" class="btn-link fr-skip" id="frSkip">Skip for now</button>');
    const blank = $('frA0'); if (blank) RV.qsa('.fr-qa input').forEach(inp => inp.addEventListener('focus', () => { const p = inp.value.indexOf('___'); if (p >= 0) setTimeout(() => inp.setSelectionRange(p, p + 3), 0); }));
    $('frSell').addEventListener('submit', async e => { e.preventDefault(); await saveHelper(false); });
    $('frSkip').addEventListener('click', () => saveHelper(true));
    setTimeout(() => { const t = $('frSellIn'); if (t && window.innerWidth > 700) t.focus(); }, 60);
  }
  async function saveHelper(skip) {
    SU.sells = ($('frSellIn').value || '').trim();
    SU.answers = STARTERS.map((q, i) => ($('frA' + i).value || '').trim());
    if (!skip && !SU.sells) { showErr('frErr', 'Type one line about what you sell. Or tap “Skip for now”.'); $('frSellIn').focus(); return; }
    const b = $('frNext'); RV.busy(b, true, 'Making your helper…');
    try {
      SU.closer = await POST('/api/app/setup/helper', { sells: skip ? '' : SU.sells, answers: skip ? [] : STARTERS.map((q, i) => ({ question: q[0], answer: SU.answers[i] })) });
      await RV.loadClosers(true).catch(() => {});
      SU.step = 3; SU.chat = []; render();
    } catch (er) { RV.busy(b, false); showErr('frErr', er.code === 'closer_limit' ? 'You already have the most AI helpers your plan allows. Tap Skip for now.' : er.message); }
  }

  /* ---------- step 3: say hi ---------- */
  function step3(root) {
    const c = SU.closer, color = (c.persona && c.persona.color) || RV.tpl(c.template).color;
    root.innerHTML = frame(3, '<div class="col a-in" style="gap:14px"><div class="col" style="gap:6px"><h1 class="su-h fr-h" id="frHi">Say hi to <span id="frName">' + esc(c.name) + '</span> <button type="button" class="fr-pen" id="frRename" aria-label="Change the name">' + ic('pen', '#121110', 16, 2.2) + '</button></h1><p class="fr-sub">Pretend you are a customer. Type a question.</p></div>' +
      '<section class="fr-chat" aria-label="Test chat"><div class="fr-chat-h"><span style="flex:0 0 34px">' + RV.closerBot(color, 34, c.name.charAt(0)) + '</span><span class="col" style="gap:0;line-height:1.2;min-width:0"><strong class="ell">Test chat</strong><span class="small muted">Only you can see this</span></span></div>' +
      '<div class="fr-msgs" id="frMsgs" aria-live="polite"></div><div class="fr-ask" id="frAsk">' + ASK.map(q => '<button type="button" class="chip" data-ask="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>' +
      '<form id="frChatF" class="fr-compose" autocomplete="off" novalidate><label class="sr" for="frIn">Your question</label><input id="frIn" class="input" placeholder="Ask like a customer…" maxlength="500"><button class="btn btn-ink" type="submit" aria-label="Send">' + ic('send', '#FFC21A', 18, 2.2) + '</button></form></section></div>',
      '<button type="button" class="btn btn-main fr-go" id="frNext">It looks good. Next' + arrow() + '</button>');
    paintChat();
    $('frChatF').addEventListener('submit', e => { e.preventDefault(); const v = $('frIn').value.trim(); if (!v) { $('frIn').focus(); return; } $('frIn').value = ''; ask(v); });
    root.querySelectorAll('[data-ask]').forEach(b => b.addEventListener('click', () => ask(b.getAttribute('data-ask'))));
    $('frMsgs').addEventListener('click', e => { const f = e.target.closest('[data-fix]'); if (f) fix(+f.getAttribute('data-fix')); });
    $('frRename').addEventListener('click', rename);
    $('frNext').addEventListener('click', async () => { SU.step = 4; SU.view = 'pick'; await saveStep(4); render(); });
  }
  function paintChat() {
    const el = $('frMsgs'); if (!el) return;
    el.innerHTML = SU.chat.length ? SU.chat.map((m, i) => m.role === 'note' ? '<div class="bub-note">' + esc(m.text) + '</div>' : m.role === 'user' ? '<div class="bub-me">' + esc(m.text) + '</div>' :
      '<div class="bub-in fr-ai">' + esc(m.text) + '</div>' + (m.fixed ? '<span class="small" style="color:#14532D;font-weight:800">✓ Answer saved</span>' : '<button type="button" class="bub-fix" data-fix="' + i + '">✎ Fix this answer</button>')).join('')
      : '<p class="small muted fr-empty">Tap a question below, or type your own.</p>';
    el.scrollTop = el.scrollHeight;
  }
  async function ask(text) {
    SU.chat.push({ role: 'user', text }); paintChat();
    const el = $('frMsgs'); el.insertAdjacentHTML('beforeend', '<div class="bub-in" id="frTyping">Typing…</div>'); el.scrollTop = el.scrollHeight;
    try {
      const history = SU.chat.filter(m => m.role !== 'note').slice(-8, -1).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text }));
      const r = await POST('/api/app/closers/preview', { closer_id: SU.closer.id, name: SU.closer.name, template: SU.closer.template, persona: SU.closer.persona, skills: SU.closer.skills, knowledge: SU.closer.knowledge, rules: SU.closer.rules, pay_link: SU.closer.pay_link, message: text, history });
      SU.chat.push({ role: 'ai', text: r.text, q: text, handoff: r.handoff, used: !!r.used });
      if (r.handoff && /person|human|someone|talk to/i.test(text)) SU.chat.push({ role: 'note', text: name() + ' will pass chats like this to you. You’ll see them in Chats.' });
      else if (r.handoff || (!r.used && /\?|how|what|do you|can i/i.test(text))) SU.chat.push({ role: 'note', text: name() + ' didn’t know that yet. Tap “Fix this answer” to teach it.' });
    } catch (e) { SU.chat.pop(); fail(e); }
    paintChat();
  }
  function fix(i) {
    const m = SU.chat[i]; if (!m) return;
    RV.fixAnswer({ closerId: SU.closer.id, closerName: SU.closer.name, color: RV.tpl(SU.closer.template).color, question: m.q, answer: m.text, onSaved: () => { m.fixed = true; SU.chat.push({ role: 'note', text: 'Saved. Ask it again to see the new answer.' }); paintChat(); } });
  }
  function rename() {
    RV.modal('<form id="rnF" class="col" style="gap:14px" novalidate><strong class="h3">Give your helper a name</strong><div class="field"><label class="lbl" for="rnIn">Name</label><input id="rnIn" class="input" maxlength="40" value="' + esc(SU.closer.name) + '"><span class="hint">Customers see this name. Short and friendly is best.</span></div>' + err('rnErr') + '<button class="btn btn-ink" type="submit" id="rnGo">Save name</button></form>', { label: 'Rename your helper' });
    $('rnF').addEventListener('submit', async e => {
      e.preventDefault(); const v = $('rnIn').value.trim();
      if (!v) { showErr('rnErr', 'Type a name first.'); return; }
      const b = $('rnGo'); RV.busy(b, true);
      try { SU.closer = await PUT('/api/app/closers/' + SU.closer.id, { name: v }); RV.closeModal(); $('frName').textContent = SU.closer.name; RV.loadClosers(true).catch(() => {}); toast('Name saved'); }
      catch (er) { RV.busy(b, false); showErr('rnErr', er.message); }
    });
  }

  /* ---------- step 4: where customers message you ---------- */
  function step4(root) {
    if (SU.view === 'link' || SU.view === 'tg') return waitView(root);
    if (SU.view === 'won') return wonView(root);
    const wa = RV.chan('whatsapp') === 'live', web = RV.chan('website') === 'live';
    const card = (id, icon, title, sub, tag) => '<button type="button" class="fr-place" data-place="' + id + '">' + icon + '<span class="col grow" style="gap:2px;min-width:0;text-align:left"><strong>' + title + (tag ? ' <span class="fr-tag">' + tag + '</span>' : '') + '</strong><span>' + sub + '</span></span>' + ic('right', '#121110', 18, 2.6) + '</button>';
    root.innerHTML = frame(4, '<div class="col a-in" style="gap:16px">' + H('Where do your customers message you?', 'Pick one. You can add more later.') +
      '<div class="col" style="gap:10px">' +
      card('link', '<span class="fr-ic">' + ic('link', '#121110', 22, 2.4) + '</span>', 'A chat link', 'Easiest. Share it anywhere. Ready now.', 'Free') +
      card('telegram', RV.brandIcon('telegram', 44), 'Telegram', esc(name()) + ' answers your Telegram. Takes about 3 minutes.') +
      (wa ? card('whatsapp', RV.brandIcon('whatsapp', 44), 'WhatsApp', 'Your WhatsApp Business number. Takes about 5 minutes.') : '') +
      (web ? card('website', RV.brandIcon('website', 44), 'My website', 'A chat bubble on your site.') : '') + '</div>' + err('frErr') +
      '<button type="button" class="btn-link fr-skip" id="frLater" style="align-self:center">I’ll do this later</button></div>',
      '<button type="button" class="btn btn-main fr-go" data-place="link">Use the chat link' + arrow() + '</button>');
    root.querySelectorAll('[data-place]').forEach(b => b.addEventListener('click', () => pick(b.getAttribute('data-place'), b)));
    $('frLater').addEventListener('click', () => finish('/app'));
  }
  async function pick(where, btn) {
    if (where === 'link') {
      RV.busy(btn, true, 'Making your link…');
      try { SU.channel = await POST('/api/app/channels/link', {}); RV.loadChannels(true).catch(() => {}); SU.view = 'link'; await startWait(); render(); }
      catch (e) { RV.busy(btn, false); showErr('frErr', e.message); }
      return;
    }
    if (where === 'telegram') {
      if (!RV.tgWizard) { finish('/app/channels'); return; }
      RV.tgWizard({ skipDone: true, onDone: async ch => { SU.channel = ch; SU.view = 'tg'; await startWait(); render(); } });
      return;
    }
    if (where === 'whatsapp') { finish('/app/channels?add=whatsapp'); return; }
    if (where === 'website') { if (RV.webCanAdd && RV.webCanAdd()) finish('/app/widget?new=1'); else if (RV.websiteLocked) RV.websiteLocked(); return; }
  }

  // Waiting for the first real message: poll the live feed, show the customer's message and the AI reply as they land.
  async function startWait() {
    stopWait();
    SU.reply = null; SU.cust = null; SU.thread = null;
    try { const r = await GET('/api/app/live?after=0&after_msg=0'); SU.after = r.messages.length ? r.messages[0].id : 0; } catch (e) { SU.after = 0; }
    SU.timer = setInterval(checkWait, 3000);
  }
  function stopWait() { if (SU.timer) clearInterval(SU.timer); SU.timer = null; }
  async function checkWait() {
    if (document.hidden || !$('frWait')) return;
    let r; try { r = await GET('/api/app/live?after=999999999&after_msg=' + SU.after); } catch (e) { return; }
    const msgs = (r.messages || []).slice().reverse();
    if (!msgs.length) return;
    SU.after = msgs[msgs.length - 1].id;
    msgs.forEach(m => {
      if (m.author === 'customer' && !SU.cust) { SU.cust = m; SU.thread = m.thread_id; }
      if (m.author === 'ai' && (!SU.thread || m.thread_id === SU.thread) && !SU.reply) { SU.reply = m; SU.thread = m.thread_id; }
    });
    paintWait();
    if (SU.reply) { stopWait(); setTimeout(() => { SU.view = 'won'; render(); RV.confetti(60); }, 1800); }
  }
  function paintWait() {
    const el = $('frWaitMsgs'); if (!el) return;
    el.innerHTML = (SU.cust ? '<div class="bub-in a-in"><span class="lbl-sm">Customer</span>' + esc(SU.cust.text) + '</div>' : '') + (SU.reply ? '<div class="bub-out a-in"><span class="lbl-sm">' + esc(name()) + ' · AI</span>' + esc(SU.reply.text) + '</div>' : SU.cust ? '<div class="bub-out" style="opacity:.75">' + esc(name()) + ' is typing…</div>' : '');
    const st = $('frWaitSt'); if (st) st.textContent = SU.reply ? name() + ' answered!' : SU.cust ? 'Message received. ' + name() + ' is answering…' : 'Waiting for your message…';
  }
  function waitView(root) {
    const ch = SU.channel || {}, isLink = SU.view === 'link';
    const url = isLink ? ch.link_url : 'https://t.me/' + (ch.username || '');
    const short = url.replace(/^https?:\/\//, '');
    root.innerHTML = frame(4, '<div class="col a-in" style="gap:16px">' + H(isLink ? 'Your chat link is ready' : esc(name()) + ' now answers on Telegram!', isLink ? 'Send a message from your phone. Watch ' + esc(name()) + ' answer here.' : 'Send your bot a message to see. Watch ' + esc(name()) + ' answer here.') +
      '<div class="fr-link"><div class="fr-qr">' + RV.qrSvg(url, 188, { label: 'QR code for ' + short }) + '<span class="small muted">Scan with your phone camera</span></div>' +
      '<div class="col" style="gap:10px;min-width:0;flex:1"><div class="copy-row"><span class="mono ell" id="frUrl">' + esc(short) + '</span></div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-ink grow" id="frCopy">' + ic('copy', '#FFC21A', 16, 2.4) + 'Copy link</button><a class="btn btn-ghost grow" href="' + esc(url) + '" target="_blank" rel="noopener" id="frOpen">' + (isLink ? 'Open on my phone' : 'Open my bot') + '</a></div>' +
      (isLink ? '<p class="small muted" style="margin:0">Put this link in your Instagram bio, your WhatsApp status or on a printed card.</p>' : '') + '</div></div>' +
      '<section class="fr-wait" id="frWait" aria-live="polite"><strong id="frWaitSt">Waiting for your message…</strong><div class="col" id="frWaitMsgs" style="gap:8px"></div></section>' +
      '<button type="button" class="btn-link fr-skip" id="frLater" style="align-self:center">Skip, show me my dashboard</button></div>',
      '<button type="button" class="btn btn-main fr-go" id="frCopy2">' + (isLink ? 'Copy my chat link' : 'Copy my bot link') + arrow() + '</button>');
    const cp = () => RV.copy(url, 'Link copied. Send it to yourself and say hi.');
    $('frCopy').addEventListener('click', cp); $('frCopy2').addEventListener('click', cp);
    $('frLater').addEventListener('click', () => finish('/app'));
    paintWait();
  }
  function wonView(root) {
    root.innerHTML = frame(0, '<div class="col a-in fr-won" style="gap:16px;align-items:center;text-align:center">' + '<div class="a-pop">' + RV.closerBot(RV.tpl(SU.closer.template).color, 120, SU.closer.name.charAt(0)) + '</div>' +
      '<h1 class="su-h fr-h">🎉 ' + esc(name()) + ' just answered your first customer.</h1><p class="fr-sub">From now on, ' + esc(name()) + ' answers new messages for you, day and night.</p>' +
      (SU.reply ? '<div class="col" style="gap:8px;width:100%;text-align:left">' + (SU.cust ? '<div class="bub-in">' + esc(SU.cust.text) + '</div>' : '') + '<div class="bub-out">' + esc(SU.reply.text) + '</div></div>' : '') + '</div>',
      '<button type="button" class="btn btn-main fr-go" id="frChats">Go to my chats' + arrow() + '</button>');
    $('frChats').addEventListener('click', () => finish('/app/inbox' + (SU.thread ? '?t=' + SU.thread : '')));
  }
  const arrow = () => '<span class="arr">' + ic('right', '#121110', 18, 2.6) + '</span>';

  let rootEl = null;
  function render() {
    if (!rootEl) return;
    document.title = (SU.step === 2 ? 'What do you sell?' : SU.step === 3 ? 'Say hi to your helper' : 'Where do customers message you?') + ' | Replyvoo';
    if (SU.step === 3 && !SU.closer) SU.step = 2;
    if (SU.step === 2) step2(rootEl); else if (SU.step === 3) step3(rootEl); else step4(rootEl);
    window.scrollTo(0, 0);
  }
  RV.setupPage = async function (root, q) {
    rootEl = root;
    const st = (S.boot && S.boot.setup) || {};
    if (!SU.closer) {
      const list = await RV.loadClosers(true).catch(() => []);
      SU.closer = (st.closer_id && list.find(c => c.id === st.closer_id)) || list[0] || null;
      SU.step = SU.closer ? Math.min(4, Math.max(3, st.step || 3)) : 2;
      if (+q.step >= 2 && +q.step <= 4 && (SU.closer || +q.step === 2)) SU.step = +q.step;
    }
    render();
  };
  RV.route('start', { render: () => {} });
})();
