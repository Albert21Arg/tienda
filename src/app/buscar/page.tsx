import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { BrandName } from "@/components/brand-mark";
import { getStoreProducts } from "@/lib/catalog.server";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim().slice(0, 100);
  const products = await getStoreProducts();
  const matches = products.filter((product) =>
    `${product.name} ${product.category} ${product.color}`
      .toLocaleLowerCase("es-CO")
      .includes(query.toLocaleLowerCase("es-CO")),
  );
  return (
    <main className="search-page">
      <div className="breadcrumbs"><Link href="/">Inicio</Link><span>/</span> Búsqueda</div>
      <span className="eyebrow">DESCUBRE <BrandName /></span>
      <h1>{query ? <>Resultados para <i>“{query}”</i></> : <>¿Qué te gustaría <i>encontrar?</i></>}</h1>
      {query && <p>{matches.length} {matches.length === 1 ? "pieza encontrada" : "piezas encontradas"}</p>}
      {matches.length ? (
        <div className="product-grid">{matches.map((product) => <ProductCard key={product.id} product={product} />)}</div>
      ) : query ? (
        <div className="search-empty"><p>No encontramos piezas con esas palabras.</p><Link className="button button-dark" href="/">Volver a explorar</Link></div>
      ) : (
        <div className="search-suggestions">{["Mujer", "Hombre", "Accesorios", "Belleza"].map((label) => <Link href={`/buscar?q=${encodeURIComponent(label)}`} key={label}>{label}</Link>)}</div>
      )}
    </main>
  );
}
