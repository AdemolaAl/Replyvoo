/* Replyvoo homepage motion. Vanilla, no dependencies. Loaded only on "/".
   1. Hero phone: a customer asks "how much?", the Closer types and answers with a photo, the customer pays,
      a "New order" card slides in, then the next example shop. Pauses off-screen, respects reduced motion.
   2. Product tour: real dashboard screenshots that advance like a product tour while on screen.
   3. "Watch it close a sale" / "Play with voice": replays the Agent Studio demo with the recorded narration. */
(function () {
  'use strict';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var q = function (s, r) { return (r || document).querySelector(s); };
  var qa = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var TICK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  // Waits that only count down while the element is on screen and the tab is visible.
  function Clock(el, threshold) {
    var self = this;
    this.vis = !('IntersectionObserver' in window);
    if (!this.vis) new IntersectionObserver(function (es) { self.vis = es[es.length - 1].isIntersecting; }, { threshold: threshold || 0.15 }).observe(el);
  }
  Clock.prototype.running = function () { return this.vis && !document.hidden; };
  Clock.prototype.wait = function (ms) {
    var self = this;
    return new Promise(function (resolve) {
      var left = ms, last = performance.now();
      (function tick() {
        var now = performance.now();
        if (self.running()) left -= now - last;
        last = now;
        if (left <= 0) resolve(); else setTimeout(tick, Math.min(100, left));
      })();
    });
  };

  /* ---------- 1. hero phone ---------- */
  var stage = q('#hpStage');
  if (stage && !reduced) (function () {
    var shops; try { shops = JSON.parse(stage.getAttribute('data-shops') || '[]'); } catch (e) { shops = []; }
    if (!shops.length) return;
    var msgs = q('[data-msgs]', stage), order = q('[data-order]', stage), av = q('[data-av]', stage), name = q('[data-name]', stage);
    var sub = q('.hp-who small', stage), subText = sub ? sub.textContent : '', tabs = qa('[data-shop]', stage);
    var owner = q('[data-owner]', stage), oprice = q('[data-oprice]', stage), oitem = q('[data-oitem]', stage);
    var clock = new Clock(stage, 0.25), w = function (ms) { return clock.wait(ms); };
    shops.forEach(function (s) { [s.photo, s.owner].forEach(function (src) { var i = new Image(); i.src = src; }); });

    function add(cls, html) {
      var d = document.createElement('div');
      d.className = 'pm pm-new ' + cls; d.innerHTML = html;
      msgs.appendChild(d);
      while (msgs.scrollHeight > msgs.clientHeight + 4 && msgs.children.length > 2) msgs.removeChild(msgs.firstChild);
      return d;
    }
    function typing() {
      if (sub) { sub.textContent = 'typing…'; sub.classList.add('typing'); }
      var t = document.createElement('div'); t.className = 'pm-typing pm-new'; msgs.appendChild(t);
      return function () { t.remove(); if (sub) { sub.textContent = subText; sub.classList.remove('typing'); } };
    }
    function opening(s) {
      msgs.innerHTML = '<div class="pm-day">Today</div><div class="pm pm-out pm-greet">' + esc(s.greet || '') + '</div>';
    }
    async function play(i, first) {
      var s = shops[i];
      if (!first) {
        msgs.classList.add('out'); order.classList.remove('show');
        await w(480);
        opening(s); msgs.classList.remove('out');
      }
      av.textContent = s.mono; av.style.background = s.tone; name.textContent = s.name;
      tabs.forEach(function (t, j) { t.classList.toggle('on', j === i); });
      owner.src = s.owner; oprice.textContent = s.price; oitem.textContent = s.order;
      await w(first ? 350 : 600);
      add('pm-in', esc(s.ask));
      await w(900);
      var done = typing(); await w(1500); done();
      add('pm-out pm-card', '<img src="' + esc(s.photo) + '" alt="" width="260" height="195"><span class="pm-card-t"><b>' + esc(s.item) + '</b><span>' + esc(s.price) + '</span></span>');
      await w(500);
      add('pm-out', esc(s.reply) + '<small>Replied in 3s</small>');
      await w(2300);
      add('pm-in', esc(s.ans));
      await w(800);
      done = typing(); await w(1200); done();
      var m = add('pm-out', esc(s.pay) + '<span class="pm-pay">' + TICK + 'Pay ' + esc(s.price) + '</span>');
      await w(1700);
      var b = q('.pm-pay', m); b.classList.add('press');
      await w(200);
      b.classList.remove('press'); b.classList.add('paid'); b.innerHTML = TICK + 'Paid ' + esc(s.price);
      await w(650);
      order.classList.add('show');
      await w(3600);
    }
    async function loop() {
      stage.classList.add('ready');
      for (var i = 0, n = 0; ; i = (i + 1) % shops.length, n++) await play(i, n === 0);
    }
    opening(shops[0]); order.classList.remove('show');
    loop();
  })();

  /* ---------- 2. product tour ---------- */
  var tour = q('[data-tour]');
  if (tour) (function () {
    var tabs = qa('[role=tab]', tour), shots = qa('.hp-shot', tour), url = q('[data-url]', tour), cap = q('[data-cap]', tour);
    var DUR = 7000, idx = 0, elapsed = 0, hover = false;
    var clock = new Clock(tour, 0.3);
    tour.style.setProperty('--hp-tour', DUR + 'ms');
    function show(i, focus) {
      idx = (i + tabs.length) % tabs.length; elapsed = 0;
      tabs.forEach(function (t, j) { var on = j === idx; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
      shots.forEach(function (s, j) { var on = j === idx; s.classList.toggle('on', on); if (on) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true'); });
      if (url) url.textContent = shots[idx].getAttribute('data-url') || '';
      if (cap) { var sp = q('span', tabs[idx]); cap.textContent = sp ? sp.textContent : ''; }
      if (!reduced) { tour.classList.remove('auto'); void tour.offsetWidth; tour.classList.add('auto'); }
      if (focus) tabs[idx].focus({ preventScroll: true });
      // On phones the tabs are a sideways row: keep the active one in view without moving the page.
      var row = tabs[idx].parentNode;
      if (row.scrollWidth > row.clientWidth + 2) {
        var t = tabs[idx], left = t.offsetLeft - (row.clientWidth - t.offsetWidth) / 2;
        if (row.scrollTo) row.scrollTo({ left: left, behavior: reduced ? 'auto' : 'smooth' }); else row.scrollLeft = left;
      }
    }
    tabs.forEach(function (t, j) {
      t.addEventListener('click', function () { show(j); });
      t.addEventListener('keydown', function (e) {
        var k = e.key;
        if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); show(idx + 1, true); }
        else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); show(idx - 1, true); }
        else if (k === 'Home') { e.preventDefault(); show(0, true); }
        else if (k === 'End') { e.preventDefault(); show(tabs.length - 1, true); }
      });
    });
    show(0);
    if (reduced) return;
    tour.addEventListener('mouseenter', function () { hover = true; });
    tour.addEventListener('mouseleave', function () { hover = false; });
    tour.addEventListener('focusin', function () { hover = true; });
    tour.addEventListener('focusout', function () { hover = false; });
    setInterval(function () {
      var run = clock.running() && !hover;
      tour.classList.toggle('paused', !run);
      if (!run) return;
      elapsed += 100;
      if (elapsed >= DUR) show(idx + 1);
    }, 100);
  })();

  /* ---------- 1b. hero flow: customers in, AI replies out ---------- */
  var flow = q('[data-flow]');
  if (flow && !reduced && flow.animate) (function () {
    var faces, texts;
    try { faces = JSON.parse(flow.getAttribute('data-faces')); texts = JSON.parse(flow.getAttribute('data-texts')); } catch (e) { return; }
    var st = q('.fl-static', flow); if (st) st.remove();
    flow.classList.add('fl-live');
    var core = q('.fl-core', flow);
    var SLOTS = [['fl-l', 'fl-top'], ['fl-r', 'fl-bot'], ['fl-r', 'fl-top'], ['fl-l', 'fl-bot']];
    var GAP = 2700, n = 0, acc = GAP - 400, last = 0, on = !('IntersectionObserver' in window), raf = 0;
    var E_OUT = 'cubic-bezier(.2,.8,.2,1)', E_IN = 'cubic-bezier(.5,0,.75,0)';
    function center(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    function spawn() {
      var lang = (document.documentElement.lang || 'en').slice(0, 2), L = texts[lang] || texts.en;
      var k = n % 4, slot = SLOTS[n % SLOTS.length], left = slot[0] === 'fl-l';
      var who = document.createElement('span');
      who.className = 'fl-who ' + slot.join(' ');
      who.innerHTML = '<span class="fl-face"><img src="' + esc(faces[n % faces.length]) + '" alt="" width="40" height="40"></span>' +
        '<span class="fl-b fl-q" dir="auto">' + esc(L.q[k]) + '</span><span class="fl-b fl-a" dir="auto" style="opacity:0">' + esc(L.a[k]) + '</span>' +
        '<span class="fl-tick" style="opacity:0">' + TICK + '<span dir="auto">' + esc(L.t[k]) + '</span></span>';
      n++;
      flow.appendChild(who);
      var qb = q('.fl-q', who), ab = q('.fl-a', who), tk = q('.fl-tick', who);
      var c = center(core), b = center(qb), dx = c.x - b.x, dy = c.y - b.y;
      var toCore = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(.35)';
      tk.style.left = ((40 - tk.offsetWidth) / 2) + 'px'; // centred under the face
      var o = function (el, kf, delay, dur, ease) { return el.animate(kf, { delay: delay, duration: dur, easing: ease || E_OUT, fill: 'both' }); };
      o(who, [{ opacity: 0, transform: 'translateX(' + (left ? -28 : 28) + 'px)' }, { opacity: 1, transform: 'none' }], 0, 600);
      o(qb, [{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'none' }], 450, 320);
      o(qb, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: toCore }], 1500, 650, E_IN);
      o(ab, [{ opacity: 0, transform: toCore }, { opacity: 1, transform: 'none' }], 2450, 650);
      o(tk, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], 3300, 300);
      o(who, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }], 4850, 500, 'ease').finished.then(function () { who.remove(); }, function () { who.remove(); });
    }
    function setPlay(play) { flow.getAnimations({ subtree: true }).forEach(function (a) { if (play) { if (a.playState === 'paused') a.play(); } else if (a.playState === 'running') a.pause(); }); }
    function frame(t) {
      if (last) acc += Math.min(100, t - last);
      last = t;
      if (acc >= GAP) { acc = 0; spawn(); }
      raf = (on && !document.hidden) ? requestAnimationFrame(frame) : 0;
      if (!raf) { last = 0; setPlay(false); }
    }
    function go() { if (on && !document.hidden && !raf) { setPlay(true); raf = requestAnimationFrame(frame); } }
    if (!on) new IntersectionObserver(function (es) { on = es[es.length - 1].isIntersecting; go(); }).observe(flow);
    document.addEventListener('visibilitychange', go);
    go();
  })();

  /* ---------- 2b. product tour: the window stack settles flat as it scrolls into view ---------- */
  var view = q('.hp-view');
  if (view && !reduced) (function () {
    var cur = 0, target = 0, raf = 0, on = false;
    function measure() {
      var r = view.getBoundingClientRect(), vh = window.innerHeight || 800;
      // 0 when the top of the window enters the screen, 1 once it reaches 35% from the top.
      target = Math.max(0, Math.min(1, (vh - r.top) / (vh * 0.65)));
    }
    function frame() {
      cur += (target - cur) * 0.12;
      if (Math.abs(target - cur) < 0.002) cur = target;
      view.style.setProperty('--tp', cur.toFixed(4));
      raf = cur === target ? 0 : requestAnimationFrame(frame);
    }
    function kick() { if (!on) return; measure(); if (!raf) raf = requestAnimationFrame(frame); }
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { on = es[es.length - 1].isIntersecting; kick(); }, { rootMargin: '10% 0px' }).observe(view);
    else on = true;
    measure(); cur = target; view.style.setProperty('--tp', cur.toFixed(4));
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', kick);
  })();

  /* ---------- 2c. people: faces ride a tilted ring around the Replyvoo mark ---------- */
  var orbit = q('[data-orbit]');
  if (orbit && !reduced) (function () {
    var tilt = parseFloat(orbit.getAttribute('data-tilt')) || 0.46, aspect = parseFloat(orbit.getAttribute('data-aspect')) || 0.74;
    var rings = qa('[data-ring]', orbit).map(function (ul) {
      return { r: parseFloat(ul.getAttribute('data-ring')), speed: parseFloat(ul.getAttribute('data-speed')) || 1, fade: ul.classList.contains('hp-orbit-chips') ? 0.9 : 0.28,
        sats: qa('.hp-sat', ul).map(function (li) { return { el: li, a: parseFloat(li.getAttribute('data-a')) || 0 }; }) };
    });
    var on = !('IntersectionObserver' in window), off = 0, last = 0, raf = 0;
    var DEG_PER_MS = 360 / 70000; // one full turn of the outer ring every 70 seconds
    var W = orbit.clientWidth;
    window.addEventListener('resize', function () { W = orbit.clientWidth; if (!raf) place(); });
    orbit.classList.add('live');
    function place() {
      rings.forEach(function (g) {
        g.sats.forEach(function (s) {
          var a = (s.a + off * g.speed) * Math.PI / 180, d = Math.sin(a);
          var x = W * (0.5 + g.r * Math.cos(a)), y = W * aspect * 0.5 + W * g.r * tilt * d;
          var st = s.el.style;
          st.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) translate(-50%,-50%) scale(' + (0.74 + 0.26 * (d + 1) / 2).toFixed(4) + ')';
          st.zIndex = String(Math.round(100 + d * 50));
          st.opacity = (1 - g.fade + g.fade * (d + 1) / 2).toFixed(3);
        });
      });
    }
    function frame(t) {
      if (last) off += Math.min(64, t - last) * DEG_PER_MS;
      last = t;
      place();
      raf = (on && !document.hidden) ? requestAnimationFrame(frame) : 0;
      if (!raf) last = 0;
    }
    function go() { if (on && !document.hidden && !raf) raf = requestAnimationFrame(frame); }
    if (!on) new IntersectionObserver(function (es) { on = es[es.length - 1].isIntersecting; go(); }).observe(orbit);
    document.addEventListener('visibilitychange', go);
    place(); go();
  })();

  /* ---------- 2d. final call to action: its chat plays in once ---------- */
  var fin = q('[data-final]');
  if (fin) {
    if (reduced || !('IntersectionObserver' in window)) fin.classList.add('in');
    else { var fio = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { fin.classList.add('in'); fio.disconnect(); } }, { threshold: 0.35 }); fio.observe(fin); }
  }

  /* ---------- 3. Agent Studio demo, silent loop + voice replay ---------- */
  var demoEl = q('[data-hp-train]'), voiceBtn = q('.hp-voice'), run = null;
  var signup = (q('.hp-hero .hp-btn-y') || {}).href || '/app/signup';
  function startLoop() {
    if (!demoEl || !window.RVTrain) return false;
    run = window.RVTrain.demo(demoEl, { loop: true, controls: false, focusEnd: false });
    return true;
  }
  function playVoice() {
    if (!demoEl || !window.RVTrain) return false;
    if (run) run.stop();
    if (window.RVVoice) window.RVVoice.set(true);
    run = window.RVTrain.demo(demoEl, {
      voice: true, controls: true, loop: false, focusEnd: false,
      endCta: '<a class="hp-btn hp-btn-y" href="' + esc(signup) + '">Hire your first Closer free</a>',
      onEnd: function () { if (voiceBtn) voiceBtn.setAttribute('aria-pressed', 'false'); }
    });
    if (voiceBtn) voiceBtn.setAttribute('aria-pressed', 'true');
    return true;
  }
  if (demoEl && !startLoop()) window.addEventListener('load', startLoop);
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-demo-play]'); if (!b) return;
    e.preventDefault();
    if (!demoEl) { var p = document.getElementById('product'); if (p) p.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); return; }
    playVoice();
    if (b !== voiceBtn) demoEl.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  });
})();
