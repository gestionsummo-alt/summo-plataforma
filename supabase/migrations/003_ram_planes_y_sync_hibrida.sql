-- Migración 003 de SUMMO:
--   1. Configuración normativa RAM/RAI personalizable por institución y formato curricular
--   2. Comandos transaccionales para Planes, Materias y Cursadas
--   3. Consulta segura de auditoría y sincronización híbrida multi-institución
begin;

-- Ampliar public.reglas con parámetros RAM/RAI nacionales (técnicos, profesorados y universidades)
alter table public.reglas
  add column if not exists nivel_tipo text not null default 'TECNICO_SUPERIOR'
    check (nivel_tipo in ('TECNICO_SUPERIOR','PROFESORADO','UNIVERSITARIO')),
  add column if not exists asistencia_justificada_min numeric check (asistencia_justificada_min between 0 and 100),
  add column if not exists peso_tardanza numeric not null default 0.5 check (peso_tardanza between 0 and 1),
  add column if not exists admite_libre boolean not null default true,
  add column if not exists vigencia_unidad text not null default 'TURNOS'
    check (vigencia_unidad in ('TURNOS','ANIOS'));

-- Helper de lectura segura para validar pertenencia y licencia incluyendo preceptoria/docente en asistencia
create or replace function public.crear_plan_institucional(
  p_institucion uuid,
  p_carrera text,
  p_codigo text,
  p_res_jurisdiccional text,
  p_res_nacional text,
  p_cohorte_desde smallint
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
begin
  if not public.tiene_permiso_modulo(p_institucion, 'secretaria', array['direccion','secretaria']) then
    raise exception 'ACCESO_DENEGADO' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_carrera,''))) < 3 or length(btrim(coalesce(p_codigo,''))) < 1 or length(btrim(coalesce(p_res_jurisdiccional,''))) < 3 then
    raise exception 'DATOS_PLAN_INVALIDOS';
  end if;

  insert into public.planes(institucion_id, carrera, codigo, resolucion_jurisdiccional, resolucion_nacional, cohorte_desde)
  values (p_institucion, btrim(p_carrera), upper(btrim(p_codigo)), btrim(p_res_jurisdiccional), nullif(btrim(coalesce(p_res_nacional,'')),''), p_cohorte_desde)
  returning id into v_plan;

  insert into public.auditoria_eventos(institucion_id, actor_id, modulo, accion, entidad, entidad_id, detalle)
  values (p_institucion, auth.uid(), 'secretaria', 'CREAR_PLAN', 'planes', v_plan,
    jsonb_build_object('carrera', btrim(p_carrera), 'codigo', upper(btrim(p_codigo)), 'cohorte_desde', p_cohorte_desde));

  return v_plan;
end;
$$;

create or replace function public.crear_materia_institucional(
  p_institucion uuid,
  p_plan uuid,
  p_codigo text,
  p_nombre text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_materia uuid;
begin
  if not public.tiene_permiso_modulo(p_institucion, 'secretaria', array['direccion','secretaria']) then
    raise exception 'ACCESO_DENEGADO' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_codigo,''))) < 1 or length(btrim(coalesce(p_nombre,''))) < 2 then
    raise exception 'DATOS_MATERIA_INVALIDOS';
  end if;

  insert into public.materias(institucion_id, plan_id, codigo, nombre)
  values (p_institucion, p_plan, upper(btrim(p_codigo)), btrim(p_nombre))
  returning id into v_materia;

  insert into public.auditoria_eventos(institucion_id, actor_id, modulo, accion, entidad, entidad_id, detalle)
  values (p_institucion, auth.uid(), 'secretaria', 'CREAR_MATERIA', 'materias', v_materia,
    jsonb_build_object('plan_id', p_plan, 'codigo', upper(btrim(p_codigo)), 'nombre', btrim(p_nombre)));

  return v_materia;
end;
$$;

create or replace function public.inscribir_cursada_institucional(
  p_institucion uuid,
  p_matricula uuid,
  p_materia uuid,
  p_ciclo smallint,
  p_comision text default 'A'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cursada uuid;
begin
  if not public.tiene_permiso_modulo(p_institucion, 'secretaria', array['direccion','secretaria']) then
    raise exception 'ACCESO_DENEGADO' using errcode = '42501';
  end if;

  insert into public.cursadas(institucion_id, matricula_id, materia_id, ciclo, comision)
  values (p_institucion, p_matricula, p_materia, p_ciclo, coalesce(nullif(upper(btrim(p_comision)),''),'A'))
  returning id into v_cursada;

  insert into public.auditoria_eventos(institucion_id, actor_id, modulo, accion, entidad, entidad_id, detalle)
  values (p_institucion, auth.uid(), 'secretaria', 'INSCRIBIR_CURSADA', 'cursadas', v_cursada,
    jsonb_build_object('matricula_id', p_matricula, 'materia_id', p_materia, 'ciclo', p_ciclo));

  return v_cursada;
end;
$$;

create or replace function public.registrar_regla_normativa(
  p_institucion uuid,
  p_plan uuid,
  p_vigente_desde date,
  p_fuente text,
  p_nivel_tipo text,
  p_asistencia_min numeric,
  p_asistencia_justificada_min numeric,
  p_escala_min numeric,
  p_escala_max numeric,
  p_aprobacion numeric,
  p_promocion numeric,
  p_turnos_vigencia integer,
  p_vigencia_unidad text,
  p_admite_libre boolean,
  p_peso_tardanza numeric
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_regla uuid;
begin
  if not public.tiene_permiso_modulo(p_institucion, 'normativa', array['direccion','secretaria']) then
    raise exception 'ACCESO_DENEGADO' using errcode = '42501';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.reglas where institucion_id = p_institucion and plan_id = p_plan;

  insert into public.reglas(
    institucion_id, plan_id, version, vigente_desde, fuente,
    nivel_tipo, asistencia_min, asistencia_justificada_min,
    escala_min, escala_max, aprobacion, promocion,
    turnos_vigencia, vigencia_unidad, admite_libre, peso_tardanza
  ) values (
    p_institucion, p_plan, v_version, p_vigente_desde, btrim(p_fuente),
    p_nivel_tipo, p_asistencia_min, p_asistencia_justificada_min,
    p_escala_min, p_escala_max, p_aprobacion, p_promocion,
    p_turnos_vigencia, p_vigencia_unidad, p_admite_libre, p_peso_tardanza
  ) returning id into v_regla;

  insert into public.auditoria_eventos(institucion_id, actor_id, modulo, accion, entidad, entidad_id, detalle)
  values (p_institucion, auth.uid(), 'normativa', 'VERSIONAR_REGLA', 'reglas', v_regla,
    jsonb_build_object('plan_id', p_plan, 'version', v_version, 'nivel', p_nivel_tipo, 'fuente', btrim(p_fuente)));

  return v_regla;
end;
$$;

-- Permitir a preceptoria/docentes autenticados con licencia leer cursadas, materias y personas de su institucion
drop policy if exists alcance_asist_cursadas on public.cursadas;
create policy alcance_asist_cursadas on public.cursadas for select to authenticated
  using (public.tiene_permiso_modulo(institucion_id, 'asistencia', array['direccion','secretaria','preceptoria','docente']));

drop policy if exists alcance_asist_matriculas on public.matriculas;
create policy alcance_asist_matriculas on public.matriculas for select to authenticated
  using (public.tiene_permiso_modulo(institucion_id, 'asistencia', array['direccion','secretaria','preceptoria','docente']));

drop policy if exists alcance_asist_personas on public.personas;
create policy alcance_asist_personas on public.personas for select to authenticated
  using (public.tiene_permiso_modulo(institucion_id, 'asistencia', array['direccion','secretaria','preceptoria','docente']));

drop policy if exists alcance_asist_materias on public.materias;
create policy alcance_asist_materias on public.materias for select to authenticated
  using (public.tiene_permiso_modulo(institucion_id, 'asistencia', array['direccion','secretaria','preceptoria','docente']));

revoke all on function public.crear_plan_institucional(uuid, text, text, text, text, smallint) from public, anon;
revoke all on function public.crear_materia_institucional(uuid, uuid, text, text) from public, anon;
revoke all on function public.inscribir_cursada_institucional(uuid, uuid, uuid, smallint, text) from public, anon;
revoke all on function public.registrar_regla_normativa(uuid, uuid, date, text, text, numeric, numeric, numeric, numeric, numeric, numeric, integer, text, boolean, numeric) from public, anon;

grant execute on function public.crear_plan_institucional(uuid, text, text, text, text, smallint) to authenticated;
grant execute on function public.crear_materia_institucional(uuid, uuid, text, text) to authenticated;
grant execute on function public.inscribir_cursada_institucional(uuid, uuid, uuid, smallint, text) to authenticated;
grant execute on function public.registrar_regla_normativa(uuid, uuid, date, text, text, numeric, numeric, numeric, numeric, numeric, numeric, integer, text, boolean, numeric) to authenticated;

commit;
