// The field-type registry — single source of truth for the core v1 set. The
// editor (this phase), the public renderer (Phase 5), and the metrics
// dashboard (Phase 6) all import from here instead of re-implementing a
// type's config shape/defaults/validation. See AGENTS.md §5 and
// docs/phases/03-field-registry-editor.md.
import {
  Bars,
  Calendar,
  ChevronDown,
  CircleCheck,
  Envelope,
  Hashtag,
  Paperclip,
  Sliders,
  Smartphone,
  SquareCheck,
  Star,
  Text,
  TextAlignLeft,
} from "@gravity-ui/icons";
import { z } from "zod";
import type { ComponentType, SVGProps } from "react";
import type { Enums } from "@/lib/types/supabase";

export type FormFieldType = Enums<"form_field_type">;

export type FieldOption = { id: string; label: string };

const optionSchema = z.object({
  id: z.string(),
  label: z.string(),
});

const emptyConfigSchema = z.object({}).strict();
const textConfigSchema = z.object({
  minChars: z.number().int().min(0).optional(),
  maxChars: z.number().int().min(1).optional(),
  defaultAnswer: z.string().optional(),
});
const choiceConfigSchema = z.object({ options: z.array(optionSchema) });
const numberConfigSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
});
const ratingConfigSchema = z.object({ max: z.number().int().min(2).max(10) });
const linearScaleConfigSchema = z.object({
  min: z.number().int(),
  max: z.number().int(),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
});
const fileUploadConfigSchema = z.object({
  maxFiles: z.number().int().min(1).optional(),
  maxSizeMb: z.number().min(1).optional(),
  acceptedTypes: z.array(z.string()).optional(),
});

export const backgroundConfigSchema = z
  .object({
    type: z.enum(["color", "image"]).optional(),
    color: z.string().optional(),
    image_url: z.string().optional(),
  })
  .optional();

export const sectionConfigSchema = z.object({
  background: backgroundConfigSchema,
});

export type EmptyConfig = z.infer<typeof emptyConfigSchema>;
export type TextConfig = z.infer<typeof textConfigSchema>;
export type ChoiceConfig = z.infer<typeof choiceConfigSchema>;
export type NumberConfig = z.infer<typeof numberConfigSchema>;
export type RatingConfig = z.infer<typeof ratingConfigSchema>;
export type LinearScaleConfig = z.infer<typeof linearScaleConfigSchema>;
export type FileUploadConfig = z.infer<typeof fileUploadConfigSchema>;
export type BackgroundConfig = z.infer<typeof backgroundConfigSchema>;
export type SectionConfig = z.infer<typeof sectionConfigSchema>;

export type FormSettings = {
  logo_url?: string | null;
  cover_image_url?: string | null;
  footer_image_url?: string | null;
  cover_position_y?: number | null; // 0 to 100 vertical alignment %
  footer_position_y?: number | null; // 0 to 100 vertical alignment %
  section_defaults?: {
    background?: BackgroundConfig;
  };
};

export function resolveSectionBackground(
  sectionConfig?: SectionConfig | null,
  formDefaults?: BackgroundConfig | null,
): BackgroundConfig | undefined {
  if (sectionConfig?.background?.type) {
    return sectionConfig.background;
  }
  if (formDefaults?.type) {
    return formDefaults;
  }
  return undefined;
}

function defaultOptions(): FieldOption[] {
  return [
    { id: crypto.randomUUID(), label: "Option 1" },
    { id: crypto.randomUUID(), label: "Option 2" },
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyConfig = any;

export type FieldTypeDefinition<TConfig = AnyConfig> = {
  type: FormFieldType;
  label: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  // Section fields are pure grouping boundaries, not answerable questions —
  // they never take a placeholder or a required toggle.
  supportsRequired: boolean;
  supportsPlaceholder: boolean;
  isSection: boolean;
  configSchema: z.ZodType<TConfig>;
  defaultConfig: () => TConfig;
};

export const FIELD_TYPE_DEFINITIONS = {
  short_text: {
    type: "short_text",
    label: "Short text",
    description: "A single-line text answer",
    icon: TextAlignLeft,
    supportsRequired: true,
    supportsPlaceholder: true,
    isSection: false,
    configSchema: textConfigSchema,
    defaultConfig: () => ({}),
  },
  long_text: {
    type: "long_text",
    label: "Long text",
    description: "A multi-line paragraph answer",
    icon: Text,
    supportsRequired: true,
    supportsPlaceholder: true,
    isSection: false,
    configSchema: textConfigSchema,
    defaultConfig: () => ({}),
  },
  number: {
    type: "number",
    label: "Number",
    description: "A numeric answer, with optional min/max",
    icon: Hashtag,
    supportsRequired: true,
    supportsPlaceholder: true,
    isSection: false,
    configSchema: numberConfigSchema,
    defaultConfig: () => ({}),
  },
  email: {
    type: "email",
    label: "Email",
    description: "A single email address",
    icon: Envelope,
    supportsRequired: true,
    supportsPlaceholder: true,
    isSection: false,
    configSchema: emptyConfigSchema,
    defaultConfig: () => ({}),
  },
  phone: {
    type: "phone",
    label: "Phone",
    description: "A phone number",
    icon: Smartphone,
    supportsRequired: true,
    supportsPlaceholder: true,
    isSection: false,
    configSchema: emptyConfigSchema,
    defaultConfig: () => ({}),
  },
  date: {
    type: "date",
    label: "Date",
    description: "A calendar date",
    icon: Calendar,
    supportsRequired: true,
    supportsPlaceholder: false,
    isSection: false,
    configSchema: emptyConfigSchema,
    defaultConfig: () => ({}),
  },
  multiple_choice: {
    type: "multiple_choice",
    label: "Multiple choice",
    description: "Pick exactly one option",
    icon: CircleCheck,
    supportsRequired: true,
    supportsPlaceholder: false,
    isSection: false,
    configSchema: choiceConfigSchema,
    defaultConfig: () => ({ options: defaultOptions() }),
  },
  checkboxes: {
    type: "checkboxes",
    label: "Checkboxes",
    description: "Pick any number of options",
    icon: SquareCheck,
    supportsRequired: true,
    supportsPlaceholder: false,
    isSection: false,
    configSchema: choiceConfigSchema,
    defaultConfig: () => ({ options: defaultOptions() }),
  },
  dropdown: {
    type: "dropdown",
    label: "Dropdown",
    description: "Pick one option from a dropdown list",
    icon: ChevronDown,
    supportsRequired: true,
    supportsPlaceholder: false,
    isSection: false,
    configSchema: choiceConfigSchema,
    defaultConfig: () => ({ options: defaultOptions() }),
  },
  rating: {
    type: "rating",
    label: "Rating",
    description: "A star rating out of a fixed maximum",
    icon: Star,
    supportsRequired: true,
    supportsPlaceholder: false,
    isSection: false,
    configSchema: ratingConfigSchema,
    defaultConfig: () => ({ max: 5 }),
  },
  linear_scale: {
    type: "linear_scale",
    label: "Linear scale",
    description: "A numeric scale between two labeled ends",
    icon: Sliders,
    supportsRequired: true,
    supportsPlaceholder: false,
    isSection: false,
    configSchema: linearScaleConfigSchema,
    defaultConfig: () => ({ min: 1, max: 5, minLabel: "", maxLabel: "" }),
  },
  file_upload: {
    type: "file_upload",
    label: "File upload",
    description: "One or more file attachments",
    icon: Paperclip,
    supportsRequired: true,
    supportsPlaceholder: false,
    isSection: false,
    configSchema: fileUploadConfigSchema,
    defaultConfig: () => ({ maxFiles: 1, maxSizeMb: 10, acceptedTypes: [] }),
  },
  section: {
    type: "section",
    label: "Section",
    description: "A heading that groups the fields after it",
    icon: Bars,
    supportsRequired: false,
    supportsPlaceholder: false,
    isSection: true,
    configSchema: sectionConfigSchema,
    defaultConfig: () => ({}),
  },
} as const satisfies Record<FormFieldType, FieldTypeDefinition>;

// Display order for the type-picker — deliberately not the DB enum's
// declaration order, so "Section" reads as a distinct, less-common choice at
// the end rather than sitting among the answerable question types.
export const FIELD_TYPE_ORDER: FormFieldType[] = [
  "short_text",
  "long_text",
  "number",
  "email",
  "phone",
  "date",
  "multiple_choice",
  "checkboxes",
  "dropdown",
  "rating",
  "linear_scale",
  "file_upload",
  "section",
];

export function getFieldTypeDefinition(type: FormFieldType): FieldTypeDefinition {
  return FIELD_TYPE_DEFINITIONS[type];
}
