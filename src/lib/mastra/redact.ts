import { normalizePhone } from "@/lib/mastra/phone";

// The agent never sees the contact's phone number. Identity is resolved
// deterministically (normalize_phone → last 10 digits) by the server and
// captured in tool closures; anything that could echo the number back into
// the model's context — chat history, memory notes, form answers — passes
// through here first.

export const PHONE_PLACEHOLDER = "[contact's number]";

// A run of 8+ digits allowing the separators people type: +91 98765-43210, (0)98765 43210…
const PHONE_LIKE = /\(?\+?\d[\d\s().-]{6,}\d/g;

/** Replace any spelling of `phone` inside `text` with a placeholder. */
export function redactPhone(text: string, phone: string | null | undefined): string {
  const target = phone ? normalizePhone(phone) : null;
  if (!target || !text) return text;
  return text.replace(PHONE_LIKE, (match) => (normalizePhone(match) === target ? PHONE_PLACEHOLDER : match));
}
