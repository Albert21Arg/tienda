import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { ProductCatalog } from "@/components/product-catalog";
import { segmentInfo, type Segment } from "@/lib/catalog";
import { getStoreCategories, getStoreProducts } from "@/lib/catalog.server";
import { getEditorialBanners } from "@/lib/editorial-banners.server";

export function generateStaticParams() {
  return [{ segmento: "hombre" }, { segmento: "mujer" }];
}

export default async function SegmentPage({
  params,
}: {
  params: Promise<{ segmento: string }>;
}) {
  const { segmento } = await params;
  if (segmento !== "hombre" && segmento !== "mujer") notFound();
  const segment = segmento as Segment;
  const info = segmentInfo[segment];
  const [segmentProducts, categories, banners] = await Promise.all([
    getStoreProducts(segment),
    getStoreCategories(segment),
    getEditorialBanners(),
  ]);
  const banner = banners[segment];

  return (
    <main
      className={`segment-page theme-${segment}`}
      style={{ backgroundColor: segment === "mujer" ? "#fbf0f2" : "#f1f2f3" }}
    >
      <section className="segment-content">
        <div className="breadcrumbs"><Link href="/">Inicio</Link><span>/</span>{info.name}</div>
        <ProductCatalog products={segmentProducts} categories={categories} />
        <section className="editorial-banner">
          <div>
            <span className="eyebrow">{banner.eyebrow}</span>
            <h2>{banner.title}<br /><i>{banner.accent}</i></h2>
            <p>{banner.description}</p>
          </div>
          <Image src={banner.image || segmentProducts[1]?.image || info.image} alt="" fill sizes="(max-width: 650px) 54vw, 42vw" unoptimized />
        </section>
      </section>
    </main>
  );
}
