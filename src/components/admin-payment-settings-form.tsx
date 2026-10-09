"use client";

import Image from "next/image";
import { ImagePlus, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PaymentSettings } from "@/lib/payment-settings.types";

const MAX_QR_BYTES = 5 * 1024 * 1024;

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
  const [imageUrl, setImageUrl] = useState<string | null>(initialSettings.qrImageUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [instructions, setInstructions] = useState(initialSettings.qrInstructions);
  const [savedInstructions, setSavedInstructions] = useState(initialSettings.qrInstructions);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function selectQr(selected: File | undefined) {
    setError("");
    setSuccess("");
    if (!selected) return;
    if (!["image/png", "image/jpeg"].includes(selected.type)) {
      setError("El QR debe ser una imagen PNG o JPG/JPEG.");
      return;
    }
    if (selected.size > MAX_QR_BYTES) {
      setError("La imagen debe pesar máximo 5 MB.");
      return;
    }
    setPreviewUrl(URL.createObjectURL(selected));
    setFile(selected);
    setRemoveImage(false);
  }

  async function saveSettings() {
    setBusy(true);
    setError("");
    setSuccess("");
    const body = new FormData();
    body.set("qrInstructions", instructions);
    body.set("removeQrImage", String(removeImage));
    if (file) body.set("qrImage", file);
    try {
      const response = await fetch("/api/admin/payment-settings", { method: "PUT", body });
      const result = (await response.json()) as { error?: string; settings?: PaymentSettings };
      if (!response.ok || !result.settings) {
        setError(result.error ?? "No se pudo guardar la configuración de pagos.");
        return;
      }
      setImageUrl(result.settings.qrImageUrl);
      setInstructions(result.settings.qrInstructions);
      setSavedInstructions(result.settings.qrInstructions);
      setFile(null);
      setPreviewUrl(null);
      setRemoveImage(false);
      if (inputRef.current) inputRef.current.value = "";
      setSuccess("La configuración del QR se guardó correctamente.");
    } catch {
      setError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  const displayedImage = previewUrl ?? (removeImage ? null : imageUrl);
  const hasChanges = Boolean(file || removeImage || instructions !== savedInstructions);

  return (
    <div className="admin-payment-settings">
      <div className="payment-setup-notice">
        <strong>Wompi · PSE en preparación · Entorno {wompiSetupStatus.environment === "test" ? "de pruebas" : "de producción"}</strong>
        <p>Wompi/PSE automático seguirá pausado hasta configurar las credenciales del servidor y verificar webhooks firmados. El QR fijo se puede usar para pagos manuales cuando cargues la imagen; cada pedido requerirá verificación en banco desde Pedidos.</p>
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
          <p>Sube el QR de tu cuenta bancaria. Se mostrará al cliente después de crear el pedido y este quedará pendiente hasta verificar el abono.</p>
          <label className="button button-outline payment-qr-upload" htmlFor="payment-qr-image">
            <ImagePlus size={16} /> {imageUrl ? "Cambiar imagen QR" : "Subir imagen QR"}
          </label>
          <input
            ref={inputRef}
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            className="sr-only"
            id="payment-qr-image"
            onChange={(event) => selectQr(event.target.files?.[0])}
            type="file"
          />
          {(imageUrl || file) && !removeImage && (
            <button className="button button-outline payment-qr-remove" onClick={() => { setFile(null); setPreviewUrl(null); setRemoveImage(true); }} type="button">
              <Trash2 size={15} /> Quitar QR
            </button>
          )}
          <label className="payment-qr-instructions">
            Instrucciones para el cliente
            <textarea maxLength={500} onChange={(event) => setInstructions(event.target.value)} placeholder="Ej.: Escanea el QR desde la app de tu banco y conserva el comprobante." value={instructions} />
          </label>
          <span className="payment-qr-help">PNG o JPG/JPEG, máximo 5 MB. La carga no activa el checkout ni confirma pagos automáticamente.</span>
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
