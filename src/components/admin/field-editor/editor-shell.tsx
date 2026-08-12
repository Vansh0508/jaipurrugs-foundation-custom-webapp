"use client";

import { useRef, useState } from "react";
import { toast } from "@heroui/react";
import { setFormStatus, updateFormTitle } from "@/lib/actions/forms";
import type { FormSettings } from "@/lib/forms/field-types";
import type { Enums, Tables } from "@/lib/types/supabase";
import { EditorCanvas } from "./editor-canvas";
import type { FieldRow } from "./field-card";
import { EditorTopBar } from "./editor-topbar";
import { FormHeaderSettings } from "./form-header-settings";

const TITLE_DEBOUNCE_MS = 900;

// Owns the state shared between the sticky top bar (title/status/save
// indicator) and the field canvas below it — see
// docs/phases/03-field-registry-editor.md.
export function EditorShell({
  form,
  initialFields,
}: {
  form: Pick<Tables<"forms">, "id" | "title" | "status" | "share_token" | "settings">;
  initialFields: FieldRow[];
}) {
  const [title, setTitle] = useState(form.title);
  const [status, setStatus] = useState<Enums<"form_status">>(form.status);
  const [settings, setSettings] = useState<FormSettings>((form.settings as FormSettings) ?? {});
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved">("saved");
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleTitleChange(value: string) {
    setTitle(value);
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(() => {
      setSaveStatus("saving");
      updateFormTitle(form.id, value)
        .catch(() => toast.danger("Couldn't save the title."))
        .finally(() => setSaveStatus("saved"));
    }, TITLE_DEBOUNCE_MS);
  }

  function handleTogglePublish() {
    const next = status === "published" ? "draft" : "published";
    setStatus(next);
    setSaveStatus("saving");
    setFormStatus(form.id, next)
      .then(() => toast.success(next === "published" ? "Form published" : "Form unpublished"))
      .catch(() => {
        toast.danger("Couldn't update the form status.");
        setStatus(status);
      })
      .finally(() => setSaveStatus("saved"));
  }

  return (
    <div className="flex flex-col gap-6">
      <EditorTopBar
        formId={form.id}
        saveStatus={saveStatus}
        shareToken={form.share_token}
        status={status}
        title={title}
        onTitleChange={handleTitleChange}
        onTogglePublish={handleTogglePublish}
      />
      <FormHeaderSettings
        formId={form.id}
        settings={settings}
        title={title}
        onSaveStatusChange={setSaveStatus}
        onSettingsChange={setSettings}
        onTitleChange={handleTitleChange}
      />
      <EditorCanvas
        defaultSectionBackground={settings.section_defaults?.background}
        formId={form.id}
        initialFields={initialFields}
        onSaveStatusChange={setSaveStatus}
      />
    </div>
  );
}
