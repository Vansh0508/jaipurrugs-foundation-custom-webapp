"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, TrashBin } from "@gravity-ui/icons";
import { AlertDialog, Button, Input, Label, Modal, TextField, toast } from "@heroui/react";
import { createLeadList, deleteLeadList, updateLeadList } from "@/lib/actions/leads";
import type { LeadListRow } from "./leads-workspace";

function ListForm({ list, onSaved }: { list: LeadListRow | null; onSaved: () => void }) {
  const [name, setName] = useState(list?.name ?? "");
  const [description, setDescription] = useState(list?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    const input = { name, description };
    const result = list ? await updateLeadList(list.id, input) : await createLeadList(input);
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
        <Input placeholder="e.g. Bhadohi weavers" />
      </TextField>
      <TextField value={description} onChange={setDescription}>
        <Label>Description</Label>
        <Input placeholder="Optional" />
      </TextField>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button fullWidth isPending={isPending} type="submit">
        {list ? "Save" : "Create list"}
      </Button>
    </form>
  );
}

export function LeadListsPanel({ lists }: { lists: LeadListRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<LeadListRow | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LeadListRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function openEditor(list: LeadListRow | null) {
    setEditing(list);
    setIsEditorOpen(true);
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    const result = await deleteLeadList(pendingDelete.id);
    setIsDeleting(false);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    setPendingDelete(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">
          A lead can be in several lists. Forms can add their submitters to lists automatically.
        </p>
        <Button onPress={() => openEditor(null)}>
          <Plus className="size-4" />
          New list
        </Button>
      </div>

      {lists.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted">
          No lists yet.
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 rounded-2xl border border-border/70">
          {lists.map((list) => (
            <li key={list.id} className="flex items-center gap-4 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{list.name}</span>
                {list.description ? <span className="text-sm text-muted">{list.description}</span> : null}
              </div>
              <span className="shrink-0 text-sm text-muted">
                {list.memberCount} lead{list.memberCount === 1 ? "" : "s"}
              </span>
              <div className="flex shrink-0 gap-1">
                <Button isIconOnly aria-label="Edit list" size="sm" variant="ghost" onPress={() => openEditor(list)}>
                  <Pencil className="size-4" />
                </Button>
                <Button isIconOnly aria-label="Delete list" size="sm" variant="ghost" onPress={() => setPendingDelete(list)}>
                  <TrashBin className="size-4 text-danger" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal.Backdrop isOpen={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-sm">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{editing ? "Edit list" : "New list"}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <ListForm
                key={editing?.id ?? "new"}
                list={editing}
                onSaved={() => {
                  setIsEditorOpen(false);
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
            <AlertDialog.Dialog className="sm:max-w-[400px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>Delete &ldquo;{pendingDelete?.name}&rdquo;?</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  The list is removed, and forms stop adding people to it. The {pendingDelete?.memberCount ?? 0}{" "}
                  leads in it are kept.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  Cancel
                </Button>
                <Button isPending={isDeleting} variant="danger" onPress={handleDelete}>
                  Delete list
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
