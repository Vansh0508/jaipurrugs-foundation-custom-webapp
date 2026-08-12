-- Blank-form creation (createForm server action) inserts `{}` — give `slug` a
-- column-level default so Supabase's generated Insert type treats it as
-- optional; the trg_forms_default_slug trigger still fills in the real value.
alter table public.forms alter column slug set default '';
