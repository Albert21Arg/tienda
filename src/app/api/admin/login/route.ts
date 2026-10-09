import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, SESSION_COOKIE, sessionDurationSeconds } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const input = loginSchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json({ error: "Revisa tu correo y contraseña." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: input.data.email.toLowerCase() },
    include: { role: true },
  });
  if (!user || !user.isActive || !(await compare(input.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "Credenciales incorrectas." }, { status: 401 });
  }

  const token = await createSessionToken({
    userId: user.id,
    role: user.role.name,
    name: user.name,
  });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: sessionDurationSeconds,
  });
  return response;
}
