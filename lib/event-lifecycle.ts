import { audit, camel, query, transaction, type Db } from './db.ts';
import { eventRow } from './events.ts';
import { generateScrambles } from './scrambles.ts';
import { authenticated, HttpError, requireOrigin, type User } from './policy.ts';
import { body, parse, parsePatch, roundSchema, uuid } from './validation.ts';

const roundFields = 'id,event_id,name,puzzle,format,opens_at,closes_at,video_required,published';

// Every competing write in events.ts takes the event lock first. Check usage
// only after that lock, so registration/publication cannot race this decision.
async function assertUnusedDraft(event: { id: string; status: string; published: boolean }, db: Db) {
  if (event.status !== 'DRAFT' || event.published) throw new HttpError(409, 'Somente rascunhos sem resultados publicados podem ser alterados ou excluídos.');
  const [usage] = await query(`SELECT
    EXISTS(SELECT 1 FROM participants WHERE event_id=$1) AS participants,
    EXISTS(SELECT 1 FROM registrations WHERE event_id=$1) AS registrations,
    EXISTS(SELECT 1 FROM submissions s JOIN rounds r ON r.id=s.round_id WHERE r.event_id=$1) AS submissions,
    EXISTS(SELECT 1 FROM rounds WHERE event_id=$1 AND published) AS published`, [event.id], db);
  if (usage.participants || usage.registrations || usage.submissions || usage.published) throw new HttpError(409, 'O evento possui inscrições, envios ou resultados publicados e não pode ter rodadas alteradas ou excluídas, nem ser excluído.');
}

export async function updateRound(eventId: string, roundId: string, user: User, payload: unknown) {
  const data = parsePatch(roundSchema.partial().strict(), payload);
  if (!Object.keys(data).length) throw new HttpError(400, 'Informe pelo menos um campo da rodada.');
  return transaction(async db => {
    const event = await eventRow(eventId, user, db, true, true);
    const [round] = await query('SELECT * FROM rounds WHERE event_id=$1 AND id=$2 FOR UPDATE', [event.id, parse(uuid, roundId)], db);
    if (!round) throw new HttpError(404, 'Rodada não encontrada.');
    await assertUnusedDraft(event, db);
    if (round.published) throw new HttpError(409, 'Resultados publicados são imutáveis.');
    const opensAt = data.opensAt ?? round.opens_at, closesAt = data.closesAt ?? round.closes_at;
    if (new Date(opensAt) >= new Date(closesAt)) throw new HttpError(400, 'Período de rodada inválido.');
    const puzzle = data.puzzle ?? round.puzzle, format = data.format ?? round.format;
    const scrambles = puzzle !== round.puzzle || format !== round.format ? await generateScrambles(puzzle, format) : round.scrambles;
    const [updated] = await query(`UPDATE rounds SET name=$1,puzzle=$2,format=$3,opens_at=$4,closes_at=$5,video_required=$6,scrambles=$7::jsonb WHERE id=$8 RETURNING ${roundFields}`, [
      data.name ?? round.name, puzzle, format,
      opensAt, closesAt,
      data.videoRequired ?? round.video_required, JSON.stringify(scrambles), round.id,
    ], db);
    await audit(db, user.id, 'ROUND_UPDATED', round.id, { eventId: event.id, fields: Object.keys(data) });
    return camel(updated);
  });
}

export async function deleteRound(eventId: string, roundId: string, user: User) {
  return transaction(async db => {
    const event = await eventRow(eventId, user, db, true, true);
    const [round] = await query('SELECT * FROM rounds WHERE event_id=$1 AND id=$2 FOR UPDATE', [event.id, parse(uuid, roundId)], db);
    if (!round) throw new HttpError(404, 'Rodada não encontrada.');
    await assertUnusedDraft(event, db);
    if (round.published) throw new HttpError(409, 'Resultados publicados são imutáveis.');
    await query('DELETE FROM rounds WHERE event_id=$1 AND id=$2', [event.id, round.id], db);
    await audit(db, user.id, 'ROUND_DELETED', round.id, { eventId: event.id });
    return { removed: true };
  });
}

export async function deleteDraftEvent(eventId: string, user: User) {
  return transaction(async db => {
    const event = await eventRow(eventId, user, db, true, true);
    await query('SELECT id FROM rounds WHERE event_id=$1 ORDER BY id FOR UPDATE', [event.id], db);
    await assertUnusedDraft(event, db);
    // Existing cascading FKs remove only the already-verified unused rounds.
    await query('DELETE FROM events WHERE id=$1', [event.id], db);
    await audit(db, user.id, 'EVENT_DELETED', event.id);
    return { removed: true };
  });
}

/** Called by handleApi after session resolution and the global write limit. */
export async function handleEventLifecycle(request: Request, user: User | null): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const round = path.match(/^\/api\/admin\/events\/([^/]+)\/rounds\/([^/]+)$/);
  const event = path.match(/^\/api\/admin\/events\/([^/]+)$/);
  if (!(round && ['PATCH', 'DELETE'].includes(request.method)) && !(event && request.method === 'DELETE')) return null;
  requireOrigin(request);
  const actor = authenticated(user);
  parse(uuid, (round || event)![1]);
  if (round) parse(uuid, round[2]);
  if (round && request.method === 'PATCH') return Response.json({ data: await updateRound(round[1], round[2], actor, await body(request)) }, { headers: { 'Cache-Control': 'no-store' } });
  if (round && request.method === 'DELETE') return Response.json({ data: await deleteRound(round[1], round[2], actor) }, { headers: { 'Cache-Control': 'no-store' } });
  if (event && request.method === 'DELETE') return Response.json({ data: await deleteDraftEvent(event[1], actor) }, { headers: { 'Cache-Control': 'no-store' } });
  return null;
}
