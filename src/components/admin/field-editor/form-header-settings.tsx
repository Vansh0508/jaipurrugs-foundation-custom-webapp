"use client";

import { useRef, useState } from "react";
import { ArrowUpFromLine, LayoutHeader, Palette, Picture, TrashBin } from "@gravity-ui/icons";
import {
  Button,
  Input,
  Label,
  Modal,
  Radio,
  RadioGroup,
  TextField,
  toast,
} from "@heroui/react";
import { deleteFormAsset, updateFormSettings, uploadFormAsset } from "@/lib/actions/forms";
import type { BackgroundConfig, FormSettings } from "@/lib/forms/field-types";

const COLOR_PRESETS = [
  "#F8FAFC", // Slate 50
  "#F3F4F6", // Gray 100
  "#FEF3C7", // Amber 100
  "#E0F2FE", // Sky 100
  "#DCFCE7", // Emerald 100
  "#FCE7F3", // Pink 100
  "#F3E8FF", // Purple 100
];

export function FormHeaderSettings({
  formId,
  title,
  settings,
  onTitleChange,
  onSettingsChange,
  onSaveStatusChange,
}: {
  formId: string;
  title: string;
  settings: FormSettings;
  onTitleChange: (value: string) => void;
  onSettingsChange: (newSettings: FormSettings) => void;
  onSaveStatusChange: (status: "saving" | "saved") => void;
}) {
  const [isUploading, setIsUploading] = useState<string | null>(null);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const defaultBgImageInputRef = useRef<HTMLInputElement>(null);

  const logoUrl = settings.logo_url ?? null;
  const coverUrl = settings.cover_image_url ?? null;
  const defaultBg = settings.section_defaults?.background ?? {};

  async function handleSaveSettings(patch: Partial<FormSettings>) {
    const nextSettings: FormSettings = {
      ...settings,
      ...patch,
      section_defaults: patch.section_defaults
        ? {
            ...settings.section_defaults,
            ...patch.section_defaults,
          }
        : settings.section_defaults,
    };

    onSettingsChange(nextSettings);
    onSaveStatusChange("saving");

    try {
      await updateFormSettings(formId, patch);
    } catch {
      toast.danger("Couldn't save visual settings.");
    } finally {
      onSaveStatusChange("saved");
    }
  }

  async function handleFileUpload(
    event: React.ChangeEvent<HTMLInputElement>,
    assetType: "logo" | "cover" | "section_default",
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(assetType);
    onSaveStatusChange("saving");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const targetType = assetType === "section_default" ? "section" : assetType;
      const uploadedUrl = await uploadFormAsset(
        formId,
        targetType,
        assetType === "section_default" ? "default" : null,
        formData,
      );

      if (assetType === "logo") {
        await handleSaveSettings({ logo_url: uploadedUrl });
      } else if (assetType === "cover") {
        await handleSaveSettings({ cover_image_url: uploadedUrl });
      } else if (assetType === "section_default") {
        await handleSaveSettings({
          section_defaults: {
            background: { type: "image", image_url: uploadedUrl },
          },
        });
      }
      toast.success("Image uploaded successfully");
    } catch {
      toast.danger("Upload failed. Please try again.");
    } finally {
      setIsUploading(null);
      onSaveStatusChange("saved");
      event.target.value = "";
    }
  }

  async function handleRemoveLogo() {
    if (logoUrl) {
      deleteFormAsset(logoUrl);
    }
    await handleSaveSettings({ logo_url: null });
  }

  async function handleRemoveCover() {
    if (coverUrl) {
      deleteFormAsset(coverUrl);
    }
    await handleSaveSettings({ cover_image_url: null });
  }

  function handleDefaultBgTypeChange(type: "none" | "color" | "image") {
    let nextBg: BackgroundConfig | undefined;
    if (type === "color") {
      nextBg = { type: "color", color: defaultBg.color ?? "#F8FAFC" };
    } else if (type === "image") {
      nextBg = { type: "image", image_url: defaultBg.image_url ?? "" };
    } else {
      nextBg = { type: undefined };
    }
    handleSaveSettings({ section_defaults: { background: nextBg } });
  }

  return (
    <div className="relative mb-6 flex flex-col gap-4">
      {/* Hidden Native File Inputs */}
      <input
        ref={logoInputRef}
        accept="image/*"
        className="hidden"
        type="file"
        onChange={(e) => handleFileUpload(e, "logo")}
      />
      <input
        ref={coverInputRef}
        accept="image/*"
        className="hidden"
        type="file"
        onChange={(e) => handleFileUpload(e, "cover")}
      />

      {/* Cover Image Banner (Tally Style) */}
      {coverUrl ? (
        <div className="group relative h-48 w-full overflow-hidden rounded-2xl border border-border bg-slate-100 shadow-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Form cover banner" className="h-full w-full object-cover" src={coverUrl} />
          <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              isDisabled={isUploading === "cover"}
              size="sm"
              variant="tertiary"
              className="bg-white/90 text-foreground shadow-xs backdrop-blur-xs hover:bg-white"
              onPress={() => coverInputRef.current?.click()}
            >
              <ArrowUpFromLine />
              Change cover
            </Button>
            <Button
              size="sm"
              variant="tertiary"
              className="bg-white/90 text-danger shadow-xs backdrop-blur-xs hover:bg-white"
              onPress={handleRemoveCover}
            >
              <TrashBin />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Logo & Document Header Section */}
      <div className="flex flex-col gap-3">
        {/* Logo Widget (Tally Style) */}
        {logoUrl ? (
          <div className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-border bg-white p-1.5 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Form logo" className="h-full w-full object-contain" src={logoUrl} />
            <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                isIconOnly
                size="sm"
                variant="tertiary"
                className="bg-white/90 text-foreground shadow-xs hover:bg-white"
                onPress={() => logoInputRef.current?.click()}
              >
                <ArrowUpFromLine />
              </Button>
              <Button
                isIconOnly
                size="sm"
                variant="tertiary"
                className="bg-white/90 text-danger shadow-xs hover:bg-white"
                onPress={handleRemoveLogo}
              >
                <TrashBin />
              </Button>
            </div>
          </div>
        ) : null}

        {/* Tally Action Bar (Add Logo, Add Cover, Customize) */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {!logoUrl && (
            <Button
              isDisabled={isUploading === "logo"}
              size="sm"
              variant="tertiary"
              className="bg-slate-100/80 hover:bg-slate-200/80 text-foreground font-medium rounded-lg px-3"
              onPress={() => logoInputRef.current?.click()}
            >
              <Picture />
              Add logo
            </Button>
          )}
          {!coverUrl && (
            <Button
              isDisabled={isUploading === "cover"}
              size="sm"
              variant="tertiary"
              className="bg-slate-100/80 hover:bg-slate-200/80 text-foreground font-medium rounded-lg px-3"
              onPress={() => coverInputRef.current?.click()}
            >
              <LayoutHeader />
              Add cover
            </Button>
          )}
          <Button
            size="sm"
            variant="tertiary"
            className="bg-slate-100/80 hover:bg-slate-200/80 text-foreground font-medium rounded-lg px-3"
            onPress={() => setIsCustomizeOpen(true)}
          >
            <Palette />
            Customize
          </Button>
        </div>

        {/* Large Inline Document Title */}
        <TextField aria-label="Form title" className="w-full" value={title} onChange={onTitleChange}>
          <Input
            className="w-full border-none bg-transparent px-0 py-1 text-3xl font-bold tracking-tight text-foreground shadow-none focus:outline-none focus:ring-0 placeholder:text-muted/40"
            placeholder="Untitled form"
          />
        </TextField>
      </div>

      {/* Customize Form Background Modal */}
      {isCustomizeOpen && (
        <Modal isOpen onOpenChange={(open) => setIsCustomizeOpen(open)}>
          <Modal.Backdrop>
            <Modal.Container>
              <Modal.Dialog className="sm:max-w-[440px]">
                <Modal.CloseTrigger />
                <Modal.Header>
                  <Modal.Heading>Customize Section Styling</Modal.Heading>
                </Modal.Header>
                <Modal.Body className="flex flex-col gap-4 py-2">
                  <div className="flex flex-col gap-3">
                    <Label className="text-xs font-semibold">Default Section Background</Label>
                    <RadioGroup
                      className="flex flex-row gap-4 text-xs"
                      value={defaultBg.type ?? "none"}
                      onChange={(val) => handleDefaultBgTypeChange(val as "none" | "color" | "image")}
                    >
                      <Radio value="none">None</Radio>
                      <Radio value="color">Color</Radio>
                      <Radio value="image">Image</Radio>
                    </RadioGroup>

                    {defaultBg.type === "color" && (
                      <div className="flex flex-col gap-2 pt-2">
                        <div className="flex items-center gap-2">
                          <TextField
                            aria-label="Hex color"
                            className="flex-1"
                            value={defaultBg.color ?? "#F8FAFC"}
                            onChange={(color) =>
                              handleSaveSettings({
                                section_defaults: {
                                  background: { type: "color", color },
                                },
                              })
                            }
                          >
                            <Input placeholder="#F8FAFC" />
                          </TextField>
                          <div
                            className="h-9 w-9 rounded-lg border border-border shadow-xs"
                            style={{ backgroundColor: defaultBg.color ?? "#F8FAFC" }}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 pt-1">
                          {COLOR_PRESETS.map((hex) => (
                            <button
                              key={hex}
                              aria-label={`Select color ${hex}`}
                              className="h-6 w-6 rounded-md border border-border transition-transform hover:scale-110"
                              style={{ backgroundColor: hex }}
                              type="button"
                              onClick={() =>
                                handleSaveSettings({
                                  section_defaults: {
                                    background: { type: "color", color: hex },
                                  },
                                })
                              }
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {defaultBg.type === "image" && (
                      <div className="flex flex-col gap-2 pt-2">
                        <input
                          ref={defaultBgImageInputRef}
                          accept="image/*"
                          className="hidden"
                          type="file"
                          onChange={(e) => handleFileUpload(e, "section_default")}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            isDisabled={isUploading === "section_default"}
                            size="sm"
                            variant="tertiary"
                            onPress={() => defaultBgImageInputRef.current?.click()}
                          >
                            <ArrowUpFromLine />
                            {defaultBg.image_url ? "Change Default Image" : "Upload Default Image"}
                          </Button>
                          {defaultBg.image_url && (
                            <Button
                              size="sm"
                              variant="tertiary"
                              onPress={() =>
                                handleSaveSettings({
                                  section_defaults: { background: { type: undefined } },
                                })
                              }
                            >
                              <TrashBin />
                            </Button>
                          )}
                        </div>
                        {defaultBg.image_url && (
                          <div className="relative h-20 w-full overflow-hidden rounded-lg border border-border bg-slate-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img alt="Default section background" className="h-full w-full object-cover" src={defaultBg.image_url} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="primary" onPress={() => setIsCustomizeOpen(false)}>
                    Done
                  </Button>
                </Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      )}
    </div>
  );
}
