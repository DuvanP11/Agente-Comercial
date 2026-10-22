import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp, tooMany } from "@/lib/rate-limit";
import Link from "next/link";
import { LoginForm } from "./LoginForm";
import { authConfigured } from "@/lib/auth";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { authenticate } from "@/lib/services/users";
import { startSession } from "@/lib/session";

async function login(formData: FormData) {
  "use server";
  // Freno por IP además del bloqueo por cuenta: 20 intentos cada 15 minutos (también cubre usuarios que no existen).
  if (tooMany(`login:${clientIp(await headers())}`, 20, 15 * 60_000)) redirect("/login?error=locked");
  const db = await getDb();
  const r = await authenticate(db, await ensureDefaultOrg(db), String(formData.get("identifier") ?? ""), String(formData.get("password") ?? ""));
  if (!r.ok) redirect(`/login?error=${r.reason === "locked" ? "locked" : "1"}`);
  await startSession(r.user);
  redirect(r.user.mustChangePassword ? "/cuenta?cambio=obligatorio" : "/bienvenida");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div style={{ background: "#f5f7fb", minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui" }}>
      <LoginForm action={login} error={error === "1" ? "Usuario o contraseña incorrectos." : error === "locked" ? "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." : null} notConfigured={!authConfigured()}
        footer={<Link href="/login/recuperar" style={{ fontSize: 13, color: "#475569" }}>¿Olvidaste tu contraseña?</Link>} />
    </div>
  );
}
