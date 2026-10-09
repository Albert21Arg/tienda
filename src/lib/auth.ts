import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { Permission, type RoleName } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "atelier_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

export type Session = { userId: string; role: RoleName; name: string };

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET debe configurarse con al menos 32 caracteres.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(session: Session) {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(sessionSecret());
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    if (
      typeof payload.userId !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.name !== "string" ||
      !["SUPER_ADMIN", "ADMIN", "OPERATOR"].includes(payload.role)
    ) {
      return null;
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, name: true, isActive: true, role: { select: { name: true } } },
    });
    if (!user?.isActive) return null;
    return {
      userId: user.id,
      role: user.role.name,
      name: user.name,
    };
  } catch (error) {
    if (error instanceof Error && error.name.startsWith("JW")) return null;
    throw error;
  }
}

export async function requirePermission(permission: Permission) {
  const session = await getSession();
  if (!session) return { session: null, allowed: false } as const;
  return { session, allowed: await hasPermission(session.role, permission) } as const;
}

export const sessionDurationSeconds = SESSION_DURATION_SECONDS;
