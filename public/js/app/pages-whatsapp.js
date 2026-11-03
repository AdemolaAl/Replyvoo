/* Replyvoo dashboard: WhatsApp (Meta's WhatsApp Business Platform). Connect card + Embedded Signup, Advanced connect,
   templates (list, builder, Nudge template), Pulse Inbox pieces (window timer, template-only mode, files, delivery
   status) and the WhatsApp Blast. Used by pages-build.js and pages-main.js through RV.wa. */
(function () {
  'use strict';
  const RV = window.RV;
  const { $, esc, fmt, GET, PUT, POST, DEL, toast, fail, ic } = RV;
  const S = RV.S;
  const GREEN = '#25D366', GREEN_D = '#0B6E3C', GREEN_BG = '#E7F8EE';
  const info = () => (S.boot && S.boot.whatsapp) || {};
  const live = () => RV.chan('whatsapp') === 'live';
  const pill = (bg, col, t) => '<span class="pill" style="background:' + bg + ';color:' + col + '">' + t + '</span>';
  const STATUS = { APPROVED: ['#E8F6EC', '#1E6B3A', 'Approved'], PENDING: ['#FFF3CC', '#7A5800', 'In review'], IN_APPEAL: ['#FFF3CC', '#7A5800', 'In appeal'], REJECTED: ['#FFE3D6', '#9A3412', 'Rejected'], PAUSED: ['#F2F0EA', '#5E5A50', 'Paused'], DISABLED: ['#F2F0EA', '#5E5A50', 'Disabled'], LIMIT_EXCEEDED: ['#F2F0EA', '#5E5A50', 'Limit reached'] };
  const statusPill = s => { const m = STATUS[s] || ['#F2F0EA', '#5E5A50', esc(String(s || '').toLowerCase())]; return pill(m[0], m[1], m[2]); };
  const catWord = c => ({ MARKETING: 'Marketing', UTILITY: 'Utility', AUTHENTICATION: 'Login code' }[c] || c);
  const BILLING_NOTE = 'Meta bills your own WhatsApp account for template messages (Message many and follow-ups after 24 hours). Normal replies within 24 hours of the customer’s message are free on Meta’s side.';

  /* ======================= CHANNELS PAGE ======================= */
  function connectCard(list, mgr, soonBtn, wl) {
    const st = RV.chan('whatsapp'); if (st === 'off') return '';
    const n = list.filter(c => c.type === 'whatsapp').length;
    const action = st === 'live'
      ? (mgr ? '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:auto"><button class="btn btn-ink" data-wa-connect style="background:' + GREEN_D + '">' + ic('plus', '#FFFFFF', 18, 2.6) + (n ? 'Connect another number' : 'Connect WhatsApp') + '</button><button class="btn btn-ghost btn-sm" data-wa-adv>Advanced</button></div>' : '<p class="small muted" style="margin:0">Ask the shop owner to connect it.</p>')
      : '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:auto"><button class="btn btn-ghost" disabled aria-disabled="true" style="opacity:.7;cursor:default">Coming soon</button>' + soonBtn('whatsapp', wl).replace('margin-top:auto;', '') + '</div>';
    return '<section class="connect-card a-in" style="background:' + GREEN_BG + ';border:1px solid #BDEBCF;animation-delay:.04s"><div class="row" style="gap:12px">' + RV.brandIcon('whatsapp', 48) + '<span class="col" style="gap:0"><strong style="font-size:17px">WhatsApp ' + (st === 'live' ? pill('#FFFFFF', GREEN_D, 'Official') : pill('#FFFFFF', '#5E5A50', 'Coming soon')) + '</strong><span class="small" style="color:' + GREEN_D + '">WhatsApp Business Platform by Meta</span></span></div>' +
      '<ol class="steps"><li>Tap <strong>Connect WhatsApp</strong> and log in with Facebook</li><li>Pick or create your WhatsApp Business account and number</li><li>Your AI helper answers WhatsApp chats. They show up in Chats</li></ol>' +
      '<p class="small" style="margin:0;color:#2F4A3A">' + esc(BILLING_NOTE) + '</p>' + action + '</section>';
  }
  function connectedRow(c) {
    return '<span class="col grow" style="gap:0;min-width:160px"><strong class="ell">' + esc(c.display_phone || c.name) + '</strong><span class="small muted">WhatsApp' + (c.verified_name ? ' · ' + esc(c.verified_name) : '') + ' · ' + fmt(c.chats) + ' chats · ' + fmt(c.templates_approved || 0) + ' approved template' + (c.templates_approved === 1 ? '' : 's') + '</span>' +
      (c.register_error ? '<span class="small" style="color:#9A3412;font-weight:700">Finish the number setup in WhatsApp Manager, then reconnect.</span>' : '') + '</span>' +
      '<button class="btn btn-ghost btn-sm" data-wa-tpl="' + c.id + '">Templates</button>';
  }
  function bindChannels(root, after) {
    root.querySelectorAll('[data-wa-connect]').forEach(b => b.addEventListener('click', () => connect(after)));
    root.querySelectorAll('[data-wa-adv]').forEach(b => b.addEventListener('click', () => manual(after)));
    root.querySelectorAll('[data-wa-tpl]').forEach(b => b.addEventListener('click', () => templates(+b.getAttribute('data-wa-tpl'), after)));
  }

  // Meta's JavaScript SDK, loaded only when someone taps Connect WhatsApp.
  let fbLoading = null;
  function loadFb(appId, version) {
    if (window.FB && window.FB.login) return Promise.resolve(window.FB);
    if (fbLoading) return fbLoading;
    fbLoading = new Promise((resolve, reject) => {
      window.fbAsyncInit = function () { window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version }); resolve(window.FB); };
      const s = document.createElement('script');
      s.src = 'https://connect.facebook.net/en_US/sdk.js'; s.async = true; s.defer = true; s.crossOrigin = 'anonymous';
      s.onerror = () => { fbLoading = null; reject(new Error('Facebook login could not load. Check your connection or turn off an ad blocker for this page, then try again.')); };
      document.head.appendChild(s);
      setTimeout(() => { if (!window.FB) { fbLoading = null; reject(new Error('Facebook login is taking too long to load. Try again.')); } }, 20000);
    });
    return fbLoading;
  }
  function working(text) { RV.modal('<div class="col" style="gap:14px;align-items:center;text-align:center;padding:10px 0">' + RV.brandIcon('whatsapp', 64) + '<strong class="h3">' + esc(text) + '</strong><p class="muted" style="margin:0">This takes a few seconds. Keep this page open.</p></div>', { noX: true, label: text }); }
  async function connect(after) {
    const w = info();
    if (!w.signup) { manual(after, 'One-tap signup isn’t switched on yet, so connect with your own token below.'); return; }
    let FB;
    try { FB = await loadFb(w.app_id, w.graph_version); } catch (e) { fail(e); return; }
    let session = null;
    const onMsg = ev => {
      let host = ''; try { host = new URL(ev.origin).hostname; } catch (e) { return; }
      if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) return;
      let d = ev.data; try { if (typeof d === 'string') d = JSON.parse(d); } catch (e) { return; }
      if (!d || d.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (/^FINISH/.test(d.event || '')) session = d.data || {};
      else if (d.event === 'CANCEL') session = { cancelled: true };
      else if (d.event === 'ERROR') session = { error: (d.data && d.data.error_message) || 'Meta reported an error' };
    };
    window.addEventListener('message', onMsg);
    // FB.login wants a plain (not async) callback.
    FB.login(function (resp) {
      const code = resp && resp.authResponse && resp.authResponse.code;
      (async () => {
        for (let i = 0; i < 15 && code && !session; i++) await new Promise(r => setTimeout(r, 100)); // the finish message can arrive just after
        window.removeEventListener('message', onMsg);
        if (!code) { toast(session && session.error ? 'Meta: ' + session.error : 'WhatsApp setup was closed before the end. Nothing was connected.', session && session.error ? 'err' : 'info'); return; }
        working('Connecting your WhatsApp number…');
        try {
          const r = await POST('/api/app/channels/whatsapp/signup', { code, waba_id: session && session.waba_id, phone_number_id: session && session.phone_number_id });
          RV.closeModal(); toast((r.display_phone || 'Your number') + ' is connected. Your AI helper answers WhatsApp now.'); RV.confetti(30);
          if (r.warning) setTimeout(() => toast(r.warning, 'info'), 600);
          after && after();
        } catch (e) { RV.closeModal(); fail(e); }
      })();
    }, { config_id: w.config_id, response_type: 'code', override_default_response_type: true, extras: { setup: {} } });
  }
  function manual(after, note) {
    const cl = S.closers || [];
    RV.modal('<form id="waMan" class="col" style="gap:14px" novalidate><div class="row" style="gap:12px">' + RV.brandIcon('whatsapp', 48) + '<span class="col" style="gap:0"><strong class="h3">Connect with your own token</strong><span class="small muted">For businesses that already use the WhatsApp Business Platform</span></span></div>' +
      (note ? '<p class="small" style="margin:0;background:var(--soft);border:1px solid var(--line);border-radius:14px;padding:10px 12px">' + esc(note) + '</p>' : '') +
      '<div class="field"><label class="lbl" for="waPid">Phone number ID</label><input id="waPid" class="input mono" inputmode="numeric" autocomplete="off" required><span class="hint">WhatsApp Manager → Phone numbers → the number → Phone number ID (not the phone number itself).</span></div>' +
      '<div class="field"><label class="lbl" for="waWaba">WhatsApp Business Account ID</label><input id="waWaba" class="input mono" inputmode="numeric" autocomplete="off"><span class="hint">WhatsApp Manager → Account tools → Business account info. Leave empty and we’ll look it up.</span></div>' +
      '<div class="field"><label class="lbl" for="waTok">Permanent access token</label><input id="waTok" class="input mono" type="password" autocomplete="new-password" required><span class="hint">Meta Business Settings → Users → System users → Generate token, with whatsapp_business_messaging and whatsapp_business_management. It’s stored encrypted.</span></div>' +
      (cl.length ? '<div class="field"><label class="lbl" for="waCl">AI helper on this number</label><select id="waCl" class="input">' + cl.map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') + '</select></div>' : '') +
      '<p class="small muted" style="margin:0">' + esc(BILLING_NOTE) + '</p>' +
      '<button class="btn btn-ink" type="submit" id="waManGo">Connect number</button></form>', { label: 'Connect WhatsApp' });
    $('waMan').addEventListener('submit', async e => {
      e.preventDefault(); const b = $('waManGo'); RV.busy(b, true, 'Connecting…');
      try {
        const r = await POST('/api/app/channels/whatsapp/manual', { phone_number_id: $('waPid').value.trim(), waba_id: $('waWaba').value.trim(), token: $('waTok').value.trim(), closer_id: $('waCl') ? +$('waCl').value : undefined });
        RV.closeModal(); toast((r.display_phone || 'Your number') + ' is connected'); if (r.warning) setTimeout(() => toast(r.warning, 'info'), 600); after && after();
      } catch (er) { RV.busy(b, false); fail(er); }
    });
  }

  /* ---------- templates ---------- */
  async function templates(channelId, after, tab) {
    let d, ch;
    try { [d, ch] = await Promise.all([GET('/api/app/channels/' + channelId + '/templates'), GET('/api/app/channels/' + channelId)]); } catch (e) { fail(e); return; }
    const mgr = RV.isManager();
    const ok = d.templates.filter(t => t.sendable);
    const varInputs = (n, vals, idp) => Array.from({ length: n }, (_, i) => '<div class="field"><label class="lbl" for="' + idp + i + '">Value for {{' + (i + 1) + '}}</label><input id="' + idp + i + '" class="input" maxlength="500" value="' + esc((vals || [])[i] || '') + '" placeholder="Text, or {first_name} for the customer’s first name"></div>').join('');
    const row = t => '<div class="col" style="gap:6px;border:1px solid var(--line);border-radius:16px;padding:12px 14px"><div class="row" style="gap:8px;flex-wrap:wrap;justify-content:space-between"><span class="row" style="gap:8px;flex-wrap:wrap;min-width:0"><strong class="ell mono" style="font-size:14px">' + esc(t.name) + '</strong><span class="small muted">' + esc(t.language) + ' · ' + esc(catWord(t.category)) + '</span></span><span class="row" style="gap:6px">' + statusPill(t.status) + (mgr ? '<button type="button" class="btn btn-icon" data-tdel="' + t.id + '" aria-label="Delete ' + esc(t.name) + '" style="width:32px;height:32px">' + ic('trash', '#5E5A50', 15) + '</button>' : '') + '</span></div>' +
      (t.header ? '<strong style="font-size:13.5px">' + esc(t.header) + '</strong>' : '') + '<span style="font-size:13.5px;white-space:pre-wrap">' + esc(t.body) + '</span>' + (t.footer ? '<span class="small muted">' + esc(t.footer) + '</span>' : '') +
      (t.buttons.length ? '<span class="row" style="gap:6px;flex-wrap:wrap">' + t.buttons.map(b => '<span class="chip" style="padding:4px 10px;font-size:12.5px;cursor:default">' + esc(b.text) + '</span>').join('') + '</span>' : '') +
      (t.reason ? '<span class="small" style="color:#9A3412">Meta’s reason: ' + esc(String(t.reason).toLowerCase().replace(/_/g, ' ')) + '</span>' : '') +
      (t.status === 'APPROVED' && !t.sendable ? '<span class="small muted">Needs a picture or a dynamic link, so Replyvoo can’t send it yet.</span>' : '') + '</div>';
    const nt = ok.find(t => t.id === ch.nudge_template_id);
    RV.modal('<div class="col" style="gap:16px"><div class="row" style="gap:12px">' + RV.brandIcon('whatsapp', 44) + '<span class="col grow" style="gap:0;min-width:0"><strong class="h3">WhatsApp templates</strong><span class="small muted ell">' + esc(ch.display_phone || ch.name) + ' · Meta must approve a template before you can send it</span></span></div>' +
      '<div class="seg" role="tablist" aria-label="Templates"><button type="button" data-ttab="list" class="' + (tab !== 'new' ? 'on' : '') + '">Your templates</button>' + (mgr ? '<button type="button" data-ttab="new" class="' + (tab === 'new' ? 'on' : '') + '">' + ic('plus', 'currentColor', 15, 2.6) + 'New template</button>' : '') + '</div>' +
      '<div id="tList"' + (tab === 'new' ? ' hidden' : '') + ' class="col" style="gap:12px">' +
        '<div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><span class="small muted">' + fmt(d.templates.length) + ' template' + (d.templates.length === 1 ? '' : 's') + ', ' + fmt(ok.length) + ' ready to send</span>' + (mgr ? '<button type="button" class="btn btn-ghost btn-sm" id="tSync">' + ic('download', '#121110', 15) + 'Get latest from Meta</button>' : '') + '</div>' +
        (d.templates.length ? '<div class="col" style="gap:10px;max-height:46vh;overflow:auto">' + d.templates.map(row).join('') + '</div>' : '<p class="muted small" style="margin:0">No templates yet. Make one under New template. You need an approved template to send Blasts and follow-ups after 24 hours.</p>') +
        (mgr ? '<div class="col" style="gap:10px;background:var(--soft);border:1px solid var(--line);border-radius:16px;padding:14px"><strong>Follow-up after 24 hours</strong><span class="small muted">When a warm or hot lead goes quiet and the free reply window has closed, Nudge can send one approved template. Leave empty to only follow up inside the window.</span>' +
          '<div class="field"><label class="lbl" for="tNudge">Nudge template</label><select id="tNudge" class="input"><option value="0">No template (follow up inside 24 hours only)</option>' + ok.map(t => '<option value="' + t.id + '"' + (t.id === ch.nudge_template_id ? ' selected' : '') + '>' + esc(t.name) + ' · ' + esc(catWord(t.category)) + '</option>').join('') + '</select></div><div id="tNudgeVars" class="col" style="gap:10px">' + (nt ? varInputs(nt.header_vars + nt.body_vars, ch.nudge_vars, 'tnv') : '') + '</div>' +
          '<button type="button" class="btn btn-ink btn-sm" id="tNudgeSave" style="align-self:flex-start">Save follow-up</button></div>' : '') +
      '</div>' +
      (mgr ? '<form id="tNew" class="col" style="gap:12px"' + (tab === 'new' ? '' : ' hidden') + ' novalidate>' + builderHtml(d.languages) + '</form>' : '') + '</div>', { wide: true, label: 'WhatsApp templates' });
    const m = document.querySelector('#modalRoot .modal');
    m.querySelectorAll('[data-ttab]').forEach(b => b.addEventListener('click', () => { const t = b.getAttribute('data-ttab'); m.querySelectorAll('[data-ttab]').forEach(x => x.classList.toggle('on', x === b)); $('tList').hidden = t !== 'list'; if ($('tNew')) $('tNew').hidden = t !== 'new'; }));
    if ($('tSync')) $('tSync').addEventListener('click', async () => { const b = $('tSync'); RV.busy(b, true, 'Checking…'); try { await POST('/api/app/channels/' + channelId + '/templates/sync'); toast('Templates are up to date'); templates(channelId, after); } catch (e) { RV.busy(b, false); fail(e); } });
    m.querySelectorAll('[data-tdel]').forEach(b => b.addEventListener('click', async () => {
      const t = d.templates.find(x => x.id === +b.getAttribute('data-tdel'));
      if (!window.confirm('Delete the template “' + t.name + '” in Meta too? Its name can’t be reused for 30 days.')) return;
      try { await DEL('/api/app/channels/' + channelId + '/templates/' + t.id); toast('Template deleted'); templates(channelId, after); } catch (e) { fail(e); }
    }));
    if ($('tNudge')) {
      $('tNudge').addEventListener('change', () => { const t = ok.find(x => x.id === +$('tNudge').value); $('tNudgeVars').innerHTML = t ? varInputs(t.header_vars + t.body_vars, [], 'tnv') : ''; });
      $('tNudgeSave').addEventListener('click', async () => {
        const t = ok.find(x => x.id === +$('tNudge').value); const vars = t ? Array.from({ length: t.header_vars + t.body_vars }, (_, i) => $('tnv' + i).value.trim()) : [];
        if (vars.some(v => !v)) { toast('Fill in every value of the template.', 'err'); return; }
        try { await PUT('/api/app/channels/' + channelId + '/whatsapp', { nudge_template_id: t ? t.id : 0, nudge_vars: vars }); toast(t ? 'Follow-up template saved' : 'Follow-ups stay inside the 24-hour window'); after && after(); } catch (e) { fail(e); }
      });
    }
    if ($('tNew')) bindBuilder(channelId, after);
  }
  function builderHtml(langs) {
    return '<div class="fg c2m" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px"><div class="field"><label class="lbl" for="bName">Template name</label><input id="bName" class="input mono" maxlength="60" placeholder="new_arrivals" autocomplete="off"><span class="hint">Small letters, numbers and _ only. Customers don’t see it.</span></div>' +
      '<div class="field"><label class="lbl" for="bLang">Language</label><select id="bLang" class="input">' + (langs || ['en']).map(l => '<option value="' + esc(l) + '"' + (l === 'en' ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div></div>' +
      '<div class="col" style="gap:8px"><span class="lbl" id="bCatL">Type</span><div role="radiogroup" aria-labelledby="bCatL" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">' +
      '<button type="button" role="radio" class="pick on" data-bcat="MARKETING" aria-checked="true" style="flex-direction:column;align-items:flex-start;gap:2px"><strong>Marketing</strong><span style="font-size:12.5px;color:var(--mut)">Offers, new products, “still interested?” follow-ups</span></button>' +
      '<button type="button" role="radio" class="pick" data-bcat="UTILITY" aria-checked="false" style="flex-direction:column;align-items:flex-start;gap:2px"><strong>Utility</strong><span style="font-size:12.5px;color:var(--mut)">Order updates, bookings, receipts. Cheaper, and Meta checks it’s not an ad</span></button></div></div>' +
      '<div class="field"><label class="lbl" for="bHead">Title (optional)</label><input id="bHead" class="input" maxlength="60" placeholder="Fresh stock is here"></div>' +
      '<div class="field"><div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><label class="lbl" for="bBody">Message</label><button type="button" class="btn btn-ghost btn-sm" id="bVar">' + ic('plus', '#121110', 14, 2.6) + 'Add a variable</button></div><textarea id="bBody" class="input" rows="4" maxlength="1024" placeholder="Hi {{1}}, the items you asked about are back in stock. Reply here and we’ll reserve one for you."></textarea><span class="hint">Variables like {{1}} are filled in when you send, for example with the customer’s first name.</span></div>' +
      '<div id="bEx" class="col" style="gap:10px"></div>' +
      '<div class="field"><label class="lbl" for="bFoot">Small print (optional)</label><input id="bFoot" class="input" maxlength="60" placeholder="Reply STOP to stop these messages"></div>' +
      '<div class="col" style="gap:8px"><span class="lbl">Quick reply buttons (optional)</span><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">' + [0, 1, 2].map(i => '<label class="sr" for="bQ' + i + '">Button ' + (i + 1) + '</label><input id="bQ' + i + '" class="input" maxlength="25" placeholder="' + ['Yes, reserve one', 'Tell me more', 'Stop promotions'][i] + '">').join('') + '</div>' +
      '<label class="row small" style="gap:8px;align-items:center" id="bStopL"><input type="checkbox" id="bStop" checked> Add a “Stop promotions” button so people can opt out in one tap (recommended for marketing)</label></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px"><div class="field"><label class="lbl" for="bUrlT">Link button text (optional)</label><input id="bUrlT" class="input" maxlength="25" placeholder="Shop now"></div><div class="field"><label class="lbl" for="bUrl">Link</label><input id="bUrl" class="input" type="url" placeholder="https://your-shop.com"></div></div>' +
      '<div class="col" style="gap:6px"><span class="lbl">Preview</span><div style="background:#ECE5DD;border-radius:18px;padding:14px"><div id="bPrev" style="background:#FFFFFF;border-radius:12px;padding:10px 12px;max-width:320px;box-shadow:0 1px 1px rgba(0,0,0,.08);font-size:14px;white-space:pre-wrap"></div></div></div>' +
      '<p class="small muted" style="margin:0">Meta reviews every template, usually quickly, sometimes up to a day. Marketing templates are billed by Meta to your WhatsApp account at marketing rates.</p>' +
      '<button class="btn btn-ink" type="submit" id="bGo">Send to Meta for review</button>';
  }
  function bindBuilder(channelId, after) {
    let cat = 'MARKETING';
    const vars = () => { let n = 0; for (const m of ($('bBody').value + ' ' + $('bHead').value).matchAll(/\{\{\s*(\d+)\s*\}\}/g)) n = Math.max(n, +m[1]); return n; };
    const hvars = () => /\{\{\s*1\s*\}\}/.test($('bHead').value) ? 1 : 0;
    const paint = () => {
      const n = vars(), have = RV.qsa('#bEx input').map(x => x.value);
      $('bEx').innerHTML = n ? Array.from({ length: n }, (_, i) => '<div class="field"><label class="lbl" for="bE' + i + '">Example for {{' + (i + 1) + '}}' + (hvars() && i === 0 ? ' (title)' : '') + '</label><input id="bE' + i + '" class="input" maxlength="200" value="' + esc(have[i] || '') + '" placeholder="' + (i === 0 ? 'Sam' : 'Example text') + '"></div>').join('') : '';
      RV.qsa('#bEx input').forEach(x => x.addEventListener('input', preview));
      preview();
    };
    const preview = () => {
      const ex = RV.qsa('#bEx input').map(x => x.value || '…');
      const sub = (t, off) => esc(t).replace(/\{\{\s*(\d+)\s*\}\}/g, (_, k) => '<b>' + esc(ex[off + +k - 1] || '{{' + k + '}}') + '</b>');
      const qs = [0, 1, 2].map(i => $('bQ' + i).value.trim()).filter(Boolean);
      if (cat === 'MARKETING' && $('bStop').checked && !qs.some(q => /^stop promotions$/i.test(q))) qs.push('Stop promotions');
      $('bPrev').innerHTML = ($('bHead').value.trim() ? '<strong style="display:block;margin-bottom:4px">' + sub($('bHead').value.trim(), 0) + '</strong>' : '') + (sub($('bBody').value, hvars()) || '<span class="muted">Your message appears here.</span>') + ($('bFoot').value.trim() ? '<span style="display:block;margin-top:6px;font-size:12px;color:#8A8578">' + esc($('bFoot').value.trim()) + '</span>' : '') +
        (qs.length || $('bUrlT').value.trim() ? '<span style="display:block;border-top:1px solid #EEE;margin-top:8px;padding-top:6px;text-align:center;color:#0A7CFF;font-weight:600">' + qs.concat($('bUrlT').value.trim() ? [$('bUrlT').value.trim() + ' ↗'] : []).map(esc).join('<br>') + '</span>' : '');
    };
    RV.qsa('[data-bcat]').forEach(b => b.addEventListener('click', () => { cat = b.getAttribute('data-bcat'); RV.qsa('[data-bcat]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); $('bStopL').hidden = cat !== 'MARKETING'; preview(); }));
    ['bBody', 'bHead'].forEach(id => $(id).addEventListener('input', RV.debounce(paint, 200)));
    ['bFoot', 'bQ0', 'bQ1', 'bQ2', 'bUrlT', 'bStop'].forEach(id => $(id).addEventListener('input', preview));
    $('bStop').addEventListener('change', preview);
    $('bVar').addEventListener('click', () => { const t = $('bBody'); const n = (() => { let k = 0; for (const m of t.value.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) k = Math.max(k, +m[1]); return k; })() + 1; const p = t.selectionStart || t.value.length; t.value = t.value.slice(0, p) + '{{' + n + '}}' + t.value.slice(p); t.focus(); paint(); });
    paint();
    $('tNew').addEventListener('submit', async e => {
      e.preventDefault(); const b = $('bGo');
      const qs = [0, 1, 2].map(i => $('bQ' + i).value.trim()).filter(Boolean);
      if (cat === 'MARKETING' && $('bStop').checked && !qs.some(q => /^stop promotions$/i.test(q))) qs.push('Stop promotions');
      RV.busy(b, true, 'Sending to Meta…');
      try {
        await POST('/api/app/channels/' + channelId + '/templates', { name: $('bName').value, language: $('bLang').value, category: cat, header: $('bHead').value, body: $('bBody').value, footer: $('bFoot').value, examples: RV.qsa('#bEx input').map(x => x.value), quick_replies: qs.slice(0, 3), url_text: $('bUrlT').value, url: $('bUrl').value });
        toast('Sent to Meta for review. You’ll see the result here.'); templates(channelId, after);
      } catch (er) { RV.busy(b, false); fail(er); }
    });
  }

  /* ======================= PULSE INBOX ======================= */
  const isWa = d => d && d.channel && d.channel.type === 'whatsapp';
  function listTag(t) {
    const open = t.last_customer_at && Date.now() - new Date(t.last_customer_at).getTime() < 24 * 3600e3;
    return '<span class="heat" style="background:' + GREEN_BG + ';color:' + GREEN_D + '" title="WhatsApp">' + waGlyph(11) + 'WhatsApp</span>' + (open ? '' : '<span class="heat" style="background:#F2F0EA;color:#5E5A50" title="The free reply window has closed">Template only</span>');
  }
  const waGlyph = s => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.7 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5z"/></svg>';
  function headLine(d, c) {
    const w = d.whatsapp || {};
    return '<span style="color:' + GREEN_D + '">' + waGlyph(12) + '</span> WhatsApp' + (c.phone ? ' · ' + esc(c.phone) : '') + (w.display_phone ? ' · to ' + esc(w.display_phone) : '');
  }
  function windowLeft(w) {
    const ms = w.ends_at ? new Date(w.ends_at).getTime() - Date.now() : 0;
    if (ms <= 0) return null;
    const h = Math.floor(ms / 3600e3); return h >= 1 ? h + 'h' : Math.max(1, Math.floor(ms / 60e3)) + ' min';
  }
  // Plain words, no blinking: how long free replies are still possible.
  function banner(d) {
    if (!isWa(d) || !d.whatsapp) return '';
    const w = d.whatsapp, left = windowLeft(w.window || {});
    const box = (bg, col, html) => '<div class="row" style="gap:4px 8px;padding:8px 16px;border-bottom:1px solid var(--line);background:' + bg + ';color:' + col + ';font-size:12.5px;font-weight:700;flex-wrap:wrap;line-height:1.35">' + html + '</div>';
    let h = left ? box(GREEN_BG, GREEN_D, ic('clock', GREEN_D, 14, 2.4) + '<span>Free reply window: ' + left + ' left</span><span style="font-weight:600;color:#2F4A3A">Free replies until 24h after their last message.</span>')
      : box('#FFF7DD', '#7A5800', ic('clock', '#7A5800', 14, 2.4) + '<span>Free reply window closed</span><span style="font-weight:600">Only approved templates now. When they reply, free chat opens again for 24h.</span>');
    if (w.opted_out) h += box('#F2F0EA', '#5E5A50', ic('info', '#5E5A50', 15, 2.4) + '<span>This customer replied STOP: no Message many or marketing templates. Replying to their messages is fine.</span>');
    if (w.connected === false) h += box('#FFE3D6', '#9A3412', ic('info', '#9A3412', 15, 2.4) + '<span>This WhatsApp number is disconnected. Reconnect it in Channels to reply.</span>');
    return h;
  }
  function composer(d) {
    if (!isWa(d) || !d.whatsapp) return null;
    const w = d.whatsapp;
    if (windowLeft(w.window || {})) return null; // the normal reply box, plus the attach button
    const tps = w.templates || [];
    return '<form id="ibTplForm" class="col" style="gap:8px;padding:10px 12px;border-top:1px solid var(--line);background:#fff">' +
      (tps.length ? '<div class="row" style="gap:8px"><label class="sr" for="ibTpl">Template</label><select id="ibTpl" class="input" style="flex:1 1 auto;min-width:0;padding:10px 36px 10px 12px;font-size:14px">' + tps.map(t => '<option value="' + t.id + '"' + (w.opted_out && t.category === 'MARKETING' ? ' disabled' : '') + '>' + esc(t.name) + ' · ' + esc(catWord(t.category)) + (w.opted_out && t.category === 'MARKETING' ? ' (opted out)' : '') + '</option>').join('') + '</select><button class="btn btn-ink" type="submit" id="ibTplGo" style="background:' + GREEN_D + ';flex:0 0 auto">' + ic('send', '#FFFFFF', 16, 2.2) + 'Send</button></div><div id="ibTplVars" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px"></div><div id="ibTplPrev" class="small" style="background:var(--soft);border-radius:12px;padding:8px 10px;white-space:pre-wrap;max-height:64px;overflow:auto"></div>'
        : '<p class="small muted" style="margin:0">No approved templates yet. Make one in Channels → WhatsApp → Templates, then come back to restart this chat.</p><a class="btn btn-ghost btn-sm" href="/app/channels" style="align-self:flex-start">Open Channels</a>') + '</form>';
  }
  function bindComposer(d, done) {
    const f = $('ibTplForm'); if (!f || !$('ibTpl')) return;
    const tps = d.whatsapp.templates || [];
    const cur = () => tps.find(t => t.id === +$('ibTpl').value);
    const prev = () => { const t = cur(); if (!t) return; const v = RV.qsa('#ibTplVars input').map(x => x.value.replace(/\{first_name\}/gi, String(d.contact.name || '').split(' ')[0] || 'there')); const sub = (s, off) => String(s || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_, k) => v[off + +k - 1] || '{{' + k + '}}'); $('ibTplPrev').textContent = [t.header_vars ? sub(t.header, 0) : t.header, sub(t.body, t.header_vars), t.footer].filter(Boolean).join('\n'); };
    const paint = () => { const t = cur(); const n = t ? t.header_vars + t.body_vars : 0; $('ibTplVars').innerHTML = Array.from({ length: n }, (_, i) => '<input class="input" id="ibTv' + i + '" aria-label="Value for {{' + (i + 1) + '}}" placeholder="Value for {{' + (i + 1) + '}}" value="' + (i === 0 ? '{first_name}' : '') + '" style="padding:9px 12px;font-size:14px">').join(''); RV.qsa('#ibTplVars input').forEach(x => x.addEventListener('input', prev)); prev(); };
    $('ibTpl').addEventListener('change', paint); paint();
    f.addEventListener('submit', async e => {
      e.preventDefault(); const b = $('ibTplGo'); const vars = RV.qsa('#ibTplVars input').map(x => x.value.trim());
      if (vars.some(v => !v)) { toast('Fill in every value of the template.', 'err'); return; }
      RV.busy(b, true, 'Sending…');
      try { await POST('/api/app/threads/' + d.thread.id + '/template', { template_id: +$('ibTpl').value, vars }); toast('Template sent'); done(); } catch (er) { RV.busy(b, false); fail(er); }
    });
  }
  // The paper-clip next to the reply box (photos, PDFs, documents, audio).
  function attachBtn(d) { return isWa(d) && d.whatsapp && windowLeft(d.whatsapp.window || {}) ? '<label class="btn btn-icon" for="ibFile" title="Send a photo or file" style="width:44px;height:44px;flex:0 0 44px;cursor:pointer">' + ic('M21 12.5l-8.5 8.5a5 5 0 0 1-7-7L14 5.5a3.3 3.3 0 0 1 4.7 4.7L10.2 18.7a1.7 1.7 0 0 1-2.4-2.4L15.5 8.6', '#121110', 18, 2.2) + '<span class="sr">Send a photo or file</span></label><input type="file" id="ibFile" hidden accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,audio/mpeg,audio/ogg,audio/mp4,video/mp4">' : ''; }
  function bindAttach(d, done) {
    const inp = $('ibFile'); if (!inp) return;
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
      if (f.size > 4 * 1024 * 1024) { toast('Files up to 4 MB can be sent from the inbox.', 'err'); return; }
      const r = new FileReader();
      r.onload = async () => {
        const caption = /^image\/|^video\//.test(f.type) || /pdf|word|sheet|excel|text/.test(f.type) ? (window.prompt('Add a caption (optional)', '') || '') : '';
        toast('Sending ' + f.name + '…', 'info');
        try { await POST('/api/app/threads/' + d.thread.id + '/media', { data_url: r.result, filename: f.name, caption }); toast('Sent'); done(); } catch (e) { fail(e); }
      };
      r.readAsDataURL(f);
    });
  }
  const mediaUrl = (d, m) => '/api/app/threads/' + d.thread.id + '/media/' + m.id;
  const stripTag = t => String(t || '').replace(/^\[[^\]]{1,80}\]\s*/, '');
  // Message bodies for WhatsApp kinds (null = use the normal rendering).
  function msgBody(m, d) {
    if (!isWa(d)) return null;
    const meta = m.meta || {};
    const lab = (icon, t) => '<span class="row" style="gap:8px;font-weight:700">' + ic(icon, 'currentColor', 17) + esc(t) + '</span>';
    const extra = t => t ? '<span style="display:block;margin-top:4px">' + esc(t) + '</span>' : '';
    switch (m.kind) {
      case 'image': return meta.media_id ? '<a href="' + mediaUrl(d, m) + '" target="_blank" rel="noopener"><img src="' + mediaUrl(d, m) + '" alt="Photo" loading="lazy" style="display:block;max-width:220px;max-height:260px;border-radius:12px;background:var(--soft)"></a>' + extra(m.text && m.text !== '[image]' ? m.text : '') : null;
      case 'voice': return meta.media_id ? '<audio controls preload="none" src="' + mediaUrl(d, m) + '" style="max-width:240px;display:block"></audio>' + (m.text && m.text !== '[voice note]' ? '<span style="display:block;margin-top:4px;font-style:italic">“' + esc(m.text) + '”</span>' : '') : null;
      case 'video': return lab('play', 'Video') + extra(stripTag(m.text)) + (meta.media_id ? '<a href="' + mediaUrl(d, m) + '" target="_blank" rel="noopener" style="font-weight:700;font-size:13px">Open video</a>' : '');
      case 'document': return lab('download', meta.filename || 'Document') + extra(stripTag(m.text).replace(/^\s+/, '')) + (meta.media_id ? '<a href="' + mediaUrl(d, m) + '" style="font-weight:700;font-size:13px">Download</a>' : '');
      case 'sticker': return lab('image', 'Sticker');
      case 'location': return lab('globe', 'Location') + extra([meta.place, meta.address].filter(Boolean).join(', ')) + (Number.isFinite(meta.lat) ? '<a href="https://www.google.com/maps?q=' + encodeURIComponent(meta.lat + ',' + meta.lng) + '" target="_blank" rel="noopener noreferrer" style="font-weight:700;font-size:13px">Open map</a>' : '');
      case 'contacts': return lab('user', 'Contact card') + extra((meta.cards || []).join('; ') || stripTag(m.text));
      case 'reaction': return '<span style="font-size:13px">' + esc(m.text) + '</span>';
      case 'template': return '<span class="row" style="gap:6px;font-size:11.5px;font-weight:800;opacity:.75;margin-bottom:3px">' + ic('send', 'currentColor', 12, 2.4) + 'Template' + (meta.template ? ' · ' + esc(meta.template) : '') + '</span><span style="white-space:pre-wrap">' + esc(m.text) + '</span>';
      case 'order': return lab('card', 'Order') + extra(stripTag(m.text));
      default: {
        let h = esc(m.text || '');
        if (meta.tapped) h = '<span class="row" style="gap:6px;font-size:11.5px;font-weight:800;opacity:.75">Tapped a button</span>' + h;
        if (meta.interactive === 'paylink') h += '<span style="display:block;margin-top:6px;font-size:12.5px;font-weight:800">' + ic('card', 'currentColor', 13, 2.4) + ' Sent with a “Pay now” button</span>';
        if (meta.options && meta.options.length) h += '<span class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">' + meta.options.map(o => '<span style="border:1px solid currentColor;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:700;opacity:.85">' + esc(o) + '</span>').join('') + '</span>';
        return h;
      }
    }
  }
  // "Sent", "Delivered", "Read" or the reason it failed, in plain words.
  function statusWords(m, d) {
    if (!isWa(d) || m.dir !== 'out') return '';
    const meta = m.meta || {};
    if (meta.failed) return ' · <span style="color:#C2410C;font-weight:800">Not delivered</span><span style="display:block;color:#C2410C;font-size:11.5px;font-weight:600">' + esc(meta.error || '') + '</span>';
    const w = { sent: 'Sent', delivered: 'Delivered', read: 'Read' }[meta.wa_status] || (meta.message_id ? 'Sent' : '');
    return w ? ' · ' + w : '';
  }

  /* ======================= BLAST ======================= */
  const SEGW = { all: ['Everyone', 'Everyone who wrote to your WhatsApp'], hot: ['Hot leads', 'Asked for prices or payment links'], no_buy: ['Chatted, didn’t buy', 'Qualified or at checkout, not paid yet'], quiet: ['Quiet for 7 days', 'Haven’t written in a week'], won: ['Customers', 'People who already bought'] };
  const WB = { seg: 'all', tpl: 0, vars: [], optin: false };
  function blast(ctx, d, o) {
    const w = d.whatsapp, segs = w.segments, tps = w.templates, mgr = RV.isManager();
    const per = S.boot.billing.blast_people_per_credit || 10;
    if (!segs.find(s => s.id === WB.seg && s.count)) { const f = segs.find(s => s.count); if (f) WB.seg = f.id; }
    if (!tps.find(t => t.id === WB.tpl)) WB.tpl = tps[0] ? tps[0].id : 0;
    const count = () => (segs.find(s => s.id === WB.seg) || {}).count || 0;
    const cost = () => Math.ceil(count() / per);
    const tpl = () => tps.find(t => t.id === WB.tpl);
    const body = !tps.length
      ? '<div class="col" style="gap:10px">' + o.switchHtml + '<p class="muted" style="margin:0">Messages to many people on WhatsApp must use a template that Meta approved. You don’t have one yet.</p><a class="btn btn-ink btn-sm" href="/app/channels" style="align-self:flex-start">Make a template in Channels</a></div>'
      : o.switchHtml +
        '<div class="col" style="gap:8px"><span class="lbl" id="wsegL">Send to</span><div role="radiogroup" aria-labelledby="wsegL" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px">' + segs.map(s => '<button type="button" role="radio" class="pick' + (WB.seg === s.id ? ' on' : '') + '" data-wseg="' + s.id + '" aria-checked="' + (WB.seg === s.id) + '" style="flex-direction:column;align-items:flex-start;gap:4px"' + (s.count ? '' : ' disabled') + '><span class="row" style="justify-content:space-between;width:100%"><strong style="font-size:14.5px">' + SEGW[s.id][0] + '</strong><b class="tnum">' + fmt(s.count) + '</b></span><span style="font-size:12px;color:var(--mut)">' + SEGW[s.id][1] + '</span></button>').join('') + '</div>' +
        (w.opted_out ? '<span class="small muted">' + fmt(w.opted_out) + ' ' + (w.opted_out === 1 ? 'person' : 'people') + ' replied STOP and won’t get it.</span>' : '') + '</div>' +
        '<div class="field"><label class="lbl" for="wTpl">Approved template</label><select id="wTpl" class="input">' + tps.map(t => '<option value="' + t.id + '"' + (t.id === WB.tpl ? ' selected' : '') + '>' + esc(t.name) + ' · ' + esc(catWord(t.category)) + ' · ' + esc(t.language) + '</option>').join('') + '</select></div>' +
        '<div id="wVars" class="col" style="gap:8px"></div>' +
        '<div style="background:#ECE5DD;border-radius:18px;padding:14px"><div id="wPrev" style="background:#FFFFFF;border-radius:12px;padding:10px 12px;max-width:340px;font-size:14px;white-space:pre-wrap"></div></div>' +
        '<div id="wCost" class="col" style="gap:6px;background:var(--soft);border:1px solid var(--line);border-radius:16px;padding:12px 14px"></div>' +
        '<label class="row small" style="gap:8px;align-items:flex-start"><input type="checkbox" id="wOpt" style="margin-top:3px"' + (WB.optin ? ' checked' : '') + '><span>These people agreed to get WhatsApp messages from my business. WhatsApp requires this, and numbers that send unwanted messages get restricted.</span></label>' +
        '<div class="row" style="gap:12px;flex-wrap:wrap"><span class="col grow" style="gap:0;flex:1 1 220px"><strong id="wSum"></strong><span class="small muted">1 credit per ' + per + ' people · you have <b class="tnum">' + fmt(S.credits) + '</b> credits</span></span>' + (mgr ? '<button class="btn btn-jade" id="wSend">Send WhatsApp Blast</button>' : '<span class="small muted">Only owners and admins can send.</span>') + '</div>';
    ctx.el.innerHTML = '<div class="dgrid">' + RV.panel('c7 a-in', '<strong>Send a message to many customers</strong><span class="pill" style="background:' + GREEN_BG + ';color:' + GREEN_D + '">' + waGlyph(12) + ' WhatsApp</span>', '<div class="col" style="gap:14px">' + body + '</div>') + o.recentHtml + '</div>';
    o.bindSwitch();
    if (!tps.length) return;
    const paintVars = () => { const t = tpl(); const n = t ? t.header_vars + t.body_vars : 0; $('wVars').innerHTML = Array.from({ length: n }, (_, i) => '<div class="field"><label class="lbl" for="wv' + i + '">Value for {{' + (i + 1) + '}}</label><input id="wv' + i + '" class="input" maxlength="500" value="' + esc(WB.vars[i] != null ? WB.vars[i] : i === 0 ? '{first_name}' : '') + '" placeholder="Text, or {first_name}"></div>').join(''); RV.qsa('#wVars input').forEach((x, i) => x.addEventListener('input', () => { WB.vars[i] = x.value; prev(); })); prev(); };
    const prev = () => { const t = tpl(); if (!t) return; const v = RV.qsa('#wVars input').map(x => x.value.replace(/\{first_name\}/gi, 'Sam')); const sub = (s, off) => String(s || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_, k) => v[off + +k - 1] || '{{' + k + '}}'); $('wPrev').textContent = [t.header_vars ? sub(t.header, 0) : t.header, sub(t.body, t.header_vars), t.footer].filter(Boolean).join('\n') + (t.buttons.length ? '\n\n' + t.buttons.map(b => '[ ' + b.text + ' ]').join('  ') : ''); };
    let seq = 0;
    const est = async () => {
      const t = tpl(); const n = count(), c = cost();
      $('wSum').textContent = n ? 'Goes to ' + fmt(n) + ' ' + (n === 1 ? 'person' : 'people') + ' for ' + fmt(c) + ' Replyvoo credit' + (c === 1 ? '' : 's') : 'Nobody is in this group yet';
      if (!t || !n) { $('wCost').innerHTML = '<span class="small muted">Pick a group with people in it to see Meta’s cost.</span>'; return; }
      const my = ++seq;
      $('wCost').innerHTML = '<span class="small muted">Working out Meta’s cost…</span>';
      try {
        const r = await POST('/api/app/blasts/estimate', { template_id: t.id, segment: WB.seg }); if (my !== seq) return;
        const m = r.meta; const usd = v => '$' + (v < 0.1 ? Number(v).toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : Number(v).toFixed(2));
        $('wCost').innerHTML = '<strong style="font-size:14px">Meta’s charge, paid by your WhatsApp account</strong>' +
          m.countries.map(x => '<span class="small">Meta bills your WhatsApp account about <b>' + usd(x.rate) + '</b> per message for ' + esc(x.name) + ' (' + esc(catWord(m.category).toLowerCase()) + ') · ' + fmt(x.people) + ' ' + (x.people === 1 ? 'person' : 'people') + '</span>').join('') +
          '<span class="small"><b>About ' + usd(m.total_usd) + ' in total</b>, billed by Meta to the payment method on your WhatsApp Business Account, not by Replyvoo.</span>' +
          '<span class="small muted">' + (m.estimate ? 'Estimate from Meta’s published price list. Meta sets the final price.' : 'From Meta’s price list' + (m.checked_at ? ', checked ' + RV.date(m.checked_at) : '') + '. Meta sets the final price.') + '</span>';
      } catch (e) { if (my === seq) $('wCost').innerHTML = '<span class="small muted">Meta’s cost could not be estimated right now.</span>'; }
    };
    ctx.el.querySelectorAll('[data-wseg]').forEach(b => b.addEventListener('click', () => { WB.seg = b.getAttribute('data-wseg'); ctx.el.querySelectorAll('[data-wseg]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); est(); }));
    $('wTpl').addEventListener('change', () => { WB.tpl = +$('wTpl').value; WB.vars = []; paintVars(); est(); });
    $('wOpt').addEventListener('change', () => { WB.optin = $('wOpt').checked; });
    paintVars(); est();
    const send = $('wSend');
    if (send) send.addEventListener('click', async () => {
      const vars = RV.qsa('#wVars input').map(x => x.value.trim());
      if (!count()) { toast('Nobody is in that group yet.', 'err'); return; }
      if (vars.some(v => !v)) { toast('Fill in every value of the template.', 'err'); return; }
      if (!$('wOpt').checked) { toast('Tick the box to confirm these people agreed to get WhatsApp messages.', 'err'); return; }
      if (cost() > S.credits) { toast('This needs ' + cost() + ' credits. You have ' + fmt(S.credits) + '.', 'err', RV.flag('wallet') ? { label: 'Buy credits', fn: () => RV.go('/app/wallet') } : null); return; }
      if (!(await RV.confirmBox('Send this WhatsApp message?', 'It goes to ' + fmt(count()) + ' people right now and uses ' + fmt(cost()) + ' Replyvoo credits. Meta bills your WhatsApp account separately for each template message.', 'Send now'))) return;
      RV.busy(send, true, 'Sending…');
      try {
        const r = await POST('/api/app/blasts', { channel: 'whatsapp', segment: WB.seg, template_id: WB.tpl, vars, opt_in: true });
        WB.vars = []; WB.optin = false; toast('WhatsApp message on its way to ' + fmt(r.total) + ' people'); RV.setBalance(S.credits - r.credits); o.rerender();
      } catch (e) { RV.busy(send, false); if (e.code === 'no_credits') toast(e.message, 'err', { label: 'Buy credits', fn: () => RV.go('/app/wallet') }); else fail(e); }
    });
  }

  RV.wa = { live, connectCard, connectedRow, bindChannels, connect, manual, templates, listTag, headLine, banner, composer, bindComposer, attachBtn, bindAttach, msgBody, statusWords, blast, isWa };
})();
