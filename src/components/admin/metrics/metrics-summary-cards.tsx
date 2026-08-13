"use client";

import { Check, Clock, FileText, Percent } from "@gravity-ui/icons";

export function MetricsSummaryCards({
  summary,
}: {
  summary: {
    totalSubmissions: number;
    completedCount: number;
    inProgressCount: number;
    completionRate: number;
    avgCompletionTimeSeconds: number;
  };
}) {
  const formatDuration = (totalSeconds: number) => {
    if (totalSeconds <= 0) return "—";
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Submissions Card */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between text-muted">
          <span className="text-xs font-semibold uppercase tracking-wider">Total Responses</span>
          <FileText className="size-4" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-foreground">{summary.totalSubmissions}</span>
          <span className="text-xs text-muted">
            ({summary.completedCount} completed, {summary.inProgressCount} in progress)
          </span>
        </div>
      </div>

      {/* Completion Rate Card */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between text-muted">
          <span className="text-xs font-semibold uppercase tracking-wider">Completion Rate</span>
          <Percent className="size-4" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-foreground">{summary.completionRate}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${summary.completionRate}%` }}
          />
        </div>
      </div>

      {/* Completed Count Card */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between text-muted">
          <span className="text-xs font-semibold uppercase tracking-wider">Completed</span>
          <Check className="size-4 text-emerald-600" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-emerald-600">{summary.completedCount}</span>
          <span className="text-xs text-muted">responses</span>
        </div>
      </div>

      {/* Avg Completion Time Card */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between text-muted">
          <span className="text-xs font-semibold uppercase tracking-wider">Avg Completion Time</span>
          <Clock className="size-4" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-foreground">
            {formatDuration(summary.avgCompletionTimeSeconds)}
          </span>
        </div>
      </div>
    </div>
  );
}
