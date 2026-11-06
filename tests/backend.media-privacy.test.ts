import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as media from '../lib/media.ts';
import * as privacy from '../lib/privacy.ts';
import * as retention from '../scripts/retention.ts';

// Real, complete 1×1 PNG (not a MIME-only stand-in).
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=', 'base64');
const scratch = process.env.TMPDIR || tmpdir();

test('media validates actual signatures, MIME agreement, kind and file size', () => {
 assert.equal(typeof media.validateMedia, 'function');
 assert.equal(media.validateMedia('photo', 'image/png', png), 'image/png');
 assert.throws(() => media.validateMedia('photo', 'image/jpeg', png), /formato|tipo/i);
 assert.throws(() => media.validateMedia('video', 'image/png', png), /formato|tipo/i);
 assert.throws(() => media.validateMedia('photo', 'image/svg+xml', Buffer.from('<svg/>')), /formato|tipo/i);
 assert.throws(() => media.validateMedia('photo', 'image/png', Buffer.from('<html>fake</html>')), /formato|tipo/i);
 assert.throws(() => media.validateMedia('photo', 'image/png', png.subarray(0, 20)), /formato|tipo/i);
 assert.throws(() => media.validateMedia('photo', 'image/png', Buffer.alloc(5 * 1024 * 1024 + 1)), /grande|limite/i);
});

test('disk storage uses opaque UUID names, exclusive creation and rejects traversal/symlinks', async () => {
 assert.equal(typeof media.writeMediaFile, 'function');
 const root = await mkdtemp(join(scratch, 'cubo-media-'));
 const id = randomUUID();
 try {
  await media.writeMediaFile(id, png, root);
  assert.deepEqual(await readFile(join(root, id)), png);
  await assert.rejects(() => media.writeMediaFile(id, png, root));
  await assert.rejects(() => media.writeMediaFile('../escape', png, root), /identificador/i);
  const linked = randomUUID();
  await symlink(join(root, id), join(root, linked));
  await assert.rejects(() => media.readMediaFile(linked, root));
  assert.throws(() => media.mediaPath(randomUUID(),join(process.cwd(),'public','uploads')),/fora de public/i);
  const publicAlias=join(root,'public-alias'); await symlink(join(process.cwd(),'public'),publicAlias);
  assert.throws(() => media.mediaPath(randomUUID(),join(publicAlias,'new-directory')),/fora de public/i);
  const result = await media.readMediaFile(id, root);
  assert.deepEqual(Buffer.from(await new Response(result.stream).arrayBuffer()), png);
 } finally { await rm(root, {recursive:true,force:true}); }
});

test('video signatures accept real MP4/WebM containers, never renamed HTML or truncated headers', async t => {
 const root = await mkdtemp(join(scratch, 'cubo-video-'));
 try {
  for (const [extension, codec, mime] of [['mp4', 'libx264', 'video/mp4'], ['webm', 'libvpx', 'video/webm']]) {
   const path = join(root, `sample.${extension}`);
   const generated = spawnSync('ffmpeg', ['-v','error','-f','lavfi','-i','color=c=black:s=16x16:d=0.1','-c:v',codec,'-an',path]);
   if (generated.error && (generated.error as NodeJS.ErrnoException).code === 'ENOENT') { t.skip('ffmpeg necessário apenas para gerar fixtures de vídeo reais'); return; }
   assert.equal(generated.status, 0, generated.stderr.toString());
   const bytes = await readFile(path);
   assert.equal(media.validateMedia('video', mime, bytes), mime);
   assert.throws(() => media.validateMedia('video', mime, bytes.subarray(0, 12)), /formato|tipo/i);
   assert.throws(() => media.validateMedia('video', mime, Buffer.from('<html>not video</html>')), /formato|tipo/i);
  }
 } finally { await rm(root, {recursive:true,force:true}); }
});

test('multipart parser enforces real streamed size without trusting Content-Length', async () => {
 assert.equal(typeof media.parseMediaUpload, 'function');
 const form = new FormData(); form.set('kind','photo'); form.set('file',new File([png],'../secret-name.png',{type:'image/png'}));
 const parsed = await media.parseMediaUpload(new Request('http://localhost/api/media',{method:'POST',body:form}));
 assert.equal(parsed.kind,'photo'); assert.deepEqual(parsed.bytes,png);
 const bad = new FormData(); bad.set('kind','photo'); bad.set('file',new File(['<svg/>'],'x.png',{type:'image/png'}));
 await assert.rejects(() => media.parseMediaUpload(new Request('http://localhost/api/media',{method:'POST',body:bad})), /formato|tipo/i);
 const oversized = new Request('http://localhost/api/media',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=x'},body:new ReadableStream({start(controller){ controller.enqueue(new Uint8Array(media.VIDEO_LIMIT + 65537)); controller.close(); }}),duplex:'half'} as RequestInit);
 await assert.rejects(() => media.parseMediaUpload(oversized), /grande|limite/i);
});

test('stalled upload readers time out and release their upload stream', async () => {
 let cancelled=false;
 const request=new Request('http://localhost/api/media',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=x'},body:new ReadableStream({cancel(){cancelled=true;}}),duplex:'half'} as RequestInit);
 await assert.rejects(() => media.parseMediaUpload(request,10),(e:any) => e.status===408);
 assert.equal(cancelled,true);
});

test('media privacy routes reject unauthenticated writes/exports/deletion and do not swallow unrelated routes', async () => {
 assert.equal(typeof privacy.handleMediaPrivacy, 'function');
 assert.equal(await privacy.handleMediaPrivacy(new Request('http://localhost/api/session'), null), null);
 for (const [path, method] of [['/api/media','POST'], ['/api/privacy/export','GET'], ['/api/privacy/account','DELETE'], [`/api/media/${randomUUID()}`,'DELETE']]) {
  await assert.rejects(() => privacy.handleMediaPrivacy(new Request(`http://localhost${path}`,{method}), null), (e: any) => e.status === 401);
 }
});

test('private video authorization requires owner/admin or an actual submission for the same event organizer', () => {
 assert.equal(typeof media.canReadMedia, 'function');
 const owner = {id:randomUUID(),role:'COMPETITOR' as const};
 const organizer = {id:randomUUID(),role:'ORGANIZER' as const};
 const row = {kind:'video' as const,owner_id:owner.id};
 assert.equal(media.canReadMedia(row,null,[]),false);
 assert.equal(media.canReadMedia(row,owner,[]),true);
 assert.equal(media.canReadMedia(row,{id:randomUUID(),role:'ADMIN'},[]),true);
 assert.equal(media.canReadMedia(row,organizer,[]),false);
 assert.equal(media.canReadMedia(row,organizer,[organizer.id]),true);
 assert.equal(media.canReadMedia(row,{...organizer,role:'COMPETITOR'},[organizer.id]),false);
 assert.equal(media.canReadMedia({...row,kind:'photo'},null,[]),true);
});

test('account deletion requires exact confirmation and password; last admin and event owners are protected', () => {
 assert.equal(typeof privacy.validateAccountDeletion, 'function');
 assert.deepEqual(privacy.validateAccountDeletion({password:'secret',confirmation:'EXCLUIR'}),{password:'secret',confirmation:'EXCLUIR'});
 for(const data of [{password:'secret',confirmation:'excluir'},{password:'',confirmation:'EXCLUIR'},{password:'secret'}]) assert.throws(() => privacy.validateAccountDeletion(data));
 assert.equal(typeof privacy.assertAccountDeletable,'function');
 assert.throws(() => privacy.assertAccountDeletable('ADMIN',1,0), (e:any) => e.status===409);
 assert.throws(() => privacy.assertAccountDeletable('ORGANIZER',2,1), (e:any) => e.status===409);
 assert.doesNotThrow(() => privacy.assertAccountDeletable('ADMIN',2,0));
});

test('PostgreSQL media lifecycle: uploads, private access, owned references, export and real erasure', async t => {
 assert.equal(typeof media.uploadMedia,'function');
 assert.equal(typeof privacy.exportAccount,'function');
 assert.equal(typeof privacy.deleteAccount,'function');
 if(!process.env.DATABASE_URL) { t.skip('Executar sequencialmente por npm run test:integration; nunca usar banco da aplicação.'); return; }
 const {query, pool} = await import('../lib/db.ts');
 const {hashPassword, publicUser, createSession} = await import('../lib/auth.ts');
 const root = await mkdtemp(join(scratch,'cubo-media-db-'));
 const previousRoot = process.env.MEDIA_STORAGE_DIR; process.env.MEDIA_STORAGE_DIR = root;
 const ids:string[] = []; let eventId:string|undefined;
 const password = 'long-media-test-password';
 try {
  const create = async (role:string) => {
   const [row] = await query('INSERT INTO users(email,password_hash,display_name,role) VALUES($1,$2,$3,$4) RETURNING *',[`media-${randomUUID()}@example.test`,await hashPassword(password),'Pessoa de teste',role]); ids.push(row.id); return publicUser(row);
  };
  const owner = await create('COMPETITOR'), outsider = await create('COMPETITOR'), organizer = await create('ORGANIZER'), otherOrganizer = await create('ORGANIZER'), admin = await create('ADMIN');
  const upload = (actor:typeof owner) => { const form = new FormData(); form.set('kind','photo'); form.set('file',new File([png],'private-original.png',{type:'image/png'})); return media.uploadMedia(new Request('http://localhost/api/media',{method:'POST',body:form}),actor); };
  const image = await upload(owner);
  assert.ok(image.url.endsWith(`/api/media/${image.id}`));
  const publicImage = await media.serveMedia(image.id,null,new Request(image.url)); assert.equal(publicImage.status,200); await publicImage.arrayBuffer();
  await assert.rejects(() => media.deleteMedia(image.id,outsider),(e:any) => e.status===403);
  await query('UPDATE users SET photo_url=$1 WHERE id=$2',[image.url,owner.id]);
  const [event] = await query("INSERT INTO events(owner_id,name,registration_open,registration_close,status) VALUES($1,'Privacidade teste',now()-interval '2 days',now()+interval '1 day','OPEN') RETURNING id",[organizer.id]); eventId=event.id;
  const [round] = await query("INSERT INTO rounds(event_id,name,puzzle,format,opens_at,closes_at,scrambles) VALUES($1,'Rodada teste','333','MO3',now()-interval '1 day',now()+interval '1 day','[\"R\",\"U\",\"F\"]') RETURNING id",[eventId]);
  await query('INSERT INTO participants(event_id,user_id) VALUES($1,$2)',[eventId,owner.id]);
  await query('INSERT INTO registrations(event_id,round_id,user_id) VALUES($1,$2,$3)',[eventId,round.id,owner.id]);
  const videoPath = join(root,'fixture.mp4');
  const generated = spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=16x16:d=0.1','-c:v','libx264','-an',videoPath]);
  assert.equal(generated.status,0,generated.stderr?.toString());
  const videoBytes=await readFile(videoPath); await rm(videoPath);
  const videoForm=new FormData(); videoForm.set('kind','video'); videoForm.set('file',new File([videoBytes],'private-name.mp4',{type:'video/mp4'}));
  const video=await media.uploadMedia(new Request('http://localhost/api/media',{method:'POST',body:videoForm}),owner);
  const videoId=video.id, videoUrl=video.url;
  await assert.rejects(() => media.serveMedia(videoId,null,new Request(videoUrl)),(e:any) => e.status===401);
  await assert.rejects(() => media.serveMedia(videoId,organizer,new Request(videoUrl)),(e:any) => e.status===403);
  const [submission] = await query("INSERT INTO submissions(round_id,user_id,attempts,video_url) VALUES($1,$2,'[{\"timeCs\":100,\"penalty\":\"NONE\"},{\"timeCs\":100,\"penalty\":\"NONE\"},{\"timeCs\":100,\"penalty\":\"NONE\"}]',$3) RETURNING *",[round.id,owner.id,videoUrl]);
  assert.equal(submission.video_media_id,videoId);
  await query('INSERT INTO participants(event_id,user_id) VALUES($1,$2)',[eventId,outsider.id]);
  await query('INSERT INTO registrations(event_id,round_id,user_id) VALUES($1,$2,$3)',[eventId,round.id,outsider.id]);
  await assert.rejects(() => query('INSERT INTO submissions(round_id,user_id,attempts,video_url) VALUES($1,$2,$3::jsonb,$4)',[round.id,outsider.id,JSON.stringify(submission.attempts),videoUrl]));
  await assert.rejects(() => query('UPDATE submissions SET video_url=$1 WHERE id=$2',[image.url,submission.id]));
  const response = await media.serveMedia(videoId,organizer,new Request(videoUrl,{headers:{range:'bytes=0-15'}}));
  assert.equal(response.status,206); assert.equal(response.headers.get('cache-control'),'private, no-store'); assert.equal((await response.arrayBuffer()).byteLength,16);
  await assert.rejects(() => media.serveMedia(videoId,otherOrganizer,new Request(videoUrl)),(e:any) => e.status===403);
  const adminVideo=await media.serveMedia(videoId,admin,new Request(videoUrl)); await adminVideo.arrayBuffer();
  const exported = await privacy.exportAccount(owner);
  assert.equal(exported.profile.id,owner.id); assert.equal(exported.submissions.length,1); assert.equal(exported.media.length,2);
  assert.ok(!JSON.stringify(exported).includes('password_hash')); assert.ok(!JSON.stringify(exported).includes('token_hash'));
  const [otherRound] = await query("INSERT INTO rounds(event_id,name,puzzle,format,opens_at,closes_at,scrambles) VALUES($1,'Outra rodada','333','MO3',now()-interval '1 day',now()+interval '1 day','[\"R\",\"U\",\"F\"]') RETURNING id",[eventId]);
  await query('INSERT INTO registrations(event_id,round_id,user_id) VALUES($1,$2,$3)',[eventId,otherRound.id,owner.id]);
  await query('INSERT INTO submissions(round_id,user_id,attempts,video_url) VALUES($1,$2,$3::jsonb,$4)',[otherRound.id,owner.id,JSON.stringify(submission.attempts),videoUrl]);
  await query("UPDATE rounds SET opens_at=now()-interval '100 days',closes_at=now()-interval '91 days' WHERE id=$1",[round.id]);
  const dryRun=await retention.runRetention({dryRun:true,storageDir:root});
  assert.ok(dryRun.expiredLinks>=1); assert.ok((await readFile(join(root,videoId))).length>0);
  await retention.runRetention({dryRun:false,storageDir:root});
  assert.equal((await query('SELECT video_url FROM submissions WHERE id=$1',[submission.id]))[0].video_url,'');
  assert.ok((await readFile(join(root,videoId))).length>0,'rodada ainda retida preserva arquivo compartilhado');
  await query("UPDATE rounds SET opens_at=now()-interval '100 days',closes_at=now()-interval '91 days' WHERE id=$1",[otherRound.id]);
  await retention.runRetention({dryRun:false,storageDir:root});
  await assert.rejects(() => readFile(join(root,videoId)));
  assert.equal((await retention.runRetention({dryRun:false,storageDir:root})).expiredLinks,0);
  assert.equal((await query('SELECT 1 FROM media WHERE id=$1',[image.id])).length,1,'foto vinculada deve permanecer');
  await createSession(owner.id);
  await assert.rejects(() => privacy.deleteAccount(owner,{password:'incorrect',confirmation:'EXCLUIR'}),(e:any) => e.status===401);
  await assert.rejects(() => privacy.deleteAccount(organizer,{password,confirmation:'EXCLUIR'}),(e:any) => e.status===409);
  assert.deepEqual(await privacy.deleteAccount(owner,{password,confirmation:'EXCLUIR'}),{deleted:true});
  for(const table of ['users','sessions','participants','registrations','submissions','media']) {
   const key=table==='users'?'id':table==='media'?'owner_id':'user_id';
   assert.equal((await query(`SELECT 1 FROM ${table} WHERE ${key}=$1`,[owner.id])).length,0,table);
  }
  await assert.rejects(() => readFile(join(root,image.id))); await assert.rejects(() => readFile(join(root,videoId)));
 } finally {
  if(eventId) await query('DELETE FROM events WHERE id=$1',[eventId]);
  await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);
  if(previousRoot===undefined) delete process.env.MEDIA_STORAGE_DIR; else process.env.MEDIA_STORAGE_DIR=previousRoot;
  await rm(root,{recursive:true,force:true}); await pool.end();
 }
});

test('retention boundaries use ninety days after round close and seven days for orphans', () => {
 assert.equal(typeof retention.retentionExpired,'function');
 const close = new Date('2026-01-01T00:00:00Z');
 assert.equal(retention.retentionExpired(close,new Date('2026-03-31T23:59:59Z')),false);
 assert.equal(retention.retentionExpired(close,new Date('2026-04-01T00:00:00Z')),true);
 assert.throws(() => retention.retentionExpired(new Date('invalid'),new Date()));
});

test('orphan disk cleanup removes only old UUID files, honors dry-run and is idempotent', async () => {
 assert.equal(typeof retention.cleanDiskOrphans,'function');
 const root = await mkdtemp(join(scratch,'cubo-orphans-'));
 const orphan=randomUUID(), known=randomUUID(), recent=randomUUID(), linked=randomUUID();
 const now=new Date('2026-11-06T12:00:00Z'), old=new Date('2026-10-01T00:00:00Z');
 try {
  for(const id of [orphan,known,recent]) await media.writeMediaFile(id,png,root);
  await writeFile(join(root,'do-not-delete.txt'),'unrelated');
  for(const id of [orphan,known]) await utimes(join(root,id),old,old);
  await utimes(join(root,recent),now,now);
  await symlink(join(root,known),join(root,linked));
  assert.deepEqual(await retention.cleanDiskOrphans(new Set([known]),{root,now,dryRun:true}),[orphan]);
  assert.ok(await readFile(join(root,orphan)));
  assert.deepEqual(await retention.cleanDiskOrphans(new Set([known]),{root,now,dryRun:false}),[orphan]);
  assert.deepEqual(await retention.cleanDiskOrphans(new Set([known]),{root,now,dryRun:false}),[]);
  assert.ok(await readFile(join(root,known))); assert.ok(await readFile(join(root,'do-not-delete.txt')));
 } finally { await rm(root,{recursive:true,force:true}); }
});

test('standalone media and privacy controls expose real upload/export and explicit destructive confirmation', async () => {
 const upload = await import('../components/MediaUpload.tsx').catch(() => null);
 const tools = await import('../components/PrivacyTools.tsx').catch(() => null);
 assert.equal(typeof upload?.default,'function'); assert.equal(typeof tools?.default,'function');
 const photo = renderToStaticMarkup(createElement(upload!.default,{kind:'photo',onUploaded:()=>{}}));
 const video = renderToStaticMarkup(createElement(upload!.default,{kind:'video',onUploaded:()=>{}}));
 assert.match(photo,/type="file"/); assert.match(photo,/image\/png/); assert.match(photo,/5 MiB/);
 assert.match(video,/video\/mp4/); assert.match(video,/100 MiB/); assert.match(video,/privado/i);
 const privacyHtml = renderToStaticMarkup(createElement(tools!.default,{}));
 assert.match(privacyHtml,/Exportar meus dados/); assert.match(privacyHtml,/EXCLUIR/); assert.match(privacyHtml,/type="password"/); assert.match(privacyHtml,/disabled/);
});
