-- =============================================================================
-- SEMILLA PILOTO SINTÉTICA — SOLO PARA PRUEBAS DE SUMMO (NO DATOS REALES)
-- Cómo usar en el SQL Editor de tu Supabase `summo-plataforma`:
--   1. Creá un usuario en Authentication → Users (ej. con tu correo gestionsummo@gmail.com).
--   2. Reemplazá 'REEMPLAZAR-CON-TU-USER-UUID' por el UUID de ese usuario en auth.users.
--   3. Ejecutá este script completo. Crea 2 instituciones ficticias de jurisdicciones
--      distintas (Misiones y Córdoba) con licencia vigente y membresía asignada.
-- =============================================================================
begin;

do $$
declare
  v_user uuid := nullif('REEMPLAZAR-CON-TU-USER-UUID', 'REEMPLAZAR-CON-TU-USER-UUID')::uuid;
  v_inst_misiones uuid := '10000000-0000-4000-8000-000000000001';
  v_inst_cordoba  uuid := '20000000-0000-4000-8000-000000000002';
begin
  if v_user is null then
    raise exception 'Reemplazá REEMPLAZAR-CON-TU-USER-UUID por tu UUID real de auth.users antes de ejecutar.';
  end if;

  insert into public.instituciones(id, nombre, jurisdiccion, autoridad) values
    (v_inst_misiones, 'Instituto Superior Piloto Misiones', 'Misiones', 'SPEPM / DES'),
    (v_inst_cordoba,  'ISFD Piloto Córdoba', 'Córdoba', 'DGES')
  on conflict (id) do nothing;

  insert into public.licencias(institucion_id, max_estudiantes, modulos, vence) values
    (v_inst_misiones, 500, array['secretaria','asistencia','planificaciones','examenes','normativa'], current_date + 180),
    (v_inst_cordoba,  300, array['secretaria','asistencia','normativa'], current_date + 180)
  on conflict (institucion_id) do update set
    max_estudiantes = excluded.max_estudiantes,
    modulos         = excluded.modulos,
    vence           = excluded.vence;

  insert into public.membresias(institucion_id, usuario_id, rol) values
    (v_inst_misiones, v_user, 'direccion'),
    (v_inst_cordoba,  v_user, 'secretaria')
  on conflict (institucion_id, usuario_id) do update set rol = excluded.rol;
end $$;

commit;
