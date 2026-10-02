import "server-only";

import {
  DEFAULT_ZERNIO_PROFILE_ID,
  type SendTemplateResult,
  type WhatsAppAccount,
  type WhatsAppBusinessProfile,
  type WhatsAppTemplate,
  type WhatsAppTemplateComponent,
  type ZernioConfig,
} from "./types";

export * from "./types";

const ZERNIO_BASE_URL = "https://zernio.com/api/v1";

export function getZernioConfig(profileIdOverride?: string): ZernioConfig {
  const apiKey = process.env.ZERNIO_API_KEY?.trim();
  const profileId =
    profileIdOverride?.trim() ||
    process.env.ZERNIO_PROFILE_ID?.trim() ||
    DEFAULT_ZERNIO_PROFILE_ID;

  return {
    apiKey,
    profileId,
    isConfigured: Boolean(apiKey && apiKey.length > 0),
  };
}

/**
 * Fetch all connected WhatsApp accounts for the given profile ID.
 */
export async function getWhatsAppAccounts(profileIdOverride?: string): Promise<{
  success: boolean;
  accounts: WhatsAppAccount[];
  profileId: string;
  isConfigured: boolean;
  error?: string;
}> {
  const config = getZernioConfig(profileIdOverride);

  if (!config.isConfigured || !config.apiKey) {
    return {
      success: false,
      accounts: [],
      profileId: config.profileId,
      isConfigured: false,
      error: "ZERNIO_API_KEY is not configured in .env.local.",
    };
  }

  try {
    const url = new URL(`${ZERNIO_BASE_URL}/accounts`);
    url.searchParams.set("profileId", config.profileId);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      let parsedError: string;
      try {
        const errorJson = JSON.parse(errorText);
        parsedError = errorJson.error || errorJson.message || `HTTP ${response.status}: ${response.statusText}`;
      } catch {
        parsedError = `HTTP ${response.status}: ${response.statusText}`;
      }

      return {
        success: false,
        accounts: [],
        profileId: config.profileId,
        isConfigured: true,
        error: parsedError,
      };
    }

    const data = await response.json();
    const rawList: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray(data.accounts)
      ? data.accounts
      : [];

    const accounts: WhatsAppAccount[] = rawList
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .filter((item) => String(item.platform).toLowerCase() === "whatsapp")
      .map((item) => ({
        accountId: String(item.accountId || item._id || item.id || ""),
        _id: item._id ? String(item._id) : undefined,
        platform: "whatsapp",
        username: item.username ? String(item.username) : undefined,
        displayName: item.displayName ? String(item.displayName) : undefined,
        status: item.status ? String(item.status) : item.isActive ? "active" : undefined,
        isActive: Boolean(item.isActive ?? (item.status === "active")),
        phoneNumber: item.phoneNumber ? String(item.phoneNumber) : (item.username ? String(item.username) : undefined),
        verifiedName: item.verifiedName ? String(item.verifiedName) : undefined,
        qualityRating: item.qualityRating ? String(item.qualityRating) : undefined,
        canPost: typeof item.canPost === "boolean" ? item.canPost : undefined,
        canFetchAnalytics: typeof item.canFetchAnalytics === "boolean" ? item.canFetchAnalytics : undefined,
        tokenValid: typeof item.tokenValid === "boolean" ? item.tokenValid : undefined,
        needsReconnect: typeof item.needsReconnect === "boolean" ? item.needsReconnect : undefined,
        issues: Array.isArray(item.issues) ? item.issues.map(String) : undefined,
        wabaId: item.wabaId ? String(item.wabaId) : undefined,
        metadata: typeof item.metadata === "object" && item.metadata !== null ? (item.metadata as Record<string, unknown>) : undefined,
      }));

    return {
      success: true,
      accounts,
      profileId: config.profileId,
      isConfigured: true,
    };
  } catch (err) {
    return {
      success: false,
      accounts: [],
      profileId: config.profileId,
      isConfigured: true,
      error: err instanceof Error ? err.message : "Failed to connect to Zernio API",
    };
  }
}

/**
 * Generate a Zernio Embedded Signup / OAuth URL to connect WhatsApp.
 */
export async function getWhatsAppConnectUrl(params: {
  redirectUrl: string;
  profileIdOverride?: string;
  onboarding?: "api" | "business_app";
}): Promise<{
  success: boolean;
  authUrl?: string;
  error?: string;
}> {
  const config = getZernioConfig(params.profileIdOverride);

  if (!config.isConfigured || !config.apiKey) {
    return {
      success: false,
      error: "ZERNIO_API_KEY is not configured in .env.local.",
    };
  }

  try {
    const url = new URL(`${ZERNIO_BASE_URL}/connect/whatsapp`);
    url.searchParams.set("profileId", config.profileId);
    url.searchParams.set("redirect_url", params.redirectUrl);
    url.searchParams.set("onboarding", params.onboarding || "api");
    url.searchParams.set("signup", "hosted");

    let response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok && response.status === 400) {
      url.searchParams.delete("signup");
      response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      let parsedError: string;
      try {
        const errorJson = JSON.parse(errorText);
        parsedError = errorJson.error || errorJson.message || `HTTP ${response.status}: ${response.statusText}`;
      } catch {
        parsedError = `HTTP ${response.status}: ${response.statusText}`;
      }
      return { success: false, error: parsedError };
    }

    const data = await response.json();
    const authUrl = data.authUrl || (data.data && data.data.authUrl);

    if (!authUrl) {
      return { success: false, error: "Zernio did not return an authUrl in response." };
    }

    return { success: true, authUrl };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to retrieve connect URL from Zernio.",
    };
  }
}

/**
 * Fetch WhatsApp Business Profile for a connected account.
 */
export async function getWhatsAppBusinessProfile(
  accountId: string
): Promise<{
  success: boolean;
  profile?: WhatsAppBusinessProfile;
  error?: string;
}> {
  const config = getZernioConfig();

  if (!config.isConfigured || !config.apiKey) {
    return {
      success: false,
      error: "ZERNIO_API_KEY is not configured.",
    };
  }

  try {
    const url = new URL(`${ZERNIO_BASE_URL}/whatsapp/business-profile`);
    url.searchParams.set("accountId", accountId);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    const profile = data.businessProfile || data;
    return {
      success: true,
      profile: {
        about: profile.about,
        address: profile.address,
        description: profile.description,
        email: profile.email,
        profilePictureUrl: profile.profilePictureUrl,
        websites: Array.isArray(profile.websites) ? profile.websites : undefined,
        vertical: profile.vertical,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to get business profile",
    };
  }
}

/**
 * Disconnect an account from Zernio.
 */
export async function disconnectWhatsAppAccount(
  accountId: string
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const config = getZernioConfig();

  if (!config.isConfigured || !config.apiKey) {
    return {
      success: false,
      error: "ZERNIO_API_KEY is not configured.",
    };
  }

  try {
    const response = await fetch(`${ZERNIO_BASE_URL}/accounts/${accountId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let parsedError: string;
      try {
        const errorJson = JSON.parse(errorText);
        parsedError = errorJson.error || errorJson.message || `HTTP ${response.status}`;
      } catch {
        parsedError = `HTTP ${response.status}: ${response.statusText}`;
      }
      return { success: false, error: parsedError };
    }

    return { success: true, message: "WhatsApp account disconnected successfully from Zernio profile." };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to disconnect account",
    };
  }
}

/**
 * Run a diagnostic health check against Zernio.
 */
export async function testWhatsAppConnection(profileIdOverride?: string): Promise<{
  success: boolean;
  isConfigured: boolean;
  profileId: string;
  accountCount: number;
  accounts: WhatsAppAccount[];
  latencyMs: number;
  error?: string;
}> {
  const startTime = Date.now();
  const accountsResult = await getWhatsAppAccounts(profileIdOverride);
  const latencyMs = Date.now() - startTime;

  return {
    success: accountsResult.success,
    isConfigured: accountsResult.isConfigured,
    profileId: accountsResult.profileId,
    accountCount: accountsResult.accounts.length,
    accounts: accountsResult.accounts,
    latencyMs,
    error: accountsResult.error,
  };
}

async function readZernioError(response: Response): Promise<string> {
  const errorText = await response.text();
  try {
    const errorJson = JSON.parse(errorText);
    return errorJson.error || errorJson.message || `HTTP ${response.status}: ${response.statusText}`;
  } catch {
    return `HTTP ${response.status}: ${response.statusText}`;
  }
}

/**
 * List message templates for the WABA behind a connected WhatsApp account.
 * See https://docs.zernio.com/whatsapp/get-whatsapp-templates
 */
export async function listWhatsAppTemplates(
  accountId: string,
  options: { status?: "APPROVED" | "PENDING" | "REJECTED" } = {}
): Promise<{ success: boolean; templates: WhatsAppTemplate[]; error?: string }> {
  const config = getZernioConfig();

  if (!config.isConfigured || !config.apiKey) {
    return { success: false, templates: [], error: "ZERNIO_API_KEY is not configured." };
  }

  try {
    const url = new URL(`${ZERNIO_BASE_URL}/whatsapp/templates`);
    url.searchParams.set("accountId", accountId);
    if (options.status) url.searchParams.set("status", options.status);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return { success: false, templates: [], error: await readZernioError(response) };
    }

    const data = await response.json();
    const rawList: unknown[] = Array.isArray(data.templates) ? data.templates : [];

    const templates: WhatsAppTemplate[] = rawList
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => ({
        id: String(item.id ?? ""),
        name: String(item.name ?? ""),
        status: String(item.status ?? ""),
        category: String(item.category ?? ""),
        language: String(item.language ?? ""),
        components: Array.isArray(item.components)
          ? (item.components as WhatsAppTemplateComponent[])
          : [],
      }));

    return { success: true, templates };
  } catch (err) {
    return {
      success: false,
      templates: [],
      error: err instanceof Error ? err.message : "Failed to list WhatsApp templates",
    };
  }
}

/**
 * Send an approved template to one phone number. Zernio opens (or reuses) the
 * inbox conversation with that recipient. `participantId` is digits with the
 * country code and no "+".
 * See https://docs.zernio.com/messages/create-inbox-conversation
 */
export async function sendWhatsAppTemplate(params: {
  accountId: string;
  participantId: string;
  templateName: string;
  templateLanguage: string;
  templateParams: string[];
}): Promise<SendTemplateResult> {
  const config = getZernioConfig();

  if (!config.isConfigured || !config.apiKey) {
    return { success: false, error: "ZERNIO_API_KEY is not configured." };
  }

  try {
    const response = await fetch(`${ZERNIO_BASE_URL}/inbox/conversations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accountId: params.accountId,
        participantId: params.participantId,
        templateName: params.templateName,
        templateLanguage: params.templateLanguage,
        templateParams: params.templateParams,
      }),
    });

    if (!response.ok) {
      return { success: false, error: await readZernioError(response) };
    }

    const data = await response.json();
    const payload = data.data ?? data;
    return {
      success: true,
      conversationId: payload.conversationId ? String(payload.conversationId) : undefined,
      messageId: payload.messageId ? String(payload.messageId) : undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send WhatsApp template",
    };
  }
}
