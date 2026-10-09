"use client";

import { Save } from "lucide-react";
import { useState } from "react";
import { formatCOP } from "@/lib/catalog";

export function AdminShippingFeeForm({ initialFee }: { initialFee: number | null }) {
  const [fee, setFee] = useState(initialFee === null ? "" : String(initialFee));
  const [savedFee, setSavedFee] = useState<number | null>(initialFee);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveFee() {
    const parsedFee = Number(fee);
    if (!Number.isSafeInteger(parsedFee) || parsedFee < 0 || parsedFee > 1_000_000) {
      setError("Ingresa un valor entero entre $0 y $1.000.000.");
      setSuccess("");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/shipping-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fee: parsedFee }),
      });
      const result = (await response.json()) as { error?: string; fee?: number };
      if (!response.ok || typeof result.fee !== "number") {
        setError(result.error ?? "No se pudo guardar la tarifa.");
        return;
      }
      setFee(String(result.fee));
      setSavedFee(result.fee);
      setSuccess(`Tarifa guardada: ${formatCOP(result.fee)}. El envío es gratis desde $250.000.`);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-shipping-fee">
      <p>Esta tarifa se cobra en pedidos menores a $250.000. Desde ese monto, el envío es gratis.</p>
      {savedFee === null && <p className="shipping-fee-unconfigured">Configura una tarifa antes de aceptar pedidos por debajo de $250.000.</p>}
      <label htmlFor="shipping-fee">Tarifa de envío (COP)</label>
      <div className="admin-shipping-fee-control">
        <span>$</span>
        <input
          id="shipping-fee"
          inputMode="numeric"
          max={1_000_000}
          min={0}
          onChange={(event) => setFee(event.target.value)}
          step={1000}
          type="number"
          value={fee}
        />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="brand-success" role="status">{success}</p>}
      <button className="button button-dark" disabled={busy || fee === "" || Number(fee) === savedFee} onClick={() => void saveFee()} type="button">
        <Save size={15} /> {busy ? "Guardando..." : "Guardar tarifa"}
      </button>
    </div>
  );
}
