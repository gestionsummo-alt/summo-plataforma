-- Migración 004 de SUMMO:
--   1. Módulo Planificaciones Docentes versionadas (BORRADOR -> EN_REVISION -> APROBADA)
--   2. Correlativas duales (CURSAR / RENDIR) y alta de docentes
--   3. Módulo Mesas de Examen, Inscripciones con control de correlativas y Actas Volante/Definitiva
--      con soporte híbrido idempotente y bloqueo inmutable tras cierre definitivo.
begin;

-- Permitir también docentes/preceptores leer tablas necesarias cuando su módulo está licenciado
drop policy if exists alcance_planif_materias on public.materias;
create policy alcance_planif_materias on public.materias for select to authenticated
  using (public.tiene_permiso_modulo(institucion_id, 'planificaciones', array['direccion','secretaria','docente']));

drop policy if exists alcance_planif_personas on public.personas;
create policy alcance_planif_personas on public.personas for select to authenticated
  using (public.tiene_permiso_modulo(institucion_id, 'planificaciones', array['direccion','secretaria','docente']));

drop policy if exists alcance_planif_docente on public.planificaciones;
create policy alcance_planif_docente on public.planificaciones for select to authenticated
  using (public.tiene_permiso_modulo(institucion_id, 'planificaciones', array['direccion','secretaria','docente']));

drop policy if exists alcance_exam_materias on public.materias;
create policy alcance_exam_materias on public.materias for select to authenticated
  using (public.tiene_permiso_modulo(institucion_id, 'examenes', array['direccion','secretaria','docente']));

drop policy if exists alcance_exam_matriculas on public.matriculas;
create policy alcance_exam_matriculas on public.matriculas for select to authenticated
  using (public.tiene_permiso_modulo(institucion_id, 'examenes', array['direccion','secretaria','docente']));

drop policy if exists alcance_exam_personas on public.personas;
create policy alcance_exam_personas on public.personas for select to authenticated
  using (public.tiene_permiso_modulo(institucion_id, 'examenes', array['direccion','secretaria','docente']));

drop policy if exists alcance_exam_reglas on public.reglas;
create policy alcance_exam_reglas on public.reglas for select to authenticated
  using (public.tiene_permiso_modulo(institucion_id, 'examenes', array['direccion','secretaria']));

drop policy if exists alcance_exam_correlativas on public.correlativas;
create policy alcance_exam_correlativas on public.correlativas for select to authenticated
  using (public.tiene_permiso_modulo(institucion_id, 'examenes', array['direccion','secretaria']));

-- Campos de trazabilidad e idempotencia híbrida en actas
alter table public.actas
  add column if not exists origen_sync text not null default 'ONLINE' check (origen_sync in ('ONLINE','PWA_OFFLINE','ESPEJO_PC')),
  add column if not exists cerrado_en timestamptz,
  add column if not exists cerrado_por uuid references auth.users(id);

-- 1. Alta de docente en padrón institucional
create or replace function public.registrar_docente_institucional(
  p_institucion uuid,
  p_documento text,
  p_nombre text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_docente uuid;
begin
  if not (
    public.tiene_permiso_modulo(p_institucion, 'secretaria', array['direccion','secretaria'])
    or public.tiene_permiso_modulo(p_institucion, 'planificaciones', array['direccion','secretaria'])
  ) then
    raise exception 'ACCESO_DENEGADO' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_documento,''))) < 5 or length(btrim(coalesce(p_nombre,''))) < 3 then
    raise exception 'DATOS_PERSONA_INVALIDOS';
  end if;

  insert into public.personas(institucion_id, tipo, documento, nombre)
  values (p_institucion, 'docente', btrim(p_documento), btrim(p_nombre))
  on conflict (institucion_id, tipo, documento) do update set nombre = excluded.nombre
  returning id into v_docente;

  insert into public.auditoria_eventos(institucion_id, actor_id, modulo, accion, entidad, entidad_id, detalle)
  values (p_institucion, auth.uid(), 'planificaciones', 'REGISTRAR_DOCENTE', 'personas', v_docente,
    jsonb_build_object('documento', btrim(p_documento), 'nombre', btrim(p_nombre)));

  return v_docente;
end;
$$;

-- 2. Alta de correlativa institucional (CURSAR / RENDIR)
create or replace function public.agregar_correlativa_institucional(
  p_institucion uuid,
  p_materia uuid,
  p_requisito uuid,
  p_instancia text,
  p_condicion text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.tiene_permiso_modulo(p_institucion, 'normativa', array['direccion','secretaria']) then
    raise exception 'ACCESO_DENEGADO' using errcode = '42501';
  end if;
  if p_materia = p_requisito then
    raise exception 'CORRELATIVA_CIRCULAR';
  end if;

  insert into public.correlativas(institucion_id, materia_id, requisito_id, instancia, condicion)
  values (p_institucion, p_materia, p_requisito, p_instancia, p_condicion)
  returning id into v_id;

  insert into public.auditoria_eventos(institucion_id, actor_id, modulo, accion, entidad, entidad_id, detalle)
  values (p_institucion, auth.uid(), 'normativa', 'AGREGAR_CORRELATIVA', 'correlativas', v_id,
    jsonb_build_object('materia_id', p_materia, 'requisito_id', p_requisito, 'instancia', p_instancia, 'condicion', p_condicion));

  return v_id;
end;
$$;

-- 3. Planificaciones docentes versionadas
create or replace function public.guardar_planificacion_institucional(
  p_institucion uuid,
  p_materia uuid,
  p_docente uuid,
  p_contenido text,
  p_estado text default 'BORRADOR'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_id uuid;
begin
  if not public.tiene_permiso_modulo(p_institucion, 'planificaciones', array['direccion','secretaria','docente']) then
    raise exception 'ACCESO_DENEGADO' using errcode = '42501';
  end if;
  if p_estado not in ('BORRADOR','EN_REVISION','APROBADA') or length(btrim(coalesce(p_contenido,''))) < 10 then
    raise exception 'DATOS_PLANIFICACION_INVALIDOS';
  end if;
  if p_estado = 'APROBADA' and not public.tiene_permiso_modulo(p_institucion, 'planificaciones', array['direccion','secretaria']) then
    raise exception 'SOLO_DIRECCION_APRUEBA';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.planificaciones
  where institucion_id = p_institucion and materia_id = p_materia and docente_id = p_docente;

  insert into public.planificaciones(institucion_id, materia_id, docente_id, version, contenido, estado)
  values (p_institucion, p_materia, p_docente, v_version, btrim(p_contenido), p_estado)
  returning id into v_id;

  insert into public.auditoria_eventos(institucion_id, actor_id, modulo, accion, entidad, entidad_id, detalle)
  values (p_institucion, auth.uid(), 'planificaciones', 'GUARDAR_PLANIFICACION', 'planificaciones', v_id,
    jsonb_build_object('materia_id', p_materia, 'docente_id', p_docente, 'version', v_version, 'estado', p_estado));

  return v_id;
end;
$$;

-- 4. Mesas de examen, inscripción con correlativas y actas Volante/Definitiva
create or replace function public.crear_mesa_institucional(
  p_institucion uuid,
  p_materia uuid,
  p_fecha timestamptz,
  p_cierre timestamptz,
  p_llamado smallint default 1
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mesa uuid;
begin
  if not public.tiene_permiso_modulo(p_institucion, 'examenes', array['direccion','secretaria']) then
    raise exception 'ACCESO_DENEGADO' using errcode = '42501';
  end if;
  if p_fecha is null or p_cierre is null or p_cierre >= p_fecha or p_llamado < 1 then
    raise exception 'DATOS_MESA_INVALIDOS';
  end if;

  insert into public.mesas(institucion_id, materia_id, fecha, cierre, llamado)
  values (p_institucion, p_materia, p_fecha, p_cierre, p_llamado)
  returning id into v_mesa;

  insert into public.auditoria_eventos(institucion_id, actor_id, modulo, accion, entidad, entidad_id, detalle)
  values (p_institucion, auth.uid(), 'examenes', 'CREAR_MESA', 'mesas', v_mesa,
    jsonb_build_object('materia_id', p_materia, 'fecha', p_fecha, 'cierre', p_cierre, 'llamado', p_llamado));

  return v_mesa;
end;
$$;

create or replace function public.inscribir_examen_institucional(
  p_institucion uuid,
  p_mesa uuid,
  p_matricula uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mesa public.mesas%rowtype;
  v_mat public.matriculas%rowtype;
  v_req record;
  v_ins uuid;
begin
  if not public.tiene_permiso_modulo(p_institucion, 'examenes', array['direccion','secretaria']) then
    raise exception 'ACCESO_DENEGADO' using errcode = '42501';
  end if;

  select * into v_mesa from public.mesas where institucion_id = p_institucion and id = p_mesa for share;
  if not found then raise exception 'MESA_INEXISTENTE'; end if;
  if clock_timestamp() >= v_mesa.cierre then raise exception 'INSCRIPCION_CERRADA'; end if;

  select * into v_mat from public.matriculas where institucion_id = p_institucion and id = p_matricula for share;
  if not found or v_mat.estado <> 'ACTIVO' then raise exception 'MATRICULA_NO_ACTIVA'; end if;

  -- Validar correlativas de instancia RENDIR para la materia de la mesa
  for v_req in
    select c.requisito_id, c.condicion
    from public.correlativas c
    where c.institucion_id = p_institucion
      and c.materia_id = v_mesa.materia_id
      and c.instancia = 'RENDIR'
  loop
    if v_req.condicion = 'APROBADA' then
      if not exists (
        select 1
        from public.resultados r
        join public.actas a on a.institucion_id = r.institucion_id and a.id = r.acta_id
        join public.mesas m on m.institucion_id = a.institucion_id and m.id = a.mesa_id
        join public.inscripciones_examen ie on ie.institucion_id = r.institucion_id and ie.id = r.inscripcion_id
        where r.institucion_id = p_institucion
          and ie.matricula_id = p_matricula
          and m.materia_id = v_req.requisito_id
          and a.tipo = 'DEFINITIVA'
          and r.condicion = 'APROBADO'
      ) then
        raise exception 'CORRELATIVAS_PENDIENTES';
      end if;
    elsif v_req.condicion = 'REGULAR' then
      if not exists (
        select 1
        from public.cursadas cu
        where cu.institucion_id = p_institucion
          and cu.matricula_id = p_matricula
          and cu.materia_id = v_req.requisito_id
      ) then
        raise exception 'CORRELATIVAS_PENDIENTES';
      end if;
    end if;
  end loop;

  insert into public.inscripciones_examen(institucion_id, mesa_id, matricula_id)
  values (p_institucion, p_mesa, p_matricula)
  returning id into v_ins;

  insert into public.auditoria_eventos(institucion_id, actor_id, modulo, accion, entidad, entidad_id, detalle)
  values (p_institucion, auth.uid(), 'examenes', 'INSCRIBIR_EXAMEN', 'inscripciones_examen', v_ins,
    jsonb_build_object('mesa_id', p_mesa, 'matricula_id', p_matricula));

  return v_ins;
end;
$$;

create or replace function public.guardar_acta_examen_hibrida(
  p_institucion uuid,
  p_mesa uuid,
  p_regla uuid,
  p_referencia text,
  p_cerrar_definitiva boolean,
  p_resultados jsonb,
  p_origen text default 'ONLINE'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mesa public.mesas%rowtype;
  v_regla public.reglas%rowtype;
  v_tipo text := case when p_cerrar_definitiva then 'DEFINITIVA' else 'VOLANTE' end;
  v_version integer;
  v_acta uuid;
  v_item jsonb;
  v_nota numeric;
  v_condicion text;
  v_guardados integer := 0;
begin
  if not public.tiene_permiso_modulo(p_institucion, 'examenes', array['direccion','secretaria']) then
    raise exception 'ACCESO_DENEGADO' using errcode = '42501';
  end if;
  if p_origen not in ('ONLINE','PWA_OFFLINE','ESPEJO_PC') then
    raise exception 'ORIGEN_SYNC_INVALIDO';
  end if;
  if length(btrim(coalesce(p_referencia,''))) < 2 or p_resultados is null or jsonb_typeof(p_resultados) <> 'array' then
    raise exception 'DATOS_ACTA_INVALIDOS';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_institucion::text || ':' || p_mesa::text, 0));

  select * into v_mesa from public.mesas where institucion_id = p_institucion and id = p_mesa for update;
  if not found then raise exception 'MESA_INEXISTENTE'; end if;

  if exists (
    select 1 from public.actas where institucion_id = p_institucion and mesa_id = p_mesa and tipo = 'DEFINITIVA'
  ) then
    raise exception 'ACTA_DEFINITIVA_INMUTABLE';
  end if;

  if p_cerrar_definitiva and not exists (
    select 1 from public.actas where institucion_id = p_institucion and mesa_id = p_mesa and tipo = 'VOLANTE'
  ) then
    raise exception 'ACTA_VOLANTE_PREVIA_REQUERIDA';
  end if;

  select * into v_regla from public.reglas where institucion_id = p_institucion and id = p_regla for share;
  if not found then raise exception 'REGLA_INEXISTENTE'; end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.actas where institucion_id = p_institucion and mesa_id = p_mesa and tipo = v_tipo;

  insert into public.actas(institucion_id, mesa_id, regla_id, version, tipo, referencia, origen_sync, cerrado_en, cerrado_por)
  values (
    p_institucion, p_mesa, p_regla, v_version, v_tipo, btrim(p_referencia), p_origen,
    case when p_cerrar_definitiva then clock_timestamp() else null end,
    case when p_cerrar_definitiva then auth.uid() else null end
  )
  returning id into v_acta;

  for v_item in select value from jsonb_array_elements(p_resultados) loop
    v_nota := case
      when jsonb_typeof(v_item->'nota') = 'number' then (v_item->>'nota')::numeric
      else null
    end;

    if v_nota is not null and (v_nota < v_regla.escala_min or v_nota > v_regla.escala_max) then
      raise exception 'NOTA_FUERA_DE_ESCALA';
    end if;

    v_condicion := case
      when coalesce(upper(btrim(v_item->>'condicion')), '') = 'AUSENTE' or v_nota is null then 'AUSENTE'
      when v_nota >= v_regla.aprobacion then 'APROBADO'
      else 'DESAPROBADO'
    end;

    insert into public.resultados(institucion_id, acta_id, inscripcion_id, nota, condicion)
    values (p_institucion, v_acta, (v_item->>'inscripcion_id')::uuid, v_nota, v_condicion);
    v_guardados := v_guardados + 1;
  end loop;

  insert into public.auditoria_eventos(institucion_id, actor_id, modulo, accion, entidad, entidad_id, origen_sync, detalle)
  values (
    p_institucion, auth.uid(), 'examenes',
    case when p_cerrar_definitiva then 'CERRAR_ACTA_DEFINITIVA' else 'GUARDAR_ACTA_VOLANTE' end,
    'actas', v_acta, p_origen,
    jsonb_build_object('mesa_id', p_mesa, 'version', v_version, 'referencia', btrim(p_referencia), 'resultados', v_guardados)
  );

  return jsonb_build_object('acta_id', v_acta, 'tipo', v_tipo, 'version', v_version, 'resultados', v_guardados);
end;
$$;

revoke all on function public.registrar_docente_institucional(uuid, text, text) from public, anon;
revoke all on function public.agregar_correlativa_institucional(uuid, uuid, uuid, text, text) from public, anon;
revoke all on function public.guardar_planificacion_institucional(uuid, uuid, uuid, text, text) from public, anon;
revoke all on function public.crear_mesa_institucional(uuid, uuid, timestamptz, timestamptz, smallint) from public, anon;
revoke all on function public.inscribir_examen_institucional(uuid, uuid, uuid) from public, anon;
revoke all on function public.guardar_acta_examen_hibrida(uuid, uuid, uuid, text, boolean, jsonb, text) from public, anon;

grant execute on function public.registrar_docente_institucional(uuid, text, text) to authenticated;
grant execute on function public.agregar_correlativa_institucional(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.guardar_planificacion_institucional(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.crear_mesa_institucional(uuid, uuid, timestamptz, timestamptz, smallint) to authenticated;
grant execute on function public.inscribir_examen_institucional(uuid, uuid, uuid) to authenticated;
grant execute on function public.guardar_acta_examen_hibrida(uuid, uuid, uuid, text, boolean, jsonb, text) to authenticated;

commit;
