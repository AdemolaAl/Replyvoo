/* Replyvoo admin: Support desk. Boxes on the left, tickets in the middle, the conversation on the right.
   On phones the conversation slides over the list. Polls every 8 seconds while open. */
(function () {
  'use strict';
  const RV = window.RV, { $, esc, ic, ago } = RV;

  const SRC_IC = { web_chat: 'chat', telegram: 'send', dashboard: 'layout', contact: 'mail', sales: 'tag', email: 'mail', voosquare: 'grid' };
  const PRI = { normal: ['Normal', ''], high: ['High', 'hi'], urgent: ['Urgent', 'ur'] };
  const STATUS = { open: 'Open', pending: 'Waiting on customer', solved: 'Solved' };
  const initials = s => String(s || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('') || '?';
  const avBg = s => ['#FFE9A6', '#DDE8FF', '#DFF5E8', '#FFE1D6', '#EFE3FF'][[...String(s || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 5];
  const when = iso => { const d = new Date(iso); const today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' }); };
  const textHtml = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');

  RV.route('support', {
    async render(page, arg, stale) {
      const st = { view: 'all', box: '', status: 'active', q: '', ref: arg || '', list: [], desk: null, ticket: null, mode: 'reply', timer: null, latest: '' };
      st.desk = await RV.get('/api/admin/support/desk');
      if (stale()) return;
      const D = st.desk;
      const canEdit = D.me.can_edit;

      page.innerHTML =
        '<div class="desk" id="desk">' +
        '<aside class="dk-rail" aria-label="Support views">' +
          '<div class="dk-rail-h"><strong>Support</strong>' + (D.me.can_manage ? '<button class="ib ghost" id="dkSet" title="Desk settings" aria-label="Desk settings">' + ic('toggle', 18) + '</button>' : '') + '</div>' +
          '<div class="dk-views" id="dkViews"></div>' +
          '<div class="dk-sub">Boxes</div><div class="dk-boxes" id="dkBoxes"></div>' +
          '<div class="dk-chan">' + chanHtml(D) + '</div>' +
        '</aside>' +
        '<section class="dk-list" aria-label="Tickets">' +
          '<div class="dk-search"><span>' + ic('search', 17) + '</span><input type="search" id="dkQ" placeholder="Search tickets, names, emails" aria-label="Search tickets"></div>' +
          '<div class="dk-tabs" role="tablist"><button data-st="active" class="on">Active</button><button data-st="pending">Waiting</button><button data-st="solved">Solved</button></div>' +
          '<div class="dk-items" id="dkItems"></div>' +
        '</section>' +
        '<section class="dk-conv" id="dkConv" aria-label="Conversation"></section>' +
        '</div>';

      const drawRail = () => {
        const c = D.counts;
        const views = [['all', 'All tickets', 'inbox', c.open + c.pending], ['mine', 'Assigned to me', 'users', c.mine], ['unassigned', 'Unassigned', 'flag', c.unassigned]];
        $('#dkViews', page).innerHTML = views.map(v => '<button class="dk-v' + (st.view === v[0] && !st.box ? ' on' : '') + '" data-view="' + v[0] + '">' + ic(v[2], 17) + '<span>' + v[1] + '</span><b>' + (v[3] || '') + '</b></button>').join('');
        const byBox = Object.fromEntries((c.boxes || []).map(b => [b.box_id, b]));
        $('#dkBoxes', page).innerHTML = D.boxes.filter(b => b.active).map(b => { const n = byBox[b.id] || {}; return '<button class="dk-v' + (String(st.box) === String(b.id) ? ' on' : '') + '" data-box="' + b.id + '"><span class="dk-dot" style="background:' + esc(b.color) + '"></span><span>' + esc(b.name) + '</span>' + (n.u ? '<i class="dk-new">' + n.u + '</i>' : '') + '<b>' + (n.n || '') + '</b></button>'; }).join('') || '<p class="mut" style="font-size:13px;margin:4px 10px">No boxes yet.</p>';
        RV.setSupport(c.unread);
      };

      const drawList = () => {
        const el = $('#dkItems', page);
        if (!st.list.length) {
          el.innerHTML = '<div class="dk-empty">' + emptyArt() + '<strong>' + (st.q ? 'No tickets match “' + esc(st.q) + '”' : st.status === 'solved' ? 'Nothing solved here yet' : 'All caught up') + '</strong><span>' + (st.status === 'solved' ? 'Solved tickets show up here.' : 'New messages from the website, Telegram, the dashboard and email land here.') + '</span></div>';
          return;
        }
        el.innerHTML = st.list.map((t, i) => '<button class="dk-item' + (t.ref === st.ref ? ' on' : '') + (t.unread ? ' unread' : '') + '" data-ref="' + esc(t.ref) + '" style="animation-delay:' + Math.min(i, 12) * 0.025 + 's">' +
          '<span class="dk-av" style="background:' + avBg(t.requester.name || t.requester.email) + '">' + esc(initials(t.requester.name || t.requester.email || t.requester.telegram)) + '<i class="dk-src">' + ic(SRC_IC[t.source] || 'chat', 11, 2.4) + '</i></span>' +
          '<span class="dk-it"><span class="dk-row"><strong>' + esc(t.requester.name || t.requester.email || t.requester.telegram || 'Visitor') + '</strong><time>' + when(t.last_message_at) + '</time></span>' +
          '<span class="dk-subj">' + (t.priority !== 'normal' ? '<em class="dk-pri ' + PRI[t.priority][1] + '">' + PRI[t.priority][0] + '</em>' : '') + esc(t.subject || '(no subject)') + '</span>' +
          '<span class="dk-snip">' + esc(t.last_text) + '</span>' +
          '<span class="dk-meta">' + (t.box ? '<span class="dk-tag"><i style="background:' + esc(t.box.color) + '"></i>' + esc(t.box.name) + '</span>' : '') + (t.assignee ? '<span class="dk-tag">' + esc(t.assignee.name.split(' ')[0]) + '</span>' : '<span class="dk-tag un">Unassigned</span>') + '<span class="dk-ref">' + esc(t.ref) + '</span></span></span>' +
          (t.unread ? '<span class="dk-udot" aria-label="Unread"></span>' : '') + '</button>').join('');
      };

      const loadList = async () => {
        const p = new URLSearchParams({ status: st.status, view: st.box ? 'all' : st.view, box: st.box, q: st.q });
        const r = await RV.get('/api/admin/support/tickets?' + p);
        if (stale()) return;
        st.list = r.tickets; drawList();
      };
      const loadCounts = async () => { const r = await RV.get('/api/admin/support/poll'); if (stale()) return; D.counts = r.counts; drawRail(); return r.latest; };

      /* ---------- conversation ---------- */
      const drawEmptyConv = () => { $('#dkConv', page).innerHTML = '<div class="dk-pick">' + pickArt() + '<strong>Pick a ticket</strong><span>Replies go back the way the customer wrote in: Telegram, email or their dashboard.</span></div>'; };
      const openTicket = async (ref, { quiet = false } = {}) => {
        st.ref = ref;
        if (!quiet) { $('#dkConv', page).innerHTML = '<div class="dk-load"><span class="skel" style="height:58px"></span><span class="skel" style="height:90px;width:70%"></span><span class="skel" style="height:70px;width:60%;align-self:flex-end"></span></div>'; $('#desk', page).classList.add('open'); }
        history.replaceState({}, '', '/admin/support/' + encodeURIComponent(ref));
        const t = await RV.get('/api/admin/support/tickets/' + encodeURIComponent(ref));
        if (stale() || st.ref !== ref) return;
        const prevCount = st.ticket && st.ticket.ref === ref ? st.ticket.messages.length : -1;
        st.ticket = t;
        drawConv(prevCount);
        const row = st.list.find(x => x.ref === ref); if (row && row.unread) { row.unread = 0; drawList(); }
        page.querySelectorAll('.dk-item').forEach(b => b.classList.toggle('on', b.dataset.ref === ref));
      };

      const drawConv = (prevCount = -1) => {
        const t = st.ticket; const el = $('#dkConv', page);
        const keepDraft = $('#dkText', page) ? $('#dkText', page).value : '';
        const assignOpts = '<option value="">Unassigned</option>' + D.staff.map(p => '<option value="' + p.id + '"' + (t.assignee && t.assignee.id === p.id ? ' selected' : '') + '>' + esc(p.name) + (p.id === D.me.id ? ' (me)' : '') + (p.online ? ' •' : '') + '</option>').join('');
        const boxOpts = D.boxes.map(b => '<option value="' + b.id + '"' + (t.box && t.box.id === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('');
        const a = t.account;
        let lastDay = '';
        const msgs = t.messages.map((m, i) => {
          const day = new Date(m.created_at).toDateString();
          const sep = day !== lastDay ? '<div class="dk-day"><span>' + (day === new Date().toDateString() ? 'Today' : new Date(m.created_at).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })) + '</span></div>' : '';
          lastDay = day;
          const fresh = prevCount >= 0 && i >= prevCount ? ' fresh' : '';
          if (m.dir === 'system') return sep + '<div class="dk-sys' + fresh + '">' + esc(m.text) + ' · ' + when(m.created_at) + '</div>';
          const who = m.dir === 'in' ? (m.author_name || t.requester.name || 'Customer') : m.author_name || 'Team';
          return sep + '<div class="dk-msg ' + m.dir + fresh + '"><div class="dk-bub">' + (m.dir === 'note' ? '<span class="dk-nl">' + ic('note', 13) + 'Internal note</span>' : '') + textHtml(m.text) + '</div><div class="dk-mm">' + esc(who) + ' · ' + when(m.created_at) + (m.dir === 'out' && m.via ? ' · via ' + esc(m.via === 'web_chat' ? 'email' : m.via) : '') + (m.failed ? ' · <span class="dk-fail">not delivered</span>' : '') + '</div></div>';
        }).join('');
        el.innerHTML =
          '<header class="dk-ch"><button class="ib ghost dk-back" id="dkBack" aria-label="Back to tickets">' + ic('left', 20) + '</button>' +
            '<div class="dk-cht"><strong>' + esc(t.subject || '(no subject)') + '</strong><span><span class="dk-ref">' + esc(t.ref) + '</span> · ' + ic(SRC_IC[t.source] || 'chat', 12) + ' ' + esc(t.source_name) + ' · opened ' + ago(t.created_at) + '</span></div>' +
            '<div class="dk-seg" role="group" aria-label="Status">' + Object.keys(STATUS).map(s => '<button data-status="' + s + '" class="' + (t.status === s ? 'on ' + s : '') + '"' + (canEdit ? '' : ' disabled') + '>' + (s === 'pending' ? 'Waiting' : STATUS[s]) + '</button>').join('') + '</div></header>' +
          '<div class="dk-ctl">' +
            '<label class="dk-sel">' + ic('users', 15) + '<select id="dkAssign" aria-label="Assignee"' + (canEdit ? '' : ' disabled') + '>' + assignOpts + '</select></label>' +
            (canEdit && (!t.assignee || t.assignee.id !== D.me.id) ? '<button class="btn btn-g btn-sm" id="dkMine">Assign to me</button>' : '') +
            '<label class="dk-sel">' + ic('box', 15) + '<select id="dkBox" aria-label="Box"' + (canEdit ? '' : ' disabled') + '>' + boxOpts + '</select></label>' +
            '<label class="dk-sel">' + ic('flag', 15) + '<select id="dkPri" aria-label="Priority"' + (canEdit ? '' : ' disabled') + '>' + Object.keys(PRI).map(p => '<option value="' + p + '"' + (t.priority === p ? ' selected' : '') + '>' + PRI[p][0] + '</option>').join('') + '</select></label>' +
          '</div>' +
          '<div class="dk-who"><span class="dk-av lg" style="background:' + avBg(t.requester.name || t.requester.email) + '">' + esc(initials(t.requester.name || t.requester.email || t.requester.telegram)) + '</span><span class="dk-whot"><strong>' + esc(t.requester.name || 'Visitor') + '</strong><span>' + esc([t.requester.email, t.requester.telegram].filter(Boolean).join(' · ') || 'No contact details') + '</span></span>' +
            (a && a.workspace ? '<a class="dk-acct" href="/admin/users/ws/' + a.workspace.id + '"><span>' + esc(a.workspace.name) + '</span><b>' + esc(a.plan || a.workspace.plan_id) + ' · $' + Math.round(a.paid_usd) + ' paid · ' + a.channels + ' channel' + (a.channels === 1 ? '' : 's') + '</b></a>' : '') +
            (t.history && t.history.length ? '<span class="dk-hist">' + t.history.length + ' earlier ticket' + (t.history.length === 1 ? '' : 's') + '</span>' : '') + '</div>' +
          '<div class="dk-msgs" id="dkMsgs">' + msgs + '</div>' +
          (canEdit ? '<form class="dk-comp ' + st.mode + '" id="dkComp" novalidate>' +
            '<div class="dk-mode"><button type="button" data-mode="reply" class="' + (st.mode === 'reply' ? 'on' : '') + '">Reply</button><button type="button" data-mode="note" class="' + (st.mode === 'note' ? 'on' : '') + '">Internal note</button><span class="dk-to">' + (st.mode === 'note' ? 'Only your team sees notes' : 'Goes to ' + esc(replyTarget(t))) + '</span></div>' +
            '<textarea id="dkText" rows="3" placeholder="' + (st.mode === 'note' ? 'Write a note for the team…' : 'Write your reply… (Ctrl+Enter to send)') + '"></textarea>' +
            '<div class="dk-tools">' +
              '<div class="dk-menu"><button type="button" class="btn btn-g btn-sm" id="dkSaved">' + ic('doc', 15) + 'Saved replies</button><div class="dk-pop" id="dkPop" hidden>' + (D.replies.length ? D.replies.map(r => '<button type="button" data-saved="' + r.id + '"><strong>' + esc(r.title) + '</strong><span>' + esc(r.text.slice(0, 90)) + '</span></button>').join('') : '<p class="mut" style="margin:8px">No saved replies yet.</p>') + '</div></div>' +
              (D.settings.ai_drafts ? '<button type="button" class="btn btn-g btn-sm dk-ai" id="dkAi">' + ic('spark', 15) + 'AI draft</button>' : '') +
              '<span class="sp"></span>' +
              '<button type="button" class="btn btn-g btn-sm" id="dkSolve" title="Send and mark solved">Send &amp; solve</button>' +
              '<button type="submit" class="btn btn-y btn-sm" id="dkSend">' + ic('send', 15) + 'Send</button>' +
            '</div></form>' : '<div class="dk-ro">' + ic('eye', 15) + 'You can read tickets but not reply. Ask an owner for edit access.</div>');
        const m = $('#dkMsgs', page); m.scrollTop = m.scrollHeight;
        const ta = $('#dkText', page);
        if (ta) { ta.value = keepDraft; autosize(ta); }
        wireConv();
      };
      const replyTarget = t => t.source === 'telegram' ? 'Telegram' : t.source === 'dashboard' ? 'their Replyvoo dashboard' : t.requester.email ? t.requester.email : 'the customer';
      const autosize = ta => { const f = () => { ta.style.height = 'auto'; ta.style.height = Math.min(260, ta.scrollHeight) + 'px'; }; ta.addEventListener('input', f); f(); };

      const save = async patch => {
        try { const r = await RV.put('/api/admin/support/tickets/' + encodeURIComponent(st.ticket.ref), patch); st.ticket = { ...r.ticket, account: st.ticket.account, history: st.ticket.history }; drawConv(st.ticket.messages.length - 1); await Promise.all([loadList(), loadCounts()]); }
        catch (e) { RV.fail(e); drawConv(); }
      };
      const send = async (solve) => {
        const ta = $('#dkText', page); const text = ta.value.trim();
        if (!text) { ta.focus(); ta.classList.remove('shake'); void ta.offsetWidth; ta.classList.add('shake'); return; }
        const btn = $('#dkSend', page); btn.disabled = true; $('#dkSolve', page).disabled = true;
        try {
          const r = await RV.post('/api/admin/support/tickets/' + encodeURIComponent(st.ticket.ref) + '/reply', { text, note: st.mode === 'note', status: solve ? 'solved' : undefined });
          ta.value = '';
          const prev = st.ticket.messages.length;
          st.ticket = { ...r.ticket, account: st.ticket.account, history: st.ticket.history };
          drawConv(prev);
          if (r.error) RV.toast(r.error, 'err'); else RV.toast(st.mode === 'note' ? 'Note added' : solve ? 'Sent and solved' : 'Reply sent');
          loadList(); loadCounts();
        } catch (e) { RV.fail(e); btn.disabled = false; $('#dkSolve', page).disabled = false; }
      };
      const wireConv = () => {
        const c = $('#dkConv', page);
        $('#dkBack', page).onclick = () => { $('#desk', page).classList.remove('open'); st.ref = ''; history.replaceState({}, '', '/admin/support'); page.querySelectorAll('.dk-item').forEach(b => b.classList.remove('on')); };
        c.querySelectorAll('[data-status]').forEach(b => b.onclick = () => { if (st.ticket.status !== b.dataset.status) save({ status: b.dataset.status }); });
        const as = $('#dkAssign', page); if (as) as.onchange = () => save({ assignee_id: as.value ? Number(as.value) : null });
        const mine = $('#dkMine', page); if (mine) mine.onclick = () => save({ assignee_id: D.me.id });
        const bx = $('#dkBox', page); if (bx) bx.onchange = () => save({ box_id: Number(bx.value) });
        const pr = $('#dkPri', page); if (pr) pr.onchange = () => save({ priority: pr.value });
        const form = $('#dkComp', page); if (!form) return;
        form.onsubmit = e => { e.preventDefault(); send(false); };
        $('#dkSolve', page).onclick = () => send(true);
        $('#dkText', page).addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(false); } });
        form.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { st.mode = b.dataset.mode; drawConv(); $('#dkText', page).focus(); });
        const pop = $('#dkPop', page);
        $('#dkSaved', page).onclick = e => { e.stopPropagation(); pop.hidden = !pop.hidden; };
        pop.onclick = e => { const b = e.target.closest('[data-saved]'); if (!b) return; const r = D.replies.find(x => String(x.id) === b.dataset.saved); const ta = $('#dkText', page); const name = (st.ticket.requester.name || '').split(' ')[0] || 'there'; ta.value = (ta.value ? ta.value + '\n\n' : '') + r.text.replace(/\{\{\s*name\s*\}\}/g, name); ta.dispatchEvent(new Event('input')); pop.hidden = true; ta.focus(); };
        const ai = $('#dkAi', page);
        if (ai) ai.onclick = async () => {
          ai.classList.add('busy'); ai.disabled = true;
          try { const r = await RV.post('/api/admin/support/tickets/' + encodeURIComponent(st.ticket.ref) + '/draft'); const ta = $('#dkText', page); if (st.mode !== 'reply') { st.mode = 'reply'; drawConv(); } const t2 = $('#dkText', page); typeIn(t2, r.text); if (!r.ai) RV.toast('Add ANTHROPIC_API_KEY for smarter drafts. This is a starter reply.'); void ta; }
          catch (e) { RV.fail(e); }
          finally { const b = $('#dkAi', page); if (b) { b.classList.remove('busy'); b.disabled = false; } }
        };
      };
      // Types the AI draft in like a person would, so it's clear it's a draft to review.
      const typeIn = (ta, text) => {
        if (RV.reduced) { ta.value = text; ta.dispatchEvent(new Event('input')); return; }
        ta.value = ''; let i = 0;
        const step = () => { i = Math.min(text.length, i + 3); ta.value = text.slice(0, i); ta.dispatchEvent(new Event('input')); if (i < text.length) requestAnimationFrame(step); else ta.focus(); };
        step();
      };

      /* ---------- events ---------- */
      page.addEventListener('click', e => {
        const v = e.target.closest('[data-view]'); if (v) { st.view = v.dataset.view; st.box = ''; drawRail(); loadList().catch(RV.fail); return; }
        const b = e.target.closest('[data-box]'); if (b) { st.box = b.dataset.box; drawRail(); loadList().catch(RV.fail); return; }
        const s = e.target.closest('[data-st]'); if (s) { st.status = s.dataset.st; page.querySelectorAll('[data-st]').forEach(x => x.classList.toggle('on', x === s)); loadList().catch(RV.fail); return; }
        const it = e.target.closest('[data-ref]'); if (it) { openTicket(it.dataset.ref).catch(RV.fail); return; }
        const pop = $('#dkPop', page); if (pop && !pop.hidden && !e.target.closest('.dk-menu')) pop.hidden = true;
      });
      let qt = null;
      $('#dkQ', page).addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { st.q = e.target.value.trim(); loadList().catch(RV.fail); }, 250); });
      const setBtn = $('#dkSet', page); if (setBtn) setBtn.onclick = () => settingsSheet(D, () => RV.render());

      drawRail();
      await loadList();
      if (stale()) return;
      if (st.ref) await openTicket(st.ref).catch(e => { RV.fail(e); drawEmptyConv(); });
      else drawEmptyConv();

      // Live updates: new tickets and replies show up without reloading.
      const tick = async () => {
        if (stale()) { clearInterval(st.timer); return; }
        if (document.hidden) return;
        try {
          const latest = await loadCounts();
          if (latest && latest !== st.latest) { st.latest = latest; await loadList(); if (st.ref && !($('#dkText', page) && $('#dkText', page).value)) await openTicket(st.ref, { quiet: true }); }
        } catch (e) { /* offline for a moment */ }
      };
      st.latest = RV.supportLatest || '';
      st.timer = setInterval(tick, 8000);
    }
  });

  function chanHtml(D) {
    const s = D.settings;
    const row = (on, label, hint) => '<span class="dk-ch-r"><i class="' + (on ? 'on' : '') + '"></i><span>' + label + '</span><em>' + hint + '</em></span>';
    return '<div class="dk-sub" style="margin-top:0">Channels</div>' + row(true, 'Website chat & forms', 'Live') + row(true, 'Dashboard help', 'Live') + row(s.tg_ready && !!s.tg_username, 'Telegram bot', s.tg_username ? '@' + esc(s.tg_username) : s.tg_ready ? 'Connect' : 'Not set') + row(s.inbound_email, 'Email inbox', s.inbound_email ? 'Live' : 'Not set');
  }

  /* ---------- desk settings (owners/admins) ---------- */
  function settingsSheet(D, done) {
    const s = D.settings;
    const srcRows = Object.entries(D.sources).filter(([k]) => k !== 'voosquare').map(([k, n]) => '<div class="f"><label>' + esc(n) + '</label><select data-route="' + k + '"><option value="0">First box</option>' + D.boxes.map(b => '<option value="' + b.id + '"' + (Number(s.routing[k]) === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>').join('');
    const hook = location.origin + '/webhooks/support-email?key=YOUR_SUPPORT_INBOUND_KEY';
    const vals = { auto_assign: s.auto_assign, ai_drafts: s.ai_drafts, email_staff: s.email_staff };
    const sh = RV.sheet({ title: 'Desk settings', sub: 'How tickets are routed and who gets them.', wide: true, save: 'Save settings', onSave: async (x) => {
      const routing = {}; x.body.querySelectorAll('[data-route]').forEach(el => { routing[el.dataset.route] = Number(el.value); });
      const cur = (await RV.settings(true)).support || {};
      await RV.saveSetting('support', { ...cur, ...vals, routing });
      RV.toast('Desk settings saved'); setTimeout(() => done && done(), 350);
    }, body:
      '<div class="card" style="padding:4px 16px">' + RV.F.tog('auto_assign', 'Auto-assign new tickets', 'Gives each new ticket to the least busy teammate who works that box') + RV.F.tog('ai_drafts', 'AI draft button', 'Writes a suggested reply from your pricing and help facts. Always review before sending.') + RV.F.tog('email_staff', 'Email the assignee', 'Sends an email when a ticket is assigned to someone') + '</div>' +
      '<div class="card"><div class="card-h"><div><h3>Where tickets go</h3><p>Pick the box for each way customers reach you.</p></div></div><div class="fg c2">' + srcRows + '</div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Telegram support bot</h3><p>' + (s.tg_username ? 'Connected as <strong>@' + esc(s.tg_username) + '</strong>. Customers message it and the chat lands here.' : s.tg_ready ? 'The bot token is set. Press Connect to point the bot at this desk.' : 'Create a bot with @BotFather, put its token in SUPPORT_TG_BOT_TOKEN on the server, then press Connect.') + '</p></div><button class="btn btn-g btn-sm" id="tgCon"' + (s.tg_ready ? '' : ' disabled') + '>' + ic('send', 15) + (s.tg_username ? 'Reconnect' : 'Connect') + '</button></div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Email inbox</h3><p>' + (s.inbound_email ? 'On. Emails to your support address arrive as tickets.' : 'Forward your support address to this webhook (Postmark, Resend, Mailgun or SendGrid inbound), with SUPPORT_INBOUND_KEY set on the server.') + '</p></div></div><div class="copyrow"><code>' + esc(hook) + '</code><button class="btn btn-g btn-sm" id="cpHook">' + ic('copy', 15) + 'Copy</button></div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Saved replies</h3><p>Use {{name}} for the customer’s first name.</p></div><button class="btn btn-g btn-sm" id="addSaved">' + ic('plus', 15) + 'Add</button></div><div class="list" id="savedList"></div></div>' });
    RV.bind(sh.body, vals);
    const drawSaved = () => { $('#savedList', sh.body).innerHTML = D.replies.map(r => '<div class="li"><span class="li-main"><strong>' + esc(r.title) + '</strong><span>' + esc(r.text.slice(0, 110)) + '</span></span><button class="ib ghost" data-ed="' + r.id + '" aria-label="Edit">' + ic('edit', 16) + '</button><button class="ib ghost" data-rm="' + r.id + '" aria-label="Delete">' + ic('trash', 16) + '</button></div>').join('') || '<p class="mut">None yet.</p>'; };
    drawSaved();
    const editSaved = r => {
      const s2 = RV.sheet({ title: r ? 'Edit saved reply' : 'New saved reply', body: RV.F.text('title', 'Title', { req: true, max: 60 }) + RV.F.area('text', 'Reply', { req: true, rows: 6, max: 4000 }), onSave: async () => {
        const v = { title: $('[data-k=title]', s2.body).value.trim(), text: $('[data-k=text]', s2.body).value.trim() };
        if (r) await RV.put('/api/admin/support/replies/' + r.id, v); else await RV.post('/api/admin/support/replies', v);
        D.replies = (await RV.get('/api/admin/support/desk')).replies; drawSaved(); RV.toast('Saved');
      } });
      if (r) { $('[data-k=title]', s2.body).value = r.title; $('[data-k=text]', s2.body).value = r.text; }
    };
    sh.body.addEventListener('click', async e => {
      if (e.target.closest('#addSaved')) return editSaved(null);
      const ed = e.target.closest('[data-ed]'); if (ed) return editSaved(D.replies.find(r => String(r.id) === ed.dataset.ed));
      const rm = e.target.closest('[data-rm]'); if (rm && await RV.confirm({ title: 'Delete this saved reply?', ok: 'Delete', danger: true })) { await RV.del('/api/admin/support/replies/' + rm.dataset.rm); D.replies = D.replies.filter(r => String(r.id) !== rm.dataset.rm); drawSaved(); }
      if (e.target.closest('#cpHook')) RV.copy(hook, 'Webhook copied');
      const tc = e.target.closest('#tgCon');
      if (tc) { tc.disabled = true; try { const r = await RV.post('/api/admin/support/telegram/connect'); RV.toast('Connected to @' + r.username); s.tg_username = r.username; } catch (err) { RV.fail(err); } tc.disabled = false; }
    });
    sh.dirty = false;
  }

  const emptyArt = () => '<svg width="120" height="96" viewBox="0 0 120 96" aria-hidden="true"><ellipse cx="60" cy="88" rx="38" ry="5" fill="#EEEBE2"/><g class="float"><rect x="22" y="22" width="76" height="54" rx="16" fill="#fff" stroke="#121110" stroke-width="2.5"/><path d="M22 50h22l6 9h20l6-9h22" fill="none" stroke="#121110" stroke-width="2.5"/><circle cx="60" cy="38" r="9" fill="#FFC21A"/><path d="M56 38l3 3 5-6" stroke="#121110" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g></svg>';
  const pickArt = () => '<svg width="150" height="110" viewBox="0 0 150 110" aria-hidden="true"><ellipse cx="75" cy="102" rx="48" ry="6" fill="#EEEBE2"/><g class="float"><rect x="18" y="20" width="70" height="40" rx="18" fill="#fff" stroke="#121110" stroke-width="2.5"/><rect x="30" y="34" width="40" height="5" rx="2.5" fill="#EEEBE2"/><rect x="30" y="44" width="26" height="5" rx="2.5" fill="#EEEBE2"/><rect x="62" y="52" width="70" height="40" rx="18" fill="#121110"/><rect x="74" y="66" width="44" height="5" rx="2.5" fill="#FFC21A"/><rect x="74" y="76" width="28" height="5" rx="2.5" fill="#5E5A50"/></g></svg>';
})();
