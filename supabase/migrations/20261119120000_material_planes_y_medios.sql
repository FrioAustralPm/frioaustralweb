-- Frío Austral: material por plan (ebooks, PDF, recursos) y fotos/videos del sitio editables desde el panel del equipo.
-- Migración ADITIVA: solo crea objetos nuevos (2 tablas, 1 función, 2 buckets y sus políticas). No borra ni modifica datos existentes.
-- Escrituras: solo desde las funciones de /api con la service role (el equipo sube, el servidor valida).
-- Lecturas desde el navegador:
--   * plan_materials / bucket plan-material (PRIVADO): solo el suscriptor con acceso vigente al plan al que se asignó el material.
--   * site_media / bucket site-media (PÚBLICO, igual que las fotos que ya están en el sitio): lectura abierta.

-- ---------------------------------------------------------------------------
-- 1) Material por plan
-- ---------------------------------------------------------------------------
create table if not exists public.plan_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 1000),
  category text not null default 'recurso' check (category in ('ebook', 'biblioteca', 'guia', 'video', 'recurso')),
  storage_path text not null unique,
  file_name text not null,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  plans text[] not null check (
    cardinality(plans) >= 1
    and plans <@ array['basico', 'pro', 'premium']::text[]
  ),
  published boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_materials_created_idx on public.plan_materials (created_at desc);

-- ¿El usuario que consulta tiene acceso vigente a alguno de estos planes?
-- Misma regla que la API (canAsk): plan asignado, estado activa o cancelada a fin de período
-- y período no vencido (con 1 día de gracia).
create or replace function public.fa_has_plan_access(allowed_plans text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscribers s
    where s.user_id = (select auth.uid())
      and s.plan is not null
      and s.plan = any (allowed_plans)
      and s.status in ('activa', 'cancelada_fin_periodo')
      and (s.period_end is null or s.period_end + interval '1 day' > now())
  );
$$;
revoke all on function public.fa_has_plan_access(text[]) from public, anon;
grant execute on function public.fa_has_plan_access(text[]) to authenticated;

alter table public.plan_materials enable row level security;

drop policy if exists "plan_materials_select_por_plan" on public.plan_materials;
create policy "plan_materials_select_por_plan" on public.plan_materials
  for select to authenticated
  using (published and public.fa_has_plan_access(plans));

-- ---------------------------------------------------------------------------
-- 2) Fotos y videos del sitio (una fila por "espacio" del catálogo assets/fa-slots.js)
-- ---------------------------------------------------------------------------
create table if not exists public.site_media (
  slot text primary key check (slot ~ '^[a-z0-9-]{3,60}$'),
  kind text not null check (kind in ('image', 'video')),
  storage_path text not null,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  alt text not null default '' check (char_length(alt) <= 300),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.site_media enable row level security;

drop policy if exists "site_media_select_publico" on public.site_media;
create policy "site_media_select_publico" on public.site_media
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- 3) Buckets de Storage
--    plan-material: PRIVADO. Descargas por URL firmada de corta duración o por RLS.
--    site-media: público (son las fotos y videos que ve cualquier visitante).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'plan-material', 'plan-material', false, 52428800,
  array[
    'application/pdf', 'application/epub+zip', 'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'
  ]
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-media', 'site-media', true, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']
)
on conflict (id) do nothing;

-- Lectura directa (supabase-js) del material: solo si el archivo está asignado al plan vigente del usuario.
drop policy if exists "plan_material_objetos_select_por_plan" on storage.objects;
create policy "plan_material_objetos_select_por_plan" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'plan-material'
    and exists (
      select 1 from public.plan_materials m
      where m.storage_path = storage.objects.name
        and m.published
        and public.fa_has_plan_access(m.plans)
    )
  );
-- Sin políticas de insert/update/delete: solo la service role (las funciones de /api) puede escribir.

-- ---------------------------------------------------------------------------
-- 4) Permisos de tabla (este proyecto no los da por defecto; mismo criterio que service_role_table_grants).
--    service_role: usa las funciones de /api. authenticated: solo lectura, filtrada por las políticas RLS de arriba.
--    anon: solo las fotos/videos del sitio (públicos).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.plan_materials to service_role;
grant select, insert, update, delete on public.site_media to service_role;
grant select on public.plan_materials to authenticated;
grant select on public.site_media to anon, authenticated;
