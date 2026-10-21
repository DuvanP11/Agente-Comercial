import { describe, expect, it, vi } from "vitest";
import { describeActionFailure, guardAction } from "@/lib/safe-action";

describe("mensajes cuando una acción del servidor falla en el navegador", () => {
  it("respuesta inesperada o conexión cortada → habla del tiempo, no de un fallo técnico", () => {
    for (const m of ["An unexpected response was received from the server.", "Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed", "The operation was aborted due to timeout"]) {
      expect(describeActionFailure(new Error(m)), m).toMatch(/tardó demasiado o se cortó la conexión.*60 s/);
    }
  });
  it("pestaña vieja → pide recargar", () => {
    expect(describeActionFailure(new Error('Failed to find Server Action "abc"'))).toMatch(/se actualizó.*Recarga la página/);
  });
  it("cualquier otra cosa → mensaje genérico sin detalles internos", () => {
    const m = describeActionFailure(new Error("postgres://u:p@h/db explotó"));
    expect(m).toMatch(/No se pudo completar la acción/); expect(m).not.toMatch(/postgres/);
    expect(describeActionFailure(undefined)).toMatch(/No se pudo completar/);
  });
});

describe("guardAction", () => {
  it("deja pasar el resultado normal intacto, incluidos los errores que la acción devuelve", async () => {
    const ok = guardAction(async (a: number) => ({ status: "ok", a }), (message) => ({ status: "error", a: -1, message } as never));
    expect(await ok(5)).toEqual({ status: "ok", a: 5 });
    const devuelveError = guardAction(async () => ({ status: "error", message: "criterios inválidos" }), (message) => ({ status: "error", message }));
    expect(await devuelveError()).toEqual({ status: "error", message: "criterios inválidos" });
  });
  it("si la acción lanza, devuelve un estado de error en vez de propagar la excepción", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const g = guardAction(async () => { throw new Error("An unexpected response was received from the server."); }, (message) => ({ status: "error" as const, message }));
    const r = await g();
    expect(r.status).toBe("error"); expect(r.message).toMatch(/tardó demasiado/);
    vi.restoreAllMocks();
  });
  it("pasa todos los argumentos a la acción", async () => {
    const spy = vi.fn(async (_p: string, _fd: string) => "listo");
    expect(await guardAction(spy, () => "error")("a", "b")).toBe("listo");
    expect(spy).toHaveBeenCalledWith("a", "b");
  });
});
