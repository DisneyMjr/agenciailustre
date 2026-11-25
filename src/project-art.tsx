import React, { useEffect, useState } from "react";

type ArtFile = { id: string; name: string; mime: string };
type Version = {
  id: string; number: number; created_at: string; note: string;
  decision: "approve" | "changes" | null; comment: string | null;
  files: ArtFile[]; mail: string | null;
};
type Art = { title: string; linked: boolean; mailConfigured: boolean; versions: Version[] };
const maxBytes = 1_500_000;

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await response.json<{ error?: string }>().catch(() => null);
    throw new Error(message?.error ?? "Não foi possível consultar as artes.");
  }
  return response.json();
}

async function attachment(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return { name: file.name, content: btoa(binary) };
}

export function ProjectArt({ id, staff, onChange }: { id: string; staff: boolean; onChange: () => void }) {
  const url = "/api/projects/" + id + "/art";
  const [open, setOpen] = useState(true);
  const [data, setData] = useState<Art | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inputKey, setInputKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let current = true;
    request<Art>(url).then((art) => {
      if (current) setData(art);
    }).catch((error: Error) => {
      if (current) setError(error.message);
    });
    return () => { current = false; };
  }, [open, url]);

  const latest = data?.versions[0];
  async function act(decision?: "approve" | "changes") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (decision && latest) {
        await request(url + "/" + latest.id + "/decision", { decision, comment });
        setComment("");
        setNotice(decision === "approve" ? "Arte aprovada." : "Pedido de ajustes registrado.");
      } else {
        if (!files.length || files.length > 5 || files.reduce((sum, file) => sum + file.size, 0) > maxBytes)
          throw new Error("Selecione de 1 a 5 arquivos, com até 1,5 MB no total.");
        const result = await request<{ recipients: number }>(url, {
          previous: latest?.number ?? 0, note, files: await Promise.all(files.map(attachment)),
        });
        setFiles([]);
        setNote("");
        setInputKey((value) => value + 1);
        setNotice(result.recipients
          ? "Versão enviada para aprovação."
          : "Versão enviada. Cadastre um acesso para o cliente visualizar a arte.");
      }
      onChange();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      try { setData(await request<Art>(url)); }
      catch (error) { setError((error as Error).message); }
      setBusy(false);
    }
  }

  return <div>
    <button type="button" className="button outline" aria-expanded={open}
      onClick={() => { setOpen(!open); setError(""); }}>
      {open ? "Fechar artes" : "Artes e versões"}
    </button>
    {open && <div className="approval-card">
      {error && <p role="alert" className="error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data && !error && <p role="status">Carregando artes…</p>}
      {data && <>
        <h3>{data.title}</h3>
        {staff && (data.linked ? <div>
          {!data.mailConfigured && <p>O envio de e-mail ainda precisa ser configurado. O cliente poderá consultar a versão no portal.</p>}
          <label>Arquivos da nova versão
            <input key={inputKey} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
          </label>
          <small>Até 5 arquivos em PDF, JPEG, PNG ou WebP, com 1,5 MB no total.</small>
          <label>Mensagem para o cliente
            <textarea maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <button type="button" className="button dark" disabled={busy || !files.length} onClick={() => void act()}>
            Enviar versão {latest ? latest.number + 1 : 1} para aprovação
          </button>
        </div> : <p>Vincule um cliente para enviar artes.</p>)}
        {!data.versions.length && <p>Nenhuma versão enviada.</p>}
        {data.versions.map((version, index) => <section key={version.id} className="panel approval-card">
          <h3>Versão {version.number}</h3>
          <p>{version.decision === "approve" ? "Aprovada" : version.decision === "changes"
            ? "Ajustes solicitados" : index === 0 ? "Aguardando aprovação" : "Substituída"}</p>
          <time dateTime={version.created_at.replace(" ", "T") + "Z"}>
            {new Date(version.created_at.replace(" ", "T") + "Z").toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          </time>
          {version.note && <p>{version.note}</p>}
          <ul>{version.files.map((file) => {
            const link = url + "/files/" + file.id;
            return <li key={file.id}>
              {file.mime.startsWith("image/") && <img src={link + "?preview"} alt={file.name}
                loading="lazy" width={180} style={{ maxWidth: "100%", height: "auto" }} />}
              <a href={link}>Baixar {file.name}</a>
            </li>;
          })}</ul>
          {version.comment && <p>Comentário do cliente: {version.comment}</p>}
          {staff && <p>{version.mail ? version.mail.split(",").map((state) =>
            state === "sent" ? "Aceito pelo serviço de e-mail" : state === "failed" ? "Falha de envio" : "E-mail pendente"
          ).join(" · ") : "Nenhum acesso de cliente recebeu aviso"}</p>}
          {!staff && index === 0 && !version.decision && <>
            <label>Comentário ou ajustes
              <textarea maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} />
            </label>
            <div className="form-actions">
              <button type="button" className="button outline" disabled={busy || comment.trim().length < 5}
                onClick={() => void act("changes")}>Solicitar ajustes</button>
              <button type="button" className="button dark" disabled={busy}
                onClick={() => void act("approve")}>Aprovar arte</button>
            </div>
          </>}
        </section>)}
      </>}
    </div>}
  </div>;
}
