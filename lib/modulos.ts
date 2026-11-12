export const modulos = {
 secretaria: ["Secretaría académica", "Reuní legajos de estudiantes y docentes, matrículas y resoluciones por carrera."],
 asistencia: ["Preceptoría", "Registrá la asistencia diaria y detectá trayectorias que necesitan acompañamiento."],
 planificaciones: ["Planificaciones", "Organizá propuestas docentes y su revisión y aprobación institucional."],
 examenes: ["Mesas y actas", "Coordiná llamados, requisitos para rendir y el paso del acta volante al acta definitiva."],
 normativa: ["Reglas académicas", "Vinculá cada plan con sus correlativas, escalas y resoluciones vigentes."]
} as const;
export type Modulo = keyof typeof modulos;
