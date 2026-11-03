'use strict';
// Legal pages ship as Markdown in content/legal and live in the "pages" table (the admin can edit them).
// syncPages() runs on every boot: it adds pages that are missing, and brings a stored page up to the shipped text ONLY
// when nobody ever edited that page in Admin → Legal pages (an admin save always writes a "page.update" audit row).
// Pages an admin edited are never touched; `npm run seed -- --force-content` overwrites everything on purpose.
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const db = require('../db');
const md = require('../lib/md');

function shipped() {
  const dir = path.join(config.root, 'content', 'legal');
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
    const { data, body } = md.frontMatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    return { slug: f.replace(/\.md$/, ''), title: data.title || f, description: data.description || '', body: body.trim() };
  });
}
const editedByAdmin = slug => !!db.one("SELECT id FROM audit WHERE action = 'page.update' AND json_extract(data, '$.slug') = ? LIMIT 1", slug);

function syncPages({ force = false } = {}) {
  const out = { added: [], updated: [], kept: [] };
  for (const p of shipped()) {
    const row = db.one('SELECT * FROM pages WHERE slug = ?', p.slug);
    if (!row) { db.insert('pages', { slug: p.slug, title: p.title, description: p.description, body_md: p.body, updated_at: db.now() }); out.added.push(p.slug); continue; }
    if (row.body_md === p.body && row.title === p.title && row.description === p.description) continue;
    if (!force && editedByAdmin(p.slug)) { out.kept.push(p.slug); continue; }
    db.update('pages', p.slug, { title: p.title, description: p.description, body_md: p.body, updated_at: db.now() }, 'slug');
    out.updated.push(p.slug);
  }
  return out;
}

module.exports = { syncPages, shipped };
