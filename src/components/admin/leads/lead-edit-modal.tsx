"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  Button,
  Checkbox,
  CheckboxGroup,
  Description,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  TextField,
  toast,
} from "@heroui/react";
import { deleteLead, updateLead } from "@/lib/actions/leads";
import { leadAttributeValues, type LeadAttribute } from "@/lib/leads/fields";
import { formatPhone } from "@/lib/mastra/phone";
import type { LeadListRow, LeadRow } from "./leads-workspace";

const NOT_SET = "__not_set";

export function AttributeInput({
  attribute,
  value,
  onChange,
}: {
  attribute: LeadAttribute;
  value: string;
  onChange: (value: string) => void;
}) {
  if (attribute.type === "select") {
    return (
      <Select value={value || NOT_SET} onChange={(key) => onChange(!key || key === NOT_SET ? "" : String(key))}>
        <Label>{attribute.label}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        {attribute.description ? <Description>{attribute.description}</Description> : null}
        <Select.Popover>
          <ListBox>
            <ListBox.Item id={NOT_SET} textValue="Not set">
              <span className="text-muted">Not set</span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
            {attribute.options.map((option) => (
              <ListBox.Item key={option} id={option} textValue={option}>
                {option}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    );
  }

  return (
    <TextField value={value} onChange={onChange}>
      <Label>{attribute.label}</Label>
      <Input type={attribute.type === "number" ? "number" : attribute.type === "date" ? "date" : "text"} />
      {attribute.description ? <Description>{attribute.description}</Description> : null}
    </TextField>
  );
}

function LeadForm({
  lead,
  lists,
  attributes,
  onDone,
}: {
  lead: LeadRow;
  lists: LeadListRow[];
  attributes: LeadAttribute[];
  onDone: () => void;
}) {
  const router = useRouter();
  const stored = leadAttributeValues(lead);
  const active = attributes.filter((a) => a.is_active);
  const inactiveWithData = attributes.filter((a) => !a.is_active && stored[a.key] != null);

  const [name, setName] = useState(lead.name ?? "");
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(active.map((a) => [a.key, stored[a.key] == null ? "" : String(stored[a.key])])),
  );
  const [listIds, setListIds] = useState<string[]>(lead.listIds);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    const result = await updateLead(lead.id, { name, attributes: values, listIds });
    setIsSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success("Lead saved.");
    router.refresh();
    onDone();
  }

  async function handleDelete() {
    setIsDeleting(true);
    const result = await deleteLead(lead.id);
    setIsDeleting(false);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    setIsConfirmingDelete(false);
    router.refresh();
    onDone();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSave}>
      <p className="text-sm text-muted">{formatPhone(lead.phone)}</p>

      <TextField value={name} onChange={setName}>
        <Label>Name</Label>
        <Input />
      </TextField>

      {active.map((attr) => (
        <AttributeInput
          key={attr.key}
          attribute={attr}
          value={values[attr.key] ?? ""}
          onChange={(v) => setValues((prev) => ({ ...prev, [attr.key]: v }))}
        />
      ))}

      {inactiveWithData.length > 0 ? (
        <div className="rounded-xl bg-neutral-50 p-3 text-xs text-muted">
          <p className="mb-1 font-medium">Kept from deactivated attributes</p>
          {inactiveWithData.map((a) => (
            <p key={a.key}>
              {a.label}: {String(stored[a.key])}
            </p>
          ))}
        </div>
      ) : null}

      {lists.length > 0 ? (
        <CheckboxGroup value={listIds} onChange={setListIds}>
          <Label>Lists</Label>
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

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex items-center justify-between gap-2">
        <Button variant="danger" onPress={() => setIsConfirmingDelete(true)}>
          Delete lead
        </Button>
        <Button isPending={isSaving} type="submit">
          Save
        </Button>
      </div>

      <AlertDialog isOpen={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[400px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>Delete this lead?</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  Removes the lead and its list memberships. Their form submissions are not affected, and a new
                  submission or WhatsApp conversation from this number will create the lead again.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  Cancel
                </Button>
                <Button isPending={isDeleting} variant="danger" onPress={handleDelete}>
                  Delete
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </form>
  );
}

export function LeadEditModal({
  lead,
  lists,
  attributes,
  onClose,
}: {
  lead: LeadRow | null;
  lists: LeadListRow[];
  attributes: LeadAttribute[];
  onClose: () => void;
}) {
  return (
    <Modal.Backdrop isOpen={lead !== null} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-lg">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{lead?.name || "Lead"}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            {lead ? (
              <LeadForm key={lead.id} attributes={attributes} lead={lead} lists={lists} onDone={onClose} />
            ) : null}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
