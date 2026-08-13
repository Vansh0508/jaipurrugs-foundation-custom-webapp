"use client";

import type { Tables } from "@/lib/types/supabase";

type FieldRow = Tables<"form_fields">;

export function DropoffFunnel({
  fields,
  submissions,
  answers,
}: {
  fields: FieldRow[];
  submissions: Array<{ id: string; status: string }>;
  answers: Array<{ submission_id: string; field_id: string }>;
}) {
  const sections = fields.filter((f) => f.type === "section");
  const totalStarted = submissions.length;

  if (totalStarted === 0) return null;

  // Build section funnel stages
  const stages: Array<{ title: string; count: number; percentage: number }> = [];

  stages.push({
    title: "Started Form",
    count: totalStarted,
    percentage: 100,
  });

  if (sections.length > 0) {
    let currentSectionTitle = "Section 1";
    let sectionFields: string[] = [];

    for (const field of fields) {
      if (field.type === "section") {
        if (sectionFields.length > 0) {
          // calculate respondents who answered at least one field in previous section
          const reachedSet = new Set(
            answers.filter((a) => sectionFields.includes(a.field_id)).map((a) => a.submission_id),
          );
          stages.push({
            title: currentSectionTitle,
            count: reachedSet.size,
            percentage: Math.round((reachedSet.size / totalStarted) * 100),
          });
        }
        currentSectionTitle = field.label || "Untitled Section";
        sectionFields = [];
      } else {
        sectionFields.push(field.id);
      }
    }

    if (sectionFields.length > 0) {
      const reachedSet = new Set(
        answers.filter((a) => sectionFields.includes(a.field_id)).map((a) => a.submission_id),
      );
      stages.push({
        title: currentSectionTitle,
        count: reachedSet.size,
        percentage: Math.round((reachedSet.size / totalStarted) * 100),
      });
    }
  }

  const completedCount = submissions.filter((s) => s.status === "completed").length;
  stages.push({
    title: "Submitted Form",
    count: completedCount,
    percentage: Math.round((completedCount / totalStarted) * 100),
  });

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-5 shadow-2xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Section Progression & Drop-off Funnel</h3>
        <span className="text-xs text-muted">Total Started: {totalStarted}</span>
      </div>

      <div className="flex flex-col gap-2 pt-2">
        {stages.map((stage, idx) => {
          const dropoff = idx > 0 ? stages[idx - 1].count - stage.count : 0;
          return (
            <div key={idx} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-foreground">{stage.title}</span>
                <div className="flex items-center gap-2">
                  <span className="text-foreground">{stage.count} respondents</span>
                  <span className="font-bold text-muted">({stage.percentage}%)</span>
                  {dropoff > 0 && (
                    <span className="text-[10px] text-danger bg-red-50 px-1.5 py-0.5 rounded">
                      -{dropoff} dropped
                    </span>
                  )}
                </div>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-accent transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(stage.percentage, 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
