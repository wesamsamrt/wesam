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

-- يحدّث بيانات الطلب وعناصره داخل معاملة واحدة بعد التحقق من مخزن الحساب.
create or replace function public.save_warehouse_order(
    p_order_id bigint,
    p_order jsonb,
    p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    current_order public.orders%rowtype;
    target_warehouse text;
begin
    select * into current_order from public.orders where id = p_order_id for update;
    if not found then raise exception 'الطلب غير موجود'; end if;
    if not public.team_can_access_warehouse(current_order.warehouse, 'orders') then
        raise exception 'ليس لديك صلاحية لتعديل هذا الطلب';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' then
        raise exception 'عناصر الطلب غير صالحة';
    end if;

    target_warehouse := coalesce(nullif(trim(p_order->>'warehouse'), ''), current_order.warehouse);
    if not public.team_can_access_warehouse(target_warehouse, 'orders') then
        raise exception 'لا يمكنك نقل الطلب إلى مخزن خارج صلاحياتك';
    end if;

    update public.orders
    set customer_name = coalesce(p_order->>'customer_name', customer_name),
        customer_phone = coalesce(p_order->>'customer_phone', customer_phone),
        driver_name = coalesce(p_order->>'driver_name', driver_name),
        driver_number = coalesce(p_order->>'driver_number', driver_number),
        warehouse = target_warehouse,
        total = coalesce((p_order->>'total')::numeric, total)
    where id = p_order_id;

    delete from public.order_items where order_id = p_order_id;

    insert into public.order_items (
        order_id, product_id, product_code, category, product_type,
        type, company, model, color, quantity, price, image
    )
    select
        p_order_id,
        item.product_id,
        item.product_code,
        item.category,
        item.product_type,
        item.type,
        item.company,
        item.model,
        item.color,
        greatest(1, coalesce(item.quantity, 1)),
        greatest(0, coalesce(item.price, 0)),
        item.image
    from jsonb_to_recordset(p_items) as item(
        product_id bigint, product_code text, category text, product_type text,
        type text, company text, model text, color text, quantity integer,
        price numeric, image text
    );

    return jsonb_build_object('id', p_order_id, 'warehouse', target_warehouse);
end;
$$;

-- يغيّر حالة طلب داخل المخزن المصرح به وينشئ إشعار العميل عند وجوده.
create or replace function public.update_warehouse_order_status(p_order_id bigint, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare current_order public.orders%rowtype;
begin
    select * into current_order from public.orders where id = p_order_id for update;
    if not found then raise exception 'الطلب غير موجود'; end if;
    if not public.team_can_access_warehouse(current_order.warehouse, 'orders') then
        raise exception 'ليس لديك صلاحية لتحديث هذا الطلب';
    end if;
    update public.orders set status = trim(p_status) where id = p_order_id;
    if current_order.user_id is not null then
        insert into public.notifications(user_id, order_id, title, message)
        values (current_order.user_id, p_order_id, 'تحديث حالة الطلب 🔔', format('تم تحديث حالة طلبك #%s إلى "%s"', p_order_id, trim(p_status)));
    end if;
    return jsonb_build_object('id', p_order_id, 'user_id', current_order.user_id, 'status', trim(p_status));
end;
$$;

grant execute on function public.save_warehouse_order(bigint, jsonb, jsonb) to authenticated;
grant execute on function public.update_warehouse_order_status(bigint, text) to authenticated;

notify pgrst, 'reload schema';
