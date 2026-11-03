'use strict';
// Internal reporter used by test/index.js: one JSON line per test event.
function err(e) {
  if (!e) return null;
  const c = e.cause || e;
  return { message: String((c && c.message) || c), stack: c && c.stack ? String(c.stack) : '' };
}
module.exports = async function* jsonl(source) {
  for await (const ev of source) {
    const d = ev.data || {};
    if (ev.type === 'test:start' || ev.type === 'test:pass' || ev.type === 'test:fail') {
      yield JSON.stringify({ type: ev.type, name: d.name, nesting: d.nesting, file: d.file, todo: d.todo, skip: d.skip, kind: d.details && d.details.type, error: err(d.details && d.details.error) }) + '\n';
    } else if (ev.type === 'test:stderr' || ev.type === 'test:stdout' || ev.type === 'test:diagnostic') {
      yield JSON.stringify({ type: ev.type, message: d.message }) + '\n';
    }
  }
};
