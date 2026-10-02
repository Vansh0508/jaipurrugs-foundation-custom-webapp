"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PaperPlane, Plus, Smartphone, TrashBin } from "@gravity-ui/icons";
import { Button, Chip, Input, Label, Spinner, Switch, TextField, toast } from "@heroui/react";
import {
  createAgentSession,
  deleteAgentSession,
  getAgentSessionMessages,
  getPhoneSubmissionCount,
  sendAgentMessage,
} from "@/lib/actions/agent";
import { formatPhone, normalizePhone } from "@/lib/mastra/phone";
import type { AgentChatMessage, AgentSession, AgentStatus } from "@/lib/mastra/types";
import { templateCardsIn } from "./tool-trace";
import { ToolTracePanel } from "./tool-trace-panel";

const PHONE_PRESETS = [
  { label: "Sample artisan", phone: "+91 98765 00001" },
  { label: "Sample field coordinator", phone: "+91 98765 00002" },
];

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function ChatSimulator({
  status,
  initialSessions,
  initialMessages,
  initialSubmissionCount,
}: {
  status: AgentStatus;
  initialSessions: AgentSession[];
  /** History of initialSessions[0], rendered on the server. */
  initialMessages: AgentChatMessage[];
  initialSubmissionCount: number | null;
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [activeId, setActiveId] = useState<string | null>(initialSessions[0]?.id ?? null);
  const [messages, setMessages] = useState<AgentChatMessage[]>(initialMessages);
  const [selectedReplyId, setSelectedReplyId] = useState<string | null>(null);
  const [submissionCount, setSubmissionCount] = useState<number | null>(initialSubmissionCount);
  const [phoneInput, setPhoneInput] = useState(PHONE_PRESETS[0].phone);
  const [draft, setDraft] = useState("");
  const [liveSend, setLiveSend] = useState(false);
  const [isLoading, startLoading] = useTransition();
  const [isSending, setIsSending] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;
  const selectedReply =
    messages.find((m) => m.id === selectedReplyId) ??
    [...messages].reverse().find((m) => m.role === "assistant") ??
    null;

  function openSession(session: AgentSession | null) {
    setActiveId(session?.id ?? null);
    setSelectedReplyId(null);
    setMessages([]);
    setSubmissionCount(null);
    if (!session) return;
    startLoading(async () => {
      const [history, count] = await Promise.all([
        getAgentSessionMessages(session.id),
        getPhoneSubmissionCount(session.phoneNumber),
      ]);
      setMessages(history);
      setSubmissionCount(count);
    });
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, isSending]);

  async function handleStartSession() {
    if (!normalizePhone(phoneInput)) {
      toast.danger("Enter a valid phone number (at least 10 digits).");
      return;
    }
    setIsCreating(true);
    const result = await createAgentSession(phoneInput);
    setIsCreating(false);
    if (result.error || !result.session) {
      toast.danger(result.error ?? "Could not start a session.");
      return;
    }
    setSessions((prev) => [result.session!, ...prev]);
    openSession(result.session);
  }

  async function handleDeleteSession(id: string) {
    const result = await deleteAgentSession(id);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeId === id) openSession(null);
  }

  async function handleSend() {
    const content = draft.trim();
    if (!content || !activeSession || isSending) return;

    const optimistic: AgentChatMessage = {
      id: `pending-${crypto.randomUUID()}`,
      role: "user",
      content,
      toolTrace: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    setIsSending(true);

    const result = await sendAgentMessage({ sessionId: activeSession.id, content, liveSend });
    setIsSending(false);

    setMessages((prev) => [
      ...prev.filter((m) => m.id !== optimistic.id),
      ...(result.userMessage ? [result.userMessage] : []),
      ...(result.assistantMessage ? [result.assistantMessage] : []),
    ]);
    if (result.assistantMessage) setSelectedReplyId(result.assistantMessage.id);
    if (result.error) {
      toast.danger(result.error);
      if (!result.userMessage) setDraft(content);
    }

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? { ...s, title: s.title ?? content.slice(0, 80), updatedAt: new Date().toISOString() }
          : s,
      ),
    );
  }

  return (
    <div className="flex h-full min-h-[560px] flex-col gap-4">
      {/* Contact context bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/70 bg-neutral-50 p-4">
        <TextField className="w-60" value={phoneInput} onChange={setPhoneInput}>
          <Label>Test WhatsApp number</Label>
          <Input placeholder="+91 98765 43210" />
        </TextField>
        <div className="flex flex-wrap gap-1.5 pb-1">
          {PHONE_PRESETS.map((preset) => (
            <Button
              key={preset.phone}
              size="sm"
              variant={phoneInput === preset.phone ? "secondary" : "ghost"}
              onPress={() => setPhoneInput(preset.phone)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <Button isPending={isCreating} onPress={handleStartSession}>
          <Plus className="size-4" />
          New session
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-2 pb-1">
          <Chip color={status.openaiConfigured ? "success" : "danger"} size="sm" variant="soft">
            {status.openaiConfigured ? status.model : "OPENAI_API_KEY missing"}
          </Chip>
          <Chip color={status.whatsapp.configured ? "success" : "warning"} size="sm" variant="soft">
            {status.whatsapp.configured
              ? `WhatsApp: ${status.whatsapp.accountLabel ?? "connected"}`
              : "WhatsApp not connected"}
          </Chip>
          <Switch
            isDisabled={!status.whatsapp.configured}
            isSelected={liveSend}
            onChange={setLiveSend}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              Live send
            </Switch.Content>
          </Switch>
        </div>
        {liveSend ? (
          <p className="w-full text-xs text-danger">
            Live send is on: templates the agent sends are really delivered to{" "}
            {activeSession ? formatPhone(activeSession.phoneNumber) : "the session's number"} via Zernio.
            Only use numbers you own.
          </p>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
        {/* Sessions */}
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          <h2 className="px-1 pb-1 text-sm font-semibold">Sessions</h2>
          {sessions.length === 0 ? (
            <p className="px-1 text-xs text-muted">No sessions yet. Pick a number and start one.</p>
          ) : null}
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${
                session.id === activeId ? "bg-neutral-100 font-medium" : "hover:bg-neutral-50"
              }`}
            >
              <button
                className="flex min-w-0 flex-1 flex-col text-left"
                onClick={() => session.id !== activeId && openSession(session)}
                type="button"
              >
                <span className="truncate">{formatPhone(session.phoneNumber)}</span>
                <span className="truncate text-xs font-normal text-muted">
                  {session.title ?? "New conversation"}
                </span>
              </button>
              <Button
                isIconOnly
                aria-label="Delete session"
                className="opacity-0 group-hover:opacity-100"
                size="sm"
                variant="ghost"
                onPress={() => handleDeleteSession(session.id)}
              >
                <TrashBin className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {/* WhatsApp-style chat */}
        <div className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-border/70">
          <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <Smartphone className="size-4 text-muted" />
              <span className="text-sm font-medium">
                {activeSession ? formatPhone(activeSession.phoneNumber) : "No session selected"}
              </span>
            </div>
            {activeSession ? (
              <span className="text-xs text-muted">
                {submissionCount === null
                  ? "Checking submissions…"
                  : `${submissionCount} linked submission${submissionCount === 1 ? "" : "s"}`}
              </span>
            ) : null}
          </div>

          <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-y-auto bg-[#efeae2] p-4">
            {isLoading ? (
              <div className="flex flex-1 items-center justify-center">
                <Spinner size="sm" />
              </div>
            ) : null}
            {!isLoading && activeSession && messages.length === 0 ? (
              <p className="m-auto max-w-xs text-center text-xs text-neutral-600">
                Send a message as this contact — e.g. &ldquo;What forms have I submitted?&rdquo; or
                &ldquo;How do I apply for a scheme?&rdquo;
              </p>
            ) : null}
            {messages.map((message) => {
              const isUser = message.role === "user";
              const isSelected = !isUser && selectedReply?.id === message.id;
              return (
                <div key={message.id} className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
                  <button
                    className={`max-w-[80%] whitespace-pre-wrap rounded-xl px-3 py-2 text-left text-sm shadow-sm ${
                      isUser ? "bg-[#d9fdd3]" : "bg-white"
                    } ${isSelected ? "ring-2 ring-accent/40" : ""}`}
                    disabled={isUser}
                    onClick={() => setSelectedReplyId(message.id)}
                    type="button"
                  >
                    {message.content}
                    <span className="mt-1 block text-right text-[10px] text-neutral-500">
                      {formatTime(message.createdAt)}
                      {!isUser && message.toolTrace.length > 0
                        ? ` · ${message.toolTrace.length} tool call${message.toolTrace.length === 1 ? "" : "s"}`
                        : ""}
                    </span>
                  </button>
                  {templateCardsIn(message.toolTrace).map((card, i) => (
                    <div
                      key={i}
                      className="max-w-[80%] rounded-xl border border-dashed border-neutral-400 bg-white/80 px-3 py-2 text-sm"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="font-mono text-xs">{card.templateName}</span>
                        <Chip color={card.sent ? "success" : "warning"} size="sm" variant="soft">
                          {card.sent ? "Sent" : "Preview — not sent"}
                        </Chip>
                      </div>
                      <p className="whitespace-pre-wrap text-neutral-700">{card.preview}</p>
                    </div>
                  ))}
                </div>
              );
            })}
            {isSending ? (
              <div className="flex items-center gap-2 self-start rounded-xl bg-white px-3 py-2 text-xs text-muted shadow-sm">
                <Spinner size="sm" /> Agent is thinking…
              </div>
            ) : null}
          </div>

          <form
            className="flex items-end gap-2 border-t border-border/70 bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <TextField
              aria-label="Message"
              className="flex-1"
              isDisabled={!activeSession || !status.openaiConfigured}
              value={draft}
              onChange={setDraft}
            >
              <Input placeholder={activeSession ? "Type a message as the contact…" : "Start a session first"} />
            </TextField>
            <Button
              isIconOnly
              aria-label="Send"
              isDisabled={!activeSession || !draft.trim() || !status.openaiConfigured}
              isPending={isSending}
              type="submit"
            >
              <PaperPlane className="size-4" />
            </Button>
          </form>
        </div>

        {/* Tool trace */}
        <ToolTracePanel trace={selectedReply ? selectedReply.toolTrace : null} />
      </div>
    </div>
  );
}
