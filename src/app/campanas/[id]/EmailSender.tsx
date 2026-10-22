"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatSize, KIND_LABEL, type MediaKind } from "@/lib/campaign-media";
import { gmailSendBatchAction } from "../actions";

export interface Recipient { cpId: string; name: string; email: string }
export interface AttInfo { id: string; name: string; kind: MediaKind; size: number }

/** Envío por correo desde el Gmail de quien tiene sesión: uno a uno o masivo (en tandas con pausa), con adjuntos e imágenes. */
export function EmailSender({ campaignId, configured, connectedAs, recipients, attachments, sentToday, cap, subjectPreview, closed }: {
  campaignId: string; configured: boolean; connectedAs: string | null; recipients: Recipient[]; attachments: AttInfo[]; sentToday: number; cap: number; subjectPreview: string; closed: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set(recipients.map((r) => r.cpId)));
  const [atts, setAtts] = useState<Set<string>>(new Set());
  const [inline, setInline] = useState(false), [optOut, setOptOut] = useState(true), [again, setAgain] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<{ cpId: string; ok: boolean; error?: string; skipped?: boolean }[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const stop = useRef(false);
  const nameOf = (id: string) => recipients.find((r) => r.cpId === id)?.name ?? id;
  const toggle = <T,>(s: Set<T>, v: T, set: (n: Set<T>) => void) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); set(n); };
  const left = Math.max(0, cap - sentToday), chosen = recipients.filter((r) => sel.has(r.cpId));
  const size = attachments.filter((a) => atts.has(a.id)).reduce((s, a) => s + a.size, 0);

  const send = async () => {
    if (!chosen.length) return;
    if (!confirm(`Se enviarán ${chosen.length} correo(s) REALES desde ${connectedAs}. ¿Continuar?`)) return;
    setRunning(true); setLog([]); setNote(null); stop.current = false;
    const ids = chosen.map((r) => r.cpId), all: typeof log = [];
    for (let i = 0; i < ids.length && !stop.current; i += 5) {
      const r = await gmailSendBatchAction(campaignId, ids.slice(i, i + 5), { attachmentIds: [...atts], inlineImages: inline, optOut, allowRepeat: again });
      if (r.error) { setNote(r.error); break; }
      all.push(...r.results); setLog([...all]);
      if (r.results.some((x) => !x.ok && /tope diario|esperar|conectar|venció|revocada|no configurada/i.test(x.error ?? "") )) break;
    }
    setRunning(false);
    const ok = all.filter((x) => x.ok).length;
    setNote(stop.current ? `Detenido. Se enviaron ${ok} de ${ids.length}.` : `Terminó: ${ok} enviado(s) de ${ids.length}${all.length - ok ? `; ${all.length - ok} no se enviaron (ver el detalle)` : ""}.`);
    router.refresh();
  };

  return (
    <section className="card space-y-3" aria-label="Enviar correos con mi Gmail">
      <div><h2 className="font-semibold">Enviar correos con mi Gmail</h2>
        <p className="text-sm text-muted">Envía el mensaje <b>aprobado</b> de cada prospecto desde tu propio correo, de a uno o a varios a la vez, con las imágenes y archivos de la campaña. Cada envío cuenta como un intento de contacto.</p></div>
      {!configured ? (
        <p className="text-sm badge-warn" role="status">El envío por Gmail aún no está activado en el servidor: falta que un administrador cargue las credenciales (ver Integraciones → Gmail).</p>
      ) : !connectedAs ? (
        <div className="flex flex-wrap items-center gap-3"><a className="btn btn-primary" href={`/api/gmail/connect?volver=/campanas/${campaignId}`}>Conectar mi Gmail</a><span className="text-sm text-muted">Se abre Google para que autorices solo el permiso de <b>enviar</b> correos con tu cuenta. No leemos tu bandeja.</span></div>
      ) : closed ? <p className="text-sm text-muted">La campaña está cerrada.</p> : recipients.length === 0 ? (
        <p className="text-sm text-muted">Enviando desde <b>{connectedAs}</b>. No hay prospectos listos: necesitan <b>correo válido y mensaje aprobado</b> (y no estar bloqueados ni agotados).</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">Enviando desde <b>{connectedAs}</b> · hoy llevas <b>{sentToday}</b> de <b>{cap}</b> permitidos (quedan {left}). <span className="text-muted">Asunto: «{subjectPreview}»</span></p>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded border p-3" style={{ borderColor: "var(--color-border)" }}>
              <div className="mb-1 flex items-center justify-between"><b className="text-sm">Destinatarios ({chosen.length} de {recipients.length})</b>
                <button className="btn" disabled={running} onClick={() => setSel(sel.size === recipients.length ? new Set() : new Set(recipients.map((r) => r.cpId)))}>{sel.size === recipients.length ? "Quitar todos" : "Elegir todos"}</button></div>
              <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">{recipients.map((r) => <li key={r.cpId}><label className="flex items-center gap-2"><input type="checkbox" checked={sel.has(r.cpId)} disabled={running} onChange={() => toggle(sel, r.cpId, setSel)} /> <span className="font-semibold">{r.name}</span> <span className="text-xs text-muted">{r.email}</span></label></li>)}</ul>
            </div>
            <div className="rounded border p-3 text-sm" style={{ borderColor: "var(--color-border)" }}>
              <b>Material a enviar</b>
              {attachments.length === 0 ? <p className="text-xs text-muted">La campaña no tiene archivos. Súbelos en «Material de la campaña».</p> : (
                <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto">{attachments.map((a) => <li key={a.id}><label className="flex items-center gap-2"><input type="checkbox" checked={atts.has(a.id)} disabled={running} onChange={() => toggle(atts, a.id, setAtts)} /> {a.name} <span className="text-xs text-muted">{KIND_LABEL[a.kind]} · {formatSize(a.size)}</span></label></li>)}</ul>)}
              {size > 0 && <p className={`mt-1 text-xs ${size > 16 * 1048576 ? "badge-bad" : "text-muted"}`}>Pesa {formatSize(size)} por correo (máximo ~16 MB).</p>}
              <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={inline} disabled={running} onChange={(e) => setInline(e.target.checked)} /> Mostrar las imágenes dentro del correo (no como adjunto)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={optOut} disabled={running} onChange={(e) => setOptOut(e.target.checked)} /> Añadir al final cómo pedir no recibir más correos (recomendado)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={again} disabled={running} onChange={(e) => setAgain(e.target.checked)} /> Enviar aunque ya se le escribió en las últimas 24 h</label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" disabled={running || !chosen.length || chosen.length > left || size > 16 * 1048576} onClick={send}>{running ? "Enviando…" : `Enviar ${chosen.length} correo(s)`}</button>
            {running && <button className="btn" onClick={() => { stop.current = true; }}>Detener</button>}
            {chosen.length > left && <span className="badge-warn text-sm">Elegiste más de los que te quedan hoy ({left}).</span>}
            {running && <span className="text-sm text-muted" role="status">{log.filter((x) => x.ok).length} de {chosen.length} enviados (hay una pausa entre correos a propósito).</span>}
          </div>
          {chosen.length > 1 && <p className="text-xs text-muted">Los envíos masivos salen de a uno, con una pausa corta, desde tu cuenta: tu cuenta de Google puede limitar o bloquear envíos si parecen spam. Escribe solo a quienes tienen sentido para tu oferta.</p>}
        </div>)}
      <div role="status" aria-live="polite">
        {note && <p className="text-sm badge-ok">{note}</p>}
        {log.some((x) => !x.ok) && <ul className="mt-1 list-disc pl-5 text-sm">{log.filter((x) => !x.ok).map((x) => <li key={x.cpId} className={x.skipped ? "text-muted" : "badge-bad"}><b>{nameOf(x.cpId)}:</b> {x.error}</li>)}</ul>}
      </div>
    </section>
  );
}
