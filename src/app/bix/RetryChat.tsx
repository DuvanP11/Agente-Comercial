"use client";
import { useState, useTransition } from "react";
import { retryChatAction } from "./actions";

export function RetryChat({ id }: { id: string }) {
  const [pending, start] = useTransition(); const [msg, setMsg] = useState<string | null>(null);
  return <span className="inline-flex items-center gap-2"><button className="btn" disabled={pending} onClick={() => start(async () => { const r = await retryChatAction(id); setMsg(r.ok ?? r.error ?? null); })}>{pending ? "Enviando…" : "Reintentar aviso a Google Chat"}</button>{msg && <span role="status" className="text-xs">{msg}</span>}</span>;
}
