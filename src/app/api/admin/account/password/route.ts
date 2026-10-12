import { compare, hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200),
  confirmPassword: z.string().min(10).max(200),
}).refine((input) => input.newPassword === input.confirmPassword, {
  path: ["confirmPassword"],
  message: "Las contraseñas nuevas no coinciden.",
});

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesión nuevamente." }, { status: 401 });

  const input = changePasswordSchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json({ error: "Verifica que las contraseñas nuevas coincidan y tengan al menos 10 caracteres." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { passwordHash: true },
  });
  if (!user || !(await compare(input.data.currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "La contraseña actual es incorrecta." }, { status: 400 });
  }
  if (await compare(input.data.newPassword, user.passwordHash)) {
    return NextResponse.json({ error: "La nueva contraseña debe ser diferente a la actual." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash: await hash(input.data.newPassword, 12) },
  });
  return NextResponse.json({ ok: true });
}
