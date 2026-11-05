"use client";
import {
  ArrowUpRight,
  Code2,
  Mail,
  MapPin,
  MessageCircle,
  Users,
} from "lucide-react";
import { useApi } from "./api";
import { safeUrl, contactHref } from "./frontend-utils";
import { Empty, ErrorBox, Loading, PageHeading } from "./ui";
import type { Content } from "./types";
export default function AboutView() {
  const { data, loading, error, reload } = useApi<Content>("/content");
  return (
    <div className="container page-section">
      <PageHeading
        eyebrow="Feito de pessoas e movimentos"
        title="A comunidade"
        description="Um lugar para quem está descobrindo o cubo e para quem já não sai de casa sem um."
      />
      {loading ? (
        <Loading label="Carregando informações da comunidade…" />
      ) : error ? (
        <ErrorBox message={error} retry={reload} />
      ) : (
        data && (
          <>
            <section className="about-intro panel">
              <div>
                <p className="eyebrow">Pernambuco · Cubo mágico</p>
                <h2>{data.communityName || "Cubo Mágico Pernambuco"}</h2>
                <p className="large-copy prose">
                  {data.welcome ||
                    "Este espaço reúne o acervo de algoritmos e os campeonatos online da comunidade. Você pode começar pelo acervo, sem precisar criar uma conta."}
                </p>
                <div className="button-row">
                  {safeUrl(data.whatsappUrl) && (
                    <a
                      className="button primary"
                      href={safeUrl(data.whatsappUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle size={17} /> WhatsApp{" "}
                      <ArrowUpRight size={15} />
                    </a>
                  )}
                  {safeUrl(data.instagramUrl) && (
                    <a
                      className="button secondary"
                      href={safeUrl(data.instagramUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Instagram <ArrowUpRight size={15} />
                    </a>
                  )}
                  {contactHref(data.contactEmail) && (
                    <a
                      className="text-button"
                      href={contactHref(data.contactEmail)}
                    >
                      <Mail size={16} /> Entrar em contato
                    </a>
                  )}
                </div>
                {!data.whatsappUrl &&
                  !data.instagramUrl &&
                  !data.contactEmail && (
                    <p className="caption">
                      Os canais oficiais serão adicionados pela equipe da
                      comunidade.
                    </p>
                  )}
              </div>
              {safeUrl(data.communityPhotoUrl) ? (
                <img
                  className="community-photo"
                  src={safeUrl(data.communityPhotoUrl)}
                  alt={data.communityPhotoAlt || "Comunidade de cubo mágico"}
                />
              ) : (
                <div className="community-photo-placeholder">
                  <Users size={56} />
                  <span>
                    Este espaço espera
                    <br />
                    uma foto da comunidade.
                  </span>
                </div>
              )}
            </section>
            <div className="about-grid">
              {[
                [
                  "Nossa história",
                  data.history,
                  "A história da comunidade ainda será registrada pela equipe.",
                ],
                [
                  "O que buscamos",
                  data.objectives,
                  "Os objetivos da comunidade serão apresentados aqui pela equipe.",
                ],
                [
                  "Encontros e atividades",
                  data.meetings,
                  "As informações sobre encontros, local e frequência ainda serão publicadas.",
                ],
              ].map(([title, text, placeholder], i) => (
                <section className="panel" key={title}>
                  <span className="about-index">0{i + 1}</span>
                  <h2>{title}</h2>
                  <p className={`prose ${!text ? "muted" : ""}`}>
                    {text || placeholder}
                  </p>
                </section>
              ))}
            </div>
            <section className="developer-section" id="desenvolvedor">
              <div className="developer-portrait">
                {safeUrl(data.developerPhotoUrl) ? (
                  <img
                    src={safeUrl(data.developerPhotoUrl)}
                    alt="Henrique Rojas"
                  />
                ) : (
                  <>
                    <Code2 size={40} />
                    <span>HR</span>
                  </>
                )}
              </div>
              <div>
                <p className="eyebrow">Quem desenvolveu este espaço</p>
                <h2>Henrique Rojas</h2>
                <p className="prose">
                  {data.developerBio ||
                    "Estudante de Ciência da Computação e delegado da WCA. Desenvolvedor deste site para a comunidade de cubo mágico em Pernambuco."}
                </p>
                <div className="developer-links">
                  {[
                    ["Portfólio", data.portfolioUrl],
                    ["GitHub", data.githubUrl],
                    ["LinkedIn", data.linkedinUrl],
                    ["Contato", data.developerContact],
                  ].map(([label, url]) => {
                    const href =
                      label === "Contato" ? contactHref(url) : safeUrl(url);
                    return href ? (
                      <a
                        key={label}
                        href={href}
                        target={
                          href.startsWith("mailto:") ? undefined : "_blank"
                        }
                        rel="noopener noreferrer"
                      >
                        {label}
                        <ArrowUpRight size={15} />
                      </a>
                    ) : null;
                  })}
                </div>
                {!data.portfolioUrl &&
                  !data.githubUrl &&
                  !data.linkedinUrl &&
                  !data.developerContact && (
                    <p className="caption">
                      Links profissionais e contato serão adicionados após
                      confirmação.
                    </p>
                  )}
              </div>
            </section>
          </>
        )
      )}
    </div>
  );
}
