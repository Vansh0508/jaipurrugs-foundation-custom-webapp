"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { applyRuleSetToVisit } from "@/lib/actions/messaging";
import { normalizePhone } from "@/lib/mastra/phone";
import { createClient } from "@/lib/supabase/server";
import { VISIT_STATUSES } from "@/lib/visits/constants";
import { blankToNull, guestSchema, guestStatusSchema, visitSchema, type VisitInput } from "@/lib/visits/schemas";
import type { LeadSearchResult, VisitGuestItem } from "@/lib/visits/types";

export type VisitActionResult = { error?: string };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function revalidateVisits() {
  revalidatePath("/trips");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}

function visitRow(data: ReturnType<typeof visitSchema.parse>) {
  return {
    visit_type: data.visitType,
    visit_date: data.visitDate,
    start_time: data.startTime,
    end_time: data.endTime,
    status: data.status,
    poc_name: blankToNull(data.pocName),
    poc_phone: blankToNull(data.pocPhone),
    facilitator: blankToNull(data.facilitator),
    partner_id: data.partnerId,
    headcount: data.headcount,
    visitor_group: blankToNull(data.visitorGroup),
    source: blankToNull(data.source),
    origin_place: blankToNull(data.originPlace),
    program_category: data.programCategory,
    visitor_category: data.visitorCategory,
    booking_channel: data.bookingChannel,
    amount_charged: data.amountCharged,
    amount_to_artisans: data.amountToArtisans,
    notes: blankToNull(data.notes),
    feedback_form_id: data.feedbackFormId,
  };
}

/**
 * Makes visit_villages / visit_experiences match the chosen ids. An experience is
 * only kept if its village is also chosen. Returns an error message or null.
 */
async function syncVisitLinks(
  supabase: SupabaseServerClient,
  visitId: string,
  villageIds: string[],
  experienceIds: string[],
): Promise<string | null> {
  const wantedVillages = [...new Set(villageIds)];

  let wantedExperiences = [...new Set(experienceIds)];
  if (wantedExperiences.length > 0) {
    const { data: found } = await supabase.from("experiences").select("id, village_id").in("id", wantedExperiences);
    wantedExperiences = (found ?? []).filter((e) => wantedVillages.includes(e.village_id)).map((e) => e.id);
  }

  const [{ data: haveVillages }, { data: haveExperiences }] = await Promise.all([
    supabase.from("visit_villages").select("village_id").eq("visit_id", visitId),
    supabase.from("visit_experiences").select("experience_id").eq("visit_id", visitId),
  ]);
  const currentVillages = (haveVillages ?? []).map((r) => r.village_id);
  const currentExperiences = (haveExperiences ?? []).map((r) => r.experience_id);

  // Experiences first on the way out, villages first on the way in, so the
  // "an experience needs its village" invariant holds between statements.
  const dropExperiences = currentExperiences.filter((id) => !wantedExperiences.includes(id));
  if (dropExperiences.length > 0) {
    const { error } = await supabase.from("visit_experiences").delete().eq("visit_id", visitId).in("experience_id", dropExperiences);
    if (error) return "Could not update the visit's experiences.";
  }
  const dropVillages = currentVillages.filter((id) => !wantedVillages.includes(id));
  if (dropVillages.length > 0) {
    const { error } = await supabase.from("visit_villages").delete().eq("visit_id", visitId).in("village_id", dropVillages);
    if (error) return "Could not update the visit's villages.";
  }
  const addVillages = wantedVillages.filter((id) => !currentVillages.includes(id));
  if (addVillages.length > 0) {
    const { error } = await supabase
      .from("visit_villages")
      .insert(addVillages.map((village_id) => ({ visit_id: visitId, village_id })));
    if (error) return "Could not update the visit's villages.";
  }
  const addExperiences = wantedExperiences.filter((id) => !currentExperiences.includes(id));
  if (addExperiences.length > 0) {
    const { error } = await supabase
      .from("visit_experiences")
      .insert(addExperiences.map((experience_id) => ({ visit_id: visitId, experience_id })));
    if (error) return "Could not update the visit's experiences.";
  }
  return null;
}

export async function createVisit(input: VisitInput): Promise<VisitActionResult & { id?: string }> {
  const { email } = await requireActiveTeamMember();
  const parsed = visitSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid visit." };

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("visits")
    .insert({
      ...visitRow(parsed.data),
      created_by: email,
      completed_by: parsed.data.status === "completed" ? `staff:${email}` : null,
    })
    .select("id")
    .single();
  if (error || !created) return { error: "Could not create the visit." };

  const linkError = await syncVisitLinks(supabase, created.id, parsed.data.villageIds, parsed.data.experienceIds);
  if (linkError) {
    await supabase.from("visits").delete().eq("id", created.id);
    return { error: linkError };
  }

  // Sequences set up for this visit type (e.g. "Rural Experience") are applied automatically.
  // Best-effort: the visit is already saved, and rules can be added from its Messaging dialog.
  const { data: sequences } = await supabase
    .from("message_rule_sets")
    .select("id, visit_type")
    .eq("is_active", true)
    .not("visit_type", "is", null);
  const typeKey = parsed.data.visitType.trim().toLowerCase();
  for (const sequence of sequences ?? []) {
    if (sequence.visit_type?.trim().toLowerCase() === typeKey) {
      await applyRuleSetToVisit(created.id, sequence.id);
    }
  }

  revalidateVisits();
  return { id: created.id };
}

export async function updateVisit(id: string, input: VisitInput): Promise<VisitActionResult> {
  const { email } = await requireActiveTeamMember();
  const parsed = visitSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid visit." };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("visits").select("status").eq("id", id).maybeSingle();
  if (!existing) return { error: "That visit no longer exists." };

  const becomingCompleted = parsed.data.status === "completed" && existing.status !== "completed";
  const { error } = await supabase
    .from("visits")
    .update({ ...visitRow(parsed.data), ...(becomingCompleted ? { completed_by: `staff:${email}` } : {}) })
    .eq("id", id);
  if (error) return { error: "Could not update the visit." };

  const linkError = await syncVisitLinks(supabase, id, parsed.data.villageIds, parsed.data.experienceIds);
  if (linkError) return { error: linkError };
  revalidateVisits();
  return {};
}

/** Quick status change from a list or calendar row. */
export async function setVisitStatus(id: string, status: string): Promise<VisitActionResult> {
  const { email } = await requireActiveTeamMember();
  if (!VISIT_STATUSES.some((s) => s.id === status)) return { error: "Unknown status." };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("visits").select("status").eq("id", id).maybeSingle();
  if (!existing) return { error: "That visit no longer exists." };
  if (existing.status === status) return {};

  const { error } = await supabase
    .from("visits")
    .update({ status, ...(status === "completed" ? { completed_by: `staff:${email}` } : {}) })
    .eq("id", id);
  if (error) return { error: "Could not update the visit." };
  revalidateVisits();
  return {};
}

export async function deleteVisit(id: string): Promise<VisitActionResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("visits").delete().eq("id", id);
  if (error) return { error: "Could not delete the visit." };
  revalidateVisits();
  return {};
}

// ---------------------------------------------------------------------------
// Guests (leads attached to a visit)
// ---------------------------------------------------------------------------

export async function getVisitGuests(visitId: string): Promise<VisitGuestItem[]> {
  await requireActiveTeamMember();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("visit_guests")
    .select("id, lead_id, status, feedback_token, created_at, leads(id, name, phone, attributes, whatsapp_opt_out)")
    .eq("visit_id", visitId)
    .order("created_at");
  if (!rows || rows.length === 0) return [];

  const leadIds = rows.map((r) => r.lead_id);
  const { data: conversations } = await supabase
    .from("whatsapp_conversations")
    .select("id, lead_id, needs_human, last_message_at")
    .in("lead_id", leadIds)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  const conversationByLead = new Map<string, NonNullable<typeof conversations>[number]>();
  for (const conversation of conversations ?? []) {
    if (conversation.lead_id && !conversationByLead.has(conversation.lead_id)) {
      conversationByLead.set(conversation.lead_id, conversation);
    }
  }

  return rows.map((row) => {
    const lead = row.leads;
    const attributes = (lead?.attributes ?? {}) as Record<string, unknown>;
    const conversation = conversationByLead.get(row.lead_id);
    return {
      id: row.id,
      leadId: row.lead_id,
      status: row.status,
      name: lead?.name ?? null,
      phone: lead?.phone ?? "",
      email: typeof attributes.email === "string" ? attributes.email : null,
      optedOut: lead?.whatsapp_opt_out ?? false,
      feedbackToken: row.feedback_token,
      conversationId: conversation?.id ?? null,
      needsHuman: conversation?.needs_human ?? false,
      lastMessageAt: conversation?.last_message_at ?? null,
    };
  });
}

/** Leads matching a name or phone fragment that aren't already on the visit. */
export async function searchLeadsForVisit(visitId: string, query: string): Promise<LeadSearchResult[]> {
  await requireActiveTeamMember();
  // Characters that are special in a PostgREST filter value.
  const q = query.replace(/[,()%*\\"]/g, " ").trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const { data: onVisit } = await supabase.from("visit_guests").select("lead_id").eq("visit_id", visitId);
  const exclude = new Set((onVisit ?? []).map((r) => r.lead_id));

  const { data } = await supabase
    .from("leads")
    .select("id, name, phone")
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
    .order("updated_at", { ascending: false })
    .limit(20);

  return (data ?? []).filter((lead) => !exclude.has(lead.id)).slice(0, 8);
}

export async function addGuestFromLead(visitId: string, leadId: string): Promise<VisitActionResult> {
  const { email } = await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("visit_guests").insert({ visit_id: visitId, lead_id: leadId, created_by: email });
  if (error) {
    return { error: error.code === "23505" ? "That person is already on this visit." : "Could not add the guest." };
  }
  revalidateVisits();
  return {};
}

/** Adds a guest by phone: reuses the lead if that number exists, otherwise creates one. */
export async function addNewGuest(visitId: string, input: { name: string; phone: string }): Promise<VisitActionResult> {
  const { email } = await requireActiveTeamMember();
  const parsed = guestSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid guest." };

  const normalized = normalizePhone(parsed.data.phone);
  if (!normalized) return { error: "Enter a valid phone number (at least 8 digits)." };

  const supabase = await createClient();
  let { data: lead } = await supabase
    .from("leads")
    .select("id, name")
    .eq("phone_normalized", normalized)
    .maybeSingle();

  if (!lead) {
    const { data: created, error } = await supabase
      .from("leads")
      .insert({ phone: parsed.data.phone, name: parsed.data.name, source: "manual" })
      .select("id, name")
      .single();
    if (error || !created) return { error: "Could not create the contact." };
    lead = created;
  } else if (!lead.name) {
    await supabase.from("leads").update({ name: parsed.data.name }).eq("id", lead.id);
  }

  const { error } = await supabase.from("visit_guests").insert({ visit_id: visitId, lead_id: lead.id, created_by: email });
  if (error) {
    return { error: error.code === "23505" ? "That person is already on this visit." : "Could not add the guest." };
  }
  revalidateVisits();
  revalidatePath("/leads");
  return {};
}

export async function setGuestStatus(guestId: string, status: string): Promise<VisitActionResult> {
  await requireActiveTeamMember();
  const parsed = guestStatusSchema.safeParse(status);
  if (!parsed.success) return { error: "Unknown guest status." };

  const supabase = await createClient();
  const { error } = await supabase.from("visit_guests").update({ status: parsed.data }).eq("id", guestId);
  if (error) return { error: "Could not update the guest." };
  revalidateVisits();
  return {};
}

export async function removeGuest(guestId: string): Promise<VisitActionResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("visit_guests").delete().eq("id", guestId);
  if (error) return { error: "Could not remove the guest." };
  revalidateVisits();
  return {};
}
