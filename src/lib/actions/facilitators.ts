"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { facilitatorSchema, type FacilitatorInput } from "@/lib/visits/schemas";

export type FacilitatorActionResult = { error?: string };

const DUPLICATE_EMAIL = "A facilitator with that email already exists.";

function revalidateFacilitators() {
  revalidatePath("/facilitators");
  // Visits carry a copy of the facilitator's name and phone.
  revalidatePath("/trips");
  revalidatePath("/calendar");
}

function facilitatorRow(data: ReturnType<typeof facilitatorSchema.parse>) {
  return { name: data.name, email: data.email, phone: data.phone };
}

export async function createFacilitator(input: FacilitatorInput): Promise<FacilitatorActionResult> {
  const { email } = await requireActiveTeamMember();
  const parsed = facilitatorSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid facilitator." };

  const supabase = await createClient();
  const { error } = await supabase.from("facilitators").insert({ ...facilitatorRow(parsed.data), created_by: email });
  if (error) return { error: error.code === "23505" ? DUPLICATE_EMAIL : "Could not add the facilitator." };
  revalidateFacilitators();
  return {};
}

export async function updateFacilitator(id: string, input: FacilitatorInput): Promise<FacilitatorActionResult> {
  await requireActiveTeamMember();
  const parsed = facilitatorSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid facilitator." };

  const supabase = await createClient();
  const { error } = await supabase.from("facilitators").update(facilitatorRow(parsed.data)).eq("id", id);
  if (error) return { error: error.code === "23505" ? DUPLICATE_EMAIL : "Could not update the facilitator." };
  revalidateFacilitators();
  return {};
}

/** Deactivating keeps past visits linked, and hides the facilitator from the visit form. */
export async function setFacilitatorActive(id: string, isActive: boolean): Promise<FacilitatorActionResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("facilitators").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: "Could not update the facilitator." };
  revalidateFacilitators();
  return {};
}

export async function deleteFacilitator(id: string): Promise<FacilitatorActionResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("facilitators").delete().eq("id", id);
  if (error) {
    return {
      error:
        error.code === "23503"
          ? "This facilitator is linked to visits. Deactivate them instead."
          : "Could not delete the facilitator.",
    };
  }
  revalidateFacilitators();
  return {};
}
