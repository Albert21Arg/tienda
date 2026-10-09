"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";

export function AdminQrPaymentConfirmButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirmPayment() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/confirm-qr-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "No se pudo confirmar el pago.");
        return;
      }
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="qr-payment-confirm">
      <label>
        Verifica el abono en la cuenta y registra el motivo
        <input
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Ej.: Transferencia recibida y verificada"
          value={reason}
        />
      </label>
      {error && <span className="form-error" role="alert">{error}</span>}
      <button
        className="button button-dark qr-payment-confirm-button"
        disabled={busy || reason.trim().length < 3}
        onClick={() => void confirmPayment()}
        type="button"
      >
        <Check size={14} /> {busy ? "Verificando..." : "Confirmar pago QR"}
      </button>
    </div>
  );
}
