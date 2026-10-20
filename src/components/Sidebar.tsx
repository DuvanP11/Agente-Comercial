"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";

const LABEL = { ready: "", partial: "Parcial", pending: "Pendiente" } as const;

export function Sidebar() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5 p-3">
      {NAV.map((n) => {
        const active = path === n.href || (n.href !== "/" && path.startsWith(n.href + "/"));
        return (
          <Link key={n.slug} href={n.href} aria-current={active ? "page" : undefined}
            className="flex items-center justify-between rounded-[var(--radius)] px-3 py-2 text-sm hover:bg-surface-2"
            style={active ? { background: "var(--color-primary)", color: "var(--color-on-primary)" } : undefined}>
            <span>{n.label}</span>
            {LABEL[n.status] && <span className="text-[10px] opacity-70">{LABEL[n.status]}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
