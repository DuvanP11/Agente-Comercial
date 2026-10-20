export default function Reportes() {
  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Reportes</h1>
        <p className="text-sm text-muted">Reportes gerenciales, financieros y por campaña: pendientes (fase 9).</p></header>
      <div className="card space-y-2">
        <h2 className="font-semibold">Prospectos (CSV)</h2>
        <p className="text-sm">Todos los prospectos con estado, fuente, fecha de consulta y si son de demostración. Las celdas que empiecen por =, +, - o @ se neutralizan para que Excel no las ejecute.</p>
        <a className="btn btn-primary" href="/reportes/prospectos">Descargar CSV</a>
      </div>
    </div>
  );
}
