export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export type User = { id: string; displayName: string; city: string; photoUrl: string; wcaId: string; role: 'ADMIN' | 'ORGANIZER' | 'COMPETITOR' };
export function canManage(user: Pick<User,'id'|'role'> | null, ownerId: string) {
  return !!user && (user.role === 'ADMIN' || (user.role === 'ORGANIZER' && user.id === ownerId));
}
export function assertWindow(open: Date | string, close: Date | string, now = new Date()) {
  if (now.getTime() < new Date(open).getTime() || now.getTime() >= new Date(close).getTime()) throw new HttpError(403, 'Fora do prazo permitido.');
}
export function requireOrigin(request: Request, appUrl = process.env.APP_URL || 'http://localhost:3000') {
  let expected: string;
  try { expected = new URL(appUrl).origin; } catch { throw new Error('APP_URL inválida.'); }
  if (request.headers.get('origin') !== expected) throw new HttpError(403, 'Origem não permitida.');
}
export function authenticated(user: User | null): User {
  if (!user) throw new HttpError(401, 'Entre na sua conta.');
  return user;
}
export function admin(user: User | null): User {
  const actor = authenticated(user);
  if (actor.role !== 'ADMIN') throw new HttpError(403, 'Acesso restrito a administradores.');
  return actor;
}
