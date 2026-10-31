"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, DateField, DateRangePicker, Label, RangeCalendar } from "@heroui/react";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { BOOKING_CHANNELS, PROGRAM_CATEGORIES, VISITOR_CATEGORIES } from "@/lib/visits/constants";
import {
  ALL_PROGRAMS,
  DASHBOARD_RANGES,
  DEFAULT_DASHBOARD_PROGRAM,
  type DashboardFilters as Filters,
} from "@/lib/visits/dashboard";
import { ALL, FilterSelect } from "../visits/filter-select";

type DateRange = { start: CalendarDate; end: CalendarDate };

/** Period and filters for the dashboard. Everything lives in the URL, so the server renders the numbers. */
export function DashboardFilters({ filters, villages }: { filters: Filters; villages: { id: string; name: string }[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Rebuilt from the resolved filters (not the raw URL), so an invalid value never sticks around.
  const current: Record<string, string | null> = {
    range: filters.rangeId === "custom" ? null : filters.rangeId,
    from: filters.rangeId === "custom" ? filters.from : null,
    to: filters.rangeId === "custom" ? filters.to : null,
    program: filters.program === DEFAULT_DASHBOARD_PROGRAM ? null : filters.program,
    category: filters.visitorCategory,
    channel: filters.bookingChannel,
    village: filters.villageId,
  };

  function navigate(changes: Record<string, string | null>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...current, ...changes })) {
      if (value !== null) params.set(key, value);
    }
    const query = params.toString();
    startTransition(() => router.push(query ? `/dashboard?${query}` : "/dashboard", { scroll: false }));
  }

  const filtersActive =
    filters.program !== DEFAULT_DASHBOARD_PROGRAM ||
    filters.visitorCategory !== null ||
    filters.bookingChannel !== null ||
    filters.villageId !== null;

  return (
    <div
      aria-busy={isPending}
      className={`flex flex-col gap-4 rounded-2xl border border-border/70 bg-white p-4 transition-opacity ${
        isPending ? "opacity-70" : ""
      }`}
    >
      <div className="flex flex-wrap items-end gap-3">
        <nav aria-label="Period" className="flex gap-1 rounded-xl bg-neutral-100 p-1">
          {DASHBOARD_RANGES.map((range) => (
            <button
              key={range.id}
              aria-current={range.id === filters.rangeId ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                range.id === filters.rangeId ? "bg-white font-medium shadow-sm" : "text-muted hover:text-foreground"
              }`}
              type="button"
              onClick={() => navigate({ range: range.id, from: null, to: null })}
            >
              {range.id.replace("m", " mo")}
            </button>
          ))}
        </nav>

        <DateRangePicker
          className="w-64"
          value={{ start: parseDate(filters.from), end: parseDate(filters.to) }}
          onChange={(next) => {
            const value = next as DateRange | null;
            if (value) navigate({ range: null, from: value.start.toString(), to: value.end.toString() });
          }}
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
            <RangeCalendar aria-label="Dashboard dates">
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
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          allLabel="All programs"
          label="Program"
          options={PROGRAM_CATEGORIES}
          value={filters.program === ALL_PROGRAMS ? ALL : filters.program}
          onChange={(value) => {
            const program = value === ALL ? ALL_PROGRAMS : value;
            navigate({ program: program === DEFAULT_DASHBOARD_PROGRAM ? null : program });
          }}
        />
        <FilterSelect
          allLabel="All categories"
          label="Visitor category"
          options={VISITOR_CATEGORIES}
          value={filters.visitorCategory ?? ALL}
          onChange={(value) => navigate({ category: value === ALL ? null : value })}
        />
        <FilterSelect
          allLabel="All channels"
          label="Booking channel"
          options={BOOKING_CHANNELS}
          value={filters.bookingChannel ?? ALL}
          onChange={(value) => navigate({ channel: value === ALL ? null : value })}
        />
        <FilterSelect
          allLabel="All locations"
          label="Location"
          options={villages.map((v) => ({ id: v.id, label: v.name }))}
          value={filters.villageId ?? ALL}
          onChange={(value) => navigate({ village: value === ALL ? null : value })}
        />
        {filtersActive ? (
          <Button
            variant="ghost"
            onPress={() => navigate({ program: null, category: null, channel: null, village: null })}
          >
            Reset filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
