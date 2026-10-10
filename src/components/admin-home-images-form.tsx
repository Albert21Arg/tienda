"use client";

import Image from "next/image";
import { RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_HOME_IMAGES, type HomeImages } from "@/lib/home-images.types";

type ImageField = "women" | "men";
const labels: Record<ImageField, string> = {
  women: "Colección Mujer",
  men: "Colección Hombre",
};

function getPreviewUrl(value: string, fallback: string) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:" ? value : fallback;
  } catch {
    return fallback;
  }
}

export function AdminHomeImagesForm({
  initialImages,
}: {
  initialImages: HomeImages;
}) {
  const router = useRouter();
  const [images, setImages] = useState(initialImages);
  const [savedImages, setSavedImages] = useState(initialImages);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  function changeImage(field: ImageField, value: string) {
    setImages((current) => ({ ...current, [field]: value }));
    setError("");
    setSuccess("");
  }

  function resetImage(field: ImageField) {
    changeImage(field, DEFAULT_HOME_IMAGES[field]);
  }

  async function saveImages() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/home-images", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(images),
      });
      const result = (await response.json()) as {
        error?: string;
        images?: HomeImages;
      };
      if (!response.ok || !result.images) {
        setError(result.error ?? "No se pudieron guardar las imágenes.");
        return;
      }
      setImages(result.images);
      setSavedImages(result.images);
      setSuccess("Las imágenes de la portada se actualizaron.");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  const hasChanges = images.women !== savedImages.women || images.men !== savedImages.men;

  return (
    <div className="home-images-editor">
      <div className="home-image-grid">
        {(["women", "men"] as const).map((field) => (
          <section className="home-image-card" key={field}>
            <div className="home-image-preview">
              <Image
                src={getPreviewUrl(images[field], savedImages[field])}
                alt={`Vista previa: ${labels[field]}`}
                fill
                sizes="(max-width: 700px) 100vw, 45vw"
                unoptimized
              />
            </div>
            <h3>{labels[field]}</h3>
            <p>Imagen del selector principal que lleva a esta colección.</p>
            <div className="home-image-actions">
              <label htmlFor={`home-image-${field}`}>URL de imagen</label>
              <button
                className="button button-outline"
                type="button"
                onClick={() => resetImage(field)}
              >
                <RotateCcw size={15} /> Usar predeterminada
              </button>
            </div>
            <input
              id={`home-image-${field}`}
              type="url"
              value={images[field]}
              maxLength={2048}
              required
              onChange={(event) => changeImage(field, event.target.value)}
              placeholder="https://ejemplo.com/imagen.jpg"
            />
          </section>
        ))}
      </div>
      <p className="brand-help">Pega una URL pública HTTP o HTTPS de la imagen. No se suben ni guardan archivos.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="brand-success" role="status">{success}</p>}
      <button
        className="button button-dark"
        type="button"
        onClick={() => void saveImages()}
        disabled={busy || Boolean(error) || !hasChanges}
      >
        <Save size={15} /> {busy ? "Guardando..." : "Guardar imágenes"}
      </button>
    </div>
  );
}
