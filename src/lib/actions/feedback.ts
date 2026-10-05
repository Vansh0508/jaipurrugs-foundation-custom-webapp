"use server";

import { createClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/lib/types/supabase";

// Public-facing actions for the per-guest feedback link (/fb/[token]). They run as
// the anonymous visitor and only ever call two SECURITY DEFINER RPCs
// (feedback_session / feedback_save) that resolve the token to one guest. Guest
// submissions are invisible to every anon table policy, so nothing here can read
// or write another guest's answers. Do not import any admin-only action here.

const MAX_TOKEN_LENGTH = 100;
const MAX_ANSWERS = 100;

export type FeedbackAnswer = { field_id: string; value: unknown };

export interface FeedbackSession {
  form_id: string;
  guest_first_name: string | null;
  visit_type: string | null;
  visit_date: string | null;
  completed: boolean;
  answers: { field_id: string; value: unknown }[];
}

function validToken(token: unknown): token is string {
  return typeof token === "string" && token.length >= 20 && token.length <= MAX_TOKEN_LENGTH;
}

/** The form, its questions and the guest's saved answers — or null for any invalid or expired link. */
export async function getFeedbackPage(token: string) {
  if (!validToken(token)) return null;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("feedback_session", { p_token: token });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const session = data as unknown as FeedbackSession;

  const { data: form } = await supabase
    .from("forms")
    .select("id, title, description, slug, share_token, status, settings")
    .eq("id", session.form_id)
    .maybeSingle();
  if (!form || form.status !== "published") return null;

  const { data: fields } = await supabase
    .from("form_fields")
    .select("*")
    .eq("form_id", form.id)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  // File uploads aren't supported on a guest link (the upload endpoint has no token check).
  const questions: Tables<"form_fields">[] = (fields ?? []).filter((f) => f.type !== "file_upload");
  return { session, form, fields: questions };
}

export type FeedbackSaveResult = {
  ok: boolean;
  /** not_found | already_completed | missing_required | invalid_field | invalid_request | failed */
  error?: string;
  missing?: string[];
};

/** Saves answers, and completes the submission when `complete` is true. */
export async function saveFeedbackAnswers(
  token: string,
  answers: FeedbackAnswer[],
  complete = false,
): Promise<FeedbackSaveResult> {
  if (!validToken(token) || !Array.isArray(answers) || answers.length > MAX_ANSWERS) {
    return { ok: false, error: "invalid_request" };
  }
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("feedback_save", {
    p_token: token,
    p_answers: answers.map((a) => ({ field_id: a.field_id, value: a.value as Json })) as unknown as Json,
    p_complete: complete,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "failed" };

  const result = data as { ok?: boolean; error?: string; missing?: string[] };
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? "failed", missing: result.missing };
}
