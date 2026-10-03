"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleExclamation, FileText, PaperPlane } from "@gravity-ui/icons";
import { Button, Chip, Disclosure, Switch, TextArea, TextField, toast } from "@heroui/react";
import {
  getComposerTemplates,
  resolveHandoff,
  sendStaffMessage,
  setConversationAi,
  type InboxMessage,
  type InboxThread,
} from "@/lib/actions/inbox";
import { formatPhone } from "@/lib/mastra/phone";
import type { AgentTraceEntry } from "@/lib/mastra/types";
import { formatRemaining, serviceWindow } from "@/lib/whatsapp/window";
import { traceFailed, traceSummary } from "../agent/tool-trace";
import { contactLabel } from "./inbox-view";
import { TemplateComposerModal, type ComposerTemplates } from "./template-composer-modal";

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function StatusTicks({ message }: { message: InboxMessage }) {
  if (message.direction === "inbound") return null;
  if (message.status === "failed") return <span className="text-danger">failed</span>;
  if (message.status === "read") return <span className="text-[#53bdeb]">✓✓</span>;
  if (message.status === "delivered") return <span>✓✓</span>;
  if (message.status === "pending") return <span>🕓</span>;
  return <span>✓</span>;
}

function senderLabel(message: InboxMessage) {
  switch (message.sender_type) {
    case "agent":
      return "AI agent";
    case "staff":
      return message.sent_by ?? "Team";
    case "external":
      return "Sent outside the app";
    default:
      return null;
  }
}

function MessageBubble({ message }: { message: InboxMessage }) {
  const outbound = message.direction === "outbound";
  const trace = Array.isArray(message.tool_trace) ? (message.tool_trace as unknown as AgentTraceEntry[]) : [];
  const label = senderLabel(message);

  return (
    <div className={`flex flex-col gap-0.5 ${outbound ? "items-end" : "items-start"}`}>
      {label ? <span className="px-1 text-[10px] text-neutral-500">{label}</span> : null}
      <div
        className={`max-w-[75%] rounded-xl px-3 py-2 text-sm shadow-sm ${
          outbound ? (message.sender_type === "agent" ? "bg-[#e7f6ff]" : "bg-[#d9fdd3]") : "bg-white"
        }`}
      >
        {message.kind === "template" ? (
          <div className="mb-1 flex items-center gap-1 text-[11px] text-neutral-500">
            <FileText className="size-3" /> Template{message.template_name ? ` · ${message.template_name}` : ""}
          </div>
        ) : null}
        {message.kind === "media" && !message.body ? (
          <span className="italic text-neutral-500">📎 Attachment</span>
        ) : (
          <p className="whitespace-pre-wrap">{message.body}</p>
        )}
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-neutral-500">
          {new Date(message.sent_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          <StatusTicks message={message} />
        </div>
        {message.status === "failed" && message.error ? (
          <p className="mt-1 text-[11px] text-danger">{message.error}</p>
        ) : null}
      </div>
      {trace.length > 0 ? (
        <Disclosure className="max-w-[75%]">
          <Disclosure.Heading>
            <Disclosure.Trigger className="flex items-center gap-1 px-1 text-[11px] text-neutral-500">
              {trace.length} tool call{trace.length === 1 ? "" : "s"}
              <Disclosure.Indicator />
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className="flex flex-col gap-1 rounded-lg bg-white/80 p-2">
              {trace.map((t) => (
                <div key={t.toolCallId} className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono">{t.toolName}</span>
                  <span className={traceFailed(t) ? "text-danger" : "text-neutral-500"}>{traceSummary(t)}</span>
                </div>
              ))}
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>
      ) : null}
    </div>
  );
}

export function ThreadPanel({ thread, autoReplyEnabled }: { thread: InboxThread; autoReplyEnabled: boolean }) {
  const router = useRouter();
  const { conversation, messages } = thread;
  const now = useNow(30_000);
  const win = serviceWindow(conversation.last_inbound_at, now);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [templates, setTemplates] = useState<ComposerTemplates>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setIsSending(true);
    const result = await sendStaffMessage(conversation.id, text);
    setIsSending(false);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    setDraft("");
    router.refresh();
  }

  async function openTemplates() {
    setTemplates(null);
    setIsTemplateOpen(true);
    setTemplates(await getComposerTemplates(conversation.id));
  }

  async function handleAiToggle(enabled: boolean) {
    const result = await setConversationAi(conversation.id, enabled);
    if (result.error) toast.danger(result.error);
    else router.refresh();
  }

  async function handleResolve() {
    const result = await resolveHandoff(conversation.id);
    if (result.error) toast.danger(result.error);
    else router.refresh();
  }

  const aiActive = autoReplyEnabled && conversation.ai_enabled && !conversation.needs_human;

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-5 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">{contactLabel(conversation)}</span>
          <span className="text-xs text-muted">
            {conversation.contact_phone ? formatPhone(conversation.contact_phone) : "Username-only WhatsApp user (no number shared)"}
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {win.open ? (
            <Chip color="success" size="sm" variant="soft">
              24h window open · {formatRemaining(win.remainingMs)} left
            </Chip>
          ) : (
            <Chip color="warning" size="sm" variant="soft">
              {conversation.last_inbound_at ? "24h window closed" : "Contact hasn't messaged yet"} · templates only
            </Chip>
          )}
          <Switch
            isDisabled={!conversation.contact_phone}
            isSelected={conversation.ai_enabled}
            onChange={handleAiToggle}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              AI replies {aiActive ? "on" : conversation.ai_enabled ? "(inactive)" : "paused"}
            </Switch.Content>
          </Switch>
        </div>
      </div>

      {conversation.needs_human ? (
        <div className="flex items-center gap-3 border-b border-danger/20 bg-danger/5 px-5 py-2 text-sm">
          <CircleExclamation className="size-4 shrink-0 text-danger" />
          <span className="min-w-0 flex-1">
            <span className="font-medium">The agent asked for a person:</span> {conversation.handoff_reason ?? "no reason given"}
          </span>
          <Button size="sm" variant="secondary" onPress={handleResolve}>
            Mark handled
          </Button>
        </div>
      ) : null}

      {/* Messages */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-[#efeae2] px-5 py-4">
        {messages.length === 0 ? <p className="m-auto text-xs text-neutral-600">No messages yet.</p> : null}
        {messages.map((message, i) => {
          const showDay = i === 0 || dayLabel(messages[i - 1].sent_at) !== dayLabel(message.sent_at);
          return (
            <div key={message.id} className="flex flex-col gap-2">
              {showDay ? (
                <span className="self-center rounded-md bg-white/80 px-2 py-0.5 text-[11px] text-neutral-600 shadow-sm">
                  {dayLabel(message.sent_at)}
                </span>
              ) : null}
              <MessageBubble message={message} />
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-border/60 bg-white px-4 py-3">
        {win.open ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <TextField aria-label="Reply" className="flex-1" value={draft} onChange={setDraft}>
              <TextArea
                placeholder={aiActive ? "Reply as a team member (pauses the AI for this chat)…" : "Type a reply…"}
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
            </TextField>
            <Button
              isIconOnly
              aria-label="Send template"
              isDisabled={!conversation.contact_phone}
              variant="ghost"
              onPress={openTemplates}
            >
              <FileText className="size-4" />
            </Button>
            <Button isIconOnly aria-label="Send" isDisabled={!draft.trim()} isPending={isSending} type="submit">
              <PaperPlane className="size-4" />
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-muted">
              WhatsApp only allows free-form messages within 24 hours of the contact&apos;s last message. To restart the
              conversation, send an approved template.
            </p>
            <Button isDisabled={!conversation.contact_phone} onPress={openTemplates}>
              <FileText className="size-4" />
              Send a template
            </Button>
          </div>
        )}
      </div>

      <TemplateComposerModal
        conversationId={conversation.id}
        data={templates}
        isOpen={isTemplateOpen}
        onOpenChange={setIsTemplateOpen}
        onSent={() => {
          setIsTemplateOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
