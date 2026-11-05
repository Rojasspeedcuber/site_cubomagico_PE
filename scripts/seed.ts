import '../lib/env.ts';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { pool, query, transaction } from '../lib/db.ts';
import { algorithmSchema, contentSchema, parse } from '../lib/validation.ts';
try {
 const algorithms=parse(z.array(algorithmSchema),JSON.parse(await readFile(new URL('../data/algorithms.json',import.meta.url),'utf8')));
 const content=parse(contentSchema,JSON.parse(await readFile(new URL('../data/content.json',import.meta.url),'utf8')));
 let insertedAlgorithms=0,insertedContent=0;
 await transaction(async db=>{
  for(const item of algorithms) {
   const id=item.id || `${item.category.toLowerCase()}-${createHash('sha256').update(item.name+item.algorithm).digest('hex').slice(0,16)}`;
   const rows=await query('INSERT INTO algorithms(id,name,category,algorithm,variations,orientation,notes,source_url,source_name,validated,method,puzzle) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO NOTHING RETURNING id',[id,item.name,item.category,item.algorithm,JSON.stringify(item.variations),item.orientation,item.notes,item.sourceUrl,item.sourceName,item.validated,item.method,item.puzzle],db);
   insertedAlgorithms+=rows.length;
  }
  for(const [key,value] of Object.entries(content)) {
   if(value===undefined)continue;
   const rows=await query('INSERT INTO content(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING RETURNING key',[key,key==='communityName' && process.env.COMMUNITY_NAME ? process.env.COMMUNITY_NAME : value],db);
   insertedContent+=rows.length;
  }
 });
 console.log(`Conteúdo curado: ${insertedAlgorithms} algoritmos e ${insertedContent} campos inseridos. Edições existentes preservadas. Nenhum usuário ou evento criado.`);
} catch(error) { console.error('Falha no seed:',error instanceof Error ? error.message : 'erro'); process.exitCode=1; } finally { await pool.end(); }
