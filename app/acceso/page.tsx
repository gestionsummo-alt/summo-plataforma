import {ingresar} from "./actions";
export default async function Acceso({searchParams}:{searchParams:Promise<{estado?:string}>}){
 const {estado}=await searchParams;
 return <main className="narrow"><h1>Acceso institucional</h1><p>Ingresá con la cuenta habilitada por tu institución.</p>
 <form action={ingresar}><label>Correo<input name="correo" autoComplete="username" type="email" required/></label><label>Contraseña<input name="clave" autoComplete="current-password" type="password" required/></label><button>Ingresar</button>
 {estado && <p role="alert">{estado==="configuracion"?"El acceso institucional está pendiente de configuración.":"No se pudo iniciar sesión. Revisá las credenciales."}</p>}</form></main>;
}
