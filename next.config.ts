import type { NextConfig } from "next";

const config: NextConfig = {
  // pg y pglite se resuelven en runtime de Node, no se empaquetan.
  // Las migraciones se leen del disco en runtime: sin esto Vercel no las empaqueta ("Can't find meta/_journal.json").
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  poweredByHeader: false,
  async headers() {
    const prod = process.env.NODE_ENV === "production";
    const csp = [
      "default-src 'self'", `script-src 'self' 'unsafe-inline'${prod ? "" : " 'unsafe-eval'"}`, "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:", "media-src 'self' blob:", "font-src 'self' data:", "connect-src 'self'",
      "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ].join("; ");
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ...(prod ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ] }];
  },
  serverExternalPackages: ["pg", "@electric-sql/pglite", "exceljs"],
};

export default config;
