import Link from "next/link";
import { Clock3, Mail, MessageCircle } from "lucide-react";
import { getSiteBrand } from "@/lib/site-brand";

export default async function ContactPage() {
  const brand = await getSiteBrand();
  const whatsappDigits = brand.contactWhatsApp.replace(/\D/g, "");

  return (
    <main className="store-info-page">
      <Link className="store-info-back" href="/">Volver al inicio</Link>
      <span className="eyebrow">ESTAMOS PARA AYUDARTE</span>
      <h1>Contáctanos</h1>
      <p className="store-info-intro">Comunícate con nuestro equipo y te ayudaremos con tu compra.</p>
      <div className="store-info-options">
        {brand.contactEmail && (
          <a href={`mailto:${brand.contactEmail}`}>
            <Mail size={20} />
            <span><strong>Correo</strong>{brand.contactEmail}</span>
          </a>
        )}
        {brand.contactWhatsApp && whatsappDigits && (
          <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer">
            <MessageCircle size={20} />
            <span><strong>WhatsApp</strong>{brand.contactWhatsApp}</span>
          </a>
        )}
        {brand.contactSchedule && (
          <div>
            <Clock3 size={20} />
            <span><strong>Horario de atención</strong><span className="store-info-copy">{brand.contactSchedule}</span></span>
          </div>
        )}
      </div>
      {!brand.contactEmail && !brand.contactWhatsApp && !brand.contactSchedule && (
        <p className="store-info-pending">Los datos de contacto estarán disponibles próximamente.</p>
      )}
    </main>
  );
}
