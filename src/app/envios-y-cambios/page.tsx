import Link from "next/link";
import { getSiteBrand } from "@/lib/site-brand";

export default async function ShippingReturnsPage() {
  const brand = await getSiteBrand();

  return (
    <main className="store-info-page">
      <Link className="store-info-back" href="/">Volver al inicio</Link>
      <span className="eyebrow">COMPRA CON CONFIANZA</span>
      <h1>Envíos y cambios</h1>
      {brand.shippingReturns ? (
        <p className="store-info-copy store-info-policy">{brand.shippingReturns}</p>
      ) : (
        <p className="store-info-pending">La información de envíos y cambios estará disponible próximamente.</p>
      )}
    </main>
  );
}
