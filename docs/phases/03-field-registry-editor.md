# Phase 3 — Field-Type Registry & Editor Canvas

See [AGENTS.md](../../AGENTS.md) §5–6 for the "no side panel" and "single registry" rules this phase implements.

## Scope

- `lib/forms/field-types.ts` — the field-type registry, the single source of truth for the **core v1 set**: short text, long text, number, email, phone, date, multiple choice, checkboxes, dropdown, rating, linear scale, file upload, section break. Each entry defines its Zod config schema, default config factory, and is imported by the editor, the public renderer (Phase 5), and the metrics dashboard (Phase 6) — never duplicated across them.
- The form editor canvas at `/forms/[id]/edit`: fields render as live cards in a vertical list, each editable in place (click label/description to edit inline; type-specific config — options list, min/max, accepted file types — expands inside the same card). **No side panel or drawer of any kind** — the card is the settings surface.
- Add-field flow: a hover-revealed `+` divider between any two cards (and at the end of the list) opens an inline type-picker at that exact insertion point.
- Reorder via drag-and-drop, writing only the moved field's fractional `position`.
- Section fields double as grouping boundaries (see data model) — every field between one `section` and the next belongs to that section's group, derived from `position` order alone, no separate membership column.
- Debounced autosave (~600–1500ms) per edited field/title, as an independent server-action PATCH to that one row; discrete actions (reorder, delete, duplicate) save immediately without debounce. Optimistic local UI + a save-status indicator ("Saving…"/"Saved").
- Sticky top bar: inline-editable title, status pill, Publish/Unpublish, Copy-link, Preview, save-status indicator, and Edit/Submissions/Metrics tabs.

## Do's

- Build the field-type registry first, and have the editor, public renderer, and metrics dashboard all import from it — this is what keeps a field type's behavior consistent everywhere it's used.
- Debounce at the level of a single field's single value, not the whole form — one PATCH per edited property, not one giant form-wide JSON write.
- Implement config editing entirely inline in the field's own card.

## Don'ts

- Don't introduce a side panel, drawer, or modal for field settings — this is an explicit, intentional constraint of the editor design, not an oversight to "fix" later.
- Don't duplicate a field type's validation or rendering logic outside the registry (e.g. re-implementing multiple-choice rendering separately in the public form).
- Don't batch multiple fields' edits into a single form-wide save — each field's row is saved independently.

## Definition of Done

Every core field type can be added, configured entirely inline, reordered, and deleted without any panel/drawer appearing. Adding a section field visibly groups subsequent fields under it. Reloading the editor mid-edit shows no data loss (autosave persisted). Reordering a field updates only that field's `position` row.
