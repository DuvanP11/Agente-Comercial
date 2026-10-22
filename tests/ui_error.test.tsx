// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ErrorScreen from "@/app/error";
import { explainError, shortDetail } from "@/lib/error-info";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("explicar errores en llano", () => {
  it("reconoce el caso de la pestaña vieja tras un despliegue", () => {
    for (const m of ['Failed to find Server Action "abc123". This request might be from an older or newer deployment.', "ChunkLoadError: Loading chunk 412 failed.", "Failed to fetch dynamically imported module: /_next/static/x.js"]) {
      const i = explainError(m);
      expect(i.likelyStale, m).toBe(true); expect(i.title).toBe("La aplicación se actualizó"); expect(i.hint).toMatch(/Recarga la página/);
    }
  });
  it("un error cualquiera da un mensaje genérico y no culpa a la actualización", () => {
    const i = explainError("Cannot read properties of undefined (reading 'x')");
    expect(i.likelyStale).toBe(false); expect(i.title).toMatch(/Algo salió mal/);
  });
  it("el detalle se recorta y lleva la referencia", () => {
    expect(shortDetail("x".repeat(1000), "123", false)).toHaveLength(400 + " [ref: 123]".length);
    expect(shortDetail("select * from users where password = 'x'", "abc", true)).toBe("Referencia: abc"); // en producción no se muestra el mensaje técnico
    expect(shortDetail("secreto", undefined, true)).toBe("Sin referencia disponible.");
    expect(shortDetail(undefined, undefined, false)).toBe("(sin mensaje)");
  });
});

describe("pantalla de recuperación", () => {
  it("muestra título, botones y el detalle técnico", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorScreen error={Object.assign(new Error("boom raro"), { digest: "d1" })} reset={() => {}} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Algo salió mal/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Recargar la página/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Reintentar/ })).toBeTruthy();
    expect(screen.getByText(/boom raro \[ref: d1\]/)).toBeTruthy();
  });
  it("«Reintentar» llama a reset", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    render(<ErrorScreen error={new Error("x")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /Reintentar/ }));
    expect(reset).toHaveBeenCalledOnce();
  });
  it("con pestaña vieja se ofrece recargar, no reintentar", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorScreen error={new Error('Failed to find Server Action "z"')} reset={() => {}} />);
    expect(screen.getByText("La aplicación se actualizó")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Reintentar/ })).toBeNull();
  });
  it("NO escribe el error en la consola del navegador (nadie debe leer detalles internos desde ahí)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorScreen error={Object.assign(new Error("select * from usuarios"), { digest: "ref123" })} reset={() => {}} />);
    expect(spy).not.toHaveBeenCalled();
  });
});
