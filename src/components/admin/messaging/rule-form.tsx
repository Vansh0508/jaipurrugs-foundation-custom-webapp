"use client";

import { useState } from "react";
import { Button, Description, Input, Label, ListBox, Select, Switch, TextField } from "@heroui/react";
import { RULE_ANCHORS, fromMinutes, toMinutes, type OffsetUnit, type RuleAnchor, type RuleInput, type TemplateOption } from "@/lib/visits/messaging";

export interface RuleFormValue {
  name: string;
  anchor: string;
  offsetMinutes: number;
  templateName: string;
  templateLanguage: string;
  enabled: boolean;
}

const UNIT_OPTIONS: { id: OffsetUnit; label: string }[] = [
  { id: "minutes", label: "minutes" },
  { id: "hours", label: "hours" },
  { id: "days", label: "days" },
];

const templateKey = (t: { name: string; language: string }) => `${t.name}::${t.language}`;

/** One scheduled message: when it goes out, and which approved template. Shared by visits and sequences. */
export function RuleForm({
  value,
  templates,
  templatesError,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  value: RuleFormValue | null;
  templates: TemplateOption[];
  templatesError?: string;
  submitLabel: string;
  onSubmit: (input: RuleInput) => Promise<{ error?: string }>;
  onCancel?: () => void;
}) {
  const initial = fromMinutes(value?.offsetMinutes ?? 180);
  const [name, setName] = useState(value?.name ?? "");
  const [anchor, setAnchor] = useState(value?.anchor ?? "on_complete");
  const [amount, setAmount] = useState(String(initial.amount));
  const [unit, setUnit] = useState<OffsetUnit>(initial.unit);
  const [template, setTemplate] = useState(value ? templateKey({ name: value.templateName, language: value.templateLanguage }) : "");
  const [enabled, setEnabled] = useState(value?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const chosen = templates.find((t) => templateKey(t) === template);
  // Keep a template that is no longer approved selectable so an existing rule still shows what it points at.
  const options = [...templates];
  if (value && template && !chosen) {
    options.push({ name: value.templateName, language: value.templateLanguage, bodyText: "", ready: false, usesVisitFields: false });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    const [templateName, templateLanguage] = template.split("::");
    const result = await onSubmit({
      name,
      anchor: anchor as RuleAnchor,
      offsetMinutes: toMinutes(Number(amount || 0), unit),
      templateName: templateName ?? "",
      templateLanguage: templateLanguage ?? "",
      enabled,
    });
    setIsPending(false);
    if (result.error) setError(result.error);
  }

  return (
    <form className="flex flex-col gap-4 rounded-2xl border border-border/70 p-4" onSubmit={handleSubmit}>
      <TextField isRequired value={name} onChange={setName}>
        <Label>Name</Label>
        <Input placeholder="e.g. Thank-you with feedback link" />
      </TextField>

      <div className="grid gap-4 sm:grid-cols-[100px_130px_1fr]">
        <TextField value={amount} onChange={setAmount}>
          <Label>Delay</Label>
          <Input min={0} type="number" />
        </TextField>
        <Select value={unit} onChange={(key) => key && setUnit(String(key) as OffsetUnit)}>
          <Label>Unit</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {UNIT_OPTIONS.map((u) => (
                <ListBox.Item key={u.id} id={u.id} textValue={u.label}>
                  {u.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Select value={anchor} onChange={(key) => key && setAnchor(String(key))}>
          <Label>Sent</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {RULE_ANCHORS.map((a) => (
                <ListBox.Item key={a.id} id={a.id} textValue={a.label}>
                  {a.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      <Select isRequired value={template || null} onChange={(key) => key && setTemplate(String(key))}>
        <Label>WhatsApp template</Label>
        <Select.Trigger>
          <Select.Value>
            {({ defaultChildren, isPlaceholder }) => (isPlaceholder ? <span className="text-muted">Choose an approved template…</span> : defaultChildren)}
          </Select.Value>
          <Select.Indicator />
        </Select.Trigger>
        <Description>
          {templatesError ??
            "Outside the 24-hour window only approved templates can be sent. Use a Utility template; one whose variables use the \"Visit: …\" fields is filled from the visit automatically."}
        </Description>
        <Select.Popover>
          <ListBox>
            {options.map((t) => (
              <ListBox.Item key={templateKey(t)} id={templateKey(t)} isDisabled={!t.ready && templateKey(t) !== template} textValue={`${t.name} (${t.language})`}>
                {t.name} ({t.language})
                {!t.ready ? <span className="text-xs text-danger"> — variables not set up</span> : null}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      {chosen?.bodyText ? (
        <p className="rounded-xl bg-neutral-50 p-3 text-sm text-muted whitespace-pre-wrap">{chosen.bodyText}</p>
      ) : null}
      {chosen && !chosen.usesVisitFields ? (
        <p className="text-xs text-muted">This template doesn&apos;t use any visit fields, so every guest receives the same text.</p>
      ) : null}

      <Switch isSelected={enabled} onChange={setEnabled}>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          Enabled
        </Switch.Content>
      </Switch>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button isPending={isPending} type="submit">
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="tertiary" onPress={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
