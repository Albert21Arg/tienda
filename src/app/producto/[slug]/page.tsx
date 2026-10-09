import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, Truck } from "lucide-react";
import { ProductOptions } from "@/components/product-options";
import { ProductImageGallery } from "@/components/product-image-gallery";
import { ProductCard } from "@/components/product-card";
import { formatCOP, products } from "@/lib/catalog";
import { getStoreProduct, getStoreProducts } from "@/lib/catalog.server";
import { getSiteBrand } from "@/lib/site-brand";

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [product, brand] = await Promise.all([getStoreProduct(slug), getSiteBrand()]);
  if (!product) notFound();
  const related = (await getStoreProducts(product.segment)).filter(
    (item) => item.segment === product.segment && item.id !== product.id,
  );

  return (
    <main className={`product-detail theme-${product.segment}`}>
      <div className="detail-breadcrumb">
        <Link href={`/tienda/${product.segment}`}><ArrowLeft size={14} /> Volver a {product.segment}</Link>
        <span> / </span>{product.category.split(" · ")[0]}
      </div>
      <div className="detail-layout">
        <ProductImageGallery
          images={product.images?.length ? product.images : [product.image]}
          name={product.name}
          label={product.label}
        />
        <section className="detail-info">
          <span className="eyebrow">{product.category}</span>
          <h1>{product.name}</h1>
          <div className="detail-price">
            <strong>{formatCOP(product.price)}</strong>
            {product.previousPrice && <del>{formatCOP(product.previousPrice)}</del>}
          </div>
          <p className="detail-description">{product.description}</p>
          <ProductOptions product={product} />
          <div className="detail-perks">
            <p><Truck size={16} /> Envío gratis desde $250.000</p>
            <p><ShieldCheck size={16} /> Compra protegida y pago seguro</p>
          </div>
          <div className="detail-accordion" id="guia-tallas">
            <details><summary>Detalles del producto</summary><p>{product.description} Diseñado con atención a cada acabado y seleccionado para acompañarte por mucho tiempo.</p></details>
            <details><summary>Envíos y cambios</summary><p>{brand.shippingReturns || brand.announcement}</p><Link href="/envios-y-cambios">Ver información completa</Link></details>
          </div>
        </section>
      </div>
      <section className="related-products">
        <div className="section-heading"><div><span className="eyebrow">COMPLETA TU SELECCIÓN</span><h2>También te puede <i>gustar</i></h2></div></div>
        <div className="product-grid">{related.slice(0, 3).map((item) => <ProductCard key={item.id} product={item} />)}</div>
      </section>
    </main>
  );
}
