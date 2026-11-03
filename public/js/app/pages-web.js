/* Replyvoo dashboard: Website chat — Widget Studio (/app/widget), locked/upgrade states, the "how it works" scene. */
(function () {
  'use strict';
  const RV = window.RV;
  const { $, esc, fmt, GET, PUT, POST, DEL, toast, fail, go, ic } = RV;
  const S = RV.S;

  /* ---------- shared bits ---------- */
  RV.webUsage = () => (S.boot && S.boot.usage && S.boot.usage.website) || { sites: 0, used: 0 };
  RV.webCanAdd = () => { const w = RV.webUsage(); return w.used < w.sites; };
  RV.webAddon = () => ((S.boot && S.boot.addons) || []).find(a => a.slug === 'website-chat' && a.status === 'live' && a.active !== 0);
  RV.mountScene = function (el, opts) { if (!el || !window.RVScene) return null; return window.RVScene.mount(el, opts || {}); };
  const lockArt = '<span style="width:64px;height:64px;border-radius:20px;background:linear-gradient(160deg,#FFD23F,#FFC21A);display:grid;place-items:center;box-shadow:0 14px 30px -14px rgba(240,174,0,.9)">' + ic('M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5zM12 15v2', '#121110', 30, 2.4) + '</span>';
  // "Pro includes 1 site, Business 3 and Titan 10." from the live plans (admin can change them).
  function planLine() {
    const ps = ((S.boot && S.boot.plans) || []).filter(p => p.website_sites > 0 && p.website_sites < 999).sort((a, b) => a.price_month - b.price_month);
    if (!ps.length) return '';
    const parts = ps.map((p, i) => esc(p.name) + (i === 0 ? ' includes ' + p.website_sites + (p.website_sites === 1 ? ' site' : ' sites') : ' ' + p.website_sites));
    return (parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0]) + '.';
  }
  function lockedHtml(compact) {
    const w = RV.webUsage(), addon = RV.webAddon(), mgr = RV.isManager();
    const full = w.sites > 0;
    return '<div class="col" style="gap:12px;align-items:flex-start">' + (compact ? '' : lockArt) +
      '<strong class="h3">' + (full ? 'All your website chats are in use' : 'Put a chat bubble on your website') + '</strong>' +
      '<p class="muted" style="margin:0;max-width:560px">' + (full ? 'You’re using ' + w.used + ' of ' + w.sites + ' website ' + (w.sites === 1 ? 'chat' : 'chats') + '. Add one more for ' + esc(addon ? (addon.price_text || '$' + addon.price + ' a month') : '$29 a month') + ', or move up a plan.' : 'Your AI helper answers visitors on your own site. ' + esc(addon ? (addon.price_text || '$' + addon.price + ' a month') : '$29 a month') + ', or free on Pro. No website? Your free chat link works without one.') + '</p>' +
      (mgr ? '<div class="row" style="gap:8px;flex-wrap:wrap">' + (addon ? '<button class="btn btn-jade" data-buy-web>Add website chat</button>' : '') + '<a class="btn btn-ghost" href="/app/plan" data-close>See plans</a></div>'
        : '<p class="small muted" style="margin:0">Ask the shop owner to add website chat.</p>') + '</div>';
  }
  function bindBuy(root) { RV.qsa('[data-buy-web]', root).forEach(b => b.addEventListener('click', () => { RV.closeModal(); RV.checkout({ kind: 'addon', item_id: 'website-chat' }); })); }
  RV.websiteLocked = function () { const m = RV.modal(lockedHtml(false), { label: 'Website chat is locked' }); bindBuy(m); };
  RV.webLockedPanel = function (compact) { return '<section class="panel a-in ws-locked">' + lockedHtml(compact) + '</section>'; };
  RV.bindWebBuy = bindBuy;

  /* ---------- Widget Studio ---------- */
  const PRESET_ORDER = ['gold', 'midnight', 'white', 'pastel', 'ink', 'glass'];
  const COLOR_FIELDS = [['primary', 'Main colour'], ['primary_text', 'Text on main colour'], ['header_bg', 'Header'], ['header_text', 'Header text'], ['panel_bg', 'Panel background'], ['text', 'Text'], ['bubble_in', 'Helper bubble'], ['bubble_in_text', 'Helper bubble text'], ['bubble_out', 'Visitor bubble'], ['bubble_out_text', 'Visitor bubble text']];
  const PLATFORMS = {
    html: ['HTML', ['Copy the snippet above.', 'Paste it just before the closing </body> tag on every page, or once in the shared footer template.', 'Publish, open your site and click “Check installation”.']],
    wordpress: ['WordPress', ['In WordPress, install a header and footer code plugin (for example WPCode) or use your theme’s “custom code” box.', 'Add a new snippet for the site-wide footer (body end) and paste the code.', 'Save, then visit your site and click “Check installation”.']],
    shopify: ['Shopify', ['In Shopify admin go to Online Store → Themes → … → Edit code.', 'Open layout/theme.liquid and paste the snippet just above </body>.', 'Save, then open your store and click “Check installation”.']],
    wix: ['Wix', ['In your Wix dashboard open Settings → Custom code (needs a paid plan and a connected domain).', 'Click “+ Add Custom Code”, paste the snippet, choose All pages and place it in Body - end.', 'Apply, publish, then click “Check installation”.']],
    webflow: ['Webflow', ['Open Site settings → Custom code.', 'Paste the snippet into Footer code and save.', 'Publish the site, then click “Check installation”.']],
    gtm: ['Google Tag Manager', ['Create a new tag → Custom HTML and paste the snippet.', 'Set the trigger to All Pages (or the pages you want).', 'Submit and publish the container, then click “Check installation”.']]
  };
  const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
  const WS = { id: null, open: { look: true }, platform: 'html', device: 'desktop', inst: null, scene: null };
  const clone = o => JSON.parse(JSON.stringify(o));
  const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setP = (o, p, v) => { const ks = p.split('.'); let t = o; ks.slice(0, -1).forEach(k => { if (t[k] == null || typeof t[k] !== 'object') t[k] = {}; t = t[k]; }); t[ks[ks.length - 1]] = v; };
  const tgBot = () => (S.channels || []).find(c => c.type === 'telegram_bot' && c.status === 'active' && c.username);
  const SWATCH = ['gold', 'midnight', 'white', 'pastel', 'ink', 'glass'];

  async function studio(ctx) {
    if (WS.scene) { WS.scene.stop(); WS.scene = null; }
    if (WS.inst) { WS.inst.destroy(); WS.inst = null; }
    await RV.refreshBoot();
    const [list] = await Promise.all([RV.loadChannels(true), RV.loadClosers()]);
    if (!ctx.ok()) return;
    const sites = list.filter(RV.isSite);
    const id = +ctx.q.id || 0;
    const intro = '<section class="ws-intro a-in' + (RV.store.get('ws_intro_on', false) ? '' : ' off') + '" id="wsIntro"><div class="ws-intro-copy"><span class="eyebrow" style="color:var(--jade)">Website chat ' + RV.whats('web') + '</span><strong>A chat bubble on your website.</strong><span>Same AI helper, same answers. Every chat shows up in Chats.</span><button class="btn btn-dark btn-sm" id="wsIntroT">' + (RV.store.get('ws_intro_on', false) ? 'Hide' : 'Show how it works') + '</button></div><div class="ws-scene" id="wsScene"></div></section>';
    if (!sites.length || ctx.q.new) {
      if (!RV.isManager()) { ctx.el.innerHTML = intro + RV.empty('No website chat yet', 'Ask a workspace owner or admin to add the chat to your website.', ''); bindIntro(); return; }
      if (!RV.webCanAdd()) { ctx.el.innerHTML = intro + RV.webLockedPanel(); bindIntro(); RV.bindWebBuy(ctx.el); return; }
      paintCreate(ctx, intro, sites);
      return;
    }
    const ch = sites.find(c => c.id === id) || sites[0];
    if (!id || ch.id !== id) { go('/app/widget?id=' + ch.id, { replace: true, silent: true }); }
    if (WS.id !== ch.id || !ctx.soft || !WS.w) {
      WS.id = ch.id; WS.ch = ch; WS.name = ch.name; WS.closer_id = ch.closer_id || 0;
      WS.w = clone(Object.assign({}, S.boot.widget_catalog.defaults, ch.widget));
      WS.w.colors = Object.assign({}, S.boot.widget_catalog.presets.gold.colors, ch.widget.colors || {});
      WS.w.lead = Object.assign(clone(S.boot.widget_catalog.defaults.lead), ch.widget.lead || {});
      WS.w.hours = Object.assign(clone(S.boot.widget_catalog.defaults.hours), ch.widget.hours || {});
      WS.domains = (ch.domains || []).slice(); WS.assets = Object.assign({}, ch.assets || {}); WS.dirty = false;
    }
    ctx.el.innerHTML = intro + '<div class="ws-top a-in"><div class="row grow" style="gap:12px;min-width:0;flex-wrap:wrap">' + RV.brandIcon('website', 46) +
      '<span class="col grow" style="gap:2px;min-width:0"><span class="row" style="gap:8px;flex-wrap:wrap"><strong class="ell" style="font-size:19px;letter-spacing:-0.03em">' + esc(WS.name) + '</strong>' + statusPill(ch) + '</span><span class="small muted ell">' + (WS.domains.length ? esc(WS.domains.join(', ')) : 'No domain added yet') + '</span></span>' +
      (sites.length > 1 ? '<label class="sr" for="wsPick">Choose a widget</label><select class="input" id="wsPick" style="width:auto;padding:9px 36px 9px 12px;font-size:14px;border-radius:999px">' + sites.map(s => '<option value="' + s.id + '"' + (s.id === ch.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select>' : '') +
      (RV.isManager() && RV.webCanAdd() ? '<a class="btn btn-ghost btn-sm" href="/app/widget?new=1">' + ic('plus', '#121110', 16, 2.6) + 'Add a site</a>' : '') + '</div></div>' +
      (!ch.unlocked ? RV.webLockedPanel(true).replace('ws-locked', 'ws-locked warnish') : '') +
      '<div class="ws-grid"><div class="ws-left" id="wsLeft"></div><div class="ws-right"><div class="ws-sticky" id="wsRight"></div></div></div>' +
      (RV.isManager() ? '<div class="ws-savebar" id="wsBar"><span class="small" id="wsDirty">All changes saved</span><button class="btn btn-ghost btn-sm" id="wsUndo" hidden>Undo changes</button><button class="btn btn-jade" id="wsSave" disabled>Save</button></div>' : '');
    bindIntro();
    RV.bindWebBuy(ctx.el);
    const pick = $('wsPick'); if (pick) pick.addEventListener('change', () => go('/app/widget?id=' + pick.value));
    paintLeft(ctx); paintRight(); markDirty(WS.dirty);
    const sv = $('wsSave'); if (sv) sv.addEventListener('click', () => save(ctx));
    const un = $('wsUndo'); if (un) un.addEventListener('click', () => { WS.w = null; studio(Object.assign({}, ctx, { soft: false })); });
    if (ctx.q.tab === 'install') { WS.open.install = true; paintLeft(ctx); const d = $('wsSec-install'); if (d) d.scrollIntoView({ block: 'start' }); }
  }
  function statusPill(ch) {
    if (!ch.unlocked) return '<span class="pill" style="background:#FFE3D6;color:#9A3412">Paused · plan limit</span>';
    if (ch.install && ch.install.seen_at) return '<span class="pill" style="background:#E8F6EC;color:#1E6B3A">Working on ' + esc(ch.install.host) + '</span>';
    return '<span class="pill" style="background:var(--mint);color:var(--jade-dd)">Waiting for the code</span>';
  }
  function bindIntro() {
    const el = $('wsScene'), box = $('wsIntro'), t = $('wsIntroT');
    if (el && !box.classList.contains('off')) WS.scene = RV.mountScene(el);
    if (t) t.addEventListener('click', () => {
      const off = !box.classList.contains('off'); box.classList.toggle('off', off); RV.store.set('ws_intro_on', !off); t.textContent = off ? 'Show how it works' : 'Hide';
      if (off && WS.scene) { WS.scene.stop(); WS.scene = null; el.innerHTML = ''; } else if (!off && !WS.scene) WS.scene = RV.mountScene(el);
    });
  }

  function paintCreate(ctx, intro, sites) {
    const closers = S.closers || [];
    ctx.el.innerHTML = intro + '<section class="panel a-in" style="max-width:720px"><div class="row" style="gap:12px">' + RV.brandIcon('website', 48) + '<span class="col" style="gap:0"><strong class="h3">Add chat to your website</strong><span class="muted small">Takes a minute.</span></span></div>' +
      '<form id="wsNew" class="col" style="gap:12px" novalidate><div class="field"><label class="lbl" for="wsNewDom">Your website address</label><input class="input" id="wsNewDom" placeholder="myshop.com" autocomplete="url" inputmode="url" autocapitalize="off"><span class="hint">Type your website address, like <b>myshop.com</b>.</span><span class="inline-err" id="wsNewErr" hidden></span></div>' +
      (closers.length > 1 ? '<div class="field"><label class="lbl" for="wsNewCl">Which AI helper answers?</label><select class="input" id="wsNewCl">' + closers.map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') + '</select></div>' : closers.length ? '<input type="hidden" id="wsNewCl" value="' + closers[0].id + '">' : '<div class="ok-box" style="background:var(--mint);border-color:var(--mint2);color:var(--jade-dd)">You don’t have an AI helper yet. You can still add the chat now and <a href="/app/studio" style="font-weight:800">make one</a> after. You can answer visitors yourself in Chats.</div>') +
      '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-main" type="submit" id="wsNewGo" style="justify-content:space-between;min-width:240px">Add website chat<span class="arr">' + ic('right', '#121110', 18, 2.6) + '</span></button>' + (sites.length ? '<a class="btn btn-ghost" href="/app/widget">Cancel</a>' : '') + '</div></form></section>';
    bindIntro();
    $('wsNew').addEventListener('submit', async e => {
      e.preventDefault();
      const er = $('wsNewErr'); er.hidden = true;
      const dom = $('wsNewDom').value.trim().replace(/^@+/, '');
      if (!dom) { er.textContent = 'Type your website address first.'; er.hidden = false; $('wsNewDom').focus(); return; }
      if (!/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(dom) && !/^localhost/i.test(dom)) { er.textContent = 'That doesn’t look like a website address. Try something like myshop.com.'; er.hidden = false; $('wsNewDom').focus(); return; }
      const b = $('wsNewGo'); RV.busy(b, true, 'Adding…');
      try {
        const cl = $('wsNewCl');
        const ch = await POST('/api/app/channels/website', { domains: [dom], name: dom.replace(/^https?:\/\//, '').replace(/\/.*$/, ''), closer_id: cl ? +cl.value : 0 });
        RV.confetti(36); toast('Your website chat is ready. Now copy the code.');
        await RV.refreshBoot(); WS.w = null; go('/app/widget?id=' + ch.id);
      } catch (x) { RV.busy(b, false); if (x.code === 'website_limit') RV.websiteLocked(); else { er.textContent = x.message; er.hidden = false; } }
    });
  }

  /* ----- settings column ----- */
  const sec = (id, title, sub, body) => '<details class="ws-sec panel a-in" id="wsSec-' + id + '" data-sec="' + id + '"' + (WS.open[id] ? ' open' : '') + '><summary><span class="col" style="gap:0"><strong>' + title + '</strong><span class="small muted">' + sub + '</span></span>' + ic('M6 9l6 6 6-6', '#121110', 18, 2.6) + '</summary><div class="ws-body">' + body + '</div></details>';
  const fld = (k, label, o) => { o = o || {}; const v = getP(WS.w, k); const id = 'wf-' + k.replace(/\./g, '-'); return '<div class="field' + (o.cls ? ' ' + o.cls : '') + '"><label class="lbl" for="' + id + '">' + label + '</label>' + (o.area ? '<textarea class="input" rows="' + (o.rows || 3) + '" id="' + id + '" data-k="' + k + '" maxlength="' + (o.max || 200) + '" placeholder="' + esc(o.ph || '') + '"' + (o.dis ? ' disabled' : '') + '>' + esc(v == null ? '' : v) + '</textarea>' : '<input class="input" id="' + id + '" data-k="' + k + '"' + (o.num ? ' data-t="num" type="number" inputmode="decimal" min="' + o.min + '" max="' + o.max + '" step="' + (o.step || 1) + '"' : ' maxlength="' + (o.max || 60) + '"') + ' value="' + esc(v == null ? '' : v) + '" placeholder="' + esc(o.ph || '') + '"' + (o.dis ? ' disabled' : '') + '>') + (o.hint ? '<span class="hint">' + o.hint + '</span>' : '') + '</div>'; };
  const tog = (k, label, desc, o) => { o = o || {}; const v = !!getP(WS.w, k); return '<div class="row ws-tog"><span class="col grow" style="gap:0;min-width:0"><strong style="font-size:14.5px">' + label + (o.lock ? ' <span class="pill" style="background:#121110;color:#FFC21A;font-size:10.5px">' + ic('M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z', '#FFC21A', 11, 2.6) + o.lock + '</span>' : '') + '</strong>' + (desc ? '<span class="small muted">' + desc + '</span>' : '') + '</span><button type="button" class="toggle ' + (v ? 'on' : 'off') + '" data-tog="' + k + '" aria-pressed="' + v + '" aria-label="' + esc(label) + '"' + (o.dis ? ' disabled' : '') + '><span></span></button></div>'; };
  const seg = (k, label, opts) => { const v = getP(WS.w, k); return '<div class="field"><span class="lbl" id="sl-' + k.replace(/\./g, '-') + '">' + label + '</span><div class="seg" role="group" aria-labelledby="sl-' + k.replace(/\./g, '-') + '">' + opts.map(o => '<button type="button" class="' + (v === o[0] ? 'on' : '') + '" data-seg="' + k + '" data-v="' + o[0] + '" aria-pressed="' + (v === o[0]) + '">' + o[1] + '</button>').join('') + '</div></div>'; };
  const rng = (k, label, min, max, step, unit) => { const v = getP(WS.w, k); return '<div class="range-row"><div class="top"><label for="wr-' + k + '">' + label + '</label><span class="tnum" id="wv-' + k + '">' + v + (unit || '') + '</span></div><input class="slider" type="range" id="wr-' + k + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '" data-k="' + k + '" data-t="num" data-unit="' + (unit || '') + '" style="--p:' + ((v - min) / (max - min) * 100) + '%"></div>'; };
  const upl = (kind, label, hint) => '<div class="ws-up"><span class="ws-up-img">' + (WS.assets[kind] ? '<img src="' + esc(WS.assets[kind]) + '" alt="">' : ic('image', '#948F82', 22)) + '</span><span class="col grow" style="gap:0;min-width:0"><strong style="font-size:14.5px">' + label + '</strong><span class="small muted">' + hint + '</span></span><input type="file" accept="image/png,image/jpeg,image/webp" id="wu-' + kind + '" data-up="' + kind + '" class="sr"><label class="btn btn-ghost btn-sm" for="wu-' + kind + '" tabindex="0" role="button" data-uplbl="' + kind + '">' + (WS.assets[kind] ? 'Replace' : 'Upload') + '</label>' + (WS.assets[kind] ? '<button type="button" class="btn btn-ghost btn-sm" data-unup="' + kind + '" aria-label="Remove ' + label + '">' + ic('trash', '#121110', 15) + '</button>' : '') + '</div>';

  function paintLeft(ctx) {
    const el = $('wsLeft'); if (!el) return;
    const w = WS.w, lim = RV.webUsage(), mgr = RV.isManager(), cat = S.boot.widget_catalog;
    const bot = tgBot();
    const look = '<div class="ws-presets">' + PRESET_ORDER.map(k => { const p = cat.presets[k]; return '<button type="button" class="ws-preset' + (w.preset === k ? ' on' : '') + '" data-preset="' + k + '" aria-pressed="' + (w.preset === k) + '"><span class="ws-sw" style="background:' + p.colors.panel_bg + '"><i style="background:' + p.colors.header_bg + '"></i><b style="background:' + p.colors.bubble_in + '"></b><b class="o" style="background:' + p.colors.bubble_out + '"></b><em style="background:' + p.colors.primary + '"></em></span><span>' + esc(p.name) + '</span></button>'; }).join('') + '</div>' +
      '<details class="ws-sub"><summary>Custom colours' + (w.preset === 'custom' ? ' <span class="pill" style="background:var(--mint);color:var(--jade-dd)">Custom</span>' : '') + '</summary><div class="ws-colors">' + COLOR_FIELDS.map(c => '<label class="ws-color"><input type="color" value="' + esc(w.colors[c[0]]) + '" data-color="' + c[0] + '" aria-label="' + c[1] + '"><span class="col" style="gap:0;min-width:0"><span class="small" style="font-weight:700">' + c[1] + '</span><input class="ws-hex mono" value="' + esc(w.colors[c[0]]) + '" data-hex="' + c[0] + '" maxlength="7" aria-label="' + c[1] + ' hex code"></span></label>').join('') + '</div></details>' +
      '<div class="ws-two"><div class="field"><label class="lbl" for="wf-font">Font</label><select class="input" id="wf-font" data-k="font">' + Object.keys(cat.fonts).map(k => '<option value="' + k + '"' + (w.font === k ? ' selected' : '') + '>' + esc(cat.fonts[k].name) + '</option>').join('') + '</select></div>' + seg('theme', 'Dark mode', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]) + '</div>' +
      rng('radius', 'Corner roundness', 0, 32, 1, 'px') +
      tog('glass', 'Glass panel', 'Frosted, see-through panel. Looks best on colourful sites.') +
      '<hr class="ws-hr">' + seg('launcher', 'Launcher', [['bubble', 'Bubble'], ['pill', 'Pill with text'], ['avatar', 'Avatar']]) +
      (w.launcher === 'pill' ? fld('launcher_text', 'Launcher text', { max: 30, ph: 'Chat with us' }) : '') +
      '<div class="ws-two">' + seg('position', 'Position', [['right', 'Bottom right'], ['left', 'Bottom left']]) + seg('size', 'Size', [['compact', 'Compact'], ['normal', 'Normal'], ['large', 'Large']]) + '</div>' +
      '<div class="ws-two">' + rng('offset_x', 'Side offset', 0, 120, 1, 'px') + rng('offset_y', 'Bottom offset', 0, 160, 1, 'px') + '</div>' +
      '<hr class="ws-hr"><div class="ws-two">' + fld('title', 'Header title', { max: 40 }) + fld('subtitle', 'Header subtitle', { max: 60, ph: 'Typically replies in seconds' }) + '</div>' +
      tog('show_online', 'Show “online” sign', 'A small green sign next to the subtitle. Off by default.') +
      upl('logo', 'Logo', 'Shown in the header instead of the avatar. PNG, JPG or WebP, up to 300 KB.') +
      '<div class="ws-two">' + seg('avatar_mode', 'Helper picture', [['initials', 'Initials'], ['upload', 'Photo']]) + fld('closer_name', 'Helper name on the chat', { max: 30, ph: (S.closers.find(c => c.id === WS.closer_id) || {}).name || 'Ace' }) + '</div>' +
      (w.avatar_mode === 'upload' ? upl('avatar', 'Avatar photo', 'Square works best. Up to 300 KB.') : '') +
      upl('launcher', 'Launcher icon', 'Optional image inside the bubble.');
    const texts = fld('welcome', 'Welcome message', { area: true, max: 400, rows: 3 }) + fld('placeholder', 'Input placeholder', { max: 50 }) +
      '<div class="field"><span class="lbl">Quick replies (up to 4)</span><div class="ws-chips">' + [0, 1, 2, 3].map(i => '<input class="input" data-chip="' + i + '" maxlength="40" aria-label="Quick reply ' + (i + 1) + '" placeholder="' + ['What do you sell?', 'How much is delivery?', 'Talk to a person', 'Opening hours?'][i] + '" value="' + esc((w.chips || [])[i] || '') + '">').join('') + '</div></div>' +
      '<hr class="ws-hr">' + fld('greet_text', 'Proactive greeting', { max: 120, ph: 'Hey! Got a question? I can help in seconds.', hint: 'Pops up above the launcher to start more conversations.' }) +
      '<div class="ws-two">' + fld('greet_after', 'Show after (seconds)', { num: true, min: 0, max: 120, hint: '0 = off' }) + fld('greet_url', 'Only on pages containing', { max: 120, ph: '/products/', hint: 'Leave empty for every page.' }) + '</div>' +
      '<hr class="ws-hr">' + fld('handoff_text', 'When a person takes over', { area: true, rows: 2, max: 200 }) + fld('offline_text', 'Outside your hours', { area: true, rows: 2, max: 200 }) +
      tog('disclosure', 'Show “AI assistant” label', 'Tells visitors they’re chatting with AI.') +
      (w.disclosure ? fld('disclosure_text', 'Label text', { max: 40 }) : '') +
      '<p class="ws-note">' + ic('info', '#7A5800', 16, 2.2) + '<span>Keep this on. The EU AI Act asks businesses to tell people when they’re talking to an AI, and being upfront builds trust. Replyvoo also tells visitors a person can join anytime.</span></p>';
    const feel = '<p class="small muted" style="margin:0">Instant replies can feel robotic. A short, natural pause with a typing indicator feels like your best rep. Replies never wait longer than the maximum.</p>' +
      '<div class="ws-two">' + rng('delay_min', 'Shortest reply delay', 0, 10, 0.5, 's') + rng('delay_max', 'Longest reply delay', 0, 15, 0.5, 's') + '</div>' +
      tog('human_typing', 'Type like a human', 'Longer answers take a little longer, like real typing.') +
      (w.human_typing ? rng('typing_cps', 'Typing speed', 8, 60, 1, ' chars/s') : '') +
      tog('sound', 'Sound on new message', 'A soft beep when a reply arrives and the chat is closed. Off by default.') +
      '<p class="small muted" style="margin:0">Languages: automatic. Your helper replies in the visitor’s language.</p>';
    const L = w.lead;
    const lead = seg('lead.mode', 'Ask for contact details', [['off', 'Off'], ['after_first', 'After the first reply'], ['before', 'Before the chat']]) +
      (L.mode !== 'off' ? fld('lead.title', 'Form title', { max: 60 }) + '<div class="ws-fields">' + [['name', 'Name'], ['email', 'Email'], ['phone', 'Phone']].map(f => '<div class="ws-field"><strong>' + f[1] + '</strong><span class="row" style="gap:8px"><span class="small muted">Ask</span><button type="button" class="toggle ' + (L[f[0]].on ? 'on' : 'off') + '" data-tog="lead.' + f[0] + '.on" aria-pressed="' + !!L[f[0]].on + '" aria-label="Ask for ' + f[1] + '"><span></span></button></span><span class="row" style="gap:8px"><span class="small muted">Required</span><button type="button" class="toggle ' + (L[f[0]].req ? 'on' : 'off') + '" data-tog="lead.' + f[0] + '.req" aria-pressed="' + !!L[f[0]].req + '" aria-label="' + f[1] + ' required"' + (L[f[0]].on ? '' : ' disabled') + '><span></span></button></span></div>').join('') + '</div>' : '') +
      '<p class="small muted" style="margin:0">People who leave their details show up in <a href="/app/leads" style="font-weight:800">Customers</a>, and the chat shows in Chats.</p>';
    const ins = WS.ch.install;
    const install = '<div class="field"><span class="lbl">Allowed domains</span><div class="ws-doms" id="wsDoms">' + WS.domains.map((d, i) => '<span class="chip on" style="cursor:default">' + esc(d) + '<button type="button" data-undom="' + i + '" aria-label="Remove ' + esc(d) + '" style="border:0;background:none;cursor:pointer;padding:0 0 0 4px;display:inline-flex">' + ic('x', '#121110', 14, 2.6) + '</button></span>').join('') + (WS.domains.length ? '' : '<span class="small" style="color:#9A2A12;font-weight:700">Add your website’s domain, or the chat won’t load there.</span>') + '</div>' +
      '<form class="row" id="wsDomF" style="gap:8px"><label class="sr" for="wsDomIn">Add a domain</label><input class="input" id="wsDomIn" placeholder="myshop.com" autocomplete="off" style="padding:11px 14px"><button class="btn btn-ink btn-sm" type="submit">Add</button></form><span class="hint">Type your website address, like <b>myshop.com</b>. It also works on www.myshop.com.</span></div>' +
      '<div class="field"><span class="lbl">Your install code</span><div class="ws-code"><code class="mono" id="wsSnip">' + esc(WS.ch.snippet) + '</code><button type="button" class="btn btn-jade btn-sm" id="wsCopy">' + ic('copy', '#121110', 15) + 'Copy</button></div><span class="hint">One line. Paste it on every page where the chat should appear.</span></div>';
    const H = w.hours;
    const adv = '<div class="field"><label class="lbl" for="wsName">Widget name (only you see it)</label><input class="input" id="wsName" maxlength="60" value="' + esc(WS.name) + '"></div>' +
      '<div class="field"><label class="lbl" for="wsCloser">Which AI helper answers</label><select class="input" id="wsCloser"><option value="0">No AI helper (you answer)</option>' + (S.closers || []).map(c => '<option value="' + c.id + '"' + (c.id === WS.closer_id ? ' selected' : '') + '>' + esc(c.name) + ' · ' + esc(RV.tpl(c.template).role) + (c.active ? '' : ' (paused)') + '</option>').join('') + '</select></div>' +
      tog('hours.on', 'Business hours', 'Outside these hours the AI still answers, and the “outside your hours” text replaces the handoff text.') +
      (H.on ? '<div class="ws-two">' + fld('hours.tz', 'Time zone', { max: 60, ph: 'Europe/Madrid' }) + '<div class="ws-two">' + '<div class="field"><label class="lbl" for="wf-hours-from">From</label><input class="input" type="time" id="wf-hours-from" data-k="hours.from" value="' + esc(H.from) + '"></div><div class="field"><label class="lbl" for="wf-hours-to">To</label><input class="input" type="time" id="wf-hours-to" data-k="hours.to" value="' + esc(H.to) + '"></div></div></div>' +
        '<div class="row" style="gap:6px;flex-wrap:wrap" role="group" aria-label="Open days">' + DAYS.map(d => '<button type="button" class="chip' + (H.days.includes(d[0]) ? ' on' : '') + '" data-day="' + d[0] + '" aria-pressed="' + H.days.includes(d[0]) + '">' + d[1] + '</button>').join('') + '</div>' : '') +
      tog('telegram_button', '“Continue on Telegram” button', bot ? 'Links to @' + esc(bot.username) + ' so visitors can keep chatting on Telegram.' : 'Connect a Telegram bot in Channels and the button appears automatically.') +
      tog('hide_branding', 'Hide “Powered by Replyvoo”', lim.remove_branding ? 'Your brand only.' : 'Shown as a small link that earns you Voo Squad rewards.', { lock: lim.remove_branding ? '' : 'Business+', dis: !lim.remove_branding }) +
      '<div class="field"><label class="lbl" for="wf-custom_css">Custom CSS ' + (lim.custom_css ? '' : '<span class="pill" style="background:#121110;color:#FFC21A;font-size:10.5px">Business+</span>') + '</label><textarea class="input mono" rows="5" id="wf-custom_css" data-k="custom_css" maxlength="5000" placeholder=".panel { box-shadow: none }"' + (lim.custom_css ? '' : ' disabled') + ' style="font-size:13px">' + esc(w.custom_css || '') + '</textarea><span class="hint">' + (lim.custom_css ? 'Applies inside the widget only (it runs in its own Shadow DOM). Imports and url() are removed.' : 'Available on Business and up.') + '</span></div>' +
      (mgr ? '<hr class="ws-hr"><div class="row" style="gap:8px;flex-wrap:wrap;justify-content:space-between"><span class="small muted">Removing the widget stops the chat on your site. Chats stay in Chats.</span><button type="button" class="btn btn-danger btn-sm" id="wsDel">' + ic('trash', '#9A2A12', 15) + 'Remove website chat</button></div>' : '');
    const simple = '<section class="panel a-in" style="gap:16px">' +
      '<div class="col" style="gap:8px"><strong style="font-size:17px">1. Pick a colour</strong><div class="ws-presets" role="group" aria-label="Colour">' + SWATCH.map(k => { const p = cat.presets[k]; return '<button type="button" class="ws-preset' + (w.preset === k ? ' on' : '') + '" data-preset="' + k + '" aria-pressed="' + (w.preset === k) + '"><span class="ws-sw" style="background:' + p.colors.panel_bg + '"><i style="background:' + p.colors.header_bg + '"></i><b style="background:' + p.colors.bubble_in + '"></b><b class="o" style="background:' + p.colors.bubble_out + '"></b><em style="background:' + p.colors.primary + '"></em></span><span>' + esc(p.name) + '</span></button>'; }).join('') + '</div></div>' +
      '<div class="col" style="gap:8px"><strong style="font-size:17px">2. Copy this code</strong><span class="small muted">Paste it on your website, once. It works on ' + (WS.domains.length ? '<b>' + esc(WS.domains.join(', ')) + '</b>' : '<b style="color:#9A2A12">no address yet: add yours under More options</b>') + '.</span>' +
      '<button type="button" class="btn btn-main" id="wsCopy2" style="justify-content:space-between">' + ic('copy', '#FFFFFF', 16, 2.4) + 'Copy this code<span class="arr">' + ic('right', '#121110', 18, 2.6) + '</span></button>' +
      '<div class="ws-tabs" role="tablist" aria-label="How to add it">' + ['shopify', 'wordpress', 'wix', 'html'].map(k => '<button type="button" role="tab" class="chip' + (WS.platform === k ? ' on' : '') + '" data-plat="' + k + '" aria-selected="' + (WS.platform === k) + '">' + (k === 'html' ? 'Other site' : PLATFORMS[k][0]) + '</button>').join('') + '</div>' +
      '<ol class="steps" id="wsSteps" role="tabpanel">' + PLATFORMS[WS.platform][1].map(x => '<li>' + esc(x) + '</li>').join('') + '</ol></div>' +
      '<div class="col" style="gap:8px"><strong style="font-size:17px">3. Check it works</strong><div class="ws-check"><span class="col grow" style="gap:0;min-width:0" id="wsInst">' + installText(WS.ch.install) + '</span><button type="button" class="btn btn-ink btn-sm" id="wsCheck">Check it works</button></div></div></section>';
    el.innerHTML = simple + '<details class="ws-more"' + (WS.open.more ? ' open' : '') + ' id="wsMore"><summary class="btn btn-ghost" style="list-style:none;width:100%;justify-content:center">More options</summary><div class="col" style="gap:12px;margin-top:12px">' +
      sec('look', 'Look', 'Colours, button and logo', look) + sec('texts', 'Words', 'Welcome message and quick questions', texts) + sec('feel', 'Reply speed', 'How fast it answers', feel) + sec('lead', 'Ask for contact details', 'Name, email or phone', lead) + sec('install', 'Website address & code', 'Where it works', install) + sec('advanced', 'Advanced', 'Hours, branding, custom style', adv) + '</div></details>';
    const mo = $('wsMore'); if (mo) mo.addEventListener('toggle', () => { WS.open.more = mo.open; });
    if (!mgr) el.querySelectorAll('input,select,textarea,button').forEach(x => { if (!x.closest('summary') && !x.hasAttribute('data-plat') && x.id !== 'wsCopy' && x.id !== 'wsCheck') x.disabled = true; });
    bindLeft(ctx);
  }
  function installText(ins) {
    if (ins && ins.seen_at) return '<strong style="font-size:14.5px;color:#1E6B3A">✓ Installed on ' + esc(ins.host) + '</strong><span class="small muted">Seen ' + RV.ago(ins.seen_at) + '</span>';
    return '<strong style="font-size:14.5px">Not seen yet</strong><span class="small muted">Paste the code, open your website once, then tap Check.</span>';
  }
  function change(rerender) { markDirty(true); if (rerender) { const y = window.scrollY; paintLeft(); window.scrollTo(0, y); } schedulePreview(); }
  function bindLeft() {
    const el = $('wsLeft');
    el.querySelectorAll('details.ws-sec').forEach(d => d.addEventListener('toggle', () => { WS.open[d.getAttribute('data-sec')] = d.open; }));
    const df = $('wsDomF');
    if (df) df.addEventListener('submit', e => {
      e.preventDefault();
      const inp = $('wsDomIn'); const d = inp.value.trim().toLowerCase().replace(/^@+/, '').replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '');
      if (!d) { toast('Type your website address first.', 'err'); inp.focus(); return; }
      if (!/^(\*\.)?([a-z0-9-]+\.)*[a-z0-9-]+$/.test(d)) { toast('That doesn’t look like a website address. Try myshop.com', 'err'); return; }
      if (!WS.domains.includes(d)) WS.domains.push(d);
      inp.value = ''; change(true); const n = $('wsDomIn'); if (n) n.focus();
    });
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    // Delegated once per page render: every control reads and writes WS.w (the unsaved widget config).
    el.addEventListener('input', e => {
      const w = WS.w;
      const t = e.target, k = t.getAttribute('data-k');
      if (k) {
        let v = t.value;
        if (t.getAttribute('data-t') === 'num') { v = Number(v); if (!isFinite(v)) return; }
        setP(w, k, v);
        if (t.type === 'range') { const min = +t.min, max = +t.max; t.style.setProperty('--p', ((v - min) / (max - min) * 100) + '%'); const o = $('wv-' + k); if (o) o.textContent = v + (t.getAttribute('data-unit') || ''); if (k === 'delay_min' && w.delay_max < v) { w.delay_max = v; const m = $('wr-delay_max'); if (m) { m.value = v; m.dispatchEvent(new Event('input', { bubbles: true })); } } if (k === 'delay_max' && w.delay_min > v) { w.delay_min = v; const m = $('wr-delay_min'); if (m) { m.value = v; m.dispatchEvent(new Event('input', { bubbles: true })); } } }
        change(false); return;
      }
      if (t.hasAttribute('data-chip')) { const chips = Array.from(el.querySelectorAll('[data-chip]')).map(x => x.value.trim()).filter(Boolean); w.chips = chips; change(false); return; }
      if (t.hasAttribute('data-color')) { const c = t.getAttribute('data-color'); w.colors[c] = t.value.toUpperCase(); const hx = el.querySelector('[data-hex="' + c + '"]'); if (hx) hx.value = w.colors[c]; w.preset = 'custom'; change(false); return; }
      if (t.hasAttribute('data-hex')) { const c = t.getAttribute('data-hex'); if (/^#[0-9a-fA-F]{6}$/.test(t.value)) { w.colors[c] = t.value.toUpperCase(); const cp = el.querySelector('[data-color="' + c + '"]'); if (cp) cp.value = w.colors[c]; w.preset = 'custom'; change(false); } return; }
      if (t.id === 'wsName') { WS.name = t.value; change(false); }
    });
    el.addEventListener('change', e => {
      const t = e.target, w = WS.w;
      if (t.id === 'wf-font') { w.font = t.value; change(false); }
      else if (t.id === 'wsCloser') { WS.closer_id = +t.value; change(false); }
      else if (t.hasAttribute('data-up')) upload(t.getAttribute('data-up'), t);
    });
    el.addEventListener('keydown', e => { const l = e.target.closest('[data-uplbl]'); if (l && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); $('wu-' + l.getAttribute('data-uplbl')).click(); } });
    el.addEventListener('click', e => {
      const t = e.target.closest('button'), w = WS.w; if (!t || t.disabled) return;
      if (t.hasAttribute('data-preset')) { const p = S.boot.widget_catalog.presets[t.getAttribute('data-preset')]; w.preset = t.getAttribute('data-preset'); w.colors = Object.assign({}, p.colors); w.glass = !!p.glass; change(true); }
      else if (t.hasAttribute('data-tog')) { const k = t.getAttribute('data-tog'); setP(w, k, !getP(w, k)); if (/^lead\.\w+\.on$/.test(k) && !getP(w, k)) setP(w, k.replace('.on', '.req'), false); change(['hours.on', 'human_typing', 'disclosure'].includes(k) || k.startsWith('lead.')); }
      else if (t.hasAttribute('data-seg')) { setP(w, t.getAttribute('data-seg'), t.getAttribute('data-v')); change(true); }
      else if (t.hasAttribute('data-day')) { const d = +t.getAttribute('data-day'); w.hours.days = w.hours.days.includes(d) ? w.hours.days.filter(x => x !== d) : w.hours.days.concat(d).sort(); change(true); }
      else if (t.hasAttribute('data-plat')) { WS.platform = t.getAttribute('data-plat'); el.querySelectorAll('[data-plat]').forEach(x => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', x === t); }); $('wsSteps').innerHTML = PLATFORMS[WS.platform][1].map(s => '<li>' + esc(s) + '</li>').join(''); }
      else if (t.hasAttribute('data-undom')) { WS.domains.splice(+t.getAttribute('data-undom'), 1); change(true); }
      else if (t.hasAttribute('data-unup')) upload(t.getAttribute('data-unup'), null);
      else if (t.id === 'wsCopy' || t.id === 'wsCopy2') RV.copy(WS.ch.snippet, 'Code copied. Now paste it on your website.');
      else if (t.id === 'wsCheck') checkInstall(t);
      else if (t.id === 'wsDel') removeWidget();
    });
  }
  async function upload(kind, input) {
    let data_url = null;
    if (input) {
      const f = input.files && input.files[0]; if (!f) return;
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { toast('Use a PNG, JPG or WebP image. SVG isn’t allowed for safety.', 'err'); input.value = ''; return; }
      if (f.size > 300 * 1024) { toast('That image is ' + Math.round(f.size / 1024) + ' KB. Keep it under 300 KB.', 'err'); input.value = ''; return; }
      data_url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read that file.')); r.readAsDataURL(f); }).catch(e => { fail(e); return null; });
      if (!data_url) return;
    }
    try {
      const ch = await POST('/api/app/channels/' + WS.id + '/upload', { kind, data_url });
      WS.assets = Object.assign({}, ch.assets || {}); WS.w.assets = ch.widget.assets; if (kind === 'avatar') WS.w.avatar_mode = ch.widget.avatar_mode;
      toast(input ? 'Image uploaded' : 'Image removed');
      const y = window.scrollY; paintLeft(); window.scrollTo(0, y); schedulePreview(true);
    } catch (e) { fail(e); if (input) input.value = ''; }
  }
  async function checkInstall(btn) {
    RV.busy(btn, true, 'Checking…');
    try { const ch = await GET('/api/app/channels/' + WS.id); WS.ch.install = ch.install; $('wsInst').innerHTML = installText(ch.install); toast(ch.install && ch.install.seen_at ? 'It works! Found it on ' + ch.install.host : 'Not seen yet. Open your website once after pasting the code, then check again.', ch.install && ch.install.seen_at ? 'ok' : 'info'); }
    catch (e) { fail(e); }
    RV.busy(btn, false);
  }
  async function removeWidget() {
    if (!(await RV.confirmBox('Remove ' + WS.name + '?', 'The chat disappears from your website right away. Its chats and leads stay in Chats and Customers.', 'Remove widget', true))) return;
    try { await DEL('/api/app/channels/' + WS.id); toast('Widget removed'); WS.w = null; WS.id = null; await Promise.all([RV.refreshBoot(), RV.loadChannels(true)]); go('/app/channels'); }
    catch (e) { fail(e); }
  }
  function markDirty(d) {
    WS.dirty = d;
    const s = $('wsSave'), t = $('wsDirty'), u = $('wsUndo'), bar = $('wsBar');
    if (s) s.disabled = !d; if (u) u.hidden = !d; if (t) t.textContent = d ? 'You have unsaved changes' : 'All changes saved';
    if (bar) bar.classList.toggle('dirty', d);
  }
  async function save(ctx) {
    const b = $('wsSave'); RV.busy(b, true, 'Saving…');
    try {
      const body = { name: WS.name, closer_id: WS.closer_id, domains: WS.domains, widget: Object.assign({}, WS.w) };
      delete body.widget.assets;
      if (!RV.webUsage().custom_css) delete body.widget.custom_css;
      if (!RV.webUsage().remove_branding) delete body.widget.hide_branding;
      const ch = await PUT('/api/app/channels/' + WS.id, body);
      WS.ch = ch; WS.domains = ch.domains.slice(); WS.w = Object.assign(WS.w, ch.widget);
      RV.busy(b, false); markDirty(false); toast('Saved. Your website shows it now.');
      RV.loadChannels(true);
    } catch (e) { RV.busy(b, false); markDirty(true); fail(e); }
    void ctx;
  }

  /* ----- live preview ----- */
  function pub() {
    const w = WS.w, cat = S.boot.widget_catalog, lim = RV.webUsage(), bot = tgBot();
    const closer = (S.closers || []).find(c => c.id === WS.closer_id);
    const name = w.closer_name || (closer && closer.name) || w.title;
    const f = cat.fonts[w.font] || cat.fonts.system;
    return { key: 'preview', online: true, business: S.boot.workspace.name, closer: { name, initials: RV.initials(name), ai: !!closer }, widget: Object.assign({}, w, { hours_on: !!(w.hours && w.hours.on) }), font: { family: f.family, css: f.css },
      assets: WS.assets, team_online: true, telegram_url: bot ? 'https://t.me/' + bot.username : '', branding: { show: !(w.hide_branding && lim.remove_branding), url: '#' }, css: lim.custom_css ? w.custom_css : '' };
  }
  function paintRight() {
    const el = $('wsRight'); if (!el) return;
    const dom = WS.domains[0] || 'your-website.com';
    el.innerHTML = '<div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><span class="pill" style="background:#121110;color:#FFC21A">Preview</span>' +
      '<div class="seg" role="group" aria-label="Preview device"><button type="button" data-dev="desktop" class="' + (WS.device === 'desktop' ? 'on' : '') + '" aria-pressed="' + (WS.device === 'desktop') + '">' + ic('M3 4h18v12H3zM8 20h8M12 16v4', 'currentColor', 15) + 'Desktop</button><button type="button" data-dev="phone" class="' + (WS.device === 'phone' ? 'on' : '') + '" aria-pressed="' + (WS.device === 'phone') + '">' + ic('M7 2h10v20H7zM11 18h2', 'currentColor', 15) + 'Phone</button></div></div>' +
      '<div class="ws-device ' + WS.device + '"><div class="ws-bar"><i></i><i></i><i></i><span>' + esc(dom) + '</span></div><div class="ws-site" id="wsSite">' +
      '<div class="ws-fake"><div class="ws-fnav"><b>' + esc((S.boot.workspace.name || 'Your shop').toUpperCase()) + '</b><span></span><span></span><span></span></div><div class="ws-fhero"><div class="ws-fimg"></div><div class="col" style="gap:8px;flex:1"><i></i><i class="s"></i><b>$24.00</b><em>Add to cart</em></div></div><div class="ws-fgrid"><div></div><div></div><div></div><div></div></div></div></div></div>' +
      '<div class="row" style="gap:6px;flex-wrap:wrap;justify-content:center"><button type="button" class="btn btn-ghost btn-sm" id="wpOpen">Open chat</button><button type="button" class="btn btn-ghost btn-sm" id="wpGreet">Show greeting</button><button type="button" class="btn btn-ghost btn-sm" id="wpReset">Restart</button></div>' +
      '<p class="small muted" style="margin:0;text-align:center">This preview uses sample replies. On your site your helper answers with what you taught it.</p>';
    mountPreview();
    el.querySelectorAll('[data-dev]').forEach(b => b.addEventListener('click', () => { WS.device = b.getAttribute('data-dev'); paintRight(); }));
    $('wpOpen').addEventListener('click', () => { if (WS.inst) WS.inst.toggle(); });
    $('wpGreet').addEventListener('click', () => { if (WS.inst) { WS.inst.close(); WS.inst.showGreet(); } });
    $('wpReset').addEventListener('click', () => { if (WS.inst) { WS.inst.destroy(); WS.inst = null; } mountPreview(); });
  }
  function mountPreview() {
    const site = $('wsSite'); if (!site || !window.ReplyvooWidget) return;
    if (WS.inst) { WS.inst.destroy(); WS.inst = null; }
    WS.inst = window.ReplyvooWidget.mount(site, pub(), { preview: true });
  }
  let pt = null;
  function schedulePreview(now) {
    clearTimeout(pt);
    pt = setTimeout(() => { if (WS.inst && $('wsSite')) WS.inst.update(pub()); const d = RV.qs('#wsRight .ws-bar span'); if (d) d.textContent = WS.domains[0] || 'your-website.com'; }, now ? 0 : 120);
  }

  RV.route('widget', { render: studio, when: () => RV.chan('website') !== 'off' });
  window.addEventListener('beforeunload', e => { if (WS.dirty && RV.parse().name === 'widget') { e.preventDefault(); e.returnValue = ''; } });
})();
