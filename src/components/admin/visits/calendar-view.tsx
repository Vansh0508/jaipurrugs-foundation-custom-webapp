"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { VISIT_STATUSES, visitorCategoryLabel } from "@/lib/visits/constants";
import { daysBetween, formatLongDate, formatTimeRange, monthGrid, monthLabel, shiftMonth } from "@/lib/visits/time";
import type { VisitListItem, VisitReference } from "@/lib/visits/types";
import { VisitStatusChip } from "./visit-status-chip";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PILLS_PER_DAY = 3;

// Full class strings so Tailwind can see them.
const STATUS_PILL: Record<string, string> = {
  tentative: "bg-warning/15 text-warning-foreground",
  confirmed: "bg-accent/15 text-accent",
  booking_done: "bg-accent/25 text-accent",
  completed: "bg-success/15 text-success",
  cancelled: "bg-danger/10 text-danger line-through",
};

const STATUS_DOT: Record<string, string> = {
  tentative: "bg-warning",
  confirmed: "bg-accent/60",
  booking_done: "bg-accent",
  completed: "bg-success",
  cancelled: "bg-danger",
};

function pillTitle(visit: VisitListItem, villageName: Map<string, string>) {
  return [
    visit.visit_type,
    formatTimeRange(visit.start_time, visit.end_time),
    visit.visitor_category ? visitorCategoryLabel(visit.visitor_category) : null,
    visit.headcount !== null ? `${visit.headcount} people` : null,
    visit.villageIds.map((id) => villageName.get(id)).filter(Boolean).join(", ") || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Month grid of visits in every status. Clicking a visit opens it; clicking a day
 * lists everything on that day underneath.
 */
export function VisitsCalendar({
  month,
  onMonthChange,
  visits,
  reference,
  today,
  onOpenVisit,
  onAddVisit,
}: {
  month: string;
  onMonthChange: (month: string) => void;
  visits: VisitListItem[];
  reference: VisitReference;
  today: string;
  onOpenVisit: (visit: VisitListItem) => void;
  onAddVisit: (date: string) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const { days } = useMemo(() => monthGrid(month), [month]);
  const villageName = useMemo(() => new Map(reference.villages.map((v) => [v.id, v.name])), [reference.villages]);

  const byDay = useMemo(() => {
    const map = new Map<string, VisitListItem[]>();
    for (const visit of visits) {
      if (!visit.visit_date) continue;
      // A multi-day visit shows on every day it covers.
      for (const day of daysBetween(visit.visit_date, visit.end_date)) {
        map.set(day, [...(map.get(day) ?? []), visit]);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
    }
    return map;
  }, [visits]);

  const selectedVisits = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  const currentMonth = today.slice(0, 7);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button isIconOnly aria-label="Previous month" variant="tertiary" onPress={() => onMonthChange(shiftMonth(month, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="w-44 text-center text-lg font-semibold">{monthLabel(month)}</h2>
          <Button isIconOnly aria-label="Next month" variant="tertiary" onPress={() => onMonthChange(shiftMonth(month, 1))}>
            <ChevronRight className="size-4" />
          </Button>
          {month !== currentMonth ? (
            <Button size="sm" variant="ghost" onPress={() => onMonthChange(currentMonth)}>
              Today
            </Button>
          ) : null}
        </div>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {VISIT_STATUSES.map((status) => (
            <li key={status.id} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${STATUS_DOT[status.id]}`} />
              {status.label}
            </li>
          ))}
        </ul>
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
              <div
                key={day}
                className={`flex min-h-28 min-w-0 cursor-pointer flex-col gap-1 border-b border-r border-border/60 p-1.5 transition-colors hover:bg-neutral-50 ${
                  inMonth ? "bg-white" : "bg-neutral-50/70"
                } ${isSelected ? "ring-2 ring-inset ring-accent" : ""}`}
                onClick={() => setSelectedDay(isSelected ? null : day)}
              >
                <button
                  aria-label={`${formatLongDate(day)}${dayVisits.length ? `, ${dayVisits.length} visit${dayVisits.length === 1 ? "" : "s"}` : ""}`}
                  className={`inline-flex size-6 items-center justify-center rounded-full text-xs ${
                    isToday ? "bg-accent font-semibold text-accent-foreground" : inMonth ? "text-foreground" : "text-muted/60"
                  }`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDay(isSelected ? null : day);
                  }}
                >
                  {Number(day.slice(8))}
                </button>
                {dayVisits.slice(0, PILLS_PER_DAY).map((visit) => {
                  const isContinuation = visit.visit_date !== day;
                  return (
                    <button
                      key={visit.id}
                      className={`w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium hover:brightness-95 ${STATUS_PILL[visit.status] ?? ""}`}
                      title={pillTitle(visit, villageName)}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenVisit(visit);
                      }}
                    >
                      {isContinuation ? "↳ " : visit.start_time ? `${visit.start_time.slice(0, 5)} ` : ""}
                      {visit.visit_type}
                      {visit.headcount !== null ? ` · ${visit.headcount}` : ""}
                    </button>
                  );
                })}
                {dayVisits.length > PILLS_PER_DAY ? (
                  <span className="px-1 text-[11px] text-muted">+{dayVisits.length - PILLS_PER_DAY} more</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {selectedDay ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{formatLongDate(selectedDay)}</h3>
            <Button size="sm" variant="secondary" onPress={() => onAddVisit(selectedDay)}>
              <Plus className="size-4" />
              Add visit on this day
            </Button>
          </div>
          {selectedVisits.length === 0 ? (
            <p className="text-sm text-muted">Nothing scheduled.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/70">
              {selectedVisits.map((visit) => (
                <li key={visit.id}>
                  <button
                    className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-neutral-50"
                    type="button"
                    onClick={() => onOpenVisit(visit)}
                  >
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
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">Click a visit to see its details, or a day to list everything on it.</p>
      )}
    </div>
  );
}
