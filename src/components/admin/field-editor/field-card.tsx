"use client";

import { useState } from "react";
import { Copy, Grip, Plus, Sliders, TrashBin } from "@gravity-ui/icons";
import { AlertDialog, Button, Dropdown, Input, Label, Switch, TextField } from "@heroui/react";
import {
  FIELD_TYPE_ORDER,
  getFieldTypeDefinition,
  resolveSectionBackground,
  type BackgroundConfig,
  type FormFieldType,
  type SectionConfig,
} from "@/lib/forms/field-types";
import type { Tables } from "@/lib/types/supabase";
import { FieldConfigEditor } from "./field-config-editors";

export type FieldRow = Tables<"form_fields">;
type ConfigChangeOptions = { immediate?: boolean };

const TYPE_BADGES: Partial<Record<FormFieldType, string>> = {
  short_text: "Aa",
  long_text: "Aa",
  email: "@",
  number: "#",
  phone: "📱",
  date: "📅",
  dropdown: "▼",
};

export function FieldCard({
  field,
  isDragOver,
  defaultSectionBackground,
  onLabelChange,
  onDescriptionChange,
  onPlaceholderChange,
  onRequiredChange,
  onConfigChange,
  onDuplicate,
  onDelete,
  onAddFieldAfter,
  dragHandleProps,
}: {
  field: FieldRow;
  isDragOver: boolean;
  defaultSectionBackground?: BackgroundConfig;
  onLabelChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPlaceholderChange: (value: string) => void;
  onRequiredChange: (value: boolean) => void;
  onConfigChange: (config: Record<string, unknown>, options?: ConfigChangeOptions) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddFieldAfter: (type: FormFieldType) => void;
  dragHandleProps: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const definition = getFieldTypeDefinition(field.type);
  const Icon = definition.icon;

  const resolvedBg = definition.isSection
    ? resolveSectionBackground(field.config as SectionConfig, defaultSectionBackground)
    : undefined;

  const cardStyle: React.CSSProperties = {};
  if (resolvedBg?.type === "color" && resolvedBg.color) {
    cardStyle.backgroundColor = resolvedBg.color;
  } else if (resolvedBg?.type === "image" && resolvedBg.image_url) {
    cardStyle.backgroundImage = `url("${resolvedBg.image_url}")`;
    cardStyle.backgroundSize = "cover";
    cardStyle.backgroundPosition = "center";
  }

  const badgeText = TYPE_BADGES[field.type];

  return (
    <div
      className={`group relative flex flex-col gap-2 rounded-2xl p-3 transition-all ${
        isDragOver ? "ring-2 ring-accent" : ""
      } ${definition.isSection && !resolvedBg?.type ? "bg-slate-50/70 border border-slate-200/60" : "hover:bg-slate-50/50"}`}
      style={cardStyle}
    >
      {/* Tally Style Field Header: 🗑 + :: Label * */}
      <div className="flex items-center gap-1.5">
        {/* Left Action Controls (visible on hover or focus) */}
        <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <DeleteFieldButton isSection={definition.isSection} onDelete={onDelete} />

          <Dropdown>
            <Button
              aria-label="Add field after"
              isIconOnly
              size="sm"
              variant="tertiary"
              className="h-7 w-7 text-muted hover:text-foreground"
            >
              <Plus />
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu onAction={(key) => onAddFieldAfter(key as FormFieldType)}>
                {FIELD_TYPE_ORDER.map((typeKey) => {
                  const def = getFieldTypeDefinition(typeKey);
                  const TypeIcon = def.icon;
                  return (
                    <Dropdown.Item key={typeKey} id={typeKey} textValue={def.label}>
                      <TypeIcon className="size-4 shrink-0" />
                      <div className="flex flex-col">
                        <Label>{def.label}</Label>
                      </div>
                    </Dropdown.Item>
                  );
                })}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>

          <button
            aria-label="Drag to reorder"
            className="flex h-7 w-7 cursor-grab items-center justify-center rounded-lg text-muted hover:text-foreground active:cursor-grabbing"
            type="button"
            {...dragHandleProps}
          >
            <Grip />
          </button>
        </div>

        {/* Inline Label Heading */}
        <div className="flex flex-1 items-center gap-1 min-w-0">
          <TextField
            aria-label={definition.isSection ? "Section title" : "Question label"}
            className="flex-1"
            value={field.label ?? ""}
            onChange={onLabelChange}
          >
            <Input
              className={`w-full border-none bg-transparent px-0 text-base font-semibold text-foreground shadow-none focus:outline-none focus:ring-0 ${
                definition.isSection ? "text-xl font-bold" : ""
              }`}
              placeholder={definition.isSection ? "Section Title" : "Question Label"}
            />
          </TextField>

          {/* Required Indicator Switch/Asterisk */}
          {definition.supportsRequired ? (
            <button
              type="button"
              title={field.required ? "Required field (click to make optional)" : "Optional field (click to make required)"}
              className={`px-1 text-sm font-bold transition-colors ${
                field.required ? "text-danger" : "text-muted/40 hover:text-muted"
              }`}
              onClick={() => onRequiredChange(!field.required)}
            >
              *
            </button>
          ) : null}
        </div>

        {/* Right Action Controls: Type Badge & Settings Toggle */}
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-xs font-medium text-muted/70 bg-slate-100/80 px-2 py-0.5 rounded-md">
            <Icon className="size-3" />
            {definition.label}
          </span>
          <Button
            aria-label="Duplicate field"
            isIconOnly
            size="sm"
            variant="tertiary"
            className="h-7 w-7 text-muted hover:text-foreground"
            onPress={onDuplicate}
          >
            <Copy />
          </Button>
          <Button
            aria-label="Field settings"
            isIconOnly
            size="sm"
            variant={showSettings ? "secondary" : "tertiary"}
            className="h-7 w-7 text-muted hover:text-foreground"
            onPress={() => setShowSettings(!showSettings)}
          >
            <Sliders />
          </Button>
        </div>
      </div>

      {/* Field Input Box Preview (Tally Document Style) */}
      {!definition.isSection && (
        <div className="flex flex-col gap-1.5 pl-9">
          {field.description ? (
            <p className="text-xs text-muted">{field.description}</p>
          ) : null}

          <div className="relative flex items-center rounded-xl border border-border bg-white px-3.5 py-2.5 shadow-2xs">
            <TextField
              aria-label="Placeholder"
              className="flex-1"
              value={field.placeholder ?? ""}
              onChange={onPlaceholderChange}
            >
              <Input
                className="w-full border-none bg-transparent p-0 text-sm text-muted/70 shadow-none focus:outline-none focus:ring-0 placeholder:text-muted/40"
                placeholder={field.placeholder || `Enter ${field.label || "answer"}...`}
              />
            </TextField>
            {badgeText ? (
              <span className="ml-2 select-none rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-muted">
                {badgeText}
              </span>
            ) : null}
          </div>
        </div>
      )}

      {/* Advanced Settings & Inline Config Editors */}
      {(showSettings || definition.isSection) && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-white p-3 shadow-2xs mt-1 pl-9">
          <TextField aria-label="Description" value={field.description ?? ""} onChange={onDescriptionChange}>
            <Label className="text-xs font-semibold">Description</Label>
            <Input className="text-sm" placeholder="Description (optional)" />
          </TextField>

          {definition.supportsPlaceholder ? (
            <TextField aria-label="Placeholder text" value={field.placeholder ?? ""} onChange={onPlaceholderChange}>
              <Label className="text-xs font-semibold">Placeholder</Label>
              <Input className="text-sm" placeholder="Placeholder text shown to respondents" />
            </TextField>
          ) : null}

          <FieldConfigEditor
            config={field.config}
            fieldId={field.id}
            formId={field.form_id}
            type={field.type}
            onConfigChange={onConfigChange}
          />

          {definition.supportsRequired ? (
            <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
              <span>Required field</span>
              <Switch isSelected={field.required} onChange={onRequiredChange}>
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DeleteFieldButton({ isSection, onDelete }: { isSection: boolean; onDelete: () => void }) {
  return (
    <AlertDialog>
      <Button aria-label="Delete field" isIconOnly size="sm" variant="tertiary" className="h-7 w-7 text-muted hover:text-danger">
        <TrashBin />
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete this {isSection ? "section" : "field"}?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                {isSection
                  ? "The fields after it stay in the form — only this section heading is removed."
                  : "This removes the field from the form. Existing submissions keep their recorded answer."}
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                Cancel
              </Button>
              <Button slot="close" variant="danger" onPress={onDelete}>
                Delete
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
