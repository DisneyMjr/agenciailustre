import { check, field, HttpError } from "./security";

export interface ProjectArtEnv {
  DB: D1Database;
  RESEND_API_KEY?: string;
  PROJECT_MAIL_FROM?: string;
}
type Viewer = { id: string; role: string; client_id: string | null };
type Project = { client_id: string | null; data: string };
type Version = { id: string; number: number; decision: string | null };
type Mail = { version_id: string; user_id: string; email: string; number: number; project_id: string; data: string };

const maxFileBytes = 1_500_000;
const maxBytes = 30_000_000;
const maxFiles = 20;
const bytesMatch = (bytes: Uint8Array, start: number, signature: number[]) =>
  signature.every((byte, index) => bytes[start + index] === byte);
function fileData(input: unknown) {
  check(input && typeof input === "object", "Arquivo inválido.");
  const file = input as Record<string, unknown>;
  const name = field(file.name, 150).replace(/[\u0000-\u001f\u007f/\\]/g, "_");
  check(name && typeof file.content === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(file.content),
    "Arquivo inválido.");
  let bytes: Uint8Array;
  try {
    const decoded = atob(file.content as string);
    bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  } catch {
    throw new HttpError(400, "Arquivo inválido.");
  }
  const mime = bytesMatch(bytes, 0, [255, 216, 255]) ? "image/jpeg"
    : bytesMatch(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10]) ? "image/png"
    : bytesMatch(bytes, 0, [82, 73, 70, 70]) && bytesMatch(bytes, 8, [87, 69, 66, 80]) ? "image/webp"
    : bytesMatch(bytes, 0, [37, 80, 68, 70, 45]) ? "application/pdf" : "";
  check(mime, "Use PDF, JPEG, PNG ou WebP.");
  return { name, mime, bytes };
}

const projectScope = "id=? AND kind='projects' AND archived=0";
export async function projectArtRoute(
  req: Request, env: ProjectArtEnv, user: Viewer, projectId: string, suffix: string,
  read: (req: Request, limit?: number) => Promise<Record<string, unknown>>,
  defer: (promise: Promise<unknown>) => void,
) {
  const json = (data: unknown, status = 200) => Response.json(data, {
    status, headers: { "Cache-Control": "no-store" },
  });
  const staff = user.role !== "client";
  const { DB } = env;
  const project = await DB.prepare("SELECT client_id,data FROM records WHERE " + projectScope)
    .bind(projectId).first<Project>();
  if (!project || (!staff && (!user.client_id || project.client_id !== user.client_id)))
    throw new HttpError(404, "Projeto não encontrado.");

  const scope = staff ? "" : " AND v.client_id=? AND EXISTS (SELECT 1 FROM records r WHERE r.id=v.project_id AND r.client_id=v.client_id AND r.archived=0)";
  const args = staff ? [projectId] : [projectId, user.client_id];
  if (!suffix && req.method === "GET") {
    const versions = await DB.prepare(`
      SELECT v.id,v.number,v.note,v.created_at,v.decision,v.comment,v.decided_at,
        json_group_array(json_object('id',f.id,'name',f.name,'mime',f.mime)) AS files,
        ${staff ? "(SELECT group_concat(m.state) FROM project_art_mail m WHERE m.version_id=v.id)" : "NULL"} AS mail
      FROM project_art_versions v JOIN project_art_files f ON f.version_id=v.id
      WHERE v.project_id=?${scope} GROUP BY v.id ORDER BY v.number DESC`)
      .bind(...args).all<{ files: string; mail: string | null }>();
    return json({
      title: JSON.parse(project.data).name,
      linked: Boolean(project.client_id),
      mailConfigured: staff && Boolean(env.RESEND_API_KEY && env.PROJECT_MAIL_FROM),
      versions: versions.results.map((version) => ({ ...version, files: JSON.parse(version.files) })),
    });
  }

  const fileId = suffix.match(/^\/files\/([a-f0-9-]{36})$/)?.[1];
  if (fileId && req.method === "GET") {
    const file = await DB.prepare(`
      SELECT f.name,f.mime,f.content FROM project_art_files f JOIN project_art_versions v ON v.id=f.version_id
      WHERE v.project_id=?${scope} AND f.id=?`)
      .bind(...args, fileId).first<{ name: string; mime: string; content: number[] | ArrayBuffer }>();
    if (!file) throw new HttpError(404, "Arte não encontrada.");
    const inline = file.mime.startsWith("image/") && new URL(req.url).searchParams.has("preview");
    return new Response(file.content instanceof ArrayBuffer ? new Uint8Array(file.content) : Uint8Array.from(file.content), { headers: {
      "Content-Type": file.mime,
      "Content-Disposition": (inline ? "inline" : "attachment") + "; filename*=UTF-8''" +
        encodeURIComponent(new TextDecoder().decode(new TextEncoder().encode(file.name))).replace(/['()*]/g,
          (symbol) => "%" + symbol.charCodeAt(0).toString(16)),
      "Cache-Control": "private, no-store",
    } });
  }

  if (suffix === "/upload" && req.method === "POST" && staff) {
    if (!project.client_id) throw new HttpError(409, "Vincule um cliente ao projeto.");
    const file = fileData(await read(req, 2_010_000));
    check(file.bytes.length <= maxFileBytes, "Cada arquivo pode ter até 1,5 MB.");
    const id = crypto.randomUUID();
    await DB.prepare(
      "INSERT INTO project_art_uploads(id,project_id,client_id,user_id,name,mime,content) VALUES (?,?,?,?,?,?,?)",
    ).bind(id, projectId, project.client_id, user.id, file.name, file.mime, file.bytes.buffer).run();
    return json({ id }, 201);
  }

  if (!suffix && req.method === "POST" && staff) {
    if (!project.client_id) throw new HttpError(409, "Vincule um cliente ao projeto.");
    const input = await read(req);
    const ids = input.uploads;
    check(Array.isArray(ids) && ids.length > 0 && ids.length <= maxFiles &&
      new Set(ids).size === ids.length && ids.every((id) => typeof id === "string" && /^[a-f0-9-]{36}$/.test(id)),
      "Anexe de 1 a 20 arquivos.");
    check(Number.isSafeInteger(input.previous) && Number(input.previous) >= 0, "Versão inválida.");
    const note = field(input.note ?? "", 2000);
    const uploads = "project_id=? AND client_id=? AND user_id=? AND id IN (" + ids.map(() => "?").join(",") + ")";
    const args = [projectId, project.client_id, user.id, ...ids];
    const id = crypto.randomUUID();
    const written = await DB.batch([
      DB.prepare(`INSERT INTO project_art_versions(id,project_id,client_id,number,author_id,note)
        SELECT ?,r.id,r.client_id,?, ?,? FROM records r
        WHERE r.${projectScope} AND r.client_id=?
        AND COALESCE((SELECT MAX(v.number) FROM project_art_versions v WHERE v.project_id=r.id),0)=?
        AND (SELECT COUNT(*) FROM project_art_uploads WHERE ${uploads})=?
        AND (SELECT SUM(length(content)) FROM project_art_uploads WHERE ${uploads})<=?`)
        .bind(id, Number(input.previous) + 1, user.id, note, projectId, project.client_id, input.previous, ...args, ids.length, ...args, maxBytes),
      DB.prepare(`INSERT INTO project_art_files(id,version_id,name,mime,content)
        SELECT id,?,name,mime,content FROM project_art_uploads
        WHERE ${uploads} AND EXISTS (SELECT 1 FROM project_art_versions WHERE id=?)`)
        .bind(id, ...args, id),
      DB.prepare(`DELETE FROM project_art_uploads WHERE ${uploads}
        AND EXISTS (SELECT 1 FROM project_art_versions WHERE id=?)`).bind(...args, id),
      DB.prepare(`INSERT INTO project_art_mail(version_id,user_id)
        SELECT v.id,u.id FROM project_art_versions v JOIN users u ON u.client_id=v.client_id
        WHERE v.id=? AND u.role='client' AND u.disabled=0`).bind(id),
      DB.prepare(`UPDATE records SET data=json_remove(json_set(data,'$.status','Em aprovação'),
        '$.approval_decision','$.approval_comment','$.approval_by','$.approval_at'), updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND EXISTS (SELECT 1 FROM project_art_versions WHERE id=?)`).bind(projectId, id),
    ]);
    if (!written[0].meta.changes) throw new HttpError(409, "O projeto mudou. Atualize a lista antes de enviar.");
    defer(sendProjectArtMail(env, id));
    return json({ ok: true, recipients: written[3].meta.changes }, 201);
  }

  const decisionId = suffix.match(/^\/([a-f0-9-]{36})\/decision$/)?.[1];
  if (decisionId && req.method === "POST" && !staff) {
    const { decision, comment: rawComment } = await read(req);
    check(decision === "approve" || decision === "changes", "Decisão inválida.");
    const comment = field(rawComment ?? "", 2000);
    check(decision !== "changes" || comment.length >= 5, "Descreva o ajuste necessário.");
    const time = new Date().toISOString();
    const latest = await DB.prepare(`SELECT id,number,decision FROM project_art_versions
      WHERE project_id=? ORDER BY number DESC LIMIT 1`).bind(projectId).first<Version>();
    if (latest?.id !== decisionId || latest.decision)
      throw new HttpError(409, "Esta versão já foi respondida ou substituída.");
    const result = await DB.prepare(`UPDATE project_art_versions SET decision=?,comment=?,decided_by=?,decided_at=?
      WHERE id=? AND client_id=? AND decision IS NULL
      AND number=(SELECT MAX(v.number) FROM project_art_versions v WHERE v.project_id=?)
      AND EXISTS (SELECT 1 FROM records WHERE ${projectScope} AND client_id=?)`)
      .bind(decision, comment, user.id, time, decisionId, user.client_id, projectId, projectId, user.client_id).run();
    if (!result.meta.changes) throw new HttpError(409, "Esta versão já foi respondida ou substituída.");
    return json({ ok: true });
  }

  throw new HttpError(404, "Ação indisponível.");
}

export async function sendProjectArtMail(env: ProjectArtEnv, versionId?: string) {
  const { DB, RESEND_API_KEY, PROJECT_MAIL_FROM } = env;
  if (!RESEND_API_KEY || !PROJECT_MAIL_FROM) return;
  const now = Math.floor(Date.now() / 1000);
  const due = await DB.prepare(`
    SELECT m.version_id,m.user_id,u.email,v.number,v.project_id,r.data
    FROM project_art_mail m JOIN project_art_versions v ON v.id=m.version_id
    JOIN records r ON r.id=v.project_id JOIN users u ON u.id=m.user_id
    WHERE m.state='pending' AND m.next_try<=? AND u.disabled=0 AND u.role='client'
      AND u.client_id=v.client_id AND r.client_id=v.client_id AND r.archived=0
      AND v.decision IS NULL AND v.number=(SELECT MAX(n.number) FROM project_art_versions n WHERE n.project_id=v.project_id)
      ${versionId ? "AND m.version_id=?" : ""}
    ORDER BY m.next_try LIMIT 5`).bind(...(versionId ? [now, versionId] : [now])).all<Mail>();
  await Promise.all(due.results.map(async (mail) => {
    const lease = await DB.prepare(`UPDATE project_art_mail SET next_try=?, attempts=attempts+1
      WHERE version_id=? AND user_id=? AND state='pending' AND next_try<=? RETURNING attempts`)
      .bind(now + 300, mail.version_id, mail.user_id, now).first<{ attempts: number }>();
    if (!lease) return;
    let state = "pending";
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: "Bearer " + RESEND_API_KEY,
          "Content-Type": "application/json",
          "Idempotency-Key": "ilustre-arte/" + mail.version_id + "/" + mail.user_id,
        },
        body: JSON.stringify({
          from: PROJECT_MAIL_FROM, to: [mail.email],
          subject: "Agência Ilustre | Arte disponível para aprovação",
          text: `A versão ${mail.number} de "${JSON.parse(mail.data).name}" está disponível. Entre no portal para aprovar ou solicitar ajustes:\n\nhttps://agenciailustre.disneymjr.workers.dev/portal?arte=${mail.project_id}`,
        }),
      });
      const error = !response.ok && response.status === 429
        ? await response.json<{ name?: string }>().catch(() => null) : null;
      if (response.ok) state = "sent";
      else if (error?.name === "daily_quota_exceeded" || error?.name === "monthly_quota_exceeded")
        state = "failed";
      else if (response.status >= 400 && response.status < 500 && ![409, 429].includes(response.status))
        state = "failed";
    } catch {
      // A próxima execução retoma após o prazo da tentativa.
    }
    if (lease.attempts >= 5 && state === "pending") state = "failed";
    await DB.prepare("UPDATE project_art_mail SET state=? WHERE version_id=? AND user_id=? AND attempts=?")
      .bind(state, mail.version_id, mail.user_id, lease.attempts).run();
  }));
}
