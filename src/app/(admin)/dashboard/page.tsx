import { DashboardView } from "@/components/admin/dashboard/dashboard-view";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  dashboardRpcArgs,
  parseDashboardStats,
  resolveDashboardFilters,
  type DashboardSearchParams,
} from "@/lib/visits/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  await requireActiveTeamMember();
  const filters = resolveDashboardFilters(await searchParams);
  const args = dashboardRpcArgs(filters);
  const supabase = await createClient();

  const [{ data, error }, { data: feedback }, { data: villages }] = await Promise.all([
    supabase.rpc("dashboard_stats", args),
    supabase.rpc("dashboard_feedback_stats", args),
    supabase.from("villages").select("id, name").order("name"),
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

  return <DashboardView filters={filters} stats={stats} villages={villages ?? []} />;
}
