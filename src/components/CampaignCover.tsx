/** Portada de una campaña: la imagen subida o, si no hay, un degradado con el color del tema y la inicial (para distinguirlas de un vistazo). */
export function CampaignCover({ id, name, coverLen, height = 120, rounded = true }: { id: string; name: string; coverLen: number; height?: number; rounded?: boolean }) {
  const r = rounded ? "var(--radius)" : 0;
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
