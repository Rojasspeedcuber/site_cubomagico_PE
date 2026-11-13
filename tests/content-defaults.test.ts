import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('community content reflects the connected profile without inventing recurring events or contacts', () => {
  const url = new URL('../data/content.json', import.meta.url);
  assert.ok(existsSync(url), 'missing editable content defaults');
  const content = JSON.parse(readFileSync(url, 'utf8'));
  const keys = ['communityName', 'communityShortName', 'logoUrl', 'history', 'objectives', 'meetings', 'welcome', 'whatsappUrl', 'instagramUrl', 'contactEmail', 'communityPhotoUrl', 'communityPhotoAlt', 'developerBio', 'developerPhotoUrl', 'portfolioUrl', 'githubUrl', 'linkedinUrl', 'developerContact'];
  assert.deepEqual(Object.keys(content).sort(), keys.sort());
  for (const key of keys) assert.equal(typeof content[key], 'string', key);
  assert.equal(content.communityShortName, 'CUBO MÁGICO PE');
  assert.equal(content.logoUrl, 'https://cubomagicope.rojasdev.site/imgs/logo-cubo-pe.jpeg');
  assert.equal(content.contactEmail, 'henriquer01@rojasdev.cloud');
  assert.equal(content.developerContact, 'henriquer01@rojasdev.cloud');
  assert.deepEqual(readFileSync(new URL('../public/imgs/logo-cubo-pe.jpeg', import.meta.url)), readFileSync(new URL('../imgs/Logo - cobomagico_pe.jpeg', import.meta.url)));
  for (const key of ['whatsappUrl', 'communityPhotoUrl', 'developerPhotoUrl', 'portfolioUrl']) assert.equal(content[key], '', `do not invent ${key}`);
  assert.equal(content.instagramUrl, 'https://www.instagram.com/cubomagico_pe/');
  assert.match(content.history, /IV Recife Open/);
  assert.match(content.history, /VII Recife Open/);
  assert.match(content.meetings, /Não há um calendário fixo de encontros informado/);
  assert.doesNotMatch(content.welcome, /acervo é pequeno|não contém todos os casos/);
  assert.match(content.developerBio, /Henrique Rojas Moreno de Almeida/);
  assert.match(content.developerBio, /estudante de Ciência da Computação/);
  assert.match(content.developerBio, /Desde 2023, atuo como delegado voluntário da World Cube Association \(WCA\)/);
  assert.equal(content.githubUrl, 'https://github.com/Rojasspeedcuber');
  assert.equal(content.linkedinUrl, 'https://www.linkedin.com/in/henrique-rojas-aa152b223/');
});
