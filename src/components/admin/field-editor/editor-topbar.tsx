"use client";

import { Eye, Link as LinkIcon } from "@gravity-ui/icons";
import { Button, Chip, Input, TextField, toast } from "@heroui/react";
import type { Enums } from "@/lib/types/supabase";
import { FormNavTabs } from "./form-nav-tabs";

type FormStatus = Enums<"form_status">;

const STATUS_COLOR: Record<FormStatus, "default" | "success" | "warning"> = {
  draft: "default",
  published: "success",
  archived: "warning",
};

export function EditorTopBar({
  formId,
  title,
  slug,
  status,
  shareToken,
  saveStatus,
  onTitleChange,
  onTogglePublish,
}: {
  formId: string;
  title: string;
  slug: string;
  status: FormStatus;
  shareToken: string;
  saveStatus: "saving" | "saved";
  onTitleChange: (value: string) => void;
  onTogglePublish: () => void;
}) {
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/f/${slug || shareToken}` : "";

  async function handleCopyLink() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(publicUrl);
      } else {
        // Clipboard API is unavailable on non-secure origins (plain HTTP on a
        // non-localhost host) -- fall back to the legacy execCommand approach.
        const textarea = document.createElement("textarea");
        textarea.value = publicUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!ok) throw new Error("execCommand copy failed");
      }
      toast.success("Link copied");
    } catch {
      toast.danger("Couldn't copy the link");
    }
  }

  return (
    <div className="sticky top-0 z-30 flex flex-col gap-3 border-b border-border bg-white px-8 pt-6 pb-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <a className="text-sm font-medium text-muted hover:text-foreground" href="/forms">
            Forms
          </a>
          <span className="text-muted">/</span>
          <span className="truncate text-sm font-semibold text-foreground max-w-48">
            {title || "Untitled form"}
          </span>
          <Chip color={STATUS_COLOR[status]} size="sm">
            {status}
          </Chip>
          <span className="text-xs text-muted">{saveStatus === "saving" ? "Saving…" : "Saved"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Plain anchor styled via HeroUI's BEM classes — Button's `render`
              override expects a <button>, not an <a>; see the edit shell's
              "Back to forms" link for the same pattern. */}
          <a
            className="button button--tertiary button--sm inline-flex items-center gap-2"
            href={`/f/${slug || shareToken}`}
            rel="noreferrer"
            target="_blank"
          >
            <Eye />
            Preview
          </a>
          <Button size="sm" variant="tertiary" onPress={handleCopyLink}>
            <LinkIcon />
            Copy link
          </Button>
          <Button size="sm" variant={status === "published" ? "secondary" : "primary"} onPress={onTogglePublish}>
            {status === "published" ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </div>
      <FormNavTabs formId={formId} />
    </div>
  );
}
