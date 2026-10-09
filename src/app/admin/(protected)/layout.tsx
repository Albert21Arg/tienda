import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BarChart3, Boxes, ClipboardList, FileClock, LayoutDashboard, LogOut, Settings, ShoppingBag, Users } from "lucide-react";
import { getSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { Permission } from "@prisma/client";
import { AdminLogout } from "@/components/admin-logout";
import { BrandMark, BrandName } from "@/components/brand-mark";

const navigation = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard, permission: Permission.ANALYTICS_READ },
  { href: "/admin/productos", label: "Productos", icon: Boxes, permission: Permission.PRODUCT_READ },
  { href: "/admin/pedidos", label: "Pedidos", icon: ClipboardList, permission: Permission.ORDER_READ },
  { href: "/admin/inventario", label: "Inventario", icon: ShoppingBag, permission: Permission.INVENTORY_READ },
  { href: "/admin/analitica", label: "Analítica", icon: BarChart3, permission: Permission.ANALYTICS_READ },
  { href: "/admin/usuarios", label: "Operarios", icon: Users, permission: Permission.USER_MANAGE },
  { href: "/admin/trazabilidad", label: "Trazabilidad", icon: FileClock, permission: Permission.AUDIT_READ },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings, permission: Permission.HOME_CONTENT_MANAGE },
];

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const session = await getSession();
  if (!session) redirect("/admin/login");
  const visibleNavigation = await Promise.all(
    navigation.map(async (item) => ({
      item,
      allowed: await hasPermission(session.role, item.permission),
    })),
  );
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <BrandMark admin />
        <div className="admin-profile"><span className="admin-avatar">{session.name.slice(0, 1).toUpperCase()}</span><div><strong>{session.name}</strong><small>{session.role.replace("_", " ")}</small></div></div>
        <nav className="admin-nav">
          {visibleNavigation.filter(({ allowed }) => allowed).map(({ item: { href, label, icon: Icon } }) => (
            <Link href={href} key={href}><Icon size={17} /><span>{label}</span></Link>
          ))}
        </nav>
        <div className="admin-sidebar-bottom"><AdminLogout /><Link href="/"><LogOut size={16} /> Ir a la tienda</Link></div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar"><span><BrandName /> / <strong>Panel de control</strong></span><span>COL · COP $</span></header>
        {children}
      </div>
    </div>
  );
}
