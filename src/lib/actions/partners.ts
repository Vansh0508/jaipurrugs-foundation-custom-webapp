"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { blankToNull, partnerSchema, type PartnerInput } from "@/lib/visits/schemas";

export type PartnerActionResult = { error?: string };

function revalidatePartners() {
  revalidatePath("/partners");
  revalidatePath("/dashboard");
}

function partnerRow(data: ReturnType<typeof partnerSchema.parse>) {
  return {
    name: data.name,
    sector: data.sector,
    partner_type: blankToNull(data.partnerType),
    notes: blankToNull(data.notes),
  };
}

export async function createPartner(input: PartnerInput): Promise<PartnerActionResult> {
  const { email } = await requireActiveTeamMember();
  const parsed = partnerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid partner." };

  const supabase = await createClient();
  const { error } = await supabase.from("partners").insert({ ...partnerRow(parsed.data), created_by: email });
  if (error) {
    return { error: error.code === "23505" ? "A partner with that name already exists." : "Could not create the partner." };
  }
  revalidatePartners();
  return {};
}

export async function updatePartner(id: string, input: PartnerInput): Promise<PartnerActionResult> {
  await requireActiveTeamMember();
  const parsed = partnerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid partner." };

  const supabase = await createClient();
  const { error } = await supabase.from("partners").update(partnerRow(parsed.data)).eq("id", id);
  if (error) {
    return { error: error.code === "23505" ? "A partner with that name already exists." : "Could not update the partner." };
  }
  revalidatePartners();
  return {};
}

/** Deactivating keeps past visits linked to the partner. */
export async function setPartnerActive(id: string, isActive: boolean): Promise<PartnerActionResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("partners").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: "Could not update the partner." };
  revalidatePartners();
  return {};
}

export async function deletePartner(id: string): Promise<PartnerActionResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("partners").delete().eq("id", id);
  if (error) {
    return {
      error:
        error.code === "23503"
          ? "This partner is linked to visits. Deactivate it instead."
          : "Could not delete the partner.",
    };
  }
  revalidatePartners();
  return {};
}
