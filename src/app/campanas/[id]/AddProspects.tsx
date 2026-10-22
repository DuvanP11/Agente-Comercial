"use client";
import { useActionState, useMemo, useState } from "react";
import { addManualProspectAction, addProspectsAction, type ActionResult } from "../actions";

interface Option { id: string; name: string; city: string | null; category: string | null; hasPhone: boolean }

export function AddProspects({ campaignId, options }: { campaignId: string; options: Option[] }) {
  const [s, action, pending] = useActionState<ActionResult, FormData>(addProspectsAction.bind(null, campaignId), {});
  const [q, setQ] = useState("");
  const [onlyPhone, setOnlyPhone] = useState(false);
  const shown = useMemo(() => options.filter((o) => (!onlyPhone || o.hasPhone) && `${o.name} ${o.city} ${o.category}`.toLowerCase().includes(q.toLowerCase())), [options, q, onlyPhone]);
  const [m, manualAction, mPending] = useActionState<ActionResult, FormData>(addManualProspectAction.bind(null, campaignId), {});
  const manual = (
    <details className="card" open={options.length === 0}>
      <summary className="cursor-pointer font-semibold">Agregar un cliente a mano (para pruebas)</summary>
      <form action={manualAction} className="mt-3 space-y-3">
        <p className="text-sm text-muted">Crea un cliente con los datos que tú pongas y lo suma a esta campaña, para ver cómo queda el mensaje o el correo. Usa tu propio teléfono o correo si quieres recibirlo.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <div><label className="label" htmlFor="mn">Nombre del cliente *</label><input id="mn" name="name" className="input" maxLength={120} required /></div>
          <div><label className="label" htmlFor="mp">Teléfono / WhatsApp</label><input id="mp" name="phone" className="input" inputMode="tel" maxLength={30} placeholder="3001234567" /></div>
          <div><label className="label" htmlFor="me">Correo</label><input id="me" name="email" type="email" className="input" maxLength={120} placeholder="nombre@empresa.co" /></div>
          <div><label className="label" htmlFor="mc">Ciudad (opcional)</label><input id="mc" name="city" className="input" maxLength={80} /></div>
          <div><label className="label" htmlFor="mk">Categoría (opcional)</label><input id="mk" name="category" className="input" maxLength={80} /></div>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" disabled={mPending}>{mPending ? "Agregando…" : "Agregar cliente a la campaña"}</button>
          {m.error && <span role="alert" className="text-sm badge-bad">{m.error}</span>}
          {m.ok && <span role="status" className="text-sm badge-ok">{m.ok}</span>}
        </div>
      </form>
    </details>);
  if (options.length === 0) return <div className="space-y-3"><p className="card text-sm text-muted">No hay prospectos disponibles para sumar. Busca o importa más en “Buscar clientes” o “Importar prospectos”.</p>{manual}</div>;
  return (
    <div className="space-y-3">{manual}
    <form action={action} className="card space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1"><label className="label" htmlFor="aq">Filtrar</label><input id="aq" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, ciudad o categoría" /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyPhone} onChange={(e) => setOnlyPhone(e.target.checked)} /> Solo con teléfono</label>
      </div>
      <div className="max-h-64 overflow-y-auto rounded border border-border">
        {shown.map((o) => (
          <label key={o.id} className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-sm last:border-0">
            <input type="checkbox" name="prospect" value={o.id} /> <b>{o.name}</b>
            <span className="text-muted">{[o.category, o.city].filter(Boolean).join(" · ")}</span>
            {!o.hasPhone && <span className="badge badge-warn">sin teléfono</span>}
          </label>))}
        {shown.length === 0 && <p className="p-3 text-sm text-muted">Sin coincidencias.</p>}
      </div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Agregando…" : "Agregar a la campaña"}</button>
        <span className="text-xs text-muted">{shown.length} de {options.length} elegibles. Quedan fuera los duplicados sin resolver y los marcados “No contactar”.</span>
        {s.error && <span role="alert" className="text-sm badge-bad">{s.error}</span>}
        {s.ok && <span role="status" className="text-sm badge-ok">{s.ok}</span>}
      </div>
    </form></div>
  );
}
