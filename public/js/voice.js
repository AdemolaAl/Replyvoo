/* Replyvoo voice guide + voice typing. No dependencies.
   RVVoice.say(id)  → Promise (resolves when the line finishes). Plays /audio/narration/<id>.mp3 when the
                      file was generated (scripts/make-voice.js), otherwise uses the browser's built-in voice.
   RVVoice.on() / RVVoice.set(bool) / RVVoice.stop()
   Any element with [data-voice-toggle] toggles the guide; [data-voice-say="id"] is spoken when switched on.
   Any input/textarea with [data-dictate] gets a mic button ("talk to train"). */
(function () {
  'use strict';
  if (window.RVVoice) return;
  var KEY = 'rv_voice_guide';
  var store = { get: function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } }, set: function (v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } } };
  var data = null, loading = null, audio = null, current = null;
  function load() {
    if (data) return Promise.resolve(data);
    if (!loading) loading = fetch('/audio/narration/lines.json', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : { lines: {}, files: {} }; }).catch(function () { return { lines: {}, files: {} }; }).then(function (d) { data = d; return d; });
    return loading;
  }
  // Off by default: the guide only talks when someone taps “Show me how” (or switches it on).
  function on() { return store.get() === 'on'; }
  function pickVoice() {
    if (!('speechSynthesis' in window)) return null;
    var vs = speechSynthesis.getVoices().filter(function (v) { return /^en/i.test(v.lang); });
    var prefer = [/aria|jenny|ava|samantha|serena|libby|sonia|natasha/i, /google (uk|us) english female|female/i, /google us english/i, /en-gb|en-us/i];
    for (var i = 0; i < prefer.length; i++) { var f = vs.find(function (v) { return prefer[i].test(v.name) || prefer[i].test(v.lang); }); if (f) return f; }
    return vs[0] || null;
  }
  function stop() {
    if (audio) { try { audio.pause(); } catch (e) { /* ignore */ } audio = null; }
    if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
    if (current) { current(); current = null; }
  }
  // Speaks synchronously when the lines are already loaded, so browsers that require a tap
  // (iPhone, Chrome) accept it when say() is called from a click.
  function say(id, force) {
    stop();
    if (!on() && !force) return Promise.resolve();
    if (data) return speak(data, id);
    return load().then(function (d) { return speak(d, id); });
  }
  function speak(d, id) {
      var text = d.lines && d.lines[id];
      if (!text) return Promise.resolve();
      return new Promise(function (resolve) {
        var done = false;
        var finish = function () { if (done) return; done = true; current = null; resolve(); };
        current = finish;
        var guard = setTimeout(finish, 1500 + text.length * 90); // never hang the animation
        var end = function () { clearTimeout(guard); finish(); };
        if (d.files && d.files[id]) {
          audio = new Audio('/audio/narration/' + id + '.mp3');
          audio.onended = end; audio.onerror = end;
          var p = audio.play(); if (p && p.catch) p.catch(end);
          return;
        }
        // No recorded line: stay silent (captions still show). The robotic built-in browser voice is never used.
        end(); return;
        var go = function () {
          if (done) return;
          var v = pickVoice();
          if (!v) { end(); return; } // no voice installed: stay silent, captions still show
          var u = new SpeechSynthesisUtterance(text);
          u.voice = v; u.lang = v.lang || 'en-US'; u.rate = 1.04; u.pitch = 1.12; u.volume = 1;
          u.onend = end; u.onerror = end;
          speechSynthesis.speak(u);
        };
        if (speechSynthesis.getVoices().length) go(); else setTimeout(go, 300);
      });
  }
  function set(v) {
    store.set(v ? 'on' : 'off');
    if (!v) stop();
    document.querySelectorAll('[data-voice-toggle]').forEach(paintToggle);
  }
  function paintToggle(b) {
    var v = on();
    b.setAttribute('aria-pressed', String(v));
    b.innerHTML = (v ? '<span aria-hidden="true">🔊</span> Voice guide on' : '<span aria-hidden="true">🔇</span> Voice guide off');
  }
  if ('speechSynthesis' in window) { try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = function () {}; } catch (e) { /* ignore */ } }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-voice-toggle]');
    if (!b) return;
    e.preventDefault();
    set(!on());
    if (on() && b.getAttribute('data-voice-say')) say(b.getAttribute('data-voice-say'));
  });
  new MutationObserver(function () { document.querySelectorAll('[data-voice-toggle]:not([data-vt])').forEach(function (b) { b.setAttribute('data-vt', '1'); paintToggle(b); }); document.querySelectorAll('[data-dictate]:not([data-dm])').forEach(addMic); }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pagehide', stop);
  load();
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-voice-play]');
    if (!b) return;
    e.preventDefault();
    if (!on()) set(true);
    say(b.getAttribute('data-voice-play'), true);
  });

  /* ---------- voice typing ("talk to train") ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function toast(msg) { if (window.RV && RV.toast) RV.toast(msg, 'info'); }
  function insert(field, text) {
    text = String(text || '').trim(); if (!text) return;
    var v = field.value; var sep = v && !/\s$/.test(v) ? ' ' : '';
    field.value = v + sep + text.charAt(0).toUpperCase() + text.slice(1);
    field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function serverDictate(field, btn) {
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast('Voice typing isn’t supported in this browser. Try Chrome.'); return; }
    if (btn._rec) { btn._rec.stop(); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var chunks = []; var rec = new MediaRecorder(stream); btn._rec = rec; btn.classList.add('on');
      var timer = setTimeout(function () { if (rec.state !== 'inactive') rec.stop(); }, 60000);
      rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
      rec.onstop = function () {
        clearTimeout(timer); stream.getTracks().forEach(function (t) { t.stop(); }); btn._rec = null; btn.classList.remove('on');
        var blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size > 5 * 1024 * 1024) { toast('That recording is too long. Keep it under a minute.'); return; }
        var fr = new FileReader();
        fr.onload = function () {
          btn.classList.add('busy');
          fetch('/api/app/transcribe', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-rv': '1' }, body: JSON.stringify({ audio: fr.result }) })
            .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Voice typing failed.'); return j; }); })
            .then(function (j) { insert(field, j.text); })
            .catch(function (er) { toast(er.message); })
            .then(function () { btn.classList.remove('busy'); });
        };
        fr.readAsDataURL(blob);
      };
      rec.start();
    }).catch(function () { toast('Allow microphone access to talk to train.'); });
  }
  function addMic(field) {
    field.setAttribute('data-dm', '1');
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'rv-mic'; btn.setAttribute('aria-label', 'Talk to type');
    btn.title = 'Talk to type';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
    var wrap = document.createElement('span'); wrap.className = 'rv-mic-wrap';
    field.parentNode.insertBefore(wrap, field); wrap.appendChild(field); wrap.appendChild(btn);
    btn.addEventListener('click', function () {
      if (!SR) { serverDictate(field, btn); return; }
      if (btn._sr) { btn._sr.stop(); return; }
      var r = new SR(); btn._sr = r;
      r.lang = field.getAttribute('data-dictate-lang') || navigator.language || 'en-US';
      r.interimResults = false; r.continuous = false; r.maxAlternatives = 1;
      btn.classList.add('on');
      r.onresult = function (ev) { insert(field, ev.results[0][0].transcript); };
      r.onerror = function (ev) { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') serverDictate(field, btn); else if (ev.error !== 'no-speech' && ev.error !== 'aborted') toast('Voice typing stopped: ' + ev.error); };
      r.onend = function () { btn._sr = null; btn.classList.remove('on'); };
      try { r.start(); } catch (e) { btn._sr = null; btn.classList.remove('on'); serverDictate(field, btn); }
    });
  }

  window.RVVoice = { say: say, stop: stop, on: on, set: set, load: load };
})();
