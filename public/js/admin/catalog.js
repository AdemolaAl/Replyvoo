/* Replyvoo admin: plans, credit packs, power-ups, coupons. */
(function () {
  'use strict';
  const RV = window.RV, { $, $$, esc, fmt, money, ic, F, clone } = RV;
  const LIVE = '<span class="live-note"><span class="pulse"></span>Changes go live on the website immediately</span>';

  /* ---------- countdown ticker for offers ---------- */
  const left = iso => {
    const ms = new Date(iso).getTime() - Date.now();
    if (!(ms > 0)) return 'ended';
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    const p = n => String(n).padStart(2, '0');
    return (d ? d + 'd ' : '') + p(h) + ':' + p(m) + ':' + p(s);
  };
  setInterval(() => $$('[data-end]').forEach(el => { el.textContent = left(el.dataset.end); }), 1000);

  const offerOn = o => o && Number(o.percent) > 0 && (!o.ends_at || new Date(o.ends_at) > new Date());
  const r2 = n => Math.round(n * 100) / 100;
  const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="flex:0 0 18px;margin-top:1px"><circle cx="12" cy="12" r="10" fill="#FFC21A"/><path d="M7.5 12.5l3 3 6-6.5" stroke="#121110" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------- the website plan card, ported from the approved prototype ---------- */
  function planCard(p, yearly) {
    const dark = p.popular || p.elite;
    const base = yearly && p.price_year > 0 ? p.price_year / 12 : Number(p.price_month) || 0;
    const on = offerOn(p.offer);
    const now = on ? base * (1 - p.offer.percent / 100) : base;
    const per = !p.price_month ? 'forever' : (yearly && p.price_year > 0 ? '/mo billed yearly' : '/month');
    const ag = Number(p.closers) || 1;
    let dots = ''; for (let i = 0; i < Math.min(ag, 10); i++) dots += '<span style="width:10px;height:10px;border-radius:4px;background:' + (dark ? '#FFC21A' : '#121110') + ';opacity:' + (1 - i * .06) + '"></span>';
    const agText = ag >= 9999 ? 'Unlimited AI Closers' : ag + ' AI Closer' + (ag > 1 ? 's' : '');
    const feats = (p.features || []).filter(x => String(x).trim());
    return '<div class="plan' + (p.elite ? ' elite' : p.popular ? ' pop' : '') + '">' + (p.popular && !p.elite ? '<div class="mesh"></div>' : '') +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;position:relative"><strong style="font-size:21px;letter-spacing:-0.03em' + (p.elite ? ';color:#FFD23F' : '') + '">' + esc(p.name || 'Plan name') + '</strong>' + (p.badge ? '<span class="pill" style="' + (p.elite ? 'border:1px solid #FFC21A;color:#FFC21A' : 'background:var(--jade);color:var(--ink)') + '">' + esc(p.badge) + '</span>' : '') + '</div>' +
      (p.description ? '<span class="pdesc" style="font-size:14px;position:relative">' + esc(p.description) + '</span>' : '') +
      (on ? '<div class="offer-tag"><span>' + esc(p.offer.label || (p.offer.percent + '% off')) + '</span>' + (p.offer.ends_at ? '<span class="cd" data-end="' + esc(p.offer.ends_at) + '">' + left(p.offer.ends_at) + '</span>' : '') + '</div>' : '') +
      '<div style="display:flex;align-items:baseline;gap:6px;position:relative;flex-wrap:wrap">' + (p.contact_sales ? '<span class="pper" style="font-size:14px;font-weight:700">from</span>' : '') + (on ? '<s class="pper tnum" style="font-size:20px;font-weight:700">$' + fmt(base, base % 1 ? 2 : 0) + '</s>' : '') + '<span class="tnum" style="font-size:46px;font-weight:800;letter-spacing:-0.06em;line-height:1">$' + fmt(now, now % 1 ? 2 : 0) + '</span><span class="pper" style="font-size:14px;font-weight:600">' + per + '</span></div>' +
      '<div class="agents"><div style="display:flex;flex-wrap:wrap;gap:3px;max-width:70px">' + dots + '</div><span style="display:flex;flex-direction:column;line-height:1.3"><strong style="font-size:15px">' + agText + '</strong><span class="pdesc" style="font-size:12.5px">' + fmt(p.conversations) + ' chats' + (p.channels_text ? ' · ' + esc(p.channels_text) : '') + '</span></span></div>' +
      '<span class="pbtn" style="text-align:center">' + esc(p.cta || 'Get started') + '</span>' +
      '<ul>' + feats.map(x => '<li>' + CHECK + esc(x) + '</li>').join('') + (p.extra_chat_price > 0 ? '<li style="opacity:.8">' + CHECK + 'Extra chats: 1 Voo Credit each</li>' : '') + '</ul></div>';
  }
  RV.planCard = planCard;

  /* ================= PLANS ================= */
  let plans = [];
  const planBody = p => ({ name: p.name, description: p.description, price_month: p.price_month, price_year: p.price_year, closers: p.closers, conversations: p.conversations, seats: p.seats, channels_text: p.channels_text, extra_chat_price: p.extra_chat_price, pro_brain_chats: p.pro_brain_chats, website_sites: Number(p.website_sites) || 0, remove_branding: !!p.remove_branding, custom_css: !!p.custom_css, features: (p.features || []).map(s => String(s).trim()).filter(Boolean), badge: p.badge, cta: p.cta, popular: !!p.popular, elite: !!p.elite, contact_sales: !!p.contact_sales, sort: p.sort, active: !!p.active, offer: { label: (p.offer || {}).label || '', percent: Number((p.offer || {}).percent) || 0, ends_at: (p.offer || {}).ends_at || '' } });

  async function loadPlans() { plans = await RV.get('/api/admin/plans'); RV.cache.plans = plans; return plans; }

  RV.route('plans', {
    async render(page, arg, stale) {
      await loadPlans(); if (stale()) return;
      const s = await RV.settings(); if (stale()) return;
      const freeId = s.billing.free_plan_id;
      const draw = () => {
        page.innerHTML = RV.header('Plans', 'Pause, edit, reorder and put offers on your plans. Paused plans disappear from the website but current subscribers keep them.', '<button class="btn btn-y" data-new>' + ic('plus', 18) + 'New plan</button>') +
          '<div style="margin:-4px 0 16px">' + LIVE + '</div>' +
          '<div id="planList">' + (plans.length ? plans.map((p, i) => {
            const on = offerOn(p.offer);
            const price = p.contact_sales ? '<span class="mut" style="font-size:13px;font-weight:600">from</span> ' + money(p.price_month) + '<span class="mut" style="font-size:13px;font-weight:600">/mo · sales</span>' : p.price_month ? money(on ? r2(p.price_month * (1 - p.offer.percent / 100)) : p.price_month) + '<span class="mut" style="font-size:13px;font-weight:600">/mo</span>' : 'Free';
            return '<div class="plan-row' + (p.active ? '' : ' paused') + '" draggable="true" data-i="' + i + '"><span class="drag" aria-hidden="true">' + ic('drag', 18) + '</span>' +
              '<button class="pr-main" data-edit="' + i + '" aria-label="Edit ' + esc(p.name) + '"><span class="pr-name">' + esc(p.name) + (p.id === freeId ? '<span class="pill p-mut">FREE PLAN</span>' : '') + (p.popular ? '<span class="pill p-y">POPULAR</span>' : '') + (p.elite ? '<span class="pill p-ink">ELITE</span>' : '') + (on ? '<span class="pill" style="background:var(--coral);color:#fff">' + esc(p.offer.label || p.offer.percent + '% OFF') + '</span>' : '') + (p.active ? '' : '<span class="pill p-mut">PAUSED</span>') + '</span>' +
              '<span class="pr-price tnum">' + (on && !p.contact_sales ? '<s>' + money(p.price_month) + '</s>' : '') + price + '</span>' +
              '<span class="pr-meta">' + fmt(p.subscribers) + ' subscriber' + (p.subscribers === 1 ? '' : 's') + ' · ' + (p.closers >= 9999 ? 'Unlimited Closers' : fmt(p.closers) + (p.closers === 1 ? ' Closer' : ' Closers')) + ' · ' + fmt(p.conversations) + ' chats</span></button>' +
              '<div class="pr-ord"><button class="ib" data-mv="-1" data-i="' + i + '" aria-label="Move ' + esc(p.name) + ' up"' + (i ? '' : ' disabled') + '>' + ic('up', 16) + '</button><button class="ib" data-mv="1" data-i="' + i + '" aria-label="Move ' + esc(p.name) + ' down"' + (i < plans.length - 1 ? '' : ' disabled') + '>' + ic('down', 16) + '</button></div>' +
              '<button class="tg" role="switch" aria-checked="' + !!p.active + '" aria-label="' + esc(p.name) + ' is ' + (p.active ? 'live' : 'paused') + '" data-act="' + i + '"><span></span></button></div>';
          }).join('') : '<div class="card empty"><strong>No plans yet</strong>Create your first plan.</div>') + '</div>';
      };
      draw();
      page.onclick = async e => {
        if (e.target.closest('[data-new]')) return editPlan(null, () => RV.render());
        const ed = e.target.closest('[data-edit]'); if (ed) return editPlan(plans[+ed.dataset.edit], () => RV.render());
        const t = e.target.closest('[data-act]');
        if (t) {
          const p = plans[+t.dataset.act]; const nv = !p.active;
          if (!nv && !(await RV.confirm({ title: 'Pause ' + p.name + '?', text: 'It disappears from the website and checkout right away. ' + (p.subscribers ? p.subscribers + ' current subscriber(s) keep it.' : ''), ok: 'Pause plan' }))) return;
          t.disabled = true;
          try { await RV.put('/api/admin/plans/' + encodeURIComponent(p.id), { ...planBody(p), active: nv }); p.active = nv ? 1 : 0; RV.toast(p.name + (nv ? ' is live again' : ' is paused')); draw(); }
          catch (err) { RV.fail(err); t.disabled = false; }
          return;
        }
        const mv = e.target.closest('[data-mv]');
        if (mv) { const i = +mv.dataset.i, j = i + +mv.dataset.mv; await reorder(i, j); draw(); }
      };
      // drag and drop (mouse)
      let from = null;
      page.addEventListener('dragstart', e => { const r = e.target.closest('.plan-row'); if (!r) return; from = +r.dataset.i; r.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(from)); } catch (x) { /* ignore */ } });
      page.addEventListener('dragend', () => { $$('.plan-row', page).forEach(r => r.classList.remove('dragging', 'drag-over')); });
      page.addEventListener('dragover', e => { const r = e.target.closest('.plan-row'); if (!r || from == null) return; e.preventDefault(); $$('.plan-row', page).forEach(x => x.classList.toggle('drag-over', x === r)); });
      page.addEventListener('drop', async e => { const r = e.target.closest('.plan-row'); if (!r || from == null) return; e.preventDefault(); const to = +r.dataset.i; const f = from; from = null; if (f !== to) { await reorder(f, to); draw(); } });
    }
  });

  async function reorder(i, j) {
    if (j < 0 || j >= plans.length) return;
    const [m] = plans.splice(i, 1); plans.splice(j, 0, m);
    const jobs = [];
    plans.forEach((p, k) => { if (p.sort !== k) { p.sort = k; jobs.push(p); } });
    try { for (const p of jobs) await RV.put('/api/admin/plans/' + encodeURIComponent(p.id), planBody(p)); RV.toast('Order saved'); }
    catch (err) { RV.fail(err); await loadPlans(); }
  }

  function editPlan(orig, done) {
    const isNew = !orig;
    const p = isNew ? { name: '', description: '', price_month: 0, price_year: 0, closers: 1, conversations: 500, seats: 1, channels_text: '', extra_chat_price: 0, pro_brain_chats: 0, website_sites: 0, remove_branding: false, custom_css: false, features: [], badge: '', cta: 'Get started', popular: false, elite: false, contact_sales: false, active: true, offer: { label: '', percent: 0, ends_at: '' } } : clone(orig);
    p.popular = !!p.popular; p.elite = !!p.elite; p.contact_sales = !!p.contact_sales; p.active = !!p.active; p.remove_branding = !!p.remove_branding; p.custom_css = !!p.custom_css; p.website_sites = Number(p.website_sites) || 0;
    p.offer = Object.assign({ label: '', percent: 0, ends_at: '' }, p.offer || {});
    if (!Array.isArray(p.features)) p.features = [];
    const body =
      '<div class="split"><div class="stack">' +
      F.secT('Basics') +
      '<div class="fg c2">' + F.text('name', 'Plan name', { req: true, max: 40, ph: 'e.g. Scale' }) + F.text('badge', 'Badge', { max: 30, ph: 'e.g. MOST POPULAR', hint: 'Small label on the card. Leave empty for none.' }) + '</div>' +
      F.text('description', 'Short description', { max: 160, ph: 'Teams that sell every day' }) +
      F.secT('Pricing') +
      '<div class="fg c2m">' + F.num('price_month', 'Monthly price', { pre: '$', req: true }) + F.num('price_year', 'Yearly total price', { pre: '$', hint: '<span id="yrNote"></span>' }) + '</div>' +
      F.secT('Offer') +
      '<div class="note">Put a time-limited discount on this plan. The website shows the old price crossed out with a countdown. Set the percent to 0 to switch it off.</div>' +
      '<div class="fg c2m">' + F.text('offer.label', 'Offer label', { max: 60, ph: 'Black Friday: 30% off' }) + F.num('offer.percent', 'Percent off', { suf: '%', max: 90, hint: 'Max 90%' }) + '</div>' +
      '<div class="fg c2" style="align-items:end">' + F.dt('offer.ends_at', 'Offer ends', { hint: 'Leave empty to keep it running.' }) + '<div class="row-wrap"><button type="button" class="btn btn-g btn-sm" data-o="24">+24 hours</button><button type="button" class="btn btn-g btn-sm" data-o="168">+7 days</button><button type="button" class="btn btn-red btn-sm" data-o="0">Remove offer</button></div></div>' +
      '<div id="offerPrev"></div>' +
      F.secT('Limits') +
      '<div class="fg c2m">' + F.num('closers', 'AI Closers', { int: true, min: 1, req: true, hint: '9999 = unlimited' }) + F.num('conversations', 'Conversations / month', { int: true, req: true }) + F.num('seats', 'Team seats', { int: true, min: 1, req: true }) + F.num('pro_brain_chats', 'Pro Brain chats', { int: true }) + F.num('extra_chat_price', 'Extra chat price', { pre: '$', step: 0.001, hint: 'Shown as “Extra chats $X each”' }) + F.text('channels_text', 'Channels text', { max: 80, ph: '10 channels' }) + '</div>' +
      F.secT('Website chat') +
      '<div class="note">How many websites can run the AI chat widget on this plan. 0 = locked (customers can still buy the Website chat power-up). 999 = every site. Add a line to the features list so it shows on the pricing page.</div>' +
      '<div class="fg c2m">' + F.num('website_sites', 'Website chat sites', { int: true, hint: '0 = locked' }) + '</div>' +
      '<div class="card" style="padding:4px 16px">' + F.tog('remove_branding', 'Remove branding', 'Lets customers hide “Powered by Replyvoo” on the widget') + F.tog('custom_css', 'Custom CSS', 'Lets customers add their own CSS to the widget') + '</div>' +
      F.secT('Card') +
      F.text('cta', 'Button text', { max: 30, ph: 'Get started' }) +
      '<div class="lbl">Features list</div><div id="featEd"></div>' +
      '<div class="card" style="padding:4px 16px">' + F.tog('popular', 'Popular', 'Dark card that stands out') + F.tog('elite', 'Elite', 'Black-and-gold card for premium plans') + F.tog('contact_sales', 'Contact sales', 'Shows “from” before the price and sends people to sales') + F.tog('active', 'Live on website', 'Off = paused: hidden from the site and checkout') + '</div>' +
      (isNew ? '' : '<div class="note">Plan id: <strong>' + esc(orig.id) + '</strong> · ' + fmt(orig.subscribers) + ' workspace(s) on it.</div>') +
      '</div><div class="sticky"><div class="preview-wrap"><div class="preview-lbl">' + ic('eye', 14) + 'Website preview<span style="margin-left:auto">' + '<span class="seg" role="group" aria-label="Preview billing" id="yrSeg"><button type="button" data-yr="m" aria-pressed="true">Monthly</button><button type="button" data-yr="y" aria-pressed="false">Yearly</button></span>' + '</span></div><div id="planPrev"></div></div></div></div>';
    const extra = isNew ? '' : '<button class="btn btn-red" data-delplan>' + ic('trash', 16) + 'Delete</button>';
    const sh = RV.sheet({ title: isNew ? 'New plan' : 'Edit ' + orig.name, sub: 'Changes go live on the website immediately.', body, wide: true, save: isNew ? 'Create plan' : 'Save plan', extra,
      async onSave() {
        if (p.price_year > 0 && p.price_month > 0 && p.price_year > p.price_month * 12 && !(await RV.confirm({ title: 'Yearly costs more than monthly?', text: 'The yearly total is higher than 12 monthly payments. Save anyway?', ok: 'Save anyway' }))) return false;
        if (p.offer.ends_at && new Date(p.offer.ends_at) < new Date() && Number(p.offer.percent) > 0 && !(await RV.confirm({ title: 'Offer end date is in the past', text: 'The offer won’t show on the website. Save anyway?', ok: 'Save anyway' }))) return false;
        const b = planBody(p);
        if (isNew) { const r = await RV.post('/api/admin/plans', b); RV.toast(p.name + ' created'); void r; }
        else { await RV.put('/api/admin/plans/' + encodeURIComponent(orig.id), b); RV.toast(p.name + ' saved. It’s live on the website.'); }
        done && done();
      } });
    const st = { _yr: 'm' };
    const prev = () => {
      $('#planPrev', sh.el).innerHTML = planCard(p, st._yr === 'y');
      const n = $('#yrNote', sh.el);
      if (n) n.textContent = p.price_year > 0 ? '= ' + money(r2(p.price_year / 12)) + '/mo' + (p.price_month > 0 ? ', ' + fmt(Math.max(0, 12 - p.price_year / p.price_month), 1).replace(/\.0$/, '') + ' months free' : '') : '0 = no yearly option';
      const o = p.offer, op = $('#offerPrev', sh.el);
      if (Number(o.percent) > 0 && p.price_month > 0) {
        const ended = o.ends_at && new Date(o.ends_at) < new Date();
        op.innerHTML = '<div class="warn' + (ended ? ' red' : ' green') + '">' + ic(ended ? 'warn' : 'spark', 18) + '<span>' + (ended ? 'This offer has ended, so the website shows the normal price.' : '<strong><s class="mut2">' + money(p.price_month) + '</s> ' + money(r2(p.price_month * (1 - o.percent / 100))) + '/mo</strong> while the offer runs' + (o.ends_at ? ' · ends in <strong class="tnum" data-end="' + esc(o.ends_at) + '">' + left(o.ends_at) + '</strong>' : ' · no end date')) + '</span></div>';
      } else op.innerHTML = '';
    };
    RV.bind(sh.body, p, prev);
    $('#yrSeg', sh.el).addEventListener('click', e => { const b = e.target.closest('[data-yr]'); if (!b) return; st._yr = b.dataset.yr; $$('#yrSeg button', sh.el).forEach(x => x.setAttribute('aria-pressed', String(x === b))); prev(); });
    RV.listEditor($('#featEd', sh.el), p.features, { ph: 'e.g. 10 AI Closers', addLabel: 'Add feature', onChange: prev });
    prev();
    sh.el.addEventListener('click', async e => {
      const o = e.target.closest('[data-o]');
      if (o) {
        const h = +o.dataset.o, inp = $('[data-k="offer.ends_at"]', sh.el), pc = $('[data-k="offer.percent"]', sh.el);
        if (!h) { p.offer = { label: '', percent: 0, ends_at: '' }; $('[data-k="offer.label"]', sh.el).value = ''; pc.value = 0; inp.value = ''; }
        else { const base = p.offer.ends_at && new Date(p.offer.ends_at) > new Date() ? new Date(p.offer.ends_at) : new Date(); p.offer.ends_at = new Date(base.getTime() + h * 36e5).toISOString(); inp.value = RV.toLocalInput(p.offer.ends_at); if (!(Number(p.offer.percent) > 0)) { p.offer.percent = 0.2 * 100; pc.value = 20; } }
        sh.dirty = true; prev(); return;
      }
      if (e.target.closest('[data-delplan]')) {
        if (!(await RV.confirm({ title: 'Delete ' + orig.name + '?', text: 'This can’t be undone. Plans with subscribers can’t be deleted; pause them instead.', ok: 'Delete plan', danger: true }))) return;
        try { await RV.del('/api/admin/plans/' + encodeURIComponent(orig.id)); RV.toast(orig.name + ' deleted'); sh.close(true); done && done(); } catch (err) { RV.fail(err); }
      }
    });
  }

  /* ================= CREDIT PACKS ================= */
  RV.route('packs', {
    async render(page, arg, stale) {
      const packs = await RV.get('/api/admin/packs'); if (stale()) return;
      const s = await RV.settings(); if (stale()) return;
      const cv = s.billing.credit_value_usd;
      page.innerHTML = RV.header('Credit packs', 'Voo Credits people buy for extra conversations. 1 credit = 1 conversation.', '<button class="btn btn-y" data-new>' + ic('plus', 18) + 'New pack</button>') + '<div style="margin:-4px 0 16px">' + LIVE + '</div>' +
        (packs.length ? '<div class="grid g2">' + packs.map((p, i) => {
          const tot = p.credits + p.bonus;
          return '<div class="card" style="display:flex;flex-direction:column;gap:10px;' + (p.active ? '' : 'background:var(--soft)') + '"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><div class="tnum" style="font-size:28px;font-weight:800;letter-spacing:-0.05em;line-height:1.1">' + fmt(p.credits) + (p.bonus ? ' <span class="pill p-y">+' + fmt(p.bonus) + ' bonus</span>' : '') + '</div><div class="mut" style="font-size:13px">credits' + (p.label ? ' · ' + esc(p.label) : '') + '</div></div><button class="tg" role="switch" aria-checked="' + !!p.active + '" aria-label="Pack ' + fmt(p.credits) + ' active" data-act="' + i + '"><span></span></button></div>' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px"><div><div style="font-size:22px;font-weight:800">' + money(p.price) + '</div><div class="mut" style="font-size:12.5px">$' + (p.price / tot).toFixed(4) + ' per credit' + (cv ? ' · ' + Math.round((1 - (p.price / tot) / cv) * 100) + '% vs list' : '') + '</div></div><button class="btn btn-g btn-sm" data-edit="' + i + '">' + ic('edit', 16) + 'Edit</button></div></div>';
        }).join('') + '</div>' : '<div class="card empty"><strong>No packs yet</strong>Add a credit pack people can buy.</div>');
      page.onclick = async e => {
        if (e.target.closest('[data-new]')) return editPack(null);
        const ed = e.target.closest('[data-edit]'); if (ed) return editPack(packs[+ed.dataset.edit]);
        const t = e.target.closest('[data-act]');
        if (t) { const p = packs[+t.dataset.act]; t.disabled = true; try { await RV.put('/api/admin/packs/' + p.id, { ...p, active: !p.active }); RV.toast(p.active ? 'Pack hidden' : 'Pack is live'); RV.render(); } catch (err) { RV.fail(err); t.disabled = false; } }
      };
    }
  });
  function editPack(orig) {
    const p = orig ? clone(orig) : { credits: 1000, bonus: 0, price: 25, label: '', sort: 0, active: 1 };
    p.active = !!p.active;
    const sh = RV.sheet({ title: orig ? 'Edit pack' : 'New credit pack', body:
      '<div class="fg c2m">' + F.num('credits', 'Credits', { int: true, min: 1, req: true }) + F.num('bonus', 'Bonus credits', { int: true }) + F.num('price', 'Price', { pre: '$', min: 0.5, req: true }) + F.num('sort', 'Sort order', { int: true, min: -999 }) + '</div>' +
      F.text('label', 'Label', { max: 40, ph: 'e.g. Best value' }) + '<div id="ppc" class="warn"></div>' + '<div class="card" style="padding:4px 16px">' + F.tog('active', 'Available to buy') + '</div>',
      extra: orig ? '<button class="btn btn-red" data-delp>' + ic('trash', 16) + 'Delete</button>' : '',
      async onSave() { if (orig) await RV.put('/api/admin/packs/' + orig.id, p); else await RV.post('/api/admin/packs', p); RV.toast('Pack saved'); RV.render(); } });
    const upd = () => { const tot = (p.credits || 0) + (p.bonus || 0); $('#ppc', sh.el).innerHTML = ic('coins', 18) + '<span><strong>' + fmt(tot) + ' credits</strong> for ' + money(p.price || 0) + ' = <strong>$' + (tot ? ((p.price || 0) / tot).toFixed(4) : '0') + '</strong> per credit</span>'; };
    RV.bind(sh.body, p, upd); upd();
    sh.el.addEventListener('click', async e => { if (!e.target.closest('[data-delp]')) return; if (!(await RV.confirm({ title: 'Delete this pack?', text: 'People won’t be able to buy it any more.', ok: 'Delete', danger: true }))) return; try { await RV.del('/api/admin/packs/' + orig.id); RV.toast('Pack deleted'); sh.close(true); RV.render(); } catch (err) { RV.fail(err); } });
  }

  /* ================= POWER-UPS ================= */
  const STAT = [['live', 'Live', 's-live'], ['soon', 'Coming soon', 's-soon'], ['off', 'Off', 's-off']];
  RV.route('powerups', {
    async render(page, arg, stale) {
      const list = await RV.get('/api/admin/addons'); if (stale()) return;
      page.innerHTML = RV.header('Power-ups', 'Add-ons shown on the pricing page and in dashboards.', '<button class="btn btn-y" data-new>' + ic('plus', 18) + 'New power-up</button>') + '<div style="margin:-4px 0 16px">' + LIVE + '</div>' +
        '<div class="card" style="padding:4px 16px"><div class="list">' + (list.length ? list.map((a, i) => '<button class="li" data-edit="' + i + '"><span class="ico">' + ic('bolt', 18) + '</span><span class="li-main"><strong>' + esc(a.name) + '</strong><span>' + esc(a.description) + '</span></span><span class="li-end"><span class="pill p-mut">' + esc(a.price_text || money(a.price)) + '</span>' + RV.statusPill(a.active ? a.status : 'paused') + '</span></button>').join('') : '<div class="empty"><strong>No power-ups</strong></div>') + '</div></div>';
      page.onclick = e => { if (e.target.closest('[data-new]')) return editAddon(null); const ed = e.target.closest('[data-edit]'); if (ed) editAddon(list[+ed.dataset.edit]); };
    }
  });
  function editAddon(orig) {
    const a = orig ? clone(orig) : { slug: '', name: '', description: '', price_text: '', price: 0, credits: 0, status: 'live', sort: 0, active: 1 };
    a.active = !!a.active;
    const sh = RV.sheet({ title: orig ? 'Edit ' + orig.name : 'New power-up', body:
      F.text('name', 'Name', { req: true, max: 60, ph: 'Extra Closer' }) +
      (orig ? '<div class="note">Slug: <strong>' + esc(orig.slug) + '</strong> (used by the app, can’t change)</div>' : F.text('slug', 'Slug', { max: 60, ph: 'extra-closer', hint: 'Lowercase id used by the app. Leave empty to build it from the name.' })) +
      F.area('description', 'Description', { rows: 2, max: 200 }) +
      '<div class="fg c2m">' + F.text('price_text', 'Price text', { max: 60, ph: '$5 / mo or 150 credits' }) + F.num('price', 'Price (USD)', { pre: '$' }) + F.num('credits', 'Credits cost', { int: true }) + F.num('sort', 'Sort order', { int: true, min: -999 }) + '</div>' +
      '<div class="f"><span class="lbl">Status</span>' + F.seg('status', STAT, { w: true, label: 'Status' }) + '</div>' +
      '<div class="card" style="padding:4px 16px">' + F.tog('active', 'Active', 'Off hides it everywhere') + '</div>',
      extra: orig ? '<button class="btn btn-red" data-dela>' + ic('trash', 16) + 'Delete</button>' : '',
      async onSave() { if (orig) await RV.put('/api/admin/addons/' + orig.id, a); else await RV.post('/api/admin/addons', a); RV.toast('Power-up saved'); RV.render(); } });
    RV.bind(sh.body, a);
    sh.el.addEventListener('click', async e => { if (!e.target.closest('[data-dela]')) return; if (!(await RV.confirm({ title: 'Delete ' + orig.name + '?', ok: 'Delete', danger: true }))) return; try { await RV.del('/api/admin/addons/' + orig.id); RV.toast('Deleted'); sh.close(true); RV.render(); } catch (err) { RV.fail(err); } });
  }

  /* ================= COUPONS ================= */
  const cStatus = c => !c.active ? ['paused', 'p-mut'] : c.expires_at && new Date(c.expires_at) < new Date() ? ['expired', 'p-bad'] : c.max_uses && c.used >= c.max_uses ? ['used up', 'p-warn'] : ['active', 'p-ok'];
  const genCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; return ['VOO', 'CLOSE', 'GROW', 'SALE'][Math.floor(Math.random() * 4)] + s; };
  RV.route('coupons', {
    async render(page, arg, stale) {
      const [list, pl] = await Promise.all([RV.get('/api/admin/coupons'), RV.cache.plans ? Promise.resolve(RV.cache.plans) : loadPlans()]); if (stale()) return;
      const pname = id => (pl.find(p => p.id === id) || { name: id }).name;
      page.innerHTML = RV.header('Coupons', 'Discount codes people type at checkout.', '<button class="btn btn-y" data-new>' + ic('plus', 18) + 'New coupon</button>') +
        (list.length ? '<div class="grid g2">' + list.map((c, i) => {
          const [st, cls] = cStatus(c);
          const pct = c.max_uses ? Math.min(100, c.used / c.max_uses * 100) : 0;
          return '<div class="card" style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;align-items:center;gap:8px;justify-content:space-between"><span style="display:flex;align-items:center;gap:6px;min-width:0"><span class="code">' + esc(c.code) + '</span><button class="ib ghost" data-copy="' + esc(c.code) + '" aria-label="Copy code ' + esc(c.code) + '" style="width:34px;height:34px;flex-basis:34px">' + ic('copy', 16) + '</button></span><span class="pill ' + cls + '">' + st + '</span></div>' +
            '<div><div style="font-size:22px;font-weight:800;letter-spacing:-0.03em">' + (c.kind === 'percent' ? fmt(c.value, c.value % 1 ? 1 : 0) + '% off' : money(c.value) + ' off') + '</div><div class="mut" style="font-size:13px">' + esc(c.description || 'No description') + '</div></div>' +
            '<div class="row-wrap" style="font-size:12.5px">' + '<span class="pill p-mut">' + (c.applies_to === 'all' ? 'Everything' : c.applies_to === 'pack' ? 'Credit packs' : (c.plan_ids.length ? c.plan_ids.map(pname).join(', ') : 'All plans')) + '</span>' + (c.first_purchase_only ? '<span class="pill p-v">First purchase</span>' : '') + (c.expires_at ? '<span class="pill p-mut">' + (new Date(c.expires_at) < new Date() ? 'Expired ' : 'Ends ') + RV.date(c.expires_at) + '</span>' : '') + '</div>' +
            '<div><div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:700"><span>Used ' + fmt(c.used) + (c.max_uses ? ' of ' + fmt(c.max_uses) : ' times') + '</span><span class="mut">' + (c.max_uses ? fmt(Math.max(0, c.max_uses - c.used)) + ' left' : 'Unlimited') + '</span></div>' + (c.max_uses ? '<div class="bar"><i style="width:' + pct + '%"></i></div>' : '') + '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center"><span class="sw" style="border:0;padding:0;gap:10px"><button class="tg" role="switch" aria-checked="' + !!c.active + '" aria-label="Coupon ' + esc(c.code) + ' active" data-act="' + i + '"><span></span></button></span><button class="btn btn-g btn-sm" data-edit="' + i + '">' + ic('edit', 16) + 'Edit</button></div></div>';
        }).join('') + '</div>' : '<div class="card empty"><strong>No coupons yet</strong>Create a code to run a promo.</div>');
      page.onclick = async e => {
        if (e.target.closest('[data-new]')) return editCoupon(null, pl);
        const cp = e.target.closest('[data-copy]'); if (cp) return RV.copy(cp.dataset.copy, 'Code copied');
        const ed = e.target.closest('[data-edit]'); if (ed) return editCoupon(list[+ed.dataset.edit], pl);
        const t = e.target.closest('[data-act]');
        if (t) { const c = list[+t.dataset.act]; t.disabled = true; try { await RV.put('/api/admin/coupons/' + c.id, { ...c, active: !c.active }); RV.toast(c.code + (c.active ? ' paused' : ' is active')); RV.render(); } catch (err) { RV.fail(err); t.disabled = false; } }
      };
    }
  });
  function editCoupon(orig, pl) {
    const c = orig ? clone(orig) : { code: genCode(), description: '', kind: 'percent', value: 20, applies_to: 'all', plan_ids: [], max_uses: 0, first_purchase_only: false, expires_at: null, active: true };
    c.active = !!c.active; c.first_purchase_only = !!c.first_purchase_only;
    const sh = RV.sheet({ title: orig ? 'Edit ' + orig.code : 'New coupon', body:
      '<div class="f"><label for="cpCode">Code <span aria-hidden="true" style="color:var(--bad)">*</span></label><div style="display:flex;gap:8px"><input id="cpCode" data-k="code" required maxlength="40" style="text-transform:uppercase;font-weight:800;letter-spacing:.06em" autocomplete="off"><button type="button" class="btn btn-g" data-gen aria-label="Generate a code">' + ic('refresh', 16) + 'Generate</button></div><span class="hint">Letters, numbers, - and _ only. At least 3 characters.</span></div>' +
      F.text('description', 'Description (for you)', { max: 120, ph: 'Launch promo for Twitter followers' }) +
      '<div class="f"><span class="lbl">Discount type</span>' + F.seg('kind', [['percent', 'Percent off'], ['fixed', 'Fixed $ off']], { w: true, label: 'Discount type' }) + '</div>' +
      '<div id="cpVal"></div>' +
      '<div class="f"><span class="lbl">Applies to</span>' + F.seg('applies_to', [['all', 'Everything'], ['plan', 'Plans'], ['pack', 'Credit packs']], { w: true, label: 'Applies to' }) + '</div>' +
      '<div id="cpPlans" class="f"><span class="lbl">Only these plans <span class="mut" style="font-weight:500">(none ticked = all plans)</span></span><div class="checks">' + pl.filter(p => p.price_month > 0 || p.contact_sales).map(p => '<label class="ck"><input type="checkbox" value="' + esc(p.id) + '"' + (c.plan_ids.includes(p.id) ? ' checked' : '') + '>' + esc(p.name) + '</label>').join('') + '</div></div>' +
      '<div class="fg c2m">' + F.num('max_uses', 'Max uses', { int: true, hint: '0 = unlimited' + (orig ? ' · used ' + orig.used : '') }) + F.dt('expires_at', 'Expires', { hint: 'Empty = never' }) + '</div>' +
      '<div class="card" style="padding:4px 16px">' + F.tog('first_purchase_only', 'First purchase only', 'Only works on a workspace’s first paid order') + F.tog('active', 'Active') + '</div>',
      extra: orig ? '<button class="btn btn-red" data-delc>' + ic('trash', 16) + 'Delete</button>' : '',
      async onSave() {
        c.code = String(c.code || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        if (c.code.length < 3) { RV.toast('Coupon codes need at least 3 letters or numbers.', 'err'); return false; }
        if (!(Number(c.value) > 0)) { RV.toast('Enter a discount value.', 'err'); return false; }
        if (c.applies_to !== 'plan') c.plan_ids = [];
        if (orig) await RV.put('/api/admin/coupons/' + orig.id, c); else await RV.post('/api/admin/coupons', c);
        RV.toast('Coupon ' + c.code + ' saved'); RV.render();
      } });
    const drawVal = () => {
      const box = $('#cpVal', sh.el);
      box.innerHTML = c.kind === 'percent' ? F.num('value', 'Percent off', { suf: '%', max: 100, req: true, min: 0.01 }) : F.num('value', 'Amount off', { pre: '$', req: true, min: 0.01 });
      RV.bind(box, c);
      $('#cpPlans', sh.el).hidden = c.applies_to !== 'plan';
    };
    RV.bind(sh.body, c, k => { if (k === 'kind' || k === 'applies_to') drawVal(); });
    drawVal();
    sh.el.addEventListener('change', e => { if (e.target.matches('#cpPlans input')) c.plan_ids = $$('#cpPlans input:checked', sh.el).map(x => x.value); });
    sh.el.addEventListener('click', async e => {
      if (e.target.closest('[data-gen]')) { c.code = genCode(); $('#cpCode', sh.el).value = c.code; sh.dirty = true; }
      if (e.target.closest('[data-delc]')) { if (!(await RV.confirm({ title: 'Delete ' + orig.code + '?', text: 'Anyone holding this code won’t be able to use it.', ok: 'Delete', danger: true }))) return; try { await RV.del('/api/admin/coupons/' + orig.id); RV.toast('Coupon deleted'); sh.close(true); RV.render(); } catch (err) { RV.fail(err); } }
    });
  }
})();
