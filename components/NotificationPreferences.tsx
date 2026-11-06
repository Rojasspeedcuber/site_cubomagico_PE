"use client";
import { useEffect, useState, type FormEvent } from 'react';
import { api, useApi } from './api';
import { Notice } from './ui';

type Preferences = { enabled: boolean; mailEnabled: boolean; verified: boolean };

// Mount only for a signed-in account (key by user id if sessions can switch).
export function NotificationPreferences() {
  const preferences = useApi<Preferences>('/notifications/preferences');
  const [enabled, setEnabled] = useState(false);
  const [saved, setSaved] = useState<Preferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (preferences.data) { setEnabled(preferences.data.enabled); setSaved(preferences.data); }
  }, [preferences.data]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !saved) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<Preferences>('/notifications/preferences', 'PATCH', { enabled });
      setSaved(result); setEnabled(result.enabled);
      setMessage(result.enabled ? 'Preferências salvas. Os avisos dependem do envio configurado e do e-mail confirmado.' : 'Preferências salvas. Os avisos por e-mail foram desativados.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar as preferências.');
    } finally { setBusy(false); }
  }

  return <section className="panel" aria-label="Notificações por e-mail">
    <h2>Notificações por e-mail</h2>
    <p>Receba avisos sobre solicitações de vídeo e revisão dos seus envios. Os e-mails não incluem vídeos, tempos ou observações da revisão.</p>
    {preferences.loading && <p role="status">Carregando preferências…</p>}
    {preferences.error && <Notice kind="error">{preferences.error} <button type="button" className="text-button" disabled={busy} onClick={preferences.reload}>Tentar novamente</button></Notice>}
    {error && <Notice kind="error">{error}</Notice>}
    {message && <Notice kind="success">{message}</Notice>}
    {saved && <>
      {!saved.mailEnabled && <Notice>Envio de e-mail não configurado. Você pode salvar sua escolha, mas a fila não entregará avisos até o serviço ser configurado.</Notice>}
      {!saved.verified && <Notice>Confirme seu e-mail na seção Segurança da conta. Os avisos só são enviados para endereços confirmados.</Notice>}
      <form onSubmit={save}>
        <label className="checkbox-row"><input type="checkbox" checked={enabled} disabled={busy || preferences.loading} onChange={event => setEnabled(event.target.checked)} />Receber avisos de solicitações de vídeo e revisão por e-mail</label>
        <p className="caption">A escolha é opcional e começa desativada. Ao desativar, os avisos ainda na fila são cancelados; mensagens já enviadas não podem ser recolhidas.</p>
        <button className="button primary" disabled={busy || preferences.loading}>{busy ? 'Salvando…' : 'Salvar preferências'}</button>
        <button type="button" className="button secondary" disabled={busy || preferences.loading} onClick={preferences.reload}>Atualizar status</button>
      </form>
    </>}
  </section>;
}

export default NotificationPreferences;
