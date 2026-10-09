import { Permission } from "@prisma/client";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getSiteBrand } from "@/lib/site-brand";
import { AdminBrandForm } from "@/components/admin-brand-form";
import { getHomeImages } from "@/lib/home-images.server";
import { AdminHomeImagesForm } from "@/components/admin-home-images-form";
import { AdminCategoryForm } from "@/components/admin-category-form";
import { AdminSettingsAccordion } from "@/components/admin-settings-accordion";
import { prisma } from "@/lib/prisma";
import { getEditorialBanners } from "@/lib/editorial-banners.server";
import { AdminEditorialBannersForm } from "@/components/admin-editorial-banners-form";
import { AdminPaymentSettingsForm } from "@/components/admin-payment-settings-form";
import { getPaymentSettings, getWompiSetupStatus } from "@/lib/payment-settings.server";
import { AdminShippingFeeForm } from "@/components/admin-shipping-fee-form";
import { getShippingFee } from "@/lib/shipping-settings.server";

export default async function AdminSettingsPage() {
  const session = await getSession();
  if (!session || !(await hasPermission(session.role, Permission.HOME_CONTENT_MANAGE))) redirect("/admin/pedidos");
  const isSuperAdmin = session.role === "SUPER_ADMIN";
  const [brand, homeImages, categories, editorialBanners, paymentSettings, shippingFee] = await Promise.all([
    isSuperAdmin ? getSiteBrand() : Promise.resolve(null),
    getHomeImages(),
    isSuperAdmin
      ? prisma.category.findMany({
          where: { isActive: true, parentId: null },
          select: { id: true, name: true, segment: true },
          orderBy: [{ segment: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
    getEditorialBanners(),
    isSuperAdmin ? getPaymentSettings() : Promise.resolve(null),
    getShippingFee(),
  ]);
  const sections = [
    {
      id: "home-images",
      eyebrow: "CONTENIDO DE PORTADA",
      title: "Imágenes de las colecciones",
      description: "Administra las imágenes principales que aparecen al entrar a la tienda.",
      content: <AdminHomeImagesForm initialImages={homeImages} />,
    },
    {
      id: "editorial-banners",
      eyebrow: "BANNERS EDITORIALES",
      title: "Mensajes de cada colección",
      description: "Personaliza por separado el banner que aparece debajo de las piezas de Mujer y Hombre.",
      content: <AdminEditorialBannersForm initialBanners={editorialBanners} />,
    },
    {
      id: "shipping-fee",
      eyebrow: "ENVÍOS · TARIFA",
      title: "Configura el valor del envío",
      description: "Define la tarifa que se cobra en pedidos menores a $250.000; desde ese monto el envío es gratis.",
      content: <AdminShippingFeeForm initialFee={shippingFee} />,
    },
    ...(isSuperAdmin && brand && paymentSettings
      ? [
          {
            id: "store-identity",
            eyebrow: "IDENTIDAD DE LA TIENDA",
            title: "La identidad y los mensajes de tu tienda",
            description: "Actualiza la marca, el aviso superior, los datos de contacto y la información pública de envíos y cambios.",
            content: <AdminBrandForm initialBrand={brand} />,
          },
          {
            id: "categories",
            eyebrow: "CATÁLOGO",
            title: "Categorías para cada colección",
            description: "Crea categorías para Mujer u Hombre. Aparecerán como filtros en la página pública del segmento seleccionado.",
            content: (
              <AdminCategoryForm initialCategories={categories.flatMap((category) =>
                category.segment ? [{ id: category.id, name: category.name, segment: category.segment }] : [],
              )} />
            ),
          },
          {
            id: "payments",
            eyebrow: "PAGOS · WOMPI Y QR",
            title: "Configura pagos PSE y QR",
            description: "Prepara Wompi para PSE y administra el QR fijo que se presentará a los clientes.",
            content: <AdminPaymentSettingsForm initialSettings={paymentSettings} wompiSetupStatus={getWompiSetupStatus()} />,
          },
        ]
      : []),
  ];

  return (
    <main className="admin-content">
      <div className="admin-page-heading"><div><span className="eyebrow">PLATAFORMA</span><h1>Configuración</h1><p>Preferencias y conectores del comercio.</p></div></div>
      <AdminSettingsAccordion sections={sections} />
    </main>
  );
}
