"use client";

import { useState } from "react";
import { AddToCartButton } from "@/components/store-provider";
import type { Product } from "@/lib/catalog";

export function ProductOptions({ product, onAdded }: { product: Product; onAdded?: () => void }) {
  const variants = product.variants ?? [];
  const initial = variants.find((variant) => variant.stockAvailable > 0) ?? variants[0];
  const [selectedId, setSelectedId] = useState(initial?.id);
  const [selectedColor, setSelectedColor] = useState(initial?.color ?? "");
  const [selectedSize, setSelectedSize] = useState(initial?.size ?? product.sizes?.[0] ?? "");
  const selected = variants.find((variant) => variant.id === selectedId) ?? initial;
  const available = selected ? selected.stockAvailable > 0 : !product.inventoryConfigured;
  const selectedProduct = selected
    ? { ...product, variantId: selected.id, color: selected.color ?? product.color }
    : product;
  const colors = [...new Set(variants.flatMap((variant) => variant.color ? [variant.color] : []))];
  const sizes = product.sizes ?? [...new Set(variants.flatMap((variant) => variant.size ? [variant.size] : []))];

  return (
    <>
      {colors.length > 1 ? (
        <div className="color-picker">
          <span>Color: <strong>{selectedColor}</strong></span>
          <div className="color-options" role="group" aria-label="Selecciona un color">
            {colors.map((color) => {
              const colorVariants = variants.filter((variant) => variant.color === color);
              const colorAvailable = colorVariants.some((variant) => variant.stockAvailable > 0);
              return (
                <button
                  key={color}
                  type="button"
                  className={selectedColor === color ? "selected" : ""}
                  aria-pressed={selectedColor === color}
                  disabled={!colorAvailable}
                  onClick={() => {
                    const next = colorVariants.find((variant) => variant.stockAvailable > 0) ?? colorVariants[0];
                    setSelectedColor(color);
                    setSelectedId(next?.id);
                    if (next?.size) setSelectedSize(next.size);
                  }}
                >
                  {color}
                </button>
              );
            })}
          </div>
        </div>
      ) : colors.length === 1 || product.color ? (
        <p className="detail-color">Color: <strong>{colors[0] ?? product.color}</strong></p>
      ) : null}
      {sizes.length > 0 && (
        <div className="size-picker">
          <div><span>Talla</span><a href="#guia-tallas">Guía de tallas</a></div>
          <div className="size-options">
            {sizes.map((size) => {
              const sizeVariants = variants.filter((variant) =>
                variant.size === size && (!colors.length || variant.color === selectedColor),
              );
              const option = sizeVariants.find((variant) => variant.stockAvailable > 0) ?? sizeVariants[0];
              const isSelected = selected?.id === option?.id || (!option && selectedSize === size);
              const unavailable = product.inventoryConfigured && (!option || option.stockAvailable <= 0);
              return (
                <button
                  key={size}
                  className={`${isSelected ? "selected" : ""} ${unavailable ? "size-unavailable" : ""}`}
                  disabled={unavailable}
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
        onAdded={onAdded}
      />
      <button className="button button-outline button-full"><span aria-hidden="true">♡</span> Guardar en favoritos</button>
    </>
  );
}
