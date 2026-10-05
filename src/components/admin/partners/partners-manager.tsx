"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, TrashBin } from "@gravity-ui/icons";
import {
  AlertDialog,
  Button,
  Chip,
  Input,
  Label,
  ListBox,
  Modal,
  SearchField,
  Select,
  Switch,
  Table,
  TextArea,
  TextField,
  toast,
} from "@heroui/react";
import { createPartner, deletePartner, setPartnerActive, updatePartner } from "@/lib/actions/partners";
import type { Tables } from "@/lib/types/supabase";
import { PARTNER_SECTORS, partnerSectorLabel } from "@/lib/visits/schemas";

export type PartnerRow = Tables<"partners">;

const ALL_SECTORS = "__all";

function PartnerForm({ partner, onSaved }: { partner: PartnerRow | null; onSaved: () => void }) {
  const [name, setName] = useState(partner?.name ?? "");
  const [sector, setSector] = useState<string>(partner?.sector ?? "private");
  const [partnerType, setPartnerType] = useState(partner?.partner_type ?? "");
  const [notes, setNotes] = useState(partner?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    const input = { name, sector: sector as "private" | "public" | "civil_society", partnerType, notes };
    const result = partner ? await updatePartner(partner.id, input) : await createPartner(input);
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
        <Label>Partner name</Label>
        <Input placeholder="e.g. Airbnb" />
      </TextField>

      <Select value={sector} onChange={(key) => key && setSector(String(key))}>
        <Label>Sector</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {PARTNER_SECTORS.map((s) => (
              <ListBox.Item key={s.id} id={s.id} textValue={s.label}>
                {s.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      <TextField value={partnerType} onChange={setPartnerType}>
        <Label>Partner type</Label>
        <Input placeholder="e.g. OTA, Tour agency, Govt tourism board, NGO" />
      </TextField>

      <TextField value={notes} onChange={setNotes}>
        <Label>Notes</Label>
        <TextArea placeholder="Optional" rows={3} />
      </TextField>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button fullWidth isPending={isPending} type="submit">
        {partner ? "Save changes" : "Add partner"}
      </Button>
    </form>
  );
}

export function PartnersManager({ partners }: { partners: PartnerRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>(ALL_SECTORS);
  const [editing, setEditing] = useState<PartnerRow | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PartnerRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return partners.filter((p) => {
      if (sectorFilter !== ALL_SECTORS && p.sector !== sectorFilter) return false;
      if (!q) return true;
      return [p.name, p.partner_type ?? "", p.notes ?? ""].some((s) => s.toLowerCase().includes(q));
    });
  }, [partners, query, sectorFilter]);

  const sectorsEngaged = new Set(partners.filter((p) => p.is_active).map((p) => p.sector)).size;

  function openForm(partner: PartnerRow | null) {
    setEditing(partner);
    setIsFormOpen(true);
  }

  async function handleToggle(partner: PartnerRow, isActive: boolean) {
    const result = await setPartnerActive(partner.id, isActive);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    const result = await deletePartner(pendingDelete.id);
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
        <div className="flex flex-wrap items-end gap-3">
          <SearchField aria-label="Search partners" className="w-72" value={query} onChange={setQuery}>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Search partners…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <Select className="w-48" value={sectorFilter} onChange={(key) => setSectorFilter(String(key ?? ALL_SECTORS))}>
            <Label>Sector</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id={ALL_SECTORS} textValue="All sectors">
                  All sectors
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {PARTNER_SECTORS.map((s) => (
                  <ListBox.Item key={s.id} id={s.id} textValue={s.label}>
                    {s.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          {partners.length > 0 ? (
            <p className="pb-2 text-xs text-muted">{sectorsEngaged} of 3 sectors engaged</p>
          ) : null}
        </div>
        <Button onPress={() => openForm(null)}>
          <Plus className="size-4" />
          Add partner
        </Button>
      </div>

      {partners.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border p-16 text-center">
          <p className="text-sm font-medium">No partners yet</p>
          <p className="max-w-md text-sm text-muted">
            Add the agencies, booking platforms, government bodies and NGOs you work with. The dashboard shows
            which sectors are engaged.
          </p>
        </div>
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Partners" className="w-full min-w-[680px]">
              <Table.Header>
                <Table.Column isRowHeader>Partner</Table.Column>
                <Table.Column>Sector</Table.Column>
                <Table.Column>Type</Table.Column>
                <Table.Column>Active</Table.Column>
                <Table.Column className="w-28 text-right">
                  <span className="sr-only">Actions</span>
                </Table.Column>
              </Table.Header>
              <Table.Body>
                {filtered.map((partner) => (
                  <Table.Row key={partner.id}>
                    <Table.Cell className="font-medium">
                      {partner.name}
                      {partner.notes ? (
                        <span className="block max-w-sm truncate text-xs font-normal text-muted">{partner.notes}</span>
                      ) : null}
                    </Table.Cell>
                    <Table.Cell>
                      <Chip size="sm" variant="soft">
                        {partnerSectorLabel(partner.sector)}
                      </Chip>
                    </Table.Cell>
                    <Table.Cell>{partner.partner_type ?? <span className="text-muted">—</span>}</Table.Cell>
                    <Table.Cell>
                      <Switch
                        aria-label={`${partner.name} active`}
                        isSelected={partner.is_active}
                        onChange={(selected) => handleToggle(partner, selected)}
                      >
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Button isIconOnly aria-label="Edit partner" size="sm" variant="ghost" onPress={() => openForm(partner)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button isIconOnly aria-label="Delete partner" size="sm" variant="ghost" onPress={() => setPendingDelete(partner)}>
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

      {filtered.length === 0 && partners.length > 0 ? (
        <p className="text-center text-sm text-muted">No partners match.</p>
      ) : null}

      <Modal.Backdrop isOpen={isFormOpen} onOpenChange={setIsFormOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{editing ? "Edit partner" : "Add partner"}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <PartnerForm
                key={editing?.id ?? "new"}
                partner={editing}
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
                <p>The partner is removed. If visits are linked to it, deactivate it instead.</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  Cancel
                </Button>
                <Button isPending={isDeleting} variant="danger" onPress={handleDelete}>
                  Delete partner
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
