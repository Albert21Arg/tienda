import { Permission } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { getAdminInventoryPage } from "@/lib/admin-inventory.server";

const querySchema = z.object({
  page: z.coerce.number().int().positive().max(100000).default(1),
  query: z.string().trim().max(200).default(""),
  segment: z.enum(["ALL", "MEN", "WOMEN"]).default("ALL"),
  status: z.enum(["ALL", "LOW", "OUT", "AVAILABLE"]).default("ALL"),
});

export async function GET(request: Request) {
  const access = await requirePermission(Permission.INVENTORY_READ);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    page: params.get("page") ?? undefined,
    query: params.get("query") ?? undefined,
    segment: params.get("segment") ?? undefined,
    status: params.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros de búsqueda o paginación inválidos." }, { status: 400 });
  }

  return NextResponse.json(await getAdminInventoryPage(parsed.data));
}
