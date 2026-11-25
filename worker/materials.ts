import { check, equal, field, hex, HttpError, random } from "./security";

export interface MaterialsEnv {
  DB: D1Database;
  GOOGLE_DRIVE_CLIENT_ID?: string;
  GOOGLE_DRIVE_CLIENT_SECRET?: string;
  GOOGLE_DRIVE_OWNER_EMAIL?: string;
}

type User = { id: string; role: string; client_id: string | null };
type Media = {
  id: string; name: string; mimeType: string; size?: string;
  createdTime: string; parents?: string[]; trashed?: boolean;
};
const api = "https://www.googleapis.com/drive/v3";
const route = "/api/materials";
const callback = route + "/google/callback";
const mediaType = /^(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|webm|quicktime))$/;
const idPattern = /^[\w-]{1,150}$/;
const mediaFields = "id,name,mimeType,size,createdTime";
const maxUpload = 2 * 1024 ** 3;

function credentials(env: MaterialsEnv) {
  const { GOOGLE_DRIVE_CLIENT_ID: id, GOOGLE_DRIVE_CLIENT_SECRET: secret, GOOGLE_DRIVE_OWNER_EMAIL } = env;
  const owner = GOOGLE_DRIVE_OWNER_EMAIL?.trim().toLowerCase();
  if (!id || !secret || !owner) throw new HttpError(503, "O Google Drive ainda não foi configurado.");
  return { id, secret, owner };
}

async function encryptionKey(secret: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function bytes(value: string) {
  return Uint8Array.from(value.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

async function encrypt(secret: string, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, await encryptionKey(secret), new TextEncoder().encode(value),
  );
  return hex(iv.buffer) + hex(encrypted);
}

async function decrypt(secret: string, value: string) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes(value.slice(0, 24)) },
    await encryptionKey(secret), bytes(value.slice(24)),
  );
  return new TextDecoder().decode(plain);
}

async function tokenExchange(env: MaterialsEnv, data: Record<string, string>) {
  const { id, secret } = credentials(env);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", body: new URLSearchParams({ ...data, client_id: id, client_secret: secret }),
  });
  if (!response.ok)
    throw new HttpError(503, "Autorize novamente a conta da agência no Google Drive.");
  return response.json<{ access_token: string; refresh_token?: string; scope?: string }>();
}

async function google(token: string, url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Authorization", "Bearer " + token);
  return fetch(url, { ...options, headers, redirect: "manual" });
}

function requireDrive(response: Response) {
  if (!response.ok)
    throw new HttpError(502, "O Google Drive não concluiu a operação. Confira a conexão e o espaço disponível.");
  return response;
}

async function connected(env: MaterialsEnv) {
  return env.DB.prepare("SELECT token FROM material_drive_connection WHERE id=1")
    .first<{ token: string }>();
}

async function access(env: MaterialsEnv) {
  const { secret } = credentials(env);
  const row = await connected(env);
  if (!row) throw new HttpError(503, "A agência ainda precisa conectar o Google Drive.");
  let refresh: string;
  try {
    refresh = await decrypt(secret, row.token);
  } catch {
    throw new HttpError(503, "Autorize novamente a conta da agência no Google Drive.");
  }
  return (await tokenExchange(env, { grant_type: "refresh_token", refresh_token: refresh })).access_token;
}

export async function materialsCallback(req: Request, env: MaterialsEnv) {
  const url = new URL(req.url);
  const cookie = req.headers.get("Cookie")?.match(/(?:^|;\s*)ilustre_drive=([a-f0-9]+)(?:;|$)/)?.[1];
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Set-Cookie": `ilustre_drive=; Path=${callback}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  };
  let result = "erro";
  let step = "retorno";
  try {
    const code = url.searchParams.get("code"), state = url.searchParams.get("state");
    check(cookie && code && state, "Autorização inválida.");
    step = "sessao";
    const { secret, owner } = credentials(env);
    const pending = JSON.parse(await decrypt(secret, cookie)) as {
      state: string; verifier: string; expires: number; admin: string;
    };
    check(pending.expires > Date.now() && equal(state, pending.state), "Autorização expirada.");
    const admin = await env.DB.prepare("SELECT id FROM users WHERE id=? AND role='admin' AND disabled=0")
      .bind(pending.admin).first();
    check(admin, "Acesso de administrador necessário.");
    step = "token";
    const token = await tokenExchange(env, {
      code, grant_type: "authorization_code", code_verifier: pending.verifier,
      redirect_uri: url.origin + callback,
    });
    if (!token.scope?.split(" ").includes("https://www.googleapis.com/auth/drive.file")) {
      result = "permissao";
    } else {
      step = "identidade";
      const info = await google(token.access_token, api + "/about?fields=user%28emailAddress%29");
      step = "identidade-" + info.status;
      const { user } = await requireDrive(info).json<{ user?: { emailAddress?: string } }>();
      if (user?.emailAddress?.toLowerCase() !== owner) {
        result = "conta";
      } else if (token.refresh_token) {
        step = "salvar";
        await env.DB.prepare(
          "INSERT INTO material_drive_connection VALUES (1,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token",
        ).bind(await encrypt(secret, token.refresh_token)).run();
        result = "ok";
      } else result = "renovacao";
    }
  } catch {
    console.warn("Google Drive authorization failed at:", step);
  }
  return new Response(null, {
    status: 303, headers: { ...headers, Location: "/portal?drive=" + (result === "erro" ? step : result) },
  });
}

async function authorize(req: Request, env: MaterialsEnv, user: User) {
  if (user.role !== "admin") throw new HttpError(403, "Apenas o administrador pode conectar o Drive.");
  const { id, secret, owner } = credentials(env);
  const verifier = random(), state = random();
  const challenge = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const pkce = btoa(String.fromCharCode(...new Uint8Array(challenge)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const origin = new URL(req.url).origin;
  const params = new URLSearchParams({
    client_id: id, redirect_uri: origin + callback, response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline", prompt: "consent", login_hint: owner, state,
    code_challenge: pkce, code_challenge_method: "S256",
  });
  return reply({ url: "https://accounts.google.com/o/oauth2/v2/auth?" + params }, 200, {
    "Set-Cookie": `ilustre_drive=${await encrypt(secret, JSON.stringify({
      state, verifier, expires: Date.now() + 600_000, admin: user.id,
    }))}; Path=${callback}; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
  });
}

function reply(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

async function fileFolder(env: MaterialsEnv, client: string) {
  return (await env.DB.prepare("SELECT folder_id FROM material_drive_folders WHERE client_id=?")
    .bind(client).first<{ folder_id: string }>())?.folder_id;
}

async function ensureFolder(env: MaterialsEnv, token: string, client: string, name: string) {
  let id = await fileFolder(env, client);
  if (!id) {
    const generated = await requireDrive(await google(token, api + "/files/generateIds?count=1"))
      .json<{ ids: string[] }>();
    check(idPattern.test(generated.ids[0] ?? ""), "O Drive não forneceu uma pasta válida.");
    await env.DB.prepare("INSERT INTO material_drive_folders VALUES (?,?) ON CONFLICT(client_id) DO NOTHING")
      .bind(client, generated.ids[0]).run();
    id = await fileFolder(env, client);
  }
  check(id, "Não foi possível preparar a pasta.");
  const response = await google(token, api + "/files?fields=id,trashed", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name: "Agência Ilustre · " + name, mimeType: "application/vnd.google-apps.folder" }),
  });
  const folder = await requireDrive(response.status === 409
    ? await google(token, api + "/files/" + id + "?fields=trashed")
    : response).json<{ trashed?: boolean }>();
  if (folder.trashed) throw new HttpError(409, "Restaure a pasta do cliente no Google Drive.");
  return id;
}

export async function materialsRoute(
  req: Request, env: MaterialsEnv, user: User,
  readBody: (req: Request) => Promise<Record<string, unknown>>,
) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, "").slice(route.length);
  const staff = user.role !== "client";
  const configured = Boolean(
    env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_OWNER_EMAIL?.trim(),
  );
  if (path === "/status" && req.method === "GET")
    return reply({ configured, connected: configured && Boolean(await connected(env)) });
  if (path === "/google" && req.method === "POST") return authorize(req, env, user);

  const client = staff ? url.searchParams.get("client") : user.client_id;
  if (!client || !idPattern.test(client)) throw new HttpError(404, "Cliente não encontrado.");
  const record = await env.DB.prepare(
    "SELECT json_extract(data,'$.name') AS name FROM records WHERE id=? AND kind='clients' AND archived=0",
  ).bind(client).first<{ name: string }>();
  if (!record) throw new HttpError(404, "Cliente não encontrado.");
  const folder = await fileFolder(env, client);

  if (path === "/upload" && req.method === "PUT") {
    if (!staff) throw new HttpError(403, "Apenas a equipe pode enviar materiais.");
    const range = req.headers.get("Content-Range") ?? "";
    const part = range.match(/^bytes (?:(\d+)-(\d+)|\*)\/(\d+)$/);
    const ticket = req.headers.get("X-Ilustre-Upload") ?? "";
    check(part && /^[a-f0-9]{56,4096}$/.test(ticket), "Envio inválido.");
    const { secret } = credentials(env);
    let upload: { location: string; user: string; client: string; size: number; type: string; expires: number };
    try {
      upload = JSON.parse(await decrypt(secret, ticket));
    } catch {
      throw new HttpError(400, "Sessão de envio inválida.");
    }
    check(upload.user === user.id && upload.client === client && upload.expires > Date.now()
      && upload.size === Number(part[3]), "Sessão de envio inválida ou expirada.");
    const length = part[1] === undefined ? 0 : Number(part[2]) - Number(part[1]) + 1;
    check(length >= 0 && length <= 8 * 1024 ** 2 && Number(part[2] ?? 0) < upload.size
      && Number(req.headers.get("Content-Length") ?? 0) === length, "Tamanho de envio inválido.");
    const chunk = length ? await req.arrayBuffer() : undefined;
    check((chunk?.byteLength ?? 0) === length, "Tamanho de envio inválido.");
    const response = await google(await access(env), upload.location, {
      method: "PUT",
      headers: { "Content-Range": range, "Content-Type": upload.type },
      body: chunk,
    });
    const details = response.status >= 400
      ? await response.json<{ error?: { errors?: { reason?: string }[]; status?: string } }>().catch(() => null)
      : null;
    const reason = details?.error?.errors?.[0]?.reason ?? details?.error?.status ?? "";
    return new Response(null, { status: response.status, headers: {
      "Cache-Control": "no-store",
      ...(/^[a-zA-Z_]{1,64}$/.test(reason) ? { "X-Ilustre-Drive-Error": reason } : {}),
      ...(response.headers.has("Range") ? { Range: response.headers.get("Range")! } : {}),
    } });
  }

  if (path === "" && req.method === "GET") {
    if (!folder) return reply({ files: [], next: null });
    const query = new URLSearchParams({
      q: `'${folder}' in parents and trashed=false`, pageSize: "50", orderBy: "createdTime desc",
      fields: "nextPageToken,files(" + mediaFields + ")",
    });
    const page = url.searchParams.get("page");
    if (page) query.set("pageToken", page);
    const response = await google(await access(env), api + "/files?" + query);
    if (response.status === 404) return reply({ files: [], next: null });
    const data = await requireDrive(response).json<{ files: Media[]; nextPageToken?: string }>();
    return reply({ files: data.files.filter((file) => mediaType.test(file.mimeType)), next: data.nextPageToken ?? null });
  }

  if (path === "/upload" && req.method === "POST") {
    if (!staff) throw new HttpError(403, "Apenas a equipe pode enviar materiais.");
    const data = await readBody(req);
    const name = field(data.name, 200, true), type = field(data.type, 64, true);
    const size = Number(data.size);
    check(mediaType.test(type), "Formato de foto ou vídeo não aceito.");
    check(Number.isSafeInteger(size) && size > 0 && size <= maxUpload,
      "Escolha um arquivo de até 2 GB.");
    const token = await access(env);
    const parent = await ensureFolder(env, token, client, record.name);
    const upload = await google(token,
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", {
        method: "POST",
        headers: { "Content-Type": "application/json",
          "X-Upload-Content-Type": type, "X-Upload-Content-Length": String(size) },
        body: JSON.stringify({ name, mimeType: type, parents: [parent] }),
      },
    );
    const location = requireDrive(upload).headers.get("Location");
    if (!location || new URL(location).origin !== "https://www.googleapis.com")
      throw new HttpError(502, "O Drive não forneceu um endereço de envio válido.");
    const ticket = await encrypt(credentials(env).secret, JSON.stringify({
      location, user: user.id, client, type, size, expires: Date.now() + 3_600_000,
    }));
    return reply({ url: route + "/upload?" + new URLSearchParams({ client }), ticket });
  }

  const match = path.match(/^\/([\w-]{1,150})\/file$/);
  if (!match || req.method !== "GET" || !folder) throw new HttpError(404, "Material não encontrado.");
  const token = await access(env);
  const fileUrl = api + "/files/" + match[1];
  const metadata = await google(token, fileUrl + "?fields=" + mediaFields + ",parents,trashed");
  if (!metadata.ok) throw new HttpError(404, "Material não encontrado.");
  const file = await metadata.json<Media>();
  if (file.trashed || !file.parents?.includes(folder) || !mediaType.test(file.mimeType))
    throw new HttpError(404, "Material não encontrado.");
  const range = req.headers.get("Range");
  const media = await google(token, fileUrl + "?alt=media", { headers: range ? { Range: range } : {} });
  if (!media.ok && media.status !== 416) requireDrive(media);
  const headers = new Headers({
    "Cache-Control": "private, no-store", "Content-Type": file.mimeType,
    "Content-Disposition": (url.searchParams.has("download") ? "attachment" : "inline")
      + "; filename*=UTF-8''" + encodeURIComponent(file.name).replace(/['()*]/g, (char) =>
        "%" + char.charCodeAt(0).toString(16)),
  });
  for (const key of ["Content-Range", "Accept-Ranges", "Content-Length"]) {
    const value = media.headers.get(key);
    if (value) headers.set(key, value);
  }
  return new Response(media.body, { status: media.status, headers });
}
