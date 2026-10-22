"use client";
import { explainError, shortDetail } from "@/lib/error-info";

/** Pantalla de recuperación: reemplaza el «Application error» en blanco por algo que se puede entender y usar. */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const info = explainError(error.message);
  return (
    <div role="alert" className="mx-auto max-w-xl space-y-3 p-6">
      <h1 className="text-xl font-bold">{info.title}</h1>
      <p className="text-sm">{info.hint}</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Recargar la página</button>
        {!info.likelyStale && <button className="btn" onClick={reset}>Reintentar</button>}
        <a className="btn" href="/">Ir al inicio</a>
      </div>
      <details className="text-xs text-muted"><summary className="cursor-pointer underline">Referencia para soporte</summary>
        <pre className="mt-1 whitespace-pre-wrap rounded border border-border p-2">{shortDetail(error.message, error.digest)}</pre></details>
    </div>
  );
}
