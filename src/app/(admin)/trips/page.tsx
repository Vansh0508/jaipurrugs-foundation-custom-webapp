import { TripsView } from "@/components/admin/visits/trips-view";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { attachVisitRelations, loadVisitReference } from "@/lib/visits/queries";
import { todayIST } from "@/lib/visits/time";

export const dynamic = "force-dynamic";

const VISIT_LIMIT = 1000;

export default async function TripsPage() {
  await requireActiveTeamMember();
  const supabase = await createClient();

  const [{ data: visits }, reference] = await Promise.all([
    supabase
      .from("visits")
      .select("*")
      .order("visit_date", { ascending: false, nullsFirst: true })
      .order("start_time", { ascending: false, nullsFirst: false })
      .limit(VISIT_LIMIT),
    loadVisitReference(supabase),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Trips</h1>
        <p className="text-sm text-muted">
          Every visit — filter, edit, and manage who is coming. Guests are contacts from Leads, and the WhatsApp
          agent uses this to answer their questions and send the after-visit messages.
        </p>
      </div>
      <TripsView
        reference={reference}
        today={todayIST()}
        visits={await attachVisitRelations(supabase, visits ?? [])}
      />
    </div>
  );
}
