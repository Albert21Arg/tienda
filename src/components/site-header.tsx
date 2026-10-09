"use client";

import Link from "next/link";
import { Menu, Search, ShoppingBag, X, ArrowRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/components/store-provider";
import { BrandMark } from "@/components/brand-mark";

export function SiteHeader() {
  const { count, openCart, brand } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !menuToggleRef.current?.contains(target) &&
        !mobileNavRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [menuOpen]);

  if (pathname.startsWith("/admin")) return null;
  return (
    <>
      <div className="announcement">
        {brand.announcement}
      </div>
      <header className="site-header">
        <button
          ref={menuToggleRef}
          className="icon-button mobile-menu-toggle"
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <BrandMark />
        <nav className="main-nav" aria-label="Navegación principal">
          <Link href="/tienda/mujer">Mujer</Link>
          <Link href="/tienda/hombre">Hombre</Link>
          <Link href="/#seleccion">Colecciones</Link>
          <Link href="/#historia">Nuestra historia</Link>
        </nav>
        <div className="header-actions">
          <button
            className="icon-button search-toggle"
            aria-label={searchOpen ? "Cerrar búsqueda" : "Buscar"}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            {searchOpen ? <X size={20} /> : <Search size={20} />}
          </button>
          <button
            className="bag-button persistent-cart-button"
            aria-label={`Abrir bolsa, ${count} productos`}
            onClick={openCart}
          >
            <ShoppingBag size={20} style={{ color: "#b42332" }} />
            <span className="bag-label">Bolsa</span>
            <span
              className="bag-count"
              style={{ backgroundColor: "#b42332", color: "#fff" }}
            >
              {count}
            </span>
          </button>
        </div>
      </header>
      {menuOpen && (
        <nav ref={mobileNavRef} className="mobile-nav" aria-label="Menú móvil">
          <Link href="/tienda/mujer" onClick={() => setMenuOpen(false)}>Mujer</Link>
          <Link href="/tienda/hombre" onClick={() => setMenuOpen(false)}>Hombre</Link>
          <Link href="/#seleccion" onClick={() => setMenuOpen(false)}>Colecciones</Link>
          <Link href="/#historia" onClick={() => setMenuOpen(false)}>Nuestra historia</Link>
        </nav>
      )}
      {searchOpen && (
        <form action="/buscar" className="search-panel" key={pathname}>
          <Search size={20} />
          <label className="sr-only" htmlFor="site-search">Buscar productos</label>
          <input id="site-search" name="q" autoFocus placeholder="¿Qué estás buscando?" />
          <button aria-label="Buscar productos"><ArrowRight size={20} /></button>
        </form>
      )}
    </>
  );
}
