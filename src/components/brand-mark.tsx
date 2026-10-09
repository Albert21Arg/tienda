"use client";

import Image from "next/image";
import Link from "next/link";
import { useStore } from "@/components/store-provider";

export function BrandMark({ admin = false }: { admin?: boolean }) {
  const { brand } = useStore();
  return (
    <Link className={admin ? "admin-wordmark" : "wordmark"} href="/" aria-label={`${brand.name}, inicio`}>
      {brand.logoUrl ? (
        <Image
          className="brand-logo-image"
          src={brand.logoUrl}
          alt={brand.name}
          width={220}
          height={72}
          unoptimized
          priority
        />
      ) : (
        <>
          {brand.name}<span>.</span>
        </>
      )}
      <small>{admin ? "ADMINISTRACIÓN" : brand.tagline}</small>
    </Link>
  );
}

export function BrandName() {
  const { brand } = useStore();
  return <>{brand.name}</>;
}

export function BrandTagline() {
  const { brand } = useStore();
  return <>{brand.tagline}</>;
}
