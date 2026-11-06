# Avisos transacionais por e-mail

## Contrato e privacidade

- Apenas `VIDEO_REQUEST` (solicitação de vídeo) e `SUBMISSION_REVIEW` (revisão de envio). Não há marketing, SMS, outros provedores ou cron criado por esta implementação.
- `users.notifications_enabled` começa em **false** inclusive nas contas existentes. A pessoa deve marcar a opção e salvar. A preferência pode ser salva sem Resend configurado ou sem e-mail confirmado, mas isso **não autoriza entrega** nessas condições.
- O envio exige simultaneamente opt-in atual, `email_verified_at` preenchido, configuração Resend e `APP_URL` válida. O endereço é consultado da conta no momento do envio; nunca recebido do navegador nem copiado para a fila.
- A outbox contém somente IDs, categoria e metadados operacionais. Não armazena corpo de mensagem, e-mail, URL de vídeo, tempos, observações ou resultado da revisão. O identificador de destino aceita somente UUID ou `UUID:inteiro_positivo` (até 20 dígitos no sufixo).
- As mensagens são genéricas. O único link leva a `/campeonatos/<eventId>` na origem configurada, sem token, parâmetros ou mídia. O participante precisa entrar na conta para consultar detalhes privados.
- Desativar cancela `PENDING`, `RETRY` e `SENDING` em uma transação com lock da conta. Reativar não ressuscita avisos cancelados. Uma entrega que já esteja em andamento pode terminar antes do opt-out adquirir o lock; depois que o opt-out termina não se inicia outra entrega para essa conta.
- A exclusão da conta apaga sua outbox por FK `ON DELETE CASCADE`. A exclusão de evento também apaga os avisos correspondentes. Os metadados terminais permanecem enquanto conta/evento existirem; não há expurgo automático adicional nesta versão.

## Integração pelo parent

A migração `db/007_notifications.sql` entra no runner existente, depois de `003_account_auth.sql` (que fornece `email_verified_at`). Sem alterar `User` público.

1. Importar `handleNotifications` de `lib/notifications.ts` em `lib/api.ts`, após os controles existentes de Origin/sessão/limite geral, e retornar a resposta quando não nula. O handler também protege o PATCH com Origin, sessão, validação estrita e limite por usuário de 30 alterações a cada 15 minutos (janela do limitador existente).
2. Montar `<NotificationPreferences key={user.id} />` na área autenticada da conta, próximo de `AuthTools`. O componente exporta tanto nomeado quanto default; não possui props. Usa GET/PATCH reais. Sem configuração, permite escolher, mas avisa que a fila não entrega. E-mail não confirmado recebe orientação para a seção Segurança da conta.
3. Dentro da transação de `events.review`, após atualização e audit, chamar:

   ```ts
   await enqueueNotification(db, row.user_id, 'SUBMISSION_REVIEW', `${row.id}:${row.revision}`, reference.event_id);
   ```

   Acrescentar `user_id` ao `RETURNING`/consulta interna, sem mudar a resposta pública se não necessário. Usar a revisão **retornada pela atualização**, não apenas o ID do envio, para permitir avisos de novas revisões e deduplicar o mesmo token.
4. Dentro da transação de `events.videoRequest`, após o upsert/audit, chamar:

   ```ts
   await enqueueNotification(db, userId, 'VIDEO_REQUEST', `${round.id}:${notificationRevision}`, event.id);
   ```

   A tabela atual usa `(round_id,user_id)` em vez de ID próprio. `notificationRevision` deve identificar aquela atualização: por exemplo, incluir no `RETURNING` do upsert `(extract(epoch FROM created_at)*1000000)::bigint::text AS notification_revision` e usar esse valor. Não usar texto da solicitação, links ou notas no token. Passar apenas `round.id` é permitido, mas significa **um único aviso por rodada/usuário/categoria**, inclusive em solicitações futuras; só usar isso se essa for a política desejada.

`enqueueNotification(db,userId,kind,targetId,eventId): Promise<void>` não abre/fecha transação nem chama o provedor. Faz `INSERT ... SELECT` condicionado a opt-in e `ON CONFLICT(user_id,kind,target_id) DO NOTHING`. A fila é revertida junto com a ação de negócio quando a transação chamadora falha. Não exige confirmação já no enfileiramento: a confirmação é obrigatória na entrega.

### Exportação de dados da conta

Parent deve acrescentar `notifications_enabled` ao SELECT explícito de perfil em `lib/privacy.ts` e uma coleção `notifications` com:

```sql
SELECT id,kind,target_id,event_id,status,attempts,next_attempt_at,last_error,
       created_at,updated_at,sent_at
FROM notification_outbox WHERE user_id=$1 ORDER BY created_at,id;
```

Não é necessário código extra de exclusão: a FK da migração resolve a cascata. `last_error` só admite `MAIL_DELIVERY_FAILED`, nunca retorno bruto do provedor. Não editar a rotina de exclusão para preservar a fila depois de excluir a conta.

## API

- `GET /api/notifications/preferences`: autenticado, `{data:{enabled:boolean,mailEnabled:boolean,verified:boolean}}`, `Cache-Control: no-store`.
- `PATCH /api/notifications/preferences`: autenticado e Origin igual à aplicação; corpo **exatamente** `{enabled:boolean}`. Retorna o mesmo envelope com a preferência persistida. Não aceita ID/e-mail de outro usuário ou coerção de strings/números. Os `HttpError` seguem o envelope `{error:string}` do roteador existente.
- Caminhos/métodos não pertencentes ao handler retornam `null`.

## Configuração e execução manual

Sem novas dependências. O adaptador existente `lib/mail.ts` usa a API real Resend, timeout de 10 segundos e valida recibo do provedor. Configurar fora do código:

- `DATABASE_URL`: banco migrado.
- `RESEND_API_KEY` e `MAIL_FROM`: chave e remetente aceito pelo Resend/domínio verificado. Nunca imprimir os valores nem colocá-los em argumentos CLI.
- `APP_URL`: origem HTTPS do site, sem credenciais, caminho, query ou fragmento. HTTP é aceito somente em localhost/loopback para desenvolvimento. Não há fallback localhost para enviar notificações.

A CLI carrega os arquivos locais pelo carregador de ambiente já existente, somente quando executada diretamente. Importá-la em testes não lê `.env` nem inicia trabalho.

```sh
node --import tsx scripts/notifications.ts --dry-run
node --import tsx scripts/notifications.ts --dry-run --limit=5
node --import tsx scripts/notifications.ts --send --limit=20
```

Um dos modos é **obrigatório**. Sem modo, flags desconhecidas, dois modos ou lote inválido: erro antes de carregar configuração/acessar banco. Lote padrão 20, máximo 100. `--dry-run` não chama rede, não altera fila/preferências/tentativas e funciona sem configuração Resend/APP_URL; obtém somente lock operacional e consulta IDs/flags de elegibilidade. O relatório traz contagens agregadas sem destinatários, URLs ou conteúdo. Em dry-run, `cancelled` e `deferred` são projeções, não alterações executadas.

`--send` recusa ausência de Resend/APP_URL antes de consultar a fila. `SENT` significa que o adaptador recebeu aceitação do provedor; não prova chegada à caixa de entrada. Falhas do provedor são registradas como `RETRY` ou `FAILED`, nunca sucesso fictício. A CLI retorna código diferente de zero para erro, lock ocupado, retries ou falhas no lote; estes últimos ainda produzem relatório agregado.

## Concorrência, tentativas e recuperação

- `pg_try_advisory_lock(1865264834)` em **uma conexão dedicada** evita duas execuções simultâneas, inclusive dry-run concorrente. Lock de sessão liberado no finally; conexão é descartada se não for possível liberá-lo. Não executar via transaction-pooling/PgBouncer sem afinidade de sessão; usar conexão PostgreSQL direta ou session-pooling para esta CLI.
- Cada registro tem claim `SENDING` + incremento de `attempts` **confirmado antes da chamada de rede**, e uma segunda transação de entrega. Esta reconsulta conta/e-mail/opt-in/confirmação e trava conta antes da outbox, mantendo os locks durante o envio. Opt-out e exclusão usam a mesma ordem.
- Somente `PENDING`/`RETRY` vencidos, com menos de três tentativas, são candidatos. E-mail não confirmado fica pendente e é adiado por uma hora sem consumir tentativa de entrega; outra reconsulta após claim pode devolver a tentativa reservada se a confirmação tiver sido retirada. Contas desativadas são canceladas.
- Falha de entrega: espera fixa de 15 minutos e no máximo **três** tentativas; a terceira falha termina em `FAILED`. Não há repetição em loop no mesmo lote nem reativação automática de terminais.
- Queda após claim ou falha de banco ao registrar o resultado deixa `SENDING` em quarentena. O runner **não** reenvia automaticamente esses registros, porque o provedor pode já ter aceitado a mensagem. O operador deve investigar recibos no Resend por meio seguro e optar por cancelar ou liberar pontualmente para nova tentativa (se ainda abaixo do teto), consciente do risco de duplicata. Nunca resetar todos os `SENDING` indiscriminadamente. Pode-se inspecionar metadados sem endereços:

  ```sql
  SELECT id,status,attempts,updated_at,last_error
  FROM notification_outbox WHERE status IN ('SENDING','FAILED') ORDER BY updated_at;
  ```

Não existe garantia exactly-once entre PostgreSQL e uma API externa. O adaptador atual não possui chave de idempotência do provedor; timeout/falha de transporte pode resultar em repetição numa tentativa posterior. A chave única da fila deduplica eventos de negócio, não entrega ambígua no provedor. Não alegar entrega garantida.

## Verificação

```sh
# Só este arquivo; não lê .env, não chama Resend e pula o caso PostgreSQL.
env -u DATABASE_URL node --import tsx --test tests/backend.notifications.test.ts
node node_modules/typescript/bin/tsc --noEmit
# Parent, sozinho, depois de integrar os hooks/handler/componente:
npm run test:integration
```

TDD registrado em ciclos RED/GREEN para preferências, outbox, CLI/dry-run, entrega/falhas e componente. Os testes unitários usam adaptadores locais explícitos para banco/provedor; o teste do componente executa React real em Chromium com respostas de API controladas. O caso PostgreSQL exige schema `cubo_test_*`, verifica default opt-out, deduplicação/rollback, confirmação obrigatória, lock concorrente, opt-out, três tentativas e cascatas. Sem `DATABASE_URL` fica SKIP, não simula integração. Não executar esse caso contra schema de aplicação. Envio real e entrega no Resend dependem das credenciais/domínio e não são exercitados pela suíte.
