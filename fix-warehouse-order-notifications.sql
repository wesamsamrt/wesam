-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- ينشئ إشعاراً تلقائياً لمسؤولي المخزن عند تقديم طلب جديد.

-- يضيف إشعاراً لكل حساب نشط لديه صلاحية قسم الطلبات للمخزن الذي وصل إليه الطلب.
create or replace function public.notify_warehouse_team_on_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.status = 'مقدم' and old.status is distinct from 'مقدم' then
        insert into public.notifications (user_id, order_id, title, message)
        select
            team.user_id,
            new.id,
            'طلب جديد 🔔',
            format('وصل طلب جديد رقم #%s إلى مخزن %s', new.id, new.warehouse)
        from public.team_accounts team
        where team.is_active = true
          and (
              team.role = 'owner'
              or coalesce(jsonb_array_length(team.permissions->'sections'), 0) = 0
              or team.permissions->'sections' ? 'orders'
          )
          and (
              team.role = 'owner'
              or coalesce(jsonb_array_length(team.permissions->'warehouses'), 0) = 0
              or team.permissions->'warehouses' ? new.warehouse
          );
    end if;
    return new;
end;
$$;

drop trigger if exists orders_notify_warehouse_team on public.orders;
create trigger orders_notify_warehouse_team
after update of status on public.orders
for each row execute function public.notify_warehouse_team_on_new_order();

-- يتيح وصول الإشعار فوراً إلى حساب المسؤول المفتوح في المتصفح.
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
           select 1 from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'notifications'
       ) then
        alter publication supabase_realtime add table public.notifications;
    end if;
end;
$$;

notify pgrst, 'reload schema';
