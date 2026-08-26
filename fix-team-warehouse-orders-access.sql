-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- يعالج ظهور قائمة طلبات فارغة لحساب فريق لديه صلاحية مخزن محدد.

-- يتحقق من صلاحية الحساب النشط للوصول إلى مخزن وقسم محددين.
create or replace function public.team_can_access_warehouse(
    p_warehouse text,
    p_section text default 'orders'
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1
        from public.team_accounts team
        where team.user_id = auth.uid()
          and team.is_active = true
          and (
              team.role = 'owner'
              or coalesce(jsonb_array_length(team.permissions->'sections'), 0) = 0
              or team.permissions->'sections' ? p_section
          )
          and (
              team.role = 'owner'
              or coalesce(jsonb_array_length(team.permissions->'warehouses'), 0) = 0
              or team.permissions->'warehouses' ? trim(p_warehouse)
          )
    );
$$;

-- يجلب طلبات المخزن وعناصر كل طلب بعد التأكد من صلاحية الحساب، حتى لا تمنع RLS الحساب المصرح له.
create or replace function public.list_warehouse_orders(p_warehouse text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
    if auth.uid() is null or not public.team_can_access_warehouse(p_warehouse, 'orders') then
        raise exception 'ليس لديك صلاحية لعرض طلبات هذا المخزن';
    end if;

    return coalesce((
        select jsonb_agg(
            to_jsonb(order_row) || jsonb_build_object(
                'items',
                coalesce((
                    select jsonb_agg(to_jsonb(item_row) order by item_row.id)
                    from public.order_items item_row
                    where item_row.order_id = order_row.id
                ), '[]'::jsonb)
            )
            order by order_row.id desc
        )
        from public.orders order_row
        where trim(order_row.warehouse) = trim(p_warehouse)
    ), '[]'::jsonb);
end;
$$;

grant execute on function public.team_can_access_warehouse(text, text) to authenticated;
grant execute on function public.list_warehouse_orders(text) to authenticated;

notify pgrst, 'reload schema';
