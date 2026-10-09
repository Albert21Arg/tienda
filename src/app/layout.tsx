import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { StoreProvider } from "@/components/store-provider";
import { getSiteBrand } from "@/lib/site-brand";
import { getPaymentSettings } from "@/lib/payment-settings.server";
import { getShippingFee } from "@/lib/shipping-settings.server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getSiteBrand();
  return {
    title: `${brand.name} — ${brand.tagline}`,
    description: `Descubre las colecciones de ${brand.name}. ${brand.tagline}`,
    applicationName: brand.name,
    icons: brand.logoUrl ? { icon: brand.logoUrl } : undefined,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  const [brand, paymentSettings, shippingFee] = await Promise.all([
    getSiteBrand(),
    getPaymentSettings(),
    getShippingFee(),
  ]);
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <StoreProvider initialBrand={brand} initialPaymentSettings={paymentSettings} initialShippingFee={shippingFee}>
          <SiteHeader />
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}
