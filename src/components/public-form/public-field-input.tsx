"use client";

import { useRef, useState } from "react";
import { Paperclip, Star, TrashBin } from "@gravity-ui/icons";
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Input,
  NumberField,
  Radio,
  RadioGroup,
  TextArea,
  TextField,
  toast,
} from "@heroui/react";
import {
  getFieldTypeDefinition,
  type ChoiceConfig,
  type FileUploadConfig,
  type LinearScaleConfig,
  type NumberConfig,
  type RatingConfig,
} from "@/lib/forms/field-types";
import type { Tables } from "@/lib/types/supabase";
import { uploadSubmissionFile } from "@/lib/actions/submissions";

export type FieldValue = unknown;

export function PublicFieldInput({
  field,
  value,
  formId,
  submissionId,
  onChange,
}: {
  field: Tables<"form_fields">;
  value: FieldValue;
  formId: string;
  submissionId: string;
  onChange: (val: FieldValue) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const definition = getFieldTypeDefinition(field.type);

  if (definition.isSection) {
    return (
      <div className="flex flex-col gap-1 py-2">
        <h2 className="text-xl font-bold text-foreground">{field.label || "Section"}</h2>
        {field.description ? <p className="text-sm text-muted">{field.description}</p> : null}
      </div>
    );
  }

  const strValue = typeof value === "string" ? value : "";

  switch (field.type) {
    case "short_text":
      return (
        <TextField aria-label={field.label || "Answer"} value={strValue} onChange={(v) => onChange(v)}>
          <Input placeholder={field.placeholder || "Your answer"} />
        </TextField>
      );

    case "long_text":
      return (
        <TextField aria-label={field.label || "Answer"} value={strValue} onChange={(v) => onChange(v)}>
          <TextArea placeholder={field.placeholder || "Your answer..."} rows={4} />
        </TextField>
      );

    case "email":
      return (
        <TextField aria-label={field.label || "Email"} value={strValue} onChange={(v) => onChange(v)}>
          <Input placeholder={field.placeholder || "name@example.com"} type="email" />
        </TextField>
      );

    case "phone":
      return (
        <TextField aria-label={field.label || "Phone"} value={strValue} onChange={(v) => onChange(v)}>
          <Input placeholder={field.placeholder || "e.g. +1 234 567 8900"} type="tel" />
        </TextField>
      );

    case "number": {
      const config = (field.config as NumberConfig) ?? {};
      return (
        <NumberField
          aria-label={field.label || "Number"}
          maxValue={config.max}
          minValue={config.min}
          step={config.step}
          value={typeof value === "number" ? value : undefined}
          onChange={(v) => onChange(v ?? null)}
        >
          <NumberField.Group>
            <NumberField.Input placeholder={field.placeholder || "0"} />
          </NumberField.Group>
        </NumberField>
      );
    }

    case "date":
      return (
        <TextField aria-label={field.label || "Date"} value={strValue} onChange={(v) => onChange(v)}>
          <Input type="date" />
        </TextField>
      );

    case "multiple_choice": {
      const config = (field.config as ChoiceConfig) ?? {};
      const options = config.options ?? [];
      return (
        <RadioGroup
          aria-label={field.label || "Choices"}
          value={strValue}
          onChange={(val) => onChange(val)}
        >
          {options.map((opt) => (
            <Radio key={opt.id} value={opt.label}>
              {opt.label}
            </Radio>
          ))}
        </RadioGroup>
      );
    }

    case "checkboxes": {
      const config = (field.config as ChoiceConfig) ?? {};
      const options = config.options ?? [];
      const arrValue = Array.isArray(value) ? (value as string[]) : [];
      return (
        <CheckboxGroup
          aria-label={field.label || "Checkboxes"}
          value={arrValue}
          onChange={(vals) => onChange(vals)}
        >
          {options.map((opt) => (
            <Checkbox key={opt.id} value={opt.label}>
              {opt.label}
            </Checkbox>
          ))}
        </CheckboxGroup>
      );
    }

    case "dropdown": {
      const config = (field.config as ChoiceConfig) ?? {};
      const options = config.options ?? [];
      return (
        <select
          aria-label={field.label || "Dropdown"}
          className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-foreground shadow-2xs focus:outline-none focus:ring-1 focus:ring-accent"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>
            Select an option...
          </option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.label}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    case "rating": {
      const config = (field.config as RatingConfig) ?? {};
      const maxStars = config.max ?? 5;
      const currentRating = typeof value === "number" ? value : 0;
      return (
        <div className="flex items-center gap-1.5 py-1">
          {Array.from({ length: maxStars }).map((_, idx) => {
            const starValue = idx + 1;
            const isFilled = starValue <= currentRating;
            return (
              <button
                key={starValue}
                type="button"
                aria-label={`Rate ${starValue} star`}
                className={`p-1 transition-transform hover:scale-110 ${
                  isFilled ? "text-amber-400" : "text-slate-300"
                }`}
                onClick={() => onChange(starValue)}
              >
                <Star className="size-6 fill-current" />
              </button>
            );
          })}
        </div>
      );
    }

    case "linear_scale": {
      const config = (field.config as LinearScaleConfig) ?? {};
      const min = config.min ?? 1;
      const max = config.max ?? 5;
      const currentVal = typeof value === "number" ? value : null;

      const scaleButtons = [];
      for (let i = min; i <= max; i++) {
        scaleButtons.push(i);
      }

      return (
        <div className="flex flex-col gap-2 py-1">
          <div className="flex flex-wrap items-center gap-2">
            {scaleButtons.map((step) => (
              <Button
                key={step}
                size="sm"
                variant={currentVal === step ? "primary" : "tertiary"}
                className={currentVal === step ? "font-bold" : "bg-slate-100 hover:bg-slate-200"}
                onPress={() => onChange(step)}
              >
                {step}
              </Button>
            ))}
          </div>
          {(config.minLabel || config.maxLabel) && (
            <div className="flex justify-between text-xs text-muted">
              <span>{config.minLabel ?? ""}</span>
              <span>{config.maxLabel ?? ""}</span>
            </div>
          )}
        </div>
      );
    }

    case "file_upload": {
      const config = (field.config as FileUploadConfig) ?? {};
      const attachments = Array.isArray(value) ? (value as Array<{ name: string; path: string }>) : [];

      async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
          const formData = new FormData();
          formData.append("file", file);
          const meta = await uploadSubmissionFile(formId, submissionId, field.id, formData);
          onChange([...attachments, meta]);
          toast.success("File attached");
        } catch {
          toast.danger("File upload failed.");
        } finally {
          setIsUploading(false);
          e.target.value = "";
        }
      }

      function handleRemoveAttachment(path: string) {
        onChange(attachments.filter((a) => a.path !== path));
      }

      return (
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            accept={config.acceptedTypes?.join(", ")}
            className="hidden"
            type="file"
            onChange={handleFileChange}
          />
          <Button
            isDisabled={isUploading || attachments.length >= (config.maxFiles ?? 1)}
            size="sm"
            variant="tertiary"
            className="self-start bg-slate-100 hover:bg-slate-200"
            onPress={() => fileInputRef.current?.click()}
          >
            <Paperclip />
            {isUploading ? "Uploading..." : "Attach File"}
          </Button>

          {attachments.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1">
              {attachments.map((att) => (
                <div
                  key={att.path}
                  className="flex items-center justify-between rounded-lg border border-border bg-slate-50 px-3 py-1.5 text-xs"
                >
                  <span className="truncate font-medium text-foreground">{att.name}</span>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="tertiary"
                    className="h-6 w-6 text-muted hover:text-danger"
                    onPress={() => handleRemoveAttachment(att.path)}
                  >
                    <TrashBin />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}
