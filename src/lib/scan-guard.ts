/** Detección de escaneos (bots que buscan archivos y paneles conocidos). Puro: se usa en el middleware. */
const SCAN_PATTERNS: RegExp[] = [
  /(^|\/)\.(env|git|svn|hg|aws|ssh|docker|npmrc|htaccess|htpasswd|ds_store|vscode|idea)(\/|$|\.)/i,
  /\.(php\d?|asp|aspx|jsp|cgi|sql|bak|old|orig|swp|zip|tar|gz|7z|rar|ini|conf|log|pem|key|yml|yaml)$/i,
  /(^|\/)(wp-admin|wp-login|wp-content|wp-includes|xmlrpc|phpmyadmin|pma|adminer|cgi-bin|server-status|actuator|solr|jenkins|manager\/html|boaform|vendor\/phpunit|telescope|_profiler|\.well-known\/security)(\/|$|\.)/i,
  /(^|\/)(config|backup|backups|dump|database|db|admin\.php|setup|install|shell|console|debug|phpinfo|info)\.(php|json|js|txt|sql|html?)$/i,
];

/** ¿La ruta parece un sondeo? Incluye intentos de salirse de la carpeta (..) y bytes nulos. */
export function isScanPath(pathname: string, search = ""): boolean {
  let p = pathname;
  try { p = decodeURIComponent(pathname); } catch { return true; } // codificación inválida: sospechoso
  if (p.includes("\u0000") || /(^|\/)\.\.(\/|$)/.test(p) || /%2e%2e|%00|\.\.[/\\]/i.test(pathname + search)) return true;
  if (/(<script|union\s+select|\bor\s+1=1|\/etc\/passwd|\bsleep\(|information_schema)/i.test(`${p} ${(() => { try { return decodeURIComponent(search); } catch { return search; } })()}`)) return true;
  return SCAN_PATTERNS.some((r) => r.test(p));
}

/** Contador de sondeos por IP en una ventana; al pasar el umbral, la IP queda bloqueada un tiempo (solo para quien no tiene sesión). */
export class ProbeTracker {
  private hits = new Map<string, number[]>();
  private blocked = new Map<string, number>();
  constructor(private max = 6, private windowMs = 10 * 60_000, private blockMs = 60 * 60_000) {}
  /** Registra un sondeo; devuelve true si con este la IP quedó bloqueada. */
  record(ip: string, now = Date.now()): boolean {
    const recent = (this.hits.get(ip) ?? []).filter((t) => now - t < this.windowMs); recent.push(now); this.hits.set(ip, recent);
    if (recent.length >= this.max) { this.blocked.set(ip, now + this.blockMs); return true; }
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    return false;
  }
  isBlocked(ip: string, now = Date.now()): boolean {
    const until = this.blocked.get(ip);
    if (!until) return false;
    if (until <= now) { this.blocked.delete(ip); return false; }
    return true;
  }
}
