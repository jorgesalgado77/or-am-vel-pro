-- Helper: current tenant for RLS
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.tenant_id from public.usuarios u where u.auth_user_id = auth.uid() limit 1),
    (select u.tenant_id from public.usuarios u where u.id = auth.uid() limit 1),
    nullif(auth.jwt() ->> 'tenant_id', '')::uuid
  )
$$;

-- Ensure columns exist on tenant_funnel_config
alter table public.tenant_funnel_config
  add column if not exists promo_video_url text,
  add column if not exists carousel_images jsonb default '[]'::jsonb,
  add column if not exists social_links jsonb default '{}'::jsonb;

-- RPC: resolve tenant id by store code
create or replace function public.resolve_tenant_by_code(p_code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
  from public.tenants t
  where replace(coalesce(t.codigo_loja, ''), '.', '') = replace(coalesce(p_code, ''), '.', '')
  limit 1
$$;

-- RPC: resolve tenant info by code (includes company_settings)
create or replace function public.resolve_tenant_info_by_code(p_code text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'id', t.id,
    'nome', coalesce(nullif(cs.company_name, ''), t.nome_loja),
    'subtitulo', coalesce(cs.company_subtitle, ''),
    'logo_url', cs.logo_url,
    'telefone_loja', coalesce(cs.telefone_loja, t.telefone_contato)
  )
  from public.tenants t
  left join public.company_settings cs on cs.tenant_id = t.id
  where replace(coalesce(t.codigo_loja, ''), '.', '') = replace(coalesce(p_code, ''), '.', '')
  limit 1
$$;

-- RPC: full landing data
create or replace function public.resolve_tenant_landing(p_code text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'id', t.id,
    'nome_loja', coalesce(nullif(cs.company_name, ''), t.nome_loja),
    'logo_url', cs.logo_url,
    'primary_color', coalesce(fc.primary_color, 'hsl(199,89%,48%)'),
    'subtitle', coalesce(cs.company_subtitle, ''),
    'telefone_loja', coalesce(cs.telefone_loja, t.telefone_contato),
    'whatsapp_loja', coalesce(cs.telefone_loja, t.telefone_contato),
    'headline', coalesce(fc.headline, 'Ganhe seu Projeto 3D Gratuito'),
    'sub_headline', coalesce(fc.sub_headline, ''),
    'cta_text', coalesce(fc.cta_text, 'Solicite seu Projeto 3D Gratis'),
    'benefits', coalesce(fc.benefits, '[]'::jsonb),
    'promo_video_url', fc.promo_video_url,
    'carousel_images', coalesce(fc.carousel_images, '[]'::jsonb),
    'social_links', coalesce(fc.social_links, '{}'::jsonb)
  )
  from public.tenants t
  left join public.company_settings cs on cs.tenant_id = t.id
  left join public.tenant_funnel_config fc on fc.tenant_id = t.id
  where replace(coalesce(t.codigo_loja, ''), '.', '') = replace(coalesce(p_code, ''), '.', '')
  limit 1
$$;

-- Campaign gallery table
create table if not exists public.campaign_generated_images (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  image_url text not null,
  template_id text not null,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.campaign_generated_images enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_generated_images' and policyname='cgi_select') then
    create policy "cgi_select" on public.campaign_generated_images for select to authenticated using (tenant_id = public.current_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_generated_images' and policyname='cgi_insert') then
    create policy "cgi_insert" on public.campaign_generated_images for insert to authenticated with check (tenant_id = public.current_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_generated_images' and policyname='cgi_delete') then
    create policy "cgi_delete" on public.campaign_generated_images for delete to authenticated using (tenant_id = public.current_tenant_id());
  end if;
end$$;

-- Storage bucket
insert into storage.buckets (id, name, public) values ('campaign-gallery', 'campaign-gallery', true) on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='cg_public_read') then
    create policy "cg_public_read" on storage.objects for select using (bucket_id = 'campaign-gallery');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='cg_insert') then
    create policy "cg_insert" on storage.objects for insert to authenticated with check (bucket_id = 'campaign-gallery' and split_part(name, '/', 1) = public.current_tenant_id()::text);
  end if;
end$$;