"use client";

import { useState } from "react";
import { Button, Input, Label, ListBox, Modal, Select, Spinner, TextField, toast } from "@heroui/react";
import { sendTemplateFromInbox, type ComposerTemplate } from "@/lib/actions/inbox";
import { TemplatePreview } from "../templates/template-preview";

function keyOf(t: ComposerTemplate) {
  return `${t.summary.name}:${t.summary.language}`;
}

export type ComposerTemplates = { templates: ComposerTemplate[]; error?: string } | null;

function Composer({
  conversationId,
  data,
  onSent,
}: {
  conversationId: string;
  data: ComposerTemplates;
  onSent: () => void;
}) {
  const templates = data?.templates ?? null;
  const loadError = data?.error ?? null;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState(false);

  const selected = templates?.find((t) => keyOf(t) === selectedKey) ?? null;

  function choose(key: string) {
    setSelectedKey(key);
    const template = templates?.find((t) => keyOf(t) === key);
    setValues(template ? { ...template.values } : {});
  }

  async function handleSend() {
    if (!selected) return;
    setIsSending(true);
    const result = await sendTemplateFromInbox(conversationId, selected.summary.name, selected.summary.language, values);
    setIsSending(false);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    toast.success("Template sent.");
    onSent();
  }

  if (loadError) return <p className="text-sm text-danger">{loadError}</p>;
  if (!templates) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="sm" />
      </div>
    );
  }

  if (templates.length === 0) {
    return <p className="text-sm text-muted">No approved templates on this WhatsApp account yet — create one under WhatsApp Templates.</p>;
  }

  const params = selected ? selected.summary.variables.map((v) => values[v.key] ?? "") : [];

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col gap-4">
        <Select value={selectedKey} onChange={(k) => k && choose(String(k))}>
          <Label>Approved template</Label>
          <Select.Trigger>
            <Select.Value>
              {({ defaultChildren, isPlaceholder }) =>
                isPlaceholder ? <span className="text-muted">Choose a template…</span> : defaultChildren
              }
            </Select.Value>
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {templates.map((t) => (
                <ListBox.Item key={keyOf(t)} id={keyOf(t)} textValue={t.summary.name}>
                  <span className="font-mono text-xs">{t.summary.name}</span>
                  <span className="text-xs text-muted"> · {t.summary.language}</span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        {selected ? (
          selected.summary.variables.length === 0 ? (
            <p className="text-sm text-muted">This template has no variables.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted">
                Filled from the contact&apos;s lead details where known. Fill in anything missing, or override a value
                for this send.
              </p>
              {selected.summary.variables.map((v) => {
                const missing = selected.missing.find((m) => m.key === v.key);
                return (
                  <TextField
                    key={v.key}
                    value={values[v.key] ?? ""}
                    onChange={(value) => setValues((prev) => ({ ...prev, [v.key]: value }))}
                  >
                    <Label>
                      {`{{${v.placeholder}}}`}{" "}
                      {missing ? <span className="text-warning">— {missing.label} not saved for this contact</span> : null}
                      {selected.unbound.includes(v.key) ? <span className="text-warning">— not set up</span> : null}
                    </Label>
                    <Input />
                  </TextField>
                );
              })}
            </div>
          )
        ) : null}

        <Button isDisabled={!selected} isPending={isSending} onPress={handleSend}>
          Send template
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Preview</span>
        {selected ? <TemplatePreview params={params} summary={selected.summary} /> : null}
      </div>
    </div>
  );
}

export function TemplateComposerModal({
  conversationId,
  data,
  isOpen,
  onOpenChange,
  onSent,
}: {
  conversationId: string;
  /** null while loading. */
  data: ComposerTemplates;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
}) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-3xl">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Send a WhatsApp template</Modal.Heading>
          </Modal.Header>
          <Modal.Body>{isOpen ? <Composer conversationId={conversationId} data={data} onSent={onSent} /> : null}</Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
