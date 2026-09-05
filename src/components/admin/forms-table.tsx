"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowRotateLeft,
  Copy,
  EllipsisVertical,
  FileText,
  Pencil,
} from "@gravity-ui/icons";
import { Button, Chip, Dropdown, Table, toast } from "@heroui/react";
import { archiveForm, unarchiveForm } from "@/lib/actions/forms";
import type { Tables } from "@/lib/types/supabase";

export type FormRow = Pick<
  Tables<"forms">,
  "id" | "title" | "status" | "slug" | "share_token" | "updated_at"
>;

const STATUS_COLOR = {
  draft: "default",
  published: "success",
  archived: "warning",
} as const;

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function FormsTable({ forms }: { forms: FormRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (forms.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border p-16 text-center bg-white">
        <p className="font-semibold text-foreground">No forms found</p>
        <p className="text-sm text-muted">
          Create your first form or adjust your search / status filter.
        </p>
      </div>
    );
  }

  function handleAction(form: FormRow, actionKey: string) {
    if (actionKey === "edit") {
      router.push(`/forms/${form.id}/edit`);
    } else if (actionKey === "submissions") {
      router.push(`/forms/${form.id}/submissions`);
    } else if (actionKey === "copy-link") {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const path = form.slug ? `/f/${form.slug}` : `/f/${form.share_token}`;
      navigator.clipboard.writeText(`${origin}${path}`);
      toast.success("Public form link copied to clipboard");
    } else if (actionKey === "archive") {
      startTransition(async () => {
        try {
          await archiveForm(form.id);
          toast.success(`"${form.title || "Form"}" archived`);
          router.refresh();
        } catch {
          toast.danger("Could not archive the form.");
        }
      });
    } else if (actionKey === "unarchive") {
      startTransition(async () => {
        try {
          await unarchiveForm(form.id);
          toast.success(`"${form.title || "Form"}" restored to draft`);
          router.refresh();
        } catch {
          toast.danger("Could not restore the form.");
        }
      });
    }
  }

  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="Forms" className="min-w-[600px] w-full table-fixed">
          <Table.Header>
            <Table.Column isRowHeader>Title</Table.Column>
            <Table.Column className="w-36">Status</Table.Column>
            <Table.Column className="w-44">Last updated</Table.Column>
            <Table.Column className="w-20 text-right">Actions</Table.Column>
          </Table.Header>
          <Table.Body>
            {forms.map((form) => (
              <Table.Row key={form.id}>
                <Table.Cell className="truncate">
                  <Link
                    className="font-medium text-foreground hover:underline truncate"
                    href={`/forms/${form.id}/edit`}
                  >
                    {form.title || "Untitled form"}
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <Chip color={STATUS_COLOR[form.status]} size="sm">
                    {STATUS_LABEL[form.status] || form.status}
                  </Chip>
                </Table.Cell>
                <Table.Cell className="text-muted">
                  {formatDate(form.updated_at)}
                </Table.Cell>
                <Table.Cell className="text-right">
                  <Dropdown>
                    <Button
                      aria-label="Form actions"
                      className="h-8 w-8 bg-transparent text-muted hover:text-foreground"
                      isDisabled={isPending}
                      isIconOnly
                      size="sm"
                      variant="ghost"
                    >
                      <EllipsisVertical className="size-4" />
                    </Button>
                    <Dropdown.Popover placement="bottom end">
                      <Dropdown.Menu
                        aria-label="Form actions menu"
                        onAction={(key) => handleAction(form, key as string)}
                      >
                        <Dropdown.Item id="edit" textValue="Edit form">
                          <span className="inline-flex items-center gap-2">
                            <Pencil className="size-3.5 text-muted" />
                            Edit form
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item id="submissions" textValue="View submissions">
                          <span className="inline-flex items-center gap-2">
                            <FileText className="size-3.5 text-muted" />
                            View submissions
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item id="copy-link" textValue="Copy public link">
                          <span className="inline-flex items-center gap-2">
                            <Copy className="size-3.5 text-muted" />
                            Copy public link
                          </span>
                        </Dropdown.Item>
                        {form.status === "archived" ? (
                          <Dropdown.Item id="unarchive" textValue="Restore form">
                            <span className="inline-flex items-center gap-2 text-foreground font-medium">
                              <ArrowRotateLeft className="size-3.5 text-primary" />
                              Restore form
                            </span>
                          </Dropdown.Item>
                        ) : (
                          <Dropdown.Item
                            id="archive"
                            textValue="Archive form"
                            variant="danger"
                          >
                            <span className="inline-flex items-center gap-2 text-danger font-medium">
                              <Archive className="size-3.5 text-danger" />
                              Archive form
                            </span>
                          </Dropdown.Item>
                        )}
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}
