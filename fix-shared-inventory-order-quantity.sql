-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- المخزون المشترك = المخزن + كود المنتج + الموديل.
-- يجمع كميات كل الألوان في الطلب ثم يخصم/يعيد مجموعها مرة واحدة.

create or replace function public.adjust_shared_product_stock(
    p_product_id bigint,
    p_warehouse text,
    p_delta numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    source_product public.products%rowtype;
    current_stock numeric;
    next_stock numeric;
begin
    select * into source_product
    from public.products
    where id = p_product_id and trim(warehouse) = trim(p_warehouse)
    for update;
    if not found then raise exception 'لم نجد المنتج في مخزن الطلب'; end if;

    -- الصنف الذي لا يملك كوداً وموديلاً لا يدخل في المخزون المشترك.
    if nullif(trim(coalesce(source_product.product_code, '')), '') is null
       or nullif(trim(coalesce(source_product.model, '')), '') is null then
        next_stock := coalesce(source_product.quantity, 0) + p_delta;
        if next_stock < 0 then raise exception 'الكمية غير متوفرة في المخزون'; end if;
        update public.products set quantity = next_stock where id = source_product.id;
        return;
    end if;

    -- نأخذ رصيداً واحداً للمجموعة. Trigger المخزون المشترك ينسخه لكل الألوان.
    select quantity into current_stock
    from public.products product_row
    where trim(product_row.warehouse) = trim(p_warehouse)
      and lower(trim(product_row.product_code)) = lower(trim(source_product.product_code))
      and lower(trim(product_row.model)) = lower(trim(source_product.model))
    order by product_row.id
    limit 1
    for update;

    next_stock := coalesce(current_stock, 0) + p_delta;
    if next_stock < 0 then
        raise exception 'الكمية المشتركة غير متوفرة للصنف % / %', source_product.product_code, source_product.model;
    end if;
    update public.products set quantity = next_stock where id = source_product.id;
end;
$$;

create or replace function public.adjust_order_shared_inventory(
    p_order_id bigint,
    p_warehouse text,
    p_multiplier integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    inventory_group record;
begin
    -- نجمع الألوان المتشابهة في كود وموديل واحد. مثال: 5 ألوان × 10 = خصم 50.
    for inventory_group in
        select
            min(product_row.id) as product_id,
            sum(greatest(1, coalesce(order_item.quantity, 1)))::numeric as total_quantity
        from public.order_items order_item
        join public.products product_row on product_row.id = order_item.product_id
        where order_item.order_id = p_order_id
          and trim(product_row.warehouse) = trim(p_warehouse)
        group by case
            when nullif(trim(coalesce(product_row.product_code, '')), '') is not null
             and nullif(trim(coalesce(product_row.model, '')), '') is not null
            then lower(trim(product_row.product_code)) || chr(31) || lower(trim(product_row.model))
            else 'product-id:' || product_row.id::text
        end
    loop
        perform public.adjust_shared_product_stock(
            inventory_group.product_id,
            p_warehouse,
            inventory_group.total_quantity * p_multiplier
        );
    end loop;
end;
$$;

-- تغيير الحالة: الخصم يتم مرة واحدة عند أول انتقال لحالة تنفيذ.
create or replace function public.update_warehouse_order_status(p_order_id bigint, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    current_order public.orders%rowtype;
    target_status text := trim(coalesce(p_status, ''));
    should_deduct boolean := false;
begin
    select * into current_order from public.orders where id = p_order_id for update;
    if not found then raise exception 'الطلب غير موجود'; end if;
    if not public.team_can_access_warehouse(current_order.warehouse, 'orders') then
        raise exception 'ليس لديك صلاحية لتحديث هذا الطلب';
    end if;
    if target_status = '' then raise exception 'حالة الطلب غير صالحة'; end if;

    should_deduct := target_status not in ('جديد', 'ملغي')
        and current_order.inventory_deducted_at is null;
    if should_deduct then
        perform public.adjust_order_shared_inventory(p_order_id, current_order.warehouse, -1);
    end if;

    update public.orders
    set status = target_status,
        inventory_deducted_at = case when should_deduct then now() else inventory_deducted_at end
    where id = p_order_id;
    return jsonb_build_object('id', p_order_id, 'user_id', current_order.user_id, 'status', target_status);
end;
$$;

-- تعديل تحضير خُصم سابقاً: نعيد الإجمالي القديم ثم نخصم الإجمالي الجديد.
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
    should_reconcile_inventory boolean;
begin
    select * into current_order from public.orders where id = p_order_id for update;
    if not found then raise exception 'الطلب غير موجود'; end if;
    if not public.team_can_access_warehouse(current_order.warehouse, 'orders') then raise exception 'ليس لديك صلاحية لتعديل هذا الطلب'; end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'عناصر الطلب غير صالحة'; end if;

    target_warehouse := coalesce(nullif(trim(p_order->>'warehouse'), ''), current_order.warehouse);
    if not public.team_can_access_warehouse(target_warehouse, 'orders') then raise exception 'لا يمكنك نقل الطلب إلى مخزن خارج صلاحياتك'; end if;
    should_reconcile_inventory := current_order.inventory_deducted_at is not null and current_order.inventory_restocked_at is null;
    if should_reconcile_inventory then perform public.adjust_order_shared_inventory(p_order_id, current_order.warehouse, 1); end if;

    update public.orders set
        customer_name = coalesce(p_order->>'customer_name', customer_name), customer_phone = coalesce(p_order->>'customer_phone', customer_phone),
        driver_name = coalesce(p_order->>'driver_name', driver_name), driver_number = coalesce(p_order->>'driver_number', driver_number),
        warehouse = target_warehouse, total = coalesce((p_order->>'total')::numeric, total)
    where id = p_order_id;
    delete from public.order_items where order_id = p_order_id;
    insert into public.order_items (order_id, product_id, product_code, category, product_type, type, company, model, color, quantity, price, image)
    select p_order_id, item.product_id, item.product_code, item.category, item.product_type, item.type, item.company, item.model, item.color,
        greatest(1, coalesce(item.quantity, 1)), greatest(0, coalesce(item.price, 0)), item.image
    from jsonb_to_recordset(p_items) as item(product_id bigint, product_code text, category text, product_type text, type text, company text, model text, color text, quantity integer, price numeric, image text);
    if should_reconcile_inventory then perform public.adjust_order_shared_inventory(p_order_id, target_warehouse, -1); end if;
    return jsonb_build_object('id', p_order_id, 'warehouse', target_warehouse);
end;
$$;

-- الإلغاء يعيد إجمالي كل الألوان إلى الرصيد المشترك مرة واحدة.
create or replace function public.restock_cancelled_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.status = 'ملغي' and old.status is distinct from 'ملغي'
       and new.inventory_deducted_at is not null and new.inventory_restocked_at is null then
        perform public.adjust_order_shared_inventory(new.id, new.warehouse, 1);
        update public.orders set inventory_restocked_at = now() where id = new.id;
    end if;
    return new;
end;
$$;

-- تقديم طلب العميل/المندوب يستخدم التجميع نفسه قبل تحويله إلى «مقدم».
create or replace function public.submit_customer_order(
    p_order_id bigint,
    p_driver_number text,
    p_driver_name text,
    p_customer_name text,
    p_customer_location text,
    p_customer_lat numeric,
    p_customer_lng numeric,
    p_warehouse text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    selected_order public.orders%rowtype;
    verified_driver public.drivers%rowtype;
begin
    if auth.uid() is null then raise exception 'يجب تسجيل الدخول لتقديم الطلب'; end if;
    select * into selected_order from public.orders where id = p_order_id for update;
    if not found or selected_order.user_id <> auth.uid() then raise exception 'لم يتم العثور على السلة المطلوبة'; end if;
    if selected_order.status <> 'جديد' then raise exception 'تم تقديم هذا الطلب بالفعل'; end if;
    if selected_order.warehouse <> p_warehouse then raise exception 'منطقة السلة لا تطابق منطقة التسوق الحالية'; end if;
    if nullif(trim(coalesce(p_customer_name, '')), '') is null then raise exception 'يجب كتابة اسم العميل'; end if;
    if nullif(trim(coalesce(p_driver_number, '')), '') is null and (selected_order.customer_phone is null or trim(selected_order.customer_phone) = '') then raise exception 'يجب كتابة رقم جوال العميل'; end if;
    if nullif(trim(coalesce(p_driver_number, '')), '') is null and (p_customer_lat is null or p_customer_lng is null) then raise exception 'يجب تحديد عنوان العميل من الخريطة'; end if;
    if nullif(trim(coalesce(p_driver_number, '')), '') is not null then
        select * into verified_driver from public.drivers where driver_number::text = trim(p_driver_number) limit 1;
        if not found then raise exception 'رقم المندوب غير صحيح'; end if;
        if verified_driver.warehouse <> p_warehouse then raise exception 'المندوب تابع لمنطقة مختلفة؛ الرجاء تغيير منطقتك أو اختيار مندوب مناسب'; end if;
    end if;

    perform public.adjust_order_shared_inventory(p_order_id, p_warehouse, -1);
    update public.orders set
        status = 'مقدم',
        inventory_deducted_at = now(),
        driver_number = case when nullif(trim(coalesce(p_driver_number, '')), '') is null then null else verified_driver.driver_number end,
        driver_name = case when nullif(trim(coalesce(p_driver_number, '')), '') is null then null else coalesce(nullif(trim(p_driver_name), ''), verified_driver.name) end,
        customer_name = p_customer_name, customer_location = p_customer_location,
        customer_lat = p_customer_lat, customer_lng = p_customer_lng, warehouse = p_warehouse
    where id = p_order_id;
end;
$$;

-- تصحيح اختياري للطلبات القديمة التي خُصم منها لون واحد فقط قبل هذا الإصلاح.
-- لا يُستخدم إلا للطلب المتأثر، ويعمل مرة واحدة لكل طلب.
create table if not exists public.shared_inventory_order_corrections (
    order_id bigint primary key references public.orders(id) on delete cascade,
    corrected_at timestamptz not null default now(),
    corrected_by uuid default auth.uid()
);

create or replace function public.correct_partial_shared_order_inventory(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    target_order public.orders%rowtype;
    inventory_group record;
begin
    select * into target_order from public.orders where id = p_order_id for update;
    if not found then raise exception 'الطلب غير موجود'; end if;
    if not public.team_can_access_warehouse(target_order.warehouse, 'orders') then raise exception 'ليس لديك صلاحية'; end if;
    if target_order.inventory_deducted_at is null then raise exception 'هذا الطلب لم يُخصم من المخزون بعد'; end if;
    if exists (select 1 from public.shared_inventory_order_corrections where order_id = p_order_id) then
        raise exception 'تم تصحيح هذا الطلب سابقاً';
    end if;

    -- الخطأ القديم خصم أكبر صف لون فقط؛ هنا نخصم الفرق المتبقي.
    for inventory_group in
        select min(product_row.id) as product_id,
               greatest(0, sum(greatest(1, coalesce(order_item.quantity, 1))) - max(greatest(1, coalesce(order_item.quantity, 1))))::numeric as missing_quantity
        from public.order_items order_item
        join public.products product_row on product_row.id = order_item.product_id
        where order_item.order_id = p_order_id
          and trim(product_row.warehouse) = trim(target_order.warehouse)
        group by case when nullif(trim(coalesce(product_row.product_code, '')), '') is not null and nullif(trim(coalesce(product_row.model, '')), '') is not null
                 then lower(trim(product_row.product_code)) || chr(31) || lower(trim(product_row.model))
                 else 'product-id:' || product_row.id::text end
    loop
        if inventory_group.missing_quantity > 0 then
            perform public.adjust_shared_product_stock(inventory_group.product_id, target_order.warehouse, -inventory_group.missing_quantity);
        end if;
    end loop;
    insert into public.shared_inventory_order_corrections(order_id) values (p_order_id);
end;
$$;

grant execute on function public.adjust_shared_product_stock(bigint, text, numeric) to authenticated;
grant execute on function public.adjust_order_shared_inventory(bigint, text, integer) to authenticated;
grant execute on function public.update_warehouse_order_status(bigint, text) to authenticated;
grant execute on function public.save_warehouse_order(bigint, jsonb, jsonb) to authenticated;
grant execute on function public.submit_customer_order(bigint, text, text, text, text, numeric, numeric, text) to authenticated;
grant execute on function public.correct_partial_shared_order_inventory(bigint) to authenticated;
notify pgrst, 'reload schema';
