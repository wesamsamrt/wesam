-- Run before publishing the updated JavaScript files.
begin;
alter table public.products add column if not exists is_archived boolean not null default false;
alter table public.products add column if not exists archived_at timestamptz;

create or replace function public.archive_product(p_product_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    target public.products%rowtype;
begin
    select * into target from public.products where id = p_product_id for update;
    if not found then raise exception 'الصنف غير موجود'; end if;
    if auth.uid() is null or not public.team_can_access_warehouse(target.warehouse, 'products') then
        raise exception 'ليس لديك صلاحية أرشفة الصنف';
    end if;
    update public.products set is_archived = true, archived_at = coalesce(archived_at, now())
    where id = p_product_id;
end;
$$;
revoke all on function public.archive_product(bigint) from public;
grant execute on function public.archive_product(bigint) to authenticated;
-- Historical reads remain available; do not hide archived rows through SELECT policies.
commit;
