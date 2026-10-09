"use client";

import Image from "next/image";
import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EditorialBanners } from "@/lib/editorial-banners.types";

const fields = [
  { key: "mujer", label: "Mujer", preview: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=900&q=85" },
  { key: "hombre", label: "Hombre", preview: "https://images.unsplash.com/photo-1617137968427-85924c800a22?auto=format&fit=crop&w=900&q=85" },
] as const;

type BannerField = keyof EditorialBanners["mujer"];

export function AdminEditorialBannersForm({ initialBanners }: { initialBanners: EditorialBanners }) {
  const [banners, setBanners] = useState(initialBanners);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  function change(field: keyof EditorialBanners, property: BannerField, value: string) {
    setBanners((current) => ({
      ...current,
      [field]: { ...current[field], [property]: value },
    }));
    setError("");
    setSuccess("");
  }

  async function save() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/editorial-banners", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(banners),
      });
      const result = (await response.json()) as { error?: string; banners?: EditorialBanners };
      if (!response.ok || !result.banners) {
        setError(result.error ?? "No se pudieron guardar los banners.");
        return;
      }
      setBanners(result.banners);
      setSuccess("Los banners de Mujer y Hombre se actualizaron.");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="editorial-banners-editor">
      <div className="editorial-banner-form-grid">
        {fields.map(({ key, label, preview }) => {
          const banner = banners[key];
          return (
            <fieldset className="editorial-banner-form-card" key={key}>
              <legend>{label}</legend>
              <div className="editorial-banner-form-preview">
                <Image
                  src={banner.image || preview}
                  alt={`Vista previa del banner de ${label}`}
                  fill
                  sizes="(max-width: 700px) 100vw, 45vw"
                  unoptimized
                />
                <div>
                  <span>{banner.eyebrow}</span>
                  <strong>{banner.title} <i>{banner.accent}</i></strong>
                </div>
              </div>
              <label>
                Texto superior
                <input value={banner.eyebrow} maxLength={60} onChange={(event) => change(key, "eyebrow", event.target.value)} required />
              </label>
              <label>
                Título
                <input value={banner.title} maxLength={80} onChange={(event) => change(key, "title", event.target.value)} required />
              </label>
              <label>
                Frase destacada
                <input value={banner.accent} maxLength={80} onChange={(event) => change(key, "accent", event.target.value)} required />
              </label>
              <label>
                Descripción
                <textarea value={banner.description} maxLength={240} rows={3} onChange={(event) => change(key, "description", event.target.value)} required />
              </label>
              <label>
                URL de imagen (opcional)
                <input type="url" value={banner.image} placeholder="Vacío: usar imagen del catálogo" onChange={(event) => change(key, "image", event.target.value)} />
              </label>
            </fieldset>
          );
        })}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="brand-success" role="status">{success}</p>}
      <button className="button button-dark" type="button" disabled={busy} onClick={() => void save()}>
        <Save size={15} /> {busy ? "Guardando..." : "Guardar banners"}
      </button>
    </div>
  );
}
