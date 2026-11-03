'use strict';
// Inline SVG art for the marketing site: characters, icons, brand tiles and generated blog covers.
// All functions return SVG strings. Nothing here comes from the database except escaped text.

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F0AE00" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:0 0 18px;margin-top:2px"><path d="M5 12l5 5 9-10"/></svg>';
const CHECK_INK = (s = 18) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="#121110" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
const ARROW = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#121110" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const LOGO_MARK = (stroke = '#FFC21A', s = 22) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="' + stroke + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.2-4.2A7.5 7.5 0 1 1 20 11.5z"/><path d="M9 11.5l2 2 4-4"/></svg>';

const I = {
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z', fire: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 2 2 3 2 0-2-1-4 0-6z', mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z', card: 'M3 6h18v12H3zM3 10h18', moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', layers: 'M12 3 2 8l10 5 10-5zM2 16l10 5 10-5M2 12l10 5 10-5',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z', link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7', chat: 'M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.2-4.2A7.5 7.5 0 1 1 20 11.5z', doc: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6', star: 'M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z',
  menu: 'M4 7h16M4 12h16M4 17h16', close: 'M6 6l12 12M18 6 6 18', copy: 'M9 9h11v11H9zM5 15H4V4h11v1', share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4'
};
function ic(d, c, s, sw) { return '<svg width="' + (s || 22) + '" height="' + (s || 22) + '" viewBox="0 0 24 24" fill="none" stroke="' + (c || '#121110') + '" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (I[d] || d) + '"/></svg>'; }

// Channel icons inside each brand's colour, labelled with the name in text next to them.
// Official brand glyphs (Simple Icons, CC0), white on the brand colour.
const BRAND_D = {"telegram":"M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z","whatsapp":"M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z","instagram":"M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077","tiktok":"M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"};
function brandIcon(id, size = 48) {
  const r = Math.round(size * 0.3);
  const wrap = (bg, inner, extra = '') => '<span class="brand-ic" aria-hidden="true" style="width:' + size + 'px;height:' + size + 'px;flex:0 0 ' + size + 'px;border-radius:' + r + 'px;background:' + bg + ';display:inline-flex;align-items:center;justify-content:center;' + extra + '">' + inner + '</span>';
  const s = Math.round(size * 0.55);
  const glyph = (k, sc = 0.58) => { const g = Math.round(size * sc); return "<svg width=\"" + g + "\" height=\"" + g + "\" viewBox=\"0 0 24 24\" fill=\"#FFFFFF\"><path d=\"" + BRAND_D[k] + "\"/></svg>"; };
  const svg = body => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
  switch (id) {
    case 'telegram': return wrap('#2AABEE', glyph('telegram', 0.62));
    case 'whatsapp': return wrap('#25D366', glyph('whatsapp'));
    case 'instagram': return wrap('linear-gradient(45deg,#F9A825,#E1306C 55%,#8E3BCB)', glyph('instagram', 0.54));
    case 'tiktok': return wrap('#121110', glyph('tiktok', 0.52));
    case 'website': return wrap('#FFC21A', svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>').replace('stroke="#FFFFFF"', 'stroke="#121110"'));
    case 'messenger': return wrap('#6D5BFF', svg('<path d="M12 3c5 0 9 3.6 9 8.2s-4 8.2-9 8.2c-.9 0-1.8-.1-2.6-.3L5 21v-3.6C3.8 16 3 14.2 3 11.2 3 6.6 7 3 12 3z"/><path d="M13 7.5 9.5 12.5h3l-1 4 3.5-5h-3z" fill="#FFFFFF" stroke="none"/>'));
    default: return wrap('#121110', svg('<path d="' + I.chat + '"/>'));
  }
}

function closerBot(color, w, letter) {
  const h = Math.round(w * 130 / 120);
  return '<svg viewBox="0 0 120 130" width="' + w + '" height="' + h + '" aria-hidden="true"><g class="a-float">' +
    '<path d="M60 8v14" stroke="#121110" stroke-width="4" stroke-linecap="round"/><circle class="a-glow" cx="60" cy="8" r="7" fill="' + color + '" stroke="#121110" stroke-width="3"/>' +
    '<rect x="8" y="44" width="12" height="22" rx="6" fill="#121110"/><rect x="100" y="44" width="12" height="22" rx="6" fill="#121110"/>' +
    '<rect x="16" y="22" width="88" height="64" rx="26" fill="' + color + '" stroke="#121110" stroke-width="4"/>' +
    '<rect x="28" y="34" width="64" height="40" rx="16" fill="#121110"/>' +
    '<g class="a-blink"><rect x="42" y="45" width="10" height="14" rx="5" fill="' + color + '"/><rect x="68" y="45" width="10" height="14" rx="5" fill="' + color + '"/></g>' +
    '<path d="M51 64q9 7 18 0" stroke="' + color + '" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
    '<path d="M34 92h52a12 12 0 0 1 12 12v22H22v-22a12 12 0 0 1 12-12z" fill="' + color + '" stroke="#121110" stroke-width="4"/>' +
    '<circle cx="60" cy="110" r="10" fill="#121110"/><text x="60" y="114.5" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-weight="800" font-size="12" fill="' + color + '">' + esc(letter || '') + '</text>' +
    '</g></svg>';
}

function junoArt(w, onDark, label) {
  const stroke = onDark ? '#FFFFFF' : '#121110';
  return '<svg class="a-float" width="' + w + '" height="' + w + '" viewBox="0 0 250 250" ' + (label === false ? 'aria-hidden="true"' : 'role="img" aria-label="Juno, the Replyvoo assistant, waving"') + '>' +
    '<ellipse cx="125" cy="236" rx="70" ry="9" fill="#121110" opacity=".14"/>' +
    '<path d="M60 70c0-28 22-46 50-46h30c28 0 50 18 50 46v60c0 28-22 46-50 46h-36l-30 26 4-30c-12-8-18-22-18-42z" fill="#FFFFFF" stroke="' + stroke + '" stroke-width="6" stroke-linejoin="round"/>' +
    '<g class="a-blink"><circle cx="104" cy="96" r="11" fill="#121110"/><circle cx="148" cy="96" r="11" fill="#121110"/></g>' +
    '<circle cx="108" cy="92" r="3.5" fill="#FFFFFF"/><circle cx="152" cy="92" r="3.5" fill="#FFFFFF"/>' +
    '<path d="M108 126q18 16 36 0" stroke="#121110" stroke-width="6" fill="none" stroke-linecap="round"/>' +
    '<circle cx="86" cy="118" r="9" fill="#FFC21A" opacity=".9"/><circle cx="166" cy="118" r="9" fill="#FFC21A" opacity=".9"/>' +
    '<g class="a-wave"><path d="M190 110c14-6 24-22 26-40" stroke="' + stroke + '" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="217" cy="64" r="11" fill="#FFFFFF" stroke="' + stroke + '" stroke-width="6"/></g>' +
    '<path d="M125 24v-12" stroke="' + stroke + '" stroke-width="6" stroke-linecap="round"/><circle cx="125" cy="9" r="8" fill="#FFC21A" stroke="' + stroke + '" stroke-width="4"/></svg>';
}

function moneyGuy(w) {
  let coins = '';
  [[70, 0], [330, 0.6], [110, 1.2], [300, 1.8], [200, 0.9]].forEach(c => { coins += '<g class="a-coin" style="animation-delay:' + c[1] + 's;transform-box:fill-box;transform-origin:center"><circle cx="' + c[0] + '" cy="70" r="15" fill="#FFC21A" stroke="#121110" stroke-width="3"/><text x="' + c[0] + '" y="75" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-weight="800" font-size="13" fill="#121110">V</text></g>'; });
  return '<svg viewBox="0 0 420 420" width="' + w + '" style="max-width:100%;height:auto" role="img" aria-label="A happy person holding a fan of cash while coins rain down">' +
    '<circle cx="210" cy="226" r="168" fill="#FFF3CC"/><circle cx="210" cy="226" r="126" fill="#FFE58A" opacity=".6"/>' + coins +
    '<g class="a-glow"><path d="M60 170l5 12 12 5-12 5-5 12-5-12-12-5 12-5z" fill="#FFC21A"/><path d="M360 150l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#121110"/></g>' +
    '<path d="M110 420c0-100 44-146 100-146s100 46 100 146z" fill="#121110"/>' +
    '<path d="M184 276l26 34 26-34" fill="#FFC21A"/><path d="M196 276l14 22 14-22" fill="#FFFFFF"/>' +
    '<rect x="196" y="236" width="28" height="40" rx="12" fill="#C68642"/>' +
    '<g class="a-head"><circle cx="210" cy="196" r="56" fill="#C68642"/>' +
    '<path d="M152 186c2-40 28-60 58-60s56 20 58 60c-10-18-28-26-58-26s-48 8-58 26z" fill="#1E1611"/>' +
    '<rect x="168" y="182" width="34" height="22" rx="9" fill="#121110"/><rect x="218" y="182" width="34" height="22" rx="9" fill="#121110"/><path d="M202 190h16" stroke="#121110" stroke-width="5"/><path d="M174 188l8 0" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity=".7"/>' +
    '<path d="M186 220q24 22 48 0z" fill="#FFFFFF" stroke="#121110" stroke-width="4" stroke-linejoin="round"/></g>' +
    '<path d="M140 330c-20-30-30-70-24-104" stroke="#C68642" stroke-width="26" stroke-linecap="round" fill="none"/>' +
    '<g class="a-flutter"><rect x="70" y="150" width="70" height="40" rx="6" fill="#3DBB6E" stroke="#121110" stroke-width="3" transform="rotate(-28 105 170)"/><text x="98" y="160" font-family="Plus Jakarta Sans,sans-serif" font-weight="800" font-size="18" fill="#121110" transform="rotate(-28 105 170)">$</text></g>' +
    '<g class="a-flutter2"><rect x="88" y="136" width="70" height="40" rx="6" fill="#2E9E5B" stroke="#121110" stroke-width="3" transform="rotate(-8 123 156)"/><text x="116" y="162" font-family="Plus Jakarta Sans,sans-serif" font-weight="800" font-size="18" fill="#121110" transform="rotate(-8 123 156)">$</text></g>' +
    '<g class="a-flutter"><rect x="104" y="128" width="70" height="40" rx="6" fill="#57D08A" stroke="#121110" stroke-width="3" transform="rotate(14 139 148)"/><text x="132" y="155" font-family="Plus Jakarta Sans,sans-serif" font-weight="800" font-size="18" fill="#121110" transform="rotate(14 139 148)">$</text></g>' +
    '<circle cx="118" cy="216" r="16" fill="#C68642"/>' +
    '<path d="M282 330c20-20 34-46 38-70" stroke="#C68642" stroke-width="26" stroke-linecap="round" fill="none"/>' +
    '<g class="a-float"><rect x="292" y="210" width="86" height="58" rx="14" fill="#FFC21A" stroke="#121110" stroke-width="4"/><rect x="340" y="228" width="38" height="22" rx="8" fill="#121110"/><circle cx="352" cy="239" r="5" fill="#FFC21A"/><text x="308" y="246" font-family="Plus Jakarta Sans,sans-serif" font-weight="800" font-size="18" fill="#121110">V</text></g>' +
    '<circle cx="318" cy="262" r="15" fill="#C68642"/>' +
    '</svg>';
}

function people(w) {
  return '<svg viewBox="0 0 600 190" width="' + w + '" style="max-width:100%;height:auto;display:block" role="img" aria-label="Three happy Replyvoo users waving">' +
    '<path d="M60 190c0-50 30-72 70-72s70 22 70 72z" fill="#FFC21A"/><circle cx="130" cy="78" r="40" fill="#E0AC69"/><path d="M88 74c2-30 22-44 42-44s40 14 42 44c-12-10-26-16-42-16s-30 6-42 16z" fill="#6B3E26"/>' +
    '<path d="M114 82q7 6 14 0M136 82q7 6 14 0" stroke="#121110" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M118 98q12 10 24 0" stroke="#121110" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
    '<g class="a-wave"><path d="M70 150c-10-20-12-46-6-66" stroke="#E0AC69" stroke-width="16" stroke-linecap="round" fill="none"/></g>' +
    '<path d="M230 190c0-56 32-80 70-80s70 24 70 80z" fill="#FFFFFF"/><circle cx="300" cy="60" r="46" fill="#1E1611"/><circle cx="300" cy="72" r="40" fill="#8D5524"/>' +
    '<path d="M284 74q7 6 14 0M304 74q7 6 14 0" stroke="#121110" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M286 92q14 12 28 0" stroke="#121110" stroke-width="3.5" fill="#FFFFFF" stroke-linecap="round"/>' +
    '<g class="a-wave2"><path d="M368 146c12-18 16-44 10-64" stroke="#8D5524" stroke-width="16" stroke-linecap="round" fill="none"/></g>' +
    '<path d="M400 190c0-50 30-72 70-72s70 22 70 72z" fill="#8FB8FF"/><circle cx="470" cy="80" r="40" fill="#F5D0A9"/><path d="M428 82c-2-34 18-50 42-50s44 16 42 50c-6-14-16-22-26-24-10 6-30 6-42 0-8 4-14 12-16 24z" fill="#D9A441"/>' +
    '<rect x="446" y="74" width="20" height="14" rx="6" fill="none" stroke="#121110" stroke-width="3"/><rect x="474" y="74" width="20" height="14" rx="6" fill="none" stroke="#121110" stroke-width="3"/><path d="M466 80h8" stroke="#121110" stroke-width="3"/>' +
    '<path d="M460 100q10 8 20 0" stroke="#121110" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
    '<g class="a-wave3"><path d="M540 150c10-20 12-46 6-66" stroke="#F5D0A9" stroke-width="16" stroke-linecap="round" fill="none"/></g></svg>';
}

function squadArt(w) {
  return '<svg viewBox="0 0 360 300" width="' + w + '" style="max-width:100%;height:auto" role="img" aria-label="Two friends high-fiving while coins fly up">' +
    '<circle cx="180" cy="170" r="120" fill="#1E1611"/><circle cx="180" cy="170" r="86" fill="#2C2925"/>' +
    '<g class="a-coin" style="animation-direction:reverse;transform-box:fill-box"><circle cx="180" cy="60" r="16" fill="#FFC21A" stroke="#121110" stroke-width="3"/><text x="180" y="65" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-weight="800" font-size="13" fill="#121110">V</text></g>' +
    '<g class="a-coin" style="animation-direction:reverse;animation-delay:.8s;transform-box:fill-box"><circle cx="150" cy="80" r="12" fill="#FFC21A" stroke="#121110" stroke-width="3"/></g>' +
    '<g class="a-coin" style="animation-direction:reverse;animation-delay:1.6s;transform-box:fill-box"><circle cx="212" cy="76" r="12" fill="#FFC21A" stroke="#121110" stroke-width="3"/></g>' +
    '<path d="M40 300c0-60 26-88 64-88s64 28 64 88z" fill="#FFC21A"/><circle cx="104" cy="176" r="36" fill="#E0AC69"/><path d="M68 170c2-26 18-38 36-38s34 12 36 38c-10-8-22-12-36-12s-26 4-36 12z" fill="#6B3E26"/>' +
    '<path d="M92 178q6-5 12 0M108 178q6-5 12 0" stroke="#121110" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M94 192q10 9 20 0" stroke="#121110" stroke-width="3" fill="#FFFFFF" stroke-linecap="round"/>' +
    '<path d="M150 236c12-24 18-50 22-80" stroke="#E0AC69" stroke-width="18" stroke-linecap="round" fill="none"/>' +
    '<path d="M192 300c0-60 26-88 64-88s64 28 64 88z" fill="#FFFFFF"/><circle cx="256" cy="176" r="36" fill="#8D5524"/><path d="M220 172c0-28 16-42 36-42s36 14 36 42c-6-10-20-16-36-16s-30 6-36 16z" fill="#1E1611"/>' +
    '<path d="M244 178q6-5 12 0M260 178q6-5 12 0" stroke="#121110" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M246 192q10 9 20 0" stroke="#121110" stroke-width="3" fill="#FFFFFF" stroke-linecap="round"/>' +
    '<path d="M210 236c-12-24-18-50-22-80" stroke="#8D5524" stroke-width="18" stroke-linecap="round" fill="none"/>' +
    '<g class="a-glow"><path d="M180 132l6 14 14 6-14 6-6 14-6-14-14-6 14-6z" fill="#FFC21A"/></g></svg>';
}

// Support agent at a laptop (hero).
function heroScene() {
  return '<svg viewBox="0 0 560 500" style="position:absolute;inset:0;width:100%;height:100%" role="img" aria-label="An AI-powered support agent with a headset, typing replies on a laptop">' +
    '<circle cx="280" cy="262" r="178" fill="#FFF3CC"/><circle cx="280" cy="262" r="132" fill="#FFE58A" opacity=".6"/>' +
    '<path class="a-leaf" d="M104 384c-20-40-12-82 8-104 10 30 10 72-8 104z" fill="#2E9E5B"/>' +
    '<path class="a-leaf2" d="M110 384c6-46 34-74 62-82-6 34-28 66-62 82z" fill="#3DBB6E"/>' +
    '<path class="a-leaf" d="M100 384c-30-24-46-58-40-88 26 18 40 50 40 88z" fill="#26874D"/>' +
    '<rect x="76" y="380" width="62" height="76" rx="12" fill="#121110"/><rect x="76" y="380" width="62" height="12" rx="6" fill="#2C2925"/>' +
    '<path class="a-steam" d="M440 386c-6-8 6-14 0-22" stroke="#CFC9BB" stroke-width="4" stroke-linecap="round" fill="none"/>' +
    '<path class="a-steam2" d="M456 386c-6-8 6-14 0-22" stroke="#CFC9BB" stroke-width="4" stroke-linecap="round" fill="none"/>' +
    '<rect x="424" y="398" width="48" height="58" rx="10" fill="#FFFFFF" stroke="#121110" stroke-width="4"/>' +
    '<path d="M472 412c16 0 16 26 0 26" stroke="#121110" stroke-width="4" fill="none"/><rect x="434" y="418" width="28" height="8" rx="4" fill="#FFC21A"/>' +
    '<path d="M186 456c0-92 40-132 94-132s94 40 94 132z" fill="#121110"/>' +
    '<path d="M232 340c14 16 30 24 48 24s34-8 48-24" stroke="#FFC21A" stroke-width="5" fill="none" stroke-linecap="round"/>' +
    '<path d="M262 362v26M298 362v26" stroke="#FFC21A" stroke-width="4" stroke-linecap="round"/>' +
    '<rect x="265" y="290" width="30" height="40" rx="12" fill="#8D5524"/>' +
    '<g class="a-head">' +
    '<circle cx="280" cy="214" r="70" fill="#2B1D14"/><circle cx="280" cy="136" r="30" fill="#2B1D14"/>' +
    '<circle cx="280" cy="236" r="56" fill="#8D5524"/>' +
    '<path d="M232 212c10-24 32-38 48-38s38 14 48 38c-14-6-30-18-48-18s-34 12-48 18z" fill="#2B1D14"/>' +
    '<path d="M252 238q9 8 18 0M290 238q9 8 18 0" stroke="#121110" stroke-width="4.5" fill="none" stroke-linecap="round"/>' +
    '<path d="M266 262q14 12 28 0" stroke="#121110" stroke-width="4.5" fill="#FFFFFF" stroke-linecap="round"/>' +
    '<circle cx="248" cy="254" r="8" fill="#C46A4A" opacity=".55"/><circle cx="312" cy="254" r="8" fill="#C46A4A" opacity=".55"/>' +
    '<path d="M214 226c0-70 132-70 132 0" stroke="#121110" stroke-width="10" fill="none" stroke-linecap="round"/>' +
    '<rect x="202" y="216" width="24" height="40" rx="11" fill="#121110"/><rect x="334" y="216" width="24" height="40" rx="11" fill="#121110"/>' +
    '<path d="M214 254c4 30 26 40 46 36" stroke="#121110" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="262" cy="290" r="6" fill="#FFC21A"/>' +
    '</g>' +
    '<rect class="a-arm-l" x="210" y="372" width="38" height="70" rx="19" fill="#2C2925"/>' +
    '<rect class="a-arm-r" x="312" y="372" width="38" height="70" rx="19" fill="#2C2925"/>' +
    '<rect x="166" y="352" width="228" height="104" rx="16" fill="#FFFFFF" stroke="#121110" stroke-width="4"/>' +
    '<circle cx="280" cy="400" r="22" fill="#FFC21A"/><path d="M270 400l7 7 13-13" stroke="#121110" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<rect x="40" y="454" width="480" height="16" rx="8" fill="#121110"/>' +
    '<g class="a-rise"><rect x="372" y="250" width="70" height="34" rx="17" fill="#FFFFFF" stroke="#121110" stroke-width="3"/><circle cx="392" cy="267" r="4" fill="#121110"/><circle cx="407" cy="267" r="4" fill="#121110"/><circle cx="422" cy="267" r="4" fill="#121110"/></g>' +
    '<g class="a-rise2"><rect x="120" y="230" width="80" height="34" rx="17" fill="#FFC21A" stroke="#121110" stroke-width="3"/><path d="M140 247h40" stroke="#121110" stroke-width="4" stroke-linecap="round"/></g>' +
    '<g class="a-rise3"><rect x="390" y="180" width="62" height="32" rx="16" fill="#121110"/><path d="M408 196l6 6 12-12" stroke="#FFC21A" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>' +
    '</svg>';
}

// Stressed staff member buried in unread messages (manual vs automatic).
function stressedStaff() {
  return '<svg viewBox="0 0 420 260" style="width:100%;height:auto" role="img" aria-label="A stressed staff member buried in unread messages">' +
    '<rect x="0" y="0" width="420" height="260" rx="22" fill="#FAF9F5"/>' +
    '<circle class="a-shake" cx="340" cy="56" r="30" fill="#FFFFFF" stroke="#121110" stroke-width="3"/>' +
    '<path d="M340 56V38M340 56l12 8" stroke="#121110" stroke-width="3.5" stroke-linecap="round"/>' +
    '<rect x="40" y="212" width="340" height="14" rx="7" fill="#121110"/>' +
    '<path d="M140 212c0-62 30-90 70-90s70 28 70 90z" fill="#7A7468"/>' +
    '<rect x="198" y="96" width="24" height="30" rx="10" fill="#E0AC69"/>' +
    '<circle cx="210" cy="80" r="40" fill="#E0AC69"/>' +
    '<path d="M170 76c-2-26 18-40 40-40s42 14 40 40c-4-8-10-14-18-16 2 6-2 10-6 8-6-6-14-8-22-6-10 2-20 6-34 14z" fill="#3A2A20"/>' +
    '<path d="M192 72l12 4M228 72l-12 4" stroke="#121110" stroke-width="3" stroke-linecap="round"/>' +
    '<circle cx="198" cy="84" r="3.5" fill="#121110"/><circle cx="222" cy="84" r="3.5" fill="#121110"/>' +
    '<ellipse cx="210" cy="102" rx="7" ry="5" fill="#121110"/>' +
    '<path class="a-drip" d="M250 70c4 6 6 10 2 12-4 2-6-2-4-6z" fill="#7CC6F2"/>' +
    '<path class="a-drip2" d="M168 66c4 6 6 10 2 12-4 2-6-2-4-6z" fill="#7CC6F2"/>' +
    '<g class="a-shake"><rect x="232" y="150" width="34" height="58" rx="8" fill="#121110"/><rect x="236" y="156" width="26" height="40" rx="4" fill="#FF7A59"/></g>' +
    '<rect x="60" y="150" width="70" height="56" rx="8" fill="#FFFFFF" stroke="#121110" stroke-width="3"/>' +
    '<path d="M72 166h46M72 178h34M72 190h40" stroke="#CFC9BB" stroke-width="4" stroke-linecap="round"/>' +
    '<g class="a-rise"><rect x="30" y="40" width="96" height="30" rx="15" fill="#FFFFFF" stroke="#E2DDD0" stroke-width="2"/><circle cx="48" cy="55" r="8" fill="#FF7A59"/><path d="M62 55h50" stroke="#CFC9BB" stroke-width="4" stroke-linecap="round"/></g>' +
    '<g class="a-rise2"><rect x="20" y="90" width="110" height="30" rx="15" fill="#FFFFFF" stroke="#E2DDD0" stroke-width="2"/><circle cx="38" cy="105" r="8" fill="#FF7A59"/><path d="M52 105h62" stroke="#CFC9BB" stroke-width="4" stroke-linecap="round"/></g>' +
    '<g class="a-rise3"><rect x="290" y="110" width="104" height="30" rx="15" fill="#FFFFFF" stroke="#E2DDD0" stroke-width="2"/><circle cx="308" cy="125" r="8" fill="#FF7A59"/><path d="M322 125h56" stroke="#CFC9BB" stroke-width="4" stroke-linecap="round"/></g>' +
    '</svg>';
}

// ---------- Blog covers: one generated illustration per `cover` keyword, tinted per category ----------
const CAT_BG = {
  Training: ['#FFD23F', '#FFC21A'], Sales: ['#FFB199', '#FFD23F'], Operations: ['#2C2925', '#121110'], Product: ['#C9A7FF', '#8FB8FF'],
  Growth: ['#7EE0B0', '#C6F36B'], Guides: ['#8FD3FF', '#2AABEE'], Playbook: ['#FFE07A', '#FFB199'], News: ['#FFF3CC', '#FFD23F']
};
function catBg(cat) { const c = CAT_BG[cat] || ['#FFD23F', '#FFC21A']; return 'linear-gradient(135deg,' + c[0] + ',' + c[1] + ')'; }
function catDark(cat) { return cat === 'Operations'; }

function coverArt(keyword, cat, uid) {
  const k = String(keyword || '').toLowerCase();
  const dark = catDark(cat);
  const ink = '#121110';
  const id = 'cv' + String(uid || k).replace(/[^a-z0-9]/gi, '');
  const dots = '<pattern id="' + id + '" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="' + (dark ? '#FFFFFF' : ink) + '" opacity=".14"/></pattern><rect width="640" height="400" fill="url(#' + id + ')"/>';
  const ring = '<circle cx="320" cy="210" r="150" fill="' + (dark ? '#2C2925' : '#FFFFFF') + '" opacity="' + (dark ? '1' : '.35') + '"/><circle cx="320" cy="210" r="104" fill="' + (dark ? '#1E1C19' : '#FFFFFF') + '" opacity="' + (dark ? '1' : '.45') + '"/>';
  let art;
  switch (k) {
    case 'rocket':
      art = '<g class="a-float"><path d="M320 92c40 30 58 86 46 150h-92c-12-64 6-120 46-150z" fill="#FFFFFF" stroke="' + ink + '" stroke-width="7" stroke-linejoin="round"/>' +
        '<circle cx="320" cy="170" r="22" fill="#2AABEE" stroke="' + ink + '" stroke-width="7"/><path d="M274 214l-34 30 4 36 36-26zM366 214l34 30-4 36-36-26z" fill="#FF7A59" stroke="' + ink + '" stroke-width="7" stroke-linejoin="round"/>' +
        '<path class="a-glow" d="M292 246c4 34 14 52 28 66 14-14 24-32 28-66z" fill="#FFC21A" stroke="' + ink + '" stroke-width="6" stroke-linejoin="round"/></g>' +
        '<g class="a-rise"><circle cx="190" cy="270" r="9" fill="' + ink + '"/></g><g class="a-rise2"><circle cx="450" cy="250" r="7" fill="' + ink + '"/></g><path d="M170 120l6 14 14 6-14 6-6 14-6-14-14-6 14-6z" fill="' + ink + '"/><path d="M470 110l5 11 11 5-11 5-5 11-5-11-11-5 11-5z" fill="#FFFFFF" stroke="' + ink + '" stroke-width="3"/>';
      break;
    case 'telegram': case 'plane':
      art = '<g class="a-float"><circle cx="320" cy="205" r="92" fill="#2AABEE" stroke="' + ink + '" stroke-width="7"/><path d="M270 205l112-44-24 108-30-24-18 20v-30l42-40-56 30z" fill="#FFFFFF" stroke="' + ink + '" stroke-width="6" stroke-linejoin="round"/></g>' +
        '<g class="a-rise"><rect x="138" y="140" width="96" height="40" rx="20" fill="#FFFFFF" stroke="' + ink + '" stroke-width="5"/><circle cx="162" cy="160" r="5" fill="' + ink + '"/><circle cx="186" cy="160" r="5" fill="' + ink + '"/><circle cx="210" cy="160" r="5" fill="' + ink + '"/></g>' +
        '<g class="a-rise2"><rect x="414" y="226" width="96" height="40" rx="20" fill="' + ink + '"/><path d="M444 246l10 10 20-20" stroke="#FFC21A" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>';
      break;
    case 'phone':
      art = '<g class="a-float"><rect x="262" y="78" width="116" height="236" rx="26" fill="' + ink + '"/><rect x="274" y="96" width="92" height="196" rx="16" fill="#FFF7DD"/>' +
        '<rect x="284" y="116" width="58" height="22" rx="11" fill="#FFFFFF"/><rect x="300" y="148" width="58" height="22" rx="11" fill="#FFC21A"/><rect x="284" y="180" width="70" height="22" rx="11" fill="#FFFFFF"/><rect x="306" y="212" width="52" height="22" rx="11" fill="#FFC21A"/></g>' +
        '<g class="a-rise"><circle cx="200" cy="160" r="26" fill="#FFFFFF" stroke="' + ink + '" stroke-width="5"/><path d="M190 160l7 7 13-13" stroke="' + ink + '" stroke-width="5" fill="none" stroke-linecap="round"/></g>';
      break;
    case 'brain': case 'juno':
      art = '<g transform="translate(205 80)">' + junoArt(230, false, false).replace('<svg class="a-float" width="230" height="230"', '<svg class="a-float" width="230" height="230" x="0" y="0"') + '</g>' +
        '<g class="a-rise"><rect x="440" y="150" width="90" height="36" rx="18" fill="' + ink + '"/><path d="M462 168h46" stroke="#FFC21A" stroke-width="6" stroke-linecap="round"/></g>';
      break;
    case 'closer':
      art = '<g transform="translate(250 95)">' + closerBot('#FFC21A', 140, 'A') + '</g><g transform="translate(140 175) scale(.7)">' + closerBot('#8FB8FF', 120, 'M') + '</g><g transform="translate(410 175) scale(.7)">' + closerBot('#7EE0B0', 120, 'B') + '</g>';
      break;
    case 'inbox':
      art = '<g class="a-float"><rect x="190" y="96" width="260" height="210" rx="26" fill="#FFFFFF" stroke="' + ink + '" stroke-width="7"/>' +
        [0, 1, 2].map(i => '<g><circle cx="230" cy="' + (140 + i * 52) + '" r="16" fill="' + ['#FFC21A', '#8FB8FF', '#FFB199'][i] + '" stroke="' + ink + '" stroke-width="4"/><rect x="258" y="' + (130 + i * 52) + '" width="' + [120, 96, 140][i] + '" height="10" rx="5" fill="' + ink + '"/><rect x="258" y="' + (146 + i * 52) + '" width="' + [80, 110, 70][i] + '" height="8" rx="4" fill="#CFC9BB"/></g>').join('') +
        '</g><g class="a-rise"><rect x="400" y="80" width="84" height="34" rx="17" fill="' + ink + '"/><text x="442" y="103" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-weight="800" font-size="16" fill="#FFC21A">LIVE</text></g>';
      break;
    case 'chart':
      art = '<g class="a-float"><rect x="190" y="100" width="260" height="200" rx="26" fill="#FFFFFF" stroke="' + ink + '" stroke-width="7"/>' +
        '<rect x="226" y="220" width="34" height="50" rx="8" fill="#E2DDD0"/><rect x="276" y="186" width="34" height="84" rx="8" fill="#FFE07A"/><rect x="326" y="156" width="34" height="114" rx="8" fill="#FFC21A"/><rect x="376" y="124" width="34" height="146" rx="8" fill="#FF7A59" stroke="' + ink + '" stroke-width="4"/></g>' +
        '<g class="a-rise"><path d="M470 120c6 12 2 22-6 28 2-8 0-14-6-18 0 10-8 14-8 24a14 14 0 0 0 28 0c0-14-8-22-8-34z" fill="#FF7A59" stroke="' + ink + '" stroke-width="4"/></g>';
      break;
    case 'credits': case 'wallet':
      art = '<g class="a-float"><rect x="214" y="132" width="212" height="140" rx="26" fill="#FFC21A" stroke="' + ink + '" stroke-width="7"/><rect x="340" y="176" width="86" height="52" rx="16" fill="' + ink + '"/><circle cx="366" cy="202" r="10" fill="#FFC21A"/><text x="262" y="222" font-family="Plus Jakarta Sans,sans-serif" font-weight="800" font-size="54" fill="' + ink + '">V</text></g>' +
        [[180, 0], [460, 0.8], [320, 1.6]].map(c => '<g class="a-coin" style="animation-delay:' + c[1] + 's;transform-box:fill-box;transform-origin:center"><circle cx="' + c[0] + '" cy="90" r="20" fill="#FFF7DD" stroke="' + ink + '" stroke-width="4"/><text x="' + c[0] + '" y="97" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-weight="800" font-size="18" fill="' + ink + '">V</text></g>').join('');
      break;
    case 'shield':
      art = '<g class="a-float"><path d="M320 86l100 36v74c0 62-44 100-100 114-56-14-100-52-100-114v-74z" fill="#FFFFFF" stroke="' + ink + '" stroke-width="7" stroke-linejoin="round"/><path d="M280 200l28 28 52-56" stroke="#2E9E5B" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>' +
        '<g class="a-rise"><rect x="130" y="130" width="70" height="34" rx="17" fill="#FF7A59" stroke="' + ink + '" stroke-width="4"/><path d="M152 140l26 14M178 140l-26 14" stroke="' + ink + '" stroke-width="4" stroke-linecap="round"/></g>' +
        '<g class="a-rise2"><rect x="446" y="210" width="70" height="34" rx="17" fill="#FF7A59" stroke="' + ink + '" stroke-width="4"/><path d="M468 220l26 14M494 220l-26 14" stroke="' + ink + '" stroke-width="4" stroke-linecap="round"/></g>';
      break;
    default:
      art = '<g class="a-float"><rect x="220" y="110" width="200" height="150" rx="40" fill="#FFFFFF" stroke="' + ink + '" stroke-width="7"/><path d="M262 260l-10 44 46-44" fill="#FFFFFF" stroke="' + ink + '" stroke-width="7" stroke-linejoin="round"/><circle cx="280" cy="185" r="10" fill="' + ink + '"/><circle cx="320" cy="185" r="10" fill="' + ink + '"/><circle cx="360" cy="185" r="10" fill="' + ink + '"/></g>';
  }
  return '<svg viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%" aria-hidden="true">' + dots + ring + art + '</svg>';
}

module.exports = { esc, CHECK, CHECK_INK, ARROW, LOGO_MARK, I, ic, brandIcon, closerBot, junoArt, moneyGuy, people, squadArt, heroScene, stressedStaff, coverArt, catBg, catDark };
