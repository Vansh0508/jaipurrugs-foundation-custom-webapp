import { VillagesManager } from "@/components/admin/villages/villages-manager";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function VillagesPage() {
  await requireActiveTeamMember();
  const supabase = await createClient();

  const [{ data: villages }, { data: experiences }] = await Promise.all([
    supabase.from("villages").select("*").order("name"),
    supabase.from("experiences").select("*").order("created_at"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Villages</h1>
        <p className="text-sm text-muted">
          The villages that host visits and the experiences guests can do in each one. Visits, the dashboard and
          the WhatsApp agent all read from here.
        </p>
      </div>
      <VillagesManager experiences={experiences ?? []} villages={villages ?? []} />
    </div>
  );
}
