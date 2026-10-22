/**
 * Registro del servidor. Escribe directo a stderr (no usa `console`): en producción se eliminan todas las llamadas a `console`
 * del código, así el navegador nunca imprime nada y el servidor conserva sus avisos.
 */
export function logError(...parts: unknown[]) {
  try {
    const line = parts.map((p) => (p instanceof Error ? `${p.name}: ${p.message}` : typeof p === "string" ? p : JSON.stringify(p))).join(" ");
    process.stderr.write(`${new Date().toISOString()} ${line.replace(/postgres(ql)?:\/\/\S+/gi, "[conexión oculta]")}\n`);
  } catch { /* nunca estorba */ }
}
