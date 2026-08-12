import { createClient } from "@/lib/supabase/server";
import { AddTeamMemberForm } from "@/components/admin/add-team-member-form";
import { TeamMembersTable } from "@/components/admin/team-members-table";

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("team_members")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">Team</h1>
        <AddTeamMemberForm />
      </div>
      <TeamMembersTable members={members ?? []} />
    </div>
  );
}
