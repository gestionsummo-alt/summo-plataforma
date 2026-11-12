# SUMMO GESTIÓN
## Factibilidad y alcance de la primera entrega

La transformación es viable mediante una extracción gradual. El SGA del ITEC 3 aporta experiencia real en trayectorias, actas, correlatividades, asistencia, importación histórica y planificación docente. Convertirlo en SaaS requiere cambiar la autorización y el alcance de cada consulta antes de admitir instituciones adicionales.

Esta entrega es una base ejecutable de producto. No constituye una versión comercial completa ni una certificación de cumplimiento normativo.

## Arquitectura elegida

Un monolito modular en Next.js con Supabase Auth y PostgreSQL permite comenzar con un solo despliegue y transacciones consistentes. El aislamiento se basa en una institución explícita, membresías verificadas y RLS. Los módulos mantienen contratos separados para poder extraerse posteriormente.

- app contiene la presentación pública y el panel.
- lib/nucleo contiene cálculos puros sin marcas institucionales.
- lib/integraciones contiene contratos de intercambio.
- lib/supabase.ts administra la sesión SSR sin claves privilegiadas.
- supabase/migrations define el esquema exclusivo de SUMMO.
- tests verifica aislamiento y restricciones en PostgreSQL mediante PGlite.

Cada tabla académica usa una clave compuesta por institucion_id e id. Sus referencias incluyen ambos campos, impidiendo asociar registros de instituciones diferentes incluso por error de programación. El identificador recibido en una URL nunca concede permisos.

Una persona puede tener varias matrículas y cada matrícula identifica un plan y cohorte. Una cursada distingue el ciclo actual de la cohorte de ingreso. La baja corresponde a una trayectoria y deberá conservar las evidencias académicas.

La doble titulación requerirá un resultado fuente y varias acreditaciones explícitas. No debe copiarse una nota entre carreras por coincidencia del nombre de una materia. Ese subsistema se extraerá en la etapa académica.

## Reutilización del ITEC

Referencia del SGA examinada en el commit 8b79abe16c5b38f5f861b6952c49296efa8cc2f9.

| Componente existente | Tratamiento en SUMMO |
| --- | --- |
| lib/auth/staff-access.ts | Sustituir correos administrativos fijos por membresías y permisos |
| lib/supabase/server.ts | Adaptar sesión SSR y separar completamente las credenciales |
| lib/academico/exam-eligibility.ts | Extraer reglas por plan, instancia y versión, evitando universalizar el caso DGD |
| lib/asistencias/calculo.ts | Conservar cálculo ponderado, representar ausencia de datos como pendiente |
| lib/integracion/dgd.ts | Generalizar el contrato con institución y credencial de alcance limitado |
| Actas, auditoría y recepción atómica | Portar juntas con pruebas transaccionales antes de habilitar escritura |
| Importadores históricos | Convertir en importadores de lotes privados con vista previa y procedencia |

No se copiaron credenciales, padrones, notas, archivos históricos ni la base de producción. La incorporación de más código exige revisar también los derechos de reutilización institucional y de las dependencias.

## Seguridad y límites concretos

La migración inicial permite lectura académica a Dirección y Secretaría dentro de su institución y licencia vigente. No permite escritura académica desde usuarios autenticados. Preceptoría y Docentes todavía requieren permisos por designación antes de operar. Los estudiantes aún no tienen un portal en esta base.

Las altas académicas deberán realizarse mediante operaciones transaccionales con validación de plan, rol, cupo, estado y auditoría. Las claves foráneas protegen el aislamiento, pero no sustituyen las validaciones pedagógicas. No habilitar escrituras directas sobre este esquema inicial.

La licencia filtra lectura de módulos. El límite de estudiantes está almacenado como configuración, pero todavía no aplica cupos en un flujo de matriculación. La contratación y el cobro no están automatizados.

El administrador de plataforma debe tener un plano de control separado. El soporte no necesita acceso indiscriminado a legajos. Las acciones de soporte y exportación deberán quedar auditadas.

Los documentos requerirán almacenamiento privado, enlaces de duración limitada y autorización por institución. Las copias de seguridad deberán probarse mediante restauraciones. Definir retención, exportación al finalizar un contrato y responsables de tratamiento por cliente.

## Operación sin conexión

El modo local del ITEC no se habilita automáticamente en SUMMO. Antes de portar IndexedDB o service workers se necesitan particiones por institución y usuario, caducidad, limpieza al cerrar sesión y una política de equipos autorizados. No almacenar credenciales privilegiadas en el navegador.

La sincronización futura debe revalidar permisos y licencia al reconectar, usar operaciones idempotentes, comprobar versiones y mostrar conflictos. Las notas oficiales y actas cerradas requieren resolución explícita, nunca una política de sobrescritura por el último cambio. El portal privado inicial no se precachea.

## Marco normativo

La Resolución 051/2019 establece el RAM de nivel superior de Misiones y la adecuación institucional mediante el RAI. La jurisdicción, autoridad, tipo de oferta y normativa aplicable deben registrarse por institución. No corresponde aplicar disposiciones de nivel secundario a estas carreras.

Cada versión de reglas necesita fuente, vigencia, plan y alcance por cohorte. Escala, aprobación, promoción, asistencia justificada, recuperatorios y vigencia de regularidad deben configurarse con validación académica institucional. El número de turnos se calcula sobre un calendario certificado, no sobre años transcurridos ni la cohorte de ingreso.

El esquema inicial almacena un subconjunto de esos parámetros. Antes de cerrar actas se requieren versiones inmutables, calendario de turnos, reglas de redondeo y excepciones documentadas. Las resoluciones nacionales pendientes deben figurar como pendientes.

La revisión documental disponible no acredita que una resolución sea la última aplicable a todas las ofertas. Secretaría de cada institución debe confirmar su RAM, RAI y planes vigentes antes de activar el motor.

Fuentes primarias consultadas
- [RAM Misiones, Resolución 051/2019](https://des-mis.infd.edu.ar/sitio/wp-content/uploads/2023/03/RES051MCECyT27MAR2019_RAM.pdf)
- [Repositorio de resoluciones SPEPM](https://spepm.misiones.gob.ar/index.php/resoluciones/)
- [Ley de Educación Técnico Profesional 26.058](https://www.argentina.gob.ar/normativa/nacional/ley-26058-109525/actualizacion)
- [Ley de Protección de Datos Personales 25.326](https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion)

## Rendimiento y operación

Las claves e índices comienzan por institución. Las consultas futuras deberán paginar, seleccionar columnas necesarias y probar planes de ejecución con volúmenes representativos. La región de aplicación y base debe minimizar latencia.

No se promete costo cero ni escalabilidad ilimitada. Dimensionar conexiones, almacenamiento, correo, respaldos y uso real antes de fijar precios. Un cliente con requisitos especiales podrá usar una base dedicada conservando los mismos contratos de módulos.
