import { constants, existsSync, realpathSync } from 'node:fs';
import { mkdir, open, unlink } from 'node:fs/promises';
import { resolve, join, basename, dirname } from 'node:path';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { query, transaction, audit, type Db } from './db.ts';
import { HttpError, authenticated, requireOrigin, type User } from './policy.ts';

export type MediaKind = 'photo' | 'video';
export const PHOTO_LIMIT = 5 * 1024 * 1024;
export const VIDEO_LIMIT = 100 * 1024 * 1024;
export const OWNER_QUOTA = 1024 * 1024 * 1024;
export const OWNER_FILE_LIMIT = 200;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function mediaPath(id: string, root = process.env.MEDIA_STORAGE_DIR || '.data/media') {
 if (!uuidPattern.test(id)) throw new HttpError(400, 'Identificador de mídia inválido.');
 // Runtime uploads are provisioned separately; never bundle disk contents or ancestor trees.
 const directory = resolve(/* turbopackIgnore: true */ root);
 const publicDir = resolve('public');
 let ancestor=directory; const suffix:string[]=[];
 while(!existsSync(/* turbopackIgnore: true */ ancestor)) { suffix.unshift(basename(ancestor)); ancestor=dirname(ancestor); }
 const physical=resolve(realpathSync(/* turbopackIgnore: true */ ancestor),...suffix);
 const physicalPublic=existsSync(publicDir)?realpathSync(publicDir):publicDir;
 if ([directory,physical].some(path=>path===publicDir || path.startsWith(publicDir+'/') || path===physicalPublic || path.startsWith(physicalPublic+'/'))) throw new Error('MEDIA_STORAGE_DIR deve ficar fora de public.');
 return join(/* turbopackIgnore: true */ directory, id);
}
export function validateMedia(kind: MediaKind, declared: string, bytes: Buffer): string {
 if (!bytes.length || bytes.length > (kind === 'photo' ? PHOTO_LIMIT : VIDEO_LIMIT)) throw new HttpError(413, 'Arquivo vazio ou maior que o limite permitido.');
 let detected = '';
 if (bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND') detected = 'image/png';
 if (bytes.length >= 16 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) detected = 'image/jpeg';
 if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))) detected = 'image/webp';
 if (bytes.length > 32 && bytes.toString('ascii', 4, 8) === 'ftyp') {
  const boxes = new Set<string>(); let offset = 0;
  while (offset + 8 <= bytes.length) {
   let size = bytes.readUInt32BE(offset); const type = bytes.toString('ascii', offset + 4, offset + 8);
   if (size === 1) {
    if (offset + 16 > bytes.length) break;
    const large = bytes.readBigUInt64BE(offset + 8);
    if (large > BigInt(bytes.length - offset)) break;
    size = Number(large);
   }
   if (size === 0) size = bytes.length - offset;
   if (size < 8 || offset + size > bytes.length) break;
   boxes.add(type); offset += size;
  }
  if (offset === bytes.length && boxes.has('moov') && boxes.has('mdat') && /^(isom|iso[2-9]|mp4[12]|avc1|M4V )$/.test(bytes.toString('ascii', 8, 12))) detected = 'video/mp4';
 }
 if (bytes.length > 64 && bytes.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')) && bytes.subarray(4, 512).includes(Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d])) && bytes.includes(Buffer.from('18538067', 'hex')) && bytes.includes(Buffer.from('1654ae6b', 'hex'))) detected = 'video/webm';
 if (!detected || detected !== declared.toLowerCase() || (kind === 'photo') !== detected.startsWith('image/')) throw new HttpError(415, 'Tipo ou formato de arquivo não permitido.');
 return detected;
}
export async function writeMediaFile(id: string, bytes: Buffer, root?: string) {
 const path = mediaPath(id, root);
 await mkdir(resolve(path, '..'), {recursive: true, mode: 0o700});
 const file = await open(/* turbopackIgnore: true */ path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
 try { await file.writeFile(bytes); await file.sync(); }
 catch (error) { await file.close(); await unlink(path).catch(() => {}); throw error; }
 await file.close();
}
export async function readMediaFile(id: string, root?: string, start?: number, end?: number) {
 const file = await open(/* turbopackIgnore: true */ mediaPath(id, root), constants.O_RDONLY | constants.O_NOFOLLOW);
 try {
  const stat = await file.stat();
  if (!stat.isFile()) throw new Error('Arquivo de mídia inválido.');
  return {size: stat.size, stream: Readable.toWeb(file.createReadStream({start, end, autoClose: true})) as ReadableStream<Uint8Array>};
 } catch (error) { await file.close(); throw error; }
}
export async function unlinkMediaFile(id: string, root?: string) {
 try { await unlink(mediaPath(id, root)); }
 catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
export async function parseMediaUpload(request: Request, timeoutMs = 120000) {
 const contentType = request.headers.get('content-type') || '';
 if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) throw new HttpError(400, 'Envie multipart/form-data com kind e file.');
 const limit = VIDEO_LIMIT + 65536;
 if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, 'Upload maior que o limite permitido.');
 const reader = request.body?.getReader();
 if (!reader) throw new HttpError(400, 'Arquivo obrigatório.');
 let timer: ReturnType<typeof setTimeout>;
 const timeout = new Promise<never>((_,reject) => {
  timer=setTimeout(() => { reject(new HttpError(408,'Tempo limite do upload excedido. Tente novamente.')); void reader.cancel().catch(()=>{}); },timeoutMs);
 });
 const chunks: Uint8Array[] = []; let size = 0;
 try {
  while (true) {
   const {done, value} = await Promise.race([reader.read(),timeout]); if (done) break;
   size += value.byteLength;
   if (size > limit) { await reader.cancel(); throw new HttpError(413, 'Upload maior que o limite permitido.'); }
   chunks.push(value);
  }
 } finally { clearTimeout(timer!); reader.releaseLock(); }
 let form: FormData;
 try { form = await new Response(Buffer.concat(chunks), {headers:{'Content-Type':contentType}}).formData(); }
 catch { throw new HttpError(400, 'Upload multipart inválido.'); }
 const kind = form.get('kind'); const file = form.get('file');
 if ((kind !== 'photo' && kind !== 'video') || !(file instanceof File) || [...form.keys()].length !== 2) throw new HttpError(400, 'Informe somente kind (photo ou video) e file.');
 if (file.size > (kind === 'photo' ? PHOTO_LIMIT : VIDEO_LIMIT)) throw new HttpError(413, 'Arquivo maior que o limite permitido.');
 const bytes = Buffer.from(await file.arrayBuffer());
 return {kind, bytes, mime:validateMedia(kind, file.type, bytes)};
}

export function canReadMedia(media: {kind:MediaKind;owner_id:string}, user: Pick<User,'id'|'role'> | null, submissionEventOwners: string[]) {
 return media.kind === 'photo' || !!user && (media.owner_id === user.id || user.role === 'ADMIN' || user.role === 'ORGANIZER' && submissionEventOwners.includes(user.id));
}
const json = (data: unknown, status = 200) => Response.json({data}, {status, headers:{'Cache-Control':'private, no-store'}});
let activeUploads = 0;
export async function uploadMedia(request: Request, actor: User) {
 if (activeUploads >= 2) throw new HttpError(429, 'Uploads ocupados. Aguarde e tente novamente.');
 activeUploads++;
 let written: string | undefined;
 try {
  const {kind, mime, bytes} = await parseMediaUpload(request);
  const id = randomUUID();
  const app = new URL(process.env.APP_URL || 'http://localhost:3000');
  if (!['http:','https:'].includes(app.protocol) || app.username || app.password) throw new Error('APP_URL inválida.');
  const url = new URL(`/api/media/${id}`, app.origin).href;
  const result = await transaction(async db => {
   // The user row serializes quotas across processes and with account deletion.
   if (!(await query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[actor.id],db)).length) throw new HttpError(401, 'Entre novamente na sua conta.');
   const [usage] = await query('SELECT count(*)::integer AS count,coalesce(sum(bytes),0)::text AS bytes FROM media WHERE owner_id=$1',[actor.id],db);
   if (usage.count >= OWNER_FILE_LIMIT || Number(usage.bytes) + bytes.length > OWNER_QUOTA) throw new HttpError(413, 'Limite de armazenamento da conta atingido. Exclua arquivos antes de enviar outros.');
   await writeMediaFile(id, bytes); written = id;
   await query('INSERT INTO media(id,owner_id,kind,mime,bytes,url) VALUES($1,$2,$3,$4,$5,$6)',[id,actor.id,kind,mime,bytes.length,url],db);
   await audit(db, actor.id, 'MEDIA_UPLOADED', id, {kind,bytes:bytes.length});
   return {id,url};
  });
  return result;
 } catch (error) {
  if (written) await unlinkMediaFile(written);
  throw error;
 } finally { activeUploads--; }
}
export async function serveMedia(id: string, user: User | null, request: Request) {
 mediaPath(id);
 const [row] = await query('SELECT * FROM media WHERE id=$1',[id]);
 if (!row) throw new HttpError(404, 'Mídia não encontrada.');
 const related = row.kind === 'video' && user?.role === 'ORGANIZER' ? await query('SELECT DISTINCT e.owner_id FROM submissions s JOIN rounds r ON r.id=s.round_id JOIN events e ON e.id=r.event_id WHERE s.video_media_id=$1 AND s.user_id=$2',[id,row.owner_id]) : [];
 if (!canReadMedia(row,user,related.map(r=>r.owner_id))) throw new HttpError(user ? 403 : 401, 'Vídeo privado. Entre com uma conta autorizada.');
 const headers: Record<string,string> = {'Content-Type':row.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':`inline; filename="${id}.${row.mime.split('/')[1]}"`,'Accept-Ranges':'bytes','Vary':'Cookie'};
 let start: number | undefined, end: number | undefined;
 const range = request.headers.get('range'), size = Number(row.bytes);
 if (range) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${size}`}});
  start = match[1] ? Number(match[1]) : Math.max(0,size-Number(match[2]));
  end = match[1] && match[2] ? Math.min(Number(match[2]),size-1) : size-1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>=size || end<start || (!match[1] && Number(match[2])===0)) return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${size}`}});
  headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
 }
 let file;
 try { file = await readMediaFile(id,undefined,start,end); }
 catch (error) { if (['ENOENT','ELOOP'].includes((error as NodeJS.ErrnoException).code || '')) throw new HttpError(404, 'Mídia não encontrada.'); throw error; }
 if (file.size !== size) { await file.stream.cancel(); throw new HttpError(503, 'Arquivo de mídia indisponível.'); }
 headers['Content-Length'] = String(range ? end! - start! + 1 : size);
 return new Response(file.stream,{status:range ? 206 : 200,headers});
}
export async function detachMedia(row: {id:string;url:string}, db: Db) {
 const urls = [row.url, `/api/media/${row.id}`];
 await query("UPDATE submissions SET video_url='',video_media_id=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE video_media_id=$1 OR video_url=ANY($2::text[])",[row.id,urls],db);
 await query("UPDATE users SET photo_url='' WHERE photo_url=ANY($1::text[])",[urls],db);
 await query("UPDATE content SET value='' WHERE value=ANY($1::text[])",[urls],db);
}
export async function deleteMedia(id: string, actor: User) {
 mediaPath(id);
 return transaction(async db => {
  const [row] = await query('SELECT * FROM media WHERE id=$1 FOR UPDATE',[id],db);
  if (!row) throw new HttpError(404,'Mídia não encontrada.');
  if (row.owner_id!==actor.id && actor.role!=='ADMIN') throw new HttpError(403,'Você não pode excluir esta mídia.');
  await detachMedia(row,db);
  await unlinkMediaFile(id);
  await query('DELETE FROM media WHERE id=$1',[id],db);
  await audit(db,actor.id,'MEDIA_DELETED',id);
  return {deleted:true};
 });
}
export async function handleMediaRequest(request: Request, user: User | null): Promise<Response|null> {
 const path = new URL(request.url).pathname;
 if (path === '/api/media' && request.method==='POST') {
  const actor=authenticated(user); requireOrigin(request);
  return json(await uploadMedia(request,actor),201);
 }
 const match = /^\/api\/media\/([^/]+)$/.exec(path);
 if (!match) return null;
 if (request.method==='GET') return serveMedia(match[1],user,request);
 if (request.method==='DELETE') {
  const actor=authenticated(user); requireOrigin(request);
  return json(await deleteMedia(match[1],actor));
 }
 return null;
}
