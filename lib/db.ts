import pg from 'pg';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
pool.on('error', () => console.error('Falha de conexão PostgreSQL no pool.'));
export type Db = pg.Pool | pg.PoolClient;
export async function query(text: string, values: unknown[] = [], db: Db = pool): Promise<any[]> {
  return (await db.query(text, values)).rows;
}
export async function transaction<T>(run: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await run(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export function camel(row: Record<string, any>): any {
  return Object.fromEntries(Object.entries(row).map(([key,value]) => [key.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase()),value]));
}
export async function audit(db: Db, actorId: string | null, action: string, targetId?: string, details: Record<string,unknown> = {}) {
  await query('INSERT INTO audit(actor_id,action,target_id,details) VALUES($1,$2,$3,$4::jsonb)',[actorId,action,targetId || null,JSON.stringify(details)],db);
}
