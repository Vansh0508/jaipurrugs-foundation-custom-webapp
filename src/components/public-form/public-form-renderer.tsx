"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CircleCheck } from "@gravity-ui/icons";
import { Button, toast } from "@heroui/react";
import {
  completeSubmission,
  getOrCreateSubmission,
  saveProgressiveAnswers,
  type AnswerInput,
} from "@/lib/actions/submissions";
import {
  resolveSectionBackground,
  type FormSettings,
} from "@/lib/forms/field-types";
import { groupFieldsIntoPages } from "@/lib/forms/public-form";
import type { Tables } from "@/lib/types/supabase";
import { PublicFieldInput } from "./public-field-input";

export function PublicFormRenderer({
  form,
  fields,
}: {
  form: Pick<Tables<"forms">, "id" | "title" | "description" | "settings">;
  fields: Tables<"form_fields">[];
}) {
  const [submitterToken, setSubmitterToken] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [answersMap, setAnswersMap] = useState<Record<string, unknown>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const settings = (form.settings as FormSettings) ?? {};
  const logoUrl = settings.logo_url ?? null;
  const coverUrl = settings.cover_image_url ?? null;
  const defaultBg = settings.section_defaults?.background;

  const pages = useMemo(() => {
    return groupFieldsIntoPages(fields, (settings as Record<string, unknown>)?.questions_per_page as number | undefined);
  }, [fields, settings]);

  const currentPage = pages[currentPageIndex] ?? pages[0];

  // Client-side submitter token persistence in localStorage for tab recovery
  useEffect(() => {
    const storageKey = `form_submitter_token_${form.id}`;
    let token = localStorage.getItem(storageKey);
    if (!token) {
      // crypto.randomUUID() requires a secure context (HTTPS or localhost) and is
      // unavailable on plain HTTP hosts -- fall back to a Math.random()-based
      // UUID v4, which is fine for a client-side dedup token (not security-critical).
      token =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === "x" ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });
      localStorage.setItem(storageKey, token);
    }
    setSubmitterToken(token);
  }, [form.id]);

  // Retrieve or create in_progress submission row
  useEffect(() => {
    if (!submitterToken) return;

    getOrCreateSubmission(form.id, submitterToken)
      .then(({ submission, answers }) => {
        setSubmissionId(submission.id);
        if (submission.status === "completed") {
          setIsSubmitted(true);
        }
        if (answers && answers.length > 0) {
          const map: Record<string, unknown> = {};
          for (const ans of answers) {
            map[ans.field_id] = ans.value;
          }
          setAnswersMap(map);
        }
      })
      .catch(() => {
        toast.danger("Could not initialize form session.");
      });
  }, [form.id, submitterToken]);

  function handleFieldChange(fieldId: string, value: unknown) {
    setAnswersMap((prev) => ({ ...prev, [fieldId]: value }));
  }

  function getPageAnswerInputs(fieldsToSave: Tables<"form_fields">[]): AnswerInput[] {
    return fieldsToSave
      .filter((f) => f.type !== "section")
      .map((f) => ({
        field_id: f.id,
        value: answersMap[f.id] ?? null,
        field_snapshot: {
          label: f.label,
          type: f.type,
          position: f.position,
        },
      }));
  }

  function validateCurrentPage(): boolean {
    if (!currentPage) return true;

    for (const field of currentPage.fields) {
      if (field.required && field.type !== "section") {
        const val = answersMap[field.id];
        const isEmpty =
          val === undefined ||
          val === null ||
          val === "" ||
          (Array.isArray(val) && val.length === 0);

        if (isEmpty) {
          toast.danger(`Please fill out required field: "${field.label || "Question"}"`);
          return false;
        }
      }
    }
    return true;
  }

  async function handleNextPage() {
    if (!validateCurrentPage()) return;
    if (!submissionId || !submitterToken) return;

    setIsSaving(true);
    try {
      const answersPayload = getPageAnswerInputs(currentPage.fields);
      await saveProgressiveAnswers(submissionId, submitterToken, answersPayload);
      setCurrentPageIndex((prev) => Math.min(pages.length - 1, prev + 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.danger("Could not save progress. Please check connection.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubmit() {
    if (!validateCurrentPage()) return;
    if (!submissionId || !submitterToken) return;

    setIsSaving(true);
    try {
      const answersPayload = getPageAnswerInputs(currentPage.fields);
      await completeSubmission(submissionId, submitterToken, answersPayload);
      setIsSubmitted(true);
      toast.success("Submission completed!");

      const redirectUrl = (settings as Record<string, unknown>)?.redirect_url as string | undefined;
      if (redirectUrl) {
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 1500);
      }
    } catch {
      toast.danger("Submission failed. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isSubmitted) {
    const successMsg =
      ((settings as Record<string, unknown>)?.success_message as string) ||
      "Thank you! Your submission has been received.";

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 mb-4">
          <CircleCheck className="size-8" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Form Completed</h1>
        <p className="max-w-md text-muted">{successMsg}</p>
      </div>
    );
  }

  const sectionBg = currentPage?.sectionField
    ? resolveSectionBackground(currentPage.sectionField.config as never, defaultBg)
    : defaultBg;

  const pageContainerStyle: React.CSSProperties = {};
  if (sectionBg?.type === "color" && sectionBg.color) {
    pageContainerStyle.backgroundColor = sectionBg.color;
  } else if (sectionBg?.type === "image" && sectionBg.image_url) {
    pageContainerStyle.backgroundImage = `url("${sectionBg.image_url}")`;
    pageContainerStyle.backgroundSize = "cover";
    pageContainerStyle.backgroundPosition = "center";
  }

  const isLastPage = currentPageIndex === pages.length - 1;
  const progressPercent = Math.round(((currentPageIndex + 1) / pages.length) * 100);

  return (
    <div className="min-h-screen bg-slate-50 text-foreground">
      {/* Cover Image Banner */}
      {coverUrl ? (
        <div className="h-56 w-full overflow-hidden bg-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Form cover" className="h-full w-full object-cover" src={coverUrl} />
        </div>
      ) : null}

      <main className="mx-auto max-w-3xl px-[10%] py-8">
        <div
          className="flex flex-col gap-6 rounded-3xl border border-border bg-white p-8 shadow-xs transition-all"
          style={pageContainerStyle}
        >
          {/* Form Header (Logo & Title) */}
          <div className="flex flex-col gap-3">
            {logoUrl ? (
              <div className="h-16 w-16 overflow-hidden rounded-2xl border border-border bg-white p-1 shadow-2xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="Form logo" className="h-full w-full object-contain" src={logoUrl} />
              </div>
            ) : null}

            <h1 className="text-3xl font-bold text-foreground">{form.title}</h1>
            {form.description ? <p className="text-sm text-muted">{form.description}</p> : null}
          </div>

          {/* Step Progress Bar */}
          {pages.length > 1 && (
            <div className="flex flex-col gap-1.5 pt-2">
              <div className="flex justify-between text-xs text-muted">
                <span>
                  Page {currentPageIndex + 1} of {pages.length}
                </span>
                <span>{progressPercent}% completed</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Current Page Fields */}
          {currentPage && (
            <div className="flex flex-col gap-6 pt-4">
              {currentPage.sectionField && (
                <PublicFieldInput
                  field={currentPage.sectionField}
                  formId={form.id}
                  submissionId={submissionId ?? ""}
                  value={null}
                  onChange={() => {}}
                />
              )}

              {currentPage.fields.map((field) => (
                <div key={field.id} className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-foreground">
                    {field.label || "Question"}
                    {field.required && field.type !== "section" ? (
                      <span className="ml-1 text-danger">*</span>
                    ) : null}
                  </label>

                  {field.description ? (
                    <p className="text-xs text-muted">{field.description}</p>
                  ) : null}

                  <PublicFieldInput
                    field={field}
                    formId={form.id}
                    submissionId={submissionId ?? ""}
                    value={answersMap[field.id]}
                    onChange={(val) => handleFieldChange(field.id, val)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Bottom Step Navigation Bar */}
          <div className="flex items-center justify-between border-t border-border pt-6 mt-4">
            {currentPageIndex > 0 ? (
              <Button
                isDisabled={isSaving}
                size="sm"
                variant="tertiary"
                onPress={() => setCurrentPageIndex((prev) => Math.max(0, prev - 1))}
              >
                <ArrowLeft />
                Back
              </Button>
            ) : (
              <div />
            )}

            {!isLastPage ? (
              <Button
                isDisabled={isSaving}
                size="sm"
                variant="primary"
                onPress={handleNextPage}
              >
                Next
                <ArrowRight />
              </Button>
            ) : (
              <Button
                isDisabled={isSaving}
                size="sm"
                variant="primary"
                onPress={handleSubmit}
              >
                Submit
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
