// WhatsApp's customer-service window: after a contact's last inbound
// message, the business may send free-form messages for 24 hours. Outside
// that window (or before the contact has ever written) only approved
// templates can be sent. Meta enforces this; we mirror it so the UI and the
// agent never attempt a send Meta will reject.

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ServiceWindow {
  open: boolean;
  /** ISO time the window closes, or null if the contact never wrote. */
  expiresAt: string | null;
  remainingMs: number;
}

export function serviceWindow(lastInboundAt: string | null | undefined, now = Date.now()): ServiceWindow {
  if (!lastInboundAt) return { open: false, expiresAt: null, remainingMs: 0 };
  const expires = new Date(lastInboundAt).getTime() + SERVICE_WINDOW_MS;
  return {
    open: now < expires,
    expiresAt: new Date(expires).toISOString(),
    remainingMs: Math.max(0, expires - now),
  };
}

export function formatRemaining(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours >= 1) return `${hours}h ${minutes % 60}m`;
  return `${Math.max(1, minutes)}m`;
}
