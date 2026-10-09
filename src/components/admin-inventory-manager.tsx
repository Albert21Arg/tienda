"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { INVENTORY_PAGE_SIZE, type InventoryPage, type InventoryVariantRow } from "@/lib/admin-inventory.types";

type InventoryVariant = InventoryVariantRow;

type InventoryFilter = "ALL" | "LOW" | "OUT" | "AVAILABLE";
type SegmentFilter = "ALL" | "MEN" | "WOMEN";

const inventoryFilters: { id: InventoryFilter; label: string }[] = [
  { id: "ALL", label: "Todos" },
  { id: "LOW", label: "Stock bajo" },
  { id: "OUT", label: "Agotado" },
  { id: "AVAILABLE", label: "Disponible" },
];

export function AdminInventoryManager({
  initialPage,
  canUpdate,
}: {
  initialPage: InventoryPage;
  canUpdate: boolean;
}) {
  const [variants, setVariants] = useState(initialPage.variants);
  const [total, setTotal] = useState(initialPage.total);
  const [page, setPage] = useState(initialPage.page);
  const [pageCount, setPageCount] = useState(initialPage.pageCount);
  const [query, setQuery] = useState("");
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>("ALL");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("ALL");
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [stockOnHand, setStockOnHand] = useState("");
  const [stockMin, setStockMin] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const initialRequest = useRef(true);

  useEffect(() => {
    if (initialRequest.current) {
      initialRequest.current = false;
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      query,
      segment: segmentFilter,
      status: inventoryFilter,
    });
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void fetch(`/api/admin/inventory?${params}`, { signal: controller.signal })
        .then(async (response) => {
          const result = await response.json() as {
            error?: string;
            variants?: InventoryVariant[];
            total?: number;
            page?: number;
            pageCount?: number;
          };
          if (!response.ok || !result.variants || result.total === undefined || result.page === undefined || result.pageCount === undefined) {
            setError(result.error ?? "No se pudo cargar el inventario.");
            return;
          }
          setVariants(result.variants);
          setTotal(result.total);
          setPage(result.page);
          setPageCount(result.pageCount);
          setEditingId(null);
        })
        .catch((requestError: unknown) => {
          if (requestError instanceof Error && requestError.name === "AbortError") return;
          setError("No se pudo conectar con el servidor. Intenta nuevamente.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, query ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [inventoryFilter, page, query, reloadKey, segmentFilter]);

  function startEditing(variant: InventoryVariant) {
    setEditingId(variant.id);
    setStockOnHand(String(variant.stockOnHand));
    setStockMin(String(variant.stockMin));
    setReason("");
    setError("");
    setSuccess("");
  }

  function cancelEditing() {
    if (busy) return;
    setEditingId(null);
    setError("");
  }

  async function saveInventory(variantId: string) {
    if (!stockOnHand.trim() || !stockMin.trim()) {
      setError("Completa el stock total y el mínimo.");
      return;
    }
    const total = Number(stockOnHand);
    const minimum = Number(stockMin);
    if (!Number.isInteger(total) || total < 0 || !Number.isInteger(minimum) || minimum < 0) {
      setError("Ingresa cantidades enteras iguales o mayores a cero.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Explica el motivo del ajuste (mínimo 3 caracteres).");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin/inventory/${encodeURIComponent(variantId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockOnHand: total, stockMin: minimum, reason: reason.trim() }),
      });
      const result = await response.json() as {
        error?: string;
        variant?: { stockOnHand: number; stockReserved: number; stockMin: number };
      };
      if (!response.ok || !result.variant) {
        setError(result.error ?? "No se pudo actualizar el inventario.");
        return;
      }
      setVariants((current) => current.map((variant) =>
        variant.id === variantId ? { ...variant, ...result.variant } : variant,
      ));
      setEditingId(null);
      setSuccess("El inventario se actualizó correctamente.");
      setReloadKey((current) => current + 1);
    } catch {
      setError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="inventory-toolbar">
        <label className="inventory-search">
          <span>Buscar producto o SKU</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Nombre del producto o SKU"
            aria-label="Buscar por nombre de producto o SKU"
          />
        </label>
        <div className="inventory-filter-group" role="group" aria-label="Filtrar por segmento">
          {([
            ["ALL", "Todos"],
            ["WOMEN", "Mujer"],
            ["MEN", "Hombre"],
          ] as const).map(([id, label]) => (
            <button
              aria-pressed={segmentFilter === id}
              className={`inventory-filter-button ${segmentFilter === id ? "is-active" : ""}`}
              key={id}
              onClick={() => {
                setSegmentFilter(id);
                setPage(1);
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="inventory-filter-group inventory-status-filters" role="group" aria-label="Filtrar estado de existencias">
          {inventoryFilters.map(({ id, label }) => (
            <button
              aria-pressed={inventoryFilter === id}
              className={`inventory-filter-button ${inventoryFilter === id ? "is-active" : ""}`}
              key={id}
              onClick={() => {
                setInventoryFilter(id);
                setPage(1);
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="form-error inventory-feedback" role="alert">{error}</p>}
      {success && <p className="brand-success inventory-feedback" role="status">{success}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table inventory-table">
          <thead>
            <tr>
              <th>Producto</th><th>SKU</th><th>Variante</th><th>Stock total</th>
              <th>Reservado</th><th>Disponible</th><th>Mínimo</th><th>Estado</th>
              {canUpdate && <th className="inventory-action-heading">Acción</th>}
            </tr>
          </thead>
          <tbody>
            {variants.map((variant) => {
              const available = variant.stockOnHand - variant.stockReserved;
              const state = available <= 0 ? "Agotado" : available <= variant.stockMin ? "Stock bajo" : "Disponible";
              const isEditing = editingId === variant.id;
              return (
                <tr key={variant.id}>
                  <td>{variant.product.name}</td>
                  <td><code>{variant.sku}</code></td>
                  <td>{[variant.color, variant.size].filter(Boolean).join(" / ") || "Estándar"}</td>
                  <td>
                    {isEditing ? (
                      <input
                        aria-label={`Stock total de ${variant.product.name}, ${variant.sku}`}
                        className="inventory-edit-input"
                        min="0"
                        onChange={(event) => setStockOnHand(event.target.value)}
                        type="number"
                        value={stockOnHand}
                      />
                    ) : variant.stockOnHand}
                  </td>
                  <td>{variant.stockReserved}</td>
                  <td>{available}</td>
                  <td>
                    {isEditing ? (
                      <input
                        aria-label={`Stock mínimo de ${variant.product.name}, ${variant.sku}`}
                        className="inventory-edit-input"
                        min="0"
                        onChange={(event) => setStockMin(event.target.value)}
                        type="number"
                        value={stockMin}
                      />
                    ) : variant.stockMin}
                  </td>
                  <td><span className={`status-pill ${available <= 0 ? "status-cancelled" : available <= variant.stockMin ? "status-pending" : "status-confirmed"}`}>{state}</span></td>
                  {canUpdate && (
                    <td className="inventory-action-cell">
                      {isEditing ? (
                        <div className="inventory-edit-actions">
                          <input
                            aria-label={`Motivo del ajuste de ${variant.sku}`}
                            className="inventory-reason-input"
                            maxLength={500}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Motivo del ajuste"
                            value={reason}
                          />
                          <button className="inventory-icon-button is-save" type="button" aria-label={`Guardar inventario de ${variant.sku}`} disabled={busy} onClick={() => void saveInventory(variant.id)}>
                            <Check size={17} />
                          </button>
                          <button className="inventory-cancel-button" type="button" aria-label={`Cancelar edición de ${variant.sku}`} disabled={busy} onClick={cancelEditing}>
                            <X size={17} /><span>Cancelar</span>
                          </button>
                        </div>
                      ) : (
                        <button className="inventory-icon-button" type="button" aria-label={`Editar inventario de ${variant.sku}`} onClick={() => startEditing(variant)}>
                          <Pencil size={16} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {!variants.length && (
              <tr><td colSpan={canUpdate ? 9 : 8} className="table-empty">{loading ? "Cargando inventario..." : "No hay variantes que coincidan con la búsqueda y los filtros."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="inventory-pagination">
        <p className="inventory-result-count">
          {loading
            ? "Cargando inventario..."
            : `Mostrando ${total === 0 ? 0 : (page - 1) * INVENTORY_PAGE_SIZE + 1}–${Math.min(page * INVENTORY_PAGE_SIZE, total)} de ${total} variantes.`}
        </p>
        <nav aria-label="Paginación de inventario" className="inventory-page-controls">
          <button type="button" className="inventory-filter-button" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
          <span>Página {page} de {pageCount}</span>
          <button type="button" className="inventory-filter-button" disabled={loading || page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Siguiente</button>
        </nav>
      </div>
    </>
  );
}
