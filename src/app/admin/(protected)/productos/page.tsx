import { Permission } from "@prisma/client";
import { redirect } from "next/navigation";
import { AdminProductForm } from "@/components/admin-product-form";
import { AdminProductsManager } from "@/components/admin-products-manager";
import { getSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { BrandName } from "@/components/brand-mark";
import { parseProductImages } from "@/lib/product-images";
import { getDefaultMarkupPercent } from "@/lib/pricing-settings.server";

export default async function AdminProductsPage() {
  const session = await getSession();
  if (!session || !(await hasPermission(session.role, Permission.PRODUCT_READ))) redirect("/admin/pedidos");
  const canCreate = await hasPermission(session.role, Permission.PRODUCT_CREATE);
  const canUpdate = await hasPermission(session.role, Permission.PRODUCT_UPDATE);
  const canDelete = session.role === "SUPER_ADMIN" && await hasPermission(session.role, Permission.PRODUCT_DELETE);
  const [products, categories, defaultMarkupPercent] = await Promise.all([
    prisma.product.findMany({
      include: { category: true, variants: { where: { isActive: true } } },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: [{ segment: "asc" }, { name: "asc" }] }),
    getDefaultMarkupPercent(),
  ]);
  return (
    <main className="admin-content">
      <div className="admin-page-heading"><div><span className="eyebrow">CATÁLOGO <BrandName /></span><h1>Productos</h1><p>Administra las piezas y variantes disponibles en la tienda.</p></div></div>
      {canCreate && <AdminProductForm defaultMarkupPercent={defaultMarkupPercent} categories={categories.map((category) => ({ id: category.id, name: category.name, segment: category.segment }))} />}
      <AdminProductsManager
        canDelete={canDelete}
        canUpdate={canUpdate}
        categories={categories.map(({ id, name, segment }) => ({ id, name, segment }))}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          image: parseProductImages(product.images)[0] ?? "",
          segment: product.segment,
          categoryId: product.categoryId,
          categoryName: product.category.name,
          variantCount: product.variants.length,
          availableStock: product.variants.reduce((sum, variant) => sum + variant.stockOnHand - variant.stockReserved, 0),
          price: product.basePrice,
          costPrice: product.costPrice,
          markupPercent: product.markupPercent,
          previousPrice: product.previousPrice,
          active: product.isActive,
        }))}
      />
    </main>
  );
}
