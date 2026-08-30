-- شغّل هذا الملف وحده في Supabase SQL Editor لإصلاح خطأ 404 عند تقديم الطلب.
-- ينشئ الإجراء الذي يقدّم الطلب ويخصم الكميات من مخزن منطقة العميل.

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
    order_item record;
    verified_driver public.drivers%rowtype;
begin
    if auth.uid() is null then
        raise exception 'يجب تسجيل الدخول لتقديم الطلب';
    end if;

    select * into selected_order
    from public.orders
    where id = p_order_id
    for update;

    if not found or selected_order.user_id <> auth.uid() then
        raise exception 'لم يتم العثور على السلة المطلوبة';
    end if;
    if selected_order.status <> 'جديد' then
        raise exception 'تم تقديم هذا الطلب بالفعل';
    end if;
    if selected_order.warehouse <> p_warehouse then
        raise exception 'منطقة السلة لا تطابق منطقة التسوق الحالية';
    end if;

    if nullif(trim(coalesce(p_customer_name, '')), '') is null then
        raise exception 'يجب كتابة اسم العميل';
    end if;
    if nullif(trim(coalesce(p_driver_number, '')), '') is null
       and (selected_order.customer_phone is null or trim(selected_order.customer_phone) = '') then
        raise exception 'يجب كتابة رقم جوال العميل';
    end if;
    -- عنوان الخريطة إلزامي للعميل العادي فقط؛ طلب المندوب لا يحتاجه.
    if nullif(trim(coalesce(p_driver_number, '')), '') is null
       and (p_customer_lat is null or p_customer_lng is null) then
        raise exception 'يجب تحديد عنوان العميل من الخريطة';
    end if;

    -- رقم المندوب اختياري لطلبات العملاء، وإلزامي فقط عندما ترسله واجهة المندوب.
    if nullif(trim(coalesce(p_driver_number, '')), '') is not null then
        select * into verified_driver
        from public.drivers
        where driver_number::text = trim(p_driver_number)
        limit 1;

        if not found then
            raise exception 'رقم المندوب غير صحيح';
        end if;
        if verified_driver.warehouse <> p_warehouse then
            raise exception 'المندوب تابع لمنطقة مختلفة؛ الرجاء تغيير منطقتك أو اختيار مندوب مناسب';
        end if;
    end if;

    for order_item in
        select product_id, quantity
        from public.order_items
        where order_id = p_order_id
    loop
        update public.products
        set quantity = quantity - greatest(1, coalesce(order_item.quantity, 1))
        where id = order_item.product_id
          and warehouse = p_warehouse
          and quantity >= greatest(1, coalesce(order_item.quantity, 1));

        if not found then
            raise exception 'الكمية لم تعد متوفرة لأحد منتجات السلة في مخزن %', p_warehouse;
        end if;
    end loop;

    update public.orders
    set status = 'مقدم',
        driver_number = case when nullif(trim(coalesce(p_driver_number, '')), '') is null then null else verified_driver.driver_number end,
        driver_name = case when nullif(trim(coalesce(p_driver_number, '')), '') is null then null else coalesce(nullif(trim(p_driver_name), ''), verified_driver.name) end,
        customer_name = p_customer_name,
        customer_location = p_customer_location,
        customer_lat = p_customer_lat,
        customer_lng = p_customer_lng,
        warehouse = p_warehouse
    where id = p_order_id;
end;
$$;

grant execute on function public.submit_customer_order(bigint, text, text, text, text, numeric, numeric, text) to authenticated;

notify pgrst, 'reload schema';
