import { CalendarView } from "@/components/admin/visits/calendar-view";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { attachVisitRelations, loadVisitReference } from "@/lib/visits/queries";
import { monthGrid, parseMonth, todayIST } from "@/lib/visits/time";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireActiveTeamMember();
  const month = parseMonth((await searchParams).month);
  const { from, to } = monthGrid(month);
  const supabase = await createClient();

  const [{ data: visits }, reference] = await Promise.all([
    supabase.from("visits").select("*").gte("visit_date", from).lte("visit_date", to).order("start_time"),
    loadVisitReference(supabase),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Calendar</h1>
        <p className="text-sm text-muted">A month at a glance. Click a day to see its visits, guests and actions.</p>
      </div>
      <CalendarView
        month={month}
        reference={reference}
        today={todayIST()}
        visits={await attachVisitRelations(supabase, visits ?? [])}
      />
    </div>
  );
}
