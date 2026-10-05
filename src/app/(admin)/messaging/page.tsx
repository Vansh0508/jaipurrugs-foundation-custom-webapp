import { MessagingManager } from "@/components/admin/messaging/messaging-manager";
import type { RuleSetRow } from "@/components/admin/messaging/sequences-panel";
import { StatCard } from "@/components/admin/visits/stat-card";
import { listRuleTemplates } from "@/lib/actions/messaging";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export default async function MessagingPage() {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const weekAgo = daysAgoIso(7);

  const [{ data: sets }, { data: settings }, templates, queued, sent, attention] = await Promise.all([
    supabase.from("message_rule_sets").select("*, message_rule_set_items(*)").order("name"),
    supabase.from("visit_settings").select("*").maybeSingle(),
    listRuleTemplates(),
    supabase.from("scheduled_whatsapp_sends").select("id", { count: "exact", head: true }).eq("status", "queued"),
    supabase.from("scheduled_whatsapp_sends").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", weekAgo),
    supabase.from("scheduled_whatsapp_sends").select("id", { count: "exact", head: true }).in("status", ["failed", "unknown"]),
  ]);

  const rows: RuleSetRow[] = (sets ?? []).map((set) => ({
    id: set.id,
    name: set.name,
    description: set.description,
    visit_type: set.visit_type,
    is_active: set.is_active,
    items: [...(set.message_rule_set_items ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));

  const live = settings?.sends_enabled && !settings.dry_run;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Visit messages</h1>
        <p className="text-sm text-muted">
          WhatsApp messages sent to a visit&apos;s guests on a schedule — reminders before, a thank-you and feedback link after.
          Status:{" "}
          <strong>{!settings?.sends_enabled ? "off (nothing is sent)" : settings.dry_run ? "dry run (nothing is sent)" : "live"}</strong>
          .
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Scheduled" value={queued.count ?? 0} hint="waiting to send" />
        <StatCard label="Sent" value={sent.count ?? 0} hint="last 7 days" />
        <StatCard label="Needs attention" value={attention.count ?? 0} hint="failed or unchecked" />
        <StatCard label="Mode" value={live ? "Live" : settings?.sends_enabled ? "Dry run" : "Off"} />
      </div>

      <MessagingManager
        sets={rows}
        settings={
          settings ?? {
            sends_enabled: false,
            dry_run: true,
            auto_complete_after_hours: 6,
            quiet_start: "23:00",
            quiet_end: "08:00",
            expiry_days: 7,
          }
        }
        templates={templates.templates}
        templatesError={templates.error}
      />
    </div>
  );
}
