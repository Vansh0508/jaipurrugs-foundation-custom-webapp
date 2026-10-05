import { PartnersManager } from "@/components/admin/partners/partners-manager";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { data: partners } = await supabase.from("partners").select("*").order("name");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Partners</h1>
        <p className="text-sm text-muted">
          Agencies, booking platforms, government bodies and NGOs you work with. The dashboard reports which
          sectors are engaged.
        </p>
      </div>
      <PartnersManager partners={partners ?? []} />
    </div>
  );
}
