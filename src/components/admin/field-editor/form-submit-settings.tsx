"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRightFromSquare,
  CircleCheck,
  Globe,
  Pencil,
  Sliders,
} from "@gravity-ui/icons";
import { Button, Input, Label, TextField, toast } from "@heroui/react";
import { updateFormSettings } from "@/lib/actions/forms";
import type { FormSettings } from "@/lib/forms/field-types";

const SAVE_DEBOUNCE_MS = 600;

export function FormSubmitSettings({
  formId,
  settings,
  onSettingsChange,
  onSaveStatusChange,
}: {
  formId: string;
  settings: FormSettings;
  onSettingsChange: (newSettings: FormSettings) => void;
  onSaveStatusChange: (status: "saving" | "saved") => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Local form state
  const [buttonText, setButtonText] = useState(settings.submit_button_text ?? "Submit");
  const [submitAction, setSubmitAction] = useState<"message" | "redirect">(
    settings.submit_action ?? "message",
  );
  const [successTitle, setSuccessTitle] = useState(
    settings.success_title ?? "Form Completed",
  );
  const [successMessage, setSuccessMessage] = useState(
    settings.success_message ?? "Thank you! Your submission has been received.",
  );
  const [redirectUrl, setRedirectUrl] = useState(settings.redirect_url ?? "");
  const [redirectDelay, setRedirectDelay] = useState<number>(
    settings.redirect_delay_seconds ?? 1.5,
  );

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local state in sync if external settings change
  useEffect(() => {
    if (settings.submit_button_text !== undefined && settings.submit_button_text !== null) {
      setButtonText(settings.submit_button_text);
    }
    if (settings.submit_action) {
      setSubmitAction(settings.submit_action);
    }
    if (settings.success_title) {
      setSuccessTitle(settings.success_title);
    }
    if (settings.success_message) {
      setSuccessMessage(settings.success_message);
    }
    if (settings.redirect_url !== undefined && settings.redirect_url !== null) {
      setRedirectUrl(settings.redirect_url);
    }
    if (settings.redirect_delay_seconds !== undefined && settings.redirect_delay_seconds !== null) {
      setRedirectDelay(settings.redirect_delay_seconds);
    }
  }, [settings]);

  function queueSave(patch: Partial<FormSettings>) {
    const nextSettings: FormSettings = {
      ...settings,
      ...patch,
    };
    onSettingsChange(nextSettings);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      onSaveStatusChange("saving");
      try {
        await updateFormSettings(formId, patch);
      } catch {
        toast.danger("Couldn't save submit button settings.");
      } finally {
        onSaveStatusChange("saved");
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function handleButtonTextChange(val: string) {
    setButtonText(val);
    queueSave({ submit_button_text: val.trim() || "Submit" });
  }

  function handleActionChange(action: "message" | "redirect") {
    setSubmitAction(action);
    queueSave({ submit_action: action });
  }

  function handleSuccessTitleChange(val: string) {
    setSuccessTitle(val);
    queueSave({ success_title: val });
  }

  function handleSuccessMessageChange(val: string) {
    setSuccessMessage(val);
    queueSave({ success_message: val });
  }

  function handleRedirectUrlChange(val: string) {
    setRedirectUrl(val);
    queueSave({ redirect_url: val });
  }

  function handleRedirectDelayChange(delaySec: number) {
    setRedirectDelay(delaySec);
    queueSave({ redirect_delay_seconds: delaySec });
  }

  return (
    <div className="relative mt-4 flex flex-col rounded-2xl border border-border/80 bg-white p-5 shadow-xs transition-all">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CircleCheck className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Submit Button & Completion</h3>
            <p className="text-xs text-muted">
              Customize how the button looks and what happens after a user submits.
            </p>
          </div>
        </div>

        <Button
          size="sm"
          variant={isOpen ? "primary" : "tertiary"}
          className="gap-1.5 text-xs font-medium"
          onPress={() => setIsOpen((prev) => !prev)}
        >
          <Sliders className="size-3.5" />
          {isOpen ? "Close Settings" : "Configure Submit"}
        </Button>
      </div>

      {/* Button Preview Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="group relative inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-xs transition-all hover:bg-primary/90 active:scale-[0.99] cursor-pointer"
            title="Click to configure submit button"
          >
            <span>{buttonText || "Submit"}</span>
            <Pencil className="size-3.5 opacity-60 transition-opacity group-hover:opacity-100" />
          </button>
          <span className="text-xs text-muted">
            (Interactive preview — click to edit)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {submitAction === "redirect" ? (
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 border border-sky-200">
              <ArrowUpRightFromSquare className="size-3" />
              <span>Redirects to:</span>
              <span className="max-w-[200px] truncate font-mono text-[11px]">
                {redirectUrl || "Not configured"}
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
              <CircleCheck className="size-3" />
              <span>Displays thank-you message</span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Settings Panel */}
      {isOpen && (
        <div className="mt-2 flex flex-col gap-5 border-t border-border/60 pt-4 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Button Text Config */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold text-foreground">Button Label</Label>
            <Input
              value={buttonText}
              placeholder="Submit (e.g. Register, Complete Application, Send Response)"
              className="max-w-md text-sm"
              onChange={(e) => handleButtonTextChange(e.target.value)}
            />
            <p className="text-[11px] text-muted">
              The text displayed on the submission button at the end of the form.
            </p>
          </div>

          {/* Action After Submission Selector */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold text-foreground">After Submission Action</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              {/* Option 1: Show Message */}
              <button
                type="button"
                onClick={() => handleActionChange("message")}
                className={`flex flex-col gap-1 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                  submitAction === "message"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border/80 bg-white hover:border-border hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-semibold ${
                      submitAction === "message"
                        ? "bg-primary text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    💬
                  </div>
                  <span className="text-xs font-semibold text-foreground">
                    Display Thank You Message
                  </span>
                </div>
              </button>

              {/* Option 2: External Redirect */}
              <button
                type="button"
                onClick={() => handleActionChange("redirect")}
                className={`flex flex-col gap-1 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                  submitAction === "redirect"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border/80 bg-white hover:border-border hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-semibold ${
                      submitAction === "redirect"
                        ? "bg-primary text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <Globe className="size-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">
                    Redirect to External URL
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Conditional Sub-settings */}
          {submitAction === "message" ? (
            <div className="flex flex-col gap-3 rounded-xl bg-slate-50/70 p-4 border border-border/60 max-w-xl">
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-foreground">Confirmation Title</Label>
                <Input
                  value={successTitle}
                  placeholder="Form Completed"
                  className="bg-white text-sm"
                  onChange={(e) => handleSuccessTitleChange(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-foreground">Confirmation Message</Label>
                <textarea
                  value={successMessage}
                  rows={2}
                  placeholder="Thank you! Your submission has been received."
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  onChange={(e) => handleSuccessMessageChange(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5 rounded-xl bg-slate-50/70 p-4 border border-border/60 max-w-xl">
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-foreground">
                  Redirect Destination URL
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={redirectUrl}
                    placeholder="https://example.com/thank-you"
                    className="bg-white text-sm flex-1 font-mono text-xs"
                    onChange={(e) => handleRedirectUrlChange(e.target.value)}
                  />
                  {redirectUrl && (
                    <a
                      href={redirectUrl.startsWith("http") ? redirectUrl : `https://${redirectUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline px-2"
                    >
                      <ArrowUpRightFromSquare className="size-3" />
                      Test Link
                    </a>
                  )}
                </div>
                <p className="text-[11px] text-muted">
                  Must include <code className="bg-slate-200/70 px-1 rounded">https://</code> or{" "}
                  <code className="bg-slate-200/70 px-1 rounded">http://</code>
                </p>
              </div>

              <div className="flex flex-col gap-1.5 pt-1">
                <Label className="text-xs font-medium text-foreground">Redirect Timing</Label>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={redirectDelay === 0 ? "primary" : "tertiary"}
                    className="h-7 text-xs"
                    onPress={() => handleRedirectDelayChange(0)}
                  >
                    Immediate Redirect (0s)
                  </Button>
                  <Button
                    size="sm"
                    variant={redirectDelay > 0 ? "primary" : "tertiary"}
                    className="h-7 text-xs"
                    onPress={() => handleRedirectDelayChange(1.5)}
                  >
                    Show Confirmation (1.5s) then Redirect
                  </Button>
                </div>
                <p className="text-[11px] text-muted">
                  {redirectDelay === 0
                    ? "Respondents are immediately redirected once the submission is saved."
                    : "Respondents see a brief completion notice before being automatically redirected."}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
