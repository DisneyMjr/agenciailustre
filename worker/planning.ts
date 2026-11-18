import { check, email, field, HttpError } from "./security";
type Actor = { id: string; role: string; client_id: string | null } | null;
type ReadBody = (
  req: Request,
  max?: number,
) => Promise<Record<string, unknown>>;
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
const staff = (u: Actor) => {
  if (!u || u.role === "client")
    fail(u ? 403 : 401, "Apenas a equipe pode gerenciar.");
};
function instant(value: unknown) {
  const s = field(value, 40, true);
  check(
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(s),
    "Envie uma data e horário válidos.",
  );
  const d = new Date(s);
  check(Number.isFinite(+d), "Data inválida.");
  check(d.toISOString().slice(0, 19) === s.slice(0, 19), "Data inválida.");
  return d.toISOString();
}
async function client(db: D1Database, id: unknown) {
  const value = field(id, 36, true);
  check(
    !!(await db
      .prepare(
        "SELECT id FROM records WHERE id=? AND kind='clients' AND archived=0",
      )
      .bind(value)
      .first()),
    "Selecione um cliente ativo.",
  );
  return value;
}
async function audit(db: D1Database, u: Actor, action: string, id: string) {
  await db
    .prepare("INSERT INTO audit(user_id,action,record_id) VALUES(?,?,?)")
    .bind(u?.id ?? null, action, id)
    .run();
}
export async function planningRoute(
  req: Request,
  db: D1Database,
  user: Actor,
  read: ReadBody,
): Promise<Response | null> {
  const url = new URL(req.url),
    path = url.pathname.replace(/\/$/, ""),
    method = req.method;
  if (!/^\/api\/(?:scheduling|meetings|editorial)(?:\/|$)/.test(path))
    return null;
  const now = new Date().toISOString();
  if (path === "/api/scheduling/slots" && method === "GET") {
    const rows = await db
      .prepare(
        "SELECT s.id,s.starts_at,s.ends_at FROM meeting_slots s WHERE s.archived=0 AND s.starts_at>? AND NOT EXISTS(SELECT 1 FROM meetings m WHERE m.slot_id=s.id AND m.status IN ('pending','confirmed')) ORDER BY s.starts_at LIMIT 100",
      )
      .bind(now)
      .all();
    return json({ slots: rows.results });
  }
  if (path === "/api/scheduling/book" && method === "POST") {
    const d = await read(req);
    check(d.consent === true, "Autorize o uso dos dados para o agendamento.");
    const slot = field(d.slot_id, 36, true),
      name = field(d.name, 100, true),
      address = email(d.email),
      notes = field(d.notes ?? "", 1500);
    const id = crypto.randomUUID();
    try {
      const result = await db
        .prepare(
          "INSERT INTO meetings(id,slot_id,name,email,notes,client_id,status) SELECT ?,s.id,?,?,?,?,'pending' FROM meeting_slots s WHERE s.id=? AND s.archived=0 AND s.starts_at>? AND NOT EXISTS(SELECT 1 FROM meetings m WHERE m.slot_id=s.id AND m.status IN ('pending','confirmed'))",
        )
        .bind(
          id,
          name,
          address,
          notes,
          user?.role === "client" ? user.client_id : null,
          slot,
          now,
        )
        .run();
      if (!result.meta.changes)
        fail(409, "Esse horário não está mais disponível. Escolha outro.");
    } catch (e) {
      if (e instanceof HttpError) throw e;
      if (String(e).includes("UNIQUE"))
        fail(409, "Esse horário já foi reservado.");
      throw e;
    }
    return json({ id, status: "pending" }, 201);
  }
  if (!user) fail(401, "Entre na sua conta.");
  if (path === "/api/meetings/slots") {
    staff(user);
    if (method === "GET")
      return json({
        slots: (
          await db
            .prepare(
              "SELECT s.*,m.id AS meeting_id,m.status AS meeting_status FROM meeting_slots s LEFT JOIN meetings m ON m.slot_id=s.id AND m.status IN ('pending','confirmed') WHERE s.archived=0 AND s.ends_at>? ORDER BY s.starts_at LIMIT 200",
            )
            .bind(now)
            .all()
        ).results,
      });
    if (method === "POST") {
      const d = await read(req),
        start = instant(d.starts_at),
        end = instant(d.ends_at),
        duration = Date.parse(end) - Date.parse(start);
      check(
        start > now && Date.parse(start) < Date.now() + 366 * 86400000,
        "Escolha um horário futuro em até um ano.",
      );
      check(
        duration >= 15 * 60000 && duration <= 120 * 60000,
        "A reunião deve durar entre 15 e 120 minutos.",
      );
      const id = crypto.randomUUID();
      const r = await db
        .prepare(
          "INSERT INTO meeting_slots(id,starts_at,ends_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM meeting_slots WHERE archived=0 AND starts_at<? AND ends_at>?)",
        )
        .bind(id, start, end, end, start)
        .run();
      if (!r.meta.changes)
        fail(409, "Já existe um horário que coincide com esse período.");
      await audit(db, user, "meeting.slot.created", id);
      return json({ id }, 201);
    }
  }
  const slotMatch = path.match(/^\/api\/meetings\/slots\/([a-f0-9-]{36})$/);
  if (slotMatch && method === "DELETE") {
    staff(user);
    const r = await db
      .prepare(
        "UPDATE meeting_slots SET archived=1 WHERE id=? AND archived=0 AND NOT EXISTS(SELECT 1 FROM meetings WHERE slot_id=meeting_slots.id AND status IN ('pending','confirmed'))",
      )
      .bind(slotMatch[1])
      .run();
    if (!r.meta.changes)
      fail(
        409,
        "Horário indisponível ou reservado. Cancele a reunião antes de arquivar.",
      );
    await audit(db, user, "meeting.slot.archived", slotMatch[1]);
    return json({ ok: true });
  }
  if (path === "/api/meetings" && method === "GET") {
    const page = Math.max(
      0,
      Math.min(10000, Number(url.searchParams.get("page")) || 0),
    );
    const rows = await db
      .prepare(
        `SELECT m.*,s.starts_at,s.ends_at FROM meetings m JOIN meeting_slots s ON s.id=m.slot_id ${user.role === "client" ? "WHERE m.client_id=?" : ""} ORDER BY s.starts_at DESC,m.created_at DESC LIMIT 51 OFFSET ?`,
      )
      .bind(
        ...(user.role === "client" ? [user.client_id ?? ""] : []),
        page * 50,
      )
      .all();
    return json({
      meetings: rows.results.slice(0, 50),
      more: rows.results.length > 50,
    });
  }
  const meetingMatch = path.match(/^\/api\/meetings\/([a-f0-9-]{36})$/);
  if (meetingMatch && method === "PUT") {
    const d = await read(req);
    check(
      ["confirmed", "cancelled"].includes(String(d.status)),
      "Situação inválida.",
    );
    if (user.role === "client" && d.status !== "cancelled")
      fail(403, "A confirmação é feita pela equipe.");
    const r = await db
      .prepare(
        `UPDATE meetings SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','confirmed') ${user.role === "client" ? "AND client_id=?" : ""}`,
      )
      .bind(
        d.status,
        meetingMatch[1],
        ...(user.role === "client" ? [user.client_id ?? ""] : []),
      )
      .run();
    if (!r.meta.changes)
      fail(409, "A reunião não está disponível para essa alteração.");
    await audit(db, user, "meeting." + d.status, meetingMatch[1]);
    return json({ ok: true });
  }
  if (path === "/api/editorial" && method === "GET") {
    const month =
      url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    check(/^\d{4}-(0[1-9]|1[0-2])$/.test(month), "Mês inválido.");
    // Include a day around month boundaries so the Brasília calendar can filter locally.
    const start = new Date(month + "-01T00:00:00-03:00"),
      end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const page = Math.max(
      0,
      Math.min(10000, Number(url.searchParams.get("page")) || 0),
    );
    const rows = await db
      .prepare(
        `SELECT e.*,(SELECT comment FROM editorial_reviews r WHERE r.editorial_id=e.id ORDER BY r.version DESC,r.created_at DESC LIMIT 1) AS review_comment FROM editorial e WHERE e.archived=0 AND e.scheduled_at>=? AND e.scheduled_at<? ${user.role === "client" ? "AND e.client_id=? AND e.status!='draft'" : ""} ORDER BY e.scheduled_at,e.id LIMIT 51 OFFSET ?`,
      )
      .bind(
        start.toISOString(),
        end.toISOString(),
        ...(user.role === "client" ? [user.client_id ?? ""] : []),
        page * 50,
      )
      .all();
    return json({
      posts: rows.results.slice(0, 50),
      more: rows.results.length > 50,
    });
  }
  if (path === "/api/editorial" && method === "POST") {
    staff(user);
    const d = await read(req),
      data = await postData(db, d),
      id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO editorial(id,client_id,title,caption,channel,scheduled_at,asset_url,status) VALUES(?,?,?,?,?,?,?,'draft')",
      )
      .bind(id, ...data)
      .run();
    await audit(db, user, "editorial.created", id);
    return json({ id }, 201);
  }
  const postMatch = path.match(
    /^\/api\/editorial\/([a-f0-9-]{36})(?:\/(approval|history))?$/,
  );
  if (postMatch) {
    const [, id, action] = postMatch;
    const post = await db
      .prepare("SELECT * FROM editorial WHERE id=? AND archived=0")
      .bind(id)
      .first<{ client_id: string; status: string; version: number }>();
    if (
      !post ||
      (user.role === "client" &&
        (post.client_id !== user.client_id || post.status === "draft"))
    )
      fail(404, "Conteúdo não encontrado.");
    if (action === "history" && method === "GET")
      return json({
        reviews: (
          await db
            .prepare(
              "SELECT decision,comment,version,created_at FROM editorial_reviews WHERE editorial_id=? ORDER BY version DESC LIMIT 100",
            )
            .bind(id)
            .all()
        ).results,
      });
    if (action === "approval" && method === "POST") {
      if (user.role !== "client" || !user.client_id)
        fail(403, "Somente o cliente vinculado pode aprovar.");
      const d = await read(req);
      check(
        ["approved", "changes"].includes(String(d.decision)),
        "Decisão inválida.",
      );
      const comment = field(d.comment ?? "", 1500);
      check(
        d.decision !== "changes" || comment.length >= 3,
        "Descreva o ajuste solicitado.",
      );
      if (post.status !== "review" || d.version !== post.version)
        fail(
          409,
          "O conteúdo mudou ou não aguarda aprovação. Atualize a página.",
        );
      // Conditional insert and update share the same atomic D1 batch. A stale review leaves no history.
      const results = await db.batch([
        db
          .prepare(
            "INSERT INTO editorial_reviews(id,editorial_id,user_id,decision,comment,version) SELECT ?,id,?,?,?,version FROM editorial WHERE id=? AND version=? AND status='review' AND archived=0",
          )
          .bind(
            crypto.randomUUID(),
            user.id,
            d.decision,
            comment,
            id,
            d.version,
          ),
        db
          .prepare(
            "UPDATE editorial SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? AND status='review' AND archived=0",
          )
          .bind(d.decision, id, d.version),
      ]);
      if (!results[1].meta.changes)
        fail(409, "O conteúdo mudou. Atualize a página.");
      await audit(db, user, "editorial." + d.decision, id);
      return json({ ok: true });
    }
    staff(user);
    if (!action && method === "PUT") {
      const d = await read(req);
      check(Number.isInteger(d.version), "Versão obrigatória.");
      let r;
      if (d.transition) {
        check(
          ["review", "published"].includes(String(d.transition)),
          "Etapa inválida.",
        );
        if (d.transition === "published" && post.status !== "approved")
          fail(409, "A publicação exige aprovação do cliente.");
        if (
          d.transition === "review" &&
          !["draft", "changes", "approved"].includes(post.status)
        )
          fail(409, "Conteúdo já enviado ou publicado.");
        r = await db
          .prepare(
            "UPDATE editorial SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? AND archived=0",
          )
          .bind(d.transition, id, d.version)
          .run();
      } else {
        const data = await postData(db, d);
        r = await db
          .prepare(
            "UPDATE editorial SET client_id=?,title=?,caption=?,channel=?,scheduled_at=?,asset_url=?,status='draft',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? AND archived=0",
          )
          .bind(...data, id, d.version)
          .run();
      }
      if (!r.meta.changes)
        fail(409, "Outra pessoa alterou o conteúdo. Atualize antes de salvar.");
      await audit(db, user, "editorial.updated", id);
      return json({ ok: true });
    }
    if (!action && method === "DELETE") {
      const d = await read(req);
      const r = await db
        .prepare(
          "UPDATE editorial SET archived=1,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? AND archived=0",
        )
        .bind(id, d.version)
        .run();
      if (!r.meta.changes) fail(409, "Conteúdo alterado. Atualize a página.");
      await audit(db, user, "editorial.archived", id);
      return json({ ok: true });
    }
  }
  fail(405, "Operação indisponível.");
}
async function postData(db: D1Database, d: Record<string, unknown>) {
  const customer = await client(db, d.client_id),
    title = field(d.title, 160, true),
    caption = field(d.caption ?? "", 5000),
    channel = field(d.channel, 40, true),
    at = instant(d.scheduled_at),
    asset = field(d.asset_url ?? "", 1000);
  check(
    [
      "Instagram",
      "Facebook",
      "LinkedIn",
      "TikTok",
      "YouTube",
      "Outro",
    ].includes(channel),
    "Canal inválido.",
  );
  if (asset) {
    let url: URL;
    try {
      url = new URL(asset);
    } catch {
      fail(400, "Link inválido.");
    }
    check(
      url.protocol === "https:" && !url.username && !url.password,
      "Use um link HTTPS sem credenciais.",
    );
  }
  return [customer, title, caption, channel, at, asset];
}
