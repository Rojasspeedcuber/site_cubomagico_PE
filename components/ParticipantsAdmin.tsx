"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { api, useApi } from "./api";
import { Empty, ErrorBox, Loading, Modal, Notice } from "./ui";
import type { CubeEvent, Participant } from "./types";
type Enrollment = Participant & { roundIds: string[] };
export default function ParticipantsAdmin({
  event,
  onChanged,
}: {
  event: CubeEvent;
  onChanged: () => void;
}) {
  const resource = useApi<Enrollment[]>(
    `/admin/events/${event.id}/participants`,
  );
  const [participantId, setParticipantId] = useState(""),
    [roundId, setRoundId] = useState(""),
    [removing, setRemoving] = useState<Enrollment | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const participant =
    resource.data?.find((p) => p.id === participantId) || resource.data?.[0];
  const availableRounds = event.rounds.filter((r) =>
    participant?.roundIds.includes(r.id),
  );
  const selectedRound = availableRounds.some((r) => r.id === roundId)
    ? roundId
    : availableRounds[0]?.id || "";
  async function request(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!participant || !selectedRound) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api(
        `/admin/events/${event.id}/participants/${participant.id}/video-request`,
        "POST",
        { roundId: selectedRound, message: f.get("message") },
      );
      resource.reload();
      setSuccess(
        "Solicitação enviada. O participante verá a mensagem ao abrir a rodada.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!removing) return;
    setError("");
    setBusy(true);
    try {
      await api(
        `/admin/events/${event.id}/participants/${removing.id}`,
        "DELETE",
      );
      const check = await api<Enrollment[]>(
        `/admin/events/${event.id}/participants`,
      );
      if (check.some((p) => p.id === removing.id))
        throw new Error(
          "A remoção não foi confirmada. Recarregue a lista e tente novamente.",
        );
      setRemoving(null);
      resource.reload();
      onChanged();
      setSuccess("Inscrição removida.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {resource.loading ? (
        <Loading label="Carregando inscrições…" />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : !resource.data?.length ? (
        <Empty title="Nenhum participante inscrito" />
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <caption className="sr-only">
                Participantes e rodadas de {event.name}
              </caption>
              <thead>
                <tr>
                  <th>Participante</th>
                  <th>Rodadas</th>
                  <th>Cidade / ID WCA</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{p.displayName}</th>
                    <td>
                      {event.rounds
                        .filter((r) => p.roundIds.includes(r.id))
                        .map((r) => r.name)
                        .join(", ") || "—"}
                    </td>
                    <td>
                      {[p.city, p.wcaId].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td>
                      <button
                        className="icon-button danger"
                        aria-label={`Remover inscrição de ${p.displayName}`}
                        onClick={() => {
                          setError("");
                          setRemoving(p);
                        }}
                      >
                        <Trash2 size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="subsection-title">Solicitar um vídeo</h3>
          <form onSubmit={request}>
            <div className="form-grid">
              <label className="field">
                <span>Participante</span>
                <select
                  value={participant?.id || ""}
                  onChange={(e) => {
                    setParticipantId(e.target.value);
                    setRoundId("");
                  }}
                >
                  {resource.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Rodada em que está inscrito</span>
                <select
                  value={selectedRound}
                  onChange={(e) => setRoundId(e.target.value)}
                  required
                >
                  {availableRounds.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Mensagem ao participante</span>
              <textarea
                name="message"
                required
                minLength={1}
                maxLength={5000}
                rows={3}
                placeholder="Informe o que precisa ser mostrado ou conferido no vídeo."
              />
            </label>
            <button
              className="button primary"
              disabled={busy || !selectedRound}
            >
              {busy ? "Enviando…" : "Enviar solicitação"}
            </button>
          </form>
        </>
      )}
      {error && !removing && <Notice kind="error">{error}</Notice>}
      {success && <Notice kind="success">{success}</Notice>}
      {removing && (
        <Modal title="Remover inscrição?" onClose={() => setRemoving(null)}>
          <p>
            A inscrição de <strong>{removing.displayName}</strong> será removida
            deste campeonato, junto com seus envios. Não é possível remover
            participantes com resultados já publicados.
          </p>
          <Notice kind="warning">
            Esta ação não pode ser desfeita pela interface. Confirme com o
            participante antes de continuar.
          </Notice>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="button-row">
            <button
              className="button secondary"
              onClick={() => setRemoving(null)}
            >
              Cancelar
            </button>
            <button
              className="button danger-button"
              disabled={busy}
              onClick={remove}
            >
              {busy ? "Removendo…" : "Confirmar remoção"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
