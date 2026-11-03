import { FacilitatorsManager } from "@/components/admin/facilitators/facilitators-manager";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function FacilitatorsPage() {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { data: facilitators } = await supabase.from("facilitators").select("*").order("name");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Facilitators</h1>
        <p className="text-sm text-muted">
          The JRF team members who run visits. Pick one on a visit and their name and phone number are filled in
          for you.
        </p>
      </div>
      <FacilitatorsManager facilitators={facilitators ?? []} />
    </div>
  );
}
