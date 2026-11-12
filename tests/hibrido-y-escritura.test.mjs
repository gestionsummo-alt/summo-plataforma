import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("SUMMO 002: calendario jurisdiccional, cupo de licencia, aislamiento y sync híbrida idempotente", async () => {
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

    const instA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const instB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const userSecA = "11111111-1111-4111-8111-111111111111";
    const userPreA = "22222222-2222-4222-8222-222222222222";
    const planA = "33333333-3333-4333-8333-333333333333";
    const planB = "44444444-4444-4444-8444-444444444444";
    const matA1 = "55555555-5555-4555-8555-555555555551";

    await db.exec(`
      insert into auth.users values ('${userSecA}'), ('${userPreA}');
      insert into instituciones(id, nombre, jurisdiccion) values
        ('${instA}', 'Instituto Técnico Misiones', 'Misiones'),
        ('${instB}', 'Profesorado Córdoba', 'Córdoba');
      insert into membresias values
        ('${instA}', '${userSecA}', 'secretaria'),
        ('${instA}', '${userPreA}', 'preceptoria');
      insert into licencias values
        ('${instA}', 1, array['secretaria','asistencia','normativa'], current_date + 30),
        ('${instB}', 50, array['secretaria','asistencia','normativa'], current_date + 30);
      insert into planes(institucion_id, id, carrera, codigo, resolucion_jurisdiccional, cohorte_desde) values
        ('${instA}', '${planA}', 'Técnico en Software', 'TS', 'Res. 051/19', 2026),
        ('${instB}', '${planB}', 'Profesorado Historia', 'PH', 'Res. Cba', 2026);
      insert into materias(institucion_id, id, plan_id, codigo, nombre) values
        ('${instA}', '${matA1}', '${planA}', 'M1', 'Programación I');
    `);

    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userSecA}', false);`);

    // 1. Configurar calendario oficial para Instituto A
    await db.query(`
      select public.registrar_calendario_institucional(
        $1::uuid, 2026::smallint, 'Res. MECyT 704/25 y CGE 8045',
        '2026-03-30'::date, '2026-11-13'::date,
        '2026-07-13'::date, '2026-07-24'::date, '2026-12-18'::date,
        $2::jsonb
      )
    `, [
      instA,
      JSON.stringify([
        { codigo: "FEB-MAR-2026", nombre: "Febrero - Marzo 2026", inicio: "2026-02-25", fin: "2026-03-25", llamados: 2 },
        { codigo: "NOV-DIC-2026", nombre: "Noviembre - Diciembre 2026", inicio: "2026-11-16", fin: "2026-12-17", llamados: 2 },
      ]),
    ]);

    // No puede configurar calendario en Instituto B (aislamiento estricto)
    await assert.rejects(
      db.query(`select public.registrar_calendario_institucional($1::uuid, 2026::smallint, 'X', '2026-03-30', '2026-11-13', null, null, '2026-12-18', '[]'::jsonb)`, [instB]),
      /ACCESO_DENEGADO/,
    );

    // 2. Matricular estudiante 1 (cupo = 1 OK) y rechazar segundo por CUPO_LICENCIA_ALCANZADO
    const matRes = await db.query(
      `select public.matricular_estudiante($1::uuid, '40111222', 'Estudiante Uno', $2::uuid, 2026::smallint) id`,
      [instA, planA],
    );
    const matriculaId = matRes.rows[0].id;

    await assert.rejects(
      db.query(`select public.matricular_estudiante($1::uuid, '40999888', 'Estudiante Dos', $2::uuid, 2026::smallint)`, [instA, planA]),
      /CUPO_LICENCIA_ALCANZADO/,
    );

    // Crear cursada (como admin/service en el test) para probar asistencia híbrida de Preceptoría
    await db.exec("reset role;");
    const curRes = await db.query(
      `insert into public.cursadas(institucion_id, matricula_id, materia_id, ciclo, comision) values ($1, $2, $3, 2026, 'A') returning id`,
      [instA, matriculaId, matA1],
    );
    const cursadaId = curRes.rows[0].id;

    // Preceptor A sincroniza lote offline
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userPreA}', false);`);
    const key1 = "99999999-9999-4999-8999-999999999999";

    // Rechaza fecha en receso de invierno y fecha posterior a fin de cursado (13/11)
    await assert.rejects(
      db.query(`select public.sincronizar_asistencia_lote($1::uuid, 2026::smallint, '2026-07-15'::date, 'PWA_OFFLINE', $2::jsonb)`, [
        instA, JSON.stringify([{ cursada_id: cursadaId, peso_falta: 0, idempotency_key: key1 }]),
      ]),
      /FECHA_EN_RECESO/,
    );
    await assert.rejects(
      db.query(`select public.sincronizar_asistencia_lote($1::uuid, 2026::smallint, '2026-11-16'::date, 'PWA_OFFLINE', $2::jsonb)`, [
        instA, JSON.stringify([{ cursada_id: cursadaId, peso_falta: 0, idempotency_key: key1 }]),
      ]),
      /FECHA_FUERA_DE_CURSADO/,
    );

    // Acepta fecha válida dentro de cursado e ignora reenvío duplicado por idempotency_key
    const sync1 = await db.query(
      `select public.sincronizar_asistencia_lote($1::uuid, 2026::smallint, '2026-11-12'::date, 'PWA_OFFLINE', $2::jsonb) r`,
      [instA, JSON.stringify([{ cursada_id: cursadaId, peso_falta: 0.5, idempotency_key: key1 }])],
    );
    assert.deepEqual(sync1.rows[0].r, { aplicados: 1, omitidos_idempotentes: 0 });

    const sync2 = await db.query(
      `select public.sincronizar_asistencia_lote($1::uuid, 2026::smallint, '2026-11-12'::date, 'PWA_OFFLINE', $2::jsonb) r`,
      [instA, JSON.stringify([{ cursada_id: cursadaId, peso_falta: 0.5, idempotency_key: key1 }])],
    );
    assert.deepEqual(sync2.rows[0].r, { aplicados: 0, omitidos_idempotentes: 1 });

    // Preceptoría puede leer su nómina de cursadas en Institución A pero jamás en Institución B
    assert.equal((await db.query("select count(*)::int n from public.cursadas")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from public.personas where institucion_id = $1", [instB])).rows[0].n, 0);

    // 3. Secretaría crea un plan nuevo, materia y regla RAM/RAI versionada
    await db.exec(`select set_config('request.jwt.claim.sub', '${userSecA}', false);`);
    const nuevoPlan = (await db.query(
      `select public.crear_plan_institucional($1::uuid, 'Profesorado de Informática', 'PI', 'Res. 100/26', null, 2027::smallint) id`,
      [instA],
    )).rows[0].id;
    const nuevaMat = (await db.query(
      `select public.crear_materia_institucional($1::uuid, $2::uuid, 'DID-1', 'Didáctica General') id`,
      [instA, nuevoPlan],
    )).rows[0].id;
    const cursada2 = (await db.query(
      `select public.inscribir_cursada_institucional($1::uuid, $2::uuid, $3::uuid, 2027::smallint, 'B') id`,
      [instA, matriculaId, nuevaMat],
    )).rows[0].id;
    assert.ok(cursada2);

    const reglaId = (await db.query(
      `select public.registrar_regla_normativa($1::uuid, $2::uuid, '2026-11-01'::date, 'Res. CFE 72/08', 'PROFESORADO', 75, 60, 1, 10, 6, 8, 2, 'ANIOS', true, 0.5) id`,
      [instA, nuevoPlan],
    )).rows[0].id;
    assert.ok(reglaId);
  } finally {
    await db.close();
  }
});
