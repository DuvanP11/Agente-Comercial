"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { isPathHidden, type NavItem } from "@/lib/nav";

const STATUS_LABEL = { ready: "", partial: "Parcial", pending: "Pendiente" } as const;
const STORAGE = "pci_nav_collapsed";
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

/** Menú lateral agrupado, con buscador, botón para expandir/contraer, y el usuario al pie. En pantallas chicas se abre y cierra con un botón. */
export function AppShell({ items, hidden, canManage, brand, user, logout, home, children }: {
  items: NavItem[]; hidden: string[]; canManage: boolean; brand: ReactNode; user: { name: string; email: string; role: string }; logout: () => void | Promise<void>; home: string; children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [q, setQ] = useState("");
  const search = useRef<HTMLInputElement>(null);
  // Etiqueta flotante del menú contraído: se dibuja fuera del menú para que no la recorte.
  const [tip, setTip] = useState<{ label: string; icon: string; note: string; top: number } | null>(null);
  const showTip = (e: { currentTarget: Element }, label: string, icon: string, note = "") => { const r = e.currentTarget.getBoundingClientRect(); setTip({ label, icon, note, top: r.top + r.height / 2 }); };

  useEffect(() => { try { setCollapsed(localStorage.getItem(STORAGE) === "1"); } catch { /* sin almacenamiento: queda expandido */ } }, []);
  useEffect(() => setMobileOpen(false), [path]);
  // Auditoría: cada pantalla que se abre y cada clic en una opción del menú se reporta al servidor (sin datos de lo que se ve).
  const lastView = useRef("");
  const report = (kind: "view" | "click", p: string, label?: string) => {
    try { void fetch("/api/audit/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, path: p, label }), keepalive: true }); } catch { /* el registro nunca estorba */ }
  };
  useEffect(() => { if (path && path !== lastView.current) { lastView.current = path; report("view", path); } }, [path]);
  const toggle = () => setCollapsed((c) => { const n = !c; try { localStorage.setItem(STORAGE, n ? "1" : "0"); } catch { /* opcional */ } return n; });

  // «/» enfoca el buscador (si no se está escribiendo en otro campo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && t && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); setCollapsed(false); setTimeout(() => search.current?.focus(), 0); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown = useMemo(() => { const f = fold(q.trim()); return f ? items.filter((i) => fold(i.label).includes(f)) : items; }, [items, q]);
  const groups = useMemo(() => { const m = new Map<string, NavItem[]>(); for (const i of shown) m.set(i.group ?? "Otros", [...(m.get(i.group ?? "Otros") ?? []), i]); return [...m.entries()]; }, [shown]);
  const wide = !collapsed;
  const isActive = (n: NavItem) => path === n.href || (n.href !== "/" && path.startsWith(n.href + "/"));

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside aria-label="Menú lateral" className="flex shrink-0 flex-col border-b border-border bg-surface md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r"
        style={{ width: undefined, transition: "width .18s ease" }} data-collapsed={collapsed ? "1" : "0"}>
        <style>{`@media (min-width: 768px){ aside[data-collapsed="1"]{width:68px} aside[data-collapsed="0"]{width:264px} }`}</style>
        <div className={`flex items-center gap-2 px-3 pt-4 ${wide ? "justify-between" : "flex-col"}`}>
          {wide ? <div className="min-w-0 px-2">{brand}</div> : <Link href={home} aria-label="Inicio" onMouseEnter={(e) => showTip(e, "Inicio", "home")} onMouseLeave={() => setTip(null)} className="grid h-9 w-9 place-items-center rounded-[var(--radius)] font-bold" style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}>P</Link>}
          <button type="button" className="hidden rounded-[var(--radius)] p-2 text-muted hover:bg-surface-2 md:block" onClick={toggle} aria-label={wide ? "Contraer menú" : "Expandir menú"} aria-expanded={wide} title={wide ? "Contraer menú" : "Expandir menú"}><Icon name="panel" size={18} /></button>
          <button type="button" className="rounded-[var(--radius)] p-2 text-muted hover:bg-surface-2 md:hidden" onClick={() => setMobileOpen((o) => !o)} aria-label="Abrir o cerrar el menú" aria-expanded={mobileOpen}><Icon name="menu" size={20} /></button>
        </div>

        <div className={`${mobileOpen ? "flex" : "hidden"} min-h-0 flex-1 flex-col md:flex`}>
          <div className="px-3 pt-3">
            <Link href={home} aria-label="Inicio" aria-current={path === home ? "page" : undefined} onMouseEnter={(e) => !wide && showTip(e, "Inicio", "home")} onMouseLeave={() => setTip(null)} onFocus={(e) => !wide && showTip(e, "Inicio", "home")} onBlur={() => setTip(null)}
              className={`mb-2 flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-sm font-semibold ${wide ? "" : "justify-center px-0"} ${path === home ? "" : "hover:bg-surface-2"}`}
              style={path === home ? { background: "var(--color-primary)", color: "var(--color-on-primary)" } : undefined}>
              <Icon name="home" size={19} />{wide && <span>Inicio</span>}
            </Link>
            {wide ? (
              <label className="flex items-center gap-2 rounded-[var(--radius)] border border-border px-3 py-2 text-sm text-muted focus-within:outline focus-within:outline-2" style={{ outlineColor: "var(--color-primary)" }}>
                <Icon name="search" size={16} />
                <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en el menú" aria-label="Buscar en el menú"
                  onKeyDown={(e) => { if (e.key === "Enter" && shown[0]) { router.push(shown[0].href); setQ(""); } if (e.key === "Escape") { setQ(""); (e.target as HTMLElement).blur(); } }}
                  className="min-w-0 flex-1 bg-transparent text-[var(--color-text)] outline-none" />
                <kbd className="rounded border border-border px-1.5 text-[11px]">/</kbd>
              </label>
            ) : (
              <button type="button" className="mx-auto grid h-10 w-10 place-items-center rounded-[var(--radius)] text-muted hover:bg-surface-2" onClick={() => { setCollapsed(false); setTimeout(() => search.current?.focus(), 50); }} aria-label="Buscar en el menú" onMouseEnter={(e) => showTip(e, "Buscar en el menú", "search")} onMouseLeave={() => setTip(null)}><Icon name="search" size={18} /></button>
            )}
          </div>

          <nav aria-label="Principal" className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {groups.length === 0 && <p className="px-2 text-sm text-muted">Sin resultados.</p>}
            {groups.map(([g, list], gi) => (
              <div key={g} className={gi > 0 ? "mt-3 border-t border-border pt-3" : ""}>
                {wide && <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{g}</div>}
                <ul className="space-y-0.5">
                  {list.map((n) => {
                    const active = isActive(n);
                    return (
                      <li key={n.slug}>
                        <Link href={n.href} aria-current={active ? "page" : undefined} onClick={() => report("click", n.href, n.label)}
                          onMouseEnter={(e) => !wide && showTip(e, n.label, n.icon ?? "dashboard", STATUS_LABEL[n.status])} onMouseLeave={() => setTip(null)} onFocus={(e) => !wide && showTip(e, n.label, n.icon ?? "dashboard", STATUS_LABEL[n.status])} onBlur={() => setTip(null)}
                          className={`flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-sm ${wide ? "" : "justify-center px-0"} ${active ? "" : "hover:bg-surface-2"}`}
                          style={active ? { background: "var(--color-primary)", color: "var(--color-on-primary)" } : undefined}>
                          <Icon name={n.icon ?? "dashboard"} size={19} />
                          {wide && <span className="min-w-0 flex-1 truncate">{n.label}</span>}
                          {wide && STATUS_LABEL[n.status] && <span className="text-[10px] opacity-70">{STATUS_LABEL[n.status]}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="border-t border-border p-3">
            <details className="relative">
              <summary className={`flex cursor-pointer list-none items-center gap-3 rounded-[var(--radius)] px-2 py-2 hover:bg-surface-2 ${wide ? "" : "justify-center"}`} onMouseEnter={(e) => !wide && showTip(e, user.name, "user", user.email)} onMouseLeave={() => setTip(null)}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold" style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}>{initials(user.name)}</span>
                {wide && <span className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-semibold">{user.name}</span><span className="block truncate text-[11px] text-muted">{user.role === "admin" ? "Administrador" : user.email}</span></span>}
                {wide && <Icon name="dots" size={18} />}
              </summary>
              <div className="absolute bottom-full left-0 z-20 mb-2 w-56 rounded-[var(--radius)] border border-border bg-surface p-1 shadow-lg">
                <div className="px-3 py-2 text-xs text-muted">{user.email}</div>
                <Link href="/cuenta" className="flex items-center gap-2 rounded-[var(--radius)] px-3 py-2 text-sm hover:bg-surface-2"><Icon name="user" size={16} /> Mi cuenta</Link>
                <form action={logout}><button className="flex w-full items-center gap-2 rounded-[var(--radius)] px-3 py-2 text-left text-sm hover:bg-surface-2"><Icon name="logout" size={16} /> Cerrar sesión</button></form>
              </div>
            </details>
          </div>
        </div>
      </aside>
      {!wide && tip && (
        <div role="tooltip" className="pointer-events-none fixed z-50 hidden items-center gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-sm shadow-lg md:flex"
          style={{ left: 76, top: tip.top, transform: "translateY(-50%)", color: "var(--color-text)" }}>
          <span style={{ color: "var(--color-primary)" }}><Icon name={tip.icon} size={18} /></span>
          <span className="font-semibold">{tip.label}</span>{tip.note && <span className="text-xs text-muted">{tip.note}</span>}
        </div>
      )}
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {isPathHidden(hidden, path) ? (
          <div className="card max-w-xl space-y-2" role="status">
            <h1 className="text-xl font-bold">Este módulo está desactivado</h1>
            <p className="text-sm text-muted">Un administrador lo apagó y por eso no aparece en el menú.{canManage ? " Puedes volver a encenderlo en Configuración → Módulos del menú." : " Si lo necesitas, pídele a un administrador que lo encienda."}</p>
            <div className="flex gap-2"><Link className="btn btn-primary" href={home}>Ir al inicio</Link>{canManage && <Link className="btn" href="/configuracion">Ir a Configuración</Link>}</div>
          </div>
        ) : children}
      </main>
    </div>
  );
}
