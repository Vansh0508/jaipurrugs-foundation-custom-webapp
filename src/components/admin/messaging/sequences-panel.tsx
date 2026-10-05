"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, TrashBin } from "@gravity-ui/icons";
import { AlertDialog, Button, Chip, Description, Input, Label, Modal, Switch, TextField, toast } from "@heroui/react";
import {
  createRuleSet,
  createRuleSetItem,
  deleteRuleSet,
  deleteRuleSetItem,
  setRuleSetActive,
  updateRuleSet,
  updateRuleSetItem,
} from "@/lib/actions/messaging";
import { describeTiming, type RuleAnchor, type TemplateOption } from "@/lib/visits/messaging";
import { RuleForm } from "./rule-form";

export interface RuleSetItemRow {
  id: string;
  name: string;
  anchor: string;
  offset_minutes: number;
  template_name: string;
  template_language: string;
  enabled: boolean;
}

export interface RuleSetRow {
  id: string;
  name: string;
  description: string | null;
  visit_type: string | null;
  is_active: boolean;
  items: RuleSetItemRow[];
}

function SequenceForm({ set, onSaved }: { set: RuleSetRow | null; onSaved: () => void }) {
  const [name, setName] = useState(set?.name ?? "");
  const [description, setDescription] = useState(set?.description ?? "");
  const [visitType, setVisitType] = useState(set?.visit_type ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    const input = { name, description, visitType };
    const result = set ? await updateRuleSet(set.id, input) : await createRuleSet(input);
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <TextField isRequired value={name} onChange={setName}>
        <Label>Name</Label>
        <Input placeholder="e.g. Rural Experience — after the visit" />
      </TextField>
      <TextField value={description} onChange={setDescription}>
        <Label>Description</Label>
        <Input placeholder="Optional" />
      </TextField>
      <TextField value={visitType} onChange={setVisitType}>
        <Label>Apply automatically to visits of type</Label>
        <Input placeholder="e.g. Rural Experience (leave empty to apply by hand)" />
        <Description>New visits of exactly this type get these messages as soon as they are created.</Description>
      </TextField>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button fullWidth isPending={isPending} type="submit">
        {set ? "Save" : "Create sequence"}
      </Button>
    </form>
  );
}

export function SequencesPanel({
  sets,
  templates,
  templatesError,
}: {
  sets: RuleSetRow[];
  templates: TemplateOption[];
  templatesError?: string;
}) {
  const router = useRouter();
  const [editingSet, setEditingSet] = useState<RuleSetRow | null>(null);
  const [isSetOpen, setIsSetOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<RuleSetRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Which message is being edited / added: "<setId>:new" or "<itemId>".
  const [editingItem, setEditingItem] = useState<string | null>(null);

  function openSet(set: RuleSetRow | null) {
    setEditingSet(set);
    setIsSetOpen(true);
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    const result = await deleteRuleSet(pendingDelete.id);
    setIsDeleting(false);
    if (result.error) return toast.danger(result.error);
    setPendingDelete(null);
    router.refresh();
  }

  async function run(action: Promise<{ error?: string }>) {
    const result = await action;
    if (result.error) {
      toast.danger(result.error);
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted">
          A sequence is a reusable set of timed WhatsApp messages (for example a thank-you three hours after a visit). It is
          copied onto a visit, so editing a sequence later never changes messages already scheduled for a visit.
        </p>
        <Button onPress={() => openSet(null)}>
          <Plus className="size-4" />
          New sequence
        </Button>
      </div>

      {sets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted">
          No sequences yet. Create one, add a thank-you message, and set it to apply to your Rural Experience visits.
        </div>
      ) : (
        sets.map((set) => (
          <section key={set.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-2xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {set.name}
                  {set.visit_type ? (
                    <Chip size="sm" variant="soft">
                      Auto: {set.visit_type}
                    </Chip>
                  ) : null}
                  {!set.is_active ? (
                    <Chip size="sm" variant="soft">
                      Inactive
                    </Chip>
                  ) : null}
                </span>
                {set.description ? <span className="text-xs text-muted">{set.description}</span> : null}
              </div>
              <Switch aria-label={`${set.name} active`} isSelected={set.is_active} onChange={(v) => run(setRuleSetActive(set.id, v))}>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch>
              <Button isIconOnly aria-label="Edit sequence" size="sm" variant="ghost" onPress={() => openSet(set)}>
                <Pencil className="size-4" />
              </Button>
              <Button isIconOnly aria-label="Delete sequence" size="sm" variant="ghost" onPress={() => setPendingDelete(set)}>
                <TrashBin className="size-4 text-danger" />
              </Button>
            </div>

            {set.items.length === 0 ? (
              <p className="text-sm text-muted">No messages in this sequence yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/70">
                {set.items.map((item) =>
                  editingItem === item.id ? (
                    <li key={item.id} className="p-3">
                      <RuleForm
                        submitLabel="Save changes"
                        templates={templates}
                        templatesError={templatesError}
                        value={{
                          name: item.name,
                          anchor: item.anchor,
                          offsetMinutes: item.offset_minutes,
                          templateName: item.template_name,
                          templateLanguage: item.template_language,
                          enabled: item.enabled,
                        }}
                        onCancel={() => setEditingItem(null)}
                        onSubmit={async (input) => {
                          const result = await updateRuleSetItem(item.id, input);
                          if (!result.error) {
                            setEditingItem(null);
                            router.refresh();
                          }
                          return result;
                        }}
                      />
                    </li>
                  ) : (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm font-medium">
                          {item.name}
                          {!item.enabled ? <span className="ml-2 text-xs font-normal text-muted">(disabled)</span> : null}
                        </span>
                        <span className="text-xs text-muted">
                          {describeTiming(item.anchor as RuleAnchor, item.offset_minutes)} · {item.template_name} ({item.template_language})
                        </span>
                      </div>
                      <Button isIconOnly aria-label="Edit message" size="sm" variant="ghost" onPress={() => setEditingItem(item.id)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button isIconOnly aria-label="Delete message" size="sm" variant="ghost" onPress={() => run(deleteRuleSetItem(item.id))}>
                        <TrashBin className="size-4 text-danger" />
                      </Button>
                    </li>
                  ),
                )}
              </ul>
            )}

            {editingItem === `${set.id}:new` ? (
              <RuleForm
                submitLabel="Add message"
                templates={templates}
                templatesError={templatesError}
                value={null}
                onCancel={() => setEditingItem(null)}
                onSubmit={async (input) => {
                  const result = await createRuleSetItem(set.id, input);
                  if (!result.error) {
                    setEditingItem(null);
                    router.refresh();
                  }
                  return result;
                }}
              />
            ) : (
              <Button className="self-start" size="sm" variant="secondary" onPress={() => setEditingItem(`${set.id}:new`)}>
                <Plus className="size-4" />
                Add message
              </Button>
            )}
          </section>
        ))
      )}

      <Modal.Backdrop isOpen={isSetOpen} onOpenChange={setIsSetOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{editingSet ? "Edit sequence" : "New sequence"}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <SequenceForm
                key={editingSet?.id ?? "new"}
                set={editingSet}
                onSaved={() => {
                  setIsSetOpen(false);
                  router.refresh();
                }}
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <AlertDialog isOpen={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[420px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>Delete &ldquo;{pendingDelete?.name}&rdquo;?</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>The sequence and its messages are removed. Visits that already received copies keep them.</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  Cancel
                </Button>
                <Button isPending={isDeleting} variant="danger" onPress={handleDelete}>
                  Delete sequence
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
