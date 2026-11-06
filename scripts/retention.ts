import { readdir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool, query, transaction } from '../lib/db.ts';
import { mediaPath, unlinkMediaFile } from '../lib/media.ts';

const DAY = 24 * 60 * 60 * 1000;
export function retentionExpired(closesAt: Date, now = new Date()) {
 if (!Number.isFinite(closesAt.getTime()) || !Number.isFinite(now.getTime())) throw new Error('Data de retenção inválida.');
 return now.getTime() - closesAt.getTime() >= 90 * DAY;
}
export async function cleanDiskOrphans(knownIds: Set<string>, options: {root?:string;now?:Date;dryRun?:boolean} = {}) {
 const root = resolve(options.root || process.env.MEDIA_STORAGE_DIR || '.data/media');
 const now = options.now || new Date(); const removed: string[] = [];
 let files: string[];
 try { files = await readdir(root); } catch (error) { if ((error as NodeJS.ErrnoException).code==='ENOENT') return removed; throw error; }
 for (const name of files.sort()) {
  if (knownIds.has(name)) continue;
  try { mediaPath(name,root); } catch { continue; }
  const stat = await lstat(join(root,name));
  if (!stat.isFile() || stat.isSymbolicLink() || now.getTime()-stat.mtimeMs < 7*DAY) continue;
  if (options.dryRun===false) await unlinkMediaFile(name,root);
  removed.push(name);
 }
 return removed;
}
export async function runRetention(options: {now?:Date;dryRun?:boolean;storageDir?:string} = {}) {
 const dryRun=options.dryRun!==false;
 return transaction(async db => {
  await query('SELECT pg_advisory_xact_lock(1865264832)',[],db);
  const now=options.now || (await query('SELECT clock_timestamp() AS now',[],db))[0].now as Date;
  retentionExpired(now,now); // reject invalid caller dates before any mutation
  const expired = await query(`SELECT s.id,s.video_media_id FROM submissions s JOIN rounds r ON r.id=s.round_id
   WHERE s.video_url<>'' AND r.closes_at <= $1::timestamptz-interval '90 days' ORDER BY s.id`,[now],db);
  const expiredMediaIds=[...new Set(expired.map(s=>s.video_media_id).filter(Boolean))];
  // A shared clip stays until ALL linked rounds have passed the retention window.
  // Orphan photos stay while referenced by a profile or a managed content field.
  const candidates = await query(`SELECT m.id,m.url FROM media m
   WHERE (m.created_at <= $1::timestamptz-interval '7 days' OR m.id=ANY($2::uuid[]))
    AND NOT EXISTS(SELECT 1 FROM submissions s JOIN rounds r ON r.id=s.round_id WHERE s.video_media_id=m.id AND r.closes_at > $1::timestamptz-interval '90 days')
    AND NOT EXISTS(SELECT 1 FROM users u WHERE m.kind='photo' AND u.photo_url IN(m.url,'/api/media/'||m.id::text))
    AND NOT EXISTS(SELECT 1 FROM content c WHERE m.kind='photo' AND c.value IN(m.url,'/api/media/'||m.id::text))
   ORDER BY m.id FOR UPDATE OF m`,[now,expiredMediaIds],db);
  if (!dryRun) {
   await query(`UPDATE submissions s SET video_url='',video_media_id=NULL,revision=revision+1,updated_at=clock_timestamp()
    FROM rounds r WHERE r.id=s.round_id AND s.video_url<>'' AND r.closes_at <= $1::timestamptz-interval '90 days'`,[now],db);
   for (const file of candidates) {
    // The FOR UPDATE lock stops new bindings (they need KEY SHARE on media), but the candidate
    // query's NOT EXISTS ran before any wait. Re-read the link state now, with a fresh snapshot.
    const [linked] = await query(`SELECT 1 AS linked FROM submissions s JOIN rounds r ON r.id=s.round_id
     WHERE s.video_media_id=$1 AND r.closes_at > $2::timestamptz-interval '90 days' LIMIT 1`,[file.id,now],db);
    if (linked) continue;
    await unlinkMediaFile(file.id,options.storageDir);
    await query('DELETE FROM media WHERE id=$1',[file.id],db);
   }
  }
  const knownIds=new Set<string>((await query('SELECT id FROM media',[],db)).map(m=>m.id));
  // Dry-run still considers known rows known; it never removes physical files.
  const diskOrphans=await cleanDiskOrphans(knownIds,{root:options.storageDir,now,dryRun});
  return {dryRun,asOf:now.toISOString(),expiredLinks:expired.length,mediaFiles:candidates.length,diskOrphans:diskOrphans.length};
 });
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const flags=process.argv.slice(2);
 if (flags.length!==1 || !['--dry-run','--apply'].includes(flags[0])) {
  console.error('Uso: npx tsx scripts/retention.ts --dry-run | --apply'); process.exitCode=1;
 } else {
  try {
   // Configuration is loaded only for the CLI, never on a test import.
   await import('../lib/env.ts');
   if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL antes de executar a retenção.');
   // Pool initialization is lazy; use the configured URL loaded above.
   pool.options.connectionString=process.env.DATABASE_URL;
   console.log(JSON.stringify(await runRetention({dryRun:flags[0]==='--dry-run'})));
  } catch (error) { console.error('Falha na retenção:',error instanceof Error ? error.message : 'erro'); process.exitCode=1; }
  finally { await pool.end(); }
 }
}
