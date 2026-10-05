"use client";

import { useState } from "react";
import { Button, Description, Input, Label, Modal, TextArea, TextField } from "@heroui/react";
import { createVillage, updateVillage } from "@/lib/actions/villages";
import type { Tables } from "@/lib/types/supabase";

export type VillageRow = Tables<"villages">;

const numberToText = (n: number | null) => (n === null ? "" : String(n));

function VillageForm({ village, onSaved }: { village: VillageRow | null; onSaved: () => void }) {
  const [name, setName] = useState(village?.name ?? "");
  const [region, setRegion] = useState(village?.region ?? "");
  const [craftType, setCraftType] = useState(village?.craft_type ?? "");
  const [partnerType, setPartnerType] = useState(village?.partner_type ?? "");
  const [activeSince, setActiveSince] = useState(village?.active_since ?? "");
  const [households, setHouseholds] = useState(numberToText(village?.total_households ?? null));
  const [families, setFamilies] = useState(numberToText(village?.artisan_families_engaged ?? null));
  const [women, setWomen] = useState(numberToText(village?.women_participants ?? null));
  const [notes, setNotes] = useState(village?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    const input = {
      name,
      region,
      craftType,
      partnerType,
      activeSince,
      totalHouseholds: households,
      artisanFamiliesEngaged: families,
      womenParticipants: women,
      notes,
    };
    const result = village ? await updateVillage(village.id, input) : await createVillage(input);
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
        <Label>Village name</Label>
        <Input placeholder="e.g. Manpura" />
      </TextField>

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField value={region} onChange={setRegion}>
          <Label>Region</Label>
          <Input placeholder="e.g. Jaipur district" />
        </TextField>
        <TextField value={craftType} onChange={setCraftType}>
          <Label>Craft type</Label>
          <Input placeholder="e.g. Carpet weaving" />
        </TextField>
        <TextField value={partnerType} onChange={setPartnerType}>
          <Label>Partner type</Label>
          <Input placeholder="e.g. Local NGO" />
        </TextField>
      </div>
      <Description className="-mt-2">
        Craft, region and partner type feed the dashboard&apos;s replicability numbers. Use a different value
        from your other villages where it genuinely differs.
      </Description>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField value={activeSince} onChange={setActiveSince}>
          <Label>Active since</Label>
          <Input type="date" />
        </TextField>
        <TextField value={households} onChange={setHouseholds}>
          <Label>Total households</Label>
          <Input min={0} placeholder="e.g. 120" type="number" />
        </TextField>
        <TextField value={families} onChange={setFamilies}>
          <Label>Artisan families engaged</Label>
          <Input min={0} placeholder="e.g. 45" type="number" />
        </TextField>
        <TextField value={women} onChange={setWomen}>
          <Label>Women participants</Label>
          <Input min={0} placeholder="e.g. 60" type="number" />
        </TextField>
      </div>

      <TextField value={notes} onChange={setNotes}>
        <Label>Notes</Label>
        <TextArea placeholder="Optional" rows={3} />
      </TextField>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button fullWidth isPending={isPending} type="submit">
        {village ? "Save changes" : "Add village"}
      </Button>
    </form>
  );
}

export function VillageFormModal({
  village,
  isOpen,
  onOpenChange,
  onSaved,
}: {
  village: VillageRow | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-xl">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{village ? "Edit village" : "Add village"}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            {/* Keyed so switching villages resets the form fields. */}
            <VillageForm key={village?.id ?? "new"} village={village} onSaved={onSaved} />
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
