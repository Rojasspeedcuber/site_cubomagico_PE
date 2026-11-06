import { HttpError } from './policy.ts';

export type MailEnvironment = { [key: string]: string | undefined; RESEND_API_KEY?: string; MAIL_FROM?: string };
export function mailEnabled(env: MailEnvironment = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && env.MAIL_FROM?.trim());
}

export type MailMessage = { to: string; subject: string; text: string };
export async function sendMail(message: MailMessage, options: { env?: MailEnvironment; fetch?: typeof fetch } = {}): Promise<void> {
  const env = options.env ?? process.env;
  if (!mailEnabled(env)) throw new HttpError(503, 'Envio de e-mail não configurado. Contate o suporte.');
  try {
    const response = await (options.fetch ?? fetch)('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM!.trim(), to: [message.to], subject: message.subject, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Mail rejected');
    const result = await response.json();
    if (typeof result?.id !== 'string' || !result.id) throw new Error('Mail receipt missing');
  } catch {
    // Provider responses may contain addresses or credentials. Never forward or log them.
    throw new HttpError(503, 'Não foi possível enviar o e-mail. Tente novamente mais tarde.');
  }
}
