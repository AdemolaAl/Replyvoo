'use strict';
// Gatevoo sandbox checkout: a stand-in for Gatevoo's hosted payment page, used while GATEVOO_API_KEY is not set
// and PAYMENTS_DEMO is on. It looks and flows like the real page, but no coins move.
const crypto = require('node:crypto');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The Gatevoo mark: black tile, white G, green dot.
const MARK = (size = 40) => '<svg width="' + size + '" height="' + size + '" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#121110"/><path d="M41.9 21.6A15 15 0 1 0 47 32H39.5" fill="none" stroke="#fff" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="30.5" cy="32" r="3.6" fill="#3E9C76"/></svg>';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function fakeAddress(ref, coin) {
  const h = crypto.createHash('sha256').update('gv-sandbox:' + coin + ':' + ref).digest();
  if (coin === 'BTC') return 'bc1q' + Array.from(h.subarray(0, 32)).map(b => B32[b % 32]).join('').slice(0, 38);
  return 'T' + Array.from(h).map(b => B58[b % 58]).join('').slice(0, 33);
}
// A QR-looking pattern (decorative: it is a sandbox, nothing should be scanned).
function fakeQr(seed) {
  const h = crypto.createHash('sha512').update(seed).digest();
  const n = 25; let cells = '';
  const finder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (finder(x, y)) continue;
    const bit = (h[(y * n + x) % 64] >> ((x + y) % 8)) & 1;
    if (bit) cells += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
  }
  const f = (x, y) => '<rect x="' + (x + .5) + '" y="' + (y + .5) + '" width="6" height="6" rx="1.4" fill="none" stroke="#121110" stroke-width="1"/><rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="3" height="3" rx=".6"/>';
  return '<svg viewBox="-1 -1 27 27" width="100%" height="100%" shape-rendering="crispEdges" aria-label="Sandbox payment code" role="img"><g fill="#121110">' + cells + f(0, 0) + f(n - 7, 0) + f(0, n - 7) + '</g></svg>';
}

function render({ order, coins, coin, action, cancelUrl, btcUsd = 65000 }) {
  const sel = coins.find(c => c.id === coin) || coins[0];
  const due = Math.round((Number(order.amount_usd) + Number(order.fee_usd || 0)) * 100) / 100; // what the customer pays
  const amount = sel.id === 'BTC' ? (due / btcUsd).toFixed(8) : due.toFixed(2);
  const unit = sel.id === 'BTC' ? 'BTC' : 'USDT';
  const addr = fakeAddress(order.ref, sel.id);
  const tabs = coins.map(c => '<a class="tab' + (c.id === sel.id ? ' on' : '') + '" href="?coin=' + c.id + '"' + (c.id === sel.id ? ' aria-current="true"' : '') + '><span class="ci ci-' + c.id + '">' + (c.id === 'BTC' ? '₿' : '₮') + '</span><span><b>' + esc(c.label) + '</b><small>' + esc(c.network) + '</small></span></a>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Pay with crypto | Gatevoo</title>' +
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap">' +
  '<style>' +
  ':root{--ink:#121110;--mut:#77736A;--line:#ECEAE4;--bg:#F7F6F2;--green:#3E9C76;--mint:#E6F4EE}' +
  '*{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--bg);color:var(--ink);font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;flex-direction:column;align-items:center;padding:22px 16px 40px}' +
  '.bar{width:100%;max-width:460px;display:flex;align-items:center;gap:10px;margin-bottom:18px}.word{font-weight:800;font-size:22px;letter-spacing:-.045em}.word i{font-style:normal;color:#A8A397}' +
  '.sbx{margin-left:auto;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;background:var(--ink);color:#fff;border-radius:999px;padding:6px 11px;display:inline-flex;gap:7px;align-items:center}.sbx:before{content:"";width:7px;height:7px;border-radius:50%;background:#F5B83D}' +
  '.card{width:100%;max-width:460px;background:#fff;border:1px solid var(--line);border-radius:28px;padding:22px;box-shadow:0 40px 80px -50px rgba(18,17,16,.45);animation:up .5s cubic-bezier(.2,.8,.2,1) both}' +
  '@keyframes up{from{opacity:0;transform:translateY(14px)}}' +
  '.mer{display:flex;align-items:center;gap:12px}.mer .lg{width:42px;height:42px;border-radius:13px;background:#FFC21A;display:grid;place-items:center;font-weight:800}.mer small{display:block;color:var(--mut);font-size:12.5px;font-weight:600}.mer b{font-size:15.5px}' +
  '.amt{margin:18px 0 4px;font-size:44px;font-weight:800;letter-spacing:-.055em;line-height:1;font-variant-numeric:tabular-nums}.item{color:var(--mut);font-size:14px;margin:0 0 18px}' +
  '.tabs{display:grid;grid-template-columns:repeat(' + coins.length + ',1fr);gap:8px;background:var(--bg);border:1px solid var(--line);border-radius:18px;padding:5px;margin-bottom:16px}' +
  '.tab{display:flex;gap:10px;align-items:center;text-decoration:none;color:var(--ink);border-radius:14px;padding:9px 10px;transition:background .2s,box-shadow .2s}.tab.on{background:#fff;box-shadow:0 6px 16px -10px rgba(18,17,16,.5)}.tab b{display:block;font-size:14.5px}.tab small{display:block;color:var(--mut);font-size:11.5px;font-weight:600}' +
  '.ci{flex:0 0 30px;height:30px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#fff;font-size:15px}.ci-USDT_TRC20{background:#26A17B}.ci-BTC{background:#F7931A}' +
  '.pay{background:var(--ink);color:#fff;border-radius:22px;padding:18px;display:grid;grid-template-columns:132px 1fr;gap:16px;align-items:center;position:relative;overflow:hidden}' +
  '.pay:after{content:"";position:absolute;inset:auto -40px -80px auto;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(62,156,118,.45),transparent 65%);animation:glow 4s ease-in-out infinite}@keyframes glow{50%{transform:translate(-20px,-14px);opacity:.6}}' +
  '.qr{background:#fff;border-radius:16px;padding:9px;aspect-ratio:1;position:relative;z-index:1}.qr:before{content:"";position:absolute;left:9px;right:9px;height:2px;background:var(--green);top:12px;border-radius:2px;box-shadow:0 0 12px var(--green);animation:scan 2.6s ease-in-out infinite}@keyframes scan{50%{top:calc(100% - 14px)}}' +
  '.pd{position:relative;z-index:1;min-width:0}.lbl{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#A8A397;margin-bottom:5px}' +
  '.big{font:600 19px/1.2 "JetBrains Mono",ui-monospace,monospace;letter-spacing:-.02em;word-break:break-all}.addr{font:500 12.5px/1.45 "JetBrains Mono",ui-monospace,monospace;color:#E8E5DD;word-break:break-all}' +
  '.cp{margin-top:8px;display:inline-flex;align-items:center;gap:6px;background:#2A2825;border:0;color:#fff;border-radius:999px;padding:7px 12px;font-family:inherit;font-weight:700;font-size:12.5px;line-height:1;cursor:pointer}.cp:hover{background:#3A3733}' +
  '.steps{display:flex;justify-content:space-between;margin:18px 2px 4px;position:relative}.steps:before{content:"";position:absolute;left:12px;right:12px;top:11px;height:2px;background:var(--line)}' +
  '.st{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--mut);position:relative;z-index:1;flex:1}.st:first-child{align-items:flex-start}.st:last-child{align-items:flex-end}' +
  '.dot{width:24px;height:24px;border-radius:50%;background:#fff;border:2px solid var(--line);display:grid;place-items:center}.st.now{color:var(--ink)}.st.now .dot{border-color:var(--green)}.st.now .dot:after{content:"";width:10px;height:10px;border-radius:50%;background:var(--green);animation:pulse 1.4s infinite}@keyframes pulse{0%,100%{opacity:1}}' +
  '.meta{display:flex;justify-content:space-between;align-items:center;margin-top:14px;font-size:13px;color:var(--mut)}.meta b{color:var(--ink);font-variant-numeric:tabular-nums}' +
  '.go{width:100%;margin-top:16px;border:0;border-radius:999px;background:var(--ink);color:#fff;font-family:inherit;font-weight:800;font-size:16px;line-height:1;padding:17px 22px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;transition:transform .15s}.go:hover{transform:translateY(-1px)}.go:active{transform:scale(.99)}.go span{width:30px;height:30px;border-radius:50%;background:#fff;color:var(--ink);display:grid;place-items:center}' +
  '.note{margin:12px 0 0;font-size:12.5px;color:var(--mut);text-align:center;line-height:1.5}.back{display:block;text-align:center;margin-top:14px;color:var(--ink);font-weight:700;font-size:14px}' +
  '.foot{margin-top:18px;display:flex;align-items:center;gap:8px;color:var(--mut);font-size:12.5px;font-weight:600}' +
  '.done{position:fixed;inset:0;background:rgba(247,246,242,.92);backdrop-filter:blur(6px);display:none;place-items:center;z-index:5}.done.on{display:grid}.done div{text-align:center;animation:up .4s both}.tick{width:86px;height:86px;border-radius:50%;background:var(--green);display:grid;place-items:center;margin:0 auto 14px;box-shadow:0 0 0 12px var(--mint)}' +
  '@media (max-width:420px){.pay{grid-template-columns:1fr}.qr{width:150px;margin:0 auto}.amt{font-size:38px}}' +
  '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}' +
  '</style></head><body>' +
  '<div class="bar">' + MARK(36) + '<span class="word">Gate<i>voo</i></span><span class="sbx" title="Sandbox: no real coins move">Sandbox</span></div>' +
  '<main class="card">' +
  '<div class="mer"><span class="lg">R</span><span><small>Paying</small><b>Replyvoo</b></span></div>' +
  '<div class="amt">$' + due.toFixed(2) + '</div><p class="item">' + esc(order.item_name) + ' · ' + esc(order.ref) + '</p>' +
  '<nav class="tabs" aria-label="Choose a coin">' + tabs + '</nav>' +
  '<section class="pay"><div class="qr">' + fakeQr(order.ref + sel.id) + '</div><div class="pd"><div class="lbl">Send exactly</div><div class="big">' + amount + ' ' + unit + '</div><div class="lbl" style="margin-top:12px">To this ' + esc(sel.network) + ' address</div><div class="addr" id="addr">' + addr + '</div><button class="cp" type="button" id="cp">Copy address</button></div></section>' +
  '<div class="steps" aria-label="Payment progress"><div class="st now"><span class="dot"></span>Waiting</div><div class="st"><span class="dot"></span>Seen on chain</div><div class="st"><span class="dot"></span>Confirmed</div></div>' +
  '<div class="meta"><span>Rate locked for <b id="cd">59:59</b></span><span>' + (sel.id === 'BTC' ? '2 confirmations' : '20 confirmations') + '</span></div>' +
  '<form method="post" action="' + esc(action) + '" id="f"><input type="hidden" name="coin" value="' + sel.id + '"><button class="go" type="submit">Simulate payment<span>→</span></button></form>' +
  '<p class="note">Sandbox mode: this address is made up. Add your Gatevoo keys and customers will see the real Gatevoo checkout here.</p>' +
  '<a class="back" href="' + esc(cancelUrl) + '">Cancel and go back</a>' +
  '</main><div class="foot">' + MARK(18) + 'Secured by Gatevoo · straight to the merchant’s wallet</div>' +
  '<div class="done" id="done" role="status" aria-live="polite"><div><div class="tick"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><strong style="font-size:22px;letter-spacing:-.03em">Payment received</strong><p style="color:#77736A;margin:6px 0 0">Taking you back to Replyvoo…</p></div></div>' +
  '<script src="/js/gatevoo-checkout.js" defer></script>' +
  '</body></html>';
}

module.exports = { render, MARK, fakeAddress };
