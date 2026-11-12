import "./globals.css";
import Link from "next/link";
export const metadata = {
  title: "SUMMO · Tecnología híbrida para sistemas de gestión educativa",
  description: "Plataforma de gestión académica continua con o sin conexión a internet para institutos técnicos, profesorados y universidades.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>
        <header className="mast">
          <Link className="marca" href="/">SUMMO <small>TECNOLOGÍA HÍBRIDA EDUCATIVA</small></Link>
          <nav aria-label="Principal">
            <Link href="/#modulos">Módulos</Link>
            <Link href="/contacto">Contacto</Link>
            <Link className="access" href="/panel">Acceso institucional</Link>
          </nav>
        </header>
        {children}
        <footer>SUMMO · Tecnología híbrida para sistemas de gestión educativa</footer>
      </body>
    </html>
  );
}
