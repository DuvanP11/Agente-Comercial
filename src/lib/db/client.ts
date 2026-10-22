import { logError } from "../log";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");
const g = globalThis as unknown as { __db?: Promise<Db> };

/** Base en memoria (o en carpeta) con PGlite: para pruebas y desarrollo sin Postgres. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const db = drizzlePglite(new PGlite(dataDir), { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const db = drizzle(new Pool({ connectionString: url }), { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as Db; // mismo dialecto; la API usada es idéntica
  }
  // Solo para probar el build de producción en un computador (e2e/): PGLITE_LOCAL_E2E=1. Nunca se define en Vercel.
  if (process.env.NODE_ENV === "production" && process.env.PGLITE_LOCAL_E2E !== "1") {
    throw new Error("DATABASE_URL no está configurada. En producción es obligatoria.");
  }
  return createPgliteDb(path.join(process.cwd(), ".pglite"));
}

export function getDb(): Promise<Db> {
  return (g.__db ??= init().then(async (db) => {
    // Mantenimiento ligero y seguro (solo claves vacías); un fallo aquí nunca debe tumbar la aplicación.
    try { const { backfillPhoneKeys } = await import("../services/maintenance"); await backfillPhoneKeys(db); }
    catch (e) { logError("backfillPhoneKeys falló:", e); }
    return db;
  }));
}

/** Organización única de desarrollo hasta que exista multi-organización con autenticación. */
export async function ensureDefaultOrg(db: Db): Promise<string> {
  const rows = await db.select().from(schema.organizations).limit(1);
  if (rows[0]) return rows[0].id;
  const [created] = await db.insert(schema.organizations).values({ name: "PIBOX Mensajería" }).returning();
  return created.id;
}

export { schema };
