-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- يضيف بيانات المندوب من الفاتورة الأصلية إلى نتائج سجل المرتجعات.

create or replace function public.list_warehouse_returns(p_warehouse text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
    if auth.uid() is null or not public.team_can_access_warehouse(p_warehouse, 'orders') then
        raise exception 'ليس لديك صلاحية لعرض مرتجعات هذا المخزن';
    end if;

    return coalesce((
        select jsonb_agg(
            to_jsonb(return_doc) || jsonb_build_object(
                'driver_name', source_order.driver_name,
                'driver_number', source_order.driver_number,
                'items', coalesce((
                    select jsonb_agg(to_jsonb(return_item) order by return_item.id)
                    from public.order_return_items return_item
                    where return_item.return_id = return_doc.id
                ), '[]'::jsonb)
            ) order by return_doc.id desc
        )
        from public.order_returns return_doc
        join public.orders source_order on source_order.id = return_doc.order_id
        where trim(return_doc.warehouse) = trim(p_warehouse)
    ), '[]'::jsonb);
end;
$$;

grant execute on function public.list_warehouse_returns(text) to authenticated;
notify pgrst, 'reload schema';
