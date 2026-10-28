"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Check, Envelope, Eye, LayoutCells, Pencil, Persons, Plus, Xmark } from "@gravity-ui/icons";
import {
  Button,
  Chip,
  DateField,
  DateRangePicker,
  Label,
  ListBox,
  RangeCalendar,
  SearchField,
  Select,
  Table,
  Tabs,
  toast,
} from "@heroui/react";
import type { CalendarDate } from "@internationalized/date";
import { setVisitStatus } from "@/lib/actions/visits";
import { PROGRAM_CATEGORIES, VISIT_STATUSES, bookingChannelLabel, visitorCategoryLabel } from "@/lib/visits/constants";
import { formatDateRange, formatTimeRange } from "@/lib/visits/time";
import type { VisitListItem, VisitReference } from "@/lib/visits/types";
import { VisitMessagingModal, useVisitMessaging } from "../messaging/visit-messaging-modal";
import { VisitsCalendar } from "./calendar-view";
import { VisitDetailDrawer } from "./visit-detail-drawer";
import { VisitFormModal } from "./visit-form-modal";
import { VisitGuestsModal, useVisitGuests } from "./visit-guests-modal";
import { VisitStatusChip } from "./visit-status-chip";

export type TripsViewMode = "calendar" | "grid";

const ALL = "__all";

type DateRange = { start: CalendarDate; end: CalendarDate };

function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: readonly { id: string; label: string }[];
}) {
  return (
    <Select className="w-44" value={value} onChange={(key) => onChange(String(key ?? ALL))}>
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id={ALL} textValue={allLabel}>
            {allLabel}
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {options.map((o) => (
            <ListBox.Item key={o.id} id={o.id} textValue={o.label}>
              {o.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function DateRangeFilter({ value, onChange }: { value: DateRange | null; onChange: (value: DateRange | null) => void }) {
  return (
    <div className="flex items-end gap-1">
      <DateRangePicker className="w-64" value={value} onChange={(next) => onChange(next as DateRange | null)}>
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
          <RangeCalendar aria-label="Filter by dates">
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
      {value ? (
        <Button isIconOnly aria-label="Clear dates" variant="ghost" onPress={() => onChange(null)}>
          <Xmark className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

/** Trips and calendar in one place: shared filters, two ways to look at the result. */
export function TripsView({
  visits,
  reference,
  today,
  initialView,
  initialMonth,
  initialVisitId,
}: {
  visits: VisitListItem[];
  reference: VisitReference;
  today: string;
  initialView: TripsViewMode;
  initialMonth: string;
  /** Opens this visit's details on load (links from elsewhere, e.g. the inbox). */
  initialVisitId: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<TripsViewMode>(initialView);
  const [month, setMonth] = useState(initialMonth);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(ALL);
  const [program, setProgram] = useState(ALL);
  const [villageId, setVillageId] = useState(ALL);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);

  const [detailId, setDetailId] = useState<string | null>(initialVisitId);
  const [isDetailOpen, setIsDetailOpen] = useState(initialVisitId !== null);
  const [editing, setEditing] = useState<VisitListItem | null>(null);
  const [formDate, setFormDate] = useState(today);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const guestsModal = useVisitGuests();
  const messaging = useVisitMessaging();

  // Looked up from the latest data so the drawer reflects edits after a refresh.
  const detailVisit = visits.find((v) => v.id === detailId) ?? null;
  const villageName = useMemo(() => new Map(reference.villages.map((v) => [v.id, v.name])), [reference.villages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = dateRange?.start.toString();
    const to = dateRange?.end.toString();
    return visits.filter((v) => {
      if (status !== ALL && v.status !== status) return false;
      if (program !== ALL && v.program_category !== program) return false;
      if (villageId !== ALL && !v.villageIds.includes(villageId)) return false;
      if (from && to) {
        // Keep visits that overlap the chosen range.
        if (!v.visit_date) return false;
        if (v.visit_date > to || (v.end_date ?? v.visit_date) < from) return false;
      }
      if (!q) return true;
      return [
        v.visit_type,
        v.poc_name ?? "",
        v.poc_phone ?? "",
        v.facilitator ?? "",
        v.visitor_category ? visitorCategoryLabel(v.visitor_category) : "",
        v.visitor_group ?? "",
        v.source ?? "",
        v.origin_place ?? "",
        v.notes ?? "",
        ...v.villageIds.map((id) => villageName.get(id) ?? ""),
      ].some((s) => s.toLowerCase().includes(q));
    });
  }, [visits, status, program, villageId, dateRange, query, villageName]);

  const filtersActive = query !== "" || status !== ALL || program !== ALL || villageId !== ALL || dateRange !== null;

  function changeView(next: TripsViewMode) {
    setView(next);
    // Keep the view in the URL so a reload or shared link lands on the same one.
    window.history.replaceState(null, "", `/trips?view=${next}`);
  }

  function changeDateRange(next: DateRange | null) {
    setDateRange(next);
    if (next) setMonth(next.start.toString().slice(0, 7));
  }

  function clearFilters() {
    setQuery("");
    setStatus(ALL);
    setProgram(ALL);
    setVillageId(ALL);
    setDateRange(null);
  }

  function openDetail(visit: VisitListItem) {
    setDetailId(visit.id);
    setIsDetailOpen(true);
  }

  function openForm(visit: VisitListItem | null, date = today) {
    setIsDetailOpen(false);
    setEditing(visit);
    setFormDate(date);
    setIsFormOpen(true);
  }

  async function handleComplete(visit: VisitListItem) {
    const result = await setVisitStatus(visit.id, "completed");
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    toast.success("Visit marked completed");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs selectedKey={view} onSelectionChange={(key) => changeView(key as TripsViewMode)}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="View">
              <Tabs.Tab id="grid">
                <LayoutCells className="size-4" />
                Grid
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="calendar">
                <Calendar className="size-4" />
                Calendar
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        <Button onPress={() => openForm(null)}>
          <Plus className="size-4" />
          Add visit
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/70 bg-white p-4">
        <SearchField className="w-full sm:w-64" value={query} onChange={setQuery}>
          <Label>Search</Label>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Coordinator, place, village…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <FilterSelect
          allLabel="All statuses"
          label="Status"
          options={VISIT_STATUSES}
          value={status}
          onChange={setStatus}
        />
        <FilterSelect allLabel="All types" label="Visit type" options={PROGRAM_CATEGORIES} value={program} onChange={setProgram} />
        <FilterSelect
          allLabel="All villages"
          label="Village"
          options={reference.villages.map((v) => ({ id: v.id, label: v.name }))}
          value={villageId}
          onChange={setVillageId}
        />
        <DateRangeFilter value={dateRange} onChange={changeDateRange} />
        {filtersActive ? (
          <Button variant="ghost" onPress={clearFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>

      {filtersActive ? (
        <p className="-mt-2 text-sm text-muted">
          {filtered.length} of {visits.length} visit{visits.length === 1 ? "" : "s"} match these filters.
        </p>
      ) : null}

      {view === "calendar" ? (
        <VisitsCalendar
          month={month}
          reference={reference}
          today={today}
          visits={filtered}
          onAddVisit={(date) => openForm(null, date)}
          onMonthChange={setMonth}
          onOpenVisit={openDetail}
        />
      ) : visits.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border p-16 text-center">
          <p className="text-sm font-medium">No visits yet</p>
          <p className="max-w-md text-sm text-muted">
            Add a visit, attach its villages and guests, and the WhatsApp agent can answer guests&apos; questions
            about it and send the after-visit messages.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
          No visits match these filters.
        </p>
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Visits" className="w-full min-w-[980px]">
              <Table.Header>
                <Table.Column isRowHeader>Date</Table.Column>
                <Table.Column>Visit</Table.Column>
                <Table.Column>Coordinator</Table.Column>
                <Table.Column>Group</Table.Column>
                <Table.Column>Headcount</Table.Column>
                <Table.Column>Villages</Table.Column>
                <Table.Column>Guests</Table.Column>
                <Table.Column>Status</Table.Column>
                <Table.Column className="w-48 text-right">
                  <span className="sr-only">Actions</span>
                </Table.Column>
              </Table.Header>
              <Table.Body>
                {filtered.map((visit) => (
                  <Table.Row key={visit.id}>
                    <Table.Cell className="whitespace-nowrap font-medium">
                      {formatDateRange(visit.visit_date, visit.end_date)}
                      <span className="block text-xs font-normal text-muted">
                        {formatTimeRange(visit.start_time, visit.end_time)}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      {visit.visit_type}
                      {visit.booking_channel ? (
                        <span className="block text-xs text-muted">{bookingChannelLabel(visit.booking_channel)}</span>
                      ) : null}
                    </Table.Cell>
                    <Table.Cell>{visit.poc_name ?? <span className="text-muted">—</span>}</Table.Cell>
                    <Table.Cell>
                      <span className="block max-w-[200px] truncate">
                        {visit.visitor_category ? (
                          visitorCategoryLabel(visit.visitor_category)
                        ) : (
                          (visit.visitor_group ?? <span className="text-muted">—</span>)
                        )}
                      </span>
                      {visit.source ? (
                        <span className="block max-w-[200px] truncate text-xs text-muted">{visit.source}</span>
                      ) : null}
                    </Table.Cell>
                    <Table.Cell className="tabular-nums">{visit.headcount ?? <span className="text-muted">—</span>}</Table.Cell>
                    <Table.Cell>
                      <div className="flex max-w-[200px] flex-wrap gap-1">
                        {visit.villageIds.length === 0 ? (
                          <span className="text-muted">—</span>
                        ) : (
                          visit.villageIds.map((id) => (
                            <Chip key={id} size="sm" variant="soft">
                              {villageName.get(id) ?? "Unknown"}
                            </Chip>
                          ))
                        )}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Button size="sm" variant="secondary" onPress={() => guestsModal.open(visit)}>
                        <Persons className="size-4" />
                        {visit.guestCount}
                      </Button>
                    </Table.Cell>
                    <Table.Cell>
                      <VisitStatusChip status={visit.status} />
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Button isIconOnly aria-label="View details" size="sm" variant="ghost" onPress={() => openDetail(visit)}>
                        <Eye className="size-4" />
                      </Button>
                      <Button isIconOnly aria-label="Scheduled messages" size="sm" variant="ghost" onPress={() => messaging.open(visit)}>
                        <Envelope className="size-4" />
                      </Button>
                      {visit.status !== "completed" && visit.status !== "cancelled" ? (
                        <Button isIconOnly aria-label="Mark completed" size="sm" variant="ghost" onPress={() => handleComplete(visit)}>
                          <Check className="size-4" />
                        </Button>
                      ) : null}
                      <Button isIconOnly aria-label="Edit visit" size="sm" variant="ghost" onPress={() => openForm(visit)}>
                        <Pencil className="size-4" />
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}

      <VisitDetailDrawer
        isOpen={isDetailOpen}
        reference={reference}
        visit={detailVisit}
        onComplete={handleComplete}
        onEdit={(visit) => openForm(visit, visit.visit_date ?? today)}
        onGuests={(visit) => {
          setIsDetailOpen(false);
          guestsModal.open(visit);
        }}
        onMessages={(visit) => {
          setIsDetailOpen(false);
          messaging.open(visit);
        }}
        onOpenChange={(open) => {
          setIsDetailOpen(open);
          // Drop a ?visit= deep link once it has been looked at, so a reload doesn't reopen it.
          if (!open && window.location.search.includes("visit=")) {
            window.history.replaceState(null, "", `/trips?view=${view}`);
          }
        }}
      />
      <VisitFormModal
        defaultDate={formDate}
        isOpen={isFormOpen}
        reference={reference}
        visit={editing}
        onOpenChange={setIsFormOpen}
        onSaved={(created) => {
          setIsFormOpen(false);
          router.refresh();
          // A new visit goes straight on to its guest list.
          if (created) guestsModal.openForNewVisit(created);
        }}
      />
      <VisitMessagingModal
        data={messaging.data}
        isOpen={messaging.isOpen}
        reload={messaging.reload}
        templates={messaging.templates}
        visit={messaging.visit}
        onOpenChange={messaging.setIsOpen}
      />
      <VisitGuestsModal
        guests={guestsModal.guests}
        isOpen={guestsModal.isOpen}
        justCreated={guestsModal.justCreated}
        reload={guestsModal.reload}
        visit={guestsModal.visit}
        onOpenChange={guestsModal.setIsOpen}
      />
    </div>
  );
}
