"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Envelope, Pencil, Persons, Plus } from "@gravity-ui/icons";
import { Button, toast } from "@heroui/react";
import { setVisitStatus } from "@/lib/actions/visits";
import { monthGrid, monthLabel, shiftMonth, formatLongDate, formatTimeRange } from "@/lib/visits/time";
import type { VisitListItem, VisitReference } from "@/lib/visits/types";
import { VisitMessagingModal, useVisitMessaging } from "../messaging/visit-messaging-modal";
import { VisitFormModal } from "./visit-form-modal";
import { VisitGuestsModal, useVisitGuests } from "./visit-guests-modal";
import { VisitStatusChip } from "./visit-status-chip";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Full class strings so Tailwind can see them.
const STATUS_PILL: Record<string, string> = {
  tentative: "bg-warning/15 text-warning-foreground",
  confirmed: "bg-accent/15 text-accent",
  booking_done: "bg-accent/15 text-accent",
  completed: "bg-success/15 text-success",
  cancelled: "bg-danger/10 text-danger line-through",
};

export function CalendarView({
  month,
  visits,
  reference,
  today,
}: {
  month: string;
  visits: VisitListItem[];
  reference: VisitReference;
  today: string;
}) {
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<VisitListItem | null>(null);
  const [formDate, setFormDate] = useState(today);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const guestsModal = useVisitGuests();
  const messaging = useVisitMessaging();

  const { days } = useMemo(() => monthGrid(month), [month]);

  const byDay = useMemo(() => {
    const map = new Map<string, VisitListItem[]>();
    for (const visit of visits) {
      if (!visit.visit_date) continue;
      map.set(visit.visit_date, [...(map.get(visit.visit_date) ?? []), visit]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
    }
    return map;
  }, [visits]);

  const villageName = useMemo(() => new Map(reference.villages.map((v) => [v.id, v.name])), [reference.villages]);
  const selectedVisits = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  const currentMonth = today.slice(0, 7);

  function openForm(visit: VisitListItem | null, date: string) {
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
        <div className="flex items-center gap-2">
          <Link
            aria-label="Previous month"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border hover:bg-neutral-100"
            href={`/calendar?month=${shiftMonth(month, -1)}`}
          >
            <ChevronLeft className="size-4" />
          </Link>
          <h2 className="w-44 text-center text-lg font-semibold">{monthLabel(month)}</h2>
          <Link
            aria-label="Next month"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border hover:bg-neutral-100"
            href={`/calendar?month=${shiftMonth(month, 1)}`}
          >
            <ChevronRight className="size-4" />
          </Link>
          {month !== currentMonth ? (
            <Link className="rounded-lg px-3 py-2 text-sm text-accent hover:bg-accent/10" href="/calendar">
              Today
            </Link>
          ) : null}
        </div>
        <Button onPress={() => openForm(null, selectedDay ?? today)}>
          <Plus className="size-4" />
          Add visit
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="grid grid-cols-7 border-b border-border bg-neutral-50">
          {WEEKDAYS.map((day) => (
            <div key={day} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const inMonth = day.startsWith(month);
            const dayVisits = byDay.get(day) ?? [];
            const isToday = day === today;
            const isSelected = day === selectedDay;
            return (
              <button
                key={day}
                aria-label={`${formatLongDate(day)}${dayVisits.length ? `, ${dayVisits.length} visit${dayVisits.length === 1 ? "" : "s"}` : ""}`}
                className={`flex min-h-24 flex-col gap-1 border-b border-r border-border/60 p-1.5 text-left transition-colors hover:bg-neutral-50 ${
                  inMonth ? "bg-white" : "bg-neutral-50/70"
                } ${isSelected ? "ring-2 ring-inset ring-accent" : ""}`}
                type="button"
                onClick={() => setSelectedDay(isSelected ? null : day)}
              >
                <span
                  className={`inline-flex size-6 items-center justify-center rounded-full text-xs ${
                    isToday ? "bg-accent font-semibold text-accent-foreground" : inMonth ? "text-foreground" : "text-muted/60"
                  }`}
                >
                  {Number(day.slice(8))}
                </span>
                {dayVisits.slice(0, 3).map((visit) => (
                  <span key={visit.id} className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_PILL[visit.status] ?? ""}`}>
                    {visit.start_time ? `${visit.start_time.slice(0, 5)} ` : ""}
                    {visit.visit_type}
                  </span>
                ))}
                {dayVisits.length > 3 ? <span className="px-1 text-[11px] text-muted">+{dayVisits.length - 3} more</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{formatLongDate(selectedDay)}</h3>
            <Button size="sm" variant="secondary" onPress={() => openForm(null, selectedDay)}>
              <Plus className="size-4" />
              Add visit on this day
            </Button>
          </div>
          {selectedVisits.length === 0 ? (
            <p className="text-sm text-muted">Nothing scheduled.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/70">
              {selectedVisits.map((visit) => (
                <li key={visit.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {visit.visit_type}
                      <VisitStatusChip status={visit.status} />
                    </span>
                    <span className="text-xs text-muted">
                      {formatTimeRange(visit.start_time, visit.end_time)}
                      {visit.poc_name ? ` · ${visit.poc_name}` : ""}
                      {visit.headcount !== null ? ` · ${visit.headcount} people` : ""}
                      {visit.villageIds.length > 0
                        ? ` · ${visit.villageIds.map((id) => villageName.get(id) ?? "Unknown").join(", ")}`
                        : ""}
                    </span>
                  </div>
                  <Button size="sm" variant="secondary" onPress={() => guestsModal.open(visit)}>
                    <Persons className="size-4" />
                    {visit.guestCount}
                  </Button>
                  <Button isIconOnly aria-label="Scheduled messages" size="sm" variant="ghost" onPress={() => messaging.open(visit)}>
                    <Envelope className="size-4" />
                  </Button>
                  {visit.status !== "completed" && visit.status !== "cancelled" ? (
                    <Button isIconOnly aria-label="Mark completed" size="sm" variant="ghost" onPress={() => handleComplete(visit)}>
                      <Check className="size-4" />
                    </Button>
                  ) : null}
                  <Button isIconOnly aria-label="Edit visit" size="sm" variant="ghost" onPress={() => openForm(visit, visit.visit_date ?? today)}>
                    <Pencil className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">Click a day to see what&apos;s scheduled.</p>
      )}

      <VisitFormModal
        defaultDate={formDate}
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
