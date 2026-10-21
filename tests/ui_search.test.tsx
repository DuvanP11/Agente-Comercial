// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// La acción de servidor se sustituye por una función: lo que se prueba es la PANTALLA, no la base de datos.
const state = vi.hoisted(() => ({ next: null as unknown, fail: null as Error | null }));
vi.mock("@/app/buscar/actions", () => ({
  runSearch: vi.fn(async () => { if (state.fail) throw state.fail; return state.next; }),
  interpretAction: vi.fn(async () => ({ ok: true, warnings: [], output: { city: null, zones: [], categories: ["ropa"], maxResults: null, excludeTerms: [], notes: null, suggestions: ["zapatería"] } })),
  analyzeResultsAction: vi.fn(async (ids: string[]) => ({
    readings: ids.map((id) => ({ prospectId: id, state: "analyzed", priority: 60, coverage: 0.5, unknownCount: 3, headline: "Tienda con local propio.", warnings: [] })),
    analyzed: ids.length, cached: 0, pending: 0,
  })),
}));

import { SearchForm } from "@/app/buscar/SearchForm";

const out = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ prospectId: id, name, category: "x", address: "Calle 1", phone: null, website: null, email: null, sourceUrl: null, status: "new", ...extra });
const A = { status: "ok", message: "3 resultados de OpenStreetMap: 3 nuevos guardados.", errors: ["aviso parcial"], searchId: "id-1",
  outcomes: [out("a1", "Ferretería Uno", { phone: "+57 601 5471740;+57 601 5471744", website: "https://uno.co" }), out("a2", "Ferretería Dos"), out("a3", "Ferretería Tres", { email: "x@y.co", status: "needs_review", matchedWith: { type: "prospect", id: "z", name: "Otra", address: null, phone: null }, reasons: [{ field: "name" }] })] };
const B = { status: "ok", message: "2 resultados de OpenStreetMap: 2 nuevos guardados.", errors: [], searchId: "id-2",
  outcomes: [out("b1", "Boutique Uno", { phone: "3105550000" }), out("b2", "Boutique Dos", { status: "already_stored", message: "Ya estaba guardado." })] };

const sources = [{ id: "openstreetmap", label: "OpenStreetMap (gratis)", ready: true }];
let errors: unknown[] = [];

beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...a) => { errors.push(a); });
  vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const search = async (user: ReturnType<typeof userEvent.setup>, category: string) => {
  const cat = screen.getByLabelText(/Categorías/); await user.clear(cat); await user.type(cat, category);
  await user.click(screen.getByRole("button", { name: /Buscar en OpenStreetMap/ }));
};

describe("el servidor corta la búsqueda (límite de tiempo): la pantalla NO se cae", () => {
  it("una respuesta inesperada se muestra como mensaje y el formulario sigue usable", async () => {
    const user = userEvent.setup();
    render(<SearchForm sources={sources} aiReady />);
    state.next = A; await search(user, "ferretería"); await screen.findByText("Ferretería Uno");
    state.fail = new Error("An unexpected response was received from the server.");
    await search(user, "boutique");
    expect(await screen.findByText(/tardó demasiado o se cortó la conexión/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Buscar en OpenStreetMap/ })).toBeTruthy(); // el formulario sigue ahí
    state.fail = null; state.next = B; await search(user, "boutique");
    expect(await screen.findByText("Boutique Uno")).toBeTruthy(); // y se puede volver a buscar
  });
  it("una pestaña de una versión anterior pide recargar", async () => {
    const user = userEvent.setup();
    render(<SearchForm sources={sources} aiReady />);
    state.fail = new Error('Failed to find Server Action "abc123"');
    await search(user, "ferretería");
    expect(await screen.findByText(/Recarga la página/)).toBeTruthy();
    state.fail = null;
  });
});

describe("pantalla Buscar clientes: buscar varias veces seguidas (caso real: «la página se cae»)", () => {
  it("segunda búsqueda de OTRA categoría después de tener resultados", async () => {
    const user = userEvent.setup();
    render(<SearchForm sources={sources} aiReady />);
    state.next = A; await search(user, "ferretería");
    expect(await screen.findByText("Ferretería Uno")).toBeTruthy();
    state.next = B; await search(user, "boutique");
    expect(await screen.findByText("Boutique Uno")).toBeTruthy();
    expect(screen.queryByText("Ferretería Uno")).toBeNull();
    expect(errors, JSON.stringify(errors.map((e) => String((e as unknown[])[0]).slice(0, 300)))).toEqual([]);
  });

  it("con lectura de la IA hecha y filtro activo, y luego otra búsqueda", async () => {
    const user = userEvent.setup();
    render(<SearchForm sources={sources} aiReady />);
    state.next = A; await search(user, "ferretería");
    await screen.findByText("Ferretería Uno");
    await user.click(screen.getByRole("button", { name: /Analizar resultados con IA/ }));
    expect(await screen.findByText(/Lectura de la IA/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Con teléfono/ }));
    state.next = B; await search(user, "boutique");
    expect(await screen.findByText("Boutique Uno")).toBeTruthy();
    expect(errors, JSON.stringify(errors.map((e) => String((e as unknown[])[0]).slice(0, 300)))).toEqual([]);
  });

  it("tres búsquedas seguidas alternando", async () => {
    const user = userEvent.setup();
    render(<SearchForm sources={sources} aiReady />);
    for (const [st, cat, name] of [[A, "ferretería", "Ferretería Uno"], [B, "boutique", "Boutique Uno"], [A, "ferretería", "Ferretería Uno"]] as const) {
      state.next = st; await search(user, cat); expect(await screen.findByText(name)).toBeTruthy();
    }
    expect(errors).toEqual([]);
  });

  it("los números dobles se muestran como dos enlaces", async () => {
    const user = userEvent.setup();
    render(<SearchForm sources={sources} aiReady />);
    state.next = A; await search(user, "ferretería");
    const row = (await screen.findByText("Ferretería Uno")).closest("tr")!;
    expect(within(row).getAllByRole("link").filter((l) => (l as HTMLAnchorElement).href.startsWith("tel:"))).toHaveLength(2);
  });

  it("el filtro de contacto muestra solo lo que tiene contacto", async () => {
    const user = userEvent.setup();
    render(<SearchForm sources={sources} aiReady />);
    state.next = A; await search(user, "ferretería");
    await screen.findByText("Ferretería Uno");
    await user.click(screen.getByRole("button", { name: /Con algún contacto/ }));
    expect(screen.queryByText("Ferretería Dos")).toBeNull();
    expect(screen.getByText("Ferretería Uno")).toBeTruthy(); expect(screen.getByText("Ferretería Tres")).toBeTruthy();
  });

  it("interpretar con IA no borra la zona escrita a mano", async () => {
    const user = userEvent.setup();
    render(<SearchForm sources={sources} aiReady />);
    await user.type(screen.getByLabelText(/Localidades/), "Chapinero");
    await user.type(screen.getByLabelText(/Descripción/), "Ropa");
    await user.click(screen.getByRole("button", { name: /Interpretar con IA/ }));
    expect(await screen.findByText(/Entendí:/)).toBeTruthy();
    expect((screen.getByLabelText(/Localidades/) as HTMLInputElement).value).toBe("Chapinero");
    expect((screen.getByLabelText(/Categorías/) as HTMLInputElement).value).toBe("ropa");
  });
});


describe("búsqueda guardada (restaurada)", () => {
  const restored = { searchId: "id-old", createdAt: "2026-10-21T15:30:00.000Z", connector: "openstreetmap", brief: "", criteria: { city: "Bogotá", zones: ["Paloquemao"], categories: ["ferretería"], maxResults: 20, excludeTerms: [] },
    snapshot: { message: "2 resultados de OpenStreetMap: 1 nuevos guardados.", errors: ["aviso viejo por rubro"], notes: [], items: [out("o1", "Ferretería Vieja")] } };

  it("avisa que es una foto de otro momento y con qué fecha", async () => {
    render(<SearchForm sources={sources} aiReady restored={restored as never} />);
    expect(screen.getByText(/búsqueda guardada/)).toBeTruthy();
    expect(screen.getByText(/no cambian/)).toBeTruthy();
    expect(screen.getByText("Ferretería Vieja")).toBeTruthy();
    expect(screen.getByText(/21\/10\/2026, 10:30/)).toBeTruthy(); // 15:30 UTC = 10:30 en Colombia
  });
  it("al buscar de nuevo el aviso desaparece y se ven los resultados nuevos", async () => {
    const user = userEvent.setup();
    render(<SearchForm sources={sources} aiReady restored={restored as never} />);
    state.next = B; await search(user, "boutique");
    expect(await screen.findByText("Boutique Uno")).toBeTruthy();
    expect(screen.queryByText(/búsqueda guardada/)).toBeNull();
    expect(screen.queryByText("Ferretería Vieja")).toBeNull();
  });
  it("una búsqueda normal (no restaurada) no muestra el aviso", async () => {
    const user = userEvent.setup();
    render(<SearchForm sources={sources} aiReady />);
    state.next = A; await search(user, "ferretería");
    await screen.findByText("Ferretería Uno");
    expect(screen.queryByText(/búsqueda guardada/)).toBeNull();
  });
});
