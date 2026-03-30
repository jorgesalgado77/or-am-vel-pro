-- ============================================================
-- CORREÇÃO DE RLS PARA measurement_requests
-- Execute este SQL no editor SQL do backend.
-- Objetivo:
-- 1) manter isolamento multi-tenant via get_my_tenant_id()
-- 2) permitir que administrador/gerente veja os registros do tenant
-- 3) permitir que técnico/liberador/conferente leia cards atribuídos
--    por nome, apelido, e-mail, id do usuário e auth_user_id
-- 4) evitar recursão de policy usando SECURITY DEFINER
-- ============================================================

-- Normaliza nomes/identificadores para comparação segura
create or replace function public.normalize_identity_label(_value text)
returns text
language sql
immutable
as $$
  select lower(
    trim(
      translate(
        coalesce(_value, ''),
        'ÁÀÃÂÄáàãâäÉÈÊËéèêëÍÌÎÏíìîïÓÒÕÔÖóòõôöÚÙÛÜúùûüÇç',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
      )
    )
  )
$$;

-- Decide se o usuário autenticado pode visualizar/editar a solicitação
create or replace function public.can_access_measurement_request(
  _tenant_id text,
  _assigned_to text,
  _created_by text default null,
  _client_snapshot jsonb default '{}'::jsonb
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      u.id::text as user_row_id,
      coalesce(u.auth_user_id::text, '') as auth_user_id,
      public.normalize_identity_label(u.nome_completo) as nome_completo,
      public.normalize_identity_label(u.apelido) as apelido,
      public.normalize_identity_label(u.email) as email,
      public.normalize_identity_label(c.nome) as cargo_nome,
      coalesce(u.tenant_id::text, '') as tenant_id
    from public.usuarios u
    left join public.cargos c on c.id = u.cargo_id
    where u.ativo = true
      and (
        u.id = auth.uid()
        or u.auth_user_id = auth.uid()
      )
    order by case when u.auth_user_id = auth.uid() then 0 else 1 end
    limit 1
  )
  select exists (
    select 1
    from me
    where me.tenant_id = coalesce(_tenant_id, '')
      and (
        me.cargo_nome like '%administrador%'
        or me.cargo_nome like '%gerente%'
        or public.normalize_identity_label(_assigned_to) = any(array[
          me.user_row_id,
          me.auth_user_id,
          me.nome_completo,
          me.apelido,
          me.email
        ])
        or public.normalize_identity_label(_created_by) = any(array[
          me.user_row_id,
          me.auth_user_id,
          me.nome_completo,
          me.apelido,
          me.email
        ])
        or public.normalize_identity_label(_client_snapshot ->> 'assigned_to_user_id') = any(array[
          me.user_row_id,
          me.auth_user_id
        ])
        or public.normalize_identity_label(_client_snapshot ->> 'assigned_to_auth_user_id') = any(array[
          me.user_row_id,
          me.auth_user_id
        ])
        or public.normalize_identity_label(_client_snapshot ->> 'tecnico_user_id') = any(array[
          me.user_row_id,
          me.auth_user_id
        ])
        or public.normalize_identity_label(_client_snapshot ->> 'tecnico_auth_user_id') = any(array[
          me.user_row_id,
          me.auth_user_id
        ])
        or public.normalize_identity_label(_client_snapshot ->> 'liberador_user_id') = any(array[
          me.user_row_id,
          me.auth_user_id
        ])
        or public.normalize_identity_label(_client_snapshot ->> 'liberador_auth_user_id') = any(array[
          me.user_row_id,
          me.auth_user_id
        ])
        or public.normalize_identity_label(_client_snapshot ->> 'conferente_user_id') = any(array[
          me.user_row_id,
          me.auth_user_id
        ])
        or public.normalize_identity_label(_client_snapshot ->> 'conferente_auth_user_id') = any(array[
          me.user_row_id,
          me.auth_user_id
        ])
        or public.normalize_identity_label(_client_snapshot ->> 'assigned_to_name') = any(array[
          me.nome_completo,
          me.apelido,
          me.email
        ])
        or public.normalize_identity_label(_client_snapshot ->> 'technician_name') = any(array[
          me.nome_completo,
          me.apelido,
          me.email
        ])
        or public.normalize_identity_label(_client_snapshot ->> 'tecnico_nome') = any(array[
          me.nome_completo,
          me.apelido,
          me.email
        ])
        or public.normalize_identity_label(_client_snapshot ->> 'liberador_nome') = any(array[
          me.nome_completo,
          me.apelido,
          me.email
        ])
        or public.normalize_identity_label(_client_snapshot ->> 'conferente_nome') = any(array[
          me.nome_completo,
          me.apelido,
          me.email
        ])
        or public.normalize_identity_label(_client_snapshot ->> 'created_by_user_id') = any(array[
          me.user_row_id,
          me.auth_user_id
        ])
        or public.normalize_identity_label(_client_snapshot ->> 'created_by_user_name') = any(array[
          me.nome_completo,
          me.apelido,
          me.email
        ])
      )
  )
$$;

alter table public.measurement_requests enable row level security;

grant select, insert, update on public.measurement_requests to authenticated;

create policy "measurement_requests_select_secure"
on public.measurement_requests
for select
to authenticated
using (
  public.can_access_measurement_request(
    tenant_id::text,
    assigned_to,
    created_by,
    coalesce(client_snapshot, '{}'::jsonb)
  )
);

create policy "measurement_requests_insert_tenant"
on public.measurement_requests
for insert
to authenticated
with check (
  tenant_id::text = public.get_my_tenant_id()::text
);

create policy "measurement_requests_update_secure"
on public.measurement_requests
for update
to authenticated
using (
  public.can_access_measurement_request(
    tenant_id::text,
    assigned_to,
    created_by,
    coalesce(client_snapshot, '{}'::jsonb)
  )
)
with check (
  tenant_id::text = public.get_my_tenant_id()::text
);

-- Opcional: remova policies antigas conflitantes depois de validar esta correção.
-- Exemplo:
-- drop policy if exists "measurement_requests_select" on public.measurement_requests;
-- drop policy if exists "measurement_requests_update" on public.measurement_requests;
