import { describe, expect, it } from "vitest";
import { createPgliteDb, ensureDefaultOrg } from "@/lib/db/client";
import { cleanPath, cleanText, CLIENT_KINDS, isKind, KINDS, moduleOf, shortPath } from "@/lib/activity";
import { activityStats, listActivity, logActivity } from "@/lib/services/activity";

const U = { id: "u1", name: "Ana Pérez", email: "ana@pibox.app", role: "hunter" };

describe("registro de actividad: reglas puras", () => {
  it("rutas limpias: sin parámetros, sin caracteres raros, con límite", () => {
    expect(cleanPath("/prospectos/abc?x=1#y")).toBe("/prospectos/abc");
    expect(cleanPath("/")).toBe("/"); expect(cleanPath("/buscar")).toBe("/buscar");
    for (const bad of ["buscar", "//evil.com", "/a b", "/a<script>", "/a/../etc", "https://x.com/a", 5, null, "/" + "a".repeat(300)]) expect(cleanPath(bad), String(bad)).toBeNull();
    expect(shortPath("/prospectos/0f8fad5b-d9cb-469f-a165-70867728950e")).toBe("/prospectos/:id");
  });
  it("módulo de cada ruta; el navegador solo puede reportar vistas y clics", () => {
    expect(moduleOf("/campanas/123")).toBe("Campañas"); expect(moduleOf("/")).toBe("Dashboard"); expect(moduleOf("/bienvenida")).toBe("Inicio");
    expect(moduleOf("/zzz")).toBe("Otros"); expect(moduleOf(null)).toBe("—");
    expect(CLIENT_KINDS).toEqual(["view", "click"]);
    expect(isKind("download") && isKind("probe") && !isKind("borrar")).toBe(true);
    expect(Object.keys(KINDS)).toContain("login_failed");
    expect(cleanText("a\u0000b\nc ", 10)).toBe("a b c");
  });
});

describe("registro de actividad con base de datos", () => {
  it("guarda con persona, rol y detalle; filtra por persona, tipo, texto y fechas; el más nuevo primero", async () => {
    const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
    await logActivity(d, o, { kind: "login", label: "Inició sesión", user: U, ip: "181.1.2.3", userAgent: "Chrome" });
    await logActivity(d, o, { kind: "import", label: "Importó prospectos desde «lista.xlsx»", user: U, detail: { archivo: "lista.xlsx", filas: 40 }, path: "/importar" });
    await logActivity(d, o, { kind: "download", label: "Descargó el reporte de prospectos (CSV)", user: { ...U, id: "u2", name: "Luis Gómez" } });
    await logActivity(d, o, { kind: "login_failed", label: "Intento de acceso fallido", detail: { identificador: "ana" }, ip: "10.0.0.9" });
    const all = await listActivity(d, o);
    expect(all).toHaveLength(4);
    for (let i = 1; i < all.length; i++) expect(all[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(all[i].createdAt.getTime()); // el más nuevo primero
    expect(all.find((r) => r.kind === "import")).toMatchObject({ userName: "Ana Pérez", role: "hunter", detail: { archivo: "lista.xlsx", filas: 40 }, path: "/importar" });
    expect(await listActivity(d, o, { userId: "u1" })).toHaveLength(2);
    expect(await listActivity(d, o, { kind: "download" })).toHaveLength(1);
    expect((await listActivity(d, o, { q: "lista.xlsx" })).length).toBe(1);
    expect((await listActivity(d, o, { q: "luis" })).length).toBe(1);
    expect(await listActivity(d, o, { from: new Date(Date.now() + 86_400_000) })).toHaveLength(0);
    expect(await listActivity(d, o, { q: "100%_" })).toHaveLength(0);                       // % y _ se tratan como texto, no como comodines
    expect((await activityStats(d, o, 14)).length).toBe(4);
  });
  it("registrar nunca lanza, aunque la base falle; el texto largo se recorta", async () => {
    const d = await createPgliteDb(); const o = await ensureDefaultOrg(d);
    await expect(logActivity(d, "org-que-no-existe", { kind: "view", label: "x" })).resolves.toBeUndefined(); // viola la llave foránea: se traga el error
    await logActivity(d, o, { kind: "action", label: "z".repeat(500), ip: "9".repeat(200) });
    const [r] = await listActivity(d, o);
    expect(r.label.length).toBe(200); expect(r.ip!.length).toBe(64);
  });
});
