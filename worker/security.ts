export const kinds = [
  "clients",
  "leads",
  "projects",
  "tasks",
  "finance",
  "campaigns",
] as const;
export type Kind = (typeof kinds)[number];
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function check(value: unknown, message: string): asserts value {
  if (!value) throw new HttpError(400, message);
}
export function field(value: unknown, max = 200, required = false): string {
  check(typeof value === "string", "Campo inválido.");
  const s = value.trim();
  check(
    s.length <= max && (!required || s.length > 0),
    "Preencha os campos obrigatórios dentro do limite.",
  );
  return s;
}
export function email(value: unknown) {
  const s = field(value, 254, true).toLowerCase();
  check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), "E-mail inválido.");
  return s;
}
export const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join(
    "",
  );
export const random = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
export const digest = async (s: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
export function equal(a: string, b: string) {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
export async function passwordHash(password: string, salt = random()) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
    },
    key,
    256,
  );
  return `${salt}:${hex(bits)}`;
}
export async function passwordVerify(password: string, stored: string) {
  const salt = stored.split(":")[0];
  return equal(await passwordHash(password, salt), stored);
}
export function recordData(kind: Kind, input: Record<string, unknown>) {
  const name = field(input.name, 200, true);
  const status = field(input.status ?? "", 60);
  const notes = field(input.notes ?? "", 4000);
  const result: Record<string, string | number> = { name, status, notes };
  if (kind === "clients" || kind === "leads") {
    result.email = input.email ? email(input.email) : "";
    result.phone = field(input.phone ?? "", 40);
  }
  if (["projects", "tasks", "finance", "campaigns"].includes(kind)) {
    const due = field(input.due ?? "", 10);
    check(
      !due ||
        (/^\d{4}-\d{2}-\d{2}$/.test(due) &&
          !isNaN(Date.parse(due)) &&
          new Date(due).toISOString().slice(0, 10) === due),
      "Data inválida.",
    );
    result.due = due;
  }
  if (kind === "finance") {
    const n = input.amount_cents;
    check(
      typeof n === "number" &&
        Number.isSafeInteger(n) &&
        n >= 0 &&
        n <= 100000000000,
      "Valor inválido.",
    );
    result.amount_cents = n;
    check(
      ["income", "expense"].includes(String(input.direction)),
      "Tipo financeiro inválido.",
    );
    result.direction = String(input.direction);
  }
  return result;
}
