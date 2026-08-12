"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types/supabase";

export type AnswerInput = {
  field_id: string;
  value: unknown;
  field_snapshot: {
    label: string | null;
    type: string;
    position: number;
  };
};

export async function getPublicFormByShareToken(shareToken: string) {
  const supabase = await createClient();

  const { data: form, error: formError } = await supabase
    .from("forms")
    .select("id, title, description, slug, share_token, status, settings")
    .eq("share_token", shareToken)
    .maybeSingle();

  if (formError || !form) {
    return null;
  }

  if (form.status !== "published") {
    return { form, fields: [], isNotPublished: true };
  }

  const { data: fields, error: fieldsError } = await supabase
    .from("form_fields")
    .select("*")
    .eq("form_id", form.id)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  if (fieldsError) {
    throw new Error(fieldsError.message);
  }

  return { form, fields: fields ?? [], isNotPublished: false };
}

export async function getOrCreateSubmission(formId: string, submitterToken: string) {
  const supabase = await createClient();

  // Try to find existing submission
  const { data: existing } = await supabase
    .from("form_submissions")
    .select("id, status, submitter_token, completed_at")
    .eq("form_id", formId)
    .eq("submitter_token", submitterToken)
    .maybeSingle();

  if (existing) {
    // Fetch existing answers for progressive resume
    const { data: answers } = await supabase
      .from("form_answers")
      .select("field_id, value")
      .eq("submission_id", existing.id);

    return {
      submission: existing,
      answers: answers ?? [],
    };
  }

  // Create new in_progress submission
  const { data: created, error } = await supabase
    .from("form_submissions")
    .insert({
      form_id: formId,
      submitter_token: submitterToken,
      status: "in_progress",
    })
    .select("id, status, submitter_token, completed_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    submission: created,
    answers: [],
  };
}

export async function saveProgressiveAnswers(
  submissionId: string,
  submitterToken: string,
  answers: AnswerInput[],
) {
  if (answers.length === 0) return;

  const supabase = await createClient();

  // Validate submission belongs to submitterToken
  const { data: submission } = await supabase
    .from("form_submissions")
    .select("id")
    .eq("id", submissionId)
    .eq("submitter_token", submitterToken)
    .single();

  if (!submission) {
    throw new Error("Invalid submission session.");
  }

  const payload = answers.map((ans) => ({
    submission_id: submissionId,
    field_id: ans.field_id,
    value: ans.value as Json,
    field_snapshot: ans.field_snapshot as unknown as Json,
  }));

  const { error } = await supabase.from("form_answers").upsert(payload, {
    onConflict: "submission_id,field_id",
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function completeSubmission(
  submissionId: string,
  submitterToken: string,
  answers: AnswerInput[],
) {
  const supabase = await createClient();

  if (answers.length > 0) {
    await saveProgressiveAnswers(submissionId, submitterToken, answers);
  }

  const { error } = await supabase
    .from("form_submissions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", submissionId)
    .eq("submitter_token", submitterToken);

  if (error) {
    throw new Error(error.message);
  }
}

export async function uploadSubmissionFile(
  formId: string,
  submissionId: string,
  fieldId: string,
  formData: FormData,
) {
  const file = formData.get("file") as File | null;
  if (!file) {
    throw new Error("No file uploaded.");
  }

  const fileExt = file.name.split(".").pop() || "bin";
  const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const storagePath = `${formId}/${submissionId}/${fieldId}/${uniqueName}`;

  const adminSupabase = createAdminClient();
  const buffer = await file.arrayBuffer();

  const { error } = await adminSupabase.storage
    .from("form-uploads")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (error) {
    throw new Error(error.message);
  }

  return {
    name: file.name,
    path: storagePath,
    size: file.size,
    type: file.type,
  };
}
