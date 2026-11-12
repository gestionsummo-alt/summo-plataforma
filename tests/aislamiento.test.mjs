import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("RLS, licencias, membresías y referencias aíslan instituciones", async () => {
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
 await db.exec(await readFile(new URL("../supabase/migrations/001_base.sql",import.meta.url),"utf8"));
 const a="11111111-1111-4111-8111-111111111111";
 const b="22222222-2222-4222-8222-222222222222";
 const user="33333333-3333-4333-8333-333333333333";
 const person="44444444-4444-4444-8444-444444444444";
 const plan="55555555-5555-4555-8555-555555555555";
 await db.exec(`
 insert into auth.users values ('${user}');
 insert into instituciones(id,nombre,jurisdiccion) values ('${a}','Instituto A','Prueba'),('${b}','Instituto B','Prueba');
 insert into membresias values ('${a}','${user}','secretaria');
 insert into licencias values ('${a}',100,array['secretaria'],current_date+30),('${b}',100,array['secretaria'],current_date+30);
 insert into personas(institucion_id,id,tipo,documento,nombre) values ('${a}','${person}','estudiante','101','Persona A'),('${b}','${person}','estudiante','102','Persona B');
 insert into planes(institucion_id,id,carrera,codigo,resolucion_jurisdiccional,cohorte_desde) values ('${b}','${plan}','Carrera','P','Prueba',2027);
 `);
 await assert.rejects(db.exec(`insert into matriculas(institucion_id,persona_id,plan_id,cohorte,estado) values ('${a}','${person}','${plan}',2027,'ACTIVO')`), /foreign key/i);
 await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`);
 assert.deepEqual((await db.query("select nombre from personas")).rows,[{nombre:"Persona A"}]);
 assert.equal((await db.query("select * from instituciones")).rows.length,1);
 assert.equal((await db.query("select * from membresias")).rows.length,1);
 await assert.rejects(db.exec(`insert into membresias values ('${b}','${user}','direccion')`),/permission denied/i);
 await assert.rejects(db.exec("update personas set nombre='Alterado'"),/permission denied/i);
 await db.exec(`reset role; update licencias set vence=current_date-1 where institucion_id='${a}'; set role authenticated;`);
 assert.equal((await db.query("select * from personas")).rows.length,0);
 await db.exec(`reset role; update licencias set vence=current_date+1,modulos=array['asistencia'] where institucion_id='${a}'; set role authenticated;`);
 assert.equal((await db.query("select * from personas")).rows.length,0);
 await db.exec(`reset role; update licencias set modulos=array['secretaria'] where institucion_id='${a}'; update membresias set rol='docente'; set role authenticated;`);
 assert.equal((await db.query("select * from personas")).rows.length,0);
 await db.exec("reset role; set role anon;");
 await assert.rejects(db.exec("select * from personas"),/permission denied/i);
 } finally { await db.close(); }
});
