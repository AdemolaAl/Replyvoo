'use strict';
// SQLite database (built into Node 22+). One file, WAL mode, simple helpers.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

let db;

function open(file) {
  const target = file || config.dbPath;
  if (target !== ':memory:') fs.mkdirSync(path.dirname(target), { recursive: true });
  db = new DatabaseSync(target);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  migrate();
  return db;
}

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const dir = path.join(config.root, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const done = new Set(db.prepare('SELECT name FROM _migrations').all().map(r => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(f, now());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error('Migration ' + f + ' failed: ' + e.message);
    }
  }
}

function clean(params) {
  if (!params) return [];
  return params.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
}
function one(sql, ...params) { return db.prepare(sql).get(...clean(params)) || null; }
function all(sql, ...params) { return db.prepare(sql).all(...clean(params)); }
function run(sql, ...params) { return db.prepare(sql).run(...clean(params)); }
function insert(table, obj) {
  const keys = Object.keys(obj);
  const sql = 'INSERT INTO ' + table + ' (' + keys.join(',') + ') VALUES (' + keys.map(() => '?').join(',') + ')';
  const r = run(sql, ...keys.map(k => obj[k]));
  return Number(r.lastInsertRowid);
}
function update(table, id, obj, idCol = 'id') {
  const keys = Object.keys(obj);
  if (!keys.length) return;
  run('UPDATE ' + table + ' SET ' + keys.map(k => k + ' = ?').join(', ') + ' WHERE ' + idCol + ' = ?', ...keys.map(k => obj[k]), id);
}
let depth = 0;
function tx(fn) {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
  finally { depth--; }
}
function now() { return new Date().toISOString(); }
function json(v, d) { if (v == null || v === '') return d; try { return JSON.parse(v); } catch { return d; } }

module.exports = { open, one, all, run, insert, update, tx, now, json, get raw() { return db; } };
