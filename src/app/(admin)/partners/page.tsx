import { PartnersManager } from "@/components/admin/partners/partners-manager";
import { PartnersTabs } from "@/components/admin/partners/partners-tabs";
import { ReviewsPanel } from "@/components/admin/partners/reviews-panel";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const [{ data: partners }, { data: reviews }] = await Promise.all([
    supabase.from("partners").select("*").order("name"),
    supabase
      .from("reviews")
      .select("*")
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Partners</h1>
        <p className="text-sm text-muted">
          Agencies, booking platforms, government bodies and NGOs you work with. The dashboard reports which
          sectors are engaged.
        </p>
      </div>
      <PartnersTabs
        partners={<PartnersManager partners={partners ?? []} />}
        reviews={<ReviewsPanel reviews={reviews ?? []} />}
      />
    </div>
  );
}
