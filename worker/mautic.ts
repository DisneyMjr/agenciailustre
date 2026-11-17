import { HttpError } from "./security";
export type MauticEnv = {
  MAUTIC_BASE_URL?: string;
  MAUTIC_CLIENT_ID?: string;
  MAUTIC_CLIENT_SECRET?: string;
};
export function configured(env: MauticEnv) {
  return !!(
    env.MAUTIC_BASE_URL &&
    env.MAUTIC_CLIENT_ID &&
    env.MAUTIC_CLIENT_SECRET
  );
}
export async function syncContact(
  env: MauticEnv,
  contact: { name: string; email: string; phone?: string },
  send: typeof fetch = fetch,
) {
  if (!configured(env))
    throw new HttpError(
      503,
      "Configure a instância externa e os segredos do Mautic antes de sincronizar.",
    );
  let root: URL;
  try {
    root = new URL(env.MAUTIC_BASE_URL!);
  } catch {
    throw new HttpError(503, "Endereço da instância Mautic inválido.");
  }
  if (
    root.protocol !== "https:" ||
    root.username ||
    root.password ||
    root.search ||
    root.hash ||
    root.port ||
    root.pathname !== "/" ||
    !root.hostname.includes(".") ||
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      root.hostname,
    ) ||
    root.hostname.includes(":")
  )
    throw new HttpError(
      503,
      "A instância Mautic precisa usar uma origem HTTPS pública, sem caminho.",
    );
  async function call(path: string, init: RequestInit) {
    const response = await send(new URL(path, root), {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("provider");
    return (await response.json()) as Record<string, any>;
  }
  try {
    const token = await call("/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: env.MAUTIC_CLIENT_ID!,
        client_secret: env.MAUTIC_CLIENT_SECRET!,
      }),
    });
    if (typeof token.access_token !== "string" || !token.access_token)
      throw new Error("token");
    const headers = {
      Authorization: "Bearer " + token.access_token,
      "Content-Type": "application/json",
    };
    const existing = await call(
      "/api/contacts?limit=10&search=" +
        encodeURIComponent("email:" + contact.email),
      { headers },
    );
    const matches = Object.values(existing.contacts ?? {}).filter(
      (item: any) =>
        String(
          item.fields?.all?.email ?? item.fields?.core?.email?.value ?? "",
        ).toLowerCase() === contact.email.toLowerCase(),
    ) as any[];
    if (matches.length > 1) throw new Error("ambiguous");
    const id = matches[0]?.id;
    if (id !== undefined && (!Number.isSafeInteger(id) || id < 1))
      throw new Error("id");
    const names = contact.name.trim().split(/\s+/);
    const result = await call(
      id ? `/api/contacts/${id}/edit` : "/api/contacts/new",
      {
        method: id ? "PATCH" : "POST",
        headers,
        body: JSON.stringify({
          firstname: names.shift(),
          lastname: names.join(" "),
          email: contact.email,
          phone: contact.phone || "",
          tags: ["agencia-ilustre"],
        }),
      },
    );
    if (!Number.isSafeInteger(result.contact?.id) || result.contact.id < 1)
      throw new Error("result");
    return result.contact.id as number;
  } catch {
    throw new HttpError(
      502,
      "O Mautic não confirmou a sincronização. Confira a instância, permissões e o contato antes de tentar novamente.",
    );
  }
}
