"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Comment, Copy, Plus, TrashBin } from "@gravity-ui/icons";
import { Button, Chip, Input, Label, ListBox, Modal, Select, TextField, toast } from "@heroui/react";
import {
  addGuestFromLead,
  addNewGuest,
  getVisitGuests,
  removeGuest,
  searchLeadsForVisit,
  setGuestStatus,
} from "@/lib/actions/visits";
import { formatPhone } from "@/lib/mastra/phone";
import { GUEST_STATUSES } from "@/lib/visits/constants";
import { formatDate } from "@/lib/visits/time";
import type { LeadSearchResult, VisitGuestItem, VisitListItem } from "@/lib/visits/types";

/**
 * Shared by the Trips and Calendar views. Guests are loaded in the click handler
 * that opens the modal (not in an effect), so the list is ready as it appears.
 */
export function useVisitGuests() {
  const [visit, setVisit] = useState<VisitListItem | null>(null);
  const [guests, setGuests] = useState<VisitGuestItem[] | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  async function open(next: VisitListItem) {
    setVisit(next);
    setGuests(null);
    setIsOpen(true);
    setGuests(await getVisitGuests(next.id));
  }

  async function reload() {
    if (visit) setGuests(await getVisitGuests(visit.id));
  }

  return { visit, guests, isOpen, setIsOpen, open, reload };
}

function GuestsBody({
  visit,
  guests,
  reload,
}: {
  visit: VisitListItem;
  guests: VisitGuestItem[] | null;
  reload: () => Promise<void>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeadSearchResult[]>([]);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setResults(await searchLeadsForVisit(visit.id, value));
    }, 250);
  }

  async function afterChange(result: { error?: string }) {
    if (result.error) {
      toast.danger(result.error);
      return false;
    }
    await reload();
    router.refresh();
    return true;
  }

  async function copyFeedbackLink(guest: VisitGuestItem) {
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || window.location.origin;
    try {
      await navigator.clipboard.writeText(`${origin}/fb/${guest.feedbackToken}`);
      toast.success("Feedback link copied");
    } catch {
      toast.danger("Couldn't copy the link — your browser blocked clipboard access.");
    }
  }

  async function handleAddLead(lead: LeadSearchResult) {
    if (await afterChange(await addGuestFromLead(visit.id, lead.id))) {
      setQuery("");
      setResults([]);
    }
  }

  async function handleAddNew(e: React.FormEvent) {
    e.preventDefault();
    setIsAdding(true);
    setError(null);
    const result = await addNewGuest(visit.id, { name: newName, phone: newPhone });
    setIsAdding(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNewName("");
    setNewPhone("");
    await reload();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Guests are contacts from Leads. After the visit, everyone marked invited or attended gets the
        after-visit WhatsApp messages. Headcount ({visit.headcount ?? "not set"}) is the group size and is
        tracked separately.
      </p>

      {guests === null ? (
        <p className="text-sm text-muted">Loading guests…</p>
      ) : guests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          No guests yet. Add them below so they receive messages about this visit.
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 rounded-2xl border border-border/70">
          {guests.map((guest) => (
            <li key={guest.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{guest.name ?? "Unnamed contact"}</span>
                <span className="text-xs text-muted">
                  {formatPhone(guest.phone)}
                  {guest.email ? ` · ${guest.email}` : ""}
                </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {guest.optedOut ? (
                    <Chip color="danger" size="sm" variant="soft">
                      Opted out of messages
                    </Chip>
                  ) : null}
                  {guest.needsHuman ? (
                    <Chip color="warning" size="sm" variant="soft">
                      Needs a person
                    </Chip>
                  ) : null}
                </div>
              </div>
              <Select
                aria-label={`Status for ${guest.name ?? guest.phone}`}
                className="w-36"
                value={guest.status}
                onChange={async (key) => {
                  if (key) await afterChange(await setGuestStatus(guest.id, String(key)));
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {GUEST_STATUSES.map((s) => (
                      <ListBox.Item key={s.id} id={s.id} textValue={s.label}>
                        {s.label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              {visit.feedback_form_id ? (
                <Button
                  isIconOnly
                  aria-label={`Copy feedback link for ${guest.name ?? guest.phone}`}
                  size="sm"
                  variant="ghost"
                  onPress={() => copyFeedbackLink(guest)}
                >
                  <Copy className="size-4" />
                </Button>
              ) : null}
              {guest.conversationId ? (
                <Link
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-accent hover:bg-accent/10"
                  href={`/inbox?c=${guest.conversationId}`}
                >
                  <Comment className="size-4" />
                  Open chat
                </Link>
              ) : (
                <span className="px-2.5 text-xs text-muted">No chat yet</span>
              )}
              <Button
                isIconOnly
                aria-label="Remove guest"
                size="sm"
                variant="ghost"
                onPress={async () => afterChange(await removeGuest(guest.id))}
              >
                <TrashBin className="size-4 text-danger" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4">
        <p className="text-sm font-medium">Add an existing contact</p>
        <TextField aria-label="Search contacts" value={query} onChange={handleQueryChange}>
          <Input placeholder="Search by name or phone…" />
        </TextField>
        {results.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/70">
            {results.map((lead) => (
              <li key={lead.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm">
                  {lead.name ?? "Unnamed contact"}
                  <span className="text-muted"> · {formatPhone(lead.phone)}</span>
                </span>
                <Button size="sm" variant="secondary" onPress={() => handleAddLead(lead)}>
                  <Plus className="size-4" />
                  Add
                </Button>
              </li>
            ))}
          </ul>
        ) : query.trim().length >= 2 ? (
          <p className="text-sm text-muted">No matching contacts. Add them as a new guest below.</p>
        ) : null}
      </div>

      <form className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4" onSubmit={handleAddNew}>
        <p className="text-sm font-medium">Add a new guest</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField isRequired value={newName} onChange={setNewName}>
            <Label>Name</Label>
            <Input placeholder="Guest name" />
          </TextField>
          <TextField isRequired value={newPhone} onChange={setNewPhone}>
            <Label>WhatsApp number</Label>
            <Input placeholder="e.g. +91 98765 43210" type="tel" />
          </TextField>
        </div>
        <p className="text-xs text-muted">
          If this number already exists in Leads, that contact is used. Add their email and other details from
          the Leads page.
        </p>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button className="self-start" isPending={isAdding} type="submit">
          Add guest
        </Button>
      </form>
    </div>
  );
}

export function VisitGuestsModal({
  visit,
  guests,
  reload,
  isOpen,
  onOpenChange,
}: {
  visit: VisitListItem | null;
  guests: VisitGuestItem[] | null;
  reload: () => Promise<void>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container scroll="outside">
        <Modal.Dialog className="sm:max-w-2xl">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>
              Guests{visit ? ` — ${visit.visit_type}, ${formatDate(visit.visit_date)}` : ""}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body>{visit ? <GuestsBody key={visit.id} guests={guests} reload={reload} visit={visit} /> : null}</Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
