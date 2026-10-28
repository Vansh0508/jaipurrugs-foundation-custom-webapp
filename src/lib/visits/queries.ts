import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/supabase";
import type { VisitGuestSummary, VisitListItem, VisitReference, VisitRow } from "./types";

type Client = SupabaseClient<Database>;

// PostgREST puts `in (...)` filters in the URL, so cap how many ids go in one.
const MAX_ID_FILTER = 100;

export async function loadVisitReference(supabase: Client): Promise<VisitReference> {
  const [{ data: villages }, { data: experiences }, { data: partners }, { data: forms }] = await Promise.all([
    supabase.from("villages").select("id, name, is_active").order("name"),
    supabase.from("experiences").select("id, village_id, name, is_active").order("name"),
    supabase.from("partners").select("id, name, is_active").order("name"),
    supabase.from("forms").select("id, title").eq("status", "published").order("title"),
  ]);
  return { villages: villages ?? [], experiences: experiences ?? [], partners: partners ?? [], forms: forms ?? [] };
}

/** Adds village/experience ids and the guest list to each visit. */
export async function attachVisitRelations(supabase: Client, visits: VisitRow[]): Promise<VisitListItem[]> {
  if (visits.length === 0) return [];
  const scoped = visits.length <= MAX_ID_FILTER ? visits.map((v) => v.id) : null;

  const villagesQuery = supabase.from("visit_villages").select("visit_id, village_id");
  const experiencesQuery = supabase.from("visit_experiences").select("visit_id, experience_id");
  const guestsQuery = supabase
    .from("visit_guests")
    .select("id, visit_id, status, created_at, leads(name, phone)")
    .order("created_at");

  const [{ data: villageRows }, { data: experienceRows }, { data: guestRows }] = await Promise.all([
    scoped ? villagesQuery.in("visit_id", scoped) : villagesQuery,
    scoped ? experiencesQuery.in("visit_id", scoped) : experiencesQuery,
    scoped ? guestsQuery.in("visit_id", scoped) : guestsQuery,
  ]);

  const villageIds = new Map<string, string[]>();
  for (const row of villageRows ?? []) {
    villageIds.set(row.visit_id, [...(villageIds.get(row.visit_id) ?? []), row.village_id]);
  }
  const experienceIds = new Map<string, string[]>();
  for (const row of experienceRows ?? []) {
    experienceIds.set(row.visit_id, [...(experienceIds.get(row.visit_id) ?? []), row.experience_id]);
  }
  const guests = new Map<string, VisitGuestSummary[]>();
  for (const row of guestRows ?? []) {
    const guest = { id: row.id, name: row.leads?.name ?? null, phone: row.leads?.phone ?? "", status: row.status };
    guests.set(row.visit_id, [...(guests.get(row.visit_id) ?? []), guest]);
  }

  return visits.map((visit) => ({
    ...visit,
    villageIds: villageIds.get(visit.id) ?? [],
    experienceIds: experienceIds.get(visit.id) ?? [],
    guestCount: guests.get(visit.id)?.length ?? 0,
    guests: guests.get(visit.id) ?? [],
  }));
}
