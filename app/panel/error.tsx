"use client";
export default function ErrorPanel({reset}:{reset:()=>void}) {
 return <section role="alert"><h2>No pudimos consultar el panel</h2>
 <p>Tu sesión o la conexión necesitan verificarse. Intentá nuevamente.</p>
 <button onClick={reset}>Reintentar</button></section>;
}
