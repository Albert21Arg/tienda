"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import type { Product } from "@/lib/catalog";

export function ProductCatalog({
  products,
  categories,
}: {
  products: Product[];
  categories: string[];
}) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const filteredProducts = useMemo(
    () =>
      activeCategory
        ? products.filter(
            (product) =>
              product.category.split("·")[0].trim().toLocaleLowerCase() ===
              activeCategory.toLocaleLowerCase(),
          )
        : products,
    [activeCategory, products],
  );
  const displayedProducts = activeCategory ? filteredProducts : filteredProducts.slice(0, 8);

  return (
    <>
      <div className="category-grid" aria-label="Filtrar por categoría">
        {categories.map((category, index) => (
          <button
            className={`category-tile ${activeCategory === category ? "is-active" : ""}`}
            type="button"
            aria-pressed={activeCategory === category}
            onClick={() => setActiveCategory(activeCategory === category ? null : category)}
            key={category}
          >
            <span>0{index + 1}</span>{category}<ArrowRight size={14} />
          </button>
        ))}
      </div>
      <section id="coleccion" className="catalog-section">
        <div className="section-heading">
          <div>
            <h2>{activeCategory ? `${activeCategory} en selección` : <>Favoritos de la <i>temporada</i></>}</h2>
          </div>
          <span>{displayedProducts.length} piezas</span>
        </div>
        {displayedProducts.length ? (
          <div className="product-grid" aria-live="polite">
            {displayedProducts.map((product) => (
              <ProductCard product={product} key={product.id} />
            ))}
          </div>
        ) : (
          <p className="catalog-empty" role="status">
            No hay productos disponibles en esta categoría por ahora.
          </p>
        )}
        {!activeCategory && filteredProducts.length > displayedProducts.length && (
          <p className="catalog-limit-note" role="status">Mostrando una selección de 8 piezas.</p>
        )}
      </section>
    </>
  );
}
