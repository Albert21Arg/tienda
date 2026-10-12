"use client";

import { Ban, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { OrderStatus } from "@prisma/client";

export function AdminOrderCancelButton({
  orderId,
  orderNumber,
  status,
}: {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [editing]);

  async function cancelOrder() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status: "CANCELLED", reason }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "No se pudo cancelar el pedido.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="admin-order-cancel-trigger"
        onClick={() => { setReason(""); setError(""); setEditing(true); }}
        type="button"
      >
        <Ban size={14} /> Cancelar
      </button>
      {editing && (
        <dialog
          aria-labelledby={`cancel-order-title-${orderId}`}
          className="admin-order-cancel-dialog"
          onCancel={(event) => { event.preventDefault(); if (!busy) setEditing(false); }}
          ref={dialogRef}
        >
          <div className="admin-order-cancel-heading">
            <span className="admin-order-cancel-icon"><Ban size={19} /></span>
            <button
              aria-label="Cerrar"
              className="admin-order-cancel-close"
              disabled={busy}
              onClick={() => setEditing(false)}
              type="button"
            >
              <X size={17} />
            </button>
            <span className="eyebrow">GESTIÓN DE PEDIDOS</span>
            <h2 id={`cancel-order-title-${orderId}`}>Cancelar pedido</h2>
            <p>Pedido <strong>{orderNumber}</strong></p>
          </div>
          <div className="admin-order-cancel-content">
            <p>Esta acción cambiará el estado del pedido a cancelado y quedará registrada en la trazabilidad.</p>
            {status !== "PENDING_PAYMENT" && (
              <div className="admin-order-cancel-warning">
                Si el cliente ya pagó, el reembolso debe gestionarse por separado.
              </div>
            )}
            <label>
              Motivo de cancelación
              <textarea
                autoFocus
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ej.: Solicitud del cliente"
                rows={3}
                value={reason}
              />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
          <footer className="admin-order-cancel-footer">
            <button className="button button-light" disabled={busy} onClick={() => setEditing(false)} type="button">Volver</button>
            <button className="admin-order-cancel-confirm" disabled={busy || reason.trim().length < 3} onClick={() => void cancelOrder()} type="button">
              <Ban size={14} /> {busy ? "Cancelando..." : "Sí, cancelar pedido"}
            </button>
          </footer>
        </dialog>
      )}
    </>
  );
}
