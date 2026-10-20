import { NextResponse, type NextRequest } from "next/server";
import { authConfigured, isValidSession, SESSION_COOKIE } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login")) return NextResponse.next();

  // Sin credenciales configuradas: en desarrollo se permite; en producción se bloquea todo.
  if (!authConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Configura APP_PASSWORD y AUTH_SECRET (≥24 caracteres) para habilitar el acceso.", { status: 503 });
    }
    return NextResponse.next();
  }
  if (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
