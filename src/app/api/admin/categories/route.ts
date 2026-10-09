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
    where: { name: { equals: name, mode: "insensitive" }, segment, parentId: null },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: "Ya existe una categoría con ese nombre para este segmento." }, { status: 409 });
  }

  const slug = `${segment === Segment.MEN ? "hombre" : "mujer"}-${slugify(name)}`;
  try {
    const category = await prisma.$transaction(async (transaction) => {
      const sortOrder = await transaction.category.count({ where: { segment, parentId: null } });
      const created = await transaction.category.create({
        data: { name, slug, segment, sortOrder },
      });
      await transaction.auditLog.create({
        data: {
          actorId: access.session.userId,
          action: "CATEGORY_CREATE",
          entity: "Category",
          entityId: created.id,
          newValue: {
            name: created.name,
            slug: created.slug,
            segment: created.segment,
          } satisfies Prisma.InputJsonObject,
          reason: "Creación de categoría por SuperAdmin.",
        },
      });
      return created;
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ya existe una categoría con un identificador similar." }, { status: 409 });
    }
    throw error;
  }
}
