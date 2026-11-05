import { handleApi } from '../../../lib/api.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{path:string[]}> };
async function handler(request:Request, context:Context) { await context.params; return handleApi(request); }
export {handler as GET,handler as POST,handler as PATCH,handler as DELETE};
