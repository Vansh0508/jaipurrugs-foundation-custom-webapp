"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, Paperclip } from "@gravity-ui/icons";
import { getFieldTypeDefinition, type FormFieldType } from "@/lib/forms/field-types";
import { getSignedUploadUrl } from "@/lib/actions/submissions";
import type { Tables } from "@/lib/types/supabase";

type FieldRow = Tables<"form_fields">;

type AnswerItem = {
  id: string;
  submission_id: string;
  field_id: string;
  value: unknown;
  field_snapshot: {
    label?: string | null;
    type?: string;
    options?: Array<{ id: string; label: string }>;
    min?: number;
    max?: number;
  } | null;
  created_at: string;
};

export function FieldMetricCard({
  field,
  fieldIndex,
  totalSubmissions,
  answers,
}: {
  field: FieldRow;
  fieldIndex: number;
  totalSubmissions: number;
  answers: AnswerItem[];
}) {
  const definition = getFieldTypeDefinition(field.type as FormFieldType);
  const Icon = definition.icon;

  if (definition.isSection) {
    return (
      <div className="flex items-center gap-2 border-b border-border pb-2 pt-4">
        <h2 className="text-lg font-bold text-foreground">{field.label || "Section"}</h2>
      </div>
    );
  }

  // Filter answers corresponding to this field
  const fieldAnswers = answers.filter((a) => a.field_id === field.id && a.value !== null && a.value !== undefined && a.value !== "");
  const responseCount = fieldAnswers.length;
  const skipCount = Math.max(totalSubmissions - responseCount, 0);
  const responseRate = totalSubmissions > 0 ? Math.round((responseCount / totalSubmissions) * 100) : 0;

  // Derive field title from historical snapshot if available, fallback to current
  const displayLabel = fieldAnswers[0]?.field_snapshot?.label || field.label || `Question ${fieldIndex + 1}`;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-5 shadow-2xs">
      {/* Header: Question Label & Field Type Badge */}
      <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-muted font-mono text-xs font-semibold">
            {fieldIndex + 1}
          </span>
          <h3 className="text-sm font-semibold text-foreground truncate">{displayLabel}</h3>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1 text-xs font-medium text-muted bg-slate-100 px-2 py-0.5 rounded-md">
            <Icon className="size-3" />
            {definition.label}
          </span>
        </div>
      </div>

      {/* Response Rate Metric Strip */}
      <div className="flex items-center gap-4 text-xs text-muted">
        <span><strong className="text-foreground font-semibold">{responseCount}</strong> responses ({responseRate}%)</span>
        <span>•</span>
        <span><strong className="text-foreground font-semibold">{skipCount}</strong> skipped</span>
      </div>

      {/* Type-appropriate visual content */}
      <div className="pt-2">
        {renderVisualContent({
          type: field.type as FormFieldType,
          config: (field.config as Record<string, unknown>) ?? {},
          fieldAnswers,
          totalSubmissions,
        })}
      </div>
    </div>
  );
}

function renderVisualContent({
  type,
  config,
  fieldAnswers,
  totalSubmissions,
}: {
  type: FormFieldType;
  config: Record<string, unknown>;
  fieldAnswers: AnswerItem[];
  totalSubmissions: number;
}) {
  if (fieldAnswers.length === 0) {
    return <p className="text-xs text-muted italic">No responses collected for this question yet.</p>;
  }

  switch (type) {
    case "multiple_choice":
    case "checkboxes":
    case "dropdown": {
      // Aggregate choice frequencies from answers
      const counts: Record<string, number> = {};
      let totalChoiceSelections = 0;

      for (const ans of fieldAnswers) {
        const val = ans.value;
        if (Array.isArray(val)) {
          for (const item of val) {
            const key = String(item);
            counts[key] = (counts[key] || 0) + 1;
            totalChoiceSelections++;
          }
        } else if (val) {
          const key = String(val);
          counts[key] = (counts[key] || 0) + 1;
          totalChoiceSelections++;
        }
      }

      // Collect option list from snapshot or config
      const optionList =
        (config.options as Array<{ id: string; label: string }>) ?? [];

      const keys = Array.from(new Set([...optionList.map((o) => o.label), ...Object.keys(counts)]));

      return (
        <div className="flex flex-col gap-2.5">
          {keys.map((optionLabel) => {
            const cnt = counts[optionLabel] || 0;
            const pct = fieldAnswers.length > 0 ? Math.round((cnt / fieldAnswers.length) * 100) : 0;

            return (
              <div key={optionLabel} className="flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between font-medium">
                  <span className="text-foreground">{optionLabel}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-foreground">{cnt}</span>
                    <span className="text-muted font-bold">({pct}%)</span>
                  </div>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-accent transition-all duration-300 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    case "number":
    case "rating":
    case "linear_scale": {
      const numbers: number[] = [];
      for (const ans of fieldAnswers) {
        const num = Number(ans.value);
        if (!isNaN(num)) numbers.push(num);
      }

      if (numbers.length === 0) {
        return <p className="text-xs text-muted italic">No numeric data available.</p>;
      }

      const sum = numbers.reduce((a, b) => a + b, 0);
      const avg = (sum / numbers.length).toFixed(1);
      const min = Math.min(...numbers);
      const max = Math.max(...numbers);

      // Distribution count map
      const freq: Record<number, number> = {};
      for (const n of numbers) {
        freq[n] = (freq[n] || 0) + 1;
      }

      const uniqueNums = Object.keys(freq).map(Number).sort((a, b) => a - b);

      return (
        <div className="flex flex-col gap-3">
          {/* Key Stats Bar */}
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-center text-xs">
            <div>
              <span className="text-muted block text-[10px] uppercase font-semibold">Average</span>
              <span className="text-base font-bold text-foreground">{avg}</span>
            </div>
            <div>
              <span className="text-muted block text-[10px] uppercase font-semibold">Min</span>
              <span className="text-base font-bold text-foreground">{min}</span>
            </div>
            <div>
              <span className="text-muted block text-[10px] uppercase font-semibold">Max</span>
              <span className="text-base font-bold text-foreground">{max}</span>
            </div>
          </div>

          {/* Distribution chart */}
          <div className="flex flex-col gap-1.5 pt-1">
            <span className="text-[11px] font-semibold text-muted uppercase">Distribution</span>
            {uniqueNums.map((val) => {
              const cnt = freq[val];
              const pct = Math.round((cnt / numbers.length) * 100);
              return (
                <div key={val} className="flex items-center gap-2 text-xs">
                  <span className="w-8 font-mono text-muted text-right font-medium">{val}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-12 text-right font-medium text-foreground">{cnt} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    case "file_upload":
      return <FileUploadMetricList answers={fieldAnswers} />;

    default: {
      // Text and Date fields: show sample list
      const samples = fieldAnswers.slice(0, 10);
      return (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold text-muted uppercase">Recent Answers</span>
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
            {samples.map((ans) => (
              <div key={ans.id} className="rounded-lg border border-border bg-slate-50/70 px-3 py-2 text-xs text-foreground">
                {String(ans.value)}
              </div>
            ))}
          </div>
        </div>
      );
    }
  }
}

function FileUploadMetricList({ answers }: { answers: AnswerItem[] }) {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchSignedUrls = async () => {
      const urlMap: Record<string, string> = {};
      for (const ans of answers) {
        const val = ans.value as { path?: string };
        if (val?.path) {
          try {
            const url = await getSignedUploadUrl(val.path);
            urlMap[ans.id] = url;
          } catch {
            // ignore
          }
        }
      }
      setSignedUrls(urlMap);
    };

    fetchSignedUrls();
  }, [answers]);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold text-muted uppercase">Uploaded Files ({answers.length})</span>
      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
        {answers.map((ans) => {
          const val = ans.value as { name?: string };
          return (
            <div key={ans.id} className="flex items-center justify-between rounded-xl border border-border bg-white px-3 py-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="size-3.5 text-muted shrink-0" />
                <span className="truncate text-foreground font-medium">{val?.name || "File attachment"}</span>
              </div>
              {signedUrls[ans.id] && (
                <a
                  href={signedUrls[ans.id]}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-accent hover:underline text-xs shrink-0"
                >
                  <ArrowDownToLine className="size-3.5" />
                  Download
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
