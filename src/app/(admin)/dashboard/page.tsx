import { DashboardView } from "@/components/admin/dashboard/dashboard-view";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { parseDashboardStats, resolveDashboardRange, type DashboardRangeId } from "@/lib/visits/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireActiveTeamMember();
  const range = resolveDashboardRange((await searchParams).range);
  const supabase = await createClient();

  const [{ data, error }, { data: feedback }] = await Promise.all([
    supabase.rpc("dashboard_stats", { p_from: range.from, p_to: range.to }),
    supabase.rpc("dashboard_feedback_stats", { p_from: range.from, p_to: range.to }),
  ]);
  const stats = error ? null : parseDashboardStats(data, feedback);

  if (!stats) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-danger">The dashboard numbers could not be loaded. Try refreshing the page.</p>
      </div>
    );
  }

  return (
    <DashboardView
      from={range.from}
      rangeId={range.id as DashboardRangeId}
      rangeLabel={range.label}
      stats={stats}
      to={range.to}
    />
  );
}
