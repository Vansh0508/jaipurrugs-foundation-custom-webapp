import { requireActiveTeamMember } from "@/lib/auth/session";
import { listTemplatesAction } from "@/lib/actions/templates";
import { createClient } from "@/lib/supabase/server";
import { TemplatesManager } from "@/components/admin/templates/templates-manager";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const [overview, { data: attributes }] = await Promise.all([
    listTemplatesAction(),
    supabase.from("lead_attributes").select("*").order("created_at"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">WhatsApp Templates</h1>
        <p className="text-sm text-muted">
          Message templates approved by Meta, sent through Zernio
          {overview.accountLabel ? ` from ${overview.accountLabel}` : ""}. Each variable is filled from the
          contact&apos;s lead details when the AI agent sends it.
        </p>
      </div>
      <TemplatesManager attributes={attributes ?? []} overview={overview} />
    </div>
  );
}
