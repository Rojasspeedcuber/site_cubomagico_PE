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
- **Campeonatos:** eventos em rascunho, abertos, em andamento e encerrados; cadastro, login, perfil, inscrição por rodada, embaralhamentos compartilhados, envio/correção de tempos, penalidades, vídeo, revisão e publicação da classificação.
- **Formatos:** Ao5 e Mo3; modalidades 3×3, 2×2 e Pyraminx. Resultados usam centésimos inteiros, +2, DNF, arredondamento e desempates. DNF nunca vira zero. Horários são apresentados em **America/Recife**.
- **Organização:** administrador gerencia conteúdo, fontes, algoritmos, usuários e todos os eventos. Organizador administra apenas os próprios eventos, inscrições, vídeos e resultados. Competidor acessa seu perfil e seus envios. Toda autorização é repetida no servidor.
- **Sobre:** história, objetivos, encontros, fotos e links editáveis; seção de Henrique Rojas, estudante de Ciência da Computação e delegado da WCA, conforme informações fornecidas.
- Interface responsiva, temas claro/escuro, controles por teclado, foco visível, textos alternativos e estados de carregamento, vazio, erro e nova tentativa.

Os campeonatos são **online e independentes, sem reconhecimento oficial da WCA**. O uso de regras de referência e de `cubing.js` não os transforma em competições WCA.

### Acervo inicial

Há **seis casos validados**: inserção F2L à direita, Sune, Anti-Sune e permutações T, Ua e Ub. Este conjunto é deliberadamente incompleto. Fontes por caso, validação independente com `cubing/kpuzzle`, orientação dos diagramas e commit fixado do cube-icons estão em [docs/SOURCES.md](docs/SOURCES.md). Não inclui os 57 OLLs, os 21 PLLs nem um catálogo completo de F2L.

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

Em `/admin`, o administrador pode preencher história, objetivos, encontros, boas-vindas, fotos autorizadas, logotipo, links sociais e perfil do desenvolvedor. Campos não confirmados permanecem vazios ou identificados para preenchimento. URLs são validadas no servidor; fotos usam links externos, não uploads.

O nome completo e o nome curto da comunidade são configuráveis. O campo de logotipo aguarda o arquivo oficial; os elementos geométricos atuais são apenas parte da interface. Após receber o arquivo, hospede-o em uma URL HTTPS ou inclua-o em `public/` e configure uma URL absoluta do próprio site.

No acervo, cadastre a sequência, fonte, orientação e observações. **Marque como validado somente após conferir o caso e seu diagrama.** Casos não validados ou arquivados não aparecem na biblioteca pública. Os campos de puzzle/método existem para expansão, mas o esquema e a validação atuais aceitam apenas 3×3/CFOP: novas modalidades de aprendizado exigem migração, revisão do componente e testes.

## Fluxo de campeonato

1. Em `/admin`, crie o evento e as regras. Defina a janela de inscrição.
2. Acrescente as rodadas, escolhendo modalidade, Ao5/Mo3, horários e exigência de vídeo. O servidor gera uma série de embaralhamentos por rodada e a persiste.
3. Mude o evento de rascunho para inscrições abertas. Competidores se cadastram e escolhem as rodadas.
4. Após a abertura, cada inscrito vê os mesmos embaralhamentos, informa os tempos em ordem e seleciona nenhuma penalidade, +2 ou DNF. Quando exigido ou solicitado, informa a URL do vídeo.
5. Um novo envio antes do encerramento substitui o anterior e retorna a pendente. A abertura é inclusiva e o encerramento exclusivo, usando o relógio do servidor.
6. O organizador revisa os vídeos e aprova ou rejeita os envios. Cada decisão inclui a revisão do envio exibido na tela. Se o competidor reenviar os tempos ou houver uma nova solicitação de vídeo, a decisão antiga é recusada e o organizador precisa conferir os dados atualizados. Solicitações de vídeo precisam ocorrer antes do prazo de envio.
7. Depois do prazo e sem envios pendentes, publique os resultados da rodada. O público vê somente resultados aprovados e publicados, sem e-mails ou links de vídeo. Resultados publicados ficam imutáveis.
8. Encerre o evento quando as atividades terminarem.

O painel também lista e remove inscrições, respeitando o bloqueio após publicação. As rodadas são configuradas na criação; não há edição/exclusão de rodadas nem exclusão de eventos pela interface/API nesta versão. Confira horários e formatos antes de abrir inscrições. Veja [docs/OPERATIONS.md](docs/OPERATIONS.md).

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

Verificado nesta entrega: **33 testes unitários/de integração aprovados, sem skips, e quatro testes Playwright aprovados**, além de TypeScript e build de produção. A suíte cobre cálculos, DNF, +2, desempates, precisão, permissões, privacidade, prazos sob concorrência, persistência, seed/CLI, diagramas e o fluxo HTTP completo até publicação. As fixtures de usuários/eventos são removidas; podem permanecer registros de auditoria e rate limit no banco de testes.

## Publicação

### Processo Node.js

```sh
npm ci --include=dev
npm run db:migrate
npm run db:seed
npm run build
npm start
```

Execute sob um gerenciador de processos, com reinício automático, atrás de proxy reverso com HTTPS. Defina `APP_URL=https://seu-dominio` e `NODE_ENV=production` no ambiente do processo. Encaminhe `Host`, `X-Forwarded-Proto` e um `X-Forwarded-For` controlado pelo proxy; não confie em cabeçalhos de cliente sem normalização. Restrinja a porta 3000 ao proxy/firewall. Cookies de sessão são HttpOnly, SameSite=Lax e Secure em produção.

### Docker Compose

Há `Dockerfile` e `compose.yaml`. Crie `.env` para o Compose, com valores próprios:

```dotenv
POSTGRES_PASSWORD=SUBSTITUA_POR_UMA_SENHA_FORTE
DATABASE_URL=postgresql://cubo_pe:SUBSTITUA_POR_UMA_SENHA_FORTE@db:5432/cubo_pe
APP_URL=https://seu-dominio
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

A aplicação fica em `127.0.0.1:3000`, para proxy reverso; PostgreSQL não publica porta no host. O volume `postgres-data` preserva o banco. Para promover a primeira conta, use `docker compose exec web npm run admin -- --email seu-email@exemplo.com --role ADMIN`. O runtime roda como usuário não root. O container mantém as dependências de desenvolvimento para disponibilizar as CLIs TypeScript; pode ser otimizado em uma etapa futura.

**O build Node e a aplicação foram exercitados; o caminho Docker/Compose não foi executado neste ambiente, que não dispõe do Docker CLI.** Faça backup e teste restauração antes de publicar. Não há deploy público ou DNS provisionado por este repositório.

## Segurança e pendências

Implementado: validação Zod, SQL parametrizado, senhas scrypt com salt, tokens de sessão aleatórios armazenados por hash, expiração de sessão, limites persistentes de requisições, verificação de Origin, RBAC, auditoria, locks/transações nos envios e publicação e cabeçalhos de segurança. A CSP só permite `unsafe-eval` no modo de desenvolvimento, necessário ao React/Next; não em produção.

Ainda depende de informação ou operação externa:

- Logotipo oficial, história, encontros, fotos autorizadas e canais da comunidade.
- Foto, biografia ampliada e links confirmados de Henrique. A condição de delegado WCA é informação fornecida pelo solicitante, sem integração de verificação WCA.
- Domínio, HTTPS, backups, monitoramento e responsável pelo suporte.
- Política de privacidade, retenção de vídeos e procedimentos de exclusão de dados.
- Ampliação editorial do acervo após validação. Não há importação automática de algoritmos.
- E-mail transacional, confirmação de e-mail e recuperação automática de senha não estão implementados.
- Login WCA, armazenamento/upload de fotos ou vídeos e notificações externas não estão integrados; o ID WCA é opcional e informado pelo usuário.
- Edição/exclusão de rodadas e exclusão de eventos não estão implementadas. O encerramento e a publicação são os mecanismos operacionais atuais.

Nenhuma chave ou senha é incluída no código. Os arquivos locais de ambiente e dados de conexão devem permanecer fora do controle de versão.
