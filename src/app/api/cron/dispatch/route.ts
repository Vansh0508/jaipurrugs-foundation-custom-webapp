import { createHash, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { dispatchDueSends } from "@/lib/scheduler/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";

// Called every few minutes by pg_cron (through pg_net) with `Authorization: Bearer $CRON_SECRET`.
// Not a browser endpoint and not a webhook: it only ever sends the visit messages that are due.
// All logic lives in src/lib/scheduler; this file only authenticates and hands off.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

// Hash both sides so the comparison is constant-time even when the lengths differ.
function isAuthorized(authorization: string | null, secret: string) {
  const provided = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Answer straight away (pg_net doesn't need the result) and do the sending after the response.
  after(async () => {
    try {
      const summary = await dispatchDueSends(createAdminClient());
      console.log("[cron/dispatch]", JSON.stringify(summary));
    } catch (err) {
      console.error("[cron/dispatch] failed:", err);
    }
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
