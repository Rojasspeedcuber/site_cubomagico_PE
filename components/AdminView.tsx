"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ClipboardList,
  FilePenLine,
  LockKeyhole,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import ParticipantsAdmin from "./ParticipantsAdmin";
import { useSite } from "./AppShell";
import { api, useApi } from "./api";
import {
  dateLabel,
  formatTime,
  isoDate,
  localDate,
  safeUrl,
} from "./frontend-utils";
import {
  CopyButton,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  Notice,
  PageHeading,
  Status,
} from "./ui";
import { puzzleName } from "./EventsView";
import type { Algorithm, Content, CubeEvent, AdminSubmission, User } from "./types";
export default function AdminView() {
  const { user, sessionLoading, sessionError, refreshSession } = useSite();
  const [tab, setTab] = useState("events");
  if (sessionLoading)
    return (
      <div className="container page-section">
        <Loading label="Verificando permissões…" />
      </div>
    );
  if (sessionError)
    return (
      <div className="container page-section">
        <ErrorBox message={sessionError} retry={refreshSession} />
      </div>
    );
  if (!user || !["ADMIN", "ORGANIZER"].includes(user.role))
    return (
      <div className="container page-section restricted">
        <span className="state-icon">
          <LockKeyhole size={30} />
        </span>
        <h1>Acesso restrito</h1>
        <p>Esta área é exclusiva da equipe de organização e administração.</p>
        <Link className="button primary" href="/conta?next=/admin">
          {user ? "Voltar à minha conta" : "Entrar na conta"}
        </Link>
      </div>
    );
  const tabs = [
    ["events", "Campeonatos"],
    ...(user.role === "ADMIN"
      ? [
          ["algorithms", "Algoritmos"],
          ["content", "Conteúdo do site"],
          ["users", "Usuários"],
          ["audit", "Auditoria"],
        ]
      : []),
  ];
  return (
    <div className="container page-section">
      <PageHeading
        eyebrow={user.role === "ADMIN" ? "Administração" : "Organização"}
        title="Cuidar da comunidade"
        description="Publique conteúdo, organize campeonatos e revise os envios com atenção."
      >
        <span className="badge">
          <ShieldCheck size={15} />
          {user.displayName}
        </span>
      </PageHeading>
      <nav className="admin-tabs" aria-label="Áreas da administração">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "events" ? (
        <AdminEvents />
      ) : tab === "algorithms" ? (
        <AdminAlgorithms />
      ) : tab === "content" ? (
        <AdminContent />
      ) : tab === "users" ? (
        <AdminUsers />
      ) : (
        <AdminAudit />
      )}
    </div>
  );
}
const contentLabels: Record<string, string> = {
  communityName: "Nome da comunidade",
  communityShortName: "Nome curto",
  logoUrl: "URL do logotipo oficial",
  welcome: "Texto de boas-vindas",
  history: "História",
  objectives: "Objetivos",
  meetings: "Encontros e atividades",
  whatsappUrl: "Link do WhatsApp",
  instagramUrl: "Link do Instagram",
  contactEmail: "E-mail de contato",
  communityPhotoUrl: "Foto da comunidade (URL)",
  communityPhotoAlt: "Descrição da foto da comunidade",
  developerBio: "Biografia do desenvolvedor",
  developerPhotoUrl: "Foto do desenvolvedor (URL)",
  portfolioUrl: "Portfólio (URL)",
  githubUrl: "GitHub (URL)",
  linkedinUrl: "LinkedIn (URL)",
  developerContact: "Contato do desenvolvedor (e-mail ou URL)",
};
function AdminContent() {
  const resource = useApi<Content>("/content");
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(false),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      await api("/admin/content", "PATCH", body);
      resource.reload();
      setSuccess(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Conteúdo institucional</h2>
      <p className="muted">
        Publique somente informações confirmadas. Deixe campos sem informação em
        branco. Fotos e logotipo devem usar endereços públicos autorizados.
      </p>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : (
        resource.data && (
          <form onSubmit={submit}>
            <div className="form-grid">
              {Object.entries(contentLabels).map(([key, label]) => (
                <label
                  className={`field ${["history", "objectives", "meetings", "welcome", "developerBio"].includes(key) ? "wide" : ""}`}
                  key={key}
                >
                  <span>{label}</span>
                  {[
                    "history",
                    "objectives",
                    "meetings",
                    "welcome",
                    "developerBio",
                  ].includes(key) ? (
                    <textarea
                      name={key}
                      rows={4}
                      defaultValue={resource.data?.[key] || ""}
                    />
                  ) : (
                    <input
                      name={key}
                      type={
                        key === "contactEmail"
                          ? "email"
                          : key.toLowerCase().includes("url")
                            ? "url"
                            : "text"
                      }
                      defaultValue={resource.data?.[key] || ""}
                    />
                  )}
                </label>
              ))}
            </div>
            {error && <Notice kind="error">{error}</Notice>}
            {success && (
              <Notice kind="success">
                Conteúdo salvo. Recarregue uma página pública para conferir a
                atualização.
              </Notice>
            )}
            <button className="button primary" disabled={busy}>
              <Save size={16} />
              {busy ? "Salvando…" : "Salvar conteúdo"}
            </button>
          </form>
        )
      )}
    </section>
  );
}
function AdminAlgorithms() {
  const resource = useApi<Algorithm[]>("/algorithms");
  const [editing, setEditing] = useState<Algorithm | null | undefined>(
      undefined,
    ),
    [deleting, setDeleting] = useState<Algorithm | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/algorithms/${deleting.id}`, "DELETE");
      setDeleting(null);
      resource.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="section-heading compact">
        <div>
          <h2>Algoritmos</h2>
          <p>
            O acervo é público; cite a fonte e confirme a orientação de cada
            caso.
          </p>
        </div>
        <button className="button primary" onClick={() => setEditing(null)}>
          <Plus size={17} /> Novo algoritmo
        </button>
      </div>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : !resource.data?.length ? (
        <Empty title="Nenhum algoritmo cadastrado" />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Notação</th>
                <th>Revisão</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {resource.data.map((a) => (
                <tr key={a.id}>
                  <th scope="row">{a.name}</th>
                  <td>{a.category}</td>
                  <td>
                    <code>{a.algorithm}</code>
                  </td>
                  <td>{a.validated ? "Revisado" : "Pendente"}</td>
                  <td>
                    <div className="button-row">
                      <button
                        className="button secondary small"
                        onClick={() => setEditing(a)}
                      >
                        Editar<span className="sr-only"> {a.name}</span>
                      </button>
                      <button
                        className="icon-button danger"
                        aria-label={`Excluir ${a.name}`}
                        onClick={() => setDeleting(a)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing !== undefined && (
        <Modal
          title={editing ? "Editar algoritmo" : "Novo algoritmo"}
          onClose={() => setEditing(undefined)}
        >
          <AlgorithmForm
            algorithm={editing}
            onSaved={() => {
              setEditing(undefined);
              resource.reload();
            }}
          />
        </Modal>
      )}
      {deleting && (
        <Modal title="Excluir algoritmo?" onClose={() => setDeleting(null)}>
          <p>
            “{deleting.name}” deixará de aparecer no acervo público. Esta ação
            não pode ser desfeita pela interface.
          </p>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="button-row">
            <button
              className="button secondary"
              onClick={() => setDeleting(null)}
            >
              Cancelar
            </button>
            <button
              className="button danger-button"
              disabled={busy}
              onClick={remove}
            >
              {busy ? "Excluindo…" : "Confirmar exclusão"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
function AlgorithmForm({
  algorithm: a,
  onSaved,
}: {
  algorithm: Algorithm | null;
  onSaved: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError("");
    setBusy(true);
    try {
      await api(
        a ? `/admin/algorithms/${a.id}` : "/admin/algorithms",
        a ? "PATCH" : "POST",
        {
          name: f.get("name"),
          category: f.get("category"),
          algorithm: f.get("algorithm"),
          variations: String(f.get("variations") || "")
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean),
          orientation: f.get("orientation"),
          notes: f.get("notes"),
          sourceUrl: f.get("sourceUrl"),
          sourceName: f.get("sourceName"),
          validated: f.get("validated") === "on",
          method: "CFOP",
          puzzle: "333",
        },
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field">
          <span>Nome do caso</span>
          <input name="name" required defaultValue={a?.name} />
        </label>
        <label className="field">
          <span>Categoria</span>
          <select name="category" defaultValue={a?.category || "F2L"}>
            <option>F2L</option>
            <option>OLL</option>
            <option>PLL</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Algoritmo</span>
        <input
          name="algorithm"
          required
          className="mono"
          defaultValue={a?.algorithm}
        />
      </label>
      <label className="field">
        <span>Variações (uma por linha)</span>
        <textarea
          name="variations"
          rows={3}
          className="mono"
          defaultValue={a?.variations?.join("\n")}
        />
      </label>
      <label className="field">
        <span>Orientação do cubo</span>
        <textarea
          name="orientation"
          rows={2}
          required
          defaultValue={a?.orientation}
        />
      </label>
      <label className="field">
        <span>Observações</span>
        <textarea name="notes" rows={3} defaultValue={a?.notes} />
      </label>
      <div className="form-grid">
        <label className="field">
          <span>Nome da fonte</span>
          <input name="sourceName" defaultValue={a?.sourceName} />
        </label>
        <label className="field">
          <span>URL da fonte</span>
          <input type="url" name="sourceUrl" defaultValue={a?.sourceUrl} />
        </label>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" name="validated" defaultChecked={a?.validated} />
        <span>Algoritmo e orientação revisados</span>
      </label>
      <p className="caption">
        Método CFOP · cubo 3×3. O diagrama é gerado a partir do algoritmo
        informado.
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      <button className="button primary" disabled={busy}>
        {busy ? "Salvando…" : "Salvar algoritmo"}
      </button>
    </form>
  );
}
function AdminEvents() {
  const resource = useApi<CubeEvent[]>("/admin/events");
  const [selected, setSelected] = useState<CubeEvent | null>(null),
    [editing, setEditing] = useState<CubeEvent | null | undefined>(undefined);
  if (selected)
    return (
      <ManageEvent
        eventId={selected.id}
        onBack={() => {
          setSelected(null);
          resource.reload();
        }}
      />
    );
  return (
    <section className="panel">
      <div className="section-heading compact">
        <div>
          <h2>Campeonatos</h2>
          <p>
            Rascunhos não aparecem para o público. Confira regras e prazos antes
            de abrir inscrições.
          </p>
        </div>
        <button className="button primary" onClick={() => setEditing(null)}>
          <Plus size={17} /> Novo campeonato
        </button>
      </div>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : !resource.data?.length ? (
        <Empty title="Nenhum campeonato criado">
          <p>Crie o campeonato e depois adicione as rodadas.</p>
        </Empty>
      ) : (
        <div className="admin-event-list">
          {resource.data.map((event) => (
            <article key={event.id}>
              <div>
                <Status status={event.status} />
                <h3>{event.name}</h3>
                <p className="muted">
                  {event.rounds.length} rodadas · {event.participantCount}{" "}
                  participantes
                </p>
              </div>
              <div className="button-row">
                <button
                  className="button secondary"
                  onClick={() => setEditing(event)}
                >
                  Editar
                </button>
                <button
                  className="button primary"
                  onClick={() => setSelected(event)}
                >
                  Gerenciar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing !== undefined && (
        <Modal
          title={editing ? "Editar campeonato" : "Novo campeonato"}
          onClose={() => setEditing(undefined)}
        >
          <EventForm
            event={editing}
            onSaved={() => {
              setEditing(undefined);
              resource.reload();
            }}
          />
        </Modal>
      )}
    </section>
  );
}
function EventForm({
  event,
  onSaved,
}: {
  event: CubeEvent | null;
  onSaved: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await api(
        event ? `/admin/events/${event.id}` : "/admin/events",
        event ? "PATCH" : "POST",
        {
          name: f.get("name"),
          description: f.get("description"),
          rules: f.get("rules"),
          registrationOpen: isoDate(String(f.get("registrationOpen"))),
          registrationClose: isoDate(String(f.get("registrationClose"))),
          ...(event ? { status: f.get("status") } : {}),
        },
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <label className="field">
        <span>Nome do campeonato</span>
        <input name="name" required defaultValue={event?.name} />
      </label>
      <label className="field">
        <span>Descrição</span>
        <textarea
          name="description"
          required
          rows={3}
          defaultValue={event?.description}
        />
      </label>
      <label className="field">
        <span>Regras</span>
        <textarea name="rules" required rows={5} defaultValue={event?.rules} />
        <small>
          Informe critérios, gravação, ambiente de resolução e revisão.
        </small>
      </label>
      <div className="form-grid">
        <label className="field">
          <span>Início das inscrições</span>
          <input
            type="datetime-local"
            name="registrationOpen"
            required
            defaultValue={localDate(event?.registrationOpen)}
          />
        </label>
        <label className="field">
          <span>Fim das inscrições</span>
          <input
            type="datetime-local"
            name="registrationClose"
            required
            defaultValue={localDate(event?.registrationClose)}
          />
        </label>
      </div>
      {event && (
        <label className="field">
          <span>Situação</span>
          <select name="status" defaultValue={event.status}>
            <option value="DRAFT">Rascunho (privado)</option>
            <option value="OPEN">Inscrições abertas</option>
            <option value="RUNNING">Em andamento</option>
            <option value="CLOSED">Encerrado</option>
          </select>
        </label>
      )}
      <Notice>
        Datas e horários em Pernambuco (UTC−3). Um novo campeonato é criado como
        rascunho.
      </Notice>
      {error && <Notice kind="error">{error}</Notice>}
      <button className="button primary" disabled={busy}>
        {busy ? "Salvando…" : "Salvar campeonato"}
      </button>
    </form>
  );
}
function ManageEvent({
  eventId,
  onBack,
}: {
  eventId: string;
  onBack: () => void;
}) {
  const resource = useApi<CubeEvent>(`/events/${eventId}`),
    submissions = useApi<AdminSubmission[]>(`/admin/events/${eventId}/submissions`);
  const [adding, setAdding] = useState(false),
    [tab, setTab] = useState("rounds"),
    [publishing, setPublishing] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  async function publish(roundId: string) {
    setPublishing(roundId);
    setError("");
    setSuccess("");
    try {
      await api(
        `/admin/events/${eventId}/rounds/${roundId}/publish`,
        "POST",
        {},
      );
      resource.reload();
      setSuccess(
        "Resultados publicados. A classificação já pode ser consultada na página pública.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing("");
    }
  }
  return (
    <>
      <button className="back-link text-button" onClick={onBack}>
        <ArrowLeft size={15} /> Voltar aos campeonatos
      </button>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : (
        resource.data && (
          <>
            <div className="section-heading compact">
              <div>
                <h2>{resource.data.name}</h2>
                <Status status={resource.data.status} />
              </div>
              <Link
                className="button secondary"
                href={`/campeonatos/${eventId}`}
              >
                Ver página pública <ArrowUpRight size={15} />
              </Link>
            </div>
            <div className="chip-row">
              {[
                ["rounds", "Rodadas"],
                ["review", "Revisão de envios"],
                ["participants", "Inscrições e vídeos"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={`chip ${tab === id ? "selected" : ""}`}
                  aria-pressed={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {error && <Notice kind="error">{error}</Notice>}
            {success && <Notice kind="success">{success}</Notice>}
            {tab === "rounds" ? (
              <section className="panel">
                <div className="section-heading compact">
                  <h3>Rodadas do campeonato</h3>
                  <button
                    className="button primary"
                    onClick={() => setAdding(true)}
                  >
                    <Plus size={16} /> Adicionar rodada
                  </button>
                </div>
                {resource.data.rounds.length ? (
                  resource.data.rounds.map((round) => (
                    <article className="admin-round" key={round.id}>
                      <div>
                        <h3>{round.name}</h3>
                        <p>
                          {puzzleName[round.puzzle]} ·{" "}
                          {round.format === "AO5" ? "Ao5" : "Mo3"} · Vídeo{" "}
                          {round.videoRequired ? "obrigatório" : "opcional"}
                        </p>
                        <p className="caption">
                          Abertura: {dateLabel(round.opensAt)}
                          <br />
                          Encerramento: {dateLabel(round.closesAt)}
                        </p>
                      </div>
                      {round.published ? (
                        <span className="badge status-approved">
                          <Check size={14} /> Resultados publicados
                        </span>
                      ) : (
                        <button
                          className="button secondary"
                          disabled={!!publishing}
                          onClick={() => publish(round.id)}
                        >
                          {publishing === round.id
                            ? "Publicando…"
                            : "Publicar resultados"}
                        </button>
                      )}
                    </article>
                  ))
                ) : (
                  <Empty title="Nenhuma rodada cadastrada" />
                )}
                <Notice>
                  Os embaralhamentos são gerados no servidor ao criar a rodada.
                  A publicação só é permitida após o encerramento e a revisão de
                  todos os envios. Rodadas existentes não podem ser alteradas
                  por esta interface.
                </Notice>
              </section>
            ) : tab === "review" ? (
              <section className="panel">
                <h3>Revisão de vídeos e resultados</h3>
                <p className="muted">
                  Abra o vídeo, confira cada tentativa e registre uma observação
                  clara ao rejeitar um envio.
                </p>
                {submissions.loading ? (
                  <Loading />
                ) : submissions.error ? (
                  <ErrorBox
                    message={submissions.error}
                    retry={submissions.reload}
                  />
                ) : !submissions.data?.length ? (
                  <Empty title="Nenhum envio para revisar" />
                ) : (
                  submissions.data.map((s) => (
                    <ReviewSubmission
                      key={`${s.id}:${s.revision}`}
                      submission={s}
                      onSaved={() => {
                        setError("");
                        submissions.reload();
                      }}
                      onError={(message) => {
                        setError(`${message} A lista está sendo atualizada. Confira os tempos e o vídeo antes de revisar novamente.`);
                        submissions.reload();
                      }}
                    />
                  ))
                )}
              </section>
            ) : (
              <section className="panel">
                <h3>Inscrições e solicitações de vídeo</h3>
                <p className="muted">
                  Confira os participantes e envie uma solicitação vinculada à
                  rodada. O participante poderá anexar o vídeo antes do
                  encerramento. Inscrições sem resultados publicados podem ser
                  removidas após confirmação.
                </p>
                {!resource.data.participants?.length ? (
                  <Empty title="Nenhum participante inscrito" />
                ) : (
                  <ParticipantsAdmin
                    event={resource.data}
                    onChanged={resource.reload}
                  />
                )}
              </section>
            )}
            {adding && (
              <Modal title="Adicionar rodada" onClose={() => setAdding(false)}>
                <RoundForm
                  eventId={eventId}
                  onSaved={() => {
                    setAdding(false);
                    resource.reload();
                  }}
                />
              </Modal>
            )}
          </>
        )
      )}
    </>
  );
}
function RoundForm({
  eventId,
  onSaved,
}: {
  eventId: string;
  onSaved: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await api(`/admin/events/${eventId}/rounds`, "POST", {
        name: f.get("name"),
        puzzle: f.get("puzzle"),
        format: f.get("format"),
        opensAt: isoDate(String(f.get("opensAt"))),
        closesAt: isoDate(String(f.get("closesAt"))),
        videoRequired: f.get("videoRequired") === "on",
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <label className="field">
        <span>Nome da rodada</span>
        <input name="name" required placeholder="Ex.: 3×3 — primeira rodada" />
      </label>
      <div className="form-grid">
        <label className="field">
          <span>Modalidade</span>
          <select name="puzzle">
            <option value="333">Cubo 3×3</option>
            <option value="222">Cubo 2×2</option>
            <option value="pyram">Pyraminx</option>
          </select>
        </label>
        <label className="field">
          <span>Formato</span>
          <select name="format">
            <option value="AO5">Ao5 — média de 5</option>
            <option value="MO3">Mo3 — média de 3</option>
          </select>
        </label>
        <label className="field">
          <span>Abertura (Pernambuco)</span>
          <input type="datetime-local" name="opensAt" required />
        </label>
        <label className="field">
          <span>Encerramento (Pernambuco)</span>
          <input type="datetime-local" name="closesAt" required />
        </label>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" name="videoRequired" />
        <span>Exigir vídeo em todos os envios</span>
      </label>
      <Notice>
        Confira as datas antes de criar. A API atual não permite editar ou
        excluir uma rodada.
      </Notice>
      {error && <Notice kind="error">{error}</Notice>}
      <button className="button primary" disabled={busy}>
        {busy ? "Gerando embaralhamentos…" : "Criar rodada"}
      </button>
    </form>
  );
}
function ReviewSubmission({
  submission: s,
  onSaved,
  onError,
}: {
  submission: AdminSubmission;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [note, setNote] = useState(s.reviewNote || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function review(status: "APPROVED" | "REJECTED") {
    setError("");
    if (status === "REJECTED" && !note.trim()) {
      setError("Explique o motivo da rejeição para o participante.");
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/submissions/${s.id}`, "PATCH", {
        status,
        reviewNote: note,
        expectedRevision: s.revision,
      });
      onSaved();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="review-card">
      <div className="section-heading compact">
        <div>
          <h3>{s.displayName}</h3>
          <p className="muted">{s.roundName}</p>
        </div>
        <Status status={s.status} />
      </div>
      <div className="attempt-tags">
        {s.attempts.map((a, i) => (
          <span key={i}>
            <small>{i + 1}</small>
            <code>
              {a.penalty === "DNF"
                ? "DNF"
                : formatTime(
                    (a.timeCs || 0) + (a.penalty === "PLUS2" ? 200 : 0),
                  )}
              {a.penalty === "PLUS2" ? " (+2)" : ""}
            </code>
          </span>
        ))}
      </div>
      {safeUrl(s.videoUrl) ? (
        <a
          className="button secondary small"
          href={safeUrl(s.videoUrl)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir vídeo <ArrowUpRight size={16} />
        </a>
      ) : (
        <p className="caption">Nenhum vídeo informado.</p>
      )}
      <label className="field">
        <span>Observação para o participante</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />
      </label>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="button-row">
        <button
          className="button primary"
          disabled={busy}
          onClick={() => review("APPROVED")}
        >
          Aprovar envio
        </button>
        <button
          className="button danger-button"
          disabled={busy}
          onClick={() => review("REJECTED")}
        >
          Rejeitar com observação
        </button>
      </div>
    </article>
  );
}
function AdminUsers() {
  const resource = useApi<User[]>("/admin/users");
  return (
    <section className="panel">
      <h2>Usuários e permissões</h2>
      <p className="muted">
        Competidores participam dos campeonatos. Organizadores gerenciam os
        próprios eventos. Administradores acessam todo o conteúdo e os usuários.
      </p>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : !resource.data?.length ? (
        <Empty title="Nenhum usuário encontrado" />
      ) : (
        <div className="user-admin-list">
          {resource.data.map((user) => (
            <UserRole
              key={`${user.id}-${user.role}`}
              user={user}
              onSaved={resource.reload}
            />
          ))}
        </div>
      )}
    </section>
  );
}
function UserRole({ user, onSaved }: { user: User; onSaved: () => void }) {
  const [role, setRole] = useState(user.role),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/admin/users/${user.id}`, "PATCH", { role });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="user-admin-row" onSubmit={save}>
      <div>
        <strong>{user.displayName}</strong>
        <small>{user.city || "Cidade não informada"}</small>
      </div>
      <label>
        <span className="sr-only">Permissão de {user.displayName}</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as User["role"])}
        >
          <option value="COMPETITOR">Competidor</option>
          <option value="ORGANIZER">Organizador</option>
          <option value="ADMIN">Administrador</option>
        </select>
      </label>
      <button
        className="button secondary small"
        disabled={busy || role === user.role}
      >
        {busy ? "Salvando…" : "Salvar permissão"}
      </button>
      {error && <Notice kind="error">{error}</Notice>}
    </form>
  );
}
function AdminAudit() {
  const resource = useApi<
    Array<{
      id: string;
      action: string;
      createdAt: string;
      actorId: string;
      [key: string]: unknown;
    }>
  >("/admin/audit");
  return (
    <section className="panel">
      <h2>Registro de auditoria</h2>
      <p className="muted">
        Ações administrativas registradas pelo servidor. Horários de Pernambuco.
      </p>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : !resource.data?.length ? (
        <Empty title="Nenhuma ação registrada" />
      ) : (
        <div className="audit-list">
          {resource.data.map((item) => (
            <details key={item.id}>
              <summary>
                <strong>{item.action}</strong>
                <span>{dateLabel(item.createdAt)}</span>
              </summary>
              <p className="caption">
                Responsável: {item.actorId || "Não identificado"}
              </p>
              <pre>{JSON.stringify(item, null, 2)}</pre>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
