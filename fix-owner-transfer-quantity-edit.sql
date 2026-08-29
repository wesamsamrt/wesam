-- يسمح للمدير العام بتغيير كمية أي عنصر تحويل في كل المراحل غير الملغاة.
-- تتم تسوية مخزون المصدر والوجهة حسب حالة التحويل داخل معاملة واحدة آمنة.
create or replace function public.adjust_warehouse_transfer_item_quantity(
    p_transfer_id bigint,
    p_transfer_item_id bigint,
    p_new_quantity integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    selected_transfer public.warehouse_transfers%rowtype;
    selected_item public.warehouse_transfer_items%rowtype;
    quantity_delta integer;
begin
    if auth.uid() is null or not exists (
        select 1
        from public.team_accounts
        where user_id = auth.uid()
          and role = 'owner'
          and is_active
    ) then
        raise exception 'تعديل كميات التحويلات متاح للمدير العام فقط';
    end if;

    if p_new_quantity is null or p_new_quantity < 1 then
        raise exception 'كمية التحويل يجب أن تكون أكبر من صفر';
    end if;

    select * into selected_transfer
    from public.warehouse_transfers
    where id = p_transfer_id
    for update;
    if not found then raise exception 'التحويل غير موجود'; end if;
    if selected_transfer.status = 'cancelled' then
        raise exception 'لا يمكن تعديل تحويل ملغي';
    end if;

    select * into selected_item
    from public.warehouse_transfer_items
    where id = p_transfer_item_id and transfer_id = p_transfer_id
    for update;
    if not found then raise exception 'عنصر التحويل غير موجود'; end if;

    quantity_delta := p_new_quantity - selected_item.quantity;
    if quantity_delta = 0 then return; end if;

    -- قبل الإرسال لم يتحرك المخزون بعد؛ يكفي حفظ الكمية الجديدة.
    if selected_transfer.status in ('draft', 'requested') then
        null;

    -- أثناء النقل سبق خصم الكمية القديمة من المصدر، لذلك نسوي الفرق فقط.
    elsif selected_transfer.status = 'in_transit' then
        if quantity_delta > 0 then
            update public.products
            set quantity = quantity - quantity_delta
            where id = selected_item.source_product_id
              and warehouse = selected_transfer.source_warehouse
              and quantity >= quantity_delta;
            if not found then raise exception 'الكمية الإضافية غير متوفرة في المخزن المصدر'; end if;
        else
            update public.products
            set quantity = quantity + abs(quantity_delta)
            where id = selected_item.source_product_id
              and warehouse = selected_transfer.source_warehouse;
            if not found then raise exception 'منتج المخزن المصدر غير موجود'; end if;
        end if;

    -- بعد الاستلام نسوي الفرق في المصدر والوجهة معًا كي تبقى الأرصدة صحيحة.
    elsif selected_transfer.status = 'received' then
        if quantity_delta > 0 then
            update public.products
            set quantity = quantity - quantity_delta
            where id = selected_item.source_product_id
              and warehouse = selected_transfer.source_warehouse
              and quantity >= quantity_delta;
            if not found then raise exception 'الكمية الإضافية غير متوفرة في المخزن المصدر'; end if;

            update public.products
            set quantity = quantity + quantity_delta
            where id = selected_item.destination_product_id
              and warehouse = selected_transfer.destination_warehouse;
            if not found then raise exception 'منتج المخزن الوجهة غير موجود'; end if;
        else
            update public.products
            set quantity = quantity - abs(quantity_delta)
            where id = selected_item.destination_product_id
              and warehouse = selected_transfer.destination_warehouse
              and quantity >= abs(quantity_delta);
            if not found then raise exception 'لا يمكن خفض الكمية؛ رصيد المخزن الوجهة أقل من الفرق المطلوب'; end if;

            update public.products
            set quantity = quantity + abs(quantity_delta)
            where id = selected_item.source_product_id
              and warehouse = selected_transfer.source_warehouse;
            if not found then raise exception 'منتج المخزن المصدر غير موجود'; end if;
        end if;
    else
        raise exception 'حالة التحويل الحالية لا تقبل تعديل الكمية';
    end if;

    update public.warehouse_transfer_items
    set quantity = p_new_quantity
    where id = p_transfer_item_id and transfer_id = p_transfer_id;
end;
$$;

revoke all on function public.adjust_warehouse_transfer_item_quantity(bigint, bigint, integer) from public;
grant execute on function public.adjust_warehouse_transfer_item_quantity(bigint, bigint, integer) to authenticated;
