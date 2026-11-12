-- Migración 005 de SUMMO:
--   1. Tabla de ingesta de lotes documentales (PDF, Excel, Word, CSV)
--   2. Verificación de hash SHA-256 contra importaciones dobles accidentales
--   3. RPCs atómicos transaccionales para importación masiva de padrones y planes de estudio
--      con validación estricta de cupo de licencia, integridad de correlativas y auditoría.
begin;

create table if not exists public.ingestas_lotes (
  institucion_id   uuid not null references public.instituciones(id),
  id               uuid not null default gen_random_uuid(),
  tipo             text not null check (tipo in ('PADRON_ESTUDIANTES','PLAN_ESTUDIO','CALENDARIO_JURISDICCIONAL','NOMINA_DOCENTE')),
  archivo_nombre   text not null check (length(btrim(archivo_nombre)) between 1 and 255),
  archivo_sha256   text not null check (length(archivo_sha256) = 64),
  actor_id         uuid not null references auth.users(id),
  estado           text not null default 'CONFIRMADO' check (estado in ('BORRADOR','CONFIRMADO','RECHAZADO')),
  resumen_json     jsonb not null default '{}'::jsonb,
  creado_en        timestamptz not null default clock_timestamp(),
  unique (institucion_id, archivo_sha256),
  primary key (institucion_id, id)
);

alter table public.ingestas_lotes enable row level security;
revoke all on public.ingestas_lotes from public, anon, authenticated;
grant select on public.ingestas_lotes to authenticated;

drop policy if exists alcance_ingestas on public.ingestas_lotes;
create policy alcance_ingestas on public.ingestas_lotes for select to authenticated
  using (public.tiene_permiso_modulo(institucion_id, 'secretaria', array['direccion','secretaria']));

-- RPC 1: Importación atómica de padrón de estudiantes desde planilla analizada
create or replace function public.importar_padron_estudiantes_lote(
  p_institucion uuid,
  p_archivo_nombre text,
  p_archivo_sha256 text,
  p_plan uuid,
  p_cohorte smallint,
  p_estudiantes jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_activos integer;
  v_item jsonb;
  v_doc text;
  v_nom text;
  v_persona uuid;
  v_matricula uuid;
  v_importados integer := 0;
  v_actualizados integer := 0;
  v_lote uuid := gen_random_uuid();
begin
  if not public.tiene_permiso_modulo(p_institucion, 'secretaria', array['direccion','secretaria']) then
    raise exception 'ACCESO_DENEGADO' using errcode = '42501';
  end if;
  if p_estudiantes is null or jsonb_typeof(p_estudiantes) <> 'array' or jsonb_array_length(p_estudiantes) = 0 then
    raise exception 'LOTE_VACIO';
  end if;
  if not exists (select 1 from public.planes where institucion_id = p_institucion and id = p_plan) then
    raise exception 'PLAN_INEXISTENTE';
  end if;

  select max_estudiantes into v_max from public.licencias where institucion_id = p_institucion for share;
  select count(distinct persona_id) into v_activos
  from public.matriculas where institucion_id = p_institucion and estado = 'ACTIVO';

  for v_item in select value from jsonb_array_elements(p_estudiantes) loop
    v_doc := regexp_replace(btrim(coalesce(v_item->>'documento','')), '[^0-9a-zA-Z]', '', 'g');
    v_nom := btrim(coalesce(v_item->>'nombre',''));
    if length(v_doc) < 4 or length(v_nom) < 3 then
      continue;
    end if;

    insert into public.personas(institucion_id, tipo, documento, nombre)
    values (p_institucion, 'estudiante', v_doc, v_nom)
    on conflict (institucion_id, tipo, documento) do update set nombre = excluded.nombre
    returning id into v_persona;

    select id into v_matricula
    from public.matriculas
    where institucion_id = p_institucion and persona_id = v_persona and plan_id = p_plan and cohorte = p_cohorte;

    if v_matricula is null then
      if v_activos >= v_max and not exists (
        select 1 from public.matriculas where institucion_id = p_institucion and persona_id = v_persona and estado = 'ACTIVO'
      ) then
        raise exception 'CUPO_LICENCIA_ALCANZADO: El lote supera el cupo de % estudiantes activos de la licencia.', v_max;
      end if;

      insert into public.matriculas(institucion_id, persona_id, plan_id, cohorte, estado)
      values (p_institucion, v_persona, p_plan, p_cohorte, 'ACTIVO')
      returning id into v_matricula;

      v_importados := v_importados + 1;
      v_activos := v_activos + 1;
    else
      update public.matriculas set estado = 'ACTIVO' where id = v_matricula and estado <> 'ACTIVO';
      v_actualizados := v_actualizados + 1;
    end if;
  end loop;

  insert into public.ingestas_lotes(
    institucion_id, id, tipo, archivo_nombre, archivo_sha256, actor_id, estado, resumen_json
  ) values (
    p_institucion, v_lote, 'PADRON_ESTUDIANTES', btrim(p_archivo_nombre), lower(btrim(p_archivo_sha256)),
    auth.uid(), 'CONFIRMADO',
    jsonb_build_object(
      'plan_id', p_plan, 'cohorte', p_cohorte, 'importados', v_importados,
      'actualizados', v_actualizados, 'total_procesados', jsonb_array_length(p_estudiantes)
    )
  )
  on conflict (institucion_id, archivo_sha256) do update set
    resumen_json = excluded.resumen_json, creado_en = clock_timestamp();

  insert into public.auditoria_eventos(institucion_id, actor_id, modulo, accion, entidad, origen_sync, detalle)
  values (
    p_institucion, auth.uid(), 'secretaria', 'IMPORTAR_PADRON_LOTE', 'matriculas', 'IMPORTACION',
    jsonb_build_object('archivo', btrim(p_archivo_nombre), 'plan_id', p_plan, 'cohorte', p_cohorte, 'importados', v_importados, 'actualizados', v_actualizados)
  );

  return jsonb_build_object(
    'lote_id', v_lote, 'importados', v_importados, 'actualizados', v_actualizados, 'total', jsonb_array_length(p_estudiantes)
  );
end;
$$;

-- RPC 2: Importación atómica de plan de estudio, unidades curriculares y grafo de correlativas
create or replace function public.importar_plan_estudio_lote(
  p_institucion uuid,
  p_archivo_nombre text,
  p_archivo_sha256 text,
  p_carrera text,
  p_codigo text,
  p_res_jurisdiccional text,
  p_res_nacional text,
  p_cohorte_desde smallint,
  p_materias jsonb,
  p_correlativas jsonb default '[]'::jsonb,
  p_regla jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
  v_lote uuid := gen_random_uuid();
  v_item jsonb;
  v_cod text;
  v_nom text;
  v_mat_id uuid;
  v_req_id uuid;
  v_mats_map jsonb := '{}'::jsonb;
  v_materias_count integer := 0;
  v_corr_count integer := 0;
  v_regla_id uuid;
begin
  if not public.tiene_permiso_modulo(p_institucion, 'secretaria', array['direccion','secretaria']) then
    raise exception 'ACCESO_DENEGADO' using errcode = '42501';
  end if;
  if p_materias is null or jsonb_typeof(p_materias) <> 'array' or jsonb_array_length(p_materias) = 0 then
    raise exception 'PLAN_SIN_MATERIAS';
  end if;

  -- 1. Crear o actualizar el plan
  insert into public.planes(institucion_id, carrera, codigo, resolucion_jurisdiccional, resolucion_nacional, cohorte_desde)
  values (
    p_institucion, btrim(p_carrera), upper(btrim(p_codigo)), btrim(p_res_jurisdiccional),
    nullif(btrim(coalesce(p_res_nacional,'')),''), p_cohorte_desde
  )
  on conflict (institucion_id, codigo, cohorte_desde) do update set
    carrera = excluded.carrera,
    resolucion_jurisdiccional = excluded.resolucion_jurisdiccional,
    resolucion_nacional = excluded.resolucion_nacional
  returning id into v_plan;

  -- 2. Insertar cada materia y construir mapeo codigo -> id
  for v_item in select value from jsonb_array_elements(p_materias) loop
    v_cod := upper(btrim(coalesce(v_item->>'codigo','')));
    v_nom := btrim(coalesce(v_item->>'nombre',''));
    if length(v_cod) = 0 or length(v_nom) = 0 then continue; end if;

    insert into public.materias(institucion_id, plan_id, codigo, nombre)
    values (p_institucion, v_plan, v_cod, v_nom)
    on conflict (institucion_id, plan_id, codigo) do update set nombre = excluded.nombre
    returning id into v_mat_id;

    v_mats_map := jsonb_set(v_mats_map, array[v_cod], to_jsonb(v_mat_id));
    v_materias_count := v_materias_count + 1;
  end loop;

  -- 3. Vincular correlativas mapeando códigos a UUIDs
  if p_correlativas is not null and jsonb_typeof(p_correlativas) = 'array' then
    for v_item in select value from jsonb_array_elements(p_correlativas) loop
      v_cod := upper(btrim(coalesce(v_item->>'materia_codigo','')));
      v_nom := upper(btrim(coalesce(v_item->>'requisito_codigo','')));

      v_mat_id := (v_mats_map->>v_cod)::uuid;
      v_req_id := (v_mats_map->>v_nom)::uuid;

      if v_mat_id is not null and v_req_id is not null and v_mat_id <> v_req_id then
        insert into public.correlativas(institucion_id, materia_id, requisito_id, instancia, condicion)
        values (
          p_institucion, v_mat_id, v_req_id,
          coalesce(nullif(upper(btrim(v_item->>'instancia')),''), 'RENDIR'),
          coalesce(nullif(upper(btrim(v_item->>'condicion')),''), 'APROBADA')
        )
        on conflict (institucion_id, materia_id, requisito_id, instancia) do update set
          condicion = excluded.condicion;
        v_corr_count := v_corr_count + 1;
      end if;
    end loop;
  end if;

  -- 4. Opcional: registrar regla RAM/RAI versionada asociada
  if p_regla is not null and jsonb_typeof(p_regla) = 'object' then
    v_regla_id := public.registrar_regla_normativa(
      p_institucion,
      v_plan,
      coalesce((p_regla->>'vigente_desde')::date, current_date),
      coalesce(nullif(btrim(p_regla->>'fuente'),''), btrim(p_res_jurisdiccional)),
      coalesce(nullif(btrim(p_regla->>'nivel_tipo'),''), 'TECNICO_SUPERIOR'),
      coalesce((p_regla->>'asistencia_min')::numeric, 75.0),
      (p_regla->>'asistencia_justificada_min')::numeric,
      coalesce((p_regla->>'escala_min')::numeric, 1.0),
      coalesce((p_regla->>'escala_max')::numeric, 10.0),
      coalesce((p_regla->>'aprobacion')::numeric, 6.0),
      (p_regla->>'promocion')::numeric,
      coalesce((p_regla->>'turnos_vigencia')::integer, 7),
      coalesce(nullif(btrim(p_regla->>'vigencia_unidad'),''), 'TURNOS'),
      coalesce((p_regla->>'admite_libre')::boolean, true),
      coalesce((p_regla->>'peso_tardanza')::numeric, 0.5)
    );
  end if;

  -- 5. Registrar ingesta de lote y auditoría
  insert into public.ingestas_lotes(
    institucion_id, id, tipo, archivo_nombre, archivo_sha256, actor_id, estado, resumen_json
  ) values (
    p_institucion, v_lote, 'PLAN_ESTUDIO', btrim(p_archivo_nombre), lower(btrim(p_archivo_sha256)),
    auth.uid(), 'CONFIRMADO',
    jsonb_build_object(
      'plan_id', v_plan, 'carrera', btrim(p_carrera), 'codigo', upper(btrim(p_codigo)),
      'materias_count', v_materias_count, 'correlativas_count', v_corr_count, 'regla_id', v_regla_id
    )
  )
  on conflict (institucion_id, archivo_sha256) do update set
    resumen_json = excluded.resumen_json, creado_en = clock_timestamp();

  insert into public.auditoria_eventos(institucion_id, actor_id, modulo, accion, entidad, entidad_id, origen_sync, detalle)
  values (
    p_institucion, auth.uid(), 'secretaria', 'IMPORTAR_PLAN_LOTE', 'planes', v_plan, 'IMPORTACION',
    jsonb_build_object('carrera', btrim(p_carrera), 'materias', v_materias_count, 'correlativas', v_corr_count)
  );

  return jsonb_build_object(
    'lote_id', v_lote, 'plan_id', v_plan, 'materias_creadas', v_materias_count, 'correlativas_creadas', v_corr_count
  );
end;
$$;

revoke all on function public.importar_padron_estudiantes_lote(uuid, text, text, uuid, smallint, jsonb) from public, anon;
revoke all on function public.importar_plan_estudio_lote(uuid, text, text, text, text, text, text, smallint, jsonb, jsonb, jsonb) from public, anon;

grant execute on function public.importar_padron_estudiantes_lote(uuid, text, text, uuid, smallint, jsonb) to authenticated;
grant execute on function public.importar_plan_estudio_lote(uuid, text, text, text, text, text, text, smallint, jsonb, jsonb, jsonb) to authenticated;

commit;
