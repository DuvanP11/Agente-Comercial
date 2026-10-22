"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignUnownedAction } from "./[id]/owner-actions";

/** Pasa los prospectos que nadie tiene asignado a una persona (los de antes de separar el trabajo por usuario). */
export function AssignUnowned({ count, people, meId }: { count: number; people: { id: string; name: string }[]; meId: string }) {
  const router = useRouter();
  const [to, setTo] = useState(meId);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card flex flex-wrap items-end gap-3 text-sm" role="region" aria-label="Prospectos sin responsable">
      <div className="min-w-64 flex-1"><b>{count} prospecto(s) sin responsable.</b> Los Hunter no los ven hasta que se los asignes. Elige a quién pasárselos:</div>
      <select aria-label="Persona" className="input !w-auto" value={to} onChange={(e) => setTo(e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === meId ? " (yo)" : ""}</option>)}</select>
      <button className="btn btn-primary" disabled={pending} onClick={() => { if (confirm(`¿Asignar ${count} prospecto(s) a la persona elegida?`)) start(async () => { try { const r = await assignUnownedAction(to); setMsg(r.error ?? r.ok ?? null); router.refresh(); } catch { setMsg("No se pudo asignar."); } }); }}>Asignar</button>
      {msg && <span role="status" className="badge-ok">{msg}</span>}
    </div>
  );
}
