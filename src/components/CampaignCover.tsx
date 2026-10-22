/** Portada de una campaña: la imagen subida o, si no hay, un degradado con el color del tema y la inicial (para distinguirlas de un vistazo). */
export function CampaignCover({ id, name, coverLen, height = 120, rounded = true, whole = false }: { id: string; name: string; coverLen: number; height?: number; rounded?: boolean; whole?: boolean }) {
  const r = rounded ? "var(--radius)" : 0;
  if (coverLen > 0 && whole) {
    // Banner: la portada se ve COMPLETA (sin recortar) sobre una copia suya desenfocada que rellena los lados.
    const src = `/api/campaigns/${id}/cover?v=${coverLen}`;
    return (
      <div style={{ position: "relative", width: "100%", height, overflow: "hidden", borderRadius: r, background: "var(--color-surface-2)" }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: -20, backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(18px) brightness(0.9)" }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Portada de ${name}`} style={{ position: "relative", width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      </div>
    );
  }
  if (coverLen > 0) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/campaigns/${id}/cover?v=${coverLen}`} alt={`Portada de ${name}`} style={{ width: "100%", height, objectFit: "cover", borderRadius: r, display: "block" }} />;
  }
  const hue = [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 3, 0);
  const second = ["var(--s4)", "var(--s3)", "var(--s2)"][hue];
  return (
    <div role="img" aria-label={`Portada de ${name}`} style={{ width: "100%", height, borderRadius: r, background: `linear-gradient(135deg, var(--color-primary), ${second})`, color: "var(--color-on-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(height * 0.45), fontWeight: 800 }}>
      {name.trim().charAt(0).toUpperCase() || "C"}
    </div>
  );
}
