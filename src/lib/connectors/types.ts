import { z } from "zod";

export const searchCriteria = z.object({
  country: z.string().default("CO"),
  city: z.string().min(1),
  zones: z.array(z.string()).default([]),
  categories: z.array(z.string()).min(1),
  maxResults: z.number().int().min(1).max(60).default(20),
  excludeTerms: z.array(z.string()).default([]),
});
export type SearchCriteria = z.infer<typeof searchCriteria>;

/** Registro normalizado que produce cualquier conector. Campos ausentes = null (no se inventan). */
export interface RawProspect {
  name: string;
  category: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  sourceName: string;
  sourceId: string | null;
  sourceUrl: string | null;
  consultedAt: Date;
  isDemo: boolean;
}

export type ConnectorStatus =
  | { state: "connected" }
  | { state: "not_configured"; missing: string[]; howTo: string }
  | { state: "error"; message: string };

export interface ConnectorResult {
  prospects: RawProspect[];
  /** Errores parciales: se informan, nunca se rellenan con datos inventados. */
  errors: string[];
  /** Costo estimado en USD si el proveedor cobra por consulta. */
  estimatedCostUsd?: number;
}

export interface Connector {
  id: string;
  label: string;
  capabilities: string[];
  status(): ConnectorStatus;
  search(criteria: SearchCriteria, signal?: AbortSignal): Promise<ConnectorResult>;
}
