"use client";

import Image from "next/image";
import { ImagePlus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useStore } from "@/components/store-provider";
import type { SiteBrand } from "@/lib/site-brand.types";

const MAX_LOGO_BYTES = 1024 * 1024;

export function AdminBrandForm({ initialBrand }: { initialBrand: SiteBrand }) {
  const router = useRouter();
  const { brand, updateBrand } = useStore();
  const [name, setName] = useState(initialBrand.name);
  const [tagline, setTagline] = useState(initialBrand.tagline);
  const [announcement, setAnnouncement] = useState(initialBrand.announcement);
  const [contactEmail, setContactEmail] = useState(initialBrand.contactEmail);
  const [contactWhatsApp, setContactWhatsApp] = useState(initialBrand.contactWhatsApp);
  const [contactSchedule, setContactSchedule] = useState(initialBrand.contactSchedule);
  const [shippingReturns, setShippingReturns] = useState(initialBrand.shippingReturns);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(initialBrand.logoUrl);
  const previewObjectUrl = useRef<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
    };
  }, []);

  function onSelectLogo(file: File | undefined) {
    setError("");
    setSuccess("");
    if (!file) return;
    if (file.type !== "image/png" || !file.name.toLowerCase().endsWith(".png")) {
      setError("El logo debe ser una imagen PNG.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("La imagen no puede superar 1 MB.");
      return;
    }
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
    previewObjectUrl.current = URL.createObjectURL(file);
    setLogoPreview(previewObjectUrl.current);
    setLogoFile(file);
    setRemoveLogo(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("tagline", tagline.trim());
    formData.set("announcement", announcement.trim());
    formData.set("contactEmail", contactEmail.trim());
    formData.set("contactWhatsApp", contactWhatsApp.trim());
    formData.set("contactSchedule", contactSchedule.trim());
    formData.set("shippingReturns", shippingReturns.trim());
    formData.set("removeLogo", String(removeLogo));
    if (logoFile) formData.set("logo", logoFile);

    try {
      const response = await fetch("/api/admin/site-brand", {
        method: "PUT",
        body: formData,
      });
      const result = (await response.json()) as { error?: string; brand?: SiteBrand };
      if (!response.ok || !result.brand) {
        setError(result.error ?? "No se pudo guardar la identidad del sitio.");
        return;
      }
      updateBrand(result.brand);
      setName(result.brand.name);
      setTagline(result.brand.tagline);
      setAnnouncement(result.brand.announcement);
      setContactEmail(result.brand.contactEmail);
      setContactWhatsApp(result.brand.contactWhatsApp);
      setContactSchedule(result.brand.contactSchedule);
      setShippingReturns(result.brand.shippingReturns);
      if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
      previewObjectUrl.current = null;
      setLogoFile(null);
      setLogoPreview(result.brand.logoUrl);
      setRemoveLogo(false);
      setSuccess("La identidad del sitio se actualizó correctamente.");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-brand-form" onSubmit={submit}>
      <div className="brand-preview" aria-label="Vista previa de marca">
        <div className="brand-preview-mark">
          {logoPreview ? (
            <Image src={logoPreview} alt={`Logo de ${name || "tu sitio"}`} width={220} height={72} unoptimized />
          ) : (
            <span>{name.trim() || "Nombre del sitio"}<i>.</i></span>
          )}
          <small>{tagline.trim() || "Subtítulo"}</small>
        </div>
        <small>VISTA PREVIA</small>
      </div>
      <label className="admin-brand-label" htmlFor="site-name">Nombre del sitio</label>
      <input
        className="admin-brand-name-input"
        id="site-name"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        minLength={2}
        maxLength={48}
        required
      />
      <p className="brand-help">Este nombre aparecerá en el logo de texto, las pestañas del navegador y el pie de página.</p>
      <label className="admin-brand-label" htmlFor="site-tagline">Texto bajo el nombre</label>
      <input
        className="admin-brand-name-input"
        id="site-tagline"
        name="tagline"
        value={tagline}
        onChange={(event) => setTagline(event.target.value)}
        minLength={2}
        maxLength={60}
        required
      />
      <label className="admin-brand-label" htmlFor="site-announcement">Mensaje superior de la tienda</label>
      <input
        className="admin-brand-name-input"
        id="site-announcement"
        name="announcement"
        value={announcement}
        onChange={(event) => setAnnouncement(event.target.value)}
        minLength={2}
        maxLength={120}
        required
      />
      <p className="brand-help">Aparece en la franja superior del sitio, por ejemplo: «Envío gratis en compras superiores a $250.000 · Colombia».</p>
      <label className="admin-brand-label" htmlFor="contact-email">Correo de contacto</label>
      <input
        className="admin-brand-name-input"
        id="contact-email"
        name="contactEmail"
        type="email"
        value={contactEmail}
        onChange={(event) => setContactEmail(event.target.value)}
        maxLength={160}
        placeholder="hola@tutienda.com"
      />
      <label className="admin-brand-label" htmlFor="contact-whatsapp">WhatsApp de contacto</label>
      <input
        className="admin-brand-name-input"
        id="contact-whatsapp"
        name="contactWhatsApp"
        value={contactWhatsApp}
        onChange={(event) => setContactWhatsApp(event.target.value)}
        maxLength={30}
        placeholder="+57 300 000 0000"
      />
      <label className="admin-brand-label" htmlFor="contact-schedule">Horario de atención</label>
      <textarea
        className="admin-brand-name-input admin-brand-textarea"
        id="contact-schedule"
        name="contactSchedule"
        value={contactSchedule}
        onChange={(event) => setContactSchedule(event.target.value)}
        maxLength={300}
        rows={3}
        placeholder="Lunes a viernes, de 9:00 a. m. a 6:00 p. m."
      />
      <label className="admin-brand-label" htmlFor="shipping-returns">Información de envíos y cambios</label>
      <textarea
        className="admin-brand-name-input admin-brand-textarea"
        id="shipping-returns"
        name="shippingReturns"
        value={shippingReturns}
        onChange={(event) => setShippingReturns(event.target.value)}
        maxLength={4000}
        rows={6}
        placeholder="Describe tiempos, costos de envío y condiciones de cambios o devoluciones."
      />
      <div className="brand-upload-row">
        <label className="button button-outline brand-upload-button" htmlFor="site-logo">
          <ImagePlus size={16} /> Subir logo PNG
        </label>
        <input
          className="sr-only"
          id="site-logo"
          type="file"
          accept="image/png,.png"
          onChange={(event) => onSelectLogo(event.target.files?.[0])}
        />
        <span className="brand-file-name">{logoFile?.name ?? (brand.logoUrl ? "Logo personalizado activo" : "Sin imagen · se usa el nombre")}</span>
        {(logoPreview || logoFile) && (
          <button
            type="button"
            className="button button-outline brand-remove-button"
            onClick={() => {
              if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
              previewObjectUrl.current = null;
              setLogoFile(null);
              setLogoPreview(null);
              setRemoveLogo(true);
            }}
          >
            <Trash2 size={15} /> Quitar logo
          </button>
        )}
      </div>
      <small className="brand-help">PNG, máximo 1 MB. Si no subes logo, se mostrará el nombre como texto.</small>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="brand-success" role="status">{success}</p>}
      <button className="button button-dark" type="submit" disabled={busy || Boolean(error)}>
        <Save size={15} /> {busy ? "Guardando..." : "Guardar identidad"}
      </button>
    </form>
  );
}
