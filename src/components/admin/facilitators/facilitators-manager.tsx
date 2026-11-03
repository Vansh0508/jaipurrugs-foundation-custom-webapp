"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, TrashBin } from "@gravity-ui/icons";
import {
  AlertDialog,
  Button,
  Input,
  Label,
  Modal,
  SearchField,
  Switch,
  Table,
  TextField,
  toast,
} from "@heroui/react";
import {
  createFacilitator,
  deleteFacilitator,
  setFacilitatorActive,
  updateFacilitator,
} from "@/lib/actions/facilitators";
import { formatPhone } from "@/lib/mastra/phone";
import type { Tables } from "@/lib/types/supabase";
import { PhoneField, joinPhone, splitPhone } from "../visits/phone-field";

export type FacilitatorRow = Tables<"facilitators">;

function FacilitatorForm({ facilitator, onSaved }: { facilitator: FacilitatorRow | null; onSaved: () => void }) {
  const initialPhone = splitPhone(facilitator?.phone);
  const [name, setName] = useState(facilitator?.name ?? "");
  const [email, setEmail] = useState(facilitator?.email ?? "");
  const [phoneCode, setPhoneCode] = useState(initialPhone.code);
  const [phoneNumber, setPhoneNumber] = useState(initialPhone.number);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const number = phoneNumber.trim();
    if (!/^[\d\s-]{6,20}$/.test(number)) {
      setError("Enter the phone number using digits only.");
      return;
    }
    setIsPending(true);
    setError(null);
    const input = { name, email, phone: joinPhone(phoneCode, number) };
    const result = facilitator ? await updateFacilitator(facilitator.id, input) : await createFacilitator(input);
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
        <Input placeholder="e.g. Shanti Devi" />
      </TextField>

      <TextField isRequired type="email" value={email} onChange={setEmail}>
        <Label>Email</Label>
        <Input placeholder="name@jaipurrugs.org" />
      </TextField>

      <PhoneField
        isRequired
        code={phoneCode}
        label="Phone number"
        number={phoneNumber}
        onCodeChange={setPhoneCode}
        onNumberChange={setPhoneNumber}
      />

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button fullWidth isPending={isPending} type="submit">
        {facilitator ? "Save changes" : "Add facilitator"}
      </Button>
    </form>
  );
}

export function FacilitatorsManager({ facilitators }: { facilitators: FacilitatorRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<FacilitatorRow | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FacilitatorRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return facilitators;
    return facilitators.filter((f) => [f.name, f.email, f.phone].some((s) => s.toLowerCase().includes(q)));
  }, [facilitators, query]);

  function openForm(facilitator: FacilitatorRow | null) {
    setEditing(facilitator);
    setIsFormOpen(true);
  }

  async function handleToggle(facilitator: FacilitatorRow, isActive: boolean) {
    const result = await setFacilitatorActive(facilitator.id, isActive);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    const result = await deleteFacilitator(pendingDelete.id);
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SearchField aria-label="Search facilitators" className="w-72" value={query} onChange={setQuery}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search facilitators…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <Button onPress={() => openForm(null)}>
          <Plus className="size-4" />
          Add facilitator
        </Button>
      </div>

      {facilitators.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border p-16 text-center">
          <p className="text-sm font-medium">No facilitators yet</p>
          <p className="max-w-md text-sm text-muted">
            Add the JRF team members who run visits. You can then pick one on each visit instead of typing their
            details.
          </p>
        </div>
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Facilitators" className="w-full min-w-[680px]">
              <Table.Header>
                <Table.Column isRowHeader>Name</Table.Column>
                <Table.Column>Email</Table.Column>
                <Table.Column>Phone</Table.Column>
                <Table.Column>Active</Table.Column>
                <Table.Column className="w-28 text-right">
                  <span className="sr-only">Actions</span>
                </Table.Column>
              </Table.Header>
              <Table.Body>
                {filtered.map((facilitator) => (
                  <Table.Row key={facilitator.id}>
                    <Table.Cell className="font-medium">{facilitator.name}</Table.Cell>
                    <Table.Cell>
                      <a className="text-accent hover:underline" href={`mailto:${facilitator.email}`}>
                        {facilitator.email}
                      </a>
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      <a
                        className="text-accent hover:underline"
                        href={`tel:${facilitator.phone.replace(/\s+/g, "")}`}
                      >
                        {formatPhone(facilitator.phone)}
                      </a>
                    </Table.Cell>
                    <Table.Cell>
                      <Switch
                        aria-label={`${facilitator.name} active`}
                        isSelected={facilitator.is_active}
                        onChange={(selected) => handleToggle(facilitator, selected)}
                      >
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Button
                        isIconOnly
                        aria-label="Edit facilitator"
                        size="sm"
                        variant="ghost"
                        onPress={() => openForm(facilitator)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        isIconOnly
                        aria-label="Delete facilitator"
                        size="sm"
                        variant="ghost"
                        onPress={() => setPendingDelete(facilitator)}
                      >
                        <TrashBin className="size-4 text-danger" />
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}

      {filtered.length === 0 && facilitators.length > 0 ? (
        <p className="text-center text-sm text-muted">No facilitators match.</p>
      ) : null}

      <Modal.Backdrop isOpen={isFormOpen} onOpenChange={setIsFormOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{editing ? "Edit facilitator" : "Add facilitator"}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <FacilitatorForm
                key={editing?.id ?? "new"}
                facilitator={editing}
                onSaved={() => {
                  setIsFormOpen(false);
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
                <p>The facilitator is removed. If visits are linked to them, deactivate them instead.</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  Cancel
                </Button>
                <Button isPending={isDeleting} variant="danger" onPress={handleDelete}>
                  Delete facilitator
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
