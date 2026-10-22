// Chrome REAL: crear una búsqueda, ABRIR su página restaurada (?search=ID) y desde ahí pulsar Buscar con OTRA categoría,
// ESPERANDO a que termine (puede tardar ~45 s). Este es el caso en que la página se caía.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE ?? "http://localhost:3184", PASS = process.env.PASS ?? "prueba-local";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const errs = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 1000 });
page.on("pageerror", (e) => { errs.push("PAGEERROR: " + e.message); console.log("PAGEERROR:", e.message.slice(0, 600)); });
page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) { errs.push("CONSOLE: " + m.text()); console.log("CONSOLE.ERROR:", m.text().slice(0, 600)); } });
const txt = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
const sid = (u) => new URL(u).searchParams.get("search");
const state = async (name) => { const t = await txt(); console.log(`  ${name} → AppError=${/Application error/.test(t)} recuperación=${/Recargar la página/.test(t)} url=${page.url().replace(BASE, "").slice(0, 60)}`); return t; };
const clickBuscar = () => page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Buscar en/.test(b.textContent)).click());
const setCat = async (c) => { await page.click("#categories", { clickCount: 3 }); await page.keyboard.press("Backspace"); await page.type("#categories", c); };

await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" }); await page.type("#identifier", process.env.ADMIN_USER ?? "admin"); await page.type("#password", PASS);
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Entrar/.test(b.textContent)).click());
await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 30000 });
await page.goto(`${BASE}/buscar`, { waitUntil: "networkidle0" });
await setCat("ferretería"); await page.type("#zones", "Chapinero"); await clickBuscar();
await page.waitForFunction(() => new URL(location.href).searchParams.get("search"), { timeout: 180000 });
await new Promise((r) => setTimeout(r, 3000)); await state("1) búsqueda creada");
const restored = page.url(); const firstId = sid(restored);

console.log("  → abro la página RESTAURADA y desde ahí busco otra categoría (esperando a que termine)…");
await page.goto(restored, { waitUntil: "networkidle0" }); await new Promise((r) => setTimeout(r, 2000)); await state("2) página restaurada");
await setCat("boutique"); const t0 = Date.now(); await clickBuscar();
await page.waitForFunction((id) => /Application error/.test(document.body.innerText) || (new URL(location.href).searchParams.get("search") && new URL(location.href).searchParams.get("search") !== id), { timeout: 180000 }, firstId).catch(() => console.log("  TIMEOUT"));
await new Promise((r) => setTimeout(r, 4000));
const t = await state(`3) tras buscar «boutique» (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
console.log("     mensaje:", (t.match(/\d+ resultados de [^.]*\./) ?? ["(ninguno)"])[0].slice(0, 100));
await page.screenshot({ path: "/tmp/e2e-desde-restaurada.png" });
await browser.close();
console.log(errs.length ? "\nRESULTADO: HUBO ERRORES" : "\nRESULTADO: sin errores");
process.exit(errs.length ? 1 : 0);
