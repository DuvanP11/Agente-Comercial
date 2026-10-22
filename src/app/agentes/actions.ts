"use server";
import { requireNotHunter } from "@/lib/session";
import { checkProviders, type ProviderCheck } from "@/lib/ai/provider";

export async function testConnectionAction(): Promise<{ checks: ProviderCheck[] }> {
  await requireNotHunter(); // el Hunter no usa este módulo
  return { checks: await checkProviders() };
}
