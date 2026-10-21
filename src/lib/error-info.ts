/**
 * Explica un error de pantalla en lenguaje llano. El caso más común tras desplegar una versión nueva es que una
 * pestaña que ya estaba abierta llame a una acción del servidor que cambió: basta con recargar.
 */
export function explainError(message: string | undefined): { title: string; hint: string; likelyStale: boolean } {
  const m = message ?? "";
  const stale = /Failed to find Server Action|Server Action .* not found|ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module|Unexpected token '<'/i.test(m);
  if (stale) return { title: "La aplicación se actualizó", hint: "Esta pestaña se abrió con una versión anterior. Recarga la página para continuar; tus datos están guardados.", likelyStale: true };
  return { title: "Algo salió mal en esta pantalla", hint: "Prueba recargando la página. Tus datos están guardados. Si se repite, copia el detalle técnico de abajo y envíalo.", likelyStale: false };
}

/** Recorta el detalle para mostrarlo sin desbordar la pantalla ni exponer cadenas largas. */
export function shortDetail(message: string | undefined, digest?: string): string {
  const base = (message ?? "(sin mensaje)").replace(/\s+/g, " ").slice(0, 400);
  return digest ? `${base} [ref: ${digest}]` : base;
}
