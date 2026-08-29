-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- ينشئ عروض اليوم ومساحة رفع صورها، ويقصر التعديل على حسابات الإدارة.

create table if not exists public.daily_offers (
    id uuid primary key default gen_random_uuid(),
    title text not null check (char_length(title) between 1 and 90),
    subtitle text not null default '',
    image_url text not null,
    target_url text not null default 'products.html',
    button_label text not null default 'تسوق الآن ←',
    display_order integer not null default 1 check (display_order > 0),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists daily_offers_active_order_idx
on public.daily_offers (is_active, display_order);

alter table public.daily_offers enable row level security;

drop policy if exists "daily offers public read" on public.daily_offers;
drop policy if exists "daily offers admins insert" on public.daily_offers;
drop policy if exists "daily offers admins update" on public.daily_offers;
drop policy if exists "daily offers admins delete" on public.daily_offers;

create policy "daily offers public read"
on public.daily_offers for select
to anon, authenticated
using (
    is_active = true
    or exists (
        select 1 from public.team_accounts
        where user_id = auth.uid() and is_active = true
        and (role = 'owner' or coalesce(permissions->'sections', '[]'::jsonb) ? 'offers')
    )
);

create policy "daily offers admins insert"
on public.daily_offers for insert
to authenticated
with check (exists (
    select 1 from public.team_accounts
    where user_id = auth.uid() and is_active = true
    and (role = 'owner' or coalesce(permissions->'sections', '[]'::jsonb) ? 'offers')
));

create policy "daily offers admins update"
on public.daily_offers for update
to authenticated
using (exists (
    select 1 from public.team_accounts
    where user_id = auth.uid() and is_active = true
    and (role = 'owner' or coalesce(permissions->'sections', '[]'::jsonb) ? 'offers')
))
with check (exists (
    select 1 from public.team_accounts
    where user_id = auth.uid() and is_active = true
    and (role = 'owner' or coalesce(permissions->'sections', '[]'::jsonb) ? 'offers')
));

create policy "daily offers admins delete"
on public.daily_offers for delete
to authenticated
using (exists (
    select 1 from public.team_accounts
    where user_id = auth.uid() and is_active = true
    and (role = 'owner' or coalesce(permissions->'sections', '[]'::jsonb) ? 'offers')
));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('daily-offers', 'daily-offers', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "daily offers images read" on storage.objects;
drop policy if exists "daily offers images insert" on storage.objects;
drop policy if exists "daily offers images update" on storage.objects;
drop policy if exists "daily offers images delete" on storage.objects;

create policy "daily offers images read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'daily-offers');

create policy "daily offers images insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'daily-offers' and exists (
    select 1 from public.team_accounts
    where user_id = auth.uid() and is_active = true
    and (role = 'owner' or coalesce(permissions->'sections', '[]'::jsonb) ? 'offers')
));

create policy "daily offers images update"
on storage.objects for update
to authenticated
using (bucket_id = 'daily-offers' and exists (
    select 1 from public.team_accounts
    where user_id = auth.uid() and is_active = true
    and (role = 'owner' or coalesce(permissions->'sections', '[]'::jsonb) ? 'offers')
))
with check (bucket_id = 'daily-offers' and exists (
    select 1 from public.team_accounts
    where user_id = auth.uid() and is_active = true
    and (role = 'owner' or coalesce(permissions->'sections', '[]'::jsonb) ? 'offers')
));

create policy "daily offers images delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'daily-offers' and exists (
    select 1 from public.team_accounts
    where user_id = auth.uid() and is_active = true
    and (role = 'owner' or coalesce(permissions->'sections', '[]'::jsonb) ? 'offers')
));

notify pgrst, 'reload schema';
