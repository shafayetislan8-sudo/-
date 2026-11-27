import assert from 'node:assert/strict';
import {
  allocatePoishaExactly,
  computeAlertLevel,
  formatPoisha,
  parseBdtToPoisha,
  poishaToInputString,
} from './money.ts';

assert.equal(parseBdtToPoisha('30.10'), 3010);
assert.equal(parseBdtToPoisha('3'), 300);
assert.equal(parseBdtToPoisha('0.05'), 5);
assert.equal(parseBdtToPoisha('-125.50'), -12550);

const shares = allocatePoishaExactly(1000, 3);
assert.deepEqual(shares, [334, 333, 333]);
assert.equal(
  shares.reduce((a, b) => a + b, 0),
  1000
);

assert.equal(computeAlertLevel(0, 20000, 5000, true), 'zero');
assert.equal(computeAlertLevel(-500, 20000, 5000, true), 'zero');
assert.equal(computeAlertLevel(4000, 20000, 5000, true), 'critical');
assert.equal(computeAlertLevel(15000, 20000, 5000, true), 'low');
assert.equal(computeAlertLevel(25000, 20000, 5000, true), 'none');

assert.equal(formatPoisha(3000, 'en'), '৳30.00');
assert.equal(formatPoisha(300, 'bn'), '৳৩.০০');
assert.equal(poishaToInputString(3050), '30.50');

console.log('All integer poisha arithmetic & alert threshold unit tests passed.');
