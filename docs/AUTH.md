# Confirmação de e-mail e recuperação de senha

## Integração do handler

`lib/account-auth.ts` exporta:

```ts
handleAccountAuth(request: Request, user: User | null): Promise<Response | null>
```

O handler está integrado em `lib/api.ts` depois da checagem de Origin, resolução da sessão e limite geral de escrita. Respostas diferentes de `null` são retornadas pelo dispatcher. Rotas não reconhecidas, login, cadastro, logout e métodos não implementados retornam `null`. O handler também verifica Origin nos próprios POSTs. Erros são `HttpError`, tratados pelo envelope `{error:string}` existente da API; as respostas bem-sucedidas usam `{data:...}` e `Cache-Control: no-store`.

Também há `createAccountAuthHandler(overrides)` para testes isolados: aceita substituições explícitas de `query`, `transaction`, `rateLimit`, `mailEnabled`, `sendMail` e `appUrl`. A função exportada para produção usa PostgreSQL e Resend reais, sem modo de sucesso simulado.

`AuthTools` recebe `{signedIn:boolean,onSessionChange?:()=>void}` e está integrado em `AccountView.tsx`, sem substituir os formulários de cadastro, login ou perfil. `WcaLogin` fica na área desconectada, fora do formulário de autenticação; seu backend está documentado em [WCA-AUTH.md](WCA-AUTH.md).

## Configuração externa

Configurar no ambiente do servidor, nunca em variáveis `NEXT_PUBLIC_*`:

- `RESEND_API_KEY`: chave Resend com permissão de envio.
- `MAIL_FROM`: remetente autorizado pelo Resend, como `Cubo Mágico PE <conta@seu-dominio.example>`; configurar/verificar o domínio e os registros DNS necessários no provedor.
- `APP_URL`: origem pública do site. Para o domínio informado: `https://cubomagicope.rojasdev.site`. Aceita somente HTTP(S), sem usuário/senha. O padrão local é `http://localhost:3000`; em produção use HTTPS e configure a origem correta.
- `DATABASE_URL`: configuração PostgreSQL já utilizada pela aplicação.

Aplicar `db/003_account_auth.sql` com o fluxo normal de migrações da aplicação antes de habilitar as rotas. Esta migração adiciona `users.email_verified_at` e a tabela `account_tokens`, sem alterar o tipo público `User`.

`lib/mail.ts` faz `POST https://api.resend.com/emails` via `fetch`, com `Authorization: Bearer ...`, remetente, destinatário, assunto e mensagem em texto. Há prazo de 10 segundos. Só aceita o resultado quando a resposta HTTP é bem-sucedida e contém um `id`. Chaves, respostas brutas do provedor e tokens não são registrados nem retornados pela API. Não há novas dependências.

Referência consultada: [Send Email — Resend](https://resend.com/docs/api-reference/emails/send-email).

`mailEnabled` indica apenas que chave e remetente estão preenchidos; **não verifica credenciais, DNS, cotas ou entregabilidade**. Sem essa configuração, pedidos de recuperação e de confirmação retornam 503 com uma mensagem clara, antes de consultar a conta ou gerar/gravar tokens. A interface desabilita esses pedidos e informa o contato `henriquer01@rojasdev.cloud`. Login e cadastro existentes continuam disponíveis.

## Rotas

Todos os caminhos abaixo têm o prefixo `/api/auth`.

| Método e rota | Entrada | Sessão | `data` em caso de sucesso |
| --- | --- | --- | --- |
| `GET /capabilities` | — | Não | `{mailEnabled:boolean,emailVerificationRequired:false}` |
| `POST /forgot-password` | `{email}` | Não | `{message:string}` neutra, inclusive para endereço inexistente |
| `POST /reset-password` | `{token,password}` | Não | `{message:string}`; encerra as sessões da conta e limpa o cookie da sessão atual |
| `POST /request-verification` | `{}` | Sim | `{message:string}`; usa exclusivamente o e-mail da conta autenticada |
| `POST /verify-email` | `{token}` | Não | `{message:string}`; não cria sessão e não troca senha |
| `GET /email-status` | — | Sim | `{email:string,verified:boolean,verifiedAt:string|null}`; timestamp ISO/UTC |

Os POSTs exigem o header `Origin` exato da aplicação, mesmo em chamadas fora do navegador. Os objetos JSON são estritos: campos extras são recusados. O endereço de recuperação é validado e convertido para minúsculas; a senha nova tem entre 12 e 256 caracteres. Tokens exigem exatamente 64 caracteres hexadecimais minúsculos, sem ajuste automático de espaços ou caixa.

Limites adicionais, compartilhados entre essas rotas de escrita: 1.000 tentativas globais e 40 por IP em 15 minutos; pedidos de envio têm limite de 5 por endereço/conta, e consumo tem limite de 10 por hash de token no mesmo período. O IP segue a convenção atual da aplicação: último item de `x-forwarded-for`, ou `local`; o proxy precisa controlar esse header. A função de limite existente persiste somente o hash das chaves.

## Fluxos e segurança

- Tokens usam `randomBytes(32)`. Apenas SHA-256 vai ao banco; o valor em texto puro só compõe a mensagem enviada ao destinatário.
- Recuperação expira em 30 minutos. Confirmação expira em 24 horas. Novo pedido substitui o token anterior da mesma conta e finalidade, sem afetar a outra finalidade.
- A emissão bloqueia a conta antes de substituir o token. O consumo segue a mesma ordem: conta, depois atualização condicional do token. `UPDATE ... consumed_at IS NULL AND expires_at>clock_timestamp() RETURNING ...` torna o uso único atômico.
- Alteração de senha, consumo do token e exclusão das sessões ocorrem na mesma transação. Confirmação de e-mail não revoga sessões nem bloqueia login. E-mails já confirmados não recebem novo link de confirmação.
- Entrega é solicitada depois do commit, sem manter locks do banco durante uma chamada de rede. Em erro/timeout de envio, somente o hash recém-emitido é removido e a operação retorna indisponibilidade; um token de solicitação posterior não é apagado. Se o Resend tiver aceitado a mensagem, mas a resposta se perder, o link recebido pode estar inválido: pedir outro link.
- O link usa `/conta#action=reset-password&token=...` ou `/conta#action=verify-email&token=...`. O fragmento não é enviado no GET inicial nem como Referer. A interface o lê e retira da URL com `history.replaceState`, mantendo o token só na memória do componente. Recarregar depois disso exige abrir o link original novamente.
- Abrir um link não consome o token: o visitante precisa salvar a senha ou clicar em “Confirmar meu e-mail”. Isso evita consumo automático por simples acesso ou pré-visualização de e-mail.
- A resposta de recuperação é igual para conta existente/inexistente quando o envio funciona. Não há uniformização do tempo de resposta; falhas do provedor para uma conta existente são reportadas como 503, nunca como entrega concluída. Esse limite de privacidade deve ser considerado antes de uma implantação de alto risco.
- O envio aceito pelo Resend não comprova entrega na caixa postal. Os links de conta são enviados diretamente, sem fila de reenvio ou webhooks de entrega. Notificações de campeonatos usam um fluxo separado.
- A tabela mantém no máximo um token por conta/finalidade; tokens vencidos ficam inutilizáveis e são substituídos no próximo pedido ou removidos com a conta. Não há cron de limpeza novo.

## Verificação local e limites desta entrega

Comando isolado, sem carregar `.env`, sem PostgreSQL e sem enviar e-mail externo:

```sh
node --import tsx --test tests/backend.account-auth.test.ts tests/frontend.test.ts tests/backend.policy.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Os ciclos TDD registraram RED antes da implementação de configuração/envio Resend, capabilities, indisponibilidade, emissão de recuperação, migração, emissão de confirmação, consumo/reset/revogação, confirmação/status, limpeza em falha, origem segura e interface. As mudanças no `AccountView` também tiveram RED/GREEN de ligação dos componentes.

Os testes unitários usam dependências explícitas para banco/provedor: verificam os valores enviados, hashing real, parâmetros e predicados SQL, a mesma transação para consumo/mudança/revogação, expiração, uso repetido e duas chamadas concorrentes ao handler. O teste da interface monta o componente real em Chromium, com API interceptada **apenas como fixture de teste**, verificando formulários, confirmação explícita, URL sem token, payloads e configuração desabilitada. Isso não constitui envio externo nem teste de concorrência no PostgreSQL real.

`tests/backend.account-auth.persistence.test.ts` também exercita o PostgreSQL real em schema isolado: migração, emissão, expiração, consumo concorrente único, finalidades distintas, alteração do hash e revogação das sessões. Execute com `npm run test:integration`, nunca diretamente com um banco da aplicação. A configuração efetiva das credenciais e a entregabilidade permanecem não verificadas; não houve envio Resend real.
