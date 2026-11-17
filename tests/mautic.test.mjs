import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const compile = (s) =>
  ts.transpile(s, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  });
const moduleUrl = (s) =>
  "data:text/javascript;base64," + Buffer.from(s).toString("base64");
const security = moduleUrl(
  compile(
    await readFile(new URL("../worker/security.ts", import.meta.url), "utf8"),
  ),
);
const { syncContact } = await import(
  moduleUrl(
    compile(
      (
        await readFile(new URL("../worker/mautic.ts", import.meta.url), "utf8")
      ).replace('"./security"', JSON.stringify(security)),
    ),
  )
);
const env = {
  MAUTIC_BASE_URL: "https://mautic.example.com",
  MAUTIC_CLIENT_ID: "fixture-client",
  MAUTIC_CLIENT_SECRET: "fixture-secret",
};
const contact = {
  name: "Pessoa de Teste",
  email: "person@example.invalid",
  phone: "000",
};
const respond = (data) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
test("Mautic refuses unconfigured and unsafe origins before making requests", async () => {
  let calls = 0;
  const mock = async () => {
    calls++;
    return respond({});
  };
  await assert.rejects(syncContact({}, contact, mock), (e) => e.status === 503);
  for (const url of [
    "http://mautic.example.com",
    "https://127.0.0.1",
    "https://10.1.1.1",
    "https://mautic.example.com/path",
    "https://user:pass@mautic.example.com",
  ])
    await assert.rejects(
      syncContact({ ...env, MAUTIC_BASE_URL: url }, contact, mock),
      (e) => e.status === 503,
    );
  assert.equal(calls, 0);
});
test("Mautic obtains OAuth token, searches and creates a minimal contact", async () => {
  const calls = [];
  const mock = async (url, init) => {
    calls.push({ url: String(url), init });
    return respond(
      calls.length === 1
        ? { access_token: "fixture-access" }
        : calls.length === 2
          ? { contacts: {} }
          : { contact: { id: 42 } },
    );
  };
  assert.equal(await syncContact(env, contact, mock), 42);
  assert.equal(calls[0].url, "https://mautic.example.com/oauth/v2/token");
  assert.equal(calls[0].init.body.get("grant_type"), "client_credentials");
  assert.equal(calls[2].url, "https://mautic.example.com/api/contacts/new");
  assert.equal(calls[2].init.method, "POST");
  const data = JSON.parse(calls[2].init.body);
  assert.equal(data.firstname, "Pessoa");
  assert.equal(data.lastname, "de Teste");
  assert.equal(data.email, contact.email);
  assert.equal(data.notes, undefined);
  assert.ok(calls.every((c) => c.init.redirect === "error"));
  assert.equal(calls[2].init.headers.Authorization, "Bearer fixture-access");
});
test("Mautic updates an exact email match instead of creating another contact", async () => {
  const calls = [];
  const mock = async (url, init) => {
    calls.push({ url: String(url), init });
    return respond(
      calls.length === 1
        ? { access_token: "fixture-access" }
        : calls.length === 2
          ? {
              contacts: {
                8: {
                  id: 8,
                  fields: { all: { email: contact.email.toUpperCase() } },
                },
              },
            }
          : { contact: { id: 8 } },
    );
  };
  assert.equal(await syncContact(env, contact, mock), 8);
  assert.equal(calls[2].init.method, "PATCH");
  assert.equal(calls[2].url, "https://mautic.example.com/api/contacts/8/edit");
});
test("Mautic failures never return provider bodies or secrets", async () => {
  await assert.rejects(
    syncContact(
      env,
      contact,
      async () => new Response("fixture-secret", { status: 401 }),
    ),
    (e) => e.status === 502 && !e.message.includes("fixture-secret"),
  );
  let calls = 0;
  await assert.rejects(
    syncContact(env, contact, async () =>
      respond(
        ++calls === 1
          ? { access_token: "x" }
          : {
              contacts: {
                1: { id: 1, fields: { all: { email: contact.email } } },
                2: { id: 2, fields: { all: { email: contact.email } } },
              },
            },
      ),
    ),
    (e) => e.status === 502,
  );
  assert.equal(calls, 2);
});
