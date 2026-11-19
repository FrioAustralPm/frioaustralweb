-- Frío Austral: videollamadas de asesoría (solo Plan Premium).
-- Proyecto Supabase "Frio Austral" (kgxwjywupnnvceyziymj). Migración aditiva.
-- Nadie lee ni escribe desde el navegador: todo pasa por /api con la service role,
-- que verifica el plan y entrega la sala solo al dueño de la solicitud y al equipo.

create table if not exists public.videocalls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.subscribers (user_id) on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'solicitada' check (status in ('solicitada', 'propuesta', 'confirmada', 'cancelada')),
  proposed_by text not null default 'cliente' check (proposed_by in ('cliente', 'equipo')),
  room text not null unique check (room ~ '^frioaustral-[0-9a-f-]{36}$'),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists videocalls_user_idx on public.videocalls (user_id, scheduled_at desc);
create index if not exists videocalls_status_idx on public.videocalls (status, scheduled_at);

alter table public.videocalls enable row level security;
-- Sin políticas: anon y authenticated no ven ni escriben filas (la sala no se filtra).
revoke all on public.videocalls from anon, authenticated;
