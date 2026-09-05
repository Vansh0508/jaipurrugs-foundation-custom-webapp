"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRightFromSquare, Check, Copy, Link as LinkIcon, TriangleExclamation } from "@gravity-ui/icons";
import { Button, toast } from "@heroui/react";
import { checkSlugAvailability, updateFormSlug } from "@/lib/actions/forms";
import { sanitizeSlug } from "@/lib/forms/slug";

const CHECK_DEBOUNCE_MS = 350;

export function FormSlugEditor({
  formId,
  slug,
  onSlugChange,
  onSaveStatusChange,
}: {
  formId: string;
  slug: string;
  onSlugChange: (newSlug: string) => void;
  onSaveStatusChange: (status: "saving" | "saved") => void;
}) {
  const [localSlug, setLocalSlug] = useState(slug);
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "duplicate" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Sync external changes (e.g. auto-derived from form title)
  useEffect(() => {
    setLocalSlug(slug);
    setStatus("idle");
    setErrorMessage(null);
  }, [slug]);

  function handleChange(val: string) {
    const candidate = val.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
    setLocalSlug(candidate);

    if (timerRef.current) clearTimeout(timerRef.current);

    const clean = sanitizeSlug(candidate);
    if (!clean) {
      setStatus("error");
      setErrorMessage("Slug cannot be empty.");
      return;
    }

    if (clean === slug) {
      setStatus("idle");
      setErrorMessage(null);
      return;
    }

    setStatus("checking");
    setErrorMessage(null);

    timerRef.current = setTimeout(async () => {
      try {
        const check = await checkSlugAvailability(formId, clean);
        if (!check.available) {
          setStatus("duplicate");
          setErrorMessage(check.reason || "This link is already taken by another form.");
        } else {
          setStatus("available");
          setErrorMessage(null);
          onSaveStatusChange("saving");
          await updateFormSlug(formId, clean);
          onSlugChange(clean);
          onSaveStatusChange("saved");
        }
      } catch (err: unknown) {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Failed to validate slug.");
      }
    }, CHECK_DEBOUNCE_MS);
  }

  async function handleCopy() {
    const fullUrl = `${origin}/f/${localSlug || slug}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(fullUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = fullUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      toast.success("Public link copied");
    } catch {
      toast.danger("Couldn't copy link");
    }
  }

  return (
    <div className="flex flex-col gap-1.5 pt-0.5 pb-1">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* URL Pill Container */}
        <div
          className={`flex items-center rounded-lg border bg-slate-50/80 px-2.5 py-1 transition-all ${
            status === "duplicate" || status === "error"
              ? "border-danger bg-danger-50/40 text-danger"
              : status === "available"
              ? "border-success bg-success-50/30 text-foreground"
              : "border-border text-muted hover:border-slate-300"
          }`}
        >
          <LinkIcon className="size-3.5 shrink-0 text-muted/80 mr-1.5" />
          <span className="select-none font-mono text-muted/70">{origin ? `${origin}/f/` : "/f/"}</span>
          <input
            aria-label="Custom URL slug"
            className="font-mono font-medium text-foreground bg-transparent outline-none min-w-[120px] max-w-[280px]"
            value={localSlug}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="your-form-link"
          />

          {status === "checking" && (
            <span className="ml-1.5 text-[11px] text-muted animate-pulse">Checking…</span>
          )}
          {status === "available" && (
            <span className="ml-1.5 flex items-center gap-1 text-[11px] font-medium text-success">
              <Check className="size-3" /> Saved
            </span>
          )}
          {(status === "duplicate" || status === "error") && (
            <span className="ml-1.5 flex items-center gap-1 text-[11px] font-medium text-danger">
              <TriangleExclamation className="size-3" /> Taken
            </span>
          )}
        </div>

        {/* Quick Actions */}
        <Button
          aria-label="Copy public link"
          isIconOnly
          size="sm"
          variant="tertiary"
          className="h-7 w-7 text-muted hover:text-foreground border border-border bg-white shadow-2xs"
          onPress={handleCopy}
        >
          <Copy className="size-3.5" />
        </Button>

        <a
          aria-label="Open public form in new tab"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-white text-muted shadow-2xs transition-colors hover:text-foreground"
          href={`/f/${localSlug || slug}`}
          rel="noreferrer"
          target="_blank"
          title="Open in new tab"
        >
          <ArrowUpRightFromSquare className="size-3.5" />
        </a>
      </div>

      {/* Real-Time Duplicate Warning Message */}
      {(status === "duplicate" || status === "error") && errorMessage && (
        <p className="flex items-center gap-1 text-[11px] font-medium text-danger animate-in fade-in slide-in-from-top-1">
          <TriangleExclamation className="size-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </p>
      )}
    </div>
  );
}
