'use strict';
// Minimal templates: {{var}} escaped, {{{var}}} raw, {{#if var}}...{{/if}} (not nested).
// Dotted paths are allowed: {{site.hero.title}}
const { esc } = require('./md');

function get(data, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
}
function truthy(v) { return !(v === undefined || v === null || v === false || v === '' || v === 0 || (Array.isArray(v) && !v.length)); }

function render(tpl, data = {}) {
  let s = String(tpl);
  s = s.replace(/\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, k, inner) => (truthy(get(data, k)) ? inner : ''));
  s = s.replace(/\{\{#unless\s+([\w.]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, k, inner) => (truthy(get(data, k)) ? '' : inner));
  // One pass, so values that happen to contain {{...}} (names, messages) are never expanded again.
  s = s.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([\w.]+)\s*\}\}/g, (_, raw, k) => { const v = get(data, raw || k); return v == null ? '' : raw ? String(v) : esc(v); });
  return s;
}

module.exports = { render };
