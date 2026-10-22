import type { MetadataRoute } from "next";

/** Nada de esta plataforma debe indexarse en buscadores. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
