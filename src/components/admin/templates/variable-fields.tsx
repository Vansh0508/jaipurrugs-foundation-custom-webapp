"use client";

import { Input, Label, ListBox, Select, TextField } from "@heroui/react";
import { leadFieldOptions, type LeadAttribute, type LeadFieldRef } from "@/lib/leads/fields";
import type { TemplateVariable } from "@/lib/whatsapp/templates";

export interface VariableValue {
  field: LeadFieldRef | "";
  fallback: string;
  example?: string;
}

function sourceLabel(variable: TemplateVariable) {
  if (variable.source === "button") return `Button ${(variable.buttonIndex ?? 0) + 1} URL`;
  return variable.source === "header" ? "Header" : "Body";
}

/**
 * One row per template variable: which lead field fills it, a fallback for
 * when the lead hasn't got that detail, and (when creating) Meta's example.
 */
export function VariableFields({
  variables,
  values,
  attributes,
  showExample,
  onChange,
}: {
  variables: TemplateVariable[];
  values: Record<string, VariableValue>;
  attributes: Pick<LeadAttribute, "key" | "label" | "is_active">[];
  showExample: boolean;
  onChange: (key: string, value: VariableValue) => void;
}) {
  const options = leadFieldOptions(attributes);

  if (variables.length === 0) {
    return <p className="text-sm text-muted">No variables — this template sends the same text to everyone.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {variables.map((variable) => {
        const value = values[variable.key] ?? { field: "", fallback: "", example: "" };
        const fieldIsInactive =
          value.field !== "" && !options.some((o) => o.ref === value.field);
        return (
          <li key={variable.key} className="flex flex-col gap-3 rounded-xl border border-border/70 p-3">
            <div className="flex items-center gap-2">
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{`{{${variable.placeholder}}}`}</code>
              <span className="text-xs text-muted">{sourceLabel(variable)}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                value={value.field || null}
                onChange={(k) => onChange(variable.key, { ...value, field: (k ? String(k) : "") as LeadFieldRef | "" })}
              >
                <Label>Filled from lead field</Label>
                <Select.Trigger>
                  <Select.Value>
                    {({ defaultChildren, isPlaceholder }) =>
                      fieldIsInactive ? (
                        <span className="text-danger">Deactivated attribute — choose another</span>
                      ) : isPlaceholder ? (
                        <span className="text-muted">Choose a field…</span>
                      ) : (
                        defaultChildren
                      )
                    }
                  </Select.Value>
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {options.map((option) => (
                      <ListBox.Item key={option.ref} id={option.ref} textValue={option.label}>
                        {option.label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <TextField
                value={value.fallback}
                onChange={(fallback) => onChange(variable.key, { ...value, fallback })}
              >
                <Label>Fallback if missing</Label>
                <Input placeholder="Empty = agent asks the contact first" />
              </TextField>
              {showExample ? (
                <TextField
                  className="sm:col-span-2"
                  isRequired
                  value={value.example ?? ""}
                  onChange={(example) => onChange(variable.key, { ...value, example })}
                >
                  <Label>Example for Meta&apos;s review</Label>
                  <Input placeholder="e.g. Asha" />
                </TextField>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
