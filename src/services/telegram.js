'use strict';
// Telegram Bot API client.
const API = 'https://api.telegram.org';

async function call(token, method, body = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(API + '/bot' + token + '/' + method, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({ ok: false, description: 'Bad response from Telegram' }));
    if (!data.ok) { const e = new Error(data.description || 'Telegram error'); e.code = data.error_code; e.retryAfter = data.parameters && data.parameters.retry_after; throw e; }
    return data.result;
  } finally { clearTimeout(t); }
}

async function download(token, fileId, maxBytes = 5 * 1024 * 1024) {
  const f = await call(token, 'getFile', { file_id: fileId });
  if (f.file_size && f.file_size > maxBytes) throw new Error('File too large');
  const res = await fetch(API + '/file/bot' + token + '/' + f.file_path);
  if (!res.ok) throw new Error('Download failed');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error('File too large');
  return { buffer: buf, path: f.file_path };
}

function sendText(token, chatId, text, opts = {}) {
  const body = { chat_id: chatId, text: String(text).slice(0, 4000), disable_web_page_preview: false };
  if (opts.business_connection_id) body.business_connection_id = opts.business_connection_id;
  if (opts.reply_to) body.reply_parameters = { message_id: opts.reply_to, allow_sending_without_reply: true };
  return call(token, 'sendMessage', body);
}
function typing(token, chatId, bc) {
  const body = { chat_id: chatId, action: 'typing' };
  if (bc) body.business_connection_id = bc;
  return call(token, 'sendChatAction', body).catch(() => {});
}

module.exports = { call, download, sendText, typing };
