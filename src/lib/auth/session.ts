import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Never trust getSession() for authorization — see AGENTS.md §7. getClaims()
// validates the JWT signature every time.
export async function getCurrentUserEmail() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.email as string | undefined) ?? null;
}

// Defense in depth for Server Actions/pages called directly — proxy.ts already
// gates page navigation, but a Server Action can be invoked without going
// through a page render, so mutations must re-check independently. RLS is
// still the real boundary; this just gives a clean redirect instead of a
// raw Postgres permission error.
export async function requireActiveTeamMember() {
  const email = await getCurrentUserEmail();
  if (!email) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("team_members")
    .select("status")
    .ilike("email", email)
    .maybeSingle();

  if (!member || member.status !== "active") {
    redirect("/auth/blocked");
  }

  return { email };
}
