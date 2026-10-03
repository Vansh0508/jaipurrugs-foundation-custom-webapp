"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, TrashBin } from "@gravity-ui/icons";
import {
  Button,
  Description,
  Input,
  Label,
  ListBox,
  RadioGroup,
  Radio,
  Select,
  TextArea,
  TextField,
  toast,
} from "@heroui/react";
import { createTemplateAction } from "@/lib/actions/templates";
import type { LeadAttribute } from "@/lib/leads/fields";
import {
  draftExampleParams,
  EMPTY_DRAFT,
  LIMITS,
  summarizeDraft,
  TEMPLATE_CATEGORIES,
  TEMPLATE_LANGUAGES,
  validateDraft,
  type TemplateButtonDraft,
  type TemplateDraft,
} from "@/lib/whatsapp/template-builder";
import { placeholdersIn } from "@/lib/whatsapp/templates";
import { TemplatePreview } from "./template-preview";
import { VariableFields } from "./variable-fields";

const BUTTON_TYPES = [
  { id: "QUICK_REPLY", label: "Quick reply" },
  { id: "URL", label: "Website link" },
  { id: "PHONE_NUMBER", label: "Call number" },
] as const;

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className={`text-xs ${value.length > max ? "text-danger" : "text-muted"}`}>
      {value.length}/{max}
    </span>
  );
}

export function TemplateBuilder({ attributes }: { attributes: LeadAttribute[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<TemplateDraft>(EMPTY_DRAFT);
  const [newVariableName, setNewVariableName] = useState("");
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const summary = useMemo(() => summarizeDraft(draft), [draft]);
  const liveErrors = useMemo(() => validateDraft(draft), [draft]);
  const previewParams = draftExampleParams(draft, summary);

  function update(patch: Partial<TemplateDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setSubmitErrors([]);
  }

  function insertBodyVariable() {
    if (draft.parameterFormat === "POSITIONAL") {
      const next = placeholdersIn(draft.bodyText).length + 1;
      update({ bodyText: `${draft.bodyText}{{${next}}}` });
      return;
    }
    const name = newVariableName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      toast.danger("Variable names are lowercase letters, numbers and _, starting with a letter.");
      return;
    }
    update({ bodyText: `${draft.bodyText}{{${name}}}` });
    setNewVariableName("");
  }

  function setButton(index: number, button: TemplateButtonDraft) {
    update({ buttons: draft.buttons.map((b, i) => (i === index ? button : b)) });
  }

  function addButton(type: TemplateButtonDraft["type"]) {
    const button: TemplateButtonDraft =
      type === "URL"
        ? { type, text: "", url: "https://" }
        : type === "PHONE_NUMBER"
          ? { type, text: "", phoneNumber: "+91" }
          : { type, text: "" };
    update({ buttons: [...draft.buttons, button] });
  }

  async function handleSubmit() {
    if (liveErrors.length > 0) {
      setSubmitErrors(liveErrors);
      return;
    }
    setIsSubmitting(true);
    const result = await createTemplateAction(draft);
    setIsSubmitting(false);
    if (result.errors?.length) {
      setSubmitErrors(result.errors);
      return;
    }
    if (result.error && !result.status) {
      setSubmitErrors([result.error]);
      return;
    }
    if (result.error) toast.warning(result.error);
    toast.success(`Submitted to Meta — status: ${(result.status ?? "PENDING").toLowerCase()}.`);
    router.push("/templates");
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-6">
        {/* Basics */}
        <section className="flex flex-col gap-4">
          <TextField
            isRequired
            value={draft.name}
            onChange={(name) => update({ name: name.toLowerCase().replace(/[\s-]+/g, "_") })}
          >
            <Label>Template name</Label>
            <Input className="font-mono" placeholder="submission_receipt" />
            <Description>Lowercase letters, numbers and underscores. Can&apos;t be changed after submitting.</Description>
          </TextField>
          <div className="flex flex-wrap gap-4">
            <Select
              className="w-56"
              value={draft.category}
              onChange={(k) => k && update({ category: k as TemplateDraft["category"] })}
            >
              <Label>Category</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Description>{TEMPLATE_CATEGORIES.find((c) => c.id === draft.category)?.hint}</Description>
              <Select.Popover>
                <ListBox>
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <ListBox.Item key={c.id} id={c.id} textValue={c.label}>
                      {c.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <Select className="w-48" value={draft.language} onChange={(k) => k && update({ language: String(k) })}>
              <Label>Language</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {TEMPLATE_LANGUAGES.map((l) => (
                    <ListBox.Item key={l.id} id={l.id} textValue={l.label}>
                      {l.label} <span className="text-xs text-muted">({l.id})</span>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
          <RadioGroup
            orientation="horizontal"
            value={draft.parameterFormat}
            onChange={(v) => update({ parameterFormat: v as TemplateDraft["parameterFormat"], variables: {} })}
          >
            <Label>Variable style</Label>
            <Radio value="POSITIONAL">
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                Numbered — {"{{1}}, {{2}}"}
              </Radio.Content>
            </Radio>
            <Radio value="NAMED">
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                Named — {"{{artisan_name}}"}
              </Radio.Content>
            </Radio>
          </RadioGroup>
        </section>

        {/* Content */}
        <section className="flex flex-col gap-4">
          <TextField value={draft.headerText} onChange={(headerText) => update({ headerText })}>
            <div className="flex items-center justify-between">
              <Label>Header (optional)</Label>
              <Counter max={LIMITS.header} value={draft.headerText} />
            </div>
            <Input placeholder="Form received" />
            <Description>Text only, up to one variable.</Description>
          </TextField>

          <TextField isRequired value={draft.bodyText} onChange={(bodyText) => update({ bodyText })}>
            <div className="flex items-center justify-between">
              <Label>Body</Label>
              <Counter max={LIMITS.body} value={draft.bodyText} />
            </div>
            <TextArea placeholder="Namaste {{1}}, we have received your form. …" rows={6} />
            <Description>Supports *bold*, _italic_ and ~strikethrough~. Variables can&apos;t be the very first or last thing.</Description>
          </TextField>
          <div className="flex flex-wrap items-end gap-2">
            {draft.parameterFormat === "NAMED" ? (
              <TextField className="w-56" value={newVariableName} onChange={setNewVariableName}>
                <Label>Variable name</Label>
                <Input className="font-mono" placeholder="artisan_name" />
              </TextField>
            ) : null}
            <Button size="sm" variant="secondary" onPress={insertBodyVariable}>
              <Plus className="size-4" />
              Insert variable in body
            </Button>
          </div>

          <TextField value={draft.footerText} onChange={(footerText) => update({ footerText })}>
            <div className="flex items-center justify-between">
              <Label>Footer (optional)</Label>
              <Counter max={LIMITS.footer} value={draft.footerText} />
            </div>
            <Input placeholder="Jaipur Rugs Foundation" />
          </TextField>
        </section>

        {/* Buttons */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Buttons (optional)</h2>
            <div className="flex flex-wrap gap-1.5">
              {BUTTON_TYPES.map((t) => (
                <Button
                  key={t.id}
                  isDisabled={draft.buttons.length >= LIMITS.buttons}
                  size="sm"
                  variant="ghost"
                  onPress={() => addButton(t.id)}
                >
                  <Plus className="size-3.5" />
                  {t.label}
                </Button>
              ))}
            </div>
          </div>
          {draft.buttons.map((button, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3 rounded-xl border border-border/70 p-3">
              <span className="pb-2 text-xs text-muted">{BUTTON_TYPES.find((t) => t.id === button.type)?.label}</span>
              <TextField className="w-44" value={button.text} onChange={(text) => setButton(i, { ...button, text })}>
                <Label>Text</Label>
                <Input />
              </TextField>
              {button.type === "URL" ? (
                <TextField className="min-w-60 flex-1" value={button.url} onChange={(url) => setButton(i, { ...button, url })}>
                  <Label>URL</Label>
                  <Input className="font-mono text-xs" placeholder="https://jaipurrugs.org/track/{{1}}" />
                  <Description>Optionally end with {"{{1}}"} to add a per-contact value.</Description>
                </TextField>
              ) : null}
              {button.type === "PHONE_NUMBER" ? (
                <TextField
                  className="w-52"
                  value={button.phoneNumber}
                  onChange={(phoneNumber) => setButton(i, { ...button, phoneNumber })}
                >
                  <Label>Phone number</Label>
                  <Input placeholder="+919876543210" />
                </TextField>
              ) : null}
              <Button
                isIconOnly
                aria-label="Remove button"
                size="sm"
                variant="ghost"
                onPress={() => update({ buttons: draft.buttons.filter((_, j) => j !== i) })}
              >
                <TrashBin className="size-4 text-danger" />
              </Button>
            </div>
          ))}
        </section>

        {/* Variables */}
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold">Variables</h2>
            <p className="text-sm text-muted">
              Each variable is filled from the contact&apos;s lead details when the agent sends it. With no
              fallback, the agent asks the contact for a missing detail first.
            </p>
          </div>
          <VariableFields
            attributes={attributes}
            showExample
            values={draft.variables}
            variables={summary.variables}
            onChange={(key, value) =>
              update({
                variables: {
                  ...draft.variables,
                  [key]: { example: value.example ?? "", field: value.field, fallback: value.fallback },
                },
              })
            }
          />
        </section>

        {submitErrors.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-xl bg-danger/10 p-3 text-sm text-danger">
            {submitErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-center gap-3 border-t border-border/60 pt-4">
          <Button isPending={isSubmitting} onPress={handleSubmit}>
            Submit to Meta for review
          </Button>
          <Button variant="tertiary" onPress={() => router.push("/templates")}>
            Cancel
          </Button>
          {liveErrors.length > 0 && submitErrors.length === 0 ? (
            <span className="text-xs text-muted">{liveErrors.length} thing(s) left to fix</span>
          ) : null}
        </div>
      </div>

      <aside className="flex flex-col gap-2 lg:sticky lg:top-0 lg:self-start">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Preview (with example values)</span>
        <TemplatePreview params={previewParams} summary={summary} />
      </aside>
    </div>
  );
}
