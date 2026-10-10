"use client";

import { Save } from "lucide-react";
import { useState } from "react";

export function AdminPricingSettingsForm({ initialMarkupPercent }: { initialMarkupPercent: number }) {
  const [markupPercent, setMarkupPercent] = useState(String(initialMarkupPercent));
  const [savedMarkupPercent, setSavedMarkupPercent] = useState(initialMarkupPercent);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveMarkup() {
    const parsedMarkupPercent = Number(markupPercent);
    if (!Number.isSafeInteger(parsedMarkupPercent) || parsedMarkupPercent < 0 || parsedMarkupPercent > 1000) {
      setError("Ingresa un porcentaje entero entre 0 y 1000.");
      setSuccess("");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/pricing-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markupPercent: parsedMarkupPercent }),
      });
      const result = (await response.json()) as { error?: string; markupPercent?: number };
      if (!response.ok || typeof result.markupPercent !== "number") {
        setError(result.error ?? "No se pudo guardar el porcentaje.");
        return;
      }
      setMarkupPercent(String(result.markupPercent));
      setSavedMarkupPercent(result.markupPercent);
      setSuccess(`Margen predeterminado guardado: ${result.markupPercent}%. Se usará en productos nuevos; los existentes no cambiarán.`);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-pricing-settings">
      <p>Este margen se sumará al valor de creación de cada producto nuevo para calcular su precio de venta. No modifica productos existentes; puedes ajustar el margen de cada uno al editarlo.</p>
      <label htmlFor="default-product-markup">Margen predeterminado (%)</label>
      <div className="admin-pricing-settings-control">
        <input
          id="default-product-markup"
          inputMode="numeric"
          max={1000}
          min={0}
          onChange={(event) => setMarkupPercent(event.target.value)}
          step={1}
          type="number"
          value={markupPercent}
        />
        <span>%</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="brand-success" role="status">{success}</p>}
      <button className="button button-dark" disabled={busy || markupPercent === "" || Number(markupPercent) === savedMarkupPercent} onClick={() => void saveMarkup()} type="button">
        <Save size={15} /> {busy ? "Guardando..." : "Guardar margen"}
      </button>
    </div>
  );
}
