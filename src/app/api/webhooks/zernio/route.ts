import { after } from "next/server";
import { replyWithAgent } from "@/lib/inbox/agent-reply";
import { ingestZernioEvent, verifyZernioSignature } from "@/lib/inbox/ingest";
import { createAdminClient } from "@/lib/supabase/admin";

// Zernio inbox webhook (message.received / sent / delivered / read / failed).
// Route handlers are reserved for third-party callbacks like this one
// (AGENTS.md §5). No user session exists here, so it uses the service-role
// client — the signature check below is what authorizes the request.

// Agent replies run after the 200, but still inside this request's lifetime.
export const maxDuration = 120;

export async function POST(request: Request) {
  const secret = process.env.ZERNIO_WEBHOOK_SECRET?.trim();
  if (!secret) return new Response("Webhook secret not configured", { status: 503 });

  const rawBody = await request.text();
  if (!verifyZernioSignature(rawBody, request.headers.get("x-zernio-signature"), secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (payload.event === "webhook.test") return Response.json({ ok: true });

  const admin = createAdminClient();
  try {
    const result = await ingestZernioEvent(admin, payload);
    if (result?.replyTo) {
      const trigger = result.replyTo;
      after(() => replyWithAgent(admin, trigger));
    }
    return Response.json({ ok: true, duplicate: result === null });
  } catch (err) {
    console.error("[zernio webhook] processing failed", err);
    // Non-2xx makes Zernio retry the same event id.
    return new Response("Processing failed", { status: 500 });
  }
}
