"use client";

import { useState } from "react";
import { AddToCartButton } from "@/components/store-provider";
import type { Product } from "@/lib/catalog";

export function ProductOptions({ product }: { product: Product }) {
  const variants = product.variants ?? [];
  const initial = variants.find((variant) => variant.stockAvailable > 0) ?? variants[0];
  const [selectedId, setSelectedId] = useState(initial?.id);
  const [selectedSize, setSelectedSize] = useState(product.sizes?.[0] ?? "");
  const selected = variants.find((variant) => variant.id === selectedId) ?? initial;
  const available = selected ? selected.stockAvailable > 0 : !product.inventoryConfigured;
  const selectedProduct = selected
    ? { ...product, variantId: selected.id, color: selected.color ?? product.color }
    : product;
  const sizes = product.sizes ?? [];

  return (
    <>
      {product.color && <p className="detail-color">Color: <strong>{selected?.color ?? product.color}</strong></p>}
      {sizes.length > 0 && (
        <div className="size-picker">
          <div><span>Talla</span><a href="#guia-tallas">Guía de tallas</a></div>
          <div className="size-options">
            {sizes.map((size) => {
              const option = variants.find((variant) => variant.size === size);
              const isSelected = option ? selected?.id === option.id : selectedSize === size;
              return (
                <button
                  key={size}
                  className={`${isSelected ? "selected" : ""} ${option && option.stockAvailable <= 0 ? "size-unavailable" : ""}`}
                  disabled={Boolean(option && option.stockAvailable <= 0)}
                  onClick={() => {
                    setSelectedSize(size);
                    if (option) setSelectedId(option.id);
                  }}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {product.inventoryConfigured && (
        <p className={`variant-stock ${available ? "" : "is-sold-out"}`}>
          {available ? `${selected?.stockAvailable} unidades disponibles` : "Agotado temporalmente"}
        </p>
      )}
      <AddToCartButton
        product={selectedProduct}
        className="button-full detail-add"
        disabled={!available}
      />
      <button className="button button-outline button-full"><span aria-hidden="true">♡</span> Guardar en favoritos</button>
    </>
  );
}
