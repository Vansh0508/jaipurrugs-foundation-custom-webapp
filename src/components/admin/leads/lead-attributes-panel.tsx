"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "@gravity-ui/icons";
import {
  Button,
  Chip,
  Description,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  Switch,
  Table,
  TextField,
  toast,
} from "@heroui/react";
import { createLeadAttribute, setLeadAttributeActive, updateLeadAttribute } from "@/lib/actions/leads";
import { LEAD_ATTRIBUTE_TYPES, slugifyAttributeKey, type LeadAttribute } from "@/lib/leads/fields";

type AttributeType = LeadAttribute["type"];

function typeLabel(type: AttributeType) {
  return LEAD_ATTRIBUTE_TYPES.find((t) => t.id === type)?.label ?? type;
}

function AttributeForm({ attribute, onSaved }: { attribute: LeadAttribute | null; onSaved: () => void }) {
  const isNew = attribute === null;
  const [label, setLabel] = useState(attribute?.label ?? "");
  const [key, setKey] = useState(attribute?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(false);
  const [type, setType] = useState<AttributeType>(attribute?.type ?? "text");
  const [options, setOptions] = useState(attribute?.options.join(", ") ?? "");
  const [description, setDescription] = useState(attribute?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const effectiveKey = isNew && !keyTouched ? slugifyAttributeKey(label) : key;
  const optionList = options.split(",").map((o) => o.trim()).filter(Boolean);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    const result = isNew
      ? await createLeadAttribute({ key: effectiveKey, label, type, options: optionList, description })
      : await updateLeadAttribute(attribute.id, { label, options: optionList, description });
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <TextField isRequired value={label} onChange={setLabel}>
        <Label>Label</Label>
        <Input placeholder="e.g. Village" />
      </TextField>

      <TextField
        isDisabled={!isNew}
        value={effectiveKey}
        onChange={(v) => {
          setKeyTouched(true);
          setKey(v);
        }}
      >
        <Label>Key</Label>
        <Input className="font-mono" />
        <Description>
          {isNew
            ? "Used in form mappings and template variables. Can't be changed later."
            : "Fixed — form mappings and templates refer to it."}
        </Description>
      </TextField>

      <Select isDisabled={!isNew} value={type} onChange={(k) => k && setType(k as AttributeType)}>
        <Label>Type</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        {!isNew ? <Description>The type can&apos;t change once values exist.</Description> : null}
        <Select.Popover>
          <ListBox>
            {LEAD_ATTRIBUTE_TYPES.map((t) => (
              <ListBox.Item key={t.id} id={t.id} textValue={t.label}>
                {t.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      {type === "select" ? (
        <TextField isRequired value={options} onChange={setOptions}>
          <Label>Options</Label>
          <Input placeholder="Hand-knotted, Tufted, Flatweave" />
          <Description>Comma-separated. The agent only saves values from this list.</Description>
        </TextField>
      ) : null}

      <TextField value={description} onChange={setDescription}>
        <Label>What the agent should ask</Label>
        <Input placeholder="e.g. Which village or town do you weave in?" />
        <Description>Guides the WhatsApp agent when it collects this detail.</Description>
      </TextField>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button fullWidth isPending={isPending} type="submit">
        {isNew ? "Create attribute" : "Save"}
      </Button>
    </form>
  );
}

export function LeadAttributesPanel({ attributes }: { attributes: LeadAttribute[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<LeadAttribute | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function openEditor(attribute: LeadAttribute | null) {
    setEditing(attribute);
    setIsEditorOpen(true);
  }

  async function handleToggle(attribute: LeadAttribute, isActive: boolean) {
    setTogglingId(attribute.id);
    const result = await setLeadAttributeActive(attribute.id, isActive);
    setTogglingId(null);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    toast.success(isActive ? `${attribute.label} activated` : `${attribute.label} deactivated — its data is kept`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted">
          Custom fields on every lead. Name and phone are built in. Deactivating an attribute hides it from forms,
          the agent and templates, but keeps the values already collected.
        </p>
        <Button onPress={() => openEditor(null)}>
          <Plus className="size-4" />
          New attribute
        </Button>
      </div>

      {attributes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted">
          No custom attributes yet.
        </div>
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Custom attributes" className="w-full min-w-[640px]">
              <Table.Header>
                <Table.Column isRowHeader>Attribute</Table.Column>
                <Table.Column>Key</Table.Column>
                <Table.Column>Type</Table.Column>
                <Table.Column>Active</Table.Column>
                <Table.Column className="w-14 text-right">
                  <span className="sr-only">Actions</span>
                </Table.Column>
              </Table.Header>
              <Table.Body>
                {attributes.map((attr) => (
                  <Table.Row key={attr.id}>
                    <Table.Cell>
                      <div className="flex flex-col">
                        <span className={`font-medium ${attr.is_active ? "" : "text-muted"}`}>{attr.label}</span>
                        {attr.description ? <span className="text-xs text-muted">{attr.description}</span> : null}
                      </div>
                    </Table.Cell>
                    <Table.Cell className="font-mono text-xs">{attr.key}</Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Chip size="sm" variant="soft">
                          {typeLabel(attr.type)}
                        </Chip>
                        {attr.type === "select" ? (
                          <span className="text-xs text-muted">{attr.options.join(", ")}</span>
                        ) : null}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Switch
                        aria-label={`${attr.label} active`}
                        isDisabled={togglingId === attr.id}
                        isSelected={attr.is_active}
                        onChange={(value) => handleToggle(attr, value)}
                      >
                        <Switch.Content>
                          <Switch.Control>
                            <Switch.Thumb />
                          </Switch.Control>
                        </Switch.Content>
                      </Switch>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Button isIconOnly aria-label="Edit attribute" size="sm" variant="ghost" onPress={() => openEditor(attr)}>
                        <Pencil className="size-4" />
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}

      <Modal.Backdrop isOpen={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{editing ? "Edit attribute" : "New attribute"}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <AttributeForm
                key={editing?.id ?? "new"}
                attribute={editing}
                onSaved={() => {
                  setIsEditorOpen(false);
                  router.refresh();
                }}
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
