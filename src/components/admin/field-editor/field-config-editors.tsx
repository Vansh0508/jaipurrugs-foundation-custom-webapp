"use client";

import { useRef, useState } from "react";
import { ArrowUpFromLine, Plus, TrashBin } from "@gravity-ui/icons";
import { Button, Input, Label, NumberField, Radio, RadioGroup, TextField, toast } from "@heroui/react";
import { uploadFormAsset } from "@/lib/actions/forms";
import type {
  ChoiceConfig,
  FieldOption,
  FileUploadConfig,
  FormFieldType,
  LinearScaleConfig,
  NumberConfig,
  RatingConfig,
  SectionConfig,
} from "@/lib/forms/field-types";

// The single place that maps a field type to its inline config editor —
// mirrors the field-type registry's job of being the one source of truth,
// just for the editor-only UI half of it. See AGENTS.md §5/§6: config editing
// happens entirely inline in the field's own card, no side panel, no
// duplicated per-type logic elsewhere.
type ConfigChangeOptions = { immediate?: boolean };

export function FieldConfigEditor({
  type,
  config,
  formId,
  fieldId,
  onConfigChange,
}: {
  type: FormFieldType;
  config: unknown;
  formId?: string;
  fieldId?: string;
  onConfigChange: (config: Record<string, unknown>, options?: ConfigChangeOptions) => void;
}) {
  switch (type) {
    case "multiple_choice":
    case "checkboxes":
    case "dropdown":
      return <ChoiceOptionsEditor config={config as ChoiceConfig} onConfigChange={onConfigChange} />;
    case "number":
      return <NumberRangeEditor config={config as NumberConfig} onConfigChange={onConfigChange} />;
    case "rating":
      return <RatingConfigEditor config={config as RatingConfig} onConfigChange={onConfigChange} />;
    case "linear_scale":
      return (
        <LinearScaleConfigEditor config={config as LinearScaleConfig} onConfigChange={onConfigChange} />
      );
    case "file_upload":
      return (
        <FileUploadConfigEditor config={config as FileUploadConfig} onConfigChange={onConfigChange} />
      );
    case "section":
      if (!formId || !fieldId) return null;
      return (
        <SectionConfigEditor
          config={config as SectionConfig}
          fieldId={fieldId}
          formId={formId}
          onConfigChange={onConfigChange}
        />
      );
    default:
      return null;
  }
}

function ChoiceOptionsEditor({
  config,
  onConfigChange,
}: {
  config: ChoiceConfig;
  onConfigChange: (config: Record<string, unknown>, options?: ConfigChangeOptions) => void;
}) {
  const options = config?.options ?? [];

  function updateOptions(next: FieldOption[], immediate: boolean) {
    onConfigChange({ options: next }, { immediate });
  }

  return (
    <div className="flex flex-col gap-2">
      {options.map((option, index) => (
        <div className="flex items-center gap-2" key={option.id}>
          <TextField
            aria-label={`Option ${index + 1}`}
            className="flex-1"
            value={option.label}
            onChange={(value) => {
              const next = options.map((o) => (o.id === option.id ? { ...o, label: value } : o));
              updateOptions(next, false);
            }}
          >
            <Input />
          </TextField>
          <Button
            aria-label="Remove option"
            isDisabled={options.length <= 1}
            isIconOnly
            size="sm"
            variant="tertiary"
            onPress={() => updateOptions(options.filter((o) => o.id !== option.id), true)}
          >
            <TrashBin />
          </Button>
        </div>
      ))}
      <Button
        className="self-start"
        size="sm"
        variant="tertiary"
        onPress={() =>
          updateOptions(
            [...options, { id: crypto.randomUUID(), label: `Option ${options.length + 1}` }],
            true,
          )
        }
      >
        <Plus />
        Add option
      </Button>
    </div>
  );
}

function NumberRangeEditor({
  config,
  onConfigChange,
}: {
  config: NumberConfig;
  onConfigChange: (config: Record<string, unknown>, options?: ConfigChangeOptions) => void;
}) {
  return (
    <div className="flex flex-wrap gap-4">
      <NumberField
        className="w-28"
        value={config?.min}
        onChange={(value) => onConfigChange({ ...config, min: value })}
      >
        <Label>Min</Label>
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
      <NumberField
        className="w-28"
        value={config?.max}
        onChange={(value) => onConfigChange({ ...config, max: value })}
      >
        <Label>Max</Label>
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
      <NumberField
        className="w-28"
        minValue={1}
        value={config?.step}
        onChange={(value) => onConfigChange({ ...config, step: value })}
      >
        <Label>Step</Label>
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
    </div>
  );
}

function RatingConfigEditor({
  config,
  onConfigChange,
}: {
  config: RatingConfig;
  onConfigChange: (config: Record<string, unknown>, options?: ConfigChangeOptions) => void;
}) {
  return (
    <NumberField
      className="w-28"
      maxValue={10}
      minValue={2}
      value={config?.max ?? 5}
      onChange={(value) => onConfigChange({ max: value ?? 5 }, { immediate: true })}
    >
      <Label>Max stars</Label>
      <NumberField.Group>
        <NumberField.DecrementButton />
        <NumberField.Input />
        <NumberField.IncrementButton />
      </NumberField.Group>
    </NumberField>
  );
}

function LinearScaleConfigEditor({
  config,
  onConfigChange,
}: {
  config: LinearScaleConfig;
  onConfigChange: (config: Record<string, unknown>, options?: ConfigChangeOptions) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4">
        <NumberField
          className="w-24"
          value={config?.min ?? 1}
          onChange={(value) => onConfigChange({ ...config, min: value ?? 1 }, { immediate: true })}
        >
          <Label>Min</Label>
          <NumberField.Group>
            <NumberField.Input />
          </NumberField.Group>
        </NumberField>
        <NumberField
          className="w-24"
          value={config?.max ?? 5}
          onChange={(value) => onConfigChange({ ...config, max: value ?? 5 }, { immediate: true })}
        >
          <Label>Max</Label>
          <NumberField.Group>
            <NumberField.Input />
          </NumberField.Group>
        </NumberField>
      </div>
      <div className="flex flex-wrap gap-4">
        <TextField
          className="flex-1"
          value={config?.minLabel ?? ""}
          onChange={(value) => onConfigChange({ ...config, minLabel: value })}
        >
          <Label>Label for min</Label>
          <Input placeholder="e.g. Not likely" />
        </TextField>
        <TextField
          className="flex-1"
          value={config?.maxLabel ?? ""}
          onChange={(value) => onConfigChange({ ...config, maxLabel: value })}
        >
          <Label>Label for max</Label>
          <Input placeholder="e.g. Very likely" />
        </TextField>
      </div>
    </div>
  );
}

function FileUploadConfigEditor({
  config,
  onConfigChange,
}: {
  config: FileUploadConfig;
  onConfigChange: (config: Record<string, unknown>, options?: ConfigChangeOptions) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <NumberField
        className="w-32"
        minValue={1}
        value={config?.maxFiles ?? 1}
        onChange={(value) => onConfigChange({ ...config, maxFiles: value ?? 1 }, { immediate: true })}
      >
        <Label>Max files</Label>
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
      <NumberField
        className="w-32"
        minValue={1}
        value={config?.maxSizeMb ?? 10}
        onChange={(value) => onConfigChange({ ...config, maxSizeMb: value ?? 10 }, { immediate: true })}
      >
        <Label>Max size (MB)</Label>
        <NumberField.Group>
          <NumberField.Input />
        </NumberField.Group>
      </NumberField>
      <TextField
        className="min-w-56 flex-1"
        value={(config?.acceptedTypes ?? []).join(", ")}
        onChange={(value) =>
          onConfigChange({
            ...config,
            acceptedTypes: value
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean),
          })
        }
      >
        <Label>Accepted types</Label>
        <Input placeholder="e.g. .pdf, image/*" />
      </TextField>
    </div>
  );
}

function SectionConfigEditor({
  formId,
  fieldId,
  config,
  onConfigChange,
}: {
  formId: string;
  fieldId: string;
  config: SectionConfig;
  onConfigChange: (config: Record<string, unknown>, options?: ConfigChangeOptions) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bg = config?.background;
  const currentMode = bg?.type ? bg.type : "default";

  function handleModeChange(mode: "default" | "color" | "image") {
    if (mode === "default") {
      onConfigChange({ ...config, background: undefined }, { immediate: true });
    } else if (mode === "color") {
      onConfigChange(
        { ...config, background: { type: "color", color: bg?.color ?? "#F8FAFC" } },
        { immediate: true },
      );
    } else if (mode === "image") {
      onConfigChange(
        { ...config, background: { type: "image", image_url: bg?.image_url ?? "" } },
        { immediate: true },
      );
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const url = await uploadFormAsset(formId, "section", fieldId, formData);
      onConfigChange({ ...config, background: { type: "image", image_url: url } }, { immediate: true });
      toast.success("Section background image uploaded");
    } catch {
      toast.danger("Upload failed.");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-slate-50/50 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">Section Background</Label>
        <span className="text-[11px] text-muted">Override form default</span>
      </div>

      <RadioGroup
        className="flex flex-row gap-4 text-xs"
        value={currentMode}
        onChange={(val) => handleModeChange(val as "default" | "color" | "image")}
      >
        <Radio value="default">Default</Radio>
        <Radio value="color">Color</Radio>
        <Radio value="image">Image</Radio>
      </RadioGroup>

      {currentMode === "color" && (
        <div className="flex items-center gap-2 pt-1">
          <TextField
            aria-label="Section hex color"
            className="flex-1"
            value={bg?.color ?? "#F8FAFC"}
            onChange={(color) =>
              onConfigChange({ ...config, background: { type: "color", color } })
            }
          >
            <Input placeholder="#F8FAFC" />
          </TextField>
          <div
            className="h-9 w-9 rounded-lg border border-border shadow-xs"
            style={{ backgroundColor: bg?.color ?? "#F8FAFC" }}
          />
        </div>
      )}

      {currentMode === "image" && (
        <div className="flex flex-col gap-2 pt-1">
          <input
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            type="file"
            onChange={handleImageUpload}
          />
          <div className="flex items-center gap-2">
            <Button
              isDisabled={isUploading}
              size="sm"
              variant="tertiary"
              onPress={() => fileInputRef.current?.click()}
            >
              <ArrowUpFromLine />
              {bg?.image_url ? "Change Section Image" : "Upload Section Image"}
            </Button>
            {bg?.image_url && (
              <Button
                size="sm"
                variant="tertiary"
                onPress={() =>
                  onConfigChange({ ...config, background: { type: "image", image_url: "" } }, { immediate: true })
                }
              >
                <TrashBin />
              </Button>
            )}
          </div>
          {bg?.image_url && (
            <div className="relative h-16 w-full overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Section background preview" className="h-full w-full object-cover" src={bg.image_url} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
