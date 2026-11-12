import test from "node:test";
import assert from "node:assert/strict";
import { procesarConsultaVozHeuristica } from "../lib/asistente/copiloto-logica.ts";

test("SUMMO: Copiloto de Voz resuelve intenciones y enrutamiento con tono pedagógico", () => {
  const institucionId = "10000000-0000-4000-8000-000000000001";

  // Caso 1: Asistencia escolar y preceptoría
  const r1 = procesarConsultaVozHeuristica("Hola, tengo que tomar asistencia hoy en primer año", institucionId);
  assert.ok(r1.respuestaVoz && r1.respuestaVoz.length > 10);
  assert.equal(r1.accion.tipo, "NAVEGAR");
  assert.ok(r1.accion.ruta?.includes("/panel/asistencia"));
  assert.ok(r1.accion.ruta?.includes("institucion="));

  // Caso 2: Carga masiva de documentos y resoluciones
  const r2 = procesarConsultaVozHeuristica("Quiero subir un excel con el padrón de estudiantes", institucionId);
  assert.equal(r2.accion.tipo, "NAVEGAR");
  assert.ok(r2.accion.ruta?.includes("/panel/importar"));

  // Caso 3: Mesas y actas
  const r3 = procesarConsultaVozHeuristica("Necesito pasar las notas de la mesa de examen final", institucionId);
  assert.equal(r3.accion.tipo, "NAVEGAR");
  assert.ok(r3.accion.ruta?.includes("/panel/examenes"));

  // Caso 4: Secretaría y matriculación
  const r4 = procesarConsultaVozHeuristica("Vino un alumno a inscribirse con su DNI", institucionId);
  assert.equal(r4.accion.tipo, "NAVEGAR");
  assert.ok(r4.accion.ruta?.includes("/panel/secretaria"));

  // Caso 5: Mensaje vacío
  const rVacio = procesarConsultaVozHeuristica("");
  assert.equal(rVacio.accion.tipo, "NINGUNA");
});
