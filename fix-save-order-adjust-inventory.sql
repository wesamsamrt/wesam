-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- عند تعديل فاتورة تم تقديمها، يعيد الإجراء الكمية القديمة للمخزون ثم يخصم
-- الكميات الجديدة داخل المعاملة نفسها. بهذا تحفظ ألوان التحضير الفعلية بدقة.

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
    old_item record;
    new_item record;
    should_reconcile_inventory boolean;
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
    should_reconcile_inventory := current_order.inventory_deducted_at is not null
        and current_order.inventory_restocked_at is null;

    -- نرجع الكميات القديمة أولًا إذا كان الطلب قد خُصم من المخزون بالفعل.
    if should_reconcile_inventory then
        for old_item in select product_id, quantity from public.order_items where order_id = p_order_id loop
            if old_item.product_id is not null then
                update public.products set quantity = quantity + greatest(1, coalesce(old_item.quantity, 1))
                where id = old_item.product_id and warehouse = current_order.warehouse;
            end if;
        end loop;
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
    select p_order_id, item.product_id, item.product_code, item.category,
        item.product_type, item.type, item.company, item.model, item.color,
        greatest(1, coalesce(item.quantity, 1)), greatest(0, coalesce(item.price, 0)), item.image
    from jsonb_to_recordset(p_items) as item(
        product_id bigint, product_code text, category text, product_type text,
        type text, company text, model text, color text, quantity integer,
        price numeric, image text
    );

    -- نخصم التوزيع الجديد حسب product_id؛ كل لون هو صف منتج مستقل في المخزون.
    if should_reconcile_inventory then
        for new_item in
            select product_id, sum(quantity)::integer as quantity
            from public.order_items where order_id = p_order_id and product_id is not null
            group by product_id
        loop
            update public.products
            set quantity = quantity - new_item.quantity
            where id = new_item.product_id
              and warehouse = target_warehouse
              and quantity >= new_item.quantity;
            if not found then
                raise exception 'الكمية الجديدة غير متوفرة في المخزون لأحد الألوان';
            end if;
        end loop;
    end if;

    return jsonb_build_object('id', p_order_id, 'warehouse', target_warehouse);
end;
$$;

grant execute on function public.save_warehouse_order(bigint, jsonb, jsonb) to authenticated;
notify pgrst, 'reload schema';
