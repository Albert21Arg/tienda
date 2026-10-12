"use client";

import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";

export function AdminPasswordChangeForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: values.get("currentPassword"),
          newPassword: values.get("newPassword"),
          confirmPassword: values.get("confirmPassword"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "No se pudo cambiar la contraseña.");
        return;
      }
      form.reset();
      setSuccess("Tu contraseña se cambió correctamente.");
    } catch {
      setError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-section-card">
      <div className="admin-section-heading">
        <div><span className="eyebrow">SEGURIDAD</span><h2>Cambiar contraseña</h2></div>
      </div>
      <form className="admin-password-form" onSubmit={changePassword}>
        <label>Contraseña actual<input autoComplete="current-password" maxLength={200} minLength={1} name="currentPassword" required type="password" /></label>
        <label>Nueva contraseña<input autoComplete="new-password" maxLength={200} minLength={10} name="newPassword" required type="password" /><small>Usa al menos 10 caracteres.</small></label>
        <label>Confirmar nueva contraseña<input autoComplete="new-password" maxLength={200} minLength={10} name="confirmPassword" required type="password" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {success && <p className="brand-success" role="status">{success}</p>}
        <button className="button button-dark" disabled={busy} type="submit"><KeyRound size={15} />{busy ? "Cambiando..." : "Actualizar contraseña"}</button>
      </form>
    </section>
  );
}
