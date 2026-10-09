import { OrderStatus, Permission, type Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatCOP } from "@/lib/catalog";
import { AdminQrPaymentConfirmButton } from "@/components/admin-qr-payment-confirm-button";
import Link from "next/link";

const PAGE_SIZE = 10;

const orderStatusLabels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  PAID: "Pagado",
  CONFIRMED: "Confirmado",
  PREPARING: "En preparación",
  SHIPPED: "Enviado",
  IN_TRANSIT: "En tránsito",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

const paymentStatusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  PROCESSING: "En proceso",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  EXPIRED: "Vencido",
  CANCELLED: "Cancelado",
  REVERSED: "Reversado",
  REFUNDED: "Reembolsado",
};

function guestName(address: Prisma.JsonValue | null | undefined) {
  if (!address || typeof address !== "object" || Array.isArray(address)) return null;
  return typeof address.name === "string" ? address.name : null;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const session = await getSession();
  if (!session || !(await hasPermission(session.role, Permission.ORDER_READ))) redirect("/admin/login");
  const params = await searchParams;
  const rawQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const query = (rawQuery ?? "").trim().slice(0, 100);
  const requestedPage = /^\d+$/.test(rawPage ?? "") ? Number(rawPage) : 1;
  const where: Prisma.OrderWhereInput = query
    ? {
        OR: [
          { orderNumber: { contains: query, mode: "insensitive" } },
          { guestEmail: { contains: query, mode: "insensitive" } },
          {
            customer: {
              is: {
                OR: [
                  { name: { contains: query, mode: "insensitive" } },
                  { email: { contains: query, mode: "insensitive" } },
                  { phone: { contains: query, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      }
    : {};
  const [total, canConfirmPayments] = await Promise.all([
    prisma.order.count({ where }),
    hasPermission(session.role, Permission.PAYMENT_CONFIRM),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(requestedPage, 1), pageCount);
  const orders = await prisma.order.findMany({
    where,
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      customer: { select: { name: true, email: true } },
      shipping: { select: { address: true } },
      payments: { select: { status: true, method: { select: { code: true } } } },
    },
  });
  const start = total ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(currentPage * PAGE_SIZE, total);
  const pageHref = (page: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    search.set("page", String(page));
    return `/admin/pedidos?${search.toString()}`;
  };
  return (
    <main className="admin-content">
      <div className="admin-page-heading"><div><span className="eyebrow">GESTIÓN COMERCIAL</span><h1>Pedidos</h1><p>Consulta estados y pagos. Verifica en el banco los abonos por QR antes de confirmarlos.</p></div></div>
      <section className="admin-section-card"><div className="admin-section-heading"><div><span className="eyebrow">ORDENES RECIENTES</span><h2>Todos los pedidos</h2></div><span>{total} {total === 1 ? "pedido" : "pedidos"}</span></div>
        <form className="inventory-toolbar" action="/admin/pedidos" method="get">
          <label className="inventory-search">Buscar pedido, cliente o correo
            <input type="search" name="q" defaultValue={query} maxLength={100} placeholder="Ej.: ATG-20261009 o nombre@correo.com" />
          </label>
          <button type="submit" className="inventory-filter-button is-active">Buscar</button>
          {query && <Link className="inventory-filter-button" href="/admin/pedidos">Limpiar</Link>}
        </form>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Estado del pedido</th><th>Pago</th><th>Total</th>{canConfirmPayments && <th>Acción</th>}</tr></thead><tbody>
          {orders.map((order) => {
            const pendingQrPayment = order.payments.some((payment) => payment.status === "PENDING" && payment.method?.code === "QR_MANUAL");
            return (
              <tr key={order.id}>
                <td><strong>{order.orderNumber}</strong></td>
                <td>{order.customer?.name ?? guestName(order.shipping?.address) ?? order.guestEmail ?? "Compra invitado"}</td>
                <td>{order.createdAt.toLocaleDateString("es-CO")}</td>
                <td><span className={`status-pill status-${order.status.toLowerCase()}`}>{orderStatusLabels[order.status]}</span></td>
                <td>{order.payments.length ? order.payments.map((payment) => paymentStatusLabels[payment.status] ?? "Desconocido").join(", ") : "Sin pago"}</td>
                <td>{formatCOP(order.total)}</td>
                {canConfirmPayments && <td>{pendingQrPayment && order.status === "PENDING_PAYMENT" ? <AdminQrPaymentConfirmButton orderId={order.id} /> : "—"}</td>}
              </tr>
            );
          })}
          {!orders.length && <tr><td colSpan={canConfirmPayments ? 7 : 6} className="table-empty">{query ? "No hay pedidos que coincidan con la búsqueda." : "Todavía no hay pedidos registrados."}</td></tr>}
        </tbody></table></div>
        <div className="inventory-pagination">
          <p className="inventory-result-count">Mostrando {start}–{end} de {total} pedidos</p>
          <nav className="inventory-page-controls" aria-label="Paginación de pedidos">
            {currentPage > 1 ? <Link className="inventory-filter-button" href={pageHref(currentPage - 1)}>Anterior</Link> : <span className="inventory-filter-button" aria-disabled="true">Anterior</span>}
            <span>Página {currentPage} de {pageCount}</span>
            {currentPage < pageCount ? <Link className="inventory-filter-button" href={pageHref(currentPage + 1)}>Siguiente</Link> : <span className="inventory-filter-button" aria-disabled="true">Siguiente</span>}
          </nav>
        </div>
      </section>
    </main>
  );
}
