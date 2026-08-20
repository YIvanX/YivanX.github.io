-- =============================================================================
-- Bitácora · esquema inicial
--
-- ESTE ARCHIVO ES LA FUENTE DE VERDAD DEL ESQUEMA. No se toca la base de datos
-- por el panel de Supabase: se edita aquí, se aplica, y así el día que el
-- proyecto desaparezca —que pasa: el proyecto anterior de esta cuenta se
-- evaporó y se llevó por delante una vista y tres funciones que solo vivían
-- dentro— se rehace entero desde cero con un comando.
--
-- Se aplica con:  node herramientas/nube.mjs migrar
-- o pegándolo en el editor SQL de Supabase.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- viajes — el documento del viaje entero
--
-- `datos` es jsonb con el mismo documento que hoy vive en data/viajes/<id>.json
-- y que valida schema/viaje.schema.json. Normalizar 25 lugares con sus horarios,
-- sus listas anidadas y sus bloques en tablas relacionales sería reescribir el
-- cliente entero para no ganar nada a esta escala: el contrato ya existe y es
-- ese esquema JSON. Las columnas sueltas de al lado son solo para poder listar
-- viajes sin traerse el documento completo.
-- -----------------------------------------------------------------------------
create table if not exists public.viajes (
  id            text primary key
                check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  propietario   uuid not null references auth.users (id) on delete cascade,
  titulo        text not null,
  subtitulo     text,
  fecha_inicio  date not null,
  fecha_fin     date not null,
  estado        text not null default 'planificado'
                check (estado in ('planificado', 'en-curso', 'completado')),
  datos         jsonb not null,
  -- Control de concurrencia: dos móviles editando el mismo viaje a la vez.
  -- Quien guarda con una versión vieja recibe un conflicto en vez de pisar.
  version       integer not null default 1,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);

comment on table public.viajes is
  'El viaje completo. `datos` es el mismo documento que data/viajes/<id>.json.';
comment on column public.viajes.version is
  'Sube en cada escritura. El cliente manda la que tenía; si no coincide, es conflicto.';

-- -----------------------------------------------------------------------------
-- viaje_miembros — quién ve y quién edita
--
-- Es la tabla sobre la que se apoya TODA la seguridad. Sin fila aquí, no se ve
-- nada: no hay política que dé acceso por otra vía.
-- -----------------------------------------------------------------------------
create table if not exists public.viaje_miembros (
  viaje_id   text not null references public.viajes (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  rol        text not null default 'editor'
             check (rol in ('propietario', 'editor', 'lector')),
  creado_en  timestamptz not null default now(),
  primary key (viaje_id, usuario_id)
);

comment on table public.viaje_miembros is
  'Quién puede ver o editar cada viaje. Toda la seguridad se apoya aquí.';

create index if not exists viaje_miembros_usuario_idx
  on public.viaje_miembros (usuario_id);

-- -----------------------------------------------------------------------------
-- estado_personal — lo que es de cada uno y NO se comparte
--
-- Lo visitado y las notas son personales a propósito: que ella marque un sitio
-- como visitado no debe tachárselo a él. Lo que sí es compartido —las paradas
-- añadidas al itinerario— vive dentro de `viajes.datos`, porque una parada
-- añadida es parte del viaje, no de quien la añadió.
-- -----------------------------------------------------------------------------
create table if not exists public.estado_personal (
  viaje_id       text not null references public.viajes (id) on delete cascade,
  usuario_id     uuid not null references auth.users (id) on delete cascade,
  visitados      jsonb not null default '{}'::jsonb,
  notas          jsonb not null default '{}'::jsonb,
  tareas         jsonb not null default '{}'::jsonb,
  vistos         jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now(),
  primary key (viaje_id, usuario_id)
);

comment on table public.estado_personal is
  'Visitados, notas, tareas y «qué mirar» tachado. De cada usuario, no compartido.';

-- Los datos privados (dirección del alojamiento, referencias de reserva) NO
-- suben a ninguna tabla, ni siquiera aquí: siguen viviendo solo en el navegador.
-- Subirlos no aporta nada y amplía la superficie de un dato sensible.

-- -----------------------------------------------------------------------------
-- Marca de tiempo y versión automáticas
-- -----------------------------------------------------------------------------
create or replace function public.tocar_actualizado()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create or replace function public.subir_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  -- La versión la lleva la base de datos, no el cliente: si la subiera el
  -- cliente, dos escrituras simultáneas podrían mandar el mismo número.
  new.version := old.version + 1;
  return new;
end;
$$;

drop trigger if exists viajes_antes_de_actualizar on public.viajes;
create trigger viajes_antes_de_actualizar
  before update on public.viajes
  for each row execute function public.subir_version();

drop trigger if exists estado_antes_de_actualizar on public.estado_personal;
create trigger estado_antes_de_actualizar
  before update on public.estado_personal
  for each row execute function public.tocar_actualizado();

-- -----------------------------------------------------------------------------
-- Al crear un viaje, su autor es miembro propietario automáticamente
-- Sin esto, quien lo crea no podría volver a leerlo: la política de lectura
-- exige fila en viaje_miembros.
-- -----------------------------------------------------------------------------
create or replace function public.alta_propietario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.viaje_miembros (viaje_id, usuario_id, rol)
  values (new.id, new.propietario, 'propietario')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists viajes_tras_insertar on public.viajes;
create trigger viajes_tras_insertar
  after insert on public.viajes
  for each row execute function public.alta_propietario();

-- -----------------------------------------------------------------------------
-- ¿Es miembro? Función auxiliar para las políticas.
--
-- Va como `security definer` a propósito: si consultara viaje_miembros con los
-- permisos del que llama, la propia política de viaje_miembros se consultaría a
-- sí misma y entraría en recursión infinita. Es el error clásico de RLS.
-- -----------------------------------------------------------------------------
create or replace function public.es_miembro(p_viaje text, p_roles text[] default array['propietario','editor','lector'])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.viaje_miembros m
    where m.viaje_id = p_viaje
      and m.usuario_id = (select auth.uid())
      and m.rol = any(p_roles)
  );
$$;

-- =============================================================================
-- Seguridad a nivel de fila
--
-- Todo cerrado por defecto y abierto solo por pertenencia. Sin sesión iniciada
-- no se lee ni una fila: la clave publicable del cliente, que va en el JavaScript
-- y por tanto es pública, no da acceso a nada por sí sola.
-- =============================================================================
alter table public.viajes           enable row level security;
alter table public.viaje_miembros   enable row level security;
alter table public.estado_personal  enable row level security;

-- --- viajes ------------------------------------------------------------------
drop policy if exists viajes_leer on public.viajes;
create policy viajes_leer on public.viajes
  for select to authenticated
  using (public.es_miembro(id));

drop policy if exists viajes_crear on public.viajes;
create policy viajes_crear on public.viajes
  for insert to authenticated
  with check (propietario = (select auth.uid()));

drop policy if exists viajes_editar on public.viajes;
create policy viajes_editar on public.viajes
  for update to authenticated
  using (public.es_miembro(id, array['propietario','editor']))
  with check (public.es_miembro(id, array['propietario','editor']));

-- Borrar es solo del propietario: un editor invitado no debe poder cargarse
-- el viaje entero de otro.
drop policy if exists viajes_borrar on public.viajes;
create policy viajes_borrar on public.viajes
  for delete to authenticated
  using (propietario = (select auth.uid()));

-- --- viaje_miembros ----------------------------------------------------------
drop policy if exists miembros_leer on public.viaje_miembros;
create policy miembros_leer on public.viaje_miembros
  for select to authenticated
  using (usuario_id = (select auth.uid()) or public.es_miembro(viaje_id));

-- Invitar y expulsar, solo el propietario.
drop policy if exists miembros_gestionar on public.viaje_miembros;
create policy miembros_gestionar on public.viaje_miembros
  for all to authenticated
  using (public.es_miembro(viaje_id, array['propietario']))
  with check (public.es_miembro(viaje_id, array['propietario']));

-- --- estado_personal ---------------------------------------------------------
-- Lo personal es estrictamente de su dueño: ni siquiera el propietario del
-- viaje ve las notas de los demás.
drop policy if exists estado_propio on public.estado_personal;
create policy estado_propio on public.estado_personal
  for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()) and public.es_miembro(viaje_id));

-- =============================================================================
-- Índices de consulta
-- =============================================================================
create index if not exists viajes_propietario_idx on public.viajes (propietario);
create index if not exists viajes_fechas_idx      on public.viajes (fecha_inicio desc);

-- =============================================================================
-- Comprobación de que ha quedado como se pretendía.
-- Devuelve una fila por tabla; `politicas` a 0 significaría abierto de par en par.
-- =============================================================================
-- select c.relname as tabla, c.relrowsecurity as rls, count(p.polname) as politicas
--   from pg_class c
--   left join pg_policy p on p.polrelid = c.oid
--  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
--  group by 1, 2 order by 1;
