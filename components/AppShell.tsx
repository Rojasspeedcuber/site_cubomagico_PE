"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Heart,
  Menu,
  Moon,
  Sun,
  Trophy,
  Users,
  X,
  UserRound,
  ShieldCheck,
} from "lucide-react";
import { api, useApi } from "./api";
import { safeUrl } from "./frontend-utils";
import type { Content, User } from "./types";
import { SITE_URL, SUPPORT_EMAIL, OFFICIAL_LOGO_PATH } from "../lib/community-config";
const SiteContext = createContext<{
  user: User | null;
  sessionLoading: boolean;
  sessionError: string;
  refreshSession: () => void;
  content: Content | null;
}>({
  user: null,
  sessionLoading: true,
  sessionError: "",
  refreshSession: () => {},
  content: null,
});
export const useSite = () => useContext(SiteContext);
const links = [
  { href: "/algoritmos", label: "Acervo de algoritmos", icon: BookOpen },
  { href: "/campeonatos", label: "Campeonatos online", icon: Trophy },
  { href: "/sobre", label: "Sobre", icon: Users },
];
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(),
    session = useApi<User>("/session"),
    content = useApi<Content>("/content");
  const [dark, setDark] = useState(false),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    try {
      const value = localStorage.getItem("cubo-pe-theme");
      const next = value
        ? value === "dark"
        : window.matchMedia("(prefers-color-scheme: dark)").matches;
      setDark(next);
      document.documentElement.dataset.theme = next ? "dark" : "light";
    } catch {}
  }, []);
  useEffect(() => {
    setMenu(false);
  }, [pathname]);
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("cubo-pe-theme", next ? "dark" : "light");
    } catch {}
  }
  const name = content.data?.communityName || "Cubo Mágico Pernambuco";
  const configuredLogo = content.data?.logoUrl;
  const logo = configuredLogo === undefined || configuredLogo === `${SITE_URL}${OFFICIAL_LOGO_PATH}`
    ? OFFICIAL_LOGO_PATH : safeUrl(configuredLogo);
  return (
    <SiteContext.Provider
      value={{
        user: session.data,
        sessionLoading: session.loading,
        sessionError: session.error,
        refreshSession: session.reload,
        content: content.data,
      }}
    >
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <div className="regional-stripe" aria-hidden="true" />
      <header className="site-header">
        <div className="container header-inner">
          <Link href="/" className="brand" aria-label={`${name} — início`}>
            {logo ? (
              <img src={logo} alt="" className="brand-logo" />
            ) : (
              <span className="brand-mark" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
            )}
            <span>
              {content.data?.communityShortName || "CUBO PE"}
              <small>Cubo mágico em Pernambuco</small>
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="Navegação principal">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={
                  pathname.startsWith(href) ||
                  (pathname === "/" && href === "/algoritmos")
                    ? "active"
                    : ""
                }
                aria-current={
                  pathname.startsWith(href) ||
                  (pathname === "/" && href === "/algoritmos")
                    ? "page"
                    : undefined
                }
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <button
              className="icon-button"
              onClick={toggleTheme}
              aria-label={dark ? "Ativar tema claro" : "Ativar tema escuro"}
              title={dark ? "Tema claro" : "Tema escuro"}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <Link
              href="/conta"
              className="account-link"
              aria-label={session.data ? "Minha conta" : "Entrar na conta"}
            >
              <UserRound size={17} />
              <span>{session.data ? "Minha conta" : "Entrar"}</span>
            </Link>
            <button
              className="icon-button mobile-toggle"
              aria-label={menu ? "Fechar menu" : "Abrir menu"}
              aria-expanded={menu}
              aria-controls="mobile-menu"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menu && (
          <nav
            id="mobile-menu"
            className="mobile-nav container"
            aria-label="Navegação móvel"
          >
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname.startsWith(href) ? "page" : undefined}
              >
                {label}
                <ChevronRight size={16} />
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main id="conteudo" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <div className="container">
          <div className="footer-top">
            <div>
              <Link href="/" className="footer-brand">
                {name}
                <span className="little-square" />
              </Link>
              <p>
                Um espaço para aprender, praticar e compartilhar
                <br className="desktop-only" /> o cubo mágico em Pernambuco.
              </p>
            </div>
            <div className="footer-links">
              <Link href="/algoritmos">Acervo</Link>
              <Link href="/campeonatos">Campeonatos</Link>
              <Link href="/sobre">A comunidade</Link>
              <Link href="/privacidade">Privacidade e dados</Link>
              <a href={`mailto:${SUPPORT_EMAIL}`}>Suporte</a>
              {session.data &&
                ["ADMIN", "ORGANIZER"].includes(session.data.role) && (
                  <Link href="/admin">
                    <ShieldCheck size={15} /> Administração
                  </Link>
                )}
            </div>
          </div>
          <div className="footer-bottom">
            <span>
              Feito em Pernambuco <Heart size={13} aria-label="com carinho" />
            </span>
            <span>
              Competições online independentes. Não são eventos oficiais da WCA.
            </span>
            <Link href="/sobre#desenvolvedor">
              Por Henrique Rojas <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>
      </footer>
    </SiteContext.Provider>
  );
}
export function SignOut() {
  const { refreshSession } = useSite();
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="button secondary"
        onClick={async () => {
          try {
            await api("/auth/logout", "POST", {});
            refreshSession();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Sair da conta
      </button>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </>
  );
}
