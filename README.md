# Comunidade Pernambucana de Cubo Mágico

Aplicação em português brasileiro para estudar algoritmos e realizar campeonatos online independentes da comunidade. Inclui três áreas públicas, contas de competidores e painel administrativo com persistência no PostgreSQL.

## Stack e organização

**Next.js 16, React 19, TypeScript e PostgreSQL**, com `pg` para consultas parametrizadas e Zod para validação no servidor. Uma única aplicação reúne interface e API, sem exigir serviços de autenticação externos. SQL versionado mantém o banco explícito e reduz dependências para manutenção de uma comunidade pequena. Os embaralhamentos usam `cubing.js`; os diagramas usam a biblioteca **cube-icons**, hospedada junto à aplicação com licença MIT preservada.

```text
app/                    Páginas, layout e API Next App Router
components/             Interface, formulários e CubeDiagram reutilizável
lib/                    Autenticação, permissões, scoring e serviços de dados
db/001_initial.sql      Estrutura inicial e constraints PostgreSQL
scripts/                Migração, conteúdo inicial e promoção de administradores
data/                   Acervo curado e campos institucionais iniciais
public/vendor/          cube-icons original, CSS e licença
tests/                  Testes unitários e de integração
tests/e2e/              Fluxo HTTP de campeonato e verificações Chromium
docs/SOURCES.md         Fontes dos algoritmos, regras e licenças
docs/OPERATIONS.md      Operação, publicação de resultados e backups
```

## O que está implementado

- **Acervo:** busca, filtros F2L/OLL/PLL, detalhes, orientação, fontes, variações, cópia, favoritos e marcação de aprendizado. Os diagramas representam o inverso da solução, sem embaralhamento aleatório. Favoritos e progresso ficam somente no navegador e essa limitação aparece na interface.
- **Campeonatos:** eventos em rascunho, abertos, em andamento e encerrados; cadastro, login, perfil, inscrição por rodada, embaralhamentos compartilhados, envio/correção de tempos, penalidades, upload privado de vídeo, revisão e publicação da classificação. Rodadas podem ser editadas/excluídas e eventos podem ser excluídos enquanto forem rascunhos sem inscrições, envios ou resultados publicados.
- **Formatos:** Ao5 e Mo3; modalidades 3×3, 2×2 e Pyraminx. Resultados usam centésimos inteiros, +2, DNF, arredondamento e desempates. DNF nunca vira zero. Horários são apresentados em **America/Recife**.
- **Organização:** administrador gerencia conteúdo, fontes, algoritmos, usuários e todos os eventos. Organizador administra apenas os próprios eventos, inscrições, vídeos e resultados. Competidor acessa seu perfil e seus envios. Toda autorização é repetida no servidor.
- **Sobre:** logotipo oficial fornecido em `imgs/`, contato confirmado, campos editáveis para história, encontros, fotos e canais; seção de Henrique Rojas, estudante de Ciência da Computação e delegado da WCA, conforme informações fornecidas. As informações institucionais ainda não fornecidas continuam pendentes para preenchimento no painel.
- **Conta e privacidade:** upload de foto, exportação de dados, exclusão com senha e confirmação explícita, política pública em `/privacidade` e rotina de retenção de evidências. Confirmação de e-mail e recuperação de senha têm integração Resend configurável; login WCA usa OAuth configurável. Sem credenciais, a interface informa indisponibilidade, sem simular entrega ou login.
- Interface responsiva, temas claro/escuro, controles por teclado, foco visível, textos alternativos e estados de carregamento, vazio, erro e nova tentativa.

Os campeonatos são **online e independentes, sem reconhecimento oficial da WCA**. O uso de regras de referência e de `cubing.js` não os transforma em competições WCA.

### Acervo inicial

Há **nove casos validados**: três casos F2L, Sune, Anti-Sune e permutações T, Ua, Ub e Jb. Os três acréscimos foram incluídos manualmente após consulta às fontes e validação mecânica, sem importação automática. Este conjunto é deliberadamente incompleto. Fontes por caso, validação independente com `cubing/kpuzzle`, orientação dos diagramas e commit fixado do cube-icons estão em [docs/SOURCES.md](docs/SOURCES.md). Não inclui os 57 OLLs, os 21 PLLs nem um catálogo completo de F2L.

## Instalação local

### Requisitos

- Node.js **26** e npm. Desenvolvimento verificado com Node 26.10.0.
- PostgreSQL 17 ou posterior recomendado; banco e usuário exclusivos da aplicação.
- Chromium para os testes de navegador, instalado pelo Playwright.

```sh
npm ci --include=dev
cp .env.example .env.local
```

Edite `.env.local` com os dados do seu PostgreSQL. O exemplo não contém uma senha de acesso válida. Crie o usuário e o banco usando as ferramentas administrativas do PostgreSQL, sem usar superusuário como conta da aplicação.

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL, com usuário, senha, host, porta e banco. Escape caracteres especiais da senha na URL. |
| `APP_URL` | Origem exata do site, por exemplo `http://localhost:3000`; necessária para validação de Origin/CSRF. Em produção, use HTTPS. |
| `COMMUNITY_NAME` | Nome inicial da comunidade no seed; depois pode ser alterado no painel. |
| `NODE_ENV` | `development` para desenvolvimento e `production` para publicação. O Next define seu modo normalmente; não use valores personalizados. |
| `MEDIA_STORAGE_DIR` | Diretório persistente fora de `public`, padrão `.data/media`. Não o exponha por alias estático do proxy. |
| `RESEND_API_KEY`, `MAIL_FROM` | Chave Resend e remetente autorizado para confirmação e recuperação. Ambos são necessários; nunca use `NEXT_PUBLIC_*` para esses valores. |
| `WCA_CLIENT_ID`, `WCA_CLIENT_SECRET` | Credenciais da aplicação OAuth WCA. Callback fixo: `${APP_URL}/api/wca/callback`. |

Os scripts administrativos carregam `.env.local` e `.env`, sem substituir variáveis já exportadas. O Next carrega seus arquivos de ambiente. Nenhum segredo deve entrar no Git.

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Abra `http://localhost:3000`. Migração e seed são idempotentes. O seed insere somente o conteúdo curado e campos institucionais, preserva edições existentes e **não cria usuários, campeonatos, participantes ou resultados fictícios**.

Se o ambiente de shell já tiver `NODE_ENV=production`, remova essa variável antes de `npm run dev`; para testar a versão de produção use `npm run build` e `npm start`.

## Primeiro administrador

1. Abra `/conta` e cadastre sua própria conta com uma senha escolhida por você. Não existem contas ou senhas padrão.
2. No servidor, promova essa conta:

```sh
npm run admin -- --email seu-email@exemplo.com --role ADMIN
```

3. Atualize a sessão/página e abra `/admin`.

O comando só promove contas que já existem e registra a mudança em auditoria. Também aceita `ORGANIZER` e `COMPETITOR`. O painel permite gerenciar papéis após o primeiro administrador, com proteção contra remoção do último administrador. Nunca exponha esse comando como endpoint público sem autenticação.

## Atualização de conteúdo

Em `/admin`, o administrador pode preencher história, objetivos, encontros, boas-vindas, fotos autorizadas, logotipo, links sociais e perfil do desenvolvedor. Campos não confirmados permanecem vazios ou identificados para preenchimento. Fotos podem ser enviadas ao armazenamento local ou informadas por URL; a publicação continua exigindo autorização das pessoas retratadas e descrição alternativa.

O nome completo e o nome curto da comunidade são configuráveis. O arquivo oficial recebido está em `public/imgs/logo-cubo-pe.jpeg`, sem alteração dos bytes originais. Os defaults usam `https://cubomagicope.rojasdev.site` e o suporte `henriquer01@rojasdev.cloud`. A migração de identidade preenche somente campos de logo/contato vazios, preservando edições existentes. O cabeçalho usa o arquivo local para que o logo também funcione no ambiente de desenvolvimento.

No acervo, cadastre a sequência, fonte, orientação e observações. **Marque como validado somente após conferir o caso e seu diagrama.** Casos não validados ou arquivados não aparecem na biblioteca pública. Os campos de puzzle/método existem para expansão, mas o esquema e a validação atuais aceitam apenas 3×3/CFOP: novas modalidades de aprendizado exigem migração, revisão do componente e testes.

## Fluxo de campeonato

1. Em `/admin`, crie o evento e as regras. Defina a janela de inscrição.
2. Acrescente as rodadas, escolhendo modalidade, Ao5/Mo3, horários e exigência de vídeo. O servidor gera uma série de embaralhamentos por rodada e a persiste.
3. Mude o evento de rascunho para inscrições abertas. Competidores se cadastram e escolhem as rodadas.
4. Após a abertura, cada inscrito vê os mesmos embaralhamentos, informa os tempos em ordem e seleciona nenhuma penalidade, +2 ou DNF. Quando exigido ou solicitado, informa a URL do vídeo.
5. Um novo envio antes do encerramento substitui o anterior e retorna a pendente. A abertura é inclusiva e o encerramento exclusivo, usando o relógio do servidor.
6. O organizador revisa os vídeos e aprova ou rejeita os envios. Cada decisão inclui a revisão do envio exibido na tela. Se o competidor reenviar os tempos ou houver uma nova solicitação de vídeo, a decisão antiga é recusada e o organizador precisa conferir os dados atualizados. Solicitações de vídeo precisam ocorrer antes do prazo de envio.
7. Depois do prazo e sem envios pendentes, publique os resultados da rodada. O público vê somente resultados aprovados e publicados, sem e-mails ou links de vídeo. Revisões esportivas ficam bloqueadas após a publicação; a exclusão da conta por privacidade remove os resultados do participante, inclusive os publicados.
8. Encerre o evento quando as atividades terminarem.

O painel também lista e remove inscrições, respeitando o bloqueio após publicação. Em **Ajustes do rascunho**, é possível editar/excluir rodadas e excluir o evento; o servidor permite essas operações somente em rascunhos sem inscrições, envios ou publicações. Alterar puzzle/formato gera novos embaralhamentos; uma edição só de nome preserva a série existente. Exclusões exigem digitar `EXCLUIR` na interface. Eventos em uso continuam sendo encerrados e publicados, sem exclusão destrutiva. Veja [docs/EVENT-LIFECYCLE.md](docs/EVENT-LIFECYCLE.md).

## Privacidade, e-mail e arquivos

A política pública está em `/privacidade`. O responsável pelo atendimento é `henriquer01@rojasdev.cloud`. A própria conta permite exportar seus dados e solicitar exclusão efetiva com senha; o último administrador e proprietários de eventos recebem um bloqueio para resolver suas responsabilidades antes da exclusão. Contas exclusivamente WCA devem recorrer ao suporte se ainda não tiverem uma senha local utilizável.

Fotos locais são públicas; vídeos locais são privados, acessíveis ao dono, aos administradores e ao organizador de evento com envio vinculado. Fotos aceitam JPEG/PNG/WebP até 5 MiB; vídeos aceitam MP4/WebM até 100 MiB. Cada conta tem quota de 1 GiB e 200 arquivos. URLs externas continuam sujeitas às permissões do provedor.

Links de vídeo e arquivos associados tornam-se elegíveis para remoção **90 dias após o encerramento da rodada**; uploads sem vínculo, após **7 dias**. A rotina é explícita e não está agendada por este repositório:

```sh
npx tsx scripts/retention.ts --dry-run
npx tsx scripts/retention.ts --apply
```

Faça backup do banco **e** do volume de mídia e defina sua rotação antes de abrir ao público. A exclusão na aplicação não apaga cópias de backup ou arquivos hospedados em provedores externos.

Detalhes: [dados, uploads e retenção](docs/DATA-LIFECYCLE.md), [confirmação e recuperação](docs/AUTH.md), [login WCA](docs/WCA-AUTH.md). O cadastro local continua funcionando sem serviços externos e a confirmação de e-mail é opcional. OAuth WCA não vincula contas existentes automaticamente por coincidência de e-mail ou ID.

## Testes e verificações

```sh
npm test
npm run typecheck
npm run build
```

`npm test` executa somente os testes sem banco e identifica os testes de integração como ignorados. O runner remove `DATABASE_URL` do subprocesso para impedir alterações acidentais em uma conexão exportada no shell. Para a suíte completa, use **um banco exclusivo de testes, nunca produção**. `npm run test:integration` cria um schema exclusivo, aplica migrações e seed, executa os testes com `search_path` isolado e remove o schema ao terminar. O usuário do banco de testes precisa de permissão para criar schemas. Crie `.env.test.local`, que não é versionado:

```dotenv
DATABASE_URL=postgresql://usuario:SENHA_DO_BANCO_DE_TESTES@localhost:5432/cubo_pe_test
APP_URL=http://localhost:3100
E2E_BASE_URL=http://localhost:3100
NODE_ENV=development
```

Inicialize esse banco e execute os testes:

```sh
node --env-file=.env.test.local --import tsx scripts/migrate.ts
node --env-file=.env.test.local --import tsx scripts/seed.ts
npm run test:integration
npx playwright install chromium
```

Para o teste de navegador, inicie outra instância do site usando o banco e a origem de testes. Em um terminal POSIX:

```sh
set -a
. ./.env.test.local
set +a
npm run dev -- --port 3100
```

Em outro terminal:

```sh
npm run test:e2e
```

Não use `node --env-file ... next dev`: neste runtime o reinício interno do Next repassa a flag para `NODE_OPTIONS`, que a rejeita. O carregamento pelo shell acima evita isso. Para senhas com caracteres especiais, use variáveis exportadas pelo seu gerenciador de segredos em vez de fazer `source` de um arquivo não revisado.

Para testar o build de produção em Chromium com banco e mídia descartáveis, execute `npm run build && npm run test:e2e:isolated`. Esse runner cria um schema `cubo_test_*`, migra/semeia o acervo, inicia o servidor em `127.0.0.1:3199` e remove schema/arquivos ao terminar; credenciais externas de e-mail e WCA ficam desabilitadas no subprocesso. `ffmpeg` é necessário apenas para gerar os vídeos usados nos testes.

A suíte cobre cálculos, DNF, +2, desempates, precisão, permissões, prazos sob concorrência, persistência, seed/CLI, diagramas, tokens de conta, OAuth, uploads, retenção e exclusão. Os testes de navegador exercitam publicação, upload de foto e vídeo, reprodução privada, exportação e exclusões. O envio Resend e o login WCA contra provedores reais precisam de credenciais e de validação operacional separada.

## Publicação

### Processo Node.js

```sh
npm ci --include=dev
npm run db:migrate
npm run db:seed
npm run build
npm start
```

Execute sob um gerenciador de processos, com reinício automático, atrás de proxy reverso com HTTPS. Defina `APP_URL=https://cubomagicope.rojasdev.site` e `NODE_ENV=production` no ambiente do processo. Encaminhe `Host`, `X-Forwarded-Proto` e um `X-Forwarded-For` controlado pelo proxy; não confie em cabeçalhos de cliente sem normalização. Restrinja a porta 3000 ao proxy/firewall. Cookies de sessão são HttpOnly, SameSite=Lax e Secure em produção.

### Docker Compose

Há `Dockerfile` e `compose.yaml`. Crie `.env` para o Compose, com valores próprios:

```dotenv
POSTGRES_PASSWORD=SUBSTITUA_POR_UMA_SENHA_FORTE
DATABASE_URL=postgresql://cubo_pe:SUBSTITUA_POR_UMA_SENHA_FORTE@db:5432/cubo_pe
APP_URL=https://cubomagicope.rojasdev.site
COMMUNITY_NAME=Comunidade Pernambucana de Cubo Mágico
```

A senha na URL precisa representar o mesmo valor de `POSTGRES_PASSWORD`, com escape de URL quando necessário. O arquivo `.env` do Compose não é um script shell.

```sh
docker compose up -d db
docker compose build web
docker compose run --rm web npm run db:migrate
docker compose run --rm web npm run db:seed
docker compose up -d web
```

A aplicação fica em `127.0.0.1:3000`, para proxy reverso; PostgreSQL não publica porta no host. Os volumes `postgres-data` e `media-data` preservam o banco e os uploads, respectivamente. Para promover a primeira conta, use `docker compose exec web npm run admin -- --email seu-email@exemplo.com --role ADMIN`. O runtime roda como usuário não root. O container mantém as dependências de desenvolvimento para disponibilizar as CLIs TypeScript; pode ser otimizado em uma etapa futura.

**O build Node e a aplicação foram exercitados; o caminho Docker/Compose não foi executado neste ambiente, que não dispõe do Docker CLI.** Faça backup e teste restauração antes de publicar. Não há deploy público ou DNS provisionado por este repositório.

## Segurança e pendências

Implementado: validação Zod, SQL parametrizado, senhas scrypt com salt, tokens de sessão aleatórios armazenados por hash, expiração de sessão, limites persistentes de requisições, verificação de Origin, RBAC, auditoria, locks/transações nos envios e publicação e cabeçalhos de segurança. A CSP só permite `unsafe-eval` no modo de desenvolvimento, necessário ao React/Next; não em produção.

Ainda depende de informação ou operação externa:

- História, encontros, fotos autorizadas e canais da comunidade, que o responsável preencherá depois. O logotipo oficial e o contato de suporte já foram incorporados.
- Foto, biografia ampliada e links confirmados de Henrique. A condição de delegado WCA é informação fornecida pelo solicitante, sem integração de verificação WCA.
- Provisionamento de DNS/HTTPS para `cubomagicope.rojasdev.site`, deploy, backups, monitoramento e agendamento da limpeza de retenção. Informar o domínio no código não provisiona a infraestrutura.
- Revisão operacional/jurídica da política, definição da rotação dos backups e atendimento das solicitações recebidas pelo suporte.
- Ampliações posteriores do acervo continuam dependendo de validação editorial; não há importação automática de algoritmos.
- Credenciais Resend, remetente autorizado e teste de entregabilidade para ativar confirmação e recuperação por e-mail.
- Cadastro da aplicação OAuth WCA, credenciais e teste de login real. Vinculação/fusão de contas existentes não está implementada; o ID WCA digitado no perfil continua opcional e autodeclarado.

Nenhuma chave ou senha é incluída no código. Os arquivos locais de ambiente e dados de conexão devem permanecer fora do controle de versão.
