'use strict';
// Passwords, random tokens, encryption for stored secrets, signed values.
const crypto = require('node:crypto');
const config = require('../config');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 });
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}
function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const hash = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(hashHex, 'hex');
  return want.length === hash.length && crypto.timingSafeEqual(want, hash);
}
function token(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function hmac(s, key = config.secret) { return crypto.createHmac('sha256', key).update(String(s)).digest('hex'); }
function safeEqual(a, b) { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

const KEY = crypto.createHash('sha256').update('replyvoo-enc:' + config.secret).digest();
function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return 'v1:' + iv.toString('base64') + ':' + c.getAuthTag().toString('base64') + ':' + enc.toString('base64');
}
function decrypt(blob) {
  if (!blob) return '';
  const [v, iv, tag, data] = String(blob).split(':');
  if (v !== 'v1') return '';
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}
function refCode() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = ''; const b = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) s += a[b[i] % a.length];
  return s;
}
function orderRef() { return 'RV-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase(); }

module.exports = { hashPassword, verifyPassword, token, sha256, hmac, safeEqual, encrypt, decrypt, refCode, orderRef };
