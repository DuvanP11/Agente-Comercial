import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authConfigured, makeSessionToken, passwordMatches, SESSION_COOKIE } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  if (await passwordMatches(String(formData.get("password") ?? ""))) {
    (await cookies()).set(SESSION_COOKIE, await makeSessionToken(), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12,
    });
    redirect("/");
  }
  redirect("/login?error=1");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div style={{ background: "#f5f7fb", minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui" }}>
      <form action={login} style={{ background: "#fff", padding: 32, borderRadius: 12, width: 340, border: "1px solid #e2e8f0" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>PIBOX Commercial Intelligence</h1>
        {!authConfigured() && <p style={{ color: "#92600a", fontSize: 13, marginBottom: 12 }}>APP_PASSWORD / AUTH_SECRET no están configurados en el servidor.</p>}
        <label htmlFor="password" style={{ fontSize: 13 }}>Contraseña</label>
        <input id="password" name="password" type="password" required autoFocus style={{ width: "100%", padding: 8, margin: "4px 0 12px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
        {error && <p role="alert" style={{ color: "#b42318", fontSize: 13, marginBottom: 8 }}>Contraseña incorrecta.</p>}
        <button style={{ width: "100%", padding: 10, background: "#1f4fd8", color: "#fff", border: 0, borderRadius: 8, fontWeight: 600 }}>Entrar</button>
      </form>
    </div>
  );
}
