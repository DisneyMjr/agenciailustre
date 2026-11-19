import {
  useState,
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { FileText, Plus, X, Download, Check, PenLine } from "lucide-react";
import type { User } from "./types";
import type { Evidence } from "./pdf-tools";
import "./documents.css";
type Doc = {
  id: string;
  title: string;
  client_id: string;
  recipient_id: string;
  recipient_name: string;
  recipient_email: string;
  pdf_sha256: string;
  pdf_size: number;
  status: string;
  version: number;
  created_at: string;
  sent_at: string | null;
  signed_at: string | null;
};
type Recipient = {
  id: string;
  name: string;
  email: string;
  client_id: string;
  client_name: string;
};
type Event = {
  action: string;
  version: number;
  detail: string;
  created_at: string;
};
type Result = {
  documents: Doc[];
  more: boolean;
  recipients: Recipient[];
  document: Doc;
  events: Event[];
  consent: string;
  valid: boolean;
  manifest_sha256?: string;
};
const labels: Record<string, string> = {
  draft: "Rascunho",
  sent: "Aguardando assinatura",
  signed: "Assinado",
  declined: "Recusado",
  void: "Envio cancelado",
  created: "Criado",
  updated: "Rascunho atualizado",
  viewed: "Visualizado",
  archived: "Arquivado",
};
async function request(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<Result> {
  const res = await fetch("/api/documents" + path, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = (await res.json()) as Result & { error?: string };
  if (!res.ok) throw Error(result.error ?? "Não foi possível concluir.");
  return result;
}
const date = (s: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z"));
function Dialog({
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
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal editor document-dialog"
      >
        <button
          className="icon-button close-modal"
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
function Preview({ bytes, ready }: { bytes: Uint8Array; ready: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    setLoading(true);
    setError("");
    async function render() {
      try {
        const { openPdf } = await import("./pdf-tools"),
          pdf = await openPdf(bytes);
        if (cancelled) {
          await pdf.destroy();
          return;
        }
        setTotal(pdf.numPages);
        const p = await pdf.getPage(page),
          viewport = p.getViewport({
            scale: Math.min(1.6, 1200 / p.getViewport({ scale: 1 }).width),
          }),
          c = canvas.current!;
        c.width = Math.ceil(viewport.width);
        c.height = Math.ceil(viewport.height);
        const task = p.render({ canvas: c, viewport });
        dispose = () => {
          task.cancel();
          void pdf.destroy();
        };
        await task.promise;
        if (!cancelled) {
          setLoading(false);
          ready();
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            "Não foi possível exibir o PDF. Não assine sem conseguir conferir seu conteúdo.",
          );
          setLoading(false);
        }
      }
    }
    void render();
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [bytes, page]);
  return (
    <section className="document-preview" aria-label="Visualização do PDF">
      <div className="document-page-controls">
        <button
          className="button outline"
          disabled={page <= 1 || loading}
          onClick={() => setPage(page - 1)}
        >
          Página anterior
        </button>
        <span>
          Página {page} de {total || "…"}
        </span>
        <button
          className="button outline"
          disabled={page >= total || loading}
          onClick={() => setPage(page + 1)}
        >
          Próxima página
        </button>
      </div>
      {loading && <p role="status">Carregando página…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <canvas
        ref={canvas}
        aria-label={"Página " + page + " do documento PDF"}
      />
    </section>
  );
}
function Signature({
  drawing,
  setDrawing,
}: {
  drawing: string;
  setDrawing: (s: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    drawingNow = useRef(false);
  return (
    <div className="document-drawing">
      <p>Desenhe sua assinatura no espaço abaixo usando o mouse ou o dedo.</p>
      <canvas
        ref={canvas}
        width={900}
        height={230}
        aria-label="Espaço para desenhar assinatura"
        onPointerDown={(e) => {
          const c = e.currentTarget,
            r = c.getBoundingClientRect(),
            ctx = c.getContext("2d")!;
          c.setPointerCapture(e.pointerId);
          ctx.beginPath();
          ctx.moveTo(
            ((e.clientX - r.left) * c.width) / r.width,
            ((e.clientY - r.top) * c.height) / r.height,
          );
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#32164c";
          ctx.lineCap = "round";
          drawingNow.current = true;
        }}
        onPointerMove={(e) => {
          if (!drawingNow.current) return;
          const c = e.currentTarget,
            r = c.getBoundingClientRect(),
            ctx = c.getContext("2d")!;
          ctx.lineTo(
            ((e.clientX - r.left) * c.width) / r.width,
            ((e.clientY - r.top) * c.height) / r.height,
          );
          ctx.stroke();
          setDrawing(c.toDataURL("image/png").split(",")[1]);
        }}
        onPointerUp={() => (drawingNow.current = false)}
        onPointerCancel={() => (drawingNow.current = false)}
      />
      <button
        type="button"
        className="text-button"
        onClick={() => {
          canvas.current?.getContext("2d")?.clearRect(0, 0, 900, 230);
          setDrawing("");
        }}
      >
        Limpar assinatura
      </button>
      {drawing && (
        <small>Traço registrado. Confirme seu nome e sua senha abaixo.</small>
      )}
    </div>
  );
}
export default function Documents({ user }: { user: User }) {
  const staff = user.role !== "client";
  const [docs, setDocs] = useState<Doc[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [recipients, setRecipients] = useState<Recipient[]>([]),
    [editor, setEditor] = useState<Partial<Doc> | null>(null),
    [open, setOpen] = useState<Result | null>(null),
    [bytes, setBytes] = useState<Uint8Array | null>(null),
    [ready, setReady] = useState(false),
    [method, setMethod] = useState("typed"),
    [drawing, setDrawing] = useState(""),
    [sign, setSign] = useState(false),
    [confirm, setConfirm] = useState<{
      doc: Doc;
      action: "send" | "void" | "decline" | "archive";
    } | null>(null);
  async function load() {
    setLoading(true);
    try {
      const r = await request("?page=" + page);
      setDocs(r.documents);
      setMore(r.more);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    if (staff)
      request("/recipients")
        .then((r) => setRecipients(r.recipients))
        .catch((e) => setError(e.message));
  }, [page]);
  async function act(path: string, verb: string, data?: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(path, verb, data);
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function view(doc: Doc) {
    setBusy(true);
    setError("");
    setReady(false);
    setSign(false);
    setDrawing("");
    setMethod("typed");
    setBytes(null);
    try {
      const r = await request("/" + doc.id),
        response = await fetch("/api/documents/" + doc.id + "/pdf");
      if (!response.ok) throw Error("Não foi possível abrir o arquivo.");
      const data = new Uint8Array(await response.arrayBuffer()),
        { sha } = await import("./pdf-tools");
      if ((await sha(data)) !== r.document.pdf_sha256)
        throw Error("O arquivo não confere com o registro. Não assine.");
      await request("/" + doc.id + "/view", "POST", {
        version: r.document.version,
        document_sha256: r.document.pdf_sha256,
      });
      setBytes(data);
      setOpen(await request("/" + doc.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget),
      file = form.get("pdf") as File;
    setBusy(true);
    setError("");
    try {
      let source: Uint8Array;
      if (file?.size) {
        if (file.size > 1500000) throw Error("O PDF deve ter até 1,5 MB.");
        source = new Uint8Array(await file.arrayBuffer());
      } else if (editor?.id) {
        const r = await fetch("/api/documents/" + editor.id + "/pdf");
        if (!r.ok) throw Error("Não foi possível ler o PDF original.");
        source = new Uint8Array(await r.arrayBuffer());
      } else throw Error("Selecione um PDF.");
      const tools = await import("./pdf-tools"),
        pdf = await tools.openPdf(source);
      await pdf.destroy();
      const recipient = recipients.find((r) => r.id === form.get("recipient"));
      if (!recipient) throw Error("Selecione o destinatário.");
      await request(
        editor?.id ? "/" + editor.id : "",
        editor?.id ? "PUT" : "POST",
        {
          title: form.get("title"),
          client_id: recipient.client_id,
          recipient_id: recipient.id,
          pdf: tools.bytesTo64(source),
          version: editor?.version,
        },
      );
      setEditor(null);
      await load();
      setNotice("Rascunho salvo. Abra e confira antes de enviar.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signing(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!open) return;
    const form = e.currentTarget,
      d = new FormData(form);
    const password = String(d.get("password") ?? "");
    form.reset();
    const ok = await act("/" + open.document.id + "/sign", "POST", {
      version: open.document.version,
      document_sha256: open.document.pdf_sha256,
      name: d.get("name"),
      password,
      consent: d.get("consent") === "on",
      method,
      drawing: method === "drawn" ? drawing : undefined,
    });
    if (ok) {
      setOpen(await request("/" + open.document.id));
      setSign(false);
      setDrawing("");
      setNotice(
        "Assinatura concluída. Baixe o PDF com comprovante e guarde o registro JSON.",
      );
    }
  }
  async function download(doc: Doc, kind: "pdf" | "json") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/documents/" + doc.id + "/evidence");
      const e = (await response.json()) as Evidence & { error?: string };
      if (!response.ok) throw Error(e.error);
      const tools = await import("./pdf-tools");
      if (kind === "json")
        tools.downloadFile(
          JSON.stringify(e, null, 2),
          "comprovante-" + doc.id + ".json",
          "application/json",
        );
      else
        tools.downloadFile(
          (await tools.receiptPdf(e)).slice().buffer,
          "documento-assinado-" + doc.id + ".pdf",
          "application/pdf",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const close = () => {
    if (!busy) {
      setOpen(null);
      setBytes(null);
      setSign(false);
    }
  };
  return (
    <section className="planning-view documents-view">
      <header className="planning-heading">
        <div>
          <p className="eyebrow">DOCUMENTOS & ASSINATURAS</p>
          <h1>Documentos para assinatura</h1>
          <p>
            Envie um PDF ao cliente e acompanhe a assinatura eletrônica pelo
            portal.
          </p>
        </div>
        {staff && (
          <button
            className="button dark"
            onClick={() => {
              setError("");
              setEditor({});
            }}
          >
            <Plus size={18} />
            Novo documento
          </button>
        )}
      </header>
      <p className="document-disclosure">
        Assinatura eletrônica com conta e senha. Sem certificado ICP-Brasil,
        selo PAdES ou carimbo de tempo independente. Um destinatário por
        documento; a assinatura aparece na página de comprovante.
      </p>
      {error && !open && !editor && !confirm && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && !open && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {loading && <p role="status">Atualizando documentos…</p>}
      <div className="planning-list">
        {docs.map((doc) => (
          <article className="planning-panel" key={doc.id}>
            <div className="planning-card-heading">
              <div>
                <p className="eyebrow">
                  PDF · {Math.round(doc.pdf_size / 1000)} KB
                </p>
                <h2>{doc.title}</h2>
              </div>
              <span className={"badge status-" + doc.status}>
                {labels[doc.status]}
              </span>
            </div>
            <p>
              {doc.recipient_name} · {doc.recipient_email}
            </p>
            <p className="planning-help">
              {doc.signed_at
                ? "Assinado em " + date(doc.signed_at)
                : doc.sent_at
                  ? "Enviado ao portal em " + date(doc.sent_at)
                  : "Rascunho privado da equipe"}
            </p>
            <div className="planning-actions">
              <button
                className="button outline"
                disabled={busy}
                onClick={() => void view(doc)}
              >
                <FileText size={17} />
                {!staff && doc.status === "sent"
                  ? "Ler e assinar"
                  : "Abrir documento"}
              </button>
              {staff && doc.status === "draft" && (
                <>
                  <button
                    className="text-button"
                    onClick={() => {
                      setError("");
                      setEditor(doc);
                    }}
                  >
                    Editar rascunho
                  </button>
                  <button
                    className="button dark"
                    onClick={() => setConfirm({ doc, action: "send" })}
                  >
                    Enviar ao cliente
                  </button>
                </>
              )}
              {staff && doc.status === "sent" && (
                <button
                  className="text-button"
                  onClick={() => setConfirm({ doc, action: "void" })}
                >
                  Cancelar envio
                </button>
              )}
              {doc.status === "signed" && (
                <button
                  className="button dark"
                  disabled={busy}
                  onClick={() => void download(doc, "pdf")}
                >
                  <Download size={17} />
                  PDF com comprovante
                </button>
              )}
              {staff && doc.status !== "sent" && (
                <button
                  className="text-button"
                  onClick={() => setConfirm({ doc, action: "archive" })}
                >
                  Arquivar documento
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!loading && !docs.length && (
        <p className="planning-empty">
          {staff
            ? "Nenhum documento nesta página. Comece enviando um PDF."
            : "Nenhum documento disponível para sua assinatura."}
        </p>
      )}
      {(more || page > 0) && (
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
      )}
      {editor && (
        <Dialog
          title={editor.id ? "Editar rascunho" : "Novo documento"}
          close={() => !busy && setEditor(null)}
        >
          <form className="planning-form" onSubmit={save}>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <label>
              Título do documento
              <input
                name="title"
                maxLength={160}
                required
                defaultValue={editor.title}
              />
            </label>
            <label>
              Destinatário da assinatura
              <select
                name="recipient"
                required
                defaultValue={editor.recipient_id ?? ""}
              >
                <option value="" disabled>
                  Selecione um acesso de cliente
                </option>
                {recipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.client_name} · {r.name} ({r.email})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Arquivo PDF
              <input
                name="pdf"
                type="file"
                accept="application/pdf,.pdf"
                required={!editor.id}
              />
            </label>
            <small>
              PDF de até 1,5 MB e 20 páginas, sem senha.{" "}
              {editor.id ? "Sem um novo arquivo, o original será mantido." : ""}{" "}
              Revise textos, valores e representação do destinatário antes de
              enviar.
            </small>
            <button
              className="button dark"
              disabled={busy || !recipients.length}
            >
              {busy ? "Salvando…" : "Salvar documento"}
            </button>
            {!recipients.length && (
              <p>
                Crie um acesso de cliente vinculado em Meu acesso antes de
                enviar documentos. O seletor lista até 500 acessos ativos.
              </p>
            )}
          </form>
        </Dialog>
      )}
      {open && bytes && (
        <Dialog title={open.document.title} close={close}>
          <div className="document-summary">
            <span className="badge">{labels[open.document.status]}</span>
            <p>
              Destinatário: {open.document.recipient_name} ·{" "}
              {open.document.recipient_email}
            </p>
            <p className="document-hash">SHA-256: {open.document.pdf_sha256}</p>
            <a
              href={"/api/documents/" + open.document.id + "/pdf"}
              className="text-button"
              download
            >
              Baixar PDF original
            </a>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          <Preview bytes={bytes} ready={() => setReady(true)} />
          {!staff && open.document.status === "sent" && !sign && (
            <div className="planning-actions">
              <button
                className="button dark"
                disabled={!ready || busy}
                onClick={() => {
                  setError("");
                  setSign(true);
                }}
              >
                <PenLine size={17} />
                Preparar assinatura
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setOpen(null);
                  setConfirm({ doc: open.document, action: "decline" });
                }}
              >
                Recusar documento
              </button>
            </div>
          )}
          {sign && open.document.status === "sent" && (
            <form
              className="planning-form document-sign-form"
              onSubmit={signing}
            >
              <h3>Sua assinatura eletrônica</h3>
              <div className="planning-actions">
                <button
                  type="button"
                  className={
                    "button " + (method === "typed" ? "dark" : "outline")
                  }
                  aria-pressed={method === "typed"}
                  onClick={() => setMethod("typed")}
                >
                  Digitar assinatura
                </button>
                <button
                  type="button"
                  className={
                    "button " + (method === "drawn" ? "dark" : "outline")
                  }
                  aria-pressed={method === "drawn"}
                  onClick={() => setMethod("drawn")}
                >
                  Desenhar assinatura
                </button>
              </div>
              {method === "drawn" && (
                <Signature drawing={drawing} setDrawing={setDrawing} />
              )}
              <label>
                Nome completo para assinar
                <input
                  name="name"
                  required
                  maxLength={150}
                  minLength={3}
                  autoComplete="name"
                  defaultValue={user.name}
                />
              </label>
              <label>
                Confirme sua senha do portal
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                />
              </label>
              <label className="planning-check">
                <input name="consent" type="checkbox" required />
                {open.consent}
              </label>
              <p className="planning-help">
                A assinatura conclui sua concordância com este PDF. Confira
                todas as páginas antes de confirmar. A senha é usada apenas para
                verificar sua identidade na conta e não aparece no comprovante.
              </p>
              <button
                className="button dark"
                disabled={!ready || busy || (method === "drawn" && !drawing)}
              >
                {busy ? "Confirmando…" : "Assinar documento"}
              </button>
            </form>
          )}
          {open.document.status === "signed" && (
            <div className="document-signed">
              <h3>
                <Check size={20} />
                Assinatura concluída
              </h3>
              <p>
                O original permanece preservado. Guarde o comprovante junto ao
                contrato.
              </p>
              <div className="planning-actions">
                <button
                  className="button dark"
                  disabled={busy}
                  onClick={() => void download(open.document, "pdf")}
                >
                  Baixar PDF com comprovante
                </button>
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() => void download(open.document, "json")}
                >
                  Baixar registro JSON
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const r = await request(
                        "/" + open.document.id + "/verify",
                      );
                      setNotice(
                        r.valid
                          ? "Integridade conferida com os registros atuais do servidor."
                          : "A integridade não pôde ser confirmada.",
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Conferir integridade
                </button>
              </div>
            </div>
          )}
          <section className="document-history">
            <h3>Histórico do documento</h3>
            {open.events.map((ev, i) => (
              <article key={i}>
                <strong>{labels[ev.action] ?? ev.action}</strong>
                <small>
                  {date(ev.created_at)} · versão {ev.version}
                </small>
                {ev.detail && <p className="document-hash">{ev.detail}</p>}
              </article>
            ))}
          </section>
        </Dialog>
      )}
      {confirm && (
        <Dialog
          title={
            confirm.action === "send"
              ? "Enviar documento"
              : confirm.action === "archive"
                ? "Arquivar documento"
                : confirm.action === "void"
                  ? "Cancelar envio"
                  : "Recusar documento"
          }
          close={() => !busy && setConfirm(null)}
        >
          <p>
            <strong>{confirm.doc.title}</strong>
          </p>
          <p>
            {confirm.action === "send"
              ? `O PDF ficará bloqueado para edição e disponível para ${confirm.doc.recipient_name} (${confirm.doc.recipient_email}) no portal. Avise o destinatário pelos seus canais habituais; não há e-mail automático.`
              : confirm.action === "archive"
                ? "O documento deixará a lista da equipe. O arquivo e o histórico serão preservados; assinaturas concluídas continuam acessíveis ao destinatário."
                : "O documento deixará de aceitar assinatura. O arquivo e o motivo serão preservados no histórico."}
          </p>
          <form
            className="planning-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const c = confirm;
              if (
                await act(
                  "/" +
                    c.doc.id +
                    (c.action === "archive" ? "" : "/" + c.action),
                  c.action === "archive" ? "DELETE" : "POST",
                  { version: c.doc.version, reason: data.get("reason") },
                )
              )
                setConfirm(null);
            }}
          >
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {["void", "decline"].includes(confirm.action) && (
              <label>
                Motivo
                <textarea
                  name="reason"
                  required
                  minLength={3}
                  maxLength={1000}
                />
              </label>
            )}
            <button className="button dark" disabled={busy}>
              {busy ? "Confirmando…" : "Confirmar"}
            </button>
          </form>
        </Dialog>
      )}
    </section>
  );
}
