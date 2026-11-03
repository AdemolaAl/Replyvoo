/* Replyvoo dashboard: inline SVG art (Closer bots, Juno, Moji avatars, characters, icons, brand tiles). */
(function () {
  'use strict';
  const RV = window.RV;
  const esc = RV.esc;

  /* ---------- icons ---------- */
  const I = {
    home: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z',
    live: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', // plain eye (no radar ripples)
    inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
    fire: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 2 2 3 2 0-2-1-4 0-6z',
    bot: 'M12 8V4H8M4 8h16v12H4zM2 14h2M20 14h2M9 13v2M15 13v2',
    pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
    send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
    chat: 'M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.2-4.2A7.5 7.5 0 1 1 20 11.5z',
    wallet: 'M3 7h18v12H3zM3 7l3-4h12l3 4M16 13h2',
    squad: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
    card: 'M3 6h18v12H3zM3 10h18',
    plane: 'M21.5 4.2 2.9 11.4l6.3 2.7 9-6.6-7.1 7.6 6.6 4.9z',
    team: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
    menu: 'M4 7h16M4 12h16M4 17h16',
    plus: 'M12 5v14M5 12h14',
    back: 'M15 6l-6 6 6 6',
    right: 'M5 12h14M13 6l6 6-6 6',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
    image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01',
    download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
    logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    spark: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
    bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    joinvoo: 'M4 19V5M4 19h16M8 15l4-4 3 3 5-6',
    check: 'M5 12l5 5 9-10',
    play: 'M8 5v14l11-7z',
    x: 'M6 6l12 12M18 6 6 18',
    upgrade: 'M12 19V5M5 12l7-7 7 7',
    globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18',
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
  };
  function ic(name, color, size, sw) { const d = I[name] || name; return '<svg width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="' + (color || 'currentColor') + '" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'; }
  function svgI(name) { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (I[name] || name) + '"/></svg>'; }
  const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F0AE00" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 18px;margin-top:2px" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  // VooSquare mark (the user's own brand): green tile with a 2x2 grid, one lime square.
  const vooMark = (s = 16) => '<svg class="voo-mark" width="' + s + '" height="' + s + '" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="vqg' + s + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#18C784"/><stop offset="1" stop-color="#067A4A"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#vqg' + s + ')"/><rect x="14" y="14" width="16" height="16" rx="5" fill="#fff"/><rect x="34" y="14" width="16" height="16" rx="5" fill="#C4E8DA"/><rect x="14" y="34" width="16" height="16" rx="5" fill="#C4E8DA"/><rect x="34" y="34" width="16" height="16" rx="5" fill="#C8F55A"/></svg>';
  const VOO_WORD = '<span class="voo-word">Voo<b>Square</b></span>';
  const LOGO = '<span class="logo-mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#121110" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.2-4.2A7.5 7.5 0 1 1 20 11.5z"/><path d="M9 11.5l2 2 4-4"/></svg></span>';

  /* ---------- characters ---------- */
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
  function junoArt(w, onDark) {
    const stroke = onDark ? '#FFFFFF' : '#121110';
    return '<svg class="a-float" width="' + w + '" height="' + w + '" viewBox="0 0 250 250" role="img" aria-label="Juno, the Replyvoo assistant, waving">' +
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
      '<circle cx="318" cy="262" r="15" fill="#C68642"/></svg>';
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
  function people(w) {
    return '<svg viewBox="0 0 600 190" width="' + w + '" style="max-width:100%;height:auto;display:block" role="img" aria-label="Three happy Replyvoo users waving">' +
      '<path d="M60 190c0-50 30-72 70-72s70 22 70 72z" fill="#FFC21A"/><circle cx="130" cy="78" r="40" fill="#E0AC69"/><path d="M88 74c2-30 22-44 42-44s40 14 42 44c-12-10-26-16-42-16s-30 6-42 16z" fill="#6B3E26"/>' +
      '<path d="M114 82q7 6 14 0M136 82q7 6 14 0" stroke="#121110" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M118 98q12 10 24 0" stroke="#121110" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      '<g class="a-wave"><path d="M70 150c-10-20-12-46-6-66" stroke="#E0AC69" stroke-width="16" stroke-linecap="round" fill="none"/></g>' +
      '<path d="M230 190c0-56 32-80 70-80s70 24 70 80z" fill="#FFFFFF" stroke="#EEEBE2"/><circle cx="300" cy="60" r="46" fill="#1E1611"/><circle cx="300" cy="72" r="40" fill="#8D5524"/>' +
      '<path d="M284 74q7 6 14 0M304 74q7 6 14 0" stroke="#121110" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M286 92q14 12 28 0" stroke="#121110" stroke-width="3.5" fill="#FFFFFF" stroke-linecap="round"/>' +
      '<g class="a-wave2"><path d="M368 146c12-18 16-44 10-64" stroke="#8D5524" stroke-width="16" stroke-linecap="round" fill="none"/></g>' +
      '<path d="M400 190c0-50 30-72 70-72s70 22 70 72z" fill="#8FB8FF"/><circle cx="470" cy="80" r="40" fill="#F5D0A9"/><path d="M428 82c-2-34 18-50 42-50s44 16 42 50c-6-14-16-22-26-24-10 6-30 6-42 0-8 4-14 12-16 24z" fill="#D9A441"/>' +
      '<rect x="446" y="74" width="20" height="14" rx="6" fill="none" stroke="#121110" stroke-width="3"/><rect x="474" y="74" width="20" height="14" rx="6" fill="none" stroke="#121110" stroke-width="3"/><path d="M466 80h8" stroke="#121110" stroke-width="3"/>' +
      '<path d="M460 100q10 8 20 0" stroke="#121110" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      '<g class="a-wave3"><path d="M540 150c10-20 12-46 6-66" stroke="#F5D0A9" stroke-width="16" stroke-linecap="round" fill="none"/></g></svg>';
  }

  /* ---------- Moji avatars (matches src/lib/moji.js) ---------- */
  const SKINS = ['#F5D0A9', '#E0AC69', '#C68642', '#8D5524', '#5C3A21'];
  const HAIRS = ['#1E1611', '#6B3E26', '#D9A441', '#B5462F'];
  const SHAPES = {
    female: { back: 'M24 62c0-28 16-44 36-44s36 16 36 44v34c0 6-5 10-11 10H35c-6 0-11-4-11-10z', front: 'M30 56c3-18 15-28 30-28s27 10 30 28c-11-3-22-10-28-19-6 9-18 16-32 19z' },
    male: { back: '', front: 'M28 60c0-23 13-35 32-35s32 12 32 35c-3-8-9-12-16-14-10 4-22 4-32 0-7 2-13 6-16 14z' },
    other: { back: 'M18 70a42 46 0 0 1 84 0v4H18z', front: 'M30 56c6-16 17-24 30-24s24 8 30 24c-9-5-19-11-30-11s-21 6-30 11z' }
  };
  function cleanMoji(m) {
    m = m || {};
    return { gender: ['female', 'male', 'other'].includes(m.gender) ? m.gender : 'other', skin: Math.min(4, Math.max(0, m.skin | 0)), hair: Math.min(3, Math.max(0, m.hair | 0)), glasses: !!m.glasses, beard: !!m.beard, earrings: !!m.earrings };
  }
  function moji(o, w, wave, happy) {
    o = cleanMoji(o);
    const s = SHAPES[o.gender], sk = SKINS[o.skin], hr = HAIRS[o.hair];
    const vb = wave ? '0 0 140 120' : '0 0 120 120', tx = wave ? ' transform="translate(10 0)"' : '';
    const eyes = happy ? '<path d="M44 68q5-5 10 0M66 68q5-5 10 0" stroke="#121110" stroke-width="3.4" fill="none" stroke-linecap="round"/>' : '<g class="a-blink"><circle cx="49" cy="68" r="3.8" fill="#121110"/><circle cx="71" cy="68" r="3.8" fill="#121110"/></g>';
    const mouth = happy ? '<path d="M48 79q12 12 24 0z" fill="#FFFFFF" stroke="#121110" stroke-width="3" stroke-linejoin="round"/>' : '<path d="M51 80q9 8 18 0" stroke="#121110" stroke-width="3.2" fill="#FFFFFF" stroke-linecap="round"/>';
    return '<svg viewBox="' + vb + '" width="' + w + '" height="' + Math.round(w * (wave ? 120 / 140 : 1)) + '" aria-hidden="true"><g' + tx + '>' +
      (s.back ? '<path d="' + s.back + '" fill="' + hr + '"/>' : '') +
      '<path d="M22 120c3-17 18-26 38-26s35 9 38 26z" fill="#121110"/><path d="M50 95l10 9 10-9" stroke="#FFC21A" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<rect x="53" y="86" width="14" height="12" rx="5" fill="' + sk + '"/><circle cx="30" cy="68" r="6" fill="' + sk + '"/><circle cx="90" cy="68" r="6" fill="' + sk + '"/><circle cx="60" cy="66" r="30" fill="' + sk + '"/>' +
      '<path d="' + s.front + '" fill="' + hr + '"/>' + (o.beard ? '<path d="M38 78c3 14 12 21 22 21s19-7 22-21c-6 5-14 7-22 7s-16-2-22-7z" fill="' + hr + '"/>' : '') +
      eyes + '<path d="M43 59q6-3 11 0M66 59q6-3 11 0" stroke="' + hr + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>' + mouth +
      '<circle cx="41" cy="77" r="5" fill="#FF7A7A" opacity=".3"/><circle cx="79" cy="77" r="5" fill="#FF7A7A" opacity=".3"/>' +
      (o.glasses ? '<rect x="39" y="61" width="19" height="14" rx="6" fill="none" stroke="#121110" stroke-width="2.6"/><rect x="62" y="61" width="19" height="14" rx="6" fill="none" stroke="#121110" stroke-width="2.6"/><path d="M58 67h4" stroke="#121110" stroke-width="2.6"/>' : '') +
      (o.earrings ? '<circle cx="30" cy="79" r="3.4" fill="#FFC21A" stroke="#121110" stroke-width="1.6"/><circle cx="90" cy="79" r="3.4" fill="#FFC21A" stroke="#121110" stroke-width="1.6"/>' : '') +
      (wave ? '<g class="a-wave"><path d="M94 116c10-10 14-24 12-38" stroke="' + sk + '" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="106" cy="74" r="7" fill="' + sk + '"/></g>' : '') + '</g></svg>';
  }
  function mojiCircle(o, size, bg) { return '<span class="moji-c" style="width:' + size + 'px;height:' + size + 'px;flex:0 0 ' + size + 'px;background:' + (bg || 'var(--jade)') + '">' + moji(o, size - 2, false, false) + '</span>'; }

  /* Mojis (Moji editor) used in sign-up, invite and settings. Returns HTML; events handled by the caller via data attributes. */
  function mojiEditor(m, prefix) {
    prefix = prefix || 'mj';
    return '<div class="col" style="gap:16px">' +
      '<div class="col" style="gap:8px"><span class="lbl">Style</span><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">' + [['female', 'Female'], ['male', 'Male'], ['other', 'Prefer not to say']].map(g => '<button type="button" class="seg3' + (m.gender === g[0] ? ' on' : '') + '" data-mj="gender" data-v="' + g[0] + '" aria-pressed="' + (m.gender === g[0]) + '">' + g[1] + '</button>').join('') + '</div></div>' +
      '<div class="row" style="flex-wrap:wrap;gap:22px;align-items:flex-start"><div class="col" style="gap:8px"><span class="lbl">Skin tone</span><div class="row" style="gap:8px">' + SKINS.map((c, i) => '<button type="button" class="sw' + (m.skin === i ? ' on' : '') + '" data-mj="skin" data-v="' + i + '" aria-label="Skin tone ' + (i + 1) + '" aria-pressed="' + (m.skin === i) + '" style="background:' + c + '"></button>').join('') + '</div></div>' +
      '<div class="col" style="gap:8px"><span class="lbl">Hair colour</span><div class="row" style="gap:8px">' + HAIRS.map((c, i) => '<button type="button" class="sw' + (m.hair === i ? ' on' : '') + '" data-mj="hair" data-v="' + i + '" aria-label="Hair colour ' + (i + 1) + '" aria-pressed="' + (m.hair === i) + '" style="background:' + c + '"></button>').join('') + '</div></div></div>' +
      '<div class="col" style="gap:8px"><span class="lbl">Extras</span><div class="row" style="flex-wrap:wrap;gap:8px">' + [['glasses', 'Glasses'], ['beard', 'Beard'], ['earrings', 'Earrings']].map(x => '<button type="button" class="chip' + (m[x[0]] ? ' on' : '') + '" data-mj="' + x[0] + '" aria-pressed="' + !!m[x[0]] + '">' + x[1] + '</button>').join('') + '<button type="button" class="chip" data-mj="shuffle" style="border-style:dashed">✦ Surprise me</button></div></div></div>';
  }
  function mojiApply(m, btn) {
    const k = btn.getAttribute('data-mj'), v = btn.getAttribute('data-v');
    if (k === 'gender') { m.gender = v; if (v !== 'male') m.beard = false; m.earrings = v === 'female'; }
    else if (k === 'skin' || k === 'hair') m[k] = +v;
    else if (k === 'shuffle') { m.skin = Math.floor(Math.random() * 5); m.hair = Math.floor(Math.random() * 4); m.glasses = Math.random() > 0.5; m.beard = m.gender === 'male' && Math.random() > 0.4; m.earrings = m.gender !== 'male' && Math.random() > 0.4; }
    else m[k] = !m[k];
    return m;
  }

  /* Empty-state character: a relaxed person with a coffee waiting for the first chat. */
  function waitingArt(w, msg) {
    return '<svg viewBox="0 0 220 170" width="' + w + '" style="max-width:100%;height:auto" role="img" aria-label="' + esc(msg || 'Nothing here yet') + '">' +
      '<ellipse cx="110" cy="160" rx="80" ry="8" fill="#121110" opacity=".08"/>' +
      '<g class="a-floats"><rect x="128" y="18" width="78" height="40" rx="16" fill="#FFFFFF" stroke="#121110" stroke-width="3"/><path d="M140 58l-6 12 16-12" fill="#FFFFFF" stroke="#121110" stroke-width="3" stroke-linejoin="round"/><circle cx="153" cy="38" r="4" fill="#121110" class="dot"/><circle cx="167" cy="38" r="4" fill="#121110"/><circle cx="181" cy="38" r="4" fill="#121110"/></g>' +
      '<path d="M40 162c0-38 22-56 52-56s52 18 52 56z" fill="#FFC21A" stroke="#121110" stroke-width="3"/>' +
      '<g class="a-head"><circle cx="92" cy="76" r="30" fill="#E0AC69" stroke="#121110" stroke-width="3"/><path d="M62 74c0-24 14-34 30-34s30 10 30 34c-8-10-18-14-30-14s-22 4-30 14z" fill="#1E1611"/>' +
      '<path d="M80 80q5-4 10 0M96 80q5-4 10 0" stroke="#121110" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M84 92q8 7 16 0" stroke="#121110" stroke-width="3" fill="none" stroke-linecap="round"/></g>' +
      '<path d="M120 140c10-6 16-14 16-22" stroke="#E0AC69" stroke-width="12" stroke-linecap="round" fill="none"/>' +
      '<rect x="126" y="106" width="22" height="24" rx="5" fill="#FFFFFF" stroke="#121110" stroke-width="3"/><path d="M148 112c6 0 8 3 8 6s-2 6-8 6" fill="none" stroke="#121110" stroke-width="3"/>' +
      '<path d="M132 100c0-4 4-4 4-8M140 100c0-4 4-4 4-8" stroke="#948F82" stroke-width="2.4" stroke-linecap="round" class="a-glow"/></svg>';
  }
  function empty(title, text, actionHtml, art) {
    return '<div class="empty a-in">' + (art || waitingArt(170, title)) + '<strong>' + esc(title) + '</strong><p>' + esc(text) + '</p>' + (actionHtml || '') + '</div>';
  }

  /* ---------- brand icons ---------- */
  // Replace with the official logo from the brand's press kit before launch.
  // Generic icons in each brand's colour only; the real logos are not drawn here.
  function brandIcon(id, size) {
    size = size || 52;
    const s = Math.round(size * 0.5);
    const box = (bg, inner, extra) => '<span class="brand" style="width:' + size + 'px;height:' + size + 'px;flex-basis:' + size + 'px;border-radius:' + Math.round(size * 0.3) + 'px;background:' + bg + ';' + (extra || '') + '">' + inner + '</span>';
    const svg = (d, fill, stroke) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="' + (fill || 'none') + '" stroke="' + (stroke || '#FFFFFF') + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
    switch (id) {
      case 'telegram': case 'telegram_bot': case 'telegram_business': case 'telegram_group':
        return box('#2AABEE', svg('<path d="M21 4 3 11l6 2.5L18 7l-6.8 7.6L17 20z" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="1.4"/>', 'none'));
      case 'whatsapp':
        return box('#25D366', svg('<path d="M20 11.5a8 8 0 0 1-11.7 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5z"/><path d="M9.5 9.2c.3 2 2.3 4.1 4.6 4.6l1-1.1 1.7.8-.3 1.4c-3.6.4-7.6-3.5-7.2-7.2l1.4-.3.8 1.7z" fill="#FFFFFF" stroke="none"/>'));
      case 'instagram':
        return box('linear-gradient(135deg,#FEDA75,#FA7E1E 35%,#D62976 65%,#962FBF)', svg('<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17" cy="7" r=".6" fill="#FFFFFF"/>'));
      case 'tiktok':
        return box('#121110', svg('<path d="M9 18a3 3 0 1 1 0-6M9 18a3 3 0 0 0 3-3V4M12 4c.5 2.6 2.4 4.2 5 4.4" stroke="#FFFFFF"/><path d="M8.2 18.6a3 3 0 0 1-.6-6" stroke="#25F4EE" opacity=".8"/>'), 'box-shadow:inset 0 0 0 2px #FE2C55');
      case 'website':
        return box('#FFC21A', svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>', 'none', '#121110'));
      case 'messenger':
        return box('#6D5BFF', svg('<path d="M12 3.5c-4.8 0-8.5 3.5-8.5 8 0 2.5 1.2 4.6 3 6v3l2.8-1.5c.9.3 1.8.4 2.7.4 4.8 0 8.5-3.5 8.5-8s-3.7-7.9-8.5-7.9z"/><path d="M7.5 13.5l3-3.2 2 2 3.5-3.3-3 3.3-2-2z" fill="#FFFFFF"/>'));
      default:
        return box('#FFC21A', svg('<path d="' + I.chat + '"/>', 'none', '#121110'));
    }
  }

  // Gatevoo: Zedapex's crypto checkout (black tile, white G, green dot). The wordmark is "Gate" + grey "voo".
  const gatevooMark = (s = 16) => '<svg class="gv-mark" width="' + s + '" height="' + s + '" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#121110"/><path d="M41.9 21.6A15 15 0 1 0 47 32H39.5" fill="none" stroke="#fff" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="30.5" cy="32" r="3.6" fill="#3E9C76"/></svg>';
  const gatevooWord = (s = 16) => '<span class="gv-word" style="font-weight:800;letter-spacing:-0.045em;font-size:' + s + 'px">Gate<span style="color:#A8A397">voo</span></span>';
  Object.assign(RV, { I, ic, svgI, CHECK, LOGO, vooMark, gatevooMark, gatevooWord, VOO_WORD, closerBot, junoArt, moneyGuy, squadArt, people, moji, mojiCircle, cleanMoji, mojiEditor, mojiApply, SKINS, HAIRS, waitingArt, empty, brandIcon });
})();
