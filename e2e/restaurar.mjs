// Chrome REAL: buscar, RECARGAR (búsqueda restaurada desde la base), abrir una ficha y volver, y buscar otra cosa desde la restaurada.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE ?? "http://localhost:3185", PASS = process.env.PASS ?? "prueba-local";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const errs = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 1000 });
page.on("pageerror", (e) => { errs.push("PAGEERROR: " + e.message.slice(0, 500)); console.log("PAGEERROR:", e.message.slice(0, 500)); });
page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) { errs.push(m.text()); console.log("CONSOLE.ERROR:", m.text().slice(0, 500)); } });
const txt = () => page.evaluate(() => document.body.innerText);
const crashed = async () => /Application error/.test(await txt());
const settle = (ms = 2500) => new Promise((r) => setTimeout(r, ms));
const step = async (name) => console.log(`  ${name} → caída=${await crashed()} url=${page.url().replace(BASE, "")}`);

await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type("#password", PASS);
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Entrar/.test(b.textContent)).click());
await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 30000 });
await page.goto(`${BASE}/buscar`, { waitUntil: "networkidle0" });
await page.type("#categories", "ferretería"); await page.type("#zones", "Chapinero");
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Buscar en/.test(b.textContent)).click());
await page.waitForFunction(() => /resultados de/.test(document.body.innerText), { timeout: 150000 }); await settle();
await step("1) búsqueda en vivo");
const searchUrl = page.url();

await page.reload({ waitUntil: "networkidle0" }); await settle(); await step("2) RECARGAR (restaurada)");
const hasTable = (await txt()).includes("Empresa");
console.log("     tabla visible tras recargar:", hasTable);

// abrir una ficha y volver
const fichaHref = await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => /Ver ficha/.test(a.textContent))?.getAttribute("href"));
console.log("     enlace de ficha:", fichaHref);
if (fichaHref) {
  await page.goto(BASE + fichaHref, { waitUntil: "networkidle0" }); await settle(); await step("3) ficha");
  await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => /Volver a la búsqueda/.test(a.textContent))?.click());
  await page.waitForFunction(() => location.pathname.startsWith("/buscar"), { timeout: 20000 }); await settle(); await step("4) volver desde la ficha");
}
// buscar otra cosa partiendo de la restaurada
await page.goto(searchUrl, { waitUntil: "networkidle0" }); await settle();
await page.click("#categories", { clickCount: 3 }); await page.keyboard.press("Backspace"); await page.type("#categories", "boutique");
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Buscar en/.test(b.textContent)).click());
await page.waitForFunction(() => /Application error/.test(document.body.innerText) || location.search !== "" && /resultados de/.test(document.body.innerText), { timeout: 150000 }).catch(() => console.log("TIMEOUT"));
await settle(); await step("5) OTRA búsqueda partiendo de la restaurada");
await page.screenshot({ path: "/tmp/e2e-restaurar.png" });
await browser.close();
console.log(errs.length ? "\nRESULTADO: HUBO ERRORES" : "\nRESULTADO: sin errores");
process.exit(errs.length ? 1 : 0);
