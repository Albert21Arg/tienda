import { Permission, RoleName } from "@prisma/client";
import { redirect } from "next/navigation";
import { AdminUsersManager } from "@/components/admin-users-manager";
import { getSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session || !(await hasPermission(session.role, Permission.USER_MANAGE))) redirect("/admin/pedidos");
  const operatorRole = await prisma.role.findUnique({ where: { name: RoleName.OPERATOR } });
  const users = operatorRole
    ? await prisma.user.findMany({
        where: { roleId: operatorRole.id },
        select: { id: true, name: true, email: true, isActive: true, createdAt: true },
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      })
    : [];
  return (
    <main className="admin-content">
      <div className="admin-page-heading"><div><span className="eyebrow">ACCESOS DEL EQUIPO</span><h1>Operarios</h1><p>Crea y consulta cuentas con acceso operativo al panel.</p></div></div>
      <AdminUsersManager initialUsers={users.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
      }))} />
    </main>
  );
}
