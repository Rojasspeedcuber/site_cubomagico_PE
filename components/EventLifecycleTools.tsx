"use client";
import { useState, type FormEvent } from 'react';
import { api } from './api';
import { isoDate, localDate } from './frontend-utils';
import { Modal, Notice } from './ui';
import type { CubeEvent, Round } from './types';

type Props = { event: CubeEvent; onChange: () => void; onEventDeleted?: () => void };

export default function EventLifecycleTools(props: Props) {
  return <LifecyclePanel key={props.event.id} {...props} />;
}

function LifecyclePanel({ event, onChange, onEventDeleted }: Props) {
  const [editing, setEditing] = useState<Round | null>(null);
  const [deleting, setDeleting] = useState<Round | 'event' | null>(null);
  const [removed, setRemoved] = useState(false);
  const editable = event.status === 'DRAFT' && !event.published && event.participantCount === 0 && !event.rounds.some(round => round.published);
  if (removed) return <Notice kind="success">Evento rascunho excluído.</Notice>;
  return <section className="panel" aria-label="Edição e exclusão do rascunho">
    <h3>Ajustes do rascunho</h3>
    <Notice>Somente rascunhos sem inscrições, envios ou resultados publicados podem ser alterados. Mudar a modalidade ou o formato gera novos embaralhamentos no servidor.</Notice>
    {event.rounds.map(round => <article className="admin-round" key={round.id}>
      <h4>{round.name}</h4>
      <div className="button-row">
        <button className="button secondary small" disabled={!editable} onClick={() => setEditing(round)}>Editar {round.name}</button>
        <button className="button danger-button small" disabled={!editable} onClick={() => setDeleting(round)}>Excluir {round.name}</button>
      </div>
    </article>)}
    <button className="button danger-button" disabled={!editable} onClick={() => setDeleting('event')}>Excluir evento rascunho</button>
    {!editable && <p className="caption">Edição e exclusão bloqueadas: o evento não é um rascunho vazio ou já possui resultados publicados.</p>}
    {editing && <Modal title="Editar rodada" onClose={() => setEditing(null)}>
      <RoundLifecycleForm eventId={event.id} round={editing} onSaved={() => { setEditing(null); onChange(); }} />
    </Modal>}
    {deleting && <DeleteLifecycleConfirmation
      name={deleting === 'event' ? event.name : deleting.name}
      isEvent={deleting === 'event'}
      allowed={editable}
      path={deleting === 'event' ? `/admin/events/${event.id}` : `/admin/events/${event.id}/rounds/${deleting.id}`}
      onCancel={() => setDeleting(null)}
      onDeleted={() => { const eventDeleted=deleting === 'event'; if (eventDeleted) setRemoved(true); setDeleting(null); if(eventDeleted && onEventDeleted) onEventDeleted(); else onChange(); }}
    />}
  </section>;
}

function DeleteLifecycleConfirmation({ name, isEvent, allowed, path, onCancel, onDeleted }: {
  name: string; isEvent: boolean; allowed: boolean; path: string; onCancel: () => void; onDeleted: () => void;
}) {
  const [confirmation, setConfirmation] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allowed || busy || confirmation !== 'EXCLUIR') return;
    setBusy(true); setError('');
    try { await api(path, 'DELETE'); onDeleted(); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <Modal title={isEvent ? 'Excluir evento rascunho?' : 'Excluir rodada?'} onClose={() => { if (!busy) onCancel(); }}>
    <p>Excluir “{name}”{isEvent ? ' e todas as suas rodadas' : ''}? Esta ação é permanente e não pode ser desfeita.</p>
    <p>O servidor verificará novamente se o rascunho permanece sem inscrições, envios ou resultados publicados.</p>
    <form onSubmit={remove}>
      <label className="field"><span>Digite EXCLUIR para confirmar</span><input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" disabled={busy} /></label>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="button-row">
        <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Cancelar</button>
        <button className="button danger-button" disabled={!allowed || busy || confirmation !== 'EXCLUIR'}>{busy ? 'Excluindo…' : 'Confirmar exclusão'}</button>
      </div>
    </form>
  </Modal>;
}

function RoundLifecycleForm({ eventId, round, onSaved }: { eventId: string; round: Round; onSaved: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      await api(`/admin/events/${eventId}/rounds/${round.id}`, 'PATCH', {
        name: form.get('name'), puzzle: form.get('puzzle'), format: form.get('format'),
        opensAt: isoDate(String(form.get('opensAt'))), closesAt: isoDate(String(form.get('closesAt'))),
        videoRequired: form.get('videoRequired') === 'on',
      });
      onSaved();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit}>
    <fieldset disabled={busy}>
      <label className="field"><span>Nome da rodada</span><input name="name" required minLength={2} maxLength={160} defaultValue={round.name} /></label>
      <div className="form-grid">
        <label className="field"><span>Modalidade</span><select name="puzzle" defaultValue={round.puzzle}>
          <option value="333">Cubo 3×3</option><option value="222">Cubo 2×2</option><option value="pyram">Pyraminx</option>
        </select></label>
        <label className="field"><span>Formato</span><select name="format" defaultValue={round.format}>
          <option value="AO5">Ao5 — média de 5</option><option value="MO3">Mo3 — média de 3</option>
        </select></label>
        <label className="field"><span>Abertura (Pernambuco)</span><input type="datetime-local" name="opensAt" required defaultValue={localDate(round.opensAt)} /></label>
        <label className="field"><span>Encerramento (Pernambuco)</span><input type="datetime-local" name="closesAt" required defaultValue={localDate(round.closesAt)} /></label>
      </div>
      <label className="checkbox-row"><input type="checkbox" name="videoRequired" defaultChecked={round.videoRequired} /><span>Exigir vídeo em todos os envios</span></label>
      <p className="caption">Horários de Pernambuco (UTC−3). Embaralhamentos de rodadas em uso não podem ser alterados.</p>
      {error && <Notice kind="error">{error}</Notice>}
      <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar rodada'}</button>
    </fieldset>
  </form>;
}
