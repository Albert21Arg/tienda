import { NextResponse } from "next/server";
import { Segment } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const segment = searchParams.get("segment");
  if (segment && segment !== "MEN" && segment !== "WOMEN") {
    return NextResponse.json({ error: "Segmento inválido." }, { status: 400 });
  }
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(segment ? { segment: segment === "MEN" ? Segment.MEN : Segment.WOMEN } : {}),
    },
    include: {
      category: { select: { name: true, slug: true } },
      variants: {
        where: { isActive: true },
        select: {
          id: true,
          sku: true,
          color: true,
          size: true,
          priceOverride: true,
          stockOnHand: true,
          stockReserved: true,
          stockMin: true,
        },
      },
    },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ products });
}
