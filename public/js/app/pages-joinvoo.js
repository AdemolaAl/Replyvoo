/* Replyvoo dashboard: chats that come "via Joinvoo".
   A Joinvoo customer can hand a Telegram bot's chats, or a manager's own Telegram account (Telegram Business), to Replyvoo.
   Joinvoo stays connected to the bot or account and tracks the ad and deposits; your AI helper answers here in Chats, and every
   reply goes out from that bot or account. Same small hooks as RV.wa (pages-whatsapp.js): a tag in the chat list, the line under
   the name, a banner (where they came from, how it's connected), files in and out. */
(function () {
  'use strict';
  const RV = window.RV;
  const { $, esc, POST, toast, fail, ic } = RV;
  const isType = type => type === 'joinvoo_bot' || type === 'joinvoo_account';
  const isJv = d => !!(d && d.channel && (d.channel.via === 'joinvoo' || isType(d.channel.type)));
  const mgr = name => String(name || 'Manager').replace(/\s*\(.*\)\s*$/, '') || 'Manager';
  const label = (type, name, username) => type === 'joinvoo_account' ? 'via Joinvoo · ' + mgr(name) + '’s Telegram' : 'via Joinvoo · ' + (username ? '@' + username : name || 'Telegram bot');

  // Chat list: a small blue tag ("via Joinvoo", or "via Joinvoo · Sara’s Telegram" for a manager's account).
  function listTag(t) {
    const full = label(t.channel_type, t.channel_name, t.channel_username);
    return '<span class="heat" style="background:#EAF1FF;color:#1D4ED8" title="' + esc(full) + '">' + esc(t.channel_type === 'joinvoo_account' ? full : 'via Joinvoo') + '</span>';
  }
  // The line under the customer's name in the chat.
  function headLine(d, c) { return (c && c.username ? '@' + esc(c.username) + ' · ' : '') + esc((d.channel && d.channel.via_label) || label(d.channel.type, d.channel.name, d.channel.username)); }

  // Banner: where the customer came from (Joinvoo's tracking), and a plain "How this chat is connected".
  function banner(d) {
    if (!isJv(d)) return '';
    const x = d.joinvoo || {}, bits = [];
    if (x.ad || x.campaign) bits.push('Came from the ad “' + esc(x.ad || x.campaign) + '”' + (x.platform ? ' on ' + esc(x.platform) : ''));
    else bits.push('Not from a tracked ad');
    if (x.deposits) bits.push('Deposited $' + Number(x.deposits_usd || 0).toFixed(2) + (x.deposits > 1 ? ' in ' + x.deposits + ' deposits' : ''));
    else if (x.signed_up_at) bits.push('Signed up, no deposit yet');
    const acct = d.channel.type === 'joinvoo_account';
    const from = acct ? mgr(d.channel.name) + '’s own Telegram' : 'your bot' + (d.channel.username ? ' @' + d.channel.username : '');
    const info = 'Joinvoo brought this customer from your ad and keeps tracking their sign-up and deposits. Your ' + RV.W.helper + ' answers here, and every reply goes out from ' + from + ', so the customer only ever sees you. Your team can jump in here or in Joinvoo’s Team inbox. If Replyvoo can’t answer, Joinvoo’s Team inbox takes the chat.' + (acct ? ' Telegram only lets a personal account reply within 24 hours of the customer’s last message.' : '');
    return '<div class="jv-ban" style="padding:9px 16px;border-bottom:1px solid var(--line);background:#F4F7FF;font-size:13px;line-height:1.45"><strong style="display:block;color:#1D3A8A">' + bits.join(' · ') + '</strong>' +
      '<span style="color:var(--mut)">' + esc((d.channel && d.channel.via_label) || 'via Joinvoo') + ' · You can reply here any time.</span>' +
      '<details style="margin-top:4px"><summary style="cursor:pointer;color:#1D4ED8;font-weight:700">How this chat is connected</summary><p style="margin:6px 0 0;color:var(--mut)">' + esc(info) + ' <a href="/app/joinvoo#jvConnected" style="color:#1D4ED8;font-weight:700">Learn more</a></p></details></div>';
  }

  // Photos, voice notes, videos and files in these chats load through Joinvoo (the Telegram file id is never shown).
  function msgBody(m, d) {
    if (!isJv(d)) return null;
    const md = (m.meta || {}).media; if (!md) return null;
    const cap = m.text && !/^\[(image|voice note|video|file[^\]]*)\]$/.test(m.text) ? '<span style="display:block;margin-top:4px">' + esc(m.text) + '</span>' : '';
    if (md.kind === 'photo' && md.url) return '<a href="' + esc(md.url) + '" target="_blank" rel="noopener"><img src="' + esc(md.url) + '" alt="Photo" loading="lazy" style="display:block;max-width:220px;max-height:260px;border-radius:12px"></a>' + cap;
    if ((md.kind === 'document' || md.kind === 'video' || md.kind === 'video_note') && md.url) return '<a href="' + esc(md.url) + '" target="_blank" rel="noopener" class="row" style="gap:8px;font-weight:700;color:inherit">' + ic(md.kind === 'document' ? 'download' : 'play', 'currentColor', 18) + esc(md.kind === 'document' ? (md.name || 'File') : 'Video') + '</a>' + cap;
    if (md.kind === 'sticker') return esc(md.emoji || m.text || 'Sticker');
    return null;
  }

  // Send a photo, voice note, video or file (up to 4.5 MB) from the reply box.
  function attachBtn(d) {
    if (!isJv(d)) return '';
    return '<label class="btn btn-icon" for="jvFile" title="Send a photo, voice note, video or file" aria-label="Send a photo, voice note, video or file" style="width:44px;height:44px;flex:0 0 44px;cursor:pointer">' + ic('image', '#121110', 18, 2.2) +
      '<input type="file" id="jvFile" accept="image/jpeg,image/png,image/webp,audio/*,video/mp4,video/quicktime,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" hidden></label>';
  }
  function bindAttach(d, refresh) {
    const f = $('jvFile'); if (!f || !isJv(d)) return;
    f.addEventListener('change', () => {
      const file = f.files && f.files[0]; if (!file) return;
      if (file.size > 4.5 * 1024 * 1024) { toast('Pick a file under 4.5 MB.', 'err'); f.value = ''; return; }
      const r = new FileReader();
      r.onload = async () => {
        const inp = $('ibIn'), text = inp ? inp.value.trim() : '';
        try { await POST('/api/app/threads/' + d.thread.id + '/messages', { text, file: { data_url: r.result, name: file.name } }); if (inp) inp.value = ''; toast('Sent'); refresh(); }
        catch (e) { fail(e); }
        f.value = '';
      };
      r.readAsDataURL(file);
    });
  }

  RV.jv = { isType, isJv, label, listTag, headLine, banner, msgBody, attachBtn, bindAttach };
})();
