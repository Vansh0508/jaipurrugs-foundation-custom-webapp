"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, TrashBin } from "@gravity-ui/icons";
import { AlertDialog, Button, Chip, SearchField, Switch, Table, toast } from "@heroui/react";
import { deleteVillage, setVillageActive } from "@/lib/actions/villages";
import { ExperiencesModal, type ExperienceRow } from "./experiences-modal";
import { VillageFormModal, type VillageRow } from "./village-form-modal";

function dash(value: string | number | null) {
  return value === null || value === "" ? <span className="text-muted">—</span> : value;
}

export function VillagesManager({
  villages,
  experiences,
}: {
  villages: VillageRow[];
  experiences: ExperienceRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<VillageRow | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [experiencesFor, setExperiencesFor] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VillageRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const experiencesByVillage = useMemo(() => {
    const map = new Map<string, ExperienceRow[]>();
    for (const experience of experiences) {
      map.set(experience.village_id, [...(map.get(experience.village_id) ?? []), experience]);
    }
    return map;
  }, [experiences]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return villages;
    return villages.filter((v) =>
      [v.name, v.region ?? "", v.craft_type ?? "", v.partner_type ?? ""].some((s) => s.toLowerCase().includes(q)),
    );
  }, [villages, query]);

  const experiencesVillage = villages.find((v) => v.id === experiencesFor) ?? null;

  function openForm(village: VillageRow | null) {
    setEditing(village);
    setIsFormOpen(true);
  }

  async function handleToggle(village: VillageRow, isActive: boolean) {
    const result = await setVillageActive(village.id, isActive);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    const result = await deleteVillage(pendingDelete.id);
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
        <SearchField aria-label="Search villages" className="w-72" value={query} onChange={setQuery}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search villages…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <Button onPress={() => openForm(null)}>
          <Plus className="size-4" />
          Add village
        </Button>
      </div>

      {villages.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border p-16 text-center">
          <p className="text-sm font-medium">No villages yet</p>
          <p className="max-w-md text-sm text-muted">
            Add the villages that host visits, then add the experiences guests can do in each one. Visits and
            the WhatsApp agent use these.
          </p>
        </div>
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Villages" className="w-full min-w-[920px]">
              <Table.Header>
                <Table.Column isRowHeader>Village</Table.Column>
                <Table.Column>Region</Table.Column>
                <Table.Column>Craft</Table.Column>
                <Table.Column>Partner type</Table.Column>
                <Table.Column>Households</Table.Column>
                <Table.Column>Families</Table.Column>
                <Table.Column>Women</Table.Column>
                <Table.Column>Experiences</Table.Column>
                <Table.Column>Active</Table.Column>
                <Table.Column className="w-40 text-right">
                  <span className="sr-only">Actions</span>
                </Table.Column>
              </Table.Header>
              <Table.Body>
                {filtered.map((village) => {
                  const count = experiencesByVillage.get(village.id)?.length ?? 0;
                  return (
                    <Table.Row key={village.id}>
                      <Table.Cell className="font-medium">
                        {village.name}
                        {village.active_since ? (
                          <span className="block text-xs font-normal text-muted">since {village.active_since}</span>
                        ) : null}
                      </Table.Cell>
                      <Table.Cell>{dash(village.region)}</Table.Cell>
                      <Table.Cell>{dash(village.craft_type)}</Table.Cell>
                      <Table.Cell>{dash(village.partner_type)}</Table.Cell>
                      <Table.Cell className="tabular-nums">{dash(village.total_households)}</Table.Cell>
                      <Table.Cell className="tabular-nums">{dash(village.artisan_families_engaged)}</Table.Cell>
                      <Table.Cell className="tabular-nums">{dash(village.women_participants)}</Table.Cell>
                      <Table.Cell>
                        <Button size="sm" variant="secondary" onPress={() => setExperiencesFor(village.id)}>
                          {count} experience{count === 1 ? "" : "s"}
                        </Button>
                      </Table.Cell>
                      <Table.Cell>
                        <Switch
                          aria-label={`${village.name} active`}
                          isSelected={village.is_active}
                          onChange={(selected) => handleToggle(village, selected)}
                        >
                          <Switch.Control>
                            <Switch.Thumb />
                          </Switch.Control>
                        </Switch>
                        {!village.is_active ? (
                          <Chip className="ml-2" size="sm" variant="soft">
                            Inactive
                          </Chip>
                        ) : null}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <Button isIconOnly aria-label="Edit village" size="sm" variant="ghost" onPress={() => openForm(village)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button isIconOnly aria-label="Delete village" size="sm" variant="ghost" onPress={() => setPendingDelete(village)}>
                          <TrashBin className="size-4 text-danger" />
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}

      {filtered.length === 0 && villages.length > 0 ? (
        <p className="text-center text-sm text-muted">No villages match.</p>
      ) : null}

      <VillageFormModal
        isOpen={isFormOpen}
        village={editing}
        onOpenChange={setIsFormOpen}
        onSaved={() => {
          setIsFormOpen(false);
          router.refresh();
        }}
      />

      <ExperiencesModal
        experiences={experiencesVillage ? (experiencesByVillage.get(experiencesVillage.id) ?? []) : []}
        isOpen={experiencesFor !== null}
        village={experiencesVillage}
        onOpenChange={(open) => !open && setExperiencesFor(null)}
      />

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
                <p>
                  The village and its {experiencesByVillage.get(pendingDelete?.id ?? "")?.length ?? 0} experiences
                  are removed. If visits already use it, deactivate it instead.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  Cancel
                </Button>
                <Button isPending={isDeleting} variant="danger" onPress={handleDelete}>
                  Delete village
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
