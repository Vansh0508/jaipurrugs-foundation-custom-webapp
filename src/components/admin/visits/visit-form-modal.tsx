"use client";

import { useMemo, useState } from "react";
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
  TextArea,
  TextField,
} from "@heroui/react";
import { createVisit, deleteVisit, updateVisit } from "@/lib/actions/visits";
import {
  BOOKING_CHANNELS,
  PROGRAM_CATEGORIES,
  SUGGESTED_VISIT_TYPES,
  VISIT_STATUSES,
  VISITOR_CATEGORIES,
} from "@/lib/visits/constants";
import { timeInputValue } from "@/lib/visits/time";
import type { VisitListItem, VisitReference } from "@/lib/visits/types";

const NONE = "__none";

function numberToText(n: number | null) {
  return n === null ? "" : String(n);
}

function OptionSelect({
  label,
  value,
  onChange,
  options,
  noneLabel,
  isRequired,
  description,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { id: string; label: string }[];
  noneLabel?: string;
  isRequired?: boolean;
  description?: string;
}) {
  return (
    <Select
      isRequired={isRequired}
      value={value || (noneLabel ? NONE : null)}
      onChange={(key) => onChange(!key || key === NONE ? "" : String(key))}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      {description ? <Description>{description}</Description> : null}
      <Select.Popover>
        <ListBox>
          {noneLabel ? (
            <ListBox.Item id={NONE} textValue={noneLabel}>
              <span className="text-muted">{noneLabel}</span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ) : null}
          {options.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function VisitForm({
  visit,
  defaultDate,
  reference,
  onSaved,
  onDeleted,
}: {
  visit: VisitListItem | null;
  defaultDate: string;
  reference: VisitReference;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [visitType, setVisitType] = useState(visit?.visit_type ?? "Rural Experience");
  const [visitDate, setVisitDate] = useState(visit?.visit_date ?? defaultDate);
  const [startTime, setStartTime] = useState(timeInputValue(visit?.start_time));
  const [endTime, setEndTime] = useState(timeInputValue(visit?.end_time));
  const [status, setStatus] = useState<string>(visit?.status ?? "tentative");
  const [pocName, setPocName] = useState(visit?.poc_name ?? "");
  const [pocPhone, setPocPhone] = useState(visit?.poc_phone ?? "");
  const [facilitator, setFacilitator] = useState(visit?.facilitator ?? "");
  const [partnerId, setPartnerId] = useState(visit?.partner_id ?? "");
  const [headcount, setHeadcount] = useState(numberToText(visit?.headcount ?? null));
  const [visitorGroup, setVisitorGroup] = useState(visit?.visitor_group ?? "");
  const [source, setSource] = useState(visit?.source ?? "");
  const [originPlace, setOriginPlace] = useState(visit?.origin_place ?? "");
  const [villageIds, setVillageIds] = useState<string[]>(visit?.villageIds ?? []);
  const [experienceIds, setExperienceIds] = useState<string[]>(visit?.experienceIds ?? []);
  const [programCategory, setProgramCategory] = useState<string>(visit?.program_category ?? "rural_experience");
  const [visitorCategory, setVisitorCategory] = useState(visit?.visitor_category ?? "");
  const [bookingChannel, setBookingChannel] = useState(visit?.booking_channel ?? "");
  const [amountCharged, setAmountCharged] = useState(numberToText(visit?.amount_charged ?? null));
  const [amountToArtisans, setAmountToArtisans] = useState(numberToText(visit?.amount_to_artisans ?? null));
  const [notes, setNotes] = useState(visit?.notes ?? "");
  const [feedbackFormId, setFeedbackFormId] = useState(visit?.feedback_form_id ?? "");

  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Pickers show active villages/experiences plus any already attached to this visit.
  const villageOptions = reference.villages.filter((v) => v.is_active || villageIds.includes(v.id));
  const experienceOptions = useMemo(
    () =>
      reference.experiences.filter(
        (e) => villageIds.includes(e.village_id) && (e.is_active || experienceIds.includes(e.id)),
      ),
    [reference.experiences, villageIds, experienceIds],
  );
  const partnerOptions = reference.partners
    .filter((p) => p.is_active || p.id === partnerId)
    .map((p) => ({ id: p.id, label: p.name }));
  // Published forms, plus the one already chosen even if it has since been unpublished.
  const formOptions = reference.forms.map((f) => ({ id: f.id, label: f.title }));
  if (feedbackFormId && !formOptions.some((f) => f.id === feedbackFormId)) {
    formOptions.push({ id: feedbackFormId, label: "Unavailable form (unpublished or deleted)" });
  }

  function handleVillagesChange(next: string[]) {
    setVillageIds(next);
    // Drop experiences whose village was just unticked.
    const allowed = new Set(reference.experiences.filter((e) => next.includes(e.village_id)).map((e) => e.id));
    setExperienceIds((prev) => prev.filter((id) => allowed.has(id)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    const input = {
      visitType,
      visitDate,
      startTime,
      endTime,
      status: status as "tentative",
      pocName,
      pocPhone,
      facilitator,
      partnerId,
      headcount,
      visitorGroup,
      source,
      originPlace,
      programCategory: programCategory as "other",
      visitorCategory,
      bookingChannel,
      amountCharged,
      amountToArtisans,
      notes,
      feedbackFormId,
      villageIds,
      experienceIds,
    };
    const result = visit ? await updateVisit(visit.id, input) : await createVisit(input);
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    if (!visit) return;
    setIsDeleting(true);
    const result = await deleteVisit(visit.id);
    setIsDeleting(false);
    if (result.error) {
      setError(result.error);
      setIsConfirmingDelete(false);
      return;
    }
    setIsConfirmingDelete(false);
    onDeleted();
  }

  const isRuralExperience = programCategory === "rural_experience";

  return (
    <>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField isRequired value={visitType} onChange={setVisitType}>
            <Label>Visit type</Label>
            <Input list="visit-type-suggestions" placeholder="e.g. Rural Experience" />
            <datalist id="visit-type-suggestions">
              {SUGGESTED_VISIT_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </TextField>
          <OptionSelect isRequired label="Status" options={VISIT_STATUSES} value={status} onChange={setStatus} />
          <TextField isRequired value={visitDate} onChange={setVisitDate}>
            <Label>Date</Label>
            <Input type="date" />
          </TextField>
          <div className="grid grid-cols-2 gap-4">
            <TextField value={startTime} onChange={setStartTime}>
              <Label>Starts</Label>
              <Input type="time" />
            </TextField>
            <TextField value={endTime} onChange={setEndTime}>
              <Label>Ends</Label>
              <Input type="time" />
            </TextField>
          </div>
        </div>
        <Description className="-mt-2">
          Times are Indian Standard Time. Pickup and reminder messages are scheduled from the start time; the
          after-visit sequence starts when the visit is marked completed.
        </Description>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField value={pocName} onChange={setPocName}>
            <Label>JRF coordinator</Label>
            <Input placeholder="Name" />
          </TextField>
          <TextField value={pocPhone} onChange={setPocPhone}>
            <Label>Coordinator phone</Label>
            <Input placeholder="Shown to guests if you share it" />
          </TextField>
          <TextField value={facilitator} onChange={setFacilitator}>
            <Label>Facilitator / host</Label>
            <Input placeholder="e.g. Shanti Devi" />
          </TextField>
          <OptionSelect label="Partner" noneLabel="No partner" options={partnerOptions} value={partnerId} onChange={setPartnerId} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <TextField value={headcount} onChange={setHeadcount}>
            <Label>Headcount</Label>
            <Input min={0} placeholder="e.g. 12" type="number" />
          </TextField>
          <TextField value={visitorGroup} onChange={setVisitorGroup}>
            <Label>Visitor group</Label>
            <Input placeholder="e.g. Students" />
          </TextField>
          <TextField value={originPlace} onChange={setOriginPlace}>
            <Label>Coming from</Label>
            <Input placeholder="e.g. Pune" />
          </TextField>
        </div>
        <TextField value={source} onChange={setSource}>
          <Label>Institute / agency / company</Label>
          <Input placeholder="e.g. MNIT Jaipur" />
        </TextField>

        <div className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4">
          <p className="text-sm font-medium">Where they go</p>
          {villageOptions.length === 0 ? (
            <p className="text-sm text-muted">Add villages on the Villages page first.</p>
          ) : (
            <CheckboxGroup value={villageIds} onChange={handleVillagesChange}>
              <Label>Villages</Label>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {villageOptions.map((village) => (
                  <Checkbox key={village.id} value={village.id}>
                    <Checkbox.Content>
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      {village.name}
                      {!village.is_active ? " (inactive)" : ""}
                    </Checkbox.Content>
                  </Checkbox>
                ))}
              </div>
            </CheckboxGroup>
          )}
          {experienceOptions.length > 0 ? (
            <CheckboxGroup value={experienceIds} onChange={setExperienceIds}>
              <Label>Experiences</Label>
              <div className="flex flex-col gap-2">
                {experienceOptions.map((experience) => {
                  const village = reference.villages.find((v) => v.id === experience.village_id);
                  return (
                    <Checkbox key={experience.id} value={experience.id}>
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        {experience.name}
                        <span className="text-muted"> — {village?.name}</span>
                      </Checkbox.Content>
                    </Checkbox>
                  );
                })}
              </div>
              <Description>The WhatsApp agent tells each guest what is planned from these.</Description>
            </CheckboxGroup>
          ) : villageIds.length > 0 ? (
            <p className="text-sm text-muted">The chosen villages have no active experiences yet.</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-border/70 p-4">
          <p className="text-sm font-medium">Impact &amp; economics</p>
          <OptionSelect
            description="Only Rural Experience visits feed the impact numbers on the dashboard."
            label="Program"
            options={PROGRAM_CATEGORIES}
            value={programCategory}
            onChange={setProgramCategory}
          />
          {isRuralExperience ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <OptionSelect isRequired label="Visitor category" noneLabel="Not set" options={VISITOR_CATEGORIES} value={visitorCategory} onChange={setVisitorCategory} />
              <OptionSelect isRequired label="Booking channel" noneLabel="Not set" options={BOOKING_CHANNELS} value={bookingChannel} onChange={setBookingChannel} />
              <TextField value={amountCharged} onChange={setAmountCharged}>
                <Label>Amount charged (₹)</Label>
                <Input min={0} placeholder="e.g. 15000" step="0.01" type="number" />
              </TextField>
              <TextField value={amountToArtisans} onChange={setAmountToArtisans}>
                <Label>Amount to artisan families (₹)</Label>
                <Input min={0} placeholder="e.g. 9000" step="0.01" type="number" />
              </TextField>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4">
          <p className="text-sm font-medium">After the visit</p>
          <OptionSelect
            description="Each guest gets their own link to this form in the after-visit WhatsApp message. Only published forms are listed; avoid file-upload questions — they aren't shown on the guest link."
            label="Feedback form"
            noneLabel="No feedback form"
            options={formOptions}
            value={feedbackFormId}
            onChange={setFeedbackFormId}
          />
        </div>

        <TextField value={notes} onChange={setNotes}>
          <Label>Internal notes</Label>
          <TextArea placeholder="Anything worth recording. Never shown to guests or the agent." rows={3} />
        </TextField>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex items-center justify-between gap-2">
          {visit ? (
            <Button type="button" variant="danger-soft" onPress={() => setIsConfirmingDelete(true)}>
              Delete visit
            </Button>
          ) : (
            <span />
          )}
          <Button isPending={isPending} type="submit">
            {visit ? "Save changes" : "Add visit"}
          </Button>
        </div>
      </form>

      <AlertDialog isOpen={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[420px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>Delete this visit?</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  The visit, its guest list and any messages still scheduled for it are removed. The guests
                  themselves stay in Leads. This can&apos;t be undone — to keep the record, mark it cancelled
                  instead.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  Cancel
                </Button>
                <Button isPending={isDeleting} variant="danger" onPress={handleDelete}>
                  Delete visit
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}

export function VisitFormModal({
  visit,
  defaultDate,
  reference,
  isOpen,
  onOpenChange,
  onSaved,
}: {
  visit: VisitListItem | null;
  defaultDate: string;
  reference: VisitReference;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container scroll="outside">
        <Modal.Dialog className="sm:max-w-2xl">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{visit ? "Edit visit" : "Add visit"}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            {/* Keyed so switching visits (or opening a fresh one) resets every field. */}
            <VisitForm
              key={visit?.id ?? `new-${defaultDate}`}
              defaultDate={defaultDate}
              reference={reference}
              visit={visit}
              onDeleted={() => {
                onOpenChange(false);
                onSaved();
              }}
              onSaved={onSaved}
            />
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
