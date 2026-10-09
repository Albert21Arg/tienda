import { Permission } from "@prisma/client";
import { redirect } from "next/navigation";
import { AdminAuditManager } from "@/components/admin-audit-manager";
import { getSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getAdminAuditPage } from "@/lib/admin-audit.server";

export default async function AdminAuditPage() {
  const session = await getSession();
  if (!session || !(await hasPermission(session.role, Permission.AUDIT_READ))) redirect("/admin/pedidos");
  const initialPage = await getAdminAuditPage({ page: 1, query: "", category: "ALL" });
  return (
    <main className="admin-content">
      <div className="admin-page-heading"><div><span className="eyebrow">HISTORIAL DEL EQUIPO</span><h1>Trazabilidad</h1><p>Revisa qué cambió, quién lo hizo, cuándo y el motivo. Los detalles se muestran en palabras sencillas.</p></div></div>
      <section className="admin-section-card">
        <div className="admin-section-heading"><div><span className="eyebrow">REGISTRO DE ACTIVIDAD</span><h2>Movimientos y cambios</h2></div><span>{initialPage.total} eventos</span></div>
        <AdminAuditManager initialPage={initialPage} />
      </section>
    </main>
  );
}
