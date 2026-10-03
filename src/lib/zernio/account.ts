import "server-only";
import { getWhatsAppAccounts, type WhatsAppAccount } from "@/lib/zernio/client";

/** The WhatsApp number the foundation sends from: the first active connected account. */
export function pickWhatsAppAccount(accounts: WhatsAppAccount[]) {
  return accounts.find((a) => a.isActive) ?? accounts[0] ?? null;
}

export async function getPrimaryWhatsAppAccount(): Promise<{
  account: WhatsAppAccount | null;
  error?: string;
}> {
  const result = await getWhatsAppAccounts();
  return { account: pickWhatsAppAccount(result.accounts), error: result.success ? undefined : result.error };
}
