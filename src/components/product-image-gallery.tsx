"use client";

import Image from "next/image";
import { useState } from "react";

export function ProductImageGallery({
  images,
  name,
  label,
}: {
  images: string[];
  name: string;
  label?: string;
}) {
  const galleryImages = images.length ? images : [""];
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="detail-gallery">
      <div className="detail-photo">
        {galleryImages[activeIndex] && (
          <Image
            src={galleryImages[activeIndex]}
            alt={`${name} · Foto ${activeIndex + 1}`}
            fill
            priority
            sizes="(max-width: 650px) 100vw, 50vw"
            unoptimized
          />
        )}
        {label && <span className="product-badge">{label}</span>}
        {galleryImages.length > 1 && (
          <span className="detail-gallery-count" aria-live="polite">
            {activeIndex + 1} / {galleryImages.length}
          </span>
        )}
      </div>
      {galleryImages.length > 1 && (
        <div className="detail-gallery-thumbnails" role="group" aria-label="Fotos del producto">
          {galleryImages.map((image, index) => (
            <button
              className={index === activeIndex ? "is-active" : ""}
              key={`${image}-${index}`}
              type="button"
              aria-label={`Ver foto ${index + 1} de ${galleryImages.length}`}
              aria-pressed={index === activeIndex}
              onClick={() => setActiveIndex(index)}
            >
              <Image
                src={image}
                alt=""
                fill
                sizes="72px"
                unoptimized
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
