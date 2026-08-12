"use client";

import { useRef, useState } from "react";
import { toast } from "@heroui/react";
import {
  createField,
  deleteField,
  duplicateField,
  updateField,
  updateFieldPosition,
} from "@/lib/actions/forms";
import type { BackgroundConfig, FormFieldType } from "@/lib/forms/field-types";
import { midpointPosition } from "@/lib/forms/position";
import { AddFieldDivider, AddFirstFieldButton } from "./add-field-menu";
import { FieldCard, type FieldRow } from "./field-card";

const DEBOUNCE_MS = 900;

type FieldPatch = Partial<{
  label: string | null;
  description: string | null;
  placeholder: string | null;
  required: boolean;
  config: Record<string, unknown>;
}>;

export function EditorCanvas({
  formId,
  initialFields,
  defaultSectionBackground,
  onSaveStatusChange,
}: {
  formId: string;
  initialFields: FieldRow[];
  defaultSectionBackground?: BackgroundConfig;
  onSaveStatusChange: (status: "saving" | "saved") => void;
}) {
  const [fields, setFields] = useState<FieldRow[]>(initialFields);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const pendingPatchesRef = useRef<Map<string, FieldPatch>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const activeSavesRef = useRef(0);
  const dragArmedRef = useRef(false);

  function beginSave() {
    activeSavesRef.current += 1;
    onSaveStatusChange("saving");
  }

  function endSave() {
    activeSavesRef.current = Math.max(0, activeSavesRef.current - 1);
    if (activeSavesRef.current === 0) {
      onSaveStatusChange("saved");
    }
  }

  function patchField(field: FieldRow, patch: FieldPatch, options?: { immediate?: boolean }) {
    setFields((prev) =>
      prev.map((f) => (f.id === field.id ? ({ ...f, ...patch } as FieldRow) : f)),
    );

    const merged = { ...(pendingPatchesRef.current.get(field.id) ?? {}), ...patch };
    pendingPatchesRef.current.set(field.id, merged);

    const existingTimer = timersRef.current.get(field.id);
    if (existingTimer) clearTimeout(existingTimer);
    timersRef.current.delete(field.id);

    function flush() {
      const toSave = pendingPatchesRef.current.get(field.id);
      pendingPatchesRef.current.delete(field.id);
      if (!toSave) return;

      beginSave();
      updateField(field.id, field.type, toSave)
        .catch(() => toast.danger("Couldn't save your change."))
        .finally(endSave);
    }

    if (options?.immediate) {
      flush();
    } else {
      timersRef.current.set(field.id, setTimeout(flush, DEBOUNCE_MS));
    }
  }

  async function handleAddField(type: FormFieldType, afterFieldId: string | null) {
    beginSave();
    try {
      const created = await createField(formId, type, afterFieldId);
      setFields((prev) => {
        const index = afterFieldId ? prev.findIndex((f) => f.id === afterFieldId) + 1 : 0;
        const next = [...prev];
        next.splice(index, 0, created);
        return next;
      });
    } catch {
      toast.danger("Couldn't add the field.");
    } finally {
      endSave();
    }
  }

  async function handleDuplicate(field: FieldRow) {
    beginSave();
    try {
      const created = await duplicateField(field.id);
      setFields((prev) => {
        const index = prev.findIndex((f) => f.id === field.id);
        const next = [...prev];
        next.splice(index + 1, 0, created);
        return next;
      });
    } catch {
      toast.danger("Couldn't duplicate the field.");
    } finally {
      endSave();
    }
  }

  async function handleDelete(field: FieldRow) {
    const index = fields.findIndex((f) => f.id === field.id);
    setFields((prev) => prev.filter((f) => f.id !== field.id));

    beginSave();
    try {
      await deleteField(field.id);
    } catch {
      toast.danger("Couldn't delete the field.");
      setFields((prev) => {
        const next = [...prev];
        next.splice(index, 0, field);
        return next;
      });
    } finally {
      endSave();
    }
  }

  // Re-finds the target by id after splicing the dragged item out, rather
  // than trusting the pre-drag render index — removing an earlier item
  // shifts every later index by one, so a stale index would insert on the
  // wrong side of the drop target for downward drags.
  function moveDraggedField(targetId: string | "end") {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const current = [...fields];
    const fromIndex = current.findIndex((f) => f.id === draggedId);
    if (fromIndex === -1) return;
    const [moved] = current.splice(fromIndex, 1);

    const targetIndex = targetId === "end" ? current.length : current.findIndex((f) => f.id === targetId);
    const insertIndex = targetIndex === -1 ? current.length : targetIndex;
    current.splice(insertIndex, 0, moved);

    const before = current[insertIndex - 1]?.position ?? null;
    const after = current[insertIndex + 1]?.position ?? null;
    const newPosition = midpointPosition(before, after);

    const updated = current.map((f) => (f.id === moved.id ? { ...f, position: newPosition } : f));
    setFields(updated);
    setDraggedId(null);
    setDragOverId(null);

    beginSave();
    updateFieldPosition(moved.id, newPosition)
      .catch(() => toast.danger("Couldn't save the new order."))
      .finally(endSave);
  }

  const dragHandleProps: React.HTMLAttributes<HTMLButtonElement> = {
    onMouseDown: () => {
      dragArmedRef.current = true;
    },
    onMouseUp: () => {
      dragArmedRef.current = false;
    },
  };

  if (fields.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-16 text-center">
        <p className="font-medium">This form has no fields yet</p>
        <p className="text-sm text-muted">Add your first field to start building.</p>
        <AddFirstFieldButton onSelect={(type) => handleAddField(type, null)} />
      </div>
    );
  }

  const indentFlags: boolean[] = [];
  {
    let underSection = false;
    for (const field of fields) {
      if (field.type === "section") {
        indentFlags.push(false);
        underSection = true;
      } else {
        indentFlags.push(underSection);
      }
    }
  }

  return (
    <div className="flex flex-col">
      <AddFieldDivider onSelect={(type) => handleAddField(type, null)} />
      {fields.map((field, index) => {
        const indent = indentFlags[index];

        return (
          <div key={field.id}>
            <div
              className={indent ? "ml-6 border-l-2 border-dashed border-border pl-4" : undefined}
              draggable
              onDragEnd={() => {
                dragArmedRef.current = false;
                setDraggedId(null);
                setDragOverId(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (draggedId && draggedId !== field.id) setDragOverId(field.id);
              }}
              onDragStart={(event) => {
                if (!dragArmedRef.current) {
                  event.preventDefault();
                  return;
                }
                setDraggedId(field.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                moveDraggedField(field.id);
              }}
            >
              <FieldCard
                defaultSectionBackground={defaultSectionBackground}
                dragHandleProps={dragHandleProps}
                field={field}
                isDragOver={dragOverId === field.id}
                onAddFieldAfter={(type) => handleAddField(type, field.id)}
                onConfigChange={(config, options) => patchField(field, { config }, options)}
                onDelete={() => handleDelete(field)}
                onDescriptionChange={(value) => patchField(field, { description: value })}
                onDuplicate={() => handleDuplicate(field)}
                onLabelChange={(value) => patchField(field, { label: value })}
                onPlaceholderChange={(value) => patchField(field, { placeholder: value })}
                onRequiredChange={(value) => patchField(field, { required: value }, { immediate: true })}
              />
            </div>
            <AddFieldDivider onSelect={(type) => handleAddField(type, field.id)} />
          </div>
        );
      })}
      <div
        className="h-4"
        onDragOver={(event) => {
          event.preventDefault();
          if (draggedId) setDragOverId("end");
        }}
        onDrop={(event) => {
          event.preventDefault();
          moveDraggedField("end");
        }}
      />
    </div>
  );
}
