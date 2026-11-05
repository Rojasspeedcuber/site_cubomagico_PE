# Operação e publicação

## Antes de abrir ao público

- Receber o logotipo autorizado e preencher a URL no painel de conteúdo. A aplicação não trata os elementos geométricos de interface como logotipo oficial.
- Conferir as informações institucionais, os canais da comunidade, as fotografias e suas autorizações. Campos vazios não viram contatos ou histórias inventados.
- Revisar o acervo e as fontes em `docs/SOURCES.md`. O conjunto inicial é parcial.
- Usar um domínio com HTTPS e definir `APP_URL` com a origem exata, sem caminho. As escritas verificam a origem para proteção contra CSRF.
- Proteger o PostgreSQL, sem porta pública. Dar à aplicação uma conta exclusiva, sem privilégios de superusuário.
- Escolher uma política de privacidade, um prazo para retenção de vídeos e uma pessoa responsável por solicitações de exclusão. Nome, cidade e ID WCA são dados públicos de perfil; e-mails, sessões e links de vídeo não devem ser publicados nos resultados.
- Não cadastrar competidores ou resultados de exemplo no banco de produção.

## Campeonato independente da comunidade

1. O administrador concede o perfil de organizador à pessoa responsável. Um organizador só administra seus próprios eventos.
2. O organizador cria o evento com descrição, regras e período de inscrição. Define as modalidades, os formatos, os horários de abertura e encerramento das rodadas e a exigência de vídeo.
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

Mantenha o relógio do servidor sincronizado. Revise auditoria e falhas de login; preserve logs sem gravar senhas, cookies, e-mails ou URLs privadas desnecessariamente.

## Limitações operacionais

Não há envio de e-mails, confirmação de e-mail, recuperação automática de senha, armazenamento de fotos/vídeos ou integração com login WCA. Fotos e vídeos são links HTTPS; o organizador precisa conferir permissão de acesso e autorização. Configure esses serviços separadamente se passarem a ser necessários. A criação de rodadas não promete embaralhamentos oficiais de uma competição WCA. Não publique este serviço na internet sem revisar as políticas de privacidade e os procedimentos de suporte.
