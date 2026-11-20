-- Frío Austral: «Tienda» administrable desde el panel del equipo (equipo.html) y mostrada en tienda.html.
-- Migración ADITIVA: crea 1 tabla, 1 bucket público y sus políticas, y carga los 5 productos que hoy muestra tienda.html.
-- No toca datos ni objetos existentes.
--
-- Quién puede qué (RLS):
--   · visitante (anon):   solo LEE los productos visibles. No escribe nada.
--   · cuenta con sesión:  lee los productos visibles; si NO es del equipo, no escribe nada.
--   · equipo (fila en public.admins): lee todos (también los ocultos) y agrega, edita y borra productos y sus fotos.
-- Fotos: bucket público «tienda» (lectura pública por URL; solo el equipo sube y borra; solo imágenes de hasta 5 MB).

-- ---------------------------------------------------------------------------
-- 1) Tabla tienda_productos
--    foto: ruta de la foto. Si empieza con «media/» es una imagen que ya trae el sitio; si no, es una ruta dentro
--          del bucket «tienda». Nunca una URL: así no se puede apuntar a un sitio externo.
-- ---------------------------------------------------------------------------
create table if not exists public.tienda_productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  precio integer check (precio is null or (precio >= 0 and precio <= 100000000)),
  categoria text not null default '' check (char_length(categoria) <= 60),
  descripcion text not null default '' check (char_length(descripcion) <= 600),
  foto text check (foto is null or (char_length(foto) between 3 and 300 and foto !~ '(^/|\.\.|:|\\)')),
  visible boolean not null default true,
  orden integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tienda_productos_orden_idx on public.tienda_productos (orden, created_at);

create or replace function public.tienda_productos_touch() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists tienda_productos_touch on public.tienda_productos;
create trigger tienda_productos_touch before update on public.tienda_productos
  for each row execute function public.tienda_productos_touch();

alter table public.tienda_productos enable row level security;

-- Privilegios: el visitante solo lee; nadie usa TRUNCATE, REFERENCES ni TRIGGER desde el navegador.
revoke all on public.tienda_productos from anon, authenticated;
grant select on public.tienda_productos to anon;
grant select, insert, update, delete on public.tienda_productos to authenticated;
grant all on public.tienda_productos to service_role;

drop policy if exists "tienda_productos_select_visibles" on public.tienda_productos;
create policy "tienda_productos_select_visibles" on public.tienda_productos
  for select to anon using (visible);

drop policy if exists "tienda_productos_select_auth" on public.tienda_productos;
create policy "tienda_productos_select_auth" on public.tienda_productos
  for select to authenticated using (
    visible or exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
  );

drop policy if exists "tienda_productos_insert_equipo" on public.tienda_productos;
create policy "tienda_productos_insert_equipo" on public.tienda_productos
  for insert to authenticated with check (
    exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
  );

drop policy if exists "tienda_productos_update_equipo" on public.tienda_productos;
create policy "tienda_productos_update_equipo" on public.tienda_productos
  for update to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

drop policy if exists "tienda_productos_delete_equipo" on public.tienda_productos;
create policy "tienda_productos_delete_equipo" on public.tienda_productos
  for delete to authenticated using (
    exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 2) Bucket público «tienda» (fotos de productos, ya comprimidas a WebP por el panel)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tienda', 'tienda', true, 5242880, array['image/webp', 'image/jpeg', 'image/png', 'image/avif'])
on conflict (id) do nothing;

-- Lectura: por la URL pública del bucket (no hace falta política; así tampoco se puede listar la carpeta).
-- Escritura: solo el equipo.
drop policy if exists "tienda_fotos_insert_equipo" on storage.objects;
create policy "tienda_fotos_insert_equipo" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'tienda' and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
  );

drop policy if exists "tienda_fotos_delete_equipo" on storage.objects;
create policy "tienda_fotos_delete_equipo" on storage.objects
  for delete to authenticated using (
    bucket_id = 'tienda' and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 3) Los 5 productos que hoy muestra tienda.html (mismo orden, mismas fotos, sin precio: se ve «Pronto»)
--    Solo si la tabla está vacía, para que volver a correr la migración no duplique nada.
-- ---------------------------------------------------------------------------
insert into public.tienda_productos (nombre, foto, orden)
select v.nombre, v.foto, v.orden
from (values
  ('Bomba de vacío',   'media/img/tienda-bomba-vacio-300.webp',       1),
  ('Manómetros',       'media/img/tienda-manometro-300.webp',         2),
  ('Vacuómetro',       'media/img/tienda-vacuometro-300.webp',        3),
  ('Soldadura',        'media/img/tienda-soldadura-300.webp',         4),
  ('Limpiador rosado', 'media/img/tienda-limpiador-rosado-300.webp',  5)
) as v(nombre, foto, orden)
where not exists (select 1 from public.tienda_productos);
