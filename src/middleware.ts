import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { authConfigured, readSession, SESSION_COOKIE } from "@/lib/auth";
import { canAccessPath, fallbackFor } from "@/lib/permissions";
import { isScanPath, ProbeTracker } from "@/lib/scan-guard";

const probes = new ProbeTracker();
const ipOf = (req: NextRequest) => (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "desconocida").trim().slice(0, 64);
const NOT_FOUND = () => new NextResponse("Not found", { status: 404, headers: { "cache-control": "no-store" } });

async function probeKey(): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.AUTH_SECRET ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("probe")))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl;
  // El registro interno de sondeos se valida con una clave derivada del secreto (en la propia ruta).
  if (pathname === "/api/security/probe") return NextResponse.next();
  // Escaneos: respuesta idéntica a «no existe» (no revela que hay una pantalla de acceso) y se deja constancia en la auditoría.
  const ip = ipOf(req);
  if (isScanPath(pathname, req.nextUrl.search)) {
    const nowBlocked = probes.record(ip);
    if (authConfigured()) event.waitUntil((async () => {
      try {
        await fetch(new URL("/api/security/probe", req.url), { method: "POST", headers: { "content-type": "application/json", "x-probe-key": await probeKey() },
          body: JSON.stringify({ path: pathname.slice(0, 120), ip, ua: (req.headers.get("user-agent") ?? "").slice(0, 160), blocked: nowBlocked }) });
      } catch { /* si no se puede registrar, igual se bloquea */ }
    })());
    return NOT_FOUND();
  }
  // El logo y el ícono de la pestaña se piden también desde la pantalla de acceso.
  if (pathname.startsWith("/login") || pathname.startsWith("/brand/")) return NextResponse.next();

  // Sin credenciales configuradas: en desarrollo se permite; en producción se bloquea todo.
  if (!authConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Configura APP_PASSWORD y AUTH_SECRET (≥24 caracteres) para habilitar el acceso.", { status: 503 });
    }
    return NextResponse.next();
  }
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  // IP que ya estuvo sondeando y no tiene sesión: bloqueada un rato (quien sí tiene sesión no se ve afectado).
  if (!session && probes.isBlocked(ip)) return NOT_FOUND();
  if (session) {
    // Quien debe cambiar su contraseña temporal solo puede ver su cuenta.
    if (session.m && !pathname.startsWith("/cuenta") && !pathname.startsWith("/brand/")) {
      const url = req.nextUrl.clone(); url.pathname = "/cuenta"; url.search = "?cambio=obligatorio";
      return NextResponse.redirect(url);
    }
    // Cada rol solo abre sus rutas (el Hunter: Prospección, Comercial y Reportes).
    if (!canAccessPath(session.r, pathname)) {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
      const url = req.nextUrl.clone(); url.pathname = fallbackFor(session.r); url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
