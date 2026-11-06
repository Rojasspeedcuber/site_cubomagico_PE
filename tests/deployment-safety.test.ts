import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('container runtime keeps uploads persistent and out of build context',()=>{
 const compose=readFileSync(new URL('../compose.yaml',import.meta.url),'utf8');
 const docker=readFileSync(new URL('../Dockerfile',import.meta.url),'utf8');
 const ignore=readFileSync(new URL('../.dockerignore',import.meta.url),'utf8');
 assert.match(compose,/MEDIA_STORAGE_DIR: \/app\/\.data\/media/);
 assert.match(compose,/media-data:\/app\/\.data\/media/);
 assert.match(ignore,/^\.data\/?$/m);
 assert.match(docker,/mkdir -p \/app\/\.data\/media/);
 assert.ok(docker.indexOf('mkdir -p /app/.data/media')<docker.indexOf('USER node'));
});
