"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Heart,
  Info,
  Search,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import { useApi } from "./api";
import { filterAlgorithms } from "./frontend-utils";
import {
  CopyButton,
  CubeArt,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  Notice,
} from "./ui";
import type { Algorithm } from "./types";
const categories = [
  { key: "ALL", label: "Todos os casos", name: "CFOP" },
  { key: "F2L", label: "F2L", name: "Primeiras duas camadas" },
  { key: "OLL", label: "OLL", name: "Orientação da última camada" },
  { key: "PLL", label: "PLL", name: "Permutação da última camada" },
];
export default function AlgorithmsView() {
  const { data, loading, error, reload } = useApi<Algorithm[]>("/algorithms");
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("ALL"),
    [list, setList] = useState("all"),
    [favorites, setFavorites] = useState<string[]>([]),
    [learned, setLearned] = useState<string[]>([]),
    [storageWarning, setStorageWarning] = useState(""),
    [selected, setSelected] = useState<Algorithm | null>(null),
    [notation, setNotation] = useState(false);
  useEffect(() => {
    try {
      const read = (key: string) => {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value)
          ? value.filter((x) => typeof x === "string")
          : [];
      };
      setFavorites(read("cubo-pe-favorites"));
      setLearned(read("cubo-pe-learned"));
    } catch {
      setStorageWarning(
        "Seu navegador não permite salvar o progresso. As marcações valerão apenas nesta visita.",
      );
    }
  }, []);
  function toggle(id: string, type: "favorites" | "learned") {
    const current = type === "favorites" ? favorites : learned;
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    (type === "favorites" ? setFavorites : setLearned)(next);
    try {
      localStorage.setItem(`cubo-pe-${type}`, JSON.stringify(next));
    } catch {
      setStorageWarning(
        "Não foi possível salvar neste dispositivo. As marcações serão perdidas ao fechar a página.",
      );
    }
  }
  const filtered = useMemo(
    () =>
      filterAlgorithms(data || [], query, category).filter(
        (a) =>
          list === "all" ||
          (list === "favorites" ? favorites : learned).includes(a.id),
      ),
    [data, query, category, list, favorites, learned],
  );
  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">
              <span />
              Cubo mágico em Pernambuco
            </p>
            <h1>
              Aprender faz parte.
              <br />
              <span>Compartilhar também.</span>
            </h1>
            <p>
              Encontre seu próximo algoritmo, participe de campeonatos e faça
              parte da nossa comunidade.
            </p>
            <div className="hero-actions">
              <a href="#acervo" className="button primary">
                Explorar o acervo <ArrowDown size={17} />
              </a>
              <Link href="/campeonatos" className="text-button">
                Ver campeonatos <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="hero-note">
              <span className="mini-tiles" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              Do primeiro giro ao próximo desafio.
            </div>
          </div>
          <CubeArt />
        </div>
      </section>
      <section className="container library-section" id="acervo">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Aprenda no seu ritmo</p>
            <h2>
              Acervo de algoritmos<span className="heading-dot">.</span>
            </h2>
            <p>Observe o caso, entenda os movimentos e pratique.</p>
          </div>
          <button
            className="button secondary"
            onClick={() => setNotation(true)}
          >
            <BookOpen size={17} /> Guia de notação <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="library-layout">
          <aside className="library-sidebar">
            <p className="sidebar-label">
              MÉTODO CFOP <span>3×3</span>
            </p>
            <nav aria-label="Categorias do acervo" className="category-list">
              {categories.map((c) => (
                <button
                  key={c.key}
                  aria-pressed={category === c.key}
                  className={category === c.key ? "selected" : ""}
                  onClick={() => setCategory(c.key)}
                >
                  <span>
                    <strong>{c.label}</strong>
                    {c.key !== "ALL" && <small>{c.name}</small>}
                  </span>
                  <span className="count">
                    {data
                      ? data.filter(
                          (a) => c.key === "ALL" || a.category === c.key,
                        ).length
                      : "–"}
                  </span>
                </button>
              ))}
            </nav>
            <div className="sidebar-divider" />
            <p className="sidebar-label">SEU ESTUDO</p>
            <div className="study-list">
              <label className={list === "favorites" ? "selected" : ""}>
                <input
                  type="checkbox"
                  checked={list === "favorites"}
                  onChange={(e) =>
                    setList(e.target.checked ? "favorites" : "all")
                  }
                  aria-label="Mostrar somente favoritos"
                />
                <Heart size={17} /> Favoritos <span>{favorites.length}</span>
              </label>
              <label className={list === "learned" ? "selected" : ""}>
                <input
                  type="checkbox"
                  checked={list === "learned"}
                  onChange={(e) =>
                    setList(e.target.checked ? "learned" : "all")
                  }
                  aria-label="Mostrar somente aprendidos"
                />
                <CheckCircle2 size={17} /> Aprendidos{" "}
                <span>{learned.length}</span>
              </label>
            </div>
            <div className="local-note">
              <Info size={16} />
              <p>
                Suas marcações ficam apenas neste navegador, não na sua conta.
                Limpar os dados do navegador apaga seu progresso.
              </p>
            </div>
            <div className="beginner-note">
              <span className="eyebrow">Começando no CFOP?</span>
              <h3>Uma etapa de cada vez.</h3>
              <p>
                F2L forma os pares. OLL orienta a última camada. PLL coloca cada
                peça em seu lugar.
              </p>
              <button className="text-button" onClick={() => setNotation(true)}>
                Entender a notação <ArrowRight size={14} />
              </button>
            </div>
          </aside>
          <div className="library-content">
            <div className="search-row">
              <label className="search-field">
                <Search size={19} />
                <span className="sr-only">Buscar algoritmo</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Busque por nome, caso ou movimento…"
                  type="search"
                />
              </label>
            </div>
            <div className="results-bar">
              <span role="status" aria-live="polite">
                {loading
                  ? "Preparando o acervo…"
                  : `${filtered.length} ${filtered.length === 1 ? "algoritmo" : "algoritmos"}`}
                {category !== "ALL" && ` de ${category}`}
              </span>
              <span className="subtle">
                <SlidersHorizontal size={14} />
                {list === "all"
                  ? "Todos os casos"
                  : list === "favorites"
                    ? "Seus favoritos"
                    : "Seus aprendidos"}
              </span>
            </div>
            {storageWarning && <Notice kind="warning">{storageWarning}</Notice>}
            {loading ? (
              <Loading label="Carregando algoritmos…" />
            ) : error ? (
              <ErrorBox message={error} retry={reload} />
            ) : filtered.length === 0 ? (
              <Empty
                title={
                  data?.length
                    ? "Nenhum caso encontrado"
                    : "O acervo está sendo preparado"
                }
              >
                <p>
                  {data?.length
                    ? "Tente outra busca ou remova os filtros."
                    : "Os algoritmos aparecerão aqui quando forem publicados pela equipe."}
                </p>
                {!!data?.length && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      setQuery("");
                      setCategory("ALL");
                      setList("all");
                    }}
                  >
                    Limpar filtros
                  </button>
                )}
              </Empty>
            ) : (
              <div className="algorithm-grid">
                {filtered.map((a) => (
                  <article
                    className={`algorithm-card category-${a.category.toLowerCase()}`}
                    key={a.id}
                  >
                    <div className="algorithm-card-top">
                      <span
                        className={`category-badge ${a.category.toLowerCase()}`}
                      >
                        {a.category}
                      </span>
                      <button
                        className={`icon-button favorite-button ${favorites.includes(a.id) ? "is-favorite" : ""}`}
                        aria-label={`${favorites.includes(a.id) ? "Remover dos" : "Adicionar aos"} favoritos: ${a.name}`}
                        aria-pressed={favorites.includes(a.id)}
                        onClick={() => toggle(a.id, "favorites")}
                      >
                        <Heart
                          size={18}
                          fill={
                            favorites.includes(a.id) ? "currentColor" : "none"
                          }
                        />
                      </button>
                    </div>
                    <button
                      className="diagram-button"
                      onClick={() => setSelected(a)}
                      aria-label={`Ver detalhes de ${a.name}`}
                    >
                      <img
                        src={a.imageUrl}
                        alt={`Caso ${a.name}`}
                        width={128}
                        height={128}
                        loading="lazy"
                        style={{ display: 'block', width: 128, height: 128, objectFit: 'contain' }}
                      />
                    </button>
                    <div className="algorithm-card-body">
                      <h3>
                        <button onClick={() => setSelected(a)}>{a.name}</button>
                      </h3>
                      <p className="algorithm-orientation">
                        {a.orientation ||
                          categories.find((c) => c.key === a.category)?.name}
                      </p>
                      <code className="algorithm-code">{a.algorithm}</code>
                    </div>
                    <div className="algorithm-card-footer">
                      <button
                        className={`learn-button ${learned.includes(a.id) ? "is-learned" : ""}`}
                        aria-pressed={learned.includes(a.id)}
                        aria-label={`${learned.includes(a.id) ? "Marcar para estudar" : "Marcar como aprendido"}: ${a.name}`}
                        onClick={() => toggle(a.id, "learned")}
                      >
                        {learned.includes(a.id) ? (
                          <CheckCircle2 size={16} />
                        ) : (
                          <span className="empty-check" />
                        )}
                        {learned.includes(a.id)
                          ? "Aprendido"
                          : "Marcar aprendido"}
                      </button>
                      <button
                        className="details-button"
                        onClick={() => setSelected(a)}
                        aria-label={`Detalhes de ${a.name}`}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div className="collection-note">
              <Info size={16} />
              <p>Priorize a compreensão, não apenas a memorização.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="container">
        <div className="community-banner">
          <div className="banner-icon">
            <UsersSymbol />
          </div>
          <div>
            <p className="eyebrow">Além dos algoritmos</p>
            <h2>
              O cubo é individual.
              <br />O aprendizado não precisa ser.
            </h2>
            <p>Conheça a comunidade e acompanhe os próximos encontros.</p>
          </div>
          <Link className="button yellow" href="/sobre">
            Conhecer a comunidade <ArrowRight size={17} />
          </Link>
        </div>
      </section>
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <div className="algorithm-detail-diagram">
            <img
              src={selected.imageUrl}
              alt={`Caso ${selected.name}`}
              width={190}
              height={190}
              style={{ display: 'block', width: 190, height: 190, objectFit: 'contain' }}
            />
            <span
              className={`category-badge ${selected.category.toLowerCase()}`}
            >
              {selected.category} · 3×3 · CFOP
            </span>
          </div>
          <h3>Algoritmo principal</h3>
          <div className="detail-code">
            <code>{selected.algorithm}</code>
            <CopyButton text={selected.algorithm} />
          </div>
          <h3>Como posicionar o cubo</h3>
          <p className="prose">
            {selected.orientation ||
              "Observe o diagrama antes de executar os movimentos. A face superior é amarela."}
          </p>
          {selected.variations?.length > 0 && (
            <>
              <h3>Variações</h3>
              {selected.variations.map((v, i) => (
                <div className="detail-code" key={i}>
                  <code>{v}</code>
                  <CopyButton text={v} />
                </div>
              ))}
            </>
          )}
          <div className="button-row">
            <button
              className="button secondary"
              onClick={() => toggle(selected.id, "favorites")}
              aria-pressed={favorites.includes(selected.id)}
            >
              <Heart size={17} />
              {favorites.includes(selected.id)
                ? "Remover favorito"
                : "Favoritar"}
            </button>
            <button
              className="button primary"
              onClick={() => toggle(selected.id, "learned")}
              aria-pressed={learned.includes(selected.id)}
            >
              <Check size={17} />
              {learned.includes(selected.id)
                ? "Marcar para estudar"
                : "Marcar como aprendido"}
            </button>
          </div>
        </Modal>
      )}
      {notation && (
        <Modal title="Guia de notação" onClose={() => setNotation(false)}>
          <p className="prose">
            As letras indicam a face que você deve girar. Olhe diretamente para
            ela para determinar o sentido horário.
          </p>
          <div className="notation-grid">
            {[
              ["R", "Direita"],
              ["L", "Esquerda"],
              ["U", "Superior"],
              ["D", "Inferior"],
              ["F", "Frontal"],
              ["B", "Traseira"],
            ].map(([letter, label]) => (
              <div key={letter}>
                <code>{letter}</code>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <dl className="notation-rules">
            <div>
              <dt>R</dt>
              <dd>Um quarto de volta (90°) no sentido horário.</dd>
            </div>
            <div>
              <dt>R′ ou R'</dt>
              <dd>Um quarto de volta no sentido anti-horário.</dd>
            </div>
            <div>
              <dt>R2</dt>
              <dd>Meia volta (180°).</dd>
            </div>
            <div>
              <dt>r / Rw</dt>
              <dd>Giro largo: face direita e camada adjacente.</dd>
            </div>
            <div>
              <dt>M, E, S</dt>
              <dd>
                Camadas centrais, no sentido de L, D e F, respectivamente.
              </dd>
            </div>
            <div>
              <dt>x, y, z</dt>
              <dd>Rotação do cubo inteiro, no sentido de R, U e F.</dd>
            </div>
          </dl>
          <Notice>
            Execute da esquerda para a direita e preserve a orientação indicada
            no caso. Os parênteses agrupam movimentos; não são uma instrução
            extra.
          </Notice>
        </Modal>
      )}
    </>
  );
}
function UsersSymbol() {
  return (
    <svg
      width="43"
      height="43"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="14" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="28" cy="15" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4 33v-4a10 10 0 0 1 20 0v4M26 24a8 8 0 0 1 10 8"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}
