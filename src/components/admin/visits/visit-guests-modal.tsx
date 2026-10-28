"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Comment, Copy, Plus, TrashBin, Xmark } from "@gravity-ui/icons";
import {
  Button,
  Chip,
  Input,
  Label,
  ListBox,
  Modal,
  SearchField,
  Select,
  Table,
  Tabs,
  TextField,
  toast,
} from "@heroui/react";
import {
  addGuestFromLead,
  addNewGuest,
  getVisitGuests,
  removeGuest,
  searchLeadsForVisit,
  setGuestStatus,
} from "@/lib/actions/visits";
import { formatPhone } from "@/lib/mastra/phone";
import { DEFAULT_COUNTRY_CODE, GUEST_STATUSES } from "@/lib/visits/constants";
import { formatDateRange } from "@/lib/visits/time";
import type { LeadSearchResult, VisitGuestItem, VisitListItem } from "@/lib/visits/types";
import { PhoneField, joinPhone } from "./phone-field";

/**
 * Shared by the Trips and Calendar views. Guests are loaded in the click handler
 * that opens the modal (not in an effect), so the list is ready as it appears.
 */
export function useVisitGuests() {
  const [visit, setVisit] = useState<VisitListItem | null>(null);
  const [guests, setGuests] = useState<VisitGuestItem[] | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [justCreated, setJustCreated] = useState(false);

  async function open(next: VisitListItem) {
    setVisit(next);
    setJustCreated(false);
    setGuests(null);
    setIsOpen(true);
    setGuests(await getVisitGuests(next.id));
  }

  /** Straight after a visit is added: it has no guests yet, so nothing to load. */
  function openForNewVisit(next: VisitListItem) {
    setVisit(next);
    setJustCreated(true);
    setGuests([]);
    setIsOpen(true);
  }

  async function reload() {
    if (visit) setGuests(await getVisitGuests(visit.id));
  }

  return { visit, guests, isOpen, setIsOpen, open, openForNewVisit, justCreated, reload };
}

function AddGuestPanel({
  visit,
  onAdded,
  onClose,
}: {
  visit: VisitListItem;
  onAdded: () => Promise<void>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<string>("new");
  const [name, setName] = useState("");
  const [phoneCode, setPhoneCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Remounted after each add so focus returns to an empty name field for the next guest.
  const [formKey, setFormKey] = useState(0);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeadSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.trim().length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      setResults(await searchLeadsForVisit(visit.id, value));
      setIsSearching(false);
    }, 250);
  }

  async function handleAddNew(e: React.FormEvent) {
    e.preventDefault();
    setIsAdding(true);
    setError(null);
    const result = await addNewGuest(visit.id, { name, phone: joinPhone(phoneCode, phoneNumber) });
    setIsAdding(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success(`${name.trim()} added`);
    setName("");
    setPhoneNumber("");
    setFormKey((k) => k + 1);
    await onAdded();
  }

  async function handleAddLead(lead: LeadSearchResult) {
    const result = await addGuestFromLead(visit.id, lead.id);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    toast.success(`${lead.name ?? "Contact"} added`);
    setResults((prev) => prev.filter((r) => r.id !== lead.id));
    await onAdded();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-neutral-50/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Add a guest</p>
        <Button isIconOnly aria-label="Close" size="sm" variant="ghost" onPress={onClose}>
          <Xmark className="size-4" />
        </Button>
      </div>
      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key))}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="How to add">
            <Tabs.Tab id="new">
              New guest
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="existing">
              Existing contact
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel className="pt-4" id="new">
          <form key={formKey} className="flex flex-col gap-3" onSubmit={handleAddNew}>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField autoFocus={formKey > 0} isRequired value={name} onChange={setName}>
                <Label>Name</Label>
                <Input placeholder="Guest name" />
              </TextField>
              <PhoneField
                isRequired
                code={phoneCode}
                label="WhatsApp number"
                number={phoneNumber}
                onCodeChange={setPhoneCode}
                onNumberChange={setPhoneNumber}
              />
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">If this number is already in Leads, that contact is reused.</p>
              <Button isPending={isAdding} type="submit">
                <Plus className="size-4" />
                Add guest
              </Button>
            </div>
          </form>
        </Tabs.Panel>

        <Tabs.Panel className="flex flex-col gap-3 pt-4" id="existing">
          <SearchField aria-label="Search contacts" value={query} onChange={handleQueryChange}>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Search Leads by name or phone…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          {results.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/70 bg-white">
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
          ) : query.trim().length >= 2 && !isSearching ? (
            <p className="text-sm text-muted">
              No matching contacts.{" "}
              <button className="text-accent hover:underline" type="button" onClick={() => setTab("new")}>
                Add them as a new guest
              </button>
              .
            </p>
          ) : (
            <p className="text-sm text-muted">Type at least two characters of a name or number.</p>
          )}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

function GuestsBody({
  visit,
  guests,
  reload,
  justCreated,
}: {
  visit: VisitListItem;
  guests: VisitGuestItem[] | null;
  reload: () => Promise<void>;
  justCreated: boolean;
}) {
  const router = useRouter();
  const [isAddOpen, setIsAddOpen] = useState(justCreated);

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

  const count = guests?.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {justCreated ? (
        <div className="rounded-2xl bg-success/10 px-4 py-3 text-sm">
          <p className="font-medium text-success">Visit added.</p>
          <p className="text-muted">
            Add the guest list now, or skip and add guests later from the Guests button on the visit.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {guests === null ? "Guests" : `${count} guest${count === 1 ? "" : "s"}`}
            <span className="font-normal text-muted"> · headcount {visit.headcount ?? "not set"}</span>
          </p>
          <p className="text-xs text-muted">
            Guests marked invited or attended get the after-visit WhatsApp messages.
          </p>
        </div>
        {!isAddOpen ? (
          <Button onPress={() => setIsAddOpen(true)}>
            <Plus className="size-4" />
            Add guest
          </Button>
        ) : null}
      </div>

      {isAddOpen ? (
        <AddGuestPanel
          visit={visit}
          onAdded={async () => {
            await reload();
            router.refresh();
          }}
          onClose={() => setIsAddOpen(false)}
        />
      ) : null}

      <Table variant="primary">
        <Table.ScrollContainer>
          <Table.Content aria-label="Guests" className="w-full min-w-[680px]">
            <Table.Header>
              <Table.Column isRowHeader>Guest</Table.Column>
              <Table.Column>WhatsApp</Table.Column>
              <Table.Column className="w-40">Status</Table.Column>
              <Table.Column>Chat</Table.Column>
              <Table.Column className="w-24 text-right">
                <span className="sr-only">Actions</span>
              </Table.Column>
            </Table.Header>
            <Table.Body
              renderEmptyState={() => (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted">
                  {guests === null ? (
                    "Loading guests…"
                  ) : (
                    <>
                      <span>No guests yet. Add them so they receive messages about this visit.</span>
                      {!isAddOpen ? (
                        <Button size="sm" variant="secondary" onPress={() => setIsAddOpen(true)}>
                          <Plus className="size-4" />
                          Add guest
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            >
              {(guests ?? []).map((guest) => (
                <Table.Row key={guest.id} id={guest.id}>
                  <Table.Cell>
                    <span className="block font-medium">{guest.name ?? "Unnamed contact"}</span>
                    {guest.email ? <span className="block text-xs text-muted">{guest.email}</span> : null}
                    {guest.optedOut || guest.needsHuman ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {guest.optedOut ? (
                          <Chip color="danger" size="sm" variant="soft">
                            Opted out
                          </Chip>
                        ) : null}
                        {guest.needsHuman ? (
                          <Chip color="warning" size="sm" variant="soft">
                            Needs a person
                          </Chip>
                        ) : null}
                      </span>
                    ) : null}
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap tabular-nums">{formatPhone(guest.phone)}</Table.Cell>
                  <Table.Cell>
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
                  </Table.Cell>
                  <Table.Cell>
                    {guest.conversationId ? (
                      <Link
                        className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                        href={`/inbox?c=${guest.conversationId}`}
                      >
                        <Comment className="size-4" />
                        Open chat
                      </Link>
                    ) : (
                      <span className="text-xs text-muted">No chat yet</span>
                    )}
                  </Table.Cell>
                  <Table.Cell className="text-right">
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
                    <Button
                      isIconOnly
                      aria-label={`Remove ${guest.name ?? guest.phone}`}
                      size="sm"
                      variant="ghost"
                      onPress={async () => afterChange(await removeGuest(guest.id))}
                    >
                      <TrashBin className="size-4 text-danger" />
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}

export function VisitGuestsModal({
  visit,
  guests,
  reload,
  isOpen,
  onOpenChange,
  justCreated = false,
}: {
  visit: VisitListItem | null;
  guests: VisitGuestItem[] | null;
  reload: () => Promise<void>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opened straight after the visit was added — shows a prompt and a skip button. */
  justCreated?: boolean;
}) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container scroll="outside">
        <Modal.Dialog className="sm:max-w-4xl">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>
              {justCreated ? "Add guest list" : "Guests"}
              {visit ? ` — ${visit.visit_type}, ${formatDateRange(visit.visit_date, visit.end_date)}` : ""}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            {visit ? (
              <GuestsBody key={visit.id} guests={guests} justCreated={justCreated} reload={reload} visit={visit} />
            ) : null}
          </Modal.Body>
          {justCreated ? (
            <Modal.Footer>
              <Button slot="close" variant={guests && guests.length > 0 ? "primary" : "tertiary"}>
                {guests && guests.length > 0 ? "Done" : "Skip for now"}
              </Button>
            </Modal.Footer>
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
