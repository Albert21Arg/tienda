"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Plus, Search, Trash2, X } from "lucide-react";
import { generateProductSku } from "@/lib/product-sku";
import { calculateSalePrice } from "@/lib/pricing";
import { formatCOP } from "@/lib/catalog";

type Segment = "MEN" | "WOMEN";
type Category = { id: string; name: string; segment: Segment | null };
type ProductSize = { value: string | null; label: string };

const APPAREL_SIZES: ProductSize[] = ["XS", "S", "M", "L", "XL", "XXL"].map((size) => ({
  value: size,
  label: size,
}));
const SHOE_SIZES: ProductSize[] = Array.from({ length: 11 }, (_, index) => {
  const size = String(index + 35);
  return { value: size, label: size };
});
const ONE_SIZE: ProductSize = { value: null, label: "Única" };

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function AdminProductForm({
  categories,
  defaultMarkupPercent,
}: {
  categories: Category[];
  defaultMarkupPercent: number;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [segment, setSegment] = useState<Segment>("WOMEN");
  const [categoryId, setCategoryId] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(-1);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [stockBySize, setStockBySize] = useState<Record<string, number>>({});
  const [images, setImages] = useState([""]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const categoryInputRef = useRef<HTMLInputElement>(null);

  const visibleCategories = useMemo(() => {
    const query = categoryQuery.trim().toLocaleLowerCase("es");
    return categories
      .filter((category) => category.segment === null || category.segment === segment)
      .filter((category) => !query || category.name.toLocaleLowerCase("es").includes(query))
      .slice(0, 8);
  }, [categories, categoryQuery, segment]);

  const selectedCategory = categories.find((category) => category.id === categoryId);
  const sizeOptions = useMemo(() => {
    if (!selectedCategory) return [];
    const categoryName = selectedCategory.name.toLocaleLowerCase("es");
    if (/(zapato|calzado|tenis)/.test(categoryName)) return SHOE_SIZES;
    if (/(ropa|prenda)/.test(categoryName)) return APPAREL_SIZES;
    return [ONE_SIZE];
  }, [selectedCategory]);
  const variantSizes = sizeOptions.filter(({ label }) => selectedSizes.includes(label));

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  function closeModal() {
    if (!busy) {
      setOpen(false);
      setCategoryOpen(false);
      setError("");
    }
  }

  function selectCategory(category: Category) {
    setCategoryId(category.id);
    setCategoryQuery(category.name);
    setCategoryOpen(false);
    setActiveCategoryIndex(-1);
    setSelectedSizes(
      /(ropa|prenda)/.test(category.name.toLocaleLowerCase("es")) ? [] : [ONE_SIZE.label],
    );
    setStockBySize({});
  }

  function changeSegment(nextSegment: Segment) {
    setSegment(nextSegment);
    setCategoryId("");
    setCategoryQuery("");
    setCategoryOpen(false);
    setSelectedSizes([]);
    setStockBySize({});
  }

  function toggleSize(size: string) {
    setSelectedSizes((current) =>
      current.includes(size) ? current.filter((value) => value !== size) : [...current, size],
    );
  }

  function setStock(size: string, value: string) {
    const stock = value === "" ? 0 : Math.max(0, Number(value));
    setStockBySize((current) => ({ ...current, [size]: stock }));
  }

  function openModal() {
    setOpen(true);
    setName("");
    setSlug("");
    setSlugEdited(false);
    setSegment("WOMEN");
    setCategoryId("");
    setCostPrice("");
    setCategoryQuery("");
    setSelectedSizes([]);
    setStockBySize({});
    setImages([""]);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryId) {
      setError("Selecciona una categoría de las sugerencias.");
      categoryInputRef.current?.focus();
      return;
    }
    if (variantSizes.length === 0) {
      setError("Selecciona al menos una talla para crear el producto.");
      return;
    }
    const productImages = images.map((image) => image.trim()).filter(Boolean);
    if (productImages.length === 0) {
      setError("Agrega al menos una foto del producto.");
      return;
    }
    if (productImages.some((image) => {
      try {
        return !["http:", "https:"].includes(new URL(image).protocol);
      } catch {
        return true;
      }
    })) {
      setError("Cada foto debe tener una URL válida que empiece con http:// o https://.");
      return;
    }

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? "").trim(),
          slug: String(form.get("slug") ?? "").trim(),
          description: String(form.get("description") ?? "").trim(),
          segment,
          categoryId,
          costPrice: Number(form.get("costPrice")),
          images: productImages,
          reason: String(form.get("reason") ?? "").trim(),
          color: String(form.get("color") ?? "").trim(),
          variants: variantSizes.map(({ value, label }) => ({
            size: value,
            stockOnHand: stockBySize[label] ?? 0,
            stockMin: Number(form.get("stockMin")),
          })),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "No fue posible crear el producto.");
        return;
      }
      setOpen(false);
      window.location.reload();
    } catch {
      setError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  const skuSlug = slug || slugify(name);

  function updateImage(index: number, value: string) {
    setImages((current) => current.map((image, imageIndex) => imageIndex === index ? value : image));
  }

  function addImage() {
    setImages((current) => current.length < 3 ? [...current, ""] : current);
  }

  function removeImage(index: number) {
    setImages((current) => current.filter((_, imageIndex) => imageIndex !== index));
  }

  function isValidImageUrl(value: string) {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }

  return (
    <>
      <button className="button button-dark admin-create-trigger" type="button" onClick={openModal}>
        <Plus size={16} /> Crear producto
      </button>
      {open && (
        <div
          className="product-modal-backdrop admin-create-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            className="product-modal product-modal-wide admin-create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-create-title"
            aria-describedby="admin-create-description"
            tabIndex={-1}
            ref={dialogRef}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                closeModal();
              } else if (event.key === "Tab") {
                const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
                  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
                );
                const first = controls?.[0];
                const last = controls?.[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <header className="product-modal-header">
              <div>
                <span className="eyebrow">CATÁLOGO · NUEVA PIEZA</span>
                <h2 id="admin-create-title">Crear producto</h2>
                <p id="admin-create-description">
                  Completa los datos y agrega las tallas con su inventario inicial.
                </p>
              </div>
              <button
                className="product-modal-close"
                type="button"
                aria-label="Cerrar ventana"
                onClick={closeModal}
                disabled={busy}
              >
                <X size={20} />
              </button>
            </header>
            <form className="admin-product-form admin-product-create-form" onSubmit={submit}>
              <label>
                Nombre del producto
                <input
                  name="name"
                  value={name}
                  onChange={(event) => {
                    const value = event.target.value;
                    setName(value);
                    if (!slugEdited) setSlug(slugify(value));
                  }}
                  required
                  minLength={2}
                  maxLength={160}
                  autoFocus
                />
              </label>
              <label>
                Slug
                <input
                  name="slug"
                  value={slug}
                  onChange={(event) => {
                    setSlug(event.target.value);
                    setSlugEdited(true);
                  }}
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  maxLength={180}
                />
              </label>
              <label>
                Segmento
                <select value={segment} onChange={(event) => changeSegment(event.target.value as Segment)}>
                  <option value="WOMEN">Mujer</option>
                  <option value="MEN">Hombre</option>
                </select>
              </label>
              <div className="admin-category-field">
                <label htmlFor="new-product-category">Categoría</label>
                <div className="admin-category-input-wrap">
                  <Search size={17} aria-hidden="true" />
                  <input
                    ref={categoryInputRef}
                    id="new-product-category"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={categoryOpen}
                    aria-controls="new-product-category-options"
                    aria-activedescendant={
                      categoryOpen && activeCategoryIndex >= 0 && visibleCategories[activeCategoryIndex]
                        ? `new-product-category-${visibleCategories[activeCategoryIndex].id}`
                        : undefined
                    }
                    value={categoryQuery}
                    onFocus={() => {
                      setCategoryOpen(true);
                      setActiveCategoryIndex(-1);
                    }}
                    onChange={(event) => {
                      setCategoryQuery(event.target.value);
                      setCategoryId("");
                      setCategoryOpen(true);
                      setActiveCategoryIndex(-1);
                    }}
                    onBlur={() => setCategoryOpen(false)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown" && visibleCategories.length) {
                        event.preventDefault();
                        setCategoryOpen(true);
                        setActiveCategoryIndex((index) => (index + 1) % visibleCategories.length);
                      } else if (event.key === "ArrowUp" && visibleCategories.length) {
                        event.preventDefault();
                        setCategoryOpen(true);
                        setActiveCategoryIndex((index) =>
                          index <= 0 ? visibleCategories.length - 1 : index - 1,
                        );
                      } else if (
                        event.key === "Enter" &&
                        categoryOpen &&
                        activeCategoryIndex >= 0 &&
                        visibleCategories[activeCategoryIndex]
                      ) {
                        event.preventDefault();
                        selectCategory(visibleCategories[activeCategoryIndex]);
                      } else if (event.key === "Escape") {
                        event.stopPropagation();
                        setCategoryOpen(false);
                      }
                    }}
                    placeholder="Escribe para buscar una categoría"
                    autoComplete="off"
                    required
                  />
                </div>
                {categoryOpen && (
                  <ul className="admin-category-suggestions" id="new-product-category-options" role="listbox">
                    {visibleCategories.map((category, index) => (
                      <li
                        id={`new-product-category-${category.id}`}
                        key={category.id}
                        role="option"
                        aria-selected={category.id === categoryId}
                      >
                        <button
                          type="button"
                          className={index === activeCategoryIndex ? "is-active" : ""}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActiveCategoryIndex(index)}
                          onClick={() => selectCategory(category)}
                        >
                          <span>{category.name}</span>
                          <small>
                            {category.segment === "MEN" ? "Hombre" : category.segment === "WOMEN" ? "Mujer" : "General"}
                          </small>
                        </button>
                      </li>
                    ))}
                    {!visibleCategories.length && (
                      <li className="admin-category-empty">No hay categorías coincidentes.</li>
                    )}
                  </ul>
                )}
                {selectedCategory && !categoryOpen && (
                  <span className="admin-category-selected">
                    Categoría seleccionada: {selectedCategory.name}
                  </span>
                )}
              </div>
              <label>
                Valor de creación (COP)
                <input
                  name="costPrice"
                  type="number"
                  min="1"
                  step="1"
                  value={costPrice}
                  onChange={(event) => setCostPrice(event.target.value)}
                  required
                />
                <small>El margen predeterminado de {defaultMarkupPercent}% se sumará automáticamente.</small>
                {Number(costPrice) > 0 && (
                  <small>Precio de venta calculado: <strong>{formatCOP(calculateSalePrice(Number(costPrice), defaultMarkupPercent))}</strong></small>
                )}
              </label>
              <label>
                Color
                <input name="color" maxLength={60} placeholder="Opcional" />
              </label>
              <fieldset className="admin-product-images-fieldset wide">
                <legend>Fotos del producto</legend>
                <p>Agrega de 1 a 3 fotos mediante sus URL. La primera será la imagen principal.</p>
                <div className="admin-product-image-list">
                  {images.map((image, index) => (
                    <div className="admin-product-image-row" key={index}>
                      <label htmlFor={`new-product-image-${index}`}>
                        Foto {index + 1}{index === 0 ? " · Principal" : " · Opcional"}
                      </label>
                      <div className="admin-product-image-input-row">
                        <input
                          id={`new-product-image-${index}`}
                          type="url"
                          value={image}
                          onChange={(event) => updateImage(index, event.target.value)}
                          placeholder="https://..."
                          required={index === 0}
                        />
                        {index > 0 && (
                          <button
                            className="admin-product-image-remove"
                            type="button"
                            aria-label={`Quitar foto ${index + 1}`}
                            onClick={() => removeImage(index)}
                          >
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                      {image && isValidImageUrl(image) && (
                        <div className="admin-product-image-preview">
                          <Image
                            src={image}
                            alt={`Vista previa de la foto ${index + 1}`}
                            fill
                            sizes="(max-width: 650px) 100vw, 360px"
                            unoptimized
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {images.length < 3 && (
                  <button className="button button-outline admin-product-image-add" type="button" onClick={addImage}>
                    <Plus size={16} /> Agregar otra foto
                  </button>
                )}
              </fieldset>
              <fieldset className="admin-size-fieldset wide" disabled={!categoryId}>
                <legend>Tallas y unidades disponibles</legend>
                <p>Elige una o varias tallas; cada una tendrá su propio inventario y SKU.</p>
                {sizeOptions.length > 1 ? (
                  <div className="admin-size-options" role="group" aria-label="Selecciona las tallas">
                    {sizeOptions.map(({ label }) => (
                      <button
                        key={label}
                        type="button"
                        className={selectedSizes.includes(label) ? "is-selected" : ""}
                        aria-pressed={selectedSizes.includes(label)}
                        onClick={() => toggleSize(label)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : selectedCategory ? (
                  <span className="admin-one-size-note">Este tipo de producto se maneja como talla única.</span>
                ) : (
                  <span className="admin-one-size-note">Primero selecciona una categoría.</span>
                )}
                <div className="admin-size-stock-list">
                  {variantSizes.map(({ value, label }) => (
                    <div className="admin-size-stock-row" key={label}>
                      <strong>{label}</strong>
                      <label>
                        Cantidad
                        <input
                          aria-label={`Cantidad talla ${label}`}
                          type="number"
                          min="0"
                          step="1"
                          value={stockBySize[label] ?? 0}
                          onChange={(event) => setStock(label, event.target.value)}
                        />
                      </label>
                      <code>{skuSlug ? generateProductSku(segment, skuSlug, value) : "SKU sugerido al completar el nombre"}</code>
                    </div>
                  ))}
                  {selectedCategory && !variantSizes.length && (
                    <span className="admin-one-size-note">Selecciona al menos una talla.</span>
                  )}
                </div>
              </fieldset>
              <label>
                Stock mínimo por talla
                <input name="stockMin" type="number" min="0" step="1" defaultValue="2" required />
              </label>
              <label className="wide">
                Descripción
                <textarea name="description" required rows={3} maxLength={10000} />
              </label>
              <label className="wide">
                Motivo de creación
                <input
                  name="reason"
                  required
                  minLength={3}
                  maxLength={500}
                  placeholder="Motivo para el registro de auditoría"
                />
              </label>
              {error && <p className="form-error wide" role="alert">{error}</p>}
              <div className="admin-product-create-actions wide">
                <button className="button button-dark" type="submit" disabled={busy || !categories.length}>
                  {busy ? "Guardando..." : "Guardar producto"}
                </button>
                <button className="button button-outline" type="button" disabled={busy} onClick={closeModal}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
