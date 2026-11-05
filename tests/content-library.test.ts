import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const vendor = new URL('../public/vendor/', import.meta.url);
export function cubeIcons() {
  const context = vm.createContext({ console });
  vm.runInContext(readFileSync(new URL('cube-icons.js', vendor), 'utf8'), context);
  return context.CubeIcons;
}

test('vendor bytes match the immutable upstream commit recorded in SOURCES.md', () => {
  const expected = {
    'cube-icons.js': 'd2d5f49743b515556fa427a503ae9f49c9b2e52e2d9a00bb80a2101bad7c66e0',
    'cube-icons.css': '5078c3e1acc944a8f5182d85a6bb1621d96a0148998ff48963c64ad813d437a9',
    'cube-icons.LICENSE': '1126322e2cc8d165adc4c792eeb195717de2bcc7b39be1ce77959d78e87ef685',
  };
  for (const [name, hash] of Object.entries(expected)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(name, vendor))).digest('hex'), hash, name);
  }
});

test('self-hosted cube-icons ships the real state and SVG API with MIT license', () => {
  assert.ok(existsSync(new URL('cube-icons.js', vendor)), 'missing pinned vendor JS');
  assert.ok(existsSync(new URL('cube-icons.css', vendor)), 'missing pinned vendor CSS');
  assert.match(readFileSync(new URL('cube-icons.LICENSE', vendor), 'utf8'), /MIT License/);
  const icons = cubeIcons();
  assert.equal(typeof icons.processAll, 'function');
  assert.equal(typeof icons.getInvertedAlgorithm, 'function');
  const state = icons.createState.nxn(3);
  assert.equal(state.U[1][1], 'W');
  const original = JSON.stringify(state);
  icons.applyAlgorithm(state, 'R U', 3);
  icons.applyAlgorithm(state, icons.getInvertedAlgorithm('3x3', 'R U'), 3);
  assert.equal(JSON.stringify(state), original);
  assert.match(icons.render({ type: '3x3', angle: 'iso', alg: 'R U', inverse: true }), /^<svg/);
});
