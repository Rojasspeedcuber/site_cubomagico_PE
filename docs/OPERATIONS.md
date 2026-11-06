# Operação e publicação

## Antes de abrir ao público

- O logotipo recebido em `imgs/` já está incluído em `public/imgs/logo-cubo-pe.jpeg`. Conferir a apresentação e preservar as autorizações dos materiais institucionais.
- Conferir as informações institucionais, os canais da comunidade, as fotografias e suas autorizações. Campos vazios não viram contatos ou histórias inventados.
- Revisar o acervo e as fontes em `docs/SOURCES.md`. O conjunto inicial é parcial.
- Provisionar DNS e HTTPS para `cubomagicope.rojasdev.site` e definir `APP_URL=https://cubomagicope.rojasdev.site`, sem caminho. As escritas verificam a origem para proteção contra CSRF. O domínio no código não implica deploy ou certificado emitido.
- Proteger o PostgreSQL, sem porta pública. Dar à aplicação uma conta exclusiva, sem privilégios de superusuário.
- Revisar a política em `/privacidade`, os procedimentos de [dados e retenção](DATA-LIFECYCLE.md) e a rotação dos backups. O suporte confirmado é `henriquer01@rojasdev.cloud`. Nome, cidade e ID WCA são dados públicos de perfil; e-mails, sessões e links de vídeo não devem ser publicados nos resultados.
- Não cadastrar competidores ou resultados de exemplo no banco de produção.

## Campeonato independente da comunidade

1. O administrador concede o perfil de organizador à pessoa responsável. Um organizador só administra seus próprios eventos.
2. O organizador cria o evento com descrição, regras e período de inscrição. Define as modalidades, os formatos, os horários de abertura e encerramento das rodadas e a exigência de vídeo.
   Enquanto o evento for um rascunho sem inscrições, envios ou resultados publicados, pode editar/excluir rodadas ou excluir o evento em **Ajustes do rascunho**. Alterações de modalidade/formato geram novos embaralhamentos. O servidor revalida os bloqueios sob lock, mesmo que a tela esteja desatualizada.
3. O servidor gera e guarda uma série de embaralhamentos por rodada com `cubing.js`. A mesma série é compartilhada com os inscritos após a abertura. Nunca reutilize um evento de teste como evento público.
4. O organizador abre as inscrições. Cada competidor cria sua conta e escolhe as modalidades.
5. Durante a rodada, cada participante consulta os embaralhamentos e envia os tempos na ordem, com penalidades e link de vídeo quando exigido. Um novo envio antes do prazo substitui o anterior e exige nova revisão.
6. O organizador aprova ou rejeita os envios e registra uma justificativa quando necessário. Pode solicitar um vídeo específico conforme as regras do evento. Solicite com antecedência: o prazo final também bloqueia correções e anexos do participante.
7. Após o prazo, o organizador resolve os envios pendentes e publica a classificação da rodada. Resultados em análise não devem ser apresentados como classificação oficial do evento.
8. O organizador encerra o evento quando todas as rodadas estiverem concluídas.

Os horários são armazenados como instantes UTC e apresentados em `America/Recife`. Os eventos são online e independentes, sem homologação ou reconhecimento oficial da WCA.

## Cálculos e revisão

- Tempos são números inteiros de centésimos de segundo. A penalidade `+2` acrescenta 200 centésimos.
- Em Ao5, descarta-se o melhor e o pior resultado; a média usa os três restantes. Um DNF é descartado como pior; dois ou mais tornam a média DNF.
- Em Mo3, usam-se os três resultados. Qualquer DNF torna a média DNF.
- A precisão é de centésimos abaixo de dez minutos. A partir desse limite, tempos individuais são truncados para segundos e médias são arredondadas para segundos, conforme a referência adotada. DNF é um estado, nunca o número zero.
- Médias empatadas são comparadas pelo melhor tempo individual. Igualdade também no melhor tempo mantém a mesma posição.
- Consulte as referências e os testes antes de alterar estas regras. A implementação cobre os formatos e as modalidades documentados, não todo o regulamento da WCA.

## Banco, backup e restauração

Faça backups regulares usando uma conta apropriada e um arquivo protegido de configuração de conexão. Não coloque senhas na linha de comando nem em arquivos versionados.

```sh
pg_dump --format=custom --file=cubo-pe.backup "$DATABASE_URL"
pg_restore --no-owner --dbname="$DATABASE_URL" cubo-pe.backup
```

Restaure primeiro em uma base separada e valide os dados. O volume `postgres-data` do Compose é persistente, mas não substitui backup externo. `docker compose down -v` apaga esse volume: não use em produção.

O volume de mídia também precisa de backup. Em Compose, `media-data` mantém arquivos em `/app/.data/media`, separados de `public`; fora de containers, configure `MEDIA_STORAGE_DIR` em um diretório persistente. O proxy deve aceitar uploads de até 101 MiB e nunca servir essa pasta diretamente.

Mantenha o relógio do servidor sincronizado. Revise auditoria e falhas de login; preserve logs sem gravar senhas, cookies, e-mails ou URLs privadas desnecessariamente. Evite query strings do callback OAuth nos logs do proxy.

## Retenção e solicitações de exclusão

Execute `npx tsx scripts/retention.ts --dry-run` para conferir candidatos e `--apply` para limpar. A rotina remove referências de vídeos 90 dias após o encerramento da rodada e arquivos sem vínculo após 7 dias. Não há cron criado automaticamente; configure a execução e a monitoria antes de anunciar cumprimento automático desses prazos.

A conta oferece exportação e exclusão com senha e confirmação `EXCLUIR`. A exclusão remove resultados do participante, inclusive publicados, além de perfil, inscrições, sessões e arquivos. Essa exceção de privacidade é distinta das alterações esportivas bloqueadas após a publicação. O último administrador e proprietários de eventos não podem excluir a conta antes de resolver suas responsabilidades.

Para pedidos ao suporte, confirmar a identidade sem solicitar a senha, localizar os dados e explicar impedimentos. Contas somente WCA exigem um atendimento apropriado se não possuírem senha local utilizável. Retirar fotos institucionais quando a autorização for revogada e registrar a providência sem replicar dados desnecessários. Definir rotação de backups e reaplicar exclusões se houver restauração; arquivos em provedores externos exigem exclusão na origem.

## Limitações operacionais

Confirmação de e-mail e recuperação usam Resend mediante `RESEND_API_KEY` e `MAIL_FROM`, com remetente autorizado; consulte [AUTH.md](AUTH.md). A confirmação local é opcional. Login WCA depende de credenciais OAuth e callback registrado; consulte [WCA-AUTH.md](WCA-AUTH.md). Sem configuração, esses serviços ficam explicitamente indisponíveis, enquanto o cadastro local continua funcionando.

Há upload local de fotos públicas e vídeos privados, mas não há transcodificação, antivírus ou remoção de EXIF. A organização deve conferir o arquivo e a autorização de uso. Links externos continuam permitidos e sujeitos às regras do provedor. A criação de rodadas não promete embaralhamentos oficiais de uma competição WCA. Backups, DNS/HTTPS, monitoramento e revisão jurídica continuam sendo responsabilidades da operação.
