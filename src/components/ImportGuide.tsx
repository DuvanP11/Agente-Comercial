"use client";
import { HelpPanel } from "@/components/Insight";

export interface GuideColumn { name: string; required: boolean; what: string; example: string; also: string }

const cell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Guía de formato de un archivo de importación: pasos, columnas, reglas y plantilla .csv (UTF-8 con BOM para que Excel respete las tildes). */
export function ImportGuide({ title, steps, columns, rules, fileName, templateRows, templateNote }: {
  title: string; steps: string[]; columns: GuideColumn[]; rules: string[]; fileName: string; templateRows: string[][]; templateNote?: string;
}) {
  const csv = "﻿" + [columns.map((c) => c.name), ...templateRows].map((r) => r.map(cell).join(",")).join("\r\n");
  const href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  const required = columns.filter((c) => c.required).map((c) => c.name);
  return (
    <HelpPanel title={title} open>
      <section className="space-y-1">
        <h3 className="font-semibold">Pasos</h3>
        <ol className="list-decimal space-y-1 pl-5">{steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <p><a className="btn" href={href} download={fileName}>Descargar plantilla de ejemplo (.csv)</a> <span className="text-xs text-muted">{templateNote ?? "Borra las filas de ejemplo antes de cargar tu lista."}</span></p>
      </section>
      <section className="space-y-1">
        <h3 className="font-semibold">Columnas ({columns.length} en total; {required.length === 1 ? `solo «${required[0]}» es obligatoria` : `obligatorias: ${required.join(", ")}`})</h3>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Columna</th><th>¿Obligatoria?</th><th>Qué debe llevar</th><th>Ejemplo</th><th>Otros nombres que la app reconoce</th></tr></thead>
            <tbody>{columns.map((c) => (
              <tr key={c.name}><td><b>{c.name}</b></td><td>{c.required ? <span className="badge-bad">Sí</span> : "No"}</td><td>{c.what}</td><td>{c.example ? <code>{c.example}</code> : <span className="text-muted">—</span>}</td><td className="text-muted">{c.also}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="text-xs text-muted">Puedes llamar a las columnas como quieras: si el nombre no coincide, en la vista previa eliges a mano cuál es cuál. Las columnas que no corresponden a ninguna se ignoran.</p>
      </section>
      <section className="space-y-1">
        <h3 className="font-semibold">Reglas del archivo</h3>
        <ul className="list-disc space-y-1 pl-5">{rules.map((r) => <li key={r}>{r}</li>)}</ul>
      </section>
    </HelpPanel>
  );
}
