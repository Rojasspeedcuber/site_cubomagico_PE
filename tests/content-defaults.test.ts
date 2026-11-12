import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('institutional defaults are editable strings with no invented contacts, history, or meeting dates', () => {
  const url = new URL('../data/content.json', import.meta.url);
  assert.ok(existsSync(url), 'missing editable content defaults');
  const content = JSON.parse(readFileSync(url, 'utf8'));
  const keys = ['communityName', 'communityShortName', 'logoUrl', 'history', 'objectives', 'meetings', 'welcome', 'whatsappUrl', 'instagramUrl', 'contactEmail', 'communityPhotoUrl', 'communityPhotoAlt', 'developerBio', 'developerPhotoUrl', 'portfolioUrl', 'githubUrl', 'linkedinUrl', 'developerContact'];
  assert.deepEqual(Object.keys(content).sort(), keys.sort());
  for (const key of keys) assert.equal(typeof content[key], 'string', key);
  assert.equal(content.logoUrl, 'https://cubomagicope.rojasdev.site/imgs/logo-cubo-pe.jpeg');
  assert.equal(content.contactEmail, 'henriquer01@rojasdev.cloud');
  assert.equal(content.developerContact, 'henriquer01@rojasdev.cloud');
  assert.deepEqual(readFileSync(new URL('../public/imgs/logo-cubo-pe.jpeg', import.meta.url)), readFileSync(new URL('../imgs/Logo - cobomagico_pe.jpeg', import.meta.url)));
  for (const key of ['whatsappUrl', 'instagramUrl', 'communityPhotoUrl', 'developerPhotoUrl', 'portfolioUrl']) assert.equal(content[key], '', `do not invent ${key}`);
  assert.match(content.history, /informad|confirmad|preenchid/);
  assert.match(content.meetings, /informad|confirmad|preenchid/);
  assert.doesNotMatch(content.history + content.meetings, /\b\d{4}\b|https?:|@/);
  assert.match(content.developerBio, /Henrique Rojas Moreno de Almeida/);
  assert.match(content.developerBio, /estudante de Ciência da Computação/);
  assert.match(content.developerBio, /Desde 2023, atuo como delegado voluntário da World Cube Association \(WCA\)/);
  assert.equal(content.githubUrl, 'https://github.com/Rojasspeedcuber');
  assert.equal(content.linkedinUrl, 'https://www.linkedin.com/in/henrique-rojas-aa152b223/');
});
