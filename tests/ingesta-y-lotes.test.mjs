import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { PGlite } from "@electric-sql/pglite";
import { parsearPadronDesdeBuffer, parsearPlanDesdeBuffer } from "../lib/ingesta/parser-determinista.ts";
import { calcularSha256 } from "../lib/ingesta/sha256.ts";
import { validarConsistenciaPlan } from "../lib/ingesta/extractor-ia.ts";

test("SUMMO 005: ingesta documental determinista, SHA-256, RPCs bulk de padrón y planes con cuotas", async () => {
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
    await db.exec(await readFile(new URL("../supabase/migrations/005_lotes_ingesta_y_bulk_rpcs.sql", import.meta.url), "utf8"));

    const instA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const instB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const userA = "11111111-1111-4111-8111-111111111111";

    await db.exec(`
      insert into auth.users values ('${userA}');
      insert into instituciones(id, nombre, jurisdiccion) values
        ('${instA}', 'Instituto Misiones', 'Misiones'),
        ('${instB}', 'Instituto Córdoba', 'Córdoba');
      insert into membresias values
        ('${instA}', '${userA}', 'secretaria');
      insert into licencias values
        ('${instA}', 3, array['secretaria','asistencia','normativa'], current_date + 60),
        ('${instB}', 10, array['secretaria','asistencia','normativa'], current_date + 60);
    `);

    // 1. Probar parser determinístico en memoria generando un Excel sintético con SheetJS
    const wb = XLSX.utils.book_new();
    const wsData = [
      ["DNI", "Apellido y Nombre", "Cohorte"],
      ["40111222", "Álvarez María", "2026"],
      ["40333444", "Benítez Carlos", "2026"],
      ["40111222", "Álvarez María Duplicada", "2026"], // Duplicado para disparar alerta
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Alumnos");
    const bufferExcel = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const hashCalculado = calcularSha256(bufferExcel);
    assert.equal(hashCalculado.length, 64);

    const { estudiantes, alertas } = parsearPadronDesdeBuffer(bufferExcel);
    assert.equal(estudiantes.length, 3);
    assert.ok(alertas.some((a) => a.mensaje.includes("duplicado")));

    // 2. Probar parser de plan de estudio en Excel
    const wbPlan = XLSX.utils.book_new();
    const wsPlanData = [
      ["Codigo", "Materia", "Correlativas", "Anio"],
      ["PRG-1", "Programación I", "-", "1º Año"],
      ["PRG-2", "Programación II", "PRG-1", "2º Año"],
    ];
    const wsPlan = XLSX.utils.aoa_to_sheet(wsPlanData);
    XLSX.utils.book_append_sheet(wbPlan, wsPlan, "Software");
    const bufferPlan = XLSX.write(wbPlan, { type: "buffer", bookType: "xlsx" });

    const planRes = parsearPlanDesdeBuffer(bufferPlan);
    assert.ok(planRes.plan);
    assert.equal(planRes.plan.materias.length, 2);
    assert.equal(planRes.plan.correlativas.length, 1);

    // 3. Importar plan atómico vía RPC en Institución A
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userA}', false);`);

    const rpcPlan = (
      await db.query(
        `select public.importar_plan_estudio_lote(
          $1::uuid, 'plan_software.xlsx', $2, 'Tecnicatura en Software', 'TSW',
          'Res. ME 500/26', 'RM 200/26', 2026::smallint,
          $3::jsonb, $4::jsonb, null
        ) r`,
        [
          instA,
          hashCalculado,
          JSON.stringify(planRes.plan.materias),
          JSON.stringify(planRes.plan.correlativas),
        ],
      )
    ).rows[0].r;

    assert.equal(rpcPlan.materias_creadas, 2);
    assert.equal(rpcPlan.correlativas_creadas, 1);
    const planId = rpcPlan.plan_id;

    // Verificar que las materias y la correlativa quedaron insertadas y asociadas correctamente
    const countMats = (await db.query(`select count(*)::int n from public.materias where plan_id = $1`, [planId])).rows[0].n;
    assert.equal(countMats, 2);
    const countCorr = (await db.query(`select count(*)::int n from public.correlativas where institucion_id = $1`, [instA])).rows[0].n;
    assert.equal(countCorr, 1);

    // 4. Importar padrón de estudiantes dentro del cupo (cupo = 3)
    const rpcPadron = (
      await db.query(
        `select public.importar_padron_estudiantes_lote(
          $1::uuid, 'padron_2026.xlsx', $2, $3::uuid, 2026::smallint, $4::jsonb
        ) r`,
        [
          instA,
          hashCalculado,
          planId,
          JSON.stringify([
            { documento: "40111222", nombre: "Álvarez María" },
            { documento: "40333444", nombre: "Benítez Carlos" },
          ]),
        ],
      )
    ).rows[0].r;

    assert.equal(rpcPadron.importados, 2);

    // 5. Intentar importar más estudiantes que excedan el cupo (3 activos máximo)
    await assert.rejects(
      db.query(
        `select public.importar_padron_estudiantes_lote(
          $1::uuid, 'padron_exceso.xlsx', '1111111111111111111111111111111111111111111111111111111111111111',
          $2::uuid, 2026::smallint, $3::jsonb
        )`,
        [
          instA,
          planId,
          JSON.stringify([
            { documento: "40555666", nombre: "Gómez Laura" },
            { documento: "40777888", nombre: "Zárate Pedro" }, // 2 + 2 = 4 > 3
          ]),
        ],
      ),
      /CUPO_LICENCIA_ALCANZADO/,
    );

    // 6. Aislamiento: usuario A no puede importar lote en Institución B
    await assert.rejects(
      db.query(
        `select public.importar_padron_estudiantes_lote(
          $1::uuid, 'padron_ajeno.xlsx', '2222222222222222222222222222222222222222222222222222222222222222',
          $2::uuid, 2026::smallint, $3::jsonb
        )`,
        [instB, planId, JSON.stringify([{ documento: "99111222", nombre: "Ajeno" }])],
      ),
      /ACCESO_DENEGADO/,
    );
  } finally {
    await db.close();
  }
});
