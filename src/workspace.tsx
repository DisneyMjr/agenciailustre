import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Asterisk,
  Plus,
  Users,
  Contact,
  FolderOpen,
  CheckCheck,
  Wallet,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pencil,
  GripVertical,
  Download,
  TrendingUp,
  Clock,
  Check,
} from "lucide-react";
import type { Entry, Kind, Summary, User } from "./types";
const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n / 100,
  );
const readable = (s?: string) =>
  s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "Sem prazo";
export function downloadText(
  name: string,
  text: string,
  type = "text/csv;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Board({
  rows,
  stages,
  kind,
  clients,
  canEdit,
  moving,
  onMove,
  onEdit,
}: {
  rows: Entry[];
  stages: string[];
  kind: Kind;
  clients: Entry[];
  canEdit: boolean;
  moving: string | null;
  onMove: (entry: Entry, status: string) => Promise<void>;
  onEdit: (entry: Entry) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const extra = rows.some((r) => !stages.includes(r.data.status));
  const columns = extra ? [...stages, "Outras etapas"] : stages;
  return (
    <div
      className={"kanban-board " + (kind === "leads" ? "sales-board" : "")}
      role="region"
      aria-label={kind === "leads" ? "Funil de vendas" : "Quadro de trabalho"}
      tabIndex={0}
    >
      {columns.map((stage, index) => {
        const records = rows.filter((r) =>
          stage === "Outras etapas"
            ? !stages.includes(r.data.status)
            : r.data.status === stage,
        );
        return (
          <section
            className={"kanban-column " + (over === stage ? "drag-over" : "")}
            key={stage}
            onDragOver={(e) => {
              if (canEdit && stage !== "Outras etapas") {
                e.preventDefault();
                setOver(stage);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const entry = rows.find(
                (r) =>
                  r.id ===
                  e.dataTransfer.getData("application/x-ilustre-record"),
              );
              if (
                canEdit &&
                entry &&
                stage !== "Outras etapas" &&
                entry.data.status !== stage
              )
                void onMove(entry, stage);
            }}
          >
            <header>
              <span className={"stage-dot tone-" + index} />
              <h2>{stage}</h2>
              <span>{records.length}</span>
            </header>
            {kind === "leads" && (
              <p className="column-value">
                {brl(
                  records.reduce(
                    (sum, r) => sum + (r.data.value_cents ?? 0),
                    0,
                  ),
                )}
                <span>valor estimado</span>
              </p>
            )}
            <div className="kanban-cards">
              {records.map((r) => (
                <article
                  key={r.id}
                  className={
                    "work-card " + (moving === r.id ? "is-saving" : "")
                  }
                  draggable={canEdit && !moving}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/x-ilustre-record",
                      r.id,
                    );
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setOver(null)}
                >
                  <div className="work-card-top">
                    <span className="record-type">
                      {kind === "leads"
                        ? "OPORTUNIDADE"
                        : kind === "projects"
                          ? "PROJETO"
                          : kind === "tasks"
                            ? "TAREFA"
                            : "CAMPANHA"}
                    </span>
                    {canEdit && <GripVertical size={15} aria-hidden="true" />}
                  </div>
                  <h3>{r.data.name}</h3>
                  {r.data.email && (
                    <a className="card-email" href={"mailto:" + r.data.email}>
                      {r.data.email}
                    </a>
                  )}
                  {r.data.notes && (
                    <p className="card-description">{r.data.notes}</p>
                  )}
                  {r.client_id && (
                    <p className="card-client">
                      <Users size={12} />
                      {clients.find((c) => c.id === r.client_id)?.data.name ??
                        "Vinculado ao seu cliente"}
                    </p>
                  )}
                  <div className="card-footer">
                    {kind === "leads" ? (
                      <strong>{brl(r.data.value_cents ?? 0)}</strong>
                    ) : (
                      <span className="card-date">
                        <CalendarDays size={13} />
                        {readable(r.data.due)}
                      </span>
                    )}
                    {canEdit && (
                      <button
                        className="icon-button"
                        aria-label={"Editar " + r.data.name}
                        onClick={() => onEdit(r)}
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                  </div>
                  {canEdit && (
                    <label className="card-stage">
                      <span className="sr-only">Mover {r.data.name} para</span>
                      <select
                        aria-label={"Mover " + r.data.name + " para"}
                        value={r.data.status}
                        disabled={!!moving}
                        onChange={(e) => void onMove(r, e.target.value)}
                      >
                        {!stages.includes(r.data.status) && (
                          <option value={r.data.status}>
                            {r.data.status || "Sem etapa"}
                          </option>
                        )}
                        {stages.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                      {moving === r.id && (
                        <small role="status">Salvando...</small>
                      )}
                    </label>
                  )}
                </article>
              ))}
              {!records.length && (
                <div className="column-empty">
                  <span>—</span>
                  <p>
                    {canEdit
                      ? "Arraste um cartão ou mova pela seleção de etapa."
                      : "Nenhum registro nesta etapa."}
                  </p>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
export function WorkCalendar({
  rows,
  onEdit,
  canEdit,
}: {
  rows: Entry[];
  onEdit: (r: Entry) => void;
  canEdit: boolean;
}) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    return day;
  });
  const iso = (day: Date) =>
    [
      day.getFullYear(),
      String(day.getMonth() + 1).padStart(2, "0"),
      String(day.getDate()).padStart(2, "0"),
    ].join("-");
  return (
    <div className="work-calendar">
      <div className="calendar-heading">
        <h2>
          {month.toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <div>
          <button
            className="button outline compact"
            onClick={() => {
              setMonth(
                new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              );
              setSelected(null);
            }}
          >
            Hoje
          </button>
          <button
            className="icon-button"
            aria-label="Mês anterior"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Próximo mês"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <p className="calendar-note">
        Prazos dos registros desta página. Use a busca e a paginação para
        localizar outros registros.
      </p>
      <div className="calendar-grid">
        {["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((d) => (
          <span className="weekday" key={d}>
            {d}
          </span>
        ))}
        {days.map((day) => {
          const key = iso(day),
            items = rows.filter((r) => r.data.due === key);
          return (
            <div
              key={key}
              className={
                "calendar-day " +
                (day.getMonth() !== month.getMonth() ? "outside " : "") +
                (key === iso(new Date()) ? "today " : "") +
                (key === selected ? "selected" : "")
              }
            >
              <button
                className="day-number"
                aria-label={"Ver prazos de " + readable(key)}
                onClick={() => setSelected(key)}
              >
                {day.getDate()}
              </button>
              {items.slice(0, 2).map((r) => (
                <button
                  className="calendar-event"
                  key={r.id}
                  disabled={!canEdit}
                  onClick={() => onEdit(r)}
                  title={r.data.name}
                >
                  {r.data.name}
                </button>
              ))}
              {items.length > 2 && (
                <button
                  className="more-events"
                  onClick={() => setSelected(key)}
                >
                  +{items.length - 2}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {selected && (
        <section className="calendar-selection">
          <h3>{readable(selected)}</h3>
          {rows.filter((r) => r.data.due === selected).length ? (
            rows
              .filter((r) => r.data.due === selected)
              .map((r) => (
                <div key={r.id}>
                  <span>{r.data.name}</span>
                  <span className="badge">{r.data.status}</span>
                  {canEdit && (
                    <button className="text-button" onClick={() => onEdit(r)}>
                      Abrir <ArrowUpRight size={14} />
                    </button>
                  )}
                </div>
              ))
          ) : (
            <p>Nenhum prazo cadastrado para esse dia nesta página.</p>
          )}
        </section>
      )}
    </div>
  );
}
export function FinanceInsights({ summary }: { summary: Summary | null }) {
  const f = summary?.finances;
  return (
    <div className="finance-insights">
      {[
        {
          label: "Receitas pagas",
          value: f?.incomePaid,
          icon: TrendingUp,
          tone: "positive",
        },
        {
          label: "Despesas pagas",
          value: f?.expensePaid,
          icon: Wallet,
          tone: "neutral",
        },
        {
          label: "A receber",
          value: f?.incomePending,
          icon: Clock,
          tone: "neutral",
        },
        {
          label: "Resultado registrado",
          value: f ? f.incomePaid - f.expensePaid : undefined,
          icon: CheckCheck,
          tone: "positive",
        },
      ].map((item) => (
        <article className={"finance-stat " + item.tone} key={item.label}>
          <span>
            {item.label}
            <item.icon size={17} />
          </span>
          <strong>{item.value === undefined ? "—" : brl(item.value)}</strong>
          <small>
            {item.label === "Resultado registrado"
              ? "Receitas pagas menos despesas pagas"
              : "Conforme os lançamentos internos"}
          </small>
        </article>
      ))}
    </div>
  );
}
export function MonthlyReport({ summary }: { summary: Summary | null }) {
  const months = summary?.monthly ?? [];
  const max = Math.max(
    1,
    ...months.flatMap((m) => [m.incomePaid, m.expensePaid]),
  );
  const exportCsv = () => {
    const number = (v: number) => (v / 100).toFixed(2).replace(".", ",");
    const lines = [
      [
        "Mês",
        "Receitas pagas",
        "Despesas pagas",
        "A receber",
        "A pagar",
        "Resultado",
      ],
      ...months.map((m) => [
        m.month,
        number(m.incomePaid),
        number(m.expensePaid),
        number(m.incomePending),
        number(m.expensePending),
        number(m.incomePaid - m.expensePaid),
      ]),
    ];
    downloadText(
      "ilustre-relatorio-mensal.csv",
      "\ufeff" +
        lines
          .map((row) =>
            row.map((cell) => '"' + cell.replaceAll('"', '""') + '"').join(";"),
          )
          .join("\r\n"),
    );
  };
  return (
    <section className="panel monthly-report">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">LEITURA DA OPERAÇÃO</p>
          <h2>Receitas e despesas</h2>
        </div>
        <button
          className="text-button"
          onClick={exportCsv}
          disabled={!months.length}
        >
          <Download size={15} />
          Exportar CSV
        </button>
      </div>
      <div className="report-legend">
        <span>
          <i className="income-key" />
          Receitas pagas
        </span>
        <span>
          <i className="expense-key" />
          Despesas pagas
        </span>
        <small>Últimos 12 meses, por vencimento ou data de cadastro</small>
      </div>
      {months.length ? (
        <>
          <div
            className="monthly-chart"
            role="img"
            aria-label="Comparação mensal de receitas e despesas pagas. Os valores exatos estão na tabela abaixo."
          >
            {months.map((m) => (
              <div className="month-column" key={m.month}>
                <div className="month-bars">
                  <div
                    className="income-bar"
                    style={{ height: (m.incomePaid / max) * 110 + "px" }}
                    title={brl(m.incomePaid)}
                  />
                  <div
                    className="expense-bar"
                    style={{ height: (m.expensePaid / max) * 110 + "px" }}
                    title={brl(m.expensePaid)}
                  />
                </div>
                <span>
                  {new Date(m.month + "-15T12:00:00").toLocaleDateString(
                    "pt-BR",
                    { month: "short", year: "2-digit" },
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>Receitas pagas</th>
                  <th>Despesas pagas</th>
                  <th>A receber</th>
                  <th>A pagar</th>
                  <th>Resultado registrado</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month.split("-").reverse().join("/")}</td>
                    <td>{brl(m.incomePaid)}</td>
                    <td>{brl(m.expensePaid)}</td>
                    <td>{brl(m.incomePending)}</td>
                    <td>{brl(m.expensePending)}</td>
                    <td>{brl(m.incomePaid - m.expensePaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="empty">
          <Wallet size={30} />
          <h3>Uma visão mais clara começa com os lançamentos.</h3>
          <p>
            Os valores reais aparecerão aqui quando você cadastrar receitas e
            despesas.
          </p>
        </div>
      )}
    </section>
  );
}
type Request = (
  path: string,
) => Promise<{ summary: Summary; records: Entry[] }>;
export function WorkspaceOverview({
  user,
  revision,
  navigate,
  onCreate,
  request,
}: {
  user: User;
  revision: number;
  navigate: (kind: Kind) => void;
  onCreate: (kind: Kind) => void;
  request: Request;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [projects, setProjects] = useState<Entry[]>([]);
  const [tasks, setTasks] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let valid = true;
    setError("");
    Promise.all([
      request("/summary"),
      request("/records/projects"),
      request("/records/tasks"),
    ])
      .then(([s, p, t]) => {
        if (valid) {
          setSummary(s.summary);
          setProjects(p.records);
          setTasks(t.records);
        }
      })
      .catch((e) => valid && setError(e.message));
    return () => {
      valid = false;
    };
  }, [revision, request]);
  const total = Object.values(summary?.counts ?? {}).reduce(
    (sum, n) => sum + (n ?? 0),
    0,
  );
  const waiting = tasks
    .filter((r) => r.data.status !== "Concluída")
    .sort((a, b) => (a.data.due || "9999").localeCompare(b.data.due || "9999"))
    .slice(0, 5);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            PAINEL DA {user.role === "client" ? "SUA MARCA" : "OPERAÇÃO"}
          </p>
          <h1>
            Olá, {user.name.split(" ")[0]}
            <span className="greeting-star">✳</span>
          </h1>
          <p>
            {user.role === "client"
              ? "Acompanhe o que estamos construindo juntos."
              : "Seu trabalho, suas conexões e os próximos passos — em um só lugar."}
          </p>
        </div>
        {user.role !== "client" && (
          <button className="button dark" onClick={() => onCreate("projects")}>
            <Plus size={17} />
            Novo projeto
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="workspace-welcome">
        <div>
          <span className="live-label">
            <i />
            ESPAÇO ILUSTRE
          </span>
          <h2>
            Boas ideias merecem
            <br />
            uma operação em <em>sintonia.</em>
          </h2>
          <p>
            Da primeira conversa à entrega. Organize o presente e deixe o
            próximo passo à vista.
          </p>
        </div>
        <div className="welcome-stamp">
          <Asterisk />
          <span>
            MENOS RUÍDO.
            <br />
            MAIS CLAREZA.
          </span>
        </div>
      </div>
      <div className="metric-grid overview-metrics">
        {[
          {
            kind: "projects" as Kind,
            label: "Projetos em aberto",
            value: summary?.openProjects,
            icon: FolderOpen,
            detail: "Projetos ainda não concluídos",
          },
          {
            kind: "tasks" as Kind,
            label: "Tarefas para acompanhar",
            value: summary?.openTasks,
            icon: CheckCheck,
            detail: summary?.overdueTasks
              ? `${summary.overdueTasks} com prazo vencido`
              : "Prazos e entregas em movimento",
          },
          {
            kind: (user.role === "client" ? "finance" : "leads") as Kind,
            label:
              user.role === "client"
                ? "Lançamentos pendentes"
                : "Novas oportunidades",
            value:
              user.role === "client"
                ? summary?.finances.pendingCount
                : summary?.newLeads,
            icon: user.role === "client" ? Wallet : Contact,
            detail:
              user.role === "client"
                ? "Vinculados à sua marca"
                : "Contatos na primeira etapa do funil",
          },
          {
            kind: (user.role === "client" ? "projects" : "clients") as Kind,
            label:
              user.role === "client" ? "Seus projetos" : "Clientes na casa",
            value:
              summary?.counts[
                user.role === "client" ? "projects" : "clients"
              ] ?? (summary ? 0 : undefined),
            icon: Users,
            detail: "Total de registros ativos",
          },
        ].map((m) => (
          <button
            className="metric"
            key={m.label}
            onClick={() => navigate(m.kind)}
          >
            <span>
              {m.label}
              <m.icon size={19} />
            </span>
            <strong>{m.value ?? "—"}</strong>
            <small>
              {m.detail}
              <ArrowUpRight size={14} />
            </small>
          </button>
        ))}
      </div>
      {summary && total === 0 && user.role !== "client" && (
        <section className="getting-started">
          <div>
            <span className="eyebrow">FAÇA SEU ESPAÇO ACONTECER</span>
            <h2>Vamos começar pelo essencial?</h2>
            <p>
              Seus indicadores serão preenchidos com os registros da sua
              agência.
            </p>
          </div>
          <div className="start-actions">
            {[
              {
                kind: "clients" as Kind,
                label: "Cadastrar meu primeiro cliente",
                icon: Users,
              },
              {
                kind: "leads" as Kind,
                label: "Adicionar uma oportunidade",
                icon: Contact,
              },
              {
                kind: "projects" as Kind,
                label: "Planejar meu primeiro projeto",
                icon: FolderOpen,
              },
            ].map((a, i) => (
              <button key={a.kind} onClick={() => onCreate(a.kind)}>
                <span className="start-number">0{i + 1}</span>
                <a.icon size={18} />
                <strong>{a.label}</strong>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="overview-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">DO PLANO À ENTREGA</p>
              <h2>Projetos em movimento</h2>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("projects")}
            >
              Ver quadro <ArrowUpRight size={16} />
            </button>
          </div>
          {projects.length ? (
            projects.slice(0, 5).map((r) => (
              <button
                className="overview-record"
                key={r.id}
                onClick={() => navigate("projects")}
              >
                <span className="record-symbol">
                  <FolderOpen size={18} />
                </span>
                <span>
                  <strong>{r.data.name}</strong>
                  <small>{readable(r.data.due)}</small>
                </span>
                <span className="badge">{r.data.status || "Sem etapa"}</span>
              </button>
            ))
          ) : (
            <div className="empty">
              <FolderOpen size={30} />
              <h3>Espaço para o próximo projeto.</h3>
              <p>
                {user.role === "client"
                  ? "Os projetos vinculados à sua marca aparecerão aqui."
                  : "Cadastre uma entrega, defina a etapa e acompanhe o caminho."}
              </p>
              {user.role !== "client" && (
                <button
                  className="text-button"
                  onClick={() => onCreate("projects")}
                >
                  Criar projeto <Plus size={14} />
                </button>
              )}
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PRÓXIMOS PASSOS</p>
              <h2>Na sua agenda</h2>
            </div>
            <button className="text-button" onClick={() => navigate("tasks")}>
              Ver tarefas <ArrowUpRight size={16} />
            </button>
          </div>
          {waiting.length ? (
            waiting.map((r) => (
              <button
                className="task-line"
                key={r.id}
                onClick={() => navigate("tasks")}
              >
                <span className="task-circle" />
                <div>
                  <strong>{r.data.name}</strong>
                  <small>{readable(r.data.due)}</small>
                </div>
                <span className="badge">{r.data.status}</span>
              </button>
            ))
          ) : (
            <div className="empty">
              <CalendarDays size={30} />
              <h3>Uma agenda com espaço.</h3>
              <p>As próximas tarefas e seus prazos aparecerão por aqui.</p>
              {user.role !== "client" && (
                <button
                  className="text-button"
                  onClick={() => onCreate("tasks")}
                >
                  Adicionar tarefa <Plus size={14} />
                </button>
              )}
            </div>
          )}
        </section>
      </div>
      {summary && user.role !== "client" && (
        <section className="pipeline-summary panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">CONEXÕES QUE PODEM CRESCER</p>
              <h2>Seu funil comercial</h2>
            </div>
            <button className="text-button" onClick={() => navigate("leads")}>
              Abrir CRM <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="pipeline-snapshot">
            <div>
              <span>Valor estimado em negociação</span>
              <strong>{brl(summary.pipelineValue)}</strong>
              <small>Oportunidades abertas, sem contar receitas</small>
            </div>
            {[
              "Novo contato",
              "Em conversa",
              "Proposta enviada",
              "Conquistado",
            ].map((status, i) => {
              const item = summary.pipeline.find((p) => p.status === status);
              return (
                <button key={status} onClick={() => navigate("leads")}>
                  <i className={"stage-dot tone-" + i} />
                  <span>{status}</span>
                  <strong>{item?.count ?? 0}</strong>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
export function ReportsView({ request }: { request: Request }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    request("/summary")
      .then((r) => setSummary(r.summary))
      .catch((e) => setError(e.message));
  }, [request]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">DECISÕES COM MAIS CONTEXTO</p>
          <h1>Relatórios</h1>
          <p>
            Indicadores dos registros ativos, respeitando as permissões do seu
            acesso.
          </p>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <FinanceInsights summary={summary} />
      <MonthlyReport summary={summary} />
      <p className="subtle-note">
        Controle interno da agência. Os indicadores não representam conciliação
        bancária ou apuração fiscal.
      </p>
    </>
  );
}
