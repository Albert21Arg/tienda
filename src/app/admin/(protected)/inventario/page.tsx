import { Permission } from "@prisma/client";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { AdminInventoryManager } from "@/components/admin-inventory-manager";
import { getAdminInventoryPage } from "@/lib/admin-inventory.server";

export default async function AdminInventoryPage() {
  const session = await getSession();
  if (!session || !(await hasPermission(session.role, Permission.INVENTORY_READ))) redirect("/admin/pedidos");
  const canUpdate = await hasPermission(session.role, Permission.INVENTORY_UPDATE);
  const inventory = await getAdminInventoryPage({
    page: 1,
    query: "",
    segment: "ALL",
    status: "ALL",
  });
  return (
    <main className="admin-content">
      <div className="admin-page-heading"><div><span className="eyebrow">CONTROL DE EXISTENCIAS</span><h1>Inventario</h1><p>El stock disponible se calcula como total menos reservas activas.</p></div></div>
      <section className="admin-section-card">
        <div className="admin-section-heading"><div><span className="eyebrow">VARIANTES</span><h2>Existencias por SKU</h2></div><span>{inventory.total} variantes</span></div>
        <AdminInventoryManager canUpdate={canUpdate} initialPage={inventory} />
      </section>
    </main>
  );
}
