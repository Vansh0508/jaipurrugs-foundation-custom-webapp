"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsRotateRight } from "@gravity-ui/icons";
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Description,
  Label,
  ListBox,
  Select,
  Switch,
  toast,
} from "@heroui/react";
import { saveFormLeadMapping, syncFormLeads } from "@/lib/actions/leads";
import type { LeadAttribute } from "@/lib/leads/fields";
import type { Tables } from "@/lib/types/supabase";

type FormField = Pick<Tables<"form_fields">, "id" | "type" | "label" | "position">;

const NONE = "__none";

// Answers of these types have no sensible text value for a lead field.
const UNMAPPABLE_TYPES = new Set(["file_upload"]);

function fieldLabel(field: FormField) {
  return field.label?.trim() || `Untitled ${field.type.replace("_", " ")} field`;
}

function FieldSelect({
  label,
  description,
  fields,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  fields: FormField[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <Select className="w-80" value={value ?? NONE} onChange={(k) => onChange(!k || k === NONE ? null : String(k))}>
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      {description ? <Description>{description}</Description> : null}
      <Select.Popover>
        <ListBox>
          <ListBox.Item id={NONE} textValue="Not mapped">
            <span className="text-muted">Not mapped</span>
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {fields.map((f) => (
            <ListBox.Item key={f.id} id={f.id} textValue={fieldLabel(f)}>
              {fieldLabel(f)}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function FormLeadMappingEditor({
  formId,
  fields,
  mapping,
  lists,
  attributes,
  completedCount,
}: {
  formId: string;
  fields: FormField[];
  mapping: Tables<"form_lead_mappings"> | null;
  lists: { id: string; name: string }[];
  attributes: LeadAttribute[];
  completedCount: number;
}) {
  const router = useRouter();
  const phoneFields = fields.filter((f) => f.type === "phone");
  const mappable = fields.filter((f) => !UNMAPPABLE_TYPES.has(f.type));

  const [enabled, setEnabled] = useState(mapping?.enabled ?? true);
  const [phoneFieldId, setPhoneFieldId] = useState<string | null>(
    mapping?.phone_field_id ?? (phoneFields.length === 1 ? phoneFields[0].id : null),
  );
  const [nameFieldId, setNameFieldId] = useState<string | null>(mapping?.name_field_id ?? null);
  const [attributeMap, setAttributeMap] = useState<Record<string, string>>(
    (mapping?.attribute_map as Record<string, string> | null) ?? {},
  );
  const [listIds, setListIds] = useState<string[]>(mapping?.list_ids ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);

  function touch<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setHasUnsaved(true);
    };
  }

  // Each attribute can be filled by at most one field.
  function setAttributeForField(fieldId: string, attrKey: string | null) {
    setAttributeMap((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([fid, key]) => fid !== fieldId && key !== attrKey));
      if (attrKey) next[fieldId] = attrKey;
      return next;
    });
    setHasUnsaved(true);
  }

  async function handleSave() {
    setIsSaving(true);
    const result = await saveFormLeadMapping(formId, { enabled, phoneFieldId, nameFieldId, attributeMap, listIds });
    setIsSaving(false);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    setHasUnsaved(false);
    toast.success("Lead sync saved. New submissions will update leads.");
    router.refresh();
  }

  async function handleSync() {
    setIsSyncing(true);
    const result = await syncFormLeads(formId);
    setIsSyncing(false);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    toast.success(`Synced ${result.synced ?? 0} submission(s) to leads.`);
  }

  if (phoneFields.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-12 text-center">
        <p className="text-sm font-medium">This form has no phone field</p>
        <p className="text-sm text-muted">
          Leads are matched by phone number. Add a Phone field to the form to sync its submissions to leads.
        </p>
      </div>
    );
  }

  const otherFields = mappable.filter((f) => f.id !== phoneFieldId && f.id !== nameFieldId);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Switch isSelected={enabled} onChange={touch(setEnabled)}>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          Create or update a lead whenever this form is submitted
        </Switch.Content>
      </Switch>

      <div className="flex flex-wrap gap-4">
        <FieldSelect
          description="Matches the submission to a lead. Required."
          fields={phoneFields}
          label="Phone field"
          value={phoneFieldId}
          onChange={touch(setPhoneFieldId)}
        />
        <FieldSelect
          fields={mappable.filter((f) => f.id !== phoneFieldId)}
          label="Name field"
          value={nameFieldId}
          onChange={touch(setNameFieldId)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Fields → custom attributes</h2>
        {attributes.length === 0 ? (
          <p className="text-sm text-muted">
            No active custom attributes yet — create them under Leads → Custom attributes.
          </p>
        ) : otherFields.length === 0 ? (
          <p className="text-sm text-muted">No other fields to map.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60 rounded-2xl border border-border/70">
            {otherFields.map((field) => (
              <li key={field.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm">{fieldLabel(field)}</span>
                <Select
                  aria-label={`Attribute for ${fieldLabel(field)}`}
                  className="w-64"
                  value={attributeMap[field.id] ?? NONE}
                  onChange={(k) => setAttributeForField(field.id, !k || k === NONE ? null : String(k))}
                >
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id={NONE} textValue="Don't save">
                        <span className="text-muted">Don&apos;t save</span>
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      {attributes.map((attr) => (
                        <ListBox.Item key={attr.key} id={attr.key} textValue={attr.label}>
                          {attr.label}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">
          Values are converted to each attribute&apos;s type; answers that don&apos;t fit (e.g. text in a number
          attribute, or an option that isn&apos;t in a select attribute) are skipped.
        </p>
      </div>

      {lists.length > 0 ? (
        <CheckboxGroup value={listIds} onChange={touch(setListIds)}>
          <Label>Add submitters to lists</Label>
          {lists.map((list) => (
            <Checkbox key={list.id} value={list.id}>
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                {list.name}
              </Checkbox.Content>
            </Checkbox>
          ))}
        </CheckboxGroup>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
        <Button isPending={isSaving} onPress={handleSave}>
          Save lead sync
        </Button>
        <Button
          isDisabled={hasUnsaved || !mapping || completedCount === 0}
          isPending={isSyncing}
          variant="secondary"
          onPress={handleSync}
        >
          <ArrowsRotateRight className="size-4" />
          Sync {completedCount} existing submission{completedCount === 1 ? "" : "s"}
        </Button>
        <p className="text-xs text-muted">
          {hasUnsaved
            ? "Save first to sync existing submissions."
            : "Syncing only fills in details a lead is missing — it never overwrites newer information."}
        </p>
      </div>
    </div>
  );
}
