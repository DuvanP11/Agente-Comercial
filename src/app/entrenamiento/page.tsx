import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { getTraining } from "@/lib/services/settings";
import { TrainingForm } from "./TrainingForm";

export const dynamic = "force-dynamic";

export default async function Entrenamiento() {
  const db = await getDb();
  const t = await getTraining(db, await ensureDefaultOrg(db));
  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Entrenamiento de IA</h1>
        <p className="text-sm text-muted">Aquí le enseñas a los agentes cómo es PIBOX y cómo quieres que hablen. No se reentrena ningún modelo: lo que escribas se añade como contexto a las instrucciones de la <b>redacción de mensajes</b> y de la <b>calificación</b> de prospectos.</p></header>
      <p className="card badge-warn text-sm">Este texto se envía al proveedor de IA en cada uso. No pegues claves, contraseñas ni datos personales de clientes. Los precios, descuentos, garantías y tiempos siguen prohibidos para la IA aunque los escribas aquí: esos los pone una persona. La calificación ya analizada en las últimas 24 h se reutiliza; para ver el efecto, vuelve a analizar.</p>
      <TrainingForm initial={t} />
    </div>
  );
}
