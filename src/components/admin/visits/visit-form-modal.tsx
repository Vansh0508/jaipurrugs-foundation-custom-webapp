"use client";

import { useMemo, useState } from "react";
import { Check } from "@gravity-ui/icons";
import {
  AlertDialog,
  Button,
  Checkbox,
  CheckboxGroup,
  ComboBox,
  DateField,
  DateRangePicker,
  Description,
  Input,
  Label,
  ListBox,
  Modal,
  RangeCalendar,
  Select,
  Tag,
  TagGroup,
  TextArea,
  TextField,
  TimeField,
} from "@heroui/react";
import { parseDate, parseTime, type CalendarDate, type Time } from "@internationalized/date";
import { findOrCreateVillage } from "@/lib/actions/villages";
import { createVisit, deleteVisit, updateVisit } from "@/lib/actions/visits";
import {
  BOOKING_CHANNELS,
  PROGRAM_CATEGORIES,
  VISIT_STATUSES,
  VISITOR_CATEGORIES,
} from "@/lib/visits/constants";
import { visitSchema, type VisitInput } from "@/lib/visits/schemas";
import { timeInputValue } from "@/lib/visits/time";
import type { VillageOption, VisitListItem, VisitReference } from "@/lib/visits/types";
import { PhoneField, joinPhone, splitPhone } from "./phone-field";

const NONE = "__none";

// Which fields live on which step, so a validation issue can send the planner
// back to the step that needs fixing.
const STEPS: { title: string; fields: (keyof VisitInput)[] }[] = [
  {
    title: "Visit details",
    fields: [
      "programCategory",
      "status",
      "visitDate",
      "endDate",
      "startTime",
      "endTime",
      "visitorCategory",
      "bookingChannel",
      "pocName",
      "pocPhone",
      "facilitator",
      "partnerId",
      "headcount",
      "originPlace",
    ],
  },
  { title: "Locations", fields: ["villageIds", "experienceIds"] },
  { title: "Payment", fields: ["source", "amountCharged", "amountToArtisans"] },
  { title: "Internal", fields: ["feedbackFormId", "notes"] },
];

const LAST_STEP = STEPS.length - 1;

function numberToText(n: number | null) {
  return n === null ? "" : String(n);
}

function toTime(value: string | null | undefined): Time | null {
  const hhmm = timeInputValue(value);
  return hhmm ? parseTime(hhmm) : null;
}

function fromTime(value: Time | null): string {
  return value ? `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}` : "";
}

function OptionSelect({
  label,
  value,
  onChange,
  options,
  noneLabel,
  isRequired,
  description,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { id: string; label: string }[];
  noneLabel?: string;
  isRequired?: boolean;
  description?: string;
  placeholder?: string;
}) {
  return (
    <Select
      isRequired={isRequired}
      placeholder={placeholder}
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

function StepIndicator({
  step,
  canOpen,
  onOpen,
}: {
  step: number;
  canOpen: (index: number) => boolean;
  onOpen: (index: number) => void;
}) {
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map((s, index) => {
        const isCurrent = index === step;
        const isDone = index < step;
        return (
          <li key={s.title}>
            <button
              aria-current={isCurrent ? "step" : undefined}
              className="flex w-full flex-col items-start gap-1.5 text-left disabled:cursor-default"
              disabled={!canOpen(index)}
              type="button"
              onClick={() => onOpen(index)}
            >
              <span
                className={`h-1 w-full rounded-full ${isCurrent || isDone ? "bg-accent" : "bg-neutral-200"}`}
              />
              <span className={`flex items-center gap-1 text-xs ${isCurrent ? "font-semibold" : "text-muted"}`}>
                {isDone ? <Check className="size-3 text-accent" /> : <span>{index + 1}.</span>}
                {s.title}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Search the locations (villages) and pick as many as needed. Typing a name that
 * matches nothing and pressing Enter adds it as a new location.
 */
function LocationPicker({
  locations,
  selectedIds,
  onChange,
  onCreated,
}: {
  locations: VillageOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onCreated: (village: VillageOption) => void;
}) {
  const [input, setInput] = useState("");
  // Remounting the combo box after each pick is the simplest way to clear it.
  const [pickerKey, setPickerKey] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = input.trim().toLowerCase();
  const available = locations.filter((l) => l.is_active && !selectedIds.includes(l.id));
  const matches = query ? available.filter((l) => l.name.toLowerCase().includes(query)) : available;
  const exact = locations.find((l) => l.name.trim().toLowerCase() === query);
  const canCreate = query.length > 0 && matches.length === 0 && !exact;
  const selected = selectedIds
    .map((id) => locations.find((l) => l.id === id))
    .filter((l): l is VillageOption => Boolean(l));

  function add(id: string) {
    if (!selectedIds.includes(id)) onChange([...selectedIds, id]);
    setInput("");
    setError(null);
    setPickerKey((k) => k + 1);
  }

  async function create() {
    if (!canCreate || isCreating) return;
    setIsCreating(true);
    setError(null);
    const result = await findOrCreateVillage(input);
    setIsCreating(false);
    if (result.error || !result.village) {
      setError(result.error ?? "Could not add the location.");
      return;
    }
    onCreated(result.village);
    add(result.village.id);
  }

  return (
    <div className="flex flex-col gap-3">
      <ComboBox
        key={pickerKey}
        allowsCustomValue
        allowsEmptyCollection
        fullWidth
        autoFocus={pickerKey > 0}
        defaultFilter={() => true}
        inputValue={input}
        selectedKey={null}
        onInputChange={(value) => {
          setInput(value);
          setError(null);
        }}
        onSelectionChange={(key) => {
          if (key) add(String(key));
        }}
      >
        <Label>Locations</Label>
        <ComboBox.InputGroup>
          <Input
            placeholder="Search, or type a new location and press Enter"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // Never let Enter here submit the step.
              e.preventDefault();
              if (canCreate) void create();
            }}
          />
          <ComboBox.Trigger />
        </ComboBox.InputGroup>
        <ComboBox.Popover>
          <ListBox
            renderEmptyState={() => (
              <p className="px-3 py-2 text-sm text-muted">
                {canCreate
                  ? `No match. Press Enter to add “${input.trim()}” as a new location.`
                  : exact && selectedIds.includes(exact.id)
                    ? `${exact.name} is already added.`
                    : "Every location is already added."}
              </p>
            )}
          >
            {matches.map((location) => (
              <ListBox.Item key={location.id} id={location.id} textValue={location.name}>
                {location.name}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </ComboBox.Popover>
      </ComboBox>

      {canCreate ? (
        <Button className="self-start" isPending={isCreating} size="sm" variant="secondary" onPress={create}>
          Add “{input.trim()}” as a new location
        </Button>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <TagGroup
        aria-label="Chosen locations"
        onRemove={(keys) => onChange(selectedIds.filter((id) => !keys.has(id)))}
      >
        <TagGroup.List
          items={selected}
          renderEmptyState={() => <p className="text-sm text-muted">No locations chosen yet.</p>}
        >
          {(location) => (
            <Tag id={location.id} textValue={location.name}>
              {location.name}
              {!location.is_active ? " (inactive)" : ""}
            </Tag>
          )}
        </TagGroup.List>
      </TagGroup>
    </div>
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
  onSaved: (created?: VisitListItem) => void;
  onDeleted: () => void;
}) {
  const isEditing = visit !== null;
  const initialPhone = splitPhone(visit?.poc_phone);
  const firstDay = visit?.visit_date ?? defaultDate;

  const [programCategory, setProgramCategory] = useState<string>(visit?.program_category ?? "rural_experience");
  const [status, setStatus] = useState<string>(visit?.status ?? "tentative");
  const [dates, setDates] = useState<{ start: CalendarDate; end: CalendarDate } | null>(() =>
    firstDay ? { start: parseDate(firstDay), end: parseDate(visit?.end_date ?? firstDay) } : null,
  );
  const [startTime, setStartTime] = useState<Time | null>(() => toTime(visit?.start_time));
  const [endTime, setEndTime] = useState<Time | null>(() => toTime(visit?.end_time));
  const [visitorCategory, setVisitorCategory] = useState(visit?.visitor_category ?? "");
  const [bookingChannel, setBookingChannel] = useState(visit?.booking_channel ?? "");
  const [pocName, setPocName] = useState(visit?.poc_name ?? "");
  const [phoneCode, setPhoneCode] = useState(initialPhone.code);
  const [phoneNumber, setPhoneNumber] = useState(initialPhone.number);
  const [facilitator, setFacilitator] = useState(visit?.facilitator ?? "");
  const [partnerId, setPartnerId] = useState(visit?.partner_id ?? "");
  const [headcount, setHeadcount] = useState(numberToText(visit?.headcount ?? null));
  const [originPlace, setOriginPlace] = useState(visit?.origin_place ?? "");
  const [villageIds, setVillageIds] = useState<string[]>(visit?.villageIds ?? []);
  const [experienceIds, setExperienceIds] = useState<string[]>(visit?.experienceIds ?? []);
  const [source, setSource] = useState(visit?.source ?? "");
  const [amountCharged, setAmountCharged] = useState(numberToText(visit?.amount_charged ?? null));
  const [amountToArtisans, setAmountToArtisans] = useState(numberToText(visit?.amount_to_artisans ?? null));
  const [feedbackFormId, setFeedbackFormId] = useState(visit?.feedback_form_id ?? "");
  const [notes, setNotes] = useState(visit?.notes ?? "");
  // Locations added from this form, until the page refreshes its reference data.
  const [addedLocations, setAddedLocations] = useState<VillageOption[]>([]);

  const [step, setStep] = useState(0);
  // Furthest step reached; a new visit can't skip ahead of it.
  const [reached, setReached] = useState(isEditing ? LAST_STEP : 0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const locations = useMemo(() => {
    const known = new Set(reference.villages.map((v) => v.id));
    return [...reference.villages, ...addedLocations.filter((v) => !known.has(v.id))];
  }, [reference.villages, addedLocations]);

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

  const isRuralExperience = programCategory === "rural_experience";

  function handleVillagesChange(next: string[]) {
    setVillageIds(next);
    // Drop experiences whose village was just removed.
    const allowed = new Set(reference.experiences.filter((e) => next.includes(e.village_id)).map((e) => e.id));
    setExperienceIds((prev) => prev.filter((id) => allowed.has(id)));
  }

  function buildInput(): VisitInput {
    const number = phoneNumber.trim();
    return {
      programCategory: programCategory as VisitInput["programCategory"],
      visitDate: dates?.start.toString() ?? "",
      endDate: dates?.end.toString() ?? "",
      startTime: fromTime(startTime),
      endTime: fromTime(endTime),
      status: status as VisitInput["status"],
      pocName,
      pocPhone: joinPhone(phoneCode, number),
      facilitator,
      partnerId,
      headcount,
      source,
      originPlace,
      visitorCategory: visitorCategory as VisitInput["visitorCategory"],
      bookingChannel,
      amountCharged,
      amountToArtisans,
      notes,
      feedbackFormId,
      villageIds,
      experienceIds,
    };
  }

  /** The first problem on the given steps, with the step it belongs to. */
  function findProblem(steps: number[]): { step: number; message: string } | null {
    const number = phoneNumber.trim();
    if (steps.includes(0) && number && !/^[\d\s-]{6,20}$/.test(number)) {
      return { step: 0, message: "Enter the coordinator's phone number using digits only." };
    }
    const parsed = visitSchema.safeParse(buildInput());
    if (parsed.success) return null;
    for (const issue of parsed.error.issues) {
      const owner = STEPS.findIndex((s) => s.fields.includes(issue.path[0] as keyof VisitInput));
      if (steps.includes(owner)) return { step: owner, message: issue.message };
    }
    return null;
  }

  function goTo(next: number) {
    setError(null);
    setStep(next);
    setReached((r) => Math.max(r, next));
  }

  function handleNext() {
    const problem = findProblem([step]);
    if (problem) {
      setError(problem.message);
      return;
    }
    goTo(step + 1);
  }

  async function handleSave() {
    const problem = findProblem(STEPS.map((_, i) => i));
    if (problem) {
      setStep(problem.step);
      setError(problem.message);
      return;
    }
    setIsPending(true);
    setError(null);
    const input = buildInput();
    if (visit) {
      const result = await updateVisit(visit.id, input);
      setIsPending(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved();
      return;
    }
    const result = await createVisit(input);
    setIsPending(false);
    if (result.error || !result.visit) {
      setError(result.error ?? "Could not create the visit.");
      return;
    }
    onSaved(result.visit);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step < LAST_STEP) handleNext();
    else void handleSave();
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

  return (
    <>
      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <StepIndicator canOpen={(index) => index <= reached} step={step} onOpen={goTo} />

        {step === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <OptionSelect
              isRequired
              description="Only Rural Experience visits feed the impact numbers on the dashboard."
              label="Program"
              options={PROGRAM_CATEGORIES}
              value={programCategory}
              onChange={setProgramCategory}
            />
            <OptionSelect isRequired label="Status" options={VISIT_STATUSES} value={status} onChange={setStatus} />

            <DateRangePicker
              isRequired
              className="sm:col-span-2"
              endName="endDate"
              startName="visitDate"
              value={dates}
              onChange={(value) => setDates(value as { start: CalendarDate; end: CalendarDate } | null)}
            >
              <Label>Dates</Label>
              <DateField.Group fullWidth>
                <DateField.Input slot="start">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
                <DateRangePicker.RangeSeparator />
                <DateField.Input slot="end">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
                <DateField.Suffix>
                  <DateRangePicker.Trigger>
                    <DateRangePicker.TriggerIndicator />
                  </DateRangePicker.Trigger>
                </DateField.Suffix>
              </DateField.Group>
              <Description>For a one-day visit, pick the same day twice.</Description>
              <DateRangePicker.Popover>
                <RangeCalendar aria-label="Visit dates">
                  <RangeCalendar.Header>
                    <RangeCalendar.YearPickerTrigger>
                      <RangeCalendar.YearPickerTriggerHeading />
                      <RangeCalendar.YearPickerTriggerIndicator />
                    </RangeCalendar.YearPickerTrigger>
                    <RangeCalendar.NavButton slot="previous" />
                    <RangeCalendar.NavButton slot="next" />
                  </RangeCalendar.Header>
                  <RangeCalendar.Grid>
                    <RangeCalendar.GridHeader>
                      {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
                    </RangeCalendar.GridHeader>
                    <RangeCalendar.GridBody>{(date) => <RangeCalendar.Cell date={date} />}</RangeCalendar.GridBody>
                  </RangeCalendar.Grid>
                  <RangeCalendar.YearPickerGrid>
                    <RangeCalendar.YearPickerGridBody>
                      {({ year }) => <RangeCalendar.YearPickerCell year={year} />}
                    </RangeCalendar.YearPickerGridBody>
                  </RangeCalendar.YearPickerGrid>
                </RangeCalendar>
              </DateRangePicker.Popover>
            </DateRangePicker>

            <div className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-medium">Time (IST)</span>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <TimeField aria-label="Start time" value={startTime} onChange={setStartTime}>
                  <TimeField.Group fullWidth>
                    <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
                  </TimeField.Group>
                </TimeField>
                <span className="text-sm text-muted">to</span>
                <TimeField aria-label="End time" value={endTime} onChange={setEndTime}>
                  <TimeField.Group fullWidth>
                    <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
                  </TimeField.Group>
                </TimeField>
              </div>
              <p className="text-xs text-muted">
                Pickup and reminder messages are scheduled from the start time; the after-visit sequence starts when
                the visit is marked completed.
              </p>
            </div>

            <OptionSelect
              isRequired
              label="Visitor category"
              options={VISITOR_CATEGORIES}
              placeholder="Choose a category"
              value={visitorCategory}
              onChange={setVisitorCategory}
            />
            <OptionSelect
              description={isRuralExperience ? "Required for Rural Experience visits." : undefined}
              isRequired={isRuralExperience}
              label="Booking channel"
              noneLabel="Not set"
              options={BOOKING_CHANNELS}
              value={bookingChannel}
              onChange={setBookingChannel}
            />

            <TextField value={pocName} onChange={setPocName}>
              <Label>JRF coordinator</Label>
              <Input placeholder="Name" />
            </TextField>
            <PhoneField
              code={phoneCode}
              label="Coordinator phone"
              number={phoneNumber}
              onCodeChange={setPhoneCode}
              onNumberChange={setPhoneNumber}
            />

            <TextField value={facilitator} onChange={setFacilitator}>
              <Label>Facilitator / host</Label>
              <Input placeholder="e.g. Shanti Devi" />
            </TextField>
            <OptionSelect
              label="Partner (optional)"
              noneLabel="No partner"
              options={partnerOptions}
              value={partnerId}
              onChange={setPartnerId}
            />

            <TextField value={headcount} onChange={setHeadcount}>
              <Label>Headcount</Label>
              <Input min={0} placeholder="e.g. 12" type="number" />
            </TextField>
            <TextField value={originPlace} onChange={setOriginPlace}>
              <Label>Coming from</Label>
              <Input placeholder="e.g. Pune" />
            </TextField>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <LocationPicker
              locations={locations}
              selectedIds={villageIds}
              onChange={handleVillagesChange}
              onCreated={(village) => setAddedLocations((prev) => [...prev, village])}
            />
            {experienceOptions.length > 0 ? (
              <CheckboxGroup value={experienceIds} onChange={setExperienceIds}>
                <Label>Experiences</Label>
                <div className="flex flex-col gap-2">
                  {experienceOptions.map((experience) => {
                    const village = locations.find((v) => v.id === experience.village_id);
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
              <p className="text-sm text-muted">
                The chosen locations have no active experiences yet. Add them on the Villages page if needed.
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField className="sm:col-span-2" value={source} onChange={setSource}>
              <Label>Institute / agency / company</Label>
              <Input placeholder="e.g. MNIT Jaipur" />
            </TextField>
            <TextField value={amountCharged} onChange={setAmountCharged}>
              <Label>Amount charged (₹)</Label>
              <Input min={0} placeholder="e.g. 15000" step="0.01" type="number" />
            </TextField>
            <TextField value={amountToArtisans} onChange={setAmountToArtisans}>
              <Label>Amount to artisan families (₹)</Label>
              <Input min={0} placeholder="e.g. 9000" step="0.01" type="number" />
            </TextField>
            <p className="text-xs text-muted sm:col-span-2">
              Leave the amounts empty if they aren&apos;t known yet — you can fill them in later.
            </p>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-4">
            <OptionSelect
              description="Each guest gets their own link to this form in the after-visit WhatsApp message. Only published forms are listed; avoid file-upload questions — they aren't shown on the guest link."
              label="Feedback form"
              noneLabel="No feedback form"
              options={formOptions}
              value={feedbackFormId}
              onChange={setFeedbackFormId}
            />
            <TextField value={notes} onChange={setNotes}>
              <Label>Internal notes</Label>
              <TextArea placeholder="Anything worth recording. Never shown to guests or the agent." rows={4} />
            </TextField>
          </div>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-4">
          <div className="flex gap-2">
            {step > 0 ? (
              <Button type="button" variant="tertiary" onPress={() => goTo(step - 1)}>
                Back
              </Button>
            ) : null}
            {isEditing ? (
              <Button type="button" variant="danger-soft" onPress={() => setIsConfirmingDelete(true)}>
                Delete visit
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">
              Step {step + 1} of {STEPS.length}
            </span>
            {step < LAST_STEP ? (
              <Button type="submit" variant={isEditing ? "secondary" : "primary"}>
                Next
              </Button>
            ) : null}
            {isEditing || step === LAST_STEP ? (
              <Button isPending={isPending} type="button" onPress={handleSave}>
                {isEditing ? "Save changes" : "Add visit"}
              </Button>
            ) : null}
          </div>
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
  /** `created` is set when a new visit was just added (not on edits). */
  onSaved: (created?: VisitListItem) => void;
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
