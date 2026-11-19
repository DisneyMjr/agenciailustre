import {
  check,
  field,
  HttpError,
  passwordVerify,
  digest,
  hex,
} from "./security";
type Actor = {
  id: string;
  role: string;
  client_id: string | null;
  name: string;
  email: string;
};
type Read = (req: Request, max?: number) => Promise<Record<string, unknown>>;
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
  archived: number;
  created_at: string;
  sent_at: string | null;
  signed_at: string | null;
};
const columns =
  "id,title,client_id,recipient_id,recipient_name,recipient_email,pdf_sha256,pdf_size,status,version,archived,created_at,sent_at,signed_at,updated_at";
export const signingConsent =
  "Li o documento integralmente, concordo com seu conteúdo e aceito assiná-lo eletronicamente por meio da minha conta e senha no portal da Agência Ilustre. Sei que esta assinatura não utiliza certificado ICP-Brasil.";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
function staff(u: Actor) {
  if (u.role === "client") fail(403, "Somente a equipe gerencia documentos.");
}
function decode(value: unknown, max: number) {
  check(
    typeof value === "string" && value.length <= Math.ceil(max / 3) * 4,
    "Arquivo acima do limite.",
  );
  let raw: string;
  try {
    raw = atob(value);
  } catch {
    fail(400, "Arquivo inválido.");
  }
  check(raw.length > 0 && raw.length <= max, "Arquivo acima do limite.");
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
function encode(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
const hashBytes = async (bytes: Uint8Array) =>
  hex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
function event(
  db: D1Database,
  id: string,
  user: Actor,
  action: string,
  version: number,
  detail = "",
) {
  return db
    .prepare(
      "INSERT OR IGNORE INTO document_events(id,document_id,actor_id,action,version,detail) VALUES(?,?,?,?,?,?)",
    )
    .bind(crypto.randomUUID(), id, user.id, action, version, detail);
}
async function draftData(db: D1Database, d: Record<string, unknown>) {
  const title = field(d.title, 160, true),
    client = field(d.client_id, 36, true),
    recipient = field(d.recipient_id, 36, true);
  const signer = await db
    .prepare(
      "SELECT name,email FROM users WHERE id=? AND client_id=? AND role='client' AND disabled=0 AND EXISTS(SELECT 1 FROM records WHERE id=? AND kind='clients' AND archived=0)",
    )
    .bind(recipient, client, client)
    .first<{ name: string; email: string }>();
  check(signer, "Selecione um acesso de cliente ativo e vinculado ao cliente.");
  const pdf = decode(d.pdf, 1500000);
  check(
    new TextDecoder().decode(pdf.slice(0, 5)) === "%PDF-" &&
      new TextDecoder().decode(pdf.slice(-1024)).includes("%%EOF"),
    "Envie um PDF válido e completo.",
  );
  return { title, client, recipient, signer, pdf, hash: await hashBytes(pdf) };
}
export async function documentsRoute(
  req: Request,
  db: D1Database,
  user: Actor,
  read: Read,
): Promise<Response | null> {
  const url = new URL(req.url),
    path = url.pathname.replace(/\/$/, ""),
    method = req.method;
  if (!/^\/api\/documents(?:\/|$)/.test(path)) return null;
  if (path === "/api/documents/recipients" && method === "GET") {
    staff(user);
    return json({
      recipients: (
        await db
          .prepare(
            "SELECT u.id,u.name,u.email,u.client_id,json_extract(r.data,'$.name') AS client_name FROM users u JOIN records r ON r.id=u.client_id AND r.kind='clients' AND r.archived=0 WHERE u.role='client' AND u.disabled=0 ORDER BY u.name LIMIT 500",
          )
          .all()
      ).results,
    });
  }
  if (path === "/api/documents" && method === "GET") {
    const page = Math.max(
      0,
      Math.min(10000, Number(url.searchParams.get("page")) || 0),
    );
    const rows = await db
      .prepare(
        `SELECT ${columns} FROM documents WHERE ${user.role === "client" ? "recipient_id=? AND client_id=? AND status!='draft' AND (archived=0 OR status='signed')" : "archived=0"} ORDER BY created_at DESC,id LIMIT 51 OFFSET ?`,
      )
      .bind(
        ...(user.role === "client" ? [user.id, user.client_id ?? ""] : []),
        page * 50,
      )
      .all();
    return json({
      documents: rows.results.slice(0, 50),
      more: rows.results.length > 50,
    });
  }
  if (path === "/api/documents" && method === "POST") {
    staff(user);
    const d = await draftData(db, await read(req, 2100000)),
      id = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          "INSERT INTO documents(id,title,client_id,recipient_id,recipient_name,recipient_email,pdf,pdf_sha256,pdf_size,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          d.title,
          d.client,
          d.recipient,
          d.signer.name,
          d.signer.email,
          d.pdf.buffer,
          d.hash,
          d.pdf.length,
          user.id,
        ),
      event(db, id, user, "created", 1),
    ]);
    return json({ id }, 201);
  }
  const match = path.match(
    /^\/api\/documents\/([a-f0-9-]{36})(?:\/(pdf|view|send|sign|decline|void|evidence|verify))?$/,
  );
  if (!match) fail(404, "Documento não encontrado.");
  const [, id, action] = match;
  const doc = await db
    .prepare(`SELECT ${columns} FROM documents WHERE id=?`)
    .bind(id)
    .first<Doc>();
  if (
    !doc ||
    (user.role === "client" &&
      (doc.recipient_id !== user.id ||
        doc.client_id !== user.client_id ||
        doc.status === "draft"))
  )
    fail(404, "Documento não encontrado.");
  const scope = () =>
    user.role === "client" ? " AND recipient_id=? AND client_id=?" : "";
  const scopeArgs = () =>
    user.role === "client" ? [user.id, user.client_id ?? ""] : [];
  if (method === "GET" && !action) {
    return json({
      document: doc,
      consent: signingConsent,
      events: (
        await db
          .prepare(
            "SELECT actor_id,action,version,detail,created_at FROM document_events WHERE document_id=? ORDER BY rowid",
          )
          .bind(id)
          .all()
      ).results,
    });
  }
  if (method === "GET" && action === "pdf") {
    const row = await db
      .prepare("SELECT pdf FROM documents WHERE id=?")
      .bind(id)
      .first<{ pdf: ArrayBuffer }>();
    return new Response(new Uint8Array(row!.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="documento-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (method === "GET" && (action === "evidence" || action === "verify")) {
    const source = await db
        .prepare("SELECT pdf FROM documents WHERE id=?")
        .bind(id)
        .first<{ pdf: ArrayBuffer }>(),
      bytes = new Uint8Array(source!.pdf);
    const sig = await db
      .prepare(
        "SELECT manifest,manifest_sha256,drawing FROM document_signatures WHERE document_id=?",
      )
      .bind(id)
      .first<{
        manifest: string;
        manifest_sha256: string;
        drawing: ArrayBuffer | null;
      }>();
    const documentValid = (await hashBytes(bytes)) === doc.pdf_sha256;
    const manifestValid =
      !!sig && (await digest(sig.manifest)) === sig.manifest_sha256;
    let proof: Record<string, unknown> | null = null;
    try {
      proof = sig ? JSON.parse(sig.manifest) : null;
    } catch {
      fail(409, "Registro inconsistente. Contate o administrador.");
    }
    const drawing = sig?.drawing ? new Uint8Array(sig.drawing) : null;
    const drawingValid =
      proof?.method !== "drawn" ||
      (!!drawing && (await hashBytes(drawing)) === proof.drawing_sha256);
    const valid =
      documentValid &&
      manifestValid &&
      drawingValid &&
      doc.status === "signed" &&
      proof?.document_sha256 === doc.pdf_sha256 &&
      proof?.document_id === id &&
      proof?.recipient_id === doc.recipient_id &&
      proof?.signer_id === doc.recipient_id &&
      proof?.signed_at === doc.signed_at;
    if (action === "verify")
      return json({
        valid,
        document_valid: documentValid,
        signature_valid: manifestValid && drawingValid,
        document_sha256: doc.pdf_sha256,
        manifest_sha256: sig?.manifest_sha256 ?? null,
      });
    if (!valid)
      fail(
        409,
        "O documento ainda não foi assinado ou o registro está inconsistente.",
      );
    return json({
      document: doc,
      manifest: proof,
      manifest_json: sig!.manifest,
      manifest_sha256: sig!.manifest_sha256,
      pdf: encode(bytes),
      drawing: drawing ? encode(drawing) : null,
      events: (
        await db
          .prepare(
            "SELECT actor_id,action,version,detail,created_at FROM document_events WHERE document_id=? ORDER BY rowid",
          )
          .bind(id)
          .all()
      ).results,
    });
  }
  if (method === "POST" && action === "view") {
    const d = await read(req);
    check(
      d.version === doc.version && d.document_sha256 === doc.pdf_sha256,
      "O documento mudou. Reabra antes de continuar.",
    );
    await event(db, id, user, "viewed", doc.version).run();
    return json({ ok: true });
  }
  if (method === "PUT" && !action) {
    staff(user);
    if (doc.status !== "draft")
      fail(
        409,
        "Documentos enviados não podem ser editados. Crie um novo documento.",
      );
    const input = await read(req, 2100000),
      d = await draftData(db, input);
    const r = await db
      .prepare(
        "UPDATE documents SET title=?,client_id=?,recipient_id=?,recipient_name=?,recipient_email=?,pdf=?,pdf_sha256=?,pdf_size=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? AND status='draft' AND archived=0",
      )
      .bind(
        d.title,
        d.client,
        d.recipient,
        d.signer.name,
        d.signer.email,
        d.pdf.buffer,
        d.hash,
        d.pdf.length,
        id,
        input.version,
      )
      .run();
    if (!r.meta.changes) fail(409, "O rascunho foi alterado. Atualize.");
    await event(db, id, user, "updated", doc.version + 1).run();
    return json({ ok: true });
  }
  if (method === "POST" && action === "send") {
    staff(user);
    const d = await read(req);
    check(
      !!(await db
        .prepare(
          "SELECT id FROM users WHERE id=? AND client_id=? AND role='client' AND disabled=0 AND name=? AND email=?",
        )
        .bind(
          doc.recipient_id,
          doc.client_id,
          doc.recipient_name,
          doc.recipient_email,
        )
        .first()),
      "O destinatário mudou ou está desativado. Atualize o rascunho.",
    );
    const now = new Date().toISOString();
    const r = await db
      .prepare(
        "UPDATE documents SET status='sent',version=version+1,sent_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? AND status='draft' AND archived=0",
      )
      .bind(now, id, d.version)
      .run();
    if (!r.meta.changes) fail(409, "O documento mudou ou já foi enviado.");
    await event(
      db,
      id,
      user,
      "sent",
      doc.version + 1,
      "Disponibilizado no portal do destinatário; sem envio de e-mail automático.",
    ).run();
    return json({ ok: true });
  }
  if (method === "POST" && action === "sign") {
    if (user.role !== "client" || user.id !== doc.recipient_id)
      fail(403, "Somente o destinatário pode assinar.");
    const d = await read(req, 240000);
    if (
      doc.status !== "sent" ||
      d.version !== doc.version ||
      d.document_sha256 !== doc.pdf_sha256
    )
      fail(409, "O documento mudou ou não aguarda assinatura.");
    check(
      d.consent === true,
      "É necessário concordar com a assinatura eletrônica.",
    );
    check(
      !!(await db
        .prepare(
          "SELECT id FROM document_events WHERE document_id=? AND actor_id=? AND action='viewed' AND version=?",
        )
        .bind(id, user.id, doc.version)
        .first()),
      "Abra e leia o documento antes de assinar.",
    );
    const name = field(d.name, 150, true);
    check(name.length >= 3, "Informe seu nome completo.");
    const password = field(d.password, 128, true),
      account = await db
        .prepare("SELECT password_hash FROM users WHERE id=? AND disabled=0")
        .bind(user.id)
        .first<{ password_hash: string }>();
    if (!account || !(await passwordVerify(password, account.password_hash)))
      fail(403, "Senha incorreta. A assinatura não foi concluída.");
    check(
      d.method === "typed" || d.method === "drawn",
      "Escolha uma assinatura digitada ou desenhada.",
    );
    let drawing: Uint8Array | null = null;
    if (d.method === "drawn") {
      drawing = decode(d.drawing, 160000);
      check(
        [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => drawing![i] === b) &&
          drawing.length >= 32,
        "Assinatura inválida.",
      );
      const view = new DataView(drawing.buffer);
      check(
        view.getUint32(16) > 0 &&
          view.getUint32(16) <= 1600 &&
          view.getUint32(20) > 0 &&
          view.getUint32(20) <= 600,
        "Dimensões da assinatura inválidas.",
      );
    }
    const source = await db
      .prepare("SELECT pdf FROM documents WHERE id=?")
      .bind(id)
      .first<{ pdf: ArrayBuffer }>();
    if ((await hashBytes(new Uint8Array(source!.pdf))) !== doc.pdf_sha256)
      fail(409, "A integridade do documento não pôde ser confirmada.");
    const at = new Date().toISOString();
    const manifest = JSON.stringify({
      schema: "ilustre-electronic-signature-v1",
      document_id: id,
      title: doc.title,
      document_sha256: doc.pdf_sha256,
      recipient_id: doc.recipient_id,
      signer_id: user.id,
      signer_name: name,
      account_name: user.name,
      signer_email: user.email,
      method: d.method,
      drawing_sha256: drawing ? await hashBytes(drawing) : null,
      consent: signingConsent,
      authentication: "portal_password",
      signed_at: at,
      document_version: doc.version,
      ip_sha256: await digest(
        req.headers.get("CF-Connecting-IP") ?? "unavailable",
      ),
      user_agent: (req.headers.get("User-Agent") ?? "").slice(0, 400),
      limitations:
        "Sem certificado ICP-Brasil, selo PAdES ou carimbo de tempo de autoridade independente.",
    });
    const fingerprint = await digest(manifest);
    const results = await db.batch([
      db
        .prepare(
          "INSERT INTO document_signatures(document_id,manifest,manifest_sha256,drawing,created_at) SELECT id,?,?,?,? FROM documents WHERE id=? AND version=? AND status='sent' AND archived=0" +
            scope(),
        )
        .bind(
          manifest,
          fingerprint,
          drawing?.buffer ?? null,
          at,
          id,
          doc.version,
          ...scopeArgs(),
        ),
      db
        .prepare(
          "UPDATE documents SET status='signed',signed_at=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? AND status='sent' AND archived=0" +
            scope(),
        )
        .bind(at, id, doc.version, ...scopeArgs()),
      db
        .prepare(
          "INSERT OR IGNORE INTO document_events(id,document_id,actor_id,action,version,detail,created_at) SELECT ?,id,?,'signed',version,?,? FROM documents WHERE id=? AND status='signed' AND signed_at=?",
        )
        .bind(crypto.randomUUID(), user.id, fingerprint, at, id, at),
    ]);
    if (!results[1].meta.changes)
      fail(409, "O documento não está mais disponível para assinatura.");
    return json({ ok: true, manifest_sha256: fingerprint });
  }
  if (method === "POST" && (action === "void" || action === "decline")) {
    if (action === "void") staff(user);
    else if (user.role !== "client")
      fail(403, "Somente o destinatário pode recusar.");
    const d = await read(req),
      reason = field(d.reason, 1000, true);
    check(reason.length >= 3, "Descreva o motivo.");
    const status = action === "void" ? "void" : "declined";
    const r = await db
      .prepare(
        `UPDATE documents SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? AND archived=0 AND ${action === "void" ? "status IN ('draft','sent')" : "status='sent'"}${scope()}`,
      )
      .bind(status, id, d.version, ...scopeArgs())
      .run();
    if (!r.meta.changes) fail(409, "O documento já foi concluído ou alterado.");
    await event(db, id, user, status, doc.version + 1, reason).run();
    return json({ ok: true });
  }
  if (method === "DELETE" && !action) {
    staff(user);
    const d = await read(req);
    const r = await db
      .prepare(
        "UPDATE documents SET archived=1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? AND status!='sent' AND archived=0",
      )
      .bind(id, d.version)
      .run();
    if (!r.meta.changes) fail(409, "Cancele o envio antes de arquivar.");
    await event(db, id, user, "archived", doc.version).run();
    return json({ ok: true });
  }
  fail(405, "Operação indisponível.");
}
