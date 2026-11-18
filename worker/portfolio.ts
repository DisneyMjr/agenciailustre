import { check, field, HttpError } from "./security";
type Actor = { id: string; role: string } | null;
type ReadBody = (
  request: Request,
  maxBytes?: number,
) => Promise<Record<string, unknown>>;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
const columns =
  "id,title,category,summary,project_url,published,featured,image_version,created_at,updated_at";
function imageData(input: Record<string, unknown>) {
  check(
    typeof input.base64 === "string" && input.base64.length <= 820000,
    "Imagem muito grande.",
  );
  let binary = "";
  try {
    binary = atob(input.base64);
  } catch {
    throw new HttpError(400, "Imagem inválida.");
  }
  check(
    binary.length > 0 && binary.length <= 600000,
    "A imagem precisa ter até 600 KB.",
  );
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const mime = String(input.mime ?? "");
  const valid =
    mime === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : mime === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
        : mime === "image/webp"
          ? new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
            new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
          : false;
  check(valid, "Envie uma imagem JPEG, PNG ou WebP válida.");
  return { bytes, mime };
}
export async function portfolioRoute(
  req: Request,
  db: D1Database,
  user: Actor,
  readBody: ReadBody,
): Promise<Response | null> {
  const url = new URL(req.url),
    path = url.pathname.replace(/\/$/, "");
  const admin = path.startsWith("/api/admin/portfolio");
  if (!admin && !path.startsWith("/api/portfolio")) return null;
  if (admin && user?.role !== "admin")
    throw new HttpError(
      user ? 403 : 401,
      "Apenas administradores podem gerenciar o portfólio.",
    );
  const match = path.match(
    /^\/api\/(?:admin\/)?portfolio(?:\/([a-f0-9-]{36}))?(\/image)?$/,
  );
  if (!match) throw new HttpError(404, "Trabalho não encontrado.");
  const [, id, image] = match,
    method = req.method;
  if (method === "GET" && image && id) {
    const row = await db
      .prepare(
        `SELECT image,image_mime FROM portfolio WHERE id=? AND archived=0${admin ? "" : " AND published=1"}`,
      )
      .bind(id)
      .first<{ image: ArrayBuffer; image_mime: string }>();
    if (!row?.image) throw new HttpError(404, "Imagem não encontrada.");
    return new Response(new Uint8Array(row.image), {
      headers: {
        "Content-Type": row.image_mime,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (method === "GET" && !id) {
    const page = Math.max(
        0,
        Math.min(10000, Math.floor(Number(url.searchParams.get("page")) || 0)),
      ),
      size = admin ? 50 : 6;
    const rows = await db
      .prepare(
        `SELECT ${columns} FROM portfolio WHERE archived=0${admin ? "" : " AND published=1"} ORDER BY featured DESC,created_at DESC,id LIMIT ? OFFSET ?`,
      )
      .bind(size + 1, page * size)
      .all<Record<string, unknown>>();
    return json({
      portfolio: rows.results
        .slice(0, size)
        .map((row) => ({
          ...row,
          published: !!row.published,
          featured: !!row.featured,
          image_url: row.image_version
            ? `/api/${admin ? "admin/" : ""}portfolio/${row.id}/image?v=${row.image_version}`
            : null,
        })),
      more: rows.results.length > size,
    });
  }
  if (!admin) throw new HttpError(405, "Método não permitido.");
  if (
    id &&
    !(await db
      .prepare("SELECT id FROM portfolio WHERE id=? AND archived=0")
      .bind(id)
      .first())
  )
    throw new HttpError(404, "Trabalho não encontrado.");
  if (method === "POST" && id && image) {
    const { bytes, mime } = imageData(await readBody(req, 850000));
    await db.batch([
      db
        .prepare(
          "UPDATE portfolio SET image=?,image_mime=?,image_version=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND archived=0",
        )
        .bind(bytes.buffer, mime, crypto.randomUUID(), id),
      db
        .prepare("INSERT INTO audit(user_id,action,record_id) VALUES(?,?,?)")
        .bind(user!.id, "portfolio_image", id),
    ]);
    return json({ ok: true });
  }
  if (image) throw new HttpError(405, "Método não permitido.");
  if ((method === "POST" && !id) || (method === "PUT" && id)) {
    const data = await readBody(req),
      title = field(data.title, 160, true),
      category = field(data.category, 80, true),
      summary = field(data.summary ?? "", 1800),
      projectUrl = field(data.project_url ?? "", 1000);
    check(
      typeof data.published === "boolean" && typeof data.featured === "boolean",
      "Defina o estado de publicação.",
    );
    if (projectUrl) {
      let valid = false;
      try {
        const parsed = new URL(projectUrl);
        valid =
          parsed.protocol === "https:" && !parsed.username && !parsed.password;
      } catch {}
      check(valid, "Use um endereço HTTPS válido para o projeto.");
    }
    const recordId = id ?? crypto.randomUUID();
    const statement = id
      ? db
          .prepare(
            "UPDATE portfolio SET title=?,category=?,summary=?,project_url=?,published=?,featured=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND archived=0",
          )
          .bind(
            title,
            category,
            summary,
            projectUrl,
            +data.published,
            +data.featured,
            id,
          )
      : db
          .prepare(
            "INSERT INTO portfolio(id,title,category,summary,project_url,published,featured) VALUES(?,?,?,?,?,?,?)",
          )
          .bind(
            recordId,
            title,
            category,
            summary,
            projectUrl,
            +data.published,
            +data.featured,
          );
    await db.batch([
      statement,
      db
        .prepare("INSERT INTO audit(user_id,action,record_id) VALUES(?,?,?)")
        .bind(user!.id, id ? "portfolio_update" : "portfolio_create", recordId),
    ]);
    return json({ id: recordId }, id ? 200 : 201);
  }
  if (method === "DELETE" && id) {
    await db.batch([
      db
        .prepare(
          "UPDATE portfolio SET archived=1,published=0,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .bind(id),
      db
        .prepare("INSERT INTO audit(user_id,action,record_id) VALUES(?,?,?)")
        .bind(user!.id, "portfolio_archive", id),
    ]);
    return json({ ok: true });
  }
  throw new HttpError(405, "Método não permitido.");
}
