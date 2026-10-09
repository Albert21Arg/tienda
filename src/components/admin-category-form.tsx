"use client";

import { FormEvent, useState } from "react";
import { Plus, Save } from "lucide-react";
import { useRouter } from "next/navigation";

type Category = { id: string; name: string; segment: "MEN" | "WOMEN" };

export function AdminCategoryForm({ initialCategories }: { initialCategories: Category[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") ?? ""),
          segment: String(formData.get("segment") ?? ""),
        }),
      });
      const result = (await response.json()) as { error?: string; category?: Category };
      if (!response.ok || !result.category) {
        setError(result.error ?? "No fue posible crear la categoría.");
        return;
      }
      form.reset();
      setSuccess(`Categoría «${result.category.name}» creada para ${result.category.segment === "MEN" ? "Hombre" : "Mujer"}.`);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-category-manager">
      <form className="admin-category-form" onSubmit={submit}>
        <label>
          Nombre de la categoría
          <input name="name" required minLength={2} maxLength={60} placeholder="Ej. Bolsos" />
        </label>
        <label>
          Sección de la tienda
          <select name="segment" required defaultValue="WOMEN">
            <option value="WOMEN">Mujer</option>
            <option value="MEN">Hombre</option>
          </select>
        </label>
        <button className="button button-dark" type="submit" disabled={busy}>
          {busy ? <Save size={15} /> : <Plus size={15} />}
          {busy ? "Guardando..." : "Crear categoría"}
        </button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="brand-success" role="status">{success}</p>}
      <ul className="admin-category-list">
        {initialCategories.map((category) => (
          <li key={category.id}>
            <span>{category.name}</span>
            <small>{category.segment === "MEN" ? "Hombre" : "Mujer"}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
