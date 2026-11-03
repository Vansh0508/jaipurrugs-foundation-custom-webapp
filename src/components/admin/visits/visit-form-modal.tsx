"use client";

import { useMemo, useState } from "react";
import { Check, Plus, TrashBin } from "@gravity-ui/icons";
import {
  AlertDialog,
  Autocomplete,
  Button,
  Checkbox,
  CheckboxGroup,
  DateField,
  DateRangePicker,
  EmptyState,
  Input,
  Label,
  ListBox,
  Modal,
  RangeCalendar,
  SearchField,
  Select,
  Tag,
  TagGroup,
  TextArea,
  TextField,
  TimeField,
  useFilter,
  type Key,
} from "@heroui/react";
import { parseDate, parseTime, type CalendarDate, type Time } from "@internationalized/date";
import { findOrCreateVillage } from "@/lib/actions/villages";
import { createVisit, setVisitStatus, updateVisit } from "@/lib/actions/visits";
import {
  BOOKING_CHANNELS,
  PROGRAM_CATEGORIES,
  SALE_CHANNELS,
  VISIT_STATUSES,
  VISITOR_CATEGORIES,
} from "@/lib/visits/constants";
import { formatInr } from "@/lib/visits/dashboard";
import { visitSchema, type VisitInput } from "@/lib/visits/schemas";
import { timeInputValue } from "@/lib/visits/time";
import type { VillageOption, VisitListItem, VisitReference } from "@/lib/visits/types";
import { formatPhone } from "@/lib/mastra/phone";
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
      "facilitatorId",
      "pocGuestName",
      "pocGuestPhone",
      "pocGuestEmail",
      "partnerId",
      "headcount",
      "originPlace",
    ],
  },
  { title: "Locations", fields: ["villageIds", "experienceIds"] },
  { title: "Payment", fields: ["source", "amountCharged", "invoiceId", "amountToArtisans", "sales"] },
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
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { id: string; label: string }[];
  noneLabel?: string;
  isRequired?: boolean;
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
 * Search the locations (villages) and tick as many as needed; chosen ones stay in the
 * list with a check mark. Typing a name that matches nothing and pressing Enter adds
 * it as a new location.
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
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { contains } = useFilter({ sensitivity: "base" });

  const query = input.trim();
  // Inactive locations are only listed while chosen, so they can still be unticked.
  const options = locations.filter((l) => l.is_active || selectedIds.includes(l.id));
  const exact = locations.find((l) => l.name.trim().toLowerCase() === query.toLowerCase());
  const canCreate = query.length > 0 && !exact && !options.some((l) => contains(l.name, query));
  const selected = selectedIds
    .map((id) => locations.find((l) => l.id === id))
    .filter((l): l is VillageOption => Boolean(l));

  async function create() {
    if (!canCreate || isCreating) return;
    setIsCreating(true);
    setError(null);
    const result = await findOrCreateVillage(query);
    setIsCreating(false);
    if (result.error || !result.village) {
      setError(result.error ?? "Could not add the location.");
      return;
    }
    onCreated(result.village);
    if (!selectedIds.includes(result.village.id)) onChange([...selectedIds, result.village.id]);
    setInput("");
  }

  return (
    <div className="flex flex-col gap-3">
      <Autocomplete
        allowsEmptyCollection
        fullWidth
        placeholder="Choose locations"
        selectionMode="multiple"
        value={selectedIds}
        onChange={(keys) => {
          onChange(((keys as Key[] | null) ?? []).map(String));
          setError(null);
        }}
      >
        <Label>Locations</Label>
        <Autocomplete.Trigger>
          <Autocomplete.Value>
            {({ defaultChildren, isPlaceholder }) =>
              isPlaceholder || selected.length === 0 ? (
                defaultChildren
              ) : (
                <TagGroup
                  aria-label="Chosen locations"
                  size="sm"
                  onRemove={(keys) => onChange(selectedIds.filter((id) => !keys.has(id)))}
                >
                  <TagGroup.List>
                    {selected.map((location) => (
                      <Tag key={location.id} id={location.id} textValue={location.name}>
                        {location.name}
                        {!location.is_active ? " (inactive)" : ""}
                      </Tag>
                    ))}
                  </TagGroup.List>
                </TagGroup>
              )
            }
          </Autocomplete.Value>
          <Autocomplete.ClearButton />
          <Autocomplete.Indicator />
        </Autocomplete.Trigger>
        <Autocomplete.Popover>
          <Autocomplete.Filter
            filter={contains}
            inputValue={input}
            onInputChange={(value) => {
              setInput(value);
              setError(null);
            }}
          >
            <SearchField autoFocus aria-label="Search locations" name="location-search" variant="secondary">
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input
                  placeholder="Search, or type a new location and press Enter"
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || !canCreate) return;
                    e.preventDefault();
                    void create();
                  }}
                />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <ListBox
              renderEmptyState={() => (
                <EmptyState>
                  {canCreate ? `No match. Press Enter to add “${query}” as a new location.` : "No matching location."}
                </EmptyState>
              )}
            >
              {options.map((location) => (
                <ListBox.Item key={location.id} id={location.id} textValue={location.name}>
                  {location.name}
                  {!location.is_active ? <span className="text-muted"> (inactive)</span> : null}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Autocomplete.Filter>
        </Autocomplete.Popover>
      </Autocomplete>

      {canCreate ? (
        <Button className="self-start" isPending={isCreating} size="sm" variant="secondary" onPress={create}>
          Add “{query}” as a new location
        </Button>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

type SaleDraft = { key: string; invoiceId: string; amount: string };

/** The invoices for one sales channel (JR sales or JR Farms) attributed to the visit. */
function SalesEditor({
  label,
  rows,
  onChange,
}: {
  label: string;
  rows: SaleDraft[];
  onChange: (rows: SaleDraft[]) => void;
}) {
  const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  function update(key: string, changes: Partial<SaleDraft>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {rows.length > 0 ? <span className="text-xs text-muted">Total {formatInr(total)}</span> : null}
      </div>
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[1fr_9rem_auto] items-end gap-2">
          <TextField aria-label={`${label} invoice ID`} value={row.invoiceId} onChange={(v) => update(row.key, { invoiceId: v })}>
            <Input placeholder="Invoice ID" />
          </TextField>
          <TextField aria-label={`${label} amount`} value={row.amount} onChange={(v) => update(row.key, { amount: v })}>
            <Input min={0} placeholder="Amount (₹)" step="0.01" type="number" />
          </TextField>
          <Button
            isIconOnly
            aria-label="Remove invoice"
            type="button"
            variant="ghost"
            onPress={() => onChange(rows.filter((r) => r.key !== row.key))}
          >
            <TrashBin className="size-4 text-danger" />
          </Button>
        </div>
      ))}
      <Button
        className="self-start"
        size="sm"
        type="button"
        variant="secondary"
        onPress={() => onChange([...rows, { key: crypto.randomUUID(), invoiceId: "", amount: "" }])}
      >
        <Plus className="size-4" />
        Add invoice
      </Button>
    </div>
  );
}

function VisitForm({
  visit,
  defaultDate,
  reference,
  onSaved,
  onCancelled,
}: {
  visit: VisitListItem | null;
  defaultDate: string;
  reference: VisitReference;
  onSaved: (created?: VisitListItem) => void;
  onCancelled: () => void;
}) {
  const isEditing = visit !== null;
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
  const initialPocPhone = splitPhone(visit?.primaryGuest?.phone);
  const [pocName, setPocName] = useState(visit?.primaryGuest?.name ?? "");
  const [pocPhoneCode, setPocPhoneCode] = useState(initialPocPhone.code);
  const [pocPhoneNumber, setPocPhoneNumber] = useState(initialPocPhone.number);
  const [pocEmail, setPocEmail] = useState(visit?.primaryGuest?.email ?? "");
  const [facilitatorId, setFacilitatorId] = useState(visit?.facilitator_id ?? "");
  const [partnerId, setPartnerId] = useState(visit?.partner_id ?? "");
  const [headcount, setHeadcount] = useState(numberToText(visit?.headcount ?? null));
  const [originPlace, setOriginPlace] = useState(visit?.origin_place ?? "");
  const [villageIds, setVillageIds] = useState<string[]>(visit?.villageIds ?? []);
  const [experienceIds, setExperienceIds] = useState<string[]>(visit?.experienceIds ?? []);
  const [source, setSource] = useState(visit?.source ?? "");
  const [amountCharged, setAmountCharged] = useState(numberToText(visit?.amount_charged ?? null));
  const [invoiceId, setInvoiceId] = useState(visit?.invoice_id ?? "");
  const [sales, setSales] = useState<Record<string, SaleDraft[]>>(() =>
    Object.fromEntries(
      SALE_CHANNELS.map((channel) => [
        channel.id,
        (visit?.sales ?? [])
          .filter((sale) => sale.channel === channel.id)
          .map((sale) => ({ key: sale.id, invoiceId: sale.invoice_id, amount: numberToText(sale.amount) })),
      ]),
    ),
  );
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
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

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
  // Active facilitators, plus the one already on this visit even if they have since been deactivated.
  const facilitatorOptions = reference.facilitators
    .filter((f) => f.is_active || f.id === facilitatorId)
    .map((f) => ({ id: f.id, label: f.is_active ? f.name : `${f.name} (inactive)` }));
  const selectedFacilitator = reference.facilitators.find((f) => f.id === facilitatorId);
  // Visits from before facilitators existed carry a hand-typed name and phone.
  const legacyCoordinator = !visit?.facilitator_id && visit?.poc_name ? visit : null;
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
    return {
      programCategory: programCategory as VisitInput["programCategory"],
      visitDate: dates?.start.toString() ?? "",
      endDate: dates?.end.toString() ?? "",
      startTime: fromTime(startTime),
      endTime: fromTime(endTime),
      status: status as VisitInput["status"],
      facilitatorId,
      pocGuestName: pocName,
      pocGuestPhone: joinPhone(pocPhoneCode, pocPhoneNumber),
      pocGuestEmail: pocEmail,
      partnerId,
      headcount,
      source,
      originPlace,
      visitorCategory: visitorCategory as VisitInput["visitorCategory"],
      bookingChannel,
      amountCharged,
      invoiceId,
      amountToArtisans,
      notes,
      feedbackFormId,
      villageIds,
      experienceIds,
      // A row left completely empty is ignored; a half-filled one is reported by the schema.
      sales: SALE_CHANNELS.flatMap((channel) =>
        (sales[channel.id] ?? [])
          .filter((row) => row.invoiceId.trim() !== "" || row.amount.trim() !== "")
          .map((row) => ({ channel: channel.id, invoiceId: row.invoiceId, amount: row.amount })),
      ),
    };
  }

  /** The first problem on the given steps, with the step it belongs to. */
  function findProblem(steps: number[]): { step: number; message: string } | null {
    const pocNumber = pocPhoneNumber.trim();
    if (steps.includes(0) && pocNumber && !/^[\d\s-]{6,20}$/.test(pocNumber)) {
      return { step: 0, message: "Enter the primary POC's phone number using digits only." };
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

  /** Marks the visit cancelled. Whatever is typed in the form but not saved is dropped with it. */
  async function handleCancelVisit() {
    if (!visit) return;
    setIsCancelling(true);
    const result = await setVisitStatus(visit.id, "cancelled");
    setIsCancelling(false);
    setIsConfirmingCancel(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onCancelled();
  }

  return (
    <>
      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <StepIndicator canOpen={(index) => index <= reached} step={step} onOpen={goTo} />

        {step === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
              <OptionSelect
                isRequired
                label="Program"
                options={PROGRAM_CATEGORIES}
                value={programCategory}
                onChange={setProgramCategory}
              />
              <OptionSelect isRequired label="Status" options={VISIT_STATUSES} value={status} onChange={setStatus} />
              <TextField value={headcount} onChange={setHeadcount}>
                <Label>Headcount</Label>
                <Input min={0} placeholder="e.g. 12" type="number" />
              </TextField>
            </div>

            <div className="grid gap-4 rounded-xl border border-border p-3 sm:col-span-2 sm:grid-cols-2">
              <DateRangePicker
                isRequired
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

              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Time (IST)</span>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <TimeField aria-label="Start time" hourCycle={12} value={startTime} onChange={setStartTime}>
                    <TimeField.Group fullWidth>
                      <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
                    </TimeField.Group>
                  </TimeField>
                  <span className="text-sm text-muted">to</span>
                  <TimeField aria-label="End time" hourCycle={12} value={endTime} onChange={setEndTime}>
                    <TimeField.Group fullWidth>
                      <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
                    </TimeField.Group>
                  </TimeField>
                </div>
              </div>
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
              isRequired={isRuralExperience}
              label="Booking channel"
              noneLabel="Not set"
              options={BOOKING_CHANNELS}
              value={bookingChannel}
              onChange={setBookingChannel}
            />

            <div className="flex flex-col gap-1">
              <OptionSelect
                label="Facilitator"
                noneLabel="Not assigned"
                options={facilitatorOptions}
                value={facilitatorId}
                onChange={setFacilitatorId}
              />
              {selectedFacilitator ? (
                <p className="text-xs text-muted">{formatPhone(selectedFacilitator.phone)}</p>
              ) : legacyCoordinator ? (
                <p className="text-xs text-muted">
                  Previously entered: {legacyCoordinator.poc_name}
                  {legacyCoordinator.poc_phone ? ` · ${formatPhone(legacyCoordinator.poc_phone)}` : ""}. Pick a
                  facilitator to replace it.
                </p>
              ) : reference.facilitators.length === 0 ? (
                <p className="text-xs text-muted">Add facilitators on the Facilitators page first.</p>
              ) : null}
            </div>

            <OptionSelect
              label="Partner (optional)"
              noneLabel="No partner"
              options={partnerOptions}
              value={partnerId}
              onChange={setPartnerId}
            />

            <div className="grid gap-4 rounded-xl border border-border p-3 sm:col-span-2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="text-sm font-medium">Primary POC</p>
                <p className="text-xs text-muted">
                  The visit&apos;s point of contact. They are saved in Leads (matched by phone number) and added as
                  the primary guest — the person who receives messages meant for the POC, like the referral
                  request.
                </p>
              </div>
              <TextField value={pocName} onChange={setPocName}>
                <Label>Name</Label>
                <Input placeholder="e.g. Priya Sharma" />
              </TextField>
              <PhoneField
                code={pocPhoneCode}
                label="Phone"
                number={pocPhoneNumber}
                onCodeChange={setPocPhoneCode}
                onNumberChange={setPocPhoneNumber}
              />
              <TextField className="sm:col-span-2" type="email" value={pocEmail} onChange={setPocEmail}>
                <Label>Email (optional)</Label>
                <Input placeholder="name@example.com" />
              </TextField>
            </div>

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
              <Label>Rural Experience revenue (₹)</Label>
              <Input min={0} placeholder="e.g. 15000" step="0.01" type="number" />
            </TextField>
            <TextField value={invoiceId} onChange={setInvoiceId}>
              <Label>Rural Experience invoice ID</Label>
              <Input placeholder="e.g. INV-2026-0142" />
            </TextField>
            <TextField value={amountToArtisans} onChange={setAmountToArtisans}>
              <Label>Amount to artisan families (₹)</Label>
              <Input min={0} placeholder="e.g. 9000" step="0.01" type="number" />
            </TextField>
            <p className="self-end pb-2 text-xs text-muted sm:col-span-1">
              Sales that came from this visit are tracked separately below, by invoice.
            </p>
            {SALE_CHANNELS.map((channel) => (
              <SalesEditor
                key={channel.id}
                label={`${channel.label} attributed to this visit`}
                rows={sales[channel.id] ?? []}
                onChange={(rows) => setSales((prev) => ({ ...prev, [channel.id]: rows }))}
              />
            ))}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-4">
            <OptionSelect
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
            {isEditing && visit.status !== "cancelled" ? (
              <Button type="button" variant="danger-soft" onPress={() => setIsConfirmingCancel(true)}>
                Cancel visit
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

      <AlertDialog isOpen={isConfirmingCancel} onOpenChange={setIsConfirmingCancel}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[420px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>Cancel this visit?</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  The visit is marked cancelled and any WhatsApp messages still scheduled for it are stopped.{" "}
                  <strong>Changes you have made in this form but not saved will be discarded.</strong> The visit
                  and its guest list stay on record.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  Keep visit
                </Button>
                <Button isPending={isCancelling} variant="danger" onPress={handleCancelVisit}>
                  Cancel visit
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
              onCancelled={() => {
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
