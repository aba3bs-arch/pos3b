import assert from 'node:assert/strict';
import { createSubmitLock } from './submitLock.js';

{
  const lock = createSubmitLock();
  assert.equal(lock.tryBegin(), true);
  assert.equal(lock.busy(), true);
  assert.equal(lock.tryBegin(), false);
  lock.end();
  assert.equal(lock.tryBegin(), true);
  lock.end();
}

{
  const lock = createSubmitLock();
  let runs = 0;
  const p1 = lock.run(async () => {
    runs += 1;
    await new Promise((r) => setTimeout(r, 20));
    return { ok: true };
  });
  const p2 = lock.run(async () => {
    runs += 1;
    return { ok: true };
  });
  const [a, b] = await Promise.all([p1, p2]);
  assert.equal(a.ok, true);
  assert.equal(b.skipped, true);
  assert.equal(runs, 1);
}

console.log('submitLock.test.mjs ok');
