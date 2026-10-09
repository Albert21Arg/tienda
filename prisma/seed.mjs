import "dotenv/config";
import bcrypt from "bcryptjs";
import { Permission, PrismaClient, RoleName, Segment } from "@prisma/client";

const prisma = new PrismaClient();

const adminPermissions = Object.values(Permission).filter(
  (permission) => permission !== Permission.PLATFORM_CONFIGURE,
);
const superAdminPermissions = Object.values(Permission);
const operatorPermissions = [
  Permission.ORDER_READ,
  Permission.PAYMENT_CONFIRM,
  Permission.PAYMENT_REVERSE,
];

const categorySeeds = [
  { name: "Ropa", slug: "hombre-ropa", segment: Segment.MEN },
  { name: "Zapatos", slug: "hombre-zapatos", segment: Segment.MEN },
  { name: "Relojes", slug: "hombre-relojes", segment: Segment.MEN },
  { name: "Accesorios", slug: "hombre-accesorios", segment: Segment.MEN },
  { name: "Belleza", slug: "mujer-belleza", segment: Segment.WOMEN },
  { name: "Accesorios", slug: "mujer-accesorios", segment: Segment.WOMEN },
  { name: "Ropa", slug: "mujer-ropa", segment: Segment.WOMEN },
  { name: "Zapatos", slug: "mujer-zapatos", segment: Segment.WOMEN },
];

const productSeeds = [
  { name: "Chaqueta urbana", slug: "chaqueta-urbana", segment: Segment.MEN, category: "hombre-ropa", basePrice: 289900, previousPrice: 359900, image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=1000&q=85", sku: "ATL-M-CHAQ-01", sizes: ["S", "M", "L", "XL"] },
  { name: "Reloj automático", slug: "reloj-automatico", segment: Segment.MEN, category: "hombre-relojes", basePrice: 429900, image: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=1000&q=85", sku: "ATL-M-REL-01", sizes: [null] },
  { name: "Tenis minimal", slug: "tenis-minimal", segment: Segment.MEN, category: "hombre-zapatos", basePrice: 319900, image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1000&q=85", sku: "ATL-M-TEN-01", sizes: ["39", "40", "41", "42", "43"] },
  { name: "Camisa Oxford", slug: "camisa-oxford", segment: Segment.MEN, category: "hombre-ropa", basePrice: 189900, image: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=1000&q=85", sku: "ATL-M-CAM-01", sizes: ["S", "M", "L", "XL"] },
  { name: "Bolso Atelier", slug: "bolso-atelier", segment: Segment.WOMEN, category: "mujer-accesorios", basePrice: 349900, previousPrice: 419900, image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1000&q=85", sku: "ATL-W-BOL-01", sizes: [null] },
  { name: "Sérum luminosidad", slug: "serum-luminosidad", segment: Segment.WOMEN, category: "mujer-belleza", basePrice: 129900, image: "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=1000&q=85", sku: "ATL-W-SER-01", sizes: [null] },
  { name: "Vestido Siena", slug: "vestido-siena", segment: Segment.WOMEN, category: "mujer-ropa", basePrice: 279900, image: "https://images.unsplash.com/photo-1566206091558-7f218b696731?auto=format&fit=crop&w=1000&q=85", sku: "ATL-W-VES-01", sizes: ["XS", "S", "M", "L"] },
  { name: "Aretes Órbita", slug: "aretes-orbita", segment: Segment.WOMEN, category: "mujer-accesorios", basePrice: 99900, image: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=1000&q=85", sku: "ATL-W-ARE-01", sizes: [null] },
];

async function main() {
  for (const roleName of Object.values(RoleName)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
    const permissions =
      roleName === RoleName.SUPER_ADMIN
        ? superAdminPermissions
        : roleName === RoleName.ADMIN
          ? adminPermissions
          : operatorPermissions;
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permission })),
    });
  }

  for (const category of categorySeeds) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, segment: category.segment },
      create: category,
    });
  }

  for (const item of productSeeds) {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: item.category } });
    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        segment: item.segment,
        categoryId: category.id,
        basePrice: item.basePrice,
        previousPrice: item.previousPrice,
        images: [item.image],
        isActive: true,
      },
      create: {
        name: item.name,
        slug: item.slug,
        description: `${item.name}. Una pieza seleccionada con atención a cada detalle para acompañarte por mucho tiempo.`,
        segment: item.segment,
        categoryId: category.id,
        basePrice: item.basePrice,
        previousPrice: item.previousPrice,
        images: [item.image],
        isFeatured: true,
      },
    });
    for (const size of item.sizes) {
      const sku = size ? `${item.sku}-${size}` : item.sku;
      await prisma.productVariant.upsert({
        where: { sku },
        update: { productId: product.id, size },
        create: {
          productId: product.id,
          sku,
          size,
          color: item.segment === Segment.MEN ? "Selección Atelier" : "Selección Atelier",
          stockOnHand: 8,
          stockMin: 2,
        },
      });
    }
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 10) throw new Error("ADMIN_PASSWORD debe tener al menos 10 caracteres.");
    const role = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.SUPER_ADMIN } });
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { email },
      update: { name: "Superadministrador", roleId: role.id, isActive: true, passwordHash },
      create: { name: "Superadministrador", email, roleId: role.id, passwordHash },
    });
    console.info(`Cuenta SuperAdmin lista: ${email}`);
  } else {
    console.info("Catálogo y permisos listos. Define ADMIN_EMAIL y ADMIN_PASSWORD para crear el primer acceso.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
