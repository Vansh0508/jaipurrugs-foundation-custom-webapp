import { TripsView } from "@/components/admin/visits/trips-view";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { attachVisitRelations, loadVisitReference } from "@/lib/visits/queries";
import { MONTH_PATTERN, currentMonthIST, todayIST } from "@/lib/visits/time";

export const dynamic = "force-dynamic";

const VISIT_LIMIT = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string; visit?: string }>;
}) {
  await requireActiveTeamMember();
  const params = await searchParams;
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

  const visitId = params.visit && UUID_PATTERN.test(params.visit) ? params.visit : null;
  const linkedVisit = visitId ? visits?.find((v) => v.id === visitId) : undefined;
  // A linked visit opens on the calendar, at its own month.
  const month =
    params.month && MONTH_PATTERN.test(params.month)
      ? params.month
      : (linkedVisit?.visit_date?.slice(0, 7) ?? currentMonthIST());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Trips</h1>
        <p className="text-sm text-muted">
          Every visit, on a calendar or in a grid. Click a visit for its details; guests are contacts from Leads,
          and the WhatsApp agent uses this to answer their questions and send the after-visit messages.
        </p>
      </div>
      <TripsView
        initialMonth={month}
        initialView={params.view === "calendar" ? "calendar" : "grid"}
        initialVisitId={linkedVisit ? linkedVisit.id : null}
        reference={reference}
        today={todayIST()}
        visits={await attachVisitRelations(supabase, visits ?? [])}
      />
    </div>
  );
}
