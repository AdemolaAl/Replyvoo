/* Replyvoo admin: Staff & access. Invite staff, give them a ready role, fine-tune any page, pick their support boxes. */
(function () {
  'use strict';
  const RV = window.RV, { $, esc, ic, ago } = RV;
  const ROLE_COLOR = { owner: '#121110', admin: '#6D5BFF', support: '#FFC21A', finance: '#7EE0B0', content: '#FFB199', viewer: '#CFC9BB' };
  const LVL = ['none', 'view', 'edit'];
  const LVL_NAME = { none: 'No access', view: 'View', edit: 'Edit' };
  const initials = s => String(s || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('') || '?';
  const online = iso => !!iso && Date.now() - new Date(iso).getTime() < 10 * 60e3;
  const VOO = '<svg width="14" height="14" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#00A86B"/><rect x="14" y="14" width="16" height="16" rx="5" fill="#fff"/><rect x="34" y="14" width="16" height="16" rx="5" fill="#C4E8DA"/><rect x="14" y="34" width="16" height="16" rx="5" fill="#C4E8DA"/><rect x="34" y="34" width="16" height="16" rx="5" fill="#C8F55A"/></svg>';

  RV.route('staff', {
    async render(page, arg, stale) {
      const d = await RV.get('/api/admin/staff');
      if (stale()) return;
      const canEdit = RV.can('staff', 'edit');
      const roleName = id => (d.roles.find(r => r.id === id) || {}).name || id;
      const pill = r => '<span class="role-pill" style="--rc:' + ROLE_COLOR[r] + '">' + esc(roleName(r)) + '</span>';
      const boxName = id => (d.boxes.find(b => b.id === Number(id)) || {}).name;
      const boxChips = s => s.all_boxes || ['owner', 'admin'].includes(s.role) ? '<span class="chip">All boxes</span>' : (s.boxes.length ? s.boxes.map(id => boxName(id) ? '<span class="chip">' + esc(boxName(id)) + '</span>' : '').join('') : '<span class="chip mut">No boxes</span>');
      const onlineN = d.staff.filter(s => s.status === 'active' && online(s.last_seen)).length;

      page.innerHTML = RV.header('Staff & <span class="it">access</span>', 'Invite your team, give each person a role, and choose exactly which pages and support boxes they see.', canEdit ? '<button class="btn btn-y" id="inv">' + ic('userplus', 18) + 'Invite staff</button>' : '') +
        '<div class="team-stats">' + [['People', d.staff.filter(s => s.status === 'active').length, 'users'], ['Online now', onlineN, 'pulse'], ['Invites waiting', d.invites.length, 'mail'], ['Open tickets', d.boxes.reduce((n, b) => n + b.open, 0), 'inbox']].map((k, i) => '<div class="tstat" style="animation-delay:' + i * 0.05 + 's"><span class="tsi">' + ic(k[2], 18) + '</span><b class="tnum">' + k[1] + '</b><span>' + k[0] + '</span></div>').join('') + '</div>' +
        (d.voo.enabled ? '<div class="voo-note">' + VOO + '<span>Staff log in with their Replyvoo password or their <strong>Voo ID</strong>' + (d.mfa ? ', plus a 6-digit email code' : '') + '. You can also invite and manage support staff from <strong>VooSquare HQ</strong>; they show up here with a VooSquare badge.</span></div>' : (d.mfa ? '' : '<div class="voo-note warn">' + ic('lock', 16) + '<span>2-step login codes are off on this server. They switch on automatically in production (STAFF_2FA).</span></div>')) +
        '<div class="staff-grid" id="sg">' + d.staff.map((s, i) => '<button class="staff-card' + (s.status !== 'active' ? ' off' : '') + '" data-u="' + s.user_id + '" style="animation-delay:' + Math.min(i, 10) * 0.04 + 's"' + (canEdit && s.user_id !== d.me ? '' : ' disabled') + (s.user_id === d.me ? ' title="Another owner or admin can change your access"' : '') + '>' +
          '<span class="sc-top"><span class="sc-av" style="--rc:' + ROLE_COLOR[s.role] + '">' + esc(initials(s.name || s.email)) + (online(s.last_seen) && s.status === 'active' ? '<i class="sc-on" title="Online"></i>' : '') + '</span>' + pill(s.role) + '</span>' +
          '<strong>' + esc(s.name || s.email) + (s.user_id === d.me ? ' <span class="mut2">(you)</span>' : '') + '</strong><span class="sc-mail">' + esc(s.email) + '</span>' +
          (s.title ? '<span class="sc-title">' + esc(s.title) + '</span>' : '') +
          '<span class="sc-boxes">' + boxChips(s) + '</span>' +
          '<span class="sc-foot"><span>' + (s.status !== 'active' ? 'Access paused' : s.last_seen ? (online(s.last_seen) ? 'Online now' : 'Seen ' + ago(s.last_seen)) : 'Not logged in yet') + '</span>' + (s.open_tickets ? '<span>' + s.open_tickets + ' open</span>' : '') + (s.source === 'voosquare' ? '<span class="sc-voo">' + VOO + 'VooSquare</span>' : '') + '</span></button>').join('') + '</div>' +
        (d.invites.length ? '<div class="card" style="margin-top:16px"><div class="card-h"><div><h3>Invites waiting</h3><p>They get an email with a join link that works for 7 days.</p></div></div><div class="list">' + d.invites.map(v => '<div class="li"><span class="me-av" style="background:var(--soft)">' + ic('mail', 16) + '</span><span class="li-main"><strong>' + esc(v.email) + '</strong><span>' + esc(roleName(v.role)) + (v.title ? ' · ' + esc(v.title) : '') + ' · expires ' + RV.date(v.expires_at) + '</span></span>' + (canEdit ? '<button class="btn btn-g btn-sm" data-resend="' + v.id + '">Resend</button><button class="ib ghost" data-cancel="' + v.id + '" aria-label="Cancel invite">' + ic('x', 16) + '</button>' : '') + '</div>').join('') + '</div></div>' : '') +
        '<div class="grid g2" style="margin-top:16px;align-items:start">' +
        '<div class="card"><div class="card-h"><div><h3>Support boxes</h3><p>Group tickets by topic. Give each teammate the boxes they handle.</p></div>' + (canEdit ? '<button class="btn btn-g btn-sm" id="addBox">' + ic('plus', 15) + 'Add box</button>' : '') + '</div><div class="list">' + d.boxes.map(b => '<div class="li"><span class="box-dot" style="background:' + esc(b.color) + '"></span><span class="li-main"><strong>' + esc(b.name) + (b.active ? '' : ' <span class="mut2">(hidden)</span>') + '</strong><span>' + esc(b.description || '') + '</span></span><span class="pill" style="background:var(--soft)">' + b.open + ' open</span>' + (canEdit ? '<button class="ib ghost" data-box="' + b.id + '" aria-label="Edit box">' + ic('edit', 16) + '</button>' : '') + '</div>').join('') + '</div></div>' +
        '<div class="card"><div class="card-h"><div><h3>What each role can do</h3><p>Start from a role, then fine-tune any page per person.</p></div></div>' + matrix(d) + '</div></div>';

      const reload = () => RV.render();
      page.addEventListener('click', async e => {
        if (e.target.closest('#inv')) return editSheet(d, null, reload);
        const c = e.target.closest('[data-u]'); if (c) return editSheet(d, d.staff.find(s => String(s.user_id) === c.dataset.u), reload);
        const rs = e.target.closest('[data-resend]'); if (rs) { rs.disabled = true; try { await RV.post('/api/admin/staff/invites/' + rs.dataset.resend + '/resend'); RV.toast('Invite sent again'); } catch (err) { RV.fail(err); } rs.disabled = false; return; }
        const cx = e.target.closest('[data-cancel]'); if (cx && await RV.confirm({ title: 'Cancel this invite?', text: 'The join link stops working.', ok: 'Cancel invite', danger: true })) { await RV.del('/api/admin/staff/invites/' + cx.dataset.cancel); RV.toast('Invite cancelled'); return reload(); }
        if (e.target.closest('#addBox')) return boxSheet(null, reload);
        const bx = e.target.closest('[data-box]'); if (bx) return boxSheet(d.boxes.find(b => String(b.id) === bx.dataset.box), reload);
      });
    }
  });

  function matrix(d) {
    const dot = l => '<i class="lv ' + l + '" title="' + LVL_NAME[l] + '"></i>';
    return '<div class="mx-wrap"><table class="mx"><thead><tr><th></th>' + d.roles.map(r => '<th><span style="--rc:' + ROLE_COLOR[r.id] + '" class="mx-r">' + esc(r.name) + '</span></th>').join('') + '</tr></thead><tbody>' +
      Object.entries(d.sections).map(([k, n]) => '<tr><td>' + esc(n.split(',')[0].split(' & ')[0]) + '</td>' + d.roles.map(r => '<td>' + dot(r.perms[k] || 'none') + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div><div class="mx-key">' + dot('edit') + 'Edit ' + dot('view') + 'View ' + dot('none') + 'No access</div>';
  }

  function editSheet(d, s, done) {
    const isNew = !s;
    const meRole = d.my_role;
    const roles = d.roles.filter(r => r.id !== 'owner' || meRole === 'owner');
    const st = { email: '', title: s ? s.title : '', role: s ? s.role : 'support', perms: s ? { ...s.custom } : {}, all_boxes: s ? s.all_boxes : true, boxes: s ? s.boxes.map(Number) : [] };
    const eff = k => st.perms[k] || (d.roles.find(r => r.id === st.role) || { perms: {} }).perms[k] || 'none';
    const body = document.createElement('div'); body.className = 'stack';
    const draw = () => {
      const full = st.role === 'owner' || st.role === 'admin';
      body.innerHTML =
        (isNew ? '<div class="f"><label for="ivE">Email</label><input id="ivE" type="email" required placeholder="name@company.com" value="' + esc(st.email) + '" autocomplete="off"><span class="hint">They’ll get a join link by email' + (d.voo.enabled ? ' and log in with their Voo ID' : '') + '.</span></div>' : '<div class="who-row"><span class="sc-av" style="--rc:' + ROLE_COLOR[s.role] + '">' + esc(initials(s.name || s.email)) + '</span><span><strong>' + esc(s.name || s.email) + '</strong><span class="mut">' + esc(s.email) + '</span></span></div>') +
        '<div class="f"><label for="ivT">Job title (optional)</label><input id="ivT" maxlength="60" placeholder="e.g. Support lead, Billing" value="' + esc(st.title) + '"></div>' +
        '<div><div class="lbl-sm">Role</div><div class="role-pick">' + roles.map(r => '<button type="button" class="rp' + (st.role === r.id ? ' on' : '') + '" data-role="' + r.id + '" style="--rc:' + ROLE_COLOR[r.id] + '"><span class="rp-dot"></span><strong>' + esc(r.name) + '</strong><span>' + esc(r.desc) + '</span></button>').join('') + '</div></div>' +
        '<div><div class="lbl-sm">Page access ' + (full ? '<span class="mut2">(full access for ' + esc((roles.find(r => r.id === st.role) || {}).name) + ')</span>' : '<span class="mut2">(tap to change from the role default)</span>') + '</div><div class="acc">' + Object.entries(d.sections).map(([k, n]) => '<div class="acc-r"><span>' + esc(n) + '</span><div class="seg3' + (full ? ' dis' : '') + '">' + LVL.map(l => '<button type="button" data-sec="' + k + '" data-lv="' + l + '" class="' + (eff(k) === l ? 'on ' + l : '') + (st.perms[k] === l ? ' custom' : '') + '"' + (full ? ' disabled' : '') + '>' + LVL_NAME[l] + '</button>').join('') + '</div></div>').join('') + '</div></div>' +
        '<div><div class="lbl-sm">Support boxes</div>' + (full ? '<p class="mut" style="margin:0">Owners and admins work in every box.</p>' : '<div class="box-pick"><button type="button" class="bp' + (st.all_boxes ? ' on' : '') + '" data-allbox>All boxes</button>' + d.boxes.map(b => '<button type="button" class="bp' + (!st.all_boxes && st.boxes.includes(b.id) ? ' on' : '') + '" data-bx="' + b.id + '"><i style="background:' + esc(b.color) + '"></i>' + esc(b.name) + '</button>').join('') + '</div>') + '</div>' +
        (!isNew ? '<div class="card" style="padding:4px 16px"><div class="sw"><div class="sw-t"><strong>Access paused</strong><span>Keeps their settings but logs them out and blocks the admin.</span></div><button type="button" class="tg" role="switch" aria-checked="' + (s.status !== 'active') + '" id="pause" aria-label="Access paused"></button></div></div>' : '');
    };
    draw();
    const sh = RV.sheet({ title: isNew ? 'Invite staff' : 'Edit access', sub: isNew ? 'Pick a role. You can fine-tune any page below.' : '', wide: true, body, save: isNew ? 'Send invite' : 'Save access',
      extra: !isNew && s.user_id !== d.me ? '<button class="btn btn-red" data-remove>' + ic('trash', 16) + 'Remove</button>' : '',
      onSave: async () => {
        if (isNew) st.email = $('#ivE', body).value.trim();
        st.title = $('#ivT', body).value.trim();
        const payload = { role: st.role, perms: st.perms, all_boxes: st.all_boxes, boxes: st.boxes, title: st.title };
        if (isNew) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(st.email)) { RV.toast('Enter a valid email address.', 'err'); return false; }
          const r = await RV.post('/api/admin/staff/invite', { email: st.email, ...payload });
          RV.toast('Invite sent to ' + st.email);
          if (r.join_url) console.info('[dev] join link:', r.join_url);
        } else {
          const pz = $('#pause', body);
          await RV.put('/api/admin/staff/' + s.user_id, { ...payload, status: pz && pz.getAttribute('aria-checked') === 'true' ? 'disabled' : 'active' });
          RV.toast('Access saved');
        }
        setTimeout(done, 300);
      } });
    body.addEventListener('click', e => {
      if ($('#ivT', body)) st.title = $('#ivT', body).value;
      if (isNew && $('#ivE', body)) st.email = $('#ivE', body).value;
      const r = e.target.closest('[data-role]'); if (r) { st.role = r.dataset.role; st.perms = {}; draw(); sh.dirty = true; return; }
      const lv = e.target.closest('[data-lv]');
      if (lv) { const k = lv.dataset.sec; const def = (d.roles.find(x => x.id === st.role) || { perms: {} }).perms[k]; if (lv.dataset.lv === def) delete st.perms[k]; else st.perms[k] = lv.dataset.lv; draw(); sh.dirty = true; return; }
      if (e.target.closest('[data-allbox]')) { st.all_boxes = !st.all_boxes; draw(); sh.dirty = true; return; }
      const bx = e.target.closest('[data-bx]'); if (bx) { const id = Number(bx.dataset.bx); st.all_boxes = false; st.boxes = st.boxes.includes(id) ? st.boxes.filter(x => x !== id) : st.boxes.concat(id); draw(); sh.dirty = true; return; }
      const pz = e.target.closest('#pause'); if (pz) { pz.setAttribute('aria-checked', String(pz.getAttribute('aria-checked') !== 'true')); sh.dirty = true; }
    });
    const rm = sh.el.querySelector('[data-remove]');
    if (rm) rm.onclick = async () => {
      if (!(await RV.confirm({ title: 'Remove ' + (s.name || s.email) + ' from staff?', text: 'They lose admin access straight away. Their open tickets go back to unassigned.', ok: 'Remove', danger: true }))) return;
      try { await RV.del('/api/admin/staff/' + s.user_id); RV.toast('Removed from staff'); sh.dirty = false; sh.close(true); done(); } catch (err) { RV.fail(err); }
    };
  }

  function boxSheet(b, done) {
    const COLORS = ['#FFC21A', '#7EE0B0', '#8FB8FF', '#FFB199', '#C9A7FF', '#FF9FC3', '#121110'];
    const st = { name: b ? b.name : '', description: b ? b.description : '', color: b ? b.color : COLORS[0], active: b ? !!b.active : true };
    const body = '<div class="f"><label for="bxN">Name</label><input id="bxN" maxlength="40" required value="' + esc(st.name) + '" placeholder="e.g. VIP customers"></div><div class="f"><label for="bxD">What goes here</label><input id="bxD" maxlength="140" value="' + esc(st.description) + '"></div><div><div class="lbl-sm">Colour</div><div class="sw-colors">' + COLORS.map(c => '<button type="button" data-c="' + c + '" class="' + (c === st.color ? 'on' : '') + '" style="background:' + c + '" aria-label="' + c + '"></button>').join('') + '</div></div>' +
      (b ? '<div class="card" style="padding:4px 16px"><div class="sw"><div class="sw-t"><strong>Show this box</strong><span>Hidden boxes keep their tickets but stop getting new ones.</span></div><button type="button" class="tg" role="switch" aria-checked="' + st.active + '" id="bxA" aria-label="Show this box"></button></div></div>' : '');
    const sh = RV.sheet({ title: b ? 'Edit box' : 'New support box', body, save: b ? 'Save box' : 'Create box', extra: b ? '<button class="btn btn-red" data-del>' + ic('trash', 16) + 'Delete</button>' : '',
      onSave: async (x) => {
        const v = { name: $('#bxN', x.body).value.trim(), description: $('#bxD', x.body).value.trim(), color: st.color, active: b ? $('#bxA', x.body).getAttribute('aria-checked') === 'true' : true };
        if (!v.name) { RV.toast('Give the box a name.', 'err'); return false; }
        if (b) await RV.put('/api/admin/staff/boxes/' + b.id, v); else await RV.post('/api/admin/staff/boxes', v);
        RV.toast('Box saved'); setTimeout(done, 300);
      } });
    sh.body.addEventListener('click', e => { const c = e.target.closest('[data-c]'); if (c) { st.color = c.dataset.c; sh.body.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === c)); sh.dirty = true; } const a = e.target.closest('#bxA'); if (a) a.setAttribute('aria-checked', String(a.getAttribute('aria-checked') !== 'true')); });
    const del = sh.el.querySelector('[data-del]');
    if (del) del.onclick = async () => { if (!(await RV.confirm({ title: 'Delete ' + b.name + '?', text: 'Its tickets move to another box.', ok: 'Delete box', danger: true }))) return; try { await RV.del('/api/admin/staff/boxes/' + b.id); sh.dirty = false; sh.close(true); RV.toast('Box deleted'); done(); } catch (err) { RV.fail(err); } };
  }
})();
