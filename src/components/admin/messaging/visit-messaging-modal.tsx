"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, TrashBin } from "@gravity-ui/icons";
import { Button, Chip, Label, ListBox, Modal, Select, Switch, toast } from "@heroui/react";
import {
  applyRuleSetToVisit,
  cancelSend,
  createVisitRule,
  deleteVisitRule,
  getVisitMessaging,
  listRuleTemplates,
  requeueSend,
  updateVisitRule,
  type VisitMessagingRule,
  type VisitMessagingSend,
} from "@/lib/actions/messaging";
import { RESENDABLE_STATUSES, describeTiming, sendStatusMeta, type RuleAnchor, type RuleInput, type TemplateOption } from "@/lib/visits/messaging";
import { formatDate } from "@/lib/visits/time";
import type { VisitListItem } from "@/lib/visits/types";
import { RuleForm } from "./rule-form";

type MessagingData = Awaited<ReturnType<typeof getVisitMessaging>>;

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Loads on the click that opens the dialog (no effect), so the content is ready as it appears. */
export function useVisitMessaging() {
  const [visit, setVisit] = useState<VisitListItem | null>(null);
  const [data, setData] = useState<MessagingData | null>(null);
  const [templates, setTemplates] = useState<{ templates: TemplateOption[]; error?: string }>({ templates: [] });
  const [isOpen, setIsOpen] = useState(false);

  async function load(target: VisitListItem) {
    const [messaging, tpl] = await Promise.all([getVisitMessaging(target.id), listRuleTemplates()]);
    setData(messaging);
    setTemplates(tpl);
  }

  async function open(next: VisitListItem) {
    setVisit(next);
    setData(null);
    setIsOpen(true);
    await load(next);
  }

  async function reload() {
    if (visit) await load(visit);
  }

  return { visit, data, templates, isOpen, setIsOpen, open, reload };
}

function MessagingBody({
  visit,
  data,
  templates,
  reload,
}: {
  visit: VisitListItem;
  data: MessagingData | null;
  templates: { templates: TemplateOption[]; error?: string };
  reload: () => Promise<void>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<VisitMessagingRule | "new" | null>(null);
  const [sequence, setSequence] = useState<string | null>(null);

  async function after(result: { error?: string }, success?: string) {
    if (result.error) {
      toast.danger(result.error);
      return false;
    }
    if (success) toast.success(success);
    await reload();
    router.refresh();
    return true;
  }

  async function handleSubmitRule(input: RuleInput) {
    const result = editing && editing !== "new" ? await updateVisitRule(editing.id, input) : await createVisitRule(visit.id, input);
    if (!result.error) {
      setEditing(null);
      await reload();
      router.refresh();
    }
    return result;
  }

  async function handleApplySequence() {
    if (!sequence) return;
    const result = await applyRuleSetToVisit(visit.id, sequence);
    if (await after(result)) {
      toast.success(result.added ? `${result.added} message${result.added === 1 ? "" : "s"} added` : "Those messages were already on this visit");
      setSequence(null);
    }
  }

  if (!data) return <p className="text-sm text-muted">Loading…</p>;

  const { settings, rules, sends, sequences } = data;
  const needsCompletion = rules.some((r) => r.enabled && r.anchor === "on_complete") && visit.status !== "completed";

  return (
    <div className="flex flex-col gap-5">
      {!settings.sendsEnabled ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          Scheduled messaging is <strong>switched off</strong>, so nothing is sent yet. Messages still queue up here. Turn it
          on under Messaging → Settings.
        </div>
      ) : settings.dryRun ? (
        <div className="rounded-xl border border-border bg-neutral-50 p-3 text-sm">
          <strong>Dry run:</strong> messages are recorded here as &ldquo;Dry run&rdquo; but are <strong>not</strong> sent to
          anyone. Switch dry run off under Messaging → Settings when you&apos;re ready.
        </div>
      ) : null}

      {needsCompletion ? (
        <p className="text-sm text-muted">
          After-visit messages start when this visit is marked <strong>completed</strong>
          {visit.visit_date ? ` (it is currently ${visit.status.replace("_", " ")})` : ""}.
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Messages for this visit</h3>
          <Button size="sm" variant="secondary" onPress={() => setEditing("new")}>
            <Plus className="size-4" />
            Add message
          </Button>
        </div>

        {editing ? (
          <RuleForm
            key={editing === "new" ? "new" : editing.id}
            submitLabel={editing === "new" ? "Add message" : "Save changes"}
            templates={templates.templates}
            templatesError={templates.error}
            value={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onSubmit={handleSubmitRule}
          />
        ) : null}

        {rules.length === 0 && !editing ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
            No messages yet. Add one, or apply a saved sequence below.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60 rounded-2xl border border-border/70">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{rule.name}</span>
                  <span className="text-xs text-muted">
                    {describeTiming(rule.anchor, rule.offsetMinutes)} · {rule.templateName} ({rule.templateLanguage})
                  </span>
                </div>
                <Switch
                  aria-label={`${rule.name} enabled`}
                  isSelected={rule.enabled}
                  onChange={async (selected) =>
                    after(
                      await updateVisitRule(rule.id, {
                        name: rule.name,
                        anchor: rule.anchor as RuleAnchor,
                        offsetMinutes: rule.offsetMinutes,
                        templateName: rule.templateName,
                        templateLanguage: rule.templateLanguage,
                        enabled: selected,
                      }),
                    )
                  }
                >
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch>
                <Button isIconOnly aria-label="Edit message" size="sm" variant="ghost" onPress={() => setEditing(rule)}>
                  <Pencil className="size-4" />
                </Button>
                <Button
                  isIconOnly
                  aria-label="Remove message"
                  size="sm"
                  variant="ghost"
                  onPress={async () => after(await deleteVisitRule(rule.id))}
                >
                  <TrashBin className="size-4 text-danger" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {sequences.length > 0 ? (
          <div className="flex items-end gap-2">
            <Select className="flex-1" value={sequence} onChange={(key) => setSequence(key ? String(key) : null)}>
              <Label>Apply a saved sequence</Label>
              <Select.Trigger>
                <Select.Value>
                  {({ defaultChildren, isPlaceholder }) => (isPlaceholder ? <span className="text-muted">Choose a sequence…</span> : defaultChildren)}
                </Select.Value>
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {sequences.map((s) => (
                    <ListBox.Item key={s.id} id={s.id} textValue={s.name}>
                      {s.name} ({s.itemCount} message{s.itemCount === 1 ? "" : "s"})
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <Button isDisabled={!sequence} variant="secondary" onPress={handleApplySequence}>
              Apply
            </Button>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Scheduled sends</h3>
        {sends.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing scheduled yet. Sends appear here once the visit has guests and its messages are due to be worked out
            (after-visit messages wait for completion).
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60 rounded-2xl border border-border/70">
            {sends.map((send) => (
              <SendRow key={send.id} send={send} onChange={after} />
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">Times are Indian Standard Time. Nothing is sent between the quiet hours set in Settings.</p>
      </section>
    </div>
  );
}

function SendRow({
  send,
  onChange,
}: {
  send: VisitMessagingSend;
  onChange: (result: { error?: string }, success?: string) => Promise<boolean>;
}) {
  const meta = sendStatusMeta(send.status);
  const canResend = (RESENDABLE_STATUSES as readonly string[]).includes(send.status);
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">
          {send.ruleName} <span className="font-normal text-muted">→ {send.guestName ?? "guest"}</span>
        </span>
        <span className="text-xs text-muted">
          {send.status === "sent" && send.sentAt ? `Sent ${formatWhen(send.sentAt)}` : `Due ${formatWhen(send.runAt)}`}
          {send.lastError ? ` · ${send.lastError}` : ""}
        </span>
        {send.status === "unknown" ? (
          <span className="text-xs text-danger">
            It may already have been delivered. Check the guest&apos;s chat before sending it again.
          </span>
        ) : null}
      </div>
      <Chip color={meta.color} size="sm" variant="soft">
        {meta.label}
      </Chip>
      {canResend ? (
        <Button size="sm" variant="secondary" onPress={async () => onChange(await requeueSend(send.id), "Queued to send")}>
          Send again
        </Button>
      ) : null}
      {send.status === "queued" ? (
        <Button size="sm" variant="ghost" onPress={async () => onChange(await cancelSend(send.id))}>
          Cancel
        </Button>
      ) : null}
    </li>
  );
}

export function VisitMessagingModal({
  visit,
  data,
  templates,
  reload,
  isOpen,
  onOpenChange,
}: {
  visit: VisitListItem | null;
  data: MessagingData | null;
  templates: { templates: TemplateOption[]; error?: string };
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
              Messages{visit ? ` — ${visit.visit_type}, ${formatDate(visit.visit_date)}` : ""}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            {visit ? <MessagingBody key={visit.id} data={data} reload={reload} templates={templates} visit={visit} /> : null}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
