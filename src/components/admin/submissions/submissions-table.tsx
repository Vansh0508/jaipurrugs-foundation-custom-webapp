"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowDownToLine, Eye, Magnifier, ArrowRotateLeft, ArrowLeft, ArrowRight } from "@gravity-ui/icons";
import { Button, Chip, Input, TextField, Tooltip, toast } from "@heroui/react";
import { createClient } from "@/lib/supabase/client";
import { exportSubmissionsCsv, getFormSubmissions } from "@/lib/actions/submissions";
import { SubmissionDetailModal } from "./submission-detail-modal";

type FieldMeta = {
  id: string;
  label: string | null;
  type: string;
  position: number;
};

type SubmissionRow = {
  id: string;
  form_id: string;
  submitter_token: string;
  status: "completed" | "in_progress";
  started_at: string;
  completed_at: string | null;
  created_at: string;
  form_answers: Array<{
    id: string;
    field_id: string;
    value: unknown;
    field_snapshot: { label?: string | null; type?: string; position?: number } | null;
    created_at: string;
  }>;
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function SubmissionsTable({
  formId,
  initialData,
}: {
  formId: string;
  initialData: {
    submissions: SubmissionRow[];
    fields: FieldMeta[];
    total: number;
    page: number;
    totalPages: number;
  };
}) {
  const [data, setData] = useState(initialData);
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "in_progress">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionRow | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const activeFields = data.fields.filter((f) => f.type !== "section");

  const fetchSubmissions = (page = 1, status = statusFilter, search = searchQuery) => {
    startTransition(async () => {
      try {
        const res = await getFormSubmissions(formId, { page, status, search });
        setData(res as unknown as typeof initialData);
      } catch {
        toast.danger("Failed to reload submissions.");
      }
    });
  };

  // Realtime subscription for live response updates
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`submissions-${formId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "form_submissions",
          filter: `form_id=eq.${formId}`,
        },
        () => {
          fetchSubmissions(data.page);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "form_answers",
        },
        () => {
          fetchSubmissions(data.page);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [formId, data.page]);

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const res = await exportSubmissionsCsv(formId);
      const blob = new Blob([res.content], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", res.filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("CSV export downloaded");
    } catch {
      toast.danger("CSV export failed");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Top Filter & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <TextField aria-label="Search submissions" value={searchQuery} onChange={(val) => setSearchQuery(val)}>
            <div className="relative flex items-center">
              <Magnifier className="absolute left-2.5 size-4 text-muted pointer-events-none" />
              <Input
                className="w-64 pl-8"
                placeholder="Search responses..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") fetchSubmissions(1, statusFilter, searchQuery);
                }}
              />
            </div>
          </TextField>

          {/* Status filter tabs */}
          <div className="flex items-center rounded-xl border border-border bg-slate-100/60 p-0.5 text-xs font-medium">
            {(["all", "completed", "in_progress"] as const).map((st) => (
              <button
                key={st}
                type="button"
                className={`rounded-lg px-3 py-1.5 transition-all ${
                  statusFilter === st ? "bg-white text-foreground shadow-xs font-semibold" : "text-muted hover:text-foreground"
                }`}
                onClick={() => {
                  setStatusFilter(st);
                  fetchSubmissions(1, st, searchQuery);
                }}
              >
                {st === "all" ? "All" : st === "completed" ? "Completed" : "In Progress"}
              </button>
            ))}
          </div>

          <Button
            isIconOnly
            size="sm"
            variant="tertiary"
            isDisabled={isPending}
            onPress={() => fetchSubmissions(data.page)}
          >
            <ArrowRotateLeft className={`size-4 ${isPending ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Export CSV Button */}
        <Button
          size="sm"
          variant="primary"
          isDisabled={isExporting || data.total === 0}
          onPress={handleExportCsv}
        >
          <ArrowDownToLine className="size-4" />
          {isExporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>

      {/* Submissions Table with Questions as Columns */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-2xs">
        <table className="w-full text-left text-xs border-collapse min-w-[700px]">
          <thead>
            <tr className="border-b border-border bg-slate-50/80 font-semibold text-muted text-[11px] uppercase tracking-wider">
              <th className="px-4 py-3 w-12 align-top whitespace-nowrap">#</th>
              {activeFields.map((f, idx) => {
                const headerText = f.label || `Question ${idx + 1}`;
                return (
                  <th key={f.id} className="px-4 py-3 min-w-[160px] max-w-[240px] align-top">
                    <Tooltip delay={0} closeDelay={0}>
                      <Tooltip.Trigger>
                        <span className="line-clamp-2 leading-tight break-words cursor-help block">
                          {headerText}
                        </span>
                      </Tooltip.Trigger>
                      <Tooltip.Content className="max-w-xs rounded-xl border border-border bg-slate-900 px-3 py-1.5 text-xs text-white shadow-lg">
                        {headerText}
                      </Tooltip.Content>
                    </Tooltip>
                  </th>
                );
              })}
              <th className="px-4 py-3 align-top whitespace-nowrap">Submitted At</th>
              <th className="px-4 py-3 align-top whitespace-nowrap">Status</th>
              <th className="px-4 py-3 text-right align-top whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {data.submissions.length === 0 ? (
              <tr>
                <td colSpan={4 + activeFields.length} className="text-center py-12 text-muted">
                  No form responses found.
                </td>
              </tr>
            ) : (
              data.submissions.map((sub, rowIdx) => {
                const answerMap = new Map(sub.form_answers.map((a) => [a.field_id, a.value]));
                const responseNumber = (data.page - 1) * 25 + (rowIdx + 1);

                return (
                  <tr
                    key={sub.id}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                    onClick={() => setSelectedSubmission(sub)}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-muted">
                      #{responseNumber}
                    </td>

                    {activeFields.map((f) => {
                      const val = answerMap.get(f.id);
                      let displayVal = "—";
                      if (val !== undefined && val !== null) {
                        if (typeof val === "object") {
                          if (Array.isArray(val)) displayVal = val.join(", ");
                          else displayVal = (val as { name?: string }).name || "Attachment";
                        } else {
                          displayVal = String(val);
                        }
                      }
                      return (
                        <td key={f.id} className="px-4 py-3 max-w-[240px]">
                          <span className="text-xs text-foreground truncate block">{displayVal}</span>
                        </td>
                      );
                    })}

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-muted">
                        {formatDate(sub.completed_at || sub.started_at)}
                      </span>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <Chip color={sub.status === "completed" ? "success" : "default"} size="sm">
                        {sub.status === "completed" ? "Completed" : "In Progress"}
                      </Chip>
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="tertiary"
                        aria-label="View submission details"
                        onPress={() => setSelectedSubmission(sub)}
                      >
                        <Eye className="size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        {data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted bg-slate-50/50">
            <span>
              Showing {data.submissions.length} of {data.total} responses (Page {data.page} of {data.totalPages})
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="tertiary"
                isDisabled={data.page <= 1 || isPending}
                onPress={() => fetchSubmissions(data.page - 1)}
              >
                <ArrowLeft className="size-3.5" />
                Previous
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                isDisabled={data.page >= data.totalPages || isPending}
                onPress={() => fetchSubmissions(data.page + 1)}
              >
                Next
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Submission Detail Modal */}
      <SubmissionDetailModal
        isOpen={selectedSubmission !== null}
        submission={selectedSubmission}
        onClose={() => setSelectedSubmission(null)}
      />
    </div>
  );
}
