import test from 'node:test';
import assert from 'node:assert/strict';
import * as defaults from '../lib/community-config.ts';

test('official defaults are present before seed while explicit editorial edits remain intact', () => {
  assert.equal(typeof defaults.resolveContent, 'function');
  const initial = defaults.resolveContent([]);
  assert.equal(initial.contactEmail, 'henriquer01@rojasdev.cloud');
  assert.equal(initial.logoUrl, 'https://cubomagicope.rojasdev.site/imgs/logo-cubo-pe.jpeg');
  const edited = defaults.resolveContent([{key:'history',value:'Relato confirmado'},{key:'logoUrl',value:''},{key:'untrustedKey',value:'x'}]);
  assert.equal(edited.history, 'Relato confirmado');
  assert.equal(edited.logoUrl, '');
  assert.equal(edited.untrustedKey, undefined);
});
