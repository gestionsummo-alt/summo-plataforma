-- Proyecto Supabase NUEVO y exclusivo de SUMMO. Ejecutar una vez.
begin;
create table public.instituciones(id uuid primary key default gen_random_uuid(), nombre text not null, jurisdiccion text not null, autoridad text, zona_horaria text not null default 'America/Argentina/Buenos_Aires');
create table public.membresias(institucion_id uuid not null references public.instituciones, usuario_id uuid not null references auth.users, rol text not null check(rol in ('direccion','secretaria','preceptoria','docente')), primary key(institucion_id,usuario_id));
create index membresias_por_usuario on public.membresias(usuario_id,institucion_id);
create table public.licencias(institucion_id uuid primary key references public.instituciones, max_estudiantes integer not null check(max_estudiantes>0), modulos text[] not null check(modulos <@ array['secretaria','asistencia','planificaciones','examenes','normativa']::text[]), vence date not null);
alter table public.instituciones enable row level security;
alter table public.licencias enable row level security;
alter table public.membresias enable row level security;
revoke all on public.instituciones, public.licencias, public.membresias from public,anon,authenticated;
grant select on public.instituciones, public.licencias, public.membresias to authenticated;
create policy propia on public.membresias for select to authenticated using(usuario_id=(select auth.uid()));
create policy miembro on public.instituciones for select to authenticated using(exists(select 1 from public.membresias m where m.institucion_id=id and m.usuario_id=(select auth.uid())));
create policy licencia_propia on public.licencias for select to authenticated using(exists(select 1 from public.membresias m where m.institucion_id=licencias.institucion_id and m.usuario_id=(select auth.uid())));
create function public.puede_leer_modulo(i uuid, modulo text) returns boolean language sql stable security invoker set search_path='' as $$
select exists(select 1 from public.membresias m join public.licencias l using(institucion_id) where m.institucion_id=i and m.usuario_id=(select auth.uid()) and m.rol in ('direccion','secretaria') and l.vence>=current_date and modulo=any(l.modulos))
$$;
revoke all on function public.puede_leer_modulo(uuid,text) from public,anon;
grant execute on function public.puede_leer_modulo(uuid,text) to authenticated;
create table public.personas (
  institucion_id uuid not null references public.instituciones(id),
  id uuid not null default gen_random_uuid(),
  tipo text not null check(tipo in ('estudiante','docente')), documento text not null, nombre text not null, unique(institucion_id,tipo,documento),
  primary key(institucion_id,id)
);
alter table public.personas enable row level security;
revoke all on public.personas from public,anon,authenticated;
grant select on public.personas to authenticated;
create policy alcance on public.personas for select to authenticated using(public.puede_leer_modulo(institucion_id,'secretaria'));
create table public.planes (
  institucion_id uuid not null references public.instituciones(id),
  id uuid not null default gen_random_uuid(),
  carrera text not null, codigo text not null, resolucion_jurisdiccional text not null, resolucion_nacional text, cohorte_desde smallint not null, unique(institucion_id,codigo,cohorte_desde),
  primary key(institucion_id,id)
);
alter table public.planes enable row level security;
revoke all on public.planes from public,anon,authenticated;
grant select on public.planes to authenticated;
create policy alcance on public.planes for select to authenticated using(public.puede_leer_modulo(institucion_id,'secretaria'));
create table public.materias (
  institucion_id uuid not null references public.instituciones(id),
  id uuid not null default gen_random_uuid(),
  plan_id uuid not null, codigo text not null, nombre text not null, unique(institucion_id,plan_id,codigo), foreign key(institucion_id,plan_id) references public.planes(institucion_id,id),
  primary key(institucion_id,id)
);
alter table public.materias enable row level security;
revoke all on public.materias from public,anon,authenticated;
grant select on public.materias to authenticated;
create policy alcance on public.materias for select to authenticated using(public.puede_leer_modulo(institucion_id,'secretaria'));
create table public.reglas (
  institucion_id uuid not null references public.instituciones(id),
  id uuid not null default gen_random_uuid(),
  plan_id uuid not null, version integer not null check(version>0), vigente_desde date not null, fuente text not null, asistencia_min numeric not null check(asistencia_min between 0 and 100), escala_min numeric not null, escala_max numeric not null, aprobacion numeric not null, promocion numeric, turnos_vigencia integer check(turnos_vigencia>0), check(escala_min<escala_max and aprobacion between escala_min and escala_max and (promocion is null or promocion between aprobacion and escala_max)), unique(institucion_id,plan_id,version),
  foreign key(institucion_id,plan_id) references public.planes(institucion_id,id),
  primary key(institucion_id,id)
);
alter table public.reglas enable row level security;
revoke all on public.reglas from public,anon,authenticated;
grant select on public.reglas to authenticated;
create policy alcance on public.reglas for select to authenticated using(public.puede_leer_modulo(institucion_id,'normativa'));
create table public.correlativas (
  institucion_id uuid not null references public.instituciones(id),
  id uuid not null default gen_random_uuid(),
  materia_id uuid not null, requisito_id uuid not null, instancia text not null check(instancia in ('CURSAR','RENDIR')), condicion text not null check(condicion in ('REGULAR','APROBADA')),check(materia_id<>requisito_id), unique(institucion_id,materia_id,requisito_id,instancia), foreign key(institucion_id,materia_id) references public.materias(institucion_id,id),
  foreign key(institucion_id,requisito_id) references public.materias(institucion_id,id),
  primary key(institucion_id,id)
);
alter table public.correlativas enable row level security;
revoke all on public.correlativas from public,anon,authenticated;
grant select on public.correlativas to authenticated;
create policy alcance on public.correlativas for select to authenticated using(public.puede_leer_modulo(institucion_id,'normativa'));
create table public.matriculas (
  institucion_id uuid not null references public.instituciones(id),
  id uuid not null default gen_random_uuid(),
  persona_id uuid not null, plan_id uuid not null, cohorte smallint not null, estado text not null check(estado in ('ACTIVO','PAUSADO','EGRESADO','BAJA')), unique(institucion_id,persona_id,plan_id,cohorte),
  foreign key(institucion_id,persona_id) references public.personas(institucion_id,id),
  foreign key(institucion_id,plan_id) references public.planes(institucion_id,id),
  primary key(institucion_id,id)
);
alter table public.matriculas enable row level security;
revoke all on public.matriculas from public,anon,authenticated;
grant select on public.matriculas to authenticated;
create policy alcance on public.matriculas for select to authenticated using(public.puede_leer_modulo(institucion_id,'secretaria'));
create table public.cursadas (
  institucion_id uuid not null references public.instituciones(id),
  id uuid not null default gen_random_uuid(),
  matricula_id uuid not null, materia_id uuid not null, ciclo smallint not null, comision text not null, unique(institucion_id,matricula_id,materia_id,ciclo),
  foreign key(institucion_id,matricula_id) references public.matriculas(institucion_id,id),
  foreign key(institucion_id,materia_id) references public.materias(institucion_id,id),
  primary key(institucion_id,id)
);
alter table public.cursadas enable row level security;
revoke all on public.cursadas from public,anon,authenticated;
grant select on public.cursadas to authenticated;
create policy alcance on public.cursadas for select to authenticated using(public.puede_leer_modulo(institucion_id,'secretaria'));
create table public.asistencias (
  institucion_id uuid not null references public.instituciones(id),
  id uuid not null default gen_random_uuid(),
  cursada_id uuid not null, fecha date not null, clase text not null, peso_falta numeric not null check(peso_falta between 0 and 1), unique(institucion_id,cursada_id,fecha,clase),
  foreign key(institucion_id,cursada_id) references public.cursadas(institucion_id,id),
  primary key(institucion_id,id)
);
alter table public.asistencias enable row level security;
revoke all on public.asistencias from public,anon,authenticated;
grant select on public.asistencias to authenticated;
create policy alcance on public.asistencias for select to authenticated using(public.puede_leer_modulo(institucion_id,'asistencia'));
create table public.planificaciones (
  institucion_id uuid not null references public.instituciones(id),
  id uuid not null default gen_random_uuid(),
  materia_id uuid not null, docente_id uuid not null, version integer not null check(version>0), contenido text not null, estado text not null check(estado in ('BORRADOR','EN_REVISION','APROBADA')),unique(institucion_id,materia_id,docente_id,version),
  foreign key(institucion_id,materia_id) references public.materias(institucion_id,id),
  foreign key(institucion_id,docente_id) references public.personas(institucion_id,id),
  primary key(institucion_id,id)
);
alter table public.planificaciones enable row level security;
revoke all on public.planificaciones from public,anon,authenticated;
grant select on public.planificaciones to authenticated;
create policy alcance on public.planificaciones for select to authenticated using(public.puede_leer_modulo(institucion_id,'planificaciones'));
create table public.mesas (
  institucion_id uuid not null references public.instituciones(id),
  id uuid not null default gen_random_uuid(),
  materia_id uuid not null, fecha timestamptz not null, cierre timestamptz not null, llamado smallint not null check(llamado>0), check(cierre<fecha),
  foreign key(institucion_id,materia_id) references public.materias(institucion_id,id),
  primary key(institucion_id,id)
);
alter table public.mesas enable row level security;
revoke all on public.mesas from public,anon,authenticated;
grant select on public.mesas to authenticated;
create policy alcance on public.mesas for select to authenticated using(public.puede_leer_modulo(institucion_id,'examenes'));
create table public.inscripciones_examen (
  institucion_id uuid not null references public.instituciones(id),
  id uuid not null default gen_random_uuid(),
  mesa_id uuid not null, matricula_id uuid not null, creado_en timestamptz not null default now(), unique(institucion_id,mesa_id,matricula_id), foreign key(institucion_id,mesa_id) references public.mesas(institucion_id,id),
  foreign key(institucion_id,matricula_id) references public.matriculas(institucion_id,id),
  primary key(institucion_id,id)
);
alter table public.inscripciones_examen enable row level security;
revoke all on public.inscripciones_examen from public,anon,authenticated;
grant select on public.inscripciones_examen to authenticated;
create policy alcance on public.inscripciones_examen for select to authenticated using(public.puede_leer_modulo(institucion_id,'examenes'));
create table public.actas (
  institucion_id uuid not null references public.instituciones(id),
  id uuid not null default gen_random_uuid(),
  mesa_id uuid not null, regla_id uuid not null, version integer not null check(version>0), tipo text not null check(tipo in ('VOLANTE','DEFINITIVA')),referencia text not null, unique(institucion_id,mesa_id,tipo,version), foreign key(institucion_id,mesa_id) references public.mesas(institucion_id,id),
  foreign key(institucion_id,regla_id) references public.reglas(institucion_id,id),
  primary key(institucion_id,id)
);
alter table public.actas enable row level security;
revoke all on public.actas from public,anon,authenticated;
grant select on public.actas to authenticated;
create policy alcance on public.actas for select to authenticated using(public.puede_leer_modulo(institucion_id,'examenes'));
create table public.resultados (
  institucion_id uuid not null references public.instituciones(id),
  id uuid not null default gen_random_uuid(),
  acta_id uuid not null, inscripcion_id uuid not null, nota numeric, condicion text not null, unique(institucion_id,acta_id,inscripcion_id),
  foreign key(institucion_id,acta_id) references public.actas(institucion_id,id),
  foreign key(institucion_id,inscripcion_id) references public.inscripciones_examen(institucion_id,id),
  primary key(institucion_id,id)
);
alter table public.resultados enable row level security;
revoke all on public.resultados from public,anon,authenticated;
grant select on public.resultados to authenticated;
create policy alcance on public.resultados for select to authenticated using(public.puede_leer_modulo(institucion_id,'examenes'));
commit;
