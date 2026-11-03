'use strict';
// Entry point for `npm test` (`node --test test/`). On Node 22 a directory argument is loaded as a
// module (test/index.js) instead of being expanded, so this file runs every *.test.js file in its
// own process (each file boots one app; src/db.js keeps a single module-level connection) and
// replays every result as a subtest so pass/fail/todo counts stay per test.
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { test } = require('node:test');

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort().map(f => path.join(__dirname, f));
const reporter = path.join(__dirname, '_jsonl-reporter.js');

function collect(file) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--test', '--test-reporter=' + reporter, '--test-reporter-destination=stdout', file], { env, cwd: path.join(__dirname, '..') });
    let out = ''; let errOut = '';
    child.stdout.on('data', c => { out += c; });
    child.stderr.on('data', c => { errOut += c; });
    const killer = setTimeout(() => child.kill('SIGKILL'), 170000);
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(killer);
      const events = [];
      for (const line of out.split('\n')) { if (!line.trim()) continue; try { events.push(JSON.parse(line)); } catch { errOut += line + '\n'; } }
      resolve({ code, events, stderr: errOut });
    });
  });
}

for (const file of files) {
  test(path.basename(file), { timeout: 180000 }, async t => {
    const { code, events, stderr } = await collect(file);
    const stack = [];
    const logs = [];
    let leaves = 0; let leafFailed = false;
    for (const e of events) {
      if (e.type === 'test:start') { stack[e.nesting] = e.name; stack.length = e.nesting + 1; continue; }
      if (e.type !== 'test:pass' && e.type !== 'test:fail') { if (e.message) logs.push(e.message); continue; }
      if (e.kind === 'suite' || (e.nesting === 0 && e.name === file)) continue;
      leaves++;
      const ok = e.type === 'test:pass';
      if (!ok && !e.todo) leafFailed = true;
      const name = stack.slice(0, e.nesting).filter(Boolean).concat(e.name).join(' > ');
      const opts = e.todo ? { todo: e.todo } : e.skip ? { skip: e.skip } : {};
      await t.test(name, opts, () => {
        if (ok) return;
        const err = new Error(e.error ? e.error.message : 'failed');
        if (e.error && e.error.stack) err.stack = e.error.stack;
        throw err;
      });
    }
    if ((code !== 0 && !leafFailed) || !leaves) {
      throw new Error(path.basename(file) + ' exited with code ' + code + (leaves ? '' : ' and ran no tests') + '\n' + (logs.join('') + stderr).slice(-4000));
    }
  });
}
