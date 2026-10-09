"use client";

import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BrandName } from "@/components/brand-mark";

export function AdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "No fue posible iniciar sesión.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-login-page">
      <div className="admin-login-card">
        <Link className="admin-back-link" href="/"><ArrowLeft size={14} /> Volver a <BrandName /></Link>
        <span className="admin-lock"><LockKeyhole size={19} /></span>
        <span className="eyebrow">ACCESO PRIVADO</span>
        <h1>Bienvenido<br /><i>de vuelta.</i></h1>
        <p>Ingresa a tu espacio de administración <BrandName />.</p>
        <form onSubmit={submit} className="admin-login-form">
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
          <label htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-dark button-full" type="submit" disabled={busy}>
            {busy ? "Validando..." : "Ingresar al panel"}
          </button>
        </form>
        <small>Las cuentas de acceso se crean de forma segura desde el entorno del servidor.</small>
      </div>
    </main>
  );
}
