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
    <form className="admin-password-form" onSubmit={changePassword}>
      <label>
        <span>Contraseña actual</span>
        <input autoComplete="current-password" maxLength={200} minLength={1} name="currentPassword" required type="password" />
      </label>
      <label>
        <span>Nueva contraseña</span>
        <input autoComplete="new-password" maxLength={200} minLength={10} name="newPassword" required type="password" />
        <small>Mínimo 10 caracteres.</small>
      </label>
      <label>
        <span>Confirma la nueva contraseña</span>
        <input autoComplete="new-password" maxLength={200} minLength={10} name="confirmPassword" required type="password" />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="brand-success" role="status">{success}</p>}
      <button className="button button-dark" disabled={busy} type="submit"><KeyRound size={15} />{busy ? "Actualizando..." : "Guardar nueva contraseña"}</button>
    </form>
  );
}
