import Link from "next/link";
import { headers } from "next/headers";
import { clientIp, tooMany } from "@/lib/rate-limit";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { requestReset } from "@/lib/services/users";

async function request(formData: FormData) {
  "use server";
  if (tooMany(`reset:${clientIp(await headers())}`, 5, 15 * 60_000)) return; // sin pista de que se limitó
  const db = await getDb();
  await requestReset(db, await ensureDefaultOrg(db), String(formData.get("identifier") ?? "")).catch(() => {});
}

/** Recuperación: no hay correo automático. La persona avisa y el administrador le entrega una contraseña temporal. */
export default async function Recuperar({ searchParams }: { searchParams: Promise<{ listo?: string }> }) {
  const { listo } = await searchParams;
  return (
    <div style={{ background: "#f5f7fb", minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui" }}>
      <div style={{ background: "#fff", padding: 32, borderRadius: 12, width: 380, border: "1px solid #e2e8f0", lineHeight: 1.5 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Recuperar contraseña</h1>
        <p style={{ fontSize: 14, marginBottom: 12 }}>Las contraseñas las restablece <b>únicamente el administrador</b> de la plataforma. Escribe tu correo o usuario para avisarle; él te entregará una contraseña temporal que deberás cambiar al entrar.</p>
        {listo ? (
          <p role="status" style={{ fontSize: 14, color: "#106b3a", marginBottom: 12 }}>Listo. Si la cuenta existe y está activa, el administrador verá tu solicitud. Contáctalo también directamente para que no se demore.</p>
        ) : (
          <form action={async (fd) => { "use server"; await request(fd); const { redirect } = await import("next/navigation"); redirect("/login/recuperar?listo=1"); }}>
            <label htmlFor="identifier" style={{ fontSize: 13 }}>Correo o usuario</label>
            <input id="identifier" name="identifier" required autoFocus style={{ width: "100%", padding: 8, border: "1px solid #cbd5e1", borderRadius: 8, margin: "4px 0 12px" }} />
            <button style={{ width: "100%", padding: 10, background: "#1f4fd8", color: "#fff", border: 0, borderRadius: 8, fontWeight: 600 }}>Avisar al administrador</button>
          </form>
        )}
        <p style={{ marginTop: 12, textAlign: "center" }}><Link href="/login" style={{ fontSize: 13, color: "#475569" }}>← Volver a iniciar sesión</Link></p>
      </div>
    </div>
  );
}
