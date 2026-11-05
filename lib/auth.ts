import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { pool, query, type Db } from './db.ts';
import { HttpError, type User } from './policy.ts';
const scrypt = promisify(scryptCallback);
export const publicUser = (row: any): User => ({id:row.id,displayName:row.display_name,city:row.city,photoUrl:row.photo_url,wcaId:row.wca_id,role:row.role});
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function hashPassword(password: string) {
 const salt = randomBytes(16).toString('hex');
 const digest = await scrypt(password,salt,64) as Buffer;
 return `scrypt$${salt}$${digest.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
 const [scheme,salt,hex] = stored.split('$');
 if (scheme!=='scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(hex || '')) return false;
 const actual = await scrypt(password,salt,64) as Buffer;
 return timingSafeEqual(actual,Buffer.from(hex,'hex'));
}
export function readToken(request: Request) {
 const token = request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8);
 return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export async function sessionUser(request: Request): Promise<User | null> {
 const token = readToken(request); if (!token) return null;
 const [row] = await query('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp()',[tokenHash(token)]);
 return row ? publicUser(row) : null;
}
export async function createSession(userId: string, db: Db = pool) {
 const token = randomBytes(32).toString('hex');
 await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '14 days')",[tokenHash(token),userId],db);
 return sessionCookie(token);
}
export function sessionCookie(token: string, clear = false) {
 const secure = (process.env.APP_URL || '').startsWith('https://') || process.env.NODE_ENV === 'production';
 return `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : 1209600}${secure ? '; Secure' : ''}`;
}
export async function rateLimit(key: string, limit: number, seconds = 900) {
 const [row] = await query(`INSERT INTO rate_limits(key,hits,reset_at) VALUES($1,1,clock_timestamp()+$2*interval '1 second')
 ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.reset_at<=clock_timestamp() THEN 1 ELSE rate_limits.hits+1 END,
 reset_at=CASE WHEN rate_limits.reset_at<=clock_timestamp() THEN clock_timestamp()+$2*interval '1 second' ELSE rate_limits.reset_at END RETURNING hits`,[tokenHash(key),seconds]);
 if(row.hits>limit) throw new HttpError(429,'Muitas tentativas. Aguarde e tente novamente.');
}
