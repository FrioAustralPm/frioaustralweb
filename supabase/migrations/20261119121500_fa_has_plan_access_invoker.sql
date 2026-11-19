-- La función solo consulta la fila del propio usuario (la política subscribers_select_own ya lo permite),
-- así que no necesita SECURITY DEFINER. Con SECURITY INVOKER deja de ser invocable como definer vía /rest/v1/rpc
-- (aviso del linter de seguridad de Supabase). Aditiva: reemplaza solo el cuerpo de la función creada en la migración anterior.
create or replace function public.fa_has_plan_access(allowed_plans text[])
returns boolean
language sql
stable
security invoker
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
