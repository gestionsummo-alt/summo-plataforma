import test from "node:test";
import assert from "node:assert/strict";
import { porcentajeAsistencia } from "../lib/nucleo/asistencia.ts";
import { comprobarAlcance } from "../lib/integraciones/planificaciones.ts";
import { leerCuerpoLimitado } from "../lib/integraciones/cuerpo-limitado.ts";
test("Sin clases o marcas completas no se certifica asistencia",()=>{
 assert.equal(porcentajeAsistencia(0,[]),null);
 assert.equal(porcentajeAsistencia(3,[0]),null);
 assert.equal(porcentajeAsistencia(4,[0,0,0,1]),75);
 assert.throws(()=>porcentajeAsistencia(1,[-1]));
});
test("El contrato de integración no admite sustituir institución",()=>{
 const contexto={institucionId:"A",integracionId:"adaptador",alcance:"planificaciones:lectura"};
 comprobarAlcance(contexto,"A");
 assert.throws(()=>comprobarAlcance(contexto,"B"));
});
test("La lectura del cuerpo limita bytes reales",async()=>{
 assert.equal(await leerCuerpoLimitado(new Request("https://example.test",{method:"POST",body:"hola"}),4),"hola");
 await assert.rejects(leerCuerpoLimitado(new Request("https://example.test",{method:"POST",body:"hola"}),3),/CUERPO_GRANDE/);
});
