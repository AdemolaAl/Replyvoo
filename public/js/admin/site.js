/* Replyvoo admin: homepage editor, channels & feature flags, billing rules, company/SEO/Joinvoo. */
(function () {
  'use strict';
  const RV = window.RV, { $, $$, esc, fmt, ic, F, clone } = RV;

  /* ================= HOMEPAGE ================= */
  const LANGS = [['en', 'EN', 'English'], ['fr', 'FR', 'French'], ['pt', 'PT', 'Portuguese'], ['es', 'ES', 'Spanish'], ['sw', 'SW', 'Swahili'], ['ar', 'AR', 'Arabic']];
  const SECTIONS = [
    ['leak', 'Slow-reply leak', 'The “you’re killing conversion” section'], ['compare', 'Staff vs Closer', 'Comparison table'], ['calc', 'Savings calculator', 'Interactive money calculator'],
    ['how', 'How it works', '3 steps to go live'], ['studio', 'Agent Studio', 'Animated training demo: teach, fix, go live'], ['website', 'Website chat', 'Animated demo of the website widget'], ['channels', 'Channels', 'Telegram + coming-soon channels'], ['closers', 'Meet the Closers', 'The AI agent templates'],
    ['features', 'Features grid', 'Pulse Inbox, HeatScore and friends'], ['juno', 'Juno', 'The built-in assistant'], ['wallet', 'Voo Wallet', 'Credits explainer'],
    ['pricing', 'Pricing', 'Plans, packs and power-ups'], ['squad', 'Voo Squad', 'Referral programme'], ['blog', 'Blog', 'Latest posts'], ['faq', 'FAQ', 'Questions and answers'], ['cta', 'Final call to action', 'Big closing banner']
  ];
  RV.route('homepage', {
    async render(page, arg, stale) {
      const s = await RV.settings(true); if (stale()) return;
      const site = clone(s.site);
      site.announcement = site.announcement || {}; site.hero = site.hero || {}; site.sections = site.sections || {}; site.final_cta = site.final_cta || {};
      if (!Array.isArray(site.faq)) site.faq = [];
      LANGS.forEach(([l]) => { site.hero[l] = Object.assign({ badge: '', h1a: '', h1b: '', sub: '', cta: '', cta2: '' }, site.hero[l] || {}); });
      let lang = 'en';
      page.innerHTML = RV.header('Homepage', 'Edit what visitors see on the website. Save once you’re happy.', '<a class="btn btn-g" href="/" target="_blank" rel="noopener">' + ic('ext', 16) + 'View site</a>') +
        '<div class="stack">' +
        '<section class="card"><div class="card-h"><div><h2>Announcement bar</h2><p>The thin strip at the very top of the site.</p></div></div>' + F.tog('announcement.on', 'Show announcement bar') +
        '<div class="fg" style="margin-top:6px">' + F.text('announcement.text', 'Text', { max: 160 }) + '<div class="fg c2m">' + F.text('announcement.link_text', 'Link text', { max: 40 }) + F.text('announcement.link', 'Link', { max: 200, ph: '/app/signup' }) + '</div><div id="annPrev"></div></div></section>' +
        '<section class="card"><div class="card-h"><div><h2>Hero</h2><p>The big headline. Edit each language separately.</p></div></div><div class="ltabs" role="group" aria-label="Language">' + LANGS.map(([l, t, n]) => '<button type="button" data-lang="' + l + '" aria-pressed="' + (l === lang) + '" title="' + n + '">' + t + '</button>').join('') + '</div><div class="split" style="margin-top:14px"><div id="heroF" class="fg"></div><div class="sticky"><div class="preview-lbl">' + ic('eye', 14) + 'Preview</div><div id="heroPrev"></div></div></div></section>' +
        '<section class="card"><div class="card-h"><div><h2>Sections</h2><p>Turn whole homepage sections on or off.</p></div></div><div class="grid g2" style="gap:0 24px">' + SECTIONS.map(([k, n, d]) => F.tog('sections.' + k, n, d)).join('') + '</div></section>' +
        '<section class="card"><div class="card-h"><div><h2>FAQ</h2><p>Questions shown near the bottom of the page.</p></div><button type="button" class="btn btn-g btn-sm" data-faqadd>' + ic('plus', 16) + 'Add</button></div><div id="faqEd" class="stack" style="gap:10px"></div></section>' +
        '<section class="card"><div class="card-h"><div><h2>Final call to action</h2><p>The big banner at the end of the page.</p></div></div><div class="fg">' + F.text('final_cta.a', 'Headline line 1', { max: 80 }) + F.text('final_cta.b', 'Headline line 2 (italic)', { max: 80 }) + F.area('final_cta.sub', 'Sub text', { rows: 2, max: 240 }) + '</div></section>' +
        '</div>';
      const prevAnn = () => { const a = site.announcement; $('#annPrev', page).innerHTML = a.on ? '<div class="ann-prev">' + esc(a.text) + (a.link_text ? ' <u>' + esc(a.link_text) + ' →</u>' : '') + '</div>' : '<div class="note">The announcement bar is hidden.</div>'; };
      const prevHero = () => { const h = site.hero[lang]; const rtl = lang === 'ar'; $('#heroPrev', page).innerHTML = '<div class="hero-prev"' + (rtl ? ' dir="rtl"' : '') + '><h3>' + esc(h.h1a) + '<br><em>' + esc(h.h1b) + '</em></h3><p>' + esc(h.sub) + '</p><div class="cta"><span>' + esc(h.cta) + '</span><span>' + esc(h.cta2) + '</span></div></div>'; };
      const drawHero = () => {
        const rtl = lang === 'ar' ? 'rtl' : undefined;
        const box = $('#heroF', page);
        box.innerHTML = F.text('hero.' + lang + '.badge', 'Badge (after the live number)', { max: 120, dir: rtl }) + '<div class="fg c2">' + F.text('hero.' + lang + '.h1a', 'Headline', { max: 80, dir: rtl, req: lang === 'en' }) + F.text('hero.' + lang + '.h1b', 'Headline, italic part', { max: 80, dir: rtl }) + '</div>' + F.area('hero.' + lang + '.sub', 'Sub text', { rows: 3, max: 400, dir: rtl }) + '<div class="fg c2">' + F.text('hero.' + lang + '.cta', 'Main button', { max: 60, dir: rtl }) + F.text('hero.' + lang + '.cta2', 'Second button', { max: 60, dir: rtl }) + '</div>';
        RV.bind(box, site, prevHero);
        prevHero();
      };
      const drawFaq = () => {
        $('#faqEd', page).innerHTML = site.faq.length ? site.faq.map((qa, i) => '<div class="faq-ed"><div class="faq-ed-h"><strong>Question ' + (i + 1) + '</strong><span class="el-btns"><button type="button" class="ib" data-fup="' + i + '" aria-label="Move question ' + (i + 1) + ' up"' + (i ? '' : ' disabled') + '>' + ic('up', 16) + '</button><button type="button" class="ib" data-fdn="' + i + '" aria-label="Move question ' + (i + 1) + ' down"' + (i < site.faq.length - 1 ? '' : ' disabled') + '>' + ic('down', 16) + '</button><button type="button" class="ib" data-frm="' + i + '" aria-label="Remove question ' + (i + 1) + '">' + ic('trash', 16) + '</button></span></div>' +
          '<input class="input" aria-label="Question ' + (i + 1) + '" data-fq="' + i + '" value="' + esc(qa[0]) + '" maxlength="200" placeholder="Question"><textarea class="input" aria-label="Answer ' + (i + 1) + '" data-fa="' + i + '" rows="3" maxlength="1200" placeholder="Answer">' + esc(qa[1]) + '</textarea></div>').join('') : '<div class="empty">No questions. The FAQ section will be empty.</div>';
      };
      RV.bind(page, site, k => { if (k.startsWith('announcement')) prevAnn(); });
      drawHero(); drawFaq(); prevAnn();
      page.addEventListener('input', e => { const q = e.target.dataset.fq, a = e.target.dataset.fa; if (q != null) site.faq[q][0] = e.target.value; if (a != null) site.faq[a][1] = e.target.value; });
      page.addEventListener('click', e => {
        const lb = e.target.closest('[data-lang]');
        if (lb) { lang = lb.dataset.lang; $$('[data-lang]', page).forEach(b => b.setAttribute('aria-pressed', String(b === lb))); drawHero(); return; }
        const b = e.target.closest('[data-faqadd],[data-fup],[data-fdn],[data-frm]'); if (!b) return;
        if (b.dataset.faqadd != null) site.faq.push(['', '']);
        else if (b.dataset.fup != null) { const i = +b.dataset.fup; [site.faq[i - 1], site.faq[i]] = [site.faq[i], site.faq[i - 1]]; }
        else if (b.dataset.fdn != null) { const i = +b.dataset.fdn; [site.faq[i + 1], site.faq[i]] = [site.faq[i], site.faq[i + 1]]; }
        else if (b.dataset.frm != null) site.faq.splice(+b.dataset.frm, 1);
        drawFaq(); page.dispatchEvent(new Event('change'));
        if (b.dataset.faqadd != null) { const ins = $$('[data-fq]', page); ins[ins.length - 1].focus(); }
      });
      RV.watchPage(page, async () => {
        const bad = site.faq.findIndex(x => !String(x[0]).trim() || !String(x[1]).trim());
        if (bad >= 0) { const err = new Error('Question ' + (bad + 1) + ' needs both a question and an answer.'); throw err; }
        if (!String(site.hero.en.h1a).trim()) throw new Error('The English headline can’t be empty.');
        await RV.saveSetting('site', site); RV.toast('Homepage saved. It’s live now.');
      }, () => RV.render());
    }
  });

  /* ================= CHANNELS & FEATURES ================= */
  const CHANNELS = [
    ['telegram_bot', 'telegram', 'Telegram bots', 'Your own bot from @BotFather.'], ['telegram_business', 'telegram', 'Telegram Business', 'Personal accounts through Telegram Business (Premium).'], ['telegram_group', 'telegram', 'Telegram groups', 'Closers that guard and answer in groups.'],
    ['website', 'website', 'Website chat', 'AI chat widget on customers’ own websites. Off/soon also pauses existing widgets.'],
    ['whatsapp', 'whatsapp', 'WhatsApp', 'WhatsApp Business Platform.'], ['instagram', 'instagram', 'Instagram', 'DMs, story replies and comment-to-DM.'], ['tiktok', 'tiktok', 'TikTok', 'Business messaging and lead DMs.'], ['messenger', 'messenger', 'Messenger', 'Facebook Page messages.']
  ];
  const META = ['whatsapp', 'instagram', 'tiktok', 'messenger'];
  const FEATS = [
    ['signup', 'New sign-ups', 'Let new people create accounts. Off = sign-up page shows “paused”.'], ['studio', 'Agent Studio', 'The Closer builder in dashboards.'], ['live_room', 'Live Room', 'Watch chats happen in real time.'],
    ['blast', 'Blast', 'Broadcast messages to customer segments.'], ['juno', 'Juno', 'The built-in AI assistant in dashboards.'], ['wallet', 'Voo Wallet', 'Credits wallet and top-ups.'],
    ['squad', 'Voo Squad referrals', 'Referral programme and rewards.'], ['joinvoo', 'Joinvoo promo in dashboards', 'Cards that promote our sister product.'], ['pro_brain', 'Pro Brain', 'The smarter model as an upgrade.'],
    ['voice', 'Voice notes & images', 'Closers understand voice notes and screenshots.'], ['blog', 'Blog', 'Public blog pages.'], ['chat_widget', 'Website chat bubble', 'Juno chat on the marketing site.'],
    ['nudge', 'Nudge', 'Automatic follow-ups for quiet leads.'], ['night_report', 'Night Shift Report', 'Daily summary email / Telegram message.']
  ];
  RV.route('channels', {
    async render(page, arg, stale) {
      const [s, ov] = await Promise.all([RV.settings(true), RV.get('/api/admin/overview').catch(() => ({ waitlist: [] }))]); if (stale()) return;
      RV.cache.overview = ov;
      const wl = Object.fromEntries((ov.waitlist || []).map(w => [w.item, w.n]));
      const flags = clone(s.flags);
      page.innerHTML = RV.header('Channels & features', 'Flip things on and off. Every switch saves instantly.') +
        '<div class="stack">' +
        '<section class="card" id="mCard"><div class="card-h"><div><h2>Maintenance mode</h2><p>Takes the website and dashboards offline for everyone except admins.</p></div></div>' + F.tog('maintenance', 'Maintenance mode', 'Closers keep replying in the background.') + '<div id="mWarn"></div></section>' +
        '<section><div class="card-h" style="margin:8px 2px 12px"><div><h2>Channels</h2><p>Live = customers can connect it. Coming soon = shows a waitlist. Off = hidden.</p></div></div><div class="grid g2">' +
        CHANNELS.map(([k, brand, name, desc]) => '<div class="card chan"><div class="chan-h">' + RV.brandIcon(brand) + '<div style="min-width:0;flex:1"><strong style="font-size:16px">' + name + '</strong><div class="mut" style="font-size:13px">' + desc + '</div></div>' + (wl[k] ? '<span class="pill p-v" title="Waitlist sign-ups">' + fmt(wl[k]) + ' waiting</span>' : '') + '</div>' +
          F.seg('channels.' + k, [['live', 'Live', 's-live'], ['soon', 'Coming soon', 's-soon'], ['off', 'Off', 's-off']], { w: true, label: name + ' status' }) +
          (k === 'whatsapp' ? '<div class="note">' + ic('info', 14) + ' WhatsApp is built. Customers see it as Live only when Connections → WhatsApp has the Meta keys and is switched on; until then it shows Coming soon. Off hides it everywhere. See docs/WHATSAPP.md.</div>'
            : META.includes(k) ? '<div class="note">' + ic('info', 14) + ' Setting Live only shows the channel as available. The integration must be built and approved by ' + (k === 'tiktok' ? 'TikTok' : 'Meta') + ' first — see docs/CHANNELS.md.</div>' : '') + '</div>').join('') + '</div></section>' +
        '<section class="card"><div class="card-h"><div><h2>Features</h2><p>Hide whole features from dashboards and the website.</p></div></div><div class="grid g2" style="gap:0 24px">' + FEATS.map(([k, n, d]) => F.tog('features.' + k, n, d)).join('') + '</div></section>' +
        '</div>';
      const warn = () => { $('#mWarn', page).innerHTML = flags.maintenance ? '<div class="warn red" style="margin-top:8px">' + ic('warn', 18) + '<span><strong>The site is in maintenance mode.</strong> Visitors and customers see a “We’ll be right back” page. Remember to switch it off.</span></div>' : ''; };
      warn();
      let saving = Promise.resolve();
      RV.bind(page, flags, (k, v, el) => {
        saving = saving.then(async () => {
          const before = clone(RV.cache.settings.flags);
          if (k === 'maintenance' && flags.maintenance && !(await RV.confirm({ title: 'Turn on maintenance mode?', text: 'The website and every customer dashboard go offline until you turn it off. Only admins can get in.', ok: 'Go offline', danger: true }))) {
            flags.maintenance = false; el.setAttribute('aria-checked', 'false'); return;
          }
          try {
            await RV.saveSetting('flags', flags);
            const label = k === 'maintenance' ? 'Maintenance mode ' + (flags.maintenance ? 'on' : 'off') : k.startsWith('channels.') ? CHANNELS.find(c => 'channels.' + c[0] === k)[2] + ': ' + { live: 'Live', soon: 'Coming soon', off: 'Off' }[v] : FEATS.find(f => 'features.' + f[0] === k)[1] + (v ? ' on' : ' off');
            RV.toast(label);
          } catch (err) {
            RV.fail(err);
            Object.assign(flags, clone(before));
            RV.render();
          }
          warn();
        });
      });
    }
  });

  /* ================= BILLING RULES ================= */
  const BUILTIN = ['NGN', 'GHS', 'KES', 'ZAR', 'USD'];
  RV.route('billing', {
    async render(page, arg, stale) {
      const [s, pl, gv] = await Promise.all([RV.settings(true), RV.get('/api/admin/plans'), RV.get('/api/admin/gatevoo').catch(() => null)]); if (stale()) return;
      const b = clone(s.billing);
      if (!Array.isArray(b.referral_tiers)) b.referral_tiers = [];
      b.rates = b.rates || {};
      b.method_fees = { bachs: 4, paystack: 0, flutterwave: 0, crypto: 0, demo: 0, ...(b.method_fees || {}), gatevoo: 0 };
      let rates = Object.entries(b.rates).map(([c, r]) => ({ c, r }));
      const free = pl.filter(p => Number(p.price_month) === 0);
      page.innerHTML = RV.header('Billing rules', 'How conversations are counted, credits, referrals, currencies and crypto.') +
        '<div class="stack">' +
        '<section class="card"><div class="card-h"><div><h2>Conversations</h2><p>What counts as one conversation.</p></div></div><div class="fg c2m">' + F.num('conversation_reply_limit', 'AI replies per conversation', { int: true, min: 1, req: true }) + F.num('conversation_window_hours', 'Conversation window', { int: true, min: 1, req: true, suf: 'h' }) + '</div>' +
        '<div style="margin-top:14px">' + F.sel('free_plan_id', 'Free plan', free.map(p => [p.id, p.name + ' ($0)']), { hint: 'New sign-ups start here. Only $0 plans can be chosen.' }) + '</div>' +
        '<div style="margin-top:14px">' + F.num('yearly_months_free', 'Yearly: months free (marketing text)', { int: true, max: 12 }) + '</div></section>' +
        '<section class="card"><div class="card-h"><div><h2>Voo Credits</h2><p>What credits are worth and what they buy.</p></div></div><div class="fg c2m">' + F.num('credit_value_usd', 'Credit value', { pre: '$', step: 0.001, req: true }) + F.num('extra_closer_credits', 'Extra Closer (credits)', { int: true }) + F.num('blast_people_per_credit', 'Blast: people per credit', { int: true, min: 1 }) + F.num('pro_brain_extra_credits', 'Pro Brain: extra credits / chat', { int: true }) + F.num('low_credit_threshold', 'Low-credit warning at', { int: true }) + F.num('signup_bonus_credits', 'Sign-up bonus credits', { int: true }) + F.num('referee_bonus_credits', 'Invited-friend bonus credits', { int: true }) + F.num('referral_min_payout_usd', 'Voo Squad: minimum cash withdrawal', { pre: '$', int: true, min: 0 }) + '</div></section>' +
        '<section class="card"><div class="card-h"><div><h2>Voo Squad tiers</h2><p>Referrers earn this share of what friends pay, once they have at least this many paying friends.</p></div><button type="button" class="btn btn-g btn-sm" data-tadd>' + ic('plus', 16) + 'Add tier</button></div><div id="tiers" class="el"></div></section>' +
        '<section class="card"><div class="card-h"><div><h2>Currencies</h2><p>Local prices are USD × rate.</p></div></div><div class="fg c2m">' + '<div id="pc"></div><div id="fc"></div>' + '</div><div class="lbl" style="margin:14px 0 8px">Exchange rates (1 USD =)</div><div id="rates" class="el"></div><div class="row-wrap" style="margin-top:8px"><input class="input" id="newCur" aria-label="New currency code" placeholder="EUR" maxlength="3" style="max-width:110px;text-transform:uppercase"><button type="button" class="btn btn-g btn-sm" data-radd>' + ic('plus', 16) + 'Add currency</button></div></section>' +
        '<section class="card" id="feeCard"><div class="card-h"><div><h2>Payment method fees</h2><p>Customer fee % per payment method, built into the price customers see for that method (no separate fee line). Credits and plans are always given at the base price; the fee is kept apart on each order.</p></div></div><div class="fg c2m">' +
          F.num('method_fees.bachs', 'Bachs · Customer fee %', { suf: '%', max: 50, step: 'any', hint: 'Third-party platform. 4% by default, in any currency (covers Bachs fees and FX risk).' }) +
          '<div class="f"><label for="feeGv">Gatevoo · Customer fee %</label><div class="affix rt"><input id="feeGv" type="number" value="0" readonly aria-describedby="feeGvh"><span class="r">%</span></div><span class="hint" id="feeGvh">Always 0%. Customers see “Pay with crypto and save” when another method costs more.</span></div>' +
          F.num('method_fees.paystack', 'Paystack · Customer fee %', { suf: '%', max: 50, step: 'any' }) +
          F.num('method_fees.flutterwave', 'Flutterwave · Customer fee %', { suf: '%', max: 50, step: 'any' }) +
          F.num('method_fees.crypto', 'Manual USDT · Customer fee %', { suf: '%', max: 50, step: 'any' }) +
          F.num('method_fees.demo', 'Demo checkout · Customer fee %', { suf: '%', max: 50, step: 'any', hint: 'Test mode only.' }) +
          '</div><p class="mut small" style="margin:10px 0 0">Joinvoo credits never carry a fee.</p></section>' +
        (gv ? '<section class="card gv-card"><div class="card-h"><div style="display:flex;gap:14px;align-items:center;min-width:0">' + RV.gatevooMark(44) + '<div><h2 style="margin:0">Gatevoo <span class="mut" style="font-weight:600">crypto checkout</span></h2><p>USDT and Bitcoin, straight to the Zedapex wallet. Orders activate on their own.</p></div></div>' +
          '<span class="pill ' + (gv.mode === 'live' ? 'p-ok' : gv.mode === 'sandbox' ? 'p-warn' : 'p-bad') + '">' + (gv.mode === 'live' ? 'Live' : gv.mode === 'sandbox' ? 'Sandbox' : 'Not connected') + '</span></div>' +
          F.tog('gatevoo_enabled', 'Offer crypto at checkout', 'Shows "Crypto · USDT or Bitcoin" to customers') +
          '<div class="fg c2m" style="margin-top:8px">' + F.tog('gatevoo_usdt', 'USDT', 'On TRON (TRC20)') + F.tog('gatevoo_btc', 'Bitcoin', 'On the Bitcoin network') + '</div>' +
          '<div class="gv-info"><div><span class="lbl">Webhook URL (paste into Gatevoo)</span><div class="row-wrap" style="gap:8px"><code class="gv-code">' + esc(gv.webhook_url) + '</code><button type="button" class="btn btn-g btn-sm" data-gvcopy>' + ic('copy', 16) + 'Copy</button></div></div>' +
          '<div class="mut small">' + (gv.mode === 'live' ? 'Keys are set on the server. Payments go through ' + esc(gv.api_url) + '.' : gv.mode === 'sandbox' ? 'Sandbox: customers see a practice Gatevoo checkout and no real coins move. Your programmer adds GATEVOO_API_KEY and GATEVOO_WEBHOOK_SECRET to go live.' : 'Ask your programmer to add GATEVOO_API_KEY and GATEVOO_WEBHOOK_SECRET (see docs/GATEVOO.md).') + '</div>' +
          '<div><button type="button" class="btn btn-ink btn-sm" data-gvtest>' + ic('bolt', 16) + 'Test connection</button> <span id="gvRes" class="small" role="status"></span></div></div></section>' : '') +
        '<section class="card"><div class="card-h"><div><h2>Manual USDT (backup)</h2><p>Only shown while Gatevoo is off. You confirm these by hand in Orders.</p></div></div>' + F.tog('crypto_enabled', 'Accept USDT', 'Shows a crypto option at checkout') + '<div class="fg" style="margin-top:8px">' + F.text('crypto_wallet', 'Wallet address', { max: 120 }) + F.text('crypto_network', 'Network', { max: 60, ph: 'USDT on TRC20' }) + '</div></section>' +
        '</div>';
      const curSel = () => {
        const opts = rates.map(x => [x.c, x.c]);
        $('#pc', page).innerHTML = F.sel('paystack_currency', 'Paystack currency', opts);
        $('#fc', page).innerHTML = F.sel('flutterwave_currency', 'Flutterwave currency', opts);
        RV.bind($('#pc', page), b); RV.bind($('#fc', page), b);
      };
      const drawTiers = () => {
        $('#tiers', page).innerHTML = b.referral_tiers.map((t, i) => '<div class="el-row" style="align-items:flex-end"><div class="f" style="flex:1"><label for="tm' + i + '">From paying friends</label><input id="tm' + i + '" type="number" min="0" step="1" inputmode="numeric" data-tm="' + i + '" value="' + t.min + '" required></div><div class="f" style="flex:1"><label for="tr' + i + '">Share</label><div class="affix rt"><input id="tr' + i + '" type="number" min="0" max="100" step="any" inputmode="decimal" data-tr="' + i + '" value="' + Math.round(t.rate * 10000) / 100 + '" required><span class="r">%</span></div></div><button type="button" class="ib" data-trm="' + i + '" aria-label="Remove tier ' + (i + 1) + '" style="margin-bottom:6px"' + (b.referral_tiers.length > 1 ? '' : ' disabled') + '>' + ic('trash', 16) + '</button></div>').join('');
      };
      const drawRates = () => {
        $('#rates', page).innerHTML = rates.map((x, i) => '<div class="el-row" style="align-items:center"><strong style="width:56px">' + esc(x.c) + '</strong><div class="affix" style="flex:1"><input class="input" type="number" min="0.000001" step="any" inputmode="decimal" data-rr="' + i + '" value="' + x.r + '" aria-label="' + esc(x.c) + ' per 1 USD" required ' + (x.c === 'USD' ? 'readonly' : '') + ' style="padding-left:14px"></div><button type="button" class="ib" data-rrm="' + i + '" aria-label="Remove ' + esc(x.c) + '"' + (BUILTIN.includes(x.c) ? ' disabled title="Built-in currency"' : '') + '>' + ic('trash', 16) + '</button></div>').join('');
      };
      RV.bind(page, b); curSel(); drawTiers(); drawRates();
      page.addEventListener('input', e => {
        const t = e.target;
        if (t.dataset.tm != null) b.referral_tiers[t.dataset.tm].min = Math.max(0, Math.trunc(Number(t.value) || 0));
        if (t.dataset.tr != null) b.referral_tiers[t.dataset.tr].rate = Math.round((Number(t.value) || 0) * 100) / 10000;
        if (t.dataset.rr != null) rates[t.dataset.rr].r = Number(t.value) || 0;
      });
      page.addEventListener('click', async e => {
        if (e.target.closest('[data-gvcopy]')) { RV.copy(gv.webhook_url, 'Webhook URL copied'); return; }
        const t = e.target.closest('[data-gvtest]');
        if (t) { const out = $('#gvRes', page); t.disabled = true; out.textContent = 'Checking…'; out.style.color = ''; try { const r = await RV.post('/api/admin/gatevoo/test'); out.textContent = r.message; out.style.color = r.ok ? '#1E6B3A' : '#9A2A12'; } catch (err) { out.textContent = err.message; out.style.color = '#9A2A12'; } t.disabled = false; return; }
      });
      page.addEventListener('click', e => {
        const x = e.target.closest('[data-tadd],[data-trm],[data-radd],[data-rrm]'); if (!x) return;
        if (x.dataset.tadd != null) { const last = b.referral_tiers[b.referral_tiers.length - 1] || { min: 0, rate: .2 }; b.referral_tiers.push({ min: last.min + 10, rate: Math.min(1, last.rate + .05) }); drawTiers(); }
        if (x.dataset.trm != null) { b.referral_tiers.splice(+x.dataset.trm, 1); drawTiers(); }
        if (x.dataset.radd != null) { const c = $('#newCur', page).value.trim().toUpperCase(); if (!/^[A-Z]{3}$/.test(c)) return RV.toast('Use a 3-letter currency code like EUR.', 'err'); if (rates.some(r => r.c === c)) return RV.toast(c + ' is already in the list.', 'err'); rates.push({ c, r: 1 }); $('#newCur', page).value = ''; drawRates(); curSel(); }
        if (x.dataset.rrm != null) { const c = rates[+x.dataset.rrm].c; if (b.paystack_currency === c || b.flutterwave_currency === c) return RV.toast(c + ' is used by a payment provider. Change that first.', 'err'); rates.splice(+x.dataset.rrm, 1); drawRates(); curSel(); }
        page.dispatchEvent(new Event('change'));
      });
      RV.watchPage(page, async () => {
        b.referral_tiers.sort((p, q) => p.min - q.min);
        if (b.referral_tiers.some(t => t.rate < 0 || t.rate > 1)) throw new Error('Referral shares must be between 0% and 100%.');
        b.rates = Object.fromEntries(rates.map(x => [x.c, x.r]));
        if (Object.values(b.rates).some(r => !(r > 0))) throw new Error('Exchange rates must be more than 0.');
        for (const k of Object.keys(b.method_fees)) { const n = b.method_fees[k] == null ? 0 : Number(b.method_fees[k]); if (!(n >= 0 && n <= 50)) throw new Error('Payment method fees must be between 0% and 50%.'); b.method_fees[k] = n; }
        b.method_fees.gatevoo = 0;
        if (b.crypto_enabled && !String(b.crypto_wallet || '').trim()) throw new Error('Add a wallet address before accepting USDT.');
        if (b.gatevoo_enabled !== false && b.gatevoo_usdt === false && b.gatevoo_btc === false) throw new Error('Turn on USDT or Bitcoin for Gatevoo, or switch crypto off.');
        await RV.saveSetting('billing', b); RV.toast('Billing rules saved');
      }, () => RV.render());
    }
  });

  /* ================= CONNECTIONS: VooSquare (Voo ID login) and Bachs (naira payments). Owners only. ================= */
  RV.route('connections', {
    async render(page, arg, stale) {
      const d = await RV.get('/api/admin/connections'); if (stale()) return;
      const v = d.voosquare, bx = d.bachs, wa = d.whatsapp, wr = d.whatsapp_rates;
      const src = s => s === 'admin' ? 'saved here' : s === 'env' ? 'from the server variables' : 'not set';
      const pill = (ok, on, off) => '<span class="pill ' + (ok ? 'p-ok' : 'p-warn') + '">' + (ok ? on : off) + '</span>';
      const secret = (id, label, has, hint, source, ph) => '<div class="f"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="password" autocomplete="new-password" placeholder="' + (has ? 'Saved ' + esc(hint) + ' (' + src(source) + '). Leave empty to keep it.' : esc(ph)) + '"></div>';
      const codeRow = (label, val) => '<div><span class="lbl">' + label + '</span><div class="row-wrap" style="gap:8px"><code class="gv-code">' + esc(val) + '</code><button type="button" class="btn btn-g btn-sm" data-copy="' + esc(val) + '">' + ic('copy', 16) + 'Copy</button></div></div>';
      page.innerHTML = RV.header('Connections', 'VooSquare login, Bachs naira payments and WhatsApp. Keys are stored encrypted and never shown again.') +
        '<div class="stack">' +
        '<section class="card" id="vsCard"><div class="card-h"><div><h2>VooSquare <span class="mut" style="font-weight:600">Voo ID login</span></h2><p>“Continue with VooSquare” next to the normal email login, VooSquare’s dashboard card, money events and support HQ.</p></div>' + pill(v.login, 'Login on', 'Login off') + '</div>' +
          '<div class="gv-info" style="margin-bottom:14px"><span class="lbl">Fill these in VooSquare → Admin → Products → Replyvoo</span>' + codeRow('URL', location.origin) + codeRow('Launch path', v.launch_path) + codeRow('Redirect URIs (one per line)', v.redirect_uri) + codeRow('', v.logout_uri) + codeRow('Summary URL', v.summary_url) + codeRow('Support webhook', v.support_webhook) + '</div>' +
          '<form id="vsForm" class="stack" style="gap:12px" novalidate>' +
          '<div class="sw"><div class="sw-t"><strong>Use VooSquare</strong><span>Off hides “Continue with VooSquare” and stops events. Replyvoo’s own login always works.</span></div><button type="button" class="tg" role="switch" id="vsOn" aria-checked="' + !!v.enabled + '"><span></span></button></div>' +
          '<div class="fg c2m"><div class="f"><label for="vsBase">VooSquare address</label><input id="vsBase" placeholder="https://voosquare.com" value="' + esc(v.base || '') + '"></div><div class="f"><label for="vsCid">Client ID</label><input id="vsCid" placeholder="vsc_…" value="' + esc(v.client_id || '') + '"></div></div>' +
          '<div class="fg c2m">' + secret('vsSec', 'Client secret', v.has_client_secret, v.client_secret_hint, v.sources.client_secret, 'vss_…') + secret('vsKey', 'API key', v.has_api_key, v.api_key_hint, v.sources.api_key, 'vsk_…') + '</div>' +
          secret('vsSig', 'Signal secret (make once, never change)', v.has_signal_secret, '', v.sources.signal_secret, 'A long random string, e.g. from openssl rand -hex 32') +
          '<div class="mut small">' + (v.env_off ? 'VOO_CONNECT=off is set on the server: VooSquare stays off until it is removed. ' : '') + 'Events waiting: ' + v.pending + ' · support messages waiting: ' + v.support_pending + ' · accounts with a Voo ID: ' + v.linked_users + (v.failed.length ? ' · refused events: ' + v.failed.length + ' (latest: ' + esc(v.failed[0].error) + ')' : '') + '</div>' +
          '<div class="row-wrap"><button class="btn btn-ink btn-sm" type="submit">Save VooSquare</button><button type="button" class="btn btn-g btn-sm" id="vsTest">' + ic('bolt', 16) + 'Test connection</button><span id="vsRes" class="small" role="status"></span></div></form></section>' +
        '<section class="card" id="bxCard"><div class="card-h"><div><h2>Bachs <span class="mut" style="font-weight:600">naira and African payments</span></h2><p>Cards, bank transfer, mobile money and USDT/USDC. Customers in Nigeria pay in naira at your rate; other countries in the list pay in US dollars.</p></div>' + pill(bx.on, 'Shown to customers', bx.configured ? 'Hidden' : 'Not connected') + '</div>' +
          '<div class="gv-info" style="margin-bottom:14px">' + codeRow('Webhook URL (paste into Bachs → Developer Portal → Webhooks)', bx.webhook_url) + '</div>' +
          '<form id="bxForm" class="stack" style="gap:12px" novalidate>' +
          '<div class="sw"><div class="sw-t"><strong>Show Bachs to customers</strong><span>Needs both keys. Sandbox (test) keys are never shown to customers.</span></div><button type="button" class="tg" role="switch" id="bxOn" aria-checked="' + !!bx.enabled + '"><span></span></button></div>' +
          '<div class="fg c2m">' + secret('bxKey', 'Secret key', bx.has_key, bx.key_hint, bx.key_source, 'sk_live_…') + secret('bxHook', 'Webhook signing secret', bx.has_webhook_secret, bx.webhook_hint, bx.webhook_source, 'whsec_…') + '</div>' +
          '<div class="fg c2m"><div class="f"><label for="bxRate">Naira rate (₦ per $1)</label><input id="bxRate" type="number" min="0" step="any" inputmode="decimal" value="' + (bx.ngn_rate || '') + '" placeholder="' + (bx.ngn_rate_used || '') + ' (Billing rules)"><span class="hint">Empty or 0 uses Billing rules → Currencies → NGN (now ₦' + (bx.ngn_rate_used || 0) + ').</span></div>' +
          '<div class="f"><label for="bxCountries">Countries that see Bachs</label><input id="bxCountries" value="' + esc((bx.countries || []).join(', ')) + '"><span class="hint">2-letter codes. Customers whose country we don’t know also see it (in US dollars).</span></div></div>' +
          '<div class="fg c2m"><div class="f"><label for="bxMax">Bachs max per payment (USD)</label><input id="bxMax" type="number" min="0" step="any" inputmode="decimal" value="' + (bx.max_usd || '') + '" placeholder="' + (bx.max_usd_used || 5000) + '"><span class="hint">Final total with the Bachs fee (naira counted at the rate above). Bigger payments never go to Bachs: customers pay in parts or pick another method. Empty uses BACHS_MAX_USD, else 5000 (now $' + Number(bx.max_usd_used || 5000).toLocaleString('en-US') + ').</span></div></div>' +
          (bx.sandbox_blocked ? '<div class="warn">' + ic('warn', 18) + '<span>This is a sandbox key, so customers don’t see Bachs. Save your sk_live_ key to go live.</span></div>' : '') +
          '<div class="row-wrap"><button class="btn btn-ink btn-sm" type="submit">Save Bachs</button><button type="button" class="btn btn-g btn-sm" id="bxTest">' + ic('bolt', 16) + 'Test key</button><span id="bxRes" class="small" role="status"></span></div></form></section>' +
        // WhatsApp: Meta's WhatsApp Business Platform (Cloud API). Customers see it as Live only when configured AND on.
        '<section class="card" id="waCard"><div class="card-h"><div><h2>WhatsApp <span class="mut" style="font-weight:600">Meta WhatsApp Business Platform</span></h2><p>Customers connect their own WhatsApp Business number with Embedded Signup. Meta bills their WhatsApp account for template messages, never Replyvoo. Steps: docs/WHATSAPP.md.</p></div>' + pill(wa.on, 'Live for customers', wa.configured ? 'Coming soon (switched off)' : 'Coming soon (not set up)') + '</div>' +
          '<div class="gv-info" style="margin-bottom:14px">' + codeRow('Webhook callback URL (Meta app → WhatsApp → Configuration)', wa.webhook_url) + (wa.verify_token ? codeRow('Verify token (paste the same value in Meta)', wa.verify_token) : '') + codeRow('Webhook fields to subscribe', wa.webhook_fields.join(', ')) + codeRow('Permissions for App Review', wa.permissions.join(', ')) + '</div>' +
          '<form id="waForm" class="stack" style="gap:12px" novalidate>' +
          '<div class="sw"><div class="sw-t"><strong>Switch WhatsApp on for customers</strong><span>Off (or keys missing) = the site and dashboards show WhatsApp as “Coming soon”. On = Live everywhere: Channels, pricing and the channel pages.' + (wa.forced ? ' WHATSAPP_ENABLED is set on the server, so this switch follows it.' : '') + '</span></div><button type="button" class="tg" role="switch" id="waOn" aria-checked="' + !!wa.enabled + '"' + (wa.forced ? ' disabled' : '') + '><span></span></button></div>' +
          '<div class="fg c2m"><div class="f"><label for="waApp">Meta App ID</label><input id="waApp" inputmode="numeric" value="' + esc(wa.app_id || '') + '" placeholder="From developers.facebook.com → your app"></div>' + secret('waSec', 'App Secret', wa.has_app_secret, wa.app_secret_hint, wa.sources.app_secret, 'App settings → Basic → App secret') + '</div>' +
          '<div class="fg c2m"><div class="f"><label for="waCfg">Embedded Signup configuration ID</label><input id="waCfg" inputmode="numeric" value="' + esc(wa.config_id || '') + '" placeholder="Facebook Login for Business → Configurations"><span class="hint">Without it, customers can only connect under Advanced with their own token.</span></div>' +
          '<div class="f"><label for="waVer">Graph API version</label><input id="waVer" value="' + esc(wa.sources.graph_version === 'default' ? '' : wa.graph_version) + '" placeholder="' + esc(wa.default_version) + ' (default)"></div></div>' +
          '<div class="f"><label for="waVt">Webhook verify token</label><div class="row-wrap" style="gap:8px"><input id="waVt" type="password" autocomplete="new-password" style="flex:1 1 240px" placeholder="' + (wa.has_verify_token ? 'Saved (' + src(wa.sources.verify_token) + '). Leave empty to keep it.' : 'Any long random text, or press Generate') + '"><button type="button" class="btn btn-g btn-sm" id="waGen">Generate</button></div></div>' +
          '<div class="mut small">Connected numbers: ' + wa.numbers + '</div>' +
          '<div class="row-wrap"><button class="btn btn-ink btn-sm" type="submit">Save WhatsApp</button><button type="button" class="btn btn-g btn-sm" id="waTest">' + ic('bolt', 16) + 'Test app keys</button><span id="waRes" class="small" role="status"></span></div></form>' +
          '<div class="stack" style="gap:10px;margin-top:18px"><h3 style="margin:0;font-size:16px">Meta’s price per template message (US dollars)</h3>' +
          '<p class="mut small" style="margin:0;overflow-wrap:anywhere">Only used for the estimate customers see before a WhatsApp Blast. Meta bills the customer’s own WhatsApp account. ' + esc(wr.note) + (wr.checked_at ? ' Last checked ' + esc(new Date(wr.checked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })) + '.' : '') + ' <a href="' + esc(wr.source) + '" target="_blank" rel="noopener">Meta’s pricing page</a></p>' +
          (wr.estimate ? '<div class="warn">' + ic('warn', 18) + '<span>These are seeded estimates. Check them against Meta’s rate card, then save with “I checked these”.</span></div>' : '') +
          '<div style="overflow-x:auto"><table class="tbl" id="waRates"><thead><tr><th>Code</th><th>Market</th><th>Marketing</th><th>Utility</th><th>Login code</th><th></th></tr></thead><tbody></tbody></table></div>' +
          '<div class="row-wrap"><button type="button" class="btn btn-g btn-sm" id="waAddRate">' + ic('plus', 16) + 'Add a country</button><label class="row-wrap small" style="gap:6px"><input type="checkbox" id="waChecked"> I checked these against Meta’s rate card today</label><button type="button" class="btn btn-ink btn-sm" id="waSaveRates">Save prices</button></div>' +
          '<p class="mut small" style="margin:0">Codes: 2-letter country codes, XAF = every other African country, * = every other country (required).</p></div></section>' +
        '</div>';
      const tg = el => el.addEventListener('click', () => el.setAttribute('aria-checked', el.getAttribute('aria-checked') === 'true' ? 'false' : 'true'));
      tg($('#vsOn', page)); tg($('#bxOn', page));
      const val = id => $('#' + id, page).value.trim();
      const res = (id, ok, msg) => { const o = $('#' + id, page); o.textContent = msg; o.style.color = ok ? '#1E6B3A' : '#9A2A12'; };
      page.addEventListener('click', e => { const c = e.target.closest('[data-copy]'); if (c) RV.copy(c.dataset.copy, 'Copied'); });
      $('#vsForm', page).addEventListener('submit', async e => {
        e.preventDefault();
        try { await RV.put('/api/admin/connections/voosquare', { enabled: $('#vsOn', page).getAttribute('aria-checked') === 'true', base: val('vsBase'), client_id: val('vsCid'), client_secret: val('vsSec'), api_key: val('vsKey'), signal_secret: val('vsSig') }); RV.toast('VooSquare saved'); RV.render(); }
        catch (err) { RV.fail(err); }
      });
      $('#vsTest', page).addEventListener('click', async () => { res('vsRes', true, 'Checking…'); try { const r = await RV.post('/api/admin/connections/voosquare/test'); res('vsRes', r.ok, r.message); } catch (err) { res('vsRes', false, err.message); } });
      $('#bxForm', page).addEventListener('submit', async e => {
        e.preventDefault();
        try { await RV.put('/api/admin/connections/bachs', { enabled: $('#bxOn', page).getAttribute('aria-checked') === 'true', secret_key: val('bxKey'), webhook_secret: val('bxHook'), ngn_rate: Number(val('bxRate')) || 0, max_usd: val('bxMax') === '' ? null : Number(val('bxMax')), countries: val('bxCountries') }); RV.toast('Bachs saved'); RV.render(); }
        catch (err) { RV.fail(err); }
      });
      $('#bxTest', page).addEventListener('click', async () => { res('bxRes', true, 'Checking…'); try { const r = await RV.post('/api/admin/connections/bachs/test'); res('bxRes', r.ok, r.message); } catch (err) { res('bxRes', false, err.message); } });
      // WhatsApp
      if (!wa.forced) tg($('#waOn', page));
      let genVt = false;
      $('#waGen', page).addEventListener('click', () => { genVt = true; $('#waVt', page).value = ''; $('#waVt', page).placeholder = 'A new token is made when you save. It appears above, ready to copy.'; });
      $('#waForm', page).addEventListener('submit', async e => {
        e.preventDefault();
        try { await RV.put('/api/admin/connections/whatsapp', { enabled: $('#waOn', page).getAttribute('aria-checked') === 'true', app_id: val('waApp'), app_secret: val('waSec'), config_id: val('waCfg'), graph_version: val('waVer'), verify_token: val('waVt'), generate_verify_token: genVt && !val('waVt') }); RV.toast('WhatsApp saved'); RV.render(); }
        catch (err) { RV.fail(err); }
      });
      $('#waTest', page).addEventListener('click', async () => { res('waRes', true, 'Checking…'); try { const r = await RV.post('/api/admin/connections/whatsapp/test'); res('waRes', r.ok, r.message); } catch (err) { res('waRes', false, err.message); } });
      let rows = wr.rows.map(r => ({ ...r }));
      const paintRates = () => {
        $('#waRates tbody', page).innerHTML = rows.map((r, i) => '<tr><td><input data-rk="code" data-ri="' + i + '" value="' + esc(r.code) + '" style="width:64px" aria-label="Code"></td><td><input data-rk="name" data-ri="' + i + '" value="' + esc(r.name) + '" aria-label="Market"></td>' +
          ['marketing', 'utility', 'authentication'].map(k => '<td><input data-rk="' + k + '" data-ri="' + i + '" type="number" min="0" step="0.0001" inputmode="decimal" value="' + r[k] + '" style="width:96px" aria-label="' + k + '"></td>').join('') +
          '<td><button type="button" class="btn btn-g btn-sm" data-rdel="' + i + '" aria-label="Remove">' + ic('trash', 16) + '</button></td></tr>').join('');
      };
      paintRates();
      $('#waRates', page).addEventListener('input', e => { const x = e.target.closest('[data-rk]'); if (!x) return; const r = rows[+x.dataset.ri]; r[x.dataset.rk] = x.type === 'number' ? Number(x.value) : x.value; });
      $('#waRates', page).addEventListener('click', e => { const x = e.target.closest('[data-rdel]'); if (!x) return; rows.splice(+x.dataset.rdel, 1); paintRates(); });
      $('#waAddRate', page).addEventListener('click', () => { rows.splice(rows.length - 1, 0, { code: '', name: '', marketing: 0, utility: 0, authentication: 0 }); paintRates(); });
      $('#waSaveRates', page).addEventListener('click', async () => { try { await RV.put('/api/admin/connections/whatsapp/rates', { rows, checked: $('#waChecked', page).checked }); RV.toast('Prices saved'); RV.render(); } catch (err) { RV.fail(err); } });
    }
  });

    /* ================= COMPANY, SEO, JOINVOO ================= */
  RV.route('company', {
    async render(page, arg, stale) {
      const s = await RV.settings(true); if (stale()) return;
      const d = { company: clone(s.company), seo: clone(s.seo), joinvoo: clone(s.joinvoo), ai: clone(s.ai) };
      const orig = JSON.stringify(d);
      page.innerHTML = RV.header('Company, SEO & Joinvoo', 'Your details, how Google shows you, the Joinvoo promo and the website chat bot.') +
        '<div class="stack">' +
        '<section class="card"><div class="card-h"><div><h2>Company</h2><p>Used in emails, legal pages and the footer.</p></div></div><div class="fg c2">' + F.text('company.product', 'Product name', { req: true, max: 60 }) + F.text('company.legal_name', 'Legal name', { req: true, max: 80 }) + F.text('company.address', 'Address', { max: 160 }) + F.text('company.support_email', 'Support email', { type: 'email', req: true, max: 120 }) + F.text('company.legal_email', 'Legal email', { type: 'email', max: 120 }) + F.text('company.privacy_email', 'Privacy email', { type: 'email', max: 120 }) + F.text('company.logo_url', 'Logo URL (emails)', { type: 'url', max: 300, ph: 'https://…' }) + F.text('company.telegram_support', 'Telegram support link', { max: 120, ph: 'https://t.me/…' }) + F.text('company.twitter', 'X / Twitter handle', { max: 60, ph: '@replyvoo' }) + '</div></section>' +
        '<section class="card"><div class="card-h"><div><h2>SEO</h2><p>How the homepage looks on Google and when shared.</p></div></div><div class="split"><div class="fg">' + F.text('seo.title', 'Page title', { max: 120, req: true, hint: '<span id="tLen"></span>' }) + F.area('seo.description', 'Meta description', { rows: 3, max: 320, hint: '<span id="dLen"></span>' }) + F.text('seo.keywords', 'Keywords', { max: 300 }) + '<div class="fg c2m">' + F.text('seo.og_image', 'Share image', { max: 300, ph: '/img/og.png' }) + F.text('seo.twitter_handle', 'X handle', { max: 60 }) + '</div></div><div class="sticky"><div class="preview-lbl">' + ic('search', 14) + 'Google preview</div><div id="serp"></div></div></div></section>' +
        '<section class="card"><div class="card-h"><div><h2>Joinvoo</h2><p>Promo for our sister product inside dashboards.</p></div></div>' + F.tog('joinvoo.enabled', 'Show Joinvoo promo') + '<div class="fg" style="margin-top:8px">' + F.text('joinvoo.url', 'Joinvoo URL', { type: 'url', max: 200 }) + F.text('joinvoo.utm', 'UTM parameters', { max: 200 }) + F.text('joinvoo.headline', 'Headline', { max: 140 }) + F.area('joinvoo.pitch', 'Pitch', { rows: 3, max: 600 }) + '</div></section>' +
        '<section class="card"><div class="card-h"><div><h2>Website chat bot</h2><p>Instructions for Juno, the chat bubble on the marketing site.</p></div></div>' + F.area('ai.support_bot_prompt', 'Bot instructions', { rows: 6, max: 4000 }) + '</section>' +
        '</div>';
      const serp = () => {
        const host = (location.host || 'replyvoo.com');
        $('#serp', page).innerHTML = '<div class="serp"><div class="u"><i>' + RV.LOGO.replace('logo-mark', '').replace(/width="20" height="20"/, 'width="14" height="14"') + '</i><span><span style="display:block;font-size:14px">' + esc(d.company.product) + '</span><span style="color:#4d5156">https://' + esc(host) + '</span></span></div><div class="t">' + esc((d.seo.title || '').slice(0, 65)) + ((d.seo.title || '').length > 65 ? '…' : '') + '</div><div class="d">' + esc((d.seo.description || '').slice(0, 160)) + ((d.seo.description || '').length > 160 ? '…' : '') + '</div></div>';
        const tl = (d.seo.title || '').length, dl = (d.seo.description || '').length;
        $('#tLen', page).textContent = tl + ' characters' + (tl > 60 ? ' · Google may cut it after ~60' : '');
        $('#dLen', page).textContent = dl + ' characters' + (dl > 160 ? ' · Google may cut it after ~160' : '');
      };
      RV.bind(page, d, serp); serp();
      RV.watchPage(page, async () => {
        const o = JSON.parse(orig); let n = 0;
        for (const k of ['company', 'seo', 'joinvoo', 'ai']) if (JSON.stringify(o[k]) !== JSON.stringify(d[k])) { await RV.saveSetting(k, d[k]); n++; }
        RV.toast(n ? 'Saved' : 'Nothing changed');
        RV.render();
      }, () => RV.render());
    }
  });
})();
