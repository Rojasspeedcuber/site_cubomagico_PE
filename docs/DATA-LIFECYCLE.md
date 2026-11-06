# Ciclo de vida de dados, uploads e privacidade

## Integração

- Aplicar `db/005_media_privacy.sql` pelo migrador existente. Ela cria `media`, vincula `submissions.video_media_id` e impõe no PostgreSQL que vídeos locais pertençam ao autor do envio. Não é necessário editar o handler existente de envios para ativar essa garantia.
- `handleMediaPrivacy`, de `lib/privacy.ts`, está integrado em `handleApi` depois de Origin, sessão e rate limit geral. Erros `HttpError` seguem para o tratamento existente. O handler também verifica Origin nas próprias escritas.
- `MediaUpload` está nos formulários de perfil, conteúdo institucional e envio de tentativas. Props: `{kind:'photo'|'video', onUploaded:(url:string)=>void}`. A callback preenche a URL; o usuário ainda deve salvar o formulário. A URL retornada é absoluta, na origem de `APP_URL`, compatível com `safeUrl`.
- `PrivacyTools` está na área autenticada da conta. Prop opcional `onDeleted` atualiza a sessão; sem callback, o componente volta à página inicial após exclusão confirmada.

## Armazenamento e limites

`MEDIA_STORAGE_DIR` é o diretório persistente de arquivos, padrão `.data/media`, **fora de `public`**. A validação considera também aliases/symlinks do diretório para impedir que a área pública sirva vídeos diretamente. O processo deve ser o único usuário com acesso de escrita nessa pasta; novos diretórios são criados com modo `0700` e arquivos `0600`. Nomes são UUIDs aleatórios, sem nome ou extensão original; criação exclusiva e `O_NOFOLLOW` impedem sobrescrita e leitura de symlinks de arquivos. A pasta deve ter volume persistente em produção e não deve entrar no Git, CDN ou alias estático do proxy.

- Fotos: JPEG, PNG, WebP; até **5 MiB**.
- Vídeos: MP4 e WebM; até **100 MiB**.
- A assinatura/conteiner é inspecionada a partir dos bytes e deve corresponder ao MIME declarado e ao tipo solicitado. SVG, HTML, formatos não autorizados, arquivos vazios, cabeçalhos truncados e MIME divergente são rejeitados. Não se trata de antivírus ou transcodificação: a inspeção não promete validar a decodificação de todos os quadros nem remover metadados EXIF.
- Cada conta: **1 GiB / 200 arquivos**, incluindo uploads ainda não vinculados. A linha de usuário é bloqueada durante o cálculo/inserção para serializar a quota entre processos.
- O multipart é lido com teto real de `100 MiB + 64 KiB`, mesmo sem `Content-Length`; campos aceitos: apenas `kind` e `file`. O parser impõe prazo total de leitura de 120 segundos. Há no máximo dois uploads simultâneos por processo; os excedentes recebem 429. O rate limit geral do servidor continua necessário.
- O parser mantém um buffer limitado em memória. Dimensionar RAM e número de processos; não usar centenas de workers para aceitar uploads simultaneamente.
- Configurar o proxy para aceitar, por exemplo, `client_max_body_size 101m` e timeout compatível. O proxy não pode disponibilizar `MEDIA_STORAGE_DIR` como conteúdo estático.

## Endpoints

Todos os JSONs usam `{data: ...}`; erros são tratados pela API global como `{error: string}`.

| Rota | Acesso / resultado |
| --- | --- |
| `POST /api/media` | Autenticado + Origin. Multipart `kind=photo|video`, `file`. Retorna 201 `{data:{id,url}}`. |
| `GET /api/media/:id` | Foto pública. Vídeo: dono, administrador ou organizador proprietário de evento com um **envio realmente vinculado** ao vídeo; outro organizador ou participante não recebe acesso. |
| `DELETE /api/media/:id` | Dono ou administrador + Origin. Apaga arquivo e metadados; limpa referências em envios, perfis e conteúdo. |
| `GET /api/privacy/export` | Somente a própria conta autenticada; JSON para download. |
| `DELETE /api/privacy/account` | Autenticado + Origin, JSON `{password,confirmation:'EXCLUIR'}`; revalida senha atual, limita tentativas e executa exclusão real. |

Downloads suportam um intervalo `Range: bytes=...` para reprodução de vídeo, incluindo resposta 206/416. Todas as mídias são servidas com `Cache-Control: private, no-store`, `Vary: Cookie`, `nosniff` e CSP restritiva. Nomes de download contêm somente UUID e formato. Não há URLs assinadas públicas para vídeos, cópia em `public` ou confiança no URL fornecido pelo cliente como autorização.

A trigger de envios bloqueia referência a foto, arquivo alheio, URL local inconsistente/inexistente e associação nova após a janela de retenção. A autorização do organizador usa o vínculo real `video_media_id`/envio/rodada/evento; possuir uma URL ou criar um evento não basta. Links externos preexistentes continuam permitidos pelo sistema, mas a privacidade desses provedores não pode ser imposta pelo servidor local.

## Exportação e exclusão

A exportação lê um snapshot consistente do PostgreSQL e inclui perfil, e-mail, sessões sem credenciais, participações, inscrições, tentativas/envios, solicitações de vídeo, eventos/rodadas organizados, metadados/URLs das mídias e registros de auditoria da conta. Nunca retorna hashes de senha ou tokens de sessão. O JSON **não embute os bytes** dos arquivos: baixe as URLs enquanto a conta existe; vídeos continuam exigindo sua sessão.

A exclusão remove o registro de usuário e, por FK, sessões, tokens de autenticação ligados à conta, participações, inscrições, envios e metadados de mídia. Os arquivos são realmente removidos antes de confirmar sucesso. Fotos compartilhadas por URL em outros perfis/conteúdo e referências aos vídeos são limpas; solicitações e auditoria diretamente atribuídas ao usuário também são removidas. Os resultados desse participante deixam de existir, inclusive os publicados; não é uma simples desativação visual.

- Último administrador: **409**, coordenado pelo mesmo advisory lock usado por alterações de papel.
- Conta proprietária de qualquer evento: **409**, independentemente do papel atual ou estado do evento. A responsabilidade deve ser resolvida por outro administrador antes da exclusão; este módulo não inventa um fluxo de transferência inexistente.
- Senha incorreta: **401**; confirmação diferente de `EXCLUIR`: **400**; erro no disco: sem resposta de sucesso. As sessões são revogadas por cascata e o cookie atual é limpo.
- Disco e PostgreSQL não oferecem uma transação distribuída. Se o sistema cair depois de apagar um arquivo e antes do commit, pode restar metadado de arquivo ausente; nova execução tolera `ENOENT` e conclui. Nunca se deve anunciar sucesso quando `unlink` falhar. Backups e cópias externas precisam de política operacional própria; não são apagados automaticamente por esta API.

## Retenção

O script `scripts/retention.ts` é real, idempotente e não cria cron externo. **É necessário executá-lo operacionalmente** para efetivar os prazos; sem um agendamento configurado os dados não expiram sozinhos no disco.

```sh
# Ambiente de aplicação configurado pelo processo, ou .env.local/.env carregados pelo CLI.
npx tsx scripts/retention.ts --dry-run
npx tsx scripts/retention.ts --apply
```

Sem um dos argumentos explícitos o CLI recusa execução. `--dry-run` conta os candidatos sem mutação; `--apply` remove. A saída contém somente contagens e data de referência, sem URLs, PII ou credenciais. Um advisory lock serializa execuções concorrentes.

1. Links de vídeo em envios são limpos ao atingir **90 dias após `rounds.closes_at`**, sem depender da data de upload, publicação ou estado do evento. Isso também remove links externos da base local, mas não apaga arquivos do provedor externo.
2. O arquivo local de vídeo é removido depois que **todos** os envios que o referenciam saíram da janela de retenção. Um mesmo vídeo ainda associado a rodada recente permanece.
3. Uploads órfãos são removidos após **7 dias da criação**, inclusive fotos não utilizadas. Fotos em uso em perfil/conteúdo permanecem.
4. Arquivos UUID sem registro no banco são removidos após **7 dias de mtime**; nomes não reconhecidos, diretórios e symlinks são ignorados. Isso cobre uma interrupção entre gravação física e inserção no banco.
5. A remoção altera somente os links de evidência e arquivos, preservando tentativas/tempos/status e incrementando a revisão do envio. Um arquivo já ausente não causa falha de idempotência.

Recomendação operacional: execução diária pelo mecanismo que o responsável escolher, com alerta para saída diferente de zero, mais backup/retenção do volume e banco. Nenhum agendamento foi criado nesta entrega.

## Verificação e pendências de integração

Testes deste worker: `tests/backend.media-privacy.test.ts`. Execução local sem banco:

```sh
node --import tsx --test tests/backend.media-privacy.test.ts
npx tsc --noEmit --incremental false
```

Há testes RED→GREEN reais para assinaturas (incluindo MP4/WebM gerados com ffmpeg), MIME/tamanho, multipart sem confiança no Content-Length, timeout, arquivos reais no disco, criação exclusiva, traversal/symlinks, pasta pública por alias, autorização pura, rotas anônimas, confirmação/guardas de exclusão, limite temporal, limpeza física idempotente/dry-run e renderização real dos componentes. `ffmpeg` é somente gerador de fixtures de teste, não uma dependência do runtime da aplicação.

O cenário PostgreSQL está escrito no mesmo arquivo, mas fica **skip** sem `DATABASE_URL`. Ele deve ser executado **pelo parent, sequencialmente**, via `npm run test:integration`, que cria schema isolado, migra e remove esse schema. O worker não iniciou suíte global concorrente nem acessou dados da aplicação. Esse cenário verifica upload persistido de foto/vídeo, foto pública, vínculo de envio com dono, bloqueio de referência alheia/foto, vídeo privado com Range, organizador não relacionado, exportação sem hashes, retenção de vídeo compartilhado entre rodadas, exclusão física e cascatas/sessões/guardas de conta.

`tests/e2e/workflows.spec.ts` exercita upload de foto e salvamento do perfil; upload MP4, envio das tentativas e reprodução autorizada; download da exportação; exclusão com confirmação, senha incorreta e conta descartável. `npm run build && npm run test:e2e:isolated` executa a aplicação de produção em Chromium, com schema e armazenamento descartáveis.
