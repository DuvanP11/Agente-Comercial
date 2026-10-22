import type { NextConfig } from "next";

const config: NextConfig = {
  // pg y pglite se resuelven en runtime de Node, no se empaquetan.
  // Las migraciones se leen del disco en runtime: sin esto Vercel no las empaqueta ("Can't find meta/_journal.json").
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  poweredByHeader: false,
  productionBrowserSourceMaps: false, // sin mapas de código en el navegador: nadie puede leer el código fuente original
  // En producción se quitan TODAS las llamadas a console del código: la consola del navegador queda vacía. El servidor escribe con src/lib/log.ts.
  compiler: { removeConsole: process.env.NODE_ENV === "production" },
  async headers() {
    const prod = process.env.NODE_ENV === "production";
    const csp = [
      "default-src 'self'", `script-src 'self' 'unsafe-inline'${prod ? "" : " 'unsafe-eval'"}`, "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:", "media-src 'self' blob:", "font-src 'self' data:", "connect-src 'self'",
      "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ].join("; ");
    const noStore = [{ key: "Cache-Control", value: "no-store, max-age=0" }, { key: "Pragma", value: "no-cache" }];
    const base = [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      ...(prod ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ];
    return [
      { source: "/:path*", headers: base },
      // Páginas, acciones y API nunca se guardan en cachés (los archivos estáticos de /_next sí, para que la app cargue rápido).
      { source: "/((?!_next/static|_next/image|brand/).*)", headers: noStore },
    ];
  },
  serverExternalPackages: ["pg", "@electric-sql/pglite", "exceljs"],
};

export default config;
