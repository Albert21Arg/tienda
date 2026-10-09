"use client";

import Image from "next/image";
import { Pencil, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AdminProductEditForm } from "@/components/admin-product-edit-form";
import { formatCOP } from "@/lib/catalog";

type Segment = "MEN" | "WOMEN" | null;
type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  segment: Exclude<Segment, null>;
  categoryId: string;
  categoryName: string;
  variantCount: number;
  availableStock: number;
  price: number;
  previousPrice: number | null;
  active: boolean;
};
type CategoryOption = { id: string; name: string; segment: Segment };
type DiscountType = "PERCENTAGE" | "FIXED_AMOUNT";

function ProductModal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      className="product-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`product-modal ${wide ? "product-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        aria-describedby="product-modal-description"
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="product-modal-header">
          <div>
            <span className="eyebrow">GESTIÓN DE PRODUCTOS</span>
            <h2 id="product-modal-title">{title}</h2>
            <p id="product-modal-description">{description}</p>
          </div>
          <button className="product-modal-close" type="button" aria-label="Cerrar ventana" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function AdminProductsManager({
  products,
  categories,
  canUpdate,
}: {
  products: ProductRow[];
  categories: CategoryOption[];
  canUpdate: boolean;
}) {
  const [segment, setSegment] = useState<"ALL" | "MEN" | "WOMEN">("ALL");
  const [categoryId, setCategoryId] = useState("ALL");
  const [productQuery, setProductQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>("PERCENTAGE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const closeEditModal = () => setEditingProduct(null);
  const closeDiscountModal = () => {
    if (busy) return;
    setDiscountOpen(false);
    setError("");
  };

  const visibleCategories = useMemo(
    () =>
      categories.filter(
        (category) => segment === "ALL" || category.segment === segment || category.segment === null,
      ),
    [categories, segment],
  );
  const visibleProducts = useMemo(
    () => {
      const normalizedQuery = productQuery.trim().toLocaleLowerCase();
      return products.filter(
        (product) =>
          (segment === "ALL" || product.segment === segment) &&
          (categoryId === "ALL" || product.categoryId === categoryId) &&
          (!normalizedQuery || product.name.toLocaleLowerCase().includes(normalizedQuery)),
      );
    },
    [categoryId, productQuery, products, segment],
  );
  const allVisibleSelected =
    visibleProducts.length > 0 && visibleProducts.every((product) => selectedIds.includes(product.id));
  const activeSelectedCount = products.filter((product) => selectedIds.includes(product.id) && product.active).length;

  function changeSegment(value: "ALL" | "MEN" | "WOMEN") {
    setSegment(value);
    setCategoryId("ALL");
  }

  function toggleProduct(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id],
    );
    setError("");
    setSuccess("");
  }

  function toggleVisibleProducts() {
    const visibleIds = new Set(visibleProducts.map((product) => product.id));
    setSelectedIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.has(id))
        : [...new Set([...current, ...visibleIds])],
    );
    setError("");
    setSuccess("");
  }

  async function applyDiscount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedIds.length) {
      setError("Selecciona al menos un producto.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const value = Number(form.get("value"));
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/products/bulk-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: selectedIds,
          type: form.get("type"),
          value,
          reason: form.get("reason"),
        }),
      });
      const result = (await response.json()) as { error?: string; updatedCount?: number };
      if (!response.ok) {
        setError(result.error ?? "No fue posible aplicar el descuento.");
        return;
      }
      setSuccess(`Descuento aplicado a ${result.updatedCount ?? selectedIds.length} productos.`);
      setSelectedIds([]);
      setDiscountOpen(false);
      window.location.reload();
    } catch {
      setError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivateSelected(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/products/bulk-deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: selectedIds,
          reason: String(form.get("reason") ?? "").trim(),
        }),
      });
      const result = await response.json() as { error?: string; updatedCount?: number };
      if (!response.ok || result.updatedCount === undefined) {
        setError(result.error ?? "No fue posible desactivar los productos.");
        return;
      }
      setSelectedIds([]);
      setDeactivateOpen(false);
      setSuccess(`${result.updatedCount} producto${result.updatedCount === 1 ? "" : "s"} desactivado${result.updatedCount === 1 ? "" : "s"}.`);
      window.location.reload();
    } catch {
      setError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-section-card">
      <div className="admin-section-heading">
        <div>
          <span className="eyebrow">INVENTARIO EDITORIAL</span>
          <h2>Productos</h2>
        </div>
        <span>{visibleProducts.length} de {products.length} productos</span>
      </div>
      <div className="product-admin-toolbar">
        <label>
          Segmento
          <select value={segment} onChange={(event) => changeSegment(event.target.value as "ALL" | "MEN" | "WOMEN")}>
            <option value="ALL">Todos</option>
            <option value="WOMEN">Mujer</option>
            <option value="MEN">Hombre</option>
          </select>
        </label>
        <label>
          Categoría
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="ALL">Todas las categorías</option>
            {visibleCategories.map((category) => (
              <option value={category.id} key={category.id}>
                {category.segment === "MEN" ? "Hombre · " : category.segment === "WOMEN" ? "Mujer · " : ""}
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Buscar producto
          <input
            type="search"
            value={productQuery}
            onChange={(event) => setProductQuery(event.target.value)}
            placeholder="Escribe el nombre"
            aria-label="Buscar producto por nombre"
          />
        </label>
        {canUpdate && (
          <div className="product-selection-actions">
            <span>{selectedIds.length} seleccionados</span>
            <button
              className="button button-outline"
              type="button"
              disabled={!selectedIds.length}
              onClick={() => {
                setEditingProduct(null);
                setDiscountOpen(true);
                setDiscountType("PERCENTAGE");
                setError("");
              }}
            >
              Aplicar descuento
            </button>
            <button
              className="button button-outline product-deactivate-trigger"
              type="button"
              disabled={!activeSelectedCount || busy}
              onClick={() => {
                setDiscountOpen(false);
                setError("");
                setDeactivateOpen(true);
              }}
            >
              Desactivar {activeSelectedCount > 0 ? `(${activeSelectedCount})` : "seleccionados"}
            </button>
            {selectedIds.length > 0 && (
              <button className="product-clear-selection" type="button" onClick={() => setSelectedIds([])}>
                Limpiar selección
              </button>
            )}
          </div>
        )}
      </div>
      {editingProduct && (
        <ProductModal
          title={`Editar ${editingProduct.name}`}
          description="Actualiza la información del producto. Los SKU y el inventario se administran por separado."
          onClose={closeEditModal}
          wide
        >
          <AdminProductEditForm
            key={editingProduct.id}
            product={{
              id: editingProduct.id,
              name: editingProduct.name,
              slug: editingProduct.slug,
              description: editingProduct.description,
              image: editingProduct.image,
              segment: editingProduct.segment,
              categoryId: editingProduct.categoryId,
              price: editingProduct.price,
              active: editingProduct.active,
            }}
            categories={categories}
            onCancel={closeEditModal}
          />
        </ProductModal>
      )}
      {discountOpen && (
        <ProductModal
          title="Aplicar descuento"
          description={`El descuento se aplicará a ${selectedIds.length} producto${selectedIds.length === 1 ? "" : "s"} seleccionado${selectedIds.length === 1 ? "" : "s"}.`}
          onClose={closeDiscountModal}
        >
          <form className="product-discount-form" onSubmit={applyDiscount}>
            <label>
              Tipo de descuento
              <select
                name="type"
                value={discountType}
                onChange={(event) => setDiscountType(event.target.value as DiscountType)}
              >
                <option value="PERCENTAGE">Porcentaje (%)</option>
                <option value="FIXED_AMOUNT">Valor fijo (COP)</option>
              </select>
            </label>
            <label>
              {discountType === "PERCENTAGE" ? "Porcentaje (%)" : "Valor (COP)"}
              <input
                name="value"
                type="number"
                min="1"
                max={discountType === "PERCENTAGE" ? 99 : undefined}
                step="1"
                required
              />
            </label>
            <label className="wide">
              Motivo para auditoría
              <input name="reason" minLength={3} maxLength={500} required placeholder="Ej. promoción de temporada" />
            </label>
            {error && <p className="form-error wide" role="alert">{error}</p>}
            <div className="product-discount-actions wide">
              <button className="button button-dark" type="submit" disabled={busy}>
                {busy ? "Aplicando..." : "Confirmar descuento"}
              </button>
              <button className="button button-outline" type="button" disabled={busy} onClick={closeDiscountModal}>
                Cancelar
              </button>
            </div>
          </form>
        </ProductModal>
      )}
      {deactivateOpen && (
        <ProductModal
          title="Desactivar productos"
          description={`Se ocultarán de la tienda ${activeSelectedCount} producto${activeSelectedCount === 1 ? "" : "s"}. Podrás volver a activarlos editándolos.`}
          onClose={() => {
            if (busy) return;
            setDeactivateOpen(false);
            setError("");
          }}
        >
          <form className="product-deactivate-form" onSubmit={deactivateSelected}>
            <label>
              Motivo de la desactivación
              <textarea name="reason" minLength={3} maxLength={500} rows={3} required placeholder="Ej. producto agotado o fuera de temporada" />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="product-discount-actions">
              <button className="button button-dark" type="submit" disabled={busy || !activeSelectedCount}>
                {busy ? "Desactivando..." : `Confirmar desactivación (${activeSelectedCount})`}
              </button>
              <button className="button button-outline" type="button" disabled={busy} onClick={() => setDeactivateOpen(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </ProductModal>
      )}
      {success && <p className="product-discount-success" role="status">{success}</p>}
      {error && !discountOpen && !deactivateOpen && <p className="form-error product-admin-error" role="alert">{error}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {canUpdate && (
                <th className="product-select-cell">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos los productos visibles"
                    checked={allVisibleSelected}
                    onChange={toggleVisibleProducts}
                  />
                </th>
              )}
              <th>Producto</th><th>Segmento</th><th>Categoría</th><th>SKU / variantes</th><th>Disponibles</th><th>Precio</th><th>Estado</th>
              {canUpdate && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((product) => (
              <tr key={product.id}>
                {canUpdate && (
                  <td className="product-select-cell">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${product.name}`}
                      checked={selectedIds.includes(product.id)}
                      onChange={() => toggleProduct(product.id)}
                    />
                  </td>
                )}
                <td>
                  <div className="admin-product-name">
                    {product.image && <Image src={product.image} alt="" width={31} height={36} unoptimized />}
                    <strong>{product.name}</strong>
                  </div>
                </td>
                <td>{product.segment === "MEN" ? "Hombre" : "Mujer"}</td>
                <td>{product.categoryName}</td>
                <td>{product.variantCount} variantes</td>
                <td className={product.availableStock <= 2 ? "metric-warning" : ""}>{product.availableStock}</td>
                <td className="admin-product-price">
                  <strong>{formatCOP(product.price)}</strong>
                  {product.previousPrice && <del>{formatCOP(product.previousPrice)}</del>}
                </td>
                <td><span className={`status-pill ${product.active ? "status-confirmed" : "status-cancelled"}`}>{product.active ? "Activo" : "Inactivo"}</span></td>
                {canUpdate && (
                  <td>
                    <button
                      className="product-edit-trigger"
                      type="button"
                      aria-label={`Editar ${product.name}`}
                      onClick={() => {
                        setDiscountOpen(false);
                        setError("");
                        setEditingProduct(product);
                      }}
                    >
                      <Pencil size={15} /> Editar
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {visibleProducts.length === 0 && (
              <tr><td className="table-empty" colSpan={canUpdate ? 9 : 7}>No hay productos que coincidan con estos filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
