export const DEFAULT_ZERNIO_PROFILE_ID = "6aaa747b9976e663f696878f";

export interface WhatsAppAccount {
  accountId: string;
  _id?: string;
  platform: string;
  username?: string;
  displayName?: string;
  status?: string;
  isActive?: boolean;
  phoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  canPost?: boolean;
  canFetchAnalytics?: boolean;
  tokenValid?: boolean;
  needsReconnect?: boolean;
  issues?: string[];
  wabaId?: string;
  metadata?: Record<string, unknown>;
}

export interface WhatsAppBusinessProfile {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profilePictureUrl?: string;
  websites?: string[];
  vertical?: string;
}

export interface ZernioConfig {
  apiKey?: string;
  profileId: string;
  isConfigured: boolean;
}

export interface WhatsAppTemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: { type: string; text?: string; url?: string }[];
  [key: string]: unknown;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | string;
  category: string;
  language: string;
  components: WhatsAppTemplateComponent[];
}

export interface SendTemplateResult {
  success: boolean;
  conversationId?: string;
  messageId?: string;
  error?: string;
}
