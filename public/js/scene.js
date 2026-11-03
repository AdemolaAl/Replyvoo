/* Replyvoo "website chat, how it works" scene. Pure HTML/CSS/JS, loops, respects reduced motion.
   Used on the homepage, the /website-ai-chatbot page, Widget Studio and the dashboard Home card.
   RVScene.mount(el, { compact: bool, caption: bool, photo: url }) → { stop() } */
(function () {
  'use strict';
  if (window.RVScene) return;
  var CSS = [
    '.rvs{--k:#121110;--y:#FFC21A;--line:#EEEBE2;container-type:inline-size;position:relative;font-family:inherit;color:var(--k);user-select:none}',
    '.rvs *{box-sizing:border-box}',
    '.rvs-stage{display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:14px;align-items:stretch}',
    '.rvs.compact .rvs-stage{grid-template-columns:1fr}.rvs.compact .rvs-side{display:none}',
    '@container (max-width:640px){.rvs-stage{grid-template-columns:1fr}.rvs-side{display:grid!important;grid-template-columns:1fr 1fr;gap:10px}.rvs.compact .rvs-side{display:none!important}}',
    '.rvs-browser{background:#fff;border-radius:18px;box-shadow:0 30px 60px -34px rgba(18,17,16,.45),0 0 0 1px var(--line);overflow:hidden;display:flex;flex-direction:column;min-width:0}',
    '.rvs-bar{display:flex;align-items:center;gap:6px;padding:9px 12px;background:#F4F2EC;border-bottom:1px solid var(--line)}',
    '.rvs-bar i{width:9px;height:9px;border-radius:50%;background:#DEDBD3}',
    '.rvs-url{margin-left:8px;flex:1;max-width:260px;background:#fff;border-radius:999px;padding:4px 11px;font-size:11px;font-weight:700;color:#5E5A50;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.rvs-page{position:relative;height:330px;overflow:hidden;background:linear-gradient(180deg,#FFF9EC,#FFFFFF 60%)}',
    '.rvs.compact .rvs-page{height:300px}',
    '.rvs-scroll{padding:14px 16px;transition:transform 1.4s cubic-bezier(.4,.1,.2,1)}',
    '.rvs.k1 .rvs-scroll{transform:translateY(-46px)}',
    '.rvs-nav{display:flex;align-items:center;gap:10px;font-size:11px;font-weight:800;letter-spacing:.14em}.rvs-nav span{width:34px;height:6px;border-radius:3px;background:#E9E4D8}.rvs-nav em{margin-left:auto;font-style:normal;letter-spacing:0;font-size:10.5px;color:#5E5A50}',
    '.rvs-hero{display:grid;grid-template-columns:110px 1fr;gap:16px;align-items:center;margin-top:18px;background:#fff;border-radius:16px;padding:12px;box-shadow:0 0 0 1px var(--line)}',
    '.rvs-bottle{height:120px;border-radius:12px;background:radial-gradient(circle at 50% 70%,#FFE58A,#FFF3CC 70%);display:grid;place-items:center;overflow:hidden}.rvs-bottle img{width:100%;height:100%;object-fit:cover;display:block}',
    '.rvs-copy{display:flex;flex-direction:column;gap:7px}.rvs-copy i{height:8px;border-radius:4px;background:#ECE7DB;width:90%}.rvs-copy i.s{width:60%}',
    '.rvs-copy b{font-size:22px;letter-spacing:-.04em}.rvs-buy{align-self:flex-start;background:var(--k);color:#fff;border-radius:999px;font-size:11px;font-weight:800;padding:7px 13px}',
    '.rvs-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.rvs-grid div{height:86px;border-radius:12px;background:#F6F3EA}',
    '.rvs-launch{position:absolute;right:14px;bottom:14px;width:46px;height:46px;border-radius:50%;background:var(--y);display:grid;place-items:center;box-shadow:0 12px 24px -10px rgba(0,0,0,.45);transition:transform .25s,opacity .25s}',
    '.rvs-launch b{position:absolute;top:-3px;right:-3px;width:17px;height:17px;border-radius:50%;background:#FF4D3A;color:#fff;font-size:10px;display:grid;place-items:center;transform:scale(0);transition:transform .3s cubic-bezier(.2,.9,.3,1.5)}',
    '.rvs.k2 .rvs-launch b{transform:scale(1)}.rvs.k3 .rvs-launch{transform:scale(.88)}.rvs.k4 .rvs-launch{opacity:0;transform:scale(.5)}',
    '.rvs-greet{position:absolute;right:14px;bottom:70px;max-width:210px;background:#fff;border-radius:14px 14px 4px 14px;padding:9px 12px;font-size:12px;font-weight:600;box-shadow:0 14px 30px -14px rgba(0,0,0,.4),0 0 0 1px var(--line);opacity:0;transform:translateY(8px) scale(.95);transition:all .35s cubic-bezier(.2,.9,.3,1.3)}',
    '.rvs.k2 .rvs-greet{opacity:1;transform:none}.rvs.k4 .rvs-greet{opacity:0;transform:translateY(8px)}',
    '.rvs-chat{position:absolute;right:12px;bottom:12px;width:min(250px,calc(100% - 24px));height:calc(100% - 24px);max-height:300px;background:#fff;border-radius:16px;box-shadow:0 24px 50px -20px rgba(0,0,0,.5),0 0 0 1px var(--line);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(14px) scale(.92);transform-origin:bottom right;transition:all .35s cubic-bezier(.2,.9,.3,1.1)}',
    '.rvs.k4 .rvs-chat{opacity:1;transform:none}',
    '.rvs-chead{display:flex;align-items:center;gap:8px;padding:10px;background:var(--k);color:#fff}.rvs-chead b{font-size:12.5px;display:block}.rvs-chead small{font-size:10px;opacity:.8;display:flex;align-items:center;gap:4px}',
    '.rvs-av{width:28px;height:28px;border-radius:50%;background:var(--y);color:var(--k);display:grid;place-items:center;font-size:11px;font-weight:800;flex:0 0 auto}',
    '.rvs-ai{font-size:9.5px;font-weight:800;color:#7A5800;background:#FFF7DD;text-align:center;padding:4px}',
    '.rvs-msgs{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:6px;padding:10px;overflow:hidden}',
    '.rvs-m{max-width:88%;font-size:11.5px;line-height:1.35;padding:7px 10px;border-radius:12px;display:none;animation:rvsIn .35s both}',
    '.rvs-m.in{align-self:flex-start;background:#F4F2EC;border-bottom-left-radius:4px}.rvs-m.me{align-self:flex-end;background:var(--y);border-bottom-right-radius:4px;font-weight:600}',
    '.rvs-typing{display:none;align-self:flex-start;gap:4px;padding:9px 11px;background:#F4F2EC;border-radius:12px}.rvs-typing i{width:5px;height:5px;border-radius:50%;background:#121110;opacity:.4;animation:rvsDot 1.1s infinite}.rvs-typing i:nth-child(2){animation-delay:.15s}.rvs-typing i:nth-child(3){animation-delay:.3s}',
    '.rvs.k4 .s1,.rvs.k5 .s2,.rvs.k7 .s4,.rvs.k8 .s5,.rvs.k9 .s6{display:block}.rvs.k6:not(.k7) .rvs-typing{display:flex}',
    '.rvs-cursor{position:absolute;left:60%;top:30%;width:22px;height:22px;z-index:3;transition:left 1s cubic-bezier(.5,0,.2,1),top 1s cubic-bezier(.5,0,.2,1),transform .15s;filter:drop-shadow(0 3px 4px rgba(0,0,0,.3))}',
    '.rvs.k1 .rvs-cursor{left:30%;top:46%}.rvs.k2 .rvs-cursor{left:58%;top:60%}.rvs.k3 .rvs-cursor{left:calc(100% - 38px);top:calc(100% - 38px);transform:scale(.85)}.rvs.k4 .rvs-cursor{left:calc(100% - 120px);top:calc(100% - 70px);transform:none}.rvs.k9 .rvs-cursor{opacity:0}',
    '.rvs-side{display:flex;flex-direction:column;gap:12px;min-width:0}',
    '.rvs-card{background:#fff;border-radius:16px;box-shadow:0 0 0 1px var(--line),0 18px 40px -30px rgba(0,0,0,.4);padding:12px;display:flex;flex-direction:column;gap:8px;flex:1;min-width:0}',
    '.rvs-card h6{margin:0;font-size:12px;font-weight:700;color:#5E5A50}',
    '.rvs-row{display:flex;align-items:center;gap:8px;font-size:11.5px;padding:7px;border-radius:10px;background:#FAF9F5;min-width:0}.rvs-row span.t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.rvs-row.dim{opacity:.55}.rvs-new{opacity:0;max-height:0;padding-top:0;padding-bottom:0;margin-bottom:-8px;overflow:hidden;transform:translateY(-6px);transition:all .45s cubic-bezier(.2,.9,.3,1.3)}',
    '.rvs.k10 .rvs-lead,.rvs.k11 .rvs-inb{opacity:1;max-height:60px;padding-top:7px;padding-bottom:7px;margin-bottom:0;transform:none;background:#FFF7DD;box-shadow:inset 0 0 0 1.5px #FFC21A}',
    '.rvs-heat{font-size:10px;font-weight:800;background:#FFE3D6;color:#9A3412;border-radius:999px;padding:2px 7px;flex:0 0 auto}',
    '.rvs-take{font-size:10px;font-weight:800;background:var(--k);color:#fff;border-radius:999px;padding:3px 8px;flex:0 0 auto}.rvs-take{transition:background .3s,color .3s}.rvs.k12 .rvs-take{background:#FFC21A;color:#121110}',
    '.rvs-fly{position:absolute;z-index:4;left:55%;top:58%;background:#fff;border-radius:12px;padding:7px 10px;font-size:11px;font-weight:700;box-shadow:0 14px 30px -12px rgba(0,0,0,.45),0 0 0 1.5px #FFC21A;opacity:0;pointer-events:none;white-space:nowrap}',
    '.rvs.k9:not(.k10) .rvs-fly{animation:rvsFly 1s cubic-bezier(.5,0,.3,1) .2s both}',
    '@container (max-width:640px){.rvs-fly{left:14%}.rvs.k9:not(.k10) .rvs-fly{animation-name:rvsFlyDown}}',
    '.rvs-caps{position:relative;height:30px;margin-top:14px;text-align:center}.rvs-caps span{position:absolute;inset:0;font-weight:800;font-size:clamp(14px,2.4cqi,18px);letter-spacing:-.02em;opacity:0;transform:translateY(6px);transition:all .45s}',
    '.rvs-caps span b{background:linear-gradient(transparent 60%,#FFE58A 60%);font-weight:800}',
    '.rvs.c0 .rvs-caps span:nth-child(1),.rvs.c1 .rvs-caps span:nth-child(2),.rvs.c2 .rvs-caps span:nth-child(3){opacity:1;transform:none}',
    '.rvs.fade .rvs-stage{opacity:0;transition:opacity .5s}.rvs-stage{transition:opacity .5s}',
    '@keyframes rvsIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@keyframes rvsDot{0%,60%,100%{opacity:.3}30%{opacity:.9}}',
    '@keyframes rvsFly{0%{opacity:1;transform:none}100%{opacity:0;left:calc(100% + 40px);top:12%;transform:scale(.8)}}',
    '@keyframes rvsFlyDown{0%{opacity:1;transform:none}100%{opacity:0;left:10%;top:calc(100% + 30px);transform:scale(.8)}}',
    '@keyframes rvsPulse{50%{transform:scale(1.15);background:#FFC21A;color:#121110}}',
    '.rvs.still .rvs-caps{height:auto;display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:center}.rvs.still .rvs-caps span{position:static;opacity:1;transform:none}',
    '@media (prefers-reduced-motion:reduce){.rvs *{animation:none!important;transition:none!important}}'
  ].join('\n');
  var BOTTLE = '<svg width="54" height="96" viewBox="0 0 54 96" aria-hidden="true"><rect x="19" y="2" width="16" height="14" rx="4" fill="#121110"/><rect x="14" y="14" width="26" height="10" rx="4" fill="#2C2925"/><rect x="6" y="22" width="42" height="70" rx="14" fill="#FFC21A" stroke="#121110" stroke-width="3"/><rect x="14" y="44" width="26" height="26" rx="6" fill="#fff"/><text x="27" y="62" text-anchor="middle" font-size="11" font-weight="800" fill="#121110" font-family="sans-serif">C</text></svg>';
  var CURSOR = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 2l15 9-6.5 1.6L16 20l-3 1.6-3.6-7.4L4 18z" fill="#fff" stroke="#121110" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  var CHAT = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#121110" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.2-4.2A7.5 7.5 0 1 1 20 11.5z"/></svg>';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function markup(o) {
    var caps = o.captions || ['<b>Answers in seconds</b>, sounds like your best rep', '<b>Captures the lead</b> while they’re keen', '<b>You can jump in</b> any time'];
    return '<div class="rvs-stage" aria-hidden="true"><div class="rvs-browser"><div class="rvs-bar"><i></i><i></i><i></i><span class="rvs-url">glowlabs.shop/vitamin-c-serum</span></div>' +
      '<div class="rvs-page"><div class="rvs-scroll"><div class="rvs-nav">GLOW LABS<span></span><span></span><span></span><em>Cart (0)</em></div>' +
      '<div class="rvs-hero"><div class="rvs-bottle">' + (o.photo ? '<img src="' + esc(o.photo) + '" alt="" width="110" height="120" loading="lazy">' : BOTTLE) + '</div><div class="rvs-copy"><i></i><i class="s"></i><b>$24</b><span class="rvs-buy">Add to cart</span></div></div>' +
      '<div class="rvs-grid"><div></div><div></div><div></div></div></div>' +
      '<div class="rvs-greet">Hi! 👋 Need help choosing a serum?</div>' +
      '<div class="rvs-chat"><div class="rvs-chead"><span class="rvs-av">A</span><span><b>Glow Labs</b><small>replies in seconds</small></span></div><div class="rvs-ai">✦ Ace · AI assistant</div>' +
      '<div class="rvs-msgs"><div class="rvs-m in s1">Hi! 👋 Need help choosing a serum?</div><div class="rvs-m me s2">Do you ship to Spain?</div><div class="rvs-typing"><i></i><i></i><i></i></div>' +
      '<div class="rvs-m in s4">Yes! Spain gets it in 2 to 4 days, and shipping is free over $50 🙌</div><div class="rvs-m in s5">Want 10% off your first order? Drop your email.</div><div class="rvs-m me s6">emma.n@mail.com</div></div></div>' +
      '<div class="rvs-launch">' + CHAT + '<b>1</b></div><div class="rvs-cursor">' + CURSOR + '</div><div class="rvs-fly">✉ Emma · emma.n@mail.com</div></div></div>' +
      '<div class="rvs-side"><div class="rvs-card"><h6>Leads</h6><div class="rvs-row rvs-new rvs-lead"><span class="rvs-av">E</span><span class="t"><b>Emma N.</b> · emma.n@mail.com</span></div><div class="rvs-row dim"><span class="rvs-av" style="background:#E3ECFF">M</span><span class="t">Marco R. · +34 6…</span></div></div>' +
      '<div class="rvs-card"><h6>Pulse Inbox</h6><div class="rvs-row rvs-new rvs-inb"><span class="rvs-av">E</span><span class="t"><b>Emma</b> Do you ship to Spain?</span><span class="rvs-heat">Hot 🔥</span></div><div class="rvs-row rvs-new rvs-inb" style="justify-content:flex-end;background:transparent;box-shadow:none;padding:0"><span class="rvs-take">Take over</span></div><div class="rvs-row dim"><span class="rvs-av" style="background:#E8F6EC">K</span><span class="t">Kenji · Is it vegan?</span></div></div></div></div>' +
      (o.caption === false ? '' : '<div class="rvs-caps" aria-live="off">' + caps.map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</div>');
  }
  var STEPS = [[600, 1], [2000, 2], [3300, 3], [3900, 4], [4800, 5], [5400, 6], [6900, 7], [8200, 8], [9400, 9], [10600, 10], [11300, 11], [12100, 12]];
  var CAP = { 7: 'c0', 9: 'c1', 11: 'c2' };
  function mount(el, o) {
    o = o || {};
    if (!document.getElementById('rvs-css')) { var st = document.createElement('style'); st.id = 'rvs-css'; st.textContent = CSS; document.head.appendChild(st); }
    var root = document.createElement('div');
    root.className = 'rvs' + (o.compact ? ' compact' : '');
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', o.label || 'Animation: a visitor on an online store asks the chat “Do you ship to Spain?”, the AI answers in seconds, asks for an email, and the lead appears in Leads and Pulse Inbox.');
    root.innerHTML = markup(o);
    el.innerHTML = ''; el.appendChild(root);
    var timers = [], stopped = false, visible = true, io = null;
    function set(n) { for (var i = 1; i <= 12; i++) root.classList.toggle('k' + i, i <= n); if (CAP[n]) { root.classList.remove('c0', 'c1', 'c2'); root.classList.add(CAP[n]); } }
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { set(11); root.classList.add('still'); return { stop: function () {}, el: root }; }
    function run() {
      if (stopped) return;
      if (!visible || document.hidden) { timers.push(setTimeout(run, 700)); return; }
      root.classList.remove('fade', 'c0', 'c1', 'c2'); set(0);
      STEPS.forEach(function (s) { timers.push(setTimeout(function () { set(s[1]); }, s[0])); });
      timers.push(setTimeout(function () { root.classList.add('fade'); }, 15200));
      timers.push(setTimeout(run, 15800));
    }
    if ('IntersectionObserver' in window) { io = new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }); io.observe(root); }
    run();
    return { el: root, stop: function () { stopped = true; timers.forEach(clearTimeout); if (io) io.disconnect(); } };
  }
  window.RVScene = { mount: mount, esc: esc };
})();
