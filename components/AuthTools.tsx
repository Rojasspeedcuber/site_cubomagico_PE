"use client";
import { useEffect, useState, type FormEvent } from 'react';
import { api, useApi } from './api';
import { Notice } from './ui';

export type AccountLink = { action: 'reset-password' | 'verify-email'; token: string };
export function readAccountLink(hash: string): AccountLink | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const action = params.get('action');
  const token = params.get('token');
  if ((action !== 'reset-password' && action !== 'verify-email') || !token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return { action, token };
}

type Capabilities = { mailEnabled: boolean; emailVerificationRequired: boolean };
type EmailStatus = { email: string; verified: boolean; verifiedAt: string | null };

export function AuthTools({ signedIn, onSessionChange }: { signedIn: boolean; onSessionChange?: () => void }) {
  const capabilities = useApi<Capabilities>('/auth/capabilities');
  const emailStatus = useApi<EmailStatus>(signedIn ? '/auth/email-status' : null);
  const [link, setLink] = useState<AccountLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    function readLink() {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      if (!fragment.has('action') && !fragment.has('token')) return;
      const value = readAccountLink(window.location.hash);
      // Keep the secret only in component memory, never in history or query parameters.
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      setLink(value);
      setError(value ? '' : 'Link inválido. Solicite um novo link abaixo.');
      setMessage('');
    }
    readLink();
    window.addEventListener('hashchange', readLink);
    return () => window.removeEventListener('hashchange', readLink);
  }, []);

  async function send(path: string, payload: unknown, after?: () => void) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<{ message: string }>(`/auth/${path}`, 'POST', payload);
      setMessage(result.message);
      after?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir a solicitação.');
    } finally { setBusy(false); }
  }

  function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get('password') !== data.get('confirmation')) {
      setMessage(''); setError('As senhas não coincidem.'); return;
    }
    if (link) void send('reset-password', { token: link.token, password: data.get('password') }, () => {
      setLink(null); onSessionChange?.();
    });
  }

  const enabled = capabilities.data?.mailEnabled === true;
  return <section className="panel" aria-label="Segurança da conta">
    <h2>Segurança da conta</h2>
    {error && <Notice kind="error">{error}</Notice>}
    {message && <Notice kind="success">{message}</Notice>}
    {link?.action === 'reset-password' && <form onSubmit={resetPassword}>
      <h3>Redefinir senha</h3>
      <label className="field"><span>Nova senha</span><input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></label>
      <label className="field"><span>Repita a nova senha</span><input name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></label>
      <p className="caption">Use pelo menos 12 caracteres. Ao salvar, todas as sessões desta conta serão encerradas.</p>
      <button className="button primary" disabled={busy}>Salvar nova senha</button>
    </form>}
    {link?.action === 'verify-email' && <div>
      <h3>Confirmar e-mail</h3>
      <p>Confirme que você solicitou a verificação deste endereço.</p>
      <button type="button" className="button primary" disabled={busy} onClick={() => void send('verify-email', { token: link.token }, () => { setLink(null); emailStatus.reload(); })}>Confirmar meu e-mail</button>
    </div>}
    {capabilities.loading && <p role="status">Verificando disponibilidade do e-mail…</p>}
    {capabilities.error && <Notice kind="error">{capabilities.error} <button type="button" className="text-button" onClick={capabilities.reload}>Tentar novamente</button></Notice>}
    {capabilities.data && !enabled && <Notice>Envio de e-mail não configurado. A recuperação de senha e novos pedidos de confirmação estão indisponíveis. Contato: <a href="mailto:henriquer01@rojasdev.cloud">henriquer01@rojasdev.cloud</a>.</Notice>}
    {signedIn ? <div>
      <h3>Confirmação de e-mail</h3>
      {emailStatus.loading && <p role="status">Verificando seu e-mail…</p>}
      {emailStatus.error && <Notice kind="error">{emailStatus.error} <button type="button" className="text-button" onClick={emailStatus.reload}>Atualizar status</button></Notice>}
      {emailStatus.data && <>
        <p>{emailStatus.data.email} — {emailStatus.data.verified ? 'E-mail confirmado.' : 'Ainda não confirmado.'}</p>
        {!emailStatus.data.verified && <button type="button" className="button secondary" disabled={busy || !enabled} onClick={() => void send('request-verification', {})}>Enviar confirmação de e-mail</button>}
      </>}
      <p className="caption">A confirmação é opcional e não impede seu acesso ao site.</p>
    </div> : <details>
      <summary>Esqueci minha senha</summary>
      <form onSubmit={event => {
        event.preventDefault();
        void send('forgot-password', { email: new FormData(event.currentTarget).get('email') });
      }}>
        <label className="field"><span>E-mail da sua conta</span><input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <button className="button secondary" disabled={busy || !enabled}>Enviar link de recuperação</button>
        <p className="caption">Se o endereço estiver cadastrado, você receberá um link válido por 30 minutos.</p>
      </form>
    </details>}
  </section>;
}
