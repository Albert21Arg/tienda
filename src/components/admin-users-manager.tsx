"use client";

import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";

type Operator = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
};

export function AdminUsersManager({ initialUsers }: { initialUsers: Operator[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function createOperator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const result = await response.json() as { error?: string; user?: Operator };
      if (!response.ok || !result.user) {
        setError(result.error ?? "No se pudo crear el operario.");
        return;
      }
      const createdUser = result.user;
      setUsers((current) => [createdUser, ...current]);
      formElement.reset();
      setSuccess(`La cuenta de ${createdUser.name} quedó creada.`);
    } catch {
      setError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-users-layout">
      <section className="admin-section-card admin-user-create">
        <div className="admin-section-heading">
          <div><span className="eyebrow">NUEVA CUENTA</span><h2>Crear operario</h2></div>
        </div>
        <form className="admin-user-form" onSubmit={createOperator}>
          <label>Nombre<input autoComplete="name" name="name" minLength={2} maxLength={100} required /></label>
          <label>Correo electrónico<input autoComplete="email" name="email" type="email" maxLength={254} required /></label>
          <label>Contraseña temporal<input autoComplete="new-password" name="password" type="password" minLength={10} maxLength={200} required /><small>Mínimo 10 caracteres. Compártela de forma segura para que pueda iniciar sesión.</small></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {success && <p className="brand-success" role="status">{success}</p>}
          <button className="button button-dark" type="submit" disabled={busy}><UserPlus size={16} />{busy ? "Creando..." : "Crear operario"}</button>
        </form>
      </section>
      <section className="admin-section-card">
        <div className="admin-section-heading"><div><span className="eyebrow">EQUIPO</span><h2>Cuentas de operario</h2></div><span>{users.length} cuentas</span></div>
        <div className="admin-table-wrap">
          <table className="admin-table admin-users-table">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Estado</th><th>Creado</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td><td>{user.email}</td>
                  <td><span className={`status-pill ${user.isActive ? "status-confirmed" : "status-cancelled"}`}>{user.isActive ? "Activo" : "Inactivo"}</span></td>
                  <td>{new Date(user.createdAt).toLocaleDateString("es-CO")}</td>
                </tr>
              ))}
              {!users.length && <tr><td colSpan={4} className="table-empty">Todavía no hay operarios registrados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
