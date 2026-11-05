import '../lib/env.ts';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { pool, query } from '../lib/db.ts';
import { setRole } from '../lib/management.ts';
try {
 const {values}=parseArgs({options:{email:{type:'string'},role:{type:'string',default:'ADMIN'},help:{type:'boolean'}},strict:true});
 if(values.help) console.log('Uso: npm run admin -- --email pessoa@exemplo.com [--role ADMIN|ORGANIZER|COMPETITOR]\nCadastre uma conta real pela interface antes de promovê-la. O comando nunca cria usuários.');
 else {
  const email=z.email().parse(values.email).toLowerCase();
  const role=z.enum(['ADMIN','ORGANIZER','COMPETITOR']).parse(values.role);
  const [row]=await query('SELECT id FROM users WHERE email=$1',[email]);
  if(!row) throw new Error('Conta não encontrada. Cadastre a conta real pela interface antes de promovê-la.');
  const result=await setRole(row.id,role,null);
  console.log(`Papel atualizado: ${result.id} → ${result.role}`);
 }
} catch(error) {console.error(error instanceof Error ? error.message : 'Falha na administração.');process.exitCode=1;} finally {await pool.end();}
