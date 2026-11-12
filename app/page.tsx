import Link from "next/link";
import { modulos } from "../lib/modulos";
export default function Inicio() {
  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">SUMMO · Tecnología híbrida para sistemas de gestión educativa</p>
          <h1>Continuidad académica,<br />con o sin conexión<br />a internet.</h1>
          <p className="bajada">
            Plataforma modular para institutos técnicos superiores, profesorados y universidades.
            Operación continua en aula y Secretaría mediante sincronización híbrida de bases de datos y
            reglas adaptables a cada Régimen Académico Marco de la Argentina.
          </p>
          <Link className="boton" href="/contacto?tipo=demo">Solicitar una demo →</Link>
        </div>
        <aside aria-label="Ejemplo de recorrido académico">
          <div className="papel">
            <small>ARQUITECTURA HÍBRIDA</small>
            <h2>Continuidad garantizada</h2>
            <ol>
              <li><b>En el aula (PWA)</b><span>Asistencia offline idempotente</span></li>
              <li><b>En Secretaría (PC)</b><span>Espejo local con fusión granular</span></li>
              <li><b>En la nube (RLS)</b><span>Actas, normativa y auditoría aislada</span></li>
            </ol>
          </div>
        </aside>
      </section>
      <section id="modulos">
        <p className="eyebrow">Módulos personalizables</p>
        <h2>Adaptables a cada institución de Nivel Superior</h2>
        <div className="grid">
          {Object.entries(modulos).map(([key, [nombre, detalle]]) => (
            <article key={key}><h3>{nombre}</h3><p>{detalle}</p></article>
          ))}
        </div>
      </section>
      <section className="lic">
        <div>
          <h2>Una licencia a la medida del instituto</h2>
          <p>
            Cada institución activa los módulos que necesita, parametriza su RAM/RAI y calendario jurisdiccional,
            y opera sin interrupciones independientemente de la estabilidad de su conectividad.
          </p>
        </div>
        <Link className="boton" href="/contacto?tipo=cotizacion">Consultar condiciones →</Link>
      </section>
    </main>
  );
}
