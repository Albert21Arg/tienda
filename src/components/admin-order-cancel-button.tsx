"use client";

import { Ban, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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

  if (!editing) {
    return (
      <button className="admin-order-cancel-trigger" onClick={() => setEditing(true)} type="button">
        <Ban size={13} /> Cancelar pedido
      </button>
    );
  }

  return (
    <div className="admin-order-cancel">
      <label>
        Motivo para cancelar {orderNumber}
        <input
          autoFocus
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Ej.: Solicitud del cliente"
          value={reason}
        />
      </label>
      {status !== "PENDING_PAYMENT" && <small>Si el pago ya fue recibido, gestiona el reembolso por separado.</small>}
      {error && <span className="form-error" role="alert">{error}</span>}
      <div>
        <button className="admin-order-cancel-confirm" disabled={busy || reason.trim().length < 3} onClick={() => void cancelOrder()} type="button">
          <Ban size={13} /> {busy ? "Cancelando..." : "Confirmar"}
        </button>
        <button aria-label="Cerrar cancelación" className="admin-order-cancel-close" disabled={busy} onClick={() => { setEditing(false); setError(""); }} type="button">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
