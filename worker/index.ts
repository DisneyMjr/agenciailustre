import {
  kinds,
  Kind,
  HttpError,
  check,
  field,
  email,
  random,
  digest,
  equal,
  passwordHash,
  passwordVerify,
  recordData,
} from "./security";
interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BOOTSTRAP_TOKEN?: string;
}
interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "team" | "client";
  client_id: string | null;
  password_hash?: string;
  disabled?: number;
}
const json = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
async function body(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) fail(400, "Pedido vazio.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 24000) {
      await reader.cancel();
      fail(413, "Pedido muito grande.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  try {
    const data = JSON.parse(text);
    check(
      data && typeof data === "object" && !Array.isArray(data),
      "Pedido inválido.",
    );
    return data as Record<string, unknown>;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    return fail(400, "JSON inválido.");
  }
}
async function limit(env: Env, key: string, max: number, seconds = 900) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count",
  )
    .bind(key, now + seconds, now, now)
    .first<{ count: number }>();
  if ((row?.count ?? max + 1) > max)
    fail(429, "Muitas tentativas. Aguarde alguns minutos.");
}
async function current(req: Request, env: Env) {
  const token = req.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)ilustre_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return null;
  return env.DB.prepare(
    "SELECT u.id,u.email,u.name,u.role,u.client_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0",
  )
    .bind(await digest(token), Math.floor(Date.now() / 1000))
    .first<User>();
}
async function session(user: User, env: Env, req: Request) {
  const token = random();
  await env.DB.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
  )
    .bind(await digest(token), user.id, Math.floor(Date.now() / 1000) + 28800)
    .run();
  return json(
    {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        client_id: user.client_id,
      },
    },
    200,
    {
      "Set-Cookie": `ilustre_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`,
    },
  );
}
const allowedRead = (user: User, kind: string) =>
  user.role !== "client" || ["projects", "tasks", "finance"].includes(kind);
async function api(req: Request, env: Env) {
  const url = new URL(req.url),
    path = url.pathname.replace(/\/$/, "");
  const method = req.method;
  if (!["GET", "HEAD"].includes(method)) {
    if (req.headers.get("Origin") !== url.origin)
      fail(403, "Origem não autorizada.");
    if (!req.headers.get("Content-Type")?.startsWith("application/json"))
      fail(415, "Envie JSON.");
  }
  const ip = await digest(req.headers.get("CF-Connecting-IP") ?? "local");
  if (path === "/api/health" && method === "GET") return json({ ok: true });
  if (path === "/api/setup" && method === "POST") {
    if (!env.BOOTSTRAP_TOKEN)
      fail(
        503,
        "A configuração inicial precisa ser habilitada pelo responsável.",
      );
    await limit(env, `setup:${ip}`, 5);
    const data = await body(req);
    if (!equal(String(data.token ?? ""), env.BOOTSTRAP_TOKEN))
      fail(403, "Código de configuração inválido.");
    if (await env.DB.prepare("SELECT id FROM users LIMIT 1").first())
      fail(409, "A conta inicial já foi criada.");
    const password = field(data.password, 128, true);
    check(password.length >= 12, "Use uma senha com pelo menos 12 caracteres.");
    const user: User = {
      id: crypto.randomUUID(),
      name: field(data.name, 100, true),
      email: email(data.email),
      role: "admin",
      client_id: null,
    };
    const hash = await passwordHash(password);
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO setup_lock(id) VALUES(1)"),
        env.DB.prepare(
          "INSERT INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)",
        ).bind(user.id, user.email, user.name, hash, user.role),
      ]);
    } catch {
      fail(409, "A conta inicial já foi criada.");
    }
    return session(user, env, req);
  }
  if (path === "/api/login" && method === "POST") {
    await limit(env, `login-ip:${ip}`, 20);
    const data = await body(req);
    const address = email(data.email);
    await limit(env, `login-mail:${await digest(address)}`, 10);
    const password = field(data.password, 128, true);
    const user = await env.DB.prepare(
      "SELECT * FROM users WHERE email=? AND disabled=0",
    )
      .bind(address)
      .first<User>();
    const fallback =
      "not-a-user:0000000000000000000000000000000000000000000000000000000000000000";
    if (
      !(await passwordVerify(password, user?.password_hash ?? fallback)) ||
      !user
    )
      fail(401, "E-mail ou senha incorretos.");
    return session(user, env, req);
  }
  if (path === "/api/contact" && method === "POST") {
    await limit(env, `contact:${ip}`, 5, 3600);
    const data = await body(req);
    if (data.website) return json({ ok: true });
    check(data.consent === true, "É necessário autorizar o contato.");
    const details = recordData("leads", {
      name: data.name,
      email: email(data.email),
      notes: data.message,
      status: "Novo contato",
    });
    check(
      String(details.notes).length >= 10,
      "Conte um pouco mais sobre o projeto.",
    );
    await env.DB.prepare("INSERT INTO records(id,kind,data) VALUES(?,?,?)")
      .bind(crypto.randomUUID(), "leads", JSON.stringify(details))
      .run();
    return json({ ok: true }, 201);
  }
  const user = await current(req, env);
  if (!user) fail(401, "Entre na sua conta para continuar.");
  if (path === "/api/me" && method === "GET") return json({ user });
  if (path === "/api/logout" && method === "POST") {
    const token = req.headers
      .get("Cookie")
      ?.match(/ilustre_session=([a-f0-9]{64})/)?.[1];
    if (token)
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await digest(token))
        .run();
    return json({ ok: true }, 200, {
      "Set-Cookie":
        "ilustre_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure",
    });
  }
  if (path === "/api/password" && method === "POST") {
    const data = await body(req);
    const row = await env.DB.prepare(
      "SELECT password_hash FROM users WHERE id=?",
    )
      .bind(user.id)
      .first<{ password_hash: string }>();
    await limit(env, `password:${user.id}`, 5);
    if (
      !row ||
      !(await passwordVerify(field(data.current, 128, true), row.password_hash))
    )
      fail(403, "Senha atual incorreta.");
    const password = field(data.password, 128, true);
    check(password.length >= 12, "Use pelo menos 12 caracteres.");
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(
        await passwordHash(password),
        user.id,
      ),
      env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
    ]);
    return json({ ok: true });
  }
  if (path === "/api/users") {
    if (user.role !== "admin")
      fail(403, "Apenas administradores podem gerenciar acessos.");
    if (method === "GET")
      return json({
        users: (
          await env.DB.prepare(
            "SELECT id,email,name,role,client_id,disabled FROM users ORDER BY name",
          ).all()
        ).results,
      });
    if (method === "POST") {
      const data = await body(req);
      check(["team", "client"].includes(String(data.role)), "Perfil inválido.");
      const password = field(data.password, 128, true);
      check(password.length >= 12, "Use pelo menos 12 caracteres.");
      const client =
        data.role === "client" ? field(data.client_id, 36, true) : null;
      if (
        client &&
        !(await env.DB.prepare(
          "SELECT id FROM records WHERE id=? AND kind='clients' AND archived=0",
        )
          .bind(client)
          .first())
      )
        fail(400, "Cliente não encontrado.");
      try {
        await env.DB.prepare(
          "INSERT INTO users(id,email,name,password_hash,role,client_id) VALUES(?,?,?,?,?,?)",
        )
          .bind(
            crypto.randomUUID(),
            email(data.email),
            field(data.name, 100, true),
            await passwordHash(password),
            data.role,
            client,
          )
          .run();
      } catch {
        fail(409, "Este e-mail já possui acesso.");
      }
      return json({ ok: true }, 201);
    }
  }
  const userMatch = path.match(/^\/api\/users\/([a-f0-9-]{36})$/);
  if (userMatch && method === "PATCH") {
    if (user.role !== "admin")
      fail(403, "Apenas administradores podem gerenciar acessos.");
    const target = userMatch[1];
    if (target === user.id)
      fail(400, "Altere sua própria senha na seção Meu acesso.");
    const existing = await env.DB.prepare(
      "SELECT id,role FROM users WHERE id=?",
    )
      .bind(target)
      .first<User>();
    if (!existing) fail(404, "Acesso não encontrado.");
    if (existing.role === "admin")
      fail(403, "Não é possível alterar outro administrador por esta rota.");
    const data = await body(req);
    let update: D1PreparedStatement;
    if (data.action === "disable" || data.action === "enable")
      update = env.DB.prepare("UPDATE users SET disabled=? WHERE id=?").bind(
        data.action === "disable" ? 1 : 0,
        target,
      );
    else if (data.action === "password") {
      const password = field(data.password, 128, true);
      check(password.length >= 12, "Use pelo menos 12 caracteres.");
      update = env.DB.prepare(
        "UPDATE users SET password_hash=? WHERE id=?",
      ).bind(await passwordHash(password), target);
    } else return fail(400, "Ação inválida.");
    await env.DB.batch([
      update,
      env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(target),
      env.DB.prepare(
        "INSERT INTO audit(user_id,action,record_id) VALUES(?,?,?)",
      ).bind(user.id, String(data.action), target),
    ]);
    return json({ ok: true });
  }
  if (path === "/api/export" && method === "GET") {
    if (user.role !== "admin")
      fail(403, "Apenas administradores podem exportar.");
    const results = await env.DB.prepare(
      "SELECT * FROM records ORDER BY created_at",
    ).all();
    return json({
      exported_at: new Date().toISOString(),
      records: results.results,
    });
  }
  const match = path.match(/^\/api\/records\/([a-z]+)(?:\/([a-f0-9-]{36}))?$/);
  if (match) {
    const kind = match[1] as Kind,
      id = match[2];
    if (!kinds.includes(kind)) fail(404, "Seção não encontrada.");
    if (!allowedRead(user, kind)) fail(403, "Acesso não autorizado.");
    if (method === "GET" && !id) {
      const search = url.searchParams.get("q")?.slice(0, 100) ?? "";
      const page = Math.max(
        0,
        Math.min(100000, Number(url.searchParams.get("page")) || 0),
      );
      const scope = user.role === "client" ? " AND client_id=?" : "";
      const args: unknown[] = [kind, `%${search}%`];
      if (user.role === "client") args.push(user.client_id ?? "NO_CLIENT");
      args.push(51, page * 50);
      const rows = await env.DB.prepare(
        `SELECT * FROM records WHERE kind=? AND archived=0 AND json_extract(data,'$.name') LIKE ?${scope} ORDER BY updated_at DESC,id LIMIT ? OFFSET ?`,
      )
        .bind(...args)
        .all<{
          id: string;
          data: string;
          client_id: string;
          updated_at: string;
        }>();
      return json({
        records: rows.results
          .slice(0, 50)
          .map((r) => ({ ...r, data: JSON.parse(r.data) })),
        more: rows.results.length > 50,
      });
    }
    if (user.role === "client")
      fail(403, "Seu acesso permite acompanhar os registros.");
    if (kind === "finance" && user.role !== "admin")
      fail(403, "Apenas administradores podem alterar o financeiro.");
    if ((method === "POST" && !id) || (method === "PUT" && id)) {
      const data = await body(req);
      const details = recordData(kind, data);
      const client = field(data.client_id ?? "", 36) || null;
      if (
        client &&
        !(await env.DB.prepare(
          "SELECT id FROM records WHERE id=? AND kind='clients' AND archived=0",
        )
          .bind(client)
          .first())
      )
        fail(400, "Cliente não encontrado.");
      const recordId = id ?? crypto.randomUUID();
      if (
        id &&
        !(await env.DB.prepare(
          "SELECT id FROM records WHERE id=? AND kind=? AND archived=0",
        )
          .bind(id, kind)
          .first())
      )
        fail(404, "Registro não encontrado.");
      const statement = id
        ? env.DB.prepare(
            "UPDATE records SET data=?,client_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND kind=?",
          ).bind(JSON.stringify(details), client, recordId, kind)
        : env.DB.prepare(
            "INSERT INTO records(id,kind,client_id,data) VALUES(?,?,?,?)",
          ).bind(recordId, kind, client, JSON.stringify(details));
      await env.DB.batch([
        statement,
        env.DB.prepare(
          "INSERT INTO audit(user_id,action,record_id) VALUES(?,?,?)",
        ).bind(user.id, id ? "update" : "create", recordId),
      ]);
      return json({ id: recordId }, id ? 200 : 201);
    }
    if (method === "DELETE" && id) {
      const result = await env.DB.batch([
        env.DB.prepare(
          "UPDATE records SET archived=1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND kind=? AND archived=0",
        ).bind(id, kind),
        env.DB.prepare(
          "INSERT INTO audit(user_id,action,record_id) VALUES(?,?,?)",
        ).bind(user.id, "archive", id),
      ]);
      if (!result[0].meta.changes) fail(404, "Registro não encontrado.");
      return json({ ok: true });
    }
  }
  return fail(404, "Recurso não encontrado.");
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    let response: Response;
    try {
      response = new URL(req.url).pathname.startsWith("/api/")
        ? await api(req, env)
        : await env.ASSETS.fetch(req);
    } catch (e) {
      response =
        e instanceof HttpError
          ? json({ error: e.message }, e.status)
          : json({ error: "Não foi possível concluir. Tente novamente." }, 500);
      if (!(e instanceof HttpError))
        console.error(
          "Request failed",
          e instanceof Error ? e.name : "Unknown",
        );
    }
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("X-Frame-Options", "DENY");
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    return new Response(response.body, { status: response.status, headers });
  },
  async scheduled(_event: ScheduledEvent, env: Env) {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(now),
      env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<=?").bind(now),
    ]);
  },
};
