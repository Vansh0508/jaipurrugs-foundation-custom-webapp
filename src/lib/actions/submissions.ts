"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveTeamMember } from "@/lib/auth/session";
import type { Json, Tables } from "@/lib/types/supabase";

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

  const { data: existing } = await supabase
    .from("form_submissions")
    .select("id, status, submitter_token, completed_at")
    .eq("form_id", formId)
    .eq("submitter_token", submitterToken)
    .maybeSingle();

  if (existing) {
    const { data: answers } = await supabase
      .from("form_answers")
      .select("field_id, value")
      .eq("submission_id", existing.id);

    return {
      submission: existing,
      answers: answers ?? [],
    };
  }

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

/* ==========================================================================
   Admin Submissions & Metrics Actions (Phase 6)
   ========================================================================== */

export async function getFormSubmissions(
  formId: string,
  options: {
    page?: number;
    limit?: number;
    status?: "all" | "completed" | "in_progress";
    search?: string;
  } = {},
) {
  await requireActiveTeamMember();
  const supabase = await createClient();

  const page = options.page ?? 1;
  const limit = options.limit ?? 25;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Query submissions count
  let countQuery = supabase
    .from("form_submissions")
    .select("id", { count: "exact", head: true })
    .eq("form_id", formId);

  if (options.status && options.status !== "all") {
    countQuery = countQuery.eq("status", options.status);
  }

  if (options.search) {
    countQuery = countQuery.ilike("submitter_token", `%${options.search}%`);
  }

  const { count } = await countQuery;

  // Query paginated submissions
  let query = supabase
    .from("form_submissions")
    .select(`
      id,
      form_id,
      submitter_token,
      status,
      completed_at,
      created_at,
      form_answers (
        id,
        field_id,
        value,
        field_snapshot,
        created_at
      )
    `)
    .eq("form_id", formId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (options.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  if (options.search) {
    query = query.ilike("submitter_token", `%${options.search}%`);
  }

  const { data: submissions, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  // Fetch form fields for column mapping
  const { data: fields } = await supabase
    .from("form_fields")
    .select("id, label, type, position")
    .eq("form_id", formId)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  return {
    submissions: (submissions ?? []).map((s) => ({ ...s, started_at: s.created_at })),
    fields: fields ?? [],
    total: count ?? 0,
    page,
    totalPages: Math.ceil((count ?? 0) / limit),
  };
}

export async function getSignedUploadUrl(filePath: string) {
  await requireActiveTeamMember();
  const adminSupabase = createAdminClient();

  const { data, error } = await adminSupabase.storage
    .from("form-uploads")
    .createSignedUrl(filePath, 3600); // 1 hour valid signed URL

  if (error || !data) {
    throw new Error(error?.message || "Failed to generate download URL");
  }

  return data.signedUrl;
}

export async function exportSubmissionsCsv(formId: string) {
  await requireActiveTeamMember();
  const supabase = await createClient();

  const { data: form } = await supabase
    .from("forms")
    .select("title")
    .eq("id", formId)
    .single();

  const { data: fields } = await supabase
    .from("form_fields")
    .select("id, label, type")
    .eq("form_id", formId)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  const activeFields = (fields ?? []).filter((f) => f.type !== "section");

  const { data: submissions } = await supabase
    .from("form_submissions")
    .select(`
      id,
      submitter_token,
      status,
      completed_at,
      created_at,
      form_answers (
        field_id,
        value,
        field_snapshot
      )
    `)
    .eq("form_id", formId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });

  // Helper to escape CSV fields
  const escapeCsv = (val: string | number | boolean | null | undefined) => {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    if (str.includes('"') || str.includes(",") || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
  };

  // Header row
  const headers = [
    "Submission ID",
    "Submitter Token",
    "Status",
    "Started At",
    "Completed At",
    ...activeFields.map((f) => f.label || "Untitled Field"),
  ];

  const rows = [headers.map(escapeCsv).join(",")];

  // Data rows
  for (const sub of submissions ?? []) {
    const answerMap = new Map<string, unknown>();
    for (const ans of sub.form_answers ?? []) {
      answerMap.set(ans.field_id, ans.value);
    }

    const row = [
      sub.id,
      sub.submitter_token,
      sub.status,
      sub.created_at,
      sub.completed_at ?? "",
      ...activeFields.map((field) => {
        const rawVal = answerMap.get(field.id);
        if (rawVal === undefined || rawVal === null) return "";
        if (typeof rawVal === "object") {
          if (Array.isArray(rawVal)) return rawVal.join("; ");
          return JSON.stringify(rawVal);
        }
        return String(rawVal);
      }),
    ];

    rows.push(row.map(escapeCsv).join(","));
  }

  return {
    filename: `${(form?.title || "form").toLowerCase().replace(/[^a-z0-9]/g, "-")}-submissions.csv`,
    content: rows.join("\n"),
  };
}

export async function getFormMetricsData(formId: string) {
  await requireActiveTeamMember();
  const supabase = await createClient();

  const { data: form } = await supabase
    .from("forms")
    .select("id, title, status, settings")
    .eq("id", formId)
    .single();

  const { data: fields } = await supabase
    .from("form_fields")
    .select("*")
    .eq("form_id", formId)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  const { data: submissions } = await supabase
    .from("form_submissions")
    .select("id, status, created_at, completed_at")
    .eq("form_id", formId);

  const { data: answers } = await supabase
    .from("form_answers")
    .select("id, submission_id, field_id, value, field_snapshot, created_at")
    .in("submission_id", (submissions ?? []).map((s) => s.id));

  const totalSubmissions = submissions?.length ?? 0;
  const completedSubmissions = (submissions ?? []).filter((s) => s.status === "completed");
  const inProgressSubmissions = (submissions ?? []).filter((s) => s.status === "in_progress");
  const completedCount = completedSubmissions.length;
  const completionRate = totalSubmissions > 0 ? Math.round((completedCount / totalSubmissions) * 100) : 0;

  // Average Completion Time (in seconds)
  let totalTimeSeconds = 0;
  let timedCount = 0;

  for (const sub of completedSubmissions) {
    if (sub.created_at && sub.completed_at) {
      const start = new Date(sub.created_at).getTime();
      const end = new Date(sub.completed_at).getTime();
      const duration = (end - start) / 1000;
      if (duration > 0 && duration < 86400) {
        totalTimeSeconds += duration;
        timedCount++;
      }
    }
  }

  const avgCompletionTimeSeconds = timedCount > 0 ? Math.round(totalTimeSeconds / timedCount) : 0;

  return {
    form,
    fields: fields ?? [],
    summary: {
      totalSubmissions,
      completedCount,
      inProgressCount: inProgressSubmissions.length,
      completionRate,
      avgCompletionTimeSeconds,
    },
    submissions: (submissions ?? []).map((s) => ({ ...s, started_at: s.created_at })),
    answers: answers ?? [],
  };
}
