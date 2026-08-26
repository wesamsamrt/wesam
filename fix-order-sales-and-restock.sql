-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- ينقل الشحن/الاستلام إلى المبيعات، يعيد المخزون عند الإلغاء، ويلغي الطلبات الجديدة بعد 3 أيام.

alter table public.orders add column if not exists inventory_deducted_at timestamptz;
alter table public.orders add column if not exists inventory_restocked_at timestamptz;

-- يعلّم الطلبات السابقة التي غادرت السلة على أنها خُصمت من المخزون بالفعل.
update public.orders
set inventory_deducted_at = coalesce(inventory_deducted_at, created_at, now())
where status not in ('جديد', 'ملغي')
  and inventory_deducted_at is null;

-- يسجل لحظة خصم المخزون عند تقديم العميل للطلب، دون تعديل طريقة تقديم الطلب الحالية.
create or replace function public.track_order_inventory_deduction()
returns trigger
language plpgsql
as $$
begin
    if new.status = 'مقدم' and old.status is distinct from 'مقدم' and new.inventory_deducted_at is null then
        new.inventory_deducted_at := now();
    end if;
    return new;
end;
$$;

drop trigger if exists orders_track_inventory_deduction on public.orders;
create trigger orders_track_inventory_deduction
before update of status on public.orders
for each row execute function public.track_order_inventory_deduction();

-- يعيد كميات الطلب إلى مخزنه مرة واحدة فقط عندما تصبح حالته ملغية.
create or replace function public.restock_cancelled_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare item record;
begin
    if new.status = 'ملغي'
       and old.status is distinct from 'ملغي'
       and new.inventory_deducted_at is not null
       and new.inventory_restocked_at is null then
        for item in
            select product_id, quantity
            from public.order_items
            where order_id = new.id
        loop
            update public.products
            set quantity = quantity + greatest(1, coalesce(item.quantity, 1))
            where id = item.product_id
              and warehouse = new.warehouse;
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

-- يلغي كل طلب بقي بحالة «جديد» ثلاثة أيام؛ لا يحذف الطلب من السجل.
create or replace function public.cancel_stale_new_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare cancelled_count integer;
begin
    update public.orders
    set status = 'ملغي'
    where status = 'جديد'
      and created_at < now() - interval '3 days';
    get diagnostics cancelled_count = row_count;
    return cancelled_count;
end;
$$;

-- إذا كانت إضافة pg_cron مفعلة في مشروع Supabase، ينشئ/يحدّث مهمة تعمل كل ساعة.
do $job$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        execute 'select cron.unschedule(jobid) from cron.job where jobname = ''cancel-stale-new-orders''';
        execute $schedule$select cron.schedule('cancel-stale-new-orders', '0 * * * *', 'select public.cancel_stale_new_orders()')$schedule$;
    end if;
end;
$job$;

grant execute on function public.cancel_stale_new_orders() to authenticated;
notify pgrst, 'reload schema';
