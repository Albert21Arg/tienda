"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Box, ClipboardList, Settings, UserRound } from "lucide-react";
import { AUDIT_PAGE_SIZE, type AuditCategory, type AuditEvent, type AuditPage } from "@/lib/admin-audit.types";

const categories: { id: AuditCategory; label: string }[] = [
  { id: "ALL", label: "Todos" },
  { id: "INVENTORY", label: "Inventario" },
  { id: "PRODUCT", label: "Productos" },
  { id: "SALES", label: "Ventas y pedidos" },
  { id: "USERS", label: "Usuarios" },
  { id: "SETTINGS", label: "Configuración" },
];

function parseValue(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

const fieldLabels: Record<string, string> = {
  name: "Nombre",
  description: "Descripción",
  segment: "Colección",
  basePrice: "Precio",
  costPrice: "Valor de creación",
  markupPercent: "Margen aplicado",
  previousPrice: "Precio anterior",
  discountType: "Tipo de descuento",
  discountValue: "Descuento aplicado",
  images: "Imágenes",
  image: "Imagen",
  imageUrl: "Imagen",
  stockOnHand: "Existencias totales",
  stockMin: "Aviso de stock bajo",
  stock: "Existencias",
  fee: "Tarifa de envío",
  quantity: "Unidades del movimiento",
  sku: "SKU",
  status: "Estado del pedido",
  role: "Tipo de acceso",
  email: "Correo",
  isActive: "Estado",
  isDeleted: "Eliminado",
};

const orderStatuses: Record<string, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  PAID: "Pagado",
  CONFIRMED: "Confirmado",
  PREPARING: "En preparación",
  SHIPPED: "Enviado",
  IN_TRANSIT: "En tránsito",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

function labelFor(key: string) {
  return fieldLabels[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function formatAuditValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "Sin especificar";
  if (key === "slug" || key === "categoryId") return "Dato actualizado";
  if (key === "description") return "Descripción actualizada";
  if (key === "segment") return value === "MEN" ? "Hombre" : value === "WOMEN" ? "Mujer" : String(value);
  if (key === "status" && typeof value === "string") return orderStatuses[value] ?? value.replaceAll("_", " ");
  if (key === "role" && typeof value === "string") return value === "OPERATOR" ? "Operario" : value.replaceAll("_", " ");
  if (key === "discountType" && typeof value === "string") return value === "PERCENTAGE" ? "Porcentaje" : "Valor fijo";
  if (key === "isActive" && typeof value === "boolean") return value ? "Activo" : "Inactivo";
  if (key.toLowerCase().includes("price") && typeof value === "number") {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
  }
  if (key.toLowerCase().includes("image") || key.toLowerCase().includes("logo")) {
    return Array.isArray(value) ? `${value.length} imágenes` : "Imagen actualizada";
  }
  if (Array.isArray(value)) return `${value.length} elementos`;
  if (typeof value === "object") return "Información actualizada";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return String(value);
}

function getChanges(event: AuditEvent) {
  const previous = parseValue(event.previousValue);
  const next = parseValue(event.newValue);
  if (!next) return [];
  return Object.entries(next)
    .filter(([key, value]) => !["reason", "slug", "categoryId"].includes(key) && JSON.stringify(previous?.[key]) !== JSON.stringify(value))
    .map(([key, value]) => ({
      label: labelFor(key),
      before: previous && key in previous ? formatAuditValue(key, previous[key]) : null,
      after: formatAuditValue(key, value),
    }));
}

function formatAction(action: string) {
  const labels: Record<string, string> = {
    PRODUCT_CREATE: "Producto creado",
    PRODUCT_MARKUP_DEFAULT_UPDATE: "Margen predeterminado actualizado",
    PRODUCT_UPDATE: "Producto actualizado",
    PRODUCT_DEACTIVATE: "Producto desactivado",
    PRODUCT_DISCOUNT: "Descuento de producto",
    PRODUCT_DELETE: "Producto eliminado",
    INVENTORY_ADJUST: "Ajuste de inventario",
    ORDER_STATUS_UPDATE: "Cambio de estado de pedido",
    PAYMENT_QR_CONFIRM: "Pago QR verificado",
    SHIPPING_FEE_UPDATE: "Tarifa de envío actualizada",
    USER_OPERATOR_CREATE: "Operario creado",
    CATEGORY_CREATE: "Categoría creada",
    SITE_BRAND_UPDATE: "Datos de la tienda actualizados",
    HOME_IMAGES_UPDATE: "Imágenes de portada actualizadas",
    EDITORIAL_BANNERS_UPDATE: "Banners de colección actualizados",
    ADJUSTMENT: "Ajuste de existencias",
    RESERVATION: "Reserva de existencias",
    RESERVATION_RELEASE: "Liberación de reserva",
    SALE: "Venta",
    RETURN: "Devolución",
  };
  return labels[action] ?? action.replaceAll("_", " ").toLocaleLowerCase("es-CO");
}

function formatSubject(entity: string) {
  const labels: Record<string, string> = {
    Product: "Producto",
    ProductVariant: "Variante de inventario",
    Order: "Pedido",
    User: "Cuenta de usuario",
    Category: "Categoría",
    PlatformSetting: "Configuración",
    Inventario: "Variante de inventario",
  };
  return labels[entity] ?? "Actividad";
}

function getEventKind(event: AuditEvent) {
  if (event.entity === "ProductVariant" || event.entity === "Inventario") return "inventory";
  if (event.entity === "Product" || event.entity === "Category") return "catalog";
  if (event.entity === "Order") return "sales";
  if (event.entity === "User") return "users";
  return "settings";
}

function EventIcon({ kind }: { kind: string }) {
  if (kind === "inventory") return <ArrowLeftRight aria-hidden="true" size={18} />;
  if (kind === "catalog") return <Box aria-hidden="true" size={18} />;
  if (kind === "sales") return <ClipboardList aria-hidden="true" size={18} />;
  if (kind === "users") return <UserRound aria-hidden="true" size={18} />;
  return <Settings aria-hidden="true" size={18} />;
}

export function AdminAuditManager({ initialPage }: { initialPage: AuditPage }) {
  const [events, setEvents] = useState<AuditEvent[]>(initialPage.events);
  const [total, setTotal] = useState(initialPage.total);
  const [page, setPage] = useState(initialPage.page);
  const [pageCount, setPageCount] = useState(initialPage.pageCount);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AuditCategory>("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const initialRequest = useRef(true);

  useEffect(() => {
    if (initialRequest.current) {
      initialRequest.current = false;
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), query, category });
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void fetch(`/api/admin/audit?${params}`, { signal: controller.signal })
        .then(async (response) => {
          const result = await response.json() as AuditPage & { error?: string };
          if (!response.ok || !Array.isArray(result.events) || result.total === undefined) {
            setError(result.error ?? "No se pudo cargar la trazabilidad.");
            return;
          }
          setEvents(result.events);
          setTotal(result.total);
          setPage(result.page);
          setPageCount(result.pageCount);
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
  }, [category, page, query]);

  return (
    <>
      <div className="audit-toolbar">
        <label className="inventory-search">
          <span>Buscar por persona, producto, SKU o pedido</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Ej.: Ana, vestido, SKU..."
          />
        </label>
        <div className="audit-category-filters" role="group" aria-label="Filtrar trazas por sección">
          {categories.map(({ id, label }) => (
            <button
              aria-pressed={category === id}
              className={`inventory-filter-button ${category === id ? "is-active" : ""}`}
              key={id}
              onClick={() => {
                setCategory(id);
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
      <div className="audit-event-list" aria-live="polite">
        {events.map((event, index) => {
          const changes = getChanges(event);
          const kind = getEventKind(event);
          return (
            <article className={`audit-event-card audit-kind-${kind}`} key={event.id}>
              <div className="audit-event-topline">
                <span className="audit-event-number">Movimiento #{(page - 1) * AUDIT_PAGE_SIZE + index + 1}</span>
                <time dateTime={new Date(event.createdAt).toISOString()}>{new Date(event.createdAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</time>
              </div>
              <div className="audit-event-heading">
                <span className="audit-event-icon"><EventIcon kind={kind} /></span>
                <div className="audit-event-title">
                  <span className="audit-event-category">{formatSubject(event.entity)}</span>
                  <h3>{formatAction(event.action)}</h3>
                  <p>{event.subjectName}</p>
                  {event.reference && <span className="audit-event-reference">{event.entity === "Order" ? "Pedido" : event.entity === "ProductVariant" || event.entity === "Inventario" ? "SKU" : "Referencia"}: {event.reference}</span>}
                </div>
              </div>
              <div className="audit-event-meta">
                <span><strong>Realizado por</strong>{event.actorName}{event.actorEmail && <small>{event.actorEmail}</small>}</span>
                {event.reason && <span><strong>Motivo</strong>{event.reason}</span>}
              </div>
              {changes.length > 0 && (
                <div className="audit-change-list">
                  <strong className="audit-change-heading">Qué cambió</strong>
                  {changes.map(({ label, before, after }) => (
                    <div className="audit-change-row" key={label}>
                      <span>{label}</span>
                      <p>{before ? <><del>{before}</del><span aria-hidden="true"> → </span></> : null}<strong>{after}</strong></p>
                    </div>
                  ))}
                </div>
              )}
              {changes.length === 0 && <p className="audit-event-no-details">La acción quedó registrada.</p>}
            </article>
          );
        })}
        {!events.length && <p className="audit-empty-state">{loading ? "Cargando actividad..." : "No hay actividad para los filtros seleccionados."}</p>}
      </div>
      <div className="inventory-pagination">
        <p className="inventory-result-count">
          {loading ? "Cargando trazabilidad..." : `Mostrando ${total === 0 ? 0 : (page - 1) * AUDIT_PAGE_SIZE + 1}–${Math.min(page * AUDIT_PAGE_SIZE, total)} de ${total} eventos.`}
        </p>
        <nav aria-label="Paginación de trazabilidad" className="inventory-page-controls">
          <button type="button" className="inventory-filter-button" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
          <span>Página {page} de {pageCount}</span>
          <button type="button" className="inventory-filter-button" disabled={loading || page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Siguiente</button>
        </nav>
      </div>
    </>
  );
}
