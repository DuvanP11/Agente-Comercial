/** Página «no existe» genérica: no revela qué tecnología ni qué rutas hay. */
export default function NotFound() {
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
      <div><h1 style={{ fontSize: 28, fontWeight: 800 }}>No encontrado</h1><p style={{ marginTop: 8 }}>La página que buscas no existe o no tienes acceso.</p><p style={{ marginTop: 16 }}><a href="/bienvenida" style={{ textDecoration: "underline" }}>Ir al inicio</a></p></div>
    </div>
  );
}
