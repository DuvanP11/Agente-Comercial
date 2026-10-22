/** Así se vería el mensaje en WhatsApp: burbuja verde con el texto y, debajo, los archivos que se adjuntarán. Solo es una vista previa. */
export function WhatsAppPreview({ text, attachments = [], from = "PIBOX Mensajería" }: { text: string; attachments?: { name: string; kind: string }[]; from?: string }) {
  const icon = (k: string) => (k === "image" ? "🖼️" : k === "video" ? "🎬" : k === "pdf" ? "📄" : "📝");
  return (
    <div className="rounded-[var(--radius)] p-3" style={{ background: "color-mix(in srgb, #25d366 14%, var(--color-surface-2))" }} aria-label="Vista previa del mensaje">
      <div className="mb-1 text-[11px] text-muted">Vista previa · {from}</div>
      <div className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm px-3 py-2 text-sm shadow-sm" style={{ background: "#d9fdd3", color: "#111b21" }}>
        {attachments.length > 0 && (
          <div className="mb-2 space-y-1">{attachments.map((a) => <div key={a.name} className="truncate rounded px-2 py-1 text-xs" style={{ background: "rgba(0,0,0,0.07)" }}>{icon(a.kind)} {a.name}</div>)}</div>
        )}
        <p className="whitespace-pre-wrap break-words">{text.trim() || "Escribe el mensaje para ver cómo queda."}</p>
        <div className="mt-1 text-right text-[10px] opacity-60">ahora ✓✓</div>
      </div>
    </div>
  );
}
