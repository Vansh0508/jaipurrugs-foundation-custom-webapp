"use client";

import { useRef, useState } from "react";
import { ArrowUpFromLine, LayoutHeader, Picture, Sliders, TrashBin, Xmark } from "@gravity-ui/icons";
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
import { AssetPickerModal } from "./asset-picker-modal";

const COLOR_PRESETS = [
  "#F8FAFC", // Slate 50
  "#F3F4F6", // Gray 100
  "#FEF3C7", // Amber 100
  "#E0F2FE", // Sky 100
  "#DCFCE7", // Emerald 100
  "#FCE7F3", // Pink 100
  "#F3E8FF", // Purple 100
];

import { FormSlugEditor } from "./form-slug-editor";

export function FormHeaderSettings({
  formId,
  title,
  slug,
  settings,
  onTitleChange,
  onSlugChange,
  onSettingsChange,
  onSaveStatusChange,
}: {
  formId: string;
  title: string;
  slug: string;
  settings: FormSettings;
  onTitleChange: (value: string) => void;
  onSlugChange: (newSlug: string) => void;
  onSettingsChange: (newSettings: FormSettings) => void;
  onSaveStatusChange: (status: "saving" | "saved") => void;
}) {
  const [isUploading, setIsUploading] = useState<string | null>(null);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isRepositioningCover, setIsRepositioningCover] = useState(false);
  const [isRepositioningFooter, setIsRepositioningFooter] = useState(false);
  const [pickerAssetType, setPickerAssetType] = useState<"logo" | "cover" | "footer" | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const footerInputRef = useRef<HTMLInputElement>(null);
  const defaultBgImageInputRef = useRef<HTMLInputElement>(null);

  const logoUrl = settings.logo_url ?? null;
  const coverUrl = settings.cover_image_url ?? null;
  const footerUrl = settings.footer_image_url ?? null;

  const coverPositionY = settings.cover_position_y ?? 50;
  const footerPositionY = settings.footer_position_y ?? 50;

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
    assetType: "logo" | "cover" | "footer" | "section_default",
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
        await handleSaveSettings({ cover_image_url: uploadedUrl, cover_position_y: 50 });
      } else if (assetType === "footer") {
        await handleSaveSettings({ footer_image_url: uploadedUrl, footer_position_y: 50 });
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
    await handleSaveSettings({ cover_image_url: null, cover_position_y: null });
    setIsRepositioningCover(false);
  }

  async function handleRemoveFooter() {
    if (footerUrl) {
      deleteFormAsset(footerUrl);
    }
    await handleSaveSettings({ footer_image_url: null, footer_position_y: null });
    setIsRepositioningFooter(false);
  }

  async function handleSelectAsset(selectedUrl: string) {
    if (pickerAssetType === "logo") {
      await handleSaveSettings({ logo_url: selectedUrl });
      toast.success("Logo updated");
    } else if (pickerAssetType === "cover") {
      await handleSaveSettings({ cover_image_url: selectedUrl, cover_position_y: 50 });
      toast.success("Cover image updated");
    } else if (pickerAssetType === "footer") {
      await handleSaveSettings({ footer_image_url: selectedUrl, footer_position_y: 50 });
      toast.success("Footer image updated");
    }
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
      <input
        ref={footerInputRef}
        accept="image/*"
        className="hidden"
        type="file"
        onChange={(e) => handleFileUpload(e, "footer")}
      />

      {/* Cover Image Banner (Tally Style) */}
      {coverUrl ? (
        <div className="group relative h-48 w-full overflow-hidden rounded-2xl border border-border bg-slate-100 shadow-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Form cover banner"
            className="h-full w-full object-cover transition-all"
            src={coverUrl}
            style={{ objectPosition: `50% ${coverPositionY}%` }}
          />

          {/* Action Overlay */}
          <div className="absolute top-3 right-3 flex items-center gap-2 opacity-80 transition-opacity group-hover:opacity-100 hover:!opacity-100">
            <Button
              size="sm"
              variant="tertiary"
              className={`shadow-xs backdrop-blur-xs ${
                isRepositioningCover ? "bg-accent text-white hover:bg-accent/90" : "bg-white/90 text-foreground hover:bg-white"
              }`}
              onPress={() => setIsRepositioningCover((prev) => !prev)}
            >
              <Sliders className="size-4" />
              Reposition
            </Button>
            <Button
              isDisabled={isUploading === "cover"}
              size="sm"
              variant="tertiary"
              className="bg-white/90 text-foreground shadow-xs backdrop-blur-xs hover:bg-white"
              onPress={() => setPickerAssetType("cover")}
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

          {/* Ideal dimensions badge on hover */}
          <div className="absolute bottom-2 right-3 opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none">
            <span className="rounded-md bg-black/75 px-2 py-1 text-[10px] font-medium text-white shadow-xs backdrop-blur-xs">
              Ideal: 1500 × 400 px
            </span>
          </div>

          {/* Inline Repositioning Controls */}
          {isRepositioningCover && (
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3 rounded-xl bg-slate-900/90 p-3 text-xs text-white backdrop-blur-md shadow-lg animate-in fade-in slide-in-from-bottom-2">
              <span className="font-semibold shrink-0">Vertical Position:</span>
              <div className="flex items-center gap-2 flex-1 max-w-xs">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={coverPositionY}
                  className="w-full accent-accent h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                  onChange={(e) => handleSaveSettings({ cover_position_y: Number(e.target.value) })}
                />
                <span className="font-mono text-[11px] w-8 text-right">{coverPositionY}%</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-medium"
                  onClick={() => handleSaveSettings({ cover_position_y: 0 })}
                >
                  Top
                </button>
                <button
                  type="button"
                  className="rounded px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-medium"
                  onClick={() => handleSaveSettings({ cover_position_y: 50 })}
                >
                  Center
                </button>
                <button
                  type="button"
                  className="rounded px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-medium"
                  onClick={() => handleSaveSettings({ cover_position_y: 100 })}
                >
                  Bottom
                </button>
                <Button
                  size="sm"
                  variant="primary"
                  className="ml-2 h-7 text-xs px-2.5"
                  onPress={() => setIsRepositioningCover(false)}
                >
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Logo & Document Header Section */}
      <div className="flex flex-col gap-3">
        {/* Logo Widget (Tally Style) */}
        {logoUrl ? (
          <div className="group relative flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-white p-1.5 shadow-sm transition-all hover:border-accent/60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Form logo"
              className="h-full w-full object-contain pointer-events-none"
              src={logoUrl}
            />

            {/* Hover overlay to change logo */}
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 rounded-2xl cursor-pointer z-10"
              onClick={() => setPickerAssetType("logo")}
            >
              <span className="text-[10px] font-semibold text-white bg-black/60 px-2 py-0.5 rounded-md shadow-xs pointer-events-none">
                Change
              </span>
            </div>

            {/* Cross Icon button on hover */}
            <button
              type="button"
              aria-label="Remove logo"
              title="Remove logo"
              className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white shadow-md opacity-0 group-hover:opacity-100 hover:bg-danger hover:scale-110 transition-all cursor-pointer z-30"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveLogo();
              }}
            >
              <Xmark className="size-3.5 stroke-2" />
            </button>

            {/* Ideal dimensions badge on hover */}
            <div className="absolute bottom-1 right-1 opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none">
              <span className="rounded bg-black/80 px-1 py-0.5 text-[9px] font-medium text-white whitespace-nowrap">
                160 × 160 px
              </span>
            </div>
          </div>
        ) : null}

        {/* Tally Action Bar (Add Logo, Add Cover, Add Footer) */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {!logoUrl && (
            <Button
              isDisabled={isUploading === "logo"}
              size="sm"
              variant="tertiary"
              className="bg-slate-100/80 hover:bg-slate-200/80 text-foreground font-medium rounded-lg px-3"
              onPress={() => setPickerAssetType("logo")}
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
              onPress={() => setPickerAssetType("cover")}
            >
              <LayoutHeader />
              Add cover
            </Button>
          )}
          {!footerUrl && (
            <Button
              isDisabled={isUploading === "footer"}
              size="sm"
              variant="tertiary"
              className="bg-slate-100/80 hover:bg-slate-200/80 text-foreground font-medium rounded-lg px-3"
              onPress={() => setPickerAssetType("footer")}
            >
              <Picture />
              Add footer
            </Button>
          )}
        </div>

        {/* Large Inline Document Title */}
        <TextField aria-label="Form title" className="w-full" value={title} onChange={onTitleChange}>
          <Input
            className="w-full border-none bg-transparent px-0 py-1 text-3xl font-bold tracking-tight text-foreground shadow-none focus:outline-none focus:ring-0 placeholder:text-muted/40"
            placeholder="Untitled form"
          />
        </TextField>

        {/* Custom Slug Permalink Editor */}
        <FormSlugEditor
          formId={formId}
          slug={slug}
          onSaveStatusChange={onSaveStatusChange}
          onSlugChange={onSlugChange}
        />
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

      {pickerAssetType && (
        <AssetPickerModal
          isOpen={pickerAssetType !== null}
          onOpenChange={(open) => {
            if (!open) setPickerAssetType(null);
          }}
          formId={formId}
          assetType={pickerAssetType}
          currentUrl={
            pickerAssetType === "logo"
              ? logoUrl
              : pickerAssetType === "cover"
              ? coverUrl
              : footerUrl
          }
          onSelectImage={handleSelectAsset}
        />
      )}
    </div>
  );
}
