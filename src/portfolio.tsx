import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Plus,
  Pencil,
  Archive,
  ImagePlus,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { PortfolioEntry } from "./types";
type Request = (
  path: string,
  method?: string,
  data?: unknown,
) => Promise<{ portfolio: PortfolioEntry[]; more: boolean; id: string }>;
async function prepareImage(file: File) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 8000000
  )
    throw Error("Escolha uma imagem JPEG, PNG ou WebP de até 8 MB.");
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw Error("Não foi possível preparar a imagem.");
  }
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let value = "";
  for (const quality of [0.84, 0.7, 0.55, 0.4, 0.3]) {
    value = canvas.toDataURL("image/jpeg", quality).split(",")[1];
    if (value.length <= 790000) return { mime: "image/jpeg", base64: value };
  }
  throw Error("A imagem continua muito grande. Escolha uma imagem menor.");
}
export function PortfolioGallery({ request }: { request: Request }) {
  const [rows, setRows] = useState<PortfolioEntry[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let valid = true;
    setLoading(true);
    request("/portfolio?page=" + page)
      .then((r) => {
        if (valid) {
          setRows((previous) =>
            page === 0 ? r.portfolio : [...previous, ...r.portfolio],
          );
          setMore(r.more);
          setError("");
        }
      })
      .catch(
        () =>
          valid && setError("Não foi possível carregar os trabalhos agora."),
      )
      .finally(() => valid && setLoading(false));
    return () => {
      valid = false;
    };
  }, [page, request]);
  return (
    <section className="il-portfolio il-container" id="trabalhos">
      <div className="il-section-title">
        <div>
          <p className="il-kicker">03 / IDEIAS QUE GANHAM FORMA</p>
          <h2>
            O próximo trabalho
            <br />
            pode ser <em>o seu.</em>
          </h2>
        </div>
        <p>
          Conheça os projetos publicados pela Ilustre.
          <br />
          Cada marca tem uma história para contar.
        </p>
      </div>
      {error ? (
        <p role="status" className="il-empty-work">
          {error} <a href="#contato">Vamos conversar sobre seu projeto.</a>
        </p>
      ) : rows.length ? (
        <>
          <div className="il-work-grid">
            {rows.map((row) => (
              <article className="il-work-card" key={row.id}>
                {row.image_url ? (
                  <img
                    src={row.image_url}
                    alt={row.title}
                    width="800"
                    height="600"
                    loading="lazy"
                  />
                ) : (
                  <div className="il-work-placeholder" aria-hidden="true">
                    <span>{row.title.slice(0, 1)}</span>
                  </div>
                )}
                <div className="il-work-copy">
                  <span>{row.category}</span>
                  <h3>{row.title}</h3>
                  <p>{row.summary}</p>
                  {row.project_url && (
                    <a href={row.project_url} target="_blank" rel="noreferrer">
                      Conhecer projeto <ArrowUpRight size={16} />
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
          {more && (
            <button
              className="il-button il-outline il-load"
              disabled={loading}
              onClick={() => setPage((v) => v + 1)}
            >
              {loading ? "Carregando…" : "Ver mais trabalhos"}{" "}
              <Plus size={17} />
            </button>
          )}
        </>
      ) : (
        <div className="il-empty-work">
          <span className="il-empty-orbit" aria-hidden="true">
            ↗
          </span>
          <div>
            <h3>
              {loading
                ? "Preparando nossa seleção…"
                : "Toda marca tem um próximo capítulo."}
            </h3>
            <p>
              {loading
                ? "Carregando os projetos publicados."
                : "Conte o que você quer construir. Vamos pensar no caminho juntos."}
            </p>
          </div>
          <a className="il-button il-outline" href="#contato">
            Vamos criar? <ArrowUpRight size={17} />
          </a>
        </div>
      )}
    </section>
  );
}
export function PortfolioManager({ request }: { request: Request }) {
  const [rows, setRows] = useState<PortfolioEntry[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [editor, setEditor] = useState<PortfolioEntry | "new" | null>(null),
    [archiving, setArchiving] = useState<PortfolioEntry | null>(null),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function load() {
    setLoading(true);
    try {
      const r = await request("/admin/portfolio?page=" + page);
      setRows(r.portfolio);
      setMore(r.more);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [page]);
  function open(entry: PortfolioEntry | "new") {
    setEditor(entry);
    setFile(null);
    setError("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget),
      data = {
        title: String(form.get("title") || ""),
        category: String(form.get("category") || ""),
        summary: String(form.get("summary") || ""),
        project_url: String(form.get("project_url") || ""),
        published: form.get("published") === "on",
        featured: form.get("featured") === "on",
      };
    try {
      const image = file ? await prepareImage(file) : null;
      const currentId = editor === "new" ? null : editor.id;
      const r = await request(
        "/admin/portfolio" + (currentId ? "/" + currentId : ""),
        currentId ? "PUT" : "POST",
        { ...data, published: image ? false : data.published },
      );
      const id = currentId || r.id;
      if (image) {
        setEditor({
          ...data,
          id,
          published: false,
          image_url: null,
          image_version: null,
          created_at: "",
          updated_at: "",
        });
        await request("/admin/portfolio/" + id + "/image", "POST", image);
        if (data.published)
          await request("/admin/portfolio/" + id, "PUT", data);
      }
      setEditor(null);
      setFile(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!archiving) return;
    setBusy(true);
    try {
      await request("/admin/portfolio/" + archiving.id, "DELETE", {});
      setArchiving(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const initial = editor && editor !== "new" ? editor : null;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SEU TRABALHO EM DESTAQUE</p>
          <h1>Portfólio</h1>
          <p>
            Cadastre projetos e imagens. Apenas os trabalhos marcados como
            publicados aparecem no site.
          </p>
        </div>
        <button className="button dark" onClick={() => open("new")}>
          <Plus size={18} />
          Novo trabalho
        </button>
      </div>
      {error && !editor && !archiving && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="panel portfolio-admin">
        <div className="panel-heading">
          <h2>Trabalhos da Ilustre</h2>
          <a
            href="/#trabalhos"
            target="_blank"
            rel="noreferrer"
            className="text-button"
          >
            Ver no site <ArrowUpRight size={15} />
          </a>
        </div>
        {loading ? (
          <div className="empty">Carregando trabalhos…</div>
        ) : rows.length ? (
          <div className="portfolio-admin-grid">
            {rows.map((row) => (
              <article key={row.id}>
                {row.image_url ? (
                  <img
                    src={row.image_url}
                    alt={row.title}
                    width="400"
                    height="280"
                  />
                ) : (
                  <div className="portfolio-admin-empty-image">
                    <ImagePlus size={30} />
                    <span>Sem imagem</span>
                  </div>
                )}
                <div>
                  <span className={"badge " + (row.published ? "done" : "")}>
                    {row.published ? "Publicado" : "Rascunho"}
                  </span>
                  {row.featured && <span className="badge">Destaque</span>}
                  <h3>{row.title}</h3>
                  <p>{row.category}</p>
                  <div className="row-actions">
                    <button className="text-button" onClick={() => open(row)}>
                      <Pencil size={15} />
                      Editar {row.title}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={"Arquivar " + row.title}
                      onClick={() => {
                        setArchiving(row);
                        setError("");
                      }}
                    >
                      <Archive size={16} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <ImagePlus size={30} />
            <h3>Seu primeiro trabalho começa aqui.</h3>
            <p>
              Adicione uma imagem, uma categoria e a história do projeto. Você
              escolhe quando publicar.
            </p>
          </div>
        )}
        <div className="pagination">
          <span>Página {page + 1} · até 50 trabalhos</span>
          <div>
            <button
              className="icon-button"
              aria-label="Página anterior"
              disabled={page === 0 || loading}
              onClick={() => setPage((v) => v - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Próxima página"
              disabled={!more || loading}
              onClick={() => setPage((v) => v + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>
      {editor && (
        <div className="modal-backdrop">
          <section
            className="modal editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="portfolio-editor-title"
          >
            <button
              className="close-modal icon-button"
              aria-label="Fechar"
              disabled={busy}
              onClick={() => setEditor(null)}
            >
              <X />
            </button>
            <p className="eyebrow">PORTFÓLIO DA ILUSTRE</p>
            <h2 id="portfolio-editor-title">
              {editor === "new" ? "Novo trabalho" : "Editar trabalho"}
            </h2>
            <form onSubmit={save}>
              <label>
                Título do trabalho
                <input
                  name="title"
                  required
                  maxLength={160}
                  defaultValue={initial?.title}
                />
              </label>
              <label>
                Categoria
                <input
                  name="category"
                  required
                  maxLength={80}
                  placeholder="Ex.: Identidade visual"
                  defaultValue={initial?.category}
                />
              </label>
              <label>
                Descrição do projeto
                <textarea
                  name="summary"
                  maxLength={1800}
                  rows={4}
                  defaultValue={initial?.summary}
                />
              </label>
              <label>
                Link do projeto (opcional)
                <input
                  name="project_url"
                  type="url"
                  pattern="https://.*"
                  maxLength={1000}
                  defaultValue={initial?.project_url}
                />
              </label>
              <label>
                Imagem do trabalho
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <small>
                  JPEG, PNG ou WebP até 8 MB. O navegador otimiza para JPEG de
                  até 600 KB, sem contratar armazenamento externo.
                </small>
              </label>
              {initial?.image_url && !file && (
                <img
                  className="portfolio-editor-image"
                  src={initial.image_url}
                  alt="Imagem atual do trabalho"
                />
              )}
              <label className="portfolio-check">
                <input
                  name="published"
                  type="checkbox"
                  defaultChecked={initial?.published ?? false}
                />
                Publicar no site
              </label>
              <label className="portfolio-check">
                <input
                  name="featured"
                  type="checkbox"
                  defaultChecked={initial?.featured ?? false}
                />
                Mostrar como destaque
              </label>
              <p className="subtle-note">
                Publique somente imagens e trabalhos que você tem autorização
                para divulgar. As imagens não são usadas para reconhecimento de
                pessoas.
              </p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="button outline"
                  disabled={busy}
                  onClick={() => setEditor(null)}
                >
                  Cancelar
                </button>
                <button className="button dark" disabled={busy}>
                  {busy ? "Salvando…" : "Salvar trabalho"}
                  <Check size={17} />
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {archiving && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-portfolio-title"
          >
            <button
              className="close-modal icon-button"
              aria-label="Fechar"
              disabled={busy}
              onClick={() => setArchiving(null)}
            >
              <X />
            </button>
            <h2 id="archive-portfolio-title">Arquivar trabalho?</h2>
            <p>
              “{archiving.title}” será removido do site e da lista ativa. O
              cadastro e a imagem serão preservados no banco.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                className="button outline"
                disabled={busy}
                onClick={() => setArchiving(null)}
              >
                Cancelar
              </button>
              <button className="button dark" disabled={busy} onClick={archive}>
                Arquivar trabalho
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
