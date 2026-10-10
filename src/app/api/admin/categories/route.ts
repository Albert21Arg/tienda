import { randomUUID } from "node:crypto";
import { Permission, Prisma, Segment } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(60).refine((value) => slugify(value).length > 0),
  segment: z.nativeEnum(Segment),
});
const deleteCategorySchema = z.object({
  categoryId: z.string().min(1).max(64),
});

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(request: Request) {
  const access = await requirePermission(Permission.CATEGORY_MANAGE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (access.session.role !== "SUPER_ADMIN" || !access.allowed) {
    return NextResponse.json({ error: "Solo SuperAdmin puede crear categorías." }, { status: 403 });
  }

  const input = createCategorySchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json({ error: "Indica una categoría válida y su segmento." }, { status: 400 });
  }
  const { name, segment } = input.data;
  const duplicate = await prisma.category.findFirst({
    where: { name: { equals: name }, segment, parentId: null },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: "Ya existe una categoría con ese nombre para este segmento." }, { status: 409 });
  }

  const slug = `${segment === Segment.MEN ? "hombre" : "mujer"}-${slugify(name)}`;
  try {
    const id = randomUUID();
    const sortOrder = await prisma.category.count({ where: { segment, parentId: null } });
    const [category] = await prisma.$transaction([
      prisma.category.create({
        data: { id, name, slug, segment, sortOrder },
      }),
      prisma.auditLog.create({
        data: {
          actorId: access.session.userId,
          action: "CATEGORY_CREATE",
          entity: "Category",
          entityId: id,
          newValue: {
            name,
            slug,
            segment,
          } satisfies Prisma.InputJsonObject,
          reason: "Creación de categoría por SuperAdmin.",
        },
      }),
    ]);
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ya existe una categoría con un identificador similar." }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: Request) {
  const access = await requirePermission(Permission.CATEGORY_MANAGE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (access.session.role !== "SUPER_ADMIN" || !access.allowed) {
    return NextResponse.json({ error: "Solo SuperAdmin puede eliminar categorías." }, { status: 403 });
  }

  const input = deleteCategorySchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json({ error: "La categoría indicada no es válida." }, { status: 400 });
  }
  const category = await prisma.category.findUnique({
    where: { id: input.data.categoryId },
    include: { _count: { select: { products: true, children: true } } },
  });
  if (!category) return NextResponse.json({ error: "Categoría no encontrada." }, { status: 404 });
  if (category._count.products > 0) {
    return NextResponse.json({
      error: "No se puede eliminar: primero mueve o elimina los productos de esta categoría.",
    }, { status: 409 });
  }
  if (category._count.children > 0) {
    return NextResponse.json({
      error: "No se puede eliminar: primero mueve o elimina las subcategorías.",
    }, { status: 409 });
  }

  try {
    await prisma.$transaction([
      prisma.category.delete({ where: { id: category.id } }),
      prisma.auditLog.create({
        data: {
          actorId: access.session.userId,
          action: "CATEGORY_DELETE",
          entity: "Category",
          entityId: category.id,
          previousValue: {
            name: category.name,
            slug: category.slug,
            segment: category.segment,
          } satisfies Prisma.InputJsonObject,
          newValue: { isDeleted: true },
          reason: "Eliminación de categoría vacía por SuperAdmin.",
        },
      }),
    ]);
    return NextResponse.json({ deleted: true, categoryId: category.id });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({
        error: "No se puede eliminar: la categoría tiene productos o subcategorías asociadas.",
      }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "La categoría ya no existe." }, { status: 404 });
    }
    throw error;
  }
}
