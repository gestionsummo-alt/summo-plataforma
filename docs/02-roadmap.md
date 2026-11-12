# Roadmap de SUMMO GESTIÓN

## Etapa 1 · Núcleo y aislamiento
Entregado el esquema inicial, sesión SSR, membresías, lectura por licencia y panel base.
Siguiente hito, comandos transaccionales y auditoría con dos instituciones ficticias.
Aceptación, impedir lectura y escritura cruzada mediante API, SQL, exportaciones e integraciones.

## Etapa 2 · Portal comercial
Entregada landing y formulario que prepara un correo en el dispositivo del interesado.
Falta definir la dirección comercial, condiciones, política de privacidad y propuesta económica.
Para captación persistente, implementar proveedor de correo, protección contra abuso, consentimiento y bandeja de solicitudes.
La suscripción se cotizará por estudiantes activos, módulos y acompañamiento. No hay cobro ni precios publicados.

## Etapa 3 · Administración y módulos
Crear aprovisionamiento de instituciones y licencias desde un plano de control auditado.
Extraer Secretaría, matrículas, actas y correcciones.
Después asistencia por designación, planificación y mesas con validación transaccional.
Separar capacidades de Dirección, Secretaría, Preceptoría, Docentes y Estudiantes.
Aceptación, matrícula múltiple, regularidad pendiente, equivalencias, doble acreditación, bajas reversibles y actas versionadas.

## Etapa 4 · Migración de nuevos clientes
Importación privada, normalización y comparación de padrón.
Vista previa por lote con origen, hash, hoja, fila y decisiones de revisión.
Importación idempotente con conciliación de totales y exclusión de identidades dudosas.
Las cargas históricas no deben habilitar exámenes por defecto.

## Antes de producción
Prueba real en Supabase además de PGlite, revisión independiente de permisos, recuperación de backups, evaluación de accesibilidad, pruebas de carga y acuerdo institucional sobre normativa y tratamiento de datos.
El piloto debe usar datos ficticios hasta superar estos controles.
