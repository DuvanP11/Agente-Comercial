import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { viewerOf } from "@/lib/services/scope";
import { normalizePhone } from "@/lib/dedup/normalize";
import { listCampaigns } from "@/lib/services/campaigns";
import { captarCandidates } from "@/lib/services/captar";
import { CaptarPicker } from "./CaptarPicker";

export const dynamic = "force-dynamic";

export default async function Captar() {
  const viewer = viewerOf(await requireUser());
  const db = await getDb();
  const org = await ensureDefaultOrg(db);
  const [cands, camps] = await Promise.all([captarCandidates(db, org, viewer), listCampaigns(db, org, viewer)]);
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Captar clientes</h1>
        <p className="text-sm text-muted">Elige a quién abordar, mira su plan de acercamiento y llévalos a una campaña. Salen primero los calificados y los de mayor prioridad; no aparecen los marcados “No contactar”, los duplicados sin resolver ni los que ya están en una campaña activa.</p>
      </header>
      <CaptarPicker
        candidates={cands.map(({ p, score }) => ({
          id: p.id, name: p.name, city: p.city, category: p.category, status: p.status, phone: p.phone, hasValidPhone: !!normalizePhone(p.phone),
          website: p.website, email: p.email, priority: score?.priority ?? null, coverage: score ? score.coverage : null,
        }))}
        campaigns={camps.filter((c) => c.status === "active").map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
