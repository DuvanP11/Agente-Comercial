"use client";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { mailtoLink, phoneLinks, safeWebUrl } from "@/lib/contact-links";
import { startCaptationAction, type CaptarState } from "./actions";

export interface Candidate {
  id: string; name: string; city: string | null; category: string | null; status: string;
  phone: string | null; hasValidPhone: boolean; website: string | null; email: string | null;
  priority: number | null; coverage: number | null;
}
export interface CampaignOption { id: string; name: string }

export function CaptarPicker({ candidates, campaigns }: { candidates: Candidate[]; campaigns: CampaignOption[] }) {
  const [s, action, pending] = useActionState<CaptarState, FormData>(startCaptationAction, {});
  const [q, setQ] = useState("");
  const [onlyPhone, setOnlyPhone] = useState(false);
  const [onlyQualified, setOnlyQualified] = useState(false);
  const [dest, setDest] = useState("new");
  const [newName, setNewName] = useState(`Captación ${new Date().toLocaleDateString("es-CO", { month: "long", year: "numeric" })}`);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const shown = useMemo(() => candidates.filter((c) =>
    (!onlyPhone || c.hasValidPhone) && (!onlyQualified || c.status === "qualified") && `${c.name} ${c.city} ${c.category}`.toLowerCase().includes(q.toLowerCase())), [candidates, q, onlyPhone, onlyQualified]);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (candidates.length === 0) return <p className="card text-sm text-muted">No hay prospectos listos para abordar. Busca o importa prospectos, o revisa que no estén todos en campañas activas.</p>;
  return (
    <form action={action} className="space-y-3">
      <div className="card flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1"><label className="label" htmlFor="cq">Filtrar</label><input id="cq" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, ciudad o rubro" /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyPhone} onChange={(e) => setOnlyPhone(e.target.checked)} /> Solo con teléfono válido</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyQualified} onChange={(e) => setOnlyQualified(e.target.checked)} /> Solo calificados</label>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th><span className="sr-only">Elegir</span></th><th>Prospecto</th><th>Calificación</th><th>Contacto</th><th>Plan</th></tr></thead>
          <tbody>{shown.map((c) => {
            const web = safeWebUrl(c.website), mail = mailtoLink(c.email), tels = phoneLinks(c.phone).filter((x) => x.href);
            return (
              <tr key={c.id}>
                <td><input type="checkbox" name="prospect" value={c.id} checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Elegir ${c.name}`} /></td>
                <td><b>{c.name}</b><div className="text-xs text-muted">{[c.category, c.city].filter(Boolean).join(" · ")}</div></td>
                <td>{c.status === "qualified" && <span className="badge badge-ok">Calificado</span>}{" "}
                  {c.priority !== null ? <span className="text-sm">Prioridad {c.priority}</span> : c.coverage === null ? <span className="text-sm text-muted">Sin valorar</span> : <span className="text-sm text-muted">Info. insuficiente</span>}</td>
                <td className="text-sm">
                  {tels.length ? tels.map((x, i) => <span key={i}>{i > 0 && " · "}<a className="underline" href={x.href!}>{x.text}</a></span>) : <span className="badge badge-warn">sin teléfono</span>}
                  {web && <> · <a className="underline" target="_blank" rel="noopener noreferrer" href={web}>web</a></>}
                  {mail && <> · <a className="underline" href={mail}>correo</a></>}
                </td>
                <td><Link className="btn" href={`/captar/${c.id}`}>Ver plan</Link></td>
              </tr>);
          })}</tbody>
        </table>
        {shown.length === 0 && <p className="p-3 text-sm text-muted">Sin coincidencias con esos filtros.</p>}
      </div>

      <div className="card grid gap-3 md:grid-cols-3">
        <div><label className="label" htmlFor="dest">Llevar a</label>
          <select id="dest" name="campaignId" className="input" value={dest} onChange={(e) => setDest(e.target.value)}>
            <option value="new">Campaña nueva</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        {dest === "new" && <div className="md:col-span-2"><label className="label" htmlFor="nn">Nombre de la campaña nueva</label><input id="nn" name="newName" className="input" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>}
        <div className="md:col-span-3 flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={pending || picked.size === 0}>{pending ? "Creando…" : `Iniciar captación con ${picked.size} prospecto${picked.size === 1 ? "" : "s"}`}</button>
          <span className="text-xs text-muted">Te lleva a la campaña para generar, revisar y aprobar el mensaje de cada uno. No se envía nada.</span>
          {s.error && <span role="alert" className="text-sm badge-bad">{s.error}</span>}
        </div>
      </div>
    </form>
  );
}
