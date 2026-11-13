import test from 'node:test';
import assert from 'node:assert/strict';
import { rectQuad, polyArea, overlap, maxSag, yarnGeo } from '../src/geo.mjs';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('area of a rectangle survives rotation', () => {
  for (const deg of [0, 17, 45, 90, 213]) near(polyArea(rectQuad(50, -20, 100, 40, deg)), 200 * 80, 1e-6);
});
test('overlap: identical, partial, touching, apart', () => {
  const a = rectQuad(0, 0, 50, 50, 0);
  near(overlap(a, a), 10000);
  near(overlap(a, rectQuad(50, 0, 50, 50, 0)), 5000);
  near(overlap(a, rectQuad(80, 80, 50, 50, 0)), 400);
  assert.equal(overlap(a, rectQuad(100, 0, 50, 50, 0)), 0);
  assert.equal(overlap(a, rectQuad(500, 500, 50, 50, 30)), 0);
});
test('overlap is symmetric and handles rotation', () => {
  const a = rectQuad(0, 0, 60, 30, 12), b = rectQuad(40, 10, 50, 50, -33);
  near(overlap(a, b), overlap(b, a), 1e-6);
  // a square turned 45° inside a larger square is fully contained
  near(overlap(rectQuad(0, 0, 10, 10, 45), rectQuad(0, 0, 100, 100, 0)), 400);
  // a diamond clipped by an equal square leaves a regular octagon
  near(overlap(rectQuad(0, 0, 50, 50, 45), rectQuad(0, 0, 50, 50, 0)), 10000 * (2 * Math.SQRT2 - 2), 1e-6);
});
test('thread: taut is a straight line, slack is capped', () => {
  const a = [0, 0], b = [400, 100];
  const taut = yarnGeo(a, b, 0);
  assert.equal(taut.sag, 0);
  assert.deepEqual(taut.mid, [200, 50]);
  assert.equal(yarnGeo(a, b, 1).sag, maxSag(Math.hypot(400, 100)));
  assert.equal(maxSag(5), 24);
  assert.equal(maxSag(1e6), 190);
});
