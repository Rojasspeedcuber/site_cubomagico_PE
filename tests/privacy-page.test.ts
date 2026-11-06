import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

test('privacy page explains retention, rights, external providers and the confirmed support channel', async () => {
  const page = await import('../app/privacidade/page.tsx').catch(() => null);
  assert.equal(typeof page?.default, 'function', 'missing public privacy policy');
  const html = renderToStaticMarkup(createElement(page!.default));
  for(const text of ['henriquer01@rojasdev.cloud','90 dias','7 dias','14 dias','exclusão','exportação','vídeos','WCA','Resend','backup']) assert.ok(html.includes(text),text);
  assert.match(html, /mailto:henriquer01@rojasdev.cloud/);
  assert.ok(!html.includes('Google Analytics'));
});
