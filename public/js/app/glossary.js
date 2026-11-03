/* Replyvoo dashboard: plain words for every feature, in one place, plus the "What's this?" tip.
   RV.whats('heat') → a small ⓘ button. Tapping it opens a short sheet with one or two plain sentences.
   Names: RV.W.helper ('AI helper'), RV.W.chats ('Chats') … Use these instead of typing the words again, so every
   screen calls the same thing by the same name. */
(function () {
  'use strict';
  const RV = window.RV;
  const esc = RV.esc;

  // One plain name per thing. The brand name (if any) only shows as a small label next to it.
  RV.W = {
    helper: 'AI helper', helpers: 'AI helpers', myai: 'My AI', train: 'Train', chats: 'Chats', customers: 'Customers',
    ready: 'Ready to buy', followup: 'Follow-up', blast: 'Message many', paylink: 'Payment link', juno: 'Ask about my shop',
    pro: 'Smarter answers', credits: 'Credits', squad: 'Invite & earn', live: 'Watch live', web: 'Website chat',
    handoff: 'Pass to me', guard: 'Group helper', report: 'Daily summary email', picture: 'Your picture', addons: 'Add-ons',
    billing: 'Plan & billing', places: 'Places your AI answers', link: 'Chat link', take: 'I’ll reply', give: 'Let the AI reply'
  };
  // Jobs an AI helper can do, in plain words (the Studio templates).
  RV.ROLE = { sales: 'Sell and answer questions', support: 'Help with orders', book: 'Book appointments', vip: 'Look after best customers', guard: 'Group helper', win: 'Bring back quiet customers' };
  RV.roleOf = id => RV.ROLE[id] || RV.ROLE.sales;
  // Lead heat and stage, in plain words.
  RV.HEATW = { hot: 'Ready to buy 🔥', warm: 'Interested', cold: 'Just looking', won: 'Bought' };
  RV.STAGEW = { new: 'New', qualified: 'Interested', checkout: 'About to pay', won: 'Bought', lost: 'Not buying' };
  RV.SKILLW = { paylink: ['Payment link', 'Sends your payment link when someone wants to buy.'], vision: ['Voice notes and photos', 'Understands voice notes and screenshots.'], upsell: ['Suggest extras', 'Suggests a bundle or add-on when it really helps.'], handoff: ['Pass to me', 'Passes the chat to you when it should.'] };

  const TIPS = {
    helper: ['AI helper', 'Your AI helper answers your customers for you, day and night. It only says what you teach it.'],
    train: ['Train your helper', 'Teach your helper what to say: your prices, delivery and the questions people ask.'],
    chats: ['Chats', 'Every message from every place, in one list. Tap one to read it or reply yourself.'],
    chat: ['What is one chat?', 'One chat is one customer talking to you within a day. Your plan includes a number of chats each month.'],
    heat: ['Ready to buy', 'Your helper guesses who wants to buy, so you can call them first. 🔥 means ready to buy.'],
    customers: ['Customers', 'Everyone who messaged you. The ones ready to buy are at the top.'],
    followup: ['Follow-up', 'Reminds quiet customers once, so nobody is forgotten.'],
    blast: ['Message many', 'Send one message to a group of customers at once, like people who asked but didn’t buy.'],
    paylink: ['Payment link', 'Paste the link you use to get paid. Your helper sends it when someone wants to buy.'],
    juno: ['Ask about my shop', 'Ask questions like “Who should I call first?” and get a short answer from your chats.'],
    pro: ['Smarter answers', 'A stronger AI for tricky questions. It uses more credits per chat.'],
    credits: ['Credits', 'Credits pay for extra chats after your free ones run out. 1 credit = 1 extra chat.'],
    squad: ['Invite & earn', 'Share your link. When friends pay for Replyvoo, you get a part of it every month.'],
    live: ['Watch live', 'See new messages and your helper’s replies the moment they happen.'],
    web: ['Website chat', 'A chat bubble on your own website. Your helper answers visitors there.'],
    link: ['Chat link', 'A free chat page with its own link. Share it in your bio, a status or a printed QR code. No website needed.'],
    handoff: ['Pass to me', 'When a chat needs a person, your helper stops and tells you. You reply, then let it take over again.'],
    guard: ['Group helper', 'Welcomes people and deletes spam in your Telegram group.'],
    score: ['How ready your helper is', 'The more answers you teach, the readier it gets. 80% or more is great.'],
    gaps: ['Questions it couldn’t answer', 'Real questions your helper didn’t know. Teach the answer once and it knows it next time.'],
    botfather: ['What is BotFather?', 'BotFather is Telegram’s own helper for making bot accounts. It has a blue tick. You talk to it like a person, and it gives you a code for your bot.'],
    token: ['What is the code?', 'BotFather gives your bot a long code with a colon in it, like 123456789:AAH… It is like a key. Only paste it here. Never share it in a chat.'],
    tz: ['Time zone', 'Used for your daily summary and scheduled messages.'],
    crypto: ['Paying with crypto', 'You can pay with USDT (a digital dollar) or Bitcoin from any crypto wallet or exchange. We show the exact amount and address. Your order turns on by itself once the payment arrives.']
  };
  RV.TIPS = TIPS;

  RV.whats = function (key, label) {
    if (!TIPS[key]) return '';
    return '<button type="button" class="whats" data-whats="' + esc(key) + '" aria-label="What’s this: ' + esc(TIPS[key][0]) + '">' + (label ? '<span>' + esc(label) + '</span>' : '') + '<i aria-hidden="true">i</i></button>';
  };
  function openTip(key) {
    const t = TIPS[key]; if (!t) return;
    const wrap = document.createElement('div');
    wrap.className = 'tip-ovl';
    wrap.innerHTML = '<div class="tip-sheet a-in" role="dialog" aria-modal="true" aria-label="' + esc(t[0]) + '"><strong>' + esc(t[0]) + '</strong><p>' + esc(t[1]) + '</p><button type="button" class="btn btn-ink" data-tip-close>Got it</button></div>';
    document.body.appendChild(wrap);
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-tip-close]')) close(); });
    setTimeout(() => { const b = wrap.querySelector('[data-tip-close]'); if (b) b.focus(); }, 30);
  }
  RV.openTip = openTip;
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-whats]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    openTip(b.getAttribute('data-whats'));
  }, true);

  // Is this website channel the free chat link?
  RV.isLink = c => !!(c && c.type === 'website' && c.link);
  RV.isSite = c => !!(c && c.type === 'website' && !c.link);
  // Where a channel lives, in plain words.
  RV.placeName = c => !c ? '' : RV.isLink(c) ? 'Chat link' : c.type === 'website' ? 'Website chat' : c.type === 'whatsapp' ? 'WhatsApp' + (c.display_phone ? ' ' + c.display_phone : '') : c.type === 'telegram_group' ? 'Telegram group' : c.type === 'telegram_business' ? 'Telegram account' : c.type === 'joinvoo_account' ? (c.via_label || 'Manager’s Telegram · via Joinvoo') : c.type === 'joinvoo_bot' ? 'Telegram' + (c.username ? ' @' + c.username : '') + ' · via Joinvoo' : 'Telegram' + (c.username ? ' @' + c.username : '');
  // First word of a person's name, but never "Website" from "Website visitor #5891".
  RV.who = n => { const s = String(n || '').trim(); if (!s) return 'a customer'; if (/^website visitor\b/i.test(s) || /^chat link visitor\b/i.test(s) || /^visitor\b/i.test(s)) return s; return s.split(/\s+/)[0]; };
})();
