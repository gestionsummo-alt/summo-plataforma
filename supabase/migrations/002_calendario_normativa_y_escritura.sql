-- Migración 002 de SUMMO:
--   1. Calendario jurisdiccional configurable por institución y ciclo lectivo
--   2. Auditoría inmutable multi-institución
--   3. Comandos transaccionales seguros (RPC) con validación de licencia, cupo,
--      aislamiento por institucion_id e idempotencia para sincronización híbrida offline/online.
begin;

-- Helper de autorización por rol dentro de una institución con licencia vigente
create or replace function public.tiene_permiso_modulo(
  p_institucion uuid,
  p_modulo text,
  p_roles text[] default array['direccion','secretaria']
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.membresias m
    join public.licencias l on l.institucion_id = m.institucion_id
    where m.institucion_id = p_institucion
      and m.usuario_id = auth.uid()
      and m.rol = any(p_roles)
      and l.vence >= (now() at time zone 'America/Argentina/Buenos_Aires')::date
      and p_modulo = any(l.modulos)
  );
$$;
revoke all on function public.tiene_permiso_modulo(uuid, text, text[]) from public, anon;
grant execute on function public.tiene_permiso_modulo(uuid, text, text[]) to authenticated;

-- 1. Calendario institucional / jurisdiccional por ciclo lectivo
create table public.calendarios_ciclos (
  institucion_id          uuid not null references public.instituciones(id),
  ciclo                   smallint not null check (ciclo between 2010 and 2100),
  normativa_fuente        text not null check (length(btrim(normativa_fuente)) between 3 and 300),
  cursado_inicio          date not null,
  cursado_fin             date not null,
  receso_inicio           date,
  receso_fin              date,
  cierre_administrativo   date not null,
  primary key (institucion_id, ciclo),
  check (cursado_fin >= cursado_inicio),
  check (cierre_administrativo >= cursado_fin),
  check ((receso_inicio is null and receso_fin is null) or (receso_inicio is not null and receso_fin >= receso_inicio))
);

create table public.calendarios_turnos (
  institucion_id uuid not null,
  ciclo          smallint not null,
  codigo         text not null check (length(btrim(codigo)) between 2 and 60),
  nombre         text not null check (length(btrim(nombre)) between 2 and 120),
  inicio         date not null,
  fin            date not null,
  llamados       smallint not null check (llamados > 0),
  primary key (institucion_id, ciclo, codigo),
  foreign key (institucion_id, ciclo) references public.calendarios_ciclos(institucion_id, ciclo),
  check (fin >= inicio)
);

create table public.calendarios_feriados (
  institucion_id uuid not null,
  ciclo          smallint not null,
  fecha          date not null,
  tipo           text not null check (tipo in ('FERIADO_NACIONAL','FERIADO_PROVINCIAL','ASUETO','PARO','JORNADA')),
  descripcion    text not null check (length(btrim(descripcion)) between 3 and 200),
  primary key (institucion_id, ciclo, fecha, tipo),
  foreign key (institucion_id, ciclo) references public.calendarios_ciclos(institucion_id, ciclo)
);

-- 2. Auditoría inmutable multi-institución (nunca editable desde cliente)
create table public.auditoria_eventos (
  id             bigint generated always as identity primary key,
  institucion_id uuid not null references public.instituciones(id),
  actor_id       uuid not null references auth.users(id),
  modulo         text not null,
  accion         text not null,
  entidad        text not null,
  entidad_id     uuid,
  origen_sync    text not null default 'ONLINE' check (origen_sync in ('ONLINE','PWA_OFFLINE','ESPEJO_PC','IMPORTACION')),
  idempotency_key uuid,
  detalle        jsonb not null default '{}'::jsonb,
  creado_en      timestamptz not null default clock_timestamp()
);
create index auditoria_institucion_fecha_idx on public.auditoria_eventos(institucion_id, creado_en desc);

-- Identificador de idempotencia en asistencias para sincronización híbrida sin duplicados
alter table public.asistencias
  add column if not exists idempotency_key uuid,
  add column if not exists registrado_en timestamptz not null default clock_timestamp(),
  add column if not exists origen_sync text not null default 'ONLINE' check (origen_sync in ('ONLINE','PWA_OFFLINE','ESPEJO_PC'));

create unique index if not exists asistencias_idempotency_unico
  on public.asistencias(institucion_id, idempotency_key)
  where idempotency_key is not null;

-- RLS en las tablas nuevas
alter table public.calendarios_ciclos enable row level security;
alter table public.calendarios_turnos enable row level security;
alter table public.calendarios_feriados enable row level security;
alter table public.auditoria_eventos enable row level security;

revoke all on public.calendarios_ciclos, public.calendarios_turnos, public.calendarios_feriados, public.auditoria_eventos
  from public, anon, authenticated;
grant select on public.calendarios_ciclos, public.calendarios_turnos, public.calendarios_feriados, public.auditoria_eventos
  to authenticated;

create policy alcance_cal_ciclos on public.calendarios_ciclos for select to authenticated
  using (exists (select 1 from public.membresias m join public.licencias l using(institucion_id)
    where m.institucion_id = calendarios_ciclos.institucion_id and m.usuario_id = auth.uid() and l.vence >= current_date));
create policy alcance_cal_turnos on public.calendarios_turnos for select to authenticated
  using (exists (select 1 from public.membresias m join public.licencias l using(institucion_id)
    where m.institucion_id = calendarios_turnos.institucion_id and m.usuario_id = auth.uid() and l.vence >= current_date));
create policy alcance_cal_feriados on public.calendarios_feriados for select to authenticated
  using (exists (select 1 from public.membresias m join public.licencias l using(institucion_id)
    where m.institucion_id = calendarios_feriados.institucion_id and m.usuario_id = auth.uid() and l.vence >= current_date));
create policy alcance_auditoria on public.auditoria_eventos for select to authenticated
  using (public.tiene_permiso_modulo(institucion_id, 'secretaria', array['direccion','secretaria']));

-- 3. Comandos transaccionales seguros (RPC)
create or replace function public.registrar_calendario_institucional(
  p_institucion uuid,
  p_ciclo smallint,
  p_normativa text,
  p_cursado_inicio date,
  p_cursado_fin date,
  p_receso_inicio date,
  p_receso_fin date,
  p_cierre_admin date,
  p_turnos jsonb default '[]'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t jsonb;
begin
  if not public.tiene_permiso_modulo(p_institucion, 'normativa', array['direccion','secretaria']) then
    raise exception 'ACCESO_DENEGADO' using errcode = '42501';
  end if;
  if p_turnos is null or jsonb_typeof(p_turnos) <> 'array' then
    raise exception 'TURNOS_INVALIDOS';
  end if;

  insert into public.calendarios_ciclos(
    institucion_id, ciclo, normativa_fuente, cursado_inicio, cursado_fin,
    receso_inicio, receso_fin, cierre_administrativo
  ) values (
    p_institucion, p_ciclo, btrim(p_normativa), p_cursado_inicio, p_cursado_fin,
    p_receso_inicio, p_receso_fin, p_cierre_admin
  )
  on conflict (institucion_id, ciclo) do update set
    normativa_fuente      = excluded.normativa_fuente,
    cursado_inicio        = excluded.cursado_inicio,
    cursado_fin           = excluded.cursado_fin,
    receso_inicio         = excluded.receso_inicio,
    receso_fin            = excluded.receso_fin,
    cierre_administrativo = excluded.cierre_administrativo;

  delete from public.calendarios_turnos where institucion_id = p_institucion and ciclo = p_ciclo;
  for t in select value from jsonb_array_elements(p_turnos) loop
    insert into public.calendarios_turnos(institucion_id, ciclo, codigo, nombre, inicio, fin, llamados)
    values (
      p_institucion, p_ciclo, btrim(t->>'codigo'), btrim(t->>'nombre'),
      (t->>'inicio')::date, (t->>'fin')::date, coalesce((t->>'llamados')::smallint, 1)
    );
  end loop;

  insert into public.auditoria_eventos(institucion_id, actor_id, modulo, accion, entidad, detalle)
  values (p_institucion, auth.uid(), 'normativa', 'CONFIGURAR_CALENDARIO', 'calendarios_ciclos',
    jsonb_build_object('ciclo', p_ciclo, 'normativa', btrim(p_normativa), 'turnos', jsonb_array_length(p_turnos)));
end;
$$;

-- Alta transaccional de estudiante + matrícula con control estricto de cupo de licencia
create or replace function public.matricular_estudiante(
  p_institucion uuid,
  p_documento text,
  p_nombre text,
  p_plan uuid,
  p_cohorte smallint
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_persona uuid;
  v_matricula uuid;
  v_max integer;
  v_activos integer;
begin
  if not public.tiene_permiso_modulo(p_institucion, 'secretaria', array['direccion','secretaria']) then
    raise exception 'ACCESO_DENEGADO' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_documento,''))) < 5 or length(btrim(coalesce(p_nombre,''))) < 3 then
    raise exception 'DATOS_PERSONA_INVALIDOS';
  end if;

  select max_estudiantes into v_max from public.licencias where institucion_id = p_institucion for share;
  select count(distinct persona_id) into v_activos
  from public.matriculas where institucion_id = p_institucion and estado = 'ACTIVO';

  insert into public.personas(institucion_id, tipo, documento, nombre)
  values (p_institucion, 'estudiante', btrim(p_documento), btrim(p_nombre))
  on conflict (institucion_id, tipo, documento) do update set nombre = excluded.nombre
  returning id into v_persona;

  if not exists (select 1 from public.matriculas where institucion_id = p_institucion and persona_id = v_persona and estado = 'ACTIVO')
     and v_activos >= v_max then
    raise exception 'CUPO_LICENCIA_ALCANZADO';
  end if;

  insert into public.matriculas(institucion_id, persona_id, plan_id, cohorte, estado)
  values (p_institucion, v_persona, p_plan, p_cohorte, 'ACTIVO')
  returning id into v_matricula;

  insert into public.auditoria_eventos(institucion_id, actor_id, modulo, accion, entidad, entidad_id, detalle)
  values (p_institucion, auth.uid(), 'secretaria', 'MATRICULAR_ESTUDIANTE', 'matriculas', v_matricula,
    jsonb_build_object('persona_id', v_persona, 'plan_id', p_plan, 'cohorte', p_cohorte));

  return v_matricula;
end;
$$;

-- Sincronización híbrida e idempotente de asistencias (online o desde cola offline PWA/PC)
create or replace function public.sincronizar_asistencia_lote(
  p_institucion uuid,
  p_ciclo smallint,
  p_fecha date,
  p_origen text,
  p_registros jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cal public.calendarios_ciclos%rowtype;
  r jsonb;
  v_key uuid;
  v_aplicados integer := 0;
  v_omitidos integer := 0;
begin
  if not public.tiene_permiso_modulo(p_institucion, 'asistencia', array['direccion','secretaria','preceptoria','docente']) then
    raise exception 'ACCESO_DENEGADO' using errcode = '42501';
  end if;
  if p_origen not in ('ONLINE','PWA_OFFLINE','ESPEJO_PC') then
    raise exception 'ORIGEN_SYNC_INVALIDO';
  end if;
  if p_registros is null or jsonb_typeof(p_registros) <> 'array' or jsonb_array_length(p_registros) > 500 then
    raise exception 'LOTE_INVALIDO';
  end if;

  select * into v_cal from public.calendarios_ciclos where institucion_id = p_institucion and ciclo = p_ciclo;
  if found then
    if p_fecha < v_cal.cursado_inicio or p_fecha > v_cal.cursado_fin then
      raise exception 'FECHA_FUERA_DE_CURSADO';
    end if;
    if v_cal.receso_inicio is not null and p_fecha between v_cal.receso_inicio and v_cal.receso_fin then
      raise exception 'FECHA_EN_RECESO';
    end if;
  end if;

  for r in select value from jsonb_array_elements(p_registros) loop
    v_key := nullif(r->>'idempotency_key','')::uuid;
    if v_key is not null and exists(
      select 1 from public.asistencias where institucion_id = p_institucion and idempotency_key = v_key
    ) then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;

    insert into public.asistencias(institucion_id, cursada_id, fecha, clase, peso_falta, idempotency_key, origen_sync)
    values (
      p_institucion,
      (r->>'cursada_id')::uuid,
      p_fecha,
      coalesce(nullif(btrim(r->>'clase'),''), 'REGULAR'),
      (r->>'peso_falta')::numeric,
      v_key,
      p_origen
    )
    on conflict (institucion_id, cursada_id, fecha, clase) do update set
      peso_falta      = excluded.peso_falta,
      idempotency_key = coalesce(excluded.idempotency_key, public.asistencias.idempotency_key),
      origen_sync     = excluded.origen_sync,
      registrado_en   = clock_timestamp();
    v_aplicados := v_aplicados + 1;
  end loop;

  insert into public.auditoria_eventos(institucion_id, actor_id, modulo, accion, entidad, origen_sync, detalle)
  values (p_institucion, auth.uid(), 'asistencia', 'SINCRONIZAR_ASISTENCIAS', 'asistencias', p_origen,
    jsonb_build_object('ciclo', p_ciclo, 'fecha', p_fecha, 'aplicados', v_aplicados, 'omitidos', v_omitidos));

  return jsonb_build_object('aplicados', v_aplicados, 'omitidos_idempotentes', v_omitidos);
end;
$$;

revoke all on function public.registrar_calendario_institucional(uuid, smallint, text, date, date, date, date, date, jsonb) from public, anon;
revoke all on function public.matricular_estudiante(uuid, text, text, uuid, smallint) from public, anon;
revoke all on function public.sincronizar_asistencia_lote(uuid, smallint, date, text, jsonb) from public, anon;

grant execute on function public.registrar_calendario_institucional(uuid, smallint, text, date, date, date, date, date, jsonb) to authenticated;
grant execute on function public.matricular_estudiante(uuid, text, text, uuid, smallint) to authenticated;
grant execute on function public.sincronizar_asistencia_lote(uuid, smallint, date, text, jsonb) to authenticated;

commit;
