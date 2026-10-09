import { OrderStatus } from "@prisma/client";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatCOP } from "@/lib/catalog";

export default async function AdminAnalyticsPage() {
  await connection();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [orders, sales, customers, bySegment] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: start } } }),
    prisma.order.aggregate({ where: { createdAt: { gte: start }, status: { not: OrderStatus.CANCELLED } }, _sum: { total: true }, _avg: { total: true } }),
    prisma.customer.count({ where: { createdAt: { gte: start } } }),
    prisma.orderItem.groupBy({ by: ["productId"], where: { order: { createdAt: { gte: start }, status: { not: OrderStatus.CANCELLED } } }, _sum: { quantity: true } }),
  ]);
  const productIds = bySegment.map((item) => item.productId);
  const soldProducts = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, segment: true } }) : [];
  const products = bySegment.map((item) => ({ ...item, product: soldProducts.find((product) => product.id === item.productId) })).filter((item) => item.product);
  const men = products.filter((item) => item.product?.segment === "MEN").reduce((sum, item) => sum + (item._sum.quantity ?? 0), 0);
  const women = products.filter((item) => item.product?.segment === "WOMEN").reduce((sum, item) => sum + (item._sum.quantity ?? 0), 0);
  const totalUnits = men + women;
  return (
    <main className="admin-content">
      <div className="admin-page-heading"><div><span className="eyebrow">DATOS DEL MES</span><h1>Analítica</h1><p>Indicadores de negocio calculados sobre pedidos registrados.</p></div></div>
      <section className="admin-metrics">
        <article className="admin-metric"><div className="metric-top"><span>Ventas del mes</span></div><strong>{formatCOP(sales._sum.total ?? 0)}</strong><div className="metric-bottom"><span>Pedidos no cancelados</span></div></article>
        <article className="admin-metric"><div className="metric-top"><span>Pedidos</span></div><strong>{orders}</strong><div className="metric-bottom"><span>Desde el inicio del mes</span></div></article>
        <article className="admin-metric"><div className="metric-top"><span>Ticket promedio</span></div><strong>{formatCOP(Math.round(sales._avg.total ?? 0))}</strong><div className="metric-bottom"><span>Promedio bruto</span></div></article>
        <article className="admin-metric"><div className="metric-top"><span>Clientes nuevos</span></div><strong>{customers}</strong><div className="metric-bottom"><span>Registrados este mes</span></div></article>
      </section>
      <section className="admin-section-card">
        <div className="admin-section-heading"><div><span className="eyebrow">UNIDADES EN PEDIDOS</span><h2>Hombre vs. Mujer</h2></div></div>
        <div className="segment-analytics">
          <div><span>Hombre</span><strong>{totalUnits ? Math.round(men / totalUnits * 100) : 0}%</strong><div className="analytics-track"><span style={{ width: `${totalUnits ? men / totalUnits * 100 : 0}%` }} /></div><small>{men} unidades</small></div>
          <div><span>Mujer</span><strong>{totalUnits ? Math.round(women / totalUnits * 100) : 0}%</strong><div className="analytics-track women"><span style={{ width: `${totalUnits ? women / totalUnits * 100 : 0}%` }} /></div><small>{women} unidades</small></div>
        </div>
        {!totalUnits && <p className="table-empty">Los gráficos aparecerán cuando se registren ventas.</p>}
      </section>
    </main>
  );
}
