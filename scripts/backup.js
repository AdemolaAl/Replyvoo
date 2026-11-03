'use strict';
// Hot backup of the SQLite database: npm run backup  (writes ./backups/replyvoo-YYYYMMDD-HHMM.db, keeps the last 14)
const fs = require('node:fs');
const path = require('node:path');
const config = require('../src/config');
const db = require('../src/db');
db.open();
const dir = path.join(config.root, 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
const file = path.join(dir, 'replyvoo-' + stamp + '.db');
db.raw.exec('VACUUM INTO \'' + file.replace(/'/g, "''") + '\'');
console.log('✓ Backup written: ' + file);
const old = fs.readdirSync(dir).filter(f => f.startsWith('replyvoo-') && f.endsWith('.db')).sort().reverse().slice(14);
old.forEach(f => fs.unlinkSync(path.join(dir, f)));
