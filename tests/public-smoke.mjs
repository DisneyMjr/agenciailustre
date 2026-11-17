import { chromium } from "@playwright/test";
const base = "https://agenciailustre.disneymjr.workers.dev";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto(base);
  if (response.status() !== 200) throw Error("Site unavailable");
  await page.getByRole("heading", { name: /Boas ideias/ }).waitFor();
  await page.screenshot({
    path: "test-results/public-site.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  if (
    !(await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ))
  )
    throw Error("Mobile overflow");
  await page.goto(base + "/portal");
  await page.getByRole("button", { name: "Entrar no meu espaço" }).waitFor();
  const health = await page.request.get(base + "/api/health");
  if (health.status() !== 200) throw Error("API unavailable");
  const protectedResponse = await page.request.get(
    base + "/api/records/clients",
  );
  if (protectedResponse.status() !== 401)
    throw Error("Anonymous access must be blocked");
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Public smoke passed: site, mobile layout, portal, health and anonymous access protection. No production records created.",
  );
} finally {
  await browser.close();
}
