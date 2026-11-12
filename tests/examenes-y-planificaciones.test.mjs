import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { evaluarCondicionExamen, fusionarActaVolante } from "../lib/hibrido/fusion-acta.ts";

test("SUMMO 004: planificaciones, correlativas RENDIR, actas volante->definitiva inmutable y aislamiento", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/001_base.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/002_calendario_normativa_y_escritura.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/003_ram_planes_y_sync_hibrida.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/004_examenes_actas_y_planificaciones.sql", import.meta.url), "utf8"));

    const instA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const instB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const userSecA = "11111111-1111-4111-8111-111111111111";
    const userDocA = "22222222-2222-4222-8222-222222222222";

    await db.exec(`
      insert into auth.users values ('${userSecA}'), ('${userDocA}');
      insert into instituciones(id, nombre, jurisdiccion) values
        ('${instA}', 'Instituto Técnico Misiones', 'Misiones'),
        ('${instB}', 'Universidad Piloto', 'Buenos Aires');
      insert into membresias values
        ('${instA}', '${userSecA}', 'secretaria'),
        ('${instA}', '${userDocA}', 'docente');
      insert into licencias values
        ('${instA}', 100, array['secretaria','asistencia','planificaciones','examenes','normativa'], current_date + 60),
        ('${instB}', 100, array['secretaria','asistencia','planificaciones','examenes','normativa'], current_date + 60);
    `);

    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userSecA}', false);`);
    const planA = (await db.query(`select public.crear_plan_institucional($1, 'Tecnicatura Digital', 'TD', 'Res. 051/19', null, 2026::smallint) id`, [instA])).rows[0].id;
    const mat1 = (await db.query(`select public.crear_materia_institucional($1, $2, 'M1', 'Sonido I') id`, [instA, planA])).rows[0].id;
    const mat2 = (await db.query(`select public.crear_materia_institucional($1, $2, 'M2', 'Sonido II') id`, [instA, planA])).rows[0].id;
    const reglaA = (await db.query(`select public.registrar_regla_normativa($1, $2, current_date, 'RAM 051/19', 'TECNICO_SUPERIOR', 75, 60, 1, 10, 6, null, 7, 'TURNOS', true, 0.5) id`, [instA, planA])).rows[0].id;

    // Correlativa: para rendir M2 requiere M1 aprobada
    await db.query(`select public.agregar_correlativa_institucional($1, $2, $3, 'RENDIR', 'APROBADA')`, [instA, mat2, mat1]);

    // Docente y planificación: docente no puede aprobar, secretaría sí
    const docId = (await db.query(`select public.registrar_docente_institucional($1, '28111222', 'Profe Sonido') id`, [instA])).rows[0].id;
    await db.exec(`select set_config('request.jwt.claim.sub', '${userDocA}', false);`);
    await db.query(`select public.guardar_planificacion_institucional($1, $2, $3, 'Programa anual de Sonido I con prácticas de estudio.', 'EN_REVISION')`, [instA, mat1, docId]);
    await assert.rejects(
      db.query(`select public.guardar_planificacion_institucional($1, $2, $3, 'Intento aprobar como docente sin permiso.', 'APROBADA')`, [instA, mat1, docId]),
      /SOLO_DIRECCION_APRUEBA/,
    );
    await db.exec(`select set_config('request.jwt.claim.sub', '${userSecA}', false);`);
    await db.query(`select public.guardar_planificacion_institucional($1, $2, $3, 'Programa aprobado por Dirección/Secretaría.', 'APROBADA')`, [instA, mat1, docId]);

    // Matricular estudiante y habilitar mesas futuras
    const estMat = (await db.query(`select public.matricular_estudiante($1, '45123456', 'Alumna Prueba', $2, 2026::smallint) id`, [instA, planA])).rows[0].id;
    const mesa1 = (await db.query(`select public.crear_mesa_institucional($1, $2, now() + interval '5 days', now() + interval '3 days', 1::smallint) id`, [instA, mat1])).rows[0].id;
    const mesa2 = (await db.query(`select public.crear_mesa_institucional($1, $2, now() + interval '10 days', now() + interval '8 days', 1::smallint) id`, [instA, mat2])).rows[0].id;

    // Sin M1 aprobada, no puede inscribirse en M2
    await assert.rejects(
      db.query(`select public.inscribir_examen_institucional($1, $2, $3)`, [instA, mesa2, estMat]),
      /CORRELATIVAS_PENDIENTES/,
    );

    // Se inscribe en M1, no permite cerrar definitiva sin volante previa
    const ins1 = (await db.query(`select public.inscribir_examen_institucional($1, $2, $3) id`, [instA, mesa1, estMat])).rows[0].id;
    await assert.rejects(
      db.query(`select public.guardar_acta_examen_hibrida($1, $2, $3, 'FOL-01', true, $4::jsonb, 'ONLINE')`, [
        instA, mesa1, reglaA, JSON.stringify([{ inscripcion_id: ins1, nota: 8, condicion: "APROBADO" }]),
      ]),
      /ACTA_VOLANTE_PREVIA_REQUERIDA/,
    );

    // Guarda VOLANTE (desde espejo offline) y luego cierra DEFINITIVA inmutable
    await db.query(`select public.guardar_acta_examen_hibrida($1, $2, $3, 'FOL-01', false, $4::jsonb, 'ESPEJO_PC')`, [
      instA, mesa1, reglaA, JSON.stringify([{ inscripcion_id: ins1, nota: 8, condicion: "APROBADO" }]),
    ]);
    await db.query(`select public.guardar_acta_examen_hibrida($1, $2, $3, 'FOL-01', true, $4::jsonb, 'ONLINE')`, [
      instA, mesa1, reglaA, JSON.stringify([{ inscripcion_id: ins1, nota: 8, condicion: "APROBADO" }]),
    ]);

    // Acta definitiva no admite cambios posteriores
    await assert.rejects(
      db.query(`select public.guardar_acta_examen_hibrida($1, $2, $3, 'FOL-02', true, $4::jsonb, 'ONLINE')`, [
        instA, mesa1, reglaA, JSON.stringify([{ inscripcion_id: ins1, nota: 9, condicion: "APROBADO" }]),
      ]),
      /ACTA_DEFINITIVA_INMUTABLE/,
    );

    // Ahora con M1 APROBADA en acta definitiva, la correlativa para rendir M2 se destraba
    const ins2 = (await db.query(`select public.inscribir_examen_institucional($1, $2, $3) id`, [instA, mesa2, estMat])).rows[0].id;
    assert.ok(ins2);

    // Aislamiento: no puede crear mesa en Institución B
    await assert.rejects(
      db.query(`select public.crear_mesa_institucional($1, $2, now() + interval '5 days', now() + interval '3 days', 1::smallint)`, [instB, mat1]),
      /ACCESO_DENEGADO/,
    );
  } finally {
    await db.close();
  }
});

test("fusionarActaVolante combina cambios locales y remotos y señala conflictos reales", () => {
  assert.equal(evaluarCondicionExamen(7, false, 6), "APROBADO");
  assert.equal(evaluarCondicionExamen(5, false, 6), "DESAPROBADO");
  assert.equal(evaluarCondicionExamen(null, true, 6), "AUSENTE");

  const base = {
    a: { inscripcion_id: "a", nota: null, condicion: "AUSENTE" },
    b: { inscripcion_id: "b", nota: 6, condicion: "APROBADO" },
  };
  const local = [
    { inscripcion_id: "a", nota: 8, condicion: "APROBADO" },
    { inscripcion_id: "b", nota: 6, condicion: "APROBADO" },
  ];
  const remoto = [
    { inscripcion_id: "a", nota: null, condicion: "AUSENTE" },
    { inscripcion_id: "b", nota: 9, condicion: "APROBADO" },
  ];
  const res = fusionarActaVolante(local, remoto, base);
  assert.deepEqual(res.conflictos, []);
  assert.equal(res.fusionado[0].nota, 8);
  assert.equal(res.fusionado[1].nota, 9);
});
