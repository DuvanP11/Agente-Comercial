"use client";
import { useState, type ChangeEventHandler } from "react";

/** Campo de contraseña con ojo para mostrar u ocultar lo escrito. */
export function PasswordInput({ id, name, autoComplete, required, minLength, value, onChange }: {
  id: string; name: string; autoComplete: string; required?: boolean; minLength?: number; value?: string; onChange?: ChangeEventHandler<HTMLInputElement>;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} name={name} type={show ? "text" : "password"} className="input !pr-12" required={required} minLength={minLength} autoComplete={autoComplete}
        {...(value !== undefined ? { value, onChange } : {})} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={show}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:text-[var(--color-text)]">
        {show ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
        )}
      </button>
    </div>
  );
}
