"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { CP_STATUSES, CP_STATUS_KEYS } from "@/lib/campaigns";
import { phoneLinks } from "@/lib/contact-links";
import { WhatsAppPreview } from "@/components/WhatsAppPreview";
import { attUrl, copyImage, type Att } from "./AttachmentsPanel";
import {
  aiDraftAction, approveAction, doNotContactAction, draftAction, followUpAction, emailAction, generateAction, gmailSendOneAction, statusAction, whatsappAction, type ActionResult,
} from "../actions";

export interface RowProps {
  campaignId: string; cpId: string; closed: boolean;
  p: { id: string; name: string; phone: string | null; email?: string | null; city: string | null; doNotContact: boolean };
  status: string; followUpDate: string; notes: string; followUp: string;
  message: { body: string; status: string } | null; opens: number; aiReady?: boolean; attachments?: Att[]; gmailConnected?: boolean; suggested?: string;
}
const FU: Record<string, [string, string]> = { overdue: ["Seguimiento vencido", "badge-bad"], today: ["Seguimiento hoy", "badge-warn"], upcoming: ["Seguimiento próximo", ""] };

export function ProspectRow(props: RowProps) {
  const { campaignId, cpId, p } = props;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(props.status);
  const [date, setDate] = useState(props.followUpDate);
  const [notes, setNotes] = useState(props.notes);
  const [body, setBody] = useState(props.message?.body ?? props.suggested ?? "");
  const [msgStatus, setMsgStatus] = useState(props.message?.status ?? "none");
  const [revision, setRevision] = useState("");
  const [withFiles, setWithFiles] = useState(false);
  const [res, setRes] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const locked = props.closed || p.doNotContact;
  const run = (fn: () => Promise<ActionResult>, after?: (r: ActionResult) => void) => start(async () => { const r = await fn(); setRes(r); after?.(r); });

  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link className="font-semibold underline" href={`/prospectos/${p.id}`}>{p.name}</Link>
        <span className="text-sm text-muted">{p.city}</span>
        {p.phone ? phoneLinks(p.phone).map((x, i) => x.href ? <a key={i} className="text-sm underline" href={x.href}>{x.text}</a> : <span key={i} className="text-sm">{x.text}</span>) : <span className="text-sm badge-warn">Sin teléfono (complétalo en su ficha)</span>}
        {p.doNotContact && <span className="badge badge-bad">NO CONTACTAR</span>}
        {FU[props.followUp] && <span className={`badge ${FU[props.followUp][1]}`}>{FU[props.followUp][0]}</span>}
        {props.opens > 0 && <span className="badge">WhatsApp abierto {props.opens}×</span>}
        <button className="btn ml-auto" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Cerrar" : "Gestionar"}</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="label !mb-0" htmlFor={`st-${cpId}`}>Estado</label>
        <select id={`st-${cpId}`} className="input !w-auto" value={status} disabled={props.closed || pending}
          onChange={(e) => { const v = e.target.value; setStatus(v); run(() => statusAction(campaignId, cpId, v), (r) => { if (r.error) setStatus(props.status); }); }}>
          {CP_STATUS_KEYS.map((k) => <option key={k} value={k}>{CP_STATUSES[k]}</option>)}
        </select>
        {pending && <span className="text-xs text-muted">Guardando…</span>}
      </div>

      {open && (
        <div className="space-y-4 border-t border-border pt-3">
          <div>
            <label className="label" htmlFor={`msg-${cpId}`}>Mensaje de WhatsApp {msgStatus === "approved" ? <span className="badge badge-ok ml-1">Aprobado</span> : msgStatus === "draft" ? <span className="badge badge-warn ml-1">Borrador sin aprobar</span> : null}</label>
            <textarea id={`msg-${cpId}`} rows={5} className="input" value={body} disabled={locked}
              onChange={(e) => { setBody(e.target.value); if (msgStatus === "approved") setMsgStatus("draft"); }} />
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn" disabled={locked || pending || !props.aiReady} title={props.aiReady ? "Redacta un borrador con IA a partir de los datos de la campaña" : "IA no configurada (ver Agentes y skills)"}
                onClick={() => run(() => aiDraftAction(campaignId, cpId, revision), (r) => { const t = (r as ActionResult & { text?: string }).text; if (t) { setBody(t); setMsgStatus("draft"); } })}>Redactar con IA</button>
              <button className="btn" disabled={locked || pending} onClick={() => run(() => generateAction(campaignId, cpId), (r) => { const t = (r as ActionResult & { text?: string }).text; if (t !== undefined) { setBody(t); setMsgStatus("draft"); } })}>Generar desde la plantilla</button>
              <button className="btn" disabled={locked || pending || !body.trim()} onClick={() => run(() => draftAction(campaignId, cpId, body), (r) => { if (!r.error) setMsgStatus("draft"); })}>Guardar borrador</button>
              <button className="btn" disabled={locked || pending || msgStatus !== "draft"} onClick={() => run(() => approveAction(campaignId, cpId), (r) => { if (!r.error) setMsgStatus("approved"); })}>Aprobar mensaje</button>
              <button className="btn btn-primary" disabled={locked || pending || msgStatus !== "approved" || !p.phone}
                onClick={() => run(() => whatsappAction(campaignId, cpId, false), (r) => {
                  if (!r.url) return;
                  // Con emojis: el enlace no los transporta bien, así que se abre el chat vacío y el mensaje completo queda copiado para pegarlo.
                  if (/\p{Extended_Pictographic}/u.test(body) && navigator.clipboard) {
                    void navigator.clipboard.writeText(body).then(() => { setRes({ ok: "Mensaje copiado con sus emojis: en el chat de WhatsApp pégalo con Cmd+V (Ctrl+V en Windows) y envía." }); window.open(r.url!.split("?")[0], "_blank", "noopener,noreferrer"); }, () => window.open(r.url, "_blank", "noopener,noreferrer"));
                  } else window.open(r.url, "_blank", "noopener,noreferrer");
                })}>Abrir WhatsApp</button>
              <button className="btn" disabled={!body.trim()} title="Copia el mensaje completo, con emojis, para pegarlo en el chat" onClick={() => { void navigator.clipboard?.writeText(body).then(() => setRes({ ok: "Mensaje copiado: pégalo en el chat de WhatsApp." }), () => setRes({ error: "No se pudo copiar; selecciona el texto y cópialo a mano." })); }}>Copiar mensaje</button>
              <button className="btn" disabled={locked || pending || msgStatus !== "approved" || !p.email} title={p.email ? "Abre tu programa de correo con el mensaje ya escrito" : "El prospecto no tiene correo: complétalo en su ficha"}
                onClick={() => run(() => emailAction(campaignId, cpId, false), (r) => { if (r.url) window.location.href = r.url; })}>Abrir correo</button>
              {props.gmailConnected && (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <button className="btn btn-primary" disabled={locked || pending || msgStatus !== "approved" || !p.email} title="Envía este mensaje desde tu Gmail, sin salir de la plataforma"
                    onClick={() => { if (confirm(`Se enviará un correo REAL a ${p.email} desde tu Gmail. ¿Continuar?`)) run(async () => { const r = await gmailSendOneAction(campaignId, cpId, { attachmentIds: withFiles ? (props.attachments ?? []).map((a) => a.id) : [], inlineImages: false, optOut: true, allowRepeat: false }); return r.ok ? { ok: "Correo enviado desde tu Gmail." } : { error: r.error }; }); }}>Enviar con mi Gmail</button>
                  {(props.attachments?.length ?? 0) > 0 && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} /> con el material ({props.attachments!.length})</label>}
                </span>)}
            </div>
            {(props.attachments?.length ?? 0) > 0 && (
              <div className="mt-2 space-y-1 rounded-[var(--radius)] border p-2 text-sm" style={{ borderColor: "var(--color-border)" }}>
                <b>Material para adjuntar en el chat</b> <span className="text-xs text-muted">(WhatsApp no deja adjuntarlo solo: cópialo o descárgalo y pégalo después de abrir el chat)</span>
                <div className="flex flex-wrap gap-2">{props.attachments!.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs" style={{ borderColor: "var(--color-border)" }}>
                    {a.name}
                    <a className="underline" href={attUrl(campaignId, a.id, true)}>descargar</a>
                    {a.kind === "image" && a.mime !== "image/gif" && <button type="button" className="underline" onClick={() => copyImage(attUrl(campaignId, a.id)).then(() => setRes({ ok: "Imagen copiada: pégala en el chat (Ctrl/⌘ + V)." })).catch(() => setRes({ error: "No se pudo copiar; usa «descargar»." }))}>copiar</button>}
                  </span>))}</div>
              </div>)}
            {body.trim() && <div className="mt-2 max-w-md"><WhatsAppPreview text={body} attachments={props.attachments} /></div>}
            {props.aiReady && !locked && <div className="mt-2"><label className="label" htmlFor={`rev-${cpId}`}>Ajuste para la IA (opcional, p. ej. «más corto» o «más formal»)</label>
              <input id={`rev-${cpId}`} className="input" maxLength={300} value={revision} onChange={(e) => setRevision(e.target.value)} /></div>}
            <p className="mt-1 text-xs text-muted">La IA solo escribe un borrador sin aprobar: nunca incluye precios, descuentos ni promesas que no estén en tu campaña. Guardar o editar retira la aprobación. “Abrir WhatsApp” abre el chat; si el mensaje trae emojis lo deja copiado para que lo pegues (el enlace los daña), y si no, lo escribe solo. No envía nada. Luego cambia el estado a “Contactado” cuando lo envíes.</p>
            {res?.repeatWarning && !/correo/.test(res.repeatWarning) && (
              <p role="alert" className="mt-2 text-sm badge-warn">{res.repeatWarning}{" "}
                <button className="btn ml-2" disabled={pending} onClick={() => run(() => whatsappAction(campaignId, cpId, true), (r) => { if (r.url) window.open(r.url, "_blank", "noopener,noreferrer"); })}>Sí, abrir de nuevo</button></p>)}
            {res?.repeatWarning && /correo/.test(res.repeatWarning) && <p><button className="btn" disabled={pending} onClick={() => run(() => emailAction(campaignId, cpId, true), (r) => { if (r.url) window.location.href = r.url; })}>Sí, abrir el correo de nuevo</button></p>}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div><label className="label" htmlFor={`fu-${cpId}`}>Próximo seguimiento</label><input id={`fu-${cpId}`} type="date" className="input" value={date} disabled={props.closed} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="md:col-span-2"><label className="label" htmlFor={`nt-${cpId}`}>Nota</label><input id={`nt-${cpId}`} className="input" maxLength={1000} value={notes} disabled={props.closed} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={props.closed || pending} onClick={() => run(() => followUpAction(campaignId, cpId, date, notes))}>Guardar seguimiento</button>
            {!p.doNotContact
              ? <button className="btn" disabled={pending} onClick={() => { if (confirm(`¿Marcar a ${p.name} como NO CONTACTAR? Quedará bloqueado en todas las campañas.`)) run(() => doNotContactAction(campaignId, p.id, true)); }}>Marcar “No contactar”</button>
              : <button className="btn" disabled={pending} onClick={() => run(() => doNotContactAction(campaignId, p.id, false))}>Quitar “No contactar”</button>}
          </div>
        </div>
      )}
      {res?.error && <p role="alert" className="text-sm badge-bad">{res.error}</p>}
      {res?.ok && <p role="status" className="text-sm badge-ok">{res.ok}</p>}
      {res?.warnings?.map((w) => <p key={w} className="text-sm badge-warn">⚠ {w}</p>)}
    </div>
  );
}
