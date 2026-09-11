const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('public/assets/js/app.js', 'utf8');
const helper = source.match(/  function withConnectionTimeout\(operation\)\{[\s\S]*?\n  \}/)[0];
let expire;
let cleared = 0;
const context = vm.createContext({
  setTimeout(callback, delay) {
    assert.equal(delay, 15000);
    expire = callback;
    return 1;
  },
  clearTimeout(id) { assert.equal(id, 1); cleared++; }
});
vm.runInContext(helper, context);

(async () => {
  assert.equal(await context.withConnectionTimeout(Promise.resolve('session')), 'session');
  await assert.rejects(context.withConnectionTimeout(Promise.reject(new Error('offline'))), /offline/);
  let resolveLate;
  let unlocked = false;
  const pending = context.withConnectionTimeout(new Promise(resolve => { resolveLate = resolve; }))
    .then(() => { unlocked = true; });
  expire();
  await assert.rejects(pending, /การเชื่อมต่อใช้เวลานานเกินไป/);
  resolveLate('late session');
  await Promise.resolve();
  assert.equal(unlocked, false, 'A late response must not continue past a timed-out await');
  assert.equal(cleared, 3);
  console.log('Connection timeout: passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
