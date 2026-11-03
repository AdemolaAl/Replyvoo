'use strict';
// Create or reset an admin: npm run create-admin -- you@example.com "StrongPassword" "Your Name"
const db = require('../src/db');
const { hashPassword } = require('../src/lib/security');
db.open();
const [email, password, name] = process.argv.slice(2);
if (!email || !password || password.length < 8) { console.log('Usage: npm run create-admin -- email@example.com "password (8+ chars)" "Name"'); process.exit(1); }
const e = email.toLowerCase();
const u = db.one('SELECT * FROM users WHERE email = ?', e);
if (u) { db.update('users', u.id, { role: 'admin', password_hash: hashPassword(password), suspended: 0 }); console.log('✓ ' + e + ' is now an admin (password updated).'); }
else {
  const id = db.insert('users', { email: e, name: name || 'Admin', password_hash: hashPassword(password), role: 'admin', email_verified: 1, created_at: db.now() });
  require('../src/services/workspace').createWorkspace(db.one('SELECT * FROM users WHERE id = ?', id), 'Zedapex HQ');
  console.log('✓ Admin created: ' + e);
}
// Owners have full access on the Staff page.
const uid = db.one('SELECT id FROM users WHERE email = ?', e).id;
if (db.one('SELECT user_id FROM staff WHERE user_id = ?', uid)) db.run("UPDATE staff SET role = 'owner', status = 'active' WHERE user_id = ?", uid);
else db.insert('staff', { user_id: uid, role: 'owner', created_at: db.now() });
