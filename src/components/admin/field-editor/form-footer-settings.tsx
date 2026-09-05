"use client";

import { useRef, useState } from "react";
import { ArrowUpFromLine, Sliders, TrashBin } from "@gravity-ui/icons";
import { Button, toast } from "@heroui/react";
import { deleteFormAsset, updateFormSettings, uploadFormAsset } from "@/lib/actions/forms";
import type { FormSettings } from "@/lib/forms/field-types";

export function FormFooterSettings({
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
  const [isUploading, setIsUploading] = useState(false);
  const [isRepositioning, setIsRepositioning] = useState(false);
  const footerInputRef = useRef<HTMLInputElement>(null);

  const footerUrl = settings.footer_image_url ?? null;
  const footerPositionY = settings.footer_position_y ?? 50;

  async function handleSaveSettings(patch: Partial<FormSettings>) {
    const nextSettings: FormSettings = {
      ...settings,
      ...patch,
    };
    onSettingsChange(nextSettings);
    onSaveStatusChange("saving");

    try {
      await updateFormSettings(formId, patch);
    } catch {
      toast.danger("Couldn't save footer settings.");
    } finally {
      onSaveStatusChange("saved");
    }
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    onSaveStatusChange("saving");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadedUrl = await uploadFormAsset(formId, "footer", null, formData);
      await handleSaveSettings({ footer_image_url: uploadedUrl, footer_position_y: 50 });
      toast.success("Footer image uploaded");
    } catch {
      toast.danger("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      onSaveStatusChange("saved");
      event.target.value = "";
    }
  }

  async function handleRemoveFooter() {
    if (footerUrl) {
      deleteFormAsset(footerUrl);
    }
    await handleSaveSettings({ footer_image_url: null, footer_position_y: null });
    setIsRepositioning(false);
  }

  if (!footerUrl) return null;

  return (
    <div className="relative mt-8 flex flex-col gap-3">
      <input
        ref={footerInputRef}
        accept="image/*"
        className="hidden"
        type="file"
        onChange={handleFileUpload}
      />

      <div className="group relative h-40 w-full overflow-hidden rounded-2xl border border-border bg-slate-100 shadow-xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="Form footer banner"
          className="h-full w-full object-cover transition-all"
          src={footerUrl}
          style={{ objectPosition: `50% ${footerPositionY}%` }}
        />

        {/* Action Overlay */}
        <div className="absolute top-3 right-3 flex items-center gap-2 opacity-80 transition-opacity group-hover:opacity-100 hover:!opacity-100">
          <Button
            size="sm"
            variant="tertiary"
            className={`shadow-xs backdrop-blur-xs ${
              isRepositioning ? "bg-accent text-white hover:bg-accent/90" : "bg-white/90 text-foreground hover:bg-white"
            }`}
            onPress={() => setIsRepositioning((prev) => !prev)}
          >
            <Sliders className="size-4" />
            Reposition
          </Button>
          <Button
            isDisabled={isUploading}
            size="sm"
            variant="tertiary"
            className="bg-white/90 text-foreground shadow-xs backdrop-blur-xs hover:bg-white"
            onPress={() => footerInputRef.current?.click()}
          >
            <ArrowUpFromLine />
            Change footer
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            className="bg-white/90 text-danger shadow-xs backdrop-blur-xs hover:bg-white"
            onPress={handleRemoveFooter}
          >
            <TrashBin />
          </Button>
        </div>

        {/* Ideal dimensions badge on hover */}
        <div className="absolute bottom-2 right-3 opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none">
          <span className="rounded-md bg-black/75 px-2 py-1 text-[10px] font-medium text-white shadow-xs backdrop-blur-xs">
            Ideal: 1500 × 300 px
          </span>
        </div>

        {/* Inline Repositioning Controls */}
        {isRepositioning && (
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3 rounded-xl bg-slate-900/90 p-3 text-xs text-white backdrop-blur-md shadow-lg animate-in fade-in slide-in-from-bottom-2">
            <span className="font-semibold shrink-0">Vertical Position:</span>
            <div className="flex items-center gap-2 flex-1 max-w-xs">
              <input
                type="range"
                min="0"
                max="100"
                value={footerPositionY}
                className="w-full accent-accent h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                onChange={(e) => handleSaveSettings({ footer_position_y: Number(e.target.value) })}
              />
              <span className="font-mono text-[11px] w-8 text-right">{footerPositionY}%</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-medium"
                onClick={() => handleSaveSettings({ footer_position_y: 0 })}
              >
                Top
              </button>
              <button
                type="button"
                className="rounded px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-medium"
                onClick={() => handleSaveSettings({ footer_position_y: 50 })}
              >
                Center
              </button>
              <button
                type="button"
                className="rounded px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-medium"
                onClick={() => handleSaveSettings({ footer_position_y: 100 })}
              >
                Bottom
              </button>
              <Button
                size="sm"
                variant="primary"
                className="ml-2 h-7 text-xs px-2.5"
                onPress={() => setIsRepositioning(false)}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
