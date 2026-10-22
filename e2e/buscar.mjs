// Prueba de extremo a extremo en Chrome REAL: buscar, y luego buscar OTRA categoría (caso: «la página se cae»).
// Uso: BASE=http://localhost:3185 PASS=... node e2e/buscar.mjs
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE ?? "http://localhost:3185";
const PASS = process.env.PASS ?? "prueba-local";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const log = [];
const note = (...a) => { log.push(a.join(" ")); console.log(...a); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });
page.on("pageerror", (e) => note("PAGEERROR:", e.message.slice(0, 400)));
page.on("console", (m) => { if (m.type() === "error") note("CONSOLE.ERROR:", m.text().slice(0, 400)); });
page.on("requestfailed", (r) => note("REQFAILED:", r.url().slice(0, 120), r.failure()?.errorText));

const bodyText = () => page.evaluate(() => document.body.innerText);
const crashed = async () => (await bodyText()).includes("Application error");

await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type("#identifier", process.env.ADMIN_USER ?? "admin"); await page.type("#password", PASS);
await (await page.$$("button")).find(async () => true); // (se pulsa «Entrar» por su texto)
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Entrar/.test(b.textContent)).click());
await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 30_000 }); // la redirección de Next es interna, no una carga completa

async function search(category, zones, wait = 150_000) {
  await page.goto(`${BASE}/buscar`, { waitUntil: "networkidle0" });
  return runSearch(category, zones, wait);
}
async function runSearch(category, zones, wait = 150_000) {
  const before = page.url();
  await page.$eval("#categories", (el) => { el.focus(); }); await page.click("#categories", { clickCount: 3 }); await page.keyboard.press("Backspace"); await page.type("#categories", category);
  await page.click("#zones", { clickCount: 3 }); await page.keyboard.press("Backspace"); if (zones) await page.type("#zones", zones);
  const btn = await page.$$eval("button", (bs) => bs.findIndex((b) => /Buscar en/.test(b.textContent)));
  const t0 = Date.now();
  await (await page.$$("button"))[btn].click();
  await page.waitForFunction((b) => document.body.innerText.includes("Application error") || location.href !== b || /resultados de/.test(document.body.innerText) && !/Buscando/.test(document.body.innerText), { timeout: wait }, before).catch(() => note("TIMEOUT esperando resultados"));
  await new Promise((r) => setTimeout(r, 2500));
  const txt = await bodyText();
  const m = txt.match(/\d+ resultados de [^\n]*/);
  note(`  «${category}» → ${((Date.now() - t0) / 1000).toFixed(0)} s · ${m ? m[0].slice(0, 90) : "(sin mensaje de resultados)"} · url=${page.url().replace(BASE, "")} · caída=${await crashed()}`);
  return { crashed: await crashed(), url: page.url() };
}

note("== 1) primera búsqueda");
const a = await search("ferretería", "Chapinero");
note("== 2) OTRA categoría con resultados en pantalla");
const b = await runSearch("boutique", "Chapinero");
note("== 3) otra vez, sin recargar");
const c = await runSearch("droguería", "Suba");
await page.screenshot({ path: "/tmp/e2e-buscar.png" });
await browser.close();
const bad = a.crashed || b.crashed || c.crashed || log.some((l) => /PAGEERROR/.test(l));
note(bad ? "\nRESULTADO: SE CAYÓ" : "\nRESULTADO: no se cayó");
process.exit(bad ? 1 : 0);
