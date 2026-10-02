"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTeamMember } from "@/lib/auth/session";
import {
  disconnectWhatsAppAccount,
  getWhatsAppAccounts,
  getWhatsAppBusinessProfile,
  getWhatsAppConnectUrl,
  testWhatsAppConnection,
  type WhatsAppAccount,
  type WhatsAppBusinessProfile,
} from "@/lib/zernio/client";

export interface WhatsAppStatusResult {
  success: boolean;
  isConfigured: boolean;
  profileId: string;
  accounts: WhatsAppAccount[];
  businessProfiles?: Record<string, WhatsAppBusinessProfile>;
  error?: string;
}

export async function getWhatsAppStatusAction(
  profileIdOverride?: string
): Promise<WhatsAppStatusResult> {
  await requireActiveTeamMember();

  const accountsResult = await getWhatsAppAccounts(profileIdOverride);

  const businessProfiles: Record<string, WhatsAppBusinessProfile> = {};
  if (accountsResult.success && accountsResult.accounts.length > 0) {
    // Attempt to fetch business profile for each account
    await Promise.allSettled(
      accountsResult.accounts.map(async (acc) => {
        const bp = await getWhatsAppBusinessProfile(acc.accountId);
        if (bp.success && bp.profile) {
          businessProfiles[acc.accountId] = bp.profile;
        }
      })
    );
  }

  return {
    success: accountsResult.success,
    isConfigured: accountsResult.isConfigured,
    profileId: accountsResult.profileId,
    accounts: accountsResult.accounts,
    businessProfiles,
    error: accountsResult.error,
  };
}

export async function getWhatsAppConnectUrlAction(
  redirectUrl: string,
  profileIdOverride?: string
): Promise<{ success: boolean; authUrl?: string; error?: string }> {
  await requireActiveTeamMember();

  return getWhatsAppConnectUrl({
    redirectUrl,
    profileIdOverride,
    onboarding: "api",
  });
}

export async function getWhatsAppBusinessProfileAction(
  accountId: string
): Promise<{ success: boolean; profile?: WhatsAppBusinessProfile; error?: string }> {
  await requireActiveTeamMember();

  return getWhatsAppBusinessProfile(accountId);
}

export async function disconnectWhatsAppAction(
  accountId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  await requireActiveTeamMember();

  const result = await disconnectWhatsAppAccount(accountId);
  if (result.success) {
    revalidatePath("/settings");
  }
  return result;
}

export async function testWhatsAppConnectionAction(
  profileIdOverride?: string
): Promise<{
  success: boolean;
  isConfigured: boolean;
  profileId: string;
  accountCount: number;
  accounts: WhatsAppAccount[];
  latencyMs: number;
  error?: string;
}> {
  await requireActiveTeamMember();

  return testWhatsAppConnection(profileIdOverride);
}
