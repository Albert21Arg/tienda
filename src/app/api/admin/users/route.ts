import { hash } from "bcryptjs";
import { Permission, Prisma, RoleName } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const createOperatorSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(200),
});

export async function POST(request: Request) {
  const access = await requirePermission(Permission.USER_MANAGE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const input = createOperatorSchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json({ error: "Ingresa nombre, correo válido y una contraseña de al menos 10 caracteres." }, { status: 400 });
  }

  const operatorRole = await prisma.role.findUnique({ where: { name: RoleName.OPERATOR } });
  if (!operatorRole) throw new Error("El rol de operador no está configurado.");
  const passwordHash = await hash(input.data.password, 12);

  try {
    const user = await prisma.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          name: input.data.name,
          email: input.data.email,
          passwordHash,
          roleId: operatorRole.id,
        },
        select: { id: true, name: true, email: true, isActive: true, createdAt: true },
      });
      await transaction.auditLog.create({
        data: {
          actorId: access.session.userId,
          action: "USER_OPERATOR_CREATE",
          entity: "User",
          entityId: created.id,
          newValue: {
            name: created.name,
            email: created.email,
            role: RoleName.OPERATOR,
          } satisfies Prisma.InputJsonObject,
          reason: "Creación de cuenta de operador desde el panel administrativo.",
        },
      });
      return created;
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ya existe una cuenta con ese correo." }, { status: 409 });
    }
    throw error;
  }
}
