import type { Tables } from "@/lib/types/supabase";

export type VisitRow = Tables<"visits">;

/** A visit with the relations the list and calendar views need. */
export type VisitListItem = VisitRow & {
  villageIds: string[];
  experienceIds: string[];
  guestCount: number;
};

export type VillageOption = Pick<Tables<"villages">, "id" | "name" | "is_active">;
export type ExperienceOption = Pick<Tables<"experiences">, "id" | "village_id" | "name" | "is_active">;
export type PartnerOption = Pick<Tables<"partners">, "id" | "name" | "is_active">;
export type FormOption = Pick<Tables<"forms">, "id" | "title">;

/** Everything the visit form needs to render its pickers. */
export type VisitReference = {
  villages: VillageOption[];
  experiences: ExperienceOption[];
  partners: PartnerOption[];
  /** Published forms, for choosing a visit's feedback form. */
  forms: FormOption[];
};

export type VisitGuestItem = {
  id: string;
  leadId: string;
  status: string;
  name: string | null;
  phone: string;
  email: string | null;
  optedOut: boolean;
  /** Opaque token for this guest's personal feedback link (/fb/<token>). */
  feedbackToken: string;
  /** The WhatsApp conversation with this guest, if one exists. */
  conversationId: string | null;
  needsHuman: boolean;
  lastMessageAt: string | null;
};

export type LeadSearchResult = {
  id: string;
  name: string | null;
  phone: string;
};
