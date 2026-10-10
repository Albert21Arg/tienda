"use client";

import Image from "next/image";
import { Save, Trash2 } from "lucide-react";
import { useState } from "react";
import type { PaymentSettings } from "@/lib/payment-settings.types";

export function AdminPaymentSettingsForm({
  initialSettings,
  wompiSetupStatus,
}: {
  initialSettings: PaymentSettings;
  wompiSetupStatus: {
    environment: "test" | "production";
    publicKeyConfigured: boolean;
    privateKeyConfigured: boolean;
    eventsSecretConfigured: boolean;
  };
}) {
  const [imageUrl, setImageUrl] = useState(initialSettings.qrImageUrl ?? "");
  const [savedImageUrl, setSavedImageUrl] = useState(initialSettings.qrImageUrl ?? "");
  const [instructions, setInstructions] = useState(initialSettings.qrInstructions);
  const [savedInstructions, setSavedInstructions] = useState(initialSettings.qrInstructions);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveSettings() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/payment-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrImageUrl: imageUrl.trim(), qrInstructions: instructions }),
      });
      const result = (await response.json()) as { error?: string; settings?: PaymentSettings };
      if (!response.ok || !result.settings) {
        setError(result.error ?? "No se pudo guardar la configuración de pagos.");
        return;
      }
      const savedUrl = result.settings.qrImageUrl ?? "";
      setImageUrl(savedUrl);
      setSavedImageUrl(savedUrl);
      setInstructions(result.settings.qrInstructions);
      setSavedInstructions(result.settings.qrInstructions);
      setSuccess("La configuración del QR se guardó correctamente.");
    } catch {
      setError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  const displayedImage = imageUrl.trim() || null;
  const hasChanges = imageUrl !== savedImageUrl || instructions !== savedInstructions;

  return (
    <div className="admin-payment-settings">
      <div className="payment-setup-notice">
        <strong>Wompi · PSE en preparación · Entorno {wompiSetupStatus.environment === "test" ? "de pruebas" : "de producción"}</strong>
        <p>Wompi/PSE automático seguirá pausado hasta configurar las credenciales del servidor y verificar webhooks firmados. El QR fijo se puede usar para pagos manuales cuando ingreses una URL pública; cada pedido requerirá verificación en banco desde Pedidos.</p>
        <ul>
          <li>Llave pública: {wompiSetupStatus.publicKeyConfigured ? "configurada" : "pendiente"}</li>
          <li>Llave privada: {wompiSetupStatus.privateKeyConfigured ? "configurada" : "pendiente"}</li>
          <li>Secreto de eventos: {wompiSetupStatus.eventsSecretConfigured ? "configurado" : "pendiente"}</li>
        </ul>
      </div>
      <div className="payment-qr-editor">
        <div className="payment-qr-preview">
          {displayedImage ? (
            <Image src={displayedImage} alt="Vista previa del código QR de pago" fill sizes="(max-width: 650px) 100vw, 280px" unoptimized />
          ) : (
            <span>Aún no hay un QR cargado</span>
          )}
        </div>
        <div className="payment-qr-fields">
          <p>Ingresa la URL pública de la imagen QR de tu cuenta bancaria. Se mostrará al cliente después de crear el pedido y este quedará pendiente hasta verificar el abono.</p>
          <label className="payment-qr-instructions">
            URL pública de la imagen QR
            <input
              autoComplete="url"
              maxLength={2048}
              onChange={(event) => {
                setImageUrl(event.target.value);
                setError("");
                setSuccess("");
              }}
              placeholder="https://ejemplo.com/mi-qr.png"
              type="url"
              value={imageUrl}
            />
          </label>
          {imageUrl && (
            <button className="button button-outline payment-qr-remove" onClick={() => { setImageUrl(""); setError(""); setSuccess(""); }} type="button">
              <Trash2 size={15} /> Quitar QR
            </button>
          )}
          <label className="payment-qr-instructions">
            Instrucciones para el cliente
            <textarea maxLength={500} onChange={(event) => setInstructions(event.target.value)} placeholder="Ej.: Escanea el QR desde la app de tu banco y conserva el comprobante." value={instructions} />
          </label>
          <span className="payment-qr-help">Usa una URL HTTP o HTTPS accesible públicamente. Guardar el QR no activa el checkout ni confirma pagos automáticamente.</span>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="brand-success" role="status">{success}</p>}
      <button className="button button-dark" disabled={busy || !hasChanges || Boolean(error)} onClick={() => void saveSettings()} type="button">
        <Save size={15} /> {busy ? "Guardando..." : "Guardar configuración"}
      </button>
    </div>
  );
}
