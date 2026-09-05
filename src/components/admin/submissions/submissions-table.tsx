"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowRotateLeft,
  EllipsisVertical,
  Eye,
  LayoutColumns3,
  Magnifier,
} from "@gravity-ui/icons";
import {
  Button,
  Checkbox,
  Chip,
  Dropdown,
  Input,
  Popover,
  Table,
  TextField,
  Tooltip,
  toast,
} from "@heroui/react";
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

const STATUS_COLOR = {
  completed: "success",
  in_progress: "default",
} as const;

const STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  in_progress: "In Progress",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).format(d);
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

  const [columnSearch, setColumnSearch] = useState("");
  const [hiddenFieldIds, setHiddenFieldIds] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`hidden_columns_${formId}`);
        if (stored) {
          return new Set(JSON.parse(stored));
        }
      } catch {
        // ignore
      }
    }
    return new Set();
  });

  const toggleField = (fieldId: string) => {
    setHiddenFieldIds((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) {
        next.delete(fieldId);
      } else {
        next.add(fieldId);
      }
      try {
        localStorage.setItem(`hidden_columns_${formId}`, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const showAllFields = () => {
    setHiddenFieldIds(new Set());
    try {
      localStorage.removeItem(`hidden_columns_${formId}`);
    } catch {
      // ignore
    }
  };

  const hideAllFields = () => {
    const all = new Set(activeFields.map((f) => f.id));
    setHiddenFieldIds(all);
    try {
      localStorage.setItem(`hidden_columns_${formId}`, JSON.stringify(Array.from(all)));
    } catch {
      // ignore
    }
  };

  const visibleFields = activeFields.filter((f) => !hiddenFieldIds.has(f.id));
  const filteredColumns = activeFields.filter((f) =>
    (f.label || "Question").toLowerCase().includes(columnSearch.toLowerCase()),
  );

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
                className={`rounded-lg px-3 py-1.5 transition-all ${statusFilter === st
                    ? "bg-white text-foreground shadow-xs font-semibold"
                    : "text-muted hover:text-foreground"
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

        {/* Right Action Buttons: Hide Columns & Export CSV */}
        <div className="flex items-center gap-2">
          {activeFields.length > 0 && (
            <Popover>
              <Button
                size="sm"
                variant="tertiary"
                className="bg-white border border-border hover:bg-slate-50 text-foreground font-medium"
              >
                <LayoutColumns3 className="size-4 text-muted" />
                Hide Columns
                {hiddenFieldIds.size > 0 && (
                  <span className="ml-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200/80 px-1.5 py-0.2 text-[10px] font-bold">
                    {hiddenFieldIds.size} hidden
                  </span>
                )}
              </Button>
              <Popover.Content className="w-80 p-3.5 bg-white shadow-xl rounded-2xl border border-border">
                <Popover.Dialog className="flex flex-col gap-3 outline-none">
                  <div className="flex items-center justify-between pb-2 border-b border-border/60">
                    <span className="text-xs font-bold text-foreground">Columns</span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs font-semibold text-primary hover:bg-primary/10"
                        onPress={showAllFields}
                      >
                        Show all
                      </Button>
                      <span className="text-muted/30">•</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs font-semibold text-muted hover:text-danger hover:bg-danger/10"
                        onPress={hideAllFields}
                      >
                        Hide all
                      </Button>
                    </div>
                  </div>

                  {activeFields.length > 5 && (
                    <TextField
                      aria-label="Filter columns"
                      value={columnSearch}
                      onChange={(val) => setColumnSearch(val)}
                    >
                      <div className="relative flex items-center">
                        <Magnifier className="absolute left-2.5 size-3.5 text-muted pointer-events-none" />
                        <Input
                          className="pl-8 text-xs h-8"
                          placeholder="Filter columns..."
                        />
                      </div>
                    </TextField>
                  )}

                  <div className="flex flex-col gap-0.5 max-h-60 overflow-y-auto pr-1">
                    {filteredColumns.length === 0 ? (
                      <p className="text-xs text-muted text-center py-4">No matching columns</p>
                    ) : (
                      filteredColumns.map((f) => {
                        const isVisible = !hiddenFieldIds.has(f.id);
                        const labelText = f.label || "Untitled question";
                        return (
                          <Checkbox
                            key={f.id}
                            isSelected={isVisible}
                            onChange={() => toggleField(f.id)}
                            aria-label={labelText}
                            className="w-full block"
                          >
                            <Checkbox.Content className="flex flex-row items-center gap-2.5 w-full px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-xs text-foreground transition-colors select-none">
                              <Checkbox.Control className="shrink-0">
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                              <span className="truncate flex-1 text-left" title={labelText}>
                                {labelText}
                              </span>
                            </Checkbox.Content>
                          </Checkbox>
                        );
                      })
                    )}
                  </div>
                </Popover.Dialog>
              </Popover.Content>
            </Popover>
          )}

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
      </div>

      {/* Submissions Table / Empty State */}
      {data.submissions.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border p-16 text-center bg-white">
          <p className="font-semibold text-foreground">No submissions found</p>
          <p className="text-sm text-muted">
            Adjust your status filter or search query to find responses.
          </p>
        </div>
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content
              aria-label="Submissions"
              className="w-full table-fixed"
            >
              <Table.Header>
                <Table.Column className="w-12" isRowHeader>
                  #
                </Table.Column>
                {visibleFields.map((f) => {
                  const originalIdx = activeFields.findIndex((field) => field.id === f.id);
                  const headerText = f.label || `Question ${originalIdx + 1}`;
                  return (
                    <Table.Column key={f.id} className="truncate">
                      <Tooltip delay={0} closeDelay={0}>
                        <Tooltip.Trigger>
                          <span className="truncate block cursor-help">
                            {headerText}
                          </span>
                        </Tooltip.Trigger>
                        <Tooltip.Content className="max-w-xs rounded-xl border border-border bg-slate-900 px-3 py-1.5 text-xs text-white shadow-lg">
                          {headerText}
                        </Tooltip.Content>
                      </Tooltip>
                    </Table.Column>
                  );
                })}
                <Table.Column className="w-40">Submitted at</Table.Column>
                <Table.Column className="w-28">Status</Table.Column>
                <Table.Column className="w-16 text-right">Actions</Table.Column>
              </Table.Header>
              <Table.Body>
                {data.submissions.map((sub, rowIdx) => {
                  const answerMap = new Map(
                    sub.form_answers.map((a) => [a.field_id, a.value]),
                  );
                  const responseNumber = (data.page - 1) * 25 + (rowIdx + 1);

                  return (
                    <Table.Row
                      key={sub.id}
                      className="cursor-pointer hover:bg-slate-50/70"
                      onClick={() => setSelectedSubmission(sub)}
                    >
                      <Table.Cell className="font-mono text-xs font-semibold text-muted">
                        #{responseNumber}
                      </Table.Cell>

                      {visibleFields.map((f) => {
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
                          <Table.Cell key={f.id} className="truncate">
                            <span className="text-foreground truncate block">
                              {displayVal}
                            </span>
                          </Table.Cell>
                        );
                      })}

                      <Table.Cell className="text-muted text-xs">
                        {formatDate(sub.completed_at || sub.started_at)}
                      </Table.Cell>

                      <Table.Cell>
                        <Chip color={STATUS_COLOR[sub.status]} size="sm">
                          {STATUS_LABEL[sub.status] || sub.status}
                        </Chip>
                      </Table.Cell>

                      <Table.Cell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Dropdown>
                          <Button
                            aria-label="Submission actions"
                            className="h-8 w-8 bg-transparent text-muted hover:text-foreground"
                            isIconOnly
                            size="sm"
                            variant="ghost"
                          >
                            <EllipsisVertical className="size-4" />
                          </Button>
                          <Dropdown.Popover placement="bottom end">
                            <Dropdown.Menu
                              aria-label="Submission actions menu"
                              onAction={(key) => {
                                if (key === "view") {
                                  setSelectedSubmission(sub);
                                }
                              }}
                            >
                              <Dropdown.Item id="view" textValue="View details">
                                <span className="inline-flex items-center gap-2">
                                  <Eye className="size-3.5 text-muted" />
                                  View details
                                </span>
                              </Dropdown.Item>
                            </Dropdown.Menu>
                          </Dropdown.Popover>
                        </Dropdown>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}

      {/* Pagination Controls */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted bg-slate-50/50 rounded-b-2xl">
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

      {/* Submission Detail Modal */}
      <SubmissionDetailModal
        isOpen={selectedSubmission !== null}
        submission={selectedSubmission}
        onClose={() => setSelectedSubmission(null)}
      />
    </div>
  );
}
