"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveTeamMember } from "@/lib/auth/session";
import type { Enums } from "@/lib/types/supabase";

export type TeamActionState = { error?: string };

export async function addTeamMember(
  _prevState: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  await requireActiveTeamMember();

  const email = String(formData.get("email") ?? "").trim();
  // The "Add as active" Switch submits status=active only when checked (native
  // checkbox/switch semantics omit the field entirely when unchecked).
  const status: Enums<"team_member_status"> =
    formData.get("status") === "active" ? "active" : "inactive";

  if (!email) {
    return { error: "Email is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("team_members").insert({ email, status });

  if (error) {
    return {
      error: error.code === "23505" ? "That email is already in the list." : error.message,
    };
  }

  revalidatePath("/team");
  return {};
}

export async function setTeamMemberStatus(id: string, status: Enums<"team_member_status">) {
  await requireActiveTeamMember();

  const supabase = await createClient();
  const { error } = await supabase.from("team_members").update({ status }).eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/team");
}

// Hard delete, by design — see AGENTS.md §7 ("Remove" is a hard delete, not a
// status toggle). Deactivating remains available as the reversible action.
export async function removeTeamMember(id: string) {
  await requireActiveTeamMember();

  const supabase = await createClient();
  const { error } = await supabase.from("team_members").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/team");
}
