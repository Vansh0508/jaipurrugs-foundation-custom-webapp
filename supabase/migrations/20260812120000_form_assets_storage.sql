-- Phase 4: Storage bucket for public form visual assets (logo, cover image, section backgrounds).
-- See docs/phases/04-visual-asset-management.md and AGENTS.md §5-§7.

insert into storage.buckets (id, name, public)
values ('form-assets', 'form-assets', true)
on conflict (id) do update set public = true;

-- Storage RLS: Reads are public (for public form fill surface), write operations
-- are strictly restricted to active team members.

create policy "public_read_form_assets"
on storage.objects
for select
to public
using ( bucket_id = 'form-assets' );

create policy "active_members_insert_form_assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'form-assets'
  and public.is_active_team_member()
);

create policy "active_members_update_form_assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'form-assets'
  and public.is_active_team_member()
)
with check (
  bucket_id = 'form-assets'
  and public.is_active_team_member()
);

create policy "active_members_delete_form_assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'form-assets'
  and public.is_active_team_member()
);
