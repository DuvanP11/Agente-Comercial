"use server";
import { checkProviders, type ProviderCheck } from "@/lib/ai/provider";

export async function testConnectionAction(): Promise<{ checks: ProviderCheck[] }> {
  return { checks: await checkProviders() };
}
