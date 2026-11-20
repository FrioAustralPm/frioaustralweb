-- Frío Austral · Tienda: el equipo necesita poder LEER (no solo borrar) los objetos del bucket «tienda»:
-- Storage comprueba que el archivo exista antes de borrarlo y, sin esta política, borrar la foto de un producto
-- eliminado o reemplazado falla con «Access denied». Los visitantes siguen viendo las fotos por la URL pública del bucket.
drop policy if exists "tienda_fotos_select_equipo" on storage.objects;
create policy "tienda_fotos_select_equipo" on storage.objects
  for select to authenticated using (
    bucket_id = 'tienda' and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
  );
