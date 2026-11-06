# Login com a conta WCA

## Entrega e integração

`lib/wca-auth.ts` exporta `handleWcaAuth(request, user): Promise<Response | null>`. O roteador principal o chama depois da leitura da sessão e do limite geral de escrita, preservando a resposta e todos os headers `Set-Cookie`. As três rotas são GET; o callback de navegação externo não deve exigir header `Origin` de escrita. As demais rotas de escrita continuam protegidas normalmente.

`components/WcaLogin.tsx` exporta `WcaLogin` (também default), sem props, para a área **desconectada** da conta. Ele consulta capabilities e só habilita o botão com `{data:{enabled:true}}`; falha HTTP/rede ou ausência de configuração mantém o botão desabilitado, com explicação em pt-BR. Usa navegação completa para o OAuth, não fetch do início nem prefetch de link. Não inserir na área autenticada como se fosse um recurso de vinculação.

Aplicar `db/006_wca_auth.sql` pelo migrador normal antes de habilitar. O botão está integrado em `AccountView`; o ambiente e as credenciais não são preenchidos automaticamente.

## Configuração externa necessária

1. O responsável cadastra uma aplicação OAuth no [site WCA](https://www.worldcubeassociation.org/oauth/applications).
2. Cadastrar exatamente o callback `https://cubomagicope.rojasdev.site/api/wca/callback`, se esse for o domínio usado. Não cadastrar wildcard e não usar o aplicativo público/inseguro de staging.
3. Configurar no servidor, nunca em variáveis `NEXT_PUBLIC_*`:
   - `APP_URL=https://cubomagicope.rojasdev.site` (origem, sem caminho, query, fragmento ou credenciais de URL).
   - `WCA_CLIENT_ID`: identificador da aplicação cadastrada.
   - `WCA_CLIENT_SECRET`: segredo da aplicação cadastrada.
4. Reiniciar a aplicação com as variáveis e testar a autorização real pelo navegador. Esta etapa exige uma conta WCA e **não foi executada localmente sem credenciais**.

Sem qualquer uma das três variáveis, capabilities responde `enabled:false`; start e callback respondem HTTP 503 com erro de indisponibilidade. HTTPS é obrigatório, salvo HTTP em localhost/127.0.0.1/[::1] fora de produção. Não há configuração de URL arbitrária de provedor nem modo de demonstração em produção.

## Protocolo e segurança

- Authorization Code: authorize e token em `https://www.worldcubeassociation.org/oauth/...`; identidade obtida somente por GET autenticado em `/api/v0/me`. Escopos solicitados: `public email`, sem DOB, gerenciamento de competições ou registros.
- Callback calculado apenas a partir da origem `APP_URL`; sucesso retorna HTTP 303 exclusivamente para `/conta` nessa origem. Parâmetros `next`, `returnTo` etc. não são usados.
- State e segredo de browser independentes, com 32 bytes aleatórios cada. Banco persiste somente SHA-256 de ambos, expiração de dez minutos e data UTC. Cookie de browser HttpOnly, SameSite=Lax, Path=/api/wca, Max-Age=600 e Secure com HTTPS. Recomeçar o login substitui o cookie e invalida a tentativa anterior nesse browser por incompatibilidade de vínculo.
- Callback valida formato, quantidade de parâmetros e vínculo com cookie. DELETE condicional com `RETURNING` consome state atomicamente; expirados e replays falham, inclusive entre processos. State válido é consumido também quando a pessoa recusa autorização ou o provedor falha; é necessário iniciar novamente. Cookie temporário é limpo nas respostas processadas do callback.
- Cada requisição ao provedor tem timeout de dez segundos, `redirect:error` e `cache:no-store`. Respostas OAuth locais têm `Cache-Control:no-store` e `Referrer-Policy:no-referrer`. Access/refresh tokens não são gravados em banco, cookie, resposta ou logs pelo módulo; somente uma sessão local é criada após autenticação. O operador deve também evitar registrar query strings do callback no proxy/APM, pois contêm código e state transitórios.
- E-mail e nome vêm da resposta autenticada `/me`, não de inputs locais ou parâmetros do callback. Ausência de e-mail, ID de provedor inválido, WCA ID malformado e caracteres de controle são rejeitados. A API v0 não documenta um campo `email_verified` nesse payload; não fabricamos esse atributo nem marcamos confirmação de e-mail local. O escopo email é necessário para criar uma nova conta local, cujo e-mail é obrigatório.
- `wca_accounts.wca_user_id` é o **ID numérico da conta no site WCA**, não `wca_id` (identificador de resultados, opcional). Apenas o mapeamento de provider ID autoriza logins seguintes. Mudança de e-mail no provedor não muda ou reassocia o cadastro local automaticamente.
- Nova conta: role `COMPETITOR` explícito, senha em esquema deliberadamente inválido para `verifyPassword`, sem senha padrão. Conta e vínculo são criados na mesma transação que a sessão. Unique constraints e advisory lock por provider ID protegem tentativas concorrentes e impedem vínculos duplicados.
- Colisão de e-mail **ou** WCA ID informado em outra conta local retorna HTTP 409. Nunca se vincula automaticamente por esses campos; o ID local autodeclarado é apenas sinal de colisão, não prova de identidade. Uma sessão local já aberta também recebe 409 em start/callback, evitando troca silenciosa de conta ou consentimento implícito de vinculação.
- **Vinculação/fusão de contas não está implementada nesta versão.** A orientação é entrar pelo método local e contatar `henriquer01@rojasdev.cloud`; o suporte não deve fazer associação por simples coincidência de e-mail/ID. Um fluxo futuro exige reautenticação local, OAuth novo e consentimento explícito. O site continua independente, sem alegação de chancela oficial WCA.
- Expirados são removidos ao iniciar novos fluxos. A FK do vínculo OAuth usa ON DELETE CASCADE; excluir fisicamente o usuário remove também seu vínculo. Não existe tarefa externa de limpeza criada por esta entrega.

## Testes

Testes locais do worker, sem banco e sem carregar arquivos de ambiente:

```sh
env -u DATABASE_URL node --import tsx --test tests/backend.wca-auth.test.ts
```

A suíte testa disponibilidade, parâmetros OAuth, hashes/cookie, rejeição de state, replay, troca de código com fetch simulado **somente no teste**, seleção por provider ID, prevenção de vinculação silenciosa, validação do payload, recusa/falhas do provedor e botão inicialmente desabilitado.

O teste PostgreSQL do mesmo arquivo roda com o runner isolado `npm run test:integration`. Verifica persistência, cookie incorreto, expiração, consumo concorrente único, criação de sessão real, senha inutilizável, papel mínimo, colisões e primeiros logins concorrentes. Não executar esse teste diretamente com URL do banco da aplicação; ele exige `current_schema()` no padrão `cubo_test_*` antes de escrever.

Não houve validação de login contra WCA real ou aplicação de migração no banco da aplicação. A configuração e o teste real de ponta a ponta permanecem dependências externas explícitas.

## Fontes oficiais consultadas

Consultadas via HTTP durante a implementação:

- [WCA v0 API — OAuth Authorization Code](https://docs.worldcubeassociation.org/knowledge_base/v0_api.html): endpoint authorize, response_type=code, inclusão obrigatória de redirect_uri na troca, `/me`, necessidade de public junto aos demais escopos; também avisa que v0 não tem garantia de consistência/disponibilidade.
- [WCA API help](https://www.worldcubeassociation.org/help/api): cadastro de aplicações, endpoint de token e chamada Bearer de `/me`. O exemplo de password grant dessa página **não** é usado.
- [Configuração Doorkeeper oficial](https://github.com/thewca/worldcubeassociation.org/blob/main/config/initializers/doorkeeper.rb): public padrão e email opcional.
- [Testes OAuth oficiais](https://github.com/thewca/worldcubeassociation.org/blob/main/spec/requests/oauth/oauth_spec.rb): fluxo code com public email e dados privados por escopo.
- [Controller oficial de usuários v0](https://github.com/thewca/worldcubeassociation.org/blob/main/app/controllers/api/v0/users_controller.rb): dados da conta autenticada em `/me`. O código atual usa envelope `{user:...}`, enquanto os exemplos publicados usam `{me:...}`; o adaptador aceita ambos, com teste específico para essa diferença.

A API pode mudar; erro de contrato do provedor falha com segurança, sem criar identidade fictícia.
