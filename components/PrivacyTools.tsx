"use client";
import { useId, useState, type FormEvent } from 'react';
import { api } from './api';

export default function PrivacyTools({onDeleted}:{onDeleted?:()=>void}={}) {
 const id=useId();
 const [password,setPassword]=useState(''), [confirmation,setConfirmation]=useState('');
 const [busy,setBusy]=useState(''), [error,setError]=useState(''), [message,setMessage]=useState('');
 async function exportData() {
  setBusy('export'); setError(''); setMessage('');
  try {
   const data=await api<unknown>('/privacy/export');
   const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
   const anchor=document.createElement('a'); anchor.href=url; anchor.download='meus-dados-cubo-pe.json';
   document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
   setMessage('Exportação baixada. Os arquivos de mídia estão listados por URL; baixe-os antes de excluir sua conta.');
  } catch(error) {setError(error instanceof Error?error.message:'Não foi possível exportar seus dados.');}
  finally {setBusy('');}
 }
 async function deleteData(event:FormEvent) {
  event.preventDefault();
  if(!password || confirmation!=='EXCLUIR' || busy) return;
  if(!window.confirm('Excluir sua conta, arquivos e resultados definitivamente? Esta ação não pode ser desfeita.')) return;
  setBusy('delete'); setError(''); setMessage('');
  try {
   await api('/privacy/account','DELETE',{password,confirmation});
   setPassword(''); setConfirmation('');
   if(onDeleted) onDeleted(); else window.location.assign('/');
  } catch(error) {setPassword(''); setError(error instanceof Error?error.message:'Não foi possível excluir sua conta.');}
  finally {setBusy('');}
 }
 return <section className="panel privacy-tools" aria-labelledby={`${id}-title`}>
  <h3 id={`${id}-title`}>Seus dados e privacidade</h3>
  <p>Exporte seu perfil, inscrições, envios, registros e referências dos arquivos. Senhas e tokens não entram na exportação.</p>
  <button type="button" className="button secondary" disabled={!!busy} onClick={()=>void exportData()}>{busy==='export'?'Exportando…':'Exportar meus dados'}</button>
  <form onSubmit={deleteData}>
   <h4>Excluir conta definitivamente</h4>
   <p>Seu perfil, sessões, inscrições, resultados e arquivos serão removidos. Exporte seus dados primeiro. O último administrador e responsáveis por eventos devem resolver essas responsabilidades antes da exclusão.</p>
   <label className="field" htmlFor={`${id}-password`}><span>Senha atual</span>
   <input id={`${id}-password`} type="password" autoComplete="current-password" value={password} maxLength={256} required disabled={!!busy} onChange={event=>setPassword(event.target.value)} /></label>
   <label className="field" htmlFor={`${id}-confirmation`}><span>Digite EXCLUIR para confirmar</span>
   <input id={`${id}-confirmation`} value={confirmation} autoComplete="off" required disabled={!!busy} onChange={event=>setConfirmation(event.target.value)} /></label>
   <button className="button danger-button" type="submit" disabled={!!busy || !password || confirmation!=='EXCLUIR'}>{busy==='delete'?'Excluindo…':'Excluir minha conta'}</button>
  </form>
  {error && <p className="notice error" role="alert">{error}</p>}
  {message && <p role="status">{message}</p>}
 </section>;
}
export { PrivacyTools };
