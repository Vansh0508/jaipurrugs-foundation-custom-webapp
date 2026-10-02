// Phone helpers shared by the agent tools and the workbench UI. normalizePhone
// mirrors public.normalize_phone() in supabase/migrations/20261002140000 — keep
// the two in sync, since the SQL version is what actually scopes submissions.

const DEFAULT_COUNTRY_CODE = "91";

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Last 10 digits, or null for anything under 8 digits (never matches). */
export function normalizePhone(phone: string): string | null {
  const digits = phoneDigits(phone);
  return digits.length >= 8 ? digits.slice(-10) : null;
}

/**
 * Zernio's `participantId` for WhatsApp: digits with country code, no "+".
 * Bare 10-digit numbers (and 0-prefixed trunk dialing) are assumed Indian.
 */
export function toWhatsAppParticipantId(phone: string): string | null {
  const digits = phoneDigits(phone);
  if (digits.length === 10) return `${DEFAULT_COUNTRY_CODE}${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) {
    return `${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  }
  return digits.length >= 11 ? digits : null;
}

export function formatPhone(phone: string): string {
  const participantId = toWhatsAppParticipantId(phone);
  if (!participantId) return phone;
  const national = participantId.slice(-10);
  const country = participantId.slice(0, -10);
  return `+${country} ${national.slice(0, 5)} ${national.slice(5)}`;
}
