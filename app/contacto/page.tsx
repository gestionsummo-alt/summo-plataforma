import Formulario from "./solicitud";
export default async function Contacto({searchParams}:{searchParams:Promise<{tipo?:string}>}){
 const buzon=process.env.SUMMO_CONTACT_EMAIL?.trim();
 return <main className="narrow"><p className="eyebrow">Atención a instituciones</p><h1>Conversemos sobre tu instituto</h1><p>Solicitá una demostración, los requisitos de contratación o una cotización. La propuesta detallará alcance, soporte, migración, tratamiento de datos y condiciones económicas.</p><Formulario destino={buzon && /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(buzon)?buzon:null} tipo={(await searchParams).tipo}/></main>
}
