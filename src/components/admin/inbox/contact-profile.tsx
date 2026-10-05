"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, TrashBin } from "@gravity-ui/icons";
import { Button, Chip, Input, Label, TextArea, TextField, toast } from "@heroui/react";
import { addLeadMemory, deleteLeadMemory, updateLeadMemory, type InboxThread, type LeadMemory } from "@/lib/actions/inbox";
import { updateLeadDetails } from "@/lib/actions/leads";
import { leadAttributeValues } from "@/lib/leads/fields";
import { formatPhone } from "@/lib/mastra/phone";
import { visitStatusLabel } from "@/lib/visits/constants";
import { formatDate } from "@/lib/visits/time";
import { AttributeInput } from "../leads/lead-edit-modal";

const SOURCE_LABEL: Record<string, string> = {
  form: "Form submission",
  whatsapp_agent: "WhatsApp",
  manual: "Added manually",
};

function MemoryItem({ memory }: { memory: LeadMemory }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(memory.content);
  const [isBusy, setIsBusy] = useState(false);

  async function save() {
    setIsBusy(true);
    const result = await updateLeadMemory(memory.id, content);
    setIsBusy(false);
    if (result.error) return toast.danger(result.error);
    setIsEditing(false);
    router.refresh();
  }

  async function remove() {
    setIsBusy(true);
    const result = await deleteLeadMemory(memory.id);
    setIsBusy(false);
    if (result.error) return toast.danger(result.error);
    router.refresh();
  }

  return (
    <li className="group flex flex-col gap-1 rounded-lg border border-border/60 p-2">
      {isEditing ? (
        <div className="flex flex-col gap-2">
          <TextField aria-label="Note" value={content} onChange={setContent}>
            <TextArea rows={2} />
          </TextField>
          <div className="flex gap-1">
            <Button isPending={isBusy} size="sm" onPress={save}>
              Save
            </Button>
            <Button size="sm" variant="tertiary" onPress={() => setIsEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm">{memory.content}</p>
      )}
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <Chip color={memory.source === "agent" ? "accent" : "default"} size="sm" variant="soft">
          {memory.source === "agent" ? "AI agent" : (memory.created_by ?? "Team")}
        </Chip>
        {new Date(memory.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
        {!isEditing ? (
          <span className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100">
            <Button isIconOnly aria-label="Edit note" size="sm" variant="ghost" onPress={() => setIsEditing(true)}>
              <Pencil className="size-3.5" />
            </Button>
            <Button isIconOnly aria-label="Delete note" isDisabled={isBusy} size="sm" variant="ghost" onPress={remove}>
              <TrashBin className="size-3.5 text-danger" />
            </Button>
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function ContactProfile({ thread }: { thread: InboxThread }) {
  const router = useRouter();
  const { conversation, lead, leadLists, memories, attributes, visits } = thread;
  const active = attributes.filter((a) => a.is_active);
  const stored = lead ? leadAttributeValues(lead) : {};

  const [name, setName] = useState(lead?.name ?? "");
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(active.map((a) => [a.key, stored[a.key] == null ? "" : String(stored[a.key])])),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [note, setNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);

  if (!lead) {
    return (
      <div className="flex flex-col gap-2 p-4 text-sm">
        <h2 className="font-semibold">Contact</h2>
        <p className="text-muted">
          {conversation.contact_phone
            ? "The lead for this contact is created with their first message."
            : "This person messaged with a WhatsApp username and hasn't shared a phone number, so there's no lead record, memory or AI replies for them — reply manually."}
        </p>
      </div>
    );
  }

  async function saveDetails() {
    setIsSaving(true);
    const result = await updateLeadDetails(lead!.id, { name, attributes: values });
    setIsSaving(false);
    if (result.error) return toast.danger(result.error);
    toast.success("Contact details saved.");
    router.refresh();
  }

  async function addNote() {
    setIsAddingNote(true);
    const result = await addLeadMemory(lead!.id, note);
    setIsAddingNote(false);
    if (result.error) return toast.danger(result.error);
    setNote("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{lead.name || "Unnamed contact"}</h2>
        <p className="text-xs text-muted">{formatPhone(lead.phone)}</p>
        <p className="text-xs text-muted">Source: {SOURCE_LABEL[lead.source] ?? lead.source}</p>
        {leadLists.length > 0 ? (
          <div className="flex flex-wrap gap-1 pt-1">
            {leadLists.map((list) => (
              <Chip key={list.id} size="sm" variant="soft">
                {list.name}
              </Chip>
            ))}
          </div>
        ) : null}
      </section>

      {visits.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Visits</h3>
          <ul className="flex flex-col gap-1.5">
            {visits.map((visit) => (
              <li key={visit.id}>
                <Link
                  className="flex flex-col rounded-lg border border-border/60 p-2 text-sm hover:bg-neutral-50"
                  href={visit.visitDate ? `/calendar?month=${visit.visitDate.slice(0, 7)}` : "/trips"}
                >
                  <span className="font-medium">{visit.visitType}</span>
                  <span className="text-xs text-muted">
                    {formatDate(visit.visitDate)} · {visitStatusLabel(visit.status)}
                    {visit.guestStatus === "no_show" ? " · no-show" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Details</h3>
        <TextField value={name} onChange={setName}>
          <Label>Name</Label>
          <Input />
        </TextField>
        {active.length === 0 ? (
          <p className="text-xs text-muted">No custom attributes yet — add them under Leads → Custom attributes.</p>
        ) : (
          active.map((attr) => (
            <AttributeInput
              key={attr.key}
              attribute={attr}
              value={values[attr.key] ?? ""}
              onChange={(v) => setValues((prev) => ({ ...prev, [attr.key]: v }))}
            />
          ))
        )}
        <Button isPending={isSaving} size="sm" variant="secondary" onPress={saveDetails}>
          Save details
        </Button>
        <p className="text-[11px] text-muted">The AI agent also fills these in as the contact shares them.</p>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Agent memory</h3>
          <p className="text-[11px] text-muted">
            The agent reads every note before it replies to this contact, and adds its own as it learns.
          </p>
        </div>
        {memories.length === 0 ? <p className="text-xs text-muted">Nothing remembered yet.</p> : null}
        <ul className="flex flex-col gap-2">
          {memories.map((memory) => (
            <MemoryItem key={`${memory.id}:${memory.updated_at}`} memory={memory} />
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <TextField aria-label="New note" value={note} onChange={setNote}>
            <TextArea placeholder="e.g. Prefers calls after 6pm" rows={2} />
          </TextField>
          <Button isDisabled={!note.trim()} isPending={isAddingNote} size="sm" variant="ghost" onPress={addNote}>
            <Plus className="size-3.5" />
            Add note
          </Button>
        </div>
      </section>
    </div>
  );
}
