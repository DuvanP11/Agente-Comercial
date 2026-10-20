import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";
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
      <LoginForm action={login} error={!!error} notConfigured={!authConfigured()} />
    </div>
  );
}
