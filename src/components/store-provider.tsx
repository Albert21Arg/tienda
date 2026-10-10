"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ArrowLeft, Check, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import Image from "next/image";
import { formatCOP, type Product } from "@/lib/catalog";
import { DEFAULT_SITE_BRAND, type SiteBrand } from "@/lib/site-brand.types";
import type { PaymentSettings } from "@/lib/payment-settings.types";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/shipping-settings.types";

type CartLine = {
  product: Product;
  quantity: number;
  reservationIds?: string[];
  expiryTimes?: string[];
};
type CheckoutProfile = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  notes: string;
};
type QrOrder = {
  orderNumber: string;
  subtotal: number;
  shippingCost: number;
  total: number;
  qrImageUrl: string;
  instructions: string;
};
type StoreContextValue = {
  count: number;
  add: (product: Product) => Promise<boolean>;
  openCart: () => void;
  brand: SiteBrand;
  updateBrand: (brand: SiteBrand) => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);
const STORAGE_KEY = "atelier-cart-v1";
const EMPTY_CART: CartLine[] = [];
let cachedCart: CartLine[] | null = null;
const cartListeners = new Set<() => void>();

function cartLineKey(product: Product) {
  return product.variantId ? `${product.id}:${product.variantId}` : product.id;
}

function getCartSnapshot() {
  if (cachedCart) return cachedCart;
  if (typeof window === "undefined") return EMPTY_CART;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return (cachedCart = EMPTY_CART);
  try {
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) return (cachedCart = parsed as CartLine[]);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  window.localStorage.removeItem(STORAGE_KEY);
  return (cachedCart = EMPTY_CART);
}

function notifyCartListeners() {
  cartListeners.forEach((listener) => listener());
}

function subscribeToCart(listener: () => void) {
  cartListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cachedCart = null;
    notifyCartListeners();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    cartListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function updateCart(updater: CartLine[] | ((current: CartLine[]) => CartLine[])) {
  const current = getCartSnapshot();
  const next = typeof updater === "function" ? updater(current) : updater;
  if (next === current) return;
  cachedCart = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  notifyCartListeners();
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore debe usarse dentro de StoreProvider");
  return context;
}

export function StoreProvider({
  children,
  initialBrand = DEFAULT_SITE_BRAND,
  initialPaymentSettings,
  initialShippingFee,
}: {
  children: React.ReactNode;
  initialBrand?: SiteBrand;
  initialPaymentSettings: PaymentSettings;
  initialShippingFee: number | null;
}) {
  const lines = useSyncExternalStore(subscribeToCart, getCartSnapshot, () => EMPTY_CART);
  const [brand, setBrand] = useState(initialBrand);
  const [isOpen, setIsOpen] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(0);
  const [checkoutMode, setCheckoutMode] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [qrOrder, setQrOrder] = useState<QrOrder | null>(null);
  const [checkoutProfile, setCheckoutProfile] = useState<CheckoutProfile>({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    notes: "",
  });
  const checkoutIdempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      const current = getCartSnapshot();
      let changed = false;
      const next = current.flatMap((line) => {
        if (!line.product.variantId || !line.expiryTimes?.length) return [line];
        const active = line.expiryTimes
          .map((expiry, index) => ({ expiry, id: line.reservationIds?.[index] }))
          .filter(({ expiry }) => new Date(expiry).getTime() > timestamp);
        if (active.length === line.expiryTimes.length) return [line];
        changed = true;
        const quantity = line.quantity - (line.expiryTimes.length - active.length);
        if (quantity <= 0) return [];
        return [{
          ...line,
          quantity,
          expiryTimes: active.map((item) => item.expiry),
          reservationIds: active.flatMap((item) => item.id ? [item.id] : []),
        }];
      });
      if (changed) updateCart(next);
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const add = useCallback(async (product: Product) => {
    let reservationId: string | undefined;
    let expiresAt: string | undefined;
    if (product.variantId) {
      try {
        const response = await fetch("/api/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variantId: product.variantId, quantity: 1 }),
        });
        const result = (await response.json()) as {
          error?: string;
          reservation?: { id: string; expiresAt: string };
        };
        if (!response.ok || !result.reservation) {
          setNotice(result.error ?? "No fue posible reservar esta unidad.");
          return false;
        }
        reservationId = result.reservation.id;
        expiresAt = result.reservation.expiresAt;
      } catch {
        setNotice("No se pudo conectar con inventario. Intenta nuevamente.");
        return false;
      }
    }
    updateCart((current) => {
      const existing = current.find(
        (line) => line.product.id === product.id && line.product.variantId === product.variantId,
      );
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id && line.product.variantId === product.variantId
            ? {
                ...line,
                quantity: line.quantity + 1,
                reservationIds: reservationId
                  ? [...(line.reservationIds ?? []), reservationId]
                  : line.reservationIds,
                expiryTimes: expiresAt
                  ? [...(line.expiryTimes ?? []), expiresAt]
                  : line.expiryTimes,
              }
            : line,
        );
      }
      return [
        ...current,
        {
          product,
          quantity: 1,
          reservationIds: reservationId ? [reservationId] : [],
          expiryTimes: expiresAt ? [expiresAt] : [],
        },
      ];
    });
    setAddedId(product.id);
    window.setTimeout(() => setAddedId(null), 1800);
    setNotice("");
    return true;
  }, []);

  const closeCart = () => {
    setIsOpen(false);
    if (!qrOrder) {
      setCheckoutMode(false);
      setCheckoutError("");
      checkoutIdempotencyKey.current = null;
    }
  };

  const cancelReservations = async (ids: string[]) => {
    if (!ids.length) return true;
    try {
      const response = await fetch("/api/reservations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationIds: ids }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        setNotice(result.error ?? "No se pudo liberar la reserva.");
        return false;
      }
      return true;
    } catch {
      setNotice("No se pudo conectar con inventario. Intenta nuevamente.");
      return false;
    }
  };

  const removeOne = async (product: Product) => {
    const key = cartLineKey(product);
    const line = lines.find((item) => cartLineKey(item.product) === key);
    if (!line) return;
    const reservationIds = line.reservationIds ?? [];
    const lastReservationId = reservationIds.at(-1);
    if (lastReservationId && !(await cancelReservations([lastReservationId]))) return;
    updateCart((current) =>
      current
        .map((item) =>
          cartLineKey(item.product) === key
            ? {
                ...item,
                quantity: item.quantity - 1,
                reservationIds: reservationIds.slice(0, -1),
                expiryTimes: (item.expiryTimes ?? []).slice(0, -1),
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const remove = async (product: Product) => {
    const key = cartLineKey(product);
    const line = lines.find((item) => cartLineKey(item.product) === key);
    if (!line) return;
    if (!(await cancelReservations(line.reservationIds ?? []))) return;
    updateCart((current) => current.filter((item) => cartLineKey(item.product) !== key));
  };

  const submitQrCheckout = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!checkoutIdempotencyKey.current) checkoutIdempotencyKey.current = crypto.randomUUID();
    setCheckoutBusy(true);
    setCheckoutError("");
    try {
      const response = await fetch("/api/checkout/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...checkoutProfile, idempotencyKey: checkoutIdempotencyKey.current }),
      });
      const result = (await response.json()) as {
        error?: string;
        order?: { orderNumber: string; subtotal: number; shippingCost: number; total: number };
        payment?: { qrImageUrl: string; instructions: string };
      };
      if (!response.ok || !result.order || !result.payment) {
        setCheckoutError(result.error ?? "No se pudo preparar el pago. Intenta nuevamente.");
        return;
      }
      setQrOrder({
        ...result.order,
        qrImageUrl: result.payment.qrImageUrl,
        instructions: result.payment.instructions,
      });
      updateCart([]);
    } catch {
      setCheckoutError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setCheckoutBusy(false);
    }
  };

  const resetCheckout = () => {
    setCheckoutMode(false);
    setCheckoutError("");
    setQrOrder(null);
    checkoutIdempotencyKey.current = null;
  };

  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce(
    (sum, line) => sum + line.product.price * line.quantity,
    0,
  );
  const shippingCost = total >= FREE_SHIPPING_THRESHOLD ? 0 : initialShippingFee;
  const orderTotal = total + (shippingCost ?? 0);

  const contextValue = useMemo(
    () => ({
      count,
      add,
      openCart: () => setIsOpen(true),
      brand,
      updateBrand: setBrand,
    }),
    [count, add, brand],
  );

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
      {(addedId || notice) && (
        <div className="toast" role="status">
          {addedId && <Check size={16} />}
          {notice || "Producto agregado a tu bolsa"}
        </div>
      )}
      {isOpen && (
        <div className="cart-backdrop" onMouseDown={closeCart}>
          <aside
            className="cart-panel"
            aria-label="Tu bolsa de compras"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="cart-heading">
              <div>
                <span className="eyebrow">TU SELECCIÓN</span>
                <h2>Tu bolsa <span>({count})</span></h2>
              </div>
              <button
                className="icon-button"
                aria-label="Cerrar bolsa"
                onClick={closeCart}
              >
                <X size={19} />
              </button>
            </div>
            {qrOrder ? (
              <div className="cart-payment-result">
                <span className="eyebrow">PEDIDO {qrOrder.orderNumber}</span>
                <h3>Escanea el QR para pagar</h3>
                <div className="cart-payment-breakdown">
                  <span>Productos <strong>{formatCOP(qrOrder.subtotal)}</strong></span>
                  <span>Envío <strong>{qrOrder.shippingCost === 0 ? "Gratis" : formatCOP(qrOrder.shippingCost)}</strong></span>
                </div>
                <strong className="cart-payment-total">{formatCOP(qrOrder.total)}</strong>
                <div className="cart-payment-qr">
                  <Image src={qrOrder.qrImageUrl} alt="Código QR para pagar este pedido" fill sizes="(max-width: 450px) 70vw, 280px" unoptimized />
                </div>
                {qrOrder.instructions && <p>{qrOrder.instructions}</p>}
                <p className="cart-payment-reference">Incluye el número de pedido en la referencia de pago. Paga dentro de 24 horas para conservar las unidades. El pedido quedará pendiente mientras verificamos el ingreso en la cuenta.</p>
                <button className="button button-dark button-full" onClick={() => { setIsOpen(false); resetCheckout(); }} type="button">
                  Entendido
                </button>
              </div>
            ) : checkoutMode ? (
              <form className="cart-checkout" onSubmit={(event) => void submitQrCheckout(event)}>
                <button className="cart-checkout-back" onClick={() => { setCheckoutMode(false); setCheckoutError(""); }} type="button">
                  <ArrowLeft size={15} /> Volver a la bolsa
                </button>
                <span className="eyebrow">PAGO SEGURO POR QR</span>
                <h3>Datos de entrega</h3>
                <label>Nombre completo<input autoComplete="name" maxLength={120} onChange={(event) => setCheckoutProfile({ ...checkoutProfile, name: event.target.value })} required value={checkoutProfile.name} /></label>
                <label>Correo electrónico<input autoComplete="email" maxLength={160} onChange={(event) => setCheckoutProfile({ ...checkoutProfile, email: event.target.value })} required type="email" value={checkoutProfile.email} /></label>
                <label>Celular<input autoComplete="tel" maxLength={30} onChange={(event) => setCheckoutProfile({ ...checkoutProfile, phone: event.target.value })} required type="tel" value={checkoutProfile.phone} /></label>
                <label>Dirección de entrega<input autoComplete="street-address" maxLength={240} onChange={(event) => setCheckoutProfile({ ...checkoutProfile, address: event.target.value })} required value={checkoutProfile.address} /></label>
                <label>Ciudad<input autoComplete="address-level2" maxLength={100} onChange={(event) => setCheckoutProfile({ ...checkoutProfile, city: event.target.value })} required value={checkoutProfile.city} /></label>
                <label>Indicaciones adicionales (opcional)<textarea maxLength={500} onChange={(event) => setCheckoutProfile({ ...checkoutProfile, notes: event.target.value })} value={checkoutProfile.notes} /></label>
                {checkoutError && <p className="form-error" role="alert">{checkoutError}</p>}
                <div className="cart-checkout-total"><span>Productos</span><strong>{formatCOP(total)}</strong></div>
                <div className="cart-checkout-total"><span>Envío {total >= FREE_SHIPPING_THRESHOLD ? "(gratis)" : ""}</span><strong>{shippingCost === null ? "Por configurar" : shippingCost === 0 ? "Gratis" : formatCOP(shippingCost)}</strong></div>
                <div className="cart-checkout-total"><span>Total a pagar</span><strong>{formatCOP(orderTotal)}</strong></div>
                <button className="button button-dark button-full" disabled={checkoutBusy || !initialPaymentSettings.qrImageUrl || shippingCost === null} type="submit">
                  {checkoutBusy ? "Preparando pedido..." : "Crear pedido y ver QR"}
                </button>
                {!initialPaymentSettings.qrImageUrl && <p className="cart-checkout-note">El pago por QR todavía no está configurado. Contáctanos para continuar.</p>}
                {shippingCost === null && <p className="cart-checkout-note">La tarifa de envío todavía no está configurada por administración.</p>}
                <p className="cart-checkout-note">El pago se confirmará después de verificarlo en la cuenta bancaria.</p>
              </form>
            ) : lines.length === 0 ? (
              <div className="cart-empty">
                <ShoppingBag size={30} strokeWidth={1.2} />
                <p>Tu bolsa está esperando algo especial.</p>
                <button className="button button-dark" onClick={() => setIsOpen(false)}>
                  Explorar colección
                </button>
              </div>
            ) : (
              <>
                <div className="cart-lines">
                  {lines.map((line) => {
                    const { product, quantity } = line;
                    const selectedVariant = product.variants?.find((variant) => variant.id === product.variantId);
                    const expiry = line.expiryTimes?.[0];
                    const seconds = expiry
                      ? Math.max(0, Math.floor((new Date(expiry).getTime() - now) / 1000))
                      : 0;
                    return (
                    <article className="cart-line" key={cartLineKey(product)}>
                      <Image src={product.image} alt="" width={86} height={108} unoptimized />
                      <div className="cart-line-info">
                        <span>{product.category.split(" · ")[0]}</span>
                        <h3>{product.name}</h3>
                        {product.color && <small>Color: {product.color}</small>}
                        {selectedVariant?.size && <small>Talla: {selectedVariant.size}</small>}
                        <strong>{formatCOP(product.price)}</strong>
                        {product.variantId && expiry && (
                          <small className="reservation-timer">
                            Reserva activa · {`${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`}
                          </small>
                        )}
                        <div className="quantity-control">
                          <button
                            aria-label={`Disminuir ${product.name}`}
                            onClick={() => void removeOne(product)}
                          >
                            <Minus size={13} />
                          </button>
                          <span>{quantity}</span>
                          <button
                            aria-label={`Aumentar ${product.name}`}
                            onClick={() => void add(product)}
                          >
                            <Plus size={13} />
                          </button>
                          <button
                            className="remove-line"
                            aria-label={`Quitar ${product.name}`}
                            onClick={() => void remove(product)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </article>
                    );
                  })}
                </div>
                <div className="cart-footer">
                  <div className="cart-total">
                    <span>Subtotal</span>
                    <strong>{formatCOP(total)}</strong>
                  </div>
                  <div className="cart-total cart-shipping-row">
                    <span>Envío {total >= FREE_SHIPPING_THRESHOLD ? "(gratis)" : ""}</span>
                    <strong>{shippingCost === null ? "Por configurar" : shippingCost === 0 ? "Gratis" : formatCOP(shippingCost)}</strong>
                  </div>
                  <p>{total >= FREE_SHIPPING_THRESHOLD ? "Tu pedido tiene envío gratis." : shippingCost === null ? "La tarifa para pedidos menores a $250.000 está pendiente de configuración." : "Envío gratis en pedidos desde $250.000."}</p>
                  <button className="button button-dark button-full" disabled={!initialPaymentSettings.qrImageUrl || shippingCost === null} onClick={() => { checkoutIdempotencyKey.current = null; setCheckoutMode(true); setCheckoutError(""); }} type="button">
                    Continuar al pago
                  </button>
                  {!initialPaymentSettings.qrImageUrl && <p className="cart-checkout-note">El pago por QR todavía no está configurado.</p>}
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </StoreContext.Provider>
  );
}

export function AddToCartButton({
  product,
  className = "",
  disabled = false,
  onAdded,
}: {
  product: Product;
  className?: string;
  disabled?: boolean;
  onAdded?: () => void;
}) {
  const { add } = useStore();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={`button button-dark ${className}`}
      disabled={busy || disabled}
      onClick={async () => {
        setBusy(true);
        const added = await add(product);
        setBusy(false);
        if (!added) return;
        setDone(true);
        onAdded?.();
        window.setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? <Check size={16} /> : <ShoppingBag size={16} />}
      {busy ? "Reservando..." : done ? "Agregado" : disabled ? "Agotado" : "Agregar a la bolsa"}
    </button>
  );
}
