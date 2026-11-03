/* Replyvoo "train your Closer" animations. Pure HTML/CSS/JS, no dependencies, respects reduced motion.
   Used by Agent Studio (coach explainers + the 30-second demo) and the homepage "Agent Studio" section.
   RVTrain.explainer(el, step 1..5)          → { stop() }   short looping explainer for a coach step
   RVTrain.demo(el, { loop, controls, onEnd, onStart }) → { stop(), restart() }   the full live training demo
   RVTrain.sample(persona, template)          → sample reply text for the personality sliders */
(function () {
  'use strict';
  if (window.RVTrain) return;
  var CSS = [
    '.rvt{--k:#121110;--y:#FFC21A;--y2:#FFE9A6;--mint:#FFF7DD;--line:#EEEBE2;--mut:#5E5A50;container-type:inline-size;position:relative;font-family:inherit;color:var(--k);user-select:none;-webkit-user-select:none}',
    '.rvt *{box-sizing:border-box}',
    /* explainers */
    '.rvx{position:relative;height:230px;border-radius:20px;background:linear-gradient(160deg,#FFF9EC,#FFFFFF 70%);overflow:hidden;box-shadow:inset 0 0 0 1px var(--line)}',
    '.rvx-bot{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);transition:all .6s cubic-bezier(.2,.9,.2,1)}',
    '.rvx-b{position:absolute;max-width:72%;font-size:12.5px;line-height:1.35;font-weight:600;padding:8px 11px;border-radius:14px;opacity:0;transform:translateY(8px) scale(.96);transition:all .45s cubic-bezier(.2,.9,.3,1.2);box-shadow:0 10px 24px -14px rgba(0,0,0,.35)}',
    '.rvx-b.in{background:#fff;border-bottom-left-radius:4px;box-shadow:0 0 0 1px var(--line),0 10px 24px -14px rgba(0,0,0,.35)}.rvx-b.out{background:var(--y);border-bottom-right-radius:4px}.rvx-b.angry{background:#FFF0EC;color:#9A2A12;box-shadow:0 0 0 1.5px #FFD2C4}',
    '.rvx-b.show{opacity:1;transform:none}',
    '.rvx-b mark{background:#fff;border-radius:5px;padding:0 3px;box-shadow:0 0 0 1.5px var(--k);color:inherit;transition:background .4s}.rvx-b.hl mark{background:#FFFBEA}',
    '.rvx-chip{position:absolute;font-size:11.5px;font-weight:800;padding:6px 11px;border-radius:999px;background:#fff;box-shadow:0 0 0 1.5px var(--line);transition:all .4s;white-space:nowrap}',
    '.rvx-chip.on{background:var(--k);color:#fff;box-shadow:0 0 0 2px var(--k);transform:scale(1.08)}',
    '.rvx-card{position:absolute;left:14px;top:22px;width:46%;max-width:210px;background:#fff;border-radius:14px;padding:10px 11px;box-shadow:0 0 0 1.5px var(--k),5px 5px 0 var(--y);font-size:11.5px;line-height:1.35;transition:all .9s cubic-bezier(.5,0,.2,1)}',
    '.rvx-card b{display:block;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);margin-bottom:4px}',
    '.rvx-card .q{font-weight:800}.rvx-card .a{margin-top:3px}',
    '.rvx-brain{position:absolute;right:18px;top:16px;width:92px;height:92px;border-radius:30px;background:var(--k);display:grid;place-items:center;transition:transform .3s}',
    '.rvx-brain i{position:absolute;bottom:-9px;left:50%;transform:translateX(-50%);font-style:normal;font-size:10px;font-weight:800;background:var(--y);border-radius:999px;padding:2px 8px;white-space:nowrap}',
    '.rvx.k2 .rvx-card{left:calc(100% - 100px);top:30px;transform:scale(.18);opacity:0}',
    '.rvx.k2 .rvx-brain,.rvx.pulse .rvx-brain{animation:rvtBump .5s}',
    '.rvx-hum{position:absolute;right:16px;bottom:16px;display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:800;background:#fff;border-radius:999px;padding:5px 11px 5px 5px;box-shadow:0 0 0 1.5px var(--line);opacity:0;transform:translateY(10px);transition:all .5s}',
    '.rvx-hum.show{opacity:1;transform:none}',
    '.rvx-face{width:28px;height:28px;border-radius:50%;background:#E0AC69;position:relative;flex:0 0 28px;overflow:hidden}.rvx-face:before{content:"";position:absolute;left:0;right:0;top:0;height:11px;background:#1E1611;border-radius:14px 14px 4px 4px}.rvx-face:after{content:"";position:absolute;left:8px;top:15px;width:12px;height:5px;border-bottom:2.5px solid #121110;border-radius:0 0 8px 8px}',
    '.rvx-arrow{position:absolute;height:3px;background:repeating-linear-gradient(90deg,var(--k) 0 7px,transparent 7px 12px);transform-origin:left center;opacity:0;transition:opacity .3s}.rvx-arrow.show{opacity:1;animation:rvtDash 1s linear infinite}',
    '.rvx-meter{position:absolute;left:18px;top:24px;width:118px;height:118px}',
    '.rvx-meter circle.f{transition:stroke-dashoffset 1.6s cubic-bezier(.3,.8,.2,1)}',
    '.rvx-meter b{position:absolute;inset:0;display:grid;place-items:center;font-size:30px;letter-spacing:-.05em}',
    '.rvx-list{position:absolute;left:150px;right:14px;top:22px;display:flex;flex-direction:column;gap:6px}',
    '.rvx-li{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;background:#fff;border-radius:11px;padding:6px 9px;box-shadow:0 0 0 1px var(--line)}',
    '.rvx-li u{flex:0 0 18px;height:18px;border-radius:50%;box-shadow:inset 0 0 0 1.5px #E2DDD0;display:grid;place-items:center;font-size:10px;text-decoration:none;transition:all .3s}',
    '.rvx-li.ok u{background:var(--y);box-shadow:none}.rvx-li.ok u:after{content:"\\2713";font-weight:800}',
    '.rvx-live{position:absolute;left:18px;bottom:18px;display:flex;align-items:center;gap:10px;font-weight:800;font-size:14px}',
    '.rvx-sw{width:54px;height:32px;border-radius:999px;background:#D9D4C8;padding:3px;transition:background .3s}.rvx-sw span{display:block;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.2);transition:transform .35s cubic-bezier(.2,.9,.3,1.3)}',
    '.rvx-sw.on{background:var(--y)}.rvx-sw.on span{transform:translateX(22px)}',
    '.rvx-dot{width:9px;height:9px;border-radius:50%;background:#2E9E5B;opacity:0;transition:opacity .3s}.rvx-sw.on~.rvx-dot{opacity:1;animation:rvtPulse 1.4s infinite}',
    '.rvx-sl{position:absolute;left:16px;width:44%;font-size:10.5px;font-weight:800;color:var(--mut)}.rvx-sl div{height:7px;border-radius:7px;background:#ECE7DB;margin-top:5px;position:relative}.rvx-sl div i{position:absolute;top:50%;width:17px;height:17px;border-radius:50%;background:#fff;box-shadow:0 0 0 2.5px var(--k);transform:translate(-50%,-50%);transition:left 1s cubic-bezier(.4,0,.2,1)}.rvx-sl div s{position:absolute;left:0;top:0;bottom:0;border-radius:7px;background:var(--y);transition:width 1s cubic-bezier(.4,0,.2,1)}',
    '.rvx-tag{position:absolute;left:50%;top:12px;transform:translateX(-50%);font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);white-space:nowrap}',
    '.rvx-shield{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%) scale(.6);opacity:0;transition:all .45s cubic-bezier(.2,.9,.3,1.4);font-size:11.5px;font-weight:800;background:var(--k);color:#fff;border-radius:999px;padding:7px 12px;white-space:nowrap}',
    '.rvx-shield.show{opacity:1;transform:translate(-50%,-50%) scale(1)}',
    /* demo */
    '.rvd{display:flex;flex-direction:column;gap:12px}',
    '.rvd-stage{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:14px;position:relative;min-height:440px}',
    '.rvd-pan{background:#fff;border-radius:20px;box-shadow:0 0 0 1px var(--line),0 24px 50px -36px rgba(0,0,0,.45);display:flex;flex-direction:column;min-width:0;overflow:hidden;transition:opacity .35s,transform .35s}',
    '.rvd-h{display:flex;align-items:center;gap:9px;padding:11px 13px;border-bottom:1px solid var(--line)}.rvd-h b{font-size:13.5px;display:block;line-height:1.2}.rvd-h small{font-size:11px;color:var(--mut);font-weight:700}',
    '.rvd-body{padding:12px 13px;display:flex;flex-direction:column;gap:9px;flex:1;min-height:0;position:relative}',
    '.rvd-f{display:flex;flex-direction:column;gap:4px}.rvd-f>span{font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}',
    '.rvd-in{min-height:34px;border-radius:11px;box-shadow:inset 0 0 0 1.5px #E2DDD0;padding:8px 10px;font-size:13px;font-weight:600;transition:box-shadow .2s;overflow-wrap:anywhere}',
    '.rvd-in.focus{box-shadow:inset 0 0 0 1.5px var(--y),0 0 0 3px var(--mint)}',
    '.rvd-in.ph:empty:before{content:attr(data-ph);color:#B4AE9F;font-weight:500}',
    '.rvd-caret:after{content:"";display:inline-block;width:2px;height:1.05em;background:var(--k);vertical-align:-2px;margin-left:1px;animation:rvtBlink .8s steps(1) infinite}',
    '.rvd-row{display:flex;gap:8px;align-items:center}',
    '.rvd-sl{flex:1;font-size:10.5px;font-weight:800;color:var(--mut)}.rvd-sl div{height:6px;border-radius:6px;background:#ECE7DB;margin-top:6px;position:relative}.rvd-sl s{position:absolute;left:0;top:0;bottom:0;background:var(--y);border-radius:6px;transition:width .9s cubic-bezier(.4,0,.2,1)}.rvd-sl i{position:absolute;top:50%;width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 0 0 2.5px var(--k);transform:translate(-50%,-50%);transition:left .9s cubic-bezier(.4,0,.2,1)}',
    '.rvd-btn{align-self:flex-start;background:var(--k);color:#fff;font-size:12px;font-weight:800;border-radius:999px;padding:7px 13px;transition:transform .15s}.rvd-btn.y{background:var(--y);color:var(--k)}.rvd-btn.press{transform:scale(.92)}',
    '.rvd-brain{border-radius:14px;background:#FAF9F5;box-shadow:inset 0 0 0 1px var(--line);padding:8px;display:flex;flex-direction:column;gap:5px}',
    '.rvd-brain>span{font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);display:flex;justify-content:space-between}',
    '.rvd-k{font-size:11.5px;font-weight:700;background:#fff;border-radius:9px;padding:6px 8px;box-shadow:0 0 0 1px var(--line);display:flex;gap:6px;align-items:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.rvd-k em{font-style:normal;font-size:9.5px;font-weight:800;border-radius:999px;padding:1px 6px;background:var(--mint);color:#7A5800;flex:0 0 auto}.rvd-k.new{animation:rvtSlide .55s cubic-bezier(.2,.9,.3,1.2) both;box-shadow:0 0 0 1.5px var(--y)}',
    '.rvd-k.fix em{background:#E8F6EC;color:#14532D}',
    '.rvd-foot{display:flex;align-items:center;gap:10px;margin-top:auto;padding-top:4px}',
    '.rvd-ring{width:46px;height:46px;position:relative;flex:0 0 46px}.rvd-ring svg{width:46px;height:46px;transform:rotate(-90deg)}.rvd-ring b{position:absolute;inset:0;display:grid;place-items:center;font-size:14px}',
    '.rvd-ring circle.f{transition:stroke-dashoffset 1.4s cubic-bezier(.3,.8,.2,1),stroke .4s}',
    '.rvd-chat{background:#F2F0EA}',
    '.rvd-msgs{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:7px;padding:12px;overflow:hidden;min-height:0}',
    '.rvd-m{max-width:88%;font-size:12.5px;line-height:1.4;padding:8px 11px;border-radius:14px;animation:rvtIn .35s both;overflow-wrap:anywhere}',
    '.rvd-m.c{align-self:flex-start;background:#fff;border-bottom-left-radius:4px}.rvd-m.a{align-self:flex-end;background:var(--y);border-bottom-right-radius:4px;font-weight:600}',
    '.rvd-m.a.bad{background:#FFE3D6}.rvd-m.a mark{background:#fff;border-radius:4px;padding:0 2px;color:inherit}',
    '.rvd-used{display:block;font-size:10px;font-weight:800;opacity:.75;margin-top:3px}',
    '.rvd-fixb{align-self:flex-end;font-size:11px;font-weight:800;background:#fff;color:#9A2A12;border-radius:999px;padding:4px 10px;box-shadow:0 0 0 1.5px #FFD2C4;animation:rvtIn .3s both}.rvd-fixb.press{transform:scale(.92)}',
    '.rvd-typing{align-self:flex-end;display:flex;gap:4px;padding:10px 12px;background:var(--y2);border-radius:14px}.rvd-typing i{width:6px;height:6px;border-radius:50%;background:var(--k);opacity:.4;animation:rvtDot 1.1s infinite}.rvd-typing i:nth-child(2){animation-delay:.15s}.rvd-typing i:nth-child(3){animation-delay:.3s}',
    '.rvd-note{align-self:center;font-size:11px;font-weight:800;color:#14532D;background:#E8F6EC;border-radius:999px;padding:4px 10px;animation:rvtIn .3s both}',
    '.rvd-inp{margin:0 10px 10px;background:#fff;border-radius:999px;padding:8px 12px;font-size:12px;color:#B4AE9F;font-weight:600}',
    '.rvd-modal{position:absolute;inset:0;background:rgba(18,17,16,.35);display:grid;place-items:center;padding:14px;opacity:0;pointer-events:none;transition:opacity .3s;z-index:3;border-radius:20px}',
    '.rvd-modal.show{opacity:1}',
    '.rvd-mbox{background:#fff;border-radius:18px;padding:14px;width:min(330px,100%);display:flex;flex-direction:column;gap:8px;box-shadow:0 30px 60px -20px rgba(0,0,0,.5);transform:translateY(10px) scale(.96);transition:transform .35s cubic-bezier(.2,.9,.3,1.2)}',
    '.rvd-modal.show .rvd-mbox{transform:none}.rvd-mbox strong{font-size:14px}.rvd-was{font-size:11.5px;color:#9A2A12;background:#FFF6F3;border-radius:10px;padding:6px 8px;text-decoration:line-through}',
    '.rvd-cur{position:absolute;left:50%;top:50%;width:24px;height:24px;z-index:5;pointer-events:none;transition:left .75s cubic-bezier(.5,0,.2,1),top .75s cubic-bezier(.5,0,.2,1),transform .15s;filter:drop-shadow(0 3px 4px rgba(0,0,0,.3))}',
    '.rvd-cur.press{transform:scale(.8)}',
    '.rvd-cap{display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
    '.rvd-cap p{margin:0;flex:1 1 220px;min-width:0;font-weight:800;font-size:clamp(14.5px,2.6cqi,18px);letter-spacing:-.02em;line-height:1.3;min-height:2.6em;display:flex;align-items:center}',
    '.rvd-cap p span{animation:rvtIn .4s both}.rvd-cap p em{font-style:normal;background:linear-gradient(transparent 58%,#FFE58A 58%)}',
    '.rvd-ctl{display:flex;gap:6px}.rvd-ctl button{border:0;cursor:pointer;font:inherit;font-size:12.5px;font-weight:800;border-radius:999px;padding:8px 13px;background:#fff;box-shadow:inset 0 0 0 1.5px #E2DDD0;color:var(--k);display:inline-flex;align-items:center;gap:6px}',
    '.rvd-ctl button:hover{box-shadow:inset 0 0 0 1.5px var(--k)}.rvd-ctl button.k{background:var(--k);color:#fff;box-shadow:none}',
    '.rvd-ctl button:focus-visible{outline:3px solid var(--y);outline-offset:2px}',
    '.rvd-prog{height:5px;border-radius:5px;background:#ECE7DB;overflow:hidden}.rvd-prog i{display:block;height:100%;width:0;background:linear-gradient(90deg,#FFD23F,#FFC21A);border-radius:5px;transition:width .3s linear}',
    '.rvd-step{font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7A5800;background:var(--mint);border-radius:999px;padding:4px 10px;white-space:nowrap}',
    '.rvd-end{position:absolute;inset:0;z-index:6;border-radius:20px;background:rgba(255,255,255,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .4s}',
    '.rvd-end.show{opacity:1;pointer-events:auto}.rvd-end strong{font-size:clamp(20px,4cqi,28px);letter-spacing:-.04em;line-height:1.1}',
    '.rvd-sw{width:46px;height:27px;border-radius:999px;background:#D9D4C8;padding:3px;transition:background .3s;flex:0 0 46px}.rvd-sw span{display:block;width:21px;height:21px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.2);transition:transform .35s cubic-bezier(.2,.9,.3,1.3)}.rvd-sw.on{background:var(--y)}.rvd-sw.on span{transform:translateX(19px)}',
    '.rvd-live{font-size:12px;font-weight:800;display:flex;align-items:center;gap:6px}.rvd-live i{width:8px;height:8px;border-radius:50%;background:#B4AE9F}.rvd-live.on i{background:#2E9E5B;animation:rvtPulse 1.4s infinite}',
    '@container (max-width:640px){.rvd-stage{grid-template-columns:1fr;min-height:540px}.rvd-body{gap:7px;padding:10px 11px}.rvd-pan{position:absolute;inset:0}.rvd .rvd-pan.off{opacity:0;transform:translateY(8px) scale(.98);pointer-events:none}.rvd-ctl button span{display:none}}',
    '.rvd-tabs{display:flex;gap:6px;justify-content:center}.rvd-tabs span{font-size:11px;font-weight:800;border-radius:999px;padding:4px 10px;background:#fff;box-shadow:inset 0 0 0 1px var(--line);color:var(--mut);transition:all .3s}.rvd-tabs span.on{background:var(--k);color:#fff;box-shadow:none}',
    '@container (min-width:641px){.rvd-tabs{display:none}}',
    '.rvd-still{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.rvd-still div{background:#fff;border-radius:16px;padding:12px;box-shadow:0 0 0 1px var(--line);font-size:13px}.rvd-still b{display:block;margin-bottom:4px}',
    '@keyframes rvtIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
    '@keyframes rvtSlide{from{opacity:0;transform:translateY(-10px) scale(.96)}to{opacity:1;transform:none}}',
    '@keyframes rvtDot{0%,60%,100%{opacity:.3}30%{opacity:.9}}@keyframes rvtBlink{50%{opacity:0}}',
    '@keyframes rvtBump{50%{transform:scale(1.12)}}@keyframes rvtDash{to{background-position:24px 0}}',
    '@keyframes rvtPulse{0%,100%{box-shadow:none}}',
    '@keyframes rvtFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}',
    '.rvt-float{animation:rvtFloat 4s ease-in-out infinite}',
    '@media (prefers-reduced-motion:reduce){.rvt *{animation:none!important;transition:none!important}}'
  ].join('\n');
  function css() { if (!document.getElementById('rvt-css')) { var st = document.createElement('style'); st.id = 'rvt-css'; st.textContent = CSS; document.head.appendChild(st); } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var reduced = function () { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); };
  function bot(color, w, letter) {
    var h = Math.round(w * 130 / 120);
    return '<svg viewBox="0 0 120 130" width="' + w + '" height="' + h + '" aria-hidden="true"><path d="M60 8v14" stroke="#121110" stroke-width="4" stroke-linecap="round"/><circle cx="60" cy="8" r="7" fill="' + color + '" stroke="#121110" stroke-width="3"/>' +
      '<rect x="8" y="44" width="12" height="22" rx="6" fill="#121110"/><rect x="100" y="44" width="12" height="22" rx="6" fill="#121110"/><rect x="16" y="22" width="88" height="64" rx="26" fill="' + color + '" stroke="#121110" stroke-width="4"/>' +
      '<rect x="28" y="34" width="64" height="40" rx="16" fill="#121110"/><rect x="42" y="45" width="10" height="14" rx="5" fill="' + color + '"/><rect x="68" y="45" width="10" height="14" rx="5" fill="' + color + '"/><path d="M51 64q9 7 18 0" stroke="' + color + '" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M34 92h52a12 12 0 0 1 12 12v22H22v-22a12 12 0 0 1 12-12z" fill="' + color + '" stroke="#121110" stroke-width="4"/><circle cx="60" cy="110" r="10" fill="#121110"/><text x="60" y="114.5" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-weight="800" font-size="12" fill="' + color + '">' + esc(letter || 'A') + '</text></svg>';
  }
  var BRAIN = '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#FFC21A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h0a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h0a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';
  var CURSOR = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 2l15 9-6.5 1.6L16 20l-3 1.6-3.6-7.4L4 18z" fill="#fff" stroke="#121110" stroke-width="1.8" stroke-linejoin="round"/></svg>';

  /* ---------- sample reply for the personality sliders ---------- */
  var SAMPLES = {
    sales: { q: 'How much is the serum?', core: ['It’s $24 and in stock right now', 'The serum is $24 and is currently in stock'], extra: ['Most people grab the bundle with the cream and save $5', 'Many customers choose the bundle with the cream, which saves $5'], cta: ['Want me to send the link?', 'Would you like me to send you the payment link?'] },
    support: { q: 'My order hasn’t arrived yet', core: ['Sorry about that! I’ve checked and it’s out for delivery today', 'I apologise for the delay. Your order is out for delivery today'], extra: ['You’ll get a text from the courier about an hour before', 'The courier will send you a message about an hour before arrival'], cta: ['Anything else I can do?', 'Is there anything else I can help you with?'] },
    vip: { q: 'Any early access this week?', core: ['Yes! You get first pick of the new drop on Thursday', 'Certainly. As a VIP you have early access to the new collection on Thursday'], extra: ['I can hold one for you before it goes public', 'I would be glad to reserve an item for you before the public launch'], cta: ['Shall I reserve one?', 'Shall I reserve one for you?'] },
    guard: { q: 'When is the next live session?', core: ['Next live is Friday at 6pm', 'The next live session is on Friday at 6pm'], extra: ['The link gets pinned an hour before', 'The link will be pinned in the group one hour before'], cta: ['See you there!', 'We look forward to seeing you there.'] },
    book: { q: 'Can I book for Friday?', core: ['Friday works! I have 10am and 2pm free', 'Certainly. Friday has openings at 10am and 2pm'], extra: ['Each session is 45 minutes and you can reschedule for free', 'Each session lasts 45 minutes and can be rescheduled at no cost'], cta: ['Which one suits you?', 'Which time would you prefer?'] },
    win: { q: 'Sorry, I forgot to pay', core: ['No worries at all! Your cart is still saved', 'Not a problem. Your cart has been saved for you'], extra: ['The free shipping offer is still on until Sunday', 'Free shipping is still available until Sunday'], cta: ['Want the link again?', 'Would you like me to resend the payment link?'] }
  };
  function sample(p, tpl) {
    p = p || {}; var s = SAMPLES[tpl] || SAMPLES.sales;
    var tone = p.tone == null ? 30 : p.tone, len = p.length == null ? 40 : p.length, emo = p.emoji == null ? 30 : p.emoji;
    var f = tone > 65 ? 1 : 0;
    var hi = tone < 40 ? 'Hey! ' : tone > 65 ? 'Good afternoon. ' : 'Hi! ';
    var e1 = emo > 70 ? '👋 ' : '', e2 = emo >= 25 && emo <= 70 ? ' 😊' : emo > 70 ? ' ✨' : '', e3 = emo > 70 ? ' 🛒' : '';
    var out = hi + e1 + s.core[f] + '.' + (emo >= 25 && emo <= 70 && len < 40 ? e2 : '');
    if (len >= 40) out += ' ' + s.cta[f] + (emo >= 25 && emo <= 70 ? e2 : e3);
    if (len > 65) out = hi + e1 + s.core[f] + '.' + (emo > 70 ? e2 : '') + ' ' + s.extra[f] + '. ' + s.cta[f] + (emo >= 25 && emo <= 70 ? e2 : e3);
    if (len < 40 && emo > 70) out += e2;
    return { q: s.q, a: out.replace(/\s+/g, ' ').trim() };
  }

  /* ---------- a cancellable, pausable clock ---------- */
  function Clock(root, loop) {
    var self = this; self.gen = 0; self.paused = false; self.visible = true; self.dead = false;
    if (loop && 'IntersectionObserver' in window) { self.io = new IntersectionObserver(function (es) { self.visible = es[0].isIntersecting; }); self.io.observe(root); }
    self.wait = function (ms) {
      var g = self.gen;
      return new Promise(function (res, rej) {
        var left = ms, last = performance.now();
        (function tick() {
          if (!root.isConnected && self.started) self.dead = true;
          if (self.dead || g !== self.gen) return rej(new Error('cancel'));
          self.started = true;
          var now = performance.now();
          if (!self.paused && self.visible && !document.hidden) left -= now - last;
          last = now;
          if (left <= 0) res(); else setTimeout(tick, Math.min(60, left));
        })();
      });
    };
    self.stop = function () { self.dead = true; if (self.io) self.io.disconnect(); };
  }

  /* ======================= explainers ======================= */
  var EX = {
    1: {
      label: 'Animation: a Closer tries on different jobs, sales, support and bookings, and says a typical line for each.',
      html: function () {
        return '<span class="rvx-tag">Pick a job</span><div class="rvx-bot" style="top:36%"><div class="rvt-float" data-bot>' + bot('#FFC21A', 74, 'A') + '</div></div>' +
          '<span class="rvx-chip" data-c="0" style="left:6%;top:24%">💸 Sales</span><span class="rvx-chip" data-c="1" style="left:6%;top:52%">🛟 Support</span><span class="rvx-chip" data-c="2" style="right:6%;top:24%">📅 Bookings</span><span class="rvx-chip" data-c="3" style="right:6%;top:52%">👑 VIP</span>' +
          '<div class="rvx-b out" data-b style="left:50%;bottom:12px;transform:translateX(-50%);max-width:86%;text-align:center"></div>';
      },
      run: async function (r, w) {
        var lines = [['#FFC21A', 'A', 'It’s $24. Want the payment link? 💸'], ['#8FB8FF', 'M', 'Sorry about that! Your order ships today.'], ['#FFB199', 'T', 'Friday at 2pm works. Shall I book it?'], ['#C9A7FF', 'R', 'Welcome back! Early access opens Thursday.']];
        for (var i = 0; i < 4; i++) {
          r.querySelectorAll('[data-c]').forEach(function (c) { c.classList.toggle('on', +c.getAttribute('data-c') === i); });
          r.querySelector('[data-bot]').innerHTML = bot(lines[i][0], 74, lines[i][1]);
          var b = r.querySelector('[data-b]'); b.classList.remove('show'); await w(250); b.textContent = lines[i][2]; b.classList.add('show'); b.style.transform = 'translateX(-50%)';
          await w(2100);
        }
      }
    },
    2: {
      label: 'Animation: personality sliders move from formal to friendly and the Closer’s sample reply changes to match.',
      html: function () {
        return '<div class="rvx-sl" style="top:22px">Formal ↔ Friendly<div><s data-s1 style="width:80%"></s><i data-t1 style="left:80%"></i></div></div><div class="rvx-sl" style="top:64px">Emoji<div><s data-s2 style="width:10%"></s><i data-t2 style="left:10%"></i></div></div>' +
          '<div class="rvx-bot" style="left:auto;right:12px;top:16px;transform:none">' + bot('#FFC21A', 64, 'A') + '</div>' +
          '<div class="rvx-b in show" style="left:16px;top:112px;max-width:60%">How much is the serum?</div><div class="rvx-b out show" data-b style="right:14px;bottom:14px;max-width:70%"></div>';
      },
      run: async function (r, w) {
        var set = function (t, e) { r.querySelector('[data-s1]').style.width = (100 - t) + '%'; r.querySelector('[data-t1]').style.left = (100 - t) + '%'; r.querySelector('[data-s2]').style.width = e + '%'; r.querySelector('[data-t2]').style.left = e + '%'; r.querySelector('[data-b]').textContent = sample({ tone: t, length: 50, emoji: e }, 'sales').a; };
        set(85, 10); await w(2400); set(50, 45); await w(2400); set(12, 90); await w(2800);
      }
    },
    3: {
      label: 'Animation: an FAQ card “Do you deliver on Sundays?” slides into the Closer’s brain. A customer asks the same thing and the Closer answers with the exact line it was taught, highlighted.',
      html: function () {
        return '<div class="rvx-card" data-card><b>New Q&amp;A</b><div class="q">Do you deliver on Sundays?</div><div class="a">No, but order by Saturday noon and it arrives Monday.</div></div>' +
          '<div class="rvx-brain">' + BRAIN + '<i data-n>Learning</i></div>' +
          '<div class="rvx-b in" data-q style="left:14px;top:118px">Do you deliver on Sundays? 🙏</div>' +
          '<div class="rvx-b out" data-a style="right:14px;bottom:14px">Not on Sundays, but <mark>order by Saturday noon and it arrives Monday</mark>! 🚚</div>';
      },
      run: async function (r, w) {
        r.classList.remove('k2'); r.querySelector('[data-n]').textContent = 'Learning';
        ['[data-q]', '[data-a]'].forEach(function (s) { r.querySelector(s).classList.remove('show', 'hl'); });
        await w(1300); r.classList.add('k2'); await w(800); r.querySelector('[data-n]').textContent = 'Learned ✓';
        await w(900); r.querySelector('[data-q]').classList.add('show');
        await w(1500); r.querySelector('[data-a]').classList.add('show');
        await w(700); r.querySelector('[data-a]').classList.add('hl'); await w(3200);
      }
    },
    4: {
      label: 'Animation: an angry customer asks for a refund, the handoff rule lights up and the chat is passed to a human teammate.',
      html: function () {
        return '<div class="rvx-b angry" data-q style="left:14px;top:18px">This is ridiculous!! I want a refund 😡</div>' +
          '<div class="rvx-bot" style="left:16px;top:auto;bottom:14px;transform:none">' + bot('#FFC21A', 60, 'A') + '</div>' +
          '<div class="rvx-shield" data-r>⚑ Rule: refund → hand over</div>' +
          '<div class="rvx-b out" data-a style="left:86px;bottom:22px;max-width:46%">So sorry! I’m bringing in a teammate now.</div>' +
          '<div class="rvx-hum" data-h><span class="rvx-face"></span>Grace joined</div>';
      },
      run: async function (r, w) {
        ['[data-q]', '[data-a]', '[data-r]', '[data-h]'].forEach(function (s) { r.querySelector(s).classList.remove('show'); });
        await w(600); r.querySelector('[data-q]').classList.add('show');
        await w(1300); r.querySelector('[data-r]').classList.add('show');
        await w(1300); r.querySelector('[data-a]').classList.add('show');
        await w(1100); r.querySelector('[data-r]').classList.remove('show'); r.querySelector('[data-h]').classList.add('show');
        await w(3000);
      }
    },
    5: {
      label: 'Animation: the training checklist ticks off, the score meter fills to 92 and the Live switch flips on.',
      html: function () {
        return '<div class="rvx-meter"><svg viewBox="0 0 120 120" width="118" height="118" style="transform:rotate(-90deg)"><circle cx="60" cy="60" r="50" fill="none" stroke="#ECE7DB" stroke-width="12"/><circle class="f" data-f cx="60" cy="60" r="50" fill="none" stroke="#FFC21A" stroke-width="12" stroke-linecap="round" stroke-dasharray="314" stroke-dashoffset="314"/></svg><b data-n>0</b></div>' +
          '<div class="rvx-list">' + ['Personality', '5+ Q&As', 'Prices', 'Rules', 'Tests passed'].map(function (t, i) { return '<div class="rvx-li" data-li="' + i + '"><u></u>' + t + '</div>'; }).join('') + '</div>' +
          '<div class="rvx-live"><div class="rvx-sw" data-sw><span></span></div><i class="rvx-dot"></i><span data-lt>Off</span></div>';
      },
      run: async function (r, w) {
        var f = r.querySelector('[data-f]'), n = r.querySelector('[data-n]'), sw = r.querySelector('[data-sw]');
        f.style.transition = 'none'; f.style.strokeDashoffset = 314; n.textContent = '0'; sw.classList.remove('on'); r.querySelector('[data-lt]').textContent = 'Off';
        r.querySelectorAll('[data-li]').forEach(function (l) { l.classList.remove('ok'); });
        await w(500); f.style.transition = '';
        for (var i = 0; i < 5; i++) { r.querySelector('[data-li="' + i + '"]').classList.add('ok'); var v = [20, 42, 61, 78, 92][i]; f.style.strokeDashoffset = 314 * (1 - v / 100); n.textContent = v; await w(650); }
        await w(500); sw.classList.add('on'); r.querySelector('[data-lt]').textContent = 'Live'; await w(3200);
      }
    }
  };
  function explainer(el, step) {
    css();
    var d = EX[step] || EX[1];
    var root = document.createElement('div');
    root.className = 'rvt rvx'; root.setAttribute('role', 'img'); root.setAttribute('aria-label', d.label);
    root.innerHTML = d.html();
    el.innerHTML = ''; el.appendChild(root);
    if (reduced()) {
      root.querySelectorAll('.rvx-b,.rvx-hum,.rvx-shield').forEach(function (b) { b.classList.add('show'); });
      if (step === 1) { var b1 = root.querySelector('[data-b]'); b1.textContent = 'It’s $24. Want the payment link? 💸'; b1.style.transform = 'translateX(-50%)'; root.querySelector('[data-c="0"]').classList.add('on'); }
      if (step === 2) root.querySelector('[data-b]').textContent = sample({ tone: 30, length: 50, emoji: 45 }, 'sales').a;
      if (step === 3) root.classList.add('k2');
      if (step === 4) root.querySelector('[data-r]').classList.remove('show');
      if (step === 5) { root.querySelector('[data-f]').style.strokeDashoffset = 314 * 0.08; root.querySelector('[data-n]').textContent = '92'; root.querySelectorAll('[data-li]').forEach(function (l) { l.classList.add('ok'); }); root.querySelector('[data-sw]').classList.add('on'); root.querySelector('[data-lt]').textContent = 'Live'; }
      return { stop: function () {}, el: root };
    }
    var clock = new Clock(root, true);
    (async function loop() { try { for (;;) await d.run(root, clock.wait); } catch (e) { /* stopped */ } })();
    return { el: root, stop: clock.stop };
  }

  /* ======================= the 30-second live training demo ======================= */
  var CAPS = [
    ['1 · Pick a role', 'Meet <em>Glow Labs</em>. Let’s train their Closer, Ace.'],
    ['2 · Personality', 'Slide to set the tone. <em>Friendly</em>, short, one emoji.'],
    ['3 · Teach it', 'Teach it like a new hire: <em>one question, one answer.</em>'],
    ['3 · Teach it', 'A customer asks. Ace answers with <em>exactly what you taught.</em>'],
    ['4 · Fix it', 'Wrong answer? <em>Fix it in one tap.</em>'],
    ['4 · Fix it', 'Next time, it’s <em>right</em>. Every time.'],
    ['5 · Go live', 'Training score 92. <em>Flip it live.</em>']
  ];
  function demoMarkup(o) {
    return '<div class="rvd-stage" data-stage aria-hidden="true">' +
      '<div class="rvd-pan rvd-studio" data-p="studio"><div class="rvd-h"><span data-av>' + bot('#FFC21A', 34, 'A') + '</span><span style="flex:1;min-width:0"><b>Agent Studio</b><small>Glow Labs · skincare</small></span><span class="rvd-step" data-step>Coach</span></div>' +
      '<div class="rvd-body"><div class="rvd-row"><div class="rvd-f" style="flex:1"><span>Closer name</span><div class="rvd-in ph" data-name data-ph="e.g. Ace"></div></div><div class="rvd-f" style="flex:1"><span>Role</span><div class="rvd-in" data-role style="font-weight:800">Sales Closer</div></div></div>' +
      '<div class="rvd-row"><div class="rvd-sl">Formal ↔ Friendly<div><s data-ts style="width:30%"></s><i data-tt style="left:30%"></i></div></div><div class="rvd-sl">Emoji<div><s data-es style="width:10%"></s><i data-et style="left:10%"></i></div></div></div>' +
      '<div class="rvd-f"><span>Question customers ask</span><div class="rvd-in ph" data-q data-ph="e.g. Do you deliver on Sundays?"></div></div>' +
      '<div class="rvd-f"><span>Your answer</span><div class="rvd-in ph" data-a data-ph="Write it the way you’d say it in chat"></div></div>' +
      '<span class="rvd-btn" data-add>+ Add to brain</span>' +
      '<div class="rvd-brain"><span>What it knows <b data-cnt></b></span><div class="rvd-k"><em>Product</em>Vitamin C Serum · $24</div><div class="rvd-k"><em>Policy</em>Returns within 14 days</div><div data-new></div></div>' +
      '<div class="rvd-foot"><div class="rvd-ring"><svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="19" fill="none" stroke="#ECE7DB" stroke-width="5"/><circle class="f" data-rf cx="23" cy="23" r="19" fill="none" stroke="#FF7A59" stroke-width="5" stroke-linecap="round" stroke-dasharray="119.4" stroke-dashoffset="71.6"/></svg><b data-rn>40</b></div><span style="flex:1;font-size:11.5px;font-weight:800;color:#5E5A50">Training score</span><span class="rvd-live" data-live><i></i><span data-lt>Off</span></span><div class="rvd-sw" data-sw><span></span></div></div>' +
      '<div class="rvd-modal" data-modal><div class="rvd-mbox"><strong>Fix this answer</strong><span style="font-size:11px;font-weight:800;color:#5E5A50">Customer asked: “Is the serum vegan?”</span><div class="rvd-was">Yes, it’s 100% organic.</div><div class="rvd-in ph" data-fix data-ph="Correct answer"></div><span class="rvd-btn y" data-save>Save correction</span></div></div></div></div>' +
      '<div class="rvd-pan rvd-chat" data-p="chat"><div class="rvd-h" style="background:#fff"><span>' + bot('#FFC21A', 34, 'A') + '</span><span style="flex:1;min-width:0"><b data-cn>Glow Labs</b><small>Test chat · AI</small></span></div><div class="rvd-msgs" data-msgs></div><div class="rvd-inp">Message as a customer…</div></div>' +
      '<div class="rvd-cur" data-cur>' + CURSOR + '</div><div class="rvd-end" data-end><strong>That’s how you train a Closer.</strong><span style="color:#5E5A50;font-weight:600;max-width:360px">Teach it once. Fix it once. It answers right, day and night.</span>' + (o.endCta || '') + '</div></div>' +
      '<div class="rvd-tabs" aria-hidden="true"><span data-tab="studio" class="on">Studio</span><span data-tab="chat">Test chat</span></div>' +
      '<div class="rvd-prog"><i data-prog></i></div>' +
      '<div class="rvd-cap"><p aria-live="polite" data-cap></p>' + (o.controls === false ? '' : '<div class="rvd-ctl"><button type="button" data-ctl="pause" aria-label="Pause demo">❚❚<span>Pause</span></button><button type="button" data-ctl="replay" aria-label="Replay demo">↺<span>Replay</span></button>' + (o.voice ? '<button type="button" data-ctl="voice" aria-label="Voice on or off">' + (window.RVVoice && window.RVVoice.on() ? '🔊<span>Voice</span>' : '🔇<span>Muted</span>') + '</button>' : '') + (o.onSkip ? '<button type="button" class="k" data-ctl="skip">Skip<span>demo</span></button>' : '') + '</div>') + '</div>';
  }
  function still(el, o) {
    el.innerHTML = '<div class="rvt rvd"><div class="rvd-still" role="list">' + [['1 · Pick a role', 'Glow Labs picks “Sales Closer” and names it Ace.'], ['2 · Personality', 'Friendly tone, short replies, one emoji.'], ['3 · Teach it', 'Q: Do you deliver on Sundays? A: No, but order by Saturday noon and it arrives Monday.'], ['Test', 'The customer asks and Ace answers with exactly that line.'], ['4 · Fix it', 'A wrong answer gets corrected with “Fix this answer”. The next reply is right.'], ['5 · Go live', 'Training score 92, Live switch on.']].map(function (x) { return '<div role="listitem"><b>' + esc(x[0]) + '</b>' + esc(x[1]) + '</div>'; }).join('') + '</div></div>';
    return { stop: function () {}, restart: function () {} };
  }
  function demo(el, o) {
    o = o || {}; css();
    if (reduced()) return still(el, o);
    var root = document.createElement('div');
    root.className = 'rvt rvd';
    root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'Live training demo: a sample shop trains its Closer step by step');
    root.innerHTML = demoMarkup(o);
    el.innerHTML = ''; el.appendChild(root);
    var Q = function (s) { return root.querySelector(s); };
    var clock = new Clock(root, !!o.loop);
    var TOTAL = 31000, t0 = 0, elapsed = 0;
    var cap = Q('[data-cap]'), prog = Q('[data-prog]');
    var progTimer = setInterval(function () { if (!root.isConnected) { clearInterval(progTimer); clock.stop(); return; } if (!clock.paused && clock.visible && !document.hidden && t0) { elapsed += 200; prog.style.width = Math.min(100, elapsed / TOTAL * 100) + '%'; } }, 200);
    var speech = Promise.resolve();
    function voiceOn() { return !!(o.voice && window.RVVoice && window.RVVoice.on()); }
    async function caption(i) {
      if (voiceOn()) { var g = clock.gen; await speech; if (g !== clock.gen) throw new Error('restarted'); }
      cap.innerHTML = '<span>' + CAPS[i][1] + '</span>'; Q('[data-step]').textContent = CAPS[i][0];
      speech = voiceOn() ? window.RVVoice.say('d' + i) : Promise.resolve();
    }
    function focus(p) { root.querySelectorAll('[data-p]').forEach(function (x) { x.classList.toggle('off', x.getAttribute('data-p') !== p); }); root.querySelectorAll('[data-tab]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-tab') === p); }); }
    var w = clock.wait;
    async function moveTo(sel, press) {
      var t = typeof sel === 'string' ? Q(sel) : sel, st = Q('[data-stage]'), c = Q('[data-cur]');
      if (!t) return;
      var a = st.getBoundingClientRect(), b = t.getBoundingClientRect();
      c.style.left = (b.left - a.left + Math.min(b.width * 0.6, 60)) + 'px'; c.style.top = (b.top - a.top + b.height * 0.55) + 'px';
      await w(800);
      if (press) { c.classList.add('press'); t.classList.add('press'); await w(180); c.classList.remove('press'); t.classList.remove('press'); }
    }
    async function type(sel, text, speed) {
      var t = Q(sel); t.classList.add('focus', 'rvd-caret'); t.textContent = '';
      for (var i = 0; i < text.length; i++) { t.textContent += text[i]; await w(speed || 34); }
      t.classList.remove('rvd-caret'); await w(150); t.classList.remove('focus');
    }
    function msg(cls, html) { var m = document.createElement('div'); m.className = 'rvd-m ' + cls; m.innerHTML = html; Q('[data-msgs]').appendChild(m); var ms = Q('[data-msgs]'); while (ms.children.length > 7) ms.removeChild(ms.firstChild); return m; }
    async function reply(text, opts) {
      opts = opts || {};
      var ty = document.createElement('div'); ty.className = 'rvd-typing'; ty.innerHTML = '<i></i><i></i><i></i>'; Q('[data-msgs]').appendChild(ty);
      await w(1000); ty.remove();
      var m = msg('a' + (opts.bad ? ' bad' : ''), '<span data-t></span>'); var t = m.querySelector('[data-t]');
      var words = text.split(' ');
      for (var i = 0; i < words.length; i++) { t.textContent += (i ? ' ' : '') + words[i]; await w(70); }
      if (opts.mark) t.innerHTML = esc(text).replace(esc(opts.mark), '<mark>' + esc(opts.mark) + '</mark>');
      if (opts.used) m.insertAdjacentHTML('beforeend', '<span class="rvd-used">✓ Used: ' + esc(opts.used) + '</span>');
      return m;
    }
    function ring(v) { var f = Q('[data-rf]'); f.style.strokeDashoffset = 119.4 * (1 - v / 100); f.style.stroke = v >= 80 ? '#2E9E5B' : v >= 50 ? '#FFC21A' : '#FF7A59'; Q('[data-rn]').textContent = v; }
    function reset() {
      ['[data-name]', '[data-q]', '[data-a]', '[data-fix]'].forEach(function (s) { Q(s).textContent = ''; });
      Q('[data-msgs]').innerHTML = ''; Q('[data-new]').innerHTML = ''; Q('[data-cnt]').textContent = '';
      Q('[data-ts]').style.width = '30%'; Q('[data-tt]').style.left = '30%'; Q('[data-es]').style.width = '10%'; Q('[data-et]').style.left = '10%';
      Q('[data-modal]').classList.remove('show'); Q('[data-end]').classList.remove('show'); Q('[data-sw]').classList.remove('on'); Q('[data-live]').classList.remove('on'); Q('[data-lt]').textContent = 'Off';
      ring(40); elapsed = 0; prog.style.width = '0%'; focus('studio');
      var c = Q('[data-cur]'); c.style.left = '50%'; c.style.top = '40%';
    }
    async function script() {
      reset(); t0 = Date.now(); if (o.onStart) o.onStart();
      await caption(0); await w(500);
      await moveTo('[data-name]', true); await type('[data-name]', 'Ace', 90); Q('[data-cn]').textContent = 'Glow Labs · Ace';
      await moveTo('[data-role]', true); await w(900);
      await caption(1); await moveTo('[data-tt]');
      Q('[data-ts]').style.width = '82%'; Q('[data-tt]').style.left = '82%'; await w(700);
      await moveTo('[data-et]'); Q('[data-es]').style.width = '45%'; Q('[data-et]').style.left = '45%'; await w(900);
      await caption(2); await moveTo('[data-q]', true); await type('[data-q]', 'Do you deliver on Sundays?', 32);
      await moveTo('[data-a]', true); await type('[data-a]', 'Not on Sundays, but order by Saturday noon and it arrives Monday.', 22);
      await moveTo('[data-add]', true);
      Q('[data-new]').innerHTML = '<div class="rvd-k new"><em>Q&amp;A</em>Do you deliver on Sundays?</div>'; Q('[data-cnt]').textContent = '+ new'; ring(58); await w(1000);
      await caption(3); focus('chat'); await moveTo('.rvd-inp'); await w(300);
      msg('c', 'Hi! Do you deliver on Sundays?'); await w(500);
      await reply('Not on Sundays, but order by Saturday noon and it arrives Monday. 🚚', { mark: 'order by Saturday noon and it arrives Monday', used: 'Q&A “Do you deliver on Sundays?”' });
      await w(1600);
      await caption(4); msg('c', 'Is the serum vegan?'); await w(400);
      await reply('Yes, it’s 100% organic.', { bad: true });
      var fb = document.createElement('span'); fb.className = 'rvd-fixb'; fb.textContent = '✎ Fix this answer'; Q('[data-msgs]').appendChild(fb);
      await moveTo(fb, true); focus('studio'); Q('[data-modal]').classList.add('show'); await w(500);
      await moveTo('[data-fix]', true); await type('[data-fix]', 'Yes! Every Glow Labs product is vegan and cruelty-free.', 22);
      await moveTo('[data-save]', true); Q('[data-modal]').classList.remove('show');
      Q('[data-new]').insertAdjacentHTML('beforeend', '<div class="rvd-k new fix"><em>Fixed</em>Is the serum vegan?</div>'); Q('[data-cnt]').textContent = '+ fixed'; ring(74);
      fb.remove(); await w(700);
      await caption(5); focus('chat'); var n = document.createElement('div'); n.className = 'rvd-note'; n.textContent = '✓ Correction saved'; Q('[data-msgs]').appendChild(n); await w(500);
      msg('c', 'Is it vegan though? 🌱'); await w(300);
      await reply('Yes! Every Glow Labs product is vegan and cruelty-free. 🌱', { mark: 'Every Glow Labs product is vegan and cruelty-free', used: 'Your correction' });
      await w(1500);
      await caption(6); focus('studio'); ring(92); await w(900);
      await moveTo('[data-sw]', true); Q('[data-sw]').classList.add('on'); Q('[data-live]').classList.add('on'); Q('[data-lt]').textContent = 'Live';
      await w(1800); prog.style.width = '100%';
      if (o.loop) { await w(1500); return script(); }
      Q('[data-end]').classList.add('show'); var bt = Q('[data-end] button,[data-end] a'); if (bt && o.focusEnd !== false) bt.focus({ preventScroll: true });
      if (o.onEnd) o.onEnd();
    }
    function start() { if (o.voice && window.RVVoice) window.RVVoice.stop(); speech = Promise.resolve(); clock.gen++; clock.paused = false; setPauseLabel(); script().catch(function () { /* restarted or stopped */ }); }
    function setPauseLabel() { var b = Q('[data-ctl="pause"]'); if (b) { b.innerHTML = clock.paused ? '▶<span>Play</span>' : '❚❚<span>Pause</span>'; b.setAttribute('aria-label', clock.paused ? 'Play demo' : 'Pause demo'); } }
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ctl],[data-replay]'); if (!b) return;
      var k = b.getAttribute('data-ctl') || 'replay';
      if (k === 'pause') { clock.paused = !clock.paused; setPauseLabel(); if (clock.paused && window.RVVoice) window.RVVoice.stop(); }
      else if (k === 'voice') { if (window.RVVoice) { window.RVVoice.set(!window.RVVoice.on()); b.innerHTML = window.RVVoice.on() ? '🔊<span>Voice</span>' : '🔇<span>Muted</span>'; } }
      else if (k === 'replay') start();
      else if (k === 'skip' && o.onSkip) o.onSkip();
    });
    start();
    return { el: root, restart: start, stop: function () { clock.stop(); clearInterval(progTimer); if (o.voice && window.RVVoice) window.RVVoice.stop(); } };
  }

  window.RVTrain = { explainer: explainer, demo: demo, sample: sample, bot: bot };
})();
