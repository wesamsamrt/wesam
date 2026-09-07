-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- يعيد مخزون الطلب إلى مخزنه عند تحويل حالته إلى «ملغي» مرة واحدة فقط.

alter table public.orders add column if not exists inventory_deducted_at timestamptz;
alter table public.orders add column if not exists inventory_restocked_at timestamptz;

-- الطلبات القديمة التي غادرت حالة «جديد» تُعامل كطلبات خُصم مخزونها سابقًا.
update public.orders
set inventory_deducted_at = coalesce(inventory_deducted_at, created_at, now())
where status not in ('جديد', 'ملغي')
  and inventory_deducted_at is null;

-- يسجل أن المخزون خُصم عندما يتحول الطلب من السلة إلى «مقدم».
create or replace function public.track_order_inventory_deduction()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.status = 'مقدم'
       and old.status is distinct from 'مقدم'
       and new.inventory_deducted_at is null then
        new.inventory_deducted_at := now();
    end if;
    return new;
end;
$$;

drop trigger if exists orders_track_inventory_deduction on public.orders;
create trigger orders_track_inventory_deduction
before update of status on public.orders
for each row execute function public.track_order_inventory_deduction();

create or replace function public.restock_cancelled_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    order_item record;
begin
    -- لا نعيد المخزون إلا عند أول تحويل إلى «ملغي» وبعد خصمه فعليًا.
    if new.status = 'ملغي'
       and old.status is distinct from 'ملغي'
       and new.inventory_deducted_at is not null
       and new.inventory_restocked_at is null then
        for order_item in
            select product_id, quantity
            from public.order_items
            where order_id = new.id
        loop
            update public.products
            set quantity = coalesce(quantity, 0) + greatest(1, coalesce(order_item.quantity, 1))
            where id = order_item.product_id
              and warehouse = new.warehouse;
            if not found then
                raise exception 'تعذر إعادة مخزون أحد منتجات الطلب الملغي';
            end if;
        end loop;

        update public.orders
        set inventory_restocked_at = now()
        where id = new.id;
    end if;
    return new;
end;
$$;

drop trigger if exists orders_restock_on_cancel on public.orders;
create trigger orders_restock_on_cancel
after update of status on public.orders
for each row execute function public.restock_cancelled_order();

notify pgrst, 'reload schema';
