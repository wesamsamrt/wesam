-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- يضيف موقع الصنف داخل المخزن، مثل: رف A - صف 2 - خانة 5.

alter table public.products
add column if not exists storage_location text;

create index if not exists products_storage_location_idx
on public.products (warehouse, storage_location);

comment on column public.products.storage_location is
'موقع الصنف داخل المخزن، مثال: رف A - صف 2 - خانة 5';

notify pgrst, 'reload schema';
