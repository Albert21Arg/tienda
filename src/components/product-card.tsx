"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Heart, Plus, ShoppingBag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatCOP, type Product } from "@/lib/catalog";
import { useStore } from "@/components/store-provider";
import { ProductOptions } from "@/components/product-options";

export function ProductCard({ product }: { product: Product }) {
  const [favorite, setFavorite] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { add } = useStore();
  const availableVariants = product.variants?.filter((variant) => variant.stockAvailable > 0) ?? [];
  const needsVariantSelection = Boolean(product.inventoryConfigured && availableVariants.length !== 1);

  useEffect(() => {
    if (!isPreviewOpen) return;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPreviewOpen(false);
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [isPreviewOpen]);

  return (
    <article className={`product-card theme-${product.segment}`}>
      <button
        className="product-image-link"
        type="button"
        aria-label={`Ver ${product.name}`}
        onClick={() => setIsPreviewOpen(true)}
      >
        <div className="product-image">
          <Image src={product.image} alt={product.name} fill sizes="(max-width: 650px) 50vw, (max-width: 900px) 25vw, 300px" unoptimized />
          {product.label && <span className="product-badge product-card-discount-badge">{product.label}</span>}
        </div>
      </button>
      <button
        className={`favorite-button ${favorite ? "is-favorite" : ""}`}
        aria-label={favorite ? "Quitar de favoritos" : "Guardar en favoritos"}
        onClick={() => setFavorite((value) => !value)}
      >
        <Heart size={18} fill={favorite ? "currentColor" : "none"} />
      </button>
      <div className="product-meta">
        <div className="product-name-row">
          <div>
            <span className="product-category">{product.category}</span>
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="product-name product-name-trigger"
            >
              {product.name}
            </button>
          </div>
        </div>
        <div className="product-price-row">
          <strong>{formatCOP(product.price)}</strong>
          {product.previousPrice && <del>{formatCOP(product.previousPrice)}</del>}
        </div>
        <button
          className="product-card-add"
          aria-label={needsVariantSelection ? `Elegir opciones de ${product.name}` : `Agregar ${product.name} a la bolsa`}
          disabled={isAdding}
          onClick={async () => {
            if (needsVariantSelection) {
              setIsPreviewOpen(true);
              return;
            }
            setIsAdding(true);
            const added = await add(product);
            setIsAdding(false);
            if (added) {
              setJustAdded(true);
              window.setTimeout(() => setJustAdded(false), 1800);
            }
          }}
        >
          {needsVariantSelection ? <Plus size={16} /> : <ShoppingBag size={16} />}
          {isAdding ? "Agregando..." : justAdded ? "Agregado" : needsVariantSelection ? "Ver opciones" : "Agregar"}
        </button>
      </div>
      {isPreviewOpen && (
        <div
          className="product-quick-view-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsPreviewOpen(false);
          }}
        >
          <section
            aria-labelledby={`quick-view-title-${product.id}`}
            aria-modal="true"
            className={`product-quick-view theme-${product.segment}`}
            role="dialog"
          >
            <button
              ref={closeButtonRef}
              aria-label="Cerrar vista del producto"
              className="product-quick-view-close"
              onClick={() => setIsPreviewOpen(false)}
              type="button"
            >
              <X size={22} />
            </button>
            <div className="product-quick-view-image">
              <Image
                src={product.image}
                alt={product.name}
                fill
                sizes="(max-width: 650px) 100vw, 50vw"
                unoptimized
              />
              {product.label && <span className="product-badge">{product.label}</span>}
            </div>
            <div className="product-quick-view-info">
              <span className="product-category">{product.category}</span>
              <h2 id={`quick-view-title-${product.id}`}>{product.name}</h2>
              <div className="product-price-row">
                <strong>{formatCOP(product.price)}</strong>
                {product.previousPrice && <del>{formatCOP(product.previousPrice)}</del>}
              </div>
              <p>{product.description}</p>
              {product.inventoryConfigured ? (
                <ProductOptions product={product} onAdded={() => setIsPreviewOpen(false)} />
              ) : (
                <Link className="button button-dark" href={`/producto/${product.slug}`}>
                  Ver producto y opciones <ArrowUpRight size={17} />
                </Link>
              )}
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
