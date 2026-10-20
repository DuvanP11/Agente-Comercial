import type { NextConfig } from "next";

const config: NextConfig = {
  // pg y pglite se resuelven en runtime de Node, no se empaquetan.
  serverExternalPackages: ["pg", "@electric-sql/pglite", "exceljs"],
};

export default config;
