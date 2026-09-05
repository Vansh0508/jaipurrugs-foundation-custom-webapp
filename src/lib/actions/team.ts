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

  if (PROTECTED_IDS.includes(id)) {
    throw new Error("This team member is protected and cannot be modified.");
  }

  const supabase = await createClient();

  const { data: member } = await supabase
    .from("team_members")
    .select("email")
    .eq("id", id)
    .single();

  if (member && isProtectedTeamMember(member)) {
    throw new Error("This team member is protected and cannot be modified.");
  }

  const { error } = await supabase.from("team_members").update({ status }).eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/team");
}

const PROTECTED_EMAILS = ["vansh.g@pixxeldigital.com"];
const PROTECTED_IDS = ["d1d2a4df-2d8a-4719-a3da-4c68f3a1b724"];

function isProtectedTeamMember(member: { id?: string; email?: string | null }): boolean {
  if (member.id && PROTECTED_IDS.includes(member.id)) return true;
  if (member.email && PROTECTED_EMAILS.includes(member.email.toLowerCase())) return true;
  return false;
}

// Hard delete, by design — see AGENTS.md §7 ("Remove" is a hard delete, not a
// status toggle). Deactivating remains available as the reversible action.
export async function removeTeamMember(id: string) {
  await requireActiveTeamMember();

  if (PROTECTED_IDS.includes(id)) {
    throw new Error("This user is protected and cannot be removed.");
  }

  const supabase = await createClient();

  const { data: member } = await supabase
    .from("team_members")
    .select("email")
    .eq("id", id)
    .single();

  if (member && isProtectedTeamMember(member)) {
    throw new Error("This user is protected and cannot be removed.");
  }

  const { error } = await supabase.from("team_members").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/team");
}
