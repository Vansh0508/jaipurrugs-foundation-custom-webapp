"use client";

import { useState } from "react";
import { Copy, Eye, Grip, Paperclip, Pencil, Plus, Sliders, Star, TrashBin } from "@gravity-ui/icons";
import { AlertDialog, Button, DateField, Dropdown, Input, Label, Popover, Switch, TextArea, TextField } from "@heroui/react";
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

  return (
    <div
      className={`group relative flex flex-col gap-2 rounded-2xl p-3 transition-all ${
        isDragOver ? "ring-2 ring-accent" : ""
      } ${definition.isSection && !resolvedBg?.type ? "bg-slate-50/70 border border-slate-200/60" : "hover:bg-slate-50/50"}`}
      style={cardStyle}
    >
      {/* Tally Style Field Header: Drag handle, Question Label & Action Controls */}
      <div className="flex items-center gap-2 pl-0">
        {/* Drag handle & Quick Settings */}
        <FieldSettingsPopover
          dragHandleProps={dragHandleProps}
          field={field}
          onConfigChange={onConfigChange}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onLabelChange={onLabelChange}
          onRequiredChange={onRequiredChange}
        />

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
              className={`px-1.5 py-0.5 text-sm font-bold transition-colors cursor-pointer rounded ${
                field.required ? "text-danger" : "text-muted/40 hover:text-muted hover:bg-slate-100"
              }`}
              onClick={() => onRequiredChange(!field.required)}
            >
              *
            </button>
          ) : null}
        </div>

        {/* Right Action Controls: Type Badge, Add field, Duplicate, Settings, Delete */}
        <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100 hover:!opacity-100">
          <span className="flex items-center gap-1 text-xs font-medium text-muted/80 bg-slate-100/80 px-2 py-0.5 rounded-md mr-0.5 select-none">
            <Icon className="size-3" />
            {definition.label}
          </span>

          {/* Add Field After */}
          <Dropdown>
            <Button
              aria-label="Add field after"
              isIconOnly
              size="sm"
              variant="tertiary"
              className="h-7 w-7 text-muted hover:text-foreground hover:bg-slate-100"
            >
              <Plus className="size-3.5" />
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

          {/* Duplicate Field */}
          <Button
            aria-label="Duplicate field"
            isIconOnly
            size="sm"
            variant="tertiary"
            className="h-7 w-7 text-muted hover:text-foreground hover:bg-slate-100"
            onPress={onDuplicate}
          >
            <Copy className="size-3.5" />
          </Button>

          {/* Field Settings Toggle */}
          <Button
            aria-label="Field settings"
            isIconOnly
            size="sm"
            variant={showSettings ? "secondary" : "tertiary"}
            className={`h-7 w-7 transition-colors ${
              showSettings ? "bg-slate-200 text-foreground" : "text-muted hover:text-foreground hover:bg-slate-100"
            }`}
            onPress={() => setShowSettings(!showSettings)}
          >
            <Sliders className="size-3.5" />
          </Button>

          {/* Delete Field with Confirmation */}
          <DeleteFieldButton isSection={definition.isSection} onDelete={onDelete} />
        </div>
      </div>

      {/* Field Input Box Preview per Field Type (Flush aligned) */}
      {!definition.isSection && (
        <div className="flex flex-col gap-1.5 pl-0">
          {field.description ? (
            <p className="text-xs text-muted">{field.description}</p>
          ) : null}

          <FieldEditorPreview
            field={field}
            onConfigChange={onConfigChange}
            onPlaceholderChange={onPlaceholderChange}
          />
        </div>
      )}

      {/* Advanced Settings & Inline Config Editors */}
      {(showSettings || definition.isSection) && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-white p-3 shadow-2xs mt-1 pl-0">
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

function FieldEditorPreview({
  field,
  onPlaceholderChange,
  onConfigChange,
}: {
  field: FieldRow;
  onPlaceholderChange: (value: string) => void;
  onConfigChange: (config: Record<string, unknown>, options?: ConfigChangeOptions) => void;
}) {
  const badgeText = TYPE_BADGES[field.type];
  const config = (field.config as Record<string, unknown>) ?? {};

  switch (field.type) {
    case "long_text":
      return (
        <div className="relative flex flex-col rounded-xl border border-border bg-white p-3 shadow-2xs">
          <TextField
            aria-label="Placeholder"
            className="w-full"
            value={field.placeholder ?? ""}
            onChange={onPlaceholderChange}
          >
            <TextArea
              rows={3}
              className="w-full border-none bg-transparent p-0 text-sm text-muted/70 shadow-none focus:outline-none focus:ring-0 placeholder:text-muted/40"
              placeholder={field.placeholder || `Enter ${field.label || "answer"}...`}
            />
          </TextField>
          {badgeText ? (
            <span className="self-end mt-1 select-none rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-muted">
              {badgeText}
            </span>
          ) : null}
        </div>
      );

    case "date":
      return (
        <div className="flex items-center justify-between rounded-xl border border-border bg-white px-3.5 py-2.5 shadow-2xs">
          <DateField aria-label="Date preview">
            <DateField.Group>
              <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
            </DateField.Group>
          </DateField>
          {badgeText ? (
            <span className="select-none rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-muted">
              {badgeText}
            </span>
          ) : null}
        </div>
      );

    case "multiple_choice":
    case "checkboxes": {
      const options = (config.options as Array<{ id: string; label: string }>) ?? [
        { id: "1", label: "Option 1" },
        { id: "2", label: "Option 2" },
      ];

      function updateOptions(next: Array<{ id: string; label: string }>, immediate: boolean) {
        onConfigChange({ ...config, options: next }, { immediate });
      }

      return (
        <div className="flex flex-col gap-2 py-1">
          {options.map((opt, idx) => (
            <div key={opt.id} className="flex items-center gap-2">
              <span className="text-muted/60 text-sm">
                {field.type === "multiple_choice" ? "○" : "□"}
              </span>
              <TextField
                aria-label={`Option ${idx + 1}`}
                className="flex-1"
                value={opt.label}
                onChange={(val) => {
                  const next = options.map((o) => (o.id === opt.id ? { ...o, label: val } : o));
                  updateOptions(next, false);
                }}
              >
                <Input className="h-8 border-none bg-transparent p-0 text-sm text-foreground shadow-none focus:outline-none focus:ring-0" />
              </TextField>
              {options.length > 1 && (
                <Button
                  isIconOnly
                  size="sm"
                  variant="tertiary"
                  className="h-6 w-6 text-muted/50 hover:text-danger"
                  onPress={() => updateOptions(options.filter((o) => o.id !== opt.id), true)}
                >
                  <TrashBin className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
          <Button
            size="sm"
            variant="tertiary"
            className="self-start text-xs font-medium text-muted hover:text-foreground mt-1"
            onPress={() =>
              updateOptions(
                [...options, { id: crypto.randomUUID(), label: `Option ${options.length + 1}` }],
                true,
              )
            }
          >
            <Plus className="size-3.5" /> Add option
          </Button>
        </div>
      );
    }

    case "dropdown": {
      const options = (config.options as Array<{ id: string; label: string }>) ?? [
        { id: "1", label: "Option 1" },
        { id: "2", label: "Option 2" },
      ];

      function updateOptions(next: Array<{ id: string; label: string }>, immediate: boolean) {
        onConfigChange({ ...config, options: next }, { immediate });
      }

      return (
        <div className="flex flex-col gap-2.5">
          <div className="relative flex items-center justify-between rounded-xl border border-border bg-white px-3.5 py-2.5 shadow-2xs">
            <span className="text-sm text-muted/70">Select an option...</span>
            <span className="select-none text-xs font-medium text-muted">▼</span>
          </div>

          <div className="flex flex-col gap-1.5 pl-2 border-l-2 border-slate-100 pt-1">
            {options.map((opt, idx) => (
              <div key={opt.id} className="flex items-center gap-2">
                <span className="text-xs text-muted/50 font-mono">{idx + 1}.</span>
                <TextField
                  aria-label={`Option ${idx + 1}`}
                  className="flex-1"
                  value={opt.label}
                  onChange={(val) => {
                    const next = options.map((o) => (o.id === opt.id ? { ...o, label: val } : o));
                    updateOptions(next, false);
                  }}
                >
                  <Input className="h-7 border-none bg-transparent p-0 text-sm text-foreground shadow-none focus:outline-none focus:ring-0" />
                </TextField>
                {options.length > 1 && (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="tertiary"
                    className="h-6 w-6 text-muted/50 hover:text-danger"
                    onPress={() => updateOptions(options.filter((o) => o.id !== opt.id), true)}
                  >
                    <TrashBin className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              size="sm"
              variant="tertiary"
              className="self-start text-xs font-medium text-muted hover:text-foreground mt-0.5"
              onPress={() =>
                updateOptions(
                  [...options, { id: crypto.randomUUID(), label: `Option ${options.length + 1}` }],
                  true,
                )
              }
            >
              <Plus className="size-3.5" /> Add option
            </Button>
          </div>
        </div>
      );
    }

    case "rating": {
      const maxVal = (config.max as number) ?? 5;
      const minVal = (config.min as number) ?? 1;
      const style = (config.style as string) ?? (maxVal > 5 || minVal === 0 ? "numbers" : "stars");

      if (style === "numbers") {
        const countItems = [];
        for (let i = minVal; i <= maxVal; i++) {
          countItems.push(i);
        }
        return (
          <div className="flex flex-wrap items-center gap-1.5 py-1">
            {countItems.map((num) => (
              <span
                key={num}
                className="flex h-9 min-w-9 items-center justify-center rounded-xl border border-border bg-slate-50 text-xs font-semibold text-foreground px-2.5"
              >
                {num}
              </span>
            ))}
          </div>
        );
      }

      return (
        <div className="flex items-center gap-1 py-1">
          {Array.from({ length: maxVal }).map((_, idx) => (
            <Star key={idx} className="size-5 text-slate-300 fill-current" />
          ))}
        </div>
      );
    }

    case "linear_scale": {
      const min = (config.min as number) ?? 1;
      const max = (config.max as number) ?? 5;
      const scaleButtons = [];
      for (let i = min; i <= max; i++) {
        scaleButtons.push(i);
      }
      return (
        <div className="flex flex-col gap-1.5 py-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {scaleButtons.map((step) => (
              <span
                key={step}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-slate-50 text-xs font-medium text-foreground"
              >
                {step}
              </span>
            ))}
          </div>
          {((config.minLabel as string) || (config.maxLabel as string)) && (
            <div className="flex justify-between text-xs text-muted">
              <span>{(config.minLabel as string) ?? ""}</span>
              <span>{(config.maxLabel as string) ?? ""}</span>
            </div>
          )}
        </div>
      );
    }

    case "file_upload":
      return (
        <div className="flex items-center justify-between rounded-xl border border-dashed border-border bg-slate-50/80 px-4 py-3 text-xs text-muted">
          <div className="flex items-center gap-2">
            <Paperclip className="size-4" />
            <span>Attach file</span>
          </div>
          <span className="text-[10px] text-muted/60">Max size 10MB</span>
        </div>
      );

    default:
      return (
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
      );
  }
}

function FieldSettingsPopover({
  field,
  dragHandleProps,
  onLabelChange,
  onRequiredChange,
  onConfigChange,
  onDuplicate,
  onDelete,
}: {
  field: FieldRow;
  dragHandleProps: React.HTMLAttributes<HTMLButtonElement>;
  onLabelChange: (value: string) => void;
  onRequiredChange: (value: boolean) => void;
  onConfigChange: (config: Record<string, unknown>, options?: ConfigChangeOptions) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [tempLabel, setTempLabel] = useState(field.label ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const definition = getFieldTypeDefinition(field.type);
  const Icon = definition.icon;
  const badgeText = TYPE_BADGES[field.type];

  const config = (field.config as Record<string, unknown>) ?? {};

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger>
        <button
          aria-label="Drag to reorder or click for settings"
          className="flex h-7 w-7 cursor-grab items-center justify-center rounded-lg text-muted/60 hover:text-foreground active:cursor-grabbing hover:bg-slate-100 transition-colors"
          type="button"
          {...dragHandleProps}
        >
          <Grip className="size-4" />
        </button>
      </Popover.Trigger>
      <Popover.Content className="w-72 rounded-2xl border border-border bg-white p-3 text-foreground shadow-xl">
        <Popover.Dialog className="flex flex-col gap-2 focus:outline-none">
          {/* Header: Icon + Question Label + Pencil Icon */}
          {isEditingLabel ? (
            <div className="flex items-center gap-2 border-b border-border pb-2.5">
              <input
                autoFocus
                className="flex-1 rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                value={tempLabel}
                onChange={(e) => setTempLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onLabelChange(tempLabel);
                    setIsEditingLabel(false);
                  }
                }}
              />
              <Button
                className="h-7 px-2.5 text-xs"
                size="sm"
                variant="primary"
                onPress={() => {
                  onLabelChange(tempLabel);
                  setIsEditingLabel(false);
                }}
              >
                Save
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div className="flex items-center gap-2 font-semibold text-sm text-foreground min-w-0">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 font-mono text-xs text-muted">
                  {badgeText || <Icon className="size-3.5" />}
                </span>
                <span className="truncate max-w-[170px]">{field.label || "Question"}</span>
              </div>
              <Button
                aria-label="Edit question label"
                isIconOnly
                size="sm"
                variant="tertiary"
                className="h-6 w-6 shrink-0 text-muted hover:text-foreground"
                onPress={() => {
                  setTempLabel(field.label ?? "");
                  setIsEditingLabel(true);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
            </div>
          )}

          {/* Middle Settings: Switches & Min/Max Config */}
          <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto pr-1 py-1">
            {/* Required Switch */}
            {definition.supportsRequired && (
              <div className="flex items-center justify-between py-1 text-xs">
                <span className="font-medium text-foreground">Required</span>
                <Switch
                  isSelected={field.required}
                  onChange={(val) => onRequiredChange(val)}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </div>
            )}

            {/* Text Fields: Default answer, Min characters, Max characters */}
            {(field.type === "short_text" || field.type === "long_text") && (
              <>
                <div className="flex flex-col gap-1.5 py-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">Default answer</span>
                    <Switch
                      isSelected={config.defaultAnswer !== undefined}
                      onChange={(val) =>
                        onConfigChange({
                          ...config,
                          defaultAnswer: val ? "" : undefined,
                        })
                      }
                    >
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                  </div>
                  {config.defaultAnswer !== undefined && (
                    <input
                      className="w-full rounded-lg border border-border bg-white px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                      placeholder="Enter default answer..."
                      value={(config.defaultAnswer as string) || ""}
                      onChange={(e) =>
                        onConfigChange({ ...config, defaultAnswer: e.target.value })
                      }
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1.5 py-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">Min characters</span>
                    <Switch
                      isSelected={config.minChars !== undefined}
                      onChange={(val) =>
                        onConfigChange({
                          ...config,
                          minChars: val ? 1 : undefined,
                        })
                      }
                    >
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                  </div>
                  {config.minChars !== undefined && (
                    <input
                      className="w-full rounded-lg border border-border bg-white px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                      min={0}
                      type="number"
                      value={(config.minChars as number) ?? 0}
                      onChange={(e) =>
                        onConfigChange({
                          ...config,
                          minChars: parseInt(e.target.value) || 0,
                        })
                      }
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1.5 py-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">Max characters</span>
                    <Switch
                      isSelected={config.maxChars !== undefined}
                      onChange={(val) =>
                        onConfigChange({
                          ...config,
                          maxChars: val ? 100 : undefined,
                        })
                      }
                    >
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                  </div>
                  {config.maxChars !== undefined && (
                    <input
                      className="w-full rounded-lg border border-border bg-white px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                      min={1}
                      type="number"
                      value={(config.maxChars as number) ?? 100}
                      onChange={(e) =>
                        onConfigChange({
                          ...config,
                          maxChars: parseInt(e.target.value) || 100,
                        })
                      }
                    />
                  )}
                </div>
              </>
            )}

            {/* Number Field: Min and Max range */}
            {field.type === "number" && (
              <>
                <div className="flex flex-col gap-1.5 py-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">Min value</span>
                    <Switch
                      isSelected={config.min !== undefined}
                      onChange={(val) =>
                        onConfigChange({ ...config, min: val ? 0 : undefined })
                      }
                    >
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                  </div>
                  {config.min !== undefined && (
                    <input
                      className="w-full rounded-lg border border-border bg-white px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                      type="number"
                      value={(config.min as number) ?? 0}
                      onChange={(e) =>
                        onConfigChange({
                          ...config,
                          min: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1.5 py-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">Max value</span>
                    <Switch
                      isSelected={config.max !== undefined}
                      onChange={(val) =>
                        onConfigChange({ ...config, max: val ? 100 : undefined })
                      }
                    >
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                  </div>
                  {config.max !== undefined && (
                    <input
                      className="w-full rounded-lg border border-border bg-white px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                      type="number"
                      value={(config.max as number) ?? 100}
                      onChange={(e) =>
                        onConfigChange({
                          ...config,
                          max: parseFloat(e.target.value) || 100,
                        })
                      }
                    />
                  )}
                </div>
              </>
            )}
          </div>

          {/* Bottom Actions with Shortcuts */}
          <div className="flex flex-col gap-0.5 border-t border-border pt-2 text-xs">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-muted transition-colors hover:bg-slate-100 hover:text-danger"
              onClick={() => {
                onDelete();
                setIsOpen(false);
              }}
            >
              <div className="flex items-center gap-2">
                <TrashBin className="size-4" />
                <span>Delete</span>
              </div>
              <span className="text-[10px] text-muted/60">Del</span>
            </button>

            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-muted transition-colors hover:bg-slate-100 hover:text-foreground"
              onClick={() => {
                onDuplicate();
                setIsOpen(false);
              }}
            >
              <div className="flex items-center gap-2">
                <Copy className="size-4" />
                <span>Duplicate</span>
              </div>
              <span className="text-[10px] text-muted/60">Ctrl D</span>
            </button>

            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-muted transition-colors hover:bg-slate-100 hover:text-foreground"
              onClick={() => {
                onConfigChange({ ...config, hidden: !config.hidden });
                setIsOpen(false);
              }}
            >
              <div className="flex items-center gap-2">
                <Eye className="size-4" />
                <span>{config.hidden ? "Unhide" : "Hide"}</span>
              </div>
              <span className="text-[10px] text-muted/60">Ctrl ⇧ H</span>
            </button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

function DeleteFieldButton({ isSection, onDelete }: { isSection: boolean; onDelete: () => void }) {
  return (
    <AlertDialog>
      <Button
        aria-label="Delete field"
        isIconOnly
        size="sm"
        variant="tertiary"
        className="h-7 w-7 text-muted hover:text-danger hover:bg-danger-50 transition-colors"
      >
        <TrashBin className="size-3.5" />
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
