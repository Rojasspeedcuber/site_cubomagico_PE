# Edição e exclusão de rascunhos

## Contrato de integração

`lib/event-lifecycle.ts` exporta:

- `handleEventLifecycle(request: Request, user: User | null): Promise<Response | null>`;
- `updateRound(eventId, roundId, user, payload)`;
- `deleteRound(eventId, roundId, user)`;
- `deleteDraftEvent(eventId, user)`.

O tipo `User` é o existente em `lib/policy.ts`. O dispatcher `lib/api.ts` chama o handler dentro do tratamento de erros existente, depois da resolução da sessão, validação de Origin e limite geral de escrita, antes do fallback 404:

```ts
const lifecycleResponse = await handleEventLifecycle(request, user);
if (lifecycleResponse) return lifecycleResponse;
```

O handler também exige Origin nas rotas reconhecidas. Não cria outra sessão nem remove o rate limit do dispatcher. Rotas não reconhecidas retornam `null`; erros conhecidos são `HttpError`, convertidos pelo dispatcher no envelope `{error: string}`. Respostas de sucesso usam `{data: ...}` e `Cache-Control: no-store`.

| Método | Rota | Corpo | Sucesso |
| --- | --- | --- | --- |
| PATCH | `/api/admin/events/:eventId/rounds/:roundId` | Campos parciais de `roundSchema` | Rodada sem scrambles, 200 |
| DELETE | `/api/admin/events/:eventId/rounds/:roundId` | Nenhum obrigatório | `{removed: true}`, 200 |
| DELETE | `/api/admin/events/:eventId` | Nenhum obrigatório | `{removed: true}`, 200 |

PATCH rejeita objeto vazio, campos desconhecidos e tentativas de escrever `scrambles` ou `published`. `parsePatch` mantém somente campos efetivamente enviados, inclusive preservando `videoRequired` quando omitido. Datas ISO com offset são validadas; o intervalo final, mesclado com os valores existentes, precisa ter abertura anterior ao encerramento.

## Restrições de segurança

- Somente administrador ou organizador dono pode alterar/excluir. Sessão ausente: 401; sem permissão: 403; UUID inválido: 400; evento/rodada ausente ou rodada de outro evento: 404.
- As três operações exigem evento `DRAFT`, sem publicação e **sem qualquer participante, inscrição ou envio em todo o evento**. Essa restrição é deliberadamente conservadora: uma rodada ainda vazia também fica bloqueada se outra rodada já tiver inscrições.
- Qualquer rodada publicada bloqueia as operações, mesmo que o marcador de publicação do evento esteja inconsistente. Restrições de estado/uso retornam 409; não removem inscrições ou resultados para contornar o bloqueio.
- Transação única com lock de evento primeiro (`FOR UPDATE OF e`), seguido da rodada; exclusão de evento bloqueia todas as suas rodadas por ordem de ID. A verificação de uso ocorre dentro da transação, depois dos locks, na mesma ordem das escritas existentes em `events.ts`.
- Alterar modalidade ou formato gera uma série nova com `generateScrambles` real, dentro dos locks. Ao5 tem cinco scrambles e Mo3 tem três. Alterações de nome, prazo ou requisito de vídeo preservam a série existente. Nenhuma resposta desta extensão divulga scrambles.
- Auditoria (`ROUND_UPDATED`, `ROUND_DELETED`, `EVENT_DELETED`) participa da mesma transação. A exclusão utiliza as FKs existentes e só ocorre após verificar que não há dados de participação a remover. Nenhuma migração adicional é necessária.

## Componente

`components/EventLifecycleTools.tsx` exporta o componente default:

```tsx
<EventLifecycleTools event={event} onChange={reloadEvents} onEventDeleted={backToList} />
```

`event` usa `CubeEvent`, de `components/types.ts`. O componente está integrado na área administrativa. `onChange` recarrega a rodada após uma escrita confirmada pela API; `onEventDeleted`, opcional, retorna à lista quando o evento inteiro é removido.

A interface inclui edição de todos os campos da rodada, conversão dos horários de Pernambuco/UTC−3 para ISO, bloqueio preventivo por status/publicação/participantes e exclusão com modal, nome do alvo, aviso de irreversibilidade, cancelamento e digitação exata de **EXCLUIR**. Os bloqueios da interface não substituem a autorização e as verificações do servidor. Conflitos mantêm o modal aberto e exibem o erro, sem notificar falso sucesso.

## Testes

Arquivo: `tests/backend.lifecycle.test.ts`.

Execução focada sem conexão ao banco:

```sh
env -u DATABASE_URL node --import tsx --test tests/backend.lifecycle.test.ts
```

Inclui testes unitários substituindo somente a conexão PostgreSQL e testes interativos de React em Chromium real com esbuild e Playwright já presentes no projeto. Os testes de UI interceptam respostas HTTP para verificar formulário, confirmação, cancelamento, bloqueios, callback e tratamento de erro; não constituem teste de persistência.

TDD executado em ciclos RED/GREEN: export/dispatch, PATCH com preservação, bloqueio de eventos em uso, validação/404, regeneração real de scrambles, DELETE de rodada, DELETE de evento e interação da UI. As falhas RED foram observadas antes das respectivas implementações.

O teste **`persistent lifecycle preserves private data, prevents in-use mutations and rechecks state after waiting for the event lock`** é retido para a suíte real: cria fixtures próprias, verifica leituras posteriores, auditoria, exclusões e espera por lock concorrente, depois limpa somente essas fixtures. Sem `DATABASE_URL`, fica explicitamente pulado.

Executar persistência somente com `npm run test:integration`; o runner cria schema isolado, migra e remove o schema ao finalizar. `tests/e2e/workflows.spec.ts` exercita a página administrativa completa com banco real, incluindo edição de nome, exclusão de rodada e exclusão de evento com retorno à lista.
