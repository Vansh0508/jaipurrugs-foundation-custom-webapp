"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Envelope, Pencil, Persons, Plus } from "@gravity-ui/icons";
import { Button, Chip, Label, ListBox, SearchField, Select, Table, Tabs, toast } from "@heroui/react";
import { setVisitStatus } from "@/lib/actions/visits";
import { VISIT_STATUSES, bookingChannelLabel } from "@/lib/visits/constants";
import { formatDate, formatTimeRange, shortMonthLabel } from "@/lib/visits/time";
import type { VisitListItem, VisitReference } from "@/lib/visits/types";
import { VisitMessagingModal, useVisitMessaging } from "../messaging/visit-messaging-modal";
import { StatCard } from "./stat-card";
import { VisitFormModal } from "./visit-form-modal";
import { VisitGuestsModal, useVisitGuests } from "./visit-guests-modal";
import { VisitStatusChip } from "./visit-status-chip";

const ALL = "__all";
const UNDATED = "undated";

function monthOf(visit: VisitListItem) {
  return visit.visit_date ? visit.visit_date.slice(0, 7) : UNDATED;
}

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
  options: { id: string; label: string }[];
}) {
  return (
    <Select className="w-48" value={value} onChange={(key) => onChange(String(key ?? ALL))}>
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

export function TripsView({
  visits,
  reference,
  today,
}: {
  visits: VisitListItem[];
  reference: VisitReference;
  today: string;
}) {
  const router = useRouter();
  const [month, setMonth] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(ALL);
  const [visitType, setVisitType] = useState(ALL);
  const [villageId, setVillageId] = useState(ALL);

  const [editing, setEditing] = useState<VisitListItem | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const guestsModal = useVisitGuests();
  const messaging = useVisitMessaging();

  const villageName = useMemo(() => new Map(reference.villages.map((v) => [v.id, v.name])), [reference.villages]);

  const months = useMemo(() => {
    const set = new Set(visits.map(monthOf));
    const dated = [...set].filter((m) => m !== UNDATED).sort().reverse();
    return set.has(UNDATED) ? [...dated, UNDATED] : dated;
  }, [visits]);

  const visitTypes = useMemo(
    () => [...new Set(visits.map((v) => v.visit_type))].sort().map((t) => ({ id: t, label: t })),
    [visits],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visits.filter((v) => {
      if (month !== ALL && monthOf(v) !== month) return false;
      if (status !== ALL && v.status !== status) return false;
      if (visitType !== ALL && v.visit_type !== visitType) return false;
      if (villageId !== ALL && !v.villageIds.includes(villageId)) return false;
      if (!q) return true;
      return [v.visit_type, v.poc_name ?? "", v.facilitator ?? "", v.visitor_group ?? "", v.source ?? "", v.origin_place ?? "", v.notes ?? ""].some(
        (s) => s.toLowerCase().includes(q),
      );
    });
  }, [visits, month, status, visitType, villageId, query]);

  const stats = useMemo(() => {
    const live = filtered.filter((v) => v.status !== "cancelled");
    return {
      visits: filtered.length,
      guests: live.reduce((sum, v) => sum + (v.headcount ?? 0), 0),
      upcoming: filtered.filter((v) => v.visit_date && v.visit_date >= today && !["cancelled", "completed"].includes(v.status)).length,
      completed: filtered.filter((v) => v.status === "completed").length,
      cancelled: filtered.filter((v) => v.status === "cancelled").length,
    };
  }, [filtered, today]);

  function openForm(visit: VisitListItem | null) {
    setEditing(visit);
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

  const filtersActive = month !== ALL || status !== ALL || visitType !== ALL || villageId !== ALL || query !== "";

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Visits" value={stats.visits} hint={filtersActive ? "matching filters" : "all time"} />
        <StatCard label="Guests (headcount)" value={stats.guests} hint="excl. cancelled" />
        <StatCard label="Upcoming" value={stats.upcoming} hint="not completed or cancelled" />
        <StatCard label="Completed" value={stats.completed} hint={`${stats.cancelled} cancelled`} />
      </div>

      {months.length > 0 ? (
        <Tabs selectedKey={month} onSelectionChange={(key) => setMonth(String(key))}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Month">
              <Tabs.Tab id={ALL}>
                All
                <Tabs.Indicator />
              </Tabs.Tab>
              {months.map((m) => (
                <Tabs.Tab key={m} id={m}>
                  {m === UNDATED ? "Undated" : shortMonthLabel(m)}
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <SearchField aria-label="Search visits" className="w-64" value={query} onChange={setQuery}>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Coordinator, group, place…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <FilterSelect
            allLabel="All statuses"
            label="Status"
            options={VISIT_STATUSES.map((s) => ({ id: s.id, label: s.label }))}
            value={status}
            onChange={setStatus}
          />
          <FilterSelect allLabel="All types" label="Visit type" options={visitTypes} value={visitType} onChange={setVisitType} />
          <FilterSelect
            allLabel="All villages"
            label="Village"
            options={reference.villages.map((v) => ({ id: v.id, label: v.name }))}
            value={villageId}
            onChange={setVillageId}
          />
        </div>
        <Button onPress={() => openForm(null)}>
          <Plus className="size-4" />
          Add visit
        </Button>
      </div>

      {visits.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border p-16 text-center">
          <p className="text-sm font-medium">No visits yet</p>
          <p className="max-w-md text-sm text-muted">
            Add a visit, attach its villages and guests, and the WhatsApp agent can answer guests&apos; questions
            about it and send the after-visit messages.
          </p>
        </div>
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
                <Table.Column className="w-44 text-right">
                  <span className="sr-only">Actions</span>
                </Table.Column>
              </Table.Header>
              <Table.Body>
                {filtered.map((visit) => (
                  <Table.Row key={visit.id}>
                    <Table.Cell className="whitespace-nowrap font-medium">
                      {formatDate(visit.visit_date)}
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
                        {visit.visitor_group ?? <span className="text-muted">—</span>}
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

      {filtered.length === 0 && visits.length > 0 ? (
        <p className="text-center text-sm text-muted">No visits match these filters.</p>
      ) : null}

      <VisitFormModal
        defaultDate={today}
        isOpen={isFormOpen}
        reference={reference}
        visit={editing}
        onOpenChange={setIsFormOpen}
        onSaved={() => {
          setIsFormOpen(false);
          router.refresh();
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
        reload={guestsModal.reload}
        visit={guestsModal.visit}
        onOpenChange={guestsModal.setIsOpen}
      />
    </div>
  );
}
