import { Permission } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { getAdminAuditPage } from "@/lib/admin-audit.server";

const querySchema = z.object({
  page: z.coerce.number().int().positive().max(100000).default(1),
  query: z.string().trim().max(200).default(""),
  category: z.enum(["ALL", "INVENTORY", "PRODUCT", "SALES", "USERS", "SETTINGS"]).default("ALL"),
});

export async function GET(request: Request) {
  const access = await requirePermission(Permission.AUDIT_READ);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    page: params.get("page") ?? undefined,
    query: params.get("query") ?? undefined,
    category: params.get("category") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Filtros de auditoría inválidos." }, { status: 400 });
  return NextResponse.json(await getAdminAuditPage(parsed.data));
}
