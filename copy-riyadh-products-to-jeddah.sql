-- شغّل هذا الملف من Supabase SQL Editor بعد تشغيل supabase-warehouse-migration.sql.
-- ينسخ جميع منتجات مخزن الرياض إلى مخزن جدة من دون حذف أو تعديل أي منتج في الرياض.
-- يمكن تشغيله أكثر من مرة بأمان؛ لن يعيد نسخ المنتج نفسه مرة أخرى.

alter table public.products
add column if not exists copied_from_product_id bigint;

create unique index if not exists products_jeddah_copied_from_unique_idx
on public.products (warehouse, copied_from_product_id)
where copied_from_product_id is not null;

do $$
declare
    insert_columns text;
    select_columns text;
begin
    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'products'
          and column_name = 'warehouse'
    ) then
        raise exception 'شغّل ملف supabase-warehouse-migration.sql أولاً';
    end if;

    select
        string_agg(format('%I', column_name), ', ' order by ordinal_position),
        string_agg(format('r.%I', column_name), ', ' order by ordinal_position)
    into insert_columns, select_columns
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name not in ('id', 'warehouse', 'copied_from_product_id')
      and is_generated = 'NEVER'
      and is_identity = 'NO';

    execute format(
        'insert into public.products (%s, warehouse, copied_from_product_id)
         select %s, %L, r.id
         from public.products r
         where r.warehouse = %L
           and not exists (
               select 1
               from public.products j
               where j.warehouse = %L
                 and j.copied_from_product_id = r.id
           )',
        insert_columns,
        select_columns,
        'جدة',
        'الرياض',
        'جدة'
    );
end;
$$;
