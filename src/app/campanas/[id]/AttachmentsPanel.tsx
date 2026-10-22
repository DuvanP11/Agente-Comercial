"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatSize, KIND_LABEL, MAX_CAMPAIGN_BYTES, MAX_FILE_BYTES, MAX_FILES, type MediaKind } from "@/lib/campaign-media";
import { deleteAttachmentAction } from "../actions";

export interface Att { id: string; name: string; mime: string; kind: MediaKind; size: number }
const ICON: Record<MediaKind, string> = { image: "🖼️", video: "🎬", pdf: "📄", doc: "📝" };
export const attUrl = (cid: string, id: string, download = false) => `/api/campaigns/${cid}/attachments/${id}${download ? "?download=1" : ""}`;

/** Copia una imagen al portapapeles (como PNG) para pegarla en WhatsApp Web. */
export async function copyImage(url: string): Promise<void> {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d")!.drawImage(bmp, 0, 0);
  const png = await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("No se pudo convertir la imagen."))), "image/png"));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

/** Material de la campaña: subir, ver, descargar, copiar (imágenes) y eliminar. */
export function AttachmentsPanel({ campaignId, items, closed }: { campaignId: string; items: Att[]; closed: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const total = items.reduce((s, a) => s + a.size, 0);

  const upload = async (files: FileList) => {
    setBusy(true); setMsg(null);
    let ok = 0, err: string | null = null;
    for (const f of Array.from(files)) {
      const fd = new FormData(); fd.set("file", f);
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/attachments`, { method: "POST", body: fd });
        const j = await res.json().catch(() => ({}));
        if (res.ok) ok++; else { err = (j as { error?: string }).error ?? `No se pudo subir «${f.name}».`; break; }
      } catch { err = `No se pudo subir «${f.name}». Revisa tu conexión.`; break; }
    }
    setBusy(false); if (input.current) input.current.value = "";
    setMsg(err ? { error: err, ok: ok ? `${ok} archivo(s) subido(s).` : undefined } : { ok: `${ok} archivo(s) subido(s).` });
    router.refresh();
  };

  return (
    <section className="card space-y-3" aria-label="Material de la campaña">
      <div><h2 className="font-semibold">Material de la campaña ({items.length})</h2>
        <p className="text-sm text-muted">Imágenes, video MP4, PDF o Word para acompañar los mensajes. Hasta {MAX_FILE_BYTES / 1048576} MB por archivo, {MAX_FILES} archivos y {MAX_CAMPAIGN_BYTES / 1048576} MB en total (usados: {formatSize(total)}). WhatsApp no permite adjuntar archivos desde un enlace: desde aquí los descargas o copias y los pegas en el chat.</p></div>
      {items.length === 0 ? <p className="text-sm text-muted">Aún no hay material. Sube el primero.</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <div key={a.id} className="space-y-2 rounded-[var(--radius)] border p-2" style={{ borderColor: "var(--color-border)" }}>
              {a.kind === "image" ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={attUrl(campaignId, a.id)} alt={a.name} className="h-28 w-full rounded object-cover" />
                : a.kind === "video" ? <video src={attUrl(campaignId, a.id)} className="h-28 w-full rounded bg-black object-contain" controls preload="metadata" />
                : <div className="flex h-28 items-center justify-center rounded text-4xl" style={{ background: "var(--color-surface-2)" }} aria-hidden="true">{ICON[a.kind]}</div>}
              <div className="min-w-0 text-sm"><div className="truncate font-semibold" title={a.name}>{a.name}</div><div className="text-xs text-muted">{KIND_LABEL[a.kind]} · {formatSize(a.size)}</div></div>
              <div className="flex flex-wrap gap-2">
                <a className="btn" href={attUrl(campaignId, a.id, true)}>Descargar</a>
                {a.kind === "image" && a.mime !== "image/gif" && <button className="btn" onClick={() => start(async () => { try { await copyImage(attUrl(campaignId, a.id)); setMsg({ ok: "Imagen copiada: pégala en el chat de WhatsApp (Ctrl/⌘ + V)." }); } catch { setMsg({ error: "Tu navegador no permitió copiar la imagen. Usa «Descargar»." }); } })}>Copiar imagen</button>}
                {!closed && <button className="btn" disabled={pending} onClick={() => { if (confirm(`¿Eliminar «${a.name}» de la campaña?`)) start(async () => { const r = await deleteAttachmentAction(campaignId, a.id); setMsg(r); router.refresh(); }); }}>Eliminar</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {!closed && (
        <div>
          <label className="label" htmlFor="att">Subir archivos</label>
          <input id="att" ref={input} type="file" multiple disabled={busy} className="input" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,application/pdf,.doc,.docx"
            onChange={(e) => { if (e.target.files?.length) upload(e.target.files); }} />
          {busy && <p className="mt-1 text-xs text-muted">Subiendo…</p>}
        </div>
      )}
      <div role="status" aria-live="polite">{msg?.ok && <p className="badge-ok text-sm">{msg.ok}</p>}{msg?.error && <p role="alert" className="badge-bad text-sm">{msg.error}</p>}</div>
    </section>
  );
}
