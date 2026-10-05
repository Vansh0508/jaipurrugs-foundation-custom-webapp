"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/supabase";
import {
  blankToNull,
  experienceSchema,
  villageSchema,
  type ExperienceInput,
  type VillageInput,
} from "@/lib/visits/schemas";

export type VillageActionResult = { error?: string };

function revalidateVillages() {
  revalidatePath("/villages");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Villages
// ---------------------------------------------------------------------------

function villageRow(data: ReturnType<typeof villageSchema.parse>) {
  return {
    name: data.name,
    region: blankToNull(data.region),
    craft_type: blankToNull(data.craftType),
    partner_type: blankToNull(data.partnerType),
    total_households: data.totalHouseholds,
    artisan_families_engaged: data.artisanFamiliesEngaged,
    women_participants: data.womenParticipants,
    active_since: data.activeSince,
    notes: blankToNull(data.notes),
  };
}

export async function createVillage(input: VillageInput): Promise<VillageActionResult> {
  const { email } = await requireActiveTeamMember();
  const parsed = villageSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid village." };

  const supabase = await createClient();
  const { error } = await supabase.from("villages").insert({ ...villageRow(parsed.data), created_by: email });
  if (error) {
    return { error: error.code === "23505" ? "A village with that name already exists." : "Could not create the village." };
  }
  revalidateVillages();
  return {};
}

export async function updateVillage(id: string, input: VillageInput): Promise<VillageActionResult> {
  await requireActiveTeamMember();
  const parsed = villageSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid village." };

  const supabase = await createClient();
  const { error } = await supabase.from("villages").update(villageRow(parsed.data)).eq("id", id);
  if (error) {
    return { error: error.code === "23505" ? "A village with that name already exists." : "Could not update the village." };
  }
  revalidateVillages();
  return {};
}

/** Deactivating hides the village from pickers but keeps every past visit's history. */
export async function setVillageActive(id: string, isActive: boolean): Promise<VillageActionResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("villages").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: "Could not update the village." };
  revalidateVillages();
  return {};
}

export async function deleteVillage(id: string): Promise<VillageActionResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("villages").delete().eq("id", id);
  if (error) {
    return {
      error:
        error.code === "23503"
          ? "This village is used by visits. Deactivate it instead."
          : "Could not delete the village.",
    };
  }
  revalidateVillages();
  return {};
}

// ---------------------------------------------------------------------------
// Experiences (belong to a village)
// ---------------------------------------------------------------------------

function experienceRow(data: ReturnType<typeof experienceSchema.parse>) {
  return {
    name: data.name,
    description: blankToNull(data.description),
    category: blankToNull(data.category),
    duration_min: data.durationMin,
    capacity: data.capacity,
    seasonal: blankToNull(data.seasonal),
    featured: data.featured,
    itinerary: data.itinerary.map((step) => ({
      title: step.title,
      minutes: step.minutes,
      description: step.description,
    })) as unknown as Json,
  };
}

export async function createExperience(villageId: string, input: ExperienceInput): Promise<VillageActionResult> {
  const { email } = await requireActiveTeamMember();
  const parsed = experienceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid experience." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("experiences")
    .insert({ ...experienceRow(parsed.data), village_id: villageId, created_by: email });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "This village already has an experience with that name."
          : "Could not create the experience.",
    };
  }
  revalidateVillages();
  return {};
}

export async function updateExperience(id: string, input: ExperienceInput): Promise<VillageActionResult> {
  await requireActiveTeamMember();
  const parsed = experienceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid experience." };

  const supabase = await createClient();
  const { error } = await supabase.from("experiences").update(experienceRow(parsed.data)).eq("id", id);
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "This village already has an experience with that name."
          : "Could not update the experience.",
    };
  }
  revalidateVillages();
  return {};
}

export async function setExperienceActive(id: string, isActive: boolean): Promise<VillageActionResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("experiences").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: "Could not update the experience." };
  revalidateVillages();
  return {};
}

export async function deleteExperience(id: string): Promise<VillageActionResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("experiences").delete().eq("id", id);
  if (error) {
    return {
      error:
        error.code === "23503"
          ? "This experience is used by visits. Deactivate it instead."
          : "Could not delete the experience.",
    };
  }
  revalidateVillages();
  return {};
}
