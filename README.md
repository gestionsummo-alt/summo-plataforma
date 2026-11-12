# SUMMO GESTIÓN

Base independiente para un SaaS académico modular. La implementación ITEC 3 continúa en su repositorio original.

## Ejecutar localmente
Requiere Node.js compatible con Next.js 16 y npm.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

La landing funciona sin Supabase. Configurar SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY de un proyecto nuevo para usar el acceso. Configurar SUMMO_CONTACT_EMAIL con la dirección comercial real para activar el formulario de contacto.

## Base de datos
Aplicar supabase/migrations/001_base.sql una sola vez en un proyecto nuevo de Supabase.
No ejecutar esta migración en el proyecto ITEC 3.
Crear cuentas de prueba en Supabase Auth. El aprovisionamiento inicial de instituciones, membresías y licencias se realiza desde una sesión administrativa de base de datos.
Los usuarios de la aplicación no pueden autoasignarse roles ni instituciones.
No cargar datos reales todavía.

## Comprobaciones
```powershell
npm test
npm run build
```

## Estado
Incluye landing, contacto mediante correo local, acceso SSR y selección de institución según membresía.
El panel muestra licencia y catálogo contratado. Las fichas no son módulos académicos operativos todavía.
El esquema es una base de lectura protegida. Faltan los comandos de escritura auditados y los flujos completos de cada módulo.
El contrato de planificación define un punto de extensión, no una integración DGD activa.
No hay despliegue, facturación automática ni modo offline habilitado.

Consultar docs/01-factibilidad-arquitectura.md y docs/02-roadmap.md.
