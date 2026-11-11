import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const component = new URL('../components/CubeDiagram.tsx', import.meta.url);

test('React diagram loads self-hosted library once and reprocesses actual SVG after prop updates', async () => {
  assert.ok(existsSync(component), 'missing reusable CubeDiagram component');
  const bundled = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import CubeDiagram from './components/CubeDiagram';
      const root=createRoot(document.getElementById('root'));
      window.updateDiagram=(algorithm,category='PLL',size=160)=>root.render(<><CubeDiagram algorithm={algorithm} category={category} size={size} label="Caso de teste"/><CubeDiagram algorithm="R U R'" category="F2L" label="Segundo diagrama"/></>);
      window.updateDiagram("R U' R U R U R U' R' U' R2");`,
      resolveDir: new URL('..', import.meta.url).pathname,
      loader: 'tsx',
    }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
  });
  let scriptRequests = 0;
  const server = createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundled.outputFiles[0].text); return; }
    if (req.url === '/vendor/cube-icons.js' || req.url === '/vendor/cube-icons.css') {
      if (req.url.endsWith('.js')) scriptRequests++;
      res.setHeader('Content-Type', req.url.endsWith('.js') ? 'text/javascript' : 'text/css');
      res.end(readFileSync(new URL(`../public${req.url}`, import.meta.url))); return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><head></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForSelector('[role="img"] svg');
    await page.waitForFunction(() => document.querySelectorAll('[role="img"] svg').length === 2);
    assert.equal(scriptRequests, 1);
    assert.equal(await page.locator('script[src="/vendor/cube-icons.js"]').count(), 1);
    assert.equal(await page.locator('link[href="/vendor/cube-icons.css"]').count(), 1);
    const first = page.getByRole('img', { name: /Caso de teste/ });
    const before = await first.locator('svg').evaluate(el => el.outerHTML);
    assert.equal(await first.locator('[data-ci-alg]').getAttribute('data-ci-alg'), "R U' R U R U R U' R' U' R2 y2 x2");
    await page.evaluate(() => (window as any).updateDiagram("R U R' U R U2 R'", 'OLL', 220));
    await page.waitForFunction(() => document.querySelector('[role="img"] [data-ci-alg]')?.getAttribute('data-ci-alg') === "R U R' U R U2 R'");
    assert.equal(await page.locator('[role="img"] .ci-oll').count(), 1, 'OLL uses the ci-oll mode');
    await page.waitForFunction((old: string) => document.querySelector('[role="img"] svg')?.outerHTML !== old, before);
    const actual = await first.locator('svg').evaluate(el => el.outerHTML);
    // OLL is drawn by the same path the page uses (processAll on ci-oll): yellow top, neutral rest.
    const expected = await page.evaluate(() => {
      const host = document.createElement('div'); document.body.appendChild(host);
      const i = document.createElement('i');
      i.className = 'ci ci-3x3 ci-iso ci-oll';
      i.setAttribute('data-ci-alg', "R U R' U R U2 R'");
      i.setAttribute('data-ci-theme', 'light');
      host.appendChild(i); (window as any).CubeIcons.processAll(host);
      const svg = i.querySelector('svg')!.outerHTML; host.remove(); return svg;
    });
    assert.equal(actual, expected, 'SVG is the real library render of the OLL case (ci-oll mode)');
    assert.equal(await first.evaluate(el => Math.round(el.getBoundingClientRect().width)), 220);
    assert.equal(await page.locator('.ci-scrambled').count(), 0);
    assert.equal(scriptRequests, 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
