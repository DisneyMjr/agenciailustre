import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const base = "http://127.0.0.1:17887";
const cli = resolve("node_modules/wrangler/bin/wrangler.js");
const fixturePassword = "91827364";
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
  const short = await request("/setup", {
    method: "POST",
    data: {
      ...data,
      password: "1234567",
      token: "local-test-bootstrap-fixture",
    },
  });
  assert.equal(short.status, 400);
  assert.match(short.body.error, /8 caracteres/);
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
  assert.equal(
    (
      await request("/users", {
        method: "POST",
        cookie: adminCookie,
        data: {
          name: "Invalid password",
          email: "short@example.invalid",
          password: "1234567",
          role: "team",
        },
      })
    ).status,
    400,
  );
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

async function documentFixture(title = "Proposta de teste") {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([595, 842]).drawText(title, { x: 50, y: 750, size: 22, font });
  return Buffer.from(await pdf.save()).toString("base64");
}
test("documents lock sent PDFs and enforce recipient-only password-confirmed signatures", async () => {
  const signer = (await request("/me", { cookie: clientCookie })).body.user;
  const data = {
    title: "Proposta confidencial",
    client_id: clientA,
    recipient_id: signer.id,
    pdf: await documentFixture(),
  };
  assert.equal((await request("/documents")).status, 401);
  assert.equal(
    (await request("/documents/recipients", { cookie: clientCookie })).status,
    403,
  );
  assert.equal(
    (
      await request("/documents", {
        method: "POST",
        cookie: clientCookie,
        data,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/documents", {
        method: "POST",
        cookie: adminCookie,
        data: { ...data, client_id: clientB },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/documents", {
        method: "POST",
        cookie: adminCookie,
        data: { ...data, pdf: btoa("<script>bad</script>") },
      })
    ).status,
    400,
  );
  const created = await request("/documents", {
    method: "POST",
    cookie: adminCookie,
    data,
  });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(
    (await request("/documents/" + id, { cookie: clientCookie })).status,
    404,
  );
  assert.equal(
    (await request("/documents/" + id + "/pdf", { cookie: clientCookie }))
      .status,
    404,
  );
  assert.equal(
    (
      await request("/documents/" + id, {
        method: "PUT",
        cookie: teamCookie,
        data: { ...data, title: "Proposta revisada", version: 1 },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/documents/" + id + "/send", {
        method: "POST",
        cookie: adminCookie,
        data: { version: 1 },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/documents/" + id + "/send", {
        method: "POST",
        cookie: adminCookie,
        data: { version: 2 },
      })
    ).status,
    200,
  );
  const detail = (await request("/documents/" + id, { cookie: clientCookie }))
    .body;
  assert.equal(detail.document.version, 3);
  assert.equal(detail.document.status, "sent");
  assert.equal(
    (
      await request("/documents/" + id, {
        method: "PUT",
        cookie: adminCookie,
        data: { ...data, version: 3 },
      })
    ).status,
    409,
  );
  const sign = {
    version: 3,
    document_sha256: detail.document.pdf_sha256,
    name: "Cliente de teste",
    password: fixturePassword,
    consent: true,
    method: "typed",
  };
  assert.equal(
    (
      await request("/documents/" + id + "/sign", {
        method: "POST",
        cookie: adminCookie,
        data: sign,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/documents/" + id + "/sign", {
        method: "POST",
        cookie: clientCookie,
        data: sign,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/documents/" + id + "/view", {
        method: "POST",
        cookie: clientCookie,
        data: sign,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/documents/" + id + "/sign", {
        method: "POST",
        cookie: clientCookie,
        data: { ...sign, consent: false },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/documents/" + id + "/sign", {
        method: "POST",
        cookie: clientCookie,
        data: { ...sign, password: "incorrect!" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/documents/" + id + "/sign", {
        method: "POST",
        cookie: clientCookie,
        data: { ...sign, document_sha256: "0".repeat(64) },
      })
    ).status,
    409,
  );
  const decisions = await Promise.all([
    request("/documents/" + id + "/sign", {
      method: "POST",
      cookie: clientCookie,
      data: sign,
    }),
    request("/documents/" + id + "/sign", {
      method: "POST",
      cookie: clientCookie,
      data: sign,
    }),
  ]);
  assert.deepEqual(decisions.map((r) => r.status).sort(), [200, 409]);
  const evidence = (
    await request("/documents/" + id + "/evidence", { cookie: clientCookie })
  ).body;
  const { createHash } = await import("node:crypto");
  assert.equal(
    createHash("sha256")
      .update(Buffer.from(evidence.pdf, "base64"))
      .digest("hex"),
    evidence.document.pdf_sha256,
  );
  assert.equal(
    createHash("sha256").update(evidence.manifest_json).digest("hex"),
    evidence.manifest_sha256,
  );
  assert.equal(evidence.manifest.signer_id, signer.id);
  assert.equal(evidence.manifest.authentication, "portal_password");
  assert.equal(JSON.stringify(evidence).includes(fixturePassword), false);
  assert.equal(evidence.events.filter((e) => e.action === "signed").length, 1);
  assert.equal(
    (await request("/documents/" + id + "/verify", { cookie: clientCookie }))
      .body.valid,
    true,
  );
  assert.equal(
    (
      await request("/documents/" + id + "/void", {
        method: "POST",
        cookie: adminCookie,
        data: { version: 4, reason: "Tentativa de alterar assinatura" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/documents/" + id, {
        method: "DELETE",
        cookie: adminCookie,
        data: { version: 4 },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/documents", { cookie: clientCookie })).body.documents.some(
      (d) => d.id === id,
    ),
    true,
  );
  const backup = (await request("/export", { cookie: adminCookie })).body;
  assert.equal(backup.documents.find((d) => d.id === id).archived, 1);
  assert.equal(
    backup.document_signatures.filter((d) => d.document_id === id).length,
    1,
  );
  assert.equal(backup.document_files_included, false);
});
test("documents distinguish different people at one client and retain refusals", async () => {
  const signer = (await request("/me", { cookie: clientCookie })).body.user;
  const createdUser = await request("/users", {
    method: "POST",
    cookie: adminCookie,
    data: {
      name: "Outro assinante",
      email: "second-signer@example.invalid",
      password: fixturePassword,
      role: "client",
      client_id: clientA,
    },
  });
  assert.equal(createdUser.status, 201);
  const login = await request("/login", {
    method: "POST",
    data: { email: "second-signer@example.invalid", password: fixturePassword },
  });
  assert.equal(login.status, 200);
  const data = {
    title: "Documento de destinatário específico",
    client_id: clientA,
    recipient_id: signer.id,
    pdf: await documentFixture("Documento para recusa"),
  };
  const id = (
    await request("/documents", { method: "POST", cookie: teamCookie, data })
  ).body.id;
  await request("/documents/" + id + "/send", {
    method: "POST",
    cookie: teamCookie,
    data: { version: 1 },
  });
  assert.equal(
    (await request("/documents/" + id, { cookie: login.cookie })).status,
    404,
  );
  assert.equal(
    (await request("/documents/" + id + "/evidence", { cookie: login.cookie }))
      .status,
    404,
  );
  assert.equal(
    (
      await request("/documents/" + id + "/decline", {
        method: "POST",
        cookie: login.cookie,
        data: { version: 2, reason: "Não é meu" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/documents/" + id + "/decline", {
        method: "POST",
        cookie: clientCookie,
        data: { version: 2, reason: "Preciso rever os valores" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/documents/" + id + "/verify", { cookie: clientCookie }))
      .body.valid,
    false,
  );
  assert.equal(
    (await request("/documents/" + id + "/evidence", { cookie: clientCookie }))
      .status,
    409,
  );
  assert.equal(
    (
      await request("/documents/" + id, { cookie: clientCookie })
    ).body.events.some(
      (e) => e.action === "declined" && e.detail.includes("valores"),
    ),
    true,
  );
  const other = (
    await request("/documents", { method: "POST", cookie: adminCookie, data })
  ).body.id;
  await request("/documents/" + other + "/send", {
    method: "POST",
    cookie: adminCookie,
    data: { version: 1 },
  });
  await request("/documents/" + other + "/void", {
    method: "POST",
    cookie: adminCookie,
    data: { version: 2, reason: "Proposta substituída" },
  });
  assert.equal(
    (
      await request("/documents/" + other + "/sign", {
        method: "POST",
        cookie: clientCookie,
        data: { version: 2 },
      })
    ).status,
    409,
  );
});

test("meeting scheduling prevents conflicts and exposes no visitor details", async () => {
  const start = new Date(Date.now() + 7 * 86400000);
  start.setUTCHours(15, 0, 0, 0);
  const data = {
    starts_at: start.toISOString(),
    ends_at: new Date(+start + 3600000).toISOString(),
  };
  assert.equal((await request("/meetings/slots")).status, 401);
  assert.equal(
    (
      await request("/meetings/slots", {
        method: "POST",
        cookie: clientCookie,
        data,
      })
    ).status,
    403,
  );
  const slot = await request("/meetings/slots", {
    method: "POST",
    cookie: teamCookie,
    data,
  });
  assert.equal(slot.status, 201);
  assert.equal(
    (
      await request("/meetings/slots", {
        method: "POST",
        cookie: adminCookie,
        data,
      })
    ).status,
    409,
  );
  const booking = {
    slot_id: slot.body.id,
    name: "Pessoa do teste",
    email: "meeting@example.invalid",
    notes: "Reunião da agência",
    consent: true,
  };
  assert.equal(
    (
      await request("/scheduling/book", {
        method: "POST",
        data: { ...booking, consent: false },
      })
    ).status,
    400,
  );
  const reservations = await Promise.all([
    request("/scheduling/book", { method: "POST", data: booking }),
    request("/scheduling/book", { method: "POST", data: booking }),
  ]);
  assert.deepEqual(reservations.map((r) => r.status).sort(), [201, 409]);
  const id = reservations.find((r) => r.status === 201).body.id;
  const publicSlots = await request("/scheduling/slots");
  assert.equal(
    publicSlots.body.slots.some((s) => s.id === slot.body.id),
    false,
  );
  assert.equal(
    JSON.stringify(publicSlots.body).includes("meeting@example.invalid"),
    false,
  );
  assert.equal(
    (await request("/meetings", { cookie: clientCookie })).body.meetings.some(
      (m) => m.id === id,
    ),
    false,
  );
  assert.equal(
    (
      await request("/meetings/" + id, {
        method: "PUT",
        cookie: clientCookie,
        data: { status: "cancelled" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/meetings/" + id, {
        method: "PUT",
        cookie: adminCookie,
        data: { status: "confirmed" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/meetings/slots/" + slot.body.id, {
        method: "DELETE",
        cookie: adminCookie,
        data: {},
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/meetings/" + id, {
        method: "PUT",
        cookie: teamCookie,
        data: { status: "cancelled" },
      })
    ).status,
    200,
  );
  const own = await request("/scheduling/book", {
    method: "POST",
    cookie: clientCookie,
    data: booking,
  });
  assert.equal(own.status, 201);
  assert.equal(
    (await request("/meetings", { cookie: clientCookie })).body.meetings.some(
      (m) => m.id === own.body.id,
    ),
    true,
  );
  assert.equal(
    (
      await request("/meetings/" + own.body.id, {
        method: "PUT",
        cookie: clientCookie,
        data: { status: "confirmed" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/meetings/" + own.body.id, {
        method: "PUT",
        cookie: clientCookie,
        data: { status: "cancelled" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/meetings/slots/" + slot.body.id, {
        method: "DELETE",
        cookie: adminCookie,
        data: {},
      })
    ).status,
    200,
  );
  const backup = (await request("/export", { cookie: adminCookie })).body;
  assert.equal(backup.meetings.find((m) => m.id === id).status, "cancelled");
  assert.equal(
    backup.meeting_slots.find((s) => s.id === slot.body.id).archived,
    1,
  );
});
test("meeting slots reject invalid dates and duration", async () => {
  for (const data of [
    { starts_at: "2026-02-30T12:00:00Z", ends_at: "2026-02-30T13:00:00Z" },
    { starts_at: "2000-01-01T12:00:00Z", ends_at: "2000-01-01T13:00:00Z" },
    {
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      ends_at: new Date(Date.now() + 86400000 + 300000).toISOString(),
    },
  ])
    assert.equal(
      (
        await request("/meetings/slots", {
          method: "POST",
          cookie: adminCookie,
          data,
        })
      ).status,
      400,
    );
});
test("editorial approval scopes clients, rejects stale revisions and preserves history", async () => {
  const at = new Date().toISOString(),
    month = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 7);
  const data = {
    client_id: clientA,
    title: "Conteúdo de teste",
    caption: "Legenda original",
    channel: "Instagram",
    scheduled_at: at,
    asset_url: "https://example.com/material",
  };
  assert.equal((await request("/editorial")).status, 401);
  assert.equal(
    (
      await request("/editorial", {
        method: "POST",
        cookie: clientCookie,
        data,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/editorial", {
        method: "POST",
        cookie: adminCookie,
        data: { ...data, asset_url: "javascript:alert(1)" },
      })
    ).status,
    400,
  );
  const id = (
    await request("/editorial", { method: "POST", cookie: teamCookie, data })
  ).body.id;
  const own = async () =>
    (
      await request("/editorial?month=" + month, { cookie: adminCookie })
    ).body.posts.find((p) => p.id === id);
  assert.equal(
    (
      await request("/editorial?month=" + month, { cookie: clientCookie })
    ).body.posts.some((p) => p.id === id),
    false,
  );
  assert.equal(
    (await request("/editorial/" + id + "/history", { cookie: clientCookie }))
      .status,
    404,
  );
  assert.equal(
    (
      await request("/editorial/" + id, {
        method: "PUT",
        cookie: adminCookie,
        data: { version: 1, transition: "published" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/editorial/" + id, {
        method: "PUT",
        cookie: teamCookie,
        data: { version: 1, transition: "review" },
      })
    ).status,
    200,
  );
  const other = (
    await request("/editorial", {
      method: "POST",
      cookie: adminCookie,
      data: { ...data, client_id: clientB, title: "Outro cliente" },
    })
  ).body.id;
  await request("/editorial/" + other, {
    method: "PUT",
    cookie: adminCookie,
    data: { version: 1, transition: "review" },
  });
  assert.equal(
    (
      await request("/editorial/" + other + "/approval", {
        method: "POST",
        cookie: clientCookie,
        data: { version: 2, decision: "approved" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/editorial/" + id + "/approval", {
        method: "POST",
        cookie: teamCookie,
        data: { version: 2, decision: "approved" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/editorial/" + id + "/approval", {
        method: "POST",
        cookie: clientCookie,
        data: { version: 2, decision: "changes", comment: "" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/editorial/" + id + "/approval", {
        method: "POST",
        cookie: clientCookie,
        data: { version: 2, decision: "changes", comment: "Alterar legenda" },
      })
    ).status,
    200,
  );
  assert.equal((await own()).status, "changes");
  assert.equal(
    (
      await request("/editorial/" + id, {
        method: "PUT",
        cookie: adminCookie,
        data: { ...data, version: 2 },
      })
    ).status,
    409,
  );
  await request("/editorial/" + id, {
    method: "PUT",
    cookie: adminCookie,
    data: { ...data, caption: "Legenda corrigida", version: 3 },
  });
  await request("/editorial/" + id, {
    method: "PUT",
    cookie: adminCookie,
    data: { version: 4, transition: "review" },
  });
  const decisions = await Promise.all([
    request("/editorial/" + id + "/approval", {
      method: "POST",
      cookie: clientCookie,
      data: { version: 5, decision: "approved", comment: "Pode seguir" },
    }),
    request("/editorial/" + id + "/approval", {
      method: "POST",
      cookie: clientCookie,
      data: { version: 5, decision: "approved", comment: "Duplicada" },
    }),
  ]);
  assert.deepEqual(decisions.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await request("/editorial/" + id + "/history", { cookie: clientCookie }))
      .body.reviews.length,
    2,
  );
  assert.equal(
    (
      await request("/editorial/" + id, {
        method: "PUT",
        cookie: teamCookie,
        data: { version: 6, transition: "published" },
      })
    ).status,
    200,
  );
  assert.equal((await own()).status, "published");
  await request("/editorial/" + id, {
    method: "PUT",
    cookie: adminCookie,
    data: { ...data, caption: "Novo conteúdo exige revisão", version: 7 },
  });
  assert.equal((await own()).status, "draft");
  assert.equal(
    (
      await request("/editorial/" + id, {
        method: "DELETE",
        cookie: adminCookie,
        data: { version: 8 },
      })
    ).status,
    200,
  );
  const backup = (await request("/export", { cookie: adminCookie })).body;
  assert.equal(backup.editorial.find((p) => p.id === id).archived, 1);
  assert.equal(
    backup.editorial_reviews.filter((r) => r.editorial_id === id).length,
    2,
  );
  await request("/editorial/" + other, {
    method: "DELETE",
    cookie: adminCookie,
    data: { version: 2 },
  });
});

test("portfolio drafts, images, publishing and archive enforce access boundaries", async () => {
  assert.equal((await request("/admin/portfolio")).status, 401);
  for (const cookie of [teamCookie, clientCookie])
    assert.equal((await request("/admin/portfolio", { cookie })).status, 403);
  const data = {
    title: "Projeto privado <b>",
    category: "Identidade visual",
    summary: "Um trabalho de teste, somente na base isolada.",
    project_url: "https://example.com/project",
    published: false,
    featured: true,
  };
  const created = await request("/admin/portfolio", {
    method: "POST",
    cookie: adminCookie,
    data,
  });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(
    (await request("/portfolio")).body.portfolio.some((p) => p.id === id),
    false,
  );
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY1sAAAAASUVORK5CYII=";
  assert.equal(
    (
      await request("/admin/portfolio/" + id + "/image", {
        method: "POST",
        cookie: adminCookie,
        data: { mime: "image/png", base64: png },
      })
    ).status,
    200,
  );
  assert.equal(
    (await fetch(base + "/api/portfolio/" + id + "/image")).status,
    404,
  );
  const privateImage = await fetch(
    base + "/api/admin/portfolio/" + id + "/image",
    { headers: { Cookie: adminCookie } },
  );
  assert.equal(privateImage.status, 200);
  assert.equal(
    Buffer.from(await privateImage.arrayBuffer()).toString("base64"),
    png,
  );
  assert.equal(
    (
      await request("/admin/portfolio/" + id, {
        method: "PUT",
        cookie: adminCookie,
        data: { ...data, published: true },
      })
    ).status,
    200,
  );
  const published = (await request("/portfolio")).body.portfolio.find(
    (p) => p.id === id,
  );
  assert.equal(published.title, data.title);
  assert.ok(published.image_url.startsWith("/api/portfolio/"));
  const image = await fetch(base + published.image_url);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("Content-Type"), "image/png");
  assert.equal(image.headers.get("Cache-Control"), "no-store");
  assert.equal(
    (
      await request("/admin/portfolio/" + id, {
        method: "PUT",
        cookie: adminCookie,
        data,
      })
    ).status,
    200,
  );
  assert.equal((await fetch(base + published.image_url)).status, 404);
  assert.equal(
    (
      await request("/admin/portfolio/" + id, {
        method: "DELETE",
        cookie: adminCookie,
        data: {},
      })
    ).status,
    200,
  );
  const exported = (await request("/export", { cookie: adminCookie })).body;
  assert.equal(exported.portfolio.find((p) => p.id === id).archived, 1);
  assert.equal(exported.portfolio_images_included, false);
});
test("portfolio rejects unsafe project URLs and unsupported image content", async () => {
  const data = {
    title: "Validação de mídia",
    category: "Teste",
    summary: "",
    project_url: "",
    published: false,
    featured: false,
  };
  assert.equal(
    (
      await request("/admin/portfolio", {
        method: "POST",
        cookie: adminCookie,
        data: { ...data, project_url: "javascript:alert(1)" },
      })
    ).status,
    400,
  );
  const id = (
    await request("/admin/portfolio", {
      method: "POST",
      cookie: adminCookie,
      data,
    })
  ).body.id;
  for (const file of [
    { mime: "image/svg+xml", base64: Buffer.from("<svg/>").toString("base64") },
    { mime: "image/jpeg", base64: Buffer.from("<script/>").toString("base64") },
    { mime: "image/png", base64: "???" },
  ])
    assert.equal(
      (
        await request("/admin/portfolio/" + id + "/image", {
          method: "POST",
          cookie: adminCookie,
          data: file,
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await request("/admin/portfolio/" + id + "/image", {
        method: "POST",
        cookie: teamCookie,
        data: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/portfolio", { method: "POST", data })).status,
    405,
  );
  await request("/admin/portfolio/" + id, {
    method: "DELETE",
    cookie: adminCookie,
    data: {},
  });
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
        data: { current: fixturePassword, password: "1234567" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/password", {
        method: "POST",
        cookie: clientCookie,
        data: { current: fixturePassword, password: "Alter12!" },
      })
    ).status,
    200,
  );
  assert.equal((await request("/me", { cookie: clientCookie })).status, 401);
});

test("administrator can reset and reactivate access without removing records", async () => {
  assert.equal(
    (
      await request("/users/" + teamId, {
        method: "PATCH",
        cookie: adminCookie,
        data: { action: "password", password: "1234567" },
      })
    ).status,
    400,
  );
  for (const data of [
    { action: "password", password: "Reset12!" },
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
          password: "Reset12!",
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
      password: "Alter12!",
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
        level: 2,
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

test("browser: administrator uploads a portfolio image and publishes it on the website", async () => {
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
    await page.goto(base + "/portal");
    await page.getByRole("heading", { name: /Olá,/ }).waitFor();
    await page.getByRole("button", { name: "Portfólio", exact: true }).click();
    await page
      .getByRole("button", { name: "Novo trabalho", exact: true })
      .click();
    await page
      .getByLabel("Título do trabalho")
      .fill("Horizonte · identidade visual");
    await page.getByLabel("Categoria", { exact: true }).fill("Branding");
    await page
      .getByLabel("Descrição do projeto")
      .fill("Projeto de demonstração usado exclusivamente no teste local.");
    const jpeg = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 600;
      const c = canvas.getContext("2d");
      c.fillStyle = "#5b2da8";
      c.fillRect(0, 0, 800, 600);
      c.fillStyle = "#f18a44";
      c.beginPath();
      c.arc(400, 300, 160, 0, Math.PI * 2);
      c.fill();
      return canvas.toDataURL("image/jpeg").split(",")[1];
    });
    await page.getByLabel("Imagem do trabalho").setInputFiles({
      name: "portfolio-fixture.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(jpeg, "base64"),
    });
    await page.getByLabel("Publicar no site").check();
    await page
      .getByRole("button", { name: "Salvar trabalho", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("heading", {
        name: "Horizonte · identidade visual",
        exact: true,
      })
      .waitFor();
    await page.screenshot({
      path: "test-results/portfolio-admin-desktop.png",
      fullPage: true,
    });
    const publicPage = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await publicPage.goto(base + "/#trabalhos");
    await publicPage
      .getByRole("heading", {
        name: "Horizonte · identidade visual",
        exact: true,
      })
      .waitFor();
    const image = publicPage.getByRole("img", {
      name: "Horizonte · identidade visual",
      exact: true,
    });
    await image.waitFor();
    assert.ok(
      await image.evaluate((node) => node.complete && node.naturalWidth > 0),
    );
    assert.equal(
      await publicPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await publicPage.screenshot({
      path: "test-results/portfolio-public-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await publicPage
        .getByRole("link", { name: "Conversar com a Ilustre pelo WhatsApp" })
        .getAttribute("href")
        .then((v) => v.includes("5537999129477")),
      true,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("browser: marketing motion respects reduced motion and keyboard focus", async () => {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await page.goto(base);
    await page.getByRole("heading", { name: /Marcas em/ }).waitFor();
    await page.getByRole("link", { name: "Conheça a Ilustre" }).focus();
    assert.equal(
      await page.evaluate(() =>
        document.activeElement.textContent.includes("Conheça"),
      ),
      true,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page.evaluate(
        () =>
          document
            .querySelector(".agency-site")
            .getAnimations({ subtree: true })
            .filter((a) => a.playState === "running").length,
      ),
      0,
    );
    await page.reload();
    await page.getByRole("heading", { name: /Marcas em/ }).waitFor();
    await page.locator(".il-services").scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () =>
          document
            .querySelector(".agency-site")
            .getAnimations({ subtree: true })
            .filter((a) => a.playState === "running").length,
      ),
      0,
    );
    await page.setViewportSize({ width: 390, height: 844 });
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
test("browser: public booking, staff confirmation and client editorial approval", async () => {
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
    await page.goto(base + "/portal");
    await page
      .getByRole("button", { name: "Agenda de reuniões", exact: true })
      .click();
    const future = new Date(Date.now() + 10 * 86400000);
    future.setUTCHours(16, 0, 0, 0);
    const localTime = new Date(+future - 3 * 3600000)
      .toISOString()
      .slice(0, 16);
    await page.getByLabel("Data e hora de início").fill(localTime);
    await page
      .getByRole("button", { name: "Adicionar horário", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Retirar horário", exact: true })
      .waitFor();
    const publicPage = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await publicPage.goto(base + "/#agendar");
    await publicPage.getByLabel("Horário disponível").waitFor();
    await publicPage
      .getByLabel("Seu nome", { exact: true })
      .fill("Reunião pelo navegador");
    await publicPage
      .getByLabel("Seu e-mail", { exact: true })
      .fill("meeting-browser@example.invalid");
    await publicPage
      .getByLabel("Sobre a conversa")
      .fill("Briefing para novo projeto");
    await publicPage
      .getByLabel("Autorizo o uso destes dados para tratar do agendamento.")
      .check();
    await publicPage
      .getByRole("button", { name: "Solicitar reunião", exact: true })
      .click();
    await publicPage
      .getByText("Solicitação recebida!", { exact: false })
      .waitFor();
    assert.equal(
      await publicPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Agenda de reuniões", exact: true })
      .click();
    const meeting = page
      .locator("article")
      .filter({ hasText: "Reunião pelo navegador" });
    await meeting
      .getByRole("button", { name: "Confirmar reunião", exact: true })
      .click();
    await meeting.getByText("Confirmada", { exact: true }).waitFor();
    await page.screenshot({
      path: "test-results/meetings-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Calendário editorial", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Novo conteúdo", exact: true })
      .click();
    await page.getByLabel("Cliente do conteúdo").selectOption(clientA);
    await page
      .getByLabel("Título do conteúdo")
      .fill("Ilustre · aprovação editorial");
    const date = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 16);
    await page.getByLabel("Data e hora planejada").fill(date);
    await page
      .getByLabel("Legenda", { exact: true })
      .fill("Uma ideia aprovada pelo cliente.");
    await page
      .getByRole("button", { name: "Salvar rascunho", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const card = page
      .locator("article")
      .filter({ hasText: "Ilustre · aprovação editorial" });
    await card
      .getByRole("button", { name: "Enviar para aprovação", exact: true })
      .click();
    await card.getByText("Em aprovação", { exact: true }).waitFor();
    const login = await request("/login", {
      method: "POST",
      data: { email: "client@example.invalid", password: "Alter12!" },
    });
    assert.equal(login.status, 200);
    const cc = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const [cn, cv] = login.cookie.split("=");
    await cc.addCookies([{ name: cn, value: cv, url: base }]);
    const cp = await cc.newPage();
    await cp.goto(base + "/portal");
    await cp
      .getByRole("button", { name: "Alternar navegação", exact: true })
      .click();
    await cp
      .getByRole("button", { name: "Calendário editorial", exact: true })
      .click();
    await cp
      .getByRole("heading", {
        name: "Ilustre · aprovação editorial",
        exact: true,
      })
      .waitFor();
    await cp
      .getByRole("button", { name: "Revisar conteúdo", exact: true })
      .click();
    await cp
      .getByLabel("Comentário da revisão")
      .fill("Aprovado pelo navegador");
    await cp
      .getByRole("button", { name: "Enviar revisão", exact: true })
      .click();
    await cp.getByRole("dialog").waitFor({ state: "hidden" });
    await cp.getByText("Aprovado", { exact: true }).waitFor();
    assert.equal(
      await cp.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await cp.screenshot({
      path: "test-results/editorial-client-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Mostrar todos / atualizar", exact: true })
      .click();
    await card
      .getByRole("button", { name: "Marcar publicado", exact: true })
      .click();
    await card.getByText("Publicado manualmente", { exact: true }).waitFor();
    await page.screenshot({
      path: "test-results/editorial-desktop.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
test("browser: upload PDF, draw signature and download a readable receipt", async () => {
  const { chromium } = await import("@playwright/test");
  const { PDFDocument, PDFName, PDFDict } = await import("pdf-lib");
  const { readFile } = await import("node:fs/promises");
  const browser = await chromium.launch({ headless: true });
  try {
    const ac = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      [an, av] = adminCookie.split("=");
    await ac.addCookies([{ name: an, value: av, url: base }]);
    const ap = await ac.newPage(),
      errors = [];
    ap.on("pageerror", (e) => errors.push(e.message));
    await ap.goto(base + "/portal");
    await ap
      .getByRole("button", { name: "Documentos & assinaturas", exact: true })
      .click();
    const recipients = (
        await request("/documents/recipients", { cookie: adminCookie })
      ).body.recipients,
      recipient = recipients.find((r) => r.email === "client@example.invalid");
    await ap
      .getByRole("button", { name: "Novo documento", exact: true })
      .click();
    await ap
      .getByLabel("Título do documento")
      .fill("Contrato · assinatura pelo navegador");
    await ap
      .getByLabel("Destinatário da assinatura")
      .selectOption(recipient.id);
    await ap.getByLabel("Arquivo PDF").setInputFiles({
      name: "contrato-fixture.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(
        await documentFixture("Contrato - teste de assinatura"),
        "base64",
      ),
    });
    await ap
      .getByRole("button", { name: "Salvar documento", exact: true })
      .click();
    await ap.getByRole("dialog").waitFor({ state: "hidden" });
    const card = ap
      .locator("article")
      .filter({ hasText: "Contrato · assinatura pelo navegador" });
    await card
      .getByRole("button", { name: "Enviar ao cliente", exact: true })
      .click();
    await ap
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await ap.getByRole("dialog").waitFor({ state: "hidden" });
    await card.getByText("Aguardando assinatura", { exact: true }).waitFor();
    const login = await request("/login", {
      method: "POST",
      data: { email: "client@example.invalid", password: "Alter12!" },
    });
    assert.equal(login.status, 200);
    const cc = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      [cn, cv] = login.cookie.split("=");
    await cc.addCookies([{ name: cn, value: cv, url: base }]);
    const cp = await cc.newPage();
    cp.on("pageerror", (e) => errors.push(e.message));
    await cp.goto(base + "/portal");
    await cp
      .getByRole("button", { name: "Alternar navegação", exact: true })
      .click();
    await cp
      .getByRole("button", { name: "Documentos & assinaturas", exact: true })
      .click();
    await cp
      .getByRole("button", { name: "Ler e assinar", exact: true })
      .click();
    await cp
      .getByRole("button", { name: "Preparar assinatura", exact: true })
      .click();
    await cp
      .getByRole("button", { name: "Desenhar assinatura", exact: true })
      .click();
    const canvas = cp.locator(".document-drawing canvas");
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    await cp.mouse.move(box.x + 30, box.y + 90);
    await cp.mouse.down();
    await cp.mouse.move(box.x + 60, box.y + 30, { steps: 5 });
    await cp.mouse.move(box.x + 100, box.y + 95, { steps: 5 });
    await cp.mouse.move(box.x + 180, box.y + 50, { steps: 5 });
    await cp.mouse.up();
    await cp
      .getByLabel("Nome completo para assinar")
      .fill("Cliente de teste UTV");
    await cp.getByLabel("Confirme sua senha do portal").fill("Alter12!");
    await cp.getByRole("checkbox").check();
    await cp
      .getByRole("button", { name: "Assinar documento", exact: true })
      .click();
    await cp
      .getByRole("heading", { name: "Assinatura concluída", exact: true })
      .waitFor();
    const [download] = await Promise.all([
      cp.waitForEvent("download"),
      cp
        .getByRole("button", {
          name: "Baixar PDF com comprovante",
          exact: true,
        })
        .click(),
    ]);
    await download.saveAs("test-results/document-signed.pdf");
    const bytes = await readFile("test-results/document-signed.pdf"),
      pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() >= 2);
    const names = pdf.catalog.lookup(PDFName.of("Names"), PDFDict);
    assert.ok(names.has(PDFName.of("EmbeddedFiles")));
    await cp
      .getByRole("button", { name: "Conferir integridade", exact: true })
      .click();
    await cp
      .getByText("Integridade conferida com os registros atuais do servidor.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await cp.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await cp
      .getByRole("dialog")
      .screenshot({ path: "test-results/document-signed-mobile.png" });
    // Reopen the generated PDF through the app renderer to inspect the receipt visually.
    await ap
      .getByRole("button", { name: "Novo documento", exact: true })
      .click();
    await ap
      .getByLabel("Título do documento")
      .fill("Cópia de conferência do comprovante");
    await ap
      .getByLabel("Destinatário da assinatura")
      .selectOption(recipient.id);
    await ap.getByLabel("Arquivo PDF").setInputFiles({
      name: "comprovante-fixture.pdf",
      mimeType: "application/pdf",
      buffer: bytes,
    });
    await ap
      .getByRole("button", { name: "Salvar documento", exact: true })
      .click();
    await ap.getByRole("dialog").waitFor({ state: "hidden" });
    await ap
      .locator("article")
      .filter({ hasText: "Cópia de conferência do comprovante" })
      .getByRole("button", { name: "Abrir documento", exact: true })
      .click();
    await ap
      .getByRole("button", { name: "Próxima página", exact: true })
      .click();
    await ap.getByText("Página 2 de 2", { exact: true }).waitFor();
    await ap
      .getByText("Carregando página…", { exact: true })
      .waitFor({ state: "hidden" });
    await ap
      .locator(".document-preview canvas")
      .screenshot({ path: "test-results/document-receipt-render.png" });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
