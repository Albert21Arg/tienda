import Link from "next/link";
import { ArrowRight, Camera } from "lucide-react";
import Image from "next/image";
import { ProductCard } from "@/components/product-card";
import { getStoreProducts } from "@/lib/catalog.server";
import { BrandName, BrandMark, BrandTagline } from "@/components/brand-mark";
import { getHomeImages } from "@/lib/home-images.server";

export default async function Home() {
  const [products, homeImages] = await Promise.all([
    getStoreProducts(),
    getHomeImages(),
  ]);
  return (
    <main>
      <section className="segment-selector" aria-label="Elige tu colección">
        <Link className="selector-tile selector-women theme-mujer" href="/tienda/mujer">
          <Image
            src={homeImages.women}
            alt="Colección Mujer"
            fill
            priority
            sizes="(max-width: 650px) 100vw, 50vw"
            unoptimized
          />
          <span className="selector-index"><BrandName /> · 01</span>
          <div className="selector-copy">
            <span className="eyebrow">DETALLE · ACTITUD · ESENCIA</span>
            <h1>Mujer</h1>
            <span className="selector-cta">
              <span className="selector-cta-desktop">Descubrir colección</span>
              <span className="selector-cta-mobile">Toca para ver productos</span>
              <ArrowRight size={18} />
            </span>
          </div>
        </Link>
        <Link className="selector-tile selector-men theme-hombre" href="/tienda/hombre">
          <Image
            src={homeImages.men}
            alt="Colección Hombre"
            fill
            priority
            sizes="(max-width: 650px) 100vw, 50vw"
            unoptimized
          />
          <span className="selector-index"><BrandName /> · 02</span>
          <div className="selector-copy">
            <span className="eyebrow">FORMA · FUNCIÓN · CARÁCTER</span>
            <h2>Hombre</h2>
            <span className="selector-cta">
              <span className="selector-cta-desktop">Descubrir colección</span>
              <span className="selector-cta-mobile">Toca para ver productos</span>
              <ArrowRight size={18} />
            </span>
          </div>
        </Link>
      </section>

      <section className="home-products">
        <div className="section-heading">
          <div><span className="eyebrow">PIEZAS CON PROPÓSITO</span><h2>Una selección <i>especial.</i></h2></div>
          <Link href="/tienda/mujer" className="text-link">Ver colecciones <ArrowRight size={15} /></Link>
        </div>
        <div className="product-grid">
          {products.slice(0, 4).map((product) => (
            <ProductCard product={product} key={product.id} />
          ))}
        </div>
      </section>

      <section className="manifesto" id="historia">
        <span className="eyebrow">UNA ELECCIÓN CONSCIENTE</span>
        <p>Creemos en comprar <i>menos.</i><br />Elegir <i>mejor.</i> Vivir cada pieza.</p>
        <span className="manifesto-signature"><BrandName /> · <BrandTagline /></span>
      </section>

      <section className="newsletter">
        <div><span className="eyebrow">CARTAS DESDE <BrandName /></span><h2>Un poco de inspiración<br /><i>en tu bandeja.</i></h2></div>
        <form action="#" className="newsletter-form">
          <label className="sr-only" htmlFor="email">Tu correo electrónico</label>
          <input id="email" type="email" placeholder="Tu correo electrónico" />
          <button type="button" aria-label="Suscribirse"><ArrowRight size={19} /></button>
          <p>Novedades, historias y primeras miradas a nuevas colecciones.</p>
        </form>
      </section>

      <footer className="site-footer">
        <div className="footer-brand"><BrandMark /><p>Una curaduría hecha para durar.</p></div>
        <div className="footer-links"><div><span>EXPLORA</span><Link href="/tienda/mujer">Mujer</Link><Link href="/tienda/hombre">Hombre</Link></div><div><span>ACOMPAÑAMIENTO</span><Link href="/contacto">Contáctanos</Link><Link href="/envios-y-cambios">Envíos y cambios</Link></div><div><span>ACCESO</span><Link href="/admin/login">Panel administrativo</Link></div></div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} <BrandName /> · HECHO CON INTENCIÓN</span><a href="https://instagram.com" aria-label="Instagram"><Camera size={17} /></a><span>COLOMBIA · COP $</span></div>
      </footer>
    </main>
  );
}
