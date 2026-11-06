"use client";
import React, { useEffect, useState } from 'react';

/** Standalone sign-in only; never claims that an existing local account will be linked. */
export function WcaLogin() {
 const [availability,setAvailability] = useState<'loading'|'enabled'|'disabled'>('loading');
 useEffect(() => {
  const controller = new AbortController();
  fetch('/api/wca/capabilities',{cache:'no-store',credentials:'same-origin',signal:controller.signal})
   .then(async response => {
    if (!response.ok) throw new Error('Indisponível');
    const body = await response.json();
    if (!controller.signal.aborted) setAvailability(body?.data?.enabled === true ? 'enabled' : 'disabled');
   })
   .catch(() => {if (!controller.signal.aborted) setAvailability('disabled');});
  return () => controller.abort();
 },[]);
 return <div className="wca-login">
  <button type="button" className="button secondary" disabled={availability !== 'enabled'} onClick={() => window.location.assign('/api/wca/start')}>
   Entrar com a conta WCA
  </button>
  <p className="muted" role="status">{availability === 'loading'
   ? 'Verificando disponibilidade do login WCA…'
   : availability === 'disabled'
    ? 'Login WCA indisponível: a integração ainda não está configurada ou está temporariamente fora do ar. Use o acesso por e-mail.'
    : 'Você será direcionado ao site da WCA para autorizar nome e e-mail. Contas locais existentes não são vinculadas automaticamente.'}</p>
  <p className="muted">Este é um site independente da comunidade, não uma plataforma oficial da WCA.</p>
 </div>;
}
export default WcaLogin;
