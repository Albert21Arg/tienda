"use client";

import Image from "next/image";
import { ImagePlus, RotateCcw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HomeImages } from "@/lib/home-images.types";

type ImageField = "women" | "men";
type ImageState = {
  file: File | null;
  preview: string;
  reset: boolean;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const labels: Record<ImageField, string> = {
  women: "Colección Mujer",
  men: "Colección Hombre",
};

export function AdminHomeImagesForm({
  initialImages,
}: {
  initialImages: HomeImages;
}) {
  const [images, setImages] = useState<Record<ImageField, ImageState>>({
    women: { file: null, preview: initialImages.women, reset: false },
    men: { file: null, preview: initialImages.men, reset: false },
  });
  const previewUrls = useRef<string[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  );

  function selectFile(field: ImageField, file: File | undefined) {
    setError("");
    setSuccess("");
    if (!file) return;
    const allowedTypes = ["image/png", "image/jpeg"];
    if (!allowedTypes.includes(file.type)) {
      setError("Usa una imagen PNG o JPG/JPEG.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Cada imagen debe pesar como máximo 5 MB.");
      return;
    }
    const preview = URL.createObjectURL(file);
    previewUrls.current.push(preview);
    setImages((current) => ({
      ...current,
      [field]: { file, preview, reset: false },
    }));
  }

  function resetImage(field: ImageField) {
    setImages((current) => ({
      ...current,
      [field]: { file: null, preview: "", reset: true },
    }));
  }

  async function saveImages() {
    setBusy(true);
    setError("");
    setSuccess("");
    const formData = new FormData();
    formData.set("resetWomen", String(images.women.reset));
    formData.set("resetMen", String(images.men.reset));
    if (images.women.file) formData.set("womenImage", images.women.file);
    if (images.men.file) formData.set("menImage", images.men.file);

    try {
      const response = await fetch("/api/admin/home-images", {
        method: "PUT",
        body: formData,
      });
      const result = (await response.json()) as {
        error?: string;
        images?: HomeImages;
      };
      if (!response.ok || !result.images) {
        setError(result.error ?? "No se pudieron guardar las imágenes.");
        return;
      }
      setImages({
        women: { file: null, preview: result.images.women, reset: false },
        men: { file: null, preview: result.images.men, reset: false },
      });
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current = [];
      setSuccess("Las imágenes de la portada se actualizaron.");
      window.location.reload();
    } catch {
      setError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="home-images-editor">
      <div className="home-image-grid">
        {(["women", "men"] as const).map((field) => (
          <section className="home-image-card" key={field}>
            <div className="home-image-preview">
              {images[field].preview ? (
                <Image
                  src={images[field].preview}
                  alt={`Vista previa: ${labels[field]}`}
                  fill
                  sizes="(max-width: 700px) 100vw, 45vw"
                  unoptimized
                />
              ) : (
                <span>Se usará la imagen predeterminada</span>
              )}
            </div>
            <h3>{labels[field]}</h3>
            <p>Imagen del selector principal que lleva a esta colección.</p>
            <div className="home-image-actions">
              <label className="button button-outline" htmlFor={`home-image-${field}`}>
                <ImagePlus size={16} /> Cambiar imagen
              </label>
              <input
                className="sr-only"
                id={`home-image-${field}`}
                type="file"
                accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                onChange={(event) => selectFile(field, event.target.files?.[0])}
              />
              <button
                className="button button-outline"
                type="button"
                onClick={() => resetImage(field)}
              >
                <RotateCcw size={15} /> Restaurar
              </button>
            </div>
          </section>
        ))}
      </div>
      <p className="brand-help">Formatos PNG y JPG/JPEG, máximo 5 MB por imagen. Puedes reemplazar una o ambas.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="brand-success" role="status">{success}</p>}
      <button
        className="button button-dark"
        type="button"
        onClick={() => void saveImages()}
        disabled={busy || Boolean(error) || (!images.women.file && !images.men.file && !images.women.reset && !images.men.reset)}
      >
        <Save size={15} /> {busy ? "Guardando..." : "Guardar imágenes"}
      </button>
    </div>
  );
}
