"use client";

import { useMemo, useState, type FormEvent } from "react";

type Segment = "MEN" | "WOMEN";
type EditableProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  segment: Segment;
  categoryId: string;
  price: number;
  active: boolean;
};
type Category = { id: string; name: string; segment: Segment | null };

export function AdminProductEditForm({
  product,
  categories,
  onCancel,
}: {
  product: EditableProduct;
  categories: Category[];
  onCancel: () => void;
}) {
  const [segment, setSegment] = useState<Segment>(product.segment);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const segmentCategories = useMemo(
    () => categories.filter((category) => category.segment === segment || category.segment === null),
    [categories, segment],
  );
  const initialCategory = segmentCategories.some(({ id }) => id === product.categoryId)
    ? product.categoryId
    : segmentCategories[0]?.id ?? "";
  const [categoryId, setCategoryId] = useState(initialCategory);

  function changeSegment(nextSegment: Segment) {
    setSegment(nextSegment);
    setCategoryId(
      categories.find((category) => category.segment === nextSegment || category.segment === null)?.id ?? "",
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? "").trim(),
          slug: String(form.get("slug") ?? "").trim(),
          description: String(form.get("description") ?? "").trim(),
          segment,
          categoryId,
          basePrice: Number(form.get("price")),
          imageUrl: String(form.get("image") ?? "").trim(),
          isActive: form.get("active") === "on",
          reason: String(form.get("reason") ?? "").trim(),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "No fue posible guardar los cambios.");
        return;
      }
      window.location.reload();
    } catch {
      setError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-product-form product-edit-form" onSubmit={submit}>
      <label>Nombre<input name="name" defaultValue={product.name} required minLength={2} maxLength={160} /></label>
      <label>Slug<input name="slug" defaultValue={product.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
      <label>Segmento
        <select value={segment} onChange={(event) => changeSegment(event.target.value as Segment)}>
          <option value="WOMEN">Mujer</option>
          <option value="MEN">Hombre</option>
        </select>
      </label>
      <label>Categoría
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
          {segmentCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
        </select>
      </label>
      <label>Precio actual (COP)<input name="price" type="number" min="1" defaultValue={product.price} required /></label>
      <label>URL de imagen principal<input name="image" type="url" defaultValue={product.image} required /></label>
      <label className="wide">Descripción<textarea name="description" defaultValue={product.description} required rows={4} /></label>
      <label className="product-active-toggle">
        <input name="active" type="checkbox" defaultChecked={product.active} />
        Producto activo en la tienda
      </label>
      <label className="wide">Motivo del cambio<input name="reason" required minLength={3} maxLength={500} placeholder="Motivo para el registro de auditoría" /></label>
      {error && <p className="form-error wide" role="alert">{error}</p>}
      <div className="product-edit-actions wide">
        <button className="button button-dark" type="submit" disabled={busy || !categoryId}>
          {busy ? "Guardando..." : "Guardar cambios"}
        </button>
        <button className="button button-outline" type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
