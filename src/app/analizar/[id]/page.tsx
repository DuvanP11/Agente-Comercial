import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import { evidenceFor, type StoredScore } from "@/lib/services/analysis";
import { CRITERION_LABELS } from "@/lib/scoring/score";
import { AssessmentForm } from "./AssessmentForm";

export const dynamic = "force-dynamic";

export default async function Analisis({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [p] = await db.select().from(prospects).where(eq(prospects.id, id));
  if (!p) notFound();
  const ev = await evidenceFor(db, id);
  const s = p.scoreJson as StoredScore | null;
  const blocked = p.status === "excluded_duplicate" || p.status === "needs_review";
  return (
    <div className="space-y-4">
      <header>
        <Link href="/analizar" className="text-sm underline">← Volver</Link>
        <h1 className="text-2xl font-bold">{p.name}</h1>
        <p className="text-sm text-muted">{p.category} · {p.city} · <Link className="underline" href={`/prospectos/${p.id}`}>ver ficha y evidencias</Link></p>
      </header>
      {blocked && <p role="alert" className="card badge-warn">Este prospecto tiene un duplicado sin resolver ({p.status}). Resuélvelo en su ficha antes de calificarlo.</p>}
      {s && (
        <section className="card text-sm" aria-label="Resultado">
          <p><b>Prioridad comercial: {s.priority ?? "información insuficiente"}</b> · cobertura {(s.coverage * 100).toFixed(0)} % · respaldo en evidencia {(s.evidenceBacked * 100).toFixed(0)} %</p>
          {s.unknownCriteria.length > 0 && <p className="text-muted">Criterios desconocidos (no cuentan): {s.unknownCriteria.map((k) => CRITERION_LABELS[k]).join(", ")}.</p>}
          <p className="text-xs text-muted">Valorado por {s.assessedBy} el {new Date(s.assessedAt).toLocaleString("es-CO")}. La prioridad no es una probabilidad de contratación; se necesita al menos 40 % de cobertura para mostrarla.</p>
        </section>
      )}
      <AssessmentForm prospectId={id} evidence={ev.map((e) => ({ id: e.id, field: e.field, observedValue: e.observedValue, sourceName: e.sourceName }))} current={s?.assessments ?? {}} status={p.status} />
    </div>
  );
}
