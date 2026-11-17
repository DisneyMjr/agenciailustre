import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const base = "http://127.0.0.1:17887";
const cli = resolve("node_modules/wrangler/bin/wrangler.js");
const fixturePassword = "Local-test-fixture-12345!";
let child,
  adminCookie,
  clientCookie,
  teamCookie,
  clientA,
  clientB,
  project,
  teamId;
let output = "";
async function request(
  path,
  { method = "GET", data, cookie, origin = base } = {},
) {
  const res = await fetch(base + "/api" + path, {
    method,
    headers: {
      ...(method === "GET"
        ? {}
        : { Origin: origin, "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return {
    status: res.status,
    body: await res.json(),
    cookie: res.headers.get("set-cookie")?.split(";")[0],
    headers: res.headers,
  };
}
before(async () => {
  await mkdir(".wrangler", { recursive: true });
  const state = await mkdtemp(resolve(".wrangler/test-"));
  await promisify(execFile)(
    process.execPath,
    [cli, "d1", "migrations", "apply", "DB", "--local", "--persist-to", state],
    { timeout: 60000 },
  );
  child = spawn(
    process.execPath,
    [
      cli,
      "dev",
      "--local",
      "--port",
      "17887",
      "--persist-to",
      state,
      "--var",
      "BOOTSTRAP_TOKEN:local-test-bootstrap-fixture",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout.on("data", (b) => (output += b));
  child.stderr.on("data", (b) => (output += b));
  for (let i = 0; i < 300; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {}
    if (child.exitCode !== null) throw Error(output);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Server did not start: " + output);
});
after(async () => {
  if (child) {
    child.kill();
    await new Promise((r) => setTimeout(r, 100));
  }
});
test("serves institutional site and portal with browser security headers", async () => {
  for (const path of ["/", "/portal", "/portal/configurar"]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Agência Ilustre/);
    assert.equal(r.headers.get("X-Frame-Options"), "DENY");
  }
});
test("anonymous visitors cannot read management data", async () => {
  assert.equal((await request("/records/clients")).status, 401);
  assert.equal((await request("/export")).status, 401);
});
test("rejects cross-origin mutations and malformed JSON", async () => {
  assert.equal(
    (
      await request("/contact", {
        method: "POST",
        origin: "https://other.invalid",
        data: {},
      })
    ).status,
    403,
  );
  const r = await fetch(base + "/api/contact", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(r.status, 400);
});
test("bootstrap requires valid token and is one-time only", async () => {
  const data = {
    email: "admin@example.invalid",
    name: "Responsável de teste",
    password: fixturePassword,
  };
  assert.equal(
    (
      await request("/setup", {
        method: "POST",
        data: { ...data, token: "wrong" },
      })
    ).status,
    403,
  );
  const r = await request("/setup", {
    method: "POST",
    data: { ...data, token: "local-test-bootstrap-fixture" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, "admin");
  assert.match(r.headers.get("Set-Cookie"), /HttpOnly; SameSite=Strict/);
  adminCookie = r.cookie;
  assert.equal(
    (
      await request("/setup", {
        method: "POST",
        data: { ...data, token: "local-test-bootstrap-fixture" },
      })
    ).status,
    409,
  );
});
test("contact form persists real CRM lead and validates consent", async () => {
  const data = {
    name: "Contato do formulário",
    email: "contact@example.invalid",
    message: "Gostaria de conversar sobre um site.",
    consent: true,
  };
  assert.equal(
    (
      await request("/contact", {
        method: "POST",
        data: { ...data, consent: false },
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/contact", { method: "POST", data })).status,
    201,
  );
  const r = await request("/records/leads", { cookie: adminCookie });
  assert.equal(r.body.records[0].data.email, data.email);
});
test("creates clients and project with validated prepared SQL data", async () => {
  for (const name of ["Cliente A", "Cliente B"]) {
    const r = await request("/records/clients", {
      method: "POST",
      cookie: adminCookie,
      data: { name, status: "Ativo", email: "client@example.invalid" },
    });
    assert.equal(r.status, 201);
    if (!clientA) clientA = r.body.id;
    else clientB = r.body.id;
  }
  const r = await request("/records/projects", {
    method: "POST",
    cookie: adminCookie,
    data: {
      name: "Projeto ' teste",
      status: "Em andamento",
      client_id: clientA,
      due: "2026-12-01",
      notes: "Detalhes do projeto",
    },
  });
  assert.equal(r.status, 201);
  project = r.body.id;
  await request("/records/projects", {
    method: "POST",
    cookie: adminCookie,
    data: { name: "Outro cliente", status: "Planejamento", client_id: clientB },
  });
  assert.equal(
    (
      await request("/records/finance", {
        method: "POST",
        cookie: adminCookie,
        data: {
          name: "Valor inválido",
          amount_cents: -100,
          direction: "income",
        },
      })
    ).status,
    400,
  );
});
test("admin can create scoped client and team accounts", async () => {
  for (const [role, address, client_id] of [
    ["client", "client@example.invalid", clientA],
    ["team", "team@example.invalid", ""],
  ]) {
    assert.equal(
      (
        await request("/users", {
          method: "POST",
          cookie: adminCookie,
          data: {
            name: role,
            email: address,
            role,
            client_id,
            password: fixturePassword,
          },
        })
      ).status,
      201,
    );
    const r = await request("/login", {
      method: "POST",
      data: { email: address, password: fixturePassword },
    });
    assert.equal(r.status, 200);
    if (role === "client") clientCookie = r.cookie;
    else {
      teamCookie = r.cookie;
      teamId = r.body.user.id;
    }
  }
});
test("client is limited to own records and cannot mutate or export", async () => {
  const r = await request("/records/projects", { cookie: clientCookie });
  assert.equal(r.body.records.length, 1);
  assert.equal(r.body.records[0].id, project);
  assert.equal(
    (await request("/records/clients", { cookie: clientCookie })).status,
    403,
  );
  assert.equal(
    (
      await request("/records/projects/" + project, {
        method: "PUT",
        cookie: clientCookie,
        data: { name: "Tampered" },
      })
    ).status,
    403,
  );
  assert.equal((await request("/users", { cookie: clientCookie })).status, 403);
  assert.equal(
    (await request("/export", { cookie: clientCookie })).status,
    403,
  );
});
test("team cannot manage users or mutate financial records", async () => {
  assert.equal((await request("/users", { cookie: teamCookie })).status, 403);
  assert.equal(
    (
      await request("/records/finance", {
        method: "POST",
        cookie: teamCookie,
        data: { name: "Unauthorized", amount_cents: 100, direction: "income" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/records/tasks", {
        method: "POST",
        cookie: teamCookie,
        data: { name: "Tarefa real", status: "A fazer", client_id: clientA },
      })
    ).status,
    201,
  );
});
test("updates persist and archive preserves data in admin export", async () => {
  assert.equal(
    (
      await request("/records/projects/" + project, {
        method: "PUT",
        cookie: adminCookie,
        data: {
          name: "Projeto atualizado",
          status: "Concluído",
          client_id: clientA,
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/records/projects/" + project, {
        method: "DELETE",
        cookie: adminCookie,
        data: {},
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/records/projects", { cookie: clientCookie })).body.records
      .length,
    0,
  );
  const r = await request("/export", { cookie: adminCookie });
  const archived = r.body.records.find((x) => x.id === project);
  assert.equal(archived.archived, 1);
  assert.equal(JSON.parse(archived.data).name, "Projeto atualizado");
  assert.equal(JSON.stringify(r.body).includes("password_hash"), false);
});
test("disabling account revokes existing sessions and blocks login", async () => {
  assert.equal(
    (
      await request("/users/" + teamId, {
        method: "PATCH",
        cookie: adminCookie,
        data: { action: "disable" },
      })
    ).status,
    200,
  );
  assert.equal((await request("/me", { cookie: teamCookie })).status, 401);
  assert.equal(
    (
      await request("/login", {
        method: "POST",
        data: { email: "team@example.invalid", password: fixturePassword },
      })
    ).status,
    401,
  );
});
test("password change invalidates all current user sessions", async () => {
  assert.equal(
    (
      await request("/password", {
        method: "POST",
        cookie: clientCookie,
        data: { current: fixturePassword, password: "A-new-fixture-password!" },
      })
    ).status,
    200,
  );
  assert.equal((await request("/me", { cookie: clientCookie })).status, 401);
});

test("administrator can reset and reactivate access without removing records", async () => {
  for (const data of [
    { action: "password", password: "Reset-fixture-password-123!" },
    { action: "enable" },
  ])
    assert.equal(
      (
        await request("/users/" + teamId, {
          method: "PATCH",
          cookie: adminCookie,
          data,
        })
      ).status,
      200,
    );
  assert.equal(
    (
      await request("/login", {
        method: "POST",
        data: {
          email: "team@example.invalid",
          password: "Reset-fixture-password-123!",
        },
      })
    ).status,
    200,
  );
});

test("validates actual dates and limits request body size", async () => {
  assert.equal(
    (
      await request("/records/tasks", {
        method: "POST",
        cookie: adminCookie,
        data: { name: "Invalid calendar date", due: "2026-02-31" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/records/tasks", {
        method: "POST",
        cookie: adminCookie,
        data: { name: "Too large", notes: "x".repeat(25000) },
      })
    ).status,
    413,
  );
});
test("login throttling blocks repeated password attempts", async () => {
  let r;
  for (let i = 0; i < 11; i++)
    r = await request("/login", {
      method: "POST",
      data: { email: "missing@example.invalid", password: "wrong-password" },
    });
  assert.equal(r.status, 429);
});
test("browser: responsive site, contact confirmation, login and persisted management", async () => {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.getByRole("heading", { name: /Boas ideias/ }).waitFor();
    await page.screenshot({
      path: "test-results/site-desktop.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page
      .getByRole("link", { name: "O que fazemos", exact: true })
      .click();
    await page.getByText("Estratégia de marca", { exact: true }).click();
    await page
      .getByText("Clareza para escolher o caminho.", { exact: false })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: "test-results/site-mobile.png",
      fullPage: true,
    });
    await page
      .getByLabel("Como podemos chamar você?")
      .fill("Contato pelo navegador");
    await page.getByLabel("Seu melhor e-mail").fill("browser@example.invalid");
    await page
      .getByLabel("O que você tem em mente?")
      .fill("Quero conversar sobre a identidade da minha marca.");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Enviar minha ideia" }).click();
    await page.getByRole("heading", { name: "Conversa iniciada." }).waitFor();
    await page.goto(base + "/portal");
    await page
      .getByLabel("E-mail", { exact: true })
      .fill("admin@example.invalid");
    await page.getByLabel("Senha", { exact: true }).fill(fixturePassword);
    await page.getByRole("button", { name: "Entrar no meu espaço" }).click();
    await page.getByRole("heading", { name: /Olá,/ }).waitFor();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "test-results/portal-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Clientes", exact: true }).click();
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByLabel("Nome / título").fill("Cliente criado no navegador");
    await page.getByRole("button", { name: "Salvar registro" }).click();
    await page
      .getByText("Cliente criado no navegador", { exact: true })
      .waitFor();
    await page.reload();
    await page.getByRole("button", { name: "Clientes", exact: true }).click();
    await page
      .getByText("Cliente criado no navegador", { exact: true })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: "test-results/portal-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
