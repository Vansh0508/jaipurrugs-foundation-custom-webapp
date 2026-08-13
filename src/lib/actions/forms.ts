"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { getFieldTypeDefinition, type FormSettings } from "@/lib/forms/field-types";
import { midpointPosition } from "@/lib/forms/position";
import type { Enums, Json, Tables } from "@/lib/types/supabase";

// Inserts a blank row (DB defaults handle title/slug/share_token/status) and
// redirects straight into the editor, so it always has a real row to autosave
// against from the first keystroke — see docs/phases/02-forms-schema-admin-crud.md.
export async function createForm() {
  await requireActiveTeamMember();

  const supabase = await createClient();
  const { data, error } = await supabase.from("forms").insert({}).select("id").single();

  if (error) {
    throw new Error(error.message);
  }

  redirect(`/forms/${data.id}/edit`);
}

// Debounced from the sticky top bar's inline-editable title — see
// docs/phases/03-field-registry-editor.md.
export async function updateFormTitle(formId: string, title: string) {
  await requireActiveTeamMember();

  const supabase = await createClient();
  const { error } = await supabase.from("forms").update({ title }).eq("id", formId);

  if (error) {
    throw new Error(error.message);
  }
}

// Basic draft <-> published toggle for the top bar's Publish/Unpublish
// button. The fuller publish flow (close date/submission-limit gating) is
// Phase 7 — see docs/phases/07-polish-deploy.md.
export async function setFormStatus(formId: string, status: Enums<"form_status">) {
  await requireActiveTeamMember();

  const supabase = await createClient();
  const { error } = await supabase.from("forms").update({ status }).eq("id", formId);

  if (error) {
    throw new Error(error.message);
  }
}

async function getLiveSiblingPositions(supabase: Awaited<ReturnType<typeof createClient>>, formId: string) {
  const { data, error } = await supabase
    .from("form_fields")
    .select("id, position")
    .eq("form_id", formId)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

// Discrete action (the add-field click), saved immediately — no debounce.
// `afterFieldId: null` means "insert at the very start of the form."
export async function createField(
  formId: string,
  type: Enums<"form_field_type">,
  afterFieldId: string | null,
): Promise<Tables<"form_fields">> {
  await requireActiveTeamMember();

  const supabase = await createClient();
  const siblings = await getLiveSiblingPositions(supabase, formId);

  let before: number | null = null;
  let after: number | null = siblings[0]?.position ?? null;

  if (afterFieldId) {
    const index = siblings.findIndex((field) => field.id === afterFieldId);
    if (index === -1) {
      throw new Error("Reference field not found.");
    }
    before = siblings[index].position;
    after = siblings[index + 1]?.position ?? null;
  }

  const definition = getFieldTypeDefinition(type);
  const { data, error } = await supabase
    .from("form_fields")
    .insert({
      form_id: formId,
      type,
      position: midpointPosition(before, after),
      required: false,
      config: definition.defaultConfig() as unknown as Json,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

type FieldPatch = Partial<{
  label: string | null;
  description: string | null;
  placeholder: string | null;
  required: boolean;
  config: Record<string, unknown>;
}>;

// Debounced per-property autosave from a field's own card — one PATCH per
// edited property, never a whole-form save. See AGENTS.md §5.
export async function updateField(
  fieldId: string,
  type: Enums<"form_field_type">,
  patch: FieldPatch,
) {
  await requireActiveTeamMember();

  let config: Json | undefined;
  if (patch.config !== undefined) {
    const definition = getFieldTypeDefinition(type);
    const parsed = definition.configSchema.safeParse(patch.config);
    if (!parsed.success) {
      throw new Error("Invalid field configuration.");
    }
    config = parsed.data as unknown as Json;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("form_fields")
    .update({ ...patch, config })
    .eq("id", fieldId);

  if (error) {
    throw new Error(error.message);
  }
}

// Discrete action, saved immediately — no debounce.
export async function updateFieldPosition(fieldId: string, position: number) {
  await requireActiveTeamMember();

  const supabase = await createClient();
  const { error } = await supabase.from("form_fields").update({ position }).eq("id", fieldId);

  if (error) {
    throw new Error(error.message);
  }
}

// Soft delete, per the form_fields schema — see docs/phases/02-forms-schema-admin-crud.md.
export async function deleteField(fieldId: string) {
  await requireActiveTeamMember();

  const supabase = await createClient();
  const { error } = await supabase
    .from("form_fields")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", fieldId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function duplicateField(fieldId: string): Promise<Tables<"form_fields">> {
  await requireActiveTeamMember();

  const supabase = await createClient();
  const { data: original, error: fetchError } = await supabase
    .from("form_fields")
    .select("*")
    .eq("id", fieldId)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const siblings = await getLiveSiblingPositions(supabase, original.form_id);
  const index = siblings.findIndex((field) => field.id === fieldId);
  const after = siblings[index + 1]?.position ?? null;

  const { data, error } = await supabase
    .from("form_fields")
    .insert({
      form_id: original.form_id,
      type: original.type,
      position: midpointPosition(original.position, after),
      label: original.label,
      description: original.description,
      placeholder: original.placeholder,
      required: original.required,
      config: original.config,
      validation: original.validation,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateFormSettings(formId: string, settingsPatch: Partial<FormSettings>) {
  await requireActiveTeamMember();

  const supabase = await createClient();
  const { data: form, error: fetchError } = await supabase
    .from("forms")
    .select("settings")
    .eq("id", formId)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const currentSettings = (form.settings as FormSettings) ?? {};
  const updatedSettings: FormSettings = {
    ...currentSettings,
    ...settingsPatch,
    section_defaults: settingsPatch.section_defaults
      ? {
          ...currentSettings.section_defaults,
          ...settingsPatch.section_defaults,
        }
      : currentSettings.section_defaults,
  };

  const { error } = await supabase
    .from("forms")
    .update({ settings: updatedSettings as unknown as Json })
    .eq("id", formId);

  if (error) {
    throw new Error(error.message);
  }

  return updatedSettings;
}

export async function uploadFormAsset(
  formId: string,
  assetType: "logo" | "cover" | "footer" | "section",
  sectionFieldId: string | null,
  formData: FormData,
): Promise<string> {
  await requireActiveTeamMember();

  const file = formData.get("file") as File | null;
  if (!file) {
    throw new Error("No file provided.");
  }

  const fileExt = file.name.split(".").pop() || "png";
  const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

  let storagePath = "";
  if (assetType === "logo") {
    storagePath = `forms/${formId}/logo/${uniqueName}`;
  } else if (assetType === "cover") {
    storagePath = `forms/${formId}/cover/${uniqueName}`;
  } else if (assetType === "footer") {
    storagePath = `forms/${formId}/footer/${uniqueName}`;
  } else if (assetType === "section" && sectionFieldId) {
    storagePath = `forms/${formId}/sections/${sectionFieldId}/${uniqueName}`;
  } else {
    throw new Error("Invalid asset target parameters.");
  }

  const supabase = await createClient();
  const buffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("form-assets")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: publicUrlData } = supabase.storage.from("form-assets").getPublicUrl(storagePath);
  return publicUrlData.publicUrl;
}

export async function deleteFormAsset(publicUrl: string) {
  await requireActiveTeamMember();

  try {
    const urlObj = new URL(publicUrl);
    const pathIndex = urlObj.pathname.indexOf("/form-assets/");
    if (pathIndex !== -1) {
      const storagePath = urlObj.pathname.substring(pathIndex + "/form-assets/".length);
      const supabase = await createClient();
      await supabase.storage.from("form-assets").remove([decodeURIComponent(storagePath)]);
    }
  } catch {
    // Non-fatal if URL parsing or cleanup fails
  }
}
