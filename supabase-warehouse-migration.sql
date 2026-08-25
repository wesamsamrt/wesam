-- شغّل هذا الملف مرة واحدة من Supabase SQL Editor.
-- يصبح كل سجل منتج تابعاً لمخزن واحد، وتكون كميته هي كمية ذلك المخزن.

alter table public.products
add column if not exists warehouse text;

update public.products
set warehouse = 'الرياض'
where warehouse is null or btrim(warehouse) = '';

alter table public.products
alter column warehouse set default 'الرياض';

alter table public.products
alter column warehouse set not null;

alter table public.products
drop constraint if exists products_warehouse_check;

alter table public.products
add constraint products_warehouse_check
check (warehouse in ('الرياض', 'جدة'));

create index if not exists products_warehouse_idx
on public.products (warehouse);

alter table public.orders
add column if not exists warehouse text;

update public.orders
set warehouse = 'الرياض'
where warehouse is null or btrim(warehouse) = '';

alter table public.orders
alter column warehouse set default 'الرياض';

alter table public.orders
alter column warehouse set not null;

alter table public.orders
drop constraint if exists orders_warehouse_check;

alter table public.orders
add constraint orders_warehouse_check
check (warehouse in ('الرياض', 'جدة'));

create index if not exists orders_warehouse_idx
on public.orders (warehouse);

alter table public.drivers
add column if not exists warehouse text;

update public.drivers
set warehouse = 'الرياض'
where warehouse is null or btrim(warehouse) = '';

alter table public.drivers
alter column warehouse set default 'الرياض';

alter table public.drivers
alter column warehouse set not null;

alter table public.drivers
drop constraint if exists drivers_warehouse_check;

alter table public.drivers
add constraint drivers_warehouse_check
check (warehouse in ('الرياض', 'جدة'));

create index if not exists drivers_warehouse_idx
on public.drivers (warehouse);

-- ربط مندوب بمخزن وتحديث طلباته، مع تجاوز RLS فقط للأدمن المعتمد.
create or replace function public.assign_driver_warehouse(
    p_driver_number text,
    p_warehouse text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    selected_driver public.drivers%rowtype;
    updated_orders integer;
begin
    if auth.uid() is null or not exists (
        select 1 from public.admins where id = auth.uid()
    ) then
        raise exception 'غير مصرح لك بتغيير مخزن المندوب';
    end if;

    if p_warehouse not in ('الرياض', 'جدة') then
        raise exception 'المخزن المختار غير صالح';
    end if;

    select * into selected_driver
    from public.drivers
    where driver_number::text = trim(p_driver_number)
    limit 1;

    if not found then
        raise exception 'رقم المندوب غير موجود';
    end if;

    update public.drivers
    set warehouse = p_warehouse
    where id = selected_driver.id;

    update public.orders
    set warehouse = p_warehouse
    where driver_number::text = trim(p_driver_number);

    get diagnostics updated_orders = row_count;

    return jsonb_build_object(
        'driver_name', selected_driver.name,
        'warehouse', p_warehouse,
        'orders_updated', updated_orders
    );
end;
$$;

grant execute on function public.assign_driver_warehouse(text, text) to authenticated;
