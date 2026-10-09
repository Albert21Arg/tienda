import { Permission, RoleName } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function hasPermission(role: RoleName, permission: Permission) {
  const record = await prisma.role.findUnique({
    where: { name: role },
    select: { permissions: { where: { permission }, select: { permission: true }, take: 1 } },
  });
  return Boolean(record?.permissions.length);
}
