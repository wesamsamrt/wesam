-- Run in Supabase SQL Editor before uploading the updated admin files.
begin;
create or replace function public.save_products_replace_quantity(p_items jsonb)
returns setof public.products
language plpgsql security definer set search_path = public
as $$
declare
    item jsonb;
    saved public.products%rowtype;
    target_id bigint;
    matches integer;
    qty numeric;
    identity_key text;
    seen text[] := array[]::text[];
begin
    if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
    if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 then raise exception 'لا توجد أصناف للحفظ'; end if;
    -- Serialize this save path so concurrent uploads cannot create duplicate variants.
    perform pg_advisory_xact_lock(9212026);
    for item in select value from jsonb_array_elements(p_items) loop
        if not public.team_can_access_warehouse(item->>'warehouse','products') then raise exception 'ليس لديك صلاحية المخزن'; end if;
        qty := (item->>'quantity')::numeric;
        if qty is null or qty<0 or qty<>trunc(qty) then raise exception 'الكمية يجب أن تكون عددًا صحيحًا غير سالب'; end if;
        identity_key := jsonb_build_array(trim(item->>'warehouse'),lower(trim(coalesce(item->>'product_code',''))),lower(trim(coalesce(item->>'model',''))),lower(trim(coalesce(item->>'color',''))))::text;
        if identity_key=any(seen) then raise exception 'الصنف مكرر داخل الصفوف؛ اكتب الكمية النهائية في صف واحد'; end if;
        seen:=array_append(seen,identity_key);
        select count(*),min(id) into matches,target_id from public.products p
        where not p.is_archived and p.warehouse=item->>'warehouse'
          and nullif(trim(item->>'product_code'),'') is not null
          and lower(trim(coalesce(p.product_code,'')))=lower(trim(item->>'product_code'))
          and lower(trim(coalesce(p.model,'')))=lower(trim(coalesce(item->>'model','')))
          and lower(trim(coalesce(p.color,'')))=lower(trim(coalesce(item->>'color','')));
        if matches>1 then raise exception 'يوجد أكثر من صنف مطابق للكود والموديل واللون؛ عالج التكرار أولًا'; end if;
        if matches=1 then
            update public.products set quantity=qty where id=target_id returning * into saved;
        else
            insert into public.products(product_code,category,product_type,type,company,model,color,quantity,warehouse,storage_location,price,compatibility_type,compatible_devices)
            values(nullif(trim(item->>'product_code'),''),item->>'category',item->>'product_type',item->>'type',item->>'company',item->>'model',item->>'color',qty,item->>'warehouse',item->>'storage_location',coalesce((item->>'price')::numeric,0),item->>'compatibility_type',(jsonb_populate_record(null::public.products,item)).compatible_devices)
            returning * into saved;
        end if;
        return next saved;
    end loop;
end;
$$;
revoke all on function public.save_products_replace_quantity(jsonb) from public;
grant execute on function public.save_products_replace_quantity(jsonb) to authenticated;
commit;
