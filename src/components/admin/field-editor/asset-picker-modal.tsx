"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Folder,
  Picture,
  TrashBin,
} from "@gravity-ui/icons";
import {
  AlertDialog,
  Button,
  Chip,
  Dropdown,
  Modal,
  Spinner,
  toast,
} from "@heroui/react";
import {
  deleteFormAssetByPath,
  listFormAssets,
  uploadFormAsset,
  type FormAssetItem,
} from "@/lib/actions/forms";

function formatFileSize(bytes: number | null) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssetPickerModal({
  isOpen,
  onOpenChange,
  formId,
  assetType,
  currentUrl,
  onSelectImage,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  assetType: "logo" | "cover" | "footer";
  currentUrl: string | null;
  onSelectImage: (publicUrl: string) => Promise<void> | void;
}) {
  const [assets, setAssets] = useState<FormAssetItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedStoragePath, setSelectedStoragePath] = useState<string | null>(null);
  const [scope, setScope] = useState<"current_form" | "all_forms">("current_form");
  const [typeFilter, setTypeFilter] = useState<"logo" | "cover" | "footer" | "all">("all");
  const [itemToDelete, setItemToDelete] = useState<FormAssetItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAssets = async (currentScope = scope, currentType = typeFilter) => {
    setIsLoading(true);
    try {
      const items = await listFormAssets(formId, currentType, currentScope);
      setAssets(items);
      // If currentUrl matches an item in the list, pre-select it
      if (currentUrl && !selectedStoragePath) {
        const match = items.find((i) => i.publicUrl === currentUrl);
        if (match) setSelectedStoragePath(match.storagePath);
      }
    } catch {
      toast.danger("Could not load images from storage.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAssets(scope, typeFilter);
    } else {
      setSelectedStoragePath(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, scope, typeFilter, assetType]);

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const newUrl = await uploadFormAsset(formId, assetType, null, formData);
      toast.success("Image uploaded to bucket");

      // Reload list and select newly uploaded image
      const updated = await listFormAssets(formId, typeFilter, scope);
      setAssets(updated);
      const found = updated.find((i) => i.publicUrl === newUrl);
      if (found) {
        setSelectedStoragePath(found.storagePath);
      }
    } catch {
      toast.danger("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    setIsDeleting(true);
    try {
      await deleteFormAssetByPath(itemToDelete.storagePath);
      setAssets((prev) => prev.filter((a) => a.storagePath !== itemToDelete.storagePath));
      if (selectedStoragePath === itemToDelete.storagePath) {
        setSelectedStoragePath(null);
      }
      toast.success("Image deleted from folder");
      setItemToDelete(null);
    } catch {
      toast.danger("Failed to delete image from folder.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmSelection = async () => {
    const selected = assets.find((a) => a.storagePath === selectedStoragePath);
    if (!selected) return;

    await onSelectImage(selected.publicUrl);
    onOpenChange(false);
  };

  const filteredAssets = assets;

  const titleText =
    assetType === "logo"
      ? "Select Logo"
      : assetType === "cover"
        ? "Select Cover Image"
        : "Select Footer Image";

  return (
    <>
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-2xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <div className="flex items-center gap-2">
                <Picture className="size-5 text-accent" />
                <Modal.Heading>{titleText}</Modal.Heading>
              </div>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-4 py-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                type="file"
                onChange={handleUploadFile}
              />

              {/* Controls bar: Folder scope tabs, type filter dropdown, and upload */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/60 pb-3">
                <div className="flex items-center rounded-xl border border-border bg-slate-100/70 p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1 transition-all ${
                      scope === "current_form"
                        ? "bg-white text-foreground shadow-xs font-semibold"
                        : "text-muted hover:text-foreground"
                    }`}
                    onClick={() => setScope("current_form")}
                  >
                    This Form
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1 transition-all ${
                      scope === "all_forms"
                        ? "bg-white text-foreground shadow-xs font-semibold"
                        : "text-muted hover:text-foreground"
                    }`}
                    onClick={() => setScope("all_forms")}
                  >
                    All Uploads
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Type Filter Dropdown */}
                  <Dropdown>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex items-center gap-2 h-8 px-3 text-xs font-medium border border-border bg-white text-foreground hover:bg-slate-50 shadow-2xs"
                    >
                      <span className="capitalize">
                        {typeFilter === "all"
                          ? "All Types"
                          : typeFilter === "logo"
                          ? "Logo"
                          : typeFilter === "cover"
                          ? "Cover"
                          : "Footer"}
                      </span>
                      <ChevronDown className="size-3.5 text-muted" />
                    </Button>
                    <Dropdown.Popover>
                      <Dropdown.Menu
                        aria-label="Filter asset type"
                        selectionMode="single"
                        selectedKeys={new Set([typeFilter])}
                        onAction={(key) => setTypeFilter(key as "all" | "logo" | "cover" | "footer")}
                      >
                        <Dropdown.Item id="all" textValue="All">
                          All
                        </Dropdown.Item>
                        <Dropdown.Item id="logo" textValue="Logo">
                          Logo
                        </Dropdown.Item>
                        <Dropdown.Item id="cover" textValue="Cover">
                          Cover
                        </Dropdown.Item>
                        <Dropdown.Item id="footer" textValue="Footer">
                          Footer
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>

                  <Button
                    size="sm"
                    variant="primary"
                    isDisabled={isUploading}
                    onPress={() => fileInputRef.current?.click()}
                  >
                    <ArrowUpFromLine className="size-3.5" />
                    {isUploading ? "Uploading..." : "Upload New"}
                  </Button>
                </div>
              </div>

              {/* Image Grid Area */}
              <div className="min-h-[260px] max-h-[380px] overflow-y-auto pr-1">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted gap-3">
                    <Spinner size="md" />
                    <span className="text-xs font-medium">Loading images from storage bucket...</span>
                  </div>
                ) : filteredAssets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-2xl p-6 bg-slate-50/50">
                    <Folder className="size-10 text-muted/50 mb-2" />
                    <p className="font-semibold text-foreground text-sm">No images found</p>
                    <p className="text-xs text-muted max-w-xs mt-1">
                      {typeFilter === "all"
                        ? "No images uploaded in this folder yet. Upload an image to start."
                        : `No ${typeFilter} images uploaded in this folder yet. Upload an image to start.`}
                    </p>
                    <Button
                      size="sm"
                      variant="tertiary"
                      className="mt-4 bg-white border border-border"
                      onPress={() => fileInputRef.current?.click()}
                    >
                      <ArrowUpFromLine className="size-3.5" />
                      Upload from Device
                    </Button>
                  </div>
                ) : (
                  <div
                    className={`grid gap-3 ${assetType === "logo"
                        ? "grid-cols-2 sm:grid-cols-4 md:grid-cols-5"
                        : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
                      }`}
                  >
                    {filteredAssets.map((item) => {
                      const isSelected = selectedStoragePath === item.storagePath;
                      const isCurrent = currentUrl === item.publicUrl;
                      const sizeStr = formatFileSize(item.size);

                      return (
                        <div
                          key={item.storagePath}
                          className={`group relative flex flex-col overflow-hidden rounded-xl border transition-all cursor-pointer select-none bg-white ${isSelected
                              ? "border-accent ring-2 ring-accent/30 shadow-sm"
                              : "border-border hover:border-accent/60 hover:shadow-2xs"
                            }`}
                          onClick={() => setSelectedStoragePath(item.storagePath)}
                          onDoubleClick={handleConfirmSelection}
                        >
                          {/* Image Thumbnail */}
                          <div
                            className={`w-full overflow-hidden bg-slate-100 flex items-center justify-center relative ${assetType === "logo"
                                ? "h-28 p-2 bg-white"
                                : assetType === "cover"
                                  ? "h-28"
                                  : "h-24"
                              }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              alt={item.name}
                              src={item.publicUrl}
                              className={`h-full w-full ${assetType === "logo" ? "object-contain" : "object-cover"
                                }`}
                            />

                            {/* Active check indicator */}
                            {isSelected && (
                              <div className="absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white shadow-sm z-10">
                                <Check className="size-3 stroke-2" />
                              </div>
                            )}

                            {/* Currently active badge */}
                            {isCurrent && (
                              <div className="absolute top-1.5 right-1.5 z-10">
                                <Chip color="success" size="sm">
                                  In Use
                                </Chip>
                              </div>
                            )}

                            {/* Delete button on hover */}
                            <button
                              type="button"
                              aria-label={`Delete ${item.name}`}
                              title="Delete from folder"
                              className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-white/95 text-danger opacity-0 group-hover:opacity-100 hover:bg-danger hover:text-white shadow-xs backdrop-blur-xs transition-all cursor-pointer z-10"
                              onClick={(e) => {
                                e.stopPropagation();
                                setItemToDelete(item);
                              }}
                            >
                              <TrashBin className="size-3.5" />
                            </button>
                          </div>

                          {/* File Meta Info */}
                          <div className="flex items-center justify-between p-2.5 bg-white gap-1.5 border-t border-border/40">
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-[11px] font-medium text-foreground truncate" title={item.name}>
                                {item.name}
                              </span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] text-muted font-mono">{sizeStr}</span>
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-muted capitalize">
                                  {item.type}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              aria-label={`Delete ${item.name} from folder`}
                              title="Delete from folder"
                              className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setItemToDelete(item);
                              }}
                            >
                              <TrashBin className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Modal.Body>

            <Modal.Footer className="flex items-center justify-between border-t border-border/60 pt-3">
              <div className="flex items-center gap-2">
                {selectedStoragePath && (
                  <Button
                    variant="tertiary"
                    size="sm"
                    className="text-danger hover:bg-danger/10 font-medium"
                    isDisabled={isDeleting}
                    onPress={() => {
                      const selected = assets.find((a) => a.storagePath === selectedStoragePath);
                      if (selected) setItemToDelete(selected);
                    }}
                  >
                    <TrashBin className="size-3.5" />
                    Delete from Folder
                  </Button>
                )}
                {!selectedStoragePath && (
                  <span className="text-xs text-muted">
                    Click an image to select, or delete unwanted images from the folder.
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="tertiary" size="sm" onPress={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  isDisabled={!selectedStoragePath}
                  onPress={handleConfirmSelection}
                >
                  Use Selected
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>

    {/* HeroUI Confirmation Dialog for Deletion */}
    <AlertDialog isOpen={itemToDelete !== null} onOpenChange={(open) => !open && setItemToDelete(null)}>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[420px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete Image from Folder?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="flex flex-col gap-3 py-2">
              <p className="text-xs text-muted">
                Are you sure you want to delete this image? It will be permanently removed from the storage folder. This action cannot be undone.
              </p>
              {itemToDelete && (
                <div className="flex items-center gap-3 rounded-xl border border-border p-2.5 bg-slate-50/70">
                  <div className="h-12 w-12 rounded-lg overflow-hidden border border-border bg-white shrink-0 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={itemToDelete.name}
                      src={itemToDelete.publicUrl}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-semibold text-foreground truncate" title={itemToDelete.name}>
                      {itemToDelete.name}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted">
                      {formatFileSize(itemToDelete.size) && <span>{formatFileSize(itemToDelete.size)}</span>}
                      <span className="rounded bg-slate-200/70 px-1.5 py-0.2 text-[9px] font-medium capitalize text-slate-700">
                        {itemToDelete.type}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                slot="close"
                variant="tertiary"
                onPress={() => setItemToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                isDisabled={isDeleting}
                variant="danger"
                onPress={handleConfirmDelete}
              >
                {isDeleting ? "Deleting..." : "Delete Permanently"}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
    </>
  );
}
