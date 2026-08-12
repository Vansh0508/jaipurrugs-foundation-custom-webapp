"use client";

import { Plus } from "@gravity-ui/icons";
import { Button, Description, Dropdown, Label } from "@heroui/react";
import { FIELD_TYPE_ORDER, getFieldTypeDefinition, type FormFieldType } from "@/lib/forms/field-types";

function TypePickerItems({ onSelect }: { onSelect: (type: FormFieldType) => void }) {
  return (
    <Dropdown.Menu onAction={(key) => onSelect(key as FormFieldType)}>
      {FIELD_TYPE_ORDER.map((type) => {
        const definition = getFieldTypeDefinition(type);
        const Icon = definition.icon;
        return (
          <Dropdown.Item key={type} id={type} textValue={definition.label}>
            <Icon className="size-4 shrink-0" />
            <div className="flex flex-col">
              <Label>{definition.label}</Label>
              <Description>{definition.description}</Description>
            </div>
          </Dropdown.Item>
        );
      })}
    </Dropdown.Menu>
  );
}

// The "+" divider between any two cards (and at the end of the list) — the
// only way to add a field, per docs/phases/03-field-registry-editor.md. Stays
// dimly visible at rest and brightens on hover, rather than fully opacity-0:
// a real user testing this couldn't find a fully-hidden button and reported
// "no way to add more fields" — hover should reveal *more* affordance, not
// be the only way to discover the affordance exists at all.
export function AddFieldDivider({ onSelect }: { onSelect: (type: FormFieldType) => void }) {
  return (
    <div className="group relative -my-2.5 flex h-5 items-center justify-center">
      <div className="h-px w-full bg-transparent group-hover:bg-border" />
      <Dropdown>
        <Button
          aria-label="Add field here"
          className="absolute opacity-40 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          isIconOnly
          size="sm"
          variant="secondary"
        >
          <Plus />
        </Button>
        <Dropdown.Popover>
          <TypePickerItems onSelect={onSelect} />
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );
}

// Prominent empty-state CTA — shown instead of a hover divider when the form
// has no fields yet (there's nothing to hover between).
export function AddFirstFieldButton({ onSelect }: { onSelect: (type: FormFieldType) => void }) {
  return (
    <Dropdown>
      <Button>
        <Plus />
        Add your first field
      </Button>
      <Dropdown.Popover>
        <TypePickerItems onSelect={onSelect} />
      </Dropdown.Popover>
    </Dropdown>
  );
}
