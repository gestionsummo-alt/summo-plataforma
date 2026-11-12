export interface RespuestaCopiloto {
  respuestaVoz: string;
  accion: {
    tipo: "NAVEGAR" | "EXPLICAR_PASO" | "NINGUNA";
    ruta?: string;
    campoResaltar?: string;
  };
  sugerenciaSiguiente?: string;
}

export function procesarConsultaVozHeuristica(
  mensaje: string,
  institucionId?: string
): RespuestaCopiloto {
  const m = (mensaje ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (!m) {
    return {
      respuestaVoz: "No llegué a escucharte bien. ¿Podrías repetirme qué trámite necesitás hacer?",
      accion: { tipo: "NINGUNA" },
    };
  }

  const instQuery = institucionId ? `?institucion=${encodeURIComponent(institucionId)}` : "";

  if (
    m.includes("asistenc") ||
    m.includes("preceptor") ||
    m.includes("tomar lista") ||
    m.includes("falta") ||
    m.includes("presente")
  ) {
    return {
      respuestaVoz:
        "Te abro el módulo de Asistencia y Preceptoría. Podés marcar presentes y ausentes incluso si no tenés internet en el aula, y se guardará automáticamente.",
      accion: { tipo: "NAVEGAR", ruta: `/panel/asistencia${instQuery}` },
      sugerenciaSiguiente: "¿Querés que veamos la lista de alguna materia en particular?",
    };
  }

  if (
    m.includes("import") ||
    m.includes("subir") ||
    m.includes("documento") ||
    m.includes("excel") ||
    m.includes("pdf") ||
    m.includes("archivo") ||
    m.includes("resolucion")
  ) {
    return {
      respuestaVoz:
        "Te llevo al Asistente de Ingesta Documental. Arrastrá tu archivo Excel o PDF y el sistema extraerá los datos automáticamente para que los revises.",
      accion: { tipo: "NAVEGAR", ruta: `/panel/importar${instQuery}` },
      sugerenciaSiguiente: "¿Tenés un padrón de estudiantes o un plan de estudio para cargar?",
    };
  }

  if (
    m.includes("examen") ||
    m.includes("mesa") ||
    m.includes("acta") ||
    m.includes("nota") ||
    m.includes("final") ||
    m.includes("volante")
  ) {
    return {
      respuestaVoz:
        "Te llevo al módulo de Mesas y Actas. Ahí podés abrir llamados, verificar correlatividades y confeccionar las actas volantes provisorias o definitivas con código QR.",
      accion: { tipo: "NAVEGAR", ruta: `/panel/examenes${instQuery}` },
      sugerenciaSiguiente: "¿Necesitás cargar notas o consultar las actas emitidas?",
    };
  }

  if (
    m.includes("inscrib") ||
    m.includes("matr") ||
    m.includes("alumno") ||
    m.includes("estudiante") ||
    m.includes("secretar") ||
    m.includes("cursada")
  ) {
    return {
      respuestaVoz:
        "Te abro Secretaría Académica. En esta sección podés dar de alta carreras, inscribir estudiantes con su DNI y habilitar las cursadas del ciclo lectivo.",
      accion: { tipo: "NAVEGAR", ruta: `/panel/secretaria${instQuery}` },
      sugerenciaSiguiente: "¿Querés matricular a un estudiante nuevo o habilitar una cursada?",
    };
  }

  if (
    m.includes("normativa") ||
    m.includes("regla") ||
    m.includes("correlativ") ||
    m.includes("plan") ||
    m.includes("calendario") ||
    m.includes("ram") ||
    m.includes("rai")
  ) {
    return {
      respuestaVoz:
        "Te llevo al módulo de Normativas y Reglas Académicas. Podés configurar el régimen de correlatividades, la escala de notas y consultar el calendario oficial de tu provincia.",
      accion: { tipo: "NAVEGAR", ruta: `/panel/normativa${instQuery}` },
      sugerenciaSiguiente: "¿Querés revisar correlatividades o el calendario escolar?",
    };
  }

  if (
    m.includes("planific") ||
    m.includes("programa") ||
    m.includes("docente") ||
    m.includes("propuesta")
  ) {
    return {
      respuestaVoz:
        "Te abro Planificaciones Docentes. Acá los profesores presentan sus propuestas pedagógicas y el equipo directivo puede revisarlas y aprobarlas.",
      accion: { tipo: "NAVEGAR", ruta: `/panel/planificaciones${instQuery}` },
      sugerenciaSiguiente: "¿Buscás una planificación para revisar?",
    };
  }

  return {
    respuestaVoz:
      "Hola, soy tu asistente de SUMMO. Puedo llevarte a cualquier módulo del sistema: Secretaría, Preceptoría, Exámenes, Normativas o Ingesta de documentos. Decime qué trámite necesitás hacer hoy.",
    accion: { tipo: "NINGUNA" },
    sugerenciaSiguiente: "Por ejemplo: 'Quiero matricular un estudiante' o 'Necesito tomar asistencia'.",
  };
}
