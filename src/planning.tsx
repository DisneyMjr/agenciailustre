import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CalendarDays, Plus, X } from "lucide-react";
import type { User, Entry } from "./types";
import "./planning.css";
type Slot = {
  id: string;
  starts_at: string;
  ends_at: string;
  meeting_id?: string;
};
type Meeting = Slot & {
  name: string;
  email: string;
  notes: string;
  status: string;
};
type Post = {
  id: string;
  client_id: string;
  title: string;
  caption: string;
  channel: string;
  scheduled_at: string;
  asset_url: string;
  status: string;
  version: number;
  review_comment?: string;
};
type Review = {
  decision: string;
  comment: string;
  version: number;
  created_at: string;
};
type Result = {
  slots: Slot[];
  meetings: Meeting[];
  posts: Post[];
  records: Entry[];
  reviews: Review[];
  more: boolean;
};
async function request(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<Result> {
  const res = await fetch("/api" + path, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = (await res.json()) as Result & { error?: string };
  if (!res.ok) throw Error(result.error ?? "Não foi possível concluir.");
  return result;
}
export const brasilia = (s: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(s));
const local = (s: string) =>
  new Date(Date.parse(s) - 3 * 3600000).toISOString().slice(0, 16);
const utc = (s: string) => new Date(s + ":00-03:00").toISOString();
const labels: Record<string, string> = {
  pending: "Aguardando confirmação",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  draft: "Rascunho",
  review: "Em aprovação",
  approved: "Aprovado",
  changes: "Ajustes solicitados",
  published: "Publicado manualmente",
};
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop">
      <section
        className="modal editor planning-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          className="close-modal icon-button"
          aria-label="Fechar"
          onClick={close}
        >
          <X />
        </button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}
export function PublicBooking() {
  const [slots, setSlots] = useState<Slot[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false);
  const load = () =>
    request("/scheduling/slots")
      .then((r) => setSlots(r.slots))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  useEffect(() => {
    void load();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await request("/scheduling/book", "POST", {
        slot_id: d.get("slot"),
        name: d.get("name"),
        email: d.get("email"),
        notes: d.get("notes"),
        consent: d.get("consent") === "on",
      });
      setSent(true);
      form.reset();
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="il-container il-booking"
      id="agendar"
      aria-labelledby="booking-title"
    >
      <div>
        <p className="il-kicker">VAMOS CONVERSAR</p>
        <h2 id="booking-title">
          Reserve uma conversa
          <br />
          <em>com a Ilustre.</em>
        </h2>
        <p>
          Escolha um horário disponível. A equipe confirma os detalhes com você.
          Todos os horários seguem Brasília (UTC−3).
        </p>
      </div>
      <div>
        {sent && (
          <p className="notice" role="status">
            Solicitação recebida! Aguarde o contato da equipe para confirmar sua
            reunião.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">Consultando horários…</p>
        ) : slots.length ? (
          <form className="planning-form" onSubmit={submit}>
            <label>
              Horário disponível
              <select name="slot" required>
                {slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {brasilia(s.starts_at)} ·{" "}
                    {Math.round(
                      (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 60000,
                    )}{" "}
                    min
                  </option>
                ))}
              </select>
            </label>
            <label>
              Seu nome
              <input name="name" autoComplete="name" maxLength={100} required />
            </label>
            <label>
              Seu e-mail
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
              />
            </label>
            <label>
              Sobre a conversa
              <textarea name="notes" maxLength={1500} />
            </label>
            <label className="planning-check">
              <input name="consent" type="checkbox" required />
              Autorizo o uso destes dados para tratar do agendamento.
            </label>
            <button className="il-button" disabled={busy}>
              {busy ? "Enviando…" : "Solicitar reunião"}
            </button>
            <small>
              A solicitação não envia e-mail automático. Você pode também falar
              pelo WhatsApp.
            </small>
          </form>
        ) : (
          <p className="planning-empty">
            Não há horários disponíveis agora. Fale com a equipe pelo formulário
            ou WhatsApp.
          </p>
        )}
      </div>
    </section>
  );
}
export function Meetings({ user }: { user: User }) {
  const staff = user.role !== "client";
  const [slots, setSlots] = useState<Slot[]>([]),
    [meetings, setMeetings] = useState<Meeting[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try {
      const r = await request("/meetings?page=" + page);
      setMeetings(r.meetings);
      setMore(r.more);
      if (staff) setSlots((await request("/meetings/slots")).slots);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [page]);
  async function act(path: string, method: string, data?: unknown) {
    setBusy(true);
    setError("");
    try {
      await request(path, method, data);
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget,
      d = new FormData(f);
    try {
      const start = utc(String(d.get("start"))),
        end = new Date(
          Date.parse(start) + Number(d.get("duration")) * 60000,
        ).toISOString();
      if (
        await act("/meetings/slots", "POST", { starts_at: start, ends_at: end })
      )
        f.reset();
    } catch {
      setError("Verifique a data e o horário.");
    }
  }
  return (
    <section className="planning-view">
      <header className="planning-heading">
        <div>
          <p className="eyebrow">RELACIONAMENTO</p>
          <h1>Agenda de reuniões</h1>
          <p>
            Horários de Brasília (UTC−3). Confirmações e cancelamentos são
            acompanhados aqui.
          </p>
        </div>
        <a className="button outline" href="/#agendar">
          Agendar pelo site
        </a>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {staff && (
        <section className="planning-panel">
          <h2>Disponibilizar horário</h2>
          <form className="planning-slot-form" onSubmit={add}>
            <label>
              Data e hora de início
              <input name="start" type="datetime-local" required />
            </label>
            <label>
              Duração
              <select name="duration">
                <option value="30">30 minutos</option>
                <option value="60">60 minutos</option>
                <option value="90">90 minutos</option>
              </select>
            </label>
            <button className="button dark" disabled={busy}>
              Adicionar horário
            </button>
          </form>
          <p className="planning-help">
            A agenda é única da agência. Horários sobrepostos são bloqueados. O
            site mostra os próximos 100 horários livres; este painel mostra até
            200 horários futuros.
          </p>
          <div className="planning-slot-list">
            {slots.map((s) => (
              <div key={s.id}>
                <span>
                  {brasilia(s.starts_at)} ·{" "}
                  {Math.round(
                    (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 60000,
                  )}{" "}
                  min
                </span>
                {s.meeting_id ? (
                  <span className="badge">Reservado</span>
                ) : (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void act("/meetings/slots/" + s.id, "DELETE", {})
                    }
                  >
                    Retirar horário
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {loading && <p role="status">Atualizando agenda…</p>}
      <h2>{staff ? "Solicitações e reuniões" : "Minhas reuniões"}</h2>
      <div className="planning-list">
        {meetings.map((m) => (
          <article className="planning-panel" key={m.id}>
            <div className="planning-card-heading">
              <h3>{m.name}</h3>
              <span className={"badge status-" + m.status}>
                {labels[m.status]}
              </span>
            </div>
            <p>
              <CalendarDays size={17} /> {brasilia(m.starts_at)} até{" "}
              {brasilia(m.ends_at)}
            </p>
            <p>{m.email}</p>
            {m.notes && <p className="planning-caption">{m.notes}</p>}
            <div className="planning-actions">
              {staff && m.status === "pending" && (
                <button
                  className="button dark"
                  disabled={busy}
                  onClick={() =>
                    void act("/meetings/" + m.id, "PUT", {
                      status: "confirmed",
                    })
                  }
                >
                  Confirmar reunião
                </button>
              )}
              {m.status !== "cancelled" && (
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() =>
                    void act("/meetings/" + m.id, "PUT", {
                      status: "cancelled",
                    })
                  }
                >
                  Cancelar reunião
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!loading && !meetings.length && (
        <p className="planning-empty">
          Nenhuma reunião nesta página.
          {!staff &&
            " Reservas feitas com você conectado aparecem aqui; solicitações anônimas são acompanhadas pela equipe."}
        </p>
      )}
      <Pager page={page} more={more} setPage={setPage} />
    </section>
  );
}
function Pager({
  page,
  more,
  setPage,
}: {
  page: number;
  more: boolean;
  setPage: (n: number) => void;
}) {
  return page > 0 || more ? (
    <div className="planning-actions">
      <button
        className="button outline"
        disabled={!page}
        onClick={() => setPage(page - 1)}
      >
        Anterior
      </button>
      <span>Página {page + 1}</span>
      <button
        className="button outline"
        disabled={!more}
        onClick={() => setPage(page + 1)}
      >
        Próxima
      </button>
    </div>
  ) : null;
}
export function Editorial({ user }: { user: User }) {
  const staff = user.role !== "client";
  const [month, setMonth] = useState(
      local(new Date().toISOString()).slice(0, 7),
    ),
    [day, setDay] = useState(""),
    [posts, setPosts] = useState<Post[]>([]),
    [clients, setClients] = useState<Entry[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [edit, setEdit] = useState<Partial<Post> | null>(null),
    [review, setReview] = useState<Post | null>(null),
    [history, setHistory] = useState<Review[] | null>(null),
    [archive, setArchive] = useState<Post | null>(null);
  async function load() {
    setLoading(true);
    try {
      const r = await request(`/editorial?month=${month}&page=${page}`);
      setPosts(r.posts);
      setMore(r.more);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [month, page]);
  useEffect(() => {
    if (!staff) return;
    let alive = true;
    async function readClients() {
      try {
        let p = 0,
          all: Entry[] = [],
          r;
        do {
          r = await request("/records/clients?page=" + p++);
          all.push(...r.records);
        } while (r.more);
        if (alive) setClients(all);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    }
    void readClients();
    return () => {
      alive = false;
    };
  }, []);
  async function act(path: string, method: string, data?: unknown) {
    setBusy(true);
    setError("");
    try {
      await request(path, method, data);
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const data = {
      client_id: d.get("client"),
      title: d.get("title"),
      caption: d.get("caption"),
      channel: d.get("channel"),
      scheduled_at: utc(String(d.get("at"))),
      asset_url: d.get("asset"),
      version: edit?.version,
    };
    if (
      await act(
        "/editorial" + (edit?.id ? "/" + edit.id : ""),
        edit?.id ? "PUT" : "POST",
        data,
      )
    ) {
      setEdit(null);
      const target = String(d.get("at")).slice(0, 7);
      setMonth(target);
      setPage(0);
      setDay("");
    }
  }
  async function decide(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    if (
      await act("/editorial/" + review?.id + "/approval", "POST", {
        version: review?.version,
        decision: d.get("decision"),
        comment: d.get("comment"),
      })
    )
      setReview(null);
  }
  const days = new Date(
      Number(month.slice(0, 4)),
      Number(month.slice(5)),
      0,
    ).getDate(),
    offset = new Date(month + "-01T12:00:00").getDay();
  const visible = posts.filter(
    (p) => !day || local(p.scheduled_at).slice(0, 10) === day,
  );
  return (
    <section className="planning-view">
      <header className="planning-heading">
        <div>
          <p className="eyebrow">CONTEÚDO & APROVAÇÕES</p>
          <h1>Calendário editorial</h1>
          <p>
            Prepare, revise e aprove. Horários de Brasília (UTC−3). A publicação
            nas redes é manual.
          </p>
        </div>
        {staff && (
          <button
            className="button dark"
            onClick={() => {
              setError("");
              setEdit({ channel: "Instagram" });
            }}
          >
            <Plus size={18} />
            Novo conteúdo
          </button>
        )}
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="planning-toolbar">
        <label>
          Mês do calendário
          <input
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) {
                setMonth(e.target.value);
                setPage(0);
                setDay("");
              }
            }}
          />
        </label>
        <button
          className="text-button"
          onClick={() => {
            setDay("");
            void load();
          }}
        >
          Mostrar todos / atualizar
        </button>
      </div>
      <div
        className="planning-calendar"
        aria-label="Dias do calendário editorial"
      >
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <span key={d}>{d}</span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={"blank" + i} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = month + "-" + String(i + 1).padStart(2, "0"),
            count = posts.filter(
              (p) => local(p.scheduled_at).slice(0, 10) === date,
            ).length;
          return (
            <button
              key={date}
              aria-label={`Dia ${i + 1}${count ? `, ${count} conteúdos nesta página` : ""}`}
              aria-pressed={day === date}
              onClick={() => setDay(day === date ? "" : date)}
            >
              {i + 1}
              {count > 0 && (
                <small>
                  {count}
                  <span> conteúdo{count > 1 ? "s" : ""}</span>
                </small>
              )}
            </button>
          );
        })}
      </div>
      <p className="planning-help">
        O calendário destaca os conteúdos da página atual (até 50 por página).{" "}
        {day && `Filtro: ${day.split("-").reverse().join("/")}.`}
      </p>
      {loading && <p role="status">Atualizando conteúdos…</p>}
      <div className="planning-list">
        {visible.map((p) => (
          <article key={p.id} className="planning-panel editorial-card">
            <div className="planning-card-heading">
              <div>
                <span className="eyebrow">
                  {p.channel} · {brasilia(p.scheduled_at)}
                </span>
                <h2>{p.title}</h2>
              </div>
              <span className={"badge status-" + p.status}>
                {labels[p.status]}
              </span>
            </div>
            {staff && (
              <p className="planning-help">
                {clients.find((c) => c.id === p.client_id)?.data.name ??
                  "Cliente vinculado"}
              </p>
            )}
            <p className="planning-caption">{p.caption || "Sem legenda."}</p>
            {p.asset_url && (
              <a
                className="text-button"
                href={p.asset_url}
                target="_blank"
                rel="noreferrer"
              >
                Abrir material do conteúdo
              </a>
            )}
            {p.review_comment && (
              <blockquote>Último comentário: {p.review_comment}</blockquote>
            )}
            <div className="planning-actions">
              {staff ? (
                <>
                  <button
                    className="button outline"
                    onClick={() => {
                      setError("");
                      setEdit(p);
                    }}
                  >
                    Editar conteúdo
                  </button>
                  {["draft", "changes", "approved"].includes(p.status) && (
                    <button
                      className="button dark"
                      disabled={busy}
                      onClick={() =>
                        void act("/editorial/" + p.id, "PUT", {
                          version: p.version,
                          transition: "review",
                        })
                      }
                    >
                      Enviar para aprovação
                    </button>
                  )}
                  {p.status === "approved" && (
                    <button
                      className="button dark"
                      disabled={busy}
                      onClick={() =>
                        void act("/editorial/" + p.id, "PUT", {
                          version: p.version,
                          transition: "published",
                        })
                      }
                    >
                      Marcar publicado
                    </button>
                  )}
                  <button className="text-button" onClick={() => setArchive(p)}>
                    Arquivar
                  </button>
                </>
              ) : (
                p.status === "review" && (
                  <button
                    className="button dark"
                    onClick={() => {
                      setError("");
                      setReview(p);
                    }}
                  >
                    Revisar conteúdo
                  </button>
                )
              )}
              <button
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  try {
                    setHistory(
                      (await request("/editorial/" + p.id + "/history"))
                        .reviews,
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Histórico de revisões
              </button>
            </div>
          </article>
        ))}
      </div>
      {!loading && !visible.length && (
        <p className="planning-empty">
          Nenhum conteúdo neste período.
          {staff
            ? " Crie o primeiro conteúdo."
            : " A equipe enviará conteúdos para sua aprovação."}
        </p>
      )}
      <Pager
        page={page}
        more={more}
        setPage={(n) => {
          setPage(n);
          setDay("");
        }}
      />
      {edit && (
        <Modal
          title={edit.id ? "Editar conteúdo" : "Novo conteúdo"}
          close={() => !busy && setEdit(null)}
        >
          <form className="planning-form" onSubmit={save}>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <p>
              Salvar cria um rascunho e exige nova aprovação. Arquivos ficam no
              seu serviço de materiais; informe um link HTTPS.
            </p>
            <label>
              Cliente do conteúdo
              <select
                name="client"
                required
                defaultValue={edit.client_id ?? ""}
              >
                <option value="" disabled>
                  Selecione o cliente
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.data.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Título do conteúdo
              <input
                name="title"
                required
                maxLength={160}
                defaultValue={edit.title}
              />
            </label>
            <label>
              Canal
              <select name="channel" defaultValue={edit.channel}>
                {[
                  "Instagram",
                  "Facebook",
                  "LinkedIn",
                  "TikTok",
                  "YouTube",
                  "Outro",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Data e hora planejada
              <input
                name="at"
                type="datetime-local"
                required
                defaultValue={
                  edit.scheduled_at ? local(edit.scheduled_at) : undefined
                }
              />
            </label>
            <label>
              Legenda
              <textarea
                name="caption"
                maxLength={5000}
                rows={6}
                defaultValue={edit.caption}
              />
            </label>
            <label>
              Link do material (opcional)
              <input
                name="asset"
                type="url"
                pattern="https://.*"
                maxLength={1000}
                defaultValue={edit.asset_url}
              />
            </label>
            <button className="button dark" disabled={busy || !clients.length}>
              {busy ? "Salvando…" : "Salvar rascunho"}
            </button>
            {!clients.length && (
              <p>Cadastre um cliente ativo antes de criar conteúdo.</p>
            )}
          </form>
        </Modal>
      )}
      {review && (
        <Modal title="Revisar conteúdo" close={() => !busy && setReview(null)}>
          <h3>{review.title}</h3>
          <p className="planning-caption">{review.caption}</p>
          <form className="planning-form" onSubmit={decide}>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <label>
              Decisão
              <select name="decision">
                <option value="approved">Aprovar conteúdo</option>
                <option value="changes">Solicitar ajustes</option>
              </select>
            </label>
            <label>
              Comentário da revisão
              <textarea name="comment" maxLength={1500} />
            </label>
            <small>Ao solicitar ajustes, descreva o que deve mudar.</small>
            <button className="button dark" disabled={busy}>
              Enviar revisão
            </button>
          </form>
        </Modal>
      )}
      {history && (
        <Modal title="Histórico de revisões" close={() => setHistory(null)}>
          {history.length ? (
            history.map((r, i) => (
              <article key={i}>
                <strong>
                  {labels[r.decision]} · versão {r.version}
                </strong>
                <p>{brasilia(r.created_at.replace(" ", "T") + "Z")}</p>
                <p className="planning-caption">
                  {r.comment || "Sem comentário."}
                </p>
              </article>
            ))
          ) : (
            <p>Ainda não há revisões deste conteúdo.</p>
          )}
        </Modal>
      )}
      {archive && (
        <Modal
          title="Arquivar conteúdo"
          close={() => !busy && setArchive(null)}
        >
          <p>
            O conteúdo deixará o calendário. Seus dados e revisões serão
            preservados na exportação administrativa.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button dark"
            disabled={busy}
            onClick={async () => {
              if (
                await act("/editorial/" + archive.id, "DELETE", {
                  version: archive.version,
                })
              )
                setArchive(null);
            }}
          >
            Confirmar arquivamento
          </button>
        </Modal>
      )}
    </section>
  );
}
