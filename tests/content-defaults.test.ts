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
  for (const key of ['logoUrl', 'whatsappUrl', 'instagramUrl', 'contactEmail', 'communityPhotoUrl', 'developerPhotoUrl', 'portfolioUrl', 'githubUrl', 'linkedinUrl', 'developerContact']) assert.equal(content[key], '', `do not invent ${key}`);
  assert.match(content.history, /informad|confirmad|preenchid/);
  assert.match(content.meetings, /informad|confirmad|preenchid/);
  assert.doesNotMatch(content.history + content.meetings, /\b\d{4}\b|https?:|@/);
  assert.match(content.developerBio, /Henrique Rojas/);
  assert.match(content.developerBio, /estudante de Ciência da Computação/);
  assert.match(content.developerBio, /delegado WCA/);
});
