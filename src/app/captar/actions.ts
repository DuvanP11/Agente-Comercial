"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureDefaultOrg, getDb } from "@/lib/db/client";
import { startCaptation } from "@/lib/services/captar";

export interface CaptarState { error?: string }

export async function startCaptationAction(_: CaptarState, fd: FormData): Promise<CaptarState> {
  let campaignId: string;
  try {
    const db = await getDb();
    const existing = String(fd.get("campaignId") ?? "");
    const r = await startCaptation(db, await ensureDefaultOrg(db), {
      prospectIds: fd.getAll("prospect").map(String),
      campaignId: existing && existing !== "new" ? existing : undefined,
      newName: String(fd.get("newName") ?? ""),
    }, "usuario");
    campaignId = r.campaignId;
    revalidatePath("/captar"); revalidatePath("/campanas");
  } catch (e) { return { error: e instanceof Error ? e.message : "No se pudo iniciar la captación." }; }
  redirect(`/campanas/${campaignId}`);
}
