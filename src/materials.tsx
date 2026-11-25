import { useEffect, useState } from "react";
import type { Entry, User } from "./types";

type Media = { id: string; name: string; mimeType: string; size?: string };
type Listing = { files: Media[]; next: string | null };
type Status = { configured: boolean; connected: boolean };
const endpoint = "/api/materials";
const accepted = "image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime";
const chunkSize = 8 * 1024 ** 2;

async function request<T>(url: string, data?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, data === undefined ? { signal } : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), signal,
  });
  const payload = await response.json<T & { error?: string }>();
  if (!response.ok) throw new Error(payload.error ?? "Não foi possível acessar os materiais.");
  return payload as T;
}

async function sendFile(
  url: string, file: File, onProgress: (value: number) => void, signal: AbortSignal,
) {
  let offset = 0;
  let failed = 0;
  while (offset < file.size) {
    const end = Math.min(offset + chunkSize, file.size);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "PUT", signal,
        headers: { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}`, "Content-Type": file.type },
        body: file.slice(offset, end, file.type),
      });
      if (response.status >= 500) throw new Error("O Drive está indisponível.");
    } catch (error) {
      if (signal.aborted || ++failed > 2) throw error;
      response = await fetch(url, {
        method: "PUT", signal, headers: { "Content-Range": `bytes */${file.size}` },
      });
    }
    if (response.ok) {
      onProgress(100);
      return;
    }
    if (response.status !== 308)
      throw new Error("O Drive recusou o envio. Confira o espaço disponível e tente novamente.");
    const last = response.headers.get("Range")?.match(/^bytes=0-(\d+)$/)?.[1];
    const next = last === undefined ? 0 : Number(last) + 1;
    if (next < offset || next >= file.size)
      throw new Error("O Drive não confirmou o progresso do envio.");
    if (next === offset && ++failed > 2)
      throw new Error("O Drive não confirmou o recebimento do arquivo.");
    if (next > offset) failed = 0;
    offset = next;
    onProgress(Math.floor((100 * offset) / file.size));
  }
}

async function activeClients(signal: AbortSignal) {
  const all: Entry[] = [];
  for (let page = 0; ; page++) {
    const result = await request<{ records: Entry[]; more: boolean }>(
      "/api/records/clients?page=" + page, undefined, signal,
    );
    all.push(...result.records);
    if (!result.more) return all;
  }
}

function Library({ client, staff }: { client: string; staff: boolean }) {
  const query = new URLSearchParams({ client });
  const [listing, setListing] = useState<Listing>({ files: [], next: null });
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<Media | null>(null);
  const [controller] = useState(() => new AbortController());

  async function load(page?: string) {
    setPending(true);
    setError("");
    try {
      const params = new URLSearchParams({ client });
      if (page) params.set("page", page);
      const result = await request<Listing>(endpoint + "?" + params, undefined, controller.signal);
      setListing((old) => ({ files: page ? [...old.files, ...result.files] : result.files, next: result.next }));
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    const signal = new AbortController();
    request<Listing>(endpoint + "?" + new URLSearchParams({ client }), undefined, signal.signal)
      .then(setListing)
      .catch((error: Error) => { if (!signal.signal.aborted) setError(error.message); })
      .finally(() => { if (!signal.signal.aborted) setPending(false); });
    return () => signal.abort();
  }, [client]);
  useEffect(() => () => controller.abort(), [controller]);

  async function upload(file: File) {
    setError("");
    setMessage("");
    setProgress(0);
    try {
      const { url } = await request<{ url: string }>(endpoint + "/upload?" + query,
        { name: file.name, type: file.type, size: file.size }, controller.signal);
      await sendFile(url, file, setProgress, controller.signal);
      setMessage("Material enviado.");
      await load();
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      setProgress(null);
    }
  }

  function fileUrl(file: Media, download = false) {
    return endpoint + "/" + file.id + "/file?" + query + (download ? "&download=1" : "");
  }

  return (
    <>
      {staff && <label className="planning-panel">
        <span>Enviar foto ou vídeo</span>
        <input type="file" accept={accepted} disabled={progress !== null}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void upload(file);
          }} />
      </label>}
      {progress !== null && <progress aria-label="Progresso do envio" value={progress} max={100} />}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {pending && <p role="status">Carregando materiais…</p>}
      {!pending && !error && listing.files.length === 0 && <p>Nenhum material nesta pasta.</p>}
      <div className="planning-list">
        {listing.files.map((file) => (
          <article className="planning-panel" key={file.id}>
            <h2>{file.name}</h2>
            <button type="button" className="button" onClick={() =>
              setPreview(preview?.id === file.id ? null : file)}>
              {preview?.id === file.id ? "Fechar prévia" : "Visualizar"}
            </button>{" "}
            <a className="button" href={fileUrl(file, true)}>Baixar</a>
            {preview?.id === file.id && (file.mimeType.startsWith("image/") ?
              <img src={fileUrl(file)} alt={file.name} style={{ display: "block", maxWidth: "100%" }} /> :
              <video controls playsInline preload="metadata" src={fileUrl(file)}
                aria-label={file.name} style={{ display: "block", maxWidth: "100%" }} />)}
          </article>
        ))}
      </div>
      {listing.next && <button className="button" disabled={pending}
        onClick={() => void load(listing.next ?? undefined)}>Carregar mais</button>}
    </>
  );
}

export default function Materials({ user }: { user: User }) {
  const staff = user.role !== "client";
  const [clients, setClients] = useState<Entry[]>([]);
  const [client, setClient] = useState(user.client_id ?? "");
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [result] = useState(() => new URLSearchParams(location.search).get("drive"));

  useEffect(() => {
    const controller = new AbortController();
    request<Status>(endpoint + "/status", undefined, controller.signal).then(setStatus)
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); });
    if (staff) activeClients(controller.signal).then(setClients)
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); });
    if (result) history.replaceState(null, "", "/portal");
    return () => controller.abort();
  }, [staff, result]);

  async function connect() {
    setConnecting(true);
    setError("");
    try {
      const { url } = await request<{ url: string }>(endpoint + "/google", {});
      location.assign(url);
    } catch (error) {
      setError((error as Error).message);
      setConnecting(false);
    }
  }

  return (
    <section className="planning-view">
      <header className="planning-heading">
        <div><h1>Meus materiais</h1><p>Fotos e vídeos da agência.</p></div>
        {user.role === "admin" && status?.configured &&
          <button className="button" disabled={connecting} onClick={() => void connect()}>
            {status.connected ? "Reconectar Google Drive" : "Conectar Google Drive"}
          </button>}
      </header>
      {result === "ok" && <p role="status">Google Drive conectado.</p>}
      {result === "conta" && <p role="alert">Selecione a conta Google da agência.</p>}
      {result === "permissao" && <p role="alert">Na tela do Google, permita ao portal acessar os arquivos que ele cria no Drive.</p>}
      {result === "renovacao" && <p role="alert">O Google não enviou a autorização de longa duração. Reconecte o Drive.</p>}
      {result && !["ok", "conta", "permissao", "renovacao"].includes(result) &&
        <p role="alert" data-drive-stage={result}>A autorização do Google Drive não foi concluída. Tente conectar novamente.</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {!status && !error && <p role="status">Verificando Google Drive…</p>}
      {status && !status.connected && <p>O Google Drive ainda não está conectado.</p>}
      {status?.connected && staff && <label className="planning-panel">
        <span>Cliente</span>
        <select value={client} onChange={(event) => setClient(event.target.value)}>
          <option value="">Selecione um cliente</option>
          {clients.map((entry) => <option key={entry.id} value={entry.id}>{entry.data.name}</option>)}
        </select>
      </label>}
      {status?.connected && client && <Library key={client} client={client} staff={staff} />}
    </section>
  );
}
