"use client";
import { useState } from "react";

export function LoginForm({ action, error, notConfigured }: { action: (fd: FormData) => void | Promise<void>; error: boolean; notConfigured: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <form action={action} style={{ background: "#fff", padding: 32, borderRadius: 12, width: 340, border: "1px solid #e2e8f0" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>PIBOX Commercial Intelligence</h1>
      {notConfigured && <p style={{ color: "#92600a", fontSize: 13, marginBottom: 12 }}>APP_PASSWORD / AUTH_SECRET no están configurados en el servidor.</p>}
      <label htmlFor="password" style={{ fontSize: 13 }}>Contraseña</label>
      <div style={{ position: "relative", margin: "4px 0 12px" }}>
        <input id="password" name="password" type={show ? "text" : "password"} required autoFocus autoComplete="current-password"
          style={{ width: "100%", padding: "8px 40px 8px 8px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={show}
          style={{ position: "absolute", right: 6, top: 4, border: 0, background: "transparent", cursor: "pointer", padding: 4, color: "#475569" }}>
          {show ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          )}
        </button>
      </div>
      {error && <p role="alert" style={{ color: "#b42318", fontSize: 13, marginBottom: 8 }}>Contraseña incorrecta.</p>}
      <button style={{ width: "100%", padding: 10, background: "#1f4fd8", color: "#fff", border: 0, borderRadius: 8, fontWeight: 600 }}>Entrar</button>
    </form>
  );
}
