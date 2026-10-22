"use client";
import { useState, useTransition } from "react";
import { assignOwnerAction } from "./owner-actions";

export function OwnerAssign({ prospectId, ownerId, people }: { prospectId: string; ownerId: string | null; people: { id: string; name: string }[] }) {
  const [to, setTo] = useState(ownerId ?? "");
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div><label className="label" htmlFor="own">Responsable</label>
        <select id="own" className="input" value={to} onChange={(e) => setTo(e.target.value)}><option value="">Sin asignar</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <button className="btn" disabled={pending || to === (ownerId ?? "")} onClick={() => start(async () => { try { setMsg(await assignOwnerAction(prospectId, to)); } catch { setMsg({ error: "No se pudo asignar." }); } })}>Asignar</button>
      {msg?.ok && <span role="status" className="badge-ok text-sm">{msg.ok}</span>}{msg?.error && <span role="alert" className="badge-bad text-sm">{msg.error}</span>}
    </div>
  );
}
