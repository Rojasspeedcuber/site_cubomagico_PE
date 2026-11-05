# Fontes, licenças e validação do acervo

## Escopo editorial

Seleção inicial de **6 casos**, não um catálogo completo: uma inserção F2L, Sune, Anti-Sune e PLL T, Ua e Ub. Os nomes são descritivos; os IDs são slugs internos, não uma numeração oficial de casos. Não declaramos cobertura dos 57 OLL nem dos 21 PLL. As sequências abaixo foram consultadas nos materiais públicos de CubeSkills, de Feliks Zemdegs e Andy Klise.[4][5][7]

| ID interno | Sequência de solução | Fonte e localização |
| --- | --- | --- |
| `f2l-insercao-direita` | `R U R'` | CubeSkills, F2L Algorithms, “Basic Inserts”.[7] |
| `oll-sune` | `R U R' U R U2 R'` | CubeSkills, OLL Algorithms, “All Edges Oriented Correctly”. A fonte escreve `U2'`, equivalente a `U2`.[5] |
| `oll-anti-sune` | `R U2 R' U' R U' R'` | CubeSkills, OLL Algorithms, “All Edges Oriented Correctly”.[5] |
| `pll-t` | `R U R' U' R' F R2 U' R' U' R U R' F'` | CubeSkills, PLL Algorithms, caso T.[4] |
| `pll-ua` | `R U' R U R U R U' R' U' R2` | CubeSkills, PLL Algorithms, Ua; nome/sequência também conferidos nos dados públicos do treinador J Perm.[4][9] |
| `pll-ub` | `R2 U R U R' U' R' U' R' U R'` | CubeSkills, PLL Algorithms, Ub; nome/sequência também conferidos nos dados públicos do treinador J Perm.[4][9] |

Consulta auxiliar: as páginas de F2L e do treinador PLL de J Perm também foram abertas; as sequências principais do acervo vêm dos PDFs atribuídos na tabela, e os dados do treinador servem de conferência adicional para Ua/Ub.[6][8][9]

Os parênteses de agrupamento das fontes foram removidos sem alterar movimentos. Não cadastramos alternativas sem validar a equivalência exata com o mesmo estado inicial; `variations` começa vazio. Os textos explicativos em português são originais deste projeto. PDFs, capturas, diagramas e prosa das fontes **não foram redistribuídos**. Nenhuma licença aberta de reutilização foi identificada nos PDFs consultados; o acesso público não é tratado como concessão de licença. Deles registramos apenas as sequências notacionais referenciadas e atribuição.[4][5][7]

Os dados sobre **Henrique Rojas, estudante de Ciência da Computação e delegado WCA**, foram fornecidos pelo solicitante, não inferidos de perfis homônimos e não verificados independentemente. Não há links, contato, fotos, datas de fundação ou encontros inventados. `data/content.json` contém textos iniciais editáveis, avisos explícitos onde faltam informações e strings vazias para mídia e contatos não fornecidos. Os objetivos são uma proposta editorial editável, não um histórico de realizações.

## CubeIcons real, fixado e hospedado localmente

Documentação e demo consultadas: README e demo oficiais. A biblioteca é distribuída sob MIT, com o aviso integral preservado em `public/vendor/cube-icons.LICENSE`.[1][2][3]

**Commit imutável usado em todos os downloads:** `1d99d5f58f66665acc53b8d4322c95e6e9d7c075`. Os arquivos são cópias sem alterações dos URLs raw correspondentes. Não se depende de CDN em runtime. O `package.json` upstream registra `1.1.0`; para evitar ambiguidade com rótulos de releases, a identidade reproduzível aqui é o commit + SHA-256, não um número de versão presumido.[10][11][12]

| Arquivo local | Origem | SHA-256 |
| --- | --- | --- |
| `public/vendor/cube-icons.js` | JS raw do commit.[10] | `d2d5f49743b515556fa427a503ae9f49c9b2e52e2d9a00bb80a2101bad7c66e0` |
| `public/vendor/cube-icons.css` | CSS raw do commit.[11] | `5078c3e1acc944a8f5182d85a6bb1621d96a0148998ff48963c64ad813d437a9` |
| `public/vendor/cube-icons.LICENSE` | LICENSE raw do commit.[3] | `1126322e2cc8d165adc4c792eeb195717de2bcc7b39be1ce77959d78e87ef685` |

### Integração e orientação exatas

`components/CubeDiagram.tsx` exporta por default um componente client com as props de `CONTRACT.md`: `{ algorithm: string; category?: string; label: string; size?: number }`. `size` é em pixels (padrão 180, limitado de 64 a 600). Um loader compartilhado injeta o CSS e o JS locais uma única vez. Depois da carga, a API real `CubeIcons.processAll(host)` processa o elemento mantido por `ref`; mudanças de `algorithm` ou `category` recriam o filho imperativo para não reaproveitar o marcador `data-ci-rendered` de um caso anterior. React controla o host, a biblioteca controla somente o filho e seu SVG. Cancelamento evita atualizar componentes desmontados.

O código upstream cria o estado NxN resolvido com **U branco, R vermelho, F verde, L laranja, B azul, D amarelo**. Portanto, aplicar só `x2` deixa U amarelo, mas F azul. Nossa orientação é **`x2 y2`**, que deixa **U amarelo, F verde, R laranja, L vermelho, B azul e D branco**. Isso é uma rotação física do estado, não troca artificial de cores.[2][10]

Para uma sequência de solução `A`, o componente cria:

```html
<i class="ci ci-3x3 ci-iso ci-inverse" data-ci-alg="A y2 x2" data-ci-theme="light"></i>
```

O inverso da sequência completa é **`x2 y2 inverse(A)`**: primeiro prepara a base amarelo/verde, depois aplica o inverso de `A`. Executar a solução `A` no estado mostrado retorna exatamente a essa base resolvida. Colocar `x2` antes de `A` no atributo com `ci-inverse` faria a rotação na ordem errada. Não usamos `ci-scrambled`, `scrambled: true` nem `ci-oll`: este último instala uma base especial já rotacionada no código upstream e não deve ser combinado com nosso setup.[2][10]

A figura é um **representante exato** de cada algoritmo, não todas as permutações possíveis de uma orientação OLL. F2L mostra somente o caso de inserção já preparado. Nos PLL Ua/Ub selecionados, a barra resolvida está atrás. Em casos reais com outro alinhamento, ajustes U (AUF) podem ser necessários. Essas propriedades foram conferidas mecanicamente, além da consulta às sequências.

## Validação executável

Com dependências do projeto e Chromium do Playwright instalados:

```bash
node --import tsx --test tests/content*.test.ts
# ou npm test, que também inclui os testes das outras áreas
npm run typecheck
```

Os testes de conteúdo exercitam:

- Integridade SHA-256 dos três arquivos fixados e presença da licença MIT.
- A biblioteca real via VM: `createState.nxn`, `applyAlgorithm`, `getInvertedAlgorithm`, `render` e `processAll` no navegador.
- Todos os **6 casos**: inverso + solução retornam exatamente ao estado-base; ordem do setup de exibição coincide também com **cubing/kpuzzle**, independente de CubeIcons.
- OLL: F2L preservado, quatro arestas U orientadas e três cantos não orientados.
- PLL: F2L e orientações preservados; T permuta dois cantos e duas arestas; Ua/Ub permutam três arestas e nenhum canto.
- F2L: cruz branca e três slots não-alvo preservados; apenas o slot frontal direito é retirado.
- React em Chromium real, bundle de teste em memória: dois componentes compartilham uma carga JS/CSS; mudança de algoritmo/categoria/tamanho produz o SVG exato da biblioteca, sem erros de página e sem scramble aleatório.
- Campos institucionais conforme o contrato, sem contatos inventados.

Foram observadas falhas RED antes de adicionar os arquivos vendor, o catálogo, o componente e os defaults; cada fatia passou GREEN após a implementação. A validação mecânica comprova propriedades do estado e correspondência da figura, não substitui uma revisão pedagógica humana nem torna este projeto uma plataforma oficial da WCA.

## Sources

[1] https://lenerdz.github.io/cube-icons/demo.html
[2] https://raw.githubusercontent.com/lenerdz/cube-icons/1d99d5f58f66665acc53b8d4322c95e6e9d7c075/README.md
[3] https://raw.githubusercontent.com/lenerdz/cube-icons/1d99d5f58f66665acc53b8d4322c95e6e9d7c075/LICENSE
[4] https://www.cubeskills.com/uploads/pdf/tutorials/pll-algorithms.pdf
[5] https://www.cubeskills.com/uploads/pdf/tutorials/oll-algorithms.pdf
[6] https://jperm.net/3x3/cfop/f2l
[7] https://www.cubeskills.com/uploads/pdf/tutorials/f2l.pdf
[8] https://jperm.net/algs/pll
[9] https://jperm.net/lib/pll.js
[10] https://raw.githubusercontent.com/lenerdz/cube-icons/1d99d5f58f66665acc53b8d4322c95e6e9d7c075/cube-icons.js
[11] https://raw.githubusercontent.com/lenerdz/cube-icons/1d99d5f58f66665acc53b8d4322c95e6e9d7c075/cube-icons.css
[12] https://raw.githubusercontent.com/lenerdz/cube-icons/1d99d5f58f66665acc53b8d4322c95e6e9d7c075/package.json
