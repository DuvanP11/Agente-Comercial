import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isScanPath, ProbeTracker } from "@/lib/scan-guard";
import { logError } from "@/lib/log";

describe("detección de escaneos", () => {
  it("reconoce los sondeos típicos de bots", () => {
    for (const p of ["/.env", "/.env.production", "/.git/config", "/.aws/credentials", "/wp-admin/setup-config.php", "/wp-login.php", "/xmlrpc.php", "/phpmyadmin/index.php", "/admin.php", "/shell.php", "/backup.sql", "/db.zip", "/cgi-bin/test.cgi", "/actuator/health", "/server-status", "/a/../../etc/passwd", "/%2e%2e/%2e%2e/etc/passwd", "/vendor/phpunit/src/Util/PHP/eval-stdin.php", "/config.json", "/%E0%A4%A"])
      expect(isScanPath(p), p).toBe(true);
    expect(isScanPath("/buscar", "?q=union select password from users")).toBe(true);
    expect(isScanPath("/x", "?a=<script>alert(1)</script>")).toBe(true);
    expect(isScanPath("/x", "?file=../../etc/passwd")).toBe(true);
  });
  it("no confunde el uso normal de la plataforma con un escaneo", () => {
    for (const p of ["/", "/login", "/bienvenida", "/buscar", "/prospectos", "/prospectos/0f8fad5b-d9cb-469f-a165-70867728950e", "/campanas/abc", "/api/campaigns/abc/attachments", "/api/campaigns/abc/attachments/def", "/api/audit/event", "/reportes/prospectos", "/auditoria/exportar", "/brand/logo", "/brand/pibox-logo.png", "/cuenta", "/login/recuperar", "/m/entrenamiento"])
      expect(isScanPath(p), p).toBe(false);
    expect(isScanPath("/buscar", "?search=abc-123&contacto=any")).toBe(false);
  });
  it("tras varios sondeos la IP queda bloqueada un rato y luego se libera; otras IP no se ven afectadas", () => {
    const t = new ProbeTracker(3, 600_000, 3_600_000);
    expect(t.record("1.1.1.1", 1000)).toBe(false); expect(t.record("1.1.1.1", 2000)).toBe(false);
    expect(t.isBlocked("1.1.1.1", 2500)).toBe(false);
    expect(t.record("1.1.1.1", 3000)).toBe(true);
    expect(t.isBlocked("1.1.1.1", 4000)).toBe(true); expect(t.isBlocked("2.2.2.2", 4000)).toBe(false);
    expect(t.isBlocked("1.1.1.1", 3_000 + 3_600_001)).toBe(false);
    const slow = new ProbeTracker(3, 1000, 5000);                                          // sondeos muy espaciados no suman
    slow.record("3.3.3.3", 0); slow.record("3.3.3.3", 2000); expect(slow.record("3.3.3.3", 4000)).toBe(false);
  });
});

describe("consola y errores limpios", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : []; });
  it("el código de la app no usa console.* (en producción el navegador no imprime nada; el servidor usa logError)", () => {
    const offenders = walk("src").filter((f) => /\bconsole\.(log|error|warn|info|debug|trace)\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("la configuración quita console y los mapas de código en producción, y fija las cabeceras de seguridad", () => {
    const c = readFileSync("next.config.ts", "utf8");
    expect(c).toMatch(/removeConsole/); expect(c).toMatch(/productionBrowserSourceMaps: false/);
    for (const h of ["Content-Security-Policy", "X-Frame-Options", "Strict-Transport-Security", "Cross-Origin-Opener-Policy", "Cross-Origin-Resource-Policy", "X-Robots-Tag", "no-store"]) expect(c, h).toContain(h);
  });
  it("logError no lanza y oculta cadenas de conexión", () => {
    const chunks: string[] = []; const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((s: string) => { chunks.push(String(s)); return true; }) as typeof process.stderr.write;
    try { logError("falló", new Error("conectando a postgres://user:clave@host/db"), { a: 1 }); } finally { process.stderr.write = orig; }
    expect(chunks.join("")).toContain("[conexión oculta]"); expect(chunks.join("")).not.toContain("clave@host");
  });
});
