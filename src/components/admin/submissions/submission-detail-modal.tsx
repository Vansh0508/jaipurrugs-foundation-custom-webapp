"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, FileText, Xmark } from "@gravity-ui/icons";
import { Button, Chip, Modal } from "@heroui/react";
import { getSignedUploadUrl } from "@/lib/actions/submissions";

type AnswerRow = {
  id: string;
  field_id: string;
  value: unknown;
  field_snapshot: {
    label?: string | null;
    type?: string;
    position?: number;
  } | null;
};

type SubmissionDetail = {
  id: string;
  submitter_token: string;
  status: "completed" | "in_progress";
  started_at: string;
  completed_at: string | null;
  created_at: string;
  form_answers: AnswerRow[];
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

export function SubmissionDetailModal({
  submission,
  isOpen,
  onClose,
}: {
  submission: SubmissionDetail | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loadingUrls, setLoadingUrls] = useState(false);

  useEffect(() => {
    if (!submission || !isOpen) return;

    // Generate signed URLs for file upload answers
    const fileAnswers = submission.form_answers.filter(
      (a) => a.field_snapshot?.type === "file_upload" && a.value,
    );

    if (fileAnswers.length === 0) return;

    setLoadingUrls(true);
    const fetchUrls = async () => {
      const urlMap: Record<string, string> = {};
      for (const ans of fileAnswers) {
        try {
          const val = ans.value as { path?: string };
          if (val?.path) {
            const url = await getSignedUploadUrl(val.path);
            urlMap[ans.id] = url;
          }
        } catch {
          // ignore failed signed URL fetch
        }
      }
      setSignedUrls(urlMap);
      setLoadingUrls(false);
    };

    fetchUrls();
  }, [submission, isOpen]);

  if (!submission) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Backdrop />
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-2xl">
          <Modal.Header className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-3">
              <FileText className="size-5 text-muted" />
              <div className="flex flex-col">
                <span className="text-base font-semibold text-foreground">Response Detail</span>
                <span className="text-xs text-muted font-mono">{submission.id}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Chip color={submission.status === "completed" ? "success" : "default"} size="sm">
                {submission.status}
              </Chip>
              <Button isIconOnly size="sm" variant="tertiary" onPress={onClose}>
                <Xmark className="size-4" />
              </Button>
            </div>
          </Modal.Header>

          <Modal.Body className="flex flex-col gap-4 py-4 max-h-[70vh] overflow-y-auto">
            {/* Metadata bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
              <div>
                <span className="text-muted block">Submitter Token</span>
                <span className="font-mono font-medium text-foreground truncate block">
                  {submission.submitter_token}
                </span>
              </div>
              <div>
                <span className="text-muted block">Started At</span>
                <span className="font-medium text-foreground">
                  {formatDate(submission.started_at)}
                </span>
              </div>
              <div>
                <span className="text-muted block">Completed At</span>
                <span className="font-medium text-foreground">
                  {formatDate(submission.completed_at)}
                </span>
              </div>
            </div>

            {/* Answer Rows */}
            <div className="flex flex-col gap-3 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Submitted Answers</h4>
              {submission.form_answers.length === 0 ? (
                <p className="text-sm text-muted italic">No answers recorded for this submission yet.</p>
              ) : (
                submission.form_answers.map((ans, idx) => {
                  const label = ans.field_snapshot?.label || `Field ${idx + 1}`;
                  const fieldType = ans.field_snapshot?.type;
                  const rawVal = ans.value;

                  return (
                    <div key={ans.id} className="flex flex-col gap-1 rounded-xl border border-border bg-white p-3 text-sm shadow-2xs">
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span className="font-semibold text-foreground">{label}</span>
                        {fieldType ? <span className="font-mono text-[10px] uppercase bg-slate-100 px-1.5 py-0.5 rounded">{fieldType}</span> : null}
                      </div>

                      <div className="pt-1 text-foreground">
                        {fieldType === "file_upload" && rawVal ? (
                          <div className="flex items-center justify-between rounded-lg border border-border bg-slate-50 p-2 text-xs">
                            <span className="truncate max-w-[280px]">{(rawVal as { name?: string }).name || "Uploaded File"}</span>
                            {signedUrls[ans.id] ? (
                              <a
                                href={signedUrls[ans.id]}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
                              >
                                <ArrowDownToLine className="size-3.5" />
                                Download
                              </a>
                            ) : loadingUrls ? (
                              <span className="text-muted/60">Generating link...</span>
                            ) : (
                              <span className="text-muted/60">No preview</span>
                            )}
                          </div>
                        ) : Array.isArray(rawVal) ? (
                          <div className="flex flex-wrap gap-1">
                            {rawVal.map((item, i) => (
                              <span key={i} className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-foreground">
                                {String(item)}
                              </span>
                            ))}
                          </div>
                        ) : typeof rawVal === "object" && rawVal !== null ? (
                          <pre className="text-xs font-mono bg-slate-50 p-2 rounded max-h-32 overflow-auto">
                            {JSON.stringify(rawVal, null, 2)}
                          </pre>
                        ) : (
                          <p className="whitespace-pre-wrap">{rawVal !== null && rawVal !== undefined ? String(rawVal) : "—"}</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Modal.Body>

          <Modal.Footer className="border-t border-border pt-3">
            <Button size="sm" variant="tertiary" onPress={onClose}>
              Close
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal>
  );
}
