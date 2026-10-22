import type { ReactNode } from "react";

/** Resumen en una o dos frases debajo de un gráfico o bloque. */
export function Insight({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md px-3 py-2 text-sm" style={{ background: "color-mix(in srgb, var(--color-primary) 10%, transparent)", borderLeft: "3px solid var(--color-primary)" }}>
      <b>En resumen: </b>{children}
    </p>
  );
}

/** Bloque de ayuda plegable. */
export function HelpPanel({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="card" open={open}>
      <summary className="cursor-pointer font-semibold">{title}</summary>
      <div className="mt-3 space-y-3 text-sm">{children}</div>
    </details>
  );
}
