'use strict';
// Tiny HTTP framework: routing, JSON bodies, cookies, static files, gzip, security headers.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const config = require('../config');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg'
};

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

function compile(pattern) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }).replace(/\*$/, '(.*)') + '/?$');
  return { re, keys };
}

function createApp() {
  const routes = [];
  const uses = [];
  const app = {
    use(fn) { uses.push(fn); },
    on(method, pattern, ...handlers) { routes.push({ method, ...compile(pattern), handlers }); },
    get(p, ...h) { app.on('GET', p, ...h); }, post(p, ...h) { app.on('POST', p, ...h); },
    put(p, ...h) { app.on('PUT', p, ...h); }, patch(p, ...h) { app.on('PATCH', p, ...h); }, del(p, ...h) { app.on('DELETE', p, ...h); },
    statics: [],
    static(prefix, dir, opts = {}) { app.statics.push({ prefix, dir: path.resolve(dir), maxAge: opts.maxAge || 0 }); },
    notFound: null,
    async handle(req, res) {
      try { enhance(req, res); } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Bad request'); return;
      }
      try {
        for (const u of uses) { await u(req, res); if (res.writableEnded) return; }
        if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(app, req, res)) return;
        const url = req.path;
        let methodMismatch = false;
        for (const r of routes) {
          const m = url.match(r.re);
          if (!m) continue;
          if (r.method !== req.method && !(req.method === 'HEAD' && r.method === 'GET')) { methodMismatch = true; continue; }
          req.params = {};
          try { r.keys.forEach((k, i) => { req.params[k] = decodeURIComponent(m[i + 1]); }); } catch { throw new HttpError(400, 'Bad request'); }
          if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body === undefined) await readBody(req);
          for (const h of r.handlers) {
            const out = await h(req, res);
            if (res.writableEnded) return;
            if (out !== undefined) { res.json(out); return; }
          }
          return;
        }
        if (methodMismatch) throw new HttpError(405, 'Method not allowed');
        if (app.notFound) return app.notFound(req, res);
        throw new HttpError(404, 'Not found');
      } catch (e) {
        const status = e.status || 500;
        if (status >= 500) console.error('[error]', req.method, req.url, e);
        if (res.writableEnded || res.headersSent) return;
        if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/') || req.path.startsWith('/hooks/') || req.path.startsWith('/w/')) {
          res.json({ error: status >= 500 && config.isProd ? 'Something went wrong. Please try again.' : e.message, ...(e.extra || {}) }, status);
        } else if (app.errorPage) {
          app.errorPage(req, res, status, e);
        } else {
          res.send(String(status), status, 'text/plain; charset=utf-8');
        }
      }
    },
    listen(port, cb) { const server = http.createServer((q, s) => app.handle(q, s)); server.listen(port, cb); return server; }
  };
  return app;
}

// The client's IP. Behind TRUST_PROXY_HOPS proxies (default 1), each proxy appends the address it saw, so the client is the entry
// that many places from the right. Entries further left are whatever the client sent and are never trusted.
function clientIp(req) {
  const sock = req.socket && req.socket.remoteAddress || '';
  if (!config.trustProxy) return sock;
  const hops = Math.max(1, Math.floor(Number(config.trustProxyHops) || 1));
  const list = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!list.length) return sock;
  return list[Math.max(0, list.length - hops)] || sock;
}

function enhance(req, res) {
  const u = new URL(req.url, 'http://local');
  req.path = u.pathname.replace(/\/{2,}/g, '/');
  req.query = Object.fromEntries(u.searchParams);
  req.cookies = parseCookies(req.headers.cookie || '');
  req.ip = clientIp(req);
  res.locals = {};
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.json = (obj, status = 200) => send(req, res, JSON.stringify(obj), status, 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
  res.send = (body, status = 200, type = 'text/html; charset=utf-8', headers) => send(req, res, body, status, type, headers);
  res.redirect = (to, status = 302) => { res.writeHead(status, { Location: to }); res.end(); };
  res.cookie = (name, value, opts = {}) => {
    const parts = [name + '=' + encodeURIComponent(value), 'Path=' + (opts.path || '/')];
    if (opts.maxAge != null) parts.push('Max-Age=' + Math.floor(opts.maxAge));
    if (opts.httpOnly !== false) parts.push('HttpOnly');
    parts.push('SameSite=' + (opts.sameSite || 'Lax'));
    if (config.isProd || opts.secure) parts.push('Secure');
    const prev = res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie', [].concat(prev || [], parts.join('; ')));
  };
}

// Content-Security-Policy for every HTML page (security audit): scripts only from Replyvoo itself (plus the one-line "js" class
// script, allowed by its hash, and VooSquare's sign-in widget when it is on), never framed by another site. A route that sends its
// own policy keeps it; a page Replyvoo frames itself (the Gatevoo sandbox page in the live demo) asks for frame-ancestors 'self'.
const JS_CLASS_HASH = "'sha256-qOhFsq0QMV2REqNwk5hGH5bZE9SkX6gt6yeyKdYPv+U='"; // document.documentElement.classList.add("js")
function vooOrigin() { try { const c = require('./voo').cfg(); return c.on && c.base ? new URL(c.base).origin : ''; } catch { return ''; } }
function csp(opts = {}) {
  const voo = vooOrigin();
  const x = s => s ? ' ' + s : '';
  return ["default-src 'self'", "script-src 'self' " + JS_CLASS_HASH + x(voo), "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com" + x(voo),
    "font-src 'self' data: https://fonts.gstatic.com", "img-src 'self' data: blob: https:", "media-src 'self' data: blob: https:",
    "connect-src 'self'" + x(voo), "frame-src 'self'" + x(voo), "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'",
    "form-action 'self' https:", 'frame-ancestors ' + (opts.frameSelf ? "'self'" : "'none'")].join('; ');
}

function send(req, res, body, status, type, headers = {}) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const h = { 'Content-Type': type, ...headers };
  if (/^text\/html/i.test(type) && !h['Content-Security-Policy'] && !res.getHeader('Content-Security-Policy')) h['Content-Security-Policy'] = csp({ frameSelf: res.locals && res.locals.frameSelf });
  const ae = req.headers['accept-encoding'] || '';
  if (buf.length > 1024 && /gzip/.test(ae) && /text|json|javascript|xml|svg/.test(type)) {
    buf = zlib.gzipSync(buf, { level: 6 });
    h['Content-Encoding'] = 'gzip';
    h['Vary'] = 'Accept-Encoding';
  }
  h['Content-Length'] = buf.length;
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

const staticCache = new Map();
function serveStatic(app, req, res) {
  for (const s of app.statics) {
    if (!req.path.startsWith(s.prefix)) continue;
    let rel;
    try { rel = decodeURIComponent(req.path.slice(s.prefix.length)); } catch { return false; }
    if (rel.includes('\0')) return false;
    const file = path.resolve(s.dir, '.' + path.sep + rel);
    if (!file.startsWith(s.dir + path.sep)) return false;
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    if (!st.isFile()) continue;
    const etag = '"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); res.end(); return true; }
    const type0 = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    // Audio/video: support byte ranges (Safari needs them to play media).
    if (/^(video|audio)\//.test(type0)) {
      const base = { 'Content-Type': type0, 'Accept-Ranges': 'bytes', ETag: etag, 'Cache-Control': s.maxAge ? 'public, max-age=' + s.maxAge : 'no-cache' };
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (m && (m[1] || m[2])) {
        let start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
        let end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
        if (start >= st.size || start > end) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); res.end(); return true; }
        res.writeHead(206, { ...base, 'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size, 'Content-Length': end - start + 1 });
        if (req.method === 'HEAD') { res.end(); return true; }
        fs.createReadStream(file, { start, end }).pipe(res);
        return true;
      }
      res.writeHead(200, { ...base, 'Content-Length': st.size });
      if (req.method === 'HEAD') { res.end(); return true; }
      fs.createReadStream(file).pipe(res);
      return true;
    }
    const key = file + etag;
    let body = staticCache.get(key);
    if (!body) { body = fs.readFileSync(file); if (body.length < 2e6) staticCache.set(key, body); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    send(req, res, body, 200, type, { ETag: etag, 'Cache-Control': s.maxAge ? 'public, max-age=' + s.maxAge : 'no-cache' });
    return true;
  }
  return false;
}

function parseCookies(str) {
  const out = {};
  str.split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) { const k = p.slice(0, i).trim(); try { out[k] = decodeURIComponent(p.slice(i + 1).trim()); } catch { out[k] = p.slice(i + 1).trim(); } } });
  return out;
}

const MAX_BODY = 6 * 1024 * 1024;
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0; let tooBig = false;
    // Too large: answer 413 (the rest of the upload is drained and dropped, not buffered).
    req.on('data', c => { if (tooBig) return; size += c.length; if (size > MAX_BODY) { tooBig = true; chunks.length = 0; reject(new HttpError(413, 'Request is too large')); } else chunks.push(c); });
    req.on('end', () => {
      if (tooBig) return;
      req.rawBody = Buffer.concat(chunks);
      const type = req.headers['content-type'] || '';
      if (!req.rawBody.length) { req.body = {}; return resolve(); }
      if (type.includes('application/json')) {
        try { req.body = JSON.parse(req.rawBody.toString('utf8')); } catch { return reject(new HttpError(400, 'Invalid JSON')); }
        // Handlers expect an object: a JSON array, string or null body becomes {}.
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) req.body = {};
      } else if (type.includes('application/x-www-form-urlencoded')) {
        req.body = Object.fromEntries(new URLSearchParams(req.rawBody.toString('utf8')));
      } else req.body = {};
      resolve();
    });
    req.on('error', reject);
  });
}

// In-memory rate limiter: limit(key, max, windowMs)
const buckets = new Map();
// Counts by any key (an account, not an IP). count() adds one and says whether the limit is passed; clear() resets it.
function keyLimit(name, max, windowMs) {
  const k = key => name + ':' + String(key || '').toLowerCase();
  return {
    blocked(key) { const b = buckets.get(k(key)); return !!b && b.reset >= Date.now() && b.n >= max; },
    count(key) { const t = Date.now(); let b = buckets.get(k(key)); if (!b || b.reset < t) { b = { n: 0, reset: t + windowMs }; buckets.set(k(key), b); } b.n++; return b.n >= max; },
    clear(key) { buckets.delete(k(key)); }
  };
}

function rateLimit(name, max, windowMs) {
  return (req) => {
    const key = name + ':' + req.ip;
    const t = Date.now();
    let b = buckets.get(key);
    if (!b || b.reset < t) { b = { n: 0, reset: t + windowMs }; buckets.set(key, b); }
    b.n++;
    if (b.n > max) throw new HttpError(429, 'Too many requests. Please wait a moment and try again.');
  };
}
setInterval(() => { const t = Date.now(); for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k); }, 60000).unref();

function nonce() { return crypto.randomBytes(16).toString('base64'); }

module.exports = { createApp, HttpError, rateLimit, keyLimit, clientIp, csp, nonce, MIME };
