"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gear, Plus, TrashBin } from "@gravity-ui/icons";
import { AlertDialog, Button, Chip, Modal, Table, toast } from "@heroui/react";
import {
  deleteTemplateAction,
  saveTemplateBindingsAction,
  type TemplateRow,
  type TemplatesOverview,
} from "@/lib/actions/templates";
import { leadFieldLabel, type LeadAttribute } from "@/lib/leads/fields";
import type { TemplateVariableBinding } from "@/lib/whatsapp/bindings";
import { TemplatePreview } from "./template-preview";
import { VariableFields, type VariableValue } from "./variable-fields";

export const STATUS_COLOR: Record<string, "success" | "warning" | "danger" | "default"> = {
  APPROVED: "success",
  PENDING: "warning",
  IN_APPEAL: "warning",
  REJECTED: "danger",
  PAUSED: "danger",
  DISABLED: "danger",
};

function rowKey(row: TemplateRow) {
  return `${row.summary.name}:${row.summary.language}`;
}

function SetupChip({ row }: { row: TemplateRow }) {
  if (row.summary.variables.length === 0) return <span className="text-xs text-muted">No variables</span>;
  if (row.bindingStatus.inactive.length > 0) {
    return (
      <Chip color="danger" size="sm" variant="soft">
        Uses a deactivated attribute
      </Chip>
    );
  }
  if (row.bindingStatus.unbound.length > 0) {
    return (
      <Chip color="warning" size="sm" variant="soft">
        {row.bindingStatus.unbound.length} variable(s) not set up
      </Chip>
    );
  }
  return (
    <Chip color="success" size="sm" variant="soft">
      Variables set up
    </Chip>
  );
}

function ConfigureForm({
  row,
  attributes,
  onSaved,
}: {
  row: TemplateRow;
  attributes: LeadAttribute[];
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, VariableValue>>(
    Object.fromEntries(
      row.bindings.map((b) => [b.key, { field: b.field, fallback: b.fallback ?? "" } satisfies VariableValue]),
    ),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview with each variable shown as the field it reads, e.g. "[Village]".
  const previewParams = row.summary.variables.map((v) => {
    const field = values[v.key]?.field;
    return field ? `[${leadFieldLabel(field, attributes)}]` : "";
  });

  async function handleSave() {
    const bindings: TemplateVariableBinding[] = [];
    for (const variable of row.summary.variables) {
      const value = values[variable.key];
      if (!value?.field) {
        setError(`Choose a lead field for {{${variable.placeholder}}}.`);
        return;
      }
      bindings.push({ key: variable.key, field: value.field, fallback: value.fallback.trim() || null });
    }
    setIsSaving(true);
    setError(null);
    const result = await saveTemplateBindingsAction(row.summary.name, row.summary.language, bindings);
    setIsSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success("Variable setup saved.");
    onSaved();
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        <VariableFields
          attributes={attributes}
          showExample={false}
          values={values}
          variables={row.summary.variables}
          onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {row.summary.variables.length > 0 ? (
          <Button isPending={isSaving} onPress={handleSave}>
            Save variable setup
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Preview</span>
        <TemplatePreview params={previewParams} summary={row.summary} />
      </div>
    </div>
  );
}

export function TemplatesManager({
  overview,
  attributes,
}: {
  overview: TemplatesOverview;
  attributes: LeadAttribute[];
}) {
  const router = useRouter();
  const [configuringKey, setConfiguringKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TemplateRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const configuring = overview.templates.find((t) => rowKey(t) === configuringKey) ?? null;

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    const result = await deleteTemplateAction(pendingDelete.summary.name, pendingDelete.summary.language);
    setIsDeleting(false);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    toast.success(`Deleted ${pendingDelete.summary.name}.`);
    setPendingDelete(null);
    router.refresh();
  }

  if (!overview.accountLabel && overview.error) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-12 text-center">
        <p className="text-sm font-medium">WhatsApp isn&apos;t connected</p>
        <p className="text-sm text-muted">{overview.error}</p>
        <Link className="mt-2 inline-block text-sm text-accent underline" href="/settings">
          Open Settings
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        {overview.error ? <p className="text-sm text-danger">{overview.error}</p> : <span />}
        <Button onPress={() => router.push("/templates/new")}>
          <Plus className="size-4" />
          New template
        </Button>
      </div>

      {overview.templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted">
          No templates on this WhatsApp account yet.
        </div>
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="WhatsApp templates" className="w-full min-w-[760px]">
              <Table.Header>
                <Table.Column isRowHeader>Template</Table.Column>
                <Table.Column>Language</Table.Column>
                <Table.Column>Category</Table.Column>
                <Table.Column>Meta status</Table.Column>
                <Table.Column>Variables</Table.Column>
                <Table.Column className="w-24 text-right">
                  <span className="sr-only">Actions</span>
                </Table.Column>
              </Table.Header>
              <Table.Body>
                {overview.templates.map((row) => (
                  <Table.Row key={rowKey(row)}>
                    <Table.Cell>
                      <div className="flex min-w-0 flex-col">
                        <span className="font-mono text-sm font-medium">{row.summary.name}</span>
                        <span className="line-clamp-1 text-xs text-muted">{row.summary.bodyText}</span>
                      </div>
                    </Table.Cell>
                    <Table.Cell>{row.summary.language}</Table.Cell>
                    <Table.Cell className="capitalize">{row.summary.category.toLowerCase()}</Table.Cell>
                    <Table.Cell>
                      <Chip color={STATUS_COLOR[row.summary.status] ?? "default"} size="sm" variant="soft">
                        {row.summary.status.toLowerCase().replace("_", " ")}
                      </Chip>
                    </Table.Cell>
                    <Table.Cell>
                      <SetupChip row={row} />
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          isIconOnly
                          aria-label="Preview and configure variables"
                          size="sm"
                          variant="ghost"
                          onPress={() => setConfiguringKey(rowKey(row))}
                        >
                          <Gear className="size-4" />
                        </Button>
                        <Button
                          isIconOnly
                          aria-label="Delete template"
                          size="sm"
                          variant="ghost"
                          onPress={() => setPendingDelete(row)}
                        >
                          <TrashBin className="size-4 text-danger" />
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}

      <Modal.Backdrop isOpen={configuring !== null} onOpenChange={(open) => !open && setConfiguringKey(null)}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-4xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>
                <span className="font-mono">{configuring?.summary.name}</span>{" "}
                <span className="text-sm font-normal text-muted">({configuring?.summary.language})</span>
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {configuring ? (
                <ConfigureForm
                  key={rowKey(configuring)}
                  attributes={attributes}
                  row={configuring}
                  onSaved={() => {
                    setConfiguringKey(null);
                    router.refresh();
                  }}
                />
              ) : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <AlertDialog isOpen={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[420px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>
                  Delete {pendingDelete?.summary.name} ({pendingDelete?.summary.language})?
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  This deletes the template on Meta. The agent can no longer send it, and Meta keeps the name
                  reserved for 30 days, so it can&apos;t be recreated right away.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  Cancel
                </Button>
                <Button isPending={isDeleting} variant="danger" onPress={handleDelete}>
                  Delete template
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
