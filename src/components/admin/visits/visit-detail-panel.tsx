"use client";

import type { ReactNode } from "react";
import { ArrowsExpand, ChevronDown, Envelope, LayoutSideContentRight, Pencil, Persons } from "@gravity-ui/icons";
import { Button, Chip, Drawer, Dropdown, Label, Modal } from "@heroui/react";
import { formatPhone } from "@/lib/mastra/phone";
import {
  VISIT_STATUSES,
  bookingChannelLabel,
  programLabel,
  visitorCategoryLabel,
  type VisitDetailView,
} from "@/lib/visits/constants";
import { formatDateRange, formatTimeRange } from "@/lib/visits/time";
import type { VisitListItem, VisitReference } from "@/lib/visits/types";
import { VisitStatusChip } from "./visit-status-chip";

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

type Row = { label: string; value: React.ReactNode };

/** A titled block of label/value rows. Empty rows are dropped; an empty section isn't shown. */
function Section({ title, rows, children }: { title: string; rows?: Row[]; children?: React.ReactNode }) {
  const filled = (rows ?? []).filter((row) => row.value !== null && row.value !== undefined && row.value !== "");
  if (filled.length === 0 && !children) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {filled.length > 0 ? (
        <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm">
          {filled.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted">{row.label}</dt>
              <dd className="min-w-0 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </section>
  );
}

function VisitDetails({
  visit,
  reference,
  onGuests,
}: {
  visit: VisitListItem;
  reference: VisitReference;
  onGuests: () => void;
}) {
  const villages = visit.villageIds
    .map((id) => reference.villages.find((v) => v.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const experiences = reference.experiences.filter((e) => visit.experienceIds.includes(e.id));
  const partner = reference.partners.find((p) => p.id === visit.partner_id)?.name;
  const feedbackForm = visit.feedback_form_id
    ? (reference.forms.find((f) => f.id === visit.feedback_form_id)?.title ?? "Unavailable form")
    : null;

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Visitors"
        rows={[
          { label: "Category", value: visit.visitor_category ? visitorCategoryLabel(visit.visitor_category) : visit.visitor_group },
          { label: "Headcount", value: visit.headcount !== null ? `${visit.headcount} people` : null },
          { label: "Coming from", value: visit.origin_place },
          { label: "Institute / company", value: visit.source },
          { label: "Booking channel", value: visit.booking_channel ? bookingChannelLabel(visit.booking_channel) : null },
        ]}
      />

      <Section
        title="Team"
        rows={[
          { label: "JRF coordinator", value: visit.poc_name },
          {
            label: "Coordinator phone",
            value: visit.poc_phone ? (
              <a className="text-accent hover:underline" href={`tel:${visit.poc_phone.replace(/\s+/g, "")}`}>
                {formatPhone(visit.poc_phone)}
              </a>
            ) : null,
          },
          { label: "Facilitator / host", value: visit.facilitator },
          { label: "Partner", value: partner },
        ]}
      />

      <Section title="Locations">
        {villages.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {villages.map((name) => (
              <Chip key={name} size="sm" variant="soft">
                {name}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No locations chosen.</p>
        )}
        {experiences.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm">
            {experiences.map((experience) => (
              <li key={experience.id} className="flex gap-2">
                <span className="text-muted">•</span>
                <span>
                  {experience.name}
                  <span className="text-muted">
                    {" "}
                    — {reference.villages.find((v) => v.id === experience.village_id)?.name}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Guests">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2.5">
          <span className="text-sm">
            {visit.guestCount === 0
              ? "No guests added yet"
              : `${visit.guestCount} guest${visit.guestCount === 1 ? "" : "s"} on the list`}
          </span>
          <Button size="sm" variant="secondary" onPress={onGuests}>
            <Persons className="size-4" />
            Manage
          </Button>
        </div>
      </Section>

      <Section
        title="Payment"
        rows={[
          { label: "Amount charged", value: visit.amount_charged !== null ? rupees.format(visit.amount_charged) : null },
          {
            label: "To artisan families",
            value: visit.amount_to_artisans !== null ? rupees.format(visit.amount_to_artisans) : null,
          },
        ]}
      />

      <Section title="After the visit" rows={[{ label: "Feedback form", value: feedbackForm }]} />

      {visit.notes ? (
        <Section title="Internal notes">
          <p className="whitespace-pre-wrap rounded-xl bg-neutral-50 px-3 py-2.5 text-sm">{visit.notes}</p>
        </Section>
      ) : null}
    </div>
  );
}

/** Status picker for a visit; the current status is ticked. */
export function ChangeStatusMenu({
  visit,
  onStatusChange,
}: {
  visit: VisitListItem;
  onStatusChange: (visit: VisitListItem, status: string) => void;
}) {
  return (
    <Dropdown>
      <Button variant="secondary">
        Change status
        <ChevronDown className="size-4" />
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu
          selectedKeys={new Set([visit.status])}
          selectionMode="single"
          onAction={(key) => onStatusChange(visit, String(key))}
        >
          {VISIT_STATUSES.map((s) => (
            <Dropdown.Item key={s.id} id={s.id} textValue={s.label}>
              <Dropdown.ItemIndicator />
              <Label>{s.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

/**
 * A visit's details, shown as a sidebar or a centred pop-up. The icon next to the close
 * button switches between the two, and the choice is remembered for the user.
 */
export function VisitDetailPanel({
  visit,
  reference,
  view,
  onViewChange,
  isOpen,
  onOpenChange,
  onEdit,
  onGuests,
  onMessages,
  onStatusChange,
}: {
  visit: VisitListItem | null;
  reference: VisitReference;
  view: VisitDetailView;
  onViewChange: (view: VisitDetailView) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (visit: VisitListItem) => void;
  onGuests: (visit: VisitListItem) => void;
  onMessages: (visit: VisitListItem) => void;
  onStatusChange: (visit: VisitListItem, status: string) => void;
}) {
  const viewToggle = (
    <Button
      isIconOnly
      aria-label={view === "sidebar" ? "Open as pop-up" : "Open in sidebar"}
      className="absolute right-12 top-3"
      size="sm"
      variant="ghost"
      onPress={() => onViewChange(view === "sidebar" ? "popup" : "sidebar")}
    >
      {view === "sidebar" ? <ArrowsExpand className="size-4" /> : <LayoutSideContentRight className="size-4" />}
    </Button>
  );

  function summary(heading: ReactNode) {
    if (!visit) return null;
    return (
      <>
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{programLabel(visit.program_category)}</span>
        {heading}
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <VisitStatusChip status={visit.status} />
          <span>{formatTimeRange(visit.start_time, visit.end_time)}</span>
        </div>
      </>
    );
  }

  const body = visit ? <VisitDetails reference={reference} visit={visit} onGuests={() => onGuests(visit)} /> : null;

  const actions = visit ? (
    <>
      <Button variant="tertiary" onPress={() => onMessages(visit)}>
        <Envelope className="size-4" />
        Messages
      </Button>
      <ChangeStatusMenu visit={visit} onStatusChange={onStatusChange} />
      <Button onPress={() => onEdit(visit)}>
        <Pencil className="size-4" />
        Edit
      </Button>
    </>
  ) : null;

  const title = visit ? formatDateRange(visit.visit_date, visit.end_date) : "";

  if (view === "popup") {
    return (
      <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Modal.Container scroll="inside">
          <Modal.Dialog className="sm:max-w-2xl">
            <Modal.CloseTrigger />
            {viewToggle}
            <Modal.Header className="flex flex-col gap-2 border-b border-border/70 pb-4 pr-20">
              {summary(<Modal.Heading className="text-lg">{title}</Modal.Heading>)}
            </Modal.Header>
            <Modal.Body className="py-5">{body}</Modal.Body>
            <Modal.Footer className="flex flex-wrap justify-end gap-2 border-t border-border/70 pt-4">{actions}</Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    );
  }

  return (
    <Drawer.Backdrop isOpen={isOpen} variant="transparent" onOpenChange={onOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog className="w-full sm:max-w-md">
          <Drawer.CloseTrigger />
          {viewToggle}
          <Drawer.Header className="flex flex-col gap-2 border-b border-border/70 pb-4 pr-20">
            {summary(<Drawer.Heading className="text-lg">{title}</Drawer.Heading>)}
          </Drawer.Header>
          <Drawer.Body className="py-5">{body}</Drawer.Body>
          <Drawer.Footer className="flex flex-wrap justify-end gap-2 border-t border-border/70 pt-4">{actions}</Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
