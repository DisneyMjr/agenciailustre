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

test("summary counts every page and scopes client information", async () => {
  assert.equal((await request("/summary")).status, 401);
  const before = (await request("/summary", { cookie: adminCookie })).body
    .summary;
  const ids = [];
  for (let i = 0; i < 55; i++) {
    const r = await request("/records/leads", {
      method: "POST",
      cookie: adminCookie,
      data: {
        name: "Lote temporário " + i,
        status: "Em conversa",
        value_cents: 10000,
      },
    });
    assert.equal(r.status, 201);
    ids.push(r.body.id);
  }
  const summary = (await request("/summary", { cookie: adminCookie })).body
    .summary;
  assert.equal(summary.counts.leads, (before.counts.leads ?? 0) + 55);
  assert.equal(summary.pipelineValue, before.pipelineValue + 550000);
  const page = await request("/records/leads", { cookie: adminCookie });
  assert.equal(page.body.records.length, 50);
  assert.equal(page.body.more, true);
  const scoped = (await request("/summary", { cookie: clientCookie })).body
    .summary;
  assert.equal(scoped.counts.projects, 1);
  assert.equal(scoped.counts.leads, undefined);
  assert.equal(scoped.counts.clients, undefined);
  assert.equal(scoped.pipelineValue, 0);
  for (const id of ids)
    await request("/records/leads/" + id, {
      method: "DELETE",
      cookie: adminCookie,
      data: {},
    });
  assert.equal(
    (await request("/summary", { cookie: adminCookie })).body.summary.counts
      .leads,
    before.counts.leads,
  );
});
test("finance keeps government NFS-e references and totals real values", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const before = (await request("/summary", { cookie: adminCookie })).body
    .summary;
  const r = await request("/records/finance", {
    method: "POST",
    cookie: adminCookie,
    data: {
      name: "Identidade visual · NFS-e",
      status: "Pago",
      amount_cents: 245000,
      direction: "income",
      due: today,
      client_id: clientA,
      invoice_number: "12345",
      invoice_key: "fixture-verification",
      invoice_url: "https://www.gov.br/nfse",
    },
  });
  assert.equal(r.status, 201);
  const invalid = await request("/records/finance", {
    method: "POST",
    cookie: adminCookie,
    data: {
      name: "Unsafe",
      amount_cents: 100,
      direction: "income",
      invoice_url: "javascript:alert(1)",
    },
  });
  assert.equal(invalid.status, 400);
  const record = (
    await request("/records/finance", { cookie: adminCookie })
  ).body.records.find((x) => x.id === r.body.id);
  assert.equal(record.data.invoice_number, "12345");
  assert.equal(record.data.invoice_key, "fixture-verification");
  const summary = (await request("/summary", { cookie: adminCookie })).body
    .summary;
  assert.equal(
    summary.finances.incomePaid,
    before.finances.incomePaid + 245000,
  );
  assert.ok(summary.monthly.some((m) => m.incomePaid >= 245000));
});
test("project approval is restricted to its client and pending stage", async () => {
  const r = await request("/records/projects", {
    method: "POST",
    cookie: adminCookie,
    data: {
      name: "Campanha · aprovação",
      status: "Em aprovação",
      client_id: clientA,
    },
  });
  const id = r.body.id;
  const other = await request("/records/projects", {
    method: "POST",
    cookie: adminCookie,
    data: {
      name: "Outra marca · aprovação",
      status: "Em aprovação",
      client_id: clientB,
    },
  });
  assert.equal(
    (
      await request("/projects/" + id + "/approval", {
        method: "POST",
        cookie: teamCookie,
        data: { decision: "approve" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/projects/" + other.body.id + "/approval", {
        method: "POST",
        cookie: clientCookie,
        data: { decision: "approve" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/projects/" + id + "/approval", {
        method: "POST",
        cookie: clientCookie,
        data: { decision: "changes", comment: "" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/projects/" + id + "/approval", {
        method: "POST",
        cookie: clientCookie,
        data: { decision: "changes", comment: "Rever cor do título" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/projects/" + id + "/approval", {
        method: "POST",
        cookie: clientCookie,
        data: { decision: "approve" },
      })
    ).status,
    409,
  );
  const row = (
    await request("/records/projects", { cookie: adminCookie })
  ).body.records.find((x) => x.id === id);
  assert.equal(row.data.status, "Em andamento");
  assert.equal(row.data.approval_comment, "Rever cor do título");
  await request("/records/projects/" + id, {
    method: "PUT",
    cookie: adminCookie,
    data: { ...row.data, status: "Em aprovação", client_id: clientA },
  });
  assert.equal(
    (
      await request("/projects/" + id + "/approval", {
        method: "POST",
        cookie: clientCookie,
        data: { decision: "approve" },
      })
    ).status,
    200,
  );
  const approved = (
    await request("/records/projects", { cookie: clientCookie })
  ).body.records.find((x) => x.id === id);
  assert.equal(approved.data.status, "Concluído");
  assert.equal(approved.data.approval_decision, "approve");
  // Do not disturb the legacy archive scope assertion below.
  await request("/records/projects/" + id, {
    method: "DELETE",
    cookie: adminCookie,
    data: {},
  });
});
test("external integrations are admin-only and remain disabled without secrets", async () => {
  assert.equal(
    (await request("/integrations", { cookie: clientCookie })).status,
    403,
  );
  assert.equal(
    (await request("/integrations", { cookie: teamCookie })).status,
    403,
  );
  const r = await request("/integrations", { cookie: adminCookie });
  assert.equal(r.body.mautic.configured, false);
  assert.equal(r.body.fiscal.emissionEnabled, false);
  assert.equal(
    (
      await request("/integrations/mautic/" + project, {
        method: "POST",
        cookie: adminCookie,
        data: { confirmed: true, evidence: "fixture consent" },
      })
    ).status,
    503,
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

test("browser: client approves its own delivery without general write access", async () => {
  const created = await request("/records/projects", {
    method: "POST",
    cookie: adminCookie,
    data: {
      name: "Campanha Primavera · entrega",
      status: "Em aprovação",
      client_id: clientA,
      notes: "Entrega disponível para conferência.",
    },
  });
  const login = await request("/login", {
    method: "POST",
    data: {
      email: "client@example.invalid",
      password: "A-new-fixture-password!",
    },
  });
  assert.equal(login.status, 200);
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const [name, value] = login.cookie.split("=");
    await context.addCookies([{ name, value, url: base }]);
    const page = await context.newPage();
    await page.goto(base + "/portal");
    await page.getByRole("heading", { name: /Olá,/ }).waitFor();
    await page.getByRole("button", { name: "Alternar navegação" }).click();
    await page.getByRole("button", { name: "Projetos", exact: true }).click();
    await page
      .getByRole("heading", {
        name: "Campanha Primavera · entrega",
        exact: true,
        level:2,
      })
      .waitFor();
    await page.screenshot({
      path: "test-results/system-client-approval-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await page
        .getByRole("button", { name: "Novo projeto", exact: true })
        .count(),
      0,
    );
    await page
      .getByLabel("Comentário / ajustes")
      .fill("Entrega conferida e aprovada.");
    await page
      .getByRole("button", { name: "Aprovar entrega", exact: false })
      .click();
    await page.locator(".approval-card").waitFor({ state: "hidden" });
    const record = (
      await request("/records/projects", { cookie: adminCookie })
    ).body.records.find((r) => r.id === created.body.id);
    assert.equal(record.data.status, "Concluído");
    assert.equal(record.data.approval_comment, "Entrega conferida e aprovada.");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  } finally {
    await browser.close();
  }
});

test("browser: board persists, calendar and reports work on desktop and mobile", async () => {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const [name, value] = adminCookie.split("=");
    await context.addCookies([{ name, value, url: base }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await request("/records/leads", {
      method: "POST",
      cookie: adminCookie,
      data: {
        name: "Estúdio Aurora · identidade",
        status: "Novo contato",
        email: "aurora@example.invalid",
        value_cents: 480000,
        notes: "Planejamento da nova identidade visual.",
      },
    });
    await page.goto(base + "/portal");
    await page.getByRole("heading", { name: /Olá,/ }).waitFor();
    await page
      .getByRole("button", { name: "CRM & contatos", exact: true })
      .click();
    await page.getByRole("region", { name: "Funil de vendas" }).waitFor();
    const stage = page.getByLabel("Mover Estúdio Aurora · identidade para");
    await stage.selectOption("Proposta enviada");
    await page
      .getByText("Salvando...", { exact: true })
      .waitFor({ state: "hidden" });
    await page.reload();
    await page
      .getByRole("button", { name: "CRM & contatos", exact: true })
      .click();
    await stage.waitFor();
    assert.equal(await stage.inputValue(), "Proposta enviada");
    await page.screenshot({
      path: "test-results/system-crm-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Editar Estúdio Aurora · identidade" })
      .click();
    await page
      .getByRole("heading", { name: "Sincronizar com Mautic" })
      .waitFor();
    await page
      .getByText("Instância externa ainda não configurada.", { exact: false })
      .waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Projetos", exact: true }).click();
    await page.getByRole("button", { name: "Calendário", exact: true }).click();
    await page
      .getByText("Prazos dos registros desta página.", { exact: false })
      .waitFor();
    await page.screenshot({
      path: "test-results/system-calendar.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Relatórios", exact: true }).click();
    await page.getByRole("heading", { name: "Receitas e despesas" }).waitFor();
    await page
      .getByRole("cell", { name: "2.450,00", exact: false })
      .first()
      .waitFor();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Exportar CSV", exact: true })
      .click();
    assert.equal(
      (await download).suggestedFilename(),
      "ilustre-relatorio-mensal.csv",
    );
    await page.screenshot({
      path: "test-results/system-reports-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Integrações & fiscal", exact: true })
      .click();
    await page.getByRole("heading", { name: "Mautic", exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: "test-results/system-integrations-mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Alternar navegação" }).click();
    await page
      .getByRole("button", { name: "CRM & contatos", exact: true })
      .click();
    await stage.waitFor();
    await page.screenshot({
      path: "test-results/system-crm-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      JSON.stringify(
        await page.evaluate(() =>
          [...document.querySelectorAll("body *")]
            .filter(
              (e) =>
                e.getBoundingClientRect().right > innerWidth &&
                getComputedStyle(e).position !== "fixed",
            )
            .slice(0, 15)
            .map((e) => [
              e.tagName,
              e.className,
              e.getBoundingClientRect().width,
            ]),
        ),
      ),
    );
    await page.screenshot({
      path: "test-results/system-crm-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
