export type Segment = "hombre" | "mujer";

export type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  segment: Segment;
  price: number;
  previousPrice?: number;
  color: string;
  label?: string;
  image: string;
  images?: string[];
  description: string;
  sizes?: string[];
  variantId?: string;
  inventoryConfigured?: boolean;
  variants?: ProductVariant[];
};

export type ProductVariant = {
  id: string;
  color?: string;
  size?: string;
  stockAvailable: number;
};

export const products: Product[] = [
  {
    id: "m-01",
    slug: "chaqueta-urbana",
    name: "Chaqueta urbana",
    category: "Ropa · Edición esencial",
    segment: "hombre",
    price: 289900,
    previousPrice: 359900,
    color: "Negro carbón",
    label: "-19% descuento",
    image:
      "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=1000&q=85",
    description:
      "Una silueta contemporánea, materiales cuidadosamente seleccionados y detalles funcionales para acompañarte todos los días.",
    sizes: ["S", "M", "L", "XL"],
  },
  {
    id: "m-02",
    slug: "reloj-automatico",
    name: "Reloj automático",
    category: "Accesorios · Acero inoxidable",
    segment: "hombre",
    price: 429900,
    color: "Acero / negro",
    label: "Más vendido",
    image:
      "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=1000&q=85",
    description:
      "Un clásico de líneas limpias con acabados en acero y una presencia discreta que no pasa desapercibida.",
  },
  {
    id: "m-03",
    slug: "tenis-minimal",
    name: "Tenis minimal",
    category: "Calzado · Cuero premium",
    segment: "hombre",
    price: 319900,
    color: "Blanco tiza",
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1000&q=85",
    description:
      "Comodidad ligera y diseño versátil. Hechos para moverse contigo del día a la noche.",
    sizes: ["39", "40", "41", "42", "43"],
  },
  {
    id: "m-04",
    slug: "camisa-oxford",
    name: "Camisa Oxford",
    category: "Ropa · Algodón suave",
    segment: "hombre",
    price: 189900,
    color: "Azul noche",
    image:
      "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=1000&q=85",
    description:
      "Una prenda esencial de textura suave y corte relajado, pensada para combinar sin esfuerzo.",
    sizes: ["S", "M", "L", "XL"],
  },
  {
    id: "w-01",
    slug: "bolso-atelier",
    name: "Bolso Atelier",
    category: "Accesorios · Colección Atelier",
    segment: "mujer",
    price: 349900,
    previousPrice: 419900,
    color: "Cereza",
    label: "-17% descuento",
    image:
      "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1000&q=85",
    description:
      "Diseño escultural, tacto suave y el espacio justo para llevar lo que más importa.",
  },
  {
    id: "w-02",
    slug: "serum-luminosidad",
    name: "Sérum luminosidad",
    category: "Belleza · Skin care",
    segment: "mujer",
    price: 129900,
    color: "30 ml",
    label: "Nuevo",
    image:
      "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=1000&q=85",
    description:
      "Una fórmula ligera para sumar luminosidad a tu rutina de cuidado, de mañana o de noche.",
  },
  {
    id: "w-03",
    slug: "vestido-siena",
    name: "Vestido Siena",
    category: "Ropa · Silueta fluida",
    segment: "mujer",
    price: 279900,
    color: "Rosa antiguo",
    image:
      "https://images.unsplash.com/photo-1566206091558-7f218b696731?auto=format&fit=crop&w=1000&q=85",
    description:
      "Movimiento, ligereza y una silueta que celebra la sencillez en cada ocasión.",
    sizes: ["XS", "S", "M", "L"],
  },
  {
    id: "w-04",
    slug: "aretes-orbita",
    name: "Aretes Órbita",
    category: "Accesorios · Acabado dorado",
    segment: "mujer",
    price: 99900,
    color: "Dorado suave",
    image:
      "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=1000&q=85",
    description:
      "Un acento delicado de líneas orgánicas que transforma incluso el conjunto más sencillo.",
  },
];

export const segmentInfo: Record<
  Segment,
  { name: string; eyebrow: string; subtitle: string; image: string }
> = {
  hombre: {
    name: "Hombre",
    eyebrow: "FORMA · FUNCIÓN · CARÁCTER",
    subtitle: "Piezas esenciales para todos los días.",
    image:
      "https://images.unsplash.com/photo-1617137968427-85924c800a22?auto=format&fit=crop&w=2200&q=90",
  },
  mujer: {
    name: "Mujer",
    eyebrow: "DETALLE · ACTITUD · ESENCIA",
    subtitle: "Descubre una forma propia de expresarte.",
    image:
      "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=2200&q=90",
  },
};

export function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function getProduct(slug: string) {
  return products.find((product) => product.slug === slug);
}
