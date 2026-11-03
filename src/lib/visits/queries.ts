import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/supabase";
import type { VisitListItem, VisitPrimaryGuest, VisitReference, VisitRow, VisitSale } from "./types";

type Client = SupabaseClient<Database>;

// PostgREST puts `in (...)` filters in the URL, so cap how many ids go in one.
const MAX_ID_FILTER = 100;

export async function loadVisitReference(supabase: Client): Promise<VisitReference> {
  const [{ data: villages }, { data: experiences }, { data: partners }, { data: facilitators }, { data: forms }] =
    await Promise.all([
    supabase.from("villages").select("id, name, is_active").order("name"),
    supabase.from("experiences").select("id, village_id, name, is_active").order("name"),
    supabase.from("partners").select("id, name, is_active").order("name"),
    supabase.from("facilitators").select("id, name, phone, is_active").order("name"),
    supabase.from("forms").select("id, title").eq("status", "published").order("title"),
  ]);
  return {
    villages: villages ?? [],
    experiences: experiences ?? [],
    partners: partners ?? [],
    facilitators: facilitators ?? [],
    forms: forms ?? [],
  };
}

/** Adds village/experience ids, the guest count and the primary guest to each visit. */
export async function attachVisitRelations(supabase: Client, visits: VisitRow[]): Promise<VisitListItem[]> {
  if (visits.length === 0) return [];
  const scoped = visits.length <= MAX_ID_FILTER ? visits.map((v) => v.id) : null;

  const villagesQuery = supabase.from("visit_villages").select("visit_id, village_id");
  const experiencesQuery = supabase.from("visit_experiences").select("visit_id, experience_id");
  const guestsQuery = supabase.from("visit_guests").select("id, visit_id, is_primary, leads(name, phone, attributes)");
  const salesQuery = supabase.from("visit_sales").select("id, visit_id, channel, invoice_id, amount").order("created_at");

  const [{ data: villageRows }, { data: experienceRows }, { data: guestRows }, { data: saleRows }] = await Promise.all([
    scoped ? villagesQuery.in("visit_id", scoped) : villagesQuery,
    scoped ? experiencesQuery.in("visit_id", scoped) : experiencesQuery,
    scoped ? guestsQuery.in("visit_id", scoped) : guestsQuery,
    scoped ? salesQuery.in("visit_id", scoped) : salesQuery,
  ]);

  const villageIds = new Map<string, string[]>();
  for (const row of villageRows ?? []) {
    villageIds.set(row.visit_id, [...(villageIds.get(row.visit_id) ?? []), row.village_id]);
  }
  const experienceIds = new Map<string, string[]>();
  for (const row of experienceRows ?? []) {
    experienceIds.set(row.visit_id, [...(experienceIds.get(row.visit_id) ?? []), row.experience_id]);
  }
  const sales = new Map<string, VisitSale[]>();
  for (const { visit_id, ...sale } of saleRows ?? []) {
    sales.set(visit_id, [...(sales.get(visit_id) ?? []), sale]);
  }
  const guestCounts = new Map<string, number>();
  const primaryGuests = new Map<string, VisitPrimaryGuest>();
  for (const row of guestRows ?? []) {
    guestCounts.set(row.visit_id, (guestCounts.get(row.visit_id) ?? 0) + 1);
    if (row.is_primary) {
      const email = (row.leads?.attributes as Record<string, unknown> | undefined)?.email;
      primaryGuests.set(row.visit_id, {
        id: row.id,
        name: row.leads?.name ?? null,
        phone: row.leads?.phone ?? "",
        email: typeof email === "string" ? email : null,
      });
    }
  }

  return visits.map((visit) => ({
    ...visit,
    villageIds: villageIds.get(visit.id) ?? [],
    experienceIds: experienceIds.get(visit.id) ?? [],
    guestCount: guestCounts.get(visit.id) ?? 0,
    sales: sales.get(visit.id) ?? [],
    primaryGuest: primaryGuests.get(visit.id) ?? null,
  }));
}
