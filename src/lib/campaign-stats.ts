import type { CpStatus } from "./campaigns";

type Counts = Record<CpStatus, number>;
const sum = (c: Counts, keys: CpStatus[]) => keys.reduce((s, k) => s + (c[k] ?? 0), 0);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

const CONTACTED: CpStatus[] = ["contacted", "replied", "meeting", "proposal", "won", "lost", "not_interested"];
const REPLIED: CpStatus[] = ["replied", "meeting", "proposal", "won"];
const MEETING: CpStatus[] = ["meeting", "proposal", "won"];
const PROPOSAL: CpStatus[] = ["proposal", "won"];

export interface CampaignNumbers { total: number; contacted: number; replied: number; meetings: number; proposals: number; won: number; contactRate: number; replyRate: number; winRate: number }

/** Cifras de una campaña a partir de cuántos prospectos hay en cada estado (acumuladas: quien ganó también fue contactado y respondió). */
export function campaignNumbers(c: Counts): CampaignNumbers {
  const total = sum(c, Object.keys(c) as CpStatus[]);
  const contacted = sum(c, CONTACTED), replied = sum(c, REPLIED), meetings = sum(c, MEETING), proposals = sum(c, PROPOSAL), won = c.won ?? 0;
  return { total, contacted, replied, meetings, proposals, won, contactRate: pct(contacted, total), replyRate: pct(replied, contacted), winRate: pct(won, contacted) };
}

export function campaignFunnel(c: Counts): { label: string; value: number }[] {
  const n = campaignNumbers(c);
  return [
    { label: "Prospectos en la campaña", value: n.total }, { label: "Contactados", value: n.contacted }, { label: "Respondieron", value: n.replied },
    { label: "Reunión agendada", value: n.meetings }, { label: "Propuesta enviada", value: n.proposals }, { label: "Ganados", value: n.won },
  ];
}

/** Lectura en una o dos frases de cómo va una campaña. */
export function campaignInsight(n: CampaignNumbers): string {
  if (n.total === 0) return "Todavía no tiene prospectos: agrégalos para empezar a contactarlos.";
  if (n.contacted === 0) return `Hay ${n.total} prospecto(s) por contactar. Aprueba el mensaje de cada uno y abre WhatsApp para empezar.`;
  const parts = [`Se contactó a ${n.contacted} de ${n.total} (${n.contactRate} %).`];
  parts.push(n.replied === 0 ? "Aún nadie ha respondido: considera un seguimiento con un mensaje distinto." : `Respondieron ${n.replied} (${n.replyRate} % de los contactados).`);
  if (n.won > 0) parts.push(`${n.won} cliente(s) ganado(s).`);
  else if (n.meetings > 0) parts.push(`${n.meetings} reunión(es) en curso: es lo más cercano al cierre.`);
  return parts.join(" ");
}

export function campaignsOverview(list: { name: string; counts: Counts }[]): string {
  if (!list.length) return "Aún no hay campañas.";
  const nums = list.map((l) => campaignNumbers(l.counts));
  const total = nums.reduce((s, n) => s + n.total, 0), contacted = nums.reduce((s, n) => s + n.contacted, 0), replied = nums.reduce((s, n) => s + n.replied, 0), won = nums.reduce((s, n) => s + n.won, 0);
  if (total === 0) return "Las campañas aún no tienen prospectos.";
  if (contacted === 0) return `Hay ${total} prospectos en campañas y todavía ninguno contactado.`;
  const best = list.map((l, i) => ({ i, r: nums[i].contacted >= 5 ? nums[i].replyRate : -1 })).sort((a, b) => b.r - a.r)[0];
  return `${pct(contacted, total)} % de los prospectos en campañas ya fue contactado y ${pct(replied, contacted)} % de ellos respondió${won ? `; hay ${won} ganado(s)` : ""}.${best.r >= 0 ? ` Mejor respuesta (con 5 o más contactados): «${list[best.i].name}», ${best.r} %.` : ""}`;
}
