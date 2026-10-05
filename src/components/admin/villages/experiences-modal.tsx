"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus, TrashBin } from "@gravity-ui/icons";
import {
  AlertDialog,
  Button,
  Chip,
  Description,
  Input,
  Label,
  Modal,
  Switch,
  TextArea,
  TextField,
  toast,
} from "@heroui/react";
import {
  createExperience,
  deleteExperience,
  setExperienceActive,
  updateExperience,
} from "@/lib/actions/villages";
import type { Tables } from "@/lib/types/supabase";
import { parseItinerary } from "@/lib/visits/schemas";
import type { VillageRow } from "./village-form-modal";

export type ExperienceRow = Tables<"experiences">;

type StepDraft = { title: string; minutes: string; description: string };

function ExperienceForm({
  villageId,
  experience,
  onBack,
  onSaved,
}: {
  villageId: string;
  experience: ExperienceRow | null;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(experience?.name ?? "");
  const [description, setDescription] = useState(experience?.description ?? "");
  const [category, setCategory] = useState(experience?.category ?? "");
  const [duration, setDuration] = useState(experience?.duration_min ? String(experience.duration_min) : "");
  const [capacity, setCapacity] = useState(experience?.capacity ? String(experience.capacity) : "");
  const [seasonal, setSeasonal] = useState(experience?.seasonal ?? "");
  const [featured, setFeatured] = useState(experience?.featured ?? false);
  const [steps, setSteps] = useState<StepDraft[]>(
    parseItinerary(experience?.itinerary).map((s) => ({
      title: s.title,
      minutes: s.minutes === null ? "" : String(s.minutes),
      description: s.description,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function moveStep(index: number, delta: number) {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    const input = {
      name,
      description,
      category,
      durationMin: duration,
      capacity,
      seasonal,
      featured,
      itinerary: steps.map((s) => ({ title: s.title, minutes: s.minutes, description: s.description })),
    };
    const result = experience ? await updateExperience(experience.id, input) : await createExperience(villageId, input);
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div>
        <Button size="sm" type="button" variant="ghost" onPress={onBack}>
          <ArrowLeft className="size-4" />
          Back to experiences
        </Button>
      </div>

      <TextField isRequired value={name} onChange={setName}>
        <Label>Experience name</Label>
        <Input placeholder="e.g. Try carpet weaving" />
      </TextField>

      <TextField value={description} onChange={setDescription}>
        <Label>Description</Label>
        <TextArea placeholder="What the guest does and sees" rows={3} />
        <Description>The WhatsApp agent uses this to describe the experience to guests.</Description>
      </TextField>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField value={category} onChange={setCategory}>
          <Label>Category</Label>
          <Input placeholder="e.g. Craft & Making" />
        </TextField>
        <TextField value={seasonal} onChange={setSeasonal}>
          <Label>Seasonal note</Label>
          <Input placeholder="e.g. Paused in monsoon" />
        </TextField>
        <TextField value={duration} onChange={setDuration}>
          <Label>Duration (minutes)</Label>
          <Input min={1} placeholder="e.g. 60" type="number" />
        </TextField>
        <TextField value={capacity} onChange={setCapacity}>
          <Label>Capacity (guests)</Label>
          <Input min={1} placeholder="e.g. 15" type="number" />
        </TextField>
      </div>

      <Switch isSelected={featured} onChange={setFeatured}>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          Popular — mention this first when guests ask what to do
        </Switch.Content>
      </Switch>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Itinerary steps</Label>
          <Button
            size="sm"
            type="button"
            variant="secondary"
            onPress={() => setSteps((prev) => [...prev, { title: "", minutes: "", description: "" }])}
          >
            <Plus className="size-4" />
            Add step
          </Button>
        </div>
        {steps.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
            No steps yet. Steps are shown to guests in order, for example &ldquo;Village walk — 30 min&rdquo;.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {steps.map((step, index) => (
              <li key={index} className="flex flex-col gap-2 rounded-xl border border-border/70 p-3">
                <div className="flex items-end gap-2">
                  <span className="pb-2 text-sm font-medium text-muted">{index + 1}.</span>
                  <TextField aria-label={`Step ${index + 1} title`} className="flex-1" value={step.title} onChange={(v) => updateStep(index, { title: v })}>
                    <Input placeholder="Step title" />
                  </TextField>
                  <TextField aria-label={`Step ${index + 1} minutes`} className="w-24" value={step.minutes} onChange={(v) => updateStep(index, { minutes: v })}>
                    <Input min={1} placeholder="Min" type="number" />
                  </TextField>
                  <Button isDisabled={index === 0} isIconOnly aria-label="Move step up" size="sm" type="button" variant="ghost" onPress={() => moveStep(index, -1)}>
                    ↑
                  </Button>
                  <Button isDisabled={index === steps.length - 1} isIconOnly aria-label="Move step down" size="sm" type="button" variant="ghost" onPress={() => moveStep(index, 1)}>
                    ↓
                  </Button>
                  <Button isIconOnly aria-label="Remove step" size="sm" type="button" variant="ghost" onPress={() => setSteps((prev) => prev.filter((_, i) => i !== index))}>
                    <TrashBin className="size-4 text-danger" />
                  </Button>
                </div>
                <TextField aria-label={`Step ${index + 1} description`} value={step.description} onChange={(v) => updateStep(index, { description: v })}>
                  <Input placeholder="Optional details" />
                </TextField>
              </li>
            ))}
          </ol>
        )}
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button fullWidth isPending={isPending} type="submit">
        {experience ? "Save experience" : "Add experience"}
      </Button>
    </form>
  );
}

export function ExperiencesModal({
  village,
  experiences,
  isOpen,
  onOpenChange,
}: {
  village: VillageRow | null;
  experiences: ExperienceRow[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ExperienceRow | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ExperienceRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function handleOpenChange(open: boolean) {
    if (!open) setEditing(null);
    onOpenChange(open);
  }

  async function handleToggle(experience: ExperienceRow, isActive: boolean) {
    const result = await setExperienceActive(experience.id, isActive);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    const result = await deleteExperience(pendingDelete.id);
    setIsDeleting(false);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    setPendingDelete(null);
    router.refresh();
  }

  return (
    <>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={handleOpenChange}>
        <Modal.Container scroll="outside">
          <Modal.Dialog className="sm:max-w-2xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Experiences{village ? ` — ${village.name}` : ""}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {village && editing ? (
                <ExperienceForm
                  key={editing === "new" ? "new" : editing.id}
                  experience={editing === "new" ? null : editing}
                  villageId={village.id}
                  onBack={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    router.refresh();
                  }}
                />
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted">
                      What guests can do here. The WhatsApp agent reads these when guests ask about their visit.
                    </p>
                    <Button onPress={() => setEditing("new")}>
                      <Plus className="size-4" />
                      Add experience
                    </Button>
                  </div>
                  {experiences.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
                      No experiences for this village yet.
                    </div>
                  ) : (
                    <ul className="flex flex-col divide-y divide-border/60 rounded-2xl border border-border/70">
                      {experiences.map((experience) => {
                        const stepCount = parseItinerary(experience.itinerary).length;
                        return (
                          <li key={experience.id} className="flex items-start gap-3 px-4 py-3">
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">{experience.name}</span>
                                {experience.featured ? (
                                  <Chip color="success" size="sm" variant="soft">
                                    Popular
                                  </Chip>
                                ) : null}
                                {experience.seasonal ? (
                                  <Chip color="warning" size="sm" variant="soft">
                                    {experience.seasonal}
                                  </Chip>
                                ) : null}
                                {!experience.is_active ? (
                                  <Chip size="sm" variant="soft">
                                    Inactive
                                  </Chip>
                                ) : null}
                              </div>
                              {experience.description ? (
                                <p className="line-clamp-2 text-sm text-muted">{experience.description}</p>
                              ) : null}
                              <p className="text-xs text-muted">
                                {experience.duration_min ? `${experience.duration_min} min` : "Duration not set"}
                                {" · "}
                                {experience.capacity ? `up to ${experience.capacity} guests` : "Capacity not set"}
                                {experience.category ? ` · ${experience.category}` : ""}
                                {stepCount > 0 ? ` · ${stepCount} step${stepCount === 1 ? "" : "s"}` : ""}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Switch
                                aria-label={`${experience.name} active`}
                                isSelected={experience.is_active}
                                onChange={(selected) => handleToggle(experience, selected)}
                              >
                                <Switch.Control>
                                  <Switch.Thumb />
                                </Switch.Control>
                              </Switch>
                              <Button isIconOnly aria-label="Edit experience" size="sm" variant="ghost" onPress={() => setEditing(experience)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button isIconOnly aria-label="Delete experience" size="sm" variant="ghost" onPress={() => setPendingDelete(experience)}>
                                <TrashBin className="size-4 text-danger" />
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
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
                <p>The experience and its itinerary are removed. If visits already use it, deactivate it instead.</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  Cancel
                </Button>
                <Button isPending={isDeleting} variant="danger" onPress={handleDelete}>
                  Delete experience
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}
