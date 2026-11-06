"use client";
import { useId, useRef, useState } from 'react';

export type MediaUploadProps = {kind:'photo'|'video';onUploaded:(url:string)=>void};
export default function MediaUpload({kind,onUploaded}:MediaUploadProps) {
 const id=useId(), fileInput=useRef<HTMLInputElement>(null);
 const [busy,setBusy]=useState(false), [message,setMessage]=useState(''), [error,setError]=useState('');
 const photo=kind==='photo', limit=(photo?5:100)*1024*1024;
 async function upload(file:File) {
  setError(''); setMessage('');
  if(!file.size || file.size>limit) {setError(`Escolha um arquivo de até ${photo?'5':'100'} MiB.`); return;}
  setBusy(true);
  try {
   const form=new FormData(); form.set('kind',kind); form.set('file',file);
   const response=await fetch('/api/media',{method:'POST',credentials:'same-origin',body:form,cache:'no-store'});
   const payload=await response.json();
   if(!response.ok || payload.error || typeof payload.data?.url!=='string') throw new Error(payload.error || 'Não foi possível enviar o arquivo.');
   onUploaded(payload.data.url);
   setMessage('Arquivo enviado. Salve o formulário para vincular este arquivo.');
   if(fileInput.current) fileInput.current.value='';
  } catch(error) {setError(error instanceof Error?error.message:'Não foi possível enviar o arquivo.');}
  finally {setBusy(false);}
 }
 return <div className="media-upload" aria-busy={busy}>
  <label htmlFor={id}>{photo?'Enviar foto':'Enviar vídeo'}</label>
  <p id={`${id}-help`} className="muted">{photo?'PNG, JPEG ou WebP, até 5 MiB. A foto será pública.':'MP4 ou WebM, até 100 MiB. Vídeo privado: acesso do dono, administradores e organizador do evento após o envio dos resultados.'} Arquivos não vinculados são removidos após 7 dias.</p>
  <input ref={fileInput} id={id} type="file" accept={photo?'image/png,image/jpeg,image/webp':'video/mp4,video/webm'} disabled={busy} aria-describedby={`${id}-help`} onChange={event=>{const file=event.currentTarget.files?.[0]; if(file) void upload(file);}} />
  {busy && <p role="status">Enviando arquivo…</p>}
  {message && <p role="status">{message}</p>}
  {error && <p role="alert" className="notice error">{error}</p>}
 </div>;
}
export { MediaUpload };
