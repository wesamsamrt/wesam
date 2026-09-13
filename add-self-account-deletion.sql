-- حذف الحساب الحالي نهائيًا من الموقع.
-- لا يحذف الطلبات أو بيانات المتجر؛ يحتفظ بالسجلات التجارية ويزيل فقط هوية تسجيل الدخول.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid := auth.uid();
    reference record;
begin
    if current_user_id is null then
        raise exception 'يجب تسجيل الدخول أولًا';
    end if;

    -- نحفظ السجلات التجارية، ونزيل فقط ربطها بالحساب المحذوف عند وجود مرجع قابل للإفراغ.
    for reference in
        select table_schema, table_name, column_name
        from information_schema.columns
        where column_name in ('created_by', 'updated_by', 'actor_id', 'target_user_id', 'linked_by')
          and table_schema = 'public'
          and data_type = 'uuid'
          and is_nullable = 'YES'
    loop
        execute format(
            'update %I.%I set %I = null where %I = $1',
            reference.table_schema, reference.table_name, reference.column_name, reference.column_name
        ) using current_user_id;
    end loop;

    -- إزالة عضوية الإدارة للحساب نفسه قبل حذف هوية الدخول، دون حذف أي بيانات متجر.
    delete from public.admins where id = current_user_id;

    -- روابط الفريق والمندوبين مربوطة بالمستخدم بحذف متسلسل، ولا تمس بيانات المخزن.
    delete from auth.users where id = current_user_id;
    if not found then
        raise exception 'تعذر العثور على الحساب';
    end if;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
