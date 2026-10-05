import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toWhatsAppParticipantId } from "@/lib/mastra/phone";
import type { Database, Json, Tables } from "@/lib/types/supabase";
import {
  bindingsUseVisitFields,
  parseBindings,
  resolveTemplateParams,
  type TemplateVariableBinding,
} from "@/lib/whatsapp/bindings";
import { renderTemplatePreview, summarizeTemplate, type TemplateSummary } from "@/lib/whatsapp/templates";
import type { VisitContext } from "@/lib/whatsapp/visit-fields";
import { getPrimaryWhatsAppAccount } from "@/lib/zernio/account";
import { listWhatsAppTemplates, sendWhatsAppTemplate } from "@/lib/zernio/client";
import { recordSystemTemplate } from "./mirror";

type Admin = SupabaseClient<Database>;
type SendRow = Tables<"scheduled_whatsapp_sends">;

export interface DispatchSummary {
  /** False when nothing was processed at all (kill switch off, or the claim failed). */
  ran: boolean;
  reason?: string;
  claimed: number;
  sent: number;
  dryRun: number;
  skipped: number;
  cancelled: number;
  failed: number;
  unknown: number;
  requeued: number;
}

const MAX_ATTEMPTS = 4;
const CONCURRENCY = 4;
// Keeps one tick comfortably inside the 5-minute cron interval.
const DEFAULT_LIMIT = 20;

function emptySummary(ran: boolean, reason?: string): DispatchSummary {
  return { ran, reason, claimed: 0, sent: 0, dryRun: 0, skipped: 0, cancelled: 0, failed: 0, unknown: 0, requeued: 0 };
}

/** 2, 4, 8 … minutes, capped at an hour. */
function backoffMinutes(attempts: number) {
  return Math.min(2 ** Math.max(attempts, 1), 60);
}

interface Env {
  admin: Admin;
  dryRun: boolean;
  account: () => Promise<{ id: string } | null>;
  templates: (accountId: string) => Promise<{ summary: TemplateSummary; bindings: TemplateVariableBinding[] }[]>;
  attributes: () => Promise<Tables<"lead_attributes">[]>;
}

function createEnv(admin: Admin, dryRun: boolean): Env {
  let accountPromise: Promise<{ id: string } | null> | null = null;
  let templatesPromise: ReturnType<Env["templates"]> | null = null;
  let attributesPromise: Promise<Tables<"lead_attributes">[]> | null = null;

  return {
    admin,
    dryRun,
    account: () =>
      (accountPromise ??= getPrimaryWhatsAppAccount().then((r) => (r.account ? { id: r.account.accountId } : null))),
    templates: (accountId) =>
      (templatesPromise ??= (async () => {
        const [list, { data: bindingRows }] = await Promise.all([
          listWhatsAppTemplates(accountId, { status: "APPROVED" }),
          admin.from("whatsapp_template_bindings").select("template_name, language, variables"),
        ]);
        if (!list.success) throw new Error(list.error ?? "Could not load templates.");
        return list.templates
          .filter((t) => t.status === "APPROVED")
          .map((t) => ({
            summary: summarizeTemplate(t),
            bindings: parseBindings(
              (bindingRows ?? []).find((b) => b.template_name === t.name && b.language === t.language)?.variables,
            ),
          }));
      })()),
    attributes: () =>
      (attributesPromise ??= (async () => {
        const { data } = await admin.from("lead_attributes").select("*");
        return data ?? [];
      })()),
  };
}

type Outcome = keyof Omit<DispatchSummary, "ran" | "reason" | "claimed">;

async function finalize(env: Env, row: SendRow, patch: Partial<SendRow>, outcome: Outcome): Promise<Outcome> {
  await env.admin
    .from("scheduled_whatsapp_sends")
    .update({ claimed_at: null, ...patch })
    .eq("id", row.id);
  return outcome;
}

async function processRow(env: Env, row: SendRow): Promise<Outcome> {
  const { admin } = env;

  const [{ data: rule }, { data: guest }] = await Promise.all([
    admin.from("visit_message_rules").select("*").eq("id", row.rule_id).maybeSingle(),
    admin
      .from("visit_guests")
      .select("id, status, feedback_token, lead:leads(id, name, phone, attributes, whatsapp_opt_out), visit:visits(*)")
      .eq("id", row.visit_guest_id)
      .maybeSingle(),
  ]);

  // Re-check everything at send time: the world may have changed since the row was queued.
  if (!rule || !rule.enabled) {
    return finalize(env, row, { status: "cancelled", last_error: "rule removed or disabled" }, "cancelled");
  }
  const lead = Array.isArray(guest?.lead) ? guest?.lead[0] : guest?.lead;
  const visit = Array.isArray(guest?.visit) ? guest?.visit[0] : guest?.visit;
  if (!guest || !lead || !visit) {
    return finalize(env, row, { status: "cancelled", last_error: "guest or visit removed" }, "cancelled");
  }
  if (visit.status === "cancelled" || guest.status === "no_show") {
    return finalize(env, row, { status: "cancelled", last_error: "visit cancelled or guest did not attend" }, "cancelled");
  }
  if (lead.whatsapp_opt_out) {
    return finalize(env, row, { status: "skipped", last_error: "opted_out" }, "skipped");
  }
  const participantId = toWhatsAppParticipantId(lead.phone);
  if (!participantId) {
    return finalize(env, row, { status: "skipped", last_error: "no usable phone number" }, "skipped");
  }

  const account = await env.account();
  if (!account) {
    return finalize(env, row, { status: "failed", last_error: "No WhatsApp account is connected.", error_class: "definite" }, "failed");
  }

  let templates: Awaited<ReturnType<Env["templates"]>>;
  try {
    templates = await env.templates(account.id);
  } catch (err) {
    // Couldn't even list templates: nothing was sent, so it is safe to try again later.
    return requeue(env, row, err instanceof Error ? err.message : "Could not load templates.");
  }
  const template = templates.find(
    (t) => t.summary.name === rule.template_name && t.summary.language === rule.template_language,
  );
  if (!template) {
    return finalize(
      env,
      row,
      { status: "failed", last_error: `Template "${rule.template_name}" (${rule.template_language}) isn't approved.`, error_class: "definite" },
      "failed",
    );
  }

  if (bindingsUseVisitFields(template.bindings) && template.bindings.some((b) => b.field === "visit:feedback_token") && !visit.feedback_form_id) {
    return finalize(env, row, { status: "skipped", last_error: "no_feedback_form" }, "skipped");
  }

  const [{ data: villageRows }, { data: experienceRows }, attributes] = await Promise.all([
    admin.from("visit_villages").select("villages(name)").eq("visit_id", visit.id),
    admin.from("visit_experiences").select("experiences(name)").eq("visit_id", visit.id),
    env.attributes(),
  ]);
  const names = (rows: { [k: string]: unknown }[] | null, key: string) =>
    (rows ?? [])
      .map((r) => {
        const v = r[key] as { name: string } | { name: string }[] | null;
        return Array.isArray(v) ? v[0]?.name : v?.name;
      })
      .filter((n): n is string => Boolean(n))
      .sort();

  const visitContext: VisitContext = {
    visit_type: visit.visit_type,
    visit_date: visit.visit_date,
    start_time: visit.start_time,
    end_time: visit.end_time,
    poc_name: visit.poc_name,
    village_names: names(villageRows, "villages"),
    experience_names: names(experienceRows, "experiences"),
    feedback_token: guest.feedback_token,
  };

  const resolved = resolveTemplateParams(
    template.summary,
    template.bindings,
    { name: lead.name, phone: lead.phone, attributes: lead.attributes },
    attributes,
    visitContext,
  );
  if (!resolved.ok) {
    const why =
      resolved.unbound.length > 0
        ? `template variables aren't set up (${resolved.unbound.join(", ")})`
        : `missing: ${resolved.missing.map((m) => m.label).join(", ")}`;
    return finalize(env, row, { status: "skipped", last_error: why }, "skipped");
  }

  const params = resolved.params;
  const preview = renderTemplatePreview(template.summary, params);

  if (env.dryRun) {
    return finalize(
      env,
      row,
      { status: "dry_run", last_error: null, params_sent: { params, preview } as unknown as Json },
      "dryRun",
    );
  }

  // Mark the point of no return. A crash after this leaves the row 'processing' with send_started_at
  // set, which the claim function reconciles against the inbox instead of retrying blindly.
  const { data: started } = await admin
    .from("scheduled_whatsapp_sends")
    .update({ send_started_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "processing")
    .select("id");
  if (!started || started.length === 0) return "skipped";

  const result = await sendWhatsAppTemplate({
    accountId: account.id,
    participantId,
    templateName: rule.template_name,
    templateLanguage: rule.template_language,
    templateParams: params,
    idempotencyKey: row.id,
  });

  if (result.success) {
    try {
      await recordSystemTemplate(admin, {
        accountId: account.id,
        lead: { id: lead.id, name: lead.name, phone: lead.phone },
        zernioConversationId: result.conversationId,
        platformMessageId: result.messageId,
        templateName: rule.template_name,
        language: rule.template_language,
        preview,
      });
    } catch (err) {
      // The message is already sent; failing to mirror it must not turn it into a retry.
      console.error("[scheduler] could not mirror the sent template into the inbox:", err);
    }
    return finalize(
      env,
      row,
      {
        status: "sent",
        sent_at: new Date().toISOString(),
        last_error: null,
        error_class: null,
        platform_message_id: result.messageId ?? null,
        zernio_conversation_id: result.conversationId ?? null,
        params_sent: { params, preview } as unknown as Json,
      },
      "sent",
    );
  }

  // Failure. Only an explicit HTTP rejection is "definite"; no answer, or a 5xx, may still have been delivered.
  if (result.ambiguous || (result.status !== undefined && result.status >= 500)) {
    return finalize(
      env,
      row,
      { status: "unknown", last_error: result.error ?? "No answer from WhatsApp", error_class: "ambiguous", sent_at: new Date().toISOString() },
      "unknown",
    );
  }
  if (result.status === 429) {
    return requeue(env, row, result.error ?? "Rate limited", "rate_limited");
  }
  return finalize(
    env,
    row,
    { status: "failed", last_error: result.error ?? "WhatsApp rejected the message", error_class: "definite" },
    "failed",
  );
}

async function requeue(
  env: Env,
  row: SendRow,
  error: string,
  errorClass: "rate_limited" | null = null,
): Promise<Outcome> {
  if (row.attempts >= MAX_ATTEMPTS) {
    return finalize(env, row, { status: "failed", last_error: `${error} (gave up after ${row.attempts} attempts)`, error_class: errorClass }, "failed");
  }
  const next = new Date(Date.now() + backoffMinutes(row.attempts) * 60_000).toISOString();
  return finalize(
    env,
    row,
    { status: "queued", run_at: next, send_started_at: null, last_error: error, error_class: errorClass },
    "requeued",
  );
}

/**
 * Sends everything that is due. Called by the cron route; safe to call concurrently
 * (rows are claimed with FOR UPDATE SKIP LOCKED).
 */
export async function dispatchDueSends(admin: Admin, options: { limit?: number } = {}): Promise<DispatchSummary> {
  const { data: settings } = await admin.from("visit_settings").select("sends_enabled, dry_run").maybeSingle();
  if (!settings?.sends_enabled) return emptySummary(false, "sends_disabled");

  const { data: claimed, error } = await admin.rpc("claim_scheduled_sends", { p_limit: options.limit ?? DEFAULT_LIMIT });
  if (error) {
    console.error("[scheduler] claim failed:", error.message);
    return emptySummary(false, "claim_failed");
  }

  const rows = claimed ?? [];
  const summary = emptySummary(true);
  summary.claimed = rows.length;
  const env = createEnv(admin, settings.dry_run);

  let next = 0;
  async function worker() {
    while (next < rows.length) {
      const row = rows[next++];
      let outcome: Outcome;
      try {
        outcome = await processRow(env, row);
      } catch (err) {
        // Unexpected: leave the row for the stale-claim reaper rather than guessing at its state.
        console.error("[scheduler] unexpected error processing", row.id, err);
        outcome = "failed";
      }
      summary[outcome] += 1;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
  return summary;
}
