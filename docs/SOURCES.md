# Fontes, licenças e validação do acervo

## Escopo editorial

Seleção curada de **9 casos**, não um catálogo completo: três casos F2L; Sune e Anti-Sune; PLL T, Jb, Ua e Ub. Os nomes são descritivos; os IDs são slugs internos, não uma numeração oficial de casos. Não declaramos cobertura dos 57 OLL nem dos 21 PLL. As sequências abaixo foram consultadas nos materiais públicos de CubeSkills, de Feliks Zemdegs e Andy Klise.[4][5][7]

| ID interno | Sequência de solução | Fonte e localização |
| --- | --- | --- |
| `f2l-insercao-direita` | `R U R'` | CubeSkills, F2L Algorithms, “Basic Inserts”.[7] |
| `f2l-insercao-ajuste-u` | `U R U' R'` | CubeSkills, F2L Algorithms, página 1, “Basic Inserts”: `U (R U' R')`.[7] |
| `f2l-aresta-no-slot` | `U R U R' U2 R U R'` | CubeSkills, F2L Algorithms, página 2, “Edge in Place, Corner in U face”: `U (R U R') U2 (R U R')`.[7] |
| `oll-sune` | `R U R' U R U2 R'` | CubeSkills, OLL Algorithms, “All Edges Oriented Correctly”. A fonte escreve `U2'`, equivalente a `U2`.[5] |
| `oll-anti-sune` | `R U2 R' U' R U' R'` | CubeSkills, OLL Algorithms, “All Edges Oriented Correctly”.[5] |
| `pll-t` | `R U R' U' R' F R2 U' R' U' R U R' F'` | CubeSkills, PLL Algorithms, caso T.[4] |
| `pll-jb` | `R U R' F' R U R' U' R' F R2 U' R' U'` | CubeSkills, PLL Algorithms, página 2, “Swap One Set of Adjacent Corners”, Jb. O ajuste `[U']` da fonte está incluído como último movimento.[4] |
| `pll-ua` | `R U' R U R U R U' R' U' R2` | CubeSkills, PLL Algorithms, Ua; nome/sequência também conferidos nos dados públicos do treinador J Perm.[4][9] |
| `pll-ub` | `R2 U R U R' U' R' U' R' U R'` | CubeSkills, PLL Algorithms, Ub; nome/sequência também conferidos nos dados públicos do treinador J Perm.[4][9] |

Consulta auxiliar: as páginas de F2L e do treinador PLL de J Perm também foram abertas; as sequências principais do acervo vêm dos PDFs atribuídos na tabela, e os dados do treinador servem de conferência adicional para Ua/Ub.[6][8][9]

Os parênteses de agrupamento das fontes foram removidos sem alterar movimentos. Não cadastramos alternativas sem validar a equivalência exata com o mesmo estado inicial; `variations` começa vazio. Os textos explicativos em português são originais deste projeto. PDFs, capturas, diagramas e prosa das fontes **não foram redistribuídos**. Nenhuma licença aberta de reutilização foi identificada nos PDFs consultados; o acesso público não é tratado como concessão de licença. Deles registramos apenas as sequências notacionais referenciadas e atribuição.[4][5][7]

### Ampliação editorial verificada

Os três casos adicionais foram selecionados e transcritos manualmente, sem importação automática de catálogo. Em **6 de novembro de 2026 (UTC)**, os três PDFs foram obtidos novamente por HTTPS; o texto foi extraído localmente com `pypdf` para conferir as sequências e suas localizações. Os acréscimos vêm dos PDFs de F2L e PLL, nas localizações registradas na tabela acima. O PDF de PLL explica que os movimentos entre colchetes são ajustes de U necessários para completar os estados da fonte; por isso o Jb inclui seu `U'` final.[4][7]

A inserção com ajuste U permite comparar dois alinhamentos de pares já formados. O outro F2L acrescenta uma situação com a aresta já no slot e o canto em U. Jb acrescenta uma troca de arestas adjacentes. Essas propriedades e a orientação descrita no catálogo são verificadas nos testes mecânicos; não dependem de supor que qualquer figura semelhante é o mesmo caso.

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

A figura é um **representante exato** de cada algoritmo, não todas as permutações possíveis de uma orientação OLL. Os dois casos de inserção básica F2L mostram pares já preparados; no caso com ajuste U, o U inicial pertence à sequência. O caso com aresta no slot mostra o canto em U no alinhamento exato que a sequência resolve. Nos PLL Ua/Ub selecionados, a barra resolvida está atrás; no Jb, está à esquerda (L). O ajuste `U'` final do Jb já está incluído. Em casos reais com outro alinhamento, ajustes U (AUF) podem ser necessários. Essas propriedades foram conferidas mecanicamente, além da consulta às sequências.

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
- Os casos têm setup por inverso e solução com retorno exato ao estado-base; a ordem do setup de exibição é conferida também com **cubing/kpuzzle**, independente de CubeIcons.
- `tests/content-expanded.test.ts`: os **3 acréscimos** são exercitados com CubeIcons real e cubing/kpuzzle; os SVGs têm 27 adesivos e coincidem entre renderização inversa e setup explícito.
- OLL: F2L preservado; Sune/Anti-Sune têm quatro arestas U orientadas e três cantos não orientados.
- PLL: F2L e orientações preservados; T e Jb permutam dois cantos e duas arestas; Ua/Ub permutam três arestas e nenhum canto. O teste do Jb também rejeita a solução sem o ajuste final.
- F2L: cruz branca e três slots não-alvo preservados; apenas o slot frontal direito é retirado.
- React em Chromium real, bundle de teste em memória: dois componentes compartilham uma carga JS/CSS; mudança de algoritmo/categoria/tamanho produz o SVG exato da biblioteca, sem erros de página e sem scramble aleatório.
- Campos institucionais conforme o contrato, sem contatos inventados.

Foram observadas falhas RED antes de adicionar os arquivos vendor, o catálogo, o componente e os defaults; cada fatia passou GREEN após a implementação. Na ampliação, cada novo caso teve seu próprio ciclo RED (ID ausente) → GREEN, antes de iniciar o próximo. Os três testes novos passaram; o teste React existente também passou em Chromium. A validação mecânica comprova propriedades do estado e correspondência da figura, não substitui uma revisão pedagógica humana nem torna este projeto uma plataforma oficial da WCA.

**Integração dos testes originais:** `tests/content-catalog.test.ts` ainda fixa seis itens e a distribuição de categorias anterior. O catálogo agora tem **9 casos: 3 F2L, 2 OLL e 4 PLL**. Atualizar o total da linha 25 e a lista ordenada da linha 27. Nas linhas 52–53, tratar Jb como T: ambos movem **2 arestas e 2 cantos**; Ua/Ub continuam com **3 arestas e 0 cantos**. As expectativas de orientação OLL permanecem válidas, pois não foram adicionados novos OLL. O arquivo original não foi alterado pelo worker editorial, conforme a divisão de propriedade. O responsável pela integração deve atualizar essas expectativas antes de exigir a suíte completa verde.

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
