import { notFound } from "next/navigation";
import { NAV } from "@/lib/nav";

export default async function Pending({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = NAV.find((n) => n.slug === slug && n.status !== "ready");
  if (!item) notFound();
  return (
    <div className="max-w-xl space-y-3">
      <h1 className="text-2xl font-bold">{item.label}</h1>
      <p className="card"><span className="badge badge-warn">Pendiente</span>{" "}
        Este módulo todavía no está implementado (fase {item.phase} de la hoja de ruta). {item.note}</p>
      <p className="text-sm text-muted">Ver <code>docs/ROADMAP.md</code>.</p>
    </div>
  );
}
