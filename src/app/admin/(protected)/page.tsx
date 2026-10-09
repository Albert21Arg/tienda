import { ArrowDownRight, ArrowRight, ArrowUpRight, AlertTriangle, CircleDollarSign, Package, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { OrderStatus, Permission } from "@prisma/client";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatCOP } from "@/lib/catalog";
import { BrandName } from "@/components/brand-mark";

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

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session || !(await hasPermission(session.role, Permission.ANALYTICS_READ))) redirect("/admin/pedidos");
  const today = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [products, ordersToday, sales, recentOrders, variants] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.order.aggregate({
      where: {
        createdAt: { gte: startOfDay },
        status: { not: OrderStatus.CANCELLED },
      },
      _sum: { total: true },
    }),
    prisma.order.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { id: true, orderNumber: true, status: true, total: true, createdAt: true, guestEmail: true, customer: { select: { name: true } } },
    }),
    prisma.productVariant.findMany({
      where: { isActive: true },
      select: { stockOnHand: true, stockReserved: true, stockMin: true },
    }),
  ]);
  const lowStock = variants.filter((variant) => {
    const available = variant.stockOnHand - variant.stockReserved;
    return available > 0 && available <= variant.stockMin;
  }).length;
  const soldOut = variants.filter((variant) => variant.stockOnHand - variant.stockReserved <= 0).length;
  const metrics = [
    { label: "Ventas de hoy", value: formatCOP(sales._sum.total ?? 0), detail: "Pedidos no cancelados", icon: CircleDollarSign, trend: "Ingresos confirmados" },
    { label: "Pedidos", value: String(ordersToday), detail: "Recibidos hoy", icon: ShoppingCart, trend: "Todos los estados" },
    { label: "Productos activos", value: String(products), detail: "En el catálogo", icon: Package, trend: "Mujer + Hombre" },
    { label: "Alertas de stock", value: String(lowStock + soldOut), detail: `${lowStock} bajo · ${soldOut} agotados`, icon: AlertTriangle, trend: "Requieren atención" },
  ];

  return (
    <main className="admin-content">
      <div className="admin-page-heading">
        <div><span className="eyebrow">{today.toUpperCase()} · RESUMEN DEL DÍA</span><h1>Buenos días.</h1><p>Esto es lo que sucede hoy en <BrandName />.</p></div>
        <Link href="/admin/productos" className="button button-dark">Ver catálogo <ArrowRight size={15} /></Link>
      </div>
      <section className="admin-metrics">
        {metrics.map(({ label, value, detail, icon: Icon, trend }, index) => (
          <article className="admin-metric" key={label}>
            <div className="metric-top"><span>{label}</span><Icon size={18} strokeWidth={1.5} /></div>
            <strong>{value}</strong>
            <div className="metric-bottom"><span>{detail}</span><span className={index === 3 && lowStock + soldOut ? "metric-warning" : ""}>{index === 3 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}{trend}</span></div>
          </article>
        ))}
      </section>
      <section className="admin-section-card">
        <div className="admin-section-heading"><div><span className="eyebrow">ACTIVIDAD RECIENTE</span><h2>Últimos pedidos</h2></div><Link href="/admin/pedidos" className="text-link">Ver todos <ArrowRight size={14} /></Link></div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th>Total</th></tr></thead>
            <tbody>{recentOrders.map((order) => (
              <tr key={order.id}>
                <td><strong>{order.orderNumber}</strong></td>
                <td>{order.customer?.name ?? order.guestEmail ?? "Compra invitado"}</td>
                <td>{order.createdAt.toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}</td>
                <td><span className={`status-pill status-${order.status.toLowerCase()}`}>{orderStatusLabels[order.status]}</span></td>
                <td>{formatCOP(order.total)}</td>
              </tr>
            ))}{recentOrders.length === 0 && <tr><td colSpan={5} className="table-empty">Todavía no hay pedidos. Cuando llegue el primero, lo verás aquí.</td></tr>}</tbody>
          </table>
        </div>
      </section>
      <section className="admin-tip"><AlertTriangle size={17} /><p><strong>Una nota importante</strong> · Los pagos están listos para conectarse a tu proveedor. Hasta que configures sus credenciales, el checkout permanece desactivado para evitar cobros no procesados.</p></section>
    </main>
  );
}
