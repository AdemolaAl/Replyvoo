'use strict';
// Small, safe Markdown renderer for blog posts and legal pages, plus front-matter parsing.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function frontMatter(src) {
  const m = String(src).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: String(src) };
  const data = {};
  m[1].split(/\r?\n/).forEach(line => {
    const i = line.indexOf(':');
    if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  });
  return { data, body: m[2] };
}

function safeUrl(u) {
  const t = String(u).trim();
  if (/^(https?:|mailto:|\/|#)/i.test(t)) return t;
  return '#';
}

function inline(text) {
  let s = esc(text);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push('<code>' + c + '</code>'); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => '<img src="' + safeUrl(src.replace(/&amp;/g, '&')) + '" alt="' + alt + '" loading="lazy" decoding="async">');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => {
    const url = safeUrl(href.replace(/&amp;/g, '&'));
    const ext = /^https?:/i.test(url);
    return '<a href="' + esc(url) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + t + '</a>';
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
  return s;
}

function slugify(t) { return String(t).toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }

function render(md, opts = {}) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const out = []; const toc = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(esc(lines[i])); i++; }
      i++; out.push('<pre><code>' + buf.join('\n') + '</code></pre>'); continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = Math.max(2, h[1].length + (opts.shiftHeadings ? 1 : 0));
      const id = slugify(h[2]);
      if (lvl === 2) toc.push({ id, text: h[2].replace(/[*`]/g, '') });
      out.push('<h' + lvl + ' id="' + id + '">' + inline(h[2]) + '</h' + lvl + '>'); i++; continue;
    }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push('<blockquote><p>' + inline(buf.join(' ')) + '</p></blockquote>'); continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { buf.push('<li>' + inline(lines[i].replace(/^\s*[-*]\s+/, '')) + '</li>'); i++; }
      out.push('<ul>' + buf.join('') + '</ul>'); continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { buf.push('<li>' + inline(lines[i].replace(/^\s*\d+[.)]\s+/, '')) + '</li>'); i++; }
      out.push('<ol>' + buf.join('') + '</ol>'); continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (!line.trim()) { i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|```|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(lines[i])) { buf.push(lines[i].trim()); i++; }
    const para = buf.join(' ');
    const onlyImg = /^!\[[^\]]*\]\([^)]+\)$/.test(para);
    out.push(onlyImg ? '<figure>' + inline(para) + '</figure>' : '<p>' + inline(para) + '</p>');
  }
  return { html: out.join('\n'), toc };
}

function plain(md) { return String(md).replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#>*`_-]/g, '').replace(/\s+/g, ' ').trim(); }

module.exports = { render, frontMatter, esc, slugify, plain };
