-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- يربط بريد حساب المستخدم بسجل مندوب واحد بشكل رسمي.

create table if not exists public.driver_account_links (
    user_id uuid primary key references auth.users(id) on delete cascade,
    driver_id bigint not null unique references public.drivers(id) on delete cascade,
    linked_at timestamptz not null default now(),
    linked_by uuid references auth.users(id)
);

-- يعيد بيانات المندوب المرتبط بالحساب الحالي، ويستخدمه المتجر دون كشف بيانات بقية المناديب.
create or replace function public.get_my_driver_identity()
returns jsonb
language sql
security definer
set search_path = public, auth
stable
as $$
    select coalesce((
        select jsonb_build_object(
            'is_driver', true,
            'driver_id', driver.id,
            'driver_number', driver.driver_number,
            'driver_name', driver.name,
            'warehouse', driver.warehouse
        )
        from public.driver_account_links link
        join public.drivers driver on driver.id = link.driver_id
        where link.user_id = auth.uid()
    ), jsonb_build_object('is_driver', false));
$$;

-- يعرض روابط المناديب للمدير لكي يعرف أي بريد مربوط بأي رقم مندوب.
create or replace function public.list_driver_account_links()
returns table(user_id uuid, email text, driver_id bigint, driver_number text, driver_name text, warehouse text, linked_at timestamptz)
language sql
security definer
set search_path = public, auth
as $$
    select link.user_id, users.email::text, driver.id, driver.driver_number::text, driver.name, driver.warehouse, link.linked_at
    from public.driver_account_links link
    join auth.users users on users.id = link.user_id
    join public.drivers driver on driver.id = link.driver_id
    where exists (select 1 from public.team_accounts team where team.user_id = auth.uid() and team.is_active and (team.role = 'owner' or team.permissions->'sections' ? 'drivers'))
    order by driver.name, driver.driver_number;
$$;

-- يربط بريد حساب موجود برقم مندوب موجود، أو يحدّث الربط السابق.
create or replace function public.link_driver_account(p_email text, p_driver_number text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare target_user uuid; target_driver public.drivers%rowtype;
begin
    if not exists (select 1 from public.team_accounts team where team.user_id = auth.uid() and team.is_active and (team.role = 'owner' or team.permissions->'sections' ? 'drivers')) then
        raise exception 'ليس لديك صلاحية ربط حسابات المناديب';
    end if;
    select id into target_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
    if target_user is null then raise exception 'لا يوجد حساب مسجل بهذا البريد'; end if;
    select * into target_driver from public.drivers where driver_number::text = trim(p_driver_number) limit 1;
    if not found then raise exception 'رقم المندوب غير موجود'; end if;
    delete from public.driver_account_links where driver_id = target_driver.id and user_id <> target_user;
    insert into public.driver_account_links(user_id, driver_id, linked_by)
    values(target_user, target_driver.id, auth.uid())
    on conflict (user_id) do update set driver_id = excluded.driver_id, linked_at = now(), linked_by = auth.uid();
    return jsonb_build_object('driver_name', target_driver.name, 'driver_number', target_driver.driver_number, 'warehouse', target_driver.warehouse);
end;
$$;

grant execute on function public.get_my_driver_identity() to authenticated;
grant execute on function public.list_driver_account_links() to authenticated;
grant execute on function public.link_driver_account(text, text) to authenticated;
notify pgrst, 'reload schema';
