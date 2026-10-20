import type { NextConfig } from "next";

const config: NextConfig = {
  // pg y pglite se resuelven en runtime de Node, no se empaquetan.
  // Las migraciones se leen del disco en runtime: sin esto Vercel no las empaqueta ("Can't find meta/_journal.json").
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  serverExternalPackages: ["pg", "@electric-sql/pglite", "exceljs"],
};

export default config;
