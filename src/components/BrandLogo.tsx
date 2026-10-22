/**
 * Logo del menú. Con `tint` se usa como máscara y se pinta con el color principal del tema: cambia de color con el diseño y no lleva
 * fondo (solo funciona con imágenes de fondo transparente). Sin `tint` se muestra tal cual.
 */
export function BrandLogo({ version, tint, height = 36 }: { version: string; tint: boolean; height?: number }) {
  const src = `/brand/logo?v=${encodeURIComponent(version)}`;
  const box = { height, width: Math.round(height * 3.4) };
  return tint
    ? <span role="img" aria-label="PIBOX" style={{ display: "block", ...box, background: "var(--color-primary)", WebkitMaskImage: `url(${src})`, maskImage: `url(${src})`, WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskPosition: "left center", maskPosition: "left center" }} />
    // eslint-disable-next-line @next/next/no-img-element
    : <img src={src} alt="PIBOX" style={{ display: "block", height, width: "auto", maxWidth: box.width, objectFit: "contain" }} />;
}
