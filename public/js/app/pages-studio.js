/* Replyvoo dashboard: Agent Studio — the training studio for a Closer.
   Two ways in: the 5-step Training Coach (beginners, animated explainers) and the Pro view (tabs).
   Knowledge items, gaps and scenario tests save instantly; personality, rules, notes and pay link
   are a draft until Save (kept in localStorage so nothing is lost). Test chat is docked on the right. */
(function () {
  'use strict';
  const RV = window.RV;
  const { $, esc, fmt, GET, PUT, POST, DEL, toast, fail, go, ic } = RV;
  const S = RV.S;

  // Plain questions, one per step. {n} is the helper's name.
  const STEPS = [
    { n: 1, t: 'Job', h: 'What should {n} do?', p: 'Pick one. You can change it later.' },
    { n: 2, t: 'Talk', h: 'How should {n} talk?', p: 'Pick the way you talk to customers.' },
    { n: 3, t: 'Answers', h: 'What do customers ask you?', p: '{n} only says what you teach it. Add the questions people ask most.' },
    { n: 4, t: 'Pass to me', h: 'When should {n} pass the chat to you?', p: '{n} stops and tells you. You reply yourself.' },
    { n: 5, t: 'Try it', h: 'Try {n}.', p: 'Pretend you are a customer. Tap a question.' }
  ];
  const TABS = [['personality', 'How it talks'], ['knowledge', 'What it knows'], ['rules', 'Rules'], ['tests', 'Tests'], ['gaps', 'Couldn’t answer'], ['channels', 'Where it answers'], ['history', 'History']];
  const KTABS = [['qa', 'Questions'], ['products', 'Prices'], ['policies', 'Delivery & returns'], ['docs', 'From my website'], ['notes', 'Notes']];
  const TONES = [['friendly', 'Friendly', '😊', { tone: 20, length: 35, emoji: 40 }], ['polite', 'Polite', '🙂', { tone: 70, length: 50, emoji: 10 }], ['short', 'Short and quick', '⚡', { tone: 40, length: 8, emoji: 15 }]];
  const toneOf = p => p.length <= 15 ? 'short' : p.tone >= 55 ? 'polite' : 'friendly';
  const stepH = (txt) => esc(txt).replace(/\{n\}/g, esc(ST.draft.name || tplOf().name));
  const COLORS = ['#FFC21A', '#8FB8FF', '#C9A7FF', '#7EE0B0', '#FFB199', '#FFE07A', '#FF9FC3', '#9AD6E8'];
  const QUICK = {
    sales: ['How much is it?', 'Do you deliver to my city?', 'How do I pay?', 'Is it in stock?', 'Do you have a discount?'],
    support: ['Where is my order?', 'How do I return something?', 'How long does a refund take?', 'How can I contact you?'],
    vip: ['What perks do VIPs get?', 'Can you reserve an item for me?', 'When is the next drop?'],
    guard: ['What are the group rules?', 'When is the next live session?', 'How do I join the VIP group?'],
    book: ['What times are free?', 'How long is a session?', 'Can I reschedule?', 'Where are you located?'],
    win: ['Is the offer still on?', 'Is my cart still saved?', 'Do you have a payment plan?']
  };
  const POLICIES = [
    ['delivery', 'Delivery', 'Where you deliver, how long it takes and what it costs.', 'We ship across Europe in 2 to 4 days and worldwide in 5 to 9 days. Free shipping over $50.'],
    ['returns', 'Returns & refunds', 'How long people have to return, and how refunds work.', 'Unopened items can be returned within 14 days. Refunds take 3 to 5 working days.'],
    ['payment', 'Payment methods', 'How customers can pay you.', 'Card, bank transfer or PayPal through our secure payment link.'],
    ['hours', 'Opening hours', 'When your team is around.', 'Monday to Saturday, 9am to 6pm. Closed on public holidays.'],
    ['contact', 'Contact', 'How to reach a person.', 'Email hello@yourshop.com or call +44 20 7946 0000.']
  ];
  const EXPECTS = [['answer', 'Gives an answer'], ['price', 'Mentions a price'], ['handoff', 'Hands over to a human'], ['no_handoff', 'Doesn’t hand over'], ['honest', 'Says it’s an AI'], ['graceful', 'Says it will check'], ['discount', 'Follows discount rule']];
  const RULES0 = () => ({ do: [], dont: [], avoid: [], required: [], discount: { mode: 'knowledge', max: 10 }, handoff: { angry: true, refund: true, human: true, legal: false, order_over: 0, keywords: [] }, hours: '', language: { mode: 'auto', lang: '' } });
  const normRules = r => { r = r || {}; const d = RULES0(); return { do: r.do || [], dont: r.dont || [], avoid: r.avoid || [], required: r.required || [], discount: Object.assign(d.discount, r.discount || {}), handoff: Object.assign(d.handoff, r.handoff || {}), hours: r.hours || '', language: Object.assign(d.language, r.language || {}) }; };
  const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setP = (o, p, v) => { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null || typeof a[ks[i]] !== 'object') a[ks[i]] = {}; a = a[ks[i]]; } a[ks[ks.length - 1]] = v; };
  const money = (p, c) => { if (p == null || p === '') return 'No price'; const n = Number(p); const v = n % 1 ? n.toFixed(2) : String(n); const sym = { USD: '$', EUR: '€', GBP: '£', NGN: '₦' }[(c || 'USD').toUpperCase()]; return sym ? sym + v : v + ' ' + c; };
  const clamp = (v, d) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(100, v)) : d);

  let ST = null, anim = null, demoRun = null;

  /* ---------------- state ---------------- */
  function draftFrom(c) {
    const p = c.persona || {};
    return { name: c.name || '', template: c.template || 'sales', persona: { tone: clamp(p.tone, 30), length: clamp(p.length, 40), emoji: clamp(p.emoji, 30), color: p.color || '' }, skills: Object.assign({}, c.skills || {}), instructions: c.instructions || '', knowledge: c.knowledge || '', pay_link: c.pay_link || '', pro_brain: !!c.pro_brain, rules: normRules(c.rules) };
  }
  function freshDraft(tplId) {
    const t = RV.tpl(tplId || 'sales');
    const skills = {}; (S.boot.skills || []).forEach(s => { skills[s[0]] = ['paylink', 'vision', 'handoff', 'upsell'].includes(s[0]); });
    return { name: t.name, template: t.id, persona: { tone: 30, length: 40, emoji: 30, color: '' }, skills, instructions: '', knowledge: '', pay_link: '', pro_brain: false, rules: normRules({}) };
  }
  const key = id => 'studio_' + (id || 'new');
  function fromServer(d, prev) {
    const c = d.closer;
    const st = { id: c.id, closer: c, draft: draftFrom(c), dirty: false, items: d.items, custom: d.custom || [], runs: d.runs || {}, scenarios: d.scenarios || [], score: d.score, checklist: d.checklist, counts: d.counts, gaps: d.gaps || [], versions: d.versions || [], coach: d.coach || {}, chat: prev ? prev.chat : [], running: {}, mode: null, step: 1, tab: 'personality', ktab: 'qa', q: '', restored: false, chatOpen: false };
    const saved = RV.store.get(key(c.id) + '_draft', null);
    if (saved && saved.at && saved.draft && saved.at > Date.parse(c.updated_at || c.created_at || 0) && RV.isManager()) { st.draft = Object.assign(st.draft, saved.draft, { rules: normRules(saved.draft.rules) }); st.dirty = true; st.restored = true; }
    const ui = RV.store.get(key(c.id) + '_ui', {});
    st.mode = ui.mode || (d.coach && d.coach.finished ? 'pro' : d.score >= 70 ? 'pro' : 'coach');
    st.step = ui.step || (d.coach && d.coach.step) || 3;
    st.tab = ui.tab || 'personality'; st.ktab = ui.ktab || 'qa';
    return st;
  }
  function freshST(tplId) {
    return { id: null, closer: null, draft: freshDraft(tplId), dirty: false, items: [], custom: [], runs: {}, scenarios: [], score: 0, checklist: [], counts: {}, gaps: [], versions: [], coach: {}, chat: [], running: {}, mode: 'coach', step: 1, tab: 'personality', ktab: 'qa', q: '', chatOpen: false };
  }
  function saveUi() { if (ST) RV.store.set(key(ST.id) + '_ui', { mode: ST.mode, step: ST.step, tab: ST.tab, ktab: ST.ktab }); }
  const saveDraftLocal = RV.debounce(() => { if (ST && ST.id && ST.dirty) RV.store.set(key(ST.id) + '_draft', { at: Date.now(), draft: ST.draft }); }, 400);
  function markDirty() { ST.dirty = true; saveDraftLocal(); paintSavebar(); paintHeadState(); }
  const mgr = () => RV.isManager();
  const tplOf = () => RV.tpl(ST.draft.template);
  const color = () => ST.draft.persona.color || tplOf().color;
  const letter = () => (ST.draft.name || tplOf().name || 'A').trim().charAt(0).toUpperCase() || 'A';
  const items = k => ST.items.filter(i => i.kind === k);

  /* ---------------- route ---------------- */
  async function studio(ctx) {
    const [list, chans] = await Promise.all([RV.loadClosers(), RV.loadChannels()]);
    if (!ctx.ok()) return;
    const id = +ctx.q.id || null;
    if (id) {
      if (!list.find(x => x.id === id)) { ctx.el.innerHTML = RV.empty('helper not found', 'It may have been deleted.', '<a class="btn btn-ink" href="/app/closers">My AI helpers</a>'); return; }
      if (!ST || ST.id !== id || !ctx.soft) { const d = await GET('/api/app/closers/' + id + '/training'); if (!ctx.ok()) return; ST = fromServer(d, ST && ST.id === id ? ST : null); }
    } else if (!ST || ST.id || !ctx.soft) ST = freshST(ctx.q.template);
    if (ctx.q.coach) { ST.mode = 'coach'; if (+ctx.q.coach >= 1 && +ctx.q.coach <= 5) ST.step = +ctx.q.coach; }
    if (ctx.q.tab && TABS.some(t => t[0] === ctx.q.tab)) { ST.mode = 'pro'; ST.tab = ctx.q.tab; }
    if (!ST.id && ST.step > 2) ST.step = 2;
    ST.chans = chans; ST.ctx = ctx;
    paint();
    if (ctx.q.demo) openDemo();
  }

  /* ---------------- paint ---------------- */
  function stopAnim() { if (anim) { anim.stop(); anim = null; } }
  function paint() {
    const ctx = ST.ctx; stopAnim();
    const u = S.boot.usage;
    const full = !ST.id && (S.closers || []).length >= u.closers_limit;
    ctx.el.innerHTML = '<div class="st" id="stRoot">' +
      '<section class="st-head a-in" id="stHead"></section>' +
      (full ? '<div class="st-banner">' + ic('info', '#7A5800', 18) + '<span class="grow">Your helper team is full (' + u.closers_used + '/' + u.closers_limit + '). You can still design and test here.</span><button class="btn btn-ink btn-sm" data-act="slot">Unlock a slot</button></div>' : '') +
      (!mgr() ? '<div class="st-banner" style="background:var(--soft);border-color:var(--line)">' + ic('info', '#5E5A50', 18) + '<span class="grow">You can test this helper, but only owners and admins can change it.</span></div>' : '') +
      (ST.restored ? '<div class="st-banner" id="stRestored">' + ic('clock', '#7A5800', 18) + '<span class="grow">We restored your unsaved changes from last time.</span><button class="btn btn-ghost btn-sm" data-act="discard">Discard them</button></div>' : '') +
      '<div class="st-grid"><div class="st-main" id="stMain"></div><aside class="st-dock' + (ST.chatOpen ? ' open' : '') + '" id="stDock" aria-label="Test chat"></aside></div>' +
      '<div id="stSaveWrap"></div>' +
      '<button class="btn btn-ink st-chatfab" data-act="chatopen" aria-label="Open the test chat">' + ic('chat', '#FFC21A', 18, 2.2) + 'Test chat</button>' +
      (ST.chatOpen ? '<div class="st-dockovl" data-act="chatclose"></div>' : '') + '</div>';
    const root = $('stRoot');
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onKey);
    root.addEventListener('submit', onSubmit);
    paintHead(); paintMain(); paintDock(); paintSavebar();
  }
  function ringHtml(v, size, dark) {
    v = Math.max(0, Math.min(100, Math.round(v || 0)));
    const sw = Math.max(4, Math.round(size * 0.11)), r = (size - sw) / 2, c = +(2 * Math.PI * r).toFixed(1);
    const col = v >= 80 ? '#2E9E5B' : v >= 50 ? '#F0AE00' : '#FF7A59';
    return '<span class="st-ring" style="width:' + size + 'px;height:' + size + 'px" role="img" aria-label="How ready ' + v + ' out of 100"><svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + (dark ? '#2C2925' : '#ECE7DB') + '" stroke-width="' + sw + '"/><circle class="f" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + (c * (1 - v / 100)).toFixed(1) + '" style="--c:' + c + '"/></svg><b style="font-size:' + Math.round(size * 0.3) + 'px">' + v + '</b></span>';
  }
  RV.scoreRing = ringHtml;
  // Where the helper answers right now (never "live" when nothing can reach it).
  function placesOf() { return (ST.chans || []).filter(c => c.status === 'active' && c.closer_id === ST.id); }
  function statusWords() {
    const c = ST.closer; if (!c) return '<span style="color:var(--jade)">Not made yet</span>';
    if (!c.active) return '<span style="color:#FFB199">Paused</span>';
    const pl = placesOf();
    return pl.length ? '<span style="color:#7EE0B0">Answering on ' + pl.map(x => esc(RV.placeName(x))).join(', ') + '</span>' : '<span style="color:#FFE58A">Not answering anywhere yet</span>';
  }
  function paintHead() {
    const el = $('stHead'); if (!el) return;
    const t = tplOf(), d = ST.draft;
    const gaps = ST.gaps.length;
    el.innerHTML = '<div class="st-id"><span class="bot" id="stBot">' + RV.closerBot(color(), 44, letter()) + '</span><span class="col grow" style="gap:2px;min-width:0"><strong class="ell" id="stHName">' + esc(d.name || t.name) + '</strong><span class="sub">' + statusWords() + '</span><span class="st-unsaved" id="stDirty" hidden></span></span></div>' +
      '<div class="st-hr">' +
      (ST.id ? '<button class="st-scorebtn" data-act="checklist" aria-label="' + esc(d.name || t.name) + ' is ' + ST.score + '% ready. See what to add">' + ringHtml(ST.score, 40, true) + '<span class="l"><b>' + ST.score + '% ready</b><small>' + (ST.score >= 80 ? 'Great' : 'Add more answers') + '</small></span></button>' : '') +
      (ST.id && gaps ? '<button class="st-gapchip" data-act="tab" data-arg="gaps">' + ic('info', '#FFFFFF', 16, 2.4) + gaps + (gaps === 1 ? ' question' : ' questions') + ' it couldn’t answer</button>' : '') +
      (ST.id ? '<button class="btn btn-dark btn-sm" data-act="mode" data-arg="' + (ST.mode === 'coach' ? 'pro' : 'coach') + '">' + (ST.mode === 'coach' ? 'More options' : 'Back to simple steps') + '</button>' : '') + '</div>';
  }
  function paintHeadState() {
    const dEl = $('stDirty'); if (dEl) dEl.hidden = true;
    const n = $('stHName'); if (n) n.textContent = ST.draft.name || tplOf().name;
    const b = $('stBot'); if (b) b.innerHTML = RV.closerBot(color(), 50, letter());
  }
  function paintSavebar() {
    const w = $('stSaveWrap'); if (!w) return;
    if (!mgr() || !ST.dirty || !ST.id) { w.innerHTML = ''; return; }
    if (w.firstChild) return;
    w.innerHTML = '<div class="st-savebar" role="region" aria-label="Unsaved changes"><span>Tap Save to keep your changes</span><button class="btn btn-ghost btn-sm" data-act="discard">Discard</button><button class="btn btn-ink btn-sm" data-act="save" id="stSaveBtn">' + ic('check', '#FFC21A', 16, 2.6) + 'Save</button></div>';
  }
  function paintMain() {
    stopAnim();
    const el = $('stMain'); if (!el) return;
    if (ST.mode === 'coach') paintCoach(el); else { document.body.classList.remove('rv-setupbar'); paintPro(el); }
  }

  /* ---------------- coach ---------------- */
  function paintCoach(el) {
    const s = STEPS[ST.step - 1];
    const done = new Set((ST.coach && ST.coach.done) || []);
    // The question comes first. One "Show me how" link (the voice guide, off unless tapped). Next sits in a bar at the bottom.
    el.innerHTML = '<ol class="co-rail" aria-label="Steps">' + STEPS.map(x => '<li><button data-act="step" data-arg="' + x.n + '" class="' + (x.n === ST.step ? 'cur' : done.has(x.n) || x.n < ST.step ? 'done' : '') + '"' + (x.n === ST.step ? ' aria-current="step"' : '') + (!ST.id && x.n > 2 ? ' disabled title="Make your helper first"' : '') + '><span class="n">' + (done.has(x.n) && x.n !== ST.step ? '✓' : x.n) + '</span><span class="t">' + esc(x.t) + '</span></button></li>').join('') + '</ol>' +
      '<section class="co-card a-in" aria-labelledby="coH"><div class="co-head"><span class="eyebrow" style="flex:0 0 100%">Step ' + s.n + ' of 5</span><h2 id="coH">' + stepH(s.h) + '</h2><button type="button" class="showme" data-voice-play="s' + s.n + '">▶ Show me how</button><p class="muted" style="margin:0;flex:0 0 100%">' + stepH(s.p) + '</p></div>' +
      '<div class="co-body" id="coBody">' + stepBody(s.n) + '</div>' +
      '<div class="co-nav sticky">' + (s.n > 1 ? '<button class="btn btn-ghost" data-act="back">' + ic('back', '#121110', 16, 2.4) + 'Back</button>' : '') + '<span class="sp"></span>' + nextBtn(s.n) + '</div></section>';
    document.body.classList.add('rv-setupbar');
    afterBody();
    if (s.n === 5) paintDock();
  }
  function nextBtn(n) {
    const arr = '<span class="arr">' + ic('right', '#121110', 18, 2.6) + '</span>';
    if (!mgr()) return n < 5 ? '<button class="btn btn-main" data-act="next">Next' + arr + '</button>' : '';
    if (n === 2 && !ST.id) return '<button class="btn btn-main" data-act="create" id="coCreate">Make ' + esc(ST.draft.name || tplOf().name) + arr + '</button>';
    if (n === 5) return '<button class="btn btn-main" data-act="finish" id="coFinish">' + (placesOf().length ? 'Done' : 'Next: choose where ' + esc(ST.draft.name) + ' answers') + arr + '</button>';
    return '<button class="btn btn-main" data-act="next">' + (n === 2 || n === 4 ? 'Save and next' : 'Next') + arr + '</button>';
  }
  function stepBody(n) {
    if (n === 1) return rolesHtml();
    if (n === 2) return toneHtml();
    if (n === 3) return '<div id="stK">' + knowledgeBody(ST.ktab === 'notes' ? 'qa' : ST.ktab, true) + '</div>' + (ST.id && mgr() ? '<div class="row" style="gap:8px;flex-wrap:wrap">' + (ST.ktab !== 'qa' ? '<button class="btn btn-ghost btn-sm" data-act="ktab" data-arg="qa">Questions</button>' : '') + '<button class="btn btn-ghost btn-sm" data-act="padd">' + ic('plus', '#121110', 15, 2.6) + 'Add my prices</button><button class="btn btn-ghost btn-sm" data-act="ktab" data-arg="docs">' + ic('globe', '#121110', 15, 2.2) + 'Copy from my website</button><button class="btn btn-ghost btn-sm" data-act="ktab" data-arg="policies">Delivery & returns</button></div>' : '');
    if (n === 4) return handoffSimple();
    return launchHtml();
  }
  function kCount(k) { return k === 'qa' ? items('qa').length + items('correction').length : k === 'products' ? items('product').length : k === 'policies' ? items('policy').length : k === 'docs' ? items('doc').length : (ST.draft.knowledge ? '✓' : 0); }
  function afterBody() { syncSample(); }

  function rolesHtml() {
    const ro = mgr() ? '' : ' disabled';
    const main = ['sales', 'support', 'book'], more = S.boot.templates.filter(x => !main.includes(x.id));
    const card = x => '<button class="st-tpl' + (ST.draft.template === x.id ? ' on' : '') + '" data-act="tpl" data-arg="' + x.id + '" aria-pressed="' + (ST.draft.template === x.id) + '"' + ro + '><span style="flex:0 0 auto">' + RV.closerBot(x.color, 40, x.letter) + '</span><strong>' + esc(RV.roleOf(x.id)) + '</strong></button>';
    return '<div class="st-tpls" role="group" aria-label="Jobs">' + S.boot.templates.filter(x => main.includes(x.id)).map(card).join('') + '</div>' +
      (more.length ? '<details' + (more.some(x => x.id === ST.draft.template) ? ' open' : '') + '><summary class="small" style="cursor:pointer;font-weight:800;margin-top:6px">More jobs</summary><div class="st-tpls" style="margin-top:8px">' + more.map(card).join('') + '</div></details>' : '');
  }
  // Step 2: name + three big tone buttons. Colours, sliders and "sound like you" are under More options.
  function sampleFor(p) {
    const shop = S.boot.workspace.name || 'our shop', t = toneOf(p);
    return { q: 'Do you deliver?', a: t === 'short' ? 'Yes, we deliver. Want a time?' : t === 'polite' ? 'Hello, and thank you for writing to ' + shop + '. Yes, we deliver. May I help you pick a time?' : 'Hi! 😊 Yes, ' + shop + ' delivers. Want me to check a time for you?' };
  }
  function toneHtml() {
    const d = ST.draft, t = tplOf(), ro = mgr() ? '' : ' disabled', cur = toneOf(d.persona);
    return '<div class="col" style="gap:14px"><div class="field"><label class="lbl" for="stName">Name</label><input id="stName" class="input" maxlength="40" placeholder="' + esc(t.name) + '" value="' + esc(d.name) + '" data-bind="name"' + ro + '><span class="hint">Customers see this name.</span></div>' +
      '<div class="tone3" role="radiogroup" aria-label="How it talks">' + TONES.map(x => '<button type="button" role="radio" data-act="tone" data-arg="' + x[0] + '" class="' + (cur === x[0] ? 'on' : '') + '" aria-checked="' + (cur === x[0]) + '"' + ro + '><span aria-hidden="true">' + x[2] + '</span>' + x[1] + '</button>').join('') + '</div>' +
      '<div class="co-sample"><span class="small muted" style="font-weight:700">Sample reply</span><div class="bub-in" id="smQ" style="border:1px solid var(--line)"></div><div class="bub-out" id="smA"></div></div>' +
      '<details class="st-more"><summary class="small" style="cursor:pointer;font-weight:800">More options</summary><div style="margin-top:10px">' + personalityHtml(false) + '</div></details></div>';
  }
  // Step 4: four switches, on by default. Everything else is under "More rules".
  function handoffSimple() {
    const r = ST.draft.rules, ro = mgr() ? '' : ' disabled';
    const sw = (path, label, on) => '<div class="row" style="gap:12px;border:1px solid var(--line);border-radius:16px;padding:12px 14px"><strong class="grow" style="font-size:15.5px">' + label + '</strong><button type="button" class="toggle ' + (on ? 'on' : 'off') + '" data-act="hsw" data-arg="' + path + '" aria-pressed="' + !!on + '" aria-label="' + esc(label) + '"' + ro + '><span></span></button></div>';
    return '<div class="col" style="gap:8px">' + sw('angry', 'Angry customer', r.handoff.angry) + sw('refund', 'Asks for a refund', r.handoff.refund) + sw('human', 'Asks for a person', r.handoff.human) + sw('big', 'Big order', r.handoff.order_over > 0) +
      (r.handoff.order_over > 0 ? '<div class="row" style="gap:8px;flex-wrap:wrap;padding:0 4px"><label class="lbl" for="ordOver2" style="font-weight:600">A big order is more than</label><input id="ordOver2" class="input" type="number" min="1" step="1" value="' + r.handoff.order_over + '" data-bind="rules.handoff.order_over" style="width:120px;padding:9px 12px"' + ro + '></div>' : '') + '</div>' +
      payHtml() +
      '<details class="st-more"><summary class="small" style="cursor:pointer;font-weight:800">More rules</summary><div style="margin-top:10px">' + rulesHtml(false) + '</div></details>';
  }
  function personalityHtml(full) {
    const d = ST.draft, t = tplOf(), ro = mgr() ? '' : ' disabled';
    const sl = [['tone', 'Friendly', 'Formal'], ['length', 'Short and snappy', 'Detailed'], ['emoji', 'No emoji', 'Lots of emoji']];
    return '<div class="dgrid" style="gap:16px"><div class="c7 col" style="gap:14px;min-width:0">' +
      (full ? '<div class="field"><span class="lbl">Job</span><div class="st-roles" role="group" aria-label="Role">' + S.boot.templates.map(x => '<button type="button" class="chip' + (d.template === x.id ? ' on' : '') + '" data-act="tpl" data-arg="' + x.id + '" aria-pressed="' + (d.template === x.id) + '"' + ro + '><span style="width:14px;height:14px;border-radius:5px;background:' + x.color + ';border:2px solid #121110;flex:0 0 14px"></span>' + esc(RV.roleOf(x.id)) + '</button>').join('') + '</div></div>' : '') +
      (full ? '<div class="field"><label class="lbl" for="stName">Name</label><input id="stName" class="input" maxlength="40" placeholder="' + esc(t.name) + '" value="' + esc(d.name) + '" data-bind="name"' + ro + '><span class="hint">Customers see this name. Short and friendly works best.</span></div>' : '') +
      '<div class="field"><span class="lbl">Colour</span><div class="st-sw" role="group" aria-label="Helper colour">' + COLORS.map(c => '<button type="button" data-act="color" data-arg="' + c + '" class="' + (color() === c ? 'on' : '') + '" style="background:' + c + '" aria-label="Colour ' + c + '" aria-pressed="' + (color() === c) + '"' + ro + '></button>').join('') + '</div></div>' +
      sl.map(r => '<div class="range-row"><div class="top"><span>' + r[1] + '</span><span>' + r[2] + '</span></div><input class="slider" type="range" min="0" max="100" value="' + d.persona[r[0]] + '" data-bind="persona.' + r[0] + '" aria-label="' + r[1] + ' to ' + r[2] + '" style="--p:' + d.persona[r[0]] + '%"' + ro + '></div>').join('') +
      (full ? skillsHtml() + '<div class="field"><label class="lbl" for="stIns">Extra instructions</label><textarea id="stIns" data-dictate class="input" rows="3" maxlength="4000" data-bind="instructions" placeholder="e.g. Always offer gift wrapping."' + ro + '>' + esc(d.instructions) + '</textarea><span class="hint">Anything else about how it should talk.</span></div>' +
        '<div class="field"><label class="lbl" for="stStyle">Sound like you (optional)</label><textarea id="stStyle" data-dictate class="input" rows="4" maxlength="3000" data-bind="persona.style" placeholder="Paste 3 to 5 real replies you sent customers, e.g.&#10;Heyy! Yes we have it in stock 😊 want me to hold one for you?&#10;No problem, delivery is 2 days. I’ll send the link now"' + ro + '>' + esc(d.persona.style || '') + '</textarea><span class="hint">Your helper copies your tone and emoji habits from these. It never copies prices or facts from them.</span></div>' +
        '<label class="st-human"><input type="checkbox" data-bind="persona.human"' + (d.persona.human !== false ? ' checked' : '') + ro + '><span class="col" style="gap:1px"><strong>Human-like replies</strong><span class="small muted">Types for a moment before answering, and sends two short messages instead of one long one when it reads naturally. Remembers returning customers.</span></span></label>' +
        payHtml() + (RV.flag('pro_brain') ? (() => { const pc = (S.boot.billing && S.boot.billing.pro_brain_extra_credits) || 1, cr = pc + (pc === 1 ? ' credit' : ' credits'); return '<div class="row" style="gap:12px;background:var(--ink);color:#fff;border-radius:18px;padding:14px 16px"><span class="col grow" style="gap:0"><strong>Smarter answers <span style="font-weight:600;color:#A8A294;font-size:12px">Pro Brain</span></strong><span style="font-size:13px;color:#C4BFB3">A stronger AI for tricky questions. ' + (S.boot.usage.pro.included ? fmt(S.boot.usage.pro.included) + ' chats included on your plan, then it uses ' + cr + ' per chat.' : 'Uses ' + cr + ' per chat.') + '</span></span><button class="toggle ' + (d.pro_brain ? 'on' : 'off') + '" data-act="pro" aria-label="Smarter answers" aria-pressed="' + d.pro_brain + '"' + ro + '><span></span></button></div>'; })() : '') : '') +
      '</div>' + (full ? '<div class="c5" style="min-width:0"><div class="co-sample" style="position:sticky;top:140px"><span class="row" style="gap:8px"><span id="smBot" style="flex:0 0 36px">' + RV.closerBot(color(), 36, letter()) + '</span><span class="col" style="gap:0;line-height:1.2"><strong id="smName" style="font-size:14px">' + esc(d.name || t.name) + '</strong><span style="font-size:12px;color:var(--mut);font-weight:700">Live sample reply</span></span></span><div class="bub-in" id="smQ" style="border:1px solid var(--line)"></div><div class="bub-out" id="smA"></div><span class="hint">This changes as you slide. Real replies use what you teach it.</span></div></div>' : '') + '</div>';
  }
  function syncSample() {
    const q = $('smQ'), a = $('smA'); if (!q || !a) return;
    const s = sampleFor(ST.draft.persona);
    q.textContent = s.q; a.textContent = s.a;
    const n = $('smName'); if (n) n.textContent = ST.draft.name || tplOf().name;
  }
  function skillsHtml() {
    const ro = mgr() ? '' : ' disabled';
    return '<div class="field"><span class="lbl">What it can do</span><div class="col" style="gap:12px">' + (S.boot.skills || []).map(k => '<div class="row" style="gap:12px"><span class="col grow" style="gap:0"><strong style="font-size:15px">' + esc((RV.SKILLW[k[0]] || [k[1]])[0]) + '</strong><span class="small muted">' + esc((RV.SKILLW[k[0]] || [0, k[2]])[1]) + '</span></span><button class="toggle ' + (ST.draft.skills[k[0]] ? 'on' : 'off') + '" data-act="skill" data-arg="' + k[0] + '" aria-label="' + esc(k[1]) + '" aria-pressed="' + !!ST.draft.skills[k[0]] + '"' + ro + '><span></span></button></div>').join('') + '</div></div>';
  }
  function payHtml() {
    const ro = mgr() ? '' : ' disabled';
    return '<div class="field"><label class="lbl" for="stPay">Your payment link (optional) ' + RV.whats('paylink') + '</label><input id="stPay" class="input" type="url" inputmode="url" placeholder="https://your-payment-link" value="' + esc(ST.draft.pay_link) + '" data-bind="pay_link"' + ro + '><span class="hint">The link you send people to pay you.</span><span class="inline-err" id="stPayErr" hidden></span></div>';
  }

  /* ---------------- knowledge ---------------- */
  function needSaved() { return '<div class="st-empty-k">' + RV.closerBot(color(), 70, letter()) + '<strong style="color:var(--ink)">Make your helper first</strong>Then you can teach it what to say. Your choices so far are kept.' + (mgr() ? '<button class="btn btn-ink btn-sm" data-act="create">Make ' + esc(ST.draft.name || tplOf().name) + '</button>' : '') + '</div>'; }
  function knowledgeBody(k, coach) {
    if (!ST.id && k !== 'notes') return needSaved();
    if (k === 'qa') return qaHtml(coach);
    if (k === 'products') return productsHtml();
    if (k === 'policies') return policiesHtml();
    if (k === 'docs') return docsHtml();
    return notesHtml();
  }
  function itemActs(it) {
    if (!mgr()) return '';
    return '<span class="acts"><button class="toggle st-mini ' + (it.enabled ? 'on' : 'off') + '" data-act="itoggle" data-arg="' + it.id + '" aria-label="' + (it.enabled ? 'Turn off' : 'Turn on') + '" aria-pressed="' + it.enabled + '" title="' + (it.enabled ? 'On' : 'Off') + '"><span></span></button><button class="st-ib" data-act="iedit" data-arg="' + it.id + '" aria-label="Edit">' + ic('pen', '#121110', 15) + '</button><button class="st-ib" data-act="idel" data-arg="' + it.id + '" aria-label="Delete">' + ic('trash', '#9A2A12', 15) + '</button></span>';
  }
  function qaHtml(coach) {
    const ro = !mgr();
    const list = ST.items.filter(i => i.kind === 'qa' || i.kind === 'correction');
    const q = ST.q.toLowerCase();
    const shown = q ? list.filter(i => (i.question + ' ' + i.answer + ' ' + ((i.data && i.data.alt) || []).join(' ')).toLowerCase().includes(q)) : list;
    const quick = (QUICK[ST.draft.template] || QUICK.sales).filter(x => !list.some(i => i.question.toLowerCase() === x.toLowerCase()));
    return (ro ? '' : '<form class="st-add" data-form="qa" autocomplete="off" novalidate><strong style="font-size:15px">+ Add a question</strong>' +
      (quick.length ? '<div class="st-ex" aria-label="Common questions"><span class="hint" style="align-self:center">Tap one:</span>' + quick.map(x => '<button type="button" data-act="quickq" data-arg="' + esc(x) + '">+ ' + esc(x) + '</button>').join('') + '</div>' : '') +
      '<div class="field"><label class="lbl" for="qaQ">Question</label><input id="qaQ" data-dictate class="input" maxlength="400" placeholder="e.g. Do you deliver on Sundays?"><span class="inline-err" id="qaQErr" hidden></span></div>' +
      '<div class="field"><label class="lbl" for="qaA">Answer</label><textarea id="qaA" data-dictate class="input" rows="2" maxlength="4000" placeholder="Write it the way you’d say it in chat, with exact prices and times."></textarea><span class="inline-err" id="qaAErr" hidden></span></div>' +
      '<details><summary class="small" style="cursor:pointer;font-weight:800">Other ways people ask it (optional)</summary><div class="field" style="margin-top:8px"><label class="lbl sr" for="qaAlt">Other phrasings</label><input id="qaAlt" class="input" maxlength="600" placeholder="weekend delivery, Sunday shipping"><span class="hint">Put a comma between each one.</span></div></details>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-ink btn-sm" type="submit">' + ic('plus', '#FFC21A', 16, 2.6) + 'Save this answer</button><button class="btn btn-ghost btn-sm" type="button" data-act="bulk">Paste many at once</button></div></form>') +
      (list.length > 3 ? '<div class="field"><label class="sr" for="qaSearch">Search Q&As</label><input id="qaSearch" class="input" type="search" placeholder="Search your ' + list.length + ' answers…" value="' + esc(ST.q) + '" data-search style="padding:10px 14px"></div>' : '') +
      '<div class="st-list" id="qaList">' + (shown.length ? shown.map(it => '<div class="st-item' + (it.enabled ? '' : ' off') + '"><div class="bd"><span class="st-kind k-' + it.kind + '">' + (it.kind === 'correction' ? '✓ Fixed answer' : 'Answer') + '</span><span class="q">' + esc(it.question) + '</span><span class="a">' + esc(it.answer) + '</span>' + ((it.data && it.data.alt && it.data.alt.length) || (it.data && it.data.ai_answer) ? '<span class="meta">' + ((it.data.alt || []).map(a => '<span>' + esc(a) + '</span>').join('')) + (it.data.ai_answer ? '<span style="text-decoration:line-through;color:#9A2A12">AI said: ' + esc(it.data.ai_answer.slice(0, 80)) + '</span>' : '') + '</span>' : '') + '</div>' + itemActs(it) + '</div>').join('')
        : '<div class="st-empty-k">' + (q ? 'Nothing matches “' + esc(ST.q) + '”.' : '<strong style="color:var(--ink)">No answers yet</strong>Add the 3 questions people ask most.') + '</div>') + '</div>';
  }
  function productsHtml() {
    const list = items('product');
    return (mgr() ? '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-ink btn-sm" data-act="padd">' + ic('plus', '#FFC21A', 16, 2.6) + 'Add a price</button><button class="btn btn-ghost btn-sm" data-act="csv">' + ic('download', '#121110', 16) + 'Import a file</button></div>' : '') +
      '<div class="st-list">' + (list.length ? list.map(it => { const d = it.data || {}; return '<div class="st-item' + (it.enabled ? '' : ' off') + '"><span style="flex:0 0 44px;height:44px;border-radius:14px;background:#E3ECFF;display:grid;place-items:center;font-weight:800;font-size:13px">' + esc(money(d.price, d.currency).slice(0, 6)) + '</span><div class="bd"><span class="q">' + esc(it.title) + '</span>' + (it.answer ? '<span class="a">' + esc(it.answer) + '</span>' : '') + '<span class="meta"><span>' + esc(money(d.price, d.currency)) + '</span><span style="' + (d.stock === false ? 'background:#FFF0EC;color:#9A2A12' : 'background:#E8F6EC;color:#14532D') + '">' + (d.stock === false ? 'Out of stock' : 'In stock') + '</span>' + (d.sku ? '<span>SKU ' + esc(d.sku) + '</span>' : '') + (d.link ? '<span>' + ic('link', '#5E5A50', 11) + ' link</span>' : '') + '</span></div>' + itemActs(it) + '</div>'; }).join('')
        : '<div class="st-empty-k"><strong style="color:var(--ink)">No prices yet</strong>Add what you sell with the price, so your helper never guesses.</div>') + '</div>';
  }
  function policiesHtml() {
    const ro = mgr() ? '' : ' disabled';
    return '<p class="small muted" style="margin:0">Fill in what applies. Each one saves on its own. Leave the rest empty.</p>' + POLICIES.map(p => {
      const it = ST.items.find(i => i.kind === 'policy' && i.data && i.data.topic === p[0]);
      return '<div class="st-pol' + (it ? ' ok' : '') + '"><div class="row" style="gap:10px;flex-wrap:wrap"><strong class="grow">' + esc(p[1]) + '</strong>' + (it ? '<span class="pill" style="background:#E8F6EC;color:#14532D">✓ Saved</span>' : '<span class="pill" style="background:var(--soft);color:var(--mut)">Not added</span>') + '</div><label class="hint" for="pol_' + p[0] + '">' + esc(p[2]) + '</label><textarea id="pol_' + p[0] + '" class="input" rows="2" maxlength="2000" placeholder="e.g. ' + esc(p[3]) + '"' + ro + '>' + esc(it ? it.answer : '') + '</textarea>' +
        (mgr() ? '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-ink btn-sm" data-act="polsave" data-arg="' + p[0] + '">' + (it ? 'Update' : 'Save') + '</button>' + (it ? '<button class="btn btn-ghost btn-sm" data-act="idel" data-arg="' + it.id + '">Remove</button>' : '<button class="btn-link small" data-act="polex" data-arg="' + p[0] + '" style="color:var(--mut)">Use the example</button>') + '</div>' : '') + '</div>';
    }).join('');
  }
  function docsHtml() {
    const list = items('doc');
    return (mgr() ? '<div class="st-add"><strong style="font-size:15px">Copy from my website</strong><form class="row" data-form="url" style="gap:8px;flex-wrap:wrap"><label class="sr" for="impUrl">Page address</label><input id="impUrl" class="input" type="url" inputmode="url" placeholder="https://yourshop.com/faq" style="flex:1 1 240px" required><button class="btn btn-ink btn-sm" type="submit" id="impGo">' + ic('globe', '#FFC21A', 16) + 'Import page</button></form><span class="hint">We read the words on the page and show you first.</span></div>' +
      '<div class="st-drop"><span style="flex:0 0 44px;height:44px;border-radius:14px;background:var(--mint);display:grid;place-items:center">' + ic('download', '#7A5800', 20) + '</span><span class="col grow" style="gap:0;min-width:180px"><strong>Import a file</strong><span class="hint">A text file or spreadsheet, up to 200 KB.</span></span><label class="btn btn-ghost btn-sm" style="cursor:pointer">Choose file<input type="file" accept=".txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv" data-file hidden></label><button class="btn btn-ghost btn-sm" data-act="bulk">Paste text</button></div>' : '') +
      '<div class="st-list">' + (list.length ? list.map(it => '<div class="st-item' + (it.enabled ? '' : ' off') + '"><div class="bd"><span class="st-kind k-doc">' + (it.source === 'import_url' ? 'Web page' : it.source === 'import_file' ? 'File' : 'Document') + '</span><span class="q">' + esc(it.title) + '</span><span class="a">' + esc(it.answer.slice(0, 220)) + (it.answer.length > 220 ? '…' : '') + '</span>' + (it.data && it.data.url ? '<span class="meta"><span>' + esc(it.data.url.replace(/^https?:\/\//, '').slice(0, 60)) + '</span></span>' : '') + '</div>' + itemActs(it) + '</div>').join('')
        : '<div class="st-empty-k"><strong style="color:var(--ink)">Nothing copied yet</strong>Type your FAQ or prices page address above. We copy the text for your helper.</div>') + '</div>';
  }
  function notesHtml() {
    const ro = mgr() ? '' : ' disabled';
    return '<div class="field"><label class="lbl" for="stKnow">Notes and free text</label><textarea id="stKnow" class="input" rows="10" maxlength="60000" data-bind="knowledge" placeholder="Anything that doesn’t fit a Q&A: your story, how products are made, sizing notes. Plain text is perfect."' + ro + '>' + esc(ST.draft.knowledge) + '</textarea><span class="row hint" style="justify-content:space-between;gap:10px"><span>Used after your Q&As, products and policies. Saved with the Save button.</span><span class="tnum" id="stCount" style="white-space:nowrap">' + fmt(ST.draft.knowledge.length) + ' / 60,000</span></span></div>';
  }

  /* ---------------- rules ---------------- */
  function tagList(path, label, ph, examples, hint) {
    const vals = getP(ST.draft, path) || [];
    const ro = !mgr();
    const id = 'tg_' + path.replace(/\./g, '_');
    return '<div class="field"><label class="lbl" for="' + id + '">' + esc(label) + '</label><div class="st-tagin" data-tags="' + path + '">' + vals.map((v, i) => '<span class="tg">' + esc(v) + (ro ? '' : '<button type="button" data-act="tagdel" data-arg="' + path + '|' + i + '" aria-label="Remove ' + esc(v) + '">' + ic('x', '#121110', 12, 2.6) + '</button>') + '</span>').join('') +
      (ro ? '' : '<input id="' + id + '" data-tagin="' + path + '" placeholder="' + esc(ph) + '" maxlength="200">') + '</div>' +
      (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') +
      (!ro && examples && examples.length ? '<div class="st-ex">' + examples.filter(e => !vals.includes(e)).map(e => '<button type="button" data-act="tagex" data-arg="' + path + '|' + esc(e) + '">+ ' + esc(e) + '</button>').join('') + '</div>' : '') + '</div>';
  }
  function rulesHtml(coach) {
    const r = ST.draft.rules, ro = mgr() ? '' : ' disabled';
    const ck = (path, t, d) => '<label class="st-check"><input type="checkbox" data-bind="' + path + '"' + (getP(ST.draft, path) ? ' checked' : '') + ro + '><span>' + esc(t) + (d ? '<small>' + esc(d) + '</small>' : '') + '</span></label>';
    return '<div class="dgrid" style="gap:14px"><div class="c6 col" style="gap:14px;min-width:0">' +
      tagList('rules.do', 'Always do', 'Type a rule and press Enter', ['Suggest a bundle when it helps', 'Ask for their city before quoting delivery', 'Thank them for their order'], 'Plain words, one rule each.') +
      tagList('rules.dont', 'Never do', 'Type a rule and press Enter', ['Promise exact delivery dates', 'Discuss competitors', 'Give medical advice']) +
      tagList('rules.avoid', 'Topics to avoid', 'e.g. politics', ['politics', 'religion', 'other customers']) +
      tagList('rules.required', 'Always include', 'e.g. — Your shop team', [], 'A sign-off or line it adds to replies.') +
      '</div><div class="c6 col" style="gap:14px;min-width:0">' +
      '<div class="field"><span class="lbl">Discounts</span><div class="st-sub" role="group" aria-label="Discounts">' + [['knowledge', 'Only from my knowledge'], ['never', 'Never'], ['max', 'Up to a limit']].map(o => '<button type="button" class="chip' + (r.discount.mode === o[0] ? ' on' : '') + '" data-act="disc" data-arg="' + o[0] + '" aria-pressed="' + (r.discount.mode === o[0]) + '"' + ro + '>' + o[1] + '</button>').join('') + '</div>' +
      (r.discount.mode === 'max' ? '<div class="row" style="gap:8px;margin-top:6px"><label class="lbl" for="discMax" style="font-weight:600">Most it may offer</label><input id="discMax" class="input" type="number" min="1" max="90" value="' + r.discount.max + '" data-bind="rules.discount.max" style="width:90px;padding:9px 12px"' + ro + '><strong>%</strong></div>' : '') + '</div>' +
      '<div class="field"><span class="lbl">Pass the chat to you when…</span><div class="st-checks">' + ck('rules.handoff.angry', 'The customer is angry') + ck('rules.handoff.refund', 'They ask for a refund', 'Or cancel / withdraw') + ck('rules.handoff.human', 'They ask for a human') + ck('rules.handoff.legal', 'Legal, medical or money advice') + '</div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px"><label class="lbl" for="ordOver" style="font-weight:600">Orders over</label><input id="ordOver" class="input" type="number" min="0" step="1" value="' + (r.handoff.order_over || '') + '" placeholder="0 = off" data-bind="rules.handoff.order_over" style="width:120px;padding:9px 12px"' + ro + '><span class="hint">in your currency</span></div></div>' +
      tagList('rules.handoff.keywords', 'Also hand over when they mention', 'e.g. wholesale', ['wholesale', 'partnership', 'press']) +
      '<div class="field"><label class="lbl" for="rHours">Working hours note</label><input id="rHours" class="input" maxlength="300" data-bind="rules.hours" value="' + esc(r.hours) + '" placeholder="e.g. Our team replies Mon to Sat, 9am to 6pm."' + ro + '></div>' +
      '<div class="field"><span class="lbl">Language</span><div class="row" style="gap:8px;flex-wrap:wrap"><div class="st-sub" role="group" aria-label="Language"><button type="button" class="chip' + (r.language.mode === 'auto' ? ' on' : '') + '" data-act="lang" data-arg="auto" aria-pressed="' + (r.language.mode === 'auto') + '"' + ro + '>Customer’s language</button><button type="button" class="chip' + (r.language.mode === 'force' ? ' on' : '') + '" data-act="lang" data-arg="force" aria-pressed="' + (r.language.mode === 'force') + '"' + ro + '>Always one language</button></div>' + (r.language.mode === 'force' ? '<label class="sr" for="rLang">Language</label><input id="rLang" class="input" maxlength="40" data-bind="rules.language.lang" value="' + esc(r.language.lang) + '" placeholder="e.g. English" style="width:160px;padding:9px 12px"' + ro + '>' : '') + '</div></div>' +
      (coach ? '<div class="col" style="gap:12px;border-top:1px solid var(--line);padding-top:14px"><div class="row" style="gap:12px"><span class="col grow" style="gap:0"><strong style="font-size:15px">Pass to me</strong><span class="small muted">Pass chats to you using the rules above</span></span><button class="toggle ' + (ST.draft.skills.handoff !== false ? 'on' : 'off') + '" data-act="skill" data-arg="handoff" aria-label="Smart handoff" aria-pressed="' + (ST.draft.skills.handoff !== false) + '"' + ro + '><span></span></button></div><div class="row" style="gap:12px"><span class="col grow" style="gap:0"><strong style="font-size:15px">Payment link</strong><span class="small muted">Send your payment link when they’re ready</span></span><button class="toggle ' + (ST.draft.skills.paylink ? 'on' : 'off') + '" data-act="skill" data-arg="paylink" aria-label="PayLink" aria-pressed="' + !!ST.draft.skills.paylink + '"' + ro + '><span></span></button></div>' + payHtml() + '</div>' : '') +
      '</div></div>';
  }

  /* ---------------- test lab, score, gaps, channels, history ---------------- */
  function allScenarios() { return (ST.scenarios.length ? ST.scenarios : DEFAULT_SCEN).concat((ST.custom || []).map(c => ({ key: 'c_' + c.id, text: c.text, expect: c.expect, label: (EXPECTS.find(e => e[0] === c.expect) || EXPECTS[0])[1], custom: c.id }))); }
  const DEFAULT_SCEN = [{ key: 'price', text: 'What’s your price?', expect: 'price', label: 'Gives a price' }, { key: 'deliver', text: 'Do you deliver to London?', expect: 'answer', label: 'Answers delivery' }, { key: 'refund', text: 'I want a refund!', expect: 'handoff', label: 'Hands over to a human' }, { key: 'bot', text: 'Are you a bot?', expect: 'honest', label: 'Honest that it’s an AI' }, { key: 'discount', text: 'Can I get a discount?', expect: 'discount', label: 'Follows your discount rule' }, { key: 'unknown', text: 'Can you engrave a name on it?', expect: 'graceful', label: 'Says it will check, doesn’t invent' }];
  function resBadge(r, running) {
    if (running) return '<span class="st-res none"><span class="spin" style="display:inline-block;width:10px;height:10px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:aSpin .8s linear infinite;vertical-align:-1px"></span> Running</span>';
    if (!r) return '<span class="st-res none">Not run</span>';
    return r.pass ? '<span class="st-res pass">✓ Pass</span>' : '<span class="st-res att">! Needs attention</span>';
  }
  function testsHtml() {
    const list = allScenarios();
    const ran = list.filter(s => ST.runs[s.key]).length, passed = list.filter(s => ST.runs[s.key] && ST.runs[s.key].pass).length;
    return '<div class="row" style="gap:10px;flex-wrap:wrap"><span class="col grow" style="gap:0"><strong style="font-size:16px">Quick tests</strong><span class="small muted">' + ran + ' run · ' + passed + ' passed. Each one asks your helper like a real customer and checks the reply.</span></span><button class="btn btn-ink btn-sm" data-act="runall" id="runAll">' + ic('bolt', '#FFC21A', 16) + 'Run all</button></div>' +
      '<div class="st-list" id="scenList">' + list.map(s => { const r = ST.runs[s.key]; return '<div class="st-scen"><div class="bd"><strong style="font-size:14.5px">“' + esc(s.text) + '”</strong><span class="small muted" style="display:block">Expect: ' + esc(s.label) + '</span>' + (r && r.reply ? '<div class="st-reply">' + esc(r.reply) + (r.note ? '<br><b style="color:' + (r.pass ? '#14532D' : '#9A2A12') + '">' + esc(r.note) + '</b>' : '') + '</div>' : '') + '</div>' + resBadge(r, ST.running[s.key]) + '<button class="btn btn-ghost btn-sm" data-act="run" data-arg="' + esc(s.key) + '">' + (r ? 'Run again' : 'Run') + '</button>' + (s.custom && mgr() ? '<button class="st-ib" data-act="scdel" data-arg="' + esc(s.custom) + '" aria-label="Delete scenario">' + ic('trash', '#9A2A12', 15) + '</button>' : '') + '</div>'; }).join('') + '</div>' +
      (mgr() && ST.id ? '<form class="st-add" data-form="scen"><strong style="font-size:15px">Add your own scenario</strong><div class="st-two"><div class="field"><label class="lbl" for="scText">Customer says</label><input id="scText" class="input" maxlength="300" placeholder="e.g. Can I pay on delivery?" required></div><div class="field"><label class="lbl" for="scExp">Expect</label><select id="scExp" class="input">' + EXPECTS.map(e => '<option value="' + e[0] + '">' + esc(e[1]) + '</option>').join('') + '</select></div></div><button class="btn btn-ink btn-sm" type="submit" style="align-self:flex-start">' + ic('plus', '#FFC21A', 16, 2.6) + 'Add scenario</button></form>' : '');
  }
  function checklistHtml() {
    return '<div class="st-ck">' + ST.checklist.map(c => '<button data-act="go" data-arg="' + c.go + '" class="' + (c.done ? 'done' : '') + '"><span class="ckx">' + (c.done ? '✓' : '') + '</span><span class="t"><b>' + esc(c.label) + '</b><small>' + esc(c.hint) + '</small></span><span class="pts">' + c.points + ' pts</span>' + ic('right', '#948F82', 14, 2.4) + '</button>').join('') + '</div>';
  }
  function scoreHtml() {
    return '<div class="st-scorebig">' + ringHtml(ST.score, 120) + '<span class="col grow" style="gap:4px;min-width:200px"><strong style="font-size:20px;letter-spacing:-0.03em">' + (ST.score >= 80 ? 'Ready to sell.' : ST.score >= 50 ? 'Getting there.' : 'Let’s train it up.') + '</strong><span class="muted small">Your how ready shows how well ' + esc(ST.draft.name || 'your helper') + ' knows your business. Tap any item to fix it.</span></span></div>' + checklistHtml();
  }
  function gapsHtml() {
    if (!ST.id) return needSaved();
    return '<div class="col" style="gap:4px"><strong style="font-size:16px">Questions your helper couldn’t answer</strong><span class="small muted">From real chats where it handed over, said it would check, or a teammate stepped in. Teach the answer once and it’s covered next time.</span></div>' +
      '<div class="st-list">' + (ST.gaps.length ? ST.gaps.map((g, i) => '<div class="st-gap"><span class="cnt">' + g.count + '<small>' + (g.count === 1 ? 'TIME' : 'TIMES') + '</small></span><div class="bd"><strong style="font-size:14.5px;overflow-wrap:anywhere">“' + esc(g.question) + '”</strong><span class="small muted" style="display:block">' + esc(g.reasons.map(r => ({ handoff: 'handed over', unsure: 'said it would check', human: 'a teammate stepped in' }[r] || r)).join(' · ')) + ' · ' + RV.ago(g.last_seen) + (g.threads && g.threads[0] ? ' · <a href="/app/inbox?t=' + g.threads[0] + '" style="font-weight:800">Open chat</a>' : '') + '</span></div>' + (mgr() ? '<button class="btn btn-ink btn-sm" data-act="teach" data-arg="' + i + '">Teach the answer</button><button class="btn btn-ghost btn-sm" data-act="dismiss" data-arg="' + i + '">Dismiss</button>' : '') + '</div>').join('')
        : '<div class="st-empty-k">' + RV.waitingArt(140, 'No gaps') + '<strong style="color:var(--ink)">Nothing to teach right now</strong>When a customer asks something your helper can’t answer, it shows up here.</div>') + '</div>';
  }
  function channelsHtml() {
    if (!ST.id) return needSaved();
    const chans = (ST.chans || []).filter(c => c.status === 'active');
    const mine = chans.filter(c => c.closer_id === ST.id);
    const live = ST.closer && ST.closer.active;
    return '<div class="st-live"><span style="flex:0 0 auto">' + RV.closerBot(color(), 56, letter()) + '</span><span class="col grow" style="gap:2px;min-width:200px"><strong style="font-size:18px">' + (live ? esc(ST.draft.name) + ' is live' : esc(ST.draft.name) + ' is paused') + '</strong><span style="font-size:13.5px;color:#C4BFB3">' + (live ? (mine.length ? 'Answering on ' + mine.map(c => esc(c.username ? '@' + c.username : c.name)).join(', ') + '.' : 'Live, but not on a channel yet. Assign one below.') : 'It won’t reply to anyone until you switch it on.') + '</span></span>' + (mgr() ? '<button class="toggle ' + (live ? 'on' : 'off') + '" data-act="live" aria-label="' + (live ? 'Pause' : 'Go live') + '" aria-pressed="' + !!live + '"><span></span></button>' : '') + '</div>' +
      '<div class="col" style="gap:4px;margin-top:4px"><strong style="font-size:16px">Channels</strong><span class="small muted">Pick where ' + esc(ST.draft.name) + ' answers. One helper can answer on many channels.</span></div>' +
      '<div class="st-list">' + (chans.length ? chans.map(c => { const other = c.closer_id && c.closer_id !== ST.id ? (S.closers || []).find(x => x.id === c.closer_id) : null; return '<div class="st-chan">' + RV.brandIcon(c.type === 'website' ? 'website' : c.type === 'whatsapp' ? 'whatsapp' : 'telegram', 40) + '<span class="col grow" style="gap:0;min-width:160px"><strong>' + esc(c.username ? '@' + c.username : c.name) + '</strong><span class="small muted">' + esc(RV.chanLabel ? RV.chanLabel(c.type) : c.type) + (c.closer_id === ST.id ? ' · answered by ' + esc(ST.draft.name) : other ? ' · answered by ' + esc(other.name) : ' · no helper') + '</span></span>' + (mgr() ? (c.closer_id === ST.id ? '<button class="btn btn-ghost btn-sm" data-act="unassign" data-arg="' + c.id + '">Remove</button>' : '<button class="btn btn-ink btn-sm" data-act="assign" data-arg="' + c.id + '">Assign ' + esc(ST.draft.name) + '</button>') : '') + '</div>'; }).join('')
        : '<div class="st-empty-k"><strong style="color:var(--ink)">No channels yet</strong>Connect a Telegram bot or add website chat, then come back to assign it.</div>') + '</div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap"><a class="btn btn-ghost btn-sm" href="/app/channels">' + RV.brandIcon('telegram', 22) + 'Connect Telegram</a>' + (RV.chan('website') !== 'off' ? '<a class="btn btn-ghost btn-sm" href="/app/widget">' + RV.brandIcon('website', 22) + 'Website chat</a>' : '') + (RV.chan('whatsapp') === 'live' ? '<a class="btn btn-ghost btn-sm" href="/app/channels">' + RV.brandIcon('whatsapp', 22) + 'Connect WhatsApp</a>' : '') + '</div>';
  }
  function historyHtml() {
    if (!ST.id) return needSaved();
    return '<div class="col" style="gap:4px"><strong style="font-size:16px">Saved versions</strong><span class="small muted">The last 10 saves of name, personality, instructions and rules. Knowledge items aren’t part of a version.</span></div>' +
      '<div class="st-list">' + (ST.versions.length ? ST.versions.map((v, i) => '<div class="st-ver"><span style="flex:0 0 38px;height:38px;border-radius:12px;background:' + (i === 0 ? 'var(--jade)' : 'var(--soft)') + ';display:grid;place-items:center">' + ic('clock', '#121110', 17) + '</span><span class="col grow" style="gap:0;min-width:160px"><strong>' + esc(v.label || 'Saved') + (i === 0 ? ' <span class="pill" style="background:var(--mint);color:var(--jade-dd)">Current</span>' : '') + '</strong><span class="small muted">' + RV.date(v.created_at) + ' ' + RV.time(v.created_at) + (v.user ? ' · ' + esc(v.user) : '') + '</span></span>' + (i > 0 && mgr() ? '<button class="btn btn-ghost btn-sm" data-act="restore" data-arg="' + v.id + '">Restore</button>' : '') + '</div>').join('') : '<div class="st-empty-k">No saved versions yet.</div>') + '</div>';
  }
  function launchHtml() {
    const nm = esc(ST.draft.name || tplOf().name), sc = ST.score, more = Math.max(0, Math.ceil((80 - sc) / 12));
    return '<div id="stInline" class="st-inline"></div>' +
      '<p class="muted" style="margin:0">' + nm + ' is <b style="color:var(--ink)">' + sc + '% ready</b>. ' + (sc >= 80 ? 'Great work.' : 'Add ' + Math.max(1, more) + ' more ' + (more === 1 ? 'answer' : 'answers') + ' to reach 80%. ') + (sc < 80 && mgr() ? '<button class="btn-link" data-act="step" data-arg="3" style="font-weight:800">Add answers</button>' : '') + ' ' + RV.whats('score') + '</p>';
  }

  function paintPro(el) {
    const counts = { knowledge: ST.items.length, gaps: ST.gaps.length, tests: Object.keys(ST.runs).length };
    el.innerHTML = '<nav class="st-tabs" role="tablist" aria-label="Studio sections">' + TABS.map(t => '<button role="tab" aria-selected="' + (ST.tab === t[0]) + '" class="' + (ST.tab === t[0] ? 'on' : '') + '" data-act="tab" data-arg="' + t[0] + '">' + t[1] + (t[0] === 'knowledge' && ST.id ? '<span class="n">' + counts.knowledge + '</span>' : '') + (t[0] === 'gaps' && counts.gaps ? '<span class="n hot">' + counts.gaps + '</span>' : '') + '</button>').join('') + '</nav>' +
      '<section class="panel a-in" role="tabpanel" id="stTab">' + tabBody() + '</section>';
    afterBody();
  }
  function tabBody() {
    switch (ST.tab) {
      case 'knowledge': return '<div class="st-sub" role="group" aria-label="Knowledge type">' + KTABS.map(k => '<button class="chip' + (ST.ktab === k[0] ? ' on' : '') + '" data-act="ktab" data-arg="' + k[0] + '" aria-pressed="' + (ST.ktab === k[0]) + '">' + k[1] + '<span class="n">' + kCount(k[0]) + '</span></button>').join('') + '</div><div id="stK" class="col" style="gap:12px">' + knowledgeBody(ST.ktab) + '</div>';
      case 'rules': return rulesHtml(false);
      case 'tests': return ST.id ? scoreHtml() + '<hr class="ws-hr">' + testsHtml() : testsHtml();
      case 'gaps': return gapsHtml();
      case 'channels': return channelsHtml();
      case 'history': return historyHtml();
      default: return personalityHtml(true);
    }
  }
  function repaintK() { const k = $('stK'); if (k) { k.innerHTML = ST.mode === 'coach' ? knowledgeBody(ST.ktab === 'notes' ? 'qa' : ST.ktab, true) : knowledgeBody(ST.ktab); } RV.qsa('#stMain [data-act="ktab"] .n').forEach(n => { const b = n.closest('button'); n.textContent = kCount(b.getAttribute('data-arg')); }); }
  function repaintBody() { if (ST.mode === 'coach') { const b = $('coBody'); if (b) { b.innerHTML = stepBody(ST.step); afterBody(); } } else { const t = $('stTab'); if (t) { t.innerHTML = tabBody(); afterBody(); } } }

  /* ---------------- test chat ---------------- */
  function paintDock() {
    // Step 5 shows the test chat right in the page; everywhere else it sits on the side (or in a drawer on phones).
    const inline = ST.mode === 'coach' && ST.step === 5 && $('stInline');
    const dock = $('stDock'); if (!dock) return;
    const el = inline || dock;
    if (inline) dock.innerHTML = ''; else { const i = $('stInline'); if (i) i.innerHTML = ''; }
    const fab = RV.qs('#stRoot .st-chatfab'); if (fab) fab.hidden = !!inline;
    const t = tplOf();
    const sug = ['How much is it?', 'Do you deliver?', 'Can I talk to a person?'];
    el.innerHTML = '<div class="st-chat"><div class="st-chat-h"><span style="flex:0 0 38px" id="dkBot">' + RV.closerBot(color(), 38, letter()) + '</span><span class="col grow" style="gap:0;line-height:1.25;min-width:0"><strong class="ell">Test chat</strong><span style="font-size:12px;color:var(--jade-dd);font-weight:700" class="ell"><span id="dkName" hidden>' + esc(ST.draft.name || t.name) + '</span>Only you can see this</span></span><button class="btn" data-act="chatreset" aria-label="Restart test chat" title="Restart" style="width:34px;height:34px;padding:0;background:var(--soft)">' + ic('M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5', '#121110', 16) + '</button><button class="btn show-sm-dock" data-act="chatclose" aria-label="Close test chat" style="width:34px;height:34px;padding:0;background:var(--soft)">' + ic('x', '#121110', 16, 2.4) + '</button></div>' +
      '<div class="st-chat-m" id="dkMsgs" aria-live="polite"></div><div class="st-chat-s" id="dkSug">' + sug.map(q => '<button type="button" class="chip" data-act="sug" data-arg="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>' +
      '<form data-form="chat" autocomplete="off" novalidate><label for="dkIn" class="sr">Test message</label><input id="dkIn" class="input" placeholder="Ask like a customer…" style="padding:10px 14px;font-size:14px;border-radius:999px"><button class="btn btn-jade" type="submit" aria-label="Send test message" style="width:42px;height:42px;padding:0;flex:0 0 42px">' + ic('send', '#121110', 18, 2.2) + '</button></form>' +
      '<p class="small muted" style="margin:0;padding:0 12px 10px;background:#fff;text-align:center;font-size:12px">Testing is free.</p></div>';
    paintMsgs();
  }
  function paintMsgs() {
    const el = $('dkMsgs'); if (!el) return;
    const t = tplOf();
    el.innerHTML = ST.chat.length ? ST.chat.map((h, i) => {
      if (h.role === 'note') return '<div class="bub-note" style="background:#E8F6EC;color:#14532D">' + esc(h.text) + (h.again ? ' <button class="btn-link" data-act="again" data-arg="' + i + '" style="color:inherit">Ask again</button>' : '') + '</div>';
      if (h.role === 'user') return '<div class="bub-in" style="border:1px solid var(--line)">' + esc(h.text) + '</div>';
      const src = h.handoff || !h.used ? [] : [h.used].filter(x => x && x.label);
      return '<div class="bub-out' + (h.fresh ? ' a-in' : '') + '" data-i="' + i + '"><span data-txt>' + esc(h.shown != null ? h.shown : h.text) + '</span>' + (h.handoff ? '<span class="bub-meta">→ would pass this chat to you</span>' : '') + (src.length && h.shown == null ? '<span class="st-src">' + src.map(s => '<span title="' + esc(s.label) + '">✓ ' + esc({ correction: 'Fixed answer', qa: 'Your answer', product: 'Price', policy: 'Policy', doc: 'Your website' }[s.kind] || 'What you taught') + ': ' + esc(s.label) + '</span>').join('') + '</span>' : '') + '</div>' +
        (mgr() && ST.id && h.shown == null && !h.fixed ? '<button class="st-fixb" data-act="fix" data-arg="' + i + '">✎ Fix this answer</button>' : '');
    }).join('') : '<div class="col" style="margin:auto;align-items:center;text-align:center;gap:8px;color:var(--mut);font-size:13.5px;padding:10px"><span class="a-floats">' + RV.closerBot(color(), 64, letter()) + '</span><strong style="color:var(--ink)">Say hi to ' + esc(ST.draft.name || t.name) + '</strong>Tap a question below, or type your own. If a reply is off, tap “Fix this answer”.</div>';
    el.scrollTop = el.scrollHeight;
  }
  function body() { const d = ST.draft; return { name: d.name, template: d.template, persona: d.persona, skills: d.skills, instructions: d.instructions, knowledge: d.knowledge, pay_link: d.pay_link, pro_brain: d.pro_brain, rules: Object.assign({}, d.rules, { set: true }) }; }
  // Streams a reply into the chat word by word (the API returns it whole).
  async function streamIn(h) {
    if (RV.reduced()) { h.shown = null; paintMsgs(); return; }
    const words = h.text.split(/(\s+)/); h.shown = ''; h.fresh = true; paintMsgs();
    const el = $('dkMsgs'); const node = el && el.querySelector('[data-i="' + ST.chat.indexOf(h) + '"] [data-txt]');
    for (let i = 0; i < words.length; i++) { h.shown += words[i]; if (node && node.isConnected) { node.textContent = h.shown; if (i % 6 === 0) el.scrollTop = el.scrollHeight; } await new Promise(r => setTimeout(r, 18)); }
    h.shown = null; paintMsgs(); h.fresh = false;
  }
  async function ask(text, scenario) {
    const s = ST; if (!$('dkMsgs')) return null;
    const history = s.chat.filter(h => h.role !== 'note').slice(-8).map(h => ({ role: h.role, text: h.text }));
    s.chat.push({ role: 'user', text }); paintMsgs();
    const el = $('dkMsgs'); el.insertAdjacentHTML('beforeend', '<div class="bub-out" id="dkTyping" style="display:flex;gap:5px;padding:12px 14px;background:var(--mint2)"><span class="dot" style="background:#121110"></span><span class="dot" style="background:#121110"></span><span class="dot" style="background:#121110"></span></div>'); el.scrollTop = el.scrollHeight;
    try {
      const r = await POST('/api/app/closers/preview', Object.assign(body(), { closer_id: s.id || undefined, message: text, history, scenario: scenario || undefined }));
      if (ST !== s) return r;
      const used = r.used ? Object.assign({}, r.used, { label: (s.items.find(i => i.id === r.used.id) || {}).question || (s.items.find(i => i.id === r.used.id) || {}).title || '' }) : null;
      const h = { role: 'assistant', text: r.text, handoff: r.handoff, sources: r.sources || [], used, q: text };
      s.chat.push(h); RV.store.set('tested_' + S.boot.workspace.id, true);
      if (!r.handoff && !used && /\?|how|what|do you|can i/i.test(text)) s.chat.push({ role: 'note', text: (s.draft.name || 'Your helper') + ' didn’t know that yet. Tap “Fix this answer” to teach it.' });
      await streamIn(h);
      return r;
    } catch (e) { s.chat.pop(); paintMsgs(); fail(e); return null; }
  }

  /* ---------------- fix an answer (shared with Pulse Inbox) ---------------- */
  RV.fixAnswer = function (o) {
    const m = RV.modal('<div class="col" style="gap:14px"><span class="row" style="gap:10px">' + RV.closerBot(o.color || '#FFC21A', 44, (o.closerName || 'A').charAt(0)) + '<span class="col" style="gap:0"><strong class="h3">Fix this answer</strong><span class="small muted">' + esc(o.closerName || 'Your AI helper') + ' will use your answer from now on.</span></span></span>' +
      '<div class="field"><label class="lbl" for="fxQ">Customer asked</label><input id="fxQ" data-dictate class="input" maxlength="400" value="' + esc(o.question || '') + '" placeholder="The customer’s question"></div>' +
      (o.answer ? '<div class="col" style="gap:4px"><span class="lbl">AI said</span><div style="background:#FFF6F3;border:1px solid #FFD2C4;border-radius:14px;padding:10px 12px;font-size:14px;color:#9A2A12;overflow-wrap:anywhere">' + esc(o.answer) + '</div></div>' : '') +
      '<div class="field"><label class="lbl" for="fxA">The right answer</label><textarea id="fxA" data-dictate class="input" rows="4" maxlength="4000">' + esc(o.answer || '') + '</textarea><span class="hint">Write it the way you’d say it in chat. This answer always wins.</span></div>' +
      '<div class="row" style="justify-content:flex-end;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-ink" id="fxSave">' + ic('check', '#FFC21A', 16, 2.6) + 'Save answer</button></div></div>', { label: 'Fix this answer', noFocus: true });
    setTimeout(() => { const a = $('fxA'); if (a) { a.focus(); a.select(); } }, 60);
    $('fxSave').addEventListener('click', async () => {
      const q = $('fxQ').value.trim(), a = $('fxA').value.trim();
      if (!q) { toast('Type the customer’s question first.', 'err'); $('fxQ').focus(); return; }
      if (!a || a === (o.answer || '').trim()) { toast('Change the answer first, then save.', 'err'); $('fxA').focus(); return; }
      const b = $('fxSave'); RV.busy(b, true, 'Saving…');
      try {
        const it = await POST('/api/app/closers/' + o.closerId + '/knowledge', { kind: 'correction', question: q, answer: a, source: 'correction', data: { ai_answer: (o.answer || '').slice(0, 2000) } });
        RV.closeModal(); toast('Saved. ' + (o.closerName || 'Your AI helper') + ' will use it from now on.');
        if (o.onSaved) o.onSaved(it);
      } catch (e) { RV.busy(b, false); fail(e); }
    });
    return m;
  };

  /* ---------------- data refresh ---------------- */
  async function reloadTraining(keepChat) {
    if (!ST.id) return;
    const s = ST;
    try {
      const d = await GET('/api/app/closers/' + s.id + '/training');
      if (ST !== s) return;
      Object.assign(s, { closer: d.closer, items: d.items, custom: d.custom || [], runs: d.runs || {}, scenarios: d.scenarios || [], score: d.score, checklist: d.checklist, counts: d.counts, gaps: d.gaps || [], versions: d.versions || [], coach: d.coach || s.coach });
      if (!keepChat) s.chat = [];
    } catch (e) { fail(e); }
  }
  async function refreshScore() {
    if (!ST.id) return;
    const s = ST;
    try {
      const [sc, gaps] = await Promise.all([GET('/api/app/closers/' + s.id + '/score'), GET('/api/app/closers/' + s.id + '/gaps')]);
      if (ST !== s) return;
      const before = s.score;
      s.score = sc.score; s.checklist = sc.checklist; s.counts = sc.counts; s.gaps = gaps;
      paintHead(); tabCounts();
      if (s.score > before && s.score >= 80 && before < 80) { RV.confetti(30); toast(s.draft.name + ' hit a how ready of ' + s.score + '. Ready to sell!'); }
      if (S.closers) { const c = S.closers.find(x => x.id === s.id); if (c) { c.score = s.score; c.gaps = gaps.length; } }
    } catch (e) { /* keep the old score */ }
  }
  function tabCounts() {
    RV.qsa('#stMain .st-tabs button').forEach(b => {
      const t = b.getAttribute('data-arg'); const n = b.querySelector('.n');
      if (t === 'knowledge' && n) n.textContent = ST.items.length;
      if (t === 'gaps') { if (ST.gaps.length) { if (n) n.textContent = ST.gaps.length; else b.insertAdjacentHTML('beforeend', '<span class="n hot">' + ST.gaps.length + '</span>'); } else if (n) n.remove(); }
    });
  }
  async function afterKnowledge() { await reloadTraining(true); paintHead(); if (ST.mode === 'pro' && ST.tab !== 'knowledge') repaintBody(); else repaintK(); tabCounts(); }

  /* ---------------- events ---------------- */
  function onInput(e) {
    const t = e.target;
    if (t.hasAttribute('data-search')) { ST.q = t.value; const l = $('qaList'); if (l) { const pos = t.selectionStart; repaintK(); const ns = RV.qs('#stMain [data-search]'); if (ns) { ns.focus(); try { ns.setSelectionRange(pos, pos); } catch (er) { /* */ } } } return; }
    const p = t.getAttribute('data-bind'); if (!p || t.type === 'checkbox') return;
    let v = t.value;
    if (t.type === 'range' || t.type === 'number') v = t.value === '' ? 0 : +t.value;
    if (t.type === 'range') t.style.setProperty('--p', t.value + '%');
    setP(ST.draft, p, v); markDirty();
    if (p === 'name' || p.startsWith('persona.')) { syncSample(); const n = $('dkBot'); if (n && p === 'name') { n.innerHTML = RV.closerBot(color(), 38, letter()); const dn = $('dkName'); if (dn) dn.textContent = ST.draft.name || tplOf().name; } const cb = $('coCreate'); if (cb && p === 'name') cb.firstChild.textContent = 'Create ' + (ST.draft.name || tplOf().name) + ' & keep training'; const sb = $('smBot'); if (sb && p === 'name') sb.innerHTML = RV.closerBot(color(), 36, letter()); }
    if (p === 'knowledge') { const c = $('stCount'); if (c) c.textContent = fmt(v.length) + ' / 60,000'; }
  }
  function onChange(e) {
    const t = e.target;
    if (t.type === 'checkbox' && t.getAttribute('data-bind')) { setP(ST.draft, t.getAttribute('data-bind'), t.checked); markDirty(); return; }
    if (t.hasAttribute('data-file')) { const f = t.files && t.files[0]; t.value = ''; if (f) importFile(f); }
  }
  function onKey(e) {
    const t = e.target;
    if (t.hasAttribute && t.hasAttribute('data-tagin') && (e.key === 'Enter' || e.key === ',')) {
      e.preventDefault();
      const v = t.value.trim().replace(/,$/, ''); if (!v) return;
      addTag(t.getAttribute('data-tagin'), v);
    }
    if (t.hasAttribute && t.hasAttribute('data-tagin') && e.key === 'Backspace' && !t.value) {
      const path = t.getAttribute('data-tagin'), arr = getP(ST.draft, path) || [];
      if (arr.length) { arr.pop(); markDirty(); repaintTags(path); }
    }
  }
  function addTag(path, v) {
    const arr = (getP(ST.draft, path) || []).slice();
    if (arr.length >= 15) { toast('That’s the most rules for one list.', 'err'); return; }
    if (!arr.includes(v)) arr.push(v.slice(0, 200));
    setP(ST.draft, path, arr); markDirty(); repaintTags(path);
  }
  function repaintTags(path) {
    repaintBody();
    const ni = RV.qs('#stMain [data-tagin="' + path + '"]'); if (ni) ni.focus({ preventScroll: true });
  }
  async function onSubmit(e) {
    const f = e.target.closest('[data-form]'); if (!f) return;
    e.preventDefault();
    const kind = f.getAttribute('data-form');
    if (kind === 'chat') { const i = $('dkIn'); const v = i.value.trim(); if (!v) return; i.value = ''; ask(v); return; }
    if (kind === 'qa') {
      const q = $('qaQ').value.trim(), a = $('qaA').value.trim(), alt = ($('qaAlt') || {}).value || '';
      const qe = $('qaQErr'), ae = $('qaAErr'); if (qe) qe.hidden = true; if (ae) ae.hidden = true;
      if (!q) { if (qe) { qe.textContent = 'Type the question first.'; qe.hidden = false; } $('qaQ').focus(); return; }
      if (!a) { if (ae) { ae.textContent = 'Type the answer first.'; ae.hidden = false; } $('qaA').focus(); return; }
      const b = f.querySelector('[type=submit]'); RV.busy(b, true, 'Adding…');
      try { await POST('/api/app/closers/' + ST.id + '/knowledge', { kind: 'qa', question: q, answer: a, data: { alt } }); toast('Saved. Try asking it in the test chat.'); ST.q = ''; await afterKnowledge(); const nq = $('qaQ'); if (nq) nq.focus(); }
      catch (er) { RV.busy(b, false); fail(er); }
      return;
    }
    if (kind === 'url') { importUrl(); return; }
    if (kind === 'scen') {
      const text = $('scText').value.trim(), expect = $('scExp').value; if (!text) return;
      try { const r = await PUT('/api/app/closers/' + ST.id + '/scenarios', { scenarios: (ST.custom || []).concat([{ text, expect }]) }); ST.custom = r.scenarios; repaintBody(); toast('Scenario added'); }
      catch (er) { fail(er); }
    }
  }
  async function onClick(e) {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.getAttribute('data-act'), arg = b.getAttribute('data-arg');
    const s = ST;
    switch (act) {
      case 'mode': s.mode = arg; saveUi(); paintHead(); paintMain(); if (arg === 'coach') window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'step': gotoStep(+arg); break;
      case 'next': gotoStep(s.step + 1, true); break;
      case 'back': gotoStep(s.step - 1); break;
      case 'tab': s.mode = 'pro'; s.tab = arg; saveUi(); paintHead(); paintMain(); break;
      case 'ktab': s.ktab = arg; s.q = ''; saveUi(); RV.qsa('#stMain [data-act="ktab"]').forEach(x => { const on = x.getAttribute('data-arg') === arg; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); repaintK(); break;
      case 'tpl': { const old = tplOf(), nt = RV.tpl(arg); if (!s.draft.name || s.draft.name === old.name) s.draft.name = nt.name; s.draft.template = nt.id; markDirty(); paintHead(); repaintBody(); paintDock(); break; }
      case 'color': s.draft.persona.color = arg; markDirty(); RV.qsa('#stMain .st-sw button').forEach(x => { const on = x.getAttribute('data-arg') === arg; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); { const sb = $('smBot'); if (sb) sb.innerHTML = RV.closerBot(color(), 36, letter()); const dk = $('dkBot'); if (dk) dk.innerHTML = RV.closerBot(color(), 38, letter()); } break;
      case 'skill': s.draft.skills[arg] = arg === 'handoff' ? s.draft.skills[arg] === false : !s.draft.skills[arg]; { const on = arg === 'handoff' ? s.draft.skills[arg] !== false : !!s.draft.skills[arg]; b.className = 'toggle ' + (on ? 'on' : 'off'); b.setAttribute('aria-pressed', on); } markDirty(); break;
      case 'tone': { const tn = TONES.find(x => x[0] === arg); if (tn) { Object.assign(s.draft.persona, tn[3]); markDirty(); RV.qsa('#stMain [data-act="tone"]').forEach(x => { const on = x.getAttribute('data-arg') === arg; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); }); syncSample(); } break; }
      case 'hsw': { const h = s.draft.rules.handoff; if (arg === 'big') h.order_over = h.order_over > 0 ? 0 : 200; else h[arg] = !h[arg]; if (arg !== 'big' && (h.angry || h.refund || h.human)) s.draft.skills.handoff = true; markDirty(); repaintBody(); break; }
      case 'pro': s.draft.pro_brain = !s.draft.pro_brain; b.className = 'toggle ' + (s.draft.pro_brain ? 'on' : 'off'); b.setAttribute('aria-pressed', s.draft.pro_brain); markDirty(); break;
      case 'disc': s.draft.rules.discount.mode = arg; markDirty(); repaintBody(); break;
      case 'lang': s.draft.rules.language.mode = arg; markDirty(); repaintBody(); break;
      case 'tagdel': { const [path, i] = arg.split('|'); const arr = (getP(s.draft, path) || []).slice(); arr.splice(+i, 1); setP(s.draft, path, arr); markDirty(); repaintTags(path); break; }
      case 'tagex': { const i = arg.indexOf('|'); addTag(arg.slice(0, i), arg.slice(i + 1)); break; }
      case 'save': await save(); break;
      case 'discard': discard(); break;
      case 'create': await create(); break;
      case 'finish': await finish(); break;
      case 'demo': openDemo(); break;
      case 'slot': RV.closerFull(); break;
      case 'checklist': openChecklist(); break;
      case 'go': goTo(arg); break;
      case 'chatopen': s.chatOpen = true; toggleDock(true); break;
      case 'chatclose': s.chatOpen = false; toggleDock(false); break;
      case 'chatreset': s.chat = []; paintMsgs(); break;
      case 'sug': if (window.innerWidth <= 1180 && !s.chatOpen) { s.chatOpen = true; toggleDock(true); } ask(arg); break;
      case 'again': { const prevQ = s.chat[+arg] && s.chat[+arg].q; s.chat[+arg].again = false; if (prevQ) ask(prevQ); break; }
      case 'fix': fixFromChat(+arg); break;
      case 'quickq': { const q = $('qaQ'); if (q) { q.value = arg; const a = $('qaA'); a.focus(); } break; }
      case 'bulk': openBulk(); break;
      case 'iedit': editItem(+arg); break;
      case 'idel': await delItem(+arg); break;
      case 'itoggle': await toggleItem(+arg, b); break;
      case 'padd': editProduct(null); break;
      case 'csv': openCsv(); break;
      case 'polsave': await savePolicy(arg, b); break;
      case 'polex': { const p = POLICIES.find(x => x[0] === arg); const t = $('pol_' + arg); if (p && t) { t.value = p[3]; t.focus(); } break; }
      case 'run': await runScenario(allScenarios().find(x => x.key === arg)); break;
      case 'runall': await runAll(b); break;
      case 'scdel': try { const r = await PUT('/api/app/closers/' + s.id + '/scenarios', { scenarios: s.custom.filter(c => c.id !== arg) }); s.custom = r.scenarios; repaintBody(); } catch (er) { fail(er); } break;
      case 'teach': teachGap(s.gaps[+arg]); break;
      case 'dismiss': await dismissGap(s.gaps[+arg]); break;
      case 'live': await setLive(b); break;
      case 'assign': case 'unassign': await assign(+arg, act === 'assign', b); break;
      case 'restore': await restore(+arg); break;
    }
  }
  function toggleDock(open) {
    const d = $('stDock'); if (!d) return;
    d.classList.toggle('open', open);
    const ex = RV.qs('#stRoot .st-dockovl');
    if (open && !ex) { const o = document.createElement('div'); o.className = 'st-dockovl'; o.setAttribute('data-act', 'chatclose'); $('stRoot').appendChild(o); }
    if (!open && ex) ex.remove();
    if (open) setTimeout(() => { const i = $('dkIn'); if (i) i.focus(); }, 300);
  }
  function gotoStep(n, forward) {
    if (n < 1 || n > 5) return;
    if (!ST.id && n > 2) { toast('Make your helper first. Tap the button at the bottom.', 'info'); return; }
    if (forward && mgr() && ST.id) {
      const done = new Set((ST.coach && ST.coach.done) || []); done.add(ST.step);
      ST.coach = Object.assign({}, ST.coach, { step: n, done: [...done] });
      PUT('/api/app/closers/' + ST.id + '/coach', { step: n, done: [...done], finished: !!(ST.coach && ST.coach.finished), personality_ok: ST.step === 2 }).then(() => { if (ST.step >= 3) refreshScore(); }).catch(() => {});
      if (ST.dirty && (ST.step === 2 || ST.step === 4)) save(true);
    }
    ST.step = n; saveUi(); paintMain();
    const r = $('stMain'); if (r) { const top = r.getBoundingClientRect().top + window.scrollY - 90; if (window.scrollY > top) window.scrollTo({ top, behavior: RV.reduced() ? 'auto' : 'smooth' }); }
  }
  function goTo(where) {
    RV.closeModal();
    const map = { personality: ['personality', null, 2], qa: ['knowledge', 'qa', 3], products: ['knowledge', 'products', 3], policies: ['knowledge', 'policies', 3], paylink: ['personality', null, 4], rules: ['rules', null, 4], tests: ['tests', null, 5], gaps: ['gaps', null, 5] };
    const m = map[where] || map.personality;
    if (ST.mode === 'coach' && where !== 'gaps') { if (m[1]) ST.ktab = m[1]; gotoStep(m[2]); }
    else { ST.mode = 'pro'; ST.tab = m[0]; if (m[1]) ST.ktab = m[1]; saveUi(); paintHead(); paintMain(); }
    if (where === 'paylink') setTimeout(() => { const p = $('stPay'); if (p) { p.scrollIntoView({ block: 'center' }); p.focus(); } }, 80);
  }
  function openChecklist() {
    RV.modal('<div class="col" style="gap:14px"><strong class="h3">Training checklist</strong>' + scoreHtml() + '</div>', { label: 'Training checklist', wide: true });
    RV.qsa('#modalRoot [data-act="go"]').forEach(b => b.addEventListener('click', () => goTo(b.getAttribute('data-arg'))));
  }

  /* ---------------- save / create / finish ---------------- */
  async function save(quiet) {
    const s = ST; if (!s.id) { await create(); return; }
    if (s.draft.pay_link && !/^https?:\/\//i.test(s.draft.pay_link)) { const pe = $('stPayErr'); if (pe) { pe.textContent = 'The link must start with https://'; pe.hidden = false; } toast('Your payment link must start with https://', 'err'); const p = $('stPay'); if (p) p.focus(); return; }
    const btn = $('stSaveBtn'); if (btn && !quiet) RV.busy(btn, true, 'Saving…');
    try {
      const c = await PUT('/api/app/closers/' + s.id, body());
      s.closer = c; s.draft = draftFrom(c); s.dirty = false; s.restored = false;
      RV.store.set(key(s.id) + '_draft', null);
      const rb = $('stRestored'); if (rb) rb.remove();
      await Promise.all([RV.loadClosers(true), reloadTraining(true)]); RV.paintChrome();
      if (ST !== s) return;
      $('stSaveWrap').innerHTML = ''; paintHead();
      if (!quiet) toast('Saved. ' + c.name + ' uses it from the next message.');
      if (s.mode === 'pro' && (s.tab === 'history' || s.tab === 'tests')) repaintBody();
    } catch (e) { if (btn) RV.busy(btn, false); fail(e); }
  }
  function discard() {
    const s = ST; if (!s.id) { ST = freshST(s.draft.template); ST.ctx = s.ctx; ST.chans = s.chans; paint(); return; }
    s.draft = draftFrom(s.closer); s.dirty = false; s.restored = false; RV.store.set(key(s.id) + '_draft', null);
    toast('Changes discarded'); paint();
  }
  async function create() {
    const s = ST;
    if ((S.closers || []).length >= S.boot.usage.closers_limit) { RV.closerFull(); return; }
    if (s.draft.pay_link && !/^https?:\/\//i.test(s.draft.pay_link)) { toast('Your payment link must start with https://', 'err'); return; }
    const btn = $('coCreate') || RV.qs('#stMain [data-act="create"]'); RV.busy(btn, true, 'Creating…');
    try {
      const coach = s.mode === 'coach';
      const c = await POST('/api/app/closers', Object.assign(body(), { active: !coach }));
      await Promise.all([RV.loadClosers(true), RV.refreshBoot()]);
      history.replaceState({}, '', '/app/studio?id=' + c.id);
      const d = await GET('/api/app/closers/' + c.id + '/training');
      const prevChat = s.chat;
      ST = fromServer(d); ST.chat = prevChat; ST.ctx = s.ctx; ST.chans = s.chans; ST.mode = s.mode; ST.tab = s.tab;
      ST.step = coach ? 3 : 1; ST.ktab = 'qa';
      if (coach) { ST.coach = { step: 3, done: [1, 2] }; PUT('/api/app/closers/' + c.id + '/coach', { step: 3, done: [1, 2], personality_ok: true }).then(refreshScore).catch(() => {}); }
      saveUi(); RV.paintChrome(); paint(); window.scrollTo(0, 0);
      RV.confetti(28);
      toast(c.name + ' is made. Now teach it what customers ask.');
    } catch (e) { RV.busy(btn, false); if (e.code === 'closer_limit') RV.closerFull(); else fail(e); }
  }
  async function finish() {
    const s = ST; const btn = $('coFinish'); RV.busy(btn, true);
    try {
      if (s.dirty) await save(true);
      const wasLive = s.closer.active;
      if (!wasLive) { const c = await PUT('/api/app/closers/' + s.id, { active: true }); s.closer = c; }
      await PUT('/api/app/closers/' + s.id + '/coach', { step: 5, done: [1, 2, 3, 4, 5], finished: true });
      s.coach = { step: 5, done: [1, 2, 3, 4, 5], finished: true };
      await RV.loadClosers(true); RV.paintChrome();
      s.chans = await RV.loadChannels(true).catch(() => s.chans);
      const mine = (s.chans || []).filter(c => c.closer_id === s.id && c.status === 'active');
      // Never "live" when nothing can reach it: with no place yet, the next step is choosing one.
      if (!mine.length) { RV.busy(btn, false); go('/app/channels'); toast('Last step: choose where ' + s.draft.name + ' answers.', 'info'); return; }
      RV.confetti(46);
      RV.modal('<div class="col" style="align-items:center;text-align:center;gap:12px"><div class="a-pop">' + RV.closerBot(color(), 120, letter()) + '</div><strong class="h3">' + esc(s.draft.name) + ' is answering on ' + mine.map(c => esc(RV.placeName(c))).join(', ') + '</strong><span class="muted">' + esc(s.draft.name) + ' is ' + s.score + '% ready. You can teach more answers any time.</span>' +
        '<a class="btn btn-ink" href="/app/inbox" data-close style="width:100%">Go to my chats</a><button class="btn btn-ghost" data-close id="fnPro" style="width:100%">Teach more answers</button></div>', { label: s.draft.name + ' is answering' });
      const pr = $('fnPro'); if (pr) pr.addEventListener('click', () => { gotoStep(3); });
      paintHead(); paintMain();
    } catch (e) { RV.busy(btn, false); fail(e); }
  }

  /* ---------------- knowledge actions ---------------- */
  async function delItem(id) {
    const it = ST.items.find(i => i.id === id); if (!it) return;
    if (!(await RV.confirmBox('Remove this?', '“' + (it.question || it.title).slice(0, 80) + '” will be removed from ' + ST.draft.name + '’s knowledge.', 'Remove', true))) return;
    try { await DEL('/api/app/closers/' + ST.id + '/knowledge/' + id); toast('Removed'); await afterKnowledge(); } catch (e) { fail(e); }
  }
  async function toggleItem(id, b) {
    const it = ST.items.find(i => i.id === id); if (!it) return;
    b.disabled = true;
    try { await PUT('/api/app/closers/' + ST.id + '/knowledge/' + id, { enabled: !it.enabled }); it.enabled = !it.enabled; toast(it.enabled ? 'Turned on' : 'Turned off. Your helper won’t use it.'); await afterKnowledge(); } catch (e) { b.disabled = false; fail(e); }
  }
  function editItem(id) {
    const it = ST.items.find(i => i.id === id); if (!it) return;
    if (it.kind === 'product') { editProduct(it); return; }
    const qa = it.kind === 'qa' || it.kind === 'correction';
    RV.modal('<form class="col" style="gap:14px" id="edF"><strong class="h3">Edit ' + (it.kind === 'correction' ? 'correction' : it.kind === 'policy' ? 'policy' : it.kind === 'doc' ? 'document' : 'Q&A') + '</strong>' +
      (qa ? '<div class="field"><label class="lbl" for="edQ">Question</label><input id="edQ" data-dictate class="input" maxlength="400" value="' + esc(it.question) + '" required></div>' : '<div class="field"><label class="lbl" for="edT">Title</label><input id="edT" class="input" maxlength="160" value="' + esc(it.title) + '"></div>') +
      '<div class="field"><label class="lbl" for="edA">' + (qa ? 'Answer' : 'Text') + '</label><textarea id="edA" data-dictate class="input" rows="' + (it.kind === 'doc' ? 9 : 4) + '" maxlength="' + (it.kind === 'doc' ? 6000 : 4000) + '" required>' + esc(it.answer) + '</textarea></div>' +
      (qa ? '<div class="field"><label class="lbl" for="edAlt">Other ways people ask it</label><input id="edAlt" class="input" maxlength="600" value="' + esc(((it.data && it.data.alt) || []).join(', ')) + '" placeholder="Comma separated"></div>' : '') +
      '<div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-ink" type="submit" id="edS">Save</button></div></form>', { label: 'Edit' });
    $('edF').addEventListener('submit', async e => {
      e.preventDefault(); const b = $('edS'); RV.busy(b, true);
      const payload = qa ? { question: $('edQ').value, answer: $('edA').value, data: { alt: $('edAlt').value } } : { title: $('edT').value, answer: $('edA').value };
      try { await PUT('/api/app/closers/' + ST.id + '/knowledge/' + id, payload); RV.closeModal(); toast('Saved'); await afterKnowledge(); } catch (er) { RV.busy(b, false); fail(er); }
    });
  }
  function editProduct(it) {
    const d = (it && it.data) || { currency: 'USD', stock: true };
    let stock = d.stock !== false;
    RV.modal('<form class="col" style="gap:14px" id="pdF"><strong class="h3">' + (it ? 'Edit product' : 'Add a product') + '</strong>' +
      '<div class="field"><label class="lbl" for="pdN">Name</label><input id="pdN" class="input" maxlength="160" value="' + esc(it ? it.title : '') + '" placeholder="e.g. Vitamin C Serum 30ml" required></div>' +
      '<div class="st-two"><div class="field"><label class="lbl" for="pdP">Price</label><input id="pdP" class="input" type="number" min="0" step="0.01" inputmode="decimal" value="' + (d.price != null ? d.price : '') + '" placeholder="24"></div><div class="field"><label class="lbl" for="pdC">Currency</label><select id="pdC" class="input">' + ['USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS', 'ZAR', 'CAD', 'AUD', 'INR'].map(c => '<option' + ((d.currency || 'USD') === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div></div>' +
      '<div class="field"><label class="lbl" for="pdD">Short description</label><textarea id="pdD" data-dictate class="input" rows="2" maxlength="600" placeholder="What it is and who it’s for">' + esc(it ? it.answer : '') + '</textarea></div>' +
      '<div class="st-two"><div class="field"><label class="lbl" for="pdL">Buy link (optional)</label><input id="pdL" class="input" type="url" inputmode="url" value="' + esc(d.link || '') + '" placeholder="https://"></div><div class="field"><label class="lbl" for="pdS">SKU (optional)</label><input id="pdS" class="input" maxlength="60" value="' + esc(d.sku || '') + '"></div></div>' +
      '<div class="row" style="gap:12px"><span class="col grow" style="gap:0"><strong>In stock</strong><span class="small muted">Out of stock items are never sold as available</span></span><button type="button" class="toggle ' + (stock ? 'on' : 'off') + '" id="pdSt" aria-label="In stock" aria-pressed="' + stock + '"><span></span></button></div>' +
      '<div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-ink" type="submit" id="pdGo">' + (it ? 'Save' : 'Add product') + '</button></div></form>', { label: it ? 'Edit product' : 'Add a product' });
    $('pdSt').addEventListener('click', () => { stock = !stock; $('pdSt').className = 'toggle ' + (stock ? 'on' : 'off'); $('pdSt').setAttribute('aria-pressed', stock); });
    $('pdF').addEventListener('submit', async e => {
      e.preventDefault(); const b = $('pdGo');
      const link = $('pdL').value.trim(); if (link && !/^https?:\/\//i.test(link)) { toast('The link must start with https://', 'err'); return; }
      RV.busy(b, true);
      const payload = { kind: 'product', title: $('pdN').value, answer: $('pdD').value, data: { price: $('pdP').value === '' ? null : +$('pdP').value, currency: $('pdC').value, stock, link, sku: $('pdS').value } };
      try { if (it) await PUT('/api/app/closers/' + ST.id + '/knowledge/' + it.id, payload); else await POST('/api/app/closers/' + ST.id + '/knowledge', payload); RV.closeModal(); toast(it ? 'Product saved' : 'Product added'); await afterKnowledge(); } catch (er) { RV.busy(b, false); fail(er); }
    });
  }
  async function savePolicy(topic, b) {
    const t = $('pol_' + topic); const v = t ? t.value.trim() : ''; if (!v) { toast('Write the policy first, or use the example.', 'err'); if (t) t.focus(); return; }
    const it = ST.items.find(i => i.kind === 'policy' && i.data && i.data.topic === topic);
    RV.busy(b, true);
    try {
      if (it) await PUT('/api/app/closers/' + ST.id + '/knowledge/' + it.id, { answer: v });
      else await POST('/api/app/closers/' + ST.id + '/knowledge', { kind: 'policy', title: POLICIES.find(p => p[0] === topic)[1], answer: v, data: { topic } });
      toast(POLICIES.find(p => p[0] === topic)[1] + ' saved'); await afterKnowledge();
    } catch (e) { RV.busy(b, false); fail(e); }
  }
  // A preview list with checkboxes; returns the chosen items through onAdd.
  function previewModal(title, sub, list, label, onAdd, extra) {
    RV.modal('<div class="col" style="gap:12px"><strong class="h3">' + esc(title) + '</strong><span class="small muted">' + esc(sub) + '</span>' + (extra || '') +
      '<div class="row" style="gap:8px"><button class="btn-link small" id="pvAll">Select all</button><button class="btn-link small" id="pvNone">Select none</button></div>' +
      '<div class="st-prev">' + list.map((x, i) => '<label><input type="checkbox" data-pv="' + i + '" checked><span>' + label(x) + '</span></label>').join('') + '</div>' +
      '<div class="row" style="justify-content:flex-end;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-ink" id="pvGo">Add ' + list.length + '</button></div></div>', { label: title, wide: true });
    const upd = () => { const n = RV.qsa('#modalRoot [data-pv]:checked').length; $('pvGo').textContent = 'Add ' + n; $('pvGo').disabled = !n; };
    RV.qsa('#modalRoot [data-pv]').forEach(c => c.addEventListener('change', upd));
    $('pvAll').addEventListener('click', () => { RV.qsa('#modalRoot [data-pv]').forEach(c => { c.checked = true; }); upd(); });
    $('pvNone').addEventListener('click', () => { RV.qsa('#modalRoot [data-pv]').forEach(c => { c.checked = false; }); upd(); });
    $('pvGo').addEventListener('click', async () => {
      const chosen = RV.qsa('#modalRoot [data-pv]:checked').map(c => list[+c.getAttribute('data-pv')]);
      if (!chosen.length) return;
      const b = $('pvGo'); RV.busy(b, true, 'Adding…');
      try { await onAdd(chosen); } catch (e) { RV.busy(b, false); fail(e); }
    });
  }
  async function addMany(list, what) {
    const r = await POST('/api/app/closers/' + ST.id + '/knowledge', { items: list });
    RV.closeModal(); toast(r.added + ' ' + what + ' added'); await afterKnowledge();
  }
  function openBulk() {
    RV.modal('<div class="col" style="gap:12px"><strong class="h3">Paste many at once</strong><span class="small muted">Paste your FAQ. Write each one as “Q:” and “A:”. Other text becomes a document.</span>' +
      '<label class="sr" for="bkT">Text</label><textarea id="bkT" class="input" rows="10" placeholder="Q: Do you deliver on Sundays?\nA: Not on Sundays, but order by Saturday noon and it arrives Monday.\n\nQ: Can I pay by card?\nA: Yes, card or bank transfer through our payment link."></textarea>' +
      '<div class="row" style="justify-content:flex-end;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-ink" id="bkGo">Preview</button></div></div>', { label: 'Paste many at once', wide: true });
    $('bkGo').addEventListener('click', async () => {
      const text = $('bkT').value; if (!text.trim()) { toast('Paste some text first.', 'err'); return; }
      const b = $('bkGo'); RV.busy(b, true);
      const qaFirst = /^\s*(q|question)\s*[:.)-]/im.test(text) || /\?\s*\n/.test(text);
      try {
        const r = await POST('/api/app/closers/' + ST.id + '/knowledge/parse', { format: qaFirst ? 'qa' : 'doc', text });
        if (r.items[0] && r.items[0].kind === 'qa') previewModal('We found ' + r.items.length + ' Q&As', 'Untick any you don’t want.', r.items, x => '<b>' + esc(x.question) + '</b>\n' + esc(x.answer), ch => addMany(ch, 'Q&As'));
        else previewModal('Add as a document', 'We split your text into ' + r.items.length + ' part' + (r.items.length === 1 ? '' : 's') + '.', r.items, x => '<b>' + esc(x.title) + '</b>\n' + esc(x.answer.slice(0, 300)), ch => addMany(ch.map(x => Object.assign({}, x, { source: 'manual' })), 'parts'));
      } catch (e) { RV.busy(b, false); fail(e); }
    });
  }
  function openCsv() {
    RV.modal('<div class="col" style="gap:12px"><strong class="h3">Import products from CSV</strong><span class="small muted">Columns: <b>name, price, description, link</b>. A header row is optional. Export from your shop or a spreadsheet.</span>' +
      '<div class="st-drop"><span class="col grow" style="gap:0"><strong>Choose a .csv file</strong><span class="hint">Up to 200 KB</span></span><label class="btn btn-ghost btn-sm" style="cursor:pointer">Choose file<input type="file" accept=".csv,text/csv" id="csvF" hidden></label></div>' +
      '<label class="lbl" for="csvT">Or paste it</label><textarea id="csvT" class="input mono" rows="6" style="font-size:13px" placeholder="name,price,description,link\nVitamin C Serum,24,Brightens skin in 2 weeks,https://yourshop.com/serum"></textarea>' +
      '<div class="row" style="justify-content:flex-end;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-ink" id="csvGo">Preview</button></div></div>', { label: 'Import products', wide: true });
    $('csvF').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; if (f.size > 200 * 1024) { toast('That file is too big. Keep it under 200 KB.', 'err'); return; } $('csvT').value = await f.text(); });
    $('csvGo').addEventListener('click', () => previewCsv($('csvT').value, $('csvGo')));
  }
  async function previewCsv(text, b) {
    if (!text.trim()) { toast('Choose a file or paste your CSV first.', 'err'); return; }
    if (b) RV.busy(b, true);
    try {
      const r = await POST('/api/app/closers/' + ST.id + '/knowledge/parse', { format: 'csv', text });
      previewModal('We found ' + r.items.length + ' product' + (r.items.length === 1 ? '' : 's'), 'Check the prices, then add them.', r.items, x => '<b>' + esc(x.title) + '</b> · ' + esc(money(x.data.price, x.data.currency)) + (x.data.stock === false ? ' · out of stock' : '') + (x.answer ? '\n' + esc(x.answer) : ''), ch => addMany(ch, 'products'), r.errors && r.errors.length ? '<div class="err" style="font-size:13px">' + r.errors.slice(0, 5).map(er => 'Line ' + er.line + ': ' + esc(er.reason)).join('<br>') + '</div>' : '');
    } catch (e) { if (b) RV.busy(b, false); fail(e); }
  }
  async function importFile(f) {
    if (f.size > 200 * 1024) { toast('That file is too big. Keep it under 200 KB.', 'err'); return; }
    if (!/\.(txt|md|markdown|csv)$/i.test(f.name)) { toast('Choose a .txt, .md or .csv file.', 'err'); return; }
    const text = await f.text();
    if (/\.csv$/i.test(f.name)) { previewCsv(text); return; }
    try {
      const r = await POST('/api/app/closers/' + ST.id + '/knowledge/parse', { format: 'doc', text, name: f.name.replace(/\.[^.]+$/, '') });
      if (r.qa && r.qa.length) previewModal('We found ' + r.qa.length + ' Q&As in ' + f.name, 'Q&As are matched more precisely than documents.', r.qa, x => '<b>' + esc(x.question) + '</b>\n' + esc(x.answer), ch => addMany(ch, 'Q&As'));
      else previewModal('Import ' + f.name, 'Split into ' + r.items.length + ' part' + (r.items.length === 1 ? '' : 's') + '. Untick anything you don’t need.', r.items, x => '<b>' + esc(x.title) + '</b>\n' + esc(x.answer.slice(0, 300)), ch => addMany(ch, 'parts'));
    } catch (e) { fail(e); }
  }
  async function importUrl() {
    const i = $('impUrl'), b = $('impGo'); const url = i.value.trim(); if (!url) return;
    RV.busy(b, true, 'Reading…');
    try {
      const r = await POST('/api/app/closers/' + ST.id + '/import-url', { url });
      RV.busy(b, false);
      previewModal('Import “' + (r.title || r.url) + '”', 'We read ' + r.items.length + ' part' + (r.items.length === 1 ? '' : 's') + ' from ' + r.url.replace(/^https?:\/\//, '').slice(0, 60) + '. Untick menus or anything off-topic.', r.items, x => '<b>' + esc(x.title) + '</b>\n' + esc(x.answer.slice(0, 300)), ch => addMany(ch, 'parts'));
    } catch (e) { RV.busy(b, false); fail(e); }
  }
  function fixFromChat(i) {
    const h = ST.chat[i]; if (!h) return;
    const q = h.q || (ST.chat.slice(0, i).reverse().find(x => x.role === 'user') || {}).text || '';
    RV.fixAnswer({ closerId: ST.id, closerName: ST.draft.name, color: color(), question: q, answer: h.text, onSaved: async () => { h.fixed = true; ST.chat.push({ role: 'note', text: '✓ Correction saved', again: true, q }); ST.chat[ST.chat.length - 1].q = q; paintMsgs(); await afterKnowledge(); } });
  }

  /* ---------------- scenarios ---------------- */
  async function runScenario(sc) {
    if (!sc) return;
    const s = ST; s.running[sc.key] = true; repaintScen();
    if (window.innerWidth <= 1180 && s.mode === 'coach') { /* answers still land in the chat sheet */ }
    const r = await ask(sc.text, { key: sc.key, expect: sc.expect });
    delete s.running[sc.key];
    if (r && r.check) { s.runs[sc.key] = { at: new Date().toISOString(), pass: r.check.pass, note: r.check.note, reply: r.text }; }
    if (r && r.check && window.innerWidth <= 1180 && !s.chatOpen && !s.runningAll) toast((r.check.pass ? 'Pass: ' : 'Needs attention: ') + r.check.note, r.check.pass ? 'ok' : 'info', { label: 'See reply', fn: () => { s.chatOpen = true; toggleDock(true); } });
    repaintScen(); if (s.id) refreshScore().then(() => { if (s.mode === 'coach' && s.step === 5) repaintBody(); });
    return r;
  }
  function repaintScen() { if ((ST.mode === 'pro' && ST.tab === 'tests') || (ST.mode === 'coach' && ST.step === 5)) repaintBody(); }
  async function runAll(b) {
    RV.busy(b, true, 'Running…');
    const list = allScenarios(); let pass = 0; ST.runningAll = true;
    for (const sc of list) { if (!$('stRoot')) return; const r = await runScenario(sc); if (r && r.check && r.check.pass) pass++; }
    ST.runningAll = false; const nb = $('runAll'); if (nb) RV.busy(nb, false);
    toast(pass + ' of ' + list.length + ' passed' + (pass === list.length ? '. Brilliant!' : '. Check the ones that need attention.'), pass === list.length ? 'ok' : 'info');
  }

  /* ---------------- gaps ---------------- */
  function teachGap(g) {
    if (!g) return;
    RV.modal('<form class="col" style="gap:14px" id="tgF"><strong class="h3">Teach the answer</strong><span class="small muted">Asked ' + g.count + ' time' + (g.count === 1 ? '' : 's') + '. Next time, ' + esc(ST.draft.name) + ' answers it for you.</span>' +
      '<div class="field"><label class="lbl" for="tgQ">Question</label><input id="tgQ" data-dictate class="input" maxlength="400" value="' + esc(g.question) + '" required></div>' +
      '<div class="field"><label class="lbl" for="tgA">Answer</label><textarea id="tgA" data-dictate class="input" rows="4" maxlength="4000" placeholder="Write it the way you’d say it in chat." required>' + esc(g.suggested || '') + '</textarea>' + (g.suggested ? '<span class="hint">Filled in from how your teammate answered it. Edit it if needed.</span>' : '') + '</div>' +
      '<div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-ink" type="submit" id="tgGo">Save Q&A</button></div></form>', { label: 'Teach the answer', noFocus: true });
    setTimeout(() => { const a = $('tgA'); if (a) a.focus(); }, 60);
    $('tgF').addEventListener('submit', async e => {
      e.preventDefault(); const b = $('tgGo'); RV.busy(b, true);
      try { await POST('/api/app/closers/' + ST.id + '/knowledge', { kind: 'qa', question: $('tgQ').value, answer: $('tgA').value, source: 'gap', data: { gap_key: g.key } }); RV.closeModal(); toast('Taught! That gap is closed.'); await afterKnowledge(); repaintBody(); }
      catch (er) { RV.busy(b, false); fail(er); }
    });
  }
  async function dismissGap(g) {
    if (!g) return;
    try { await POST('/api/app/closers/' + ST.id + '/gaps/dismiss', { key: g.key }); ST.gaps = ST.gaps.filter(x => x !== g); toast('Dismissed'); paintHead(); repaintBody(); tabCounts(); refreshScore(); } catch (e) { fail(e); }
  }

  /* ---------------- channels, live, history ---------------- */
  async function setLive(b) {
    const s = ST; const on = !s.closer.active; b.disabled = true;
    try { const c = await PUT('/api/app/closers/' + s.id, { active: on }); s.closer = c; await RV.loadClosers(true); RV.paintChrome(); toast(on ? s.draft.name + ' is on' + (placesOf().length ? '' : '. Choose where it answers next.') : s.draft.name + ' is paused'); if (on) RV.confetti(24); paintHead(); repaintBody(); }
    catch (e) { b.disabled = false; fail(e); }
  }
  async function assign(chId, on, b) {
    RV.busy(b, true);
    try { await PUT('/api/app/channels/' + chId, { closer_id: on ? ST.id : null }); ST.chans = await RV.loadChannels(true); await RV.loadClosers(true); ST.closer.channels = ((S.closers || []).find(c => c.id === ST.id) || {}).channels || []; toast(on ? ST.draft.name + ' now answers there' : 'Removed from that channel'); repaintBody(); }
    catch (e) { RV.busy(b, false); fail(e); }
  }
  async function restore(vid) {
    if (ST.dirty && !(await RV.confirmBox('Restore this version?', 'Your unsaved changes will be replaced by this version.', 'Restore'))) return;
    else if (!ST.dirty && !(await RV.confirmBox('Restore this version?', 'Name, personality, instructions and rules go back to this version. Knowledge items stay as they are.', 'Restore'))) return;
    try { const c = await POST('/api/app/closers/' + ST.id + '/versions/' + vid + '/restore'); ST.closer = c; ST.draft = draftFrom(c); ST.dirty = false; RV.store.set(key(ST.id) + '_draft', null); await reloadTraining(true); toast('Version restored'); paint(); }
    catch (e) { fail(e); }
  }

  /* ---------------- 30-second demo ---------------- */
  function openDemo() {
    if (!window.RVTrain) { toast('The demo is still loading. Try again in a second.', 'info'); return; }
    if (demoRun) { demoRun.stop(); demoRun = null; }
    const m = RV.modal('<div class="col" style="gap:12px"><span class="row" style="gap:10px;padding-right:40px"><span class="eyebrow">Live training demo</span><span class="small muted hide-xs">About 30 seconds</span></span><div id="dmStage"></div></div>', { label: 'Live training demo', wide: true, noFocus: true, onClose: () => { if (demoRun) { demoRun.stop(); demoRun = null; } } });
    m.classList.add('st-demo-m');
    demoRun = window.RVTrain.demo($('dmStage'), {
      voice: true,
      onSkip: () => RV.closeModal(),
      endCta: '<div class="row" style="gap:8px;flex-wrap:wrap;justify-content:center"><button type="button" class="btn btn-ghost" data-replay>Replay</button><button type="button" class="btn btn-ink" data-close>' + (mgr() ? 'Start training' : 'Close') + '</button></div>'
    });
    setTimeout(() => { const b = RV.qs('#dmStage [data-ctl="pause"]'); if (b) b.focus({ preventScroll: true }); }, 80);
  }
  RV.openTrainDemo = openDemo;

  RV.route('studio', { render: studio, flag: 'studio' });
})();
